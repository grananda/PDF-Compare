/**
 * Python Bridge Module
 *
 * Handles communication between Node.js and the py-pdf-compare Python package.
 * Manages subprocess spawning, error handling, and result parsing.
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const { getVenvPython, checkSetup } = require('./setup');

/**
 * Default options for Python execution
 */
const DEFAULT_OPTIONS = {
    timeout: 120000, // 2 minutes default timeout
    pythonPath: null, // Auto-detect from venv if null
};

/**
 * Marker printed by pdf_compare.cli when both documents are identical.
 * Must stay in sync with the message in the py-pdf-compare CLI: it is the only
 * signal the subprocess gives us, since it exits 0 either way.
 */
const NO_DIFFERENCES_MARKER = 'No differences found';

/**
 * Page-count snippet. The PDF path is passed via argv rather than interpolated
 * into the source, so paths containing quotes or backslashes stay inert.
 *
 * Imports `pymupdf` in preference to the legacy `fitz` alias: recent PyMuPDF
 * releases print a deprecation warning for `fitz` on *stdout*, which would
 * otherwise land in the middle of the number we are trying to read.
 */
const PAGE_COUNT_SCRIPT = [
    'import sys',
    'try:',
    '    import pymupdf',
    'except ImportError:',
    '    import fitz as pymupdf',
    'with pymupdf.open(sys.argv[1]) as doc:',
    '    print(doc.page_count)'
].join('\n');

/**
 * Execute a Python module with arguments
 * @param {string} moduleName - Python module to run with -m (e.g. 'pdf_compare.cli')
 * @param {string[]} args - Arguments to pass to the module
 * @param {Object} options - Execution options
 * @param {string|null} options.pythonPath - Custom Python path (uses venv if null)
 * @param {number} options.timeout - Timeout in milliseconds
 * @param {string} options.cwd - Working directory
 * @returns {Promise<{stdout: string, stderr: string, code: number}>}
 */
async function executePython(moduleName, args = [], options = {}) {
    const opts = { ...DEFAULT_OPTIONS, ...options };

    // Determine Python path
    let pythonPath = opts.pythonPath;
    if (!pythonPath) {
        const status = checkSetup();
        if (!status.python) {
            throw new Error(
                'Python environment not set up. Run "npx pdf-compare-setup" to configure.'
            );
        }
        pythonPath = status.pythonPath;
    }

    return new Promise((resolve, reject) => {
        const fullArgs = ['-m', moduleName, ...args];
        let timedOut = false;

        const proc = spawn(pythonPath, fullArgs, {
            cwd: opts.cwd || process.cwd(),
            stdio: ['pipe', 'pipe', 'pipe'],
            shell: process.platform === 'win32'
        });

        let stdout = '';
        let stderr = '';

        // Set timeout
        const timer = setTimeout(() => {
            timedOut = true;
            proc.kill('SIGTERM');
            // Force kill after 5 seconds if still running
            setTimeout(() => {
                if (!proc.killed) {
                    proc.kill('SIGKILL');
                }
            }, 5000);
        }, opts.timeout);

        proc.stdout.on('data', (data) => {
            stdout += data.toString();
        });

        proc.stderr.on('data', (data) => {
            stderr += data.toString();
        });

        proc.on('close', (code, signal) => {
            clearTimeout(timer);

            if (timedOut) {
                reject(new Error(`Python script timed out after ${opts.timeout}ms`));
                return;
            }

            // A process killed by a signal reports code === null. Passing it
            // through keeps callers from reading that as a clean exit.
            resolve({
                stdout: stdout.trim(),
                stderr: stderr.trim(),
                code,
                signal
            });
        });

        proc.on('error', (err) => {
            clearTimeout(timer);
            reject(new Error(`Failed to execute Python: ${err.message}`));
        });
    });
}

/**
 * Count the pages of a generated report via PyMuPDF.
 *
 * Best-effort: any failure resolves to null rather than rejecting, so a
 * successful comparison is never lost to a missing page count.
 *
 * @param {string} pythonPath - Python executable to run the snippet with
 * @param {string} pdfPath - Path to the PDF to inspect
 * @param {number} timeout - Timeout in milliseconds
 * @returns {Promise<number|null>}
 */
async function countPdfPages(pythonPath, pdfPath, timeout) {
    return new Promise((resolve) => {
        let proc;
        try {
            proc = spawn(pythonPath, ['-c', PAGE_COUNT_SCRIPT, pdfPath], {
                stdio: ['ignore', 'pipe', 'pipe']
            });
        } catch {
            resolve(null);
            return;
        }

        let out = '';
        let settled = false;

        const settle = (value) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            resolve(value);
        };

        const timer = setTimeout(() => {
            proc.kill('SIGKILL');
            settle(null);
        }, timeout);

        proc.stdout.on('data', (d) => { out += d.toString(); });
        // Drain stderr so a chatty interpreter cannot stall on a full pipe
        proc.stderr.resume();

        proc.on('close', (code) => {
            if (code !== 0) {
                settle(null);
                return;
            }
            // Read the last numeric line rather than the whole output, so any
            // banner an interpreter decides to print on stdout is skipped
            const last = out.trim().split(/\r?\n/).pop().trim();
            settle(/^\d+$/.test(last) ? parseInt(last, 10) : null);
        });
        proc.on('error', () => settle(null));
    });
}

/**
 * Compare two PDFs using the py-pdf-compare package
 * @param {string} fileA - Path to the first PDF file (Original)
 * @param {string} fileB - Path to the second PDF file (Modified)
 * @param {string} outputPath - Path to save the output report
 * @param {Object} options - Comparison options
 * @returns {Promise<{success: boolean, pageCount: number|null, reportPath: string|null, output: string}>}
 */
async function comparePDFs(fileA, fileB, outputPath, options = {}) {
    const opts = { ...DEFAULT_OPTIONS, ...options };

    // Resolve paths to absolute
    const resolvedFileA = path.resolve(fileA);
    const resolvedFileB = path.resolve(fileB);
    const resolvedOutput = path.resolve(outputPath);

    // Validate input files exist
    if (!fs.existsSync(resolvedFileA)) {
        throw new Error(`File not found: ${resolvedFileA}`);
    }
    if (!fs.existsSync(resolvedFileB)) {
        throw new Error(`File not found: ${resolvedFileB}`);
    }

    // Ensure output directory exists
    const outputDir = path.dirname(resolvedOutput);
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }

    // Drop any report left by a previous run. The Python CLI signals "no
    // differences" by not writing the file at all, so a stale one would be
    // handed back as if it were the result of this comparison.
    if (fs.existsSync(resolvedOutput)) {
        fs.unlinkSync(resolvedOutput);
    }

    // Execute comparison via py-pdf-compare package
    const result = await executePython('pdf_compare.cli', [
        resolvedFileA,
        resolvedFileB,
        '-o',
        resolvedOutput
    ], options);

    const combinedOutput = [result.stdout, result.stderr].filter(Boolean).join('\n');

    if (result.signal) {
        throw new Error(`PDF comparison terminated by signal ${result.signal}: ${combinedOutput}`);
    }
    if (result.code !== 0) {
        throw new Error(`PDF comparison failed (exit code ${result.code}): ${combinedOutput}`);
    }

    // Check if output file was created (no file = no differences)
    const outputExists = fs.existsSync(resolvedOutput);
    const noDifferences = combinedOutput.includes(NO_DIFFERENCES_MARKER) || !outputExists;

    // Count pages from the generated PDF via PyMuPDF (best-effort)
    let pageCount = null;
    if (!noDifferences && outputExists) {
        pageCount = await countPdfPages(
            opts.pythonPath || getVenvPython(),
            resolvedOutput,
            opts.timeout
        );
    }

    return {
        success: true,
        pageCount: noDifferences ? 0 : pageCount,
        reportPath: noDifferences ? null : resolvedOutput,
        output: combinedOutput
    };
}

/**
 * Compare two PDFs from Buffer data
 * @param {Buffer} bufferA - First PDF as Buffer
 * @param {Buffer} bufferB - Second PDF as Buffer
 * @param {Object} options - Comparison options
 * @returns {Promise<{success: boolean, pageCount: number|null, reportBuffer: Buffer|null, output: string}>}
 */
async function comparePDFsFromBuffer(bufferA, bufferB, options = {}) {
    const os = require('os');
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pdf-compare-'));

    const tempFileA = path.join(tmpDir, 'input_a.pdf');
    const tempFileB = path.join(tmpDir, 'input_b.pdf');
    const tempOutput = path.join(tmpDir, 'output.pdf');

    try {
        // Write buffers to temp files
        fs.writeFileSync(tempFileA, bufferA);
        fs.writeFileSync(tempFileB, bufferB);

        // Compare
        const result = await comparePDFs(tempFileA, tempFileB, tempOutput, options);

        // Read output if it exists
        let reportBuffer = null;
        if (result.reportPath && fs.existsSync(result.reportPath)) {
            reportBuffer = fs.readFileSync(result.reportPath);
        }

        return {
            success: result.success,
            pageCount: result.pageCount,
            reportBuffer,
            output: result.output
        };

    } finally {
        // Cleanup temp files
        try {
            fs.rmSync(tmpDir, { recursive: true, force: true });
        } catch {
            // Ignore cleanup errors
        }
    }
}

module.exports = {
    executePython,
    countPdfPages,
    comparePDFs,
    comparePDFsFromBuffer,
    DEFAULT_OPTIONS
};

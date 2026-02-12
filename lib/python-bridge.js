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

        proc.on('close', (code) => {
            clearTimeout(timer);

            if (timedOut) {
                reject(new Error(`Python script timed out after ${opts.timeout}ms`));
                return;
            }

            resolve({
                stdout: stdout.trim(),
                stderr: stderr.trim(),
                code: code || 0
            });
        });

        proc.on('error', (err) => {
            clearTimeout(timer);
            reject(new Error(`Failed to execute Python: ${err.message}`));
        });
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

    // Execute comparison via py-pdf-compare package
    const result = await executePython('pdf_compare.cli', [
        resolvedFileA,
        resolvedFileB,
        '-o',
        resolvedOutput
    ], options);

    const combinedOutput = [result.stdout, result.stderr].filter(Boolean).join('\n');

    if (result.code !== 0) {
        throw new Error(`PDF comparison failed (exit code ${result.code}): ${combinedOutput}`);
    }

    // Check if output file was created (no file = no differences)
    const outputExists = fs.existsSync(resolvedOutput);
    const noDifferences = combinedOutput.includes('No visual differences found') || !outputExists;

    // Count pages from the generated PDF via PyMuPDF
    let pageCount = null;
    if (!noDifferences && outputExists) {
        try {
            const pythonPath = options.pythonPath || getVenvPython();
            const script = `import fitz\ndoc = fitz.open(r"${resolvedOutput}")\nprint(len(doc))\ndoc.close()`;
            const countResult = await new Promise((resolve) => {
                const proc = spawn(pythonPath, ['-c', script], {
                    stdio: ['pipe', 'pipe', 'pipe']
                });
                let out = '';
                proc.stdout.on('data', (d) => { out += d.toString(); });
                proc.on('close', () => resolve(out.trim()));
                proc.on('error', () => resolve(null));
            });
            if (countResult && /^\d+$/.test(countResult)) {
                pageCount = parseInt(countResult, 10);
            }
        } catch {
            // Page count is best-effort
        }
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
    comparePDFs,
    comparePDFsFromBuffer,
    DEFAULT_OPTIONS
};

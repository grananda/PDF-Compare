#!/usr/bin/env node

/**
 * Post-install Script for pdf-compare
 *
 * Automatically executed after npm install to:
 * 1. Detect Python 3.12+
 * 2. Create a virtual environment
 * 3. Install Python dependencies
 */

const { setup, MIN_PYTHON_VERSION } = require('../lib/setup');

// Skip setup in CI environments if configured
const SKIP_SETUP = process.env.PDF_COMPARE_SKIP_SETUP === '1' ||
    process.env.PDF_COMPARE_SKIP_SETUP === 'true';

async function postinstall() {
    console.log('\n📦 pdf-compare: Setting up Python environment...\n');

    if (SKIP_SETUP) {
        console.log('⏭️  Skipping automatic setup (PDF_COMPARE_SKIP_SETUP is set)');
        console.log('   Run "npx pdf-compare-setup" manually when ready.\n');
        return;
    }

    try {
        await setup({ quiet: false });

        console.log('\n✅ pdf-compare setup complete!\n');
        console.log('🎉 Ready to use! Try: npx pdf-compare --help\n');

    } catch (error) {
        console.error('\n❌ Setup failed:', error.message);

        if (error.code === 'PYTHON_NOT_FOUND') {
            console.error(`\nPython ${MIN_PYTHON_VERSION.major}.${MIN_PYTHON_VERSION.minor}+ is required.`);
            console.error('Please install Python from https://www.python.org/downloads/\n');
            console.error('After installing Python, run: npx pdf-compare-setup\n');
        } else {
            console.error('\nYou can try manual setup with: npx pdf-compare-setup\n');
        }

        // Don't fail npm install on setup errors - the package is still usable
        // once the user installs Python manually
        process.exit(0);
    }
}

// Run if executed directly
if (require.main === module) {
    postinstall();
}

module.exports = postinstall;

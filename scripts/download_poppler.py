#!/usr/bin/env python3
"""
Downloads Poppler binaries for Windows.
These binaries are required for PDF to image conversion.

Usage:
    uv run python scripts/download_poppler.py
"""

import os
import sys
import urllib.request
import zipfile
import shutil
from pathlib import Path

# Poppler release info
POPPLER_VERSION = "24.08.0-0"
POPPLER_RELEASE = f"poppler-{POPPLER_VERSION}"
POPPLER_URL = f"https://github.com/oschwartz10612/poppler-windows/releases/download/v{POPPLER_VERSION}/Release-{POPPLER_VERSION}.zip"

def download_file(url, dest_path, desc="Downloading"):
    """Download a file with progress indicator."""
    print(f"{desc}: {url}")

    def progress_hook(count, block_size, total_size):
        percent = int(count * block_size * 100 / total_size)
        sys.stdout.write(f"\r  Progress: {percent}%")
        sys.stdout.flush()

    urllib.request.urlretrieve(url, dest_path, progress_hook)
    print()  # New line after progress


def main():
    script_dir = Path(__file__).parent
    project_root = script_dir.parent
    vendor_dir = project_root / "vendor"
    poppler_dir = vendor_dir / "poppler"

    print("=" * 60)
    print("Poppler Downloader for Windows")
    print("=" * 60)

    # Check if already downloaded
    if poppler_dir.exists() and (poppler_dir / "Library" / "bin" / "pdftoppm.exe").exists():
        print(f"\nPoppler already exists at: {poppler_dir}")
        response = input("Re-download? (y/N): ").strip().lower()
        if response != 'y':
            print("Skipping download.")
            return
        shutil.rmtree(poppler_dir)

    # Create vendor directory
    vendor_dir.mkdir(parents=True, exist_ok=True)

    # Download
    zip_path = vendor_dir / "poppler.zip"
    print(f"\n[1/3] Downloading Poppler {POPPLER_VERSION}...")

    try:
        download_file(POPPLER_URL, zip_path)
    except Exception as e:
        print(f"\nError downloading: {e}")
        print("\nManual download instructions:")
        print(f"1. Download from: {POPPLER_URL}")
        print(f"2. Extract to: {poppler_dir}")
        sys.exit(1)

    # Extract
    print(f"\n[2/3] Extracting...")
    with zipfile.ZipFile(zip_path, 'r') as zip_ref:
        zip_ref.extractall(vendor_dir)

    # Find and rename extracted folder
    # The zip might extract to "poppler-X.X.X" or "Release-X.X.X" etc
    extracted_dir = None
    for item in vendor_dir.iterdir():
        if item.is_dir() and item.name.startswith(("poppler", "Release")):
            if (item / "Library" / "bin").exists():
                extracted_dir = item
                break

    if extracted_dir and extracted_dir != poppler_dir:
        if poppler_dir.exists():
            shutil.rmtree(poppler_dir)
        extracted_dir.rename(poppler_dir)

    # Cleanup
    print(f"\n[3/3] Cleaning up...")
    zip_path.unlink()

    # Verify
    pdftoppm = poppler_dir / "Library" / "bin" / "pdftoppm.exe"
    if pdftoppm.exists():
        print("\n" + "=" * 60)
        print("SUCCESS!")
        print("=" * 60)
        print(f"\nPoppler installed at: {poppler_dir}")
        print(f"Binary location: {poppler_dir / 'Library' / 'bin'}")
        print("\nYou can now build the standalone executable:")
        print("  uv run python build_exe.py")
    else:
        print("\nError: Poppler binaries not found after extraction")
        sys.exit(1)


if __name__ == "__main__":
    main()

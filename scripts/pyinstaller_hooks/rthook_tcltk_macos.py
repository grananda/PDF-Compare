"""
Runtime hook for PyInstaller to set up Tcl/Tk library paths on macOS.
This ensures the Tcl/Tk shared libraries can be found at runtime.
"""
import os
import sys
import ctypes

# Get the directory where PyInstaller extracts files
if getattr(sys, 'frozen', False):
    # Running as compiled executable
    bundle_dir = sys._MEIPASS

    # Set TCL/TK library paths BEFORE importing tkinter
    tcl_dir = os.path.join(bundle_dir, 'tcl9.0')
    tk_dir = os.path.join(bundle_dir, 'tk9.0')

    if os.path.isdir(tcl_dir):
        os.environ['TCL_LIBRARY'] = tcl_dir
    if os.path.isdir(tk_dir):
        os.environ['TK_LIBRARY'] = tk_dir

    # Preload Tcl/Tk shared libraries using ctypes
    # macOS uses .dylib extension for dynamic libraries
    tcl_lib = os.path.join(bundle_dir, 'libtcl9.0.dylib')
    tk_lib = os.path.join(bundle_dir, 'libtcl9tk9.0.dylib')

    # Fallback to older naming if needed
    if not os.path.exists(tcl_lib):
        tcl_lib = os.path.join(bundle_dir, 'libtcl8.6.dylib')
    if not os.path.exists(tk_lib):
        tk_lib = os.path.join(bundle_dir, 'libtk8.6.dylib')

    if os.path.exists(tcl_lib):
        ctypes.CDLL(tcl_lib, mode=ctypes.RTLD_GLOBAL)
    if os.path.exists(tk_lib):
        ctypes.CDLL(tk_lib, mode=ctypes.RTLD_GLOBAL)
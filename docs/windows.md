# Installing the Mbed Simulator for Windows

This guide shows how to install the Mbed Simulator on Windows. This guide was tested on a 64-bit version of Windows 7.

## Prerequisites

1. Install [Python 2.7](https://www.python.org/downloads/windows/) - **not Python 3!**.
1. Install [Git](https://git-scm.com/).
1. Install [Mercurial](https://www.mercurial-scm.org/wiki/Download).
1. Install [Node.js](https://nodejs.org/en/) v8 or higher.

Make sure that all of these are in your PATH. Verify this by opening a command prompt, and run:

```
$ where node
C:\Program Files\nodejs2\node.exe

$ where git
C:\Program Files\Git\cmd\git.exe

$ where hg
C:\Program Files\TortoiseHg\hg.exe
```

If one of the `where` commands does not yield a path, the utility is not in your PATH.

## Installing Emscripten

To install the Emscripten cross-compilation toolchain, open a command prompt and:

1. Clone the repository and install SDK version 1.38.21:

    ```
    $ git clone https://github.com/emscripten-core/emsdk.git
    $ cd emsdk
    $ emsdk install sdk-1.38.21-64bit
    $ emsdk activate sdk-1.38.21-64bit
    $ emsdk_env.bat --global
    ```

1. Verify that the installation was successful:

    ```
    $ emcc -v
    emcc (Emscripten gcc/clang-like replacement + linker emulating GNU ld) 1.38.21
    ```

1. Find the folder where emcc was installed:

    ```
    $ where emcc
    C:\simulator\emsdk\emscripten\1.38.21\emcc
    ```

1. Add this folder to your PATH:
    * Go to **System Properties > Advanced > Environmental variables**.
    * Find `PATH`.
    * Add the folder you found in the previous step, and add it prefixed by `;`. E.g.: `;C:\simulator\emsdk\emscripten\1.38.21\`

1. Open a new command prompt and verify that `emcc` can still be found by running

    ```
    $ where emcc
    C:\simulator\emsdk\emscripten\1.38.21\emcc
    ```

1. All set!

## Installing the Mbed simulator

1. Install the simulator through git:

    ```
    $ git clone https://github.com/janjongboom/mbed-simulator.git
    $ cd mbed-simulator
    $ npm install
    $ npm install . -g
    ```

1. Build your first example:

    ```
    $ node cli.js -i demos\blinky -o out
    ```

    Note that this will download all dependencies (including Mbed OS) and will build the common `libmbed` library so this'll take some time.

1. Done! The Mbed Simulator should now launch in your default browser.

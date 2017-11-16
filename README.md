# Experimental simulator for Mbed OS 5 applications

Ideas:

* Cross-compile Mbed OS applications with Emscripten.
* Use a custom C++ HAL which maps into JavaScript HAL.
* JavaScript HAL renders UI (board and components), similar to [mbed-js-simulator](https://github.com/janjongboom/mbed-js-simulator).
* Communication with node.js backend for more complex simulations - such as HTTP, BLE (where the computer is a real BLE peripheral) and Mbed Cloud simulation.

This is a very experimental project.

## How to run blinky

1. Install a recent version of node.js.
1. Install the [Emscripten SDK](http://kripken.github.io/emscripten-site/docs/getting_started/downloads.html) - and make sure `emcc` is in your PATH.
1. Run:

    ```
    $ node build.js emcc demos/blinky
    ```

1. Then, navigate to the `out` folder, and start a web server:

    ```
    $ cd demos/blinky/out/
    $ python -m SimpleHTTPServer
    ```

1. Open http://localhost:8000/blinky.html in your browser.
1. Blinky runs!

## Attribution

* `viewer/img/controller_mbed.svg` - created by [Fritzing](https://github.com/fritzing/fritzing-parts), licensed under Creative Commons Attribution-ShareALike 3.0 Unported.

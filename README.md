# Experimental simulator for Mbed OS 5 applications

**Demo: http://ec2-52-211-146-247.eu-west-1.compute.amazonaws.com:7829**

![Screenshot](img/simulator.png)

Ideas:

* Cross-compile Mbed OS applications with Emscripten.
* Use a custom C++ HAL - based on Mbed OS C++ HAL - which maps into JavaScript HAL. Similar to how Mbed OS C++ HAL maps into Mbed C HAL.
* JavaScript HAL renders UI (board and components), similar to [mbed-js-simulator](https://github.com/janjongboom/mbed-js-simulator).
* Communication with node.js backend for more complex simulations - such as HTTP, BLE (where the computer is a real BLE peripheral) and Mbed Cloud simulation.

This is a very experimental project.

## Architecture

The C++ HAL is in `mbed-simulator-hal`. This HAL reflects the Mbed C++ HAL, with most header- and source files exactly the same as their Mbed OS counterparts. The C++ HAL maps into the JS HAL (in `targets`), which implements the Mbed C API for compatibility.

The JS HAL lives in `viewer/js-hal`, and dispatches events around between JS UI components and C++ HAL. It implements an event bus to let the UI subscribe to events from C++. For instance, see `js-hal/gpio.js` for GPIO and IRQ handling.

UI lives in `viewer/js-ui`, and handles UI events, and only communicates with JS HAL.

Device features need to be enabled in `targets/TARGET_SIMULATOR/device.h`.

## How to run blinky (or other demo's)

1. Install a recent version of node.js.
1. Install the [Emscripten SDK](http://kripken.github.io/emscripten-site/docs/getting_started/downloads.html) - and make sure `emcc` is in your PATH.
1. Run:

    ```
    # resolve all C++ dependencies
    $ mbed deploy

    # resolve all JS dependencies
    $ npm install

    # build the shared libmbed library (to speed up future compilations)
    $ node build-libmbed.js
    ```

1. Then, start a web server:

    ```
    $ node server/server.js
    ```

1. Open http://localhost:7829 in your browser.
1. Blinky runs!

## Changing mbed-simulator-hal

After changing anything in the simulator HAL, you need to recompile the libmbed library:

1. Run:

    ```
    $ node build-libmbed.js
    ```

## Updating demo's

In the `out` folder a number of pre-built demos are listed. To upgrade them:

```
$ sh build-demos.sh
```

## Attribution

* `viewer/img/controller_mbed.svg` - created by [Fritzing](https://github.com/fritzing/fritzing-parts), licensed under Creative Commons Attribution-ShareALike 3.0 Unported.
* Thermometer by https://codepen.io/mirceageorgescu/pen/Ceylz. Licensed under MIT.

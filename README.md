# Experimental simulator for Mbed OS 5 applications

**Demo: https://labs.mbed.com/simulator**

![Screenshot](https://os.mbed.com/media/uploads/janjongboom/simulator2.png)

While we have worked hard to improve embedded development tooling in Mbed (e.g. via the Online Compiler), the development for microcontrollers is still very similar to how it was in the 90s. Compilation is slow, and flashing is even slower. When fixing a bug, you need to get the device into the exact state as before encountering the bug. This makes for a very slow feedback loop, which hinders productivity and often pulls you out of the zone.

To make this feedback loop much shorter, we're releasing an alpha version of the Mbed Simulator. The simulator allows you to run your Mbed OS 5 applications directly on your computer, so that you can quickly test and verify applications without flashing them on a real board. This is a valuable learning tool, as you quickly learn how Mbed works. It is also very useful for developing complex applications. Within Arm, we have been using the simulator for work on [mbed-http](https://os.mbed.com/teams/sandbox/code/mbed-http/), the Mbed LoRaWAN stack and [uTensor](http://utensor.ai/).

**Note:** The Mbed Simulator is part of [Mbed Labs](https://labs.mbed.com/). The Mbed Labs projects showcase interesting side projects developed by Mbed engineers. However, these projects are not actively supported by Arm, and may be added, removed or break at any time.

[More information in the introductionary blog post](https://os.mbed.com/blog/entry/introducing-mbed-simulator/)

## Docs

* Installation, see below.
* [Configuration and compiler options](docs/simconfig.md)
* [Peripherals](docs/peripherals.md)
* [File systems and block devices](docs/fs.md)
* [Pelion Device Management](docs/pelion.md)
* [Debugging](docs/debugging.md)
* [Architecture](docs/architecture.md)

## How to run the hosted version

1. Install a recent version of node.js.
1. Install Mbed CLI.
1. Install the [Emscripten SDK v1.38.15](http://kripken.github.io/emscripten-site/docs/getting_started/downloads.html) - and make sure `emcc` is in your PATH.
1. Run:

    ```
    $ npm install
    $ sh build-demos.sh
    ```

1. Then, start a web server:

    ```
    $ node server.js
    ```

1. Open http://localhost:7829 in your browser.
1. Blinky runs!

## CLI

The simulator comes with a CLI to run any Mbed OS 5 project under the simulator.

**Installation**

1. Install a recent version of node.js.
1. Install Mbed CLI.
1. Install the [Emscripten SDK v1.38.15](http://kripken.github.io/emscripten-site/docs/getting_started/downloads.html) - and make sure `emcc` is in your PATH.

Then, install the simulator via:

```
$ npm install mbed-simulator -g
```

Or if you cloned the project, via:

```
$ npm install /path/to/simulator -g
```

This will create a new `mbed-simulator` binary somewhere in your PATH.

**Running**

Then run from an Mbed OS 5 project:

```
$ mbed-simulator .
```

The project will build and a web browser window will open for you.

To see if your program runs in the simulator, check the `TARGET_SIMULATOR` macro.

## Changing mbed-simulator-hal

After changing anything in the simulator HAL, you need to recompile the libmbed library:

1. Run:

    ```
    $ rm mbed-simulator-hal/libmbed.bc
    ```

1. Rebuild your application. libmbed will automatically be generated.

## Updating demo's

In the `out` folder a number of pre-built demos are listed. To upgrade them:

**macOS and Linux**

```
$ sh build-demos.sh
```

**Windows**

```
$ build-demos.bat
```

## Attribution

* `viewer/img/controller_mbed.svg` - created by [Fritzing](https://github.com/fritzing/fritzing-parts), licensed under Creative Commons Attribution-ShareALike 3.0 Unported.
* Thermometer by https://codepen.io/mirceageorgescu/pen/Ceylz. Licensed under MIT.
* LED icons from https://pixabay.com/en/led-icon-logo-business-light-1715226/, Licensed under CC0 Creative Commons.

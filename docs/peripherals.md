# Peripherals

## Loading peripherals

The simulator comes with peripherals (such as LCD displays, LEDs, etc.). To load these for your project add a `peripherals` section to your [simconfig](simconfig.md) file. You can pass in the pin names via `"PinNames.p5"`, these will be automatically resolved on startup. Note that you can change the peripheral config at runtime by clicking **Add component**. This is then cached by the browser. To clean the cache run `sessionStorage.removeItem('model-dirty')` from your browsers console.

## Adding new peripherals

For an example of how a peripheral looks like, see `mbed-simulator-hal/peripherals/Sht31`.

A peripheral consists of a C++ implementation, a JS HAL file and a JS UI file. Peripherals in the `mbed-simulator-hal/peripherals` folder are automatically picked up at compile time. In your own project you can add a section to [simconfig](simconfig.md):

```json
    "components": {
        "jshal": [
            "./ui/js-hal.js"
        ],
        "jsui": [
            "./ui/js-ui.js"
        ]
    }
```

The C++ component is automatically picked up. The JS files are loaded when you run the project. Note that all `jshal` and `jsui` files will be copied to the BUILD directory, so to change things on the fly, edit those files (or create a symlink).

You can communicate between C++ and JS through `ES_ASM` macros (C++ -> JS), or via `ccall` (JS -> C++). See the components that ship with the simulator for examples.

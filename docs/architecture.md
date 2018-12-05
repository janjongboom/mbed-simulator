# Architecture

The C++ HAL is in `mbed-simulator-hal`. This HAL uses a fork of Mbed OS 5.10.2 (living here: [#mbed-os-5.10-simulator](https://github.com/janjongboom/mbed-os/tree/mbed-os-5.10-simulator)), where a new target was added (`TARGET_SIMULATOR`) similar to physical targets. The target handles calls coming in from the Mbed C++ HAL and passes them through to the JS HAL.

The JS HAL lives in `viewer/js-hal`, and dispatches events around between JS UI components and C++ HAL. It implements an event bus to let the UI subscribe to events from C++. For instance, see `js-hal/gpio.js` for GPIO and IRQ handling.

UI lives in `viewer/js-ui`, and handles UI events, and only communicates with JS HAL.

Device features need to be enabled in `targets/TARGET_SIMULATOR/device.h`.

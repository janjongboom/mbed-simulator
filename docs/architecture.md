# Architecture

Large parts of the Mbed OS API are generic between targets. This includes the GPIO layers, IP4/IPV6 networking stacks, and communication libraries like CoAP or LoRaWAN. Target-specific code, such as which registers to write to when toggling a GPIO pin, are implemented using the Mbed C HAL. The simulator uses the same approach, implementing a new target (`TARGET_SIMULATOR`) that implements the Mbed C HAL which passes events through to a JavaScript HAL. Then the UI subscribes to these events, and updates the simulator accordingly.

If you take a `DigitalOut` element, the flow goes like this:

```
User App -> DigitalOut.cpp (C++ API) -> gpio_api.c (C HAL) -> gpio.js (JS HAL) -> led.js (JS UI)
```

The C/C++ parts are in `mbed-simulator-hal`. This uses a fork of Mbed OS 5.10.2 (living here: [#mbed-os-5.10-simulator](https://github.com/janjongboom/mbed-os/tree/mbed-os-5.10-simulator)), where a new target was added (`TARGET_SIMULATOR`). In the long run this should be main-lined into core Mbed OS.

The JS HAL lives in `viewer/js-hal`, and dispatches events around between JS UI components and C++ HAL. It implements an event bus to let the UI subscribe to events from C++. For instance, see `js-hal/gpio.js` for GPIO and IRQ handling.

UI lives in `viewer/js-ui`, and handles UI events, and only communicates with JS HAL.

Device features need to be enabled in `targets/TARGET_SIMULATOR/device.h`.

## Network proxy

The simulator implements two features which cannot be simulated by the browser alone:

* The `NetworkInterface` API, the generic IP networking interface for Mbed OS. This allows opening UDP and TCP sockets, which is not allowed in the browser.
* The LoRaWAN API. Messages from the LoRaWAN stack are sent to a network server using the Semtech UDP protocol, which is not allowed from the browser.

For these usecases a network proxy is implemented in `server/launch-server.js`. This network proxy allows opening raw UDP and TCP sockets, and relaying LoRaWAN messages. The proxy can be accessed over HTTP and through Web Sockets. See `viewer/js-hal/network.js` and `viewer/js-hal/lora.js` for the JS HAL, and `mbed-simulator-hal/easy-connect` `mbed-simulator-hal/lora-radio-drv` for the C++ HAL.

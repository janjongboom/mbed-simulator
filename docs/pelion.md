# Pelion Device Management

The simulator has support for [Pelion Device Management](https://cloud.mbed.com), but because the Pelion Client normally requires RTOS support you'll need to make some adjustments to your application. Pelion support is currently not available in the hosted version of the simulator as the client requires a certificate, for which there is no UI available right now. The simulator is hard-coded to use developer mode. You can see the build flags in `build-tools/helpers.js` to override this behavior.

Note that building currently takes quite a long time, up to a minute on a 2017 Macbook Pro.

## Building the demo application

To build the application you need a developer certificate.

1. If you don't have an account for Pelion Device Management, [follow the steps here](https://cloud.mbed.com/guides/connect-device-to-pelion).
1. Log in to the [portal](https://portal.mbedcloud.com/).
1. Go to **Device identity > Certificates**.
1. Click **New certificate**.
1. Click **Create a developer certificate**.
1. Follow the wizard.
1. Store the `mbed_cloud_dev_credentials.c` file in `demos/peliondm`.

Now build the application via:

```
$ node cli.js -i demos/peliondm -o out --compiler-opts "-Os" --launch
```

## Application changes required

The Pelion Client uses the `mbed_event_queue()` for a number of operations, which runs in a separate thread in Mbed OS. In addition the client spins up a thread for its own scheduling. Because the simulator runs in a single thread this is not possible, and we need to run all of these actions on the same thread. In your application you need to add the following lines to your `main` function:

```cpp
    // Run the Pelion Client scheduler on the main event queue
    mbed_event_queue()->call_every(1, &eventOS_scheduler_run_until_idle);

    // Process events forever
    mbed_event_queue()->dispatch_forever();
```

Note that this will run forever. If you need an event queue to schedule things yourself use `mbed_event_queue()` instead of creating your own new queue.

## Clearing identity

The simulator goes through the provisioning flow the first time it connects to the network. After this the device identity is stored on the [peristent file system](fs.md), so the same identity is preserved even when the page is refreshed. To clear the file system (and re-run the provisioning flow), open your browsers console, and run:

```js
window.MbedJSHal.clearIdbfs();
```

## Firmware updates

The update client is loaded, but this functionality is not tested.

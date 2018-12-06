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

**Constructor**

The constructor has two arguments, instead of three. You no longer need to pass in a `FileSystem` object as the third argument.

```cpp
#include "simple-mbed-cloud-client.h"
#include "SimulatorBlockDevice.h"

// declare simulated block device, will be used to store firmware fragments
SimulatorBlockDevice bd("myblockdevice", 128 * 512, 512);

int main() {
    // get network interface
    NetworkInterface *net = NetworkInterface::get_default_instance();
    nsapi_error_t status = net->connect();

#ifdef TARGET_SIMULATOR
    SimpleMbedCloudClient client(net, &bd);
#else
    SimpleMbedCloudClient client(net, &bd, &fs);
#endif
```

**Queues**

The Pelion Client uses the `mbed_event_queue()` for a number of operations, which runs in a separate thread in Mbed OS. In addition the client spins up a thread for its own scheduling. Because the simulator runs in a single thread this is not possible, and we need to run all of these actions on the same thread. In your application you need to add the following lines to your `main` function:

```cpp
#include "eventOS_scheduler.h"

/* snip */

    // Run the Pelion Client scheduler on the main event queue
    mbed_event_queue()->call_every(1, &eventOS_scheduler_run_until_idle);

    // Process events forever
    mbed_event_queue()->dispatch_forever();
```

Note that this will run forever. If you need an event queue to schedule things yourself use `mbed_event_queue()` instead of creating your own new queue.

**PAL Mount point**

You need to set the PAL file system mount point to a folder on the [persistent file system](fs.md), so under `/IDBFS`. If you don't declare this macro then it's set automatically.

Otherwise, in your `mbed_app.json` file specify:

```json
"PAL_FS_MOUNT_POINT_PRIMARY=\"/IDBFS/pal\""
```

## Running via CLI

If you changed the above, then no further changes are required. Make sure you have a developer certificate in your application and run:

```
$ mbed-simulator .
```

Note that you might need to set ignore paths in your [simconfig](simconfig.md) file if you use an application that can be compiled for multiple operating systems. Simple Cloud Client example should work without this.

## Clearing identity

The simulator goes through the provisioning flow the first time it connects to the network. After this the device identity is stored on the [peristent file system](fs.md), so the same identity is preserved even when the page is refreshed. To clear the file system (and re-run the provisioning flow), open your browsers console, and run:

```js
window.MbedJSHal.clearIdbfs();
```

## Firmware updates

The update client is loaded, but this functionality is not tested.

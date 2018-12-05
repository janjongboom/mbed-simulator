# File systems and block devices

Mbed OS allows you to load external flash through the [block device API](https://www.google.com/search?q=block+device+mbed&ie=utf-8&oe=utf-8&client=firefox-b-ab), then mount a file system to the block device. The simulator supports a simulated block device, but does not support mounting a file system to this device. There is a file system mounted automatically, but you need to manually persist the file system, see below for details.

## Block device API

The simulator's block device persists its data to the browser's [local storage](https://developer.mozilla.org/en-US/docs/Web/API/Window/localStorage). Thus, data is persisted between page loads. The first argument to the constructor specifies the name of the cache. By changing the name you thus creata fresh block device without erasing the previous content. Because local storage only supports strings, the block device is serialized, making operations relatively inefficient (and taking up twice as much space).

**Example**

```cpp
#include "SimulatorBlockDevice.h"

// arguments: name of the block device, total storage, page size
SimulatorBlockDevice bd("myblockdevice", 128 * 512, 512);

// read first page, note that all operations must be page aligned
char buffer[512];
bd.read(buffer, 0, 512);    // make sure to check the return value

// write something back
buffer[1] = 0xff;
bd.program(buffer, 0, 512);
```

## File system

A file system is automatically mounted under `/` and you can use standard POSIX calls (`fopen`, `fread`, etc.) without any configuration. However, this file system is not persisted throughout page refreshes. A persistent file system is mounted under `/IDBFS` but you need to manually persist it.

To persist the file system, call:

```cpp
#include "emscripten.h"

EM_ASM({
    // alternatively: call this function from JavaScript
    window.MbedJSHal.syncIdbfs();
});
```

**Clearing the persistent file system**

To remove all files from the persistent file system, open your browsers console and run:

```js
window.MbedJSHal.clearIdbfs();
```

## Prepopulating the file system

You can populate the file system at compile time with data from your computer. This can be done through the CLI or via the [simconfig](simconfig.md) file.

**CLI**

```
# the part after the @ is the mount location (in this case /fs)

$ mbed-simulator -i . --preload-file folder-to-load/@/fs
```

**simconfig.md**

```json
{
    "compiler-args": [
        "--preload-file", "sdcard@/fs"
    ]
}
```

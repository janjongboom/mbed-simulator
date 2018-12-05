# Configuration and compiler options

## Simconfig

You can specify simulator options via a `simconfig.json` object, this is useful because you can check it in. In here you can specify compiler options and ignore paths. Just create the file in your project folder according to the following structure:

```json
{
    "compiler-args": [
        "-std=c++11",
        "--preload-file", "sdcard@/fs"
    ],
    "emterpretify": true,
    "ignore": [
        "./BSP_DISCO_F413ZH",
        "./F413ZH_SD_BlockDevice"
    ],
    "peripherals": [
        { "component": "ST7789H2", "args": {} }
    ],
    "components": {
        "jshal": [
            "./ui/js-hal.js"
        ],
        "jsui": [
            "./ui/js-ui.js"
        ]
    },
    "disableTlsNullEntropy": true
}
```

It will automatically be picked up by the simulator CLI.

## Compiler options

**C++11**

To use C++11 (or a different version), pass in `-c "-std=c++11"`.

**Emterpretify**

If you see that compilation hangs this might be due to a bug in asyncify. To switch to Emterpretify for async operations, pass in `--emterpretify`. This is f.e. used for uTensor. Note thet emterpretify is not fully supported.

**Null entropy**

By default no entropy sources are defined. If you see an error by the build process about this (e.g. `#error "MBEDTLS_TEST_NULL_ENTROPY defined, but not all prerequisites"`), you can add `"disableTlsNullEntropy": true` to your simconfig.

## mbed_app.json

Configuration options and macros are automatically picked up from your mbed_app.json file. To specify options that are only loaded for the simulator, use the `target_overrides` section:

```json
{
    "target_overrides": {
        "SIMULATOR": {
            "some-config-option": 12
        }
    }
}
```

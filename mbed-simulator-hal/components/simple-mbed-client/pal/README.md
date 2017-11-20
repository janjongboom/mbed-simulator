# PAL
This is the main repository for the Platform Abstraction Layer (PAL) project.

# Releases

In order to get the latest stable and tested code, plesae goto [releases](https://github.com/ARMmbed/mbed-client-pal/releases)
and download the required release version - each release has a comment regarding which official mbedOS version was used for 
development and testing.


# General Use Notes

* `pal_init()` API MUST be called before using any other PAL API, calling PAL APIs without 
  initialization PAL can return with initialization error.
* `pal_destroy()` API MUST ba called to free any allocated resources by PAL Modules.


# How To Build PAL Tests
## MbedOS

1. Define the environment variable: `MBEDOS_ROOT` to be the father folder of "mbed-os".
2. `cd $(PAL_FOLDER)/Test/`
3. make mbedOS_all - This will build the tests for mbedOS5.2 (mbed-os-5.2)over Freescale-K64F board.
4. In order to build and run the tests over the platform please run: 

		$ make mbedOS_check

5. In order to see debug prints please send the following flag `DEBUG=1` in compilation command: 

		$ make mbedOS_check DEBUG=1

6. In order to build single module tests please edit `$(PAL_FOLDER)/Test/makefile`
   under mbedOS5.1 platform, please change the value of the `TARGET_CONFIGURATION_DEFINES` to the 
   desired module: (default value is for all exist modules)

		HAS_RTOS --> RTOS module APIs
		HAS_SOCKET --> Networking module APIs
		


# PAL Repository Directory structure
```
│
├── Build //Auto generated during build folder
│   └── mbedOS  //inncludes .a files
│       └── obj //includes obj files
│
├── Docs
│
├── Examples
│
├── Source
│   ├── PAL-Impl
│   │   ├── Modules
│   │   │   ├── Networking
│   │   │   ├── RTOS
│   │   │   └── Update
│   │   ├── Services-API //High level Services API for mbed-client to call
│   │   └── pal_init.c //this file contains the global PAL initialization function
│   │
│   └── Port
│   |   ├── Platform-API //Low level platform oriented API for cutomer to implement
│   |   └── Reference-Impl
│   |   |   └── mbedOS
│   |   |   |	├── Networking
│   |   |   |	├── RTOS
│   |   |   |  	└── Update
│
├── Test
│   ├── Common  //contains common headers for tests
│   ├── Scripts
│   ├── Unitest //contains the Unitests source code for each module (RTOS, Update, etc)
│   └── Unity //contains the Unity framework source code
│
├── Utils
│   └── Scripts
│
├── PAL MakeFile
├── Project editor proj file
├── PAL Master Build Script
└── Main index Readme file

```


## PAL porting guide

This document describes the process of PAL porting to different operating systems. During the process, you need to work
with the [**Port**](https://github.com/ARMmbed/mbed-client-pal/tree/master/Source/Port) folder that contains two sub-folders: *[Platform-API](https://github.com/ARMmbed/pal/tree/master/Source/Port/Platform-API)* and *[Reference-Impl](https://github.com/ARMmbed/pal/tree/master/Source/Port/Reference-Impl)*.

### Platform-API

The *[Platform-API](https://github.com/ARMmbed/pal/tree/master/Source/Port/Platform-API)* folder contains the header files declaring the interfaces that MUST be implemented by the platform. The APIs are documented in the header files and the Doxygen documentation with the same content is also available.
The documentation declares the input/output parameters, return values and the eventual special return values. 
The header file names are related to the PAL modules they are declaring. For example:  
    
  ```
    pal_plat_rtos.h --> presents the RealTime OS APIs required by the   
                        services and Must be implemented by platform.
  ```

<span class="notes">The APIs are called directly from the *Service* implementation layer. Therefore, you MUST NOT change them.</span>

### Reference-Impl

The *[Reference-Impl](https://github.com/ARMmbed/pal/tree/master/Source/Port/Reference-Impl)* folder contains the reference platform implementations in their respective folders. 
Each OS folder contains a list of folders of the required PAL modules to be implemented by the platform, for example:
  
  ```
    Networking --> contains networking related files.
  ```

### Porting to a new platform

1. Add a new platform folder to the *[Reference-Impl](https://github.com/ARMmbed/pal/tree/master/Source/Port/Reference-Impl)* folder.  
2. Add the module folders into the new platform folder.  
3. Read the relevent API/Module documentation.
4. Start coding.

#### Essential header files

Here is a list of tips that can help in porting:

* Include the **[pal.h](https://github.com/ARMmbed/pal/blob/master/Source/PAL-Impl/Services-API/pal.h)** file; it includes all the required headers from PAL, such as `pal_errors.h` and `pal_macros.h`.
* Read the **[pal_errors.h](https://github.com/ARMmbed/pal/blob/master/Source/PAL-Impl/Services-API/pal_errors.h)** file to find out how to map the platform errors to the PAL errors.
* Read the **[pal_macros.h](https://github.com/ARMmbed/pal/blob/master/Source/PAL-Impl/Services-API/pal_macros.h)** to find helpful PAL macros.
* Include the **pal_(MODULE).h** file to get the relevant data structures.

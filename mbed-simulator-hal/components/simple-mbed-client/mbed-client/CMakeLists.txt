INCLUDE(CMakeForceCompiler)
# CROSS COMPILER SETTING
cmake_minimum_required (VERSION 2.8)
SET(CMAKE_SYSTEM_NAME Generic)

project(mbedClient)

set(port_libs_PATH ${CMAKE_CURRENT_SOURCE_DIR}/port_libs)
#own include dirs
include_directories(${CMAKE_CURRENT_SOURCE_DIR})
include_directories(${CMAKE_CURRENT_SOURCE_DIR}/source)
include_directories(${CMAKE_CURRENT_SOURCE_DIR}/mbed-client-c)
include_directories(${CMAKE_CURRENT_SOURCE_DIR}/mbed-client-classic)
include_directories(${CMAKE_CURRENT_SOURCE_DIR}/mbed-client-mbed-tls)


#pal include Dirs
set(PAL_APIS_INCLUDE_PATH ${CMAKE_CURRENT_SOURCE_DIR}/../mbed-client-pal/Source/PAL-Impl/Services-API)
include_directories(${PAL_APIS_INCLUDE_PATH}/)
SET(PAL_SOURCE_DIR ${CMAKE_CURRENT_SOURCE_DIR}/../mbed-client-pal/Source)
#need to make this platform
include_directories(${PAL_SOURCE_DIR}/Port/Reference-Impl/Linux/CFStore)
include_directories(${PAL_SOURCE_DIR}/Port/Platform-API)

set(MBED_CLIENT_C_PATH ${CMAKE_CURRENT_SOURCE_DIR}/mbed-client-c)

#porting libs
include_directories(${port_libs_PATH}/nanostack-libservice/mbed-client-libservice)
include_directories(${port_libs_PATH}/nanostack-libservice/)
include_directories(${port_libs_PATH}/sal-stack-nanostack-eventloop/nanostack-event-loop)
include_directories(${port_libs_PATH}/ns-hal-pal)
include_directories(${port_libs_PATH}/mbed-trace)


set(SAL_NANOSTACK_EVENT_LOOP_PATH ${CMAKE_CURRENT_SOURCE_DIR}/port_libs/sal-stack-nanostack-eventloop)
set(RANDLIB_C_PATH ${CMAKE_CURRENT_SOURCE_DIR}/port_libs/mbed-client-randlib)
set(NANOSTACK_LIBSERVICE_PATH ${CMAKE_CURRENT_SOURCE_DIR}/port_libs/nanostack-libservice)
set(NS_HAL_PAL_PATH ${CMAKE_CURRENT_SOURCE_DIR}/port_libs/ns-hal-pal)
set(MBED_COAP_PATH ${CMAKE_CURRENT_SOURCE_DIR}/port_libs/mbed-coap)

include_directories(${MBED_COAP_PATH})
include_directories(${MBED_COAP_PATH}/mbed-coap)
include_directories(${MBED_COAP_PATH}/source/include)


include_directories(${SAL_NANOSTACK_EVENT_LOOP_PATH})
include_directories(${SAL_NANOSTACK_EVENT_LOOP_PATH}/nanostack-event-loop)
include_directories(${SAL_NANOSTACK_EVENT_LOOP_PATH}/nanostack-event-loop/platform)
include_directories(${SAL_NANOSTACK_EVENT_LOOP_PATH}/source/libNsdl/src/include)
include_directories(${SAL_NANOSTACK_EVENT_LOOP_PATH}/source/libCoap/src)
include_directories(${SAL_NANOSTACK_EVENT_LOOP_PATH}/source/libCoap/src/include)


include_directories(${MBED_CLIENT_C_PATH})
include_directories(${MBED_CLIENT_C_PATH}/nsdl-c)
include_directories(${MBED_CLIENT_C_PATH}/source/include)

include_directories(${RANDLIB_C_PATH}/mbed-client-randlib)
include_directories(${RANDLIB_C_PATH}/mbed-client-randlib/platform)

include_directories(${NANOSTACK_LIBSERVICE_PATH}/)
include_directories(${NANOSTACK_LIBSERVICE_PATH}/mbed-client-libservice)
include_directories(${NANOSTACK_LIBSERVICE_PATH}/mbed-client-libservice/platform)


include_directories(${NS_HAL_PAL_PATH})


set(PAL_HEADER_API ${NS_HAL_PAL_PATH}/../../mbed-client-pal/Source)
include_directories(${PAL_HEADER_API}/PAL-Impl/Services-API)
#need to make this platform
include_directories(${PAL_HEADER_API}/Port/Reference-Impl/Linux/CFStore)
include_directories(${PAL_HEADER_API}/Port/Platform-API)

include_directories(${PAL_HEADER_API})

add_definitions(-DMBED_CONF_NANOSTACK_EVENTLOOP_EXCLUDE_HIGHRES_TIMER)
add_definitions(-DMBED_CONF_NANOSTACK_EVENTLOOP_USE_PLATFORM_TICK_TIMER)


FILE(GLOB MBED_CLIENT_SRC
        "${CMAKE_CURRENT_SOURCE_DIR}/mbed-client/*.h"
        "${CMAKE_CURRENT_SOURCE_DIR}/mbed-client-classic/mbed-client-classic/*.h"
        "${CMAKE_CURRENT_SOURCE_DIR}/mbed-client-classic/source/*.cpp"
        "${CMAKE_CURRENT_SOURCE_DIR}/mbed-client-mbed-tls/mbed-client-mbed-tls/*.h"
        "${CMAKE_CURRENT_SOURCE_DIR}/mbed-client-mbed-tls/source/*.cpp"
        "${CMAKE_CURRENT_SOURCE_DIR}/source/*.cpp"
        "${CMAKE_CURRENT_SOURCE_DIR}/source/include/*.h"
        )

CREATE_LIBRARY(mbedClient "${MBED_CLIENT_SRC}" "")


FILE(GLOB MBED_COAP_SRC
        "${MBED_COAP_PATH}/source/*.c"
        )

CREATE_LIBRARY(mbedCoap "${MBED_COAP_SRC}" "")


FILE(GLOB MBED_CLIENT_C_SRC
        "${MBED_CLIENT_C_PATH}/source/*.c"
        )

CREATE_LIBRARY(mbedClientC "${MBED_CLIENT_C_SRC}" "")


FILE(GLOB MBED_CLIENT_RAND_LIB_SRC
        "${RANDLIB_C_PATH}/source/*.c"
        "${RANDLIB_C_PATH}/mbed-client-randlib/*.h"
        "${RANDLIB_C_PATH}/mbed-client-randlib/platform/*.h"
        )


CREATE_LIBRARY(mbedClientRandLib "${MBED_CLIENT_RAND_LIB_SRC}" "")


FILE(GLOB NANO_STACK_LIB_SERVICE_SRC
        "${NANOSTACK_LIBSERVICE_PATH}/source/nsdynmemLIB/*.c"
        "${NANOSTACK_LIBSERVICE_PATH}/mbed-client-libservice/*.*"
        "${NANOSTACK_LIBSERVICE_PATH}/source/libip6string/*.c"
        "${NANOSTACK_LIBSERVICE_PATH}/source/libBits/*.c"
        )

CREATE_LIBRARY(nanoStackLibService "${NANO_STACK_LIB_SERVICE_SRC}" "")


SET(NS_HAL_LIB_SRC
        "${NS_HAL_PAL_PATH}/ns_event_loop.c"
        "${NS_HAL_PAL_PATH}/ns_event_loop.h"

        "${NS_HAL_PAL_PATH}/ns_hal_init.c"
        "${NS_HAL_PAL_PATH}/ns_hal_init.h"

        "${NS_HAL_PAL_PATH}/arm_hal_interrupt.c"
        "${NS_HAL_PAL_PATH}/arm_hal_timer.cpp"
        )


add_definitions(-DMBED_CONF_NS_HAL_PAL_EVENT_LOOP_THREAD_STACK_SIZE=102400)

CREATE_LIBRARY(nsHalLib "${NS_HAL_LIB_SRC}" "")

FILE(GLOB SAL_NANO_STACK_LIB_SERVICE_SRC
        "${SAL_NANOSTACK_EVENT_LOOP_PATH}/source/*.c"
        "${SAL_NANOSTACK_EVENT_LOOP_PATH}/source/*.cpp"
        "${SAL_NANOSTACK_EVENT_LOOP_PATH}/source/*.h"

        )


CREATE_LIBRARY(salNanoStackLibService "${SAL_NANO_STACK_LIB_SERVICE_SRC}" "")


ADDSUBDIRS()


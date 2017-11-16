#ifndef _MBED_SIMULATOR_CPP_HAL_MBED_H_
#define _MBED_SIMULATOR_CPP_HAL_MBED_H_

#define osWaitForever         0xFFFFFFFFU ///< Wait forever timeout value.

#include <stdio.h>
#include "drivers/DigitalOut.h"
#include "drivers/Ticker.h"
#include "hal/lp_ticker_api.h"
#include "hal/pinmap.h"
#include "hal/ticker_api.h"
#include "hal/ticker_us_api.h"
#include "platform/Callback.h"
#include "platform/mbed_assert.h"
#include "platform/mbed_wait_api.h"
#include "platform/NonCopyable.h"
#include "platform/platform.h"
#include "targets/TARGET_SIMULATOR/device.h"
#include "targets/TARGET_SIMULATOR/PeripheralNames.h"
#include "targets/TARGET_SIMULATOR/PinNames.h"

using namespace mbed;

#endif // _MBED_SIMULATOR_CPP_HAL_MBED_H_

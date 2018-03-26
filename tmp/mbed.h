#ifndef _MBED_SIMULATOR_CPP_HAL_MBED_H_
#define _MBED_SIMULATOR_CPP_HAL_MBED_H_

#define osWaitForever         0xFFFFFFFFU ///< Wait forever timeout value.

#include <stdio.h>
#include "drivers/AnalogIn.h"
#include "drivers/AnalogOut.h"
#include "drivers/BusIn.h"
#include "drivers/BusInOut.h"
#include "drivers/BusOut.h"
#include "drivers/DigitalIn.h"
#include "drivers/DigitalOut.h"
#include "drivers/DigitalInOut.h"
#include "drivers/PwmOut.h"
#include "drivers/InterruptIn.h"
#include "drivers/Ticker.h"
#include "drivers/Timeout.h"
#include "drivers/Timer.h"
#include "events/Event.h"
#include "events/EventQueue.h"
#include "features/netsocket/NetworkInterface.h"
#include "features/netsocket/NetworkStack.h"
#include "features/netsocket/nsapi_dns.h"
#include "features/netsocket/nsapi_types.h"
#include "features/netsocket/nsapi.h"
#include "features/netsocket/Socket.h"
#include "features/netsocket/SocketAddress.h"
#include "features/netsocket/TCPSocket.h"
#include "features/netsocket/UDPSocket.h"
#include "hal/lp_ticker_api.h"
#include "hal/pinmap.h"
#include "hal/ticker_api.h"
#include "hal/ticker_us_api.h"
#include "platform/Callback.h"
#include "platform/mbed_assert.h"
#include "platform/mbed_wait_api.h"
#include "platform/NonCopyable.h"
#include "platform/platform.h"
#include "platform/Stream.h"
#include "targets/TARGET_SIMULATOR/device.h"
#include "targets/TARGET_SIMULATOR/PeripheralNames.h"
#include "targets/TARGET_SIMULATOR/PinNames.h"

using namespace mbed;
using namespace events;

#endif // _MBED_SIMULATOR_CPP_HAL_MBED_H_

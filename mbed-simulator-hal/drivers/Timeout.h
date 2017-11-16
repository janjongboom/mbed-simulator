/* mbed Microcontroller Library
 * Copyright (c) 2006-2013 ARM Limited
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
#ifndef MBED_TIMEOUT_H
#define MBED_TIMEOUT_H

#include "drivers/Ticker.h"
#include "platform/NonCopyable.h"
#include "platform/mbed_sleep.h"

namespace mbed {
/** \addtogroup drivers */

/** A Timeout is used to call a function at a point in the future
 *
 * You can use as many seperate Timeout objects as you require.
 *
 * @note Synchronization level: Interrupt safe
 *
 * Example:
 * @code
 * // Blink until timeout.
 *
 * #include "mbed.h"
 *
 * Timeout timeout;
 * DigitalOut led(LED1);
 *
 * int on = 1;
 *
 * void attimeout() {
 *     on = 0;
 * }
 *
 * int main() {
 *     timeout.attach(&attimeout, 5);
 *     while(on) {
 *         led = !led;
 *         wait(0.2);
 *     }
 * }
 * @endcode
 * @ingroup drivers
 */
class Timeout : /*public TimerEvent, */private NonCopyable<Timeout> {

public:
    Timeout() : /*TimerEvent(), */_function(0), _lock_deepsleep(true) {
    }

    // When low power ticker is in use, then do not disable deep-sleep.
    /*Timeout(const ticker_data_t *data) : TimerEvent(data), _function(0), _lock_deepsleep(true)  {
        data->interface->init();
#if DEVICE_LOWPOWERTIMER
        _lock_deepsleep = (data != get_lp_ticker_data());
#endif
    }*/

    /** Attach a function to be called by the Timeout, specifying the interval in seconds
     *
     *  @param func pointer to the function to be called
     *  @param t the time between calls in seconds
     */
    void attach(Callback<void()> func, float t) {
        attach_us(func, t * 1000000.0f);
    }

    /** Attach a member function to be called by the Timeout, specifying the interval in seconds
     *
     *  @param obj pointer to the object to call the member function on
     *  @param method pointer to the member function to be called
     *  @param t the time between calls in seconds
     *  @deprecated
     *      The attach function does not support cv-qualifiers. Replaced by
     *      attach(callback(obj, method), t).
     */
    template<typename T, typename M>
    MBED_DEPRECATED_SINCE("mbed-os-5.1",
        "The attach function does not support cv-qualifiers. Replaced by "
        "attach(callback(obj, method), t).")
    void attach(T *obj, M method, float t) {
        attach(callback(obj, method), t);
    }

    /** Attach a function to be called by the Timeout, specifying the interval in micro-seconds
     *
     *  @param func pointer to the function to be called
     *  @param t the time between calls in micro-seconds
     *
     *  @note setting @a t to a value shorter that it takes to process the ticker callback
     *  will cause the system to hang. Timeout callback will be called constantly with no time
     *  for threads scheduling.
     *
     */
    void attach_us(Callback<void()> func, us_timestamp_t t) {
        // lock only for the initial callback setup and this is not low power Timeout
        if(!_function && _lock_deepsleep) {
            sleep_manager_lock_deep_sleep();
        }
        _function = func;
        setup(t);
    }

    /** Attach a member function to be called by the Timeout, specifying the interval in micro-seconds
     *
     *  @param obj pointer to the object to call the member function on
     *  @param method pointer to the member function to be called
     *  @param t the time between calls in micro-seconds
     *  @deprecated
     *      The attach_us function does not support cv-qualifiers. Replaced by
     *      attach_us(callback(obj, method), t).
     */
    template<typename T, typename M>
    MBED_DEPRECATED_SINCE("mbed-os-5.1",
        "The attach_us function does not support cv-qualifiers. Replaced by "
        "attach_us(callback(obj, method), t).")
    void attach_us(T *obj, M method, us_timestamp_t t) {
        attach_us(Callback<void()>(obj, method), t);
    }

    virtual ~Timeout() {
        detach();
    }

    /** Detach the function
     */
    void detach();

protected:
    void setup(us_timestamp_t t);
    virtual void handler();

protected:
    us_timestamp_t         _delay;  /**< Time delay (in microseconds) for re-setting the multi-shot callback. */
    Callback<void()>    _function;  /**< Callback. */
    bool          _lock_deepsleep;  /**< Flag which indicates if deep-sleep should be disabled. */
};

} // namespace mbed

#endif

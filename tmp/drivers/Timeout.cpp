#include <stdio.h>
#include "Timeout.h"
#include "emscripten.h"

namespace mbed {

void Timeout::setup(us_timestamp_t t) {
    EM_ASM_({
        window.MbedJSHal.timers.timeout_setup($0, $1);
    }, &_function, (uint32_t)(t / 1000));
}

void Timeout::detach() {
    EM_ASM_({
        window.MbedJSHal.timers.timeout_detach($0);
    }, &_function);
}

void Timeout::handler() {
    _function.call();
}

} // namespace mbed

EMSCRIPTEN_KEEPALIVE
extern "C" void invoke_timeout(uint32_t fn) {
    ((mbed::Callback<void()>*)fn)->call();
}

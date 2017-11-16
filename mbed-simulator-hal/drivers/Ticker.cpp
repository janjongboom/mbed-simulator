#include <stdio.h>
#include "Ticker.h"
#include "emscripten.h"

using namespace mbed;

void Ticker::setup(us_timestamp_t t) {
    EM_ASM_({
        window.MbedJSHal.timers.ticker_setup($0, $1);
    }, &_function, (uint32_t)(t / 1000));
}

void Ticker::detach() {
    EM_ASM_({
        window.MbedJSHal.timers.ticker_detach($0);
    }, &_function);
}

EMSCRIPTEN_KEEPALIVE
extern "C" void invoke_ticker(uint32_t fn) {
    ((Callback<void()>*)fn)->call();
}

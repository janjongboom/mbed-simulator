#include <unistd.h>
#include "mbed_wait_api.h"
#if defined(__EMSCRIPTEN__)
#include "emscripten.h"
#endif

void wait(float s) {
    wait_us(s * 1000000.0f);
}

void wait_ms(int ms) {
    wait_us(ms * 1000);
}

void wait_us(int us) {
#if defined(__EMSCRIPTEN__)
    emscripten_sleep_with_yield(us / 1000);
#else
    usleep(us);
#endif
}

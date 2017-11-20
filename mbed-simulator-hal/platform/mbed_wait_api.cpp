#include <unistd.h>
#include "mbed_wait_api.h"
#include "emscripten.h"

void wait(float s) {
    wait_us(s * 1000000.0f);
}

void wait_ms(int ms) {
    wait_us(ms * 1000);
}

void wait_us(int us) {
    usleep(us);
    // emscripten_sleep_with_yield(us / 1000);
}

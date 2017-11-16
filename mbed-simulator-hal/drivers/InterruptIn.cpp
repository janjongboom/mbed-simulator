#include "emscripten.h"
#include "drivers/InterruptIn.h"

#if DEVICE_INTERRUPTIN

namespace mbed {

InterruptIn::InterruptIn(PinName pin) : _pin(pin)
{
    EM_ASM_({
        window.MbedJSHal.pins.interruptin_init($0);
    }, _pin);
}

InterruptIn::~InterruptIn() {
    EM_ASM_({
        window.MbedJSHal.pins.interruptin_dtor($0);
    }, _pin);
}

int InterruptIn::read() {
    return EM_ASM_INT({
        return window.MbedJSHal.pins.get_pin_value($0);
    }, _pin);
}

InterruptIn::operator int() {
    return read();
}

void InterruptIn::rise(Callback<void()> func) {
    _rise = func;

    EM_ASM_({
        window.MbedJSHal.pins.interruptin_rise_setup($0, $1);
    }, _pin, &_rise);
}

void InterruptIn::fall(Callback<void()> func) {
    _fall = func;

    EM_ASM_({
        window.MbedJSHal.pins.interruptin_fall_setup($0, $1);
    }, _pin, &_fall);
}

void InterruptIn::mode(PinMode pull) {
    printf("InterruptIn::mode is not supported in the simulator\n");
}

void InterruptIn::enable_irq() {
}

void InterruptIn::disable_irq() {
}

} // namespace mbed

EMSCRIPTEN_KEEPALIVE
extern "C" void invoke_interruptin_callback(uint32_t fn) {
    ((mbed::Callback<void()>*)fn)->call();
}

#endif

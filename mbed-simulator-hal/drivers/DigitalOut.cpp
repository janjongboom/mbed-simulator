#include "DigitalOut.h"
#include "emscripten.h"

using namespace mbed;

DigitalOut::DigitalOut(PinName pin) :
    _pin(pin), _value(0)
{
    EM_ASM_({
        MbedJSHal.pins.digitalout_init($0, $1);
    }, _pin, _value);
}

DigitalOut::DigitalOut(PinName pin, int value) :
    _pin(pin), _value(value)
{
    EM_ASM_({
        MbedJSHal.pins.digitalout_init($0, $1);
    }, _pin, _value);
}

void DigitalOut::write(int value)
{
    _value = value;

    EM_ASM_({
        MbedJSHal.pins.digitalout_write($0, $1);
    }, _pin, _value);
}

int DigitalOut::read()
{
    return _value;
}

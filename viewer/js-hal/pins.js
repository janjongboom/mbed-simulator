window.MbedJSHal.pins = (function() {

    var obj = new EventEmitter();

    var MODE = {
        DIGITAL: 1,
        ANALOGIN: 2,
        ANALOGOUT: 3
    };

    var declaredPins = {};

    // HAL functions (these are called from C++)
    function digitalout_init(pin, value) {
        declaredPins[pin] = {
            mode: MODE.DIGITAL,
            value: value
        };

        obj.emit('pin_write', pin, value);
    }

    function digitalout_write(pin, value) {
        if (!declaredPins[pin]) {
            return console.error('pin ' + pin + ' was not declared');
        }

        if (declaredPins[pin].mode != MODE.DIGITAL) {
            return console.error('pin ' + pin + ' was not declared as DIGITAL pin, but as ' + declaredPins[pin].mode);
        }

        declaredPins[pin].value = value;

        obj.emit('pin_write', pin, value);
    }

    function get_pin_value(pin) {
        if (!declaredPins[pin]) return -1; // not found
        return declaredPins[pin].value;
    }

    obj.digitalout_init = digitalout_init;
    obj.digitalout_write = digitalout_write;
    obj.get_pin_value = get_pin_value;
    return obj;

})();
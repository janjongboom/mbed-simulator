window.MbedJSHal.pins = (function() {

    var obj = new EventEmitter();

    var MODE = {
        DIGITAL: 1,
        ANALOGIN: 2,
        ANALOGOUT: 3,
        INTERRUPTIN: 4
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

    function interruptin_init(pin) {
        console.log('interruptin_init', pin);
        declaredPins[pin] = {
            mode: MODE.INTERRUPTIN,
            value: 0
        };
    }

    function interruptin_dtor(pin) {
        if (declaredPins[pin]) {
            delete declaredPins[pin];
        }
    }

    function interruptin_rise_setup(pin, fn) {
        console.log('interruptin_rise_setup', pin, fn);
        if (!declaredPins[pin]) {
            return console.error('pin ' + pin + ' was not declared');
        }

        if (declaredPins[pin].mode != MODE.INTERRUPTIN) {
            return console.error('pin ' + pin + ' was not declared as INTERRUPTIN pin, but as ' + declaredPins[pin].mode);
        }

        declaredPins[pin].rise_fn = fn;
    }

    function interruptin_fall_setup(pin, fn) {
        console.log('interruptin_fall_setup', pin, fn);
        if (!declaredPins[pin]) {
            return console.error('pin ' + pin + ' was not declared');
        }

        if (declaredPins[pin].mode != MODE.INTERRUPTIN) {
            return console.error('pin ' + pin + ' was not declared as INTERRUPTIN pin, but as ' + declaredPins[pin].mode);
        }

        declaredPins[pin].fall_fn = fn;
    }

    // HAL functions called from JS
    function set_pin_value(pin, value) {
        if (!declaredPins[pin]) {
            return console.error('pin ' + pin + ' was not declared');
        }

        if (declaredPins[pin].mode === MODE.DIGITAL) {
            digitalout_write(pin, value);
        }

        if (declaredPins[pin].mode === MODE.INTERRUPTIN) {
            declaredPins[pin].value = value;

            obj.emit('pin_write', pin, value);

            if (value === 0 && declaredPins[pin].fall_fn) {
                ccall('invoke_interruptin_callback', 'void', [ 'number' ], [ declaredPins[pin].fall_fn ]);
            }
            else if (value === 1 && declaredPins[pin].rise_fn) {
                ccall('invoke_interruptin_callback', 'void', [ 'number' ], [ declaredPins[pin].rise_fn ]);
            }
        }
    }

    function get_pin_value(pin) {
        if (!declaredPins[pin]) return -1; // not found
        return declaredPins[pin].value;
    }

    obj.digitalout_init = digitalout_init;
    obj.digitalout_write = digitalout_write;
    obj.interruptin_init = interruptin_init;
    obj.interruptin_dtor = interruptin_dtor;
    obj.interruptin_rise_setup = interruptin_rise_setup;
    obj.interruptin_fall_setup = interruptin_fall_setup;
    obj.set_pin_value = set_pin_value;
    obj.get_pin_value = get_pin_value;
    return obj;

})();
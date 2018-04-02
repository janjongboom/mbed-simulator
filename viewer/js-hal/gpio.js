window.MbedJSHal.gpio = (function() {

    var obj = new EventEmitter();

    var DIRECTION = {
        INPUT: 0,
        OUTPUT: 1,
        INPUTOUTPUT: 2
    };

    var MODE = {
        PullUp: 0,
        PullDown: 3,
        PullNone: 2,
        Repeater: 1,
        OpenDrain: 4,
        PullDefault: 3
    };

    var TYPE = {
        DIGITAL: 1,
        ANALOG: 2,
        PWM: 3
    };

    var IRQ_EVENT = {
        IRQ_NONE: 0,
        IRQ_RISE: 1,
        IRQ_FALL: 2
    };

    var declaredPins = {};
    var irqPins = {};

    /*
     * Functions
     * ------------------------------
     * init       (pin)
     * init_out   (pin, value)
     * init_in    (pin, mode)
     * init_inout (pin, direction, mode, value)
     * mode       (pin, mode)
     * dir        (pin, direction)
     * write      (pin, value)
     * read       (pin)
     */

    function init(ptr, pin) {
        declaredPins[pin] = {
            ptr: ptr,
            type: TYPE.DIGITAL,
            direction: DIRECTION.INPUT,
            mode: MODE.PullNone,
            interrupt: false,
            value: 0
        };

        obj.emit('pin_write', Number(pin), 0, TYPE.DIGITAL);
    }

    function init_out(ptr, pin, value) {
        declaredPins[pin] = {
            ptr: ptr,
            type: TYPE.DIGITAL,
            direction: DIRECTION.OUTPUT,
            mode: MODE.PullNone,
            interrupt: false,
            value: value
        };

        obj.emit('pin_write', Number(pin), value, TYPE.DIGITAL);
    }

    function init_in(ptr, pin, mode) {
        declaredPins[pin] = {
            ptr: ptr,
            type: TYPE.DIGITAL,
            direction: DIRECTION.INPUT,
            mode: mode,
            interrupt: false,
            value: 0
        };
    }

    function init_inout(ptr, pin, direction, mode, value) {
        declaredPins[pin] = {
            ptr: ptr,
            type: TYPE.DIGITAL,
            direction: DIRECTION.INPUTOUTPUT,
            mode: mode,
            interrupt: false,
            value: value
        };

        obj.emit('pin_write', Number(pin), value, TYPE.DIGITAL);
    }

    function init_analogin(ptr, pin) {
        declaredPins[pin] = {
            ptr: ptr,
            type: TYPE.ANALOG,
            direction: DIRECTION.INPUT,
            mode: MODE.PullNone,
            interrupt: false,
            value: 0
        };
    }

    function init_analogout(ptr, pin, value) {
        declaredPins[pin] = {
            ptr: ptr,
            type: TYPE.ANALOG,
            direction: DIRECTION.INPUT,
            mode: MODE.PullNone,
            interrupt: false,
            value: value
        };

        obj.emit('pin_write', Number(pin), value, TYPE.ANALOG);
    }

    function init_pwmout(ptr, pin, pulsewidth_ms, value) {
        declaredPins[pin] = {
            ptr: ptr,
            type: TYPE.PWM,
            direction: DIRECTION.OUTPUT,
            mode: MODE.PullNone,
            interrupt: false,
            pulsewidth_ms: pulsewidth_ms,
            period_ms: 0,
            value: value
        };

        obj.emit('pin_write', Number(pin), value, TYPE.PWM);
    }

    function mode(pin, mode) {
        if (!(pin in declaredPins)) return console.error('Setting undeclared pin mode', pin, mode);

        declaredPins[pin].mode = mode;
    }

    function dir(pin, dir) {
        if (!(pin in declaredPins)) return console.error('Setting undeclared pin direction', pin, dir);

        declaredPins[pin].direction = dir;
    }

    function pulsewidth_ms(pin, pw) {
        if (!(pin in declaredPins)) return console.error('Setting undeclared pin pulsewidth', pin, pw);

        declaredPins[pin].pulsewidth_ms = pw;

        obj.emit('pin_pulsewidthms', pin, pw);
    }

    function period_ms(pin, pw) {
        if (!(pin in declaredPins)) return console.error('Setting undeclared pin period', pin, pw);

        declaredPins[pin].period_ms = pw;

        obj.emit('pin_period', pin, pw);
    }

    function read(pin) {
        if (!(pin in declaredPins)) return 0;

        return declaredPins[pin].value;
    }

    function write(pin, value) {
        if (!(pin in declaredPins)) return;

        if (declaredPins[pin].type === TYPE.DIGITAL) {
            if (value === 0 || value === 1) {
                declaredPins[pin].value = value;
            }
            else {
                return console.error('DIGITAL pin should be 0 or 1', pin, value);
            }
        }
        else if (declaredPins[pin].type === TYPE.ANALOG || declaredPins[pin].type === TYPE.PWM) {
            if (value < 0) value = 0;
            if (value > 1024) value = 1024;

            if (value >= 0 && value <= 1024) {
                declaredPins[pin].value = Math.floor(value);
            }
            else {
                return console.error('ANALOG|PWMOUT pin should be between 0 and 1024', pin, value);
            }
        }

        obj.emit('pin_write', Number(pin), value, declaredPins[pin].type);

        // handle interrupts, if registered
        if (irqPins[pin]) {
            if (value === 0 && irqPins[pin].fall) {
                ccall('handle_interrupt_in', null, [ 'number', 'number' ], [ irqPins[pin].ptr, IRQ_EVENT.IRQ_FALL ], { async: true });
            }
            else if (value === 1 && irqPins[pin].rise) {
                ccall('handle_interrupt_in', null, [ 'number', 'number' ], [ irqPins[pin].ptr, IRQ_EVENT.IRQ_RISE ], { async: true });
            }
        }
    }

    function get_type(pin) {
        if (!declaredPins[pin]) return TYPE.DIGITAL;
        return declaredPins[pin].type;
    }

    function irq_init(irq_ptr, pin) {
        irqPins[pin] = {
            ptr: irq_ptr,
            rise: null,
            fall: null
        };
    }

    function irq_free(pin) {
        if (!(pin in irqPins)) {
            return console.error('IRQ free on non-declared pin', pin);
        }

        delete irqPins[pin];
    }

    function irq_set(pin, event, enable) {
        if (!(pin in irqPins)) {
            return console.error('IRQ set on non-declared pin', pin);
        }

        if (event === IRQ_EVENT.IRQ_RISE) {
            irqPins[pin].rise = enable;
        }
        else if (event === IRQ_EVENT.IRQ_FALL) {
            irqPins[pin].fall = enable;
        }
    }

    obj.init = init;
    obj.init_out = init_out;
    obj.init_in = init_in;
    obj.init_inout = init_inout;
    obj.init_analogin = init_analogin;
    obj.init_analogout = init_analogout;
    obj.init_pwmout = init_pwmout;
    obj.pulsewidth_ms = pulsewidth_ms;
    obj.period_ms = period_ms;
    obj.mode = mode;
    obj.dir = dir;
    obj.write = write;
    obj.read = read;
    obj.get_type = get_type;

    obj.irq_init = irq_init;
    obj.irq_free = irq_free;
    obj.irq_set  = irq_set;

    obj.TYPE = TYPE;

    return obj;

})();
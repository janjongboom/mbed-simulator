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
        ANALOG: 2
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

        obj.emit('pin_write', pin, 0);
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

        obj.emit('pin_write', pin, value);
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

        obj.emit('pin_write', pin, value);
    }

    function mode(pin, mode) {
        if (!(pin in declaredPins)) return console.error('Setting undeclared pin mode', pin, mode);

        declaredPins[pin].mode = mode;
    }

    function dir(pin, dir) {
        if (!(pin in declaredPins)) return console.error('Setting undeclared pin direction', pin, dir);

        declaredPins[pin].direction = dir;
    }

    function read(pin) {
        if (!(pin in declaredPins)) return 0;

        return declaredPins[pin].value;
    }

    function write(pin, value) {
        if (!(pin in declaredPins)) return;

        declaredPins[pin].value = value;

        obj.emit('pin_write', pin, value);

        // handle interrupts, if registered
        if (irqPins[pin]) {
            if (value === 0 && irqPins[pin].fall) {
                ccall('handle_interrupt_in', 'void', [ 'number', 'number' ], [ irqPins[pin].ptr, IRQ_EVENT.IRQ_FALL ]);
            }
            else if (value === 1 && irqPins[pin].rise) {
                ccall('handle_interrupt_in', 'void', [ 'number', 'number' ], [ irqPins[pin].ptr, IRQ_EVENT.IRQ_RISE ]);
            }
        }
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
    obj.mode = mode;
    obj.dir = dir;
    obj.write = write;
    obj.read = read;

    obj.irq_init = irq_init;
    obj.irq_free = irq_free;
    obj.irq_set  = irq_set;

    return obj;

})();
(function() {

    var svg = document.querySelector('#board-svg');

    if (svg.contentDocument && svg.contentDocument.rootElement) {
        attachHandlers(svg.contentDocument);
    }
    else {
        svg.addEventListener('load', function() {
            attachHandlers(this.contentDocument);
        });
    }

    function attachHandlers(board) {
        MbedJSHal.gpio.init_out(null, MbedJSHal.PinNames.LED1, 0);
        MbedJSHal.gpio.init_out(null, MbedJSHal.PinNames.LED2, 0);
        MbedJSHal.gpio.init_out(null, MbedJSHal.PinNames.LED3, 0);
        MbedJSHal.gpio.init_out(null, MbedJSHal.PinNames.LED4, 0);
        MbedJSHal.gpio.init_in(null, MbedJSHal.PinNames.BUTTON1, 0);

        var builtInLeds = {};
        builtInLeds[MbedJSHal.PinNames.LED1] = board.querySelector('#led1');
        builtInLeds[MbedJSHal.PinNames.LED2] = board.querySelector('#led2');
        builtInLeds[MbedJSHal.PinNames.LED3] = board.querySelector('#led3');
        builtInLeds[MbedJSHal.PinNames.LED4] = board.querySelector('#led4');

        var builtInButtons = {};
        builtInButtons[MbedJSHal.PinNames.BUTTON1] = board.querySelector('#button1');

        function setBuiltInLed(pin, value, type) {
            if (type !== MbedJSHal.gpio.TYPE.DIGITAL) {
                return console.error('PwmOut not supported on built-in LEDs');
            }

            if (value === 1) {
                builtInLeds[pin].setAttribute('fill', '#FBBE0E');
            }
            else {
                builtInLeds[pin].setAttribute('fill', 'black');
            }
        }

        window.MbedJSHal.gpio.on('pin_write', function(pin, value, type) {
            if (pin in builtInLeds) {
                setBuiltInLed(pin, value, type);
            }
        });

        // also need to check for initial state
        Object.keys(builtInLeds).forEach(function(pin) {
            var v = window.MbedJSHal.gpio.read(pin);
            if (v !== -1) {
                setBuiltInLed(pin, v, MbedJSHal.gpio.TYPE.DIGITAL);
            }
        });

        // set up button handlers
        Object.keys(builtInButtons).forEach(function(pin) {
            var el = builtInButtons[pin];

            el.onmousedown = function() {
                window.MbedJSHal.gpio.write(pin, 1);
            };

            el.onmouseup = function() {
                window.MbedJSHal.gpio.write(pin, 0);
            };
        });
    }

})();

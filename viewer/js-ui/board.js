(function() {

    var svg = document.querySelector('#board-svg');

    if (svg.contentDocument.rootElement) {
        attachHandlers(svg.contentDocument);
    }
    else {
        svg.addEventListener('load', function() {
            attachHandlers(this.contentDocument);
        });
    }

    function attachHandlers(board) {
        var builtInLeds = {
            50: board.querySelector('#led1'),
            52: board.querySelector('#led2'),
            53: board.querySelector('#led3'),
            55: board.querySelector('#led4')
        };

        var builtInButtons = {
            1337: board.querySelector('#button1')
        };

        function setBuiltInLed(pin, value) {
            if (value === 1) {
                builtInLeds[pin].setAttribute('fill', '#FBBE0E');
            }
            else {
                builtInLeds[pin].setAttribute('fill', 'black');
            }
        }

        window.MbedJSHal.gpio.on('pin_write', function(pin, value) {
            if (pin in builtInLeds) {
                setBuiltInLed(pin, value);
            }
        });

        // also need to check for initial state
        Object.keys(builtInLeds).forEach(function(pin) {
            var v = window.MbedJSHal.gpio.read(pin);
            if (v !== -1) {
                setBuiltInLed(pin, v);
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

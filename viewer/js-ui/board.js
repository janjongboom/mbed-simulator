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
            537509938: board.querySelector('#led1'),
            537509940: board.querySelector('#led2'),
            537509941: board.querySelector('#led3'),
            537509943: board.querySelector('#led4')
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

        window.MbedJSHal.pins.on('pin_write', function(pin, value) {
            if (pin in builtInLeds) {
                setBuiltInLed(pin, value);
            }
        });

        // also need to check for initial state
        Object.keys(builtInLeds).forEach(function(pin) {
            var v = window.MbedJSHal.pins.get_pin_value(pin);
            if (v !== -1) {
                setBuiltInLed(pin, v);
            }
        });
    }

})();

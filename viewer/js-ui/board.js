(function() {

    var svg = document.querySelector('#board-svg');

    function attachHandlers(board) {
        MbedJSHal.gpio.init_out(null, MbedJSHal.PinNames.LED1, 0);
        MbedJSHal.gpio.init_out(null, MbedJSHal.PinNames.LED2, 0);
        MbedJSHal.gpio.init_out(null, MbedJSHal.PinNames.LED3, 0);
        MbedJSHal.gpio.init_out(null, MbedJSHal.PinNames.LED4, 0);
        MbedJSHal.gpio.init_in(null, MbedJSHal.PinNames.BUTTON1, 0);
        MbedJSHal.gpio.init_in(null, MbedJSHal.PinNames.BUTTON2, 0);

        var builtInLeds = {};
        builtInLeds[MbedJSHal.PinNames.LED1] = board.querySelector('#led1');
        builtInLeds[MbedJSHal.PinNames.LED2] = board.querySelector('#led2');
        builtInLeds[MbedJSHal.PinNames.LED3] = board.querySelector('#led3');
        builtInLeds[MbedJSHal.PinNames.LED4] = board.querySelector('#led4');

        var builtInButtons = {};
        builtInButtons[MbedJSHal.PinNames.BUTTON1] = board.querySelector('#sw1');
        builtInButtons[MbedJSHal.PinNames.BUTTON2] = board.querySelector('#sw2');

        var builtInLcd = document.querySelector('#builtinlcd canvas');

        function setBuiltInLed(pin, value, type) {
            if (type !== MbedJSHal.gpio.TYPE.DIGITAL) {
                return console.error('PwmOut not supported on built-in LEDs');
            }

            if (value === 1) {
                builtInLeds[pin].classList.add('on');
            }
            else {
                builtInLeds[pin].classList.remove('on');
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
                el.classList.add('down');
                window.MbedJSHal.gpio.write(pin, 1);
            };

            el.onmouseup = function() {
                el.classList.remove('down');
                window.MbedJSHal.gpio.write(pin, 0);
            };
        });

        // set up lcd handlers
        (function() {
            window.MbedJSHal.C12832.addListener('update_display', function(mosi, miso, sck, buffer) {
                if (mosi !== window.MbedJSHal.PinNames.p5 || miso !== window.MbedJSHal.PinNames.p6 || sck !== window.MbedJSHal.PinNames.p7) {
                    return;
                }

                // so... we're getting 4096 bytes...
                var x = 0;
                var y = 0;
                var PIXEL_SIZE = 1;

                var ctx = builtInLcd.getContext('2d');

                for (var ix = 0; ix < buffer.length; ix++) {
                    ctx.fillStyle = buffer[ix] === 1 ? '#000' : '#767c69';
                    ctx.fillRect(x, y, PIXEL_SIZE, PIXEL_SIZE);

                    x += PIXEL_SIZE;
                    if (x === (128 * PIXEL_SIZE)) {
                        x = 0;
                        y += PIXEL_SIZE;
                    }
                }
            });

            function onResize() {
                var containerWidth = Number(getComputedStyle(builtInLcd.parentNode).width.replace(/px$/, ''));
                var scale = containerWidth / 128;
                builtInLcd.style.transform = 'scale(' + scale + ')';
            }
            window.addEventListener('resize', onResize);

            onResize();
        })();
    }

    attachHandlers(svg);

})();

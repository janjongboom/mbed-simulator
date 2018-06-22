(function() {
    window.socket = io.connect(location.origin);

    var terminal = new Terminal();
    terminal.open(document.querySelector('#output'));

    var uartLedEl = document.querySelector('#leduart');
    var uartLedTimeout;

    var Module = {
        preRun: [],
        postRun: [
            function() {
                document.querySelector('#ledpwr').classList.add('on');
            }
        ],
        print: (function () {
            return function (text) {
                clearTimeout(uartLedTimeout);
                uartLedEl.classList.add('on');

                uartLedTimeout = setTimeout(function() {
                    uartLedEl.classList.remove('on');
                }, 50);

                for (var ix = 0; ix < arguments.length; ix++) {
                    // this is an emscripten thing... only flushes when a newline happens.
                    terminal.write(arguments[ix] + '\r\n');
                }
            };
        })(),
        printErr: function (text) {
            for (var ix = 0; ix < arguments.length; ix++) {
                // terminal.write(arguments[ix]);
                console.error(arguments[ix]);
            }
        },
        setStatus: function (text) {
            var statusElement = document.querySelector('#status');
            if (!Module.setStatus.last) Module.setStatus.last = {
                time: Date.now(),
                text: ''
            };
            if (text === Module.setStatus.text) return;
            var m = text.match(/([^(]+)\((\d+(\.\d+)?)\/(\d+)\)/);
            var now = Date.now();
            if (m && now - Date.now() < 30) return; // if this is a progress update, skip it if too soon
            if (m) {
                text = m[1];
            }
            statusElement.textContent = text;
        },
        totalDependencies: 0,
        monitorRunDependencies: function (left) {
            this.totalDependencies = Math.max(this.totalDependencies, left);
            Module.setStatus(left ? 'Preparing... (' + (this.totalDependencies - left) + '/' + this.totalDependencies + ')' : 'All downloads complete.');
        }
    };
    Module.setStatus('Downloading...');

    window.onerror = function (event) {
        // TODO: do not warn on ok events like simulating an infinite loop or exitStatus
        Module.setStatus('Exception thrown, see JavaScript console');
        Module.setStatus = function (text) {
            if (text) Module.printErr('[post-exception status] ' + text);
        };
    };

    window.MbedJSHal = {
        die: function () {
            Module.setStatus('Board has died');
            Module.printErr('[post-exception status] mbed_die() was called');
        }
    };

    window.MbedJSUI = {};

    window.Module = Module;
})();

(function() {
    window.socket = io.connect(location.origin);

    var Module = {
        preRun: [
            function() {
                FS.init(function() {
                    console.log('FS.stdin not handled (should not reach this)');
                }, function(c) {
                    if (c > 0) window.MbedJSHal.serial.write(c);
                }, function(c) {
                    if (c > 0) window.MbedJSHal.serial.write(c);
                })
            },
            function() {
                addRunDependency('IDBFS');
                FS.mkdir('/IDBFS');
                FS.mount(IDBFS, {}, '/IDBFS');

                FS.syncfs(true, function (err) {
                    if (err) {
                        console.error('Could not sync /IDBFS', err);
                    }
                    else {
                        console.log('Synced /IDBFS');
                    }
                    removeRunDependency('IDBFS');
                });
            },
            function() {
                if (typeof window.onStartExecution === 'function') {
                    window.onStartExecution();
                }
            }
        ],
        postRun: [],
        print: function (text) {
            console.log('print called', text);
            for (var ix = 0; ix < arguments.length; ix++) {
                var line = arguments[ix];

                for (var lx = 0; lx < line.length; lx++) {
                    window.MbedJSHal.serial.write(line[lx]);
                }
                window.MbedJSHal.serial.write('\r');
                window.MbedJSHal.serial.write('\n');
            }
        },
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

    window.onerror = function (message) {
        // TODO: do not warn on ok events like simulating an infinite loop or exitStatus
        Module.setStatus('Exception thrown, see JavaScript console');
        Module.setStatus = function (text) {
            if (text) Module.printErr('[post-exception status] ' + text);
        };
        if (typeof window.onFailedExecution === 'function') {
            window.onFailedExecution(message);
        }
    };

    window.MbedJSHal = {
        die: function () {
            Module.setStatus('Board has died');
            Module.printErr('[post-exception status] mbed_die() was called');
            if (typeof window.onFailedExecution === 'function') {
                window.onFailedExecution('Board has died');
            }
        },
        syncIdbfs: function() {
            FS.syncfs(false, function (err) {
                if (err) {
                    console.error('Could not sync /IDBFS');
                }
                else {
                    console.log('Synced /IDBFS');
                }
            });
        },
        clearIdbfs: function() {
            function rmRecursive(path) {
                FS.readdir(path).forEach(function(item) {
                    if (item === '.' || item === '..') return;

                    item = path + '/' + item;

                    console.log('reading', item, FS.stat(item).mode)

                    if ((FS.stat(item).mode & 00170000) === 0040000) {
                        console.log(item, 'is directory, gonna remove');
                        rmRecursive(item);
                        FS.rmdir(item);
                    }
                    else {
                        console.log('unlink', item);
                        FS.unlink(item);
                    }
                });
            }

            rmRecursive('/IDBFS');

            window.MbedJSHal.syncIdbfs();
        }
    };

    window.MbedJSUI = {};

    window.Module = Module;
})();

var statusElement = document.getElementById('status');

window.socket = io.connect(location.origin);

var Module = {
    preRun: [],
    postRun: [],
    print: (function() {
    var element = document.getElementById('output');
    if (element) element.value = ''; // clear browser cache
    return function(text) {
        if (arguments.length > 1) text = Array.prototype.slice.call(arguments).join(' ');
        // These replacements are necessary if you render to raw HTML
        //text = text.replace(/&/g, "&amp;");
        //text = text.replace(/</g, "&lt;");
        //text = text.replace(/>/g, "&gt;");
        //text = text.replace('\n', '<br>', 'g');
        // console.log(text);
        if (element) {
        element.value += text + "\n";
        element.scrollTop = element.scrollHeight; // focus on bottom
        }
    };
    })(),
    printErr: function(text) {
    if (arguments.length > 1) text = Array.prototype.slice.call(arguments).join(' ');
    if (0) { // XXX disabled for safety typeof dump == 'function') {
        dump(text + '\n'); // fast, straight to the real console
    } else {
        console.error(text);
    }
    },
    setStatus: function(text) {
    if (!Module.setStatus.last) Module.setStatus.last = { time: Date.now(), text: '' };
    if (text === Module.setStatus.text) return;
    var m = text.match(/([^(]+)\((\d+(\.\d+)?)\/(\d+)\)/);
    var now = Date.now();
    if (m && now - Date.now() < 30) return; // if this is a progress update, skip it if too soon
    if (m) {
        text = m[1];
    }
    statusElement.innerHTML = text;
    },
    totalDependencies: 0,
    monitorRunDependencies: function(left) {
    this.totalDependencies = Math.max(this.totalDependencies, left);
    Module.setStatus(left ? 'Preparing... (' + (this.totalDependencies-left) + '/' + this.totalDependencies + ')' : 'All downloads complete.');
    }
};
Module.setStatus('Downloading...');
window.onerror = function(event) {
    // TODO: do not warn on ok events like simulating an infinite loop or exitStatus
    Module.setStatus('Exception thrown, see JavaScript console');
    Module.setStatus = function(text) {
    if (text) Module.printErr('[post-exception status] ' + text);
    };
};

window.MbedJSHal = {
    die: function() {
        Module.setStatus('Board has died');
        Module.printErr('[post-exception status] mbed_die() was called');
    }
};

window.MbedJSUI = {};

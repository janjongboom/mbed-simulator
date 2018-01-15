var statusElement = document.getElementById('status');

window.dumpCanvasToTmpFile = function() {
        // 00000D02 00000001 00000310
        var d = new Uint8Array(12 + (28 * 28 * 4));
        d[0] = 0;
        d[1] = 0;
        d[2] = 0xd;
        d[3] = 0x2;

        d[4] = 0x0;
        d[5] = 0x0;
        d[6] = 0x0;
        d[7] = 0x1;

        d[8] = 0x0;
        d[9] = 0x0;
        d[10] = 0x3;
        d[11] = 0x10;

        var ix = 12;

        // make canvas copy...
        var canvasCopy = document.createElement('canvas');
        var copyContext = canvasCopy.getContext('2d');
        canvasCopy.width = 28;
        canvasCopy.height = 28;
        copyContext.drawImage(document.querySelector('#mlp'), 0, 0, 28, 28);

        // document.querySelector('#components').appendChild(canvasCopy);

        var imgData = copyContext.getImageData(0, 0, 28, 28).data;
        for (var jx = 0; jx < (28 * 28 * 4); jx += 4) {
            var a = imgData[jx + 3];
            a /= 255;

            // now encode it as float32...
            var farr = new Float32Array(1);
            farr[0] = a;
            var barr = new Uint8Array(farr.buffer);

            // switch endianness
            d[ix++] = barr[3];
            d[ix++] = barr[2];
            d[ix++] = barr[1];
            d[ix++] = barr[0];
        }

        FS.writeFile('/fs/tmp.idx', d, { encoding: 'binary' });
}

var Module = {
    preRun: [],
    postRun: [
        function() {
            var file = new DataView(FS.readFile('/fs/testData/deep_mlp/import-Placeholder_0.idx').buffer, 12, (28 * 28 * 4));
            window.f = file;

            var c = document.createElement('div');
            c.innerHTML = '<canvas id="mlp"></canvas><button id="clear-utensor">Clear canvas</button>';
            c.style.border = 'solid 1px black';

            var PX_SIZE = 4;

            var canvas = c.querySelector('#mlp');
            canvas.width = 28 * PX_SIZE;
            canvas.height = 28 * PX_SIZE;
            var ctx = canvas.getContext('2d');
            document.querySelector('#components').appendChild(c);

            canvas.onmousedown = function(e) {
                var x = e.clientX - canvas.offsetLeft;
                var y = e.clientY - canvas.offsetTop;

                this.X = x;
                this.Y = y;
            };

            canvas.onmousemove = function(e) {
                if (e.buttons !== 1) return;
                var x = e.clientX - canvas.offsetLeft;
                var y = e.clientY - canvas.offsetTop;

                ctx.beginPath();
                ctx.imageSmoothingEnabled = true;
                ctx.moveTo(this.X, this.Y);
                ctx.lineCap = 'round';
                ctx.lineWidth = 5;
                ctx.lineTo(x, y);
                ctx.strokeStyle = 'black';
                ctx.stroke();

                this.X = x;
                this.Y = y;
            };

            c.querySelector('#clear-utensor').onclick = function() {
                ctx.clearRect(0, 0, 28 * PX_SIZE, 28 * PX_SIZE);

                ctx.strokeStyle = '#ccc';
                ctx.lineWidth = 1;
                ctx.strokeRect(4 * PX_SIZE, 4 * PX_SIZE, 20 * PX_SIZE, 20 * PX_SIZE);
            };

            c.querySelector('#clear-utensor').onclick();

            // for (var row = 0; row < 28; row++) {
            //     for (var col = 0; col < 28; col++) {
            //         var v = file.getFloat32(((row * 28) + col) * 4, false);
            //         ctx.fillStyle = 'rgba(0, 0, 0, ' + v + ')';
            //         ctx.fillRect(col * PX_SIZE, row * PX_SIZE, PX_SIZE, PX_SIZE);
            //     }
            // }
        }
    ],
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
        statusElement.innerHTML = text;
    },
    totalDependencies: 0,
    monitorRunDependencies: function(left) {
        this.totalDependencies = Math.max(this.totalDependencies, left);
        Module.setStatus(left ? 'Preparing... (' + (this.totalDependencies - left) + '/' + this.totalDependencies + ')' : 'All downloads complete.');
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

window.MbedJSHal.C12832 = (function() {
    var obj = new EventEmitter();

    var PIXEL_SIZE = 2;

    var cnvs = document.createElement('canvas');
    cnvs.id = 'c12832';
    cnvs.height = 32 * PIXEL_SIZE;
    cnvs.width = 128 * PIXEL_SIZE;

    obj.init = function() {
        obj.emit('init');

        document.querySelector('#board').appendChild(cnvs);
    };
    obj.update_display = function(buffer) {
        obj.emit('update_display', buffer);

        // so... we're getting 4096 bytes...
        var x = 0;
        var y = 0;

        var ctx = cnvs.getContext('2d');

        for (var ix = 0; ix < buffer.length; ix++) {
            ctx.fillStyle = buffer[ix] === 1 ? '#767c69' : '#fff';
            ctx.fillRect(x, y, PIXEL_SIZE, PIXEL_SIZE);

            x += PIXEL_SIZE;
            if (x === (128 * PIXEL_SIZE)) {
                x = 0;
                y += PIXEL_SIZE;
            }

        }
    };

    return obj;
})();

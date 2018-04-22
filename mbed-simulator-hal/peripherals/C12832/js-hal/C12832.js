window.MbedJSHal.C12832 = (function() {
    var obj = new EventEmitter();

    obj.init = function(mosi, miso, sck) {
        obj.emit('init', mosi, miso, sck);
    };
    obj.update_display = function(mosi, miso, sck, buffer) {
        obj.emit('update_display', mosi, miso, sck, buffer);
    };

    return obj;
})();

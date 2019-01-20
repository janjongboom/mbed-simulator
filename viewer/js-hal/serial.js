window.MbedJSHal.serial = (function() {

    var obj = new EventEmitter();

    var stdioBuffer = [];

    obj.init = function(ptr) {
        this.ptr = ptr;
    }

    obj.onStdIn = function (c) {
        stdioBuffer.push(c);

        if (this.ptr) {
            ccall('invoke_serial_irq', null,
                [ 'number' ],
                [ this.ptr ],
                { async: true });
        }
    };

    window.socket.on('stdin', obj.onStdIn.bind(obj));

    obj.readable = function() {
        return stdioBuffer.length > 0 ? 1 : 0;
    };

    obj.read = function() {
        if (stdioBuffer.length > 0) {
            return stdioBuffer.shift();
        }

        return 0;
    };

    obj.write = function(c) {
        obj.emit('stdout', c);
    };

    obj.writeLine = function(l) {
        obj.emit('stdout-line', l);
    };

    return obj;
})();

window.MbedJSHal.lora = (function() {
    var host = window.location.protocol + '//' + window.location.host;

    var radioPtr = 0;

    window.socket.on('lora-downlink', function (buffer) {
        // todo check if its actually msg for us
        console.log('lora-downlink', buffer);
        obj.downlinkMsg = buffer;

        var dataPtr = Module._malloc(buffer.length);
        var dataHeap = new Uint8Array(Module.HEAPU8.buffer, dataPtr, buffer.length);
        for (var ix = 0; ix < buffer.length; ix++) {
            dataHeap[ix] = buffer[ix];
        }

        if (!radioPtr) {
            return console.error('LoRa radio ptr is 0!');
        }

        ccall('handle_lora_downlink', null, [ 'number', 'number', 'number' ], [ radioPtr, dataPtr, buffer.length ], { async: true });
    });

    function init(ptr) {
        console.log('LoRa radio init', ptr);
        radioPtr = ptr;
    }

    function sendLoRa(channel, power, bandwidth, datarate, data, size) {
        var buffer = [].slice.call(new Uint8Array(Module.HEAPU8.buffer, data, size));

        var x = new XMLHttpRequest();
        x.onload = function() {
            console.log('sendLoRa', x.status, x.responseText);
        };
        x.open('POST', host + '/api/lora/send');
        x.setRequestHeader('Content-Type', 'application/json');
        x.send(JSON.stringify({
            host: 'router.eu.thethings.network',
            port: 1700,
            payload:
            buffer,
            freq: channel,
            bandwidth: bandwidth,
            datarate: datarate
        }));

        console.log('sendLoRa', 'channel', channel, 'power', power, 'bandwidth', bandwidth, 'datarate', datarate, 'buffer', buffer, 'size', size);
        console.log('encoded packet', buffer.map(function(b) {
            var j = b.toString(16).toUpperCase();
            if (j.length === 1) return '0' + j;
            return j;
        }).join(''));
    }

    function sendFsk(channel, power, bandwidth, datarate, data, size) {
        var buffer = [].slice.call(new Uint8Array(Module.HEAPU8.buffer, data, size));

        console.log('sendFsk', 'channel', channel, 'power', power, 'bandwidth', bandwidth, 'datarate', datarate, 'buffer', buffer, 'size', size);
    }

    var obj = {
        init: init,
        sendLoRa: sendLoRa,
        sendFsk: sendFsk
    };

    return obj;

})();

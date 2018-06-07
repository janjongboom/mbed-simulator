window.MbedJSHal.lora = (function() {
    var host = window.location.protocol + '//' + window.location.host;

    var radioPtr = 0;
    var ts = null; // timesync

    window.socket.on('lora-downlink', function (ev) {
        let buffer = ev.data;

        // todo check if its actually msg for us
        console.log(Date.now(), 'lora-downlink', ev);
        obj.downlinkMsg = buffer;

        var dataPtr = Module._malloc(buffer.length);
        var dataHeap = new Uint8Array(Module.HEAPU8.buffer, dataPtr, buffer.length);
        for (var ix = 0; ix < buffer.length; ix++) {
            dataHeap[ix] = buffer[ix];
        }

        if (!radioPtr) {
            return console.error('LoRa radio ptr is 0!');
        }

        // when to send?
        var delay = ev.sendTs - ts.now();
        console.log('send delay is', delay);

        function go() {
            // @todo: check modulation
            ccall('handle_lora_downlink', null,
                [ 'number', 'number', 'number', 'number', 'number', 'number' ],
                [ radioPtr, dataPtr, buffer.length, ev.freq, ev.bandwidth, ev.datarate ],
                { async: true });
        }

        if (delay <= 0) {
            go();
        }
        else {
            setTimeout(go, delay);
        }
    });

    function init(ptr) {
        console.log('LoRa radio init', ptr);
        radioPtr = ptr;

        // create a timesync instance
        ts = timesync.create({
            server: '/timesync',
            interval: 10000
        });
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

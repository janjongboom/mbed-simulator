window.MbedJSHal.lora = (function() {
    var host = window.location.protocol + '//' + window.location.host;

    function sendLoRa(channel, power, bandwidth, datarate, data, size) {
        var buffer = [].slice.call(new Uint8Array(Module.HEAPU8.buffer, data, size));

        var x = new XMLHttpRequest();
        x.onload = function() {
            console.log('sendLoRa', x.status, x.responseText);
        };
        x.open('POST', host + '/api/lora/send');
        x.setRequestHeader('Content-Type', 'application/json');
        x.send(JSON.stringify({ host: 'router.eu.thethings.network', port: 1700, payload: buffer }));

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

    return {
        sendLoRa: sendLoRa,
        sendFsk: sendFsk
    };

})();

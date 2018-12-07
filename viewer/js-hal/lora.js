window.MbedJSHal.lora = (function() {
    var host = window.location.protocol + '//' + window.location.host;

    var radioPtr = 0;
    var ts = null; // timesync

    // based on https://docs.google.com/spreadsheets/d/1voGAtQAjC1qBmaVuP1ApNKs1ekgUjavHuVQIXyYSvNc/edit#gid=0
    function calculateTimeOnAir(_dataLength, _datarate, _bandwidth) {
        var payloadSize = _dataLength;
        var spreadFactor = _datarate; // already normalized
        var explicitHeader = 1;
        var lowDr = 0;
        var codingRate = 5; // 4/5
        var preamble = 8;
        var bandwidth = 125;
        switch (_bandwidth) {
            case 7: bandwidth = 125; break;
            case 8: bandwidth = 250; break;
            case 9: bandwidth = 500; break;
        }

        var tsym = Math.pow(2, spreadFactor) / (bandwidth * 1000) * 1000;
        // console.log('tsym', tsym);
        var tPreamble = (preamble + 4.25) * tsym;
        // console.log('tpreamb', tPreamble);
        var payloadSymNb = 8+(Math.max(Math.ceil((8*payloadSize-4*spreadFactor+28+16-20*(1-explicitHeader))/(4*(spreadFactor-2*lowDr)))*(codingRate),0));
        // console.log('payloadSymNb', payloadSymNb);
        var tPayload = payloadSymNb * tsym;
        var tPacket = tPayload + tPreamble;
        // console.log('tPacket', tPacket);
        return tPacket;
    }

    window.socket.on('lora-downlink', function (ev) {
        let buffer = ev.data;

        // todo check if its actually msg for us
        // console.log(Date.now(), 'lora-downlink', ev);
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
        var timeOnAir = calculateTimeOnAir(buffer.length, ev.datarate, ev.bandwidth);
        var delay = ev.sendTs - ts.now() + timeOnAir;
        console.log('lora RX send delay is', delay);

        function go() {
            console.log(/*Date.now(), */'handle_lora_downlink', 'dataLength', buffer.length, 'freq', ev.freq, 'bandwidth', ev.bandwidth, 'datarate', ev.datarate);
            // @todo: check modulation
            ccall('handle_lora_downlink', null,
                [ 'number', 'number', 'number', 'number', 'number', 'number' ],
                [ radioPtr, dataPtr, buffer.length, ev.freq, ev.bandwidth, ev.datarate ],
                { async: true });
        }

        if (delay <= 0) {
            // this shouldn't be necessary as it'll be impossible to hit the windows on f.e. Class C, but
            // need it to work on some slow internet connections
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

        var timeOnAir = calculateTimeOnAir(buffer.length, datarate, bandwidth);

        setTimeout(function() {
            var x = new XMLHttpRequest();
            x.onload = function() {
                console.log('sendLoRa', x.status, x.responseText);
            };
            x.open('POST', host + '/api/lora/send');
            x.setRequestHeader('Content-Type', 'application/json');
            x.send(JSON.stringify({
                payload: buffer,
                freq: channel,
                bandwidth: bandwidth,
                datarate: datarate
            }));

            console.log('sendLoRa', 'timeOnAir', timeOnAir, 'channel', channel, 'power', power, 'bandwidth', bandwidth, 'datarate', datarate, 'buffer', buffer, 'size', size);
            console.log('encoded packet', buffer.map(function(b) {
                var j = b.toString(16).toUpperCase();
                if (j.length === 1) return '0' + j;
                return j;
            }).join(''));
        }, timeOnAir);
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

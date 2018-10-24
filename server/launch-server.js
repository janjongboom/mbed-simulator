const express = require('express');
const ips = require('./get_ips')();
const bodyParser = require('body-parser');
const net = require('net');
const dgram = require('dgram');
const hbs = require('hbs');
const Path = require('path');
const fs = require('fs');
const compile = require('./compile');
const { exists } = require('../build-tools/helpers');
const promisify = require('es6-promisify').promisify;
const udp = require('dgram');
const ttnGwClient = udp.createSocket('udp4');
const mac = require('getmac');
const timesyncServer = require('timesync/server');
const version = JSON.parse(fs.readFileSync(Path.join(__dirname, '..', 'package.json'), 'utf-8')).version;

const LORA_PORT = 1700;
const LORA_HOST = 'router.eu.thethings.network';

let startupTs = Date.now();

module.exports = function(outFolder, port, callback) {
    const app = express();
    const server = require('http').Server(app);
    const io = require('socket.io')(server);

    app.set('view engine', 'html');
    app.set('views', Path.join(__dirname, '..', 'viewer'));
    app.engine('html', hbs.__express);

    app.use('/out', express.static(outFolder));

    app.use('/demos', express.static(Path.join(__dirname, '..', 'demos')));
    app.use('/peripherals', express.static(Path.join(__dirname, '..', 'mbed-simulator-hal', 'peripherals')));
    app.use('/timesync', timesyncServer.requestHandler);

    app.use(express.static(Path.join(__dirname, '..', 'viewer')));
    app.use(bodyParser.json());

    app.get('/api/network/ip', (req, res, next) => {
        if (!ips.length) return res.send('');
        res.send(ips[0].iface.address);
    });

    app.get('/api/network/mac', (req, res, next) => {
        if (!ips.length) return res.send('');
        res.send(ips[0].iface.mac);
    });

    app.get('/api/network/netmask', (req, res, next) => {
        if (!ips.length) return res.send('');
        res.send(ips[0].iface.netmask);
    });

    let sockets = {};
    let socketIx = 0;

    app.post('/api/network/socket_open', (req, res, next) => {
        if (req.body.protocol === 0) { // TCP
            console.log('Opening new TCP socket');
            let s = sockets[++socketIx] = new net.Socket();
            s.packets = Buffer.from([]);
            res.send(socketIx + '');

            s.on('data', data => {
                console.log('Received TCP packet on socket', socketIx, data);

                s.packets = Buffer.concat([s.packets, data]);
            });
        }
        else if (req.body.protocol === 1) { // UDP
            console.log('Opening new UDP socket');
            let s = sockets[++socketIx] = dgram.createSocket('udp4');
            s.packets = Buffer.from([]);
            res.send(socketIx + '');

            s.on('message', (msg, rinfo) => {
                console.log('Received UDP packet on socket', socketIx, msg, rinfo);

                s.packets = Buffer.concat([s.packets, msg]);
                // s.packets.push({ msg: msg, rinfo: rinfo });
            });
        }
        else {
            res.send('' + -1);
        }
    });

    app.post('/api/network/socket_close', (req, res, next) => {
        console.log('Closing socket', req.body.id);

        if (!sockets[req.body.id]) {
            return res.send('' + -3001);
        }

        let s = sockets[req.body.id];

        if (s instanceof net.Socket) {
            s.destroy();
        }
        else {
            s.close();
        }

        delete sockets[req.body.id];

        res.send('0');
    });

    app.post('/api/network/socket_send', (req, res, next) => {
        console.log('Sending socket', req.body.id, req.body.data.length, 'bytes');

        if (!sockets[req.body.id]) {
            return res.send('' + -3001);
        }

        let s = sockets[req.body.id];

        if (s instanceof net.Socket) {
            s.write(Buffer.from(req.body.data));
        }
        else {
            s.send(Buffer.from(req.body.data), s.port, s.hostname);
        }

        res.send(req.body.data.length + '');
    });

    app.post('/api/network/socket_connect', (req, res, next) => {
        console.log('Connecting socket', req.body.id, req.body.hostname, req.body.port);

        if (!sockets[req.body.id]) {
            return res.send('' + -3001);
        }

        let s = sockets[req.body.id];

        if (s instanceof net.Socket) {
            s.connect(req.body.port, req.body.hostname);
        }
        else {
            s.port = req.body.port;
            s.hostname = req.body.hostname;
        }

        res.send('0');
    });

    app.post('/api/network/socket_recv', (req, res, next) => {
        console.log('Receiving from socket', req.body.id, 'max size', req.body.size);

        if (!sockets[req.body.id]) {
            return res.send('' + -3001);
        }

        let s = sockets[req.body.id];

        function send() {
            let buff = [].slice.call(s.packets.slice(0, req.body.size));
            s.packets = s.packets.slice(req.body.size);

            res.send(JSON.stringify(buff));
        }

        if (s.packets.length > 0) {
            return send();
        }

        // if no data... need to block until there is
        let iv = setInterval(() => {
            if (s.packets.length > 0) {
                clearInterval(iv);
                send();
            }
        }, 33);

    });

    app.get('/view/:script', (req, res, next) => {
        if (/\.js\.mem$/.test(req.params.script)) {
            return res.sendFile(Path.join(outFolder, req.params.script));
        }

        if (/\.js\.map$/.test(req.params.script)) {
            return res.sendFile(Path.join(outFolder, req.params.script));
        }

        if (/\.data$/.test(req.params.script)) {
            return res.sendFile(Path.join(outFolder, req.params.script));
        }

        (async function() {
            let jshal = [];
            let jsui = [];
            let peripherals = [];

            let componentsPath = Path.join(outFolder, req.params.script + '.js.components');
            if (await exists(componentsPath)) {
                let components = JSON.parse(await promisify(fs.readFile)(componentsPath, 'utf-8'));

                jshal = jshal.concat(components.jshal);
                jsui = jsui.concat(components.jsui);
                peripherals = peripherals.concat(components.peripherals);
            }

            function normalize(a) {
                return a.map(f => {
                    if (f.indexOf('mbed-simulator-hal/peripherals/') === 0) {
                        return f.replace(/^mbed-simulator-hal/, '');
                    }
                    return '/out/' + f;
                }).map(f => { return { script: f } });
            }

            // map to proper route
            jshal = normalize(jshal);
            jsui = normalize(jsui);

            res.render('viewer.html', {
                script: req.params.script,
                jshal: jshal,
                jsui: jsui,
                peripherals: JSON.stringify(peripherals),
                version: version
            });
        })().catch(err => {
            return next(err);
        });
    });

    let tokenVal = 0;
    function getNextToken() {
        tokenVal++;

        if (tokenVal > 255*255) tokenVal = 0;

        return [ tokenVal >> 8 & 0xff, tokenVal & 0xff ];
    }

    let gwId = [0, 0, 0, 0, 0, 0, 0, 0];

    app.post('/api/lora/send', (req, res, next) => {
        if (!req.body.payload) return next('Missing body.payload');
        if (!req.body.freq) return next('Missing body.freq');
        if (!req.body.bandwidth) return next('Missing body.bandwidth');
        if (!req.body.datarate) return next('Missing body.datarate');

        let [ t1, t2 ] = getNextToken();

        let buff = Buffer.from([
            0x02, // protocol version
            t1, t2, // random token
            0x0, // PUSH_DATA
            gwId[0], gwId[1], gwId[2], gwId[3], gwId[4], gwId[5], gwId[6], gwId[7], // gw mac address
        ]);

        let payload = Buffer.from(req.body.payload);

        let bw = 'BW125';
        switch (req.body.bandwidth) {
            case 7: bw = 'BW125'; break;
            case 8: bw = 'BW250'; break;
            case 9: bw = 'BW500'; break;
            // todo
        }

        let sf = 'SF7';
        switch (req.body.datarate) {
            case 7: sf = 'SF7'; break;
            case 8: sf = 'SF8'; break;
            case 9: sf = 'SF9'; break;
            case 10: sf = 'SF10'; break;
            case 11: sf = 'SF11'; break;
            case 12: sf = 'SF12'; break;
        }

        // this happens quite fast... every 72 minutes.
        if ((Date.now() - startupTs) * 1000 > 0xffffffff) {
            console.log('startupTs overflown');
            startupTs = Date.now();
        }

        // @todo: fix this
        let msg = {
            "rxpk": [{
                "time": new Date().toISOString(),
                // this needs to be uint32_t in us... it's not a lot
                "tmst": (Date.now() - startupTs) * 1000,
                "chan": 2,
                "rfch": 0,
                "freq": req.body.freq / 1000 / 1000,
                "stat": 1,
                "modu": "LORA",
                "datr": sf + bw,
                "codr": "4/6",
                "rssi": -35,
                "lsnr": 5,
                "size": payload.length,
                "data": payload.toString('base64')
            }]
        };

        console.log('sending', msg);

        buff = Buffer.concat([ buff, Buffer.from(JSON.stringify(msg))]);

        console.log('[TTNGW] Sending', buff);

        ttnGwClient.send(buff, LORA_PORT, LORA_HOST, function(err) {
            if (err) return next(err);

            res.send('OK');
        });
    });

    app.get('/', (req, res, next) => {
        res.render('simulator.html', { version: version });
    });

    let compilationId = 0;
    app.post('/compile', (req, res, next) => {
        let id = compilationId++;

        console.time('compile' + id);
        compile(req.body.code, outFolder).then(name => {
            console.timeEnd('compile' + id);

            console.log('Compilation succeeded', id);
            res.send(name);
        }).catch(err => {
            console.timeEnd('compile' + id);

            console.log('Compilation failed', id, err);
            res.status(500).send(err);
        });
    });

    ttnGwClient.on('message',function(msg, info) {
        if (msg[0] != 0x2) return; // not right protocol
        let id1 = msg[1];
        let id2 = msg[2];
        let action = msg[3];

        if (action === 0x03) { // PULL_RESP
            let tx_ack = Buffer.from([ 0x02, id1, id2, 0x05 /*TX_ACK*/, gwId[0], gwId[1], gwId[2], gwId[3], gwId[4], gwId[5], gwId[6], gwId[7] ]);
            ttnGwClient.send(tx_ack, LORA_PORT, LORA_HOST, function(err) {
                console.log('[TTNGW] TX_ACK OK');
            });

            var data = JSON.parse(msg.slice(4).toString('utf-8'));

            var buff = new Buffer(data.txpk.data, 'base64');

            let sf = data.txpk.datr.match(/SF(\d+)/)[1];
            let bw1 = data.txpk.datr.match(/BW(\d+)/)[1];
            let bw = 7;

            switch (bw1) {
                case '125': bw = 7; break;
                case '250': bw = 8; break;
                case '500': bw = 9; break;
            }

            console.log('[TTNGW] got downlink msg', msg, data);

            let delay = 0;

            // immediate?
            if (data.txpk.imme) {
                delay = 0;
            }
            else if (!data.txpk.tmst) {
                console.warn('tmst missing from txpk');
                delay = 0;
            }
            else {
                let now = Date.now() - startupTs;
                let tts = (data.txpk.tmst / 1000) - now;
                console.log('time to send is', tts);
                if (tts < 0 || tts > 5000) {
                    console.log('tts invalid');
                    delay = 0;
                }
                else {
                    // time to start...
                    delay = tts;
                }
            }

            io.sockets.emit('lora-downlink', {
                data: Array.from(buff),
                freq: data.txpk.freq * 1000 * 1000,
                modulation: data.txpk.modu,
                datarate: Number(sf),
                bandwidth: bw,
                sendTs: Date.now() + delay
            });
        }
        else if (action === 0x04) { //PULL_DATA_OK
            // ignore...
        }
        else {
            console.log('[TTNGW] Received %d bytes from %s:%d',msg.length, info.address, info.port);
            console.log('[TTNGW] Message:', msg);
        }
    });

    setInterval(() => {
        let [ t1, t2 ] = getNextToken();
        let pull_data = Buffer.from([ 0x02, t1, t2, 0x02 /*PULL_DATA*/, gwId[0], gwId[1], gwId[2], gwId[3], gwId[4], gwId[5], gwId[6], gwId[7] ]);
        ttnGwClient.send(pull_data, LORA_PORT, LORA_HOST, function(err) {
            // console.log('PULL_DATA OK');
        });
    }, 5000);

    mac.getMac(function(err, m) {
        if (err) {
            return console.error('Could not find MAC address... Disabling LoRa simulation');
        }
        gwId = m.split(':').map(d => parseInt(d, 16));
        gwId.splice(3, 0, 0x0);
        gwId.splice(3, 0, 0x0);

        console.log('LoRaWAN information:');
        console.log('\tGateway ID:            ', gwId.map(d => {
            let v = d.toString(16);
            if (v.length === 1) return '0' + v;
            return v;
        }).join(':'));
        console.log('\tPacket forwarder host: ', LORA_HOST);
        console.log('\tPacket forwarder port: ', LORA_PORT);
        console.log(`\tMake sure the gateway registered in the network server running the *legacy packet forwarder*`);
    });

    console.log('Mbed Simulator v' + version);

    server.listen(port, process.env.HOST || '0.0.0.0', function () {
        console.log('Web server listening on port %s!', port);

        callback();
    });
};

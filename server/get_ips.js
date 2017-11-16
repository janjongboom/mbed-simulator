'use strict';

var os = require('os');

module.exports = function () {
    var ifaces = os.networkInterfaces();

    var ret = [];

    Object.keys(ifaces).forEach(function (ifname) {
        var alias = 0;

        ifaces[ifname].forEach(function (iface) {
            if ('IPv4' !== iface.family || iface.internal !== false) {
                // skip over internal (i.e. 127.0.0.1) and non-ipv4 addresses
                return;
            }

            if (alias >= 1) {
                // this single interface has multiple ipv4 addresses
                ret.push({ name: ifname + ':' + alias, iface: iface });
            } else {
                // this interface has only one ipv4 adress
                ret.push({ name: ifname, iface: iface });
            }
            ++alias;
        });
    });

    return ret;
};

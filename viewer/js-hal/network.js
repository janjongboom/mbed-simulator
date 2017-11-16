window.MbedJSHal.network = (function() {
    /**
     * NOTE: THIS USES SYNCHRONOUS XMLHTTPREQUEST!
     *
     * Because the C++ API also expectes sync calls.
     * Yes, this is very dirty.
     */
    var host = window.location.protocol + '//' + window.location.host;

    function get_mac_address() {
        var x = new XMLHttpRequest();
        x.open('GET', host + '/api/network/mac', false);
        x.send();
        return allocate(intArrayFromString(x.responseText), 'i8', ALLOC_NORMAL);
    }

    function get_ip_address() {
        var x = new XMLHttpRequest();
        x.open('GET', host + '/api/network/ip', false);
        x.send();
        return allocate(intArrayFromString(x.responseText), 'i8', ALLOC_NORMAL);
    }

    function get_netmask() {
        var x = new XMLHttpRequest();
        x.open('GET', host + '/api/network/netmask', false);
        x.send();
        return allocate(intArrayFromString(x.responseText), 'i8', ALLOC_NORMAL);
    }

    function socket_open(protocol) {
        console.log('socket_open', protocol);
        var x = new XMLHttpRequest();
        x.open('POST', host + '/api/network/socket_open', false);
        x.setRequestHeader('Content-Type', 'application/json');
        x.send(JSON.stringify({ protocol: protocol }));
        return Number(x.responseText);
    }

    function socket_close(id) {
        console.log('socket_close', id);
        var x = new XMLHttpRequest();
        x.open('POST', host + '/api/network/socket_close', false);
        x.setRequestHeader('Content-Type', 'application/json');
        x.send(JSON.stringify({ id: id }));
        return Number(x.responseText);
    }

    function socket_connect(id, hostname, port) {
        hostname = Pointer_stringify(hostname);

        console.log('socket_connect', id, hostname, port);
        var x = new XMLHttpRequest();
        x.open('POST', host + '/api/network/socket_connect', false);
        x.setRequestHeader('Content-Type', 'application/json');
        x.send(JSON.stringify({ id: id, hostname: hostname, port: port }));
        return Number(x.responseText);
    }

    function socket_send(id, data, size) {
        var buffer = [].slice.call(new Uint8Array(Module.HEAPU8.buffer, data, size));

        console.log('socket_send', id, data, size);
        var x = new XMLHttpRequest();
        x.open('POST', host + '/api/network/socket_send', false);
        x.setRequestHeader('Content-Type', 'application/json');
        x.send(JSON.stringify({ id: id, data: buffer }));
        return Number(x.responseText);
    }

    function socket_recv(id, buffer_ptr, size) {
        console.log('socket_recv', id, buffer_ptr, size);
        var x = new XMLHttpRequest();
        x.open('POST', host + '/api/network/socket_recv', false);
        x.setRequestHeader('Content-Type', 'application/json');
        x.send(JSON.stringify({ id: id, size: size }));

        var resp = JSON.parse(x.responseText);
        console.log('socket_recv', id, resp.length, 'bytes');
        var buff = new Uint8Array(Module.HEAPU8.buffer, buffer_ptr, size);

        // copy to buffer
        for (var ix = 0; ix < resp.length; ix++) {
            buff[ix] = resp[ix];
        }

        return resp.length;
    }

    return {
        get_mac_address: get_mac_address,
        get_ip_address: get_ip_address,
        get_netmask: get_netmask,
        socket_open: socket_open,
        socket_close: socket_close,
        socket_connect: socket_connect,
        socket_send: socket_send,
        socket_recv: socket_recv
    };

})();

window.MbedJSHal.network = (function() {

    const NSAPI_ERROR_OK                  =  0;        /*!< no error */
    const NSAPI_ERROR_WOULD_BLOCK         = -3001;     /*!< no data is not available but call is non-blocking */
    const NSAPI_ERROR_UNSUPPORTED         = -3002;     /*!< unsupported functionality */
    const NSAPI_ERROR_PARAMETER           = -3003;     /*!< invalid configuration */
    const NSAPI_ERROR_NO_CONNECTION       = -3004;     /*!< not connected to a network */
    const NSAPI_ERROR_NO_SOCKET           = -3005;     /*!< socket not available for use */
    const NSAPI_ERROR_NO_ADDRESS          = -3006;     /*!< IP address is not known */
    const NSAPI_ERROR_NO_MEMORY           = -3007;     /*!< memory resource not available */
    const NSAPI_ERROR_NO_SSID             = -3008;     /*!< ssid not found */
    const NSAPI_ERROR_DNS_FAILURE         = -3009;     /*!< DNS failed to complete successfully */
    const NSAPI_ERROR_DHCP_FAILURE        = -3010;     /*!< DHCP failed to complete successfully */
    const NSAPI_ERROR_AUTH_FAILURE        = -3011;     /*!< connection to access point failed */
    const NSAPI_ERROR_DEVICE_ERROR        = -3012;     /*!< failure interfacing with the network processor */
    const NSAPI_ERROR_IN_PROGRESS         = -3013;     /*!< operation (eg connect) in progress */
    const NSAPI_ERROR_ALREADY             = -3014;     /*!< operation (eg connect) already in progress */
    const NSAPI_ERROR_IS_CONNECTED        = -3015;     /*!< socket is already connected */
    const NSAPI_ERROR_CONNECTION_LOST     = -3016;     /*!< connection lost */
    const NSAPI_ERROR_CONNECTION_TIMEOUT  = -3017;     /*!< connection timed out */
    const NSAPI_ERROR_ADDRESS_IN_USE      = -3018;     /*!< Address already in use */
    const NSAPI_ERROR_TIMEOUT             = -3019; /*!< operation timed out */

    const SOCKET_PROTOCOL_TCP             = 0;
    const SOCKET_PROTOCOL_UDP             = 1;

    const NSDEBUG = 0;
    const log = NSDEBUG === 1 ? console.log.bind(console) : function() {};

    /**
     * NOTE: THIS USES SYNCHRONOUS XMLHTTPREQUEST!
     *
     * Because the C++ API also expectes sync calls.
     * Yes, this is very dirty.
     *
     * Most stuff is switched to websockets, but connect isn't.
     */
    function Network() {
        this.host = window.location.protocol + '//' + window.location.host;
        this.connected = false;
        this.websocket = window.socket;

        this.iface = {
            address: '',
            mac: '',
            netmask: ''
        };

        this.sockets = {};
    }

    /**
     * Connect to the network
     *
     * Note that this is a blocking call
     */
    Network.prototype.connect = function() {
        var x = new XMLHttpRequest();
        x.open('POST', this.host + '/api/network/connect', false);
        x.setRequestHeader('Content-Type', 'application/json');
        x.send();

        if (x.status !== 200) {
            return NSAPI_ERROR_CONNECTION_LOST;
        }

        this.iface = JSON.parse(x.responseText);

        return NSAPI_ERROR_OK;
    }

    /**
     * Disconnect from the network (does not do anything)
     */
    Network.prototype.disconnect = function() {
        return NSAPI_ERROR_OK;
    }

    /**
     * Get the current MAC address
     */
    Network.prototype.get_mac_address = function() {
        return allocate(intArrayFromString(this.iface.mac), 'i8', ALLOC_NORMAL);
    };

    /**
     * Get the current IP address
     */
    Network.prototype.get_ip_address = function() {
        return allocate(intArrayFromString(this.iface.address), 'i8', ALLOC_NORMAL);
    };

    /**
     * Get the current netmask
     */
    Network.prototype.get_netmask = function() {
        return allocate(intArrayFromString(this.iface.netmask), 'i8', ALLOC_NORMAL);
    };

    /**
     * Open a socket
     *
     * Note that this is a blocking call
     *
     * @param protocol 0 if TCP, 1 if UDP
     */
    Network.prototype.socket_open = function(protocol, socketPtr) {
        var url;
        if (protocol === SOCKET_PROTOCOL_TCP) {
            url = '/api/network/socket_open/tcp';
        }
        else if (protocol === SOCKET_PROTOCOL_UDP) {
            url = '/api/network/socket_open/udp';
        }
        else {
            return NSAPI_ERROR_PARAMETER;
        }

        log('socket_open', protocol);
        var x = new XMLHttpRequest();
        x.open('POST', this.host + url, false);
        x.setRequestHeader('Content-Type', 'application/json');
        x.send(JSON.stringify({ protocol: protocol }));

        var socketId = x.responseText;

        this.sockets[socketId] = {
            socketId: socketId,
            protocol: protocol,
            rxBuffer: [],
            error: false,
            ptr: socketPtr
        };

        log('socket_open', protocol, 'OK', socketId);

        // subscribe for changes
        this.websocket.emit('socket-subscribe', socketId);

        this.websocket.on('socket-data-' + socketId, this.onSocketData.bind(this, this.sockets[socketId]));
        this.websocket.on('socket-error-' + socketId, this.onSocketError.bind(this, this.sockets[socketId]));

        return socketId;
    };

    /**
     * Gets called from a websocket whenever there is data for a socket
     * This data is added to the receive buffer on the socket
     *
     * @param {*} socket Socket
     * @param {*} data Byte array
     */
    Network.prototype.onSocketData = function(socket, data) {
        log('onSocketData', socket.socketId, data.length + ' bytes');

        data = JSON.parse(data);

        socket.rxBuffer = socket.rxBuffer.concat(data);

        this.signalEvent(socket);
    };

    /**
     * Gets called from a websocket whenever an error occured (e.g. socket is suddenly gone)
     * @param {*} socket
     */
    Network.prototype.onSocketError = function(socket) {
        socket.error = true;

        this.signalEvent(socket);
    };

    /**
     * Connect an open socket to a host
     *
     * @param {*} id
     * @param {*} hostname
     * @param {*} port
     */
    Network.prototype.socket_connect = function(id, hostname, port) {
        hostname = Pointer_stringify(hostname);

        log('socket_connect', id, hostname, port);
        var x = new XMLHttpRequest();
        x.open('POST', this.host + '/api/network/socket_connect', false);
        x.setRequestHeader('Content-Type', 'application/json');
        x.send(JSON.stringify({ id: id, hostname: hostname, port: port }));

        setTimeout(function() {
            if (this.sockets[id]) {
                this.signalEvent(this.sockets[id]);
            }
        }.bind(this), 16);

        return Number(x.responseText);
    }

    /**
     * Close a socket
     *
     * @param {*} id
     */
    Network.prototype.socket_close = function(id) {
        log('socket_close', id);
        var x = new XMLHttpRequest();
        x.open('POST', this.host + '/api/network/socket_close', false);
        x.setRequestHeader('Content-Type', 'application/json');
        x.send(JSON.stringify({ id: id }));

        if (x.status === 200) {
            delete this.sockets[id];
            return Number(x.responseText);
        }
        else {
            return NSAPI_ERROR_CONNECTION_LOST;
        }
    };

    /**
     * Receive data from a socket
     *
     * If there's no data this will return NSAPI_ERROR_WOULD_BLOCK
     *
     * @param {*} id
     * @param {*} buffer_ptr
     * @param {*} size
     */
    Network.prototype.socket_recv = function(id, buffer_ptr, size) {
        if (!this.sockets[id]) {
            return NSAPI_ERROR_NO_SOCKET;
        }

        var rxBuffer = this.sockets[id].rxBuffer;
        log('socket_recv', id, buffer_ptr, size, 'rxBuffer length', rxBuffer.length);

        // no data?
        if (rxBuffer.length === 0) {
            return NSAPI_ERROR_WOULD_BLOCK;
        }

        if (size > rxBuffer.length) {
            size = rxBuffer.length;
        }

        var buff = new Uint8Array(Module.HEAPU8.buffer, buffer_ptr, size);

        // copy to buffer
        for (var ix = 0; ix < size; ix++) {
            buff[ix] = rxBuffer[ix];
        }

        // and reduce the size of the buffer back
        this.sockets[id].rxBuffer = rxBuffer.slice(size);

        return size;
    };

    Network.prototype.socket_send = function(id, data, size) {
        var self = this;

        var buffer = [].slice.call(new Uint8Array(Module.HEAPU8.buffer, data, size));

        log('socket_send', id, data, size);
        var x = new XMLHttpRequest();
        x.open('POST', this.host + '/api/network/socket_send');
        x.setRequestHeader('Content-Type', 'application/json');

        x.onload = function() {
            log('socket_send', id, 'OK');

            setTimeout(() => {
                if (self.sockets[id]) {
                    self.signalEvent(self.sockets[id]);
                }
            }, 1);
        };

        x.send(JSON.stringify({ id: id, data: buffer }));

        return size;
    };

    /**
     * Signal back to the stack
     *
     * Events should be sent:
     * - When the connection succeeds
     * - When a message was sent successfully
     * - When a message was received
     * - ???
     */
    Network.prototype.signalEvent = function(socket) {
        log('js sigio', socket.ptr);
        ccall('handle_ethernet_sigio', null,
            [ 'number' ],
            [ socket.ptr ],
            { async: true });
    };

    return new Network();

})();

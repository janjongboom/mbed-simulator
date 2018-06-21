window.MbedJSHal.blockdevice = (function() {
    var bds = {};

    /**
     * So to make a persistent block device we use local storage
     * Unfortunately local storage only wants strings, so we stringify the content of the device
     * Pretty simple => 2 characters per byte, so:
     * [ 0xaf, 0x09 ] is stored as 'af09'
     * Not very efficient, but at least it works cross-platform.
     *
     * Data is stored under 'bd-' + keyname
     */

    function replaceAt(str, index, replace) {
        return str.substr(0, index) + replace + str.substr(index + 1);
    }

    function init(key, size) {
        var data = localStorage.getItem('bd-' + key);

        if (typeof data !== 'string') data = '';

        if (!data || data.length < (size * 2)) {
            // make sure we allocate enough data
            var diff = (size * 2) - data.length;

            for (var ix = 0; ix < diff; ix++) {
                data += '0';
            }
        }

        bds[key] = data;
    }

    function read(key, dataPtr, address, size) {
        var bd = bds[key];
        if (!bd) return console.error('Could not find block device', key);

        var dataHeap = new Uint8Array(Module.HEAPU8.buffer, dataPtr, size);

        var dataHeapIx = 0;

        for (var buffIx = address * 2; buffIx < (address + size) * 2; buffIx += 2) {
            var byte = parseInt(bd.substr(buffIx, 2), 16);

            dataHeap[dataHeapIx] = byte;
            dataHeapIx++;
        }
    }

    function program(key, dataPtr, address, size) {
        var bd = bds[key];
        if (!bd) return console.error('Could not find block device', key);

        var dataHeap = new Uint8Array(Module.HEAPU8.buffer, dataPtr, size);

        for (var ix = 0; ix < size; ix++) {
            var byte_str = dataHeap[ix].toString(16);
            if (byte_str.length === 1) byte_str = '0' + byte_str;

            bd = replaceAt(bd, (address + ix) * 2, byte_str[0]);
            bd = replaceAt(bd, ((address + ix) * 2) + 1, byte_str[1]);
        }

        bds[key] = bd;

        localStorage.setItem('bd-' + key, bd);
    }

    function erase(key, address, size) {
        var bd = bds[key];
        if (!bd) return console.error('Could not find block device', key);

        for (var ix = 0; ix < size; ix++) {
            bd = replaceAt(bd, (address + ix) * 2, '0');
            bd = replaceAt(bd, ((address + ix) * 2) + 1, '0');
        }

        bds[key] = bd;

        localStorage.setItem('bd-' + key, bd);
    }

    return {
        init: init,
        read: read,
        program: program,
        erase: erase
    };

})();

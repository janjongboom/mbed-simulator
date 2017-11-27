(function(exports) {

    var PIXEL_SIZE = 2;

    function C12832(pins) {
        exports.BaseComponent.call(this);

        this.pins = pins;

        this.componentsEl = document.querySelector('#components');
        this._on_update_display = this.on_update_display.bind(this);
    }

    C12832.prototype = Object.create(exports.BaseComponent.prototype);

    C12832.prototype.init = function() {
        window.MbedJSHal.C12832.on('update_display', this._on_update_display);

        var el = this._el = document.createElement('div');
        el.classList.add('component');
        el.classList.add('c12832');
        var p = document.createElement('p');
        p.classList.add('description');

        p.textContent = 'C12832 (' +
            this.pinNameForPin(this.pins.MOSI) + ', ' +
            this.pinNameForPin(this.pins.MISO) + ', ' +
            this.pinNameForPin(this.pins.SCK) + ')';

        p.appendChild(this.createDestroyEl());
        el.appendChild(p);

        var cnvs = this.cnvs = document.createElement('canvas');
        cnvs.height = 32 * PIXEL_SIZE;
        cnvs.width = 128 * PIXEL_SIZE;

        cnvs.style.height = 32 * PIXEL_SIZE + 'px';
        cnvs.style.width = 128 * PIXEL_SIZE + 'px';

        el.appendChild(cnvs);

        this.componentsEl.appendChild(el);

        // clear item
        this._on_update_display(this.pins.MOSI, this.pins.MISO, this.pins.SCK, { length: 4096 });
    };

    C12832.prototype.destroy = function() {
        window.MbedJSHal.C12832.removeListener('update_display', this._on_update_display);

        window.removeComponent(this);

        this.componentsEl.removeChild(this._el);
    };

    C12832.prototype.on_update_display = function(mosi, miso, sck, buffer) {
        if (this.pins.MOSI !== mosi || this.pins.MISO !== miso || this.pins.SCK !== sck) return;

        // so... we're getting 4096 bytes...
        var x = 0;
        var y = 0;

        var ctx = this.cnvs.getContext('2d');

        for (var ix = 0; ix < buffer.length; ix++) {
            ctx.fillStyle = buffer[ix] === 1 ? '#000' : '#767c69';
            ctx.fillRect(x, y, PIXEL_SIZE, PIXEL_SIZE);

            x += PIXEL_SIZE;
            if (x === (128 * PIXEL_SIZE)) {
                x = 0;
                y += PIXEL_SIZE;
            }

        }
    };

    exports.C12832 = C12832;

})(window.MbedJSUI);

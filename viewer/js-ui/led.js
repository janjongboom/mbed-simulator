(function(exports) {
    function Led(img, pins) {
        this.img = img;
        this.dataPin = pins.LED;

        this.componentsEl = document.querySelector('#components');
        this._on_pin_write = this.on_pin_write.bind(this);
    }

    Led.prototype.init = function() {
        window.MbedJSHal.gpio.on('pin_write', this._on_pin_write);

        var el = this._el = document.createElement('div');
        el.classList.add('component');
        el.classList.add('led');
        var p = document.createElement('p');
        p.classList.add('description');

        var destroy = document.createElement('span');
        destroy.classList.add('destroy');
        destroy.textContent = 'X';
        destroy.onclick = function() {
            if (confirm('Do you want to delete this component?')) {
                this.destroy();
            }
        }.bind(this);

        p.textContent = 'LED (' + Object.keys(MbedJSHal.PinNames).find(function(p) {
            return MbedJSHal.PinNames[p] === this.dataPin;
        }.bind(this)) + ')';
        p.appendChild(destroy);
        el.appendChild(p);

        var img = document.createElement('img');
        img.src = '/img/' + this.img;
        img.style.width = '30px';
        el.appendChild(img);

        this.componentsEl.appendChild(el);
    };

    Led.prototype.destroy = function() {
        window.MbedJSHal.gpio.removeListener('pin_write', this._on_pin_write);

        window.removeComponent(this);

        this.componentsEl.removeChild(this._el);
    };

    Led.prototype.on_pin_write = function(pin, value, type) {
        if (pin !== this.dataPin) return;

        if (type === MbedJSHal.gpio.TYPE.DIGITAL) {
            this._el.querySelector('img').style.opacity = value === 1 ? '1' : '0.3';
        }
        else if (type === MbedJSHal.gpio.TYPE.PWM) {
            this._el.querySelector('img').style.opacity = (value / 1024 * 0.7) + 0.3;
        }
        else {
            console.error('LED only supports DIGITAL|PWM, not', type);
        }
    };

    exports.LedRed = Led.bind(Led, 'led_red.png');
    exports.LedGreen = Led.bind(Led, 'led_green.png');
    exports.LedBlue = Led.bind(Led, 'led_blue.png');

})(window.MbedJSUI);

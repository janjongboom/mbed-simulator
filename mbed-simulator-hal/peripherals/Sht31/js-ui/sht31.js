(function(exports) {

    function Sht31(pins) {
        exports.BaseComponent.call(this);

        this.pins = pins;

        this.temp = 2050;
        this.humidity = 3000;

        this.componentsEl = document.querySelector('#components');
    }

    Sht31.prototype = Object.create(exports.BaseComponent.prototype);

    Sht31.prototype.init = function() {
        var el = this._el = document.createElement('div');
        el.classList.add('component');
        var p = document.createElement('p');
        p.classList.add('description');

        p.textContent = 'SHT31 (' +
            this.pinNameForPin(this.pins.SDA) + ', ' +
            this.pinNameForPin(this.pins.SCL) + ')';

        p.appendChild(this.createDestroyEl());
        el.appendChild(p);

        var wrapper = document.createElement('div');
        wrapper.classList.add('sht31');
        wrapper.innerHTML =
            '<div class="thermometer sht31-comp"><div class="sht31-before"></div><span class="sht31-content">20&deg;C</span><div class="sht31-after"></div></div>' +
            '<div class="humidity sht31-comp"><div class="sht31-before"></div><span class="sht31-content">31%</span><div class="sht31-after"></div></div>';

        el.appendChild(wrapper);

        this.tempEl = el.querySelector('.thermometer');
        this.humiEl = el.querySelector('.humidity');

        this.renderTemperature();
        this.renderHumidity();

        [].forEach.call(el.querySelectorAll('.sht31-comp'), function(c) {
            c.onclick = this.change.bind(this);
        }.bind(this));

        this.componentsEl.appendChild(el);
    };

    Sht31.prototype.destroy = function() {
        window.removeComponent(this);

        this.componentsEl.removeChild(this._el);
    };

    Sht31.prototype.renderTemperature = function() {
        // 0..146, max temp is 50 degrees
        var height = (this.temp / 100) / (50 / 146);
        var top = 146 - height;

        var after = this.tempEl.querySelector('.sht31-after');
        after.style.top = top + 6 + 'px';
        after.style.height = height + 'px';

        this.tempEl.querySelector('.sht31-content').textContent = (this.temp / 100).toFixed(2) + '°C';

        MbedJSHal.sht31.update_temperature(this.pins.SDA, this.pins.SCL, this.temp);
    };

    Sht31.prototype.renderHumidity = function() {
        // 0..146, max is 100%
        var height = (this.humidity / 100) / (100 / 146);
        var top = 146 - height;

        var after = this.humiEl.querySelector('.sht31-after');
        after.style.top = top + 6 + 'px';
        after.style.height = height + 'px';

        this.humiEl.querySelector('.sht31-content').textContent = (this.humidity / 100).toFixed(2) + '%';

        MbedJSHal.sht31.update_humidity(this.pins.SDA, this.pins.SCL, this.humidity);
    };

    Sht31.prototype.change = function(ev) {
        // this reflows... but I don't feel like fixing it
        var y = ev.pageY - ev.currentTarget.offsetTop;
        if (y < 10) y = 10;
        y -= 10;
        if (ev.currentTarget === this.tempEl) {
            this.temp = (1 - (y / 155)) * 5000 | 0;
            if (this.temp < 0) this.temp = 0;
            this.renderTemperature();
        }
        else if (ev.currentTarget === this.humiEl) {
            this.humidity = (1 - (y / 155)) * 10000 | 0;
            if (this.humidity < 0) this.humidity = 0;
            this.renderHumidity();
        }
    };

    Sht31.prototype.on_update_display = function(mosi, miso, sck, buffer) {
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

    exports.sht31 = Sht31;

})(window.MbedJSUI);

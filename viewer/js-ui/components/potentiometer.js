(function(exports) {
    function Potentiometer(pins) {
        exports.BaseComponent.call(this);

        this.dataPin = pins.Potentiometer;

        this.componentsEl = document.querySelector('#components');
    }

    Potentiometer.prototype = Object.create(exports.BaseComponent.prototype);

    Potentiometer.prototype.init = function() {
        var self = this;

        var el = this._el = document.createElement('div');
        el.classList.add('component');
        el.classList.add('potentiometer');
        var p = document.createElement('p');
        p.classList.add('description');

        p.textContent = 'Potentiometer (' + this.pinNameForPin(this.dataPin) + ')';

        p.appendChild(this.createDestroyEl());
        el.appendChild(p);

        var range = document.createElement('input');
        range.setAttribute('min', 0);
        range.setAttribute('max', 5);
        range.step = 0.01;
        range.value = MbedJSHal.gpio.read(this.dataPin) / 1024 * 5;
        range.setAttribute('type', 'range');

        range.addEventListener('change', function() {
            window.MbedJSHal.gpio.write(self.dataPin, range.value / 5 * 1024);
        });

        var rangeP = document.createElement('p');
        rangeP.appendChild(range);

        el.appendChild(rangeP);

        var voltageP = document.createElement('p');
        var voltageMin = document.createElement('span');
        voltageMin.classList.add('voltage-min');
        voltageMin.textContent = '0V';
        var voltageMax = document.createElement('span');
        voltageMax.classList.add('voltage-max');
        voltageMax.textContent = '5V';

        voltageP.appendChild(voltageMin);
        voltageP.appendChild(voltageMax);

        el.appendChild(voltageP);

        this.componentsEl.appendChild(el);
    };

    Potentiometer.prototype.destroy = function() {
        window.removeComponent(this);

        this.componentsEl.removeChild(this._el);
    };

    exports.Potentiometer = Potentiometer;

})(window.MbedJSUI);

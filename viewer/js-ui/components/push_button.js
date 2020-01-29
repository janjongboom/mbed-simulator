(function(exports) {
    function PushButton(pins) {
        exports.BaseComponent.call(this);

        this.dataPin = pins.Button;

        this.componentsEl = document.querySelector('#components');   
    }

    PushButton.prototype = Object.create(exports.BaseComponent.prototype);

    PushButton.prototype.init = function() {
        var self = this;

        var el = this._el = document.createElement('div');
        el.classList.add('component');
        el.classList.add('button');
        var p = document.createElement('p');
        p.classList.add('description');

        p.textContent = 'Push Button (' + this.pinNameForPin(this.dataPin) + ')';

        p.appendChild(this.createDestroyEl());
        el.appendChild(p);

        var img = document.createElement('img');
        img.src = '/img/' + 'push_button.png';
        img.style.width = '150px';
        el.appendChild(img);

        el.onmousedown = function() {
            window.MbedJSHal.gpio.write(self.dataPin, 1);
            };

        el.onmouseup = function() {
            window.MbedJSHal.gpio.write(self.dataPin, 0);
            };

        this.componentsEl.appendChild(el);

    };

    PushButton.prototype.destroy = function() {
        window.removeComponent(this);

        this.componentsEl.removeChild(this._el);
    };

    exports.PushButton = PushButton;

})(window.MbedJSUI);

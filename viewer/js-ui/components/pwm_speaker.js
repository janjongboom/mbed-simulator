(function(exports) {
    function PwmSpeaker(pins) {
        exports.BaseComponent.call(this);
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();

        this.dataPin = pins.Speaker;
        this.oscillator = null;
        this.isPlaying = false;
        this.volume_value = 0;
        this.frequency = 450;
        this.componentsEl = document.querySelector('#components');
        this._on_pin_period = this.on_pin_period.bind(this);
        this._on_pin_write = this.on_pin_write.bind(this);
    }

    PwmSpeaker.prototype = Object.create(exports.BaseComponent.prototype);

    PwmSpeaker.prototype.init = function() {
        window.MbedJSHal.gpio.on('pin_period', this._on_pin_period);
        window.MbedJSHal.gpio.on('pin_write', this._on_pin_write);

        var el = this._el = document.createElement('div');
        el.classList.add('component');
        el.classList.add('PwmSpeaker');
        var p = document.createElement('p');
        p.classList.add('description');

        p.textContent = 'PWM Speaker (' + this.pinNameForPin(this.dataPin) + ')';

        p.appendChild(this.createDestroyEl());
        el.appendChild(p);

        var img = document.createElement('img');
        img.src = '/img/' + 'pwm_speaker.png';
        img.style.width = '100px';
        el.appendChild(img);

        this.componentsEl.appendChild(el);

        this._on_pin_write(
            this.dataPin,
            MbedJSHal.gpio.read(this.dataPin),
            MbedJSHal.gpio.get_type(this.dataPin)
        );
        this._on_pin_period(
            this.dataPin,
            MbedJSHal.gpio.get_period_us(this.dataPin)
        );
    };

    PwmSpeaker.prototype.destroy = function() {
        window.MbedJSHal.gpio.removeListener('pin_write', this._on_pin_write);
        window.MbedJSHal.gpio.removeListener('pin_period', this._on_pin_period);
        this.oscillator.stop();
        this.isPlaying = false;

        window.removeComponent(this);

        this.componentsEl.removeChild(this._el);
    };

    PwmSpeaker.prototype.on_pin_write = function(pin, value, type) {
        if (pin !== this.dataPin) return;

        if (type == MbedJSHal.gpio.TYPE.PWM) {
            this.volume_value = value/1024;
            this.play();
        }
    };

    PwmSpeaker.prototype.on_pin_period = function (pin, period){
        if (pin !== this.dataPin) return;

        if (MbedJSHal.gpio.get_type(pin) == MbedJSHal.gpio.TYPE.PWM) {
            this.frequency = 1.0 / (period / 1000);
            this.play();
        }
    }

    PwmSpeaker.prototype.play = function (){
        if (this.isPlaying == true) {
            this.oscillator.stop();
            this.isPlaying = false;
        }

        var volume = audioCtx.createGain();
        volume.connect(audioCtx.destination);
        volume.gain.setValueAtTime(this.volume_value, audioCtx.currentTime);

        var oscillator = audioCtx.createOscillator();
        oscillator.type = 'square';
        oscillator.frequency.setValueAtTime(
            this.frequency, audioCtx.currentTime
        );
        oscillator.connect(volume);

        oscillator.start();
        this.oscillator = oscillator;
        this.isPlaying = true;
    };

    exports.PwmSpeaker = PwmSpeaker;
})(window.MbedJSUI);

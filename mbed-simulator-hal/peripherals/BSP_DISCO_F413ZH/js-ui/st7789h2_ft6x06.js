/*

    */

(function(exports) {

    var PIXEL_SIZE = 1;

    function ST7789H2(pins) {
        exports.BaseComponent.call(this);

        this.pins = pins;

        this.componentsEl = document.querySelector('#components');

        this._on_set_pixel = this.on_set_pixel.bind(this);
    }

    ST7789H2.prototype = Object.create(exports.BaseComponent.prototype);

    ST7789H2.prototype.init = function() {
        window.MbedJSHal.ST7789H2.on('set_pixel', this._on_set_pixel);

        var el = this._el = document.createElement('div');
        el.classList.add('component');
        el.classList.add('st7789h2');
        var p = document.createElement('p');
        p.classList.add('description');

        p.textContent = 'ST7789H2+FT6x06';

        p.appendChild(this.createDestroyEl());
        el.appendChild(p);

        var cnvs = this.cnvs = document.createElement('canvas');
        cnvs.height = 240 * PIXEL_SIZE;
        cnvs.width = 240 * PIXEL_SIZE;

        cnvs.style.height = 240 * PIXEL_SIZE + 'px';
        cnvs.style.width = 240 * PIXEL_SIZE + 'px';

        cnvs.onmousedown = function(e) {
            var x = e.pageX - cnvs.offsetLeft;
            var y = e.pageY - cnvs.offsetTop;

            this.mouseDown = true;

            window.MbedJSHal.ST7789H2.updateTouch(true, x, y);
        };

        cnvs.onmousemove = function(e) {
            var x = e.pageX - cnvs.offsetLeft;
            var y = e.pageY - cnvs.offsetTop;

            window.MbedJSHal.ST7789H2.updateTouch(this.mouseDown, x, y);
        };

        cnvs.onmouseup = function(e) {
            var x = e.pageX - cnvs.offsetLeft;
            var y = e.pageY - cnvs.offsetTop;

            this.mouseDown = false;

            window.MbedJSHal.ST7789H2.updateTouch(false, x, y);
        };

        el.appendChild(cnvs);

        this.componentsEl.appendChild(el);
    };

    ST7789H2.prototype.destroy = function() {
        window.MbedJSHal.ST7789H2.removeListener('set_pixel', this._on_set_pixel);
        window.MbedJSHal.ST7789H2.removeListener('init', this._on_init);

        window.removeComponent(this);

        this.componentsEl.removeChild(this._el);
    };

    ST7789H2.prototype.on_set_pixel = function(x, y, color) {
        var ctx = this.cnvs.getContext('2d');

        ctx.fillStyle = 'rgb(' + color[0] + ', ' + color[1] + ', ' + color[2] + ')';
        ctx.fillRect(x * PIXEL_SIZE, y * PIXEL_SIZE, PIXEL_SIZE, PIXEL_SIZE);
    };

    exports.ST7789H2 = ST7789H2;

})(window.MbedJSUI);

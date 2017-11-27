(function(exports) {

    function BaseComponent() {

    }

    BaseComponent.prototype.createDestroyEl = function() {
        var destroy = document.createElement('span');
        destroy.classList.add('destroy');
        destroy.textContent = 'X';
        destroy.onclick = function() {
            if (confirm('Do you want to delete this component?')) {
                this.destroy();
            }
        }.bind(this);

        return destroy;
    };

    BaseComponent.prototype.pinNameForPin = function(pin) {
        return Object.keys(MbedJSHal.PinNames).find(function(p) {
            return MbedJSHal.PinNames[p] === pin;
        }.bind(this));
    };

    exports.BaseComponent = BaseComponent;

})(window.MbedJSUI);

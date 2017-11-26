(function() {

var activeComponents = [];
var activeComponentModel = [];

window.removeComponent = function(instance) {
    var ix = activeComponents.indexOf(instance);
    activeComponentModel.splice(ix, 1);
    sessionStorage.setItem('model', JSON.stringify(activeComponentModel));
};

var components = [
    { component: 'LedRed', name: 'Red LED', pins: [ 'LED' ] },
    { component: 'LedGreen', name: 'Green LED', pins: [ 'LED' ] },
    { component: 'LedBlue', name: 'Blue LED', pins: [ 'LED' ] },
    { component: 'LedRGB', name: 'RGB LED', pins: [ 'Red', 'Green', 'Blue' ] },
    { component: 'PushButton', name: 'Push button', pins: [ 'Button' ] },
    { component: 'TMP35', name: 'TMP35 Analog temperature sensor', pins: [ 'Temperature' ] },
    // {
    //     component: 'SHT31',
    //     name: 'SHT31 Digital temperature / humidity sensor',
    //     pins: [ { name: 'SDA', value: 'I2C_SDA' }, { name: 'SCL', value: 'I2C_SCL' } ]
    // },
    // {
    //     component: 'C12832',
    //     name: 'C12832 LCD display',
    //     pins: [
    //         { name: 'MOSI', value: 'I2C_SDA' },
    //         { name: 'MISO', value: 'I2C_SCL' },
    //         { name: 'SCK',  value: 'I2C_SCK' }
    //     ]
    // }
];

document.body.onload = function() {
    var model = sessionStorage.getItem('model');
    if (model) {
        model = JSON.parse(model);

        model.forEach(function(m) {
            var component = new window.MbedJSUI[m.component](m.args);
            component.init();
            activeComponents.push(component);
        });
    }
};

document.querySelector('#add-component').onclick = function() {
    document.querySelector('#overlay').style.display = 'flex';
};

document.querySelector('#overlay').onclick = function(e) {
    if (e.target === e.currentTarget) {
        this.style.display = 'none';
    }
};

components.forEach(function(c, ix) {
    var opt = document.createElement('option');
    opt.textContent = c.name;
    document.querySelector('#select-component').appendChild(opt);
});

document.querySelector('#select-component').onchange = function(e) {
    var obj = components[document.querySelector('#select-component').options.selectedIndex];

    var pinsEl = document.querySelector('#pins');
    pinsEl.innerHTML = '';

    obj.pins.forEach(function(pin) {
        var label = document.createElement('label');
        label.textContent = typeof pin === 'object' ? pin.name : pin;
        var select = document.createElement('select');
        select.dataset.pin = pin;

        if (typeof pin === 'object') {
            var opt = document.createElement('option');
            opt.textContent = pin.value;
            select.appendChild(opt);
        }
        else {
            Object.keys(MbedJSHal.PinNames).map(function(p) {
                var opt = document.createElement('option');
                opt.textContent = p;
                opt.value = MbedJSHal.PinNames[p];
                select.appendChild(opt);
            });
        }
        pinsEl.appendChild(label);
        pinsEl.appendChild(select);
    });

    document.querySelector('#add-component-btn').onclick = function() {
        var args = [].reduce.call(pinsEl.querySelectorAll('#pins select'), function(curr, select) {
            var s = select.options[select.options.selectedIndex];
            curr[select.dataset.pin] = Number(s.value);
            return curr;
        }, {});
        var component = new window.MbedJSUI[obj.component](args);
        component.init();
        activeComponents.push(component);
        activeComponentModel.push({ component: obj.component, args: args });
        sessionStorage.setItem('model', JSON.stringify(activeComponentModel));

        document.querySelector('#overlay').style.display = 'none';
    };
};

document.querySelector('#select-component').onchange();

})();

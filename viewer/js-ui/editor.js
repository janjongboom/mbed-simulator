var editor = ace.edit("editor");
editor.setTheme("ace/theme/textmate");
editor.getSession().setMode("ace/mode/c_cpp");

var demoComponents = {};

function setDemoComponents() {
    demoComponents = {
        pwmout: [
            { component: "LedRed", args: { LED : MbedJSHal.PinNames.p5 } }
        ],
        lcd: [{
            component: "C12832",
            args: {
                MOSI: MbedJSHal.PinNames.SPI_MOSI,
                MISO: MbedJSHal.PinNames.SPI_MISO,
                SCK: MbedJSHal.PinNames.SPI_SCK
            }
        }],
        temperature: [
            { component: "C12832", args: { MOSI: MbedJSHal.PinNames.SPI_MOSI, MISO: MbedJSHal.PinNames.SPI_MISO, SCK: MbedJSHal.PinNames.SPI_SCK } },
            { component: "sht31", args: { SDA: MbedJSHal.PinNames.I2C_SDA, SCL: MbedJSHal.PinNames.I2C_SCL } }
        ]
    };
}

if (document.readyState === 'complete') {
    setDemoComponents();
}
else {
    window.addEventListener('load', setDemoComponents);
}

var simulatorFrame = document.querySelector('#viewer iframe');
var compilationFailed = document.querySelector('#compilation-failed');

if (document.location.hash) {
    if (document.location.hash.indexOf('#user') === 0) {
        // user script
        var script = document.location.hash.substr(1);
        var x = new XMLHttpRequest();
        x.onload = function() {
            if (x.status === 200) {
                editor.setValue(x.responseText);
                editor.selection.clearSelection();
                editor.selection.moveCursorTo(0, 0);

                simulatorFrame.src = '/view/' + script;
                simulatorFrame.style.display = 'block';
                compilationFailed.style.display = 'none';
            }
        };
        x.open('GET', '/out/' + script + '.cpp');
        x.send();
    }
    else {
        var demo = document.location.hash.substr(1);
        var ix = [].map.call(document.querySelector('#select-project').options, function(p) {
            return p.getAttribute('name');
        }).indexOf(demo);

        if (ix > -1) {
            load_demo(demo);
            document.querySelector('#select-project').selectedIndex = ix;
        }
    }
}

function load_demo(demo) {
    var x = new XMLHttpRequest();
    x.onload = function() {
        if (x.status === 200) {
            sessionStorage.removeItem('model');

            if (demoComponents[demo]) {
                sessionStorage.setItem('model', JSON.stringify(demoComponents[demo]));
            }

            editor.setValue(x.responseText);
            editor.selection.clearSelection();
            editor.selection.moveCursorTo(0, 0);

            simulatorFrame.src = '/view/' + demo;
            simulatorFrame.style.display = 'block';
            compilationFailed.style.display = 'none';

            document.location.hash = '#' + demo;
        }
        else {
            alert('Failed to compile, see browser console...');
            console.error('Failed to load demo...', x.status);
        }

        if (ga && typeof ga === 'function') {
            ga('send', {
                hitType: 'event',
                eventCategory: 'load-demo',
                eventAction: demo
            });
        }
    };
    x.open('GET', '/demos/' + demo + '/main.cpp');
    x.send();
}

document.querySelector('#load-demo').onclick = function() {
    var sp = document.querySelector('#select-project');
    var demo = sp.options[sp.selectedIndex].getAttribute('name');
    load_demo(demo);
};

document.querySelector('#run').onclick = function() {
    var btn = this;
    btn.disabled = 'disabled';

    var status = document.querySelector('#run-status');
    status.textContent = 'Compiling...';

    var x = new XMLHttpRequest();
    x.onload = function() {
        btn.removeAttribute('disabled');

        if (x.status === 200) {
            simulatorFrame.src = '/view/' + x.responseText;
            status.textContent = '';
            document.location.hash = '#' + x.responseText;

            simulatorFrame.style.display = 'block';
            compilationFailed.style.display = 'none';
        }
        else {
            console.error('Compilation failed', x.status);
            console.error(x.responseText);

            status.textContent = 'Compilation failed';

            compilationFailed.querySelector('pre').textContent = x.responseText;
            compilationFailed.style.display = 'block';

            simulatorFrame.style.display = 'none';
        }

        if (ga && typeof ga === 'function') {
            ga('send', {
                hitType: 'event',
                eventCategory: 'compile',
                eventAction: x.status === 200 ? 'success' : 'failure'
            });
        }
    };
    x.open('POST', '/compile');
    x.setRequestHeader('Content-Type', 'application/json');
    x.send(JSON.stringify({ code: editor.getValue() }));
}

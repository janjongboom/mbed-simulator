window.MbedJSHal.sht31 = (function() {
    var sensors = {};

    var obj = {};

    obj.init = function(id, sda, scl) {
        console.log('sht31 init', id, sda, scl);

        var el = document.createElement('div');
        el.classList.add('sht31');

        el.innerHTML =
            '<div class="thermometer sht31-comp"><div class="sht31-before"></div><span class="sht31-content">20&deg;C</span><div class="sht31-after"></div></div>' +
            '<div class="humidity sht31-comp"><div class="sht31-before"></div><span class="sht31-content">31%</span><div class="sht31-after"></div></div>';

        document.querySelector('#components').appendChild(el);

        sensors[id] = {
            sda: sda,
            scl: scl,
            temp: 2050,
            humidity: 3000,
            el: el,
            tempEl: el.querySelector('.thermometer'),
            humiEl: el.querySelector('.humidity'),
            renderTemp: function() {
                // 0..146, max temp is 50 degrees
                var height = (this.temp / 100) / (50 / 146);
                var top = 146 - height;

                var after = this.tempEl.querySelector('.sht31-after');
                after.style.top = top + 6 + 'px';
                after.style.height = height + 'px';

                this.tempEl.querySelector('.sht31-content').textContent = (this.temp / 100).toFixed(2) + '°C';
            },
            renderHumi: function() {
                // 0..146, max is 100%
                var height = (this.humidity / 100) / (100 / 146);
                var top = 146 - height;

                var after = this.humiEl.querySelector('.sht31-after');
                after.style.top = top + 6 + 'px';
                after.style.height = height + 'px';

                this.humiEl.querySelector('.sht31-content').textContent = (this.humidity / 100).toFixed(2) + '%';
            }
        };

        [].forEach.call(el.querySelectorAll('.sht31-comp'), function(c) {
            c.onclick = function(ev) {
                // this reflows... but I don't feel like fixing it
                var y = ev.pageY - this.offsetTop;
                if (y < 10) y = 10;
                y -= 10;
                if (c === sensors[id].tempEl) {
                    sensors[id].temp = (1 - (y / 155)) * 5000 | 0;
                    sensors[id].renderTemp();
                }
                else if (c === sensors[id].humiEl) {
                    sensors[id].humidity = (1 - (y / 155)) * 10000 | 0;
                    sensors[id].renderHumi();
                }
            };
        });

        sensors[id].renderTemp();
        sensors[id].renderHumi();
    };

    obj.read_temperature = function(id) {
        if (!(id in sensors)) return 0;
        return sensors[id].temp;
    };

    obj.read_humidity = function(id) {
        if (!(id in sensors)) return 0;
        return sensors[id].humidity;
    };

    return obj;
})();

window.MbedJSHal.sht31 = (function() {
    var sensors = {};

    var obj = {};

    var values = {};

    obj.init = function(id, sda, scl) {
        sensors[id] = {
            sda: sda,
            scl: scl
        };
    };

    obj.read_temperature = function(id) {
        if (!(id in sensors)) return 0;
        var key = sensors[id].sda + '_' + sensors[id].scl;

        return (values[key] || { temp: 0 }).temp;
    };

    obj.read_humidity = function(id) {
        if (!(id in sensors)) return 0;
        var key = sensors[id].sda + '_' + sensors[id].scl;

        return (values[key] || { humidity: 0 }).humidity;
    };

    obj.update_temperature = function(sda, scl, temp) {
        var key = sda + '_' + scl;
        values[key] = values[key] || {
            temp: 0,
            humidity: 0
        };

        values[key].temp = temp;
    };

    obj.update_humidity = function(sda, scl, humidity) {
        var key = sda + '_' + scl;
        values[key] = values[key] || {
            temp: 0,
            humidity: 0
        };

        values[key].humidity = humidity;
    };

    return obj;
})();

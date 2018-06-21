window.MbedJSHal.sleep = (function() {

    var started = Date.now();

    function uptime() {
        return (Date.now() - started) * 1000; // this is in us
    }

    return {
        uptime: uptime
    };

})();
window.MbedJSHal.timers = (function() {

    var tickers = {};
    var timeouts = {};

    // HAL functions (these are called from C++)
    function ticker_setup(id, interval) {
        console.log('ticker_setup', id, interval);
        tickers[id] = setInterval(() => {
            ccall('invoke_ticker', 'void', [ 'number' ], [ id ]);
        }, interval);
    }

    function ticker_detach(id, interval) {
        console.log('ticker_detach', id);

        if (!(id in tickers)) return console.error('ticker_detach called on non-registered ticker...');

        clearInterval(tickers[id]);
        delete tickers[id];
    }

    function timeout_setup(id, interval) {
        console.log('timeout_setup', id, interval);
        timeouts[id] = setTimeout(() => {
            ccall('invoke_timeout', 'void', [ 'number' ], [ id ]);

            delete timeouts[id];
        }, interval);
    }

    function timeout_detach(id, interval) {
        console.log('timeout_detach', id);

        if (!(id in timeouts)) return console.error('timeout_detach called on non-registered ticker...');

        clearTimeout(timeouts[id]);
        delete timeouts[id];
    }

    return {
        ticker_setup: ticker_setup,
        ticker_detach: ticker_detach,
        timeout_setup: timeout_setup,
        timeout_detach: timeout_detach
    };

})();
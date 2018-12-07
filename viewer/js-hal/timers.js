window.MbedJSHal.timers = (function() {

    var tickers = {};
    var timeouts = {};

    // HAL functions (these are called from C++)
    function ticker_setup(id, interval) {
        // console.log('ticker_setup', id, interval);

        if (tickers[id]) {
            clearInterval(tickers[id]);
        }

        tickers[id] = setInterval(() => {
            ccall('invoke_ticker', null, [ 'number' ], [ id ], { async: true });
        }, interval);
    }

    function ticker_detach(id) {
        // console.log('ticker_detach', id);

        if (!(id in tickers)) return // console.error('ticker_detach called on non-registered ticker...');

        clearInterval(tickers[id]);
        delete tickers[id];
    }

    return {
        ticker_setup: ticker_setup,
        ticker_detach: ticker_detach
    };

})();
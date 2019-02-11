window.MbedJSHal.usticker = (function() {

    var start = 0;

    function init() {
        // console.log('usticker.init');
        start = Date.now();
    }

    function read() {
        var now = (Date.now() - start) * 1000; // in us.
        // console.log('read, currval is', now);
        return now;
    }

    function fireInterruptNow() {
        // console.log('fireInterruptNow');
        ccall('handle_usticker_interrupt', null,
            [ ],
            [ ],
            { async: true });
    }

    function fireInterrupt() {
        // 1ms. to make sure we don't intercept the current call flow
        setTimeout(fireInterruptNow, 1);
    }

    var activeTimer;

    function setInterrupt(time) {
        time = time / 1000 | 0;
        var now = Date.now() - start;
        var delta = time - now;
        // console.log('setInterrupt', delta);
        activeTimer = setTimeout(fireInterruptNow, delta);
    }

    function clearInterrupt() {
        // console.log('clearInterrupt');
        clearTimeout(activeTimer);
    }

    function disableInterrupt() {
        // console.log('disableInterrupt');
        clearTimeout(activeTimer);
    }

    function free() {
        // console.log('free');
    }

    return {
        init: init,
        read: read,
        setInterrupt: setInterrupt,
        fireInterrupt: fireInterrupt,
        clearInterrupt: clearInterrupt,
        disableInterrupt: disableInterrupt,
        free: free
    };

})();
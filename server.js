const launchServer = require('./server/launch-server');
const Path = require('path');

launchServer(Path.join(__dirname, 'out'), process.env.PORT || 7829, 3600000 /*1hour cache*/, true /*runtime logs*/, function(err) {
    if (err) return console.error(err);

    // noop
});

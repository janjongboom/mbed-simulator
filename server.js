const launchServer = require('./server/launch-server');
const Path = require('path');

launchServer(Path.join(__dirname, 'out'), process.env.PORT || 7829, function(err) {
    // noop
});

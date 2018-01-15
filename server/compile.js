const fs = require('fs');
const Path = require('path');
const spawn = require('child_process').spawn;
const { isDirectory, getDirectories, getCFiles, getAllDirectories, getAllCFiles, ignoreAndFilter } = require('../helpers');

const libMbed = Path.resolve(__dirname, '../mbed-simulator-hal', 'libmbed.bc');
if (!fs.existsSync(libMbed)) {
    console.log(libMbed + ' does not exist. Run `node build-libmbed.js` first.');
    // process.exit(1);
}

const outFolder = Path.join(__dirname, '..', 'out');
if (!fs.existsSync(outFolder)) {
    fs.mkdirSync(outFolder);
}

// OK, so now... we need to build a list with all folders
let includeDirectories = getAllDirectories(Path.join(__dirname, '../mbed-simulator-hal'));
let cFiles = [ libMbed ];

includeDirectories = ignoreAndFilter(includeDirectories, Path.join(__dirname, 'mbed-simulator-hal', '.mbedignore'))

module.exports = function(content, callback) {
    var name = 'user_' + Date.now();
    fs.writeFile(Path.join(outFolder, name + '.cpp'), content, 'utf-8', function(err) {
        if (err) return callback(err);

        let c = cFiles.concat([ Path.join(outFolder, name + '.cpp') ]);

        let args = c
            .concat(includeDirectories.map(i => '-I' + i))
            .concat([
                // '-s', 'EMTERPRETIFY=1',
                // '-s', 'EMTERPRETIFY_ASYNC=1',

                '-s', 'ASYNCIFY=1',
                '-s', 'NO_EXIT_RUNTIME=1',

                '-g4',
                // '-O2',

                '-D__MBED__',
                '-DMBEDTLS_TEST_NULL_ENTROPY',
                '-DMBEDTLS_NO_DEFAULT_ENTROPY_SOURCES',
                '-DMBED_CONF_EVENTS_SHARED_EVENTSIZE=256',

                '-Wall',
                '-o', Path.join(outFolder, name + '.js')
            ]);

        let cmd = spawn('emcc', args);

        var stdout = '';

        cmd.stdout.on('data', data => {
            stdout += data.toString('utf-8');
        });
        cmd.stderr.on('data', data => {
            stdout += data.toString('utf-8');
        });
        cmd.on('close', code => {
            if (code === 0) {
                callback(null, name);
            }
            else {
                // remove all paths to the mbed-simulator folder from the output
                stdout = stdout.split(Path.join(__dirname, '..')).join('');

                callback(stdout);
            }
        });

    });
};


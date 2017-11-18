const fs = require('fs');
const Path = require('path');
const spawn = require('child_process').spawn;

const isDirectory = source => fs.lstatSync(source).isDirectory();
const getDirectories = source => fs.readdirSync(source).map(name => Path.join(source, name)).filter(isDirectory).filter(d => Path.basename(d) !== '.git');
const getCFiles = source => {
    return fs.readdirSync(source)
        .map(name => Path.join(source, name))
        .filter(name => ['.c', '.cpp'].indexOf(Path.extname(name).toLowerCase()) > -1);
};
const getAllDirectories = source => {
    let dirs = [ Path.resolve(source) ];
    for (let d of getDirectories(source)) {
        dirs = dirs.concat(getAllDirectories(d));
    }
    return dirs;
};
const getAllCFiles = source => {
    let files = getCFiles(source);
    for (let d of getDirectories(source)) {
        files = files.concat(getAllCFiles(d));
    }
    return files;
};

// from https://stackoverflow.com/a/22185855/107642 - Creative Commons
const copyRecursiveSync = (src, dest) => {
    var exists = fs.existsSync(src);
    var stats = exists && fs.statSync(src);
    var isDirectory = exists && stats.isDirectory();
    if (exists && isDirectory) {
        if (!fs.existsSync(dest)) fs.mkdirSync(dest);
        fs.readdirSync(src).forEach(function(childItemName) {
            copyRecursiveSync(Path.join(src, childItemName),
                              Path.join(dest, childItemName));
        });
    } else {
        if (fs.existsSync(dest)) fs.unlinkSync(dest);
        fs.linkSync(src, dest);
    }
};

const libMbed = Path.resolve(__dirname, '../mbed-simulator-hal', 'libmbed.bc');
if (!fs.existsSync(libMbed)) {
    console.log(libMbed + ' does not exist. Run `node build-libmbed.js` first.');
    process.exit(1);
}

const outFolder = Path.join(__dirname, '..', 'out');
if (!fs.existsSync(outFolder)) {
    fs.mkdirSync(outFolder);
}

// OK, so now... we need to build a list with all folders
let includeDirectories = getAllDirectories(Path.join(__dirname, '../mbed-simulator-hal'));
let cFiles = [ libMbed ];

module.exports = function(content, callback) {
    var name = 'user_' + Date.now();
    fs.writeFile(Path.join(outFolder, name + '.cpp'), content, 'utf-8', function(err) {
        if (err) return callback(err);

        let c = cFiles.concat([ Path.join(outFolder, name + '.cpp') ]);

        let args = c
            .concat(includeDirectories.map(i => '-I' + i))
            .concat([ '-s', 'EMTERPRETIFY=1', '-s', 'EMTERPRETIFY_ASYNC=1', '-s', 'NO_EXIT_RUNTIME=1' ])
            .concat([
                '-D__MBED__',
                '-DMBEDTLS_TEST_NULL_ENTROPY',
                '-DMBEDTLS_NO_DEFAULT_ENTROPY_SOURCES',
            ])
            .concat([ '-Wall', '-o', Path.join(outFolder, name + '.js') ]);

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
                callback(stdout);
            }
        });

    });
};


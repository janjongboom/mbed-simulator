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
const getAllDirectoriesWithHeaders = source => {
    let dirs = [ Path.resolve(source) ];
    for (let d of getDirectories(source)) {
        dirs = dirs.concat(getAllDirectoriesWithHeaders(d));
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

const verbose = (process.argv.indexOf('--verbose')) > -1 || (process.argv.indexOf('-v') > -1);

const outFolder = Path.join(__dirname, 'mbed-simulator-hal');
const outFile = Path.resolve(Path.join(outFolder, 'libmbed.bc'));

// OK, so now... we need to build a list with all folders
let includeDirectories = getAllDirectoriesWithHeaders(Path.join(__dirname, 'mbed-simulator-hal'));
let cFiles = getAllCFiles(Path.join(__dirname, 'mbed-simulator-hal'));

let args = cFiles
    .concat(includeDirectories.map(i => '-I' + i))
    .concat([
        //'-s', 'EMTERPRETIFY=1',
        //'-s', 'EMTERPRETIFY_ASYNC=1',

        '-s', 'ASYNCIFY=1',
        '-s', 'NO_EXIT_RUNTIME=1',
        '-s', 'SIDE_MODULE=1',

        '-D__MBED__',
        '-DMBEDTLS_TEST_NULL_ENTROPY',
        '-DMBEDTLS_NO_DEFAULT_ENTROPY_SOURCES',
        '-DMBED_CONF_EVENTS_SHARED_EVENTSIZE=256',

        '-O2',

        '-Wall',
        '-o', outFile
    ]);

if (verbose) {
    console.log('emcc ' + args.join(' '));
}

let cmd = spawn('emcc', args);

cmd.stdout.on('data', data => {
    process.stdout.write(data);
});
cmd.stderr.on('data', data => {
    process.stderr.write(data);
});
cmd.on('close', code => {
    if (code === 0) {
        process.stdout.write('Compilation successful, binary is at "' + outFile + '"\n');
    }
});

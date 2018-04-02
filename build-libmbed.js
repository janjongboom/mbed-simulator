const fs = require('fs');
const Path = require('path');
const spawn = require('child_process').spawn;
const { isDirectory, getDirectories, getCFiles, getAllDirectories, getAllCFiles, ignoreAndFilter } = require('./helpers');

const verbose = (process.argv.indexOf('--verbose')) > -1 || (process.argv.indexOf('-v') > -1);
const emterpretify = process.argv.indexOf('--emterpretify') > -1;

const outFolder = Path.join(__dirname, 'mbed-simulator-hal');
const outFile = Path.resolve(Path.join(outFolder, 'libmbed.bc'));

// OK, so now... we need to build a list with all folders
let includeDirectories = getAllDirectories(Path.join(__dirname, 'mbed-simulator-hal'));
let cFiles = getAllCFiles(Path.join(__dirname, 'mbed-simulator-hal'));

includeDirectories = ignoreAndFilter(includeDirectories, Path.join(__dirname, 'mbed-simulator-hal', '.simignore'))
cFiles = ignoreAndFilter(cFiles, Path.join(__dirname, 'mbed-simulator-hal', '.simignore'));

let args = cFiles
    .concat(includeDirectories.map(i => '-I' + i))
    .concat([
        '-s', 'NO_EXIT_RUNTIME=1',
        '-s', 'SIDE_MODULE=1',
        '-s', 'ASSERTIONS=2',

        '-D__MBED__',
        '-DTARGET_SIMULATOR',
        '-DMBED_EXCLUSIVE_ACCESS=1U',
        '-DMBEDTLS_TEST_NULL_ENTROPY',
        '-DMBEDTLS_NO_DEFAULT_ENTROPY_SOURCES',
        '-DMBED_CONF_EVENTS_SHARED_EVENTSIZE=256',

        '-O2',

        '-Wall',
        '-Werror',
        '-o', outFile
    ]);

if (emterpretify) {
    args = args.concat([
        '-s', 'EMTERPRETIFY=1',
        '-s', 'EMTERPRETIFY_ASYNC=1',
        '-g3'
    ]);
}
else {
    args = args.concat([
        '-s', 'ASYNCIFY=1',

        '-g4'
    ]);
}

// pass in extra arguments
args = args.concat(process.argv.slice(3));

args = args.filter(a => a !== '--emterpretify');

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

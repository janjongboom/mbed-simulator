#!/usr/bin/env node

/**
 * Builds a complete Mbed OS project
 */

const fs = require('fs');
const Path = require('path');
const spawn = require('child_process').spawn;
const { isDirectory, getDirectories, getCFiles, getAllDirectories, getAllCFiles, ignoreAndFilter } = require('./helpers');
const opn = require('opn');

const folder = process.argv[2];
if (!fs.existsSync(folder)) {
    console.log(`Path ${folder} does not exist`);
    process.exit(1);
}

const verbose = (process.argv.indexOf('--verbose')) > -1 || (process.argv.indexOf('-v') > -1);

const libMbed = Path.resolve(__dirname, 'mbed-simulator-hal', 'libmbed.bc');
if (!fs.existsSync(libMbed)) {
    console.log(libMbed + ' does not exist. Run `node build-libmbed.js` first.');
    process.exit(1);
}

const outFolder = Path.join(folder, 'BUILD', 'SIMULATOR');
if (!fs.existsSync(Path.join(folder, 'BUILD'))) {
    fs.mkdirSync(folder, 'BUILD');
}
if (!fs.existsSync(outFolder)) {
    fs.mkdirSync(outFolder);
}

const outSourceMainCpp = Path.join(outFolder, 'source', 'main.cpp');
if (fs.existsSync(outSourceMainCpp)) {
    fs.unlinkSync(outSourceMainCpp);
}


// OK, so now... we need to build a list with all folders
let includeDirectories = getAllDirectories(folder).concat(getAllDirectories(Path.join(__dirname, 'mbed-simulator-hal')));
let cFiles = [ libMbed ].concat(getAllCFiles(folder));

includeDirectories = ignoreAndFilter(includeDirectories, Path.join(__dirname, 'mbed-simulator-hal', '.simignore')).map(c => Path.resolve(c));
cFiles = ignoreAndFilter(cFiles, Path.join(__dirname, 'mbed-simulator-hal', '.simignore')).map(c => Path.resolve(c));

// so... we need to remove all folders that also exist in the simulator...
let toRemove = [
    "BUILD",
    "mbed-os"
].map(d => Path.join(Path.resolve(folder), d));

includeDirectories = includeDirectories.filter(d => !toRemove.some(r => d.indexOf(r) === 0));
cFiles = cFiles.filter(d => !toRemove.some(r => d.indexOf(r) === 0));

let outFile = Path.join(outFolder, Path.basename(Path.resolve(folder)) + '.js');

let args = cFiles
    .concat(includeDirectories.map(i => '-I' + i))
    .concat([
        //'-s', 'EMTERPRETIFY=1',
        //'-s', 'EMTERPRETIFY_ASYNC=1',

        '-s', 'ASYNCIFY=1',
        '-s', 'NO_EXIT_RUNTIME=1',

        '-D__MBED__',
        '-DTARGET_SIMULATOR',
        '-DMBED_EXCLUSIVE_ACCESS=1U',
        '-DMBEDTLS_TEST_NULL_ENTROPY',
        '-DMBEDTLS_NO_DEFAULT_ENTROPY_SOURCES',
        '-DMBED_CONF_EVENTS_SHARED_EVENTSIZE=256',
        '-DASSERTIONS=2',

        '-g4',


        '-Wall',
        '-Werror',
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

        require('./server/server');

        setTimeout(function() {
            let url = 'http://localhost:' + (process.env.PORT || 7829) + '/view/' + Path.basename(Path.resolve(folder));

            console.log('Running at', url);
            opn(url);
        }, 100);
    }
});

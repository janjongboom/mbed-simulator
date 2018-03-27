#!/usr/bin/env node

/**
 * Builds a complete Mbed OS project
 */

const fs = require('fs');
const Path = require('path');
const spawn = require('child_process').spawn;
const { isDirectory, getDirectories, getCFiles, getAllDirectories, getAllCFiles, ignoreAndFilter } = require('./helpers');
const opn = require('opn');

let folder = process.argv[2];
if (!fs.existsSync(folder)) {
    console.log(`Path ${folder} does not exist`);
    process.exit(1);
}

folder = Path.resolve(folder);

const verbose = (process.argv.indexOf('--verbose')) > -1 || (process.argv.indexOf('-v') > -1);

const libMbed = Path.resolve(__dirname, 'mbed-simulator-hal', 'libmbed.bc');
if (!fs.existsSync(libMbed)) {
    console.log(libMbed + ' does not exist. Run `node build-libmbed.js` first.');
    process.exit(1);
}

const outFolder = Path.join(folder, 'BUILD', 'SIMULATOR');
if (!fs.existsSync(Path.join(folder, 'BUILD'))) {
    fs.mkdirSync(Path.join(folder, 'BUILD'));
}
if (!fs.existsSync(outFolder)) {
    fs.mkdirSync(outFolder);
}

// OK, so now... we need to build a list with all folders
let includeDirectories = getAllDirectories(folder).concat(getAllDirectories(Path.join(__dirname, 'mbed-simulator-hal')));
let cFiles = [ libMbed ].concat(getAllCFiles(folder));

includeDirectories = ignoreAndFilter(includeDirectories, Path.join(__dirname, 'mbed-simulator-hal', '.simignore')).map(c => Path.resolve(c));
cFiles = ignoreAndFilter(cFiles, Path.join(__dirname, 'mbed-simulator-hal', '.simignore')).map(c => Path.resolve(c));

let mbedapp = fs.existsSync(Path.join(folder, 'mbed_app.json')) ? JSON.parse(fs.readFileSync(Path.join(folder, 'mbed_app.json'), 'utf-8')) : {};

let macros = [];

let mbedapp_conf = mbedapp.config || {};
for (let key of Object.keys(mbedapp_conf)) {
    let value = mbedapp_conf[key].value.toString();

    key = 'MBED_CONF_APP_' + key.toUpperCase().replace(/(-|\.)/g, '_');
    value = value.replace(/"/g, '\\"');

    macros.push(key + '="' + value + '"');
}

macros = macros.concat(mbedapp.macros || []);

// features_add is not handled correctly
let target_over = Object.assign({}, (mbedapp.target_overrides || {})['*'], (mbedapp.target_overrides || {})['SIMULATOR']);
for (let key of Object.keys(target_over)) {
    let value = target_over[key].toString();
    key = 'MBED_CONF_' + key.toUpperCase().replace(/(-|\.)/g, '_');
    value = value.replace(/"/g, '\\"');

    macros.push(key + '="' + value + '"');
}


// so... we need to remove all folders that also exist in the simulator...
let toRemove = [
    'BUILD',
    'mbed-os',
    'C12832',
    'Sht31',
    'mbed-http',
    'easy-connect',
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

args = args.concat(macros.map(m => '-D' + m));

// pass in extra arguments
args = args.concat(process.argv.slice(process.argv.slice(3)));

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

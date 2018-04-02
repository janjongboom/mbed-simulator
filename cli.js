#!/usr/bin/env node

/**
 * Builds a complete Mbed OS project
 */

const fs = require('fs');
const Path = require('path');
const spawn = require('child_process').spawn;
const { isDirectory, getDirectories, getCFiles, getAllDirectories, getAllCFiles, ignoreAndFilter } = require('./build-tools/helpers');
const helpers = require('./build-tools/helpers');
const libmbed = require('./build-tools/build-libmbed');
const opn = require('opn');
const commandExistsSync = require('command-exists').sync;

var program = require('commander');

program
    .version('1.0.0')
    .command('build')
    .option('-i, --input-dir', 'Input directory')
    .option('-o, --output-dir', 'Output directory')
    .option('-v', '--verbose', 'Verbose logging')
    .option('--emterpretify', 'Enable emterpretify mode (required if projects take a long time to compile)')
    .parse(process.argv);

if (!program.inputDir) {
    console.log(`Argument '--input-dir' is required`);
    process.exit(1);
}
else if (!fs.existsSync(program.inputDir)) {
    console.log('Input directory', program.inputDir, 'does not exist');
    process.exit(1);
}

if (!program.outputDir) {
    console.log(`Argument '--output-dir' is required`);
    process.exit(1);
}

if (!commandExistsSync('emcc')) {
    console.log('Cannot find emcc');
    console.log('\tEmscripten is not installed (or not in your PATH)');
    console.log('\tFollow: https://kripken.github.io/emscripten-site/docs/getting_started/downloads.html');
    process.exit(1);
}

program.inputDir = Path.resolve(program.inputDir);
program.outputDir = Path.resolve(program.outputDir);

helpers.mkdirpSync(program.outputDir);

function buildApplication(callback) {
    let includeDirectories = getAllDirectories(program.inputDir).concat(libmbed.getAllDirectories()).map(c => Path.resolve(c));;
    let cFiles = [ libmbed.getPath() ].concat(getAllCFiles(program.inputDir)).map(c => Path.resolve(c));

    let macros = helpers.getMacrosFromMbedAppJson(Path.join(program.inputDir, 'mbed_app.json'));

    let simconfig = fs.existsSync(Path.join(folder, 'simconfig.json')) ? JSON.parse(fs.readFileSync(Path.join(folder, 'simconfig.json'))) : {};
    simconfig.args = simconfig.args || [];

    if (simconfig.args.indexOf('--emterpretify') > -1) {
        program.emterpretify = true;
    }

    // so... we need to remove all folders that also exist in the simulator...
    let toRemove = [
        'BUILD',
        'mbed-os',
        'sd-driver',
    ].map(d => Path.join(Path.resolve(folder), d));

    toRemove = toRemove.concat((simconfig.ignore || []).map(f => {
        Path.join(folder, f);
    }));

    includeDirectories = includeDirectories.filter(d => !toRemove.some(r => d.indexOf(r) === 0));
    cFiles = cFiles.filter(d => !toRemove.some(r => d.indexOf(r) === 0));

    let outFile = Path.join(program.outputDir, Path.basename(program.inputDir) + '.js');

    let args = cFiles
        .concat(includeDirectories.map(i => '-I' + i))
        .concat(helpers.defaultBuildFlags)
        .concat([
            '-o', outFile
        ]);

    if (emterpretify) {
        args = args.concat(helpers.emterpretifyFlags);
    }
    else {
        args = args.concat(helpers.nonEmterpretifyFlags);
    }

    args = args.concat(macros.map(m => '-D' + m));

    if (simconfig.args) {
        args = args.concat(simconfig.args);
    }

    // pass in extra arguments
    args = args.concat(process.argv.slice(3));

    // should actually filter out anything that's also on program
    args = args.filter(a => program.indexOf(a) === -1);

    if (program.verbose) {
        console.log('emcc ' + args.join(' '));
        args.push('-v');
    }

    let cmd = spawn('emcc', args);

    cmd.stdout.on('data', data => {
        process.stdout.write(data);
    });
    cmd.stderr.on('data', data => {
        process.stderr.write(data);
    });
    cmd.on('close', code => {
        callback(code);
    });

}

if (!libmbed.exists()) {
    console.log('libmbed.bc does not exist. Building...');

    libmbed.build(program.verbose, function(code) {
        if (code === 0) {
            console.log('libmbed.bc built. Building application...');
        }
        else {
            console.error('libmbed.bc failed to build', code);
            process.exit(1);
        }
    });
}


const verbose = (process.argv.indexOf('--verbose')) > -1 || (process.argv.indexOf('-v') > -1);
let emterpretify = process.argv.indexOf('--emterpretify') > -1;

const libMbed = Path.resolve(__dirname, 'mbed-simulator-hal', 'libmbed.bc');
if (!fs.existsSync(libMbed)) {
    console.log(libMbed + ' does not exist. Building...');
    require('./build-libmbed');
}

const outFolder = Path.join(folder, 'BUILD', 'SIMULATOR');
if (!fs.existsSync(Path.join(folder, 'BUILD'))) {
    fs.mkdirSync(Path.join(folder, 'BUILD'));
}
if (!fs.existsSync(outFolder)) {
    fs.mkdirSync(outFolder);
}

// OK, so now... we need to build a list with all folders
let includeDirectories = .concat(getAllDirectories(Path.join(__dirname, 'mbed-simulator-hal')));
let cFiles = [ libMbed ].concat(getAllCFiles(folder));

includeDirectories = ignoreAndFilter(includeDirectories, Path.join(__dirname, 'mbed-simulator-hal', '.simignore')).map(c => Path.resolve(c));
cFiles = ignoreAndFilter(cFiles, Path.join(__dirname, 'mbed-simulator-hal', '.simignore')).map(c => Path.resolve(c));




let args = cFiles
    .concat(includeDirectories.map(i => '-I' + i))
    .concat([
        '-s', 'NO_EXIT_RUNTIME=1',
        '-s', 'ASSERTIONS=2',

        '-D__MBED__',
        '-DTARGET_SIMULATOR',
        '-DMBED_EXCLUSIVE_ACCESS=1U',
        '-DMBEDTLS_TEST_NULL_ENTROPY',
        '-DMBEDTLS_NO_DEFAULT_ENTROPY_SOURCES',
        '-DMBED_CONF_EVENTS_SHARED_EVENTSIZE=256',

        // '-O2',           // => speed is important here

        '-Wall',
        // '-Werror',
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

args = args.concat(macros.map(m => '-D' + m));

if (simconfig.args) {
    args = args.concat(simconfig.args);
}

// pass in extra arguments
args = args.concat(process.argv.slice(3));

// filter own
args = args.filter(a => a !== '--emterpretify');

if (verbose) {
    console.log('emcc ' + args.join(' '));
}

console.log('Compiling...');

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

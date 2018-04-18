const fs = require('fs');
const Path = require('path');
const spawn = require('child_process').spawn;
const { exists, getAllDirectories, getAllCFiles } = require('./helpers');
const helpers = require('./helpers');
const libmbed = require('./build-libmbed');
const EventEmitter = require('events');
const promisify = require('es6-promisify').promisify;

let build = async function(outFile, extraArgs, emterpretify, verbose, includeDirectories, cFiles) {
    let args = cFiles
        .concat(includeDirectories.map(i => '-I' + i))
        .concat(helpers.defaultBuildFlags)
        .concat(extraArgs)
        .concat([
            '-o', outFile
        ]);

    if (emterpretify) {
        args = args.concat(helpers.emterpretifyFlags);
    }
    else {
        args = args.concat(helpers.nonEmterpretifyFlags);
    }

    if (verbose) {
        console.log('emcc ' + args.join(' '));
        args.push('-v');
    }

    return new Promise((resolve, reject) => {
        let cmd = spawn('emcc', args);

        let stdout = '';

        cmd.stdout.on('data', data => stdout += data.toString('utf-8'));
        cmd.stderr.on('data', data => stdout += data.toString('utf-8'));

        cmd.on('close', code => {
            if (code === 0) {
                resolve(outFile);
            }
            else {
                reject('Application failed to build (' + code + ')\n' + stdout);
            }
        });
    });
}

let buildDirectory = async function (inputDir, outFile, extraArgs, emterpretify, verbose) {
    inputDir = Path.resolve(inputDir);
    outFile = Path.resolve(outFile);

    let includeDirectories = (await getAllDirectories(inputDir)).concat(await libmbed.getAllDirectories()).map(c => Path.resolve(c));;
    let cFiles = [ libmbed.getPath() ].concat(await getAllCFiles(inputDir)).map(c => Path.resolve(c));

    let macros = await helpers.getMacrosFromMbedAppJson(Path.join(inputDir, 'mbed_app.json'));

    let simconfig = await exists(Path.join(inputDir, 'simconfig.json'))
                        ? JSON.parse(await promisify(fs.readFile)(Path.join(inputDir, 'simconfig.json')))
                        : {};

    simconfig['compiler-args'] = simconfig['compiler-args'] || [];

    if (simconfig.emterpretify) {
        emterpretify = true;
    }

    // so... we need to remove all folders that also exist in the simulator...
    let toRemove = [
        'BUILD',
        'mbed-os',
        'sd-driver',
    ].map(d => Path.join(inputDir, d));

    toRemove = toRemove.concat((simconfig.ignore || []).map(f => {
        return Path.join(inputDir, f);
    }));

    // also get rid of all test directories (need proper mapping with Mbed CLI tbh)
    toRemove.push('/TESTS/');

    includeDirectories = includeDirectories.filter(d => !toRemove.some(r => d.indexOf(r) !== -1));
    cFiles = cFiles.filter(d => !toRemove.some(r => d.indexOf(r) !== -1));

    extraArgs = extraArgs
                    .concat(macros.map(m => '-D' + m))
                    .concat(simconfig['compiler-args']);

    return build(outFile, extraArgs, emterpretify, verbose, includeDirectories, cFiles);
}

let buildFile = async function(inputFile, outFile, extraArgs, emterpretify, verbose) {
    inputFile = Path.resolve(inputFile);
    outFile = Path.resolve(outFile);

    let includeDirectories = [ Path.dirname(inputFile) ].concat(await libmbed.getAllDirectories()).map(c => Path.resolve(c));;
    let cFiles = [ libmbed.getPath(), inputFile ].map(c => Path.resolve(c));

    return build(outFile, extraArgs, emterpretify, verbose, includeDirectories, cFiles);
}

module.exports = {
    _build: async function(buildFn, input, outFile, extraArgs, emterpretify, verbose) {
        if (!await libmbed.exists()) {
            console.log('libmbed.bc does not exist. Building...');

            await libmbed.build(verbose);
        }

        await buildFn(input, outFile, extraArgs, emterpretify, verbose);
    },

    buildDirectory: function(inputDir, outFile, extraArgs, emterpretify, verbose) {
        return module.exports._build(buildDirectory, inputDir, outFile, extraArgs, emterpretify, verbose);
    },

    buildFile: function(inputFile, outFile, extraArgs, emterpretify, verbose) {
        return module.exports._build(buildFile, inputFile, outFile, extraArgs, emterpretify, verbose);
    }
};

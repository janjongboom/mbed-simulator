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
const EventEmitter = require('events');

function buildApplication(inputDir, outputDir, args, emterpretify, verbose, callback) {
    let includeDirectories = getAllDirectories(inputDir).concat(libmbed.getAllDirectories()).map(c => Path.resolve(c));;
    let cFiles = [ libmbed.getPath() ].concat(getAllCFiles(inputDir)).map(c => Path.resolve(c));

    let macros = helpers.getMacrosFromMbedAppJson(Path.join(inputDir, 'mbed_app.json'));

    let simconfig = fs.existsSync(Path.join(folder, 'simconfig.json')) ? JSON.parse(fs.readFileSync(Path.join(folder, 'simconfig.json'))) : {};
    simconfig.args = simconfig.args || [];

    if (simconfig.args.indexOf('--emterpretify') > -1) {
        emterpretify = true;
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

    let outFile = Path.join(outputDir, Path.basename(inputDir) + '.js');

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
    args = args.filter(a => args.indexOf(a) === -1);

    if (program.verbose) {
        console.log('emcc ' + args.join(' '));
        args.push('-v');
    }

    let cmd = spawn('emcc', args);

    cmd.on('close', code => {
        if (code === 0) {
            callback(null, outFile);
        }
        else {
            callback('Application failed to build (' + code + ')');
        }
    });

    return cmd;
}

module.exports = {
    build: function(inputDir, outputDir, emterpretify, verbose, callback) {
        let ee = new EventEmitter();

        if (!libmbed.exists()) {
            console.log('libmbed.bc does not exist. Building...');

            let libcmd = libmbed.build(verbose, function(err) {
                if (err) {
                    return callback(err);
                }

                console.log('libmbed.bc built. Building application...');
                let cmd = buildApplication(inputDir, outputDir, emterpretify, verbose, callback);
                cmd.stdout.on('data', data => {
                    ee.emit('stdout', data);
                });
                cmd.stderr.on('data', data => {
                    ee.emit('stderr', data);
                });
            });

            libcmd.stdout.on('data', data => {
                ee.emit('stdout', data);
            });
            libcmd.stderr.on('data', data => {
                ee.emit('stderr', data);
            });
        }
        else {
            let cmd = buildApplication(inputDir, outputDir, emterpretify, verbose, callback);
            cmd.stdout.on('data', data => {
                ee.emit('stdout', data);
            });
            cmd.stderr.on('data', data => {
                ee.emit('stderr', data);
            });
        }

        return ee;
    }
};

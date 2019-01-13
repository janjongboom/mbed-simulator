#!/usr/bin/env node

/**
 * Builds a complete Mbed OS project
 */

const fs = require('fs');
const Path = require('path');
const helpers = require('./build-tools/helpers');
const application = require('./build-tools/build-application');
const opn = require('opn');
const commandExistsSync = require('command-exists').sync;
const launchServer = require('./server/launch-server');
const version = JSON.parse(fs.readFileSync(Path.join(__dirname, 'package.json'), 'utf-8')).version;
const puppeteer = require('puppeteer');
const promisify = require('es6-promisify').promisify;

let program = require('commander');

program
    .version(version)
    .option('-i --input-dir <dir>', 'Input directory')
    .option('-f --input-file <file>', 'Input file')
    .option('-o --output-file <file>', 'Output file (or directory)')
    .option('-v --verbose', 'Verbose logging')
    .option('-c --compiler-opts <opts>', 'Compiler options (e.g. -std=c++11)')
    .option('-l --launch', 'Launch the simulator for this project after building (opens a browser)')
    .option('--launch-headless',  'Launch the simulator for this project after building in headless mode (pipes output to console)')
    .option('--skip-build', 'Skip the build step (launch only)')
    .option('--disable-runtime-logs', 'Disable runtime logs (e.g. from the LoRa server or networking proxy)')
    .option('--emterpretify', 'Enable emterpretify mode (required if projects take a long time to compile)')
    .allowUnknownOption(true)
    .parse(process.argv);

// shorthand so you can run `mbed simulator .`
if (fs.existsSync(process.argv[2]) && fs.statSync(process.argv[2]).isDirectory()) {
    program.inputDir = Path.resolve(process.argv[2]);
    if (!program.launchHeadless) {
        program.launch = true;
    }
}

if (program.inputDir && program.inputFile) {
    console.log('Cannot specify both --input-dir and --input-file');
    process.exit(1);
}

if (!program.inputDir && !program.inputFile) {
    console.log(`Argument '--input-dir' or '--input-file' is required`);
    process.exit(1);
}

if (program.inputDir && !fs.existsSync(program.inputDir)) {
    console.log('Input directory', program.inputDir, 'does not exist');
    process.exit(1);
}

if (program.inputDir && !fs.statSync(program.inputDir).isDirectory()) {
    console.log('Input directory', program.inputDir, 'is not a directory');
    process.exit(1);
}

if (program.inputFile && !fs.existsSync(program.inputFile)) {
    console.log('Input file', program.inputFile, 'does not exist');
    process.exit(1);
}

if (program.inputFile && !fs.statSync(program.inputFile).isFile()) {
    console.log('Input file', program.inputFile, 'is not a file');
    process.exit(1);
}

if (!program.outputFile) {
    if (program.inputDir) {
        program.inputDir = Path.resolve(program.inputDir);
        program.outputFile = Path.join(program.inputDir, 'BUILD', 'SIMULATOR', Path.basename(program.inputDir) + '.js');
    }
    else {
        console.log(`Argument '--output-file' is required`);
        process.exit(1);
    }
}

if (!commandExistsSync('emcc')) {
    console.log('Cannot find emcc');
    console.log('\tEmscripten is not installed (or not in your PATH)');
    console.log('\tFollow: https://kripken.github.io/emscripten-site/docs/getting_started/downloads.html');
    process.exit(1);
}

let inputDir = program.inputDir ? Path.resolve(program.inputDir) : Path.resolve(Path.dirname(program.inputFile));
program.inputFile = program.inputFile ? Path.resolve(program.inputFile) : null;
program.outputFile = Path.resolve(program.outputFile);

if (fs.existsSync(program.outputFile) && fs.statSync(program.outputFile).isDirectory()) {
    program.outputFile = Path.join(program.outputFile, Path.basename(inputDir) + '.js');
}

const outputDir = Path.dirname(program.outputFile);

helpers.mkdirpSync(outputDir);

// extra arguments that are passed in, but need to remove ones already covered in program...
let extraArgs = (program.compilerOpts || '').split(' ');

let fn = program.inputDir ? application.buildDirectory : application.buildFile;

if (program.skipBuild) {
    console.log('Skipping build...');
    fn = () => Promise.resolve();
}

function attachStdin(server) {
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.on('data', (key) => {
        key = key.toString('utf-8');
        if (key === '\u0003') {
            return process.exit(1);
        }

        if (key) {
            server.onStdIn(key.charCodeAt(0));
        }
    });
}

fn(program.inputDir || program.inputFile, program.outputFile, extraArgs, program.emterpretify, program.verbose)
    .then(async function() {
        console.log('Building application succeeded, output file is', program.outputFile);

        if (program.launch || program.launchHeadless) {
            let browser;
            try {
                let port = process.env.PORT || 7900;
                let logsEnabled = !program.disableRuntimeLogs;
                let server = await promisify(launchServer)(outputDir, port, 0, logsEnabled);

                let name = Path.basename(program.outputFile, '.js');

                if (program.launch) {
                    opn(`http://localhost:${port}/view/${name}`);
                }
                else if (program.launchHeadless) {
                    browser = await puppeteer.launch();
                    const page = await browser.newPage();
                    await page.exposeFunction('onPrintEvent', e => {
                        process.stdout.write(e);
                    });
                    await page.exposeFunction('onStartExecution', () => {
                        console.log('Application started in headless mode');
                        attachStdin(server);
                    });
                    await page.exposeFunction('onFailedExecution', async function (e) {
                        console.error('Error while running in headless mode', e);
                        await browser.close();
                        process.exit(1);
                    });
                    await page.goto(`http://localhost:${port}/view/${name}`);
                }
            }
            catch (ex) {
                console.error('Failed to launch server', ex);
                if (browser) {
                    await browser.close();
                }
            }
        }
    })
    .catch(err => {
        console.error(err);
        console.error('Building application failed');
    });

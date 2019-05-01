const fs = require('fs');
const Path = require('path');
const spawn = require('child_process').spawn;
const { exists, getAllDirectories, getAllCFiles, ignoreAndFilter } = require('./helpers');
const helpers = require('./helpers');
const EventEmitter = require('events');
const commandExists = require('command-exists');
const promisify = require('es6-promisify').promisify;

const outFolder = Path.join(__dirname, '..', 'mbed-simulator-hal');
const outFile = Path.resolve(Path.join(outFolder, 'libmbed.bc')); // should this be configurable?
const ignoreFile = Path.join(outFolder, '.simignore');

let libmbed = {
    getAllDirectories: async function() {
        let cacheFile = Path.join(outFolder, 'directories.cache');

        if (await exists(cacheFile)) {
            return JSON.parse(await promisify(fs.readFile)(cacheFile), 'utf-8');
        }

        let dirs = await ignoreAndFilter(await getAllDirectories(outFolder), ignoreFile);

        // now filter out all directories that do not have:
        // 1. header files in them
        // 2. that are not the parent of a folder which would have header files
        //    (e.g. features/ should be included because features/netsocket has header files)

        // to achieve this
        // 1. sort on longest length first - this is done so for a/b/c where all of them are empty will filter out a/b/c, then a/b, then a
        dirs = dirs.sort((a, b) => b.length - a.length);

        // 2. loop over the array, if no header files and no other folders mention the specific substring then filter out
        let dirsToRemove = []; // don't mess with the array when iterating
        for (let d of dirs) {
            // check if .h or .hpp file in the current folder, *ALSO* check for .js files, as these could be components
            let hasHeaderFiles = (await promisify(fs.readdir)(d)).some(f => ['.h', '.hpp', '.js'].indexOf(Path.extname(f)) > -1);
            // should not be the same, should not be in removal array, and should match substr
            let hasChildren = dirs.filter(sd => sd !== d && sd.indexOf(d) > -1 && dirsToRemove.indexOf(sd) === -1).length > 0;

            if (!hasHeaderFiles && !hasChildren) {
                dirsToRemove.push(d);
            }
        }

        dirs = dirs.filter(d => dirsToRemove.indexOf(d) === -1);

        await promisify(fs.writeFile)(cacheFile, JSON.stringify(dirs), 'utf-8');
        return dirs;
    },

    getAllCFiles: async function() {
        let cacheFile = Path.join(outFolder, 'cfiles.cache');

        if (await exists(cacheFile)) {
            return JSON.parse(await promisify(fs.readFile)(cacheFile), 'utf-8');
        }

        let dirs = await ignoreAndFilter(await getAllCFiles(outFolder), ignoreFile);
        await promisify(fs.writeFile)(cacheFile, JSON.stringify(dirs), 'utf-8');
        return dirs;
    },

    getPath: function() {
        return outFile;
    },

    exists: function() {
        return exists(outFile);
    },

    mbedDeploy: async function() {
        let cacheFile = Path.join(outFolder, 'ran-mbed-deploy.cache');

        if (await exists(cacheFile)) {
            return;
        }

        console.log(`'mbed deploy' did not run before, running...`);

        return new Promise((resolve, reject) => {

            let stdout = '';

            let cmd = spawn('mbed', [ 'deploy' ], { cwd: Path.join(__dirname, '..') });

            cmd.stdout.on('data', data => stdout += data.toString('utf-8'));
            cmd.stderr.on('data', data => stdout += data.toString('utf-8'));

            cmd.on('close', code => {
                if (code === 0) {
                    fs.writeFile(cacheFile, stdout, 'utf-8', function(err) {
                        if (err) return reject(err);
                        resolve(null);
                    });
                }
                else {
                    return reject('Failed to run `mbed deploy` (' + code + ')\n' + stdout);
                }
            });
        });
    },

    checkDependencies: async function() {
        try {
            await commandExists('mbed');
        }
        catch (ex) {
            throw 'Mbed CLI (mbed) is not installed. Follow the steps in https://github.com/armmbed/mbed-cli to continue';
        }

        try {
            // there's helpers.emccCmd, but the weird thing is that we need to spawn emcc.bat on Windows, but this still works...
            await commandExists('emcc');
        }
        catch (ex) {
            throw 'Emscripten (emcc) is not installed. Follow the steps in https://kripken.github.io/emscripten-site/docs/getting_started/downloads.html to continue. Make sure `emcc` is in your path.';
        }
    },

    build: async function(verbose) {
        await this.checkDependencies();

        // clear cache files
        let cacheFiles = [
            Path.join(outFolder, 'directories.cache'),
            Path.join(outFolder, 'cfiles.cache')
        ];
        await Promise.all(cacheFiles.map(async function(c) {
            if (await(exists(c))) {
                promisify(fs.unlink)(c);
            }
        }));

        await this.mbedDeploy();

        let includeDirectories = await this.getAllDirectories();
        let cFiles = await this.getAllCFiles();
        let emterpretify = false; // no need for this yet

        let args = cFiles
            .concat(includeDirectories.map(i => '-I' + i))
            .concat(helpers.defaultBuildFlags)
            .concat([
                '-DMBEDTLS_TEST_NULL_ENTROPY',
                '-DMBEDTLS_NO_DEFAULT_ENTROPY_SOURCES',

                '-O2',
                '-o', outFile
            ]);

        if (emterpretify) {
            args = args.concat(helpers.emterpretifyFlags);
        }
        else {
            args = args.concat(helpers.nonEmterpretifyFlags);
        }

        args = args.filter(a => a !== '--emterpretify');

        if (verbose) {
            console.log(helpers.emccCmd + ' ' + args.join(' '));
            args.push('-v');
        }

        let cmd = await helpers.spawnEmcc(args);

        return new Promise((resolve, reject) => {
            let stdout = '';

            cmd.stdout.on('data', data => stdout += data.toString('utf-8'));
            cmd.stderr.on('data', data => stdout += data.toString('utf-8'));

            cmd.on('close', code => {
                if (code === 0) {
                    return resolve();
                }
                else {
                    return reject('Failed to build libmbed (' + code + ')\n' + stdout);
                }
            });
        });
    }
};

module.exports = libmbed;

const fs = require('fs');
const Path = require('path');
const spawn = require('child_process').spawn;
const { isDirectory, getDirectories, getCFiles, getAllDirectories, getAllCFiles, ignoreAndFilter } = require('./helpers');
const helpers = require('./helpers');

const outFolder = Path.join(__dirname, '..', 'mbed-simulator-hal');
const outFile = Path.resolve(Path.join(outFolder, 'libmbed.bc')); // should this be configurable?
const ignoreFile = Path.join(outFolder, '.simignore');

let libmbed = {
    getAllDirectories: function() {
        let cacheFile = Path.join(outFolder, 'directories.cache');

        if (fs.existsSync(cacheFile)) {
            return JSON.parse(fs.readFileSync(cacheFile), 'utf-8');
        }

        let dirs = ignoreAndFilter(getAllDirectories(outFolder), ignoreFile);
        fs.writeFileSync(cacheFile, JSON.stringify(dirs), 'utf-8');
        return dirs;
    },

    getAllCFiles: function() {
        let cacheFile = Path.join(outFolder, 'cfiles.cache');

        if (fs.existsSync(cacheFile)) {
            return JSON.parse(fs.readFileSync(cacheFile), 'utf-8');
        }

        let dirs = ignoreAndFilter(getAllCFiles(outFolder), ignoreFile);
        fs.writeFileSync(cacheFile, JSON.stringify(dirs), 'utf-8');
        return dirs;
    },

    getPath: function() {
        return outFile;
    },

    exists = function() {
        return fs.existsSync(outFolder);
    },

    build: function(verbose, callback) {
        let includeDirectories = this.getAllDirectories();
        let cFiles = this.getAllCFiles();
        let emterpretify = false; // no need for this yet

        let args = cFiles
            .concat(includeDirectories.map(i => '-I' + i))
            .concat(helpers.defaultBuildFlags)
            .concat([
                '-s', 'SIDE_MODULE=1',

                '-Werror',

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
            console.log('emcc ' + args.join(' '));
            args.push('-v');
        }

        let cmd = spawn('emcc', args);

        cmd.on('close', code => {
            if (code === 0) {
                return callback(null);
            }
            else {
                return callback('Failed to build libmbed (' + code + ')');
            }
        });

        return cmd;
    }
};

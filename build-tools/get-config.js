/**
 * This file uses Mbed CLI to get all the macros and configuration for an application
 */

const spawn = require('child_process').spawn;
const { exists } = require('./helpers');

function getConfigForFolder(folder) {
    return new Promise((resolve, reject) => {
        let cmd = spawn('mbed', [ 'compile', '-m', 'SIMULATOR', '-t', 'GCC_ARM', '--config' ], { cwd: folder });

        let stdout = '';

        cmd.stdout.on('data', data => stdout += data.toString('utf-8'));
        cmd.stderr.on('data', data => stdout += data.toString('utf-8'));

        cmd.on('close', code => {
            if (code !== 0) {
                return reject('Failed to retrieve config (' + code + ')\n' + stdout);
            }

            let macros = [];

            // OK, so now come the parsing part...
            let inConfig = false;
            let inMacros = false;
            for (let line of stdout.split('\n')) {
                if (line === 'Configuration parameters') {
                    inConfig = true;
                    continue;
                }
                if (line === 'Macros') {
                    inMacros = true;
                    inConfig = false;
                    continue;
                }

                if (inConfig) {
                    let configRegex = /([^=]+)=\s([^\s]+)\s\(macro\sname\:\s\"([^\"]+)/;
                    if (!configRegex.test(line)) continue;

                    let [ fullLine, configName, value, macro ] = line.match(configRegex);
                    macros.push({ key: macro, value: value });
                }

                if (inMacros) {
                    if (/^\w/.test(line)) {
                        macros.push({ key: line });
                    }
                }

                resolve(macros);
            }
        });
    });
}

module.exports = {
    getConfigForFolder: getConfigForFolder
};

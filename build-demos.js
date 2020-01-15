const child_process = require('child_process');
const program = require('commander');
const fs = require('fs');

const demo_output_directory = 'out';

function buildDirectory(demos_dir, directory) {
    console.log(`Building ${directory}...`);

    const buildResult = child_process.spawnSync(
        'node',
        [
            'cli.js',
            '-i',
            `${demos_dir}/${directory}`,
            '-o',
            demo_output_directory,
            '--compiler-opts',
            '-Os'
        ]
    );

    if (buildResult.status === 0) {
        console.log(buildResult.stdout.toString());
    } else {
        console.log(buildResult.stderr.toString());
    }
}

program.option(
    '-i --input-dir <dir>', 'Input directory for the demos', 'demos'
);
program.parse(process.argv);

if (!fs.existsSync(demo_output_directory)) {
     fs.mkdirSync(demo_output_directory);
}

fs.readdir(program.inputDir, (err, directories) => directories.map(
    directory => buildDirectory(program.inputDir, directory)
));

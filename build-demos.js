const child_process = require('child_process');
const fs = require('fs');

const demos_directory = 'demos';
const demo_output_directory = 'out';

function buildDirectory(directory) {
    console.log(`Building ${directory}...`);

    const buildResult = child_process.spawnSync(
        'node',
        [
            'cli.js',
            '-i',
            `${demos_directory}/${directory}`,
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

if (!fs.existsSync(demo_output_directory)) {
     fs.mkdirSync(demo_output_directory);
}

fs.readdir(demos_directory, (err, directories) => directories.map(
    directory => buildDirectory(directory)
));

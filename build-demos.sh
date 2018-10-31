for dir in demos/*/
do
    echo "Building ${dir}..."
    node cli.js -i ${dir} -o out/ --compiler-opts "-Os"
done

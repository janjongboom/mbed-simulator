for dir in demos/*
do
    if [[ -d "$dir" && ! -L "$dir" ]]; then
        echo "Building ${dir}..."
        node cli.js -i ${dir} -o out/ --compiler-opts "-O2 -Werror"
    fi
done

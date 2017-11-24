for dir in demos/*
do
    if [[ -d "$dir" && ! -L "$dir" ]]; then
        echo "Building ${dir}..."
        node build-demo.js ${dir}
    fi
done

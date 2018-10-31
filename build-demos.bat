for /D %%s in (demos/*) do @echo Building demos/%%s... && node cli.js -i demos/%%s -o out/ --compiler-opts "-Os"

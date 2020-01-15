FROM node:12.14

ENV PATH="/emsdk:/emsdk/emscripten/tag-1.38.21:${PATH}"
ENV EMSDK="/emsdk"
ENV EM_CONFIG="/root/.emscripten"
ENV EMSCRIPTEN="/emsdk/emscripten/tag-1.38.21"
ENV EMSCRIPTEN_NATIVE_OPTIMIZER="/emsdk/emscripten/tag-1.38.21_64bit_optimizer/optimizer"

RUN apt-get update -qq && apt-get -qqy install \
        cmake git python-dev python-pip && \
    pip install mbed-cli mercurial && \
    git clone https://github.com/emscripten-core/emsdk

RUN emsdk/emsdk install fastcomp-clang-e1.38.21-64bit && \
    emsdk/emsdk activate fastcomp-clang-e1.38.21-64bit && \
    emsdk/emsdk install emscripten-tag-1.38.21-64bit && \
    emsdk/emsdk activate emscripten-tag-1.38.21-64bit

ADD . /app

WORKDIR /app

RUN npm install && npm run build-demos

EXPOSE 7829

CMD ["node", "server.js"]

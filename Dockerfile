FROM node:12.14-slim

ENV PATH="/emsdk:/emsdk/emscripten/tag-1.38.21:${PATH}"
ENV EMSDK="/emsdk"
ENV EM_CONFIG="/root/.emscripten"
ENV EMSCRIPTEN="/emsdk/emscripten/tag-1.38.21"
ENV EMSCRIPTEN_NATIVE_OPTIMIZER="/emsdk/emscripten/tag-1.38.21_64bit_optimizer/optimizer"

RUN apt-get update -qq && apt-get -qqy install \
    cmake git curl unzip python-dev python-pip && \
    pip install mbed-cli mercurial

ENV EMSDK_REVISION="50df5a2983d1b793f189c674ad588d8df5f9b2f4"
RUN curl -LO https://github.com/emscripten-core/emsdk/archive/${EMSDK_REVISION}.zip && \
    unzip ${EMSDK_REVISION}.zip && \
    mv emsdk-${EMSDK_REVISION} emsdk

RUN emsdk/emsdk install fastcomp-clang-e1.38.21-64bit && \
    emsdk/emsdk activate fastcomp-clang-e1.38.21-64bit && \
    emsdk/emsdk install emscripten-tag-1.38.21-64bit && \
    emsdk/emsdk activate emscripten-tag-1.38.21-64bit

ADD . /app
WORKDIR /app

ENV DEMOS_DIRECTORY="demos"
RUN npm install && npm run build-demos

EXPOSE 7829

CMD ["npm", "run", "start"]

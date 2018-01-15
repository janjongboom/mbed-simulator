#include "mbed.h"
#include "stdio.h"
#include "uTensor_util.hpp"
#include "tensor.hpp"
#include "tensorIdxImporterTests.hpp"
#include "context.hpp"
#include "ArrayTests.hpp"
#include "MatrixTests.hpp"
#include "tensor_test.hpp"
#include "NnTests.hpp"
// #include "mlp_test.hpp"
#include "deep_mnist_mlp.hpp"
#include "context_test.hpp"
#include "MathTests.hpp"
#include "sdtest.hpp"
#include "vmtest.hpp"

int main(int argc, char** argv) {
  init_env();

  printf("Deep MLP on Mbed (Trained with Tensorflow)\n\n");
  printf("running deep-mlp...\n");

  int prediction = runMLP("/fs/testData/deep_mlp/import-Placeholder_0.idx");
  printf("prediction: %d\n", prediction);


  printf("Done\n");
}

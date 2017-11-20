#include <stdlib.h>
#include "ns_hal_init.h"

void ns_hal_init(void *heap, size_t h_size, void (*passed_fptr)(heap_fail_t), mem_stat_t *info_ptr) {
    static bool initted = false;
    if (initted) {
        return;
    }

    heap = malloc(h_size);

    initted = true;
}

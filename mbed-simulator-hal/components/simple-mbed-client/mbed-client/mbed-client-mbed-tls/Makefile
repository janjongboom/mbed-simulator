#
# Makefile for running unit tests
#
# List of subdirectories to build
TEST_FOLDER := ./test/

LIB = libmbed-client-mbedtls.a

# List of unit test directories for libraries
UNITTESTS := $(sort $(dir $(wildcard $(TEST_FOLDER)*/unittest/*)))
TESTDIRS := $(UNITTESTS:%=build-%)
CLEANTESTDIRS := $(UNITTESTS:%=clean-%)
COVERAGEFILE := ./lcov/coverage.info

include sources.mk
include include_dirs.mk

override CFLAGS += $(addprefix -I,$(INCLUDE_DIRS))
override CFLAGS += $(addprefix -D,$(FLAGS))
ifeq ($(DEBUG),1)
override CFLAGS += -DHAVE_DEBUG
endif

#
# Define compiler toolchain
#
include toolchain_rules.mk

$(eval $(call generate_rules,$(LIB),$(SRCS)))

# Extend default clean rule
clean: clean-extra

$(TESTDIRS):
	@yotta target frdm-k64f-gcc
	@yotta install mbed-client
	@yotta install mbed-client-mbed-os
	@make -C $(@:build-%=%)

$(CLEANDIRS):
	@make -C $(@:clean-%=%) clean

$(CLEANTESTDIRS):
	@make -C $(@:clean-%=%) clean

.PHONY: test
test: $(TESTDIRS)
	@rm -rf ./lcov
	@rm -rf ./coverage
	@mkdir -p lcov
	@mkdir -p lcov/results
	@mkdir coverage
	@find ./test -name '*.xml' | xargs cp -t ./lcov/results/
	@rm -f lcov/index.xml
	@./xsl_script.sh
	@cp junit_xsl.xslt lcov/.
	@xsltproc -o lcov/testresults.html lcov/junit_xsl.xslt lcov/index.xml
	@rm -f lcov/junit_xsl.xslt
	@rm -f lcov/index.xml
	@find ./ -name '*.gcno' | xargs cp --backup=numbered -t ./coverage/
	@find ./ -name '*.gcda' | xargs cp --backup=numbered -t ./coverage/
	gcovr --object-directory ./coverage --exclude-unreachable-branches --exclude '/usr' --exclude '.*mbed-client-mbed-tls_unit_tests_master*.' --exclude '.*mbed-client-mbed-os*.' --exclude '.*common*.' --exclude '.*mbed-net-sockets.v0*.' --exclude '.*stub*.' --exclude '/yotta_modules/' -x -o ./lcov/gcovr.xml
	@lcov -d test/. -c -o $(COVERAGEFILE)
	@lcov -q -r $(COVERAGEFILE) "/usr*" -o $(COVERAGEFILE)
	@lcov -q -r $(COVERAGEFILE) "/test*" -o $(COVERAGEFILE)
	@lcov -q -r $(COVERAGEFILE) "/mbed-client/*" -o $(COVERAGEFILE)
	@genhtml -q $(COVERAGEFILE) --show-details --output-directory lcov/html
	@yotta uninstall mbed-client
	@yotta uninstall mbed-client-mbed-os
	@echo mbed-client-mbed-tls module unit tests built

clean-extra: $(CLEANDIRS) \
	$(CLEANTESTDIRS)

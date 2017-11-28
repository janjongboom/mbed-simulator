// The Module object: Our interface to the outside world. We import
// and export values on it, and do the work to get that through
// closure compiler if necessary. There are various ways Module can be used:
// 1. Not defined. We create it here
// 2. A function parameter, function(Module) { ..generated code.. }
// 3. pre-run appended it, var Module = {}; ..generated code..
// 4. External script tag defines var Module.
// We need to do an eval in order to handle the closure compiler
// case, where this code here is minified but Module was defined
// elsewhere (e.g. case 4 above). We also need to check if Module
// already exists (e.g. case 3 above).
// Note that if you want to run closure, and also to use Module
// after the generated code, you will need to define   var Module = {};
// before the code. Then that object will be used in the code, and you
// can continue to use Module afterwards as well.
var Module;
if (!Module) Module = (typeof Module !== 'undefined' ? Module : null) || {};

// Sometimes an existing Module object exists with properties
// meant to overwrite the default module functionality. Here
// we collect those properties and reapply _after_ we configure
// the current environment's defaults to avoid having to be so
// defensive during initialization.
var moduleOverrides = {};
for (var key in Module) {
  if (Module.hasOwnProperty(key)) {
    moduleOverrides[key] = Module[key];
  }
}

// The environment setup code below is customized to use Module.
// *** Environment setup code ***
var ENVIRONMENT_IS_WEB = false;
var ENVIRONMENT_IS_WORKER = false;
var ENVIRONMENT_IS_NODE = false;
var ENVIRONMENT_IS_SHELL = false;

// Three configurations we can be running in:
// 1) We could be the application main() thread running in the main JS UI thread. (ENVIRONMENT_IS_WORKER == false and ENVIRONMENT_IS_PTHREAD == false)
// 2) We could be the application main() thread proxied to worker. (with Emscripten -s PROXY_TO_WORKER=1) (ENVIRONMENT_IS_WORKER == true, ENVIRONMENT_IS_PTHREAD == false)
// 3) We could be an application pthread running in a worker. (ENVIRONMENT_IS_WORKER == true and ENVIRONMENT_IS_PTHREAD == true)

if (Module['ENVIRONMENT']) {
  if (Module['ENVIRONMENT'] === 'WEB') {
    ENVIRONMENT_IS_WEB = true;
  } else if (Module['ENVIRONMENT'] === 'WORKER') {
    ENVIRONMENT_IS_WORKER = true;
  } else if (Module['ENVIRONMENT'] === 'NODE') {
    ENVIRONMENT_IS_NODE = true;
  } else if (Module['ENVIRONMENT'] === 'SHELL') {
    ENVIRONMENT_IS_SHELL = true;
  } else {
    throw new Error('The provided Module[\'ENVIRONMENT\'] value is not valid. It must be one of: WEB|WORKER|NODE|SHELL.');
  }
} else {
  ENVIRONMENT_IS_WEB = typeof window === 'object';
  ENVIRONMENT_IS_WORKER = typeof importScripts === 'function';
  ENVIRONMENT_IS_NODE = typeof process === 'object' && typeof require === 'function' && !ENVIRONMENT_IS_WEB && !ENVIRONMENT_IS_WORKER;
  ENVIRONMENT_IS_SHELL = !ENVIRONMENT_IS_WEB && !ENVIRONMENT_IS_NODE && !ENVIRONMENT_IS_WORKER;
}


if (ENVIRONMENT_IS_NODE) {
  // Expose functionality in the same simple way that the shells work
  // Note that we pollute the global namespace here, otherwise we break in node
  if (!Module['print']) Module['print'] = console.log;
  if (!Module['printErr']) Module['printErr'] = console.warn;

  var nodeFS;
  var nodePath;

  Module['read'] = function shell_read(filename, binary) {
    if (!nodeFS) nodeFS = require('fs');
    if (!nodePath) nodePath = require('path');
    filename = nodePath['normalize'](filename);
    var ret = nodeFS['readFileSync'](filename);
    return binary ? ret : ret.toString();
  };

  Module['readBinary'] = function readBinary(filename) {
    var ret = Module['read'](filename, true);
    if (!ret.buffer) {
      ret = new Uint8Array(ret);
    }
    assert(ret.buffer);
    return ret;
  };

  Module['load'] = function load(f) {
    globalEval(read(f));
  };

  if (!Module['thisProgram']) {
    if (process['argv'].length > 1) {
      Module['thisProgram'] = process['argv'][1].replace(/\\/g, '/');
    } else {
      Module['thisProgram'] = 'unknown-program';
    }
  }

  Module['arguments'] = process['argv'].slice(2);

  if (typeof module !== 'undefined') {
    module['exports'] = Module;
  }

  process['on']('uncaughtException', function(ex) {
    // suppress ExitStatus exceptions from showing an error
    if (!(ex instanceof ExitStatus)) {
      throw ex;
    }
  });

  Module['inspect'] = function () { return '[Emscripten Module object]'; };
}
else if (ENVIRONMENT_IS_SHELL) {
  if (!Module['print']) Module['print'] = print;
  if (typeof printErr != 'undefined') Module['printErr'] = printErr; // not present in v8 or older sm

  if (typeof read != 'undefined') {
    Module['read'] = read;
  } else {
    Module['read'] = function shell_read() { throw 'no read() available' };
  }

  Module['readBinary'] = function readBinary(f) {
    if (typeof readbuffer === 'function') {
      return new Uint8Array(readbuffer(f));
    }
    var data = read(f, 'binary');
    assert(typeof data === 'object');
    return data;
  };

  if (typeof scriptArgs != 'undefined') {
    Module['arguments'] = scriptArgs;
  } else if (typeof arguments != 'undefined') {
    Module['arguments'] = arguments;
  }

  if (typeof quit === 'function') {
    Module['quit'] = function(status, toThrow) {
      quit(status);
    }
  }

}
else if (ENVIRONMENT_IS_WEB || ENVIRONMENT_IS_WORKER) {
  Module['read'] = function shell_read(url) {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', url, false);
    xhr.send(null);
    return xhr.responseText;
  };

  if (ENVIRONMENT_IS_WORKER) {
    Module['readBinary'] = function readBinary(url) {
      var xhr = new XMLHttpRequest();
      xhr.open('GET', url, false);
      xhr.responseType = 'arraybuffer';
      xhr.send(null);
      return new Uint8Array(xhr.response);
    };
  }

  Module['readAsync'] = function readAsync(url, onload, onerror) {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', url, true);
    xhr.responseType = 'arraybuffer';
    xhr.onload = function xhr_onload() {
      if (xhr.status == 200 || (xhr.status == 0 && xhr.response)) { // file URLs can return 0
        onload(xhr.response);
      } else {
        onerror();
      }
    };
    xhr.onerror = onerror;
    xhr.send(null);
  };

  if (typeof arguments != 'undefined') {
    Module['arguments'] = arguments;
  }

  if (typeof console !== 'undefined') {
    if (!Module['print']) Module['print'] = function shell_print(x) {
      console.log(x);
    };
    if (!Module['printErr']) Module['printErr'] = function shell_printErr(x) {
      console.warn(x);
    };
  } else {
    // Probably a worker, and without console.log. We can do very little here...
    var TRY_USE_DUMP = false;
    if (!Module['print']) Module['print'] = (TRY_USE_DUMP && (typeof(dump) !== "undefined") ? (function(x) {
      dump(x);
    }) : (function(x) {
      // self.postMessage(x); // enable this if you want stdout to be sent as messages
    }));
  }

  if (ENVIRONMENT_IS_WORKER) {
    Module['load'] = importScripts;
  }

  if (typeof Module['setWindowTitle'] === 'undefined') {
    Module['setWindowTitle'] = function(title) { document.title = title };
  }
}
else {
  // Unreachable because SHELL is dependant on the others
  throw 'Unknown runtime environment. Where are we?';
}

function globalEval(x) {
  eval.call(null, x);
}
if (!Module['load'] && Module['read']) {
  Module['load'] = function load(f) {
    globalEval(Module['read'](f));
  };
}
if (!Module['print']) {
  Module['print'] = function(){};
}
if (!Module['printErr']) {
  Module['printErr'] = Module['print'];
}
if (!Module['arguments']) {
  Module['arguments'] = [];
}
if (!Module['thisProgram']) {
  Module['thisProgram'] = './this.program';
}
if (!Module['quit']) {
  Module['quit'] = function(status, toThrow) {
    throw toThrow;
  }
}

// *** Environment setup code ***

// Closure helpers
Module.print = Module['print'];
Module.printErr = Module['printErr'];

// Callbacks
Module['preRun'] = [];
Module['postRun'] = [];

// Merge back in the overrides
for (var key in moduleOverrides) {
  if (moduleOverrides.hasOwnProperty(key)) {
    Module[key] = moduleOverrides[key];
  }
}
// Free the object hierarchy contained in the overrides, this lets the GC
// reclaim data used e.g. in memoryInitializerRequest, which is a large typed array.
moduleOverrides = undefined;



// {{PREAMBLE_ADDITIONS}}

// === Preamble library stuff ===

// Documentation for the public APIs defined in this file must be updated in:
//    site/source/docs/api_reference/preamble.js.rst
// A prebuilt local version of the documentation is available at:
//    site/build/text/docs/api_reference/preamble.js.txt
// You can also build docs locally as HTML or other formats in site/
// An online HTML version (which may be of a different version of Emscripten)
//    is up at http://kripken.github.io/emscripten-site/docs/api_reference/preamble.js.html

//========================================
// Runtime code shared with compiler
//========================================

var Runtime = {
  setTempRet0: function (value) {
    tempRet0 = value;
    return value;
  },
  getTempRet0: function () {
    return tempRet0;
  },
  stackSave: function () {
    return STACKTOP;
  },
  stackRestore: function (stackTop) {
    STACKTOP = stackTop;
  },
  getNativeTypeSize: function (type) {
    switch (type) {
      case 'i1': case 'i8': return 1;
      case 'i16': return 2;
      case 'i32': return 4;
      case 'i64': return 8;
      case 'float': return 4;
      case 'double': return 8;
      default: {
        if (type[type.length-1] === '*') {
          return Runtime.QUANTUM_SIZE; // A pointer
        } else if (type[0] === 'i') {
          var bits = parseInt(type.substr(1));
          assert(bits % 8 === 0);
          return bits/8;
        } else {
          return 0;
        }
      }
    }
  },
  getNativeFieldSize: function (type) {
    return Math.max(Runtime.getNativeTypeSize(type), Runtime.QUANTUM_SIZE);
  },
  STACK_ALIGN: 16,
  prepVararg: function (ptr, type) {
    if (type === 'double' || type === 'i64') {
      // move so the load is aligned
      if (ptr & 7) {
        assert((ptr & 7) === 4);
        ptr += 4;
      }
    } else {
      assert((ptr & 3) === 0);
    }
    return ptr;
  },
  getAlignSize: function (type, size, vararg) {
    // we align i64s and doubles on 64-bit boundaries, unlike x86
    if (!vararg && (type == 'i64' || type == 'double')) return 8;
    if (!type) return Math.min(size, 8); // align structures internally to 64 bits
    return Math.min(size || (type ? Runtime.getNativeFieldSize(type) : 0), Runtime.QUANTUM_SIZE);
  },
  dynCall: function (sig, ptr, args) {
    if (args && args.length) {
      assert(args.length == sig.length-1);
      assert(('dynCall_' + sig) in Module, 'bad function pointer type - no table for sig \'' + sig + '\'');
      return Module['dynCall_' + sig].apply(null, [ptr].concat(args));
    } else {
      assert(sig.length == 1);
      assert(('dynCall_' + sig) in Module, 'bad function pointer type - no table for sig \'' + sig + '\'');
      return Module['dynCall_' + sig].call(null, ptr);
    }
  },
  functionPointers: [],
  addFunction: function (func) {
    for (var i = 0; i < Runtime.functionPointers.length; i++) {
      if (!Runtime.functionPointers[i]) {
        Runtime.functionPointers[i] = func;
        return 2*(1 + i);
      }
    }
    throw 'Finished up all reserved function pointers. Use a higher value for RESERVED_FUNCTION_POINTERS.';
  },
  removeFunction: function (index) {
    Runtime.functionPointers[(index-2)/2] = null;
  },
  warnOnce: function (text) {
    if (!Runtime.warnOnce.shown) Runtime.warnOnce.shown = {};
    if (!Runtime.warnOnce.shown[text]) {
      Runtime.warnOnce.shown[text] = 1;
      Module.printErr(text);
    }
  },
  funcWrappers: {},
  getFuncWrapper: function (func, sig) {
    if (!func) return; // on null pointer, return undefined
    assert(sig);
    if (!Runtime.funcWrappers[sig]) {
      Runtime.funcWrappers[sig] = {};
    }
    var sigCache = Runtime.funcWrappers[sig];
    if (!sigCache[func]) {
      // optimize away arguments usage in common cases
      if (sig.length === 1) {
        sigCache[func] = function dynCall_wrapper() {
          return Runtime.dynCall(sig, func);
        };
      } else if (sig.length === 2) {
        sigCache[func] = function dynCall_wrapper(arg) {
          return Runtime.dynCall(sig, func, [arg]);
        };
      } else {
        // general case
        sigCache[func] = function dynCall_wrapper() {
          return Runtime.dynCall(sig, func, Array.prototype.slice.call(arguments));
        };
      }
    }
    return sigCache[func];
  },
  getCompilerSetting: function (name) {
    throw 'You must build with -s RETAIN_COMPILER_SETTINGS=1 for Runtime.getCompilerSetting or emscripten_get_compiler_setting to work';
  },
  stackAlloc: function (size) { var ret = STACKTOP;STACKTOP = (STACKTOP + size)|0;STACKTOP = (((STACKTOP)+15)&-16);(assert((((STACKTOP|0) < (STACK_MAX|0))|0))|0); return ret; },
  staticAlloc: function (size) { var ret = STATICTOP;STATICTOP = (STATICTOP + (assert(!staticSealed),size))|0;STATICTOP = (((STATICTOP)+15)&-16); return ret; },
  dynamicAlloc: function (size) { assert(DYNAMICTOP_PTR);var ret = HEAP32[DYNAMICTOP_PTR>>2];var end = (((ret + size + 15)|0) & -16);HEAP32[DYNAMICTOP_PTR>>2] = end;if (end >= TOTAL_MEMORY) {var success = enlargeMemory();if (!success) {HEAP32[DYNAMICTOP_PTR>>2] = ret;return 0;}}return ret;},
  alignMemory: function (size,quantum) { var ret = size = Math.ceil((size)/(quantum ? quantum : 16))*(quantum ? quantum : 16); return ret; },
  makeBigInt: function (low,high,unsigned) { var ret = (unsigned ? ((+((low>>>0)))+((+((high>>>0)))*4294967296.0)) : ((+((low>>>0)))+((+((high|0)))*4294967296.0))); return ret; },
  GLOBAL_BASE: 8,
  QUANTUM_SIZE: 4,
  __dummy__: 0
}



Module["Runtime"] = Runtime;



//========================================
// Runtime essentials
//========================================

var ABORT = 0; // whether we are quitting the application. no code should run after this. set in exit() and abort()
var EXITSTATUS = 0;

/** @type {function(*, string=)} */
function assert(condition, text) {
  if (!condition) {
    abort('Assertion failed: ' + text);
  }
}

var globalScope = this;

// Returns the C function with a specified identifier (for C++, you need to do manual name mangling)
function getCFunc(ident) {
  var func = Module['_' + ident]; // closure exported function
  if (!func) {
    try { func = eval('_' + ident); } catch(e) {}
  }
  assert(func, 'Cannot call unknown function ' + ident + ' (perhaps LLVM optimizations or closure removed it?)');
  return func;
}

var cwrap, ccall;
(function(){
  var JSfuncs = {
    // Helpers for cwrap -- it can't refer to Runtime directly because it might
    // be renamed by closure, instead it calls JSfuncs['stackSave'].body to find
    // out what the minified function name is.
    'stackSave': function() {
      Runtime.stackSave()
    },
    'stackRestore': function() {
      Runtime.stackRestore()
    },
    // type conversion from js to c
    'arrayToC' : function(arr) {
      var ret = Runtime.stackAlloc(arr.length);
      writeArrayToMemory(arr, ret);
      return ret;
    },
    'stringToC' : function(str) {
      var ret = 0;
      if (str !== null && str !== undefined && str !== 0) { // null string
        // at most 4 bytes per UTF-8 code point, +1 for the trailing '\0'
        var len = (str.length << 2) + 1;
        ret = Runtime.stackAlloc(len);
        stringToUTF8(str, ret, len);
      }
      return ret;
    }
  };
  // For fast lookup of conversion functions
  var toC = {'string' : JSfuncs['stringToC'], 'array' : JSfuncs['arrayToC']};

  // C calling interface.
  ccall = function ccallFunc(ident, returnType, argTypes, args, opts) {
    var func = getCFunc(ident);
    var cArgs = [];
    var stack = 0;
    assert(returnType !== 'array', 'Return type should not be "array".');
    if (args) {
      for (var i = 0; i < args.length; i++) {
        var converter = toC[argTypes[i]];
        if (converter) {
          if (stack === 0) stack = Runtime.stackSave();
          cArgs[i] = converter(args[i]);
        } else {
          cArgs[i] = args[i];
        }
      }
    }
    var ret = func.apply(null, cArgs);
    if ((!opts || !opts.async) && typeof EmterpreterAsync === 'object') {
      assert(!EmterpreterAsync.state, 'cannot start async op with normal JS calling ccall');
    }
    if (opts && opts.async) assert(!returnType, 'async ccalls cannot return values');
    if (returnType === 'string') ret = Pointer_stringify(ret);
    if (stack !== 0) {
      if (opts && opts.async) {
        EmterpreterAsync.asyncFinalizers.push(function() {
          Runtime.stackRestore(stack);
        });
        return;
      }
      Runtime.stackRestore(stack);
    }
    return ret;
  }

  var sourceRegex = /^function\s*[a-zA-Z$_0-9]*\s*\(([^)]*)\)\s*{\s*([^*]*?)[\s;]*(?:return\s*(.*?)[;\s]*)?}$/;
  function parseJSFunc(jsfunc) {
    // Match the body and the return value of a javascript function source
    var parsed = jsfunc.toString().match(sourceRegex).slice(1);
    return {arguments : parsed[0], body : parsed[1], returnValue: parsed[2]}
  }

  // sources of useful functions. we create this lazily as it can trigger a source decompression on this entire file
  var JSsource = null;
  function ensureJSsource() {
    if (!JSsource) {
      JSsource = {};
      for (var fun in JSfuncs) {
        if (JSfuncs.hasOwnProperty(fun)) {
          // Elements of toCsource are arrays of three items:
          // the code, and the return value
          JSsource[fun] = parseJSFunc(JSfuncs[fun]);
        }
      }
    }
  }

  cwrap = function cwrap(ident, returnType, argTypes) {
    argTypes = argTypes || [];
    var cfunc = getCFunc(ident);
    // When the function takes numbers and returns a number, we can just return
    // the original function
    var numericArgs = argTypes.every(function(type){ return type === 'number'});
    var numericRet = (returnType !== 'string');
    if ( numericRet && numericArgs) {
      return cfunc;
    }
    // Creation of the arguments list (["$1","$2",...,"$nargs"])
    var argNames = argTypes.map(function(x,i){return '$'+i});
    var funcstr = "(function(" + argNames.join(',') + ") {";
    var nargs = argTypes.length;
    if (!numericArgs) {
      // Generate the code needed to convert the arguments from javascript
      // values to pointers
      ensureJSsource();
      funcstr += 'var stack = ' + JSsource['stackSave'].body + ';';
      for (var i = 0; i < nargs; i++) {
        var arg = argNames[i], type = argTypes[i];
        if (type === 'number') continue;
        var convertCode = JSsource[type + 'ToC']; // [code, return]
        funcstr += 'var ' + convertCode.arguments + ' = ' + arg + ';';
        funcstr += convertCode.body + ';';
        funcstr += arg + '=(' + convertCode.returnValue + ');';
      }
    }

    // When the code is compressed, the name of cfunc is not literally 'cfunc' anymore
    var cfuncname = parseJSFunc(function(){return cfunc}).returnValue;
    // Call the function
    funcstr += 'var ret = ' + cfuncname + '(' + argNames.join(',') + ');';
    if (!numericRet) { // Return type can only by 'string' or 'number'
      // Convert the result to a string
      var strgfy = parseJSFunc(function(){return Pointer_stringify}).returnValue;
      funcstr += 'ret = ' + strgfy + '(ret);';
    }
    funcstr += "if (typeof EmterpreterAsync === 'object') { assert(!EmterpreterAsync.state, 'cannot start async op with normal JS calling cwrap') }";
    if (!numericArgs) {
      // If we had a stack, restore it
      ensureJSsource();
      funcstr += JSsource['stackRestore'].body.replace('()', '(stack)') + ';';
    }
    funcstr += 'return ret})';
    return eval(funcstr);
  };
})();
Module["ccall"] = ccall;
Module["cwrap"] = cwrap;

/** @type {function(number, number, string, boolean=)} */
function setValue(ptr, value, type, noSafe) {
  type = type || 'i8';
  if (type.charAt(type.length-1) === '*') type = 'i32'; // pointers are 32-bit
    switch(type) {
      case 'i1': HEAP8[((ptr)>>0)]=value; break;
      case 'i8': HEAP8[((ptr)>>0)]=value; break;
      case 'i16': HEAP16[((ptr)>>1)]=value; break;
      case 'i32': HEAP32[((ptr)>>2)]=value; break;
      case 'i64': (tempI64 = [value>>>0,(tempDouble=value,(+(Math_abs(tempDouble))) >= 1.0 ? (tempDouble > 0.0 ? ((Math_min((+(Math_floor((tempDouble)/4294967296.0))), 4294967295.0))|0)>>>0 : (~~((+(Math_ceil((tempDouble - +(((~~(tempDouble)))>>>0))/4294967296.0)))))>>>0) : 0)],HEAP32[((ptr)>>2)]=tempI64[0],HEAP32[(((ptr)+(4))>>2)]=tempI64[1]); break;
      case 'float': HEAPF32[((ptr)>>2)]=value; break;
      case 'double': HEAPF64[((ptr)>>3)]=value; break;
      default: abort('invalid type for setValue: ' + type);
    }
}
Module["setValue"] = setValue;

/** @type {function(number, string, boolean=)} */
function getValue(ptr, type, noSafe) {
  type = type || 'i8';
  if (type.charAt(type.length-1) === '*') type = 'i32'; // pointers are 32-bit
    switch(type) {
      case 'i1': return HEAP8[((ptr)>>0)];
      case 'i8': return HEAP8[((ptr)>>0)];
      case 'i16': return HEAP16[((ptr)>>1)];
      case 'i32': return HEAP32[((ptr)>>2)];
      case 'i64': return HEAP32[((ptr)>>2)];
      case 'float': return HEAPF32[((ptr)>>2)];
      case 'double': return HEAPF64[((ptr)>>3)];
      default: abort('invalid type for setValue: ' + type);
    }
  return null;
}
Module["getValue"] = getValue;

var ALLOC_NORMAL = 0; // Tries to use _malloc()
var ALLOC_STACK = 1; // Lives for the duration of the current function call
var ALLOC_STATIC = 2; // Cannot be freed
var ALLOC_DYNAMIC = 3; // Cannot be freed except through sbrk
var ALLOC_NONE = 4; // Do not allocate
Module["ALLOC_NORMAL"] = ALLOC_NORMAL;
Module["ALLOC_STACK"] = ALLOC_STACK;
Module["ALLOC_STATIC"] = ALLOC_STATIC;
Module["ALLOC_DYNAMIC"] = ALLOC_DYNAMIC;
Module["ALLOC_NONE"] = ALLOC_NONE;

// allocate(): This is for internal use. You can use it yourself as well, but the interface
//             is a little tricky (see docs right below). The reason is that it is optimized
//             for multiple syntaxes to save space in generated code. So you should
//             normally not use allocate(), and instead allocate memory using _malloc(),
//             initialize it with setValue(), and so forth.
// @slab: An array of data, or a number. If a number, then the size of the block to allocate,
//        in *bytes* (note that this is sometimes confusing: the next parameter does not
//        affect this!)
// @types: Either an array of types, one for each byte (or 0 if no type at that position),
//         or a single type which is used for the entire block. This only matters if there
//         is initial data - if @slab is a number, then this does not matter at all and is
//         ignored.
// @allocator: How to allocate memory, see ALLOC_*
/** @type {function((TypedArray|Array<number>|number), string, number, number=)} */
function allocate(slab, types, allocator, ptr) {
  var zeroinit, size;
  if (typeof slab === 'number') {
    zeroinit = true;
    size = slab;
  } else {
    zeroinit = false;
    size = slab.length;
  }

  var singleType = typeof types === 'string' ? types : null;

  var ret;
  if (allocator == ALLOC_NONE) {
    ret = ptr;
  } else {
    ret = [typeof _malloc === 'function' ? _malloc : Runtime.staticAlloc, Runtime.stackAlloc, Runtime.staticAlloc, Runtime.dynamicAlloc][allocator === undefined ? ALLOC_STATIC : allocator](Math.max(size, singleType ? 1 : types.length));
  }

  if (zeroinit) {
    var ptr = ret, stop;
    assert((ret & 3) == 0);
    stop = ret + (size & ~3);
    for (; ptr < stop; ptr += 4) {
      HEAP32[((ptr)>>2)]=0;
    }
    stop = ret + size;
    while (ptr < stop) {
      HEAP8[((ptr++)>>0)]=0;
    }
    return ret;
  }

  if (singleType === 'i8') {
    if (slab.subarray || slab.slice) {
      HEAPU8.set(/** @type {!Uint8Array} */ (slab), ret);
    } else {
      HEAPU8.set(new Uint8Array(slab), ret);
    }
    return ret;
  }

  var i = 0, type, typeSize, previousType;
  while (i < size) {
    var curr = slab[i];

    if (typeof curr === 'function') {
      curr = Runtime.getFunctionIndex(curr);
    }

    type = singleType || types[i];
    if (type === 0) {
      i++;
      continue;
    }
    assert(type, 'Must know what type to store in allocate!');

    if (type == 'i64') type = 'i32'; // special case: we have one i32 here, and one i32 later

    setValue(ret+i, curr, type);

    // no need to look up size unless type changes, so cache it
    if (previousType !== type) {
      typeSize = Runtime.getNativeTypeSize(type);
      previousType = type;
    }
    i += typeSize;
  }

  return ret;
}
Module["allocate"] = allocate;

// Allocate memory during any stage of startup - static memory early on, dynamic memory later, malloc when ready
function getMemory(size) {
  if (!staticSealed) return Runtime.staticAlloc(size);
  if (!runtimeInitialized) return Runtime.dynamicAlloc(size);
  return _malloc(size);
}
Module["getMemory"] = getMemory;

/** @type {function(number, number=)} */
function Pointer_stringify(ptr, length) {
  if (length === 0 || !ptr) return '';
  // TODO: use TextDecoder
  // Find the length, and check for UTF while doing so
  var hasUtf = 0;
  var t;
  var i = 0;
  while (1) {
    assert(ptr + i < TOTAL_MEMORY);
    t = HEAPU8[(((ptr)+(i))>>0)];
    hasUtf |= t;
    if (t == 0 && !length) break;
    i++;
    if (length && i == length) break;
  }
  if (!length) length = i;

  var ret = '';

  if (hasUtf < 128) {
    var MAX_CHUNK = 1024; // split up into chunks, because .apply on a huge string can overflow the stack
    var curr;
    while (length > 0) {
      curr = String.fromCharCode.apply(String, HEAPU8.subarray(ptr, ptr + Math.min(length, MAX_CHUNK)));
      ret = ret ? ret + curr : curr;
      ptr += MAX_CHUNK;
      length -= MAX_CHUNK;
    }
    return ret;
  }
  return Module['UTF8ToString'](ptr);
}
Module["Pointer_stringify"] = Pointer_stringify;

// Given a pointer 'ptr' to a null-terminated ASCII-encoded string in the emscripten HEAP, returns
// a copy of that string as a Javascript String object.

function AsciiToString(ptr) {
  var str = '';
  while (1) {
    var ch = HEAP8[((ptr++)>>0)];
    if (!ch) return str;
    str += String.fromCharCode(ch);
  }
}
Module["AsciiToString"] = AsciiToString;

// Copies the given Javascript String object 'str' to the emscripten HEAP at address 'outPtr',
// null-terminated and encoded in ASCII form. The copy will require at most str.length+1 bytes of space in the HEAP.

function stringToAscii(str, outPtr) {
  return writeAsciiToMemory(str, outPtr, false);
}
Module["stringToAscii"] = stringToAscii;

// Given a pointer 'ptr' to a null-terminated UTF8-encoded string in the given array that contains uint8 values, returns
// a copy of that string as a Javascript String object.

var UTF8Decoder = typeof TextDecoder !== 'undefined' ? new TextDecoder('utf8') : undefined;
function UTF8ArrayToString(u8Array, idx) {
  var endPtr = idx;
  // TextDecoder needs to know the byte length in advance, it doesn't stop on null terminator by itself.
  // Also, use the length info to avoid running tiny strings through TextDecoder, since .subarray() allocates garbage.
  while (u8Array[endPtr]) ++endPtr;

  if (endPtr - idx > 16 && u8Array.subarray && UTF8Decoder) {
    return UTF8Decoder.decode(u8Array.subarray(idx, endPtr));
  } else {
    var u0, u1, u2, u3, u4, u5;

    var str = '';
    while (1) {
      // For UTF8 byte structure, see http://en.wikipedia.org/wiki/UTF-8#Description and https://www.ietf.org/rfc/rfc2279.txt and https://tools.ietf.org/html/rfc3629
      u0 = u8Array[idx++];
      if (!u0) return str;
      if (!(u0 & 0x80)) { str += String.fromCharCode(u0); continue; }
      u1 = u8Array[idx++] & 63;
      if ((u0 & 0xE0) == 0xC0) { str += String.fromCharCode(((u0 & 31) << 6) | u1); continue; }
      u2 = u8Array[idx++] & 63;
      if ((u0 & 0xF0) == 0xE0) {
        u0 = ((u0 & 15) << 12) | (u1 << 6) | u2;
      } else {
        u3 = u8Array[idx++] & 63;
        if ((u0 & 0xF8) == 0xF0) {
          u0 = ((u0 & 7) << 18) | (u1 << 12) | (u2 << 6) | u3;
        } else {
          u4 = u8Array[idx++] & 63;
          if ((u0 & 0xFC) == 0xF8) {
            u0 = ((u0 & 3) << 24) | (u1 << 18) | (u2 << 12) | (u3 << 6) | u4;
          } else {
            u5 = u8Array[idx++] & 63;
            u0 = ((u0 & 1) << 30) | (u1 << 24) | (u2 << 18) | (u3 << 12) | (u4 << 6) | u5;
          }
        }
      }
      if (u0 < 0x10000) {
        str += String.fromCharCode(u0);
      } else {
        var ch = u0 - 0x10000;
        str += String.fromCharCode(0xD800 | (ch >> 10), 0xDC00 | (ch & 0x3FF));
      }
    }
  }
}
Module["UTF8ArrayToString"] = UTF8ArrayToString;

// Given a pointer 'ptr' to a null-terminated UTF8-encoded string in the emscripten HEAP, returns
// a copy of that string as a Javascript String object.

function UTF8ToString(ptr) {
  return UTF8ArrayToString(HEAPU8,ptr);
}
Module["UTF8ToString"] = UTF8ToString;

// Copies the given Javascript String object 'str' to the given byte array at address 'outIdx',
// encoded in UTF8 form and null-terminated. The copy will require at most str.length*4+1 bytes of space in the HEAP.
// Use the function lengthBytesUTF8 to compute the exact number of bytes (excluding null terminator) that this function will write.
// Parameters:
//   str: the Javascript string to copy.
//   outU8Array: the array to copy to. Each index in this array is assumed to be one 8-byte element.
//   outIdx: The starting offset in the array to begin the copying.
//   maxBytesToWrite: The maximum number of bytes this function can write to the array. This count should include the null
//                    terminator, i.e. if maxBytesToWrite=1, only the null terminator will be written and nothing else.
//                    maxBytesToWrite=0 does not write any bytes to the output, not even the null terminator.
// Returns the number of bytes written, EXCLUDING the null terminator.

function stringToUTF8Array(str, outU8Array, outIdx, maxBytesToWrite) {
  if (!(maxBytesToWrite > 0)) // Parameter maxBytesToWrite is not optional. Negative values, 0, null, undefined and false each don't write out any bytes.
    return 0;

  var startIdx = outIdx;
  var endIdx = outIdx + maxBytesToWrite - 1; // -1 for string null terminator.
  for (var i = 0; i < str.length; ++i) {
    // Gotcha: charCodeAt returns a 16-bit word that is a UTF-16 encoded code unit, not a Unicode code point of the character! So decode UTF16->UTF32->UTF8.
    // See http://unicode.org/faq/utf_bom.html#utf16-3
    // For UTF8 byte structure, see http://en.wikipedia.org/wiki/UTF-8#Description and https://www.ietf.org/rfc/rfc2279.txt and https://tools.ietf.org/html/rfc3629
    var u = str.charCodeAt(i); // possibly a lead surrogate
    if (u >= 0xD800 && u <= 0xDFFF) u = 0x10000 + ((u & 0x3FF) << 10) | (str.charCodeAt(++i) & 0x3FF);
    if (u <= 0x7F) {
      if (outIdx >= endIdx) break;
      outU8Array[outIdx++] = u;
    } else if (u <= 0x7FF) {
      if (outIdx + 1 >= endIdx) break;
      outU8Array[outIdx++] = 0xC0 | (u >> 6);
      outU8Array[outIdx++] = 0x80 | (u & 63);
    } else if (u <= 0xFFFF) {
      if (outIdx + 2 >= endIdx) break;
      outU8Array[outIdx++] = 0xE0 | (u >> 12);
      outU8Array[outIdx++] = 0x80 | ((u >> 6) & 63);
      outU8Array[outIdx++] = 0x80 | (u & 63);
    } else if (u <= 0x1FFFFF) {
      if (outIdx + 3 >= endIdx) break;
      outU8Array[outIdx++] = 0xF0 | (u >> 18);
      outU8Array[outIdx++] = 0x80 | ((u >> 12) & 63);
      outU8Array[outIdx++] = 0x80 | ((u >> 6) & 63);
      outU8Array[outIdx++] = 0x80 | (u & 63);
    } else if (u <= 0x3FFFFFF) {
      if (outIdx + 4 >= endIdx) break;
      outU8Array[outIdx++] = 0xF8 | (u >> 24);
      outU8Array[outIdx++] = 0x80 | ((u >> 18) & 63);
      outU8Array[outIdx++] = 0x80 | ((u >> 12) & 63);
      outU8Array[outIdx++] = 0x80 | ((u >> 6) & 63);
      outU8Array[outIdx++] = 0x80 | (u & 63);
    } else {
      if (outIdx + 5 >= endIdx) break;
      outU8Array[outIdx++] = 0xFC | (u >> 30);
      outU8Array[outIdx++] = 0x80 | ((u >> 24) & 63);
      outU8Array[outIdx++] = 0x80 | ((u >> 18) & 63);
      outU8Array[outIdx++] = 0x80 | ((u >> 12) & 63);
      outU8Array[outIdx++] = 0x80 | ((u >> 6) & 63);
      outU8Array[outIdx++] = 0x80 | (u & 63);
    }
  }
  // Null-terminate the pointer to the buffer.
  outU8Array[outIdx] = 0;
  return outIdx - startIdx;
}
Module["stringToUTF8Array"] = stringToUTF8Array;

// Copies the given Javascript String object 'str' to the emscripten HEAP at address 'outPtr',
// null-terminated and encoded in UTF8 form. The copy will require at most str.length*4+1 bytes of space in the HEAP.
// Use the function lengthBytesUTF8 to compute the exact number of bytes (excluding null terminator) that this function will write.
// Returns the number of bytes written, EXCLUDING the null terminator.

function stringToUTF8(str, outPtr, maxBytesToWrite) {
  assert(typeof maxBytesToWrite == 'number', 'stringToUTF8(str, outPtr, maxBytesToWrite) is missing the third parameter that specifies the length of the output buffer!');
  return stringToUTF8Array(str, HEAPU8,outPtr, maxBytesToWrite);
}
Module["stringToUTF8"] = stringToUTF8;

// Returns the number of bytes the given Javascript string takes if encoded as a UTF8 byte array, EXCLUDING the null terminator byte.

function lengthBytesUTF8(str) {
  var len = 0;
  for (var i = 0; i < str.length; ++i) {
    // Gotcha: charCodeAt returns a 16-bit word that is a UTF-16 encoded code unit, not a Unicode code point of the character! So decode UTF16->UTF32->UTF8.
    // See http://unicode.org/faq/utf_bom.html#utf16-3
    var u = str.charCodeAt(i); // possibly a lead surrogate
    if (u >= 0xD800 && u <= 0xDFFF) u = 0x10000 + ((u & 0x3FF) << 10) | (str.charCodeAt(++i) & 0x3FF);
    if (u <= 0x7F) {
      ++len;
    } else if (u <= 0x7FF) {
      len += 2;
    } else if (u <= 0xFFFF) {
      len += 3;
    } else if (u <= 0x1FFFFF) {
      len += 4;
    } else if (u <= 0x3FFFFFF) {
      len += 5;
    } else {
      len += 6;
    }
  }
  return len;
}
Module["lengthBytesUTF8"] = lengthBytesUTF8;

// Given a pointer 'ptr' to a null-terminated UTF16LE-encoded string in the emscripten HEAP, returns
// a copy of that string as a Javascript String object.

var UTF16Decoder = typeof TextDecoder !== 'undefined' ? new TextDecoder('utf-16le') : undefined;
function UTF16ToString(ptr) {
  assert(ptr % 2 == 0, 'Pointer passed to UTF16ToString must be aligned to two bytes!');
  var endPtr = ptr;
  // TextDecoder needs to know the byte length in advance, it doesn't stop on null terminator by itself.
  // Also, use the length info to avoid running tiny strings through TextDecoder, since .subarray() allocates garbage.
  var idx = endPtr >> 1;
  while (HEAP16[idx]) ++idx;
  endPtr = idx << 1;

  if (endPtr - ptr > 32 && UTF16Decoder) {
    return UTF16Decoder.decode(HEAPU8.subarray(ptr, endPtr));
  } else {
    var i = 0;

    var str = '';
    while (1) {
      var codeUnit = HEAP16[(((ptr)+(i*2))>>1)];
      if (codeUnit == 0) return str;
      ++i;
      // fromCharCode constructs a character from a UTF-16 code unit, so we can pass the UTF16 string right through.
      str += String.fromCharCode(codeUnit);
    }
  }
}


// Copies the given Javascript String object 'str' to the emscripten HEAP at address 'outPtr',
// null-terminated and encoded in UTF16 form. The copy will require at most str.length*4+2 bytes of space in the HEAP.
// Use the function lengthBytesUTF16() to compute the exact number of bytes (excluding null terminator) that this function will write.
// Parameters:
//   str: the Javascript string to copy.
//   outPtr: Byte address in Emscripten HEAP where to write the string to.
//   maxBytesToWrite: The maximum number of bytes this function can write to the array. This count should include the null
//                    terminator, i.e. if maxBytesToWrite=2, only the null terminator will be written and nothing else.
//                    maxBytesToWrite<2 does not write any bytes to the output, not even the null terminator.
// Returns the number of bytes written, EXCLUDING the null terminator.

function stringToUTF16(str, outPtr, maxBytesToWrite) {
  assert(outPtr % 2 == 0, 'Pointer passed to stringToUTF16 must be aligned to two bytes!');
  assert(typeof maxBytesToWrite == 'number', 'stringToUTF16(str, outPtr, maxBytesToWrite) is missing the third parameter that specifies the length of the output buffer!');
  // Backwards compatibility: if max bytes is not specified, assume unsafe unbounded write is allowed.
  if (maxBytesToWrite === undefined) {
    maxBytesToWrite = 0x7FFFFFFF;
  }
  if (maxBytesToWrite < 2) return 0;
  maxBytesToWrite -= 2; // Null terminator.
  var startPtr = outPtr;
  var numCharsToWrite = (maxBytesToWrite < str.length*2) ? (maxBytesToWrite / 2) : str.length;
  for (var i = 0; i < numCharsToWrite; ++i) {
    // charCodeAt returns a UTF-16 encoded code unit, so it can be directly written to the HEAP.
    var codeUnit = str.charCodeAt(i); // possibly a lead surrogate
    HEAP16[((outPtr)>>1)]=codeUnit;
    outPtr += 2;
  }
  // Null-terminate the pointer to the HEAP.
  HEAP16[((outPtr)>>1)]=0;
  return outPtr - startPtr;
}


// Returns the number of bytes the given Javascript string takes if encoded as a UTF16 byte array, EXCLUDING the null terminator byte.

function lengthBytesUTF16(str) {
  return str.length*2;
}


function UTF32ToString(ptr) {
  assert(ptr % 4 == 0, 'Pointer passed to UTF32ToString must be aligned to four bytes!');
  var i = 0;

  var str = '';
  while (1) {
    var utf32 = HEAP32[(((ptr)+(i*4))>>2)];
    if (utf32 == 0)
      return str;
    ++i;
    // Gotcha: fromCharCode constructs a character from a UTF-16 encoded code (pair), not from a Unicode code point! So encode the code point to UTF-16 for constructing.
    // See http://unicode.org/faq/utf_bom.html#utf16-3
    if (utf32 >= 0x10000) {
      var ch = utf32 - 0x10000;
      str += String.fromCharCode(0xD800 | (ch >> 10), 0xDC00 | (ch & 0x3FF));
    } else {
      str += String.fromCharCode(utf32);
    }
  }
}


// Copies the given Javascript String object 'str' to the emscripten HEAP at address 'outPtr',
// null-terminated and encoded in UTF32 form. The copy will require at most str.length*4+4 bytes of space in the HEAP.
// Use the function lengthBytesUTF32() to compute the exact number of bytes (excluding null terminator) that this function will write.
// Parameters:
//   str: the Javascript string to copy.
//   outPtr: Byte address in Emscripten HEAP where to write the string to.
//   maxBytesToWrite: The maximum number of bytes this function can write to the array. This count should include the null
//                    terminator, i.e. if maxBytesToWrite=4, only the null terminator will be written and nothing else.
//                    maxBytesToWrite<4 does not write any bytes to the output, not even the null terminator.
// Returns the number of bytes written, EXCLUDING the null terminator.

function stringToUTF32(str, outPtr, maxBytesToWrite) {
  assert(outPtr % 4 == 0, 'Pointer passed to stringToUTF32 must be aligned to four bytes!');
  assert(typeof maxBytesToWrite == 'number', 'stringToUTF32(str, outPtr, maxBytesToWrite) is missing the third parameter that specifies the length of the output buffer!');
  // Backwards compatibility: if max bytes is not specified, assume unsafe unbounded write is allowed.
  if (maxBytesToWrite === undefined) {
    maxBytesToWrite = 0x7FFFFFFF;
  }
  if (maxBytesToWrite < 4) return 0;
  var startPtr = outPtr;
  var endPtr = startPtr + maxBytesToWrite - 4;
  for (var i = 0; i < str.length; ++i) {
    // Gotcha: charCodeAt returns a 16-bit word that is a UTF-16 encoded code unit, not a Unicode code point of the character! We must decode the string to UTF-32 to the heap.
    // See http://unicode.org/faq/utf_bom.html#utf16-3
    var codeUnit = str.charCodeAt(i); // possibly a lead surrogate
    if (codeUnit >= 0xD800 && codeUnit <= 0xDFFF) {
      var trailSurrogate = str.charCodeAt(++i);
      codeUnit = 0x10000 + ((codeUnit & 0x3FF) << 10) | (trailSurrogate & 0x3FF);
    }
    HEAP32[((outPtr)>>2)]=codeUnit;
    outPtr += 4;
    if (outPtr + 4 > endPtr) break;
  }
  // Null-terminate the pointer to the HEAP.
  HEAP32[((outPtr)>>2)]=0;
  return outPtr - startPtr;
}


// Returns the number of bytes the given Javascript string takes if encoded as a UTF16 byte array, EXCLUDING the null terminator byte.

function lengthBytesUTF32(str) {
  var len = 0;
  for (var i = 0; i < str.length; ++i) {
    // Gotcha: charCodeAt returns a 16-bit word that is a UTF-16 encoded code unit, not a Unicode code point of the character! We must decode the string to UTF-32 to the heap.
    // See http://unicode.org/faq/utf_bom.html#utf16-3
    var codeUnit = str.charCodeAt(i);
    if (codeUnit >= 0xD800 && codeUnit <= 0xDFFF) ++i; // possibly a lead surrogate, so skip over the tail surrogate.
    len += 4;
  }

  return len;
}


function demangle(func) {
  var __cxa_demangle_func = Module['___cxa_demangle'] || Module['__cxa_demangle'];
  if (__cxa_demangle_func) {
    try {
      var s =
        func.substr(1);
      var len = lengthBytesUTF8(s)+1;
      var buf = _malloc(len);
      stringToUTF8(s, buf, len);
      var status = _malloc(4);
      var ret = __cxa_demangle_func(buf, 0, 0, status);
      if (getValue(status, 'i32') === 0 && ret) {
        return Pointer_stringify(ret);
      }
      // otherwise, libcxxabi failed
    } catch(e) {
      // ignore problems here
    } finally {
      if (buf) _free(buf);
      if (status) _free(status);
      if (ret) _free(ret);
    }
    // failure when using libcxxabi, don't demangle
    return func;
  }
  Runtime.warnOnce('warning: build with  -s DEMANGLE_SUPPORT=1  to link in libcxxabi demangling');
  return func;
}

function demangleAll(text) {
  var regex =
    /__Z[\w\d_]+/g;
  return text.replace(regex,
    function(x) {
      var y = demangle(x);
      return x === y ? x : (x + ' [' + y + ']');
    });
}

function jsStackTrace() {
  var err = new Error();
  if (!err.stack) {
    // IE10+ special cases: It does have callstack info, but it is only populated if an Error object is thrown,
    // so try that as a special-case.
    try {
      throw new Error(0);
    } catch(e) {
      err = e;
    }
    if (!err.stack) {
      return '(no stack trace available)';
    }
  }
  return err.stack.toString();
}

function stackTrace() {
  var js = jsStackTrace();
  if (Module['extraStackTrace']) js += '\n' + Module['extraStackTrace']();
  return demangleAll(js);
}
Module["stackTrace"] = stackTrace;

// Memory management

var PAGE_SIZE = 16384;
var WASM_PAGE_SIZE = 65536;
var ASMJS_PAGE_SIZE = 16777216;
var MIN_TOTAL_MEMORY = 16777216;

function alignUp(x, multiple) {
  if (x % multiple > 0) {
    x += multiple - (x % multiple);
  }
  return x;
}

var HEAP,
/** @type {ArrayBuffer} */
  buffer,
/** @type {Int8Array} */
  HEAP8,
/** @type {Uint8Array} */
  HEAPU8,
/** @type {Int16Array} */
  HEAP16,
/** @type {Uint16Array} */
  HEAPU16,
/** @type {Int32Array} */
  HEAP32,
/** @type {Uint32Array} */
  HEAPU32,
/** @type {Float32Array} */
  HEAPF32,
/** @type {Float64Array} */
  HEAPF64;

function updateGlobalBuffer(buf) {
  Module['buffer'] = buffer = buf;
}

function updateGlobalBufferViews() {
  Module['HEAP8'] = HEAP8 = new Int8Array(buffer);
  Module['HEAP16'] = HEAP16 = new Int16Array(buffer);
  Module['HEAP32'] = HEAP32 = new Int32Array(buffer);
  Module['HEAPU8'] = HEAPU8 = new Uint8Array(buffer);
  Module['HEAPU16'] = HEAPU16 = new Uint16Array(buffer);
  Module['HEAPU32'] = HEAPU32 = new Uint32Array(buffer);
  Module['HEAPF32'] = HEAPF32 = new Float32Array(buffer);
  Module['HEAPF64'] = HEAPF64 = new Float64Array(buffer);
}

var STATIC_BASE, STATICTOP, staticSealed; // static area
var STACK_BASE, STACKTOP, STACK_MAX; // stack area
var DYNAMIC_BASE, DYNAMICTOP_PTR; // dynamic area handled by sbrk

  STATIC_BASE = STATICTOP = STACK_BASE = STACKTOP = STACK_MAX = DYNAMIC_BASE = DYNAMICTOP_PTR = 0;
  staticSealed = false;


// Initializes the stack cookie. Called at the startup of main and at the startup of each thread in pthreads mode.
function writeStackCookie() {
  assert((STACK_MAX & 3) == 0);
  HEAPU32[(STACK_MAX >> 2)-1] = 0x02135467;
  HEAPU32[(STACK_MAX >> 2)-2] = 0x89BACDFE;
}

function checkStackCookie() {
  if (HEAPU32[(STACK_MAX >> 2)-1] != 0x02135467 || HEAPU32[(STACK_MAX >> 2)-2] != 0x89BACDFE) {
    abort('Stack overflow! Stack cookie has been overwritten, expected hex dwords 0x89BACDFE and 0x02135467, but received 0x' + HEAPU32[(STACK_MAX >> 2)-2].toString(16) + ' ' + HEAPU32[(STACK_MAX >> 2)-1].toString(16));
  }
  // Also test the global address 0 for integrity. This check is not compatible with SAFE_SPLIT_MEMORY though, since that mode already tests all address 0 accesses on its own.
  if (HEAP32[0] !== 0x63736d65 /* 'emsc' */) throw 'Runtime error: The application has corrupted its heap memory area (address zero)!';
}

function abortStackOverflow(allocSize) {
  abort('Stack overflow! Attempted to allocate ' + allocSize + ' bytes on the stack, but stack has only ' + (STACK_MAX - Module['asm'].stackSave() + allocSize) + ' bytes available!');
}

function abortOnCannotGrowMemory() {
  abort('Cannot enlarge memory arrays. Either (1) compile with  -s TOTAL_MEMORY=X  with X higher than the current value ' + TOTAL_MEMORY + ', (2) compile with  -s ALLOW_MEMORY_GROWTH=1  which allows increasing the size at runtime but prevents some optimizations, (3) set Module.TOTAL_MEMORY to a higher value before the program runs, or (4) if you want malloc to return NULL (0) instead of this abort, compile with  -s ABORTING_MALLOC=0 ');
}


function enlargeMemory() {
  abortOnCannotGrowMemory();
}


var TOTAL_STACK = Module['TOTAL_STACK'] || 5242880;
var TOTAL_MEMORY = Module['TOTAL_MEMORY'] || 16777216;
if (TOTAL_MEMORY < TOTAL_STACK) Module.printErr('TOTAL_MEMORY should be larger than TOTAL_STACK, was ' + TOTAL_MEMORY + '! (TOTAL_STACK=' + TOTAL_STACK + ')');

// Initialize the runtime's memory
// check for full engine support (use string 'subarray' to avoid closure compiler confusion)
assert(typeof Int32Array !== 'undefined' && typeof Float64Array !== 'undefined' && Int32Array.prototype.subarray !== undefined && Int32Array.prototype.set !== undefined,
       'JS engine does not provide full typed array support');



// Use a provided buffer, if there is one, or else allocate a new one
if (Module['buffer']) {
  buffer = Module['buffer'];
  assert(buffer.byteLength === TOTAL_MEMORY, 'provided buffer should be ' + TOTAL_MEMORY + ' bytes, but it is ' + buffer.byteLength);
} else {
  // Use a WebAssembly memory where available
  {
    buffer = new ArrayBuffer(TOTAL_MEMORY);
  }
  assert(buffer.byteLength === TOTAL_MEMORY);
}
updateGlobalBufferViews();


function getTotalMemory() {
  return TOTAL_MEMORY;
}

// Endianness check (note: assumes compiler arch was little-endian)
  HEAP32[0] = 0x63736d65; /* 'emsc' */
HEAP16[1] = 0x6373;
if (HEAPU8[2] !== 0x73 || HEAPU8[3] !== 0x63) throw 'Runtime error: expected the system to be little-endian!';

Module['HEAP'] = HEAP;
Module['buffer'] = buffer;
Module['HEAP8'] = HEAP8;
Module['HEAP16'] = HEAP16;
Module['HEAP32'] = HEAP32;
Module['HEAPU8'] = HEAPU8;
Module['HEAPU16'] = HEAPU16;
Module['HEAPU32'] = HEAPU32;
Module['HEAPF32'] = HEAPF32;
Module['HEAPF64'] = HEAPF64;

function callRuntimeCallbacks(callbacks) {
  while(callbacks.length > 0) {
    var callback = callbacks.shift();
    if (typeof callback == 'function') {
      callback();
      continue;
    }
    var func = callback.func;
    if (typeof func === 'number') {
      if (callback.arg === undefined) {
        Module['dynCall_v'](func);
      } else {
        Module['dynCall_vi'](func, callback.arg);
      }
    } else {
      func(callback.arg === undefined ? null : callback.arg);
    }
  }
}

var __ATPRERUN__  = []; // functions called before the runtime is initialized
var __ATINIT__    = []; // functions called during startup
var __ATMAIN__    = []; // functions called when main() is to be run
var __ATEXIT__    = []; // functions called during shutdown
var __ATPOSTRUN__ = []; // functions called after the runtime has exited

var runtimeInitialized = false;
var runtimeExited = false;


function preRun() {
  // compatibility - merge in anything from Module['preRun'] at this time
  if (Module['preRun']) {
    if (typeof Module['preRun'] == 'function') Module['preRun'] = [Module['preRun']];
    while (Module['preRun'].length) {
      addOnPreRun(Module['preRun'].shift());
    }
  }
  callRuntimeCallbacks(__ATPRERUN__);
}

function ensureInitRuntime() {
  checkStackCookie();
  if (runtimeInitialized) return;
  runtimeInitialized = true;
  callRuntimeCallbacks(__ATINIT__);
}

function preMain() {
  checkStackCookie();
  callRuntimeCallbacks(__ATMAIN__);
}

function exitRuntime() {
  checkStackCookie();
  callRuntimeCallbacks(__ATEXIT__);
  runtimeExited = true;
}

function postRun() {
  checkStackCookie();
  // compatibility - merge in anything from Module['postRun'] at this time
  if (Module['postRun']) {
    if (typeof Module['postRun'] == 'function') Module['postRun'] = [Module['postRun']];
    while (Module['postRun'].length) {
      addOnPostRun(Module['postRun'].shift());
    }
  }
  callRuntimeCallbacks(__ATPOSTRUN__);
}

function addOnPreRun(cb) {
  __ATPRERUN__.unshift(cb);
}
Module["addOnPreRun"] = addOnPreRun;

function addOnInit(cb) {
  __ATINIT__.unshift(cb);
}
Module["addOnInit"] = addOnInit;

function addOnPreMain(cb) {
  __ATMAIN__.unshift(cb);
}
Module["addOnPreMain"] = addOnPreMain;

function addOnExit(cb) {
  __ATEXIT__.unshift(cb);
}
Module["addOnExit"] = addOnExit;

function addOnPostRun(cb) {
  __ATPOSTRUN__.unshift(cb);
}
Module["addOnPostRun"] = addOnPostRun;

// Tools

/** @type {function(string, boolean=, number=)} */
function intArrayFromString(stringy, dontAddNull, length) {
  var len = length > 0 ? length : lengthBytesUTF8(stringy)+1;
  var u8array = new Array(len);
  var numBytesWritten = stringToUTF8Array(stringy, u8array, 0, u8array.length);
  if (dontAddNull) u8array.length = numBytesWritten;
  return u8array;
}
Module["intArrayFromString"] = intArrayFromString;

function intArrayToString(array) {
  var ret = [];
  for (var i = 0; i < array.length; i++) {
    var chr = array[i];
    if (chr > 0xFF) {
      assert(false, 'Character code ' + chr + ' (' + String.fromCharCode(chr) + ')  at offset ' + i + ' not in 0x00-0xFF.');
      chr &= 0xFF;
    }
    ret.push(String.fromCharCode(chr));
  }
  return ret.join('');
}
Module["intArrayToString"] = intArrayToString;

// Deprecated: This function should not be called because it is unsafe and does not provide
// a maximum length limit of how many bytes it is allowed to write. Prefer calling the
// function stringToUTF8Array() instead, which takes in a maximum length that can be used
// to be secure from out of bounds writes.
/** @deprecated */
function writeStringToMemory(string, buffer, dontAddNull) {
  Runtime.warnOnce('writeStringToMemory is deprecated and should not be called! Use stringToUTF8() instead!');

  var /** @type {number} */ lastChar, /** @type {number} */ end;
  if (dontAddNull) {
    // stringToUTF8Array always appends null. If we don't want to do that, remember the
    // character that existed at the location where the null will be placed, and restore
    // that after the write (below).
    end = buffer + lengthBytesUTF8(string);
    lastChar = HEAP8[end];
  }
  stringToUTF8(string, buffer, Infinity);
  if (dontAddNull) HEAP8[end] = lastChar; // Restore the value under the null character.
}
Module["writeStringToMemory"] = writeStringToMemory;

function writeArrayToMemory(array, buffer) {
  assert(array.length >= 0, 'writeArrayToMemory array must have a length (should be an array or typed array)')
  HEAP8.set(array, buffer);
}
Module["writeArrayToMemory"] = writeArrayToMemory;

function writeAsciiToMemory(str, buffer, dontAddNull) {
  for (var i = 0; i < str.length; ++i) {
    assert(str.charCodeAt(i) === str.charCodeAt(i)&0xff);
    HEAP8[((buffer++)>>0)]=str.charCodeAt(i);
  }
  // Null-terminate the pointer to the HEAP.
  if (!dontAddNull) HEAP8[((buffer)>>0)]=0;
}
Module["writeAsciiToMemory"] = writeAsciiToMemory;

function unSign(value, bits, ignore) {
  if (value >= 0) {
    return value;
  }
  return bits <= 32 ? 2*Math.abs(1 << (bits-1)) + value // Need some trickery, since if bits == 32, we are right at the limit of the bits JS uses in bitshifts
                    : Math.pow(2, bits)         + value;
}
function reSign(value, bits, ignore) {
  if (value <= 0) {
    return value;
  }
  var half = bits <= 32 ? Math.abs(1 << (bits-1)) // abs is needed if bits == 32
                        : Math.pow(2, bits-1);
  if (value >= half && (bits <= 32 || value > half)) { // for huge values, we can hit the precision limit and always get true here. so don't do that
                                                       // but, in general there is no perfect solution here. With 64-bit ints, we get rounding and errors
                                                       // TODO: In i64 mode 1, resign the two parts separately and safely
    value = -2*half + value; // Cannot bitshift half, as it may be at the limit of the bits JS uses in bitshifts
  }
  return value;
}

// check for imul support, and also for correctness ( https://bugs.webkit.org/show_bug.cgi?id=126345 )
if (!Math['imul'] || Math['imul'](0xffffffff, 5) !== -5) Math['imul'] = function imul(a, b) {
  var ah  = a >>> 16;
  var al = a & 0xffff;
  var bh  = b >>> 16;
  var bl = b & 0xffff;
  return (al*bl + ((ah*bl + al*bh) << 16))|0;
};
Math.imul = Math['imul'];


if (!Math['clz32']) Math['clz32'] = function(x) {
  x = x >>> 0;
  for (var i = 0; i < 32; i++) {
    if (x & (1 << (31 - i))) return i;
  }
  return 32;
};
Math.clz32 = Math['clz32']

if (!Math['trunc']) Math['trunc'] = function(x) {
  return x < 0 ? Math.ceil(x) : Math.floor(x);
};
Math.trunc = Math['trunc'];

var Math_abs = Math.abs;
var Math_cos = Math.cos;
var Math_sin = Math.sin;
var Math_tan = Math.tan;
var Math_acos = Math.acos;
var Math_asin = Math.asin;
var Math_atan = Math.atan;
var Math_atan2 = Math.atan2;
var Math_exp = Math.exp;
var Math_log = Math.log;
var Math_sqrt = Math.sqrt;
var Math_ceil = Math.ceil;
var Math_floor = Math.floor;
var Math_pow = Math.pow;
var Math_imul = Math.imul;
var Math_fround = Math.fround;
var Math_round = Math.round;
var Math_min = Math.min;
var Math_clz32 = Math.clz32;
var Math_trunc = Math.trunc;

// A counter of dependencies for calling run(). If we need to
// do asynchronous work before running, increment this and
// decrement it. Incrementing must happen in a place like
// PRE_RUN_ADDITIONS (used by emcc to add file preloading).
// Note that you can add dependencies in preRun, even though
// it happens right before run - run will be postponed until
// the dependencies are met.
var runDependencies = 0;
var runDependencyWatcher = null;
var dependenciesFulfilled = null; // overridden to take different actions when all run dependencies are fulfilled
var runDependencyTracking = {};

function getUniqueRunDependency(id) {
  var orig = id;
  while (1) {
    if (!runDependencyTracking[id]) return id;
    id = orig + Math.random();
  }
  return id;
}

function addRunDependency(id) {
  runDependencies++;
  if (Module['monitorRunDependencies']) {
    Module['monitorRunDependencies'](runDependencies);
  }
  if (id) {
    assert(!runDependencyTracking[id]);
    runDependencyTracking[id] = 1;
    if (runDependencyWatcher === null && typeof setInterval !== 'undefined') {
      // Check for missing dependencies every few seconds
      runDependencyWatcher = setInterval(function() {
        if (ABORT) {
          clearInterval(runDependencyWatcher);
          runDependencyWatcher = null;
          return;
        }
        var shown = false;
        for (var dep in runDependencyTracking) {
          if (!shown) {
            shown = true;
            Module.printErr('still waiting on run dependencies:');
          }
          Module.printErr('dependency: ' + dep);
        }
        if (shown) {
          Module.printErr('(end of list)');
        }
      }, 10000);
    }
  } else {
    Module.printErr('warning: run dependency added without ID');
  }
}
Module["addRunDependency"] = addRunDependency;

function removeRunDependency(id) {
  runDependencies--;
  if (Module['monitorRunDependencies']) {
    Module['monitorRunDependencies'](runDependencies);
  }
  if (id) {
    assert(runDependencyTracking[id]);
    delete runDependencyTracking[id];
  } else {
    Module.printErr('warning: run dependency removed without ID');
  }
  if (runDependencies == 0) {
    if (runDependencyWatcher !== null) {
      clearInterval(runDependencyWatcher);
      runDependencyWatcher = null;
    }
    if (dependenciesFulfilled) {
      var callback = dependenciesFulfilled;
      dependenciesFulfilled = null;
      callback(); // can add another dependenciesFulfilled
    }
  }
}
Module["removeRunDependency"] = removeRunDependency;

Module["preloadedImages"] = {}; // maps url to image data
Module["preloadedAudios"] = {}; // maps url to audio data



var memoryInitializer = null;






// === Body ===

var ASM_CONSTS = [function($0, $1, $2, $3) { window.MbedJSHal.C12832.update_display($0, $1, $2, new Uint8Array(Module.HEAPU8.buffer, $3, 4096)); },
 function($0, $1, $2) { window.MbedJSHal.C12832.init($0, $1, $2); },
 function($0, $1, $2) { window.MbedJSHal.sht31.init($0, $1, $2); },
 function($0) { return window.MbedJSHal.sht31.read_temperature($0); },
 function($0) { return window.MbedJSHal.sht31.read_humidity($0); },
 function($0) { window.MbedJSHal.timers.timeout_detach($0); },
 function() { window.MbedJSHal.die(); },
 function($0, $1) { MbedJSHal.gpio.init_out($0, $1, 0); },
 function($0, $1) { MbedJSHal.gpio.write($0, $1); }];

function _emscripten_asm_const_iiii(code, a0, a1, a2) {
  return ASM_CONSTS[code](a0, a1, a2);
}

function _emscripten_asm_const_iiiii(code, a0, a1, a2, a3) {
  return ASM_CONSTS[code](a0, a1, a2, a3);
}

function _emscripten_asm_const_ii(code, a0) {
  return ASM_CONSTS[code](a0);
}

function _emscripten_asm_const_iii(code, a0, a1) {
  return ASM_CONSTS[code](a0, a1);
}

function _emscripten_asm_const_i(code) {
  return ASM_CONSTS[code]();
}



STATIC_BASE = Runtime.GLOBAL_BASE;

STATICTOP = STATIC_BASE + 14816;
/* global initializers */  __ATINIT__.push({ func: function() { __GLOBAL__sub_I_arm_hal_timer_cpp() } }, { func: function() { __GLOBAL__sub_I_main_cpp() } });


/* memory initializer */ allocate([8,7,0,0,204,7,0,0,24,0,0,0,0,0,0,0,8,7,0,0,46,18,0,0,40,0,0,0,0,0,0,0,8,7,0,0,152,18,0,0,152,0,0,0,0,0,0,0,68,7,0,0,197,19,0,0,0,0,0,0,1,0,0,0,80,0,0,0,0,0,0,0,224,6,0,0,213,19,0,0,68,7,0,0,92,20,0,0,0,0,0,0,1,0,0,0,112,0,0,0,0,0,0,0,224,6,0,0,109,20,0,0,68,7,0,0,145,20,0,0,0,0,0,0,1,0,0,0,144,0,0,0,0,0,0,0,224,6,0,0,165,20,0,0,68,7,0,0,204,20,0,0,0,0,0,0,2,0,0,0,184,0,0,0,2,0,0,0,224,0,0,0,0,0,0,0,68,7,0,0,253,20,0,0,0,0,0,0,3,0,0,0,120,0,0,0,2,0,0,0,88,0,0,0,2,4,0,0,232,0,0,0,0,0,0,0,224,6,0,0,219,20,0,0,224,6,0,0,14,21,0,0,224,6,0,0,162,32,0,0,8,7,0,0,2,33,0,0,8,1,0,0,0,0,0,0,8,7,0,0,175,32,0,0,24,1,0,0,0,0,0,0,224,6,0,0,208,32,0,0,8,7,0,0,221,32,0,0,248,0,0,0,0,0,0,0,8,7,0,0,37,34,0,0,240,0,0,0,0,0,0,0,8,7,0,0,86,34,0,0,8,1,0,0,0,0,0,0,8,7,0,0,50,34,0,0,64,1,0,0,0,0,0,0,8,7,0,0,120,34,0,0,248,0,0,0,0,0,0,0,0,0,0,0,8,0,0,0,1,0,0,0,2,0,0,0,3,0,0,0,4,0,0,0,5,0,0,0,6,0,0,0,7,0,0,0,8,0,0,0,9,0,0,0,10,0,0,0,11,0,0,0,12,0,0,0,13,0,0,0,14,0,0,0,15,0,0,0,16,0,0,0,17,0,0,0,18,0,0,0,19,0,0,0,20,0,0,0,21,0,0,0,22,0,0,0,23,0,0,0,24,0,0,0,25,0,0,0,26,0,0,0,27,0,0,0,28,0,0,0,29,0,0,0,30,0,0,0,31,0,0,0,32,0,0,0,33,0,0,0,34,0,0,0,35,0,0,0,36,0,0,0,37,0,0,0,38,0,0,0,252,255,255,255,8,0,0,0,39,0,0,0,40,0,0,0,0,0,0,0,24,0,0,0,1,0,0,0,41,0,0,0,3,0,0,0,4,0,0,0,5,0,0,0,6,0,0,0,7,0,0,0,8,0,0,0,9,0,0,0,10,0,0,0,11,0,0,0,12,0,0,0,13,0,0,0,14,0,0,0,15,0,0,0,16,0,0,0,17,0,0,0,42,0,0,0,19,0,0,0,43,0,0,0,21,0,0,0,22,0,0,0,44,0,0,0,45,0,0,0,46,0,0,0,26,0,0,0,47,0,0,0,48,0,0,0,29,0,0,0,30,0,0,0,43,0,0,0,43,0,0,0,43,0,0,0,34,0,0,0,35,0,0,0,36,0,0,0,37,0,0,0,38,0,0,0,252,255,255,255,24,0,0,0,49,0,0,0,50,0,0,0,0,0,0,0,40,0,0,0,1,0,0,0,51,0,0,0,3,0,0,0,4,0,0,0,5,0,0,0,6,0,0,0,7,0,0,0,8,0,0,0,9,0,0,0,10,0,0,0,11,0,0,0,12,0,0,0,13,0,0,0,14,0,0,0,15,0,0,0,16,0,0,0,17,0,0,0,42,0,0,0,19,0,0,0,43,0,0,0,21,0,0,0,22,0,0,0,43,0,0,0,43,0,0,0,43,0,0,0,26,0,0,0,52,0,0,0,48,0,0,0,29,0,0,0,30,0,0,0,252,255,255,255,40,0,0,0,53,0,0,0,54,0,0,0,0,0,0,0,56,0,0,0,55,0,0,0,56,0,0,0,57,0,0,0,124,3,0,0,232,34,0,0,58,0,0,0,59,0,0,0,60,0,0,0,61,0,0,0,62,0,0,0,63,0,0,0,0,0,0,0,88,0,0,0,64,0,0,0,65,0,0,0,0,0,0,0,120,0,0,0,66,0,0,0,67,0,0,0,43,0,0,0,43,0,0,0,43,0,0,0,43,0,0,0,68,0,0,0,69,0,0,0,70,0,0,0,71,0,0,0,72,0,0,0,12,0,0,0,13,0,0,0,14,0,0,0,15,0,0,0,16,0,0,0,17,0,0,0,0,0,0,0,152,0,0,0,1,0,0,0,73,0,0,0,3,0,0,0,4,0,0,0,5,0,0,0,6,0,0,0,7,0,0,0,8,0,0,0,9,0,0,0,10,0,0,0,11,0,0,0,12,0,0,0,13,0,0,0,14,0,0,0,15,0,0,0,16,0,0,0,17,0,0,0,43,0,0,0,43,0,0,0,43,0,0,0,21,0,0,0,22,0,0,0,252,255,255,255,152,0,0,0,74,0,0,0,75,0,0,0,100,4,0,0,5,0,0,0,0,0,0,0,0,0,0,0,76,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,77,0,0,0,78,0,0,0,206,53,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2,0,0,0,0,0,0,0,0,0,0,0,0,0,0,255,255,255,255,255,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,148,53,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,216,5,0,0,5,0,0,0,0,0,0,0,0,0,0,0,76,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,79,0,0,0,78,0,0,0,214,53,0,0,0,4,0,0,0,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,10,255,255,255,255,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,216,5,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,80,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,255,255,255,255,255,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,81,0,0,0,0,0,0,0,248,0,0,0,82,0,0,0,83,0,0,0,84,0,0,0,85,0,0,0,86,0,0,0,87,0,0,0,88,0,0,0,89,0,0,0,0,0,0,0,32,1,0,0,82,0,0,0,90,0,0,0,84,0,0,0,85,0,0,0,86,0,0,0,91,0,0,0,92,0,0,0,93,0,0,0,0,0,0,0,48,1,0,0,94,0,0,0,95,0,0,0,96,0,0,0,0,0,0,0,96,1,0,0,82,0,0,0,97,0,0,0,84,0,0,0,85,0,0,0,86,0,0,0,98,0,0,0,99,0,0,0,100,0,0,0,123,32,119,105,110,100,111,119,46,77,98,101,100,74,83,72,97,108,46,67,49,50,56,51,50,46,117,112,100,97,116,101,95,100,105,115,112,108,97,121,40,36,48,44,32,36,49,44,32,36,50,44,32,110,101,119,32,85,105,110,116,56,65,114,114,97,121,40,77,111,100,117,108,101,46,72,69,65,80,85,56,46,98,117,102,102,101,114,44,32,36,51,44,32,52,48,57,54,41,41,59,32,125,0,54,67,49,50,56,51,50,0,123,32,119,105,110,100,111,119,46,77,98,101,100,74,83,72,97,108,46,67,49,50,56,51,50,46,105,110,105,116,40,36,48,44,32,36,49,44,32,36,50,41,59,32,125,0,19,9,9,2,5,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2,0,0,158,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,4,0,0,6,0,0,0,6,0,0,0,0,0,0,0,0,0,0,0,6,0,0,80,0,248,0,80,0,248,0,80,0,0,0,0,0,0,0,6,0,0,140,0,146,0,254,1,162,0,64,0,0,0,0,0,0,0,7,30,0,146,0,94,0,32,0,248,0,148,0,242,0,0,0,0,0,7,0,0,100,0,154,0,170,0,204,0,96,0,128,0,0,0,0,0,2,0,0,6,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,3,0,0,124,0,131,1,0,0,0,0,0,0,0,0,0,0,0,0,3,0,0,131,1,124,0,0,0,0,0,0,0,0,0,0,0,0,0,4,0,0,48,0,120,0,48,0,0,0,0,0,0,0,0,0,0,0,5,16,0,16,0,124,0,16,0,16,0,0,0,0,0,0,0,0,0,2,0,1,192,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,4,0,0,16,0,16,0,16,0,0,0,0,0,0,0,0,0,0,0,2,0,0,128,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,4,0,1,224,0,28,0,3,0,0,0,0,0,0,0,0,0,0,0,5,0,0,124,0,130,0,130,0,124,0,0,0,0,0,0,0,0,0,5,0,0,8,0,4,0,254,0,0,0,0,0,0,0,0,0,0,0,5,0,0,132,0,194,0,162,0,156,0,0,0,0,0,0,0,0,0,5,0,0,130,0,146,0,146,0,108,0,0,0,0,0,0,0,0,0,5,0,0,56,0,44,0,34,0,254,0,0,0,0,0,0,0,0,0,5,0,0,158,0,146,0,146,0,98,0,0,0,0,0,0,0,0,0,5,0,0,124,0,146,0,146,0,116,0,0,0,0,0,0,0,0,0,5,0,0,2,0,194,0,50,0,14,0,0,0,0,0,0,0,0,0,5,0,0,108,0,146,0,146,0,108,0,0,0,0,0,0,0,0,0,5,0,0,156,0,146,0,146,0,124,0,0,0,0,0,0,0,0,0,2,0,0,136,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2,0,1,200,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,5,16,0,16,0,40,0,40,0,68,0,0,0,0,0,0,0,0,0,5,0,0,40,0,40,0,40,0,40,0,0,0,0,0,0,0,0,0,5,0,0,68,0,40,0,40,0,16,0,0,0,0,0,0,0,0,0,5,0,0,2,0,178,0,18,0,12,0,0,0,0,0,0,0,0,0,9,0,0,248,0,132,1,114,1,74,1,74,1,122,1,66,0,60,0,6,0,0,248,0,36,0,34,0,36,0,248,0,0,0,0,0,0,0,6,0,0,254,0,146,0,146,0,146,0,108,0,0,0,0,0,0,0,6,0,0,124,0,130,0,130,0,130,0,68,0,0,0,0,0,0,0,6,0,0,254,0,130,0,130,0,198,0,124,0,0,0,0,0,0,0,5,0,0,254,0,146,0,146,0,146,0,0,0,0,0,0,0,0,0,5,0,0,254,0,18,0,18,0,18,0,0,0,0,0,0,0,0,0,6,0,0,124,0,198,0,130,0,146,0,246,0,0,0,0,0,0,0,6,0,0,254,0,16,0,16,0,16,0,254,0,0,0,0,0,0,0,2,0,0,254,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,4,0,0,128,0,128,0,126,0,0,0,0,0,0,0,0,0,0,0,5,0,0,254,0,16,0,44,0,194,0,0,0,0,0,0,0,0,0,5,0,0,254,0,128,0,128,0,128,0,0,0,0,0,0,0,0,0,8,0,0,254,0,6,0,24,0,224,0,24,0,6,0,254,0,0,0,6,0,0,254,0,6,0,24,0,96,0,254,0,0,0,0,0,0,0,6,0,0,124,0,130,0,130,0,130,0,124,0,0,0,0,0,0,0,5,0,0,254,0,18,0,18,0,12,0,0,0,0,0,0,0,0,0,7,0,0,124,0,130,0,130,0,194,0,252,0,0,1,0,0,0,0,5,0,0,254,0,18,0,18,0,236,0,0,0,0,0,0,0,0,0,5,0,0,204,0,146,0,146,0,102,0,0,0,0,0,0,0,0,0,6,0,0,2,0,2,0,254,0,2,0,2,0,0,0,0,0,0,0,6,0,0,126,0,128,0,128,0,128,0,126,0,0,0,0,0,0,0,7,0,0,6,0,60,0,224,0,224,0,28,0,6,0,0,0,0,0,6,0,0,30,0,224,0,62,0,224,0,30,0,0,0,0,0,0,0,6,0,0,130,0,100,0,56,0,108,0,130,0,0,0,0,0,0,0,6,0,0,2,0,12,0,240,0,12,0,2,0,0,0,0,0,0,0,6,0,0,130,0,226,0,146,0,142,0,130,0,0,0,0,0,0,0,3,0,0,255,1,1,1,0,0,0,0,0,0,0,0,0,0,0,0,4,1,0,14,0,112,0,128,1,0,0,0,0,0,0,0,0,0,0,2,1,1,255,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,4,0,0,24,0,12,0,24,0,0,0,0,0,0,0,0,0,0,0,6,0,1,0,1,0,1,0,1,0,1,0,1,0,0,0,0,0,0,3,0,0,1,0,2,0,0,0,0,0,0,0,0,0,0,0,0,0,5,0,0,232,0,168,0,168,0,248,0,0,0,0,0,0,0,0,0,5,0,0,254,0,136,0,136,0,112,0,0,0,0,0,0,0,0,0,5,0,0,112,0,136,0,136,0,136,0,0,0,0,0,0,0,0,0,5,0,0,112,0,136,0,136,0,254,0,0,0,0,0,0,0,0,0,5,0,0,112,0,168,0,168,0,176,0,0,0,0,0,0,0,0,0,4,8,0,254,0,10,0,2,0,0,0,0,0,0,0,0,0,0,0,5,0,0,48,0,72,1,72,1,248,1,0,0,0,0,0,0,0,0,5,0,0,254,0,8,0,8,0,248,0,0,0,0,0,0,0,0,0,2,0,0,250,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2,0,1,250,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,5,0,0,254,0,32,0,80,0,136,0,0,0,0,0,0,0,0,0,2,0,0,254,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,6,0,0,248,0,8,0,248,0,8,0,248,0,0,0,0,0,0,0,5,0,0,248,0,8,0,8,0,248,0,0,0,0,0,0,0,0,0,5,0,0,112,0,136,0,136,0,112,0,0,0,0,0,0,0,0,0,5,0,0,248,1,72,0,72,0,48,0,0,0,0,0,0,0,0,0,5,0,0,48,0,72,0,72,0,248,1,0,0,0,0,0,0,0,0,4,0,0,248,0,8,0,8,0,0,0,0,0,0,0,0,0,0,0,4,0,0,152,0,168,0,232,0,0,0,0,0,0,0,0,0,0,0,4,0,0,8,0,252,0,136,0,0,0,0,0,0,0,0,0,0,0,5,0,0,120,0,128,0,128,0,248,0,0,0,0,0,0,0,0,0,4,0,0,56,0,192,0,56,0,0,0,0,0,0,0,0,0,0,0,6,0,0,120,0,192,0,56,0,192,0,120,0,0,0,0,0,0,0,5,0,0,136,0,112,0,112,0,136,0,0,0,0,0,0,0,0,0,5,0,0,56,0,64,1,64,1,248,0,0,0,0,0,0,0,0,0,5,0,0,200,0,232,0,184,0,136,0,0,0,0,0,0,0,0,0,4,16,0,56,0,239,1,1,1,0,0,0,0,0,0,0,0,0,0,3,0,0,0,0,255,1,0,0,0,0,0,0,0,0,0,0,0,0,4,1,1,199,1,56,0,16,0,0,0,0,0,0,0,0,0,0,0,5,12,0,4,0,12,0,8,0,12,0,0,0,0,0,0,0,0,0,3,254,1,2,1,254,1,0,0,0,0,0,0,0,0,0,0,0,0,8,8,8,0,0,0,0,0,0,0,0,0,0,0,0,0,48,120,120,48,48,0,48,0,108,108,108,0,0,0,0,0,108,108,254,108,254,108,108,0,24,62,96,60,6,124,24,0,0,99,102,12,24,51,99,0,28,54,28,59,110,102,59,0,48,48,96,0,0,0,0,0,12,24,48,48,48,24,12,0,48,24,12,12,12,24,48,0,0,102,60,255,60,102,0,0,0,48,48,252,48,48,0,0,0,0,0,0,0,24,24,48,0,0,0,126,0,0,0,0,0,0,0,0,0,24,24,0,3,6,12,24,48,96,64,0,62,99,99,107,99,99,62,0,24,56,88,24,24,24,126,0,60,102,6,28,48,102,126,0,60,102,6,28,6,102,60,0,14,30,54,102,127,6,15,0,126,96,124,6,6,102,60,0,28,48,96,124,102,102,60,0,126,102,6,12,24,24,24,0,60,102,102,60,102,102,60,0,60,102,102,62,6,12,56,0,0,24,24,0,0,24,24,0,0,24,24,0,0,24,24,48,12,24,48,96,48,24,12,0,0,0,126,0,0,126,0,0,48,24,12,6,12,24,48,0,60,102,6,12,24,0,24,0,62,99,111,105,111,96,62,0,24,60,102,102,126,102,102,0,126,51,51,62,51,51,126,0,30,51,96,96,96,51,30,0,124,54,51,51,51,54,124,0,127,49,52,60,52,49,127,0,127,49,52,60,52,48,120,0,30,51,96,96,103,51,31,0,102,102,102,126,102,102,102,0,60,24,24,24,24,24,60,0,15,6,6,6,102,102,60,0,115,51,54,60,54,51,115,0,120,48,48,48,49,51,127,0,99,119,127,127,107,99,99,0,99,115,123,111,103,99,99,0,62,99,99,99,99,99,62,0,126,51,51,62,48,48,120,0,60,102,102,102,110,60,14,0,126,51,51,62,54,51,115,0,60,102,48,24,12,102,60,0,126,90,24,24,24,24,60,0,102,102,102,102,102,102,126,0,102,102,102,102,102,60,24,0,99,99,99,107,127,119,99,0,99,99,54,28,28,54,99,0,102,102,102,60,24,24,60,0,127,99,70,12,25,51,127,0,60,48,48,48,48,48,60,0,96,48,24,12,6,3,1,0,60,12,12,12,12,12,60,0,8,28,54,99,0,0,0,0,0,0,0,0,0,0,0,255,24,24,12,0,0,0,0,0,0,0,60,6,62,102,59,0,112,48,62,51,51,51,110,0,0,0,60,102,96,102,60,0,14,6,62,102,102,102,59,0,0,0,60,102,126,96,60,0,28,54,48,120,48,48,120,0,0,0,59,102,102,62,6,124,112,48,54,59,51,51,115,0,24,0,56,24,24,24,60,0,6,0,6,6,6,102,102,60,112,48,51,54,60,54,115,0,56,24,24,24,24,24,60,0,0,0,102,127,127,107,99,0,0,0,124,102,102,102,102,0,0,0,60,102,102,102,60,0,0,0,110,51,51,62,48,120,0,0,59,102,102,62,6,15,0,0,110,59,51,48,120,0,0,0,62,96,60,6,124,0,8,24,62,24,24,26,12,0,0,0,102,102,102,102,59,0,0,0,102,102,102,60,24,0,0,0,99,107,127,127,54,0,0,0,99,54,28,54,99,0,0,0,102,102,102,62,6,124,0,0,126,76,24,50,126,0,14,24,24,112,24,24,14,0,12,12,12,0,12,12,12,0,112,24,24,14,24,24,112,0,59,110,0,0,0,0,0,0,28,54,54,28,0,0,0,0,49,53,71,114,97,112,104,105,99,115,68,105,115,112,108,97,121,0,99,108,97,105,109,32,114,101,113,117,105,114,101,115,32,97,32,110,97,109,101,32,116,111,32,98,101,32,103,105,118,101,110,32,105,110,32,116,104,101,32,105,110,115,116,97,110,116,105,111,97,116,111,114,32,111,102,32,116,104,101,32,84,101,120,116,68,105,115,112,108,97,121,32,105,110,115,116,97,110,99,101,33,13,10,0,119,0,49,49,84,101,120,116,68,105,115,112,108,97,121,0,47,37,115,0,123,32,119,105,110,100,111,119,46,77,98,101,100,74,83,72,97,108,46,115,104,116,51,49,46,105,110,105,116,40,36,48,44,32,36,49,44,32,36,50,41,59,32,125,0,123,32,114,101,116,117,114,110,32,119,105,110,100,111,119,46,77,98,101,100,74,83,72,97,108,46,115,104,116,51,49,46,114,101,97,100,95,116,101,109,112,101,114,97,116,117,114,101,40,36,48,41,59,32,125,0,123,32,114,101,116,117,114,110,32,119,105,110,100,111,119,46,77,98,101,100,74,83,72,97,108,46,115,104,116,51,49,46,114,101,97,100,95,104,117,109,105,100,105,116,121,40,36,48,41,59,32,125,0,95,111,112,115,0,47,85,115,101,114,115,47,106,97,110,106,111,110,48,49,47,114,101,112,111,115,47,109,98,101,100,45,115,105,109,117,108,97,116,111,114,47,109,98,101,100,45,115,105,109,117,108,97,116,111,114,45,104,97,108,47,112,108,97,116,102,111,114,109,47,67,97,108,108,98,97,99,107,46,104,0,123,32,119,105,110,100,111,119,46,77,98,101,100,74,83,72,97,108,46,116,105,109,101,114,115,46,116,105,109,101,111,117,116,95,100,101,116,97,99,104,40,36,48,41,59,32,125,0,78,52,109,98,101,100,55,84,105,109,101,111,117,116,69,0,78,52,109,98,101,100,49,49,78,111,110,67,111,112,121,97,98,108,101,73,78,83,95,55,84,105,109,101,111,117,116,69,69,69,0,95,112,116,114,32,61,61,32,40,84,32,42,41,38,95,100,97,116,97,0,47,85,115,101,114,115,47,106,97,110,106,111,110,48,49,47,114,101,112,111,115,47,109,98,101,100,45,115,105,109,117,108,97,116,111,114,47,109,98,101,100,45,115,105,109,117,108,97,116,111,114,45,104,97,108,47,112,108,97,116,102,111,114,109,47,83,105,110,103,108,101,116,111,110,80,116,114,46,104,0,78,52,109,98,101,100,56,70,105,108,101,66,97,115,101,69,0,78,52,109,98,101,100,49,49,78,111,110,67,111,112,121,97,98,108,101,73,78,83,95,56,70,105,108,101,66,97,115,101,69,69,69,0,78,52,109,98,101,100,49,48,70,105,108,101,72,97,110,100,108,101,69,0,78,52,109,98,101,100,49,49,78,111,110,67,111,112,121,97,98,108,101,73,78,83,95,49,48,70,105,108,101,72,97,110,100,108,101,69,69,69,0,78,52,109,98,101,100,54,83,116,114,101,97,109,69,0,78,52,109,98,101,100,49,49,78,111,110,67,111,112,121,97,98,108,101,73,78,83,95,54,83,116,114,101,97,109,69,69,69,0,78,52,109,98,101,100,56,70,105,108,101,76,105,107,101,69,0,78,52,109,98,101,100,49,49,78,111,110,67,111,112,121,97,98,108,101,73,78,83,95,56,70,105,108,101,76,105,107,101,69,69,69,0,119,43,0,83,116,114,101,97,109,32,111,98,106,32,102,97,105,108,117,114,101,44,32,101,114,114,110,111,61,37,100,13,10,0,109,98,101,100,32,97,115,115,101,114,116,97,116,105,111,110,32,102,97,105,108,101,100,58,32,37,115,44,32,102,105,108,101,58,32,37,115,44,32,108,105,110,101,32,37,100,32,10,0,123,32,119,105,110,100,111,119,46,77,98,101,100,74,83,72,97,108,46,100,105,101,40,41,59,32,125,0,109,98,101,100,95,100,105,101,32,110,111,116,32,105,109,112,108,101,109,101,110,116,101,100,0,109,98,101,100,95,101,114,114,111,114,95,118,102,112,114,105,110,116,102,32,110,111,116,32,105,109,112,108,101,109,101,110,116,101,100,0,123,32,77,98,101,100,74,83,72,97,108,46,103,112,105,111,46,105,110,105,116,95,111,117,116,40,36,48,44,32,36,49,44,32,48,41,59,32,125,0,76,67,68,0,83,101,116,32,116,104,101,32,116,101,109,112,101,114,97,116,117,114,101,32,97,98,111,118,101,32,50,53,32,100,101,103,114,101,101,115,32,116,111,32,116,114,105,103,103,101,114,32,116,104,101,32,119,97,114,110,105,110,103,32,76,69,68,10,0,84,101,109,112,101,114,97,116,117,114,101,58,32,37,46,50,102,32,67,0,72,117,109,105,100,105,116,121,58,32,37,46,50,102,32,37,37,0,123,32,77,98,101,100,74,83,72,97,108,46,103,112,105,111,46,119,114,105,116,101,40,36,48,44,32,36,49,41,59,32,125,0,17,0,10,0,17,17,17,0,0,0,0,5,0,0,0,0,0,0,9,0,0,0,0,11,0,0,0,0,0,0,0,0,17,0,15,10,17,17,17,3,10,7,0,1,19,9,11,11,0,0,9,6,11,0,0,11,0,6,17,0,0,0,17,17,17,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,11,0,0,0,0,0,0,0,0,17,0,10,10,17,17,17,0,10,0,0,2,0,9,11,0,0,0,9,0,11,0,0,11,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,12,0,0,0,0,0,0,0,0,0,0,0,12,0,0,0,0,12,0,0,0,0,9,12,0,0,0,0,0,12,0,0,12,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,14,0,0,0,0,0,0,0,0,0,0,0,13,0,0,0,4,13,0,0,0,0,9,14,0,0,0,0,0,14,0,0,14,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,16,0,0,0,0,0,0,0,0,0,0,0,15,0,0,0,0,15,0,0,0,0,9,16,0,0,0,0,0,16,0,0,16,0,0,18,0,0,0,18,18,18,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,18,0,0,0,18,18,18,0,0,0,0,0,0,9,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,11,0,0,0,0,0,0,0,0,0,0,0,10,0,0,0,0,10,0,0,0,0,9,11,0,0,0,0,0,11,0,0,11,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,12,0,0,0,0,0,0,0,0,0,0,0,12,0,0,0,0,12,0,0,0,0,9,12,0,0,0,0,0,12,0,0,12,0,0,45,43,32,32,32,48,88,48,120,0,40,110,117,108,108,41,0,45,48,88,43,48,88,32,48,88,45,48,120,43,48,120,32,48,120,0,105,110,102,0,73,78,70,0,110,97,110,0,78,65,78,0,48,49,50,51,52,53,54,55,56,57,65,66,67,68,69,70,46,0,84,33,34,25,13,1,2,3,17,75,28,12,16,4,11,29,18,30,39,104,110,111,112,113,98,32,5,6,15,19,20,21,26,8,22,7,40,36,23,24,9,10,14,27,31,37,35,131,130,125,38,42,43,60,61,62,63,67,71,74,77,88,89,90,91,92,93,94,95,96,97,99,100,101,102,103,105,106,107,108,114,115,116,121,122,123,124,0,73,108,108,101,103,97,108,32,98,121,116,101,32,115,101,113,117,101,110,99,101,0,68,111,109,97,105,110,32,101,114,114,111,114,0,82,101,115,117,108,116,32,110,111,116,32,114,101,112,114,101,115,101,110,116,97,98,108,101,0,78,111,116,32,97,32,116,116,121,0,80,101,114,109,105,115,115,105,111,110,32,100,101,110,105,101,100,0,79,112,101,114,97,116,105,111,110,32,110,111,116,32,112,101,114,109,105,116,116,101,100,0,78,111,32,115,117,99,104,32,102,105,108,101,32,111,114,32,100,105,114,101,99,116,111,114,121,0,78,111,32,115,117,99,104,32,112,114,111,99,101,115,115,0,70,105,108,101,32,101,120,105,115,116,115,0,86,97,108,117,101,32,116,111,111,32,108,97,114,103,101,32,102,111,114,32,100,97,116,97,32,116,121,112,101,0,78,111,32,115,112,97,99,101,32,108,101,102,116,32,111,110,32,100,101,118,105,99,101,0,79,117,116,32,111,102,32,109,101,109,111,114,121,0,82,101,115,111,117,114,99,101,32,98,117,115,121,0,73,110,116,101,114,114,117,112,116,101,100,32,115,121,115,116,101,109,32,99,97,108,108,0,82,101,115,111,117,114,99,101,32,116,101,109,112,111,114,97,114,105,108,121,32,117,110,97,118,97,105,108,97,98,108,101,0,73,110,118,97,108,105,100,32,115,101,101,107,0,67,114,111,115,115,45,100,101,118,105,99,101,32,108,105,110,107,0,82,101,97,100,45,111,110,108,121,32,102,105,108,101,32,115,121,115,116,101,109,0,68,105,114,101,99,116,111,114,121,32,110,111,116,32,101,109,112,116,121,0,67,111,110,110,101,99,116,105,111,110,32,114,101,115,101,116,32,98,121,32,112,101,101,114,0,79,112,101,114,97,116,105,111,110,32,116,105,109,101,100,32,111,117,116,0,67,111,110,110,101,99,116,105,111,110,32,114,101,102,117,115,101,100,0,72,111,115,116,32,105,115,32,100,111,119,110,0,72,111,115,116,32,105,115,32,117,110,114,101,97,99,104,97,98,108,101,0,65,100,100,114,101,115,115,32,105,110,32,117,115,101,0,66,114,111,107,101,110,32,112,105,112,101,0,73,47,79,32,101,114,114,111,114,0,78,111,32,115,117,99,104,32,100,101,118,105,99,101,32,111,114,32,97,100,100,114,101,115,115,0,66,108,111,99,107,32,100,101,118,105,99,101,32,114,101,113,117,105,114,101,100,0,78,111,32,115,117,99,104,32,100,101,118,105,99,101,0,78,111,116,32,97,32,100,105,114,101,99,116,111,114,121,0,73,115,32,97,32,100,105,114,101,99,116,111,114,121,0,84,101,120,116,32,102,105,108,101,32,98,117,115,121,0,69,120,101,99,32,102,111,114,109,97,116,32,101,114,114,111,114,0,73,110,118,97,108,105,100,32,97,114,103,117,109,101,110,116,0,65,114,103,117,109,101,110,116,32,108,105,115,116,32,116,111,111,32,108,111,110,103,0,83,121,109,98,111,108,105,99,32,108,105,110,107,32,108,111,111,112,0,70,105,108,101,110,97,109,101,32,116,111,111,32,108,111,110,103,0,84,111,111,32,109,97,110,121,32,111,112,101,110,32,102,105,108,101,115,32,105,110,32,115,121,115,116,101,109,0,78,111,32,102,105,108,101,32,100,101,115,99,114,105,112,116,111,114,115,32,97,118,97,105,108,97,98,108,101,0,66,97,100,32,102,105,108,101,32,100,101,115,99,114,105,112,116,111,114,0,78,111,32,99,104,105,108,100,32,112,114,111,99,101,115,115,0,66,97,100,32,97,100,100,114,101,115,115,0,70,105,108,101,32,116,111,111,32,108,97,114,103,101,0,84,111,111,32,109,97,110,121,32,108,105,110,107,115,0,78,111,32,108,111,99,107,115,32,97,118,97,105,108,97,98,108,101,0,82,101,115,111,117,114,99,101,32,100,101,97,100,108,111,99,107,32,119,111,117,108,100,32,111,99,99,117,114,0,83,116,97,116,101,32,110,111,116,32,114,101,99,111,118,101,114,97,98,108,101,0,80,114,101,118,105,111,117,115,32,111,119,110,101,114,32,100,105,101,100,0,79,112,101,114,97,116,105,111,110,32,99,97,110,99,101,108,101,100,0,70,117,110,99,116,105,111,110,32,110,111,116,32,105,109,112,108,101,109,101,110,116,101,100,0,78,111,32,109,101,115,115,97,103,101,32,111,102,32,100,101,115,105,114,101,100,32,116,121,112,101,0,73,100,101,110,116,105,102,105,101,114,32,114,101,109,111,118,101,100,0,68,101,118,105,99,101,32,110,111,116,32,97,32,115,116,114,101,97,109,0,78,111,32,100,97,116,97,32,97,118,97,105,108,97,98,108,101,0,68,101,118,105,99,101,32,116,105,109,101,111,117,116,0,79,117,116,32,111,102,32,115,116,114,101,97,109,115,32,114,101,115,111,117,114,99,101,115,0,76,105,110,107,32,104,97,115,32,98,101,101,110,32,115,101,118,101,114,101,100,0,80,114,111,116,111,99,111,108,32,101,114,114,111,114,0,66,97,100,32,109,101,115,115,97,103,101,0,70,105,108,101,32,100,101,115,99,114,105,112,116,111,114,32,105,110,32,98,97,100,32,115,116,97,116,101,0,78,111,116,32,97,32,115,111,99,107,101,116,0,68,101,115,116,105,110,97,116,105,111,110,32,97,100,100,114,101,115,115,32,114,101,113,117,105,114,101,100,0,77,101,115,115,97,103,101,32,116,111,111,32,108,97,114,103,101,0,80,114,111,116,111,99,111,108,32,119,114,111,110,103,32,116,121,112,101,32,102,111,114,32,115,111,99,107,101,116,0,80,114,111,116,111,99,111,108,32,110,111,116,32,97,118,97,105,108,97,98,108,101,0,80,114,111,116,111,99,111,108,32,110,111,116,32,115,117,112,112,111,114,116,101,100,0,83,111,99,107,101,116,32,116,121,112,101,32,110,111,116,32,115,117,112,112,111,114,116,101,100,0,78,111,116,32,115,117,112,112,111,114,116,101,100,0,80,114,111,116,111,99,111,108,32,102,97,109,105,108,121,32,110,111,116,32,115,117,112,112,111,114,116,101,100,0,65,100,100,114,101,115,115,32,102,97,109,105,108,121,32,110,111,116,32,115,117,112,112,111,114,116,101,100,32,98,121,32,112,114,111,116,111,99,111,108,0,65,100,100,114,101,115,115,32,110,111,116,32,97,118,97,105,108,97,98,108,101,0,78,101,116,119,111,114,107,32,105,115,32,100,111,119,110,0,78,101,116,119,111,114,107,32,117,110,114,101,97,99,104,97,98,108,101,0,67,111,110,110,101,99,116,105,111,110,32,114,101,115,101,116,32,98,121,32,110,101,116,119,111,114,107,0,67,111,110,110,101,99,116,105,111,110,32,97,98,111,114,116,101,100,0,78,111,32,98,117,102,102,101,114,32,115,112,97,99,101,32,97,118,97,105,108,97,98,108,101,0,83,111,99,107,101,116,32,105,115,32,99,111,110,110,101,99,116,101,100,0,83,111,99,107,101,116,32,110,111,116,32,99,111,110,110,101,99,116,101,100,0,67,97,110,110,111,116,32,115,101,110,100,32,97,102,116,101,114,32,115,111,99,107,101,116,32,115,104,117,116,100,111,119,110,0,79,112,101,114,97,116,105,111,110,32,97,108,114,101,97,100,121,32,105,110,32,112,114,111,103,114,101,115,115,0,79,112,101,114,97,116,105,111,110,32,105,110,32,112,114,111,103,114,101,115,115,0,83,116,97,108,101,32,102,105,108,101,32,104,97,110,100,108,101,0,82,101,109,111,116,101,32,73,47,79,32,101,114,114,111,114,0,81,117,111,116,97,32,101,120,99,101,101,100,101,100,0,78,111,32,109,101,100,105,117,109,32,102,111,117,110,100,0,87,114,111,110,103,32,109,101,100,105,117,109,32,116,121,112,101,0,78,111,32,101,114,114,111,114,32,105,110,102,111,114,109,97,116,105,111,110,0,0,114,119,97,0,116,101,114,109,105,110,97,116,105,110,103,32,119,105,116,104,32,37,115,32,101,120,99,101,112,116,105,111,110,32,111,102,32,116,121,112,101,32,37,115,58,32,37,115,0,116,101,114,109,105,110,97,116,105,110,103,32,119,105,116,104,32,37,115,32,101,120,99,101,112,116,105,111,110,32,111,102,32,116,121,112,101,32,37,115,0,116,101,114,109,105,110,97,116,105,110,103,32,119,105,116,104,32,37,115,32,102,111,114,101,105,103,110,32,101,120,99,101,112,116,105,111,110,0,116,101,114,109,105,110,97,116,105,110,103,0,117,110,99,97,117,103,104,116,0,83,116,57,101,120,99,101,112,116,105,111,110,0,78,49,48,95,95,99,120,120,97,98,105,118,49,49,54,95,95,115,104,105,109,95,116,121,112,101,95,105,110,102,111,69,0,83,116,57,116,121,112,101,95,105,110,102,111,0,78,49,48,95,95,99,120,120,97,98,105,118,49,50,48,95,95,115,105,95,99,108,97,115,115,95,116,121,112,101,95,105,110,102,111,69,0,78,49,48,95,95,99,120,120,97,98,105,118,49,49,55,95,95,99,108,97,115,115,95,116,121,112,101,95,105,110,102,111,69,0,112,116,104,114,101,97,100,95,111,110,99,101,32,102,97,105,108,117,114,101,32,105,110,32,95,95,99,120,97,95,103,101,116,95,103,108,111,98,97,108,115,95,102,97,115,116,40,41,0,99,97,110,110,111,116,32,99,114,101,97,116,101,32,112,116,104,114,101,97,100,32,107,101,121,32,102,111,114,32,95,95,99,120,97,95,103,101,116,95,103,108,111,98,97,108,115,40,41,0,99,97,110,110,111,116,32,122,101,114,111,32,111,117,116,32,116,104,114,101,97,100,32,118,97,108,117,101,32,102,111,114,32,95,95,99,120,97,95,103,101,116,95,103,108,111,98,97,108,115,40,41,0,116,101,114,109,105,110,97,116,101,95,104,97,110,100,108,101,114,32,117,110,101,120,112,101,99,116,101,100,108,121,32,114,101,116,117,114,110,101,100,0,116,101,114,109,105,110,97,116,101,95,104,97,110,100,108,101,114,32,117,110,101,120,112,101,99,116,101,100,108,121,32,116,104,114,101,119,32,97,110,32,101,120,99,101,112,116,105,111,110,0,115,116,100,58,58,98,97,100,95,97,108,108,111,99,0,83,116,57,98,97,100,95,97,108,108,111,99,0,78,49,48,95,95,99,120,120,97,98,105,118,49,49,57,95,95,112,111,105,110,116,101,114,95,116,121,112,101,95,105,110,102,111,69,0,78,49,48,95,95,99,120,120,97,98,105,118,49,49,55,95,95,112,98,97,115,101,95,116,121,112,101,95,105,110,102,111,69,0,78,49,48,95,95,99,120,120,97,98,105,118,49,50,49,95,95,118,109,105,95,99,108,97,115,115,95,116,121,112,101,95,105,110,102,111,69,0], "i8", ALLOC_NONE, Runtime.GLOBAL_BASE);





/* no memory initializer */
var tempDoublePtr = STATICTOP; STATICTOP += 16;

assert(tempDoublePtr % 8 == 0);

function copyTempFloat(ptr) { // functions, because inlining this code increases code size too much

  HEAP8[tempDoublePtr] = HEAP8[ptr];

  HEAP8[tempDoublePtr+1] = HEAP8[ptr+1];

  HEAP8[tempDoublePtr+2] = HEAP8[ptr+2];

  HEAP8[tempDoublePtr+3] = HEAP8[ptr+3];

}

function copyTempDouble(ptr) {

  HEAP8[tempDoublePtr] = HEAP8[ptr];

  HEAP8[tempDoublePtr+1] = HEAP8[ptr+1];

  HEAP8[tempDoublePtr+2] = HEAP8[ptr+2];

  HEAP8[tempDoublePtr+3] = HEAP8[ptr+3];

  HEAP8[tempDoublePtr+4] = HEAP8[ptr+4];

  HEAP8[tempDoublePtr+5] = HEAP8[ptr+5];

  HEAP8[tempDoublePtr+6] = HEAP8[ptr+6];

  HEAP8[tempDoublePtr+7] = HEAP8[ptr+7];

}

// {{PRE_LIBRARY}}


  
  function _emscripten_get_now() { abort() }
  
  function _emscripten_get_now_is_monotonic() {
      // return whether emscripten_get_now is guaranteed monotonic; the Date.now
      // implementation is not :(
      return ENVIRONMENT_IS_NODE || (typeof dateNow !== 'undefined') ||
          ((ENVIRONMENT_IS_WEB || ENVIRONMENT_IS_WORKER) && self['performance'] && self['performance']['now']);
    }
  
  var ERRNO_CODES={EPERM:1,ENOENT:2,ESRCH:3,EINTR:4,EIO:5,ENXIO:6,E2BIG:7,ENOEXEC:8,EBADF:9,ECHILD:10,EAGAIN:11,EWOULDBLOCK:11,ENOMEM:12,EACCES:13,EFAULT:14,ENOTBLK:15,EBUSY:16,EEXIST:17,EXDEV:18,ENODEV:19,ENOTDIR:20,EISDIR:21,EINVAL:22,ENFILE:23,EMFILE:24,ENOTTY:25,ETXTBSY:26,EFBIG:27,ENOSPC:28,ESPIPE:29,EROFS:30,EMLINK:31,EPIPE:32,EDOM:33,ERANGE:34,ENOMSG:42,EIDRM:43,ECHRNG:44,EL2NSYNC:45,EL3HLT:46,EL3RST:47,ELNRNG:48,EUNATCH:49,ENOCSI:50,EL2HLT:51,EDEADLK:35,ENOLCK:37,EBADE:52,EBADR:53,EXFULL:54,ENOANO:55,EBADRQC:56,EBADSLT:57,EDEADLOCK:35,EBFONT:59,ENOSTR:60,ENODATA:61,ETIME:62,ENOSR:63,ENONET:64,ENOPKG:65,EREMOTE:66,ENOLINK:67,EADV:68,ESRMNT:69,ECOMM:70,EPROTO:71,EMULTIHOP:72,EDOTDOT:73,EBADMSG:74,ENOTUNIQ:76,EBADFD:77,EREMCHG:78,ELIBACC:79,ELIBBAD:80,ELIBSCN:81,ELIBMAX:82,ELIBEXEC:83,ENOSYS:38,ENOTEMPTY:39,ENAMETOOLONG:36,ELOOP:40,EOPNOTSUPP:95,EPFNOSUPPORT:96,ECONNRESET:104,ENOBUFS:105,EAFNOSUPPORT:97,EPROTOTYPE:91,ENOTSOCK:88,ENOPROTOOPT:92,ESHUTDOWN:108,ECONNREFUSED:111,EADDRINUSE:98,ECONNABORTED:103,ENETUNREACH:101,ENETDOWN:100,ETIMEDOUT:110,EHOSTDOWN:112,EHOSTUNREACH:113,EINPROGRESS:115,EALREADY:114,EDESTADDRREQ:89,EMSGSIZE:90,EPROTONOSUPPORT:93,ESOCKTNOSUPPORT:94,EADDRNOTAVAIL:99,ENETRESET:102,EISCONN:106,ENOTCONN:107,ETOOMANYREFS:109,EUSERS:87,EDQUOT:122,ESTALE:116,ENOTSUP:95,ENOMEDIUM:123,EILSEQ:84,EOVERFLOW:75,ECANCELED:125,ENOTRECOVERABLE:131,EOWNERDEAD:130,ESTRPIPE:86};
  
  function ___setErrNo(value) {
      if (Module['___errno_location']) HEAP32[((Module['___errno_location']())>>2)]=value;
      else Module.printErr('failed to set errno from JS');
      return value;
    }function _clock_gettime(clk_id, tp) {
      // int clock_gettime(clockid_t clk_id, struct timespec *tp);
      var now;
      if (clk_id === 0) {
        now = Date.now();
      } else if (clk_id === 1 && _emscripten_get_now_is_monotonic()) {
        now = _emscripten_get_now();
      } else {
        ___setErrNo(ERRNO_CODES.EINVAL);
        return -1;
      }
      HEAP32[((tp)>>2)]=(now/1000)|0; // seconds
      HEAP32[(((tp)+(4))>>2)]=((now % 1000)*1000*1000)|0; // nanoseconds
      return 0;
    }

   

   

  
  
  
  var ERRNO_MESSAGES={0:"Success",1:"Not super-user",2:"No such file or directory",3:"No such process",4:"Interrupted system call",5:"I/O error",6:"No such device or address",7:"Arg list too long",8:"Exec format error",9:"Bad file number",10:"No children",11:"No more processes",12:"Not enough core",13:"Permission denied",14:"Bad address",15:"Block device required",16:"Mount device busy",17:"File exists",18:"Cross-device link",19:"No such device",20:"Not a directory",21:"Is a directory",22:"Invalid argument",23:"Too many open files in system",24:"Too many open files",25:"Not a typewriter",26:"Text file busy",27:"File too large",28:"No space left on device",29:"Illegal seek",30:"Read only file system",31:"Too many links",32:"Broken pipe",33:"Math arg out of domain of func",34:"Math result not representable",35:"File locking deadlock error",36:"File or path name too long",37:"No record locks available",38:"Function not implemented",39:"Directory not empty",40:"Too many symbolic links",42:"No message of desired type",43:"Identifier removed",44:"Channel number out of range",45:"Level 2 not synchronized",46:"Level 3 halted",47:"Level 3 reset",48:"Link number out of range",49:"Protocol driver not attached",50:"No CSI structure available",51:"Level 2 halted",52:"Invalid exchange",53:"Invalid request descriptor",54:"Exchange full",55:"No anode",56:"Invalid request code",57:"Invalid slot",59:"Bad font file fmt",60:"Device not a stream",61:"No data (for no delay io)",62:"Timer expired",63:"Out of streams resources",64:"Machine is not on the network",65:"Package not installed",66:"The object is remote",67:"The link has been severed",68:"Advertise error",69:"Srmount error",70:"Communication error on send",71:"Protocol error",72:"Multihop attempted",73:"Cross mount point (not really error)",74:"Trying to read unreadable message",75:"Value too large for defined data type",76:"Given log. name not unique",77:"f.d. invalid for this operation",78:"Remote address changed",79:"Can   access a needed shared lib",80:"Accessing a corrupted shared lib",81:".lib section in a.out corrupted",82:"Attempting to link in too many libs",83:"Attempting to exec a shared library",84:"Illegal byte sequence",86:"Streams pipe error",87:"Too many users",88:"Socket operation on non-socket",89:"Destination address required",90:"Message too long",91:"Protocol wrong type for socket",92:"Protocol not available",93:"Unknown protocol",94:"Socket type not supported",95:"Not supported",96:"Protocol family not supported",97:"Address family not supported by protocol family",98:"Address already in use",99:"Address not available",100:"Network interface is not configured",101:"Network is unreachable",102:"Connection reset by network",103:"Connection aborted",104:"Connection reset by peer",105:"No buffer space available",106:"Socket is already connected",107:"Socket is not connected",108:"Can't send after socket shutdown",109:"Too many references",110:"Connection timed out",111:"Connection refused",112:"Host is down",113:"Host is unreachable",114:"Socket already connected",115:"Connection already in progress",116:"Stale file handle",122:"Quota exceeded",123:"No medium (in tape drive)",125:"Operation canceled",130:"Previous owner died",131:"State not recoverable"};
  
  var PATH={splitPath:function (filename) {
        var splitPathRe = /^(\/?|)([\s\S]*?)((?:\.{1,2}|[^\/]+?|)(\.[^.\/]*|))(?:[\/]*)$/;
        return splitPathRe.exec(filename).slice(1);
      },normalizeArray:function (parts, allowAboveRoot) {
        // if the path tries to go above the root, `up` ends up > 0
        var up = 0;
        for (var i = parts.length - 1; i >= 0; i--) {
          var last = parts[i];
          if (last === '.') {
            parts.splice(i, 1);
          } else if (last === '..') {
            parts.splice(i, 1);
            up++;
          } else if (up) {
            parts.splice(i, 1);
            up--;
          }
        }
        // if the path is allowed to go above the root, restore leading ..s
        if (allowAboveRoot) {
          for (; up; up--) {
            parts.unshift('..');
          }
        }
        return parts;
      },normalize:function (path) {
        var isAbsolute = path.charAt(0) === '/',
            trailingSlash = path.substr(-1) === '/';
        // Normalize the path
        path = PATH.normalizeArray(path.split('/').filter(function(p) {
          return !!p;
        }), !isAbsolute).join('/');
        if (!path && !isAbsolute) {
          path = '.';
        }
        if (path && trailingSlash) {
          path += '/';
        }
        return (isAbsolute ? '/' : '') + path;
      },dirname:function (path) {
        var result = PATH.splitPath(path),
            root = result[0],
            dir = result[1];
        if (!root && !dir) {
          // No dirname whatsoever
          return '.';
        }
        if (dir) {
          // It has a dirname, strip trailing slash
          dir = dir.substr(0, dir.length - 1);
        }
        return root + dir;
      },basename:function (path) {
        // EMSCRIPTEN return '/'' for '/', not an empty string
        if (path === '/') return '/';
        var lastSlash = path.lastIndexOf('/');
        if (lastSlash === -1) return path;
        return path.substr(lastSlash+1);
      },extname:function (path) {
        return PATH.splitPath(path)[3];
      },join:function () {
        var paths = Array.prototype.slice.call(arguments, 0);
        return PATH.normalize(paths.join('/'));
      },join2:function (l, r) {
        return PATH.normalize(l + '/' + r);
      },resolve:function () {
        var resolvedPath = '',
          resolvedAbsolute = false;
        for (var i = arguments.length - 1; i >= -1 && !resolvedAbsolute; i--) {
          var path = (i >= 0) ? arguments[i] : FS.cwd();
          // Skip empty and invalid entries
          if (typeof path !== 'string') {
            throw new TypeError('Arguments to path.resolve must be strings');
          } else if (!path) {
            return ''; // an invalid portion invalidates the whole thing
          }
          resolvedPath = path + '/' + resolvedPath;
          resolvedAbsolute = path.charAt(0) === '/';
        }
        // At this point the path should be resolved to a full absolute path, but
        // handle relative paths to be safe (might happen when process.cwd() fails)
        resolvedPath = PATH.normalizeArray(resolvedPath.split('/').filter(function(p) {
          return !!p;
        }), !resolvedAbsolute).join('/');
        return ((resolvedAbsolute ? '/' : '') + resolvedPath) || '.';
      },relative:function (from, to) {
        from = PATH.resolve(from).substr(1);
        to = PATH.resolve(to).substr(1);
        function trim(arr) {
          var start = 0;
          for (; start < arr.length; start++) {
            if (arr[start] !== '') break;
          }
          var end = arr.length - 1;
          for (; end >= 0; end--) {
            if (arr[end] !== '') break;
          }
          if (start > end) return [];
          return arr.slice(start, end - start + 1);
        }
        var fromParts = trim(from.split('/'));
        var toParts = trim(to.split('/'));
        var length = Math.min(fromParts.length, toParts.length);
        var samePartsLength = length;
        for (var i = 0; i < length; i++) {
          if (fromParts[i] !== toParts[i]) {
            samePartsLength = i;
            break;
          }
        }
        var outputParts = [];
        for (var i = samePartsLength; i < fromParts.length; i++) {
          outputParts.push('..');
        }
        outputParts = outputParts.concat(toParts.slice(samePartsLength));
        return outputParts.join('/');
      }};
  
  var TTY={ttys:[],init:function () {
        // https://github.com/kripken/emscripten/pull/1555
        // if (ENVIRONMENT_IS_NODE) {
        //   // currently, FS.init does not distinguish if process.stdin is a file or TTY
        //   // device, it always assumes it's a TTY device. because of this, we're forcing
        //   // process.stdin to UTF8 encoding to at least make stdin reading compatible
        //   // with text files until FS.init can be refactored.
        //   process['stdin']['setEncoding']('utf8');
        // }
      },shutdown:function () {
        // https://github.com/kripken/emscripten/pull/1555
        // if (ENVIRONMENT_IS_NODE) {
        //   // inolen: any idea as to why node -e 'process.stdin.read()' wouldn't exit immediately (with process.stdin being a tty)?
        //   // isaacs: because now it's reading from the stream, you've expressed interest in it, so that read() kicks off a _read() which creates a ReadReq operation
        //   // inolen: I thought read() in that case was a synchronous operation that just grabbed some amount of buffered data if it exists?
        //   // isaacs: it is. but it also triggers a _read() call, which calls readStart() on the handle
        //   // isaacs: do process.stdin.pause() and i'd think it'd probably close the pending call
        //   process['stdin']['pause']();
        // }
      },register:function (dev, ops) {
        TTY.ttys[dev] = { input: [], output: [], ops: ops };
        FS.registerDevice(dev, TTY.stream_ops);
      },stream_ops:{open:function (stream) {
          var tty = TTY.ttys[stream.node.rdev];
          if (!tty) {
            throw new FS.ErrnoError(ERRNO_CODES.ENODEV);
          }
          stream.tty = tty;
          stream.seekable = false;
        },close:function (stream) {
          // flush any pending line data
          stream.tty.ops.flush(stream.tty);
        },flush:function (stream) {
          stream.tty.ops.flush(stream.tty);
        },read:function (stream, buffer, offset, length, pos /* ignored */) {
          if (!stream.tty || !stream.tty.ops.get_char) {
            throw new FS.ErrnoError(ERRNO_CODES.ENXIO);
          }
          var bytesRead = 0;
          for (var i = 0; i < length; i++) {
            var result;
            try {
              result = stream.tty.ops.get_char(stream.tty);
            } catch (e) {
              throw new FS.ErrnoError(ERRNO_CODES.EIO);
            }
            if (result === undefined && bytesRead === 0) {
              throw new FS.ErrnoError(ERRNO_CODES.EAGAIN);
            }
            if (result === null || result === undefined) break;
            bytesRead++;
            buffer[offset+i] = result;
          }
          if (bytesRead) {
            stream.node.timestamp = Date.now();
          }
          return bytesRead;
        },write:function (stream, buffer, offset, length, pos) {
          if (!stream.tty || !stream.tty.ops.put_char) {
            throw new FS.ErrnoError(ERRNO_CODES.ENXIO);
          }
          for (var i = 0; i < length; i++) {
            try {
              stream.tty.ops.put_char(stream.tty, buffer[offset+i]);
            } catch (e) {
              throw new FS.ErrnoError(ERRNO_CODES.EIO);
            }
          }
          if (length) {
            stream.node.timestamp = Date.now();
          }
          return i;
        }},default_tty_ops:{get_char:function (tty) {
          if (!tty.input.length) {
            var result = null;
            if (ENVIRONMENT_IS_NODE) {
              // we will read data by chunks of BUFSIZE
              var BUFSIZE = 256;
              var buf = new Buffer(BUFSIZE);
              var bytesRead = 0;
  
              var isPosixPlatform = (process.platform != 'win32'); // Node doesn't offer a direct check, so test by exclusion
  
              var fd = process.stdin.fd;
              if (isPosixPlatform) {
                // Linux and Mac cannot use process.stdin.fd (which isn't set up as sync)
                var usingDevice = false;
                try {
                  fd = fs.openSync('/dev/stdin', 'r');
                  usingDevice = true;
                } catch (e) {}
              }
  
              try {
                bytesRead = fs.readSync(fd, buf, 0, BUFSIZE, null);
              } catch(e) {
                // Cross-platform differences: on Windows, reading EOF throws an exception, but on other OSes,
                // reading EOF returns 0. Uniformize behavior by treating the EOF exception to return 0.
                if (e.toString().indexOf('EOF') != -1) bytesRead = 0;
                else throw e;
              }
  
              if (usingDevice) { fs.closeSync(fd); }
              if (bytesRead > 0) {
                result = buf.slice(0, bytesRead).toString('utf-8');
              } else {
                result = null;
              }
  
            } else if (typeof window != 'undefined' &&
              typeof window.prompt == 'function') {
              // Browser.
              result = window.prompt('Input: ');  // returns null on cancel
              if (result !== null) {
                result += '\n';
              }
            } else if (typeof readline == 'function') {
              // Command line.
              result = readline();
              if (result !== null) {
                result += '\n';
              }
            }
            if (!result) {
              return null;
            }
            tty.input = intArrayFromString(result, true);
          }
          return tty.input.shift();
        },put_char:function (tty, val) {
          if (val === null || val === 10) {
            Module['print'](UTF8ArrayToString(tty.output, 0));
            tty.output = [];
          } else {
            if (val != 0) tty.output.push(val); // val == 0 would cut text output off in the middle.
          }
        },flush:function (tty) {
          if (tty.output && tty.output.length > 0) {
            Module['print'](UTF8ArrayToString(tty.output, 0));
            tty.output = [];
          }
        }},default_tty1_ops:{put_char:function (tty, val) {
          if (val === null || val === 10) {
            Module['printErr'](UTF8ArrayToString(tty.output, 0));
            tty.output = [];
          } else {
            if (val != 0) tty.output.push(val);
          }
        },flush:function (tty) {
          if (tty.output && tty.output.length > 0) {
            Module['printErr'](UTF8ArrayToString(tty.output, 0));
            tty.output = [];
          }
        }}};
  
  var MEMFS={ops_table:null,mount:function (mount) {
        return MEMFS.createNode(null, '/', 16384 | 511 /* 0777 */, 0);
      },createNode:function (parent, name, mode, dev) {
        if (FS.isBlkdev(mode) || FS.isFIFO(mode)) {
          // no supported
          throw new FS.ErrnoError(ERRNO_CODES.EPERM);
        }
        if (!MEMFS.ops_table) {
          MEMFS.ops_table = {
            dir: {
              node: {
                getattr: MEMFS.node_ops.getattr,
                setattr: MEMFS.node_ops.setattr,
                lookup: MEMFS.node_ops.lookup,
                mknod: MEMFS.node_ops.mknod,
                rename: MEMFS.node_ops.rename,
                unlink: MEMFS.node_ops.unlink,
                rmdir: MEMFS.node_ops.rmdir,
                readdir: MEMFS.node_ops.readdir,
                symlink: MEMFS.node_ops.symlink
              },
              stream: {
                llseek: MEMFS.stream_ops.llseek
              }
            },
            file: {
              node: {
                getattr: MEMFS.node_ops.getattr,
                setattr: MEMFS.node_ops.setattr
              },
              stream: {
                llseek: MEMFS.stream_ops.llseek,
                read: MEMFS.stream_ops.read,
                write: MEMFS.stream_ops.write,
                allocate: MEMFS.stream_ops.allocate,
                mmap: MEMFS.stream_ops.mmap,
                msync: MEMFS.stream_ops.msync
              }
            },
            link: {
              node: {
                getattr: MEMFS.node_ops.getattr,
                setattr: MEMFS.node_ops.setattr,
                readlink: MEMFS.node_ops.readlink
              },
              stream: {}
            },
            chrdev: {
              node: {
                getattr: MEMFS.node_ops.getattr,
                setattr: MEMFS.node_ops.setattr
              },
              stream: FS.chrdev_stream_ops
            }
          };
        }
        var node = FS.createNode(parent, name, mode, dev);
        if (FS.isDir(node.mode)) {
          node.node_ops = MEMFS.ops_table.dir.node;
          node.stream_ops = MEMFS.ops_table.dir.stream;
          node.contents = {};
        } else if (FS.isFile(node.mode)) {
          node.node_ops = MEMFS.ops_table.file.node;
          node.stream_ops = MEMFS.ops_table.file.stream;
          node.usedBytes = 0; // The actual number of bytes used in the typed array, as opposed to contents.length which gives the whole capacity.
          // When the byte data of the file is populated, this will point to either a typed array, or a normal JS array. Typed arrays are preferred
          // for performance, and used by default. However, typed arrays are not resizable like normal JS arrays are, so there is a small disk size
          // penalty involved for appending file writes that continuously grow a file similar to std::vector capacity vs used -scheme.
          node.contents = null; 
        } else if (FS.isLink(node.mode)) {
          node.node_ops = MEMFS.ops_table.link.node;
          node.stream_ops = MEMFS.ops_table.link.stream;
        } else if (FS.isChrdev(node.mode)) {
          node.node_ops = MEMFS.ops_table.chrdev.node;
          node.stream_ops = MEMFS.ops_table.chrdev.stream;
        }
        node.timestamp = Date.now();
        // add the new node to the parent
        if (parent) {
          parent.contents[name] = node;
        }
        return node;
      },getFileDataAsRegularArray:function (node) {
        if (node.contents && node.contents.subarray) {
          var arr = [];
          for (var i = 0; i < node.usedBytes; ++i) arr.push(node.contents[i]);
          return arr; // Returns a copy of the original data.
        }
        return node.contents; // No-op, the file contents are already in a JS array. Return as-is.
      },getFileDataAsTypedArray:function (node) {
        if (!node.contents) return new Uint8Array;
        if (node.contents.subarray) return node.contents.subarray(0, node.usedBytes); // Make sure to not return excess unused bytes.
        return new Uint8Array(node.contents);
      },expandFileStorage:function (node, newCapacity) {
        // If we are asked to expand the size of a file that already exists, revert to using a standard JS array to store the file
        // instead of a typed array. This makes resizing the array more flexible because we can just .push() elements at the back to
        // increase the size.
        if (node.contents && node.contents.subarray && newCapacity > node.contents.length) {
          node.contents = MEMFS.getFileDataAsRegularArray(node);
          node.usedBytes = node.contents.length; // We might be writing to a lazy-loaded file which had overridden this property, so force-reset it.
        }
  
        if (!node.contents || node.contents.subarray) { // Keep using a typed array if creating a new storage, or if old one was a typed array as well.
          var prevCapacity = node.contents ? node.contents.length : 0;
          if (prevCapacity >= newCapacity) return; // No need to expand, the storage was already large enough.
          // Don't expand strictly to the given requested limit if it's only a very small increase, but instead geometrically grow capacity.
          // For small filesizes (<1MB), perform size*2 geometric increase, but for large sizes, do a much more conservative size*1.125 increase to
          // avoid overshooting the allocation cap by a very large margin.
          var CAPACITY_DOUBLING_MAX = 1024 * 1024;
          newCapacity = Math.max(newCapacity, (prevCapacity * (prevCapacity < CAPACITY_DOUBLING_MAX ? 2.0 : 1.125)) | 0);
          if (prevCapacity != 0) newCapacity = Math.max(newCapacity, 256); // At minimum allocate 256b for each file when expanding.
          var oldContents = node.contents;
          node.contents = new Uint8Array(newCapacity); // Allocate new storage.
          if (node.usedBytes > 0) node.contents.set(oldContents.subarray(0, node.usedBytes), 0); // Copy old data over to the new storage.
          return;
        }
        // Not using a typed array to back the file storage. Use a standard JS array instead.
        if (!node.contents && newCapacity > 0) node.contents = [];
        while (node.contents.length < newCapacity) node.contents.push(0);
      },resizeFileStorage:function (node, newSize) {
        if (node.usedBytes == newSize) return;
        if (newSize == 0) {
          node.contents = null; // Fully decommit when requesting a resize to zero.
          node.usedBytes = 0;
          return;
        }
        if (!node.contents || node.contents.subarray) { // Resize a typed array if that is being used as the backing store.
          var oldContents = node.contents;
          node.contents = new Uint8Array(new ArrayBuffer(newSize)); // Allocate new storage.
          if (oldContents) {
            node.contents.set(oldContents.subarray(0, Math.min(newSize, node.usedBytes))); // Copy old data over to the new storage.
          }
          node.usedBytes = newSize;
          return;
        }
        // Backing with a JS array.
        if (!node.contents) node.contents = [];
        if (node.contents.length > newSize) node.contents.length = newSize;
        else while (node.contents.length < newSize) node.contents.push(0);
        node.usedBytes = newSize;
      },node_ops:{getattr:function (node) {
          var attr = {};
          // device numbers reuse inode numbers.
          attr.dev = FS.isChrdev(node.mode) ? node.id : 1;
          attr.ino = node.id;
          attr.mode = node.mode;
          attr.nlink = 1;
          attr.uid = 0;
          attr.gid = 0;
          attr.rdev = node.rdev;
          if (FS.isDir(node.mode)) {
            attr.size = 4096;
          } else if (FS.isFile(node.mode)) {
            attr.size = node.usedBytes;
          } else if (FS.isLink(node.mode)) {
            attr.size = node.link.length;
          } else {
            attr.size = 0;
          }
          attr.atime = new Date(node.timestamp);
          attr.mtime = new Date(node.timestamp);
          attr.ctime = new Date(node.timestamp);
          // NOTE: In our implementation, st_blocks = Math.ceil(st_size/st_blksize),
          //       but this is not required by the standard.
          attr.blksize = 4096;
          attr.blocks = Math.ceil(attr.size / attr.blksize);
          return attr;
        },setattr:function (node, attr) {
          if (attr.mode !== undefined) {
            node.mode = attr.mode;
          }
          if (attr.timestamp !== undefined) {
            node.timestamp = attr.timestamp;
          }
          if (attr.size !== undefined) {
            MEMFS.resizeFileStorage(node, attr.size);
          }
        },lookup:function (parent, name) {
          throw FS.genericErrors[ERRNO_CODES.ENOENT];
        },mknod:function (parent, name, mode, dev) {
          return MEMFS.createNode(parent, name, mode, dev);
        },rename:function (old_node, new_dir, new_name) {
          // if we're overwriting a directory at new_name, make sure it's empty.
          if (FS.isDir(old_node.mode)) {
            var new_node;
            try {
              new_node = FS.lookupNode(new_dir, new_name);
            } catch (e) {
            }
            if (new_node) {
              for (var i in new_node.contents) {
                throw new FS.ErrnoError(ERRNO_CODES.ENOTEMPTY);
              }
            }
          }
          // do the internal rewiring
          delete old_node.parent.contents[old_node.name];
          old_node.name = new_name;
          new_dir.contents[new_name] = old_node;
          old_node.parent = new_dir;
        },unlink:function (parent, name) {
          delete parent.contents[name];
        },rmdir:function (parent, name) {
          var node = FS.lookupNode(parent, name);
          for (var i in node.contents) {
            throw new FS.ErrnoError(ERRNO_CODES.ENOTEMPTY);
          }
          delete parent.contents[name];
        },readdir:function (node) {
          var entries = ['.', '..']
          for (var key in node.contents) {
            if (!node.contents.hasOwnProperty(key)) {
              continue;
            }
            entries.push(key);
          }
          return entries;
        },symlink:function (parent, newname, oldpath) {
          var node = MEMFS.createNode(parent, newname, 511 /* 0777 */ | 40960, 0);
          node.link = oldpath;
          return node;
        },readlink:function (node) {
          if (!FS.isLink(node.mode)) {
            throw new FS.ErrnoError(ERRNO_CODES.EINVAL);
          }
          return node.link;
        }},stream_ops:{read:function (stream, buffer, offset, length, position) {
          var contents = stream.node.contents;
          if (position >= stream.node.usedBytes) return 0;
          var size = Math.min(stream.node.usedBytes - position, length);
          assert(size >= 0);
          if (size > 8 && contents.subarray) { // non-trivial, and typed array
            buffer.set(contents.subarray(position, position + size), offset);
          } else {
            for (var i = 0; i < size; i++) buffer[offset + i] = contents[position + i];
          }
          return size;
        },write:function (stream, buffer, offset, length, position, canOwn) {
          if (!length) return 0;
          var node = stream.node;
          node.timestamp = Date.now();
  
          if (buffer.subarray && (!node.contents || node.contents.subarray)) { // This write is from a typed array to a typed array?
            if (canOwn) {
              assert(position === 0, 'canOwn must imply no weird position inside the file');
              node.contents = buffer.subarray(offset, offset + length);
              node.usedBytes = length;
              return length;
            } else if (node.usedBytes === 0 && position === 0) { // If this is a simple first write to an empty file, do a fast set since we don't need to care about old data.
              node.contents = new Uint8Array(buffer.subarray(offset, offset + length));
              node.usedBytes = length;
              return length;
            } else if (position + length <= node.usedBytes) { // Writing to an already allocated and used subrange of the file?
              node.contents.set(buffer.subarray(offset, offset + length), position);
              return length;
            }
          }
  
          // Appending to an existing file and we need to reallocate, or source data did not come as a typed array.
          MEMFS.expandFileStorage(node, position+length);
          if (node.contents.subarray && buffer.subarray) node.contents.set(buffer.subarray(offset, offset + length), position); // Use typed array write if available.
          else {
            for (var i = 0; i < length; i++) {
             node.contents[position + i] = buffer[offset + i]; // Or fall back to manual write if not.
            }
          }
          node.usedBytes = Math.max(node.usedBytes, position+length);
          return length;
        },llseek:function (stream, offset, whence) {
          var position = offset;
          if (whence === 1) {  // SEEK_CUR.
            position += stream.position;
          } else if (whence === 2) {  // SEEK_END.
            if (FS.isFile(stream.node.mode)) {
              position += stream.node.usedBytes;
            }
          }
          if (position < 0) {
            throw new FS.ErrnoError(ERRNO_CODES.EINVAL);
          }
          return position;
        },allocate:function (stream, offset, length) {
          MEMFS.expandFileStorage(stream.node, offset + length);
          stream.node.usedBytes = Math.max(stream.node.usedBytes, offset + length);
        },mmap:function (stream, buffer, offset, length, position, prot, flags) {
          if (!FS.isFile(stream.node.mode)) {
            throw new FS.ErrnoError(ERRNO_CODES.ENODEV);
          }
          var ptr;
          var allocated;
          var contents = stream.node.contents;
          // Only make a new copy when MAP_PRIVATE is specified.
          if ( !(flags & 2) &&
                (contents.buffer === buffer || contents.buffer === buffer.buffer) ) {
            // We can't emulate MAP_SHARED when the file is not backed by the buffer
            // we're mapping to (e.g. the HEAP buffer).
            allocated = false;
            ptr = contents.byteOffset;
          } else {
            // Try to avoid unnecessary slices.
            if (position > 0 || position + length < stream.node.usedBytes) {
              if (contents.subarray) {
                contents = contents.subarray(position, position + length);
              } else {
                contents = Array.prototype.slice.call(contents, position, position + length);
              }
            }
            allocated = true;
            ptr = _malloc(length);
            if (!ptr) {
              throw new FS.ErrnoError(ERRNO_CODES.ENOMEM);
            }
            buffer.set(contents, ptr);
          }
          return { ptr: ptr, allocated: allocated };
        },msync:function (stream, buffer, offset, length, mmapFlags) {
          if (!FS.isFile(stream.node.mode)) {
            throw new FS.ErrnoError(ERRNO_CODES.ENODEV);
          }
          if (mmapFlags & 2) {
            // MAP_PRIVATE calls need not to be synced back to underlying fs
            return 0;
          }
  
          var bytesWritten = MEMFS.stream_ops.write(stream, buffer, 0, length, offset, false);
          // should we check if bytesWritten and length are the same?
          return 0;
        }}};
  
  var IDBFS={dbs:{},indexedDB:function () {
        if (typeof indexedDB !== 'undefined') return indexedDB;
        var ret = null;
        if (typeof window === 'object') ret = window.indexedDB || window.mozIndexedDB || window.webkitIndexedDB || window.msIndexedDB;
        assert(ret, 'IDBFS used, but indexedDB not supported');
        return ret;
      },DB_VERSION:21,DB_STORE_NAME:"FILE_DATA",mount:function (mount) {
        // reuse all of the core MEMFS functionality
        return MEMFS.mount.apply(null, arguments);
      },syncfs:function (mount, populate, callback) {
        IDBFS.getLocalSet(mount, function(err, local) {
          if (err) return callback(err);
  
          IDBFS.getRemoteSet(mount, function(err, remote) {
            if (err) return callback(err);
  
            var src = populate ? remote : local;
            var dst = populate ? local : remote;
  
            IDBFS.reconcile(src, dst, callback);
          });
        });
      },getDB:function (name, callback) {
        // check the cache first
        var db = IDBFS.dbs[name];
        if (db) {
          return callback(null, db);
        }
  
        var req;
        try {
          req = IDBFS.indexedDB().open(name, IDBFS.DB_VERSION);
        } catch (e) {
          return callback(e);
        }
        if (!req) {
          return callback("Unable to connect to IndexedDB");
        }
        req.onupgradeneeded = function(e) {
          var db = e.target.result;
          var transaction = e.target.transaction;
  
          var fileStore;
  
          if (db.objectStoreNames.contains(IDBFS.DB_STORE_NAME)) {
            fileStore = transaction.objectStore(IDBFS.DB_STORE_NAME);
          } else {
            fileStore = db.createObjectStore(IDBFS.DB_STORE_NAME);
          }
  
          if (!fileStore.indexNames.contains('timestamp')) {
            fileStore.createIndex('timestamp', 'timestamp', { unique: false });
          }
        };
        req.onsuccess = function() {
          db = req.result;
  
          // add to the cache
          IDBFS.dbs[name] = db;
          callback(null, db);
        };
        req.onerror = function(e) {
          callback(this.error);
          e.preventDefault();
        };
      },getLocalSet:function (mount, callback) {
        var entries = {};
  
        function isRealDir(p) {
          return p !== '.' && p !== '..';
        };
        function toAbsolute(root) {
          return function(p) {
            return PATH.join2(root, p);
          }
        };
  
        var check = FS.readdir(mount.mountpoint).filter(isRealDir).map(toAbsolute(mount.mountpoint));
  
        while (check.length) {
          var path = check.pop();
          var stat;
  
          try {
            stat = FS.stat(path);
          } catch (e) {
            return callback(e);
          }
  
          if (FS.isDir(stat.mode)) {
            check.push.apply(check, FS.readdir(path).filter(isRealDir).map(toAbsolute(path)));
          }
  
          entries[path] = { timestamp: stat.mtime };
        }
  
        return callback(null, { type: 'local', entries: entries });
      },getRemoteSet:function (mount, callback) {
        var entries = {};
  
        IDBFS.getDB(mount.mountpoint, function(err, db) {
          if (err) return callback(err);
  
          var transaction = db.transaction([IDBFS.DB_STORE_NAME], 'readonly');
          transaction.onerror = function(e) {
            callback(this.error);
            e.preventDefault();
          };
  
          var store = transaction.objectStore(IDBFS.DB_STORE_NAME);
          var index = store.index('timestamp');
  
          index.openKeyCursor().onsuccess = function(event) {
            var cursor = event.target.result;
  
            if (!cursor) {
              return callback(null, { type: 'remote', db: db, entries: entries });
            }
  
            entries[cursor.primaryKey] = { timestamp: cursor.key };
  
            cursor.continue();
          };
        });
      },loadLocalEntry:function (path, callback) {
        var stat, node;
  
        try {
          var lookup = FS.lookupPath(path);
          node = lookup.node;
          stat = FS.stat(path);
        } catch (e) {
          return callback(e);
        }
  
        if (FS.isDir(stat.mode)) {
          return callback(null, { timestamp: stat.mtime, mode: stat.mode });
        } else if (FS.isFile(stat.mode)) {
          // Performance consideration: storing a normal JavaScript array to a IndexedDB is much slower than storing a typed array.
          // Therefore always convert the file contents to a typed array first before writing the data to IndexedDB.
          node.contents = MEMFS.getFileDataAsTypedArray(node);
          return callback(null, { timestamp: stat.mtime, mode: stat.mode, contents: node.contents });
        } else {
          return callback(new Error('node type not supported'));
        }
      },storeLocalEntry:function (path, entry, callback) {
        try {
          if (FS.isDir(entry.mode)) {
            FS.mkdir(path, entry.mode);
          } else if (FS.isFile(entry.mode)) {
            FS.writeFile(path, entry.contents, { encoding: 'binary', canOwn: true });
          } else {
            return callback(new Error('node type not supported'));
          }
  
          FS.chmod(path, entry.mode);
          FS.utime(path, entry.timestamp, entry.timestamp);
        } catch (e) {
          return callback(e);
        }
  
        callback(null);
      },removeLocalEntry:function (path, callback) {
        try {
          var lookup = FS.lookupPath(path);
          var stat = FS.stat(path);
  
          if (FS.isDir(stat.mode)) {
            FS.rmdir(path);
          } else if (FS.isFile(stat.mode)) {
            FS.unlink(path);
          }
        } catch (e) {
          return callback(e);
        }
  
        callback(null);
      },loadRemoteEntry:function (store, path, callback) {
        var req = store.get(path);
        req.onsuccess = function(event) { callback(null, event.target.result); };
        req.onerror = function(e) {
          callback(this.error);
          e.preventDefault();
        };
      },storeRemoteEntry:function (store, path, entry, callback) {
        var req = store.put(entry, path);
        req.onsuccess = function() { callback(null); };
        req.onerror = function(e) {
          callback(this.error);
          e.preventDefault();
        };
      },removeRemoteEntry:function (store, path, callback) {
        var req = store.delete(path);
        req.onsuccess = function() { callback(null); };
        req.onerror = function(e) {
          callback(this.error);
          e.preventDefault();
        };
      },reconcile:function (src, dst, callback) {
        var total = 0;
  
        var create = [];
        Object.keys(src.entries).forEach(function (key) {
          var e = src.entries[key];
          var e2 = dst.entries[key];
          if (!e2 || e.timestamp > e2.timestamp) {
            create.push(key);
            total++;
          }
        });
  
        var remove = [];
        Object.keys(dst.entries).forEach(function (key) {
          var e = dst.entries[key];
          var e2 = src.entries[key];
          if (!e2) {
            remove.push(key);
            total++;
          }
        });
  
        if (!total) {
          return callback(null);
        }
  
        var errored = false;
        var completed = 0;
        var db = src.type === 'remote' ? src.db : dst.db;
        var transaction = db.transaction([IDBFS.DB_STORE_NAME], 'readwrite');
        var store = transaction.objectStore(IDBFS.DB_STORE_NAME);
  
        function done(err) {
          if (err) {
            if (!done.errored) {
              done.errored = true;
              return callback(err);
            }
            return;
          }
          if (++completed >= total) {
            return callback(null);
          }
        };
  
        transaction.onerror = function(e) {
          done(this.error);
          e.preventDefault();
        };
  
        // sort paths in ascending order so directory entries are created
        // before the files inside them
        create.sort().forEach(function (path) {
          if (dst.type === 'local') {
            IDBFS.loadRemoteEntry(store, path, function (err, entry) {
              if (err) return done(err);
              IDBFS.storeLocalEntry(path, entry, done);
            });
          } else {
            IDBFS.loadLocalEntry(path, function (err, entry) {
              if (err) return done(err);
              IDBFS.storeRemoteEntry(store, path, entry, done);
            });
          }
        });
  
        // sort paths in descending order so files are deleted before their
        // parent directories
        remove.sort().reverse().forEach(function(path) {
          if (dst.type === 'local') {
            IDBFS.removeLocalEntry(path, done);
          } else {
            IDBFS.removeRemoteEntry(store, path, done);
          }
        });
      }};
  
  var NODEFS={isWindows:false,staticInit:function () {
        NODEFS.isWindows = !!process.platform.match(/^win/);
      },mount:function (mount) {
        assert(ENVIRONMENT_IS_NODE);
        return NODEFS.createNode(null, '/', NODEFS.getMode(mount.opts.root), 0);
      },createNode:function (parent, name, mode, dev) {
        if (!FS.isDir(mode) && !FS.isFile(mode) && !FS.isLink(mode)) {
          throw new FS.ErrnoError(ERRNO_CODES.EINVAL);
        }
        var node = FS.createNode(parent, name, mode);
        node.node_ops = NODEFS.node_ops;
        node.stream_ops = NODEFS.stream_ops;
        return node;
      },getMode:function (path) {
        var stat;
        try {
          stat = fs.lstatSync(path);
          if (NODEFS.isWindows) {
            // On Windows, directories return permission bits 'rw-rw-rw-', even though they have 'rwxrwxrwx', so
            // propagate write bits to execute bits.
            stat.mode = stat.mode | ((stat.mode & 146) >> 1);
          }
        } catch (e) {
          if (!e.code) throw e;
          throw new FS.ErrnoError(ERRNO_CODES[e.code]);
        }
        return stat.mode;
      },realPath:function (node) {
        var parts = [];
        while (node.parent !== node) {
          parts.push(node.name);
          node = node.parent;
        }
        parts.push(node.mount.opts.root);
        parts.reverse();
        return PATH.join.apply(null, parts);
      },flagsToPermissionStringMap:{0:"r",1:"r+",2:"r+",64:"r",65:"r+",66:"r+",129:"rx+",193:"rx+",514:"w+",577:"w",578:"w+",705:"wx",706:"wx+",1024:"a",1025:"a",1026:"a+",1089:"a",1090:"a+",1153:"ax",1154:"ax+",1217:"ax",1218:"ax+",4096:"rs",4098:"rs+"},flagsToPermissionString:function (flags) {
        flags &= ~0x200000 /*O_PATH*/; // Ignore this flag from musl, otherwise node.js fails to open the file.
        flags &= ~0x800 /*O_NONBLOCK*/; // Ignore this flag from musl, otherwise node.js fails to open the file.
        flags &= ~0x8000 /*O_LARGEFILE*/; // Ignore this flag from musl, otherwise node.js fails to open the file.
        flags &= ~0x80000 /*O_CLOEXEC*/; // Some applications may pass it; it makes no sense for a single process.
        if (flags in NODEFS.flagsToPermissionStringMap) {
          return NODEFS.flagsToPermissionStringMap[flags];
        } else {
          throw new FS.ErrnoError(ERRNO_CODES.EINVAL);
        }
      },node_ops:{getattr:function (node) {
          var path = NODEFS.realPath(node);
          var stat;
          try {
            stat = fs.lstatSync(path);
          } catch (e) {
            if (!e.code) throw e;
            throw new FS.ErrnoError(ERRNO_CODES[e.code]);
          }
          // node.js v0.10.20 doesn't report blksize and blocks on Windows. Fake them with default blksize of 4096.
          // See http://support.microsoft.com/kb/140365
          if (NODEFS.isWindows && !stat.blksize) {
            stat.blksize = 4096;
          }
          if (NODEFS.isWindows && !stat.blocks) {
            stat.blocks = (stat.size+stat.blksize-1)/stat.blksize|0;
          }
          return {
            dev: stat.dev,
            ino: stat.ino,
            mode: stat.mode,
            nlink: stat.nlink,
            uid: stat.uid,
            gid: stat.gid,
            rdev: stat.rdev,
            size: stat.size,
            atime: stat.atime,
            mtime: stat.mtime,
            ctime: stat.ctime,
            blksize: stat.blksize,
            blocks: stat.blocks
          };
        },setattr:function (node, attr) {
          var path = NODEFS.realPath(node);
          try {
            if (attr.mode !== undefined) {
              fs.chmodSync(path, attr.mode);
              // update the common node structure mode as well
              node.mode = attr.mode;
            }
            if (attr.timestamp !== undefined) {
              var date = new Date(attr.timestamp);
              fs.utimesSync(path, date, date);
            }
            if (attr.size !== undefined) {
              fs.truncateSync(path, attr.size);
            }
          } catch (e) {
            if (!e.code) throw e;
            throw new FS.ErrnoError(ERRNO_CODES[e.code]);
          }
        },lookup:function (parent, name) {
          var path = PATH.join2(NODEFS.realPath(parent), name);
          var mode = NODEFS.getMode(path);
          return NODEFS.createNode(parent, name, mode);
        },mknod:function (parent, name, mode, dev) {
          var node = NODEFS.createNode(parent, name, mode, dev);
          // create the backing node for this in the fs root as well
          var path = NODEFS.realPath(node);
          try {
            if (FS.isDir(node.mode)) {
              fs.mkdirSync(path, node.mode);
            } else {
              fs.writeFileSync(path, '', { mode: node.mode });
            }
          } catch (e) {
            if (!e.code) throw e;
            throw new FS.ErrnoError(ERRNO_CODES[e.code]);
          }
          return node;
        },rename:function (oldNode, newDir, newName) {
          var oldPath = NODEFS.realPath(oldNode);
          var newPath = PATH.join2(NODEFS.realPath(newDir), newName);
          try {
            fs.renameSync(oldPath, newPath);
          } catch (e) {
            if (!e.code) throw e;
            throw new FS.ErrnoError(ERRNO_CODES[e.code]);
          }
        },unlink:function (parent, name) {
          var path = PATH.join2(NODEFS.realPath(parent), name);
          try {
            fs.unlinkSync(path);
          } catch (e) {
            if (!e.code) throw e;
            throw new FS.ErrnoError(ERRNO_CODES[e.code]);
          }
        },rmdir:function (parent, name) {
          var path = PATH.join2(NODEFS.realPath(parent), name);
          try {
            fs.rmdirSync(path);
          } catch (e) {
            if (!e.code) throw e;
            throw new FS.ErrnoError(ERRNO_CODES[e.code]);
          }
        },readdir:function (node) {
          var path = NODEFS.realPath(node);
          try {
            return fs.readdirSync(path);
          } catch (e) {
            if (!e.code) throw e;
            throw new FS.ErrnoError(ERRNO_CODES[e.code]);
          }
        },symlink:function (parent, newName, oldPath) {
          var newPath = PATH.join2(NODEFS.realPath(parent), newName);
          try {
            fs.symlinkSync(oldPath, newPath);
          } catch (e) {
            if (!e.code) throw e;
            throw new FS.ErrnoError(ERRNO_CODES[e.code]);
          }
        },readlink:function (node) {
          var path = NODEFS.realPath(node);
          try {
            path = fs.readlinkSync(path);
            path = NODEJS_PATH.relative(NODEJS_PATH.resolve(node.mount.opts.root), path);
            return path;
          } catch (e) {
            if (!e.code) throw e;
            throw new FS.ErrnoError(ERRNO_CODES[e.code]);
          }
        }},stream_ops:{open:function (stream) {
          var path = NODEFS.realPath(stream.node);
          try {
            if (FS.isFile(stream.node.mode)) {
              stream.nfd = fs.openSync(path, NODEFS.flagsToPermissionString(stream.flags));
            }
          } catch (e) {
            if (!e.code) throw e;
            throw new FS.ErrnoError(ERRNO_CODES[e.code]);
          }
        },close:function (stream) {
          try {
            if (FS.isFile(stream.node.mode) && stream.nfd) {
              fs.closeSync(stream.nfd);
            }
          } catch (e) {
            if (!e.code) throw e;
            throw new FS.ErrnoError(ERRNO_CODES[e.code]);
          }
        },read:function (stream, buffer, offset, length, position) {
          if (length === 0) return 0; // node errors on 0 length reads
          // FIXME this is terrible.
          var nbuffer = new Buffer(length);
          var res;
          try {
            res = fs.readSync(stream.nfd, nbuffer, 0, length, position);
          } catch (e) {
            throw new FS.ErrnoError(ERRNO_CODES[e.code]);
          }
          if (res > 0) {
            for (var i = 0; i < res; i++) {
              buffer[offset + i] = nbuffer[i];
            }
          }
          return res;
        },write:function (stream, buffer, offset, length, position) {
          // FIXME this is terrible.
          var nbuffer = new Buffer(buffer.subarray(offset, offset + length));
          var res;
          try {
            res = fs.writeSync(stream.nfd, nbuffer, 0, length, position);
          } catch (e) {
            throw new FS.ErrnoError(ERRNO_CODES[e.code]);
          }
          return res;
        },llseek:function (stream, offset, whence) {
          var position = offset;
          if (whence === 1) {  // SEEK_CUR.
            position += stream.position;
          } else if (whence === 2) {  // SEEK_END.
            if (FS.isFile(stream.node.mode)) {
              try {
                var stat = fs.fstatSync(stream.nfd);
                position += stat.size;
              } catch (e) {
                throw new FS.ErrnoError(ERRNO_CODES[e.code]);
              }
            }
          }
  
          if (position < 0) {
            throw new FS.ErrnoError(ERRNO_CODES.EINVAL);
          }
  
          return position;
        }}};
  
  var WORKERFS={DIR_MODE:16895,FILE_MODE:33279,reader:null,mount:function (mount) {
        assert(ENVIRONMENT_IS_WORKER);
        if (!WORKERFS.reader) WORKERFS.reader = new FileReaderSync();
        var root = WORKERFS.createNode(null, '/', WORKERFS.DIR_MODE, 0);
        var createdParents = {};
        function ensureParent(path) {
          // return the parent node, creating subdirs as necessary
          var parts = path.split('/');
          var parent = root;
          for (var i = 0; i < parts.length-1; i++) {
            var curr = parts.slice(0, i+1).join('/');
            // Issue 4254: Using curr as a node name will prevent the node
            // from being found in FS.nameTable when FS.open is called on
            // a path which holds a child of this node,
            // given that all FS functions assume node names
            // are just their corresponding parts within their given path,
            // rather than incremental aggregates which include their parent's
            // directories.
            if (!createdParents[curr]) {
              createdParents[curr] = WORKERFS.createNode(parent, parts[i], WORKERFS.DIR_MODE, 0);
            }
            parent = createdParents[curr];
          }
          return parent;
        }
        function base(path) {
          var parts = path.split('/');
          return parts[parts.length-1];
        }
        // We also accept FileList here, by using Array.prototype
        Array.prototype.forEach.call(mount.opts["files"] || [], function(file) {
          WORKERFS.createNode(ensureParent(file.name), base(file.name), WORKERFS.FILE_MODE, 0, file, file.lastModifiedDate);
        });
        (mount.opts["blobs"] || []).forEach(function(obj) {
          WORKERFS.createNode(ensureParent(obj["name"]), base(obj["name"]), WORKERFS.FILE_MODE, 0, obj["data"]);
        });
        (mount.opts["packages"] || []).forEach(function(pack) {
          pack['metadata'].files.forEach(function(file) {
            var name = file.filename.substr(1); // remove initial slash
            WORKERFS.createNode(ensureParent(name), base(name), WORKERFS.FILE_MODE, 0, pack['blob'].slice(file.start, file.end));
          });
        });
        return root;
      },createNode:function (parent, name, mode, dev, contents, mtime) {
        var node = FS.createNode(parent, name, mode);
        node.mode = mode;
        node.node_ops = WORKERFS.node_ops;
        node.stream_ops = WORKERFS.stream_ops;
        node.timestamp = (mtime || new Date).getTime();
        assert(WORKERFS.FILE_MODE !== WORKERFS.DIR_MODE);
        if (mode === WORKERFS.FILE_MODE) {
          node.size = contents.size;
          node.contents = contents;
        } else {
          node.size = 4096;
          node.contents = {};
        }
        if (parent) {
          parent.contents[name] = node;
        }
        return node;
      },node_ops:{getattr:function (node) {
          return {
            dev: 1,
            ino: undefined,
            mode: node.mode,
            nlink: 1,
            uid: 0,
            gid: 0,
            rdev: undefined,
            size: node.size,
            atime: new Date(node.timestamp),
            mtime: new Date(node.timestamp),
            ctime: new Date(node.timestamp),
            blksize: 4096,
            blocks: Math.ceil(node.size / 4096),
          };
        },setattr:function (node, attr) {
          if (attr.mode !== undefined) {
            node.mode = attr.mode;
          }
          if (attr.timestamp !== undefined) {
            node.timestamp = attr.timestamp;
          }
        },lookup:function (parent, name) {
          throw new FS.ErrnoError(ERRNO_CODES.ENOENT);
        },mknod:function (parent, name, mode, dev) {
          throw new FS.ErrnoError(ERRNO_CODES.EPERM);
        },rename:function (oldNode, newDir, newName) {
          throw new FS.ErrnoError(ERRNO_CODES.EPERM);
        },unlink:function (parent, name) {
          throw new FS.ErrnoError(ERRNO_CODES.EPERM);
        },rmdir:function (parent, name) {
          throw new FS.ErrnoError(ERRNO_CODES.EPERM);
        },readdir:function (node) {
          var entries = ['.', '..'];
          for (var key in node.contents) {
            if (!node.contents.hasOwnProperty(key)) {
              continue;
            }
            entries.push(key);
          }
          return entries;
        },symlink:function (parent, newName, oldPath) {
          throw new FS.ErrnoError(ERRNO_CODES.EPERM);
        },readlink:function (node) {
          throw new FS.ErrnoError(ERRNO_CODES.EPERM);
        }},stream_ops:{read:function (stream, buffer, offset, length, position) {
          if (position >= stream.node.size) return 0;
          var chunk = stream.node.contents.slice(position, position + length);
          var ab = WORKERFS.reader.readAsArrayBuffer(chunk);
          buffer.set(new Uint8Array(ab), offset);
          return chunk.size;
        },write:function (stream, buffer, offset, length, position) {
          throw new FS.ErrnoError(ERRNO_CODES.EIO);
        },llseek:function (stream, offset, whence) {
          var position = offset;
          if (whence === 1) {  // SEEK_CUR.
            position += stream.position;
          } else if (whence === 2) {  // SEEK_END.
            if (FS.isFile(stream.node.mode)) {
              position += stream.node.size;
            }
          }
          if (position < 0) {
            throw new FS.ErrnoError(ERRNO_CODES.EINVAL);
          }
          return position;
        }}};
  
  var _stdin=STATICTOP; STATICTOP += 16;;
  
  var _stdout=STATICTOP; STATICTOP += 16;;
  
  var _stderr=STATICTOP; STATICTOP += 16;;var FS={root:null,mounts:[],devices:[null],streams:[],nextInode:1,nameTable:null,currentPath:"/",initialized:false,ignorePermissions:true,trackingDelegate:{},tracking:{openFlags:{READ:1,WRITE:2}},ErrnoError:null,genericErrors:{},filesystems:null,syncFSRequests:0,handleFSError:function (e) {
        if (!(e instanceof FS.ErrnoError)) throw e + ' : ' + stackTrace();
        return ___setErrNo(e.errno);
      },lookupPath:function (path, opts) {
        path = PATH.resolve(FS.cwd(), path);
        opts = opts || {};
  
        if (!path) return { path: '', node: null };
  
        var defaults = {
          follow_mount: true,
          recurse_count: 0
        };
        for (var key in defaults) {
          if (opts[key] === undefined) {
            opts[key] = defaults[key];
          }
        }
  
        if (opts.recurse_count > 8) {  // max recursive lookup of 8
          throw new FS.ErrnoError(ERRNO_CODES.ELOOP);
        }
  
        // split the path
        var parts = PATH.normalizeArray(path.split('/').filter(function(p) {
          return !!p;
        }), false);
  
        // start at the root
        var current = FS.root;
        var current_path = '/';
  
        for (var i = 0; i < parts.length; i++) {
          var islast = (i === parts.length-1);
          if (islast && opts.parent) {
            // stop resolving
            break;
          }
  
          current = FS.lookupNode(current, parts[i]);
          current_path = PATH.join2(current_path, parts[i]);
  
          // jump to the mount's root node if this is a mountpoint
          if (FS.isMountpoint(current)) {
            if (!islast || (islast && opts.follow_mount)) {
              current = current.mounted.root;
            }
          }
  
          // by default, lookupPath will not follow a symlink if it is the final path component.
          // setting opts.follow = true will override this behavior.
          if (!islast || opts.follow) {
            var count = 0;
            while (FS.isLink(current.mode)) {
              var link = FS.readlink(current_path);
              current_path = PATH.resolve(PATH.dirname(current_path), link);
  
              var lookup = FS.lookupPath(current_path, { recurse_count: opts.recurse_count });
              current = lookup.node;
  
              if (count++ > 40) {  // limit max consecutive symlinks to 40 (SYMLOOP_MAX).
                throw new FS.ErrnoError(ERRNO_CODES.ELOOP);
              }
            }
          }
        }
  
        return { path: current_path, node: current };
      },getPath:function (node) {
        var path;
        while (true) {
          if (FS.isRoot(node)) {
            var mount = node.mount.mountpoint;
            if (!path) return mount;
            return mount[mount.length-1] !== '/' ? mount + '/' + path : mount + path;
          }
          path = path ? node.name + '/' + path : node.name;
          node = node.parent;
        }
      },hashName:function (parentid, name) {
        var hash = 0;
  
  
        for (var i = 0; i < name.length; i++) {
          hash = ((hash << 5) - hash + name.charCodeAt(i)) | 0;
        }
        return ((parentid + hash) >>> 0) % FS.nameTable.length;
      },hashAddNode:function (node) {
        var hash = FS.hashName(node.parent.id, node.name);
        node.name_next = FS.nameTable[hash];
        FS.nameTable[hash] = node;
      },hashRemoveNode:function (node) {
        var hash = FS.hashName(node.parent.id, node.name);
        if (FS.nameTable[hash] === node) {
          FS.nameTable[hash] = node.name_next;
        } else {
          var current = FS.nameTable[hash];
          while (current) {
            if (current.name_next === node) {
              current.name_next = node.name_next;
              break;
            }
            current = current.name_next;
          }
        }
      },lookupNode:function (parent, name) {
        var err = FS.mayLookup(parent);
        if (err) {
          throw new FS.ErrnoError(err, parent);
        }
        var hash = FS.hashName(parent.id, name);
        for (var node = FS.nameTable[hash]; node; node = node.name_next) {
          var nodeName = node.name;
          if (node.parent.id === parent.id && nodeName === name) {
            return node;
          }
        }
        // if we failed to find it in the cache, call into the VFS
        return FS.lookup(parent, name);
      },createNode:function (parent, name, mode, rdev) {
        if (!FS.FSNode) {
          FS.FSNode = function(parent, name, mode, rdev) {
            if (!parent) {
              parent = this;  // root node sets parent to itself
            }
            this.parent = parent;
            this.mount = parent.mount;
            this.mounted = null;
            this.id = FS.nextInode++;
            this.name = name;
            this.mode = mode;
            this.node_ops = {};
            this.stream_ops = {};
            this.rdev = rdev;
          };
  
          FS.FSNode.prototype = {};
  
          // compatibility
          var readMode = 292 | 73;
          var writeMode = 146;
  
          // NOTE we must use Object.defineProperties instead of individual calls to
          // Object.defineProperty in order to make closure compiler happy
          Object.defineProperties(FS.FSNode.prototype, {
            read: {
              get: function() { return (this.mode & readMode) === readMode; },
              set: function(val) { val ? this.mode |= readMode : this.mode &= ~readMode; }
            },
            write: {
              get: function() { return (this.mode & writeMode) === writeMode; },
              set: function(val) { val ? this.mode |= writeMode : this.mode &= ~writeMode; }
            },
            isFolder: {
              get: function() { return FS.isDir(this.mode); }
            },
            isDevice: {
              get: function() { return FS.isChrdev(this.mode); }
            }
          });
        }
  
        var node = new FS.FSNode(parent, name, mode, rdev);
  
        FS.hashAddNode(node);
  
        return node;
      },destroyNode:function (node) {
        FS.hashRemoveNode(node);
      },isRoot:function (node) {
        return node === node.parent;
      },isMountpoint:function (node) {
        return !!node.mounted;
      },isFile:function (mode) {
        return (mode & 61440) === 32768;
      },isDir:function (mode) {
        return (mode & 61440) === 16384;
      },isLink:function (mode) {
        return (mode & 61440) === 40960;
      },isChrdev:function (mode) {
        return (mode & 61440) === 8192;
      },isBlkdev:function (mode) {
        return (mode & 61440) === 24576;
      },isFIFO:function (mode) {
        return (mode & 61440) === 4096;
      },isSocket:function (mode) {
        return (mode & 49152) === 49152;
      },flagModes:{"r":0,"rs":1052672,"r+":2,"w":577,"wx":705,"xw":705,"w+":578,"wx+":706,"xw+":706,"a":1089,"ax":1217,"xa":1217,"a+":1090,"ax+":1218,"xa+":1218},modeStringToFlags:function (str) {
        var flags = FS.flagModes[str];
        if (typeof flags === 'undefined') {
          throw new Error('Unknown file open mode: ' + str);
        }
        return flags;
      },flagsToPermissionString:function (flag) {
        var perms = ['r', 'w', 'rw'][flag & 3];
        if ((flag & 512)) {
          perms += 'w';
        }
        return perms;
      },nodePermissions:function (node, perms) {
        if (FS.ignorePermissions) {
          return 0;
        }
        // return 0 if any user, group or owner bits are set.
        if (perms.indexOf('r') !== -1 && !(node.mode & 292)) {
          return ERRNO_CODES.EACCES;
        } else if (perms.indexOf('w') !== -1 && !(node.mode & 146)) {
          return ERRNO_CODES.EACCES;
        } else if (perms.indexOf('x') !== -1 && !(node.mode & 73)) {
          return ERRNO_CODES.EACCES;
        }
        return 0;
      },mayLookup:function (dir) {
        var err = FS.nodePermissions(dir, 'x');
        if (err) return err;
        if (!dir.node_ops.lookup) return ERRNO_CODES.EACCES;
        return 0;
      },mayCreate:function (dir, name) {
        try {
          var node = FS.lookupNode(dir, name);
          return ERRNO_CODES.EEXIST;
        } catch (e) {
        }
        return FS.nodePermissions(dir, 'wx');
      },mayDelete:function (dir, name, isdir) {
        var node;
        try {
          node = FS.lookupNode(dir, name);
        } catch (e) {
          return e.errno;
        }
        var err = FS.nodePermissions(dir, 'wx');
        if (err) {
          return err;
        }
        if (isdir) {
          if (!FS.isDir(node.mode)) {
            return ERRNO_CODES.ENOTDIR;
          }
          if (FS.isRoot(node) || FS.getPath(node) === FS.cwd()) {
            return ERRNO_CODES.EBUSY;
          }
        } else {
          if (FS.isDir(node.mode)) {
            return ERRNO_CODES.EISDIR;
          }
        }
        return 0;
      },mayOpen:function (node, flags) {
        if (!node) {
          return ERRNO_CODES.ENOENT;
        }
        if (FS.isLink(node.mode)) {
          return ERRNO_CODES.ELOOP;
        } else if (FS.isDir(node.mode)) {
          if (FS.flagsToPermissionString(flags) !== 'r' || // opening for write
              (flags & 512)) { // TODO: check for O_SEARCH? (== search for dir only)
            return ERRNO_CODES.EISDIR;
          }
        }
        return FS.nodePermissions(node, FS.flagsToPermissionString(flags));
      },MAX_OPEN_FDS:4096,nextfd:function (fd_start, fd_end) {
        fd_start = fd_start || 0;
        fd_end = fd_end || FS.MAX_OPEN_FDS;
        for (var fd = fd_start; fd <= fd_end; fd++) {
          if (!FS.streams[fd]) {
            return fd;
          }
        }
        throw new FS.ErrnoError(ERRNO_CODES.EMFILE);
      },getStream:function (fd) {
        return FS.streams[fd];
      },createStream:function (stream, fd_start, fd_end) {
        if (!FS.FSStream) {
          FS.FSStream = function(){};
          FS.FSStream.prototype = {};
          // compatibility
          Object.defineProperties(FS.FSStream.prototype, {
            object: {
              get: function() { return this.node; },
              set: function(val) { this.node = val; }
            },
            isRead: {
              get: function() { return (this.flags & 2097155) !== 1; }
            },
            isWrite: {
              get: function() { return (this.flags & 2097155) !== 0; }
            },
            isAppend: {
              get: function() { return (this.flags & 1024); }
            }
          });
        }
        // clone it, so we can return an instance of FSStream
        var newStream = new FS.FSStream();
        for (var p in stream) {
          newStream[p] = stream[p];
        }
        stream = newStream;
        var fd = FS.nextfd(fd_start, fd_end);
        stream.fd = fd;
        FS.streams[fd] = stream;
        return stream;
      },closeStream:function (fd) {
        FS.streams[fd] = null;
      },chrdev_stream_ops:{open:function (stream) {
          var device = FS.getDevice(stream.node.rdev);
          // override node's stream ops with the device's
          stream.stream_ops = device.stream_ops;
          // forward the open call
          if (stream.stream_ops.open) {
            stream.stream_ops.open(stream);
          }
        },llseek:function () {
          throw new FS.ErrnoError(ERRNO_CODES.ESPIPE);
        }},major:function (dev) {
        return ((dev) >> 8);
      },minor:function (dev) {
        return ((dev) & 0xff);
      },makedev:function (ma, mi) {
        return ((ma) << 8 | (mi));
      },registerDevice:function (dev, ops) {
        FS.devices[dev] = { stream_ops: ops };
      },getDevice:function (dev) {
        return FS.devices[dev];
      },getMounts:function (mount) {
        var mounts = [];
        var check = [mount];
  
        while (check.length) {
          var m = check.pop();
  
          mounts.push(m);
  
          check.push.apply(check, m.mounts);
        }
  
        return mounts;
      },syncfs:function (populate, callback) {
        if (typeof(populate) === 'function') {
          callback = populate;
          populate = false;
        }
  
        FS.syncFSRequests++;
  
        if (FS.syncFSRequests > 1) {
          console.log('warning: ' + FS.syncFSRequests + ' FS.syncfs operations in flight at once, probably just doing extra work');
        }
  
        var mounts = FS.getMounts(FS.root.mount);
        var completed = 0;
  
        function doCallback(err) {
          assert(FS.syncFSRequests > 0);
          FS.syncFSRequests--;
          return callback(err);
        }
  
        function done(err) {
          if (err) {
            if (!done.errored) {
              done.errored = true;
              return doCallback(err);
            }
            return;
          }
          if (++completed >= mounts.length) {
            doCallback(null);
          }
        };
  
        // sync all mounts
        mounts.forEach(function (mount) {
          if (!mount.type.syncfs) {
            return done(null);
          }
          mount.type.syncfs(mount, populate, done);
        });
      },mount:function (type, opts, mountpoint) {
        var root = mountpoint === '/';
        var pseudo = !mountpoint;
        var node;
  
        if (root && FS.root) {
          throw new FS.ErrnoError(ERRNO_CODES.EBUSY);
        } else if (!root && !pseudo) {
          var lookup = FS.lookupPath(mountpoint, { follow_mount: false });
  
          mountpoint = lookup.path;  // use the absolute path
          node = lookup.node;
  
          if (FS.isMountpoint(node)) {
            throw new FS.ErrnoError(ERRNO_CODES.EBUSY);
          }
  
          if (!FS.isDir(node.mode)) {
            throw new FS.ErrnoError(ERRNO_CODES.ENOTDIR);
          }
        }
  
        var mount = {
          type: type,
          opts: opts,
          mountpoint: mountpoint,
          mounts: []
        };
  
        // create a root node for the fs
        var mountRoot = type.mount(mount);
        mountRoot.mount = mount;
        mount.root = mountRoot;
  
        if (root) {
          FS.root = mountRoot;
        } else if (node) {
          // set as a mountpoint
          node.mounted = mount;
  
          // add the new mount to the current mount's children
          if (node.mount) {
            node.mount.mounts.push(mount);
          }
        }
  
        return mountRoot;
      },unmount:function (mountpoint) {
        var lookup = FS.lookupPath(mountpoint, { follow_mount: false });
  
        if (!FS.isMountpoint(lookup.node)) {
          throw new FS.ErrnoError(ERRNO_CODES.EINVAL);
        }
  
        // destroy the nodes for this mount, and all its child mounts
        var node = lookup.node;
        var mount = node.mounted;
        var mounts = FS.getMounts(mount);
  
        Object.keys(FS.nameTable).forEach(function (hash) {
          var current = FS.nameTable[hash];
  
          while (current) {
            var next = current.name_next;
  
            if (mounts.indexOf(current.mount) !== -1) {
              FS.destroyNode(current);
            }
  
            current = next;
          }
        });
  
        // no longer a mountpoint
        node.mounted = null;
  
        // remove this mount from the child mounts
        var idx = node.mount.mounts.indexOf(mount);
        assert(idx !== -1);
        node.mount.mounts.splice(idx, 1);
      },lookup:function (parent, name) {
        return parent.node_ops.lookup(parent, name);
      },mknod:function (path, mode, dev) {
        var lookup = FS.lookupPath(path, { parent: true });
        var parent = lookup.node;
        var name = PATH.basename(path);
        if (!name || name === '.' || name === '..') {
          throw new FS.ErrnoError(ERRNO_CODES.EINVAL);
        }
        var err = FS.mayCreate(parent, name);
        if (err) {
          throw new FS.ErrnoError(err);
        }
        if (!parent.node_ops.mknod) {
          throw new FS.ErrnoError(ERRNO_CODES.EPERM);
        }
        return parent.node_ops.mknod(parent, name, mode, dev);
      },create:function (path, mode) {
        mode = mode !== undefined ? mode : 438 /* 0666 */;
        mode &= 4095;
        mode |= 32768;
        return FS.mknod(path, mode, 0);
      },mkdir:function (path, mode) {
        mode = mode !== undefined ? mode : 511 /* 0777 */;
        mode &= 511 | 512;
        mode |= 16384;
        return FS.mknod(path, mode, 0);
      },mkdirTree:function (path, mode) {
        var dirs = path.split('/');
        var d = '';
        for (var i = 0; i < dirs.length; ++i) {
          if (!dirs[i]) continue;
          d += '/' + dirs[i];
          try {
            FS.mkdir(d, mode);
          } catch(e) {
            if (e.errno != ERRNO_CODES.EEXIST) throw e;
          }
        }
      },mkdev:function (path, mode, dev) {
        if (typeof(dev) === 'undefined') {
          dev = mode;
          mode = 438 /* 0666 */;
        }
        mode |= 8192;
        return FS.mknod(path, mode, dev);
      },symlink:function (oldpath, newpath) {
        if (!PATH.resolve(oldpath)) {
          throw new FS.ErrnoError(ERRNO_CODES.ENOENT);
        }
        var lookup = FS.lookupPath(newpath, { parent: true });
        var parent = lookup.node;
        if (!parent) {
          throw new FS.ErrnoError(ERRNO_CODES.ENOENT);
        }
        var newname = PATH.basename(newpath);
        var err = FS.mayCreate(parent, newname);
        if (err) {
          throw new FS.ErrnoError(err);
        }
        if (!parent.node_ops.symlink) {
          throw new FS.ErrnoError(ERRNO_CODES.EPERM);
        }
        return parent.node_ops.symlink(parent, newname, oldpath);
      },rename:function (old_path, new_path) {
        var old_dirname = PATH.dirname(old_path);
        var new_dirname = PATH.dirname(new_path);
        var old_name = PATH.basename(old_path);
        var new_name = PATH.basename(new_path);
        // parents must exist
        var lookup, old_dir, new_dir;
        try {
          lookup = FS.lookupPath(old_path, { parent: true });
          old_dir = lookup.node;
          lookup = FS.lookupPath(new_path, { parent: true });
          new_dir = lookup.node;
        } catch (e) {
          throw new FS.ErrnoError(ERRNO_CODES.EBUSY);
        }
        if (!old_dir || !new_dir) throw new FS.ErrnoError(ERRNO_CODES.ENOENT);
        // need to be part of the same mount
        if (old_dir.mount !== new_dir.mount) {
          throw new FS.ErrnoError(ERRNO_CODES.EXDEV);
        }
        // source must exist
        var old_node = FS.lookupNode(old_dir, old_name);
        // old path should not be an ancestor of the new path
        var relative = PATH.relative(old_path, new_dirname);
        if (relative.charAt(0) !== '.') {
          throw new FS.ErrnoError(ERRNO_CODES.EINVAL);
        }
        // new path should not be an ancestor of the old path
        relative = PATH.relative(new_path, old_dirname);
        if (relative.charAt(0) !== '.') {
          throw new FS.ErrnoError(ERRNO_CODES.ENOTEMPTY);
        }
        // see if the new path already exists
        var new_node;
        try {
          new_node = FS.lookupNode(new_dir, new_name);
        } catch (e) {
          // not fatal
        }
        // early out if nothing needs to change
        if (old_node === new_node) {
          return;
        }
        // we'll need to delete the old entry
        var isdir = FS.isDir(old_node.mode);
        var err = FS.mayDelete(old_dir, old_name, isdir);
        if (err) {
          throw new FS.ErrnoError(err);
        }
        // need delete permissions if we'll be overwriting.
        // need create permissions if new doesn't already exist.
        err = new_node ?
          FS.mayDelete(new_dir, new_name, isdir) :
          FS.mayCreate(new_dir, new_name);
        if (err) {
          throw new FS.ErrnoError(err);
        }
        if (!old_dir.node_ops.rename) {
          throw new FS.ErrnoError(ERRNO_CODES.EPERM);
        }
        if (FS.isMountpoint(old_node) || (new_node && FS.isMountpoint(new_node))) {
          throw new FS.ErrnoError(ERRNO_CODES.EBUSY);
        }
        // if we are going to change the parent, check write permissions
        if (new_dir !== old_dir) {
          err = FS.nodePermissions(old_dir, 'w');
          if (err) {
            throw new FS.ErrnoError(err);
          }
        }
        try {
          if (FS.trackingDelegate['willMovePath']) {
            FS.trackingDelegate['willMovePath'](old_path, new_path);
          }
        } catch(e) {
          console.log("FS.trackingDelegate['willMovePath']('"+old_path+"', '"+new_path+"') threw an exception: " + e.message);
        }
        // remove the node from the lookup hash
        FS.hashRemoveNode(old_node);
        // do the underlying fs rename
        try {
          old_dir.node_ops.rename(old_node, new_dir, new_name);
        } catch (e) {
          throw e;
        } finally {
          // add the node back to the hash (in case node_ops.rename
          // changed its name)
          FS.hashAddNode(old_node);
        }
        try {
          if (FS.trackingDelegate['onMovePath']) FS.trackingDelegate['onMovePath'](old_path, new_path);
        } catch(e) {
          console.log("FS.trackingDelegate['onMovePath']('"+old_path+"', '"+new_path+"') threw an exception: " + e.message);
        }
      },rmdir:function (path) {
        var lookup = FS.lookupPath(path, { parent: true });
        var parent = lookup.node;
        var name = PATH.basename(path);
        var node = FS.lookupNode(parent, name);
        var err = FS.mayDelete(parent, name, true);
        if (err) {
          throw new FS.ErrnoError(err);
        }
        if (!parent.node_ops.rmdir) {
          throw new FS.ErrnoError(ERRNO_CODES.EPERM);
        }
        if (FS.isMountpoint(node)) {
          throw new FS.ErrnoError(ERRNO_CODES.EBUSY);
        }
        try {
          if (FS.trackingDelegate['willDeletePath']) {
            FS.trackingDelegate['willDeletePath'](path);
          }
        } catch(e) {
          console.log("FS.trackingDelegate['willDeletePath']('"+path+"') threw an exception: " + e.message);
        }
        parent.node_ops.rmdir(parent, name);
        FS.destroyNode(node);
        try {
          if (FS.trackingDelegate['onDeletePath']) FS.trackingDelegate['onDeletePath'](path);
        } catch(e) {
          console.log("FS.trackingDelegate['onDeletePath']('"+path+"') threw an exception: " + e.message);
        }
      },readdir:function (path) {
        var lookup = FS.lookupPath(path, { follow: true });
        var node = lookup.node;
        if (!node.node_ops.readdir) {
          throw new FS.ErrnoError(ERRNO_CODES.ENOTDIR);
        }
        return node.node_ops.readdir(node);
      },unlink:function (path) {
        var lookup = FS.lookupPath(path, { parent: true });
        var parent = lookup.node;
        var name = PATH.basename(path);
        var node = FS.lookupNode(parent, name);
        var err = FS.mayDelete(parent, name, false);
        if (err) {
          // According to POSIX, we should map EISDIR to EPERM, but
          // we instead do what Linux does (and we must, as we use
          // the musl linux libc).
          throw new FS.ErrnoError(err);
        }
        if (!parent.node_ops.unlink) {
          throw new FS.ErrnoError(ERRNO_CODES.EPERM);
        }
        if (FS.isMountpoint(node)) {
          throw new FS.ErrnoError(ERRNO_CODES.EBUSY);
        }
        try {
          if (FS.trackingDelegate['willDeletePath']) {
            FS.trackingDelegate['willDeletePath'](path);
          }
        } catch(e) {
          console.log("FS.trackingDelegate['willDeletePath']('"+path+"') threw an exception: " + e.message);
        }
        parent.node_ops.unlink(parent, name);
        FS.destroyNode(node);
        try {
          if (FS.trackingDelegate['onDeletePath']) FS.trackingDelegate['onDeletePath'](path);
        } catch(e) {
          console.log("FS.trackingDelegate['onDeletePath']('"+path+"') threw an exception: " + e.message);
        }
      },readlink:function (path) {
        var lookup = FS.lookupPath(path);
        var link = lookup.node;
        if (!link) {
          throw new FS.ErrnoError(ERRNO_CODES.ENOENT);
        }
        if (!link.node_ops.readlink) {
          throw new FS.ErrnoError(ERRNO_CODES.EINVAL);
        }
        return PATH.resolve(FS.getPath(link.parent), link.node_ops.readlink(link));
      },stat:function (path, dontFollow) {
        var lookup = FS.lookupPath(path, { follow: !dontFollow });
        var node = lookup.node;
        if (!node) {
          throw new FS.ErrnoError(ERRNO_CODES.ENOENT);
        }
        if (!node.node_ops.getattr) {
          throw new FS.ErrnoError(ERRNO_CODES.EPERM);
        }
        return node.node_ops.getattr(node);
      },lstat:function (path) {
        return FS.stat(path, true);
      },chmod:function (path, mode, dontFollow) {
        var node;
        if (typeof path === 'string') {
          var lookup = FS.lookupPath(path, { follow: !dontFollow });
          node = lookup.node;
        } else {
          node = path;
        }
        if (!node.node_ops.setattr) {
          throw new FS.ErrnoError(ERRNO_CODES.EPERM);
        }
        node.node_ops.setattr(node, {
          mode: (mode & 4095) | (node.mode & ~4095),
          timestamp: Date.now()
        });
      },lchmod:function (path, mode) {
        FS.chmod(path, mode, true);
      },fchmod:function (fd, mode) {
        var stream = FS.getStream(fd);
        if (!stream) {
          throw new FS.ErrnoError(ERRNO_CODES.EBADF);
        }
        FS.chmod(stream.node, mode);
      },chown:function (path, uid, gid, dontFollow) {
        var node;
        if (typeof path === 'string') {
          var lookup = FS.lookupPath(path, { follow: !dontFollow });
          node = lookup.node;
        } else {
          node = path;
        }
        if (!node.node_ops.setattr) {
          throw new FS.ErrnoError(ERRNO_CODES.EPERM);
        }
        node.node_ops.setattr(node, {
          timestamp: Date.now()
          // we ignore the uid / gid for now
        });
      },lchown:function (path, uid, gid) {
        FS.chown(path, uid, gid, true);
      },fchown:function (fd, uid, gid) {
        var stream = FS.getStream(fd);
        if (!stream) {
          throw new FS.ErrnoError(ERRNO_CODES.EBADF);
        }
        FS.chown(stream.node, uid, gid);
      },truncate:function (path, len) {
        if (len < 0) {
          throw new FS.ErrnoError(ERRNO_CODES.EINVAL);
        }
        var node;
        if (typeof path === 'string') {
          var lookup = FS.lookupPath(path, { follow: true });
          node = lookup.node;
        } else {
          node = path;
        }
        if (!node.node_ops.setattr) {
          throw new FS.ErrnoError(ERRNO_CODES.EPERM);
        }
        if (FS.isDir(node.mode)) {
          throw new FS.ErrnoError(ERRNO_CODES.EISDIR);
        }
        if (!FS.isFile(node.mode)) {
          throw new FS.ErrnoError(ERRNO_CODES.EINVAL);
        }
        var err = FS.nodePermissions(node, 'w');
        if (err) {
          throw new FS.ErrnoError(err);
        }
        node.node_ops.setattr(node, {
          size: len,
          timestamp: Date.now()
        });
      },ftruncate:function (fd, len) {
        var stream = FS.getStream(fd);
        if (!stream) {
          throw new FS.ErrnoError(ERRNO_CODES.EBADF);
        }
        if ((stream.flags & 2097155) === 0) {
          throw new FS.ErrnoError(ERRNO_CODES.EINVAL);
        }
        FS.truncate(stream.node, len);
      },utime:function (path, atime, mtime) {
        var lookup = FS.lookupPath(path, { follow: true });
        var node = lookup.node;
        node.node_ops.setattr(node, {
          timestamp: Math.max(atime, mtime)
        });
      },open:function (path, flags, mode, fd_start, fd_end) {
        if (path === "") {
          throw new FS.ErrnoError(ERRNO_CODES.ENOENT);
        }
        flags = typeof flags === 'string' ? FS.modeStringToFlags(flags) : flags;
        mode = typeof mode === 'undefined' ? 438 /* 0666 */ : mode;
        if ((flags & 64)) {
          mode = (mode & 4095) | 32768;
        } else {
          mode = 0;
        }
        var node;
        if (typeof path === 'object') {
          node = path;
        } else {
          path = PATH.normalize(path);
          try {
            var lookup = FS.lookupPath(path, {
              follow: !(flags & 131072)
            });
            node = lookup.node;
          } catch (e) {
            // ignore
          }
        }
        // perhaps we need to create the node
        var created = false;
        if ((flags & 64)) {
          if (node) {
            // if O_CREAT and O_EXCL are set, error out if the node already exists
            if ((flags & 128)) {
              throw new FS.ErrnoError(ERRNO_CODES.EEXIST);
            }
          } else {
            // node doesn't exist, try to create it
            node = FS.mknod(path, mode, 0);
            created = true;
          }
        }
        if (!node) {
          throw new FS.ErrnoError(ERRNO_CODES.ENOENT);
        }
        // can't truncate a device
        if (FS.isChrdev(node.mode)) {
          flags &= ~512;
        }
        // if asked only for a directory, then this must be one
        if ((flags & 65536) && !FS.isDir(node.mode)) {
          throw new FS.ErrnoError(ERRNO_CODES.ENOTDIR);
        }
        // check permissions, if this is not a file we just created now (it is ok to
        // create and write to a file with read-only permissions; it is read-only
        // for later use)
        if (!created) {
          var err = FS.mayOpen(node, flags);
          if (err) {
            throw new FS.ErrnoError(err);
          }
        }
        // do truncation if necessary
        if ((flags & 512)) {
          FS.truncate(node, 0);
        }
        // we've already handled these, don't pass down to the underlying vfs
        flags &= ~(128 | 512);
  
        // register the stream with the filesystem
        var stream = FS.createStream({
          node: node,
          path: FS.getPath(node),  // we want the absolute path to the node
          flags: flags,
          seekable: true,
          position: 0,
          stream_ops: node.stream_ops,
          // used by the file family libc calls (fopen, fwrite, ferror, etc.)
          ungotten: [],
          error: false
        }, fd_start, fd_end);
        // call the new stream's open function
        if (stream.stream_ops.open) {
          stream.stream_ops.open(stream);
        }
        if (Module['logReadFiles'] && !(flags & 1)) {
          if (!FS.readFiles) FS.readFiles = {};
          if (!(path in FS.readFiles)) {
            FS.readFiles[path] = 1;
            Module['printErr']('read file: ' + path);
          }
        }
        try {
          if (FS.trackingDelegate['onOpenFile']) {
            var trackingFlags = 0;
            if ((flags & 2097155) !== 1) {
              trackingFlags |= FS.tracking.openFlags.READ;
            }
            if ((flags & 2097155) !== 0) {
              trackingFlags |= FS.tracking.openFlags.WRITE;
            }
            FS.trackingDelegate['onOpenFile'](path, trackingFlags);
          }
        } catch(e) {
          console.log("FS.trackingDelegate['onOpenFile']('"+path+"', flags) threw an exception: " + e.message);
        }
        return stream;
      },close:function (stream) {
        if (stream.getdents) stream.getdents = null; // free readdir state
        try {
          if (stream.stream_ops.close) {
            stream.stream_ops.close(stream);
          }
        } catch (e) {
          throw e;
        } finally {
          FS.closeStream(stream.fd);
        }
      },llseek:function (stream, offset, whence) {
        if (!stream.seekable || !stream.stream_ops.llseek) {
          throw new FS.ErrnoError(ERRNO_CODES.ESPIPE);
        }
        stream.position = stream.stream_ops.llseek(stream, offset, whence);
        stream.ungotten = [];
        return stream.position;
      },read:function (stream, buffer, offset, length, position) {
        if (length < 0 || position < 0) {
          throw new FS.ErrnoError(ERRNO_CODES.EINVAL);
        }
        if ((stream.flags & 2097155) === 1) {
          throw new FS.ErrnoError(ERRNO_CODES.EBADF);
        }
        if (FS.isDir(stream.node.mode)) {
          throw new FS.ErrnoError(ERRNO_CODES.EISDIR);
        }
        if (!stream.stream_ops.read) {
          throw new FS.ErrnoError(ERRNO_CODES.EINVAL);
        }
        var seeking = true;
        if (typeof position === 'undefined') {
          position = stream.position;
          seeking = false;
        } else if (!stream.seekable) {
          throw new FS.ErrnoError(ERRNO_CODES.ESPIPE);
        }
        var bytesRead = stream.stream_ops.read(stream, buffer, offset, length, position);
        if (!seeking) stream.position += bytesRead;
        return bytesRead;
      },write:function (stream, buffer, offset, length, position, canOwn) {
        if (length < 0 || position < 0) {
          throw new FS.ErrnoError(ERRNO_CODES.EINVAL);
        }
        if ((stream.flags & 2097155) === 0) {
          throw new FS.ErrnoError(ERRNO_CODES.EBADF);
        }
        if (FS.isDir(stream.node.mode)) {
          throw new FS.ErrnoError(ERRNO_CODES.EISDIR);
        }
        if (!stream.stream_ops.write) {
          throw new FS.ErrnoError(ERRNO_CODES.EINVAL);
        }
        if (stream.flags & 1024) {
          // seek to the end before writing in append mode
          FS.llseek(stream, 0, 2);
        }
        var seeking = true;
        if (typeof position === 'undefined') {
          position = stream.position;
          seeking = false;
        } else if (!stream.seekable) {
          throw new FS.ErrnoError(ERRNO_CODES.ESPIPE);
        }
        var bytesWritten = stream.stream_ops.write(stream, buffer, offset, length, position, canOwn);
        if (!seeking) stream.position += bytesWritten;
        try {
          if (stream.path && FS.trackingDelegate['onWriteToFile']) FS.trackingDelegate['onWriteToFile'](stream.path);
        } catch(e) {
          console.log("FS.trackingDelegate['onWriteToFile']('"+path+"') threw an exception: " + e.message);
        }
        return bytesWritten;
      },allocate:function (stream, offset, length) {
        if (offset < 0 || length <= 0) {
          throw new FS.ErrnoError(ERRNO_CODES.EINVAL);
        }
        if ((stream.flags & 2097155) === 0) {
          throw new FS.ErrnoError(ERRNO_CODES.EBADF);
        }
        if (!FS.isFile(stream.node.mode) && !FS.isDir(stream.node.mode)) {
          throw new FS.ErrnoError(ERRNO_CODES.ENODEV);
        }
        if (!stream.stream_ops.allocate) {
          throw new FS.ErrnoError(ERRNO_CODES.EOPNOTSUPP);
        }
        stream.stream_ops.allocate(stream, offset, length);
      },mmap:function (stream, buffer, offset, length, position, prot, flags) {
        // TODO if PROT is PROT_WRITE, make sure we have write access
        if ((stream.flags & 2097155) === 1) {
          throw new FS.ErrnoError(ERRNO_CODES.EACCES);
        }
        if (!stream.stream_ops.mmap) {
          throw new FS.ErrnoError(ERRNO_CODES.ENODEV);
        }
        return stream.stream_ops.mmap(stream, buffer, offset, length, position, prot, flags);
      },msync:function (stream, buffer, offset, length, mmapFlags) {
        if (!stream || !stream.stream_ops.msync) {
          return 0;
        }
        return stream.stream_ops.msync(stream, buffer, offset, length, mmapFlags);
      },munmap:function (stream) {
        return 0;
      },ioctl:function (stream, cmd, arg) {
        if (!stream.stream_ops.ioctl) {
          throw new FS.ErrnoError(ERRNO_CODES.ENOTTY);
        }
        return stream.stream_ops.ioctl(stream, cmd, arg);
      },readFile:function (path, opts) {
        opts = opts || {};
        opts.flags = opts.flags || 'r';
        opts.encoding = opts.encoding || 'binary';
        if (opts.encoding !== 'utf8' && opts.encoding !== 'binary') {
          throw new Error('Invalid encoding type "' + opts.encoding + '"');
        }
        var ret;
        var stream = FS.open(path, opts.flags);
        var stat = FS.stat(path);
        var length = stat.size;
        var buf = new Uint8Array(length);
        FS.read(stream, buf, 0, length, 0);
        if (opts.encoding === 'utf8') {
          ret = UTF8ArrayToString(buf, 0);
        } else if (opts.encoding === 'binary') {
          ret = buf;
        }
        FS.close(stream);
        return ret;
      },writeFile:function (path, data, opts) {
        opts = opts || {};
        opts.flags = opts.flags || 'w';
        opts.encoding = opts.encoding || 'utf8';
        if (opts.encoding !== 'utf8' && opts.encoding !== 'binary') {
          throw new Error('Invalid encoding type "' + opts.encoding + '"');
        }
        var stream = FS.open(path, opts.flags, opts.mode);
        if (opts.encoding === 'utf8') {
          var buf = new Uint8Array(lengthBytesUTF8(data)+1);
          var actualNumBytes = stringToUTF8Array(data, buf, 0, buf.length);
          FS.write(stream, buf, 0, actualNumBytes, 0, opts.canOwn);
        } else if (opts.encoding === 'binary') {
          FS.write(stream, data, 0, data.length, 0, opts.canOwn);
        }
        FS.close(stream);
      },cwd:function () {
        return FS.currentPath;
      },chdir:function (path) {
        var lookup = FS.lookupPath(path, { follow: true });
        if (lookup.node === null) {
          throw new FS.ErrnoError(ERRNO_CODES.ENOENT);
        }
        if (!FS.isDir(lookup.node.mode)) {
          throw new FS.ErrnoError(ERRNO_CODES.ENOTDIR);
        }
        var err = FS.nodePermissions(lookup.node, 'x');
        if (err) {
          throw new FS.ErrnoError(err);
        }
        FS.currentPath = lookup.path;
      },createDefaultDirectories:function () {
        FS.mkdir('/tmp');
        FS.mkdir('/home');
        FS.mkdir('/home/web_user');
      },createDefaultDevices:function () {
        // create /dev
        FS.mkdir('/dev');
        // setup /dev/null
        FS.registerDevice(FS.makedev(1, 3), {
          read: function() { return 0; },
          write: function(stream, buffer, offset, length, pos) { return length; }
        });
        FS.mkdev('/dev/null', FS.makedev(1, 3));
        // setup /dev/tty and /dev/tty1
        // stderr needs to print output using Module['printErr']
        // so we register a second tty just for it.
        TTY.register(FS.makedev(5, 0), TTY.default_tty_ops);
        TTY.register(FS.makedev(6, 0), TTY.default_tty1_ops);
        FS.mkdev('/dev/tty', FS.makedev(5, 0));
        FS.mkdev('/dev/tty1', FS.makedev(6, 0));
        // setup /dev/[u]random
        var random_device;
        if (typeof crypto !== 'undefined') {
          // for modern web browsers
          var randomBuffer = new Uint8Array(1);
          random_device = function() { crypto.getRandomValues(randomBuffer); return randomBuffer[0]; };
        } else if (ENVIRONMENT_IS_NODE) {
          // for nodejs
          random_device = function() { return require('crypto').randomBytes(1)[0]; };
        } else {
          // default for ES5 platforms
          random_device = function() { return (Math.random()*256)|0; };
        }
        FS.createDevice('/dev', 'random', random_device);
        FS.createDevice('/dev', 'urandom', random_device);
        // we're not going to emulate the actual shm device,
        // just create the tmp dirs that reside in it commonly
        FS.mkdir('/dev/shm');
        FS.mkdir('/dev/shm/tmp');
      },createSpecialDirectories:function () {
        // create /proc/self/fd which allows /proc/self/fd/6 => readlink gives the name of the stream for fd 6 (see test_unistd_ttyname)
        FS.mkdir('/proc');
        FS.mkdir('/proc/self');
        FS.mkdir('/proc/self/fd');
        FS.mount({
          mount: function() {
            var node = FS.createNode('/proc/self', 'fd', 16384 | 511 /* 0777 */, 73);
            node.node_ops = {
              lookup: function(parent, name) {
                var fd = +name;
                var stream = FS.getStream(fd);
                if (!stream) throw new FS.ErrnoError(ERRNO_CODES.EBADF);
                var ret = {
                  parent: null,
                  mount: { mountpoint: 'fake' },
                  node_ops: { readlink: function() { return stream.path } }
                };
                ret.parent = ret; // make it look like a simple root node
                return ret;
              }
            };
            return node;
          }
        }, {}, '/proc/self/fd');
      },createStandardStreams:function () {
        // TODO deprecate the old functionality of a single
        // input / output callback and that utilizes FS.createDevice
        // and instead require a unique set of stream ops
  
        // by default, we symlink the standard streams to the
        // default tty devices. however, if the standard streams
        // have been overwritten we create a unique device for
        // them instead.
        if (Module['stdin']) {
          FS.createDevice('/dev', 'stdin', Module['stdin']);
        } else {
          FS.symlink('/dev/tty', '/dev/stdin');
        }
        if (Module['stdout']) {
          FS.createDevice('/dev', 'stdout', null, Module['stdout']);
        } else {
          FS.symlink('/dev/tty', '/dev/stdout');
        }
        if (Module['stderr']) {
          FS.createDevice('/dev', 'stderr', null, Module['stderr']);
        } else {
          FS.symlink('/dev/tty1', '/dev/stderr');
        }
  
        // open default streams for the stdin, stdout and stderr devices
        var stdin = FS.open('/dev/stdin', 'r');
        assert(stdin.fd === 0, 'invalid handle for stdin (' + stdin.fd + ')');
  
        var stdout = FS.open('/dev/stdout', 'w');
        assert(stdout.fd === 1, 'invalid handle for stdout (' + stdout.fd + ')');
  
        var stderr = FS.open('/dev/stderr', 'w');
        assert(stderr.fd === 2, 'invalid handle for stderr (' + stderr.fd + ')');
      },ensureErrnoError:function () {
        if (FS.ErrnoError) return;
        FS.ErrnoError = function ErrnoError(errno, node) {
          //Module.printErr(stackTrace()); // useful for debugging
          this.node = node;
          this.setErrno = function(errno) {
            this.errno = errno;
            for (var key in ERRNO_CODES) {
              if (ERRNO_CODES[key] === errno) {
                this.code = key;
                break;
              }
            }
          };
          this.setErrno(errno);
          this.message = ERRNO_MESSAGES[errno];
          if (this.stack) this.stack = demangleAll(this.stack);
        };
        FS.ErrnoError.prototype = new Error();
        FS.ErrnoError.prototype.constructor = FS.ErrnoError;
        // Some errors may happen quite a bit, to avoid overhead we reuse them (and suffer a lack of stack info)
        [ERRNO_CODES.ENOENT].forEach(function(code) {
          FS.genericErrors[code] = new FS.ErrnoError(code);
          FS.genericErrors[code].stack = '<generic error, no stack>';
        });
      },staticInit:function () {
        FS.ensureErrnoError();
  
        FS.nameTable = new Array(4096);
  
        FS.mount(MEMFS, {}, '/');
  
        FS.createDefaultDirectories();
        FS.createDefaultDevices();
        FS.createSpecialDirectories();
  
        FS.filesystems = {
          'MEMFS': MEMFS,
          'IDBFS': IDBFS,
          'NODEFS': NODEFS,
          'WORKERFS': WORKERFS,
        };
      },init:function (input, output, error) {
        assert(!FS.init.initialized, 'FS.init was previously called. If you want to initialize later with custom parameters, remove any earlier calls (note that one is automatically added to the generated code)');
        FS.init.initialized = true;
  
        FS.ensureErrnoError();
  
        // Allow Module.stdin etc. to provide defaults, if none explicitly passed to us here
        Module['stdin'] = input || Module['stdin'];
        Module['stdout'] = output || Module['stdout'];
        Module['stderr'] = error || Module['stderr'];
  
        FS.createStandardStreams();
      },quit:function () {
        FS.init.initialized = false;
        // force-flush all streams, so we get musl std streams printed out
        var fflush = Module['_fflush'];
        if (fflush) fflush(0);
        // close all of our streams
        for (var i = 0; i < FS.streams.length; i++) {
          var stream = FS.streams[i];
          if (!stream) {
            continue;
          }
          FS.close(stream);
        }
      },getMode:function (canRead, canWrite) {
        var mode = 0;
        if (canRead) mode |= 292 | 73;
        if (canWrite) mode |= 146;
        return mode;
      },joinPath:function (parts, forceRelative) {
        var path = PATH.join.apply(null, parts);
        if (forceRelative && path[0] == '/') path = path.substr(1);
        return path;
      },absolutePath:function (relative, base) {
        return PATH.resolve(base, relative);
      },standardizePath:function (path) {
        return PATH.normalize(path);
      },findObject:function (path, dontResolveLastLink) {
        var ret = FS.analyzePath(path, dontResolveLastLink);
        if (ret.exists) {
          return ret.object;
        } else {
          ___setErrNo(ret.error);
          return null;
        }
      },analyzePath:function (path, dontResolveLastLink) {
        // operate from within the context of the symlink's target
        try {
          var lookup = FS.lookupPath(path, { follow: !dontResolveLastLink });
          path = lookup.path;
        } catch (e) {
        }
        var ret = {
          isRoot: false, exists: false, error: 0, name: null, path: null, object: null,
          parentExists: false, parentPath: null, parentObject: null
        };
        try {
          var lookup = FS.lookupPath(path, { parent: true });
          ret.parentExists = true;
          ret.parentPath = lookup.path;
          ret.parentObject = lookup.node;
          ret.name = PATH.basename(path);
          lookup = FS.lookupPath(path, { follow: !dontResolveLastLink });
          ret.exists = true;
          ret.path = lookup.path;
          ret.object = lookup.node;
          ret.name = lookup.node.name;
          ret.isRoot = lookup.path === '/';
        } catch (e) {
          ret.error = e.errno;
        };
        return ret;
      },createFolder:function (parent, name, canRead, canWrite) {
        var path = PATH.join2(typeof parent === 'string' ? parent : FS.getPath(parent), name);
        var mode = FS.getMode(canRead, canWrite);
        return FS.mkdir(path, mode);
      },createPath:function (parent, path, canRead, canWrite) {
        parent = typeof parent === 'string' ? parent : FS.getPath(parent);
        var parts = path.split('/').reverse();
        while (parts.length) {
          var part = parts.pop();
          if (!part) continue;
          var current = PATH.join2(parent, part);
          try {
            FS.mkdir(current);
          } catch (e) {
            // ignore EEXIST
          }
          parent = current;
        }
        return current;
      },createFile:function (parent, name, properties, canRead, canWrite) {
        var path = PATH.join2(typeof parent === 'string' ? parent : FS.getPath(parent), name);
        var mode = FS.getMode(canRead, canWrite);
        return FS.create(path, mode);
      },createDataFile:function (parent, name, data, canRead, canWrite, canOwn) {
        var path = name ? PATH.join2(typeof parent === 'string' ? parent : FS.getPath(parent), name) : parent;
        var mode = FS.getMode(canRead, canWrite);
        var node = FS.create(path, mode);
        if (data) {
          if (typeof data === 'string') {
            var arr = new Array(data.length);
            for (var i = 0, len = data.length; i < len; ++i) arr[i] = data.charCodeAt(i);
            data = arr;
          }
          // make sure we can write to the file
          FS.chmod(node, mode | 146);
          var stream = FS.open(node, 'w');
          FS.write(stream, data, 0, data.length, 0, canOwn);
          FS.close(stream);
          FS.chmod(node, mode);
        }
        return node;
      },createDevice:function (parent, name, input, output) {
        var path = PATH.join2(typeof parent === 'string' ? parent : FS.getPath(parent), name);
        var mode = FS.getMode(!!input, !!output);
        if (!FS.createDevice.major) FS.createDevice.major = 64;
        var dev = FS.makedev(FS.createDevice.major++, 0);
        // Create a fake device that a set of stream ops to emulate
        // the old behavior.
        FS.registerDevice(dev, {
          open: function(stream) {
            stream.seekable = false;
          },
          close: function(stream) {
            // flush any pending line data
            if (output && output.buffer && output.buffer.length) {
              output(10);
            }
          },
          read: function(stream, buffer, offset, length, pos /* ignored */) {
            var bytesRead = 0;
            for (var i = 0; i < length; i++) {
              var result;
              try {
                result = input();
              } catch (e) {
                throw new FS.ErrnoError(ERRNO_CODES.EIO);
              }
              if (result === undefined && bytesRead === 0) {
                throw new FS.ErrnoError(ERRNO_CODES.EAGAIN);
              }
              if (result === null || result === undefined) break;
              bytesRead++;
              buffer[offset+i] = result;
            }
            if (bytesRead) {
              stream.node.timestamp = Date.now();
            }
            return bytesRead;
          },
          write: function(stream, buffer, offset, length, pos) {
            for (var i = 0; i < length; i++) {
              try {
                output(buffer[offset+i]);
              } catch (e) {
                throw new FS.ErrnoError(ERRNO_CODES.EIO);
              }
            }
            if (length) {
              stream.node.timestamp = Date.now();
            }
            return i;
          }
        });
        return FS.mkdev(path, mode, dev);
      },createLink:function (parent, name, target, canRead, canWrite) {
        var path = PATH.join2(typeof parent === 'string' ? parent : FS.getPath(parent), name);
        return FS.symlink(target, path);
      },forceLoadFile:function (obj) {
        if (obj.isDevice || obj.isFolder || obj.link || obj.contents) return true;
        var success = true;
        if (typeof XMLHttpRequest !== 'undefined') {
          throw new Error("Lazy loading should have been performed (contents set) in createLazyFile, but it was not. Lazy loading only works in web workers. Use --embed-file or --preload-file in emcc on the main thread.");
        } else if (Module['read']) {
          // Command-line.
          try {
            // WARNING: Can't read binary files in V8's d8 or tracemonkey's js, as
            //          read() will try to parse UTF8.
            obj.contents = intArrayFromString(Module['read'](obj.url), true);
            obj.usedBytes = obj.contents.length;
          } catch (e) {
            success = false;
          }
        } else {
          throw new Error('Cannot load without read() or XMLHttpRequest.');
        }
        if (!success) ___setErrNo(ERRNO_CODES.EIO);
        return success;
      },createLazyFile:function (parent, name, url, canRead, canWrite) {
        // Lazy chunked Uint8Array (implements get and length from Uint8Array). Actual getting is abstracted away for eventual reuse.
        function LazyUint8Array() {
          this.lengthKnown = false;
          this.chunks = []; // Loaded chunks. Index is the chunk number
        }
        LazyUint8Array.prototype.get = function LazyUint8Array_get(idx) {
          if (idx > this.length-1 || idx < 0) {
            return undefined;
          }
          var chunkOffset = idx % this.chunkSize;
          var chunkNum = (idx / this.chunkSize)|0;
          return this.getter(chunkNum)[chunkOffset];
        }
        LazyUint8Array.prototype.setDataGetter = function LazyUint8Array_setDataGetter(getter) {
          this.getter = getter;
        }
        LazyUint8Array.prototype.cacheLength = function LazyUint8Array_cacheLength() {
          // Find length
          var xhr = new XMLHttpRequest();
          xhr.open('HEAD', url, false);
          xhr.send(null);
          if (!(xhr.status >= 200 && xhr.status < 300 || xhr.status === 304)) throw new Error("Couldn't load " + url + ". Status: " + xhr.status);
          var datalength = Number(xhr.getResponseHeader("Content-length"));
          var header;
          var hasByteServing = (header = xhr.getResponseHeader("Accept-Ranges")) && header === "bytes";
          var usesGzip = (header = xhr.getResponseHeader("Content-Encoding")) && header === "gzip";
  
          var chunkSize = 1024*1024; // Chunk size in bytes
  
          if (!hasByteServing) chunkSize = datalength;
  
          // Function to get a range from the remote URL.
          var doXHR = (function(from, to) {
            if (from > to) throw new Error("invalid range (" + from + ", " + to + ") or no bytes requested!");
            if (to > datalength-1) throw new Error("only " + datalength + " bytes available! programmer error!");
  
            // TODO: Use mozResponseArrayBuffer, responseStream, etc. if available.
            var xhr = new XMLHttpRequest();
            xhr.open('GET', url, false);
            if (datalength !== chunkSize) xhr.setRequestHeader("Range", "bytes=" + from + "-" + to);
  
            // Some hints to the browser that we want binary data.
            if (typeof Uint8Array != 'undefined') xhr.responseType = 'arraybuffer';
            if (xhr.overrideMimeType) {
              xhr.overrideMimeType('text/plain; charset=x-user-defined');
            }
  
            xhr.send(null);
            if (!(xhr.status >= 200 && xhr.status < 300 || xhr.status === 304)) throw new Error("Couldn't load " + url + ". Status: " + xhr.status);
            if (xhr.response !== undefined) {
              return new Uint8Array(xhr.response || []);
            } else {
              return intArrayFromString(xhr.responseText || '', true);
            }
          });
          var lazyArray = this;
          lazyArray.setDataGetter(function(chunkNum) {
            var start = chunkNum * chunkSize;
            var end = (chunkNum+1) * chunkSize - 1; // including this byte
            end = Math.min(end, datalength-1); // if datalength-1 is selected, this is the last block
            if (typeof(lazyArray.chunks[chunkNum]) === "undefined") {
              lazyArray.chunks[chunkNum] = doXHR(start, end);
            }
            if (typeof(lazyArray.chunks[chunkNum]) === "undefined") throw new Error("doXHR failed!");
            return lazyArray.chunks[chunkNum];
          });
  
          if (usesGzip || !datalength) {
            // if the server uses gzip or doesn't supply the length, we have to download the whole file to get the (uncompressed) length
            chunkSize = datalength = 1; // this will force getter(0)/doXHR do download the whole file
            datalength = this.getter(0).length;
            chunkSize = datalength;
            console.log("LazyFiles on gzip forces download of the whole file when length is accessed");
          }
  
          this._length = datalength;
          this._chunkSize = chunkSize;
          this.lengthKnown = true;
        }
        if (typeof XMLHttpRequest !== 'undefined') {
          if (!ENVIRONMENT_IS_WORKER) throw 'Cannot do synchronous binary XHRs outside webworkers in modern browsers. Use --embed-file or --preload-file in emcc';
          var lazyArray = new LazyUint8Array();
          Object.defineProperties(lazyArray, {
            length: {
              get: function() {
                if(!this.lengthKnown) {
                  this.cacheLength();
                }
                return this._length;
              }
            },
            chunkSize: {
              get: function() {
                if(!this.lengthKnown) {
                  this.cacheLength();
                }
                return this._chunkSize;
              }
            }
          });
  
          var properties = { isDevice: false, contents: lazyArray };
        } else {
          var properties = { isDevice: false, url: url };
        }
  
        var node = FS.createFile(parent, name, properties, canRead, canWrite);
        // This is a total hack, but I want to get this lazy file code out of the
        // core of MEMFS. If we want to keep this lazy file concept I feel it should
        // be its own thin LAZYFS proxying calls to MEMFS.
        if (properties.contents) {
          node.contents = properties.contents;
        } else if (properties.url) {
          node.contents = null;
          node.url = properties.url;
        }
        // Add a function that defers querying the file size until it is asked the first time.
        Object.defineProperties(node, {
          usedBytes: {
            get: function() { return this.contents.length; }
          }
        });
        // override each stream op with one that tries to force load the lazy file first
        var stream_ops = {};
        var keys = Object.keys(node.stream_ops);
        keys.forEach(function(key) {
          var fn = node.stream_ops[key];
          stream_ops[key] = function forceLoadLazyFile() {
            if (!FS.forceLoadFile(node)) {
              throw new FS.ErrnoError(ERRNO_CODES.EIO);
            }
            return fn.apply(null, arguments);
          };
        });
        // use a custom read function
        stream_ops.read = function stream_ops_read(stream, buffer, offset, length, position) {
          if (!FS.forceLoadFile(node)) {
            throw new FS.ErrnoError(ERRNO_CODES.EIO);
          }
          var contents = stream.node.contents;
          if (position >= contents.length)
            return 0;
          var size = Math.min(contents.length - position, length);
          assert(size >= 0);
          if (contents.slice) { // normal array
            for (var i = 0; i < size; i++) {
              buffer[offset + i] = contents[position + i];
            }
          } else {
            for (var i = 0; i < size; i++) { // LazyUint8Array from sync binary XHR
              buffer[offset + i] = contents.get(position + i);
            }
          }
          return size;
        };
        node.stream_ops = stream_ops;
        return node;
      },createPreloadedFile:function (parent, name, url, canRead, canWrite, onload, onerror, dontCreateFile, canOwn, preFinish) {
        Browser.init(); // XXX perhaps this method should move onto Browser?
        // TODO we should allow people to just pass in a complete filename instead
        // of parent and name being that we just join them anyways
        var fullname = name ? PATH.resolve(PATH.join2(parent, name)) : parent;
        var dep = getUniqueRunDependency('cp ' + fullname); // might have several active requests for the same fullname
        function processData(byteArray) {
          function finish(byteArray) {
            if (preFinish) preFinish();
            if (!dontCreateFile) {
              FS.createDataFile(parent, name, byteArray, canRead, canWrite, canOwn);
            }
            if (onload) onload();
            removeRunDependency(dep);
          }
          var handled = false;
          Module['preloadPlugins'].forEach(function(plugin) {
            if (handled) return;
            if (plugin['canHandle'](fullname)) {
              plugin['handle'](byteArray, fullname, finish, function() {
                if (onerror) onerror();
                removeRunDependency(dep);
              });
              handled = true;
            }
          });
          if (!handled) finish(byteArray);
        }
        addRunDependency(dep);
        if (typeof url == 'string') {
          Browser.asyncLoad(url, function(byteArray) {
            processData(byteArray);
          }, onerror);
        } else {
          processData(url);
        }
      },indexedDB:function () {
        return window.indexedDB || window.mozIndexedDB || window.webkitIndexedDB || window.msIndexedDB;
      },DB_NAME:function () {
        return 'EM_FS_' + window.location.pathname;
      },DB_VERSION:20,DB_STORE_NAME:"FILE_DATA",saveFilesToDB:function (paths, onload, onerror) {
        onload = onload || function(){};
        onerror = onerror || function(){};
        var indexedDB = FS.indexedDB();
        try {
          var openRequest = indexedDB.open(FS.DB_NAME(), FS.DB_VERSION);
        } catch (e) {
          return onerror(e);
        }
        openRequest.onupgradeneeded = function openRequest_onupgradeneeded() {
          console.log('creating db');
          var db = openRequest.result;
          db.createObjectStore(FS.DB_STORE_NAME);
        };
        openRequest.onsuccess = function openRequest_onsuccess() {
          var db = openRequest.result;
          var transaction = db.transaction([FS.DB_STORE_NAME], 'readwrite');
          var files = transaction.objectStore(FS.DB_STORE_NAME);
          var ok = 0, fail = 0, total = paths.length;
          function finish() {
            if (fail == 0) onload(); else onerror();
          }
          paths.forEach(function(path) {
            var putRequest = files.put(FS.analyzePath(path).object.contents, path);
            putRequest.onsuccess = function putRequest_onsuccess() { ok++; if (ok + fail == total) finish() };
            putRequest.onerror = function putRequest_onerror() { fail++; if (ok + fail == total) finish() };
          });
          transaction.onerror = onerror;
        };
        openRequest.onerror = onerror;
      },loadFilesFromDB:function (paths, onload, onerror) {
        onload = onload || function(){};
        onerror = onerror || function(){};
        var indexedDB = FS.indexedDB();
        try {
          var openRequest = indexedDB.open(FS.DB_NAME(), FS.DB_VERSION);
        } catch (e) {
          return onerror(e);
        }
        openRequest.onupgradeneeded = onerror; // no database to load from
        openRequest.onsuccess = function openRequest_onsuccess() {
          var db = openRequest.result;
          try {
            var transaction = db.transaction([FS.DB_STORE_NAME], 'readonly');
          } catch(e) {
            onerror(e);
            return;
          }
          var files = transaction.objectStore(FS.DB_STORE_NAME);
          var ok = 0, fail = 0, total = paths.length;
          function finish() {
            if (fail == 0) onload(); else onerror();
          }
          paths.forEach(function(path) {
            var getRequest = files.get(path);
            getRequest.onsuccess = function getRequest_onsuccess() {
              if (FS.analyzePath(path).exists) {
                FS.unlink(path);
              }
              FS.createDataFile(PATH.dirname(path), PATH.basename(path), getRequest.result, true, true, true);
              ok++;
              if (ok + fail == total) finish();
            };
            getRequest.onerror = function getRequest_onerror() { fail++; if (ok + fail == total) finish() };
          });
          transaction.onerror = onerror;
        };
        openRequest.onerror = onerror;
      }};var SYSCALLS={DEFAULT_POLLMASK:5,mappings:{},umask:511,calculateAt:function (dirfd, path) {
        if (path[0] !== '/') {
          // relative path
          var dir;
          if (dirfd === -100) {
            dir = FS.cwd();
          } else {
            var dirstream = FS.getStream(dirfd);
            if (!dirstream) throw new FS.ErrnoError(ERRNO_CODES.EBADF);
            dir = dirstream.path;
          }
          path = PATH.join2(dir, path);
        }
        return path;
      },doStat:function (func, path, buf) {
        try {
          var stat = func(path);
        } catch (e) {
          if (e && e.node && PATH.normalize(path) !== PATH.normalize(FS.getPath(e.node))) {
            // an error occurred while trying to look up the path; we should just report ENOTDIR
            return -ERRNO_CODES.ENOTDIR;
          }
          throw e;
        }
        HEAP32[((buf)>>2)]=stat.dev;
        HEAP32[(((buf)+(4))>>2)]=0;
        HEAP32[(((buf)+(8))>>2)]=stat.ino;
        HEAP32[(((buf)+(12))>>2)]=stat.mode;
        HEAP32[(((buf)+(16))>>2)]=stat.nlink;
        HEAP32[(((buf)+(20))>>2)]=stat.uid;
        HEAP32[(((buf)+(24))>>2)]=stat.gid;
        HEAP32[(((buf)+(28))>>2)]=stat.rdev;
        HEAP32[(((buf)+(32))>>2)]=0;
        HEAP32[(((buf)+(36))>>2)]=stat.size;
        HEAP32[(((buf)+(40))>>2)]=4096;
        HEAP32[(((buf)+(44))>>2)]=stat.blocks;
        HEAP32[(((buf)+(48))>>2)]=(stat.atime.getTime() / 1000)|0;
        HEAP32[(((buf)+(52))>>2)]=0;
        HEAP32[(((buf)+(56))>>2)]=(stat.mtime.getTime() / 1000)|0;
        HEAP32[(((buf)+(60))>>2)]=0;
        HEAP32[(((buf)+(64))>>2)]=(stat.ctime.getTime() / 1000)|0;
        HEAP32[(((buf)+(68))>>2)]=0;
        HEAP32[(((buf)+(72))>>2)]=stat.ino;
        return 0;
      },doMsync:function (addr, stream, len, flags) {
        var buffer = new Uint8Array(HEAPU8.subarray(addr, addr + len));
        FS.msync(stream, buffer, 0, len, flags);
      },doMkdir:function (path, mode) {
        // remove a trailing slash, if one - /a/b/ has basename of '', but
        // we want to create b in the context of this function
        path = PATH.normalize(path);
        if (path[path.length-1] === '/') path = path.substr(0, path.length-1);
        FS.mkdir(path, mode, 0);
        return 0;
      },doMknod:function (path, mode, dev) {
        // we don't want this in the JS API as it uses mknod to create all nodes.
        switch (mode & 61440) {
          case 32768:
          case 8192:
          case 24576:
          case 4096:
          case 49152:
            break;
          default: return -ERRNO_CODES.EINVAL;
        }
        FS.mknod(path, mode, dev);
        return 0;
      },doReadlink:function (path, buf, bufsize) {
        if (bufsize <= 0) return -ERRNO_CODES.EINVAL;
        var ret = FS.readlink(path);
  
        var len = Math.min(bufsize, lengthBytesUTF8(ret));
        var endChar = HEAP8[buf+len];
        stringToUTF8(ret, buf, bufsize+1);
        // readlink is one of the rare functions that write out a C string, but does never append a null to the output buffer(!)
        // stringToUTF8() always appends a null byte, so restore the character under the null byte after the write.
        HEAP8[buf+len] = endChar;
  
        return len;
      },doAccess:function (path, amode) {
        if (amode & ~7) {
          // need a valid mode
          return -ERRNO_CODES.EINVAL;
        }
        var node;
        var lookup = FS.lookupPath(path, { follow: true });
        node = lookup.node;
        var perms = '';
        if (amode & 4) perms += 'r';
        if (amode & 2) perms += 'w';
        if (amode & 1) perms += 'x';
        if (perms /* otherwise, they've just passed F_OK */ && FS.nodePermissions(node, perms)) {
          return -ERRNO_CODES.EACCES;
        }
        return 0;
      },doDup:function (path, flags, suggestFD) {
        var suggest = FS.getStream(suggestFD);
        if (suggest) FS.close(suggest);
        return FS.open(path, flags, 0, suggestFD, suggestFD).fd;
      },doReadv:function (stream, iov, iovcnt, offset) {
        var ret = 0;
        for (var i = 0; i < iovcnt; i++) {
          var ptr = HEAP32[(((iov)+(i*8))>>2)];
          var len = HEAP32[(((iov)+(i*8 + 4))>>2)];
          var curr = FS.read(stream, HEAP8,ptr, len, offset);
          if (curr < 0) return -1;
          ret += curr;
          if (curr < len) break; // nothing more to read
        }
        return ret;
      },doWritev:function (stream, iov, iovcnt, offset) {
        var ret = 0;
        for (var i = 0; i < iovcnt; i++) {
          var ptr = HEAP32[(((iov)+(i*8))>>2)];
          var len = HEAP32[(((iov)+(i*8 + 4))>>2)];
          var curr = FS.write(stream, HEAP8,ptr, len, offset);
          if (curr < 0) return -1;
          ret += curr;
        }
        return ret;
      },varargs:0,get:function (varargs) {
        SYSCALLS.varargs += 4;
        var ret = HEAP32[(((SYSCALLS.varargs)-(4))>>2)];
        return ret;
      },getStr:function () {
        var ret = Pointer_stringify(SYSCALLS.get());
        return ret;
      },getStreamFromFD:function () {
        var stream = FS.getStream(SYSCALLS.get());
        if (!stream) throw new FS.ErrnoError(ERRNO_CODES.EBADF);
        return stream;
      },getSocketFromFD:function () {
        var socket = SOCKFS.getSocket(SYSCALLS.get());
        if (!socket) throw new FS.ErrnoError(ERRNO_CODES.EBADF);
        return socket;
      },getSocketAddress:function (allowNull) {
        var addrp = SYSCALLS.get(), addrlen = SYSCALLS.get();
        if (allowNull && addrp === 0) return null;
        var info = __read_sockaddr(addrp, addrlen);
        if (info.errno) throw new FS.ErrnoError(info.errno);
        info.addr = DNS.lookup_addr(info.addr) || info.addr;
        return info;
      },get64:function () {
        var low = SYSCALLS.get(), high = SYSCALLS.get();
        if (low >= 0) assert(high === 0);
        else assert(high === -1);
        return low;
      },getZero:function () {
        assert(SYSCALLS.get() === 0);
      }};function ___syscall63(which, varargs) {SYSCALLS.varargs = varargs;
  try {
   // dup2
      var old = SYSCALLS.getStreamFromFD(), suggestFD = SYSCALLS.get();
      if (old.fd === suggestFD) return suggestFD;
      return SYSCALLS.doDup(old.path, old.flags, suggestFD);
    } catch (e) {
    if (typeof FS === 'undefined' || !(e instanceof FS.ErrnoError)) abort(e);
    return -e.errno;
  }
  }

  
  function __ZSt18uncaught_exceptionv() { // std::uncaught_exception()
      return !!__ZSt18uncaught_exceptionv.uncaught_exception;
    }
  
  
  
  var EXCEPTIONS={last:0,caught:[],infos:{},deAdjust:function (adjusted) {
        if (!adjusted || EXCEPTIONS.infos[adjusted]) return adjusted;
        for (var ptr in EXCEPTIONS.infos) {
          var info = EXCEPTIONS.infos[ptr];
          if (info.adjusted === adjusted) {
            return ptr;
          }
        }
        return adjusted;
      },addRef:function (ptr) {
        if (!ptr) return;
        var info = EXCEPTIONS.infos[ptr];
        info.refcount++;
      },decRef:function (ptr) {
        if (!ptr) return;
        var info = EXCEPTIONS.infos[ptr];
        assert(info.refcount > 0);
        info.refcount--;
        // A rethrown exception can reach refcount 0; it must not be discarded
        // Its next handler will clear the rethrown flag and addRef it, prior to
        // final decRef and destruction here
        if (info.refcount === 0 && !info.rethrown) {
          if (info.destructor) {
            Module['dynCall_vi'](info.destructor, ptr);
          }
          delete EXCEPTIONS.infos[ptr];
          ___cxa_free_exception(ptr);
        }
      },clearRef:function (ptr) {
        if (!ptr) return;
        var info = EXCEPTIONS.infos[ptr];
        info.refcount = 0;
      }};
  function ___resumeException(ptr) {
      if (!EXCEPTIONS.last) { EXCEPTIONS.last = ptr; }
      throw ptr;
    }function ___cxa_find_matching_catch() {
      var thrown = EXCEPTIONS.last;
      if (!thrown) {
        // just pass through the null ptr
        return ((Runtime.setTempRet0(0),0)|0);
      }
      var info = EXCEPTIONS.infos[thrown];
      var throwntype = info.type;
      if (!throwntype) {
        // just pass through the thrown ptr
        return ((Runtime.setTempRet0(0),thrown)|0);
      }
      var typeArray = Array.prototype.slice.call(arguments);
  
      var pointer = Module['___cxa_is_pointer_type'](throwntype);
      // can_catch receives a **, add indirection
      if (!___cxa_find_matching_catch.buffer) ___cxa_find_matching_catch.buffer = _malloc(4);
      HEAP32[((___cxa_find_matching_catch.buffer)>>2)]=thrown;
      thrown = ___cxa_find_matching_catch.buffer;
      // The different catch blocks are denoted by different types.
      // Due to inheritance, those types may not precisely match the
      // type of the thrown object. Find one which matches, and
      // return the type of the catch block which should be called.
      for (var i = 0; i < typeArray.length; i++) {
        if (typeArray[i] && Module['___cxa_can_catch'](typeArray[i], throwntype, thrown)) {
          thrown = HEAP32[((thrown)>>2)]; // undo indirection
          info.adjusted = thrown;
          return ((Runtime.setTempRet0(typeArray[i]),thrown)|0);
        }
      }
      // Shouldn't happen unless we have bogus data in typeArray
      // or encounter a type for which emscripten doesn't have suitable
      // typeinfo defined. Best-efforts match just in case.
      thrown = HEAP32[((thrown)>>2)]; // undo indirection
      return ((Runtime.setTempRet0(throwntype),thrown)|0);
    }function ___cxa_throw(ptr, type, destructor) {
      EXCEPTIONS.infos[ptr] = {
        ptr: ptr,
        adjusted: ptr,
        type: type,
        destructor: destructor,
        refcount: 0,
        caught: false,
        rethrown: false
      };
      EXCEPTIONS.last = ptr;
      if (!("uncaught_exception" in __ZSt18uncaught_exceptionv)) {
        __ZSt18uncaught_exceptionv.uncaught_exception = 1;
      } else {
        __ZSt18uncaught_exceptionv.uncaught_exception++;
      }
      throw ptr;
    }

   

   

  function _abort() {
      Module['abort']();
    }

  
  function ___cxa_free_exception(ptr) {
      try {
        return _free(ptr);
      } catch(e) { // XXX FIXME
        Module.printErr('exception during cxa_free_exception: ' + e);
      }
    }function ___cxa_end_catch() {
      // Clear state flag.
      Module['setThrew'](0);
      // Call destructor if one is registered then clear it.
      var ptr = EXCEPTIONS.caught.pop();
      if (ptr) {
        EXCEPTIONS.decRef(EXCEPTIONS.deAdjust(ptr));
        EXCEPTIONS.last = 0; // XXX in decRef?
      }
    }

  
  
  var ___async=0;
  
  var ___async_unwind=1;
  
  var ___async_retval=STATICTOP; STATICTOP += 16;;
  
  var ___async_cur_frame=0; 
  
  
  
  function _emscripten_set_main_loop_timing(mode, value) {
      Browser.mainLoop.timingMode = mode;
      Browser.mainLoop.timingValue = value;
  
      if (!Browser.mainLoop.func) {
        console.error('emscripten_set_main_loop_timing: Cannot set timing mode for main loop since a main loop does not exist! Call emscripten_set_main_loop first to set one up.');
        return 1; // Return non-zero on failure, can't set timing mode when there is no main loop.
      }
  
      if (mode == 0 /*EM_TIMING_SETTIMEOUT*/) {
        Browser.mainLoop.scheduler = function Browser_mainLoop_scheduler_setTimeout() {
          var timeUntilNextTick = Math.max(0, Browser.mainLoop.tickStartTime + value - _emscripten_get_now())|0;
          setTimeout(Browser.mainLoop.runner, timeUntilNextTick); // doing this each time means that on exception, we stop
        };
        Browser.mainLoop.method = 'timeout';
      } else if (mode == 1 /*EM_TIMING_RAF*/) {
        Browser.mainLoop.scheduler = function Browser_mainLoop_scheduler_rAF() {
          Browser.requestAnimationFrame(Browser.mainLoop.runner);
        };
        Browser.mainLoop.method = 'rAF';
      } else if (mode == 2 /*EM_TIMING_SETIMMEDIATE*/) {
        if (!window['setImmediate']) {
          // Emulate setImmediate. (note: not a complete polyfill, we don't emulate clearImmediate() to keep code size to minimum, since not needed)
          var setImmediates = [];
          var emscriptenMainLoopMessageId = 'setimmediate';
          function Browser_setImmediate_messageHandler(event) {
            if (event.source === window && event.data === emscriptenMainLoopMessageId) {
              event.stopPropagation();
              setImmediates.shift()();
            }
          }
          window.addEventListener("message", Browser_setImmediate_messageHandler, true);
          window['setImmediate'] = function Browser_emulated_setImmediate(func) {
            setImmediates.push(func);
            if (ENVIRONMENT_IS_WORKER) {
              if (Module['setImmediates'] === undefined) Module['setImmediates'] = [];
              Module['setImmediates'].push(func);
              window.postMessage({target: emscriptenMainLoopMessageId}); // In --proxy-to-worker, route the message via proxyClient.js
            } else window.postMessage(emscriptenMainLoopMessageId, "*"); // On the main thread, can just send the message to itself.
          }
        }
        Browser.mainLoop.scheduler = function Browser_mainLoop_scheduler_setImmediate() {
          window['setImmediate'](Browser.mainLoop.runner);
        };
        Browser.mainLoop.method = 'immediate';
      }
      return 0;
    }function _emscripten_set_main_loop(func, fps, simulateInfiniteLoop, arg, noSetTiming) {
      Module['noExitRuntime'] = true;
  
      assert(!Browser.mainLoop.func, 'emscripten_set_main_loop: there can only be one main loop function at once: call emscripten_cancel_main_loop to cancel the previous one before setting a new one with different parameters.');
  
      Browser.mainLoop.func = func;
      Browser.mainLoop.arg = arg;
  
      var browserIterationFunc;
      if (typeof arg !== 'undefined') {
        browserIterationFunc = function() {
          Module['dynCall_vi'](func, arg);
        };
      } else {
        browserIterationFunc = function() {
          Module['dynCall_v'](func);
        };
      }
  
      var thisMainLoopId = Browser.mainLoop.currentlyRunningMainloop;
  
      Browser.mainLoop.runner = function Browser_mainLoop_runner() {
        if (ABORT) return;
        if (Browser.mainLoop.queue.length > 0) {
          var start = Date.now();
          var blocker = Browser.mainLoop.queue.shift();
          blocker.func(blocker.arg);
          if (Browser.mainLoop.remainingBlockers) {
            var remaining = Browser.mainLoop.remainingBlockers;
            var next = remaining%1 == 0 ? remaining-1 : Math.floor(remaining);
            if (blocker.counted) {
              Browser.mainLoop.remainingBlockers = next;
            } else {
              // not counted, but move the progress along a tiny bit
              next = next + 0.5; // do not steal all the next one's progress
              Browser.mainLoop.remainingBlockers = (8*remaining + next)/9;
            }
          }
          console.log('main loop blocker "' + blocker.name + '" took ' + (Date.now() - start) + ' ms'); //, left: ' + Browser.mainLoop.remainingBlockers);
          Browser.mainLoop.updateStatus();
          
          // catches pause/resume main loop from blocker execution
          if (thisMainLoopId < Browser.mainLoop.currentlyRunningMainloop) return;
          
          setTimeout(Browser.mainLoop.runner, 0);
          return;
        }
  
        // catch pauses from non-main loop sources
        if (thisMainLoopId < Browser.mainLoop.currentlyRunningMainloop) return;
  
        // Implement very basic swap interval control
        Browser.mainLoop.currentFrameNumber = Browser.mainLoop.currentFrameNumber + 1 | 0;
        if (Browser.mainLoop.timingMode == 1/*EM_TIMING_RAF*/ && Browser.mainLoop.timingValue > 1 && Browser.mainLoop.currentFrameNumber % Browser.mainLoop.timingValue != 0) {
          // Not the scheduled time to render this frame - skip.
          Browser.mainLoop.scheduler();
          return;
        } else if (Browser.mainLoop.timingMode == 0/*EM_TIMING_SETTIMEOUT*/) {
          Browser.mainLoop.tickStartTime = _emscripten_get_now();
        }
  
        // Signal GL rendering layer that processing of a new frame is about to start. This helps it optimize
        // VBO double-buffering and reduce GPU stalls.
  
  
        if (Browser.mainLoop.method === 'timeout' && Module.ctx) {
          Module.printErr('Looks like you are rendering without using requestAnimationFrame for the main loop. You should use 0 for the frame rate in emscripten_set_main_loop in order to use requestAnimationFrame, as that can greatly improve your frame rates!');
          Browser.mainLoop.method = ''; // just warn once per call to set main loop
        }
  
        Browser.mainLoop.runIter(browserIterationFunc);
  
        checkStackCookie();
  
        // catch pauses from the main loop itself
        if (thisMainLoopId < Browser.mainLoop.currentlyRunningMainloop) return;
  
        // Queue new audio data. This is important to be right after the main loop invocation, so that we will immediately be able
        // to queue the newest produced audio samples.
        // TODO: Consider adding pre- and post- rAF callbacks so that GL.newRenderingFrameStarted() and SDL.audio.queueNewAudioData()
        //       do not need to be hardcoded into this function, but can be more generic.
        if (typeof SDL === 'object' && SDL.audio && SDL.audio.queueNewAudioData) SDL.audio.queueNewAudioData();
  
        Browser.mainLoop.scheduler();
      }
  
      if (!noSetTiming) {
        if (fps && fps > 0) _emscripten_set_main_loop_timing(0/*EM_TIMING_SETTIMEOUT*/, 1000.0 / fps);
        else _emscripten_set_main_loop_timing(1/*EM_TIMING_RAF*/, 1); // Do rAF by rendering each frame (no decimating)
  
        Browser.mainLoop.scheduler();
      }
  
      if (simulateInfiniteLoop) {
        throw 'SimulateInfiniteLoop';
      }
    }var Browser={mainLoop:{scheduler:null,method:"",currentlyRunningMainloop:0,func:null,arg:0,timingMode:0,timingValue:0,currentFrameNumber:0,queue:[],pause:function () {
          Browser.mainLoop.scheduler = null;
          Browser.mainLoop.currentlyRunningMainloop++; // Incrementing this signals the previous main loop that it's now become old, and it must return.
        },resume:function () {
          Browser.mainLoop.currentlyRunningMainloop++;
          var timingMode = Browser.mainLoop.timingMode;
          var timingValue = Browser.mainLoop.timingValue;
          var func = Browser.mainLoop.func;
          Browser.mainLoop.func = null;
          _emscripten_set_main_loop(func, 0, false, Browser.mainLoop.arg, true /* do not set timing and call scheduler, we will do it on the next lines */);
          _emscripten_set_main_loop_timing(timingMode, timingValue);
          Browser.mainLoop.scheduler();
        },updateStatus:function () {
          if (Module['setStatus']) {
            var message = Module['statusMessage'] || 'Please wait...';
            var remaining = Browser.mainLoop.remainingBlockers;
            var expected = Browser.mainLoop.expectedBlockers;
            if (remaining) {
              if (remaining < expected) {
                Module['setStatus'](message + ' (' + (expected - remaining) + '/' + expected + ')');
              } else {
                Module['setStatus'](message);
              }
            } else {
              Module['setStatus']('');
            }
          }
        },runIter:function (func) {
          if (ABORT) return;
          if (Module['preMainLoop']) {
            var preRet = Module['preMainLoop']();
            if (preRet === false) {
              return; // |return false| skips a frame
            }
          }
          try {
            func();
          } catch (e) {
            if (e instanceof ExitStatus) {
              return;
            } else {
              if (e && typeof e === 'object' && e.stack) Module.printErr('exception thrown: ' + [e, e.stack]);
              throw e;
            }
          }
          if (Module['postMainLoop']) Module['postMainLoop']();
        }},isFullscreen:false,pointerLock:false,moduleContextCreatedCallbacks:[],workers:[],init:function () {
        if (!Module["preloadPlugins"]) Module["preloadPlugins"] = []; // needs to exist even in workers
  
        if (Browser.initted) return;
        Browser.initted = true;
  
        try {
          new Blob();
          Browser.hasBlobConstructor = true;
        } catch(e) {
          Browser.hasBlobConstructor = false;
          console.log("warning: no blob constructor, cannot create blobs with mimetypes");
        }
        Browser.BlobBuilder = typeof MozBlobBuilder != "undefined" ? MozBlobBuilder : (typeof WebKitBlobBuilder != "undefined" ? WebKitBlobBuilder : (!Browser.hasBlobConstructor ? console.log("warning: no BlobBuilder") : null));
        Browser.URLObject = typeof window != "undefined" ? (window.URL ? window.URL : window.webkitURL) : undefined;
        if (!Module.noImageDecoding && typeof Browser.URLObject === 'undefined') {
          console.log("warning: Browser does not support creating object URLs. Built-in browser image decoding will not be available.");
          Module.noImageDecoding = true;
        }
  
        // Support for plugins that can process preloaded files. You can add more of these to
        // your app by creating and appending to Module.preloadPlugins.
        //
        // Each plugin is asked if it can handle a file based on the file's name. If it can,
        // it is given the file's raw data. When it is done, it calls a callback with the file's
        // (possibly modified) data. For example, a plugin might decompress a file, or it
        // might create some side data structure for use later (like an Image element, etc.).
  
        var imagePlugin = {};
        imagePlugin['canHandle'] = function imagePlugin_canHandle(name) {
          return !Module.noImageDecoding && /\.(jpg|jpeg|png|bmp)$/i.test(name);
        };
        imagePlugin['handle'] = function imagePlugin_handle(byteArray, name, onload, onerror) {
          var b = null;
          if (Browser.hasBlobConstructor) {
            try {
              b = new Blob([byteArray], { type: Browser.getMimetype(name) });
              if (b.size !== byteArray.length) { // Safari bug #118630
                // Safari's Blob can only take an ArrayBuffer
                b = new Blob([(new Uint8Array(byteArray)).buffer], { type: Browser.getMimetype(name) });
              }
            } catch(e) {
              Runtime.warnOnce('Blob constructor present but fails: ' + e + '; falling back to blob builder');
            }
          }
          if (!b) {
            var bb = new Browser.BlobBuilder();
            bb.append((new Uint8Array(byteArray)).buffer); // we need to pass a buffer, and must copy the array to get the right data range
            b = bb.getBlob();
          }
          var url = Browser.URLObject.createObjectURL(b);
          assert(typeof url == 'string', 'createObjectURL must return a url as a string');
          var img = new Image();
          img.onload = function img_onload() {
            assert(img.complete, 'Image ' + name + ' could not be decoded');
            var canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            var ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0);
            Module["preloadedImages"][name] = canvas;
            Browser.URLObject.revokeObjectURL(url);
            if (onload) onload(byteArray);
          };
          img.onerror = function img_onerror(event) {
            console.log('Image ' + url + ' could not be decoded');
            if (onerror) onerror();
          };
          img.src = url;
        };
        Module['preloadPlugins'].push(imagePlugin);
  
        var audioPlugin = {};
        audioPlugin['canHandle'] = function audioPlugin_canHandle(name) {
          return !Module.noAudioDecoding && name.substr(-4) in { '.ogg': 1, '.wav': 1, '.mp3': 1 };
        };
        audioPlugin['handle'] = function audioPlugin_handle(byteArray, name, onload, onerror) {
          var done = false;
          function finish(audio) {
            if (done) return;
            done = true;
            Module["preloadedAudios"][name] = audio;
            if (onload) onload(byteArray);
          }
          function fail() {
            if (done) return;
            done = true;
            Module["preloadedAudios"][name] = new Audio(); // empty shim
            if (onerror) onerror();
          }
          if (Browser.hasBlobConstructor) {
            try {
              var b = new Blob([byteArray], { type: Browser.getMimetype(name) });
            } catch(e) {
              return fail();
            }
            var url = Browser.URLObject.createObjectURL(b); // XXX we never revoke this!
            assert(typeof url == 'string', 'createObjectURL must return a url as a string');
            var audio = new Audio();
            audio.addEventListener('canplaythrough', function() { finish(audio) }, false); // use addEventListener due to chromium bug 124926
            audio.onerror = function audio_onerror(event) {
              if (done) return;
              console.log('warning: browser could not fully decode audio ' + name + ', trying slower base64 approach');
              function encode64(data) {
                var BASE = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
                var PAD = '=';
                var ret = '';
                var leftchar = 0;
                var leftbits = 0;
                for (var i = 0; i < data.length; i++) {
                  leftchar = (leftchar << 8) | data[i];
                  leftbits += 8;
                  while (leftbits >= 6) {
                    var curr = (leftchar >> (leftbits-6)) & 0x3f;
                    leftbits -= 6;
                    ret += BASE[curr];
                  }
                }
                if (leftbits == 2) {
                  ret += BASE[(leftchar&3) << 4];
                  ret += PAD + PAD;
                } else if (leftbits == 4) {
                  ret += BASE[(leftchar&0xf) << 2];
                  ret += PAD;
                }
                return ret;
              }
              audio.src = 'data:audio/x-' + name.substr(-3) + ';base64,' + encode64(byteArray);
              finish(audio); // we don't wait for confirmation this worked - but it's worth trying
            };
            audio.src = url;
            // workaround for chrome bug 124926 - we do not always get oncanplaythrough or onerror
            Browser.safeSetTimeout(function() {
              finish(audio); // try to use it even though it is not necessarily ready to play
            }, 10000);
          } else {
            return fail();
          }
        };
        Module['preloadPlugins'].push(audioPlugin);
  
        // Canvas event setup
  
        function pointerLockChange() {
          Browser.pointerLock = document['pointerLockElement'] === Module['canvas'] ||
                                document['mozPointerLockElement'] === Module['canvas'] ||
                                document['webkitPointerLockElement'] === Module['canvas'] ||
                                document['msPointerLockElement'] === Module['canvas'];
        }
        var canvas = Module['canvas'];
        if (canvas) {
          // forced aspect ratio can be enabled by defining 'forcedAspectRatio' on Module
          // Module['forcedAspectRatio'] = 4 / 3;
          
          canvas.requestPointerLock = canvas['requestPointerLock'] ||
                                      canvas['mozRequestPointerLock'] ||
                                      canvas['webkitRequestPointerLock'] ||
                                      canvas['msRequestPointerLock'] ||
                                      function(){};
          canvas.exitPointerLock = document['exitPointerLock'] ||
                                   document['mozExitPointerLock'] ||
                                   document['webkitExitPointerLock'] ||
                                   document['msExitPointerLock'] ||
                                   function(){}; // no-op if function does not exist
          canvas.exitPointerLock = canvas.exitPointerLock.bind(document);
  
          document.addEventListener('pointerlockchange', pointerLockChange, false);
          document.addEventListener('mozpointerlockchange', pointerLockChange, false);
          document.addEventListener('webkitpointerlockchange', pointerLockChange, false);
          document.addEventListener('mspointerlockchange', pointerLockChange, false);
  
          if (Module['elementPointerLock']) {
            canvas.addEventListener("click", function(ev) {
              if (!Browser.pointerLock && Module['canvas'].requestPointerLock) {
                Module['canvas'].requestPointerLock();
                ev.preventDefault();
              }
            }, false);
          }
        }
      },createContext:function (canvas, useWebGL, setInModule, webGLContextAttributes) {
        if (useWebGL && Module.ctx && canvas == Module.canvas) return Module.ctx; // no need to recreate GL context if it's already been created for this canvas.
  
        var ctx;
        var contextHandle;
        if (useWebGL) {
          // For GLES2/desktop GL compatibility, adjust a few defaults to be different to WebGL defaults, so that they align better with the desktop defaults.
          var contextAttributes = {
            antialias: false,
            alpha: false
          };
  
          if (webGLContextAttributes) {
            for (var attribute in webGLContextAttributes) {
              contextAttributes[attribute] = webGLContextAttributes[attribute];
            }
          }
  
          contextHandle = GL.createContext(canvas, contextAttributes);
          if (contextHandle) {
            ctx = GL.getContext(contextHandle).GLctx;
          }
        } else {
          ctx = canvas.getContext('2d');
        }
  
        if (!ctx) return null;
  
        if (setInModule) {
          if (!useWebGL) assert(typeof GLctx === 'undefined', 'cannot set in module if GLctx is used, but we are a non-GL context that would replace it');
  
          Module.ctx = ctx;
          if (useWebGL) GL.makeContextCurrent(contextHandle);
          Module.useWebGL = useWebGL;
          Browser.moduleContextCreatedCallbacks.forEach(function(callback) { callback() });
          Browser.init();
        }
        return ctx;
      },destroyContext:function (canvas, useWebGL, setInModule) {},fullscreenHandlersInstalled:false,lockPointer:undefined,resizeCanvas:undefined,requestFullscreen:function (lockPointer, resizeCanvas, vrDevice) {
        Browser.lockPointer = lockPointer;
        Browser.resizeCanvas = resizeCanvas;
        Browser.vrDevice = vrDevice;
        if (typeof Browser.lockPointer === 'undefined') Browser.lockPointer = true;
        if (typeof Browser.resizeCanvas === 'undefined') Browser.resizeCanvas = false;
        if (typeof Browser.vrDevice === 'undefined') Browser.vrDevice = null;
  
        var canvas = Module['canvas'];
        function fullscreenChange() {
          Browser.isFullscreen = false;
          var canvasContainer = canvas.parentNode;
          if ((document['fullscreenElement'] || document['mozFullScreenElement'] ||
               document['msFullscreenElement'] || document['webkitFullscreenElement'] ||
               document['webkitCurrentFullScreenElement']) === canvasContainer) {
            canvas.exitFullscreen = document['exitFullscreen'] ||
                                    document['cancelFullScreen'] ||
                                    document['mozCancelFullScreen'] ||
                                    document['msExitFullscreen'] ||
                                    document['webkitCancelFullScreen'] ||
                                    function() {};
            canvas.exitFullscreen = canvas.exitFullscreen.bind(document);
            if (Browser.lockPointer) canvas.requestPointerLock();
            Browser.isFullscreen = true;
            if (Browser.resizeCanvas) Browser.setFullscreenCanvasSize();
          } else {
            
            // remove the full screen specific parent of the canvas again to restore the HTML structure from before going full screen
            canvasContainer.parentNode.insertBefore(canvas, canvasContainer);
            canvasContainer.parentNode.removeChild(canvasContainer);
            
            if (Browser.resizeCanvas) Browser.setWindowedCanvasSize();
          }
          if (Module['onFullScreen']) Module['onFullScreen'](Browser.isFullscreen);
          if (Module['onFullscreen']) Module['onFullscreen'](Browser.isFullscreen);
          Browser.updateCanvasDimensions(canvas);
        }
  
        if (!Browser.fullscreenHandlersInstalled) {
          Browser.fullscreenHandlersInstalled = true;
          document.addEventListener('fullscreenchange', fullscreenChange, false);
          document.addEventListener('mozfullscreenchange', fullscreenChange, false);
          document.addEventListener('webkitfullscreenchange', fullscreenChange, false);
          document.addEventListener('MSFullscreenChange', fullscreenChange, false);
        }
  
        // create a new parent to ensure the canvas has no siblings. this allows browsers to optimize full screen performance when its parent is the full screen root
        var canvasContainer = document.createElement("div");
        canvas.parentNode.insertBefore(canvasContainer, canvas);
        canvasContainer.appendChild(canvas);
  
        // use parent of canvas as full screen root to allow aspect ratio correction (Firefox stretches the root to screen size)
        canvasContainer.requestFullscreen = canvasContainer['requestFullscreen'] ||
                                            canvasContainer['mozRequestFullScreen'] ||
                                            canvasContainer['msRequestFullscreen'] ||
                                           (canvasContainer['webkitRequestFullscreen'] ? function() { canvasContainer['webkitRequestFullscreen'](Element['ALLOW_KEYBOARD_INPUT']) } : null) ||
                                           (canvasContainer['webkitRequestFullScreen'] ? function() { canvasContainer['webkitRequestFullScreen'](Element['ALLOW_KEYBOARD_INPUT']) } : null);
  
        if (vrDevice) {
          canvasContainer.requestFullscreen({ vrDisplay: vrDevice });
        } else {
          canvasContainer.requestFullscreen();
        }
      },requestFullScreen:function (lockPointer, resizeCanvas, vrDevice) {
          Module.printErr('Browser.requestFullScreen() is deprecated. Please call Browser.requestFullscreen instead.');
          Browser.requestFullScreen = function(lockPointer, resizeCanvas, vrDevice) {
            return Browser.requestFullscreen(lockPointer, resizeCanvas, vrDevice);
          }
          return Browser.requestFullscreen(lockPointer, resizeCanvas, vrDevice);
      },nextRAF:0,fakeRequestAnimationFrame:function (func) {
        // try to keep 60fps between calls to here
        var now = Date.now();
        if (Browser.nextRAF === 0) {
          Browser.nextRAF = now + 1000/60;
        } else {
          while (now + 2 >= Browser.nextRAF) { // fudge a little, to avoid timer jitter causing us to do lots of delay:0
            Browser.nextRAF += 1000/60;
          }
        }
        var delay = Math.max(Browser.nextRAF - now, 0);
        setTimeout(func, delay);
      },requestAnimationFrame:function requestAnimationFrame(func) {
        if (typeof window === 'undefined') { // Provide fallback to setTimeout if window is undefined (e.g. in Node.js)
          Browser.fakeRequestAnimationFrame(func);
        } else {
          if (!window.requestAnimationFrame) {
            window.requestAnimationFrame = window['requestAnimationFrame'] ||
                                           window['mozRequestAnimationFrame'] ||
                                           window['webkitRequestAnimationFrame'] ||
                                           window['msRequestAnimationFrame'] ||
                                           window['oRequestAnimationFrame'] ||
                                           Browser.fakeRequestAnimationFrame;
          }
          window.requestAnimationFrame(func);
        }
      },safeCallback:function (func) {
        return function() {
          if (!ABORT) return func.apply(null, arguments);
        };
      },allowAsyncCallbacks:true,queuedAsyncCallbacks:[],pauseAsyncCallbacks:function () {
        Browser.allowAsyncCallbacks = false;
      },resumeAsyncCallbacks:function () { // marks future callbacks as ok to execute, and synchronously runs any remaining ones right now
        Browser.allowAsyncCallbacks = true;
        if (Browser.queuedAsyncCallbacks.length > 0) {
          var callbacks = Browser.queuedAsyncCallbacks;
          Browser.queuedAsyncCallbacks = [];
          callbacks.forEach(function(func) {
            func();
          });
        }
      },safeRequestAnimationFrame:function (func) {
        return Browser.requestAnimationFrame(function() {
          if (ABORT) return;
          if (Browser.allowAsyncCallbacks) {
            func();
          } else {
            Browser.queuedAsyncCallbacks.push(func);
          }
        });
      },safeSetTimeout:function (func, timeout) {
        Module['noExitRuntime'] = true;
        return setTimeout(function() {
          if (ABORT) return;
          if (Browser.allowAsyncCallbacks) {
            func();
          } else {
            Browser.queuedAsyncCallbacks.push(func);
          }
        }, timeout);
      },safeSetInterval:function (func, timeout) {
        Module['noExitRuntime'] = true;
        return setInterval(function() {
          if (ABORT) return;
          if (Browser.allowAsyncCallbacks) {
            func();
          } // drop it on the floor otherwise, next interval will kick in
        }, timeout);
      },getMimetype:function (name) {
        return {
          'jpg': 'image/jpeg',
          'jpeg': 'image/jpeg',
          'png': 'image/png',
          'bmp': 'image/bmp',
          'ogg': 'audio/ogg',
          'wav': 'audio/wav',
          'mp3': 'audio/mpeg'
        }[name.substr(name.lastIndexOf('.')+1)];
      },getUserMedia:function (func) {
        if(!window.getUserMedia) {
          window.getUserMedia = navigator['getUserMedia'] ||
                                navigator['mozGetUserMedia'];
        }
        window.getUserMedia(func);
      },getMovementX:function (event) {
        return event['movementX'] ||
               event['mozMovementX'] ||
               event['webkitMovementX'] ||
               0;
      },getMovementY:function (event) {
        return event['movementY'] ||
               event['mozMovementY'] ||
               event['webkitMovementY'] ||
               0;
      },getMouseWheelDelta:function (event) {
        var delta = 0;
        switch (event.type) {
          case 'DOMMouseScroll': 
            delta = event.detail;
            break;
          case 'mousewheel': 
            delta = event.wheelDelta;
            break;
          case 'wheel': 
            delta = event['deltaY'];
            break;
          default:
            throw 'unrecognized mouse wheel event: ' + event.type;
        }
        return delta;
      },mouseX:0,mouseY:0,mouseMovementX:0,mouseMovementY:0,touches:{},lastTouches:{},calculateMouseEvent:function (event) { // event should be mousemove, mousedown or mouseup
        if (Browser.pointerLock) {
          // When the pointer is locked, calculate the coordinates
          // based on the movement of the mouse.
          // Workaround for Firefox bug 764498
          if (event.type != 'mousemove' &&
              ('mozMovementX' in event)) {
            Browser.mouseMovementX = Browser.mouseMovementY = 0;
          } else {
            Browser.mouseMovementX = Browser.getMovementX(event);
            Browser.mouseMovementY = Browser.getMovementY(event);
          }
          
          // check if SDL is available
          if (typeof SDL != "undefined") {
          	Browser.mouseX = SDL.mouseX + Browser.mouseMovementX;
          	Browser.mouseY = SDL.mouseY + Browser.mouseMovementY;
          } else {
          	// just add the mouse delta to the current absolut mouse position
          	// FIXME: ideally this should be clamped against the canvas size and zero
          	Browser.mouseX += Browser.mouseMovementX;
          	Browser.mouseY += Browser.mouseMovementY;
          }        
        } else {
          // Otherwise, calculate the movement based on the changes
          // in the coordinates.
          var rect = Module["canvas"].getBoundingClientRect();
          var cw = Module["canvas"].width;
          var ch = Module["canvas"].height;
  
          // Neither .scrollX or .pageXOffset are defined in a spec, but
          // we prefer .scrollX because it is currently in a spec draft.
          // (see: http://www.w3.org/TR/2013/WD-cssom-view-20131217/)
          var scrollX = ((typeof window.scrollX !== 'undefined') ? window.scrollX : window.pageXOffset);
          var scrollY = ((typeof window.scrollY !== 'undefined') ? window.scrollY : window.pageYOffset);
          // If this assert lands, it's likely because the browser doesn't support scrollX or pageXOffset
          // and we have no viable fallback.
          assert((typeof scrollX !== 'undefined') && (typeof scrollY !== 'undefined'), 'Unable to retrieve scroll position, mouse positions likely broken.');
  
          if (event.type === 'touchstart' || event.type === 'touchend' || event.type === 'touchmove') {
            var touch = event.touch;
            if (touch === undefined) {
              return; // the "touch" property is only defined in SDL
  
            }
            var adjustedX = touch.pageX - (scrollX + rect.left);
            var adjustedY = touch.pageY - (scrollY + rect.top);
  
            adjustedX = adjustedX * (cw / rect.width);
            adjustedY = adjustedY * (ch / rect.height);
  
            var coords = { x: adjustedX, y: adjustedY };
            
            if (event.type === 'touchstart') {
              Browser.lastTouches[touch.identifier] = coords;
              Browser.touches[touch.identifier] = coords;
            } else if (event.type === 'touchend' || event.type === 'touchmove') {
              var last = Browser.touches[touch.identifier];
              if (!last) last = coords;
              Browser.lastTouches[touch.identifier] = last;
              Browser.touches[touch.identifier] = coords;
            } 
            return;
          }
  
          var x = event.pageX - (scrollX + rect.left);
          var y = event.pageY - (scrollY + rect.top);
  
          // the canvas might be CSS-scaled compared to its backbuffer;
          // SDL-using content will want mouse coordinates in terms
          // of backbuffer units.
          x = x * (cw / rect.width);
          y = y * (ch / rect.height);
  
          Browser.mouseMovementX = x - Browser.mouseX;
          Browser.mouseMovementY = y - Browser.mouseY;
          Browser.mouseX = x;
          Browser.mouseY = y;
        }
      },asyncLoad:function (url, onload, onerror, noRunDep) {
        var dep = !noRunDep ? getUniqueRunDependency('al ' + url) : '';
        Module['readAsync'](url, function(arrayBuffer) {
          assert(arrayBuffer, 'Loading data file "' + url + '" failed (no arrayBuffer).');
          onload(new Uint8Array(arrayBuffer));
          if (dep) removeRunDependency(dep);
        }, function(event) {
          if (onerror) {
            onerror();
          } else {
            throw 'Loading data file "' + url + '" failed.';
          }
        });
        if (dep) addRunDependency(dep);
      },resizeListeners:[],updateResizeListeners:function () {
        var canvas = Module['canvas'];
        Browser.resizeListeners.forEach(function(listener) {
          listener(canvas.width, canvas.height);
        });
      },setCanvasSize:function (width, height, noUpdates) {
        var canvas = Module['canvas'];
        Browser.updateCanvasDimensions(canvas, width, height);
        if (!noUpdates) Browser.updateResizeListeners();
      },windowedWidth:0,windowedHeight:0,setFullscreenCanvasSize:function () {
        // check if SDL is available   
        if (typeof SDL != "undefined") {
        	var flags = HEAPU32[((SDL.screen+Runtime.QUANTUM_SIZE*0)>>2)];
        	flags = flags | 0x00800000; // set SDL_FULLSCREEN flag
        	HEAP32[((SDL.screen+Runtime.QUANTUM_SIZE*0)>>2)]=flags
        }
        Browser.updateResizeListeners();
      },setWindowedCanvasSize:function () {
        // check if SDL is available       
        if (typeof SDL != "undefined") {
        	var flags = HEAPU32[((SDL.screen+Runtime.QUANTUM_SIZE*0)>>2)];
        	flags = flags & ~0x00800000; // clear SDL_FULLSCREEN flag
        	HEAP32[((SDL.screen+Runtime.QUANTUM_SIZE*0)>>2)]=flags
        }
        Browser.updateResizeListeners();
      },updateCanvasDimensions:function (canvas, wNative, hNative) {
        if (wNative && hNative) {
          canvas.widthNative = wNative;
          canvas.heightNative = hNative;
        } else {
          wNative = canvas.widthNative;
          hNative = canvas.heightNative;
        }
        var w = wNative;
        var h = hNative;
        if (Module['forcedAspectRatio'] && Module['forcedAspectRatio'] > 0) {
          if (w/h < Module['forcedAspectRatio']) {
            w = Math.round(h * Module['forcedAspectRatio']);
          } else {
            h = Math.round(w / Module['forcedAspectRatio']);
          }
        }
        if (((document['fullscreenElement'] || document['mozFullScreenElement'] ||
             document['msFullscreenElement'] || document['webkitFullscreenElement'] ||
             document['webkitCurrentFullScreenElement']) === canvas.parentNode) && (typeof screen != 'undefined')) {
           var factor = Math.min(screen.width / w, screen.height / h);
           w = Math.round(w * factor);
           h = Math.round(h * factor);
        }
        if (Browser.resizeCanvas) {
          if (canvas.width  != w) canvas.width  = w;
          if (canvas.height != h) canvas.height = h;
          if (typeof canvas.style != 'undefined') {
            canvas.style.removeProperty( "width");
            canvas.style.removeProperty("height");
          }
        } else {
          if (canvas.width  != wNative) canvas.width  = wNative;
          if (canvas.height != hNative) canvas.height = hNative;
          if (typeof canvas.style != 'undefined') {
            if (w != wNative || h != hNative) {
              canvas.style.setProperty( "width", w + "px", "important");
              canvas.style.setProperty("height", h + "px", "important");
            } else {
              canvas.style.removeProperty( "width");
              canvas.style.removeProperty("height");
            }
          }
        }
      },wgetRequests:{},nextWgetRequestHandle:0,getNextWgetRequestHandle:function () {
        var handle = Browser.nextWgetRequestHandle;
        Browser.nextWgetRequestHandle++;
        return handle;
      }};function _emscripten_sleep(ms) {
      Module['asm'].setAsync(); // tell the scheduler that we have a callback on hold
      Browser.safeSetTimeout(_emscripten_async_resume, ms);
    }

  function _pthread_once(ptr, func) {
      if (!_pthread_once.seen) _pthread_once.seen = {};
      if (ptr in _pthread_once.seen) return;
      Module['dynCall_v'](func);
      _pthread_once.seen[ptr] = 1;
    }

  function ___lock() {}

  function ___unlock() {}

  
  var PTHREAD_SPECIFIC={};function _pthread_getspecific(key) {
      return PTHREAD_SPECIFIC[key] || 0;
    }

  
  var PTHREAD_SPECIFIC_NEXT_KEY=1;function _pthread_key_create(key, destructor) {
      if (key == 0) {
        return ERRNO_CODES.EINVAL;
      }
      HEAP32[((key)>>2)]=PTHREAD_SPECIFIC_NEXT_KEY;
      // values start at 0
      PTHREAD_SPECIFIC[PTHREAD_SPECIFIC_NEXT_KEY] = 0;
      PTHREAD_SPECIFIC_NEXT_KEY++;
      return 0;
    }

  var _emscripten_asm_const_int=true;

  function ___syscall330(which, varargs) {SYSCALLS.varargs = varargs;
  try {
   // dup3
      var old = SYSCALLS.getStreamFromFD(), suggestFD = SYSCALLS.get(), flags = SYSCALLS.get();
      assert(!flags);
      if (old.fd === suggestFD) return -ERRNO_CODES.EINVAL;
      return SYSCALLS.doDup(old.path, old.flags, suggestFD);
    } catch (e) {
    if (typeof FS === 'undefined' || !(e instanceof FS.ErrnoError)) abort(e);
    return -e.errno;
  }
  }

  function _pthread_setspecific(key, value) {
      if (!(key in PTHREAD_SPECIFIC)) {
        return ERRNO_CODES.EINVAL;
      }
      PTHREAD_SPECIFIC[key] = value;
      return 0;
    }

  function ___cxa_allocate_exception(size) {
      return _malloc(size);
    }

  function ___syscall54(which, varargs) {SYSCALLS.varargs = varargs;
  try {
   // ioctl
      var stream = SYSCALLS.getStreamFromFD(), op = SYSCALLS.get();
      switch (op) {
        case 21505: {
          if (!stream.tty) return -ERRNO_CODES.ENOTTY;
          return 0;
        }
        case 21506: {
          if (!stream.tty) return -ERRNO_CODES.ENOTTY;
          return 0; // no-op, not actually adjusting terminal settings
        }
        case 21519: {
          if (!stream.tty) return -ERRNO_CODES.ENOTTY;
          var argp = SYSCALLS.get();
          HEAP32[((argp)>>2)]=0;
          return 0;
        }
        case 21520: {
          if (!stream.tty) return -ERRNO_CODES.ENOTTY;
          return -ERRNO_CODES.EINVAL; // not supported
        }
        case 21531: {
          var argp = SYSCALLS.get();
          return FS.ioctl(stream, op, argp);
        }
        case 21523: {
          // TODO: in theory we should write to the winsize struct that gets
          // passed in, but for now musl doesn't read anything on it
          if (!stream.tty) return -ERRNO_CODES.ENOTTY;
          return 0;
        }
        default: abort('bad ioctl syscall ' + op);
      }
    } catch (e) {
    if (typeof FS === 'undefined' || !(e instanceof FS.ErrnoError)) abort(e);
    return -e.errno;
  }
  }

   

  function ___cxa_pure_virtual() {
      ABORT = true;
      throw 'Pure virtual function called!';
    }

   

   

  function ___cxa_find_matching_catch_2() {
          return ___cxa_find_matching_catch.apply(null, arguments);
        }

  function ___cxa_find_matching_catch_3() {
          return ___cxa_find_matching_catch.apply(null, arguments);
        }

  function ___cxa_begin_catch(ptr) {
      var info = EXCEPTIONS.infos[ptr];
      if (info && !info.caught) {
        info.caught = true;
        __ZSt18uncaught_exceptionv.uncaught_exception--;
      }
      if (info) info.rethrown = false;
      EXCEPTIONS.caught.push(ptr);
      EXCEPTIONS.addRef(EXCEPTIONS.deAdjust(ptr));
      return ptr;
    }

  function ___syscall5(which, varargs) {SYSCALLS.varargs = varargs;
  try {
   // open
      var pathname = SYSCALLS.getStr(), flags = SYSCALLS.get(), mode = SYSCALLS.get() // optional TODO
      var stream = FS.open(pathname, flags, mode);
      return stream.fd;
    } catch (e) {
    if (typeof FS === 'undefined' || !(e instanceof FS.ErrnoError)) abort(e);
    return -e.errno;
  }
  }

  
  function _emscripten_memcpy_big(dest, src, num) {
      HEAPU8.set(HEAPU8.subarray(src, src+num), dest);
      return dest;
    } 

  function ___syscall6(which, varargs) {SYSCALLS.varargs = varargs;
  try {
   // close
      var stream = SYSCALLS.getStreamFromFD();
      FS.close(stream);
      return 0;
    } catch (e) {
    if (typeof FS === 'undefined' || !(e instanceof FS.ErrnoError)) abort(e);
    return -e.errno;
  }
  }

  
  
  var cttz_i8 = allocate([8,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0,4,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0,5,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0,4,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0,6,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0,4,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0,5,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0,4,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0,7,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0,4,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0,5,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0,4,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0,6,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0,4,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0,5,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0,4,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0], "i8", ALLOC_STATIC);   

   

  function ___gxx_personality_v0() {
    }

   

   


  function ___syscall140(which, varargs) {SYSCALLS.varargs = varargs;
  try {
   // llseek
      var stream = SYSCALLS.getStreamFromFD(), offset_high = SYSCALLS.get(), offset_low = SYSCALLS.get(), result = SYSCALLS.get(), whence = SYSCALLS.get();
      // NOTE: offset_high is unused - Emscripten's off_t is 32-bit
      var offset = offset_low;
      FS.llseek(stream, offset, whence);
      HEAP32[((result)>>2)]=stream.position;
      if (stream.getdents && offset === 0 && whence === 0) stream.getdents = null; // reset readdir state
      return 0;
    } catch (e) {
    if (typeof FS === 'undefined' || !(e instanceof FS.ErrnoError)) abort(e);
    return -e.errno;
  }
  }

  function ___syscall145(which, varargs) {SYSCALLS.varargs = varargs;
  try {
   // readv
      var stream = SYSCALLS.getStreamFromFD(), iov = SYSCALLS.get(), iovcnt = SYSCALLS.get();
      return SYSCALLS.doReadv(stream, iov, iovcnt);
    } catch (e) {
    if (typeof FS === 'undefined' || !(e instanceof FS.ErrnoError)) abort(e);
    return -e.errno;
  }
  }

  function ___syscall146(which, varargs) {SYSCALLS.varargs = varargs;
  try {
   // writev
      var stream = SYSCALLS.getStreamFromFD(), iov = SYSCALLS.get(), iovcnt = SYSCALLS.get();
      return SYSCALLS.doWritev(stream, iov, iovcnt);
    } catch (e) {
    if (typeof FS === 'undefined' || !(e instanceof FS.ErrnoError)) abort(e);
    return -e.errno;
  }
  }

  function ___syscall221(which, varargs) {SYSCALLS.varargs = varargs;
  try {
   // fcntl64
      var stream = SYSCALLS.getStreamFromFD(), cmd = SYSCALLS.get();
      switch (cmd) {
        case 0: {
          var arg = SYSCALLS.get();
          if (arg < 0) {
            return -ERRNO_CODES.EINVAL;
          }
          var newStream;
          newStream = FS.open(stream.path, stream.flags, 0, arg);
          return newStream.fd;
        }
        case 1:
        case 2:
          return 0;  // FD_CLOEXEC makes no sense for a single process.
        case 3:
          return stream.flags;
        case 4: {
          var arg = SYSCALLS.get();
          stream.flags |= arg;
          return 0;
        }
        case 12:
        case 12: {
          var arg = SYSCALLS.get();
          var offset = 0;
          // We're always unlocked.
          HEAP16[(((arg)+(offset))>>1)]=2;
          return 0;
        }
        case 13:
        case 14:
        case 13:
        case 14:
          return 0; // Pretend that the locking is successful.
        case 16:
        case 8:
          return -ERRNO_CODES.EINVAL; // These are for sockets. We don't have them fully implemented yet.
        case 9:
          // musl trusts getown return values, due to a bug where they must be, as they overlap with errors. just return -1 here, so fnctl() returns that, and we set errno ourselves.
          ___setErrNo(ERRNO_CODES.EINVAL);
          return -1;
        default: {
          return -ERRNO_CODES.EINVAL;
        }
      }
    } catch (e) {
    if (typeof FS === 'undefined' || !(e instanceof FS.ErrnoError)) abort(e);
    return -e.errno;
  }
  }

   
if (ENVIRONMENT_IS_NODE) {
    _emscripten_get_now = function _emscripten_get_now_actual() {
      var t = process['hrtime']();
      return t[0] * 1e3 + t[1] / 1e6;
    };
  } else if (typeof dateNow !== 'undefined') {
    _emscripten_get_now = dateNow;
  } else if (typeof self === 'object' && self['performance'] && typeof self['performance']['now'] === 'function') {
    _emscripten_get_now = function() { return self['performance']['now'](); };
  } else if (typeof performance === 'object' && typeof performance['now'] === 'function') {
    _emscripten_get_now = function() { return performance['now'](); };
  } else {
    _emscripten_get_now = Date.now;
  };
FS.staticInit();__ATINIT__.unshift(function() { if (!Module["noFSInit"] && !FS.init.initialized) FS.init() });__ATMAIN__.push(function() { FS.ignorePermissions = false });__ATEXIT__.push(function() { FS.quit() });Module["FS_createFolder"] = FS.createFolder;Module["FS_createPath"] = FS.createPath;Module["FS_createDataFile"] = FS.createDataFile;Module["FS_createPreloadedFile"] = FS.createPreloadedFile;Module["FS_createLazyFile"] = FS.createLazyFile;Module["FS_createLink"] = FS.createLink;Module["FS_createDevice"] = FS.createDevice;Module["FS_unlink"] = FS.unlink;;
__ATINIT__.unshift(function() { TTY.init() });__ATEXIT__.push(function() { TTY.shutdown() });;
if (ENVIRONMENT_IS_NODE) { var fs = require("fs"); var NODEJS_PATH = require("path"); NODEFS.staticInit(); };
Module["requestFullScreen"] = function Module_requestFullScreen(lockPointer, resizeCanvas, vrDevice) { Module.printErr("Module.requestFullScreen is deprecated. Please call Module.requestFullscreen instead."); Module["requestFullScreen"] = Module["requestFullscreen"]; Browser.requestFullScreen(lockPointer, resizeCanvas, vrDevice) };
  Module["requestFullscreen"] = function Module_requestFullscreen(lockPointer, resizeCanvas, vrDevice) { Browser.requestFullscreen(lockPointer, resizeCanvas, vrDevice) };
  Module["requestAnimationFrame"] = function Module_requestAnimationFrame(func) { Browser.requestAnimationFrame(func) };
  Module["setCanvasSize"] = function Module_setCanvasSize(width, height, noUpdates) { Browser.setCanvasSize(width, height, noUpdates) };
  Module["pauseMainLoop"] = function Module_pauseMainLoop() { Browser.mainLoop.pause() };
  Module["resumeMainLoop"] = function Module_resumeMainLoop() { Browser.mainLoop.resume() };
  Module["getUserMedia"] = function Module_getUserMedia() { Browser.getUserMedia() }
  Module["createContext"] = function Module_createContext(canvas, useWebGL, setInModule, webGLContextAttributes) { return Browser.createContext(canvas, useWebGL, setInModule, webGLContextAttributes) };
DYNAMICTOP_PTR = allocate(1, "i32", ALLOC_STATIC);

STACK_BASE = STACKTOP = Runtime.alignMemory(STATICTOP);

STACK_MAX = STACK_BASE + TOTAL_STACK;

DYNAMIC_BASE = Runtime.alignMemory(STACK_MAX);

HEAP32[DYNAMICTOP_PTR>>2] = DYNAMIC_BASE;

staticSealed = true; // seal the static portion of memory

assert(DYNAMIC_BASE < TOTAL_MEMORY, "TOTAL_MEMORY not big enough for stack");


function nullFunc_iiii(x) { Module["printErr"]("Invalid function pointer called with signature 'iiii'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  Module["printErr"]("Build with ASSERTIONS=2 for more info.");abort(x) }

function nullFunc_viiiii(x) { Module["printErr"]("Invalid function pointer called with signature 'viiiii'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  Module["printErr"]("Build with ASSERTIONS=2 for more info.");abort(x) }

function nullFunc_i(x) { Module["printErr"]("Invalid function pointer called with signature 'i'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  Module["printErr"]("Build with ASSERTIONS=2 for more info.");abort(x) }

function nullFunc_vi(x) { Module["printErr"]("Invalid function pointer called with signature 'vi'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  Module["printErr"]("Build with ASSERTIONS=2 for more info.");abort(x) }

function nullFunc_vii(x) { Module["printErr"]("Invalid function pointer called with signature 'vii'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  Module["printErr"]("Build with ASSERTIONS=2 for more info.");abort(x) }

function nullFunc_ii(x) { Module["printErr"]("Invalid function pointer called with signature 'ii'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  Module["printErr"]("Build with ASSERTIONS=2 for more info.");abort(x) }

function nullFunc_viii(x) { Module["printErr"]("Invalid function pointer called with signature 'viii'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  Module["printErr"]("Build with ASSERTIONS=2 for more info.");abort(x) }

function nullFunc_v(x) { Module["printErr"]("Invalid function pointer called with signature 'v'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  Module["printErr"]("Build with ASSERTIONS=2 for more info.");abort(x) }

function nullFunc_viiiiii(x) { Module["printErr"]("Invalid function pointer called with signature 'viiiiii'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  Module["printErr"]("Build with ASSERTIONS=2 for more info.");abort(x) }

function nullFunc_iii(x) { Module["printErr"]("Invalid function pointer called with signature 'iii'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  Module["printErr"]("Build with ASSERTIONS=2 for more info.");abort(x) }

function nullFunc_viiii(x) { Module["printErr"]("Invalid function pointer called with signature 'viiii'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  Module["printErr"]("Build with ASSERTIONS=2 for more info.");abort(x) }

function invoke_iiii(index,a1,a2,a3) {
  try {
    return Module["dynCall_iiii"](index,a1,a2,a3);
  } catch(e) {
    if (typeof e !== 'number' && e !== 'longjmp') throw e;
    Module["setThrew"](1, 0);
  }
}

function invoke_viiiii(index,a1,a2,a3,a4,a5) {
  try {
    Module["dynCall_viiiii"](index,a1,a2,a3,a4,a5);
  } catch(e) {
    if (typeof e !== 'number' && e !== 'longjmp') throw e;
    Module["setThrew"](1, 0);
  }
}

function invoke_i(index) {
  try {
    return Module["dynCall_i"](index);
  } catch(e) {
    if (typeof e !== 'number' && e !== 'longjmp') throw e;
    Module["setThrew"](1, 0);
  }
}

function invoke_vi(index,a1) {
  try {
    Module["dynCall_vi"](index,a1);
  } catch(e) {
    if (typeof e !== 'number' && e !== 'longjmp') throw e;
    Module["setThrew"](1, 0);
  }
}

function invoke_vii(index,a1,a2) {
  try {
    Module["dynCall_vii"](index,a1,a2);
  } catch(e) {
    if (typeof e !== 'number' && e !== 'longjmp') throw e;
    Module["setThrew"](1, 0);
  }
}

function invoke_ii(index,a1) {
  try {
    return Module["dynCall_ii"](index,a1);
  } catch(e) {
    if (typeof e !== 'number' && e !== 'longjmp') throw e;
    Module["setThrew"](1, 0);
  }
}

function invoke_viii(index,a1,a2,a3) {
  try {
    Module["dynCall_viii"](index,a1,a2,a3);
  } catch(e) {
    if (typeof e !== 'number' && e !== 'longjmp') throw e;
    Module["setThrew"](1, 0);
  }
}

function invoke_v(index) {
  try {
    Module["dynCall_v"](index);
  } catch(e) {
    if (typeof e !== 'number' && e !== 'longjmp') throw e;
    Module["setThrew"](1, 0);
  }
}

function invoke_viiiiii(index,a1,a2,a3,a4,a5,a6) {
  try {
    Module["dynCall_viiiiii"](index,a1,a2,a3,a4,a5,a6);
  } catch(e) {
    if (typeof e !== 'number' && e !== 'longjmp') throw e;
    Module["setThrew"](1, 0);
  }
}

function invoke_iii(index,a1,a2) {
  try {
    return Module["dynCall_iii"](index,a1,a2);
  } catch(e) {
    if (typeof e !== 'number' && e !== 'longjmp') throw e;
    Module["setThrew"](1, 0);
  }
}

function invoke_viiii(index,a1,a2,a3,a4) {
  try {
    Module["dynCall_viiii"](index,a1,a2,a3,a4);
  } catch(e) {
    if (typeof e !== 'number' && e !== 'longjmp') throw e;
    Module["setThrew"](1, 0);
  }
}

Module.asmGlobalArg = { "Math": Math, "Int8Array": Int8Array, "Int16Array": Int16Array, "Int32Array": Int32Array, "Uint8Array": Uint8Array, "Uint16Array": Uint16Array, "Uint32Array": Uint32Array, "Float32Array": Float32Array, "Float64Array": Float64Array, "NaN": NaN, "Infinity": Infinity };

Module.asmLibraryArg = { "abort": abort, "assert": assert, "enlargeMemory": enlargeMemory, "getTotalMemory": getTotalMemory, "abortOnCannotGrowMemory": abortOnCannotGrowMemory, "abortStackOverflow": abortStackOverflow, "nullFunc_iiii": nullFunc_iiii, "nullFunc_viiiii": nullFunc_viiiii, "nullFunc_i": nullFunc_i, "nullFunc_vi": nullFunc_vi, "nullFunc_vii": nullFunc_vii, "nullFunc_ii": nullFunc_ii, "nullFunc_viii": nullFunc_viii, "nullFunc_v": nullFunc_v, "nullFunc_viiiiii": nullFunc_viiiiii, "nullFunc_iii": nullFunc_iii, "nullFunc_viiii": nullFunc_viiii, "invoke_iiii": invoke_iiii, "invoke_viiiii": invoke_viiiii, "invoke_i": invoke_i, "invoke_vi": invoke_vi, "invoke_vii": invoke_vii, "invoke_ii": invoke_ii, "invoke_viii": invoke_viii, "invoke_v": invoke_v, "invoke_viiiiii": invoke_viiiiii, "invoke_iii": invoke_iii, "invoke_viiii": invoke_viiii, "___syscall221": ___syscall221, "_emscripten_get_now_is_monotonic": _emscripten_get_now_is_monotonic, "_emscripten_asm_const_iiiii": _emscripten_asm_const_iiiii, "_pthread_key_create": _pthread_key_create, "___syscall63": ___syscall63, "_abort": _abort, "___setErrNo": ___setErrNo, "___gxx_personality_v0": ___gxx_personality_v0, "___cxa_free_exception": ___cxa_free_exception, "___cxa_find_matching_catch_2": ___cxa_find_matching_catch_2, "___cxa_find_matching_catch": ___cxa_find_matching_catch, "_emscripten_asm_const_ii": _emscripten_asm_const_ii, "_emscripten_asm_const_i": _emscripten_asm_const_i, "_clock_gettime": _clock_gettime, "_emscripten_set_main_loop_timing": _emscripten_set_main_loop_timing, "___syscall330": ___syscall330, "___cxa_begin_catch": ___cxa_begin_catch, "_emscripten_memcpy_big": _emscripten_memcpy_big, "___cxa_end_catch": ___cxa_end_catch, "___resumeException": ___resumeException, "__ZSt18uncaught_exceptionv": __ZSt18uncaught_exceptionv, "_pthread_getspecific": _pthread_getspecific, "___cxa_find_matching_catch_3": ___cxa_find_matching_catch_3, "_pthread_once": _pthread_once, "___syscall54": ___syscall54, "___unlock": ___unlock, "_emscripten_sleep": _emscripten_sleep, "_emscripten_set_main_loop": _emscripten_set_main_loop, "_emscripten_asm_const_iii": _emscripten_asm_const_iii, "_pthread_setspecific": _pthread_setspecific, "_emscripten_asm_const_iiii": _emscripten_asm_const_iiii, "___cxa_throw": ___cxa_throw, "___lock": ___lock, "___syscall6": ___syscall6, "___syscall5": ___syscall5, "___cxa_pure_virtual": ___cxa_pure_virtual, "_emscripten_get_now": _emscripten_get_now, "___cxa_allocate_exception": ___cxa_allocate_exception, "___syscall140": ___syscall140, "___syscall145": ___syscall145, "___syscall146": ___syscall146, "DYNAMICTOP_PTR": DYNAMICTOP_PTR, "tempDoublePtr": tempDoublePtr, "ABORT": ABORT, "STACKTOP": STACKTOP, "STACK_MAX": STACK_MAX, "cttz_i8": cttz_i8, "___async": ___async, "___async_unwind": ___async_unwind, "___async_retval": ___async_retval, "___async_cur_frame": ___async_cur_frame };
// EMSCRIPTEN_START_ASM
var asm = (function(global, env, buffer) {
'almost asm';


  var HEAP8 = new global.Int8Array(buffer);
  var HEAP16 = new global.Int16Array(buffer);
  var HEAP32 = new global.Int32Array(buffer);
  var HEAPU8 = new global.Uint8Array(buffer);
  var HEAPU16 = new global.Uint16Array(buffer);
  var HEAPU32 = new global.Uint32Array(buffer);
  var HEAPF32 = new global.Float32Array(buffer);
  var HEAPF64 = new global.Float64Array(buffer);

  var DYNAMICTOP_PTR=env.DYNAMICTOP_PTR|0;
  var tempDoublePtr=env.tempDoublePtr|0;
  var ABORT=env.ABORT|0;
  var STACKTOP=env.STACKTOP|0;
  var STACK_MAX=env.STACK_MAX|0;
  var cttz_i8=env.cttz_i8|0;
  var ___async=env.___async|0;
  var ___async_unwind=env.___async_unwind|0;
  var ___async_retval=env.___async_retval|0;
  var ___async_cur_frame=env.___async_cur_frame|0;

  var __THREW__ = 0;
  var threwValue = 0;
  var setjmpId = 0;
  var undef = 0;
  var nan = global.NaN, inf = global.Infinity;
  var tempInt = 0, tempBigInt = 0, tempBigIntS = 0, tempValue = 0, tempDouble = 0.0;
  var tempRet0 = 0;

  var Math_floor=global.Math.floor;
  var Math_abs=global.Math.abs;
  var Math_sqrt=global.Math.sqrt;
  var Math_pow=global.Math.pow;
  var Math_cos=global.Math.cos;
  var Math_sin=global.Math.sin;
  var Math_tan=global.Math.tan;
  var Math_acos=global.Math.acos;
  var Math_asin=global.Math.asin;
  var Math_atan=global.Math.atan;
  var Math_atan2=global.Math.atan2;
  var Math_exp=global.Math.exp;
  var Math_log=global.Math.log;
  var Math_ceil=global.Math.ceil;
  var Math_imul=global.Math.imul;
  var Math_min=global.Math.min;
  var Math_max=global.Math.max;
  var Math_clz32=global.Math.clz32;
  var abort=env.abort;
  var assert=env.assert;
  var enlargeMemory=env.enlargeMemory;
  var getTotalMemory=env.getTotalMemory;
  var abortOnCannotGrowMemory=env.abortOnCannotGrowMemory;
  var abortStackOverflow=env.abortStackOverflow;
  var nullFunc_iiii=env.nullFunc_iiii;
  var nullFunc_viiiii=env.nullFunc_viiiii;
  var nullFunc_i=env.nullFunc_i;
  var nullFunc_vi=env.nullFunc_vi;
  var nullFunc_vii=env.nullFunc_vii;
  var nullFunc_ii=env.nullFunc_ii;
  var nullFunc_viii=env.nullFunc_viii;
  var nullFunc_v=env.nullFunc_v;
  var nullFunc_viiiiii=env.nullFunc_viiiiii;
  var nullFunc_iii=env.nullFunc_iii;
  var nullFunc_viiii=env.nullFunc_viiii;
  var invoke_iiii=env.invoke_iiii;
  var invoke_viiiii=env.invoke_viiiii;
  var invoke_i=env.invoke_i;
  var invoke_vi=env.invoke_vi;
  var invoke_vii=env.invoke_vii;
  var invoke_ii=env.invoke_ii;
  var invoke_viii=env.invoke_viii;
  var invoke_v=env.invoke_v;
  var invoke_viiiiii=env.invoke_viiiiii;
  var invoke_iii=env.invoke_iii;
  var invoke_viiii=env.invoke_viiii;
  var ___syscall221=env.___syscall221;
  var _emscripten_get_now_is_monotonic=env._emscripten_get_now_is_monotonic;
  var _emscripten_asm_const_iiiii=env._emscripten_asm_const_iiiii;
  var _pthread_key_create=env._pthread_key_create;
  var ___syscall63=env.___syscall63;
  var _abort=env._abort;
  var ___setErrNo=env.___setErrNo;
  var ___gxx_personality_v0=env.___gxx_personality_v0;
  var ___cxa_free_exception=env.___cxa_free_exception;
  var ___cxa_find_matching_catch_2=env.___cxa_find_matching_catch_2;
  var ___cxa_find_matching_catch=env.___cxa_find_matching_catch;
  var _emscripten_asm_const_ii=env._emscripten_asm_const_ii;
  var _emscripten_asm_const_i=env._emscripten_asm_const_i;
  var _clock_gettime=env._clock_gettime;
  var _emscripten_set_main_loop_timing=env._emscripten_set_main_loop_timing;
  var ___syscall330=env.___syscall330;
  var ___cxa_begin_catch=env.___cxa_begin_catch;
  var _emscripten_memcpy_big=env._emscripten_memcpy_big;
  var ___cxa_end_catch=env.___cxa_end_catch;
  var ___resumeException=env.___resumeException;
  var __ZSt18uncaught_exceptionv=env.__ZSt18uncaught_exceptionv;
  var _pthread_getspecific=env._pthread_getspecific;
  var ___cxa_find_matching_catch_3=env.___cxa_find_matching_catch_3;
  var _pthread_once=env._pthread_once;
  var ___syscall54=env.___syscall54;
  var ___unlock=env.___unlock;
  var _emscripten_sleep=env._emscripten_sleep;
  var _emscripten_set_main_loop=env._emscripten_set_main_loop;
  var _emscripten_asm_const_iii=env._emscripten_asm_const_iii;
  var _pthread_setspecific=env._pthread_setspecific;
  var _emscripten_asm_const_iiii=env._emscripten_asm_const_iiii;
  var ___cxa_throw=env.___cxa_throw;
  var ___lock=env.___lock;
  var ___syscall6=env.___syscall6;
  var ___syscall5=env.___syscall5;
  var ___cxa_pure_virtual=env.___cxa_pure_virtual;
  var _emscripten_get_now=env._emscripten_get_now;
  var ___cxa_allocate_exception=env.___cxa_allocate_exception;
  var ___syscall140=env.___syscall140;
  var ___syscall145=env.___syscall145;
  var ___syscall146=env.___syscall146;
  var tempFloat = 0.0;

// EMSCRIPTEN_START_FUNCS

function stackAlloc(size) {
  size = size|0;
  var ret = 0;
  ret = STACKTOP;
  STACKTOP = (STACKTOP + size)|0;
  STACKTOP = (STACKTOP + 15)&-16;
  if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(size|0);

  return ret|0;
}
function stackSave() {
  return STACKTOP|0;
}
function stackRestore(top) {
  top = top|0;
  STACKTOP = top;
}
function establishStackSpace(stackBase, stackMax) {
  stackBase = stackBase|0;
  stackMax = stackMax|0;
  STACKTOP = stackBase;
  STACK_MAX = stackMax;
}

function setAsync() {
  ___async = 1;
}
function setThrew(threw, value) {
  threw = threw|0;
  value = value|0;
  if ((__THREW__|0) == 0) {
    __THREW__ = threw;
    threwValue = value;
  }
}

function setTempRet0(value) {
  value = value|0;
  tempRet0 = value;
}
function getTempRet0() {
  return tempRet0|0;
}

function __ZN6C12832D0Ev($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $AsyncCtx = 0, $IsAsync = 0, label = 0, sp = 0;
 sp = STACKTOP;
 __THREW__ = 0;
 $AsyncCtx = _emscripten_alloc_async_context(8,sp)|0;
 invoke_vi(1,($0|0));
 $IsAsync = ___async;
 if ($IsAsync) {
  HEAP32[$AsyncCtx>>2] = 101;
  $1 = ((($AsyncCtx)) + 4|0);
  HEAP32[$1>>2] = $0;
  sp = STACKTOP;
  return;
 }
 _emscripten_free_async_context(($AsyncCtx|0));
 $2 = __THREW__; __THREW__ = 0;
 $3 = $2&1;
 if ($3) {
  $4 = ___cxa_find_matching_catch_2()|0;
  $5 = tempRet0;
  __ZdlPv($0);
  ___resumeException($4|0);
  // unreachable;
 } else {
  __ZdlPv($0);
  return;
 }
}
function __ZN4mbed10FileHandle5lseekEii($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $3 = 0, $4 = 0, $5 = 0, $6 = 0, $AsyncCtx = 0, $IsAsync = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $3 = HEAP32[$0>>2]|0;
 $4 = ((($3)) + 16|0);
 $5 = HEAP32[$4>>2]|0;
 $AsyncCtx = _emscripten_alloc_async_context(4,sp)|0;
 $6 = (FUNCTION_TABLE_iiii[$5 & 255]($0,$1,$2)|0);
 $IsAsync = ___async;
 if ($IsAsync) {
  HEAP32[$AsyncCtx>>2] = 102;
  sp = STACKTOP;
  return 0;
 } else {
  _emscripten_free_async_context(($AsyncCtx|0));
  return ($6|0);
 }
 return (0)|0;
}
function __ZN4mbed10FileHandle5fsyncEv($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, $AsyncCtx = 0, $IsAsync = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = HEAP32[$0>>2]|0;
 $2 = ((($1)) + 24|0);
 $3 = HEAP32[$2>>2]|0;
 $AsyncCtx = _emscripten_alloc_async_context(4,sp)|0;
 $4 = (FUNCTION_TABLE_ii[$3 & 511]($0)|0);
 $IsAsync = ___async;
 if ($IsAsync) {
  HEAP32[$AsyncCtx>>2] = 103;
  sp = STACKTOP;
  return 0;
 } else {
  _emscripten_free_async_context(($AsyncCtx|0));
  return ($4|0);
 }
 return (0)|0;
}
function __ZN4mbed10FileHandle4flenEv($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, $AsyncCtx = 0, $IsAsync = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = HEAP32[$0>>2]|0;
 $2 = ((($1)) + 40|0);
 $3 = HEAP32[$2>>2]|0;
 $AsyncCtx = _emscripten_alloc_async_context(4,sp)|0;
 $4 = (FUNCTION_TABLE_ii[$3 & 511]($0)|0);
 $IsAsync = ___async;
 if ($IsAsync) {
  HEAP32[$AsyncCtx>>2] = 104;
  sp = STACKTOP;
  return 0;
 } else {
  _emscripten_free_async_context(($AsyncCtx|0));
  return ($4|0);
 }
 return (0)|0;
}
function __ZN4mbed10FileHandle12set_blockingEb($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 return -1;
}
function __ZNK4mbed10FileHandle4pollEs($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 return 17;
}
function __ZN4mbed10FileHandle5sigioENS_8CallbackIFvvEEE($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 return;
}
function __ZN6C128325_putcEi($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0;
 var $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $5 = 0, $6 = 0, $7 = 0;
 var $8 = 0, $9 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, $IsAsync = 0, $IsAsync4 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $2 = ($1|0)==(10);
 $3 = ((($0)) + 64|0);
 $4 = HEAP32[$3>>2]|0;
 if ($2) {
  $5 = ((($0)) + 60|0);
  HEAP32[$5>>2] = 0;
  $6 = ((($0)) + 48|0);
  $7 = HEAP32[$6>>2]|0;
  $8 = ((($7)) + 2|0);
  $9 = HEAP8[$8>>0]|0;
  $10 = $9&255;
  $11 = (($10) + ($4))|0;
  HEAP32[$3>>2] = $11;
  $12 = HEAP32[$0>>2]|0;
  $13 = ((($12)) + 128|0);
  $14 = HEAP32[$13>>2]|0;
  $AsyncCtx = _emscripten_alloc_async_context(20,sp)|0;
  $15 = (FUNCTION_TABLE_ii[$14 & 511]($0)|0);
  $IsAsync = ___async;
  if ($IsAsync) {
   HEAP32[$AsyncCtx>>2] = 105;
   $16 = ((($AsyncCtx)) + 4|0);
   HEAP32[$16>>2] = $6;
   $17 = ((($AsyncCtx)) + 8|0);
   HEAP32[$17>>2] = $11;
   $18 = ((($AsyncCtx)) + 12|0);
   HEAP32[$18>>2] = $1;
   $19 = ((($AsyncCtx)) + 16|0);
   HEAP32[$19>>2] = $3;
   sp = STACKTOP;
   return 0;
  }
  _emscripten_free_async_context(($AsyncCtx|0));
  $20 = HEAP32[$6>>2]|0;
  $21 = ((($20)) + 2|0);
  $22 = HEAP8[$21>>0]|0;
  $23 = $22&255;
  $24 = (($15) - ($23))|0;
  $25 = ($11>>>0)<($24>>>0);
  if ($25) {
   return ($1|0);
  }
  HEAP32[$3>>2] = 0;
  return ($1|0);
 } else {
  $26 = HEAP32[$0>>2]|0;
  $27 = ((($26)) + 88|0);
  $28 = HEAP32[$27>>2]|0;
  $29 = ((($0)) + 60|0);
  $30 = HEAP32[$29>>2]|0;
  $AsyncCtx3 = _emscripten_alloc_async_context(12,sp)|0;
  FUNCTION_TABLE_viiii[$28 & 127]($0,$30,$4,$1);
  $IsAsync4 = ___async;
  if ($IsAsync4) {
   HEAP32[$AsyncCtx3>>2] = 106;
   $31 = ((($AsyncCtx3)) + 4|0);
   HEAP32[$31>>2] = $0;
   $32 = ((($AsyncCtx3)) + 8|0);
   HEAP32[$32>>2] = $1;
   sp = STACKTOP;
   return 0;
  }
  _emscripten_free_async_context(($AsyncCtx3|0));
  $33 = ((($0)) + 4168|0);
  $34 = HEAP32[$33>>2]|0;
  $35 = ($34|0)==(0);
  if ($35) {
   return ($1|0);
  }
  $36 = ((($0)) + 4172|0);
  $37 = HEAP32[$36>>2]|0;
  $38 = ((($0)) + 4176|0);
  $39 = HEAP32[$38>>2]|0;
  $40 = ((($0)) + 4180|0);
  $41 = HEAP32[$40>>2]|0;
  $42 = ((($0)) + 68|0);
  $43 = _emscripten_asm_const_iiiii(0, ($37|0), ($39|0), ($41|0), ($42|0))|0;
  return ($1|0);
 }
 return (0)|0;
}
function __ZN6C128326_flushEv($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = ((($0)) + 4172|0);
 $2 = HEAP32[$1>>2]|0;
 $3 = ((($0)) + 4176|0);
 $4 = HEAP32[$3>>2]|0;
 $5 = ((($0)) + 4180|0);
 $6 = HEAP32[$5>>2]|0;
 $7 = ((($0)) + 68|0);
 $8 = _emscripten_asm_const_iiiii(0, ($2|0), ($4|0), ($6|0), ($7|0))|0;
 return;
}
function __ZN4mbed6Stream4lockEv($0) {
 $0 = $0|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 return;
}
function __ZN4mbed6Stream6unlockEv($0) {
 $0 = $0|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 return;
}
function __ZN6C128329characterEiii($0,$1,$2,$3) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 var $$04142$us = 0, $$043$us = 0, $$off = 0, $$pre = 0, $10 = 0, $100 = 0, $101 = 0, $102 = 0, $103 = 0, $104 = 0, $105 = 0, $106 = 0, $107 = 0, $108 = 0, $109 = 0, $11 = 0, $110 = 0, $111 = 0, $112 = 0, $113 = 0;
 var $114 = 0, $115 = 0, $116 = 0, $117 = 0, $118 = 0, $119 = 0, $12 = 0, $120 = 0, $121 = 0, $122 = 0, $123 = 0, $124 = 0, $125 = 0, $126 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0;
 var $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0;
 var $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0;
 var $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0, $67 = 0, $68 = 0, $69 = 0, $7 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0;
 var $75 = 0, $76 = 0, $77 = 0, $78 = 0, $79 = 0, $8 = 0, $80 = 0, $81 = 0, $82 = 0, $83 = 0, $84 = 0, $85 = 0, $86 = 0, $87 = 0, $88 = 0, $89 = 0, $9 = 0, $90 = 0, $91 = 0, $92 = 0;
 var $93 = 0, $94 = 0, $95 = 0, $96 = 0, $97 = 0, $98 = 0, $99 = 0, $AsyncCtx = 0, $AsyncCtx11 = 0, $AsyncCtx3 = 0, $AsyncCtx7 = 0, $IsAsync = 0, $IsAsync12 = 0, $IsAsync4 = 0, $IsAsync8 = 0, $exitcond = 0, $exitcond46 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $$off = (($3) + -31)|0;
 $4 = ($$off>>>0)>(96);
 if ($4) {
  return;
 }
 $5 = ((($0)) + 48|0);
 $6 = HEAP32[$5>>2]|0;
 $7 = HEAP8[$6>>0]|0;
 $8 = $7&255;
 $9 = ((($6)) + 1|0);
 $10 = HEAP8[$9>>0]|0;
 $11 = $10&255;
 $12 = ((($6)) + 2|0);
 $13 = HEAP8[$12>>0]|0;
 $14 = $13&255;
 $15 = ((($6)) + 3|0);
 $16 = HEAP8[$15>>0]|0;
 $17 = $16&255;
 $18 = ((($0)) + 60|0);
 $19 = HEAP32[$18>>2]|0;
 $20 = (($19) + ($11))|0;
 $21 = HEAP32[$0>>2]|0;
 $22 = ((($21)) + 124|0);
 $23 = HEAP32[$22>>2]|0;
 $AsyncCtx = _emscripten_alloc_async_context(60,sp)|0;
 $24 = (FUNCTION_TABLE_ii[$23 & 511]($0)|0);
 $IsAsync = ___async;
 if ($IsAsync) {
  HEAP32[$AsyncCtx>>2] = 107;
  $25 = ((($AsyncCtx)) + 4|0);
  HEAP32[$25>>2] = $14;
  $26 = ((($AsyncCtx)) + 8|0);
  HEAP32[$26>>2] = $11;
  $27 = ((($AsyncCtx)) + 12|0);
  HEAP32[$27>>2] = $20;
  $28 = ((($AsyncCtx)) + 16|0);
  HEAP32[$28>>2] = $18;
  $29 = ((($AsyncCtx)) + 20|0);
  HEAP32[$29>>2] = $5;
  $30 = ((($AsyncCtx)) + 24|0);
  HEAP32[$30>>2] = $3;
  $31 = ((($AsyncCtx)) + 28|0);
  HEAP32[$31>>2] = $8;
  $32 = ((($AsyncCtx)) + 32|0);
  HEAP8[$32>>0] = $13;
  $33 = ((($AsyncCtx)) + 36|0);
  HEAP32[$33>>2] = $0;
  $34 = ((($AsyncCtx)) + 40|0);
  HEAP32[$34>>2] = $0;
  $35 = ((($AsyncCtx)) + 44|0);
  HEAP32[$35>>2] = $2;
  $36 = ((($AsyncCtx)) + 48|0);
  HEAP8[$36>>0] = $10;
  $37 = ((($AsyncCtx)) + 52|0);
  HEAP32[$37>>2] = $17;
  $38 = ((($AsyncCtx)) + 56|0);
  HEAP32[$38>>2] = $1;
  sp = STACKTOP;
  return;
 }
 _emscripten_free_async_context(($AsyncCtx|0));
 $39 = ($20>>>0)>($24>>>0);
 if ($39) {
  HEAP32[$18>>2] = 0;
  $40 = ((($0)) + 64|0);
  $41 = HEAP32[$40>>2]|0;
  $42 = (($41) + ($14))|0;
  HEAP32[$40>>2] = $42;
  $43 = HEAP32[$0>>2]|0;
  $44 = ((($43)) + 128|0);
  $45 = HEAP32[$44>>2]|0;
  $AsyncCtx3 = _emscripten_alloc_async_context(60,sp)|0;
  $46 = (FUNCTION_TABLE_ii[$45 & 511]($0)|0);
  $IsAsync4 = ___async;
  if ($IsAsync4) {
   HEAP32[$AsyncCtx3>>2] = 108;
   $47 = ((($AsyncCtx3)) + 4|0);
   HEAP32[$47>>2] = $5;
   $48 = ((($AsyncCtx3)) + 8|0);
   HEAP32[$48>>2] = $42;
   $49 = ((($AsyncCtx3)) + 12|0);
   HEAP32[$49>>2] = $3;
   $50 = ((($AsyncCtx3)) + 16|0);
   HEAP32[$50>>2] = $8;
   $51 = ((($AsyncCtx3)) + 20|0);
   HEAP8[$51>>0] = $13;
   $52 = ((($AsyncCtx3)) + 24|0);
   HEAP32[$52>>2] = $40;
   $53 = ((($AsyncCtx3)) + 28|0);
   HEAP32[$53>>2] = $18;
   $54 = ((($AsyncCtx3)) + 32|0);
   HEAP8[$54>>0] = $10;
   $55 = ((($AsyncCtx3)) + 36|0);
   HEAP32[$55>>2] = $0;
   $56 = ((($AsyncCtx3)) + 40|0);
   HEAP32[$56>>2] = $2;
   $57 = ((($AsyncCtx3)) + 44|0);
   HEAP32[$57>>2] = $17;
   $58 = ((($AsyncCtx3)) + 48|0);
   HEAP32[$58>>2] = $1;
   $59 = ((($AsyncCtx3)) + 52|0);
   HEAP32[$59>>2] = $11;
   $60 = ((($AsyncCtx3)) + 56|0);
   HEAP32[$60>>2] = $14;
   sp = STACKTOP;
   return;
  }
  _emscripten_free_async_context(($AsyncCtx3|0));
  $61 = HEAP32[$5>>2]|0;
  $62 = ((($61)) + 2|0);
  $63 = HEAP8[$62>>0]|0;
  $64 = $63&255;
  $65 = (($46) - ($64))|0;
  $66 = ($42>>>0)<($65>>>0);
  if ($66) {
   $71 = $61;
  } else {
   HEAP32[$40>>2] = 0;
   $71 = $61;
  }
 } else {
  $$pre = HEAP32[$5>>2]|0;
  $71 = $$pre;
 }
 $67 = (($3) + -32)|0;
 $68 = Math_imul($8, $67)|0;
 $69 = (($68) + 4)|0;
 $70 = (($71) + ($69)|0);
 $72 = HEAP8[$70>>0]|0;
 $73 = ($13<<24>>24)==(0);
 L15: do {
  if (!($73)) {
   $74 = ($10<<24>>24)==(0);
   if (!($74)) {
    $$043$us = 0;
    L17: while(1) {
     $75 = $$043$us >>> 3;
     $76 = $75 & 31;
     $77 = (($76) + 1)|0;
     $78 = $$043$us & 7;
     $79 = 1 << $78;
     $80 = (($$043$us) + ($2))|0;
     $$04142$us = 0;
     while(1) {
      $81 = Math_imul($$04142$us, $17)|0;
      $82 = (($77) + ($81))|0;
      $83 = (($70) + ($82)|0);
      $84 = HEAP8[$83>>0]|0;
      $85 = $84&255;
      $86 = $85 & $79;
      $87 = ($86|0)==(0);
      $88 = HEAP32[$0>>2]|0;
      $89 = ((($88)) + 120|0);
      $90 = HEAP32[$89>>2]|0;
      $91 = (($$04142$us) + ($1))|0;
      if ($87) {
       $AsyncCtx11 = _emscripten_alloc_async_context(64,sp)|0;
       FUNCTION_TABLE_viiii[$90 & 127]($0,$91,$80,0);
       $IsAsync12 = ___async;
       if ($IsAsync12) {
        label = 18;
        break L17;
       }
       _emscripten_free_async_context(($AsyncCtx11|0));
      } else {
       $AsyncCtx7 = _emscripten_alloc_async_context(64,sp)|0;
       FUNCTION_TABLE_viiii[$90 & 127]($0,$91,$80,1);
       $IsAsync8 = ___async;
       if ($IsAsync8) {
        label = 15;
        break L17;
       }
       _emscripten_free_async_context(($AsyncCtx7|0));
      }
      $122 = (($$04142$us) + 1)|0;
      $exitcond = ($122|0)==($11|0);
      if ($exitcond) {
       break;
      } else {
       $$04142$us = $122;
      }
     }
     $123 = (($$043$us) + 1)|0;
     $exitcond46 = ($123|0)==($14|0);
     if ($exitcond46) {
      break L15;
     } else {
      $$043$us = $123;
     }
    }
    if ((label|0) == 15) {
     HEAP32[$AsyncCtx7>>2] = 109;
     $92 = ((($AsyncCtx7)) + 4|0);
     HEAP32[$92>>2] = $$04142$us;
     $93 = ((($AsyncCtx7)) + 8|0);
     HEAP32[$93>>2] = $11;
     $94 = ((($AsyncCtx7)) + 12|0);
     HEAP32[$94>>2] = $$043$us;
     $95 = ((($AsyncCtx7)) + 16|0);
     HEAP32[$95>>2] = $14;
     $96 = ((($AsyncCtx7)) + 20|0);
     HEAP32[$96>>2] = $17;
     $97 = ((($AsyncCtx7)) + 24|0);
     HEAP32[$97>>2] = $77;
     $98 = ((($AsyncCtx7)) + 28|0);
     HEAP32[$98>>2] = $70;
     $99 = ((($AsyncCtx7)) + 32|0);
     HEAP32[$99>>2] = $79;
     $100 = ((($AsyncCtx7)) + 36|0);
     HEAP32[$100>>2] = $0;
     $101 = ((($AsyncCtx7)) + 40|0);
     HEAP32[$101>>2] = $1;
     $102 = ((($AsyncCtx7)) + 44|0);
     HEAP32[$102>>2] = $0;
     $103 = ((($AsyncCtx7)) + 48|0);
     HEAP32[$103>>2] = $80;
     $104 = ((($AsyncCtx7)) + 52|0);
     HEAP8[$104>>0] = $72;
     $105 = ((($AsyncCtx7)) + 56|0);
     HEAP32[$105>>2] = $18;
     $106 = ((($AsyncCtx7)) + 60|0);
     HEAP32[$106>>2] = $2;
     sp = STACKTOP;
     return;
    }
    else if ((label|0) == 18) {
     HEAP32[$AsyncCtx11>>2] = 110;
     $107 = ((($AsyncCtx11)) + 4|0);
     HEAP32[$107>>2] = $$04142$us;
     $108 = ((($AsyncCtx11)) + 8|0);
     HEAP32[$108>>2] = $11;
     $109 = ((($AsyncCtx11)) + 12|0);
     HEAP32[$109>>2] = $$043$us;
     $110 = ((($AsyncCtx11)) + 16|0);
     HEAP32[$110>>2] = $14;
     $111 = ((($AsyncCtx11)) + 20|0);
     HEAP32[$111>>2] = $17;
     $112 = ((($AsyncCtx11)) + 24|0);
     HEAP32[$112>>2] = $77;
     $113 = ((($AsyncCtx11)) + 28|0);
     HEAP32[$113>>2] = $70;
     $114 = ((($AsyncCtx11)) + 32|0);
     HEAP32[$114>>2] = $79;
     $115 = ((($AsyncCtx11)) + 36|0);
     HEAP32[$115>>2] = $0;
     $116 = ((($AsyncCtx11)) + 40|0);
     HEAP32[$116>>2] = $1;
     $117 = ((($AsyncCtx11)) + 44|0);
     HEAP32[$117>>2] = $0;
     $118 = ((($AsyncCtx11)) + 48|0);
     HEAP32[$118>>2] = $80;
     $119 = ((($AsyncCtx11)) + 52|0);
     HEAP8[$119>>0] = $72;
     $120 = ((($AsyncCtx11)) + 56|0);
     HEAP32[$120>>2] = $18;
     $121 = ((($AsyncCtx11)) + 60|0);
     HEAP32[$121>>2] = $2;
     sp = STACKTOP;
     return;
    }
   }
  }
 } while(0);
 $124 = $72&255;
 $125 = HEAP32[$18>>2]|0;
 $126 = (($125) + ($124))|0;
 HEAP32[$18>>2] = $126;
 return;
}
function __ZN6C128324rowsEv($0) {
 $0 = $0|0;
 var $1 = 0, $10 = 0, $11 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $AsyncCtx = 0, $IsAsync = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = HEAP32[$0>>2]|0;
 $2 = ((($1)) + 128|0);
 $3 = HEAP32[$2>>2]|0;
 $AsyncCtx = _emscripten_alloc_async_context(8,sp)|0;
 $4 = (FUNCTION_TABLE_ii[$3 & 511]($0)|0);
 $IsAsync = ___async;
 if ($IsAsync) {
  HEAP32[$AsyncCtx>>2] = 111;
  $5 = ((($AsyncCtx)) + 4|0);
  HEAP32[$5>>2] = $0;
  sp = STACKTOP;
  return 0;
 } else {
  _emscripten_free_async_context(($AsyncCtx|0));
  $6 = ((($0)) + 48|0);
  $7 = HEAP32[$6>>2]|0;
  $8 = ((($7)) + 2|0);
  $9 = HEAP8[$8>>0]|0;
  $10 = $9&255;
  $11 = (($4|0) / ($10|0))&-1;
  return ($11|0);
 }
 return (0)|0;
}
function __ZN6C128327columnsEv($0) {
 $0 = $0|0;
 var $1 = 0, $10 = 0, $11 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $AsyncCtx = 0, $IsAsync = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = HEAP32[$0>>2]|0;
 $2 = ((($1)) + 124|0);
 $3 = HEAP32[$2>>2]|0;
 $AsyncCtx = _emscripten_alloc_async_context(8,sp)|0;
 $4 = (FUNCTION_TABLE_ii[$3 & 511]($0)|0);
 $IsAsync = ___async;
 if ($IsAsync) {
  HEAP32[$AsyncCtx>>2] = 112;
  $5 = ((($AsyncCtx)) + 4|0);
  HEAP32[$5>>2] = $0;
  sp = STACKTOP;
  return 0;
 } else {
  _emscripten_free_async_context(($AsyncCtx|0));
  $6 = ((($0)) + 48|0);
  $7 = HEAP32[$6>>2]|0;
  $8 = ((($7)) + 1|0);
  $9 = HEAP8[$8>>0]|0;
  $10 = $9&255;
  $11 = (($4|0) / ($10|0))&-1;
  return ($11|0);
 }
 return (0)|0;
}
function __ZN6C128323clsEv($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = ((($0)) + 68|0);
 _memset(($1|0),0,4096)|0;
 $2 = ((($0)) + 4172|0);
 $3 = HEAP32[$2>>2]|0;
 $4 = ((($0)) + 4176|0);
 $5 = HEAP32[$4>>2]|0;
 $6 = ((($0)) + 4180|0);
 $7 = HEAP32[$6>>2]|0;
 $8 = _emscripten_asm_const_iiiii(0, ($3|0), ($5|0), ($7|0), ($1|0))|0;
 return;
}
function __ZN6C128326locateEii($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $3 = 0, $4 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $3 = ((($0)) + 60|0);
 HEAP32[$3>>2] = $1;
 $4 = ((($0)) + 64|0);
 HEAP32[$4>>2] = $2;
 return;
}
function __ZN6C128325pixelEiii($0,$1,$2,$3) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 var $$sink = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $not$ = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $4 = ($1>>>0)>(128);
 $5 = ($2>>>0)>(32);
 $6 = $4 | $5;
 if ($6) {
  return;
 }
 $7 = ((($0)) + 52|0);
 $8 = HEAP32[$7>>2]|0;
 $9 = ($8|0)==(0);
 if ($9) {
  $10 = $2 << 7;
  $11 = (($10) + ($1))|0;
  $12 = (((($0)) + 68|0) + ($11)|0);
  $not$ = ($3|0)!=(0);
  $$sink = $not$&1;
  HEAP8[$12>>0] = $$sink;
  return;
 }
 $13 = ($3|0)==(1);
 $14 = $2 << 7;
 $15 = (($14) + ($1))|0;
 $16 = (((($0)) + 68|0) + ($15)|0);
 if (!($13)) {
  return;
 }
 $17 = HEAP8[$16>>0]|0;
 $18 = $17 ^ 1;
 HEAP8[$16>>0] = $18;
 return;
}
function __ZN6C128325widthEv($0) {
 $0 = $0|0;
 var $$0 = 0, $1 = 0, $2 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = ((($0)) + 56|0);
 $2 = HEAP32[$1>>2]|0;
 switch ($2|0) {
 case 2: case 0:  {
  $$0 = 32;
  break;
 }
 default: {
  $$0 = 128;
 }
 }
 return ($$0|0);
}
function __ZN6C128326heightEv($0) {
 $0 = $0|0;
 var $$0 = 0, $1 = 0, $2 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = ((($0)) + 56|0);
 $2 = HEAP32[$1>>2]|0;
 switch ($2|0) {
 case 2: case 0:  {
  $$0 = 128;
  break;
 }
 default: {
  $$0 = 32;
 }
 }
 return ($$0|0);
}
function __ZThn4_N6C12832D1Ev($0) {
 $0 = $0|0;
 var $1 = 0, $AsyncCtx = 0, $IsAsync = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = ((($0)) + -4|0);
 $AsyncCtx = _emscripten_alloc_async_context(4,sp)|0;
 __ZN4mbed6StreamD2Ev($1);
 $IsAsync = ___async;
 if ($IsAsync) {
  HEAP32[$AsyncCtx>>2] = 113;
  sp = STACKTOP;
  return;
 } else {
  _emscripten_free_async_context(($AsyncCtx|0));
  return;
 }
}
function __ZThn4_N6C12832D0Ev($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $AsyncCtx = 0, $IsAsync = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = ((($0)) + -4|0);
 __THREW__ = 0;
 $AsyncCtx = _emscripten_alloc_async_context(8,sp)|0;
 invoke_vi(1,($1|0));
 $IsAsync = ___async;
 if ($IsAsync) {
  HEAP32[$AsyncCtx>>2] = 114;
  $2 = ((($AsyncCtx)) + 4|0);
  HEAP32[$2>>2] = $1;
  sp = STACKTOP;
  return;
 }
 _emscripten_free_async_context(($AsyncCtx|0));
 $3 = __THREW__; __THREW__ = 0;
 $4 = $3&1;
 if ($4) {
  $5 = ___cxa_find_matching_catch_2()|0;
  $6 = tempRet0;
  __ZdlPv($1);
  ___resumeException($5|0);
  // unreachable;
 } else {
  __ZdlPv($1);
  return;
 }
}
function __ZN6C12832C2E7PinNameS0_S0_S0_S0_PKc($0,$1,$2,$3,$4,$5,$6) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 $4 = $4|0;
 $5 = $5|0;
 $6 = $6|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0;
 var $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $40 = 0, $41 = 0, $42 = 0, $7 = 0, $8 = 0, $9 = 0, $AsyncCtx = 0, $AsyncCtx11 = 0, $AsyncCtx3 = 0, $AsyncCtx7 = 0;
 var $IsAsync = 0, $IsAsync12 = 0, $IsAsync8 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $AsyncCtx11 = _emscripten_alloc_async_context(20,sp)|0;
 __ZN15GraphicsDisplayC2EPKc($0,$6);
 $IsAsync12 = ___async;
 if ($IsAsync12) {
  HEAP32[$AsyncCtx11>>2] = 115;
  $7 = ((($AsyncCtx11)) + 4|0);
  HEAP32[$7>>2] = $0;
  $8 = ((($AsyncCtx11)) + 8|0);
  HEAP32[$8>>2] = $1;
  $9 = ((($AsyncCtx11)) + 12|0);
  HEAP32[$9>>2] = $3;
  $10 = ((($AsyncCtx11)) + 16|0);
  HEAP32[$10>>2] = $2;
  sp = STACKTOP;
  return;
 }
 _emscripten_free_async_context(($AsyncCtx11|0));
 HEAP32[$0>>2] = (376);
 $11 = ((($0)) + 4|0);
 HEAP32[$11>>2] = (536);
 $12 = ((($0)) + 4172|0);
 HEAP32[$12>>2] = $1;
 $13 = ((($0)) + 4176|0);
 HEAP32[$13>>2] = $3;
 $14 = ((($0)) + 4180|0);
 HEAP32[$14>>2] = $2;
 $15 = _emscripten_asm_const_iiii(1, ($1|0), ($3|0), ($2|0))|0;
 $16 = ((($0)) + 56|0);
 HEAP32[$16>>2] = 1;
 $17 = ((($0)) + 52|0);
 HEAP32[$17>>2] = 0;
 $18 = ((($0)) + 60|0);
 HEAP32[$18>>2] = 0;
 $19 = ((($0)) + 68|0);
 _memset(($19|0),0,4096)|0;
 $20 = HEAP32[$0>>2]|0;
 $21 = ((($20)) + 108|0);
 $22 = HEAP32[$21>>2]|0;
 __THREW__ = 0;
 $AsyncCtx = _emscripten_alloc_async_context(24,sp)|0;
 invoke_viii($22|0,($0|0),0,0);
 $IsAsync = ___async;
 if ($IsAsync) {
  HEAP32[$AsyncCtx>>2] = 116;
  $23 = ((($AsyncCtx)) + 4|0);
  HEAP32[$23>>2] = $0;
  $24 = ((($AsyncCtx)) + 8|0);
  HEAP32[$24>>2] = $12;
  $25 = ((($AsyncCtx)) + 12|0);
  HEAP32[$25>>2] = $13;
  $26 = ((($AsyncCtx)) + 16|0);
  HEAP32[$26>>2] = $14;
  $27 = ((($AsyncCtx)) + 20|0);
  HEAP32[$27>>2] = $19;
  sp = STACKTOP;
  return;
 }
 _emscripten_free_async_context(($AsyncCtx|0));
 $28 = __THREW__; __THREW__ = 0;
 $29 = $28&1;
 if (!($29)) {
  $30 = ((($0)) + 48|0);
  HEAP32[$30>>2] = 2050;
  $31 = HEAP32[$12>>2]|0;
  $32 = HEAP32[$13>>2]|0;
  $33 = HEAP32[$14>>2]|0;
  $34 = _emscripten_asm_const_iiiii(0, ($31|0), ($32|0), ($33|0), ($19|0))|0;
  return;
 }
 $35 = ___cxa_find_matching_catch_2()|0;
 $36 = tempRet0;
 __THREW__ = 0;
 $AsyncCtx7 = _emscripten_alloc_async_context(12,sp)|0;
 invoke_vi(1,($0|0));
 $IsAsync8 = ___async;
 if ($IsAsync8) {
  HEAP32[$AsyncCtx7>>2] = 117;
  $37 = ((($AsyncCtx7)) + 4|0);
  HEAP32[$37>>2] = $35;
  $38 = ((($AsyncCtx7)) + 8|0);
  HEAP32[$38>>2] = $36;
  sp = STACKTOP;
  return;
 }
 _emscripten_free_async_context(($AsyncCtx7|0));
 $39 = __THREW__; __THREW__ = 0;
 $40 = $39&1;
 if ($40) {
  $41 = ___cxa_find_matching_catch_3(0|0)|0;
  $42 = tempRet0;
  $AsyncCtx3 = _emscripten_alloc_async_context(4,sp)|0;
  ___clang_call_terminate($41);
  // unreachable;
 } else {
  ___resumeException($35|0);
  // unreachable;
 }
}
function ___clang_call_terminate($0) {
 $0 = $0|0;
 var $AsyncCtx = 0, label = 0, sp = 0;
 sp = STACKTOP;
 (___cxa_begin_catch(($0|0))|0);
 $AsyncCtx = _emscripten_alloc_async_context(4,sp)|0;
 __ZSt9terminatev();
 // unreachable;
}
function __ZN15GraphicsDisplayD0Ev($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $AsyncCtx = 0, $IsAsync = 0, label = 0, sp = 0;
 sp = STACKTOP;
 __THREW__ = 0;
 $AsyncCtx = _emscripten_alloc_async_context(8,sp)|0;
 invoke_vi(1,($0|0));
 $IsAsync = ___async;
 if ($IsAsync) {
  HEAP32[$AsyncCtx>>2] = 118;
  $1 = ((($AsyncCtx)) + 4|0);
  HEAP32[$1>>2] = $0;
  sp = STACKTOP;
  return;
 }
 _emscripten_free_async_context(($AsyncCtx|0));
 $2 = __THREW__; __THREW__ = 0;
 $3 = $2&1;
 if ($3) {
  $4 = ___cxa_find_matching_catch_2()|0;
  $5 = tempRet0;
  __ZdlPv($0);
  ___resumeException($4|0);
  // unreachable;
 } else {
  __ZdlPv($0);
  return;
 }
}
function __ZN15GraphicsDisplay9characterEiii($0,$1,$2,$3) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 var $10 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $AsyncCtx = 0, $IsAsync = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $4 = HEAP32[$0>>2]|0;
 $5 = ((($4)) + 148|0);
 $6 = HEAP32[$5>>2]|0;
 $7 = $1 << 3;
 $8 = $2 << 3;
 $9 = (($3) + -31)|0;
 $10 = (3878 + ($9<<3)|0);
 $AsyncCtx = _emscripten_alloc_async_context(4,sp)|0;
 FUNCTION_TABLE_viiiiii[$6 & 127]($0,$7,$8,8,8,$10);
 $IsAsync = ___async;
 if ($IsAsync) {
  HEAP32[$AsyncCtx>>2] = 119;
  sp = STACKTOP;
  return;
 } else {
  _emscripten_free_async_context(($AsyncCtx|0));
  return;
 }
}
function __ZN15GraphicsDisplay4rowsEv($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $AsyncCtx = 0, $IsAsync = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = HEAP32[$0>>2]|0;
 $2 = ((($1)) + 128|0);
 $3 = HEAP32[$2>>2]|0;
 $AsyncCtx = _emscripten_alloc_async_context(4,sp)|0;
 $4 = (FUNCTION_TABLE_ii[$3 & 511]($0)|0);
 $IsAsync = ___async;
 if ($IsAsync) {
  HEAP32[$AsyncCtx>>2] = 120;
  sp = STACKTOP;
  return 0;
 } else {
  _emscripten_free_async_context(($AsyncCtx|0));
  $5 = (($4|0) / 8)&-1;
  return ($5|0);
 }
 return (0)|0;
}
function __ZN15GraphicsDisplay7columnsEv($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $AsyncCtx = 0, $IsAsync = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = HEAP32[$0>>2]|0;
 $2 = ((($1)) + 124|0);
 $3 = HEAP32[$2>>2]|0;
 $AsyncCtx = _emscripten_alloc_async_context(4,sp)|0;
 $4 = (FUNCTION_TABLE_ii[$3 & 511]($0)|0);
 $IsAsync = ___async;
 if ($IsAsync) {
  HEAP32[$AsyncCtx>>2] = 121;
  sp = STACKTOP;
  return 0;
 } else {
  _emscripten_free_async_context(($AsyncCtx|0));
  $5 = (($4|0) / 8)&-1;
  return ($5|0);
 }
 return (0)|0;
}
function __ZN15GraphicsDisplay3clsEv($0) {
 $0 = $0|0;
 var $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $AsyncCtx = 0;
 var $AsyncCtx2 = 0, $AsyncCtx5 = 0, $IsAsync = 0, $IsAsync3 = 0, $IsAsync6 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = HEAP32[$0>>2]|0;
 $2 = ((($1)) + 140|0);
 $3 = HEAP32[$2>>2]|0;
 $4 = ((($1)) + 124|0);
 $5 = HEAP32[$4>>2]|0;
 $AsyncCtx = _emscripten_alloc_async_context(16,sp)|0;
 $6 = (FUNCTION_TABLE_ii[$5 & 511]($0)|0);
 $IsAsync = ___async;
 if ($IsAsync) {
  HEAP32[$AsyncCtx>>2] = 122;
  $7 = ((($AsyncCtx)) + 4|0);
  HEAP32[$7>>2] = $0;
  $8 = ((($AsyncCtx)) + 8|0);
  HEAP32[$8>>2] = $0;
  $9 = ((($AsyncCtx)) + 12|0);
  HEAP32[$9>>2] = $3;
  sp = STACKTOP;
  return;
 }
 _emscripten_free_async_context(($AsyncCtx|0));
 $10 = HEAP32[$0>>2]|0;
 $11 = ((($10)) + 128|0);
 $12 = HEAP32[$11>>2]|0;
 $AsyncCtx2 = _emscripten_alloc_async_context(16,sp)|0;
 $13 = (FUNCTION_TABLE_ii[$12 & 511]($0)|0);
 $IsAsync3 = ___async;
 if ($IsAsync3) {
  HEAP32[$AsyncCtx2>>2] = 123;
  $14 = ((($AsyncCtx2)) + 4|0);
  HEAP32[$14>>2] = $0;
  $15 = ((($AsyncCtx2)) + 8|0);
  HEAP32[$15>>2] = $6;
  $16 = ((($AsyncCtx2)) + 12|0);
  HEAP32[$16>>2] = $3;
  sp = STACKTOP;
  return;
 }
 _emscripten_free_async_context(($AsyncCtx2|0));
 $17 = ((($0)) + 30|0);
 $18 = HEAP16[$17>>1]|0;
 $19 = $18&65535;
 $AsyncCtx5 = _emscripten_alloc_async_context(4,sp)|0;
 FUNCTION_TABLE_viiiiii[$3 & 127]($0,0,0,$6,$13,$19);
 $IsAsync6 = ___async;
 if ($IsAsync6) {
  HEAP32[$AsyncCtx5>>2] = 124;
  sp = STACKTOP;
  return;
 } else {
  _emscripten_free_async_context(($AsyncCtx5|0));
  return;
 }
}
function __ZN15GraphicsDisplay6windowEiiii($0,$1,$2,$3,$4) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 $4 = $4|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $5 = $1&65535;
 $6 = ((($0)) + 36|0);
 HEAP16[$6>>1] = $5;
 $7 = $2&65535;
 $8 = ((($0)) + 38|0);
 HEAP16[$8>>1] = $7;
 $9 = ((($0)) + 40|0);
 HEAP16[$9>>1] = $5;
 $10 = (($1) + 65535)|0;
 $11 = (($10) + ($3))|0;
 $12 = $11&65535;
 $13 = ((($0)) + 42|0);
 HEAP16[$13>>1] = $12;
 $14 = ((($0)) + 44|0);
 HEAP16[$14>>1] = $7;
 $15 = (($2) + 65535)|0;
 $16 = (($15) + ($4))|0;
 $17 = $16&65535;
 $18 = ((($0)) + 46|0);
 HEAP16[$18>>1] = $17;
 return;
}
function __ZN15GraphicsDisplay4putpEi($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $3 = 0;
 var $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $AsyncCtx = 0, $IsAsync = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $2 = HEAP32[$0>>2]|0;
 $3 = ((($2)) + 120|0);
 $4 = HEAP32[$3>>2]|0;
 $5 = ((($0)) + 36|0);
 $6 = HEAP16[$5>>1]|0;
 $7 = $6 << 16 >> 16;
 $8 = ((($0)) + 38|0);
 $9 = HEAP16[$8>>1]|0;
 $10 = $9 << 16 >> 16;
 $AsyncCtx = _emscripten_alloc_async_context(16,sp)|0;
 FUNCTION_TABLE_viiii[$4 & 127]($0,$7,$10,$1);
 $IsAsync = ___async;
 if ($IsAsync) {
  HEAP32[$AsyncCtx>>2] = 125;
  $11 = ((($AsyncCtx)) + 4|0);
  HEAP32[$11>>2] = $5;
  $12 = ((($AsyncCtx)) + 8|0);
  HEAP32[$12>>2] = $0;
  $13 = ((($AsyncCtx)) + 12|0);
  HEAP32[$13>>2] = $8;
  sp = STACKTOP;
  return;
 }
 _emscripten_free_async_context(($AsyncCtx|0));
 $14 = HEAP16[$5>>1]|0;
 $15 = (($14) + 1)<<16>>16;
 HEAP16[$5>>1] = $15;
 $16 = ((($0)) + 42|0);
 $17 = HEAP16[$16>>1]|0;
 $18 = ($15<<16>>16)>($17<<16>>16);
 if (!($18)) {
  return;
 }
 $19 = ((($0)) + 40|0);
 $20 = HEAP16[$19>>1]|0;
 HEAP16[$5>>1] = $20;
 $21 = HEAP16[$8>>1]|0;
 $22 = (($21) + 1)<<16>>16;
 HEAP16[$8>>1] = $22;
 $23 = ((($0)) + 46|0);
 $24 = HEAP16[$23>>1]|0;
 $25 = ($22<<16>>16)>($24<<16>>16);
 if (!($25)) {
  return;
 }
 $26 = ((($0)) + 44|0);
 $27 = HEAP16[$26>>1]|0;
 HEAP16[$8>>1] = $27;
 return;
}
function __ZN15GraphicsDisplay4fillEiiiii($0,$1,$2,$3,$4,$5) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 $4 = $4|0;
 $5 = $5|0;
 var $$010 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $AsyncCtx = 0;
 var $AsyncCtx3 = 0, $IsAsync = 0, $IsAsync4 = 0, $exitcond = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $6 = HEAP32[$0>>2]|0;
 $7 = ((($6)) + 132|0);
 $8 = HEAP32[$7>>2]|0;
 $AsyncCtx = _emscripten_alloc_async_context(20,sp)|0;
 FUNCTION_TABLE_viiiii[$8 & 127]($0,$1,$2,$3,$4);
 $IsAsync = ___async;
 if ($IsAsync) {
  HEAP32[$AsyncCtx>>2] = 126;
  $9 = ((($AsyncCtx)) + 4|0);
  HEAP32[$9>>2] = $4;
  $10 = ((($AsyncCtx)) + 8|0);
  HEAP32[$10>>2] = $3;
  $11 = ((($AsyncCtx)) + 12|0);
  HEAP32[$11>>2] = $0;
  $12 = ((($AsyncCtx)) + 16|0);
  HEAP32[$12>>2] = $5;
  sp = STACKTOP;
  return;
 }
 _emscripten_free_async_context(($AsyncCtx|0));
 $13 = Math_imul($4, $3)|0;
 $14 = ($13|0)>(0);
 if (!($14)) {
  return;
 }
 $$010 = 0;
 while(1) {
  $15 = HEAP32[$0>>2]|0;
  $16 = ((($15)) + 136|0);
  $17 = HEAP32[$16>>2]|0;
  $AsyncCtx3 = _emscripten_alloc_async_context(24,sp)|0;
  FUNCTION_TABLE_vii[$17 & 255]($0,$5);
  $IsAsync4 = ___async;
  if ($IsAsync4) {
   label = 7;
   break;
  }
  _emscripten_free_async_context(($AsyncCtx3|0));
  $23 = (($$010) + 1)|0;
  $exitcond = ($23|0)==($13|0);
  if ($exitcond) {
   label = 5;
   break;
  } else {
   $$010 = $23;
  }
 }
 if ((label|0) == 5) {
  return;
 }
 else if ((label|0) == 7) {
  HEAP32[$AsyncCtx3>>2] = 127;
  $18 = ((($AsyncCtx3)) + 4|0);
  HEAP32[$18>>2] = $$010;
  $19 = ((($AsyncCtx3)) + 8|0);
  HEAP32[$19>>2] = $13;
  $20 = ((($AsyncCtx3)) + 12|0);
  HEAP32[$20>>2] = $0;
  $21 = ((($AsyncCtx3)) + 16|0);
  HEAP32[$21>>2] = $0;
  $22 = ((($AsyncCtx3)) + 20|0);
  HEAP32[$22>>2] = $5;
  sp = STACKTOP;
  return;
 }
}
function __ZN15GraphicsDisplay4blitEiiiiPKi($0,$1,$2,$3,$4,$5) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 $4 = $4|0;
 $5 = $5|0;
 var $$011 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $6 = 0, $7 = 0, $8 = 0;
 var $9 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, $IsAsync = 0, $IsAsync4 = 0, $exitcond = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $6 = HEAP32[$0>>2]|0;
 $7 = ((($6)) + 132|0);
 $8 = HEAP32[$7>>2]|0;
 $AsyncCtx = _emscripten_alloc_async_context(20,sp)|0;
 FUNCTION_TABLE_viiiii[$8 & 127]($0,$1,$2,$3,$4);
 $IsAsync = ___async;
 if ($IsAsync) {
  HEAP32[$AsyncCtx>>2] = 128;
  $9 = ((($AsyncCtx)) + 4|0);
  HEAP32[$9>>2] = $4;
  $10 = ((($AsyncCtx)) + 8|0);
  HEAP32[$10>>2] = $3;
  $11 = ((($AsyncCtx)) + 12|0);
  HEAP32[$11>>2] = $0;
  $12 = ((($AsyncCtx)) + 16|0);
  HEAP32[$12>>2] = $5;
  sp = STACKTOP;
  return;
 }
 _emscripten_free_async_context(($AsyncCtx|0));
 $13 = Math_imul($4, $3)|0;
 $14 = ($13|0)>(0);
 if (!($14)) {
  return;
 }
 $$011 = 0;
 while(1) {
  $15 = HEAP32[$0>>2]|0;
  $16 = ((($15)) + 136|0);
  $17 = HEAP32[$16>>2]|0;
  $18 = (($5) + ($$011<<2)|0);
  $19 = HEAP32[$18>>2]|0;
  $AsyncCtx3 = _emscripten_alloc_async_context(24,sp)|0;
  FUNCTION_TABLE_vii[$17 & 255]($0,$19);
  $IsAsync4 = ___async;
  if ($IsAsync4) {
   label = 7;
   break;
  }
  _emscripten_free_async_context(($AsyncCtx3|0));
  $25 = (($$011) + 1)|0;
  $exitcond = ($25|0)==($13|0);
  if ($exitcond) {
   label = 5;
   break;
  } else {
   $$011 = $25;
  }
 }
 if ((label|0) == 5) {
  return;
 }
 else if ((label|0) == 7) {
  HEAP32[$AsyncCtx3>>2] = 129;
  $20 = ((($AsyncCtx3)) + 4|0);
  HEAP32[$20>>2] = $$011;
  $21 = ((($AsyncCtx3)) + 8|0);
  HEAP32[$21>>2] = $13;
  $22 = ((($AsyncCtx3)) + 12|0);
  HEAP32[$22>>2] = $0;
  $23 = ((($AsyncCtx3)) + 16|0);
  HEAP32[$23>>2] = $5;
  $24 = ((($AsyncCtx3)) + 20|0);
  HEAP32[$24>>2] = $0;
  sp = STACKTOP;
  return;
 }
}
function __ZN15GraphicsDisplay7blitbitEiiiiPKc($0,$1,$2,$3,$4,$5) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 $4 = $4|0;
 $5 = $5|0;
 var $$019 = 0, $$in = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0;
 var $28 = 0, $29 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, $IsAsync = 0, $IsAsync4 = 0, $exitcond = 0, label = 0;
 var sp = 0;
 sp = STACKTOP;
 $6 = HEAP32[$0>>2]|0;
 $7 = ((($6)) + 132|0);
 $8 = HEAP32[$7>>2]|0;
 $AsyncCtx = _emscripten_alloc_async_context(20,sp)|0;
 FUNCTION_TABLE_viiiii[$8 & 127]($0,$1,$2,$3,$4);
 $IsAsync = ___async;
 if ($IsAsync) {
  HEAP32[$AsyncCtx>>2] = 130;
  $9 = ((($AsyncCtx)) + 4|0);
  HEAP32[$9>>2] = $4;
  $10 = ((($AsyncCtx)) + 8|0);
  HEAP32[$10>>2] = $3;
  $11 = ((($AsyncCtx)) + 12|0);
  HEAP32[$11>>2] = $0;
  $12 = ((($AsyncCtx)) + 16|0);
  HEAP32[$12>>2] = $5;
  sp = STACKTOP;
  return;
 }
 _emscripten_free_async_context(($AsyncCtx|0));
 $13 = Math_imul($4, $3)|0;
 $14 = ($13|0)>(0);
 if (!($14)) {
  return;
 }
 $15 = ((($0)) + 28|0);
 $16 = ((($0)) + 30|0);
 $$019 = 0;
 while(1) {
  $17 = $$019 >> 3;
  $18 = (($5) + ($17)|0);
  $19 = HEAP8[$18>>0]|0;
  $20 = $$019 & 7;
  $21 = $19 << 24 >> 24;
  $22 = 128 >>> $20;
  $23 = $21 & $22;
  $24 = ($23|0)==(0);
  $$in = $24 ? $16 : $15;
  $25 = HEAP16[$$in>>1]|0;
  $26 = $25&65535;
  $27 = HEAP32[$0>>2]|0;
  $28 = ((($27)) + 136|0);
  $29 = HEAP32[$28>>2]|0;
  $AsyncCtx3 = _emscripten_alloc_async_context(32,sp)|0;
  FUNCTION_TABLE_vii[$29 & 255]($0,$26);
  $IsAsync4 = ___async;
  if ($IsAsync4) {
   label = 7;
   break;
  }
  _emscripten_free_async_context(($AsyncCtx3|0));
  $37 = (($$019) + 1)|0;
  $exitcond = ($37|0)==($13|0);
  if ($exitcond) {
   label = 5;
   break;
  } else {
   $$019 = $37;
  }
 }
 if ((label|0) == 5) {
  return;
 }
 else if ((label|0) == 7) {
  HEAP32[$AsyncCtx3>>2] = 131;
  $30 = ((($AsyncCtx3)) + 4|0);
  HEAP32[$30>>2] = $$019;
  $31 = ((($AsyncCtx3)) + 8|0);
  HEAP32[$31>>2] = $13;
  $32 = ((($AsyncCtx3)) + 12|0);
  HEAP32[$32>>2] = $5;
  $33 = ((($AsyncCtx3)) + 16|0);
  HEAP32[$33>>2] = $16;
  $34 = ((($AsyncCtx3)) + 20|0);
  HEAP32[$34>>2] = $15;
  $35 = ((($AsyncCtx3)) + 24|0);
  HEAP32[$35>>2] = $0;
  $36 = ((($AsyncCtx3)) + 28|0);
  HEAP32[$36>>2] = $0;
  sp = STACKTOP;
  return;
 }
}
function __ZThn4_N15GraphicsDisplayD1Ev($0) {
 $0 = $0|0;
 var $1 = 0, $AsyncCtx = 0, $IsAsync = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = ((($0)) + -4|0);
 $AsyncCtx = _emscripten_alloc_async_context(4,sp)|0;
 __ZN4mbed6StreamD2Ev($1);
 $IsAsync = ___async;
 if ($IsAsync) {
  HEAP32[$AsyncCtx>>2] = 132;
  sp = STACKTOP;
  return;
 } else {
  _emscripten_free_async_context(($AsyncCtx|0));
  return;
 }
}
function __ZThn4_N15GraphicsDisplayD0Ev($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $AsyncCtx = 0, $IsAsync = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = ((($0)) + -4|0);
 __THREW__ = 0;
 $AsyncCtx = _emscripten_alloc_async_context(8,sp)|0;
 invoke_vi(1,($1|0));
 $IsAsync = ___async;
 if ($IsAsync) {
  HEAP32[$AsyncCtx>>2] = 133;
  $2 = ((($AsyncCtx)) + 4|0);
  HEAP32[$2>>2] = $1;
  sp = STACKTOP;
  return;
 }
 _emscripten_free_async_context(($AsyncCtx|0));
 $3 = __THREW__; __THREW__ = 0;
 $4 = $3&1;
 if ($4) {
  $5 = ___cxa_find_matching_catch_2()|0;
  $6 = tempRet0;
  __ZdlPv($1);
  ___resumeException($5|0);
  // unreachable;
 } else {
  __ZdlPv($1);
  return;
 }
}
function __ZN15GraphicsDisplayC2EPKc($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $AsyncCtx = 0;
 var $AsyncCtx11 = 0, $AsyncCtx3 = 0, $AsyncCtx7 = 0, $IsAsync = 0, $IsAsync12 = 0, $IsAsync8 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $AsyncCtx7 = _emscripten_alloc_async_context(12,sp)|0;
 __ZN11TextDisplayC2EPKc($0,$1);
 $IsAsync8 = ___async;
 if ($IsAsync8) {
  HEAP32[$AsyncCtx7>>2] = 134;
  $2 = ((($AsyncCtx7)) + 4|0);
  HEAP32[$2>>2] = $0;
  $3 = ((($AsyncCtx7)) + 8|0);
  HEAP32[$3>>2] = $0;
  sp = STACKTOP;
  return;
 }
 _emscripten_free_async_context(($AsyncCtx7|0));
 HEAP32[$0>>2] = (552);
 $4 = ((($0)) + 4|0);
 HEAP32[$4>>2] = (712);
 __THREW__ = 0;
 invoke_vii(29,($0|0),-1);
 $5 = __THREW__; __THREW__ = 0;
 $6 = $5&1;
 if (!($6)) {
  $7 = HEAP32[$0>>2]|0;
  $8 = ((($7)) + 116|0);
  $9 = HEAP32[$8>>2]|0;
  __THREW__ = 0;
  $AsyncCtx = _emscripten_alloc_async_context(8,sp)|0;
  invoke_vii($9|0,($0|0),0);
  $IsAsync = ___async;
  if ($IsAsync) {
   HEAP32[$AsyncCtx>>2] = 135;
   $10 = ((($AsyncCtx)) + 4|0);
   HEAP32[$10>>2] = $0;
   sp = STACKTOP;
   return;
  }
  _emscripten_free_async_context(($AsyncCtx|0));
  $11 = __THREW__; __THREW__ = 0;
  $12 = $11&1;
  if (!($12)) {
   return;
  }
 }
 $13 = ___cxa_find_matching_catch_2()|0;
 $14 = tempRet0;
 __THREW__ = 0;
 $AsyncCtx11 = _emscripten_alloc_async_context(12,sp)|0;
 invoke_vi(1,($0|0));
 $IsAsync12 = ___async;
 if ($IsAsync12) {
  HEAP32[$AsyncCtx11>>2] = 136;
  $15 = ((($AsyncCtx11)) + 4|0);
  HEAP32[$15>>2] = $13;
  $16 = ((($AsyncCtx11)) + 8|0);
  HEAP32[$16>>2] = $14;
  sp = STACKTOP;
  return;
 }
 _emscripten_free_async_context(($AsyncCtx11|0));
 $17 = __THREW__; __THREW__ = 0;
 $18 = $17&1;
 if ($18) {
  $19 = ___cxa_find_matching_catch_3(0|0)|0;
  $20 = tempRet0;
  $AsyncCtx3 = _emscripten_alloc_async_context(4,sp)|0;
  ___clang_call_terminate($19);
  // unreachable;
 } else {
  ___resumeException($13|0);
  // unreachable;
 }
}
function __ZN11TextDisplayD0Ev($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $AsyncCtx = 0, $IsAsync = 0, label = 0, sp = 0;
 sp = STACKTOP;
 __THREW__ = 0;
 $AsyncCtx = _emscripten_alloc_async_context(8,sp)|0;
 invoke_vi(1,($0|0));
 $IsAsync = ___async;
 if ($IsAsync) {
  HEAP32[$AsyncCtx>>2] = 137;
  $1 = ((($AsyncCtx)) + 4|0);
  HEAP32[$1>>2] = $0;
  sp = STACKTOP;
  return;
 }
 _emscripten_free_async_context(($AsyncCtx|0));
 $2 = __THREW__; __THREW__ = 0;
 $3 = $2&1;
 if ($3) {
  $4 = ___cxa_find_matching_catch_2()|0;
  $5 = tempRet0;
  __ZdlPv($0);
  ___resumeException($4|0);
  // unreachable;
 } else {
  __ZdlPv($0);
  return;
 }
}
function __ZN11TextDisplay5_putcEi($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0;
 var $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0;
 var $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $AsyncCtx = 0, $AsyncCtx10 = 0, $AsyncCtx3 = 0, $AsyncCtx6 = 0, $IsAsync = 0, $IsAsync11 = 0, $IsAsync4 = 0, $IsAsync7 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $2 = ($1|0)==(10);
 $3 = ((($0)) + 26|0);
 $4 = HEAP16[$3>>1]|0;
 if ($2) {
  $5 = ((($0)) + 24|0);
  HEAP16[$5>>1] = 0;
  $6 = (($4) + 1)<<16>>16;
  HEAP16[$3>>1] = $6;
  $7 = $6&65535;
  $8 = HEAP32[$0>>2]|0;
  $9 = ((($8)) + 92|0);
  $10 = HEAP32[$9>>2]|0;
  $AsyncCtx = _emscripten_alloc_async_context(16,sp)|0;
  $11 = (FUNCTION_TABLE_ii[$10 & 511]($0)|0);
  $IsAsync = ___async;
  if ($IsAsync) {
   HEAP32[$AsyncCtx>>2] = 138;
   $12 = ((($AsyncCtx)) + 4|0);
   HEAP32[$12>>2] = $7;
   $13 = ((($AsyncCtx)) + 8|0);
   HEAP32[$13>>2] = $1;
   $14 = ((($AsyncCtx)) + 12|0);
   HEAP32[$14>>2] = $3;
   sp = STACKTOP;
   return 0;
  }
  _emscripten_free_async_context(($AsyncCtx|0));
  $15 = ($7|0)<($11|0);
  if ($15) {
   return ($1|0);
  }
  HEAP16[$3>>1] = 0;
  return ($1|0);
 }
 $16 = HEAP32[$0>>2]|0;
 $17 = ((($16)) + 88|0);
 $18 = HEAP32[$17>>2]|0;
 $19 = ((($0)) + 24|0);
 $20 = HEAP16[$19>>1]|0;
 $21 = $20&65535;
 $22 = $4&65535;
 $AsyncCtx3 = _emscripten_alloc_async_context(20,sp)|0;
 FUNCTION_TABLE_viiii[$18 & 127]($0,$21,$22,$1);
 $IsAsync4 = ___async;
 if ($IsAsync4) {
  HEAP32[$AsyncCtx3>>2] = 139;
  $23 = ((($AsyncCtx3)) + 4|0);
  HEAP32[$23>>2] = $19;
  $24 = ((($AsyncCtx3)) + 8|0);
  HEAP32[$24>>2] = $0;
  $25 = ((($AsyncCtx3)) + 12|0);
  HEAP32[$25>>2] = $1;
  $26 = ((($AsyncCtx3)) + 16|0);
  HEAP32[$26>>2] = $3;
  sp = STACKTOP;
  return 0;
 }
 _emscripten_free_async_context(($AsyncCtx3|0));
 $27 = HEAP16[$19>>1]|0;
 $28 = (($27) + 1)<<16>>16;
 HEAP16[$19>>1] = $28;
 $29 = $28&65535;
 $30 = HEAP32[$0>>2]|0;
 $31 = ((($30)) + 96|0);
 $32 = HEAP32[$31>>2]|0;
 $AsyncCtx6 = _emscripten_alloc_async_context(28,sp)|0;
 $33 = (FUNCTION_TABLE_ii[$32 & 511]($0)|0);
 $IsAsync7 = ___async;
 if ($IsAsync7) {
  HEAP32[$AsyncCtx6>>2] = 140;
  $34 = ((($AsyncCtx6)) + 4|0);
  HEAP32[$34>>2] = $29;
  $35 = ((($AsyncCtx6)) + 8|0);
  HEAP32[$35>>2] = $1;
  $36 = ((($AsyncCtx6)) + 12|0);
  HEAP32[$36>>2] = $19;
  $37 = ((($AsyncCtx6)) + 16|0);
  HEAP32[$37>>2] = $3;
  $38 = ((($AsyncCtx6)) + 20|0);
  HEAP32[$38>>2] = $0;
  $39 = ((($AsyncCtx6)) + 24|0);
  HEAP32[$39>>2] = $0;
  sp = STACKTOP;
  return 0;
 }
 _emscripten_free_async_context(($AsyncCtx6|0));
 $40 = ($29|0)<($33|0);
 if ($40) {
  return ($1|0);
 }
 HEAP16[$19>>1] = 0;
 $41 = HEAP16[$3>>1]|0;
 $42 = (($41) + 1)<<16>>16;
 HEAP16[$3>>1] = $42;
 $43 = $42&65535;
 $44 = HEAP32[$0>>2]|0;
 $45 = ((($44)) + 92|0);
 $46 = HEAP32[$45>>2]|0;
 $AsyncCtx10 = _emscripten_alloc_async_context(16,sp)|0;
 $47 = (FUNCTION_TABLE_ii[$46 & 511]($0)|0);
 $IsAsync11 = ___async;
 if ($IsAsync11) {
  HEAP32[$AsyncCtx10>>2] = 141;
  $48 = ((($AsyncCtx10)) + 4|0);
  HEAP32[$48>>2] = $43;
  $49 = ((($AsyncCtx10)) + 8|0);
  HEAP32[$49>>2] = $1;
  $50 = ((($AsyncCtx10)) + 12|0);
  HEAP32[$50>>2] = $3;
  sp = STACKTOP;
  return 0;
 }
 _emscripten_free_async_context(($AsyncCtx10|0));
 $51 = ($43|0)<($47|0);
 if ($51) {
  return ($1|0);
 }
 HEAP16[$3>>1] = 0;
 return ($1|0);
}
function __ZN11TextDisplay5_getcEv($0) {
 $0 = $0|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 return -1;
}
function __ZN11TextDisplay5claimEP8_IO_FILE($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $$0 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, $IsAsync = 0, $IsAsync4 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $2 = ((($0)) + 32|0);
 $3 = HEAP32[$2>>2]|0;
 $4 = ($3|0)==(0|0);
 if ($4) {
  $5 = HEAP32[280]|0;
  (_fwrite(4672,85,1,$5)|0);
  $$0 = 0;
  return ($$0|0);
 }
 $AsyncCtx3 = _emscripten_alloc_async_context(8,sp)|0;
 $6 = (_freopen($3,4758,$1)|0);
 $IsAsync4 = ___async;
 if ($IsAsync4) {
  HEAP32[$AsyncCtx3>>2] = 142;
  $7 = ((($AsyncCtx3)) + 4|0);
  HEAP32[$7>>2] = $0;
  sp = STACKTOP;
  return 0;
 }
 _emscripten_free_async_context(($AsyncCtx3|0));
 $8 = ($6|0)==(0|0);
 if ($8) {
  $$0 = 0;
  return ($$0|0);
 }
 $9 = HEAP32[373]|0;
 $10 = HEAP32[$0>>2]|0;
 $11 = ((($10)) + 96|0);
 $12 = HEAP32[$11>>2]|0;
 $AsyncCtx = _emscripten_alloc_async_context(8,sp)|0;
 $13 = (FUNCTION_TABLE_ii[$12 & 511]($0)|0);
 $IsAsync = ___async;
 if ($IsAsync) {
  HEAP32[$AsyncCtx>>2] = 143;
  $14 = ((($AsyncCtx)) + 4|0);
  HEAP32[$14>>2] = $9;
  sp = STACKTOP;
  return 0;
 }
 _emscripten_free_async_context(($AsyncCtx|0));
 (_setvbuf($9,0,1,$13)|0);
 $$0 = 1;
 return ($$0|0);
}
function __ZN11TextDisplay3clsEv($0) {
 $0 = $0|0;
 var $$03 = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0;
 var $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $5 = 0;
 var $6 = 0, $7 = 0, $8 = 0, $9 = 0, $AsyncCtx = 0, $AsyncCtx12 = 0, $AsyncCtx16 = 0, $AsyncCtx2 = 0, $AsyncCtx5 = 0, $AsyncCtx9 = 0, $IsAsync = 0, $IsAsync10 = 0, $IsAsync13 = 0, $IsAsync17 = 0, $IsAsync3 = 0, $IsAsync6 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = HEAP32[$0>>2]|0;
 $2 = ((($1)) + 108|0);
 $3 = HEAP32[$2>>2]|0;
 $AsyncCtx = _emscripten_alloc_async_context(8,sp)|0;
 FUNCTION_TABLE_viii[$3 & 255]($0,0,0);
 $IsAsync = ___async;
 if ($IsAsync) {
  HEAP32[$AsyncCtx>>2] = 144;
  $4 = ((($AsyncCtx)) + 4|0);
  HEAP32[$4>>2] = $0;
  sp = STACKTOP;
  return;
 }
 _emscripten_free_async_context(($AsyncCtx|0));
 $5 = HEAP32[$0>>2]|0;
 $6 = ((($5)) + 96|0);
 $7 = HEAP32[$6>>2]|0;
 $AsyncCtx2 = _emscripten_alloc_async_context(12,sp)|0;
 $8 = (FUNCTION_TABLE_ii[$7 & 511]($0)|0);
 $IsAsync3 = ___async;
 if ($IsAsync3) {
  HEAP32[$AsyncCtx2>>2] = 145;
  $9 = ((($AsyncCtx2)) + 4|0);
  HEAP32[$9>>2] = $0;
  $10 = ((($AsyncCtx2)) + 8|0);
  HEAP32[$10>>2] = $0;
  sp = STACKTOP;
  return;
 }
 _emscripten_free_async_context(($AsyncCtx2|0));
 $11 = HEAP32[$0>>2]|0;
 $12 = ((($11)) + 92|0);
 $13 = HEAP32[$12>>2]|0;
 $AsyncCtx5 = _emscripten_alloc_async_context(16,sp)|0;
 $14 = (FUNCTION_TABLE_ii[$13 & 511]($0)|0);
 $IsAsync6 = ___async;
 if ($IsAsync6) {
  HEAP32[$AsyncCtx5>>2] = 146;
  $15 = ((($AsyncCtx5)) + 4|0);
  HEAP32[$15>>2] = $8;
  $16 = ((($AsyncCtx5)) + 8|0);
  HEAP32[$16>>2] = $0;
  $17 = ((($AsyncCtx5)) + 12|0);
  HEAP32[$17>>2] = $0;
  sp = STACKTOP;
  return;
 }
 _emscripten_free_async_context(($AsyncCtx5|0));
 $18 = Math_imul($14, $8)|0;
 $19 = ($18|0)>(0);
 if (!($19)) {
  return;
 }
 $$03 = 0;
 while(1) {
  $AsyncCtx16 = _emscripten_alloc_async_context(20,sp)|0;
  (__ZN4mbed6Stream4putcEi($0,32)|0);
  $IsAsync17 = ___async;
  if ($IsAsync17) {
   label = 11;
   break;
  }
  _emscripten_free_async_context(($AsyncCtx16|0));
  $24 = (($$03) + 1)|0;
  $25 = HEAP32[$0>>2]|0;
  $26 = ((($25)) + 96|0);
  $27 = HEAP32[$26>>2]|0;
  $AsyncCtx9 = _emscripten_alloc_async_context(20,sp)|0;
  $28 = (FUNCTION_TABLE_ii[$27 & 511]($0)|0);
  $IsAsync10 = ___async;
  if ($IsAsync10) {
   label = 13;
   break;
  }
  _emscripten_free_async_context(($AsyncCtx9|0));
  $33 = HEAP32[$0>>2]|0;
  $34 = ((($33)) + 92|0);
  $35 = HEAP32[$34>>2]|0;
  $AsyncCtx12 = _emscripten_alloc_async_context(24,sp)|0;
  $36 = (FUNCTION_TABLE_ii[$35 & 511]($0)|0);
  $IsAsync13 = ___async;
  if ($IsAsync13) {
   label = 15;
   break;
  }
  _emscripten_free_async_context(($AsyncCtx12|0));
  $42 = Math_imul($36, $28)|0;
  $43 = ($24|0)<($42|0);
  if ($43) {
   $$03 = $24;
  } else {
   label = 9;
   break;
  }
 }
 if ((label|0) == 9) {
  return;
 }
 else if ((label|0) == 11) {
  HEAP32[$AsyncCtx16>>2] = 147;
  $20 = ((($AsyncCtx16)) + 4|0);
  HEAP32[$20>>2] = $$03;
  $21 = ((($AsyncCtx16)) + 8|0);
  HEAP32[$21>>2] = $0;
  $22 = ((($AsyncCtx16)) + 12|0);
  HEAP32[$22>>2] = $0;
  $23 = ((($AsyncCtx16)) + 16|0);
  HEAP32[$23>>2] = $0;
  sp = STACKTOP;
  return;
 }
 else if ((label|0) == 13) {
  HEAP32[$AsyncCtx9>>2] = 148;
  $29 = ((($AsyncCtx9)) + 4|0);
  HEAP32[$29>>2] = $0;
  $30 = ((($AsyncCtx9)) + 8|0);
  HEAP32[$30>>2] = $0;
  $31 = ((($AsyncCtx9)) + 12|0);
  HEAP32[$31>>2] = $24;
  $32 = ((($AsyncCtx9)) + 16|0);
  HEAP32[$32>>2] = $0;
  sp = STACKTOP;
  return;
 }
 else if ((label|0) == 15) {
  HEAP32[$AsyncCtx12>>2] = 149;
  $37 = ((($AsyncCtx12)) + 4|0);
  HEAP32[$37>>2] = $28;
  $38 = ((($AsyncCtx12)) + 8|0);
  HEAP32[$38>>2] = $24;
  $39 = ((($AsyncCtx12)) + 12|0);
  HEAP32[$39>>2] = $0;
  $40 = ((($AsyncCtx12)) + 16|0);
  HEAP32[$40>>2] = $0;
  $41 = ((($AsyncCtx12)) + 20|0);
  HEAP32[$41>>2] = $0;
  sp = STACKTOP;
  return;
 }
}
function __ZN11TextDisplay6locateEii($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $3 = 0, $4 = 0, $5 = 0, $6 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $3 = $1&65535;
 $4 = ((($0)) + 24|0);
 HEAP16[$4>>1] = $3;
 $5 = $2&65535;
 $6 = ((($0)) + 26|0);
 HEAP16[$6>>1] = $5;
 return;
}
function __ZN11TextDisplay10foregroundEt($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $2 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $2 = ((($0)) + 28|0);
 HEAP16[$2>>1] = $1;
 return;
}
function __ZN11TextDisplay10backgroundEt($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $2 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $2 = ((($0)) + 30|0);
 HEAP16[$2>>1] = $1;
 return;
}
function __ZThn4_N11TextDisplayD1Ev($0) {
 $0 = $0|0;
 var $1 = 0, $AsyncCtx = 0, $IsAsync = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = ((($0)) + -4|0);
 $AsyncCtx = _emscripten_alloc_async_context(4,sp)|0;
 __ZN4mbed6StreamD2Ev($1);
 $IsAsync = ___async;
 if ($IsAsync) {
  HEAP32[$AsyncCtx>>2] = 150;
  sp = STACKTOP;
  return;
 } else {
  _emscripten_free_async_context(($AsyncCtx|0));
  return;
 }
}
function __ZThn4_N11TextDisplayD0Ev($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $AsyncCtx = 0, $IsAsync = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = ((($0)) + -4|0);
 __THREW__ = 0;
 $AsyncCtx = _emscripten_alloc_async_context(8,sp)|0;
 invoke_vi(1,($1|0));
 $IsAsync = ___async;
 if ($IsAsync) {
  HEAP32[$AsyncCtx>>2] = 151;
  $2 = ((($AsyncCtx)) + 4|0);
  HEAP32[$2>>2] = $1;
  sp = STACKTOP;
  return;
 }
 _emscripten_free_async_context(($AsyncCtx|0));
 $3 = __THREW__; __THREW__ = 0;
 $4 = $3&1;
 if ($4) {
  $5 = ___cxa_find_matching_catch_2()|0;
  $6 = tempRet0;
  __ZdlPv($1);
  ___resumeException($5|0);
  // unreachable;
 } else {
  __ZdlPv($1);
  return;
 }
}
function __ZN11TextDisplayC2EPKc($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0;
 var $29 = 0, $3 = 0, $30 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $AsyncCtx = 0, $AsyncCtx11 = 0, $AsyncCtx3 = 0, $AsyncCtx7 = 0, $IsAsync12 = 0, $IsAsync4 = 0, $IsAsync8 = 0, $vararg_buffer = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $vararg_buffer = sp;
 $AsyncCtx3 = _emscripten_alloc_async_context(24,sp)|0;
 __ZN4mbed6StreamC2EPKc($0,$1);
 $IsAsync4 = ___async;
 if ($IsAsync4) {
  HEAP32[$AsyncCtx3>>2] = 152;
  $2 = ((($AsyncCtx3)) + 4|0);
  HEAP32[$2>>2] = $0;
  $3 = ((($AsyncCtx3)) + 8|0);
  HEAP32[$3>>2] = $1;
  $4 = ((($AsyncCtx3)) + 12|0);
  HEAP32[$4>>2] = $0;
  $5 = ((($AsyncCtx3)) + 16|0);
  HEAP32[$5>>2] = $vararg_buffer;
  $6 = ((($AsyncCtx3)) + 20|0);
  HEAP32[$6>>2] = $vararg_buffer;
  sp = STACKTOP;
  STACKTOP = sp;return;
 }
 _emscripten_free_async_context(($AsyncCtx3|0));
 HEAP32[$0>>2] = (728);
 $7 = ((($0)) + 4|0);
 HEAP32[$7>>2] = (856);
 $8 = ((($0)) + 26|0);
 HEAP16[$8>>1] = 0;
 $9 = ((($0)) + 24|0);
 HEAP16[$9>>1] = 0;
 $10 = ($1|0)==(0|0);
 if ($10) {
  $11 = ((($0)) + 32|0);
  HEAP32[$11>>2] = 0;
  STACKTOP = sp;return;
 }
 $12 = (_strlen($1)|0);
 $13 = (($12) + 2)|0;
 __THREW__ = 0;
 $AsyncCtx7 = _emscripten_alloc_async_context(24,sp)|0;
 $14 = (invoke_ii(153,($13|0))|0);
 $IsAsync8 = ___async;
 if ($IsAsync8) {
  HEAP32[$AsyncCtx7>>2] = 154;
  $15 = ((($AsyncCtx7)) + 4|0);
  HEAP32[$15>>2] = $0;
  $16 = ((($AsyncCtx7)) + 8|0);
  HEAP32[$16>>2] = $0;
  $17 = ((($AsyncCtx7)) + 12|0);
  HEAP32[$17>>2] = $vararg_buffer;
  $18 = ((($AsyncCtx7)) + 16|0);
  HEAP32[$18>>2] = $1;
  $19 = ((($AsyncCtx7)) + 20|0);
  HEAP32[$19>>2] = $vararg_buffer;
  sp = STACKTOP;
  STACKTOP = sp;return;
 }
 _emscripten_free_async_context(($AsyncCtx7|0));
 $20 = __THREW__; __THREW__ = 0;
 $21 = $20&1;
 if (!($21)) {
  $22 = ((($0)) + 32|0);
  HEAP32[$22>>2] = $14;
  HEAP32[$vararg_buffer>>2] = $1;
  (_sprintf($14,4774,$vararg_buffer)|0);
  STACKTOP = sp;return;
 }
 $23 = ___cxa_find_matching_catch_2()|0;
 $24 = tempRet0;
 __THREW__ = 0;
 $AsyncCtx11 = _emscripten_alloc_async_context(12,sp)|0;
 invoke_vi(1,($0|0));
 $IsAsync12 = ___async;
 if ($IsAsync12) {
  HEAP32[$AsyncCtx11>>2] = 155;
  $25 = ((($AsyncCtx11)) + 4|0);
  HEAP32[$25>>2] = $23;
  $26 = ((($AsyncCtx11)) + 8|0);
  HEAP32[$26>>2] = $24;
  sp = STACKTOP;
  STACKTOP = sp;return;
 }
 _emscripten_free_async_context(($AsyncCtx11|0));
 $27 = __THREW__; __THREW__ = 0;
 $28 = $27&1;
 if ($28) {
  $29 = ___cxa_find_matching_catch_3(0|0)|0;
  $30 = tempRet0;
  $AsyncCtx = _emscripten_alloc_async_context(4,sp)|0;
  ___clang_call_terminate($29);
  // unreachable;
 } else {
  ___resumeException($23|0);
  // unreachable;
 }
}
function __ZN5Sht31C2E7PinNameS0_($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $3 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $3 = _emscripten_asm_const_iiii(2, ($0|0), ($1|0), ($2|0))|0;
 return;
}
function __ZN5Sht3115readTemperatureEv($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0.0, $3 = 0.0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = _emscripten_asm_const_ii(3, ($0|0))|0;
 $2 = (+($1|0));
 $3 = $2 / 100.0;
 return (+$3);
}
function __ZN5Sht3112readHumidityEv($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0.0, $3 = 0.0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = _emscripten_asm_const_ii(4, ($0|0))|0;
 $2 = (+($1|0));
 $3 = $2 / 100.0;
 return (+$3);
}
function _invoke_ticker($0) {
 $0 = $0|0;
 var $$pre$i = 0, $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $AsyncCtx = 0, $IsAsync = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = $0;
 $2 = ((($1)) + 12|0);
 $3 = HEAP32[$2>>2]|0;
 $4 = ($3|0)==(0|0);
 if ($4) {
  _mbed_assert_internal(4932,4937,526);
  $$pre$i = HEAP32[$2>>2]|0;
  $6 = $$pre$i;
 } else {
  $6 = $3;
 }
 $5 = HEAP32[$6>>2]|0;
 $7 = $0;
 $AsyncCtx = _emscripten_alloc_async_context(4,sp)|0;
 FUNCTION_TABLE_vi[$5 & 511]($7);
 $IsAsync = ___async;
 if ($IsAsync) {
  HEAP32[$AsyncCtx>>2] = 156;
  sp = STACKTOP;
  return;
 } else {
  _emscripten_free_async_context(($AsyncCtx|0));
  return;
 }
}
function __ZN4mbed7TimeoutD2Ev($0) {
 $0 = $0|0;
 var $1 = 0, $10 = 0, $11 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $AsyncCtx = 0, $IsAsync = 0, label = 0, sp = 0;
 sp = STACKTOP;
 HEAP32[$0>>2] = (872);
 $1 = ((($0)) + 16|0);
 $2 = _emscripten_asm_const_ii(5, ($1|0))|0;
 $3 = ((($0)) + 28|0);
 $4 = HEAP32[$3>>2]|0;
 $5 = ($4|0)==(0|0);
 if ($5) {
  return;
 }
 $6 = ((($4)) + 8|0);
 $7 = HEAP32[$6>>2]|0;
 __THREW__ = 0;
 $AsyncCtx = _emscripten_alloc_async_context(4,sp)|0;
 invoke_vi($7|0,($1|0));
 $IsAsync = ___async;
 if ($IsAsync) {
  HEAP32[$AsyncCtx>>2] = 157;
  sp = STACKTOP;
  return;
 }
 _emscripten_free_async_context(($AsyncCtx|0));
 $8 = __THREW__; __THREW__ = 0;
 $9 = $8&1;
 if ($9) {
  $10 = ___cxa_find_matching_catch_2()|0;
  $11 = tempRet0;
  ___resumeException($10|0);
  // unreachable;
 } else {
  return;
 }
}
function __ZN4mbed7TimeoutD0Ev($0) {
 $0 = $0|0;
 var $1 = 0, $10 = 0, $11 = 0, $12 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $AsyncCtx = 0, $IsAsync = 0, label = 0, sp = 0;
 sp = STACKTOP;
 HEAP32[$0>>2] = (872);
 $1 = ((($0)) + 16|0);
 $2 = _emscripten_asm_const_ii(5, ($1|0))|0;
 $3 = ((($0)) + 28|0);
 $4 = HEAP32[$3>>2]|0;
 $5 = ($4|0)==(0|0);
 if ($5) {
  __ZdlPv($0);
  return;
 }
 $6 = ((($4)) + 8|0);
 $7 = HEAP32[$6>>2]|0;
 __THREW__ = 0;
 $AsyncCtx = _emscripten_alloc_async_context(8,sp)|0;
 invoke_vi($7|0,($1|0));
 $IsAsync = ___async;
 if ($IsAsync) {
  HEAP32[$AsyncCtx>>2] = 158;
  $8 = ((($AsyncCtx)) + 4|0);
  HEAP32[$8>>2] = $0;
  sp = STACKTOP;
  return;
 }
 _emscripten_free_async_context(($AsyncCtx|0));
 $9 = __THREW__; __THREW__ = 0;
 $10 = $9&1;
 if ($10) {
  $11 = ___cxa_find_matching_catch_2()|0;
  $12 = tempRet0;
  __ZdlPv($0);
  ___resumeException($11|0);
  // unreachable;
 } else {
  __ZdlPv($0);
  return;
 }
}
function __ZN4mbed7Timeout7handlerEv($0) {
 $0 = $0|0;
 var $$pre$i = 0, $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $AsyncCtx = 0, $IsAsync = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = ((($0)) + 16|0);
 $2 = ((($0)) + 28|0);
 $3 = HEAP32[$2>>2]|0;
 $4 = ($3|0)==(0|0);
 if ($4) {
  _mbed_assert_internal(4932,4937,526);
  $$pre$i = HEAP32[$2>>2]|0;
  $6 = $$pre$i;
 } else {
  $6 = $3;
 }
 $5 = HEAP32[$6>>2]|0;
 $AsyncCtx = _emscripten_alloc_async_context(4,sp)|0;
 FUNCTION_TABLE_vi[$5 & 511]($1);
 $IsAsync = ___async;
 if ($IsAsync) {
  HEAP32[$AsyncCtx>>2] = 159;
  sp = STACKTOP;
  return;
 } else {
  _emscripten_free_async_context(($AsyncCtx|0));
  return;
 }
}
function _invoke_timeout($0) {
 $0 = $0|0;
 var $$pre$i = 0, $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $AsyncCtx = 0, $IsAsync = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = $0;
 $2 = ((($1)) + 12|0);
 $3 = HEAP32[$2>>2]|0;
 $4 = ($3|0)==(0|0);
 if ($4) {
  _mbed_assert_internal(4932,4937,526);
  $$pre$i = HEAP32[$2>>2]|0;
  $6 = $$pre$i;
 } else {
  $6 = $3;
 }
 $5 = HEAP32[$6>>2]|0;
 $7 = $0;
 $AsyncCtx = _emscripten_alloc_async_context(4,sp)|0;
 FUNCTION_TABLE_vi[$5 & 511]($7);
 $IsAsync = ___async;
 if ($IsAsync) {
  HEAP32[$AsyncCtx>>2] = 160;
  sp = STACKTOP;
  return;
 } else {
  _emscripten_free_async_context(($AsyncCtx|0));
  return;
 }
}
function __ZN4mbed5TimerC2Ev($0) {
 $0 = $0|0;
 var $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $AsyncCtx = 0, $IsAsync = 0, label = 0;
 var sp = 0;
 sp = STACKTOP;
 HEAP32[$0>>2] = 0;
 $1 = ((($0)) + 8|0);
 $2 = ((($0)) + 16|0);
 ;HEAP32[$1>>2]=0|0;HEAP32[$1+4>>2]=0|0;HEAP32[$1+8>>2]=0|0;HEAP32[$1+12>>2]=0|0;
 $3 = (_get_us_ticker_data()|0);
 $4 = ((($0)) + 24|0);
 HEAP32[$4>>2] = $3;
 $5 = ((($0)) + 28|0);
 HEAP8[$5>>0] = 1;
 $AsyncCtx = _emscripten_alloc_async_context(12,sp)|0;
 $6 = (_ticker_read_us($3)|0);
 $7 = tempRet0;
 $IsAsync = ___async;
 if ($IsAsync) {
  HEAP32[$AsyncCtx>>2] = 161;
  $8 = ((($AsyncCtx)) + 4|0);
  HEAP32[$8>>2] = $1;
  $9 = ((($AsyncCtx)) + 8|0);
  HEAP32[$9>>2] = $2;
  sp = STACKTOP;
  return;
 } else {
  _emscripten_free_async_context(($AsyncCtx|0));
  $10 = $1;
  $11 = $10;
  HEAP32[$11>>2] = $6;
  $12 = (($10) + 4)|0;
  $13 = $12;
  HEAP32[$13>>2] = $7;
  $14 = $2;
  $15 = $14;
  HEAP32[$15>>2] = 0;
  $16 = (($14) + 4)|0;
  $17 = $16;
  HEAP32[$17>>2] = 0;
  return;
 }
}
function __GLOBAL__sub_I_arm_hal_timer_cpp() {
 var $AsyncCtx = 0, $IsAsync = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $AsyncCtx = _emscripten_alloc_async_context(4,sp)|0;
 __ZN4mbed5TimerC2Ev(8864);
 $IsAsync = ___async;
 if ($IsAsync) {
  HEAP32[$AsyncCtx>>2] = 162;
  sp = STACKTOP;
  return;
 } else {
  _emscripten_free_async_context(($AsyncCtx|0));
  HEAP32[2224] = (872);
  ;HEAP32[(8912)>>2]=0|0;HEAP32[(8912)+4>>2]=0|0;HEAP32[(8912)+8>>2]=0|0;HEAP32[(8912)+12>>2]=0|0;
  HEAP8[(8928)>>0] = 1;
  return;
 }
}
function _ticker_read_us($0) {
 $0 = $0|0;
 var $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0;
 var $28 = 0, $29 = 0, $3 = 0, $30 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $AsyncCtx = 0, $IsAsync = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = ((($0)) + 4|0);
 $2 = HEAP32[$1>>2]|0;
 $3 = ((($2)) + 8|0);
 $4 = $3;
 $5 = $4;
 $6 = HEAP32[$5>>2]|0;
 $7 = (($4) + 4)|0;
 $8 = $7;
 $9 = HEAP32[$8>>2]|0;
 $10 = HEAP32[$0>>2]|0;
 $11 = ((($10)) + 4|0);
 $12 = HEAP32[$11>>2]|0;
 $AsyncCtx = _emscripten_alloc_async_context(24,sp)|0;
 $13 = (FUNCTION_TABLE_i[$12 & 255]()|0);
 $IsAsync = ___async;
 if ($IsAsync) {
  HEAP32[$AsyncCtx>>2] = 163;
  $14 = ((($AsyncCtx)) + 8|0);
  $15 = $14;
  $16 = $15;
  HEAP32[$16>>2] = $6;
  $17 = (($15) + 4)|0;
  $18 = $17;
  HEAP32[$18>>2] = $9;
  $19 = ((($AsyncCtx)) + 16|0);
  HEAP32[$19>>2] = $1;
  sp = STACKTOP;
  tempRet0 = (0);
  return 0;
 } else {
  _emscripten_free_async_context(($AsyncCtx|0));
  $20 = ($6>>>0)>($13>>>0);
  $21 = (_i64Add(($13|0),($9|0),0,1)|0);
  $22 = tempRet0;
  $23 = $20 ? $21 : $13;
  $24 = $20 ? $22 : $9;
  $25 = HEAP32[$1>>2]|0;
  $26 = ((($25)) + 8|0);
  $27 = $26;
  $28 = $27;
  HEAP32[$28>>2] = $23;
  $29 = (($27) + 4)|0;
  $30 = $29;
  HEAP32[$30>>2] = $24;
  tempRet0 = ($24);
  return ($23|0);
 }
 return (0)|0;
}
function _us_ticker_init() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return;
}
function _us_ticker_read() {
 var $0 = 0, $1 = 0, $2 = 0.0, $3 = 0.0, $4 = 0, $5 = 0, $6 = 0.0, $7 = 0.0, $8 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $0 = sp;
 (_clock_gettime(0,($0|0))|0);
 $1 = HEAP32[$0>>2]|0;
 $2 = (+($1|0));
 $3 = $2 * 1.0E+9;
 $4 = ((($0)) + 4|0);
 $5 = HEAP32[$4>>2]|0;
 $6 = (+($5|0));
 $7 = $3 + $6;
 $8 = (~~(($7))>>>0);
 STACKTOP = sp;return ($8|0);
}
function _us_ticker_set_interrupt($0) {
 $0 = $0|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 return;
}
function _us_ticker_fire_interrupt() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return;
}
function _us_ticker_disable_interrupt() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return;
}
function _us_ticker_clear_interrupt() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return;
}
function _get_us_ticker_data() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (884|0);
}
function __ZN4mbed8FileBaseD2Ev($0) {
 $0 = $0|0;
 var $$0 = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0;
 var sp = 0;
 sp = STACKTOP;
 HEAP32[$0>>2] = (924);
 $1 = HEAP32[2241]|0;
 $2 = ($1|0)==(0|0);
 if ($2) {
  HEAP32[2241] = (8968);
 } else {
  $3 = ($1|0)==((8968)|0);
  if (!($3)) {
   _mbed_assert_internal(5112,5132,91);
  }
 }
 $4 = ((($0)) + 8|0);
 $5 = HEAP32[$4>>2]|0;
 $6 = ($5|0)==(0|0);
 do {
  if (!($6)) {
   $7 = HEAP32[2240]|0;
   $8 = ($7|0)==($0|0);
   if ($8) {
    $9 = ((($0)) + 4|0);
    $10 = HEAP32[$9>>2]|0;
    HEAP32[2240] = $10;
    break;
   } else {
    $$0 = $7;
   }
   while(1) {
    $11 = ((($$0)) + 4|0);
    $12 = HEAP32[$11>>2]|0;
    $13 = ($12|0)==($0|0);
    if ($13) {
     break;
    } else {
     $$0 = $12;
    }
   }
   $14 = ((($0)) + 4|0);
   $15 = HEAP32[$14>>2]|0;
   HEAP32[$11>>2] = $15;
  }
 } while(0);
 $16 = HEAP32[2241]|0;
 $17 = ($16|0)==(0|0);
 if ($17) {
  HEAP32[2241] = (8968);
  return;
 }
 $18 = ($16|0)==((8968)|0);
 if ($18) {
  return;
 }
 _mbed_assert_internal(5112,5132,91);
 return;
}
function __ZN4mbed8FileBaseD0Ev($0) {
 $0 = $0|0;
 var $$0$i = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $3 = 0, $4 = 0;
 var $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 HEAP32[$0>>2] = (924);
 $1 = HEAP32[2241]|0;
 $2 = ($1|0)==(0|0);
 if ($2) {
  HEAP32[2241] = (8968);
 } else {
  $3 = ($1|0)==((8968)|0);
  if (!($3)) {
   __THREW__ = 0;
   invoke_viii(164,(5112|0),(5132|0),91);
   $4 = __THREW__; __THREW__ = 0;
   $5 = $4&1;
   if ($5) {
    $23 = ___cxa_find_matching_catch_2()|0;
    $24 = tempRet0;
    __ZdlPv($0);
    ___resumeException($23|0);
    // unreachable;
   }
  }
 }
 $6 = ((($0)) + 8|0);
 $7 = HEAP32[$6>>2]|0;
 $8 = ($7|0)==(0|0);
 do {
  if (!($8)) {
   $9 = HEAP32[2240]|0;
   $10 = ($9|0)==($0|0);
   if ($10) {
    $11 = ((($0)) + 4|0);
    $12 = HEAP32[$11>>2]|0;
    HEAP32[2240] = $12;
    break;
   } else {
    $$0$i = $9;
   }
   while(1) {
    $13 = ((($$0$i)) + 4|0);
    $14 = HEAP32[$13>>2]|0;
    $15 = ($14|0)==($0|0);
    if ($15) {
     break;
    } else {
     $$0$i = $14;
    }
   }
   $16 = ((($0)) + 4|0);
   $17 = HEAP32[$16>>2]|0;
   HEAP32[$13>>2] = $17;
  }
 } while(0);
 $18 = HEAP32[2241]|0;
 $19 = ($18|0)==(0|0);
 if ($19) {
  HEAP32[2241] = (8968);
  __ZdlPv($0);
  return;
 }
 $20 = ($18|0)==((8968)|0);
 if ($20) {
  __ZdlPv($0);
  return;
 }
 __THREW__ = 0;
 invoke_viii(164,(5112|0),(5132|0),91);
 $21 = __THREW__; __THREW__ = 0;
 $22 = $21&1;
 if ($22) {
  $23 = ___cxa_find_matching_catch_2()|0;
  $24 = tempRet0;
  __ZdlPv($0);
  ___resumeException($23|0);
  // unreachable;
 } else {
  __ZdlPv($0);
  return;
 }
}
function __ZN4mbed8FileBaseC2EPKcNS_8PathTypeE($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 HEAP32[$0>>2] = (924);
 $3 = ((($0)) + 4|0);
 HEAP32[$3>>2] = 0;
 $4 = ((($0)) + 8|0);
 HEAP32[$4>>2] = $1;
 $5 = ((($0)) + 12|0);
 HEAP32[$5>>2] = $2;
 $6 = HEAP32[2241]|0;
 $7 = ($6|0)==(0|0);
 if ($7) {
  HEAP32[2241] = (8968);
 } else {
  $8 = ($6|0)==((8968)|0);
  if (!($8)) {
   _mbed_assert_internal(5112,5132,91);
  }
 }
 $9 = ($1|0)==(0|0);
 if ($9) {
  HEAP32[$3>>2] = 0;
 } else {
  $10 = HEAP32[2240]|0;
  HEAP32[$3>>2] = $10;
  HEAP32[2240] = $0;
 }
 $11 = HEAP32[2241]|0;
 $12 = ($11|0)==(0|0);
 if ($12) {
  HEAP32[2241] = (8968);
  return;
 }
 $13 = ($11|0)==((8968)|0);
 if ($13) {
  return;
 }
 _mbed_assert_internal(5112,5132,91);
 return;
}
function __ZN4mbed11NonCopyableINS_10FileHandleEED2Ev($0) {
 $0 = $0|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 return;
}
function __ZN4mbed10FileHandleD0Ev($0) {
 $0 = $0|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 __ZdlPv($0);
 return;
}
function __ZN4mbed10FileHandle4syncEv($0) {
 $0 = $0|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 return 0;
}
function __ZN4mbed10FileHandle6isattyEv($0) {
 $0 = $0|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 return 0;
}
function __ZN4mbed10FileHandle4tellEv($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, $AsyncCtx = 0, $IsAsync = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = HEAP32[$0>>2]|0;
 $2 = ((($1)) + 16|0);
 $3 = HEAP32[$2>>2]|0;
 $AsyncCtx = _emscripten_alloc_async_context(4,sp)|0;
 $4 = (FUNCTION_TABLE_iiii[$3 & 255]($0,0,1)|0);
 $IsAsync = ___async;
 if ($IsAsync) {
  HEAP32[$AsyncCtx>>2] = 165;
  sp = STACKTOP;
  return 0;
 } else {
  _emscripten_free_async_context(($AsyncCtx|0));
  return ($4|0);
 }
 return (0)|0;
}
function __ZN4mbed10FileHandle6rewindEv($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $AsyncCtx = 0, $IsAsync = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = HEAP32[$0>>2]|0;
 $2 = ((($1)) + 16|0);
 $3 = HEAP32[$2>>2]|0;
 $AsyncCtx = _emscripten_alloc_async_context(4,sp)|0;
 (FUNCTION_TABLE_iiii[$3 & 255]($0,0,0)|0);
 $IsAsync = ___async;
 if ($IsAsync) {
  HEAP32[$AsyncCtx>>2] = 166;
  sp = STACKTOP;
  return;
 } else {
  _emscripten_free_async_context(($AsyncCtx|0));
  return;
 }
}
function __ZN4mbed10FileHandle4sizeEv($0) {
 $0 = $0|0;
 var $$0 = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $AsyncCtx = 0;
 var $AsyncCtx3 = 0, $AsyncCtx6 = 0, $IsAsync = 0, $IsAsync4 = 0, $IsAsync7 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = HEAP32[$0>>2]|0;
 $2 = ((($1)) + 16|0);
 $3 = HEAP32[$2>>2]|0;
 $AsyncCtx = _emscripten_alloc_async_context(12,sp)|0;
 $4 = (FUNCTION_TABLE_iiii[$3 & 255]($0,0,1)|0);
 $IsAsync = ___async;
 if ($IsAsync) {
  HEAP32[$AsyncCtx>>2] = 167;
  $5 = ((($AsyncCtx)) + 4|0);
  HEAP32[$5>>2] = $0;
  $6 = ((($AsyncCtx)) + 8|0);
  HEAP32[$6>>2] = $0;
  sp = STACKTOP;
  return 0;
 }
 _emscripten_free_async_context(($AsyncCtx|0));
 $7 = ($4|0)<(0);
 if ($7) {
  $$0 = $4;
  return ($$0|0);
 }
 $8 = HEAP32[$0>>2]|0;
 $9 = ((($8)) + 16|0);
 $10 = HEAP32[$9>>2]|0;
 $AsyncCtx3 = _emscripten_alloc_async_context(16,sp)|0;
 $11 = (FUNCTION_TABLE_iiii[$10 & 255]($0,0,2)|0);
 $IsAsync4 = ___async;
 if ($IsAsync4) {
  HEAP32[$AsyncCtx3>>2] = 168;
  $12 = ((($AsyncCtx3)) + 4|0);
  HEAP32[$12>>2] = $0;
  $13 = ((($AsyncCtx3)) + 8|0);
  HEAP32[$13>>2] = $0;
  $14 = ((($AsyncCtx3)) + 12|0);
  HEAP32[$14>>2] = $4;
  sp = STACKTOP;
  return 0;
 }
 _emscripten_free_async_context(($AsyncCtx3|0));
 $15 = HEAP32[$0>>2]|0;
 $16 = ((($15)) + 16|0);
 $17 = HEAP32[$16>>2]|0;
 $AsyncCtx6 = _emscripten_alloc_async_context(8,sp)|0;
 (FUNCTION_TABLE_iiii[$17 & 255]($0,$4,0)|0);
 $IsAsync7 = ___async;
 if ($IsAsync7) {
  HEAP32[$AsyncCtx6>>2] = 169;
  $18 = ((($AsyncCtx6)) + 4|0);
  HEAP32[$18>>2] = $11;
  sp = STACKTOP;
  return 0;
 }
 _emscripten_free_async_context(($AsyncCtx6|0));
 $$0 = $11;
 return ($$0|0);
}
function __ZN4mbed6fdopenEPNS_10FileHandleEPKc($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $2 = 0, $AsyncCtx = 0, $IsAsync = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $AsyncCtx = _emscripten_alloc_async_context(4,sp)|0;
 $2 = (__ZN4mbed11mbed_fdopenEPNS_10FileHandleEPKc($0,$1)|0);
 $IsAsync = ___async;
 if ($IsAsync) {
  HEAP32[$AsyncCtx>>2] = 170;
  sp = STACKTOP;
  return (0|0);
 } else {
  _emscripten_free_async_context(($AsyncCtx|0));
  return ($2|0);
 }
 return (0)|0;
}
function __ZN4mbed6StreamD2Ev($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $AsyncCtx = 0, $IsAsync = 0, label = 0, sp = 0;
 sp = STACKTOP;
 HEAP32[$0>>2] = (1016);
 $1 = ((($0)) + 4|0);
 HEAP32[$1>>2] = (1112);
 $2 = ((($0)) + 20|0);
 $3 = HEAP32[$2>>2]|0;
 $AsyncCtx = _emscripten_alloc_async_context(8,sp)|0;
 (_fclose($3)|0);
 $IsAsync = ___async;
 if ($IsAsync) {
  HEAP32[$AsyncCtx>>2] = 171;
  $4 = ((($AsyncCtx)) + 4|0);
  HEAP32[$4>>2] = $0;
  sp = STACKTOP;
  return;
 } else {
  _emscripten_free_async_context(($AsyncCtx|0));
  $5 = ((($0)) + 4|0);
  __ZN4mbed8FileBaseD2Ev($5);
  return;
 }
}
function __ZN4mbed6StreamD0Ev($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $AsyncCtx = 0, $IsAsync = 0, label = 0, sp = 0;
 sp = STACKTOP;
 HEAP32[$0>>2] = (1016);
 $1 = ((($0)) + 4|0);
 HEAP32[$1>>2] = (1112);
 $2 = ((($0)) + 20|0);
 $3 = HEAP32[$2>>2]|0;
 $AsyncCtx = _emscripten_alloc_async_context(8,sp)|0;
 (_fclose($3)|0);
 $IsAsync = ___async;
 if ($IsAsync) {
  HEAP32[$AsyncCtx>>2] = 172;
  $4 = ((($AsyncCtx)) + 4|0);
  HEAP32[$4>>2] = $0;
  sp = STACKTOP;
  return;
 }
 _emscripten_free_async_context(($AsyncCtx|0));
 $5 = ((($0)) + 4|0);
 __THREW__ = 0;
 invoke_vi(64,($5|0));
 $6 = __THREW__; __THREW__ = 0;
 $7 = $6&1;
 if ($7) {
  $8 = ___cxa_find_matching_catch_2()|0;
  $9 = tempRet0;
  __ZdlPv($0);
  ___resumeException($8|0);
  // unreachable;
 } else {
  __ZdlPv($0);
  return;
 }
}
function __ZN4mbed6Stream4readEPvj($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $$016$lcssa = 0, $$01617 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0;
 var $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $AsyncCtx = 0, $AsyncCtx2 = 0, $AsyncCtx5 = 0, $IsAsync = 0, $IsAsync3 = 0, $IsAsync6 = 0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 $3 = (($1) + ($2)|0);
 $4 = HEAP32[$0>>2]|0;
 $5 = ((($4)) + 80|0);
 $6 = HEAP32[$5>>2]|0;
 $AsyncCtx = _emscripten_alloc_async_context(24,sp)|0;
 FUNCTION_TABLE_vi[$6 & 511]($0);
 $IsAsync = ___async;
 if ($IsAsync) {
  HEAP32[$AsyncCtx>>2] = 173;
  $7 = ((($AsyncCtx)) + 4|0);
  HEAP32[$7>>2] = $0;
  $8 = ((($AsyncCtx)) + 8|0);
  HEAP32[$8>>2] = $2;
  $9 = ((($AsyncCtx)) + 12|0);
  HEAP32[$9>>2] = $1;
  $10 = ((($AsyncCtx)) + 16|0);
  HEAP32[$10>>2] = $3;
  $11 = ((($AsyncCtx)) + 20|0);
  HEAP32[$11>>2] = $0;
  sp = STACKTOP;
  return 0;
 }
 _emscripten_free_async_context(($AsyncCtx|0));
 $12 = ($2|0)==(0);
 L4: do {
  if ($12) {
   $$016$lcssa = $1;
  } else {
   $$01617 = $1;
   while(1) {
    $13 = HEAP32[$0>>2]|0;
    $14 = ((($13)) + 72|0);
    $15 = HEAP32[$14>>2]|0;
    $AsyncCtx2 = _emscripten_alloc_async_context(28,sp)|0;
    $16 = (FUNCTION_TABLE_ii[$15 & 511]($0)|0);
    $IsAsync3 = ___async;
    if ($IsAsync3) {
     break;
    }
    _emscripten_free_async_context(($AsyncCtx2|0));
    $23 = ($16|0)==(-1);
    if ($23) {
     $$016$lcssa = $$01617;
     break L4;
    }
    $24 = $16&255;
    $25 = ((($$01617)) + 1|0);
    HEAP8[$$01617>>0] = $24;
    $26 = ($25|0)==($3|0);
    if ($26) {
     $$016$lcssa = $3;
     break L4;
    } else {
     $$01617 = $25;
    }
   }
   HEAP32[$AsyncCtx2>>2] = 174;
   $17 = ((($AsyncCtx2)) + 4|0);
   HEAP32[$17>>2] = $1;
   $18 = ((($AsyncCtx2)) + 8|0);
   HEAP32[$18>>2] = $$01617;
   $19 = ((($AsyncCtx2)) + 12|0);
   HEAP32[$19>>2] = $3;
   $20 = ((($AsyncCtx2)) + 16|0);
   HEAP32[$20>>2] = $0;
   $21 = ((($AsyncCtx2)) + 20|0);
   HEAP32[$21>>2] = $0;
   $22 = ((($AsyncCtx2)) + 24|0);
   HEAP32[$22>>2] = $0;
   sp = STACKTOP;
   return 0;
  }
 } while(0);
 $27 = HEAP32[$0>>2]|0;
 $28 = ((($27)) + 84|0);
 $29 = HEAP32[$28>>2]|0;
 $AsyncCtx5 = _emscripten_alloc_async_context(12,sp)|0;
 FUNCTION_TABLE_vi[$29 & 511]($0);
 $IsAsync6 = ___async;
 if ($IsAsync6) {
  HEAP32[$AsyncCtx5>>2] = 175;
  $30 = ((($AsyncCtx5)) + 4|0);
  HEAP32[$30>>2] = $$016$lcssa;
  $31 = ((($AsyncCtx5)) + 8|0);
  HEAP32[$31>>2] = $1;
  sp = STACKTOP;
  return 0;
 } else {
  _emscripten_free_async_context(($AsyncCtx5|0));
  $32 = $$016$lcssa;
  $33 = $1;
  $34 = (($32) - ($33))|0;
  return ($34|0);
 }
 return (0)|0;
}
function __ZN4mbed6Stream5writeEPKvj($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $$0 = 0, $$1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0;
 var $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, $AsyncCtx7 = 0, $IsAsync = 0, $IsAsync4 = 0, $IsAsync8 = 0, label = 0;
 var sp = 0;
 sp = STACKTOP;
 $3 = (($1) + ($2)|0);
 $4 = HEAP32[$0>>2]|0;
 $5 = ((($4)) + 80|0);
 $6 = HEAP32[$5>>2]|0;
 $AsyncCtx = _emscripten_alloc_async_context(20,sp)|0;
 FUNCTION_TABLE_vi[$6 & 511]($0);
 $IsAsync = ___async;
 if ($IsAsync) {
  HEAP32[$AsyncCtx>>2] = 176;
  $7 = ((($AsyncCtx)) + 4|0);
  HEAP32[$7>>2] = $0;
  $8 = ((($AsyncCtx)) + 8|0);
  HEAP32[$8>>2] = $1;
  $9 = ((($AsyncCtx)) + 12|0);
  HEAP32[$9>>2] = $3;
  $10 = ((($AsyncCtx)) + 16|0);
  HEAP32[$10>>2] = $0;
  sp = STACKTOP;
  return 0;
 }
 _emscripten_free_async_context(($AsyncCtx|0));
 $$0 = $1;
 while(1) {
  $11 = ($$0|0)==($3|0);
  if ($11) {
   $$1 = $3;
   break;
  }
  $12 = HEAP32[$0>>2]|0;
  $13 = ((($12)) + 68|0);
  $14 = HEAP32[$13>>2]|0;
  $15 = ((($$0)) + 1|0);
  $16 = HEAP8[$$0>>0]|0;
  $17 = $16 << 24 >> 24;
  $AsyncCtx3 = _emscripten_alloc_async_context(28,sp)|0;
  $18 = (FUNCTION_TABLE_iii[$14 & 255]($0,$17)|0);
  $IsAsync4 = ___async;
  if ($IsAsync4) {
   label = 6;
   break;
  }
  _emscripten_free_async_context(($AsyncCtx3|0));
  $25 = ($18|0)==(-1);
  if ($25) {
   $$1 = $15;
   break;
  } else {
   $$0 = $15;
  }
 }
 if ((label|0) == 6) {
  HEAP32[$AsyncCtx3>>2] = 177;
  $19 = ((($AsyncCtx3)) + 4|0);
  HEAP32[$19>>2] = $15;
  $20 = ((($AsyncCtx3)) + 8|0);
  HEAP32[$20>>2] = $3;
  $21 = ((($AsyncCtx3)) + 12|0);
  HEAP32[$21>>2] = $0;
  $22 = ((($AsyncCtx3)) + 16|0);
  HEAP32[$22>>2] = $0;
  $23 = ((($AsyncCtx3)) + 20|0);
  HEAP32[$23>>2] = $1;
  $24 = ((($AsyncCtx3)) + 24|0);
  HEAP32[$24>>2] = $0;
  sp = STACKTOP;
  return 0;
 }
 $26 = HEAP32[$0>>2]|0;
 $27 = ((($26)) + 84|0);
 $28 = HEAP32[$27>>2]|0;
 $AsyncCtx7 = _emscripten_alloc_async_context(12,sp)|0;
 FUNCTION_TABLE_vi[$28 & 511]($0);
 $IsAsync8 = ___async;
 if ($IsAsync8) {
  HEAP32[$AsyncCtx7>>2] = 178;
  $29 = ((($AsyncCtx7)) + 4|0);
  HEAP32[$29>>2] = $$1;
  $30 = ((($AsyncCtx7)) + 8|0);
  HEAP32[$30>>2] = $1;
  sp = STACKTOP;
  return 0;
 } else {
  _emscripten_free_async_context(($AsyncCtx7|0));
  $31 = $$1;
  $32 = $1;
  $33 = (($31) - ($32))|0;
  return ($33|0);
 }
 return (0)|0;
}
function __ZN4mbed6Stream4seekEii($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 return 0;
}
function __ZN4mbed6Stream5closeEv($0) {
 $0 = $0|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 return 0;
}
function __ZN4mbed6Stream4syncEv($0) {
 $0 = $0|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 return 0;
}
function __ZN4mbed6Stream6isattyEv($0) {
 $0 = $0|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 return 0;
}
function __ZN4mbed6Stream4tellEv($0) {
 $0 = $0|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 return 0;
}
function __ZN4mbed6Stream6rewindEv($0) {
 $0 = $0|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 return;
}
function __ZN4mbed6Stream4sizeEv($0) {
 $0 = $0|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 return 0;
}
function __ZThn4_N4mbed6StreamD1Ev($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $AsyncCtx = 0, $IsAsync = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = ((($0)) + -4|0);
 HEAP32[$1>>2] = (1016);
 $2 = ((($1)) + 4|0);
 HEAP32[$2>>2] = (1112);
 $3 = ((($1)) + 20|0);
 $4 = HEAP32[$3>>2]|0;
 $AsyncCtx = _emscripten_alloc_async_context(8,sp)|0;
 (_fclose($4)|0);
 $IsAsync = ___async;
 if ($IsAsync) {
  HEAP32[$AsyncCtx>>2] = 179;
  $5 = ((($AsyncCtx)) + 4|0);
  HEAP32[$5>>2] = $2;
  sp = STACKTOP;
  return;
 } else {
  _emscripten_free_async_context(($AsyncCtx|0));
  __ZN4mbed8FileBaseD2Ev($2);
  return;
 }
}
function __ZThn4_N4mbed6StreamD0Ev($0) {
 $0 = $0|0;
 var $1 = 0, $10 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $AsyncCtx = 0, $IsAsync = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = ((($0)) + -4|0);
 HEAP32[$1>>2] = (1016);
 $2 = ((($1)) + 4|0);
 HEAP32[$2>>2] = (1112);
 $3 = ((($1)) + 20|0);
 $4 = HEAP32[$3>>2]|0;
 $AsyncCtx = _emscripten_alloc_async_context(12,sp)|0;
 (_fclose($4)|0);
 $IsAsync = ___async;
 if ($IsAsync) {
  HEAP32[$AsyncCtx>>2] = 180;
  $5 = ((($AsyncCtx)) + 4|0);
  HEAP32[$5>>2] = $2;
  $6 = ((($AsyncCtx)) + 8|0);
  HEAP32[$6>>2] = $1;
  sp = STACKTOP;
  return;
 }
 _emscripten_free_async_context(($AsyncCtx|0));
 __THREW__ = 0;
 invoke_vi(64,($2|0));
 $7 = __THREW__; __THREW__ = 0;
 $8 = $7&1;
 if ($8) {
  $9 = ___cxa_find_matching_catch_2()|0;
  $10 = tempRet0;
  __ZdlPv($1);
  ___resumeException($9|0);
  // unreachable;
 } else {
  __ZdlPv($1);
  return;
 }
}
function __ZN4mbed6StreamC2EPKc($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $3 = 0, $4 = 0;
 var $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, $IsAsync4 = 0, $vararg_buffer = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $vararg_buffer = sp;
 HEAP32[$0>>2] = (940);
 $2 = ((($0)) + 4|0);
 __ZN4mbed8FileBaseC2EPKcNS_8PathTypeE($2,$1,0);
 HEAP32[$0>>2] = (1016);
 $3 = ((($0)) + 4|0);
 HEAP32[$3>>2] = (1112);
 $4 = ((($0)) + 20|0);
 HEAP32[$4>>2] = 0;
 __THREW__ = 0;
 $AsyncCtx3 = _emscripten_alloc_async_context(20,sp)|0;
 $5 = (invoke_iii(181,($0|0),(5426|0))|0);
 $IsAsync4 = ___async;
 if ($IsAsync4) {
  HEAP32[$AsyncCtx3>>2] = 182;
  $6 = ((($AsyncCtx3)) + 4|0);
  HEAP32[$6>>2] = $2;
  $7 = ((($AsyncCtx3)) + 8|0);
  HEAP32[$7>>2] = $4;
  $8 = ((($AsyncCtx3)) + 12|0);
  HEAP32[$8>>2] = $vararg_buffer;
  $9 = ((($AsyncCtx3)) + 16|0);
  HEAP32[$9>>2] = $vararg_buffer;
  sp = STACKTOP;
  STACKTOP = sp;return;
 }
 _emscripten_free_async_context(($AsyncCtx3|0));
 $10 = __THREW__; __THREW__ = 0;
 $11 = $10&1;
 do {
  if (!($11)) {
   HEAP32[$4>>2] = $5;
   $12 = ($5|0)==(0|0);
   if (!($12)) {
    __THREW__ = 0;
    invoke_vi(183,($5|0));
    $13 = __THREW__; __THREW__ = 0;
    $14 = $13&1;
    if ($14) {
     break;
    }
    STACKTOP = sp;return;
   }
   __THREW__ = 0;
   $19 = (invoke_i(184)|0);
   $20 = __THREW__; __THREW__ = 0;
   $21 = $20&1;
   if (!($21)) {
    $22 = HEAP32[$19>>2]|0;
    __THREW__ = 0;
    HEAP32[$vararg_buffer>>2] = $22;
    invoke_vii(185,(5429|0),($vararg_buffer|0));
    $23 = __THREW__; __THREW__ = 0;
    $24 = $23&1;
    if (!($24)) {
     STACKTOP = sp;return;
    }
   }
  }
 } while(0);
 $15 = ___cxa_find_matching_catch_2()|0;
 $16 = tempRet0;
 __THREW__ = 0;
 invoke_vi(64,($2|0));
 $17 = __THREW__; __THREW__ = 0;
 $18 = $17&1;
 if ($18) {
  $25 = ___cxa_find_matching_catch_3(0|0)|0;
  $26 = tempRet0;
  $AsyncCtx = _emscripten_alloc_async_context(4,sp)|0;
  ___clang_call_terminate($25);
  // unreachable;
 } else {
  ___resumeException($15|0);
  // unreachable;
 }
}
function __ZN4mbed6Stream4putcEi($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $AsyncCtx = 0, $AsyncCtx2 = 0, $AsyncCtx5 = 0, $IsAsync = 0;
 var $IsAsync3 = 0, $IsAsync6 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $2 = HEAP32[$0>>2]|0;
 $3 = ((($2)) + 80|0);
 $4 = HEAP32[$3>>2]|0;
 $AsyncCtx = _emscripten_alloc_async_context(16,sp)|0;
 FUNCTION_TABLE_vi[$4 & 511]($0);
 $IsAsync = ___async;
 if ($IsAsync) {
  HEAP32[$AsyncCtx>>2] = 186;
  $5 = ((($AsyncCtx)) + 4|0);
  HEAP32[$5>>2] = $0;
  $6 = ((($AsyncCtx)) + 8|0);
  HEAP32[$6>>2] = $1;
  $7 = ((($AsyncCtx)) + 12|0);
  HEAP32[$7>>2] = $0;
  sp = STACKTOP;
  return 0;
 }
 _emscripten_free_async_context(($AsyncCtx|0));
 $8 = HEAP32[$0>>2]|0;
 $9 = ((($8)) + 68|0);
 $10 = HEAP32[$9>>2]|0;
 $AsyncCtx2 = _emscripten_alloc_async_context(12,sp)|0;
 $11 = (FUNCTION_TABLE_iii[$10 & 255]($0,$1)|0);
 $IsAsync3 = ___async;
 if ($IsAsync3) {
  HEAP32[$AsyncCtx2>>2] = 187;
  $12 = ((($AsyncCtx2)) + 4|0);
  HEAP32[$12>>2] = $0;
  $13 = ((($AsyncCtx2)) + 8|0);
  HEAP32[$13>>2] = $0;
  sp = STACKTOP;
  return 0;
 }
 _emscripten_free_async_context(($AsyncCtx2|0));
 $14 = HEAP32[$0>>2]|0;
 $15 = ((($14)) + 84|0);
 $16 = HEAP32[$15>>2]|0;
 $AsyncCtx5 = _emscripten_alloc_async_context(8,sp)|0;
 FUNCTION_TABLE_vi[$16 & 511]($0);
 $IsAsync6 = ___async;
 if ($IsAsync6) {
  HEAP32[$AsyncCtx5>>2] = 188;
  $17 = ((($AsyncCtx5)) + 4|0);
  HEAP32[$17>>2] = $11;
  sp = STACKTOP;
  return 0;
 } else {
  _emscripten_free_async_context(($AsyncCtx5|0));
  return ($11|0);
 }
 return (0)|0;
}
function __ZN4mbed6Stream6printfEPKcz($0,$1,$varargs) {
 $0 = $0|0;
 $1 = $1|0;
 $varargs = $varargs|0;
 var $$09 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0;
 var $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0;
 var $46 = 0, $47 = 0, $48 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $AsyncCtx = 0, $AsyncCtx12 = 0, $AsyncCtx2 = 0, $AsyncCtx5 = 0, $AsyncCtx9 = 0, $IsAsync = 0, $IsAsync10 = 0, $IsAsync13 = 0, $IsAsync3 = 0, $IsAsync6 = 0, $exitcond = 0, label = 0;
 var sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 4112|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(4112|0);
 $2 = sp;
 $3 = sp + 16|0;
 $4 = HEAP32[$0>>2]|0;
 $5 = ((($4)) + 80|0);
 $6 = HEAP32[$5>>2]|0;
 $AsyncCtx = _emscripten_alloc_async_context(28,sp)|0;
 FUNCTION_TABLE_vi[$6 & 511]($0);
 $IsAsync = ___async;
 if ($IsAsync) {
  HEAP32[$AsyncCtx>>2] = 189;
  $7 = ((($AsyncCtx)) + 4|0);
  HEAP32[$7>>2] = $2;
  $8 = ((($AsyncCtx)) + 8|0);
  HEAP32[$8>>2] = $varargs;
  $9 = ((($AsyncCtx)) + 12|0);
  HEAP32[$9>>2] = $3;
  $10 = ((($AsyncCtx)) + 16|0);
  HEAP32[$10>>2] = $1;
  $11 = ((($AsyncCtx)) + 20|0);
  HEAP32[$11>>2] = $0;
  $12 = ((($AsyncCtx)) + 24|0);
  HEAP32[$12>>2] = $0;
  sp = STACKTOP;
  STACKTOP = sp;return 0;
 }
 _emscripten_free_async_context(($AsyncCtx|0));
 HEAP32[$2>>2] = $varargs;
 _memset(($3|0),0,4096)|0;
 $AsyncCtx12 = _emscripten_alloc_async_context(24,sp)|0;
 $13 = (_vsprintf($3,$1,$2)|0);
 $IsAsync13 = ___async;
 if ($IsAsync13) {
  HEAP32[$AsyncCtx12>>2] = 190;
  $14 = ((($AsyncCtx12)) + 4|0);
  HEAP32[$14>>2] = $0;
  $15 = ((($AsyncCtx12)) + 8|0);
  HEAP32[$15>>2] = $0;
  $16 = ((($AsyncCtx12)) + 12|0);
  HEAP32[$16>>2] = $3;
  $17 = ((($AsyncCtx12)) + 16|0);
  HEAP32[$17>>2] = $2;
  $18 = ((($AsyncCtx12)) + 20|0);
  HEAP32[$18>>2] = $3;
  sp = STACKTOP;
  STACKTOP = sp;return 0;
 }
 _emscripten_free_async_context(($AsyncCtx12|0));
 $19 = ($13|0)>(0);
 L7: do {
  if ($19) {
   $$09 = 0;
   while(1) {
    $34 = HEAP32[$0>>2]|0;
    $35 = ((($34)) + 68|0);
    $36 = HEAP32[$35>>2]|0;
    $37 = (($3) + ($$09)|0);
    $38 = HEAP8[$37>>0]|0;
    $39 = $38 << 24 >> 24;
    $AsyncCtx9 = _emscripten_alloc_async_context(36,sp)|0;
    (FUNCTION_TABLE_iii[$36 & 255]($0,$39)|0);
    $IsAsync10 = ___async;
    if ($IsAsync10) {
     break;
    }
    _emscripten_free_async_context(($AsyncCtx9|0));
    $48 = (($$09) + 1)|0;
    $exitcond = ($48|0)==($13|0);
    if ($exitcond) {
     break L7;
    } else {
     $$09 = $48;
    }
   }
   HEAP32[$AsyncCtx9>>2] = 193;
   $40 = ((($AsyncCtx9)) + 4|0);
   HEAP32[$40>>2] = $$09;
   $41 = ((($AsyncCtx9)) + 8|0);
   HEAP32[$41>>2] = $13;
   $42 = ((($AsyncCtx9)) + 12|0);
   HEAP32[$42>>2] = $0;
   $43 = ((($AsyncCtx9)) + 16|0);
   HEAP32[$43>>2] = $0;
   $44 = ((($AsyncCtx9)) + 20|0);
   HEAP32[$44>>2] = $0;
   $45 = ((($AsyncCtx9)) + 24|0);
   HEAP32[$45>>2] = $3;
   $46 = ((($AsyncCtx9)) + 28|0);
   HEAP32[$46>>2] = $3;
   $47 = ((($AsyncCtx9)) + 32|0);
   HEAP32[$47>>2] = $2;
   sp = STACKTOP;
   STACKTOP = sp;return 0;
  }
 } while(0);
 $20 = HEAP32[$0>>2]|0;
 $21 = ((($20)) + 76|0);
 $22 = HEAP32[$21>>2]|0;
 $AsyncCtx2 = _emscripten_alloc_async_context(24,sp)|0;
 FUNCTION_TABLE_vi[$22 & 511]($0);
 $IsAsync3 = ___async;
 if ($IsAsync3) {
  HEAP32[$AsyncCtx2>>2] = 191;
  $23 = ((($AsyncCtx2)) + 4|0);
  HEAP32[$23>>2] = $0;
  $24 = ((($AsyncCtx2)) + 8|0);
  HEAP32[$24>>2] = $0;
  $25 = ((($AsyncCtx2)) + 12|0);
  HEAP32[$25>>2] = $3;
  $26 = ((($AsyncCtx2)) + 16|0);
  HEAP32[$26>>2] = $2;
  $27 = ((($AsyncCtx2)) + 20|0);
  HEAP32[$27>>2] = $13;
  sp = STACKTOP;
  STACKTOP = sp;return 0;
 }
 _emscripten_free_async_context(($AsyncCtx2|0));
 $28 = HEAP32[$0>>2]|0;
 $29 = ((($28)) + 84|0);
 $30 = HEAP32[$29>>2]|0;
 $AsyncCtx5 = _emscripten_alloc_async_context(16,sp)|0;
 FUNCTION_TABLE_vi[$30 & 511]($0);
 $IsAsync6 = ___async;
 if ($IsAsync6) {
  HEAP32[$AsyncCtx5>>2] = 192;
  $31 = ((($AsyncCtx5)) + 4|0);
  HEAP32[$31>>2] = $3;
  $32 = ((($AsyncCtx5)) + 8|0);
  HEAP32[$32>>2] = $2;
  $33 = ((($AsyncCtx5)) + 12|0);
  HEAP32[$33>>2] = $13;
  sp = STACKTOP;
  STACKTOP = sp;return 0;
 } else {
  _emscripten_free_async_context(($AsyncCtx5|0));
  STACKTOP = sp;return ($13|0);
 }
 return (0)|0;
}
function _mbed_assert_internal($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $3 = 0, $vararg_buffer = 0, $vararg_ptr1 = 0, $vararg_ptr2 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $vararg_buffer = sp;
 HEAP32[$vararg_buffer>>2] = $0;
 $vararg_ptr1 = ((($vararg_buffer)) + 4|0);
 HEAP32[$vararg_ptr1>>2] = $1;
 $vararg_ptr2 = ((($vararg_buffer)) + 8|0);
 HEAP32[$vararg_ptr2>>2] = $2;
 (_printf(5460,$vararg_buffer)|0);
 $3 = _emscripten_asm_const_i(6)|0;
 STACKTOP = sp;return;
}
function _error($0,$varargs) {
 $0 = $0|0;
 $varargs = $varargs|0;
 var $1 = 0, $2 = 0, $3 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, $IsAsync4 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = sp;
 $2 = HEAP8[13764]|0;
 $3 = ($2<<24>>24)==(0);
 if (!($3)) {
  STACKTOP = sp;return;
 }
 HEAP8[13764] = 1;
 HEAP32[$1>>2] = $varargs;
 $AsyncCtx3 = _emscripten_alloc_async_context(4,sp)|0;
 _mbed_error_vfprintf($0,$1);
 $IsAsync4 = ___async;
 if ($IsAsync4) {
  HEAP32[$AsyncCtx3>>2] = 194;
  sp = STACKTOP;
  STACKTOP = sp;return;
 } else {
  _emscripten_free_async_context(($AsyncCtx3|0));
  $AsyncCtx = _emscripten_alloc_async_context(4,sp)|0;
  _exit(1);
  // unreachable;
 }
}
function _mbed_die() {
 var $AsyncCtx = 0, $IsAsync = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $AsyncCtx = _emscripten_alloc_async_context(4,sp)|0;
 (_puts(5537)|0);
 $IsAsync = ___async;
 if ($IsAsync) {
  HEAP32[$AsyncCtx>>2] = 195;
  sp = STACKTOP;
  return;
 } else {
  _emscripten_free_async_context(($AsyncCtx|0));
  return;
 }
}
function _mbed_error_vfprintf($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $AsyncCtx = 0, $IsAsync = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $AsyncCtx = _emscripten_alloc_async_context(4,sp)|0;
 (_puts(5562)|0);
 $IsAsync = ___async;
 if ($IsAsync) {
  HEAP32[$AsyncCtx>>2] = 196;
  sp = STACKTOP;
  return;
 } else {
  _emscripten_free_async_context(($AsyncCtx|0));
  return;
 }
}
function _exit($0) {
 $0 = $0|0;
 var $1 = 0, $AsyncCtx = 0, $IsAsync = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = ($0|0)==(0);
 do {
  if (!($1)) {
   $AsyncCtx = _emscripten_alloc_async_context(4,sp)|0;
   _mbed_die();
   $IsAsync = ___async;
   if ($IsAsync) {
    HEAP32[$AsyncCtx>>2] = 197;
    sp = STACKTOP;
    return;
   } else {
    _emscripten_free_async_context(($AsyncCtx|0));
    break;
   }
  }
 } while(0);
 while(1) {
 }
}
function __ZN4mbed26mbed_set_unbuffered_streamEP8_IO_FILE($0) {
 $0 = $0|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 _setbuf($0,0);
 return;
}
function __ZN4mbed11mbed_fdopenEPNS_10FileHandleEPKc($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $$0$$sroa_idx = 0, $10 = 0, $11 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $AsyncCtx = 0, $IsAsync = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $2 = sp;
 HEAP8[$2>>0] = 58;
 $$0$$sroa_idx = ((($2)) + 1|0);
 HEAP8[$$0$$sroa_idx>>0]=$0&255;HEAP8[$$0$$sroa_idx+1>>0]=($0>>8)&255;HEAP8[$$0$$sroa_idx+2>>0]=($0>>16)&255;HEAP8[$$0$$sroa_idx+3>>0]=$0>>24;
 $3 = (_fopen($2,$1)|0);
 $4 = ($3|0)==(0|0);
 if ($4) {
  STACKTOP = sp;return ($3|0);
 }
 $5 = HEAP32[$0>>2]|0;
 $6 = ((($5)) + 28|0);
 $7 = HEAP32[$6>>2]|0;
 $AsyncCtx = _emscripten_alloc_async_context(12,sp)|0;
 $8 = (FUNCTION_TABLE_ii[$7 & 511]($0)|0);
 $IsAsync = ___async;
 if ($IsAsync) {
  HEAP32[$AsyncCtx>>2] = 198;
  $9 = ((($AsyncCtx)) + 4|0);
  HEAP32[$9>>2] = $2;
  $10 = ((($AsyncCtx)) + 8|0);
  HEAP32[$10>>2] = $3;
  sp = STACKTOP;
  STACKTOP = sp;return (0|0);
 }
 _emscripten_free_async_context(($AsyncCtx|0));
 $11 = ($8|0)==(0);
 if ($11) {
  STACKTOP = sp;return ($3|0);
 }
 _setbuf($3,0);
 STACKTOP = sp;return ($3|0);
}
function _wait($0) {
 $0 = +$0;
 var $1 = 0.0, $2 = 0, $3 = 0, $AsyncCtx = 0, $IsAsync = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = $0 * 1.0E+6;
 $2 = (~~(($1)));
 $3 = (($2|0) / 1000)&-1;
 $AsyncCtx = _emscripten_alloc_async_context(4,sp)|0;
 _emscripten_sleep(($3|0));
 $IsAsync = ___async;
 if ($IsAsync) {
  HEAP32[$AsyncCtx>>2] = 199;
  sp = STACKTOP;
  return;
 } else {
  _emscripten_free_async_context(($AsyncCtx|0));
  return;
 }
}
function _gpio_init_out($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $2 = 0, $3 = 0, $4 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 HEAP32[$0>>2] = $1;
 $2 = ($1|0)==(-1);
 if ($2) {
  return;
 }
 $3 = ((($0)) + 4|0);
 HEAP32[$3>>2] = $1;
 $4 = _emscripten_asm_const_iii(7, ($0|0), ($1|0))|0;
 return;
}
function _handle_interrupt_in($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 // unreachable;
}
function __GLOBAL__sub_I_main_cpp() {
 var $AsyncCtx = 0, $IsAsync = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $AsyncCtx = _emscripten_alloc_async_context(4,sp)|0;
 ___cxx_global_var_init();
 $IsAsync = ___async;
 if ($IsAsync) {
  HEAP32[$AsyncCtx>>2] = 200;
  sp = STACKTOP;
  return;
 } else {
  _emscripten_free_async_context(($AsyncCtx|0));
  ___cxx_global_var_init_1();
  ___cxx_global_var_init_2();
  return;
 }
}
function ___cxx_global_var_init() {
 var $AsyncCtx = 0, $IsAsync = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $AsyncCtx = _emscripten_alloc_async_context(4,sp)|0;
 __ZN6C12832C2E7PinNameS0_S0_S0_S0_PKc(8972,9,7,8,6,18,5638); //@line 5 "demos/temperature/main.cpp"
 $IsAsync = ___async;
 if ($IsAsync) {
  HEAP32[$AsyncCtx>>2] = 201;
  sp = STACKTOP;
  return;
 } else {
  _emscripten_free_async_context(($AsyncCtx|0));
  return; //@line 5 "demos/temperature/main.cpp"
 }
}
function ___cxx_global_var_init_1() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 __ZN5Sht31C2E7PinNameS0_(13765,10,11); //@line 6 "demos/temperature/main.cpp"
 return; //@line 6 "demos/temperature/main.cpp"
}
function ___cxx_global_var_init_2() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 __ZN4mbed10DigitalOutC2E7PinName(13156,50); //@line 7 "demos/temperature/main.cpp"
 return; //@line 7 "demos/temperature/main.cpp"
}
function __ZN4mbed10DigitalOutC2E7PinName($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $2 = 0, $3 = 0, $4 = 0, $5 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $2 = $0;
 $3 = $1;
 $4 = $2;
 ;HEAP32[$4>>2]=0|0;HEAP32[$4+4>>2]=0|0;HEAP32[$4+8>>2]=0|0;HEAP32[$4+12>>2]=0|0;HEAP32[$4+16>>2]=0|0;HEAP32[$4+20>>2]=0|0; //@line 53 "/Users/janjon01/repos/mbed-simulator/mbed-simulator-hal/drivers/DigitalOut.h"
 $5 = $3; //@line 55 "/Users/janjon01/repos/mbed-simulator/mbed-simulator-hal/drivers/DigitalOut.h"
 _gpio_init_out($4,$5); //@line 55 "/Users/janjon01/repos/mbed-simulator/mbed-simulator-hal/drivers/DigitalOut.h"
 STACKTOP = sp;return; //@line 56 "/Users/janjon01/repos/mbed-simulator/mbed-simulator-hal/drivers/DigitalOut.h"
}
function _main() {
 var $0 = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $2 = 0, $3 = 0.0, $4 = 0.0, $5 = 0.0, $6 = 0.0, $7 = 0.0, $8 = 0.0, $9 = 0.0, $AsyncCtx = 0, $IsAsync = 0;
 var $vararg_buffer = 0, $vararg_buffer1 = 0, $vararg_buffer3 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 48|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(48|0);
 $vararg_buffer3 = sp + 16|0;
 $vararg_buffer1 = sp + 8|0;
 $vararg_buffer = sp;
 $1 = sp + 28|0;
 $2 = sp + 24|0;
 $0 = 0;
 (_printf(5642,$vararg_buffer)|0); //@line 10 "demos/temperature/main.cpp"
 while(1) {
  __ZN6C128323clsEv(8972); //@line 13 "demos/temperature/main.cpp"
  $3 = (+__ZN5Sht3115readTemperatureEv(13765)); //@line 15 "demos/temperature/main.cpp"
  HEAPF32[$1>>2] = $3; //@line 15 "demos/temperature/main.cpp"
  $4 = (+__ZN5Sht3112readHumidityEv(13765)); //@line 16 "demos/temperature/main.cpp"
  HEAPF32[$2>>2] = $4; //@line 16 "demos/temperature/main.cpp"
  __ZN6C128326locateEii(8972,3,3); //@line 18 "demos/temperature/main.cpp"
  $5 = +HEAPF32[$1>>2]; //@line 19 "demos/temperature/main.cpp"
  $6 = $5; //@line 19 "demos/temperature/main.cpp"
  HEAPF64[$vararg_buffer1>>3] = $6; //@line 19 "demos/temperature/main.cpp"
  (__ZN4mbed6Stream6printfEPKcz(8972,5707,$vararg_buffer1)|0); //@line 19 "demos/temperature/main.cpp"
  __ZN6C128326locateEii(8972,3,13); //@line 20 "demos/temperature/main.cpp"
  $7 = +HEAPF32[$2>>2]; //@line 21 "demos/temperature/main.cpp"
  $8 = $7; //@line 21 "demos/temperature/main.cpp"
  HEAPF64[$vararg_buffer3>>3] = $8; //@line 21 "demos/temperature/main.cpp"
  (__ZN4mbed6Stream6printfEPKcz(8972,5727,$vararg_buffer3)|0); //@line 21 "demos/temperature/main.cpp"
  $9 = +HEAPF32[$1>>2]; //@line 24 "demos/temperature/main.cpp"
  $10 = $9 > 25.0; //@line 24 "demos/temperature/main.cpp"
  $11 = $10&1; //@line 24 "demos/temperature/main.cpp"
  (__ZN4mbed10DigitalOutaSEi(13156,$11)|0); //@line 24 "demos/temperature/main.cpp"
  $AsyncCtx = _emscripten_alloc_async_context(28,sp)|0;
  _wait(1.0); //@line 26 "demos/temperature/main.cpp"
  $IsAsync = ___async;
  if ($IsAsync) {
   break;
  }
  _emscripten_free_async_context(($AsyncCtx|0));
 }
 HEAP32[$AsyncCtx>>2] = 202;
 $12 = ((($AsyncCtx)) + 4|0);
 HEAP32[$12>>2] = $1;
 $13 = ((($AsyncCtx)) + 8|0);
 HEAP32[$13>>2] = $2;
 $14 = ((($AsyncCtx)) + 12|0);
 HEAP32[$14>>2] = $vararg_buffer1;
 $15 = ((($AsyncCtx)) + 16|0);
 HEAP32[$15>>2] = $vararg_buffer1;
 $16 = ((($AsyncCtx)) + 20|0);
 HEAP32[$16>>2] = $vararg_buffer3;
 $17 = ((($AsyncCtx)) + 24|0);
 HEAP32[$17>>2] = $vararg_buffer3;
 sp = STACKTOP;
 STACKTOP = sp;return 0;
}
function __ZN4mbed10DigitalOutaSEi($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $2 = 0, $3 = 0, $4 = 0, $5 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $2 = $0;
 $3 = $1;
 $4 = $2;
 $5 = $3; //@line 105 "/Users/janjon01/repos/mbed-simulator/mbed-simulator-hal/drivers/DigitalOut.h"
 __ZN4mbed10DigitalOut5writeEi($4,$5); //@line 105 "/Users/janjon01/repos/mbed-simulator/mbed-simulator-hal/drivers/DigitalOut.h"
 STACKTOP = sp;return ($4|0); //@line 106 "/Users/janjon01/repos/mbed-simulator/mbed-simulator-hal/drivers/DigitalOut.h"
}
function __ZN4mbed10DigitalOut5writeEi($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $2 = 0, $3 = 0, $4 = 0, $5 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $2 = $0;
 $3 = $1;
 $4 = $2;
 $5 = $3; //@line 75 "/Users/janjon01/repos/mbed-simulator/mbed-simulator-hal/drivers/DigitalOut.h"
 __ZL10gpio_writeP6gpio_ti($4,$5); //@line 75 "/Users/janjon01/repos/mbed-simulator/mbed-simulator-hal/drivers/DigitalOut.h"
 STACKTOP = sp;return; //@line 76 "/Users/janjon01/repos/mbed-simulator/mbed-simulator-hal/drivers/DigitalOut.h"
}
function __ZL10gpio_writeP6gpio_ti($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $2 = $0;
 $3 = $1;
 $4 = $2; //@line 51 "/Users/janjon01/repos/mbed-simulator/mbed-simulator-hal/targets/TARGET_SIMULATOR/gpio_object.h"
 $5 = HEAP32[$4>>2]|0; //@line 51 "/Users/janjon01/repos/mbed-simulator/mbed-simulator-hal/targets/TARGET_SIMULATOR/gpio_object.h"
 $6 = $3; //@line 51 "/Users/janjon01/repos/mbed-simulator/mbed-simulator-hal/targets/TARGET_SIMULATOR/gpio_object.h"
 $7 = _emscripten_asm_const_iii(8, ($5|0), ($6|0))|0; //@line 51 "/Users/janjon01/repos/mbed-simulator/mbed-simulator-hal/targets/TARGET_SIMULATOR/gpio_object.h"
 STACKTOP = sp;return; //@line 54 "/Users/janjon01/repos/mbed-simulator/mbed-simulator-hal/targets/TARGET_SIMULATOR/gpio_object.h"
}
function _malloc($0) {
 $0 = $0|0;
 var $$$0192$i = 0, $$$0193$i = 0, $$$4236$i = 0, $$$4351$i = 0, $$$i = 0, $$0 = 0, $$0$i$i = 0, $$0$i$i$i = 0, $$0$i18$i = 0, $$01$i$i = 0, $$0189$i = 0, $$0192$lcssa$i = 0, $$01928$i = 0, $$0193$lcssa$i = 0, $$01937$i = 0, $$0197 = 0, $$0199 = 0, $$0206$i$i = 0, $$0207$i$i = 0, $$0211$i$i = 0;
 var $$0212$i$i = 0, $$024371$i = 0, $$0287$i$i = 0, $$0288$i$i = 0, $$0289$i$i = 0, $$0295$i$i = 0, $$0296$i$i = 0, $$0342$i = 0, $$0344$i = 0, $$0345$i = 0, $$0347$i = 0, $$0353$i = 0, $$0358$i = 0, $$0359$$i = 0, $$0359$i = 0, $$0361$i = 0, $$0362$i = 0, $$0368$i = 0, $$1196$i = 0, $$1198$i = 0;
 var $$124470$i = 0, $$1291$i$i = 0, $$1293$i$i = 0, $$1343$i = 0, $$1348$i = 0, $$1363$i = 0, $$1370$i = 0, $$1374$i = 0, $$2234253237$i = 0, $$2247$ph$i = 0, $$2253$ph$i = 0, $$2355$i = 0, $$3$i = 0, $$3$i$i = 0, $$3$i201 = 0, $$3350$i = 0, $$3372$i = 0, $$4$lcssa$i = 0, $$4$ph$i = 0, $$415$i = 0;
 var $$4236$i = 0, $$4351$lcssa$i = 0, $$435114$i = 0, $$4357$$4$i = 0, $$4357$ph$i = 0, $$435713$i = 0, $$723948$i = 0, $$749$i = 0, $$pre = 0, $$pre$i = 0, $$pre$i$i = 0, $$pre$i19$i = 0, $$pre$i210 = 0, $$pre$i212 = 0, $$pre$phi$i$iZ2D = 0, $$pre$phi$i20$iZ2D = 0, $$pre$phi$i211Z2D = 0, $$pre$phi$iZ2D = 0, $$pre$phi11$i$iZ2D = 0, $$pre$phiZ2D = 0;
 var $$pre10$i$i = 0, $$sink1$i = 0, $$sink1$i$i = 0, $$sink16$i = 0, $$sink2$i = 0, $$sink2$i204 = 0, $$sink3$i = 0, $1 = 0, $10 = 0, $100 = 0, $1000 = 0, $1001 = 0, $1002 = 0, $1003 = 0, $1004 = 0, $1005 = 0, $1006 = 0, $1007 = 0, $1008 = 0, $1009 = 0;
 var $101 = 0, $1010 = 0, $1011 = 0, $1012 = 0, $1013 = 0, $1014 = 0, $1015 = 0, $1016 = 0, $1017 = 0, $1018 = 0, $1019 = 0, $102 = 0, $1020 = 0, $1021 = 0, $1022 = 0, $1023 = 0, $1024 = 0, $1025 = 0, $1026 = 0, $1027 = 0;
 var $1028 = 0, $1029 = 0, $103 = 0, $1030 = 0, $1031 = 0, $1032 = 0, $1033 = 0, $1034 = 0, $1035 = 0, $1036 = 0, $1037 = 0, $1038 = 0, $1039 = 0, $104 = 0, $1040 = 0, $1041 = 0, $1042 = 0, $1043 = 0, $1044 = 0, $1045 = 0;
 var $1046 = 0, $1047 = 0, $1048 = 0, $1049 = 0, $105 = 0, $1050 = 0, $1051 = 0, $1052 = 0, $1053 = 0, $1054 = 0, $1055 = 0, $1056 = 0, $1057 = 0, $1058 = 0, $106 = 0, $107 = 0, $108 = 0, $109 = 0, $11 = 0, $110 = 0;
 var $111 = 0, $112 = 0, $113 = 0, $114 = 0, $115 = 0, $116 = 0, $117 = 0, $118 = 0, $119 = 0, $12 = 0, $120 = 0, $121 = 0, $122 = 0, $123 = 0, $124 = 0, $125 = 0, $126 = 0, $127 = 0, $128 = 0, $129 = 0;
 var $13 = 0, $130 = 0, $131 = 0, $132 = 0, $133 = 0, $134 = 0, $135 = 0, $136 = 0, $137 = 0, $138 = 0, $139 = 0, $14 = 0, $140 = 0, $141 = 0, $142 = 0, $143 = 0, $144 = 0, $145 = 0, $146 = 0, $147 = 0;
 var $148 = 0, $149 = 0, $15 = 0, $150 = 0, $151 = 0, $152 = 0, $153 = 0, $154 = 0, $155 = 0, $156 = 0, $157 = 0, $158 = 0, $159 = 0, $16 = 0, $160 = 0, $161 = 0, $162 = 0, $163 = 0, $164 = 0, $165 = 0;
 var $166 = 0, $167 = 0, $168 = 0, $169 = 0, $17 = 0, $170 = 0, $171 = 0, $172 = 0, $173 = 0, $174 = 0, $175 = 0, $176 = 0, $177 = 0, $178 = 0, $179 = 0, $18 = 0, $180 = 0, $181 = 0, $182 = 0, $183 = 0;
 var $184 = 0, $185 = 0, $186 = 0, $187 = 0, $188 = 0, $189 = 0, $19 = 0, $190 = 0, $191 = 0, $192 = 0, $193 = 0, $194 = 0, $195 = 0, $196 = 0, $197 = 0, $198 = 0, $199 = 0, $2 = 0, $20 = 0, $200 = 0;
 var $201 = 0, $202 = 0, $203 = 0, $204 = 0, $205 = 0, $206 = 0, $207 = 0, $208 = 0, $209 = 0, $21 = 0, $210 = 0, $211 = 0, $212 = 0, $213 = 0, $214 = 0, $215 = 0, $216 = 0, $217 = 0, $218 = 0, $219 = 0;
 var $22 = 0, $220 = 0, $221 = 0, $222 = 0, $223 = 0, $224 = 0, $225 = 0, $226 = 0, $227 = 0, $228 = 0, $229 = 0, $23 = 0, $230 = 0, $231 = 0, $232 = 0, $233 = 0, $234 = 0, $235 = 0, $236 = 0, $237 = 0;
 var $238 = 0, $239 = 0, $24 = 0, $240 = 0, $241 = 0, $242 = 0, $243 = 0, $244 = 0, $245 = 0, $246 = 0, $247 = 0, $248 = 0, $249 = 0, $25 = 0, $250 = 0, $251 = 0, $252 = 0, $253 = 0, $254 = 0, $255 = 0;
 var $256 = 0, $257 = 0, $258 = 0, $259 = 0, $26 = 0, $260 = 0, $261 = 0, $262 = 0, $263 = 0, $264 = 0, $265 = 0, $266 = 0, $267 = 0, $268 = 0, $269 = 0, $27 = 0, $270 = 0, $271 = 0, $272 = 0, $273 = 0;
 var $274 = 0, $275 = 0, $276 = 0, $277 = 0, $278 = 0, $279 = 0, $28 = 0, $280 = 0, $281 = 0, $282 = 0, $283 = 0, $284 = 0, $285 = 0, $286 = 0, $287 = 0, $288 = 0, $289 = 0, $29 = 0, $290 = 0, $291 = 0;
 var $292 = 0, $293 = 0, $294 = 0, $295 = 0, $296 = 0, $297 = 0, $298 = 0, $299 = 0, $3 = 0, $30 = 0, $300 = 0, $301 = 0, $302 = 0, $303 = 0, $304 = 0, $305 = 0, $306 = 0, $307 = 0, $308 = 0, $309 = 0;
 var $31 = 0, $310 = 0, $311 = 0, $312 = 0, $313 = 0, $314 = 0, $315 = 0, $316 = 0, $317 = 0, $318 = 0, $319 = 0, $32 = 0, $320 = 0, $321 = 0, $322 = 0, $323 = 0, $324 = 0, $325 = 0, $326 = 0, $327 = 0;
 var $328 = 0, $329 = 0, $33 = 0, $330 = 0, $331 = 0, $332 = 0, $333 = 0, $334 = 0, $335 = 0, $336 = 0, $337 = 0, $338 = 0, $339 = 0, $34 = 0, $340 = 0, $341 = 0, $342 = 0, $343 = 0, $344 = 0, $345 = 0;
 var $346 = 0, $347 = 0, $348 = 0, $349 = 0, $35 = 0, $350 = 0, $351 = 0, $352 = 0, $353 = 0, $354 = 0, $355 = 0, $356 = 0, $357 = 0, $358 = 0, $359 = 0, $36 = 0, $360 = 0, $361 = 0, $362 = 0, $363 = 0;
 var $364 = 0, $365 = 0, $366 = 0, $367 = 0, $368 = 0, $369 = 0, $37 = 0, $370 = 0, $371 = 0, $372 = 0, $373 = 0, $374 = 0, $375 = 0, $376 = 0, $377 = 0, $378 = 0, $379 = 0, $38 = 0, $380 = 0, $381 = 0;
 var $382 = 0, $383 = 0, $384 = 0, $385 = 0, $386 = 0, $387 = 0, $388 = 0, $389 = 0, $39 = 0, $390 = 0, $391 = 0, $392 = 0, $393 = 0, $394 = 0, $395 = 0, $396 = 0, $397 = 0, $398 = 0, $399 = 0, $4 = 0;
 var $40 = 0, $400 = 0, $401 = 0, $402 = 0, $403 = 0, $404 = 0, $405 = 0, $406 = 0, $407 = 0, $408 = 0, $409 = 0, $41 = 0, $410 = 0, $411 = 0, $412 = 0, $413 = 0, $414 = 0, $415 = 0, $416 = 0, $417 = 0;
 var $418 = 0, $419 = 0, $42 = 0, $420 = 0, $421 = 0, $422 = 0, $423 = 0, $424 = 0, $425 = 0, $426 = 0, $427 = 0, $428 = 0, $429 = 0, $43 = 0, $430 = 0, $431 = 0, $432 = 0, $433 = 0, $434 = 0, $435 = 0;
 var $436 = 0, $437 = 0, $438 = 0, $439 = 0, $44 = 0, $440 = 0, $441 = 0, $442 = 0, $443 = 0, $444 = 0, $445 = 0, $446 = 0, $447 = 0, $448 = 0, $449 = 0, $45 = 0, $450 = 0, $451 = 0, $452 = 0, $453 = 0;
 var $454 = 0, $455 = 0, $456 = 0, $457 = 0, $458 = 0, $459 = 0, $46 = 0, $460 = 0, $461 = 0, $462 = 0, $463 = 0, $464 = 0, $465 = 0, $466 = 0, $467 = 0, $468 = 0, $469 = 0, $47 = 0, $470 = 0, $471 = 0;
 var $472 = 0, $473 = 0, $474 = 0, $475 = 0, $476 = 0, $477 = 0, $478 = 0, $479 = 0, $48 = 0, $480 = 0, $481 = 0, $482 = 0, $483 = 0, $484 = 0, $485 = 0, $486 = 0, $487 = 0, $488 = 0, $489 = 0, $49 = 0;
 var $490 = 0, $491 = 0, $492 = 0, $493 = 0, $494 = 0, $495 = 0, $496 = 0, $497 = 0, $498 = 0, $499 = 0, $5 = 0, $50 = 0, $500 = 0, $501 = 0, $502 = 0, $503 = 0, $504 = 0, $505 = 0, $506 = 0, $507 = 0;
 var $508 = 0, $509 = 0, $51 = 0, $510 = 0, $511 = 0, $512 = 0, $513 = 0, $514 = 0, $515 = 0, $516 = 0, $517 = 0, $518 = 0, $519 = 0, $52 = 0, $520 = 0, $521 = 0, $522 = 0, $523 = 0, $524 = 0, $525 = 0;
 var $526 = 0, $527 = 0, $528 = 0, $529 = 0, $53 = 0, $530 = 0, $531 = 0, $532 = 0, $533 = 0, $534 = 0, $535 = 0, $536 = 0, $537 = 0, $538 = 0, $539 = 0, $54 = 0, $540 = 0, $541 = 0, $542 = 0, $543 = 0;
 var $544 = 0, $545 = 0, $546 = 0, $547 = 0, $548 = 0, $549 = 0, $55 = 0, $550 = 0, $551 = 0, $552 = 0, $553 = 0, $554 = 0, $555 = 0, $556 = 0, $557 = 0, $558 = 0, $559 = 0, $56 = 0, $560 = 0, $561 = 0;
 var $562 = 0, $563 = 0, $564 = 0, $565 = 0, $566 = 0, $567 = 0, $568 = 0, $569 = 0, $57 = 0, $570 = 0, $571 = 0, $572 = 0, $573 = 0, $574 = 0, $575 = 0, $576 = 0, $577 = 0, $578 = 0, $579 = 0, $58 = 0;
 var $580 = 0, $581 = 0, $582 = 0, $583 = 0, $584 = 0, $585 = 0, $586 = 0, $587 = 0, $588 = 0, $589 = 0, $59 = 0, $590 = 0, $591 = 0, $592 = 0, $593 = 0, $594 = 0, $595 = 0, $596 = 0, $597 = 0, $598 = 0;
 var $599 = 0, $6 = 0, $60 = 0, $600 = 0, $601 = 0, $602 = 0, $603 = 0, $604 = 0, $605 = 0, $606 = 0, $607 = 0, $608 = 0, $609 = 0, $61 = 0, $610 = 0, $611 = 0, $612 = 0, $613 = 0, $614 = 0, $615 = 0;
 var $616 = 0, $617 = 0, $618 = 0, $619 = 0, $62 = 0, $620 = 0, $621 = 0, $622 = 0, $623 = 0, $624 = 0, $625 = 0, $626 = 0, $627 = 0, $628 = 0, $629 = 0, $63 = 0, $630 = 0, $631 = 0, $632 = 0, $633 = 0;
 var $634 = 0, $635 = 0, $636 = 0, $637 = 0, $638 = 0, $639 = 0, $64 = 0, $640 = 0, $641 = 0, $642 = 0, $643 = 0, $644 = 0, $645 = 0, $646 = 0, $647 = 0, $648 = 0, $649 = 0, $65 = 0, $650 = 0, $651 = 0;
 var $652 = 0, $653 = 0, $654 = 0, $655 = 0, $656 = 0, $657 = 0, $658 = 0, $659 = 0, $66 = 0, $660 = 0, $661 = 0, $662 = 0, $663 = 0, $664 = 0, $665 = 0, $666 = 0, $667 = 0, $668 = 0, $669 = 0, $67 = 0;
 var $670 = 0, $671 = 0, $672 = 0, $673 = 0, $674 = 0, $675 = 0, $676 = 0, $677 = 0, $678 = 0, $679 = 0, $68 = 0, $680 = 0, $681 = 0, $682 = 0, $683 = 0, $684 = 0, $685 = 0, $686 = 0, $687 = 0, $688 = 0;
 var $689 = 0, $69 = 0, $690 = 0, $691 = 0, $692 = 0, $693 = 0, $694 = 0, $695 = 0, $696 = 0, $697 = 0, $698 = 0, $699 = 0, $7 = 0, $70 = 0, $700 = 0, $701 = 0, $702 = 0, $703 = 0, $704 = 0, $705 = 0;
 var $706 = 0, $707 = 0, $708 = 0, $709 = 0, $71 = 0, $710 = 0, $711 = 0, $712 = 0, $713 = 0, $714 = 0, $715 = 0, $716 = 0, $717 = 0, $718 = 0, $719 = 0, $72 = 0, $720 = 0, $721 = 0, $722 = 0, $723 = 0;
 var $724 = 0, $725 = 0, $726 = 0, $727 = 0, $728 = 0, $729 = 0, $73 = 0, $730 = 0, $731 = 0, $732 = 0, $733 = 0, $734 = 0, $735 = 0, $736 = 0, $737 = 0, $738 = 0, $739 = 0, $74 = 0, $740 = 0, $741 = 0;
 var $742 = 0, $743 = 0, $744 = 0, $745 = 0, $746 = 0, $747 = 0, $748 = 0, $749 = 0, $75 = 0, $750 = 0, $751 = 0, $752 = 0, $753 = 0, $754 = 0, $755 = 0, $756 = 0, $757 = 0, $758 = 0, $759 = 0, $76 = 0;
 var $760 = 0, $761 = 0, $762 = 0, $763 = 0, $764 = 0, $765 = 0, $766 = 0, $767 = 0, $768 = 0, $769 = 0, $77 = 0, $770 = 0, $771 = 0, $772 = 0, $773 = 0, $774 = 0, $775 = 0, $776 = 0, $777 = 0, $778 = 0;
 var $779 = 0, $78 = 0, $780 = 0, $781 = 0, $782 = 0, $783 = 0, $784 = 0, $785 = 0, $786 = 0, $787 = 0, $788 = 0, $789 = 0, $79 = 0, $790 = 0, $791 = 0, $792 = 0, $793 = 0, $794 = 0, $795 = 0, $796 = 0;
 var $797 = 0, $798 = 0, $799 = 0, $8 = 0, $80 = 0, $800 = 0, $801 = 0, $802 = 0, $803 = 0, $804 = 0, $805 = 0, $806 = 0, $807 = 0, $808 = 0, $809 = 0, $81 = 0, $810 = 0, $811 = 0, $812 = 0, $813 = 0;
 var $814 = 0, $815 = 0, $816 = 0, $817 = 0, $818 = 0, $819 = 0, $82 = 0, $820 = 0, $821 = 0, $822 = 0, $823 = 0, $824 = 0, $825 = 0, $826 = 0, $827 = 0, $828 = 0, $829 = 0, $83 = 0, $830 = 0, $831 = 0;
 var $832 = 0, $833 = 0, $834 = 0, $835 = 0, $836 = 0, $837 = 0, $838 = 0, $839 = 0, $84 = 0, $840 = 0, $841 = 0, $842 = 0, $843 = 0, $844 = 0, $845 = 0, $846 = 0, $847 = 0, $848 = 0, $849 = 0, $85 = 0;
 var $850 = 0, $851 = 0, $852 = 0, $853 = 0, $854 = 0, $855 = 0, $856 = 0, $857 = 0, $858 = 0, $859 = 0, $86 = 0, $860 = 0, $861 = 0, $862 = 0, $863 = 0, $864 = 0, $865 = 0, $866 = 0, $867 = 0, $868 = 0;
 var $869 = 0, $87 = 0, $870 = 0, $871 = 0, $872 = 0, $873 = 0, $874 = 0, $875 = 0, $876 = 0, $877 = 0, $878 = 0, $879 = 0, $88 = 0, $880 = 0, $881 = 0, $882 = 0, $883 = 0, $884 = 0, $885 = 0, $886 = 0;
 var $887 = 0, $888 = 0, $889 = 0, $89 = 0, $890 = 0, $891 = 0, $892 = 0, $893 = 0, $894 = 0, $895 = 0, $896 = 0, $897 = 0, $898 = 0, $899 = 0, $9 = 0, $90 = 0, $900 = 0, $901 = 0, $902 = 0, $903 = 0;
 var $904 = 0, $905 = 0, $906 = 0, $907 = 0, $908 = 0, $909 = 0, $91 = 0, $910 = 0, $911 = 0, $912 = 0, $913 = 0, $914 = 0, $915 = 0, $916 = 0, $917 = 0, $918 = 0, $919 = 0, $92 = 0, $920 = 0, $921 = 0;
 var $922 = 0, $923 = 0, $924 = 0, $925 = 0, $926 = 0, $927 = 0, $928 = 0, $929 = 0, $93 = 0, $930 = 0, $931 = 0, $932 = 0, $933 = 0, $934 = 0, $935 = 0, $936 = 0, $937 = 0, $938 = 0, $939 = 0, $94 = 0;
 var $940 = 0, $941 = 0, $942 = 0, $943 = 0, $944 = 0, $945 = 0, $946 = 0, $947 = 0, $948 = 0, $949 = 0, $95 = 0, $950 = 0, $951 = 0, $952 = 0, $953 = 0, $954 = 0, $955 = 0, $956 = 0, $957 = 0, $958 = 0;
 var $959 = 0, $96 = 0, $960 = 0, $961 = 0, $962 = 0, $963 = 0, $964 = 0, $965 = 0, $966 = 0, $967 = 0, $968 = 0, $969 = 0, $97 = 0, $970 = 0, $971 = 0, $972 = 0, $973 = 0, $974 = 0, $975 = 0, $976 = 0;
 var $977 = 0, $978 = 0, $979 = 0, $98 = 0, $980 = 0, $981 = 0, $982 = 0, $983 = 0, $984 = 0, $985 = 0, $986 = 0, $987 = 0, $988 = 0, $989 = 0, $99 = 0, $990 = 0, $991 = 0, $992 = 0, $993 = 0, $994 = 0;
 var $995 = 0, $996 = 0, $997 = 0, $998 = 0, $999 = 0, $cond$i = 0, $cond$i$i = 0, $cond$i208 = 0, $exitcond$i$i = 0, $not$$i = 0, $not$$i$i = 0, $not$$i17$i = 0, $not$$i209 = 0, $not$$i216 = 0, $not$1$i = 0, $not$1$i203 = 0, $not$5$i = 0, $not$7$i$i = 0, $not$8$i = 0, $not$9$i = 0;
 var $or$cond$i = 0, $or$cond$i214 = 0, $or$cond1$i = 0, $or$cond10$i = 0, $or$cond11$i = 0, $or$cond11$not$i = 0, $or$cond12$i = 0, $or$cond2$i = 0, $or$cond2$i215 = 0, $or$cond5$i = 0, $or$cond50$i = 0, $or$cond51$i = 0, $or$cond7$i = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = sp;
 $2 = ($0>>>0)<(245);
 do {
  if ($2) {
   $3 = ($0>>>0)<(11);
   $4 = (($0) + 11)|0;
   $5 = $4 & -8;
   $6 = $3 ? 16 : $5;
   $7 = $6 >>> 3;
   $8 = HEAP32[3295]|0;
   $9 = $8 >>> $7;
   $10 = $9 & 3;
   $11 = ($10|0)==(0);
   if (!($11)) {
    $12 = $9 & 1;
    $13 = $12 ^ 1;
    $14 = (($13) + ($7))|0;
    $15 = $14 << 1;
    $16 = (13220 + ($15<<2)|0);
    $17 = ((($16)) + 8|0);
    $18 = HEAP32[$17>>2]|0;
    $19 = ((($18)) + 8|0);
    $20 = HEAP32[$19>>2]|0;
    $21 = ($16|0)==($20|0);
    do {
     if ($21) {
      $22 = 1 << $14;
      $23 = $22 ^ -1;
      $24 = $8 & $23;
      HEAP32[3295] = $24;
     } else {
      $25 = HEAP32[(13196)>>2]|0;
      $26 = ($20>>>0)<($25>>>0);
      if ($26) {
       _abort();
       // unreachable;
      }
      $27 = ((($20)) + 12|0);
      $28 = HEAP32[$27>>2]|0;
      $29 = ($28|0)==($18|0);
      if ($29) {
       HEAP32[$27>>2] = $16;
       HEAP32[$17>>2] = $20;
       break;
      } else {
       _abort();
       // unreachable;
      }
     }
    } while(0);
    $30 = $14 << 3;
    $31 = $30 | 3;
    $32 = ((($18)) + 4|0);
    HEAP32[$32>>2] = $31;
    $33 = (($18) + ($30)|0);
    $34 = ((($33)) + 4|0);
    $35 = HEAP32[$34>>2]|0;
    $36 = $35 | 1;
    HEAP32[$34>>2] = $36;
    $$0 = $19;
    STACKTOP = sp;return ($$0|0);
   }
   $37 = HEAP32[(13188)>>2]|0;
   $38 = ($6>>>0)>($37>>>0);
   if ($38) {
    $39 = ($9|0)==(0);
    if (!($39)) {
     $40 = $9 << $7;
     $41 = 2 << $7;
     $42 = (0 - ($41))|0;
     $43 = $41 | $42;
     $44 = $40 & $43;
     $45 = (0 - ($44))|0;
     $46 = $44 & $45;
     $47 = (($46) + -1)|0;
     $48 = $47 >>> 12;
     $49 = $48 & 16;
     $50 = $47 >>> $49;
     $51 = $50 >>> 5;
     $52 = $51 & 8;
     $53 = $52 | $49;
     $54 = $50 >>> $52;
     $55 = $54 >>> 2;
     $56 = $55 & 4;
     $57 = $53 | $56;
     $58 = $54 >>> $56;
     $59 = $58 >>> 1;
     $60 = $59 & 2;
     $61 = $57 | $60;
     $62 = $58 >>> $60;
     $63 = $62 >>> 1;
     $64 = $63 & 1;
     $65 = $61 | $64;
     $66 = $62 >>> $64;
     $67 = (($65) + ($66))|0;
     $68 = $67 << 1;
     $69 = (13220 + ($68<<2)|0);
     $70 = ((($69)) + 8|0);
     $71 = HEAP32[$70>>2]|0;
     $72 = ((($71)) + 8|0);
     $73 = HEAP32[$72>>2]|0;
     $74 = ($69|0)==($73|0);
     do {
      if ($74) {
       $75 = 1 << $67;
       $76 = $75 ^ -1;
       $77 = $8 & $76;
       HEAP32[3295] = $77;
       $98 = $77;
      } else {
       $78 = HEAP32[(13196)>>2]|0;
       $79 = ($73>>>0)<($78>>>0);
       if ($79) {
        _abort();
        // unreachable;
       }
       $80 = ((($73)) + 12|0);
       $81 = HEAP32[$80>>2]|0;
       $82 = ($81|0)==($71|0);
       if ($82) {
        HEAP32[$80>>2] = $69;
        HEAP32[$70>>2] = $73;
        $98 = $8;
        break;
       } else {
        _abort();
        // unreachable;
       }
      }
     } while(0);
     $83 = $67 << 3;
     $84 = (($83) - ($6))|0;
     $85 = $6 | 3;
     $86 = ((($71)) + 4|0);
     HEAP32[$86>>2] = $85;
     $87 = (($71) + ($6)|0);
     $88 = $84 | 1;
     $89 = ((($87)) + 4|0);
     HEAP32[$89>>2] = $88;
     $90 = (($87) + ($84)|0);
     HEAP32[$90>>2] = $84;
     $91 = ($37|0)==(0);
     if (!($91)) {
      $92 = HEAP32[(13200)>>2]|0;
      $93 = $37 >>> 3;
      $94 = $93 << 1;
      $95 = (13220 + ($94<<2)|0);
      $96 = 1 << $93;
      $97 = $98 & $96;
      $99 = ($97|0)==(0);
      if ($99) {
       $100 = $98 | $96;
       HEAP32[3295] = $100;
       $$pre = ((($95)) + 8|0);
       $$0199 = $95;$$pre$phiZ2D = $$pre;
      } else {
       $101 = ((($95)) + 8|0);
       $102 = HEAP32[$101>>2]|0;
       $103 = HEAP32[(13196)>>2]|0;
       $104 = ($102>>>0)<($103>>>0);
       if ($104) {
        _abort();
        // unreachable;
       } else {
        $$0199 = $102;$$pre$phiZ2D = $101;
       }
      }
      HEAP32[$$pre$phiZ2D>>2] = $92;
      $105 = ((($$0199)) + 12|0);
      HEAP32[$105>>2] = $92;
      $106 = ((($92)) + 8|0);
      HEAP32[$106>>2] = $$0199;
      $107 = ((($92)) + 12|0);
      HEAP32[$107>>2] = $95;
     }
     HEAP32[(13188)>>2] = $84;
     HEAP32[(13200)>>2] = $87;
     $$0 = $72;
     STACKTOP = sp;return ($$0|0);
    }
    $108 = HEAP32[(13184)>>2]|0;
    $109 = ($108|0)==(0);
    if ($109) {
     $$0197 = $6;
    } else {
     $110 = (0 - ($108))|0;
     $111 = $108 & $110;
     $112 = (($111) + -1)|0;
     $113 = $112 >>> 12;
     $114 = $113 & 16;
     $115 = $112 >>> $114;
     $116 = $115 >>> 5;
     $117 = $116 & 8;
     $118 = $117 | $114;
     $119 = $115 >>> $117;
     $120 = $119 >>> 2;
     $121 = $120 & 4;
     $122 = $118 | $121;
     $123 = $119 >>> $121;
     $124 = $123 >>> 1;
     $125 = $124 & 2;
     $126 = $122 | $125;
     $127 = $123 >>> $125;
     $128 = $127 >>> 1;
     $129 = $128 & 1;
     $130 = $126 | $129;
     $131 = $127 >>> $129;
     $132 = (($130) + ($131))|0;
     $133 = (13484 + ($132<<2)|0);
     $134 = HEAP32[$133>>2]|0;
     $135 = ((($134)) + 4|0);
     $136 = HEAP32[$135>>2]|0;
     $137 = $136 & -8;
     $138 = (($137) - ($6))|0;
     $139 = ((($134)) + 16|0);
     $140 = HEAP32[$139>>2]|0;
     $not$5$i = ($140|0)==(0|0);
     $$sink16$i = $not$5$i&1;
     $141 = (((($134)) + 16|0) + ($$sink16$i<<2)|0);
     $142 = HEAP32[$141>>2]|0;
     $143 = ($142|0)==(0|0);
     if ($143) {
      $$0192$lcssa$i = $134;$$0193$lcssa$i = $138;
     } else {
      $$01928$i = $134;$$01937$i = $138;$145 = $142;
      while(1) {
       $144 = ((($145)) + 4|0);
       $146 = HEAP32[$144>>2]|0;
       $147 = $146 & -8;
       $148 = (($147) - ($6))|0;
       $149 = ($148>>>0)<($$01937$i>>>0);
       $$$0193$i = $149 ? $148 : $$01937$i;
       $$$0192$i = $149 ? $145 : $$01928$i;
       $150 = ((($145)) + 16|0);
       $151 = HEAP32[$150>>2]|0;
       $not$$i = ($151|0)==(0|0);
       $$sink1$i = $not$$i&1;
       $152 = (((($145)) + 16|0) + ($$sink1$i<<2)|0);
       $153 = HEAP32[$152>>2]|0;
       $154 = ($153|0)==(0|0);
       if ($154) {
        $$0192$lcssa$i = $$$0192$i;$$0193$lcssa$i = $$$0193$i;
        break;
       } else {
        $$01928$i = $$$0192$i;$$01937$i = $$$0193$i;$145 = $153;
       }
      }
     }
     $155 = HEAP32[(13196)>>2]|0;
     $156 = ($$0192$lcssa$i>>>0)<($155>>>0);
     if ($156) {
      _abort();
      // unreachable;
     }
     $157 = (($$0192$lcssa$i) + ($6)|0);
     $158 = ($$0192$lcssa$i>>>0)<($157>>>0);
     if (!($158)) {
      _abort();
      // unreachable;
     }
     $159 = ((($$0192$lcssa$i)) + 24|0);
     $160 = HEAP32[$159>>2]|0;
     $161 = ((($$0192$lcssa$i)) + 12|0);
     $162 = HEAP32[$161>>2]|0;
     $163 = ($162|0)==($$0192$lcssa$i|0);
     do {
      if ($163) {
       $173 = ((($$0192$lcssa$i)) + 20|0);
       $174 = HEAP32[$173>>2]|0;
       $175 = ($174|0)==(0|0);
       if ($175) {
        $176 = ((($$0192$lcssa$i)) + 16|0);
        $177 = HEAP32[$176>>2]|0;
        $178 = ($177|0)==(0|0);
        if ($178) {
         $$3$i = 0;
         break;
        } else {
         $$1196$i = $177;$$1198$i = $176;
        }
       } else {
        $$1196$i = $174;$$1198$i = $173;
       }
       while(1) {
        $179 = ((($$1196$i)) + 20|0);
        $180 = HEAP32[$179>>2]|0;
        $181 = ($180|0)==(0|0);
        if (!($181)) {
         $$1196$i = $180;$$1198$i = $179;
         continue;
        }
        $182 = ((($$1196$i)) + 16|0);
        $183 = HEAP32[$182>>2]|0;
        $184 = ($183|0)==(0|0);
        if ($184) {
         break;
        } else {
         $$1196$i = $183;$$1198$i = $182;
        }
       }
       $185 = ($$1198$i>>>0)<($155>>>0);
       if ($185) {
        _abort();
        // unreachable;
       } else {
        HEAP32[$$1198$i>>2] = 0;
        $$3$i = $$1196$i;
        break;
       }
      } else {
       $164 = ((($$0192$lcssa$i)) + 8|0);
       $165 = HEAP32[$164>>2]|0;
       $166 = ($165>>>0)<($155>>>0);
       if ($166) {
        _abort();
        // unreachable;
       }
       $167 = ((($165)) + 12|0);
       $168 = HEAP32[$167>>2]|0;
       $169 = ($168|0)==($$0192$lcssa$i|0);
       if (!($169)) {
        _abort();
        // unreachable;
       }
       $170 = ((($162)) + 8|0);
       $171 = HEAP32[$170>>2]|0;
       $172 = ($171|0)==($$0192$lcssa$i|0);
       if ($172) {
        HEAP32[$167>>2] = $162;
        HEAP32[$170>>2] = $165;
        $$3$i = $162;
        break;
       } else {
        _abort();
        // unreachable;
       }
      }
     } while(0);
     $186 = ($160|0)==(0|0);
     L73: do {
      if (!($186)) {
       $187 = ((($$0192$lcssa$i)) + 28|0);
       $188 = HEAP32[$187>>2]|0;
       $189 = (13484 + ($188<<2)|0);
       $190 = HEAP32[$189>>2]|0;
       $191 = ($$0192$lcssa$i|0)==($190|0);
       do {
        if ($191) {
         HEAP32[$189>>2] = $$3$i;
         $cond$i = ($$3$i|0)==(0|0);
         if ($cond$i) {
          $192 = 1 << $188;
          $193 = $192 ^ -1;
          $194 = $108 & $193;
          HEAP32[(13184)>>2] = $194;
          break L73;
         }
        } else {
         $195 = HEAP32[(13196)>>2]|0;
         $196 = ($160>>>0)<($195>>>0);
         if ($196) {
          _abort();
          // unreachable;
         } else {
          $197 = ((($160)) + 16|0);
          $198 = HEAP32[$197>>2]|0;
          $not$1$i = ($198|0)!=($$0192$lcssa$i|0);
          $$sink2$i = $not$1$i&1;
          $199 = (((($160)) + 16|0) + ($$sink2$i<<2)|0);
          HEAP32[$199>>2] = $$3$i;
          $200 = ($$3$i|0)==(0|0);
          if ($200) {
           break L73;
          } else {
           break;
          }
         }
        }
       } while(0);
       $201 = HEAP32[(13196)>>2]|0;
       $202 = ($$3$i>>>0)<($201>>>0);
       if ($202) {
        _abort();
        // unreachable;
       }
       $203 = ((($$3$i)) + 24|0);
       HEAP32[$203>>2] = $160;
       $204 = ((($$0192$lcssa$i)) + 16|0);
       $205 = HEAP32[$204>>2]|0;
       $206 = ($205|0)==(0|0);
       do {
        if (!($206)) {
         $207 = ($205>>>0)<($201>>>0);
         if ($207) {
          _abort();
          // unreachable;
         } else {
          $208 = ((($$3$i)) + 16|0);
          HEAP32[$208>>2] = $205;
          $209 = ((($205)) + 24|0);
          HEAP32[$209>>2] = $$3$i;
          break;
         }
        }
       } while(0);
       $210 = ((($$0192$lcssa$i)) + 20|0);
       $211 = HEAP32[$210>>2]|0;
       $212 = ($211|0)==(0|0);
       if (!($212)) {
        $213 = HEAP32[(13196)>>2]|0;
        $214 = ($211>>>0)<($213>>>0);
        if ($214) {
         _abort();
         // unreachable;
        } else {
         $215 = ((($$3$i)) + 20|0);
         HEAP32[$215>>2] = $211;
         $216 = ((($211)) + 24|0);
         HEAP32[$216>>2] = $$3$i;
         break;
        }
       }
      }
     } while(0);
     $217 = ($$0193$lcssa$i>>>0)<(16);
     if ($217) {
      $218 = (($$0193$lcssa$i) + ($6))|0;
      $219 = $218 | 3;
      $220 = ((($$0192$lcssa$i)) + 4|0);
      HEAP32[$220>>2] = $219;
      $221 = (($$0192$lcssa$i) + ($218)|0);
      $222 = ((($221)) + 4|0);
      $223 = HEAP32[$222>>2]|0;
      $224 = $223 | 1;
      HEAP32[$222>>2] = $224;
     } else {
      $225 = $6 | 3;
      $226 = ((($$0192$lcssa$i)) + 4|0);
      HEAP32[$226>>2] = $225;
      $227 = $$0193$lcssa$i | 1;
      $228 = ((($157)) + 4|0);
      HEAP32[$228>>2] = $227;
      $229 = (($157) + ($$0193$lcssa$i)|0);
      HEAP32[$229>>2] = $$0193$lcssa$i;
      $230 = ($37|0)==(0);
      if (!($230)) {
       $231 = HEAP32[(13200)>>2]|0;
       $232 = $37 >>> 3;
       $233 = $232 << 1;
       $234 = (13220 + ($233<<2)|0);
       $235 = 1 << $232;
       $236 = $8 & $235;
       $237 = ($236|0)==(0);
       if ($237) {
        $238 = $8 | $235;
        HEAP32[3295] = $238;
        $$pre$i = ((($234)) + 8|0);
        $$0189$i = $234;$$pre$phi$iZ2D = $$pre$i;
       } else {
        $239 = ((($234)) + 8|0);
        $240 = HEAP32[$239>>2]|0;
        $241 = HEAP32[(13196)>>2]|0;
        $242 = ($240>>>0)<($241>>>0);
        if ($242) {
         _abort();
         // unreachable;
        } else {
         $$0189$i = $240;$$pre$phi$iZ2D = $239;
        }
       }
       HEAP32[$$pre$phi$iZ2D>>2] = $231;
       $243 = ((($$0189$i)) + 12|0);
       HEAP32[$243>>2] = $231;
       $244 = ((($231)) + 8|0);
       HEAP32[$244>>2] = $$0189$i;
       $245 = ((($231)) + 12|0);
       HEAP32[$245>>2] = $234;
      }
      HEAP32[(13188)>>2] = $$0193$lcssa$i;
      HEAP32[(13200)>>2] = $157;
     }
     $246 = ((($$0192$lcssa$i)) + 8|0);
     $$0 = $246;
     STACKTOP = sp;return ($$0|0);
    }
   } else {
    $$0197 = $6;
   }
  } else {
   $247 = ($0>>>0)>(4294967231);
   if ($247) {
    $$0197 = -1;
   } else {
    $248 = (($0) + 11)|0;
    $249 = $248 & -8;
    $250 = HEAP32[(13184)>>2]|0;
    $251 = ($250|0)==(0);
    if ($251) {
     $$0197 = $249;
    } else {
     $252 = (0 - ($249))|0;
     $253 = $248 >>> 8;
     $254 = ($253|0)==(0);
     if ($254) {
      $$0358$i = 0;
     } else {
      $255 = ($249>>>0)>(16777215);
      if ($255) {
       $$0358$i = 31;
      } else {
       $256 = (($253) + 1048320)|0;
       $257 = $256 >>> 16;
       $258 = $257 & 8;
       $259 = $253 << $258;
       $260 = (($259) + 520192)|0;
       $261 = $260 >>> 16;
       $262 = $261 & 4;
       $263 = $262 | $258;
       $264 = $259 << $262;
       $265 = (($264) + 245760)|0;
       $266 = $265 >>> 16;
       $267 = $266 & 2;
       $268 = $263 | $267;
       $269 = (14 - ($268))|0;
       $270 = $264 << $267;
       $271 = $270 >>> 15;
       $272 = (($269) + ($271))|0;
       $273 = $272 << 1;
       $274 = (($272) + 7)|0;
       $275 = $249 >>> $274;
       $276 = $275 & 1;
       $277 = $276 | $273;
       $$0358$i = $277;
      }
     }
     $278 = (13484 + ($$0358$i<<2)|0);
     $279 = HEAP32[$278>>2]|0;
     $280 = ($279|0)==(0|0);
     L117: do {
      if ($280) {
       $$2355$i = 0;$$3$i201 = 0;$$3350$i = $252;
       label = 81;
      } else {
       $281 = ($$0358$i|0)==(31);
       $282 = $$0358$i >>> 1;
       $283 = (25 - ($282))|0;
       $284 = $281 ? 0 : $283;
       $285 = $249 << $284;
       $$0342$i = 0;$$0347$i = $252;$$0353$i = $279;$$0359$i = $285;$$0362$i = 0;
       while(1) {
        $286 = ((($$0353$i)) + 4|0);
        $287 = HEAP32[$286>>2]|0;
        $288 = $287 & -8;
        $289 = (($288) - ($249))|0;
        $290 = ($289>>>0)<($$0347$i>>>0);
        if ($290) {
         $291 = ($289|0)==(0);
         if ($291) {
          $$415$i = $$0353$i;$$435114$i = 0;$$435713$i = $$0353$i;
          label = 85;
          break L117;
         } else {
          $$1343$i = $$0353$i;$$1348$i = $289;
         }
        } else {
         $$1343$i = $$0342$i;$$1348$i = $$0347$i;
        }
        $292 = ((($$0353$i)) + 20|0);
        $293 = HEAP32[$292>>2]|0;
        $294 = $$0359$i >>> 31;
        $295 = (((($$0353$i)) + 16|0) + ($294<<2)|0);
        $296 = HEAP32[$295>>2]|0;
        $297 = ($293|0)==(0|0);
        $298 = ($293|0)==($296|0);
        $or$cond2$i = $297 | $298;
        $$1363$i = $or$cond2$i ? $$0362$i : $293;
        $299 = ($296|0)==(0|0);
        $not$8$i = $299 ^ 1;
        $300 = $not$8$i&1;
        $$0359$$i = $$0359$i << $300;
        if ($299) {
         $$2355$i = $$1363$i;$$3$i201 = $$1343$i;$$3350$i = $$1348$i;
         label = 81;
         break;
        } else {
         $$0342$i = $$1343$i;$$0347$i = $$1348$i;$$0353$i = $296;$$0359$i = $$0359$$i;$$0362$i = $$1363$i;
        }
       }
      }
     } while(0);
     if ((label|0) == 81) {
      $301 = ($$2355$i|0)==(0|0);
      $302 = ($$3$i201|0)==(0|0);
      $or$cond$i = $301 & $302;
      if ($or$cond$i) {
       $303 = 2 << $$0358$i;
       $304 = (0 - ($303))|0;
       $305 = $303 | $304;
       $306 = $250 & $305;
       $307 = ($306|0)==(0);
       if ($307) {
        $$0197 = $249;
        break;
       }
       $308 = (0 - ($306))|0;
       $309 = $306 & $308;
       $310 = (($309) + -1)|0;
       $311 = $310 >>> 12;
       $312 = $311 & 16;
       $313 = $310 >>> $312;
       $314 = $313 >>> 5;
       $315 = $314 & 8;
       $316 = $315 | $312;
       $317 = $313 >>> $315;
       $318 = $317 >>> 2;
       $319 = $318 & 4;
       $320 = $316 | $319;
       $321 = $317 >>> $319;
       $322 = $321 >>> 1;
       $323 = $322 & 2;
       $324 = $320 | $323;
       $325 = $321 >>> $323;
       $326 = $325 >>> 1;
       $327 = $326 & 1;
       $328 = $324 | $327;
       $329 = $325 >>> $327;
       $330 = (($328) + ($329))|0;
       $331 = (13484 + ($330<<2)|0);
       $332 = HEAP32[$331>>2]|0;
       $$4$ph$i = 0;$$4357$ph$i = $332;
      } else {
       $$4$ph$i = $$3$i201;$$4357$ph$i = $$2355$i;
      }
      $333 = ($$4357$ph$i|0)==(0|0);
      if ($333) {
       $$4$lcssa$i = $$4$ph$i;$$4351$lcssa$i = $$3350$i;
      } else {
       $$415$i = $$4$ph$i;$$435114$i = $$3350$i;$$435713$i = $$4357$ph$i;
       label = 85;
      }
     }
     if ((label|0) == 85) {
      while(1) {
       label = 0;
       $334 = ((($$435713$i)) + 4|0);
       $335 = HEAP32[$334>>2]|0;
       $336 = $335 & -8;
       $337 = (($336) - ($249))|0;
       $338 = ($337>>>0)<($$435114$i>>>0);
       $$$4351$i = $338 ? $337 : $$435114$i;
       $$4357$$4$i = $338 ? $$435713$i : $$415$i;
       $339 = ((($$435713$i)) + 16|0);
       $340 = HEAP32[$339>>2]|0;
       $not$1$i203 = ($340|0)==(0|0);
       $$sink2$i204 = $not$1$i203&1;
       $341 = (((($$435713$i)) + 16|0) + ($$sink2$i204<<2)|0);
       $342 = HEAP32[$341>>2]|0;
       $343 = ($342|0)==(0|0);
       if ($343) {
        $$4$lcssa$i = $$4357$$4$i;$$4351$lcssa$i = $$$4351$i;
        break;
       } else {
        $$415$i = $$4357$$4$i;$$435114$i = $$$4351$i;$$435713$i = $342;
        label = 85;
       }
      }
     }
     $344 = ($$4$lcssa$i|0)==(0|0);
     if ($344) {
      $$0197 = $249;
     } else {
      $345 = HEAP32[(13188)>>2]|0;
      $346 = (($345) - ($249))|0;
      $347 = ($$4351$lcssa$i>>>0)<($346>>>0);
      if ($347) {
       $348 = HEAP32[(13196)>>2]|0;
       $349 = ($$4$lcssa$i>>>0)<($348>>>0);
       if ($349) {
        _abort();
        // unreachable;
       }
       $350 = (($$4$lcssa$i) + ($249)|0);
       $351 = ($$4$lcssa$i>>>0)<($350>>>0);
       if (!($351)) {
        _abort();
        // unreachable;
       }
       $352 = ((($$4$lcssa$i)) + 24|0);
       $353 = HEAP32[$352>>2]|0;
       $354 = ((($$4$lcssa$i)) + 12|0);
       $355 = HEAP32[$354>>2]|0;
       $356 = ($355|0)==($$4$lcssa$i|0);
       do {
        if ($356) {
         $366 = ((($$4$lcssa$i)) + 20|0);
         $367 = HEAP32[$366>>2]|0;
         $368 = ($367|0)==(0|0);
         if ($368) {
          $369 = ((($$4$lcssa$i)) + 16|0);
          $370 = HEAP32[$369>>2]|0;
          $371 = ($370|0)==(0|0);
          if ($371) {
           $$3372$i = 0;
           break;
          } else {
           $$1370$i = $370;$$1374$i = $369;
          }
         } else {
          $$1370$i = $367;$$1374$i = $366;
         }
         while(1) {
          $372 = ((($$1370$i)) + 20|0);
          $373 = HEAP32[$372>>2]|0;
          $374 = ($373|0)==(0|0);
          if (!($374)) {
           $$1370$i = $373;$$1374$i = $372;
           continue;
          }
          $375 = ((($$1370$i)) + 16|0);
          $376 = HEAP32[$375>>2]|0;
          $377 = ($376|0)==(0|0);
          if ($377) {
           break;
          } else {
           $$1370$i = $376;$$1374$i = $375;
          }
         }
         $378 = ($$1374$i>>>0)<($348>>>0);
         if ($378) {
          _abort();
          // unreachable;
         } else {
          HEAP32[$$1374$i>>2] = 0;
          $$3372$i = $$1370$i;
          break;
         }
        } else {
         $357 = ((($$4$lcssa$i)) + 8|0);
         $358 = HEAP32[$357>>2]|0;
         $359 = ($358>>>0)<($348>>>0);
         if ($359) {
          _abort();
          // unreachable;
         }
         $360 = ((($358)) + 12|0);
         $361 = HEAP32[$360>>2]|0;
         $362 = ($361|0)==($$4$lcssa$i|0);
         if (!($362)) {
          _abort();
          // unreachable;
         }
         $363 = ((($355)) + 8|0);
         $364 = HEAP32[$363>>2]|0;
         $365 = ($364|0)==($$4$lcssa$i|0);
         if ($365) {
          HEAP32[$360>>2] = $355;
          HEAP32[$363>>2] = $358;
          $$3372$i = $355;
          break;
         } else {
          _abort();
          // unreachable;
         }
        }
       } while(0);
       $379 = ($353|0)==(0|0);
       L164: do {
        if ($379) {
         $470 = $250;
        } else {
         $380 = ((($$4$lcssa$i)) + 28|0);
         $381 = HEAP32[$380>>2]|0;
         $382 = (13484 + ($381<<2)|0);
         $383 = HEAP32[$382>>2]|0;
         $384 = ($$4$lcssa$i|0)==($383|0);
         do {
          if ($384) {
           HEAP32[$382>>2] = $$3372$i;
           $cond$i208 = ($$3372$i|0)==(0|0);
           if ($cond$i208) {
            $385 = 1 << $381;
            $386 = $385 ^ -1;
            $387 = $250 & $386;
            HEAP32[(13184)>>2] = $387;
            $470 = $387;
            break L164;
           }
          } else {
           $388 = HEAP32[(13196)>>2]|0;
           $389 = ($353>>>0)<($388>>>0);
           if ($389) {
            _abort();
            // unreachable;
           } else {
            $390 = ((($353)) + 16|0);
            $391 = HEAP32[$390>>2]|0;
            $not$$i209 = ($391|0)!=($$4$lcssa$i|0);
            $$sink3$i = $not$$i209&1;
            $392 = (((($353)) + 16|0) + ($$sink3$i<<2)|0);
            HEAP32[$392>>2] = $$3372$i;
            $393 = ($$3372$i|0)==(0|0);
            if ($393) {
             $470 = $250;
             break L164;
            } else {
             break;
            }
           }
          }
         } while(0);
         $394 = HEAP32[(13196)>>2]|0;
         $395 = ($$3372$i>>>0)<($394>>>0);
         if ($395) {
          _abort();
          // unreachable;
         }
         $396 = ((($$3372$i)) + 24|0);
         HEAP32[$396>>2] = $353;
         $397 = ((($$4$lcssa$i)) + 16|0);
         $398 = HEAP32[$397>>2]|0;
         $399 = ($398|0)==(0|0);
         do {
          if (!($399)) {
           $400 = ($398>>>0)<($394>>>0);
           if ($400) {
            _abort();
            // unreachable;
           } else {
            $401 = ((($$3372$i)) + 16|0);
            HEAP32[$401>>2] = $398;
            $402 = ((($398)) + 24|0);
            HEAP32[$402>>2] = $$3372$i;
            break;
           }
          }
         } while(0);
         $403 = ((($$4$lcssa$i)) + 20|0);
         $404 = HEAP32[$403>>2]|0;
         $405 = ($404|0)==(0|0);
         if ($405) {
          $470 = $250;
         } else {
          $406 = HEAP32[(13196)>>2]|0;
          $407 = ($404>>>0)<($406>>>0);
          if ($407) {
           _abort();
           // unreachable;
          } else {
           $408 = ((($$3372$i)) + 20|0);
           HEAP32[$408>>2] = $404;
           $409 = ((($404)) + 24|0);
           HEAP32[$409>>2] = $$3372$i;
           $470 = $250;
           break;
          }
         }
        }
       } while(0);
       $410 = ($$4351$lcssa$i>>>0)<(16);
       do {
        if ($410) {
         $411 = (($$4351$lcssa$i) + ($249))|0;
         $412 = $411 | 3;
         $413 = ((($$4$lcssa$i)) + 4|0);
         HEAP32[$413>>2] = $412;
         $414 = (($$4$lcssa$i) + ($411)|0);
         $415 = ((($414)) + 4|0);
         $416 = HEAP32[$415>>2]|0;
         $417 = $416 | 1;
         HEAP32[$415>>2] = $417;
        } else {
         $418 = $249 | 3;
         $419 = ((($$4$lcssa$i)) + 4|0);
         HEAP32[$419>>2] = $418;
         $420 = $$4351$lcssa$i | 1;
         $421 = ((($350)) + 4|0);
         HEAP32[$421>>2] = $420;
         $422 = (($350) + ($$4351$lcssa$i)|0);
         HEAP32[$422>>2] = $$4351$lcssa$i;
         $423 = $$4351$lcssa$i >>> 3;
         $424 = ($$4351$lcssa$i>>>0)<(256);
         if ($424) {
          $425 = $423 << 1;
          $426 = (13220 + ($425<<2)|0);
          $427 = HEAP32[3295]|0;
          $428 = 1 << $423;
          $429 = $427 & $428;
          $430 = ($429|0)==(0);
          if ($430) {
           $431 = $427 | $428;
           HEAP32[3295] = $431;
           $$pre$i210 = ((($426)) + 8|0);
           $$0368$i = $426;$$pre$phi$i211Z2D = $$pre$i210;
          } else {
           $432 = ((($426)) + 8|0);
           $433 = HEAP32[$432>>2]|0;
           $434 = HEAP32[(13196)>>2]|0;
           $435 = ($433>>>0)<($434>>>0);
           if ($435) {
            _abort();
            // unreachable;
           } else {
            $$0368$i = $433;$$pre$phi$i211Z2D = $432;
           }
          }
          HEAP32[$$pre$phi$i211Z2D>>2] = $350;
          $436 = ((($$0368$i)) + 12|0);
          HEAP32[$436>>2] = $350;
          $437 = ((($350)) + 8|0);
          HEAP32[$437>>2] = $$0368$i;
          $438 = ((($350)) + 12|0);
          HEAP32[$438>>2] = $426;
          break;
         }
         $439 = $$4351$lcssa$i >>> 8;
         $440 = ($439|0)==(0);
         if ($440) {
          $$0361$i = 0;
         } else {
          $441 = ($$4351$lcssa$i>>>0)>(16777215);
          if ($441) {
           $$0361$i = 31;
          } else {
           $442 = (($439) + 1048320)|0;
           $443 = $442 >>> 16;
           $444 = $443 & 8;
           $445 = $439 << $444;
           $446 = (($445) + 520192)|0;
           $447 = $446 >>> 16;
           $448 = $447 & 4;
           $449 = $448 | $444;
           $450 = $445 << $448;
           $451 = (($450) + 245760)|0;
           $452 = $451 >>> 16;
           $453 = $452 & 2;
           $454 = $449 | $453;
           $455 = (14 - ($454))|0;
           $456 = $450 << $453;
           $457 = $456 >>> 15;
           $458 = (($455) + ($457))|0;
           $459 = $458 << 1;
           $460 = (($458) + 7)|0;
           $461 = $$4351$lcssa$i >>> $460;
           $462 = $461 & 1;
           $463 = $462 | $459;
           $$0361$i = $463;
          }
         }
         $464 = (13484 + ($$0361$i<<2)|0);
         $465 = ((($350)) + 28|0);
         HEAP32[$465>>2] = $$0361$i;
         $466 = ((($350)) + 16|0);
         $467 = ((($466)) + 4|0);
         HEAP32[$467>>2] = 0;
         HEAP32[$466>>2] = 0;
         $468 = 1 << $$0361$i;
         $469 = $470 & $468;
         $471 = ($469|0)==(0);
         if ($471) {
          $472 = $470 | $468;
          HEAP32[(13184)>>2] = $472;
          HEAP32[$464>>2] = $350;
          $473 = ((($350)) + 24|0);
          HEAP32[$473>>2] = $464;
          $474 = ((($350)) + 12|0);
          HEAP32[$474>>2] = $350;
          $475 = ((($350)) + 8|0);
          HEAP32[$475>>2] = $350;
          break;
         }
         $476 = HEAP32[$464>>2]|0;
         $477 = ($$0361$i|0)==(31);
         $478 = $$0361$i >>> 1;
         $479 = (25 - ($478))|0;
         $480 = $477 ? 0 : $479;
         $481 = $$4351$lcssa$i << $480;
         $$0344$i = $481;$$0345$i = $476;
         while(1) {
          $482 = ((($$0345$i)) + 4|0);
          $483 = HEAP32[$482>>2]|0;
          $484 = $483 & -8;
          $485 = ($484|0)==($$4351$lcssa$i|0);
          if ($485) {
           label = 139;
           break;
          }
          $486 = $$0344$i >>> 31;
          $487 = (((($$0345$i)) + 16|0) + ($486<<2)|0);
          $488 = $$0344$i << 1;
          $489 = HEAP32[$487>>2]|0;
          $490 = ($489|0)==(0|0);
          if ($490) {
           label = 136;
           break;
          } else {
           $$0344$i = $488;$$0345$i = $489;
          }
         }
         if ((label|0) == 136) {
          $491 = HEAP32[(13196)>>2]|0;
          $492 = ($487>>>0)<($491>>>0);
          if ($492) {
           _abort();
           // unreachable;
          } else {
           HEAP32[$487>>2] = $350;
           $493 = ((($350)) + 24|0);
           HEAP32[$493>>2] = $$0345$i;
           $494 = ((($350)) + 12|0);
           HEAP32[$494>>2] = $350;
           $495 = ((($350)) + 8|0);
           HEAP32[$495>>2] = $350;
           break;
          }
         }
         else if ((label|0) == 139) {
          $496 = ((($$0345$i)) + 8|0);
          $497 = HEAP32[$496>>2]|0;
          $498 = HEAP32[(13196)>>2]|0;
          $499 = ($497>>>0)>=($498>>>0);
          $not$9$i = ($$0345$i>>>0)>=($498>>>0);
          $500 = $499 & $not$9$i;
          if ($500) {
           $501 = ((($497)) + 12|0);
           HEAP32[$501>>2] = $350;
           HEAP32[$496>>2] = $350;
           $502 = ((($350)) + 8|0);
           HEAP32[$502>>2] = $497;
           $503 = ((($350)) + 12|0);
           HEAP32[$503>>2] = $$0345$i;
           $504 = ((($350)) + 24|0);
           HEAP32[$504>>2] = 0;
           break;
          } else {
           _abort();
           // unreachable;
          }
         }
        }
       } while(0);
       $505 = ((($$4$lcssa$i)) + 8|0);
       $$0 = $505;
       STACKTOP = sp;return ($$0|0);
      } else {
       $$0197 = $249;
      }
     }
    }
   }
  }
 } while(0);
 $506 = HEAP32[(13188)>>2]|0;
 $507 = ($506>>>0)<($$0197>>>0);
 if (!($507)) {
  $508 = (($506) - ($$0197))|0;
  $509 = HEAP32[(13200)>>2]|0;
  $510 = ($508>>>0)>(15);
  if ($510) {
   $511 = (($509) + ($$0197)|0);
   HEAP32[(13200)>>2] = $511;
   HEAP32[(13188)>>2] = $508;
   $512 = $508 | 1;
   $513 = ((($511)) + 4|0);
   HEAP32[$513>>2] = $512;
   $514 = (($511) + ($508)|0);
   HEAP32[$514>>2] = $508;
   $515 = $$0197 | 3;
   $516 = ((($509)) + 4|0);
   HEAP32[$516>>2] = $515;
  } else {
   HEAP32[(13188)>>2] = 0;
   HEAP32[(13200)>>2] = 0;
   $517 = $506 | 3;
   $518 = ((($509)) + 4|0);
   HEAP32[$518>>2] = $517;
   $519 = (($509) + ($506)|0);
   $520 = ((($519)) + 4|0);
   $521 = HEAP32[$520>>2]|0;
   $522 = $521 | 1;
   HEAP32[$520>>2] = $522;
  }
  $523 = ((($509)) + 8|0);
  $$0 = $523;
  STACKTOP = sp;return ($$0|0);
 }
 $524 = HEAP32[(13192)>>2]|0;
 $525 = ($524>>>0)>($$0197>>>0);
 if ($525) {
  $526 = (($524) - ($$0197))|0;
  HEAP32[(13192)>>2] = $526;
  $527 = HEAP32[(13204)>>2]|0;
  $528 = (($527) + ($$0197)|0);
  HEAP32[(13204)>>2] = $528;
  $529 = $526 | 1;
  $530 = ((($528)) + 4|0);
  HEAP32[$530>>2] = $529;
  $531 = $$0197 | 3;
  $532 = ((($527)) + 4|0);
  HEAP32[$532>>2] = $531;
  $533 = ((($527)) + 8|0);
  $$0 = $533;
  STACKTOP = sp;return ($$0|0);
 }
 $534 = HEAP32[3413]|0;
 $535 = ($534|0)==(0);
 if ($535) {
  HEAP32[(13660)>>2] = 4096;
  HEAP32[(13656)>>2] = 4096;
  HEAP32[(13664)>>2] = -1;
  HEAP32[(13668)>>2] = -1;
  HEAP32[(13672)>>2] = 0;
  HEAP32[(13624)>>2] = 0;
  $536 = $1;
  $537 = $536 & -16;
  $538 = $537 ^ 1431655768;
  HEAP32[$1>>2] = $538;
  HEAP32[3413] = $538;
  $542 = 4096;
 } else {
  $$pre$i212 = HEAP32[(13660)>>2]|0;
  $542 = $$pre$i212;
 }
 $539 = (($$0197) + 48)|0;
 $540 = (($$0197) + 47)|0;
 $541 = (($542) + ($540))|0;
 $543 = (0 - ($542))|0;
 $544 = $541 & $543;
 $545 = ($544>>>0)>($$0197>>>0);
 if (!($545)) {
  $$0 = 0;
  STACKTOP = sp;return ($$0|0);
 }
 $546 = HEAP32[(13620)>>2]|0;
 $547 = ($546|0)==(0);
 if (!($547)) {
  $548 = HEAP32[(13612)>>2]|0;
  $549 = (($548) + ($544))|0;
  $550 = ($549>>>0)<=($548>>>0);
  $551 = ($549>>>0)>($546>>>0);
  $or$cond1$i = $550 | $551;
  if ($or$cond1$i) {
   $$0 = 0;
   STACKTOP = sp;return ($$0|0);
  }
 }
 $552 = HEAP32[(13624)>>2]|0;
 $553 = $552 & 4;
 $554 = ($553|0)==(0);
 L244: do {
  if ($554) {
   $555 = HEAP32[(13204)>>2]|0;
   $556 = ($555|0)==(0|0);
   L246: do {
    if ($556) {
     label = 163;
    } else {
     $$0$i$i = (13628);
     while(1) {
      $557 = HEAP32[$$0$i$i>>2]|0;
      $558 = ($557>>>0)>($555>>>0);
      if (!($558)) {
       $559 = ((($$0$i$i)) + 4|0);
       $560 = HEAP32[$559>>2]|0;
       $561 = (($557) + ($560)|0);
       $562 = ($561>>>0)>($555>>>0);
       if ($562) {
        break;
       }
      }
      $563 = ((($$0$i$i)) + 8|0);
      $564 = HEAP32[$563>>2]|0;
      $565 = ($564|0)==(0|0);
      if ($565) {
       label = 163;
       break L246;
      } else {
       $$0$i$i = $564;
      }
     }
     $588 = (($541) - ($524))|0;
     $589 = $588 & $543;
     $590 = ($589>>>0)<(2147483647);
     if ($590) {
      $591 = (_sbrk(($589|0))|0);
      $592 = HEAP32[$$0$i$i>>2]|0;
      $593 = HEAP32[$559>>2]|0;
      $594 = (($592) + ($593)|0);
      $595 = ($591|0)==($594|0);
      if ($595) {
       $596 = ($591|0)==((-1)|0);
       if ($596) {
        $$2234253237$i = $589;
       } else {
        $$723948$i = $589;$$749$i = $591;
        label = 180;
        break L244;
       }
      } else {
       $$2247$ph$i = $591;$$2253$ph$i = $589;
       label = 171;
      }
     } else {
      $$2234253237$i = 0;
     }
    }
   } while(0);
   do {
    if ((label|0) == 163) {
     $566 = (_sbrk(0)|0);
     $567 = ($566|0)==((-1)|0);
     if ($567) {
      $$2234253237$i = 0;
     } else {
      $568 = $566;
      $569 = HEAP32[(13656)>>2]|0;
      $570 = (($569) + -1)|0;
      $571 = $570 & $568;
      $572 = ($571|0)==(0);
      $573 = (($570) + ($568))|0;
      $574 = (0 - ($569))|0;
      $575 = $573 & $574;
      $576 = (($575) - ($568))|0;
      $577 = $572 ? 0 : $576;
      $$$i = (($577) + ($544))|0;
      $578 = HEAP32[(13612)>>2]|0;
      $579 = (($$$i) + ($578))|0;
      $580 = ($$$i>>>0)>($$0197>>>0);
      $581 = ($$$i>>>0)<(2147483647);
      $or$cond$i214 = $580 & $581;
      if ($or$cond$i214) {
       $582 = HEAP32[(13620)>>2]|0;
       $583 = ($582|0)==(0);
       if (!($583)) {
        $584 = ($579>>>0)<=($578>>>0);
        $585 = ($579>>>0)>($582>>>0);
        $or$cond2$i215 = $584 | $585;
        if ($or$cond2$i215) {
         $$2234253237$i = 0;
         break;
        }
       }
       $586 = (_sbrk(($$$i|0))|0);
       $587 = ($586|0)==($566|0);
       if ($587) {
        $$723948$i = $$$i;$$749$i = $566;
        label = 180;
        break L244;
       } else {
        $$2247$ph$i = $586;$$2253$ph$i = $$$i;
        label = 171;
       }
      } else {
       $$2234253237$i = 0;
      }
     }
    }
   } while(0);
   do {
    if ((label|0) == 171) {
     $597 = (0 - ($$2253$ph$i))|0;
     $598 = ($$2247$ph$i|0)!=((-1)|0);
     $599 = ($$2253$ph$i>>>0)<(2147483647);
     $or$cond7$i = $599 & $598;
     $600 = ($539>>>0)>($$2253$ph$i>>>0);
     $or$cond10$i = $600 & $or$cond7$i;
     if (!($or$cond10$i)) {
      $610 = ($$2247$ph$i|0)==((-1)|0);
      if ($610) {
       $$2234253237$i = 0;
       break;
      } else {
       $$723948$i = $$2253$ph$i;$$749$i = $$2247$ph$i;
       label = 180;
       break L244;
      }
     }
     $601 = HEAP32[(13660)>>2]|0;
     $602 = (($540) - ($$2253$ph$i))|0;
     $603 = (($602) + ($601))|0;
     $604 = (0 - ($601))|0;
     $605 = $603 & $604;
     $606 = ($605>>>0)<(2147483647);
     if (!($606)) {
      $$723948$i = $$2253$ph$i;$$749$i = $$2247$ph$i;
      label = 180;
      break L244;
     }
     $607 = (_sbrk(($605|0))|0);
     $608 = ($607|0)==((-1)|0);
     if ($608) {
      (_sbrk(($597|0))|0);
      $$2234253237$i = 0;
      break;
     } else {
      $609 = (($605) + ($$2253$ph$i))|0;
      $$723948$i = $609;$$749$i = $$2247$ph$i;
      label = 180;
      break L244;
     }
    }
   } while(0);
   $611 = HEAP32[(13624)>>2]|0;
   $612 = $611 | 4;
   HEAP32[(13624)>>2] = $612;
   $$4236$i = $$2234253237$i;
   label = 178;
  } else {
   $$4236$i = 0;
   label = 178;
  }
 } while(0);
 if ((label|0) == 178) {
  $613 = ($544>>>0)<(2147483647);
  if ($613) {
   $614 = (_sbrk(($544|0))|0);
   $615 = (_sbrk(0)|0);
   $616 = ($614|0)!=((-1)|0);
   $617 = ($615|0)!=((-1)|0);
   $or$cond5$i = $616 & $617;
   $618 = ($614>>>0)<($615>>>0);
   $or$cond11$i = $618 & $or$cond5$i;
   $619 = $615;
   $620 = $614;
   $621 = (($619) - ($620))|0;
   $622 = (($$0197) + 40)|0;
   $623 = ($621>>>0)>($622>>>0);
   $$$4236$i = $623 ? $621 : $$4236$i;
   $or$cond11$not$i = $or$cond11$i ^ 1;
   $624 = ($614|0)==((-1)|0);
   $not$$i216 = $623 ^ 1;
   $625 = $624 | $not$$i216;
   $or$cond50$i = $625 | $or$cond11$not$i;
   if (!($or$cond50$i)) {
    $$723948$i = $$$4236$i;$$749$i = $614;
    label = 180;
   }
  }
 }
 if ((label|0) == 180) {
  $626 = HEAP32[(13612)>>2]|0;
  $627 = (($626) + ($$723948$i))|0;
  HEAP32[(13612)>>2] = $627;
  $628 = HEAP32[(13616)>>2]|0;
  $629 = ($627>>>0)>($628>>>0);
  if ($629) {
   HEAP32[(13616)>>2] = $627;
  }
  $630 = HEAP32[(13204)>>2]|0;
  $631 = ($630|0)==(0|0);
  do {
   if ($631) {
    $632 = HEAP32[(13196)>>2]|0;
    $633 = ($632|0)==(0|0);
    $634 = ($$749$i>>>0)<($632>>>0);
    $or$cond12$i = $633 | $634;
    if ($or$cond12$i) {
     HEAP32[(13196)>>2] = $$749$i;
    }
    HEAP32[(13628)>>2] = $$749$i;
    HEAP32[(13632)>>2] = $$723948$i;
    HEAP32[(13640)>>2] = 0;
    $635 = HEAP32[3413]|0;
    HEAP32[(13216)>>2] = $635;
    HEAP32[(13212)>>2] = -1;
    $$01$i$i = 0;
    while(1) {
     $636 = $$01$i$i << 1;
     $637 = (13220 + ($636<<2)|0);
     $638 = ((($637)) + 12|0);
     HEAP32[$638>>2] = $637;
     $639 = ((($637)) + 8|0);
     HEAP32[$639>>2] = $637;
     $640 = (($$01$i$i) + 1)|0;
     $exitcond$i$i = ($640|0)==(32);
     if ($exitcond$i$i) {
      break;
     } else {
      $$01$i$i = $640;
     }
    }
    $641 = (($$723948$i) + -40)|0;
    $642 = ((($$749$i)) + 8|0);
    $643 = $642;
    $644 = $643 & 7;
    $645 = ($644|0)==(0);
    $646 = (0 - ($643))|0;
    $647 = $646 & 7;
    $648 = $645 ? 0 : $647;
    $649 = (($$749$i) + ($648)|0);
    $650 = (($641) - ($648))|0;
    HEAP32[(13204)>>2] = $649;
    HEAP32[(13192)>>2] = $650;
    $651 = $650 | 1;
    $652 = ((($649)) + 4|0);
    HEAP32[$652>>2] = $651;
    $653 = (($649) + ($650)|0);
    $654 = ((($653)) + 4|0);
    HEAP32[$654>>2] = 40;
    $655 = HEAP32[(13668)>>2]|0;
    HEAP32[(13208)>>2] = $655;
   } else {
    $$024371$i = (13628);
    while(1) {
     $656 = HEAP32[$$024371$i>>2]|0;
     $657 = ((($$024371$i)) + 4|0);
     $658 = HEAP32[$657>>2]|0;
     $659 = (($656) + ($658)|0);
     $660 = ($$749$i|0)==($659|0);
     if ($660) {
      label = 190;
      break;
     }
     $661 = ((($$024371$i)) + 8|0);
     $662 = HEAP32[$661>>2]|0;
     $663 = ($662|0)==(0|0);
     if ($663) {
      break;
     } else {
      $$024371$i = $662;
     }
    }
    if ((label|0) == 190) {
     $664 = ((($$024371$i)) + 12|0);
     $665 = HEAP32[$664>>2]|0;
     $666 = $665 & 8;
     $667 = ($666|0)==(0);
     if ($667) {
      $668 = ($630>>>0)>=($656>>>0);
      $669 = ($630>>>0)<($$749$i>>>0);
      $or$cond51$i = $669 & $668;
      if ($or$cond51$i) {
       $670 = (($658) + ($$723948$i))|0;
       HEAP32[$657>>2] = $670;
       $671 = HEAP32[(13192)>>2]|0;
       $672 = ((($630)) + 8|0);
       $673 = $672;
       $674 = $673 & 7;
       $675 = ($674|0)==(0);
       $676 = (0 - ($673))|0;
       $677 = $676 & 7;
       $678 = $675 ? 0 : $677;
       $679 = (($630) + ($678)|0);
       $680 = (($$723948$i) - ($678))|0;
       $681 = (($671) + ($680))|0;
       HEAP32[(13204)>>2] = $679;
       HEAP32[(13192)>>2] = $681;
       $682 = $681 | 1;
       $683 = ((($679)) + 4|0);
       HEAP32[$683>>2] = $682;
       $684 = (($679) + ($681)|0);
       $685 = ((($684)) + 4|0);
       HEAP32[$685>>2] = 40;
       $686 = HEAP32[(13668)>>2]|0;
       HEAP32[(13208)>>2] = $686;
       break;
      }
     }
    }
    $687 = HEAP32[(13196)>>2]|0;
    $688 = ($$749$i>>>0)<($687>>>0);
    if ($688) {
     HEAP32[(13196)>>2] = $$749$i;
     $752 = $$749$i;
    } else {
     $752 = $687;
    }
    $689 = (($$749$i) + ($$723948$i)|0);
    $$124470$i = (13628);
    while(1) {
     $690 = HEAP32[$$124470$i>>2]|0;
     $691 = ($690|0)==($689|0);
     if ($691) {
      label = 198;
      break;
     }
     $692 = ((($$124470$i)) + 8|0);
     $693 = HEAP32[$692>>2]|0;
     $694 = ($693|0)==(0|0);
     if ($694) {
      break;
     } else {
      $$124470$i = $693;
     }
    }
    if ((label|0) == 198) {
     $695 = ((($$124470$i)) + 12|0);
     $696 = HEAP32[$695>>2]|0;
     $697 = $696 & 8;
     $698 = ($697|0)==(0);
     if ($698) {
      HEAP32[$$124470$i>>2] = $$749$i;
      $699 = ((($$124470$i)) + 4|0);
      $700 = HEAP32[$699>>2]|0;
      $701 = (($700) + ($$723948$i))|0;
      HEAP32[$699>>2] = $701;
      $702 = ((($$749$i)) + 8|0);
      $703 = $702;
      $704 = $703 & 7;
      $705 = ($704|0)==(0);
      $706 = (0 - ($703))|0;
      $707 = $706 & 7;
      $708 = $705 ? 0 : $707;
      $709 = (($$749$i) + ($708)|0);
      $710 = ((($689)) + 8|0);
      $711 = $710;
      $712 = $711 & 7;
      $713 = ($712|0)==(0);
      $714 = (0 - ($711))|0;
      $715 = $714 & 7;
      $716 = $713 ? 0 : $715;
      $717 = (($689) + ($716)|0);
      $718 = $717;
      $719 = $709;
      $720 = (($718) - ($719))|0;
      $721 = (($709) + ($$0197)|0);
      $722 = (($720) - ($$0197))|0;
      $723 = $$0197 | 3;
      $724 = ((($709)) + 4|0);
      HEAP32[$724>>2] = $723;
      $725 = ($717|0)==($630|0);
      do {
       if ($725) {
        $726 = HEAP32[(13192)>>2]|0;
        $727 = (($726) + ($722))|0;
        HEAP32[(13192)>>2] = $727;
        HEAP32[(13204)>>2] = $721;
        $728 = $727 | 1;
        $729 = ((($721)) + 4|0);
        HEAP32[$729>>2] = $728;
       } else {
        $730 = HEAP32[(13200)>>2]|0;
        $731 = ($717|0)==($730|0);
        if ($731) {
         $732 = HEAP32[(13188)>>2]|0;
         $733 = (($732) + ($722))|0;
         HEAP32[(13188)>>2] = $733;
         HEAP32[(13200)>>2] = $721;
         $734 = $733 | 1;
         $735 = ((($721)) + 4|0);
         HEAP32[$735>>2] = $734;
         $736 = (($721) + ($733)|0);
         HEAP32[$736>>2] = $733;
         break;
        }
        $737 = ((($717)) + 4|0);
        $738 = HEAP32[$737>>2]|0;
        $739 = $738 & 3;
        $740 = ($739|0)==(1);
        if ($740) {
         $741 = $738 & -8;
         $742 = $738 >>> 3;
         $743 = ($738>>>0)<(256);
         L314: do {
          if ($743) {
           $744 = ((($717)) + 8|0);
           $745 = HEAP32[$744>>2]|0;
           $746 = ((($717)) + 12|0);
           $747 = HEAP32[$746>>2]|0;
           $748 = $742 << 1;
           $749 = (13220 + ($748<<2)|0);
           $750 = ($745|0)==($749|0);
           do {
            if (!($750)) {
             $751 = ($745>>>0)<($752>>>0);
             if ($751) {
              _abort();
              // unreachable;
             }
             $753 = ((($745)) + 12|0);
             $754 = HEAP32[$753>>2]|0;
             $755 = ($754|0)==($717|0);
             if ($755) {
              break;
             }
             _abort();
             // unreachable;
            }
           } while(0);
           $756 = ($747|0)==($745|0);
           if ($756) {
            $757 = 1 << $742;
            $758 = $757 ^ -1;
            $759 = HEAP32[3295]|0;
            $760 = $759 & $758;
            HEAP32[3295] = $760;
            break;
           }
           $761 = ($747|0)==($749|0);
           do {
            if ($761) {
             $$pre10$i$i = ((($747)) + 8|0);
             $$pre$phi11$i$iZ2D = $$pre10$i$i;
            } else {
             $762 = ($747>>>0)<($752>>>0);
             if ($762) {
              _abort();
              // unreachable;
             }
             $763 = ((($747)) + 8|0);
             $764 = HEAP32[$763>>2]|0;
             $765 = ($764|0)==($717|0);
             if ($765) {
              $$pre$phi11$i$iZ2D = $763;
              break;
             }
             _abort();
             // unreachable;
            }
           } while(0);
           $766 = ((($745)) + 12|0);
           HEAP32[$766>>2] = $747;
           HEAP32[$$pre$phi11$i$iZ2D>>2] = $745;
          } else {
           $767 = ((($717)) + 24|0);
           $768 = HEAP32[$767>>2]|0;
           $769 = ((($717)) + 12|0);
           $770 = HEAP32[$769>>2]|0;
           $771 = ($770|0)==($717|0);
           do {
            if ($771) {
             $781 = ((($717)) + 16|0);
             $782 = ((($781)) + 4|0);
             $783 = HEAP32[$782>>2]|0;
             $784 = ($783|0)==(0|0);
             if ($784) {
              $785 = HEAP32[$781>>2]|0;
              $786 = ($785|0)==(0|0);
              if ($786) {
               $$3$i$i = 0;
               break;
              } else {
               $$1291$i$i = $785;$$1293$i$i = $781;
              }
             } else {
              $$1291$i$i = $783;$$1293$i$i = $782;
             }
             while(1) {
              $787 = ((($$1291$i$i)) + 20|0);
              $788 = HEAP32[$787>>2]|0;
              $789 = ($788|0)==(0|0);
              if (!($789)) {
               $$1291$i$i = $788;$$1293$i$i = $787;
               continue;
              }
              $790 = ((($$1291$i$i)) + 16|0);
              $791 = HEAP32[$790>>2]|0;
              $792 = ($791|0)==(0|0);
              if ($792) {
               break;
              } else {
               $$1291$i$i = $791;$$1293$i$i = $790;
              }
             }
             $793 = ($$1293$i$i>>>0)<($752>>>0);
             if ($793) {
              _abort();
              // unreachable;
             } else {
              HEAP32[$$1293$i$i>>2] = 0;
              $$3$i$i = $$1291$i$i;
              break;
             }
            } else {
             $772 = ((($717)) + 8|0);
             $773 = HEAP32[$772>>2]|0;
             $774 = ($773>>>0)<($752>>>0);
             if ($774) {
              _abort();
              // unreachable;
             }
             $775 = ((($773)) + 12|0);
             $776 = HEAP32[$775>>2]|0;
             $777 = ($776|0)==($717|0);
             if (!($777)) {
              _abort();
              // unreachable;
             }
             $778 = ((($770)) + 8|0);
             $779 = HEAP32[$778>>2]|0;
             $780 = ($779|0)==($717|0);
             if ($780) {
              HEAP32[$775>>2] = $770;
              HEAP32[$778>>2] = $773;
              $$3$i$i = $770;
              break;
             } else {
              _abort();
              // unreachable;
             }
            }
           } while(0);
           $794 = ($768|0)==(0|0);
           if ($794) {
            break;
           }
           $795 = ((($717)) + 28|0);
           $796 = HEAP32[$795>>2]|0;
           $797 = (13484 + ($796<<2)|0);
           $798 = HEAP32[$797>>2]|0;
           $799 = ($717|0)==($798|0);
           do {
            if ($799) {
             HEAP32[$797>>2] = $$3$i$i;
             $cond$i$i = ($$3$i$i|0)==(0|0);
             if (!($cond$i$i)) {
              break;
             }
             $800 = 1 << $796;
             $801 = $800 ^ -1;
             $802 = HEAP32[(13184)>>2]|0;
             $803 = $802 & $801;
             HEAP32[(13184)>>2] = $803;
             break L314;
            } else {
             $804 = HEAP32[(13196)>>2]|0;
             $805 = ($768>>>0)<($804>>>0);
             if ($805) {
              _abort();
              // unreachable;
             } else {
              $806 = ((($768)) + 16|0);
              $807 = HEAP32[$806>>2]|0;
              $not$$i17$i = ($807|0)!=($717|0);
              $$sink1$i$i = $not$$i17$i&1;
              $808 = (((($768)) + 16|0) + ($$sink1$i$i<<2)|0);
              HEAP32[$808>>2] = $$3$i$i;
              $809 = ($$3$i$i|0)==(0|0);
              if ($809) {
               break L314;
              } else {
               break;
              }
             }
            }
           } while(0);
           $810 = HEAP32[(13196)>>2]|0;
           $811 = ($$3$i$i>>>0)<($810>>>0);
           if ($811) {
            _abort();
            // unreachable;
           }
           $812 = ((($$3$i$i)) + 24|0);
           HEAP32[$812>>2] = $768;
           $813 = ((($717)) + 16|0);
           $814 = HEAP32[$813>>2]|0;
           $815 = ($814|0)==(0|0);
           do {
            if (!($815)) {
             $816 = ($814>>>0)<($810>>>0);
             if ($816) {
              _abort();
              // unreachable;
             } else {
              $817 = ((($$3$i$i)) + 16|0);
              HEAP32[$817>>2] = $814;
              $818 = ((($814)) + 24|0);
              HEAP32[$818>>2] = $$3$i$i;
              break;
             }
            }
           } while(0);
           $819 = ((($813)) + 4|0);
           $820 = HEAP32[$819>>2]|0;
           $821 = ($820|0)==(0|0);
           if ($821) {
            break;
           }
           $822 = HEAP32[(13196)>>2]|0;
           $823 = ($820>>>0)<($822>>>0);
           if ($823) {
            _abort();
            // unreachable;
           } else {
            $824 = ((($$3$i$i)) + 20|0);
            HEAP32[$824>>2] = $820;
            $825 = ((($820)) + 24|0);
            HEAP32[$825>>2] = $$3$i$i;
            break;
           }
          }
         } while(0);
         $826 = (($717) + ($741)|0);
         $827 = (($741) + ($722))|0;
         $$0$i18$i = $826;$$0287$i$i = $827;
        } else {
         $$0$i18$i = $717;$$0287$i$i = $722;
        }
        $828 = ((($$0$i18$i)) + 4|0);
        $829 = HEAP32[$828>>2]|0;
        $830 = $829 & -2;
        HEAP32[$828>>2] = $830;
        $831 = $$0287$i$i | 1;
        $832 = ((($721)) + 4|0);
        HEAP32[$832>>2] = $831;
        $833 = (($721) + ($$0287$i$i)|0);
        HEAP32[$833>>2] = $$0287$i$i;
        $834 = $$0287$i$i >>> 3;
        $835 = ($$0287$i$i>>>0)<(256);
        if ($835) {
         $836 = $834 << 1;
         $837 = (13220 + ($836<<2)|0);
         $838 = HEAP32[3295]|0;
         $839 = 1 << $834;
         $840 = $838 & $839;
         $841 = ($840|0)==(0);
         do {
          if ($841) {
           $842 = $838 | $839;
           HEAP32[3295] = $842;
           $$pre$i19$i = ((($837)) + 8|0);
           $$0295$i$i = $837;$$pre$phi$i20$iZ2D = $$pre$i19$i;
          } else {
           $843 = ((($837)) + 8|0);
           $844 = HEAP32[$843>>2]|0;
           $845 = HEAP32[(13196)>>2]|0;
           $846 = ($844>>>0)<($845>>>0);
           if (!($846)) {
            $$0295$i$i = $844;$$pre$phi$i20$iZ2D = $843;
            break;
           }
           _abort();
           // unreachable;
          }
         } while(0);
         HEAP32[$$pre$phi$i20$iZ2D>>2] = $721;
         $847 = ((($$0295$i$i)) + 12|0);
         HEAP32[$847>>2] = $721;
         $848 = ((($721)) + 8|0);
         HEAP32[$848>>2] = $$0295$i$i;
         $849 = ((($721)) + 12|0);
         HEAP32[$849>>2] = $837;
         break;
        }
        $850 = $$0287$i$i >>> 8;
        $851 = ($850|0)==(0);
        do {
         if ($851) {
          $$0296$i$i = 0;
         } else {
          $852 = ($$0287$i$i>>>0)>(16777215);
          if ($852) {
           $$0296$i$i = 31;
           break;
          }
          $853 = (($850) + 1048320)|0;
          $854 = $853 >>> 16;
          $855 = $854 & 8;
          $856 = $850 << $855;
          $857 = (($856) + 520192)|0;
          $858 = $857 >>> 16;
          $859 = $858 & 4;
          $860 = $859 | $855;
          $861 = $856 << $859;
          $862 = (($861) + 245760)|0;
          $863 = $862 >>> 16;
          $864 = $863 & 2;
          $865 = $860 | $864;
          $866 = (14 - ($865))|0;
          $867 = $861 << $864;
          $868 = $867 >>> 15;
          $869 = (($866) + ($868))|0;
          $870 = $869 << 1;
          $871 = (($869) + 7)|0;
          $872 = $$0287$i$i >>> $871;
          $873 = $872 & 1;
          $874 = $873 | $870;
          $$0296$i$i = $874;
         }
        } while(0);
        $875 = (13484 + ($$0296$i$i<<2)|0);
        $876 = ((($721)) + 28|0);
        HEAP32[$876>>2] = $$0296$i$i;
        $877 = ((($721)) + 16|0);
        $878 = ((($877)) + 4|0);
        HEAP32[$878>>2] = 0;
        HEAP32[$877>>2] = 0;
        $879 = HEAP32[(13184)>>2]|0;
        $880 = 1 << $$0296$i$i;
        $881 = $879 & $880;
        $882 = ($881|0)==(0);
        if ($882) {
         $883 = $879 | $880;
         HEAP32[(13184)>>2] = $883;
         HEAP32[$875>>2] = $721;
         $884 = ((($721)) + 24|0);
         HEAP32[$884>>2] = $875;
         $885 = ((($721)) + 12|0);
         HEAP32[$885>>2] = $721;
         $886 = ((($721)) + 8|0);
         HEAP32[$886>>2] = $721;
         break;
        }
        $887 = HEAP32[$875>>2]|0;
        $888 = ($$0296$i$i|0)==(31);
        $889 = $$0296$i$i >>> 1;
        $890 = (25 - ($889))|0;
        $891 = $888 ? 0 : $890;
        $892 = $$0287$i$i << $891;
        $$0288$i$i = $892;$$0289$i$i = $887;
        while(1) {
         $893 = ((($$0289$i$i)) + 4|0);
         $894 = HEAP32[$893>>2]|0;
         $895 = $894 & -8;
         $896 = ($895|0)==($$0287$i$i|0);
         if ($896) {
          label = 265;
          break;
         }
         $897 = $$0288$i$i >>> 31;
         $898 = (((($$0289$i$i)) + 16|0) + ($897<<2)|0);
         $899 = $$0288$i$i << 1;
         $900 = HEAP32[$898>>2]|0;
         $901 = ($900|0)==(0|0);
         if ($901) {
          label = 262;
          break;
         } else {
          $$0288$i$i = $899;$$0289$i$i = $900;
         }
        }
        if ((label|0) == 262) {
         $902 = HEAP32[(13196)>>2]|0;
         $903 = ($898>>>0)<($902>>>0);
         if ($903) {
          _abort();
          // unreachable;
         } else {
          HEAP32[$898>>2] = $721;
          $904 = ((($721)) + 24|0);
          HEAP32[$904>>2] = $$0289$i$i;
          $905 = ((($721)) + 12|0);
          HEAP32[$905>>2] = $721;
          $906 = ((($721)) + 8|0);
          HEAP32[$906>>2] = $721;
          break;
         }
        }
        else if ((label|0) == 265) {
         $907 = ((($$0289$i$i)) + 8|0);
         $908 = HEAP32[$907>>2]|0;
         $909 = HEAP32[(13196)>>2]|0;
         $910 = ($908>>>0)>=($909>>>0);
         $not$7$i$i = ($$0289$i$i>>>0)>=($909>>>0);
         $911 = $910 & $not$7$i$i;
         if ($911) {
          $912 = ((($908)) + 12|0);
          HEAP32[$912>>2] = $721;
          HEAP32[$907>>2] = $721;
          $913 = ((($721)) + 8|0);
          HEAP32[$913>>2] = $908;
          $914 = ((($721)) + 12|0);
          HEAP32[$914>>2] = $$0289$i$i;
          $915 = ((($721)) + 24|0);
          HEAP32[$915>>2] = 0;
          break;
         } else {
          _abort();
          // unreachable;
         }
        }
       }
      } while(0);
      $1047 = ((($709)) + 8|0);
      $$0 = $1047;
      STACKTOP = sp;return ($$0|0);
     }
    }
    $$0$i$i$i = (13628);
    while(1) {
     $916 = HEAP32[$$0$i$i$i>>2]|0;
     $917 = ($916>>>0)>($630>>>0);
     if (!($917)) {
      $918 = ((($$0$i$i$i)) + 4|0);
      $919 = HEAP32[$918>>2]|0;
      $920 = (($916) + ($919)|0);
      $921 = ($920>>>0)>($630>>>0);
      if ($921) {
       break;
      }
     }
     $922 = ((($$0$i$i$i)) + 8|0);
     $923 = HEAP32[$922>>2]|0;
     $$0$i$i$i = $923;
    }
    $924 = ((($920)) + -47|0);
    $925 = ((($924)) + 8|0);
    $926 = $925;
    $927 = $926 & 7;
    $928 = ($927|0)==(0);
    $929 = (0 - ($926))|0;
    $930 = $929 & 7;
    $931 = $928 ? 0 : $930;
    $932 = (($924) + ($931)|0);
    $933 = ((($630)) + 16|0);
    $934 = ($932>>>0)<($933>>>0);
    $935 = $934 ? $630 : $932;
    $936 = ((($935)) + 8|0);
    $937 = ((($935)) + 24|0);
    $938 = (($$723948$i) + -40)|0;
    $939 = ((($$749$i)) + 8|0);
    $940 = $939;
    $941 = $940 & 7;
    $942 = ($941|0)==(0);
    $943 = (0 - ($940))|0;
    $944 = $943 & 7;
    $945 = $942 ? 0 : $944;
    $946 = (($$749$i) + ($945)|0);
    $947 = (($938) - ($945))|0;
    HEAP32[(13204)>>2] = $946;
    HEAP32[(13192)>>2] = $947;
    $948 = $947 | 1;
    $949 = ((($946)) + 4|0);
    HEAP32[$949>>2] = $948;
    $950 = (($946) + ($947)|0);
    $951 = ((($950)) + 4|0);
    HEAP32[$951>>2] = 40;
    $952 = HEAP32[(13668)>>2]|0;
    HEAP32[(13208)>>2] = $952;
    $953 = ((($935)) + 4|0);
    HEAP32[$953>>2] = 27;
    ;HEAP32[$936>>2]=HEAP32[(13628)>>2]|0;HEAP32[$936+4>>2]=HEAP32[(13628)+4>>2]|0;HEAP32[$936+8>>2]=HEAP32[(13628)+8>>2]|0;HEAP32[$936+12>>2]=HEAP32[(13628)+12>>2]|0;
    HEAP32[(13628)>>2] = $$749$i;
    HEAP32[(13632)>>2] = $$723948$i;
    HEAP32[(13640)>>2] = 0;
    HEAP32[(13636)>>2] = $936;
    $955 = $937;
    while(1) {
     $954 = ((($955)) + 4|0);
     HEAP32[$954>>2] = 7;
     $956 = ((($955)) + 8|0);
     $957 = ($956>>>0)<($920>>>0);
     if ($957) {
      $955 = $954;
     } else {
      break;
     }
    }
    $958 = ($935|0)==($630|0);
    if (!($958)) {
     $959 = $935;
     $960 = $630;
     $961 = (($959) - ($960))|0;
     $962 = HEAP32[$953>>2]|0;
     $963 = $962 & -2;
     HEAP32[$953>>2] = $963;
     $964 = $961 | 1;
     $965 = ((($630)) + 4|0);
     HEAP32[$965>>2] = $964;
     HEAP32[$935>>2] = $961;
     $966 = $961 >>> 3;
     $967 = ($961>>>0)<(256);
     if ($967) {
      $968 = $966 << 1;
      $969 = (13220 + ($968<<2)|0);
      $970 = HEAP32[3295]|0;
      $971 = 1 << $966;
      $972 = $970 & $971;
      $973 = ($972|0)==(0);
      if ($973) {
       $974 = $970 | $971;
       HEAP32[3295] = $974;
       $$pre$i$i = ((($969)) + 8|0);
       $$0211$i$i = $969;$$pre$phi$i$iZ2D = $$pre$i$i;
      } else {
       $975 = ((($969)) + 8|0);
       $976 = HEAP32[$975>>2]|0;
       $977 = HEAP32[(13196)>>2]|0;
       $978 = ($976>>>0)<($977>>>0);
       if ($978) {
        _abort();
        // unreachable;
       } else {
        $$0211$i$i = $976;$$pre$phi$i$iZ2D = $975;
       }
      }
      HEAP32[$$pre$phi$i$iZ2D>>2] = $630;
      $979 = ((($$0211$i$i)) + 12|0);
      HEAP32[$979>>2] = $630;
      $980 = ((($630)) + 8|0);
      HEAP32[$980>>2] = $$0211$i$i;
      $981 = ((($630)) + 12|0);
      HEAP32[$981>>2] = $969;
      break;
     }
     $982 = $961 >>> 8;
     $983 = ($982|0)==(0);
     if ($983) {
      $$0212$i$i = 0;
     } else {
      $984 = ($961>>>0)>(16777215);
      if ($984) {
       $$0212$i$i = 31;
      } else {
       $985 = (($982) + 1048320)|0;
       $986 = $985 >>> 16;
       $987 = $986 & 8;
       $988 = $982 << $987;
       $989 = (($988) + 520192)|0;
       $990 = $989 >>> 16;
       $991 = $990 & 4;
       $992 = $991 | $987;
       $993 = $988 << $991;
       $994 = (($993) + 245760)|0;
       $995 = $994 >>> 16;
       $996 = $995 & 2;
       $997 = $992 | $996;
       $998 = (14 - ($997))|0;
       $999 = $993 << $996;
       $1000 = $999 >>> 15;
       $1001 = (($998) + ($1000))|0;
       $1002 = $1001 << 1;
       $1003 = (($1001) + 7)|0;
       $1004 = $961 >>> $1003;
       $1005 = $1004 & 1;
       $1006 = $1005 | $1002;
       $$0212$i$i = $1006;
      }
     }
     $1007 = (13484 + ($$0212$i$i<<2)|0);
     $1008 = ((($630)) + 28|0);
     HEAP32[$1008>>2] = $$0212$i$i;
     $1009 = ((($630)) + 20|0);
     HEAP32[$1009>>2] = 0;
     HEAP32[$933>>2] = 0;
     $1010 = HEAP32[(13184)>>2]|0;
     $1011 = 1 << $$0212$i$i;
     $1012 = $1010 & $1011;
     $1013 = ($1012|0)==(0);
     if ($1013) {
      $1014 = $1010 | $1011;
      HEAP32[(13184)>>2] = $1014;
      HEAP32[$1007>>2] = $630;
      $1015 = ((($630)) + 24|0);
      HEAP32[$1015>>2] = $1007;
      $1016 = ((($630)) + 12|0);
      HEAP32[$1016>>2] = $630;
      $1017 = ((($630)) + 8|0);
      HEAP32[$1017>>2] = $630;
      break;
     }
     $1018 = HEAP32[$1007>>2]|0;
     $1019 = ($$0212$i$i|0)==(31);
     $1020 = $$0212$i$i >>> 1;
     $1021 = (25 - ($1020))|0;
     $1022 = $1019 ? 0 : $1021;
     $1023 = $961 << $1022;
     $$0206$i$i = $1023;$$0207$i$i = $1018;
     while(1) {
      $1024 = ((($$0207$i$i)) + 4|0);
      $1025 = HEAP32[$1024>>2]|0;
      $1026 = $1025 & -8;
      $1027 = ($1026|0)==($961|0);
      if ($1027) {
       label = 292;
       break;
      }
      $1028 = $$0206$i$i >>> 31;
      $1029 = (((($$0207$i$i)) + 16|0) + ($1028<<2)|0);
      $1030 = $$0206$i$i << 1;
      $1031 = HEAP32[$1029>>2]|0;
      $1032 = ($1031|0)==(0|0);
      if ($1032) {
       label = 289;
       break;
      } else {
       $$0206$i$i = $1030;$$0207$i$i = $1031;
      }
     }
     if ((label|0) == 289) {
      $1033 = HEAP32[(13196)>>2]|0;
      $1034 = ($1029>>>0)<($1033>>>0);
      if ($1034) {
       _abort();
       // unreachable;
      } else {
       HEAP32[$1029>>2] = $630;
       $1035 = ((($630)) + 24|0);
       HEAP32[$1035>>2] = $$0207$i$i;
       $1036 = ((($630)) + 12|0);
       HEAP32[$1036>>2] = $630;
       $1037 = ((($630)) + 8|0);
       HEAP32[$1037>>2] = $630;
       break;
      }
     }
     else if ((label|0) == 292) {
      $1038 = ((($$0207$i$i)) + 8|0);
      $1039 = HEAP32[$1038>>2]|0;
      $1040 = HEAP32[(13196)>>2]|0;
      $1041 = ($1039>>>0)>=($1040>>>0);
      $not$$i$i = ($$0207$i$i>>>0)>=($1040>>>0);
      $1042 = $1041 & $not$$i$i;
      if ($1042) {
       $1043 = ((($1039)) + 12|0);
       HEAP32[$1043>>2] = $630;
       HEAP32[$1038>>2] = $630;
       $1044 = ((($630)) + 8|0);
       HEAP32[$1044>>2] = $1039;
       $1045 = ((($630)) + 12|0);
       HEAP32[$1045>>2] = $$0207$i$i;
       $1046 = ((($630)) + 24|0);
       HEAP32[$1046>>2] = 0;
       break;
      } else {
       _abort();
       // unreachable;
      }
     }
    }
   }
  } while(0);
  $1048 = HEAP32[(13192)>>2]|0;
  $1049 = ($1048>>>0)>($$0197>>>0);
  if ($1049) {
   $1050 = (($1048) - ($$0197))|0;
   HEAP32[(13192)>>2] = $1050;
   $1051 = HEAP32[(13204)>>2]|0;
   $1052 = (($1051) + ($$0197)|0);
   HEAP32[(13204)>>2] = $1052;
   $1053 = $1050 | 1;
   $1054 = ((($1052)) + 4|0);
   HEAP32[$1054>>2] = $1053;
   $1055 = $$0197 | 3;
   $1056 = ((($1051)) + 4|0);
   HEAP32[$1056>>2] = $1055;
   $1057 = ((($1051)) + 8|0);
   $$0 = $1057;
   STACKTOP = sp;return ($$0|0);
  }
 }
 $1058 = (___errno_location()|0);
 HEAP32[$1058>>2] = 12;
 $$0 = 0;
 STACKTOP = sp;return ($$0|0);
}
function _free($0) {
 $0 = $0|0;
 var $$0212$i = 0, $$0212$in$i = 0, $$0383 = 0, $$0384 = 0, $$0396 = 0, $$0403 = 0, $$1 = 0, $$1382 = 0, $$1387 = 0, $$1390 = 0, $$1398 = 0, $$1402 = 0, $$2 = 0, $$3 = 0, $$3400 = 0, $$pre = 0, $$pre$phi443Z2D = 0, $$pre$phi445Z2D = 0, $$pre$phiZ2D = 0, $$pre442 = 0;
 var $$pre444 = 0, $$sink3 = 0, $$sink5 = 0, $1 = 0, $10 = 0, $100 = 0, $101 = 0, $102 = 0, $103 = 0, $104 = 0, $105 = 0, $106 = 0, $107 = 0, $108 = 0, $109 = 0, $11 = 0, $110 = 0, $111 = 0, $112 = 0, $113 = 0;
 var $114 = 0, $115 = 0, $116 = 0, $117 = 0, $118 = 0, $119 = 0, $12 = 0, $120 = 0, $121 = 0, $122 = 0, $123 = 0, $124 = 0, $125 = 0, $126 = 0, $127 = 0, $128 = 0, $129 = 0, $13 = 0, $130 = 0, $131 = 0;
 var $132 = 0, $133 = 0, $134 = 0, $135 = 0, $136 = 0, $137 = 0, $138 = 0, $139 = 0, $14 = 0, $140 = 0, $141 = 0, $142 = 0, $143 = 0, $144 = 0, $145 = 0, $146 = 0, $147 = 0, $148 = 0, $149 = 0, $15 = 0;
 var $150 = 0, $151 = 0, $152 = 0, $153 = 0, $154 = 0, $155 = 0, $156 = 0, $157 = 0, $158 = 0, $159 = 0, $16 = 0, $160 = 0, $161 = 0, $162 = 0, $163 = 0, $164 = 0, $165 = 0, $166 = 0, $167 = 0, $168 = 0;
 var $169 = 0, $17 = 0, $170 = 0, $171 = 0, $172 = 0, $173 = 0, $174 = 0, $175 = 0, $176 = 0, $177 = 0, $178 = 0, $179 = 0, $18 = 0, $180 = 0, $181 = 0, $182 = 0, $183 = 0, $184 = 0, $185 = 0, $186 = 0;
 var $187 = 0, $188 = 0, $189 = 0, $19 = 0, $190 = 0, $191 = 0, $192 = 0, $193 = 0, $194 = 0, $195 = 0, $196 = 0, $197 = 0, $198 = 0, $199 = 0, $2 = 0, $20 = 0, $200 = 0, $201 = 0, $202 = 0, $203 = 0;
 var $204 = 0, $205 = 0, $206 = 0, $207 = 0, $208 = 0, $209 = 0, $21 = 0, $210 = 0, $211 = 0, $212 = 0, $213 = 0, $214 = 0, $215 = 0, $216 = 0, $217 = 0, $218 = 0, $219 = 0, $22 = 0, $220 = 0, $221 = 0;
 var $222 = 0, $223 = 0, $224 = 0, $225 = 0, $226 = 0, $227 = 0, $228 = 0, $229 = 0, $23 = 0, $230 = 0, $231 = 0, $232 = 0, $233 = 0, $234 = 0, $235 = 0, $236 = 0, $237 = 0, $238 = 0, $239 = 0, $24 = 0;
 var $240 = 0, $241 = 0, $242 = 0, $243 = 0, $244 = 0, $245 = 0, $246 = 0, $247 = 0, $248 = 0, $249 = 0, $25 = 0, $250 = 0, $251 = 0, $252 = 0, $253 = 0, $254 = 0, $255 = 0, $256 = 0, $257 = 0, $258 = 0;
 var $259 = 0, $26 = 0, $260 = 0, $261 = 0, $262 = 0, $263 = 0, $264 = 0, $265 = 0, $266 = 0, $267 = 0, $268 = 0, $269 = 0, $27 = 0, $270 = 0, $271 = 0, $272 = 0, $273 = 0, $274 = 0, $275 = 0, $276 = 0;
 var $277 = 0, $278 = 0, $279 = 0, $28 = 0, $280 = 0, $281 = 0, $282 = 0, $283 = 0, $284 = 0, $285 = 0, $286 = 0, $287 = 0, $288 = 0, $289 = 0, $29 = 0, $290 = 0, $291 = 0, $292 = 0, $293 = 0, $294 = 0;
 var $295 = 0, $296 = 0, $297 = 0, $298 = 0, $299 = 0, $3 = 0, $30 = 0, $300 = 0, $301 = 0, $302 = 0, $303 = 0, $304 = 0, $305 = 0, $306 = 0, $307 = 0, $308 = 0, $309 = 0, $31 = 0, $310 = 0, $311 = 0;
 var $312 = 0, $313 = 0, $314 = 0, $315 = 0, $316 = 0, $317 = 0, $318 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0;
 var $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0;
 var $62 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0, $67 = 0, $68 = 0, $69 = 0, $7 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $78 = 0, $79 = 0, $8 = 0;
 var $80 = 0, $81 = 0, $82 = 0, $83 = 0, $84 = 0, $85 = 0, $86 = 0, $87 = 0, $88 = 0, $89 = 0, $9 = 0, $90 = 0, $91 = 0, $92 = 0, $93 = 0, $94 = 0, $95 = 0, $96 = 0, $97 = 0, $98 = 0;
 var $99 = 0, $cond421 = 0, $cond422 = 0, $not$ = 0, $not$405 = 0, $not$437 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = ($0|0)==(0|0);
 if ($1) {
  return;
 }
 $2 = ((($0)) + -8|0);
 $3 = HEAP32[(13196)>>2]|0;
 $4 = ($2>>>0)<($3>>>0);
 if ($4) {
  _abort();
  // unreachable;
 }
 $5 = ((($0)) + -4|0);
 $6 = HEAP32[$5>>2]|0;
 $7 = $6 & 3;
 $8 = ($7|0)==(1);
 if ($8) {
  _abort();
  // unreachable;
 }
 $9 = $6 & -8;
 $10 = (($2) + ($9)|0);
 $11 = $6 & 1;
 $12 = ($11|0)==(0);
 L10: do {
  if ($12) {
   $13 = HEAP32[$2>>2]|0;
   $14 = ($7|0)==(0);
   if ($14) {
    return;
   }
   $15 = (0 - ($13))|0;
   $16 = (($2) + ($15)|0);
   $17 = (($13) + ($9))|0;
   $18 = ($16>>>0)<($3>>>0);
   if ($18) {
    _abort();
    // unreachable;
   }
   $19 = HEAP32[(13200)>>2]|0;
   $20 = ($16|0)==($19|0);
   if ($20) {
    $104 = ((($10)) + 4|0);
    $105 = HEAP32[$104>>2]|0;
    $106 = $105 & 3;
    $107 = ($106|0)==(3);
    if (!($107)) {
     $$1 = $16;$$1382 = $17;$113 = $16;
     break;
    }
    $108 = (($16) + ($17)|0);
    $109 = ((($16)) + 4|0);
    $110 = $17 | 1;
    $111 = $105 & -2;
    HEAP32[(13188)>>2] = $17;
    HEAP32[$104>>2] = $111;
    HEAP32[$109>>2] = $110;
    HEAP32[$108>>2] = $17;
    return;
   }
   $21 = $13 >>> 3;
   $22 = ($13>>>0)<(256);
   if ($22) {
    $23 = ((($16)) + 8|0);
    $24 = HEAP32[$23>>2]|0;
    $25 = ((($16)) + 12|0);
    $26 = HEAP32[$25>>2]|0;
    $27 = $21 << 1;
    $28 = (13220 + ($27<<2)|0);
    $29 = ($24|0)==($28|0);
    if (!($29)) {
     $30 = ($24>>>0)<($3>>>0);
     if ($30) {
      _abort();
      // unreachable;
     }
     $31 = ((($24)) + 12|0);
     $32 = HEAP32[$31>>2]|0;
     $33 = ($32|0)==($16|0);
     if (!($33)) {
      _abort();
      // unreachable;
     }
    }
    $34 = ($26|0)==($24|0);
    if ($34) {
     $35 = 1 << $21;
     $36 = $35 ^ -1;
     $37 = HEAP32[3295]|0;
     $38 = $37 & $36;
     HEAP32[3295] = $38;
     $$1 = $16;$$1382 = $17;$113 = $16;
     break;
    }
    $39 = ($26|0)==($28|0);
    if ($39) {
     $$pre444 = ((($26)) + 8|0);
     $$pre$phi445Z2D = $$pre444;
    } else {
     $40 = ($26>>>0)<($3>>>0);
     if ($40) {
      _abort();
      // unreachable;
     }
     $41 = ((($26)) + 8|0);
     $42 = HEAP32[$41>>2]|0;
     $43 = ($42|0)==($16|0);
     if ($43) {
      $$pre$phi445Z2D = $41;
     } else {
      _abort();
      // unreachable;
     }
    }
    $44 = ((($24)) + 12|0);
    HEAP32[$44>>2] = $26;
    HEAP32[$$pre$phi445Z2D>>2] = $24;
    $$1 = $16;$$1382 = $17;$113 = $16;
    break;
   }
   $45 = ((($16)) + 24|0);
   $46 = HEAP32[$45>>2]|0;
   $47 = ((($16)) + 12|0);
   $48 = HEAP32[$47>>2]|0;
   $49 = ($48|0)==($16|0);
   do {
    if ($49) {
     $59 = ((($16)) + 16|0);
     $60 = ((($59)) + 4|0);
     $61 = HEAP32[$60>>2]|0;
     $62 = ($61|0)==(0|0);
     if ($62) {
      $63 = HEAP32[$59>>2]|0;
      $64 = ($63|0)==(0|0);
      if ($64) {
       $$3 = 0;
       break;
      } else {
       $$1387 = $63;$$1390 = $59;
      }
     } else {
      $$1387 = $61;$$1390 = $60;
     }
     while(1) {
      $65 = ((($$1387)) + 20|0);
      $66 = HEAP32[$65>>2]|0;
      $67 = ($66|0)==(0|0);
      if (!($67)) {
       $$1387 = $66;$$1390 = $65;
       continue;
      }
      $68 = ((($$1387)) + 16|0);
      $69 = HEAP32[$68>>2]|0;
      $70 = ($69|0)==(0|0);
      if ($70) {
       break;
      } else {
       $$1387 = $69;$$1390 = $68;
      }
     }
     $71 = ($$1390>>>0)<($3>>>0);
     if ($71) {
      _abort();
      // unreachable;
     } else {
      HEAP32[$$1390>>2] = 0;
      $$3 = $$1387;
      break;
     }
    } else {
     $50 = ((($16)) + 8|0);
     $51 = HEAP32[$50>>2]|0;
     $52 = ($51>>>0)<($3>>>0);
     if ($52) {
      _abort();
      // unreachable;
     }
     $53 = ((($51)) + 12|0);
     $54 = HEAP32[$53>>2]|0;
     $55 = ($54|0)==($16|0);
     if (!($55)) {
      _abort();
      // unreachable;
     }
     $56 = ((($48)) + 8|0);
     $57 = HEAP32[$56>>2]|0;
     $58 = ($57|0)==($16|0);
     if ($58) {
      HEAP32[$53>>2] = $48;
      HEAP32[$56>>2] = $51;
      $$3 = $48;
      break;
     } else {
      _abort();
      // unreachable;
     }
    }
   } while(0);
   $72 = ($46|0)==(0|0);
   if ($72) {
    $$1 = $16;$$1382 = $17;$113 = $16;
   } else {
    $73 = ((($16)) + 28|0);
    $74 = HEAP32[$73>>2]|0;
    $75 = (13484 + ($74<<2)|0);
    $76 = HEAP32[$75>>2]|0;
    $77 = ($16|0)==($76|0);
    do {
     if ($77) {
      HEAP32[$75>>2] = $$3;
      $cond421 = ($$3|0)==(0|0);
      if ($cond421) {
       $78 = 1 << $74;
       $79 = $78 ^ -1;
       $80 = HEAP32[(13184)>>2]|0;
       $81 = $80 & $79;
       HEAP32[(13184)>>2] = $81;
       $$1 = $16;$$1382 = $17;$113 = $16;
       break L10;
      }
     } else {
      $82 = HEAP32[(13196)>>2]|0;
      $83 = ($46>>>0)<($82>>>0);
      if ($83) {
       _abort();
       // unreachable;
      } else {
       $84 = ((($46)) + 16|0);
       $85 = HEAP32[$84>>2]|0;
       $not$405 = ($85|0)!=($16|0);
       $$sink3 = $not$405&1;
       $86 = (((($46)) + 16|0) + ($$sink3<<2)|0);
       HEAP32[$86>>2] = $$3;
       $87 = ($$3|0)==(0|0);
       if ($87) {
        $$1 = $16;$$1382 = $17;$113 = $16;
        break L10;
       } else {
        break;
       }
      }
     }
    } while(0);
    $88 = HEAP32[(13196)>>2]|0;
    $89 = ($$3>>>0)<($88>>>0);
    if ($89) {
     _abort();
     // unreachable;
    }
    $90 = ((($$3)) + 24|0);
    HEAP32[$90>>2] = $46;
    $91 = ((($16)) + 16|0);
    $92 = HEAP32[$91>>2]|0;
    $93 = ($92|0)==(0|0);
    do {
     if (!($93)) {
      $94 = ($92>>>0)<($88>>>0);
      if ($94) {
       _abort();
       // unreachable;
      } else {
       $95 = ((($$3)) + 16|0);
       HEAP32[$95>>2] = $92;
       $96 = ((($92)) + 24|0);
       HEAP32[$96>>2] = $$3;
       break;
      }
     }
    } while(0);
    $97 = ((($91)) + 4|0);
    $98 = HEAP32[$97>>2]|0;
    $99 = ($98|0)==(0|0);
    if ($99) {
     $$1 = $16;$$1382 = $17;$113 = $16;
    } else {
     $100 = HEAP32[(13196)>>2]|0;
     $101 = ($98>>>0)<($100>>>0);
     if ($101) {
      _abort();
      // unreachable;
     } else {
      $102 = ((($$3)) + 20|0);
      HEAP32[$102>>2] = $98;
      $103 = ((($98)) + 24|0);
      HEAP32[$103>>2] = $$3;
      $$1 = $16;$$1382 = $17;$113 = $16;
      break;
     }
    }
   }
  } else {
   $$1 = $2;$$1382 = $9;$113 = $2;
  }
 } while(0);
 $112 = ($113>>>0)<($10>>>0);
 if (!($112)) {
  _abort();
  // unreachable;
 }
 $114 = ((($10)) + 4|0);
 $115 = HEAP32[$114>>2]|0;
 $116 = $115 & 1;
 $117 = ($116|0)==(0);
 if ($117) {
  _abort();
  // unreachable;
 }
 $118 = $115 & 2;
 $119 = ($118|0)==(0);
 if ($119) {
  $120 = HEAP32[(13204)>>2]|0;
  $121 = ($10|0)==($120|0);
  $122 = HEAP32[(13200)>>2]|0;
  if ($121) {
   $123 = HEAP32[(13192)>>2]|0;
   $124 = (($123) + ($$1382))|0;
   HEAP32[(13192)>>2] = $124;
   HEAP32[(13204)>>2] = $$1;
   $125 = $124 | 1;
   $126 = ((($$1)) + 4|0);
   HEAP32[$126>>2] = $125;
   $127 = ($$1|0)==($122|0);
   if (!($127)) {
    return;
   }
   HEAP32[(13200)>>2] = 0;
   HEAP32[(13188)>>2] = 0;
   return;
  }
  $128 = ($10|0)==($122|0);
  if ($128) {
   $129 = HEAP32[(13188)>>2]|0;
   $130 = (($129) + ($$1382))|0;
   HEAP32[(13188)>>2] = $130;
   HEAP32[(13200)>>2] = $113;
   $131 = $130 | 1;
   $132 = ((($$1)) + 4|0);
   HEAP32[$132>>2] = $131;
   $133 = (($113) + ($130)|0);
   HEAP32[$133>>2] = $130;
   return;
  }
  $134 = $115 & -8;
  $135 = (($134) + ($$1382))|0;
  $136 = $115 >>> 3;
  $137 = ($115>>>0)<(256);
  L108: do {
   if ($137) {
    $138 = ((($10)) + 8|0);
    $139 = HEAP32[$138>>2]|0;
    $140 = ((($10)) + 12|0);
    $141 = HEAP32[$140>>2]|0;
    $142 = $136 << 1;
    $143 = (13220 + ($142<<2)|0);
    $144 = ($139|0)==($143|0);
    if (!($144)) {
     $145 = HEAP32[(13196)>>2]|0;
     $146 = ($139>>>0)<($145>>>0);
     if ($146) {
      _abort();
      // unreachable;
     }
     $147 = ((($139)) + 12|0);
     $148 = HEAP32[$147>>2]|0;
     $149 = ($148|0)==($10|0);
     if (!($149)) {
      _abort();
      // unreachable;
     }
    }
    $150 = ($141|0)==($139|0);
    if ($150) {
     $151 = 1 << $136;
     $152 = $151 ^ -1;
     $153 = HEAP32[3295]|0;
     $154 = $153 & $152;
     HEAP32[3295] = $154;
     break;
    }
    $155 = ($141|0)==($143|0);
    if ($155) {
     $$pre442 = ((($141)) + 8|0);
     $$pre$phi443Z2D = $$pre442;
    } else {
     $156 = HEAP32[(13196)>>2]|0;
     $157 = ($141>>>0)<($156>>>0);
     if ($157) {
      _abort();
      // unreachable;
     }
     $158 = ((($141)) + 8|0);
     $159 = HEAP32[$158>>2]|0;
     $160 = ($159|0)==($10|0);
     if ($160) {
      $$pre$phi443Z2D = $158;
     } else {
      _abort();
      // unreachable;
     }
    }
    $161 = ((($139)) + 12|0);
    HEAP32[$161>>2] = $141;
    HEAP32[$$pre$phi443Z2D>>2] = $139;
   } else {
    $162 = ((($10)) + 24|0);
    $163 = HEAP32[$162>>2]|0;
    $164 = ((($10)) + 12|0);
    $165 = HEAP32[$164>>2]|0;
    $166 = ($165|0)==($10|0);
    do {
     if ($166) {
      $177 = ((($10)) + 16|0);
      $178 = ((($177)) + 4|0);
      $179 = HEAP32[$178>>2]|0;
      $180 = ($179|0)==(0|0);
      if ($180) {
       $181 = HEAP32[$177>>2]|0;
       $182 = ($181|0)==(0|0);
       if ($182) {
        $$3400 = 0;
        break;
       } else {
        $$1398 = $181;$$1402 = $177;
       }
      } else {
       $$1398 = $179;$$1402 = $178;
      }
      while(1) {
       $183 = ((($$1398)) + 20|0);
       $184 = HEAP32[$183>>2]|0;
       $185 = ($184|0)==(0|0);
       if (!($185)) {
        $$1398 = $184;$$1402 = $183;
        continue;
       }
       $186 = ((($$1398)) + 16|0);
       $187 = HEAP32[$186>>2]|0;
       $188 = ($187|0)==(0|0);
       if ($188) {
        break;
       } else {
        $$1398 = $187;$$1402 = $186;
       }
      }
      $189 = HEAP32[(13196)>>2]|0;
      $190 = ($$1402>>>0)<($189>>>0);
      if ($190) {
       _abort();
       // unreachable;
      } else {
       HEAP32[$$1402>>2] = 0;
       $$3400 = $$1398;
       break;
      }
     } else {
      $167 = ((($10)) + 8|0);
      $168 = HEAP32[$167>>2]|0;
      $169 = HEAP32[(13196)>>2]|0;
      $170 = ($168>>>0)<($169>>>0);
      if ($170) {
       _abort();
       // unreachable;
      }
      $171 = ((($168)) + 12|0);
      $172 = HEAP32[$171>>2]|0;
      $173 = ($172|0)==($10|0);
      if (!($173)) {
       _abort();
       // unreachable;
      }
      $174 = ((($165)) + 8|0);
      $175 = HEAP32[$174>>2]|0;
      $176 = ($175|0)==($10|0);
      if ($176) {
       HEAP32[$171>>2] = $165;
       HEAP32[$174>>2] = $168;
       $$3400 = $165;
       break;
      } else {
       _abort();
       // unreachable;
      }
     }
    } while(0);
    $191 = ($163|0)==(0|0);
    if (!($191)) {
     $192 = ((($10)) + 28|0);
     $193 = HEAP32[$192>>2]|0;
     $194 = (13484 + ($193<<2)|0);
     $195 = HEAP32[$194>>2]|0;
     $196 = ($10|0)==($195|0);
     do {
      if ($196) {
       HEAP32[$194>>2] = $$3400;
       $cond422 = ($$3400|0)==(0|0);
       if ($cond422) {
        $197 = 1 << $193;
        $198 = $197 ^ -1;
        $199 = HEAP32[(13184)>>2]|0;
        $200 = $199 & $198;
        HEAP32[(13184)>>2] = $200;
        break L108;
       }
      } else {
       $201 = HEAP32[(13196)>>2]|0;
       $202 = ($163>>>0)<($201>>>0);
       if ($202) {
        _abort();
        // unreachable;
       } else {
        $203 = ((($163)) + 16|0);
        $204 = HEAP32[$203>>2]|0;
        $not$ = ($204|0)!=($10|0);
        $$sink5 = $not$&1;
        $205 = (((($163)) + 16|0) + ($$sink5<<2)|0);
        HEAP32[$205>>2] = $$3400;
        $206 = ($$3400|0)==(0|0);
        if ($206) {
         break L108;
        } else {
         break;
        }
       }
      }
     } while(0);
     $207 = HEAP32[(13196)>>2]|0;
     $208 = ($$3400>>>0)<($207>>>0);
     if ($208) {
      _abort();
      // unreachable;
     }
     $209 = ((($$3400)) + 24|0);
     HEAP32[$209>>2] = $163;
     $210 = ((($10)) + 16|0);
     $211 = HEAP32[$210>>2]|0;
     $212 = ($211|0)==(0|0);
     do {
      if (!($212)) {
       $213 = ($211>>>0)<($207>>>0);
       if ($213) {
        _abort();
        // unreachable;
       } else {
        $214 = ((($$3400)) + 16|0);
        HEAP32[$214>>2] = $211;
        $215 = ((($211)) + 24|0);
        HEAP32[$215>>2] = $$3400;
        break;
       }
      }
     } while(0);
     $216 = ((($210)) + 4|0);
     $217 = HEAP32[$216>>2]|0;
     $218 = ($217|0)==(0|0);
     if (!($218)) {
      $219 = HEAP32[(13196)>>2]|0;
      $220 = ($217>>>0)<($219>>>0);
      if ($220) {
       _abort();
       // unreachable;
      } else {
       $221 = ((($$3400)) + 20|0);
       HEAP32[$221>>2] = $217;
       $222 = ((($217)) + 24|0);
       HEAP32[$222>>2] = $$3400;
       break;
      }
     }
    }
   }
  } while(0);
  $223 = $135 | 1;
  $224 = ((($$1)) + 4|0);
  HEAP32[$224>>2] = $223;
  $225 = (($113) + ($135)|0);
  HEAP32[$225>>2] = $135;
  $226 = HEAP32[(13200)>>2]|0;
  $227 = ($$1|0)==($226|0);
  if ($227) {
   HEAP32[(13188)>>2] = $135;
   return;
  } else {
   $$2 = $135;
  }
 } else {
  $228 = $115 & -2;
  HEAP32[$114>>2] = $228;
  $229 = $$1382 | 1;
  $230 = ((($$1)) + 4|0);
  HEAP32[$230>>2] = $229;
  $231 = (($113) + ($$1382)|0);
  HEAP32[$231>>2] = $$1382;
  $$2 = $$1382;
 }
 $232 = $$2 >>> 3;
 $233 = ($$2>>>0)<(256);
 if ($233) {
  $234 = $232 << 1;
  $235 = (13220 + ($234<<2)|0);
  $236 = HEAP32[3295]|0;
  $237 = 1 << $232;
  $238 = $236 & $237;
  $239 = ($238|0)==(0);
  if ($239) {
   $240 = $236 | $237;
   HEAP32[3295] = $240;
   $$pre = ((($235)) + 8|0);
   $$0403 = $235;$$pre$phiZ2D = $$pre;
  } else {
   $241 = ((($235)) + 8|0);
   $242 = HEAP32[$241>>2]|0;
   $243 = HEAP32[(13196)>>2]|0;
   $244 = ($242>>>0)<($243>>>0);
   if ($244) {
    _abort();
    // unreachable;
   } else {
    $$0403 = $242;$$pre$phiZ2D = $241;
   }
  }
  HEAP32[$$pre$phiZ2D>>2] = $$1;
  $245 = ((($$0403)) + 12|0);
  HEAP32[$245>>2] = $$1;
  $246 = ((($$1)) + 8|0);
  HEAP32[$246>>2] = $$0403;
  $247 = ((($$1)) + 12|0);
  HEAP32[$247>>2] = $235;
  return;
 }
 $248 = $$2 >>> 8;
 $249 = ($248|0)==(0);
 if ($249) {
  $$0396 = 0;
 } else {
  $250 = ($$2>>>0)>(16777215);
  if ($250) {
   $$0396 = 31;
  } else {
   $251 = (($248) + 1048320)|0;
   $252 = $251 >>> 16;
   $253 = $252 & 8;
   $254 = $248 << $253;
   $255 = (($254) + 520192)|0;
   $256 = $255 >>> 16;
   $257 = $256 & 4;
   $258 = $257 | $253;
   $259 = $254 << $257;
   $260 = (($259) + 245760)|0;
   $261 = $260 >>> 16;
   $262 = $261 & 2;
   $263 = $258 | $262;
   $264 = (14 - ($263))|0;
   $265 = $259 << $262;
   $266 = $265 >>> 15;
   $267 = (($264) + ($266))|0;
   $268 = $267 << 1;
   $269 = (($267) + 7)|0;
   $270 = $$2 >>> $269;
   $271 = $270 & 1;
   $272 = $271 | $268;
   $$0396 = $272;
  }
 }
 $273 = (13484 + ($$0396<<2)|0);
 $274 = ((($$1)) + 28|0);
 HEAP32[$274>>2] = $$0396;
 $275 = ((($$1)) + 16|0);
 $276 = ((($$1)) + 20|0);
 HEAP32[$276>>2] = 0;
 HEAP32[$275>>2] = 0;
 $277 = HEAP32[(13184)>>2]|0;
 $278 = 1 << $$0396;
 $279 = $277 & $278;
 $280 = ($279|0)==(0);
 do {
  if ($280) {
   $281 = $277 | $278;
   HEAP32[(13184)>>2] = $281;
   HEAP32[$273>>2] = $$1;
   $282 = ((($$1)) + 24|0);
   HEAP32[$282>>2] = $273;
   $283 = ((($$1)) + 12|0);
   HEAP32[$283>>2] = $$1;
   $284 = ((($$1)) + 8|0);
   HEAP32[$284>>2] = $$1;
  } else {
   $285 = HEAP32[$273>>2]|0;
   $286 = ($$0396|0)==(31);
   $287 = $$0396 >>> 1;
   $288 = (25 - ($287))|0;
   $289 = $286 ? 0 : $288;
   $290 = $$2 << $289;
   $$0383 = $290;$$0384 = $285;
   while(1) {
    $291 = ((($$0384)) + 4|0);
    $292 = HEAP32[$291>>2]|0;
    $293 = $292 & -8;
    $294 = ($293|0)==($$2|0);
    if ($294) {
     label = 124;
     break;
    }
    $295 = $$0383 >>> 31;
    $296 = (((($$0384)) + 16|0) + ($295<<2)|0);
    $297 = $$0383 << 1;
    $298 = HEAP32[$296>>2]|0;
    $299 = ($298|0)==(0|0);
    if ($299) {
     label = 121;
     break;
    } else {
     $$0383 = $297;$$0384 = $298;
    }
   }
   if ((label|0) == 121) {
    $300 = HEAP32[(13196)>>2]|0;
    $301 = ($296>>>0)<($300>>>0);
    if ($301) {
     _abort();
     // unreachable;
    } else {
     HEAP32[$296>>2] = $$1;
     $302 = ((($$1)) + 24|0);
     HEAP32[$302>>2] = $$0384;
     $303 = ((($$1)) + 12|0);
     HEAP32[$303>>2] = $$1;
     $304 = ((($$1)) + 8|0);
     HEAP32[$304>>2] = $$1;
     break;
    }
   }
   else if ((label|0) == 124) {
    $305 = ((($$0384)) + 8|0);
    $306 = HEAP32[$305>>2]|0;
    $307 = HEAP32[(13196)>>2]|0;
    $308 = ($306>>>0)>=($307>>>0);
    $not$437 = ($$0384>>>0)>=($307>>>0);
    $309 = $308 & $not$437;
    if ($309) {
     $310 = ((($306)) + 12|0);
     HEAP32[$310>>2] = $$1;
     HEAP32[$305>>2] = $$1;
     $311 = ((($$1)) + 8|0);
     HEAP32[$311>>2] = $306;
     $312 = ((($$1)) + 12|0);
     HEAP32[$312>>2] = $$0384;
     $313 = ((($$1)) + 24|0);
     HEAP32[$313>>2] = 0;
     break;
    } else {
     _abort();
     // unreachable;
    }
   }
  }
 } while(0);
 $314 = HEAP32[(13212)>>2]|0;
 $315 = (($314) + -1)|0;
 HEAP32[(13212)>>2] = $315;
 $316 = ($315|0)==(0);
 if ($316) {
  $$0212$in$i = (13636);
 } else {
  return;
 }
 while(1) {
  $$0212$i = HEAP32[$$0212$in$i>>2]|0;
  $317 = ($$0212$i|0)==(0|0);
  $318 = ((($$0212$i)) + 8|0);
  if ($317) {
   break;
  } else {
   $$0212$in$i = $318;
  }
 }
 HEAP32[(13212)>>2] = -1;
 return;
}
function _emscripten_get_global_libc() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (13676|0);
}
function ___stdio_close($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $vararg_buffer = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $vararg_buffer = sp;
 $1 = ((($0)) + 60|0);
 $2 = HEAP32[$1>>2]|0;
 $3 = (_dummy_570($2)|0);
 HEAP32[$vararg_buffer>>2] = $3;
 $4 = (___syscall6(6,($vararg_buffer|0))|0);
 $5 = (___syscall_ret($4)|0);
 STACKTOP = sp;return ($5|0);
}
function ___stdio_write($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $$0 = 0, $$04756 = 0, $$04855 = 0, $$04954 = 0, $$051 = 0, $$1 = 0, $$150 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0;
 var $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0;
 var $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $vararg_buffer = 0, $vararg_buffer3 = 0, $vararg_ptr1 = 0, $vararg_ptr2 = 0, $vararg_ptr6 = 0;
 var $vararg_ptr7 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 48|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(48|0);
 $vararg_buffer3 = sp + 16|0;
 $vararg_buffer = sp;
 $3 = sp + 32|0;
 $4 = ((($0)) + 28|0);
 $5 = HEAP32[$4>>2]|0;
 HEAP32[$3>>2] = $5;
 $6 = ((($3)) + 4|0);
 $7 = ((($0)) + 20|0);
 $8 = HEAP32[$7>>2]|0;
 $9 = (($8) - ($5))|0;
 HEAP32[$6>>2] = $9;
 $10 = ((($3)) + 8|0);
 HEAP32[$10>>2] = $1;
 $11 = ((($3)) + 12|0);
 HEAP32[$11>>2] = $2;
 $12 = (($9) + ($2))|0;
 $13 = ((($0)) + 60|0);
 $14 = HEAP32[$13>>2]|0;
 $15 = $3;
 HEAP32[$vararg_buffer>>2] = $14;
 $vararg_ptr1 = ((($vararg_buffer)) + 4|0);
 HEAP32[$vararg_ptr1>>2] = $15;
 $vararg_ptr2 = ((($vararg_buffer)) + 8|0);
 HEAP32[$vararg_ptr2>>2] = 2;
 $16 = (___syscall146(146,($vararg_buffer|0))|0);
 $17 = (___syscall_ret($16)|0);
 $18 = ($12|0)==($17|0);
 L1: do {
  if ($18) {
   label = 3;
  } else {
   $$04756 = 2;$$04855 = $12;$$04954 = $3;$26 = $17;
   while(1) {
    $25 = ($26|0)<(0);
    if ($25) {
     break;
    }
    $34 = (($$04855) - ($26))|0;
    $35 = ((($$04954)) + 4|0);
    $36 = HEAP32[$35>>2]|0;
    $37 = ($26>>>0)>($36>>>0);
    $38 = ((($$04954)) + 8|0);
    $$150 = $37 ? $38 : $$04954;
    $39 = $37 << 31 >> 31;
    $$1 = (($39) + ($$04756))|0;
    $40 = $37 ? $36 : 0;
    $$0 = (($26) - ($40))|0;
    $41 = HEAP32[$$150>>2]|0;
    $42 = (($41) + ($$0)|0);
    HEAP32[$$150>>2] = $42;
    $43 = ((($$150)) + 4|0);
    $44 = HEAP32[$43>>2]|0;
    $45 = (($44) - ($$0))|0;
    HEAP32[$43>>2] = $45;
    $46 = HEAP32[$13>>2]|0;
    $47 = $$150;
    HEAP32[$vararg_buffer3>>2] = $46;
    $vararg_ptr6 = ((($vararg_buffer3)) + 4|0);
    HEAP32[$vararg_ptr6>>2] = $47;
    $vararg_ptr7 = ((($vararg_buffer3)) + 8|0);
    HEAP32[$vararg_ptr7>>2] = $$1;
    $48 = (___syscall146(146,($vararg_buffer3|0))|0);
    $49 = (___syscall_ret($48)|0);
    $50 = ($34|0)==($49|0);
    if ($50) {
     label = 3;
     break L1;
    } else {
     $$04756 = $$1;$$04855 = $34;$$04954 = $$150;$26 = $49;
    }
   }
   $27 = ((($0)) + 16|0);
   HEAP32[$27>>2] = 0;
   HEAP32[$4>>2] = 0;
   HEAP32[$7>>2] = 0;
   $28 = HEAP32[$0>>2]|0;
   $29 = $28 | 32;
   HEAP32[$0>>2] = $29;
   $30 = ($$04756|0)==(2);
   if ($30) {
    $$051 = 0;
   } else {
    $31 = ((($$04954)) + 4|0);
    $32 = HEAP32[$31>>2]|0;
    $33 = (($2) - ($32))|0;
    $$051 = $33;
   }
  }
 } while(0);
 if ((label|0) == 3) {
  $19 = ((($0)) + 44|0);
  $20 = HEAP32[$19>>2]|0;
  $21 = ((($0)) + 48|0);
  $22 = HEAP32[$21>>2]|0;
  $23 = (($20) + ($22)|0);
  $24 = ((($0)) + 16|0);
  HEAP32[$24>>2] = $23;
  HEAP32[$4>>2] = $20;
  HEAP32[$7>>2] = $20;
  $$051 = $2;
 }
 STACKTOP = sp;return ($$051|0);
}
function ___stdio_seek($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $$pre = 0, $10 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $vararg_buffer = 0, $vararg_ptr1 = 0, $vararg_ptr2 = 0, $vararg_ptr3 = 0, $vararg_ptr4 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 32|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(32|0);
 $vararg_buffer = sp;
 $3 = sp + 20|0;
 $4 = ((($0)) + 60|0);
 $5 = HEAP32[$4>>2]|0;
 $6 = $3;
 HEAP32[$vararg_buffer>>2] = $5;
 $vararg_ptr1 = ((($vararg_buffer)) + 4|0);
 HEAP32[$vararg_ptr1>>2] = 0;
 $vararg_ptr2 = ((($vararg_buffer)) + 8|0);
 HEAP32[$vararg_ptr2>>2] = $1;
 $vararg_ptr3 = ((($vararg_buffer)) + 12|0);
 HEAP32[$vararg_ptr3>>2] = $6;
 $vararg_ptr4 = ((($vararg_buffer)) + 16|0);
 HEAP32[$vararg_ptr4>>2] = $2;
 $7 = (___syscall140(140,($vararg_buffer|0))|0);
 $8 = (___syscall_ret($7)|0);
 $9 = ($8|0)<(0);
 if ($9) {
  HEAP32[$3>>2] = -1;
  $10 = -1;
 } else {
  $$pre = HEAP32[$3>>2]|0;
  $10 = $$pre;
 }
 STACKTOP = sp;return ($10|0);
}
function ___syscall_ret($0) {
 $0 = $0|0;
 var $$0 = 0, $1 = 0, $2 = 0, $3 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = ($0>>>0)>(4294963200);
 if ($1) {
  $2 = (0 - ($0))|0;
  $3 = (___errno_location()|0);
  HEAP32[$3>>2] = $2;
  $$0 = -1;
 } else {
  $$0 = $0;
 }
 return ($$0|0);
}
function ___errno_location() {
 var $0 = 0, $1 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = (___pthread_self_103()|0);
 $1 = ((($0)) + 64|0);
 return ($1|0);
}
function ___pthread_self_103() {
 var $0 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = (_pthread_self()|0);
 return ($0|0);
}
function _pthread_self() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (1248|0);
}
function _dummy_570($0) {
 $0 = $0|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 return ($0|0);
}
function ___stdio_read($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $$0 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0;
 var $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $vararg_buffer = 0, $vararg_ptr1 = 0, $vararg_ptr2 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 32|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(32|0);
 $vararg_buffer = sp;
 $3 = sp + 16|0;
 HEAP32[$3>>2] = $1;
 $4 = ((($3)) + 4|0);
 $5 = ((($0)) + 48|0);
 $6 = HEAP32[$5>>2]|0;
 $7 = ($6|0)!=(0);
 $8 = $7&1;
 $9 = (($2) - ($8))|0;
 HEAP32[$4>>2] = $9;
 $10 = ((($3)) + 8|0);
 $11 = ((($0)) + 44|0);
 $12 = HEAP32[$11>>2]|0;
 HEAP32[$10>>2] = $12;
 $13 = ((($3)) + 12|0);
 HEAP32[$13>>2] = $6;
 $14 = ((($0)) + 60|0);
 $15 = HEAP32[$14>>2]|0;
 $16 = $3;
 HEAP32[$vararg_buffer>>2] = $15;
 $vararg_ptr1 = ((($vararg_buffer)) + 4|0);
 HEAP32[$vararg_ptr1>>2] = $16;
 $vararg_ptr2 = ((($vararg_buffer)) + 8|0);
 HEAP32[$vararg_ptr2>>2] = 2;
 $17 = (___syscall145(145,($vararg_buffer|0))|0);
 $18 = (___syscall_ret($17)|0);
 $19 = ($18|0)<(1);
 if ($19) {
  $20 = $18 & 48;
  $21 = $20 ^ 16;
  $22 = HEAP32[$0>>2]|0;
  $23 = $22 | $21;
  HEAP32[$0>>2] = $23;
  $$0 = $18;
 } else {
  $24 = HEAP32[$4>>2]|0;
  $25 = ($18>>>0)>($24>>>0);
  if ($25) {
   $26 = (($18) - ($24))|0;
   $27 = HEAP32[$11>>2]|0;
   $28 = ((($0)) + 4|0);
   HEAP32[$28>>2] = $27;
   $29 = (($27) + ($26)|0);
   $30 = ((($0)) + 8|0);
   HEAP32[$30>>2] = $29;
   $31 = HEAP32[$5>>2]|0;
   $32 = ($31|0)==(0);
   if ($32) {
    $$0 = $2;
   } else {
    $33 = ((($27)) + 1|0);
    HEAP32[$28>>2] = $33;
    $34 = HEAP8[$27>>0]|0;
    $35 = (($2) + -1)|0;
    $36 = (($1) + ($35)|0);
    HEAP8[$36>>0] = $34;
    $$0 = $2;
   }
  } else {
   $$0 = $18;
  }
 }
 STACKTOP = sp;return ($$0|0);
}
function ___stdout_write($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $vararg_buffer = 0, $vararg_ptr1 = 0, $vararg_ptr2 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 32|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(32|0);
 $vararg_buffer = sp;
 $3 = sp + 16|0;
 $4 = ((($0)) + 36|0);
 HEAP32[$4>>2] = 77;
 $5 = HEAP32[$0>>2]|0;
 $6 = $5 & 64;
 $7 = ($6|0)==(0);
 if ($7) {
  $8 = ((($0)) + 60|0);
  $9 = HEAP32[$8>>2]|0;
  $10 = $3;
  HEAP32[$vararg_buffer>>2] = $9;
  $vararg_ptr1 = ((($vararg_buffer)) + 4|0);
  HEAP32[$vararg_ptr1>>2] = 21523;
  $vararg_ptr2 = ((($vararg_buffer)) + 8|0);
  HEAP32[$vararg_ptr2>>2] = $10;
  $11 = (___syscall54(54,($vararg_buffer|0))|0);
  $12 = ($11|0)==(0);
  if (!($12)) {
   $13 = ((($0)) + 75|0);
   HEAP8[$13>>0] = -1;
  }
 }
 $14 = (___stdio_write($0,$1,$2)|0);
 STACKTOP = sp;return ($14|0);
}
function _strcmp($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $$011 = 0, $$0710 = 0, $$lcssa = 0, $$lcssa8 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $or$cond = 0, $or$cond9 = 0, label = 0;
 var sp = 0;
 sp = STACKTOP;
 $2 = HEAP8[$0>>0]|0;
 $3 = HEAP8[$1>>0]|0;
 $4 = ($2<<24>>24)!=($3<<24>>24);
 $5 = ($2<<24>>24)==(0);
 $or$cond9 = $5 | $4;
 if ($or$cond9) {
  $$lcssa = $3;$$lcssa8 = $2;
 } else {
  $$011 = $1;$$0710 = $0;
  while(1) {
   $6 = ((($$0710)) + 1|0);
   $7 = ((($$011)) + 1|0);
   $8 = HEAP8[$6>>0]|0;
   $9 = HEAP8[$7>>0]|0;
   $10 = ($8<<24>>24)!=($9<<24>>24);
   $11 = ($8<<24>>24)==(0);
   $or$cond = $11 | $10;
   if ($or$cond) {
    $$lcssa = $9;$$lcssa8 = $8;
    break;
   } else {
    $$011 = $7;$$0710 = $6;
   }
  }
 }
 $12 = $$lcssa8&255;
 $13 = $$lcssa&255;
 $14 = (($12) - ($13))|0;
 return ($14|0);
}
function _sprintf($0,$1,$varargs) {
 $0 = $0|0;
 $1 = $1|0;
 $varargs = $varargs|0;
 var $2 = 0, $3 = 0, $4 = 0, $AsyncCtx = 0, $IsAsync = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $2 = sp;
 HEAP32[$2>>2] = $varargs;
 $AsyncCtx = _emscripten_alloc_async_context(8,sp)|0;
 $3 = (_vsprintf($0,$1,$2)|0);
 $IsAsync = ___async;
 if ($IsAsync) {
  HEAP32[$AsyncCtx>>2] = 203;
  $4 = ((($AsyncCtx)) + 4|0);
  HEAP32[$4>>2] = $2;
  sp = STACKTOP;
  STACKTOP = sp;return 0;
 } else {
  _emscripten_free_async_context(($AsyncCtx|0));
  STACKTOP = sp;return ($3|0);
 }
 return (0)|0;
}
function _vsprintf($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $3 = 0, $AsyncCtx = 0, $IsAsync = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $AsyncCtx = _emscripten_alloc_async_context(4,sp)|0;
 $3 = (_vsnprintf($0,2147483647,$1,$2)|0);
 $IsAsync = ___async;
 if ($IsAsync) {
  HEAP32[$AsyncCtx>>2] = 204;
  sp = STACKTOP;
  return 0;
 } else {
  _emscripten_free_async_context(($AsyncCtx|0));
  return ($3|0);
 }
 return (0)|0;
}
function _vsnprintf($0,$1,$2,$3) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 var $$$015 = 0, $$0 = 0, $$014 = 0, $$015 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0;
 var $26 = 0, $27 = 0, $28 = 0, $29 = 0, $30 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $AsyncCtx = 0, $IsAsync = 0, dest = 0, label = 0, sp = 0, src = 0, stop = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 128|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(128|0);
 $4 = sp + 124|0;
 $5 = sp;
 dest=$5; src=1624; stop=dest+124|0; do { HEAP32[dest>>2]=HEAP32[src>>2]|0; dest=dest+4|0; src=src+4|0; } while ((dest|0) < (stop|0));
 $6 = (($1) + -1)|0;
 $7 = ($6>>>0)>(2147483646);
 if ($7) {
  $8 = ($1|0)==(0);
  if ($8) {
   $$014 = $4;$$015 = 1;
   label = 4;
  } else {
   $9 = (___errno_location()|0);
   HEAP32[$9>>2] = 75;
   $$0 = -1;
  }
 } else {
  $$014 = $0;$$015 = $1;
  label = 4;
 }
 if ((label|0) == 4) {
  $10 = $$014;
  $11 = (-2 - ($10))|0;
  $12 = ($$015>>>0)>($11>>>0);
  $$$015 = $12 ? $11 : $$015;
  $13 = ((($5)) + 48|0);
  HEAP32[$13>>2] = $$$015;
  $14 = ((($5)) + 20|0);
  HEAP32[$14>>2] = $$014;
  $15 = ((($5)) + 44|0);
  HEAP32[$15>>2] = $$014;
  $16 = (($$014) + ($$$015)|0);
  $17 = ((($5)) + 16|0);
  HEAP32[$17>>2] = $16;
  $18 = ((($5)) + 28|0);
  HEAP32[$18>>2] = $16;
  $AsyncCtx = _emscripten_alloc_async_context(24,sp)|0;
  $19 = (_vfprintf($5,$2,$3)|0);
  $IsAsync = ___async;
  if ($IsAsync) {
   HEAP32[$AsyncCtx>>2] = 205;
   $20 = ((($AsyncCtx)) + 4|0);
   HEAP32[$20>>2] = $$$015;
   $21 = ((($AsyncCtx)) + 8|0);
   HEAP32[$21>>2] = $5;
   $22 = ((($AsyncCtx)) + 12|0);
   HEAP32[$22>>2] = $4;
   $23 = ((($AsyncCtx)) + 16|0);
   HEAP32[$23>>2] = $14;
   $24 = ((($AsyncCtx)) + 20|0);
   HEAP32[$24>>2] = $17;
   sp = STACKTOP;
   STACKTOP = sp;return 0;
  }
  _emscripten_free_async_context(($AsyncCtx|0));
  $25 = ($$$015|0)==(0);
  if ($25) {
   $$0 = $19;
  } else {
   $26 = HEAP32[$14>>2]|0;
   $27 = HEAP32[$17>>2]|0;
   $28 = ($26|0)==($27|0);
   $29 = $28 << 31 >> 31;
   $30 = (($26) + ($29)|0);
   HEAP8[$30>>0] = 0;
   $$0 = $19;
  }
 }
 STACKTOP = sp;return ($$0|0);
}
function _vfprintf($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $$ = 0, $$0 = 0, $$1 = 0, $$1$ = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0;
 var $26 = 0, $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0;
 var $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $AsyncCtx = 0, $IsAsync = 0, $vacopy_currentptr = 0;
 var dest = 0, label = 0, sp = 0, stop = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 224|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(224|0);
 $3 = sp + 120|0;
 $4 = sp + 80|0;
 $5 = sp;
 $6 = sp + 136|0;
 dest=$4; stop=dest+40|0; do { HEAP32[dest>>2]=0|0; dest=dest+4|0; } while ((dest|0) < (stop|0));
 $vacopy_currentptr = HEAP32[$2>>2]|0;
 HEAP32[$3>>2] = $vacopy_currentptr;
 $7 = (_printf_core(0,$1,$3,$5,$4)|0);
 $8 = ($7|0)<(0);
 if ($8) {
  $$0 = -1;
 } else {
  $9 = ((($0)) + 76|0);
  $10 = HEAP32[$9>>2]|0;
  $11 = ($10|0)>(-1);
  if ($11) {
   $12 = (___lockfile($0)|0);
   $43 = $12;
  } else {
   $43 = 0;
  }
  $13 = HEAP32[$0>>2]|0;
  $14 = $13 & 32;
  $15 = ((($0)) + 74|0);
  $16 = HEAP8[$15>>0]|0;
  $17 = ($16<<24>>24)<(1);
  if ($17) {
   $18 = $13 & -33;
   HEAP32[$0>>2] = $18;
  }
  $19 = ((($0)) + 48|0);
  $20 = HEAP32[$19>>2]|0;
  $21 = ($20|0)==(0);
  do {
   if ($21) {
    $23 = ((($0)) + 44|0);
    $24 = HEAP32[$23>>2]|0;
    HEAP32[$23>>2] = $6;
    $25 = ((($0)) + 28|0);
    HEAP32[$25>>2] = $6;
    $26 = ((($0)) + 20|0);
    HEAP32[$26>>2] = $6;
    HEAP32[$19>>2] = 80;
    $27 = ((($6)) + 80|0);
    $28 = ((($0)) + 16|0);
    HEAP32[$28>>2] = $27;
    $29 = (_printf_core($0,$1,$3,$5,$4)|0);
    $30 = ($24|0)==(0|0);
    if ($30) {
     $$1 = $29;
    } else {
     $31 = ((($0)) + 36|0);
     $32 = HEAP32[$31>>2]|0;
     $AsyncCtx = _emscripten_alloc_async_context(64,sp)|0;
     (FUNCTION_TABLE_iiii[$32 & 255]($0,0,0)|0);
     $IsAsync = ___async;
     if ($IsAsync) {
      HEAP32[$AsyncCtx>>2] = 206;
      $33 = ((($AsyncCtx)) + 4|0);
      HEAP32[$33>>2] = $26;
      $34 = ((($AsyncCtx)) + 8|0);
      HEAP32[$34>>2] = $29;
      $35 = ((($AsyncCtx)) + 12|0);
      HEAP32[$35>>2] = $24;
      $36 = ((($AsyncCtx)) + 16|0);
      HEAP32[$36>>2] = $23;
      $37 = ((($AsyncCtx)) + 20|0);
      HEAP32[$37>>2] = $19;
      $38 = ((($AsyncCtx)) + 24|0);
      HEAP32[$38>>2] = $28;
      $39 = ((($AsyncCtx)) + 28|0);
      HEAP32[$39>>2] = $25;
      $40 = ((($AsyncCtx)) + 32|0);
      HEAP32[$40>>2] = $0;
      $41 = ((($AsyncCtx)) + 36|0);
      HEAP32[$41>>2] = $14;
      $42 = ((($AsyncCtx)) + 40|0);
      HEAP32[$42>>2] = $43;
      $44 = ((($AsyncCtx)) + 44|0);
      HEAP32[$44>>2] = $0;
      $45 = ((($AsyncCtx)) + 48|0);
      HEAP32[$45>>2] = $6;
      $46 = ((($AsyncCtx)) + 52|0);
      HEAP32[$46>>2] = $5;
      $47 = ((($AsyncCtx)) + 56|0);
      HEAP32[$47>>2] = $4;
      $48 = ((($AsyncCtx)) + 60|0);
      HEAP32[$48>>2] = $3;
      sp = STACKTOP;
      STACKTOP = sp;return 0;
     } else {
      _emscripten_free_async_context(($AsyncCtx|0));
      $49 = HEAP32[$26>>2]|0;
      $50 = ($49|0)==(0|0);
      $$ = $50 ? -1 : $29;
      HEAP32[$23>>2] = $24;
      HEAP32[$19>>2] = 0;
      HEAP32[$28>>2] = 0;
      HEAP32[$25>>2] = 0;
      HEAP32[$26>>2] = 0;
      $$1 = $$;
      break;
     }
    }
   } else {
    $22 = (_printf_core($0,$1,$3,$5,$4)|0);
    $$1 = $22;
   }
  } while(0);
  $51 = HEAP32[$0>>2]|0;
  $52 = $51 & 32;
  $53 = ($52|0)==(0);
  $$1$ = $53 ? $$1 : -1;
  $54 = $51 | $14;
  HEAP32[$0>>2] = $54;
  $55 = ($43|0)==(0);
  if (!($55)) {
   ___unlockfile($0);
  }
  $$0 = $$1$;
 }
 STACKTOP = sp;return ($$0|0);
}
function _printf_core($0,$1,$2,$3,$4) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 $4 = $4|0;
 var $$ = 0, $$$ = 0, $$$0259 = 0, $$$0262 = 0, $$$0269 = 0, $$$4266 = 0, $$$5 = 0, $$0 = 0, $$0228 = 0, $$0228$ = 0, $$0229322 = 0, $$0232 = 0, $$0235 = 0, $$0237 = 0, $$0240$lcssa = 0, $$0240$lcssa357 = 0, $$0240321 = 0, $$0243 = 0, $$0247 = 0, $$0249$lcssa = 0;
 var $$0249306 = 0, $$0252 = 0, $$0253 = 0, $$0254 = 0, $$0254$$0254$ = 0, $$0259 = 0, $$0262$lcssa = 0, $$0262311 = 0, $$0269 = 0, $$0269$phi = 0, $$1 = 0, $$1230333 = 0, $$1233 = 0, $$1236 = 0, $$1238 = 0, $$1241332 = 0, $$1244320 = 0, $$1248 = 0, $$1250 = 0, $$1255 = 0;
 var $$1260 = 0, $$1263 = 0, $$1263$ = 0, $$1270 = 0, $$2 = 0, $$2234 = 0, $$2239 = 0, $$2242305 = 0, $$2245 = 0, $$2251 = 0, $$2256 = 0, $$2256$ = 0, $$2256$$$2256 = 0, $$2261 = 0, $$2271 = 0, $$284$ = 0, $$289 = 0, $$290 = 0, $$3257 = 0, $$3265 = 0;
 var $$3272 = 0, $$3303 = 0, $$377 = 0, $$4258355 = 0, $$4266 = 0, $$5 = 0, $$6268 = 0, $$lcssa295 = 0, $$pre = 0, $$pre346 = 0, $$pre347 = 0, $$pre347$pre = 0, $$pre349 = 0, $10 = 0, $100 = 0, $101 = 0, $102 = 0, $103 = 0, $104 = 0, $105 = 0;
 var $106 = 0, $107 = 0, $108 = 0, $109 = 0, $11 = 0, $110 = 0, $111 = 0, $112 = 0, $113 = 0, $114 = 0, $115 = 0, $116 = 0, $117 = 0, $118 = 0, $119 = 0, $12 = 0, $120 = 0, $121 = 0, $122 = 0, $123 = 0;
 var $124 = 0, $125 = 0, $126 = 0, $127 = 0, $128 = 0, $129 = 0, $13 = 0, $130 = 0, $131 = 0, $132 = 0, $133 = 0, $134 = 0, $135 = 0, $136 = 0, $137 = 0, $138 = 0, $139 = 0, $14 = 0, $140 = 0, $141 = 0;
 var $142 = 0, $143 = 0, $144 = 0, $145 = 0, $146 = 0, $147 = 0, $148 = 0, $149 = 0, $15 = 0, $150 = 0, $151 = 0, $152 = 0, $153 = 0, $154 = 0, $155 = 0, $156 = 0, $157 = 0, $158 = 0, $159 = 0, $16 = 0;
 var $160 = 0, $161 = 0, $162 = 0, $163 = 0, $164 = 0, $165 = 0, $166 = 0, $167 = 0, $168 = 0, $169 = 0, $17 = 0, $170 = 0, $171 = 0, $172 = 0, $173 = 0, $174 = 0, $175 = 0, $176 = 0, $177 = 0, $178 = 0;
 var $179 = 0, $18 = 0, $180 = 0, $181 = 0, $182 = 0, $183 = 0, $184 = 0, $185 = 0, $186 = 0, $187 = 0, $188 = 0, $189 = 0, $19 = 0, $190 = 0, $191 = 0, $192 = 0, $193 = 0, $194 = 0, $195 = 0, $196 = 0;
 var $197 = 0, $198 = 0, $199 = 0, $20 = 0, $200 = 0, $201 = 0, $202 = 0, $203 = 0, $204 = 0, $205 = 0, $206 = 0, $207 = 0, $208 = 0, $209 = 0, $21 = 0, $210 = 0, $211 = 0, $212 = 0, $213 = 0, $214 = 0;
 var $215 = 0, $216 = 0, $217 = 0, $218 = 0, $219 = 0, $22 = 0, $220 = 0, $221 = 0, $222 = 0, $223 = 0, $224 = 0, $225 = 0, $226 = 0, $227 = 0, $228 = 0, $229 = 0, $23 = 0, $230 = 0, $231 = 0, $232 = 0;
 var $233 = 0, $234 = 0, $235 = 0, $236 = 0, $237 = 0, $238 = 0, $239 = 0, $24 = 0, $240 = 0, $241 = 0, $242 = 0, $243 = 0, $244 = 0, $245 = 0, $246 = 0, $247 = 0, $248 = 0, $249 = 0, $25 = 0, $250 = 0;
 var $251 = 0, $252 = 0, $253 = 0, $254 = 0, $255 = 0, $256 = 0, $257 = 0, $258 = 0, $259 = 0, $26 = 0, $260 = 0, $261 = 0, $262 = 0, $263 = 0, $264 = 0, $265 = 0, $266 = 0, $267 = 0, $268 = 0, $269 = 0;
 var $27 = 0, $270 = 0, $271 = 0, $272 = 0, $273 = 0, $274 = 0, $275 = 0, $276 = 0, $277 = 0, $278 = 0, $279 = 0, $28 = 0, $280 = 0, $281 = 0, $282 = 0, $283 = 0, $284 = 0, $285 = 0, $286 = 0, $287 = 0;
 var $288 = 0, $289 = 0, $29 = 0, $290 = 0, $291 = 0, $292 = 0, $293 = 0, $294 = 0, $295 = 0, $296 = 0, $297 = 0, $298 = 0, $299 = 0, $30 = 0, $300 = 0, $301 = 0, $302 = 0, $303 = 0, $304 = 0, $305 = 0;
 var $306 = 0.0, $307 = 0, $308 = 0, $309 = 0, $31 = 0, $310 = 0, $311 = 0, $312 = 0, $313 = 0, $314 = 0, $315 = 0, $316 = 0, $317 = 0, $318 = 0, $319 = 0, $32 = 0, $320 = 0, $321 = 0, $322 = 0, $323 = 0;
 var $324 = 0, $325 = 0, $326 = 0, $327 = 0, $328 = 0, $329 = 0, $33 = 0, $330 = 0, $331 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0;
 var $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0;
 var $63 = 0, $64 = 0, $65 = 0, $66 = 0, $67 = 0, $68 = 0, $69 = 0, $7 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $78 = 0, $79 = 0, $8 = 0, $80 = 0;
 var $81 = 0, $82 = 0, $83 = 0, $84 = 0, $85 = 0, $86 = 0, $87 = 0, $88 = 0, $89 = 0, $9 = 0, $90 = 0, $91 = 0, $92 = 0, $93 = 0, $94 = 0, $95 = 0, $96 = 0, $97 = 0, $98 = 0, $99 = 0;
 var $arglist_current = 0, $arglist_current2 = 0, $arglist_next = 0, $arglist_next3 = 0, $expanded = 0, $expanded10 = 0, $expanded11 = 0, $expanded13 = 0, $expanded14 = 0, $expanded15 = 0, $expanded4 = 0, $expanded6 = 0, $expanded7 = 0, $expanded8 = 0, $isdigit = 0, $isdigit275 = 0, $isdigit277 = 0, $isdigittmp = 0, $isdigittmp$ = 0, $isdigittmp274 = 0;
 var $isdigittmp276 = 0, $narrow = 0, $or$cond = 0, $or$cond281 = 0, $or$cond283 = 0, $or$cond286 = 0, $storemerge = 0, $storemerge273310 = 0, $storemerge278 = 0, $trunc = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 64|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(64|0);
 $5 = sp + 16|0;
 $6 = sp;
 $7 = sp + 24|0;
 $8 = sp + 8|0;
 $9 = sp + 20|0;
 HEAP32[$5>>2] = $1;
 $10 = ($0|0)!=(0|0);
 $11 = ((($7)) + 40|0);
 $12 = $11;
 $13 = ((($7)) + 39|0);
 $14 = ((($8)) + 4|0);
 $$0243 = 0;$$0247 = 0;$$0269 = 0;$21 = $1;
 L1: while(1) {
  $15 = ($$0247|0)>(-1);
  do {
   if ($15) {
    $16 = (2147483647 - ($$0247))|0;
    $17 = ($$0243|0)>($16|0);
    if ($17) {
     $18 = (___errno_location()|0);
     HEAP32[$18>>2] = 75;
     $$1248 = -1;
     break;
    } else {
     $19 = (($$0243) + ($$0247))|0;
     $$1248 = $19;
     break;
    }
   } else {
    $$1248 = $$0247;
   }
  } while(0);
  $20 = HEAP8[$21>>0]|0;
  $22 = ($20<<24>>24)==(0);
  if ($22) {
   label = 87;
   break;
  } else {
   $23 = $20;$25 = $21;
  }
  L9: while(1) {
   switch ($23<<24>>24) {
   case 37:  {
    $$0249306 = $25;$27 = $25;
    label = 9;
    break L9;
    break;
   }
   case 0:  {
    $$0249$lcssa = $25;$39 = $25;
    break L9;
    break;
   }
   default: {
   }
   }
   $24 = ((($25)) + 1|0);
   HEAP32[$5>>2] = $24;
   $$pre = HEAP8[$24>>0]|0;
   $23 = $$pre;$25 = $24;
  }
  L12: do {
   if ((label|0) == 9) {
    while(1) {
     label = 0;
     $26 = ((($27)) + 1|0);
     $28 = HEAP8[$26>>0]|0;
     $29 = ($28<<24>>24)==(37);
     if (!($29)) {
      $$0249$lcssa = $$0249306;$39 = $27;
      break L12;
     }
     $30 = ((($$0249306)) + 1|0);
     $31 = ((($27)) + 2|0);
     HEAP32[$5>>2] = $31;
     $32 = HEAP8[$31>>0]|0;
     $33 = ($32<<24>>24)==(37);
     if ($33) {
      $$0249306 = $30;$27 = $31;
      label = 9;
     } else {
      $$0249$lcssa = $30;$39 = $31;
      break;
     }
    }
   }
  } while(0);
  $34 = $$0249$lcssa;
  $35 = $21;
  $36 = (($34) - ($35))|0;
  if ($10) {
   _out($0,$21,$36);
  }
  $37 = ($36|0)==(0);
  if (!($37)) {
   $$0269$phi = $$0269;$$0243 = $36;$$0247 = $$1248;$21 = $39;$$0269 = $$0269$phi;
   continue;
  }
  $38 = ((($39)) + 1|0);
  $40 = HEAP8[$38>>0]|0;
  $41 = $40 << 24 >> 24;
  $isdigittmp = (($41) + -48)|0;
  $isdigit = ($isdigittmp>>>0)<(10);
  if ($isdigit) {
   $42 = ((($39)) + 2|0);
   $43 = HEAP8[$42>>0]|0;
   $44 = ($43<<24>>24)==(36);
   $45 = ((($39)) + 3|0);
   $$377 = $44 ? $45 : $38;
   $$$0269 = $44 ? 1 : $$0269;
   $isdigittmp$ = $44 ? $isdigittmp : -1;
   $$0253 = $isdigittmp$;$$1270 = $$$0269;$storemerge = $$377;
  } else {
   $$0253 = -1;$$1270 = $$0269;$storemerge = $38;
  }
  HEAP32[$5>>2] = $storemerge;
  $46 = HEAP8[$storemerge>>0]|0;
  $47 = $46 << 24 >> 24;
  $48 = (($47) + -32)|0;
  $49 = ($48>>>0)<(32);
  L24: do {
   if ($49) {
    $$0262311 = 0;$329 = $46;$51 = $48;$storemerge273310 = $storemerge;
    while(1) {
     $50 = 1 << $51;
     $52 = $50 & 75913;
     $53 = ($52|0)==(0);
     if ($53) {
      $$0262$lcssa = $$0262311;$$lcssa295 = $329;$62 = $storemerge273310;
      break L24;
     }
     $54 = $50 | $$0262311;
     $55 = ((($storemerge273310)) + 1|0);
     HEAP32[$5>>2] = $55;
     $56 = HEAP8[$55>>0]|0;
     $57 = $56 << 24 >> 24;
     $58 = (($57) + -32)|0;
     $59 = ($58>>>0)<(32);
     if ($59) {
      $$0262311 = $54;$329 = $56;$51 = $58;$storemerge273310 = $55;
     } else {
      $$0262$lcssa = $54;$$lcssa295 = $56;$62 = $55;
      break;
     }
    }
   } else {
    $$0262$lcssa = 0;$$lcssa295 = $46;$62 = $storemerge;
   }
  } while(0);
  $60 = ($$lcssa295<<24>>24)==(42);
  if ($60) {
   $61 = ((($62)) + 1|0);
   $63 = HEAP8[$61>>0]|0;
   $64 = $63 << 24 >> 24;
   $isdigittmp276 = (($64) + -48)|0;
   $isdigit277 = ($isdigittmp276>>>0)<(10);
   if ($isdigit277) {
    $65 = ((($62)) + 2|0);
    $66 = HEAP8[$65>>0]|0;
    $67 = ($66<<24>>24)==(36);
    if ($67) {
     $68 = (($4) + ($isdigittmp276<<2)|0);
     HEAP32[$68>>2] = 10;
     $69 = HEAP8[$61>>0]|0;
     $70 = $69 << 24 >> 24;
     $71 = (($70) + -48)|0;
     $72 = (($3) + ($71<<3)|0);
     $73 = $72;
     $74 = $73;
     $75 = HEAP32[$74>>2]|0;
     $76 = (($73) + 4)|0;
     $77 = $76;
     $78 = HEAP32[$77>>2]|0;
     $79 = ((($62)) + 3|0);
     $$0259 = $75;$$2271 = 1;$storemerge278 = $79;
    } else {
     label = 23;
    }
   } else {
    label = 23;
   }
   if ((label|0) == 23) {
    label = 0;
    $80 = ($$1270|0)==(0);
    if (!($80)) {
     $$0 = -1;
     break;
    }
    if ($10) {
     $arglist_current = HEAP32[$2>>2]|0;
     $81 = $arglist_current;
     $82 = ((0) + 4|0);
     $expanded4 = $82;
     $expanded = (($expanded4) - 1)|0;
     $83 = (($81) + ($expanded))|0;
     $84 = ((0) + 4|0);
     $expanded8 = $84;
     $expanded7 = (($expanded8) - 1)|0;
     $expanded6 = $expanded7 ^ -1;
     $85 = $83 & $expanded6;
     $86 = $85;
     $87 = HEAP32[$86>>2]|0;
     $arglist_next = ((($86)) + 4|0);
     HEAP32[$2>>2] = $arglist_next;
     $$0259 = $87;$$2271 = 0;$storemerge278 = $61;
    } else {
     $$0259 = 0;$$2271 = 0;$storemerge278 = $61;
    }
   }
   HEAP32[$5>>2] = $storemerge278;
   $88 = ($$0259|0)<(0);
   $89 = $$0262$lcssa | 8192;
   $90 = (0 - ($$0259))|0;
   $$$0262 = $88 ? $89 : $$0262$lcssa;
   $$$0259 = $88 ? $90 : $$0259;
   $$1260 = $$$0259;$$1263 = $$$0262;$$3272 = $$2271;$94 = $storemerge278;
  } else {
   $91 = (_getint($5)|0);
   $92 = ($91|0)<(0);
   if ($92) {
    $$0 = -1;
    break;
   }
   $$pre346 = HEAP32[$5>>2]|0;
   $$1260 = $91;$$1263 = $$0262$lcssa;$$3272 = $$1270;$94 = $$pre346;
  }
  $93 = HEAP8[$94>>0]|0;
  $95 = ($93<<24>>24)==(46);
  do {
   if ($95) {
    $96 = ((($94)) + 1|0);
    $97 = HEAP8[$96>>0]|0;
    $98 = ($97<<24>>24)==(42);
    if (!($98)) {
     $125 = ((($94)) + 1|0);
     HEAP32[$5>>2] = $125;
     $126 = (_getint($5)|0);
     $$pre347$pre = HEAP32[$5>>2]|0;
     $$0254 = $126;$$pre347 = $$pre347$pre;
     break;
    }
    $99 = ((($94)) + 2|0);
    $100 = HEAP8[$99>>0]|0;
    $101 = $100 << 24 >> 24;
    $isdigittmp274 = (($101) + -48)|0;
    $isdigit275 = ($isdigittmp274>>>0)<(10);
    if ($isdigit275) {
     $102 = ((($94)) + 3|0);
     $103 = HEAP8[$102>>0]|0;
     $104 = ($103<<24>>24)==(36);
     if ($104) {
      $105 = (($4) + ($isdigittmp274<<2)|0);
      HEAP32[$105>>2] = 10;
      $106 = HEAP8[$99>>0]|0;
      $107 = $106 << 24 >> 24;
      $108 = (($107) + -48)|0;
      $109 = (($3) + ($108<<3)|0);
      $110 = $109;
      $111 = $110;
      $112 = HEAP32[$111>>2]|0;
      $113 = (($110) + 4)|0;
      $114 = $113;
      $115 = HEAP32[$114>>2]|0;
      $116 = ((($94)) + 4|0);
      HEAP32[$5>>2] = $116;
      $$0254 = $112;$$pre347 = $116;
      break;
     }
    }
    $117 = ($$3272|0)==(0);
    if (!($117)) {
     $$0 = -1;
     break L1;
    }
    if ($10) {
     $arglist_current2 = HEAP32[$2>>2]|0;
     $118 = $arglist_current2;
     $119 = ((0) + 4|0);
     $expanded11 = $119;
     $expanded10 = (($expanded11) - 1)|0;
     $120 = (($118) + ($expanded10))|0;
     $121 = ((0) + 4|0);
     $expanded15 = $121;
     $expanded14 = (($expanded15) - 1)|0;
     $expanded13 = $expanded14 ^ -1;
     $122 = $120 & $expanded13;
     $123 = $122;
     $124 = HEAP32[$123>>2]|0;
     $arglist_next3 = ((($123)) + 4|0);
     HEAP32[$2>>2] = $arglist_next3;
     $330 = $124;
    } else {
     $330 = 0;
    }
    HEAP32[$5>>2] = $99;
    $$0254 = $330;$$pre347 = $99;
   } else {
    $$0254 = -1;$$pre347 = $94;
   }
  } while(0);
  $$0252 = 0;$128 = $$pre347;
  while(1) {
   $127 = HEAP8[$128>>0]|0;
   $129 = $127 << 24 >> 24;
   $130 = (($129) + -65)|0;
   $131 = ($130>>>0)>(57);
   if ($131) {
    $$0 = -1;
    break L1;
   }
   $132 = ((($128)) + 1|0);
   HEAP32[$5>>2] = $132;
   $133 = HEAP8[$128>>0]|0;
   $134 = $133 << 24 >> 24;
   $135 = (($134) + -65)|0;
   $136 = ((5779 + (($$0252*58)|0)|0) + ($135)|0);
   $137 = HEAP8[$136>>0]|0;
   $138 = $137&255;
   $139 = (($138) + -1)|0;
   $140 = ($139>>>0)<(8);
   if ($140) {
    $$0252 = $138;$128 = $132;
   } else {
    break;
   }
  }
  $141 = ($137<<24>>24)==(0);
  if ($141) {
   $$0 = -1;
   break;
  }
  $142 = ($137<<24>>24)==(19);
  $143 = ($$0253|0)>(-1);
  do {
   if ($142) {
    if ($143) {
     $$0 = -1;
     break L1;
    } else {
     label = 49;
    }
   } else {
    if ($143) {
     $144 = (($4) + ($$0253<<2)|0);
     HEAP32[$144>>2] = $138;
     $145 = (($3) + ($$0253<<3)|0);
     $146 = $145;
     $147 = $146;
     $148 = HEAP32[$147>>2]|0;
     $149 = (($146) + 4)|0;
     $150 = $149;
     $151 = HEAP32[$150>>2]|0;
     $152 = $6;
     $153 = $152;
     HEAP32[$153>>2] = $148;
     $154 = (($152) + 4)|0;
     $155 = $154;
     HEAP32[$155>>2] = $151;
     label = 49;
     break;
    }
    if (!($10)) {
     $$0 = 0;
     break L1;
    }
    _pop_arg($6,$138,$2);
   }
  } while(0);
  if ((label|0) == 49) {
   label = 0;
   if (!($10)) {
    $$0243 = 0;$$0247 = $$1248;$$0269 = $$3272;$21 = $132;
    continue;
   }
  }
  $156 = HEAP8[$128>>0]|0;
  $157 = $156 << 24 >> 24;
  $158 = ($$0252|0)!=(0);
  $159 = $157 & 15;
  $160 = ($159|0)==(3);
  $or$cond281 = $158 & $160;
  $161 = $157 & -33;
  $$0235 = $or$cond281 ? $161 : $157;
  $162 = $$1263 & 8192;
  $163 = ($162|0)==(0);
  $164 = $$1263 & -65537;
  $$1263$ = $163 ? $$1263 : $164;
  L71: do {
   switch ($$0235|0) {
   case 110:  {
    $trunc = $$0252&255;
    switch ($trunc<<24>>24) {
    case 0:  {
     $171 = HEAP32[$6>>2]|0;
     HEAP32[$171>>2] = $$1248;
     $$0243 = 0;$$0247 = $$1248;$$0269 = $$3272;$21 = $132;
     continue L1;
     break;
    }
    case 1:  {
     $172 = HEAP32[$6>>2]|0;
     HEAP32[$172>>2] = $$1248;
     $$0243 = 0;$$0247 = $$1248;$$0269 = $$3272;$21 = $132;
     continue L1;
     break;
    }
    case 2:  {
     $173 = ($$1248|0)<(0);
     $174 = $173 << 31 >> 31;
     $175 = HEAP32[$6>>2]|0;
     $176 = $175;
     $177 = $176;
     HEAP32[$177>>2] = $$1248;
     $178 = (($176) + 4)|0;
     $179 = $178;
     HEAP32[$179>>2] = $174;
     $$0243 = 0;$$0247 = $$1248;$$0269 = $$3272;$21 = $132;
     continue L1;
     break;
    }
    case 3:  {
     $180 = $$1248&65535;
     $181 = HEAP32[$6>>2]|0;
     HEAP16[$181>>1] = $180;
     $$0243 = 0;$$0247 = $$1248;$$0269 = $$3272;$21 = $132;
     continue L1;
     break;
    }
    case 4:  {
     $182 = $$1248&255;
     $183 = HEAP32[$6>>2]|0;
     HEAP8[$183>>0] = $182;
     $$0243 = 0;$$0247 = $$1248;$$0269 = $$3272;$21 = $132;
     continue L1;
     break;
    }
    case 6:  {
     $184 = HEAP32[$6>>2]|0;
     HEAP32[$184>>2] = $$1248;
     $$0243 = 0;$$0247 = $$1248;$$0269 = $$3272;$21 = $132;
     continue L1;
     break;
    }
    case 7:  {
     $185 = ($$1248|0)<(0);
     $186 = $185 << 31 >> 31;
     $187 = HEAP32[$6>>2]|0;
     $188 = $187;
     $189 = $188;
     HEAP32[$189>>2] = $$1248;
     $190 = (($188) + 4)|0;
     $191 = $190;
     HEAP32[$191>>2] = $186;
     $$0243 = 0;$$0247 = $$1248;$$0269 = $$3272;$21 = $132;
     continue L1;
     break;
    }
    default: {
     $$0243 = 0;$$0247 = $$1248;$$0269 = $$3272;$21 = $132;
     continue L1;
    }
    }
    break;
   }
   case 112:  {
    $192 = ($$0254>>>0)>(8);
    $193 = $192 ? $$0254 : 8;
    $194 = $$1263$ | 8;
    $$1236 = 120;$$1255 = $193;$$3265 = $194;
    label = 61;
    break;
   }
   case 88: case 120:  {
    $$1236 = $$0235;$$1255 = $$0254;$$3265 = $$1263$;
    label = 61;
    break;
   }
   case 111:  {
    $210 = $6;
    $211 = $210;
    $212 = HEAP32[$211>>2]|0;
    $213 = (($210) + 4)|0;
    $214 = $213;
    $215 = HEAP32[$214>>2]|0;
    $216 = (_fmt_o($212,$215,$11)|0);
    $217 = $$1263$ & 8;
    $218 = ($217|0)==(0);
    $219 = $216;
    $220 = (($12) - ($219))|0;
    $221 = ($$0254|0)>($220|0);
    $222 = (($220) + 1)|0;
    $223 = $218 | $221;
    $$0254$$0254$ = $223 ? $$0254 : $222;
    $$0228 = $216;$$1233 = 0;$$1238 = 6243;$$2256 = $$0254$$0254$;$$4266 = $$1263$;$248 = $212;$250 = $215;
    label = 67;
    break;
   }
   case 105: case 100:  {
    $224 = $6;
    $225 = $224;
    $226 = HEAP32[$225>>2]|0;
    $227 = (($224) + 4)|0;
    $228 = $227;
    $229 = HEAP32[$228>>2]|0;
    $230 = ($229|0)<(0);
    if ($230) {
     $231 = (_i64Subtract(0,0,($226|0),($229|0))|0);
     $232 = tempRet0;
     $233 = $6;
     $234 = $233;
     HEAP32[$234>>2] = $231;
     $235 = (($233) + 4)|0;
     $236 = $235;
     HEAP32[$236>>2] = $232;
     $$0232 = 1;$$0237 = 6243;$242 = $231;$243 = $232;
     label = 66;
     break L71;
    } else {
     $237 = $$1263$ & 2048;
     $238 = ($237|0)==(0);
     $239 = $$1263$ & 1;
     $240 = ($239|0)==(0);
     $$ = $240 ? 6243 : (6245);
     $$$ = $238 ? $$ : (6244);
     $241 = $$1263$ & 2049;
     $narrow = ($241|0)!=(0);
     $$284$ = $narrow&1;
     $$0232 = $$284$;$$0237 = $$$;$242 = $226;$243 = $229;
     label = 66;
     break L71;
    }
    break;
   }
   case 117:  {
    $165 = $6;
    $166 = $165;
    $167 = HEAP32[$166>>2]|0;
    $168 = (($165) + 4)|0;
    $169 = $168;
    $170 = HEAP32[$169>>2]|0;
    $$0232 = 0;$$0237 = 6243;$242 = $167;$243 = $170;
    label = 66;
    break;
   }
   case 99:  {
    $259 = $6;
    $260 = $259;
    $261 = HEAP32[$260>>2]|0;
    $262 = (($259) + 4)|0;
    $263 = $262;
    $264 = HEAP32[$263>>2]|0;
    $265 = $261&255;
    HEAP8[$13>>0] = $265;
    $$2 = $13;$$2234 = 0;$$2239 = 6243;$$2251 = $11;$$5 = 1;$$6268 = $164;
    break;
   }
   case 109:  {
    $266 = (___errno_location()|0);
    $267 = HEAP32[$266>>2]|0;
    $268 = (_strerror($267)|0);
    $$1 = $268;
    label = 71;
    break;
   }
   case 115:  {
    $269 = HEAP32[$6>>2]|0;
    $270 = ($269|0)!=(0|0);
    $271 = $270 ? $269 : 6253;
    $$1 = $271;
    label = 71;
    break;
   }
   case 67:  {
    $278 = $6;
    $279 = $278;
    $280 = HEAP32[$279>>2]|0;
    $281 = (($278) + 4)|0;
    $282 = $281;
    $283 = HEAP32[$282>>2]|0;
    HEAP32[$8>>2] = $280;
    HEAP32[$14>>2] = 0;
    HEAP32[$6>>2] = $8;
    $$4258355 = -1;$331 = $8;
    label = 75;
    break;
   }
   case 83:  {
    $$pre349 = HEAP32[$6>>2]|0;
    $284 = ($$0254|0)==(0);
    if ($284) {
     _pad_684($0,32,$$1260,0,$$1263$);
     $$0240$lcssa357 = 0;
     label = 84;
    } else {
     $$4258355 = $$0254;$331 = $$pre349;
     label = 75;
    }
    break;
   }
   case 65: case 71: case 70: case 69: case 97: case 103: case 102: case 101:  {
    $306 = +HEAPF64[$6>>3];
    $307 = (_fmt_fp($0,$306,$$1260,$$0254,$$1263$,$$0235)|0);
    $$0243 = $307;$$0247 = $$1248;$$0269 = $$3272;$21 = $132;
    continue L1;
    break;
   }
   default: {
    $$2 = $21;$$2234 = 0;$$2239 = 6243;$$2251 = $11;$$5 = $$0254;$$6268 = $$1263$;
   }
   }
  } while(0);
  L95: do {
   if ((label|0) == 61) {
    label = 0;
    $195 = $6;
    $196 = $195;
    $197 = HEAP32[$196>>2]|0;
    $198 = (($195) + 4)|0;
    $199 = $198;
    $200 = HEAP32[$199>>2]|0;
    $201 = $$1236 & 32;
    $202 = (_fmt_x($197,$200,$11,$201)|0);
    $203 = ($197|0)==(0);
    $204 = ($200|0)==(0);
    $205 = $203 & $204;
    $206 = $$3265 & 8;
    $207 = ($206|0)==(0);
    $or$cond283 = $207 | $205;
    $208 = $$1236 >> 4;
    $209 = (6243 + ($208)|0);
    $$289 = $or$cond283 ? 6243 : $209;
    $$290 = $or$cond283 ? 0 : 2;
    $$0228 = $202;$$1233 = $$290;$$1238 = $$289;$$2256 = $$1255;$$4266 = $$3265;$248 = $197;$250 = $200;
    label = 67;
   }
   else if ((label|0) == 66) {
    label = 0;
    $244 = (_fmt_u($242,$243,$11)|0);
    $$0228 = $244;$$1233 = $$0232;$$1238 = $$0237;$$2256 = $$0254;$$4266 = $$1263$;$248 = $242;$250 = $243;
    label = 67;
   }
   else if ((label|0) == 71) {
    label = 0;
    $272 = (_memchr($$1,0,$$0254)|0);
    $273 = ($272|0)==(0|0);
    $274 = $272;
    $275 = $$1;
    $276 = (($274) - ($275))|0;
    $277 = (($$1) + ($$0254)|0);
    $$3257 = $273 ? $$0254 : $276;
    $$1250 = $273 ? $277 : $272;
    $$2 = $$1;$$2234 = 0;$$2239 = 6243;$$2251 = $$1250;$$5 = $$3257;$$6268 = $164;
   }
   else if ((label|0) == 75) {
    label = 0;
    $$0229322 = $331;$$0240321 = 0;$$1244320 = 0;
    while(1) {
     $285 = HEAP32[$$0229322>>2]|0;
     $286 = ($285|0)==(0);
     if ($286) {
      $$0240$lcssa = $$0240321;$$2245 = $$1244320;
      break;
     }
     $287 = (_wctomb($9,$285)|0);
     $288 = ($287|0)<(0);
     $289 = (($$4258355) - ($$0240321))|0;
     $290 = ($287>>>0)>($289>>>0);
     $or$cond286 = $288 | $290;
     if ($or$cond286) {
      $$0240$lcssa = $$0240321;$$2245 = $287;
      break;
     }
     $291 = ((($$0229322)) + 4|0);
     $292 = (($287) + ($$0240321))|0;
     $293 = ($$4258355>>>0)>($292>>>0);
     if ($293) {
      $$0229322 = $291;$$0240321 = $292;$$1244320 = $287;
     } else {
      $$0240$lcssa = $292;$$2245 = $287;
      break;
     }
    }
    $294 = ($$2245|0)<(0);
    if ($294) {
     $$0 = -1;
     break L1;
    }
    _pad_684($0,32,$$1260,$$0240$lcssa,$$1263$);
    $295 = ($$0240$lcssa|0)==(0);
    if ($295) {
     $$0240$lcssa357 = 0;
     label = 84;
    } else {
     $$1230333 = $331;$$1241332 = 0;
     while(1) {
      $296 = HEAP32[$$1230333>>2]|0;
      $297 = ($296|0)==(0);
      if ($297) {
       $$0240$lcssa357 = $$0240$lcssa;
       label = 84;
       break L95;
      }
      $298 = (_wctomb($9,$296)|0);
      $299 = (($298) + ($$1241332))|0;
      $300 = ($299|0)>($$0240$lcssa|0);
      if ($300) {
       $$0240$lcssa357 = $$0240$lcssa;
       label = 84;
       break L95;
      }
      $301 = ((($$1230333)) + 4|0);
      _out($0,$9,$298);
      $302 = ($299>>>0)<($$0240$lcssa>>>0);
      if ($302) {
       $$1230333 = $301;$$1241332 = $299;
      } else {
       $$0240$lcssa357 = $$0240$lcssa;
       label = 84;
       break;
      }
     }
    }
   }
  } while(0);
  if ((label|0) == 67) {
   label = 0;
   $245 = ($$2256|0)>(-1);
   $246 = $$4266 & -65537;
   $$$4266 = $245 ? $246 : $$4266;
   $247 = ($248|0)!=(0);
   $249 = ($250|0)!=(0);
   $251 = $247 | $249;
   $252 = ($$2256|0)!=(0);
   $or$cond = $252 | $251;
   $253 = $$0228;
   $254 = (($12) - ($253))|0;
   $255 = $251 ^ 1;
   $256 = $255&1;
   $257 = (($256) + ($254))|0;
   $258 = ($$2256|0)>($257|0);
   $$2256$ = $258 ? $$2256 : $257;
   $$2256$$$2256 = $or$cond ? $$2256$ : $$2256;
   $$0228$ = $or$cond ? $$0228 : $11;
   $$2 = $$0228$;$$2234 = $$1233;$$2239 = $$1238;$$2251 = $11;$$5 = $$2256$$$2256;$$6268 = $$$4266;
  }
  else if ((label|0) == 84) {
   label = 0;
   $303 = $$1263$ ^ 8192;
   _pad_684($0,32,$$1260,$$0240$lcssa357,$303);
   $304 = ($$1260|0)>($$0240$lcssa357|0);
   $305 = $304 ? $$1260 : $$0240$lcssa357;
   $$0243 = $305;$$0247 = $$1248;$$0269 = $$3272;$21 = $132;
   continue;
  }
  $308 = $$2251;
  $309 = $$2;
  $310 = (($308) - ($309))|0;
  $311 = ($$5|0)<($310|0);
  $$$5 = $311 ? $310 : $$5;
  $312 = (($$$5) + ($$2234))|0;
  $313 = ($$1260|0)<($312|0);
  $$2261 = $313 ? $312 : $$1260;
  _pad_684($0,32,$$2261,$312,$$6268);
  _out($0,$$2239,$$2234);
  $314 = $$6268 ^ 65536;
  _pad_684($0,48,$$2261,$312,$314);
  _pad_684($0,48,$$$5,$310,0);
  _out($0,$$2,$310);
  $315 = $$6268 ^ 8192;
  _pad_684($0,32,$$2261,$312,$315);
  $$0243 = $$2261;$$0247 = $$1248;$$0269 = $$3272;$21 = $132;
 }
 L114: do {
  if ((label|0) == 87) {
   $316 = ($0|0)==(0|0);
   if ($316) {
    $317 = ($$0269|0)==(0);
    if ($317) {
     $$0 = 0;
    } else {
     $$2242305 = 1;
     while(1) {
      $318 = (($4) + ($$2242305<<2)|0);
      $319 = HEAP32[$318>>2]|0;
      $320 = ($319|0)==(0);
      if ($320) {
       $$3303 = $$2242305;
       break;
      }
      $321 = (($3) + ($$2242305<<3)|0);
      _pop_arg($321,$319,$2);
      $322 = (($$2242305) + 1)|0;
      $323 = ($322|0)<(10);
      if ($323) {
       $$2242305 = $322;
      } else {
       $$0 = 1;
       break L114;
      }
     }
     while(1) {
      $326 = (($4) + ($$3303<<2)|0);
      $327 = HEAP32[$326>>2]|0;
      $328 = ($327|0)==(0);
      $325 = (($$3303) + 1)|0;
      if (!($328)) {
       $$0 = -1;
       break L114;
      }
      $324 = ($325|0)<(10);
      if ($324) {
       $$3303 = $325;
      } else {
       $$0 = 1;
       break;
      }
     }
    }
   } else {
    $$0 = $$1248;
   }
  }
 } while(0);
 STACKTOP = sp;return ($$0|0);
}
function ___lockfile($0) {
 $0 = $0|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 return 0;
}
function ___unlockfile($0) {
 $0 = $0|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 return;
}
function _out($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $3 = 0, $4 = 0, $5 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $3 = HEAP32[$0>>2]|0;
 $4 = $3 & 32;
 $5 = ($4|0)==(0);
 if ($5) {
  (___fwritex($1,$2,$0)|0);
 }
 return;
}
function _getint($0) {
 $0 = $0|0;
 var $$0$lcssa = 0, $$06 = 0, $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $isdigit = 0, $isdigit5 = 0, $isdigittmp = 0, $isdigittmp4 = 0, $isdigittmp7 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = HEAP32[$0>>2]|0;
 $2 = HEAP8[$1>>0]|0;
 $3 = $2 << 24 >> 24;
 $isdigittmp4 = (($3) + -48)|0;
 $isdigit5 = ($isdigittmp4>>>0)<(10);
 if ($isdigit5) {
  $$06 = 0;$7 = $1;$isdigittmp7 = $isdigittmp4;
  while(1) {
   $4 = ($$06*10)|0;
   $5 = (($isdigittmp7) + ($4))|0;
   $6 = ((($7)) + 1|0);
   HEAP32[$0>>2] = $6;
   $8 = HEAP8[$6>>0]|0;
   $9 = $8 << 24 >> 24;
   $isdigittmp = (($9) + -48)|0;
   $isdigit = ($isdigittmp>>>0)<(10);
   if ($isdigit) {
    $$06 = $5;$7 = $6;$isdigittmp7 = $isdigittmp;
   } else {
    $$0$lcssa = $5;
    break;
   }
  }
 } else {
  $$0$lcssa = 0;
 }
 return ($$0$lcssa|0);
}
function _pop_arg($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $$mask = 0, $$mask31 = 0, $10 = 0, $100 = 0, $101 = 0, $102 = 0, $103 = 0, $104 = 0, $105 = 0, $106 = 0, $107 = 0, $108 = 0, $109 = 0.0, $11 = 0, $110 = 0, $111 = 0, $112 = 0, $113 = 0, $114 = 0, $115 = 0;
 var $116 = 0.0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $3 = 0;
 var $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0;
 var $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0;
 var $67 = 0, $68 = 0, $69 = 0, $7 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $78 = 0, $79 = 0, $8 = 0, $80 = 0, $81 = 0, $82 = 0, $83 = 0, $84 = 0;
 var $85 = 0, $86 = 0, $87 = 0, $88 = 0, $89 = 0, $9 = 0, $90 = 0, $91 = 0, $92 = 0, $93 = 0, $94 = 0, $95 = 0, $96 = 0, $97 = 0, $98 = 0, $99 = 0, $arglist_current = 0, $arglist_current11 = 0, $arglist_current14 = 0, $arglist_current17 = 0;
 var $arglist_current2 = 0, $arglist_current20 = 0, $arglist_current23 = 0, $arglist_current26 = 0, $arglist_current5 = 0, $arglist_current8 = 0, $arglist_next = 0, $arglist_next12 = 0, $arglist_next15 = 0, $arglist_next18 = 0, $arglist_next21 = 0, $arglist_next24 = 0, $arglist_next27 = 0, $arglist_next3 = 0, $arglist_next6 = 0, $arglist_next9 = 0, $expanded = 0, $expanded28 = 0, $expanded30 = 0, $expanded31 = 0;
 var $expanded32 = 0, $expanded34 = 0, $expanded35 = 0, $expanded37 = 0, $expanded38 = 0, $expanded39 = 0, $expanded41 = 0, $expanded42 = 0, $expanded44 = 0, $expanded45 = 0, $expanded46 = 0, $expanded48 = 0, $expanded49 = 0, $expanded51 = 0, $expanded52 = 0, $expanded53 = 0, $expanded55 = 0, $expanded56 = 0, $expanded58 = 0, $expanded59 = 0;
 var $expanded60 = 0, $expanded62 = 0, $expanded63 = 0, $expanded65 = 0, $expanded66 = 0, $expanded67 = 0, $expanded69 = 0, $expanded70 = 0, $expanded72 = 0, $expanded73 = 0, $expanded74 = 0, $expanded76 = 0, $expanded77 = 0, $expanded79 = 0, $expanded80 = 0, $expanded81 = 0, $expanded83 = 0, $expanded84 = 0, $expanded86 = 0, $expanded87 = 0;
 var $expanded88 = 0, $expanded90 = 0, $expanded91 = 0, $expanded93 = 0, $expanded94 = 0, $expanded95 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $3 = ($1>>>0)>(20);
 L1: do {
  if (!($3)) {
   do {
    switch ($1|0) {
    case 9:  {
     $arglist_current = HEAP32[$2>>2]|0;
     $4 = $arglist_current;
     $5 = ((0) + 4|0);
     $expanded28 = $5;
     $expanded = (($expanded28) - 1)|0;
     $6 = (($4) + ($expanded))|0;
     $7 = ((0) + 4|0);
     $expanded32 = $7;
     $expanded31 = (($expanded32) - 1)|0;
     $expanded30 = $expanded31 ^ -1;
     $8 = $6 & $expanded30;
     $9 = $8;
     $10 = HEAP32[$9>>2]|0;
     $arglist_next = ((($9)) + 4|0);
     HEAP32[$2>>2] = $arglist_next;
     HEAP32[$0>>2] = $10;
     break L1;
     break;
    }
    case 10:  {
     $arglist_current2 = HEAP32[$2>>2]|0;
     $11 = $arglist_current2;
     $12 = ((0) + 4|0);
     $expanded35 = $12;
     $expanded34 = (($expanded35) - 1)|0;
     $13 = (($11) + ($expanded34))|0;
     $14 = ((0) + 4|0);
     $expanded39 = $14;
     $expanded38 = (($expanded39) - 1)|0;
     $expanded37 = $expanded38 ^ -1;
     $15 = $13 & $expanded37;
     $16 = $15;
     $17 = HEAP32[$16>>2]|0;
     $arglist_next3 = ((($16)) + 4|0);
     HEAP32[$2>>2] = $arglist_next3;
     $18 = ($17|0)<(0);
     $19 = $18 << 31 >> 31;
     $20 = $0;
     $21 = $20;
     HEAP32[$21>>2] = $17;
     $22 = (($20) + 4)|0;
     $23 = $22;
     HEAP32[$23>>2] = $19;
     break L1;
     break;
    }
    case 11:  {
     $arglist_current5 = HEAP32[$2>>2]|0;
     $24 = $arglist_current5;
     $25 = ((0) + 4|0);
     $expanded42 = $25;
     $expanded41 = (($expanded42) - 1)|0;
     $26 = (($24) + ($expanded41))|0;
     $27 = ((0) + 4|0);
     $expanded46 = $27;
     $expanded45 = (($expanded46) - 1)|0;
     $expanded44 = $expanded45 ^ -1;
     $28 = $26 & $expanded44;
     $29 = $28;
     $30 = HEAP32[$29>>2]|0;
     $arglist_next6 = ((($29)) + 4|0);
     HEAP32[$2>>2] = $arglist_next6;
     $31 = $0;
     $32 = $31;
     HEAP32[$32>>2] = $30;
     $33 = (($31) + 4)|0;
     $34 = $33;
     HEAP32[$34>>2] = 0;
     break L1;
     break;
    }
    case 12:  {
     $arglist_current8 = HEAP32[$2>>2]|0;
     $35 = $arglist_current8;
     $36 = ((0) + 8|0);
     $expanded49 = $36;
     $expanded48 = (($expanded49) - 1)|0;
     $37 = (($35) + ($expanded48))|0;
     $38 = ((0) + 8|0);
     $expanded53 = $38;
     $expanded52 = (($expanded53) - 1)|0;
     $expanded51 = $expanded52 ^ -1;
     $39 = $37 & $expanded51;
     $40 = $39;
     $41 = $40;
     $42 = $41;
     $43 = HEAP32[$42>>2]|0;
     $44 = (($41) + 4)|0;
     $45 = $44;
     $46 = HEAP32[$45>>2]|0;
     $arglist_next9 = ((($40)) + 8|0);
     HEAP32[$2>>2] = $arglist_next9;
     $47 = $0;
     $48 = $47;
     HEAP32[$48>>2] = $43;
     $49 = (($47) + 4)|0;
     $50 = $49;
     HEAP32[$50>>2] = $46;
     break L1;
     break;
    }
    case 13:  {
     $arglist_current11 = HEAP32[$2>>2]|0;
     $51 = $arglist_current11;
     $52 = ((0) + 4|0);
     $expanded56 = $52;
     $expanded55 = (($expanded56) - 1)|0;
     $53 = (($51) + ($expanded55))|0;
     $54 = ((0) + 4|0);
     $expanded60 = $54;
     $expanded59 = (($expanded60) - 1)|0;
     $expanded58 = $expanded59 ^ -1;
     $55 = $53 & $expanded58;
     $56 = $55;
     $57 = HEAP32[$56>>2]|0;
     $arglist_next12 = ((($56)) + 4|0);
     HEAP32[$2>>2] = $arglist_next12;
     $58 = $57&65535;
     $59 = $58 << 16 >> 16;
     $60 = ($59|0)<(0);
     $61 = $60 << 31 >> 31;
     $62 = $0;
     $63 = $62;
     HEAP32[$63>>2] = $59;
     $64 = (($62) + 4)|0;
     $65 = $64;
     HEAP32[$65>>2] = $61;
     break L1;
     break;
    }
    case 14:  {
     $arglist_current14 = HEAP32[$2>>2]|0;
     $66 = $arglist_current14;
     $67 = ((0) + 4|0);
     $expanded63 = $67;
     $expanded62 = (($expanded63) - 1)|0;
     $68 = (($66) + ($expanded62))|0;
     $69 = ((0) + 4|0);
     $expanded67 = $69;
     $expanded66 = (($expanded67) - 1)|0;
     $expanded65 = $expanded66 ^ -1;
     $70 = $68 & $expanded65;
     $71 = $70;
     $72 = HEAP32[$71>>2]|0;
     $arglist_next15 = ((($71)) + 4|0);
     HEAP32[$2>>2] = $arglist_next15;
     $$mask31 = $72 & 65535;
     $73 = $0;
     $74 = $73;
     HEAP32[$74>>2] = $$mask31;
     $75 = (($73) + 4)|0;
     $76 = $75;
     HEAP32[$76>>2] = 0;
     break L1;
     break;
    }
    case 15:  {
     $arglist_current17 = HEAP32[$2>>2]|0;
     $77 = $arglist_current17;
     $78 = ((0) + 4|0);
     $expanded70 = $78;
     $expanded69 = (($expanded70) - 1)|0;
     $79 = (($77) + ($expanded69))|0;
     $80 = ((0) + 4|0);
     $expanded74 = $80;
     $expanded73 = (($expanded74) - 1)|0;
     $expanded72 = $expanded73 ^ -1;
     $81 = $79 & $expanded72;
     $82 = $81;
     $83 = HEAP32[$82>>2]|0;
     $arglist_next18 = ((($82)) + 4|0);
     HEAP32[$2>>2] = $arglist_next18;
     $84 = $83&255;
     $85 = $84 << 24 >> 24;
     $86 = ($85|0)<(0);
     $87 = $86 << 31 >> 31;
     $88 = $0;
     $89 = $88;
     HEAP32[$89>>2] = $85;
     $90 = (($88) + 4)|0;
     $91 = $90;
     HEAP32[$91>>2] = $87;
     break L1;
     break;
    }
    case 16:  {
     $arglist_current20 = HEAP32[$2>>2]|0;
     $92 = $arglist_current20;
     $93 = ((0) + 4|0);
     $expanded77 = $93;
     $expanded76 = (($expanded77) - 1)|0;
     $94 = (($92) + ($expanded76))|0;
     $95 = ((0) + 4|0);
     $expanded81 = $95;
     $expanded80 = (($expanded81) - 1)|0;
     $expanded79 = $expanded80 ^ -1;
     $96 = $94 & $expanded79;
     $97 = $96;
     $98 = HEAP32[$97>>2]|0;
     $arglist_next21 = ((($97)) + 4|0);
     HEAP32[$2>>2] = $arglist_next21;
     $$mask = $98 & 255;
     $99 = $0;
     $100 = $99;
     HEAP32[$100>>2] = $$mask;
     $101 = (($99) + 4)|0;
     $102 = $101;
     HEAP32[$102>>2] = 0;
     break L1;
     break;
    }
    case 17:  {
     $arglist_current23 = HEAP32[$2>>2]|0;
     $103 = $arglist_current23;
     $104 = ((0) + 8|0);
     $expanded84 = $104;
     $expanded83 = (($expanded84) - 1)|0;
     $105 = (($103) + ($expanded83))|0;
     $106 = ((0) + 8|0);
     $expanded88 = $106;
     $expanded87 = (($expanded88) - 1)|0;
     $expanded86 = $expanded87 ^ -1;
     $107 = $105 & $expanded86;
     $108 = $107;
     $109 = +HEAPF64[$108>>3];
     $arglist_next24 = ((($108)) + 8|0);
     HEAP32[$2>>2] = $arglist_next24;
     HEAPF64[$0>>3] = $109;
     break L1;
     break;
    }
    case 18:  {
     $arglist_current26 = HEAP32[$2>>2]|0;
     $110 = $arglist_current26;
     $111 = ((0) + 8|0);
     $expanded91 = $111;
     $expanded90 = (($expanded91) - 1)|0;
     $112 = (($110) + ($expanded90))|0;
     $113 = ((0) + 8|0);
     $expanded95 = $113;
     $expanded94 = (($expanded95) - 1)|0;
     $expanded93 = $expanded94 ^ -1;
     $114 = $112 & $expanded93;
     $115 = $114;
     $116 = +HEAPF64[$115>>3];
     $arglist_next27 = ((($115)) + 8|0);
     HEAP32[$2>>2] = $arglist_next27;
     HEAPF64[$0>>3] = $116;
     break L1;
     break;
    }
    default: {
     break L1;
    }
    }
   } while(0);
  }
 } while(0);
 return;
}
function _fmt_x($0,$1,$2,$3) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 var $$05$lcssa = 0, $$056 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0;
 var sp = 0;
 sp = STACKTOP;
 $4 = ($0|0)==(0);
 $5 = ($1|0)==(0);
 $6 = $4 & $5;
 if ($6) {
  $$05$lcssa = $2;
 } else {
  $$056 = $2;$15 = $1;$8 = $0;
  while(1) {
   $7 = $8 & 15;
   $9 = (6295 + ($7)|0);
   $10 = HEAP8[$9>>0]|0;
   $11 = $10&255;
   $12 = $11 | $3;
   $13 = $12&255;
   $14 = ((($$056)) + -1|0);
   HEAP8[$14>>0] = $13;
   $16 = (_bitshift64Lshr(($8|0),($15|0),4)|0);
   $17 = tempRet0;
   $18 = ($16|0)==(0);
   $19 = ($17|0)==(0);
   $20 = $18 & $19;
   if ($20) {
    $$05$lcssa = $14;
    break;
   } else {
    $$056 = $14;$15 = $17;$8 = $16;
   }
  }
 }
 return ($$05$lcssa|0);
}
function _fmt_o($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $$0$lcssa = 0, $$06 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $3 = ($0|0)==(0);
 $4 = ($1|0)==(0);
 $5 = $3 & $4;
 if ($5) {
  $$0$lcssa = $2;
 } else {
  $$06 = $2;$11 = $1;$7 = $0;
  while(1) {
   $6 = $7&255;
   $8 = $6 & 7;
   $9 = $8 | 48;
   $10 = ((($$06)) + -1|0);
   HEAP8[$10>>0] = $9;
   $12 = (_bitshift64Lshr(($7|0),($11|0),3)|0);
   $13 = tempRet0;
   $14 = ($12|0)==(0);
   $15 = ($13|0)==(0);
   $16 = $14 & $15;
   if ($16) {
    $$0$lcssa = $10;
    break;
   } else {
    $$06 = $10;$11 = $13;$7 = $12;
   }
  }
 }
 return ($$0$lcssa|0);
}
function _fmt_u($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $$010$lcssa$off0 = 0, $$012 = 0, $$09$lcssa = 0, $$0914 = 0, $$1$lcssa = 0, $$111 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0;
 var $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $3 = ($1>>>0)>(0);
 $4 = ($0>>>0)>(4294967295);
 $5 = ($1|0)==(0);
 $6 = $5 & $4;
 $7 = $3 | $6;
 if ($7) {
  $$0914 = $2;$8 = $0;$9 = $1;
  while(1) {
   $10 = (___uremdi3(($8|0),($9|0),10,0)|0);
   $11 = tempRet0;
   $12 = $10&255;
   $13 = $12 | 48;
   $14 = ((($$0914)) + -1|0);
   HEAP8[$14>>0] = $13;
   $15 = (___udivdi3(($8|0),($9|0),10,0)|0);
   $16 = tempRet0;
   $17 = ($9>>>0)>(9);
   $18 = ($8>>>0)>(4294967295);
   $19 = ($9|0)==(9);
   $20 = $19 & $18;
   $21 = $17 | $20;
   if ($21) {
    $$0914 = $14;$8 = $15;$9 = $16;
   } else {
    break;
   }
  }
  $$010$lcssa$off0 = $15;$$09$lcssa = $14;
 } else {
  $$010$lcssa$off0 = $0;$$09$lcssa = $2;
 }
 $22 = ($$010$lcssa$off0|0)==(0);
 if ($22) {
  $$1$lcssa = $$09$lcssa;
 } else {
  $$012 = $$010$lcssa$off0;$$111 = $$09$lcssa;
  while(1) {
   $23 = (($$012>>>0) % 10)&-1;
   $24 = $23 | 48;
   $25 = $24&255;
   $26 = ((($$111)) + -1|0);
   HEAP8[$26>>0] = $25;
   $27 = (($$012>>>0) / 10)&-1;
   $28 = ($$012>>>0)<(10);
   if ($28) {
    $$1$lcssa = $26;
    break;
   } else {
    $$012 = $27;$$111 = $26;
   }
  }
 }
 return ($$1$lcssa|0);
}
function _strerror($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = (___pthread_self_104()|0);
 $2 = ((($1)) + 188|0);
 $3 = HEAP32[$2>>2]|0;
 $4 = (___strerror_l($0,$3)|0);
 return ($4|0);
}
function _memchr($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $$0$lcssa = 0, $$035$lcssa = 0, $$035$lcssa65 = 0, $$03555 = 0, $$036$lcssa = 0, $$036$lcssa64 = 0, $$03654 = 0, $$046 = 0, $$137$lcssa = 0, $$13745 = 0, $$140 = 0, $$2 = 0, $$23839 = 0, $$3 = 0, $$lcssa = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0;
 var $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0;
 var $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $or$cond = 0, $or$cond53 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $3 = $1 & 255;
 $4 = $0;
 $5 = $4 & 3;
 $6 = ($5|0)!=(0);
 $7 = ($2|0)!=(0);
 $or$cond53 = $7 & $6;
 L1: do {
  if ($or$cond53) {
   $8 = $1&255;
   $$03555 = $0;$$03654 = $2;
   while(1) {
    $9 = HEAP8[$$03555>>0]|0;
    $10 = ($9<<24>>24)==($8<<24>>24);
    if ($10) {
     $$035$lcssa65 = $$03555;$$036$lcssa64 = $$03654;
     label = 6;
     break L1;
    }
    $11 = ((($$03555)) + 1|0);
    $12 = (($$03654) + -1)|0;
    $13 = $11;
    $14 = $13 & 3;
    $15 = ($14|0)!=(0);
    $16 = ($12|0)!=(0);
    $or$cond = $16 & $15;
    if ($or$cond) {
     $$03555 = $11;$$03654 = $12;
    } else {
     $$035$lcssa = $11;$$036$lcssa = $12;$$lcssa = $16;
     label = 5;
     break;
    }
   }
  } else {
   $$035$lcssa = $0;$$036$lcssa = $2;$$lcssa = $7;
   label = 5;
  }
 } while(0);
 if ((label|0) == 5) {
  if ($$lcssa) {
   $$035$lcssa65 = $$035$lcssa;$$036$lcssa64 = $$036$lcssa;
   label = 6;
  } else {
   $$2 = $$035$lcssa;$$3 = 0;
  }
 }
 L8: do {
  if ((label|0) == 6) {
   $17 = HEAP8[$$035$lcssa65>>0]|0;
   $18 = $1&255;
   $19 = ($17<<24>>24)==($18<<24>>24);
   if ($19) {
    $$2 = $$035$lcssa65;$$3 = $$036$lcssa64;
   } else {
    $20 = Math_imul($3, 16843009)|0;
    $21 = ($$036$lcssa64>>>0)>(3);
    L11: do {
     if ($21) {
      $$046 = $$035$lcssa65;$$13745 = $$036$lcssa64;
      while(1) {
       $22 = HEAP32[$$046>>2]|0;
       $23 = $22 ^ $20;
       $24 = (($23) + -16843009)|0;
       $25 = $23 & -2139062144;
       $26 = $25 ^ -2139062144;
       $27 = $26 & $24;
       $28 = ($27|0)==(0);
       if (!($28)) {
        break;
       }
       $29 = ((($$046)) + 4|0);
       $30 = (($$13745) + -4)|0;
       $31 = ($30>>>0)>(3);
       if ($31) {
        $$046 = $29;$$13745 = $30;
       } else {
        $$0$lcssa = $29;$$137$lcssa = $30;
        label = 11;
        break L11;
       }
      }
      $$140 = $$046;$$23839 = $$13745;
     } else {
      $$0$lcssa = $$035$lcssa65;$$137$lcssa = $$036$lcssa64;
      label = 11;
     }
    } while(0);
    if ((label|0) == 11) {
     $32 = ($$137$lcssa|0)==(0);
     if ($32) {
      $$2 = $$0$lcssa;$$3 = 0;
      break;
     } else {
      $$140 = $$0$lcssa;$$23839 = $$137$lcssa;
     }
    }
    while(1) {
     $33 = HEAP8[$$140>>0]|0;
     $34 = ($33<<24>>24)==($18<<24>>24);
     if ($34) {
      $$2 = $$140;$$3 = $$23839;
      break L8;
     }
     $35 = ((($$140)) + 1|0);
     $36 = (($$23839) + -1)|0;
     $37 = ($36|0)==(0);
     if ($37) {
      $$2 = $35;$$3 = 0;
      break;
     } else {
      $$140 = $35;$$23839 = $36;
     }
    }
   }
  }
 } while(0);
 $38 = ($$3|0)!=(0);
 $39 = $38 ? $$2 : 0;
 return ($39|0);
}
function _pad_684($0,$1,$2,$3,$4) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 $4 = $4|0;
 var $$0$lcssa = 0, $$011 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $or$cond = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 256|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(256|0);
 $5 = sp;
 $6 = $4 & 73728;
 $7 = ($6|0)==(0);
 $8 = ($2|0)>($3|0);
 $or$cond = $8 & $7;
 if ($or$cond) {
  $9 = (($2) - ($3))|0;
  $10 = ($9>>>0)<(256);
  $11 = $10 ? $9 : 256;
  _memset(($5|0),($1|0),($11|0))|0;
  $12 = ($9>>>0)>(255);
  if ($12) {
   $13 = (($2) - ($3))|0;
   $$011 = $9;
   while(1) {
    _out($0,$5,256);
    $14 = (($$011) + -256)|0;
    $15 = ($14>>>0)>(255);
    if ($15) {
     $$011 = $14;
    } else {
     break;
    }
   }
   $16 = $13 & 255;
   $$0$lcssa = $16;
  } else {
   $$0$lcssa = $9;
  }
  _out($0,$5,$$0$lcssa);
 }
 STACKTOP = sp;return;
}
function _wctomb($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $$0 = 0, $2 = 0, $3 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $2 = ($0|0)==(0|0);
 if ($2) {
  $$0 = 0;
 } else {
  $3 = (_wcrtomb($0,$1,0)|0);
  $$0 = $3;
 }
 return ($$0|0);
}
function _fmt_fp($0,$1,$2,$3,$4,$5) {
 $0 = $0|0;
 $1 = +$1;
 $2 = $2|0;
 $3 = $3|0;
 $4 = $4|0;
 $5 = $5|0;
 var $$ = 0, $$$ = 0, $$$$559 = 0.0, $$$3484 = 0, $$$3484691 = 0, $$$3484692 = 0, $$$3501 = 0, $$$4502 = 0, $$$542 = 0.0, $$$559 = 0.0, $$0 = 0, $$0463$lcssa = 0, $$0463584 = 0, $$0464594 = 0, $$0471 = 0.0, $$0479 = 0, $$0487642 = 0, $$0488 = 0, $$0488653 = 0, $$0488655 = 0;
 var $$0496$$9 = 0, $$0497654 = 0, $$0498 = 0, $$0509582 = 0.0, $$0510 = 0, $$0511 = 0, $$0514637 = 0, $$0520 = 0, $$0521 = 0, $$0521$ = 0, $$0523 = 0, $$0525 = 0, $$0527 = 0, $$0527629 = 0, $$0527631 = 0, $$0530636 = 0, $$1465 = 0, $$1467 = 0.0, $$1469 = 0.0, $$1472 = 0.0;
 var $$1480 = 0, $$1482$lcssa = 0, $$1482661 = 0, $$1489641 = 0, $$1499$lcssa = 0, $$1499660 = 0, $$1508583 = 0, $$1512$lcssa = 0, $$1512607 = 0, $$1515 = 0, $$1524 = 0, $$1526 = 0, $$1528614 = 0, $$1531$lcssa = 0, $$1531630 = 0, $$1598 = 0, $$2 = 0, $$2473 = 0.0, $$2476 = 0, $$2476$$547 = 0;
 var $$2476$$549 = 0, $$2483$ph = 0, $$2500 = 0, $$2513 = 0, $$2516618 = 0, $$2529 = 0, $$2532617 = 0, $$3 = 0.0, $$3477 = 0, $$3484$lcssa = 0, $$3484648 = 0, $$3501$lcssa = 0, $$3501647 = 0, $$3533613 = 0, $$4 = 0.0, $$4478$lcssa = 0, $$4478590 = 0, $$4492 = 0, $$4502 = 0, $$4518 = 0;
 var $$5$lcssa = 0, $$534$ = 0, $$539 = 0, $$539$ = 0, $$542 = 0.0, $$546 = 0, $$548 = 0, $$5486$lcssa = 0, $$5486623 = 0, $$5493597 = 0, $$5519$ph = 0, $$555 = 0, $$556 = 0, $$559 = 0.0, $$5602 = 0, $$6 = 0, $$6494589 = 0, $$7495601 = 0, $$7505 = 0, $$7505$ = 0;
 var $$7505$ph = 0, $$8 = 0, $$9$ph = 0, $$lcssa673 = 0, $$neg = 0, $$neg567 = 0, $$pn = 0, $$pn566 = 0, $$pr = 0, $$pr564 = 0, $$pre = 0, $$pre$phi690Z2D = 0, $$pre689 = 0, $$sink545$lcssa = 0, $$sink545622 = 0, $$sink562 = 0, $10 = 0, $100 = 0, $101 = 0, $102 = 0;
 var $103 = 0, $104 = 0, $105 = 0, $106 = 0, $107 = 0, $108 = 0, $109 = 0.0, $11 = 0, $110 = 0, $111 = 0, $112 = 0, $113 = 0, $114 = 0, $115 = 0, $116 = 0.0, $117 = 0.0, $118 = 0.0, $119 = 0, $12 = 0, $120 = 0;
 var $121 = 0, $122 = 0, $123 = 0, $124 = 0, $125 = 0, $126 = 0, $127 = 0, $128 = 0, $129 = 0, $13 = 0, $130 = 0, $131 = 0, $132 = 0, $133 = 0, $134 = 0, $135 = 0, $136 = 0, $137 = 0, $138 = 0, $139 = 0;
 var $14 = 0.0, $140 = 0, $141 = 0, $142 = 0, $143 = 0, $144 = 0, $145 = 0, $146 = 0, $147 = 0, $148 = 0, $149 = 0, $15 = 0, $150 = 0, $151 = 0, $152 = 0, $153 = 0, $154 = 0, $155 = 0, $156 = 0, $157 = 0;
 var $158 = 0, $159 = 0, $16 = 0, $160 = 0, $161 = 0, $162 = 0, $163 = 0, $164 = 0, $165 = 0, $166 = 0, $167 = 0, $168 = 0, $169 = 0, $17 = 0, $170 = 0, $171 = 0, $172 = 0, $173 = 0, $174 = 0, $175 = 0;
 var $176 = 0, $177 = 0, $178 = 0, $179 = 0, $18 = 0, $180 = 0, $181 = 0, $182 = 0, $183 = 0, $184 = 0, $185 = 0, $186 = 0, $187 = 0, $188 = 0, $189 = 0, $19 = 0, $190 = 0, $191 = 0, $192 = 0, $193 = 0;
 var $194 = 0, $195 = 0, $196 = 0, $197 = 0, $198 = 0, $199 = 0, $20 = 0, $200 = 0, $201 = 0, $202 = 0, $203 = 0, $204 = 0, $205 = 0, $206 = 0, $207 = 0, $208 = 0, $209 = 0, $21 = 0, $210 = 0, $211 = 0;
 var $212 = 0, $213 = 0, $214 = 0, $215 = 0, $216 = 0, $217 = 0, $218 = 0, $219 = 0, $22 = 0, $220 = 0, $221 = 0, $222 = 0, $223 = 0, $224 = 0, $225 = 0, $226 = 0, $227 = 0, $228 = 0.0, $229 = 0.0, $23 = 0;
 var $230 = 0, $231 = 0.0, $232 = 0, $233 = 0, $234 = 0, $235 = 0, $236 = 0, $237 = 0, $238 = 0, $239 = 0, $24 = 0, $240 = 0, $241 = 0, $242 = 0, $243 = 0, $244 = 0, $245 = 0, $246 = 0, $247 = 0, $248 = 0;
 var $249 = 0, $25 = 0, $250 = 0, $251 = 0, $252 = 0, $253 = 0, $254 = 0, $255 = 0, $256 = 0, $257 = 0, $258 = 0, $259 = 0, $26 = 0, $260 = 0, $261 = 0, $262 = 0, $263 = 0, $264 = 0, $265 = 0, $266 = 0;
 var $267 = 0, $268 = 0, $269 = 0, $27 = 0, $270 = 0, $271 = 0, $272 = 0, $273 = 0, $274 = 0, $275 = 0, $276 = 0, $277 = 0, $278 = 0, $279 = 0, $28 = 0, $280 = 0, $281 = 0, $282 = 0, $283 = 0, $284 = 0;
 var $285 = 0, $286 = 0, $287 = 0, $288 = 0, $289 = 0, $29 = 0, $290 = 0, $291 = 0, $292 = 0, $293 = 0, $294 = 0, $295 = 0, $296 = 0, $297 = 0, $298 = 0, $299 = 0, $30 = 0, $300 = 0, $301 = 0, $302 = 0;
 var $303 = 0, $304 = 0, $305 = 0, $306 = 0, $307 = 0, $308 = 0, $309 = 0, $31 = 0, $310 = 0, $311 = 0, $312 = 0, $313 = 0, $314 = 0, $315 = 0, $316 = 0, $317 = 0, $318 = 0, $319 = 0, $32 = 0, $320 = 0;
 var $321 = 0, $322 = 0, $323 = 0, $324 = 0, $325 = 0, $326 = 0, $327 = 0, $328 = 0, $329 = 0, $33 = 0, $330 = 0, $331 = 0, $332 = 0, $333 = 0, $334 = 0, $335 = 0, $336 = 0, $337 = 0, $338 = 0, $339 = 0;
 var $34 = 0, $340 = 0, $341 = 0, $342 = 0, $343 = 0, $344 = 0, $345 = 0, $346 = 0, $347 = 0, $348 = 0, $349 = 0, $35 = 0.0, $350 = 0, $351 = 0, $352 = 0, $353 = 0, $354 = 0, $355 = 0, $356 = 0, $357 = 0;
 var $358 = 0, $359 = 0, $36 = 0.0, $360 = 0, $361 = 0, $362 = 0, $363 = 0, $364 = 0, $365 = 0, $366 = 0, $367 = 0, $368 = 0, $369 = 0, $37 = 0, $370 = 0, $371 = 0, $372 = 0, $373 = 0, $374 = 0, $375 = 0;
 var $376 = 0, $377 = 0, $378 = 0, $379 = 0, $38 = 0, $380 = 0, $381 = 0, $382 = 0, $383 = 0, $384 = 0, $385 = 0, $386 = 0, $387 = 0, $388 = 0, $39 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0;
 var $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $50 = 0, $51 = 0.0, $52 = 0, $53 = 0, $54 = 0, $55 = 0.0, $56 = 0.0, $57 = 0.0, $58 = 0.0, $59 = 0.0, $6 = 0, $60 = 0.0, $61 = 0, $62 = 0, $63 = 0;
 var $64 = 0, $65 = 0, $66 = 0, $67 = 0, $68 = 0, $69 = 0, $7 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $78 = 0, $79 = 0, $8 = 0, $80 = 0, $81 = 0;
 var $82 = 0, $83 = 0, $84 = 0, $85 = 0, $86 = 0, $87 = 0.0, $88 = 0.0, $89 = 0.0, $9 = 0, $90 = 0, $91 = 0, $92 = 0, $93 = 0, $94 = 0, $95 = 0, $96 = 0, $97 = 0, $98 = 0, $99 = 0, $exitcond = 0;
 var $narrow = 0, $not$ = 0, $notlhs = 0, $notrhs = 0, $or$cond = 0, $or$cond3$not = 0, $or$cond537 = 0, $or$cond541 = 0, $or$cond544 = 0, $or$cond554 = 0, $or$cond6 = 0, $scevgep684 = 0, $scevgep684685 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 560|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(560|0);
 $6 = sp + 8|0;
 $7 = sp;
 $8 = sp + 524|0;
 $9 = $8;
 $10 = sp + 512|0;
 HEAP32[$7>>2] = 0;
 $11 = ((($10)) + 12|0);
 (___DOUBLE_BITS_685($1)|0);
 $12 = tempRet0;
 $13 = ($12|0)<(0);
 if ($13) {
  $14 = -$1;
  $$0471 = $14;$$0520 = 1;$$0521 = 6260;
 } else {
  $15 = $4 & 2048;
  $16 = ($15|0)==(0);
  $17 = $4 & 1;
  $18 = ($17|0)==(0);
  $$ = $18 ? (6261) : (6266);
  $$$ = $16 ? $$ : (6263);
  $19 = $4 & 2049;
  $narrow = ($19|0)!=(0);
  $$534$ = $narrow&1;
  $$0471 = $1;$$0520 = $$534$;$$0521 = $$$;
 }
 (___DOUBLE_BITS_685($$0471)|0);
 $20 = tempRet0;
 $21 = $20 & 2146435072;
 $22 = ($21>>>0)<(2146435072);
 $23 = (0)<(0);
 $24 = ($21|0)==(2146435072);
 $25 = $24 & $23;
 $26 = $22 | $25;
 do {
  if ($26) {
   $35 = (+_frexpl($$0471,$7));
   $36 = $35 * 2.0;
   $37 = $36 != 0.0;
   if ($37) {
    $38 = HEAP32[$7>>2]|0;
    $39 = (($38) + -1)|0;
    HEAP32[$7>>2] = $39;
   }
   $40 = $5 | 32;
   $41 = ($40|0)==(97);
   if ($41) {
    $42 = $5 & 32;
    $43 = ($42|0)==(0);
    $44 = ((($$0521)) + 9|0);
    $$0521$ = $43 ? $$0521 : $44;
    $45 = $$0520 | 2;
    $46 = ($3>>>0)>(11);
    $47 = (12 - ($3))|0;
    $48 = ($47|0)==(0);
    $49 = $46 | $48;
    do {
     if ($49) {
      $$1472 = $36;
     } else {
      $$0509582 = 8.0;$$1508583 = $47;
      while(1) {
       $50 = (($$1508583) + -1)|0;
       $51 = $$0509582 * 16.0;
       $52 = ($50|0)==(0);
       if ($52) {
        break;
       } else {
        $$0509582 = $51;$$1508583 = $50;
       }
      }
      $53 = HEAP8[$$0521$>>0]|0;
      $54 = ($53<<24>>24)==(45);
      if ($54) {
       $55 = -$36;
       $56 = $55 - $51;
       $57 = $51 + $56;
       $58 = -$57;
       $$1472 = $58;
       break;
      } else {
       $59 = $36 + $51;
       $60 = $59 - $51;
       $$1472 = $60;
       break;
      }
     }
    } while(0);
    $61 = HEAP32[$7>>2]|0;
    $62 = ($61|0)<(0);
    $63 = (0 - ($61))|0;
    $64 = $62 ? $63 : $61;
    $65 = ($64|0)<(0);
    $66 = $65 << 31 >> 31;
    $67 = (_fmt_u($64,$66,$11)|0);
    $68 = ($67|0)==($11|0);
    if ($68) {
     $69 = ((($10)) + 11|0);
     HEAP8[$69>>0] = 48;
     $$0511 = $69;
    } else {
     $$0511 = $67;
    }
    $70 = $61 >> 31;
    $71 = $70 & 2;
    $72 = (($71) + 43)|0;
    $73 = $72&255;
    $74 = ((($$0511)) + -1|0);
    HEAP8[$74>>0] = $73;
    $75 = (($5) + 15)|0;
    $76 = $75&255;
    $77 = ((($$0511)) + -2|0);
    HEAP8[$77>>0] = $76;
    $notrhs = ($3|0)<(1);
    $78 = $4 & 8;
    $79 = ($78|0)==(0);
    $$0523 = $8;$$2473 = $$1472;
    while(1) {
     $80 = (~~(($$2473)));
     $81 = (6295 + ($80)|0);
     $82 = HEAP8[$81>>0]|0;
     $83 = $82&255;
     $84 = $83 | $42;
     $85 = $84&255;
     $86 = ((($$0523)) + 1|0);
     HEAP8[$$0523>>0] = $85;
     $87 = (+($80|0));
     $88 = $$2473 - $87;
     $89 = $88 * 16.0;
     $90 = $86;
     $91 = (($90) - ($9))|0;
     $92 = ($91|0)==(1);
     if ($92) {
      $notlhs = $89 == 0.0;
      $or$cond3$not = $notrhs & $notlhs;
      $or$cond = $79 & $or$cond3$not;
      if ($or$cond) {
       $$1524 = $86;
      } else {
       $93 = ((($$0523)) + 2|0);
       HEAP8[$86>>0] = 46;
       $$1524 = $93;
      }
     } else {
      $$1524 = $86;
     }
     $94 = $89 != 0.0;
     if ($94) {
      $$0523 = $$1524;$$2473 = $89;
     } else {
      break;
     }
    }
    $95 = ($3|0)!=(0);
    $96 = $77;
    $97 = $11;
    $98 = $$1524;
    $99 = (($98) - ($9))|0;
    $100 = (($97) - ($96))|0;
    $101 = (($99) + -2)|0;
    $102 = ($101|0)<($3|0);
    $or$cond537 = $95 & $102;
    $103 = (($3) + 2)|0;
    $$pn = $or$cond537 ? $103 : $99;
    $$0525 = (($100) + ($45))|0;
    $104 = (($$0525) + ($$pn))|0;
    _pad_684($0,32,$2,$104,$4);
    _out($0,$$0521$,$45);
    $105 = $4 ^ 65536;
    _pad_684($0,48,$2,$104,$105);
    _out($0,$8,$99);
    $106 = (($$pn) - ($99))|0;
    _pad_684($0,48,$106,0,0);
    _out($0,$77,$100);
    $107 = $4 ^ 8192;
    _pad_684($0,32,$2,$104,$107);
    $$sink562 = $104;
    break;
   }
   $108 = ($3|0)<(0);
   $$539 = $108 ? 6 : $3;
   if ($37) {
    $109 = $36 * 268435456.0;
    $110 = HEAP32[$7>>2]|0;
    $111 = (($110) + -28)|0;
    HEAP32[$7>>2] = $111;
    $$3 = $109;$$pr = $111;
   } else {
    $$pre = HEAP32[$7>>2]|0;
    $$3 = $36;$$pr = $$pre;
   }
   $112 = ($$pr|0)<(0);
   $113 = ((($6)) + 288|0);
   $$556 = $112 ? $6 : $113;
   $$0498 = $$556;$$4 = $$3;
   while(1) {
    $114 = (~~(($$4))>>>0);
    HEAP32[$$0498>>2] = $114;
    $115 = ((($$0498)) + 4|0);
    $116 = (+($114>>>0));
    $117 = $$4 - $116;
    $118 = $117 * 1.0E+9;
    $119 = $118 != 0.0;
    if ($119) {
     $$0498 = $115;$$4 = $118;
    } else {
     break;
    }
   }
   $120 = ($$pr|0)>(0);
   if ($120) {
    $$1482661 = $$556;$$1499660 = $115;$122 = $$pr;
    while(1) {
     $121 = ($122|0)<(29);
     $123 = $121 ? $122 : 29;
     $$0488653 = ((($$1499660)) + -4|0);
     $124 = ($$0488653>>>0)<($$1482661>>>0);
     if ($124) {
      $$2483$ph = $$1482661;
     } else {
      $$0488655 = $$0488653;$$0497654 = 0;
      while(1) {
       $125 = HEAP32[$$0488655>>2]|0;
       $126 = (_bitshift64Shl(($125|0),0,($123|0))|0);
       $127 = tempRet0;
       $128 = (_i64Add(($126|0),($127|0),($$0497654|0),0)|0);
       $129 = tempRet0;
       $130 = (___uremdi3(($128|0),($129|0),1000000000,0)|0);
       $131 = tempRet0;
       HEAP32[$$0488655>>2] = $130;
       $132 = (___udivdi3(($128|0),($129|0),1000000000,0)|0);
       $133 = tempRet0;
       $$0488 = ((($$0488655)) + -4|0);
       $134 = ($$0488>>>0)<($$1482661>>>0);
       if ($134) {
        break;
       } else {
        $$0488655 = $$0488;$$0497654 = $132;
       }
      }
      $135 = ($132|0)==(0);
      if ($135) {
       $$2483$ph = $$1482661;
      } else {
       $136 = ((($$1482661)) + -4|0);
       HEAP32[$136>>2] = $132;
       $$2483$ph = $136;
      }
     }
     $$2500 = $$1499660;
     while(1) {
      $137 = ($$2500>>>0)>($$2483$ph>>>0);
      if (!($137)) {
       break;
      }
      $138 = ((($$2500)) + -4|0);
      $139 = HEAP32[$138>>2]|0;
      $140 = ($139|0)==(0);
      if ($140) {
       $$2500 = $138;
      } else {
       break;
      }
     }
     $141 = HEAP32[$7>>2]|0;
     $142 = (($141) - ($123))|0;
     HEAP32[$7>>2] = $142;
     $143 = ($142|0)>(0);
     if ($143) {
      $$1482661 = $$2483$ph;$$1499660 = $$2500;$122 = $142;
     } else {
      $$1482$lcssa = $$2483$ph;$$1499$lcssa = $$2500;$$pr564 = $142;
      break;
     }
    }
   } else {
    $$1482$lcssa = $$556;$$1499$lcssa = $115;$$pr564 = $$pr;
   }
   $144 = ($$pr564|0)<(0);
   if ($144) {
    $145 = (($$539) + 25)|0;
    $146 = (($145|0) / 9)&-1;
    $147 = (($146) + 1)|0;
    $148 = ($40|0)==(102);
    $$3484648 = $$1482$lcssa;$$3501647 = $$1499$lcssa;$150 = $$pr564;
    while(1) {
     $149 = (0 - ($150))|0;
     $151 = ($149|0)<(9);
     $152 = $151 ? $149 : 9;
     $153 = ($$3484648>>>0)<($$3501647>>>0);
     if ($153) {
      $157 = 1 << $152;
      $158 = (($157) + -1)|0;
      $159 = 1000000000 >>> $152;
      $$0487642 = 0;$$1489641 = $$3484648;
      while(1) {
       $160 = HEAP32[$$1489641>>2]|0;
       $161 = $160 & $158;
       $162 = $160 >>> $152;
       $163 = (($162) + ($$0487642))|0;
       HEAP32[$$1489641>>2] = $163;
       $164 = Math_imul($161, $159)|0;
       $165 = ((($$1489641)) + 4|0);
       $166 = ($165>>>0)<($$3501647>>>0);
       if ($166) {
        $$0487642 = $164;$$1489641 = $165;
       } else {
        break;
       }
      }
      $167 = HEAP32[$$3484648>>2]|0;
      $168 = ($167|0)==(0);
      $169 = ((($$3484648)) + 4|0);
      $$$3484 = $168 ? $169 : $$3484648;
      $170 = ($164|0)==(0);
      if ($170) {
       $$$3484692 = $$$3484;$$4502 = $$3501647;
      } else {
       $171 = ((($$3501647)) + 4|0);
       HEAP32[$$3501647>>2] = $164;
       $$$3484692 = $$$3484;$$4502 = $171;
      }
     } else {
      $154 = HEAP32[$$3484648>>2]|0;
      $155 = ($154|0)==(0);
      $156 = ((($$3484648)) + 4|0);
      $$$3484691 = $155 ? $156 : $$3484648;
      $$$3484692 = $$$3484691;$$4502 = $$3501647;
     }
     $172 = $148 ? $$556 : $$$3484692;
     $173 = $$4502;
     $174 = $172;
     $175 = (($173) - ($174))|0;
     $176 = $175 >> 2;
     $177 = ($176|0)>($147|0);
     $178 = (($172) + ($147<<2)|0);
     $$$4502 = $177 ? $178 : $$4502;
     $179 = HEAP32[$7>>2]|0;
     $180 = (($179) + ($152))|0;
     HEAP32[$7>>2] = $180;
     $181 = ($180|0)<(0);
     if ($181) {
      $$3484648 = $$$3484692;$$3501647 = $$$4502;$150 = $180;
     } else {
      $$3484$lcssa = $$$3484692;$$3501$lcssa = $$$4502;
      break;
     }
    }
   } else {
    $$3484$lcssa = $$1482$lcssa;$$3501$lcssa = $$1499$lcssa;
   }
   $182 = ($$3484$lcssa>>>0)<($$3501$lcssa>>>0);
   $183 = $$556;
   if ($182) {
    $184 = $$3484$lcssa;
    $185 = (($183) - ($184))|0;
    $186 = $185 >> 2;
    $187 = ($186*9)|0;
    $188 = HEAP32[$$3484$lcssa>>2]|0;
    $189 = ($188>>>0)<(10);
    if ($189) {
     $$1515 = $187;
    } else {
     $$0514637 = $187;$$0530636 = 10;
     while(1) {
      $190 = ($$0530636*10)|0;
      $191 = (($$0514637) + 1)|0;
      $192 = ($188>>>0)<($190>>>0);
      if ($192) {
       $$1515 = $191;
       break;
      } else {
       $$0514637 = $191;$$0530636 = $190;
      }
     }
    }
   } else {
    $$1515 = 0;
   }
   $193 = ($40|0)!=(102);
   $194 = $193 ? $$1515 : 0;
   $195 = (($$539) - ($194))|0;
   $196 = ($40|0)==(103);
   $197 = ($$539|0)!=(0);
   $198 = $197 & $196;
   $$neg = $198 << 31 >> 31;
   $199 = (($195) + ($$neg))|0;
   $200 = $$3501$lcssa;
   $201 = (($200) - ($183))|0;
   $202 = $201 >> 2;
   $203 = ($202*9)|0;
   $204 = (($203) + -9)|0;
   $205 = ($199|0)<($204|0);
   if ($205) {
    $206 = ((($$556)) + 4|0);
    $207 = (($199) + 9216)|0;
    $208 = (($207|0) / 9)&-1;
    $209 = (($208) + -1024)|0;
    $210 = (($206) + ($209<<2)|0);
    $211 = (($207|0) % 9)&-1;
    $$0527629 = (($211) + 1)|0;
    $212 = ($$0527629|0)<(9);
    if ($212) {
     $$0527631 = $$0527629;$$1531630 = 10;
     while(1) {
      $213 = ($$1531630*10)|0;
      $$0527 = (($$0527631) + 1)|0;
      $exitcond = ($$0527|0)==(9);
      if ($exitcond) {
       $$1531$lcssa = $213;
       break;
      } else {
       $$0527631 = $$0527;$$1531630 = $213;
      }
     }
    } else {
     $$1531$lcssa = 10;
    }
    $214 = HEAP32[$210>>2]|0;
    $215 = (($214>>>0) % ($$1531$lcssa>>>0))&-1;
    $216 = ($215|0)==(0);
    $217 = ((($210)) + 4|0);
    $218 = ($217|0)==($$3501$lcssa|0);
    $or$cond541 = $218 & $216;
    if ($or$cond541) {
     $$4492 = $210;$$4518 = $$1515;$$8 = $$3484$lcssa;
    } else {
     $219 = (($214>>>0) / ($$1531$lcssa>>>0))&-1;
     $220 = $219 & 1;
     $221 = ($220|0)==(0);
     $$542 = $221 ? 9007199254740992.0 : 9007199254740994.0;
     $222 = (($$1531$lcssa|0) / 2)&-1;
     $223 = ($215>>>0)<($222>>>0);
     $224 = ($215|0)==($222|0);
     $or$cond544 = $218 & $224;
     $$559 = $or$cond544 ? 1.0 : 1.5;
     $$$559 = $223 ? 0.5 : $$559;
     $225 = ($$0520|0)==(0);
     if ($225) {
      $$1467 = $$$559;$$1469 = $$542;
     } else {
      $226 = HEAP8[$$0521>>0]|0;
      $227 = ($226<<24>>24)==(45);
      $228 = -$$542;
      $229 = -$$$559;
      $$$542 = $227 ? $228 : $$542;
      $$$$559 = $227 ? $229 : $$$559;
      $$1467 = $$$$559;$$1469 = $$$542;
     }
     $230 = (($214) - ($215))|0;
     HEAP32[$210>>2] = $230;
     $231 = $$1469 + $$1467;
     $232 = $231 != $$1469;
     if ($232) {
      $233 = (($230) + ($$1531$lcssa))|0;
      HEAP32[$210>>2] = $233;
      $234 = ($233>>>0)>(999999999);
      if ($234) {
       $$5486623 = $$3484$lcssa;$$sink545622 = $210;
       while(1) {
        $235 = ((($$sink545622)) + -4|0);
        HEAP32[$$sink545622>>2] = 0;
        $236 = ($235>>>0)<($$5486623>>>0);
        if ($236) {
         $237 = ((($$5486623)) + -4|0);
         HEAP32[$237>>2] = 0;
         $$6 = $237;
        } else {
         $$6 = $$5486623;
        }
        $238 = HEAP32[$235>>2]|0;
        $239 = (($238) + 1)|0;
        HEAP32[$235>>2] = $239;
        $240 = ($239>>>0)>(999999999);
        if ($240) {
         $$5486623 = $$6;$$sink545622 = $235;
        } else {
         $$5486$lcssa = $$6;$$sink545$lcssa = $235;
         break;
        }
       }
      } else {
       $$5486$lcssa = $$3484$lcssa;$$sink545$lcssa = $210;
      }
      $241 = $$5486$lcssa;
      $242 = (($183) - ($241))|0;
      $243 = $242 >> 2;
      $244 = ($243*9)|0;
      $245 = HEAP32[$$5486$lcssa>>2]|0;
      $246 = ($245>>>0)<(10);
      if ($246) {
       $$4492 = $$sink545$lcssa;$$4518 = $244;$$8 = $$5486$lcssa;
      } else {
       $$2516618 = $244;$$2532617 = 10;
       while(1) {
        $247 = ($$2532617*10)|0;
        $248 = (($$2516618) + 1)|0;
        $249 = ($245>>>0)<($247>>>0);
        if ($249) {
         $$4492 = $$sink545$lcssa;$$4518 = $248;$$8 = $$5486$lcssa;
         break;
        } else {
         $$2516618 = $248;$$2532617 = $247;
        }
       }
      }
     } else {
      $$4492 = $210;$$4518 = $$1515;$$8 = $$3484$lcssa;
     }
    }
    $250 = ((($$4492)) + 4|0);
    $251 = ($$3501$lcssa>>>0)>($250>>>0);
    $$$3501 = $251 ? $250 : $$3501$lcssa;
    $$5519$ph = $$4518;$$7505$ph = $$$3501;$$9$ph = $$8;
   } else {
    $$5519$ph = $$1515;$$7505$ph = $$3501$lcssa;$$9$ph = $$3484$lcssa;
   }
   $$7505 = $$7505$ph;
   while(1) {
    $252 = ($$7505>>>0)>($$9$ph>>>0);
    if (!($252)) {
     $$lcssa673 = 0;
     break;
    }
    $253 = ((($$7505)) + -4|0);
    $254 = HEAP32[$253>>2]|0;
    $255 = ($254|0)==(0);
    if ($255) {
     $$7505 = $253;
    } else {
     $$lcssa673 = 1;
     break;
    }
   }
   $256 = (0 - ($$5519$ph))|0;
   do {
    if ($196) {
     $not$ = $197 ^ 1;
     $257 = $not$&1;
     $$539$ = (($257) + ($$539))|0;
     $258 = ($$539$|0)>($$5519$ph|0);
     $259 = ($$5519$ph|0)>(-5);
     $or$cond6 = $258 & $259;
     if ($or$cond6) {
      $260 = (($5) + -1)|0;
      $$neg567 = (($$539$) + -1)|0;
      $261 = (($$neg567) - ($$5519$ph))|0;
      $$0479 = $260;$$2476 = $261;
     } else {
      $262 = (($5) + -2)|0;
      $263 = (($$539$) + -1)|0;
      $$0479 = $262;$$2476 = $263;
     }
     $264 = $4 & 8;
     $265 = ($264|0)==(0);
     if ($265) {
      if ($$lcssa673) {
       $266 = ((($$7505)) + -4|0);
       $267 = HEAP32[$266>>2]|0;
       $268 = ($267|0)==(0);
       if ($268) {
        $$2529 = 9;
       } else {
        $269 = (($267>>>0) % 10)&-1;
        $270 = ($269|0)==(0);
        if ($270) {
         $$1528614 = 0;$$3533613 = 10;
         while(1) {
          $271 = ($$3533613*10)|0;
          $272 = (($$1528614) + 1)|0;
          $273 = (($267>>>0) % ($271>>>0))&-1;
          $274 = ($273|0)==(0);
          if ($274) {
           $$1528614 = $272;$$3533613 = $271;
          } else {
           $$2529 = $272;
           break;
          }
         }
        } else {
         $$2529 = 0;
        }
       }
      } else {
       $$2529 = 9;
      }
      $275 = $$0479 | 32;
      $276 = ($275|0)==(102);
      $277 = $$7505;
      $278 = (($277) - ($183))|0;
      $279 = $278 >> 2;
      $280 = ($279*9)|0;
      $281 = (($280) + -9)|0;
      if ($276) {
       $282 = (($281) - ($$2529))|0;
       $283 = ($282|0)>(0);
       $$546 = $283 ? $282 : 0;
       $284 = ($$2476|0)<($$546|0);
       $$2476$$547 = $284 ? $$2476 : $$546;
       $$1480 = $$0479;$$3477 = $$2476$$547;$$pre$phi690Z2D = 0;
       break;
      } else {
       $285 = (($281) + ($$5519$ph))|0;
       $286 = (($285) - ($$2529))|0;
       $287 = ($286|0)>(0);
       $$548 = $287 ? $286 : 0;
       $288 = ($$2476|0)<($$548|0);
       $$2476$$549 = $288 ? $$2476 : $$548;
       $$1480 = $$0479;$$3477 = $$2476$$549;$$pre$phi690Z2D = 0;
       break;
      }
     } else {
      $$1480 = $$0479;$$3477 = $$2476;$$pre$phi690Z2D = $264;
     }
    } else {
     $$pre689 = $4 & 8;
     $$1480 = $5;$$3477 = $$539;$$pre$phi690Z2D = $$pre689;
    }
   } while(0);
   $289 = $$3477 | $$pre$phi690Z2D;
   $290 = ($289|0)!=(0);
   $291 = $290&1;
   $292 = $$1480 | 32;
   $293 = ($292|0)==(102);
   if ($293) {
    $294 = ($$5519$ph|0)>(0);
    $295 = $294 ? $$5519$ph : 0;
    $$2513 = 0;$$pn566 = $295;
   } else {
    $296 = ($$5519$ph|0)<(0);
    $297 = $296 ? $256 : $$5519$ph;
    $298 = ($297|0)<(0);
    $299 = $298 << 31 >> 31;
    $300 = (_fmt_u($297,$299,$11)|0);
    $301 = $11;
    $302 = $300;
    $303 = (($301) - ($302))|0;
    $304 = ($303|0)<(2);
    if ($304) {
     $$1512607 = $300;
     while(1) {
      $305 = ((($$1512607)) + -1|0);
      HEAP8[$305>>0] = 48;
      $306 = $305;
      $307 = (($301) - ($306))|0;
      $308 = ($307|0)<(2);
      if ($308) {
       $$1512607 = $305;
      } else {
       $$1512$lcssa = $305;
       break;
      }
     }
    } else {
     $$1512$lcssa = $300;
    }
    $309 = $$5519$ph >> 31;
    $310 = $309 & 2;
    $311 = (($310) + 43)|0;
    $312 = $311&255;
    $313 = ((($$1512$lcssa)) + -1|0);
    HEAP8[$313>>0] = $312;
    $314 = $$1480&255;
    $315 = ((($$1512$lcssa)) + -2|0);
    HEAP8[$315>>0] = $314;
    $316 = $315;
    $317 = (($301) - ($316))|0;
    $$2513 = $315;$$pn566 = $317;
   }
   $318 = (($$0520) + 1)|0;
   $319 = (($318) + ($$3477))|0;
   $$1526 = (($319) + ($291))|0;
   $320 = (($$1526) + ($$pn566))|0;
   _pad_684($0,32,$2,$320,$4);
   _out($0,$$0521,$$0520);
   $321 = $4 ^ 65536;
   _pad_684($0,48,$2,$320,$321);
   if ($293) {
    $322 = ($$9$ph>>>0)>($$556>>>0);
    $$0496$$9 = $322 ? $$556 : $$9$ph;
    $323 = ((($8)) + 9|0);
    $324 = $323;
    $325 = ((($8)) + 8|0);
    $$5493597 = $$0496$$9;
    while(1) {
     $326 = HEAP32[$$5493597>>2]|0;
     $327 = (_fmt_u($326,0,$323)|0);
     $328 = ($$5493597|0)==($$0496$$9|0);
     if ($328) {
      $334 = ($327|0)==($323|0);
      if ($334) {
       HEAP8[$325>>0] = 48;
       $$1465 = $325;
      } else {
       $$1465 = $327;
      }
     } else {
      $329 = ($327>>>0)>($8>>>0);
      if ($329) {
       $330 = $327;
       $331 = (($330) - ($9))|0;
       _memset(($8|0),48,($331|0))|0;
       $$0464594 = $327;
       while(1) {
        $332 = ((($$0464594)) + -1|0);
        $333 = ($332>>>0)>($8>>>0);
        if ($333) {
         $$0464594 = $332;
        } else {
         $$1465 = $332;
         break;
        }
       }
      } else {
       $$1465 = $327;
      }
     }
     $335 = $$1465;
     $336 = (($324) - ($335))|0;
     _out($0,$$1465,$336);
     $337 = ((($$5493597)) + 4|0);
     $338 = ($337>>>0)>($$556>>>0);
     if ($338) {
      break;
     } else {
      $$5493597 = $337;
     }
    }
    $339 = ($289|0)==(0);
    if (!($339)) {
     _out($0,6311,1);
    }
    $340 = ($337>>>0)<($$7505>>>0);
    $341 = ($$3477|0)>(0);
    $342 = $340 & $341;
    if ($342) {
     $$4478590 = $$3477;$$6494589 = $337;
     while(1) {
      $343 = HEAP32[$$6494589>>2]|0;
      $344 = (_fmt_u($343,0,$323)|0);
      $345 = ($344>>>0)>($8>>>0);
      if ($345) {
       $346 = $344;
       $347 = (($346) - ($9))|0;
       _memset(($8|0),48,($347|0))|0;
       $$0463584 = $344;
       while(1) {
        $348 = ((($$0463584)) + -1|0);
        $349 = ($348>>>0)>($8>>>0);
        if ($349) {
         $$0463584 = $348;
        } else {
         $$0463$lcssa = $348;
         break;
        }
       }
      } else {
       $$0463$lcssa = $344;
      }
      $350 = ($$4478590|0)<(9);
      $351 = $350 ? $$4478590 : 9;
      _out($0,$$0463$lcssa,$351);
      $352 = ((($$6494589)) + 4|0);
      $353 = (($$4478590) + -9)|0;
      $354 = ($352>>>0)<($$7505>>>0);
      $355 = ($$4478590|0)>(9);
      $356 = $354 & $355;
      if ($356) {
       $$4478590 = $353;$$6494589 = $352;
      } else {
       $$4478$lcssa = $353;
       break;
      }
     }
    } else {
     $$4478$lcssa = $$3477;
    }
    $357 = (($$4478$lcssa) + 9)|0;
    _pad_684($0,48,$357,9,0);
   } else {
    $358 = ((($$9$ph)) + 4|0);
    $$7505$ = $$lcssa673 ? $$7505 : $358;
    $359 = ($$3477|0)>(-1);
    if ($359) {
     $360 = ((($8)) + 9|0);
     $361 = ($$pre$phi690Z2D|0)==(0);
     $362 = $360;
     $363 = (0 - ($9))|0;
     $364 = ((($8)) + 8|0);
     $$5602 = $$3477;$$7495601 = $$9$ph;
     while(1) {
      $365 = HEAP32[$$7495601>>2]|0;
      $366 = (_fmt_u($365,0,$360)|0);
      $367 = ($366|0)==($360|0);
      if ($367) {
       HEAP8[$364>>0] = 48;
       $$0 = $364;
      } else {
       $$0 = $366;
      }
      $368 = ($$7495601|0)==($$9$ph|0);
      do {
       if ($368) {
        $372 = ((($$0)) + 1|0);
        _out($0,$$0,1);
        $373 = ($$5602|0)<(1);
        $or$cond554 = $361 & $373;
        if ($or$cond554) {
         $$2 = $372;
         break;
        }
        _out($0,6311,1);
        $$2 = $372;
       } else {
        $369 = ($$0>>>0)>($8>>>0);
        if (!($369)) {
         $$2 = $$0;
         break;
        }
        $scevgep684 = (($$0) + ($363)|0);
        $scevgep684685 = $scevgep684;
        _memset(($8|0),48,($scevgep684685|0))|0;
        $$1598 = $$0;
        while(1) {
         $370 = ((($$1598)) + -1|0);
         $371 = ($370>>>0)>($8>>>0);
         if ($371) {
          $$1598 = $370;
         } else {
          $$2 = $370;
          break;
         }
        }
       }
      } while(0);
      $374 = $$2;
      $375 = (($362) - ($374))|0;
      $376 = ($$5602|0)>($375|0);
      $377 = $376 ? $375 : $$5602;
      _out($0,$$2,$377);
      $378 = (($$5602) - ($375))|0;
      $379 = ((($$7495601)) + 4|0);
      $380 = ($379>>>0)<($$7505$>>>0);
      $381 = ($378|0)>(-1);
      $382 = $380 & $381;
      if ($382) {
       $$5602 = $378;$$7495601 = $379;
      } else {
       $$5$lcssa = $378;
       break;
      }
     }
    } else {
     $$5$lcssa = $$3477;
    }
    $383 = (($$5$lcssa) + 18)|0;
    _pad_684($0,48,$383,18,0);
    $384 = $11;
    $385 = $$2513;
    $386 = (($384) - ($385))|0;
    _out($0,$$2513,$386);
   }
   $387 = $4 ^ 8192;
   _pad_684($0,32,$2,$320,$387);
   $$sink562 = $320;
  } else {
   $27 = $5 & 32;
   $28 = ($27|0)!=(0);
   $29 = $28 ? 6279 : 6283;
   $30 = ($$0471 != $$0471) | (0.0 != 0.0);
   $31 = $28 ? 6287 : 6291;
   $$0510 = $30 ? $31 : $29;
   $32 = (($$0520) + 3)|0;
   $33 = $4 & -65537;
   _pad_684($0,32,$2,$32,$33);
   _out($0,$$0521,$$0520);
   _out($0,$$0510,3);
   $34 = $4 ^ 8192;
   _pad_684($0,32,$2,$32,$34);
   $$sink562 = $32;
  }
 } while(0);
 $388 = ($$sink562|0)<($2|0);
 $$555 = $388 ? $2 : $$sink562;
 STACKTOP = sp;return ($$555|0);
}
function ___DOUBLE_BITS_685($0) {
 $0 = +$0;
 var $1 = 0, $2 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 HEAPF64[tempDoublePtr>>3] = $0;$1 = HEAP32[tempDoublePtr>>2]|0;
 $2 = HEAP32[tempDoublePtr+4>>2]|0;
 tempRet0 = ($2);
 return ($1|0);
}
function _frexpl($0,$1) {
 $0 = +$0;
 $1 = $1|0;
 var $2 = 0.0, label = 0, sp = 0;
 sp = STACKTOP;
 $2 = (+_frexp($0,$1));
 return (+$2);
}
function _frexp($0,$1) {
 $0 = +$0;
 $1 = $1|0;
 var $$0 = 0.0, $$016 = 0.0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0.0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0.0, $9 = 0.0, $storemerge = 0, $trunc$clear = 0, label = 0;
 var sp = 0;
 sp = STACKTOP;
 HEAPF64[tempDoublePtr>>3] = $0;$2 = HEAP32[tempDoublePtr>>2]|0;
 $3 = HEAP32[tempDoublePtr+4>>2]|0;
 $4 = (_bitshift64Lshr(($2|0),($3|0),52)|0);
 $5 = tempRet0;
 $6 = $4&65535;
 $trunc$clear = $6 & 2047;
 switch ($trunc$clear<<16>>16) {
 case 0:  {
  $7 = $0 != 0.0;
  if ($7) {
   $8 = $0 * 1.8446744073709552E+19;
   $9 = (+_frexp($8,$1));
   $10 = HEAP32[$1>>2]|0;
   $11 = (($10) + -64)|0;
   $$016 = $9;$storemerge = $11;
  } else {
   $$016 = $0;$storemerge = 0;
  }
  HEAP32[$1>>2] = $storemerge;
  $$0 = $$016;
  break;
 }
 case 2047:  {
  $$0 = $0;
  break;
 }
 default: {
  $12 = $4 & 2047;
  $13 = (($12) + -1022)|0;
  HEAP32[$1>>2] = $13;
  $14 = $3 & -2146435073;
  $15 = $14 | 1071644672;
  HEAP32[tempDoublePtr>>2] = $2;HEAP32[tempDoublePtr+4>>2] = $15;$16 = +HEAPF64[tempDoublePtr>>3];
  $$0 = $16;
 }
 }
 return (+$$0);
}
function _wcrtomb($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $$0 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0;
 var $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0;
 var $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $not$ = 0, $or$cond = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $3 = ($0|0)==(0|0);
 do {
  if ($3) {
   $$0 = 1;
  } else {
   $4 = ($1>>>0)<(128);
   if ($4) {
    $5 = $1&255;
    HEAP8[$0>>0] = $5;
    $$0 = 1;
    break;
   }
   $6 = (___pthread_self_431()|0);
   $7 = ((($6)) + 188|0);
   $8 = HEAP32[$7>>2]|0;
   $9 = HEAP32[$8>>2]|0;
   $not$ = ($9|0)==(0|0);
   if ($not$) {
    $10 = $1 & -128;
    $11 = ($10|0)==(57216);
    if ($11) {
     $13 = $1&255;
     HEAP8[$0>>0] = $13;
     $$0 = 1;
     break;
    } else {
     $12 = (___errno_location()|0);
     HEAP32[$12>>2] = 84;
     $$0 = -1;
     break;
    }
   }
   $14 = ($1>>>0)<(2048);
   if ($14) {
    $15 = $1 >>> 6;
    $16 = $15 | 192;
    $17 = $16&255;
    $18 = ((($0)) + 1|0);
    HEAP8[$0>>0] = $17;
    $19 = $1 & 63;
    $20 = $19 | 128;
    $21 = $20&255;
    HEAP8[$18>>0] = $21;
    $$0 = 2;
    break;
   }
   $22 = ($1>>>0)<(55296);
   $23 = $1 & -8192;
   $24 = ($23|0)==(57344);
   $or$cond = $22 | $24;
   if ($or$cond) {
    $25 = $1 >>> 12;
    $26 = $25 | 224;
    $27 = $26&255;
    $28 = ((($0)) + 1|0);
    HEAP8[$0>>0] = $27;
    $29 = $1 >>> 6;
    $30 = $29 & 63;
    $31 = $30 | 128;
    $32 = $31&255;
    $33 = ((($0)) + 2|0);
    HEAP8[$28>>0] = $32;
    $34 = $1 & 63;
    $35 = $34 | 128;
    $36 = $35&255;
    HEAP8[$33>>0] = $36;
    $$0 = 3;
    break;
   }
   $37 = (($1) + -65536)|0;
   $38 = ($37>>>0)<(1048576);
   if ($38) {
    $39 = $1 >>> 18;
    $40 = $39 | 240;
    $41 = $40&255;
    $42 = ((($0)) + 1|0);
    HEAP8[$0>>0] = $41;
    $43 = $1 >>> 12;
    $44 = $43 & 63;
    $45 = $44 | 128;
    $46 = $45&255;
    $47 = ((($0)) + 2|0);
    HEAP8[$42>>0] = $46;
    $48 = $1 >>> 6;
    $49 = $48 & 63;
    $50 = $49 | 128;
    $51 = $50&255;
    $52 = ((($0)) + 3|0);
    HEAP8[$47>>0] = $51;
    $53 = $1 & 63;
    $54 = $53 | 128;
    $55 = $54&255;
    HEAP8[$52>>0] = $55;
    $$0 = 4;
    break;
   } else {
    $56 = (___errno_location()|0);
    HEAP32[$56>>2] = 84;
    $$0 = -1;
    break;
   }
  }
 } while(0);
 return ($$0|0);
}
function ___pthread_self_431() {
 var $0 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = (_pthread_self()|0);
 return ($0|0);
}
function ___pthread_self_104() {
 var $0 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = (_pthread_self()|0);
 return ($0|0);
}
function ___strerror_l($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $$012$lcssa = 0, $$01214 = 0, $$016 = 0, $$113 = 0, $$115 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 $$016 = 0;
 while(1) {
  $3 = (6313 + ($$016)|0);
  $4 = HEAP8[$3>>0]|0;
  $5 = $4&255;
  $6 = ($5|0)==($0|0);
  if ($6) {
   label = 2;
   break;
  }
  $7 = (($$016) + 1)|0;
  $8 = ($7|0)==(87);
  if ($8) {
   $$01214 = 6401;$$115 = 87;
   label = 5;
   break;
  } else {
   $$016 = $7;
  }
 }
 if ((label|0) == 2) {
  $2 = ($$016|0)==(0);
  if ($2) {
   $$012$lcssa = 6401;
  } else {
   $$01214 = 6401;$$115 = $$016;
   label = 5;
  }
 }
 if ((label|0) == 5) {
  while(1) {
   label = 0;
   $$113 = $$01214;
   while(1) {
    $9 = HEAP8[$$113>>0]|0;
    $10 = ($9<<24>>24)==(0);
    $11 = ((($$113)) + 1|0);
    if ($10) {
     break;
    } else {
     $$113 = $11;
    }
   }
   $12 = (($$115) + -1)|0;
   $13 = ($12|0)==(0);
   if ($13) {
    $$012$lcssa = $11;
    break;
   } else {
    $$01214 = $11;$$115 = $12;
    label = 5;
   }
  }
 }
 $14 = ((($1)) + 20|0);
 $15 = HEAP32[$14>>2]|0;
 $16 = (___lctrans($$012$lcssa,$15)|0);
 return ($16|0);
}
function ___lctrans($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $2 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $2 = (___lctrans_impl($0,$1)|0);
 return ($2|0);
}
function ___lctrans_impl($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $$0 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $2 = ($1|0)==(0|0);
 if ($2) {
  $$0 = 0;
 } else {
  $3 = HEAP32[$1>>2]|0;
  $4 = ((($1)) + 4|0);
  $5 = HEAP32[$4>>2]|0;
  $6 = (___mo_lookup($3,$5,$0)|0);
  $$0 = $6;
 }
 $7 = ($$0|0)!=(0|0);
 $8 = $7 ? $$0 : $0;
 return ($8|0);
}
function ___mo_lookup($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $$ = 0, $$090 = 0, $$094 = 0, $$191 = 0, $$195 = 0, $$4 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0;
 var $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0;
 var $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0;
 var $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0, $7 = 0, $8 = 0, $9 = 0, $or$cond = 0, $or$cond102 = 0, $or$cond104 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $3 = HEAP32[$0>>2]|0;
 $4 = (($3) + 1794895138)|0;
 $5 = ((($0)) + 8|0);
 $6 = HEAP32[$5>>2]|0;
 $7 = (_swapc($6,$4)|0);
 $8 = ((($0)) + 12|0);
 $9 = HEAP32[$8>>2]|0;
 $10 = (_swapc($9,$4)|0);
 $11 = ((($0)) + 16|0);
 $12 = HEAP32[$11>>2]|0;
 $13 = (_swapc($12,$4)|0);
 $14 = $1 >>> 2;
 $15 = ($7>>>0)<($14>>>0);
 L1: do {
  if ($15) {
   $16 = $7 << 2;
   $17 = (($1) - ($16))|0;
   $18 = ($10>>>0)<($17>>>0);
   $19 = ($13>>>0)<($17>>>0);
   $or$cond = $18 & $19;
   if ($or$cond) {
    $20 = $13 | $10;
    $21 = $20 & 3;
    $22 = ($21|0)==(0);
    if ($22) {
     $23 = $10 >>> 2;
     $24 = $13 >>> 2;
     $$090 = 0;$$094 = $7;
     while(1) {
      $25 = $$094 >>> 1;
      $26 = (($$090) + ($25))|0;
      $27 = $26 << 1;
      $28 = (($27) + ($23))|0;
      $29 = (($0) + ($28<<2)|0);
      $30 = HEAP32[$29>>2]|0;
      $31 = (_swapc($30,$4)|0);
      $32 = (($28) + 1)|0;
      $33 = (($0) + ($32<<2)|0);
      $34 = HEAP32[$33>>2]|0;
      $35 = (_swapc($34,$4)|0);
      $36 = ($35>>>0)<($1>>>0);
      $37 = (($1) - ($35))|0;
      $38 = ($31>>>0)<($37>>>0);
      $or$cond102 = $36 & $38;
      if (!($or$cond102)) {
       $$4 = 0;
       break L1;
      }
      $39 = (($35) + ($31))|0;
      $40 = (($0) + ($39)|0);
      $41 = HEAP8[$40>>0]|0;
      $42 = ($41<<24>>24)==(0);
      if (!($42)) {
       $$4 = 0;
       break L1;
      }
      $43 = (($0) + ($35)|0);
      $44 = (_strcmp($2,$43)|0);
      $45 = ($44|0)==(0);
      if ($45) {
       break;
      }
      $62 = ($$094|0)==(1);
      $63 = ($44|0)<(0);
      $64 = (($$094) - ($25))|0;
      $$195 = $63 ? $25 : $64;
      $$191 = $63 ? $$090 : $26;
      if ($62) {
       $$4 = 0;
       break L1;
      } else {
       $$090 = $$191;$$094 = $$195;
      }
     }
     $46 = (($27) + ($24))|0;
     $47 = (($0) + ($46<<2)|0);
     $48 = HEAP32[$47>>2]|0;
     $49 = (_swapc($48,$4)|0);
     $50 = (($46) + 1)|0;
     $51 = (($0) + ($50<<2)|0);
     $52 = HEAP32[$51>>2]|0;
     $53 = (_swapc($52,$4)|0);
     $54 = ($53>>>0)<($1>>>0);
     $55 = (($1) - ($53))|0;
     $56 = ($49>>>0)<($55>>>0);
     $or$cond104 = $54 & $56;
     if ($or$cond104) {
      $57 = (($0) + ($53)|0);
      $58 = (($53) + ($49))|0;
      $59 = (($0) + ($58)|0);
      $60 = HEAP8[$59>>0]|0;
      $61 = ($60<<24>>24)==(0);
      $$ = $61 ? $57 : 0;
      $$4 = $$;
     } else {
      $$4 = 0;
     }
    } else {
     $$4 = 0;
    }
   } else {
    $$4 = 0;
   }
  } else {
   $$4 = 0;
  }
 } while(0);
 return ($$4|0);
}
function _swapc($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $$ = 0, $2 = 0, $3 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $2 = ($1|0)==(0);
 $3 = (_llvm_bswap_i32(($0|0))|0);
 $$ = $2 ? $0 : $3;
 return ($$|0);
}
function ___fwritex($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $$038 = 0, $$042 = 0, $$1 = 0, $$139 = 0, $$141 = 0, $$143 = 0, $$pre = 0, $$pre47 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0;
 var $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 $3 = ((($2)) + 16|0);
 $4 = HEAP32[$3>>2]|0;
 $5 = ($4|0)==(0|0);
 if ($5) {
  $7 = (___towrite($2)|0);
  $8 = ($7|0)==(0);
  if ($8) {
   $$pre = HEAP32[$3>>2]|0;
   $12 = $$pre;
   label = 5;
  } else {
   $$1 = 0;
  }
 } else {
  $6 = $4;
  $12 = $6;
  label = 5;
 }
 L5: do {
  if ((label|0) == 5) {
   $9 = ((($2)) + 20|0);
   $10 = HEAP32[$9>>2]|0;
   $11 = (($12) - ($10))|0;
   $13 = ($11>>>0)<($1>>>0);
   $14 = $10;
   if ($13) {
    $15 = ((($2)) + 36|0);
    $16 = HEAP32[$15>>2]|0;
    $17 = (FUNCTION_TABLE_iiii[$16 & 255]($2,$0,$1)|0);
    $$1 = $17;
    break;
   }
   $18 = ((($2)) + 75|0);
   $19 = HEAP8[$18>>0]|0;
   $20 = ($19<<24>>24)>(-1);
   L10: do {
    if ($20) {
     $$038 = $1;
     while(1) {
      $21 = ($$038|0)==(0);
      if ($21) {
       $$139 = 0;$$141 = $0;$$143 = $1;$31 = $14;
       break L10;
      }
      $22 = (($$038) + -1)|0;
      $23 = (($0) + ($22)|0);
      $24 = HEAP8[$23>>0]|0;
      $25 = ($24<<24>>24)==(10);
      if ($25) {
       break;
      } else {
       $$038 = $22;
      }
     }
     $26 = ((($2)) + 36|0);
     $27 = HEAP32[$26>>2]|0;
     $28 = (FUNCTION_TABLE_iiii[$27 & 255]($2,$0,$$038)|0);
     $29 = ($28>>>0)<($$038>>>0);
     if ($29) {
      $$1 = $28;
      break L5;
     }
     $30 = (($0) + ($$038)|0);
     $$042 = (($1) - ($$038))|0;
     $$pre47 = HEAP32[$9>>2]|0;
     $$139 = $$038;$$141 = $30;$$143 = $$042;$31 = $$pre47;
    } else {
     $$139 = 0;$$141 = $0;$$143 = $1;$31 = $14;
    }
   } while(0);
   _memcpy(($31|0),($$141|0),($$143|0))|0;
   $32 = HEAP32[$9>>2]|0;
   $33 = (($32) + ($$143)|0);
   HEAP32[$9>>2] = $33;
   $34 = (($$139) + ($$143))|0;
   $$1 = $34;
  }
 } while(0);
 return ($$1|0);
}
function ___towrite($0) {
 $0 = $0|0;
 var $$0 = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0;
 var $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = ((($0)) + 74|0);
 $2 = HEAP8[$1>>0]|0;
 $3 = $2 << 24 >> 24;
 $4 = (($3) + 255)|0;
 $5 = $4 | $3;
 $6 = $5&255;
 HEAP8[$1>>0] = $6;
 $7 = HEAP32[$0>>2]|0;
 $8 = $7 & 8;
 $9 = ($8|0)==(0);
 if ($9) {
  $11 = ((($0)) + 8|0);
  HEAP32[$11>>2] = 0;
  $12 = ((($0)) + 4|0);
  HEAP32[$12>>2] = 0;
  $13 = ((($0)) + 44|0);
  $14 = HEAP32[$13>>2]|0;
  $15 = ((($0)) + 28|0);
  HEAP32[$15>>2] = $14;
  $16 = ((($0)) + 20|0);
  HEAP32[$16>>2] = $14;
  $17 = ((($0)) + 48|0);
  $18 = HEAP32[$17>>2]|0;
  $19 = (($14) + ($18)|0);
  $20 = ((($0)) + 16|0);
  HEAP32[$20>>2] = $19;
  $$0 = 0;
 } else {
  $10 = $7 | 32;
  HEAP32[$0>>2] = $10;
  $$0 = -1;
 }
 return ($$0|0);
}
function _sn_write($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $$ = 0, $10 = 0, $11 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $3 = ((($0)) + 16|0);
 $4 = HEAP32[$3>>2]|0;
 $5 = ((($0)) + 20|0);
 $6 = HEAP32[$5>>2]|0;
 $7 = $6;
 $8 = (($4) - ($7))|0;
 $9 = ($8>>>0)>($2>>>0);
 $$ = $9 ? $2 : $8;
 _memcpy(($6|0),($1|0),($$|0))|0;
 $10 = HEAP32[$5>>2]|0;
 $11 = (($10) + ($$)|0);
 HEAP32[$5>>2] = $11;
 return ($2|0);
}
function _strlen($0) {
 $0 = $0|0;
 var $$0 = 0, $$015$lcssa = 0, $$01519 = 0, $$1$lcssa = 0, $$pn = 0, $$pre = 0, $$sink = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0;
 var $21 = 0, $22 = 0, $23 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = $0;
 $2 = $1 & 3;
 $3 = ($2|0)==(0);
 L1: do {
  if ($3) {
   $$015$lcssa = $0;
   label = 4;
  } else {
   $$01519 = $0;$23 = $1;
   while(1) {
    $4 = HEAP8[$$01519>>0]|0;
    $5 = ($4<<24>>24)==(0);
    if ($5) {
     $$sink = $23;
     break L1;
    }
    $6 = ((($$01519)) + 1|0);
    $7 = $6;
    $8 = $7 & 3;
    $9 = ($8|0)==(0);
    if ($9) {
     $$015$lcssa = $6;
     label = 4;
     break;
    } else {
     $$01519 = $6;$23 = $7;
    }
   }
  }
 } while(0);
 if ((label|0) == 4) {
  $$0 = $$015$lcssa;
  while(1) {
   $10 = HEAP32[$$0>>2]|0;
   $11 = (($10) + -16843009)|0;
   $12 = $10 & -2139062144;
   $13 = $12 ^ -2139062144;
   $14 = $13 & $11;
   $15 = ($14|0)==(0);
   $16 = ((($$0)) + 4|0);
   if ($15) {
    $$0 = $16;
   } else {
    break;
   }
  }
  $17 = $10&255;
  $18 = ($17<<24>>24)==(0);
  if ($18) {
   $$1$lcssa = $$0;
  } else {
   $$pn = $$0;
   while(1) {
    $19 = ((($$pn)) + 1|0);
    $$pre = HEAP8[$19>>0]|0;
    $20 = ($$pre<<24>>24)==(0);
    if ($20) {
     $$1$lcssa = $19;
     break;
    } else {
     $$pn = $19;
    }
   }
  }
  $21 = $$1$lcssa;
  $$sink = $21;
 }
 $22 = (($$sink) - ($1))|0;
 return ($22|0);
}
function _strchr($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $2 = (___strchrnul($0,$1)|0);
 $3 = HEAP8[$2>>0]|0;
 $4 = $1&255;
 $5 = ($3<<24>>24)==($4<<24>>24);
 $6 = $5 ? $2 : 0;
 return ($6|0);
}
function ___strchrnul($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $$0 = 0, $$029$lcssa = 0, $$02936 = 0, $$030$lcssa = 0, $$03039 = 0, $$1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0;
 var $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0;
 var $41 = 0, $42 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $or$cond = 0, $or$cond33 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $2 = $1 & 255;
 $3 = ($2|0)==(0);
 L1: do {
  if ($3) {
   $8 = (_strlen($0)|0);
   $9 = (($0) + ($8)|0);
   $$0 = $9;
  } else {
   $4 = $0;
   $5 = $4 & 3;
   $6 = ($5|0)==(0);
   if ($6) {
    $$030$lcssa = $0;
   } else {
    $7 = $1&255;
    $$03039 = $0;
    while(1) {
     $10 = HEAP8[$$03039>>0]|0;
     $11 = ($10<<24>>24)==(0);
     $12 = ($10<<24>>24)==($7<<24>>24);
     $or$cond = $11 | $12;
     if ($or$cond) {
      $$0 = $$03039;
      break L1;
     }
     $13 = ((($$03039)) + 1|0);
     $14 = $13;
     $15 = $14 & 3;
     $16 = ($15|0)==(0);
     if ($16) {
      $$030$lcssa = $13;
      break;
     } else {
      $$03039 = $13;
     }
    }
   }
   $17 = Math_imul($2, 16843009)|0;
   $18 = HEAP32[$$030$lcssa>>2]|0;
   $19 = (($18) + -16843009)|0;
   $20 = $18 & -2139062144;
   $21 = $20 ^ -2139062144;
   $22 = $21 & $19;
   $23 = ($22|0)==(0);
   L10: do {
    if ($23) {
     $$02936 = $$030$lcssa;$25 = $18;
     while(1) {
      $24 = $25 ^ $17;
      $26 = (($24) + -16843009)|0;
      $27 = $24 & -2139062144;
      $28 = $27 ^ -2139062144;
      $29 = $28 & $26;
      $30 = ($29|0)==(0);
      if (!($30)) {
       $$029$lcssa = $$02936;
       break L10;
      }
      $31 = ((($$02936)) + 4|0);
      $32 = HEAP32[$31>>2]|0;
      $33 = (($32) + -16843009)|0;
      $34 = $32 & -2139062144;
      $35 = $34 ^ -2139062144;
      $36 = $35 & $33;
      $37 = ($36|0)==(0);
      if ($37) {
       $$02936 = $31;$25 = $32;
      } else {
       $$029$lcssa = $31;
       break;
      }
     }
    } else {
     $$029$lcssa = $$030$lcssa;
    }
   } while(0);
   $38 = $1&255;
   $$1 = $$029$lcssa;
   while(1) {
    $39 = HEAP8[$$1>>0]|0;
    $40 = ($39<<24>>24)==(0);
    $41 = ($39<<24>>24)==($38<<24>>24);
    $or$cond33 = $40 | $41;
    $42 = ((($$1)) + 1|0);
    if ($or$cond33) {
     $$0 = $$1;
     break;
    } else {
     $$1 = $42;
    }
   }
  }
 } while(0);
 return ($$0|0);
}
function _fputs($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $2 = 0, $3 = 0, $4 = 0, $not$ = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $2 = (_strlen($0)|0);
 $3 = (_fwrite($0,1,$2,$1)|0);
 $not$ = ($3|0)!=($2|0);
 $4 = $not$ << 31 >> 31;
 return ($4|0);
}
function _fwrite($0,$1,$2,$3) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 var $$ = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $phitmp = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $4 = Math_imul($2, $1)|0;
 $5 = ($1|0)==(0);
 $$ = $5 ? 0 : $2;
 $6 = ((($3)) + 76|0);
 $7 = HEAP32[$6>>2]|0;
 $8 = ($7|0)>(-1);
 if ($8) {
  $10 = (___lockfile($3)|0);
  $phitmp = ($10|0)==(0);
  $11 = (___fwritex($0,$4,$3)|0);
  if ($phitmp) {
   $13 = $11;
  } else {
   ___unlockfile($3);
   $13 = $11;
  }
 } else {
  $9 = (___fwritex($0,$4,$3)|0);
  $13 = $9;
 }
 $12 = ($13|0)==($4|0);
 if ($12) {
  $15 = $$;
 } else {
  $14 = (($13>>>0) / ($1>>>0))&-1;
  $15 = $14;
 }
 return ($15|0);
}
function ___unlist_locked_file($0) {
 $0 = $0|0;
 var $$pre = 0, $$sink = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = ((($0)) + 68|0);
 $2 = HEAP32[$1>>2]|0;
 $3 = ($2|0)==(0);
 if (!($3)) {
  $4 = ((($0)) + 116|0);
  $5 = HEAP32[$4>>2]|0;
  $6 = ($5|0)==(0|0);
  $$pre = ((($0)) + 112|0);
  if (!($6)) {
   $7 = HEAP32[$$pre>>2]|0;
   $8 = ((($5)) + 112|0);
   HEAP32[$8>>2] = $7;
  }
  $9 = HEAP32[$$pre>>2]|0;
  $10 = ($9|0)==(0|0);
  if ($10) {
   $12 = (___pthread_self_613()|0);
   $13 = ((($12)) + 232|0);
   $$sink = $13;
  } else {
   $11 = ((($9)) + 116|0);
   $$sink = $11;
  }
  HEAP32[$$sink>>2] = $5;
 }
 return;
}
function ___pthread_self_613() {
 var $0 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = (_pthread_self()|0);
 return ($0|0);
}
function ___overflow($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $$0 = 0, $$pre = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $3 = 0;
 var $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $AsyncCtx = 0, $IsAsync = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $2 = sp;
 $3 = $1&255;
 HEAP8[$2>>0] = $3;
 $4 = ((($0)) + 16|0);
 $5 = HEAP32[$4>>2]|0;
 $6 = ($5|0)==(0|0);
 if ($6) {
  $7 = (___towrite($0)|0);
  $8 = ($7|0)==(0);
  if ($8) {
   $$pre = HEAP32[$4>>2]|0;
   $12 = $$pre;
   label = 4;
  } else {
   $$0 = -1;
  }
 } else {
  $12 = $5;
  label = 4;
 }
 do {
  if ((label|0) == 4) {
   $9 = ((($0)) + 20|0);
   $10 = HEAP32[$9>>2]|0;
   $11 = ($10>>>0)<($12>>>0);
   if ($11) {
    $13 = $1 & 255;
    $14 = ((($0)) + 75|0);
    $15 = HEAP8[$14>>0]|0;
    $16 = $15 << 24 >> 24;
    $17 = ($13|0)==($16|0);
    if (!($17)) {
     $18 = ((($10)) + 1|0);
     HEAP32[$9>>2] = $18;
     HEAP8[$10>>0] = $3;
     $$0 = $13;
     break;
    }
   }
   $19 = ((($0)) + 36|0);
   $20 = HEAP32[$19>>2]|0;
   $AsyncCtx = _emscripten_alloc_async_context(8,sp)|0;
   $21 = (FUNCTION_TABLE_iiii[$20 & 255]($0,$2,1)|0);
   $IsAsync = ___async;
   if ($IsAsync) {
    HEAP32[$AsyncCtx>>2] = 207;
    $22 = ((($AsyncCtx)) + 4|0);
    HEAP32[$22>>2] = $2;
    sp = STACKTOP;
    STACKTOP = sp;return 0;
   }
   _emscripten_free_async_context(($AsyncCtx|0));
   $23 = ($21|0)==(1);
   if ($23) {
    $24 = HEAP8[$2>>0]|0;
    $25 = $24&255;
    $$0 = $25;
   } else {
    $$0 = -1;
   }
  }
 } while(0);
 STACKTOP = sp;return ($$0|0);
}
function _fopen($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $$0 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $memchr = 0, $vararg_buffer = 0, $vararg_buffer3 = 0, $vararg_buffer8 = 0, $vararg_ptr1 = 0;
 var $vararg_ptr2 = 0, $vararg_ptr6 = 0, $vararg_ptr7 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 48|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(48|0);
 $vararg_buffer8 = sp + 32|0;
 $vararg_buffer3 = sp + 16|0;
 $vararg_buffer = sp;
 $2 = HEAP8[$1>>0]|0;
 $3 = $2 << 24 >> 24;
 $memchr = (_memchr(8205,$3,4)|0);
 $4 = ($memchr|0)==(0|0);
 if ($4) {
  $5 = (___errno_location()|0);
  HEAP32[$5>>2] = 22;
  $$0 = 0;
 } else {
  $6 = (___fmodeflags($1)|0);
  $7 = $0;
  $8 = $6 | 32768;
  HEAP32[$vararg_buffer>>2] = $7;
  $vararg_ptr1 = ((($vararg_buffer)) + 4|0);
  HEAP32[$vararg_ptr1>>2] = $8;
  $vararg_ptr2 = ((($vararg_buffer)) + 8|0);
  HEAP32[$vararg_ptr2>>2] = 438;
  $9 = (___syscall5(5,($vararg_buffer|0))|0);
  $10 = (___syscall_ret($9)|0);
  $11 = ($10|0)<(0);
  if ($11) {
   $$0 = 0;
  } else {
   $12 = $6 & 524288;
   $13 = ($12|0)==(0);
   if (!($13)) {
    HEAP32[$vararg_buffer3>>2] = $10;
    $vararg_ptr6 = ((($vararg_buffer3)) + 4|0);
    HEAP32[$vararg_ptr6>>2] = 2;
    $vararg_ptr7 = ((($vararg_buffer3)) + 8|0);
    HEAP32[$vararg_ptr7>>2] = 1;
    (___syscall221(221,($vararg_buffer3|0))|0);
   }
   $14 = (___fdopen($10,$1)|0);
   $15 = ($14|0)==(0|0);
   if ($15) {
    HEAP32[$vararg_buffer8>>2] = $10;
    (___syscall6(6,($vararg_buffer8|0))|0);
    $$0 = 0;
   } else {
    $$0 = $14;
   }
  }
 }
 STACKTOP = sp;return ($$0|0);
}
function ___fmodeflags($0) {
 $0 = $0|0;
 var $$ = 0, $$$4 = 0, $$0 = 0, $$0$ = 0, $$2 = 0, $$2$ = 0, $$4 = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0;
 var $8 = 0, $9 = 0, $not$ = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = (_strchr($0,43)|0);
 $2 = ($1|0)==(0|0);
 $3 = HEAP8[$0>>0]|0;
 $not$ = ($3<<24>>24)!=(114);
 $$ = $not$&1;
 $$0 = $2 ? $$ : 2;
 $4 = (_strchr($0,120)|0);
 $5 = ($4|0)==(0|0);
 $6 = $$0 | 128;
 $$0$ = $5 ? $$0 : $6;
 $7 = (_strchr($0,101)|0);
 $8 = ($7|0)==(0|0);
 $9 = $$0$ | 524288;
 $$2 = $8 ? $$0$ : $9;
 $10 = ($3<<24>>24)==(114);
 $11 = $$2 | 64;
 $$2$ = $10 ? $$2 : $11;
 $12 = ($3<<24>>24)==(119);
 $13 = $$2$ | 512;
 $$4 = $12 ? $13 : $$2$;
 $14 = ($3<<24>>24)==(97);
 $15 = $$4 | 1024;
 $$$4 = $14 ? $15 : $$4;
 return ($$$4|0);
}
function ___fdopen($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $$0 = 0, $$pre = 0, $$pre31 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0;
 var $26 = 0, $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $5 = 0, $6 = 0;
 var $7 = 0, $8 = 0, $9 = 0, $memchr = 0, $vararg_buffer = 0, $vararg_buffer12 = 0, $vararg_buffer3 = 0, $vararg_buffer7 = 0, $vararg_ptr1 = 0, $vararg_ptr10 = 0, $vararg_ptr11 = 0, $vararg_ptr15 = 0, $vararg_ptr16 = 0, $vararg_ptr2 = 0, $vararg_ptr6 = 0, dest = 0, label = 0, sp = 0, stop = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 64|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(64|0);
 $vararg_buffer12 = sp + 40|0;
 $vararg_buffer7 = sp + 24|0;
 $vararg_buffer3 = sp + 16|0;
 $vararg_buffer = sp;
 $2 = sp + 56|0;
 $3 = HEAP8[$1>>0]|0;
 $4 = $3 << 24 >> 24;
 $memchr = (_memchr(8205,$4,4)|0);
 $5 = ($memchr|0)==(0|0);
 if ($5) {
  $6 = (___errno_location()|0);
  HEAP32[$6>>2] = 22;
  $$0 = 0;
 } else {
  $7 = (_malloc(1156)|0);
  $8 = ($7|0)==(0|0);
  if ($8) {
   $$0 = 0;
  } else {
   dest=$7; stop=dest+124|0; do { HEAP32[dest>>2]=0|0; dest=dest+4|0; } while ((dest|0) < (stop|0));
   $9 = (_strchr($1,43)|0);
   $10 = ($9|0)==(0|0);
   if ($10) {
    $11 = ($3<<24>>24)==(114);
    $12 = $11 ? 8 : 4;
    HEAP32[$7>>2] = $12;
   }
   $13 = (_strchr($1,101)|0);
   $14 = ($13|0)==(0|0);
   if ($14) {
    $16 = $3;
   } else {
    HEAP32[$vararg_buffer>>2] = $0;
    $vararg_ptr1 = ((($vararg_buffer)) + 4|0);
    HEAP32[$vararg_ptr1>>2] = 2;
    $vararg_ptr2 = ((($vararg_buffer)) + 8|0);
    HEAP32[$vararg_ptr2>>2] = 1;
    (___syscall221(221,($vararg_buffer|0))|0);
    $$pre = HEAP8[$1>>0]|0;
    $16 = $$pre;
   }
   $15 = ($16<<24>>24)==(97);
   if ($15) {
    HEAP32[$vararg_buffer3>>2] = $0;
    $vararg_ptr6 = ((($vararg_buffer3)) + 4|0);
    HEAP32[$vararg_ptr6>>2] = 3;
    $17 = (___syscall221(221,($vararg_buffer3|0))|0);
    $18 = $17 & 1024;
    $19 = ($18|0)==(0);
    if ($19) {
     $20 = $17 | 1024;
     HEAP32[$vararg_buffer7>>2] = $0;
     $vararg_ptr10 = ((($vararg_buffer7)) + 4|0);
     HEAP32[$vararg_ptr10>>2] = 4;
     $vararg_ptr11 = ((($vararg_buffer7)) + 8|0);
     HEAP32[$vararg_ptr11>>2] = $20;
     (___syscall221(221,($vararg_buffer7|0))|0);
    }
    $21 = HEAP32[$7>>2]|0;
    $22 = $21 | 128;
    HEAP32[$7>>2] = $22;
    $29 = $22;
   } else {
    $$pre31 = HEAP32[$7>>2]|0;
    $29 = $$pre31;
   }
   $23 = ((($7)) + 60|0);
   HEAP32[$23>>2] = $0;
   $24 = ((($7)) + 132|0);
   $25 = ((($7)) + 44|0);
   HEAP32[$25>>2] = $24;
   $26 = ((($7)) + 48|0);
   HEAP32[$26>>2] = 1024;
   $27 = ((($7)) + 75|0);
   HEAP8[$27>>0] = -1;
   $28 = $29 & 8;
   $30 = ($28|0)==(0);
   if ($30) {
    $31 = $2;
    HEAP32[$vararg_buffer12>>2] = $0;
    $vararg_ptr15 = ((($vararg_buffer12)) + 4|0);
    HEAP32[$vararg_ptr15>>2] = 21523;
    $vararg_ptr16 = ((($vararg_buffer12)) + 8|0);
    HEAP32[$vararg_ptr16>>2] = $31;
    $32 = (___syscall54(54,($vararg_buffer12|0))|0);
    $33 = ($32|0)==(0);
    if ($33) {
     HEAP8[$27>>0] = 10;
    }
   }
   $34 = ((($7)) + 32|0);
   HEAP32[$34>>2] = 208;
   $35 = ((($7)) + 36|0);
   HEAP32[$35>>2] = 77;
   $36 = ((($7)) + 40|0);
   HEAP32[$36>>2] = 78;
   $37 = ((($7)) + 12|0);
   HEAP32[$37>>2] = 76;
   $38 = HEAP32[(13680)>>2]|0;
   $39 = ($38|0)==(0);
   if ($39) {
    $40 = ((($7)) + 76|0);
    HEAP32[$40>>2] = -1;
   }
   $41 = (___ofl_add($7)|0);
   $$0 = $7;
  }
 }
 STACKTOP = sp;return ($$0|0);
}
function ___ofl_add($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = (___ofl_lock()|0);
 $2 = HEAP32[$1>>2]|0;
 $3 = ((($0)) + 56|0);
 HEAP32[$3>>2] = $2;
 $4 = HEAP32[$1>>2]|0;
 $5 = ($4|0)==(0|0);
 if (!($5)) {
  $6 = ((($4)) + 52|0);
  HEAP32[$6>>2] = $0;
 }
 HEAP32[$1>>2] = $0;
 ___ofl_unlock();
 return ($0|0);
}
function ___ofl_lock() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 ___lock((13740|0));
 return (13748|0);
}
function ___ofl_unlock() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 ___unlock((13740|0));
 return;
}
function _fclose($0) {
 $0 = $0|0;
 var $$expand_i1_val = 0, $$expand_i1_val7 = 0, $$pre = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0;
 var $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $AsyncCtx = 0;
 var $AsyncCtx3 = 0, $IsAsync = 0, $IsAsync4 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = ((($0)) + 76|0);
 $2 = HEAP32[$1>>2]|0;
 $3 = ($2|0)>(-1);
 if ($3) {
  $4 = (___lockfile($0)|0);
  $24 = $4;
 } else {
  $24 = 0;
 }
 ___unlist_locked_file($0);
 $5 = HEAP32[$0>>2]|0;
 $6 = $5 & 1;
 $7 = ($6|0)!=(0);
 if (!($7)) {
  $8 = (___ofl_lock()|0);
  $9 = ((($0)) + 52|0);
  $10 = HEAP32[$9>>2]|0;
  $11 = ($10|0)==(0|0);
  $12 = $10;
  $$pre = ((($0)) + 56|0);
  if (!($11)) {
   $13 = HEAP32[$$pre>>2]|0;
   $14 = ((($10)) + 56|0);
   HEAP32[$14>>2] = $13;
  }
  $15 = HEAP32[$$pre>>2]|0;
  $16 = ($15|0)==(0|0);
  if (!($16)) {
   $17 = ((($15)) + 52|0);
   HEAP32[$17>>2] = $12;
  }
  $18 = HEAP32[$8>>2]|0;
  $19 = ($18|0)==($0|0);
  if ($19) {
   HEAP32[$8>>2] = $15;
  }
  ___ofl_unlock();
 }
 $AsyncCtx3 = _emscripten_alloc_async_context(16,sp)|0;
 $20 = (_fflush($0)|0);
 $IsAsync4 = ___async;
 if ($IsAsync4) {
  HEAP32[$AsyncCtx3>>2] = 209;
  $21 = ((($AsyncCtx3)) + 4|0);
  HEAP32[$21>>2] = $0;
  $22 = ((($AsyncCtx3)) + 8|0);
  $$expand_i1_val = $7&1;
  HEAP8[$22>>0] = $$expand_i1_val;
  $23 = ((($AsyncCtx3)) + 12|0);
  HEAP32[$23>>2] = $24;
  sp = STACKTOP;
  return 0;
 }
 _emscripten_free_async_context(($AsyncCtx3|0));
 $25 = ((($0)) + 12|0);
 $26 = HEAP32[$25>>2]|0;
 $AsyncCtx = _emscripten_alloc_async_context(20,sp)|0;
 $27 = (FUNCTION_TABLE_ii[$26 & 511]($0)|0);
 $IsAsync = ___async;
 if ($IsAsync) {
  HEAP32[$AsyncCtx>>2] = 210;
  $28 = ((($AsyncCtx)) + 4|0);
  HEAP32[$28>>2] = $20;
  $29 = ((($AsyncCtx)) + 8|0);
  HEAP32[$29>>2] = $0;
  $30 = ((($AsyncCtx)) + 12|0);
  $$expand_i1_val7 = $7&1;
  HEAP8[$30>>0] = $$expand_i1_val7;
  $31 = ((($AsyncCtx)) + 16|0);
  HEAP32[$31>>2] = $24;
  sp = STACKTOP;
  return 0;
 }
 _emscripten_free_async_context(($AsyncCtx|0));
 $32 = $27 | $20;
 $33 = ((($0)) + 92|0);
 $34 = HEAP32[$33>>2]|0;
 $35 = ($34|0)==(0|0);
 if (!($35)) {
  _free($34);
 }
 if ($7) {
  $36 = ($24|0)==(0);
  if (!($36)) {
   ___unlockfile($0);
  }
 } else {
  _free($0);
 }
 return ($32|0);
}
function _fflush($0) {
 $0 = $0|0;
 var $$0 = 0, $$023 = 0, $$02325 = 0, $$02327 = 0, $$024$lcssa = 0, $$02426 = 0, $$1 = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0;
 var $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0;
 var $9 = 0, $AsyncCtx = 0, $AsyncCtx10 = 0, $AsyncCtx3 = 0, $AsyncCtx6 = 0, $IsAsync = 0, $IsAsync11 = 0, $IsAsync4 = 0, $IsAsync7 = 0, $phitmp = 0, $phitmp$expand_i1_val = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = ($0|0)==(0|0);
 do {
  if ($1) {
   $10 = HEAP32[405]|0;
   $11 = ($10|0)==(0|0);
   do {
    if ($11) {
     $34 = 0;
    } else {
     $12 = HEAP32[405]|0;
     $AsyncCtx10 = _emscripten_alloc_async_context(4,sp)|0;
     $13 = (_fflush($12)|0);
     $IsAsync11 = ___async;
     if ($IsAsync11) {
      HEAP32[$AsyncCtx10>>2] = 213;
      sp = STACKTOP;
      return 0;
     } else {
      _emscripten_free_async_context(($AsyncCtx10|0));
      $34 = $13;
      break;
     }
    }
   } while(0);
   $14 = (___ofl_lock()|0);
   $$02325 = HEAP32[$14>>2]|0;
   $15 = ($$02325|0)==(0|0);
   L9: do {
    if ($15) {
     $$024$lcssa = $34;
    } else {
     $$02327 = $$02325;$$02426 = $34;
     while(1) {
      $16 = ((($$02327)) + 76|0);
      $17 = HEAP32[$16>>2]|0;
      $18 = ($17|0)>(-1);
      if ($18) {
       $19 = (___lockfile($$02327)|0);
       $28 = $19;
      } else {
       $28 = 0;
      }
      $20 = ((($$02327)) + 20|0);
      $21 = HEAP32[$20>>2]|0;
      $22 = ((($$02327)) + 28|0);
      $23 = HEAP32[$22>>2]|0;
      $24 = ($21>>>0)>($23>>>0);
      if ($24) {
       $AsyncCtx = _emscripten_alloc_async_context(16,sp)|0;
       $25 = (___fflush_unlocked($$02327)|0);
       $IsAsync = ___async;
       if ($IsAsync) {
        break;
       }
       _emscripten_free_async_context(($AsyncCtx|0));
       $30 = $25 | $$02426;
       $$1 = $30;
      } else {
       $$1 = $$02426;
      }
      $31 = ($28|0)==(0);
      if (!($31)) {
       ___unlockfile($$02327);
      }
      $32 = ((($$02327)) + 56|0);
      $$023 = HEAP32[$32>>2]|0;
      $33 = ($$023|0)==(0|0);
      if ($33) {
       $$024$lcssa = $$1;
       break L9;
      } else {
       $$02327 = $$023;$$02426 = $$1;
      }
     }
     HEAP32[$AsyncCtx>>2] = 214;
     $26 = ((($AsyncCtx)) + 4|0);
     HEAP32[$26>>2] = $$02426;
     $27 = ((($AsyncCtx)) + 8|0);
     HEAP32[$27>>2] = $28;
     $29 = ((($AsyncCtx)) + 12|0);
     HEAP32[$29>>2] = $$02327;
     sp = STACKTOP;
     return 0;
    }
   } while(0);
   ___ofl_unlock();
   $$0 = $$024$lcssa;
  } else {
   $2 = ((($0)) + 76|0);
   $3 = HEAP32[$2>>2]|0;
   $4 = ($3|0)>(-1);
   if (!($4)) {
    $AsyncCtx6 = _emscripten_alloc_async_context(4,sp)|0;
    $5 = (___fflush_unlocked($0)|0);
    $IsAsync7 = ___async;
    if ($IsAsync7) {
     HEAP32[$AsyncCtx6>>2] = 211;
     sp = STACKTOP;
     return 0;
    } else {
     _emscripten_free_async_context(($AsyncCtx6|0));
     $$0 = $5;
     break;
    }
   }
   $6 = (___lockfile($0)|0);
   $phitmp = ($6|0)==(0);
   $AsyncCtx3 = _emscripten_alloc_async_context(12,sp)|0;
   $7 = (___fflush_unlocked($0)|0);
   $IsAsync4 = ___async;
   if ($IsAsync4) {
    HEAP32[$AsyncCtx3>>2] = 212;
    $8 = ((($AsyncCtx3)) + 4|0);
    $phitmp$expand_i1_val = $phitmp&1;
    HEAP8[$8>>0] = $phitmp$expand_i1_val;
    $9 = ((($AsyncCtx3)) + 8|0);
    HEAP32[$9>>2] = $0;
    sp = STACKTOP;
    return 0;
   }
   _emscripten_free_async_context(($AsyncCtx3|0));
   if ($phitmp) {
    $$0 = $7;
   } else {
    ___unlockfile($0);
    $$0 = $7;
   }
  }
 } while(0);
 return ($$0|0);
}
function ___fflush_unlocked($0) {
 $0 = $0|0;
 var $$0 = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0;
 var $27 = 0, $28 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, $IsAsync = 0, $IsAsync4 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = ((($0)) + 20|0);
 $2 = HEAP32[$1>>2]|0;
 $3 = ((($0)) + 28|0);
 $4 = HEAP32[$3>>2]|0;
 $5 = ($2>>>0)>($4>>>0);
 do {
  if ($5) {
   $6 = ((($0)) + 36|0);
   $7 = HEAP32[$6>>2]|0;
   $AsyncCtx = _emscripten_alloc_async_context(16,sp)|0;
   (FUNCTION_TABLE_iiii[$7 & 255]($0,0,0)|0);
   $IsAsync = ___async;
   if ($IsAsync) {
    HEAP32[$AsyncCtx>>2] = 215;
    $8 = ((($AsyncCtx)) + 4|0);
    HEAP32[$8>>2] = $1;
    $9 = ((($AsyncCtx)) + 8|0);
    HEAP32[$9>>2] = $0;
    $10 = ((($AsyncCtx)) + 12|0);
    HEAP32[$10>>2] = $3;
    sp = STACKTOP;
    return 0;
   } else {
    _emscripten_free_async_context(($AsyncCtx|0));
    $11 = HEAP32[$1>>2]|0;
    $12 = ($11|0)==(0|0);
    if ($12) {
     $$0 = -1;
     break;
    } else {
     label = 5;
     break;
    }
   }
  } else {
   label = 5;
  }
 } while(0);
 if ((label|0) == 5) {
  $13 = ((($0)) + 4|0);
  $14 = HEAP32[$13>>2]|0;
  $15 = ((($0)) + 8|0);
  $16 = HEAP32[$15>>2]|0;
  $17 = ($14>>>0)<($16>>>0);
  do {
   if ($17) {
    $18 = $14;
    $19 = $16;
    $20 = (($18) - ($19))|0;
    $21 = ((($0)) + 40|0);
    $22 = HEAP32[$21>>2]|0;
    $AsyncCtx3 = _emscripten_alloc_async_context(24,sp)|0;
    (FUNCTION_TABLE_iiii[$22 & 255]($0,$20,1)|0);
    $IsAsync4 = ___async;
    if ($IsAsync4) {
     HEAP32[$AsyncCtx3>>2] = 216;
     $23 = ((($AsyncCtx3)) + 4|0);
     HEAP32[$23>>2] = $0;
     $24 = ((($AsyncCtx3)) + 8|0);
     HEAP32[$24>>2] = $3;
     $25 = ((($AsyncCtx3)) + 12|0);
     HEAP32[$25>>2] = $1;
     $26 = ((($AsyncCtx3)) + 16|0);
     HEAP32[$26>>2] = $15;
     $27 = ((($AsyncCtx3)) + 20|0);
     HEAP32[$27>>2] = $13;
     sp = STACKTOP;
     return 0;
    } else {
     _emscripten_free_async_context(($AsyncCtx3|0));
     break;
    }
   }
  } while(0);
  $28 = ((($0)) + 16|0);
  HEAP32[$28>>2] = 0;
  HEAP32[$3>>2] = 0;
  HEAP32[$1>>2] = 0;
  HEAP32[$15>>2] = 0;
  HEAP32[$13>>2] = 0;
  $$0 = 0;
 }
 return ($$0|0);
}
function _fputc($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $$0 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0;
 var $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, $IsAsync = 0, $IsAsync4 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $2 = ((($1)) + 76|0);
 $3 = HEAP32[$2>>2]|0;
 $4 = ($3|0)<(0);
 $5 = $0&255;
 $6 = $0 & 255;
 if ($4) {
  label = 3;
 } else {
  $7 = (___lockfile($1)|0);
  $8 = ($7|0)==(0);
  if ($8) {
   label = 3;
  } else {
   $20 = ((($1)) + 75|0);
   $21 = HEAP8[$20>>0]|0;
   $22 = $21 << 24 >> 24;
   $23 = ($6|0)==($22|0);
   if ($23) {
    label = 12;
   } else {
    $24 = ((($1)) + 20|0);
    $25 = HEAP32[$24>>2]|0;
    $26 = ((($1)) + 16|0);
    $27 = HEAP32[$26>>2]|0;
    $28 = ($25>>>0)<($27>>>0);
    if ($28) {
     $29 = ((($25)) + 1|0);
     HEAP32[$24>>2] = $29;
     HEAP8[$25>>0] = $5;
     $32 = $6;
    } else {
     label = 12;
    }
   }
   do {
    if ((label|0) == 12) {
     $AsyncCtx = _emscripten_alloc_async_context(8,sp)|0;
     $30 = (___overflow($1,$0)|0);
     $IsAsync = ___async;
     if ($IsAsync) {
      HEAP32[$AsyncCtx>>2] = 218;
      $31 = ((($AsyncCtx)) + 4|0);
      HEAP32[$31>>2] = $1;
      sp = STACKTOP;
      return 0;
     } else {
      _emscripten_free_async_context(($AsyncCtx|0));
      $32 = $30;
      break;
     }
    }
   } while(0);
   ___unlockfile($1);
   $$0 = $32;
  }
 }
 do {
  if ((label|0) == 3) {
   $9 = ((($1)) + 75|0);
   $10 = HEAP8[$9>>0]|0;
   $11 = $10 << 24 >> 24;
   $12 = ($6|0)==($11|0);
   if (!($12)) {
    $13 = ((($1)) + 20|0);
    $14 = HEAP32[$13>>2]|0;
    $15 = ((($1)) + 16|0);
    $16 = HEAP32[$15>>2]|0;
    $17 = ($14>>>0)<($16>>>0);
    if ($17) {
     $18 = ((($14)) + 1|0);
     HEAP32[$13>>2] = $18;
     HEAP8[$14>>0] = $5;
     $$0 = $6;
     break;
    }
   }
   $AsyncCtx3 = _emscripten_alloc_async_context(4,sp)|0;
   $19 = (___overflow($1,$0)|0);
   $IsAsync4 = ___async;
   if ($IsAsync4) {
    HEAP32[$AsyncCtx3>>2] = 217;
    sp = STACKTOP;
    return 0;
   } else {
    _emscripten_free_async_context(($AsyncCtx3|0));
    $$0 = $19;
    break;
   }
  }
 } while(0);
 return ($$0|0);
}
function _freopen($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $$0 = 0, $$pre = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0;
 var $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0;
 var $46 = 0, $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $AsyncCtx = 0, $AsyncCtx10 = 0, $AsyncCtx14 = 0;
 var $AsyncCtx18 = 0, $IsAsync = 0, $IsAsync11 = 0, $IsAsync15 = 0, $IsAsync19 = 0, $vararg_buffer = 0, $vararg_buffer3 = 0, $vararg_ptr1 = 0, $vararg_ptr2 = 0, $vararg_ptr6 = 0, $vararg_ptr7 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 32|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(32|0);
 $vararg_buffer3 = sp + 16|0;
 $vararg_buffer = sp;
 $3 = (___fmodeflags($1)|0);
 $4 = ((($2)) + 76|0);
 $5 = HEAP32[$4>>2]|0;
 $6 = ($5|0)>(-1);
 if ($6) {
  $7 = (___lockfile($2)|0);
  $17 = $7;
 } else {
  $17 = 0;
 }
 $AsyncCtx = _emscripten_alloc_async_context(40,sp)|0;
 (_fflush($2)|0);
 $IsAsync = ___async;
 if ($IsAsync) {
  HEAP32[$AsyncCtx>>2] = 219;
  $8 = ((($AsyncCtx)) + 4|0);
  HEAP32[$8>>2] = $3;
  $9 = ((($AsyncCtx)) + 8|0);
  HEAP32[$9>>2] = $2;
  $10 = ((($AsyncCtx)) + 12|0);
  HEAP32[$10>>2] = $0;
  $11 = ((($AsyncCtx)) + 16|0);
  HEAP32[$11>>2] = $vararg_buffer3;
  $12 = ((($AsyncCtx)) + 20|0);
  HEAP32[$12>>2] = $vararg_buffer3;
  $13 = ((($AsyncCtx)) + 24|0);
  HEAP32[$13>>2] = $vararg_buffer;
  $14 = ((($AsyncCtx)) + 28|0);
  HEAP32[$14>>2] = $vararg_buffer;
  $15 = ((($AsyncCtx)) + 32|0);
  HEAP32[$15>>2] = $1;
  $16 = ((($AsyncCtx)) + 36|0);
  HEAP32[$16>>2] = $17;
  sp = STACKTOP;
  STACKTOP = sp;return (0|0);
 }
 _emscripten_free_async_context(($AsyncCtx|0));
 $18 = ($0|0)==(0|0);
 do {
  if ($18) {
   $19 = $3 & 524288;
   $20 = ($19|0)==(0);
   $$pre = ((($2)) + 60|0);
   if (!($20)) {
    $21 = HEAP32[$$pre>>2]|0;
    HEAP32[$vararg_buffer>>2] = $21;
    $vararg_ptr1 = ((($vararg_buffer)) + 4|0);
    HEAP32[$vararg_ptr1>>2] = 2;
    $vararg_ptr2 = ((($vararg_buffer)) + 8|0);
    HEAP32[$vararg_ptr2>>2] = 1;
    (___syscall221(221,($vararg_buffer|0))|0);
   }
   $22 = $3 & -524481;
   $23 = HEAP32[$$pre>>2]|0;
   HEAP32[$vararg_buffer3>>2] = $23;
   $vararg_ptr6 = ((($vararg_buffer3)) + 4|0);
   HEAP32[$vararg_ptr6>>2] = 4;
   $vararg_ptr7 = ((($vararg_buffer3)) + 8|0);
   HEAP32[$vararg_ptr7>>2] = $22;
   $24 = (___syscall221(221,($vararg_buffer3|0))|0);
   $25 = (___syscall_ret($24)|0);
   $26 = ($25|0)<(0);
   if ($26) {
    label = 21;
   } else {
    label = 16;
   }
  } else {
   $27 = (_fopen($0,$1)|0);
   $28 = ($27|0)==(0|0);
   if ($28) {
    label = 21;
   } else {
    $29 = ((($27)) + 60|0);
    $30 = HEAP32[$29>>2]|0;
    $31 = ((($2)) + 60|0);
    $32 = HEAP32[$31>>2]|0;
    $33 = ($30|0)==($32|0);
    if ($33) {
     HEAP32[$29>>2] = -1;
    } else {
     $34 = $3 & 524288;
     $35 = (___dup3($30,$32,$34)|0);
     $36 = ($35|0)<(0);
     if ($36) {
      $AsyncCtx14 = _emscripten_alloc_async_context(8,sp)|0;
      (_fclose($27)|0);
      $IsAsync15 = ___async;
      if ($IsAsync15) {
       HEAP32[$AsyncCtx14>>2] = 221;
       $56 = ((($AsyncCtx14)) + 4|0);
       HEAP32[$56>>2] = $2;
       sp = STACKTOP;
       STACKTOP = sp;return (0|0);
      } else {
       _emscripten_free_async_context(($AsyncCtx14|0));
       label = 21;
       break;
      }
     }
    }
    $37 = HEAP32[$2>>2]|0;
    $38 = $37 & 1;
    $39 = HEAP32[$27>>2]|0;
    $40 = $38 | $39;
    HEAP32[$2>>2] = $40;
    $41 = ((($27)) + 32|0);
    $42 = HEAP32[$41>>2]|0;
    $43 = ((($2)) + 32|0);
    HEAP32[$43>>2] = $42;
    $44 = ((($27)) + 36|0);
    $45 = HEAP32[$44>>2]|0;
    $46 = ((($2)) + 36|0);
    HEAP32[$46>>2] = $45;
    $47 = ((($27)) + 40|0);
    $48 = HEAP32[$47>>2]|0;
    $49 = ((($2)) + 40|0);
    HEAP32[$49>>2] = $48;
    $50 = ((($27)) + 12|0);
    $51 = HEAP32[$50>>2]|0;
    $52 = ((($2)) + 12|0);
    HEAP32[$52>>2] = $51;
    $AsyncCtx18 = _emscripten_alloc_async_context(12,sp)|0;
    (_fclose($27)|0);
    $IsAsync19 = ___async;
    if ($IsAsync19) {
     HEAP32[$AsyncCtx18>>2] = 220;
     $53 = ((($AsyncCtx18)) + 4|0);
     HEAP32[$53>>2] = $17;
     $54 = ((($AsyncCtx18)) + 8|0);
     HEAP32[$54>>2] = $2;
     sp = STACKTOP;
     STACKTOP = sp;return (0|0);
    } else {
     _emscripten_free_async_context(($AsyncCtx18|0));
     label = 16;
     break;
    }
   }
  }
 } while(0);
 do {
  if ((label|0) == 16) {
   $55 = ($17|0)==(0);
   if ($55) {
    $$0 = $2;
   } else {
    ___unlockfile($2);
    $$0 = $2;
   }
  }
  else if ((label|0) == 21) {
   $AsyncCtx10 = _emscripten_alloc_async_context(8,sp)|0;
   (_fclose($2)|0);
   $IsAsync11 = ___async;
   if ($IsAsync11) {
    HEAP32[$AsyncCtx10>>2] = 222;
    $57 = ((($AsyncCtx10)) + 4|0);
    HEAP32[$57>>2] = $2;
    sp = STACKTOP;
    STACKTOP = sp;return (0|0);
   } else {
    _emscripten_free_async_context(($AsyncCtx10|0));
    $$0 = 0;
    break;
   }
  }
 } while(0);
 STACKTOP = sp;return ($$0|0);
}
function ___dup3($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $$sink = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $vararg_buffer = 0, $vararg_buffer3 = 0, $vararg_buffer7 = 0, $vararg_ptr1 = 0, $vararg_ptr10 = 0, $vararg_ptr11 = 0, $vararg_ptr2 = 0, $vararg_ptr6 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 48|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(48|0);
 $vararg_buffer7 = sp + 24|0;
 $vararg_buffer3 = sp + 16|0;
 $vararg_buffer = sp;
 $3 = ($0|0)==($1|0);
 L1: do {
  if ($3) {
   $$sink = -22;
  } else {
   $4 = $2 & 524288;
   $5 = ($4|0)!=(0);
   L3: do {
    if ($5) {
     while(1) {
      HEAP32[$vararg_buffer>>2] = $0;
      $vararg_ptr1 = ((($vararg_buffer)) + 4|0);
      HEAP32[$vararg_ptr1>>2] = $1;
      $vararg_ptr2 = ((($vararg_buffer)) + 8|0);
      HEAP32[$vararg_ptr2>>2] = $2;
      $6 = (___syscall330(330,($vararg_buffer|0))|0);
      switch ($6|0) {
      case -38:  {
       break L3;
       break;
      }
      case -16:  {
       break;
      }
      default: {
       $$sink = $6;
       break L1;
      }
      }
     }
    }
   } while(0);
   while(1) {
    HEAP32[$vararg_buffer3>>2] = $0;
    $vararg_ptr6 = ((($vararg_buffer3)) + 4|0);
    HEAP32[$vararg_ptr6>>2] = $1;
    $7 = (___syscall63(63,($vararg_buffer3|0))|0);
    $8 = ($7|0)==(-16);
    if (!($8)) {
     break;
    }
   }
   if ($5) {
    HEAP32[$vararg_buffer7>>2] = $1;
    $vararg_ptr10 = ((($vararg_buffer7)) + 4|0);
    HEAP32[$vararg_ptr10>>2] = 2;
    $vararg_ptr11 = ((($vararg_buffer7)) + 8|0);
    HEAP32[$vararg_ptr11>>2] = 1;
    (___syscall221(221,($vararg_buffer7|0))|0);
    $$sink = $7;
   } else {
    $$sink = $7;
   }
  }
 } while(0);
 $9 = (___syscall_ret($$sink)|0);
 STACKTOP = sp;return ($9|0);
}
function _printf($0,$varargs) {
 $0 = $0|0;
 $varargs = $varargs|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, $AsyncCtx = 0, $IsAsync = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = sp;
 HEAP32[$1>>2] = $varargs;
 $2 = HEAP32[373]|0;
 $AsyncCtx = _emscripten_alloc_async_context(8,sp)|0;
 $3 = (_vfprintf($2,$0,$1)|0);
 $IsAsync = ___async;
 if ($IsAsync) {
  HEAP32[$AsyncCtx>>2] = 223;
  $4 = ((($AsyncCtx)) + 4|0);
  HEAP32[$4>>2] = $1;
  sp = STACKTOP;
  STACKTOP = sp;return 0;
 } else {
  _emscripten_free_async_context(($AsyncCtx|0));
  STACKTOP = sp;return ($3|0);
 }
 return (0)|0;
}
function _puts($0) {
 $0 = $0|0;
 var $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0;
 var $7 = 0, $8 = 0, $9 = 0, $AsyncCtx = 0, $IsAsync = 0, $phitmp = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = HEAP32[373]|0;
 $2 = ((($1)) + 76|0);
 $3 = HEAP32[$2>>2]|0;
 $4 = ($3|0)>(-1);
 if ($4) {
  $5 = (___lockfile($1)|0);
  $19 = $5;
 } else {
  $19 = 0;
 }
 $6 = (_fputs($0,$1)|0);
 $7 = ($6|0)<(0);
 do {
  if ($7) {
   $22 = 1;
  } else {
   $8 = ((($1)) + 75|0);
   $9 = HEAP8[$8>>0]|0;
   $10 = ($9<<24>>24)==(10);
   if (!($10)) {
    $11 = ((($1)) + 20|0);
    $12 = HEAP32[$11>>2]|0;
    $13 = ((($1)) + 16|0);
    $14 = HEAP32[$13>>2]|0;
    $15 = ($12>>>0)<($14>>>0);
    if ($15) {
     $16 = ((($12)) + 1|0);
     HEAP32[$11>>2] = $16;
     HEAP8[$12>>0] = 10;
     $22 = 0;
     break;
    }
   }
   $AsyncCtx = _emscripten_alloc_async_context(12,sp)|0;
   $17 = (___overflow($1,10)|0);
   $IsAsync = ___async;
   if ($IsAsync) {
    HEAP32[$AsyncCtx>>2] = 224;
    $18 = ((($AsyncCtx)) + 4|0);
    HEAP32[$18>>2] = $19;
    $20 = ((($AsyncCtx)) + 8|0);
    HEAP32[$20>>2] = $1;
    sp = STACKTOP;
    return 0;
   } else {
    _emscripten_free_async_context(($AsyncCtx|0));
    $phitmp = ($17|0)<(0);
    $22 = $phitmp;
    break;
   }
  }
 } while(0);
 $21 = $22 << 31 >> 31;
 $23 = ($19|0)==(0);
 if (!($23)) {
  ___unlockfile($1);
 }
 return ($21|0);
}
function _setbuf($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $2 = 0, $3 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $2 = ($1|0)!=(0|0);
 $3 = $2 ? 0 : 2;
 (_setvbuf($0,$1,$3,1024)|0);
 return;
}
function _setvbuf($0,$1,$2,$3) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 var $4 = 0, $5 = 0, $6 = 0, $7 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $4 = ((($0)) + 75|0);
 HEAP8[$4>>0] = -1;
 switch ($2|0) {
 case 2:  {
  $5 = ((($0)) + 48|0);
  HEAP32[$5>>2] = 0;
  break;
 }
 case 1:  {
  HEAP8[$4>>0] = 10;
  break;
 }
 default: {
 }
 }
 $6 = HEAP32[$0>>2]|0;
 $7 = $6 | 64;
 HEAP32[$0>>2] = $7;
 return 0;
}
function __Znwj($0) {
 $0 = $0|0;
 var $$ = 0, $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $AsyncCtx = 0, $IsAsync = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = ($0|0)==(0);
 $$ = $1 ? 1 : $0;
 while(1) {
  $2 = (_malloc($$)|0);
  $3 = ($2|0)==(0|0);
  if (!($3)) {
   label = 8;
   break;
  }
  $4 = (__ZSt15get_new_handlerv()|0);
  $5 = ($4|0)==(0|0);
  if ($5) {
   label = 7;
   break;
  }
  $AsyncCtx = _emscripten_alloc_async_context(8,sp)|0;
  FUNCTION_TABLE_v[$4 & 255]();
  $IsAsync = ___async;
  if ($IsAsync) {
   label = 5;
   break;
  }
  _emscripten_free_async_context(($AsyncCtx|0));
 }
 if ((label|0) == 5) {
  HEAP32[$AsyncCtx>>2] = 225;
  $6 = ((($AsyncCtx)) + 4|0);
  HEAP32[$6>>2] = $$;
  sp = STACKTOP;
  return (0|0);
 }
 else if ((label|0) == 7) {
  $7 = (___cxa_allocate_exception(4)|0);
  __ZNSt9bad_allocC2Ev($7);
  ___cxa_throw(($7|0),(304|0),(94|0));
  // unreachable;
 }
 else if ((label|0) == 8) {
  return ($2|0);
 }
 return (0)|0;
}
function __Znaj($0) {
 $0 = $0|0;
 var $1 = 0, $AsyncCtx = 0, $IsAsync = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $AsyncCtx = _emscripten_alloc_async_context(4,sp)|0;
 $1 = (__Znwj($0)|0);
 $IsAsync = ___async;
 if ($IsAsync) {
  HEAP32[$AsyncCtx>>2] = 226;
  sp = STACKTOP;
  return (0|0);
 } else {
  _emscripten_free_async_context(($AsyncCtx|0));
  return ($1|0);
 }
 return (0)|0;
}
function __ZdlPv($0) {
 $0 = $0|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 _free($0);
 return;
}
function __ZL25default_terminate_handlerv() {
 var $0 = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0;
 var $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $5 = 0;
 var $6 = 0, $7 = 0, $8 = 0, $9 = 0, $AsyncCtx = 0, $AsyncCtx14 = 0, $IsAsync = 0, $IsAsync15 = 0, $vararg_buffer = 0, $vararg_buffer10 = 0, $vararg_buffer3 = 0, $vararg_buffer7 = 0, $vararg_ptr1 = 0, $vararg_ptr2 = 0, $vararg_ptr6 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 48|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(48|0);
 $vararg_buffer10 = sp + 32|0;
 $vararg_buffer7 = sp + 24|0;
 $vararg_buffer3 = sp + 16|0;
 $vararg_buffer = sp;
 $0 = sp + 36|0;
 $1 = (___cxa_get_globals_fast()|0);
 $2 = ($1|0)==(0|0);
 if (!($2)) {
  $3 = HEAP32[$1>>2]|0;
  $4 = ($3|0)==(0|0);
  if (!($4)) {
   $5 = ((($3)) + 80|0);
   $6 = ((($3)) + 48|0);
   $7 = $6;
   $8 = $7;
   $9 = HEAP32[$8>>2]|0;
   $10 = (($7) + 4)|0;
   $11 = $10;
   $12 = HEAP32[$11>>2]|0;
   $13 = $9 & -256;
   $14 = ($13|0)==(1126902528);
   $15 = ($12|0)==(1129074247);
   $16 = $14 & $15;
   if (!($16)) {
    HEAP32[$vararg_buffer7>>2] = 8345;
    _abort_message(8295,$vararg_buffer7);
    // unreachable;
   }
   $17 = ($9|0)==(1126902529);
   $18 = ($12|0)==(1129074247);
   $19 = $17 & $18;
   if ($19) {
    $20 = ((($3)) + 44|0);
    $21 = HEAP32[$20>>2]|0;
    $22 = $21;
   } else {
    $22 = $5;
   }
   HEAP32[$0>>2] = $22;
   $23 = HEAP32[$3>>2]|0;
   $24 = ((($23)) + 4|0);
   $25 = HEAP32[$24>>2]|0;
   $26 = HEAP32[60]|0;
   $27 = ((($26)) + 16|0);
   $28 = HEAP32[$27>>2]|0;
   $AsyncCtx = _emscripten_alloc_async_context(28,sp)|0;
   $29 = (FUNCTION_TABLE_iiii[$28 & 255](240,$23,$0)|0);
   $IsAsync = ___async;
   if ($IsAsync) {
    HEAP32[$AsyncCtx>>2] = 227;
    $30 = ((($AsyncCtx)) + 4|0);
    HEAP32[$30>>2] = $0;
    $31 = ((($AsyncCtx)) + 8|0);
    HEAP32[$31>>2] = $vararg_buffer3;
    $32 = ((($AsyncCtx)) + 12|0);
    HEAP32[$32>>2] = $25;
    $33 = ((($AsyncCtx)) + 16|0);
    HEAP32[$33>>2] = $vararg_buffer3;
    $34 = ((($AsyncCtx)) + 20|0);
    HEAP32[$34>>2] = $vararg_buffer;
    $35 = ((($AsyncCtx)) + 24|0);
    HEAP32[$35>>2] = $vararg_buffer;
    sp = STACKTOP;
    STACKTOP = sp;return;
   }
   _emscripten_free_async_context(($AsyncCtx|0));
   if (!($29)) {
    HEAP32[$vararg_buffer3>>2] = 8345;
    $vararg_ptr6 = ((($vararg_buffer3)) + 4|0);
    HEAP32[$vararg_ptr6>>2] = $25;
    _abort_message(8254,$vararg_buffer3);
    // unreachable;
   }
   $36 = HEAP32[$0>>2]|0;
   $37 = HEAP32[$36>>2]|0;
   $38 = ((($37)) + 8|0);
   $39 = HEAP32[$38>>2]|0;
   $AsyncCtx14 = _emscripten_alloc_async_context(16,sp)|0;
   $40 = (FUNCTION_TABLE_ii[$39 & 511]($36)|0);
   $IsAsync15 = ___async;
   if ($IsAsync15) {
    HEAP32[$AsyncCtx14>>2] = 228;
    $41 = ((($AsyncCtx14)) + 4|0);
    HEAP32[$41>>2] = $vararg_buffer;
    $42 = ((($AsyncCtx14)) + 8|0);
    HEAP32[$42>>2] = $25;
    $43 = ((($AsyncCtx14)) + 12|0);
    HEAP32[$43>>2] = $vararg_buffer;
    sp = STACKTOP;
    STACKTOP = sp;return;
   } else {
    _emscripten_free_async_context(($AsyncCtx14|0));
    HEAP32[$vararg_buffer>>2] = 8345;
    $vararg_ptr1 = ((($vararg_buffer)) + 4|0);
    HEAP32[$vararg_ptr1>>2] = $25;
    $vararg_ptr2 = ((($vararg_buffer)) + 8|0);
    HEAP32[$vararg_ptr2>>2] = $40;
    _abort_message(8209,$vararg_buffer);
    // unreachable;
   }
  }
 }
 _abort_message(8333,$vararg_buffer10);
 // unreachable;
}
function ___cxa_get_globals_fast() {
 var $0 = 0, $1 = 0, $2 = 0, $3 = 0, $vararg_buffer = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $vararg_buffer = sp;
 $0 = (_pthread_once((13752|0),(229|0))|0);
 $1 = ($0|0)==(0);
 if ($1) {
  $2 = HEAP32[3439]|0;
  $3 = (_pthread_getspecific(($2|0))|0);
  STACKTOP = sp;return ($3|0);
 } else {
  _abort_message(8484,$vararg_buffer);
  // unreachable;
 }
 return (0)|0;
}
function _abort_message($0,$varargs) {
 $0 = $0|0;
 $varargs = $varargs|0;
 var $1 = 0, $2 = 0, $3 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, $IsAsync = 0, $IsAsync4 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = sp;
 HEAP32[$1>>2] = $varargs;
 $2 = HEAP32[280]|0;
 $AsyncCtx3 = _emscripten_alloc_async_context(8,sp)|0;
 (_vfprintf($2,$0,$1)|0);
 $IsAsync4 = ___async;
 if ($IsAsync4) {
  HEAP32[$AsyncCtx3>>2] = 230;
  $3 = ((($AsyncCtx3)) + 4|0);
  HEAP32[$3>>2] = $2;
  sp = STACKTOP;
  STACKTOP = sp;return;
 }
 _emscripten_free_async_context(($AsyncCtx3|0));
 $AsyncCtx = _emscripten_alloc_async_context(4,sp)|0;
 (_fputc(10,$2)|0);
 $IsAsync = ___async;
 if ($IsAsync) {
  HEAP32[$AsyncCtx>>2] = 231;
  sp = STACKTOP;
  STACKTOP = sp;return;
 } else {
  _emscripten_free_async_context(($AsyncCtx|0));
  _abort();
  // unreachable;
 }
}
function __ZN10__cxxabiv116__shim_type_infoD2Ev($0) {
 $0 = $0|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 return;
}
function __ZN10__cxxabiv117__class_type_infoD0Ev($0) {
 $0 = $0|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 __ZN10__cxxabiv116__shim_type_infoD2Ev($0);
 __ZdlPv($0);
 return;
}
function __ZNK10__cxxabiv116__shim_type_info5noop1Ev($0) {
 $0 = $0|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 return;
}
function __ZNK10__cxxabiv116__shim_type_info5noop2Ev($0) {
 $0 = $0|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 return;
}
function __ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $$0 = 0, $$2 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $3 = 0;
 var $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, $IsAsync = 0, $IsAsync4 = 0, dest = 0, label = 0, sp = 0, stop = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 64|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(64|0);
 $3 = sp;
 $4 = (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0,$1,0)|0);
 if ($4) {
  $$2 = 1;
 } else {
  $5 = ($1|0)==(0|0);
  if ($5) {
   $$2 = 0;
  } else {
   $AsyncCtx3 = _emscripten_alloc_async_context(16,sp)|0;
   $6 = (___dynamic_cast($1,264,248,0)|0);
   $IsAsync4 = ___async;
   if ($IsAsync4) {
    HEAP32[$AsyncCtx3>>2] = 232;
    $7 = ((($AsyncCtx3)) + 4|0);
    HEAP32[$7>>2] = $3;
    $8 = ((($AsyncCtx3)) + 8|0);
    HEAP32[$8>>2] = $0;
    $9 = ((($AsyncCtx3)) + 12|0);
    HEAP32[$9>>2] = $2;
    sp = STACKTOP;
    STACKTOP = sp;return 0;
   }
   _emscripten_free_async_context(($AsyncCtx3|0));
   $10 = ($6|0)==(0|0);
   if ($10) {
    $$2 = 0;
   } else {
    $11 = ((($3)) + 4|0);
    dest=$11; stop=dest+52|0; do { HEAP32[dest>>2]=0|0; dest=dest+4|0; } while ((dest|0) < (stop|0));
    HEAP32[$3>>2] = $6;
    $12 = ((($3)) + 8|0);
    HEAP32[$12>>2] = $0;
    $13 = ((($3)) + 12|0);
    HEAP32[$13>>2] = -1;
    $14 = ((($3)) + 48|0);
    HEAP32[$14>>2] = 1;
    $15 = HEAP32[$6>>2]|0;
    $16 = ((($15)) + 28|0);
    $17 = HEAP32[$16>>2]|0;
    $18 = HEAP32[$2>>2]|0;
    $AsyncCtx = _emscripten_alloc_async_context(16,sp)|0;
    FUNCTION_TABLE_viiii[$17 & 127]($6,$3,$18,1);
    $IsAsync = ___async;
    if ($IsAsync) {
     HEAP32[$AsyncCtx>>2] = 233;
     $19 = ((($AsyncCtx)) + 4|0);
     HEAP32[$19>>2] = $3;
     $20 = ((($AsyncCtx)) + 8|0);
     HEAP32[$20>>2] = $2;
     $21 = ((($AsyncCtx)) + 12|0);
     HEAP32[$21>>2] = $3;
     sp = STACKTOP;
     STACKTOP = sp;return 0;
    }
    _emscripten_free_async_context(($AsyncCtx|0));
    $22 = ((($3)) + 24|0);
    $23 = HEAP32[$22>>2]|0;
    $24 = ($23|0)==(1);
    if ($24) {
     $25 = ((($3)) + 16|0);
     $26 = HEAP32[$25>>2]|0;
     HEAP32[$2>>2] = $26;
     $$0 = 1;
    } else {
     $$0 = 0;
    }
    $$2 = $$0;
   }
  }
 }
 STACKTOP = sp;return ($$2|0);
}
function __ZNK10__cxxabiv117__class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($0,$1,$2,$3,$4,$5) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 $4 = $4|0;
 $5 = $5|0;
 var $6 = 0, $7 = 0, $8 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $6 = ((($1)) + 8|0);
 $7 = HEAP32[$6>>2]|0;
 $8 = (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0,$7,$5)|0);
 if ($8) {
  __ZNK10__cxxabiv117__class_type_info29process_static_type_above_dstEPNS_19__dynamic_cast_infoEPKvS4_i(0,$1,$2,$3,$4);
 }
 return;
}
function __ZNK10__cxxabiv117__class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($0,$1,$2,$3,$4) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 $4 = $4|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $5 = 0;
 var $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $5 = ((($1)) + 8|0);
 $6 = HEAP32[$5>>2]|0;
 $7 = (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0,$6,$4)|0);
 do {
  if ($7) {
   __ZNK10__cxxabiv117__class_type_info29process_static_type_below_dstEPNS_19__dynamic_cast_infoEPKvi(0,$1,$2,$3);
  } else {
   $8 = HEAP32[$1>>2]|0;
   $9 = (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0,$8,$4)|0);
   if ($9) {
    $10 = ((($1)) + 16|0);
    $11 = HEAP32[$10>>2]|0;
    $12 = ($11|0)==($2|0);
    $13 = ((($1)) + 32|0);
    if (!($12)) {
     $14 = ((($1)) + 20|0);
     $15 = HEAP32[$14>>2]|0;
     $16 = ($15|0)==($2|0);
     if (!($16)) {
      HEAP32[$13>>2] = $3;
      HEAP32[$14>>2] = $2;
      $18 = ((($1)) + 40|0);
      $19 = HEAP32[$18>>2]|0;
      $20 = (($19) + 1)|0;
      HEAP32[$18>>2] = $20;
      $21 = ((($1)) + 36|0);
      $22 = HEAP32[$21>>2]|0;
      $23 = ($22|0)==(1);
      if ($23) {
       $24 = ((($1)) + 24|0);
       $25 = HEAP32[$24>>2]|0;
       $26 = ($25|0)==(2);
       if ($26) {
        $27 = ((($1)) + 54|0);
        HEAP8[$27>>0] = 1;
       }
      }
      $28 = ((($1)) + 44|0);
      HEAP32[$28>>2] = 4;
      break;
     }
    }
    $17 = ($3|0)==(1);
    if ($17) {
     HEAP32[$13>>2] = 1;
    }
   }
  }
 } while(0);
 return;
}
function __ZNK10__cxxabiv117__class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($0,$1,$2,$3) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 var $4 = 0, $5 = 0, $6 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $4 = ((($1)) + 8|0);
 $5 = HEAP32[$4>>2]|0;
 $6 = (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0,$5,0)|0);
 if ($6) {
  __ZNK10__cxxabiv117__class_type_info24process_found_base_classEPNS_19__dynamic_cast_infoEPvi(0,$1,$2,$3);
 }
 return;
}
function __ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $3 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $3 = ($0|0)==($1|0);
 return ($3|0);
}
function __ZNK10__cxxabiv117__class_type_info24process_found_base_classEPNS_19__dynamic_cast_infoEPvi($0,$1,$2,$3) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $4 = ((($1)) + 16|0);
 $5 = HEAP32[$4>>2]|0;
 $6 = ($5|0)==(0|0);
 $7 = ((($1)) + 36|0);
 $8 = ((($1)) + 24|0);
 do {
  if ($6) {
   HEAP32[$4>>2] = $2;
   HEAP32[$8>>2] = $3;
   HEAP32[$7>>2] = 1;
  } else {
   $9 = ($5|0)==($2|0);
   if (!($9)) {
    $12 = HEAP32[$7>>2]|0;
    $13 = (($12) + 1)|0;
    HEAP32[$7>>2] = $13;
    HEAP32[$8>>2] = 2;
    $14 = ((($1)) + 54|0);
    HEAP8[$14>>0] = 1;
    break;
   }
   $10 = HEAP32[$8>>2]|0;
   $11 = ($10|0)==(2);
   if ($11) {
    HEAP32[$8>>2] = $3;
   }
  }
 } while(0);
 return;
}
function __ZNK10__cxxabiv117__class_type_info29process_static_type_below_dstEPNS_19__dynamic_cast_infoEPKvi($0,$1,$2,$3) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 var $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $4 = ((($1)) + 4|0);
 $5 = HEAP32[$4>>2]|0;
 $6 = ($5|0)==($2|0);
 if ($6) {
  $7 = ((($1)) + 28|0);
  $8 = HEAP32[$7>>2]|0;
  $9 = ($8|0)==(1);
  if (!($9)) {
   HEAP32[$7>>2] = $3;
  }
 }
 return;
}
function __ZNK10__cxxabiv117__class_type_info29process_static_type_above_dstEPNS_19__dynamic_cast_infoEPKvS4_i($0,$1,$2,$3,$4) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 $4 = $4|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $5 = 0;
 var $6 = 0, $7 = 0, $8 = 0, $9 = 0, $or$cond = 0, $or$cond22 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $5 = ((($1)) + 53|0);
 HEAP8[$5>>0] = 1;
 $6 = ((($1)) + 4|0);
 $7 = HEAP32[$6>>2]|0;
 $8 = ($7|0)==($3|0);
 do {
  if ($8) {
   $9 = ((($1)) + 52|0);
   HEAP8[$9>>0] = 1;
   $10 = ((($1)) + 16|0);
   $11 = HEAP32[$10>>2]|0;
   $12 = ($11|0)==(0|0);
   $13 = ((($1)) + 54|0);
   $14 = ((($1)) + 48|0);
   $15 = ((($1)) + 24|0);
   $16 = ((($1)) + 36|0);
   if ($12) {
    HEAP32[$10>>2] = $2;
    HEAP32[$15>>2] = $4;
    HEAP32[$16>>2] = 1;
    $17 = HEAP32[$14>>2]|0;
    $18 = ($17|0)==(1);
    $19 = ($4|0)==(1);
    $or$cond = $18 & $19;
    if (!($or$cond)) {
     break;
    }
    HEAP8[$13>>0] = 1;
    break;
   }
   $20 = ($11|0)==($2|0);
   if (!($20)) {
    $27 = HEAP32[$16>>2]|0;
    $28 = (($27) + 1)|0;
    HEAP32[$16>>2] = $28;
    HEAP8[$13>>0] = 1;
    break;
   }
   $21 = HEAP32[$15>>2]|0;
   $22 = ($21|0)==(2);
   if ($22) {
    HEAP32[$15>>2] = $4;
    $26 = $4;
   } else {
    $26 = $21;
   }
   $23 = HEAP32[$14>>2]|0;
   $24 = ($23|0)==(1);
   $25 = ($26|0)==(1);
   $or$cond22 = $24 & $25;
   if ($or$cond22) {
    HEAP8[$13>>0] = 1;
   }
  }
 } while(0);
 return;
}
function ___dynamic_cast($0,$1,$2,$3) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 var $$ = 0, $$0 = 0, $$33 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0;
 var $27 = 0, $28 = 0, $29 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0;
 var $46 = 0, $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0;
 var $IsAsync = 0, $IsAsync4 = 0, $or$cond = 0, $or$cond28 = 0, $or$cond30 = 0, $or$cond32 = 0, dest = 0, label = 0, sp = 0, stop = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 64|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(64|0);
 $4 = sp;
 $5 = HEAP32[$0>>2]|0;
 $6 = ((($5)) + -8|0);
 $7 = HEAP32[$6>>2]|0;
 $8 = (($0) + ($7)|0);
 $9 = ((($5)) + -4|0);
 $10 = HEAP32[$9>>2]|0;
 HEAP32[$4>>2] = $2;
 $11 = ((($4)) + 4|0);
 HEAP32[$11>>2] = $0;
 $12 = ((($4)) + 8|0);
 HEAP32[$12>>2] = $1;
 $13 = ((($4)) + 12|0);
 HEAP32[$13>>2] = $3;
 $14 = ((($4)) + 16|0);
 $15 = ((($4)) + 20|0);
 $16 = ((($4)) + 24|0);
 $17 = ((($4)) + 28|0);
 $18 = ((($4)) + 32|0);
 $19 = ((($4)) + 40|0);
 dest=$14; stop=dest+36|0; do { HEAP32[dest>>2]=0|0; dest=dest+4|0; } while ((dest|0) < (stop|0));HEAP16[$14+36>>1]=0|0;HEAP8[$14+38>>0]=0|0;
 $20 = (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($10,$2,0)|0);
 L1: do {
  if ($20) {
   $21 = ((($4)) + 48|0);
   HEAP32[$21>>2] = 1;
   $22 = HEAP32[$10>>2]|0;
   $23 = ((($22)) + 20|0);
   $24 = HEAP32[$23>>2]|0;
   $AsyncCtx = _emscripten_alloc_async_context(16,sp)|0;
   FUNCTION_TABLE_viiiiii[$24 & 127]($10,$4,$8,$8,1,0);
   $IsAsync = ___async;
   if ($IsAsync) {
    HEAP32[$AsyncCtx>>2] = 234;
    $25 = ((($AsyncCtx)) + 4|0);
    HEAP32[$25>>2] = $16;
    $26 = ((($AsyncCtx)) + 8|0);
    HEAP32[$26>>2] = $8;
    $27 = ((($AsyncCtx)) + 12|0);
    HEAP32[$27>>2] = $4;
    sp = STACKTOP;
    STACKTOP = sp;return (0|0);
   } else {
    _emscripten_free_async_context(($AsyncCtx|0));
    $28 = HEAP32[$16>>2]|0;
    $29 = ($28|0)==(1);
    $$ = $29 ? $8 : 0;
    $$0 = $$;
    break;
   }
  } else {
   $30 = ((($4)) + 36|0);
   $31 = HEAP32[$10>>2]|0;
   $32 = ((($31)) + 24|0);
   $33 = HEAP32[$32>>2]|0;
   $AsyncCtx3 = _emscripten_alloc_async_context(36,sp)|0;
   FUNCTION_TABLE_viiiii[$33 & 127]($10,$4,$8,1,0);
   $IsAsync4 = ___async;
   if ($IsAsync4) {
    HEAP32[$AsyncCtx3>>2] = 235;
    $34 = ((($AsyncCtx3)) + 4|0);
    HEAP32[$34>>2] = $30;
    $35 = ((($AsyncCtx3)) + 8|0);
    HEAP32[$35>>2] = $4;
    $36 = ((($AsyncCtx3)) + 12|0);
    HEAP32[$36>>2] = $19;
    $37 = ((($AsyncCtx3)) + 16|0);
    HEAP32[$37>>2] = $17;
    $38 = ((($AsyncCtx3)) + 20|0);
    HEAP32[$38>>2] = $18;
    $39 = ((($AsyncCtx3)) + 24|0);
    HEAP32[$39>>2] = $15;
    $40 = ((($AsyncCtx3)) + 28|0);
    HEAP32[$40>>2] = $16;
    $41 = ((($AsyncCtx3)) + 32|0);
    HEAP32[$41>>2] = $14;
    sp = STACKTOP;
    STACKTOP = sp;return (0|0);
   }
   _emscripten_free_async_context(($AsyncCtx3|0));
   $42 = HEAP32[$30>>2]|0;
   switch ($42|0) {
   case 0:  {
    $43 = HEAP32[$19>>2]|0;
    $44 = ($43|0)==(1);
    $45 = HEAP32[$17>>2]|0;
    $46 = ($45|0)==(1);
    $or$cond = $44 & $46;
    $47 = HEAP32[$18>>2]|0;
    $48 = ($47|0)==(1);
    $or$cond28 = $or$cond & $48;
    $49 = HEAP32[$15>>2]|0;
    $$33 = $or$cond28 ? $49 : 0;
    $$0 = $$33;
    break L1;
    break;
   }
   case 1:  {
    break;
   }
   default: {
    $$0 = 0;
    break L1;
   }
   }
   $50 = HEAP32[$16>>2]|0;
   $51 = ($50|0)==(1);
   if (!($51)) {
    $52 = HEAP32[$19>>2]|0;
    $53 = ($52|0)==(0);
    $54 = HEAP32[$17>>2]|0;
    $55 = ($54|0)==(1);
    $or$cond30 = $53 & $55;
    $56 = HEAP32[$18>>2]|0;
    $57 = ($56|0)==(1);
    $or$cond32 = $or$cond30 & $57;
    if (!($or$cond32)) {
     $$0 = 0;
     break;
    }
   }
   $58 = HEAP32[$14>>2]|0;
   $$0 = $58;
  }
 } while(0);
 STACKTOP = sp;return ($$0|0);
}
function __ZN10__cxxabiv120__si_class_type_infoD0Ev($0) {
 $0 = $0|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 __ZN10__cxxabiv116__shim_type_infoD2Ev($0);
 __ZdlPv($0);
 return;
}
function __ZNK10__cxxabiv120__si_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($0,$1,$2,$3,$4,$5) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 $4 = $4|0;
 $5 = $5|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $AsyncCtx = 0, $IsAsync = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $6 = ((($1)) + 8|0);
 $7 = HEAP32[$6>>2]|0;
 $8 = (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0,$7,$5)|0);
 do {
  if ($8) {
   __ZNK10__cxxabiv117__class_type_info29process_static_type_above_dstEPNS_19__dynamic_cast_infoEPKvS4_i(0,$1,$2,$3,$4);
  } else {
   $9 = ((($0)) + 8|0);
   $10 = HEAP32[$9>>2]|0;
   $11 = HEAP32[$10>>2]|0;
   $12 = ((($11)) + 20|0);
   $13 = HEAP32[$12>>2]|0;
   $AsyncCtx = _emscripten_alloc_async_context(4,sp)|0;
   FUNCTION_TABLE_viiiiii[$13 & 127]($10,$1,$2,$3,$4,$5);
   $IsAsync = ___async;
   if ($IsAsync) {
    HEAP32[$AsyncCtx>>2] = 236;
    sp = STACKTOP;
    return;
   } else {
    _emscripten_free_async_context(($AsyncCtx|0));
    break;
   }
  }
 } while(0);
 return;
}
function __ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($0,$1,$2,$3,$4) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 $4 = $4|0;
 var $$037$off038 = 0, $$037$off039 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0;
 var $28 = 0, $29 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0;
 var $48 = 0, $49 = 0, $5 = 0, $50 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, $IsAsync = 0, $IsAsync4 = 0, $not$ = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $5 = ((($1)) + 8|0);
 $6 = HEAP32[$5>>2]|0;
 $7 = (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0,$6,$4)|0);
 do {
  if ($7) {
   __ZNK10__cxxabiv117__class_type_info29process_static_type_below_dstEPNS_19__dynamic_cast_infoEPKvi(0,$1,$2,$3);
  } else {
   $8 = HEAP32[$1>>2]|0;
   $9 = (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0,$8,$4)|0);
   $10 = ((($0)) + 8|0);
   if (!($9)) {
    $47 = HEAP32[$10>>2]|0;
    $48 = HEAP32[$47>>2]|0;
    $49 = ((($48)) + 24|0);
    $50 = HEAP32[$49>>2]|0;
    $AsyncCtx3 = _emscripten_alloc_async_context(4,sp)|0;
    FUNCTION_TABLE_viiiii[$50 & 127]($47,$1,$2,$3,$4);
    $IsAsync4 = ___async;
    if ($IsAsync4) {
     HEAP32[$AsyncCtx3>>2] = 238;
     sp = STACKTOP;
     return;
    } else {
     _emscripten_free_async_context(($AsyncCtx3|0));
     break;
    }
   }
   $11 = ((($1)) + 16|0);
   $12 = HEAP32[$11>>2]|0;
   $13 = ($12|0)==($2|0);
   $14 = ((($1)) + 32|0);
   if (!($13)) {
    $15 = ((($1)) + 20|0);
    $16 = HEAP32[$15>>2]|0;
    $17 = ($16|0)==($2|0);
    if (!($17)) {
     HEAP32[$14>>2] = $3;
     $19 = ((($1)) + 44|0);
     $20 = HEAP32[$19>>2]|0;
     $21 = ($20|0)==(4);
     if ($21) {
      break;
     }
     $22 = ((($1)) + 52|0);
     HEAP8[$22>>0] = 0;
     $23 = ((($1)) + 53|0);
     HEAP8[$23>>0] = 0;
     $24 = HEAP32[$10>>2]|0;
     $25 = HEAP32[$24>>2]|0;
     $26 = ((($25)) + 20|0);
     $27 = HEAP32[$26>>2]|0;
     $AsyncCtx = _emscripten_alloc_async_context(28,sp)|0;
     FUNCTION_TABLE_viiiiii[$27 & 127]($24,$1,$2,$2,1,$4);
     $IsAsync = ___async;
     if ($IsAsync) {
      HEAP32[$AsyncCtx>>2] = 237;
      $28 = ((($AsyncCtx)) + 4|0);
      HEAP32[$28>>2] = $23;
      $29 = ((($AsyncCtx)) + 8|0);
      HEAP32[$29>>2] = $2;
      $30 = ((($AsyncCtx)) + 12|0);
      HEAP32[$30>>2] = $15;
      $31 = ((($AsyncCtx)) + 16|0);
      HEAP32[$31>>2] = $1;
      $32 = ((($AsyncCtx)) + 20|0);
      HEAP32[$32>>2] = $22;
      $33 = ((($AsyncCtx)) + 24|0);
      HEAP32[$33>>2] = $19;
      sp = STACKTOP;
      return;
     }
     _emscripten_free_async_context(($AsyncCtx|0));
     $34 = HEAP8[$23>>0]|0;
     $35 = ($34<<24>>24)==(0);
     if ($35) {
      $$037$off038 = 4;
      label = 13;
     } else {
      $36 = HEAP8[$22>>0]|0;
      $not$ = ($36<<24>>24)==(0);
      if ($not$) {
       $$037$off038 = 3;
       label = 13;
      } else {
       $$037$off039 = 3;
      }
     }
     if ((label|0) == 13) {
      HEAP32[$15>>2] = $2;
      $37 = ((($1)) + 40|0);
      $38 = HEAP32[$37>>2]|0;
      $39 = (($38) + 1)|0;
      HEAP32[$37>>2] = $39;
      $40 = ((($1)) + 36|0);
      $41 = HEAP32[$40>>2]|0;
      $42 = ($41|0)==(1);
      if ($42) {
       $43 = ((($1)) + 24|0);
       $44 = HEAP32[$43>>2]|0;
       $45 = ($44|0)==(2);
       if ($45) {
        $46 = ((($1)) + 54|0);
        HEAP8[$46>>0] = 1;
        $$037$off039 = $$037$off038;
       } else {
        $$037$off039 = $$037$off038;
       }
      } else {
       $$037$off039 = $$037$off038;
      }
     }
     HEAP32[$19>>2] = $$037$off039;
     break;
    }
   }
   $18 = ($3|0)==(1);
   if ($18) {
    HEAP32[$14>>2] = 1;
   }
  }
 } while(0);
 return;
}
function __ZNK10__cxxabiv120__si_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($0,$1,$2,$3) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 var $10 = 0, $11 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $AsyncCtx = 0, $IsAsync = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $4 = ((($1)) + 8|0);
 $5 = HEAP32[$4>>2]|0;
 $6 = (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0,$5,0)|0);
 do {
  if ($6) {
   __ZNK10__cxxabiv117__class_type_info24process_found_base_classEPNS_19__dynamic_cast_infoEPvi(0,$1,$2,$3);
  } else {
   $7 = ((($0)) + 8|0);
   $8 = HEAP32[$7>>2]|0;
   $9 = HEAP32[$8>>2]|0;
   $10 = ((($9)) + 28|0);
   $11 = HEAP32[$10>>2]|0;
   $AsyncCtx = _emscripten_alloc_async_context(4,sp)|0;
   FUNCTION_TABLE_viiii[$11 & 127]($8,$1,$2,$3);
   $IsAsync = ___async;
   if ($IsAsync) {
    HEAP32[$AsyncCtx>>2] = 239;
    sp = STACKTOP;
    return;
   } else {
    _emscripten_free_async_context(($AsyncCtx|0));
    break;
   }
  }
 } while(0);
 return;
}
function __ZNSt9type_infoD2Ev($0) {
 $0 = $0|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 return;
}
function __ZN10__cxxabiv112_GLOBAL__N_110construct_Ev() {
 var $0 = 0, $1 = 0, $vararg_buffer = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $vararg_buffer = sp;
 $0 = (_pthread_key_create((13756|0),(240|0))|0);
 $1 = ($0|0)==(0);
 if ($1) {
  STACKTOP = sp;return;
 } else {
  _abort_message(8533,$vararg_buffer);
  // unreachable;
 }
}
function __ZN10__cxxabiv112_GLOBAL__N_19destruct_EPv($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $vararg_buffer = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $vararg_buffer = sp;
 _free($0);
 $1 = HEAP32[3439]|0;
 $2 = (_pthread_setspecific(($1|0),(0|0))|0);
 $3 = ($2|0)==(0);
 if ($3) {
  STACKTOP = sp;return;
 } else {
  _abort_message(8583,$vararg_buffer);
  // unreachable;
 }
}
function __ZSt9terminatev() {
 var $0 = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0;
 var $8 = 0, $9 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, $AsyncCtx7 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 __THREW__ = 0;
 $0 = (invoke_i(241)|0);
 $1 = __THREW__; __THREW__ = 0;
 $2 = $1&1;
 if ($2) {
  $20 = ___cxa_find_matching_catch_3(0|0)|0;
  $21 = tempRet0;
  $AsyncCtx7 = _emscripten_alloc_async_context(4,sp)|0;
  ___clang_call_terminate($20);
  // unreachable;
 }
 $3 = ($0|0)==(0|0);
 if (!($3)) {
  $4 = HEAP32[$0>>2]|0;
  $5 = ($4|0)==(0|0);
  if (!($5)) {
   $6 = ((($4)) + 48|0);
   $7 = $6;
   $8 = $7;
   $9 = HEAP32[$8>>2]|0;
   $10 = (($7) + 4)|0;
   $11 = $10;
   $12 = HEAP32[$11>>2]|0;
   $13 = $9 & -256;
   $14 = ($13|0)==(1126902528);
   $15 = ($12|0)==(1129074247);
   $16 = $14 & $15;
   if ($16) {
    $17 = ((($4)) + 12|0);
    $18 = HEAP32[$17>>2]|0;
    $AsyncCtx3 = _emscripten_alloc_async_context(4,sp)|0;
    __ZSt11__terminatePFvvE($18);
    // unreachable;
   }
  }
 }
 $19 = (__ZSt13get_terminatev()|0);
 $AsyncCtx = _emscripten_alloc_async_context(4,sp)|0;
 __ZSt11__terminatePFvvE($19);
 // unreachable;
}
function __ZSt11__terminatePFvvE($0) {
 $0 = $0|0;
 var $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $AsyncCtx = 0, $AsyncCtx5 = 0, $AsyncCtx9 = 0, $IsAsync = 0;
 var $vararg_buffer = 0, $vararg_buffer1 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $vararg_buffer1 = sp + 8|0;
 $vararg_buffer = sp;
 __THREW__ = 0;
 $AsyncCtx = _emscripten_alloc_async_context(20,sp)|0;
 invoke_v($0|0);
 $IsAsync = ___async;
 if ($IsAsync) {
  HEAP32[$AsyncCtx>>2] = 242;
  $1 = ((($AsyncCtx)) + 4|0);
  HEAP32[$1>>2] = $vararg_buffer1;
  $2 = ((($AsyncCtx)) + 8|0);
  HEAP32[$2>>2] = $vararg_buffer1;
  $3 = ((($AsyncCtx)) + 12|0);
  HEAP32[$3>>2] = $vararg_buffer;
  $4 = ((($AsyncCtx)) + 16|0);
  HEAP32[$4>>2] = $vararg_buffer;
  sp = STACKTOP;
  STACKTOP = sp;return;
 }
 _emscripten_free_async_context(($AsyncCtx|0));
 $5 = __THREW__; __THREW__ = 0;
 $6 = $5&1;
 if (!($6)) {
  __THREW__ = 0;
  invoke_vii(243,(8636|0),($vararg_buffer|0));
  $7 = __THREW__; __THREW__ = 0;
 }
 $8 = ___cxa_find_matching_catch_3(0|0)|0;
 $9 = tempRet0;
 (___cxa_begin_catch(($8|0))|0);
 __THREW__ = 0;
 invoke_vii(243,(8676|0),($vararg_buffer1|0));
 $10 = __THREW__; __THREW__ = 0;
 $11 = ___cxa_find_matching_catch_3(0|0)|0;
 $12 = tempRet0;
 __THREW__ = 0;
 invoke_v(244);
 $13 = __THREW__; __THREW__ = 0;
 $14 = $13&1;
 if ($14) {
  $15 = ___cxa_find_matching_catch_3(0|0)|0;
  $16 = tempRet0;
  $AsyncCtx9 = _emscripten_alloc_async_context(4,sp)|0;
  ___clang_call_terminate($15);
  // unreachable;
 } else {
  $AsyncCtx5 = _emscripten_alloc_async_context(4,sp)|0;
  ___clang_call_terminate($11);
  // unreachable;
 }
}
function __ZSt13get_terminatev() {
 var $0 = 0, $1 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = HEAP32[437]|0;HEAP32[437] = (($0+0)|0);
 $1 = $0;
 return ($1|0);
}
function __ZNSt9bad_allocD2Ev($0) {
 $0 = $0|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 return;
}
function __ZNSt9bad_allocD0Ev($0) {
 $0 = $0|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 __ZNSt9bad_allocD2Ev($0);
 __ZdlPv($0);
 return;
}
function __ZNKSt9bad_alloc4whatEv($0) {
 $0 = $0|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (8726|0);
}
function __ZNSt9exceptionD2Ev($0) {
 $0 = $0|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 return;
}
function __ZN10__cxxabiv121__vmi_class_type_infoD0Ev($0) {
 $0 = $0|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 __ZN10__cxxabiv116__shim_type_infoD2Ev($0);
 __ZdlPv($0);
 return;
}
function __ZNK10__cxxabiv121__vmi_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($0,$1,$2,$3,$4,$5) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 $4 = $4|0;
 $5 = $5|0;
 var $$0 = 0, $$expand_i1_val = 0, $$expand_i1_val7 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0;
 var $27 = 0, $28 = 0, $29 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0;
 var $47 = 0, $48 = 0, $49 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0, $7 = 0, $8 = 0;
 var $9 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, $IsAsync = 0, $IsAsync4 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $6 = ((($1)) + 8|0);
 $7 = HEAP32[$6>>2]|0;
 $8 = (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0,$7,$5)|0);
 if ($8) {
  __ZNK10__cxxabiv117__class_type_info29process_static_type_above_dstEPNS_19__dynamic_cast_infoEPKvS4_i(0,$1,$2,$3,$4);
 } else {
  $9 = ((($1)) + 52|0);
  $10 = HEAP8[$9>>0]|0;
  $11 = ((($1)) + 53|0);
  $12 = HEAP8[$11>>0]|0;
  $13 = ((($0)) + 16|0);
  $14 = ((($0)) + 12|0);
  $15 = HEAP32[$14>>2]|0;
  $16 = (((($0)) + 16|0) + ($15<<3)|0);
  HEAP8[$9>>0] = 0;
  HEAP8[$11>>0] = 0;
  $AsyncCtx3 = _emscripten_alloc_async_context(52,sp)|0;
  __ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($13,$1,$2,$3,$4,$5);
  $IsAsync4 = ___async;
  if ($IsAsync4) {
   HEAP32[$AsyncCtx3>>2] = 245;
   $17 = ((($AsyncCtx3)) + 4|0);
   HEAP32[$17>>2] = $15;
   $18 = ((($AsyncCtx3)) + 8|0);
   HEAP32[$18>>2] = $0;
   $19 = ((($AsyncCtx3)) + 12|0);
   HEAP32[$19>>2] = $1;
   $20 = ((($AsyncCtx3)) + 16|0);
   HEAP8[$20>>0] = $10;
   $21 = ((($AsyncCtx3)) + 20|0);
   HEAP32[$21>>2] = $9;
   $22 = ((($AsyncCtx3)) + 24|0);
   HEAP8[$22>>0] = $12;
   $23 = ((($AsyncCtx3)) + 28|0);
   HEAP32[$23>>2] = $11;
   $24 = ((($AsyncCtx3)) + 32|0);
   HEAP32[$24>>2] = $2;
   $25 = ((($AsyncCtx3)) + 36|0);
   HEAP32[$25>>2] = $3;
   $26 = ((($AsyncCtx3)) + 40|0);
   HEAP32[$26>>2] = $4;
   $27 = ((($AsyncCtx3)) + 44|0);
   $$expand_i1_val = $5&1;
   HEAP8[$27>>0] = $$expand_i1_val;
   $28 = ((($AsyncCtx3)) + 48|0);
   HEAP32[$28>>2] = $16;
   sp = STACKTOP;
   return;
  }
  _emscripten_free_async_context(($AsyncCtx3|0));
  $29 = ($15|0)>(1);
  L7: do {
   if ($29) {
    $30 = ((($0)) + 24|0);
    $31 = ((($1)) + 24|0);
    $32 = ((($1)) + 54|0);
    $33 = ((($0)) + 8|0);
    $$0 = $30;
    while(1) {
     $34 = HEAP8[$32>>0]|0;
     $35 = ($34<<24>>24)==(0);
     if (!($35)) {
      break L7;
     }
     $36 = HEAP8[$9>>0]|0;
     $37 = ($36<<24>>24)==(0);
     if ($37) {
      $43 = HEAP8[$11>>0]|0;
      $44 = ($43<<24>>24)==(0);
      if (!($44)) {
       $45 = HEAP32[$33>>2]|0;
       $46 = $45 & 1;
       $47 = ($46|0)==(0);
       if ($47) {
        break L7;
       }
      }
     } else {
      $38 = HEAP32[$31>>2]|0;
      $39 = ($38|0)==(1);
      if ($39) {
       break L7;
      }
      $40 = HEAP32[$33>>2]|0;
      $41 = $40 & 2;
      $42 = ($41|0)==(0);
      if ($42) {
       break L7;
      }
     }
     HEAP8[$9>>0] = 0;
     HEAP8[$11>>0] = 0;
     $AsyncCtx = _emscripten_alloc_async_context(60,sp)|0;
     __ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($$0,$1,$2,$3,$4,$5);
     $IsAsync = ___async;
     if ($IsAsync) {
      break;
     }
     _emscripten_free_async_context(($AsyncCtx|0));
     $62 = ((($$0)) + 8|0);
     $63 = ($62>>>0)<($16>>>0);
     if ($63) {
      $$0 = $62;
     } else {
      break L7;
     }
    }
    HEAP32[$AsyncCtx>>2] = 246;
    $48 = ((($AsyncCtx)) + 4|0);
    HEAP32[$48>>2] = $$0;
    $49 = ((($AsyncCtx)) + 8|0);
    HEAP32[$49>>2] = $16;
    $50 = ((($AsyncCtx)) + 12|0);
    HEAP32[$50>>2] = $32;
    $51 = ((($AsyncCtx)) + 16|0);
    HEAP8[$51>>0] = $10;
    $52 = ((($AsyncCtx)) + 20|0);
    HEAP32[$52>>2] = $9;
    $53 = ((($AsyncCtx)) + 24|0);
    HEAP8[$53>>0] = $12;
    $54 = ((($AsyncCtx)) + 28|0);
    HEAP32[$54>>2] = $11;
    $55 = ((($AsyncCtx)) + 32|0);
    HEAP32[$55>>2] = $31;
    $56 = ((($AsyncCtx)) + 36|0);
    HEAP32[$56>>2] = $33;
    $57 = ((($AsyncCtx)) + 40|0);
    HEAP32[$57>>2] = $1;
    $58 = ((($AsyncCtx)) + 44|0);
    HEAP32[$58>>2] = $2;
    $59 = ((($AsyncCtx)) + 48|0);
    HEAP32[$59>>2] = $3;
    $60 = ((($AsyncCtx)) + 52|0);
    HEAP32[$60>>2] = $4;
    $61 = ((($AsyncCtx)) + 56|0);
    $$expand_i1_val7 = $5&1;
    HEAP8[$61>>0] = $$expand_i1_val7;
    sp = STACKTOP;
    return;
   }
  } while(0);
  HEAP8[$9>>0] = $10;
  HEAP8[$11>>0] = $12;
 }
 return;
}
function __ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($0,$1,$2,$3,$4) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 $4 = $4|0;
 var $$0 = 0, $$081$off0 = 0, $$081$off0$expand_i1_val = 0, $$084 = 0, $$085$off0 = 0, $$085$off0$expand_i1_val = 0, $$1 = 0, $$182$off0 = 0, $$186$off0 = 0, $$2 = 0, $$283$off0 = 0, $$expand_i1_val = 0, $$expand_i1_val24 = 0, $$expand_i1_val26 = 0, $$expand_i1_val28 = 0, $$expand_i1_val30 = 0, $10 = 0, $100 = 0, $101 = 0, $102 = 0;
 var $103 = 0, $104 = 0, $105 = 0, $106 = 0, $107 = 0, $108 = 0, $109 = 0, $11 = 0, $110 = 0, $111 = 0, $112 = 0, $113 = 0, $114 = 0, $115 = 0, $116 = 0, $117 = 0, $118 = 0, $119 = 0, $12 = 0, $120 = 0;
 var $121 = 0, $122 = 0, $123 = 0, $124 = 0, $125 = 0, $126 = 0, $127 = 0, $128 = 0, $129 = 0, $13 = 0, $130 = 0, $131 = 0, $132 = 0, $133 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0;
 var $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0;
 var $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0;
 var $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0, $67 = 0, $68 = 0, $69 = 0, $7 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0;
 var $77 = 0, $78 = 0, $79 = 0, $8 = 0, $80 = 0, $81 = 0, $82 = 0, $83 = 0, $84 = 0, $85 = 0, $86 = 0, $87 = 0, $88 = 0, $89 = 0, $9 = 0, $90 = 0, $91 = 0, $92 = 0, $93 = 0, $94 = 0;
 var $95 = 0, $96 = 0, $97 = 0, $98 = 0, $99 = 0, $AsyncCtx = 0, $AsyncCtx11 = 0, $AsyncCtx15 = 0, $AsyncCtx3 = 0, $AsyncCtx7 = 0, $IsAsync = 0, $IsAsync12 = 0, $IsAsync16 = 0, $IsAsync4 = 0, $IsAsync8 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $5 = ((($1)) + 8|0);
 $6 = HEAP32[$5>>2]|0;
 $7 = (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0,$6,$4)|0);
 L1: do {
  if ($7) {
   __ZNK10__cxxabiv117__class_type_info29process_static_type_below_dstEPNS_19__dynamic_cast_infoEPKvi(0,$1,$2,$3);
  } else {
   $8 = HEAP32[$1>>2]|0;
   $9 = (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0,$8,$4)|0);
   $10 = ((($0)) + 12|0);
   $11 = ((($1)) + 24|0);
   $12 = ((($1)) + 36|0);
   $13 = ((($1)) + 54|0);
   $14 = ((($0)) + 8|0);
   $15 = ((($0)) + 16|0);
   if (!($9)) {
    $70 = HEAP32[$10>>2]|0;
    $71 = (((($0)) + 16|0) + ($70<<3)|0);
    $AsyncCtx11 = _emscripten_alloc_async_context(48,sp)|0;
    __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($15,$1,$2,$3,$4);
    $IsAsync12 = ___async;
    if ($IsAsync12) {
     HEAP32[$AsyncCtx11>>2] = 248;
     $72 = ((($AsyncCtx11)) + 4|0);
     HEAP32[$72>>2] = $1;
     $73 = ((($AsyncCtx11)) + 8|0);
     HEAP32[$73>>2] = $2;
     $74 = ((($AsyncCtx11)) + 12|0);
     HEAP32[$74>>2] = $3;
     $75 = ((($AsyncCtx11)) + 16|0);
     $$expand_i1_val24 = $4&1;
     HEAP8[$75>>0] = $$expand_i1_val24;
     $76 = ((($AsyncCtx11)) + 20|0);
     HEAP32[$76>>2] = $13;
     $77 = ((($AsyncCtx11)) + 24|0);
     HEAP32[$77>>2] = $12;
     $78 = ((($AsyncCtx11)) + 28|0);
     HEAP32[$78>>2] = $71;
     $79 = ((($AsyncCtx11)) + 32|0);
     HEAP32[$79>>2] = $0;
     $80 = ((($AsyncCtx11)) + 36|0);
     HEAP32[$80>>2] = $70;
     $81 = ((($AsyncCtx11)) + 40|0);
     HEAP32[$81>>2] = $14;
     $82 = ((($AsyncCtx11)) + 44|0);
     HEAP32[$82>>2] = $11;
     sp = STACKTOP;
     return;
    }
    _emscripten_free_async_context(($AsyncCtx11|0));
    $83 = ((($0)) + 24|0);
    $84 = ($70|0)>(1);
    if (!($84)) {
     break;
    }
    $85 = HEAP32[$14>>2]|0;
    $86 = $85 & 2;
    $87 = ($86|0)==(0);
    if ($87) {
     $88 = HEAP32[$12>>2]|0;
     $89 = ($88|0)==(1);
     if ($89) {
      $$0 = $83;
     } else {
      $101 = $85 & 1;
      $102 = ($101|0)==(0);
      if ($102) {
       $$2 = $83;
       while(1) {
        $120 = HEAP8[$13>>0]|0;
        $121 = ($120<<24>>24)==(0);
        if (!($121)) {
         break L1;
        }
        $122 = HEAP32[$12>>2]|0;
        $123 = ($122|0)==(1);
        if ($123) {
         break L1;
        }
        $AsyncCtx = _emscripten_alloc_async_context(36,sp)|0;
        __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($$2,$1,$2,$3,$4);
        $IsAsync = ___async;
        if ($IsAsync) {
         break;
        }
        _emscripten_free_async_context(($AsyncCtx|0));
        $132 = ((($$2)) + 8|0);
        $133 = ($132>>>0)<($71>>>0);
        if ($133) {
         $$2 = $132;
        } else {
         break L1;
        }
       }
       HEAP32[$AsyncCtx>>2] = 251;
       $124 = ((($AsyncCtx)) + 4|0);
       HEAP32[$124>>2] = $$2;
       $125 = ((($AsyncCtx)) + 8|0);
       HEAP32[$125>>2] = $71;
       $126 = ((($AsyncCtx)) + 12|0);
       HEAP32[$126>>2] = $13;
       $127 = ((($AsyncCtx)) + 16|0);
       HEAP32[$127>>2] = $12;
       $128 = ((($AsyncCtx)) + 20|0);
       HEAP32[$128>>2] = $1;
       $129 = ((($AsyncCtx)) + 24|0);
       HEAP32[$129>>2] = $2;
       $130 = ((($AsyncCtx)) + 28|0);
       HEAP32[$130>>2] = $3;
       $131 = ((($AsyncCtx)) + 32|0);
       $$expand_i1_val30 = $4&1;
       HEAP8[$131>>0] = $$expand_i1_val30;
       sp = STACKTOP;
       return;
      } else {
       $$1 = $83;
      }
      while(1) {
       $103 = HEAP8[$13>>0]|0;
       $104 = ($103<<24>>24)==(0);
       if (!($104)) {
        break L1;
       }
       $105 = HEAP32[$12>>2]|0;
       $106 = ($105|0)==(1);
       if ($106) {
        $107 = HEAP32[$11>>2]|0;
        $108 = ($107|0)==(1);
        if ($108) {
         break L1;
        }
       }
       $AsyncCtx3 = _emscripten_alloc_async_context(40,sp)|0;
       __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($$1,$1,$2,$3,$4);
       $IsAsync4 = ___async;
       if ($IsAsync4) {
        break;
       }
       _emscripten_free_async_context(($AsyncCtx3|0));
       $118 = ((($$1)) + 8|0);
       $119 = ($118>>>0)<($71>>>0);
       if ($119) {
        $$1 = $118;
       } else {
        break L1;
       }
      }
      HEAP32[$AsyncCtx3>>2] = 250;
      $109 = ((($AsyncCtx3)) + 4|0);
      HEAP32[$109>>2] = $$1;
      $110 = ((($AsyncCtx3)) + 8|0);
      HEAP32[$110>>2] = $71;
      $111 = ((($AsyncCtx3)) + 12|0);
      HEAP32[$111>>2] = $13;
      $112 = ((($AsyncCtx3)) + 16|0);
      HEAP32[$112>>2] = $12;
      $113 = ((($AsyncCtx3)) + 20|0);
      HEAP32[$113>>2] = $11;
      $114 = ((($AsyncCtx3)) + 24|0);
      HEAP32[$114>>2] = $1;
      $115 = ((($AsyncCtx3)) + 28|0);
      HEAP32[$115>>2] = $2;
      $116 = ((($AsyncCtx3)) + 32|0);
      HEAP32[$116>>2] = $3;
      $117 = ((($AsyncCtx3)) + 36|0);
      $$expand_i1_val28 = $4&1;
      HEAP8[$117>>0] = $$expand_i1_val28;
      sp = STACKTOP;
      return;
     }
    } else {
     $$0 = $83;
    }
    while(1) {
     $90 = HEAP8[$13>>0]|0;
     $91 = ($90<<24>>24)==(0);
     if (!($91)) {
      break L1;
     }
     $AsyncCtx7 = _emscripten_alloc_async_context(32,sp)|0;
     __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($$0,$1,$2,$3,$4);
     $IsAsync8 = ___async;
     if ($IsAsync8) {
      break;
     }
     _emscripten_free_async_context(($AsyncCtx7|0));
     $99 = ((($$0)) + 8|0);
     $100 = ($99>>>0)<($71>>>0);
     if ($100) {
      $$0 = $99;
     } else {
      break L1;
     }
    }
    HEAP32[$AsyncCtx7>>2] = 249;
    $92 = ((($AsyncCtx7)) + 4|0);
    HEAP32[$92>>2] = $$0;
    $93 = ((($AsyncCtx7)) + 8|0);
    HEAP32[$93>>2] = $71;
    $94 = ((($AsyncCtx7)) + 12|0);
    HEAP32[$94>>2] = $13;
    $95 = ((($AsyncCtx7)) + 16|0);
    HEAP32[$95>>2] = $1;
    $96 = ((($AsyncCtx7)) + 20|0);
    HEAP32[$96>>2] = $2;
    $97 = ((($AsyncCtx7)) + 24|0);
    HEAP32[$97>>2] = $3;
    $98 = ((($AsyncCtx7)) + 28|0);
    $$expand_i1_val26 = $4&1;
    HEAP8[$98>>0] = $$expand_i1_val26;
    sp = STACKTOP;
    return;
   }
   $16 = ((($1)) + 16|0);
   $17 = HEAP32[$16>>2]|0;
   $18 = ($17|0)==($2|0);
   $19 = ((($1)) + 32|0);
   if (!($18)) {
    $20 = ((($1)) + 20|0);
    $21 = HEAP32[$20>>2]|0;
    $22 = ($21|0)==($2|0);
    if (!($22)) {
     HEAP32[$19>>2] = $3;
     $24 = ((($1)) + 44|0);
     $25 = HEAP32[$24>>2]|0;
     $26 = ($25|0)==(4);
     if ($26) {
      break;
     }
     $27 = HEAP32[$10>>2]|0;
     $28 = (((($0)) + 16|0) + ($27<<3)|0);
     $29 = ((($1)) + 52|0);
     $30 = ((($1)) + 53|0);
     $$081$off0 = 0;$$084 = $15;$$085$off0 = 0;
     L38: while(1) {
      $31 = ($$084>>>0)<($28>>>0);
      if (!($31)) {
       $$283$off0 = $$081$off0;
       label = 20;
       break;
      }
      HEAP8[$29>>0] = 0;
      HEAP8[$30>>0] = 0;
      $AsyncCtx15 = _emscripten_alloc_async_context(60,sp)|0;
      __ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($$084,$1,$2,$2,1,$4);
      $IsAsync16 = ___async;
      if ($IsAsync16) {
       label = 12;
       break;
      }
      _emscripten_free_async_context(($AsyncCtx15|0));
      $47 = HEAP8[$13>>0]|0;
      $48 = ($47<<24>>24)==(0);
      if (!($48)) {
       $$283$off0 = $$081$off0;
       label = 20;
       break;
      }
      $49 = HEAP8[$30>>0]|0;
      $50 = ($49<<24>>24)==(0);
      do {
       if ($50) {
        $$182$off0 = $$081$off0;$$186$off0 = $$085$off0;
       } else {
        $51 = HEAP8[$29>>0]|0;
        $52 = ($51<<24>>24)==(0);
        if ($52) {
         $58 = HEAP32[$14>>2]|0;
         $59 = $58 & 1;
         $60 = ($59|0)==(0);
         if ($60) {
          $$283$off0 = 1;
          label = 20;
          break L38;
         } else {
          $$182$off0 = 1;$$186$off0 = $$085$off0;
          break;
         }
        }
        $53 = HEAP32[$11>>2]|0;
        $54 = ($53|0)==(1);
        if ($54) {
         label = 25;
         break L38;
        }
        $55 = HEAP32[$14>>2]|0;
        $56 = $55 & 2;
        $57 = ($56|0)==(0);
        if ($57) {
         label = 25;
         break L38;
        } else {
         $$182$off0 = 1;$$186$off0 = 1;
        }
       }
      } while(0);
      $61 = ((($$084)) + 8|0);
      $$081$off0 = $$182$off0;$$084 = $61;$$085$off0 = $$186$off0;
     }
     if ((label|0) == 12) {
      HEAP32[$AsyncCtx15>>2] = 247;
      $32 = ((($AsyncCtx15)) + 4|0);
      HEAP32[$32>>2] = $29;
      $33 = ((($AsyncCtx15)) + 8|0);
      HEAP32[$33>>2] = $30;
      $34 = ((($AsyncCtx15)) + 12|0);
      HEAP32[$34>>2] = $1;
      $35 = ((($AsyncCtx15)) + 16|0);
      HEAP32[$35>>2] = $2;
      $36 = ((($AsyncCtx15)) + 20|0);
      $$expand_i1_val = $4&1;
      HEAP8[$36>>0] = $$expand_i1_val;
      $37 = ((($AsyncCtx15)) + 24|0);
      HEAP32[$37>>2] = $13;
      $38 = ((($AsyncCtx15)) + 28|0);
      HEAP32[$38>>2] = $28;
      $39 = ((($AsyncCtx15)) + 32|0);
      HEAP32[$39>>2] = $24;
      $40 = ((($AsyncCtx15)) + 36|0);
      HEAP32[$40>>2] = $11;
      $41 = ((($AsyncCtx15)) + 40|0);
      HEAP32[$41>>2] = $20;
      $42 = ((($AsyncCtx15)) + 44|0);
      HEAP32[$42>>2] = $12;
      $43 = ((($AsyncCtx15)) + 48|0);
      $$081$off0$expand_i1_val = $$081$off0&1;
      HEAP8[$43>>0] = $$081$off0$expand_i1_val;
      $44 = ((($AsyncCtx15)) + 49|0);
      $$085$off0$expand_i1_val = $$085$off0&1;
      HEAP8[$44>>0] = $$085$off0$expand_i1_val;
      $45 = ((($AsyncCtx15)) + 52|0);
      HEAP32[$45>>2] = $$084;
      $46 = ((($AsyncCtx15)) + 56|0);
      HEAP32[$46>>2] = $14;
      sp = STACKTOP;
      return;
     }
     do {
      if ((label|0) == 20) {
       if (!($$085$off0)) {
        HEAP32[$20>>2] = $2;
        $62 = ((($1)) + 40|0);
        $63 = HEAP32[$62>>2]|0;
        $64 = (($63) + 1)|0;
        HEAP32[$62>>2] = $64;
        $65 = HEAP32[$12>>2]|0;
        $66 = ($65|0)==(1);
        if ($66) {
         $67 = HEAP32[$11>>2]|0;
         $68 = ($67|0)==(2);
         if ($68) {
          HEAP8[$13>>0] = 1;
          if ($$283$off0) {
           label = 25;
           break;
          } else {
           $69 = 4;
           break;
          }
         }
        }
       }
       if ($$283$off0) {
        label = 25;
       } else {
        $69 = 4;
       }
      }
     } while(0);
     if ((label|0) == 25) {
      $69 = 3;
     }
     HEAP32[$24>>2] = $69;
     break;
    }
   }
   $23 = ($3|0)==(1);
   if ($23) {
    HEAP32[$19>>2] = 1;
   }
  }
 } while(0);
 return;
}
function __ZNK10__cxxabiv121__vmi_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($0,$1,$2,$3) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 var $$0 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0;
 var $29 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, $IsAsync = 0, $IsAsync4 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $4 = ((($1)) + 8|0);
 $5 = HEAP32[$4>>2]|0;
 $6 = (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0,$5,0)|0);
 L1: do {
  if ($6) {
   __ZNK10__cxxabiv117__class_type_info24process_found_base_classEPNS_19__dynamic_cast_infoEPvi(0,$1,$2,$3);
  } else {
   $7 = ((($0)) + 16|0);
   $8 = ((($0)) + 12|0);
   $9 = HEAP32[$8>>2]|0;
   $10 = (((($0)) + 16|0) + ($9<<3)|0);
   $AsyncCtx3 = _emscripten_alloc_async_context(28,sp)|0;
   __ZNK10__cxxabiv122__base_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($7,$1,$2,$3);
   $IsAsync4 = ___async;
   if ($IsAsync4) {
    HEAP32[$AsyncCtx3>>2] = 252;
    $11 = ((($AsyncCtx3)) + 4|0);
    HEAP32[$11>>2] = $9;
    $12 = ((($AsyncCtx3)) + 8|0);
    HEAP32[$12>>2] = $0;
    $13 = ((($AsyncCtx3)) + 12|0);
    HEAP32[$13>>2] = $1;
    $14 = ((($AsyncCtx3)) + 16|0);
    HEAP32[$14>>2] = $2;
    $15 = ((($AsyncCtx3)) + 20|0);
    HEAP32[$15>>2] = $3;
    $16 = ((($AsyncCtx3)) + 24|0);
    HEAP32[$16>>2] = $10;
    sp = STACKTOP;
    return;
   }
   _emscripten_free_async_context(($AsyncCtx3|0));
   $17 = ($9|0)>(1);
   if ($17) {
    $18 = ((($0)) + 24|0);
    $19 = ((($1)) + 54|0);
    $$0 = $18;
    while(1) {
     $AsyncCtx = _emscripten_alloc_async_context(28,sp)|0;
     __ZNK10__cxxabiv122__base_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($$0,$1,$2,$3);
     $IsAsync = ___async;
     if ($IsAsync) {
      break;
     }
     _emscripten_free_async_context(($AsyncCtx|0));
     $26 = HEAP8[$19>>0]|0;
     $27 = ($26<<24>>24)==(0);
     if (!($27)) {
      break L1;
     }
     $28 = ((($$0)) + 8|0);
     $29 = ($28>>>0)<($10>>>0);
     if ($29) {
      $$0 = $28;
     } else {
      break L1;
     }
    }
    HEAP32[$AsyncCtx>>2] = 253;
    $20 = ((($AsyncCtx)) + 4|0);
    HEAP32[$20>>2] = $19;
    $21 = ((($AsyncCtx)) + 8|0);
    HEAP32[$21>>2] = $$0;
    $22 = ((($AsyncCtx)) + 12|0);
    HEAP32[$22>>2] = $10;
    $23 = ((($AsyncCtx)) + 16|0);
    HEAP32[$23>>2] = $1;
    $24 = ((($AsyncCtx)) + 20|0);
    HEAP32[$24>>2] = $2;
    $25 = ((($AsyncCtx)) + 24|0);
    HEAP32[$25>>2] = $3;
    sp = STACKTOP;
    return;
   }
  }
 } while(0);
 return;
}
function __ZNK10__cxxabiv122__base_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($0,$1,$2,$3) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 var $$0 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $AsyncCtx = 0, $IsAsync = 0, label = 0;
 var sp = 0;
 sp = STACKTOP;
 $4 = ((($0)) + 4|0);
 $5 = HEAP32[$4>>2]|0;
 $6 = $5 >> 8;
 $7 = $5 & 1;
 $8 = ($7|0)==(0);
 if ($8) {
  $$0 = $6;
 } else {
  $9 = HEAP32[$2>>2]|0;
  $10 = (($9) + ($6)|0);
  $11 = HEAP32[$10>>2]|0;
  $$0 = $11;
 }
 $12 = HEAP32[$0>>2]|0;
 $13 = HEAP32[$12>>2]|0;
 $14 = ((($13)) + 28|0);
 $15 = HEAP32[$14>>2]|0;
 $16 = (($2) + ($$0)|0);
 $17 = $5 & 2;
 $18 = ($17|0)!=(0);
 $19 = $18 ? $3 : 2;
 $AsyncCtx = _emscripten_alloc_async_context(4,sp)|0;
 FUNCTION_TABLE_viiii[$15 & 127]($12,$1,$16,$19);
 $IsAsync = ___async;
 if ($IsAsync) {
  HEAP32[$AsyncCtx>>2] = 254;
  sp = STACKTOP;
  return;
 } else {
  _emscripten_free_async_context(($AsyncCtx|0));
  return;
 }
}
function __ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($0,$1,$2,$3,$4,$5) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 $4 = $4|0;
 $5 = $5|0;
 var $$0 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $AsyncCtx = 0, $IsAsync = 0, label = 0;
 var sp = 0;
 sp = STACKTOP;
 $6 = ((($0)) + 4|0);
 $7 = HEAP32[$6>>2]|0;
 $8 = $7 >> 8;
 $9 = $7 & 1;
 $10 = ($9|0)==(0);
 if ($10) {
  $$0 = $8;
 } else {
  $11 = HEAP32[$3>>2]|0;
  $12 = (($11) + ($8)|0);
  $13 = HEAP32[$12>>2]|0;
  $$0 = $13;
 }
 $14 = HEAP32[$0>>2]|0;
 $15 = HEAP32[$14>>2]|0;
 $16 = ((($15)) + 20|0);
 $17 = HEAP32[$16>>2]|0;
 $18 = (($3) + ($$0)|0);
 $19 = $7 & 2;
 $20 = ($19|0)!=(0);
 $21 = $20 ? $4 : 2;
 $AsyncCtx = _emscripten_alloc_async_context(4,sp)|0;
 FUNCTION_TABLE_viiiiii[$17 & 127]($14,$1,$2,$18,$21,$5);
 $IsAsync = ___async;
 if ($IsAsync) {
  HEAP32[$AsyncCtx>>2] = 255;
  sp = STACKTOP;
  return;
 } else {
  _emscripten_free_async_context(($AsyncCtx|0));
  return;
 }
}
function __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($0,$1,$2,$3,$4) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 $4 = $4|0;
 var $$0 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $AsyncCtx = 0, $IsAsync = 0, label = 0;
 var sp = 0;
 sp = STACKTOP;
 $5 = ((($0)) + 4|0);
 $6 = HEAP32[$5>>2]|0;
 $7 = $6 >> 8;
 $8 = $6 & 1;
 $9 = ($8|0)==(0);
 if ($9) {
  $$0 = $7;
 } else {
  $10 = HEAP32[$2>>2]|0;
  $11 = (($10) + ($7)|0);
  $12 = HEAP32[$11>>2]|0;
  $$0 = $12;
 }
 $13 = HEAP32[$0>>2]|0;
 $14 = HEAP32[$13>>2]|0;
 $15 = ((($14)) + 24|0);
 $16 = HEAP32[$15>>2]|0;
 $17 = (($2) + ($$0)|0);
 $18 = $6 & 2;
 $19 = ($18|0)!=(0);
 $20 = $19 ? $3 : 2;
 $AsyncCtx = _emscripten_alloc_async_context(4,sp)|0;
 FUNCTION_TABLE_viiiii[$16 & 127]($13,$1,$17,$20,$4);
 $IsAsync = ___async;
 if ($IsAsync) {
  HEAP32[$AsyncCtx>>2] = 256;
  sp = STACKTOP;
  return;
 } else {
  _emscripten_free_async_context(($AsyncCtx|0));
  return;
 }
}
function __ZNSt9bad_allocC2Ev($0) {
 $0 = $0|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 HEAP32[$0>>2] = (1840);
 return;
}
function __ZSt15get_new_handlerv() {
 var $0 = 0, $1 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = HEAP32[3440]|0;HEAP32[3440] = (($0+0)|0);
 $1 = $0;
 return ($1|0);
}
function ___cxa_can_catch($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $AsyncCtx = 0, $IsAsync = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $3 = sp;
 $4 = HEAP32[$2>>2]|0;
 HEAP32[$3>>2] = $4;
 $5 = HEAP32[$0>>2]|0;
 $6 = ((($5)) + 16|0);
 $7 = HEAP32[$6>>2]|0;
 $AsyncCtx = _emscripten_alloc_async_context(16,sp)|0;
 $8 = (FUNCTION_TABLE_iiii[$7 & 255]($0,$1,$3)|0);
 $IsAsync = ___async;
 if ($IsAsync) {
  HEAP32[$AsyncCtx>>2] = 257;
  $9 = ((($AsyncCtx)) + 4|0);
  HEAP32[$9>>2] = $3;
  $10 = ((($AsyncCtx)) + 8|0);
  HEAP32[$10>>2] = $2;
  $11 = ((($AsyncCtx)) + 12|0);
  HEAP32[$11>>2] = $3;
  sp = STACKTOP;
  STACKTOP = sp;return 0;
 }
 _emscripten_free_async_context(($AsyncCtx|0));
 $12 = $8&1;
 if ($8) {
  $13 = HEAP32[$3>>2]|0;
  HEAP32[$2>>2] = $13;
 }
 STACKTOP = sp;return ($12|0);
}
function ___cxa_is_pointer_type($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, $AsyncCtx = 0, $IsAsync = 0, $phitmp = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = ($0|0)==(0|0);
 do {
  if ($1) {
   $4 = 0;
  } else {
   $AsyncCtx = _emscripten_alloc_async_context(4,sp)|0;
   $2 = (___dynamic_cast($0,264,336,0)|0);
   $IsAsync = ___async;
   if ($IsAsync) {
    HEAP32[$AsyncCtx>>2] = 258;
    sp = STACKTOP;
    return 0;
   } else {
    _emscripten_free_async_context(($AsyncCtx|0));
    $phitmp = ($2|0)!=(0|0);
    $4 = $phitmp;
    break;
   }
  }
 } while(0);
 $3 = $4&1;
 return ($3|0);
}
function __ZN11TextDisplayD0Ev__async_cb($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = ((($0)) + 4|0);
 $2 = HEAP32[$1>>2]|0;
 $3 = __THREW__; __THREW__ = 0;
 $4 = $3&1;
 if ($4) {
  $5 = ___cxa_find_matching_catch_2()|0;
  $6 = tempRet0;
  __ZdlPv($2);
  ___resumeException($5|0);
  // unreachable;
 } else {
  __ZdlPv($2);
  return;
 }
}
function ___dynamic_cast__async_cb($0) {
 $0 = $0|0;
 var $$ = 0, $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = ((($0)) + 4|0);
 $2 = HEAP32[$1>>2]|0;
 $3 = ((($0)) + 8|0);
 $4 = HEAP32[$3>>2]|0;
 $5 = ((($0)) + 12|0);
 $6 = HEAP32[$5>>2]|0;
 $7 = HEAP32[$2>>2]|0;
 $8 = ($7|0)==(1);
 $$ = $8 ? $4 : 0;
 $9 = ___async_retval;
 HEAP32[$9>>2] = $$;
 return;
}
function ___dynamic_cast__async_cb_1($0) {
 $0 = $0|0;
 var $$0 = 0, $$33 = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0;
 var $26 = 0, $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $or$cond = 0, $or$cond28 = 0, $or$cond30 = 0, $or$cond32 = 0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 $1 = ((($0)) + 4|0);
 $2 = HEAP32[$1>>2]|0;
 $3 = ((($0)) + 8|0);
 $4 = HEAP32[$3>>2]|0;
 $5 = ((($0)) + 12|0);
 $6 = HEAP32[$5>>2]|0;
 $7 = ((($0)) + 16|0);
 $8 = HEAP32[$7>>2]|0;
 $9 = ((($0)) + 20|0);
 $10 = HEAP32[$9>>2]|0;
 $11 = ((($0)) + 24|0);
 $12 = HEAP32[$11>>2]|0;
 $13 = ((($0)) + 28|0);
 $14 = HEAP32[$13>>2]|0;
 $15 = ((($0)) + 32|0);
 $16 = HEAP32[$15>>2]|0;
 $17 = HEAP32[$2>>2]|0;
 L2: do {
  switch ($17|0) {
  case 0:  {
   $18 = HEAP32[$6>>2]|0;
   $19 = ($18|0)==(1);
   $20 = HEAP32[$8>>2]|0;
   $21 = ($20|0)==(1);
   $or$cond = $19 & $21;
   $22 = HEAP32[$10>>2]|0;
   $23 = ($22|0)==(1);
   $or$cond28 = $or$cond & $23;
   $24 = HEAP32[$12>>2]|0;
   $$33 = $or$cond28 ? $24 : 0;
   $$0 = $$33;
   break;
  }
  case 1:  {
   $25 = HEAP32[$14>>2]|0;
   $26 = ($25|0)==(1);
   if (!($26)) {
    $27 = HEAP32[$6>>2]|0;
    $28 = ($27|0)==(0);
    $29 = HEAP32[$8>>2]|0;
    $30 = ($29|0)==(1);
    $or$cond30 = $28 & $30;
    $31 = HEAP32[$10>>2]|0;
    $32 = ($31|0)==(1);
    $or$cond32 = $or$cond30 & $32;
    if (!($or$cond32)) {
     $$0 = 0;
     break L2;
    }
   }
   $33 = HEAP32[$16>>2]|0;
   $$0 = $33;
   break;
  }
  default: {
   $$0 = 0;
  }
  }
 } while(0);
 $34 = ___async_retval;
 HEAP32[$34>>2] = $$0;
 return;
}
function __ZN4mbed6Stream4readEPvj__async_cb($0) {
 $0 = $0|0;
 var $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0;
 var $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $IsAsync3 = 0, $IsAsync6 = 0, $ReallocAsyncCtx2 = 0, $ReallocAsyncCtx3 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = ((($0)) + 4|0);
 $2 = HEAP32[$1>>2]|0;
 $3 = ((($0)) + 8|0);
 $4 = HEAP32[$3>>2]|0;
 $5 = ((($0)) + 12|0);
 $6 = HEAP32[$5>>2]|0;
 $7 = ((($0)) + 16|0);
 $8 = HEAP32[$7>>2]|0;
 $9 = ((($0)) + 20|0);
 $10 = HEAP32[$9>>2]|0;
 $11 = ($4|0)==(0);
 if (!($11)) {
  $12 = HEAP32[$2>>2]|0;
  $13 = ((($12)) + 72|0);
  $14 = HEAP32[$13>>2]|0;
  $ReallocAsyncCtx2 = (_emscripten_realloc_async_context(28)|0);
  $15 = (FUNCTION_TABLE_ii[$14 & 511]($2)|0);
  $IsAsync3 = ___async;
  if (!($IsAsync3)) {
   $22 = ___async_retval;
   HEAP32[$22>>2] = $15;
   ___async_unwind = 0;
  }
  HEAP32[$ReallocAsyncCtx2>>2] = 174;
  $16 = ((($ReallocAsyncCtx2)) + 4|0);
  HEAP32[$16>>2] = $6;
  $17 = ((($ReallocAsyncCtx2)) + 8|0);
  HEAP32[$17>>2] = $6;
  $18 = ((($ReallocAsyncCtx2)) + 12|0);
  HEAP32[$18>>2] = $8;
  $19 = ((($ReallocAsyncCtx2)) + 16|0);
  HEAP32[$19>>2] = $10;
  $20 = ((($ReallocAsyncCtx2)) + 20|0);
  HEAP32[$20>>2] = $2;
  $21 = ((($ReallocAsyncCtx2)) + 24|0);
  HEAP32[$21>>2] = $2;
  sp = STACKTOP;
  return;
 }
 $23 = HEAP32[$10>>2]|0;
 $24 = ((($23)) + 84|0);
 $25 = HEAP32[$24>>2]|0;
 $ReallocAsyncCtx3 = (_emscripten_realloc_async_context(12)|0);
 FUNCTION_TABLE_vi[$25 & 511]($2);
 $IsAsync6 = ___async;
 if ($IsAsync6) {
  HEAP32[$ReallocAsyncCtx3>>2] = 175;
  $26 = ((($ReallocAsyncCtx3)) + 4|0);
  HEAP32[$26>>2] = $6;
  $27 = ((($ReallocAsyncCtx3)) + 8|0);
  HEAP32[$27>>2] = $6;
  sp = STACKTOP;
  return;
 }
 ___async_unwind = 0;
 HEAP32[$ReallocAsyncCtx3>>2] = 175;
 $26 = ((($ReallocAsyncCtx3)) + 4|0);
 HEAP32[$26>>2] = $6;
 $27 = ((($ReallocAsyncCtx3)) + 8|0);
 HEAP32[$27>>2] = $6;
 sp = STACKTOP;
 return;
}
function __ZN4mbed6Stream4readEPvj__async_cb_2($0) {
 $0 = $0|0;
 var $$016$lcssa = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0;
 var $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $AsyncRetVal = 0, $IsAsync3 = 0, $IsAsync6 = 0, $ReallocAsyncCtx2 = 0, $ReallocAsyncCtx3 = 0, label = 0;
 var sp = 0;
 sp = STACKTOP;
 $1 = ((($0)) + 4|0);
 $2 = HEAP32[$1>>2]|0;
 $3 = ((($0)) + 8|0);
 $4 = HEAP32[$3>>2]|0;
 $5 = ((($0)) + 12|0);
 $6 = HEAP32[$5>>2]|0;
 $7 = ((($0)) + 16|0);
 $8 = HEAP32[$7>>2]|0;
 $9 = ((($0)) + 20|0);
 $10 = HEAP32[$9>>2]|0;
 $11 = ((($0)) + 24|0);
 $12 = HEAP32[$11>>2]|0;
 $13 = ___async_retval;
 $AsyncRetVal = HEAP32[$13>>2]|0;
 $26 = ($AsyncRetVal|0)==(-1);
 if ($26) {
  $$016$lcssa = $4;
 } else {
  $27 = $AsyncRetVal&255;
  $20 = ((($4)) + 1|0);
  HEAP8[$4>>0] = $27;
  $28 = ($20|0)==($6|0);
  if ($28) {
   $$016$lcssa = $6;
  } else {
   $14 = HEAP32[$12>>2]|0;
   $15 = ((($14)) + 72|0);
   $16 = HEAP32[$15>>2]|0;
   $ReallocAsyncCtx2 = (_emscripten_realloc_async_context(28)|0);
   $17 = (FUNCTION_TABLE_ii[$16 & 511]($10)|0);
   $IsAsync3 = ___async;
   if (!($IsAsync3)) {
    $25 = ___async_retval;
    HEAP32[$25>>2] = $17;
    ___async_unwind = 0;
   }
   HEAP32[$ReallocAsyncCtx2>>2] = 174;
   $18 = ((($ReallocAsyncCtx2)) + 4|0);
   HEAP32[$18>>2] = $2;
   $19 = ((($ReallocAsyncCtx2)) + 8|0);
   HEAP32[$19>>2] = $20;
   $21 = ((($ReallocAsyncCtx2)) + 12|0);
   HEAP32[$21>>2] = $6;
   $22 = ((($ReallocAsyncCtx2)) + 16|0);
   HEAP32[$22>>2] = $8;
   $23 = ((($ReallocAsyncCtx2)) + 20|0);
   HEAP32[$23>>2] = $10;
   $24 = ((($ReallocAsyncCtx2)) + 24|0);
   HEAP32[$24>>2] = $12;
   sp = STACKTOP;
   return;
  }
 }
 $29 = HEAP32[$8>>2]|0;
 $30 = ((($29)) + 84|0);
 $31 = HEAP32[$30>>2]|0;
 $ReallocAsyncCtx3 = (_emscripten_realloc_async_context(12)|0);
 FUNCTION_TABLE_vi[$31 & 511]($10);
 $IsAsync6 = ___async;
 if ($IsAsync6) {
  HEAP32[$ReallocAsyncCtx3>>2] = 175;
  $32 = ((($ReallocAsyncCtx3)) + 4|0);
  HEAP32[$32>>2] = $$016$lcssa;
  $33 = ((($ReallocAsyncCtx3)) + 8|0);
  HEAP32[$33>>2] = $2;
  sp = STACKTOP;
  return;
 }
 ___async_unwind = 0;
 HEAP32[$ReallocAsyncCtx3>>2] = 175;
 $32 = ((($ReallocAsyncCtx3)) + 4|0);
 HEAP32[$32>>2] = $$016$lcssa;
 $33 = ((($ReallocAsyncCtx3)) + 8|0);
 HEAP32[$33>>2] = $2;
 sp = STACKTOP;
 return;
}
function __ZN4mbed6Stream4readEPvj__async_cb_3($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = ((($0)) + 4|0);
 $2 = HEAP32[$1>>2]|0;
 $3 = ((($0)) + 8|0);
 $4 = HEAP32[$3>>2]|0;
 $5 = $2;
 $6 = $4;
 $7 = (($5) - ($6))|0;
 $8 = ___async_retval;
 HEAP32[$8>>2] = $7;
 return;
}
function __ZN4mbed6StreamC2EPKc__async_cb($0) {
 $0 = $0|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 // unreachable;
}
function __ZN4mbed6StreamC2EPKc__async_cb_4($0) {
 $0 = $0|0;
 var $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $3 = 0;
 var $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $AsyncRetVal = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = ((($0)) + 4|0);
 $2 = HEAP32[$1>>2]|0;
 $3 = ((($0)) + 8|0);
 $4 = HEAP32[$3>>2]|0;
 $5 = ((($0)) + 12|0);
 $6 = HEAP32[$5>>2]|0;
 $7 = ((($0)) + 16|0);
 $8 = HEAP32[$7>>2]|0;
 $9 = ___async_retval;
 $AsyncRetVal = HEAP32[$9>>2]|0;
 $10 = __THREW__; __THREW__ = 0;
 $11 = $10&1;
 do {
  if (!($11)) {
   HEAP32[$4>>2] = $AsyncRetVal;
   $12 = ($AsyncRetVal|0)==(0|0);
   if (!($12)) {
    __THREW__ = 0;
    invoke_vi(183,($AsyncRetVal|0));
    $13 = __THREW__; __THREW__ = 0;
    $14 = $13&1;
    if ($14) {
     break;
    }
    return;
   }
   __THREW__ = 0;
   $19 = (invoke_i(184)|0);
   $20 = __THREW__; __THREW__ = 0;
   $21 = $20&1;
   if (!($21)) {
    $22 = HEAP32[$19>>2]|0;
    __THREW__ = 0;
    HEAP32[$6>>2] = $22;
    invoke_vii(185,(5429|0),($6|0));
    $23 = __THREW__; __THREW__ = 0;
    $24 = $23&1;
    if (!($24)) {
     return;
    }
   }
  }
 } while(0);
 $15 = ___cxa_find_matching_catch_2()|0;
 $16 = tempRet0;
 __THREW__ = 0;
 invoke_vi(64,($2|0));
 $17 = __THREW__; __THREW__ = 0;
 $18 = $17&1;
 if ($18) {
  $25 = ___cxa_find_matching_catch_3(0|0)|0;
  $26 = tempRet0;
  (_emscripten_realloc_async_context(4)|0);
  ___clang_call_terminate($25);
  // unreachable;
 } else {
  ___resumeException($15|0);
  // unreachable;
 }
}
function __ZNK10__cxxabiv121__vmi_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb($0) {
 $0 = $0|0;
 var $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0;
 var $8 = 0, $9 = 0, $IsAsync = 0, $ReallocAsyncCtx = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = ((($0)) + 4|0);
 $2 = HEAP32[$1>>2]|0;
 $3 = ((($0)) + 8|0);
 $4 = HEAP32[$3>>2]|0;
 $5 = ((($0)) + 12|0);
 $6 = HEAP32[$5>>2]|0;
 $7 = ((($0)) + 16|0);
 $8 = HEAP32[$7>>2]|0;
 $9 = ((($0)) + 20|0);
 $10 = HEAP32[$9>>2]|0;
 $11 = ((($0)) + 24|0);
 $12 = HEAP32[$11>>2]|0;
 $20 = HEAP8[$2>>0]|0;
 $21 = ($20<<24>>24)==(0);
 if ($21) {
  $13 = ((($4)) + 8|0);
  $22 = ($13>>>0)<($6>>>0);
  if ($22) {
   $ReallocAsyncCtx = (_emscripten_realloc_async_context(28)|0);
   __ZNK10__cxxabiv122__base_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($13,$8,$10,$12);
   $IsAsync = ___async;
   if (!($IsAsync)) {
    ___async_unwind = 0;
   }
   HEAP32[$ReallocAsyncCtx>>2] = 253;
   $14 = ((($ReallocAsyncCtx)) + 4|0);
   HEAP32[$14>>2] = $2;
   $15 = ((($ReallocAsyncCtx)) + 8|0);
   HEAP32[$15>>2] = $13;
   $16 = ((($ReallocAsyncCtx)) + 12|0);
   HEAP32[$16>>2] = $6;
   $17 = ((($ReallocAsyncCtx)) + 16|0);
   HEAP32[$17>>2] = $8;
   $18 = ((($ReallocAsyncCtx)) + 20|0);
   HEAP32[$18>>2] = $10;
   $19 = ((($ReallocAsyncCtx)) + 24|0);
   HEAP32[$19>>2] = $12;
   sp = STACKTOP;
   return;
  }
 }
 return;
}
function __ZNK10__cxxabiv121__vmi_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb_5($0) {
 $0 = $0|0;
 var $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0;
 var $9 = 0, $IsAsync = 0, $ReallocAsyncCtx = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = ((($0)) + 4|0);
 $2 = HEAP32[$1>>2]|0;
 $3 = ((($0)) + 8|0);
 $4 = HEAP32[$3>>2]|0;
 $5 = ((($0)) + 12|0);
 $6 = HEAP32[$5>>2]|0;
 $7 = ((($0)) + 16|0);
 $8 = HEAP32[$7>>2]|0;
 $9 = ((($0)) + 20|0);
 $10 = HEAP32[$9>>2]|0;
 $11 = ((($0)) + 24|0);
 $12 = HEAP32[$11>>2]|0;
 $13 = ($2|0)>(1);
 if (!($13)) {
  return;
 }
 $14 = ((($4)) + 24|0);
 $15 = ((($6)) + 54|0);
 $ReallocAsyncCtx = (_emscripten_realloc_async_context(28)|0);
 __ZNK10__cxxabiv122__base_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($14,$6,$8,$10);
 $IsAsync = ___async;
 if (!($IsAsync)) {
  ___async_unwind = 0;
 }
 HEAP32[$ReallocAsyncCtx>>2] = 253;
 $16 = ((($ReallocAsyncCtx)) + 4|0);
 HEAP32[$16>>2] = $15;
 $17 = ((($ReallocAsyncCtx)) + 8|0);
 HEAP32[$17>>2] = $14;
 $18 = ((($ReallocAsyncCtx)) + 12|0);
 HEAP32[$18>>2] = $12;
 $19 = ((($ReallocAsyncCtx)) + 16|0);
 HEAP32[$19>>2] = $6;
 $20 = ((($ReallocAsyncCtx)) + 20|0);
 HEAP32[$20>>2] = $8;
 $21 = ((($ReallocAsyncCtx)) + 24|0);
 HEAP32[$21>>2] = $10;
 sp = STACKTOP;
 return;
}
function __ZThn4_N4mbed6StreamD0Ev__async_cb($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = ((($0)) + 4|0);
 $2 = HEAP32[$1>>2]|0;
 $3 = ((($0)) + 8|0);
 $4 = HEAP32[$3>>2]|0;
 __THREW__ = 0;
 invoke_vi(64,($2|0));
 $5 = __THREW__; __THREW__ = 0;
 $6 = $5&1;
 if ($6) {
  $7 = ___cxa_find_matching_catch_2()|0;
  $8 = tempRet0;
  __ZdlPv($4);
  ___resumeException($7|0);
  // unreachable;
 } else {
  __ZdlPv($4);
  return;
 }
}
function __ZN4mbed10FileHandle5fsyncEv__async_cb($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $AsyncRetVal = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = ___async_retval;
 $AsyncRetVal = HEAP32[$1>>2]|0;
 $2 = ___async_retval;
 HEAP32[$2>>2] = $AsyncRetVal;
 return;
}
function __ZN4mbed6StreamD0Ev__async_cb($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = ((($0)) + 4|0);
 $2 = HEAP32[$1>>2]|0;
 $3 = ((($2)) + 4|0);
 __THREW__ = 0;
 invoke_vi(64,($3|0));
 $4 = __THREW__; __THREW__ = 0;
 $5 = $4&1;
 if ($5) {
  $6 = ___cxa_find_matching_catch_2()|0;
  $7 = tempRet0;
  __ZdlPv($2);
  ___resumeException($6|0);
  // unreachable;
 } else {
  __ZdlPv($2);
  return;
 }
}
function _invoke_ticker__async_cb($0) {
 $0 = $0|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 return;
}
function __ZN15GraphicsDisplay9characterEiii__async_cb($0) {
 $0 = $0|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 return;
}
function __ZN6C128325_putcEi__async_cb($0) {
 $0 = $0|0;
 var $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $AsyncRetVal = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = ((($0)) + 4|0);
 $2 = HEAP32[$1>>2]|0;
 $3 = ((($0)) + 8|0);
 $4 = HEAP32[$3>>2]|0;
 $5 = ((($0)) + 12|0);
 $6 = HEAP32[$5>>2]|0;
 $7 = ((($0)) + 16|0);
 $8 = HEAP32[$7>>2]|0;
 $9 = ___async_retval;
 $AsyncRetVal = HEAP32[$9>>2]|0;
 $10 = HEAP32[$2>>2]|0;
 $11 = ((($10)) + 2|0);
 $12 = HEAP8[$11>>0]|0;
 $13 = $12&255;
 $14 = (($AsyncRetVal) - ($13))|0;
 $15 = ($4>>>0)<($14>>>0);
 if ($15) {
  $16 = ___async_retval;
  HEAP32[$16>>2] = $6;
  return;
 }
 HEAP32[$8>>2] = 0;
 $16 = ___async_retval;
 HEAP32[$16>>2] = $6;
 return;
}
function __ZN6C128325_putcEi__async_cb_6($0) {
 $0 = $0|0;
 var $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = ((($0)) + 4|0);
 $2 = HEAP32[$1>>2]|0;
 $3 = ((($0)) + 8|0);
 $4 = HEAP32[$3>>2]|0;
 $5 = ((($2)) + 4168|0);
 $6 = HEAP32[$5>>2]|0;
 $7 = ($6|0)==(0);
 if ($7) {
  $16 = ___async_retval;
  HEAP32[$16>>2] = $4;
  return;
 }
 $8 = ((($2)) + 4172|0);
 $9 = HEAP32[$8>>2]|0;
 $10 = ((($2)) + 4176|0);
 $11 = HEAP32[$10>>2]|0;
 $12 = ((($2)) + 4180|0);
 $13 = HEAP32[$12>>2]|0;
 $14 = ((($2)) + 68|0);
 $15 = _emscripten_asm_const_iiiii(0, ($9|0), ($11|0), ($13|0), ($14|0))|0;
 $16 = ___async_retval;
 HEAP32[$16>>2] = $4;
 return;
}
function __ZN4mbed6Stream5writeEPKvj__async_cb($0) {
 $0 = $0|0;
 var $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0;
 var $28 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $IsAsync4 = 0, $IsAsync8 = 0, $ReallocAsyncCtx2 = 0, $ReallocAsyncCtx3 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = ((($0)) + 4|0);
 $2 = HEAP32[$1>>2]|0;
 $3 = ((($0)) + 8|0);
 $4 = HEAP32[$3>>2]|0;
 $5 = ((($0)) + 12|0);
 $6 = HEAP32[$5>>2]|0;
 $7 = ((($0)) + 16|0);
 $8 = HEAP32[$7>>2]|0;
 $9 = ($4|0)==($6|0);
 if (!($9)) {
  $10 = HEAP32[$2>>2]|0;
  $11 = ((($10)) + 68|0);
  $12 = HEAP32[$11>>2]|0;
  $13 = ((($4)) + 1|0);
  $14 = HEAP8[$4>>0]|0;
  $15 = $14 << 24 >> 24;
  $ReallocAsyncCtx2 = (_emscripten_realloc_async_context(28)|0);
  $16 = (FUNCTION_TABLE_iii[$12 & 255]($2,$15)|0);
  $IsAsync4 = ___async;
  if (!($IsAsync4)) {
   $23 = ___async_retval;
   HEAP32[$23>>2] = $16;
   ___async_unwind = 0;
  }
  HEAP32[$ReallocAsyncCtx2>>2] = 177;
  $17 = ((($ReallocAsyncCtx2)) + 4|0);
  HEAP32[$17>>2] = $13;
  $18 = ((($ReallocAsyncCtx2)) + 8|0);
  HEAP32[$18>>2] = $6;
  $19 = ((($ReallocAsyncCtx2)) + 12|0);
  HEAP32[$19>>2] = $8;
  $20 = ((($ReallocAsyncCtx2)) + 16|0);
  HEAP32[$20>>2] = $2;
  $21 = ((($ReallocAsyncCtx2)) + 20|0);
  HEAP32[$21>>2] = $4;
  $22 = ((($ReallocAsyncCtx2)) + 24|0);
  HEAP32[$22>>2] = $2;
  sp = STACKTOP;
  return;
 }
 $24 = HEAP32[$8>>2]|0;
 $25 = ((($24)) + 84|0);
 $26 = HEAP32[$25>>2]|0;
 $ReallocAsyncCtx3 = (_emscripten_realloc_async_context(12)|0);
 FUNCTION_TABLE_vi[$26 & 511]($2);
 $IsAsync8 = ___async;
 if ($IsAsync8) {
  HEAP32[$ReallocAsyncCtx3>>2] = 178;
  $27 = ((($ReallocAsyncCtx3)) + 4|0);
  HEAP32[$27>>2] = $6;
  $28 = ((($ReallocAsyncCtx3)) + 8|0);
  HEAP32[$28>>2] = $4;
  sp = STACKTOP;
  return;
 }
 ___async_unwind = 0;
 HEAP32[$ReallocAsyncCtx3>>2] = 178;
 $27 = ((($ReallocAsyncCtx3)) + 4|0);
 HEAP32[$27>>2] = $6;
 $28 = ((($ReallocAsyncCtx3)) + 8|0);
 HEAP32[$28>>2] = $4;
 sp = STACKTOP;
 return;
}
function __ZN4mbed6Stream5writeEPKvj__async_cb_7($0) {
 $0 = $0|0;
 var $$1 = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0;
 var $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $AsyncRetVal = 0, $IsAsync4 = 0, $IsAsync8 = 0, $ReallocAsyncCtx2 = 0, $ReallocAsyncCtx3 = 0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 $1 = ((($0)) + 4|0);
 $2 = HEAP32[$1>>2]|0;
 $3 = ((($0)) + 8|0);
 $4 = HEAP32[$3>>2]|0;
 $5 = ((($0)) + 12|0);
 $6 = HEAP32[$5>>2]|0;
 $7 = ((($0)) + 16|0);
 $8 = HEAP32[$7>>2]|0;
 $9 = ((($0)) + 20|0);
 $10 = HEAP32[$9>>2]|0;
 $11 = ((($0)) + 24|0);
 $12 = HEAP32[$11>>2]|0;
 $13 = ___async_retval;
 $AsyncRetVal = HEAP32[$13>>2]|0;
 $29 = ($AsyncRetVal|0)==(-1);
 if ($29) {
  $$1 = $2;
 } else {
  $14 = ($2|0)==($4|0);
  if ($14) {
   $$1 = $4;
  } else {
   $15 = HEAP32[$12>>2]|0;
   $16 = ((($15)) + 68|0);
   $17 = HEAP32[$16>>2]|0;
   $18 = ((($2)) + 1|0);
   $19 = HEAP8[$2>>0]|0;
   $20 = $19 << 24 >> 24;
   $ReallocAsyncCtx2 = (_emscripten_realloc_async_context(28)|0);
   $21 = (FUNCTION_TABLE_iii[$17 & 255]($8,$20)|0);
   $IsAsync4 = ___async;
   if (!($IsAsync4)) {
    $28 = ___async_retval;
    HEAP32[$28>>2] = $21;
    ___async_unwind = 0;
   }
   HEAP32[$ReallocAsyncCtx2>>2] = 177;
   $22 = ((($ReallocAsyncCtx2)) + 4|0);
   HEAP32[$22>>2] = $18;
   $23 = ((($ReallocAsyncCtx2)) + 8|0);
   HEAP32[$23>>2] = $4;
   $24 = ((($ReallocAsyncCtx2)) + 12|0);
   HEAP32[$24>>2] = $6;
   $25 = ((($ReallocAsyncCtx2)) + 16|0);
   HEAP32[$25>>2] = $8;
   $26 = ((($ReallocAsyncCtx2)) + 20|0);
   HEAP32[$26>>2] = $10;
   $27 = ((($ReallocAsyncCtx2)) + 24|0);
   HEAP32[$27>>2] = $12;
   sp = STACKTOP;
   return;
  }
 }
 $30 = HEAP32[$6>>2]|0;
 $31 = ((($30)) + 84|0);
 $32 = HEAP32[$31>>2]|0;
 $ReallocAsyncCtx3 = (_emscripten_realloc_async_context(12)|0);
 FUNCTION_TABLE_vi[$32 & 511]($8);
 $IsAsync8 = ___async;
 if ($IsAsync8) {
  HEAP32[$ReallocAsyncCtx3>>2] = 178;
  $33 = ((($ReallocAsyncCtx3)) + 4|0);
  HEAP32[$33>>2] = $$1;
  $34 = ((($ReallocAsyncCtx3)) + 8|0);
  HEAP32[$34>>2] = $10;
  sp = STACKTOP;
  return;
 }
 ___async_unwind = 0;
 HEAP32[$ReallocAsyncCtx3>>2] = 178;
 $33 = ((($ReallocAsyncCtx3)) + 4|0);
 HEAP32[$33>>2] = $$1;
 $34 = ((($ReallocAsyncCtx3)) + 8|0);
 HEAP32[$34>>2] = $10;
 sp = STACKTOP;
 return;
}
function __ZN4mbed6Stream5writeEPKvj__async_cb_8($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = ((($0)) + 4|0);
 $2 = HEAP32[$1>>2]|0;
 $3 = ((($0)) + 8|0);
 $4 = HEAP32[$3>>2]|0;
 $5 = $2;
 $6 = $4;
 $7 = (($5) - ($6))|0;
 $8 = ___async_retval;
 HEAP32[$8>>2] = $7;
 return;
}
function __ZThn4_N11TextDisplayD0Ev__async_cb($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = ((($0)) + 4|0);
 $2 = HEAP32[$1>>2]|0;
 $3 = __THREW__; __THREW__ = 0;
 $4 = $3&1;
 if ($4) {
  $5 = ___cxa_find_matching_catch_2()|0;
  $6 = tempRet0;
  __ZdlPv($2);
  ___resumeException($5|0);
  // unreachable;
 } else {
  __ZdlPv($2);
  return;
 }
}
function __ZN15GraphicsDisplay4rowsEv__async_cb($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $AsyncRetVal = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = ___async_retval;
 $AsyncRetVal = HEAP32[$1>>2]|0;
 $2 = (($AsyncRetVal|0) / 8)&-1;
 $3 = ___async_retval;
 HEAP32[$3>>2] = $2;
 return;
}
function __ZThn4_N6C12832D1Ev__async_cb($0) {
 $0 = $0|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 return;
}
function __ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb($0) {
 $0 = $0|0;
 var $$expand_i1_val = 0, $$pre_trunc = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0;
 var $26 = 0, $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $IsAsync = 0, $ReallocAsyncCtx = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = ((($0)) + 4|0);
 $2 = HEAP32[$1>>2]|0;
 $3 = ((($0)) + 8|0);
 $4 = HEAP32[$3>>2]|0;
 $5 = ((($0)) + 12|0);
 $6 = HEAP32[$5>>2]|0;
 $7 = ((($0)) + 16|0);
 $8 = HEAP32[$7>>2]|0;
 $9 = ((($0)) + 20|0);
 $10 = HEAP32[$9>>2]|0;
 $11 = ((($0)) + 24|0);
 $12 = HEAP32[$11>>2]|0;
 $13 = ((($0)) + 28|0);
 $14 = HEAP32[$13>>2]|0;
 $15 = ((($0)) + 32|0);
 $$pre_trunc = HEAP8[$15>>0]|0;
 $16 = $$pre_trunc&1;
 $21 = ((($2)) + 8|0);
 $30 = ($21>>>0)<($4>>>0);
 if ($30) {
  $17 = HEAP8[$6>>0]|0;
  $18 = ($17<<24>>24)==(0);
  if ($18) {
   $19 = HEAP32[$8>>2]|0;
   $20 = ($19|0)==(1);
   if (!($20)) {
    $ReallocAsyncCtx = (_emscripten_realloc_async_context(36)|0);
    __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($21,$10,$12,$14,$16);
    $IsAsync = ___async;
    if (!($IsAsync)) {
     ___async_unwind = 0;
    }
    HEAP32[$ReallocAsyncCtx>>2] = 251;
    $22 = ((($ReallocAsyncCtx)) + 4|0);
    HEAP32[$22>>2] = $21;
    $23 = ((($ReallocAsyncCtx)) + 8|0);
    HEAP32[$23>>2] = $4;
    $24 = ((($ReallocAsyncCtx)) + 12|0);
    HEAP32[$24>>2] = $6;
    $25 = ((($ReallocAsyncCtx)) + 16|0);
    HEAP32[$25>>2] = $8;
    $26 = ((($ReallocAsyncCtx)) + 20|0);
    HEAP32[$26>>2] = $10;
    $27 = ((($ReallocAsyncCtx)) + 24|0);
    HEAP32[$27>>2] = $12;
    $28 = ((($ReallocAsyncCtx)) + 28|0);
    HEAP32[$28>>2] = $14;
    $29 = ((($ReallocAsyncCtx)) + 32|0);
    $$expand_i1_val = $16&1;
    HEAP8[$29>>0] = $$expand_i1_val;
    sp = STACKTOP;
    return;
   }
  }
 }
 return;
}
function __ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_9($0) {
 $0 = $0|0;
 var $$expand_i1_val = 0, $$pre_trunc = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0;
 var $26 = 0, $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $IsAsync4 = 0, $ReallocAsyncCtx2 = 0, label = 0;
 var sp = 0;
 sp = STACKTOP;
 $1 = ((($0)) + 4|0);
 $2 = HEAP32[$1>>2]|0;
 $3 = ((($0)) + 8|0);
 $4 = HEAP32[$3>>2]|0;
 $5 = ((($0)) + 12|0);
 $6 = HEAP32[$5>>2]|0;
 $7 = ((($0)) + 16|0);
 $8 = HEAP32[$7>>2]|0;
 $9 = ((($0)) + 20|0);
 $10 = HEAP32[$9>>2]|0;
 $11 = ((($0)) + 24|0);
 $12 = HEAP32[$11>>2]|0;
 $13 = ((($0)) + 28|0);
 $14 = HEAP32[$13>>2]|0;
 $15 = ((($0)) + 32|0);
 $16 = HEAP32[$15>>2]|0;
 $17 = ((($0)) + 36|0);
 $$pre_trunc = HEAP8[$17>>0]|0;
 $18 = $$pre_trunc&1;
 $25 = ((($2)) + 8|0);
 $35 = ($25>>>0)<($4>>>0);
 do {
  if ($35) {
   $19 = HEAP8[$6>>0]|0;
   $20 = ($19<<24>>24)==(0);
   if ($20) {
    $21 = HEAP32[$8>>2]|0;
    $22 = ($21|0)==(1);
    if ($22) {
     $23 = HEAP32[$10>>2]|0;
     $24 = ($23|0)==(1);
     if ($24) {
      break;
     }
    }
    $ReallocAsyncCtx2 = (_emscripten_realloc_async_context(40)|0);
    __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($25,$12,$14,$16,$18);
    $IsAsync4 = ___async;
    if (!($IsAsync4)) {
     ___async_unwind = 0;
    }
    HEAP32[$ReallocAsyncCtx2>>2] = 250;
    $26 = ((($ReallocAsyncCtx2)) + 4|0);
    HEAP32[$26>>2] = $25;
    $27 = ((($ReallocAsyncCtx2)) + 8|0);
    HEAP32[$27>>2] = $4;
    $28 = ((($ReallocAsyncCtx2)) + 12|0);
    HEAP32[$28>>2] = $6;
    $29 = ((($ReallocAsyncCtx2)) + 16|0);
    HEAP32[$29>>2] = $8;
    $30 = ((($ReallocAsyncCtx2)) + 20|0);
    HEAP32[$30>>2] = $10;
    $31 = ((($ReallocAsyncCtx2)) + 24|0);
    HEAP32[$31>>2] = $12;
    $32 = ((($ReallocAsyncCtx2)) + 28|0);
    HEAP32[$32>>2] = $14;
    $33 = ((($ReallocAsyncCtx2)) + 32|0);
    HEAP32[$33>>2] = $16;
    $34 = ((($ReallocAsyncCtx2)) + 36|0);
    $$expand_i1_val = $18&1;
    HEAP8[$34>>0] = $$expand_i1_val;
    sp = STACKTOP;
    return;
   }
  }
 } while(0);
 return;
}
function __ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_10($0) {
 $0 = $0|0;
 var $$expand_i1_val = 0, $$pre_trunc = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0;
 var $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $IsAsync8 = 0, $ReallocAsyncCtx3 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = ((($0)) + 4|0);
 $2 = HEAP32[$1>>2]|0;
 $3 = ((($0)) + 8|0);
 $4 = HEAP32[$3>>2]|0;
 $5 = ((($0)) + 12|0);
 $6 = HEAP32[$5>>2]|0;
 $7 = ((($0)) + 16|0);
 $8 = HEAP32[$7>>2]|0;
 $9 = ((($0)) + 20|0);
 $10 = HEAP32[$9>>2]|0;
 $11 = ((($0)) + 24|0);
 $12 = HEAP32[$11>>2]|0;
 $13 = ((($0)) + 28|0);
 $$pre_trunc = HEAP8[$13>>0]|0;
 $14 = $$pre_trunc&1;
 $17 = ((($2)) + 8|0);
 $25 = ($17>>>0)<($4>>>0);
 if ($25) {
  $15 = HEAP8[$6>>0]|0;
  $16 = ($15<<24>>24)==(0);
  if ($16) {
   $ReallocAsyncCtx3 = (_emscripten_realloc_async_context(32)|0);
   __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($17,$8,$10,$12,$14);
   $IsAsync8 = ___async;
   if (!($IsAsync8)) {
    ___async_unwind = 0;
   }
   HEAP32[$ReallocAsyncCtx3>>2] = 249;
   $18 = ((($ReallocAsyncCtx3)) + 4|0);
   HEAP32[$18>>2] = $17;
   $19 = ((($ReallocAsyncCtx3)) + 8|0);
   HEAP32[$19>>2] = $4;
   $20 = ((($ReallocAsyncCtx3)) + 12|0);
   HEAP32[$20>>2] = $6;
   $21 = ((($ReallocAsyncCtx3)) + 16|0);
   HEAP32[$21>>2] = $8;
   $22 = ((($ReallocAsyncCtx3)) + 20|0);
   HEAP32[$22>>2] = $10;
   $23 = ((($ReallocAsyncCtx3)) + 24|0);
   HEAP32[$23>>2] = $12;
   $24 = ((($ReallocAsyncCtx3)) + 28|0);
   $$expand_i1_val = $14&1;
   HEAP8[$24>>0] = $$expand_i1_val;
   sp = STACKTOP;
   return;
  }
 }
 return;
}
function __ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_11($0) {
 $0 = $0|0;
 var $$expand_i1_val = 0, $$expand_i1_val10 = 0, $$expand_i1_val8 = 0, $$pre_trunc = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0;
 var $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0;
 var $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0;
 var $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0, $67 = 0, $7 = 0, $8 = 0, $9 = 0, $IsAsync = 0, $IsAsync4 = 0, $IsAsync8 = 0, $ReallocAsyncCtx = 0, $ReallocAsyncCtx2 = 0, $ReallocAsyncCtx3 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = ((($0)) + 4|0);
 $2 = HEAP32[$1>>2]|0;
 $3 = ((($0)) + 8|0);
 $4 = HEAP32[$3>>2]|0;
 $5 = ((($0)) + 12|0);
 $6 = HEAP32[$5>>2]|0;
 $7 = ((($0)) + 16|0);
 $$pre_trunc = HEAP8[$7>>0]|0;
 $8 = $$pre_trunc&1;
 $9 = ((($0)) + 20|0);
 $10 = HEAP32[$9>>2]|0;
 $11 = ((($0)) + 24|0);
 $12 = HEAP32[$11>>2]|0;
 $13 = ((($0)) + 28|0);
 $14 = HEAP32[$13>>2]|0;
 $15 = ((($0)) + 32|0);
 $16 = HEAP32[$15>>2]|0;
 $17 = ((($0)) + 36|0);
 $18 = HEAP32[$17>>2]|0;
 $19 = ((($0)) + 40|0);
 $20 = HEAP32[$19>>2]|0;
 $21 = ((($0)) + 44|0);
 $22 = HEAP32[$21>>2]|0;
 $23 = ((($16)) + 24|0);
 $24 = ($18|0)>(1);
 do {
  if ($24) {
   $25 = HEAP32[$20>>2]|0;
   $26 = $25 & 2;
   $27 = ($26|0)==(0);
   if ($27) {
    $28 = HEAP32[$12>>2]|0;
    $29 = ($28|0)==(1);
    if (!($29)) {
     $39 = $25 & 1;
     $40 = ($39|0)==(0);
     if ($40) {
      $56 = HEAP8[$10>>0]|0;
      $57 = ($56<<24>>24)==(0);
      if (!($57)) {
       break;
      }
      $58 = HEAP32[$12>>2]|0;
      $59 = ($58|0)==(1);
      if ($59) {
       break;
      }
      $ReallocAsyncCtx = (_emscripten_realloc_async_context(36)|0);
      __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($23,$2,$4,$6,$8);
      $IsAsync = ___async;
      if (!($IsAsync)) {
       ___async_unwind = 0;
      }
      HEAP32[$ReallocAsyncCtx>>2] = 251;
      $60 = ((($ReallocAsyncCtx)) + 4|0);
      HEAP32[$60>>2] = $23;
      $61 = ((($ReallocAsyncCtx)) + 8|0);
      HEAP32[$61>>2] = $14;
      $62 = ((($ReallocAsyncCtx)) + 12|0);
      HEAP32[$62>>2] = $10;
      $63 = ((($ReallocAsyncCtx)) + 16|0);
      HEAP32[$63>>2] = $12;
      $64 = ((($ReallocAsyncCtx)) + 20|0);
      HEAP32[$64>>2] = $2;
      $65 = ((($ReallocAsyncCtx)) + 24|0);
      HEAP32[$65>>2] = $4;
      $66 = ((($ReallocAsyncCtx)) + 28|0);
      HEAP32[$66>>2] = $6;
      $67 = ((($ReallocAsyncCtx)) + 32|0);
      $$expand_i1_val10 = $8&1;
      HEAP8[$67>>0] = $$expand_i1_val10;
      sp = STACKTOP;
      return;
     }
     $41 = HEAP8[$10>>0]|0;
     $42 = ($41<<24>>24)==(0);
     if (!($42)) {
      break;
     }
     $43 = HEAP32[$12>>2]|0;
     $44 = ($43|0)==(1);
     if ($44) {
      $45 = HEAP32[$22>>2]|0;
      $46 = ($45|0)==(1);
      if ($46) {
       break;
      }
     }
     $ReallocAsyncCtx2 = (_emscripten_realloc_async_context(40)|0);
     __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($23,$2,$4,$6,$8);
     $IsAsync4 = ___async;
     if (!($IsAsync4)) {
      ___async_unwind = 0;
     }
     HEAP32[$ReallocAsyncCtx2>>2] = 250;
     $47 = ((($ReallocAsyncCtx2)) + 4|0);
     HEAP32[$47>>2] = $23;
     $48 = ((($ReallocAsyncCtx2)) + 8|0);
     HEAP32[$48>>2] = $14;
     $49 = ((($ReallocAsyncCtx2)) + 12|0);
     HEAP32[$49>>2] = $10;
     $50 = ((($ReallocAsyncCtx2)) + 16|0);
     HEAP32[$50>>2] = $12;
     $51 = ((($ReallocAsyncCtx2)) + 20|0);
     HEAP32[$51>>2] = $22;
     $52 = ((($ReallocAsyncCtx2)) + 24|0);
     HEAP32[$52>>2] = $2;
     $53 = ((($ReallocAsyncCtx2)) + 28|0);
     HEAP32[$53>>2] = $4;
     $54 = ((($ReallocAsyncCtx2)) + 32|0);
     HEAP32[$54>>2] = $6;
     $55 = ((($ReallocAsyncCtx2)) + 36|0);
     $$expand_i1_val8 = $8&1;
     HEAP8[$55>>0] = $$expand_i1_val8;
     sp = STACKTOP;
     return;
    }
   }
   $30 = HEAP8[$10>>0]|0;
   $31 = ($30<<24>>24)==(0);
   if ($31) {
    $ReallocAsyncCtx3 = (_emscripten_realloc_async_context(32)|0);
    __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($23,$2,$4,$6,$8);
    $IsAsync8 = ___async;
    if (!($IsAsync8)) {
     ___async_unwind = 0;
    }
    HEAP32[$ReallocAsyncCtx3>>2] = 249;
    $32 = ((($ReallocAsyncCtx3)) + 4|0);
    HEAP32[$32>>2] = $23;
    $33 = ((($ReallocAsyncCtx3)) + 8|0);
    HEAP32[$33>>2] = $14;
    $34 = ((($ReallocAsyncCtx3)) + 12|0);
    HEAP32[$34>>2] = $10;
    $35 = ((($ReallocAsyncCtx3)) + 16|0);
    HEAP32[$35>>2] = $2;
    $36 = ((($ReallocAsyncCtx3)) + 20|0);
    HEAP32[$36>>2] = $4;
    $37 = ((($ReallocAsyncCtx3)) + 24|0);
    HEAP32[$37>>2] = $6;
    $38 = ((($ReallocAsyncCtx3)) + 28|0);
    $$expand_i1_val = $8&1;
    HEAP8[$38>>0] = $$expand_i1_val;
    sp = STACKTOP;
    return;
   }
  }
 } while(0);
 return;
}
function __ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_12($0) {
 $0 = $0|0;
 var $$085$off0$reg2mem$0 = 0, $$182$off0 = 0, $$182$off0$expand_i1_val = 0, $$186$off0 = 0, $$186$off0$expand_i1_val = 0, $$283$off0 = 0, $$expand_i1_val = 0, $$pre_trunc = 0, $$pre_trunc16 = 0, $$pre_trunc18 = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0;
 var $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0;
 var $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0;
 var $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0, $67 = 0, $68 = 0, $69 = 0, $7 = 0, $8 = 0, $9 = 0, $IsAsync16 = 0;
 var $ReallocAsyncCtx5 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = ((($0)) + 4|0);
 $2 = HEAP32[$1>>2]|0;
 $3 = ((($0)) + 8|0);
 $4 = HEAP32[$3>>2]|0;
 $5 = ((($0)) + 12|0);
 $6 = HEAP32[$5>>2]|0;
 $7 = ((($0)) + 16|0);
 $8 = HEAP32[$7>>2]|0;
 $9 = ((($0)) + 20|0);
 $$pre_trunc = HEAP8[$9>>0]|0;
 $10 = $$pre_trunc&1;
 $11 = ((($0)) + 24|0);
 $12 = HEAP32[$11>>2]|0;
 $13 = ((($0)) + 28|0);
 $14 = HEAP32[$13>>2]|0;
 $15 = ((($0)) + 32|0);
 $16 = HEAP32[$15>>2]|0;
 $17 = ((($0)) + 36|0);
 $18 = HEAP32[$17>>2]|0;
 $19 = ((($0)) + 40|0);
 $20 = HEAP32[$19>>2]|0;
 $21 = ((($0)) + 44|0);
 $22 = HEAP32[$21>>2]|0;
 $23 = ((($0)) + 48|0);
 $$pre_trunc16 = HEAP8[$23>>0]|0;
 $24 = $$pre_trunc16&1;
 $25 = ((($0)) + 49|0);
 $$pre_trunc18 = HEAP8[$25>>0]|0;
 $26 = $$pre_trunc18&1;
 $27 = ((($0)) + 52|0);
 $28 = HEAP32[$27>>2]|0;
 $29 = ((($0)) + 56|0);
 $30 = HEAP32[$29>>2]|0;
 $48 = HEAP8[$12>>0]|0;
 $49 = ($48<<24>>24)==(0);
 L2: do {
  if ($49) {
   $50 = HEAP8[$4>>0]|0;
   $51 = ($50<<24>>24)==(0);
   do {
    if ($51) {
     $$182$off0 = $24;$$186$off0 = $26;
    } else {
     $52 = HEAP8[$2>>0]|0;
     $53 = ($52<<24>>24)==(0);
     if ($53) {
      $59 = HEAP32[$30>>2]|0;
      $60 = $59 & 1;
      $61 = ($60|0)==(0);
      if ($61) {
       $$085$off0$reg2mem$0 = $26;$$283$off0 = 1;
       label = 13;
       break L2;
      } else {
       $$182$off0 = 1;$$186$off0 = $26;
       break;
      }
     }
     $54 = HEAP32[$18>>2]|0;
     $55 = ($54|0)==(1);
     if ($55) {
      label = 18;
      break L2;
     }
     $56 = HEAP32[$30>>2]|0;
     $57 = $56 & 2;
     $58 = ($57|0)==(0);
     if ($58) {
      label = 18;
      break L2;
     } else {
      $$182$off0 = 1;$$186$off0 = 1;
     }
    }
   } while(0);
   $32 = ((($28)) + 8|0);
   $31 = ($32>>>0)<($14>>>0);
   if ($31) {
    HEAP8[$2>>0] = 0;
    HEAP8[$4>>0] = 0;
    $ReallocAsyncCtx5 = (_emscripten_realloc_async_context(60)|0);
    __ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($32,$6,$8,$8,1,$10);
    $IsAsync16 = ___async;
    if (!($IsAsync16)) {
     ___async_unwind = 0;
    }
    HEAP32[$ReallocAsyncCtx5>>2] = 247;
    $33 = ((($ReallocAsyncCtx5)) + 4|0);
    HEAP32[$33>>2] = $2;
    $34 = ((($ReallocAsyncCtx5)) + 8|0);
    HEAP32[$34>>2] = $4;
    $35 = ((($ReallocAsyncCtx5)) + 12|0);
    HEAP32[$35>>2] = $6;
    $36 = ((($ReallocAsyncCtx5)) + 16|0);
    HEAP32[$36>>2] = $8;
    $37 = ((($ReallocAsyncCtx5)) + 20|0);
    $$expand_i1_val = $10&1;
    HEAP8[$37>>0] = $$expand_i1_val;
    $38 = ((($ReallocAsyncCtx5)) + 24|0);
    HEAP32[$38>>2] = $12;
    $39 = ((($ReallocAsyncCtx5)) + 28|0);
    HEAP32[$39>>2] = $14;
    $40 = ((($ReallocAsyncCtx5)) + 32|0);
    HEAP32[$40>>2] = $16;
    $41 = ((($ReallocAsyncCtx5)) + 36|0);
    HEAP32[$41>>2] = $18;
    $42 = ((($ReallocAsyncCtx5)) + 40|0);
    HEAP32[$42>>2] = $20;
    $43 = ((($ReallocAsyncCtx5)) + 44|0);
    HEAP32[$43>>2] = $22;
    $44 = ((($ReallocAsyncCtx5)) + 48|0);
    $$182$off0$expand_i1_val = $$182$off0&1;
    HEAP8[$44>>0] = $$182$off0$expand_i1_val;
    $45 = ((($ReallocAsyncCtx5)) + 49|0);
    $$186$off0$expand_i1_val = $$186$off0&1;
    HEAP8[$45>>0] = $$186$off0$expand_i1_val;
    $46 = ((($ReallocAsyncCtx5)) + 52|0);
    HEAP32[$46>>2] = $32;
    $47 = ((($ReallocAsyncCtx5)) + 56|0);
    HEAP32[$47>>2] = $30;
    sp = STACKTOP;
    return;
   } else {
    $$085$off0$reg2mem$0 = $$186$off0;$$283$off0 = $$182$off0;
    label = 13;
   }
  } else {
   $$085$off0$reg2mem$0 = $26;$$283$off0 = $24;
   label = 13;
  }
 } while(0);
 do {
  if ((label|0) == 13) {
   if (!($$085$off0$reg2mem$0)) {
    HEAP32[$20>>2] = $8;
    $62 = ((($6)) + 40|0);
    $63 = HEAP32[$62>>2]|0;
    $64 = (($63) + 1)|0;
    HEAP32[$62>>2] = $64;
    $65 = HEAP32[$22>>2]|0;
    $66 = ($65|0)==(1);
    if ($66) {
     $67 = HEAP32[$18>>2]|0;
     $68 = ($67|0)==(2);
     if ($68) {
      HEAP8[$12>>0] = 1;
      if ($$283$off0) {
       label = 18;
       break;
      } else {
       $69 = 4;
       break;
      }
     }
    }
   }
   if ($$283$off0) {
    label = 18;
   } else {
    $69 = 4;
   }
  }
 } while(0);
 if ((label|0) == 18) {
  $69 = 3;
 }
 HEAP32[$16>>2] = $69;
 return;
}
function __ZN4mbed6StreamD2Ev__async_cb($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = ((($0)) + 4|0);
 $2 = HEAP32[$1>>2]|0;
 $3 = ((($2)) + 4|0);
 __ZN4mbed8FileBaseD2Ev($3);
 return;
}
function __Znwj__async_cb($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $IsAsync = 0, $ReallocAsyncCtx = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = ((($0)) + 4|0);
 $2 = HEAP32[$1>>2]|0;
 $3 = (_malloc($2)|0);
 $4 = ($3|0)==(0|0);
 if (!($4)) {
  $9 = ___async_retval;
  HEAP32[$9>>2] = $3;
  return;
 }
 $5 = (__ZSt15get_new_handlerv()|0);
 $6 = ($5|0)==(0|0);
 if ($6) {
  $8 = (___cxa_allocate_exception(4)|0);
  __ZNSt9bad_allocC2Ev($8);
  ___cxa_throw(($8|0),(304|0),(94|0));
  // unreachable;
 }
 $ReallocAsyncCtx = (_emscripten_realloc_async_context(8)|0);
 FUNCTION_TABLE_v[$5 & 255]();
 $IsAsync = ___async;
 if (!($IsAsync)) {
  ___async_unwind = 0;
 }
 HEAP32[$ReallocAsyncCtx>>2] = 225;
 $7 = ((($ReallocAsyncCtx)) + 4|0);
 HEAP32[$7>>2] = $2;
 sp = STACKTOP;
 return;
}
function __ZN4mbed6Stream4putcEi__async_cb($0) {
 $0 = $0|0;
 var $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $IsAsync3 = 0, $ReallocAsyncCtx2 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = ((($0)) + 4|0);
 $2 = HEAP32[$1>>2]|0;
 $3 = ((($0)) + 8|0);
 $4 = HEAP32[$3>>2]|0;
 $5 = ((($0)) + 12|0);
 $6 = HEAP32[$5>>2]|0;
 $7 = HEAP32[$2>>2]|0;
 $8 = ((($7)) + 68|0);
 $9 = HEAP32[$8>>2]|0;
 $ReallocAsyncCtx2 = (_emscripten_realloc_async_context(12)|0);
 $10 = (FUNCTION_TABLE_iii[$9 & 255]($2,$4)|0);
 $IsAsync3 = ___async;
 if (!($IsAsync3)) {
  $13 = ___async_retval;
  HEAP32[$13>>2] = $10;
  ___async_unwind = 0;
 }
 HEAP32[$ReallocAsyncCtx2>>2] = 187;
 $11 = ((($ReallocAsyncCtx2)) + 4|0);
 HEAP32[$11>>2] = $6;
 $12 = ((($ReallocAsyncCtx2)) + 8|0);
 HEAP32[$12>>2] = $2;
 sp = STACKTOP;
 return;
}
function __ZN4mbed6Stream4putcEi__async_cb_13($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $AsyncRetVal = 0, $IsAsync6 = 0, $ReallocAsyncCtx3 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = ((($0)) + 4|0);
 $2 = HEAP32[$1>>2]|0;
 $3 = ((($0)) + 8|0);
 $4 = HEAP32[$3>>2]|0;
 $5 = ___async_retval;
 $AsyncRetVal = HEAP32[$5>>2]|0;
 $6 = HEAP32[$2>>2]|0;
 $7 = ((($6)) + 84|0);
 $8 = HEAP32[$7>>2]|0;
 $ReallocAsyncCtx3 = (_emscripten_realloc_async_context(8)|0);
 FUNCTION_TABLE_vi[$8 & 511]($4);
 $IsAsync6 = ___async;
 if (!($IsAsync6)) {
  ___async_unwind = 0;
 }
 HEAP32[$ReallocAsyncCtx3>>2] = 188;
 $9 = ((($ReallocAsyncCtx3)) + 4|0);
 HEAP32[$9>>2] = $AsyncRetVal;
 sp = STACKTOP;
 return;
}
function __ZN4mbed6Stream4putcEi__async_cb_14($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = ((($0)) + 4|0);
 $2 = HEAP32[$1>>2]|0;
 $3 = ___async_retval;
 HEAP32[$3>>2] = $2;
 return;
}
function _main__async_cb($0) {
 $0 = $0|0;
 var $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0.0, $14 = 0.0, $15 = 0.0, $16 = 0.0, $17 = 0.0, $18 = 0.0, $19 = 0.0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0;
 var $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $IsAsync = 0, $ReallocAsyncCtx = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = ((($0)) + 4|0);
 $2 = HEAP32[$1>>2]|0;
 $3 = ((($0)) + 8|0);
 $4 = HEAP32[$3>>2]|0;
 $5 = ((($0)) + 12|0);
 $6 = HEAP32[$5>>2]|0;
 $7 = ((($0)) + 16|0);
 $8 = HEAP32[$7>>2]|0;
 $9 = ((($0)) + 20|0);
 $10 = HEAP32[$9>>2]|0;
 $11 = ((($0)) + 24|0);
 $12 = HEAP32[$11>>2]|0;
 __ZN6C128323clsEv(8972); //@line 13 "demos/temperature/main.cpp"
 $13 = (+__ZN5Sht3115readTemperatureEv(13765)); //@line 15 "demos/temperature/main.cpp"
 HEAPF32[$2>>2] = $13; //@line 15 "demos/temperature/main.cpp"
 $14 = (+__ZN5Sht3112readHumidityEv(13765)); //@line 16 "demos/temperature/main.cpp"
 HEAPF32[$4>>2] = $14; //@line 16 "demos/temperature/main.cpp"
 __ZN6C128326locateEii(8972,3,3); //@line 18 "demos/temperature/main.cpp"
 $15 = +HEAPF32[$2>>2]; //@line 19 "demos/temperature/main.cpp"
 $16 = $15; //@line 19 "demos/temperature/main.cpp"
 HEAPF64[$6>>3] = $16; //@line 19 "demos/temperature/main.cpp"
 (__ZN4mbed6Stream6printfEPKcz(8972,5707,$6)|0); //@line 19 "demos/temperature/main.cpp"
 __ZN6C128326locateEii(8972,3,13); //@line 20 "demos/temperature/main.cpp"
 $17 = +HEAPF32[$4>>2]; //@line 21 "demos/temperature/main.cpp"
 $18 = $17; //@line 21 "demos/temperature/main.cpp"
 HEAPF64[$10>>3] = $18; //@line 21 "demos/temperature/main.cpp"
 (__ZN4mbed6Stream6printfEPKcz(8972,5727,$10)|0); //@line 21 "demos/temperature/main.cpp"
 $19 = +HEAPF32[$2>>2]; //@line 24 "demos/temperature/main.cpp"
 $20 = $19 > 25.0; //@line 24 "demos/temperature/main.cpp"
 $21 = $20&1; //@line 24 "demos/temperature/main.cpp"
 (__ZN4mbed10DigitalOutaSEi(13156,$21)|0); //@line 24 "demos/temperature/main.cpp"
 $ReallocAsyncCtx = (_emscripten_realloc_async_context(28)|0);
 _wait(1.0); //@line 26 "demos/temperature/main.cpp"
 $IsAsync = ___async;
 if ($IsAsync) {
  HEAP32[$ReallocAsyncCtx>>2] = 202;
  $22 = ((($ReallocAsyncCtx)) + 4|0);
  HEAP32[$22>>2] = $2;
  $23 = ((($ReallocAsyncCtx)) + 8|0);
  HEAP32[$23>>2] = $4;
  $24 = ((($ReallocAsyncCtx)) + 12|0);
  HEAP32[$24>>2] = $6;
  $25 = ((($ReallocAsyncCtx)) + 16|0);
  HEAP32[$25>>2] = $8;
  $26 = ((($ReallocAsyncCtx)) + 20|0);
  HEAP32[$26>>2] = $10;
  $27 = ((($ReallocAsyncCtx)) + 24|0);
  HEAP32[$27>>2] = $12;
  sp = STACKTOP;
  return;
 }
 ___async_unwind = 0;
 HEAP32[$ReallocAsyncCtx>>2] = 202;
 $22 = ((($ReallocAsyncCtx)) + 4|0);
 HEAP32[$22>>2] = $2;
 $23 = ((($ReallocAsyncCtx)) + 8|0);
 HEAP32[$23>>2] = $4;
 $24 = ((($ReallocAsyncCtx)) + 12|0);
 HEAP32[$24>>2] = $6;
 $25 = ((($ReallocAsyncCtx)) + 16|0);
 HEAP32[$25>>2] = $8;
 $26 = ((($ReallocAsyncCtx)) + 20|0);
 HEAP32[$26>>2] = $10;
 $27 = ((($ReallocAsyncCtx)) + 24|0);
 HEAP32[$27>>2] = $12;
 sp = STACKTOP;
 return;
}
function __ZNK10__cxxabiv121__vmi_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb($0) {
 $0 = $0|0;
 var $$expand_i1_val = 0, $$pre_trunc = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0;
 var $26 = 0, $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0;
 var $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0;
 var $IsAsync = 0, $ReallocAsyncCtx = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = ((($0)) + 4|0);
 $2 = HEAP32[$1>>2]|0;
 $3 = ((($0)) + 8|0);
 $4 = HEAP32[$3>>2]|0;
 $5 = ((($0)) + 12|0);
 $6 = HEAP32[$5>>2]|0;
 $7 = ((($0)) + 16|0);
 $8 = HEAP8[$7>>0]|0;
 $9 = ((($0)) + 20|0);
 $10 = HEAP32[$9>>2]|0;
 $11 = ((($0)) + 24|0);
 $12 = HEAP8[$11>>0]|0;
 $13 = ((($0)) + 28|0);
 $14 = HEAP32[$13>>2]|0;
 $15 = ((($0)) + 32|0);
 $16 = HEAP32[$15>>2]|0;
 $17 = ((($0)) + 36|0);
 $18 = HEAP32[$17>>2]|0;
 $19 = ((($0)) + 40|0);
 $20 = HEAP32[$19>>2]|0;
 $21 = ((($0)) + 44|0);
 $22 = HEAP32[$21>>2]|0;
 $23 = ((($0)) + 48|0);
 $24 = HEAP32[$23>>2]|0;
 $25 = ((($0)) + 52|0);
 $26 = HEAP32[$25>>2]|0;
 $27 = ((($0)) + 56|0);
 $$pre_trunc = HEAP8[$27>>0]|0;
 $28 = $$pre_trunc&1;
 $43 = ((($2)) + 8|0);
 $58 = ($43>>>0)<($4>>>0);
 do {
  if ($58) {
   $29 = HEAP8[$6>>0]|0;
   $30 = ($29<<24>>24)==(0);
   if ($30) {
    $31 = HEAP8[$10>>0]|0;
    $32 = ($31<<24>>24)==(0);
    if ($32) {
     $38 = HEAP8[$14>>0]|0;
     $39 = ($38<<24>>24)==(0);
     if (!($39)) {
      $40 = HEAP32[$18>>2]|0;
      $41 = $40 & 1;
      $42 = ($41|0)==(0);
      if ($42) {
       break;
      }
     }
    } else {
     $33 = HEAP32[$16>>2]|0;
     $34 = ($33|0)==(1);
     if ($34) {
      break;
     }
     $35 = HEAP32[$18>>2]|0;
     $36 = $35 & 2;
     $37 = ($36|0)==(0);
     if ($37) {
      break;
     }
    }
    HEAP8[$10>>0] = 0;
    HEAP8[$14>>0] = 0;
    $ReallocAsyncCtx = (_emscripten_realloc_async_context(60)|0);
    __ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($43,$20,$22,$24,$26,$28);
    $IsAsync = ___async;
    if (!($IsAsync)) {
     ___async_unwind = 0;
    }
    HEAP32[$ReallocAsyncCtx>>2] = 246;
    $44 = ((($ReallocAsyncCtx)) + 4|0);
    HEAP32[$44>>2] = $43;
    $45 = ((($ReallocAsyncCtx)) + 8|0);
    HEAP32[$45>>2] = $4;
    $46 = ((($ReallocAsyncCtx)) + 12|0);
    HEAP32[$46>>2] = $6;
    $47 = ((($ReallocAsyncCtx)) + 16|0);
    HEAP8[$47>>0] = $8;
    $48 = ((($ReallocAsyncCtx)) + 20|0);
    HEAP32[$48>>2] = $10;
    $49 = ((($ReallocAsyncCtx)) + 24|0);
    HEAP8[$49>>0] = $12;
    $50 = ((($ReallocAsyncCtx)) + 28|0);
    HEAP32[$50>>2] = $14;
    $51 = ((($ReallocAsyncCtx)) + 32|0);
    HEAP32[$51>>2] = $16;
    $52 = ((($ReallocAsyncCtx)) + 36|0);
    HEAP32[$52>>2] = $18;
    $53 = ((($ReallocAsyncCtx)) + 40|0);
    HEAP32[$53>>2] = $20;
    $54 = ((($ReallocAsyncCtx)) + 44|0);
    HEAP32[$54>>2] = $22;
    $55 = ((($ReallocAsyncCtx)) + 48|0);
    HEAP32[$55>>2] = $24;
    $56 = ((($ReallocAsyncCtx)) + 52|0);
    HEAP32[$56>>2] = $26;
    $57 = ((($ReallocAsyncCtx)) + 56|0);
    $$expand_i1_val = $28&1;
    HEAP8[$57>>0] = $$expand_i1_val;
    sp = STACKTOP;
    return;
   }
  }
 } while(0);
 HEAP8[$10>>0] = $8;
 HEAP8[$14>>0] = $12;
 return;
}
function __ZNK10__cxxabiv121__vmi_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb_15($0) {
 $0 = $0|0;
 var $$expand_i1_val = 0, $$pre_trunc = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0;
 var $26 = 0, $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0;
 var $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $IsAsync = 0;
 var $ReallocAsyncCtx = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = ((($0)) + 4|0);
 $2 = HEAP32[$1>>2]|0;
 $3 = ((($0)) + 8|0);
 $4 = HEAP32[$3>>2]|0;
 $5 = ((($0)) + 12|0);
 $6 = HEAP32[$5>>2]|0;
 $7 = ((($0)) + 16|0);
 $8 = HEAP8[$7>>0]|0;
 $9 = ((($0)) + 20|0);
 $10 = HEAP32[$9>>2]|0;
 $11 = ((($0)) + 24|0);
 $12 = HEAP8[$11>>0]|0;
 $13 = ((($0)) + 28|0);
 $14 = HEAP32[$13>>2]|0;
 $15 = ((($0)) + 32|0);
 $16 = HEAP32[$15>>2]|0;
 $17 = ((($0)) + 36|0);
 $18 = HEAP32[$17>>2]|0;
 $19 = ((($0)) + 40|0);
 $20 = HEAP32[$19>>2]|0;
 $21 = ((($0)) + 44|0);
 $$pre_trunc = HEAP8[$21>>0]|0;
 $22 = $$pre_trunc&1;
 $23 = ((($0)) + 48|0);
 $24 = HEAP32[$23>>2]|0;
 $25 = ($2|0)>(1);
 do {
  if ($25) {
   $26 = ((($4)) + 24|0);
   $27 = ((($6)) + 24|0);
   $28 = ((($6)) + 54|0);
   $29 = ((($4)) + 8|0);
   $30 = HEAP8[$28>>0]|0;
   $31 = ($30<<24>>24)==(0);
   if ($31) {
    $32 = HEAP8[$10>>0]|0;
    $33 = ($32<<24>>24)==(0);
    if ($33) {
     $39 = HEAP8[$14>>0]|0;
     $40 = ($39<<24>>24)==(0);
     if (!($40)) {
      $41 = HEAP32[$29>>2]|0;
      $42 = $41 & 1;
      $43 = ($42|0)==(0);
      if ($43) {
       break;
      }
     }
    } else {
     $34 = HEAP32[$27>>2]|0;
     $35 = ($34|0)==(1);
     if ($35) {
      break;
     }
     $36 = HEAP32[$29>>2]|0;
     $37 = $36 & 2;
     $38 = ($37|0)==(0);
     if ($38) {
      break;
     }
    }
    HEAP8[$10>>0] = 0;
    HEAP8[$14>>0] = 0;
    $ReallocAsyncCtx = (_emscripten_realloc_async_context(60)|0);
    __ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($26,$6,$16,$18,$20,$22);
    $IsAsync = ___async;
    if (!($IsAsync)) {
     ___async_unwind = 0;
    }
    HEAP32[$ReallocAsyncCtx>>2] = 246;
    $44 = ((($ReallocAsyncCtx)) + 4|0);
    HEAP32[$44>>2] = $26;
    $45 = ((($ReallocAsyncCtx)) + 8|0);
    HEAP32[$45>>2] = $24;
    $46 = ((($ReallocAsyncCtx)) + 12|0);
    HEAP32[$46>>2] = $28;
    $47 = ((($ReallocAsyncCtx)) + 16|0);
    HEAP8[$47>>0] = $8;
    $48 = ((($ReallocAsyncCtx)) + 20|0);
    HEAP32[$48>>2] = $10;
    $49 = ((($ReallocAsyncCtx)) + 24|0);
    HEAP8[$49>>0] = $12;
    $50 = ((($ReallocAsyncCtx)) + 28|0);
    HEAP32[$50>>2] = $14;
    $51 = ((($ReallocAsyncCtx)) + 32|0);
    HEAP32[$51>>2] = $27;
    $52 = ((($ReallocAsyncCtx)) + 36|0);
    HEAP32[$52>>2] = $29;
    $53 = ((($ReallocAsyncCtx)) + 40|0);
    HEAP32[$53>>2] = $6;
    $54 = ((($ReallocAsyncCtx)) + 44|0);
    HEAP32[$54>>2] = $16;
    $55 = ((($ReallocAsyncCtx)) + 48|0);
    HEAP32[$55>>2] = $18;
    $56 = ((($ReallocAsyncCtx)) + 52|0);
    HEAP32[$56>>2] = $20;
    $57 = ((($ReallocAsyncCtx)) + 56|0);
    $$expand_i1_val = $22&1;
    HEAP8[$57>>0] = $$expand_i1_val;
    sp = STACKTOP;
    return;
   }
  }
 } while(0);
 HEAP8[$10>>0] = $8;
 HEAP8[$14>>0] = $12;
 return;
}
function __ZThn4_N11TextDisplayD1Ev__async_cb($0) {
 $0 = $0|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 return;
}
function __ZThn4_N15GraphicsDisplayD0Ev__async_cb($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = ((($0)) + 4|0);
 $2 = HEAP32[$1>>2]|0;
 $3 = __THREW__; __THREW__ = 0;
 $4 = $3&1;
 if ($4) {
  $5 = ___cxa_find_matching_catch_2()|0;
  $6 = tempRet0;
  __ZdlPv($2);
  ___resumeException($5|0);
  // unreachable;
 } else {
  __ZdlPv($2);
  return;
 }
}
function _fclose__async_cb($0) {
 $0 = $0|0;
 var $$pre_trunc = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $AsyncRetVal = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = ((($0)) + 4|0);
 $2 = HEAP32[$1>>2]|0;
 $3 = ((($0)) + 8|0);
 $4 = HEAP32[$3>>2]|0;
 $5 = ((($0)) + 12|0);
 $$pre_trunc = HEAP8[$5>>0]|0;
 $6 = $$pre_trunc&1;
 $7 = ((($0)) + 16|0);
 $8 = HEAP32[$7>>2]|0;
 $9 = ___async_retval;
 $AsyncRetVal = HEAP32[$9>>2]|0;
 $10 = $AsyncRetVal | $2;
 $11 = ((($4)) + 92|0);
 $12 = HEAP32[$11>>2]|0;
 $13 = ($12|0)==(0|0);
 if (!($13)) {
  _free($12);
 }
 if ($6) {
  $14 = ($8|0)==(0);
  if (!($14)) {
   ___unlockfile($4);
  }
 } else {
  _free($4);
 }
 $15 = ___async_retval;
 HEAP32[$15>>2] = $10;
 return;
}
function _fclose__async_cb_16($0) {
 $0 = $0|0;
 var $$expand_i1_val = 0, $$pre_trunc = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $AsyncRetVal = 0, $IsAsync = 0, $ReallocAsyncCtx = 0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 $1 = ((($0)) + 4|0);
 $2 = HEAP32[$1>>2]|0;
 $3 = ((($0)) + 8|0);
 $$pre_trunc = HEAP8[$3>>0]|0;
 $4 = $$pre_trunc&1;
 $5 = ((($0)) + 12|0);
 $6 = HEAP32[$5>>2]|0;
 $7 = ___async_retval;
 $AsyncRetVal = HEAP32[$7>>2]|0;
 $8 = ((($2)) + 12|0);
 $9 = HEAP32[$8>>2]|0;
 $ReallocAsyncCtx = (_emscripten_realloc_async_context(20)|0);
 $10 = (FUNCTION_TABLE_ii[$9 & 511]($2)|0);
 $IsAsync = ___async;
 if (!($IsAsync)) {
  $15 = ___async_retval;
  HEAP32[$15>>2] = $10;
  ___async_unwind = 0;
 }
 HEAP32[$ReallocAsyncCtx>>2] = 210;
 $11 = ((($ReallocAsyncCtx)) + 4|0);
 HEAP32[$11>>2] = $AsyncRetVal;
 $12 = ((($ReallocAsyncCtx)) + 8|0);
 HEAP32[$12>>2] = $2;
 $13 = ((($ReallocAsyncCtx)) + 12|0);
 $$expand_i1_val = $4&1;
 HEAP8[$13>>0] = $$expand_i1_val;
 $14 = ((($ReallocAsyncCtx)) + 16|0);
 HEAP32[$14>>2] = $6;
 sp = STACKTOP;
 return;
}
function __ZN15GraphicsDisplay7blitbitEiiiiPKc__async_cb($0) {
 $0 = $0|0;
 var $$in = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0;
 var $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $IsAsync4 = 0, $ReallocAsyncCtx2 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = ((($0)) + 4|0);
 $2 = HEAP32[$1>>2]|0;
 $3 = ((($0)) + 8|0);
 $4 = HEAP32[$3>>2]|0;
 $5 = ((($0)) + 12|0);
 $6 = HEAP32[$5>>2]|0;
 $7 = ((($0)) + 16|0);
 $8 = HEAP32[$7>>2]|0;
 $9 = Math_imul($2, $4)|0;
 $10 = ($9|0)>(0);
 if (!($10)) {
  return;
 }
 $11 = ((($6)) + 28|0);
 $12 = ((($6)) + 30|0);
 $13 = 0 >> 3;
 $14 = (($8) + ($13)|0);
 $15 = HEAP8[$14>>0]|0;
 $16 = 0 & 7;
 $17 = $15 << 24 >> 24;
 $18 = 128 >>> $16;
 $19 = $17 & $18;
 $20 = ($19|0)==(0);
 $$in = $20 ? $12 : $11;
 $21 = HEAP16[$$in>>1]|0;
 $22 = $21&65535;
 $23 = HEAP32[$6>>2]|0;
 $24 = ((($23)) + 136|0);
 $25 = HEAP32[$24>>2]|0;
 $ReallocAsyncCtx2 = (_emscripten_realloc_async_context(32)|0);
 FUNCTION_TABLE_vii[$25 & 255]($6,$22);
 $IsAsync4 = ___async;
 if (!($IsAsync4)) {
  ___async_unwind = 0;
 }
 HEAP32[$ReallocAsyncCtx2>>2] = 131;
 $26 = ((($ReallocAsyncCtx2)) + 4|0);
 HEAP32[$26>>2] = 0;
 $27 = ((($ReallocAsyncCtx2)) + 8|0);
 HEAP32[$27>>2] = $9;
 $28 = ((($ReallocAsyncCtx2)) + 12|0);
 HEAP32[$28>>2] = $8;
 $29 = ((($ReallocAsyncCtx2)) + 16|0);
 HEAP32[$29>>2] = $12;
 $30 = ((($ReallocAsyncCtx2)) + 20|0);
 HEAP32[$30>>2] = $11;
 $31 = ((($ReallocAsyncCtx2)) + 24|0);
 HEAP32[$31>>2] = $6;
 $32 = ((($ReallocAsyncCtx2)) + 28|0);
 HEAP32[$32>>2] = $6;
 sp = STACKTOP;
 return;
}
function __ZN15GraphicsDisplay7blitbitEiiiiPKc__async_cb_17($0) {
 $0 = $0|0;
 var $$in = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0;
 var $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $IsAsync4 = 0, $ReallocAsyncCtx2 = 0, $exitcond = 0, label = 0;
 var sp = 0;
 sp = STACKTOP;
 $1 = ((($0)) + 4|0);
 $2 = HEAP32[$1>>2]|0;
 $3 = ((($0)) + 8|0);
 $4 = HEAP32[$3>>2]|0;
 $5 = ((($0)) + 12|0);
 $6 = HEAP32[$5>>2]|0;
 $7 = ((($0)) + 16|0);
 $8 = HEAP32[$7>>2]|0;
 $9 = ((($0)) + 20|0);
 $10 = HEAP32[$9>>2]|0;
 $11 = ((($0)) + 24|0);
 $12 = HEAP32[$11>>2]|0;
 $13 = ((($0)) + 28|0);
 $14 = HEAP32[$13>>2]|0;
 $16 = (($2) + 1)|0;
 $exitcond = ($16|0)==($4|0);
 if ($exitcond) {
  return;
 }
 $15 = $16 >> 3;
 $17 = (($6) + ($15)|0);
 $18 = HEAP8[$17>>0]|0;
 $19 = $16 & 7;
 $20 = $18 << 24 >> 24;
 $21 = 128 >>> $19;
 $22 = $20 & $21;
 $23 = ($22|0)==(0);
 $$in = $23 ? $8 : $10;
 $24 = HEAP16[$$in>>1]|0;
 $25 = $24&65535;
 $26 = HEAP32[$12>>2]|0;
 $27 = ((($26)) + 136|0);
 $28 = HEAP32[$27>>2]|0;
 $ReallocAsyncCtx2 = (_emscripten_realloc_async_context(32)|0);
 FUNCTION_TABLE_vii[$28 & 255]($14,$25);
 $IsAsync4 = ___async;
 if (!($IsAsync4)) {
  ___async_unwind = 0;
 }
 HEAP32[$ReallocAsyncCtx2>>2] = 131;
 $29 = ((($ReallocAsyncCtx2)) + 4|0);
 HEAP32[$29>>2] = $16;
 $30 = ((($ReallocAsyncCtx2)) + 8|0);
 HEAP32[$30>>2] = $4;
 $31 = ((($ReallocAsyncCtx2)) + 12|0);
 HEAP32[$31>>2] = $6;
 $32 = ((($ReallocAsyncCtx2)) + 16|0);
 HEAP32[$32>>2] = $8;
 $33 = ((($ReallocAsyncCtx2)) + 20|0);
 HEAP32[$33>>2] = $10;
 $34 = ((($ReallocAsyncCtx2)) + 24|0);
 HEAP32[$34>>2] = $12;
 $35 = ((($ReallocAsyncCtx2)) + 28|0);
 HEAP32[$35>>2] = $14;
 sp = STACKTOP;
 return;
}
function __ZN4mbed6fdopenEPNS_10FileHandleEPKc__async_cb($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $AsyncRetVal = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = ___async_retval;
 $AsyncRetVal = HEAP32[$1>>2]|0;
 $2 = ___async_retval;
 HEAP32[$2>>2] = $AsyncRetVal;
 return;
}
function __ZThn4_N6C12832D0Ev__async_cb($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = ((($0)) + 4|0);
 $2 = HEAP32[$1>>2]|0;
 $3 = __THREW__; __THREW__ = 0;
 $4 = $3&1;
 if ($4) {
  $5 = ___cxa_find_matching_catch_2()|0;
  $6 = tempRet0;
  __ZdlPv($2);
  ___resumeException($5|0);
  // unreachable;
 } else {
  __ZdlPv($2);
  return;
 }
}
function _wait__async_cb($0) {
 $0 = $0|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 return;
}
function __GLOBAL__sub_I_main_cpp__async_cb($0) {
 $0 = $0|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 ___cxx_global_var_init_1();
 ___cxx_global_var_init_2();
 return;
}
function __ZN11TextDisplay3clsEv__async_cb($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $IsAsync3 = 0, $ReallocAsyncCtx2 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = ((($0)) + 4|0);
 $2 = HEAP32[$1>>2]|0;
 $3 = HEAP32[$2>>2]|0;
 $4 = ((($3)) + 96|0);
 $5 = HEAP32[$4>>2]|0;
 $ReallocAsyncCtx2 = (_emscripten_realloc_async_context(12)|0);
 $6 = (FUNCTION_TABLE_ii[$5 & 511]($2)|0);
 $IsAsync3 = ___async;
 if (!($IsAsync3)) {
  $9 = ___async_retval;
  HEAP32[$9>>2] = $6;
  ___async_unwind = 0;
 }
 HEAP32[$ReallocAsyncCtx2>>2] = 145;
 $7 = ((($ReallocAsyncCtx2)) + 4|0);
 HEAP32[$7>>2] = $2;
 $8 = ((($ReallocAsyncCtx2)) + 8|0);
 HEAP32[$8>>2] = $2;
 sp = STACKTOP;
 return;
}
function __ZN11TextDisplay3clsEv__async_cb_18($0) {
 $0 = $0|0;
 var $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $AsyncRetVal = 0, $IsAsync6 = 0, $ReallocAsyncCtx3 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = ((($0)) + 4|0);
 $2 = HEAP32[$1>>2]|0;
 $3 = ((($0)) + 8|0);
 $4 = HEAP32[$3>>2]|0;
 $5 = ___async_retval;
 $AsyncRetVal = HEAP32[$5>>2]|0;
 $6 = HEAP32[$2>>2]|0;
 $7 = ((($6)) + 92|0);
 $8 = HEAP32[$7>>2]|0;
 $ReallocAsyncCtx3 = (_emscripten_realloc_async_context(16)|0);
 $9 = (FUNCTION_TABLE_ii[$8 & 511]($4)|0);
 $IsAsync6 = ___async;
 if (!($IsAsync6)) {
  $13 = ___async_retval;
  HEAP32[$13>>2] = $9;
  ___async_unwind = 0;
 }
 HEAP32[$ReallocAsyncCtx3>>2] = 146;
 $10 = ((($ReallocAsyncCtx3)) + 4|0);
 HEAP32[$10>>2] = $AsyncRetVal;
 $11 = ((($ReallocAsyncCtx3)) + 8|0);
 HEAP32[$11>>2] = $4;
 $12 = ((($ReallocAsyncCtx3)) + 12|0);
 HEAP32[$12>>2] = $2;
 sp = STACKTOP;
 return;
}
function __ZN11TextDisplay3clsEv__async_cb_19($0) {
 $0 = $0|0;
 var $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $AsyncRetVal = 0, $IsAsync17 = 0, $ReallocAsyncCtx6 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = ((($0)) + 4|0);
 $2 = HEAP32[$1>>2]|0;
 $3 = ((($0)) + 8|0);
 $4 = HEAP32[$3>>2]|0;
 $5 = ((($0)) + 12|0);
 $6 = HEAP32[$5>>2]|0;
 $7 = ___async_retval;
 $AsyncRetVal = HEAP32[$7>>2]|0;
 $8 = Math_imul($AsyncRetVal, $2)|0;
 $9 = ($8|0)>(0);
 if (!($9)) {
  return;
 }
 $ReallocAsyncCtx6 = (_emscripten_realloc_async_context(20)|0);
 (__ZN4mbed6Stream4putcEi($4,32)|0);
 $IsAsync17 = ___async;
 if (!($IsAsync17)) {
  ___async_unwind = 0;
 }
 HEAP32[$ReallocAsyncCtx6>>2] = 147;
 $10 = ((($ReallocAsyncCtx6)) + 4|0);
 HEAP32[$10>>2] = 0;
 $11 = ((($ReallocAsyncCtx6)) + 8|0);
 HEAP32[$11>>2] = $6;
 $12 = ((($ReallocAsyncCtx6)) + 12|0);
 HEAP32[$12>>2] = $4;
 $13 = ((($ReallocAsyncCtx6)) + 16|0);
 HEAP32[$13>>2] = $4;
 sp = STACKTOP;
 return;
}
function __ZN11TextDisplay3clsEv__async_cb_20($0) {
 $0 = $0|0;
 var $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $AsyncRetVal = 0;
 var $IsAsync13 = 0, $ReallocAsyncCtx5 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = ((($0)) + 4|0);
 $2 = HEAP32[$1>>2]|0;
 $3 = ((($0)) + 8|0);
 $4 = HEAP32[$3>>2]|0;
 $5 = ((($0)) + 12|0);
 $6 = HEAP32[$5>>2]|0;
 $7 = ((($0)) + 16|0);
 $8 = HEAP32[$7>>2]|0;
 $9 = ___async_retval;
 $AsyncRetVal = HEAP32[$9>>2]|0;
 $10 = HEAP32[$2>>2]|0;
 $11 = ((($10)) + 92|0);
 $12 = HEAP32[$11>>2]|0;
 $ReallocAsyncCtx5 = (_emscripten_realloc_async_context(24)|0);
 $13 = (FUNCTION_TABLE_ii[$12 & 511]($4)|0);
 $IsAsync13 = ___async;
 if (!($IsAsync13)) {
  $19 = ___async_retval;
  HEAP32[$19>>2] = $13;
  ___async_unwind = 0;
 }
 HEAP32[$ReallocAsyncCtx5>>2] = 149;
 $14 = ((($ReallocAsyncCtx5)) + 4|0);
 HEAP32[$14>>2] = $AsyncRetVal;
 $15 = ((($ReallocAsyncCtx5)) + 8|0);
 HEAP32[$15>>2] = $6;
 $16 = ((($ReallocAsyncCtx5)) + 12|0);
 HEAP32[$16>>2] = $8;
 $17 = ((($ReallocAsyncCtx5)) + 16|0);
 HEAP32[$17>>2] = $2;
 $18 = ((($ReallocAsyncCtx5)) + 20|0);
 HEAP32[$18>>2] = $4;
 sp = STACKTOP;
 return;
}
function __ZN11TextDisplay3clsEv__async_cb_21($0) {
 $0 = $0|0;
 var $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $AsyncRetVal = 0, $IsAsync17 = 0, $ReallocAsyncCtx6 = 0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 $1 = ((($0)) + 4|0);
 $2 = HEAP32[$1>>2]|0;
 $3 = ((($0)) + 8|0);
 $4 = HEAP32[$3>>2]|0;
 $5 = ((($0)) + 12|0);
 $6 = HEAP32[$5>>2]|0;
 $7 = ((($0)) + 16|0);
 $8 = HEAP32[$7>>2]|0;
 $9 = ((($0)) + 20|0);
 $10 = HEAP32[$9>>2]|0;
 $11 = ___async_retval;
 $AsyncRetVal = HEAP32[$11>>2]|0;
 $16 = Math_imul($AsyncRetVal, $2)|0;
 $17 = ($4|0)<($16|0);
 if (!($17)) {
  return;
 }
 $ReallocAsyncCtx6 = (_emscripten_realloc_async_context(20)|0);
 (__ZN4mbed6Stream4putcEi($6,32)|0);
 $IsAsync17 = ___async;
 if (!($IsAsync17)) {
  ___async_unwind = 0;
 }
 HEAP32[$ReallocAsyncCtx6>>2] = 147;
 $12 = ((($ReallocAsyncCtx6)) + 4|0);
 HEAP32[$12>>2] = $4;
 $13 = ((($ReallocAsyncCtx6)) + 8|0);
 HEAP32[$13>>2] = $8;
 $14 = ((($ReallocAsyncCtx6)) + 12|0);
 HEAP32[$14>>2] = $10;
 $15 = ((($ReallocAsyncCtx6)) + 16|0);
 HEAP32[$15>>2] = $6;
 sp = STACKTOP;
 return;
}
function __ZN11TextDisplay3clsEv__async_cb_22($0) {
 $0 = $0|0;
 var $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $IsAsync10 = 0, $ReallocAsyncCtx4 = 0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 $1 = ((($0)) + 4|0);
 $2 = HEAP32[$1>>2]|0;
 $3 = ((($0)) + 8|0);
 $4 = HEAP32[$3>>2]|0;
 $5 = ((($0)) + 12|0);
 $6 = HEAP32[$5>>2]|0;
 $7 = ((($0)) + 16|0);
 $8 = HEAP32[$7>>2]|0;
 $9 = (($2) + 1)|0;
 $10 = HEAP32[$4>>2]|0;
 $11 = ((($10)) + 96|0);
 $12 = HEAP32[$11>>2]|0;
 $ReallocAsyncCtx4 = (_emscripten_realloc_async_context(20)|0);
 $13 = (FUNCTION_TABLE_ii[$12 & 511]($6)|0);
 $IsAsync10 = ___async;
 if (!($IsAsync10)) {
  $18 = ___async_retval;
  HEAP32[$18>>2] = $13;
  ___async_unwind = 0;
 }
 HEAP32[$ReallocAsyncCtx4>>2] = 148;
 $14 = ((($ReallocAsyncCtx4)) + 4|0);
 HEAP32[$14>>2] = $4;
 $15 = ((($ReallocAsyncCtx4)) + 8|0);
 HEAP32[$15>>2] = $6;
 $16 = ((($ReallocAsyncCtx4)) + 12|0);
 HEAP32[$16>>2] = $9;
 $17 = ((($ReallocAsyncCtx4)) + 16|0);
 HEAP32[$17>>2] = $8;
 sp = STACKTOP;
 return;
}
function __ZN4mbed10FileHandle4sizeEv__async_cb($0) {
 $0 = $0|0;
 var $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $AsyncRetVal = 0, $IsAsync4 = 0, $ReallocAsyncCtx2 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = ((($0)) + 4|0);
 $2 = HEAP32[$1>>2]|0;
 $3 = ((($0)) + 8|0);
 $4 = HEAP32[$3>>2]|0;
 $5 = ___async_retval;
 $AsyncRetVal = HEAP32[$5>>2]|0;
 $6 = ($AsyncRetVal|0)<(0);
 if ($6) {
  $15 = ___async_retval;
  HEAP32[$15>>2] = $AsyncRetVal;
  return;
 }
 $7 = HEAP32[$2>>2]|0;
 $8 = ((($7)) + 16|0);
 $9 = HEAP32[$8>>2]|0;
 $ReallocAsyncCtx2 = (_emscripten_realloc_async_context(16)|0);
 $10 = (FUNCTION_TABLE_iiii[$9 & 255]($4,0,2)|0);
 $IsAsync4 = ___async;
 if (!($IsAsync4)) {
  $14 = ___async_retval;
  HEAP32[$14>>2] = $10;
  ___async_unwind = 0;
 }
 HEAP32[$ReallocAsyncCtx2>>2] = 168;
 $11 = ((($ReallocAsyncCtx2)) + 4|0);
 HEAP32[$11>>2] = $2;
 $12 = ((($ReallocAsyncCtx2)) + 8|0);
 HEAP32[$12>>2] = $4;
 $13 = ((($ReallocAsyncCtx2)) + 12|0);
 HEAP32[$13>>2] = $AsyncRetVal;
 sp = STACKTOP;
 return;
}
function __ZN4mbed10FileHandle4sizeEv__async_cb_23($0) {
 $0 = $0|0;
 var $1 = 0, $10 = 0, $11 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $AsyncRetVal = 0, $IsAsync7 = 0, $ReallocAsyncCtx3 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = ((($0)) + 4|0);
 $2 = HEAP32[$1>>2]|0;
 $3 = ((($0)) + 8|0);
 $4 = HEAP32[$3>>2]|0;
 $5 = ((($0)) + 12|0);
 $6 = HEAP32[$5>>2]|0;
 $7 = ___async_retval;
 $AsyncRetVal = HEAP32[$7>>2]|0;
 $8 = HEAP32[$2>>2]|0;
 $9 = ((($8)) + 16|0);
 $10 = HEAP32[$9>>2]|0;
 $ReallocAsyncCtx3 = (_emscripten_realloc_async_context(8)|0);
 (FUNCTION_TABLE_iiii[$10 & 255]($4,$6,0)|0);
 $IsAsync7 = ___async;
 if (!($IsAsync7)) {
  ___async_unwind = 0;
 }
 HEAP32[$ReallocAsyncCtx3>>2] = 169;
 $11 = ((($ReallocAsyncCtx3)) + 4|0);
 HEAP32[$11>>2] = $AsyncRetVal;
 sp = STACKTOP;
 return;
}
function __ZN4mbed10FileHandle4sizeEv__async_cb_24($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = ((($0)) + 4|0);
 $2 = HEAP32[$1>>2]|0;
 $3 = ___async_retval;
 HEAP32[$3>>2] = $2;
 return;
}
function __ZThn4_N15GraphicsDisplayD1Ev__async_cb($0) {
 $0 = $0|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 return;
}
function ___cxx_global_var_init__async_cb($0) {
 $0 = $0|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 return; //@line 5 "demos/temperature/main.cpp"
}
function __ZL25default_terminate_handlerv__async_cb($0) {
 $0 = $0|0;
 var $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0;
 var $AsyncRetVal = 0, $AsyncRetVal$pre_trunc = 0, $IsAsync15 = 0, $ReallocAsyncCtx2 = 0, $vararg_ptr6 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = ((($0)) + 4|0);
 $2 = HEAP32[$1>>2]|0;
 $3 = ((($0)) + 8|0);
 $4 = HEAP32[$3>>2]|0;
 $5 = ((($0)) + 12|0);
 $6 = HEAP32[$5>>2]|0;
 $7 = ((($0)) + 20|0);
 $8 = HEAP32[$7>>2]|0;
 $9 = ((($0)) + 24|0);
 $10 = HEAP32[$9>>2]|0;
 $11 = ___async_retval;
 $AsyncRetVal$pre_trunc = HEAP8[$11>>0]|0;
 $AsyncRetVal = $AsyncRetVal$pre_trunc&1;
 if (!($AsyncRetVal)) {
  HEAP32[$4>>2] = 8345;
  $vararg_ptr6 = ((($4)) + 4|0);
  HEAP32[$vararg_ptr6>>2] = $6;
  _abort_message(8254,$4);
  // unreachable;
 }
 $12 = HEAP32[$2>>2]|0;
 $13 = HEAP32[$12>>2]|0;
 $14 = ((($13)) + 8|0);
 $15 = HEAP32[$14>>2]|0;
 $ReallocAsyncCtx2 = (_emscripten_realloc_async_context(16)|0);
 $16 = (FUNCTION_TABLE_ii[$15 & 511]($12)|0);
 $IsAsync15 = ___async;
 if (!($IsAsync15)) {
  $20 = ___async_retval;
  HEAP32[$20>>2] = $16;
  ___async_unwind = 0;
 }
 HEAP32[$ReallocAsyncCtx2>>2] = 228;
 $17 = ((($ReallocAsyncCtx2)) + 4|0);
 HEAP32[$17>>2] = $8;
 $18 = ((($ReallocAsyncCtx2)) + 8|0);
 HEAP32[$18>>2] = $6;
 $19 = ((($ReallocAsyncCtx2)) + 12|0);
 HEAP32[$19>>2] = $10;
 sp = STACKTOP;
 return;
}
function __ZL25default_terminate_handlerv__async_cb_25($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $AsyncRetVal = 0, $vararg_ptr1 = 0, $vararg_ptr2 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = ((($0)) + 4|0);
 $2 = HEAP32[$1>>2]|0;
 $3 = ((($0)) + 8|0);
 $4 = HEAP32[$3>>2]|0;
 $5 = ___async_retval;
 $AsyncRetVal = HEAP32[$5>>2]|0;
 HEAP32[$2>>2] = 8345;
 $vararg_ptr1 = ((($2)) + 4|0);
 HEAP32[$vararg_ptr1>>2] = $4;
 $vararg_ptr2 = ((($2)) + 8|0);
 HEAP32[$vararg_ptr2>>2] = $AsyncRetVal;
 _abort_message(8209,$2);
 // unreachable;
}
function __ZN15GraphicsDisplayD0Ev__async_cb($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = ((($0)) + 4|0);
 $2 = HEAP32[$1>>2]|0;
 $3 = __THREW__; __THREW__ = 0;
 $4 = $3&1;
 if ($4) {
  $5 = ___cxa_find_matching_catch_2()|0;
  $6 = tempRet0;
  __ZdlPv($2);
  ___resumeException($5|0);
  // unreachable;
 } else {
  __ZdlPv($2);
  return;
 }
}
function __ZN4mbed10FileHandle6rewindEv__async_cb($0) {
 $0 = $0|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 return;
}
function __GLOBAL__sub_I_arm_hal_timer_cpp__async_cb($0) {
 $0 = $0|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 HEAP32[2224] = (872);
 ;HEAP32[(8912)>>2]=0|0;HEAP32[(8912)+4>>2]=0|0;HEAP32[(8912)+8>>2]=0|0;HEAP32[(8912)+12>>2]=0|0;
 HEAP8[(8928)>>0] = 1;
 return;
}
function _puts__async_cb($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $AsyncRetVal = 0, $phitmp = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = ((($0)) + 4|0);
 $2 = HEAP32[$1>>2]|0;
 $3 = ((($0)) + 8|0);
 $4 = HEAP32[$3>>2]|0;
 $5 = ___async_retval;
 $AsyncRetVal = HEAP32[$5>>2]|0;
 $phitmp = ($AsyncRetVal|0)<(0);
 $6 = $phitmp << 31 >> 31;
 $7 = ($2|0)==(0);
 if (!($7)) {
  ___unlockfile($4);
 }
 $8 = ___async_retval;
 HEAP32[$8>>2] = $6;
 return;
}
function _printf__async_cb($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, $AsyncRetVal = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = ((($0)) + 4|0);
 $2 = HEAP32[$1>>2]|0;
 $3 = ___async_retval;
 $AsyncRetVal = HEAP32[$3>>2]|0;
 $4 = ___async_retval;
 HEAP32[$4>>2] = $AsyncRetVal;
 return;
}
function __ZN4mbed5TimerC2Ev__async_cb($0) {
 $0 = $0|0;
 var $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0;
 var sp = 0;
 sp = STACKTOP;
 $1 = ((($0)) + 4|0);
 $2 = HEAP32[$1>>2]|0;
 $3 = ((($0)) + 8|0);
 $4 = HEAP32[$3>>2]|0;
 $5 = ___async_retval;
 $6 = $5;
 $7 = $6;
 $8 = HEAP32[$7>>2]|0;
 $9 = (($6) + 4)|0;
 $10 = $9;
 $11 = HEAP32[$10>>2]|0;
 $12 = $2;
 $13 = $12;
 HEAP32[$13>>2] = $8;
 $14 = (($12) + 4)|0;
 $15 = $14;
 HEAP32[$15>>2] = $11;
 $16 = $4;
 $17 = $16;
 HEAP32[$17>>2] = 0;
 $18 = (($16) + 4)|0;
 $19 = $18;
 HEAP32[$19>>2] = 0;
 return;
}
function ___overflow__async_cb($0) {
 $0 = $0|0;
 var $$0 = 0, $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $AsyncRetVal = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = ((($0)) + 4|0);
 $2 = HEAP32[$1>>2]|0;
 $3 = ___async_retval;
 $AsyncRetVal = HEAP32[$3>>2]|0;
 $4 = ($AsyncRetVal|0)==(1);
 if ($4) {
  $5 = HEAP8[$2>>0]|0;
  $6 = $5&255;
  $$0 = $6;
 } else {
  $$0 = -1;
 }
 $7 = ___async_retval;
 HEAP32[$7>>2] = $$0;
 return;
}
function __ZN4mbed10FileHandle5lseekEii__async_cb($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $AsyncRetVal = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = ___async_retval;
 $AsyncRetVal = HEAP32[$1>>2]|0;
 $2 = ___async_retval;
 HEAP32[$2>>2] = $AsyncRetVal;
 return;
}
function __ZN4mbed10FileHandle4tellEv__async_cb($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $AsyncRetVal = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = ___async_retval;
 $AsyncRetVal = HEAP32[$1>>2]|0;
 $2 = ___async_retval;
 HEAP32[$2>>2] = $AsyncRetVal;
 return;
}
function __ZN4mbed6Stream6printfEPKcz__async_cb($0) {
 $0 = $0|0;
 var $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $IsAsync13 = 0;
 var $ReallocAsyncCtx5 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = ((($0)) + 4|0);
 $2 = HEAP32[$1>>2]|0;
 $3 = ((($0)) + 8|0);
 $4 = HEAP32[$3>>2]|0;
 $5 = ((($0)) + 12|0);
 $6 = HEAP32[$5>>2]|0;
 $7 = ((($0)) + 16|0);
 $8 = HEAP32[$7>>2]|0;
 $9 = ((($0)) + 20|0);
 $10 = HEAP32[$9>>2]|0;
 $11 = ((($0)) + 24|0);
 $12 = HEAP32[$11>>2]|0;
 HEAP32[$2>>2] = $4;
 _memset(($6|0),0,4096)|0;
 $ReallocAsyncCtx5 = (_emscripten_realloc_async_context(24)|0);
 $13 = (_vsprintf($6,$8,$2)|0);
 $IsAsync13 = ___async;
 if (!($IsAsync13)) {
  $19 = ___async_retval;
  HEAP32[$19>>2] = $13;
  ___async_unwind = 0;
 }
 HEAP32[$ReallocAsyncCtx5>>2] = 190;
 $14 = ((($ReallocAsyncCtx5)) + 4|0);
 HEAP32[$14>>2] = $10;
 $15 = ((($ReallocAsyncCtx5)) + 8|0);
 HEAP32[$15>>2] = $12;
 $16 = ((($ReallocAsyncCtx5)) + 12|0);
 HEAP32[$16>>2] = $6;
 $17 = ((($ReallocAsyncCtx5)) + 16|0);
 HEAP32[$17>>2] = $2;
 $18 = ((($ReallocAsyncCtx5)) + 20|0);
 HEAP32[$18>>2] = $6;
 sp = STACKTOP;
 return;
}
function __ZN4mbed6Stream6printfEPKcz__async_cb_26($0) {
 $0 = $0|0;
 var $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $IsAsync6 = 0, $ReallocAsyncCtx3 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = ((($0)) + 4|0);
 $2 = HEAP32[$1>>2]|0;
 $3 = ((($0)) + 8|0);
 $4 = HEAP32[$3>>2]|0;
 $5 = ((($0)) + 12|0);
 $6 = HEAP32[$5>>2]|0;
 $7 = ((($0)) + 16|0);
 $8 = HEAP32[$7>>2]|0;
 $9 = ((($0)) + 20|0);
 $10 = HEAP32[$9>>2]|0;
 $11 = HEAP32[$2>>2]|0;
 $12 = ((($11)) + 84|0);
 $13 = HEAP32[$12>>2]|0;
 $ReallocAsyncCtx3 = (_emscripten_realloc_async_context(16)|0);
 FUNCTION_TABLE_vi[$13 & 511]($4);
 $IsAsync6 = ___async;
 if (!($IsAsync6)) {
  ___async_unwind = 0;
 }
 HEAP32[$ReallocAsyncCtx3>>2] = 192;
 $14 = ((($ReallocAsyncCtx3)) + 4|0);
 HEAP32[$14>>2] = $6;
 $15 = ((($ReallocAsyncCtx3)) + 8|0);
 HEAP32[$15>>2] = $8;
 $16 = ((($ReallocAsyncCtx3)) + 12|0);
 HEAP32[$16>>2] = $10;
 sp = STACKTOP;
 return;
}
function __ZN4mbed6Stream6printfEPKcz__async_cb_27($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = ((($0)) + 4|0);
 $2 = HEAP32[$1>>2]|0;
 $3 = ((($0)) + 8|0);
 $4 = HEAP32[$3>>2]|0;
 $5 = ((($0)) + 12|0);
 $6 = HEAP32[$5>>2]|0;
 $7 = ___async_retval;
 HEAP32[$7>>2] = $6;
 return;
}
function __ZN4mbed6Stream6printfEPKcz__async_cb_28($0) {
 $0 = $0|0;
 var $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0;
 var $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $IsAsync10 = 0;
 var $IsAsync3 = 0, $ReallocAsyncCtx2 = 0, $ReallocAsyncCtx4 = 0, $exitcond = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = ((($0)) + 4|0);
 $2 = HEAP32[$1>>2]|0;
 $3 = ((($0)) + 8|0);
 $4 = HEAP32[$3>>2]|0;
 $5 = ((($0)) + 12|0);
 $6 = HEAP32[$5>>2]|0;
 $7 = ((($0)) + 16|0);
 $8 = HEAP32[$7>>2]|0;
 $9 = ((($0)) + 20|0);
 $10 = HEAP32[$9>>2]|0;
 $11 = ((($0)) + 24|0);
 $12 = HEAP32[$11>>2]|0;
 $13 = ((($0)) + 28|0);
 $14 = HEAP32[$13>>2]|0;
 $15 = ((($0)) + 32|0);
 $16 = HEAP32[$15>>2]|0;
 $29 = (($2) + 1)|0;
 $exitcond = ($29|0)==($4|0);
 if (!($exitcond)) {
  $25 = HEAP32[$10>>2]|0;
  $26 = ((($25)) + 68|0);
  $27 = HEAP32[$26>>2]|0;
  $28 = (($12) + ($29)|0);
  $30 = HEAP8[$28>>0]|0;
  $31 = $30 << 24 >> 24;
  $ReallocAsyncCtx4 = (_emscripten_realloc_async_context(36)|0);
  (FUNCTION_TABLE_iii[$27 & 255]($8,$31)|0);
  $IsAsync10 = ___async;
  if (!($IsAsync10)) {
   ___async_unwind = 0;
  }
  HEAP32[$ReallocAsyncCtx4>>2] = 193;
  $32 = ((($ReallocAsyncCtx4)) + 4|0);
  HEAP32[$32>>2] = $29;
  $33 = ((($ReallocAsyncCtx4)) + 8|0);
  HEAP32[$33>>2] = $4;
  $34 = ((($ReallocAsyncCtx4)) + 12|0);
  HEAP32[$34>>2] = $6;
  $35 = ((($ReallocAsyncCtx4)) + 16|0);
  HEAP32[$35>>2] = $8;
  $36 = ((($ReallocAsyncCtx4)) + 20|0);
  HEAP32[$36>>2] = $10;
  $37 = ((($ReallocAsyncCtx4)) + 24|0);
  HEAP32[$37>>2] = $12;
  $38 = ((($ReallocAsyncCtx4)) + 28|0);
  HEAP32[$38>>2] = $14;
  $39 = ((($ReallocAsyncCtx4)) + 32|0);
  HEAP32[$39>>2] = $16;
  sp = STACKTOP;
  return;
 }
 $17 = HEAP32[$6>>2]|0;
 $18 = ((($17)) + 76|0);
 $19 = HEAP32[$18>>2]|0;
 $ReallocAsyncCtx2 = (_emscripten_realloc_async_context(24)|0);
 FUNCTION_TABLE_vi[$19 & 511]($8);
 $IsAsync3 = ___async;
 if ($IsAsync3) {
  HEAP32[$ReallocAsyncCtx2>>2] = 191;
  $20 = ((($ReallocAsyncCtx2)) + 4|0);
  HEAP32[$20>>2] = $6;
  $21 = ((($ReallocAsyncCtx2)) + 8|0);
  HEAP32[$21>>2] = $8;
  $22 = ((($ReallocAsyncCtx2)) + 12|0);
  HEAP32[$22>>2] = $14;
  $23 = ((($ReallocAsyncCtx2)) + 16|0);
  HEAP32[$23>>2] = $16;
  $24 = ((($ReallocAsyncCtx2)) + 20|0);
  HEAP32[$24>>2] = $4;
  sp = STACKTOP;
  return;
 }
 ___async_unwind = 0;
 HEAP32[$ReallocAsyncCtx2>>2] = 191;
 $20 = ((($ReallocAsyncCtx2)) + 4|0);
 HEAP32[$20>>2] = $6;
 $21 = ((($ReallocAsyncCtx2)) + 8|0);
 HEAP32[$21>>2] = $8;
 $22 = ((($ReallocAsyncCtx2)) + 12|0);
 HEAP32[$22>>2] = $14;
 $23 = ((($ReallocAsyncCtx2)) + 16|0);
 HEAP32[$23>>2] = $16;
 $24 = ((($ReallocAsyncCtx2)) + 20|0);
 HEAP32[$24>>2] = $4;
 sp = STACKTOP;
 return;
}
function __ZN4mbed6Stream6printfEPKcz__async_cb_29($0) {
 $0 = $0|0;
 var $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0;
 var $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $AsyncRetVal = 0, $IsAsync10 = 0, $IsAsync3 = 0, $ReallocAsyncCtx2 = 0, $ReallocAsyncCtx4 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = ((($0)) + 4|0);
 $2 = HEAP32[$1>>2]|0;
 $3 = ((($0)) + 8|0);
 $4 = HEAP32[$3>>2]|0;
 $5 = ((($0)) + 12|0);
 $6 = HEAP32[$5>>2]|0;
 $7 = ((($0)) + 16|0);
 $8 = HEAP32[$7>>2]|0;
 $9 = ((($0)) + 20|0);
 $10 = HEAP32[$9>>2]|0;
 $11 = ___async_retval;
 $AsyncRetVal = HEAP32[$11>>2]|0;
 $12 = ($AsyncRetVal|0)>(0);
 if (!($12)) {
  $13 = HEAP32[$4>>2]|0;
  $14 = ((($13)) + 76|0);
  $15 = HEAP32[$14>>2]|0;
  $ReallocAsyncCtx2 = (_emscripten_realloc_async_context(24)|0);
  FUNCTION_TABLE_vi[$15 & 511]($2);
  $IsAsync3 = ___async;
  if (!($IsAsync3)) {
   ___async_unwind = 0;
  }
  HEAP32[$ReallocAsyncCtx2>>2] = 191;
  $16 = ((($ReallocAsyncCtx2)) + 4|0);
  HEAP32[$16>>2] = $4;
  $17 = ((($ReallocAsyncCtx2)) + 8|0);
  HEAP32[$17>>2] = $2;
  $18 = ((($ReallocAsyncCtx2)) + 12|0);
  HEAP32[$18>>2] = $6;
  $19 = ((($ReallocAsyncCtx2)) + 16|0);
  HEAP32[$19>>2] = $8;
  $20 = ((($ReallocAsyncCtx2)) + 20|0);
  HEAP32[$20>>2] = $AsyncRetVal;
  sp = STACKTOP;
  return;
 }
 $21 = HEAP32[$2>>2]|0;
 $22 = ((($21)) + 68|0);
 $23 = HEAP32[$22>>2]|0;
 $24 = HEAP8[$10>>0]|0;
 $25 = $24 << 24 >> 24;
 $ReallocAsyncCtx4 = (_emscripten_realloc_async_context(36)|0);
 (FUNCTION_TABLE_iii[$23 & 255]($2,$25)|0);
 $IsAsync10 = ___async;
 if (!($IsAsync10)) {
  ___async_unwind = 0;
 }
 HEAP32[$ReallocAsyncCtx4>>2] = 193;
 $26 = ((($ReallocAsyncCtx4)) + 4|0);
 HEAP32[$26>>2] = 0;
 $27 = ((($ReallocAsyncCtx4)) + 8|0);
 HEAP32[$27>>2] = $AsyncRetVal;
 $28 = ((($ReallocAsyncCtx4)) + 12|0);
 HEAP32[$28>>2] = $4;
 $29 = ((($ReallocAsyncCtx4)) + 16|0);
 HEAP32[$29>>2] = $2;
 $30 = ((($ReallocAsyncCtx4)) + 20|0);
 HEAP32[$30>>2] = $2;
 $31 = ((($ReallocAsyncCtx4)) + 24|0);
 HEAP32[$31>>2] = $10;
 $32 = ((($ReallocAsyncCtx4)) + 28|0);
 HEAP32[$32>>2] = $6;
 $33 = ((($ReallocAsyncCtx4)) + 32|0);
 HEAP32[$33>>2] = $8;
 sp = STACKTOP;
 return;
}
function ___cxa_can_catch__async_cb($0) {
 $0 = $0|0;
 var $1 = 0, $10 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $AsyncRetVal = 0, $AsyncRetVal$pre_trunc = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = ((($0)) + 4|0);
 $2 = HEAP32[$1>>2]|0;
 $3 = ((($0)) + 8|0);
 $4 = HEAP32[$3>>2]|0;
 $5 = ((($0)) + 12|0);
 $6 = HEAP32[$5>>2]|0;
 $7 = ___async_retval;
 $AsyncRetVal$pre_trunc = HEAP8[$7>>0]|0;
 $AsyncRetVal = $AsyncRetVal$pre_trunc&1;
 $8 = $AsyncRetVal&1;
 if ($AsyncRetVal) {
  $9 = HEAP32[$2>>2]|0;
  HEAP32[$4>>2] = $9;
 }
 $10 = ___async_retval;
 HEAP32[$10>>2] = $8;
 return;
}
function _mbed_error_vfprintf__async_cb($0) {
 $0 = $0|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 return;
}
function __Znaj__async_cb($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $AsyncRetVal = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = ___async_retval;
 $AsyncRetVal = HEAP32[$1>>2]|0;
 $2 = ___async_retval;
 HEAP32[$2>>2] = $AsyncRetVal;
 return;
}
function _mbed_die__async_cb($0) {
 $0 = $0|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 return;
}
function _freopen__async_cb($0) {
 $0 = $0|0;
 var $$pre = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0;
 var $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0;
 var $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0;
 var $IsAsync11 = 0, $IsAsync15 = 0, $IsAsync19 = 0, $ReallocAsyncCtx2 = 0, $ReallocAsyncCtx3 = 0, $ReallocAsyncCtx4 = 0, $vararg_ptr1 = 0, $vararg_ptr2 = 0, $vararg_ptr6 = 0, $vararg_ptr7 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = ((($0)) + 4|0);
 $2 = HEAP32[$1>>2]|0;
 $3 = ((($0)) + 8|0);
 $4 = HEAP32[$3>>2]|0;
 $5 = ((($0)) + 12|0);
 $6 = HEAP32[$5>>2]|0;
 $7 = ((($0)) + 16|0);
 $8 = HEAP32[$7>>2]|0;
 $9 = ((($0)) + 20|0);
 $10 = HEAP32[$9>>2]|0;
 $11 = ((($0)) + 24|0);
 $12 = HEAP32[$11>>2]|0;
 $13 = ((($0)) + 28|0);
 $14 = HEAP32[$13>>2]|0;
 $15 = ((($0)) + 32|0);
 $16 = HEAP32[$15>>2]|0;
 $17 = ((($0)) + 36|0);
 $18 = HEAP32[$17>>2]|0;
 $19 = ($6|0)==(0|0);
 if ($19) {
  $20 = $2 & 524288;
  $21 = ($20|0)==(0);
  $$pre = ((($4)) + 60|0);
  if (!($21)) {
   $22 = HEAP32[$$pre>>2]|0;
   HEAP32[$12>>2] = $22;
   $vararg_ptr1 = ((($12)) + 4|0);
   HEAP32[$vararg_ptr1>>2] = 2;
   $vararg_ptr2 = ((($12)) + 8|0);
   HEAP32[$vararg_ptr2>>2] = 1;
   (___syscall221(221,($12|0))|0);
  }
  $23 = $2 & -524481;
  $24 = HEAP32[$$pre>>2]|0;
  HEAP32[$8>>2] = $24;
  $vararg_ptr6 = ((($8)) + 4|0);
  HEAP32[$vararg_ptr6>>2] = 4;
  $vararg_ptr7 = ((($8)) + 8|0);
  HEAP32[$vararg_ptr7>>2] = $23;
  $25 = (___syscall221(221,($8|0))|0);
  $26 = (___syscall_ret($25)|0);
  $27 = ($26|0)<(0);
  if (!($27)) {
   $56 = ($18|0)==(0);
   if (!($56)) {
    ___unlockfile($4);
   }
   $59 = ___async_retval;
   HEAP32[$59>>2] = $4;
   return;
  }
 } else {
  $28 = (_fopen($6,$16)|0);
  $29 = ($28|0)==(0|0);
  if (!($29)) {
   $30 = ((($28)) + 60|0);
   $31 = HEAP32[$30>>2]|0;
   $32 = ((($4)) + 60|0);
   $33 = HEAP32[$32>>2]|0;
   $34 = ($31|0)==($33|0);
   if ($34) {
    HEAP32[$30>>2] = -1;
   } else {
    $35 = $2 & 524288;
    $36 = (___dup3($31,$33,$35)|0);
    $37 = ($36|0)<(0);
    if ($37) {
     $ReallocAsyncCtx3 = (_emscripten_realloc_async_context(8)|0);
     (_fclose($28)|0);
     $IsAsync15 = ___async;
     if (!($IsAsync15)) {
      ___async_unwind = 0;
     }
     HEAP32[$ReallocAsyncCtx3>>2] = 221;
     $57 = ((($ReallocAsyncCtx3)) + 4|0);
     HEAP32[$57>>2] = $4;
     sp = STACKTOP;
     return;
    }
   }
   $38 = HEAP32[$4>>2]|0;
   $39 = $38 & 1;
   $40 = HEAP32[$28>>2]|0;
   $41 = $39 | $40;
   HEAP32[$4>>2] = $41;
   $42 = ((($28)) + 32|0);
   $43 = HEAP32[$42>>2]|0;
   $44 = ((($4)) + 32|0);
   HEAP32[$44>>2] = $43;
   $45 = ((($28)) + 36|0);
   $46 = HEAP32[$45>>2]|0;
   $47 = ((($4)) + 36|0);
   HEAP32[$47>>2] = $46;
   $48 = ((($28)) + 40|0);
   $49 = HEAP32[$48>>2]|0;
   $50 = ((($4)) + 40|0);
   HEAP32[$50>>2] = $49;
   $51 = ((($28)) + 12|0);
   $52 = HEAP32[$51>>2]|0;
   $53 = ((($4)) + 12|0);
   HEAP32[$53>>2] = $52;
   $ReallocAsyncCtx4 = (_emscripten_realloc_async_context(12)|0);
   (_fclose($28)|0);
   $IsAsync19 = ___async;
   if (!($IsAsync19)) {
    ___async_unwind = 0;
   }
   HEAP32[$ReallocAsyncCtx4>>2] = 220;
   $54 = ((($ReallocAsyncCtx4)) + 4|0);
   HEAP32[$54>>2] = $18;
   $55 = ((($ReallocAsyncCtx4)) + 8|0);
   HEAP32[$55>>2] = $4;
   sp = STACKTOP;
   return;
  }
 }
 $ReallocAsyncCtx2 = (_emscripten_realloc_async_context(8)|0);
 (_fclose($4)|0);
 $IsAsync11 = ___async;
 if (!($IsAsync11)) {
  ___async_unwind = 0;
 }
 HEAP32[$ReallocAsyncCtx2>>2] = 222;
 $58 = ((($ReallocAsyncCtx2)) + 4|0);
 HEAP32[$58>>2] = $4;
 sp = STACKTOP;
 return;
}
function _freopen__async_cb_30($0) {
 $0 = $0|0;
 var $1 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = ___async_retval;
 HEAP32[$1>>2] = 0;
 return;
}
function _freopen__async_cb_31($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $IsAsync11 = 0, $ReallocAsyncCtx2 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = ((($0)) + 4|0);
 $2 = HEAP32[$1>>2]|0;
 $ReallocAsyncCtx2 = (_emscripten_realloc_async_context(8)|0);
 (_fclose($2)|0);
 $IsAsync11 = ___async;
 if (!($IsAsync11)) {
  ___async_unwind = 0;
 }
 HEAP32[$ReallocAsyncCtx2>>2] = 222;
 $3 = ((($ReallocAsyncCtx2)) + 4|0);
 HEAP32[$3>>2] = $2;
 sp = STACKTOP;
 return;
}
function _freopen__async_cb_32($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = ((($0)) + 4|0);
 $2 = HEAP32[$1>>2]|0;
 $3 = ((($0)) + 8|0);
 $4 = HEAP32[$3>>2]|0;
 $5 = ($2|0)==(0);
 if (!($5)) {
  ___unlockfile($4);
 }
 $6 = ___async_retval;
 HEAP32[$6>>2] = $4;
 return;
}
function __ZN6C12832D0Ev__async_cb($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = ((($0)) + 4|0);
 $2 = HEAP32[$1>>2]|0;
 $3 = __THREW__; __THREW__ = 0;
 $4 = $3&1;
 if ($4) {
  $5 = ___cxa_find_matching_catch_2()|0;
  $6 = tempRet0;
  __ZdlPv($2);
  ___resumeException($5|0);
  // unreachable;
 } else {
  __ZdlPv($2);
  return;
 }
}
function __ZN6C12832C2E7PinNameS0_S0_S0_S0_PKc__async_cb($0) {
 $0 = $0|0;
 var $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0;
 var $9 = 0, $IsAsync8 = 0, $ReallocAsyncCtx3 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = ((($0)) + 4|0);
 $2 = HEAP32[$1>>2]|0;
 $3 = ((($0)) + 8|0);
 $4 = HEAP32[$3>>2]|0;
 $5 = ((($0)) + 12|0);
 $6 = HEAP32[$5>>2]|0;
 $7 = ((($0)) + 16|0);
 $8 = HEAP32[$7>>2]|0;
 $9 = ((($0)) + 20|0);
 $10 = HEAP32[$9>>2]|0;
 $11 = __THREW__; __THREW__ = 0;
 $12 = $11&1;
 if (!($12)) {
  $13 = ((($2)) + 48|0);
  HEAP32[$13>>2] = 2050;
  $14 = HEAP32[$4>>2]|0;
  $15 = HEAP32[$6>>2]|0;
  $16 = HEAP32[$8>>2]|0;
  $17 = _emscripten_asm_const_iiiii(0, ($14|0), ($15|0), ($16|0), ($10|0))|0;
  return;
 }
 $18 = ___cxa_find_matching_catch_2()|0;
 $19 = tempRet0;
 __THREW__ = 0;
 $ReallocAsyncCtx3 = (invoke_ii(259,12)|0);
 __ZN4mbed6StreamD2Ev($2);
 $IsAsync8 = ___async;
 if (!($IsAsync8)) {
  ___async_unwind = 0;
 }
 HEAP32[$ReallocAsyncCtx3>>2] = 117;
 $20 = ((($ReallocAsyncCtx3)) + 4|0);
 HEAP32[$20>>2] = $18;
 $21 = ((($ReallocAsyncCtx3)) + 8|0);
 HEAP32[$21>>2] = $19;
 sp = STACKTOP;
 return;
}
function __ZN6C12832C2E7PinNameS0_S0_S0_S0_PKc__async_cb_33($0) {
 $0 = $0|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 // unreachable;
}
function __ZN6C12832C2E7PinNameS0_S0_S0_S0_PKc__async_cb_34($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = ((($0)) + 4|0);
 $2 = HEAP32[$1>>2]|0;
 $3 = ((($0)) + 8|0);
 $4 = HEAP32[$3>>2]|0;
 $5 = __THREW__; __THREW__ = 0;
 $6 = $5&1;
 if ($6) {
  $7 = ___cxa_find_matching_catch_3(0|0)|0;
  $8 = tempRet0;
  (_emscripten_realloc_async_context(4)|0);
  ___clang_call_terminate($7);
  // unreachable;
 } else {
  ___resumeException($2|0);
  // unreachable;
 }
}
function __ZN6C12832C2E7PinNameS0_S0_S0_S0_PKc__async_cb_35($0) {
 $0 = $0|0;
 var $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $3 = 0, $4 = 0;
 var $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $IsAsync = 0, $ReallocAsyncCtx = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = ((($0)) + 4|0);
 $2 = HEAP32[$1>>2]|0;
 $3 = ((($0)) + 8|0);
 $4 = HEAP32[$3>>2]|0;
 $5 = ((($0)) + 12|0);
 $6 = HEAP32[$5>>2]|0;
 $7 = ((($0)) + 16|0);
 $8 = HEAP32[$7>>2]|0;
 HEAP32[$2>>2] = (376);
 $9 = ((($2)) + 4|0);
 HEAP32[$9>>2] = (536);
 $10 = ((($2)) + 4172|0);
 HEAP32[$10>>2] = $4;
 $11 = ((($2)) + 4176|0);
 HEAP32[$11>>2] = $6;
 $12 = ((($2)) + 4180|0);
 HEAP32[$12>>2] = $8;
 $13 = _emscripten_asm_const_iiii(1, ($4|0), ($6|0), ($8|0))|0;
 $14 = ((($2)) + 56|0);
 HEAP32[$14>>2] = 1;
 $15 = ((($2)) + 52|0);
 HEAP32[$15>>2] = 0;
 $16 = ((($2)) + 60|0);
 HEAP32[$16>>2] = 0;
 $17 = ((($2)) + 68|0);
 _memset(($17|0),0,4096)|0;
 $18 = HEAP32[$2>>2]|0;
 $19 = ((($18)) + 108|0);
 $20 = HEAP32[$19>>2]|0;
 __THREW__ = 0;
 $ReallocAsyncCtx = (invoke_ii(259,24)|0);
 FUNCTION_TABLE_viii[$20 & 255]($2,0,0);
 $IsAsync = ___async;
 if (!($IsAsync)) {
  ___async_unwind = 0;
 }
 HEAP32[$ReallocAsyncCtx>>2] = 116;
 $21 = ((($ReallocAsyncCtx)) + 4|0);
 HEAP32[$21>>2] = $2;
 $22 = ((($ReallocAsyncCtx)) + 8|0);
 HEAP32[$22>>2] = $10;
 $23 = ((($ReallocAsyncCtx)) + 12|0);
 HEAP32[$23>>2] = $11;
 $24 = ((($ReallocAsyncCtx)) + 16|0);
 HEAP32[$24>>2] = $12;
 $25 = ((($ReallocAsyncCtx)) + 20|0);
 HEAP32[$25>>2] = $17;
 sp = STACKTOP;
 return;
}
function __ZN15GraphicsDisplay4putpEi__async_cb($0) {
 $0 = $0|0;
 var $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 $1 = ((($0)) + 4|0);
 $2 = HEAP32[$1>>2]|0;
 $3 = ((($0)) + 8|0);
 $4 = HEAP32[$3>>2]|0;
 $5 = ((($0)) + 12|0);
 $6 = HEAP32[$5>>2]|0;
 $7 = HEAP16[$2>>1]|0;
 $8 = (($7) + 1)<<16>>16;
 HEAP16[$2>>1] = $8;
 $9 = ((($4)) + 42|0);
 $10 = HEAP16[$9>>1]|0;
 $11 = ($8<<16>>16)>($10<<16>>16);
 if (!($11)) {
  return;
 }
 $12 = ((($4)) + 40|0);
 $13 = HEAP16[$12>>1]|0;
 HEAP16[$2>>1] = $13;
 $14 = HEAP16[$6>>1]|0;
 $15 = (($14) + 1)<<16>>16;
 HEAP16[$6>>1] = $15;
 $16 = ((($4)) + 46|0);
 $17 = HEAP16[$16>>1]|0;
 $18 = ($15<<16>>16)>($17<<16>>16);
 if (!($18)) {
  return;
 }
 $19 = ((($4)) + 44|0);
 $20 = HEAP16[$19>>1]|0;
 HEAP16[$6>>1] = $20;
 return;
}
function __ZNK10__cxxabiv120__si_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb($0) {
 $0 = $0|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 return;
}
function ___cxa_is_pointer_type__async_cb($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $AsyncRetVal = 0, $phitmp = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = ___async_retval;
 $AsyncRetVal = HEAP32[$1>>2]|0;
 $phitmp = ($AsyncRetVal|0)!=(0|0);
 $2 = $phitmp&1;
 $3 = ___async_retval;
 HEAP32[$3>>2] = $2;
 return;
}
function _vsprintf__async_cb($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $AsyncRetVal = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = ___async_retval;
 $AsyncRetVal = HEAP32[$1>>2]|0;
 $2 = ___async_retval;
 HEAP32[$2>>2] = $AsyncRetVal;
 return;
}
function _abort_message__async_cb($0) {
 $0 = $0|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 _abort();
 // unreachable;
}
function _abort_message__async_cb_36($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $IsAsync = 0, $ReallocAsyncCtx = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = ((($0)) + 4|0);
 $2 = HEAP32[$1>>2]|0;
 $ReallocAsyncCtx = (_emscripten_realloc_async_context(4)|0);
 (_fputc(10,$2)|0);
 $IsAsync = ___async;
 if (!($IsAsync)) {
  ___async_unwind = 0;
 }
 HEAP32[$ReallocAsyncCtx>>2] = 231;
 sp = STACKTOP;
 return;
}
function __ZN15GraphicsDisplay4blitEiiiiPKi__async_cb($0) {
 $0 = $0|0;
 var $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $IsAsync4 = 0;
 var $ReallocAsyncCtx2 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = ((($0)) + 4|0);
 $2 = HEAP32[$1>>2]|0;
 $3 = ((($0)) + 8|0);
 $4 = HEAP32[$3>>2]|0;
 $5 = ((($0)) + 12|0);
 $6 = HEAP32[$5>>2]|0;
 $7 = ((($0)) + 16|0);
 $8 = HEAP32[$7>>2]|0;
 $9 = Math_imul($2, $4)|0;
 $10 = ($9|0)>(0);
 if (!($10)) {
  return;
 }
 $11 = HEAP32[$6>>2]|0;
 $12 = ((($11)) + 136|0);
 $13 = HEAP32[$12>>2]|0;
 $14 = HEAP32[$8>>2]|0;
 $ReallocAsyncCtx2 = (_emscripten_realloc_async_context(24)|0);
 FUNCTION_TABLE_vii[$13 & 255]($6,$14);
 $IsAsync4 = ___async;
 if (!($IsAsync4)) {
  ___async_unwind = 0;
 }
 HEAP32[$ReallocAsyncCtx2>>2] = 129;
 $15 = ((($ReallocAsyncCtx2)) + 4|0);
 HEAP32[$15>>2] = 0;
 $16 = ((($ReallocAsyncCtx2)) + 8|0);
 HEAP32[$16>>2] = $9;
 $17 = ((($ReallocAsyncCtx2)) + 12|0);
 HEAP32[$17>>2] = $6;
 $18 = ((($ReallocAsyncCtx2)) + 16|0);
 HEAP32[$18>>2] = $8;
 $19 = ((($ReallocAsyncCtx2)) + 20|0);
 HEAP32[$19>>2] = $6;
 sp = STACKTOP;
 return;
}
function __ZN15GraphicsDisplay4blitEiiiiPKi__async_cb_37($0) {
 $0 = $0|0;
 var $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0;
 var $9 = 0, $IsAsync4 = 0, $ReallocAsyncCtx2 = 0, $exitcond = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = ((($0)) + 4|0);
 $2 = HEAP32[$1>>2]|0;
 $3 = ((($0)) + 8|0);
 $4 = HEAP32[$3>>2]|0;
 $5 = ((($0)) + 12|0);
 $6 = HEAP32[$5>>2]|0;
 $7 = ((($0)) + 16|0);
 $8 = HEAP32[$7>>2]|0;
 $9 = ((($0)) + 20|0);
 $10 = HEAP32[$9>>2]|0;
 $15 = (($2) + 1)|0;
 $exitcond = ($15|0)==($4|0);
 if ($exitcond) {
  return;
 }
 $11 = HEAP32[$6>>2]|0;
 $12 = ((($11)) + 136|0);
 $13 = HEAP32[$12>>2]|0;
 $14 = (($8) + ($15<<2)|0);
 $16 = HEAP32[$14>>2]|0;
 $ReallocAsyncCtx2 = (_emscripten_realloc_async_context(24)|0);
 FUNCTION_TABLE_vii[$13 & 255]($10,$16);
 $IsAsync4 = ___async;
 if (!($IsAsync4)) {
  ___async_unwind = 0;
 }
 HEAP32[$ReallocAsyncCtx2>>2] = 129;
 $17 = ((($ReallocAsyncCtx2)) + 4|0);
 HEAP32[$17>>2] = $15;
 $18 = ((($ReallocAsyncCtx2)) + 8|0);
 HEAP32[$18>>2] = $4;
 $19 = ((($ReallocAsyncCtx2)) + 12|0);
 HEAP32[$19>>2] = $6;
 $20 = ((($ReallocAsyncCtx2)) + 16|0);
 HEAP32[$20>>2] = $8;
 $21 = ((($ReallocAsyncCtx2)) + 20|0);
 HEAP32[$21>>2] = $10;
 sp = STACKTOP;
 return;
}
function _vsnprintf__async_cb($0) {
 $0 = $0|0;
 var $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $AsyncRetVal = 0, label = 0;
 var sp = 0;
 sp = STACKTOP;
 $1 = ((($0)) + 4|0);
 $2 = HEAP32[$1>>2]|0;
 $3 = ((($0)) + 8|0);
 $4 = HEAP32[$3>>2]|0;
 $5 = ((($0)) + 12|0);
 $6 = HEAP32[$5>>2]|0;
 $7 = ((($0)) + 16|0);
 $8 = HEAP32[$7>>2]|0;
 $9 = ((($0)) + 20|0);
 $10 = HEAP32[$9>>2]|0;
 $11 = ___async_retval;
 $AsyncRetVal = HEAP32[$11>>2]|0;
 $12 = ($2|0)==(0);
 if (!($12)) {
  $13 = HEAP32[$8>>2]|0;
  $14 = HEAP32[$10>>2]|0;
  $15 = ($13|0)==($14|0);
  $16 = $15 << 31 >> 31;
  $17 = (($13) + ($16)|0);
  HEAP8[$17>>0] = 0;
 }
 $18 = ___async_retval;
 HEAP32[$18>>2] = $AsyncRetVal;
 return;
}
function _error__async_cb($0) {
 $0 = $0|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 // unreachable;
}
function _error__async_cb_38($0) {
 $0 = $0|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 (_emscripten_realloc_async_context(4)|0);
 _exit(1);
 // unreachable;
}
function __ZN11TextDisplay5claimEP8_IO_FILE__async_cb($0) {
 $0 = $0|0;
 var $$expand_i1_val = 0, $1 = 0, $2 = 0, $3 = 0, $4 = 0, $AsyncRetVal = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = ((($0)) + 4|0);
 $2 = HEAP32[$1>>2]|0;
 $3 = ___async_retval;
 $AsyncRetVal = HEAP32[$3>>2]|0;
 (_setvbuf($2,0,1,$AsyncRetVal)|0);
 $4 = ___async_retval;
 $$expand_i1_val = 1;
 HEAP8[$4>>0] = $$expand_i1_val;
 return;
}
function __ZN11TextDisplay5claimEP8_IO_FILE__async_cb_39($0) {
 $0 = $0|0;
 var $$expand_i1_val = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $AsyncRetVal = 0, $IsAsync = 0, $ReallocAsyncCtx = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = ((($0)) + 4|0);
 $2 = HEAP32[$1>>2]|0;
 $3 = ___async_retval;
 $AsyncRetVal = HEAP32[$3>>2]|0;
 $4 = ($AsyncRetVal|0)==(0|0);
 if ($4) {
  $12 = ___async_retval;
  $$expand_i1_val = 0;
  HEAP8[$12>>0] = $$expand_i1_val;
  return;
 }
 $5 = HEAP32[373]|0;
 $6 = HEAP32[$2>>2]|0;
 $7 = ((($6)) + 96|0);
 $8 = HEAP32[$7>>2]|0;
 $ReallocAsyncCtx = (_emscripten_realloc_async_context(8)|0);
 $9 = (FUNCTION_TABLE_ii[$8 & 511]($2)|0);
 $IsAsync = ___async;
 if ($IsAsync) {
  HEAP32[$ReallocAsyncCtx>>2] = 143;
  $10 = ((($ReallocAsyncCtx)) + 4|0);
  HEAP32[$10>>2] = $5;
  sp = STACKTOP;
  return;
 }
 $11 = ___async_retval;
 HEAP32[$11>>2] = $9;
 ___async_unwind = 0;
 HEAP32[$ReallocAsyncCtx>>2] = 143;
 $10 = ((($ReallocAsyncCtx)) + 4|0);
 HEAP32[$10>>2] = $5;
 sp = STACKTOP;
 return;
}
function __ZN15GraphicsDisplay4fillEiiiii__async_cb($0) {
 $0 = $0|0;
 var $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $IsAsync4 = 0, $ReallocAsyncCtx2 = 0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 $1 = ((($0)) + 4|0);
 $2 = HEAP32[$1>>2]|0;
 $3 = ((($0)) + 8|0);
 $4 = HEAP32[$3>>2]|0;
 $5 = ((($0)) + 12|0);
 $6 = HEAP32[$5>>2]|0;
 $7 = ((($0)) + 16|0);
 $8 = HEAP32[$7>>2]|0;
 $9 = Math_imul($2, $4)|0;
 $10 = ($9|0)>(0);
 if (!($10)) {
  return;
 }
 $11 = HEAP32[$6>>2]|0;
 $12 = ((($11)) + 136|0);
 $13 = HEAP32[$12>>2]|0;
 $ReallocAsyncCtx2 = (_emscripten_realloc_async_context(24)|0);
 FUNCTION_TABLE_vii[$13 & 255]($6,$8);
 $IsAsync4 = ___async;
 if (!($IsAsync4)) {
  ___async_unwind = 0;
 }
 HEAP32[$ReallocAsyncCtx2>>2] = 127;
 $14 = ((($ReallocAsyncCtx2)) + 4|0);
 HEAP32[$14>>2] = 0;
 $15 = ((($ReallocAsyncCtx2)) + 8|0);
 HEAP32[$15>>2] = $9;
 $16 = ((($ReallocAsyncCtx2)) + 12|0);
 HEAP32[$16>>2] = $6;
 $17 = ((($ReallocAsyncCtx2)) + 16|0);
 HEAP32[$17>>2] = $6;
 $18 = ((($ReallocAsyncCtx2)) + 20|0);
 HEAP32[$18>>2] = $8;
 sp = STACKTOP;
 return;
}
function __ZN15GraphicsDisplay4fillEiiiii__async_cb_40($0) {
 $0 = $0|0;
 var $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $IsAsync4 = 0;
 var $ReallocAsyncCtx2 = 0, $exitcond = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = ((($0)) + 4|0);
 $2 = HEAP32[$1>>2]|0;
 $3 = ((($0)) + 8|0);
 $4 = HEAP32[$3>>2]|0;
 $5 = ((($0)) + 12|0);
 $6 = HEAP32[$5>>2]|0;
 $7 = ((($0)) + 16|0);
 $8 = HEAP32[$7>>2]|0;
 $9 = ((($0)) + 20|0);
 $10 = HEAP32[$9>>2]|0;
 $15 = (($2) + 1)|0;
 $exitcond = ($15|0)==($4|0);
 if ($exitcond) {
  return;
 }
 $11 = HEAP32[$6>>2]|0;
 $12 = ((($11)) + 136|0);
 $13 = HEAP32[$12>>2]|0;
 $ReallocAsyncCtx2 = (_emscripten_realloc_async_context(24)|0);
 FUNCTION_TABLE_vii[$13 & 255]($8,$10);
 $IsAsync4 = ___async;
 if (!($IsAsync4)) {
  ___async_unwind = 0;
 }
 HEAP32[$ReallocAsyncCtx2>>2] = 127;
 $14 = ((($ReallocAsyncCtx2)) + 4|0);
 HEAP32[$14>>2] = $15;
 $16 = ((($ReallocAsyncCtx2)) + 8|0);
 HEAP32[$16>>2] = $4;
 $17 = ((($ReallocAsyncCtx2)) + 12|0);
 HEAP32[$17>>2] = $6;
 $18 = ((($ReallocAsyncCtx2)) + 16|0);
 HEAP32[$18>>2] = $8;
 $19 = ((($ReallocAsyncCtx2)) + 20|0);
 HEAP32[$19>>2] = $10;
 sp = STACKTOP;
 return;
}
function __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb($0) {
 $0 = $0|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 return;
}
function _invoke_timeout__async_cb($0) {
 $0 = $0|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 return;
}
function _exit__async_cb($0) {
 $0 = $0|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 while(1) {
 }
}
function ___clang_call_terminate__async_cb($0) {
 $0 = $0|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 // unreachable;
}
function __ZN4mbed7TimeoutD0Ev__async_cb($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = ((($0)) + 4|0);
 $2 = HEAP32[$1>>2]|0;
 $3 = __THREW__; __THREW__ = 0;
 $4 = $3&1;
 if ($4) {
  $5 = ___cxa_find_matching_catch_2()|0;
  $6 = tempRet0;
  __ZdlPv($2);
  ___resumeException($5|0);
  // unreachable;
 } else {
  __ZdlPv($2);
  return;
 }
}
function __ZN6C128329characterEiii__async_cb($0) {
 $0 = $0|0;
 var $$pre = 0, $1 = 0, $10 = 0, $100 = 0, $101 = 0, $102 = 0, $103 = 0, $104 = 0, $105 = 0, $106 = 0, $107 = 0, $108 = 0, $109 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0;
 var $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0;
 var $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0;
 var $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0, $67 = 0, $68 = 0, $69 = 0, $7 = 0, $70 = 0, $71 = 0;
 var $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $78 = 0, $79 = 0, $8 = 0, $80 = 0, $81 = 0, $82 = 0, $83 = 0, $84 = 0, $85 = 0, $86 = 0, $87 = 0, $88 = 0, $89 = 0, $9 = 0;
 var $90 = 0, $91 = 0, $92 = 0, $93 = 0, $94 = 0, $95 = 0, $96 = 0, $97 = 0, $98 = 0, $99 = 0, $AsyncRetVal = 0, $IsAsync12 = 0, $IsAsync4 = 0, $IsAsync8 = 0, $ReallocAsyncCtx2 = 0, $ReallocAsyncCtx3 = 0, $ReallocAsyncCtx4 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = ((($0)) + 4|0);
 $2 = HEAP32[$1>>2]|0;
 $3 = ((($0)) + 8|0);
 $4 = HEAP32[$3>>2]|0;
 $5 = ((($0)) + 12|0);
 $6 = HEAP32[$5>>2]|0;
 $7 = ((($0)) + 16|0);
 $8 = HEAP32[$7>>2]|0;
 $9 = ((($0)) + 20|0);
 $10 = HEAP32[$9>>2]|0;
 $11 = ((($0)) + 24|0);
 $12 = HEAP32[$11>>2]|0;
 $13 = ((($0)) + 28|0);
 $14 = HEAP32[$13>>2]|0;
 $15 = ((($0)) + 32|0);
 $16 = HEAP8[$15>>0]|0;
 $17 = ((($0)) + 36|0);
 $18 = HEAP32[$17>>2]|0;
 $19 = ((($0)) + 40|0);
 $20 = HEAP32[$19>>2]|0;
 $21 = ((($0)) + 44|0);
 $22 = HEAP32[$21>>2]|0;
 $23 = ((($0)) + 48|0);
 $24 = HEAP8[$23>>0]|0;
 $25 = ((($0)) + 52|0);
 $26 = HEAP32[$25>>2]|0;
 $27 = ((($0)) + 56|0);
 $28 = HEAP32[$27>>2]|0;
 $29 = ___async_retval;
 $AsyncRetVal = HEAP32[$29>>2]|0;
 $30 = ($6>>>0)>($AsyncRetVal>>>0);
 if ($30) {
  HEAP32[$8>>2] = 0;
  $31 = ((($18)) + 64|0);
  $32 = HEAP32[$31>>2]|0;
  $33 = (($32) + ($2))|0;
  HEAP32[$31>>2] = $33;
  $34 = HEAP32[$20>>2]|0;
  $35 = ((($34)) + 128|0);
  $36 = HEAP32[$35>>2]|0;
  $ReallocAsyncCtx2 = (_emscripten_realloc_async_context(60)|0);
  $37 = (FUNCTION_TABLE_ii[$36 & 511]($18)|0);
  $IsAsync4 = ___async;
  if ($IsAsync4) {
   HEAP32[$ReallocAsyncCtx2>>2] = 108;
   $38 = ((($ReallocAsyncCtx2)) + 4|0);
   HEAP32[$38>>2] = $10;
   $39 = ((($ReallocAsyncCtx2)) + 8|0);
   HEAP32[$39>>2] = $33;
   $40 = ((($ReallocAsyncCtx2)) + 12|0);
   HEAP32[$40>>2] = $12;
   $41 = ((($ReallocAsyncCtx2)) + 16|0);
   HEAP32[$41>>2] = $14;
   $42 = ((($ReallocAsyncCtx2)) + 20|0);
   HEAP8[$42>>0] = $16;
   $43 = ((($ReallocAsyncCtx2)) + 24|0);
   HEAP32[$43>>2] = $31;
   $44 = ((($ReallocAsyncCtx2)) + 28|0);
   HEAP32[$44>>2] = $8;
   $45 = ((($ReallocAsyncCtx2)) + 32|0);
   HEAP8[$45>>0] = $24;
   $46 = ((($ReallocAsyncCtx2)) + 36|0);
   HEAP32[$46>>2] = $18;
   $47 = ((($ReallocAsyncCtx2)) + 40|0);
   HEAP32[$47>>2] = $22;
   $48 = ((($ReallocAsyncCtx2)) + 44|0);
   HEAP32[$48>>2] = $26;
   $49 = ((($ReallocAsyncCtx2)) + 48|0);
   HEAP32[$49>>2] = $28;
   $50 = ((($ReallocAsyncCtx2)) + 52|0);
   HEAP32[$50>>2] = $4;
   $51 = ((($ReallocAsyncCtx2)) + 56|0);
   HEAP32[$51>>2] = $2;
   sp = STACKTOP;
   return;
  }
  $52 = ___async_retval;
  HEAP32[$52>>2] = $37;
  ___async_unwind = 0;
  HEAP32[$ReallocAsyncCtx2>>2] = 108;
  $38 = ((($ReallocAsyncCtx2)) + 4|0);
  HEAP32[$38>>2] = $10;
  $39 = ((($ReallocAsyncCtx2)) + 8|0);
  HEAP32[$39>>2] = $33;
  $40 = ((($ReallocAsyncCtx2)) + 12|0);
  HEAP32[$40>>2] = $12;
  $41 = ((($ReallocAsyncCtx2)) + 16|0);
  HEAP32[$41>>2] = $14;
  $42 = ((($ReallocAsyncCtx2)) + 20|0);
  HEAP8[$42>>0] = $16;
  $43 = ((($ReallocAsyncCtx2)) + 24|0);
  HEAP32[$43>>2] = $31;
  $44 = ((($ReallocAsyncCtx2)) + 28|0);
  HEAP32[$44>>2] = $8;
  $45 = ((($ReallocAsyncCtx2)) + 32|0);
  HEAP8[$45>>0] = $24;
  $46 = ((($ReallocAsyncCtx2)) + 36|0);
  HEAP32[$46>>2] = $18;
  $47 = ((($ReallocAsyncCtx2)) + 40|0);
  HEAP32[$47>>2] = $22;
  $48 = ((($ReallocAsyncCtx2)) + 44|0);
  HEAP32[$48>>2] = $26;
  $49 = ((($ReallocAsyncCtx2)) + 48|0);
  HEAP32[$49>>2] = $28;
  $50 = ((($ReallocAsyncCtx2)) + 52|0);
  HEAP32[$50>>2] = $4;
  $51 = ((($ReallocAsyncCtx2)) + 56|0);
  HEAP32[$51>>2] = $2;
  sp = STACKTOP;
  return;
 }
 $$pre = HEAP32[$10>>2]|0;
 $53 = (($12) + -32)|0;
 $54 = Math_imul($14, $53)|0;
 $55 = (($54) + 4)|0;
 $56 = (($$pre) + ($55)|0);
 $57 = HEAP8[$56>>0]|0;
 $58 = ($16<<24>>24)==(0);
 if (!($58)) {
  $59 = ($24<<24>>24)==(0);
  if (!($59)) {
   $60 = 0 >>> 3;
   $61 = $60 & 31;
   $62 = (($61) + 1)|0;
   $63 = 0 & 7;
   $64 = 1 << $63;
   $65 = (0 + ($22))|0;
   $66 = 0;
   $67 = (($62) + ($66))|0;
   $68 = (($56) + ($67)|0);
   $69 = HEAP8[$68>>0]|0;
   $70 = $69&255;
   $71 = $70 & $64;
   $72 = ($71|0)==(0);
   $73 = HEAP32[$18>>2]|0;
   $74 = ((($73)) + 120|0);
   $75 = HEAP32[$74>>2]|0;
   $76 = (0 + ($28))|0;
   if ($72) {
    $ReallocAsyncCtx4 = (_emscripten_realloc_async_context(64)|0);
    FUNCTION_TABLE_viiii[$75 & 127]($18,$76,$65,0);
    $IsAsync12 = ___async;
    if ($IsAsync12) {
     HEAP32[$ReallocAsyncCtx4>>2] = 110;
     $92 = ((($ReallocAsyncCtx4)) + 4|0);
     HEAP32[$92>>2] = 0;
     $93 = ((($ReallocAsyncCtx4)) + 8|0);
     HEAP32[$93>>2] = $4;
     $94 = ((($ReallocAsyncCtx4)) + 12|0);
     HEAP32[$94>>2] = 0;
     $95 = ((($ReallocAsyncCtx4)) + 16|0);
     HEAP32[$95>>2] = $2;
     $96 = ((($ReallocAsyncCtx4)) + 20|0);
     HEAP32[$96>>2] = $26;
     $97 = ((($ReallocAsyncCtx4)) + 24|0);
     HEAP32[$97>>2] = $62;
     $98 = ((($ReallocAsyncCtx4)) + 28|0);
     HEAP32[$98>>2] = $56;
     $99 = ((($ReallocAsyncCtx4)) + 32|0);
     HEAP32[$99>>2] = $64;
     $100 = ((($ReallocAsyncCtx4)) + 36|0);
     HEAP32[$100>>2] = $18;
     $101 = ((($ReallocAsyncCtx4)) + 40|0);
     HEAP32[$101>>2] = $28;
     $102 = ((($ReallocAsyncCtx4)) + 44|0);
     HEAP32[$102>>2] = $18;
     $103 = ((($ReallocAsyncCtx4)) + 48|0);
     HEAP32[$103>>2] = $65;
     $104 = ((($ReallocAsyncCtx4)) + 52|0);
     HEAP8[$104>>0] = $57;
     $105 = ((($ReallocAsyncCtx4)) + 56|0);
     HEAP32[$105>>2] = $8;
     $106 = ((($ReallocAsyncCtx4)) + 60|0);
     HEAP32[$106>>2] = $22;
     sp = STACKTOP;
     return;
    }
    ___async_unwind = 0;
    HEAP32[$ReallocAsyncCtx4>>2] = 110;
    $92 = ((($ReallocAsyncCtx4)) + 4|0);
    HEAP32[$92>>2] = 0;
    $93 = ((($ReallocAsyncCtx4)) + 8|0);
    HEAP32[$93>>2] = $4;
    $94 = ((($ReallocAsyncCtx4)) + 12|0);
    HEAP32[$94>>2] = 0;
    $95 = ((($ReallocAsyncCtx4)) + 16|0);
    HEAP32[$95>>2] = $2;
    $96 = ((($ReallocAsyncCtx4)) + 20|0);
    HEAP32[$96>>2] = $26;
    $97 = ((($ReallocAsyncCtx4)) + 24|0);
    HEAP32[$97>>2] = $62;
    $98 = ((($ReallocAsyncCtx4)) + 28|0);
    HEAP32[$98>>2] = $56;
    $99 = ((($ReallocAsyncCtx4)) + 32|0);
    HEAP32[$99>>2] = $64;
    $100 = ((($ReallocAsyncCtx4)) + 36|0);
    HEAP32[$100>>2] = $18;
    $101 = ((($ReallocAsyncCtx4)) + 40|0);
    HEAP32[$101>>2] = $28;
    $102 = ((($ReallocAsyncCtx4)) + 44|0);
    HEAP32[$102>>2] = $18;
    $103 = ((($ReallocAsyncCtx4)) + 48|0);
    HEAP32[$103>>2] = $65;
    $104 = ((($ReallocAsyncCtx4)) + 52|0);
    HEAP8[$104>>0] = $57;
    $105 = ((($ReallocAsyncCtx4)) + 56|0);
    HEAP32[$105>>2] = $8;
    $106 = ((($ReallocAsyncCtx4)) + 60|0);
    HEAP32[$106>>2] = $22;
    sp = STACKTOP;
    return;
   } else {
    $ReallocAsyncCtx3 = (_emscripten_realloc_async_context(64)|0);
    FUNCTION_TABLE_viiii[$75 & 127]($18,$76,$65,1);
    $IsAsync8 = ___async;
    if ($IsAsync8) {
     HEAP32[$ReallocAsyncCtx3>>2] = 109;
     $77 = ((($ReallocAsyncCtx3)) + 4|0);
     HEAP32[$77>>2] = 0;
     $78 = ((($ReallocAsyncCtx3)) + 8|0);
     HEAP32[$78>>2] = $4;
     $79 = ((($ReallocAsyncCtx3)) + 12|0);
     HEAP32[$79>>2] = 0;
     $80 = ((($ReallocAsyncCtx3)) + 16|0);
     HEAP32[$80>>2] = $2;
     $81 = ((($ReallocAsyncCtx3)) + 20|0);
     HEAP32[$81>>2] = $26;
     $82 = ((($ReallocAsyncCtx3)) + 24|0);
     HEAP32[$82>>2] = $62;
     $83 = ((($ReallocAsyncCtx3)) + 28|0);
     HEAP32[$83>>2] = $56;
     $84 = ((($ReallocAsyncCtx3)) + 32|0);
     HEAP32[$84>>2] = $64;
     $85 = ((($ReallocAsyncCtx3)) + 36|0);
     HEAP32[$85>>2] = $18;
     $86 = ((($ReallocAsyncCtx3)) + 40|0);
     HEAP32[$86>>2] = $28;
     $87 = ((($ReallocAsyncCtx3)) + 44|0);
     HEAP32[$87>>2] = $18;
     $88 = ((($ReallocAsyncCtx3)) + 48|0);
     HEAP32[$88>>2] = $65;
     $89 = ((($ReallocAsyncCtx3)) + 52|0);
     HEAP8[$89>>0] = $57;
     $90 = ((($ReallocAsyncCtx3)) + 56|0);
     HEAP32[$90>>2] = $8;
     $91 = ((($ReallocAsyncCtx3)) + 60|0);
     HEAP32[$91>>2] = $22;
     sp = STACKTOP;
     return;
    }
    ___async_unwind = 0;
    HEAP32[$ReallocAsyncCtx3>>2] = 109;
    $77 = ((($ReallocAsyncCtx3)) + 4|0);
    HEAP32[$77>>2] = 0;
    $78 = ((($ReallocAsyncCtx3)) + 8|0);
    HEAP32[$78>>2] = $4;
    $79 = ((($ReallocAsyncCtx3)) + 12|0);
    HEAP32[$79>>2] = 0;
    $80 = ((($ReallocAsyncCtx3)) + 16|0);
    HEAP32[$80>>2] = $2;
    $81 = ((($ReallocAsyncCtx3)) + 20|0);
    HEAP32[$81>>2] = $26;
    $82 = ((($ReallocAsyncCtx3)) + 24|0);
    HEAP32[$82>>2] = $62;
    $83 = ((($ReallocAsyncCtx3)) + 28|0);
    HEAP32[$83>>2] = $56;
    $84 = ((($ReallocAsyncCtx3)) + 32|0);
    HEAP32[$84>>2] = $64;
    $85 = ((($ReallocAsyncCtx3)) + 36|0);
    HEAP32[$85>>2] = $18;
    $86 = ((($ReallocAsyncCtx3)) + 40|0);
    HEAP32[$86>>2] = $28;
    $87 = ((($ReallocAsyncCtx3)) + 44|0);
    HEAP32[$87>>2] = $18;
    $88 = ((($ReallocAsyncCtx3)) + 48|0);
    HEAP32[$88>>2] = $65;
    $89 = ((($ReallocAsyncCtx3)) + 52|0);
    HEAP8[$89>>0] = $57;
    $90 = ((($ReallocAsyncCtx3)) + 56|0);
    HEAP32[$90>>2] = $8;
    $91 = ((($ReallocAsyncCtx3)) + 60|0);
    HEAP32[$91>>2] = $22;
    sp = STACKTOP;
    return;
   }
  }
 }
 $107 = $57&255;
 $108 = HEAP32[$8>>2]|0;
 $109 = (($108) + ($107))|0;
 HEAP32[$8>>2] = $109;
 return;
}
function __ZN6C128329characterEiii__async_cb_41($0) {
 $0 = $0|0;
 var $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0;
 var $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0;
 var $46 = 0, $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0;
 var $64 = 0, $65 = 0, $66 = 0, $67 = 0, $68 = 0, $69 = 0, $7 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $78 = 0, $79 = 0, $8 = 0, $80 = 0, $81 = 0;
 var $82 = 0, $83 = 0, $84 = 0, $85 = 0, $86 = 0, $87 = 0, $88 = 0, $89 = 0, $9 = 0, $90 = 0, $91 = 0, $92 = 0, $AsyncRetVal = 0, $IsAsync12 = 0, $IsAsync8 = 0, $ReallocAsyncCtx3 = 0, $ReallocAsyncCtx4 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = ((($0)) + 4|0);
 $2 = HEAP32[$1>>2]|0;
 $3 = ((($0)) + 8|0);
 $4 = HEAP32[$3>>2]|0;
 $5 = ((($0)) + 12|0);
 $6 = HEAP32[$5>>2]|0;
 $7 = ((($0)) + 16|0);
 $8 = HEAP32[$7>>2]|0;
 $9 = ((($0)) + 20|0);
 $10 = HEAP8[$9>>0]|0;
 $11 = ((($0)) + 24|0);
 $12 = HEAP32[$11>>2]|0;
 $13 = ((($0)) + 28|0);
 $14 = HEAP32[$13>>2]|0;
 $15 = ((($0)) + 32|0);
 $16 = HEAP8[$15>>0]|0;
 $17 = ((($0)) + 36|0);
 $18 = HEAP32[$17>>2]|0;
 $19 = ((($0)) + 40|0);
 $20 = HEAP32[$19>>2]|0;
 $21 = ((($0)) + 44|0);
 $22 = HEAP32[$21>>2]|0;
 $23 = ((($0)) + 48|0);
 $24 = HEAP32[$23>>2]|0;
 $25 = ((($0)) + 52|0);
 $26 = HEAP32[$25>>2]|0;
 $27 = ((($0)) + 56|0);
 $28 = HEAP32[$27>>2]|0;
 $29 = ___async_retval;
 $AsyncRetVal = HEAP32[$29>>2]|0;
 $30 = HEAP32[$2>>2]|0;
 $31 = ((($30)) + 2|0);
 $32 = HEAP8[$31>>0]|0;
 $33 = $32&255;
 $34 = (($AsyncRetVal) - ($33))|0;
 $35 = ($4>>>0)<($34>>>0);
 if (!($35)) {
  HEAP32[$12>>2] = 0;
 }
 $36 = (($6) + -32)|0;
 $37 = Math_imul($8, $36)|0;
 $38 = (($37) + 4)|0;
 $39 = (($30) + ($38)|0);
 $40 = HEAP8[$39>>0]|0;
 $41 = ($10<<24>>24)==(0);
 if (!($41)) {
  $42 = ($16<<24>>24)==(0);
  if (!($42)) {
   $43 = 0 >>> 3;
   $44 = $43 & 31;
   $45 = (($44) + 1)|0;
   $46 = 0 & 7;
   $47 = 1 << $46;
   $48 = (0 + ($20))|0;
   $49 = 0;
   $50 = (($45) + ($49))|0;
   $51 = (($39) + ($50)|0);
   $52 = HEAP8[$51>>0]|0;
   $53 = $52&255;
   $54 = $53 & $47;
   $55 = ($54|0)==(0);
   $56 = HEAP32[$18>>2]|0;
   $57 = ((($56)) + 120|0);
   $58 = HEAP32[$57>>2]|0;
   $59 = (0 + ($24))|0;
   if ($55) {
    $ReallocAsyncCtx4 = (_emscripten_realloc_async_context(64)|0);
    FUNCTION_TABLE_viiii[$58 & 127]($18,$59,$48,0);
    $IsAsync12 = ___async;
    if (!($IsAsync12)) {
     ___async_unwind = 0;
    }
    HEAP32[$ReallocAsyncCtx4>>2] = 110;
    $75 = ((($ReallocAsyncCtx4)) + 4|0);
    HEAP32[$75>>2] = 0;
    $76 = ((($ReallocAsyncCtx4)) + 8|0);
    HEAP32[$76>>2] = $26;
    $77 = ((($ReallocAsyncCtx4)) + 12|0);
    HEAP32[$77>>2] = 0;
    $78 = ((($ReallocAsyncCtx4)) + 16|0);
    HEAP32[$78>>2] = $28;
    $79 = ((($ReallocAsyncCtx4)) + 20|0);
    HEAP32[$79>>2] = $22;
    $80 = ((($ReallocAsyncCtx4)) + 24|0);
    HEAP32[$80>>2] = $45;
    $81 = ((($ReallocAsyncCtx4)) + 28|0);
    HEAP32[$81>>2] = $39;
    $82 = ((($ReallocAsyncCtx4)) + 32|0);
    HEAP32[$82>>2] = $47;
    $83 = ((($ReallocAsyncCtx4)) + 36|0);
    HEAP32[$83>>2] = $18;
    $84 = ((($ReallocAsyncCtx4)) + 40|0);
    HEAP32[$84>>2] = $24;
    $85 = ((($ReallocAsyncCtx4)) + 44|0);
    HEAP32[$85>>2] = $18;
    $86 = ((($ReallocAsyncCtx4)) + 48|0);
    HEAP32[$86>>2] = $48;
    $87 = ((($ReallocAsyncCtx4)) + 52|0);
    HEAP8[$87>>0] = $40;
    $88 = ((($ReallocAsyncCtx4)) + 56|0);
    HEAP32[$88>>2] = $14;
    $89 = ((($ReallocAsyncCtx4)) + 60|0);
    HEAP32[$89>>2] = $20;
    sp = STACKTOP;
    return;
   } else {
    $ReallocAsyncCtx3 = (_emscripten_realloc_async_context(64)|0);
    FUNCTION_TABLE_viiii[$58 & 127]($18,$59,$48,1);
    $IsAsync8 = ___async;
    if (!($IsAsync8)) {
     ___async_unwind = 0;
    }
    HEAP32[$ReallocAsyncCtx3>>2] = 109;
    $60 = ((($ReallocAsyncCtx3)) + 4|0);
    HEAP32[$60>>2] = 0;
    $61 = ((($ReallocAsyncCtx3)) + 8|0);
    HEAP32[$61>>2] = $26;
    $62 = ((($ReallocAsyncCtx3)) + 12|0);
    HEAP32[$62>>2] = 0;
    $63 = ((($ReallocAsyncCtx3)) + 16|0);
    HEAP32[$63>>2] = $28;
    $64 = ((($ReallocAsyncCtx3)) + 20|0);
    HEAP32[$64>>2] = $22;
    $65 = ((($ReallocAsyncCtx3)) + 24|0);
    HEAP32[$65>>2] = $45;
    $66 = ((($ReallocAsyncCtx3)) + 28|0);
    HEAP32[$66>>2] = $39;
    $67 = ((($ReallocAsyncCtx3)) + 32|0);
    HEAP32[$67>>2] = $47;
    $68 = ((($ReallocAsyncCtx3)) + 36|0);
    HEAP32[$68>>2] = $18;
    $69 = ((($ReallocAsyncCtx3)) + 40|0);
    HEAP32[$69>>2] = $24;
    $70 = ((($ReallocAsyncCtx3)) + 44|0);
    HEAP32[$70>>2] = $18;
    $71 = ((($ReallocAsyncCtx3)) + 48|0);
    HEAP32[$71>>2] = $48;
    $72 = ((($ReallocAsyncCtx3)) + 52|0);
    HEAP8[$72>>0] = $40;
    $73 = ((($ReallocAsyncCtx3)) + 56|0);
    HEAP32[$73>>2] = $14;
    $74 = ((($ReallocAsyncCtx3)) + 60|0);
    HEAP32[$74>>2] = $20;
    sp = STACKTOP;
    return;
   }
  }
 }
 $90 = $40&255;
 $91 = HEAP32[$14>>2]|0;
 $92 = (($91) + ($90))|0;
 HEAP32[$14>>2] = $92;
 return;
}
function __ZN6C128329characterEiii__async_cb_42($0) {
 $0 = $0|0;
 var $$04142$us = 0, $$043$us$reg2mem$0 = 0, $$reg2mem$0 = 0, $$reg2mem17$0 = 0, $$reg2mem21$0 = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0;
 var $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0;
 var $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0;
 var $6 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0, $67 = 0, $68 = 0, $69 = 0, $7 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0;
 var $78 = 0, $79 = 0, $8 = 0, $80 = 0, $81 = 0, $82 = 0, $9 = 0, $IsAsync12 = 0, $IsAsync8 = 0, $ReallocAsyncCtx3 = 0, $ReallocAsyncCtx4 = 0, $exitcond = 0, $exitcond46 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = ((($0)) + 4|0);
 $2 = HEAP32[$1>>2]|0;
 $3 = ((($0)) + 8|0);
 $4 = HEAP32[$3>>2]|0;
 $5 = ((($0)) + 12|0);
 $6 = HEAP32[$5>>2]|0;
 $7 = ((($0)) + 16|0);
 $8 = HEAP32[$7>>2]|0;
 $9 = ((($0)) + 20|0);
 $10 = HEAP32[$9>>2]|0;
 $11 = ((($0)) + 24|0);
 $12 = HEAP32[$11>>2]|0;
 $13 = ((($0)) + 28|0);
 $14 = HEAP32[$13>>2]|0;
 $15 = ((($0)) + 32|0);
 $16 = HEAP32[$15>>2]|0;
 $17 = ((($0)) + 36|0);
 $18 = HEAP32[$17>>2]|0;
 $19 = ((($0)) + 40|0);
 $20 = HEAP32[$19>>2]|0;
 $21 = ((($0)) + 44|0);
 $22 = HEAP32[$21>>2]|0;
 $23 = ((($0)) + 48|0);
 $24 = HEAP32[$23>>2]|0;
 $25 = ((($0)) + 52|0);
 $26 = HEAP8[$25>>0]|0;
 $27 = ((($0)) + 56|0);
 $28 = HEAP32[$27>>2]|0;
 $29 = ((($0)) + 60|0);
 $30 = HEAP32[$29>>2]|0;
 $79 = (($2) + 1)|0;
 $exitcond = ($79|0)==($4|0);
 do {
  if ($exitcond) {
   $32 = (($6) + 1)|0;
   $exitcond46 = ($32|0)==($8|0);
   if (!($exitcond46)) {
    $31 = $32 >>> 3;
    $33 = $31 & 31;
    $34 = (($33) + 1)|0;
    $35 = $32 & 7;
    $36 = 1 << $35;
    $37 = (($32) + ($30))|0;
    $$04142$us = 0;$$043$us$reg2mem$0 = $32;$$reg2mem$0 = $34;$$reg2mem17$0 = $36;$$reg2mem21$0 = $37;
    break;
   }
   $80 = $26&255;
   $81 = HEAP32[$28>>2]|0;
   $82 = (($81) + ($80))|0;
   HEAP32[$28>>2] = $82;
   return;
  } else {
   $$04142$us = $79;$$043$us$reg2mem$0 = $6;$$reg2mem$0 = $12;$$reg2mem17$0 = $16;$$reg2mem21$0 = $24;
  }
 } while(0);
 $38 = Math_imul($$04142$us, $10)|0;
 $39 = (($$reg2mem$0) + ($38))|0;
 $40 = (($14) + ($39)|0);
 $41 = HEAP8[$40>>0]|0;
 $42 = $41&255;
 $43 = $42 & $$reg2mem17$0;
 $44 = ($43|0)==(0);
 $45 = HEAP32[$18>>2]|0;
 $46 = ((($45)) + 120|0);
 $47 = HEAP32[$46>>2]|0;
 $48 = (($$04142$us) + ($20))|0;
 if ($44) {
  $ReallocAsyncCtx4 = (_emscripten_realloc_async_context(64)|0);
  FUNCTION_TABLE_viiii[$47 & 127]($22,$48,$$reg2mem21$0,0);
  $IsAsync12 = ___async;
  if (!($IsAsync12)) {
   ___async_unwind = 0;
  }
  HEAP32[$ReallocAsyncCtx4>>2] = 110;
  $64 = ((($ReallocAsyncCtx4)) + 4|0);
  HEAP32[$64>>2] = $$04142$us;
  $65 = ((($ReallocAsyncCtx4)) + 8|0);
  HEAP32[$65>>2] = $4;
  $66 = ((($ReallocAsyncCtx4)) + 12|0);
  HEAP32[$66>>2] = $$043$us$reg2mem$0;
  $67 = ((($ReallocAsyncCtx4)) + 16|0);
  HEAP32[$67>>2] = $8;
  $68 = ((($ReallocAsyncCtx4)) + 20|0);
  HEAP32[$68>>2] = $10;
  $69 = ((($ReallocAsyncCtx4)) + 24|0);
  HEAP32[$69>>2] = $$reg2mem$0;
  $70 = ((($ReallocAsyncCtx4)) + 28|0);
  HEAP32[$70>>2] = $14;
  $71 = ((($ReallocAsyncCtx4)) + 32|0);
  HEAP32[$71>>2] = $$reg2mem17$0;
  $72 = ((($ReallocAsyncCtx4)) + 36|0);
  HEAP32[$72>>2] = $18;
  $73 = ((($ReallocAsyncCtx4)) + 40|0);
  HEAP32[$73>>2] = $20;
  $74 = ((($ReallocAsyncCtx4)) + 44|0);
  HEAP32[$74>>2] = $22;
  $75 = ((($ReallocAsyncCtx4)) + 48|0);
  HEAP32[$75>>2] = $$reg2mem21$0;
  $76 = ((($ReallocAsyncCtx4)) + 52|0);
  HEAP8[$76>>0] = $26;
  $77 = ((($ReallocAsyncCtx4)) + 56|0);
  HEAP32[$77>>2] = $28;
  $78 = ((($ReallocAsyncCtx4)) + 60|0);
  HEAP32[$78>>2] = $30;
  sp = STACKTOP;
  return;
 } else {
  $ReallocAsyncCtx3 = (_emscripten_realloc_async_context(64)|0);
  FUNCTION_TABLE_viiii[$47 & 127]($22,$48,$$reg2mem21$0,1);
  $IsAsync8 = ___async;
  if (!($IsAsync8)) {
   ___async_unwind = 0;
  }
  HEAP32[$ReallocAsyncCtx3>>2] = 109;
  $49 = ((($ReallocAsyncCtx3)) + 4|0);
  HEAP32[$49>>2] = $$04142$us;
  $50 = ((($ReallocAsyncCtx3)) + 8|0);
  HEAP32[$50>>2] = $4;
  $51 = ((($ReallocAsyncCtx3)) + 12|0);
  HEAP32[$51>>2] = $$043$us$reg2mem$0;
  $52 = ((($ReallocAsyncCtx3)) + 16|0);
  HEAP32[$52>>2] = $8;
  $53 = ((($ReallocAsyncCtx3)) + 20|0);
  HEAP32[$53>>2] = $10;
  $54 = ((($ReallocAsyncCtx3)) + 24|0);
  HEAP32[$54>>2] = $$reg2mem$0;
  $55 = ((($ReallocAsyncCtx3)) + 28|0);
  HEAP32[$55>>2] = $14;
  $56 = ((($ReallocAsyncCtx3)) + 32|0);
  HEAP32[$56>>2] = $$reg2mem17$0;
  $57 = ((($ReallocAsyncCtx3)) + 36|0);
  HEAP32[$57>>2] = $18;
  $58 = ((($ReallocAsyncCtx3)) + 40|0);
  HEAP32[$58>>2] = $20;
  $59 = ((($ReallocAsyncCtx3)) + 44|0);
  HEAP32[$59>>2] = $22;
  $60 = ((($ReallocAsyncCtx3)) + 48|0);
  HEAP32[$60>>2] = $$reg2mem21$0;
  $61 = ((($ReallocAsyncCtx3)) + 52|0);
  HEAP8[$61>>0] = $26;
  $62 = ((($ReallocAsyncCtx3)) + 56|0);
  HEAP32[$62>>2] = $28;
  $63 = ((($ReallocAsyncCtx3)) + 60|0);
  HEAP32[$63>>2] = $30;
  sp = STACKTOP;
  return;
 }
}
function __ZN6C128329characterEiii__async_cb_43($0) {
 $0 = $0|0;
 var $$04142$us = 0, $$043$us$reg2mem$0 = 0, $$reg2mem$0 = 0, $$reg2mem17$0 = 0, $$reg2mem21$0 = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0;
 var $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0;
 var $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0;
 var $6 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0, $67 = 0, $68 = 0, $69 = 0, $7 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0;
 var $78 = 0, $79 = 0, $8 = 0, $80 = 0, $81 = 0, $82 = 0, $9 = 0, $IsAsync12 = 0, $IsAsync8 = 0, $ReallocAsyncCtx3 = 0, $ReallocAsyncCtx4 = 0, $exitcond = 0, $exitcond46 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = ((($0)) + 4|0);
 $2 = HEAP32[$1>>2]|0;
 $3 = ((($0)) + 8|0);
 $4 = HEAP32[$3>>2]|0;
 $5 = ((($0)) + 12|0);
 $6 = HEAP32[$5>>2]|0;
 $7 = ((($0)) + 16|0);
 $8 = HEAP32[$7>>2]|0;
 $9 = ((($0)) + 20|0);
 $10 = HEAP32[$9>>2]|0;
 $11 = ((($0)) + 24|0);
 $12 = HEAP32[$11>>2]|0;
 $13 = ((($0)) + 28|0);
 $14 = HEAP32[$13>>2]|0;
 $15 = ((($0)) + 32|0);
 $16 = HEAP32[$15>>2]|0;
 $17 = ((($0)) + 36|0);
 $18 = HEAP32[$17>>2]|0;
 $19 = ((($0)) + 40|0);
 $20 = HEAP32[$19>>2]|0;
 $21 = ((($0)) + 44|0);
 $22 = HEAP32[$21>>2]|0;
 $23 = ((($0)) + 48|0);
 $24 = HEAP32[$23>>2]|0;
 $25 = ((($0)) + 52|0);
 $26 = HEAP8[$25>>0]|0;
 $27 = ((($0)) + 56|0);
 $28 = HEAP32[$27>>2]|0;
 $29 = ((($0)) + 60|0);
 $30 = HEAP32[$29>>2]|0;
 $79 = (($2) + 1)|0;
 $exitcond = ($79|0)==($4|0);
 do {
  if ($exitcond) {
   $32 = (($6) + 1)|0;
   $exitcond46 = ($32|0)==($8|0);
   if (!($exitcond46)) {
    $31 = $32 >>> 3;
    $33 = $31 & 31;
    $34 = (($33) + 1)|0;
    $35 = $32 & 7;
    $36 = 1 << $35;
    $37 = (($32) + ($30))|0;
    $$04142$us = 0;$$043$us$reg2mem$0 = $32;$$reg2mem$0 = $34;$$reg2mem17$0 = $36;$$reg2mem21$0 = $37;
    break;
   }
   $80 = $26&255;
   $81 = HEAP32[$28>>2]|0;
   $82 = (($81) + ($80))|0;
   HEAP32[$28>>2] = $82;
   return;
  } else {
   $$04142$us = $79;$$043$us$reg2mem$0 = $6;$$reg2mem$0 = $12;$$reg2mem17$0 = $16;$$reg2mem21$0 = $24;
  }
 } while(0);
 $38 = Math_imul($$04142$us, $10)|0;
 $39 = (($$reg2mem$0) + ($38))|0;
 $40 = (($14) + ($39)|0);
 $41 = HEAP8[$40>>0]|0;
 $42 = $41&255;
 $43 = $42 & $$reg2mem17$0;
 $44 = ($43|0)==(0);
 $45 = HEAP32[$18>>2]|0;
 $46 = ((($45)) + 120|0);
 $47 = HEAP32[$46>>2]|0;
 $48 = (($$04142$us) + ($20))|0;
 if ($44) {
  $ReallocAsyncCtx4 = (_emscripten_realloc_async_context(64)|0);
  FUNCTION_TABLE_viiii[$47 & 127]($22,$48,$$reg2mem21$0,0);
  $IsAsync12 = ___async;
  if (!($IsAsync12)) {
   ___async_unwind = 0;
  }
  HEAP32[$ReallocAsyncCtx4>>2] = 110;
  $64 = ((($ReallocAsyncCtx4)) + 4|0);
  HEAP32[$64>>2] = $$04142$us;
  $65 = ((($ReallocAsyncCtx4)) + 8|0);
  HEAP32[$65>>2] = $4;
  $66 = ((($ReallocAsyncCtx4)) + 12|0);
  HEAP32[$66>>2] = $$043$us$reg2mem$0;
  $67 = ((($ReallocAsyncCtx4)) + 16|0);
  HEAP32[$67>>2] = $8;
  $68 = ((($ReallocAsyncCtx4)) + 20|0);
  HEAP32[$68>>2] = $10;
  $69 = ((($ReallocAsyncCtx4)) + 24|0);
  HEAP32[$69>>2] = $$reg2mem$0;
  $70 = ((($ReallocAsyncCtx4)) + 28|0);
  HEAP32[$70>>2] = $14;
  $71 = ((($ReallocAsyncCtx4)) + 32|0);
  HEAP32[$71>>2] = $$reg2mem17$0;
  $72 = ((($ReallocAsyncCtx4)) + 36|0);
  HEAP32[$72>>2] = $18;
  $73 = ((($ReallocAsyncCtx4)) + 40|0);
  HEAP32[$73>>2] = $20;
  $74 = ((($ReallocAsyncCtx4)) + 44|0);
  HEAP32[$74>>2] = $22;
  $75 = ((($ReallocAsyncCtx4)) + 48|0);
  HEAP32[$75>>2] = $$reg2mem21$0;
  $76 = ((($ReallocAsyncCtx4)) + 52|0);
  HEAP8[$76>>0] = $26;
  $77 = ((($ReallocAsyncCtx4)) + 56|0);
  HEAP32[$77>>2] = $28;
  $78 = ((($ReallocAsyncCtx4)) + 60|0);
  HEAP32[$78>>2] = $30;
  sp = STACKTOP;
  return;
 } else {
  $ReallocAsyncCtx3 = (_emscripten_realloc_async_context(64)|0);
  FUNCTION_TABLE_viiii[$47 & 127]($22,$48,$$reg2mem21$0,1);
  $IsAsync8 = ___async;
  if (!($IsAsync8)) {
   ___async_unwind = 0;
  }
  HEAP32[$ReallocAsyncCtx3>>2] = 109;
  $49 = ((($ReallocAsyncCtx3)) + 4|0);
  HEAP32[$49>>2] = $$04142$us;
  $50 = ((($ReallocAsyncCtx3)) + 8|0);
  HEAP32[$50>>2] = $4;
  $51 = ((($ReallocAsyncCtx3)) + 12|0);
  HEAP32[$51>>2] = $$043$us$reg2mem$0;
  $52 = ((($ReallocAsyncCtx3)) + 16|0);
  HEAP32[$52>>2] = $8;
  $53 = ((($ReallocAsyncCtx3)) + 20|0);
  HEAP32[$53>>2] = $10;
  $54 = ((($ReallocAsyncCtx3)) + 24|0);
  HEAP32[$54>>2] = $$reg2mem$0;
  $55 = ((($ReallocAsyncCtx3)) + 28|0);
  HEAP32[$55>>2] = $14;
  $56 = ((($ReallocAsyncCtx3)) + 32|0);
  HEAP32[$56>>2] = $$reg2mem17$0;
  $57 = ((($ReallocAsyncCtx3)) + 36|0);
  HEAP32[$57>>2] = $18;
  $58 = ((($ReallocAsyncCtx3)) + 40|0);
  HEAP32[$58>>2] = $20;
  $59 = ((($ReallocAsyncCtx3)) + 44|0);
  HEAP32[$59>>2] = $22;
  $60 = ((($ReallocAsyncCtx3)) + 48|0);
  HEAP32[$60>>2] = $$reg2mem21$0;
  $61 = ((($ReallocAsyncCtx3)) + 52|0);
  HEAP8[$61>>0] = $26;
  $62 = ((($ReallocAsyncCtx3)) + 56|0);
  HEAP32[$62>>2] = $28;
  $63 = ((($ReallocAsyncCtx3)) + 60|0);
  HEAP32[$63>>2] = $30;
  sp = STACKTOP;
  return;
 }
}
function __ZN15GraphicsDisplay3clsEv__async_cb($0) {
 $0 = $0|0;
 var $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $AsyncRetVal = 0, $IsAsync3 = 0, $ReallocAsyncCtx2 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = ((($0)) + 4|0);
 $2 = HEAP32[$1>>2]|0;
 $3 = ((($0)) + 8|0);
 $4 = HEAP32[$3>>2]|0;
 $5 = ((($0)) + 12|0);
 $6 = HEAP32[$5>>2]|0;
 $7 = ___async_retval;
 $AsyncRetVal = HEAP32[$7>>2]|0;
 $8 = HEAP32[$2>>2]|0;
 $9 = ((($8)) + 128|0);
 $10 = HEAP32[$9>>2]|0;
 $ReallocAsyncCtx2 = (_emscripten_realloc_async_context(16)|0);
 $11 = (FUNCTION_TABLE_ii[$10 & 511]($4)|0);
 $IsAsync3 = ___async;
 if (!($IsAsync3)) {
  $15 = ___async_retval;
  HEAP32[$15>>2] = $11;
  ___async_unwind = 0;
 }
 HEAP32[$ReallocAsyncCtx2>>2] = 123;
 $12 = ((($ReallocAsyncCtx2)) + 4|0);
 HEAP32[$12>>2] = $4;
 $13 = ((($ReallocAsyncCtx2)) + 8|0);
 HEAP32[$13>>2] = $AsyncRetVal;
 $14 = ((($ReallocAsyncCtx2)) + 12|0);
 HEAP32[$14>>2] = $6;
 sp = STACKTOP;
 return;
}
function __ZN15GraphicsDisplay3clsEv__async_cb_44($0) {
 $0 = $0|0;
 var $1 = 0, $10 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $AsyncRetVal = 0, $IsAsync6 = 0, $ReallocAsyncCtx3 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = ((($0)) + 4|0);
 $2 = HEAP32[$1>>2]|0;
 $3 = ((($0)) + 8|0);
 $4 = HEAP32[$3>>2]|0;
 $5 = ((($0)) + 12|0);
 $6 = HEAP32[$5>>2]|0;
 $7 = ___async_retval;
 $AsyncRetVal = HEAP32[$7>>2]|0;
 $8 = ((($2)) + 30|0);
 $9 = HEAP16[$8>>1]|0;
 $10 = $9&65535;
 $ReallocAsyncCtx3 = (_emscripten_realloc_async_context(4)|0);
 FUNCTION_TABLE_viiiiii[$6 & 127]($2,0,0,$4,$AsyncRetVal,$10);
 $IsAsync6 = ___async;
 if ($IsAsync6) {
  HEAP32[$ReallocAsyncCtx3>>2] = 124;
  sp = STACKTOP;
  return;
 }
 ___async_unwind = 0;
 HEAP32[$ReallocAsyncCtx3>>2] = 124;
 sp = STACKTOP;
 return;
}
function __ZN15GraphicsDisplay3clsEv__async_cb_45($0) {
 $0 = $0|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 return;
}
function __ZN4mbed7Timeout7handlerEv__async_cb($0) {
 $0 = $0|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 return;
}
function __ZSt11__terminatePFvvE__async_cb($0) {
 $0 = $0|0;
 var $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 $1 = ((($0)) + 4|0);
 $2 = HEAP32[$1>>2]|0;
 $3 = ((($0)) + 8|0);
 $4 = HEAP32[$3>>2]|0;
 $5 = ((($0)) + 12|0);
 $6 = HEAP32[$5>>2]|0;
 $7 = ((($0)) + 16|0);
 $8 = HEAP32[$7>>2]|0;
 $9 = __THREW__; __THREW__ = 0;
 $10 = $9&1;
 if (!($10)) {
  __THREW__ = 0;
  invoke_vii(243,(8636|0),($6|0));
  $11 = __THREW__; __THREW__ = 0;
 }
 $12 = ___cxa_find_matching_catch_3(0|0)|0;
 $13 = tempRet0;
 (___cxa_begin_catch(($12|0))|0);
 __THREW__ = 0;
 invoke_vii(243,(8676|0),($2|0));
 $14 = __THREW__; __THREW__ = 0;
 $15 = ___cxa_find_matching_catch_3(0|0)|0;
 $16 = tempRet0;
 __THREW__ = 0;
 invoke_v(244);
 $17 = __THREW__; __THREW__ = 0;
 $18 = $17&1;
 if ($18) {
  $19 = ___cxa_find_matching_catch_3(0|0)|0;
  $20 = tempRet0;
  (_emscripten_realloc_async_context(4)|0);
  ___clang_call_terminate($19);
  // unreachable;
 } else {
  (_emscripten_realloc_async_context(4)|0);
  ___clang_call_terminate($15);
  // unreachable;
 }
}
function __ZSt11__terminatePFvvE__async_cb_46($0) {
 $0 = $0|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 // unreachable;
}
function __ZSt11__terminatePFvvE__async_cb_47($0) {
 $0 = $0|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 // unreachable;
}
function __ZN15GraphicsDisplay7columnsEv__async_cb($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $AsyncRetVal = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = ___async_retval;
 $AsyncRetVal = HEAP32[$1>>2]|0;
 $2 = (($AsyncRetVal|0) / 8)&-1;
 $3 = ___async_retval;
 HEAP32[$3>>2] = $2;
 return;
}
function __ZN15GraphicsDisplayC2EPKc__async_cb($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $IsAsync12 = 0, $ReallocAsyncCtx4 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = ((($0)) + 4|0);
 $2 = HEAP32[$1>>2]|0;
 $3 = __THREW__; __THREW__ = 0;
 $4 = $3&1;
 if (!($4)) {
  return;
 }
 $5 = ___cxa_find_matching_catch_2()|0;
 $6 = tempRet0;
 __THREW__ = 0;
 $ReallocAsyncCtx4 = (invoke_ii(259,12)|0);
 __ZN4mbed6StreamD2Ev($2);
 $IsAsync12 = ___async;
 if (!($IsAsync12)) {
  ___async_unwind = 0;
 }
 HEAP32[$ReallocAsyncCtx4>>2] = 136;
 $7 = ((($ReallocAsyncCtx4)) + 4|0);
 HEAP32[$7>>2] = $5;
 $8 = ((($ReallocAsyncCtx4)) + 8|0);
 HEAP32[$8>>2] = $6;
 sp = STACKTOP;
 return;
}
function __ZN15GraphicsDisplayC2EPKc__async_cb_48($0) {
 $0 = $0|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 // unreachable;
}
function __ZN15GraphicsDisplayC2EPKc__async_cb_49($0) {
 $0 = $0|0;
 var $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $IsAsync = 0, $IsAsync12 = 0, $ReallocAsyncCtx = 0, $ReallocAsyncCtx4 = 0, label = 0;
 var sp = 0;
 sp = STACKTOP;
 $1 = ((($0)) + 4|0);
 $2 = HEAP32[$1>>2]|0;
 $3 = ((($0)) + 8|0);
 $4 = HEAP32[$3>>2]|0;
 HEAP32[$2>>2] = (552);
 $5 = ((($2)) + 4|0);
 HEAP32[$5>>2] = (712);
 __THREW__ = 0;
 invoke_vii(29,($4|0),-1);
 $6 = __THREW__; __THREW__ = 0;
 $7 = $6&1;
 if ($7) {
  $12 = ___cxa_find_matching_catch_2()|0;
  $13 = tempRet0;
  __THREW__ = 0;
  $ReallocAsyncCtx4 = (invoke_ii(259,12)|0);
  __ZN4mbed6StreamD2Ev($2);
  $IsAsync12 = ___async;
  if ($IsAsync12) {
   HEAP32[$ReallocAsyncCtx4>>2] = 136;
   $14 = ((($ReallocAsyncCtx4)) + 4|0);
   HEAP32[$14>>2] = $12;
   $15 = ((($ReallocAsyncCtx4)) + 8|0);
   HEAP32[$15>>2] = $13;
   sp = STACKTOP;
   return;
  }
  ___async_unwind = 0;
  HEAP32[$ReallocAsyncCtx4>>2] = 136;
  $14 = ((($ReallocAsyncCtx4)) + 4|0);
  HEAP32[$14>>2] = $12;
  $15 = ((($ReallocAsyncCtx4)) + 8|0);
  HEAP32[$15>>2] = $13;
  sp = STACKTOP;
  return;
 } else {
  $8 = HEAP32[$2>>2]|0;
  $9 = ((($8)) + 116|0);
  $10 = HEAP32[$9>>2]|0;
  __THREW__ = 0;
  $ReallocAsyncCtx = (invoke_ii(259,8)|0);
  FUNCTION_TABLE_vii[$10 & 255]($4,0);
  $IsAsync = ___async;
  if ($IsAsync) {
   HEAP32[$ReallocAsyncCtx>>2] = 135;
   $11 = ((($ReallocAsyncCtx)) + 4|0);
   HEAP32[$11>>2] = $2;
   sp = STACKTOP;
   return;
  }
  ___async_unwind = 0;
  HEAP32[$ReallocAsyncCtx>>2] = 135;
  $11 = ((($ReallocAsyncCtx)) + 4|0);
  HEAP32[$11>>2] = $2;
  sp = STACKTOP;
  return;
 }
}
function __ZN15GraphicsDisplayC2EPKc__async_cb_50($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = ((($0)) + 4|0);
 $2 = HEAP32[$1>>2]|0;
 $3 = ((($0)) + 8|0);
 $4 = HEAP32[$3>>2]|0;
 $5 = __THREW__; __THREW__ = 0;
 $6 = $5&1;
 if ($6) {
  $7 = ___cxa_find_matching_catch_3(0|0)|0;
  $8 = tempRet0;
  (_emscripten_realloc_async_context(4)|0);
  ___clang_call_terminate($7);
  // unreachable;
 } else {
  ___resumeException($2|0);
  // unreachable;
 }
}
function __ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb($0) {
 $0 = $0|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 return;
}
function __ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb($0) {
 $0 = $0|0;
 var $$037$off038 = 0, $$037$off039 = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0;
 var $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $not$ = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = ((($0)) + 4|0);
 $2 = HEAP32[$1>>2]|0;
 $3 = ((($0)) + 8|0);
 $4 = HEAP32[$3>>2]|0;
 $5 = ((($0)) + 12|0);
 $6 = HEAP32[$5>>2]|0;
 $7 = ((($0)) + 16|0);
 $8 = HEAP32[$7>>2]|0;
 $9 = ((($0)) + 20|0);
 $10 = HEAP32[$9>>2]|0;
 $11 = ((($0)) + 24|0);
 $12 = HEAP32[$11>>2]|0;
 $13 = HEAP8[$2>>0]|0;
 $14 = ($13<<24>>24)==(0);
 if ($14) {
  $$037$off038 = 4;
  label = 4;
 } else {
  $15 = HEAP8[$10>>0]|0;
  $not$ = ($15<<24>>24)==(0);
  if ($not$) {
   $$037$off038 = 3;
   label = 4;
  } else {
   $$037$off039 = 3;
  }
 }
 if ((label|0) == 4) {
  HEAP32[$6>>2] = $4;
  $16 = ((($8)) + 40|0);
  $17 = HEAP32[$16>>2]|0;
  $18 = (($17) + 1)|0;
  HEAP32[$16>>2] = $18;
  $19 = ((($8)) + 36|0);
  $20 = HEAP32[$19>>2]|0;
  $21 = ($20|0)==(1);
  if ($21) {
   $22 = ((($8)) + 24|0);
   $23 = HEAP32[$22>>2]|0;
   $24 = ($23|0)==(2);
   if ($24) {
    $25 = ((($8)) + 54|0);
    HEAP8[$25>>0] = 1;
    $$037$off039 = $$037$off038;
   } else {
    $$037$off039 = $$037$off038;
   }
  } else {
   $$037$off039 = $$037$off038;
  }
 }
 HEAP32[$12>>2] = $$037$off039;
 return;
}
function __ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_51($0) {
 $0 = $0|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 return;
}
function _sprintf__async_cb($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, $AsyncRetVal = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = ((($0)) + 4|0);
 $2 = HEAP32[$1>>2]|0;
 $3 = ___async_retval;
 $AsyncRetVal = HEAP32[$3>>2]|0;
 $4 = ___async_retval;
 HEAP32[$4>>2] = $AsyncRetVal;
 return;
}
function ___fflush_unlocked__async_cb($0) {
 $0 = $0|0;
 var $$0 = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $3 = 0;
 var $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $IsAsync4 = 0, $ReallocAsyncCtx2 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = ((($0)) + 4|0);
 $2 = HEAP32[$1>>2]|0;
 $3 = ((($0)) + 8|0);
 $4 = HEAP32[$3>>2]|0;
 $5 = ((($0)) + 12|0);
 $6 = HEAP32[$5>>2]|0;
 $7 = HEAP32[$2>>2]|0;
 $8 = ($7|0)==(0|0);
 do {
  if ($8) {
   $$0 = -1;
  } else {
   $9 = ((($4)) + 4|0);
   $10 = HEAP32[$9>>2]|0;
   $11 = ((($4)) + 8|0);
   $12 = HEAP32[$11>>2]|0;
   $13 = ($10>>>0)<($12>>>0);
   if (!($13)) {
    $24 = ((($4)) + 16|0);
    HEAP32[$24>>2] = 0;
    HEAP32[$6>>2] = 0;
    HEAP32[$2>>2] = 0;
    HEAP32[$11>>2] = 0;
    HEAP32[$9>>2] = 0;
    $$0 = 0;
    break;
   }
   $14 = $10;
   $15 = $12;
   $16 = (($14) - ($15))|0;
   $17 = ((($4)) + 40|0);
   $18 = HEAP32[$17>>2]|0;
   $ReallocAsyncCtx2 = (_emscripten_realloc_async_context(24)|0);
   (FUNCTION_TABLE_iiii[$18 & 255]($4,$16,1)|0);
   $IsAsync4 = ___async;
   if (!($IsAsync4)) {
    ___async_unwind = 0;
   }
   HEAP32[$ReallocAsyncCtx2>>2] = 216;
   $19 = ((($ReallocAsyncCtx2)) + 4|0);
   HEAP32[$19>>2] = $4;
   $20 = ((($ReallocAsyncCtx2)) + 8|0);
   HEAP32[$20>>2] = $6;
   $21 = ((($ReallocAsyncCtx2)) + 12|0);
   HEAP32[$21>>2] = $2;
   $22 = ((($ReallocAsyncCtx2)) + 16|0);
   HEAP32[$22>>2] = $11;
   $23 = ((($ReallocAsyncCtx2)) + 20|0);
   HEAP32[$23>>2] = $9;
   sp = STACKTOP;
   return;
  }
 } while(0);
 $25 = ___async_retval;
 HEAP32[$25>>2] = $$0;
 return;
}
function ___fflush_unlocked__async_cb_52($0) {
 $0 = $0|0;
 var $1 = 0, $10 = 0, $11 = 0, $12 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = ((($0)) + 4|0);
 $2 = HEAP32[$1>>2]|0;
 $3 = ((($0)) + 8|0);
 $4 = HEAP32[$3>>2]|0;
 $5 = ((($0)) + 12|0);
 $6 = HEAP32[$5>>2]|0;
 $7 = ((($0)) + 16|0);
 $8 = HEAP32[$7>>2]|0;
 $9 = ((($0)) + 20|0);
 $10 = HEAP32[$9>>2]|0;
 $11 = ((($2)) + 16|0);
 HEAP32[$11>>2] = 0;
 HEAP32[$4>>2] = 0;
 HEAP32[$6>>2] = 0;
 HEAP32[$8>>2] = 0;
 HEAP32[$10>>2] = 0;
 $12 = ___async_retval;
 HEAP32[$12>>2] = 0;
 return;
}
function __ZN4mbed7TimeoutD2Ev__async_cb($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = __THREW__; __THREW__ = 0;
 $2 = $1&1;
 if ($2) {
  $3 = ___cxa_find_matching_catch_2()|0;
  $4 = tempRet0;
  ___resumeException($3|0);
  // unreachable;
 } else {
  return;
 }
}
function __ZN6C128324rowsEv__async_cb($0) {
 $0 = $0|0;
 var $1 = 0, $10 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $AsyncRetVal = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = ((($0)) + 4|0);
 $2 = HEAP32[$1>>2]|0;
 $3 = ___async_retval;
 $AsyncRetVal = HEAP32[$3>>2]|0;
 $4 = ((($2)) + 48|0);
 $5 = HEAP32[$4>>2]|0;
 $6 = ((($5)) + 2|0);
 $7 = HEAP8[$6>>0]|0;
 $8 = $7&255;
 $9 = (($AsyncRetVal|0) / ($8|0))&-1;
 $10 = ___async_retval;
 HEAP32[$10>>2] = $9;
 return;
}
function __ZThn4_N4mbed6StreamD1Ev__async_cb($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = ((($0)) + 4|0);
 $2 = HEAP32[$1>>2]|0;
 __ZN4mbed8FileBaseD2Ev($2);
 return;
}
function __ZN11TextDisplay5_putcEi__async_cb($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $AsyncRetVal = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = ((($0)) + 4|0);
 $2 = HEAP32[$1>>2]|0;
 $3 = ((($0)) + 8|0);
 $4 = HEAP32[$3>>2]|0;
 $5 = ((($0)) + 12|0);
 $6 = HEAP32[$5>>2]|0;
 $7 = ___async_retval;
 $AsyncRetVal = HEAP32[$7>>2]|0;
 $8 = ($2|0)<($AsyncRetVal|0);
 if ($8) {
  $9 = ___async_retval;
  HEAP32[$9>>2] = $4;
  return;
 }
 HEAP16[$6>>1] = 0;
 $9 = ___async_retval;
 HEAP32[$9>>2] = $4;
 return;
}
function __ZN11TextDisplay5_putcEi__async_cb_53($0) {
 $0 = $0|0;
 var $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0;
 var $8 = 0, $9 = 0, $IsAsync7 = 0, $ReallocAsyncCtx3 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = ((($0)) + 4|0);
 $2 = HEAP32[$1>>2]|0;
 $3 = ((($0)) + 8|0);
 $4 = HEAP32[$3>>2]|0;
 $5 = ((($0)) + 12|0);
 $6 = HEAP32[$5>>2]|0;
 $7 = ((($0)) + 16|0);
 $8 = HEAP32[$7>>2]|0;
 $9 = HEAP16[$2>>1]|0;
 $10 = (($9) + 1)<<16>>16;
 HEAP16[$2>>1] = $10;
 $11 = $10&65535;
 $12 = HEAP32[$4>>2]|0;
 $13 = ((($12)) + 96|0);
 $14 = HEAP32[$13>>2]|0;
 $ReallocAsyncCtx3 = (_emscripten_realloc_async_context(28)|0);
 $15 = (FUNCTION_TABLE_ii[$14 & 511]($4)|0);
 $IsAsync7 = ___async;
 if (!($IsAsync7)) {
  $22 = ___async_retval;
  HEAP32[$22>>2] = $15;
  ___async_unwind = 0;
 }
 HEAP32[$ReallocAsyncCtx3>>2] = 140;
 $16 = ((($ReallocAsyncCtx3)) + 4|0);
 HEAP32[$16>>2] = $11;
 $17 = ((($ReallocAsyncCtx3)) + 8|0);
 HEAP32[$17>>2] = $6;
 $18 = ((($ReallocAsyncCtx3)) + 12|0);
 HEAP32[$18>>2] = $2;
 $19 = ((($ReallocAsyncCtx3)) + 16|0);
 HEAP32[$19>>2] = $8;
 $20 = ((($ReallocAsyncCtx3)) + 20|0);
 HEAP32[$20>>2] = $4;
 $21 = ((($ReallocAsyncCtx3)) + 24|0);
 HEAP32[$21>>2] = $4;
 sp = STACKTOP;
 return;
}
function __ZN11TextDisplay5_putcEi__async_cb_54($0) {
 $0 = $0|0;
 var $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $3 = 0;
 var $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $AsyncRetVal = 0, $IsAsync11 = 0, $ReallocAsyncCtx4 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = ((($0)) + 4|0);
 $2 = HEAP32[$1>>2]|0;
 $3 = ((($0)) + 8|0);
 $4 = HEAP32[$3>>2]|0;
 $5 = ((($0)) + 12|0);
 $6 = HEAP32[$5>>2]|0;
 $7 = ((($0)) + 16|0);
 $8 = HEAP32[$7>>2]|0;
 $9 = ((($0)) + 20|0);
 $10 = HEAP32[$9>>2]|0;
 $11 = ((($0)) + 24|0);
 $12 = HEAP32[$11>>2]|0;
 $13 = ___async_retval;
 $AsyncRetVal = HEAP32[$13>>2]|0;
 $14 = ($2|0)<($AsyncRetVal|0);
 if ($14) {
  $26 = ___async_retval;
  HEAP32[$26>>2] = $4;
  return;
 }
 HEAP16[$6>>1] = 0;
 $15 = HEAP16[$8>>1]|0;
 $16 = (($15) + 1)<<16>>16;
 HEAP16[$8>>1] = $16;
 $17 = $16&65535;
 $18 = HEAP32[$10>>2]|0;
 $19 = ((($18)) + 92|0);
 $20 = HEAP32[$19>>2]|0;
 $ReallocAsyncCtx4 = (_emscripten_realloc_async_context(16)|0);
 $21 = (FUNCTION_TABLE_ii[$20 & 511]($12)|0);
 $IsAsync11 = ___async;
 if (!($IsAsync11)) {
  $25 = ___async_retval;
  HEAP32[$25>>2] = $21;
  ___async_unwind = 0;
 }
 HEAP32[$ReallocAsyncCtx4>>2] = 141;
 $22 = ((($ReallocAsyncCtx4)) + 4|0);
 HEAP32[$22>>2] = $17;
 $23 = ((($ReallocAsyncCtx4)) + 8|0);
 HEAP32[$23>>2] = $4;
 $24 = ((($ReallocAsyncCtx4)) + 12|0);
 HEAP32[$24>>2] = $8;
 sp = STACKTOP;
 return;
}
function __ZN11TextDisplay5_putcEi__async_cb_55($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $AsyncRetVal = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = ((($0)) + 4|0);
 $2 = HEAP32[$1>>2]|0;
 $3 = ((($0)) + 8|0);
 $4 = HEAP32[$3>>2]|0;
 $5 = ((($0)) + 12|0);
 $6 = HEAP32[$5>>2]|0;
 $7 = ___async_retval;
 $AsyncRetVal = HEAP32[$7>>2]|0;
 $8 = ($2|0)<($AsyncRetVal|0);
 if ($8) {
  $9 = ___async_retval;
  HEAP32[$9>>2] = $4;
  return;
 }
 HEAP16[$6>>1] = 0;
 $9 = ___async_retval;
 HEAP32[$9>>2] = $4;
 return;
}
function __ZN4mbed11mbed_fdopenEPNS_10FileHandleEPKc__async_cb($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $AsyncRetVal = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = ((($0)) + 4|0);
 $2 = HEAP32[$1>>2]|0;
 $3 = ((($0)) + 8|0);
 $4 = HEAP32[$3>>2]|0;
 $5 = ___async_retval;
 $AsyncRetVal = HEAP32[$5>>2]|0;
 $6 = ($AsyncRetVal|0)==(0);
 if (!($6)) {
  _setbuf($4,0);
 }
 $7 = ___async_retval;
 HEAP32[$7>>2] = $4;
 return;
}
function __ZNK10__cxxabiv122__base_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb($0) {
 $0 = $0|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 return;
}
function _ticker_read_us__async_cb($0) {
 $0 = $0|0;
 var $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $3 = 0;
 var $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $AsyncRetVal = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = ((($0)) + 8|0);
 $2 = $1;
 $3 = $2;
 $4 = HEAP32[$3>>2]|0;
 $5 = (($2) + 4)|0;
 $6 = $5;
 $7 = HEAP32[$6>>2]|0;
 $8 = ((($0)) + 16|0);
 $9 = HEAP32[$8>>2]|0;
 $10 = ___async_retval;
 $AsyncRetVal = HEAP32[$10>>2]|0;
 $11 = ($4>>>0)>($AsyncRetVal>>>0);
 $12 = (_i64Add(($AsyncRetVal|0),($7|0),0,1)|0);
 $13 = tempRet0;
 $14 = $11 ? $12 : $AsyncRetVal;
 $15 = $11 ? $13 : $7;
 $16 = HEAP32[$9>>2]|0;
 $17 = ((($16)) + 8|0);
 $18 = $17;
 $19 = $18;
 HEAP32[$19>>2] = $14;
 $20 = (($18) + 4)|0;
 $21 = $20;
 HEAP32[$21>>2] = $15;
 $22 = ___async_retval;
 $23 = $22;
 $24 = $23;
 HEAP32[$24>>2] = $14;
 $25 = (($23) + 4)|0;
 $26 = $25;
 HEAP32[$26>>2] = $15;
 return;
}
function _fputc__async_cb($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, $AsyncRetVal = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = ((($0)) + 4|0);
 $2 = HEAP32[$1>>2]|0;
 $3 = ___async_retval;
 $AsyncRetVal = HEAP32[$3>>2]|0;
 ___unlockfile($2);
 $4 = ___async_retval;
 HEAP32[$4>>2] = $AsyncRetVal;
 return;
}
function _fputc__async_cb_56($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $AsyncRetVal = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = ___async_retval;
 $AsyncRetVal = HEAP32[$1>>2]|0;
 $2 = ___async_retval;
 HEAP32[$2>>2] = $AsyncRetVal;
 return;
}
function _fflush__async_cb($0) {
 $0 = $0|0;
 var $$023 = 0, $$02327$reg2mem$0 = 0, $$1 = 0, $$1$phi = 0, $$reg2mem$0 = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0;
 var $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $AsyncRetVal = 0, $IsAsync = 0, $ReallocAsyncCtx = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = ((($0)) + 4|0);
 $2 = HEAP32[$1>>2]|0;
 $3 = ((($0)) + 8|0);
 $4 = HEAP32[$3>>2]|0;
 $5 = ((($0)) + 12|0);
 $6 = HEAP32[$5>>2]|0;
 $7 = ___async_retval;
 $AsyncRetVal = HEAP32[$7>>2]|0;
 $23 = $AsyncRetVal | $2;
 $$02327$reg2mem$0 = $6;$$1 = $23;$$reg2mem$0 = $4;
 while(1) {
  $24 = ($$reg2mem$0|0)==(0);
  if (!($24)) {
   ___unlockfile($$02327$reg2mem$0);
  }
  $25 = ((($$02327$reg2mem$0)) + 56|0);
  $$023 = HEAP32[$25>>2]|0;
  $26 = ($$023|0)==(0|0);
  if ($26) {
   label = 12;
   break;
  }
  $8 = ((($$023)) + 76|0);
  $9 = HEAP32[$8>>2]|0;
  $10 = ($9|0)>(-1);
  if ($10) {
   $11 = (___lockfile($$023)|0);
   $20 = $11;
  } else {
   $20 = 0;
  }
  $12 = ((($$023)) + 20|0);
  $13 = HEAP32[$12>>2]|0;
  $14 = ((($$023)) + 28|0);
  $15 = HEAP32[$14>>2]|0;
  $16 = ($13>>>0)>($15>>>0);
  if ($16) {
   break;
  } else {
   $$1$phi = $$1;$$02327$reg2mem$0 = $$023;$$reg2mem$0 = $20;$$1 = $$1$phi;
  }
 }
 if ((label|0) == 12) {
  ___ofl_unlock();
  $27 = ___async_retval;
  HEAP32[$27>>2] = $$1;
  return;
 }
 $ReallocAsyncCtx = (_emscripten_realloc_async_context(16)|0);
 $17 = (___fflush_unlocked($$023)|0);
 $IsAsync = ___async;
 if (!($IsAsync)) {
  $22 = ___async_retval;
  HEAP32[$22>>2] = $17;
  ___async_unwind = 0;
 }
 HEAP32[$ReallocAsyncCtx>>2] = 214;
 $18 = ((($ReallocAsyncCtx)) + 4|0);
 HEAP32[$18>>2] = $$1;
 $19 = ((($ReallocAsyncCtx)) + 8|0);
 HEAP32[$19>>2] = $20;
 $21 = ((($ReallocAsyncCtx)) + 12|0);
 HEAP32[$21>>2] = $$023;
 sp = STACKTOP;
 return;
}
function _fflush__async_cb_57($0) {
 $0 = $0|0;
 var $$pre_trunc = 0, $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $AsyncRetVal = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = ((($0)) + 4|0);
 $$pre_trunc = HEAP8[$1>>0]|0;
 $2 = $$pre_trunc&1;
 $3 = ((($0)) + 8|0);
 $4 = HEAP32[$3>>2]|0;
 $5 = ___async_retval;
 $AsyncRetVal = HEAP32[$5>>2]|0;
 if (!($2)) {
  ___unlockfile($4);
 }
 $6 = ___async_retval;
 HEAP32[$6>>2] = $AsyncRetVal;
 return;
}
function _fflush__async_cb_58($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $AsyncRetVal = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = ___async_retval;
 $AsyncRetVal = HEAP32[$1>>2]|0;
 $2 = ___async_retval;
 HEAP32[$2>>2] = $AsyncRetVal;
 return;
}
function _fflush__async_cb_59($0) {
 $0 = $0|0;
 var $$023 = 0, $$02325 = 0, $$02327 = 0, $$024$lcssa = 0, $$02426 = 0, $$02426$phi = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0;
 var $22 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $AsyncRetVal = 0, $IsAsync = 0, $ReallocAsyncCtx = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = ___async_retval;
 $AsyncRetVal = HEAP32[$1>>2]|0;
 $2 = (___ofl_lock()|0);
 $$02325 = HEAP32[$2>>2]|0;
 $3 = ($$02325|0)==(0|0);
 L3: do {
  if ($3) {
   $$024$lcssa = $AsyncRetVal;
  } else {
   $$02327 = $$02325;$$02426 = $AsyncRetVal;
   while(1) {
    $4 = ((($$02327)) + 76|0);
    $5 = HEAP32[$4>>2]|0;
    $6 = ($5|0)>(-1);
    if ($6) {
     $7 = (___lockfile($$02327)|0);
     $16 = $7;
    } else {
     $16 = 0;
    }
    $8 = ((($$02327)) + 20|0);
    $9 = HEAP32[$8>>2]|0;
    $10 = ((($$02327)) + 28|0);
    $11 = HEAP32[$10>>2]|0;
    $12 = ($9>>>0)>($11>>>0);
    if ($12) {
     break;
    }
    $19 = ($16|0)==(0);
    if (!($19)) {
     ___unlockfile($$02327);
    }
    $20 = ((($$02327)) + 56|0);
    $$023 = HEAP32[$20>>2]|0;
    $21 = ($$023|0)==(0|0);
    if ($21) {
     $$024$lcssa = $$02426;
     break L3;
    } else {
     $$02426$phi = $$02426;$$02327 = $$023;$$02426 = $$02426$phi;
    }
   }
   $ReallocAsyncCtx = (_emscripten_realloc_async_context(16)|0);
   $13 = (___fflush_unlocked($$02327)|0);
   $IsAsync = ___async;
   if (!($IsAsync)) {
    $18 = ___async_retval;
    HEAP32[$18>>2] = $13;
    ___async_unwind = 0;
   }
   HEAP32[$ReallocAsyncCtx>>2] = 214;
   $14 = ((($ReallocAsyncCtx)) + 4|0);
   HEAP32[$14>>2] = $$02426;
   $15 = ((($ReallocAsyncCtx)) + 8|0);
   HEAP32[$15>>2] = $16;
   $17 = ((($ReallocAsyncCtx)) + 12|0);
   HEAP32[$17>>2] = $$02327;
   sp = STACKTOP;
   return;
  }
 } while(0);
 ___ofl_unlock();
 $22 = ___async_retval;
 HEAP32[$22>>2] = $$024$lcssa;
 return;
}
function __ZNK10__cxxabiv120__si_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb($0) {
 $0 = $0|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 return;
}
function __ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv__async_cb($0) {
 $0 = $0|0;
 var $$0 = 0, $$0$expand_i1_val = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = ((($0)) + 4|0);
 $2 = HEAP32[$1>>2]|0;
 $3 = ((($0)) + 8|0);
 $4 = HEAP32[$3>>2]|0;
 $5 = ((($0)) + 12|0);
 $6 = HEAP32[$5>>2]|0;
 $7 = ((($2)) + 24|0);
 $8 = HEAP32[$7>>2]|0;
 $9 = ($8|0)==(1);
 if ($9) {
  $10 = ((($2)) + 16|0);
  $11 = HEAP32[$10>>2]|0;
  HEAP32[$4>>2] = $11;
  $$0 = 1;
 } else {
  $$0 = 0;
 }
 $12 = ___async_retval;
 $$0$expand_i1_val = $$0&1;
 HEAP8[$12>>0] = $$0$expand_i1_val;
 return;
}
function __ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv__async_cb_60($0) {
 $0 = $0|0;
 var $$expand_i1_val = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0;
 var $9 = 0, $AsyncRetVal = 0, $IsAsync = 0, $ReallocAsyncCtx = 0, dest = 0, label = 0, sp = 0, stop = 0;
 sp = STACKTOP;
 $1 = ((($0)) + 4|0);
 $2 = HEAP32[$1>>2]|0;
 $3 = ((($0)) + 8|0);
 $4 = HEAP32[$3>>2]|0;
 $5 = ((($0)) + 12|0);
 $6 = HEAP32[$5>>2]|0;
 $7 = ___async_retval;
 $AsyncRetVal = HEAP32[$7>>2]|0;
 $8 = ($AsyncRetVal|0)==(0|0);
 if ($8) {
  $20 = ___async_retval;
  $$expand_i1_val = 0;
  HEAP8[$20>>0] = $$expand_i1_val;
  return;
 }
 $9 = ((($2)) + 4|0);
 dest=$9; stop=dest+52|0; do { HEAP32[dest>>2]=0|0; dest=dest+4|0; } while ((dest|0) < (stop|0));
 HEAP32[$2>>2] = $AsyncRetVal;
 $10 = ((($2)) + 8|0);
 HEAP32[$10>>2] = $4;
 $11 = ((($2)) + 12|0);
 HEAP32[$11>>2] = -1;
 $12 = ((($2)) + 48|0);
 HEAP32[$12>>2] = 1;
 $13 = HEAP32[$AsyncRetVal>>2]|0;
 $14 = ((($13)) + 28|0);
 $15 = HEAP32[$14>>2]|0;
 $16 = HEAP32[$6>>2]|0;
 $ReallocAsyncCtx = (_emscripten_realloc_async_context(16)|0);
 FUNCTION_TABLE_viiii[$15 & 127]($AsyncRetVal,$2,$16,1);
 $IsAsync = ___async;
 if (!($IsAsync)) {
  ___async_unwind = 0;
 }
 HEAP32[$ReallocAsyncCtx>>2] = 233;
 $17 = ((($ReallocAsyncCtx)) + 4|0);
 HEAP32[$17>>2] = $2;
 $18 = ((($ReallocAsyncCtx)) + 8|0);
 HEAP32[$18>>2] = $6;
 $19 = ((($ReallocAsyncCtx)) + 12|0);
 HEAP32[$19>>2] = $2;
 sp = STACKTOP;
 return;
}
function __ZN11TextDisplayC2EPKc__async_cb($0) {
 $0 = $0|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 // unreachable;
}
function __ZN11TextDisplayC2EPKc__async_cb_61($0) {
 $0 = $0|0;
 var $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $3 = 0, $4 = 0, $5 = 0;
 var $6 = 0, $7 = 0, $8 = 0, $9 = 0, $IsAsync8 = 0, $ReallocAsyncCtx3 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = ((($0)) + 4|0);
 $2 = HEAP32[$1>>2]|0;
 $3 = ((($0)) + 8|0);
 $4 = HEAP32[$3>>2]|0;
 $5 = ((($0)) + 12|0);
 $6 = HEAP32[$5>>2]|0;
 $7 = ((($0)) + 16|0);
 $8 = HEAP32[$7>>2]|0;
 $9 = ((($0)) + 20|0);
 $10 = HEAP32[$9>>2]|0;
 HEAP32[$2>>2] = (728);
 $11 = ((($2)) + 4|0);
 HEAP32[$11>>2] = (856);
 $12 = ((($2)) + 26|0);
 HEAP16[$12>>1] = 0;
 $13 = ((($2)) + 24|0);
 HEAP16[$13>>1] = 0;
 $14 = ($4|0)==(0|0);
 if ($14) {
  $15 = ((($2)) + 32|0);
  HEAP32[$15>>2] = 0;
  return;
 }
 $16 = (_strlen($4)|0);
 $17 = (($16) + 2)|0;
 __THREW__ = 0;
 $ReallocAsyncCtx3 = (invoke_ii(259,24)|0);
 $18 = (__Znaj($17)|0);
 $IsAsync8 = ___async;
 if (!($IsAsync8)) {
  $24 = ___async_retval;
  HEAP32[$24>>2] = $18;
  ___async_unwind = 0;
 }
 HEAP32[$ReallocAsyncCtx3>>2] = 154;
 $19 = ((($ReallocAsyncCtx3)) + 4|0);
 HEAP32[$19>>2] = $6;
 $20 = ((($ReallocAsyncCtx3)) + 8|0);
 HEAP32[$20>>2] = $2;
 $21 = ((($ReallocAsyncCtx3)) + 12|0);
 HEAP32[$21>>2] = $8;
 $22 = ((($ReallocAsyncCtx3)) + 16|0);
 HEAP32[$22>>2] = $4;
 $23 = ((($ReallocAsyncCtx3)) + 20|0);
 HEAP32[$23>>2] = $10;
 sp = STACKTOP;
 return;
}
function __ZN11TextDisplayC2EPKc__async_cb_62($0) {
 $0 = $0|0;
 var $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $AsyncRetVal = 0, $IsAsync12 = 0;
 var $ReallocAsyncCtx4 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = ((($0)) + 4|0);
 $2 = HEAP32[$1>>2]|0;
 $3 = ((($0)) + 8|0);
 $4 = HEAP32[$3>>2]|0;
 $5 = ((($0)) + 12|0);
 $6 = HEAP32[$5>>2]|0;
 $7 = ((($0)) + 16|0);
 $8 = HEAP32[$7>>2]|0;
 $9 = ((($0)) + 20|0);
 $10 = HEAP32[$9>>2]|0;
 $11 = ___async_retval;
 $AsyncRetVal = HEAP32[$11>>2]|0;
 $12 = __THREW__; __THREW__ = 0;
 $13 = $12&1;
 if (!($13)) {
  $14 = ((($4)) + 32|0);
  HEAP32[$14>>2] = $AsyncRetVal;
  HEAP32[$6>>2] = $8;
  (_sprintf($AsyncRetVal,4774,$6)|0);
  return;
 }
 $15 = ___cxa_find_matching_catch_2()|0;
 $16 = tempRet0;
 __THREW__ = 0;
 $ReallocAsyncCtx4 = (invoke_ii(259,12)|0);
 __ZN4mbed6StreamD2Ev($2);
 $IsAsync12 = ___async;
 if (!($IsAsync12)) {
  ___async_unwind = 0;
 }
 HEAP32[$ReallocAsyncCtx4>>2] = 155;
 $17 = ((($ReallocAsyncCtx4)) + 4|0);
 HEAP32[$17>>2] = $15;
 $18 = ((($ReallocAsyncCtx4)) + 8|0);
 HEAP32[$18>>2] = $16;
 sp = STACKTOP;
 return;
}
function __ZN11TextDisplayC2EPKc__async_cb_63($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = ((($0)) + 4|0);
 $2 = HEAP32[$1>>2]|0;
 $3 = ((($0)) + 8|0);
 $4 = HEAP32[$3>>2]|0;
 $5 = __THREW__; __THREW__ = 0;
 $6 = $5&1;
 if ($6) {
  $7 = ___cxa_find_matching_catch_3(0|0)|0;
  $8 = tempRet0;
  (_emscripten_realloc_async_context(4)|0);
  ___clang_call_terminate($7);
  // unreachable;
 } else {
  ___resumeException($2|0);
  // unreachable;
 }
}
function _vfprintf__async_cb($0) {
 $0 = $0|0;
 var $$ = 0, $$1$ = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0;
 var $26 = 0, $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 $1 = ((($0)) + 4|0);
 $2 = HEAP32[$1>>2]|0;
 $3 = ((($0)) + 8|0);
 $4 = HEAP32[$3>>2]|0;
 $5 = ((($0)) + 12|0);
 $6 = HEAP32[$5>>2]|0;
 $7 = ((($0)) + 16|0);
 $8 = HEAP32[$7>>2]|0;
 $9 = ((($0)) + 20|0);
 $10 = HEAP32[$9>>2]|0;
 $11 = ((($0)) + 24|0);
 $12 = HEAP32[$11>>2]|0;
 $13 = ((($0)) + 28|0);
 $14 = HEAP32[$13>>2]|0;
 $15 = ((($0)) + 32|0);
 $16 = HEAP32[$15>>2]|0;
 $17 = ((($0)) + 36|0);
 $18 = HEAP32[$17>>2]|0;
 $19 = ((($0)) + 40|0);
 $20 = HEAP32[$19>>2]|0;
 $21 = ((($0)) + 44|0);
 $22 = HEAP32[$21>>2]|0;
 $23 = ((($0)) + 48|0);
 $24 = HEAP32[$23>>2]|0;
 $25 = ((($0)) + 52|0);
 $26 = HEAP32[$25>>2]|0;
 $27 = ((($0)) + 56|0);
 $28 = HEAP32[$27>>2]|0;
 $29 = ((($0)) + 60|0);
 $30 = HEAP32[$29>>2]|0;
 $31 = HEAP32[$2>>2]|0;
 $32 = ($31|0)==(0|0);
 $$ = $32 ? -1 : $4;
 HEAP32[$8>>2] = $6;
 HEAP32[$10>>2] = 0;
 HEAP32[$12>>2] = 0;
 HEAP32[$14>>2] = 0;
 HEAP32[$2>>2] = 0;
 $33 = HEAP32[$16>>2]|0;
 $34 = $33 & 32;
 $35 = ($34|0)==(0);
 $$1$ = $35 ? $$ : -1;
 $36 = $33 | $18;
 HEAP32[$16>>2] = $36;
 $37 = ($20|0)==(0);
 if (!($37)) {
  ___unlockfile($22);
 }
 $38 = ___async_retval;
 HEAP32[$38>>2] = $$1$;
 return;
}
function __ZN6C128327columnsEv__async_cb($0) {
 $0 = $0|0;
 var $1 = 0, $10 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $AsyncRetVal = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = ((($0)) + 4|0);
 $2 = HEAP32[$1>>2]|0;
 $3 = ___async_retval;
 $AsyncRetVal = HEAP32[$3>>2]|0;
 $4 = ((($2)) + 48|0);
 $5 = HEAP32[$4>>2]|0;
 $6 = ((($5)) + 1|0);
 $7 = HEAP8[$6>>0]|0;
 $8 = $7&255;
 $9 = (($AsyncRetVal|0) / ($8|0))&-1;
 $10 = ___async_retval;
 HEAP32[$10>>2] = $9;
 return;
}
function __ZSt9terminatev__async_cb($0) {
 $0 = $0|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 // unreachable;
}
function __ZSt9terminatev__async_cb_64($0) {
 $0 = $0|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 // unreachable;
}
function __ZSt9terminatev__async_cb_65($0) {
 $0 = $0|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 // unreachable;
}
function __ZN4mbed10FileHandle4flenEv__async_cb($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $AsyncRetVal = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = ___async_retval;
 $AsyncRetVal = HEAP32[$1>>2]|0;
 $2 = ___async_retval;
 HEAP32[$2>>2] = $AsyncRetVal;
 return;
}
function runPostSets() {
}
function _i64Subtract(a, b, c, d) {
    a = a|0; b = b|0; c = c|0; d = d|0;
    var l = 0, h = 0;
    l = (a - c)>>>0;
    h = (b - d)>>>0;
    h = (b - d - (((c>>>0) > (a>>>0))|0))>>>0; // Borrow one from high word to low word on underflow.
    return ((tempRet0 = h,l|0)|0);
}
function _i64Add(a, b, c, d) {
    /*
      x = a + b*2^32
      y = c + d*2^32
      result = l + h*2^32
    */
    a = a|0; b = b|0; c = c|0; d = d|0;
    var l = 0, h = 0;
    l = (a + c)>>>0;
    h = (b + d + (((l>>>0) < (a>>>0))|0))>>>0; // Add carry from low word to high word on overflow.
    return ((tempRet0 = h,l|0)|0);
}
function _memset(ptr, value, num) {
    ptr = ptr|0; value = value|0; num = num|0;
    var end = 0, aligned_end = 0, block_aligned_end = 0, value4 = 0;
    end = (ptr + num)|0;

    value = value & 0xff;
    if ((num|0) >= 67 /* 64 bytes for an unrolled loop + 3 bytes for unaligned head*/) {
      while ((ptr&3) != 0) {
        HEAP8[((ptr)>>0)]=value;
        ptr = (ptr+1)|0;
      }

      aligned_end = (end & -4)|0;
      block_aligned_end = (aligned_end - 64)|0;
      value4 = value | (value << 8) | (value << 16) | (value << 24);

      while((ptr|0) <= (block_aligned_end|0)) {
        HEAP32[((ptr)>>2)]=value4;
        HEAP32[(((ptr)+(4))>>2)]=value4;
        HEAP32[(((ptr)+(8))>>2)]=value4;
        HEAP32[(((ptr)+(12))>>2)]=value4;
        HEAP32[(((ptr)+(16))>>2)]=value4;
        HEAP32[(((ptr)+(20))>>2)]=value4;
        HEAP32[(((ptr)+(24))>>2)]=value4;
        HEAP32[(((ptr)+(28))>>2)]=value4;
        HEAP32[(((ptr)+(32))>>2)]=value4;
        HEAP32[(((ptr)+(36))>>2)]=value4;
        HEAP32[(((ptr)+(40))>>2)]=value4;
        HEAP32[(((ptr)+(44))>>2)]=value4;
        HEAP32[(((ptr)+(48))>>2)]=value4;
        HEAP32[(((ptr)+(52))>>2)]=value4;
        HEAP32[(((ptr)+(56))>>2)]=value4;
        HEAP32[(((ptr)+(60))>>2)]=value4;
        ptr = (ptr + 64)|0;
      }

      while ((ptr|0) < (aligned_end|0) ) {
        HEAP32[((ptr)>>2)]=value4;
        ptr = (ptr+4)|0;
      }
    }
    // The remaining bytes.
    while ((ptr|0) < (end|0)) {
      HEAP8[((ptr)>>0)]=value;
      ptr = (ptr+1)|0;
    }
    return (end-num)|0;
}
function _bitshift64Shl(low, high, bits) {
    low = low|0; high = high|0; bits = bits|0;
    var ander = 0;
    if ((bits|0) < 32) {
      ander = ((1 << bits) - 1)|0;
      tempRet0 = (high << bits) | ((low&(ander << (32 - bits))) >>> (32 - bits));
      return low << bits;
    }
    tempRet0 = low << (bits - 32);
    return 0;
}
function _emscripten_async_resume() {
    var callback = 0;
    ___async = 0;
    ___async_unwind = 1;
    while (1) {
      if (!___async_cur_frame) return;
      callback = ((HEAP32[(((___async_cur_frame)+(8))>>2)])|0);
      // the signature of callback is always vi
      // the only argument is ctx
      dynCall_vi(callback | 0, (___async_cur_frame + 8)|0);
      if (___async) return; // that was an async call
      if (!___async_unwind) {
        // keep the async stack
        ___async_unwind = 1;
        continue;
      }
      // unwind normal stack frame
      stackRestore(((HEAP32[(((___async_cur_frame)+(4))>>2)])|0));
      // pop the last async stack frame
      ___async_cur_frame = ((HEAP32[((___async_cur_frame)>>2)])|0);
    }
}
function _bitshift64Lshr(low, high, bits) {
    low = low|0; high = high|0; bits = bits|0;
    var ander = 0;
    if ((bits|0) < 32) {
      ander = ((1 << bits) - 1)|0;
      tempRet0 = high >>> bits;
      return (low >>> bits) | ((high&ander) << (32 - bits));
    }
    tempRet0 = 0;
    return (high >>> (bits - 32))|0;
}
function _emscripten_alloc_async_context(len, sp) {
    len = len|0;
    sp = sp|0;
    // len is the size of ctx
    // we also need to store prev_frame, stack pointer before ctx
    var new_frame = 0; new_frame = stackAlloc((len + 8)|0)|0;
    // save sp
    HEAP32[(((new_frame)+(4))>>2)]=sp;
    // link the frame with previous one
    HEAP32[((new_frame)>>2)]=___async_cur_frame;
    ___async_cur_frame = new_frame;
    return (___async_cur_frame + 8)|0;
}
function _emscripten_realloc_async_context(len) {
    len = len|0;
    // assuming that we have on the stacktop
    stackRestore(___async_cur_frame | 0);
    return ((stackAlloc((len + 8)|0)|0) + 8)|0;
}
function _memcpy(dest, src, num) {
    dest = dest|0; src = src|0; num = num|0;
    var ret = 0;
    var aligned_dest_end = 0;
    var block_aligned_dest_end = 0;
    var dest_end = 0;
    // Test against a benchmarked cutoff limit for when HEAPU8.set() becomes faster to use.
    if ((num|0) >=
      8192
    ) {
      return _emscripten_memcpy_big(dest|0, src|0, num|0)|0;
    }

    ret = dest|0;
    dest_end = (dest + num)|0;
    if ((dest&3) == (src&3)) {
      // The initial unaligned < 4-byte front.
      while (dest & 3) {
        if ((num|0) == 0) return ret|0;
        HEAP8[((dest)>>0)]=((HEAP8[((src)>>0)])|0);
        dest = (dest+1)|0;
        src = (src+1)|0;
        num = (num-1)|0;
      }
      aligned_dest_end = (dest_end & -4)|0;
      block_aligned_dest_end = (aligned_dest_end - 64)|0;
      while ((dest|0) <= (block_aligned_dest_end|0) ) {
        HEAP32[((dest)>>2)]=((HEAP32[((src)>>2)])|0);
        HEAP32[(((dest)+(4))>>2)]=((HEAP32[(((src)+(4))>>2)])|0);
        HEAP32[(((dest)+(8))>>2)]=((HEAP32[(((src)+(8))>>2)])|0);
        HEAP32[(((dest)+(12))>>2)]=((HEAP32[(((src)+(12))>>2)])|0);
        HEAP32[(((dest)+(16))>>2)]=((HEAP32[(((src)+(16))>>2)])|0);
        HEAP32[(((dest)+(20))>>2)]=((HEAP32[(((src)+(20))>>2)])|0);
        HEAP32[(((dest)+(24))>>2)]=((HEAP32[(((src)+(24))>>2)])|0);
        HEAP32[(((dest)+(28))>>2)]=((HEAP32[(((src)+(28))>>2)])|0);
        HEAP32[(((dest)+(32))>>2)]=((HEAP32[(((src)+(32))>>2)])|0);
        HEAP32[(((dest)+(36))>>2)]=((HEAP32[(((src)+(36))>>2)])|0);
        HEAP32[(((dest)+(40))>>2)]=((HEAP32[(((src)+(40))>>2)])|0);
        HEAP32[(((dest)+(44))>>2)]=((HEAP32[(((src)+(44))>>2)])|0);
        HEAP32[(((dest)+(48))>>2)]=((HEAP32[(((src)+(48))>>2)])|0);
        HEAP32[(((dest)+(52))>>2)]=((HEAP32[(((src)+(52))>>2)])|0);
        HEAP32[(((dest)+(56))>>2)]=((HEAP32[(((src)+(56))>>2)])|0);
        HEAP32[(((dest)+(60))>>2)]=((HEAP32[(((src)+(60))>>2)])|0);
        dest = (dest+64)|0;
        src = (src+64)|0;
      }
      while ((dest|0) < (aligned_dest_end|0) ) {
        HEAP32[((dest)>>2)]=((HEAP32[((src)>>2)])|0);
        dest = (dest+4)|0;
        src = (src+4)|0;
      }
    } else {
      // In the unaligned copy case, unroll a bit as well.
      aligned_dest_end = (dest_end - 4)|0;
      while ((dest|0) < (aligned_dest_end|0) ) {
        HEAP8[((dest)>>0)]=((HEAP8[((src)>>0)])|0);
        HEAP8[(((dest)+(1))>>0)]=((HEAP8[(((src)+(1))>>0)])|0);
        HEAP8[(((dest)+(2))>>0)]=((HEAP8[(((src)+(2))>>0)])|0);
        HEAP8[(((dest)+(3))>>0)]=((HEAP8[(((src)+(3))>>0)])|0);
        dest = (dest+4)|0;
        src = (src+4)|0;
      }
    }
    // The remaining unaligned < 4 byte tail.
    while ((dest|0) < (dest_end|0)) {
      HEAP8[((dest)>>0)]=((HEAP8[((src)>>0)])|0);
      dest = (dest+1)|0;
      src = (src+1)|0;
    }
    return ret|0;
}
function _llvm_cttz_i32(x) {
    x = x|0;
    var ret = 0;
    ret = ((HEAP8[(((cttz_i8)+(x & 0xff))>>0)])|0);
    if ((ret|0) < 8) return ret|0;
    ret = ((HEAP8[(((cttz_i8)+((x >> 8)&0xff))>>0)])|0);
    if ((ret|0) < 8) return (ret + 8)|0;
    ret = ((HEAP8[(((cttz_i8)+((x >> 16)&0xff))>>0)])|0);
    if ((ret|0) < 8) return (ret + 16)|0;
    return (((HEAP8[(((cttz_i8)+(x >>> 24))>>0)])|0) + 24)|0;
}
function ___udivmoddi4($a$0, $a$1, $b$0, $b$1, $rem) {
    $a$0 = $a$0 | 0;
    $a$1 = $a$1 | 0;
    $b$0 = $b$0 | 0;
    $b$1 = $b$1 | 0;
    $rem = $rem | 0;
    var $n_sroa_0_0_extract_trunc = 0, $n_sroa_1_4_extract_shift$0 = 0, $n_sroa_1_4_extract_trunc = 0, $d_sroa_0_0_extract_trunc = 0, $d_sroa_1_4_extract_shift$0 = 0, $d_sroa_1_4_extract_trunc = 0, $4 = 0, $17 = 0, $37 = 0, $49 = 0, $51 = 0, $57 = 0, $58 = 0, $66 = 0, $78 = 0, $86 = 0, $88 = 0, $89 = 0, $91 = 0, $92 = 0, $95 = 0, $105 = 0, $117 = 0, $119 = 0, $125 = 0, $126 = 0, $130 = 0, $q_sroa_1_1_ph = 0, $q_sroa_0_1_ph = 0, $r_sroa_1_1_ph = 0, $r_sroa_0_1_ph = 0, $sr_1_ph = 0, $d_sroa_0_0_insert_insert99$0 = 0, $d_sroa_0_0_insert_insert99$1 = 0, $137$0 = 0, $137$1 = 0, $carry_0203 = 0, $sr_1202 = 0, $r_sroa_0_1201 = 0, $r_sroa_1_1200 = 0, $q_sroa_0_1199 = 0, $q_sroa_1_1198 = 0, $147 = 0, $149 = 0, $r_sroa_0_0_insert_insert42$0 = 0, $r_sroa_0_0_insert_insert42$1 = 0, $150$1 = 0, $151$0 = 0, $152 = 0, $154$0 = 0, $r_sroa_0_0_extract_trunc = 0, $r_sroa_1_4_extract_trunc = 0, $155 = 0, $carry_0_lcssa$0 = 0, $carry_0_lcssa$1 = 0, $r_sroa_0_1_lcssa = 0, $r_sroa_1_1_lcssa = 0, $q_sroa_0_1_lcssa = 0, $q_sroa_1_1_lcssa = 0, $q_sroa_0_0_insert_ext75$0 = 0, $q_sroa_0_0_insert_ext75$1 = 0, $q_sroa_0_0_insert_insert77$1 = 0, $_0$0 = 0, $_0$1 = 0;
    $n_sroa_0_0_extract_trunc = $a$0;
    $n_sroa_1_4_extract_shift$0 = $a$1;
    $n_sroa_1_4_extract_trunc = $n_sroa_1_4_extract_shift$0;
    $d_sroa_0_0_extract_trunc = $b$0;
    $d_sroa_1_4_extract_shift$0 = $b$1;
    $d_sroa_1_4_extract_trunc = $d_sroa_1_4_extract_shift$0;
    if (($n_sroa_1_4_extract_trunc | 0) == 0) {
      $4 = ($rem | 0) != 0;
      if (($d_sroa_1_4_extract_trunc | 0) == 0) {
        if ($4) {
          HEAP32[$rem >> 2] = ($n_sroa_0_0_extract_trunc >>> 0) % ($d_sroa_0_0_extract_trunc >>> 0);
          HEAP32[$rem + 4 >> 2] = 0;
        }
        $_0$1 = 0;
        $_0$0 = ($n_sroa_0_0_extract_trunc >>> 0) / ($d_sroa_0_0_extract_trunc >>> 0) >>> 0;
        return (tempRet0 = $_0$1, $_0$0) | 0;
      } else {
        if (!$4) {
          $_0$1 = 0;
          $_0$0 = 0;
          return (tempRet0 = $_0$1, $_0$0) | 0;
        }
        HEAP32[$rem >> 2] = $a$0 & -1;
        HEAP32[$rem + 4 >> 2] = $a$1 & 0;
        $_0$1 = 0;
        $_0$0 = 0;
        return (tempRet0 = $_0$1, $_0$0) | 0;
      }
    }
    $17 = ($d_sroa_1_4_extract_trunc | 0) == 0;
    do {
      if (($d_sroa_0_0_extract_trunc | 0) == 0) {
        if ($17) {
          if (($rem | 0) != 0) {
            HEAP32[$rem >> 2] = ($n_sroa_1_4_extract_trunc >>> 0) % ($d_sroa_0_0_extract_trunc >>> 0);
            HEAP32[$rem + 4 >> 2] = 0;
          }
          $_0$1 = 0;
          $_0$0 = ($n_sroa_1_4_extract_trunc >>> 0) / ($d_sroa_0_0_extract_trunc >>> 0) >>> 0;
          return (tempRet0 = $_0$1, $_0$0) | 0;
        }
        if (($n_sroa_0_0_extract_trunc | 0) == 0) {
          if (($rem | 0) != 0) {
            HEAP32[$rem >> 2] = 0;
            HEAP32[$rem + 4 >> 2] = ($n_sroa_1_4_extract_trunc >>> 0) % ($d_sroa_1_4_extract_trunc >>> 0);
          }
          $_0$1 = 0;
          $_0$0 = ($n_sroa_1_4_extract_trunc >>> 0) / ($d_sroa_1_4_extract_trunc >>> 0) >>> 0;
          return (tempRet0 = $_0$1, $_0$0) | 0;
        }
        $37 = $d_sroa_1_4_extract_trunc - 1 | 0;
        if (($37 & $d_sroa_1_4_extract_trunc | 0) == 0) {
          if (($rem | 0) != 0) {
            HEAP32[$rem >> 2] = 0 | $a$0 & -1;
            HEAP32[$rem + 4 >> 2] = $37 & $n_sroa_1_4_extract_trunc | $a$1 & 0;
          }
          $_0$1 = 0;
          $_0$0 = $n_sroa_1_4_extract_trunc >>> ((_llvm_cttz_i32($d_sroa_1_4_extract_trunc | 0) | 0) >>> 0);
          return (tempRet0 = $_0$1, $_0$0) | 0;
        }
        $49 = Math_clz32($d_sroa_1_4_extract_trunc | 0) | 0;
        $51 = $49 - (Math_clz32($n_sroa_1_4_extract_trunc | 0) | 0) | 0;
        if ($51 >>> 0 <= 30) {
          $57 = $51 + 1 | 0;
          $58 = 31 - $51 | 0;
          $sr_1_ph = $57;
          $r_sroa_0_1_ph = $n_sroa_1_4_extract_trunc << $58 | $n_sroa_0_0_extract_trunc >>> ($57 >>> 0);
          $r_sroa_1_1_ph = $n_sroa_1_4_extract_trunc >>> ($57 >>> 0);
          $q_sroa_0_1_ph = 0;
          $q_sroa_1_1_ph = $n_sroa_0_0_extract_trunc << $58;
          break;
        }
        if (($rem | 0) == 0) {
          $_0$1 = 0;
          $_0$0 = 0;
          return (tempRet0 = $_0$1, $_0$0) | 0;
        }
        HEAP32[$rem >> 2] = 0 | $a$0 & -1;
        HEAP32[$rem + 4 >> 2] = $n_sroa_1_4_extract_shift$0 | $a$1 & 0;
        $_0$1 = 0;
        $_0$0 = 0;
        return (tempRet0 = $_0$1, $_0$0) | 0;
      } else {
        if (!$17) {
          $117 = Math_clz32($d_sroa_1_4_extract_trunc | 0) | 0;
          $119 = $117 - (Math_clz32($n_sroa_1_4_extract_trunc | 0) | 0) | 0;
          if ($119 >>> 0 <= 31) {
            $125 = $119 + 1 | 0;
            $126 = 31 - $119 | 0;
            $130 = $119 - 31 >> 31;
            $sr_1_ph = $125;
            $r_sroa_0_1_ph = $n_sroa_0_0_extract_trunc >>> ($125 >>> 0) & $130 | $n_sroa_1_4_extract_trunc << $126;
            $r_sroa_1_1_ph = $n_sroa_1_4_extract_trunc >>> ($125 >>> 0) & $130;
            $q_sroa_0_1_ph = 0;
            $q_sroa_1_1_ph = $n_sroa_0_0_extract_trunc << $126;
            break;
          }
          if (($rem | 0) == 0) {
            $_0$1 = 0;
            $_0$0 = 0;
            return (tempRet0 = $_0$1, $_0$0) | 0;
          }
          HEAP32[$rem >> 2] = 0 | $a$0 & -1;
          HEAP32[$rem + 4 >> 2] = $n_sroa_1_4_extract_shift$0 | $a$1 & 0;
          $_0$1 = 0;
          $_0$0 = 0;
          return (tempRet0 = $_0$1, $_0$0) | 0;
        }
        $66 = $d_sroa_0_0_extract_trunc - 1 | 0;
        if (($66 & $d_sroa_0_0_extract_trunc | 0) != 0) {
          $86 = (Math_clz32($d_sroa_0_0_extract_trunc | 0) | 0) + 33 | 0;
          $88 = $86 - (Math_clz32($n_sroa_1_4_extract_trunc | 0) | 0) | 0;
          $89 = 64 - $88 | 0;
          $91 = 32 - $88 | 0;
          $92 = $91 >> 31;
          $95 = $88 - 32 | 0;
          $105 = $95 >> 31;
          $sr_1_ph = $88;
          $r_sroa_0_1_ph = $91 - 1 >> 31 & $n_sroa_1_4_extract_trunc >>> ($95 >>> 0) | ($n_sroa_1_4_extract_trunc << $91 | $n_sroa_0_0_extract_trunc >>> ($88 >>> 0)) & $105;
          $r_sroa_1_1_ph = $105 & $n_sroa_1_4_extract_trunc >>> ($88 >>> 0);
          $q_sroa_0_1_ph = $n_sroa_0_0_extract_trunc << $89 & $92;
          $q_sroa_1_1_ph = ($n_sroa_1_4_extract_trunc << $89 | $n_sroa_0_0_extract_trunc >>> ($95 >>> 0)) & $92 | $n_sroa_0_0_extract_trunc << $91 & $88 - 33 >> 31;
          break;
        }
        if (($rem | 0) != 0) {
          HEAP32[$rem >> 2] = $66 & $n_sroa_0_0_extract_trunc;
          HEAP32[$rem + 4 >> 2] = 0;
        }
        if (($d_sroa_0_0_extract_trunc | 0) == 1) {
          $_0$1 = $n_sroa_1_4_extract_shift$0 | $a$1 & 0;
          $_0$0 = 0 | $a$0 & -1;
          return (tempRet0 = $_0$1, $_0$0) | 0;
        } else {
          $78 = _llvm_cttz_i32($d_sroa_0_0_extract_trunc | 0) | 0;
          $_0$1 = 0 | $n_sroa_1_4_extract_trunc >>> ($78 >>> 0);
          $_0$0 = $n_sroa_1_4_extract_trunc << 32 - $78 | $n_sroa_0_0_extract_trunc >>> ($78 >>> 0) | 0;
          return (tempRet0 = $_0$1, $_0$0) | 0;
        }
      }
    } while (0);
    if (($sr_1_ph | 0) == 0) {
      $q_sroa_1_1_lcssa = $q_sroa_1_1_ph;
      $q_sroa_0_1_lcssa = $q_sroa_0_1_ph;
      $r_sroa_1_1_lcssa = $r_sroa_1_1_ph;
      $r_sroa_0_1_lcssa = $r_sroa_0_1_ph;
      $carry_0_lcssa$1 = 0;
      $carry_0_lcssa$0 = 0;
    } else {
      $d_sroa_0_0_insert_insert99$0 = 0 | $b$0 & -1;
      $d_sroa_0_0_insert_insert99$1 = $d_sroa_1_4_extract_shift$0 | $b$1 & 0;
      $137$0 = _i64Add($d_sroa_0_0_insert_insert99$0 | 0, $d_sroa_0_0_insert_insert99$1 | 0, -1, -1) | 0;
      $137$1 = tempRet0;
      $q_sroa_1_1198 = $q_sroa_1_1_ph;
      $q_sroa_0_1199 = $q_sroa_0_1_ph;
      $r_sroa_1_1200 = $r_sroa_1_1_ph;
      $r_sroa_0_1201 = $r_sroa_0_1_ph;
      $sr_1202 = $sr_1_ph;
      $carry_0203 = 0;
      while (1) {
        $147 = $q_sroa_0_1199 >>> 31 | $q_sroa_1_1198 << 1;
        $149 = $carry_0203 | $q_sroa_0_1199 << 1;
        $r_sroa_0_0_insert_insert42$0 = 0 | ($r_sroa_0_1201 << 1 | $q_sroa_1_1198 >>> 31);
        $r_sroa_0_0_insert_insert42$1 = $r_sroa_0_1201 >>> 31 | $r_sroa_1_1200 << 1 | 0;
        _i64Subtract($137$0 | 0, $137$1 | 0, $r_sroa_0_0_insert_insert42$0 | 0, $r_sroa_0_0_insert_insert42$1 | 0) | 0;
        $150$1 = tempRet0;
        $151$0 = $150$1 >> 31 | (($150$1 | 0) < 0 ? -1 : 0) << 1;
        $152 = $151$0 & 1;
        $154$0 = _i64Subtract($r_sroa_0_0_insert_insert42$0 | 0, $r_sroa_0_0_insert_insert42$1 | 0, $151$0 & $d_sroa_0_0_insert_insert99$0 | 0, ((($150$1 | 0) < 0 ? -1 : 0) >> 31 | (($150$1 | 0) < 0 ? -1 : 0) << 1) & $d_sroa_0_0_insert_insert99$1 | 0) | 0;
        $r_sroa_0_0_extract_trunc = $154$0;
        $r_sroa_1_4_extract_trunc = tempRet0;
        $155 = $sr_1202 - 1 | 0;
        if (($155 | 0) == 0) {
          break;
        } else {
          $q_sroa_1_1198 = $147;
          $q_sroa_0_1199 = $149;
          $r_sroa_1_1200 = $r_sroa_1_4_extract_trunc;
          $r_sroa_0_1201 = $r_sroa_0_0_extract_trunc;
          $sr_1202 = $155;
          $carry_0203 = $152;
        }
      }
      $q_sroa_1_1_lcssa = $147;
      $q_sroa_0_1_lcssa = $149;
      $r_sroa_1_1_lcssa = $r_sroa_1_4_extract_trunc;
      $r_sroa_0_1_lcssa = $r_sroa_0_0_extract_trunc;
      $carry_0_lcssa$1 = 0;
      $carry_0_lcssa$0 = $152;
    }
    $q_sroa_0_0_insert_ext75$0 = $q_sroa_0_1_lcssa;
    $q_sroa_0_0_insert_ext75$1 = 0;
    $q_sroa_0_0_insert_insert77$1 = $q_sroa_1_1_lcssa | $q_sroa_0_0_insert_ext75$1;
    if (($rem | 0) != 0) {
      HEAP32[$rem >> 2] = 0 | $r_sroa_0_1_lcssa;
      HEAP32[$rem + 4 >> 2] = $r_sroa_1_1_lcssa | 0;
    }
    $_0$1 = (0 | $q_sroa_0_0_insert_ext75$0) >>> 31 | $q_sroa_0_0_insert_insert77$1 << 1 | ($q_sroa_0_0_insert_ext75$1 << 1 | $q_sroa_0_0_insert_ext75$0 >>> 31) & 0 | $carry_0_lcssa$1;
    $_0$0 = ($q_sroa_0_0_insert_ext75$0 << 1 | 0 >>> 31) & -2 | $carry_0_lcssa$0;
    return (tempRet0 = $_0$1, $_0$0) | 0;
}
function ___udivdi3($a$0, $a$1, $b$0, $b$1) {
    $a$0 = $a$0 | 0;
    $a$1 = $a$1 | 0;
    $b$0 = $b$0 | 0;
    $b$1 = $b$1 | 0;
    var $1$0 = 0;
    $1$0 = ___udivmoddi4($a$0, $a$1, $b$0, $b$1, 0) | 0;
    return $1$0 | 0;
}
function _sbrk(increment) {
    increment = increment|0;
    var oldDynamicTop = 0;
    var oldDynamicTopOnChange = 0;
    var newDynamicTop = 0;
    var totalMemory = 0;
    increment = ((increment + 15) & -16)|0;
    oldDynamicTop = HEAP32[DYNAMICTOP_PTR>>2]|0;
    newDynamicTop = oldDynamicTop + increment | 0;

    if (((increment|0) > 0 & (newDynamicTop|0) < (oldDynamicTop|0)) // Detect and fail if we would wrap around signed 32-bit int.
      | (newDynamicTop|0) < 0) { // Also underflow, sbrk() should be able to be used to subtract.
      abortOnCannotGrowMemory()|0;
      ___setErrNo(12);
      return -1;
    }

    HEAP32[DYNAMICTOP_PTR>>2] = newDynamicTop;
    totalMemory = getTotalMemory()|0;
    if ((newDynamicTop|0) > (totalMemory|0)) {
      if ((enlargeMemory()|0) == 0) {
        HEAP32[DYNAMICTOP_PTR>>2] = oldDynamicTop;
        ___setErrNo(12);
        return -1;
      }
    }
    return oldDynamicTop|0;
}
function ___uremdi3($a$0, $a$1, $b$0, $b$1) {
    $a$0 = $a$0 | 0;
    $a$1 = $a$1 | 0;
    $b$0 = $b$0 | 0;
    $b$1 = $b$1 | 0;
    var $rem = 0, __stackBase__ = 0;
    __stackBase__ = STACKTOP;
    STACKTOP = STACKTOP + 16 | 0;
    $rem = __stackBase__ | 0;
    ___udivmoddi4($a$0, $a$1, $b$0, $b$1, $rem) | 0;
    STACKTOP = __stackBase__;
    return (tempRet0 = HEAP32[$rem + 4 >> 2] | 0, HEAP32[$rem >> 2] | 0) | 0;
}
function _llvm_bswap_i32(x) {
    x = x|0;
    return (((x&0xff)<<24) | (((x>>8)&0xff)<<16) | (((x>>16)&0xff)<<8) | (x>>>24))|0;
}
function _emscripten_free_async_context(ctx) {
    //  this function is called when a possibly async function turned out to be sync
    //  just undo a recent emscripten_alloc_async_context
    ctx = ctx|0;
    assert((((___async_cur_frame + 8)|0) == (ctx|0))|0);
    stackRestore(___async_cur_frame | 0);
    ___async_cur_frame = ((HEAP32[((___async_cur_frame)>>2)])|0);
}

  
function dynCall_iiii(index,a1,a2,a3) {
  index = index|0;
  a1=a1|0; a2=a2|0; a3=a3|0;
  return FUNCTION_TABLE_iiii[index&255](a1|0,a2|0,a3|0)|0;
}


function dynCall_viiiii(index,a1,a2,a3,a4,a5) {
  index = index|0;
  a1=a1|0; a2=a2|0; a3=a3|0; a4=a4|0; a5=a5|0;
  FUNCTION_TABLE_viiiii[index&127](a1|0,a2|0,a3|0,a4|0,a5|0);
}


function dynCall_i(index) {
  index = index|0;
  
  return FUNCTION_TABLE_i[index&255]()|0;
}


function dynCall_vi(index,a1) {
  index = index|0;
  a1=a1|0;
  FUNCTION_TABLE_vi[index&511](a1|0);
}


function dynCall_vii(index,a1,a2) {
  index = index|0;
  a1=a1|0; a2=a2|0;
  FUNCTION_TABLE_vii[index&255](a1|0,a2|0);
}


function dynCall_ii(index,a1) {
  index = index|0;
  a1=a1|0;
  return FUNCTION_TABLE_ii[index&511](a1|0)|0;
}


function dynCall_viii(index,a1,a2,a3) {
  index = index|0;
  a1=a1|0; a2=a2|0; a3=a3|0;
  FUNCTION_TABLE_viii[index&255](a1|0,a2|0,a3|0);
}


function dynCall_v(index) {
  index = index|0;
  
  FUNCTION_TABLE_v[index&255]();
}


function dynCall_viiiiii(index,a1,a2,a3,a4,a5,a6) {
  index = index|0;
  a1=a1|0; a2=a2|0; a3=a3|0; a4=a4|0; a5=a5|0; a6=a6|0;
  FUNCTION_TABLE_viiiiii[index&127](a1|0,a2|0,a3|0,a4|0,a5|0,a6|0);
}


function dynCall_iii(index,a1,a2) {
  index = index|0;
  a1=a1|0; a2=a2|0;
  return FUNCTION_TABLE_iii[index&255](a1|0,a2|0)|0;
}


function dynCall_viiii(index,a1,a2,a3,a4) {
  index = index|0;
  a1=a1|0; a2=a2|0; a3=a3|0; a4=a4|0;
  FUNCTION_TABLE_viiii[index&127](a1|0,a2|0,a3|0,a4|0);
}

function b0(p0,p1,p2) {
 p0 = p0|0;p1 = p1|0;p2 = p2|0; nullFunc_iiii(0);return 0;
}
function b1(p0,p1,p2,p3,p4) {
 p0 = p0|0;p1 = p1|0;p2 = p2|0;p3 = p3|0;p4 = p4|0; nullFunc_viiiii(1);
}
function b2() {
 ; nullFunc_i(2);return 0;
}
function b3(p0) {
 p0 = p0|0; nullFunc_vi(3);
}
function b4(p0,p1) {
 p0 = p0|0;p1 = p1|0; nullFunc_vii(4);
}
function b5(p0) {
 p0 = p0|0; nullFunc_ii(5);return 0;
}
function _emscripten_realloc_async_context__wrapper(p0) {
 p0 = p0|0; return _emscripten_realloc_async_context(p0|0)|0;
}
function b6(p0,p1,p2) {
 p0 = p0|0;p1 = p1|0;p2 = p2|0; nullFunc_viii(6);
}
function b7() {
 ; nullFunc_v(7);
}
function ___cxa_pure_virtual__wrapper() {
 ; ___cxa_pure_virtual();
}
function ___cxa_end_catch__wrapper() {
 ; ___cxa_end_catch();
}
function b8(p0,p1,p2,p3,p4,p5) {
 p0 = p0|0;p1 = p1|0;p2 = p2|0;p3 = p3|0;p4 = p4|0;p5 = p5|0; nullFunc_viiiiii(8);
}
function b9(p0,p1) {
 p0 = p0|0;p1 = p1|0; nullFunc_iii(9);return 0;
}
function b10(p0,p1,p2,p3) {
 p0 = p0|0;p1 = p1|0;p2 = p2|0;p3 = p3|0; nullFunc_viiii(10);
}

// EMSCRIPTEN_END_FUNCS
var FUNCTION_TABLE_iiii = [b0,b0,b0,__ZN4mbed6Stream4readEPvj,__ZN4mbed6Stream5writeEPKvj,__ZN4mbed6Stream4seekEii,b0,b0,b0,b0,b0,b0,__ZN4mbed10FileHandle5lseekEii,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0
,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0
,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,___stdio_write,___stdio_seek,___stdout_write,_sn_write,b0,b0,b0,b0,b0,__ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv,b0,b0
,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0
,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0
,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0
,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,___stdio_read
,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0
,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0];
var FUNCTION_TABLE_viiiii = [b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1
,b1,b1,b1,b1,b1,__ZN15GraphicsDisplay6windowEiiii,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1
,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,__ZNK10__cxxabiv117__class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib
,b1,b1,b1,__ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib,b1,b1,b1,b1,b1,b1,__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1
,b1,b1,b1,b1,b1,b1,b1,b1,b1];
var FUNCTION_TABLE_i = [b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2
,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2
,_us_ticker_read,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2
,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2
,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2
,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2
,b2,b2,b2,b2,b2,___errno_location,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2
,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2
,b2,b2,___cxa_get_globals_fast,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2];
var FUNCTION_TABLE_vi = [b3,__ZN4mbed6StreamD2Ev,__ZN6C12832D0Ev,b3,b3,b3,b3,b3,b3,b3,__ZN4mbed6Stream6rewindEv,b3,b3,b3,b3,b3,b3,b3,b3,b3,__ZN6C128326_flushEv,__ZN4mbed6Stream4lockEv,__ZN4mbed6Stream6unlockEv,b3,b3,b3,b3,__ZN6C128323clsEv,b3
,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,__ZThn4_N6C12832D1Ev,__ZThn4_N6C12832D0Ev,__ZN15GraphicsDisplayD0Ev,b3,b3,b3,b3,b3,__ZN15GraphicsDisplay3clsEv,b3,__ZThn4_N15GraphicsDisplayD1Ev,__ZThn4_N15GraphicsDisplayD0Ev,__ZN11TextDisplayD0Ev,__ZN11TextDisplay3clsEv,__ZThn4_N11TextDisplayD1Ev,__ZThn4_N11TextDisplayD0Ev,__ZN4mbed7TimeoutD2Ev,__ZN4mbed7TimeoutD0Ev,__ZN4mbed7Timeout7handlerEv,b3
,b3,b3,b3,_us_ticker_set_interrupt,b3,__ZN4mbed8FileBaseD2Ev,__ZN4mbed8FileBaseD0Ev,__ZN4mbed11NonCopyableINS_10FileHandleEED2Ev,__ZN4mbed10FileHandleD0Ev,b3,b3,b3,__ZN4mbed10FileHandle6rewindEv,b3,__ZN4mbed6StreamD0Ev,__ZThn4_N4mbed6StreamD1Ev,__ZThn4_N4mbed6StreamD0Ev,b3,b3,b3,b3,b3,b3,__ZN10__cxxabiv116__shim_type_infoD2Ev,__ZN10__cxxabiv117__class_type_infoD0Ev,__ZNK10__cxxabiv116__shim_type_info5noop1Ev,__ZNK10__cxxabiv116__shim_type_info5noop2Ev,b3,b3,b3
,b3,__ZN10__cxxabiv120__si_class_type_infoD0Ev,b3,b3,b3,__ZNSt9bad_allocD2Ev,__ZNSt9bad_allocD0Ev,b3,__ZN10__cxxabiv121__vmi_class_type_infoD0Ev,b3,b3,b3,__ZN6C12832D0Ev__async_cb,__ZN4mbed10FileHandle5lseekEii__async_cb,__ZN4mbed10FileHandle5fsyncEv__async_cb,__ZN4mbed10FileHandle4flenEv__async_cb,__ZN6C128325_putcEi__async_cb,__ZN6C128325_putcEi__async_cb_6,__ZN6C128329characterEiii__async_cb,__ZN6C128329characterEiii__async_cb_41,__ZN6C128329characterEiii__async_cb_42,__ZN6C128329characterEiii__async_cb_43,__ZN6C128324rowsEv__async_cb,__ZN6C128327columnsEv__async_cb,__ZThn4_N6C12832D1Ev__async_cb,__ZThn4_N6C12832D0Ev__async_cb,__ZN6C12832C2E7PinNameS0_S0_S0_S0_PKc__async_cb_35,__ZN6C12832C2E7PinNameS0_S0_S0_S0_PKc__async_cb,__ZN6C12832C2E7PinNameS0_S0_S0_S0_PKc__async_cb_34,__ZN15GraphicsDisplayD0Ev__async_cb
,__ZN15GraphicsDisplay9characterEiii__async_cb,__ZN15GraphicsDisplay4rowsEv__async_cb,__ZN15GraphicsDisplay7columnsEv__async_cb,__ZN15GraphicsDisplay3clsEv__async_cb,__ZN15GraphicsDisplay3clsEv__async_cb_44,__ZN15GraphicsDisplay3clsEv__async_cb_45,__ZN15GraphicsDisplay4putpEi__async_cb,__ZN15GraphicsDisplay4fillEiiiii__async_cb,__ZN15GraphicsDisplay4fillEiiiii__async_cb_40,__ZN15GraphicsDisplay4blitEiiiiPKi__async_cb,__ZN15GraphicsDisplay4blitEiiiiPKi__async_cb_37,__ZN15GraphicsDisplay7blitbitEiiiiPKc__async_cb,__ZN15GraphicsDisplay7blitbitEiiiiPKc__async_cb_17,__ZThn4_N15GraphicsDisplayD1Ev__async_cb,__ZThn4_N15GraphicsDisplayD0Ev__async_cb,__ZN15GraphicsDisplayC2EPKc__async_cb_49,__ZN15GraphicsDisplayC2EPKc__async_cb,__ZN15GraphicsDisplayC2EPKc__async_cb_50,__ZN11TextDisplayD0Ev__async_cb,__ZN11TextDisplay5_putcEi__async_cb,__ZN11TextDisplay5_putcEi__async_cb_53,__ZN11TextDisplay5_putcEi__async_cb_54,__ZN11TextDisplay5_putcEi__async_cb_55,__ZN11TextDisplay5claimEP8_IO_FILE__async_cb_39,__ZN11TextDisplay5claimEP8_IO_FILE__async_cb,__ZN11TextDisplay3clsEv__async_cb,__ZN11TextDisplay3clsEv__async_cb_18,__ZN11TextDisplay3clsEv__async_cb_19,__ZN11TextDisplay3clsEv__async_cb_22,__ZN11TextDisplay3clsEv__async_cb_20
,__ZN11TextDisplay3clsEv__async_cb_21,__ZThn4_N11TextDisplayD1Ev__async_cb,__ZThn4_N11TextDisplayD0Ev__async_cb,__ZN11TextDisplayC2EPKc__async_cb_61,b3,__ZN11TextDisplayC2EPKc__async_cb_62,__ZN11TextDisplayC2EPKc__async_cb_63,_invoke_ticker__async_cb,__ZN4mbed7TimeoutD2Ev__async_cb,__ZN4mbed7TimeoutD0Ev__async_cb,__ZN4mbed7Timeout7handlerEv__async_cb,_invoke_timeout__async_cb,__ZN4mbed5TimerC2Ev__async_cb,__GLOBAL__sub_I_arm_hal_timer_cpp__async_cb,_ticker_read_us__async_cb,b3,__ZN4mbed10FileHandle4tellEv__async_cb,__ZN4mbed10FileHandle6rewindEv__async_cb,__ZN4mbed10FileHandle4sizeEv__async_cb,__ZN4mbed10FileHandle4sizeEv__async_cb_23,__ZN4mbed10FileHandle4sizeEv__async_cb_24,__ZN4mbed6fdopenEPNS_10FileHandleEPKc__async_cb,__ZN4mbed6StreamD2Ev__async_cb,__ZN4mbed6StreamD0Ev__async_cb,__ZN4mbed6Stream4readEPvj__async_cb,__ZN4mbed6Stream4readEPvj__async_cb_2,__ZN4mbed6Stream4readEPvj__async_cb_3,__ZN4mbed6Stream5writeEPKvj__async_cb,__ZN4mbed6Stream5writeEPKvj__async_cb_7,__ZN4mbed6Stream5writeEPKvj__async_cb_8
,__ZThn4_N4mbed6StreamD1Ev__async_cb,__ZThn4_N4mbed6StreamD0Ev__async_cb,b3,__ZN4mbed6StreamC2EPKc__async_cb_4,__ZN4mbed26mbed_set_unbuffered_streamEP8_IO_FILE,b3,b3,__ZN4mbed6Stream4putcEi__async_cb,__ZN4mbed6Stream4putcEi__async_cb_13,__ZN4mbed6Stream4putcEi__async_cb_14,__ZN4mbed6Stream6printfEPKcz__async_cb,__ZN4mbed6Stream6printfEPKcz__async_cb_29,__ZN4mbed6Stream6printfEPKcz__async_cb_26,__ZN4mbed6Stream6printfEPKcz__async_cb_27,__ZN4mbed6Stream6printfEPKcz__async_cb_28,_error__async_cb_38,_mbed_die__async_cb,_mbed_error_vfprintf__async_cb,_exit__async_cb,__ZN4mbed11mbed_fdopenEPNS_10FileHandleEPKc__async_cb,_wait__async_cb,__GLOBAL__sub_I_main_cpp__async_cb,___cxx_global_var_init__async_cb,_main__async_cb,_sprintf__async_cb,_vsprintf__async_cb,_vsnprintf__async_cb,_vfprintf__async_cb,___overflow__async_cb,b3
,_fclose__async_cb_16,_fclose__async_cb,_fflush__async_cb_58,_fflush__async_cb_57,_fflush__async_cb_59,_fflush__async_cb,___fflush_unlocked__async_cb,___fflush_unlocked__async_cb_52,_fputc__async_cb_56,_fputc__async_cb,_freopen__async_cb,_freopen__async_cb_32,_freopen__async_cb_31,_freopen__async_cb_30,_printf__async_cb,_puts__async_cb,__Znwj__async_cb,__Znaj__async_cb,__ZL25default_terminate_handlerv__async_cb,__ZL25default_terminate_handlerv__async_cb_25,b3,_abort_message__async_cb_36,_abort_message__async_cb,__ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv__async_cb_60,__ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv__async_cb,___dynamic_cast__async_cb,___dynamic_cast__async_cb_1,__ZNK10__cxxabiv120__si_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb,__ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb,__ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_51
,__ZNK10__cxxabiv120__si_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb,__ZN10__cxxabiv112_GLOBAL__N_19destruct_EPv,b3,__ZSt11__terminatePFvvE__async_cb,b3,b3,__ZNK10__cxxabiv121__vmi_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb_15,__ZNK10__cxxabiv121__vmi_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb,__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_12,__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_11,__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_10,__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_9,__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb,__ZNK10__cxxabiv121__vmi_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb_5,__ZNK10__cxxabiv121__vmi_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb,__ZNK10__cxxabiv122__base_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb,__ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb,__ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb,___cxa_can_catch__async_cb,___cxa_is_pointer_type__async_cb,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3
,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3
,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3
,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3
,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3
,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3
,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3
,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3
,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3
,b3,b3,b3];
var FUNCTION_TABLE_vii = [b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,__ZN4mbed10FileHandle5sigioENS_8CallbackIFvvEEE,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4
,__ZN11TextDisplay10foregroundEt,__ZN11TextDisplay10backgroundEt,b4,b4,b4,b4,__ZN15GraphicsDisplay4putpEi,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4
,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4
,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4
,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4
,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4
,b4,b4,b4,b4,b4,b4,_error,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4
,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4
,b4,b4,b4,b4,_abort_message,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4];
var FUNCTION_TABLE_ii = [b5,b5,b5,b5,b5,b5,__ZN4mbed6Stream5closeEv,__ZN4mbed6Stream4syncEv,__ZN4mbed6Stream6isattyEv,__ZN4mbed6Stream4tellEv,b5,__ZN4mbed6Stream4sizeEv,b5,__ZN4mbed10FileHandle5fsyncEv,__ZN4mbed10FileHandle4flenEv,b5,b5,b5,b5,__ZN11TextDisplay5_getcEv,b5,b5,b5,b5,__ZN6C128324rowsEv,__ZN6C128327columnsEv,b5,b5,b5
,b5,b5,b5,__ZN6C128325widthEv,__ZN6C128326heightEv,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,__ZN15GraphicsDisplay4rowsEv,__ZN15GraphicsDisplay7columnsEv,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5
,b5,b5,b5,b5,b5,b5,b5,b5,b5,__ZN4mbed10FileHandle4syncEv,__ZN4mbed10FileHandle6isattyEv,__ZN4mbed10FileHandle4tellEv,b5,__ZN4mbed10FileHandle4sizeEv,b5,b5,b5,___stdio_close,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5
,b5,b5,b5,b5,b5,b5,b5,__ZNKSt9bad_alloc4whatEv,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5
,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5
,b5,b5,b5,b5,__Znaj,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5
,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5
,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5
,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,_emscripten_realloc_async_context__wrapper,b5,b5,b5,b5,b5,b5,b5,b5,b5
,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5
,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5
,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5
,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5
,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5
,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5
,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5
,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5
,b5,b5,b5];
var FUNCTION_TABLE_viii = [b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,__ZN6C128326locateEii
,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,__ZN11TextDisplay6locateEii,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6
,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6
,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6
,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6
,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,_mbed_assert_internal,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6
,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6
,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6
,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6];
var FUNCTION_TABLE_v = [b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7
,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,___cxa_pure_virtual__wrapper,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,_us_ticker_init
,b7,_us_ticker_disable_interrupt,_us_ticker_clear_interrupt,b7,_us_ticker_fire_interrupt,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,__ZL25default_terminate_handlerv,b7,b7,b7,b7,b7,b7,b7
,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7
,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7
,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7
,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7
,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,__ZN10__cxxabiv112_GLOBAL__N_110construct_Ev,b7,b7,b7,b7,b7,b7,b7,b7,b7
,b7,b7,b7,b7,b7,___cxa_end_catch__wrapper,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7];
var FUNCTION_TABLE_viiiiii = [b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8
,b8,b8,b8,b8,b8,b8,b8,__ZN15GraphicsDisplay4fillEiiiii,__ZN15GraphicsDisplay4blitEiiiiPKi,__ZN15GraphicsDisplay7blitbitEiiiiPKc,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8
,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,__ZNK10__cxxabiv117__class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib,b8
,b8,b8,__ZNK10__cxxabiv120__si_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib,b8,b8,b8,b8,b8,b8,__ZNK10__cxxabiv121__vmi_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8
,b8,b8,b8,b8,b8,b8,b8,b8,b8];
var FUNCTION_TABLE_iii = [b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,__ZN4mbed10FileHandle12set_blockingEb,__ZNK4mbed10FileHandle4pollEs,b9,__ZN6C128325_putcEi,b9,b9,b9,b9,b9,b9,b9,__ZN11TextDisplay5claimEP8_IO_FILE,b9,b9
,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,__ZN11TextDisplay5_putcEi,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9
,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9
,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9
,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9
,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9
,b9,b9,__ZN4mbed6fdopenEPNS_10FileHandleEPKc,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9
,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9
,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9];
var FUNCTION_TABLE_viiii = [b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,__ZN6C128329characterEiii,b10,b10,b10,b10,b10
,b10,b10,__ZN6C128325pixelEiii,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,__ZN15GraphicsDisplay9characterEiii,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10
,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10
,__ZNK10__cxxabiv117__class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi,b10,b10,b10,__ZNK10__cxxabiv120__si_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi,b10,b10,b10,b10,b10,b10,__ZNK10__cxxabiv121__vmi_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10
,b10,b10,b10,b10,b10,b10,b10,b10,b10];

  return { _llvm_bswap_i32: _llvm_bswap_i32, _main: _main, stackSave: stackSave, _i64Subtract: _i64Subtract, ___udivdi3: ___udivdi3, _emscripten_alloc_async_context: _emscripten_alloc_async_context, setThrew: setThrew, dynCall_viii: dynCall_viii, _bitshift64Lshr: _bitshift64Lshr, _emscripten_async_resume: _emscripten_async_resume, _bitshift64Shl: _bitshift64Shl, _invoke_ticker: _invoke_ticker, ___cxa_is_pointer_type: ___cxa_is_pointer_type, dynCall_iii: dynCall_iii, _memset: _memset, dynCall_ii: dynCall_ii, _sbrk: _sbrk, _memcpy: _memcpy, stackAlloc: stackAlloc, dynCall_vii: dynCall_vii, ___uremdi3: ___uremdi3, dynCall_vi: dynCall_vi, getTempRet0: getTempRet0, __GLOBAL__sub_I_arm_hal_timer_cpp: __GLOBAL__sub_I_arm_hal_timer_cpp, setTempRet0: setTempRet0, _i64Add: _i64Add, dynCall_iiii: dynCall_iiii, _emscripten_realloc_async_context: _emscripten_realloc_async_context, __GLOBAL__sub_I_main_cpp: __GLOBAL__sub_I_main_cpp, _emscripten_get_global_libc: _emscripten_get_global_libc, setAsync: setAsync, dynCall_i: dynCall_i, dynCall_viiii: dynCall_viiii, _invoke_timeout: _invoke_timeout, ___errno_location: ___errno_location, dynCall_viiiii: dynCall_viiiii, _emscripten_free_async_context: _emscripten_free_async_context, ___cxa_can_catch: ___cxa_can_catch, _free: _free, runPostSets: runPostSets, dynCall_viiiiii: dynCall_viiiiii, establishStackSpace: establishStackSpace, stackRestore: stackRestore, _malloc: _malloc, _handle_interrupt_in: _handle_interrupt_in, dynCall_v: dynCall_v };
})
// EMSCRIPTEN_END_ASM
(Module.asmGlobalArg, Module.asmLibraryArg, buffer);

var real__main = asm["_main"]; asm["_main"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real__main.apply(null, arguments);
};

var real_stackSave = asm["stackSave"]; asm["stackSave"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real_stackSave.apply(null, arguments);
};

var real___GLOBAL__sub_I_main_cpp = asm["__GLOBAL__sub_I_main_cpp"]; asm["__GLOBAL__sub_I_main_cpp"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real___GLOBAL__sub_I_main_cpp.apply(null, arguments);
};

var real____udivdi3 = asm["___udivdi3"]; asm["___udivdi3"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real____udivdi3.apply(null, arguments);
};

var real__emscripten_alloc_async_context = asm["_emscripten_alloc_async_context"]; asm["_emscripten_alloc_async_context"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real__emscripten_alloc_async_context.apply(null, arguments);
};

var real_getTempRet0 = asm["getTempRet0"]; asm["getTempRet0"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real_getTempRet0.apply(null, arguments);
};

var real__bitshift64Lshr = asm["_bitshift64Lshr"]; asm["_bitshift64Lshr"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real__bitshift64Lshr.apply(null, arguments);
};

var real__emscripten_async_resume = asm["_emscripten_async_resume"]; asm["_emscripten_async_resume"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real__emscripten_async_resume.apply(null, arguments);
};

var real__bitshift64Shl = asm["_bitshift64Shl"]; asm["_bitshift64Shl"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real__bitshift64Shl.apply(null, arguments);
};

var real__invoke_ticker = asm["_invoke_ticker"]; asm["_invoke_ticker"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real__invoke_ticker.apply(null, arguments);
};

var real____cxa_is_pointer_type = asm["___cxa_is_pointer_type"]; asm["___cxa_is_pointer_type"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real____cxa_is_pointer_type.apply(null, arguments);
};

var real__sbrk = asm["_sbrk"]; asm["_sbrk"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real__sbrk.apply(null, arguments);
};

var real____errno_location = asm["___errno_location"]; asm["___errno_location"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real____errno_location.apply(null, arguments);
};

var real____uremdi3 = asm["___uremdi3"]; asm["___uremdi3"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real____uremdi3.apply(null, arguments);
};

var real_stackAlloc = asm["stackAlloc"]; asm["stackAlloc"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real_stackAlloc.apply(null, arguments);
};

var real__i64Subtract = asm["_i64Subtract"]; asm["_i64Subtract"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real__i64Subtract.apply(null, arguments);
};

var real___GLOBAL__sub_I_arm_hal_timer_cpp = asm["__GLOBAL__sub_I_arm_hal_timer_cpp"]; asm["__GLOBAL__sub_I_arm_hal_timer_cpp"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real___GLOBAL__sub_I_arm_hal_timer_cpp.apply(null, arguments);
};

var real_setTempRet0 = asm["setTempRet0"]; asm["setTempRet0"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real_setTempRet0.apply(null, arguments);
};

var real__i64Add = asm["_i64Add"]; asm["_i64Add"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real__i64Add.apply(null, arguments);
};

var real____cxa_can_catch = asm["___cxa_can_catch"]; asm["___cxa_can_catch"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real____cxa_can_catch.apply(null, arguments);
};

var real__emscripten_get_global_libc = asm["_emscripten_get_global_libc"]; asm["_emscripten_get_global_libc"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real__emscripten_get_global_libc.apply(null, arguments);
};

var real__invoke_timeout = asm["_invoke_timeout"]; asm["_invoke_timeout"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real__invoke_timeout.apply(null, arguments);
};

var real__llvm_bswap_i32 = asm["_llvm_bswap_i32"]; asm["_llvm_bswap_i32"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real__llvm_bswap_i32.apply(null, arguments);
};

var real__emscripten_free_async_context = asm["_emscripten_free_async_context"]; asm["_emscripten_free_async_context"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real__emscripten_free_async_context.apply(null, arguments);
};

var real__emscripten_realloc_async_context = asm["_emscripten_realloc_async_context"]; asm["_emscripten_realloc_async_context"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real__emscripten_realloc_async_context.apply(null, arguments);
};

var real__free = asm["_free"]; asm["_free"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real__free.apply(null, arguments);
};

var real_setThrew = asm["setThrew"]; asm["setThrew"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real_setThrew.apply(null, arguments);
};

var real_establishStackSpace = asm["establishStackSpace"]; asm["establishStackSpace"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real_establishStackSpace.apply(null, arguments);
};

var real_stackRestore = asm["stackRestore"]; asm["stackRestore"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real_stackRestore.apply(null, arguments);
};

var real__malloc = asm["_malloc"]; asm["_malloc"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real__malloc.apply(null, arguments);
};

var real__handle_interrupt_in = asm["_handle_interrupt_in"]; asm["_handle_interrupt_in"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real__handle_interrupt_in.apply(null, arguments);
};
var _main = Module["_main"] = asm["_main"];
var stackSave = Module["stackSave"] = asm["stackSave"];
var __GLOBAL__sub_I_main_cpp = Module["__GLOBAL__sub_I_main_cpp"] = asm["__GLOBAL__sub_I_main_cpp"];
var ___udivdi3 = Module["___udivdi3"] = asm["___udivdi3"];
var _emscripten_alloc_async_context = Module["_emscripten_alloc_async_context"] = asm["_emscripten_alloc_async_context"];
var getTempRet0 = Module["getTempRet0"] = asm["getTempRet0"];
var _bitshift64Lshr = Module["_bitshift64Lshr"] = asm["_bitshift64Lshr"];
var _emscripten_async_resume = Module["_emscripten_async_resume"] = asm["_emscripten_async_resume"];
var _bitshift64Shl = Module["_bitshift64Shl"] = asm["_bitshift64Shl"];
var _invoke_ticker = Module["_invoke_ticker"] = asm["_invoke_ticker"];
var ___cxa_is_pointer_type = Module["___cxa_is_pointer_type"] = asm["___cxa_is_pointer_type"];
var _memset = Module["_memset"] = asm["_memset"];
var _sbrk = Module["_sbrk"] = asm["_sbrk"];
var _memcpy = Module["_memcpy"] = asm["_memcpy"];
var ___errno_location = Module["___errno_location"] = asm["___errno_location"];
var ___uremdi3 = Module["___uremdi3"] = asm["___uremdi3"];
var stackAlloc = Module["stackAlloc"] = asm["stackAlloc"];
var _i64Subtract = Module["_i64Subtract"] = asm["_i64Subtract"];
var __GLOBAL__sub_I_arm_hal_timer_cpp = Module["__GLOBAL__sub_I_arm_hal_timer_cpp"] = asm["__GLOBAL__sub_I_arm_hal_timer_cpp"];
var setTempRet0 = Module["setTempRet0"] = asm["setTempRet0"];
var _i64Add = Module["_i64Add"] = asm["_i64Add"];
var ___cxa_can_catch = Module["___cxa_can_catch"] = asm["___cxa_can_catch"];
var _emscripten_get_global_libc = Module["_emscripten_get_global_libc"] = asm["_emscripten_get_global_libc"];
var _invoke_timeout = Module["_invoke_timeout"] = asm["_invoke_timeout"];
var _llvm_bswap_i32 = Module["_llvm_bswap_i32"] = asm["_llvm_bswap_i32"];
var _emscripten_free_async_context = Module["_emscripten_free_async_context"] = asm["_emscripten_free_async_context"];
var _emscripten_realloc_async_context = Module["_emscripten_realloc_async_context"] = asm["_emscripten_realloc_async_context"];
var _free = Module["_free"] = asm["_free"];
var runPostSets = Module["runPostSets"] = asm["runPostSets"];
var setThrew = Module["setThrew"] = asm["setThrew"];
var establishStackSpace = Module["establishStackSpace"] = asm["establishStackSpace"];
var stackRestore = Module["stackRestore"] = asm["stackRestore"];
var _malloc = Module["_malloc"] = asm["_malloc"];
var _handle_interrupt_in = Module["_handle_interrupt_in"] = asm["_handle_interrupt_in"];
var dynCall_iiii = Module["dynCall_iiii"] = asm["dynCall_iiii"];
var dynCall_viiiii = Module["dynCall_viiiii"] = asm["dynCall_viiiii"];
var dynCall_i = Module["dynCall_i"] = asm["dynCall_i"];
var dynCall_vi = Module["dynCall_vi"] = asm["dynCall_vi"];
var dynCall_vii = Module["dynCall_vii"] = asm["dynCall_vii"];
var dynCall_ii = Module["dynCall_ii"] = asm["dynCall_ii"];
var dynCall_viii = Module["dynCall_viii"] = asm["dynCall_viii"];
var dynCall_v = Module["dynCall_v"] = asm["dynCall_v"];
var dynCall_viiiiii = Module["dynCall_viiiiii"] = asm["dynCall_viiiiii"];
var dynCall_iii = Module["dynCall_iii"] = asm["dynCall_iii"];
var dynCall_viiii = Module["dynCall_viiii"] = asm["dynCall_viiii"];
;
Runtime.stackAlloc = Module['stackAlloc'];
Runtime.stackSave = Module['stackSave'];
Runtime.stackRestore = Module['stackRestore'];
Runtime.establishStackSpace = Module['establishStackSpace'];
Runtime.setTempRet0 = Module['setTempRet0'];
Runtime.getTempRet0 = Module['getTempRet0'];


// === Auto-generated postamble setup entry stuff ===

Module['asm'] = asm;







/**
 * @constructor
 * @extends {Error}
 */
function ExitStatus(status) {
  this.name = "ExitStatus";
  this.message = "Program terminated with exit(" + status + ")";
  this.status = status;
};
ExitStatus.prototype = new Error();
ExitStatus.prototype.constructor = ExitStatus;

var initialStackTop;
var preloadStartTime = null;
var calledMain = false;

dependenciesFulfilled = function runCaller() {
  // If run has never been called, and we should call run (INVOKE_RUN is true, and Module.noInitialRun is not false)
  if (!Module['calledRun']) run();
  if (!Module['calledRun']) dependenciesFulfilled = runCaller; // try this again later, after new deps are fulfilled
}

Module['callMain'] = Module.callMain = function callMain(args) {
  assert(runDependencies == 0, 'cannot call main when async dependencies remain! (listen on __ATMAIN__)');
  assert(__ATPRERUN__.length == 0, 'cannot call main when preRun functions remain to be called');

  args = args || [];

  ensureInitRuntime();

  var argc = args.length+1;
  function pad() {
    for (var i = 0; i < 4-1; i++) {
      argv.push(0);
    }
  }
  var argv = [allocate(intArrayFromString(Module['thisProgram']), 'i8', ALLOC_NORMAL) ];
  pad();
  for (var i = 0; i < argc-1; i = i + 1) {
    argv.push(allocate(intArrayFromString(args[i]), 'i8', ALLOC_NORMAL));
    pad();
  }
  argv.push(0);
  argv = allocate(argv, 'i32', ALLOC_NORMAL);


  try {

    var ret = Module['_main'](argc, argv, 0);


    // if we're not running an evented main loop, it's time to exit
    exit(ret, /* implicit = */ true);
  }
  catch(e) {
    if (e instanceof ExitStatus) {
      // exit() throws this once it's done to make sure execution
      // has been stopped completely
      return;
    } else if (e == 'SimulateInfiniteLoop') {
      // running an evented main loop, don't immediately exit
      Module['noExitRuntime'] = true;
      return;
    } else {
      var toLog = e;
      if (e && typeof e === 'object' && e.stack) {
        toLog = [e, e.stack];
      }
      Module.printErr('exception thrown: ' + toLog);
      Module['quit'](1, e);
    }
  } finally {
    calledMain = true;
  }
}




/** @type {function(Array=)} */
function run(args) {
  args = args || Module['arguments'];

  if (preloadStartTime === null) preloadStartTime = Date.now();

  if (runDependencies > 0) {
    return;
  }

  writeStackCookie();

  preRun();

  if (runDependencies > 0) return; // a preRun added a dependency, run will be called later
  if (Module['calledRun']) return; // run may have just been called through dependencies being fulfilled just in this very frame

  function doRun() {
    if (Module['calledRun']) return; // run may have just been called while the async setStatus time below was happening
    Module['calledRun'] = true;

    if (ABORT) return;

    ensureInitRuntime();

    preMain();

    if (ENVIRONMENT_IS_WEB && preloadStartTime !== null) {
      Module.printErr('pre-main prep time: ' + (Date.now() - preloadStartTime) + ' ms');
    }

    if (Module['onRuntimeInitialized']) Module['onRuntimeInitialized']();

    if (Module['_main'] && shouldRunNow) Module['callMain'](args);

    postRun();
  }

  if (Module['setStatus']) {
    Module['setStatus']('Running...');
    setTimeout(function() {
      setTimeout(function() {
        Module['setStatus']('');
      }, 1);
      doRun();
    }, 1);
  } else {
    doRun();
  }
  checkStackCookie();
}
Module['run'] = Module.run = run;

function exit(status, implicit) {
  if (implicit && Module['noExitRuntime']) {
    Module.printErr('exit(' + status + ') implicitly called by end of main(), but noExitRuntime, so not exiting the runtime (you can use emscripten_force_exit, if you want to force a true shutdown)');
    return;
  }

  if (Module['noExitRuntime']) {
    Module.printErr('exit(' + status + ') called, but noExitRuntime, so halting execution but not exiting the runtime or preventing further async execution (you can use emscripten_force_exit, if you want to force a true shutdown)');
  } else {

    ABORT = true;
    EXITSTATUS = status;
    STACKTOP = initialStackTop;

    exitRuntime();

    if (Module['onExit']) Module['onExit'](status);
  }

  if (ENVIRONMENT_IS_NODE) {
    process['exit'](status);
  }
  Module['quit'](status, new ExitStatus(status));
}
Module['exit'] = Module.exit = exit;

var abortDecorators = [];

function abort(what) {
  if (Module['onAbort']) {
    Module['onAbort'](what);
  }

  if (what !== undefined) {
    Module.print(what);
    Module.printErr(what);
    what = JSON.stringify(what)
  } else {
    what = '';
  }

  ABORT = true;
  EXITSTATUS = 1;

  var extra = '';

  var output = 'abort(' + what + ') at ' + stackTrace() + extra;
  if (abortDecorators) {
    abortDecorators.forEach(function(decorator) {
      output = decorator(output, what);
    });
  }
  throw output;
}
Module['abort'] = Module.abort = abort;

// {{PRE_RUN_ADDITIONS}}

if (Module['preInit']) {
  if (typeof Module['preInit'] == 'function') Module['preInit'] = [Module['preInit']];
  while (Module['preInit'].length > 0) {
    Module['preInit'].pop()();
  }
}

// shouldRunNow refers to calling main(), not run().
var shouldRunNow = true;
if (Module['noInitialRun']) {
  shouldRunNow = false;
}

Module["noExitRuntime"] = true;

run();

// {{POST_RUN_ADDITIONS}}





// {{MODULE_ADDITIONS}}



//# sourceMappingURL=temperature.js.map
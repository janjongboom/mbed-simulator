// The Module object: Our interface to the outside world. We import
// and export values on it. There are various ways Module can be used:
// 1. Not defined. We create it here
// 2. A function parameter, function(Module) { ..generated code.. }
// 3. pre-run appended it, var Module = {}; ..generated code..
// 4. External script tag defines var Module.
// We need to check if Module already exists (e.g. case 3 above).
// Substitution will be replaced with actual code on later stage of the build,
// this way Closure Compiler will not mangle it (e.g. case 4. above).
// Note that if you want to run closure, and also to use Module
// after the generated code, you will need to define   var Module = {};
// before the code. Then that object will be used in the code, and you
// can continue to use Module afterwards as well.
var Module = typeof Module !== 'undefined' ? Module : {};

// --pre-jses are emitted after the Module integration code, so that they can
// refer to Module (if they choose; they can also define Module)
// {{PRE_JSES}}

// Sometimes an existing Module object exists with properties
// meant to overwrite the default module functionality. Here
// we collect those properties and reapply _after_ we configure
// the current environment's defaults to avoid having to be so
// defensive during initialization.
var moduleOverrides = {};
var key;
for (key in Module) {
  if (Module.hasOwnProperty(key)) {
    moduleOverrides[key] = Module[key];
  }
}

Module['arguments'] = [];
Module['thisProgram'] = './this.program';
Module['quit'] = function(status, toThrow) {
  throw toThrow;
};
Module['preRun'] = [];
Module['postRun'] = [];

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
    throw new Error('Module[\'ENVIRONMENT\'] value is not valid. must be one of: WEB|WORKER|NODE|SHELL.');
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
  var nodeFS;
  var nodePath;

  Module['read'] = function shell_read(filename, binary) {
    var ret;
      if (!nodeFS) nodeFS = require('fs');
      if (!nodePath) nodePath = require('path');
      filename = nodePath['normalize'](filename);
      ret = nodeFS['readFileSync'](filename);
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

  if (process['argv'].length > 1) {
    Module['thisProgram'] = process['argv'][1].replace(/\\/g, '/');
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
  // Currently node will swallow unhandled rejections, but this behavior is
  // deprecated, and in the future it will exit with error status.
  process['on']('unhandledRejection', function(reason, p) {
    Module['printErr']('node.js exiting due to unhandled promise rejection');
    process['exit'](1);
  });

  Module['inspect'] = function () { return '[Emscripten Module object]'; };
}
else if (ENVIRONMENT_IS_SHELL) {
  if (typeof read != 'undefined') {
    Module['read'] = function shell_read(f) {
      return read(f);
    };
  }

  Module['readBinary'] = function readBinary(f) {
    var data;
    if (typeof readbuffer === 'function') {
      return new Uint8Array(readbuffer(f));
    }
    data = read(f, 'binary');
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
        return;
      }
      onerror();
    };
    xhr.onerror = onerror;
    xhr.send(null);
  };

  if (typeof arguments != 'undefined') {
    Module['arguments'] = arguments;
  }

  Module['setWindowTitle'] = function(title) { document.title = title };
}
else {
  // Unreachable because SHELL is dependent on the others
  throw new Error('unknown runtime environment');
}

// console.log is checked first, as 'print' on the web will open a print dialogue
// printErr is preferable to console.warn (works better in shells)
// bind(console) is necessary to fix IE/Edge closed dev tools panel behavior.
Module['print'] = typeof console !== 'undefined' ? console.log.bind(console) : (typeof print !== 'undefined' ? print : null);
Module['printErr'] = typeof printErr !== 'undefined' ? printErr : ((typeof console !== 'undefined' && console.warn.bind(console)) || Module['print']);

// *** Environment setup code ***

// Closure helpers
Module.print = Module['print'];
Module.printErr = Module['printErr'];

// Merge back in the overrides
for (key in moduleOverrides) {
  if (moduleOverrides.hasOwnProperty(key)) {
    Module[key] = moduleOverrides[key];
  }
}
// Free the object hierarchy contained in the overrides, this lets the GC
// reclaim data used e.g. in memoryInitializerRequest, which is a large typed array.
moduleOverrides = undefined;



// {{PREAMBLE_ADDITIONS}}

var STACK_ALIGN = 16;

// stack management, and other functionality that is provided by the compiled code,
// should not be used before it is ready
stackSave = stackRestore = stackAlloc = setTempRet0 = getTempRet0 = function() {
  abort('cannot use the stack before compiled code is ready to run, and has provided stack access');
};

function staticAlloc(size) {
  assert(!staticSealed);
  var ret = STATICTOP;
  STATICTOP = (STATICTOP + size + 15) & -16;
  return ret;
}

function dynamicAlloc(size) {
  assert(DYNAMICTOP_PTR);
  var ret = HEAP32[DYNAMICTOP_PTR>>2];
  var end = (ret + size + 15) & -16;
  HEAP32[DYNAMICTOP_PTR>>2] = end;
  if (end >= TOTAL_MEMORY) {
    var success = enlargeMemory();
    if (!success) {
      HEAP32[DYNAMICTOP_PTR>>2] = ret;
      return 0;
    }
  }
  return ret;
}

function alignMemory(size, factor) {
  if (!factor) factor = STACK_ALIGN; // stack alignment (16-byte) by default
  var ret = size = Math.ceil(size / factor) * factor;
  return ret;
}

function getNativeTypeSize(type) {
  switch (type) {
    case 'i1': case 'i8': return 1;
    case 'i16': return 2;
    case 'i32': return 4;
    case 'i64': return 8;
    case 'float': return 4;
    case 'double': return 8;
    default: {
      if (type[type.length-1] === '*') {
        return 4; // A pointer
      } else if (type[0] === 'i') {
        var bits = parseInt(type.substr(1));
        assert(bits % 8 === 0);
        return bits / 8;
      } else {
        return 0;
      }
    }
  }
}

function warnOnce(text) {
  if (!warnOnce.shown) warnOnce.shown = {};
  if (!warnOnce.shown[text]) {
    warnOnce.shown[text] = 1;
    Module.printErr(text);
  }
}



var jsCallStartIndex = 1;
var functionPointers = new Array(0);

// 'sig' parameter is only used on LLVM wasm backend
function addFunction(func, sig) {
  if (typeof sig === 'undefined') {
    Module.printErr('Warning: addFunction: Provide a wasm function signature ' +
                    'string as a second argument');
  }
  var base = 0;
  for (var i = base; i < base + 0; i++) {
    if (!functionPointers[i]) {
      functionPointers[i] = func;
      return jsCallStartIndex + i;
    }
  }
  throw 'Finished up all reserved function pointers. Use a higher value for RESERVED_FUNCTION_POINTERS.';
}

function removeFunction(index) {
  functionPointers[index-jsCallStartIndex] = null;
}

var funcWrappers = {};

function getFuncWrapper(func, sig) {
  if (!func) return; // on null pointer, return undefined
  assert(sig);
  if (!funcWrappers[sig]) {
    funcWrappers[sig] = {};
  }
  var sigCache = funcWrappers[sig];
  if (!sigCache[func]) {
    // optimize away arguments usage in common cases
    if (sig.length === 1) {
      sigCache[func] = function dynCall_wrapper() {
        return dynCall(sig, func);
      };
    } else if (sig.length === 2) {
      sigCache[func] = function dynCall_wrapper(arg) {
        return dynCall(sig, func, [arg]);
      };
    } else {
      // general case
      sigCache[func] = function dynCall_wrapper() {
        return dynCall(sig, func, Array.prototype.slice.call(arguments));
      };
    }
  }
  return sigCache[func];
}


function makeBigInt(low, high, unsigned) {
  return unsigned ? ((+((low>>>0)))+((+((high>>>0)))*4294967296.0)) : ((+((low>>>0)))+((+((high|0)))*4294967296.0));
}

function dynCall(sig, ptr, args) {
  if (args && args.length) {
    assert(args.length == sig.length-1);
    assert(('dynCall_' + sig) in Module, 'bad function pointer type - no table for sig \'' + sig + '\'');
    return Module['dynCall_' + sig].apply(null, [ptr].concat(args));
  } else {
    assert(sig.length == 1);
    assert(('dynCall_' + sig) in Module, 'bad function pointer type - no table for sig \'' + sig + '\'');
    return Module['dynCall_' + sig].call(null, ptr);
  }
}


function getCompilerSetting(name) {
  throw 'You must build with -s RETAIN_COMPILER_SETTINGS=1 for getCompilerSetting or emscripten_get_compiler_setting to work';
}

var Runtime = {
  // FIXME backwards compatibility layer for ports. Support some Runtime.*
  //       for now, fix it there, then remove it from here. That way we
  //       can minimize any period of breakage.
  dynCall: dynCall, // for SDL2 port
  // helpful errors
  getTempRet0: function() { abort('getTempRet0() is now a top-level function, after removing the Runtime object. Remove "Runtime."') },
  staticAlloc: function() { abort('staticAlloc() is now a top-level function, after removing the Runtime object. Remove "Runtime."') },
  stackAlloc: function() { abort('stackAlloc() is now a top-level function, after removing the Runtime object. Remove "Runtime."') },
};

// The address globals begin at. Very low in memory, for code size and optimization opportunities.
// Above 0 is static memory, starting with globals.
// Then the stack.
// Then 'dynamic' memory for sbrk.
var GLOBAL_BASE = 8;



// === Preamble library stuff ===

// Documentation for the public APIs defined in this file must be updated in:
//    site/source/docs/api_reference/preamble.js.rst
// A prebuilt local version of the documentation is available at:
//    site/build/text/docs/api_reference/preamble.js.txt
// You can also build docs locally as HTML or other formats in site/
// An online HTML version (which may be of a different version of Emscripten)
//    is up at http://kripken.github.io/emscripten-site/docs/api_reference/preamble.js.html



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
  assert(func, 'Cannot call unknown function ' + ident + ', make sure it is exported');
  return func;
}

var JSfuncs = {
  // Helpers for cwrap -- it can't refer to Runtime directly because it might
  // be renamed by closure, instead it calls JSfuncs['stackSave'].body to find
  // out what the minified function name is.
  'stackSave': function() {
    stackSave()
  },
  'stackRestore': function() {
    stackRestore()
  },
  // type conversion from js to c
  'arrayToC' : function(arr) {
    var ret = stackAlloc(arr.length);
    writeArrayToMemory(arr, ret);
    return ret;
  },
  'stringToC' : function(str) {
    var ret = 0;
    if (str !== null && str !== undefined && str !== 0) { // null string
      // at most 4 bytes per UTF-8 code point, +1 for the trailing '\0'
      var len = (str.length << 2) + 1;
      ret = stackAlloc(len);
      stringToUTF8(str, ret, len);
    }
    return ret;
  }
};
// For fast lookup of conversion functions
var toC = {'string' : JSfuncs['stringToC'], 'array' : JSfuncs['arrayToC']};

// C calling interface.
function ccall (ident, returnType, argTypes, args, opts) {
  var func = getCFunc(ident);
  var cArgs = [];
  var stack = 0;
  assert(returnType !== 'array', 'Return type should not be "array".');
  if (args) {
    for (var i = 0; i < args.length; i++) {
      var converter = toC[argTypes[i]];
      if (converter) {
        if (stack === 0) stack = stackSave();
        cArgs[i] = converter(args[i]);
      } else {
        cArgs[i] = args[i];
      }
    }
  }
  var ret = func.apply(null, cArgs);
  if (returnType === 'string') ret = Pointer_stringify(ret);
  if (stack !== 0) {
    stackRestore(stack);
  }
  return ret;
}

function cwrap (ident, returnType, argTypes) {
  argTypes = argTypes || [];
  var cfunc = getCFunc(ident);
  // When the function takes numbers and returns a number, we can just return
  // the original function
  var numericArgs = argTypes.every(function(type){ return type === 'number'});
  var numericRet = returnType !== 'string';
  if (numericRet && numericArgs) {
    return cfunc;
  }
  return function() {
    return ccall(ident, returnType, argTypes, arguments);
  }
}

/** @type {function(number, number, string, boolean=)} */
function setValue(ptr, value, type, noSafe) {
  type = type || 'i8';
  if (type.charAt(type.length-1) === '*') type = 'i32'; // pointers are 32-bit
    switch(type) {
      case 'i1': HEAP8[((ptr)>>0)]=value; break;
      case 'i8': HEAP8[((ptr)>>0)]=value; break;
      case 'i16': HEAP16[((ptr)>>1)]=value; break;
      case 'i32': HEAP32[((ptr)>>2)]=value; break;
      case 'i64': (tempI64 = [value>>>0,(tempDouble=value,(+(Math_abs(tempDouble))) >= (+1) ? (tempDouble > (+0) ? ((Math_min((+(Math_floor((tempDouble)/(+4294967296)))), (+4294967295)))|0)>>>0 : (~~((+(Math_ceil((tempDouble - +(((~~(tempDouble)))>>>0))/(+4294967296))))))>>>0) : 0)],HEAP32[((ptr)>>2)]=tempI64[0],HEAP32[(((ptr)+(4))>>2)]=tempI64[1]); break;
      case 'float': HEAPF32[((ptr)>>2)]=value; break;
      case 'double': HEAPF64[((ptr)>>3)]=value; break;
      default: abort('invalid type for setValue: ' + type);
    }
}

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
      default: abort('invalid type for getValue: ' + type);
    }
  return null;
}

var ALLOC_NORMAL = 0; // Tries to use _malloc()
var ALLOC_STACK = 1; // Lives for the duration of the current function call
var ALLOC_STATIC = 2; // Cannot be freed
var ALLOC_DYNAMIC = 3; // Cannot be freed except through sbrk
var ALLOC_NONE = 4; // Do not allocate

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
    ret = [typeof _malloc === 'function' ? _malloc : staticAlloc, stackAlloc, staticAlloc, dynamicAlloc][allocator === undefined ? ALLOC_STATIC : allocator](Math.max(size, singleType ? 1 : types.length));
  }

  if (zeroinit) {
    var stop;
    ptr = ret;
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
      typeSize = getNativeTypeSize(type);
      previousType = type;
    }
    i += typeSize;
  }

  return ret;
}

// Allocate memory during any stage of startup - static memory early on, dynamic memory later, malloc when ready
function getMemory(size) {
  if (!staticSealed) return staticAlloc(size);
  if (!runtimeInitialized) return dynamicAlloc(size);
  return _malloc(size);
}

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
  return UTF8ToString(ptr);
}

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

// Copies the given Javascript String object 'str' to the emscripten HEAP at address 'outPtr',
// null-terminated and encoded in ASCII form. The copy will require at most str.length+1 bytes of space in the HEAP.

function stringToAscii(str, outPtr) {
  return writeAsciiToMemory(str, outPtr, false);
}

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

// Given a pointer 'ptr' to a null-terminated UTF8-encoded string in the emscripten HEAP, returns
// a copy of that string as a Javascript String object.

function UTF8ToString(ptr) {
  return UTF8ArrayToString(HEAPU8,ptr);
}

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

// Copies the given Javascript String object 'str' to the emscripten HEAP at address 'outPtr',
// null-terminated and encoded in UTF8 form. The copy will require at most str.length*4+1 bytes of space in the HEAP.
// Use the function lengthBytesUTF8 to compute the exact number of bytes (excluding null terminator) that this function will write.
// Returns the number of bytes written, EXCLUDING the null terminator.

function stringToUTF8(str, outPtr, maxBytesToWrite) {
  assert(typeof maxBytesToWrite == 'number', 'stringToUTF8(str, outPtr, maxBytesToWrite) is missing the third parameter that specifies the length of the output buffer!');
  return stringToUTF8Array(str, HEAPU8,outPtr, maxBytesToWrite);
}

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

// Allocate heap space for a JS string, and write it there.
// It is the responsibility of the caller to free() that memory.
function allocateUTF8(str) {
  var size = lengthBytesUTF8(str) + 1;
  var ret = _malloc(size);
  if (ret) stringToUTF8Array(str, HEAP8, ret, size);
  return ret;
}

// Allocate stack space for a JS string, and write it there.
function allocateUTF8OnStack(str) {
  var size = lengthBytesUTF8(str) + 1;
  var ret = stackAlloc(size);
  stringToUTF8Array(str, HEAP8, ret, size);
  return ret;
}

function demangle(func) {
  warnOnce('warning: build with  -s DEMANGLE_SUPPORT=1  to link in libcxxabi demangling');
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
  abort('Stack overflow! Attempted to allocate ' + allocSize + ' bytes on the stack, but stack has only ' + (STACK_MAX - stackSave() + allocSize) + ' bytes available!');
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
  Module['buffer'] = buffer;
}
updateGlobalBufferViews();


function getTotalMemory() {
  return TOTAL_MEMORY;
}

// Endianness check (note: assumes compiler arch was little-endian)
  HEAP32[0] = 0x63736d65; /* 'emsc' */
HEAP16[1] = 0x6373;
if (HEAPU8[2] !== 0x73 || HEAPU8[3] !== 0x63) throw 'Runtime error: expected the system to be little-endian!';

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

function addOnInit(cb) {
  __ATINIT__.unshift(cb);
}

function addOnPreMain(cb) {
  __ATMAIN__.unshift(cb);
}

function addOnExit(cb) {
  __ATEXIT__.unshift(cb);
}

function addOnPostRun(cb) {
  __ATPOSTRUN__.unshift(cb);
}

// Deprecated: This function should not be called because it is unsafe and does not provide
// a maximum length limit of how many bytes it is allowed to write. Prefer calling the
// function stringToUTF8Array() instead, which takes in a maximum length that can be used
// to be secure from out of bounds writes.
/** @deprecated */
function writeStringToMemory(string, buffer, dontAddNull) {
  warnOnce('writeStringToMemory is deprecated and should not be called! Use stringToUTF8() instead!');

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

function writeArrayToMemory(array, buffer) {
  assert(array.length >= 0, 'writeArrayToMemory array must have a length (should be an array or typed array)')
  HEAP8.set(array, buffer);
}

function writeAsciiToMemory(str, buffer, dontAddNull) {
  for (var i = 0; i < str.length; ++i) {
    assert(str.charCodeAt(i) === str.charCodeAt(i)&0xff);
    HEAP8[((buffer++)>>0)]=str.charCodeAt(i);
  }
  // Null-terminate the pointer to the HEAP.
  if (!dontAddNull) HEAP8[((buffer)>>0)]=0;
}

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

assert(Math['imul'] && Math['fround'] && Math['clz32'] && Math['trunc'], 'this is a legacy browser, build with LEGACY_VM_SUPPORT');

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
var Math_max = Math.max;
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

Module["preloadedImages"] = {}; // maps url to image data
Module["preloadedAudios"] = {}; // maps url to audio data



var memoryInitializer = null;



var /* show errors on likely calls to FS when it was not included */ FS = {
  error: function() {
    abort('Filesystem support (FS) was not included. The problem is that you are using files from JS, but files were not used from C/C++, so filesystem support was not auto-included. You can force-include filesystem support with  -s FORCE_FILESYSTEM=1');
  },
  init: function() { FS.error() },
  createDataFile: function() { FS.error() },
  createPreloadedFile: function() { FS.error() },
  createLazyFile: function() { FS.error() },
  open: function() { FS.error() },
  mkdev: function() { FS.error() },
  registerDevice: function() { FS.error() },
  analyzePath: function() { FS.error() },
  loadFilesFromDB: function() { FS.error() },

  ErrnoError: function ErrnoError() { FS.error() },
};
Module['FS_createDataFile'] = FS.createDataFile;
Module['FS_createPreloadedFile'] = FS.createPreloadedFile;



// Prefix of data URIs emitted by SINGLE_FILE and related options.
var dataURIPrefix = 'data:application/octet-stream;base64,';

// Indicates whether filename is a base64 data URI.
function isDataURI(filename) {
  return String.prototype.startsWith ?
      filename.startsWith(dataURIPrefix) :
      filename.indexOf(dataURIPrefix) === 0;
}





// === Body ===

var ASM_CONSTS = [function() { return Date.now(); },
 function($0, $1) { MbedJSHal.gpio.write($0, $1); },
 function($0, $1) { MbedJSHal.gpio.init_in($0, $1, 3); },
 function($0, $1) { MbedJSHal.gpio.init_out($0, $1, 0); },
 function($0, $1) { MbedJSHal.gpio.irq_init($0, $1); },
 function($0, $1) { MbedJSHal.gpio.irq_free($0); },
 function($0, $1, $2) { MbedJSHal.gpio.irq_set($0, $1, $2); },
 function($0, $1) { window.MbedJSHal.blockdevice.init(Pointer_stringify($0), $1); },
 function($0, $1, $2, $3) { window.MbedJSHal.blockdevice.read(Pointer_stringify($0), $1, $2, $3); },
 function($0, $1, $2, $3) { window.MbedJSHal.blockdevice.program(Pointer_stringify($0), $1, $2, $3); },
 function($0, $1, $2) { window.MbedJSHal.blockdevice.erase(Pointer_stringify($0), $2, $3); }];

function _emscripten_asm_const_iii(code, a0, a1) {
  return ASM_CONSTS[code](a0, a1);
}

function _emscripten_asm_const_iiii(code, a0, a1, a2) {
  return ASM_CONSTS[code](a0, a1, a2);
}

function _emscripten_asm_const_i(code) {
  return ASM_CONSTS[code]();
}

function _emscripten_asm_const_iiiii(code, a0, a1, a2, a3) {
  return ASM_CONSTS[code](a0, a1, a2, a3);
}




STATIC_BASE = GLOBAL_BASE;

STATICTOP = STATIC_BASE + 7744;
/* global initializers */  __ATINIT__.push({ func: function() { __GLOBAL__sub_I_main_cpp() } });


memoryInitializer = "bd.js.mem";





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
      }};function ___cxa_begin_catch(ptr) {
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

  
  
  function ___resumeException(ptr) {
      if (!EXCEPTIONS.last) { EXCEPTIONS.last = ptr; }
      throw ptr + " - Exception catching is disabled, this exception cannot be caught. Compile with -s DISABLE_EXCEPTION_CATCHING=0 or DISABLE_EXCEPTION_CATCHING=2 to catch.";
    }function ___cxa_find_matching_catch() {
      var thrown = EXCEPTIONS.last;
      if (!thrown) {
        // just pass through the null ptr
        return ((setTempRet0(0),0)|0);
      }
      var info = EXCEPTIONS.infos[thrown];
      var throwntype = info.type;
      if (!throwntype) {
        // just pass through the thrown ptr
        return ((setTempRet0(0),thrown)|0);
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
          return ((setTempRet0(typeArray[i]),thrown)|0);
        }
      }
      // Shouldn't happen unless we have bogus data in typeArray
      // or encounter a type for which emscripten doesn't have suitable
      // typeinfo defined. Best-efforts match just in case.
      thrown = HEAP32[((thrown)>>2)]; // undo indirection
      return ((setTempRet0(throwntype),thrown)|0);
    }function ___gxx_personality_v0() {
    }

  function ___lock() {}

  
    

  
  var SYSCALLS={varargs:0,get:function (varargs) {
        SYSCALLS.varargs += 4;
        var ret = HEAP32[(((SYSCALLS.varargs)-(4))>>2)];
        return ret;
      },getStr:function () {
        var ret = Pointer_stringify(SYSCALLS.get());
        return ret;
      },get64:function () {
        var low = SYSCALLS.get(), high = SYSCALLS.get();
        if (low >= 0) assert(high === 0);
        else assert(high === -1);
        return low;
      },getZero:function () {
        assert(SYSCALLS.get() === 0);
      }};function ___syscall140(which, varargs) {SYSCALLS.varargs = varargs;
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

  
  function flush_NO_FILESYSTEM() {
      // flush anything remaining in the buffers during shutdown
      var fflush = Module["_fflush"];
      if (fflush) fflush(0);
      var printChar = ___syscall146.printChar;
      if (!printChar) return;
      var buffers = ___syscall146.buffers;
      if (buffers[1].length) printChar(1, 10);
      if (buffers[2].length) printChar(2, 10);
    }function ___syscall146(which, varargs) {SYSCALLS.varargs = varargs;
  try {
   // writev
      // hack to support printf in NO_FILESYSTEM
      var stream = SYSCALLS.get(), iov = SYSCALLS.get(), iovcnt = SYSCALLS.get();
      var ret = 0;
      if (!___syscall146.buffers) {
        ___syscall146.buffers = [null, [], []]; // 1 => stdout, 2 => stderr
        ___syscall146.printChar = function(stream, curr) {
          var buffer = ___syscall146.buffers[stream];
          assert(buffer);
          if (curr === 0 || curr === 10) {
            (stream === 1 ? Module['print'] : Module['printErr'])(UTF8ArrayToString(buffer, 0));
            buffer.length = 0;
          } else {
            buffer.push(curr);
          }
        };
      }
      for (var i = 0; i < iovcnt; i++) {
        var ptr = HEAP32[(((iov)+(i*8))>>2)];
        var len = HEAP32[(((iov)+(i*8 + 4))>>2)];
        for (var j = 0; j < len; j++) {
          ___syscall146.printChar(stream, HEAPU8[ptr+j]);
        }
        ret += len;
      }
      return ret;
    } catch (e) {
    if (typeof FS === 'undefined' || !(e instanceof FS.ErrnoError)) abort(e);
    return -e.errno;
  }
  }

  function ___syscall54(which, varargs) {SYSCALLS.varargs = varargs;
  try {
   // ioctl
      return 0;
    } catch (e) {
    if (typeof FS === 'undefined' || !(e instanceof FS.ErrnoError)) abort(e);
    return -e.errno;
  }
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

  function ___unlock() {}

   

  function _abort() {
      Module['abort']();
    }

   

   

  
  var ___async_cur_frame=0; 

  var _emscripten_asm_const_int=true;

   

   

  
  
  var ___async=0;
  
  var ___async_unwind=1;
  
  var ___async_retval=STATICTOP; STATICTOP += 16;; 
  
  
  
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
        if (typeof setImmediate === 'undefined') {
          // Emulate setImmediate. (note: not a complete polyfill, we don't emulate clearImmediate() to keep code size to minimum, since not needed)
          var setImmediates = [];
          var emscriptenMainLoopMessageId = 'setimmediate';
          function Browser_setImmediate_messageHandler(event) {
            // When called in current thread or Worker, the main loop ID is structured slightly different to accommodate for --proxy-to-worker runtime listening to Worker events,
            // so check for both cases.
            if (event.data === emscriptenMainLoopMessageId || event.data.target === emscriptenMainLoopMessageId) {
              event.stopPropagation();
              setImmediates.shift()();
            }
          }
          addEventListener("message", Browser_setImmediate_messageHandler, true);
          setImmediate = function Browser_emulated_setImmediate(func) {
            setImmediates.push(func);
            if (ENVIRONMENT_IS_WORKER) {
              if (Module['setImmediates'] === undefined) Module['setImmediates'] = [];
              Module['setImmediates'].push(func);
              postMessage({target: emscriptenMainLoopMessageId}); // In --proxy-to-worker, route the message via proxyClient.js
            } else postMessage(emscriptenMainLoopMessageId, "*"); // On the main thread, can just send the message to itself.
          }
        }
        Browser.mainLoop.scheduler = function Browser_mainLoop_scheduler_setImmediate() {
          setImmediate(Browser.mainLoop.runner);
        };
        Browser.mainLoop.method = 'immediate';
      }
      return 0;
    }
  
  function _emscripten_get_now() { abort() }function _emscripten_set_main_loop(func, fps, simulateInfiniteLoop, arg, noSetTiming) {
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
              warnOnce('Blob constructor present but fails: ' + e + '; falling back to blob builder');
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
          var flags = HEAPU32[((SDL.screen)>>2)];
          flags = flags | 0x00800000; // set SDL_FULLSCREEN flag
          HEAP32[((SDL.screen)>>2)]=flags
        }
        Browser.updateResizeListeners();
      },setWindowedCanvasSize:function () {
        // check if SDL is available       
        if (typeof SDL != "undefined") {
          var flags = HEAPU32[((SDL.screen)>>2)];
          flags = flags & ~0x00800000; // clear SDL_FULLSCREEN flag
          HEAP32[((SDL.screen)>>2)]=flags
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
      Module['setAsync'](); // tell the scheduler that we have a callback on hold
      Browser.safeSetTimeout(_emscripten_async_resume, ms);
    }

  function _gettimeofday(ptr) {
      var now = Date.now();
      HEAP32[((ptr)>>2)]=(now/1000)|0; // seconds
      HEAP32[(((ptr)+(4))>>2)]=((now % 1000)*1000)|0; // microseconds
      return 0;
    }



   

  
  function _emscripten_memcpy_big(dest, src, num) {
      HEAPU8.set(HEAPU8.subarray(src, src+num), dest);
      return dest;
    } 

   

  function _pthread_cond_init() { return 0; }

  function _pthread_cond_signal() { return 0; }

  function _pthread_cond_timedwait() { return 0; }

  function _pthread_cond_wait() { return 0; }

  
  var PTHREAD_SPECIFIC={};function _pthread_getspecific(key) {
      return PTHREAD_SPECIFIC[key] || 0;
    }

  
  var PTHREAD_SPECIFIC_NEXT_KEY=1;
  
  var ERRNO_CODES={EPERM:1,ENOENT:2,ESRCH:3,EINTR:4,EIO:5,ENXIO:6,E2BIG:7,ENOEXEC:8,EBADF:9,ECHILD:10,EAGAIN:11,EWOULDBLOCK:11,ENOMEM:12,EACCES:13,EFAULT:14,ENOTBLK:15,EBUSY:16,EEXIST:17,EXDEV:18,ENODEV:19,ENOTDIR:20,EISDIR:21,EINVAL:22,ENFILE:23,EMFILE:24,ENOTTY:25,ETXTBSY:26,EFBIG:27,ENOSPC:28,ESPIPE:29,EROFS:30,EMLINK:31,EPIPE:32,EDOM:33,ERANGE:34,ENOMSG:42,EIDRM:43,ECHRNG:44,EL2NSYNC:45,EL3HLT:46,EL3RST:47,ELNRNG:48,EUNATCH:49,ENOCSI:50,EL2HLT:51,EDEADLK:35,ENOLCK:37,EBADE:52,EBADR:53,EXFULL:54,ENOANO:55,EBADRQC:56,EBADSLT:57,EDEADLOCK:35,EBFONT:59,ENOSTR:60,ENODATA:61,ETIME:62,ENOSR:63,ENONET:64,ENOPKG:65,EREMOTE:66,ENOLINK:67,EADV:68,ESRMNT:69,ECOMM:70,EPROTO:71,EMULTIHOP:72,EDOTDOT:73,EBADMSG:74,ENOTUNIQ:76,EBADFD:77,EREMCHG:78,ELIBACC:79,ELIBBAD:80,ELIBSCN:81,ELIBMAX:82,ELIBEXEC:83,ENOSYS:38,ENOTEMPTY:39,ENAMETOOLONG:36,ELOOP:40,EOPNOTSUPP:95,EPFNOSUPPORT:96,ECONNRESET:104,ENOBUFS:105,EAFNOSUPPORT:97,EPROTOTYPE:91,ENOTSOCK:88,ENOPROTOOPT:92,ESHUTDOWN:108,ECONNREFUSED:111,EADDRINUSE:98,ECONNABORTED:103,ENETUNREACH:101,ENETDOWN:100,ETIMEDOUT:110,EHOSTDOWN:112,EHOSTUNREACH:113,EINPROGRESS:115,EALREADY:114,EDESTADDRREQ:89,EMSGSIZE:90,EPROTONOSUPPORT:93,ESOCKTNOSUPPORT:94,EADDRNOTAVAIL:99,ENETRESET:102,EISCONN:106,ENOTCONN:107,ETOOMANYREFS:109,EUSERS:87,EDQUOT:122,ESTALE:116,ENOTSUP:95,ENOMEDIUM:123,EILSEQ:84,EOVERFLOW:75,ECANCELED:125,ENOTRECOVERABLE:131,EOWNERDEAD:130,ESTRPIPE:86};function _pthread_key_create(key, destructor) {
      if (key == 0) {
        return ERRNO_CODES.EINVAL;
      }
      HEAP32[((key)>>2)]=PTHREAD_SPECIFIC_NEXT_KEY;
      // values start at 0
      PTHREAD_SPECIFIC[PTHREAD_SPECIFIC_NEXT_KEY] = 0;
      PTHREAD_SPECIFIC_NEXT_KEY++;
      return 0;
    }

  function _pthread_mutex_init() {}

   

   

  function _pthread_once(ptr, func) {
      if (!_pthread_once.seen) _pthread_once.seen = {};
      if (ptr in _pthread_once.seen) return;
      Module['dynCall_v'](func);
      _pthread_once.seen[ptr] = 1;
    }

  function _pthread_setspecific(key, value) {
      if (!(key in PTHREAD_SPECIFIC)) {
        return ERRNO_CODES.EINVAL;
      }
      PTHREAD_SPECIFIC[key] = value;
      return 0;
    }

  
  function ___setErrNo(value) {
      if (Module['___errno_location']) HEAP32[((Module['___errno_location']())>>2)]=value;
      else Module.printErr('failed to set errno from JS');
      return value;
    } 
Module["requestFullScreen"] = function Module_requestFullScreen(lockPointer, resizeCanvas, vrDevice) { Module.printErr("Module.requestFullScreen is deprecated. Please call Module.requestFullscreen instead."); Module["requestFullScreen"] = Module["requestFullscreen"]; Browser.requestFullScreen(lockPointer, resizeCanvas, vrDevice) };
  Module["requestFullscreen"] = function Module_requestFullscreen(lockPointer, resizeCanvas, vrDevice) { Browser.requestFullscreen(lockPointer, resizeCanvas, vrDevice) };
  Module["requestAnimationFrame"] = function Module_requestAnimationFrame(func) { Browser.requestAnimationFrame(func) };
  Module["setCanvasSize"] = function Module_setCanvasSize(width, height, noUpdates) { Browser.setCanvasSize(width, height, noUpdates) };
  Module["pauseMainLoop"] = function Module_pauseMainLoop() { Browser.mainLoop.pause() };
  Module["resumeMainLoop"] = function Module_resumeMainLoop() { Browser.mainLoop.resume() };
  Module["getUserMedia"] = function Module_getUserMedia() { Browser.getUserMedia() }
  Module["createContext"] = function Module_createContext(canvas, useWebGL, setInModule, webGLContextAttributes) { return Browser.createContext(canvas, useWebGL, setInModule, webGLContextAttributes) };
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
DYNAMICTOP_PTR = staticAlloc(4);

STACK_BASE = STACKTOP = alignMemory(STATICTOP);

STACK_MAX = STACK_BASE + TOTAL_STACK;

DYNAMIC_BASE = alignMemory(STACK_MAX);

HEAP32[DYNAMICTOP_PTR>>2] = DYNAMIC_BASE;

staticSealed = true; // seal the static portion of memory

assert(DYNAMIC_BASE < TOTAL_MEMORY, "TOTAL_MEMORY not big enough for stack");

var ASSERTIONS = true;

/** @type {function(string, boolean=, number=)} */
function intArrayFromString(stringy, dontAddNull, length) {
  var len = length > 0 ? length : lengthBytesUTF8(stringy)+1;
  var u8array = new Array(len);
  var numBytesWritten = stringToUTF8Array(stringy, u8array, 0, u8array.length);
  if (dontAddNull) u8array.length = numBytesWritten;
  return u8array;
}

function intArrayToString(array) {
  var ret = [];
  for (var i = 0; i < array.length; i++) {
    var chr = array[i];
    if (chr > 0xFF) {
      if (ASSERTIONS) {
        assert(false, 'Character code ' + chr + ' (' + String.fromCharCode(chr) + ')  at offset ' + i + ' not in 0x00-0xFF.');
      }
      chr &= 0xFF;
    }
    ret.push(String.fromCharCode(chr));
  }
  return ret.join('');
}



var debug_table_i = ["0"];
var debug_table_ii = ["0", "__ZN20SimulatorBlockDevice4initEv", "__ZN20SimulatorBlockDevice6deinitEv", "__ZN11BlockDevice4syncEv", "__ZNK20SimulatorBlockDevice13get_read_sizeEv", "__ZNK20SimulatorBlockDevice16get_program_sizeEv", "__ZNK20SimulatorBlockDevice14get_erase_sizeEv", "__ZNK11BlockDevice15get_erase_valueEv", "__ZNK20SimulatorBlockDevice4sizeEv", "___stdio_close", "__ZN6events5EventIFvvEE10event_postIPS1_EEiPNS2_5eventE", "0", "0", "0", "0", "0"];
var debug_table_iiii = ["0", "__ZNK20SimulatorBlockDevice14get_erase_sizeEy", "___stdio_write", "___stdio_seek", "___stdout_write", "_sn_write", "__ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv", "0"];
var debug_table_iiiiii = ["0", "__ZN20SimulatorBlockDevice5eraseEyy", "__ZN11BlockDevice4trimEyy", "0"];
var debug_table_iiiiiii = ["0", "__ZN20SimulatorBlockDevice4readEPvyy", "__ZN20SimulatorBlockDevice7programEPKvyy", "0"];
var debug_table_v = ["0", "__ZL25default_terminate_handlerv", "__Z8btn_fallv", "__ZN10__cxxabiv112_GLOBAL__N_110construct_Ev"];
var debug_table_vi = ["0", "__ZN4mbed11InterruptInD2Ev", "__ZN4mbed11InterruptInD0Ev", "_mbed_trace_default_print", "__ZN20SimulatorBlockDeviceD2Ev", "__ZN20SimulatorBlockDeviceD0Ev", "__ZN4mbed8CallbackIFvvEE13function_callIN6events5EventIS1_EEEEvPKv", "__ZN4mbed8CallbackIFvvEE13function_dtorIN6events5EventIS1_EEEEvPv", "__ZN10__cxxabiv116__shim_type_infoD2Ev", "__ZN10__cxxabiv117__class_type_infoD0Ev", "__ZNK10__cxxabiv116__shim_type_info5noop1Ev", "__ZNK10__cxxabiv116__shim_type_info5noop2Ev", "__ZN10__cxxabiv120__si_class_type_infoD0Ev", "__ZN10__cxxabiv121__vmi_class_type_infoD0Ev", "__ZN4mbed11InterruptInD2Ev__async_cb", "__ZN4mbed11InterruptInD2Ev__async_cb_50", "__ZN4mbed11InterruptInD0Ev__async_cb", "__ZN4mbed11InterruptInD0Ev__async_cb_58", "__ZN4mbed11InterruptIn12_irq_handlerEj14gpio_irq_event__async_cb", "__ZN4mbed11InterruptIn12_irq_handlerEj14gpio_irq_event__async_cb_2", "__ZN4mbed11InterruptIn4fallENS_8CallbackIFvvEEE__async_cb", "__ZN4mbed11InterruptIn4fallENS_8CallbackIFvvEEE__async_cb_3", "__ZN4mbed11InterruptIn4fallENS_8CallbackIFvvEEE__async_cb_4", "__ZN4mbed11InterruptIn4fallENS_8CallbackIFvvEEE__async_cb_5", "__ZN4mbed11InterruptIn4fallENS_8CallbackIFvvEEE__async_cb_6", "__ZN6events10EventQueue8dispatchEi__async_cb", "_equeue_alloc__async_cb", "_equeue_dealloc__async_cb", "_equeue_post__async_cb", "_equeue_enqueue__async_cb", "_equeue_dispatch__async_cb", "_equeue_dispatch__async_cb_24", "_equeue_dispatch__async_cb_22", "_equeue_dispatch__async_cb_23", "_equeue_dispatch__async_cb_25", "_mbed_trace_default_print__async_cb", "_mbed_tracef__async_cb", "_mbed_vtracef__async_cb", "_mbed_vtracef__async_cb_20", "_mbed_vtracef__async_cb_10", "_mbed_vtracef__async_cb_11", "_mbed_vtracef__async_cb_12", "_mbed_vtracef__async_cb_19", "_mbed_vtracef__async_cb_13", "_mbed_vtracef__async_cb_18", "_mbed_vtracef__async_cb_14", "_mbed_vtracef__async_cb_15", "_mbed_vtracef__async_cb_16", "_mbed_vtracef__async_cb_17", "_mbed_assert_internal__async_cb", "_mbed_die__async_cb_79", "_mbed_die__async_cb_78", "_mbed_die__async_cb_77", "_mbed_die__async_cb_76", "_mbed_die__async_cb_75", "_mbed_die__async_cb_74", "_mbed_die__async_cb_73", "_mbed_die__async_cb_72", "_mbed_die__async_cb_71", "_mbed_die__async_cb_70", "_mbed_die__async_cb_69", "_mbed_die__async_cb_68", "_mbed_die__async_cb_67", "_mbed_die__async_cb_66", "_mbed_die__async_cb_65", "_mbed_die__async_cb", "_mbed_error_printf__async_cb", "_mbed_error_vfprintf__async_cb", "_mbed_error_vfprintf__async_cb_48", "_mbed_error_vfprintf__async_cb_47", "_handle_interrupt_in__async_cb", "_serial_putc__async_cb_59", "_serial_putc__async_cb", "_invoke_ticker__async_cb_51", "_invoke_ticker__async_cb", "_wait_ms__async_cb", "__ZN20SimulatorBlockDevice4readEPvyy__async_cb", "__ZN20SimulatorBlockDevice4readEPvyy__async_cb_44", "__ZN20SimulatorBlockDevice4readEPvyy__async_cb_45", "__ZN20SimulatorBlockDevice4readEPvyy__async_cb_46", "__ZN20SimulatorBlockDevice7programEPKvyy__async_cb", "__ZN20SimulatorBlockDevice7programEPKvyy__async_cb_53", "__ZN20SimulatorBlockDevice7programEPKvyy__async_cb_54", "__ZN20SimulatorBlockDevice7programEPKvyy__async_cb_55", "__ZN20SimulatorBlockDevice5eraseEyy__async_cb", "__ZN20SimulatorBlockDevice5eraseEyy__async_cb_62", "__ZN20SimulatorBlockDevice5eraseEyy__async_cb_63", "__ZN20SimulatorBlockDevice5eraseEyy__async_cb_64", "__ZN20SimulatorBlockDeviceC2EPKcyy__async_cb", "__GLOBAL__sub_I_main_cpp__async_cb", "__Z8btn_fallv__async_cb", "_main__async_cb_38", "_main__async_cb_37", "_main__async_cb_36", "_main__async_cb_35", "_main__async_cb_39", "_main__async_cb_43", "__ZN6events5EventIFvvEE10event_dtorIPS1_EEvPNS2_5eventE", "_main__async_cb_42", "_main__async_cb", "_main__async_cb_34", "_main__async_cb_41", "_main__async_cb_40", "__ZN6events5EventIFvvEE10event_postIPS1_EEiPNS2_5eventE__async_cb_57", "__ZN6events10EventQueue13function_dtorINS0_9context00IPFvvEEEEEvPv", "__ZN6events10EventQueue13function_callINS0_9context00IPFvvEEEEEvPv", "__ZN6events5EventIFvvEE10event_postIPS1_EEiPNS2_5eventE__async_cb", "__ZN4mbed8CallbackIFvvEE13function_callIN6events5EventIS1_EEEEvPKv__async_cb", "__ZN4mbed8CallbackIFvvEE13function_callIN6events5EventIS1_EEEEvPKv__async_cb_80", "__ZN4mbed8CallbackIFvvEE13function_dtorIN6events5EventIS1_EEEEvPv__async_cb", "__ZN4mbed8CallbackIFvvEE13function_dtorIN6events5EventIS1_EEEEvPv__async_cb_8", "__ZN6events10EventQueue13function_callINS0_9context00IPFvvEEEEEvPv__async_cb", "_putc__async_cb_81", "_putc__async_cb", "___overflow__async_cb", "_fflush__async_cb_27", "_fflush__async_cb_26", "_fflush__async_cb_28", "_fflush__async_cb", "___fflush_unlocked__async_cb", "___fflush_unlocked__async_cb_60", "_vfprintf__async_cb", "_snprintf__async_cb", "_vsnprintf__async_cb", "_printf__async_cb", "_fputc__async_cb_49", "_fputc__async_cb", "_puts__async_cb", "__ZL25default_terminate_handlerv__async_cb", "__ZL25default_terminate_handlerv__async_cb_21", "_abort_message__async_cb", "_abort_message__async_cb_52", "__ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv__async_cb_61", "__ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv__async_cb", "___dynamic_cast__async_cb", "___dynamic_cast__async_cb_29", "__ZNK10__cxxabiv120__si_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb", "__ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb", "__ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_9", "__ZNK10__cxxabiv120__si_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb", "__ZN10__cxxabiv112_GLOBAL__N_19destruct_EPv", "__ZSt11__terminatePFvvE__async_cb", "__ZNK10__cxxabiv121__vmi_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb_56", "__ZNK10__cxxabiv121__vmi_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb", "__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_33", "__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_32", "__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_31", "__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_30", "__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb", "__ZNK10__cxxabiv121__vmi_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb_7", "__ZNK10__cxxabiv121__vmi_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb", "__ZNK10__cxxabiv122__base_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb", "__ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb", "__ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb", "___cxa_can_catch__async_cb", "___cxa_is_pointer_type__async_cb", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0"];
var debug_table_vii = ["0", "__ZN4mbed8CallbackIFvvEE13function_moveIN6events5EventIS1_EEEEvPvPKv", "__ZN4mbed11InterruptIn12_irq_handlerEj14gpio_irq_event", "0"];
var debug_table_viiii = ["0", "__ZNK10__cxxabiv117__class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi", "__ZNK10__cxxabiv120__si_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi", "__ZNK10__cxxabiv121__vmi_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi"];
var debug_table_viiiii = ["0", "__ZNK10__cxxabiv117__class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib", "__ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib", "__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib"];
var debug_table_viiiiii = ["0", "__ZNK10__cxxabiv117__class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib", "__ZNK10__cxxabiv120__si_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib", "__ZNK10__cxxabiv121__vmi_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib"];
function nullFunc_i(x) { Module["printErr"]("Invalid function pointer '" + x + "' called with signature 'i'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  Module["printErr"]("This pointer might make sense in another type signature: ii: " + debug_table_ii[x] + "  iiii: " + debug_table_iiii[x] + "  iiiiii: " + debug_table_iiiiii[x] + "  iiiiiii: " + debug_table_iiiiiii[x] + "  vi: " + debug_table_vi[x] + "  v: " + debug_table_v[x] + "  vii: " + debug_table_vii[x] + "  viiii: " + debug_table_viiii[x] + "  viiiii: " + debug_table_viiiii[x] + "  viiiiii: " + debug_table_viiiiii[x] + "  "); abort(x) }

function nullFunc_ii(x) { Module["printErr"]("Invalid function pointer '" + x + "' called with signature 'ii'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  Module["printErr"]("This pointer might make sense in another type signature: i: " + debug_table_i[x] + "  iiii: " + debug_table_iiii[x] + "  iiiiii: " + debug_table_iiiiii[x] + "  iiiiiii: " + debug_table_iiiiiii[x] + "  vii: " + debug_table_vii[x] + "  vi: " + debug_table_vi[x] + "  v: " + debug_table_v[x] + "  viiii: " + debug_table_viiii[x] + "  viiiii: " + debug_table_viiiii[x] + "  viiiiii: " + debug_table_viiiiii[x] + "  "); abort(x) }

function nullFunc_iiii(x) { Module["printErr"]("Invalid function pointer '" + x + "' called with signature 'iiii'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  Module["printErr"]("This pointer might make sense in another type signature: ii: " + debug_table_ii[x] + "  i: " + debug_table_i[x] + "  iiiiii: " + debug_table_iiiiii[x] + "  iiiiiii: " + debug_table_iiiiiii[x] + "  viiii: " + debug_table_viiii[x] + "  vii: " + debug_table_vii[x] + "  vi: " + debug_table_vi[x] + "  viiiii: " + debug_table_viiiii[x] + "  viiiiii: " + debug_table_viiiiii[x] + "  v: " + debug_table_v[x] + "  "); abort(x) }

function nullFunc_iiiiii(x) { Module["printErr"]("Invalid function pointer '" + x + "' called with signature 'iiiiii'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  Module["printErr"]("This pointer might make sense in another type signature: iiii: " + debug_table_iiii[x] + "  ii: " + debug_table_ii[x] + "  iiiiiii: " + debug_table_iiiiiii[x] + "  i: " + debug_table_i[x] + "  viiii: " + debug_table_viiii[x] + "  viiiii: " + debug_table_viiiii[x] + "  vii: " + debug_table_vii[x] + "  viiiiii: " + debug_table_viiiiii[x] + "  vi: " + debug_table_vi[x] + "  v: " + debug_table_v[x] + "  "); abort(x) }

function nullFunc_iiiiiii(x) { Module["printErr"]("Invalid function pointer '" + x + "' called with signature 'iiiiiii'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  Module["printErr"]("This pointer might make sense in another type signature: iiii: " + debug_table_iiii[x] + "  iiiiii: " + debug_table_iiiiii[x] + "  ii: " + debug_table_ii[x] + "  i: " + debug_table_i[x] + "  viiii: " + debug_table_viiii[x] + "  viiiii: " + debug_table_viiiii[x] + "  viiiiii: " + debug_table_viiiiii[x] + "  vii: " + debug_table_vii[x] + "  vi: " + debug_table_vi[x] + "  v: " + debug_table_v[x] + "  "); abort(x) }

function nullFunc_v(x) { Module["printErr"]("Invalid function pointer '" + x + "' called with signature 'v'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  Module["printErr"]("This pointer might make sense in another type signature: vi: " + debug_table_vi[x] + "  vii: " + debug_table_vii[x] + "  viiii: " + debug_table_viiii[x] + "  viiiii: " + debug_table_viiiii[x] + "  viiiiii: " + debug_table_viiiiii[x] + "  i: " + debug_table_i[x] + "  ii: " + debug_table_ii[x] + "  iiii: " + debug_table_iiii[x] + "  iiiiii: " + debug_table_iiiiii[x] + "  iiiiiii: " + debug_table_iiiiiii[x] + "  "); abort(x) }

function nullFunc_vi(x) { Module["printErr"]("Invalid function pointer '" + x + "' called with signature 'vi'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  Module["printErr"]("This pointer might make sense in another type signature: v: " + debug_table_v[x] + "  vii: " + debug_table_vii[x] + "  viiii: " + debug_table_viiii[x] + "  viiiii: " + debug_table_viiiii[x] + "  viiiiii: " + debug_table_viiiiii[x] + "  i: " + debug_table_i[x] + "  ii: " + debug_table_ii[x] + "  iiii: " + debug_table_iiii[x] + "  iiiiii: " + debug_table_iiiiii[x] + "  iiiiiii: " + debug_table_iiiiiii[x] + "  "); abort(x) }

function nullFunc_vii(x) { Module["printErr"]("Invalid function pointer '" + x + "' called with signature 'vii'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  Module["printErr"]("This pointer might make sense in another type signature: vi: " + debug_table_vi[x] + "  v: " + debug_table_v[x] + "  viiii: " + debug_table_viiii[x] + "  viiiii: " + debug_table_viiiii[x] + "  viiiiii: " + debug_table_viiiiii[x] + "  ii: " + debug_table_ii[x] + "  i: " + debug_table_i[x] + "  iiii: " + debug_table_iiii[x] + "  iiiiii: " + debug_table_iiiiii[x] + "  iiiiiii: " + debug_table_iiiiiii[x] + "  "); abort(x) }

function nullFunc_viiii(x) { Module["printErr"]("Invalid function pointer '" + x + "' called with signature 'viiii'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  Module["printErr"]("This pointer might make sense in another type signature: vii: " + debug_table_vii[x] + "  vi: " + debug_table_vi[x] + "  viiiii: " + debug_table_viiiii[x] + "  viiiiii: " + debug_table_viiiiii[x] + "  v: " + debug_table_v[x] + "  iiii: " + debug_table_iiii[x] + "  ii: " + debug_table_ii[x] + "  iiiiii: " + debug_table_iiiiii[x] + "  i: " + debug_table_i[x] + "  iiiiiii: " + debug_table_iiiiiii[x] + "  "); abort(x) }

function nullFunc_viiiii(x) { Module["printErr"]("Invalid function pointer '" + x + "' called with signature 'viiiii'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  Module["printErr"]("This pointer might make sense in another type signature: viiii: " + debug_table_viiii[x] + "  vii: " + debug_table_vii[x] + "  vi: " + debug_table_vi[x] + "  viiiiii: " + debug_table_viiiiii[x] + "  v: " + debug_table_v[x] + "  iiii: " + debug_table_iiii[x] + "  ii: " + debug_table_ii[x] + "  iiiiii: " + debug_table_iiiiii[x] + "  iiiiiii: " + debug_table_iiiiiii[x] + "  i: " + debug_table_i[x] + "  "); abort(x) }

function nullFunc_viiiiii(x) { Module["printErr"]("Invalid function pointer '" + x + "' called with signature 'viiiiii'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  Module["printErr"]("This pointer might make sense in another type signature: viiii: " + debug_table_viiii[x] + "  viiiii: " + debug_table_viiiii[x] + "  vii: " + debug_table_vii[x] + "  vi: " + debug_table_vi[x] + "  v: " + debug_table_v[x] + "  iiii: " + debug_table_iiii[x] + "  iiiiii: " + debug_table_iiiiii[x] + "  ii: " + debug_table_ii[x] + "  iiiiiii: " + debug_table_iiiiiii[x] + "  i: " + debug_table_i[x] + "  "); abort(x) }

function invoke_i(index) {
  try {
    return Module["dynCall_i"](index);
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

function invoke_iiii(index,a1,a2,a3) {
  try {
    return Module["dynCall_iiii"](index,a1,a2,a3);
  } catch(e) {
    if (typeof e !== 'number' && e !== 'longjmp') throw e;
    Module["setThrew"](1, 0);
  }
}

function invoke_iiiiii(index,a1,a2,a3,a4,a5) {
  try {
    return Module["dynCall_iiiiii"](index,a1,a2,a3,a4,a5);
  } catch(e) {
    if (typeof e !== 'number' && e !== 'longjmp') throw e;
    Module["setThrew"](1, 0);
  }
}

function invoke_iiiiiii(index,a1,a2,a3,a4,a5,a6) {
  try {
    return Module["dynCall_iiiiiii"](index,a1,a2,a3,a4,a5,a6);
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

function invoke_viiii(index,a1,a2,a3,a4) {
  try {
    Module["dynCall_viiii"](index,a1,a2,a3,a4);
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

function invoke_viiiiii(index,a1,a2,a3,a4,a5,a6) {
  try {
    Module["dynCall_viiiiii"](index,a1,a2,a3,a4,a5,a6);
  } catch(e) {
    if (typeof e !== 'number' && e !== 'longjmp') throw e;
    Module["setThrew"](1, 0);
  }
}

Module.asmGlobalArg = { "Math": Math, "Int8Array": Int8Array, "Int16Array": Int16Array, "Int32Array": Int32Array, "Uint8Array": Uint8Array, "Uint16Array": Uint16Array, "Uint32Array": Uint32Array, "Float32Array": Float32Array, "Float64Array": Float64Array, "NaN": NaN, "Infinity": Infinity };

Module.asmLibraryArg = { "abort": abort, "assert": assert, "enlargeMemory": enlargeMemory, "getTotalMemory": getTotalMemory, "abortOnCannotGrowMemory": abortOnCannotGrowMemory, "abortStackOverflow": abortStackOverflow, "nullFunc_i": nullFunc_i, "nullFunc_ii": nullFunc_ii, "nullFunc_iiii": nullFunc_iiii, "nullFunc_iiiiii": nullFunc_iiiiii, "nullFunc_iiiiiii": nullFunc_iiiiiii, "nullFunc_v": nullFunc_v, "nullFunc_vi": nullFunc_vi, "nullFunc_vii": nullFunc_vii, "nullFunc_viiii": nullFunc_viiii, "nullFunc_viiiii": nullFunc_viiiii, "nullFunc_viiiiii": nullFunc_viiiiii, "invoke_i": invoke_i, "invoke_ii": invoke_ii, "invoke_iiii": invoke_iiii, "invoke_iiiiii": invoke_iiiiii, "invoke_iiiiiii": invoke_iiiiiii, "invoke_v": invoke_v, "invoke_vi": invoke_vi, "invoke_vii": invoke_vii, "invoke_viiii": invoke_viiii, "invoke_viiiii": invoke_viiiii, "invoke_viiiiii": invoke_viiiiii, "__ZSt18uncaught_exceptionv": __ZSt18uncaught_exceptionv, "___cxa_begin_catch": ___cxa_begin_catch, "___cxa_find_matching_catch": ___cxa_find_matching_catch, "___gxx_personality_v0": ___gxx_personality_v0, "___lock": ___lock, "___resumeException": ___resumeException, "___setErrNo": ___setErrNo, "___syscall140": ___syscall140, "___syscall146": ___syscall146, "___syscall54": ___syscall54, "___syscall6": ___syscall6, "___unlock": ___unlock, "_abort": _abort, "_emscripten_asm_const_i": _emscripten_asm_const_i, "_emscripten_asm_const_iii": _emscripten_asm_const_iii, "_emscripten_asm_const_iiii": _emscripten_asm_const_iiii, "_emscripten_asm_const_iiiii": _emscripten_asm_const_iiiii, "_emscripten_get_now": _emscripten_get_now, "_emscripten_memcpy_big": _emscripten_memcpy_big, "_emscripten_set_main_loop": _emscripten_set_main_loop, "_emscripten_set_main_loop_timing": _emscripten_set_main_loop_timing, "_emscripten_sleep": _emscripten_sleep, "_gettimeofday": _gettimeofday, "_pthread_cond_init": _pthread_cond_init, "_pthread_cond_signal": _pthread_cond_signal, "_pthread_cond_timedwait": _pthread_cond_timedwait, "_pthread_cond_wait": _pthread_cond_wait, "_pthread_getspecific": _pthread_getspecific, "_pthread_key_create": _pthread_key_create, "_pthread_mutex_init": _pthread_mutex_init, "_pthread_once": _pthread_once, "_pthread_setspecific": _pthread_setspecific, "flush_NO_FILESYSTEM": flush_NO_FILESYSTEM, "DYNAMICTOP_PTR": DYNAMICTOP_PTR, "tempDoublePtr": tempDoublePtr, "ABORT": ABORT, "STACKTOP": STACKTOP, "STACK_MAX": STACK_MAX, "cttz_i8": cttz_i8, "___async": ___async, "___async_unwind": ___async_unwind, "___async_retval": ___async_retval, "___async_cur_frame": ___async_cur_frame };
// EMSCRIPTEN_START_ASM
var asm = (/** @suppress {uselessCode} */ function(global, env, buffer) {
'use asm';


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
  var nullFunc_i=env.nullFunc_i;
  var nullFunc_ii=env.nullFunc_ii;
  var nullFunc_iiii=env.nullFunc_iiii;
  var nullFunc_iiiiii=env.nullFunc_iiiiii;
  var nullFunc_iiiiiii=env.nullFunc_iiiiiii;
  var nullFunc_v=env.nullFunc_v;
  var nullFunc_vi=env.nullFunc_vi;
  var nullFunc_vii=env.nullFunc_vii;
  var nullFunc_viiii=env.nullFunc_viiii;
  var nullFunc_viiiii=env.nullFunc_viiiii;
  var nullFunc_viiiiii=env.nullFunc_viiiiii;
  var invoke_i=env.invoke_i;
  var invoke_ii=env.invoke_ii;
  var invoke_iiii=env.invoke_iiii;
  var invoke_iiiiii=env.invoke_iiiiii;
  var invoke_iiiiiii=env.invoke_iiiiiii;
  var invoke_v=env.invoke_v;
  var invoke_vi=env.invoke_vi;
  var invoke_vii=env.invoke_vii;
  var invoke_viiii=env.invoke_viiii;
  var invoke_viiiii=env.invoke_viiiii;
  var invoke_viiiiii=env.invoke_viiiiii;
  var __ZSt18uncaught_exceptionv=env.__ZSt18uncaught_exceptionv;
  var ___cxa_begin_catch=env.___cxa_begin_catch;
  var ___cxa_find_matching_catch=env.___cxa_find_matching_catch;
  var ___gxx_personality_v0=env.___gxx_personality_v0;
  var ___lock=env.___lock;
  var ___resumeException=env.___resumeException;
  var ___setErrNo=env.___setErrNo;
  var ___syscall140=env.___syscall140;
  var ___syscall146=env.___syscall146;
  var ___syscall54=env.___syscall54;
  var ___syscall6=env.___syscall6;
  var ___unlock=env.___unlock;
  var _abort=env._abort;
  var _emscripten_asm_const_i=env._emscripten_asm_const_i;
  var _emscripten_asm_const_iii=env._emscripten_asm_const_iii;
  var _emscripten_asm_const_iiii=env._emscripten_asm_const_iiii;
  var _emscripten_asm_const_iiiii=env._emscripten_asm_const_iiiii;
  var _emscripten_get_now=env._emscripten_get_now;
  var _emscripten_memcpy_big=env._emscripten_memcpy_big;
  var _emscripten_set_main_loop=env._emscripten_set_main_loop;
  var _emscripten_set_main_loop_timing=env._emscripten_set_main_loop_timing;
  var _emscripten_sleep=env._emscripten_sleep;
  var _gettimeofday=env._gettimeofday;
  var _pthread_cond_init=env._pthread_cond_init;
  var _pthread_cond_signal=env._pthread_cond_signal;
  var _pthread_cond_timedwait=env._pthread_cond_timedwait;
  var _pthread_cond_wait=env._pthread_cond_wait;
  var _pthread_getspecific=env._pthread_getspecific;
  var _pthread_key_create=env._pthread_key_create;
  var _pthread_mutex_init=env._pthread_mutex_init;
  var _pthread_once=env._pthread_once;
  var _pthread_setspecific=env._pthread_setspecific;
  var flush_NO_FILESYSTEM=env.flush_NO_FILESYSTEM;
  var tempFloat = 0.0;

// EMSCRIPTEN_START_FUNCS
function _malloc($0) {
 $0 = $0 | 0;
 var $$$0192$i = 0, $$$0193$i = 0, $$$4351$i = 0, $$$i = 0, $$0 = 0, $$0$i$i = 0, $$0$i$i$i = 0, $$0$i17$i = 0, $$0189$i = 0, $$0192$lcssa$i = 0, $$01926$i = 0, $$0193$lcssa$i = 0, $$01935$i = 0, $$0197 = 0, $$0199 = 0, $$0206$i$i = 0, $$0207$i$i = 0, $$0211$i$i = 0, $$0212$i$i = 0, $$024367$i = 0, $$0287$i$i = 0, $$0288$i$i = 0, $$0289$i$i = 0, $$0295$i$i = 0, $$0296$i$i = 0, $$0342$i = 0, $$0344$i = 0, $$0345$i = 0, $$0347$i = 0, $$0353$i = 0, $$0358$i = 0, $$0359$i = 0, $$0361$i = 0, $$0362$i = 0, $$0368$i = 0, $$1196$i = 0, $$1198$i = 0, $$124466$i = 0, $$1291$i$i = 0, $$1293$i$i = 0, $$1343$i = 0, $$1348$i = 0, $$1363$i = 0, $$1370$i = 0, $$1374$i = 0, $$2234243136$i = 0, $$2247$ph$i = 0, $$2253$ph$i = 0, $$2355$i = 0, $$3$i = 0, $$3$i$i = 0, $$3$i203 = 0, $$3350$i = 0, $$3372$i = 0, $$4$lcssa$i = 0, $$4$ph$i = 0, $$414$i = 0, $$4236$i = 0, $$4351$lcssa$i = 0, $$435113$i = 0, $$4357$$4$i = 0, $$4357$ph$i = 0, $$435712$i = 0, $$723947$i = 0, $$748$i = 0, $$pre$phi$i$iZ2D = 0, $$pre$phi$i19$iZ2D = 0, $$pre$phi$i211Z2D = 0, $$pre$phi$iZ2D = 0, $$pre$phi11$i$iZ2D = 0, $$pre$phiZ2D = 0, $1 = 0, $1004 = 0, $101 = 0, $1010 = 0, $1013 = 0, $1014 = 0, $102 = 0, $1032 = 0, $1034 = 0, $1041 = 0, $1042 = 0, $1043 = 0, $1052 = 0, $1054 = 0, $1055 = 0, $1056 = 0, $108 = 0, $112 = 0, $114 = 0, $115 = 0, $117 = 0, $119 = 0, $121 = 0, $123 = 0, $125 = 0, $127 = 0, $129 = 0, $134 = 0, $138 = 0, $14 = 0, $143 = 0, $146 = 0, $149 = 0, $150 = 0, $157 = 0, $159 = 0, $16 = 0, $162 = 0, $164 = 0, $167 = 0, $169 = 0, $17 = 0, $172 = 0, $175 = 0, $176 = 0, $178 = 0, $179 = 0, $18 = 0, $181 = 0, $182 = 0, $184 = 0, $185 = 0, $19 = 0, $190 = 0, $191 = 0, $20 = 0, $204 = 0, $208 = 0, $214 = 0, $221 = 0, $225 = 0, $234 = 0, $235 = 0, $237 = 0, $238 = 0, $242 = 0, $243 = 0, $251 = 0, $252 = 0, $253 = 0, $255 = 0, $256 = 0, $261 = 0, $262 = 0, $265 = 0, $267 = 0, $27 = 0, $270 = 0, $275 = 0, $282 = 0, $292 = 0, $296 = 0, $30 = 0, $302 = 0, $306 = 0, $309 = 0, $313 = 0, $315 = 0, $316 = 0, $318 = 0, $320 = 0, $322 = 0, $324 = 0, $326 = 0, $328 = 0, $330 = 0, $34 = 0, $340 = 0, $341 = 0, $352 = 0, $354 = 0, $357 = 0, $359 = 0, $362 = 0, $364 = 0, $367 = 0, $37 = 0, $370 = 0, $371 = 0, $373 = 0, $374 = 0, $376 = 0, $377 = 0, $379 = 0, $380 = 0, $385 = 0, $386 = 0, $391 = 0, $399 = 0, $403 = 0, $409 = 0, $41 = 0, $416 = 0, $420 = 0, $428 = 0, $431 = 0, $432 = 0, $433 = 0, $437 = 0, $438 = 0, $44 = 0, $444 = 0, $449 = 0, $450 = 0, $453 = 0, $455 = 0, $458 = 0, $463 = 0, $469 = 0, $47 = 0, $471 = 0, $473 = 0, $475 = 0, $49 = 0, $492 = 0, $494 = 0, $50 = 0, $501 = 0, $502 = 0, $503 = 0, $512 = 0, $514 = 0, $515 = 0, $517 = 0, $52 = 0, $526 = 0, $530 = 0, $532 = 0, $533 = 0, $534 = 0, $54 = 0, $545 = 0, $546 = 0, $547 = 0, $548 = 0, $549 = 0, $550 = 0, $552 = 0, $554 = 0, $555 = 0, $56 = 0, $561 = 0, $563 = 0, $565 = 0, $570 = 0, $572 = 0, $574 = 0, $575 = 0, $576 = 0, $58 = 0, $584 = 0, $585 = 0, $588 = 0, $592 = 0, $595 = 0, $597 = 0, $6 = 0, $60 = 0, $603 = 0, $607 = 0, $611 = 0, $62 = 0, $620 = 0, $621 = 0, $627 = 0, $629 = 0, $633 = 0, $636 = 0, $638 = 0, $64 = 0, $642 = 0, $644 = 0, $649 = 0, $650 = 0, $651 = 0, $657 = 0, $658 = 0, $659 = 0, $663 = 0, $67 = 0, $673 = 0, $675 = 0, $680 = 0, $681 = 0, $682 = 0, $688 = 0, $69 = 0, $690 = 0, $694 = 0, $7 = 0, $70 = 0, $700 = 0, $704 = 0, $71 = 0, $710 = 0, $712 = 0, $718 = 0, $72 = 0, $722 = 0, $723 = 0, $728 = 0, $73 = 0, $734 = 0, $739 = 0, $742 = 0, $743 = 0, $746 = 0, $748 = 0, $750 = 0, $753 = 0, $764 = 0, $769 = 0, $77 = 0, $771 = 0, $774 = 0, $776 = 0, $779 = 0, $782 = 0, $783 = 0, $784 = 0, $786 = 0, $788 = 0, $789 = 0, $791 = 0, $792 = 0, $797 = 0, $798 = 0, $8 = 0, $80 = 0, $812 = 0, $815 = 0, $816 = 0, $822 = 0, $83 = 0, $830 = 0, $836 = 0, $839 = 0, $84 = 0, $840 = 0, $841 = 0, $845 = 0, $846 = 0, $852 = 0, $857 = 0, $858 = 0, $861 = 0, $863 = 0, $866 = 0, $87 = 0, $871 = 0, $877 = 0, $879 = 0, $881 = 0, $882 = 0, $9 = 0, $900 = 0, $902 = 0, $909 = 0, $910 = 0, $911 = 0, $919 = 0, $92 = 0, $923 = 0, $927 = 0, $929 = 0, $93 = 0, $935 = 0, $936 = 0, $938 = 0, $939 = 0, $940 = 0, $941 = 0, $943 = 0, $948 = 0, $949 = 0, $95 = 0, $950 = 0, $956 = 0, $958 = 0, $96 = 0, $964 = 0, $969 = 0, $972 = 0, $973 = 0, $974 = 0, $978 = 0, $979 = 0, $98 = 0, $985 = 0, $990 = 0, $991 = 0, $994 = 0, $996 = 0, $999 = 0, label = 0, sp = 0, $958$looptemp = 0;
 sp = STACKTOP; //@line 4371
 STACKTOP = STACKTOP + 16 | 0; //@line 4372
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 4372
 $1 = sp; //@line 4373
 do {
  if ($0 >>> 0 < 245) {
   $6 = $0 >>> 0 < 11 ? 16 : $0 + 11 & -8; //@line 4380
   $7 = $6 >>> 3; //@line 4381
   $8 = HEAP32[1528] | 0; //@line 4382
   $9 = $8 >>> $7; //@line 4383
   if ($9 & 3 | 0) {
    $14 = ($9 & 1 ^ 1) + $7 | 0; //@line 4389
    $16 = 6152 + ($14 << 1 << 2) | 0; //@line 4391
    $17 = $16 + 8 | 0; //@line 4392
    $18 = HEAP32[$17 >> 2] | 0; //@line 4393
    $19 = $18 + 8 | 0; //@line 4394
    $20 = HEAP32[$19 >> 2] | 0; //@line 4395
    do {
     if (($20 | 0) == ($16 | 0)) {
      HEAP32[1528] = $8 & ~(1 << $14); //@line 4402
     } else {
      if ((HEAP32[1532] | 0) >>> 0 > $20 >>> 0) {
       _abort(); //@line 4407
      }
      $27 = $20 + 12 | 0; //@line 4410
      if ((HEAP32[$27 >> 2] | 0) == ($18 | 0)) {
       HEAP32[$27 >> 2] = $16; //@line 4414
       HEAP32[$17 >> 2] = $20; //@line 4415
       break;
      } else {
       _abort(); //@line 4418
      }
     }
    } while (0);
    $30 = $14 << 3; //@line 4423
    HEAP32[$18 + 4 >> 2] = $30 | 3; //@line 4426
    $34 = $18 + $30 + 4 | 0; //@line 4428
    HEAP32[$34 >> 2] = HEAP32[$34 >> 2] | 1; //@line 4431
    $$0 = $19; //@line 4432
    STACKTOP = sp; //@line 4433
    return $$0 | 0; //@line 4433
   }
   $37 = HEAP32[1530] | 0; //@line 4435
   if ($6 >>> 0 > $37 >>> 0) {
    if ($9 | 0) {
     $41 = 2 << $7; //@line 4441
     $44 = $9 << $7 & ($41 | 0 - $41); //@line 4444
     $47 = ($44 & 0 - $44) + -1 | 0; //@line 4447
     $49 = $47 >>> 12 & 16; //@line 4449
     $50 = $47 >>> $49; //@line 4450
     $52 = $50 >>> 5 & 8; //@line 4452
     $54 = $50 >>> $52; //@line 4454
     $56 = $54 >>> 2 & 4; //@line 4456
     $58 = $54 >>> $56; //@line 4458
     $60 = $58 >>> 1 & 2; //@line 4460
     $62 = $58 >>> $60; //@line 4462
     $64 = $62 >>> 1 & 1; //@line 4464
     $67 = ($52 | $49 | $56 | $60 | $64) + ($62 >>> $64) | 0; //@line 4467
     $69 = 6152 + ($67 << 1 << 2) | 0; //@line 4469
     $70 = $69 + 8 | 0; //@line 4470
     $71 = HEAP32[$70 >> 2] | 0; //@line 4471
     $72 = $71 + 8 | 0; //@line 4472
     $73 = HEAP32[$72 >> 2] | 0; //@line 4473
     do {
      if (($73 | 0) == ($69 | 0)) {
       $77 = $8 & ~(1 << $67); //@line 4479
       HEAP32[1528] = $77; //@line 4480
       $98 = $77; //@line 4481
      } else {
       if ((HEAP32[1532] | 0) >>> 0 > $73 >>> 0) {
        _abort(); //@line 4486
       }
       $80 = $73 + 12 | 0; //@line 4489
       if ((HEAP32[$80 >> 2] | 0) == ($71 | 0)) {
        HEAP32[$80 >> 2] = $69; //@line 4493
        HEAP32[$70 >> 2] = $73; //@line 4494
        $98 = $8; //@line 4495
        break;
       } else {
        _abort(); //@line 4498
       }
      }
     } while (0);
     $83 = $67 << 3; //@line 4503
     $84 = $83 - $6 | 0; //@line 4504
     HEAP32[$71 + 4 >> 2] = $6 | 3; //@line 4507
     $87 = $71 + $6 | 0; //@line 4508
     HEAP32[$87 + 4 >> 2] = $84 | 1; //@line 4511
     HEAP32[$71 + $83 >> 2] = $84; //@line 4513
     if ($37 | 0) {
      $92 = HEAP32[1533] | 0; //@line 4516
      $93 = $37 >>> 3; //@line 4517
      $95 = 6152 + ($93 << 1 << 2) | 0; //@line 4519
      $96 = 1 << $93; //@line 4520
      if (!($98 & $96)) {
       HEAP32[1528] = $98 | $96; //@line 4525
       $$0199 = $95; //@line 4527
       $$pre$phiZ2D = $95 + 8 | 0; //@line 4527
      } else {
       $101 = $95 + 8 | 0; //@line 4529
       $102 = HEAP32[$101 >> 2] | 0; //@line 4530
       if ((HEAP32[1532] | 0) >>> 0 > $102 >>> 0) {
        _abort(); //@line 4534
       } else {
        $$0199 = $102; //@line 4537
        $$pre$phiZ2D = $101; //@line 4537
       }
      }
      HEAP32[$$pre$phiZ2D >> 2] = $92; //@line 4540
      HEAP32[$$0199 + 12 >> 2] = $92; //@line 4542
      HEAP32[$92 + 8 >> 2] = $$0199; //@line 4544
      HEAP32[$92 + 12 >> 2] = $95; //@line 4546
     }
     HEAP32[1530] = $84; //@line 4548
     HEAP32[1533] = $87; //@line 4549
     $$0 = $72; //@line 4550
     STACKTOP = sp; //@line 4551
     return $$0 | 0; //@line 4551
    }
    $108 = HEAP32[1529] | 0; //@line 4553
    if (!$108) {
     $$0197 = $6; //@line 4556
    } else {
     $112 = ($108 & 0 - $108) + -1 | 0; //@line 4560
     $114 = $112 >>> 12 & 16; //@line 4562
     $115 = $112 >>> $114; //@line 4563
     $117 = $115 >>> 5 & 8; //@line 4565
     $119 = $115 >>> $117; //@line 4567
     $121 = $119 >>> 2 & 4; //@line 4569
     $123 = $119 >>> $121; //@line 4571
     $125 = $123 >>> 1 & 2; //@line 4573
     $127 = $123 >>> $125; //@line 4575
     $129 = $127 >>> 1 & 1; //@line 4577
     $134 = HEAP32[6416 + (($117 | $114 | $121 | $125 | $129) + ($127 >>> $129) << 2) >> 2] | 0; //@line 4582
     $138 = (HEAP32[$134 + 4 >> 2] & -8) - $6 | 0; //@line 4586
     $143 = HEAP32[$134 + 16 + (((HEAP32[$134 + 16 >> 2] | 0) == 0 & 1) << 2) >> 2] | 0; //@line 4592
     if (!$143) {
      $$0192$lcssa$i = $134; //@line 4595
      $$0193$lcssa$i = $138; //@line 4595
     } else {
      $$01926$i = $134; //@line 4597
      $$01935$i = $138; //@line 4597
      $146 = $143; //@line 4597
      while (1) {
       $149 = (HEAP32[$146 + 4 >> 2] & -8) - $6 | 0; //@line 4602
       $150 = $149 >>> 0 < $$01935$i >>> 0; //@line 4603
       $$$0193$i = $150 ? $149 : $$01935$i; //@line 4604
       $$$0192$i = $150 ? $146 : $$01926$i; //@line 4605
       $146 = HEAP32[$146 + 16 + (((HEAP32[$146 + 16 >> 2] | 0) == 0 & 1) << 2) >> 2] | 0; //@line 4611
       if (!$146) {
        $$0192$lcssa$i = $$$0192$i; //@line 4614
        $$0193$lcssa$i = $$$0193$i; //@line 4614
        break;
       } else {
        $$01926$i = $$$0192$i; //@line 4617
        $$01935$i = $$$0193$i; //@line 4617
       }
      }
     }
     $157 = HEAP32[1532] | 0; //@line 4621
     if ($157 >>> 0 > $$0192$lcssa$i >>> 0) {
      _abort(); //@line 4624
     }
     $159 = $$0192$lcssa$i + $6 | 0; //@line 4627
     if ($159 >>> 0 <= $$0192$lcssa$i >>> 0) {
      _abort(); //@line 4630
     }
     $162 = HEAP32[$$0192$lcssa$i + 24 >> 2] | 0; //@line 4634
     $164 = HEAP32[$$0192$lcssa$i + 12 >> 2] | 0; //@line 4636
     do {
      if (($164 | 0) == ($$0192$lcssa$i | 0)) {
       $175 = $$0192$lcssa$i + 20 | 0; //@line 4640
       $176 = HEAP32[$175 >> 2] | 0; //@line 4641
       if (!$176) {
        $178 = $$0192$lcssa$i + 16 | 0; //@line 4644
        $179 = HEAP32[$178 >> 2] | 0; //@line 4645
        if (!$179) {
         $$3$i = 0; //@line 4648
         break;
        } else {
         $$1196$i = $179; //@line 4651
         $$1198$i = $178; //@line 4651
        }
       } else {
        $$1196$i = $176; //@line 4654
        $$1198$i = $175; //@line 4654
       }
       while (1) {
        $181 = $$1196$i + 20 | 0; //@line 4657
        $182 = HEAP32[$181 >> 2] | 0; //@line 4658
        if ($182 | 0) {
         $$1196$i = $182; //@line 4661
         $$1198$i = $181; //@line 4661
         continue;
        }
        $184 = $$1196$i + 16 | 0; //@line 4664
        $185 = HEAP32[$184 >> 2] | 0; //@line 4665
        if (!$185) {
         break;
        } else {
         $$1196$i = $185; //@line 4670
         $$1198$i = $184; //@line 4670
        }
       }
       if ($157 >>> 0 > $$1198$i >>> 0) {
        _abort(); //@line 4675
       } else {
        HEAP32[$$1198$i >> 2] = 0; //@line 4678
        $$3$i = $$1196$i; //@line 4679
        break;
       }
      } else {
       $167 = HEAP32[$$0192$lcssa$i + 8 >> 2] | 0; //@line 4684
       if ($157 >>> 0 > $167 >>> 0) {
        _abort(); //@line 4687
       }
       $169 = $167 + 12 | 0; //@line 4690
       if ((HEAP32[$169 >> 2] | 0) != ($$0192$lcssa$i | 0)) {
        _abort(); //@line 4694
       }
       $172 = $164 + 8 | 0; //@line 4697
       if ((HEAP32[$172 >> 2] | 0) == ($$0192$lcssa$i | 0)) {
        HEAP32[$169 >> 2] = $164; //@line 4701
        HEAP32[$172 >> 2] = $167; //@line 4702
        $$3$i = $164; //@line 4703
        break;
       } else {
        _abort(); //@line 4706
       }
      }
     } while (0);
     L73 : do {
      if ($162 | 0) {
       $190 = HEAP32[$$0192$lcssa$i + 28 >> 2] | 0; //@line 4715
       $191 = 6416 + ($190 << 2) | 0; //@line 4716
       do {
        if (($$0192$lcssa$i | 0) == (HEAP32[$191 >> 2] | 0)) {
         HEAP32[$191 >> 2] = $$3$i; //@line 4721
         if (!$$3$i) {
          HEAP32[1529] = $108 & ~(1 << $190); //@line 4727
          break L73;
         }
        } else {
         if ((HEAP32[1532] | 0) >>> 0 > $162 >>> 0) {
          _abort(); //@line 4734
         } else {
          HEAP32[$162 + 16 + (((HEAP32[$162 + 16 >> 2] | 0) != ($$0192$lcssa$i | 0) & 1) << 2) >> 2] = $$3$i; //@line 4742
          if (!$$3$i) {
           break L73;
          } else {
           break;
          }
         }
        }
       } while (0);
       $204 = HEAP32[1532] | 0; //@line 4752
       if ($204 >>> 0 > $$3$i >>> 0) {
        _abort(); //@line 4755
       }
       HEAP32[$$3$i + 24 >> 2] = $162; //@line 4759
       $208 = HEAP32[$$0192$lcssa$i + 16 >> 2] | 0; //@line 4761
       do {
        if ($208 | 0) {
         if ($204 >>> 0 > $208 >>> 0) {
          _abort(); //@line 4767
         } else {
          HEAP32[$$3$i + 16 >> 2] = $208; //@line 4771
          HEAP32[$208 + 24 >> 2] = $$3$i; //@line 4773
          break;
         }
        }
       } while (0);
       $214 = HEAP32[$$0192$lcssa$i + 20 >> 2] | 0; //@line 4779
       if ($214 | 0) {
        if ((HEAP32[1532] | 0) >>> 0 > $214 >>> 0) {
         _abort(); //@line 4785
        } else {
         HEAP32[$$3$i + 20 >> 2] = $214; //@line 4789
         HEAP32[$214 + 24 >> 2] = $$3$i; //@line 4791
         break;
        }
       }
      }
     } while (0);
     if ($$0193$lcssa$i >>> 0 < 16) {
      $221 = $$0193$lcssa$i + $6 | 0; //@line 4799
      HEAP32[$$0192$lcssa$i + 4 >> 2] = $221 | 3; //@line 4802
      $225 = $$0192$lcssa$i + $221 + 4 | 0; //@line 4804
      HEAP32[$225 >> 2] = HEAP32[$225 >> 2] | 1; //@line 4807
     } else {
      HEAP32[$$0192$lcssa$i + 4 >> 2] = $6 | 3; //@line 4811
      HEAP32[$159 + 4 >> 2] = $$0193$lcssa$i | 1; //@line 4814
      HEAP32[$159 + $$0193$lcssa$i >> 2] = $$0193$lcssa$i; //@line 4816
      if ($37 | 0) {
       $234 = HEAP32[1533] | 0; //@line 4819
       $235 = $37 >>> 3; //@line 4820
       $237 = 6152 + ($235 << 1 << 2) | 0; //@line 4822
       $238 = 1 << $235; //@line 4823
       if (!($8 & $238)) {
        HEAP32[1528] = $8 | $238; //@line 4828
        $$0189$i = $237; //@line 4830
        $$pre$phi$iZ2D = $237 + 8 | 0; //@line 4830
       } else {
        $242 = $237 + 8 | 0; //@line 4832
        $243 = HEAP32[$242 >> 2] | 0; //@line 4833
        if ((HEAP32[1532] | 0) >>> 0 > $243 >>> 0) {
         _abort(); //@line 4837
        } else {
         $$0189$i = $243; //@line 4840
         $$pre$phi$iZ2D = $242; //@line 4840
        }
       }
       HEAP32[$$pre$phi$iZ2D >> 2] = $234; //@line 4843
       HEAP32[$$0189$i + 12 >> 2] = $234; //@line 4845
       HEAP32[$234 + 8 >> 2] = $$0189$i; //@line 4847
       HEAP32[$234 + 12 >> 2] = $237; //@line 4849
      }
      HEAP32[1530] = $$0193$lcssa$i; //@line 4851
      HEAP32[1533] = $159; //@line 4852
     }
     $$0 = $$0192$lcssa$i + 8 | 0; //@line 4855
     STACKTOP = sp; //@line 4856
     return $$0 | 0; //@line 4856
    }
   } else {
    $$0197 = $6; //@line 4859
   }
  } else {
   if ($0 >>> 0 > 4294967231) {
    $$0197 = -1; //@line 4864
   } else {
    $251 = $0 + 11 | 0; //@line 4866
    $252 = $251 & -8; //@line 4867
    $253 = HEAP32[1529] | 0; //@line 4868
    if (!$253) {
     $$0197 = $252; //@line 4871
    } else {
     $255 = 0 - $252 | 0; //@line 4873
     $256 = $251 >>> 8; //@line 4874
     if (!$256) {
      $$0358$i = 0; //@line 4877
     } else {
      if ($252 >>> 0 > 16777215) {
       $$0358$i = 31; //@line 4881
      } else {
       $261 = ($256 + 1048320 | 0) >>> 16 & 8; //@line 4885
       $262 = $256 << $261; //@line 4886
       $265 = ($262 + 520192 | 0) >>> 16 & 4; //@line 4889
       $267 = $262 << $265; //@line 4891
       $270 = ($267 + 245760 | 0) >>> 16 & 2; //@line 4894
       $275 = 14 - ($265 | $261 | $270) + ($267 << $270 >>> 15) | 0; //@line 4899
       $$0358$i = $252 >>> ($275 + 7 | 0) & 1 | $275 << 1; //@line 4905
      }
     }
     $282 = HEAP32[6416 + ($$0358$i << 2) >> 2] | 0; //@line 4909
     L117 : do {
      if (!$282) {
       $$2355$i = 0; //@line 4913
       $$3$i203 = 0; //@line 4913
       $$3350$i = $255; //@line 4913
       label = 81; //@line 4914
      } else {
       $$0342$i = 0; //@line 4921
       $$0347$i = $255; //@line 4921
       $$0353$i = $282; //@line 4921
       $$0359$i = $252 << (($$0358$i | 0) == 31 ? 0 : 25 - ($$0358$i >>> 1) | 0); //@line 4921
       $$0362$i = 0; //@line 4921
       while (1) {
        $292 = (HEAP32[$$0353$i + 4 >> 2] & -8) - $252 | 0; //@line 4926
        if ($292 >>> 0 < $$0347$i >>> 0) {
         if (!$292) {
          $$414$i = $$0353$i; //@line 4931
          $$435113$i = 0; //@line 4931
          $$435712$i = $$0353$i; //@line 4931
          label = 85; //@line 4932
          break L117;
         } else {
          $$1343$i = $$0353$i; //@line 4935
          $$1348$i = $292; //@line 4935
         }
        } else {
         $$1343$i = $$0342$i; //@line 4938
         $$1348$i = $$0347$i; //@line 4938
        }
        $296 = HEAP32[$$0353$i + 20 >> 2] | 0; //@line 4941
        $$0353$i = HEAP32[$$0353$i + 16 + ($$0359$i >>> 31 << 2) >> 2] | 0; //@line 4944
        $$1363$i = ($296 | 0) == 0 | ($296 | 0) == ($$0353$i | 0) ? $$0362$i : $296; //@line 4948
        $302 = ($$0353$i | 0) == 0; //@line 4949
        if ($302) {
         $$2355$i = $$1363$i; //@line 4954
         $$3$i203 = $$1343$i; //@line 4954
         $$3350$i = $$1348$i; //@line 4954
         label = 81; //@line 4955
         break;
        } else {
         $$0342$i = $$1343$i; //@line 4958
         $$0347$i = $$1348$i; //@line 4958
         $$0359$i = $$0359$i << (($302 ^ 1) & 1); //@line 4958
         $$0362$i = $$1363$i; //@line 4958
        }
       }
      }
     } while (0);
     if ((label | 0) == 81) {
      if (($$2355$i | 0) == 0 & ($$3$i203 | 0) == 0) {
       $306 = 2 << $$0358$i; //@line 4968
       $309 = $253 & ($306 | 0 - $306); //@line 4971
       if (!$309) {
        $$0197 = $252; //@line 4974
        break;
       }
       $313 = ($309 & 0 - $309) + -1 | 0; //@line 4979
       $315 = $313 >>> 12 & 16; //@line 4981
       $316 = $313 >>> $315; //@line 4982
       $318 = $316 >>> 5 & 8; //@line 4984
       $320 = $316 >>> $318; //@line 4986
       $322 = $320 >>> 2 & 4; //@line 4988
       $324 = $320 >>> $322; //@line 4990
       $326 = $324 >>> 1 & 2; //@line 4992
       $328 = $324 >>> $326; //@line 4994
       $330 = $328 >>> 1 & 1; //@line 4996
       $$4$ph$i = 0; //@line 5002
       $$4357$ph$i = HEAP32[6416 + (($318 | $315 | $322 | $326 | $330) + ($328 >>> $330) << 2) >> 2] | 0; //@line 5002
      } else {
       $$4$ph$i = $$3$i203; //@line 5004
       $$4357$ph$i = $$2355$i; //@line 5004
      }
      if (!$$4357$ph$i) {
       $$4$lcssa$i = $$4$ph$i; //@line 5008
       $$4351$lcssa$i = $$3350$i; //@line 5008
      } else {
       $$414$i = $$4$ph$i; //@line 5010
       $$435113$i = $$3350$i; //@line 5010
       $$435712$i = $$4357$ph$i; //@line 5010
       label = 85; //@line 5011
      }
     }
     if ((label | 0) == 85) {
      while (1) {
       label = 0; //@line 5016
       $340 = (HEAP32[$$435712$i + 4 >> 2] & -8) - $252 | 0; //@line 5020
       $341 = $340 >>> 0 < $$435113$i >>> 0; //@line 5021
       $$$4351$i = $341 ? $340 : $$435113$i; //@line 5022
       $$4357$$4$i = $341 ? $$435712$i : $$414$i; //@line 5023
       $$435712$i = HEAP32[$$435712$i + 16 + (((HEAP32[$$435712$i + 16 >> 2] | 0) == 0 & 1) << 2) >> 2] | 0; //@line 5029
       if (!$$435712$i) {
        $$4$lcssa$i = $$4357$$4$i; //@line 5032
        $$4351$lcssa$i = $$$4351$i; //@line 5032
        break;
       } else {
        $$414$i = $$4357$$4$i; //@line 5035
        $$435113$i = $$$4351$i; //@line 5035
        label = 85; //@line 5036
       }
      }
     }
     if (!$$4$lcssa$i) {
      $$0197 = $252; //@line 5042
     } else {
      if ($$4351$lcssa$i >>> 0 < ((HEAP32[1530] | 0) - $252 | 0) >>> 0) {
       $352 = HEAP32[1532] | 0; //@line 5048
       if ($352 >>> 0 > $$4$lcssa$i >>> 0) {
        _abort(); //@line 5051
       }
       $354 = $$4$lcssa$i + $252 | 0; //@line 5054
       if ($354 >>> 0 <= $$4$lcssa$i >>> 0) {
        _abort(); //@line 5057
       }
       $357 = HEAP32[$$4$lcssa$i + 24 >> 2] | 0; //@line 5061
       $359 = HEAP32[$$4$lcssa$i + 12 >> 2] | 0; //@line 5063
       do {
        if (($359 | 0) == ($$4$lcssa$i | 0)) {
         $370 = $$4$lcssa$i + 20 | 0; //@line 5067
         $371 = HEAP32[$370 >> 2] | 0; //@line 5068
         if (!$371) {
          $373 = $$4$lcssa$i + 16 | 0; //@line 5071
          $374 = HEAP32[$373 >> 2] | 0; //@line 5072
          if (!$374) {
           $$3372$i = 0; //@line 5075
           break;
          } else {
           $$1370$i = $374; //@line 5078
           $$1374$i = $373; //@line 5078
          }
         } else {
          $$1370$i = $371; //@line 5081
          $$1374$i = $370; //@line 5081
         }
         while (1) {
          $376 = $$1370$i + 20 | 0; //@line 5084
          $377 = HEAP32[$376 >> 2] | 0; //@line 5085
          if ($377 | 0) {
           $$1370$i = $377; //@line 5088
           $$1374$i = $376; //@line 5088
           continue;
          }
          $379 = $$1370$i + 16 | 0; //@line 5091
          $380 = HEAP32[$379 >> 2] | 0; //@line 5092
          if (!$380) {
           break;
          } else {
           $$1370$i = $380; //@line 5097
           $$1374$i = $379; //@line 5097
          }
         }
         if ($352 >>> 0 > $$1374$i >>> 0) {
          _abort(); //@line 5102
         } else {
          HEAP32[$$1374$i >> 2] = 0; //@line 5105
          $$3372$i = $$1370$i; //@line 5106
          break;
         }
        } else {
         $362 = HEAP32[$$4$lcssa$i + 8 >> 2] | 0; //@line 5111
         if ($352 >>> 0 > $362 >>> 0) {
          _abort(); //@line 5114
         }
         $364 = $362 + 12 | 0; //@line 5117
         if ((HEAP32[$364 >> 2] | 0) != ($$4$lcssa$i | 0)) {
          _abort(); //@line 5121
         }
         $367 = $359 + 8 | 0; //@line 5124
         if ((HEAP32[$367 >> 2] | 0) == ($$4$lcssa$i | 0)) {
          HEAP32[$364 >> 2] = $359; //@line 5128
          HEAP32[$367 >> 2] = $362; //@line 5129
          $$3372$i = $359; //@line 5130
          break;
         } else {
          _abort(); //@line 5133
         }
        }
       } while (0);
       L164 : do {
        if (!$357) {
         $475 = $253; //@line 5141
        } else {
         $385 = HEAP32[$$4$lcssa$i + 28 >> 2] | 0; //@line 5144
         $386 = 6416 + ($385 << 2) | 0; //@line 5145
         do {
          if (($$4$lcssa$i | 0) == (HEAP32[$386 >> 2] | 0)) {
           HEAP32[$386 >> 2] = $$3372$i; //@line 5150
           if (!$$3372$i) {
            $391 = $253 & ~(1 << $385); //@line 5155
            HEAP32[1529] = $391; //@line 5156
            $475 = $391; //@line 5157
            break L164;
           }
          } else {
           if ((HEAP32[1532] | 0) >>> 0 > $357 >>> 0) {
            _abort(); //@line 5164
           } else {
            HEAP32[$357 + 16 + (((HEAP32[$357 + 16 >> 2] | 0) != ($$4$lcssa$i | 0) & 1) << 2) >> 2] = $$3372$i; //@line 5172
            if (!$$3372$i) {
             $475 = $253; //@line 5175
             break L164;
            } else {
             break;
            }
           }
          }
         } while (0);
         $399 = HEAP32[1532] | 0; //@line 5183
         if ($399 >>> 0 > $$3372$i >>> 0) {
          _abort(); //@line 5186
         }
         HEAP32[$$3372$i + 24 >> 2] = $357; //@line 5190
         $403 = HEAP32[$$4$lcssa$i + 16 >> 2] | 0; //@line 5192
         do {
          if ($403 | 0) {
           if ($399 >>> 0 > $403 >>> 0) {
            _abort(); //@line 5198
           } else {
            HEAP32[$$3372$i + 16 >> 2] = $403; //@line 5202
            HEAP32[$403 + 24 >> 2] = $$3372$i; //@line 5204
            break;
           }
          }
         } while (0);
         $409 = HEAP32[$$4$lcssa$i + 20 >> 2] | 0; //@line 5210
         if (!$409) {
          $475 = $253; //@line 5213
         } else {
          if ((HEAP32[1532] | 0) >>> 0 > $409 >>> 0) {
           _abort(); //@line 5218
          } else {
           HEAP32[$$3372$i + 20 >> 2] = $409; //@line 5222
           HEAP32[$409 + 24 >> 2] = $$3372$i; //@line 5224
           $475 = $253; //@line 5225
           break;
          }
         }
        }
       } while (0);
       do {
        if ($$4351$lcssa$i >>> 0 < 16) {
         $416 = $$4351$lcssa$i + $252 | 0; //@line 5234
         HEAP32[$$4$lcssa$i + 4 >> 2] = $416 | 3; //@line 5237
         $420 = $$4$lcssa$i + $416 + 4 | 0; //@line 5239
         HEAP32[$420 >> 2] = HEAP32[$420 >> 2] | 1; //@line 5242
        } else {
         HEAP32[$$4$lcssa$i + 4 >> 2] = $252 | 3; //@line 5246
         HEAP32[$354 + 4 >> 2] = $$4351$lcssa$i | 1; //@line 5249
         HEAP32[$354 + $$4351$lcssa$i >> 2] = $$4351$lcssa$i; //@line 5251
         $428 = $$4351$lcssa$i >>> 3; //@line 5252
         if ($$4351$lcssa$i >>> 0 < 256) {
          $431 = 6152 + ($428 << 1 << 2) | 0; //@line 5256
          $432 = HEAP32[1528] | 0; //@line 5257
          $433 = 1 << $428; //@line 5258
          if (!($432 & $433)) {
           HEAP32[1528] = $432 | $433; //@line 5263
           $$0368$i = $431; //@line 5265
           $$pre$phi$i211Z2D = $431 + 8 | 0; //@line 5265
          } else {
           $437 = $431 + 8 | 0; //@line 5267
           $438 = HEAP32[$437 >> 2] | 0; //@line 5268
           if ((HEAP32[1532] | 0) >>> 0 > $438 >>> 0) {
            _abort(); //@line 5272
           } else {
            $$0368$i = $438; //@line 5275
            $$pre$phi$i211Z2D = $437; //@line 5275
           }
          }
          HEAP32[$$pre$phi$i211Z2D >> 2] = $354; //@line 5278
          HEAP32[$$0368$i + 12 >> 2] = $354; //@line 5280
          HEAP32[$354 + 8 >> 2] = $$0368$i; //@line 5282
          HEAP32[$354 + 12 >> 2] = $431; //@line 5284
          break;
         }
         $444 = $$4351$lcssa$i >>> 8; //@line 5287
         if (!$444) {
          $$0361$i = 0; //@line 5290
         } else {
          if ($$4351$lcssa$i >>> 0 > 16777215) {
           $$0361$i = 31; //@line 5294
          } else {
           $449 = ($444 + 1048320 | 0) >>> 16 & 8; //@line 5298
           $450 = $444 << $449; //@line 5299
           $453 = ($450 + 520192 | 0) >>> 16 & 4; //@line 5302
           $455 = $450 << $453; //@line 5304
           $458 = ($455 + 245760 | 0) >>> 16 & 2; //@line 5307
           $463 = 14 - ($453 | $449 | $458) + ($455 << $458 >>> 15) | 0; //@line 5312
           $$0361$i = $$4351$lcssa$i >>> ($463 + 7 | 0) & 1 | $463 << 1; //@line 5318
          }
         }
         $469 = 6416 + ($$0361$i << 2) | 0; //@line 5321
         HEAP32[$354 + 28 >> 2] = $$0361$i; //@line 5323
         $471 = $354 + 16 | 0; //@line 5324
         HEAP32[$471 + 4 >> 2] = 0; //@line 5326
         HEAP32[$471 >> 2] = 0; //@line 5327
         $473 = 1 << $$0361$i; //@line 5328
         if (!($475 & $473)) {
          HEAP32[1529] = $475 | $473; //@line 5333
          HEAP32[$469 >> 2] = $354; //@line 5334
          HEAP32[$354 + 24 >> 2] = $469; //@line 5336
          HEAP32[$354 + 12 >> 2] = $354; //@line 5338
          HEAP32[$354 + 8 >> 2] = $354; //@line 5340
          break;
         }
         $$0344$i = $$4351$lcssa$i << (($$0361$i | 0) == 31 ? 0 : 25 - ($$0361$i >>> 1) | 0); //@line 5349
         $$0345$i = HEAP32[$469 >> 2] | 0; //@line 5349
         while (1) {
          if ((HEAP32[$$0345$i + 4 >> 2] & -8 | 0) == ($$4351$lcssa$i | 0)) {
           label = 139; //@line 5356
           break;
          }
          $492 = $$0345$i + 16 + ($$0344$i >>> 31 << 2) | 0; //@line 5360
          $494 = HEAP32[$492 >> 2] | 0; //@line 5362
          if (!$494) {
           label = 136; //@line 5365
           break;
          } else {
           $$0344$i = $$0344$i << 1; //@line 5368
           $$0345$i = $494; //@line 5368
          }
         }
         if ((label | 0) == 136) {
          if ((HEAP32[1532] | 0) >>> 0 > $492 >>> 0) {
           _abort(); //@line 5375
          } else {
           HEAP32[$492 >> 2] = $354; //@line 5378
           HEAP32[$354 + 24 >> 2] = $$0345$i; //@line 5380
           HEAP32[$354 + 12 >> 2] = $354; //@line 5382
           HEAP32[$354 + 8 >> 2] = $354; //@line 5384
           break;
          }
         } else if ((label | 0) == 139) {
          $501 = $$0345$i + 8 | 0; //@line 5389
          $502 = HEAP32[$501 >> 2] | 0; //@line 5390
          $503 = HEAP32[1532] | 0; //@line 5391
          if ($503 >>> 0 <= $502 >>> 0 & $503 >>> 0 <= $$0345$i >>> 0) {
           HEAP32[$502 + 12 >> 2] = $354; //@line 5397
           HEAP32[$501 >> 2] = $354; //@line 5398
           HEAP32[$354 + 8 >> 2] = $502; //@line 5400
           HEAP32[$354 + 12 >> 2] = $$0345$i; //@line 5402
           HEAP32[$354 + 24 >> 2] = 0; //@line 5404
           break;
          } else {
           _abort(); //@line 5407
          }
         }
        }
       } while (0);
       $$0 = $$4$lcssa$i + 8 | 0; //@line 5414
       STACKTOP = sp; //@line 5415
       return $$0 | 0; //@line 5415
      } else {
       $$0197 = $252; //@line 5417
      }
     }
    }
   }
  }
 } while (0);
 $512 = HEAP32[1530] | 0; //@line 5424
 if ($512 >>> 0 >= $$0197 >>> 0) {
  $514 = $512 - $$0197 | 0; //@line 5427
  $515 = HEAP32[1533] | 0; //@line 5428
  if ($514 >>> 0 > 15) {
   $517 = $515 + $$0197 | 0; //@line 5431
   HEAP32[1533] = $517; //@line 5432
   HEAP32[1530] = $514; //@line 5433
   HEAP32[$517 + 4 >> 2] = $514 | 1; //@line 5436
   HEAP32[$515 + $512 >> 2] = $514; //@line 5438
   HEAP32[$515 + 4 >> 2] = $$0197 | 3; //@line 5441
  } else {
   HEAP32[1530] = 0; //@line 5443
   HEAP32[1533] = 0; //@line 5444
   HEAP32[$515 + 4 >> 2] = $512 | 3; //@line 5447
   $526 = $515 + $512 + 4 | 0; //@line 5449
   HEAP32[$526 >> 2] = HEAP32[$526 >> 2] | 1; //@line 5452
  }
  $$0 = $515 + 8 | 0; //@line 5455
  STACKTOP = sp; //@line 5456
  return $$0 | 0; //@line 5456
 }
 $530 = HEAP32[1531] | 0; //@line 5458
 if ($530 >>> 0 > $$0197 >>> 0) {
  $532 = $530 - $$0197 | 0; //@line 5461
  HEAP32[1531] = $532; //@line 5462
  $533 = HEAP32[1534] | 0; //@line 5463
  $534 = $533 + $$0197 | 0; //@line 5464
  HEAP32[1534] = $534; //@line 5465
  HEAP32[$534 + 4 >> 2] = $532 | 1; //@line 5468
  HEAP32[$533 + 4 >> 2] = $$0197 | 3; //@line 5471
  $$0 = $533 + 8 | 0; //@line 5473
  STACKTOP = sp; //@line 5474
  return $$0 | 0; //@line 5474
 }
 if (!(HEAP32[1646] | 0)) {
  HEAP32[1648] = 4096; //@line 5479
  HEAP32[1647] = 4096; //@line 5480
  HEAP32[1649] = -1; //@line 5481
  HEAP32[1650] = -1; //@line 5482
  HEAP32[1651] = 0; //@line 5483
  HEAP32[1639] = 0; //@line 5484
  HEAP32[1646] = $1 & -16 ^ 1431655768; //@line 5488
  $548 = 4096; //@line 5489
 } else {
  $548 = HEAP32[1648] | 0; //@line 5492
 }
 $545 = $$0197 + 48 | 0; //@line 5494
 $546 = $$0197 + 47 | 0; //@line 5495
 $547 = $548 + $546 | 0; //@line 5496
 $549 = 0 - $548 | 0; //@line 5497
 $550 = $547 & $549; //@line 5498
 if ($550 >>> 0 <= $$0197 >>> 0) {
  $$0 = 0; //@line 5501
  STACKTOP = sp; //@line 5502
  return $$0 | 0; //@line 5502
 }
 $552 = HEAP32[1638] | 0; //@line 5504
 if ($552 | 0) {
  $554 = HEAP32[1636] | 0; //@line 5507
  $555 = $554 + $550 | 0; //@line 5508
  if ($555 >>> 0 <= $554 >>> 0 | $555 >>> 0 > $552 >>> 0) {
   $$0 = 0; //@line 5513
   STACKTOP = sp; //@line 5514
   return $$0 | 0; //@line 5514
  }
 }
 L244 : do {
  if (!(HEAP32[1639] & 4)) {
   $561 = HEAP32[1534] | 0; //@line 5522
   L246 : do {
    if (!$561) {
     label = 163; //@line 5526
    } else {
     $$0$i$i = 6560; //@line 5528
     while (1) {
      $563 = HEAP32[$$0$i$i >> 2] | 0; //@line 5530
      if ($563 >>> 0 <= $561 >>> 0) {
       $565 = $$0$i$i + 4 | 0; //@line 5533
       if (($563 + (HEAP32[$565 >> 2] | 0) | 0) >>> 0 > $561 >>> 0) {
        break;
       }
      }
      $570 = HEAP32[$$0$i$i + 8 >> 2] | 0; //@line 5542
      if (!$570) {
       label = 163; //@line 5545
       break L246;
      } else {
       $$0$i$i = $570; //@line 5548
      }
     }
     $595 = $547 - $530 & $549; //@line 5552
     if ($595 >>> 0 < 2147483647) {
      $597 = _sbrk($595 | 0) | 0; //@line 5555
      if (($597 | 0) == ((HEAP32[$$0$i$i >> 2] | 0) + (HEAP32[$565 >> 2] | 0) | 0)) {
       if (($597 | 0) == (-1 | 0)) {
        $$2234243136$i = $595; //@line 5563
       } else {
        $$723947$i = $595; //@line 5565
        $$748$i = $597; //@line 5565
        label = 180; //@line 5566
        break L244;
       }
      } else {
       $$2247$ph$i = $597; //@line 5570
       $$2253$ph$i = $595; //@line 5570
       label = 171; //@line 5571
      }
     } else {
      $$2234243136$i = 0; //@line 5574
     }
    }
   } while (0);
   do {
    if ((label | 0) == 163) {
     $572 = _sbrk(0) | 0; //@line 5580
     if (($572 | 0) == (-1 | 0)) {
      $$2234243136$i = 0; //@line 5583
     } else {
      $574 = $572; //@line 5585
      $575 = HEAP32[1647] | 0; //@line 5586
      $576 = $575 + -1 | 0; //@line 5587
      $$$i = (($576 & $574 | 0) == 0 ? 0 : ($576 + $574 & 0 - $575) - $574 | 0) + $550 | 0; //@line 5595
      $584 = HEAP32[1636] | 0; //@line 5596
      $585 = $$$i + $584 | 0; //@line 5597
      if ($$$i >>> 0 > $$0197 >>> 0 & $$$i >>> 0 < 2147483647) {
       $588 = HEAP32[1638] | 0; //@line 5602
       if ($588 | 0) {
        if ($585 >>> 0 <= $584 >>> 0 | $585 >>> 0 > $588 >>> 0) {
         $$2234243136$i = 0; //@line 5609
         break;
        }
       }
       $592 = _sbrk($$$i | 0) | 0; //@line 5613
       if (($592 | 0) == ($572 | 0)) {
        $$723947$i = $$$i; //@line 5616
        $$748$i = $572; //@line 5616
        label = 180; //@line 5617
        break L244;
       } else {
        $$2247$ph$i = $592; //@line 5620
        $$2253$ph$i = $$$i; //@line 5620
        label = 171; //@line 5621
       }
      } else {
       $$2234243136$i = 0; //@line 5624
      }
     }
    }
   } while (0);
   do {
    if ((label | 0) == 171) {
     $603 = 0 - $$2253$ph$i | 0; //@line 5631
     if (!($545 >>> 0 > $$2253$ph$i >>> 0 & ($$2253$ph$i >>> 0 < 2147483647 & ($$2247$ph$i | 0) != (-1 | 0)))) {
      if (($$2247$ph$i | 0) == (-1 | 0)) {
       $$2234243136$i = 0; //@line 5640
       break;
      } else {
       $$723947$i = $$2253$ph$i; //@line 5643
       $$748$i = $$2247$ph$i; //@line 5643
       label = 180; //@line 5644
       break L244;
      }
     }
     $607 = HEAP32[1648] | 0; //@line 5648
     $611 = $546 - $$2253$ph$i + $607 & 0 - $607; //@line 5652
     if ($611 >>> 0 >= 2147483647) {
      $$723947$i = $$2253$ph$i; //@line 5655
      $$748$i = $$2247$ph$i; //@line 5655
      label = 180; //@line 5656
      break L244;
     }
     if ((_sbrk($611 | 0) | 0) == (-1 | 0)) {
      _sbrk($603 | 0) | 0; //@line 5662
      $$2234243136$i = 0; //@line 5663
      break;
     } else {
      $$723947$i = $611 + $$2253$ph$i | 0; //@line 5667
      $$748$i = $$2247$ph$i; //@line 5667
      label = 180; //@line 5668
      break L244;
     }
    }
   } while (0);
   HEAP32[1639] = HEAP32[1639] | 4; //@line 5675
   $$4236$i = $$2234243136$i; //@line 5676
   label = 178; //@line 5677
  } else {
   $$4236$i = 0; //@line 5679
   label = 178; //@line 5680
  }
 } while (0);
 if ((label | 0) == 178) {
  if ($550 >>> 0 < 2147483647) {
   $620 = _sbrk($550 | 0) | 0; //@line 5686
   $621 = _sbrk(0) | 0; //@line 5687
   $627 = $621 - $620 | 0; //@line 5695
   $629 = $627 >>> 0 > ($$0197 + 40 | 0) >>> 0; //@line 5697
   if (!(($620 | 0) == (-1 | 0) | $629 ^ 1 | $620 >>> 0 < $621 >>> 0 & (($620 | 0) != (-1 | 0) & ($621 | 0) != (-1 | 0)) ^ 1)) {
    $$723947$i = $629 ? $627 : $$4236$i; //@line 5705
    $$748$i = $620; //@line 5705
    label = 180; //@line 5706
   }
  }
 }
 if ((label | 0) == 180) {
  $633 = (HEAP32[1636] | 0) + $$723947$i | 0; //@line 5712
  HEAP32[1636] = $633; //@line 5713
  if ($633 >>> 0 > (HEAP32[1637] | 0) >>> 0) {
   HEAP32[1637] = $633; //@line 5717
  }
  $636 = HEAP32[1534] | 0; //@line 5719
  do {
   if (!$636) {
    $638 = HEAP32[1532] | 0; //@line 5723
    if (($638 | 0) == 0 | $$748$i >>> 0 < $638 >>> 0) {
     HEAP32[1532] = $$748$i; //@line 5728
    }
    HEAP32[1640] = $$748$i; //@line 5730
    HEAP32[1641] = $$723947$i; //@line 5731
    HEAP32[1643] = 0; //@line 5732
    HEAP32[1537] = HEAP32[1646]; //@line 5734
    HEAP32[1536] = -1; //@line 5735
    HEAP32[1541] = 6152; //@line 5736
    HEAP32[1540] = 6152; //@line 5737
    HEAP32[1543] = 6160; //@line 5738
    HEAP32[1542] = 6160; //@line 5739
    HEAP32[1545] = 6168; //@line 5740
    HEAP32[1544] = 6168; //@line 5741
    HEAP32[1547] = 6176; //@line 5742
    HEAP32[1546] = 6176; //@line 5743
    HEAP32[1549] = 6184; //@line 5744
    HEAP32[1548] = 6184; //@line 5745
    HEAP32[1551] = 6192; //@line 5746
    HEAP32[1550] = 6192; //@line 5747
    HEAP32[1553] = 6200; //@line 5748
    HEAP32[1552] = 6200; //@line 5749
    HEAP32[1555] = 6208; //@line 5750
    HEAP32[1554] = 6208; //@line 5751
    HEAP32[1557] = 6216; //@line 5752
    HEAP32[1556] = 6216; //@line 5753
    HEAP32[1559] = 6224; //@line 5754
    HEAP32[1558] = 6224; //@line 5755
    HEAP32[1561] = 6232; //@line 5756
    HEAP32[1560] = 6232; //@line 5757
    HEAP32[1563] = 6240; //@line 5758
    HEAP32[1562] = 6240; //@line 5759
    HEAP32[1565] = 6248; //@line 5760
    HEAP32[1564] = 6248; //@line 5761
    HEAP32[1567] = 6256; //@line 5762
    HEAP32[1566] = 6256; //@line 5763
    HEAP32[1569] = 6264; //@line 5764
    HEAP32[1568] = 6264; //@line 5765
    HEAP32[1571] = 6272; //@line 5766
    HEAP32[1570] = 6272; //@line 5767
    HEAP32[1573] = 6280; //@line 5768
    HEAP32[1572] = 6280; //@line 5769
    HEAP32[1575] = 6288; //@line 5770
    HEAP32[1574] = 6288; //@line 5771
    HEAP32[1577] = 6296; //@line 5772
    HEAP32[1576] = 6296; //@line 5773
    HEAP32[1579] = 6304; //@line 5774
    HEAP32[1578] = 6304; //@line 5775
    HEAP32[1581] = 6312; //@line 5776
    HEAP32[1580] = 6312; //@line 5777
    HEAP32[1583] = 6320; //@line 5778
    HEAP32[1582] = 6320; //@line 5779
    HEAP32[1585] = 6328; //@line 5780
    HEAP32[1584] = 6328; //@line 5781
    HEAP32[1587] = 6336; //@line 5782
    HEAP32[1586] = 6336; //@line 5783
    HEAP32[1589] = 6344; //@line 5784
    HEAP32[1588] = 6344; //@line 5785
    HEAP32[1591] = 6352; //@line 5786
    HEAP32[1590] = 6352; //@line 5787
    HEAP32[1593] = 6360; //@line 5788
    HEAP32[1592] = 6360; //@line 5789
    HEAP32[1595] = 6368; //@line 5790
    HEAP32[1594] = 6368; //@line 5791
    HEAP32[1597] = 6376; //@line 5792
    HEAP32[1596] = 6376; //@line 5793
    HEAP32[1599] = 6384; //@line 5794
    HEAP32[1598] = 6384; //@line 5795
    HEAP32[1601] = 6392; //@line 5796
    HEAP32[1600] = 6392; //@line 5797
    HEAP32[1603] = 6400; //@line 5798
    HEAP32[1602] = 6400; //@line 5799
    $642 = $$723947$i + -40 | 0; //@line 5800
    $644 = $$748$i + 8 | 0; //@line 5802
    $649 = ($644 & 7 | 0) == 0 ? 0 : 0 - $644 & 7; //@line 5807
    $650 = $$748$i + $649 | 0; //@line 5808
    $651 = $642 - $649 | 0; //@line 5809
    HEAP32[1534] = $650; //@line 5810
    HEAP32[1531] = $651; //@line 5811
    HEAP32[$650 + 4 >> 2] = $651 | 1; //@line 5814
    HEAP32[$$748$i + $642 + 4 >> 2] = 40; //@line 5817
    HEAP32[1535] = HEAP32[1650]; //@line 5819
   } else {
    $$024367$i = 6560; //@line 5821
    while (1) {
     $657 = HEAP32[$$024367$i >> 2] | 0; //@line 5823
     $658 = $$024367$i + 4 | 0; //@line 5824
     $659 = HEAP32[$658 >> 2] | 0; //@line 5825
     if (($$748$i | 0) == ($657 + $659 | 0)) {
      label = 188; //@line 5829
      break;
     }
     $663 = HEAP32[$$024367$i + 8 >> 2] | 0; //@line 5833
     if (!$663) {
      break;
     } else {
      $$024367$i = $663; //@line 5838
     }
    }
    if ((label | 0) == 188) {
     if (!(HEAP32[$$024367$i + 12 >> 2] & 8)) {
      if ($$748$i >>> 0 > $636 >>> 0 & $657 >>> 0 <= $636 >>> 0) {
       HEAP32[$658 >> 2] = $659 + $$723947$i; //@line 5852
       $673 = (HEAP32[1531] | 0) + $$723947$i | 0; //@line 5854
       $675 = $636 + 8 | 0; //@line 5856
       $680 = ($675 & 7 | 0) == 0 ? 0 : 0 - $675 & 7; //@line 5861
       $681 = $636 + $680 | 0; //@line 5862
       $682 = $673 - $680 | 0; //@line 5863
       HEAP32[1534] = $681; //@line 5864
       HEAP32[1531] = $682; //@line 5865
       HEAP32[$681 + 4 >> 2] = $682 | 1; //@line 5868
       HEAP32[$636 + $673 + 4 >> 2] = 40; //@line 5871
       HEAP32[1535] = HEAP32[1650]; //@line 5873
       break;
      }
     }
    }
    $688 = HEAP32[1532] | 0; //@line 5878
    if ($$748$i >>> 0 < $688 >>> 0) {
     HEAP32[1532] = $$748$i; //@line 5881
     $753 = $$748$i; //@line 5882
    } else {
     $753 = $688; //@line 5884
    }
    $690 = $$748$i + $$723947$i | 0; //@line 5886
    $$124466$i = 6560; //@line 5887
    while (1) {
     if ((HEAP32[$$124466$i >> 2] | 0) == ($690 | 0)) {
      label = 196; //@line 5892
      break;
     }
     $694 = HEAP32[$$124466$i + 8 >> 2] | 0; //@line 5896
     if (!$694) {
      $$0$i$i$i = 6560; //@line 5899
      break;
     } else {
      $$124466$i = $694; //@line 5902
     }
    }
    if ((label | 0) == 196) {
     if (!(HEAP32[$$124466$i + 12 >> 2] & 8)) {
      HEAP32[$$124466$i >> 2] = $$748$i; //@line 5911
      $700 = $$124466$i + 4 | 0; //@line 5912
      HEAP32[$700 >> 2] = (HEAP32[$700 >> 2] | 0) + $$723947$i; //@line 5915
      $704 = $$748$i + 8 | 0; //@line 5917
      $710 = $$748$i + (($704 & 7 | 0) == 0 ? 0 : 0 - $704 & 7) | 0; //@line 5923
      $712 = $690 + 8 | 0; //@line 5925
      $718 = $690 + (($712 & 7 | 0) == 0 ? 0 : 0 - $712 & 7) | 0; //@line 5931
      $722 = $710 + $$0197 | 0; //@line 5935
      $723 = $718 - $710 - $$0197 | 0; //@line 5936
      HEAP32[$710 + 4 >> 2] = $$0197 | 3; //@line 5939
      do {
       if (($636 | 0) == ($718 | 0)) {
        $728 = (HEAP32[1531] | 0) + $723 | 0; //@line 5944
        HEAP32[1531] = $728; //@line 5945
        HEAP32[1534] = $722; //@line 5946
        HEAP32[$722 + 4 >> 2] = $728 | 1; //@line 5949
       } else {
        if ((HEAP32[1533] | 0) == ($718 | 0)) {
         $734 = (HEAP32[1530] | 0) + $723 | 0; //@line 5955
         HEAP32[1530] = $734; //@line 5956
         HEAP32[1533] = $722; //@line 5957
         HEAP32[$722 + 4 >> 2] = $734 | 1; //@line 5960
         HEAP32[$722 + $734 >> 2] = $734; //@line 5962
         break;
        }
        $739 = HEAP32[$718 + 4 >> 2] | 0; //@line 5966
        if (($739 & 3 | 0) == 1) {
         $742 = $739 & -8; //@line 5970
         $743 = $739 >>> 3; //@line 5971
         L311 : do {
          if ($739 >>> 0 < 256) {
           $746 = HEAP32[$718 + 8 >> 2] | 0; //@line 5976
           $748 = HEAP32[$718 + 12 >> 2] | 0; //@line 5978
           $750 = 6152 + ($743 << 1 << 2) | 0; //@line 5980
           do {
            if (($746 | 0) != ($750 | 0)) {
             if ($753 >>> 0 > $746 >>> 0) {
              _abort(); //@line 5986
             }
             if ((HEAP32[$746 + 12 >> 2] | 0) == ($718 | 0)) {
              break;
             }
             _abort(); //@line 5995
            }
           } while (0);
           if (($748 | 0) == ($746 | 0)) {
            HEAP32[1528] = HEAP32[1528] & ~(1 << $743); //@line 6005
            break;
           }
           do {
            if (($748 | 0) == ($750 | 0)) {
             $$pre$phi11$i$iZ2D = $748 + 8 | 0; //@line 6012
            } else {
             if ($753 >>> 0 > $748 >>> 0) {
              _abort(); //@line 6016
             }
             $764 = $748 + 8 | 0; //@line 6019
             if ((HEAP32[$764 >> 2] | 0) == ($718 | 0)) {
              $$pre$phi11$i$iZ2D = $764; //@line 6023
              break;
             }
             _abort(); //@line 6026
            }
           } while (0);
           HEAP32[$746 + 12 >> 2] = $748; //@line 6031
           HEAP32[$$pre$phi11$i$iZ2D >> 2] = $746; //@line 6032
          } else {
           $769 = HEAP32[$718 + 24 >> 2] | 0; //@line 6035
           $771 = HEAP32[$718 + 12 >> 2] | 0; //@line 6037
           do {
            if (($771 | 0) == ($718 | 0)) {
             $782 = $718 + 16 | 0; //@line 6041
             $783 = $782 + 4 | 0; //@line 6042
             $784 = HEAP32[$783 >> 2] | 0; //@line 6043
             if (!$784) {
              $786 = HEAP32[$782 >> 2] | 0; //@line 6046
              if (!$786) {
               $$3$i$i = 0; //@line 6049
               break;
              } else {
               $$1291$i$i = $786; //@line 6052
               $$1293$i$i = $782; //@line 6052
              }
             } else {
              $$1291$i$i = $784; //@line 6055
              $$1293$i$i = $783; //@line 6055
             }
             while (1) {
              $788 = $$1291$i$i + 20 | 0; //@line 6058
              $789 = HEAP32[$788 >> 2] | 0; //@line 6059
              if ($789 | 0) {
               $$1291$i$i = $789; //@line 6062
               $$1293$i$i = $788; //@line 6062
               continue;
              }
              $791 = $$1291$i$i + 16 | 0; //@line 6065
              $792 = HEAP32[$791 >> 2] | 0; //@line 6066
              if (!$792) {
               break;
              } else {
               $$1291$i$i = $792; //@line 6071
               $$1293$i$i = $791; //@line 6071
              }
             }
             if ($753 >>> 0 > $$1293$i$i >>> 0) {
              _abort(); //@line 6076
             } else {
              HEAP32[$$1293$i$i >> 2] = 0; //@line 6079
              $$3$i$i = $$1291$i$i; //@line 6080
              break;
             }
            } else {
             $774 = HEAP32[$718 + 8 >> 2] | 0; //@line 6085
             if ($753 >>> 0 > $774 >>> 0) {
              _abort(); //@line 6088
             }
             $776 = $774 + 12 | 0; //@line 6091
             if ((HEAP32[$776 >> 2] | 0) != ($718 | 0)) {
              _abort(); //@line 6095
             }
             $779 = $771 + 8 | 0; //@line 6098
             if ((HEAP32[$779 >> 2] | 0) == ($718 | 0)) {
              HEAP32[$776 >> 2] = $771; //@line 6102
              HEAP32[$779 >> 2] = $774; //@line 6103
              $$3$i$i = $771; //@line 6104
              break;
             } else {
              _abort(); //@line 6107
             }
            }
           } while (0);
           if (!$769) {
            break;
           }
           $797 = HEAP32[$718 + 28 >> 2] | 0; //@line 6117
           $798 = 6416 + ($797 << 2) | 0; //@line 6118
           do {
            if ((HEAP32[$798 >> 2] | 0) == ($718 | 0)) {
             HEAP32[$798 >> 2] = $$3$i$i; //@line 6123
             if ($$3$i$i | 0) {
              break;
             }
             HEAP32[1529] = HEAP32[1529] & ~(1 << $797); //@line 6132
             break L311;
            } else {
             if ((HEAP32[1532] | 0) >>> 0 > $769 >>> 0) {
              _abort(); //@line 6138
             } else {
              HEAP32[$769 + 16 + (((HEAP32[$769 + 16 >> 2] | 0) != ($718 | 0) & 1) << 2) >> 2] = $$3$i$i; //@line 6146
              if (!$$3$i$i) {
               break L311;
              } else {
               break;
              }
             }
            }
           } while (0);
           $812 = HEAP32[1532] | 0; //@line 6156
           if ($812 >>> 0 > $$3$i$i >>> 0) {
            _abort(); //@line 6159
           }
           HEAP32[$$3$i$i + 24 >> 2] = $769; //@line 6163
           $815 = $718 + 16 | 0; //@line 6164
           $816 = HEAP32[$815 >> 2] | 0; //@line 6165
           do {
            if ($816 | 0) {
             if ($812 >>> 0 > $816 >>> 0) {
              _abort(); //@line 6171
             } else {
              HEAP32[$$3$i$i + 16 >> 2] = $816; //@line 6175
              HEAP32[$816 + 24 >> 2] = $$3$i$i; //@line 6177
              break;
             }
            }
           } while (0);
           $822 = HEAP32[$815 + 4 >> 2] | 0; //@line 6183
           if (!$822) {
            break;
           }
           if ((HEAP32[1532] | 0) >>> 0 > $822 >>> 0) {
            _abort(); //@line 6191
           } else {
            HEAP32[$$3$i$i + 20 >> 2] = $822; //@line 6195
            HEAP32[$822 + 24 >> 2] = $$3$i$i; //@line 6197
            break;
           }
          }
         } while (0);
         $$0$i17$i = $718 + $742 | 0; //@line 6204
         $$0287$i$i = $742 + $723 | 0; //@line 6204
        } else {
         $$0$i17$i = $718; //@line 6206
         $$0287$i$i = $723; //@line 6206
        }
        $830 = $$0$i17$i + 4 | 0; //@line 6208
        HEAP32[$830 >> 2] = HEAP32[$830 >> 2] & -2; //@line 6211
        HEAP32[$722 + 4 >> 2] = $$0287$i$i | 1; //@line 6214
        HEAP32[$722 + $$0287$i$i >> 2] = $$0287$i$i; //@line 6216
        $836 = $$0287$i$i >>> 3; //@line 6217
        if ($$0287$i$i >>> 0 < 256) {
         $839 = 6152 + ($836 << 1 << 2) | 0; //@line 6221
         $840 = HEAP32[1528] | 0; //@line 6222
         $841 = 1 << $836; //@line 6223
         do {
          if (!($840 & $841)) {
           HEAP32[1528] = $840 | $841; //@line 6229
           $$0295$i$i = $839; //@line 6231
           $$pre$phi$i19$iZ2D = $839 + 8 | 0; //@line 6231
          } else {
           $845 = $839 + 8 | 0; //@line 6233
           $846 = HEAP32[$845 >> 2] | 0; //@line 6234
           if ((HEAP32[1532] | 0) >>> 0 <= $846 >>> 0) {
            $$0295$i$i = $846; //@line 6238
            $$pre$phi$i19$iZ2D = $845; //@line 6238
            break;
           }
           _abort(); //@line 6241
          }
         } while (0);
         HEAP32[$$pre$phi$i19$iZ2D >> 2] = $722; //@line 6245
         HEAP32[$$0295$i$i + 12 >> 2] = $722; //@line 6247
         HEAP32[$722 + 8 >> 2] = $$0295$i$i; //@line 6249
         HEAP32[$722 + 12 >> 2] = $839; //@line 6251
         break;
        }
        $852 = $$0287$i$i >>> 8; //@line 6254
        do {
         if (!$852) {
          $$0296$i$i = 0; //@line 6258
         } else {
          if ($$0287$i$i >>> 0 > 16777215) {
           $$0296$i$i = 31; //@line 6262
           break;
          }
          $857 = ($852 + 1048320 | 0) >>> 16 & 8; //@line 6267
          $858 = $852 << $857; //@line 6268
          $861 = ($858 + 520192 | 0) >>> 16 & 4; //@line 6271
          $863 = $858 << $861; //@line 6273
          $866 = ($863 + 245760 | 0) >>> 16 & 2; //@line 6276
          $871 = 14 - ($861 | $857 | $866) + ($863 << $866 >>> 15) | 0; //@line 6281
          $$0296$i$i = $$0287$i$i >>> ($871 + 7 | 0) & 1 | $871 << 1; //@line 6287
         }
        } while (0);
        $877 = 6416 + ($$0296$i$i << 2) | 0; //@line 6290
        HEAP32[$722 + 28 >> 2] = $$0296$i$i; //@line 6292
        $879 = $722 + 16 | 0; //@line 6293
        HEAP32[$879 + 4 >> 2] = 0; //@line 6295
        HEAP32[$879 >> 2] = 0; //@line 6296
        $881 = HEAP32[1529] | 0; //@line 6297
        $882 = 1 << $$0296$i$i; //@line 6298
        if (!($881 & $882)) {
         HEAP32[1529] = $881 | $882; //@line 6303
         HEAP32[$877 >> 2] = $722; //@line 6304
         HEAP32[$722 + 24 >> 2] = $877; //@line 6306
         HEAP32[$722 + 12 >> 2] = $722; //@line 6308
         HEAP32[$722 + 8 >> 2] = $722; //@line 6310
         break;
        }
        $$0288$i$i = $$0287$i$i << (($$0296$i$i | 0) == 31 ? 0 : 25 - ($$0296$i$i >>> 1) | 0); //@line 6319
        $$0289$i$i = HEAP32[$877 >> 2] | 0; //@line 6319
        while (1) {
         if ((HEAP32[$$0289$i$i + 4 >> 2] & -8 | 0) == ($$0287$i$i | 0)) {
          label = 263; //@line 6326
          break;
         }
         $900 = $$0289$i$i + 16 + ($$0288$i$i >>> 31 << 2) | 0; //@line 6330
         $902 = HEAP32[$900 >> 2] | 0; //@line 6332
         if (!$902) {
          label = 260; //@line 6335
          break;
         } else {
          $$0288$i$i = $$0288$i$i << 1; //@line 6338
          $$0289$i$i = $902; //@line 6338
         }
        }
        if ((label | 0) == 260) {
         if ((HEAP32[1532] | 0) >>> 0 > $900 >>> 0) {
          _abort(); //@line 6345
         } else {
          HEAP32[$900 >> 2] = $722; //@line 6348
          HEAP32[$722 + 24 >> 2] = $$0289$i$i; //@line 6350
          HEAP32[$722 + 12 >> 2] = $722; //@line 6352
          HEAP32[$722 + 8 >> 2] = $722; //@line 6354
          break;
         }
        } else if ((label | 0) == 263) {
         $909 = $$0289$i$i + 8 | 0; //@line 6359
         $910 = HEAP32[$909 >> 2] | 0; //@line 6360
         $911 = HEAP32[1532] | 0; //@line 6361
         if ($911 >>> 0 <= $910 >>> 0 & $911 >>> 0 <= $$0289$i$i >>> 0) {
          HEAP32[$910 + 12 >> 2] = $722; //@line 6367
          HEAP32[$909 >> 2] = $722; //@line 6368
          HEAP32[$722 + 8 >> 2] = $910; //@line 6370
          HEAP32[$722 + 12 >> 2] = $$0289$i$i; //@line 6372
          HEAP32[$722 + 24 >> 2] = 0; //@line 6374
          break;
         } else {
          _abort(); //@line 6377
         }
        }
       }
      } while (0);
      $$0 = $710 + 8 | 0; //@line 6384
      STACKTOP = sp; //@line 6385
      return $$0 | 0; //@line 6385
     } else {
      $$0$i$i$i = 6560; //@line 6387
     }
    }
    while (1) {
     $919 = HEAP32[$$0$i$i$i >> 2] | 0; //@line 6391
     if ($919 >>> 0 <= $636 >>> 0) {
      $923 = $919 + (HEAP32[$$0$i$i$i + 4 >> 2] | 0) | 0; //@line 6396
      if ($923 >>> 0 > $636 >>> 0) {
       break;
      }
     }
     $$0$i$i$i = HEAP32[$$0$i$i$i + 8 >> 2] | 0; //@line 6404
    }
    $927 = $923 + -47 | 0; //@line 6406
    $929 = $927 + 8 | 0; //@line 6408
    $935 = $927 + (($929 & 7 | 0) == 0 ? 0 : 0 - $929 & 7) | 0; //@line 6414
    $936 = $636 + 16 | 0; //@line 6415
    $938 = $935 >>> 0 < $936 >>> 0 ? $636 : $935; //@line 6417
    $939 = $938 + 8 | 0; //@line 6418
    $940 = $938 + 24 | 0; //@line 6419
    $941 = $$723947$i + -40 | 0; //@line 6420
    $943 = $$748$i + 8 | 0; //@line 6422
    $948 = ($943 & 7 | 0) == 0 ? 0 : 0 - $943 & 7; //@line 6427
    $949 = $$748$i + $948 | 0; //@line 6428
    $950 = $941 - $948 | 0; //@line 6429
    HEAP32[1534] = $949; //@line 6430
    HEAP32[1531] = $950; //@line 6431
    HEAP32[$949 + 4 >> 2] = $950 | 1; //@line 6434
    HEAP32[$$748$i + $941 + 4 >> 2] = 40; //@line 6437
    HEAP32[1535] = HEAP32[1650]; //@line 6439
    $956 = $938 + 4 | 0; //@line 6440
    HEAP32[$956 >> 2] = 27; //@line 6441
    HEAP32[$939 >> 2] = HEAP32[1640]; //@line 6442
    HEAP32[$939 + 4 >> 2] = HEAP32[1641]; //@line 6442
    HEAP32[$939 + 8 >> 2] = HEAP32[1642]; //@line 6442
    HEAP32[$939 + 12 >> 2] = HEAP32[1643]; //@line 6442
    HEAP32[1640] = $$748$i; //@line 6443
    HEAP32[1641] = $$723947$i; //@line 6444
    HEAP32[1643] = 0; //@line 6445
    HEAP32[1642] = $939; //@line 6446
    $958 = $940; //@line 6447
    do {
     $958$looptemp = $958;
     $958 = $958 + 4 | 0; //@line 6449
     HEAP32[$958 >> 2] = 7; //@line 6450
    } while (($958$looptemp + 8 | 0) >>> 0 < $923 >>> 0);
    if (($938 | 0) != ($636 | 0)) {
     $964 = $938 - $636 | 0; //@line 6463
     HEAP32[$956 >> 2] = HEAP32[$956 >> 2] & -2; //@line 6466
     HEAP32[$636 + 4 >> 2] = $964 | 1; //@line 6469
     HEAP32[$938 >> 2] = $964; //@line 6470
     $969 = $964 >>> 3; //@line 6471
     if ($964 >>> 0 < 256) {
      $972 = 6152 + ($969 << 1 << 2) | 0; //@line 6475
      $973 = HEAP32[1528] | 0; //@line 6476
      $974 = 1 << $969; //@line 6477
      if (!($973 & $974)) {
       HEAP32[1528] = $973 | $974; //@line 6482
       $$0211$i$i = $972; //@line 6484
       $$pre$phi$i$iZ2D = $972 + 8 | 0; //@line 6484
      } else {
       $978 = $972 + 8 | 0; //@line 6486
       $979 = HEAP32[$978 >> 2] | 0; //@line 6487
       if ((HEAP32[1532] | 0) >>> 0 > $979 >>> 0) {
        _abort(); //@line 6491
       } else {
        $$0211$i$i = $979; //@line 6494
        $$pre$phi$i$iZ2D = $978; //@line 6494
       }
      }
      HEAP32[$$pre$phi$i$iZ2D >> 2] = $636; //@line 6497
      HEAP32[$$0211$i$i + 12 >> 2] = $636; //@line 6499
      HEAP32[$636 + 8 >> 2] = $$0211$i$i; //@line 6501
      HEAP32[$636 + 12 >> 2] = $972; //@line 6503
      break;
     }
     $985 = $964 >>> 8; //@line 6506
     if (!$985) {
      $$0212$i$i = 0; //@line 6509
     } else {
      if ($964 >>> 0 > 16777215) {
       $$0212$i$i = 31; //@line 6513
      } else {
       $990 = ($985 + 1048320 | 0) >>> 16 & 8; //@line 6517
       $991 = $985 << $990; //@line 6518
       $994 = ($991 + 520192 | 0) >>> 16 & 4; //@line 6521
       $996 = $991 << $994; //@line 6523
       $999 = ($996 + 245760 | 0) >>> 16 & 2; //@line 6526
       $1004 = 14 - ($994 | $990 | $999) + ($996 << $999 >>> 15) | 0; //@line 6531
       $$0212$i$i = $964 >>> ($1004 + 7 | 0) & 1 | $1004 << 1; //@line 6537
      }
     }
     $1010 = 6416 + ($$0212$i$i << 2) | 0; //@line 6540
     HEAP32[$636 + 28 >> 2] = $$0212$i$i; //@line 6542
     HEAP32[$636 + 20 >> 2] = 0; //@line 6544
     HEAP32[$936 >> 2] = 0; //@line 6545
     $1013 = HEAP32[1529] | 0; //@line 6546
     $1014 = 1 << $$0212$i$i; //@line 6547
     if (!($1013 & $1014)) {
      HEAP32[1529] = $1013 | $1014; //@line 6552
      HEAP32[$1010 >> 2] = $636; //@line 6553
      HEAP32[$636 + 24 >> 2] = $1010; //@line 6555
      HEAP32[$636 + 12 >> 2] = $636; //@line 6557
      HEAP32[$636 + 8 >> 2] = $636; //@line 6559
      break;
     }
     $$0206$i$i = $964 << (($$0212$i$i | 0) == 31 ? 0 : 25 - ($$0212$i$i >>> 1) | 0); //@line 6568
     $$0207$i$i = HEAP32[$1010 >> 2] | 0; //@line 6568
     while (1) {
      if ((HEAP32[$$0207$i$i + 4 >> 2] & -8 | 0) == ($964 | 0)) {
       label = 289; //@line 6575
       break;
      }
      $1032 = $$0207$i$i + 16 + ($$0206$i$i >>> 31 << 2) | 0; //@line 6579
      $1034 = HEAP32[$1032 >> 2] | 0; //@line 6581
      if (!$1034) {
       label = 286; //@line 6584
       break;
      } else {
       $$0206$i$i = $$0206$i$i << 1; //@line 6587
       $$0207$i$i = $1034; //@line 6587
      }
     }
     if ((label | 0) == 286) {
      if ((HEAP32[1532] | 0) >>> 0 > $1032 >>> 0) {
       _abort(); //@line 6594
      } else {
       HEAP32[$1032 >> 2] = $636; //@line 6597
       HEAP32[$636 + 24 >> 2] = $$0207$i$i; //@line 6599
       HEAP32[$636 + 12 >> 2] = $636; //@line 6601
       HEAP32[$636 + 8 >> 2] = $636; //@line 6603
       break;
      }
     } else if ((label | 0) == 289) {
      $1041 = $$0207$i$i + 8 | 0; //@line 6608
      $1042 = HEAP32[$1041 >> 2] | 0; //@line 6609
      $1043 = HEAP32[1532] | 0; //@line 6610
      if ($1043 >>> 0 <= $1042 >>> 0 & $1043 >>> 0 <= $$0207$i$i >>> 0) {
       HEAP32[$1042 + 12 >> 2] = $636; //@line 6616
       HEAP32[$1041 >> 2] = $636; //@line 6617
       HEAP32[$636 + 8 >> 2] = $1042; //@line 6619
       HEAP32[$636 + 12 >> 2] = $$0207$i$i; //@line 6621
       HEAP32[$636 + 24 >> 2] = 0; //@line 6623
       break;
      } else {
       _abort(); //@line 6626
      }
     }
    }
   }
  } while (0);
  $1052 = HEAP32[1531] | 0; //@line 6633
  if ($1052 >>> 0 > $$0197 >>> 0) {
   $1054 = $1052 - $$0197 | 0; //@line 6636
   HEAP32[1531] = $1054; //@line 6637
   $1055 = HEAP32[1534] | 0; //@line 6638
   $1056 = $1055 + $$0197 | 0; //@line 6639
   HEAP32[1534] = $1056; //@line 6640
   HEAP32[$1056 + 4 >> 2] = $1054 | 1; //@line 6643
   HEAP32[$1055 + 4 >> 2] = $$0197 | 3; //@line 6646
   $$0 = $1055 + 8 | 0; //@line 6648
   STACKTOP = sp; //@line 6649
   return $$0 | 0; //@line 6649
  }
 }
 HEAP32[(___errno_location() | 0) >> 2] = 12; //@line 6653
 $$0 = 0; //@line 6654
 STACKTOP = sp; //@line 6655
 return $$0 | 0; //@line 6655
}
function _equeue_dispatch__async_cb_25($0) {
 $0 = $0 | 0;
 var $$02329$i$i = 0, $$02330$i$i = 0, $$025$i$i = 0, $$03956$i = 0, $$03956$i$phi = 0, $$04055$i = 0, $$0405571$i = 0, $$04063$i = 0, $$04159$i = 0, $$04258$i = 0, $$057$i = 0, $$067 = 0, $$06992 = 0, $$2 = 0, $$expand_i1_val = 0, $$expand_i1_val11 = 0, $$expand_i1_val13 = 0, $$expand_i1_val9 = 0, $$sink$in$i$i = 0, $$sroa$0$i$0$$sroa$0$0$$sroa$0$0$$0$4353$pre$i75 = 0, $$sroa$0$i$0$$sroa$0$0$$sroa$0$0$$0$52$i74 = 0, $10 = 0, $100 = 0, $101 = 0, $102 = 0, $103 = 0, $104 = 0, $105 = 0, $106 = 0, $107 = 0, $108 = 0, $109 = 0, $110 = 0, $111 = 0, $112 = 0, $113 = 0, $114 = 0, $115 = 0, $116 = 0, $117 = 0, $118 = 0, $12 = 0, $127 = 0, $130 = 0, $131 = 0, $132 = 0, $133 = 0, $134 = 0, $135 = 0, $136 = 0, $137 = 0, $138 = 0, $139 = 0, $14 = 0, $140 = 0, $141 = 0, $142 = 0, $143 = 0, $144 = 0, $145 = 0, $146 = 0, $147 = 0, $148 = 0, $149 = 0, $150 = 0, $152 = 0, $153 = 0, $154 = 0, $156 = 0, $157 = 0, $16 = 0, $165 = 0, $166 = 0, $168 = 0, $171 = 0, $173 = 0, $176 = 0, $179 = 0, $18 = 0, $183 = 0, $184 = 0, $185 = 0, $186 = 0, $190 = 0, $193 = 0, $199 = 0, $2 = 0, $20 = 0, $200 = 0, $201 = 0, $202 = 0, $203 = 0, $204 = 0, $205 = 0, $206 = 0, $207 = 0, $208 = 0, $209 = 0, $210 = 0, $211 = 0, $212 = 0, $213 = 0, $214 = 0, $215 = 0, $216 = 0, $217 = 0, $22 = 0, $24 = 0, $26 = 0, $28 = 0, $30 = 0, $32 = 0, $34 = 0, $36 = 0, $4 = 0, $44 = 0, $45 = 0, $48 = 0, $54 = 0, $6 = 0, $63 = 0, $66 = 0, $67 = 0, $69 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $78 = 0, $79 = 0, $8 = 0, $80 = 0, $81 = 0, $82 = 0, $83 = 0, $84 = 0, $85 = 0, $86 = 0, $87 = 0, $88 = 0, $89 = 0, $90 = 0, $91 = 0, $93 = 0, $95 = 0, $98 = 0, $99 = 0, $ReallocAsyncCtx = 0, $ReallocAsyncCtx2 = 0, $ReallocAsyncCtx3 = 0, $ReallocAsyncCtx4 = 0, $ReallocAsyncCtx5 = 0, label = 0, sp = 0, $$04159$i$looptemp = 0, $$04258$i$looptemp = 0;
 sp = STACKTOP; //@line 4500
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 4502
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 4504
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 4506
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 4508
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 4510
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 4512
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 4514
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 4516
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 4518
 $20 = HEAP8[$0 + 40 >> 0] & 1; //@line 4521
 $22 = HEAP32[$0 + 44 >> 2] | 0; //@line 4523
 $24 = HEAP32[$0 + 48 >> 2] | 0; //@line 4525
 $26 = HEAP32[$0 + 52 >> 2] | 0; //@line 4527
 $28 = HEAP32[$0 + 56 >> 2] | 0; //@line 4529
 $30 = HEAP32[$0 + 60 >> 2] | 0; //@line 4531
 $32 = HEAP32[$0 + 64 >> 2] | 0; //@line 4533
 $34 = HEAP32[$0 + 68 >> 2] | 0; //@line 4535
 $36 = HEAP32[$0 + 72 >> 2] | 0; //@line 4537
 _equeue_mutex_lock($6); //@line 4538
 HEAP8[$32 >> 0] = (HEAPU8[$32 >> 0] | 0) + 1; //@line 4543
 if (((HEAP32[$34 >> 2] | 0) - $36 | 0) < 1) {
  HEAP32[$34 >> 2] = $36; //@line 4548
 }
 $44 = HEAP32[$26 >> 2] | 0; //@line 4550
 HEAP32[$28 >> 2] = $44; //@line 4551
 $45 = $44; //@line 4552
 L6 : do {
  if (!$44) {
   $$04055$i = $2; //@line 4556
   $54 = $45; //@line 4556
   label = 8; //@line 4557
  } else {
   $$04063$i = $2; //@line 4559
   $48 = $45; //@line 4559
   do {
    if (((HEAP32[$48 + 20 >> 2] | 0) - $36 | 0) >= 1) {
     $$04055$i = $$04063$i; //@line 4566
     $54 = $48; //@line 4566
     label = 8; //@line 4567
     break L6;
    }
    $$04063$i = $48 + 8 | 0; //@line 4570
    $48 = HEAP32[$$04063$i >> 2] | 0; //@line 4571
   } while (($48 | 0) != 0);
   HEAP32[$24 >> 2] = 0; //@line 4579
   $$0405571$i = $$04063$i; //@line 4580
  }
 } while (0);
 if ((label | 0) == 8) {
  HEAP32[$24 >> 2] = $54; //@line 4584
  if (!$54) {
   $$0405571$i = $$04055$i; //@line 4587
  } else {
   HEAP32[$54 + 16 >> 2] = $24; //@line 4590
   $$0405571$i = $$04055$i; //@line 4591
  }
 }
 HEAP32[$$0405571$i >> 2] = 0; //@line 4594
 _equeue_mutex_unlock($6); //@line 4595
 $$sroa$0$i$0$$sroa$0$0$$sroa$0$0$$0$52$i74 = HEAP32[$2 >> 2] | 0; //@line 4596
 L15 : do {
  if (!$$sroa$0$i$0$$sroa$0$0$$sroa$0$0$$0$52$i74) {} else {
   $$04159$i = $$sroa$0$i$0$$sroa$0$0$$sroa$0$0$$0$52$i74; //@line 4601
   $$04258$i = $2; //@line 4601
   do {
    $$04258$i$looptemp = $$04258$i;
    $$04258$i = $$04159$i + 8 | 0; //@line 4603
    $$04159$i$looptemp = $$04159$i;
    $$04159$i = HEAP32[$$04258$i >> 2] | 0; //@line 4604
    $$03956$i = 0; //@line 4605
    $$057$i = $$04159$i$looptemp; //@line 4605
    while (1) {
     HEAP32[$$057$i + 8 >> 2] = $$03956$i; //@line 4608
     $63 = HEAP32[$$057$i + 12 >> 2] | 0; //@line 4610
     if (!$63) {
      break;
     } else {
      $$03956$i$phi = $$057$i; //@line 4615
      $$057$i = $63; //@line 4615
      $$03956$i = $$03956$i$phi; //@line 4615
     }
    }
    HEAP32[$$04258$i$looptemp >> 2] = $$057$i; //@line 4618
   } while (($$04159$i | 0) != 0);
   $$sroa$0$i$0$$sroa$0$0$$sroa$0$0$$0$4353$pre$i75 = HEAP32[$2 >> 2] | 0; //@line 4626
   if ($$sroa$0$i$0$$sroa$0$0$$sroa$0$0$$0$4353$pre$i75 | 0) {
    $$06992 = $$sroa$0$i$0$$sroa$0$0$$sroa$0$0$$0$4353$pre$i75; //@line 4629
    while (1) {
     $66 = $$06992 + 8 | 0; //@line 4631
     $67 = HEAP32[$66 >> 2] | 0; //@line 4632
     $69 = HEAP32[$$06992 + 32 >> 2] | 0; //@line 4634
     if ($69 | 0) {
      label = 17; //@line 4637
      break;
     }
     $93 = HEAP32[$$06992 + 24 >> 2] | 0; //@line 4641
     if (($93 | 0) > -1) {
      label = 21; //@line 4644
      break;
     }
     $117 = $$06992 + 4 | 0; //@line 4648
     $118 = HEAP8[$117 >> 0] | 0; //@line 4649
     HEAP8[$117 >> 0] = (($118 + 1 & 255) << HEAP32[$14 >> 2] | 0) == 0 ? 1 : ($118 & 255) + 1 & 255; //@line 4658
     $127 = HEAP32[$$06992 + 28 >> 2] | 0; //@line 4660
     if ($127 | 0) {
      label = 25; //@line 4663
      break;
     }
     _equeue_mutex_lock($12); //@line 4666
     $150 = HEAP32[$10 >> 2] | 0; //@line 4667
     L28 : do {
      if (!$150) {
       $$02329$i$i = $10; //@line 4671
       label = 34; //@line 4672
      } else {
       $152 = HEAP32[$$06992 >> 2] | 0; //@line 4674
       $$025$i$i = $10; //@line 4675
       $154 = $150; //@line 4675
       while (1) {
        $153 = HEAP32[$154 >> 2] | 0; //@line 4677
        if ($153 >>> 0 >= $152 >>> 0) {
         break;
        }
        $156 = $154 + 8 | 0; //@line 4682
        $157 = HEAP32[$156 >> 2] | 0; //@line 4683
        if (!$157) {
         $$02329$i$i = $156; //@line 4686
         label = 34; //@line 4687
         break L28;
        } else {
         $$025$i$i = $156; //@line 4690
         $154 = $157; //@line 4690
        }
       }
       if (($153 | 0) == ($152 | 0)) {
        HEAP32[$$06992 + 12 >> 2] = $154; //@line 4696
        $$02330$i$i = $$025$i$i; //@line 4699
        $$sink$in$i$i = (HEAP32[$$025$i$i >> 2] | 0) + 8 | 0; //@line 4699
       } else {
        $$02329$i$i = $$025$i$i; //@line 4701
        label = 34; //@line 4702
       }
      }
     } while (0);
     if ((label | 0) == 34) {
      label = 0; //@line 4707
      HEAP32[$$06992 + 12 >> 2] = 0; //@line 4709
      $$02330$i$i = $$02329$i$i; //@line 4710
      $$sink$in$i$i = $$02329$i$i; //@line 4710
     }
     HEAP32[$66 >> 2] = HEAP32[$$sink$in$i$i >> 2]; //@line 4713
     HEAP32[$$02330$i$i >> 2] = $$06992; //@line 4714
     _equeue_mutex_unlock($12); //@line 4715
     if (!$67) {
      break L15;
     } else {
      $$06992 = $67; //@line 4720
     }
    }
    if ((label | 0) == 17) {
     $ReallocAsyncCtx = _emscripten_realloc_async_context(84) | 0; //@line 4725
     FUNCTION_TABLE_vi[$69 & 255]($$06992 + 36 | 0); //@line 4726
     if (___async) {
      HEAP32[$ReallocAsyncCtx >> 2] = 30; //@line 4729
      $72 = $ReallocAsyncCtx + 4 | 0; //@line 4730
      HEAP32[$72 >> 2] = $67; //@line 4731
      $73 = $ReallocAsyncCtx + 8 | 0; //@line 4732
      HEAP32[$73 >> 2] = $2; //@line 4733
      $74 = $ReallocAsyncCtx + 12 | 0; //@line 4734
      HEAP32[$74 >> 2] = $4; //@line 4735
      $75 = $ReallocAsyncCtx + 16 | 0; //@line 4736
      HEAP32[$75 >> 2] = $6; //@line 4737
      $76 = $ReallocAsyncCtx + 20 | 0; //@line 4738
      HEAP32[$76 >> 2] = $8; //@line 4739
      $77 = $ReallocAsyncCtx + 24 | 0; //@line 4740
      HEAP32[$77 >> 2] = $10; //@line 4741
      $78 = $ReallocAsyncCtx + 28 | 0; //@line 4742
      HEAP32[$78 >> 2] = $12; //@line 4743
      $79 = $ReallocAsyncCtx + 32 | 0; //@line 4744
      HEAP32[$79 >> 2] = $$06992; //@line 4745
      $80 = $ReallocAsyncCtx + 36 | 0; //@line 4746
      HEAP32[$80 >> 2] = $14; //@line 4747
      $81 = $ReallocAsyncCtx + 40 | 0; //@line 4748
      HEAP32[$81 >> 2] = $16; //@line 4749
      $82 = $ReallocAsyncCtx + 44 | 0; //@line 4750
      HEAP32[$82 >> 2] = $18; //@line 4751
      $83 = $ReallocAsyncCtx + 48 | 0; //@line 4752
      $$expand_i1_val = $20 & 1; //@line 4753
      HEAP8[$83 >> 0] = $$expand_i1_val; //@line 4754
      $84 = $ReallocAsyncCtx + 52 | 0; //@line 4755
      HEAP32[$84 >> 2] = $66; //@line 4756
      $85 = $ReallocAsyncCtx + 56 | 0; //@line 4757
      HEAP32[$85 >> 2] = $22; //@line 4758
      $86 = $ReallocAsyncCtx + 60 | 0; //@line 4759
      HEAP32[$86 >> 2] = $24; //@line 4760
      $87 = $ReallocAsyncCtx + 64 | 0; //@line 4761
      HEAP32[$87 >> 2] = $26; //@line 4762
      $88 = $ReallocAsyncCtx + 68 | 0; //@line 4763
      HEAP32[$88 >> 2] = $28; //@line 4764
      $89 = $ReallocAsyncCtx + 72 | 0; //@line 4765
      HEAP32[$89 >> 2] = $30; //@line 4766
      $90 = $ReallocAsyncCtx + 76 | 0; //@line 4767
      HEAP32[$90 >> 2] = $32; //@line 4768
      $91 = $ReallocAsyncCtx + 80 | 0; //@line 4769
      HEAP32[$91 >> 2] = $34; //@line 4770
      sp = STACKTOP; //@line 4771
      return;
     }
     ___async_unwind = 0; //@line 4774
     HEAP32[$ReallocAsyncCtx >> 2] = 30; //@line 4775
     $72 = $ReallocAsyncCtx + 4 | 0; //@line 4776
     HEAP32[$72 >> 2] = $67; //@line 4777
     $73 = $ReallocAsyncCtx + 8 | 0; //@line 4778
     HEAP32[$73 >> 2] = $2; //@line 4779
     $74 = $ReallocAsyncCtx + 12 | 0; //@line 4780
     HEAP32[$74 >> 2] = $4; //@line 4781
     $75 = $ReallocAsyncCtx + 16 | 0; //@line 4782
     HEAP32[$75 >> 2] = $6; //@line 4783
     $76 = $ReallocAsyncCtx + 20 | 0; //@line 4784
     HEAP32[$76 >> 2] = $8; //@line 4785
     $77 = $ReallocAsyncCtx + 24 | 0; //@line 4786
     HEAP32[$77 >> 2] = $10; //@line 4787
     $78 = $ReallocAsyncCtx + 28 | 0; //@line 4788
     HEAP32[$78 >> 2] = $12; //@line 4789
     $79 = $ReallocAsyncCtx + 32 | 0; //@line 4790
     HEAP32[$79 >> 2] = $$06992; //@line 4791
     $80 = $ReallocAsyncCtx + 36 | 0; //@line 4792
     HEAP32[$80 >> 2] = $14; //@line 4793
     $81 = $ReallocAsyncCtx + 40 | 0; //@line 4794
     HEAP32[$81 >> 2] = $16; //@line 4795
     $82 = $ReallocAsyncCtx + 44 | 0; //@line 4796
     HEAP32[$82 >> 2] = $18; //@line 4797
     $83 = $ReallocAsyncCtx + 48 | 0; //@line 4798
     $$expand_i1_val = $20 & 1; //@line 4799
     HEAP8[$83 >> 0] = $$expand_i1_val; //@line 4800
     $84 = $ReallocAsyncCtx + 52 | 0; //@line 4801
     HEAP32[$84 >> 2] = $66; //@line 4802
     $85 = $ReallocAsyncCtx + 56 | 0; //@line 4803
     HEAP32[$85 >> 2] = $22; //@line 4804
     $86 = $ReallocAsyncCtx + 60 | 0; //@line 4805
     HEAP32[$86 >> 2] = $24; //@line 4806
     $87 = $ReallocAsyncCtx + 64 | 0; //@line 4807
     HEAP32[$87 >> 2] = $26; //@line 4808
     $88 = $ReallocAsyncCtx + 68 | 0; //@line 4809
     HEAP32[$88 >> 2] = $28; //@line 4810
     $89 = $ReallocAsyncCtx + 72 | 0; //@line 4811
     HEAP32[$89 >> 2] = $30; //@line 4812
     $90 = $ReallocAsyncCtx + 76 | 0; //@line 4813
     HEAP32[$90 >> 2] = $32; //@line 4814
     $91 = $ReallocAsyncCtx + 80 | 0; //@line 4815
     HEAP32[$91 >> 2] = $34; //@line 4816
     sp = STACKTOP; //@line 4817
     return;
    } else if ((label | 0) == 21) {
     $95 = $$06992 + 20 | 0; //@line 4821
     HEAP32[$95 >> 2] = (HEAP32[$95 >> 2] | 0) + $93; //@line 4824
     $98 = _equeue_tick() | 0; //@line 4825
     $ReallocAsyncCtx4 = _emscripten_realloc_async_context(76) | 0; //@line 4826
     _equeue_enqueue($16, $$06992, $98) | 0; //@line 4827
     if (___async) {
      HEAP32[$ReallocAsyncCtx4 >> 2] = 31; //@line 4830
      $99 = $ReallocAsyncCtx4 + 4 | 0; //@line 4831
      HEAP32[$99 >> 2] = $67; //@line 4832
      $100 = $ReallocAsyncCtx4 + 8 | 0; //@line 4833
      HEAP32[$100 >> 2] = $2; //@line 4834
      $101 = $ReallocAsyncCtx4 + 12 | 0; //@line 4835
      HEAP32[$101 >> 2] = $4; //@line 4836
      $102 = $ReallocAsyncCtx4 + 16 | 0; //@line 4837
      HEAP32[$102 >> 2] = $6; //@line 4838
      $103 = $ReallocAsyncCtx4 + 20 | 0; //@line 4839
      HEAP32[$103 >> 2] = $8; //@line 4840
      $104 = $ReallocAsyncCtx4 + 24 | 0; //@line 4841
      HEAP32[$104 >> 2] = $10; //@line 4842
      $105 = $ReallocAsyncCtx4 + 28 | 0; //@line 4843
      HEAP32[$105 >> 2] = $12; //@line 4844
      $106 = $ReallocAsyncCtx4 + 32 | 0; //@line 4845
      HEAP32[$106 >> 2] = $14; //@line 4846
      $107 = $ReallocAsyncCtx4 + 36 | 0; //@line 4847
      HEAP32[$107 >> 2] = $16; //@line 4848
      $108 = $ReallocAsyncCtx4 + 40 | 0; //@line 4849
      HEAP32[$108 >> 2] = $18; //@line 4850
      $109 = $ReallocAsyncCtx4 + 44 | 0; //@line 4851
      $$expand_i1_val9 = $20 & 1; //@line 4852
      HEAP8[$109 >> 0] = $$expand_i1_val9; //@line 4853
      $110 = $ReallocAsyncCtx4 + 48 | 0; //@line 4854
      HEAP32[$110 >> 2] = $22; //@line 4855
      $111 = $ReallocAsyncCtx4 + 52 | 0; //@line 4856
      HEAP32[$111 >> 2] = $24; //@line 4857
      $112 = $ReallocAsyncCtx4 + 56 | 0; //@line 4858
      HEAP32[$112 >> 2] = $26; //@line 4859
      $113 = $ReallocAsyncCtx4 + 60 | 0; //@line 4860
      HEAP32[$113 >> 2] = $28; //@line 4861
      $114 = $ReallocAsyncCtx4 + 64 | 0; //@line 4862
      HEAP32[$114 >> 2] = $30; //@line 4863
      $115 = $ReallocAsyncCtx4 + 68 | 0; //@line 4864
      HEAP32[$115 >> 2] = $32; //@line 4865
      $116 = $ReallocAsyncCtx4 + 72 | 0; //@line 4866
      HEAP32[$116 >> 2] = $34; //@line 4867
      sp = STACKTOP; //@line 4868
      return;
     }
     ___async_unwind = 0; //@line 4871
     HEAP32[$ReallocAsyncCtx4 >> 2] = 31; //@line 4872
     $99 = $ReallocAsyncCtx4 + 4 | 0; //@line 4873
     HEAP32[$99 >> 2] = $67; //@line 4874
     $100 = $ReallocAsyncCtx4 + 8 | 0; //@line 4875
     HEAP32[$100 >> 2] = $2; //@line 4876
     $101 = $ReallocAsyncCtx4 + 12 | 0; //@line 4877
     HEAP32[$101 >> 2] = $4; //@line 4878
     $102 = $ReallocAsyncCtx4 + 16 | 0; //@line 4879
     HEAP32[$102 >> 2] = $6; //@line 4880
     $103 = $ReallocAsyncCtx4 + 20 | 0; //@line 4881
     HEAP32[$103 >> 2] = $8; //@line 4882
     $104 = $ReallocAsyncCtx4 + 24 | 0; //@line 4883
     HEAP32[$104 >> 2] = $10; //@line 4884
     $105 = $ReallocAsyncCtx4 + 28 | 0; //@line 4885
     HEAP32[$105 >> 2] = $12; //@line 4886
     $106 = $ReallocAsyncCtx4 + 32 | 0; //@line 4887
     HEAP32[$106 >> 2] = $14; //@line 4888
     $107 = $ReallocAsyncCtx4 + 36 | 0; //@line 4889
     HEAP32[$107 >> 2] = $16; //@line 4890
     $108 = $ReallocAsyncCtx4 + 40 | 0; //@line 4891
     HEAP32[$108 >> 2] = $18; //@line 4892
     $109 = $ReallocAsyncCtx4 + 44 | 0; //@line 4893
     $$expand_i1_val9 = $20 & 1; //@line 4894
     HEAP8[$109 >> 0] = $$expand_i1_val9; //@line 4895
     $110 = $ReallocAsyncCtx4 + 48 | 0; //@line 4896
     HEAP32[$110 >> 2] = $22; //@line 4897
     $111 = $ReallocAsyncCtx4 + 52 | 0; //@line 4898
     HEAP32[$111 >> 2] = $24; //@line 4899
     $112 = $ReallocAsyncCtx4 + 56 | 0; //@line 4900
     HEAP32[$112 >> 2] = $26; //@line 4901
     $113 = $ReallocAsyncCtx4 + 60 | 0; //@line 4902
     HEAP32[$113 >> 2] = $28; //@line 4903
     $114 = $ReallocAsyncCtx4 + 64 | 0; //@line 4904
     HEAP32[$114 >> 2] = $30; //@line 4905
     $115 = $ReallocAsyncCtx4 + 68 | 0; //@line 4906
     HEAP32[$115 >> 2] = $32; //@line 4907
     $116 = $ReallocAsyncCtx4 + 72 | 0; //@line 4908
     HEAP32[$116 >> 2] = $34; //@line 4909
     sp = STACKTOP; //@line 4910
     return;
    } else if ((label | 0) == 25) {
     $ReallocAsyncCtx2 = _emscripten_realloc_async_context(84) | 0; //@line 4915
     FUNCTION_TABLE_vi[$127 & 255]($$06992 + 36 | 0); //@line 4916
     if (___async) {
      HEAP32[$ReallocAsyncCtx2 >> 2] = 32; //@line 4919
      $130 = $ReallocAsyncCtx2 + 4 | 0; //@line 4920
      HEAP32[$130 >> 2] = $67; //@line 4921
      $131 = $ReallocAsyncCtx2 + 8 | 0; //@line 4922
      HEAP32[$131 >> 2] = $2; //@line 4923
      $132 = $ReallocAsyncCtx2 + 12 | 0; //@line 4924
      HEAP32[$132 >> 2] = $4; //@line 4925
      $133 = $ReallocAsyncCtx2 + 16 | 0; //@line 4926
      HEAP32[$133 >> 2] = $6; //@line 4927
      $134 = $ReallocAsyncCtx2 + 20 | 0; //@line 4928
      HEAP32[$134 >> 2] = $8; //@line 4929
      $135 = $ReallocAsyncCtx2 + 24 | 0; //@line 4930
      HEAP32[$135 >> 2] = $10; //@line 4931
      $136 = $ReallocAsyncCtx2 + 28 | 0; //@line 4932
      HEAP32[$136 >> 2] = $12; //@line 4933
      $137 = $ReallocAsyncCtx2 + 32 | 0; //@line 4934
      HEAP32[$137 >> 2] = $14; //@line 4935
      $138 = $ReallocAsyncCtx2 + 36 | 0; //@line 4936
      HEAP32[$138 >> 2] = $16; //@line 4937
      $139 = $ReallocAsyncCtx2 + 40 | 0; //@line 4938
      HEAP32[$139 >> 2] = $18; //@line 4939
      $140 = $ReallocAsyncCtx2 + 44 | 0; //@line 4940
      $$expand_i1_val11 = $20 & 1; //@line 4941
      HEAP8[$140 >> 0] = $$expand_i1_val11; //@line 4942
      $141 = $ReallocAsyncCtx2 + 48 | 0; //@line 4943
      HEAP32[$141 >> 2] = $22; //@line 4944
      $142 = $ReallocAsyncCtx2 + 52 | 0; //@line 4945
      HEAP32[$142 >> 2] = $24; //@line 4946
      $143 = $ReallocAsyncCtx2 + 56 | 0; //@line 4947
      HEAP32[$143 >> 2] = $26; //@line 4948
      $144 = $ReallocAsyncCtx2 + 60 | 0; //@line 4949
      HEAP32[$144 >> 2] = $28; //@line 4950
      $145 = $ReallocAsyncCtx2 + 64 | 0; //@line 4951
      HEAP32[$145 >> 2] = $30; //@line 4952
      $146 = $ReallocAsyncCtx2 + 68 | 0; //@line 4953
      HEAP32[$146 >> 2] = $32; //@line 4954
      $147 = $ReallocAsyncCtx2 + 72 | 0; //@line 4955
      HEAP32[$147 >> 2] = $34; //@line 4956
      $148 = $ReallocAsyncCtx2 + 76 | 0; //@line 4957
      HEAP32[$148 >> 2] = $$06992; //@line 4958
      $149 = $ReallocAsyncCtx2 + 80 | 0; //@line 4959
      HEAP32[$149 >> 2] = $66; //@line 4960
      sp = STACKTOP; //@line 4961
      return;
     }
     ___async_unwind = 0; //@line 4964
     HEAP32[$ReallocAsyncCtx2 >> 2] = 32; //@line 4965
     $130 = $ReallocAsyncCtx2 + 4 | 0; //@line 4966
     HEAP32[$130 >> 2] = $67; //@line 4967
     $131 = $ReallocAsyncCtx2 + 8 | 0; //@line 4968
     HEAP32[$131 >> 2] = $2; //@line 4969
     $132 = $ReallocAsyncCtx2 + 12 | 0; //@line 4970
     HEAP32[$132 >> 2] = $4; //@line 4971
     $133 = $ReallocAsyncCtx2 + 16 | 0; //@line 4972
     HEAP32[$133 >> 2] = $6; //@line 4973
     $134 = $ReallocAsyncCtx2 + 20 | 0; //@line 4974
     HEAP32[$134 >> 2] = $8; //@line 4975
     $135 = $ReallocAsyncCtx2 + 24 | 0; //@line 4976
     HEAP32[$135 >> 2] = $10; //@line 4977
     $136 = $ReallocAsyncCtx2 + 28 | 0; //@line 4978
     HEAP32[$136 >> 2] = $12; //@line 4979
     $137 = $ReallocAsyncCtx2 + 32 | 0; //@line 4980
     HEAP32[$137 >> 2] = $14; //@line 4981
     $138 = $ReallocAsyncCtx2 + 36 | 0; //@line 4982
     HEAP32[$138 >> 2] = $16; //@line 4983
     $139 = $ReallocAsyncCtx2 + 40 | 0; //@line 4984
     HEAP32[$139 >> 2] = $18; //@line 4985
     $140 = $ReallocAsyncCtx2 + 44 | 0; //@line 4986
     $$expand_i1_val11 = $20 & 1; //@line 4987
     HEAP8[$140 >> 0] = $$expand_i1_val11; //@line 4988
     $141 = $ReallocAsyncCtx2 + 48 | 0; //@line 4989
     HEAP32[$141 >> 2] = $22; //@line 4990
     $142 = $ReallocAsyncCtx2 + 52 | 0; //@line 4991
     HEAP32[$142 >> 2] = $24; //@line 4992
     $143 = $ReallocAsyncCtx2 + 56 | 0; //@line 4993
     HEAP32[$143 >> 2] = $26; //@line 4994
     $144 = $ReallocAsyncCtx2 + 60 | 0; //@line 4995
     HEAP32[$144 >> 2] = $28; //@line 4996
     $145 = $ReallocAsyncCtx2 + 64 | 0; //@line 4997
     HEAP32[$145 >> 2] = $30; //@line 4998
     $146 = $ReallocAsyncCtx2 + 68 | 0; //@line 4999
     HEAP32[$146 >> 2] = $32; //@line 5000
     $147 = $ReallocAsyncCtx2 + 72 | 0; //@line 5001
     HEAP32[$147 >> 2] = $34; //@line 5002
     $148 = $ReallocAsyncCtx2 + 76 | 0; //@line 5003
     HEAP32[$148 >> 2] = $$06992; //@line 5004
     $149 = $ReallocAsyncCtx2 + 80 | 0; //@line 5005
     HEAP32[$149 >> 2] = $66; //@line 5006
     sp = STACKTOP; //@line 5007
     return;
    }
   }
  }
 } while (0);
 $165 = _equeue_tick() | 0; //@line 5013
 if ($20) {
  $166 = $18 - $165 | 0; //@line 5015
  if (($166 | 0) < 1) {
   $168 = $16 + 40 | 0; //@line 5018
   if (HEAP32[$168 >> 2] | 0) {
    _equeue_mutex_lock($6); //@line 5022
    $171 = HEAP32[$168 >> 2] | 0; //@line 5023
    if ($171 | 0) {
     $173 = HEAP32[$24 >> 2] | 0; //@line 5026
     if ($173 | 0) {
      $176 = HEAP32[$16 + 44 >> 2] | 0; //@line 5030
      $179 = (HEAP32[$173 + 20 >> 2] | 0) - $165 | 0; //@line 5033
      $ReallocAsyncCtx3 = _emscripten_realloc_async_context(16) | 0; //@line 5037
      FUNCTION_TABLE_vii[$171 & 3]($176, $179 & ~($179 >> 31)); //@line 5038
      if (___async) {
       HEAP32[$ReallocAsyncCtx3 >> 2] = 33; //@line 5041
       $183 = $ReallocAsyncCtx3 + 4 | 0; //@line 5042
       HEAP32[$183 >> 2] = $30; //@line 5043
       $184 = $ReallocAsyncCtx3 + 8 | 0; //@line 5044
       HEAP32[$184 >> 2] = $6; //@line 5045
       $185 = $ReallocAsyncCtx3 + 12 | 0; //@line 5046
       HEAP32[$185 >> 2] = $8; //@line 5047
       sp = STACKTOP; //@line 5048
       return;
      }
      ___async_unwind = 0; //@line 5051
      HEAP32[$ReallocAsyncCtx3 >> 2] = 33; //@line 5052
      $183 = $ReallocAsyncCtx3 + 4 | 0; //@line 5053
      HEAP32[$183 >> 2] = $30; //@line 5054
      $184 = $ReallocAsyncCtx3 + 8 | 0; //@line 5055
      HEAP32[$184 >> 2] = $6; //@line 5056
      $185 = $ReallocAsyncCtx3 + 12 | 0; //@line 5057
      HEAP32[$185 >> 2] = $8; //@line 5058
      sp = STACKTOP; //@line 5059
      return;
     }
    }
    HEAP8[$30 >> 0] = 1; //@line 5063
    _equeue_mutex_unlock($6); //@line 5064
   }
   HEAP8[$8 >> 0] = 0; //@line 5066
   return;
  } else {
   $$067 = $166; //@line 5069
  }
 } else {
  $$067 = -1; //@line 5072
 }
 _equeue_mutex_lock($6); //@line 5074
 $186 = HEAP32[$24 >> 2] | 0; //@line 5075
 if (!$186) {
  $$2 = $$067; //@line 5078
 } else {
  $190 = (HEAP32[$186 + 20 >> 2] | 0) - $165 | 0; //@line 5082
  $193 = $190 & ~($190 >> 31); //@line 5085
  $$2 = $193 >>> 0 < $$067 >>> 0 ? $193 : $$067; //@line 5088
 }
 _equeue_mutex_unlock($6); //@line 5090
 _equeue_sema_wait($22, $$2) | 0; //@line 5091
 do {
  if (HEAP8[$8 >> 0] | 0) {
   _equeue_mutex_lock($6); //@line 5096
   if (!(HEAP8[$8 >> 0] | 0)) {
    _equeue_mutex_unlock($6); //@line 5100
    break;
   }
   HEAP8[$8 >> 0] = 0; //@line 5103
   _equeue_mutex_unlock($6); //@line 5104
   return;
  }
 } while (0);
 $199 = _equeue_tick() | 0; //@line 5108
 $ReallocAsyncCtx5 = _emscripten_realloc_async_context(76) | 0; //@line 5109
 _wait_ms(20); //@line 5110
 if (___async) {
  HEAP32[$ReallocAsyncCtx5 >> 2] = 34; //@line 5113
  $200 = $ReallocAsyncCtx5 + 4 | 0; //@line 5114
  HEAP32[$200 >> 2] = $2; //@line 5115
  $201 = $ReallocAsyncCtx5 + 8 | 0; //@line 5116
  HEAP32[$201 >> 2] = $4; //@line 5117
  $202 = $ReallocAsyncCtx5 + 12 | 0; //@line 5118
  HEAP32[$202 >> 2] = $6; //@line 5119
  $203 = $ReallocAsyncCtx5 + 16 | 0; //@line 5120
  HEAP32[$203 >> 2] = $8; //@line 5121
  $204 = $ReallocAsyncCtx5 + 20 | 0; //@line 5122
  HEAP32[$204 >> 2] = $10; //@line 5123
  $205 = $ReallocAsyncCtx5 + 24 | 0; //@line 5124
  HEAP32[$205 >> 2] = $12; //@line 5125
  $206 = $ReallocAsyncCtx5 + 28 | 0; //@line 5126
  HEAP32[$206 >> 2] = $14; //@line 5127
  $207 = $ReallocAsyncCtx5 + 32 | 0; //@line 5128
  HEAP32[$207 >> 2] = $16; //@line 5129
  $208 = $ReallocAsyncCtx5 + 36 | 0; //@line 5130
  HEAP32[$208 >> 2] = $18; //@line 5131
  $209 = $ReallocAsyncCtx5 + 40 | 0; //@line 5132
  $$expand_i1_val13 = $20 & 1; //@line 5133
  HEAP8[$209 >> 0] = $$expand_i1_val13; //@line 5134
  $210 = $ReallocAsyncCtx5 + 44 | 0; //@line 5135
  HEAP32[$210 >> 2] = $22; //@line 5136
  $211 = $ReallocAsyncCtx5 + 48 | 0; //@line 5137
  HEAP32[$211 >> 2] = $24; //@line 5138
  $212 = $ReallocAsyncCtx5 + 52 | 0; //@line 5139
  HEAP32[$212 >> 2] = $26; //@line 5140
  $213 = $ReallocAsyncCtx5 + 56 | 0; //@line 5141
  HEAP32[$213 >> 2] = $28; //@line 5142
  $214 = $ReallocAsyncCtx5 + 60 | 0; //@line 5143
  HEAP32[$214 >> 2] = $30; //@line 5144
  $215 = $ReallocAsyncCtx5 + 64 | 0; //@line 5145
  HEAP32[$215 >> 2] = $32; //@line 5146
  $216 = $ReallocAsyncCtx5 + 68 | 0; //@line 5147
  HEAP32[$216 >> 2] = $34; //@line 5148
  $217 = $ReallocAsyncCtx5 + 72 | 0; //@line 5149
  HEAP32[$217 >> 2] = $199; //@line 5150
  sp = STACKTOP; //@line 5151
  return;
 }
 ___async_unwind = 0; //@line 5154
 HEAP32[$ReallocAsyncCtx5 >> 2] = 34; //@line 5155
 $200 = $ReallocAsyncCtx5 + 4 | 0; //@line 5156
 HEAP32[$200 >> 2] = $2; //@line 5157
 $201 = $ReallocAsyncCtx5 + 8 | 0; //@line 5158
 HEAP32[$201 >> 2] = $4; //@line 5159
 $202 = $ReallocAsyncCtx5 + 12 | 0; //@line 5160
 HEAP32[$202 >> 2] = $6; //@line 5161
 $203 = $ReallocAsyncCtx5 + 16 | 0; //@line 5162
 HEAP32[$203 >> 2] = $8; //@line 5163
 $204 = $ReallocAsyncCtx5 + 20 | 0; //@line 5164
 HEAP32[$204 >> 2] = $10; //@line 5165
 $205 = $ReallocAsyncCtx5 + 24 | 0; //@line 5166
 HEAP32[$205 >> 2] = $12; //@line 5167
 $206 = $ReallocAsyncCtx5 + 28 | 0; //@line 5168
 HEAP32[$206 >> 2] = $14; //@line 5169
 $207 = $ReallocAsyncCtx5 + 32 | 0; //@line 5170
 HEAP32[$207 >> 2] = $16; //@line 5171
 $208 = $ReallocAsyncCtx5 + 36 | 0; //@line 5172
 HEAP32[$208 >> 2] = $18; //@line 5173
 $209 = $ReallocAsyncCtx5 + 40 | 0; //@line 5174
 $$expand_i1_val13 = $20 & 1; //@line 5175
 HEAP8[$209 >> 0] = $$expand_i1_val13; //@line 5176
 $210 = $ReallocAsyncCtx5 + 44 | 0; //@line 5177
 HEAP32[$210 >> 2] = $22; //@line 5178
 $211 = $ReallocAsyncCtx5 + 48 | 0; //@line 5179
 HEAP32[$211 >> 2] = $24; //@line 5180
 $212 = $ReallocAsyncCtx5 + 52 | 0; //@line 5181
 HEAP32[$212 >> 2] = $26; //@line 5182
 $213 = $ReallocAsyncCtx5 + 56 | 0; //@line 5183
 HEAP32[$213 >> 2] = $28; //@line 5184
 $214 = $ReallocAsyncCtx5 + 60 | 0; //@line 5185
 HEAP32[$214 >> 2] = $30; //@line 5186
 $215 = $ReallocAsyncCtx5 + 64 | 0; //@line 5187
 HEAP32[$215 >> 2] = $32; //@line 5188
 $216 = $ReallocAsyncCtx5 + 68 | 0; //@line 5189
 HEAP32[$216 >> 2] = $34; //@line 5190
 $217 = $ReallocAsyncCtx5 + 72 | 0; //@line 5191
 HEAP32[$217 >> 2] = $199; //@line 5192
 sp = STACKTOP; //@line 5193
 return;
}
function _fmt_fp($0, $1, $2, $3, $4, $5) {
 $0 = $0 | 0;
 $1 = +$1;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 $5 = $5 | 0;
 var $$$3484 = 0, $$$3484700 = 0, $$$4502 = 0, $$$564 = 0.0, $$0 = 0, $$0463$lcssa = 0, $$0463587 = 0, $$0464597 = 0, $$0471 = 0.0, $$0479 = 0, $$0487644 = 0, $$0488655 = 0, $$0488657 = 0, $$0496$$9 = 0, $$0497656 = 0, $$0498 = 0, $$0509585 = 0.0, $$0511 = 0, $$0514639 = 0, $$0520 = 0, $$0521 = 0, $$0521$ = 0, $$0523 = 0, $$0527$in633 = 0, $$0530638 = 0, $$1465 = 0, $$1467 = 0.0, $$1469 = 0.0, $$1472 = 0.0, $$1480 = 0, $$1482$lcssa = 0, $$1482663 = 0, $$1489643 = 0, $$1499$lcssa = 0, $$1499662 = 0, $$1508586 = 0, $$1512$lcssa = 0, $$1512610 = 0, $$1515 = 0, $$1524 = 0, $$1528617 = 0, $$1531$lcssa = 0, $$1531632 = 0, $$1601 = 0, $$2 = 0, $$2473 = 0.0, $$2476 = 0, $$2483$ph = 0, $$2500 = 0, $$2513 = 0, $$2516621 = 0, $$2529 = 0, $$2532620 = 0, $$3 = 0.0, $$3477 = 0, $$3484$lcssa = 0, $$3484650 = 0, $$3501$lcssa = 0, $$3501649 = 0, $$3533616 = 0, $$4 = 0.0, $$4478$lcssa = 0, $$4478593 = 0, $$4492 = 0, $$4502 = 0, $$4518 = 0, $$5$lcssa = 0, $$540 = 0, $$540$ = 0, $$543 = 0.0, $$548 = 0, $$5486$lcssa = 0, $$5486626 = 0, $$5493600 = 0, $$550 = 0, $$5519$ph = 0, $$5605 = 0, $$561 = 0, $$6 = 0, $$6494592 = 0, $$7495604 = 0, $$7505 = 0, $$7505$ = 0, $$7505$ph = 0, $$8 = 0, $$9$ph = 0, $$lcssa675 = 0, $$pn = 0, $$pr = 0, $$pr566 = 0, $$pre$phi691Z2D = 0, $$pre$phi698Z2D = 0, $$pre693 = 0, $$sink = 0, $$sink547$lcssa = 0, $$sink547625 = 0, $$sink560 = 0, $10 = 0, $101 = 0, $104 = 0, $106 = 0, $11 = 0, $113 = 0, $116 = 0, $124 = 0, $125 = 0, $128 = 0, $130 = 0, $131 = 0, $132 = 0, $138 = 0, $140 = 0, $144 = 0, $149 = 0, $150 = 0, $151 = 0, $152 = 0, $154 = 0, $160 = 0, $161 = 0, $162 = 0, $174 = 0, $185 = 0, $189 = 0, $190 = 0, $193 = 0, $198 = 0, $199 = 0, $201 = 0, $209 = 0, $212 = 0, $213 = 0, $215 = 0, $217 = 0, $218 = 0, $221 = 0, $225 = 0, $230 = 0, $233 = 0, $236 = 0, $238 = 0, $240 = 0, $242 = 0, $247 = 0, $248 = 0, $251 = 0, $253 = 0, $256 = 0, $259 = 0, $267 = 0, $27 = 0, $270 = 0, $275 = 0, $284 = 0, $285 = 0, $289 = 0, $292 = 0, $294 = 0, $296 = 0, $300 = 0, $303 = 0, $304 = 0, $308 = 0, $31 = 0, $318 = 0, $323 = 0, $326 = 0, $327 = 0, $328 = 0, $330 = 0, $335 = 0, $347 = 0, $35 = 0.0, $351 = 0, $356 = 0, $36 = 0, $363 = 0, $364 = 0, $365 = 0, $366 = 0, $367 = 0, $369 = 0, $373 = 0, $375 = 0, $378 = 0, $381 = 0, $39 = 0, $41 = 0, $44 = 0, $46 = 0, $6 = 0, $60 = 0, $63 = 0, $66 = 0, $68 = 0, $7 = 0, $76 = 0, $77 = 0, $79 = 0, $8 = 0, $80 = 0, $86 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 10377
 STACKTOP = STACKTOP + 560 | 0; //@line 10378
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(560); //@line 10378
 $6 = sp + 8 | 0; //@line 10379
 $7 = sp; //@line 10380
 $8 = sp + 524 | 0; //@line 10381
 $9 = $8; //@line 10382
 $10 = sp + 512 | 0; //@line 10383
 HEAP32[$7 >> 2] = 0; //@line 10384
 $11 = $10 + 12 | 0; //@line 10385
 ___DOUBLE_BITS_677($1) | 0; //@line 10386
 if ((tempRet0 | 0) < 0) {
  $$0471 = -$1; //@line 10391
  $$0520 = 1; //@line 10391
  $$0521 = 3253; //@line 10391
 } else {
  $$0471 = $1; //@line 10402
  $$0520 = ($4 & 2049 | 0) != 0 & 1; //@line 10402
  $$0521 = ($4 & 2048 | 0) == 0 ? ($4 & 1 | 0) == 0 ? 3254 : 3259 : 3256; //@line 10402
 }
 ___DOUBLE_BITS_677($$0471) | 0; //@line 10404
 do {
  if (0 == 0 & (tempRet0 & 2146435072 | 0) == 2146435072) {
   $27 = ($5 & 32 | 0) != 0; //@line 10413
   $31 = $$0520 + 3 | 0; //@line 10418
   _pad_676($0, 32, $2, $31, $4 & -65537); //@line 10420
   _out_670($0, $$0521, $$0520); //@line 10421
   _out_670($0, $$0471 != $$0471 | 0.0 != 0.0 ? $27 ? 3280 : 3284 : $27 ? 3272 : 3276, 3); //@line 10422
   _pad_676($0, 32, $2, $31, $4 ^ 8192); //@line 10424
   $$sink560 = $31; //@line 10425
  } else {
   $35 = +_frexpl($$0471, $7) * 2.0; //@line 10428
   $36 = $35 != 0.0; //@line 10429
   if ($36) {
    HEAP32[$7 >> 2] = (HEAP32[$7 >> 2] | 0) + -1; //@line 10433
   }
   $39 = $5 | 32; //@line 10435
   if (($39 | 0) == 97) {
    $41 = $5 & 32; //@line 10438
    $$0521$ = ($41 | 0) == 0 ? $$0521 : $$0521 + 9 | 0; //@line 10441
    $44 = $$0520 | 2; //@line 10442
    $46 = 12 - $3 | 0; //@line 10444
    do {
     if ($3 >>> 0 > 11 | ($46 | 0) == 0) {
      $$1472 = $35; //@line 10449
     } else {
      $$0509585 = 8.0; //@line 10451
      $$1508586 = $46; //@line 10451
      do {
       $$1508586 = $$1508586 + -1 | 0; //@line 10453
       $$0509585 = $$0509585 * 16.0; //@line 10454
      } while (($$1508586 | 0) != 0);
      if ((HEAP8[$$0521$ >> 0] | 0) == 45) {
       $$1472 = -($$0509585 + (-$35 - $$0509585)); //@line 10469
       break;
      } else {
       $$1472 = $35 + $$0509585 - $$0509585; //@line 10474
       break;
      }
     }
    } while (0);
    $60 = HEAP32[$7 >> 2] | 0; //@line 10479
    $63 = ($60 | 0) < 0 ? 0 - $60 | 0 : $60; //@line 10482
    $66 = _fmt_u($63, (($63 | 0) < 0) << 31 >> 31, $11) | 0; //@line 10485
    if (($66 | 0) == ($11 | 0)) {
     $68 = $10 + 11 | 0; //@line 10488
     HEAP8[$68 >> 0] = 48; //@line 10489
     $$0511 = $68; //@line 10490
    } else {
     $$0511 = $66; //@line 10492
    }
    HEAP8[$$0511 + -1 >> 0] = ($60 >> 31 & 2) + 43; //@line 10499
    $76 = $$0511 + -2 | 0; //@line 10502
    HEAP8[$76 >> 0] = $5 + 15; //@line 10503
    $77 = ($3 | 0) < 1; //@line 10504
    $79 = ($4 & 8 | 0) == 0; //@line 10506
    $$0523 = $8; //@line 10507
    $$2473 = $$1472; //@line 10507
    while (1) {
     $80 = ~~$$2473; //@line 10509
     $86 = $$0523 + 1 | 0; //@line 10515
     HEAP8[$$0523 >> 0] = $41 | HEAPU8[3288 + $80 >> 0]; //@line 10516
     $$2473 = ($$2473 - +($80 | 0)) * 16.0; //@line 10519
     if (($86 - $9 | 0) == 1) {
      if ($79 & ($77 & $$2473 == 0.0)) {
       $$1524 = $86; //@line 10528
      } else {
       HEAP8[$86 >> 0] = 46; //@line 10531
       $$1524 = $$0523 + 2 | 0; //@line 10532
      }
     } else {
      $$1524 = $86; //@line 10535
     }
     if (!($$2473 != 0.0)) {
      break;
     } else {
      $$0523 = $$1524; //@line 10539
     }
    }
    $$pre693 = $$1524; //@line 10545
    if (!$3) {
     label = 24; //@line 10547
    } else {
     if ((-2 - $9 + $$pre693 | 0) < ($3 | 0)) {
      $$pre$phi691Z2D = $$pre693 - $9 | 0; //@line 10555
      $$sink = $3 + 2 | 0; //@line 10555
     } else {
      label = 24; //@line 10557
     }
    }
    if ((label | 0) == 24) {
     $101 = $$pre693 - $9 | 0; //@line 10561
     $$pre$phi691Z2D = $101; //@line 10562
     $$sink = $101; //@line 10562
    }
    $104 = $11 - $76 | 0; //@line 10566
    $106 = $104 + $44 + $$sink | 0; //@line 10568
    _pad_676($0, 32, $2, $106, $4); //@line 10569
    _out_670($0, $$0521$, $44); //@line 10570
    _pad_676($0, 48, $2, $106, $4 ^ 65536); //@line 10572
    _out_670($0, $8, $$pre$phi691Z2D); //@line 10573
    _pad_676($0, 48, $$sink - $$pre$phi691Z2D | 0, 0, 0); //@line 10575
    _out_670($0, $76, $104); //@line 10576
    _pad_676($0, 32, $2, $106, $4 ^ 8192); //@line 10578
    $$sink560 = $106; //@line 10579
    break;
   }
   $$540 = ($3 | 0) < 0 ? 6 : $3; //@line 10583
   if ($36) {
    $113 = (HEAP32[$7 >> 2] | 0) + -28 | 0; //@line 10587
    HEAP32[$7 >> 2] = $113; //@line 10588
    $$3 = $35 * 268435456.0; //@line 10589
    $$pr = $113; //@line 10589
   } else {
    $$3 = $35; //@line 10592
    $$pr = HEAP32[$7 >> 2] | 0; //@line 10592
   }
   $$561 = ($$pr | 0) < 0 ? $6 : $6 + 288 | 0; //@line 10596
   $$0498 = $$561; //@line 10597
   $$4 = $$3; //@line 10597
   do {
    $116 = ~~$$4 >>> 0; //@line 10599
    HEAP32[$$0498 >> 2] = $116; //@line 10600
    $$0498 = $$0498 + 4 | 0; //@line 10601
    $$4 = ($$4 - +($116 >>> 0)) * 1.0e9; //@line 10604
   } while ($$4 != 0.0);
   if (($$pr | 0) > 0) {
    $$1482663 = $$561; //@line 10614
    $$1499662 = $$0498; //@line 10614
    $124 = $$pr; //@line 10614
    while (1) {
     $125 = ($124 | 0) < 29 ? $124 : 29; //@line 10617
     $$0488655 = $$1499662 + -4 | 0; //@line 10618
     if ($$0488655 >>> 0 < $$1482663 >>> 0) {
      $$2483$ph = $$1482663; //@line 10621
     } else {
      $$0488657 = $$0488655; //@line 10623
      $$0497656 = 0; //@line 10623
      do {
       $128 = _bitshift64Shl(HEAP32[$$0488657 >> 2] | 0, 0, $125 | 0) | 0; //@line 10626
       $130 = _i64Add($128 | 0, tempRet0 | 0, $$0497656 | 0, 0) | 0; //@line 10628
       $131 = tempRet0; //@line 10629
       $132 = ___uremdi3($130 | 0, $131 | 0, 1e9, 0) | 0; //@line 10630
       HEAP32[$$0488657 >> 2] = $132; //@line 10632
       $$0497656 = ___udivdi3($130 | 0, $131 | 0, 1e9, 0) | 0; //@line 10633
       $$0488657 = $$0488657 + -4 | 0; //@line 10635
      } while ($$0488657 >>> 0 >= $$1482663 >>> 0);
      if (!$$0497656) {
       $$2483$ph = $$1482663; //@line 10645
      } else {
       $138 = $$1482663 + -4 | 0; //@line 10647
       HEAP32[$138 >> 2] = $$0497656; //@line 10648
       $$2483$ph = $138; //@line 10649
      }
     }
     $$2500 = $$1499662; //@line 10652
     while (1) {
      if ($$2500 >>> 0 <= $$2483$ph >>> 0) {
       break;
      }
      $140 = $$2500 + -4 | 0; //@line 10658
      if (!(HEAP32[$140 >> 2] | 0)) {
       $$2500 = $140; //@line 10662
      } else {
       break;
      }
     }
     $144 = (HEAP32[$7 >> 2] | 0) - $125 | 0; //@line 10668
     HEAP32[$7 >> 2] = $144; //@line 10669
     if (($144 | 0) > 0) {
      $$1482663 = $$2483$ph; //@line 10672
      $$1499662 = $$2500; //@line 10672
      $124 = $144; //@line 10672
     } else {
      $$1482$lcssa = $$2483$ph; //@line 10674
      $$1499$lcssa = $$2500; //@line 10674
      $$pr566 = $144; //@line 10674
      break;
     }
    }
   } else {
    $$1482$lcssa = $$561; //@line 10679
    $$1499$lcssa = $$0498; //@line 10679
    $$pr566 = $$pr; //@line 10679
   }
   if (($$pr566 | 0) < 0) {
    $149 = (($$540 + 25 | 0) / 9 | 0) + 1 | 0; //@line 10685
    $150 = ($39 | 0) == 102; //@line 10686
    $$3484650 = $$1482$lcssa; //@line 10687
    $$3501649 = $$1499$lcssa; //@line 10687
    $152 = $$pr566; //@line 10687
    while (1) {
     $151 = 0 - $152 | 0; //@line 10689
     $154 = ($151 | 0) < 9 ? $151 : 9; //@line 10691
     if ($$3484650 >>> 0 < $$3501649 >>> 0) {
      $160 = (1 << $154) + -1 | 0; //@line 10695
      $161 = 1e9 >>> $154; //@line 10696
      $$0487644 = 0; //@line 10697
      $$1489643 = $$3484650; //@line 10697
      do {
       $162 = HEAP32[$$1489643 >> 2] | 0; //@line 10699
       HEAP32[$$1489643 >> 2] = ($162 >>> $154) + $$0487644; //@line 10703
       $$0487644 = Math_imul($162 & $160, $161) | 0; //@line 10704
       $$1489643 = $$1489643 + 4 | 0; //@line 10705
      } while ($$1489643 >>> 0 < $$3501649 >>> 0);
      $$$3484 = (HEAP32[$$3484650 >> 2] | 0) == 0 ? $$3484650 + 4 | 0 : $$3484650; //@line 10716
      if (!$$0487644) {
       $$$3484700 = $$$3484; //@line 10719
       $$4502 = $$3501649; //@line 10719
      } else {
       HEAP32[$$3501649 >> 2] = $$0487644; //@line 10722
       $$$3484700 = $$$3484; //@line 10723
       $$4502 = $$3501649 + 4 | 0; //@line 10723
      }
     } else {
      $$$3484700 = (HEAP32[$$3484650 >> 2] | 0) == 0 ? $$3484650 + 4 | 0 : $$3484650; //@line 10730
      $$4502 = $$3501649; //@line 10730
     }
     $174 = $150 ? $$561 : $$$3484700; //@line 10732
     $$$4502 = ($$4502 - $174 >> 2 | 0) > ($149 | 0) ? $174 + ($149 << 2) | 0 : $$4502; //@line 10739
     $152 = (HEAP32[$7 >> 2] | 0) + $154 | 0; //@line 10741
     HEAP32[$7 >> 2] = $152; //@line 10742
     if (($152 | 0) >= 0) {
      $$3484$lcssa = $$$3484700; //@line 10747
      $$3501$lcssa = $$$4502; //@line 10747
      break;
     } else {
      $$3484650 = $$$3484700; //@line 10745
      $$3501649 = $$$4502; //@line 10745
     }
    }
   } else {
    $$3484$lcssa = $$1482$lcssa; //@line 10752
    $$3501$lcssa = $$1499$lcssa; //@line 10752
   }
   $185 = $$561; //@line 10755
   if ($$3484$lcssa >>> 0 < $$3501$lcssa >>> 0) {
    $189 = ($185 - $$3484$lcssa >> 2) * 9 | 0; //@line 10760
    $190 = HEAP32[$$3484$lcssa >> 2] | 0; //@line 10761
    if ($190 >>> 0 < 10) {
     $$1515 = $189; //@line 10764
    } else {
     $$0514639 = $189; //@line 10766
     $$0530638 = 10; //@line 10766
     while (1) {
      $$0530638 = $$0530638 * 10 | 0; //@line 10768
      $193 = $$0514639 + 1 | 0; //@line 10769
      if ($190 >>> 0 < $$0530638 >>> 0) {
       $$1515 = $193; //@line 10772
       break;
      } else {
       $$0514639 = $193; //@line 10775
      }
     }
    }
   } else {
    $$1515 = 0; //@line 10780
   }
   $198 = ($39 | 0) == 103; //@line 10785
   $199 = ($$540 | 0) != 0; //@line 10786
   $201 = $$540 - (($39 | 0) != 102 ? $$1515 : 0) + (($199 & $198) << 31 >> 31) | 0; //@line 10789
   if (($201 | 0) < ((($$3501$lcssa - $185 >> 2) * 9 | 0) + -9 | 0)) {
    $209 = $201 + 9216 | 0; //@line 10798
    $212 = $$561 + 4 + ((($209 | 0) / 9 | 0) + -1024 << 2) | 0; //@line 10801
    $213 = ($209 | 0) % 9 | 0; //@line 10802
    if (($213 | 0) < 8) {
     $$0527$in633 = $213; //@line 10805
     $$1531632 = 10; //@line 10805
     while (1) {
      $215 = $$1531632 * 10 | 0; //@line 10808
      if (($$0527$in633 | 0) < 7) {
       $$0527$in633 = $$0527$in633 + 1 | 0; //@line 10811
       $$1531632 = $215; //@line 10811
      } else {
       $$1531$lcssa = $215; //@line 10813
       break;
      }
     }
    } else {
     $$1531$lcssa = 10; //@line 10818
    }
    $217 = HEAP32[$212 >> 2] | 0; //@line 10820
    $218 = ($217 >>> 0) % ($$1531$lcssa >>> 0) | 0; //@line 10821
    $221 = ($212 + 4 | 0) == ($$3501$lcssa | 0); //@line 10824
    if ($221 & ($218 | 0) == 0) {
     $$4492 = $212; //@line 10827
     $$4518 = $$1515; //@line 10827
     $$8 = $$3484$lcssa; //@line 10827
    } else {
     $$543 = ((($217 >>> 0) / ($$1531$lcssa >>> 0) | 0) & 1 | 0) == 0 ? 9007199254740992.0 : 9007199254740994.0; //@line 10832
     $225 = ($$1531$lcssa | 0) / 2 | 0; //@line 10833
     $$$564 = $218 >>> 0 < $225 >>> 0 ? .5 : $221 & ($218 | 0) == ($225 | 0) ? 1.0 : 1.5; //@line 10838
     if (!$$0520) {
      $$1467 = $$$564; //@line 10841
      $$1469 = $$543; //@line 10841
     } else {
      $230 = (HEAP8[$$0521 >> 0] | 0) == 45; //@line 10844
      $$1467 = $230 ? -$$$564 : $$$564; //@line 10849
      $$1469 = $230 ? -$$543 : $$543; //@line 10849
     }
     $233 = $217 - $218 | 0; //@line 10851
     HEAP32[$212 >> 2] = $233; //@line 10852
     if ($$1469 + $$1467 != $$1469) {
      $236 = $233 + $$1531$lcssa | 0; //@line 10856
      HEAP32[$212 >> 2] = $236; //@line 10857
      if ($236 >>> 0 > 999999999) {
       $$5486626 = $$3484$lcssa; //@line 10860
       $$sink547625 = $212; //@line 10860
       while (1) {
        $238 = $$sink547625 + -4 | 0; //@line 10862
        HEAP32[$$sink547625 >> 2] = 0; //@line 10863
        if ($238 >>> 0 < $$5486626 >>> 0) {
         $240 = $$5486626 + -4 | 0; //@line 10866
         HEAP32[$240 >> 2] = 0; //@line 10867
         $$6 = $240; //@line 10868
        } else {
         $$6 = $$5486626; //@line 10870
        }
        $242 = (HEAP32[$238 >> 2] | 0) + 1 | 0; //@line 10873
        HEAP32[$238 >> 2] = $242; //@line 10874
        if ($242 >>> 0 > 999999999) {
         $$5486626 = $$6; //@line 10877
         $$sink547625 = $238; //@line 10877
        } else {
         $$5486$lcssa = $$6; //@line 10879
         $$sink547$lcssa = $238; //@line 10879
         break;
        }
       }
      } else {
       $$5486$lcssa = $$3484$lcssa; //@line 10884
       $$sink547$lcssa = $212; //@line 10884
      }
      $247 = ($185 - $$5486$lcssa >> 2) * 9 | 0; //@line 10889
      $248 = HEAP32[$$5486$lcssa >> 2] | 0; //@line 10890
      if ($248 >>> 0 < 10) {
       $$4492 = $$sink547$lcssa; //@line 10893
       $$4518 = $247; //@line 10893
       $$8 = $$5486$lcssa; //@line 10893
      } else {
       $$2516621 = $247; //@line 10895
       $$2532620 = 10; //@line 10895
       while (1) {
        $$2532620 = $$2532620 * 10 | 0; //@line 10897
        $251 = $$2516621 + 1 | 0; //@line 10898
        if ($248 >>> 0 < $$2532620 >>> 0) {
         $$4492 = $$sink547$lcssa; //@line 10901
         $$4518 = $251; //@line 10901
         $$8 = $$5486$lcssa; //@line 10901
         break;
        } else {
         $$2516621 = $251; //@line 10904
        }
       }
      }
     } else {
      $$4492 = $212; //@line 10909
      $$4518 = $$1515; //@line 10909
      $$8 = $$3484$lcssa; //@line 10909
     }
    }
    $253 = $$4492 + 4 | 0; //@line 10912
    $$5519$ph = $$4518; //@line 10915
    $$7505$ph = $$3501$lcssa >>> 0 > $253 >>> 0 ? $253 : $$3501$lcssa; //@line 10915
    $$9$ph = $$8; //@line 10915
   } else {
    $$5519$ph = $$1515; //@line 10917
    $$7505$ph = $$3501$lcssa; //@line 10917
    $$9$ph = $$3484$lcssa; //@line 10917
   }
   $$7505 = $$7505$ph; //@line 10919
   while (1) {
    if ($$7505 >>> 0 <= $$9$ph >>> 0) {
     $$lcssa675 = 0; //@line 10923
     break;
    }
    $256 = $$7505 + -4 | 0; //@line 10926
    if (!(HEAP32[$256 >> 2] | 0)) {
     $$7505 = $256; //@line 10930
    } else {
     $$lcssa675 = 1; //@line 10932
     break;
    }
   }
   $259 = 0 - $$5519$ph | 0; //@line 10936
   do {
    if ($198) {
     $$540$ = $$540 + (($199 ^ 1) & 1) | 0; //@line 10941
     if (($$540$ | 0) > ($$5519$ph | 0) & ($$5519$ph | 0) > -5) {
      $$0479 = $5 + -1 | 0; //@line 10949
      $$2476 = $$540$ + -1 - $$5519$ph | 0; //@line 10949
     } else {
      $$0479 = $5 + -2 | 0; //@line 10953
      $$2476 = $$540$ + -1 | 0; //@line 10953
     }
     $267 = $4 & 8; //@line 10955
     if (!$267) {
      if ($$lcssa675) {
       $270 = HEAP32[$$7505 + -4 >> 2] | 0; //@line 10960
       if (!$270) {
        $$2529 = 9; //@line 10963
       } else {
        if (!(($270 >>> 0) % 10 | 0)) {
         $$1528617 = 0; //@line 10968
         $$3533616 = 10; //@line 10968
         while (1) {
          $$3533616 = $$3533616 * 10 | 0; //@line 10970
          $275 = $$1528617 + 1 | 0; //@line 10971
          if (($270 >>> 0) % ($$3533616 >>> 0) | 0 | 0) {
           $$2529 = $275; //@line 10977
           break;
          } else {
           $$1528617 = $275; //@line 10975
          }
         }
        } else {
         $$2529 = 0; //@line 10982
        }
       }
      } else {
       $$2529 = 9; //@line 10986
      }
      $284 = (($$7505 - $185 >> 2) * 9 | 0) + -9 | 0; //@line 10994
      if (($$0479 | 32 | 0) == 102) {
       $285 = $284 - $$2529 | 0; //@line 10996
       $$548 = ($285 | 0) > 0 ? $285 : 0; //@line 10998
       $$1480 = $$0479; //@line 11001
       $$3477 = ($$2476 | 0) < ($$548 | 0) ? $$2476 : $$548; //@line 11001
       $$pre$phi698Z2D = 0; //@line 11001
       break;
      } else {
       $289 = $284 + $$5519$ph - $$2529 | 0; //@line 11005
       $$550 = ($289 | 0) > 0 ? $289 : 0; //@line 11007
       $$1480 = $$0479; //@line 11010
       $$3477 = ($$2476 | 0) < ($$550 | 0) ? $$2476 : $$550; //@line 11010
       $$pre$phi698Z2D = 0; //@line 11010
       break;
      }
     } else {
      $$1480 = $$0479; //@line 11014
      $$3477 = $$2476; //@line 11014
      $$pre$phi698Z2D = $267; //@line 11014
     }
    } else {
     $$1480 = $5; //@line 11018
     $$3477 = $$540; //@line 11018
     $$pre$phi698Z2D = $4 & 8; //@line 11018
    }
   } while (0);
   $292 = $$3477 | $$pre$phi698Z2D; //@line 11021
   $294 = ($292 | 0) != 0 & 1; //@line 11023
   $296 = ($$1480 | 32 | 0) == 102; //@line 11025
   if ($296) {
    $$2513 = 0; //@line 11029
    $$pn = ($$5519$ph | 0) > 0 ? $$5519$ph : 0; //@line 11029
   } else {
    $300 = ($$5519$ph | 0) < 0 ? $259 : $$5519$ph; //@line 11032
    $303 = _fmt_u($300, (($300 | 0) < 0) << 31 >> 31, $11) | 0; //@line 11035
    $304 = $11; //@line 11036
    if (($304 - $303 | 0) < 2) {
     $$1512610 = $303; //@line 11041
     while (1) {
      $308 = $$1512610 + -1 | 0; //@line 11043
      HEAP8[$308 >> 0] = 48; //@line 11044
      if (($304 - $308 | 0) < 2) {
       $$1512610 = $308; //@line 11049
      } else {
       $$1512$lcssa = $308; //@line 11051
       break;
      }
     }
    } else {
     $$1512$lcssa = $303; //@line 11056
    }
    HEAP8[$$1512$lcssa + -1 >> 0] = ($$5519$ph >> 31 & 2) + 43; //@line 11063
    $318 = $$1512$lcssa + -2 | 0; //@line 11065
    HEAP8[$318 >> 0] = $$1480; //@line 11066
    $$2513 = $318; //@line 11069
    $$pn = $304 - $318 | 0; //@line 11069
   }
   $323 = $$0520 + 1 + $$3477 + $294 + $$pn | 0; //@line 11074
   _pad_676($0, 32, $2, $323, $4); //@line 11075
   _out_670($0, $$0521, $$0520); //@line 11076
   _pad_676($0, 48, $2, $323, $4 ^ 65536); //@line 11078
   if ($296) {
    $$0496$$9 = $$9$ph >>> 0 > $$561 >>> 0 ? $$561 : $$9$ph; //@line 11081
    $326 = $8 + 9 | 0; //@line 11082
    $327 = $326; //@line 11083
    $328 = $8 + 8 | 0; //@line 11084
    $$5493600 = $$0496$$9; //@line 11085
    do {
     $330 = _fmt_u(HEAP32[$$5493600 >> 2] | 0, 0, $326) | 0; //@line 11088
     if (($$5493600 | 0) == ($$0496$$9 | 0)) {
      if (($330 | 0) == ($326 | 0)) {
       HEAP8[$328 >> 0] = 48; //@line 11093
       $$1465 = $328; //@line 11094
      } else {
       $$1465 = $330; //@line 11096
      }
     } else {
      if ($330 >>> 0 > $8 >>> 0) {
       _memset($8 | 0, 48, $330 - $9 | 0) | 0; //@line 11103
       $$0464597 = $330; //@line 11104
       while (1) {
        $335 = $$0464597 + -1 | 0; //@line 11106
        if ($335 >>> 0 > $8 >>> 0) {
         $$0464597 = $335; //@line 11109
        } else {
         $$1465 = $335; //@line 11111
         break;
        }
       }
      } else {
       $$1465 = $330; //@line 11116
      }
     }
     _out_670($0, $$1465, $327 - $$1465 | 0); //@line 11121
     $$5493600 = $$5493600 + 4 | 0; //@line 11122
    } while ($$5493600 >>> 0 <= $$561 >>> 0);
    if ($292 | 0) {
     _out_670($0, 3304, 1); //@line 11132
    }
    if ($$5493600 >>> 0 < $$7505 >>> 0 & ($$3477 | 0) > 0) {
     $$4478593 = $$3477; //@line 11138
     $$6494592 = $$5493600; //@line 11138
     while (1) {
      $347 = _fmt_u(HEAP32[$$6494592 >> 2] | 0, 0, $326) | 0; //@line 11141
      if ($347 >>> 0 > $8 >>> 0) {
       _memset($8 | 0, 48, $347 - $9 | 0) | 0; //@line 11146
       $$0463587 = $347; //@line 11147
       while (1) {
        $351 = $$0463587 + -1 | 0; //@line 11149
        if ($351 >>> 0 > $8 >>> 0) {
         $$0463587 = $351; //@line 11152
        } else {
         $$0463$lcssa = $351; //@line 11154
         break;
        }
       }
      } else {
       $$0463$lcssa = $347; //@line 11159
      }
      _out_670($0, $$0463$lcssa, ($$4478593 | 0) < 9 ? $$4478593 : 9); //@line 11163
      $$6494592 = $$6494592 + 4 | 0; //@line 11164
      $356 = $$4478593 + -9 | 0; //@line 11165
      if (!($$6494592 >>> 0 < $$7505 >>> 0 & ($$4478593 | 0) > 9)) {
       $$4478$lcssa = $356; //@line 11172
       break;
      } else {
       $$4478593 = $356; //@line 11170
      }
     }
    } else {
     $$4478$lcssa = $$3477; //@line 11177
    }
    _pad_676($0, 48, $$4478$lcssa + 9 | 0, 9, 0); //@line 11180
   } else {
    $$7505$ = $$lcssa675 ? $$7505 : $$9$ph + 4 | 0; //@line 11183
    if (($$3477 | 0) > -1) {
     $363 = $8 + 9 | 0; //@line 11186
     $364 = ($$pre$phi698Z2D | 0) == 0; //@line 11187
     $365 = $363; //@line 11188
     $366 = 0 - $9 | 0; //@line 11189
     $367 = $8 + 8 | 0; //@line 11190
     $$5605 = $$3477; //@line 11191
     $$7495604 = $$9$ph; //@line 11191
     while (1) {
      $369 = _fmt_u(HEAP32[$$7495604 >> 2] | 0, 0, $363) | 0; //@line 11194
      if (($369 | 0) == ($363 | 0)) {
       HEAP8[$367 >> 0] = 48; //@line 11197
       $$0 = $367; //@line 11198
      } else {
       $$0 = $369; //@line 11200
      }
      do {
       if (($$7495604 | 0) == ($$9$ph | 0)) {
        $375 = $$0 + 1 | 0; //@line 11205
        _out_670($0, $$0, 1); //@line 11206
        if ($364 & ($$5605 | 0) < 1) {
         $$2 = $375; //@line 11210
         break;
        }
        _out_670($0, 3304, 1); //@line 11213
        $$2 = $375; //@line 11214
       } else {
        if ($$0 >>> 0 <= $8 >>> 0) {
         $$2 = $$0; //@line 11218
         break;
        }
        _memset($8 | 0, 48, $$0 + $366 | 0) | 0; //@line 11223
        $$1601 = $$0; //@line 11224
        while (1) {
         $373 = $$1601 + -1 | 0; //@line 11226
         if ($373 >>> 0 > $8 >>> 0) {
          $$1601 = $373; //@line 11229
         } else {
          $$2 = $373; //@line 11231
          break;
         }
        }
       }
      } while (0);
      $378 = $365 - $$2 | 0; //@line 11238
      _out_670($0, $$2, ($$5605 | 0) > ($378 | 0) ? $378 : $$5605); //@line 11241
      $381 = $$5605 - $378 | 0; //@line 11242
      $$7495604 = $$7495604 + 4 | 0; //@line 11243
      if (!($$7495604 >>> 0 < $$7505$ >>> 0 & ($381 | 0) > -1)) {
       $$5$lcssa = $381; //@line 11250
       break;
      } else {
       $$5605 = $381; //@line 11248
      }
     }
    } else {
     $$5$lcssa = $$3477; //@line 11255
    }
    _pad_676($0, 48, $$5$lcssa + 18 | 0, 18, 0); //@line 11258
    _out_670($0, $$2513, $11 - $$2513 | 0); //@line 11262
   }
   _pad_676($0, 32, $2, $323, $4 ^ 8192); //@line 11265
   $$sink560 = $323; //@line 11266
  }
 } while (0);
 STACKTOP = sp; //@line 11271
 return (($$sink560 | 0) < ($2 | 0) ? $2 : $$sink560) | 0; //@line 11271
}
function _equeue_dispatch__async_cb($0) {
 $0 = $0 | 0;
 var $$02329$i$i = 0, $$02330$i$i = 0, $$025$i$i = 0, $$067 = 0, $$06992$reg2mem$0 = 0, $$06992$reg2mem$0$phi = 0, $$2 = 0, $$expand_i1_val = 0, $$expand_i1_val31 = 0, $$expand_i1_val33 = 0, $$expand_i1_val35 = 0, $$reg2mem$0 = 0, $$reg2mem24$0 = 0, $$sink$in$i$i = 0, $10 = 0, $102 = 0, $105 = 0, $106 = 0, $107 = 0, $108 = 0, $109 = 0, $110 = 0, $111 = 0, $112 = 0, $113 = 0, $114 = 0, $115 = 0, $116 = 0, $117 = 0, $118 = 0, $119 = 0, $12 = 0, $120 = 0, $121 = 0, $122 = 0, $123 = 0, $124 = 0, $125 = 0, $127 = 0, $128 = 0, $129 = 0, $131 = 0, $132 = 0, $14 = 0, $140 = 0, $141 = 0, $143 = 0, $146 = 0, $148 = 0, $151 = 0, $154 = 0, $158 = 0, $159 = 0, $160 = 0, $161 = 0, $165 = 0, $168 = 0, $174 = 0, $175 = 0, $176 = 0, $177 = 0, $178 = 0, $179 = 0, $18 = 0, $180 = 0, $181 = 0, $182 = 0, $183 = 0, $184 = 0, $185 = 0, $186 = 0, $187 = 0, $188 = 0, $189 = 0, $190 = 0, $191 = 0, $192 = 0, $20 = 0, $22 = 0, $24 = 0, $28 = 0, $30 = 0, $32 = 0, $34 = 0, $36 = 0, $38 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $44 = 0, $47 = 0, $48 = 0, $49 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0, $68 = 0, $70 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $78 = 0, $79 = 0, $8 = 0, $80 = 0, $81 = 0, $82 = 0, $83 = 0, $84 = 0, $85 = 0, $86 = 0, $87 = 0, $88 = 0, $89 = 0, $90 = 0, $91 = 0, $92 = 0, $93 = 0, $ReallocAsyncCtx = 0, $ReallocAsyncCtx2 = 0, $ReallocAsyncCtx3 = 0, $ReallocAsyncCtx4 = 0, $ReallocAsyncCtx5 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 2621
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 2625
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 2627
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 2629
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 2631
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 2633
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 2635
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 2639
 $20 = HEAP32[$0 + 40 >> 2] | 0; //@line 2641
 $22 = HEAP32[$0 + 44 >> 2] | 0; //@line 2643
 $24 = HEAP8[$0 + 48 >> 0] & 1; //@line 2646
 $28 = HEAP32[$0 + 56 >> 2] | 0; //@line 2650
 $30 = HEAP32[$0 + 60 >> 2] | 0; //@line 2652
 $32 = HEAP32[$0 + 64 >> 2] | 0; //@line 2654
 $34 = HEAP32[$0 + 68 >> 2] | 0; //@line 2656
 $36 = HEAP32[$0 + 72 >> 2] | 0; //@line 2658
 $38 = HEAP32[$0 + 76 >> 2] | 0; //@line 2660
 $40 = HEAP32[$0 + 80 >> 2] | 0; //@line 2662
 $$06992$reg2mem$0 = HEAP32[$0 + 32 >> 2] | 0; //@line 2663
 $$reg2mem$0 = HEAP32[$0 + 4 >> 2] | 0; //@line 2663
 $$reg2mem24$0 = HEAP32[$0 + 52 >> 2] | 0; //@line 2663
 while (1) {
  $68 = HEAP32[$$06992$reg2mem$0 + 24 >> 2] | 0; //@line 2666
  if (($68 | 0) > -1) {
   label = 8; //@line 2669
   break;
  }
  $92 = $$06992$reg2mem$0 + 4 | 0; //@line 2673
  $93 = HEAP8[$92 >> 0] | 0; //@line 2674
  HEAP8[$92 >> 0] = (($93 + 1 & 255) << HEAP32[$18 >> 2] | 0) == 0 ? 1 : ($93 & 255) + 1 & 255; //@line 2683
  $102 = HEAP32[$$06992$reg2mem$0 + 28 >> 2] | 0; //@line 2685
  if ($102 | 0) {
   label = 12; //@line 2688
   break;
  }
  _equeue_mutex_lock($14); //@line 2691
  $125 = HEAP32[$12 >> 2] | 0; //@line 2692
  L6 : do {
   if (!$125) {
    $$02329$i$i = $12; //@line 2696
    label = 21; //@line 2697
   } else {
    $127 = HEAP32[$$06992$reg2mem$0 >> 2] | 0; //@line 2699
    $$025$i$i = $12; //@line 2700
    $129 = $125; //@line 2700
    while (1) {
     $128 = HEAP32[$129 >> 2] | 0; //@line 2702
     if ($128 >>> 0 >= $127 >>> 0) {
      break;
     }
     $131 = $129 + 8 | 0; //@line 2707
     $132 = HEAP32[$131 >> 2] | 0; //@line 2708
     if (!$132) {
      $$02329$i$i = $131; //@line 2711
      label = 21; //@line 2712
      break L6;
     } else {
      $$025$i$i = $131; //@line 2715
      $129 = $132; //@line 2715
     }
    }
    if (($128 | 0) == ($127 | 0)) {
     HEAP32[$$06992$reg2mem$0 + 12 >> 2] = $129; //@line 2721
     $$02330$i$i = $$025$i$i; //@line 2724
     $$sink$in$i$i = (HEAP32[$$025$i$i >> 2] | 0) + 8 | 0; //@line 2724
    } else {
     $$02329$i$i = $$025$i$i; //@line 2726
     label = 21; //@line 2727
    }
   }
  } while (0);
  if ((label | 0) == 21) {
   label = 0; //@line 2732
   HEAP32[$$06992$reg2mem$0 + 12 >> 2] = 0; //@line 2734
   $$02330$i$i = $$02329$i$i; //@line 2735
   $$sink$in$i$i = $$02329$i$i; //@line 2735
  }
  HEAP32[$$reg2mem24$0 >> 2] = HEAP32[$$sink$in$i$i >> 2]; //@line 2738
  HEAP32[$$02330$i$i >> 2] = $$06992$reg2mem$0; //@line 2739
  _equeue_mutex_unlock($14); //@line 2740
  if (!$$reg2mem$0) {
   label = 24; //@line 2743
   break;
  }
  $41 = $$reg2mem$0 + 8 | 0; //@line 2746
  $42 = HEAP32[$41 >> 2] | 0; //@line 2747
  $44 = HEAP32[$$reg2mem$0 + 32 >> 2] | 0; //@line 2749
  if (!$44) {
   $$06992$reg2mem$0$phi = $$reg2mem$0; //@line 2752
   $$reg2mem$0 = $42; //@line 2752
   $$reg2mem24$0 = $41; //@line 2752
   $$06992$reg2mem$0 = $$06992$reg2mem$0$phi; //@line 2752
  } else {
   label = 3; //@line 2754
   break;
  }
 }
 if ((label | 0) == 3) {
  $ReallocAsyncCtx = _emscripten_realloc_async_context(84) | 0; //@line 2760
  FUNCTION_TABLE_vi[$44 & 255]($$reg2mem$0 + 36 | 0); //@line 2761
  if (___async) {
   HEAP32[$ReallocAsyncCtx >> 2] = 30; //@line 2764
   $47 = $ReallocAsyncCtx + 4 | 0; //@line 2765
   HEAP32[$47 >> 2] = $42; //@line 2766
   $48 = $ReallocAsyncCtx + 8 | 0; //@line 2767
   HEAP32[$48 >> 2] = $4; //@line 2768
   $49 = $ReallocAsyncCtx + 12 | 0; //@line 2769
   HEAP32[$49 >> 2] = $6; //@line 2770
   $50 = $ReallocAsyncCtx + 16 | 0; //@line 2771
   HEAP32[$50 >> 2] = $8; //@line 2772
   $51 = $ReallocAsyncCtx + 20 | 0; //@line 2773
   HEAP32[$51 >> 2] = $10; //@line 2774
   $52 = $ReallocAsyncCtx + 24 | 0; //@line 2775
   HEAP32[$52 >> 2] = $12; //@line 2776
   $53 = $ReallocAsyncCtx + 28 | 0; //@line 2777
   HEAP32[$53 >> 2] = $14; //@line 2778
   $54 = $ReallocAsyncCtx + 32 | 0; //@line 2779
   HEAP32[$54 >> 2] = $$reg2mem$0; //@line 2780
   $55 = $ReallocAsyncCtx + 36 | 0; //@line 2781
   HEAP32[$55 >> 2] = $18; //@line 2782
   $56 = $ReallocAsyncCtx + 40 | 0; //@line 2783
   HEAP32[$56 >> 2] = $20; //@line 2784
   $57 = $ReallocAsyncCtx + 44 | 0; //@line 2785
   HEAP32[$57 >> 2] = $22; //@line 2786
   $58 = $ReallocAsyncCtx + 48 | 0; //@line 2787
   $$expand_i1_val = $24 & 1; //@line 2788
   HEAP8[$58 >> 0] = $$expand_i1_val; //@line 2789
   $59 = $ReallocAsyncCtx + 52 | 0; //@line 2790
   HEAP32[$59 >> 2] = $41; //@line 2791
   $60 = $ReallocAsyncCtx + 56 | 0; //@line 2792
   HEAP32[$60 >> 2] = $28; //@line 2793
   $61 = $ReallocAsyncCtx + 60 | 0; //@line 2794
   HEAP32[$61 >> 2] = $30; //@line 2795
   $62 = $ReallocAsyncCtx + 64 | 0; //@line 2796
   HEAP32[$62 >> 2] = $32; //@line 2797
   $63 = $ReallocAsyncCtx + 68 | 0; //@line 2798
   HEAP32[$63 >> 2] = $34; //@line 2799
   $64 = $ReallocAsyncCtx + 72 | 0; //@line 2800
   HEAP32[$64 >> 2] = $36; //@line 2801
   $65 = $ReallocAsyncCtx + 76 | 0; //@line 2802
   HEAP32[$65 >> 2] = $38; //@line 2803
   $66 = $ReallocAsyncCtx + 80 | 0; //@line 2804
   HEAP32[$66 >> 2] = $40; //@line 2805
   sp = STACKTOP; //@line 2806
   return;
  }
  ___async_unwind = 0; //@line 2809
  HEAP32[$ReallocAsyncCtx >> 2] = 30; //@line 2810
  $47 = $ReallocAsyncCtx + 4 | 0; //@line 2811
  HEAP32[$47 >> 2] = $42; //@line 2812
  $48 = $ReallocAsyncCtx + 8 | 0; //@line 2813
  HEAP32[$48 >> 2] = $4; //@line 2814
  $49 = $ReallocAsyncCtx + 12 | 0; //@line 2815
  HEAP32[$49 >> 2] = $6; //@line 2816
  $50 = $ReallocAsyncCtx + 16 | 0; //@line 2817
  HEAP32[$50 >> 2] = $8; //@line 2818
  $51 = $ReallocAsyncCtx + 20 | 0; //@line 2819
  HEAP32[$51 >> 2] = $10; //@line 2820
  $52 = $ReallocAsyncCtx + 24 | 0; //@line 2821
  HEAP32[$52 >> 2] = $12; //@line 2822
  $53 = $ReallocAsyncCtx + 28 | 0; //@line 2823
  HEAP32[$53 >> 2] = $14; //@line 2824
  $54 = $ReallocAsyncCtx + 32 | 0; //@line 2825
  HEAP32[$54 >> 2] = $$reg2mem$0; //@line 2826
  $55 = $ReallocAsyncCtx + 36 | 0; //@line 2827
  HEAP32[$55 >> 2] = $18; //@line 2828
  $56 = $ReallocAsyncCtx + 40 | 0; //@line 2829
  HEAP32[$56 >> 2] = $20; //@line 2830
  $57 = $ReallocAsyncCtx + 44 | 0; //@line 2831
  HEAP32[$57 >> 2] = $22; //@line 2832
  $58 = $ReallocAsyncCtx + 48 | 0; //@line 2833
  $$expand_i1_val = $24 & 1; //@line 2834
  HEAP8[$58 >> 0] = $$expand_i1_val; //@line 2835
  $59 = $ReallocAsyncCtx + 52 | 0; //@line 2836
  HEAP32[$59 >> 2] = $41; //@line 2837
  $60 = $ReallocAsyncCtx + 56 | 0; //@line 2838
  HEAP32[$60 >> 2] = $28; //@line 2839
  $61 = $ReallocAsyncCtx + 60 | 0; //@line 2840
  HEAP32[$61 >> 2] = $30; //@line 2841
  $62 = $ReallocAsyncCtx + 64 | 0; //@line 2842
  HEAP32[$62 >> 2] = $32; //@line 2843
  $63 = $ReallocAsyncCtx + 68 | 0; //@line 2844
  HEAP32[$63 >> 2] = $34; //@line 2845
  $64 = $ReallocAsyncCtx + 72 | 0; //@line 2846
  HEAP32[$64 >> 2] = $36; //@line 2847
  $65 = $ReallocAsyncCtx + 76 | 0; //@line 2848
  HEAP32[$65 >> 2] = $38; //@line 2849
  $66 = $ReallocAsyncCtx + 80 | 0; //@line 2850
  HEAP32[$66 >> 2] = $40; //@line 2851
  sp = STACKTOP; //@line 2852
  return;
 } else if ((label | 0) == 8) {
  $70 = $$06992$reg2mem$0 + 20 | 0; //@line 2856
  HEAP32[$70 >> 2] = (HEAP32[$70 >> 2] | 0) + $68; //@line 2859
  $73 = _equeue_tick() | 0; //@line 2860
  $ReallocAsyncCtx4 = _emscripten_realloc_async_context(76) | 0; //@line 2861
  _equeue_enqueue($20, $$06992$reg2mem$0, $73) | 0; //@line 2862
  if (___async) {
   HEAP32[$ReallocAsyncCtx4 >> 2] = 31; //@line 2865
   $74 = $ReallocAsyncCtx4 + 4 | 0; //@line 2866
   HEAP32[$74 >> 2] = $$reg2mem$0; //@line 2867
   $75 = $ReallocAsyncCtx4 + 8 | 0; //@line 2868
   HEAP32[$75 >> 2] = $4; //@line 2869
   $76 = $ReallocAsyncCtx4 + 12 | 0; //@line 2870
   HEAP32[$76 >> 2] = $6; //@line 2871
   $77 = $ReallocAsyncCtx4 + 16 | 0; //@line 2872
   HEAP32[$77 >> 2] = $8; //@line 2873
   $78 = $ReallocAsyncCtx4 + 20 | 0; //@line 2874
   HEAP32[$78 >> 2] = $10; //@line 2875
   $79 = $ReallocAsyncCtx4 + 24 | 0; //@line 2876
   HEAP32[$79 >> 2] = $12; //@line 2877
   $80 = $ReallocAsyncCtx4 + 28 | 0; //@line 2878
   HEAP32[$80 >> 2] = $14; //@line 2879
   $81 = $ReallocAsyncCtx4 + 32 | 0; //@line 2880
   HEAP32[$81 >> 2] = $18; //@line 2881
   $82 = $ReallocAsyncCtx4 + 36 | 0; //@line 2882
   HEAP32[$82 >> 2] = $20; //@line 2883
   $83 = $ReallocAsyncCtx4 + 40 | 0; //@line 2884
   HEAP32[$83 >> 2] = $22; //@line 2885
   $84 = $ReallocAsyncCtx4 + 44 | 0; //@line 2886
   $$expand_i1_val31 = $24 & 1; //@line 2887
   HEAP8[$84 >> 0] = $$expand_i1_val31; //@line 2888
   $85 = $ReallocAsyncCtx4 + 48 | 0; //@line 2889
   HEAP32[$85 >> 2] = $28; //@line 2890
   $86 = $ReallocAsyncCtx4 + 52 | 0; //@line 2891
   HEAP32[$86 >> 2] = $30; //@line 2892
   $87 = $ReallocAsyncCtx4 + 56 | 0; //@line 2893
   HEAP32[$87 >> 2] = $32; //@line 2894
   $88 = $ReallocAsyncCtx4 + 60 | 0; //@line 2895
   HEAP32[$88 >> 2] = $34; //@line 2896
   $89 = $ReallocAsyncCtx4 + 64 | 0; //@line 2897
   HEAP32[$89 >> 2] = $36; //@line 2898
   $90 = $ReallocAsyncCtx4 + 68 | 0; //@line 2899
   HEAP32[$90 >> 2] = $38; //@line 2900
   $91 = $ReallocAsyncCtx4 + 72 | 0; //@line 2901
   HEAP32[$91 >> 2] = $40; //@line 2902
   sp = STACKTOP; //@line 2903
   return;
  }
  ___async_unwind = 0; //@line 2906
  HEAP32[$ReallocAsyncCtx4 >> 2] = 31; //@line 2907
  $74 = $ReallocAsyncCtx4 + 4 | 0; //@line 2908
  HEAP32[$74 >> 2] = $$reg2mem$0; //@line 2909
  $75 = $ReallocAsyncCtx4 + 8 | 0; //@line 2910
  HEAP32[$75 >> 2] = $4; //@line 2911
  $76 = $ReallocAsyncCtx4 + 12 | 0; //@line 2912
  HEAP32[$76 >> 2] = $6; //@line 2913
  $77 = $ReallocAsyncCtx4 + 16 | 0; //@line 2914
  HEAP32[$77 >> 2] = $8; //@line 2915
  $78 = $ReallocAsyncCtx4 + 20 | 0; //@line 2916
  HEAP32[$78 >> 2] = $10; //@line 2917
  $79 = $ReallocAsyncCtx4 + 24 | 0; //@line 2918
  HEAP32[$79 >> 2] = $12; //@line 2919
  $80 = $ReallocAsyncCtx4 + 28 | 0; //@line 2920
  HEAP32[$80 >> 2] = $14; //@line 2921
  $81 = $ReallocAsyncCtx4 + 32 | 0; //@line 2922
  HEAP32[$81 >> 2] = $18; //@line 2923
  $82 = $ReallocAsyncCtx4 + 36 | 0; //@line 2924
  HEAP32[$82 >> 2] = $20; //@line 2925
  $83 = $ReallocAsyncCtx4 + 40 | 0; //@line 2926
  HEAP32[$83 >> 2] = $22; //@line 2927
  $84 = $ReallocAsyncCtx4 + 44 | 0; //@line 2928
  $$expand_i1_val31 = $24 & 1; //@line 2929
  HEAP8[$84 >> 0] = $$expand_i1_val31; //@line 2930
  $85 = $ReallocAsyncCtx4 + 48 | 0; //@line 2931
  HEAP32[$85 >> 2] = $28; //@line 2932
  $86 = $ReallocAsyncCtx4 + 52 | 0; //@line 2933
  HEAP32[$86 >> 2] = $30; //@line 2934
  $87 = $ReallocAsyncCtx4 + 56 | 0; //@line 2935
  HEAP32[$87 >> 2] = $32; //@line 2936
  $88 = $ReallocAsyncCtx4 + 60 | 0; //@line 2937
  HEAP32[$88 >> 2] = $34; //@line 2938
  $89 = $ReallocAsyncCtx4 + 64 | 0; //@line 2939
  HEAP32[$89 >> 2] = $36; //@line 2940
  $90 = $ReallocAsyncCtx4 + 68 | 0; //@line 2941
  HEAP32[$90 >> 2] = $38; //@line 2942
  $91 = $ReallocAsyncCtx4 + 72 | 0; //@line 2943
  HEAP32[$91 >> 2] = $40; //@line 2944
  sp = STACKTOP; //@line 2945
  return;
 } else if ((label | 0) == 12) {
  $ReallocAsyncCtx2 = _emscripten_realloc_async_context(84) | 0; //@line 2950
  FUNCTION_TABLE_vi[$102 & 255]($$06992$reg2mem$0 + 36 | 0); //@line 2951
  if (___async) {
   HEAP32[$ReallocAsyncCtx2 >> 2] = 32; //@line 2954
   $105 = $ReallocAsyncCtx2 + 4 | 0; //@line 2955
   HEAP32[$105 >> 2] = $$reg2mem$0; //@line 2956
   $106 = $ReallocAsyncCtx2 + 8 | 0; //@line 2957
   HEAP32[$106 >> 2] = $4; //@line 2958
   $107 = $ReallocAsyncCtx2 + 12 | 0; //@line 2959
   HEAP32[$107 >> 2] = $6; //@line 2960
   $108 = $ReallocAsyncCtx2 + 16 | 0; //@line 2961
   HEAP32[$108 >> 2] = $8; //@line 2962
   $109 = $ReallocAsyncCtx2 + 20 | 0; //@line 2963
   HEAP32[$109 >> 2] = $10; //@line 2964
   $110 = $ReallocAsyncCtx2 + 24 | 0; //@line 2965
   HEAP32[$110 >> 2] = $12; //@line 2966
   $111 = $ReallocAsyncCtx2 + 28 | 0; //@line 2967
   HEAP32[$111 >> 2] = $14; //@line 2968
   $112 = $ReallocAsyncCtx2 + 32 | 0; //@line 2969
   HEAP32[$112 >> 2] = $18; //@line 2970
   $113 = $ReallocAsyncCtx2 + 36 | 0; //@line 2971
   HEAP32[$113 >> 2] = $20; //@line 2972
   $114 = $ReallocAsyncCtx2 + 40 | 0; //@line 2973
   HEAP32[$114 >> 2] = $22; //@line 2974
   $115 = $ReallocAsyncCtx2 + 44 | 0; //@line 2975
   $$expand_i1_val33 = $24 & 1; //@line 2976
   HEAP8[$115 >> 0] = $$expand_i1_val33; //@line 2977
   $116 = $ReallocAsyncCtx2 + 48 | 0; //@line 2978
   HEAP32[$116 >> 2] = $28; //@line 2979
   $117 = $ReallocAsyncCtx2 + 52 | 0; //@line 2980
   HEAP32[$117 >> 2] = $30; //@line 2981
   $118 = $ReallocAsyncCtx2 + 56 | 0; //@line 2982
   HEAP32[$118 >> 2] = $32; //@line 2983
   $119 = $ReallocAsyncCtx2 + 60 | 0; //@line 2984
   HEAP32[$119 >> 2] = $34; //@line 2985
   $120 = $ReallocAsyncCtx2 + 64 | 0; //@line 2986
   HEAP32[$120 >> 2] = $36; //@line 2987
   $121 = $ReallocAsyncCtx2 + 68 | 0; //@line 2988
   HEAP32[$121 >> 2] = $38; //@line 2989
   $122 = $ReallocAsyncCtx2 + 72 | 0; //@line 2990
   HEAP32[$122 >> 2] = $40; //@line 2991
   $123 = $ReallocAsyncCtx2 + 76 | 0; //@line 2992
   HEAP32[$123 >> 2] = $$06992$reg2mem$0; //@line 2993
   $124 = $ReallocAsyncCtx2 + 80 | 0; //@line 2994
   HEAP32[$124 >> 2] = $$reg2mem24$0; //@line 2995
   sp = STACKTOP; //@line 2996
   return;
  }
  ___async_unwind = 0; //@line 2999
  HEAP32[$ReallocAsyncCtx2 >> 2] = 32; //@line 3000
  $105 = $ReallocAsyncCtx2 + 4 | 0; //@line 3001
  HEAP32[$105 >> 2] = $$reg2mem$0; //@line 3002
  $106 = $ReallocAsyncCtx2 + 8 | 0; //@line 3003
  HEAP32[$106 >> 2] = $4; //@line 3004
  $107 = $ReallocAsyncCtx2 + 12 | 0; //@line 3005
  HEAP32[$107 >> 2] = $6; //@line 3006
  $108 = $ReallocAsyncCtx2 + 16 | 0; //@line 3007
  HEAP32[$108 >> 2] = $8; //@line 3008
  $109 = $ReallocAsyncCtx2 + 20 | 0; //@line 3009
  HEAP32[$109 >> 2] = $10; //@line 3010
  $110 = $ReallocAsyncCtx2 + 24 | 0; //@line 3011
  HEAP32[$110 >> 2] = $12; //@line 3012
  $111 = $ReallocAsyncCtx2 + 28 | 0; //@line 3013
  HEAP32[$111 >> 2] = $14; //@line 3014
  $112 = $ReallocAsyncCtx2 + 32 | 0; //@line 3015
  HEAP32[$112 >> 2] = $18; //@line 3016
  $113 = $ReallocAsyncCtx2 + 36 | 0; //@line 3017
  HEAP32[$113 >> 2] = $20; //@line 3018
  $114 = $ReallocAsyncCtx2 + 40 | 0; //@line 3019
  HEAP32[$114 >> 2] = $22; //@line 3020
  $115 = $ReallocAsyncCtx2 + 44 | 0; //@line 3021
  $$expand_i1_val33 = $24 & 1; //@line 3022
  HEAP8[$115 >> 0] = $$expand_i1_val33; //@line 3023
  $116 = $ReallocAsyncCtx2 + 48 | 0; //@line 3024
  HEAP32[$116 >> 2] = $28; //@line 3025
  $117 = $ReallocAsyncCtx2 + 52 | 0; //@line 3026
  HEAP32[$117 >> 2] = $30; //@line 3027
  $118 = $ReallocAsyncCtx2 + 56 | 0; //@line 3028
  HEAP32[$118 >> 2] = $32; //@line 3029
  $119 = $ReallocAsyncCtx2 + 60 | 0; //@line 3030
  HEAP32[$119 >> 2] = $34; //@line 3031
  $120 = $ReallocAsyncCtx2 + 64 | 0; //@line 3032
  HEAP32[$120 >> 2] = $36; //@line 3033
  $121 = $ReallocAsyncCtx2 + 68 | 0; //@line 3034
  HEAP32[$121 >> 2] = $38; //@line 3035
  $122 = $ReallocAsyncCtx2 + 72 | 0; //@line 3036
  HEAP32[$122 >> 2] = $40; //@line 3037
  $123 = $ReallocAsyncCtx2 + 76 | 0; //@line 3038
  HEAP32[$123 >> 2] = $$06992$reg2mem$0; //@line 3039
  $124 = $ReallocAsyncCtx2 + 80 | 0; //@line 3040
  HEAP32[$124 >> 2] = $$reg2mem24$0; //@line 3041
  sp = STACKTOP; //@line 3042
  return;
 } else if ((label | 0) == 24) {
  $140 = _equeue_tick() | 0; //@line 3046
  if ($24) {
   $141 = $22 - $140 | 0; //@line 3048
   if (($141 | 0) < 1) {
    $143 = $20 + 40 | 0; //@line 3051
    if (HEAP32[$143 >> 2] | 0) {
     _equeue_mutex_lock($8); //@line 3055
     $146 = HEAP32[$143 >> 2] | 0; //@line 3056
     if ($146 | 0) {
      $148 = HEAP32[$30 >> 2] | 0; //@line 3059
      if ($148 | 0) {
       $151 = HEAP32[$20 + 44 >> 2] | 0; //@line 3063
       $154 = (HEAP32[$148 + 20 >> 2] | 0) - $140 | 0; //@line 3066
       $ReallocAsyncCtx3 = _emscripten_realloc_async_context(16) | 0; //@line 3070
       FUNCTION_TABLE_vii[$146 & 3]($151, $154 & ~($154 >> 31)); //@line 3071
       if (___async) {
        HEAP32[$ReallocAsyncCtx3 >> 2] = 33; //@line 3074
        $158 = $ReallocAsyncCtx3 + 4 | 0; //@line 3075
        HEAP32[$158 >> 2] = $36; //@line 3076
        $159 = $ReallocAsyncCtx3 + 8 | 0; //@line 3077
        HEAP32[$159 >> 2] = $8; //@line 3078
        $160 = $ReallocAsyncCtx3 + 12 | 0; //@line 3079
        HEAP32[$160 >> 2] = $10; //@line 3080
        sp = STACKTOP; //@line 3081
        return;
       }
       ___async_unwind = 0; //@line 3084
       HEAP32[$ReallocAsyncCtx3 >> 2] = 33; //@line 3085
       $158 = $ReallocAsyncCtx3 + 4 | 0; //@line 3086
       HEAP32[$158 >> 2] = $36; //@line 3087
       $159 = $ReallocAsyncCtx3 + 8 | 0; //@line 3088
       HEAP32[$159 >> 2] = $8; //@line 3089
       $160 = $ReallocAsyncCtx3 + 12 | 0; //@line 3090
       HEAP32[$160 >> 2] = $10; //@line 3091
       sp = STACKTOP; //@line 3092
       return;
      }
     }
     HEAP8[$36 >> 0] = 1; //@line 3096
     _equeue_mutex_unlock($8); //@line 3097
    }
    HEAP8[$10 >> 0] = 0; //@line 3099
    return;
   } else {
    $$067 = $141; //@line 3102
   }
  } else {
   $$067 = -1; //@line 3105
  }
  _equeue_mutex_lock($8); //@line 3107
  $161 = HEAP32[$30 >> 2] | 0; //@line 3108
  if (!$161) {
   $$2 = $$067; //@line 3111
  } else {
   $165 = (HEAP32[$161 + 20 >> 2] | 0) - $140 | 0; //@line 3115
   $168 = $165 & ~($165 >> 31); //@line 3118
   $$2 = $168 >>> 0 < $$067 >>> 0 ? $168 : $$067; //@line 3121
  }
  _equeue_mutex_unlock($8); //@line 3123
  _equeue_sema_wait($28, $$2) | 0; //@line 3124
  do {
   if (HEAP8[$10 >> 0] | 0) {
    _equeue_mutex_lock($8); //@line 3129
    if (!(HEAP8[$10 >> 0] | 0)) {
     _equeue_mutex_unlock($8); //@line 3133
     break;
    }
    HEAP8[$10 >> 0] = 0; //@line 3136
    _equeue_mutex_unlock($8); //@line 3137
    return;
   }
  } while (0);
  $174 = _equeue_tick() | 0; //@line 3141
  $ReallocAsyncCtx5 = _emscripten_realloc_async_context(76) | 0; //@line 3142
  _wait_ms(20); //@line 3143
  if (___async) {
   HEAP32[$ReallocAsyncCtx5 >> 2] = 34; //@line 3146
   $175 = $ReallocAsyncCtx5 + 4 | 0; //@line 3147
   HEAP32[$175 >> 2] = $4; //@line 3148
   $176 = $ReallocAsyncCtx5 + 8 | 0; //@line 3149
   HEAP32[$176 >> 2] = $6; //@line 3150
   $177 = $ReallocAsyncCtx5 + 12 | 0; //@line 3151
   HEAP32[$177 >> 2] = $8; //@line 3152
   $178 = $ReallocAsyncCtx5 + 16 | 0; //@line 3153
   HEAP32[$178 >> 2] = $10; //@line 3154
   $179 = $ReallocAsyncCtx5 + 20 | 0; //@line 3155
   HEAP32[$179 >> 2] = $12; //@line 3156
   $180 = $ReallocAsyncCtx5 + 24 | 0; //@line 3157
   HEAP32[$180 >> 2] = $14; //@line 3158
   $181 = $ReallocAsyncCtx5 + 28 | 0; //@line 3159
   HEAP32[$181 >> 2] = $18; //@line 3160
   $182 = $ReallocAsyncCtx5 + 32 | 0; //@line 3161
   HEAP32[$182 >> 2] = $20; //@line 3162
   $183 = $ReallocAsyncCtx5 + 36 | 0; //@line 3163
   HEAP32[$183 >> 2] = $22; //@line 3164
   $184 = $ReallocAsyncCtx5 + 40 | 0; //@line 3165
   $$expand_i1_val35 = $24 & 1; //@line 3166
   HEAP8[$184 >> 0] = $$expand_i1_val35; //@line 3167
   $185 = $ReallocAsyncCtx5 + 44 | 0; //@line 3168
   HEAP32[$185 >> 2] = $28; //@line 3169
   $186 = $ReallocAsyncCtx5 + 48 | 0; //@line 3170
   HEAP32[$186 >> 2] = $30; //@line 3171
   $187 = $ReallocAsyncCtx5 + 52 | 0; //@line 3172
   HEAP32[$187 >> 2] = $32; //@line 3173
   $188 = $ReallocAsyncCtx5 + 56 | 0; //@line 3174
   HEAP32[$188 >> 2] = $34; //@line 3175
   $189 = $ReallocAsyncCtx5 + 60 | 0; //@line 3176
   HEAP32[$189 >> 2] = $36; //@line 3177
   $190 = $ReallocAsyncCtx5 + 64 | 0; //@line 3178
   HEAP32[$190 >> 2] = $38; //@line 3179
   $191 = $ReallocAsyncCtx5 + 68 | 0; //@line 3180
   HEAP32[$191 >> 2] = $40; //@line 3181
   $192 = $ReallocAsyncCtx5 + 72 | 0; //@line 3182
   HEAP32[$192 >> 2] = $174; //@line 3183
   sp = STACKTOP; //@line 3184
   return;
  }
  ___async_unwind = 0; //@line 3187
  HEAP32[$ReallocAsyncCtx5 >> 2] = 34; //@line 3188
  $175 = $ReallocAsyncCtx5 + 4 | 0; //@line 3189
  HEAP32[$175 >> 2] = $4; //@line 3190
  $176 = $ReallocAsyncCtx5 + 8 | 0; //@line 3191
  HEAP32[$176 >> 2] = $6; //@line 3192
  $177 = $ReallocAsyncCtx5 + 12 | 0; //@line 3193
  HEAP32[$177 >> 2] = $8; //@line 3194
  $178 = $ReallocAsyncCtx5 + 16 | 0; //@line 3195
  HEAP32[$178 >> 2] = $10; //@line 3196
  $179 = $ReallocAsyncCtx5 + 20 | 0; //@line 3197
  HEAP32[$179 >> 2] = $12; //@line 3198
  $180 = $ReallocAsyncCtx5 + 24 | 0; //@line 3199
  HEAP32[$180 >> 2] = $14; //@line 3200
  $181 = $ReallocAsyncCtx5 + 28 | 0; //@line 3201
  HEAP32[$181 >> 2] = $18; //@line 3202
  $182 = $ReallocAsyncCtx5 + 32 | 0; //@line 3203
  HEAP32[$182 >> 2] = $20; //@line 3204
  $183 = $ReallocAsyncCtx5 + 36 | 0; //@line 3205
  HEAP32[$183 >> 2] = $22; //@line 3206
  $184 = $ReallocAsyncCtx5 + 40 | 0; //@line 3207
  $$expand_i1_val35 = $24 & 1; //@line 3208
  HEAP8[$184 >> 0] = $$expand_i1_val35; //@line 3209
  $185 = $ReallocAsyncCtx5 + 44 | 0; //@line 3210
  HEAP32[$185 >> 2] = $28; //@line 3211
  $186 = $ReallocAsyncCtx5 + 48 | 0; //@line 3212
  HEAP32[$186 >> 2] = $30; //@line 3213
  $187 = $ReallocAsyncCtx5 + 52 | 0; //@line 3214
  HEAP32[$187 >> 2] = $32; //@line 3215
  $188 = $ReallocAsyncCtx5 + 56 | 0; //@line 3216
  HEAP32[$188 >> 2] = $34; //@line 3217
  $189 = $ReallocAsyncCtx5 + 60 | 0; //@line 3218
  HEAP32[$189 >> 2] = $36; //@line 3219
  $190 = $ReallocAsyncCtx5 + 64 | 0; //@line 3220
  HEAP32[$190 >> 2] = $38; //@line 3221
  $191 = $ReallocAsyncCtx5 + 68 | 0; //@line 3222
  HEAP32[$191 >> 2] = $40; //@line 3223
  $192 = $ReallocAsyncCtx5 + 72 | 0; //@line 3224
  HEAP32[$192 >> 2] = $174; //@line 3225
  sp = STACKTOP; //@line 3226
  return;
 }
}
function _equeue_dispatch__async_cb_22($0) {
 $0 = $0 | 0;
 var $$02329$i$i = 0, $$02330$i$i = 0, $$025$i$i = 0, $$067 = 0, $$06992$reg2mem$0 = 0, $$06992$reg2mem$0$phi = 0, $$2 = 0, $$expand_i1_val = 0, $$expand_i1_val31 = 0, $$expand_i1_val33 = 0, $$expand_i1_val35 = 0, $$reg2mem$0 = 0, $$reg2mem24$0 = 0, $$sink$in$i$i = 0, $10 = 0, $102 = 0, $105 = 0, $106 = 0, $107 = 0, $108 = 0, $109 = 0, $110 = 0, $111 = 0, $112 = 0, $113 = 0, $114 = 0, $115 = 0, $116 = 0, $117 = 0, $118 = 0, $119 = 0, $12 = 0, $120 = 0, $121 = 0, $122 = 0, $123 = 0, $124 = 0, $125 = 0, $127 = 0, $128 = 0, $129 = 0, $131 = 0, $132 = 0, $14 = 0, $140 = 0, $141 = 0, $143 = 0, $146 = 0, $148 = 0, $151 = 0, $154 = 0, $158 = 0, $159 = 0, $16 = 0, $160 = 0, $161 = 0, $165 = 0, $168 = 0, $174 = 0, $175 = 0, $176 = 0, $177 = 0, $178 = 0, $179 = 0, $18 = 0, $180 = 0, $181 = 0, $182 = 0, $183 = 0, $184 = 0, $185 = 0, $186 = 0, $187 = 0, $188 = 0, $189 = 0, $190 = 0, $191 = 0, $192 = 0, $20 = 0, $22 = 0, $24 = 0, $26 = 0, $28 = 0, $30 = 0, $32 = 0, $34 = 0, $36 = 0, $4 = 0, $42 = 0, $44 = 0, $47 = 0, $48 = 0, $49 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0, $68 = 0, $70 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $78 = 0, $79 = 0, $8 = 0, $80 = 0, $81 = 0, $82 = 0, $83 = 0, $84 = 0, $85 = 0, $86 = 0, $87 = 0, $88 = 0, $89 = 0, $90 = 0, $91 = 0, $92 = 0, $93 = 0, $ReallocAsyncCtx = 0, $ReallocAsyncCtx2 = 0, $ReallocAsyncCtx3 = 0, $ReallocAsyncCtx4 = 0, $ReallocAsyncCtx5 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 3244
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 3248
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 3250
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 3252
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 3254
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 3256
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 3258
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 3260
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 3262
 $20 = HEAP32[$0 + 40 >> 2] | 0; //@line 3264
 $22 = HEAP8[$0 + 44 >> 0] & 1; //@line 3267
 $24 = HEAP32[$0 + 48 >> 2] | 0; //@line 3269
 $26 = HEAP32[$0 + 52 >> 2] | 0; //@line 3271
 $28 = HEAP32[$0 + 56 >> 2] | 0; //@line 3273
 $30 = HEAP32[$0 + 60 >> 2] | 0; //@line 3275
 $32 = HEAP32[$0 + 64 >> 2] | 0; //@line 3277
 $34 = HEAP32[$0 + 68 >> 2] | 0; //@line 3279
 $36 = HEAP32[$0 + 72 >> 2] | 0; //@line 3281
 $$06992$reg2mem$0 = HEAP32[$0 + 76 >> 2] | 0; //@line 3286
 $$reg2mem$0 = HEAP32[$0 + 4 >> 2] | 0; //@line 3286
 $$reg2mem24$0 = HEAP32[$0 + 80 >> 2] | 0; //@line 3286
 while (1) {
  _equeue_mutex_lock($14); //@line 3288
  $125 = HEAP32[$12 >> 2] | 0; //@line 3289
  L4 : do {
   if (!$125) {
    $$02329$i$i = $12; //@line 3293
    label = 21; //@line 3294
   } else {
    $127 = HEAP32[$$06992$reg2mem$0 >> 2] | 0; //@line 3296
    $$025$i$i = $12; //@line 3297
    $129 = $125; //@line 3297
    while (1) {
     $128 = HEAP32[$129 >> 2] | 0; //@line 3299
     if ($128 >>> 0 >= $127 >>> 0) {
      break;
     }
     $131 = $129 + 8 | 0; //@line 3304
     $132 = HEAP32[$131 >> 2] | 0; //@line 3305
     if (!$132) {
      $$02329$i$i = $131; //@line 3308
      label = 21; //@line 3309
      break L4;
     } else {
      $$025$i$i = $131; //@line 3312
      $129 = $132; //@line 3312
     }
    }
    if (($128 | 0) == ($127 | 0)) {
     HEAP32[$$06992$reg2mem$0 + 12 >> 2] = $129; //@line 3318
     $$02330$i$i = $$025$i$i; //@line 3321
     $$sink$in$i$i = (HEAP32[$$025$i$i >> 2] | 0) + 8 | 0; //@line 3321
    } else {
     $$02329$i$i = $$025$i$i; //@line 3323
     label = 21; //@line 3324
    }
   }
  } while (0);
  if ((label | 0) == 21) {
   label = 0; //@line 3329
   HEAP32[$$06992$reg2mem$0 + 12 >> 2] = 0; //@line 3331
   $$02330$i$i = $$02329$i$i; //@line 3332
   $$sink$in$i$i = $$02329$i$i; //@line 3332
  }
  HEAP32[$$reg2mem24$0 >> 2] = HEAP32[$$sink$in$i$i >> 2]; //@line 3335
  HEAP32[$$02330$i$i >> 2] = $$06992$reg2mem$0; //@line 3336
  _equeue_mutex_unlock($14); //@line 3337
  if (!$$reg2mem$0) {
   label = 24; //@line 3340
   break;
  }
  $$reg2mem24$0 = $$reg2mem$0 + 8 | 0; //@line 3343
  $42 = HEAP32[$$reg2mem24$0 >> 2] | 0; //@line 3344
  $44 = HEAP32[$$reg2mem$0 + 32 >> 2] | 0; //@line 3346
  if ($44 | 0) {
   label = 3; //@line 3349
   break;
  }
  $68 = HEAP32[$$reg2mem$0 + 24 >> 2] | 0; //@line 3353
  if (($68 | 0) > -1) {
   label = 7; //@line 3356
   break;
  }
  $92 = $$reg2mem$0 + 4 | 0; //@line 3360
  $93 = HEAP8[$92 >> 0] | 0; //@line 3361
  HEAP8[$92 >> 0] = (($93 + 1 & 255) << HEAP32[$16 >> 2] | 0) == 0 ? 1 : ($93 & 255) + 1 & 255; //@line 3370
  $102 = HEAP32[$$reg2mem$0 + 28 >> 2] | 0; //@line 3372
  if ($102 | 0) {
   label = 11; //@line 3377
   break;
  } else {
   $$06992$reg2mem$0$phi = $$reg2mem$0; //@line 3375
   $$reg2mem$0 = $42; //@line 3375
   $$06992$reg2mem$0 = $$06992$reg2mem$0$phi; //@line 3375
  }
 }
 if ((label | 0) == 3) {
  $ReallocAsyncCtx = _emscripten_realloc_async_context(84) | 0; //@line 3383
  FUNCTION_TABLE_vi[$44 & 255]($$reg2mem$0 + 36 | 0); //@line 3384
  if (___async) {
   HEAP32[$ReallocAsyncCtx >> 2] = 30; //@line 3387
   $47 = $ReallocAsyncCtx + 4 | 0; //@line 3388
   HEAP32[$47 >> 2] = $42; //@line 3389
   $48 = $ReallocAsyncCtx + 8 | 0; //@line 3390
   HEAP32[$48 >> 2] = $4; //@line 3391
   $49 = $ReallocAsyncCtx + 12 | 0; //@line 3392
   HEAP32[$49 >> 2] = $6; //@line 3393
   $50 = $ReallocAsyncCtx + 16 | 0; //@line 3394
   HEAP32[$50 >> 2] = $8; //@line 3395
   $51 = $ReallocAsyncCtx + 20 | 0; //@line 3396
   HEAP32[$51 >> 2] = $10; //@line 3397
   $52 = $ReallocAsyncCtx + 24 | 0; //@line 3398
   HEAP32[$52 >> 2] = $12; //@line 3399
   $53 = $ReallocAsyncCtx + 28 | 0; //@line 3400
   HEAP32[$53 >> 2] = $14; //@line 3401
   $54 = $ReallocAsyncCtx + 32 | 0; //@line 3402
   HEAP32[$54 >> 2] = $$reg2mem$0; //@line 3403
   $55 = $ReallocAsyncCtx + 36 | 0; //@line 3404
   HEAP32[$55 >> 2] = $16; //@line 3405
   $56 = $ReallocAsyncCtx + 40 | 0; //@line 3406
   HEAP32[$56 >> 2] = $18; //@line 3407
   $57 = $ReallocAsyncCtx + 44 | 0; //@line 3408
   HEAP32[$57 >> 2] = $20; //@line 3409
   $58 = $ReallocAsyncCtx + 48 | 0; //@line 3410
   $$expand_i1_val = $22 & 1; //@line 3411
   HEAP8[$58 >> 0] = $$expand_i1_val; //@line 3412
   $59 = $ReallocAsyncCtx + 52 | 0; //@line 3413
   HEAP32[$59 >> 2] = $$reg2mem24$0; //@line 3414
   $60 = $ReallocAsyncCtx + 56 | 0; //@line 3415
   HEAP32[$60 >> 2] = $24; //@line 3416
   $61 = $ReallocAsyncCtx + 60 | 0; //@line 3417
   HEAP32[$61 >> 2] = $26; //@line 3418
   $62 = $ReallocAsyncCtx + 64 | 0; //@line 3419
   HEAP32[$62 >> 2] = $28; //@line 3420
   $63 = $ReallocAsyncCtx + 68 | 0; //@line 3421
   HEAP32[$63 >> 2] = $30; //@line 3422
   $64 = $ReallocAsyncCtx + 72 | 0; //@line 3423
   HEAP32[$64 >> 2] = $32; //@line 3424
   $65 = $ReallocAsyncCtx + 76 | 0; //@line 3425
   HEAP32[$65 >> 2] = $34; //@line 3426
   $66 = $ReallocAsyncCtx + 80 | 0; //@line 3427
   HEAP32[$66 >> 2] = $36; //@line 3428
   sp = STACKTOP; //@line 3429
   return;
  }
  ___async_unwind = 0; //@line 3432
  HEAP32[$ReallocAsyncCtx >> 2] = 30; //@line 3433
  $47 = $ReallocAsyncCtx + 4 | 0; //@line 3434
  HEAP32[$47 >> 2] = $42; //@line 3435
  $48 = $ReallocAsyncCtx + 8 | 0; //@line 3436
  HEAP32[$48 >> 2] = $4; //@line 3437
  $49 = $ReallocAsyncCtx + 12 | 0; //@line 3438
  HEAP32[$49 >> 2] = $6; //@line 3439
  $50 = $ReallocAsyncCtx + 16 | 0; //@line 3440
  HEAP32[$50 >> 2] = $8; //@line 3441
  $51 = $ReallocAsyncCtx + 20 | 0; //@line 3442
  HEAP32[$51 >> 2] = $10; //@line 3443
  $52 = $ReallocAsyncCtx + 24 | 0; //@line 3444
  HEAP32[$52 >> 2] = $12; //@line 3445
  $53 = $ReallocAsyncCtx + 28 | 0; //@line 3446
  HEAP32[$53 >> 2] = $14; //@line 3447
  $54 = $ReallocAsyncCtx + 32 | 0; //@line 3448
  HEAP32[$54 >> 2] = $$reg2mem$0; //@line 3449
  $55 = $ReallocAsyncCtx + 36 | 0; //@line 3450
  HEAP32[$55 >> 2] = $16; //@line 3451
  $56 = $ReallocAsyncCtx + 40 | 0; //@line 3452
  HEAP32[$56 >> 2] = $18; //@line 3453
  $57 = $ReallocAsyncCtx + 44 | 0; //@line 3454
  HEAP32[$57 >> 2] = $20; //@line 3455
  $58 = $ReallocAsyncCtx + 48 | 0; //@line 3456
  $$expand_i1_val = $22 & 1; //@line 3457
  HEAP8[$58 >> 0] = $$expand_i1_val; //@line 3458
  $59 = $ReallocAsyncCtx + 52 | 0; //@line 3459
  HEAP32[$59 >> 2] = $$reg2mem24$0; //@line 3460
  $60 = $ReallocAsyncCtx + 56 | 0; //@line 3461
  HEAP32[$60 >> 2] = $24; //@line 3462
  $61 = $ReallocAsyncCtx + 60 | 0; //@line 3463
  HEAP32[$61 >> 2] = $26; //@line 3464
  $62 = $ReallocAsyncCtx + 64 | 0; //@line 3465
  HEAP32[$62 >> 2] = $28; //@line 3466
  $63 = $ReallocAsyncCtx + 68 | 0; //@line 3467
  HEAP32[$63 >> 2] = $30; //@line 3468
  $64 = $ReallocAsyncCtx + 72 | 0; //@line 3469
  HEAP32[$64 >> 2] = $32; //@line 3470
  $65 = $ReallocAsyncCtx + 76 | 0; //@line 3471
  HEAP32[$65 >> 2] = $34; //@line 3472
  $66 = $ReallocAsyncCtx + 80 | 0; //@line 3473
  HEAP32[$66 >> 2] = $36; //@line 3474
  sp = STACKTOP; //@line 3475
  return;
 } else if ((label | 0) == 7) {
  $70 = $$reg2mem$0 + 20 | 0; //@line 3479
  HEAP32[$70 >> 2] = (HEAP32[$70 >> 2] | 0) + $68; //@line 3482
  $73 = _equeue_tick() | 0; //@line 3483
  $ReallocAsyncCtx4 = _emscripten_realloc_async_context(76) | 0; //@line 3484
  _equeue_enqueue($18, $$reg2mem$0, $73) | 0; //@line 3485
  if (___async) {
   HEAP32[$ReallocAsyncCtx4 >> 2] = 31; //@line 3488
   $74 = $ReallocAsyncCtx4 + 4 | 0; //@line 3489
   HEAP32[$74 >> 2] = $42; //@line 3490
   $75 = $ReallocAsyncCtx4 + 8 | 0; //@line 3491
   HEAP32[$75 >> 2] = $4; //@line 3492
   $76 = $ReallocAsyncCtx4 + 12 | 0; //@line 3493
   HEAP32[$76 >> 2] = $6; //@line 3494
   $77 = $ReallocAsyncCtx4 + 16 | 0; //@line 3495
   HEAP32[$77 >> 2] = $8; //@line 3496
   $78 = $ReallocAsyncCtx4 + 20 | 0; //@line 3497
   HEAP32[$78 >> 2] = $10; //@line 3498
   $79 = $ReallocAsyncCtx4 + 24 | 0; //@line 3499
   HEAP32[$79 >> 2] = $12; //@line 3500
   $80 = $ReallocAsyncCtx4 + 28 | 0; //@line 3501
   HEAP32[$80 >> 2] = $14; //@line 3502
   $81 = $ReallocAsyncCtx4 + 32 | 0; //@line 3503
   HEAP32[$81 >> 2] = $16; //@line 3504
   $82 = $ReallocAsyncCtx4 + 36 | 0; //@line 3505
   HEAP32[$82 >> 2] = $18; //@line 3506
   $83 = $ReallocAsyncCtx4 + 40 | 0; //@line 3507
   HEAP32[$83 >> 2] = $20; //@line 3508
   $84 = $ReallocAsyncCtx4 + 44 | 0; //@line 3509
   $$expand_i1_val31 = $22 & 1; //@line 3510
   HEAP8[$84 >> 0] = $$expand_i1_val31; //@line 3511
   $85 = $ReallocAsyncCtx4 + 48 | 0; //@line 3512
   HEAP32[$85 >> 2] = $24; //@line 3513
   $86 = $ReallocAsyncCtx4 + 52 | 0; //@line 3514
   HEAP32[$86 >> 2] = $26; //@line 3515
   $87 = $ReallocAsyncCtx4 + 56 | 0; //@line 3516
   HEAP32[$87 >> 2] = $28; //@line 3517
   $88 = $ReallocAsyncCtx4 + 60 | 0; //@line 3518
   HEAP32[$88 >> 2] = $30; //@line 3519
   $89 = $ReallocAsyncCtx4 + 64 | 0; //@line 3520
   HEAP32[$89 >> 2] = $32; //@line 3521
   $90 = $ReallocAsyncCtx4 + 68 | 0; //@line 3522
   HEAP32[$90 >> 2] = $34; //@line 3523
   $91 = $ReallocAsyncCtx4 + 72 | 0; //@line 3524
   HEAP32[$91 >> 2] = $36; //@line 3525
   sp = STACKTOP; //@line 3526
   return;
  }
  ___async_unwind = 0; //@line 3529
  HEAP32[$ReallocAsyncCtx4 >> 2] = 31; //@line 3530
  $74 = $ReallocAsyncCtx4 + 4 | 0; //@line 3531
  HEAP32[$74 >> 2] = $42; //@line 3532
  $75 = $ReallocAsyncCtx4 + 8 | 0; //@line 3533
  HEAP32[$75 >> 2] = $4; //@line 3534
  $76 = $ReallocAsyncCtx4 + 12 | 0; //@line 3535
  HEAP32[$76 >> 2] = $6; //@line 3536
  $77 = $ReallocAsyncCtx4 + 16 | 0; //@line 3537
  HEAP32[$77 >> 2] = $8; //@line 3538
  $78 = $ReallocAsyncCtx4 + 20 | 0; //@line 3539
  HEAP32[$78 >> 2] = $10; //@line 3540
  $79 = $ReallocAsyncCtx4 + 24 | 0; //@line 3541
  HEAP32[$79 >> 2] = $12; //@line 3542
  $80 = $ReallocAsyncCtx4 + 28 | 0; //@line 3543
  HEAP32[$80 >> 2] = $14; //@line 3544
  $81 = $ReallocAsyncCtx4 + 32 | 0; //@line 3545
  HEAP32[$81 >> 2] = $16; //@line 3546
  $82 = $ReallocAsyncCtx4 + 36 | 0; //@line 3547
  HEAP32[$82 >> 2] = $18; //@line 3548
  $83 = $ReallocAsyncCtx4 + 40 | 0; //@line 3549
  HEAP32[$83 >> 2] = $20; //@line 3550
  $84 = $ReallocAsyncCtx4 + 44 | 0; //@line 3551
  $$expand_i1_val31 = $22 & 1; //@line 3552
  HEAP8[$84 >> 0] = $$expand_i1_val31; //@line 3553
  $85 = $ReallocAsyncCtx4 + 48 | 0; //@line 3554
  HEAP32[$85 >> 2] = $24; //@line 3555
  $86 = $ReallocAsyncCtx4 + 52 | 0; //@line 3556
  HEAP32[$86 >> 2] = $26; //@line 3557
  $87 = $ReallocAsyncCtx4 + 56 | 0; //@line 3558
  HEAP32[$87 >> 2] = $28; //@line 3559
  $88 = $ReallocAsyncCtx4 + 60 | 0; //@line 3560
  HEAP32[$88 >> 2] = $30; //@line 3561
  $89 = $ReallocAsyncCtx4 + 64 | 0; //@line 3562
  HEAP32[$89 >> 2] = $32; //@line 3563
  $90 = $ReallocAsyncCtx4 + 68 | 0; //@line 3564
  HEAP32[$90 >> 2] = $34; //@line 3565
  $91 = $ReallocAsyncCtx4 + 72 | 0; //@line 3566
  HEAP32[$91 >> 2] = $36; //@line 3567
  sp = STACKTOP; //@line 3568
  return;
 } else if ((label | 0) == 11) {
  $ReallocAsyncCtx2 = _emscripten_realloc_async_context(84) | 0; //@line 3573
  FUNCTION_TABLE_vi[$102 & 255]($$reg2mem$0 + 36 | 0); //@line 3574
  if (___async) {
   HEAP32[$ReallocAsyncCtx2 >> 2] = 32; //@line 3577
   $105 = $ReallocAsyncCtx2 + 4 | 0; //@line 3578
   HEAP32[$105 >> 2] = $42; //@line 3579
   $106 = $ReallocAsyncCtx2 + 8 | 0; //@line 3580
   HEAP32[$106 >> 2] = $4; //@line 3581
   $107 = $ReallocAsyncCtx2 + 12 | 0; //@line 3582
   HEAP32[$107 >> 2] = $6; //@line 3583
   $108 = $ReallocAsyncCtx2 + 16 | 0; //@line 3584
   HEAP32[$108 >> 2] = $8; //@line 3585
   $109 = $ReallocAsyncCtx2 + 20 | 0; //@line 3586
   HEAP32[$109 >> 2] = $10; //@line 3587
   $110 = $ReallocAsyncCtx2 + 24 | 0; //@line 3588
   HEAP32[$110 >> 2] = $12; //@line 3589
   $111 = $ReallocAsyncCtx2 + 28 | 0; //@line 3590
   HEAP32[$111 >> 2] = $14; //@line 3591
   $112 = $ReallocAsyncCtx2 + 32 | 0; //@line 3592
   HEAP32[$112 >> 2] = $16; //@line 3593
   $113 = $ReallocAsyncCtx2 + 36 | 0; //@line 3594
   HEAP32[$113 >> 2] = $18; //@line 3595
   $114 = $ReallocAsyncCtx2 + 40 | 0; //@line 3596
   HEAP32[$114 >> 2] = $20; //@line 3597
   $115 = $ReallocAsyncCtx2 + 44 | 0; //@line 3598
   $$expand_i1_val33 = $22 & 1; //@line 3599
   HEAP8[$115 >> 0] = $$expand_i1_val33; //@line 3600
   $116 = $ReallocAsyncCtx2 + 48 | 0; //@line 3601
   HEAP32[$116 >> 2] = $24; //@line 3602
   $117 = $ReallocAsyncCtx2 + 52 | 0; //@line 3603
   HEAP32[$117 >> 2] = $26; //@line 3604
   $118 = $ReallocAsyncCtx2 + 56 | 0; //@line 3605
   HEAP32[$118 >> 2] = $28; //@line 3606
   $119 = $ReallocAsyncCtx2 + 60 | 0; //@line 3607
   HEAP32[$119 >> 2] = $30; //@line 3608
   $120 = $ReallocAsyncCtx2 + 64 | 0; //@line 3609
   HEAP32[$120 >> 2] = $32; //@line 3610
   $121 = $ReallocAsyncCtx2 + 68 | 0; //@line 3611
   HEAP32[$121 >> 2] = $34; //@line 3612
   $122 = $ReallocAsyncCtx2 + 72 | 0; //@line 3613
   HEAP32[$122 >> 2] = $36; //@line 3614
   $123 = $ReallocAsyncCtx2 + 76 | 0; //@line 3615
   HEAP32[$123 >> 2] = $$reg2mem$0; //@line 3616
   $124 = $ReallocAsyncCtx2 + 80 | 0; //@line 3617
   HEAP32[$124 >> 2] = $$reg2mem24$0; //@line 3618
   sp = STACKTOP; //@line 3619
   return;
  }
  ___async_unwind = 0; //@line 3622
  HEAP32[$ReallocAsyncCtx2 >> 2] = 32; //@line 3623
  $105 = $ReallocAsyncCtx2 + 4 | 0; //@line 3624
  HEAP32[$105 >> 2] = $42; //@line 3625
  $106 = $ReallocAsyncCtx2 + 8 | 0; //@line 3626
  HEAP32[$106 >> 2] = $4; //@line 3627
  $107 = $ReallocAsyncCtx2 + 12 | 0; //@line 3628
  HEAP32[$107 >> 2] = $6; //@line 3629
  $108 = $ReallocAsyncCtx2 + 16 | 0; //@line 3630
  HEAP32[$108 >> 2] = $8; //@line 3631
  $109 = $ReallocAsyncCtx2 + 20 | 0; //@line 3632
  HEAP32[$109 >> 2] = $10; //@line 3633
  $110 = $ReallocAsyncCtx2 + 24 | 0; //@line 3634
  HEAP32[$110 >> 2] = $12; //@line 3635
  $111 = $ReallocAsyncCtx2 + 28 | 0; //@line 3636
  HEAP32[$111 >> 2] = $14; //@line 3637
  $112 = $ReallocAsyncCtx2 + 32 | 0; //@line 3638
  HEAP32[$112 >> 2] = $16; //@line 3639
  $113 = $ReallocAsyncCtx2 + 36 | 0; //@line 3640
  HEAP32[$113 >> 2] = $18; //@line 3641
  $114 = $ReallocAsyncCtx2 + 40 | 0; //@line 3642
  HEAP32[$114 >> 2] = $20; //@line 3643
  $115 = $ReallocAsyncCtx2 + 44 | 0; //@line 3644
  $$expand_i1_val33 = $22 & 1; //@line 3645
  HEAP8[$115 >> 0] = $$expand_i1_val33; //@line 3646
  $116 = $ReallocAsyncCtx2 + 48 | 0; //@line 3647
  HEAP32[$116 >> 2] = $24; //@line 3648
  $117 = $ReallocAsyncCtx2 + 52 | 0; //@line 3649
  HEAP32[$117 >> 2] = $26; //@line 3650
  $118 = $ReallocAsyncCtx2 + 56 | 0; //@line 3651
  HEAP32[$118 >> 2] = $28; //@line 3652
  $119 = $ReallocAsyncCtx2 + 60 | 0; //@line 3653
  HEAP32[$119 >> 2] = $30; //@line 3654
  $120 = $ReallocAsyncCtx2 + 64 | 0; //@line 3655
  HEAP32[$120 >> 2] = $32; //@line 3656
  $121 = $ReallocAsyncCtx2 + 68 | 0; //@line 3657
  HEAP32[$121 >> 2] = $34; //@line 3658
  $122 = $ReallocAsyncCtx2 + 72 | 0; //@line 3659
  HEAP32[$122 >> 2] = $36; //@line 3660
  $123 = $ReallocAsyncCtx2 + 76 | 0; //@line 3661
  HEAP32[$123 >> 2] = $$reg2mem$0; //@line 3662
  $124 = $ReallocAsyncCtx2 + 80 | 0; //@line 3663
  HEAP32[$124 >> 2] = $$reg2mem24$0; //@line 3664
  sp = STACKTOP; //@line 3665
  return;
 } else if ((label | 0) == 24) {
  $140 = _equeue_tick() | 0; //@line 3669
  if ($22) {
   $141 = $20 - $140 | 0; //@line 3671
   if (($141 | 0) < 1) {
    $143 = $18 + 40 | 0; //@line 3674
    if (HEAP32[$143 >> 2] | 0) {
     _equeue_mutex_lock($8); //@line 3678
     $146 = HEAP32[$143 >> 2] | 0; //@line 3679
     if ($146 | 0) {
      $148 = HEAP32[$26 >> 2] | 0; //@line 3682
      if ($148 | 0) {
       $151 = HEAP32[$18 + 44 >> 2] | 0; //@line 3686
       $154 = (HEAP32[$148 + 20 >> 2] | 0) - $140 | 0; //@line 3689
       $ReallocAsyncCtx3 = _emscripten_realloc_async_context(16) | 0; //@line 3693
       FUNCTION_TABLE_vii[$146 & 3]($151, $154 & ~($154 >> 31)); //@line 3694
       if (___async) {
        HEAP32[$ReallocAsyncCtx3 >> 2] = 33; //@line 3697
        $158 = $ReallocAsyncCtx3 + 4 | 0; //@line 3698
        HEAP32[$158 >> 2] = $32; //@line 3699
        $159 = $ReallocAsyncCtx3 + 8 | 0; //@line 3700
        HEAP32[$159 >> 2] = $8; //@line 3701
        $160 = $ReallocAsyncCtx3 + 12 | 0; //@line 3702
        HEAP32[$160 >> 2] = $10; //@line 3703
        sp = STACKTOP; //@line 3704
        return;
       }
       ___async_unwind = 0; //@line 3707
       HEAP32[$ReallocAsyncCtx3 >> 2] = 33; //@line 3708
       $158 = $ReallocAsyncCtx3 + 4 | 0; //@line 3709
       HEAP32[$158 >> 2] = $32; //@line 3710
       $159 = $ReallocAsyncCtx3 + 8 | 0; //@line 3711
       HEAP32[$159 >> 2] = $8; //@line 3712
       $160 = $ReallocAsyncCtx3 + 12 | 0; //@line 3713
       HEAP32[$160 >> 2] = $10; //@line 3714
       sp = STACKTOP; //@line 3715
       return;
      }
     }
     HEAP8[$32 >> 0] = 1; //@line 3719
     _equeue_mutex_unlock($8); //@line 3720
    }
    HEAP8[$10 >> 0] = 0; //@line 3722
    return;
   } else {
    $$067 = $141; //@line 3725
   }
  } else {
   $$067 = -1; //@line 3728
  }
  _equeue_mutex_lock($8); //@line 3730
  $161 = HEAP32[$26 >> 2] | 0; //@line 3731
  if (!$161) {
   $$2 = $$067; //@line 3734
  } else {
   $165 = (HEAP32[$161 + 20 >> 2] | 0) - $140 | 0; //@line 3738
   $168 = $165 & ~($165 >> 31); //@line 3741
   $$2 = $168 >>> 0 < $$067 >>> 0 ? $168 : $$067; //@line 3744
  }
  _equeue_mutex_unlock($8); //@line 3746
  _equeue_sema_wait($24, $$2) | 0; //@line 3747
  do {
   if (HEAP8[$10 >> 0] | 0) {
    _equeue_mutex_lock($8); //@line 3752
    if (!(HEAP8[$10 >> 0] | 0)) {
     _equeue_mutex_unlock($8); //@line 3756
     break;
    }
    HEAP8[$10 >> 0] = 0; //@line 3759
    _equeue_mutex_unlock($8); //@line 3760
    return;
   }
  } while (0);
  $174 = _equeue_tick() | 0; //@line 3764
  $ReallocAsyncCtx5 = _emscripten_realloc_async_context(76) | 0; //@line 3765
  _wait_ms(20); //@line 3766
  if (___async) {
   HEAP32[$ReallocAsyncCtx5 >> 2] = 34; //@line 3769
   $175 = $ReallocAsyncCtx5 + 4 | 0; //@line 3770
   HEAP32[$175 >> 2] = $4; //@line 3771
   $176 = $ReallocAsyncCtx5 + 8 | 0; //@line 3772
   HEAP32[$176 >> 2] = $6; //@line 3773
   $177 = $ReallocAsyncCtx5 + 12 | 0; //@line 3774
   HEAP32[$177 >> 2] = $8; //@line 3775
   $178 = $ReallocAsyncCtx5 + 16 | 0; //@line 3776
   HEAP32[$178 >> 2] = $10; //@line 3777
   $179 = $ReallocAsyncCtx5 + 20 | 0; //@line 3778
   HEAP32[$179 >> 2] = $12; //@line 3779
   $180 = $ReallocAsyncCtx5 + 24 | 0; //@line 3780
   HEAP32[$180 >> 2] = $14; //@line 3781
   $181 = $ReallocAsyncCtx5 + 28 | 0; //@line 3782
   HEAP32[$181 >> 2] = $16; //@line 3783
   $182 = $ReallocAsyncCtx5 + 32 | 0; //@line 3784
   HEAP32[$182 >> 2] = $18; //@line 3785
   $183 = $ReallocAsyncCtx5 + 36 | 0; //@line 3786
   HEAP32[$183 >> 2] = $20; //@line 3787
   $184 = $ReallocAsyncCtx5 + 40 | 0; //@line 3788
   $$expand_i1_val35 = $22 & 1; //@line 3789
   HEAP8[$184 >> 0] = $$expand_i1_val35; //@line 3790
   $185 = $ReallocAsyncCtx5 + 44 | 0; //@line 3791
   HEAP32[$185 >> 2] = $24; //@line 3792
   $186 = $ReallocAsyncCtx5 + 48 | 0; //@line 3793
   HEAP32[$186 >> 2] = $26; //@line 3794
   $187 = $ReallocAsyncCtx5 + 52 | 0; //@line 3795
   HEAP32[$187 >> 2] = $28; //@line 3796
   $188 = $ReallocAsyncCtx5 + 56 | 0; //@line 3797
   HEAP32[$188 >> 2] = $30; //@line 3798
   $189 = $ReallocAsyncCtx5 + 60 | 0; //@line 3799
   HEAP32[$189 >> 2] = $32; //@line 3800
   $190 = $ReallocAsyncCtx5 + 64 | 0; //@line 3801
   HEAP32[$190 >> 2] = $34; //@line 3802
   $191 = $ReallocAsyncCtx5 + 68 | 0; //@line 3803
   HEAP32[$191 >> 2] = $36; //@line 3804
   $192 = $ReallocAsyncCtx5 + 72 | 0; //@line 3805
   HEAP32[$192 >> 2] = $174; //@line 3806
   sp = STACKTOP; //@line 3807
   return;
  }
  ___async_unwind = 0; //@line 3810
  HEAP32[$ReallocAsyncCtx5 >> 2] = 34; //@line 3811
  $175 = $ReallocAsyncCtx5 + 4 | 0; //@line 3812
  HEAP32[$175 >> 2] = $4; //@line 3813
  $176 = $ReallocAsyncCtx5 + 8 | 0; //@line 3814
  HEAP32[$176 >> 2] = $6; //@line 3815
  $177 = $ReallocAsyncCtx5 + 12 | 0; //@line 3816
  HEAP32[$177 >> 2] = $8; //@line 3817
  $178 = $ReallocAsyncCtx5 + 16 | 0; //@line 3818
  HEAP32[$178 >> 2] = $10; //@line 3819
  $179 = $ReallocAsyncCtx5 + 20 | 0; //@line 3820
  HEAP32[$179 >> 2] = $12; //@line 3821
  $180 = $ReallocAsyncCtx5 + 24 | 0; //@line 3822
  HEAP32[$180 >> 2] = $14; //@line 3823
  $181 = $ReallocAsyncCtx5 + 28 | 0; //@line 3824
  HEAP32[$181 >> 2] = $16; //@line 3825
  $182 = $ReallocAsyncCtx5 + 32 | 0; //@line 3826
  HEAP32[$182 >> 2] = $18; //@line 3827
  $183 = $ReallocAsyncCtx5 + 36 | 0; //@line 3828
  HEAP32[$183 >> 2] = $20; //@line 3829
  $184 = $ReallocAsyncCtx5 + 40 | 0; //@line 3830
  $$expand_i1_val35 = $22 & 1; //@line 3831
  HEAP8[$184 >> 0] = $$expand_i1_val35; //@line 3832
  $185 = $ReallocAsyncCtx5 + 44 | 0; //@line 3833
  HEAP32[$185 >> 2] = $24; //@line 3834
  $186 = $ReallocAsyncCtx5 + 48 | 0; //@line 3835
  HEAP32[$186 >> 2] = $26; //@line 3836
  $187 = $ReallocAsyncCtx5 + 52 | 0; //@line 3837
  HEAP32[$187 >> 2] = $28; //@line 3838
  $188 = $ReallocAsyncCtx5 + 56 | 0; //@line 3839
  HEAP32[$188 >> 2] = $30; //@line 3840
  $189 = $ReallocAsyncCtx5 + 60 | 0; //@line 3841
  HEAP32[$189 >> 2] = $32; //@line 3842
  $190 = $ReallocAsyncCtx5 + 64 | 0; //@line 3843
  HEAP32[$190 >> 2] = $34; //@line 3844
  $191 = $ReallocAsyncCtx5 + 68 | 0; //@line 3845
  HEAP32[$191 >> 2] = $36; //@line 3846
  $192 = $ReallocAsyncCtx5 + 72 | 0; //@line 3847
  HEAP32[$192 >> 2] = $174; //@line 3848
  sp = STACKTOP; //@line 3849
  return;
 }
}
function _equeue_dispatch__async_cb_24($0) {
 $0 = $0 | 0;
 var $$02329$i$i = 0, $$02330$i$i = 0, $$025$i$i = 0, $$067 = 0, $$2 = 0, $$expand_i1_val = 0, $$expand_i1_val12 = 0, $$expand_i1_val14 = 0, $$expand_i1_val16 = 0, $$reg2mem$0 = 0, $$sink$in$i$i = 0, $10 = 0, $101 = 0, $102 = 0, $103 = 0, $104 = 0, $105 = 0, $106 = 0, $107 = 0, $108 = 0, $109 = 0, $110 = 0, $111 = 0, $112 = 0, $113 = 0, $114 = 0, $115 = 0, $116 = 0, $117 = 0, $118 = 0, $119 = 0, $12 = 0, $120 = 0, $121 = 0, $123 = 0, $124 = 0, $125 = 0, $127 = 0, $128 = 0, $136 = 0, $137 = 0, $139 = 0, $14 = 0, $142 = 0, $144 = 0, $147 = 0, $150 = 0, $154 = 0, $155 = 0, $156 = 0, $157 = 0, $16 = 0, $161 = 0, $164 = 0, $170 = 0, $171 = 0, $172 = 0, $173 = 0, $174 = 0, $175 = 0, $176 = 0, $177 = 0, $178 = 0, $179 = 0, $18 = 0, $180 = 0, $181 = 0, $182 = 0, $183 = 0, $184 = 0, $185 = 0, $186 = 0, $187 = 0, $188 = 0, $20 = 0, $22 = 0, $24 = 0, $26 = 0, $28 = 0, $30 = 0, $32 = 0, $34 = 0, $36 = 0, $37 = 0, $38 = 0, $4 = 0, $40 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0, $64 = 0, $66 = 0, $69 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $78 = 0, $79 = 0, $8 = 0, $80 = 0, $81 = 0, $82 = 0, $83 = 0, $84 = 0, $85 = 0, $86 = 0, $87 = 0, $88 = 0, $89 = 0, $98 = 0, $ReallocAsyncCtx = 0, $ReallocAsyncCtx2 = 0, $ReallocAsyncCtx3 = 0, $ReallocAsyncCtx4 = 0, $ReallocAsyncCtx5 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 3881
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 3885
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 3887
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 3889
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 3891
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 3893
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 3895
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 3897
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 3899
 $20 = HEAP32[$0 + 40 >> 2] | 0; //@line 3901
 $22 = HEAP8[$0 + 44 >> 0] & 1; //@line 3904
 $24 = HEAP32[$0 + 48 >> 2] | 0; //@line 3906
 $26 = HEAP32[$0 + 52 >> 2] | 0; //@line 3908
 $28 = HEAP32[$0 + 56 >> 2] | 0; //@line 3910
 $30 = HEAP32[$0 + 60 >> 2] | 0; //@line 3912
 $32 = HEAP32[$0 + 64 >> 2] | 0; //@line 3914
 $34 = HEAP32[$0 + 68 >> 2] | 0; //@line 3916
 $36 = HEAP32[$0 + 72 >> 2] | 0; //@line 3918
 $$reg2mem$0 = HEAP32[$0 + 4 >> 2] | 0; //@line 3919
 while (1) {
  if (!$$reg2mem$0) {
   label = 24; //@line 3923
   break;
  }
  $37 = $$reg2mem$0 + 8 | 0; //@line 3926
  $38 = HEAP32[$37 >> 2] | 0; //@line 3927
  $40 = HEAP32[$$reg2mem$0 + 32 >> 2] | 0; //@line 3929
  if ($40 | 0) {
   label = 3; //@line 3932
   break;
  }
  $64 = HEAP32[$$reg2mem$0 + 24 >> 2] | 0; //@line 3936
  if (($64 | 0) > -1) {
   label = 7; //@line 3939
   break;
  }
  $88 = $$reg2mem$0 + 4 | 0; //@line 3943
  $89 = HEAP8[$88 >> 0] | 0; //@line 3944
  HEAP8[$88 >> 0] = (($89 + 1 & 255) << HEAP32[$16 >> 2] | 0) == 0 ? 1 : ($89 & 255) + 1 & 255; //@line 3953
  $98 = HEAP32[$$reg2mem$0 + 28 >> 2] | 0; //@line 3955
  if ($98 | 0) {
   label = 12; //@line 3958
   break;
  }
  _equeue_mutex_lock($14); //@line 3961
  $121 = HEAP32[$12 >> 2] | 0; //@line 3962
  L8 : do {
   if (!$121) {
    $$02329$i$i = $12; //@line 3966
    label = 21; //@line 3967
   } else {
    $123 = HEAP32[$$reg2mem$0 >> 2] | 0; //@line 3969
    $$025$i$i = $12; //@line 3970
    $125 = $121; //@line 3970
    while (1) {
     $124 = HEAP32[$125 >> 2] | 0; //@line 3972
     if ($124 >>> 0 >= $123 >>> 0) {
      break;
     }
     $127 = $125 + 8 | 0; //@line 3977
     $128 = HEAP32[$127 >> 2] | 0; //@line 3978
     if (!$128) {
      $$02329$i$i = $127; //@line 3981
      label = 21; //@line 3982
      break L8;
     } else {
      $$025$i$i = $127; //@line 3985
      $125 = $128; //@line 3985
     }
    }
    if (($124 | 0) == ($123 | 0)) {
     HEAP32[$$reg2mem$0 + 12 >> 2] = $125; //@line 3991
     $$02330$i$i = $$025$i$i; //@line 3994
     $$sink$in$i$i = (HEAP32[$$025$i$i >> 2] | 0) + 8 | 0; //@line 3994
    } else {
     $$02329$i$i = $$025$i$i; //@line 3996
     label = 21; //@line 3997
    }
   }
  } while (0);
  if ((label | 0) == 21) {
   label = 0; //@line 4002
   HEAP32[$$reg2mem$0 + 12 >> 2] = 0; //@line 4004
   $$02330$i$i = $$02329$i$i; //@line 4005
   $$sink$in$i$i = $$02329$i$i; //@line 4005
  }
  HEAP32[$37 >> 2] = HEAP32[$$sink$in$i$i >> 2]; //@line 4008
  HEAP32[$$02330$i$i >> 2] = $$reg2mem$0; //@line 4009
  _equeue_mutex_unlock($14); //@line 4010
  $$reg2mem$0 = $38; //@line 4011
 }
 if ((label | 0) == 3) {
  $ReallocAsyncCtx = _emscripten_realloc_async_context(84) | 0; //@line 4015
  FUNCTION_TABLE_vi[$40 & 255]($$reg2mem$0 + 36 | 0); //@line 4016
  if (___async) {
   HEAP32[$ReallocAsyncCtx >> 2] = 30; //@line 4019
   $43 = $ReallocAsyncCtx + 4 | 0; //@line 4020
   HEAP32[$43 >> 2] = $38; //@line 4021
   $44 = $ReallocAsyncCtx + 8 | 0; //@line 4022
   HEAP32[$44 >> 2] = $4; //@line 4023
   $45 = $ReallocAsyncCtx + 12 | 0; //@line 4024
   HEAP32[$45 >> 2] = $6; //@line 4025
   $46 = $ReallocAsyncCtx + 16 | 0; //@line 4026
   HEAP32[$46 >> 2] = $8; //@line 4027
   $47 = $ReallocAsyncCtx + 20 | 0; //@line 4028
   HEAP32[$47 >> 2] = $10; //@line 4029
   $48 = $ReallocAsyncCtx + 24 | 0; //@line 4030
   HEAP32[$48 >> 2] = $12; //@line 4031
   $49 = $ReallocAsyncCtx + 28 | 0; //@line 4032
   HEAP32[$49 >> 2] = $14; //@line 4033
   $50 = $ReallocAsyncCtx + 32 | 0; //@line 4034
   HEAP32[$50 >> 2] = $$reg2mem$0; //@line 4035
   $51 = $ReallocAsyncCtx + 36 | 0; //@line 4036
   HEAP32[$51 >> 2] = $16; //@line 4037
   $52 = $ReallocAsyncCtx + 40 | 0; //@line 4038
   HEAP32[$52 >> 2] = $18; //@line 4039
   $53 = $ReallocAsyncCtx + 44 | 0; //@line 4040
   HEAP32[$53 >> 2] = $20; //@line 4041
   $54 = $ReallocAsyncCtx + 48 | 0; //@line 4042
   $$expand_i1_val = $22 & 1; //@line 4043
   HEAP8[$54 >> 0] = $$expand_i1_val; //@line 4044
   $55 = $ReallocAsyncCtx + 52 | 0; //@line 4045
   HEAP32[$55 >> 2] = $37; //@line 4046
   $56 = $ReallocAsyncCtx + 56 | 0; //@line 4047
   HEAP32[$56 >> 2] = $24; //@line 4048
   $57 = $ReallocAsyncCtx + 60 | 0; //@line 4049
   HEAP32[$57 >> 2] = $26; //@line 4050
   $58 = $ReallocAsyncCtx + 64 | 0; //@line 4051
   HEAP32[$58 >> 2] = $28; //@line 4052
   $59 = $ReallocAsyncCtx + 68 | 0; //@line 4053
   HEAP32[$59 >> 2] = $30; //@line 4054
   $60 = $ReallocAsyncCtx + 72 | 0; //@line 4055
   HEAP32[$60 >> 2] = $32; //@line 4056
   $61 = $ReallocAsyncCtx + 76 | 0; //@line 4057
   HEAP32[$61 >> 2] = $34; //@line 4058
   $62 = $ReallocAsyncCtx + 80 | 0; //@line 4059
   HEAP32[$62 >> 2] = $36; //@line 4060
   sp = STACKTOP; //@line 4061
   return;
  }
  ___async_unwind = 0; //@line 4064
  HEAP32[$ReallocAsyncCtx >> 2] = 30; //@line 4065
  $43 = $ReallocAsyncCtx + 4 | 0; //@line 4066
  HEAP32[$43 >> 2] = $38; //@line 4067
  $44 = $ReallocAsyncCtx + 8 | 0; //@line 4068
  HEAP32[$44 >> 2] = $4; //@line 4069
  $45 = $ReallocAsyncCtx + 12 | 0; //@line 4070
  HEAP32[$45 >> 2] = $6; //@line 4071
  $46 = $ReallocAsyncCtx + 16 | 0; //@line 4072
  HEAP32[$46 >> 2] = $8; //@line 4073
  $47 = $ReallocAsyncCtx + 20 | 0; //@line 4074
  HEAP32[$47 >> 2] = $10; //@line 4075
  $48 = $ReallocAsyncCtx + 24 | 0; //@line 4076
  HEAP32[$48 >> 2] = $12; //@line 4077
  $49 = $ReallocAsyncCtx + 28 | 0; //@line 4078
  HEAP32[$49 >> 2] = $14; //@line 4079
  $50 = $ReallocAsyncCtx + 32 | 0; //@line 4080
  HEAP32[$50 >> 2] = $$reg2mem$0; //@line 4081
  $51 = $ReallocAsyncCtx + 36 | 0; //@line 4082
  HEAP32[$51 >> 2] = $16; //@line 4083
  $52 = $ReallocAsyncCtx + 40 | 0; //@line 4084
  HEAP32[$52 >> 2] = $18; //@line 4085
  $53 = $ReallocAsyncCtx + 44 | 0; //@line 4086
  HEAP32[$53 >> 2] = $20; //@line 4087
  $54 = $ReallocAsyncCtx + 48 | 0; //@line 4088
  $$expand_i1_val = $22 & 1; //@line 4089
  HEAP8[$54 >> 0] = $$expand_i1_val; //@line 4090
  $55 = $ReallocAsyncCtx + 52 | 0; //@line 4091
  HEAP32[$55 >> 2] = $37; //@line 4092
  $56 = $ReallocAsyncCtx + 56 | 0; //@line 4093
  HEAP32[$56 >> 2] = $24; //@line 4094
  $57 = $ReallocAsyncCtx + 60 | 0; //@line 4095
  HEAP32[$57 >> 2] = $26; //@line 4096
  $58 = $ReallocAsyncCtx + 64 | 0; //@line 4097
  HEAP32[$58 >> 2] = $28; //@line 4098
  $59 = $ReallocAsyncCtx + 68 | 0; //@line 4099
  HEAP32[$59 >> 2] = $30; //@line 4100
  $60 = $ReallocAsyncCtx + 72 | 0; //@line 4101
  HEAP32[$60 >> 2] = $32; //@line 4102
  $61 = $ReallocAsyncCtx + 76 | 0; //@line 4103
  HEAP32[$61 >> 2] = $34; //@line 4104
  $62 = $ReallocAsyncCtx + 80 | 0; //@line 4105
  HEAP32[$62 >> 2] = $36; //@line 4106
  sp = STACKTOP; //@line 4107
  return;
 } else if ((label | 0) == 7) {
  $66 = $$reg2mem$0 + 20 | 0; //@line 4111
  HEAP32[$66 >> 2] = (HEAP32[$66 >> 2] | 0) + $64; //@line 4114
  $69 = _equeue_tick() | 0; //@line 4115
  $ReallocAsyncCtx4 = _emscripten_realloc_async_context(76) | 0; //@line 4116
  _equeue_enqueue($18, $$reg2mem$0, $69) | 0; //@line 4117
  if (___async) {
   HEAP32[$ReallocAsyncCtx4 >> 2] = 31; //@line 4120
   $70 = $ReallocAsyncCtx4 + 4 | 0; //@line 4121
   HEAP32[$70 >> 2] = $38; //@line 4122
   $71 = $ReallocAsyncCtx4 + 8 | 0; //@line 4123
   HEAP32[$71 >> 2] = $4; //@line 4124
   $72 = $ReallocAsyncCtx4 + 12 | 0; //@line 4125
   HEAP32[$72 >> 2] = $6; //@line 4126
   $73 = $ReallocAsyncCtx4 + 16 | 0; //@line 4127
   HEAP32[$73 >> 2] = $8; //@line 4128
   $74 = $ReallocAsyncCtx4 + 20 | 0; //@line 4129
   HEAP32[$74 >> 2] = $10; //@line 4130
   $75 = $ReallocAsyncCtx4 + 24 | 0; //@line 4131
   HEAP32[$75 >> 2] = $12; //@line 4132
   $76 = $ReallocAsyncCtx4 + 28 | 0; //@line 4133
   HEAP32[$76 >> 2] = $14; //@line 4134
   $77 = $ReallocAsyncCtx4 + 32 | 0; //@line 4135
   HEAP32[$77 >> 2] = $16; //@line 4136
   $78 = $ReallocAsyncCtx4 + 36 | 0; //@line 4137
   HEAP32[$78 >> 2] = $18; //@line 4138
   $79 = $ReallocAsyncCtx4 + 40 | 0; //@line 4139
   HEAP32[$79 >> 2] = $20; //@line 4140
   $80 = $ReallocAsyncCtx4 + 44 | 0; //@line 4141
   $$expand_i1_val12 = $22 & 1; //@line 4142
   HEAP8[$80 >> 0] = $$expand_i1_val12; //@line 4143
   $81 = $ReallocAsyncCtx4 + 48 | 0; //@line 4144
   HEAP32[$81 >> 2] = $24; //@line 4145
   $82 = $ReallocAsyncCtx4 + 52 | 0; //@line 4146
   HEAP32[$82 >> 2] = $26; //@line 4147
   $83 = $ReallocAsyncCtx4 + 56 | 0; //@line 4148
   HEAP32[$83 >> 2] = $28; //@line 4149
   $84 = $ReallocAsyncCtx4 + 60 | 0; //@line 4150
   HEAP32[$84 >> 2] = $30; //@line 4151
   $85 = $ReallocAsyncCtx4 + 64 | 0; //@line 4152
   HEAP32[$85 >> 2] = $32; //@line 4153
   $86 = $ReallocAsyncCtx4 + 68 | 0; //@line 4154
   HEAP32[$86 >> 2] = $34; //@line 4155
   $87 = $ReallocAsyncCtx4 + 72 | 0; //@line 4156
   HEAP32[$87 >> 2] = $36; //@line 4157
   sp = STACKTOP; //@line 4158
   return;
  }
  ___async_unwind = 0; //@line 4161
  HEAP32[$ReallocAsyncCtx4 >> 2] = 31; //@line 4162
  $70 = $ReallocAsyncCtx4 + 4 | 0; //@line 4163
  HEAP32[$70 >> 2] = $38; //@line 4164
  $71 = $ReallocAsyncCtx4 + 8 | 0; //@line 4165
  HEAP32[$71 >> 2] = $4; //@line 4166
  $72 = $ReallocAsyncCtx4 + 12 | 0; //@line 4167
  HEAP32[$72 >> 2] = $6; //@line 4168
  $73 = $ReallocAsyncCtx4 + 16 | 0; //@line 4169
  HEAP32[$73 >> 2] = $8; //@line 4170
  $74 = $ReallocAsyncCtx4 + 20 | 0; //@line 4171
  HEAP32[$74 >> 2] = $10; //@line 4172
  $75 = $ReallocAsyncCtx4 + 24 | 0; //@line 4173
  HEAP32[$75 >> 2] = $12; //@line 4174
  $76 = $ReallocAsyncCtx4 + 28 | 0; //@line 4175
  HEAP32[$76 >> 2] = $14; //@line 4176
  $77 = $ReallocAsyncCtx4 + 32 | 0; //@line 4177
  HEAP32[$77 >> 2] = $16; //@line 4178
  $78 = $ReallocAsyncCtx4 + 36 | 0; //@line 4179
  HEAP32[$78 >> 2] = $18; //@line 4180
  $79 = $ReallocAsyncCtx4 + 40 | 0; //@line 4181
  HEAP32[$79 >> 2] = $20; //@line 4182
  $80 = $ReallocAsyncCtx4 + 44 | 0; //@line 4183
  $$expand_i1_val12 = $22 & 1; //@line 4184
  HEAP8[$80 >> 0] = $$expand_i1_val12; //@line 4185
  $81 = $ReallocAsyncCtx4 + 48 | 0; //@line 4186
  HEAP32[$81 >> 2] = $24; //@line 4187
  $82 = $ReallocAsyncCtx4 + 52 | 0; //@line 4188
  HEAP32[$82 >> 2] = $26; //@line 4189
  $83 = $ReallocAsyncCtx4 + 56 | 0; //@line 4190
  HEAP32[$83 >> 2] = $28; //@line 4191
  $84 = $ReallocAsyncCtx4 + 60 | 0; //@line 4192
  HEAP32[$84 >> 2] = $30; //@line 4193
  $85 = $ReallocAsyncCtx4 + 64 | 0; //@line 4194
  HEAP32[$85 >> 2] = $32; //@line 4195
  $86 = $ReallocAsyncCtx4 + 68 | 0; //@line 4196
  HEAP32[$86 >> 2] = $34; //@line 4197
  $87 = $ReallocAsyncCtx4 + 72 | 0; //@line 4198
  HEAP32[$87 >> 2] = $36; //@line 4199
  sp = STACKTOP; //@line 4200
  return;
 } else if ((label | 0) == 12) {
  $ReallocAsyncCtx2 = _emscripten_realloc_async_context(84) | 0; //@line 4205
  FUNCTION_TABLE_vi[$98 & 255]($$reg2mem$0 + 36 | 0); //@line 4206
  if (___async) {
   HEAP32[$ReallocAsyncCtx2 >> 2] = 32; //@line 4209
   $101 = $ReallocAsyncCtx2 + 4 | 0; //@line 4210
   HEAP32[$101 >> 2] = $38; //@line 4211
   $102 = $ReallocAsyncCtx2 + 8 | 0; //@line 4212
   HEAP32[$102 >> 2] = $4; //@line 4213
   $103 = $ReallocAsyncCtx2 + 12 | 0; //@line 4214
   HEAP32[$103 >> 2] = $6; //@line 4215
   $104 = $ReallocAsyncCtx2 + 16 | 0; //@line 4216
   HEAP32[$104 >> 2] = $8; //@line 4217
   $105 = $ReallocAsyncCtx2 + 20 | 0; //@line 4218
   HEAP32[$105 >> 2] = $10; //@line 4219
   $106 = $ReallocAsyncCtx2 + 24 | 0; //@line 4220
   HEAP32[$106 >> 2] = $12; //@line 4221
   $107 = $ReallocAsyncCtx2 + 28 | 0; //@line 4222
   HEAP32[$107 >> 2] = $14; //@line 4223
   $108 = $ReallocAsyncCtx2 + 32 | 0; //@line 4224
   HEAP32[$108 >> 2] = $16; //@line 4225
   $109 = $ReallocAsyncCtx2 + 36 | 0; //@line 4226
   HEAP32[$109 >> 2] = $18; //@line 4227
   $110 = $ReallocAsyncCtx2 + 40 | 0; //@line 4228
   HEAP32[$110 >> 2] = $20; //@line 4229
   $111 = $ReallocAsyncCtx2 + 44 | 0; //@line 4230
   $$expand_i1_val14 = $22 & 1; //@line 4231
   HEAP8[$111 >> 0] = $$expand_i1_val14; //@line 4232
   $112 = $ReallocAsyncCtx2 + 48 | 0; //@line 4233
   HEAP32[$112 >> 2] = $24; //@line 4234
   $113 = $ReallocAsyncCtx2 + 52 | 0; //@line 4235
   HEAP32[$113 >> 2] = $26; //@line 4236
   $114 = $ReallocAsyncCtx2 + 56 | 0; //@line 4237
   HEAP32[$114 >> 2] = $28; //@line 4238
   $115 = $ReallocAsyncCtx2 + 60 | 0; //@line 4239
   HEAP32[$115 >> 2] = $30; //@line 4240
   $116 = $ReallocAsyncCtx2 + 64 | 0; //@line 4241
   HEAP32[$116 >> 2] = $32; //@line 4242
   $117 = $ReallocAsyncCtx2 + 68 | 0; //@line 4243
   HEAP32[$117 >> 2] = $34; //@line 4244
   $118 = $ReallocAsyncCtx2 + 72 | 0; //@line 4245
   HEAP32[$118 >> 2] = $36; //@line 4246
   $119 = $ReallocAsyncCtx2 + 76 | 0; //@line 4247
   HEAP32[$119 >> 2] = $$reg2mem$0; //@line 4248
   $120 = $ReallocAsyncCtx2 + 80 | 0; //@line 4249
   HEAP32[$120 >> 2] = $37; //@line 4250
   sp = STACKTOP; //@line 4251
   return;
  }
  ___async_unwind = 0; //@line 4254
  HEAP32[$ReallocAsyncCtx2 >> 2] = 32; //@line 4255
  $101 = $ReallocAsyncCtx2 + 4 | 0; //@line 4256
  HEAP32[$101 >> 2] = $38; //@line 4257
  $102 = $ReallocAsyncCtx2 + 8 | 0; //@line 4258
  HEAP32[$102 >> 2] = $4; //@line 4259
  $103 = $ReallocAsyncCtx2 + 12 | 0; //@line 4260
  HEAP32[$103 >> 2] = $6; //@line 4261
  $104 = $ReallocAsyncCtx2 + 16 | 0; //@line 4262
  HEAP32[$104 >> 2] = $8; //@line 4263
  $105 = $ReallocAsyncCtx2 + 20 | 0; //@line 4264
  HEAP32[$105 >> 2] = $10; //@line 4265
  $106 = $ReallocAsyncCtx2 + 24 | 0; //@line 4266
  HEAP32[$106 >> 2] = $12; //@line 4267
  $107 = $ReallocAsyncCtx2 + 28 | 0; //@line 4268
  HEAP32[$107 >> 2] = $14; //@line 4269
  $108 = $ReallocAsyncCtx2 + 32 | 0; //@line 4270
  HEAP32[$108 >> 2] = $16; //@line 4271
  $109 = $ReallocAsyncCtx2 + 36 | 0; //@line 4272
  HEAP32[$109 >> 2] = $18; //@line 4273
  $110 = $ReallocAsyncCtx2 + 40 | 0; //@line 4274
  HEAP32[$110 >> 2] = $20; //@line 4275
  $111 = $ReallocAsyncCtx2 + 44 | 0; //@line 4276
  $$expand_i1_val14 = $22 & 1; //@line 4277
  HEAP8[$111 >> 0] = $$expand_i1_val14; //@line 4278
  $112 = $ReallocAsyncCtx2 + 48 | 0; //@line 4279
  HEAP32[$112 >> 2] = $24; //@line 4280
  $113 = $ReallocAsyncCtx2 + 52 | 0; //@line 4281
  HEAP32[$113 >> 2] = $26; //@line 4282
  $114 = $ReallocAsyncCtx2 + 56 | 0; //@line 4283
  HEAP32[$114 >> 2] = $28; //@line 4284
  $115 = $ReallocAsyncCtx2 + 60 | 0; //@line 4285
  HEAP32[$115 >> 2] = $30; //@line 4286
  $116 = $ReallocAsyncCtx2 + 64 | 0; //@line 4287
  HEAP32[$116 >> 2] = $32; //@line 4288
  $117 = $ReallocAsyncCtx2 + 68 | 0; //@line 4289
  HEAP32[$117 >> 2] = $34; //@line 4290
  $118 = $ReallocAsyncCtx2 + 72 | 0; //@line 4291
  HEAP32[$118 >> 2] = $36; //@line 4292
  $119 = $ReallocAsyncCtx2 + 76 | 0; //@line 4293
  HEAP32[$119 >> 2] = $$reg2mem$0; //@line 4294
  $120 = $ReallocAsyncCtx2 + 80 | 0; //@line 4295
  HEAP32[$120 >> 2] = $37; //@line 4296
  sp = STACKTOP; //@line 4297
  return;
 } else if ((label | 0) == 24) {
  $136 = _equeue_tick() | 0; //@line 4301
  if ($22) {
   $137 = $20 - $136 | 0; //@line 4303
   if (($137 | 0) < 1) {
    $139 = $18 + 40 | 0; //@line 4306
    if (HEAP32[$139 >> 2] | 0) {
     _equeue_mutex_lock($8); //@line 4310
     $142 = HEAP32[$139 >> 2] | 0; //@line 4311
     if ($142 | 0) {
      $144 = HEAP32[$26 >> 2] | 0; //@line 4314
      if ($144 | 0) {
       $147 = HEAP32[$18 + 44 >> 2] | 0; //@line 4318
       $150 = (HEAP32[$144 + 20 >> 2] | 0) - $136 | 0; //@line 4321
       $ReallocAsyncCtx3 = _emscripten_realloc_async_context(16) | 0; //@line 4325
       FUNCTION_TABLE_vii[$142 & 3]($147, $150 & ~($150 >> 31)); //@line 4326
       if (___async) {
        HEAP32[$ReallocAsyncCtx3 >> 2] = 33; //@line 4329
        $154 = $ReallocAsyncCtx3 + 4 | 0; //@line 4330
        HEAP32[$154 >> 2] = $32; //@line 4331
        $155 = $ReallocAsyncCtx3 + 8 | 0; //@line 4332
        HEAP32[$155 >> 2] = $8; //@line 4333
        $156 = $ReallocAsyncCtx3 + 12 | 0; //@line 4334
        HEAP32[$156 >> 2] = $10; //@line 4335
        sp = STACKTOP; //@line 4336
        return;
       }
       ___async_unwind = 0; //@line 4339
       HEAP32[$ReallocAsyncCtx3 >> 2] = 33; //@line 4340
       $154 = $ReallocAsyncCtx3 + 4 | 0; //@line 4341
       HEAP32[$154 >> 2] = $32; //@line 4342
       $155 = $ReallocAsyncCtx3 + 8 | 0; //@line 4343
       HEAP32[$155 >> 2] = $8; //@line 4344
       $156 = $ReallocAsyncCtx3 + 12 | 0; //@line 4345
       HEAP32[$156 >> 2] = $10; //@line 4346
       sp = STACKTOP; //@line 4347
       return;
      }
     }
     HEAP8[$32 >> 0] = 1; //@line 4351
     _equeue_mutex_unlock($8); //@line 4352
    }
    HEAP8[$10 >> 0] = 0; //@line 4354
    return;
   } else {
    $$067 = $137; //@line 4357
   }
  } else {
   $$067 = -1; //@line 4360
  }
  _equeue_mutex_lock($8); //@line 4362
  $157 = HEAP32[$26 >> 2] | 0; //@line 4363
  if (!$157) {
   $$2 = $$067; //@line 4366
  } else {
   $161 = (HEAP32[$157 + 20 >> 2] | 0) - $136 | 0; //@line 4370
   $164 = $161 & ~($161 >> 31); //@line 4373
   $$2 = $164 >>> 0 < $$067 >>> 0 ? $164 : $$067; //@line 4376
  }
  _equeue_mutex_unlock($8); //@line 4378
  _equeue_sema_wait($24, $$2) | 0; //@line 4379
  do {
   if (HEAP8[$10 >> 0] | 0) {
    _equeue_mutex_lock($8); //@line 4384
    if (!(HEAP8[$10 >> 0] | 0)) {
     _equeue_mutex_unlock($8); //@line 4388
     break;
    }
    HEAP8[$10 >> 0] = 0; //@line 4391
    _equeue_mutex_unlock($8); //@line 4392
    return;
   }
  } while (0);
  $170 = _equeue_tick() | 0; //@line 4396
  $ReallocAsyncCtx5 = _emscripten_realloc_async_context(76) | 0; //@line 4397
  _wait_ms(20); //@line 4398
  if (___async) {
   HEAP32[$ReallocAsyncCtx5 >> 2] = 34; //@line 4401
   $171 = $ReallocAsyncCtx5 + 4 | 0; //@line 4402
   HEAP32[$171 >> 2] = $4; //@line 4403
   $172 = $ReallocAsyncCtx5 + 8 | 0; //@line 4404
   HEAP32[$172 >> 2] = $6; //@line 4405
   $173 = $ReallocAsyncCtx5 + 12 | 0; //@line 4406
   HEAP32[$173 >> 2] = $8; //@line 4407
   $174 = $ReallocAsyncCtx5 + 16 | 0; //@line 4408
   HEAP32[$174 >> 2] = $10; //@line 4409
   $175 = $ReallocAsyncCtx5 + 20 | 0; //@line 4410
   HEAP32[$175 >> 2] = $12; //@line 4411
   $176 = $ReallocAsyncCtx5 + 24 | 0; //@line 4412
   HEAP32[$176 >> 2] = $14; //@line 4413
   $177 = $ReallocAsyncCtx5 + 28 | 0; //@line 4414
   HEAP32[$177 >> 2] = $16; //@line 4415
   $178 = $ReallocAsyncCtx5 + 32 | 0; //@line 4416
   HEAP32[$178 >> 2] = $18; //@line 4417
   $179 = $ReallocAsyncCtx5 + 36 | 0; //@line 4418
   HEAP32[$179 >> 2] = $20; //@line 4419
   $180 = $ReallocAsyncCtx5 + 40 | 0; //@line 4420
   $$expand_i1_val16 = $22 & 1; //@line 4421
   HEAP8[$180 >> 0] = $$expand_i1_val16; //@line 4422
   $181 = $ReallocAsyncCtx5 + 44 | 0; //@line 4423
   HEAP32[$181 >> 2] = $24; //@line 4424
   $182 = $ReallocAsyncCtx5 + 48 | 0; //@line 4425
   HEAP32[$182 >> 2] = $26; //@line 4426
   $183 = $ReallocAsyncCtx5 + 52 | 0; //@line 4427
   HEAP32[$183 >> 2] = $28; //@line 4428
   $184 = $ReallocAsyncCtx5 + 56 | 0; //@line 4429
   HEAP32[$184 >> 2] = $30; //@line 4430
   $185 = $ReallocAsyncCtx5 + 60 | 0; //@line 4431
   HEAP32[$185 >> 2] = $32; //@line 4432
   $186 = $ReallocAsyncCtx5 + 64 | 0; //@line 4433
   HEAP32[$186 >> 2] = $34; //@line 4434
   $187 = $ReallocAsyncCtx5 + 68 | 0; //@line 4435
   HEAP32[$187 >> 2] = $36; //@line 4436
   $188 = $ReallocAsyncCtx5 + 72 | 0; //@line 4437
   HEAP32[$188 >> 2] = $170; //@line 4438
   sp = STACKTOP; //@line 4439
   return;
  }
  ___async_unwind = 0; //@line 4442
  HEAP32[$ReallocAsyncCtx5 >> 2] = 34; //@line 4443
  $171 = $ReallocAsyncCtx5 + 4 | 0; //@line 4444
  HEAP32[$171 >> 2] = $4; //@line 4445
  $172 = $ReallocAsyncCtx5 + 8 | 0; //@line 4446
  HEAP32[$172 >> 2] = $6; //@line 4447
  $173 = $ReallocAsyncCtx5 + 12 | 0; //@line 4448
  HEAP32[$173 >> 2] = $8; //@line 4449
  $174 = $ReallocAsyncCtx5 + 16 | 0; //@line 4450
  HEAP32[$174 >> 2] = $10; //@line 4451
  $175 = $ReallocAsyncCtx5 + 20 | 0; //@line 4452
  HEAP32[$175 >> 2] = $12; //@line 4453
  $176 = $ReallocAsyncCtx5 + 24 | 0; //@line 4454
  HEAP32[$176 >> 2] = $14; //@line 4455
  $177 = $ReallocAsyncCtx5 + 28 | 0; //@line 4456
  HEAP32[$177 >> 2] = $16; //@line 4457
  $178 = $ReallocAsyncCtx5 + 32 | 0; //@line 4458
  HEAP32[$178 >> 2] = $18; //@line 4459
  $179 = $ReallocAsyncCtx5 + 36 | 0; //@line 4460
  HEAP32[$179 >> 2] = $20; //@line 4461
  $180 = $ReallocAsyncCtx5 + 40 | 0; //@line 4462
  $$expand_i1_val16 = $22 & 1; //@line 4463
  HEAP8[$180 >> 0] = $$expand_i1_val16; //@line 4464
  $181 = $ReallocAsyncCtx5 + 44 | 0; //@line 4465
  HEAP32[$181 >> 2] = $24; //@line 4466
  $182 = $ReallocAsyncCtx5 + 48 | 0; //@line 4467
  HEAP32[$182 >> 2] = $26; //@line 4468
  $183 = $ReallocAsyncCtx5 + 52 | 0; //@line 4469
  HEAP32[$183 >> 2] = $28; //@line 4470
  $184 = $ReallocAsyncCtx5 + 56 | 0; //@line 4471
  HEAP32[$184 >> 2] = $30; //@line 4472
  $185 = $ReallocAsyncCtx5 + 60 | 0; //@line 4473
  HEAP32[$185 >> 2] = $32; //@line 4474
  $186 = $ReallocAsyncCtx5 + 64 | 0; //@line 4475
  HEAP32[$186 >> 2] = $34; //@line 4476
  $187 = $ReallocAsyncCtx5 + 68 | 0; //@line 4477
  HEAP32[$187 >> 2] = $36; //@line 4478
  $188 = $ReallocAsyncCtx5 + 72 | 0; //@line 4479
  HEAP32[$188 >> 2] = $170; //@line 4480
  sp = STACKTOP; //@line 4481
  return;
 }
}
function _printf_core($0, $1, $2, $3, $4) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 var $$$5 = 0, $$0 = 0, $$0228 = 0, $$0229316 = 0, $$0232 = 0, $$0235 = 0, $$0237 = 0, $$0240$lcssa = 0, $$0240$lcssa356 = 0, $$0240315 = 0, $$0243 = 0, $$0247 = 0, $$0249$lcssa = 0, $$0249303 = 0, $$0252 = 0, $$0253 = 0, $$0254 = 0, $$0259 = 0, $$0262$lcssa = 0, $$0262309 = 0, $$0269 = 0, $$1 = 0, $$1230327 = 0, $$1233 = 0, $$1236 = 0, $$1238 = 0, $$1241326 = 0, $$1244314 = 0, $$1248 = 0, $$1255 = 0, $$1260 = 0, $$1263 = 0, $$1263$ = 0, $$1270 = 0, $$2 = 0, $$2234 = 0, $$2239 = 0, $$2242$lcssa = 0, $$2242302 = 0, $$2245 = 0, $$2251 = 0, $$2256 = 0, $$2261 = 0, $$2271 = 0, $$3265 = 0, $$3272 = 0, $$3300 = 0, $$4258354 = 0, $$4266 = 0, $$5 = 0, $$6268 = 0, $$lcssa291 = 0, $$lcssa292 = 0, $$pre342 = 0, $$pre345 = 0, $$pre348 = 0, $$sink = 0, $10 = 0, $105 = 0, $106 = 0, $109 = 0, $11 = 0, $112 = 0, $115 = 0, $12 = 0, $125 = 0, $129 = 0, $13 = 0, $14 = 0, $140 = 0, $144 = 0, $151 = 0, $152 = 0, $154 = 0, $156 = 0, $158 = 0, $167 = 0, $168 = 0, $173 = 0, $176 = 0, $181 = 0, $182 = 0, $187 = 0, $189 = 0, $196 = 0, $197 = 0, $20 = 0, $208 = 0, $21 = 0, $220 = 0, $227 = 0, $229 = 0, $23 = 0, $232 = 0, $234 = 0, $24 = 0, $242 = 0, $244 = 0, $247 = 0, $248 = 0, $25 = 0, $252 = 0, $256 = 0, $258 = 0, $261 = 0, $263 = 0, $264 = 0, $265 = 0, $27 = 0, $275 = 0, $276 = 0, $281 = 0, $283 = 0, $284 = 0, $290 = 0, $30 = 0, $302 = 0, $305 = 0, $306 = 0, $318 = 0, $320 = 0, $325 = 0, $329 = 0, $331 = 0, $343 = 0, $345 = 0, $352 = 0, $356 = 0, $36 = 0, $363 = 0, $364 = 0, $365 = 0, $43 = 0, $5 = 0, $51 = 0, $52 = 0, $54 = 0, $6 = 0, $60 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0, $68 = 0, $7 = 0, $79 = 0, $8 = 0, $83 = 0, $9 = 0, $or$cond = 0, $or$cond278 = 0, $storemerge274 = 0, label = 0, sp = 0, $158$looptemp = 0;
 sp = STACKTOP; //@line 8949
 STACKTOP = STACKTOP + 64 | 0; //@line 8950
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(64); //@line 8950
 $5 = sp + 16 | 0; //@line 8951
 $6 = sp; //@line 8952
 $7 = sp + 24 | 0; //@line 8953
 $8 = sp + 8 | 0; //@line 8954
 $9 = sp + 20 | 0; //@line 8955
 HEAP32[$5 >> 2] = $1; //@line 8956
 $10 = ($0 | 0) != 0; //@line 8957
 $11 = $7 + 40 | 0; //@line 8958
 $12 = $11; //@line 8959
 $13 = $7 + 39 | 0; //@line 8960
 $14 = $8 + 4 | 0; //@line 8961
 $$0243 = 0; //@line 8962
 $$0247 = 0; //@line 8962
 $$0269 = 0; //@line 8962
 L1 : while (1) {
  do {
   if (($$0247 | 0) > -1) {
    if (($$0243 | 0) > (2147483647 - $$0247 | 0)) {
     HEAP32[(___errno_location() | 0) >> 2] = 75; //@line 8971
     $$1248 = -1; //@line 8972
     break;
    } else {
     $$1248 = $$0243 + $$0247 | 0; //@line 8976
     break;
    }
   } else {
    $$1248 = $$0247; //@line 8980
   }
  } while (0);
  $20 = HEAP32[$5 >> 2] | 0; //@line 8983
  $21 = HEAP8[$20 >> 0] | 0; //@line 8984
  if (!($21 << 24 >> 24)) {
   label = 88; //@line 8987
   break;
  } else {
   $23 = $21; //@line 8990
   $25 = $20; //@line 8990
  }
  L9 : while (1) {
   switch ($23 << 24 >> 24) {
   case 37:
    {
     $$0249303 = $25; //@line 8995
     $27 = $25; //@line 8995
     label = 9; //@line 8996
     break L9;
     break;
    }
   case 0:
    {
     $$0249$lcssa = $25; //@line 9001
     break L9;
     break;
    }
   default:
    {}
   }
   $24 = $25 + 1 | 0; //@line 9008
   HEAP32[$5 >> 2] = $24; //@line 9009
   $23 = HEAP8[$24 >> 0] | 0; //@line 9011
   $25 = $24; //@line 9011
  }
  L12 : do {
   if ((label | 0) == 9) {
    while (1) {
     label = 0; //@line 9016
     if ((HEAP8[$27 + 1 >> 0] | 0) != 37) {
      $$0249$lcssa = $$0249303; //@line 9021
      break L12;
     }
     $30 = $$0249303 + 1 | 0; //@line 9024
     $27 = $27 + 2 | 0; //@line 9025
     HEAP32[$5 >> 2] = $27; //@line 9026
     if ((HEAP8[$27 >> 0] | 0) != 37) {
      $$0249$lcssa = $30; //@line 9033
      break;
     } else {
      $$0249303 = $30; //@line 9030
      label = 9; //@line 9031
     }
    }
   }
  } while (0);
  $36 = $$0249$lcssa - $20 | 0; //@line 9041
  if ($10) {
   _out_670($0, $20, $36); //@line 9043
  }
  if ($36 | 0) {
   $$0243 = $36; //@line 9047
   $$0247 = $$1248; //@line 9047
   continue;
  }
  $43 = (_isdigit(HEAP8[(HEAP32[$5 >> 2] | 0) + 1 >> 0] | 0) | 0) == 0; //@line 9055
  $$pre342 = HEAP32[$5 >> 2] | 0; //@line 9056
  if ($43) {
   $$0253 = -1; //@line 9058
   $$1270 = $$0269; //@line 9058
   $$sink = 1; //@line 9058
  } else {
   if ((HEAP8[$$pre342 + 2 >> 0] | 0) == 36) {
    $$0253 = (HEAP8[$$pre342 + 1 >> 0] | 0) + -48 | 0; //@line 9068
    $$1270 = 1; //@line 9068
    $$sink = 3; //@line 9068
   } else {
    $$0253 = -1; //@line 9070
    $$1270 = $$0269; //@line 9070
    $$sink = 1; //@line 9070
   }
  }
  $51 = $$pre342 + $$sink | 0; //@line 9073
  HEAP32[$5 >> 2] = $51; //@line 9074
  $52 = HEAP8[$51 >> 0] | 0; //@line 9075
  $54 = ($52 << 24 >> 24) + -32 | 0; //@line 9077
  if ($54 >>> 0 > 31 | (1 << $54 & 75913 | 0) == 0) {
   $$0262$lcssa = 0; //@line 9084
   $$lcssa291 = $52; //@line 9084
   $$lcssa292 = $51; //@line 9084
  } else {
   $$0262309 = 0; //@line 9086
   $60 = $52; //@line 9086
   $65 = $51; //@line 9086
   while (1) {
    $63 = 1 << ($60 << 24 >> 24) + -32 | $$0262309; //@line 9091
    $64 = $65 + 1 | 0; //@line 9092
    HEAP32[$5 >> 2] = $64; //@line 9093
    $66 = HEAP8[$64 >> 0] | 0; //@line 9094
    $68 = ($66 << 24 >> 24) + -32 | 0; //@line 9096
    if ($68 >>> 0 > 31 | (1 << $68 & 75913 | 0) == 0) {
     $$0262$lcssa = $63; //@line 9103
     $$lcssa291 = $66; //@line 9103
     $$lcssa292 = $64; //@line 9103
     break;
    } else {
     $$0262309 = $63; //@line 9106
     $60 = $66; //@line 9106
     $65 = $64; //@line 9106
    }
   }
  }
  if ($$lcssa291 << 24 >> 24 == 42) {
   if (!(_isdigit(HEAP8[$$lcssa292 + 1 >> 0] | 0) | 0)) {
    label = 23; //@line 9118
   } else {
    $79 = HEAP32[$5 >> 2] | 0; //@line 9120
    if ((HEAP8[$79 + 2 >> 0] | 0) == 36) {
     $83 = $79 + 1 | 0; //@line 9125
     HEAP32[$4 + ((HEAP8[$83 >> 0] | 0) + -48 << 2) >> 2] = 10; //@line 9130
     $$0259 = HEAP32[$3 + ((HEAP8[$83 >> 0] | 0) + -48 << 3) >> 2] | 0; //@line 9142
     $$2271 = 1; //@line 9142
     $storemerge274 = $79 + 3 | 0; //@line 9142
    } else {
     label = 23; //@line 9144
    }
   }
   if ((label | 0) == 23) {
    label = 0; //@line 9148
    if ($$1270 | 0) {
     $$0 = -1; //@line 9151
     break;
    }
    if ($10) {
     $105 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 9166
     $106 = HEAP32[$105 >> 2] | 0; //@line 9167
     HEAP32[$2 >> 2] = $105 + 4; //@line 9169
     $363 = $106; //@line 9170
    } else {
     $363 = 0; //@line 9172
    }
    $$0259 = $363; //@line 9176
    $$2271 = 0; //@line 9176
    $storemerge274 = (HEAP32[$5 >> 2] | 0) + 1 | 0; //@line 9176
   }
   HEAP32[$5 >> 2] = $storemerge274; //@line 9178
   $109 = ($$0259 | 0) < 0; //@line 9179
   $$1260 = $109 ? 0 - $$0259 | 0 : $$0259; //@line 9184
   $$1263 = $109 ? $$0262$lcssa | 8192 : $$0262$lcssa; //@line 9184
   $$3272 = $$2271; //@line 9184
   $115 = $storemerge274; //@line 9184
  } else {
   $112 = _getint_671($5) | 0; //@line 9186
   if (($112 | 0) < 0) {
    $$0 = -1; //@line 9189
    break;
   }
   $$1260 = $112; //@line 9193
   $$1263 = $$0262$lcssa; //@line 9193
   $$3272 = $$1270; //@line 9193
   $115 = HEAP32[$5 >> 2] | 0; //@line 9193
  }
  do {
   if ((HEAP8[$115 >> 0] | 0) == 46) {
    if ((HEAP8[$115 + 1 >> 0] | 0) != 42) {
     HEAP32[$5 >> 2] = $115 + 1; //@line 9204
     $156 = _getint_671($5) | 0; //@line 9205
     $$0254 = $156; //@line 9207
     $$pre345 = HEAP32[$5 >> 2] | 0; //@line 9207
     break;
    }
    if (_isdigit(HEAP8[$115 + 2 >> 0] | 0) | 0) {
     $125 = HEAP32[$5 >> 2] | 0; //@line 9216
     if ((HEAP8[$125 + 3 >> 0] | 0) == 36) {
      $129 = $125 + 2 | 0; //@line 9221
      HEAP32[$4 + ((HEAP8[$129 >> 0] | 0) + -48 << 2) >> 2] = 10; //@line 9226
      $140 = HEAP32[$3 + ((HEAP8[$129 >> 0] | 0) + -48 << 3) >> 2] | 0; //@line 9233
      $144 = $125 + 4 | 0; //@line 9237
      HEAP32[$5 >> 2] = $144; //@line 9238
      $$0254 = $140; //@line 9239
      $$pre345 = $144; //@line 9239
      break;
     }
    }
    if ($$3272 | 0) {
     $$0 = -1; //@line 9245
     break L1;
    }
    if ($10) {
     $151 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 9260
     $152 = HEAP32[$151 >> 2] | 0; //@line 9261
     HEAP32[$2 >> 2] = $151 + 4; //@line 9263
     $364 = $152; //@line 9264
    } else {
     $364 = 0; //@line 9266
    }
    $154 = (HEAP32[$5 >> 2] | 0) + 2 | 0; //@line 9269
    HEAP32[$5 >> 2] = $154; //@line 9270
    $$0254 = $364; //@line 9271
    $$pre345 = $154; //@line 9271
   } else {
    $$0254 = -1; //@line 9273
    $$pre345 = $115; //@line 9273
   }
  } while (0);
  $$0252 = 0; //@line 9276
  $158 = $$pre345; //@line 9276
  while (1) {
   if (((HEAP8[$158 >> 0] | 0) + -65 | 0) >>> 0 > 57) {
    $$0 = -1; //@line 9283
    break L1;
   }
   $158$looptemp = $158;
   $158 = $158 + 1 | 0; //@line 9286
   HEAP32[$5 >> 2] = $158; //@line 9287
   $167 = HEAP8[(HEAP8[$158$looptemp >> 0] | 0) + -65 + (2772 + ($$0252 * 58 | 0)) >> 0] | 0; //@line 9292
   $168 = $167 & 255; //@line 9293
   if (($168 + -1 | 0) >>> 0 >= 8) {
    break;
   } else {
    $$0252 = $168; //@line 9297
   }
  }
  if (!($167 << 24 >> 24)) {
   $$0 = -1; //@line 9304
   break;
  }
  $173 = ($$0253 | 0) > -1; //@line 9308
  do {
   if ($167 << 24 >> 24 == 19) {
    if ($173) {
     $$0 = -1; //@line 9312
     break L1;
    } else {
     label = 50; //@line 9315
    }
   } else {
    if ($173) {
     HEAP32[$4 + ($$0253 << 2) >> 2] = $168; //@line 9320
     $176 = $3 + ($$0253 << 3) | 0; //@line 9322
     $181 = HEAP32[$176 + 4 >> 2] | 0; //@line 9327
     $182 = $6; //@line 9328
     HEAP32[$182 >> 2] = HEAP32[$176 >> 2]; //@line 9330
     HEAP32[$182 + 4 >> 2] = $181; //@line 9333
     label = 50; //@line 9334
     break;
    }
    if (!$10) {
     $$0 = 0; //@line 9338
     break L1;
    }
    _pop_arg_673($6, $168, $2); //@line 9341
    $187 = HEAP32[$5 >> 2] | 0; //@line 9343
   }
  } while (0);
  if ((label | 0) == 50) {
   label = 0; //@line 9347
   if ($10) {
    $187 = $158; //@line 9349
   } else {
    $$0243 = 0; //@line 9351
    $$0247 = $$1248; //@line 9351
    $$0269 = $$3272; //@line 9351
    continue;
   }
  }
  $189 = HEAP8[$187 + -1 >> 0] | 0; //@line 9357
  $$0235 = ($$0252 | 0) != 0 & ($189 & 15 | 0) == 3 ? $189 & -33 : $189; //@line 9363
  $196 = $$1263 & -65537; //@line 9366
  $$1263$ = ($$1263 & 8192 | 0) == 0 ? $$1263 : $196; //@line 9367
  L73 : do {
   switch ($$0235 | 0) {
   case 110:
    {
     switch (($$0252 & 255) << 24 >> 24) {
     case 0:
      {
       HEAP32[HEAP32[$6 >> 2] >> 2] = $$1248; //@line 9375
       $$0243 = 0; //@line 9376
       $$0247 = $$1248; //@line 9376
       $$0269 = $$3272; //@line 9376
       continue L1;
       break;
      }
     case 1:
      {
       HEAP32[HEAP32[$6 >> 2] >> 2] = $$1248; //@line 9382
       $$0243 = 0; //@line 9383
       $$0247 = $$1248; //@line 9383
       $$0269 = $$3272; //@line 9383
       continue L1;
       break;
      }
     case 2:
      {
       $208 = HEAP32[$6 >> 2] | 0; //@line 9391
       HEAP32[$208 >> 2] = $$1248; //@line 9393
       HEAP32[$208 + 4 >> 2] = (($$1248 | 0) < 0) << 31 >> 31; //@line 9396
       $$0243 = 0; //@line 9397
       $$0247 = $$1248; //@line 9397
       $$0269 = $$3272; //@line 9397
       continue L1;
       break;
      }
     case 3:
      {
       HEAP16[HEAP32[$6 >> 2] >> 1] = $$1248; //@line 9404
       $$0243 = 0; //@line 9405
       $$0247 = $$1248; //@line 9405
       $$0269 = $$3272; //@line 9405
       continue L1;
       break;
      }
     case 4:
      {
       HEAP8[HEAP32[$6 >> 2] >> 0] = $$1248; //@line 9412
       $$0243 = 0; //@line 9413
       $$0247 = $$1248; //@line 9413
       $$0269 = $$3272; //@line 9413
       continue L1;
       break;
      }
     case 6:
      {
       HEAP32[HEAP32[$6 >> 2] >> 2] = $$1248; //@line 9419
       $$0243 = 0; //@line 9420
       $$0247 = $$1248; //@line 9420
       $$0269 = $$3272; //@line 9420
       continue L1;
       break;
      }
     case 7:
      {
       $220 = HEAP32[$6 >> 2] | 0; //@line 9428
       HEAP32[$220 >> 2] = $$1248; //@line 9430
       HEAP32[$220 + 4 >> 2] = (($$1248 | 0) < 0) << 31 >> 31; //@line 9433
       $$0243 = 0; //@line 9434
       $$0247 = $$1248; //@line 9434
       $$0269 = $$3272; //@line 9434
       continue L1;
       break;
      }
     default:
      {
       $$0243 = 0; //@line 9439
       $$0247 = $$1248; //@line 9439
       $$0269 = $$3272; //@line 9439
       continue L1;
      }
     }
     break;
    }
   case 112:
    {
     $$1236 = 120; //@line 9449
     $$1255 = $$0254 >>> 0 > 8 ? $$0254 : 8; //@line 9449
     $$3265 = $$1263$ | 8; //@line 9449
     label = 62; //@line 9450
     break;
    }
   case 88:
   case 120:
    {
     $$1236 = $$0235; //@line 9454
     $$1255 = $$0254; //@line 9454
     $$3265 = $$1263$; //@line 9454
     label = 62; //@line 9455
     break;
    }
   case 111:
    {
     $242 = $6; //@line 9459
     $244 = HEAP32[$242 >> 2] | 0; //@line 9461
     $247 = HEAP32[$242 + 4 >> 2] | 0; //@line 9464
     $248 = _fmt_o($244, $247, $11) | 0; //@line 9465
     $252 = $12 - $248 | 0; //@line 9469
     $$0228 = $248; //@line 9474
     $$1233 = 0; //@line 9474
     $$1238 = 3236; //@line 9474
     $$2256 = ($$1263$ & 8 | 0) == 0 | ($$0254 | 0) > ($252 | 0) ? $$0254 : $252 + 1 | 0; //@line 9474
     $$4266 = $$1263$; //@line 9474
     $281 = $244; //@line 9474
     $283 = $247; //@line 9474
     label = 68; //@line 9475
     break;
    }
   case 105:
   case 100:
    {
     $256 = $6; //@line 9479
     $258 = HEAP32[$256 >> 2] | 0; //@line 9481
     $261 = HEAP32[$256 + 4 >> 2] | 0; //@line 9484
     if (($261 | 0) < 0) {
      $263 = _i64Subtract(0, 0, $258 | 0, $261 | 0) | 0; //@line 9487
      $264 = tempRet0; //@line 9488
      $265 = $6; //@line 9489
      HEAP32[$265 >> 2] = $263; //@line 9491
      HEAP32[$265 + 4 >> 2] = $264; //@line 9494
      $$0232 = 1; //@line 9495
      $$0237 = 3236; //@line 9495
      $275 = $263; //@line 9495
      $276 = $264; //@line 9495
      label = 67; //@line 9496
      break L73;
     } else {
      $$0232 = ($$1263$ & 2049 | 0) != 0 & 1; //@line 9508
      $$0237 = ($$1263$ & 2048 | 0) == 0 ? ($$1263$ & 1 | 0) == 0 ? 3236 : 3238 : 3237; //@line 9508
      $275 = $258; //@line 9508
      $276 = $261; //@line 9508
      label = 67; //@line 9509
      break L73;
     }
     break;
    }
   case 117:
    {
     $197 = $6; //@line 9515
     $$0232 = 0; //@line 9521
     $$0237 = 3236; //@line 9521
     $275 = HEAP32[$197 >> 2] | 0; //@line 9521
     $276 = HEAP32[$197 + 4 >> 2] | 0; //@line 9521
     label = 67; //@line 9522
     break;
    }
   case 99:
    {
     HEAP8[$13 >> 0] = HEAP32[$6 >> 2]; //@line 9533
     $$2 = $13; //@line 9534
     $$2234 = 0; //@line 9534
     $$2239 = 3236; //@line 9534
     $$2251 = $11; //@line 9534
     $$5 = 1; //@line 9534
     $$6268 = $196; //@line 9534
     break;
    }
   case 109:
    {
     $$1 = _strerror(HEAP32[(___errno_location() | 0) >> 2] | 0) | 0; //@line 9541
     label = 72; //@line 9542
     break;
    }
   case 115:
    {
     $302 = HEAP32[$6 >> 2] | 0; //@line 9546
     $$1 = $302 | 0 ? $302 : 3246; //@line 9549
     label = 72; //@line 9550
     break;
    }
   case 67:
    {
     HEAP32[$8 >> 2] = HEAP32[$6 >> 2]; //@line 9560
     HEAP32[$14 >> 2] = 0; //@line 9561
     HEAP32[$6 >> 2] = $8; //@line 9562
     $$4258354 = -1; //@line 9563
     $365 = $8; //@line 9563
     label = 76; //@line 9564
     break;
    }
   case 83:
    {
     $$pre348 = HEAP32[$6 >> 2] | 0; //@line 9568
     if (!$$0254) {
      _pad_676($0, 32, $$1260, 0, $$1263$); //@line 9571
      $$0240$lcssa356 = 0; //@line 9572
      label = 85; //@line 9573
     } else {
      $$4258354 = $$0254; //@line 9575
      $365 = $$pre348; //@line 9575
      label = 76; //@line 9576
     }
     break;
    }
   case 65:
   case 71:
   case 70:
   case 69:
   case 97:
   case 103:
   case 102:
   case 101:
    {
     $$0243 = _fmt_fp($0, +HEAPF64[$6 >> 3], $$1260, $$0254, $$1263$, $$0235) | 0; //@line 9583
     $$0247 = $$1248; //@line 9583
     $$0269 = $$3272; //@line 9583
     continue L1;
     break;
    }
   default:
    {
     $$2 = $20; //@line 9588
     $$2234 = 0; //@line 9588
     $$2239 = 3236; //@line 9588
     $$2251 = $11; //@line 9588
     $$5 = $$0254; //@line 9588
     $$6268 = $$1263$; //@line 9588
    }
   }
  } while (0);
  L97 : do {
   if ((label | 0) == 62) {
    label = 0; //@line 9594
    $227 = $6; //@line 9595
    $229 = HEAP32[$227 >> 2] | 0; //@line 9597
    $232 = HEAP32[$227 + 4 >> 2] | 0; //@line 9600
    $234 = _fmt_x($229, $232, $11, $$1236 & 32) | 0; //@line 9602
    $or$cond278 = ($$3265 & 8 | 0) == 0 | ($229 | 0) == 0 & ($232 | 0) == 0; //@line 9608
    $$0228 = $234; //@line 9613
    $$1233 = $or$cond278 ? 0 : 2; //@line 9613
    $$1238 = $or$cond278 ? 3236 : 3236 + ($$1236 >> 4) | 0; //@line 9613
    $$2256 = $$1255; //@line 9613
    $$4266 = $$3265; //@line 9613
    $281 = $229; //@line 9613
    $283 = $232; //@line 9613
    label = 68; //@line 9614
   } else if ((label | 0) == 67) {
    label = 0; //@line 9617
    $$0228 = _fmt_u($275, $276, $11) | 0; //@line 9619
    $$1233 = $$0232; //@line 9619
    $$1238 = $$0237; //@line 9619
    $$2256 = $$0254; //@line 9619
    $$4266 = $$1263$; //@line 9619
    $281 = $275; //@line 9619
    $283 = $276; //@line 9619
    label = 68; //@line 9620
   } else if ((label | 0) == 72) {
    label = 0; //@line 9623
    $305 = _memchr($$1, 0, $$0254) | 0; //@line 9624
    $306 = ($305 | 0) == 0; //@line 9625
    $$2 = $$1; //@line 9632
    $$2234 = 0; //@line 9632
    $$2239 = 3236; //@line 9632
    $$2251 = $306 ? $$1 + $$0254 | 0 : $305; //@line 9632
    $$5 = $306 ? $$0254 : $305 - $$1 | 0; //@line 9632
    $$6268 = $196; //@line 9632
   } else if ((label | 0) == 76) {
    label = 0; //@line 9635
    $$0229316 = $365; //@line 9636
    $$0240315 = 0; //@line 9636
    $$1244314 = 0; //@line 9636
    while (1) {
     $318 = HEAP32[$$0229316 >> 2] | 0; //@line 9638
     if (!$318) {
      $$0240$lcssa = $$0240315; //@line 9641
      $$2245 = $$1244314; //@line 9641
      break;
     }
     $320 = _wctomb($9, $318) | 0; //@line 9644
     if (($320 | 0) < 0 | $320 >>> 0 > ($$4258354 - $$0240315 | 0) >>> 0) {
      $$0240$lcssa = $$0240315; //@line 9650
      $$2245 = $320; //@line 9650
      break;
     }
     $325 = $320 + $$0240315 | 0; //@line 9654
     if ($$4258354 >>> 0 > $325 >>> 0) {
      $$0229316 = $$0229316 + 4 | 0; //@line 9657
      $$0240315 = $325; //@line 9657
      $$1244314 = $320; //@line 9657
     } else {
      $$0240$lcssa = $325; //@line 9659
      $$2245 = $320; //@line 9659
      break;
     }
    }
    if (($$2245 | 0) < 0) {
     $$0 = -1; //@line 9665
     break L1;
    }
    _pad_676($0, 32, $$1260, $$0240$lcssa, $$1263$); //@line 9668
    if (!$$0240$lcssa) {
     $$0240$lcssa356 = 0; //@line 9671
     label = 85; //@line 9672
    } else {
     $$1230327 = $365; //@line 9674
     $$1241326 = 0; //@line 9674
     while (1) {
      $329 = HEAP32[$$1230327 >> 2] | 0; //@line 9676
      if (!$329) {
       $$0240$lcssa356 = $$0240$lcssa; //@line 9679
       label = 85; //@line 9680
       break L97;
      }
      $331 = _wctomb($9, $329) | 0; //@line 9683
      $$1241326 = $331 + $$1241326 | 0; //@line 9684
      if (($$1241326 | 0) > ($$0240$lcssa | 0)) {
       $$0240$lcssa356 = $$0240$lcssa; //@line 9687
       label = 85; //@line 9688
       break L97;
      }
      _out_670($0, $9, $331); //@line 9692
      if ($$1241326 >>> 0 >= $$0240$lcssa >>> 0) {
       $$0240$lcssa356 = $$0240$lcssa; //@line 9697
       label = 85; //@line 9698
       break;
      } else {
       $$1230327 = $$1230327 + 4 | 0; //@line 9695
      }
     }
    }
   }
  } while (0);
  if ((label | 0) == 68) {
   label = 0; //@line 9706
   $284 = ($281 | 0) != 0 | ($283 | 0) != 0; //@line 9712
   $or$cond = ($$2256 | 0) != 0 | $284; //@line 9714
   $290 = $12 - $$0228 + (($284 ^ 1) & 1) | 0; //@line 9719
   $$2 = $or$cond ? $$0228 : $11; //@line 9724
   $$2234 = $$1233; //@line 9724
   $$2239 = $$1238; //@line 9724
   $$2251 = $11; //@line 9724
   $$5 = $or$cond ? ($$2256 | 0) > ($290 | 0) ? $$2256 : $290 : $$2256; //@line 9724
   $$6268 = ($$2256 | 0) > -1 ? $$4266 & -65537 : $$4266; //@line 9724
  } else if ((label | 0) == 85) {
   label = 0; //@line 9727
   _pad_676($0, 32, $$1260, $$0240$lcssa356, $$1263$ ^ 8192); //@line 9729
   $$0243 = ($$1260 | 0) > ($$0240$lcssa356 | 0) ? $$1260 : $$0240$lcssa356; //@line 9732
   $$0247 = $$1248; //@line 9732
   $$0269 = $$3272; //@line 9732
   continue;
  }
  $343 = $$2251 - $$2 | 0; //@line 9737
  $$$5 = ($$5 | 0) < ($343 | 0) ? $343 : $$5; //@line 9739
  $345 = $$$5 + $$2234 | 0; //@line 9740
  $$2261 = ($$1260 | 0) < ($345 | 0) ? $345 : $$1260; //@line 9742
  _pad_676($0, 32, $$2261, $345, $$6268); //@line 9743
  _out_670($0, $$2239, $$2234); //@line 9744
  _pad_676($0, 48, $$2261, $345, $$6268 ^ 65536); //@line 9746
  _pad_676($0, 48, $$$5, $343, 0); //@line 9747
  _out_670($0, $$2, $343); //@line 9748
  _pad_676($0, 32, $$2261, $345, $$6268 ^ 8192); //@line 9750
  $$0243 = $$2261; //@line 9751
  $$0247 = $$1248; //@line 9751
  $$0269 = $$3272; //@line 9751
 }
 L116 : do {
  if ((label | 0) == 88) {
   if (!$0) {
    if (!$$0269) {
     $$0 = 0; //@line 9759
    } else {
     $$2242302 = 1; //@line 9761
     while (1) {
      $352 = HEAP32[$4 + ($$2242302 << 2) >> 2] | 0; //@line 9764
      if (!$352) {
       $$2242$lcssa = $$2242302; //@line 9767
       break;
      }
      _pop_arg_673($3 + ($$2242302 << 3) | 0, $352, $2); //@line 9771
      $356 = $$2242302 + 1 | 0; //@line 9772
      if (($$2242302 | 0) < 9) {
       $$2242302 = $356; //@line 9775
      } else {
       $$2242$lcssa = $356; //@line 9777
       break;
      }
     }
     if (($$2242$lcssa | 0) < 10) {
      $$3300 = $$2242$lcssa; //@line 9783
      while (1) {
       if (HEAP32[$4 + ($$3300 << 2) >> 2] | 0) {
        $$0 = -1; //@line 9789
        break L116;
       }
       if (($$3300 | 0) < 9) {
        $$3300 = $$3300 + 1 | 0; //@line 9795
       } else {
        $$0 = 1; //@line 9797
        break;
       }
      }
     } else {
      $$0 = 1; //@line 9802
     }
    }
   } else {
    $$0 = $$1248; //@line 9806
   }
  }
 } while (0);
 STACKTOP = sp; //@line 9810
 return $$0 | 0; //@line 9810
}
function _mbed_vtracef($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $$ = 0, $$0$i = 0, $$0141 = 0, $$0142 = 0, $$0144 = 0, $$0199 = 0, $$1$off0 = 0, $$10 = 0, $$1143 = 0, $$1145 = 0, $$1152 = 0, $$1152$ = 0, $$13 = 0, $$18 = 0, $$3 = 0, $$3147 = 0, $$3147168 = 0, $$3154 = 0, $$3169 = 0, $$5156 = 0, $$5156$ = 0, $$6 = 0, $$6150 = 0, $$9 = 0, $$lobit = 0, $$pre = 0, $$sink = 0, $125 = 0, $126 = 0, $151 = 0, $157 = 0, $168 = 0, $169 = 0, $171 = 0, $181 = 0, $182 = 0, $184 = 0, $186 = 0, $194 = 0, $201 = 0, $202 = 0, $204 = 0, $206 = 0, $209 = 0, $34 = 0, $38 = 0, $4 = 0, $43 = 0, $5 = 0, $54 = 0, $55 = 0, $59 = 0, $60 = 0, $64 = 0, $65 = 0, $66 = 0, $67 = 0, $69 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $76 = 0, $78 = 0, $82 = 0, $89 = 0, $95 = 0, $AsyncCtx = 0, $AsyncCtx27 = 0, $AsyncCtx30 = 0, $AsyncCtx34 = 0, $AsyncCtx38 = 0, $AsyncCtx42 = 0, $AsyncCtx45 = 0, $AsyncCtx49 = 0, $AsyncCtx52 = 0, $AsyncCtx56 = 0, $AsyncCtx60 = 0, $AsyncCtx64 = 0, $extract$t159 = 0, $vararg_buffer = 0, $vararg_buffer1 = 0, $vararg_buffer12 = 0, $vararg_buffer15 = 0, $vararg_buffer18 = 0, $vararg_buffer20 = 0, $vararg_buffer23 = 0, $vararg_buffer3 = 0, $vararg_buffer6 = 0, $vararg_buffer9 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 1820
 STACKTOP = STACKTOP + 96 | 0; //@line 1821
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(96); //@line 1821
 $vararg_buffer23 = sp + 72 | 0; //@line 1822
 $vararg_buffer20 = sp + 64 | 0; //@line 1823
 $vararg_buffer18 = sp + 56 | 0; //@line 1824
 $vararg_buffer15 = sp + 48 | 0; //@line 1825
 $vararg_buffer12 = sp + 40 | 0; //@line 1826
 $vararg_buffer9 = sp + 32 | 0; //@line 1827
 $vararg_buffer6 = sp + 24 | 0; //@line 1828
 $vararg_buffer3 = sp + 16 | 0; //@line 1829
 $vararg_buffer1 = sp + 8 | 0; //@line 1830
 $vararg_buffer = sp; //@line 1831
 $4 = sp + 80 | 0; //@line 1832
 $5 = HEAP32[61] | 0; //@line 1833
 do {
  if ($5 | 0) {
   $AsyncCtx = _emscripten_alloc_async_context(104, sp) | 0; //@line 1837
   FUNCTION_TABLE_v[$5 & 3](); //@line 1838
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 37; //@line 1841
    HEAP32[$AsyncCtx + 4 >> 2] = $vararg_buffer; //@line 1843
    HEAP32[$AsyncCtx + 8 >> 2] = $vararg_buffer; //@line 1845
    HEAP32[$AsyncCtx + 12 >> 2] = $vararg_buffer1; //@line 1847
    HEAP32[$AsyncCtx + 16 >> 2] = $vararg_buffer1; //@line 1849
    HEAP32[$AsyncCtx + 20 >> 2] = $4; //@line 1851
    HEAP32[$AsyncCtx + 24 >> 2] = $3; //@line 1853
    HEAP32[$AsyncCtx + 28 >> 2] = $2; //@line 1855
    HEAP32[$AsyncCtx + 32 >> 2] = $vararg_buffer20; //@line 1857
    HEAP32[$AsyncCtx + 36 >> 2] = $vararg_buffer20; //@line 1859
    HEAP32[$AsyncCtx + 40 >> 2] = $vararg_buffer9; //@line 1861
    HEAP32[$AsyncCtx + 44 >> 2] = $1; //@line 1863
    HEAP32[$AsyncCtx + 48 >> 2] = $vararg_buffer9; //@line 1865
    HEAP32[$AsyncCtx + 52 >> 2] = $vararg_buffer6; //@line 1867
    HEAP32[$AsyncCtx + 56 >> 2] = $vararg_buffer6; //@line 1869
    HEAP8[$AsyncCtx + 60 >> 0] = $0; //@line 1871
    HEAP32[$AsyncCtx + 64 >> 2] = $vararg_buffer12; //@line 1873
    HEAP32[$AsyncCtx + 68 >> 2] = $vararg_buffer12; //@line 1875
    HEAP32[$AsyncCtx + 72 >> 2] = $vararg_buffer15; //@line 1877
    HEAP32[$AsyncCtx + 76 >> 2] = $vararg_buffer15; //@line 1879
    HEAP32[$AsyncCtx + 80 >> 2] = $vararg_buffer18; //@line 1881
    HEAP32[$AsyncCtx + 84 >> 2] = $vararg_buffer18; //@line 1883
    HEAP32[$AsyncCtx + 88 >> 2] = $vararg_buffer3; //@line 1885
    HEAP32[$AsyncCtx + 92 >> 2] = $vararg_buffer3; //@line 1887
    HEAP32[$AsyncCtx + 96 >> 2] = $vararg_buffer23; //@line 1889
    HEAP32[$AsyncCtx + 100 >> 2] = $vararg_buffer23; //@line 1891
    sp = STACKTOP; //@line 1892
    STACKTOP = sp; //@line 1893
    return;
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 1895
    HEAP32[63] = (HEAP32[63] | 0) + 1; //@line 1898
    break;
   }
  }
 } while (0);
 $34 = HEAP32[52] | 0; //@line 1903
 do {
  if ($34 | 0) {
   HEAP8[$34 >> 0] = 0; //@line 1907
   do {
    if ($0 << 24 >> 24 > -1 & ($1 | 0) != 0) {
     $38 = HEAP32[49] | 0; //@line 1913
     if (HEAP8[$38 >> 0] | 0) {
      if (_strstr($38, $1) | 0) {
       $$0$i = 1; //@line 1920
       break;
      }
     }
     $43 = HEAP32[50] | 0; //@line 1924
     if (!(HEAP8[$43 >> 0] | 0)) {
      label = 11; //@line 1928
     } else {
      if (!(_strstr($43, $1) | 0)) {
       $$0$i = 1; //@line 1933
      } else {
       label = 11; //@line 1935
      }
     }
    } else {
     label = 11; //@line 1939
    }
   } while (0);
   if ((label | 0) == 11) {
    $$0$i = 0; //@line 1943
   }
   if (!((HEAP32[59] | 0) != 0 & ((($1 | 0) == 0 | (($2 | 0) == 0 | $$0$i)) ^ 1))) {
    HEAP32[56] = HEAP32[54]; //@line 1955
    break;
   }
   $54 = HEAPU8[192] | 0; //@line 1959
   $55 = $0 & 255; //@line 1960
   if ($55 & 31 & $54 | 0) {
    $59 = $54 & 64; //@line 1965
    $$lobit = $59 >>> 6; //@line 1966
    $60 = $$lobit & 255; //@line 1967
    $64 = ($54 & 32 | 0) == 0; //@line 1971
    $65 = HEAP32[53] | 0; //@line 1972
    $66 = HEAP32[52] | 0; //@line 1973
    $67 = $0 << 24 >> 24 == 1; //@line 1974
    do {
     if ($67 | ($54 & 128 | 0) != 0) {
      $AsyncCtx64 = _emscripten_alloc_async_context(8, sp) | 0; //@line 1978
      _vsnprintf($66, $65, $2, $3) | 0; //@line 1979
      if (___async) {
       HEAP32[$AsyncCtx64 >> 2] = 38; //@line 1982
       HEAP8[$AsyncCtx64 + 4 >> 0] = $67 & 1; //@line 1985
       sp = STACKTOP; //@line 1986
       STACKTOP = sp; //@line 1987
       return;
      }
      _emscripten_free_async_context($AsyncCtx64 | 0); //@line 1989
      $69 = HEAP32[60] | 0; //@line 1990
      if (!($67 & ($69 | 0) != 0)) {
       $73 = HEAP32[59] | 0; //@line 1994
       $74 = HEAP32[52] | 0; //@line 1995
       $AsyncCtx34 = _emscripten_alloc_async_context(4, sp) | 0; //@line 1996
       FUNCTION_TABLE_vi[$73 & 255]($74); //@line 1997
       if (___async) {
        HEAP32[$AsyncCtx34 >> 2] = 41; //@line 2000
        sp = STACKTOP; //@line 2001
        STACKTOP = sp; //@line 2002
        return;
       } else {
        _emscripten_free_async_context($AsyncCtx34 | 0); //@line 2004
        break;
       }
      }
      $71 = HEAP32[52] | 0; //@line 2008
      $AsyncCtx27 = _emscripten_alloc_async_context(4, sp) | 0; //@line 2009
      FUNCTION_TABLE_vi[$69 & 255]($71); //@line 2010
      if (___async) {
       HEAP32[$AsyncCtx27 >> 2] = 39; //@line 2013
       sp = STACKTOP; //@line 2014
       STACKTOP = sp; //@line 2015
       return;
      }
      _emscripten_free_async_context($AsyncCtx27 | 0); //@line 2017
      $72 = HEAP32[60] | 0; //@line 2018
      $AsyncCtx30 = _emscripten_alloc_async_context(4, sp) | 0; //@line 2019
      FUNCTION_TABLE_vi[$72 & 255](1375); //@line 2020
      if (___async) {
       HEAP32[$AsyncCtx30 >> 2] = 40; //@line 2023
       sp = STACKTOP; //@line 2024
       STACKTOP = sp; //@line 2025
       return;
      } else {
       _emscripten_free_async_context($AsyncCtx30 | 0); //@line 2027
       break;
      }
     } else {
      if (!$59) {
       $$1$off0 = ($$lobit | 0) != 0; //@line 2034
       $$1143 = $66; //@line 2034
       $$1145 = $65; //@line 2034
       $$3154 = 0; //@line 2034
       label = 38; //@line 2035
      } else {
       if ($64) {
        $$0142 = $66; //@line 2038
        $$0144 = $65; //@line 2038
       } else {
        $76 = _snprintf($66, $65, 1377, $vararg_buffer) | 0; //@line 2040
        $$ = ($76 | 0) >= ($65 | 0) ? 0 : $76; //@line 2042
        $78 = ($$ | 0) > 0; //@line 2043
        $$0142 = $78 ? $66 + $$ | 0 : $66; //@line 2048
        $$0144 = $65 - ($78 ? $$ : 0) | 0; //@line 2048
       }
       if (($$0144 | 0) > 0) {
        $82 = $55 + -2 | 0; //@line 2052
        switch ($82 >>> 1 | $82 << 31 | 0) {
        case 0:
         {
          $$sink = 1395; //@line 2058
          label = 35; //@line 2059
          break;
         }
        case 1:
         {
          $$sink = 1401; //@line 2063
          label = 35; //@line 2064
          break;
         }
        case 3:
         {
          $$sink = 1389; //@line 2068
          label = 35; //@line 2069
          break;
         }
        case 7:
         {
          $$sink = 1383; //@line 2073
          label = 35; //@line 2074
          break;
         }
        default:
         {
          $$0141 = 0; //@line 2078
          $$1152 = 0; //@line 2078
         }
        }
        if ((label | 0) == 35) {
         HEAP32[$vararg_buffer1 >> 2] = $$sink; //@line 2082
         $$0141 = $60 & 1; //@line 2085
         $$1152 = _snprintf($$0142, $$0144, 1407, $vararg_buffer1) | 0; //@line 2085
        }
        $$1152$ = ($$1152 | 0) < ($$0144 | 0) ? $$1152 : 0; //@line 2088
        $extract$t159 = $$0141 << 24 >> 24 != 0; //@line 2090
        if (($$1152$ | 0) > 0) {
         $89 = $$0141 << 24 >> 24 == 0; //@line 2092
         $$1$off0 = $extract$t159; //@line 2097
         $$1143 = $89 ? $$0142 : $$0142 + $$1152$ | 0; //@line 2097
         $$1145 = $$0144 - ($89 ? 0 : $$1152$) | 0; //@line 2097
         $$3154 = $$1152; //@line 2097
         label = 38; //@line 2098
        } else {
         $$1$off0 = $extract$t159; //@line 2100
         $$1143 = $$0142; //@line 2100
         $$1145 = $$0144; //@line 2100
         $$3154 = $$1152$; //@line 2100
         label = 38; //@line 2101
        }
       }
      }
      L54 : do {
       if ((label | 0) == 38) {
        do {
         if (($$1145 | 0) > 0 & (HEAP32[57] | 0) != 0) {
          HEAP32[$4 >> 2] = HEAP32[$3 >> 2]; //@line 2114
          $AsyncCtx60 = _emscripten_alloc_async_context(104, sp) | 0; //@line 2115
          $95 = _vsnprintf(0, 0, $2, $4) | 0; //@line 2116
          if (___async) {
           HEAP32[$AsyncCtx60 >> 2] = 42; //@line 2119
           HEAP32[$AsyncCtx60 + 4 >> 2] = $$3154; //@line 2121
           HEAP32[$AsyncCtx60 + 8 >> 2] = $vararg_buffer20; //@line 2123
           HEAP32[$AsyncCtx60 + 12 >> 2] = $vararg_buffer20; //@line 2125
           HEAP8[$AsyncCtx60 + 16 >> 0] = $$1$off0 & 1; //@line 2128
           HEAP32[$AsyncCtx60 + 20 >> 2] = $vararg_buffer23; //@line 2130
           HEAP32[$AsyncCtx60 + 24 >> 2] = $vararg_buffer23; //@line 2132
           HEAP32[$AsyncCtx60 + 28 >> 2] = $vararg_buffer9; //@line 2134
           HEAP32[$AsyncCtx60 + 32 >> 2] = $1; //@line 2136
           HEAP32[$AsyncCtx60 + 36 >> 2] = $vararg_buffer9; //@line 2138
           HEAP32[$AsyncCtx60 + 40 >> 2] = $vararg_buffer6; //@line 2140
           HEAP32[$AsyncCtx60 + 44 >> 2] = $vararg_buffer6; //@line 2142
           HEAP32[$AsyncCtx60 + 48 >> 2] = $$1143; //@line 2144
           HEAP32[$AsyncCtx60 + 52 >> 2] = $$1145; //@line 2146
           HEAP32[$AsyncCtx60 + 56 >> 2] = $55; //@line 2148
           HEAP32[$AsyncCtx60 + 60 >> 2] = $2; //@line 2150
           HEAP32[$AsyncCtx60 + 64 >> 2] = $3; //@line 2152
           HEAP32[$AsyncCtx60 + 68 >> 2] = $vararg_buffer12; //@line 2154
           HEAP32[$AsyncCtx60 + 72 >> 2] = $vararg_buffer12; //@line 2156
           HEAP32[$AsyncCtx60 + 76 >> 2] = $vararg_buffer15; //@line 2158
           HEAP32[$AsyncCtx60 + 80 >> 2] = $vararg_buffer15; //@line 2160
           HEAP32[$AsyncCtx60 + 84 >> 2] = $vararg_buffer18; //@line 2162
           HEAP32[$AsyncCtx60 + 88 >> 2] = $vararg_buffer18; //@line 2164
           HEAP32[$AsyncCtx60 + 92 >> 2] = $vararg_buffer3; //@line 2166
           HEAP32[$AsyncCtx60 + 96 >> 2] = $vararg_buffer3; //@line 2168
           HEAP32[$AsyncCtx60 + 100 >> 2] = $4; //@line 2170
           sp = STACKTOP; //@line 2171
           STACKTOP = sp; //@line 2172
           return;
          }
          _emscripten_free_async_context($AsyncCtx60 | 0); //@line 2174
          $125 = HEAP32[57] | 0; //@line 2179
          $AsyncCtx38 = _emscripten_alloc_async_context(100, sp) | 0; //@line 2180
          $126 = FUNCTION_TABLE_ii[$125 & 15](($$3154 | 0 ? 4 : 0) + $$3154 + $95 | 0) | 0; //@line 2181
          if (___async) {
           HEAP32[$AsyncCtx38 >> 2] = 43; //@line 2184
           HEAP32[$AsyncCtx38 + 4 >> 2] = $vararg_buffer20; //@line 2186
           HEAP32[$AsyncCtx38 + 8 >> 2] = $vararg_buffer20; //@line 2188
           HEAP32[$AsyncCtx38 + 12 >> 2] = $vararg_buffer9; //@line 2190
           HEAP32[$AsyncCtx38 + 16 >> 2] = $1; //@line 2192
           HEAP32[$AsyncCtx38 + 20 >> 2] = $vararg_buffer9; //@line 2194
           HEAP32[$AsyncCtx38 + 24 >> 2] = $vararg_buffer6; //@line 2196
           HEAP32[$AsyncCtx38 + 28 >> 2] = $vararg_buffer6; //@line 2198
           HEAP32[$AsyncCtx38 + 32 >> 2] = $$1143; //@line 2200
           HEAP32[$AsyncCtx38 + 36 >> 2] = $$1145; //@line 2202
           HEAP32[$AsyncCtx38 + 40 >> 2] = $55; //@line 2204
           HEAP32[$AsyncCtx38 + 44 >> 2] = $2; //@line 2206
           HEAP32[$AsyncCtx38 + 48 >> 2] = $3; //@line 2208
           HEAP8[$AsyncCtx38 + 52 >> 0] = $$1$off0 & 1; //@line 2211
           HEAP32[$AsyncCtx38 + 56 >> 2] = $vararg_buffer12; //@line 2213
           HEAP32[$AsyncCtx38 + 60 >> 2] = $vararg_buffer12; //@line 2215
           HEAP32[$AsyncCtx38 + 64 >> 2] = $vararg_buffer15; //@line 2217
           HEAP32[$AsyncCtx38 + 68 >> 2] = $vararg_buffer15; //@line 2219
           HEAP32[$AsyncCtx38 + 72 >> 2] = $vararg_buffer18; //@line 2221
           HEAP32[$AsyncCtx38 + 76 >> 2] = $vararg_buffer18; //@line 2223
           HEAP32[$AsyncCtx38 + 80 >> 2] = $vararg_buffer3; //@line 2225
           HEAP32[$AsyncCtx38 + 84 >> 2] = $vararg_buffer3; //@line 2227
           HEAP32[$AsyncCtx38 + 88 >> 2] = $4; //@line 2229
           HEAP32[$AsyncCtx38 + 92 >> 2] = $vararg_buffer23; //@line 2231
           HEAP32[$AsyncCtx38 + 96 >> 2] = $vararg_buffer23; //@line 2233
           sp = STACKTOP; //@line 2234
           STACKTOP = sp; //@line 2235
           return;
          } else {
           _emscripten_free_async_context($AsyncCtx38 | 0); //@line 2237
           HEAP32[$vararg_buffer3 >> 2] = $126; //@line 2238
           $151 = _snprintf($$1143, $$1145, 1407, $vararg_buffer3) | 0; //@line 2239
           $$10 = ($151 | 0) >= ($$1145 | 0) ? 0 : $151; //@line 2241
           if (($$10 | 0) > 0) {
            $$3 = $$1143 + $$10 | 0; //@line 2246
            $$3147 = $$1145 - $$10 | 0; //@line 2246
            label = 44; //@line 2247
            break;
           } else {
            $$3147168 = $$1145; //@line 2250
            $$3169 = $$1143; //@line 2250
            break;
           }
          }
         } else {
          $$3 = $$1143; //@line 2255
          $$3147 = $$1145; //@line 2255
          label = 44; //@line 2256
         }
        } while (0);
        if ((label | 0) == 44) {
         if (($$3147 | 0) > 0) {
          $$3147168 = $$3147; //@line 2262
          $$3169 = $$3; //@line 2262
         } else {
          break;
         }
        }
        $157 = $55 + -2 | 0; //@line 2267
        switch ($157 >>> 1 | $157 << 31 | 0) {
        case 0:
         {
          HEAP32[$vararg_buffer6 >> 2] = $1; //@line 2273
          $$5156 = _snprintf($$3169, $$3147168, 1410, $vararg_buffer6) | 0; //@line 2275
          break;
         }
        case 1:
         {
          HEAP32[$vararg_buffer9 >> 2] = $1; //@line 2279
          $$5156 = _snprintf($$3169, $$3147168, 1425, $vararg_buffer9) | 0; //@line 2281
          break;
         }
        case 3:
         {
          HEAP32[$vararg_buffer12 >> 2] = $1; //@line 2285
          $$5156 = _snprintf($$3169, $$3147168, 1440, $vararg_buffer12) | 0; //@line 2287
          break;
         }
        case 7:
         {
          HEAP32[$vararg_buffer15 >> 2] = $1; //@line 2291
          $$5156 = _snprintf($$3169, $$3147168, 1455, $vararg_buffer15) | 0; //@line 2293
          break;
         }
        default:
         {
          $$5156 = _snprintf($$3169, $$3147168, 1470, $vararg_buffer18) | 0; //@line 2298
         }
        }
        $$5156$ = ($$5156 | 0) < ($$3147168 | 0) ? $$5156 : 0; //@line 2302
        $168 = $$3169 + $$5156$ | 0; //@line 2304
        $169 = $$3147168 - $$5156$ | 0; //@line 2305
        if (($$5156$ | 0) > 0 & ($169 | 0) > 0) {
         $AsyncCtx56 = _emscripten_alloc_async_context(32, sp) | 0; //@line 2309
         $171 = _vsnprintf($168, $169, $2, $3) | 0; //@line 2310
         if (___async) {
          HEAP32[$AsyncCtx56 >> 2] = 44; //@line 2313
          HEAP32[$AsyncCtx56 + 4 >> 2] = $vararg_buffer20; //@line 2315
          HEAP32[$AsyncCtx56 + 8 >> 2] = $vararg_buffer20; //@line 2317
          HEAP8[$AsyncCtx56 + 12 >> 0] = $$1$off0 & 1; //@line 2320
          HEAP32[$AsyncCtx56 + 16 >> 2] = $169; //@line 2322
          HEAP32[$AsyncCtx56 + 20 >> 2] = $168; //@line 2324
          HEAP32[$AsyncCtx56 + 24 >> 2] = $vararg_buffer23; //@line 2326
          HEAP32[$AsyncCtx56 + 28 >> 2] = $vararg_buffer23; //@line 2328
          sp = STACKTOP; //@line 2329
          STACKTOP = sp; //@line 2330
          return;
         }
         _emscripten_free_async_context($AsyncCtx56 | 0); //@line 2332
         $$13 = ($171 | 0) >= ($169 | 0) ? 0 : $171; //@line 2334
         $181 = $168 + $$13 | 0; //@line 2336
         $182 = $169 - $$13 | 0; //@line 2337
         if (($$13 | 0) > 0) {
          $184 = HEAP32[58] | 0; //@line 2340
          do {
           if (($182 | 0) > 0 & ($184 | 0) != 0) {
            $AsyncCtx42 = _emscripten_alloc_async_context(32, sp) | 0; //@line 2345
            $186 = FUNCTION_TABLE_i[$184 & 0]() | 0; //@line 2346
            if (___async) {
             HEAP32[$AsyncCtx42 >> 2] = 45; //@line 2349
             HEAP32[$AsyncCtx42 + 4 >> 2] = $vararg_buffer20; //@line 2351
             HEAP32[$AsyncCtx42 + 8 >> 2] = $181; //@line 2353
             HEAP32[$AsyncCtx42 + 12 >> 2] = $182; //@line 2355
             HEAP32[$AsyncCtx42 + 16 >> 2] = $vararg_buffer20; //@line 2357
             HEAP8[$AsyncCtx42 + 20 >> 0] = $$1$off0 & 1; //@line 2360
             HEAP32[$AsyncCtx42 + 24 >> 2] = $vararg_buffer23; //@line 2362
             HEAP32[$AsyncCtx42 + 28 >> 2] = $vararg_buffer23; //@line 2364
             sp = STACKTOP; //@line 2365
             STACKTOP = sp; //@line 2366
             return;
            } else {
             _emscripten_free_async_context($AsyncCtx42 | 0); //@line 2368
             HEAP32[$vararg_buffer20 >> 2] = $186; //@line 2369
             $194 = _snprintf($181, $182, 1407, $vararg_buffer20) | 0; //@line 2370
             $$18 = ($194 | 0) >= ($182 | 0) ? 0 : $194; //@line 2372
             if (($$18 | 0) > 0) {
              $$6 = $181 + $$18 | 0; //@line 2377
              $$6150 = $182 - $$18 | 0; //@line 2377
              $$9 = $$18; //@line 2377
              break;
             } else {
              break L54;
             }
            }
           } else {
            $$6 = $181; //@line 2384
            $$6150 = $182; //@line 2384
            $$9 = $$13; //@line 2384
           }
          } while (0);
          if (!(($$9 | 0) < 1 | ($$6150 | 0) < 1 | $$1$off0 ^ 1)) {
           _snprintf($$6, $$6150, 1485, $vararg_buffer23) | 0; //@line 2393
          }
         }
        }
       }
      } while (0);
      $201 = HEAP32[59] | 0; //@line 2399
      $202 = HEAP32[52] | 0; //@line 2400
      $AsyncCtx45 = _emscripten_alloc_async_context(4, sp) | 0; //@line 2401
      FUNCTION_TABLE_vi[$201 & 255]($202); //@line 2402
      if (___async) {
       HEAP32[$AsyncCtx45 >> 2] = 46; //@line 2405
       sp = STACKTOP; //@line 2406
       STACKTOP = sp; //@line 2407
       return;
      } else {
       _emscripten_free_async_context($AsyncCtx45 | 0); //@line 2409
       break;
      }
     }
    } while (0);
    HEAP32[56] = HEAP32[54]; //@line 2415
   }
  }
 } while (0);
 $204 = HEAP32[62] | 0; //@line 2419
 if (!$204) {
  STACKTOP = sp; //@line 2422
  return;
 }
 $206 = HEAP32[63] | 0; //@line 2424
 HEAP32[63] = 0; //@line 2425
 $AsyncCtx49 = _emscripten_alloc_async_context(8, sp) | 0; //@line 2426
 FUNCTION_TABLE_v[$204 & 3](); //@line 2427
 if (___async) {
  HEAP32[$AsyncCtx49 >> 2] = 47; //@line 2430
  HEAP32[$AsyncCtx49 + 4 >> 2] = $206; //@line 2432
  sp = STACKTOP; //@line 2433
  STACKTOP = sp; //@line 2434
  return;
 }
 _emscripten_free_async_context($AsyncCtx49 | 0); //@line 2436
 if (($206 | 0) > 1) {
  $$0199 = $206; //@line 2439
 } else {
  STACKTOP = sp; //@line 2441
  return;
 }
 while (1) {
  $209 = $$0199 + -1 | 0; //@line 2444
  $$pre = HEAP32[62] | 0; //@line 2445
  $AsyncCtx52 = _emscripten_alloc_async_context(12, sp) | 0; //@line 2446
  FUNCTION_TABLE_v[$$pre & 3](); //@line 2447
  if (___async) {
   label = 70; //@line 2450
   break;
  }
  _emscripten_free_async_context($AsyncCtx52 | 0); //@line 2453
  if (($$0199 | 0) > 2) {
   $$0199 = $209; //@line 2456
  } else {
   label = 72; //@line 2458
   break;
  }
 }
 if ((label | 0) == 70) {
  HEAP32[$AsyncCtx52 >> 2] = 48; //@line 2463
  HEAP32[$AsyncCtx52 + 4 >> 2] = $$0199; //@line 2465
  HEAP32[$AsyncCtx52 + 8 >> 2] = $209; //@line 2467
  sp = STACKTOP; //@line 2468
  STACKTOP = sp; //@line 2469
  return;
 } else if ((label | 0) == 72) {
  STACKTOP = sp; //@line 2472
  return;
 }
}
function _mbed_vtracef__async_cb($0) {
 $0 = $0 | 0;
 var $$ = 0, $$0$i = 0, $$0141 = 0, $$0142 = 0, $$0144 = 0, $$1$off0 = 0, $$1$off0$expand_i1_val = 0, $$1$off0$expand_i1_val18 = 0, $$1143 = 0, $$1145 = 0, $$1152 = 0, $$1152$ = 0, $$3154 = 0, $$5156 = 0, $$5156$ = 0, $$expand_i1_val = 0, $$lobit = 0, $$sink = 0, $10 = 0, $102 = 0, $108 = 0, $109 = 0, $110 = 0, $111 = 0, $112 = 0, $113 = 0, $114 = 0, $115 = 0, $116 = 0, $117 = 0, $118 = 0, $119 = 0, $12 = 0, $120 = 0, $121 = 0, $122 = 0, $123 = 0, $124 = 0, $125 = 0, $126 = 0, $127 = 0, $128 = 0, $129 = 0, $130 = 0, $131 = 0, $132 = 0, $133 = 0, $136 = 0, $14 = 0, $147 = 0, $148 = 0, $150 = 0, $151 = 0, $152 = 0, $153 = 0, $154 = 0, $155 = 0, $156 = 0, $157 = 0, $159 = 0, $16 = 0, $160 = 0, $161 = 0, $163 = 0, $164 = 0, $18 = 0, $2 = 0, $20 = 0, $22 = 0, $24 = 0, $26 = 0, $28 = 0, $30 = 0, $32 = 0, $34 = 0, $36 = 0, $38 = 0, $40 = 0, $42 = 0, $44 = 0, $46 = 0, $48 = 0, $50 = 0, $53 = 0, $57 = 0, $6 = 0, $62 = 0, $73 = 0, $74 = 0, $78 = 0, $79 = 0, $83 = 0, $84 = 0, $85 = 0, $86 = 0, $87 = 0, $89 = 0, $91 = 0, $95 = 0, $ReallocAsyncCtx10 = 0, $ReallocAsyncCtx11 = 0, $ReallocAsyncCtx12 = 0, $ReallocAsyncCtx7 = 0, $ReallocAsyncCtx8 = 0, $extract$t159 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 1359
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 1361
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 1365
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 1369
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 1371
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 1373
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 1375
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 1377
 $20 = HEAP32[$0 + 40 >> 2] | 0; //@line 1379
 $22 = HEAP32[$0 + 44 >> 2] | 0; //@line 1381
 $24 = HEAP32[$0 + 48 >> 2] | 0; //@line 1383
 $26 = HEAP32[$0 + 52 >> 2] | 0; //@line 1385
 $28 = HEAP32[$0 + 56 >> 2] | 0; //@line 1387
 $30 = HEAP8[$0 + 60 >> 0] | 0; //@line 1389
 $32 = HEAP32[$0 + 64 >> 2] | 0; //@line 1391
 $34 = HEAP32[$0 + 68 >> 2] | 0; //@line 1393
 $36 = HEAP32[$0 + 72 >> 2] | 0; //@line 1395
 $38 = HEAP32[$0 + 76 >> 2] | 0; //@line 1397
 $40 = HEAP32[$0 + 80 >> 2] | 0; //@line 1399
 $42 = HEAP32[$0 + 84 >> 2] | 0; //@line 1401
 $44 = HEAP32[$0 + 88 >> 2] | 0; //@line 1403
 $46 = HEAP32[$0 + 92 >> 2] | 0; //@line 1405
 $48 = HEAP32[$0 + 96 >> 2] | 0; //@line 1407
 $50 = HEAP32[$0 + 100 >> 2] | 0; //@line 1409
 HEAP32[63] = (HEAP32[63] | 0) + 1; //@line 1412
 $53 = HEAP32[52] | 0; //@line 1413
 do {
  if ($53 | 0) {
   HEAP8[$53 >> 0] = 0; //@line 1417
   do {
    if ($30 << 24 >> 24 > -1 & ($22 | 0) != 0) {
     $57 = HEAP32[49] | 0; //@line 1423
     if (HEAP8[$57 >> 0] | 0) {
      if (_strstr($57, $22) | 0) {
       $$0$i = 1; //@line 1430
       break;
      }
     }
     $62 = HEAP32[50] | 0; //@line 1434
     if (!(HEAP8[$62 >> 0] | 0)) {
      label = 9; //@line 1438
     } else {
      if (!(_strstr($62, $22) | 0)) {
       $$0$i = 1; //@line 1443
      } else {
       label = 9; //@line 1445
      }
     }
    } else {
     label = 9; //@line 1449
    }
   } while (0);
   if ((label | 0) == 9) {
    $$0$i = 0; //@line 1453
   }
   if (!((HEAP32[59] | 0) != 0 & ((($22 | 0) == 0 | (($14 | 0) == 0 | $$0$i)) ^ 1))) {
    HEAP32[56] = HEAP32[54]; //@line 1465
    break;
   }
   $73 = HEAPU8[192] | 0; //@line 1469
   $74 = $30 & 255; //@line 1470
   if ($74 & 31 & $73 | 0) {
    $78 = $73 & 64; //@line 1475
    $$lobit = $78 >>> 6; //@line 1476
    $79 = $$lobit & 255; //@line 1477
    $83 = ($73 & 32 | 0) == 0; //@line 1481
    $84 = HEAP32[53] | 0; //@line 1482
    $85 = HEAP32[52] | 0; //@line 1483
    $86 = $30 << 24 >> 24 == 1; //@line 1484
    if ($86 | ($73 & 128 | 0) != 0) {
     $ReallocAsyncCtx12 = _emscripten_realloc_async_context(8) | 0; //@line 1487
     _vsnprintf($85, $84, $14, $12) | 0; //@line 1488
     if (___async) {
      HEAP32[$ReallocAsyncCtx12 >> 2] = 38; //@line 1491
      $87 = $ReallocAsyncCtx12 + 4 | 0; //@line 1492
      $$expand_i1_val = $86 & 1; //@line 1493
      HEAP8[$87 >> 0] = $$expand_i1_val; //@line 1494
      sp = STACKTOP; //@line 1495
      return;
     }
     ___async_unwind = 0; //@line 1498
     HEAP32[$ReallocAsyncCtx12 >> 2] = 38; //@line 1499
     $87 = $ReallocAsyncCtx12 + 4 | 0; //@line 1500
     $$expand_i1_val = $86 & 1; //@line 1501
     HEAP8[$87 >> 0] = $$expand_i1_val; //@line 1502
     sp = STACKTOP; //@line 1503
     return;
    }
    if (!$78) {
     $$1$off0 = ($$lobit | 0) != 0; //@line 1509
     $$1143 = $85; //@line 1509
     $$1145 = $84; //@line 1509
     $$3154 = 0; //@line 1509
     label = 28; //@line 1510
    } else {
     if ($83) {
      $$0142 = $85; //@line 1513
      $$0144 = $84; //@line 1513
     } else {
      $89 = _snprintf($85, $84, 1377, $2) | 0; //@line 1515
      $$ = ($89 | 0) >= ($84 | 0) ? 0 : $89; //@line 1517
      $91 = ($$ | 0) > 0; //@line 1518
      $$0142 = $91 ? $85 + $$ | 0 : $85; //@line 1523
      $$0144 = $84 - ($91 ? $$ : 0) | 0; //@line 1523
     }
     if (($$0144 | 0) > 0) {
      $95 = $74 + -2 | 0; //@line 1527
      switch ($95 >>> 1 | $95 << 31 | 0) {
      case 0:
       {
        $$sink = 1395; //@line 1533
        label = 25; //@line 1534
        break;
       }
      case 1:
       {
        $$sink = 1401; //@line 1538
        label = 25; //@line 1539
        break;
       }
      case 3:
       {
        $$sink = 1389; //@line 1543
        label = 25; //@line 1544
        break;
       }
      case 7:
       {
        $$sink = 1383; //@line 1548
        label = 25; //@line 1549
        break;
       }
      default:
       {
        $$0141 = 0; //@line 1553
        $$1152 = 0; //@line 1553
       }
      }
      if ((label | 0) == 25) {
       HEAP32[$6 >> 2] = $$sink; //@line 1557
       $$0141 = $79 & 1; //@line 1560
       $$1152 = _snprintf($$0142, $$0144, 1407, $6) | 0; //@line 1560
      }
      $$1152$ = ($$1152 | 0) < ($$0144 | 0) ? $$1152 : 0; //@line 1563
      $extract$t159 = $$0141 << 24 >> 24 != 0; //@line 1565
      if (($$1152$ | 0) > 0) {
       $102 = $$0141 << 24 >> 24 == 0; //@line 1567
       $$1$off0 = $extract$t159; //@line 1572
       $$1143 = $102 ? $$0142 : $$0142 + $$1152$ | 0; //@line 1572
       $$1145 = $$0144 - ($102 ? 0 : $$1152$) | 0; //@line 1572
       $$3154 = $$1152; //@line 1572
       label = 28; //@line 1573
      } else {
       $$1$off0 = $extract$t159; //@line 1575
       $$1143 = $$0142; //@line 1575
       $$1145 = $$0144; //@line 1575
       $$3154 = $$1152$; //@line 1575
       label = 28; //@line 1576
      }
     }
    }
    if ((label | 0) == 28) {
     if (($$1145 | 0) > 0 & (HEAP32[57] | 0) != 0) {
      HEAP32[$10 >> 2] = HEAP32[$12 >> 2]; //@line 1587
      $ReallocAsyncCtx11 = _emscripten_realloc_async_context(104) | 0; //@line 1588
      $108 = _vsnprintf(0, 0, $14, $10) | 0; //@line 1589
      if (___async) {
       HEAP32[$ReallocAsyncCtx11 >> 2] = 42; //@line 1592
       $109 = $ReallocAsyncCtx11 + 4 | 0; //@line 1593
       HEAP32[$109 >> 2] = $$3154; //@line 1594
       $110 = $ReallocAsyncCtx11 + 8 | 0; //@line 1595
       HEAP32[$110 >> 2] = $16; //@line 1596
       $111 = $ReallocAsyncCtx11 + 12 | 0; //@line 1597
       HEAP32[$111 >> 2] = $18; //@line 1598
       $112 = $ReallocAsyncCtx11 + 16 | 0; //@line 1599
       $$1$off0$expand_i1_val = $$1$off0 & 1; //@line 1600
       HEAP8[$112 >> 0] = $$1$off0$expand_i1_val; //@line 1601
       $113 = $ReallocAsyncCtx11 + 20 | 0; //@line 1602
       HEAP32[$113 >> 2] = $48; //@line 1603
       $114 = $ReallocAsyncCtx11 + 24 | 0; //@line 1604
       HEAP32[$114 >> 2] = $50; //@line 1605
       $115 = $ReallocAsyncCtx11 + 28 | 0; //@line 1606
       HEAP32[$115 >> 2] = $20; //@line 1607
       $116 = $ReallocAsyncCtx11 + 32 | 0; //@line 1608
       HEAP32[$116 >> 2] = $22; //@line 1609
       $117 = $ReallocAsyncCtx11 + 36 | 0; //@line 1610
       HEAP32[$117 >> 2] = $24; //@line 1611
       $118 = $ReallocAsyncCtx11 + 40 | 0; //@line 1612
       HEAP32[$118 >> 2] = $26; //@line 1613
       $119 = $ReallocAsyncCtx11 + 44 | 0; //@line 1614
       HEAP32[$119 >> 2] = $28; //@line 1615
       $120 = $ReallocAsyncCtx11 + 48 | 0; //@line 1616
       HEAP32[$120 >> 2] = $$1143; //@line 1617
       $121 = $ReallocAsyncCtx11 + 52 | 0; //@line 1618
       HEAP32[$121 >> 2] = $$1145; //@line 1619
       $122 = $ReallocAsyncCtx11 + 56 | 0; //@line 1620
       HEAP32[$122 >> 2] = $74; //@line 1621
       $123 = $ReallocAsyncCtx11 + 60 | 0; //@line 1622
       HEAP32[$123 >> 2] = $14; //@line 1623
       $124 = $ReallocAsyncCtx11 + 64 | 0; //@line 1624
       HEAP32[$124 >> 2] = $12; //@line 1625
       $125 = $ReallocAsyncCtx11 + 68 | 0; //@line 1626
       HEAP32[$125 >> 2] = $32; //@line 1627
       $126 = $ReallocAsyncCtx11 + 72 | 0; //@line 1628
       HEAP32[$126 >> 2] = $34; //@line 1629
       $127 = $ReallocAsyncCtx11 + 76 | 0; //@line 1630
       HEAP32[$127 >> 2] = $36; //@line 1631
       $128 = $ReallocAsyncCtx11 + 80 | 0; //@line 1632
       HEAP32[$128 >> 2] = $38; //@line 1633
       $129 = $ReallocAsyncCtx11 + 84 | 0; //@line 1634
       HEAP32[$129 >> 2] = $40; //@line 1635
       $130 = $ReallocAsyncCtx11 + 88 | 0; //@line 1636
       HEAP32[$130 >> 2] = $42; //@line 1637
       $131 = $ReallocAsyncCtx11 + 92 | 0; //@line 1638
       HEAP32[$131 >> 2] = $44; //@line 1639
       $132 = $ReallocAsyncCtx11 + 96 | 0; //@line 1640
       HEAP32[$132 >> 2] = $46; //@line 1641
       $133 = $ReallocAsyncCtx11 + 100 | 0; //@line 1642
       HEAP32[$133 >> 2] = $10; //@line 1643
       sp = STACKTOP; //@line 1644
       return;
      }
      HEAP32[___async_retval >> 2] = $108; //@line 1648
      ___async_unwind = 0; //@line 1649
      HEAP32[$ReallocAsyncCtx11 >> 2] = 42; //@line 1650
      $109 = $ReallocAsyncCtx11 + 4 | 0; //@line 1651
      HEAP32[$109 >> 2] = $$3154; //@line 1652
      $110 = $ReallocAsyncCtx11 + 8 | 0; //@line 1653
      HEAP32[$110 >> 2] = $16; //@line 1654
      $111 = $ReallocAsyncCtx11 + 12 | 0; //@line 1655
      HEAP32[$111 >> 2] = $18; //@line 1656
      $112 = $ReallocAsyncCtx11 + 16 | 0; //@line 1657
      $$1$off0$expand_i1_val = $$1$off0 & 1; //@line 1658
      HEAP8[$112 >> 0] = $$1$off0$expand_i1_val; //@line 1659
      $113 = $ReallocAsyncCtx11 + 20 | 0; //@line 1660
      HEAP32[$113 >> 2] = $48; //@line 1661
      $114 = $ReallocAsyncCtx11 + 24 | 0; //@line 1662
      HEAP32[$114 >> 2] = $50; //@line 1663
      $115 = $ReallocAsyncCtx11 + 28 | 0; //@line 1664
      HEAP32[$115 >> 2] = $20; //@line 1665
      $116 = $ReallocAsyncCtx11 + 32 | 0; //@line 1666
      HEAP32[$116 >> 2] = $22; //@line 1667
      $117 = $ReallocAsyncCtx11 + 36 | 0; //@line 1668
      HEAP32[$117 >> 2] = $24; //@line 1669
      $118 = $ReallocAsyncCtx11 + 40 | 0; //@line 1670
      HEAP32[$118 >> 2] = $26; //@line 1671
      $119 = $ReallocAsyncCtx11 + 44 | 0; //@line 1672
      HEAP32[$119 >> 2] = $28; //@line 1673
      $120 = $ReallocAsyncCtx11 + 48 | 0; //@line 1674
      HEAP32[$120 >> 2] = $$1143; //@line 1675
      $121 = $ReallocAsyncCtx11 + 52 | 0; //@line 1676
      HEAP32[$121 >> 2] = $$1145; //@line 1677
      $122 = $ReallocAsyncCtx11 + 56 | 0; //@line 1678
      HEAP32[$122 >> 2] = $74; //@line 1679
      $123 = $ReallocAsyncCtx11 + 60 | 0; //@line 1680
      HEAP32[$123 >> 2] = $14; //@line 1681
      $124 = $ReallocAsyncCtx11 + 64 | 0; //@line 1682
      HEAP32[$124 >> 2] = $12; //@line 1683
      $125 = $ReallocAsyncCtx11 + 68 | 0; //@line 1684
      HEAP32[$125 >> 2] = $32; //@line 1685
      $126 = $ReallocAsyncCtx11 + 72 | 0; //@line 1686
      HEAP32[$126 >> 2] = $34; //@line 1687
      $127 = $ReallocAsyncCtx11 + 76 | 0; //@line 1688
      HEAP32[$127 >> 2] = $36; //@line 1689
      $128 = $ReallocAsyncCtx11 + 80 | 0; //@line 1690
      HEAP32[$128 >> 2] = $38; //@line 1691
      $129 = $ReallocAsyncCtx11 + 84 | 0; //@line 1692
      HEAP32[$129 >> 2] = $40; //@line 1693
      $130 = $ReallocAsyncCtx11 + 88 | 0; //@line 1694
      HEAP32[$130 >> 2] = $42; //@line 1695
      $131 = $ReallocAsyncCtx11 + 92 | 0; //@line 1696
      HEAP32[$131 >> 2] = $44; //@line 1697
      $132 = $ReallocAsyncCtx11 + 96 | 0; //@line 1698
      HEAP32[$132 >> 2] = $46; //@line 1699
      $133 = $ReallocAsyncCtx11 + 100 | 0; //@line 1700
      HEAP32[$133 >> 2] = $10; //@line 1701
      sp = STACKTOP; //@line 1702
      return;
     }
     if (($$1145 | 0) > 0) {
      $136 = $74 + -2 | 0; //@line 1707
      switch ($136 >>> 1 | $136 << 31 | 0) {
      case 0:
       {
        HEAP32[$26 >> 2] = $22; //@line 1713
        $$5156 = _snprintf($$1143, $$1145, 1410, $26) | 0; //@line 1715
        break;
       }
      case 1:
       {
        HEAP32[$20 >> 2] = $22; //@line 1719
        $$5156 = _snprintf($$1143, $$1145, 1425, $20) | 0; //@line 1721
        break;
       }
      case 3:
       {
        HEAP32[$32 >> 2] = $22; //@line 1725
        $$5156 = _snprintf($$1143, $$1145, 1440, $32) | 0; //@line 1727
        break;
       }
      case 7:
       {
        HEAP32[$36 >> 2] = $22; //@line 1731
        $$5156 = _snprintf($$1143, $$1145, 1455, $36) | 0; //@line 1733
        break;
       }
      default:
       {
        $$5156 = _snprintf($$1143, $$1145, 1470, $40) | 0; //@line 1738
       }
      }
      $$5156$ = ($$5156 | 0) < ($$1145 | 0) ? $$5156 : 0; //@line 1742
      $147 = $$1143 + $$5156$ | 0; //@line 1744
      $148 = $$1145 - $$5156$ | 0; //@line 1745
      if (($$5156$ | 0) > 0 & ($148 | 0) > 0) {
       $ReallocAsyncCtx10 = _emscripten_realloc_async_context(32) | 0; //@line 1749
       $150 = _vsnprintf($147, $148, $14, $12) | 0; //@line 1750
       if (___async) {
        HEAP32[$ReallocAsyncCtx10 >> 2] = 44; //@line 1753
        $151 = $ReallocAsyncCtx10 + 4 | 0; //@line 1754
        HEAP32[$151 >> 2] = $16; //@line 1755
        $152 = $ReallocAsyncCtx10 + 8 | 0; //@line 1756
        HEAP32[$152 >> 2] = $18; //@line 1757
        $153 = $ReallocAsyncCtx10 + 12 | 0; //@line 1758
        $$1$off0$expand_i1_val18 = $$1$off0 & 1; //@line 1759
        HEAP8[$153 >> 0] = $$1$off0$expand_i1_val18; //@line 1760
        $154 = $ReallocAsyncCtx10 + 16 | 0; //@line 1761
        HEAP32[$154 >> 2] = $148; //@line 1762
        $155 = $ReallocAsyncCtx10 + 20 | 0; //@line 1763
        HEAP32[$155 >> 2] = $147; //@line 1764
        $156 = $ReallocAsyncCtx10 + 24 | 0; //@line 1765
        HEAP32[$156 >> 2] = $48; //@line 1766
        $157 = $ReallocAsyncCtx10 + 28 | 0; //@line 1767
        HEAP32[$157 >> 2] = $50; //@line 1768
        sp = STACKTOP; //@line 1769
        return;
       }
       HEAP32[___async_retval >> 2] = $150; //@line 1773
       ___async_unwind = 0; //@line 1774
       HEAP32[$ReallocAsyncCtx10 >> 2] = 44; //@line 1775
       $151 = $ReallocAsyncCtx10 + 4 | 0; //@line 1776
       HEAP32[$151 >> 2] = $16; //@line 1777
       $152 = $ReallocAsyncCtx10 + 8 | 0; //@line 1778
       HEAP32[$152 >> 2] = $18; //@line 1779
       $153 = $ReallocAsyncCtx10 + 12 | 0; //@line 1780
       $$1$off0$expand_i1_val18 = $$1$off0 & 1; //@line 1781
       HEAP8[$153 >> 0] = $$1$off0$expand_i1_val18; //@line 1782
       $154 = $ReallocAsyncCtx10 + 16 | 0; //@line 1783
       HEAP32[$154 >> 2] = $148; //@line 1784
       $155 = $ReallocAsyncCtx10 + 20 | 0; //@line 1785
       HEAP32[$155 >> 2] = $147; //@line 1786
       $156 = $ReallocAsyncCtx10 + 24 | 0; //@line 1787
       HEAP32[$156 >> 2] = $48; //@line 1788
       $157 = $ReallocAsyncCtx10 + 28 | 0; //@line 1789
       HEAP32[$157 >> 2] = $50; //@line 1790
       sp = STACKTOP; //@line 1791
       return;
      }
     }
    }
    $159 = HEAP32[59] | 0; //@line 1796
    $160 = HEAP32[52] | 0; //@line 1797
    $ReallocAsyncCtx7 = _emscripten_realloc_async_context(4) | 0; //@line 1798
    FUNCTION_TABLE_vi[$159 & 255]($160); //@line 1799
    if (___async) {
     HEAP32[$ReallocAsyncCtx7 >> 2] = 46; //@line 1802
     sp = STACKTOP; //@line 1803
     return;
    }
    ___async_unwind = 0; //@line 1806
    HEAP32[$ReallocAsyncCtx7 >> 2] = 46; //@line 1807
    sp = STACKTOP; //@line 1808
    return;
   }
  }
 } while (0);
 $161 = HEAP32[62] | 0; //@line 1813
 if (!$161) {
  return;
 }
 $163 = HEAP32[63] | 0; //@line 1818
 HEAP32[63] = 0; //@line 1819
 $ReallocAsyncCtx8 = _emscripten_realloc_async_context(8) | 0; //@line 1820
 FUNCTION_TABLE_v[$161 & 3](); //@line 1821
 if (___async) {
  HEAP32[$ReallocAsyncCtx8 >> 2] = 47; //@line 1824
  $164 = $ReallocAsyncCtx8 + 4 | 0; //@line 1825
  HEAP32[$164 >> 2] = $163; //@line 1826
  sp = STACKTOP; //@line 1827
  return;
 }
 ___async_unwind = 0; //@line 1830
 HEAP32[$ReallocAsyncCtx8 >> 2] = 47; //@line 1831
 $164 = $ReallocAsyncCtx8 + 4 | 0; //@line 1832
 HEAP32[$164 >> 2] = $163; //@line 1833
 sp = STACKTOP; //@line 1834
 return;
}
function _free($0) {
 $0 = $0 | 0;
 var $$0212$i = 0, $$0212$in$i = 0, $$0383 = 0, $$0384 = 0, $$0396 = 0, $$0403 = 0, $$1 = 0, $$1382 = 0, $$1387 = 0, $$1390 = 0, $$1398 = 0, $$1402 = 0, $$2 = 0, $$3 = 0, $$3400 = 0, $$pre$phi442Z2D = 0, $$pre$phi444Z2D = 0, $$pre$phiZ2D = 0, $10 = 0, $105 = 0, $106 = 0, $114 = 0, $115 = 0, $116 = 0, $124 = 0, $13 = 0, $132 = 0, $137 = 0, $138 = 0, $141 = 0, $143 = 0, $145 = 0, $16 = 0, $160 = 0, $165 = 0, $167 = 0, $17 = 0, $170 = 0, $173 = 0, $176 = 0, $179 = 0, $180 = 0, $181 = 0, $183 = 0, $185 = 0, $186 = 0, $188 = 0, $189 = 0, $195 = 0, $196 = 0, $2 = 0, $21 = 0, $210 = 0, $213 = 0, $214 = 0, $220 = 0, $235 = 0, $238 = 0, $239 = 0, $24 = 0, $240 = 0, $244 = 0, $245 = 0, $251 = 0, $256 = 0, $257 = 0, $26 = 0, $260 = 0, $262 = 0, $265 = 0, $270 = 0, $276 = 0, $28 = 0, $280 = 0, $281 = 0, $299 = 0, $3 = 0, $301 = 0, $308 = 0, $309 = 0, $310 = 0, $319 = 0, $41 = 0, $46 = 0, $48 = 0, $51 = 0, $53 = 0, $56 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $63 = 0, $65 = 0, $66 = 0, $68 = 0, $69 = 0, $7 = 0, $74 = 0, $75 = 0, $89 = 0, $9 = 0, $92 = 0, $93 = 0, $99 = 0, label = 0;
 if (!$0) {
  return;
 }
 $2 = $0 + -8 | 0; //@line 6682
 $3 = HEAP32[1532] | 0; //@line 6683
 if ($2 >>> 0 < $3 >>> 0) {
  _abort(); //@line 6686
 }
 $6 = HEAP32[$0 + -4 >> 2] | 0; //@line 6690
 $7 = $6 & 3; //@line 6691
 if (($7 | 0) == 1) {
  _abort(); //@line 6694
 }
 $9 = $6 & -8; //@line 6697
 $10 = $2 + $9 | 0; //@line 6698
 L10 : do {
  if (!($6 & 1)) {
   $13 = HEAP32[$2 >> 2] | 0; //@line 6703
   if (!$7) {
    return;
   }
   $16 = $2 + (0 - $13) | 0; //@line 6709
   $17 = $13 + $9 | 0; //@line 6710
   if ($16 >>> 0 < $3 >>> 0) {
    _abort(); //@line 6713
   }
   if ((HEAP32[1533] | 0) == ($16 | 0)) {
    $105 = $10 + 4 | 0; //@line 6719
    $106 = HEAP32[$105 >> 2] | 0; //@line 6720
    if (($106 & 3 | 0) != 3) {
     $$1 = $16; //@line 6724
     $$1382 = $17; //@line 6724
     $114 = $16; //@line 6724
     break;
    }
    HEAP32[1530] = $17; //@line 6727
    HEAP32[$105 >> 2] = $106 & -2; //@line 6729
    HEAP32[$16 + 4 >> 2] = $17 | 1; //@line 6732
    HEAP32[$16 + $17 >> 2] = $17; //@line 6734
    return;
   }
   $21 = $13 >>> 3; //@line 6737
   if ($13 >>> 0 < 256) {
    $24 = HEAP32[$16 + 8 >> 2] | 0; //@line 6741
    $26 = HEAP32[$16 + 12 >> 2] | 0; //@line 6743
    $28 = 6152 + ($21 << 1 << 2) | 0; //@line 6745
    if (($24 | 0) != ($28 | 0)) {
     if ($3 >>> 0 > $24 >>> 0) {
      _abort(); //@line 6750
     }
     if ((HEAP32[$24 + 12 >> 2] | 0) != ($16 | 0)) {
      _abort(); //@line 6757
     }
    }
    if (($26 | 0) == ($24 | 0)) {
     HEAP32[1528] = HEAP32[1528] & ~(1 << $21); //@line 6767
     $$1 = $16; //@line 6768
     $$1382 = $17; //@line 6768
     $114 = $16; //@line 6768
     break;
    }
    if (($26 | 0) == ($28 | 0)) {
     $$pre$phi444Z2D = $26 + 8 | 0; //@line 6774
    } else {
     if ($3 >>> 0 > $26 >>> 0) {
      _abort(); //@line 6778
     }
     $41 = $26 + 8 | 0; //@line 6781
     if ((HEAP32[$41 >> 2] | 0) == ($16 | 0)) {
      $$pre$phi444Z2D = $41; //@line 6785
     } else {
      _abort(); //@line 6787
     }
    }
    HEAP32[$24 + 12 >> 2] = $26; //@line 6792
    HEAP32[$$pre$phi444Z2D >> 2] = $24; //@line 6793
    $$1 = $16; //@line 6794
    $$1382 = $17; //@line 6794
    $114 = $16; //@line 6794
    break;
   }
   $46 = HEAP32[$16 + 24 >> 2] | 0; //@line 6798
   $48 = HEAP32[$16 + 12 >> 2] | 0; //@line 6800
   do {
    if (($48 | 0) == ($16 | 0)) {
     $59 = $16 + 16 | 0; //@line 6804
     $60 = $59 + 4 | 0; //@line 6805
     $61 = HEAP32[$60 >> 2] | 0; //@line 6806
     if (!$61) {
      $63 = HEAP32[$59 >> 2] | 0; //@line 6809
      if (!$63) {
       $$3 = 0; //@line 6812
       break;
      } else {
       $$1387 = $63; //@line 6815
       $$1390 = $59; //@line 6815
      }
     } else {
      $$1387 = $61; //@line 6818
      $$1390 = $60; //@line 6818
     }
     while (1) {
      $65 = $$1387 + 20 | 0; //@line 6821
      $66 = HEAP32[$65 >> 2] | 0; //@line 6822
      if ($66 | 0) {
       $$1387 = $66; //@line 6825
       $$1390 = $65; //@line 6825
       continue;
      }
      $68 = $$1387 + 16 | 0; //@line 6828
      $69 = HEAP32[$68 >> 2] | 0; //@line 6829
      if (!$69) {
       break;
      } else {
       $$1387 = $69; //@line 6834
       $$1390 = $68; //@line 6834
      }
     }
     if ($3 >>> 0 > $$1390 >>> 0) {
      _abort(); //@line 6839
     } else {
      HEAP32[$$1390 >> 2] = 0; //@line 6842
      $$3 = $$1387; //@line 6843
      break;
     }
    } else {
     $51 = HEAP32[$16 + 8 >> 2] | 0; //@line 6848
     if ($3 >>> 0 > $51 >>> 0) {
      _abort(); //@line 6851
     }
     $53 = $51 + 12 | 0; //@line 6854
     if ((HEAP32[$53 >> 2] | 0) != ($16 | 0)) {
      _abort(); //@line 6858
     }
     $56 = $48 + 8 | 0; //@line 6861
     if ((HEAP32[$56 >> 2] | 0) == ($16 | 0)) {
      HEAP32[$53 >> 2] = $48; //@line 6865
      HEAP32[$56 >> 2] = $51; //@line 6866
      $$3 = $48; //@line 6867
      break;
     } else {
      _abort(); //@line 6870
     }
    }
   } while (0);
   if (!$46) {
    $$1 = $16; //@line 6877
    $$1382 = $17; //@line 6877
    $114 = $16; //@line 6877
   } else {
    $74 = HEAP32[$16 + 28 >> 2] | 0; //@line 6880
    $75 = 6416 + ($74 << 2) | 0; //@line 6881
    do {
     if ((HEAP32[$75 >> 2] | 0) == ($16 | 0)) {
      HEAP32[$75 >> 2] = $$3; //@line 6886
      if (!$$3) {
       HEAP32[1529] = HEAP32[1529] & ~(1 << $74); //@line 6893
       $$1 = $16; //@line 6894
       $$1382 = $17; //@line 6894
       $114 = $16; //@line 6894
       break L10;
      }
     } else {
      if ((HEAP32[1532] | 0) >>> 0 > $46 >>> 0) {
       _abort(); //@line 6901
      } else {
       HEAP32[$46 + 16 + (((HEAP32[$46 + 16 >> 2] | 0) != ($16 | 0) & 1) << 2) >> 2] = $$3; //@line 6909
       if (!$$3) {
        $$1 = $16; //@line 6912
        $$1382 = $17; //@line 6912
        $114 = $16; //@line 6912
        break L10;
       } else {
        break;
       }
      }
     }
    } while (0);
    $89 = HEAP32[1532] | 0; //@line 6920
    if ($89 >>> 0 > $$3 >>> 0) {
     _abort(); //@line 6923
    }
    HEAP32[$$3 + 24 >> 2] = $46; //@line 6927
    $92 = $16 + 16 | 0; //@line 6928
    $93 = HEAP32[$92 >> 2] | 0; //@line 6929
    do {
     if ($93 | 0) {
      if ($89 >>> 0 > $93 >>> 0) {
       _abort(); //@line 6935
      } else {
       HEAP32[$$3 + 16 >> 2] = $93; //@line 6939
       HEAP32[$93 + 24 >> 2] = $$3; //@line 6941
       break;
      }
     }
    } while (0);
    $99 = HEAP32[$92 + 4 >> 2] | 0; //@line 6947
    if (!$99) {
     $$1 = $16; //@line 6950
     $$1382 = $17; //@line 6950
     $114 = $16; //@line 6950
    } else {
     if ((HEAP32[1532] | 0) >>> 0 > $99 >>> 0) {
      _abort(); //@line 6955
     } else {
      HEAP32[$$3 + 20 >> 2] = $99; //@line 6959
      HEAP32[$99 + 24 >> 2] = $$3; //@line 6961
      $$1 = $16; //@line 6962
      $$1382 = $17; //@line 6962
      $114 = $16; //@line 6962
      break;
     }
    }
   }
  } else {
   $$1 = $2; //@line 6968
   $$1382 = $9; //@line 6968
   $114 = $2; //@line 6968
  }
 } while (0);
 if ($114 >>> 0 >= $10 >>> 0) {
  _abort(); //@line 6973
 }
 $115 = $10 + 4 | 0; //@line 6976
 $116 = HEAP32[$115 >> 2] | 0; //@line 6977
 if (!($116 & 1)) {
  _abort(); //@line 6981
 }
 if (!($116 & 2)) {
  if ((HEAP32[1534] | 0) == ($10 | 0)) {
   $124 = (HEAP32[1531] | 0) + $$1382 | 0; //@line 6991
   HEAP32[1531] = $124; //@line 6992
   HEAP32[1534] = $$1; //@line 6993
   HEAP32[$$1 + 4 >> 2] = $124 | 1; //@line 6996
   if (($$1 | 0) != (HEAP32[1533] | 0)) {
    return;
   }
   HEAP32[1533] = 0; //@line 7002
   HEAP32[1530] = 0; //@line 7003
   return;
  }
  if ((HEAP32[1533] | 0) == ($10 | 0)) {
   $132 = (HEAP32[1530] | 0) + $$1382 | 0; //@line 7010
   HEAP32[1530] = $132; //@line 7011
   HEAP32[1533] = $114; //@line 7012
   HEAP32[$$1 + 4 >> 2] = $132 | 1; //@line 7015
   HEAP32[$114 + $132 >> 2] = $132; //@line 7017
   return;
  }
  $137 = ($116 & -8) + $$1382 | 0; //@line 7021
  $138 = $116 >>> 3; //@line 7022
  L108 : do {
   if ($116 >>> 0 < 256) {
    $141 = HEAP32[$10 + 8 >> 2] | 0; //@line 7027
    $143 = HEAP32[$10 + 12 >> 2] | 0; //@line 7029
    $145 = 6152 + ($138 << 1 << 2) | 0; //@line 7031
    if (($141 | 0) != ($145 | 0)) {
     if ((HEAP32[1532] | 0) >>> 0 > $141 >>> 0) {
      _abort(); //@line 7037
     }
     if ((HEAP32[$141 + 12 >> 2] | 0) != ($10 | 0)) {
      _abort(); //@line 7044
     }
    }
    if (($143 | 0) == ($141 | 0)) {
     HEAP32[1528] = HEAP32[1528] & ~(1 << $138); //@line 7054
     break;
    }
    if (($143 | 0) == ($145 | 0)) {
     $$pre$phi442Z2D = $143 + 8 | 0; //@line 7060
    } else {
     if ((HEAP32[1532] | 0) >>> 0 > $143 >>> 0) {
      _abort(); //@line 7065
     }
     $160 = $143 + 8 | 0; //@line 7068
     if ((HEAP32[$160 >> 2] | 0) == ($10 | 0)) {
      $$pre$phi442Z2D = $160; //@line 7072
     } else {
      _abort(); //@line 7074
     }
    }
    HEAP32[$141 + 12 >> 2] = $143; //@line 7079
    HEAP32[$$pre$phi442Z2D >> 2] = $141; //@line 7080
   } else {
    $165 = HEAP32[$10 + 24 >> 2] | 0; //@line 7083
    $167 = HEAP32[$10 + 12 >> 2] | 0; //@line 7085
    do {
     if (($167 | 0) == ($10 | 0)) {
      $179 = $10 + 16 | 0; //@line 7089
      $180 = $179 + 4 | 0; //@line 7090
      $181 = HEAP32[$180 >> 2] | 0; //@line 7091
      if (!$181) {
       $183 = HEAP32[$179 >> 2] | 0; //@line 7094
       if (!$183) {
        $$3400 = 0; //@line 7097
        break;
       } else {
        $$1398 = $183; //@line 7100
        $$1402 = $179; //@line 7100
       }
      } else {
       $$1398 = $181; //@line 7103
       $$1402 = $180; //@line 7103
      }
      while (1) {
       $185 = $$1398 + 20 | 0; //@line 7106
       $186 = HEAP32[$185 >> 2] | 0; //@line 7107
       if ($186 | 0) {
        $$1398 = $186; //@line 7110
        $$1402 = $185; //@line 7110
        continue;
       }
       $188 = $$1398 + 16 | 0; //@line 7113
       $189 = HEAP32[$188 >> 2] | 0; //@line 7114
       if (!$189) {
        break;
       } else {
        $$1398 = $189; //@line 7119
        $$1402 = $188; //@line 7119
       }
      }
      if ((HEAP32[1532] | 0) >>> 0 > $$1402 >>> 0) {
       _abort(); //@line 7125
      } else {
       HEAP32[$$1402 >> 2] = 0; //@line 7128
       $$3400 = $$1398; //@line 7129
       break;
      }
     } else {
      $170 = HEAP32[$10 + 8 >> 2] | 0; //@line 7134
      if ((HEAP32[1532] | 0) >>> 0 > $170 >>> 0) {
       _abort(); //@line 7138
      }
      $173 = $170 + 12 | 0; //@line 7141
      if ((HEAP32[$173 >> 2] | 0) != ($10 | 0)) {
       _abort(); //@line 7145
      }
      $176 = $167 + 8 | 0; //@line 7148
      if ((HEAP32[$176 >> 2] | 0) == ($10 | 0)) {
       HEAP32[$173 >> 2] = $167; //@line 7152
       HEAP32[$176 >> 2] = $170; //@line 7153
       $$3400 = $167; //@line 7154
       break;
      } else {
       _abort(); //@line 7157
      }
     }
    } while (0);
    if ($165 | 0) {
     $195 = HEAP32[$10 + 28 >> 2] | 0; //@line 7165
     $196 = 6416 + ($195 << 2) | 0; //@line 7166
     do {
      if ((HEAP32[$196 >> 2] | 0) == ($10 | 0)) {
       HEAP32[$196 >> 2] = $$3400; //@line 7171
       if (!$$3400) {
        HEAP32[1529] = HEAP32[1529] & ~(1 << $195); //@line 7178
        break L108;
       }
      } else {
       if ((HEAP32[1532] | 0) >>> 0 > $165 >>> 0) {
        _abort(); //@line 7185
       } else {
        HEAP32[$165 + 16 + (((HEAP32[$165 + 16 >> 2] | 0) != ($10 | 0) & 1) << 2) >> 2] = $$3400; //@line 7193
        if (!$$3400) {
         break L108;
        } else {
         break;
        }
       }
      }
     } while (0);
     $210 = HEAP32[1532] | 0; //@line 7203
     if ($210 >>> 0 > $$3400 >>> 0) {
      _abort(); //@line 7206
     }
     HEAP32[$$3400 + 24 >> 2] = $165; //@line 7210
     $213 = $10 + 16 | 0; //@line 7211
     $214 = HEAP32[$213 >> 2] | 0; //@line 7212
     do {
      if ($214 | 0) {
       if ($210 >>> 0 > $214 >>> 0) {
        _abort(); //@line 7218
       } else {
        HEAP32[$$3400 + 16 >> 2] = $214; //@line 7222
        HEAP32[$214 + 24 >> 2] = $$3400; //@line 7224
        break;
       }
      }
     } while (0);
     $220 = HEAP32[$213 + 4 >> 2] | 0; //@line 7230
     if ($220 | 0) {
      if ((HEAP32[1532] | 0) >>> 0 > $220 >>> 0) {
       _abort(); //@line 7236
      } else {
       HEAP32[$$3400 + 20 >> 2] = $220; //@line 7240
       HEAP32[$220 + 24 >> 2] = $$3400; //@line 7242
       break;
      }
     }
    }
   }
  } while (0);
  HEAP32[$$1 + 4 >> 2] = $137 | 1; //@line 7251
  HEAP32[$114 + $137 >> 2] = $137; //@line 7253
  if (($$1 | 0) == (HEAP32[1533] | 0)) {
   HEAP32[1530] = $137; //@line 7257
   return;
  } else {
   $$2 = $137; //@line 7260
  }
 } else {
  HEAP32[$115 >> 2] = $116 & -2; //@line 7264
  HEAP32[$$1 + 4 >> 2] = $$1382 | 1; //@line 7267
  HEAP32[$114 + $$1382 >> 2] = $$1382; //@line 7269
  $$2 = $$1382; //@line 7270
 }
 $235 = $$2 >>> 3; //@line 7272
 if ($$2 >>> 0 < 256) {
  $238 = 6152 + ($235 << 1 << 2) | 0; //@line 7276
  $239 = HEAP32[1528] | 0; //@line 7277
  $240 = 1 << $235; //@line 7278
  if (!($239 & $240)) {
   HEAP32[1528] = $239 | $240; //@line 7283
   $$0403 = $238; //@line 7285
   $$pre$phiZ2D = $238 + 8 | 0; //@line 7285
  } else {
   $244 = $238 + 8 | 0; //@line 7287
   $245 = HEAP32[$244 >> 2] | 0; //@line 7288
   if ((HEAP32[1532] | 0) >>> 0 > $245 >>> 0) {
    _abort(); //@line 7292
   } else {
    $$0403 = $245; //@line 7295
    $$pre$phiZ2D = $244; //@line 7295
   }
  }
  HEAP32[$$pre$phiZ2D >> 2] = $$1; //@line 7298
  HEAP32[$$0403 + 12 >> 2] = $$1; //@line 7300
  HEAP32[$$1 + 8 >> 2] = $$0403; //@line 7302
  HEAP32[$$1 + 12 >> 2] = $238; //@line 7304
  return;
 }
 $251 = $$2 >>> 8; //@line 7307
 if (!$251) {
  $$0396 = 0; //@line 7310
 } else {
  if ($$2 >>> 0 > 16777215) {
   $$0396 = 31; //@line 7314
  } else {
   $256 = ($251 + 1048320 | 0) >>> 16 & 8; //@line 7318
   $257 = $251 << $256; //@line 7319
   $260 = ($257 + 520192 | 0) >>> 16 & 4; //@line 7322
   $262 = $257 << $260; //@line 7324
   $265 = ($262 + 245760 | 0) >>> 16 & 2; //@line 7327
   $270 = 14 - ($260 | $256 | $265) + ($262 << $265 >>> 15) | 0; //@line 7332
   $$0396 = $$2 >>> ($270 + 7 | 0) & 1 | $270 << 1; //@line 7338
  }
 }
 $276 = 6416 + ($$0396 << 2) | 0; //@line 7341
 HEAP32[$$1 + 28 >> 2] = $$0396; //@line 7343
 HEAP32[$$1 + 20 >> 2] = 0; //@line 7346
 HEAP32[$$1 + 16 >> 2] = 0; //@line 7347
 $280 = HEAP32[1529] | 0; //@line 7348
 $281 = 1 << $$0396; //@line 7349
 do {
  if (!($280 & $281)) {
   HEAP32[1529] = $280 | $281; //@line 7355
   HEAP32[$276 >> 2] = $$1; //@line 7356
   HEAP32[$$1 + 24 >> 2] = $276; //@line 7358
   HEAP32[$$1 + 12 >> 2] = $$1; //@line 7360
   HEAP32[$$1 + 8 >> 2] = $$1; //@line 7362
  } else {
   $$0383 = $$2 << (($$0396 | 0) == 31 ? 0 : 25 - ($$0396 >>> 1) | 0); //@line 7370
   $$0384 = HEAP32[$276 >> 2] | 0; //@line 7370
   while (1) {
    if ((HEAP32[$$0384 + 4 >> 2] & -8 | 0) == ($$2 | 0)) {
     label = 124; //@line 7377
     break;
    }
    $299 = $$0384 + 16 + ($$0383 >>> 31 << 2) | 0; //@line 7381
    $301 = HEAP32[$299 >> 2] | 0; //@line 7383
    if (!$301) {
     label = 121; //@line 7386
     break;
    } else {
     $$0383 = $$0383 << 1; //@line 7389
     $$0384 = $301; //@line 7389
    }
   }
   if ((label | 0) == 121) {
    if ((HEAP32[1532] | 0) >>> 0 > $299 >>> 0) {
     _abort(); //@line 7396
    } else {
     HEAP32[$299 >> 2] = $$1; //@line 7399
     HEAP32[$$1 + 24 >> 2] = $$0384; //@line 7401
     HEAP32[$$1 + 12 >> 2] = $$1; //@line 7403
     HEAP32[$$1 + 8 >> 2] = $$1; //@line 7405
     break;
    }
   } else if ((label | 0) == 124) {
    $308 = $$0384 + 8 | 0; //@line 7410
    $309 = HEAP32[$308 >> 2] | 0; //@line 7411
    $310 = HEAP32[1532] | 0; //@line 7412
    if ($310 >>> 0 <= $309 >>> 0 & $310 >>> 0 <= $$0384 >>> 0) {
     HEAP32[$309 + 12 >> 2] = $$1; //@line 7418
     HEAP32[$308 >> 2] = $$1; //@line 7419
     HEAP32[$$1 + 8 >> 2] = $309; //@line 7421
     HEAP32[$$1 + 12 >> 2] = $$0384; //@line 7423
     HEAP32[$$1 + 24 >> 2] = 0; //@line 7425
     break;
    } else {
     _abort(); //@line 7428
    }
   }
  }
 } while (0);
 $319 = (HEAP32[1536] | 0) + -1 | 0; //@line 7435
 HEAP32[1536] = $319; //@line 7436
 if (!$319) {
  $$0212$in$i = 6568; //@line 7439
 } else {
  return;
 }
 while (1) {
  $$0212$i = HEAP32[$$0212$in$i >> 2] | 0; //@line 7444
  if (!$$0212$i) {
   break;
  } else {
   $$0212$in$i = $$0212$i + 8 | 0; //@line 7450
  }
 }
 HEAP32[1536] = -1; //@line 7453
 return;
}
function _equeue_dispatch($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0 = 0, $$02329$i$i = 0, $$02330$i$i = 0, $$025$i$i = 0, $$03956$i = 0, $$03956$i$phi = 0, $$04055$i = 0, $$0405571$i = 0, $$04063$i = 0, $$04159$i = 0, $$04258$i = 0, $$057$i = 0, $$067 = 0, $$06992 = 0, $$2 = 0, $$idx = 0, $$sink$in$i$i = 0, $$sroa$0$i = 0, $$sroa$0$i$0$$sroa$0$0$$sroa$0$0$$0$4353$pre$i75 = 0, $$sroa$0$i$0$$sroa$0$0$$sroa$0$0$$0$52$i74 = 0, $10 = 0, $106 = 0, $11 = 0, $12 = 0, $129 = 0, $13 = 0, $131 = 0, $132 = 0, $133 = 0, $135 = 0, $136 = 0, $14 = 0, $144 = 0, $145 = 0, $147 = 0, $15 = 0, $150 = 0, $152 = 0, $155 = 0, $158 = 0, $165 = 0, $169 = 0, $172 = 0, $178 = 0, $2 = 0, $23 = 0, $24 = 0, $27 = 0, $33 = 0, $42 = 0, $45 = 0, $46 = 0, $48 = 0, $5 = 0, $6 = 0, $7 = 0, $72 = 0, $74 = 0, $77 = 0, $8 = 0, $9 = 0, $96 = 0, $97 = 0, $AsyncCtx = 0, $AsyncCtx11 = 0, $AsyncCtx15 = 0, $AsyncCtx3 = 0, $AsyncCtx7 = 0, label = 0, sp = 0, $$04159$i$looptemp = 0, $$04258$i$looptemp = 0;
 sp = STACKTOP; //@line 1077
 STACKTOP = STACKTOP + 16 | 0; //@line 1078
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 1078
 $$sroa$0$i = sp; //@line 1079
 $2 = $0 + 184 | 0; //@line 1080
 if (!(HEAP8[$2 >> 0] | 0)) {
  HEAP8[$2 >> 0] = 1; //@line 1084
 }
 $5 = _equeue_tick() | 0; //@line 1086
 $6 = $5 + $1 | 0; //@line 1087
 $7 = $0 + 36 | 0; //@line 1088
 HEAP8[$7 >> 0] = 0; //@line 1089
 $8 = $0 + 128 | 0; //@line 1090
 $9 = $0 + 9 | 0; //@line 1091
 $10 = $0 + 4 | 0; //@line 1092
 $11 = ($1 | 0) > -1; //@line 1093
 $12 = $0 + 48 | 0; //@line 1094
 $13 = $0 + 8 | 0; //@line 1095
 $$idx = $0 + 16 | 0; //@line 1096
 $14 = $0 + 156 | 0; //@line 1097
 $15 = $0 + 24 | 0; //@line 1098
 $$0 = $5; //@line 1099
 L4 : while (1) {
  _equeue_mutex_lock($8); //@line 1101
  HEAP8[$9 >> 0] = (HEAPU8[$9 >> 0] | 0) + 1; //@line 1106
  if (((HEAP32[$10 >> 2] | 0) - $$0 | 0) < 1) {
   HEAP32[$10 >> 2] = $$0; //@line 1111
  }
  $23 = HEAP32[$0 >> 2] | 0; //@line 1113
  HEAP32[$$sroa$0$i >> 2] = $23; //@line 1114
  $24 = $23; //@line 1115
  L9 : do {
   if (!$23) {
    $$04055$i = $$sroa$0$i; //@line 1119
    $33 = $24; //@line 1119
    label = 10; //@line 1120
   } else {
    $$04063$i = $$sroa$0$i; //@line 1122
    $27 = $24; //@line 1122
    do {
     if (((HEAP32[$27 + 20 >> 2] | 0) - $$0 | 0) >= 1) {
      $$04055$i = $$04063$i; //@line 1129
      $33 = $27; //@line 1129
      label = 10; //@line 1130
      break L9;
     }
     $$04063$i = $27 + 8 | 0; //@line 1133
     $27 = HEAP32[$$04063$i >> 2] | 0; //@line 1134
    } while (($27 | 0) != 0);
    HEAP32[$0 >> 2] = 0; //@line 1142
    $$0405571$i = $$04063$i; //@line 1143
   }
  } while (0);
  if ((label | 0) == 10) {
   label = 0; //@line 1147
   HEAP32[$0 >> 2] = $33; //@line 1148
   if (!$33) {
    $$0405571$i = $$04055$i; //@line 1151
   } else {
    HEAP32[$33 + 16 >> 2] = $0; //@line 1154
    $$0405571$i = $$04055$i; //@line 1155
   }
  }
  HEAP32[$$0405571$i >> 2] = 0; //@line 1158
  _equeue_mutex_unlock($8); //@line 1159
  $$sroa$0$i$0$$sroa$0$0$$sroa$0$0$$0$52$i74 = HEAP32[$$sroa$0$i >> 2] | 0; //@line 1160
  if (!$$sroa$0$i$0$$sroa$0$0$$sroa$0$0$$0$52$i74) {} else {
   $$04159$i = $$sroa$0$i$0$$sroa$0$0$$sroa$0$0$$0$52$i74; //@line 1164
   $$04258$i = $$sroa$0$i; //@line 1164
   do {
    $$04258$i$looptemp = $$04258$i;
    $$04258$i = $$04159$i + 8 | 0; //@line 1166
    $$04159$i$looptemp = $$04159$i;
    $$04159$i = HEAP32[$$04258$i >> 2] | 0; //@line 1167
    $$03956$i = 0; //@line 1168
    $$057$i = $$04159$i$looptemp; //@line 1168
    while (1) {
     HEAP32[$$057$i + 8 >> 2] = $$03956$i; //@line 1171
     $42 = HEAP32[$$057$i + 12 >> 2] | 0; //@line 1173
     if (!$42) {
      break;
     } else {
      $$03956$i$phi = $$057$i; //@line 1178
      $$057$i = $42; //@line 1178
      $$03956$i = $$03956$i$phi; //@line 1178
     }
    }
    HEAP32[$$04258$i$looptemp >> 2] = $$057$i; //@line 1181
   } while (($$04159$i | 0) != 0);
   $$sroa$0$i$0$$sroa$0$0$$sroa$0$0$$0$4353$pre$i75 = HEAP32[$$sroa$0$i >> 2] | 0; //@line 1189
   if ($$sroa$0$i$0$$sroa$0$0$$sroa$0$0$$0$4353$pre$i75 | 0) {
    $$06992 = $$sroa$0$i$0$$sroa$0$0$$sroa$0$0$$0$4353$pre$i75; //@line 1192
    while (1) {
     $45 = $$06992 + 8 | 0; //@line 1194
     $46 = HEAP32[$45 >> 2] | 0; //@line 1195
     $48 = HEAP32[$$06992 + 32 >> 2] | 0; //@line 1197
     if ($48 | 0) {
      $AsyncCtx = _emscripten_alloc_async_context(84, sp) | 0; //@line 1201
      FUNCTION_TABLE_vi[$48 & 255]($$06992 + 36 | 0); //@line 1202
      if (___async) {
       label = 20; //@line 1205
       break L4;
      }
      _emscripten_free_async_context($AsyncCtx | 0); //@line 1208
     }
     $72 = HEAP32[$$06992 + 24 >> 2] | 0; //@line 1211
     if (($72 | 0) > -1) {
      $74 = $$06992 + 20 | 0; //@line 1214
      HEAP32[$74 >> 2] = (HEAP32[$74 >> 2] | 0) + $72; //@line 1217
      $77 = _equeue_tick() | 0; //@line 1218
      $AsyncCtx11 = _emscripten_alloc_async_context(76, sp) | 0; //@line 1219
      _equeue_enqueue($0, $$06992, $77) | 0; //@line 1220
      if (___async) {
       label = 24; //@line 1223
       break L4;
      }
      _emscripten_free_async_context($AsyncCtx11 | 0); //@line 1226
     } else {
      $96 = $$06992 + 4 | 0; //@line 1229
      $97 = HEAP8[$96 >> 0] | 0; //@line 1230
      HEAP8[$96 >> 0] = (($97 + 1 & 255) << HEAP32[$$idx >> 2] | 0) == 0 ? 1 : ($97 & 255) + 1 & 255; //@line 1239
      $106 = HEAP32[$$06992 + 28 >> 2] | 0; //@line 1241
      if ($106 | 0) {
       $AsyncCtx3 = _emscripten_alloc_async_context(84, sp) | 0; //@line 1245
       FUNCTION_TABLE_vi[$106 & 255]($$06992 + 36 | 0); //@line 1246
       if (___async) {
        label = 28; //@line 1249
        break L4;
       }
       _emscripten_free_async_context($AsyncCtx3 | 0); //@line 1252
      }
      _equeue_mutex_lock($14); //@line 1254
      $129 = HEAP32[$15 >> 2] | 0; //@line 1255
      L40 : do {
       if (!$129) {
        $$02329$i$i = $15; //@line 1259
        label = 36; //@line 1260
       } else {
        $131 = HEAP32[$$06992 >> 2] | 0; //@line 1262
        $$025$i$i = $15; //@line 1263
        $133 = $129; //@line 1263
        while (1) {
         $132 = HEAP32[$133 >> 2] | 0; //@line 1265
         if ($132 >>> 0 >= $131 >>> 0) {
          break;
         }
         $135 = $133 + 8 | 0; //@line 1270
         $136 = HEAP32[$135 >> 2] | 0; //@line 1271
         if (!$136) {
          $$02329$i$i = $135; //@line 1274
          label = 36; //@line 1275
          break L40;
         } else {
          $$025$i$i = $135; //@line 1278
          $133 = $136; //@line 1278
         }
        }
        if (($132 | 0) == ($131 | 0)) {
         HEAP32[$$06992 + 12 >> 2] = $133; //@line 1284
         $$02330$i$i = $$025$i$i; //@line 1287
         $$sink$in$i$i = (HEAP32[$$025$i$i >> 2] | 0) + 8 | 0; //@line 1287
        } else {
         $$02329$i$i = $$025$i$i; //@line 1289
         label = 36; //@line 1290
        }
       }
      } while (0);
      if ((label | 0) == 36) {
       label = 0; //@line 1295
       HEAP32[$$06992 + 12 >> 2] = 0; //@line 1297
       $$02330$i$i = $$02329$i$i; //@line 1298
       $$sink$in$i$i = $$02329$i$i; //@line 1298
      }
      HEAP32[$45 >> 2] = HEAP32[$$sink$in$i$i >> 2]; //@line 1301
      HEAP32[$$02330$i$i >> 2] = $$06992; //@line 1302
      _equeue_mutex_unlock($14); //@line 1303
     }
     if (!$46) {
      break;
     } else {
      $$06992 = $46; //@line 1309
     }
    }
   }
  }
  $144 = _equeue_tick() | 0; //@line 1314
  if ($11) {
   $145 = $6 - $144 | 0; //@line 1316
   if (($145 | 0) < 1) {
    label = 41; //@line 1319
    break;
   } else {
    $$067 = $145; //@line 1322
   }
  } else {
   $$067 = -1; //@line 1325
  }
  _equeue_mutex_lock($8); //@line 1327
  $165 = HEAP32[$0 >> 2] | 0; //@line 1328
  if (!$165) {
   $$2 = $$067; //@line 1331
  } else {
   $169 = (HEAP32[$165 + 20 >> 2] | 0) - $144 | 0; //@line 1335
   $172 = $169 & ~($169 >> 31); //@line 1338
   $$2 = $172 >>> 0 < $$067 >>> 0 ? $172 : $$067; //@line 1341
  }
  _equeue_mutex_unlock($8); //@line 1343
  _equeue_sema_wait($12, $$2) | 0; //@line 1344
  if (HEAP8[$13 >> 0] | 0) {
   _equeue_mutex_lock($8); //@line 1348
   if (HEAP8[$13 >> 0] | 0) {
    label = 53; //@line 1352
    break;
   }
   _equeue_mutex_unlock($8); //@line 1355
  }
  $178 = _equeue_tick() | 0; //@line 1357
  $AsyncCtx15 = _emscripten_alloc_async_context(76, sp) | 0; //@line 1358
  _wait_ms(20); //@line 1359
  if (___async) {
   label = 56; //@line 1362
   break;
  }
  _emscripten_free_async_context($AsyncCtx15 | 0); //@line 1365
  $$0 = $178; //@line 1366
 }
 if ((label | 0) == 20) {
  HEAP32[$AsyncCtx >> 2] = 30; //@line 1369
  HEAP32[$AsyncCtx + 4 >> 2] = $46; //@line 1371
  HEAP32[$AsyncCtx + 8 >> 2] = $$sroa$0$i; //@line 1373
  HEAP32[$AsyncCtx + 12 >> 2] = $$sroa$0$i; //@line 1375
  HEAP32[$AsyncCtx + 16 >> 2] = $8; //@line 1377
  HEAP32[$AsyncCtx + 20 >> 2] = $13; //@line 1379
  HEAP32[$AsyncCtx + 24 >> 2] = $15; //@line 1381
  HEAP32[$AsyncCtx + 28 >> 2] = $14; //@line 1383
  HEAP32[$AsyncCtx + 32 >> 2] = $$06992; //@line 1385
  HEAP32[$AsyncCtx + 36 >> 2] = $$idx; //@line 1387
  HEAP32[$AsyncCtx + 40 >> 2] = $0; //@line 1389
  HEAP32[$AsyncCtx + 44 >> 2] = $6; //@line 1391
  HEAP8[$AsyncCtx + 48 >> 0] = $11 & 1; //@line 1394
  HEAP32[$AsyncCtx + 52 >> 2] = $45; //@line 1396
  HEAP32[$AsyncCtx + 56 >> 2] = $12; //@line 1398
  HEAP32[$AsyncCtx + 60 >> 2] = $0; //@line 1400
  HEAP32[$AsyncCtx + 64 >> 2] = $0; //@line 1402
  HEAP32[$AsyncCtx + 68 >> 2] = $$sroa$0$i; //@line 1404
  HEAP32[$AsyncCtx + 72 >> 2] = $7; //@line 1406
  HEAP32[$AsyncCtx + 76 >> 2] = $9; //@line 1408
  HEAP32[$AsyncCtx + 80 >> 2] = $10; //@line 1410
  sp = STACKTOP; //@line 1411
  STACKTOP = sp; //@line 1412
  return;
 } else if ((label | 0) == 24) {
  HEAP32[$AsyncCtx11 >> 2] = 31; //@line 1415
  HEAP32[$AsyncCtx11 + 4 >> 2] = $46; //@line 1417
  HEAP32[$AsyncCtx11 + 8 >> 2] = $$sroa$0$i; //@line 1419
  HEAP32[$AsyncCtx11 + 12 >> 2] = $$sroa$0$i; //@line 1421
  HEAP32[$AsyncCtx11 + 16 >> 2] = $8; //@line 1423
  HEAP32[$AsyncCtx11 + 20 >> 2] = $13; //@line 1425
  HEAP32[$AsyncCtx11 + 24 >> 2] = $15; //@line 1427
  HEAP32[$AsyncCtx11 + 28 >> 2] = $14; //@line 1429
  HEAP32[$AsyncCtx11 + 32 >> 2] = $$idx; //@line 1431
  HEAP32[$AsyncCtx11 + 36 >> 2] = $0; //@line 1433
  HEAP32[$AsyncCtx11 + 40 >> 2] = $6; //@line 1435
  HEAP8[$AsyncCtx11 + 44 >> 0] = $11 & 1; //@line 1438
  HEAP32[$AsyncCtx11 + 48 >> 2] = $12; //@line 1440
  HEAP32[$AsyncCtx11 + 52 >> 2] = $0; //@line 1442
  HEAP32[$AsyncCtx11 + 56 >> 2] = $0; //@line 1444
  HEAP32[$AsyncCtx11 + 60 >> 2] = $$sroa$0$i; //@line 1446
  HEAP32[$AsyncCtx11 + 64 >> 2] = $7; //@line 1448
  HEAP32[$AsyncCtx11 + 68 >> 2] = $9; //@line 1450
  HEAP32[$AsyncCtx11 + 72 >> 2] = $10; //@line 1452
  sp = STACKTOP; //@line 1453
  STACKTOP = sp; //@line 1454
  return;
 } else if ((label | 0) == 28) {
  HEAP32[$AsyncCtx3 >> 2] = 32; //@line 1457
  HEAP32[$AsyncCtx3 + 4 >> 2] = $46; //@line 1459
  HEAP32[$AsyncCtx3 + 8 >> 2] = $$sroa$0$i; //@line 1461
  HEAP32[$AsyncCtx3 + 12 >> 2] = $$sroa$0$i; //@line 1463
  HEAP32[$AsyncCtx3 + 16 >> 2] = $8; //@line 1465
  HEAP32[$AsyncCtx3 + 20 >> 2] = $13; //@line 1467
  HEAP32[$AsyncCtx3 + 24 >> 2] = $15; //@line 1469
  HEAP32[$AsyncCtx3 + 28 >> 2] = $14; //@line 1471
  HEAP32[$AsyncCtx3 + 32 >> 2] = $$idx; //@line 1473
  HEAP32[$AsyncCtx3 + 36 >> 2] = $0; //@line 1475
  HEAP32[$AsyncCtx3 + 40 >> 2] = $6; //@line 1477
  HEAP8[$AsyncCtx3 + 44 >> 0] = $11 & 1; //@line 1480
  HEAP32[$AsyncCtx3 + 48 >> 2] = $12; //@line 1482
  HEAP32[$AsyncCtx3 + 52 >> 2] = $0; //@line 1484
  HEAP32[$AsyncCtx3 + 56 >> 2] = $0; //@line 1486
  HEAP32[$AsyncCtx3 + 60 >> 2] = $$sroa$0$i; //@line 1488
  HEAP32[$AsyncCtx3 + 64 >> 2] = $7; //@line 1490
  HEAP32[$AsyncCtx3 + 68 >> 2] = $9; //@line 1492
  HEAP32[$AsyncCtx3 + 72 >> 2] = $10; //@line 1494
  HEAP32[$AsyncCtx3 + 76 >> 2] = $$06992; //@line 1496
  HEAP32[$AsyncCtx3 + 80 >> 2] = $45; //@line 1498
  sp = STACKTOP; //@line 1499
  STACKTOP = sp; //@line 1500
  return;
 } else if ((label | 0) == 41) {
  $147 = $0 + 40 | 0; //@line 1503
  if (HEAP32[$147 >> 2] | 0) {
   _equeue_mutex_lock($8); //@line 1507
   $150 = HEAP32[$147 >> 2] | 0; //@line 1508
   do {
    if ($150 | 0) {
     $152 = HEAP32[$0 >> 2] | 0; //@line 1512
     if ($152 | 0) {
      $155 = HEAP32[$0 + 44 >> 2] | 0; //@line 1516
      $158 = (HEAP32[$152 + 20 >> 2] | 0) - $144 | 0; //@line 1519
      $AsyncCtx7 = _emscripten_alloc_async_context(16, sp) | 0; //@line 1523
      FUNCTION_TABLE_vii[$150 & 3]($155, $158 & ~($158 >> 31)); //@line 1524
      if (___async) {
       HEAP32[$AsyncCtx7 >> 2] = 33; //@line 1527
       HEAP32[$AsyncCtx7 + 4 >> 2] = $7; //@line 1529
       HEAP32[$AsyncCtx7 + 8 >> 2] = $8; //@line 1531
       HEAP32[$AsyncCtx7 + 12 >> 2] = $13; //@line 1533
       sp = STACKTOP; //@line 1534
       STACKTOP = sp; //@line 1535
       return;
      } else {
       _emscripten_free_async_context($AsyncCtx7 | 0); //@line 1537
       break;
      }
     }
    }
   } while (0);
   HEAP8[$7 >> 0] = 1; //@line 1543
   _equeue_mutex_unlock($8); //@line 1544
  }
  HEAP8[$13 >> 0] = 0; //@line 1546
  STACKTOP = sp; //@line 1547
  return;
 } else if ((label | 0) == 53) {
  HEAP8[$13 >> 0] = 0; //@line 1550
  _equeue_mutex_unlock($8); //@line 1551
  STACKTOP = sp; //@line 1552
  return;
 } else if ((label | 0) == 56) {
  HEAP32[$AsyncCtx15 >> 2] = 34; //@line 1555
  HEAP32[$AsyncCtx15 + 4 >> 2] = $$sroa$0$i; //@line 1557
  HEAP32[$AsyncCtx15 + 8 >> 2] = $$sroa$0$i; //@line 1559
  HEAP32[$AsyncCtx15 + 12 >> 2] = $8; //@line 1561
  HEAP32[$AsyncCtx15 + 16 >> 2] = $13; //@line 1563
  HEAP32[$AsyncCtx15 + 20 >> 2] = $15; //@line 1565
  HEAP32[$AsyncCtx15 + 24 >> 2] = $14; //@line 1567
  HEAP32[$AsyncCtx15 + 28 >> 2] = $$idx; //@line 1569
  HEAP32[$AsyncCtx15 + 32 >> 2] = $0; //@line 1571
  HEAP32[$AsyncCtx15 + 36 >> 2] = $6; //@line 1573
  HEAP8[$AsyncCtx15 + 40 >> 0] = $11 & 1; //@line 1576
  HEAP32[$AsyncCtx15 + 44 >> 2] = $12; //@line 1578
  HEAP32[$AsyncCtx15 + 48 >> 2] = $0; //@line 1580
  HEAP32[$AsyncCtx15 + 52 >> 2] = $0; //@line 1582
  HEAP32[$AsyncCtx15 + 56 >> 2] = $$sroa$0$i; //@line 1584
  HEAP32[$AsyncCtx15 + 60 >> 2] = $7; //@line 1586
  HEAP32[$AsyncCtx15 + 64 >> 2] = $9; //@line 1588
  HEAP32[$AsyncCtx15 + 68 >> 2] = $10; //@line 1590
  HEAP32[$AsyncCtx15 + 72 >> 2] = $178; //@line 1592
  sp = STACKTOP; //@line 1593
  STACKTOP = sp; //@line 1594
  return;
 }
}
function _twoway_strstr($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0166 = 0, $$0168 = 0, $$0169 = 0, $$0169$be = 0, $$0170 = 0, $$0175$ph$ph$lcssa216 = 0, $$0175$ph$ph$lcssa216328 = 0, $$0175$ph$ph254 = 0, $$0179242 = 0, $$0183$ph197$ph253 = 0, $$0183$ph197248 = 0, $$0183$ph260 = 0, $$0185$ph$lcssa = 0, $$0185$ph$lcssa327 = 0, $$0185$ph259 = 0, $$0187219$ph325326 = 0, $$0187263 = 0, $$1176$$0175 = 0, $$1176$ph$ph$lcssa208 = 0, $$1176$ph$ph233 = 0, $$1180222 = 0, $$1184$ph193$ph232 = 0, $$1184$ph193227 = 0, $$1184$ph239 = 0, $$1186$$0185 = 0, $$1186$ph$lcssa = 0, $$1186$ph238 = 0, $$2181$sink = 0, $$3 = 0, $$3173 = 0, $$3178 = 0, $$3182221 = 0, $$4 = 0, $$pr = 0, $10 = 0, $105 = 0, $111 = 0, $113 = 0, $118 = 0, $130 = 0, $131 = 0, $132 = 0, $133 = 0, $134 = 0, $135 = 0, $14 = 0, $2 = 0, $23 = 0, $25 = 0, $27 = 0, $3 = 0, $32 = 0, $34 = 0, $37 = 0, $4 = 0, $41 = 0, $45 = 0, $50 = 0, $52 = 0, $53 = 0, $56 = 0, $60 = 0, $68 = 0, $70 = 0, $74 = 0, $78 = 0, $79 = 0, $80 = 0, $81 = 0, $83 = 0, $86 = 0, $93 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 11793
 STACKTOP = STACKTOP + 1056 | 0; //@line 11794
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(1056); //@line 11794
 $2 = sp + 1024 | 0; //@line 11795
 $3 = sp; //@line 11796
 HEAP32[$2 >> 2] = 0; //@line 11797
 HEAP32[$2 + 4 >> 2] = 0; //@line 11797
 HEAP32[$2 + 8 >> 2] = 0; //@line 11797
 HEAP32[$2 + 12 >> 2] = 0; //@line 11797
 HEAP32[$2 + 16 >> 2] = 0; //@line 11797
 HEAP32[$2 + 20 >> 2] = 0; //@line 11797
 HEAP32[$2 + 24 >> 2] = 0; //@line 11797
 HEAP32[$2 + 28 >> 2] = 0; //@line 11797
 $4 = HEAP8[$1 >> 0] | 0; //@line 11798
 L1 : do {
  if (!($4 << 24 >> 24)) {
   $$0175$ph$ph$lcssa216328 = 1; //@line 11802
   $$0185$ph$lcssa327 = -1; //@line 11802
   $$0187219$ph325326 = 0; //@line 11802
   $$1176$ph$ph$lcssa208 = 1; //@line 11802
   $$1186$ph$lcssa = -1; //@line 11802
   label = 26; //@line 11803
  } else {
   $$0187263 = 0; //@line 11805
   $10 = $4; //@line 11805
   do {
    if (!(HEAP8[$0 + $$0187263 >> 0] | 0)) {
     $$3 = 0; //@line 11811
     break L1;
    }
    $14 = $2 + ((($10 & 255) >>> 5 & 255) << 2) | 0; //@line 11819
    HEAP32[$14 >> 2] = HEAP32[$14 >> 2] | 1 << ($10 & 31); //@line 11822
    $$0187263 = $$0187263 + 1 | 0; //@line 11823
    HEAP32[$3 + (($10 & 255) << 2) >> 2] = $$0187263; //@line 11826
    $10 = HEAP8[$1 + $$0187263 >> 0] | 0; //@line 11828
   } while ($10 << 24 >> 24 != 0);
   $23 = $$0187263 >>> 0 > 1; //@line 11836
   if ($23) {
    $$0183$ph260 = 0; //@line 11838
    $$0185$ph259 = -1; //@line 11838
    $130 = 1; //@line 11838
    L6 : while (1) {
     $$0175$ph$ph254 = 1; //@line 11840
     $$0183$ph197$ph253 = $$0183$ph260; //@line 11840
     $131 = $130; //@line 11840
     while (1) {
      $$0183$ph197248 = $$0183$ph197$ph253; //@line 11842
      $132 = $131; //@line 11842
      L10 : while (1) {
       $$0179242 = 1; //@line 11844
       $25 = $132; //@line 11844
       while (1) {
        $32 = HEAP8[$1 + ($$0179242 + $$0185$ph259) >> 0] | 0; //@line 11848
        $34 = HEAP8[$1 + $25 >> 0] | 0; //@line 11850
        if ($32 << 24 >> 24 != $34 << 24 >> 24) {
         break L10;
        }
        if (($$0179242 | 0) == ($$0175$ph$ph254 | 0)) {
         break;
        }
        $$0179242 = $$0179242 + 1 | 0; //@line 11856
        $27 = $$0179242 + $$0183$ph197248 | 0; //@line 11860
        if ($27 >>> 0 >= $$0187263 >>> 0) {
         $$0175$ph$ph$lcssa216 = $$0175$ph$ph254; //@line 11865
         $$0185$ph$lcssa = $$0185$ph259; //@line 11865
         break L6;
        } else {
         $25 = $27; //@line 11863
        }
       }
       $37 = $$0175$ph$ph254 + $$0183$ph197248 | 0; //@line 11869
       $132 = $37 + 1 | 0; //@line 11870
       if ($132 >>> 0 >= $$0187263 >>> 0) {
        $$0175$ph$ph$lcssa216 = $$0175$ph$ph254; //@line 11875
        $$0185$ph$lcssa = $$0185$ph259; //@line 11875
        break L6;
       } else {
        $$0183$ph197248 = $37; //@line 11873
       }
      }
      $41 = $25 - $$0185$ph259 | 0; //@line 11880
      if (($32 & 255) <= ($34 & 255)) {
       break;
      }
      $131 = $25 + 1 | 0; //@line 11884
      if ($131 >>> 0 >= $$0187263 >>> 0) {
       $$0175$ph$ph$lcssa216 = $41; //@line 11889
       $$0185$ph$lcssa = $$0185$ph259; //@line 11889
       break L6;
      } else {
       $$0175$ph$ph254 = $41; //@line 11887
       $$0183$ph197$ph253 = $25; //@line 11887
      }
     }
     $130 = $$0183$ph197248 + 2 | 0; //@line 11894
     if ($130 >>> 0 >= $$0187263 >>> 0) {
      $$0175$ph$ph$lcssa216 = 1; //@line 11899
      $$0185$ph$lcssa = $$0183$ph197248; //@line 11899
      break;
     } else {
      $$0183$ph260 = $$0183$ph197248 + 1 | 0; //@line 11897
      $$0185$ph259 = $$0183$ph197248; //@line 11897
     }
    }
    if ($23) {
     $$1184$ph239 = 0; //@line 11904
     $$1186$ph238 = -1; //@line 11904
     $133 = 1; //@line 11904
     while (1) {
      $$1176$ph$ph233 = 1; //@line 11906
      $$1184$ph193$ph232 = $$1184$ph239; //@line 11906
      $135 = $133; //@line 11906
      while (1) {
       $$1184$ph193227 = $$1184$ph193$ph232; //@line 11908
       $134 = $135; //@line 11908
       L25 : while (1) {
        $$1180222 = 1; //@line 11910
        $52 = $134; //@line 11910
        while (1) {
         $50 = HEAP8[$1 + ($$1180222 + $$1186$ph238) >> 0] | 0; //@line 11914
         $53 = HEAP8[$1 + $52 >> 0] | 0; //@line 11916
         if ($50 << 24 >> 24 != $53 << 24 >> 24) {
          break L25;
         }
         if (($$1180222 | 0) == ($$1176$ph$ph233 | 0)) {
          break;
         }
         $$1180222 = $$1180222 + 1 | 0; //@line 11922
         $45 = $$1180222 + $$1184$ph193227 | 0; //@line 11926
         if ($45 >>> 0 >= $$0187263 >>> 0) {
          $$0175$ph$ph$lcssa216328 = $$0175$ph$ph$lcssa216; //@line 11931
          $$0185$ph$lcssa327 = $$0185$ph$lcssa; //@line 11931
          $$0187219$ph325326 = $$0187263; //@line 11931
          $$1176$ph$ph$lcssa208 = $$1176$ph$ph233; //@line 11931
          $$1186$ph$lcssa = $$1186$ph238; //@line 11931
          label = 26; //@line 11932
          break L1;
         } else {
          $52 = $45; //@line 11929
         }
        }
        $56 = $$1176$ph$ph233 + $$1184$ph193227 | 0; //@line 11936
        $134 = $56 + 1 | 0; //@line 11937
        if ($134 >>> 0 >= $$0187263 >>> 0) {
         $$0175$ph$ph$lcssa216328 = $$0175$ph$ph$lcssa216; //@line 11942
         $$0185$ph$lcssa327 = $$0185$ph$lcssa; //@line 11942
         $$0187219$ph325326 = $$0187263; //@line 11942
         $$1176$ph$ph$lcssa208 = $$1176$ph$ph233; //@line 11942
         $$1186$ph$lcssa = $$1186$ph238; //@line 11942
         label = 26; //@line 11943
         break L1;
        } else {
         $$1184$ph193227 = $56; //@line 11940
        }
       }
       $60 = $52 - $$1186$ph238 | 0; //@line 11948
       if (($50 & 255) >= ($53 & 255)) {
        break;
       }
       $135 = $52 + 1 | 0; //@line 11952
       if ($135 >>> 0 >= $$0187263 >>> 0) {
        $$0175$ph$ph$lcssa216328 = $$0175$ph$ph$lcssa216; //@line 11957
        $$0185$ph$lcssa327 = $$0185$ph$lcssa; //@line 11957
        $$0187219$ph325326 = $$0187263; //@line 11957
        $$1176$ph$ph$lcssa208 = $60; //@line 11957
        $$1186$ph$lcssa = $$1186$ph238; //@line 11957
        label = 26; //@line 11958
        break L1;
       } else {
        $$1176$ph$ph233 = $60; //@line 11955
        $$1184$ph193$ph232 = $52; //@line 11955
       }
      }
      $133 = $$1184$ph193227 + 2 | 0; //@line 11963
      if ($133 >>> 0 >= $$0187263 >>> 0) {
       $$0175$ph$ph$lcssa216328 = $$0175$ph$ph$lcssa216; //@line 11968
       $$0185$ph$lcssa327 = $$0185$ph$lcssa; //@line 11968
       $$0187219$ph325326 = $$0187263; //@line 11968
       $$1176$ph$ph$lcssa208 = 1; //@line 11968
       $$1186$ph$lcssa = $$1184$ph193227; //@line 11968
       label = 26; //@line 11969
       break;
      } else {
       $$1184$ph239 = $$1184$ph193227 + 1 | 0; //@line 11966
       $$1186$ph238 = $$1184$ph193227; //@line 11966
      }
     }
    } else {
     $$0175$ph$ph$lcssa216328 = $$0175$ph$ph$lcssa216; //@line 11974
     $$0185$ph$lcssa327 = $$0185$ph$lcssa; //@line 11974
     $$0187219$ph325326 = $$0187263; //@line 11974
     $$1176$ph$ph$lcssa208 = 1; //@line 11974
     $$1186$ph$lcssa = -1; //@line 11974
     label = 26; //@line 11975
    }
   } else {
    $$0175$ph$ph$lcssa216328 = 1; //@line 11978
    $$0185$ph$lcssa327 = -1; //@line 11978
    $$0187219$ph325326 = $$0187263; //@line 11978
    $$1176$ph$ph$lcssa208 = 1; //@line 11978
    $$1186$ph$lcssa = -1; //@line 11978
    label = 26; //@line 11979
   }
  }
 } while (0);
 L35 : do {
  if ((label | 0) == 26) {
   $68 = ($$1186$ph$lcssa + 1 | 0) >>> 0 > ($$0185$ph$lcssa327 + 1 | 0) >>> 0; //@line 11987
   $$1176$$0175 = $68 ? $$1176$ph$ph$lcssa208 : $$0175$ph$ph$lcssa216328; //@line 11988
   $$1186$$0185 = $68 ? $$1186$ph$lcssa : $$0185$ph$lcssa327; //@line 11989
   $70 = $$1186$$0185 + 1 | 0; //@line 11991
   if (!(_memcmp($1, $1 + $$1176$$0175 | 0, $70) | 0)) {
    $$0168 = $$0187219$ph325326 - $$1176$$0175 | 0; //@line 11996
    $$3178 = $$1176$$0175; //@line 11996
   } else {
    $74 = $$0187219$ph325326 - $$1186$$0185 + -1 | 0; //@line 11999
    $$0168 = 0; //@line 12003
    $$3178 = ($$1186$$0185 >>> 0 > $74 >>> 0 ? $$1186$$0185 : $74) + 1 | 0; //@line 12003
   }
   $78 = $$0187219$ph325326 | 63; //@line 12005
   $79 = $$0187219$ph325326 + -1 | 0; //@line 12006
   $80 = ($$0168 | 0) != 0; //@line 12007
   $81 = $$0187219$ph325326 - $$3178 | 0; //@line 12008
   $$0166 = $0; //@line 12009
   $$0169 = 0; //@line 12009
   $$0170 = $0; //@line 12009
   while (1) {
    $83 = $$0166; //@line 12012
    do {
     if (($$0170 - $83 | 0) >>> 0 < $$0187219$ph325326 >>> 0) {
      $86 = _memchr($$0170, 0, $78) | 0; //@line 12017
      if (!$86) {
       $$3173 = $$0170 + $78 | 0; //@line 12021
       break;
      } else {
       if (($86 - $83 | 0) >>> 0 < $$0187219$ph325326 >>> 0) {
        $$3 = 0; //@line 12028
        break L35;
       } else {
        $$3173 = $86; //@line 12031
        break;
       }
      }
     } else {
      $$3173 = $$0170; //@line 12036
     }
    } while (0);
    $93 = HEAP8[$$0166 + $79 >> 0] | 0; //@line 12040
    L49 : do {
     if (!(1 << ($93 & 31) & HEAP32[$2 + ((($93 & 255) >>> 5 & 255) << 2) >> 2])) {
      $$0169$be = 0; //@line 12052
      $$2181$sink = $$0187219$ph325326; //@line 12052
     } else {
      $105 = $$0187219$ph325326 - (HEAP32[$3 + (($93 & 255) << 2) >> 2] | 0) | 0; //@line 12057
      if ($105 | 0) {
       $$0169$be = 0; //@line 12065
       $$2181$sink = $80 & ($$0169 | 0) != 0 & $105 >>> 0 < $$3178 >>> 0 ? $81 : $105; //@line 12065
       break;
      }
      $111 = $70 >>> 0 > $$0169 >>> 0 ? $70 : $$0169; //@line 12069
      $113 = HEAP8[$1 + $111 >> 0] | 0; //@line 12071
      L54 : do {
       if (!($113 << 24 >> 24)) {
        $$4 = $70; //@line 12075
       } else {
        $$3182221 = $111; //@line 12077
        $$pr = $113; //@line 12077
        while (1) {
         if ($$pr << 24 >> 24 != (HEAP8[$$0166 + $$3182221 >> 0] | 0)) {
          break;
         }
         $118 = $$3182221 + 1 | 0; //@line 12085
         $$pr = HEAP8[$1 + $118 >> 0] | 0; //@line 12087
         if (!($$pr << 24 >> 24)) {
          $$4 = $70; //@line 12090
          break L54;
         } else {
          $$3182221 = $118; //@line 12093
         }
        }
        $$0169$be = 0; //@line 12097
        $$2181$sink = $$3182221 - $$1186$$0185 | 0; //@line 12097
        break L49;
       }
      } while (0);
      while (1) {
       if ($$4 >>> 0 <= $$0169 >>> 0) {
        $$3 = $$0166; //@line 12104
        break L35;
       }
       $$4 = $$4 + -1 | 0; //@line 12107
       if ((HEAP8[$1 + $$4 >> 0] | 0) != (HEAP8[$$0166 + $$4 >> 0] | 0)) {
        $$0169$be = $$0168; //@line 12116
        $$2181$sink = $$3178; //@line 12116
        break;
       }
      }
     }
    } while (0);
    $$0166 = $$0166 + $$2181$sink | 0; //@line 12123
    $$0169 = $$0169$be; //@line 12123
    $$0170 = $$3173; //@line 12123
   }
  }
 } while (0);
 STACKTOP = sp; //@line 12127
 return $$3 | 0; //@line 12127
}
function ___udivmoddi4($a$0, $a$1, $b$0, $b$1, $rem) {
 $a$0 = $a$0 | 0;
 $a$1 = $a$1 | 0;
 $b$0 = $b$0 | 0;
 $b$1 = $b$1 | 0;
 $rem = $rem | 0;
 var $n_sroa_0_0_extract_trunc = 0, $n_sroa_1_4_extract_shift$0 = 0, $n_sroa_1_4_extract_trunc = 0, $d_sroa_0_0_extract_trunc = 0, $d_sroa_1_4_extract_shift$0 = 0, $d_sroa_1_4_extract_trunc = 0, $4 = 0, $17 = 0, $37 = 0, $51 = 0, $57 = 0, $58 = 0, $66 = 0, $78 = 0, $88 = 0, $89 = 0, $91 = 0, $92 = 0, $95 = 0, $105 = 0, $119 = 0, $125 = 0, $126 = 0, $130 = 0, $q_sroa_1_1_ph = 0, $q_sroa_0_1_ph = 0, $r_sroa_1_1_ph = 0, $r_sroa_0_1_ph = 0, $sr_1_ph = 0, $d_sroa_0_0_insert_insert99$0 = 0, $d_sroa_0_0_insert_insert99$1 = 0, $137$0 = 0, $137$1 = 0, $carry_0203 = 0, $sr_1202 = 0, $r_sroa_0_1201 = 0, $r_sroa_1_1200 = 0, $q_sroa_0_1199 = 0, $q_sroa_1_1198 = 0, $r_sroa_0_0_insert_insert42$0 = 0, $r_sroa_0_0_insert_insert42$1 = 0, $150$1 = 0, $151$0 = 0, $carry_0_lcssa$0 = 0, $carry_0_lcssa$1 = 0, $r_sroa_0_1_lcssa = 0, $r_sroa_1_1_lcssa = 0, $q_sroa_0_1_lcssa = 0, $q_sroa_1_1_lcssa = 0, $q_sroa_0_0_insert_ext75$0 = 0, $q_sroa_0_0_insert_ext75$1 = 0, $_0$0 = 0, $_0$1 = 0, $q_sroa_1_1198$looptemp = 0;
 $n_sroa_0_0_extract_trunc = $a$0; //@line 9519
 $n_sroa_1_4_extract_shift$0 = $a$1; //@line 9520
 $n_sroa_1_4_extract_trunc = $n_sroa_1_4_extract_shift$0; //@line 9521
 $d_sroa_0_0_extract_trunc = $b$0; //@line 9522
 $d_sroa_1_4_extract_shift$0 = $b$1; //@line 9523
 $d_sroa_1_4_extract_trunc = $d_sroa_1_4_extract_shift$0; //@line 9524
 if (!$n_sroa_1_4_extract_trunc) {
  $4 = ($rem | 0) != 0; //@line 9526
  if (!$d_sroa_1_4_extract_trunc) {
   if ($4) {
    HEAP32[$rem >> 2] = ($n_sroa_0_0_extract_trunc >>> 0) % ($d_sroa_0_0_extract_trunc >>> 0); //@line 9529
    HEAP32[$rem + 4 >> 2] = 0; //@line 9530
   }
   $_0$1 = 0; //@line 9532
   $_0$0 = ($n_sroa_0_0_extract_trunc >>> 0) / ($d_sroa_0_0_extract_trunc >>> 0) >>> 0; //@line 9533
   return (tempRet0 = $_0$1, $_0$0) | 0; //@line 9534
  } else {
   if (!$4) {
    $_0$1 = 0; //@line 9537
    $_0$0 = 0; //@line 9538
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 9539
   }
   HEAP32[$rem >> 2] = $a$0 | 0; //@line 9541
   HEAP32[$rem + 4 >> 2] = $a$1 & 0; //@line 9542
   $_0$1 = 0; //@line 9543
   $_0$0 = 0; //@line 9544
   return (tempRet0 = $_0$1, $_0$0) | 0; //@line 9545
  }
 }
 $17 = ($d_sroa_1_4_extract_trunc | 0) == 0; //@line 9548
 do {
  if (!$d_sroa_0_0_extract_trunc) {
   if ($17) {
    if ($rem | 0) {
     HEAP32[$rem >> 2] = ($n_sroa_1_4_extract_trunc >>> 0) % ($d_sroa_0_0_extract_trunc >>> 0); //@line 9553
     HEAP32[$rem + 4 >> 2] = 0; //@line 9554
    }
    $_0$1 = 0; //@line 9556
    $_0$0 = ($n_sroa_1_4_extract_trunc >>> 0) / ($d_sroa_0_0_extract_trunc >>> 0) >>> 0; //@line 9557
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 9558
   }
   if (!$n_sroa_0_0_extract_trunc) {
    if ($rem | 0) {
     HEAP32[$rem >> 2] = 0; //@line 9562
     HEAP32[$rem + 4 >> 2] = ($n_sroa_1_4_extract_trunc >>> 0) % ($d_sroa_1_4_extract_trunc >>> 0); //@line 9563
    }
    $_0$1 = 0; //@line 9565
    $_0$0 = ($n_sroa_1_4_extract_trunc >>> 0) / ($d_sroa_1_4_extract_trunc >>> 0) >>> 0; //@line 9566
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 9567
   }
   $37 = $d_sroa_1_4_extract_trunc - 1 | 0; //@line 9569
   if (!($37 & $d_sroa_1_4_extract_trunc)) {
    if ($rem | 0) {
     HEAP32[$rem >> 2] = $a$0 | 0; //@line 9572
     HEAP32[$rem + 4 >> 2] = $37 & $n_sroa_1_4_extract_trunc | $a$1 & 0; //@line 9573
    }
    $_0$1 = 0; //@line 9575
    $_0$0 = $n_sroa_1_4_extract_trunc >>> ((_llvm_cttz_i32($d_sroa_1_4_extract_trunc | 0) | 0) >>> 0); //@line 9576
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 9577
   }
   $51 = (Math_clz32($d_sroa_1_4_extract_trunc | 0) | 0) - (Math_clz32($n_sroa_1_4_extract_trunc | 0) | 0) | 0; //@line 9580
   if ($51 >>> 0 <= 30) {
    $57 = $51 + 1 | 0; //@line 9582
    $58 = 31 - $51 | 0; //@line 9583
    $sr_1_ph = $57; //@line 9584
    $r_sroa_0_1_ph = $n_sroa_1_4_extract_trunc << $58 | $n_sroa_0_0_extract_trunc >>> ($57 >>> 0); //@line 9585
    $r_sroa_1_1_ph = $n_sroa_1_4_extract_trunc >>> ($57 >>> 0); //@line 9586
    $q_sroa_0_1_ph = 0; //@line 9587
    $q_sroa_1_1_ph = $n_sroa_0_0_extract_trunc << $58; //@line 9588
    break;
   }
   if (!$rem) {
    $_0$1 = 0; //@line 9592
    $_0$0 = 0; //@line 9593
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 9594
   }
   HEAP32[$rem >> 2] = $a$0 | 0; //@line 9596
   HEAP32[$rem + 4 >> 2] = $n_sroa_1_4_extract_shift$0 | $a$1 & 0; //@line 9597
   $_0$1 = 0; //@line 9598
   $_0$0 = 0; //@line 9599
   return (tempRet0 = $_0$1, $_0$0) | 0; //@line 9600
  } else {
   if (!$17) {
    $119 = (Math_clz32($d_sroa_1_4_extract_trunc | 0) | 0) - (Math_clz32($n_sroa_1_4_extract_trunc | 0) | 0) | 0; //@line 9604
    if ($119 >>> 0 <= 31) {
     $125 = $119 + 1 | 0; //@line 9606
     $126 = 31 - $119 | 0; //@line 9607
     $130 = $119 - 31 >> 31; //@line 9608
     $sr_1_ph = $125; //@line 9609
     $r_sroa_0_1_ph = $n_sroa_0_0_extract_trunc >>> ($125 >>> 0) & $130 | $n_sroa_1_4_extract_trunc << $126; //@line 9610
     $r_sroa_1_1_ph = $n_sroa_1_4_extract_trunc >>> ($125 >>> 0) & $130; //@line 9611
     $q_sroa_0_1_ph = 0; //@line 9612
     $q_sroa_1_1_ph = $n_sroa_0_0_extract_trunc << $126; //@line 9613
     break;
    }
    if (!$rem) {
     $_0$1 = 0; //@line 9617
     $_0$0 = 0; //@line 9618
     return (tempRet0 = $_0$1, $_0$0) | 0; //@line 9619
    }
    HEAP32[$rem >> 2] = $a$0 | 0; //@line 9621
    HEAP32[$rem + 4 >> 2] = $n_sroa_1_4_extract_shift$0 | $a$1 & 0; //@line 9622
    $_0$1 = 0; //@line 9623
    $_0$0 = 0; //@line 9624
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 9625
   }
   $66 = $d_sroa_0_0_extract_trunc - 1 | 0; //@line 9627
   if ($66 & $d_sroa_0_0_extract_trunc | 0) {
    $88 = (Math_clz32($d_sroa_0_0_extract_trunc | 0) | 0) + 33 - (Math_clz32($n_sroa_1_4_extract_trunc | 0) | 0) | 0; //@line 9630
    $89 = 64 - $88 | 0; //@line 9631
    $91 = 32 - $88 | 0; //@line 9632
    $92 = $91 >> 31; //@line 9633
    $95 = $88 - 32 | 0; //@line 9634
    $105 = $95 >> 31; //@line 9635
    $sr_1_ph = $88; //@line 9636
    $r_sroa_0_1_ph = $91 - 1 >> 31 & $n_sroa_1_4_extract_trunc >>> ($95 >>> 0) | ($n_sroa_1_4_extract_trunc << $91 | $n_sroa_0_0_extract_trunc >>> ($88 >>> 0)) & $105; //@line 9637
    $r_sroa_1_1_ph = $105 & $n_sroa_1_4_extract_trunc >>> ($88 >>> 0); //@line 9638
    $q_sroa_0_1_ph = $n_sroa_0_0_extract_trunc << $89 & $92; //@line 9639
    $q_sroa_1_1_ph = ($n_sroa_1_4_extract_trunc << $89 | $n_sroa_0_0_extract_trunc >>> ($95 >>> 0)) & $92 | $n_sroa_0_0_extract_trunc << $91 & $88 - 33 >> 31; //@line 9640
    break;
   }
   if ($rem | 0) {
    HEAP32[$rem >> 2] = $66 & $n_sroa_0_0_extract_trunc; //@line 9644
    HEAP32[$rem + 4 >> 2] = 0; //@line 9645
   }
   if (($d_sroa_0_0_extract_trunc | 0) == 1) {
    $_0$1 = $n_sroa_1_4_extract_shift$0 | $a$1 & 0; //@line 9648
    $_0$0 = $a$0 | 0 | 0; //@line 9649
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 9650
   } else {
    $78 = _llvm_cttz_i32($d_sroa_0_0_extract_trunc | 0) | 0; //@line 9652
    $_0$1 = $n_sroa_1_4_extract_trunc >>> ($78 >>> 0) | 0; //@line 9653
    $_0$0 = $n_sroa_1_4_extract_trunc << 32 - $78 | $n_sroa_0_0_extract_trunc >>> ($78 >>> 0) | 0; //@line 9654
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 9655
   }
  }
 } while (0);
 if (!$sr_1_ph) {
  $q_sroa_1_1_lcssa = $q_sroa_1_1_ph; //@line 9660
  $q_sroa_0_1_lcssa = $q_sroa_0_1_ph; //@line 9661
  $r_sroa_1_1_lcssa = $r_sroa_1_1_ph; //@line 9662
  $r_sroa_0_1_lcssa = $r_sroa_0_1_ph; //@line 9663
  $carry_0_lcssa$1 = 0; //@line 9664
  $carry_0_lcssa$0 = 0; //@line 9665
 } else {
  $d_sroa_0_0_insert_insert99$0 = $b$0 | 0 | 0; //@line 9667
  $d_sroa_0_0_insert_insert99$1 = $d_sroa_1_4_extract_shift$0 | $b$1 & 0; //@line 9668
  $137$0 = _i64Add($d_sroa_0_0_insert_insert99$0 | 0, $d_sroa_0_0_insert_insert99$1 | 0, -1, -1) | 0; //@line 9669
  $137$1 = tempRet0; //@line 9670
  $q_sroa_1_1198 = $q_sroa_1_1_ph; //@line 9671
  $q_sroa_0_1199 = $q_sroa_0_1_ph; //@line 9672
  $r_sroa_1_1200 = $r_sroa_1_1_ph; //@line 9673
  $r_sroa_0_1201 = $r_sroa_0_1_ph; //@line 9674
  $sr_1202 = $sr_1_ph; //@line 9675
  $carry_0203 = 0; //@line 9676
  do {
   $q_sroa_1_1198$looptemp = $q_sroa_1_1198;
   $q_sroa_1_1198 = $q_sroa_0_1199 >>> 31 | $q_sroa_1_1198 << 1; //@line 9678
   $q_sroa_0_1199 = $carry_0203 | $q_sroa_0_1199 << 1; //@line 9679
   $r_sroa_0_0_insert_insert42$0 = $r_sroa_0_1201 << 1 | $q_sroa_1_1198$looptemp >>> 31 | 0; //@line 9680
   $r_sroa_0_0_insert_insert42$1 = $r_sroa_0_1201 >>> 31 | $r_sroa_1_1200 << 1 | 0; //@line 9681
   _i64Subtract($137$0 | 0, $137$1 | 0, $r_sroa_0_0_insert_insert42$0 | 0, $r_sroa_0_0_insert_insert42$1 | 0) | 0; //@line 9682
   $150$1 = tempRet0; //@line 9683
   $151$0 = $150$1 >> 31 | (($150$1 | 0) < 0 ? -1 : 0) << 1; //@line 9684
   $carry_0203 = $151$0 & 1; //@line 9685
   $r_sroa_0_1201 = _i64Subtract($r_sroa_0_0_insert_insert42$0 | 0, $r_sroa_0_0_insert_insert42$1 | 0, $151$0 & $d_sroa_0_0_insert_insert99$0 | 0, ((($150$1 | 0) < 0 ? -1 : 0) >> 31 | (($150$1 | 0) < 0 ? -1 : 0) << 1) & $d_sroa_0_0_insert_insert99$1 | 0) | 0; //@line 9687
   $r_sroa_1_1200 = tempRet0; //@line 9688
   $sr_1202 = $sr_1202 - 1 | 0; //@line 9689
  } while (($sr_1202 | 0) != 0);
  $q_sroa_1_1_lcssa = $q_sroa_1_1198; //@line 9701
  $q_sroa_0_1_lcssa = $q_sroa_0_1199; //@line 9702
  $r_sroa_1_1_lcssa = $r_sroa_1_1200; //@line 9703
  $r_sroa_0_1_lcssa = $r_sroa_0_1201; //@line 9704
  $carry_0_lcssa$1 = 0; //@line 9705
  $carry_0_lcssa$0 = $carry_0203; //@line 9706
 }
 $q_sroa_0_0_insert_ext75$0 = $q_sroa_0_1_lcssa; //@line 9708
 $q_sroa_0_0_insert_ext75$1 = 0; //@line 9709
 if ($rem | 0) {
  HEAP32[$rem >> 2] = $r_sroa_0_1_lcssa; //@line 9712
  HEAP32[$rem + 4 >> 2] = $r_sroa_1_1_lcssa; //@line 9713
 }
 $_0$1 = ($q_sroa_0_0_insert_ext75$0 | 0) >>> 31 | ($q_sroa_1_1_lcssa | $q_sroa_0_0_insert_ext75$1) << 1 | ($q_sroa_0_0_insert_ext75$1 << 1 | $q_sroa_0_0_insert_ext75$0 >>> 31) & 0 | $carry_0_lcssa$1; //@line 9715
 $_0$0 = ($q_sroa_0_0_insert_ext75$0 << 1 | 0 >>> 31) & -2 | $carry_0_lcssa$0; //@line 9716
 return (tempRet0 = $_0$1, $_0$0) | 0; //@line 9717
}
function __ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($0, $1, $2, $3, $4) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 var $$0 = 0, $$081$off0 = 0, $$084 = 0, $$085$off0 = 0, $$1 = 0, $$182$off0 = 0, $$186$off0 = 0, $$2 = 0, $$283$off0 = 0, $100 = 0, $104 = 0, $105 = 0, $106 = 0, $122 = 0, $13 = 0, $136 = 0, $19 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $30 = 0, $61 = 0, $69 = 0, $72 = 0, $73 = 0, $81 = 0, $84 = 0, $87 = 0, $90 = 0, $AsyncCtx = 0, $AsyncCtx11 = 0, $AsyncCtx15 = 0, $AsyncCtx3 = 0, $AsyncCtx7 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 248
 L1 : do {
  if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, $4) | 0) {
   __ZNK10__cxxabiv117__class_type_info29process_static_type_below_dstEPNS_19__dynamic_cast_infoEPKvi(0, $1, $2, $3); //@line 254
  } else {
   if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 >> 2] | 0, $4) | 0) {
    if ((HEAP32[$1 + 16 >> 2] | 0) != ($2 | 0)) {
     $13 = $1 + 20 | 0; //@line 263
     if ((HEAP32[$13 >> 2] | 0) != ($2 | 0)) {
      HEAP32[$1 + 32 >> 2] = $3; //@line 268
      $19 = $1 + 44 | 0; //@line 269
      if ((HEAP32[$19 >> 2] | 0) == 4) {
       break;
      }
      $25 = $0 + 16 + (HEAP32[$0 + 12 >> 2] << 3) | 0; //@line 278
      $26 = $1 + 52 | 0; //@line 279
      $27 = $1 + 53 | 0; //@line 280
      $28 = $1 + 54 | 0; //@line 281
      $29 = $0 + 8 | 0; //@line 282
      $30 = $1 + 24 | 0; //@line 283
      $$081$off0 = 0; //@line 284
      $$084 = $0 + 16 | 0; //@line 284
      $$085$off0 = 0; //@line 284
      L10 : while (1) {
       if ($$084 >>> 0 >= $25 >>> 0) {
        $$283$off0 = $$081$off0; //@line 288
        label = 20; //@line 289
        break;
       }
       HEAP8[$26 >> 0] = 0; //@line 292
       HEAP8[$27 >> 0] = 0; //@line 293
       $AsyncCtx15 = _emscripten_alloc_async_context(56, sp) | 0; //@line 294
       __ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($$084, $1, $2, $2, 1, $4); //@line 295
       if (___async) {
        label = 12; //@line 298
        break;
       }
       _emscripten_free_async_context($AsyncCtx15 | 0); //@line 301
       if (HEAP8[$28 >> 0] | 0) {
        $$283$off0 = $$081$off0; //@line 305
        label = 20; //@line 306
        break;
       }
       do {
        if (!(HEAP8[$27 >> 0] | 0)) {
         $$182$off0 = $$081$off0; //@line 313
         $$186$off0 = $$085$off0; //@line 313
        } else {
         if (!(HEAP8[$26 >> 0] | 0)) {
          if (!(HEAP32[$29 >> 2] & 1)) {
           $$283$off0 = 1; //@line 322
           label = 20; //@line 323
           break L10;
          } else {
           $$182$off0 = 1; //@line 326
           $$186$off0 = $$085$off0; //@line 326
           break;
          }
         }
         if ((HEAP32[$30 >> 2] | 0) == 1) {
          label = 25; //@line 333
          break L10;
         }
         if (!(HEAP32[$29 >> 2] & 2)) {
          label = 25; //@line 340
          break L10;
         } else {
          $$182$off0 = 1; //@line 343
          $$186$off0 = 1; //@line 343
         }
        }
       } while (0);
       $$081$off0 = $$182$off0; //@line 348
       $$084 = $$084 + 8 | 0; //@line 348
       $$085$off0 = $$186$off0; //@line 348
      }
      if ((label | 0) == 12) {
       HEAP32[$AsyncCtx15 >> 2] = 144; //@line 351
       HEAP32[$AsyncCtx15 + 4 >> 2] = $27; //@line 353
       HEAP32[$AsyncCtx15 + 8 >> 2] = $26; //@line 355
       HEAP32[$AsyncCtx15 + 12 >> 2] = $25; //@line 357
       HEAP32[$AsyncCtx15 + 16 >> 2] = $1; //@line 359
       HEAP32[$AsyncCtx15 + 20 >> 2] = $2; //@line 361
       HEAP8[$AsyncCtx15 + 24 >> 0] = $4 & 1; //@line 364
       HEAP32[$AsyncCtx15 + 28 >> 2] = $29; //@line 366
       HEAP8[$AsyncCtx15 + 32 >> 0] = $$085$off0 & 1; //@line 369
       HEAP8[$AsyncCtx15 + 33 >> 0] = $$081$off0 & 1; //@line 372
       HEAP32[$AsyncCtx15 + 36 >> 2] = $$084; //@line 374
       HEAP32[$AsyncCtx15 + 40 >> 2] = $30; //@line 376
       HEAP32[$AsyncCtx15 + 44 >> 2] = $28; //@line 378
       HEAP32[$AsyncCtx15 + 48 >> 2] = $13; //@line 380
       HEAP32[$AsyncCtx15 + 52 >> 2] = $19; //@line 382
       sp = STACKTOP; //@line 383
       return;
      }
      do {
       if ((label | 0) == 20) {
        if (!$$085$off0) {
         HEAP32[$13 >> 2] = $2; //@line 389
         $61 = $1 + 40 | 0; //@line 390
         HEAP32[$61 >> 2] = (HEAP32[$61 >> 2] | 0) + 1; //@line 393
         if ((HEAP32[$1 + 36 >> 2] | 0) == 1) {
          if ((HEAP32[$30 >> 2] | 0) == 2) {
           HEAP8[$28 >> 0] = 1; //@line 401
           if ($$283$off0) {
            label = 25; //@line 403
            break;
           } else {
            $69 = 4; //@line 406
            break;
           }
          }
         }
        }
        if ($$283$off0) {
         label = 25; //@line 413
        } else {
         $69 = 4; //@line 415
        }
       }
      } while (0);
      if ((label | 0) == 25) {
       $69 = 3; //@line 420
      }
      HEAP32[$19 >> 2] = $69; //@line 422
      break;
     }
    }
    if (($3 | 0) != 1) {
     break;
    }
    HEAP32[$1 + 32 >> 2] = 1; //@line 431
    break;
   }
   $72 = HEAP32[$0 + 12 >> 2] | 0; //@line 436
   $73 = $0 + 16 + ($72 << 3) | 0; //@line 437
   $AsyncCtx11 = _emscripten_alloc_async_context(32, sp) | 0; //@line 438
   __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($0 + 16 | 0, $1, $2, $3, $4); //@line 439
   if (___async) {
    HEAP32[$AsyncCtx11 >> 2] = 145; //@line 442
    HEAP32[$AsyncCtx11 + 4 >> 2] = $1; //@line 444
    HEAP32[$AsyncCtx11 + 8 >> 2] = $2; //@line 446
    HEAP32[$AsyncCtx11 + 12 >> 2] = $3; //@line 448
    HEAP8[$AsyncCtx11 + 16 >> 0] = $4 & 1; //@line 451
    HEAP32[$AsyncCtx11 + 20 >> 2] = $73; //@line 453
    HEAP32[$AsyncCtx11 + 24 >> 2] = $0; //@line 455
    HEAP32[$AsyncCtx11 + 28 >> 2] = $72; //@line 457
    sp = STACKTOP; //@line 458
    return;
   }
   _emscripten_free_async_context($AsyncCtx11 | 0); //@line 461
   $81 = $0 + 24 | 0; //@line 462
   if (($72 | 0) > 1) {
    $84 = HEAP32[$0 + 8 >> 2] | 0; //@line 466
    if (!($84 & 2)) {
     $87 = $1 + 36 | 0; //@line 470
     if ((HEAP32[$87 >> 2] | 0) != 1) {
      if (!($84 & 1)) {
       $106 = $1 + 54 | 0; //@line 477
       $$2 = $81; //@line 478
       while (1) {
        if (HEAP8[$106 >> 0] | 0) {
         break L1;
        }
        if ((HEAP32[$87 >> 2] | 0) == 1) {
         break L1;
        }
        $AsyncCtx = _emscripten_alloc_async_context(36, sp) | 0; //@line 490
        __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($$2, $1, $2, $3, $4); //@line 491
        if (___async) {
         break;
        }
        _emscripten_free_async_context($AsyncCtx | 0); //@line 496
        $136 = $$2 + 8 | 0; //@line 497
        if ($136 >>> 0 < $73 >>> 0) {
         $$2 = $136; //@line 500
        } else {
         break L1;
        }
       }
       HEAP32[$AsyncCtx >> 2] = 148; //@line 505
       HEAP32[$AsyncCtx + 4 >> 2] = $$2; //@line 507
       HEAP32[$AsyncCtx + 8 >> 2] = $73; //@line 509
       HEAP32[$AsyncCtx + 12 >> 2] = $106; //@line 511
       HEAP32[$AsyncCtx + 16 >> 2] = $87; //@line 513
       HEAP32[$AsyncCtx + 20 >> 2] = $1; //@line 515
       HEAP32[$AsyncCtx + 24 >> 2] = $2; //@line 517
       HEAP32[$AsyncCtx + 28 >> 2] = $3; //@line 519
       HEAP8[$AsyncCtx + 32 >> 0] = $4 & 1; //@line 522
       sp = STACKTOP; //@line 523
       return;
      }
      $104 = $1 + 24 | 0; //@line 526
      $105 = $1 + 54 | 0; //@line 527
      $$1 = $81; //@line 528
      while (1) {
       if (HEAP8[$105 >> 0] | 0) {
        break L1;
       }
       if ((HEAP32[$87 >> 2] | 0) == 1) {
        if ((HEAP32[$104 >> 2] | 0) == 1) {
         break L1;
        }
       }
       $AsyncCtx3 = _emscripten_alloc_async_context(40, sp) | 0; //@line 544
       __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($$1, $1, $2, $3, $4); //@line 545
       if (___async) {
        break;
       }
       _emscripten_free_async_context($AsyncCtx3 | 0); //@line 550
       $122 = $$1 + 8 | 0; //@line 551
       if ($122 >>> 0 < $73 >>> 0) {
        $$1 = $122; //@line 554
       } else {
        break L1;
       }
      }
      HEAP32[$AsyncCtx3 >> 2] = 147; //@line 559
      HEAP32[$AsyncCtx3 + 4 >> 2] = $$1; //@line 561
      HEAP32[$AsyncCtx3 + 8 >> 2] = $73; //@line 563
      HEAP32[$AsyncCtx3 + 12 >> 2] = $105; //@line 565
      HEAP32[$AsyncCtx3 + 16 >> 2] = $87; //@line 567
      HEAP32[$AsyncCtx3 + 20 >> 2] = $104; //@line 569
      HEAP32[$AsyncCtx3 + 24 >> 2] = $1; //@line 571
      HEAP32[$AsyncCtx3 + 28 >> 2] = $2; //@line 573
      HEAP32[$AsyncCtx3 + 32 >> 2] = $3; //@line 575
      HEAP8[$AsyncCtx3 + 36 >> 0] = $4 & 1; //@line 578
      sp = STACKTOP; //@line 579
      return;
     }
    }
    $90 = $1 + 54 | 0; //@line 583
    $$0 = $81; //@line 584
    while (1) {
     if (HEAP8[$90 >> 0] | 0) {
      break L1;
     }
     $AsyncCtx7 = _emscripten_alloc_async_context(32, sp) | 0; //@line 591
     __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($$0, $1, $2, $3, $4); //@line 592
     if (___async) {
      break;
     }
     _emscripten_free_async_context($AsyncCtx7 | 0); //@line 597
     $100 = $$0 + 8 | 0; //@line 598
     if ($100 >>> 0 < $73 >>> 0) {
      $$0 = $100; //@line 601
     } else {
      break L1;
     }
    }
    HEAP32[$AsyncCtx7 >> 2] = 146; //@line 606
    HEAP32[$AsyncCtx7 + 4 >> 2] = $$0; //@line 608
    HEAP32[$AsyncCtx7 + 8 >> 2] = $73; //@line 610
    HEAP32[$AsyncCtx7 + 12 >> 2] = $90; //@line 612
    HEAP32[$AsyncCtx7 + 16 >> 2] = $1; //@line 614
    HEAP32[$AsyncCtx7 + 20 >> 2] = $2; //@line 616
    HEAP32[$AsyncCtx7 + 24 >> 2] = $3; //@line 618
    HEAP8[$AsyncCtx7 + 28 >> 0] = $4 & 1; //@line 621
    sp = STACKTOP; //@line 622
    return;
   }
  }
 } while (0);
 return;
}
function _mbed_die() {
 var $0 = 0, $AsyncCtx = 0, $AsyncCtx11 = 0, $AsyncCtx15 = 0, $AsyncCtx19 = 0, $AsyncCtx23 = 0, $AsyncCtx27 = 0, $AsyncCtx3 = 0, $AsyncCtx31 = 0, $AsyncCtx35 = 0, $AsyncCtx39 = 0, $AsyncCtx43 = 0, $AsyncCtx47 = 0, $AsyncCtx51 = 0, $AsyncCtx55 = 0, $AsyncCtx59 = 0, $AsyncCtx7 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 2507
 STACKTOP = STACKTOP + 32 | 0; //@line 2508
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(32); //@line 2508
 $0 = sp; //@line 2509
 _gpio_init_out($0, 50); //@line 2510
 while (1) {
  _emscripten_asm_const_iii(1, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 2513
  $AsyncCtx59 = _emscripten_alloc_async_context(8, sp) | 0; //@line 2514
  _wait_ms(150); //@line 2515
  if (___async) {
   label = 3; //@line 2518
   break;
  }
  _emscripten_free_async_context($AsyncCtx59 | 0); //@line 2521
  _emscripten_asm_const_iii(1, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 2523
  $AsyncCtx55 = _emscripten_alloc_async_context(8, sp) | 0; //@line 2524
  _wait_ms(150); //@line 2525
  if (___async) {
   label = 5; //@line 2528
   break;
  }
  _emscripten_free_async_context($AsyncCtx55 | 0); //@line 2531
  _emscripten_asm_const_iii(1, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 2533
  $AsyncCtx51 = _emscripten_alloc_async_context(8, sp) | 0; //@line 2534
  _wait_ms(150); //@line 2535
  if (___async) {
   label = 7; //@line 2538
   break;
  }
  _emscripten_free_async_context($AsyncCtx51 | 0); //@line 2541
  _emscripten_asm_const_iii(1, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 2543
  $AsyncCtx47 = _emscripten_alloc_async_context(8, sp) | 0; //@line 2544
  _wait_ms(150); //@line 2545
  if (___async) {
   label = 9; //@line 2548
   break;
  }
  _emscripten_free_async_context($AsyncCtx47 | 0); //@line 2551
  _emscripten_asm_const_iii(1, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 2553
  $AsyncCtx43 = _emscripten_alloc_async_context(8, sp) | 0; //@line 2554
  _wait_ms(150); //@line 2555
  if (___async) {
   label = 11; //@line 2558
   break;
  }
  _emscripten_free_async_context($AsyncCtx43 | 0); //@line 2561
  _emscripten_asm_const_iii(1, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 2563
  $AsyncCtx39 = _emscripten_alloc_async_context(8, sp) | 0; //@line 2564
  _wait_ms(150); //@line 2565
  if (___async) {
   label = 13; //@line 2568
   break;
  }
  _emscripten_free_async_context($AsyncCtx39 | 0); //@line 2571
  _emscripten_asm_const_iii(1, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 2573
  $AsyncCtx35 = _emscripten_alloc_async_context(8, sp) | 0; //@line 2574
  _wait_ms(150); //@line 2575
  if (___async) {
   label = 15; //@line 2578
   break;
  }
  _emscripten_free_async_context($AsyncCtx35 | 0); //@line 2581
  _emscripten_asm_const_iii(1, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 2583
  $AsyncCtx31 = _emscripten_alloc_async_context(8, sp) | 0; //@line 2584
  _wait_ms(150); //@line 2585
  if (___async) {
   label = 17; //@line 2588
   break;
  }
  _emscripten_free_async_context($AsyncCtx31 | 0); //@line 2591
  _emscripten_asm_const_iii(1, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 2593
  $AsyncCtx27 = _emscripten_alloc_async_context(8, sp) | 0; //@line 2594
  _wait_ms(400); //@line 2595
  if (___async) {
   label = 19; //@line 2598
   break;
  }
  _emscripten_free_async_context($AsyncCtx27 | 0); //@line 2601
  _emscripten_asm_const_iii(1, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 2603
  $AsyncCtx23 = _emscripten_alloc_async_context(8, sp) | 0; //@line 2604
  _wait_ms(400); //@line 2605
  if (___async) {
   label = 21; //@line 2608
   break;
  }
  _emscripten_free_async_context($AsyncCtx23 | 0); //@line 2611
  _emscripten_asm_const_iii(1, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 2613
  $AsyncCtx19 = _emscripten_alloc_async_context(8, sp) | 0; //@line 2614
  _wait_ms(400); //@line 2615
  if (___async) {
   label = 23; //@line 2618
   break;
  }
  _emscripten_free_async_context($AsyncCtx19 | 0); //@line 2621
  _emscripten_asm_const_iii(1, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 2623
  $AsyncCtx15 = _emscripten_alloc_async_context(8, sp) | 0; //@line 2624
  _wait_ms(400); //@line 2625
  if (___async) {
   label = 25; //@line 2628
   break;
  }
  _emscripten_free_async_context($AsyncCtx15 | 0); //@line 2631
  _emscripten_asm_const_iii(1, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 2633
  $AsyncCtx11 = _emscripten_alloc_async_context(8, sp) | 0; //@line 2634
  _wait_ms(400); //@line 2635
  if (___async) {
   label = 27; //@line 2638
   break;
  }
  _emscripten_free_async_context($AsyncCtx11 | 0); //@line 2641
  _emscripten_asm_const_iii(1, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 2643
  $AsyncCtx7 = _emscripten_alloc_async_context(8, sp) | 0; //@line 2644
  _wait_ms(400); //@line 2645
  if (___async) {
   label = 29; //@line 2648
   break;
  }
  _emscripten_free_async_context($AsyncCtx7 | 0); //@line 2651
  _emscripten_asm_const_iii(1, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 2653
  $AsyncCtx3 = _emscripten_alloc_async_context(8, sp) | 0; //@line 2654
  _wait_ms(400); //@line 2655
  if (___async) {
   label = 31; //@line 2658
   break;
  }
  _emscripten_free_async_context($AsyncCtx3 | 0); //@line 2661
  _emscripten_asm_const_iii(1, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 2663
  $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 2664
  _wait_ms(400); //@line 2665
  if (___async) {
   label = 33; //@line 2668
   break;
  }
  _emscripten_free_async_context($AsyncCtx | 0); //@line 2671
 }
 switch (label | 0) {
 case 3:
  {
   HEAP32[$AsyncCtx59 >> 2] = 50; //@line 2675
   HEAP32[$AsyncCtx59 + 4 >> 2] = $0; //@line 2677
   sp = STACKTOP; //@line 2678
   STACKTOP = sp; //@line 2679
   return;
  }
 case 5:
  {
   HEAP32[$AsyncCtx55 >> 2] = 51; //@line 2683
   HEAP32[$AsyncCtx55 + 4 >> 2] = $0; //@line 2685
   sp = STACKTOP; //@line 2686
   STACKTOP = sp; //@line 2687
   return;
  }
 case 7:
  {
   HEAP32[$AsyncCtx51 >> 2] = 52; //@line 2691
   HEAP32[$AsyncCtx51 + 4 >> 2] = $0; //@line 2693
   sp = STACKTOP; //@line 2694
   STACKTOP = sp; //@line 2695
   return;
  }
 case 9:
  {
   HEAP32[$AsyncCtx47 >> 2] = 53; //@line 2699
   HEAP32[$AsyncCtx47 + 4 >> 2] = $0; //@line 2701
   sp = STACKTOP; //@line 2702
   STACKTOP = sp; //@line 2703
   return;
  }
 case 11:
  {
   HEAP32[$AsyncCtx43 >> 2] = 54; //@line 2707
   HEAP32[$AsyncCtx43 + 4 >> 2] = $0; //@line 2709
   sp = STACKTOP; //@line 2710
   STACKTOP = sp; //@line 2711
   return;
  }
 case 13:
  {
   HEAP32[$AsyncCtx39 >> 2] = 55; //@line 2715
   HEAP32[$AsyncCtx39 + 4 >> 2] = $0; //@line 2717
   sp = STACKTOP; //@line 2718
   STACKTOP = sp; //@line 2719
   return;
  }
 case 15:
  {
   HEAP32[$AsyncCtx35 >> 2] = 56; //@line 2723
   HEAP32[$AsyncCtx35 + 4 >> 2] = $0; //@line 2725
   sp = STACKTOP; //@line 2726
   STACKTOP = sp; //@line 2727
   return;
  }
 case 17:
  {
   HEAP32[$AsyncCtx31 >> 2] = 57; //@line 2731
   HEAP32[$AsyncCtx31 + 4 >> 2] = $0; //@line 2733
   sp = STACKTOP; //@line 2734
   STACKTOP = sp; //@line 2735
   return;
  }
 case 19:
  {
   HEAP32[$AsyncCtx27 >> 2] = 58; //@line 2739
   HEAP32[$AsyncCtx27 + 4 >> 2] = $0; //@line 2741
   sp = STACKTOP; //@line 2742
   STACKTOP = sp; //@line 2743
   return;
  }
 case 21:
  {
   HEAP32[$AsyncCtx23 >> 2] = 59; //@line 2747
   HEAP32[$AsyncCtx23 + 4 >> 2] = $0; //@line 2749
   sp = STACKTOP; //@line 2750
   STACKTOP = sp; //@line 2751
   return;
  }
 case 23:
  {
   HEAP32[$AsyncCtx19 >> 2] = 60; //@line 2755
   HEAP32[$AsyncCtx19 + 4 >> 2] = $0; //@line 2757
   sp = STACKTOP; //@line 2758
   STACKTOP = sp; //@line 2759
   return;
  }
 case 25:
  {
   HEAP32[$AsyncCtx15 >> 2] = 61; //@line 2763
   HEAP32[$AsyncCtx15 + 4 >> 2] = $0; //@line 2765
   sp = STACKTOP; //@line 2766
   STACKTOP = sp; //@line 2767
   return;
  }
 case 27:
  {
   HEAP32[$AsyncCtx11 >> 2] = 62; //@line 2771
   HEAP32[$AsyncCtx11 + 4 >> 2] = $0; //@line 2773
   sp = STACKTOP; //@line 2774
   STACKTOP = sp; //@line 2775
   return;
  }
 case 29:
  {
   HEAP32[$AsyncCtx7 >> 2] = 63; //@line 2779
   HEAP32[$AsyncCtx7 + 4 >> 2] = $0; //@line 2781
   sp = STACKTOP; //@line 2782
   STACKTOP = sp; //@line 2783
   return;
  }
 case 31:
  {
   HEAP32[$AsyncCtx3 >> 2] = 64; //@line 2787
   HEAP32[$AsyncCtx3 + 4 >> 2] = $0; //@line 2789
   sp = STACKTOP; //@line 2790
   STACKTOP = sp; //@line 2791
   return;
  }
 case 33:
  {
   HEAP32[$AsyncCtx >> 2] = 65; //@line 2795
   HEAP32[$AsyncCtx + 4 >> 2] = $0; //@line 2797
   sp = STACKTOP; //@line 2798
   STACKTOP = sp; //@line 2799
   return;
  }
 }
}
function _main() {
 var $$03 = 0, $0 = 0, $12 = 0, $18 = 0, $28 = 0, $31 = 0, $34 = 0, $36 = 0, $39 = 0, $42 = 0, $47 = 0, $50 = 0, $53 = 0, $AsyncCtx = 0, $AsyncCtx11 = 0, $AsyncCtx15 = 0, $AsyncCtx19 = 0, $AsyncCtx23 = 0, $AsyncCtx26 = 0, $AsyncCtx29 = 0, $AsyncCtx3 = 0, $AsyncCtx33 = 0, $AsyncCtx36 = 0, $AsyncCtx7 = 0, $vararg_buffer = 0, sp = 0;
 sp = STACKTOP; //@line 3914
 STACKTOP = STACKTOP + 32 | 0; //@line 3915
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(32); //@line 3915
 $vararg_buffer = sp; //@line 3916
 $0 = sp + 8 | 0; //@line 3917
 $AsyncCtx19 = _emscripten_alloc_async_context(16, sp) | 0; //@line 3918
 _puts(2402) | 0; //@line 3919
 if (___async) {
  HEAP32[$AsyncCtx19 >> 2] = 91; //@line 3922
  HEAP32[$AsyncCtx19 + 4 >> 2] = $0; //@line 3924
  HEAP32[$AsyncCtx19 + 8 >> 2] = $vararg_buffer; //@line 3926
  HEAP32[$AsyncCtx19 + 12 >> 2] = $vararg_buffer; //@line 3928
  sp = STACKTOP; //@line 3929
  STACKTOP = sp; //@line 3930
  return 0; //@line 3930
 }
 _emscripten_free_async_context($AsyncCtx19 | 0); //@line 3932
 $AsyncCtx15 = _emscripten_alloc_async_context(16, sp) | 0; //@line 3933
 _puts(2466) | 0; //@line 3934
 if (___async) {
  HEAP32[$AsyncCtx15 >> 2] = 92; //@line 3937
  HEAP32[$AsyncCtx15 + 4 >> 2] = $0; //@line 3939
  HEAP32[$AsyncCtx15 + 8 >> 2] = $vararg_buffer; //@line 3941
  HEAP32[$AsyncCtx15 + 12 >> 2] = $vararg_buffer; //@line 3943
  sp = STACKTOP; //@line 3944
  STACKTOP = sp; //@line 3945
  return 0; //@line 3945
 }
 _emscripten_free_async_context($AsyncCtx15 | 0); //@line 3947
 $AsyncCtx11 = _emscripten_alloc_async_context(16, sp) | 0; //@line 3948
 _puts(2535) | 0; //@line 3949
 if (___async) {
  HEAP32[$AsyncCtx11 >> 2] = 93; //@line 3952
  HEAP32[$AsyncCtx11 + 4 >> 2] = $0; //@line 3954
  HEAP32[$AsyncCtx11 + 8 >> 2] = $vararg_buffer; //@line 3956
  HEAP32[$AsyncCtx11 + 12 >> 2] = $vararg_buffer; //@line 3958
  sp = STACKTOP; //@line 3959
  STACKTOP = sp; //@line 3960
  return 0; //@line 3960
 }
 _emscripten_free_async_context($AsyncCtx11 | 0); //@line 3962
 if (__ZN20SimulatorBlockDevice4initEv(5776) | 0) {
  $AsyncCtx7 = _emscripten_alloc_async_context(4, sp) | 0; //@line 3966
  _puts(2626) | 0; //@line 3967
  if (___async) {
   HEAP32[$AsyncCtx7 >> 2] = 94; //@line 3970
   sp = STACKTOP; //@line 3971
   STACKTOP = sp; //@line 3972
   return 0; //@line 3972
  }
  _emscripten_free_async_context($AsyncCtx7 | 0); //@line 3974
  $$03 = 1; //@line 3975
  STACKTOP = sp; //@line 3976
  return $$03 | 0; //@line 3976
 }
 $12 = _malloc(512) | 0; //@line 3978
 HEAP32[1458] = $12; //@line 3979
 $AsyncCtx23 = _emscripten_alloc_async_context(16, sp) | 0; //@line 3980
 __ZN20SimulatorBlockDevice4readEPvyy(5776, $12, 0, 0, 512, 0) | 0; //@line 3981
 if (___async) {
  HEAP32[$AsyncCtx23 >> 2] = 95; //@line 3984
  HEAP32[$AsyncCtx23 + 4 >> 2] = $0; //@line 3986
  HEAP32[$AsyncCtx23 + 8 >> 2] = $vararg_buffer; //@line 3988
  HEAP32[$AsyncCtx23 + 12 >> 2] = $vararg_buffer; //@line 3990
  sp = STACKTOP; //@line 3991
  STACKTOP = sp; //@line 3992
  return 0; //@line 3992
 }
 _emscripten_free_async_context($AsyncCtx23 | 0); //@line 3994
 HEAP32[$vararg_buffer >> 2] = HEAP32[HEAP32[1458] >> 2]; //@line 3997
 _printf(2661, $vararg_buffer) | 0; //@line 3998
 $AsyncCtx36 = _emscripten_alloc_async_context(8, sp) | 0; //@line 3999
 $18 = _equeue_alloc(5836, 32) | 0; //@line 4000
 if (___async) {
  HEAP32[$AsyncCtx36 >> 2] = 96; //@line 4003
  HEAP32[$AsyncCtx36 + 4 >> 2] = $0; //@line 4005
  sp = STACKTOP; //@line 4006
  STACKTOP = sp; //@line 4007
  return 0; //@line 4007
 }
 _emscripten_free_async_context($AsyncCtx36 | 0); //@line 4009
 if (!$18) {
  HEAP32[$0 >> 2] = 0; //@line 4012
  HEAP32[$0 + 4 >> 2] = 0; //@line 4012
  HEAP32[$0 + 8 >> 2] = 0; //@line 4012
  HEAP32[$0 + 12 >> 2] = 0; //@line 4012
  $34 = 1; //@line 4013
  $36 = $0; //@line 4013
 } else {
  HEAP32[$18 + 4 >> 2] = 5836; //@line 4016
  HEAP32[$18 + 8 >> 2] = 0; //@line 4018
  HEAP32[$18 + 12 >> 2] = 0; //@line 4020
  HEAP32[$18 + 16 >> 2] = -1; //@line 4022
  HEAP32[$18 + 20 >> 2] = 10; //@line 4024
  HEAP32[$18 + 24 >> 2] = 97; //@line 4026
  HEAP32[$18 + 28 >> 2] = 2; //@line 4028
  HEAP32[$18 >> 2] = 1; //@line 4029
  $28 = $0 + 4 | 0; //@line 4030
  HEAP32[$28 >> 2] = 0; //@line 4031
  HEAP32[$28 + 4 >> 2] = 0; //@line 4031
  HEAP32[$28 + 8 >> 2] = 0; //@line 4031
  HEAP32[$0 >> 2] = $18; //@line 4032
  HEAP32[$18 >> 2] = (HEAP32[$18 >> 2] | 0) + 1; //@line 4035
  $34 = 0; //@line 4036
  $36 = $0; //@line 4036
 }
 $31 = $0 + 12 | 0; //@line 4038
 HEAP32[$31 >> 2] = 324; //@line 4039
 $AsyncCtx33 = _emscripten_alloc_async_context(24, sp) | 0; //@line 4040
 __ZN4mbed11InterruptIn4fallENS_8CallbackIFvvEEE(6040, $0); //@line 4041
 if (___async) {
  HEAP32[$AsyncCtx33 >> 2] = 98; //@line 4044
  HEAP32[$AsyncCtx33 + 4 >> 2] = $31; //@line 4046
  HEAP8[$AsyncCtx33 + 8 >> 0] = $34 & 1; //@line 4049
  HEAP32[$AsyncCtx33 + 12 >> 2] = $36; //@line 4051
  HEAP32[$AsyncCtx33 + 16 >> 2] = $18; //@line 4053
  HEAP32[$AsyncCtx33 + 20 >> 2] = $18; //@line 4055
  sp = STACKTOP; //@line 4056
  STACKTOP = sp; //@line 4057
  return 0; //@line 4057
 }
 _emscripten_free_async_context($AsyncCtx33 | 0); //@line 4059
 $39 = HEAP32[$31 >> 2] | 0; //@line 4060
 do {
  if ($39 | 0) {
   $42 = HEAP32[$39 + 8 >> 2] | 0; //@line 4065
   $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 4066
   FUNCTION_TABLE_vi[$42 & 255]($36); //@line 4067
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 99; //@line 4070
    HEAP8[$AsyncCtx + 4 >> 0] = $34 & 1; //@line 4073
    HEAP32[$AsyncCtx + 8 >> 2] = $18; //@line 4075
    HEAP32[$AsyncCtx + 12 >> 2] = $18; //@line 4077
    sp = STACKTOP; //@line 4078
    STACKTOP = sp; //@line 4079
    return 0; //@line 4079
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 4081
    break;
   }
  }
 } while (0);
 do {
  if (!$34) {
   $47 = (HEAP32[$18 >> 2] | 0) + -1 | 0; //@line 4089
   HEAP32[$18 >> 2] = $47; //@line 4090
   if (!$47) {
    $50 = HEAP32[$18 + 24 >> 2] | 0; //@line 4094
    $AsyncCtx3 = _emscripten_alloc_async_context(8, sp) | 0; //@line 4095
    FUNCTION_TABLE_vi[$50 & 255]($18); //@line 4096
    if (___async) {
     HEAP32[$AsyncCtx3 >> 2] = 100; //@line 4099
     HEAP32[$AsyncCtx3 + 4 >> 2] = $18; //@line 4101
     sp = STACKTOP; //@line 4102
     STACKTOP = sp; //@line 4103
     return 0; //@line 4103
    }
    _emscripten_free_async_context($AsyncCtx3 | 0); //@line 4105
    $53 = HEAP32[$18 + 4 >> 2] | 0; //@line 4107
    $AsyncCtx29 = _emscripten_alloc_async_context(4, sp) | 0; //@line 4108
    _equeue_dealloc($53, $18); //@line 4109
    if (___async) {
     HEAP32[$AsyncCtx29 >> 2] = 101; //@line 4112
     sp = STACKTOP; //@line 4113
     STACKTOP = sp; //@line 4114
     return 0; //@line 4114
    } else {
     _emscripten_free_async_context($AsyncCtx29 | 0); //@line 4116
     break;
    }
   }
  }
 } while (0);
 $AsyncCtx26 = _emscripten_alloc_async_context(4, sp) | 0; //@line 4122
 __ZN6events10EventQueue8dispatchEi(5836, -1); //@line 4123
 if (___async) {
  HEAP32[$AsyncCtx26 >> 2] = 102; //@line 4126
  sp = STACKTOP; //@line 4127
  STACKTOP = sp; //@line 4128
  return 0; //@line 4128
 }
 _emscripten_free_async_context($AsyncCtx26 | 0); //@line 4130
 $$03 = 0; //@line 4131
 STACKTOP = sp; //@line 4132
 return $$03 | 0; //@line 4132
}
function __ZN20SimulatorBlockDevice7programEPKvyy__async_cb_53($0) {
 $0 = $0 | 0;
 var $11 = 0, $14 = 0, $16 = 0, $18 = 0, $2 = 0, $20 = 0, $22 = 0, $24 = 0, $30 = 0, $35 = 0, $36 = 0, $39 = 0, $4 = 0, $40 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $60 = 0, $64 = 0, $65 = 0, $66 = 0, $67 = 0, $68 = 0, $69 = 0, $7 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $9 = 0, $ReallocAsyncCtx3 = 0, $ReallocAsyncCtx4 = 0, sp = 0;
 sp = STACKTOP; //@line 7431
 $2 = $0 + 8 | 0; //@line 7433
 $4 = HEAP32[$2 >> 2] | 0; //@line 7435
 $7 = HEAP32[$2 + 4 >> 2] | 0; //@line 7438
 $9 = $0 + 16 | 0; //@line 7440
 $11 = HEAP32[$9 >> 2] | 0; //@line 7442
 $14 = HEAP32[$9 + 4 >> 2] | 0; //@line 7445
 $16 = HEAP32[$0 + 24 >> 2] | 0; //@line 7447
 $18 = HEAP32[$0 + 28 >> 2] | 0; //@line 7449
 $20 = HEAP32[$0 + 32 >> 2] | 0; //@line 7451
 $22 = HEAP32[$0 + 36 >> 2] | 0; //@line 7453
 $24 = ___async_retval; //@line 7455
 $30 = ___uremdi3($4 | 0, $7 | 0, HEAP32[$24 >> 2] | 0, HEAP32[$24 + 4 >> 2] | 0) | 0; //@line 7461
 if (($30 | 0) == 0 & (tempRet0 | 0) == 0) {
  $35 = _i64Add($4 | 0, $7 | 0, $11 | 0, $14 | 0) | 0; //@line 7467
  $36 = tempRet0; //@line 7468
  $39 = HEAP32[(HEAP32[$16 >> 2] | 0) + 56 >> 2] | 0; //@line 7471
  $ReallocAsyncCtx3 = _emscripten_realloc_async_context(40) | 0; //@line 7472
  $40 = FUNCTION_TABLE_ii[$39 & 15]($18) | 0; //@line 7473
  if (___async) {
   HEAP32[$ReallocAsyncCtx3 >> 2] = 82; //@line 7477
   $42 = $ReallocAsyncCtx3 + 8 | 0; //@line 7478
   $43 = $42; //@line 7479
   $44 = $43; //@line 7480
   HEAP32[$44 >> 2] = $35; //@line 7481
   $45 = $43 + 4 | 0; //@line 7482
   $46 = $45; //@line 7483
   HEAP32[$46 >> 2] = $36; //@line 7484
   $47 = $ReallocAsyncCtx3 + 16 | 0; //@line 7485
   $48 = $47; //@line 7486
   $49 = $48; //@line 7487
   HEAP32[$49 >> 2] = $11; //@line 7488
   $50 = $48 + 4 | 0; //@line 7489
   $51 = $50; //@line 7490
   HEAP32[$51 >> 2] = $14; //@line 7491
   $52 = $ReallocAsyncCtx3 + 24 | 0; //@line 7492
   $53 = $52; //@line 7493
   $54 = $53; //@line 7494
   HEAP32[$54 >> 2] = $4; //@line 7495
   $55 = $53 + 4 | 0; //@line 7496
   $56 = $55; //@line 7497
   HEAP32[$56 >> 2] = $7; //@line 7498
   $57 = $ReallocAsyncCtx3 + 32 | 0; //@line 7499
   HEAP32[$57 >> 2] = $20; //@line 7500
   $58 = $ReallocAsyncCtx3 + 36 | 0; //@line 7501
   HEAP32[$58 >> 2] = $22; //@line 7502
   sp = STACKTOP; //@line 7503
   return;
  }
  $60 = ___async_retval; //@line 7507
  HEAP32[$60 >> 2] = $40; //@line 7509
  HEAP32[$60 + 4 >> 2] = tempRet0; //@line 7512
  ___async_unwind = 0; //@line 7513
  HEAP32[$ReallocAsyncCtx3 >> 2] = 82; //@line 7514
  $42 = $ReallocAsyncCtx3 + 8 | 0; //@line 7515
  $43 = $42; //@line 7516
  $44 = $43; //@line 7517
  HEAP32[$44 >> 2] = $35; //@line 7518
  $45 = $43 + 4 | 0; //@line 7519
  $46 = $45; //@line 7520
  HEAP32[$46 >> 2] = $36; //@line 7521
  $47 = $ReallocAsyncCtx3 + 16 | 0; //@line 7522
  $48 = $47; //@line 7523
  $49 = $48; //@line 7524
  HEAP32[$49 >> 2] = $11; //@line 7525
  $50 = $48 + 4 | 0; //@line 7526
  $51 = $50; //@line 7527
  HEAP32[$51 >> 2] = $14; //@line 7528
  $52 = $ReallocAsyncCtx3 + 24 | 0; //@line 7529
  $53 = $52; //@line 7530
  $54 = $53; //@line 7531
  HEAP32[$54 >> 2] = $4; //@line 7532
  $55 = $53 + 4 | 0; //@line 7533
  $56 = $55; //@line 7534
  HEAP32[$56 >> 2] = $7; //@line 7535
  $57 = $ReallocAsyncCtx3 + 32 | 0; //@line 7536
  HEAP32[$57 >> 2] = $20; //@line 7537
  $58 = $ReallocAsyncCtx3 + 36 | 0; //@line 7538
  HEAP32[$58 >> 2] = $22; //@line 7539
  sp = STACKTOP; //@line 7540
  return;
 } else {
  $ReallocAsyncCtx4 = _emscripten_realloc_async_context(32) | 0; //@line 7543
  _mbed_assert_internal(2045, 1878, 98); //@line 7544
  if (___async) {
   HEAP32[$ReallocAsyncCtx4 >> 2] = 83; //@line 7547
   $64 = $ReallocAsyncCtx4 + 8 | 0; //@line 7548
   $65 = $64; //@line 7549
   $66 = $65; //@line 7550
   HEAP32[$66 >> 2] = $11; //@line 7551
   $67 = $65 + 4 | 0; //@line 7552
   $68 = $67; //@line 7553
   HEAP32[$68 >> 2] = $14; //@line 7554
   $69 = $ReallocAsyncCtx4 + 16 | 0; //@line 7555
   $70 = $69; //@line 7556
   $71 = $70; //@line 7557
   HEAP32[$71 >> 2] = $4; //@line 7558
   $72 = $70 + 4 | 0; //@line 7559
   $73 = $72; //@line 7560
   HEAP32[$73 >> 2] = $7; //@line 7561
   $74 = $ReallocAsyncCtx4 + 24 | 0; //@line 7562
   HEAP32[$74 >> 2] = $20; //@line 7563
   $75 = $ReallocAsyncCtx4 + 28 | 0; //@line 7564
   HEAP32[$75 >> 2] = $22; //@line 7565
   sp = STACKTOP; //@line 7566
   return;
  }
  ___async_unwind = 0; //@line 7569
  HEAP32[$ReallocAsyncCtx4 >> 2] = 83; //@line 7570
  $64 = $ReallocAsyncCtx4 + 8 | 0; //@line 7571
  $65 = $64; //@line 7572
  $66 = $65; //@line 7573
  HEAP32[$66 >> 2] = $11; //@line 7574
  $67 = $65 + 4 | 0; //@line 7575
  $68 = $67; //@line 7576
  HEAP32[$68 >> 2] = $14; //@line 7577
  $69 = $ReallocAsyncCtx4 + 16 | 0; //@line 7578
  $70 = $69; //@line 7579
  $71 = $70; //@line 7580
  HEAP32[$71 >> 2] = $4; //@line 7581
  $72 = $70 + 4 | 0; //@line 7582
  $73 = $72; //@line 7583
  HEAP32[$73 >> 2] = $7; //@line 7584
  $74 = $ReallocAsyncCtx4 + 24 | 0; //@line 7585
  HEAP32[$74 >> 2] = $20; //@line 7586
  $75 = $ReallocAsyncCtx4 + 28 | 0; //@line 7587
  HEAP32[$75 >> 2] = $22; //@line 7588
  sp = STACKTOP; //@line 7589
  return;
 }
}
function __ZN20SimulatorBlockDevice4readEPvyy__async_cb_44($0) {
 $0 = $0 | 0;
 var $11 = 0, $14 = 0, $16 = 0, $18 = 0, $2 = 0, $20 = 0, $22 = 0, $24 = 0, $30 = 0, $35 = 0, $36 = 0, $39 = 0, $4 = 0, $40 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $60 = 0, $64 = 0, $65 = 0, $66 = 0, $67 = 0, $68 = 0, $69 = 0, $7 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $9 = 0, $ReallocAsyncCtx3 = 0, $ReallocAsyncCtx4 = 0, sp = 0;
 sp = STACKTOP; //@line 6570
 $2 = $0 + 8 | 0; //@line 6572
 $4 = HEAP32[$2 >> 2] | 0; //@line 6574
 $7 = HEAP32[$2 + 4 >> 2] | 0; //@line 6577
 $9 = $0 + 16 | 0; //@line 6579
 $11 = HEAP32[$9 >> 2] | 0; //@line 6581
 $14 = HEAP32[$9 + 4 >> 2] | 0; //@line 6584
 $16 = HEAP32[$0 + 24 >> 2] | 0; //@line 6586
 $18 = HEAP32[$0 + 28 >> 2] | 0; //@line 6588
 $20 = HEAP32[$0 + 32 >> 2] | 0; //@line 6590
 $22 = HEAP32[$0 + 36 >> 2] | 0; //@line 6592
 $24 = ___async_retval; //@line 6594
 $30 = ___uremdi3($4 | 0, $7 | 0, HEAP32[$24 >> 2] | 0, HEAP32[$24 + 4 >> 2] | 0) | 0; //@line 6600
 if (($30 | 0) == 0 & (tempRet0 | 0) == 0) {
  $35 = _i64Add($4 | 0, $7 | 0, $11 | 0, $14 | 0) | 0; //@line 6606
  $36 = tempRet0; //@line 6607
  $39 = HEAP32[(HEAP32[$16 >> 2] | 0) + 56 >> 2] | 0; //@line 6610
  $ReallocAsyncCtx3 = _emscripten_realloc_async_context(40) | 0; //@line 6611
  $40 = FUNCTION_TABLE_ii[$39 & 15]($18) | 0; //@line 6612
  if (___async) {
   HEAP32[$ReallocAsyncCtx3 >> 2] = 78; //@line 6616
   $42 = $ReallocAsyncCtx3 + 8 | 0; //@line 6617
   $43 = $42; //@line 6618
   $44 = $43; //@line 6619
   HEAP32[$44 >> 2] = $35; //@line 6620
   $45 = $43 + 4 | 0; //@line 6621
   $46 = $45; //@line 6622
   HEAP32[$46 >> 2] = $36; //@line 6623
   $47 = $ReallocAsyncCtx3 + 16 | 0; //@line 6624
   $48 = $47; //@line 6625
   $49 = $48; //@line 6626
   HEAP32[$49 >> 2] = $11; //@line 6627
   $50 = $48 + 4 | 0; //@line 6628
   $51 = $50; //@line 6629
   HEAP32[$51 >> 2] = $14; //@line 6630
   $52 = $ReallocAsyncCtx3 + 24 | 0; //@line 6631
   $53 = $52; //@line 6632
   $54 = $53; //@line 6633
   HEAP32[$54 >> 2] = $4; //@line 6634
   $55 = $53 + 4 | 0; //@line 6635
   $56 = $55; //@line 6636
   HEAP32[$56 >> 2] = $7; //@line 6637
   $57 = $ReallocAsyncCtx3 + 32 | 0; //@line 6638
   HEAP32[$57 >> 2] = $20; //@line 6639
   $58 = $ReallocAsyncCtx3 + 36 | 0; //@line 6640
   HEAP32[$58 >> 2] = $22; //@line 6641
   sp = STACKTOP; //@line 6642
   return;
  }
  $60 = ___async_retval; //@line 6646
  HEAP32[$60 >> 2] = $40; //@line 6648
  HEAP32[$60 + 4 >> 2] = tempRet0; //@line 6651
  ___async_unwind = 0; //@line 6652
  HEAP32[$ReallocAsyncCtx3 >> 2] = 78; //@line 6653
  $42 = $ReallocAsyncCtx3 + 8 | 0; //@line 6654
  $43 = $42; //@line 6655
  $44 = $43; //@line 6656
  HEAP32[$44 >> 2] = $35; //@line 6657
  $45 = $43 + 4 | 0; //@line 6658
  $46 = $45; //@line 6659
  HEAP32[$46 >> 2] = $36; //@line 6660
  $47 = $ReallocAsyncCtx3 + 16 | 0; //@line 6661
  $48 = $47; //@line 6662
  $49 = $48; //@line 6663
  HEAP32[$49 >> 2] = $11; //@line 6664
  $50 = $48 + 4 | 0; //@line 6665
  $51 = $50; //@line 6666
  HEAP32[$51 >> 2] = $14; //@line 6667
  $52 = $ReallocAsyncCtx3 + 24 | 0; //@line 6668
  $53 = $52; //@line 6669
  $54 = $53; //@line 6670
  HEAP32[$54 >> 2] = $4; //@line 6671
  $55 = $53 + 4 | 0; //@line 6672
  $56 = $55; //@line 6673
  HEAP32[$56 >> 2] = $7; //@line 6674
  $57 = $ReallocAsyncCtx3 + 32 | 0; //@line 6675
  HEAP32[$57 >> 2] = $20; //@line 6676
  $58 = $ReallocAsyncCtx3 + 36 | 0; //@line 6677
  HEAP32[$58 >> 2] = $22; //@line 6678
  sp = STACKTOP; //@line 6679
  return;
 } else {
  $ReallocAsyncCtx4 = _emscripten_realloc_async_context(32) | 0; //@line 6682
  _mbed_assert_internal(2151, 1878, 83); //@line 6683
  if (___async) {
   HEAP32[$ReallocAsyncCtx4 >> 2] = 79; //@line 6686
   $64 = $ReallocAsyncCtx4 + 8 | 0; //@line 6687
   $65 = $64; //@line 6688
   $66 = $65; //@line 6689
   HEAP32[$66 >> 2] = $11; //@line 6690
   $67 = $65 + 4 | 0; //@line 6691
   $68 = $67; //@line 6692
   HEAP32[$68 >> 2] = $14; //@line 6693
   $69 = $ReallocAsyncCtx4 + 16 | 0; //@line 6694
   $70 = $69; //@line 6695
   $71 = $70; //@line 6696
   HEAP32[$71 >> 2] = $4; //@line 6697
   $72 = $70 + 4 | 0; //@line 6698
   $73 = $72; //@line 6699
   HEAP32[$73 >> 2] = $7; //@line 6700
   $74 = $ReallocAsyncCtx4 + 24 | 0; //@line 6701
   HEAP32[$74 >> 2] = $20; //@line 6702
   $75 = $ReallocAsyncCtx4 + 28 | 0; //@line 6703
   HEAP32[$75 >> 2] = $22; //@line 6704
   sp = STACKTOP; //@line 6705
   return;
  }
  ___async_unwind = 0; //@line 6708
  HEAP32[$ReallocAsyncCtx4 >> 2] = 79; //@line 6709
  $64 = $ReallocAsyncCtx4 + 8 | 0; //@line 6710
  $65 = $64; //@line 6711
  $66 = $65; //@line 6712
  HEAP32[$66 >> 2] = $11; //@line 6713
  $67 = $65 + 4 | 0; //@line 6714
  $68 = $67; //@line 6715
  HEAP32[$68 >> 2] = $14; //@line 6716
  $69 = $ReallocAsyncCtx4 + 16 | 0; //@line 6717
  $70 = $69; //@line 6718
  $71 = $70; //@line 6719
  HEAP32[$71 >> 2] = $4; //@line 6720
  $72 = $70 + 4 | 0; //@line 6721
  $73 = $72; //@line 6722
  HEAP32[$73 >> 2] = $7; //@line 6723
  $74 = $ReallocAsyncCtx4 + 24 | 0; //@line 6724
  HEAP32[$74 >> 2] = $20; //@line 6725
  $75 = $ReallocAsyncCtx4 + 28 | 0; //@line 6726
  HEAP32[$75 >> 2] = $22; //@line 6727
  sp = STACKTOP; //@line 6728
  return;
 }
}
function __ZN4mbed11InterruptIn4fallENS_8CallbackIFvvEEE($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$phi$trans$insert = 0, $$pre = 0, $$pre$i$i4 = 0, $$pre10 = 0, $12 = 0, $2 = 0, $20 = 0, $21 = 0, $25 = 0, $27 = 0, $29 = 0, $3 = 0, $30 = 0, $33 = 0, $4 = 0, $41 = 0, $49 = 0, $6 = 0, $8 = 0, $9 = 0, $AsyncCtx = 0, $AsyncCtx11 = 0, $AsyncCtx2 = 0, $AsyncCtx5 = 0, $AsyncCtx8 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 322
 STACKTOP = STACKTOP + 16 | 0; //@line 323
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 323
 $2 = sp; //@line 324
 $3 = $1 + 12 | 0; //@line 325
 $4 = HEAP32[$3 >> 2] | 0; //@line 326
 if ($4 | 0) {
  $6 = $0 + 56 | 0; //@line 329
  if (($6 | 0) != ($1 | 0)) {
   $8 = $0 + 68 | 0; //@line 332
   $9 = HEAP32[$8 >> 2] | 0; //@line 333
   do {
    if (!$9) {
     $20 = $4; //@line 337
     label = 7; //@line 338
    } else {
     $12 = HEAP32[$9 + 8 >> 2] | 0; //@line 341
     $AsyncCtx = _emscripten_alloc_async_context(24, sp) | 0; //@line 342
     FUNCTION_TABLE_vi[$12 & 255]($6); //@line 343
     if (___async) {
      HEAP32[$AsyncCtx >> 2] = 20; //@line 346
      HEAP32[$AsyncCtx + 4 >> 2] = $3; //@line 348
      HEAP32[$AsyncCtx + 8 >> 2] = $8; //@line 350
      HEAP32[$AsyncCtx + 12 >> 2] = $6; //@line 352
      HEAP32[$AsyncCtx + 16 >> 2] = $1; //@line 354
      HEAP32[$AsyncCtx + 20 >> 2] = $0; //@line 356
      sp = STACKTOP; //@line 357
      STACKTOP = sp; //@line 358
      return;
     } else {
      _emscripten_free_async_context($AsyncCtx | 0); //@line 360
      $$pre = HEAP32[$3 >> 2] | 0; //@line 361
      if (!$$pre) {
       $25 = 0; //@line 364
       break;
      } else {
       $20 = $$pre; //@line 367
       label = 7; //@line 368
       break;
      }
     }
    }
   } while (0);
   do {
    if ((label | 0) == 7) {
     $21 = HEAP32[$20 + 4 >> 2] | 0; //@line 377
     $AsyncCtx2 = _emscripten_alloc_async_context(16, sp) | 0; //@line 378
     FUNCTION_TABLE_vii[$21 & 3]($6, $1); //@line 379
     if (___async) {
      HEAP32[$AsyncCtx2 >> 2] = 21; //@line 382
      HEAP32[$AsyncCtx2 + 4 >> 2] = $3; //@line 384
      HEAP32[$AsyncCtx2 + 8 >> 2] = $8; //@line 386
      HEAP32[$AsyncCtx2 + 12 >> 2] = $0; //@line 388
      sp = STACKTOP; //@line 389
      STACKTOP = sp; //@line 390
      return;
     } else {
      _emscripten_free_async_context($AsyncCtx2 | 0); //@line 392
      $25 = HEAP32[$3 >> 2] | 0; //@line 394
      break;
     }
    }
   } while (0);
   HEAP32[$8 >> 2] = $25; //@line 399
  }
  _gpio_irq_set($0 + 28 | 0, 2, 1); //@line 402
  STACKTOP = sp; //@line 403
  return;
 }
 HEAP32[$2 >> 2] = 0; //@line 405
 HEAP32[$2 + 4 >> 2] = 0; //@line 405
 HEAP32[$2 + 8 >> 2] = 0; //@line 405
 HEAP32[$2 + 12 >> 2] = 0; //@line 405
 $27 = $0 + 56 | 0; //@line 406
 do {
  if (($27 | 0) != ($2 | 0)) {
   $29 = $0 + 68 | 0; //@line 410
   $30 = HEAP32[$29 >> 2] | 0; //@line 411
   if ($30 | 0) {
    $33 = HEAP32[$30 + 8 >> 2] | 0; //@line 415
    $AsyncCtx5 = _emscripten_alloc_async_context(24, sp) | 0; //@line 416
    FUNCTION_TABLE_vi[$33 & 255]($27); //@line 417
    if (___async) {
     HEAP32[$AsyncCtx5 >> 2] = 22; //@line 420
     HEAP32[$AsyncCtx5 + 4 >> 2] = $2; //@line 422
     HEAP32[$AsyncCtx5 + 8 >> 2] = $29; //@line 424
     HEAP32[$AsyncCtx5 + 12 >> 2] = $27; //@line 426
     HEAP32[$AsyncCtx5 + 16 >> 2] = $2; //@line 428
     HEAP32[$AsyncCtx5 + 20 >> 2] = $0; //@line 430
     sp = STACKTOP; //@line 431
     STACKTOP = sp; //@line 432
     return;
    }
    _emscripten_free_async_context($AsyncCtx5 | 0); //@line 434
    $$phi$trans$insert = $2 + 12 | 0; //@line 435
    $$pre10 = HEAP32[$$phi$trans$insert >> 2] | 0; //@line 436
    if ($$pre10 | 0) {
     $41 = HEAP32[$$pre10 + 4 >> 2] | 0; //@line 440
     $AsyncCtx8 = _emscripten_alloc_async_context(20, sp) | 0; //@line 441
     FUNCTION_TABLE_vii[$41 & 3]($27, $2); //@line 442
     if (___async) {
      HEAP32[$AsyncCtx8 >> 2] = 23; //@line 445
      HEAP32[$AsyncCtx8 + 4 >> 2] = $$phi$trans$insert; //@line 447
      HEAP32[$AsyncCtx8 + 8 >> 2] = $29; //@line 449
      HEAP32[$AsyncCtx8 + 12 >> 2] = $2; //@line 451
      HEAP32[$AsyncCtx8 + 16 >> 2] = $0; //@line 453
      sp = STACKTOP; //@line 454
      STACKTOP = sp; //@line 455
      return;
     }
     _emscripten_free_async_context($AsyncCtx8 | 0); //@line 457
     $$pre$i$i4 = HEAP32[$$phi$trans$insert >> 2] | 0; //@line 458
     HEAP32[$29 >> 2] = $$pre$i$i4; //@line 459
     if (!$$pre$i$i4) {
      break;
     }
     $49 = HEAP32[$$pre$i$i4 + 8 >> 2] | 0; //@line 466
     $AsyncCtx11 = _emscripten_alloc_async_context(12, sp) | 0; //@line 467
     FUNCTION_TABLE_vi[$49 & 255]($2); //@line 468
     if (___async) {
      HEAP32[$AsyncCtx11 >> 2] = 24; //@line 471
      HEAP32[$AsyncCtx11 + 4 >> 2] = $2; //@line 473
      HEAP32[$AsyncCtx11 + 8 >> 2] = $0; //@line 475
      sp = STACKTOP; //@line 476
      STACKTOP = sp; //@line 477
      return;
     } else {
      _emscripten_free_async_context($AsyncCtx11 | 0); //@line 479
      break;
     }
    }
   }
   HEAP32[$29 >> 2] = 0; //@line 484
  }
 } while (0);
 _gpio_irq_set($0 + 28 | 0, 2, 0); //@line 488
 STACKTOP = sp; //@line 489
 return;
}
function __ZN20SimulatorBlockDevice7programEPKvyy__async_cb($0) {
 $0 = $0 | 0;
 var $11 = 0, $13 = 0, $15 = 0, $18 = 0, $2 = 0, $20 = 0, $22 = 0, $24 = 0, $30 = 0, $37 = 0, $38 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $55 = 0, $59 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0, $67 = 0, $68 = 0, $69 = 0, $7 = 0, $70 = 0, $9 = 0, $ReallocAsyncCtx2 = 0, $ReallocAsyncCtx4 = 0, sp = 0;
 sp = STACKTOP; //@line 7270
 $2 = $0 + 8 | 0; //@line 7272
 $4 = HEAP32[$2 >> 2] | 0; //@line 7274
 $7 = HEAP32[$2 + 4 >> 2] | 0; //@line 7277
 $9 = HEAP32[$0 + 16 >> 2] | 0; //@line 7279
 $11 = HEAP32[$0 + 20 >> 2] | 0; //@line 7281
 $13 = $0 + 24 | 0; //@line 7283
 $15 = HEAP32[$13 >> 2] | 0; //@line 7285
 $18 = HEAP32[$13 + 4 >> 2] | 0; //@line 7288
 $20 = HEAP32[$0 + 32 >> 2] | 0; //@line 7290
 $22 = HEAP32[$0 + 36 >> 2] | 0; //@line 7292
 $24 = ___async_retval; //@line 7294
 $30 = ___uremdi3($4 | 0, $7 | 0, HEAP32[$24 >> 2] | 0, HEAP32[$24 + 4 >> 2] | 0) | 0; //@line 7300
 if (($30 | 0) == 0 & (tempRet0 | 0) == 0) {
  $37 = HEAP32[(HEAP32[$9 >> 2] | 0) + 40 >> 2] | 0; //@line 7308
  $ReallocAsyncCtx2 = _emscripten_realloc_async_context(40) | 0; //@line 7309
  $38 = FUNCTION_TABLE_ii[$37 & 15]($11) | 0; //@line 7310
  if (___async) {
   HEAP32[$ReallocAsyncCtx2 >> 2] = 81; //@line 7314
   $40 = $ReallocAsyncCtx2 + 8 | 0; //@line 7315
   $41 = $40; //@line 7316
   $42 = $41; //@line 7317
   HEAP32[$42 >> 2] = $15; //@line 7318
   $43 = $41 + 4 | 0; //@line 7319
   $44 = $43; //@line 7320
   HEAP32[$44 >> 2] = $18; //@line 7321
   $45 = $ReallocAsyncCtx2 + 16 | 0; //@line 7322
   $46 = $45; //@line 7323
   $47 = $46; //@line 7324
   HEAP32[$47 >> 2] = $4; //@line 7325
   $48 = $46 + 4 | 0; //@line 7326
   $49 = $48; //@line 7327
   HEAP32[$49 >> 2] = $7; //@line 7328
   $50 = $ReallocAsyncCtx2 + 24 | 0; //@line 7329
   HEAP32[$50 >> 2] = $9; //@line 7330
   $51 = $ReallocAsyncCtx2 + 28 | 0; //@line 7331
   HEAP32[$51 >> 2] = $11; //@line 7332
   $52 = $ReallocAsyncCtx2 + 32 | 0; //@line 7333
   HEAP32[$52 >> 2] = $20; //@line 7334
   $53 = $ReallocAsyncCtx2 + 36 | 0; //@line 7335
   HEAP32[$53 >> 2] = $22; //@line 7336
   sp = STACKTOP; //@line 7337
   return;
  }
  $55 = ___async_retval; //@line 7341
  HEAP32[$55 >> 2] = $38; //@line 7343
  HEAP32[$55 + 4 >> 2] = tempRet0; //@line 7346
  ___async_unwind = 0; //@line 7347
  HEAP32[$ReallocAsyncCtx2 >> 2] = 81; //@line 7348
  $40 = $ReallocAsyncCtx2 + 8 | 0; //@line 7349
  $41 = $40; //@line 7350
  $42 = $41; //@line 7351
  HEAP32[$42 >> 2] = $15; //@line 7352
  $43 = $41 + 4 | 0; //@line 7353
  $44 = $43; //@line 7354
  HEAP32[$44 >> 2] = $18; //@line 7355
  $45 = $ReallocAsyncCtx2 + 16 | 0; //@line 7356
  $46 = $45; //@line 7357
  $47 = $46; //@line 7358
  HEAP32[$47 >> 2] = $4; //@line 7359
  $48 = $46 + 4 | 0; //@line 7360
  $49 = $48; //@line 7361
  HEAP32[$49 >> 2] = $7; //@line 7362
  $50 = $ReallocAsyncCtx2 + 24 | 0; //@line 7363
  HEAP32[$50 >> 2] = $9; //@line 7364
  $51 = $ReallocAsyncCtx2 + 28 | 0; //@line 7365
  HEAP32[$51 >> 2] = $11; //@line 7366
  $52 = $ReallocAsyncCtx2 + 32 | 0; //@line 7367
  HEAP32[$52 >> 2] = $20; //@line 7368
  $53 = $ReallocAsyncCtx2 + 36 | 0; //@line 7369
  HEAP32[$53 >> 2] = $22; //@line 7370
  sp = STACKTOP; //@line 7371
  return;
 } else {
  $ReallocAsyncCtx4 = _emscripten_realloc_async_context(32) | 0; //@line 7374
  _mbed_assert_internal(2045, 1878, 98); //@line 7375
  if (___async) {
   HEAP32[$ReallocAsyncCtx4 >> 2] = 83; //@line 7378
   $59 = $ReallocAsyncCtx4 + 8 | 0; //@line 7379
   $60 = $59; //@line 7380
   $61 = $60; //@line 7381
   HEAP32[$61 >> 2] = $4; //@line 7382
   $62 = $60 + 4 | 0; //@line 7383
   $63 = $62; //@line 7384
   HEAP32[$63 >> 2] = $7; //@line 7385
   $64 = $ReallocAsyncCtx4 + 16 | 0; //@line 7386
   $65 = $64; //@line 7387
   $66 = $65; //@line 7388
   HEAP32[$66 >> 2] = $15; //@line 7389
   $67 = $65 + 4 | 0; //@line 7390
   $68 = $67; //@line 7391
   HEAP32[$68 >> 2] = $18; //@line 7392
   $69 = $ReallocAsyncCtx4 + 24 | 0; //@line 7393
   HEAP32[$69 >> 2] = $20; //@line 7394
   $70 = $ReallocAsyncCtx4 + 28 | 0; //@line 7395
   HEAP32[$70 >> 2] = $22; //@line 7396
   sp = STACKTOP; //@line 7397
   return;
  }
  ___async_unwind = 0; //@line 7400
  HEAP32[$ReallocAsyncCtx4 >> 2] = 83; //@line 7401
  $59 = $ReallocAsyncCtx4 + 8 | 0; //@line 7402
  $60 = $59; //@line 7403
  $61 = $60; //@line 7404
  HEAP32[$61 >> 2] = $4; //@line 7405
  $62 = $60 + 4 | 0; //@line 7406
  $63 = $62; //@line 7407
  HEAP32[$63 >> 2] = $7; //@line 7408
  $64 = $ReallocAsyncCtx4 + 16 | 0; //@line 7409
  $65 = $64; //@line 7410
  $66 = $65; //@line 7411
  HEAP32[$66 >> 2] = $15; //@line 7412
  $67 = $65 + 4 | 0; //@line 7413
  $68 = $67; //@line 7414
  HEAP32[$68 >> 2] = $18; //@line 7415
  $69 = $ReallocAsyncCtx4 + 24 | 0; //@line 7416
  HEAP32[$69 >> 2] = $20; //@line 7417
  $70 = $ReallocAsyncCtx4 + 28 | 0; //@line 7418
  HEAP32[$70 >> 2] = $22; //@line 7419
  sp = STACKTOP; //@line 7420
  return;
 }
}
function __ZN20SimulatorBlockDevice4readEPvyy__async_cb($0) {
 $0 = $0 | 0;
 var $11 = 0, $13 = 0, $15 = 0, $18 = 0, $2 = 0, $20 = 0, $22 = 0, $24 = 0, $30 = 0, $37 = 0, $38 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $55 = 0, $59 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0, $67 = 0, $68 = 0, $69 = 0, $7 = 0, $70 = 0, $9 = 0, $ReallocAsyncCtx2 = 0, $ReallocAsyncCtx4 = 0, sp = 0;
 sp = STACKTOP; //@line 6409
 $2 = $0 + 8 | 0; //@line 6411
 $4 = HEAP32[$2 >> 2] | 0; //@line 6413
 $7 = HEAP32[$2 + 4 >> 2] | 0; //@line 6416
 $9 = HEAP32[$0 + 16 >> 2] | 0; //@line 6418
 $11 = HEAP32[$0 + 20 >> 2] | 0; //@line 6420
 $13 = $0 + 24 | 0; //@line 6422
 $15 = HEAP32[$13 >> 2] | 0; //@line 6424
 $18 = HEAP32[$13 + 4 >> 2] | 0; //@line 6427
 $20 = HEAP32[$0 + 32 >> 2] | 0; //@line 6429
 $22 = HEAP32[$0 + 36 >> 2] | 0; //@line 6431
 $24 = ___async_retval; //@line 6433
 $30 = ___uremdi3($4 | 0, $7 | 0, HEAP32[$24 >> 2] | 0, HEAP32[$24 + 4 >> 2] | 0) | 0; //@line 6439
 if (($30 | 0) == 0 & (tempRet0 | 0) == 0) {
  $37 = HEAP32[(HEAP32[$9 >> 2] | 0) + 36 >> 2] | 0; //@line 6447
  $ReallocAsyncCtx2 = _emscripten_realloc_async_context(40) | 0; //@line 6448
  $38 = FUNCTION_TABLE_ii[$37 & 15]($11) | 0; //@line 6449
  if (___async) {
   HEAP32[$ReallocAsyncCtx2 >> 2] = 77; //@line 6453
   $40 = $ReallocAsyncCtx2 + 8 | 0; //@line 6454
   $41 = $40; //@line 6455
   $42 = $41; //@line 6456
   HEAP32[$42 >> 2] = $15; //@line 6457
   $43 = $41 + 4 | 0; //@line 6458
   $44 = $43; //@line 6459
   HEAP32[$44 >> 2] = $18; //@line 6460
   $45 = $ReallocAsyncCtx2 + 16 | 0; //@line 6461
   $46 = $45; //@line 6462
   $47 = $46; //@line 6463
   HEAP32[$47 >> 2] = $4; //@line 6464
   $48 = $46 + 4 | 0; //@line 6465
   $49 = $48; //@line 6466
   HEAP32[$49 >> 2] = $7; //@line 6467
   $50 = $ReallocAsyncCtx2 + 24 | 0; //@line 6468
   HEAP32[$50 >> 2] = $9; //@line 6469
   $51 = $ReallocAsyncCtx2 + 28 | 0; //@line 6470
   HEAP32[$51 >> 2] = $11; //@line 6471
   $52 = $ReallocAsyncCtx2 + 32 | 0; //@line 6472
   HEAP32[$52 >> 2] = $20; //@line 6473
   $53 = $ReallocAsyncCtx2 + 36 | 0; //@line 6474
   HEAP32[$53 >> 2] = $22; //@line 6475
   sp = STACKTOP; //@line 6476
   return;
  }
  $55 = ___async_retval; //@line 6480
  HEAP32[$55 >> 2] = $38; //@line 6482
  HEAP32[$55 + 4 >> 2] = tempRet0; //@line 6485
  ___async_unwind = 0; //@line 6486
  HEAP32[$ReallocAsyncCtx2 >> 2] = 77; //@line 6487
  $40 = $ReallocAsyncCtx2 + 8 | 0; //@line 6488
  $41 = $40; //@line 6489
  $42 = $41; //@line 6490
  HEAP32[$42 >> 2] = $15; //@line 6491
  $43 = $41 + 4 | 0; //@line 6492
  $44 = $43; //@line 6493
  HEAP32[$44 >> 2] = $18; //@line 6494
  $45 = $ReallocAsyncCtx2 + 16 | 0; //@line 6495
  $46 = $45; //@line 6496
  $47 = $46; //@line 6497
  HEAP32[$47 >> 2] = $4; //@line 6498
  $48 = $46 + 4 | 0; //@line 6499
  $49 = $48; //@line 6500
  HEAP32[$49 >> 2] = $7; //@line 6501
  $50 = $ReallocAsyncCtx2 + 24 | 0; //@line 6502
  HEAP32[$50 >> 2] = $9; //@line 6503
  $51 = $ReallocAsyncCtx2 + 28 | 0; //@line 6504
  HEAP32[$51 >> 2] = $11; //@line 6505
  $52 = $ReallocAsyncCtx2 + 32 | 0; //@line 6506
  HEAP32[$52 >> 2] = $20; //@line 6507
  $53 = $ReallocAsyncCtx2 + 36 | 0; //@line 6508
  HEAP32[$53 >> 2] = $22; //@line 6509
  sp = STACKTOP; //@line 6510
  return;
 } else {
  $ReallocAsyncCtx4 = _emscripten_realloc_async_context(32) | 0; //@line 6513
  _mbed_assert_internal(2151, 1878, 83); //@line 6514
  if (___async) {
   HEAP32[$ReallocAsyncCtx4 >> 2] = 79; //@line 6517
   $59 = $ReallocAsyncCtx4 + 8 | 0; //@line 6518
   $60 = $59; //@line 6519
   $61 = $60; //@line 6520
   HEAP32[$61 >> 2] = $4; //@line 6521
   $62 = $60 + 4 | 0; //@line 6522
   $63 = $62; //@line 6523
   HEAP32[$63 >> 2] = $7; //@line 6524
   $64 = $ReallocAsyncCtx4 + 16 | 0; //@line 6525
   $65 = $64; //@line 6526
   $66 = $65; //@line 6527
   HEAP32[$66 >> 2] = $15; //@line 6528
   $67 = $65 + 4 | 0; //@line 6529
   $68 = $67; //@line 6530
   HEAP32[$68 >> 2] = $18; //@line 6531
   $69 = $ReallocAsyncCtx4 + 24 | 0; //@line 6532
   HEAP32[$69 >> 2] = $20; //@line 6533
   $70 = $ReallocAsyncCtx4 + 28 | 0; //@line 6534
   HEAP32[$70 >> 2] = $22; //@line 6535
   sp = STACKTOP; //@line 6536
   return;
  }
  ___async_unwind = 0; //@line 6539
  HEAP32[$ReallocAsyncCtx4 >> 2] = 79; //@line 6540
  $59 = $ReallocAsyncCtx4 + 8 | 0; //@line 6541
  $60 = $59; //@line 6542
  $61 = $60; //@line 6543
  HEAP32[$61 >> 2] = $4; //@line 6544
  $62 = $60 + 4 | 0; //@line 6545
  $63 = $62; //@line 6546
  HEAP32[$63 >> 2] = $7; //@line 6547
  $64 = $ReallocAsyncCtx4 + 16 | 0; //@line 6548
  $65 = $64; //@line 6549
  $66 = $65; //@line 6550
  HEAP32[$66 >> 2] = $15; //@line 6551
  $67 = $65 + 4 | 0; //@line 6552
  $68 = $67; //@line 6553
  HEAP32[$68 >> 2] = $18; //@line 6554
  $69 = $ReallocAsyncCtx4 + 24 | 0; //@line 6555
  HEAP32[$69 >> 2] = $20; //@line 6556
  $70 = $ReallocAsyncCtx4 + 28 | 0; //@line 6557
  HEAP32[$70 >> 2] = $22; //@line 6558
  sp = STACKTOP; //@line 6559
  return;
 }
}
function _mbed_vtracef__async_cb_13($0) {
 $0 = $0 | 0;
 var $$10 = 0, $$3147168 = 0, $$3169 = 0, $$5156 = 0, $$5156$ = 0, $$expand_i1_val = 0, $12 = 0, $16 = 0, $18 = 0, $2 = 0, $20 = 0, $22 = 0, $24 = 0, $26 = 0, $28 = 0, $32 = 0, $36 = 0, $4 = 0, $40 = 0, $46 = 0, $48 = 0, $50 = 0, $53 = 0, $54 = 0, $56 = 0, $6 = 0, $67 = 0, $68 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $79 = 0, $8 = 0, $80 = 0, $ReallocAsyncCtx10 = 0, $ReallocAsyncCtx7 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 1922
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 1924
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 1926
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 1928
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 1930
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 1934
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 1938
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 1940
 $20 = HEAP32[$0 + 40 >> 2] | 0; //@line 1942
 $22 = HEAP32[$0 + 44 >> 2] | 0; //@line 1944
 $24 = HEAP32[$0 + 48 >> 2] | 0; //@line 1946
 $26 = HEAP8[$0 + 52 >> 0] & 1; //@line 1949
 $28 = HEAP32[$0 + 56 >> 2] | 0; //@line 1951
 $32 = HEAP32[$0 + 64 >> 2] | 0; //@line 1955
 $36 = HEAP32[$0 + 72 >> 2] | 0; //@line 1959
 $40 = HEAP32[$0 + 80 >> 2] | 0; //@line 1963
 $46 = HEAP32[$0 + 92 >> 2] | 0; //@line 1969
 $48 = HEAP32[$0 + 96 >> 2] | 0; //@line 1971
 HEAP32[$40 >> 2] = HEAP32[___async_retval >> 2]; //@line 1974
 $50 = _snprintf($16, $18, 1407, $40) | 0; //@line 1975
 $$10 = ($50 | 0) >= ($18 | 0) ? 0 : $50; //@line 1977
 $53 = $16 + $$10 | 0; //@line 1979
 $54 = $18 - $$10 | 0; //@line 1980
 if (($$10 | 0) > 0) {
  if (($54 | 0) > 0) {
   $$3147168 = $54; //@line 1984
   $$3169 = $53; //@line 1984
   label = 4; //@line 1985
  }
 } else {
  $$3147168 = $18; //@line 1988
  $$3169 = $16; //@line 1988
  label = 4; //@line 1989
 }
 if ((label | 0) == 4) {
  $56 = $20 + -2 | 0; //@line 1992
  switch ($56 >>> 1 | $56 << 31 | 0) {
  case 0:
   {
    HEAP32[$12 >> 2] = $8; //@line 1998
    $$5156 = _snprintf($$3169, $$3147168, 1410, $12) | 0; //@line 2000
    break;
   }
  case 1:
   {
    HEAP32[$6 >> 2] = $8; //@line 2004
    $$5156 = _snprintf($$3169, $$3147168, 1425, $6) | 0; //@line 2006
    break;
   }
  case 3:
   {
    HEAP32[$28 >> 2] = $8; //@line 2010
    $$5156 = _snprintf($$3169, $$3147168, 1440, $28) | 0; //@line 2012
    break;
   }
  case 7:
   {
    HEAP32[$32 >> 2] = $8; //@line 2016
    $$5156 = _snprintf($$3169, $$3147168, 1455, $32) | 0; //@line 2018
    break;
   }
  default:
   {
    $$5156 = _snprintf($$3169, $$3147168, 1470, $36) | 0; //@line 2023
   }
  }
  $$5156$ = ($$5156 | 0) < ($$3147168 | 0) ? $$5156 : 0; //@line 2027
  $67 = $$3169 + $$5156$ | 0; //@line 2029
  $68 = $$3147168 - $$5156$ | 0; //@line 2030
  if (($$5156$ | 0) > 0 & ($68 | 0) > 0) {
   $ReallocAsyncCtx10 = _emscripten_realloc_async_context(32) | 0; //@line 2034
   $70 = _vsnprintf($67, $68, $22, $24) | 0; //@line 2035
   if (___async) {
    HEAP32[$ReallocAsyncCtx10 >> 2] = 44; //@line 2038
    $71 = $ReallocAsyncCtx10 + 4 | 0; //@line 2039
    HEAP32[$71 >> 2] = $2; //@line 2040
    $72 = $ReallocAsyncCtx10 + 8 | 0; //@line 2041
    HEAP32[$72 >> 2] = $4; //@line 2042
    $73 = $ReallocAsyncCtx10 + 12 | 0; //@line 2043
    $$expand_i1_val = $26 & 1; //@line 2044
    HEAP8[$73 >> 0] = $$expand_i1_val; //@line 2045
    $74 = $ReallocAsyncCtx10 + 16 | 0; //@line 2046
    HEAP32[$74 >> 2] = $68; //@line 2047
    $75 = $ReallocAsyncCtx10 + 20 | 0; //@line 2048
    HEAP32[$75 >> 2] = $67; //@line 2049
    $76 = $ReallocAsyncCtx10 + 24 | 0; //@line 2050
    HEAP32[$76 >> 2] = $46; //@line 2051
    $77 = $ReallocAsyncCtx10 + 28 | 0; //@line 2052
    HEAP32[$77 >> 2] = $48; //@line 2053
    sp = STACKTOP; //@line 2054
    return;
   }
   HEAP32[___async_retval >> 2] = $70; //@line 2058
   ___async_unwind = 0; //@line 2059
   HEAP32[$ReallocAsyncCtx10 >> 2] = 44; //@line 2060
   $71 = $ReallocAsyncCtx10 + 4 | 0; //@line 2061
   HEAP32[$71 >> 2] = $2; //@line 2062
   $72 = $ReallocAsyncCtx10 + 8 | 0; //@line 2063
   HEAP32[$72 >> 2] = $4; //@line 2064
   $73 = $ReallocAsyncCtx10 + 12 | 0; //@line 2065
   $$expand_i1_val = $26 & 1; //@line 2066
   HEAP8[$73 >> 0] = $$expand_i1_val; //@line 2067
   $74 = $ReallocAsyncCtx10 + 16 | 0; //@line 2068
   HEAP32[$74 >> 2] = $68; //@line 2069
   $75 = $ReallocAsyncCtx10 + 20 | 0; //@line 2070
   HEAP32[$75 >> 2] = $67; //@line 2071
   $76 = $ReallocAsyncCtx10 + 24 | 0; //@line 2072
   HEAP32[$76 >> 2] = $46; //@line 2073
   $77 = $ReallocAsyncCtx10 + 28 | 0; //@line 2074
   HEAP32[$77 >> 2] = $48; //@line 2075
   sp = STACKTOP; //@line 2076
   return;
  }
 }
 $79 = HEAP32[59] | 0; //@line 2080
 $80 = HEAP32[52] | 0; //@line 2081
 $ReallocAsyncCtx7 = _emscripten_realloc_async_context(4) | 0; //@line 2082
 FUNCTION_TABLE_vi[$79 & 255]($80); //@line 2083
 if (___async) {
  HEAP32[$ReallocAsyncCtx7 >> 2] = 46; //@line 2086
  sp = STACKTOP; //@line 2087
  return;
 }
 ___async_unwind = 0; //@line 2090
 HEAP32[$ReallocAsyncCtx7 >> 2] = 46; //@line 2091
 sp = STACKTOP; //@line 2092
 return;
}
function __ZN20SimulatorBlockDevice5eraseEyy__async_cb_62($0) {
 $0 = $0 | 0;
 var $11 = 0, $14 = 0, $16 = 0, $18 = 0, $2 = 0, $20 = 0, $22 = 0, $28 = 0, $33 = 0, $34 = 0, $37 = 0, $38 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $57 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0, $67 = 0, $68 = 0, $69 = 0, $7 = 0, $70 = 0, $71 = 0, $9 = 0, $ReallocAsyncCtx3 = 0, $ReallocAsyncCtx4 = 0, sp = 0;
 sp = STACKTOP; //@line 8465
 $2 = $0 + 8 | 0; //@line 8467
 $4 = HEAP32[$2 >> 2] | 0; //@line 8469
 $7 = HEAP32[$2 + 4 >> 2] | 0; //@line 8472
 $9 = $0 + 16 | 0; //@line 8474
 $11 = HEAP32[$9 >> 2] | 0; //@line 8476
 $14 = HEAP32[$9 + 4 >> 2] | 0; //@line 8479
 $16 = HEAP32[$0 + 24 >> 2] | 0; //@line 8481
 $18 = HEAP32[$0 + 28 >> 2] | 0; //@line 8483
 $20 = HEAP32[$0 + 32 >> 2] | 0; //@line 8485
 $22 = ___async_retval; //@line 8487
 $28 = ___uremdi3($4 | 0, $7 | 0, HEAP32[$22 >> 2] | 0, HEAP32[$22 + 4 >> 2] | 0) | 0; //@line 8493
 if (($28 | 0) == 0 & (tempRet0 | 0) == 0) {
  $33 = _i64Add($4 | 0, $7 | 0, $11 | 0, $14 | 0) | 0; //@line 8499
  $34 = tempRet0; //@line 8500
  $37 = HEAP32[(HEAP32[$16 >> 2] | 0) + 56 >> 2] | 0; //@line 8503
  $ReallocAsyncCtx3 = _emscripten_realloc_async_context(40) | 0; //@line 8504
  $38 = FUNCTION_TABLE_ii[$37 & 15]($18) | 0; //@line 8505
  if (___async) {
   HEAP32[$ReallocAsyncCtx3 >> 2] = 86; //@line 8509
   $40 = $ReallocAsyncCtx3 + 8 | 0; //@line 8510
   $41 = $40; //@line 8511
   $42 = $41; //@line 8512
   HEAP32[$42 >> 2] = $33; //@line 8513
   $43 = $41 + 4 | 0; //@line 8514
   $44 = $43; //@line 8515
   HEAP32[$44 >> 2] = $34; //@line 8516
   $45 = $ReallocAsyncCtx3 + 16 | 0; //@line 8517
   $46 = $45; //@line 8518
   $47 = $46; //@line 8519
   HEAP32[$47 >> 2] = $11; //@line 8520
   $48 = $46 + 4 | 0; //@line 8521
   $49 = $48; //@line 8522
   HEAP32[$49 >> 2] = $14; //@line 8523
   $50 = $ReallocAsyncCtx3 + 24 | 0; //@line 8524
   $51 = $50; //@line 8525
   $52 = $51; //@line 8526
   HEAP32[$52 >> 2] = $4; //@line 8527
   $53 = $51 + 4 | 0; //@line 8528
   $54 = $53; //@line 8529
   HEAP32[$54 >> 2] = $7; //@line 8530
   $55 = $ReallocAsyncCtx3 + 32 | 0; //@line 8531
   HEAP32[$55 >> 2] = $20; //@line 8532
   sp = STACKTOP; //@line 8533
   return;
  }
  $57 = ___async_retval; //@line 8537
  HEAP32[$57 >> 2] = $38; //@line 8539
  HEAP32[$57 + 4 >> 2] = tempRet0; //@line 8542
  ___async_unwind = 0; //@line 8543
  HEAP32[$ReallocAsyncCtx3 >> 2] = 86; //@line 8544
  $40 = $ReallocAsyncCtx3 + 8 | 0; //@line 8545
  $41 = $40; //@line 8546
  $42 = $41; //@line 8547
  HEAP32[$42 >> 2] = $33; //@line 8548
  $43 = $41 + 4 | 0; //@line 8549
  $44 = $43; //@line 8550
  HEAP32[$44 >> 2] = $34; //@line 8551
  $45 = $ReallocAsyncCtx3 + 16 | 0; //@line 8552
  $46 = $45; //@line 8553
  $47 = $46; //@line 8554
  HEAP32[$47 >> 2] = $11; //@line 8555
  $48 = $46 + 4 | 0; //@line 8556
  $49 = $48; //@line 8557
  HEAP32[$49 >> 2] = $14; //@line 8558
  $50 = $ReallocAsyncCtx3 + 24 | 0; //@line 8559
  $51 = $50; //@line 8560
  $52 = $51; //@line 8561
  HEAP32[$52 >> 2] = $4; //@line 8562
  $53 = $51 + 4 | 0; //@line 8563
  $54 = $53; //@line 8564
  HEAP32[$54 >> 2] = $7; //@line 8565
  $55 = $ReallocAsyncCtx3 + 32 | 0; //@line 8566
  HEAP32[$55 >> 2] = $20; //@line 8567
  sp = STACKTOP; //@line 8568
  return;
 } else {
  $ReallocAsyncCtx4 = _emscripten_realloc_async_context(32) | 0; //@line 8571
  _mbed_assert_internal(1851, 1878, 113); //@line 8572
  if (___async) {
   HEAP32[$ReallocAsyncCtx4 >> 2] = 87; //@line 8575
   $61 = $ReallocAsyncCtx4 + 8 | 0; //@line 8576
   $62 = $61; //@line 8577
   $63 = $62; //@line 8578
   HEAP32[$63 >> 2] = $11; //@line 8579
   $64 = $62 + 4 | 0; //@line 8580
   $65 = $64; //@line 8581
   HEAP32[$65 >> 2] = $14; //@line 8582
   $66 = $ReallocAsyncCtx4 + 16 | 0; //@line 8583
   $67 = $66; //@line 8584
   $68 = $67; //@line 8585
   HEAP32[$68 >> 2] = $4; //@line 8586
   $69 = $67 + 4 | 0; //@line 8587
   $70 = $69; //@line 8588
   HEAP32[$70 >> 2] = $7; //@line 8589
   $71 = $ReallocAsyncCtx4 + 24 | 0; //@line 8590
   HEAP32[$71 >> 2] = $20; //@line 8591
   sp = STACKTOP; //@line 8592
   return;
  }
  ___async_unwind = 0; //@line 8595
  HEAP32[$ReallocAsyncCtx4 >> 2] = 87; //@line 8596
  $61 = $ReallocAsyncCtx4 + 8 | 0; //@line 8597
  $62 = $61; //@line 8598
  $63 = $62; //@line 8599
  HEAP32[$63 >> 2] = $11; //@line 8600
  $64 = $62 + 4 | 0; //@line 8601
  $65 = $64; //@line 8602
  HEAP32[$65 >> 2] = $14; //@line 8603
  $66 = $ReallocAsyncCtx4 + 16 | 0; //@line 8604
  $67 = $66; //@line 8605
  $68 = $67; //@line 8606
  HEAP32[$68 >> 2] = $4; //@line 8607
  $69 = $67 + 4 | 0; //@line 8608
  $70 = $69; //@line 8609
  HEAP32[$70 >> 2] = $7; //@line 8610
  $71 = $ReallocAsyncCtx4 + 24 | 0; //@line 8611
  HEAP32[$71 >> 2] = $20; //@line 8612
  sp = STACKTOP; //@line 8613
  return;
 }
}
function __ZN20SimulatorBlockDevice5eraseEyy__async_cb($0) {
 $0 = $0 | 0;
 var $11 = 0, $13 = 0, $15 = 0, $18 = 0, $2 = 0, $20 = 0, $22 = 0, $28 = 0, $35 = 0, $36 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $50 = 0, $52 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0, $7 = 0, $9 = 0, $ReallocAsyncCtx2 = 0, $ReallocAsyncCtx4 = 0, sp = 0;
 sp = STACKTOP; //@line 8315
 $2 = $0 + 8 | 0; //@line 8317
 $4 = HEAP32[$2 >> 2] | 0; //@line 8319
 $7 = HEAP32[$2 + 4 >> 2] | 0; //@line 8322
 $9 = HEAP32[$0 + 16 >> 2] | 0; //@line 8324
 $11 = HEAP32[$0 + 20 >> 2] | 0; //@line 8326
 $13 = $0 + 24 | 0; //@line 8328
 $15 = HEAP32[$13 >> 2] | 0; //@line 8330
 $18 = HEAP32[$13 + 4 >> 2] | 0; //@line 8333
 $20 = HEAP32[$0 + 32 >> 2] | 0; //@line 8335
 $22 = ___async_retval; //@line 8337
 $28 = ___uremdi3($4 | 0, $7 | 0, HEAP32[$22 >> 2] | 0, HEAP32[$22 + 4 >> 2] | 0) | 0; //@line 8343
 if (($28 | 0) == 0 & (tempRet0 | 0) == 0) {
  $35 = HEAP32[(HEAP32[$9 >> 2] | 0) + 44 >> 2] | 0; //@line 8351
  $ReallocAsyncCtx2 = _emscripten_realloc_async_context(40) | 0; //@line 8352
  $36 = FUNCTION_TABLE_ii[$35 & 15]($11) | 0; //@line 8353
  if (___async) {
   HEAP32[$ReallocAsyncCtx2 >> 2] = 85; //@line 8357
   $38 = $ReallocAsyncCtx2 + 8 | 0; //@line 8358
   $39 = $38; //@line 8359
   $40 = $39; //@line 8360
   HEAP32[$40 >> 2] = $15; //@line 8361
   $41 = $39 + 4 | 0; //@line 8362
   $42 = $41; //@line 8363
   HEAP32[$42 >> 2] = $18; //@line 8364
   $43 = $ReallocAsyncCtx2 + 16 | 0; //@line 8365
   $44 = $43; //@line 8366
   $45 = $44; //@line 8367
   HEAP32[$45 >> 2] = $4; //@line 8368
   $46 = $44 + 4 | 0; //@line 8369
   $47 = $46; //@line 8370
   HEAP32[$47 >> 2] = $7; //@line 8371
   $48 = $ReallocAsyncCtx2 + 24 | 0; //@line 8372
   HEAP32[$48 >> 2] = $9; //@line 8373
   $49 = $ReallocAsyncCtx2 + 28 | 0; //@line 8374
   HEAP32[$49 >> 2] = $11; //@line 8375
   $50 = $ReallocAsyncCtx2 + 32 | 0; //@line 8376
   HEAP32[$50 >> 2] = $20; //@line 8377
   sp = STACKTOP; //@line 8378
   return;
  }
  $52 = ___async_retval; //@line 8382
  HEAP32[$52 >> 2] = $36; //@line 8384
  HEAP32[$52 + 4 >> 2] = tempRet0; //@line 8387
  ___async_unwind = 0; //@line 8388
  HEAP32[$ReallocAsyncCtx2 >> 2] = 85; //@line 8389
  $38 = $ReallocAsyncCtx2 + 8 | 0; //@line 8390
  $39 = $38; //@line 8391
  $40 = $39; //@line 8392
  HEAP32[$40 >> 2] = $15; //@line 8393
  $41 = $39 + 4 | 0; //@line 8394
  $42 = $41; //@line 8395
  HEAP32[$42 >> 2] = $18; //@line 8396
  $43 = $ReallocAsyncCtx2 + 16 | 0; //@line 8397
  $44 = $43; //@line 8398
  $45 = $44; //@line 8399
  HEAP32[$45 >> 2] = $4; //@line 8400
  $46 = $44 + 4 | 0; //@line 8401
  $47 = $46; //@line 8402
  HEAP32[$47 >> 2] = $7; //@line 8403
  $48 = $ReallocAsyncCtx2 + 24 | 0; //@line 8404
  HEAP32[$48 >> 2] = $9; //@line 8405
  $49 = $ReallocAsyncCtx2 + 28 | 0; //@line 8406
  HEAP32[$49 >> 2] = $11; //@line 8407
  $50 = $ReallocAsyncCtx2 + 32 | 0; //@line 8408
  HEAP32[$50 >> 2] = $20; //@line 8409
  sp = STACKTOP; //@line 8410
  return;
 } else {
  $ReallocAsyncCtx4 = _emscripten_realloc_async_context(32) | 0; //@line 8413
  _mbed_assert_internal(1851, 1878, 113); //@line 8414
  if (___async) {
   HEAP32[$ReallocAsyncCtx4 >> 2] = 87; //@line 8417
   $56 = $ReallocAsyncCtx4 + 8 | 0; //@line 8418
   $57 = $56; //@line 8419
   $58 = $57; //@line 8420
   HEAP32[$58 >> 2] = $4; //@line 8421
   $59 = $57 + 4 | 0; //@line 8422
   $60 = $59; //@line 8423
   HEAP32[$60 >> 2] = $7; //@line 8424
   $61 = $ReallocAsyncCtx4 + 16 | 0; //@line 8425
   $62 = $61; //@line 8426
   $63 = $62; //@line 8427
   HEAP32[$63 >> 2] = $15; //@line 8428
   $64 = $62 + 4 | 0; //@line 8429
   $65 = $64; //@line 8430
   HEAP32[$65 >> 2] = $18; //@line 8431
   $66 = $ReallocAsyncCtx4 + 24 | 0; //@line 8432
   HEAP32[$66 >> 2] = $20; //@line 8433
   sp = STACKTOP; //@line 8434
   return;
  }
  ___async_unwind = 0; //@line 8437
  HEAP32[$ReallocAsyncCtx4 >> 2] = 87; //@line 8438
  $56 = $ReallocAsyncCtx4 + 8 | 0; //@line 8439
  $57 = $56; //@line 8440
  $58 = $57; //@line 8441
  HEAP32[$58 >> 2] = $4; //@line 8442
  $59 = $57 + 4 | 0; //@line 8443
  $60 = $59; //@line 8444
  HEAP32[$60 >> 2] = $7; //@line 8445
  $61 = $ReallocAsyncCtx4 + 16 | 0; //@line 8446
  $62 = $61; //@line 8447
  $63 = $62; //@line 8448
  HEAP32[$63 >> 2] = $15; //@line 8449
  $64 = $62 + 4 | 0; //@line 8450
  $65 = $64; //@line 8451
  HEAP32[$65 >> 2] = $18; //@line 8452
  $66 = $ReallocAsyncCtx4 + 24 | 0; //@line 8453
  HEAP32[$66 >> 2] = $20; //@line 8454
  sp = STACKTOP; //@line 8455
  return;
 }
}
function __ZN20SimulatorBlockDevice7programEPKvyy($0, $1, $2, $3, $4, $5) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 $5 = $5 | 0;
 var $10 = 0, $12 = 0, $19 = 0, $25 = 0, $32 = 0, $33 = 0, $34 = 0, $36 = 0, $41 = 0, $49 = 0, $54 = 0, $55 = 0, $58 = 0, $59 = 0, $60 = 0, $62 = 0, $67 = 0, $72 = 0, $8 = 0, $84 = 0, $89 = 0, $9 = 0, $95 = 0, $96 = 0, $97 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, $AsyncCtx6 = 0, $AsyncCtx9 = 0, sp = 0;
 sp = STACKTOP; //@line 3380
 $8 = HEAP32[(HEAP32[$0 >> 2] | 0) + 40 >> 2] | 0; //@line 3383
 $AsyncCtx = _emscripten_alloc_async_context(40, sp) | 0; //@line 3384
 $9 = FUNCTION_TABLE_ii[$8 & 15]($0) | 0; //@line 3385
 $10 = tempRet0; //@line 3386
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 80; //@line 3389
  $12 = $AsyncCtx + 8 | 0; //@line 3391
  HEAP32[$12 >> 2] = $2; //@line 3393
  HEAP32[$12 + 4 >> 2] = $3; //@line 3396
  HEAP32[$AsyncCtx + 16 >> 2] = $0; //@line 3398
  HEAP32[$AsyncCtx + 20 >> 2] = $0; //@line 3400
  $19 = $AsyncCtx + 24 | 0; //@line 3402
  HEAP32[$19 >> 2] = $4; //@line 3404
  HEAP32[$19 + 4 >> 2] = $5; //@line 3407
  HEAP32[$AsyncCtx + 32 >> 2] = $0; //@line 3409
  HEAP32[$AsyncCtx + 36 >> 2] = $1; //@line 3411
  sp = STACKTOP; //@line 3412
  return 0; //@line 3413
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 3415
 $25 = ___uremdi3($2 | 0, $3 | 0, $9 | 0, $10 | 0) | 0; //@line 3416
 if (($25 | 0) == 0 & (tempRet0 | 0) == 0) {
  $32 = HEAP32[(HEAP32[$0 >> 2] | 0) + 40 >> 2] | 0; //@line 3424
  $AsyncCtx3 = _emscripten_alloc_async_context(40, sp) | 0; //@line 3425
  $33 = FUNCTION_TABLE_ii[$32 & 15]($0) | 0; //@line 3426
  $34 = tempRet0; //@line 3427
  if (___async) {
   HEAP32[$AsyncCtx3 >> 2] = 81; //@line 3430
   $36 = $AsyncCtx3 + 8 | 0; //@line 3432
   HEAP32[$36 >> 2] = $4; //@line 3434
   HEAP32[$36 + 4 >> 2] = $5; //@line 3437
   $41 = $AsyncCtx3 + 16 | 0; //@line 3439
   HEAP32[$41 >> 2] = $2; //@line 3441
   HEAP32[$41 + 4 >> 2] = $3; //@line 3444
   HEAP32[$AsyncCtx3 + 24 >> 2] = $0; //@line 3446
   HEAP32[$AsyncCtx3 + 28 >> 2] = $0; //@line 3448
   HEAP32[$AsyncCtx3 + 32 >> 2] = $0; //@line 3450
   HEAP32[$AsyncCtx3 + 36 >> 2] = $1; //@line 3452
   sp = STACKTOP; //@line 3453
   return 0; //@line 3454
  }
  _emscripten_free_async_context($AsyncCtx3 | 0); //@line 3456
  $49 = ___uremdi3($4 | 0, $5 | 0, $33 | 0, $34 | 0) | 0; //@line 3457
  if (($49 | 0) == 0 & (tempRet0 | 0) == 0) {
   $54 = _i64Add($4 | 0, $5 | 0, $2 | 0, $3 | 0) | 0; //@line 3463
   $55 = tempRet0; //@line 3464
   $58 = HEAP32[(HEAP32[$0 >> 2] | 0) + 56 >> 2] | 0; //@line 3467
   $AsyncCtx6 = _emscripten_alloc_async_context(40, sp) | 0; //@line 3468
   $59 = FUNCTION_TABLE_ii[$58 & 15]($0) | 0; //@line 3469
   $60 = tempRet0; //@line 3470
   if (___async) {
    HEAP32[$AsyncCtx6 >> 2] = 82; //@line 3473
    $62 = $AsyncCtx6 + 8 | 0; //@line 3475
    HEAP32[$62 >> 2] = $54; //@line 3477
    HEAP32[$62 + 4 >> 2] = $55; //@line 3480
    $67 = $AsyncCtx6 + 16 | 0; //@line 3482
    HEAP32[$67 >> 2] = $2; //@line 3484
    HEAP32[$67 + 4 >> 2] = $3; //@line 3487
    $72 = $AsyncCtx6 + 24 | 0; //@line 3489
    HEAP32[$72 >> 2] = $4; //@line 3491
    HEAP32[$72 + 4 >> 2] = $5; //@line 3494
    HEAP32[$AsyncCtx6 + 32 >> 2] = $0; //@line 3496
    HEAP32[$AsyncCtx6 + 36 >> 2] = $1; //@line 3498
    sp = STACKTOP; //@line 3499
    return 0; //@line 3500
   }
   _emscripten_free_async_context($AsyncCtx6 | 0); //@line 3502
   if (!($55 >>> 0 > $60 >>> 0 | ($55 | 0) == ($60 | 0) & $54 >>> 0 > $59 >>> 0)) {
    $95 = $0 + 4 | 0; //@line 3509
    $96 = HEAP32[$95 >> 2] | 0; //@line 3510
    $97 = _emscripten_asm_const_iiiii(9, $96 | 0, $1 | 0, $2 | 0, $4 | 0) | 0; //@line 3511
    return 0; //@line 3512
   }
  }
 }
 $AsyncCtx9 = _emscripten_alloc_async_context(32, sp) | 0; //@line 3516
 _mbed_assert_internal(2045, 1878, 98); //@line 3517
 if (___async) {
  HEAP32[$AsyncCtx9 >> 2] = 83; //@line 3520
  $84 = $AsyncCtx9 + 8 | 0; //@line 3522
  HEAP32[$84 >> 2] = $2; //@line 3524
  HEAP32[$84 + 4 >> 2] = $3; //@line 3527
  $89 = $AsyncCtx9 + 16 | 0; //@line 3529
  HEAP32[$89 >> 2] = $4; //@line 3531
  HEAP32[$89 + 4 >> 2] = $5; //@line 3534
  HEAP32[$AsyncCtx9 + 24 >> 2] = $0; //@line 3536
  HEAP32[$AsyncCtx9 + 28 >> 2] = $1; //@line 3538
  sp = STACKTOP; //@line 3539
  return 0; //@line 3540
 }
 _emscripten_free_async_context($AsyncCtx9 | 0); //@line 3542
 $95 = $0 + 4 | 0; //@line 3543
 $96 = HEAP32[$95 >> 2] | 0; //@line 3544
 $97 = _emscripten_asm_const_iiiii(9, $96 | 0, $1 | 0, $2 | 0, $4 | 0) | 0; //@line 3545
 return 0; //@line 3546
}
function __ZN20SimulatorBlockDevice4readEPvyy($0, $1, $2, $3, $4, $5) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 $5 = $5 | 0;
 var $10 = 0, $12 = 0, $19 = 0, $25 = 0, $32 = 0, $33 = 0, $34 = 0, $36 = 0, $41 = 0, $49 = 0, $54 = 0, $55 = 0, $58 = 0, $59 = 0, $60 = 0, $62 = 0, $67 = 0, $72 = 0, $8 = 0, $84 = 0, $89 = 0, $9 = 0, $95 = 0, $96 = 0, $97 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, $AsyncCtx6 = 0, $AsyncCtx9 = 0, sp = 0;
 sp = STACKTOP; //@line 3199
 $8 = HEAP32[(HEAP32[$0 >> 2] | 0) + 36 >> 2] | 0; //@line 3202
 $AsyncCtx = _emscripten_alloc_async_context(40, sp) | 0; //@line 3203
 $9 = FUNCTION_TABLE_ii[$8 & 15]($0) | 0; //@line 3204
 $10 = tempRet0; //@line 3205
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 76; //@line 3208
  $12 = $AsyncCtx + 8 | 0; //@line 3210
  HEAP32[$12 >> 2] = $2; //@line 3212
  HEAP32[$12 + 4 >> 2] = $3; //@line 3215
  HEAP32[$AsyncCtx + 16 >> 2] = $0; //@line 3217
  HEAP32[$AsyncCtx + 20 >> 2] = $0; //@line 3219
  $19 = $AsyncCtx + 24 | 0; //@line 3221
  HEAP32[$19 >> 2] = $4; //@line 3223
  HEAP32[$19 + 4 >> 2] = $5; //@line 3226
  HEAP32[$AsyncCtx + 32 >> 2] = $0; //@line 3228
  HEAP32[$AsyncCtx + 36 >> 2] = $1; //@line 3230
  sp = STACKTOP; //@line 3231
  return 0; //@line 3232
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 3234
 $25 = ___uremdi3($2 | 0, $3 | 0, $9 | 0, $10 | 0) | 0; //@line 3235
 if (($25 | 0) == 0 & (tempRet0 | 0) == 0) {
  $32 = HEAP32[(HEAP32[$0 >> 2] | 0) + 36 >> 2] | 0; //@line 3243
  $AsyncCtx3 = _emscripten_alloc_async_context(40, sp) | 0; //@line 3244
  $33 = FUNCTION_TABLE_ii[$32 & 15]($0) | 0; //@line 3245
  $34 = tempRet0; //@line 3246
  if (___async) {
   HEAP32[$AsyncCtx3 >> 2] = 77; //@line 3249
   $36 = $AsyncCtx3 + 8 | 0; //@line 3251
   HEAP32[$36 >> 2] = $4; //@line 3253
   HEAP32[$36 + 4 >> 2] = $5; //@line 3256
   $41 = $AsyncCtx3 + 16 | 0; //@line 3258
   HEAP32[$41 >> 2] = $2; //@line 3260
   HEAP32[$41 + 4 >> 2] = $3; //@line 3263
   HEAP32[$AsyncCtx3 + 24 >> 2] = $0; //@line 3265
   HEAP32[$AsyncCtx3 + 28 >> 2] = $0; //@line 3267
   HEAP32[$AsyncCtx3 + 32 >> 2] = $0; //@line 3269
   HEAP32[$AsyncCtx3 + 36 >> 2] = $1; //@line 3271
   sp = STACKTOP; //@line 3272
   return 0; //@line 3273
  }
  _emscripten_free_async_context($AsyncCtx3 | 0); //@line 3275
  $49 = ___uremdi3($4 | 0, $5 | 0, $33 | 0, $34 | 0) | 0; //@line 3276
  if (($49 | 0) == 0 & (tempRet0 | 0) == 0) {
   $54 = _i64Add($4 | 0, $5 | 0, $2 | 0, $3 | 0) | 0; //@line 3282
   $55 = tempRet0; //@line 3283
   $58 = HEAP32[(HEAP32[$0 >> 2] | 0) + 56 >> 2] | 0; //@line 3286
   $AsyncCtx6 = _emscripten_alloc_async_context(40, sp) | 0; //@line 3287
   $59 = FUNCTION_TABLE_ii[$58 & 15]($0) | 0; //@line 3288
   $60 = tempRet0; //@line 3289
   if (___async) {
    HEAP32[$AsyncCtx6 >> 2] = 78; //@line 3292
    $62 = $AsyncCtx6 + 8 | 0; //@line 3294
    HEAP32[$62 >> 2] = $54; //@line 3296
    HEAP32[$62 + 4 >> 2] = $55; //@line 3299
    $67 = $AsyncCtx6 + 16 | 0; //@line 3301
    HEAP32[$67 >> 2] = $2; //@line 3303
    HEAP32[$67 + 4 >> 2] = $3; //@line 3306
    $72 = $AsyncCtx6 + 24 | 0; //@line 3308
    HEAP32[$72 >> 2] = $4; //@line 3310
    HEAP32[$72 + 4 >> 2] = $5; //@line 3313
    HEAP32[$AsyncCtx6 + 32 >> 2] = $0; //@line 3315
    HEAP32[$AsyncCtx6 + 36 >> 2] = $1; //@line 3317
    sp = STACKTOP; //@line 3318
    return 0; //@line 3319
   }
   _emscripten_free_async_context($AsyncCtx6 | 0); //@line 3321
   if (!($55 >>> 0 > $60 >>> 0 | ($55 | 0) == ($60 | 0) & $54 >>> 0 > $59 >>> 0)) {
    $95 = $0 + 4 | 0; //@line 3328
    $96 = HEAP32[$95 >> 2] | 0; //@line 3329
    $97 = _emscripten_asm_const_iiiii(8, $96 | 0, $1 | 0, $2 | 0, $4 | 0) | 0; //@line 3330
    return 0; //@line 3331
   }
  }
 }
 $AsyncCtx9 = _emscripten_alloc_async_context(32, sp) | 0; //@line 3335
 _mbed_assert_internal(2151, 1878, 83); //@line 3336
 if (___async) {
  HEAP32[$AsyncCtx9 >> 2] = 79; //@line 3339
  $84 = $AsyncCtx9 + 8 | 0; //@line 3341
  HEAP32[$84 >> 2] = $2; //@line 3343
  HEAP32[$84 + 4 >> 2] = $3; //@line 3346
  $89 = $AsyncCtx9 + 16 | 0; //@line 3348
  HEAP32[$89 >> 2] = $4; //@line 3350
  HEAP32[$89 + 4 >> 2] = $5; //@line 3353
  HEAP32[$AsyncCtx9 + 24 >> 2] = $0; //@line 3355
  HEAP32[$AsyncCtx9 + 28 >> 2] = $1; //@line 3357
  sp = STACKTOP; //@line 3358
  return 0; //@line 3359
 }
 _emscripten_free_async_context($AsyncCtx9 | 0); //@line 3361
 $95 = $0 + 4 | 0; //@line 3362
 $96 = HEAP32[$95 >> 2] | 0; //@line 3363
 $97 = _emscripten_asm_const_iiiii(8, $96 | 0, $1 | 0, $2 | 0, $4 | 0) | 0; //@line 3364
 return 0; //@line 3365
}
function __ZN20SimulatorBlockDevice5eraseEyy($0, $1, $2, $3, $4) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 var $11 = 0, $18 = 0, $23 = 0, $30 = 0, $31 = 0, $32 = 0, $34 = 0, $39 = 0, $46 = 0, $51 = 0, $52 = 0, $55 = 0, $56 = 0, $57 = 0, $59 = 0, $64 = 0, $69 = 0, $7 = 0, $8 = 0, $80 = 0, $85 = 0, $9 = 0, $90 = 0, $91 = 0, $92 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, $AsyncCtx6 = 0, $AsyncCtx9 = 0, sp = 0;
 sp = STACKTOP; //@line 3559
 $7 = HEAP32[(HEAP32[$0 >> 2] | 0) + 44 >> 2] | 0; //@line 3562
 $AsyncCtx = _emscripten_alloc_async_context(40, sp) | 0; //@line 3563
 $8 = FUNCTION_TABLE_ii[$7 & 15]($0) | 0; //@line 3564
 $9 = tempRet0; //@line 3565
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 84; //@line 3568
  $11 = $AsyncCtx + 8 | 0; //@line 3570
  HEAP32[$11 >> 2] = $1; //@line 3572
  HEAP32[$11 + 4 >> 2] = $2; //@line 3575
  HEAP32[$AsyncCtx + 16 >> 2] = $0; //@line 3577
  HEAP32[$AsyncCtx + 20 >> 2] = $0; //@line 3579
  $18 = $AsyncCtx + 24 | 0; //@line 3581
  HEAP32[$18 >> 2] = $3; //@line 3583
  HEAP32[$18 + 4 >> 2] = $4; //@line 3586
  HEAP32[$AsyncCtx + 32 >> 2] = $0; //@line 3588
  sp = STACKTOP; //@line 3589
  return 0; //@line 3590
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 3592
 $23 = ___uremdi3($1 | 0, $2 | 0, $8 | 0, $9 | 0) | 0; //@line 3593
 if (($23 | 0) == 0 & (tempRet0 | 0) == 0) {
  $30 = HEAP32[(HEAP32[$0 >> 2] | 0) + 44 >> 2] | 0; //@line 3601
  $AsyncCtx3 = _emscripten_alloc_async_context(40, sp) | 0; //@line 3602
  $31 = FUNCTION_TABLE_ii[$30 & 15]($0) | 0; //@line 3603
  $32 = tempRet0; //@line 3604
  if (___async) {
   HEAP32[$AsyncCtx3 >> 2] = 85; //@line 3607
   $34 = $AsyncCtx3 + 8 | 0; //@line 3609
   HEAP32[$34 >> 2] = $3; //@line 3611
   HEAP32[$34 + 4 >> 2] = $4; //@line 3614
   $39 = $AsyncCtx3 + 16 | 0; //@line 3616
   HEAP32[$39 >> 2] = $1; //@line 3618
   HEAP32[$39 + 4 >> 2] = $2; //@line 3621
   HEAP32[$AsyncCtx3 + 24 >> 2] = $0; //@line 3623
   HEAP32[$AsyncCtx3 + 28 >> 2] = $0; //@line 3625
   HEAP32[$AsyncCtx3 + 32 >> 2] = $0; //@line 3627
   sp = STACKTOP; //@line 3628
   return 0; //@line 3629
  }
  _emscripten_free_async_context($AsyncCtx3 | 0); //@line 3631
  $46 = ___uremdi3($3 | 0, $4 | 0, $31 | 0, $32 | 0) | 0; //@line 3632
  if (($46 | 0) == 0 & (tempRet0 | 0) == 0) {
   $51 = _i64Add($3 | 0, $4 | 0, $1 | 0, $2 | 0) | 0; //@line 3638
   $52 = tempRet0; //@line 3639
   $55 = HEAP32[(HEAP32[$0 >> 2] | 0) + 56 >> 2] | 0; //@line 3642
   $AsyncCtx6 = _emscripten_alloc_async_context(40, sp) | 0; //@line 3643
   $56 = FUNCTION_TABLE_ii[$55 & 15]($0) | 0; //@line 3644
   $57 = tempRet0; //@line 3645
   if (___async) {
    HEAP32[$AsyncCtx6 >> 2] = 86; //@line 3648
    $59 = $AsyncCtx6 + 8 | 0; //@line 3650
    HEAP32[$59 >> 2] = $51; //@line 3652
    HEAP32[$59 + 4 >> 2] = $52; //@line 3655
    $64 = $AsyncCtx6 + 16 | 0; //@line 3657
    HEAP32[$64 >> 2] = $1; //@line 3659
    HEAP32[$64 + 4 >> 2] = $2; //@line 3662
    $69 = $AsyncCtx6 + 24 | 0; //@line 3664
    HEAP32[$69 >> 2] = $3; //@line 3666
    HEAP32[$69 + 4 >> 2] = $4; //@line 3669
    HEAP32[$AsyncCtx6 + 32 >> 2] = $0; //@line 3671
    sp = STACKTOP; //@line 3672
    return 0; //@line 3673
   }
   _emscripten_free_async_context($AsyncCtx6 | 0); //@line 3675
   if (!($52 >>> 0 > $57 >>> 0 | ($52 | 0) == ($57 | 0) & $51 >>> 0 > $56 >>> 0)) {
    $90 = $0 + 4 | 0; //@line 3682
    $91 = HEAP32[$90 >> 2] | 0; //@line 3683
    $92 = _emscripten_asm_const_iiii(10, $91 | 0, $1 | 0, $3 | 0) | 0; //@line 3684
    return 0; //@line 3685
   }
  }
 }
 $AsyncCtx9 = _emscripten_alloc_async_context(32, sp) | 0; //@line 3689
 _mbed_assert_internal(1851, 1878, 113); //@line 3690
 if (___async) {
  HEAP32[$AsyncCtx9 >> 2] = 87; //@line 3693
  $80 = $AsyncCtx9 + 8 | 0; //@line 3695
  HEAP32[$80 >> 2] = $1; //@line 3697
  HEAP32[$80 + 4 >> 2] = $2; //@line 3700
  $85 = $AsyncCtx9 + 16 | 0; //@line 3702
  HEAP32[$85 >> 2] = $3; //@line 3704
  HEAP32[$85 + 4 >> 2] = $4; //@line 3707
  HEAP32[$AsyncCtx9 + 24 >> 2] = $0; //@line 3709
  sp = STACKTOP; //@line 3710
  return 0; //@line 3711
 }
 _emscripten_free_async_context($AsyncCtx9 | 0); //@line 3713
 $90 = $0 + 4 | 0; //@line 3714
 $91 = HEAP32[$90 >> 2] | 0; //@line 3715
 $92 = _emscripten_asm_const_iiii(10, $91 | 0, $1 | 0, $3 | 0) | 0; //@line 3716
 return 0; //@line 3717
}
function __ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_33($0) {
 $0 = $0 | 0;
 var $$085$off0$reg2mem$0 = 0, $$182$off0 = 0, $$186$off0 = 0, $$283$off0 = 0, $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $2 = 0, $20 = 0, $22 = 0, $24 = 0, $26 = 0, $28 = 0, $30 = 0, $4 = 0, $59 = 0, $6 = 0, $67 = 0, $8 = 0, $ReallocAsyncCtx5 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 5832
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 5834
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 5836
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 5838
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 5840
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 5842
 $12 = HEAP8[$0 + 24 >> 0] & 1; //@line 5845
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 5847
 $16 = HEAP8[$0 + 32 >> 0] & 1; //@line 5850
 $18 = HEAP8[$0 + 33 >> 0] & 1; //@line 5853
 $20 = HEAP32[$0 + 36 >> 2] | 0; //@line 5855
 $22 = HEAP32[$0 + 40 >> 2] | 0; //@line 5857
 $24 = HEAP32[$0 + 44 >> 2] | 0; //@line 5859
 $26 = HEAP32[$0 + 48 >> 2] | 0; //@line 5861
 $28 = HEAP32[$0 + 52 >> 2] | 0; //@line 5863
 L2 : do {
  if (!(HEAP8[$24 >> 0] | 0)) {
   do {
    if (!(HEAP8[$2 >> 0] | 0)) {
     $$182$off0 = $18; //@line 5872
     $$186$off0 = $16; //@line 5872
    } else {
     if (!(HEAP8[$4 >> 0] | 0)) {
      if (!(HEAP32[$14 >> 2] & 1)) {
       $$085$off0$reg2mem$0 = $16; //@line 5881
       $$283$off0 = 1; //@line 5881
       label = 13; //@line 5882
       break L2;
      } else {
       $$182$off0 = 1; //@line 5885
       $$186$off0 = $16; //@line 5885
       break;
      }
     }
     if ((HEAP32[$22 >> 2] | 0) == 1) {
      label = 18; //@line 5892
      break L2;
     }
     if (!(HEAP32[$14 >> 2] & 2)) {
      label = 18; //@line 5899
      break L2;
     } else {
      $$182$off0 = 1; //@line 5902
      $$186$off0 = 1; //@line 5902
     }
    }
   } while (0);
   $30 = $20 + 8 | 0; //@line 5906
   if ($30 >>> 0 < $6 >>> 0) {
    HEAP8[$4 >> 0] = 0; //@line 5909
    HEAP8[$2 >> 0] = 0; //@line 5910
    $ReallocAsyncCtx5 = _emscripten_realloc_async_context(56) | 0; //@line 5911
    __ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($30, $8, $10, $10, 1, $12); //@line 5912
    if (!___async) {
     ___async_unwind = 0; //@line 5915
    }
    HEAP32[$ReallocAsyncCtx5 >> 2] = 144; //@line 5917
    HEAP32[$ReallocAsyncCtx5 + 4 >> 2] = $2; //@line 5919
    HEAP32[$ReallocAsyncCtx5 + 8 >> 2] = $4; //@line 5921
    HEAP32[$ReallocAsyncCtx5 + 12 >> 2] = $6; //@line 5923
    HEAP32[$ReallocAsyncCtx5 + 16 >> 2] = $8; //@line 5925
    HEAP32[$ReallocAsyncCtx5 + 20 >> 2] = $10; //@line 5927
    HEAP8[$ReallocAsyncCtx5 + 24 >> 0] = $12 & 1; //@line 5930
    HEAP32[$ReallocAsyncCtx5 + 28 >> 2] = $14; //@line 5932
    HEAP8[$ReallocAsyncCtx5 + 32 >> 0] = $$186$off0 & 1; //@line 5935
    HEAP8[$ReallocAsyncCtx5 + 33 >> 0] = $$182$off0 & 1; //@line 5938
    HEAP32[$ReallocAsyncCtx5 + 36 >> 2] = $30; //@line 5940
    HEAP32[$ReallocAsyncCtx5 + 40 >> 2] = $22; //@line 5942
    HEAP32[$ReallocAsyncCtx5 + 44 >> 2] = $24; //@line 5944
    HEAP32[$ReallocAsyncCtx5 + 48 >> 2] = $26; //@line 5946
    HEAP32[$ReallocAsyncCtx5 + 52 >> 2] = $28; //@line 5948
    sp = STACKTOP; //@line 5949
    return;
   } else {
    $$085$off0$reg2mem$0 = $$186$off0; //@line 5952
    $$283$off0 = $$182$off0; //@line 5952
    label = 13; //@line 5953
   }
  } else {
   $$085$off0$reg2mem$0 = $16; //@line 5956
   $$283$off0 = $18; //@line 5956
   label = 13; //@line 5957
  }
 } while (0);
 do {
  if ((label | 0) == 13) {
   if (!$$085$off0$reg2mem$0) {
    HEAP32[$26 >> 2] = $10; //@line 5963
    $59 = $8 + 40 | 0; //@line 5964
    HEAP32[$59 >> 2] = (HEAP32[$59 >> 2] | 0) + 1; //@line 5967
    if ((HEAP32[$8 + 36 >> 2] | 0) == 1) {
     if ((HEAP32[$22 >> 2] | 0) == 2) {
      HEAP8[$24 >> 0] = 1; //@line 5975
      if ($$283$off0) {
       label = 18; //@line 5977
       break;
      } else {
       $67 = 4; //@line 5980
       break;
      }
     }
    }
   }
   if ($$283$off0) {
    label = 18; //@line 5987
   } else {
    $67 = 4; //@line 5989
   }
  }
 } while (0);
 if ((label | 0) == 18) {
  $67 = 3; //@line 5994
 }
 HEAP32[$28 >> 2] = $67; //@line 5996
 return;
}
function __ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_32($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $15 = 0, $18 = 0, $2 = 0, $21 = 0, $24 = 0, $36 = 0, $37 = 0, $38 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx = 0, $ReallocAsyncCtx2 = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 5676
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 5678
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 5680
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 5682
 $8 = HEAP8[$0 + 16 >> 0] & 1; //@line 5685
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 5687
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 5689
 $15 = $12 + 24 | 0; //@line 5692
 do {
  if ((HEAP32[$0 + 28 >> 2] | 0) > 1) {
   $18 = HEAP32[$12 + 8 >> 2] | 0; //@line 5697
   if (!($18 & 2)) {
    $21 = $2 + 36 | 0; //@line 5701
    if ((HEAP32[$21 >> 2] | 0) != 1) {
     if (!($18 & 1)) {
      $38 = $2 + 54 | 0; //@line 5708
      if (HEAP8[$38 >> 0] | 0) {
       break;
      }
      if ((HEAP32[$21 >> 2] | 0) == 1) {
       break;
      }
      $ReallocAsyncCtx = _emscripten_realloc_async_context(36) | 0; //@line 5719
      __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($15, $2, $4, $6, $8); //@line 5720
      if (!___async) {
       ___async_unwind = 0; //@line 5723
      }
      HEAP32[$ReallocAsyncCtx >> 2] = 148; //@line 5725
      HEAP32[$ReallocAsyncCtx + 4 >> 2] = $15; //@line 5727
      HEAP32[$ReallocAsyncCtx + 8 >> 2] = $10; //@line 5729
      HEAP32[$ReallocAsyncCtx + 12 >> 2] = $38; //@line 5731
      HEAP32[$ReallocAsyncCtx + 16 >> 2] = $21; //@line 5733
      HEAP32[$ReallocAsyncCtx + 20 >> 2] = $2; //@line 5735
      HEAP32[$ReallocAsyncCtx + 24 >> 2] = $4; //@line 5737
      HEAP32[$ReallocAsyncCtx + 28 >> 2] = $6; //@line 5739
      HEAP8[$ReallocAsyncCtx + 32 >> 0] = $8 & 1; //@line 5742
      sp = STACKTOP; //@line 5743
      return;
     }
     $36 = $2 + 24 | 0; //@line 5746
     $37 = $2 + 54 | 0; //@line 5747
     if (HEAP8[$37 >> 0] | 0) {
      break;
     }
     if ((HEAP32[$21 >> 2] | 0) == 1) {
      if ((HEAP32[$36 >> 2] | 0) == 1) {
       break;
      }
     }
     $ReallocAsyncCtx2 = _emscripten_realloc_async_context(40) | 0; //@line 5762
     __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($15, $2, $4, $6, $8); //@line 5763
     if (!___async) {
      ___async_unwind = 0; //@line 5766
     }
     HEAP32[$ReallocAsyncCtx2 >> 2] = 147; //@line 5768
     HEAP32[$ReallocAsyncCtx2 + 4 >> 2] = $15; //@line 5770
     HEAP32[$ReallocAsyncCtx2 + 8 >> 2] = $10; //@line 5772
     HEAP32[$ReallocAsyncCtx2 + 12 >> 2] = $37; //@line 5774
     HEAP32[$ReallocAsyncCtx2 + 16 >> 2] = $21; //@line 5776
     HEAP32[$ReallocAsyncCtx2 + 20 >> 2] = $36; //@line 5778
     HEAP32[$ReallocAsyncCtx2 + 24 >> 2] = $2; //@line 5780
     HEAP32[$ReallocAsyncCtx2 + 28 >> 2] = $4; //@line 5782
     HEAP32[$ReallocAsyncCtx2 + 32 >> 2] = $6; //@line 5784
     HEAP8[$ReallocAsyncCtx2 + 36 >> 0] = $8 & 1; //@line 5787
     sp = STACKTOP; //@line 5788
     return;
    }
   }
   $24 = $2 + 54 | 0; //@line 5792
   if (!(HEAP8[$24 >> 0] | 0)) {
    $ReallocAsyncCtx3 = _emscripten_realloc_async_context(32) | 0; //@line 5796
    __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($15, $2, $4, $6, $8); //@line 5797
    if (!___async) {
     ___async_unwind = 0; //@line 5800
    }
    HEAP32[$ReallocAsyncCtx3 >> 2] = 146; //@line 5802
    HEAP32[$ReallocAsyncCtx3 + 4 >> 2] = $15; //@line 5804
    HEAP32[$ReallocAsyncCtx3 + 8 >> 2] = $10; //@line 5806
    HEAP32[$ReallocAsyncCtx3 + 12 >> 2] = $24; //@line 5808
    HEAP32[$ReallocAsyncCtx3 + 16 >> 2] = $2; //@line 5810
    HEAP32[$ReallocAsyncCtx3 + 20 >> 2] = $4; //@line 5812
    HEAP32[$ReallocAsyncCtx3 + 24 >> 2] = $6; //@line 5814
    HEAP8[$ReallocAsyncCtx3 + 28 >> 0] = $8 & 1; //@line 5817
    sp = STACKTOP; //@line 5818
    return;
   }
  }
 } while (0);
 return;
}
function _pop_arg_673($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $10 = 0, $108 = 0, $109 = 0.0, $115 = 0, $116 = 0.0, $16 = 0, $17 = 0, $20 = 0, $29 = 0, $30 = 0, $31 = 0, $40 = 0, $41 = 0, $43 = 0, $46 = 0, $47 = 0, $56 = 0, $57 = 0, $59 = 0, $62 = 0, $71 = 0, $72 = 0, $73 = 0, $82 = 0, $83 = 0, $85 = 0, $88 = 0, $9 = 0, $97 = 0, $98 = 0, $99 = 0;
 L1 : do {
  if ($1 >>> 0 <= 20) {
   do {
    switch ($1 | 0) {
    case 9:
     {
      $9 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 9894
      $10 = HEAP32[$9 >> 2] | 0; //@line 9895
      HEAP32[$2 >> 2] = $9 + 4; //@line 9897
      HEAP32[$0 >> 2] = $10; //@line 9898
      break L1;
      break;
     }
    case 10:
     {
      $16 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 9914
      $17 = HEAP32[$16 >> 2] | 0; //@line 9915
      HEAP32[$2 >> 2] = $16 + 4; //@line 9917
      $20 = $0; //@line 9920
      HEAP32[$20 >> 2] = $17; //@line 9922
      HEAP32[$20 + 4 >> 2] = (($17 | 0) < 0) << 31 >> 31; //@line 9925
      break L1;
      break;
     }
    case 11:
     {
      $29 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 9941
      $30 = HEAP32[$29 >> 2] | 0; //@line 9942
      HEAP32[$2 >> 2] = $29 + 4; //@line 9944
      $31 = $0; //@line 9945
      HEAP32[$31 >> 2] = $30; //@line 9947
      HEAP32[$31 + 4 >> 2] = 0; //@line 9950
      break L1;
      break;
     }
    case 12:
     {
      $40 = (HEAP32[$2 >> 2] | 0) + (8 - 1) & ~(8 - 1); //@line 9966
      $41 = $40; //@line 9967
      $43 = HEAP32[$41 >> 2] | 0; //@line 9969
      $46 = HEAP32[$41 + 4 >> 2] | 0; //@line 9972
      HEAP32[$2 >> 2] = $40 + 8; //@line 9974
      $47 = $0; //@line 9975
      HEAP32[$47 >> 2] = $43; //@line 9977
      HEAP32[$47 + 4 >> 2] = $46; //@line 9980
      break L1;
      break;
     }
    case 13:
     {
      $56 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 9996
      $57 = HEAP32[$56 >> 2] | 0; //@line 9997
      HEAP32[$2 >> 2] = $56 + 4; //@line 9999
      $59 = ($57 & 65535) << 16 >> 16; //@line 10001
      $62 = $0; //@line 10004
      HEAP32[$62 >> 2] = $59; //@line 10006
      HEAP32[$62 + 4 >> 2] = (($59 | 0) < 0) << 31 >> 31; //@line 10009
      break L1;
      break;
     }
    case 14:
     {
      $71 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 10025
      $72 = HEAP32[$71 >> 2] | 0; //@line 10026
      HEAP32[$2 >> 2] = $71 + 4; //@line 10028
      $73 = $0; //@line 10030
      HEAP32[$73 >> 2] = $72 & 65535; //@line 10032
      HEAP32[$73 + 4 >> 2] = 0; //@line 10035
      break L1;
      break;
     }
    case 15:
     {
      $82 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 10051
      $83 = HEAP32[$82 >> 2] | 0; //@line 10052
      HEAP32[$2 >> 2] = $82 + 4; //@line 10054
      $85 = ($83 & 255) << 24 >> 24; //@line 10056
      $88 = $0; //@line 10059
      HEAP32[$88 >> 2] = $85; //@line 10061
      HEAP32[$88 + 4 >> 2] = (($85 | 0) < 0) << 31 >> 31; //@line 10064
      break L1;
      break;
     }
    case 16:
     {
      $97 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 10080
      $98 = HEAP32[$97 >> 2] | 0; //@line 10081
      HEAP32[$2 >> 2] = $97 + 4; //@line 10083
      $99 = $0; //@line 10085
      HEAP32[$99 >> 2] = $98 & 255; //@line 10087
      HEAP32[$99 + 4 >> 2] = 0; //@line 10090
      break L1;
      break;
     }
    case 17:
     {
      $108 = (HEAP32[$2 >> 2] | 0) + (8 - 1) & ~(8 - 1); //@line 10106
      $109 = +HEAPF64[$108 >> 3]; //@line 10107
      HEAP32[$2 >> 2] = $108 + 8; //@line 10109
      HEAPF64[$0 >> 3] = $109; //@line 10110
      break L1;
      break;
     }
    case 18:
     {
      $115 = (HEAP32[$2 >> 2] | 0) + (8 - 1) & ~(8 - 1); //@line 10126
      $116 = +HEAPF64[$115 >> 3]; //@line 10127
      HEAP32[$2 >> 2] = $115 + 8; //@line 10129
      HEAPF64[$0 >> 3] = $116; //@line 10130
      break L1;
      break;
     }
    default:
     {
      break L1;
     }
    }
   } while (0);
  }
 } while (0);
 return;
}
function __ZNK10__cxxabiv121__vmi_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($0, $1, $2, $3, $4, $5) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 $5 = $5 | 0;
 var $$0 = 0, $10 = 0, $11 = 0, $12 = 0, $15 = 0, $16 = 0, $31 = 0, $32 = 0, $33 = 0, $62 = 0, $9 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 86
 if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, $5) | 0) {
  __ZNK10__cxxabiv117__class_type_info29process_static_type_above_dstEPNS_19__dynamic_cast_infoEPKvS4_i(0, $1, $2, $3, $4); //@line 91
 } else {
  $9 = $1 + 52 | 0; //@line 93
  $10 = HEAP8[$9 >> 0] | 0; //@line 94
  $11 = $1 + 53 | 0; //@line 95
  $12 = HEAP8[$11 >> 0] | 0; //@line 96
  $15 = HEAP32[$0 + 12 >> 2] | 0; //@line 99
  $16 = $0 + 16 + ($15 << 3) | 0; //@line 100
  HEAP8[$9 >> 0] = 0; //@line 101
  HEAP8[$11 >> 0] = 0; //@line 102
  $AsyncCtx3 = _emscripten_alloc_async_context(52, sp) | 0; //@line 103
  __ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($0 + 16 | 0, $1, $2, $3, $4, $5); //@line 104
  if (___async) {
   HEAP32[$AsyncCtx3 >> 2] = 142; //@line 107
   HEAP32[$AsyncCtx3 + 4 >> 2] = $15; //@line 109
   HEAP32[$AsyncCtx3 + 8 >> 2] = $0; //@line 111
   HEAP32[$AsyncCtx3 + 12 >> 2] = $1; //@line 113
   HEAP8[$AsyncCtx3 + 16 >> 0] = $10; //@line 115
   HEAP32[$AsyncCtx3 + 20 >> 2] = $9; //@line 117
   HEAP8[$AsyncCtx3 + 24 >> 0] = $12; //@line 119
   HEAP32[$AsyncCtx3 + 28 >> 2] = $11; //@line 121
   HEAP32[$AsyncCtx3 + 32 >> 2] = $2; //@line 123
   HEAP32[$AsyncCtx3 + 36 >> 2] = $3; //@line 125
   HEAP32[$AsyncCtx3 + 40 >> 2] = $4; //@line 127
   HEAP8[$AsyncCtx3 + 44 >> 0] = $5 & 1; //@line 130
   HEAP32[$AsyncCtx3 + 48 >> 2] = $16; //@line 132
   sp = STACKTOP; //@line 133
   return;
  }
  _emscripten_free_async_context($AsyncCtx3 | 0); //@line 136
  L7 : do {
   if (($15 | 0) > 1) {
    $31 = $1 + 24 | 0; //@line 141
    $32 = $0 + 8 | 0; //@line 142
    $33 = $1 + 54 | 0; //@line 143
    $$0 = $0 + 24 | 0; //@line 144
    while (1) {
     if (HEAP8[$33 >> 0] | 0) {
      break L7;
     }
     if (!(HEAP8[$9 >> 0] | 0)) {
      if (HEAP8[$11 >> 0] | 0) {
       if (!(HEAP32[$32 >> 2] & 1)) {
        break L7;
       }
      }
     } else {
      if ((HEAP32[$31 >> 2] | 0) == 1) {
       break L7;
      }
      if (!(HEAP32[$32 >> 2] & 2)) {
       break L7;
      }
     }
     HEAP8[$9 >> 0] = 0; //@line 177
     HEAP8[$11 >> 0] = 0; //@line 178
     $AsyncCtx = _emscripten_alloc_async_context(60, sp) | 0; //@line 179
     __ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($$0, $1, $2, $3, $4, $5); //@line 180
     if (___async) {
      break;
     }
     _emscripten_free_async_context($AsyncCtx | 0); //@line 185
     $62 = $$0 + 8 | 0; //@line 186
     if ($62 >>> 0 < $16 >>> 0) {
      $$0 = $62; //@line 189
     } else {
      break L7;
     }
    }
    HEAP32[$AsyncCtx >> 2] = 143; //@line 194
    HEAP32[$AsyncCtx + 4 >> 2] = $$0; //@line 196
    HEAP32[$AsyncCtx + 8 >> 2] = $16; //@line 198
    HEAP32[$AsyncCtx + 12 >> 2] = $33; //@line 200
    HEAP8[$AsyncCtx + 16 >> 0] = $10; //@line 202
    HEAP32[$AsyncCtx + 20 >> 2] = $9; //@line 204
    HEAP8[$AsyncCtx + 24 >> 0] = $12; //@line 206
    HEAP32[$AsyncCtx + 28 >> 2] = $11; //@line 208
    HEAP32[$AsyncCtx + 32 >> 2] = $31; //@line 210
    HEAP32[$AsyncCtx + 36 >> 2] = $32; //@line 212
    HEAP32[$AsyncCtx + 40 >> 2] = $1; //@line 214
    HEAP32[$AsyncCtx + 44 >> 2] = $2; //@line 216
    HEAP32[$AsyncCtx + 48 >> 2] = $3; //@line 218
    HEAP32[$AsyncCtx + 52 >> 2] = $4; //@line 220
    HEAP8[$AsyncCtx + 56 >> 0] = $5 & 1; //@line 223
    sp = STACKTOP; //@line 224
    return;
   }
  } while (0);
  HEAP8[$9 >> 0] = $10; //@line 228
  HEAP8[$11 >> 0] = $12; //@line 229
 }
 return;
}
function _vfprintf($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$ = 0, $$0 = 0, $$1 = 0, $13 = 0, $14 = 0, $19 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $28 = 0, $29 = 0, $3 = 0, $32 = 0, $4 = 0, $43 = 0, $5 = 0, $51 = 0, $6 = 0, $AsyncCtx = 0, dest = 0, sp = 0, stop = 0;
 sp = STACKTOP; //@line 8794
 STACKTOP = STACKTOP + 224 | 0; //@line 8795
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(224); //@line 8795
 $3 = sp + 120 | 0; //@line 8796
 $4 = sp + 80 | 0; //@line 8797
 $5 = sp; //@line 8798
 $6 = sp + 136 | 0; //@line 8799
 dest = $4; //@line 8800
 stop = dest + 40 | 0; //@line 8800
 do {
  HEAP32[dest >> 2] = 0; //@line 8800
  dest = dest + 4 | 0; //@line 8800
 } while ((dest | 0) < (stop | 0));
 HEAP32[$3 >> 2] = HEAP32[$2 >> 2]; //@line 8802
 if ((_printf_core(0, $1, $3, $5, $4) | 0) < 0) {
  $$0 = -1; //@line 8806
 } else {
  if ((HEAP32[$0 + 76 >> 2] | 0) > -1) {
   $43 = ___lockfile($0) | 0; //@line 8813
  } else {
   $43 = 0; //@line 8815
  }
  $13 = HEAP32[$0 >> 2] | 0; //@line 8817
  $14 = $13 & 32; //@line 8818
  if ((HEAP8[$0 + 74 >> 0] | 0) < 1) {
   HEAP32[$0 >> 2] = $13 & -33; //@line 8824
  }
  $19 = $0 + 48 | 0; //@line 8826
  do {
   if (!(HEAP32[$19 >> 2] | 0)) {
    $23 = $0 + 44 | 0; //@line 8831
    $24 = HEAP32[$23 >> 2] | 0; //@line 8832
    HEAP32[$23 >> 2] = $6; //@line 8833
    $25 = $0 + 28 | 0; //@line 8834
    HEAP32[$25 >> 2] = $6; //@line 8835
    $26 = $0 + 20 | 0; //@line 8836
    HEAP32[$26 >> 2] = $6; //@line 8837
    HEAP32[$19 >> 2] = 80; //@line 8838
    $28 = $0 + 16 | 0; //@line 8840
    HEAP32[$28 >> 2] = $6 + 80; //@line 8841
    $29 = _printf_core($0, $1, $3, $5, $4) | 0; //@line 8842
    if (!$24) {
     $$1 = $29; //@line 8845
    } else {
     $32 = HEAP32[$0 + 36 >> 2] | 0; //@line 8848
     $AsyncCtx = _emscripten_alloc_async_context(64, sp) | 0; //@line 8849
     FUNCTION_TABLE_iiii[$32 & 7]($0, 0, 0) | 0; //@line 8850
     if (___async) {
      HEAP32[$AsyncCtx >> 2] = 121; //@line 8853
      HEAP32[$AsyncCtx + 4 >> 2] = $26; //@line 8855
      HEAP32[$AsyncCtx + 8 >> 2] = $29; //@line 8857
      HEAP32[$AsyncCtx + 12 >> 2] = $24; //@line 8859
      HEAP32[$AsyncCtx + 16 >> 2] = $23; //@line 8861
      HEAP32[$AsyncCtx + 20 >> 2] = $19; //@line 8863
      HEAP32[$AsyncCtx + 24 >> 2] = $28; //@line 8865
      HEAP32[$AsyncCtx + 28 >> 2] = $25; //@line 8867
      HEAP32[$AsyncCtx + 32 >> 2] = $0; //@line 8869
      HEAP32[$AsyncCtx + 36 >> 2] = $14; //@line 8871
      HEAP32[$AsyncCtx + 40 >> 2] = $43; //@line 8873
      HEAP32[$AsyncCtx + 44 >> 2] = $0; //@line 8875
      HEAP32[$AsyncCtx + 48 >> 2] = $6; //@line 8877
      HEAP32[$AsyncCtx + 52 >> 2] = $5; //@line 8879
      HEAP32[$AsyncCtx + 56 >> 2] = $4; //@line 8881
      HEAP32[$AsyncCtx + 60 >> 2] = $3; //@line 8883
      sp = STACKTOP; //@line 8884
      STACKTOP = sp; //@line 8885
      return 0; //@line 8885
     } else {
      _emscripten_free_async_context($AsyncCtx | 0); //@line 8887
      $$ = (HEAP32[$26 >> 2] | 0) == 0 ? -1 : $29; //@line 8890
      HEAP32[$23 >> 2] = $24; //@line 8891
      HEAP32[$19 >> 2] = 0; //@line 8892
      HEAP32[$28 >> 2] = 0; //@line 8893
      HEAP32[$25 >> 2] = 0; //@line 8894
      HEAP32[$26 >> 2] = 0; //@line 8895
      $$1 = $$; //@line 8896
      break;
     }
    }
   } else {
    $$1 = _printf_core($0, $1, $3, $5, $4) | 0; //@line 8902
   }
  } while (0);
  $51 = HEAP32[$0 >> 2] | 0; //@line 8905
  HEAP32[$0 >> 2] = $51 | $14; //@line 8910
  if ($43 | 0) {
   ___unlockfile($0); //@line 8913
  }
  $$0 = ($51 & 32 | 0) == 0 ? $$1 : -1; //@line 8915
 }
 STACKTOP = sp; //@line 8917
 return $$0 | 0; //@line 8917
}
function ___dynamic_cast($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $$0 = 0, $10 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $24 = 0, $30 = 0, $33 = 0, $4 = 0, $5 = 0, $8 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, dest = 0, sp = 0, stop = 0;
 sp = STACKTOP; //@line 12994
 STACKTOP = STACKTOP + 64 | 0; //@line 12995
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(64); //@line 12995
 $4 = sp; //@line 12996
 $5 = HEAP32[$0 >> 2] | 0; //@line 12997
 $8 = $0 + (HEAP32[$5 + -8 >> 2] | 0) | 0; //@line 13000
 $10 = HEAP32[$5 + -4 >> 2] | 0; //@line 13002
 HEAP32[$4 >> 2] = $2; //@line 13003
 HEAP32[$4 + 4 >> 2] = $0; //@line 13005
 HEAP32[$4 + 8 >> 2] = $1; //@line 13007
 HEAP32[$4 + 12 >> 2] = $3; //@line 13009
 $14 = $4 + 16 | 0; //@line 13010
 $15 = $4 + 20 | 0; //@line 13011
 $16 = $4 + 24 | 0; //@line 13012
 $17 = $4 + 28 | 0; //@line 13013
 $18 = $4 + 32 | 0; //@line 13014
 $19 = $4 + 40 | 0; //@line 13015
 dest = $14; //@line 13016
 stop = dest + 36 | 0; //@line 13016
 do {
  HEAP32[dest >> 2] = 0; //@line 13016
  dest = dest + 4 | 0; //@line 13016
 } while ((dest | 0) < (stop | 0));
 HEAP16[$14 + 36 >> 1] = 0; //@line 13016
 HEAP8[$14 + 38 >> 0] = 0; //@line 13016
 L1 : do {
  if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($10, $2, 0) | 0) {
   HEAP32[$4 + 48 >> 2] = 1; //@line 13021
   $24 = HEAP32[(HEAP32[$10 >> 2] | 0) + 20 >> 2] | 0; //@line 13024
   $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 13025
   FUNCTION_TABLE_viiiiii[$24 & 3]($10, $4, $8, $8, 1, 0); //@line 13026
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 134; //@line 13029
    HEAP32[$AsyncCtx + 4 >> 2] = $16; //@line 13031
    HEAP32[$AsyncCtx + 8 >> 2] = $8; //@line 13033
    HEAP32[$AsyncCtx + 12 >> 2] = $4; //@line 13035
    sp = STACKTOP; //@line 13036
    STACKTOP = sp; //@line 13037
    return 0; //@line 13037
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 13039
    $$0 = (HEAP32[$16 >> 2] | 0) == 1 ? $8 : 0; //@line 13043
    break;
   }
  } else {
   $30 = $4 + 36 | 0; //@line 13047
   $33 = HEAP32[(HEAP32[$10 >> 2] | 0) + 24 >> 2] | 0; //@line 13050
   $AsyncCtx3 = _emscripten_alloc_async_context(36, sp) | 0; //@line 13051
   FUNCTION_TABLE_viiiii[$33 & 3]($10, $4, $8, 1, 0); //@line 13052
   if (___async) {
    HEAP32[$AsyncCtx3 >> 2] = 135; //@line 13055
    HEAP32[$AsyncCtx3 + 4 >> 2] = $30; //@line 13057
    HEAP32[$AsyncCtx3 + 8 >> 2] = $4; //@line 13059
    HEAP32[$AsyncCtx3 + 12 >> 2] = $19; //@line 13061
    HEAP32[$AsyncCtx3 + 16 >> 2] = $17; //@line 13063
    HEAP32[$AsyncCtx3 + 20 >> 2] = $18; //@line 13065
    HEAP32[$AsyncCtx3 + 24 >> 2] = $15; //@line 13067
    HEAP32[$AsyncCtx3 + 28 >> 2] = $16; //@line 13069
    HEAP32[$AsyncCtx3 + 32 >> 2] = $14; //@line 13071
    sp = STACKTOP; //@line 13072
    STACKTOP = sp; //@line 13073
    return 0; //@line 13073
   }
   _emscripten_free_async_context($AsyncCtx3 | 0); //@line 13075
   switch (HEAP32[$30 >> 2] | 0) {
   case 0:
    {
     $$0 = (HEAP32[$19 >> 2] | 0) == 1 & (HEAP32[$17 >> 2] | 0) == 1 & (HEAP32[$18 >> 2] | 0) == 1 ? HEAP32[$15 >> 2] | 0 : 0; //@line 13089
     break L1;
     break;
    }
   case 1:
    {
     break;
    }
   default:
    {
     $$0 = 0; //@line 13097
     break L1;
    }
   }
   if ((HEAP32[$16 >> 2] | 0) != 1) {
    if (!((HEAP32[$19 >> 2] | 0) == 0 & (HEAP32[$17 >> 2] | 0) == 1 & (HEAP32[$18 >> 2] | 0) == 1)) {
     $$0 = 0; //@line 13113
     break;
    }
   }
   $$0 = HEAP32[$14 >> 2] | 0; //@line 13118
  }
 } while (0);
 STACKTOP = sp; //@line 13121
 return $$0 | 0; //@line 13121
}
function _memchr($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$0$lcssa = 0, $$035$lcssa = 0, $$035$lcssa65 = 0, $$03555 = 0, $$036$lcssa = 0, $$036$lcssa64 = 0, $$03654 = 0, $$046 = 0, $$137$lcssa = 0, $$13745 = 0, $$140 = 0, $$2 = 0, $$23839 = 0, $$3 = 0, $$lcssa = 0, $11 = 0, $12 = 0, $16 = 0, $18 = 0, $20 = 0, $23 = 0, $29 = 0, $3 = 0, $30 = 0, $35 = 0, $7 = 0, $8 = 0, label = 0;
 $3 = $1 & 255; //@line 8666
 $7 = ($2 | 0) != 0; //@line 8670
 L1 : do {
  if ($7 & ($0 & 3 | 0) != 0) {
   $8 = $1 & 255; //@line 8674
   $$03555 = $0; //@line 8675
   $$03654 = $2; //@line 8675
   while (1) {
    if ((HEAP8[$$03555 >> 0] | 0) == $8 << 24 >> 24) {
     $$035$lcssa65 = $$03555; //@line 8680
     $$036$lcssa64 = $$03654; //@line 8680
     label = 6; //@line 8681
     break L1;
    }
    $11 = $$03555 + 1 | 0; //@line 8684
    $12 = $$03654 + -1 | 0; //@line 8685
    $16 = ($12 | 0) != 0; //@line 8689
    if ($16 & ($11 & 3 | 0) != 0) {
     $$03555 = $11; //@line 8692
     $$03654 = $12; //@line 8692
    } else {
     $$035$lcssa = $11; //@line 8694
     $$036$lcssa = $12; //@line 8694
     $$lcssa = $16; //@line 8694
     label = 5; //@line 8695
     break;
    }
   }
  } else {
   $$035$lcssa = $0; //@line 8700
   $$036$lcssa = $2; //@line 8700
   $$lcssa = $7; //@line 8700
   label = 5; //@line 8701
  }
 } while (0);
 if ((label | 0) == 5) {
  if ($$lcssa) {
   $$035$lcssa65 = $$035$lcssa; //@line 8706
   $$036$lcssa64 = $$036$lcssa; //@line 8706
   label = 6; //@line 8707
  } else {
   $$2 = $$035$lcssa; //@line 8709
   $$3 = 0; //@line 8709
  }
 }
 L8 : do {
  if ((label | 0) == 6) {
   $18 = $1 & 255; //@line 8715
   if ((HEAP8[$$035$lcssa65 >> 0] | 0) == $18 << 24 >> 24) {
    $$2 = $$035$lcssa65; //@line 8718
    $$3 = $$036$lcssa64; //@line 8718
   } else {
    $20 = Math_imul($3, 16843009) | 0; //@line 8720
    L11 : do {
     if ($$036$lcssa64 >>> 0 > 3) {
      $$046 = $$035$lcssa65; //@line 8724
      $$13745 = $$036$lcssa64; //@line 8724
      while (1) {
       $23 = HEAP32[$$046 >> 2] ^ $20; //@line 8727
       if (($23 & -2139062144 ^ -2139062144) & $23 + -16843009 | 0) {
        break;
       }
       $29 = $$046 + 4 | 0; //@line 8736
       $30 = $$13745 + -4 | 0; //@line 8737
       if ($30 >>> 0 > 3) {
        $$046 = $29; //@line 8740
        $$13745 = $30; //@line 8740
       } else {
        $$0$lcssa = $29; //@line 8742
        $$137$lcssa = $30; //@line 8742
        label = 11; //@line 8743
        break L11;
       }
      }
      $$140 = $$046; //@line 8747
      $$23839 = $$13745; //@line 8747
     } else {
      $$0$lcssa = $$035$lcssa65; //@line 8749
      $$137$lcssa = $$036$lcssa64; //@line 8749
      label = 11; //@line 8750
     }
    } while (0);
    if ((label | 0) == 11) {
     if (!$$137$lcssa) {
      $$2 = $$0$lcssa; //@line 8756
      $$3 = 0; //@line 8756
      break;
     } else {
      $$140 = $$0$lcssa; //@line 8759
      $$23839 = $$137$lcssa; //@line 8759
     }
    }
    while (1) {
     if ((HEAP8[$$140 >> 0] | 0) == $18 << 24 >> 24) {
      $$2 = $$140; //@line 8766
      $$3 = $$23839; //@line 8766
      break L8;
     }
     $35 = $$140 + 1 | 0; //@line 8769
     $$23839 = $$23839 + -1 | 0; //@line 8770
     if (!$$23839) {
      $$2 = $35; //@line 8773
      $$3 = 0; //@line 8773
      break;
     } else {
      $$140 = $35; //@line 8776
     }
    }
   }
  }
 } while (0);
 return ($$3 | 0 ? $$2 : 0) | 0; //@line 8784
}
function _fflush($0) {
 $0 = $0 | 0;
 var $$0 = 0, $$023 = 0, $$02325 = 0, $$02327 = 0, $$024$lcssa = 0, $$02426 = 0, $$1 = 0, $12 = 0, $13 = 0, $25 = 0, $28 = 0, $34 = 0, $5 = 0, $7 = 0, $AsyncCtx = 0, $AsyncCtx10 = 0, $AsyncCtx3 = 0, $AsyncCtx6 = 0, $phitmp = 0, sp = 0;
 sp = STACKTOP; //@line 8437
 do {
  if (!$0) {
   do {
    if (!(HEAP32[148] | 0)) {
     $34 = 0; //@line 8445
    } else {
     $12 = HEAP32[148] | 0; //@line 8447
     $AsyncCtx10 = _emscripten_alloc_async_context(4, sp) | 0; //@line 8448
     $13 = _fflush($12) | 0; //@line 8449
     if (___async) {
      HEAP32[$AsyncCtx10 >> 2] = 117; //@line 8452
      sp = STACKTOP; //@line 8453
      return 0; //@line 8454
     } else {
      _emscripten_free_async_context($AsyncCtx10 | 0); //@line 8456
      $34 = $13; //@line 8457
      break;
     }
    }
   } while (0);
   $$02325 = HEAP32[(___ofl_lock() | 0) >> 2] | 0; //@line 8463
   L9 : do {
    if (!$$02325) {
     $$024$lcssa = $34; //@line 8467
    } else {
     $$02327 = $$02325; //@line 8469
     $$02426 = $34; //@line 8469
     while (1) {
      if ((HEAP32[$$02327 + 76 >> 2] | 0) > -1) {
       $28 = ___lockfile($$02327) | 0; //@line 8476
      } else {
       $28 = 0; //@line 8478
      }
      if ((HEAP32[$$02327 + 20 >> 2] | 0) >>> 0 > (HEAP32[$$02327 + 28 >> 2] | 0) >>> 0) {
       $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 8486
       $25 = ___fflush_unlocked($$02327) | 0; //@line 8487
       if (___async) {
        break;
       }
       _emscripten_free_async_context($AsyncCtx | 0); //@line 8492
       $$1 = $25 | $$02426; //@line 8494
      } else {
       $$1 = $$02426; //@line 8496
      }
      if ($28 | 0) {
       ___unlockfile($$02327); //@line 8500
      }
      $$023 = HEAP32[$$02327 + 56 >> 2] | 0; //@line 8503
      if (!$$023) {
       $$024$lcssa = $$1; //@line 8506
       break L9;
      } else {
       $$02327 = $$023; //@line 8509
       $$02426 = $$1; //@line 8509
      }
     }
     HEAP32[$AsyncCtx >> 2] = 118; //@line 8512
     HEAP32[$AsyncCtx + 4 >> 2] = $$02426; //@line 8514
     HEAP32[$AsyncCtx + 8 >> 2] = $28; //@line 8516
     HEAP32[$AsyncCtx + 12 >> 2] = $$02327; //@line 8518
     sp = STACKTOP; //@line 8519
     return 0; //@line 8520
    }
   } while (0);
   ___ofl_unlock(); //@line 8523
   $$0 = $$024$lcssa; //@line 8524
  } else {
   if ((HEAP32[$0 + 76 >> 2] | 0) <= -1) {
    $AsyncCtx6 = _emscripten_alloc_async_context(4, sp) | 0; //@line 8530
    $5 = ___fflush_unlocked($0) | 0; //@line 8531
    if (___async) {
     HEAP32[$AsyncCtx6 >> 2] = 115; //@line 8534
     sp = STACKTOP; //@line 8535
     return 0; //@line 8536
    } else {
     _emscripten_free_async_context($AsyncCtx6 | 0); //@line 8538
     $$0 = $5; //@line 8539
     break;
    }
   }
   $phitmp = (___lockfile($0) | 0) == 0; //@line 8544
   $AsyncCtx3 = _emscripten_alloc_async_context(12, sp) | 0; //@line 8545
   $7 = ___fflush_unlocked($0) | 0; //@line 8546
   if (___async) {
    HEAP32[$AsyncCtx3 >> 2] = 116; //@line 8549
    HEAP8[$AsyncCtx3 + 4 >> 0] = $phitmp & 1; //@line 8552
    HEAP32[$AsyncCtx3 + 8 >> 2] = $0; //@line 8554
    sp = STACKTOP; //@line 8555
    return 0; //@line 8556
   }
   _emscripten_free_async_context($AsyncCtx3 | 0); //@line 8558
   if ($phitmp) {
    $$0 = $7; //@line 8560
   } else {
    ___unlockfile($0); //@line 8562
    $$0 = $7; //@line 8563
   }
  }
 } while (0);
 return $$0 | 0; //@line 8567
}
function __ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($0, $1, $2, $3, $4) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 var $$037$off038 = 0, $$037$off039 = 0, $13 = 0, $19 = 0, $22 = 0, $23 = 0, $25 = 0, $28 = 0, $39 = 0, $50 = 0, $53 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 13176
 do {
  if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, $4) | 0) {
   __ZNK10__cxxabiv117__class_type_info29process_static_type_below_dstEPNS_19__dynamic_cast_infoEPKvi(0, $1, $2, $3); //@line 13182
  } else {
   if (!(__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 >> 2] | 0, $4) | 0)) {
    $50 = HEAP32[$0 + 8 >> 2] | 0; //@line 13188
    $53 = HEAP32[(HEAP32[$50 >> 2] | 0) + 24 >> 2] | 0; //@line 13191
    $AsyncCtx3 = _emscripten_alloc_async_context(4, sp) | 0; //@line 13192
    FUNCTION_TABLE_viiiii[$53 & 3]($50, $1, $2, $3, $4); //@line 13193
    if (___async) {
     HEAP32[$AsyncCtx3 >> 2] = 138; //@line 13196
     sp = STACKTOP; //@line 13197
     return;
    } else {
     _emscripten_free_async_context($AsyncCtx3 | 0); //@line 13200
     break;
    }
   }
   if ((HEAP32[$1 + 16 >> 2] | 0) != ($2 | 0)) {
    $13 = $1 + 20 | 0; //@line 13208
    if ((HEAP32[$13 >> 2] | 0) != ($2 | 0)) {
     HEAP32[$1 + 32 >> 2] = $3; //@line 13213
     $19 = $1 + 44 | 0; //@line 13214
     if ((HEAP32[$19 >> 2] | 0) == 4) {
      break;
     }
     $22 = $1 + 52 | 0; //@line 13220
     HEAP8[$22 >> 0] = 0; //@line 13221
     $23 = $1 + 53 | 0; //@line 13222
     HEAP8[$23 >> 0] = 0; //@line 13223
     $25 = HEAP32[$0 + 8 >> 2] | 0; //@line 13225
     $28 = HEAP32[(HEAP32[$25 >> 2] | 0) + 20 >> 2] | 0; //@line 13228
     $AsyncCtx = _emscripten_alloc_async_context(28, sp) | 0; //@line 13229
     FUNCTION_TABLE_viiiiii[$28 & 3]($25, $1, $2, $2, 1, $4); //@line 13230
     if (___async) {
      HEAP32[$AsyncCtx >> 2] = 137; //@line 13233
      HEAP32[$AsyncCtx + 4 >> 2] = $23; //@line 13235
      HEAP32[$AsyncCtx + 8 >> 2] = $2; //@line 13237
      HEAP32[$AsyncCtx + 12 >> 2] = $13; //@line 13239
      HEAP32[$AsyncCtx + 16 >> 2] = $1; //@line 13241
      HEAP32[$AsyncCtx + 20 >> 2] = $22; //@line 13243
      HEAP32[$AsyncCtx + 24 >> 2] = $19; //@line 13245
      sp = STACKTOP; //@line 13246
      return;
     }
     _emscripten_free_async_context($AsyncCtx | 0); //@line 13249
     if (!(HEAP8[$23 >> 0] | 0)) {
      $$037$off038 = 4; //@line 13253
      label = 13; //@line 13254
     } else {
      if (!(HEAP8[$22 >> 0] | 0)) {
       $$037$off038 = 3; //@line 13259
       label = 13; //@line 13260
      } else {
       $$037$off039 = 3; //@line 13262
      }
     }
     if ((label | 0) == 13) {
      HEAP32[$13 >> 2] = $2; //@line 13266
      $39 = $1 + 40 | 0; //@line 13267
      HEAP32[$39 >> 2] = (HEAP32[$39 >> 2] | 0) + 1; //@line 13270
      if ((HEAP32[$1 + 36 >> 2] | 0) == 1) {
       if ((HEAP32[$1 + 24 >> 2] | 0) == 2) {
        HEAP8[$1 + 54 >> 0] = 1; //@line 13280
        $$037$off039 = $$037$off038; //@line 13281
       } else {
        $$037$off039 = $$037$off038; //@line 13283
       }
      } else {
       $$037$off039 = $$037$off038; //@line 13286
      }
     }
     HEAP32[$19 >> 2] = $$037$off039; //@line 13289
     break;
    }
   }
   if (($3 | 0) == 1) {
    HEAP32[$1 + 32 >> 2] = 1; //@line 13296
   }
  }
 } while (0);
 return;
}
function _mbed_vtracef__async_cb_18($0) {
 $0 = $0 | 0;
 var $$13 = 0, $$expand_i1_val = 0, $12 = 0, $14 = 0, $18 = 0, $19 = 0, $2 = 0, $21 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $30 = 0, $34 = 0, $35 = 0, $4 = 0, $6 = 0, $8 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx6 = 0, $ReallocAsyncCtx7 = 0, sp = 0;
 sp = STACKTOP; //@line 2252
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 2254
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 2256
 $6 = HEAP8[$0 + 12 >> 0] & 1; //@line 2259
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 2261
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 2265
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 2267
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 2269
 $$13 = ($AsyncRetVal | 0) >= ($8 | 0) ? 0 : $AsyncRetVal; //@line 2271
 $18 = (HEAP32[$0 + 20 >> 2] | 0) + $$13 | 0; //@line 2273
 $19 = $8 - $$13 | 0; //@line 2274
 do {
  if (($$13 | 0) > 0) {
   $21 = HEAP32[58] | 0; //@line 2278
   if (!(($19 | 0) > 0 & ($21 | 0) != 0)) {
    if (($$13 | 0) < 1 | ($19 | 0) < 1 | $6 ^ 1) {
     break;
    }
    _snprintf($18, $19, 1485, $12) | 0; //@line 2290
    break;
   }
   $ReallocAsyncCtx6 = _emscripten_realloc_async_context(32) | 0; //@line 2293
   $23 = FUNCTION_TABLE_i[$21 & 0]() | 0; //@line 2294
   if (___async) {
    HEAP32[$ReallocAsyncCtx6 >> 2] = 45; //@line 2297
    $24 = $ReallocAsyncCtx6 + 4 | 0; //@line 2298
    HEAP32[$24 >> 2] = $2; //@line 2299
    $25 = $ReallocAsyncCtx6 + 8 | 0; //@line 2300
    HEAP32[$25 >> 2] = $18; //@line 2301
    $26 = $ReallocAsyncCtx6 + 12 | 0; //@line 2302
    HEAP32[$26 >> 2] = $19; //@line 2303
    $27 = $ReallocAsyncCtx6 + 16 | 0; //@line 2304
    HEAP32[$27 >> 2] = $4; //@line 2305
    $28 = $ReallocAsyncCtx6 + 20 | 0; //@line 2306
    $$expand_i1_val = $6 & 1; //@line 2307
    HEAP8[$28 >> 0] = $$expand_i1_val; //@line 2308
    $29 = $ReallocAsyncCtx6 + 24 | 0; //@line 2309
    HEAP32[$29 >> 2] = $12; //@line 2310
    $30 = $ReallocAsyncCtx6 + 28 | 0; //@line 2311
    HEAP32[$30 >> 2] = $14; //@line 2312
    sp = STACKTOP; //@line 2313
    return;
   }
   HEAP32[___async_retval >> 2] = $23; //@line 2317
   ___async_unwind = 0; //@line 2318
   HEAP32[$ReallocAsyncCtx6 >> 2] = 45; //@line 2319
   $24 = $ReallocAsyncCtx6 + 4 | 0; //@line 2320
   HEAP32[$24 >> 2] = $2; //@line 2321
   $25 = $ReallocAsyncCtx6 + 8 | 0; //@line 2322
   HEAP32[$25 >> 2] = $18; //@line 2323
   $26 = $ReallocAsyncCtx6 + 12 | 0; //@line 2324
   HEAP32[$26 >> 2] = $19; //@line 2325
   $27 = $ReallocAsyncCtx6 + 16 | 0; //@line 2326
   HEAP32[$27 >> 2] = $4; //@line 2327
   $28 = $ReallocAsyncCtx6 + 20 | 0; //@line 2328
   $$expand_i1_val = $6 & 1; //@line 2329
   HEAP8[$28 >> 0] = $$expand_i1_val; //@line 2330
   $29 = $ReallocAsyncCtx6 + 24 | 0; //@line 2331
   HEAP32[$29 >> 2] = $12; //@line 2332
   $30 = $ReallocAsyncCtx6 + 28 | 0; //@line 2333
   HEAP32[$30 >> 2] = $14; //@line 2334
   sp = STACKTOP; //@line 2335
   return;
  }
 } while (0);
 $34 = HEAP32[59] | 0; //@line 2339
 $35 = HEAP32[52] | 0; //@line 2340
 $ReallocAsyncCtx7 = _emscripten_realloc_async_context(4) | 0; //@line 2341
 FUNCTION_TABLE_vi[$34 & 255]($35); //@line 2342
 if (___async) {
  HEAP32[$ReallocAsyncCtx7 >> 2] = 46; //@line 2345
  sp = STACKTOP; //@line 2346
  return;
 }
 ___async_unwind = 0; //@line 2349
 HEAP32[$ReallocAsyncCtx7 >> 2] = 46; //@line 2350
 sp = STACKTOP; //@line 2351
 return;
}
function _equeue_enqueue($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$051$ph = 0, $$05157 = 0, $$0515859 = 0, $$053 = 0, $13 = 0, $14 = 0, $16 = 0, $24 = 0, $25 = 0, $27 = 0, $29 = 0, $33 = 0, $34 = 0, $42 = 0, $43 = 0, $46 = 0, $47 = 0, $49 = 0, $54 = 0, $65 = 0, $67 = 0, $AsyncCtx = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 914
 $13 = $1 - (HEAP32[$0 + 12 >> 2] | 0) | HEAPU8[$1 + 4 >> 0] << HEAP32[$0 + 16 >> 2]; //@line 925
 $14 = $1 + 20 | 0; //@line 926
 $16 = (HEAP32[$14 >> 2] | 0) - $2 | 0; //@line 928
 HEAP32[$14 >> 2] = ($16 & ~($16 >> 31)) + $2; //@line 933
 HEAP8[$1 + 5 >> 0] = HEAP8[$0 + 9 >> 0] | 0; //@line 937
 $24 = $0 + 128 | 0; //@line 938
 _equeue_mutex_lock($24); //@line 939
 $25 = HEAP32[$0 >> 2] | 0; //@line 940
 L1 : do {
  if (!$25) {
   $$051$ph = $0; //@line 944
   label = 5; //@line 945
  } else {
   $27 = HEAP32[$14 >> 2] | 0; //@line 947
   $$053 = $0; //@line 948
   $29 = $25; //@line 948
   while (1) {
    if (((HEAP32[$29 + 20 >> 2] | 0) - $27 | 0) >= 0) {
     break;
    }
    $33 = $29 + 8 | 0; //@line 957
    $34 = HEAP32[$33 >> 2] | 0; //@line 958
    if (!$34) {
     $$051$ph = $33; //@line 961
     label = 5; //@line 962
     break L1;
    } else {
     $$053 = $33; //@line 965
     $29 = $34; //@line 965
    }
   }
   if ((HEAP32[$29 + 20 >> 2] | 0) != (HEAP32[$14 >> 2] | 0)) {
    $49 = $1 + 8 | 0; //@line 973
    HEAP32[$49 >> 2] = $29; //@line 974
    HEAP32[$29 + 16 >> 2] = $49; //@line 976
    $$0515859 = $$053; //@line 977
    label = 11; //@line 978
    break;
   }
   $42 = HEAP32[$29 + 8 >> 2] | 0; //@line 982
   $43 = $1 + 8 | 0; //@line 983
   HEAP32[$43 >> 2] = $42; //@line 984
   if ($42 | 0) {
    HEAP32[$42 + 16 >> 2] = $43; //@line 988
   }
   $46 = HEAP32[$$053 >> 2] | 0; //@line 990
   $47 = $1 + 12 | 0; //@line 991
   HEAP32[$47 >> 2] = $46; //@line 992
   HEAP32[$46 + 16 >> 2] = $47; //@line 994
   $$05157 = $$053; //@line 995
  }
 } while (0);
 if ((label | 0) == 5) {
  HEAP32[$1 + 8 >> 2] = 0; //@line 1000
  $$0515859 = $$051$ph; //@line 1001
  label = 11; //@line 1002
 }
 if ((label | 0) == 11) {
  HEAP32[$1 + 12 >> 2] = 0; //@line 1006
  $$05157 = $$0515859; //@line 1007
 }
 HEAP32[$$05157 >> 2] = $1; //@line 1009
 HEAP32[$1 + 16 >> 2] = $$05157; //@line 1011
 $54 = HEAP32[$0 + 40 >> 2] | 0; //@line 1013
 if (!$54) {
  _equeue_mutex_unlock($24); //@line 1016
  return $13 | 0; //@line 1017
 }
 if (!(HEAP8[$0 + 36 >> 0] | 0)) {
  _equeue_mutex_unlock($24); //@line 1023
  return $13 | 0; //@line 1024
 }
 if ((HEAP32[$0 >> 2] | 0) != ($1 | 0)) {
  _equeue_mutex_unlock($24); //@line 1029
  return $13 | 0; //@line 1030
 }
 if (HEAP32[$1 + 12 >> 2] | 0) {
  _equeue_mutex_unlock($24); //@line 1036
  return $13 | 0; //@line 1037
 }
 $65 = HEAP32[$0 + 44 >> 2] | 0; //@line 1040
 $67 = (HEAP32[$14 >> 2] | 0) - $2 | 0; //@line 1042
 $AsyncCtx = _emscripten_alloc_async_context(12, sp) | 0; //@line 1046
 FUNCTION_TABLE_vii[$54 & 3]($65, $67 & ~($67 >> 31)); //@line 1047
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 29; //@line 1050
  HEAP32[$AsyncCtx + 4 >> 2] = $24; //@line 1052
  HEAP32[$AsyncCtx + 8 >> 2] = $13; //@line 1054
  sp = STACKTOP; //@line 1055
  return 0; //@line 1056
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 1058
 _equeue_mutex_unlock($24); //@line 1059
 return $13 | 0; //@line 1060
}
function _mbed_vtracef__async_cb_19($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $2 = 0, $20 = 0, $22 = 0, $24 = 0, $26 = 0, $28 = 0, $30 = 0, $32 = 0, $34 = 0, $36 = 0, $38 = 0, $4 = 0, $40 = 0, $42 = 0, $44 = 0, $46 = 0, $48 = 0, $50 = 0, $55 = 0, $56 = 0, $57 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx5 = 0, sp = 0;
 sp = STACKTOP; //@line 2361
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 2363
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 2365
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 2367
 $8 = HEAP8[$0 + 16 >> 0] & 1; //@line 2370
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 2372
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 2374
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 2376
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 2378
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 2380
 $20 = HEAP32[$0 + 40 >> 2] | 0; //@line 2382
 $22 = HEAP32[$0 + 44 >> 2] | 0; //@line 2384
 $24 = HEAP32[$0 + 48 >> 2] | 0; //@line 2386
 $26 = HEAP32[$0 + 52 >> 2] | 0; //@line 2388
 $28 = HEAP32[$0 + 56 >> 2] | 0; //@line 2390
 $30 = HEAP32[$0 + 60 >> 2] | 0; //@line 2392
 $32 = HEAP32[$0 + 64 >> 2] | 0; //@line 2394
 $34 = HEAP32[$0 + 68 >> 2] | 0; //@line 2396
 $36 = HEAP32[$0 + 72 >> 2] | 0; //@line 2398
 $38 = HEAP32[$0 + 76 >> 2] | 0; //@line 2400
 $40 = HEAP32[$0 + 80 >> 2] | 0; //@line 2402
 $42 = HEAP32[$0 + 84 >> 2] | 0; //@line 2404
 $44 = HEAP32[$0 + 88 >> 2] | 0; //@line 2406
 $46 = HEAP32[$0 + 92 >> 2] | 0; //@line 2408
 $48 = HEAP32[$0 + 96 >> 2] | 0; //@line 2410
 $50 = HEAP32[$0 + 100 >> 2] | 0; //@line 2412
 $55 = ($2 | 0 ? 4 : 0) + $2 + (HEAP32[___async_retval >> 2] | 0) | 0; //@line 2418
 $56 = HEAP32[57] | 0; //@line 2419
 $ReallocAsyncCtx5 = _emscripten_realloc_async_context(100) | 0; //@line 2420
 $57 = FUNCTION_TABLE_ii[$56 & 15]($55) | 0; //@line 2421
 if (!___async) {
  HEAP32[___async_retval >> 2] = $57; //@line 2425
  ___async_unwind = 0; //@line 2426
 }
 HEAP32[$ReallocAsyncCtx5 >> 2] = 43; //@line 2428
 HEAP32[$ReallocAsyncCtx5 + 4 >> 2] = $4; //@line 2430
 HEAP32[$ReallocAsyncCtx5 + 8 >> 2] = $6; //@line 2432
 HEAP32[$ReallocAsyncCtx5 + 12 >> 2] = $14; //@line 2434
 HEAP32[$ReallocAsyncCtx5 + 16 >> 2] = $16; //@line 2436
 HEAP32[$ReallocAsyncCtx5 + 20 >> 2] = $18; //@line 2438
 HEAP32[$ReallocAsyncCtx5 + 24 >> 2] = $20; //@line 2440
 HEAP32[$ReallocAsyncCtx5 + 28 >> 2] = $22; //@line 2442
 HEAP32[$ReallocAsyncCtx5 + 32 >> 2] = $24; //@line 2444
 HEAP32[$ReallocAsyncCtx5 + 36 >> 2] = $26; //@line 2446
 HEAP32[$ReallocAsyncCtx5 + 40 >> 2] = $28; //@line 2448
 HEAP32[$ReallocAsyncCtx5 + 44 >> 2] = $30; //@line 2450
 HEAP32[$ReallocAsyncCtx5 + 48 >> 2] = $32; //@line 2452
 HEAP8[$ReallocAsyncCtx5 + 52 >> 0] = $8 & 1; //@line 2455
 HEAP32[$ReallocAsyncCtx5 + 56 >> 2] = $34; //@line 2457
 HEAP32[$ReallocAsyncCtx5 + 60 >> 2] = $36; //@line 2459
 HEAP32[$ReallocAsyncCtx5 + 64 >> 2] = $38; //@line 2461
 HEAP32[$ReallocAsyncCtx5 + 68 >> 2] = $40; //@line 2463
 HEAP32[$ReallocAsyncCtx5 + 72 >> 2] = $42; //@line 2465
 HEAP32[$ReallocAsyncCtx5 + 76 >> 2] = $44; //@line 2467
 HEAP32[$ReallocAsyncCtx5 + 80 >> 2] = $46; //@line 2469
 HEAP32[$ReallocAsyncCtx5 + 84 >> 2] = $48; //@line 2471
 HEAP32[$ReallocAsyncCtx5 + 88 >> 2] = $50; //@line 2473
 HEAP32[$ReallocAsyncCtx5 + 92 >> 2] = $10; //@line 2475
 HEAP32[$ReallocAsyncCtx5 + 96 >> 2] = $12; //@line 2477
 sp = STACKTOP; //@line 2478
 return;
}
function __ZL25default_terminate_handlerv() {
 var $0 = 0, $1 = 0, $12 = 0, $22 = 0, $23 = 0, $25 = 0, $28 = 0, $29 = 0, $3 = 0, $36 = 0, $39 = 0, $40 = 0, $7 = 0, $9 = 0, $AsyncCtx = 0, $AsyncCtx14 = 0, $vararg_buffer = 0, $vararg_buffer10 = 0, $vararg_buffer3 = 0, $vararg_buffer7 = 0, sp = 0;
 sp = STACKTOP; //@line 12488
 STACKTOP = STACKTOP + 48 | 0; //@line 12489
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(48); //@line 12489
 $vararg_buffer10 = sp + 32 | 0; //@line 12490
 $vararg_buffer7 = sp + 24 | 0; //@line 12491
 $vararg_buffer3 = sp + 16 | 0; //@line 12492
 $vararg_buffer = sp; //@line 12493
 $0 = sp + 36 | 0; //@line 12494
 $1 = ___cxa_get_globals_fast() | 0; //@line 12495
 if ($1 | 0) {
  $3 = HEAP32[$1 >> 2] | 0; //@line 12498
  if ($3 | 0) {
   $7 = $3 + 48 | 0; //@line 12503
   $9 = HEAP32[$7 >> 2] | 0; //@line 12505
   $12 = HEAP32[$7 + 4 >> 2] | 0; //@line 12508
   if (!(($9 & -256 | 0) == 1126902528 & ($12 | 0) == 1129074247)) {
    HEAP32[$vararg_buffer7 >> 2] = 5334; //@line 12514
    _abort_message(5284, $vararg_buffer7); //@line 12515
   }
   if (($9 | 0) == 1126902529 & ($12 | 0) == 1129074247) {
    $22 = HEAP32[$3 + 44 >> 2] | 0; //@line 12524
   } else {
    $22 = $3 + 80 | 0; //@line 12526
   }
   HEAP32[$0 >> 2] = $22; //@line 12528
   $23 = HEAP32[$3 >> 2] | 0; //@line 12529
   $25 = HEAP32[$23 + 4 >> 2] | 0; //@line 12531
   $28 = HEAP32[(HEAP32[16] | 0) + 16 >> 2] | 0; //@line 12534
   $AsyncCtx = _emscripten_alloc_async_context(28, sp) | 0; //@line 12535
   $29 = FUNCTION_TABLE_iiii[$28 & 7](64, $23, $0) | 0; //@line 12536
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 128; //@line 12539
    HEAP32[$AsyncCtx + 4 >> 2] = $0; //@line 12541
    HEAP32[$AsyncCtx + 8 >> 2] = $vararg_buffer3; //@line 12543
    HEAP32[$AsyncCtx + 12 >> 2] = $25; //@line 12545
    HEAP32[$AsyncCtx + 16 >> 2] = $vararg_buffer3; //@line 12547
    HEAP32[$AsyncCtx + 20 >> 2] = $vararg_buffer; //@line 12549
    HEAP32[$AsyncCtx + 24 >> 2] = $vararg_buffer; //@line 12551
    sp = STACKTOP; //@line 12552
    STACKTOP = sp; //@line 12553
    return;
   }
   _emscripten_free_async_context($AsyncCtx | 0); //@line 12555
   if (!$29) {
    HEAP32[$vararg_buffer3 >> 2] = 5334; //@line 12557
    HEAP32[$vararg_buffer3 + 4 >> 2] = $25; //@line 12559
    _abort_message(5243, $vararg_buffer3); //@line 12560
   }
   $36 = HEAP32[$0 >> 2] | 0; //@line 12563
   $39 = HEAP32[(HEAP32[$36 >> 2] | 0) + 8 >> 2] | 0; //@line 12566
   $AsyncCtx14 = _emscripten_alloc_async_context(16, sp) | 0; //@line 12567
   $40 = FUNCTION_TABLE_ii[$39 & 15]($36) | 0; //@line 12568
   if (___async) {
    HEAP32[$AsyncCtx14 >> 2] = 129; //@line 12571
    HEAP32[$AsyncCtx14 + 4 >> 2] = $vararg_buffer; //@line 12573
    HEAP32[$AsyncCtx14 + 8 >> 2] = $25; //@line 12575
    HEAP32[$AsyncCtx14 + 12 >> 2] = $vararg_buffer; //@line 12577
    sp = STACKTOP; //@line 12578
    STACKTOP = sp; //@line 12579
    return;
   } else {
    _emscripten_free_async_context($AsyncCtx14 | 0); //@line 12581
    HEAP32[$vararg_buffer >> 2] = 5334; //@line 12582
    HEAP32[$vararg_buffer + 4 >> 2] = $25; //@line 12584
    HEAP32[$vararg_buffer + 8 >> 2] = $40; //@line 12586
    _abort_message(5198, $vararg_buffer); //@line 12587
   }
  }
 }
 _abort_message(5322, $vararg_buffer10); //@line 12592
}
function _mbed_error_vfprintf__async_cb($0) {
 $0 = $0 | 0;
 var $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $4 = 0, $9 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx2 = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 6872
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 6874
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 6876
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 6878
 if (($AsyncRetVal | 0) <= 0) {
  return;
 }
 if (!(HEAP32[1455] | 0)) {
  _serial_init(5824, 2, 3); //@line 6886
 }
 $9 = HEAP8[$4 >> 0] | 0; //@line 6888
 if (0 == 13 | $9 << 24 >> 24 != 10) {
  $ReallocAsyncCtx2 = _emscripten_realloc_async_context(24) | 0; //@line 6894
  _serial_putc(5824, $9 << 24 >> 24); //@line 6895
  if (___async) {
   HEAP32[$ReallocAsyncCtx2 >> 2] = 69; //@line 6898
   $18 = $ReallocAsyncCtx2 + 4 | 0; //@line 6899
   HEAP32[$18 >> 2] = 0; //@line 6900
   $19 = $ReallocAsyncCtx2 + 8 | 0; //@line 6901
   HEAP32[$19 >> 2] = $AsyncRetVal; //@line 6902
   $20 = $ReallocAsyncCtx2 + 12 | 0; //@line 6903
   HEAP32[$20 >> 2] = $2; //@line 6904
   $21 = $ReallocAsyncCtx2 + 16 | 0; //@line 6905
   HEAP8[$21 >> 0] = $9; //@line 6906
   $22 = $ReallocAsyncCtx2 + 20 | 0; //@line 6907
   HEAP32[$22 >> 2] = $4; //@line 6908
   sp = STACKTOP; //@line 6909
   return;
  }
  ___async_unwind = 0; //@line 6912
  HEAP32[$ReallocAsyncCtx2 >> 2] = 69; //@line 6913
  $18 = $ReallocAsyncCtx2 + 4 | 0; //@line 6914
  HEAP32[$18 >> 2] = 0; //@line 6915
  $19 = $ReallocAsyncCtx2 + 8 | 0; //@line 6916
  HEAP32[$19 >> 2] = $AsyncRetVal; //@line 6917
  $20 = $ReallocAsyncCtx2 + 12 | 0; //@line 6918
  HEAP32[$20 >> 2] = $2; //@line 6919
  $21 = $ReallocAsyncCtx2 + 16 | 0; //@line 6920
  HEAP8[$21 >> 0] = $9; //@line 6921
  $22 = $ReallocAsyncCtx2 + 20 | 0; //@line 6922
  HEAP32[$22 >> 2] = $4; //@line 6923
  sp = STACKTOP; //@line 6924
  return;
 } else {
  $ReallocAsyncCtx3 = _emscripten_realloc_async_context(24) | 0; //@line 6927
  _serial_putc(5824, 13); //@line 6928
  if (___async) {
   HEAP32[$ReallocAsyncCtx3 >> 2] = 68; //@line 6931
   $12 = $ReallocAsyncCtx3 + 4 | 0; //@line 6932
   HEAP8[$12 >> 0] = $9; //@line 6933
   $13 = $ReallocAsyncCtx3 + 8 | 0; //@line 6934
   HEAP32[$13 >> 2] = 0; //@line 6935
   $14 = $ReallocAsyncCtx3 + 12 | 0; //@line 6936
   HEAP32[$14 >> 2] = $AsyncRetVal; //@line 6937
   $15 = $ReallocAsyncCtx3 + 16 | 0; //@line 6938
   HEAP32[$15 >> 2] = $2; //@line 6939
   $16 = $ReallocAsyncCtx3 + 20 | 0; //@line 6940
   HEAP32[$16 >> 2] = $4; //@line 6941
   sp = STACKTOP; //@line 6942
   return;
  }
  ___async_unwind = 0; //@line 6945
  HEAP32[$ReallocAsyncCtx3 >> 2] = 68; //@line 6946
  $12 = $ReallocAsyncCtx3 + 4 | 0; //@line 6947
  HEAP8[$12 >> 0] = $9; //@line 6948
  $13 = $ReallocAsyncCtx3 + 8 | 0; //@line 6949
  HEAP32[$13 >> 2] = 0; //@line 6950
  $14 = $ReallocAsyncCtx3 + 12 | 0; //@line 6951
  HEAP32[$14 >> 2] = $AsyncRetVal; //@line 6952
  $15 = $ReallocAsyncCtx3 + 16 | 0; //@line 6953
  HEAP32[$15 >> 2] = $2; //@line 6954
  $16 = $ReallocAsyncCtx3 + 20 | 0; //@line 6955
  HEAP32[$16 >> 2] = $4; //@line 6956
  sp = STACKTOP; //@line 6957
  return;
 }
}
function _mbed_error_vfprintf__async_cb_47($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $13 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $4 = 0, $6 = 0, $ReallocAsyncCtx2 = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 6965
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 6969
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 6971
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 6975
 $12 = (HEAP32[$0 + 4 >> 2] | 0) + 1 | 0; //@line 6976
 if (($12 | 0) == ($4 | 0)) {
  return;
 }
 $13 = HEAP8[$10 + $12 >> 0] | 0; //@line 6982
 if ((HEAP8[$0 + 16 >> 0] | 0) == 13 | $13 << 24 >> 24 != 10) {
  $ReallocAsyncCtx2 = _emscripten_realloc_async_context(24) | 0; //@line 6988
  _serial_putc(5824, $13 << 24 >> 24); //@line 6989
  if (___async) {
   HEAP32[$ReallocAsyncCtx2 >> 2] = 69; //@line 6992
   $22 = $ReallocAsyncCtx2 + 4 | 0; //@line 6993
   HEAP32[$22 >> 2] = $12; //@line 6994
   $23 = $ReallocAsyncCtx2 + 8 | 0; //@line 6995
   HEAP32[$23 >> 2] = $4; //@line 6996
   $24 = $ReallocAsyncCtx2 + 12 | 0; //@line 6997
   HEAP32[$24 >> 2] = $6; //@line 6998
   $25 = $ReallocAsyncCtx2 + 16 | 0; //@line 6999
   HEAP8[$25 >> 0] = $13; //@line 7000
   $26 = $ReallocAsyncCtx2 + 20 | 0; //@line 7001
   HEAP32[$26 >> 2] = $10; //@line 7002
   sp = STACKTOP; //@line 7003
   return;
  }
  ___async_unwind = 0; //@line 7006
  HEAP32[$ReallocAsyncCtx2 >> 2] = 69; //@line 7007
  $22 = $ReallocAsyncCtx2 + 4 | 0; //@line 7008
  HEAP32[$22 >> 2] = $12; //@line 7009
  $23 = $ReallocAsyncCtx2 + 8 | 0; //@line 7010
  HEAP32[$23 >> 2] = $4; //@line 7011
  $24 = $ReallocAsyncCtx2 + 12 | 0; //@line 7012
  HEAP32[$24 >> 2] = $6; //@line 7013
  $25 = $ReallocAsyncCtx2 + 16 | 0; //@line 7014
  HEAP8[$25 >> 0] = $13; //@line 7015
  $26 = $ReallocAsyncCtx2 + 20 | 0; //@line 7016
  HEAP32[$26 >> 2] = $10; //@line 7017
  sp = STACKTOP; //@line 7018
  return;
 } else {
  $ReallocAsyncCtx3 = _emscripten_realloc_async_context(24) | 0; //@line 7021
  _serial_putc(5824, 13); //@line 7022
  if (___async) {
   HEAP32[$ReallocAsyncCtx3 >> 2] = 68; //@line 7025
   $16 = $ReallocAsyncCtx3 + 4 | 0; //@line 7026
   HEAP8[$16 >> 0] = $13; //@line 7027
   $17 = $ReallocAsyncCtx3 + 8 | 0; //@line 7028
   HEAP32[$17 >> 2] = $12; //@line 7029
   $18 = $ReallocAsyncCtx3 + 12 | 0; //@line 7030
   HEAP32[$18 >> 2] = $4; //@line 7031
   $19 = $ReallocAsyncCtx3 + 16 | 0; //@line 7032
   HEAP32[$19 >> 2] = $6; //@line 7033
   $20 = $ReallocAsyncCtx3 + 20 | 0; //@line 7034
   HEAP32[$20 >> 2] = $10; //@line 7035
   sp = STACKTOP; //@line 7036
   return;
  }
  ___async_unwind = 0; //@line 7039
  HEAP32[$ReallocAsyncCtx3 >> 2] = 68; //@line 7040
  $16 = $ReallocAsyncCtx3 + 4 | 0; //@line 7041
  HEAP8[$16 >> 0] = $13; //@line 7042
  $17 = $ReallocAsyncCtx3 + 8 | 0; //@line 7043
  HEAP32[$17 >> 2] = $12; //@line 7044
  $18 = $ReallocAsyncCtx3 + 12 | 0; //@line 7045
  HEAP32[$18 >> 2] = $4; //@line 7046
  $19 = $ReallocAsyncCtx3 + 16 | 0; //@line 7047
  HEAP32[$19 >> 2] = $6; //@line 7048
  $20 = $ReallocAsyncCtx3 + 20 | 0; //@line 7049
  HEAP32[$20 >> 2] = $10; //@line 7050
  sp = STACKTOP; //@line 7051
  return;
 }
}
function ___stdio_write($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$0 = 0, $$04756 = 0, $$04855 = 0, $$04954 = 0, $$051 = 0, $$1 = 0, $$150 = 0, $12 = 0, $13 = 0, $17 = 0, $20 = 0, $25 = 0, $27 = 0, $3 = 0, $37 = 0, $38 = 0, $4 = 0, $44 = 0, $5 = 0, $7 = 0, $9 = 0, $vararg_buffer = 0, $vararg_buffer3 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 7478
 STACKTOP = STACKTOP + 48 | 0; //@line 7479
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(48); //@line 7479
 $vararg_buffer3 = sp + 16 | 0; //@line 7480
 $vararg_buffer = sp; //@line 7481
 $3 = sp + 32 | 0; //@line 7482
 $4 = $0 + 28 | 0; //@line 7483
 $5 = HEAP32[$4 >> 2] | 0; //@line 7484
 HEAP32[$3 >> 2] = $5; //@line 7485
 $7 = $0 + 20 | 0; //@line 7487
 $9 = (HEAP32[$7 >> 2] | 0) - $5 | 0; //@line 7489
 HEAP32[$3 + 4 >> 2] = $9; //@line 7490
 HEAP32[$3 + 8 >> 2] = $1; //@line 7492
 HEAP32[$3 + 12 >> 2] = $2; //@line 7494
 $12 = $9 + $2 | 0; //@line 7495
 $13 = $0 + 60 | 0; //@line 7496
 HEAP32[$vararg_buffer >> 2] = HEAP32[$13 >> 2]; //@line 7499
 HEAP32[$vararg_buffer + 4 >> 2] = $3; //@line 7501
 HEAP32[$vararg_buffer + 8 >> 2] = 2; //@line 7503
 $17 = ___syscall_ret(___syscall146(146, $vararg_buffer | 0) | 0) | 0; //@line 7505
 L1 : do {
  if (($12 | 0) == ($17 | 0)) {
   label = 3; //@line 7509
  } else {
   $$04756 = 2; //@line 7511
   $$04855 = $12; //@line 7511
   $$04954 = $3; //@line 7511
   $27 = $17; //@line 7511
   while (1) {
    if (($27 | 0) < 0) {
     break;
    }
    $$04855 = $$04855 - $27 | 0; //@line 7517
    $37 = HEAP32[$$04954 + 4 >> 2] | 0; //@line 7519
    $38 = $27 >>> 0 > $37 >>> 0; //@line 7520
    $$150 = $38 ? $$04954 + 8 | 0 : $$04954; //@line 7522
    $$1 = $$04756 + ($38 << 31 >> 31) | 0; //@line 7524
    $$0 = $27 - ($38 ? $37 : 0) | 0; //@line 7526
    HEAP32[$$150 >> 2] = (HEAP32[$$150 >> 2] | 0) + $$0; //@line 7529
    $44 = $$150 + 4 | 0; //@line 7530
    HEAP32[$44 >> 2] = (HEAP32[$44 >> 2] | 0) - $$0; //@line 7533
    HEAP32[$vararg_buffer3 >> 2] = HEAP32[$13 >> 2]; //@line 7536
    HEAP32[$vararg_buffer3 + 4 >> 2] = $$150; //@line 7538
    HEAP32[$vararg_buffer3 + 8 >> 2] = $$1; //@line 7540
    $27 = ___syscall_ret(___syscall146(146, $vararg_buffer3 | 0) | 0) | 0; //@line 7542
    if (($$04855 | 0) == ($27 | 0)) {
     label = 3; //@line 7545
     break L1;
    } else {
     $$04756 = $$1; //@line 7548
     $$04954 = $$150; //@line 7548
    }
   }
   HEAP32[$0 + 16 >> 2] = 0; //@line 7552
   HEAP32[$4 >> 2] = 0; //@line 7553
   HEAP32[$7 >> 2] = 0; //@line 7554
   HEAP32[$0 >> 2] = HEAP32[$0 >> 2] | 32; //@line 7557
   if (($$04756 | 0) == 2) {
    $$051 = 0; //@line 7560
   } else {
    $$051 = $2 - (HEAP32[$$04954 + 4 >> 2] | 0) | 0; //@line 7565
   }
  }
 } while (0);
 if ((label | 0) == 3) {
  $20 = HEAP32[$0 + 44 >> 2] | 0; //@line 7571
  HEAP32[$0 + 16 >> 2] = $20 + (HEAP32[$0 + 48 >> 2] | 0); //@line 7576
  $25 = $20; //@line 7577
  HEAP32[$4 >> 2] = $25; //@line 7578
  HEAP32[$7 >> 2] = $25; //@line 7579
  $$051 = $2; //@line 7580
 }
 STACKTOP = sp; //@line 7582
 return $$051 | 0; //@line 7582
}
function _main__async_cb_43($0) {
 $0 = $0 | 0;
 var $$expand_i1_val = 0, $12 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx10 = 0, sp = 0;
 sp = STACKTOP; //@line 6333
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 6335
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 6337
 if (!$AsyncRetVal) {
  HEAP32[$2 >> 2] = 0; //@line 6340
  HEAP32[$2 + 4 >> 2] = 0; //@line 6340
  HEAP32[$2 + 8 >> 2] = 0; //@line 6340
  HEAP32[$2 + 12 >> 2] = 0; //@line 6340
  $18 = 1; //@line 6341
  $20 = $2; //@line 6341
 } else {
  HEAP32[$AsyncRetVal + 4 >> 2] = 5836; //@line 6344
  HEAP32[$AsyncRetVal + 8 >> 2] = 0; //@line 6346
  HEAP32[$AsyncRetVal + 12 >> 2] = 0; //@line 6348
  HEAP32[$AsyncRetVal + 16 >> 2] = -1; //@line 6350
  HEAP32[$AsyncRetVal + 20 >> 2] = 10; //@line 6352
  HEAP32[$AsyncRetVal + 24 >> 2] = 97; //@line 6354
  HEAP32[$AsyncRetVal + 28 >> 2] = 2; //@line 6356
  HEAP32[$AsyncRetVal >> 2] = 1; //@line 6357
  $12 = $2 + 4 | 0; //@line 6358
  HEAP32[$12 >> 2] = 0; //@line 6359
  HEAP32[$12 + 4 >> 2] = 0; //@line 6359
  HEAP32[$12 + 8 >> 2] = 0; //@line 6359
  HEAP32[$2 >> 2] = $AsyncRetVal; //@line 6360
  HEAP32[$AsyncRetVal >> 2] = (HEAP32[$AsyncRetVal >> 2] | 0) + 1; //@line 6363
  $18 = 0; //@line 6364
  $20 = $2; //@line 6364
 }
 $15 = $2 + 12 | 0; //@line 6366
 HEAP32[$15 >> 2] = 324; //@line 6367
 $ReallocAsyncCtx10 = _emscripten_realloc_async_context(24) | 0; //@line 6368
 __ZN4mbed11InterruptIn4fallENS_8CallbackIFvvEEE(6040, $2); //@line 6369
 if (___async) {
  HEAP32[$ReallocAsyncCtx10 >> 2] = 98; //@line 6372
  $16 = $ReallocAsyncCtx10 + 4 | 0; //@line 6373
  HEAP32[$16 >> 2] = $15; //@line 6374
  $17 = $ReallocAsyncCtx10 + 8 | 0; //@line 6375
  $$expand_i1_val = $18 & 1; //@line 6376
  HEAP8[$17 >> 0] = $$expand_i1_val; //@line 6377
  $19 = $ReallocAsyncCtx10 + 12 | 0; //@line 6378
  HEAP32[$19 >> 2] = $20; //@line 6379
  $21 = $ReallocAsyncCtx10 + 16 | 0; //@line 6380
  HEAP32[$21 >> 2] = $AsyncRetVal; //@line 6381
  $22 = $ReallocAsyncCtx10 + 20 | 0; //@line 6382
  HEAP32[$22 >> 2] = $AsyncRetVal; //@line 6383
  sp = STACKTOP; //@line 6384
  return;
 }
 ___async_unwind = 0; //@line 6387
 HEAP32[$ReallocAsyncCtx10 >> 2] = 98; //@line 6388
 $16 = $ReallocAsyncCtx10 + 4 | 0; //@line 6389
 HEAP32[$16 >> 2] = $15; //@line 6390
 $17 = $ReallocAsyncCtx10 + 8 | 0; //@line 6391
 $$expand_i1_val = $18 & 1; //@line 6392
 HEAP8[$17 >> 0] = $$expand_i1_val; //@line 6393
 $19 = $ReallocAsyncCtx10 + 12 | 0; //@line 6394
 HEAP32[$19 >> 2] = $20; //@line 6395
 $21 = $ReallocAsyncCtx10 + 16 | 0; //@line 6396
 HEAP32[$21 >> 2] = $AsyncRetVal; //@line 6397
 $22 = $ReallocAsyncCtx10 + 20 | 0; //@line 6398
 HEAP32[$22 >> 2] = $AsyncRetVal; //@line 6399
 sp = STACKTOP; //@line 6400
 return;
}
function __ZN20SimulatorBlockDevice7programEPKvyy__async_cb_54($0) {
 $0 = $0 | 0;
 var $11 = 0, $14 = 0, $16 = 0, $18 = 0, $2 = 0, $21 = 0, $23 = 0, $25 = 0, $27 = 0, $32 = 0, $38 = 0, $39 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $7 = 0, $9 = 0, $ReallocAsyncCtx4 = 0, sp = 0;
 sp = STACKTOP; //@line 7598
 $2 = $0 + 8 | 0; //@line 7600
 $7 = HEAP32[$2 + 4 >> 2] | 0; //@line 7605
 $9 = $0 + 16 | 0; //@line 7607
 $11 = HEAP32[$9 >> 2] | 0; //@line 7609
 $14 = HEAP32[$9 + 4 >> 2] | 0; //@line 7612
 $16 = $0 + 24 | 0; //@line 7614
 $18 = HEAP32[$16 >> 2] | 0; //@line 7616
 $21 = HEAP32[$16 + 4 >> 2] | 0; //@line 7619
 $23 = HEAP32[$0 + 32 >> 2] | 0; //@line 7621
 $25 = HEAP32[$0 + 36 >> 2] | 0; //@line 7623
 $27 = ___async_retval; //@line 7625
 $32 = HEAP32[$27 + 4 >> 2] | 0; //@line 7630
 if (!($7 >>> 0 > $32 >>> 0 | (($7 | 0) == ($32 | 0) ? (HEAP32[$2 >> 2] | 0) >>> 0 > (HEAP32[$27 >> 2] | 0) >>> 0 : 0))) {
  _emscripten_asm_const_iiiii(9, HEAP32[$23 + 4 >> 2] | 0, $25 | 0, $11 | 0, $18 | 0) | 0; //@line 7639
  HEAP32[___async_retval >> 2] = 0; //@line 7641
  return;
 }
 $ReallocAsyncCtx4 = _emscripten_realloc_async_context(32) | 0; //@line 7644
 _mbed_assert_internal(2045, 1878, 98); //@line 7645
 if (___async) {
  HEAP32[$ReallocAsyncCtx4 >> 2] = 83; //@line 7648
  $38 = $ReallocAsyncCtx4 + 8 | 0; //@line 7649
  $39 = $38; //@line 7650
  $40 = $39; //@line 7651
  HEAP32[$40 >> 2] = $11; //@line 7652
  $41 = $39 + 4 | 0; //@line 7653
  $42 = $41; //@line 7654
  HEAP32[$42 >> 2] = $14; //@line 7655
  $43 = $ReallocAsyncCtx4 + 16 | 0; //@line 7656
  $44 = $43; //@line 7657
  $45 = $44; //@line 7658
  HEAP32[$45 >> 2] = $18; //@line 7659
  $46 = $44 + 4 | 0; //@line 7660
  $47 = $46; //@line 7661
  HEAP32[$47 >> 2] = $21; //@line 7662
  $48 = $ReallocAsyncCtx4 + 24 | 0; //@line 7663
  HEAP32[$48 >> 2] = $23; //@line 7664
  $49 = $ReallocAsyncCtx4 + 28 | 0; //@line 7665
  HEAP32[$49 >> 2] = $25; //@line 7666
  sp = STACKTOP; //@line 7667
  return;
 }
 ___async_unwind = 0; //@line 7670
 HEAP32[$ReallocAsyncCtx4 >> 2] = 83; //@line 7671
 $38 = $ReallocAsyncCtx4 + 8 | 0; //@line 7672
 $39 = $38; //@line 7673
 $40 = $39; //@line 7674
 HEAP32[$40 >> 2] = $11; //@line 7675
 $41 = $39 + 4 | 0; //@line 7676
 $42 = $41; //@line 7677
 HEAP32[$42 >> 2] = $14; //@line 7678
 $43 = $ReallocAsyncCtx4 + 16 | 0; //@line 7679
 $44 = $43; //@line 7680
 $45 = $44; //@line 7681
 HEAP32[$45 >> 2] = $18; //@line 7682
 $46 = $44 + 4 | 0; //@line 7683
 $47 = $46; //@line 7684
 HEAP32[$47 >> 2] = $21; //@line 7685
 $48 = $ReallocAsyncCtx4 + 24 | 0; //@line 7686
 HEAP32[$48 >> 2] = $23; //@line 7687
 $49 = $ReallocAsyncCtx4 + 28 | 0; //@line 7688
 HEAP32[$49 >> 2] = $25; //@line 7689
 sp = STACKTOP; //@line 7690
 return;
}
function __ZN20SimulatorBlockDevice4readEPvyy__async_cb_45($0) {
 $0 = $0 | 0;
 var $11 = 0, $14 = 0, $16 = 0, $18 = 0, $2 = 0, $21 = 0, $23 = 0, $25 = 0, $27 = 0, $32 = 0, $38 = 0, $39 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $7 = 0, $9 = 0, $ReallocAsyncCtx4 = 0, sp = 0;
 sp = STACKTOP; //@line 6737
 $2 = $0 + 8 | 0; //@line 6739
 $7 = HEAP32[$2 + 4 >> 2] | 0; //@line 6744
 $9 = $0 + 16 | 0; //@line 6746
 $11 = HEAP32[$9 >> 2] | 0; //@line 6748
 $14 = HEAP32[$9 + 4 >> 2] | 0; //@line 6751
 $16 = $0 + 24 | 0; //@line 6753
 $18 = HEAP32[$16 >> 2] | 0; //@line 6755
 $21 = HEAP32[$16 + 4 >> 2] | 0; //@line 6758
 $23 = HEAP32[$0 + 32 >> 2] | 0; //@line 6760
 $25 = HEAP32[$0 + 36 >> 2] | 0; //@line 6762
 $27 = ___async_retval; //@line 6764
 $32 = HEAP32[$27 + 4 >> 2] | 0; //@line 6769
 if (!($7 >>> 0 > $32 >>> 0 | (($7 | 0) == ($32 | 0) ? (HEAP32[$2 >> 2] | 0) >>> 0 > (HEAP32[$27 >> 2] | 0) >>> 0 : 0))) {
  _emscripten_asm_const_iiiii(8, HEAP32[$23 + 4 >> 2] | 0, $25 | 0, $11 | 0, $18 | 0) | 0; //@line 6778
  HEAP32[___async_retval >> 2] = 0; //@line 6780
  return;
 }
 $ReallocAsyncCtx4 = _emscripten_realloc_async_context(32) | 0; //@line 6783
 _mbed_assert_internal(2151, 1878, 83); //@line 6784
 if (___async) {
  HEAP32[$ReallocAsyncCtx4 >> 2] = 79; //@line 6787
  $38 = $ReallocAsyncCtx4 + 8 | 0; //@line 6788
  $39 = $38; //@line 6789
  $40 = $39; //@line 6790
  HEAP32[$40 >> 2] = $11; //@line 6791
  $41 = $39 + 4 | 0; //@line 6792
  $42 = $41; //@line 6793
  HEAP32[$42 >> 2] = $14; //@line 6794
  $43 = $ReallocAsyncCtx4 + 16 | 0; //@line 6795
  $44 = $43; //@line 6796
  $45 = $44; //@line 6797
  HEAP32[$45 >> 2] = $18; //@line 6798
  $46 = $44 + 4 | 0; //@line 6799
  $47 = $46; //@line 6800
  HEAP32[$47 >> 2] = $21; //@line 6801
  $48 = $ReallocAsyncCtx4 + 24 | 0; //@line 6802
  HEAP32[$48 >> 2] = $23; //@line 6803
  $49 = $ReallocAsyncCtx4 + 28 | 0; //@line 6804
  HEAP32[$49 >> 2] = $25; //@line 6805
  sp = STACKTOP; //@line 6806
  return;
 }
 ___async_unwind = 0; //@line 6809
 HEAP32[$ReallocAsyncCtx4 >> 2] = 79; //@line 6810
 $38 = $ReallocAsyncCtx4 + 8 | 0; //@line 6811
 $39 = $38; //@line 6812
 $40 = $39; //@line 6813
 HEAP32[$40 >> 2] = $11; //@line 6814
 $41 = $39 + 4 | 0; //@line 6815
 $42 = $41; //@line 6816
 HEAP32[$42 >> 2] = $14; //@line 6817
 $43 = $ReallocAsyncCtx4 + 16 | 0; //@line 6818
 $44 = $43; //@line 6819
 $45 = $44; //@line 6820
 HEAP32[$45 >> 2] = $18; //@line 6821
 $46 = $44 + 4 | 0; //@line 6822
 $47 = $46; //@line 6823
 HEAP32[$47 >> 2] = $21; //@line 6824
 $48 = $ReallocAsyncCtx4 + 24 | 0; //@line 6825
 HEAP32[$48 >> 2] = $23; //@line 6826
 $49 = $ReallocAsyncCtx4 + 28 | 0; //@line 6827
 HEAP32[$49 >> 2] = $25; //@line 6828
 sp = STACKTOP; //@line 6829
 return;
}
function _mbed_error_vfprintf($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$01213 = 0, $$014 = 0, $2 = 0, $24 = 0, $3 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, $AsyncCtx7 = 0, label = 0, sp = 0, $$01213$looptemp = 0;
 sp = STACKTOP; //@line 2831
 STACKTOP = STACKTOP + 128 | 0; //@line 2832
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(128); //@line 2832
 $2 = sp; //@line 2833
 $AsyncCtx = _emscripten_alloc_async_context(12, sp) | 0; //@line 2834
 $3 = _vsnprintf($2, 128, $0, $1) | 0; //@line 2835
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 67; //@line 2838
  HEAP32[$AsyncCtx + 4 >> 2] = $2; //@line 2840
  HEAP32[$AsyncCtx + 8 >> 2] = $2; //@line 2842
  sp = STACKTOP; //@line 2843
  STACKTOP = sp; //@line 2844
  return;
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 2846
 if (($3 | 0) <= 0) {
  STACKTOP = sp; //@line 2849
  return;
 }
 if (!(HEAP32[1455] | 0)) {
  _serial_init(5824, 2, 3); //@line 2854
  $$01213 = 0; //@line 2855
  $$014 = 0; //@line 2855
 } else {
  $$01213 = 0; //@line 2857
  $$014 = 0; //@line 2857
 }
 while (1) {
  $$01213$looptemp = $$01213;
  $$01213 = HEAP8[$2 + $$014 >> 0] | 0; //@line 2861
  if (!($$01213$looptemp << 24 >> 24 == 13 | $$01213 << 24 >> 24 != 10)) {
   $AsyncCtx7 = _emscripten_alloc_async_context(24, sp) | 0; //@line 2866
   _serial_putc(5824, 13); //@line 2867
   if (___async) {
    label = 8; //@line 2870
    break;
   }
   _emscripten_free_async_context($AsyncCtx7 | 0); //@line 2873
  }
  $AsyncCtx3 = _emscripten_alloc_async_context(24, sp) | 0; //@line 2876
  _serial_putc(5824, $$01213 << 24 >> 24); //@line 2877
  if (___async) {
   label = 11; //@line 2880
   break;
  }
  _emscripten_free_async_context($AsyncCtx3 | 0); //@line 2883
  $24 = $$014 + 1 | 0; //@line 2884
  if (($24 | 0) == ($3 | 0)) {
   label = 13; //@line 2887
   break;
  } else {
   $$014 = $24; //@line 2890
  }
 }
 if ((label | 0) == 8) {
  HEAP32[$AsyncCtx7 >> 2] = 68; //@line 2894
  HEAP8[$AsyncCtx7 + 4 >> 0] = $$01213; //@line 2896
  HEAP32[$AsyncCtx7 + 8 >> 2] = $$014; //@line 2898
  HEAP32[$AsyncCtx7 + 12 >> 2] = $3; //@line 2900
  HEAP32[$AsyncCtx7 + 16 >> 2] = $2; //@line 2902
  HEAP32[$AsyncCtx7 + 20 >> 2] = $2; //@line 2904
  sp = STACKTOP; //@line 2905
  STACKTOP = sp; //@line 2906
  return;
 } else if ((label | 0) == 11) {
  HEAP32[$AsyncCtx3 >> 2] = 69; //@line 2909
  HEAP32[$AsyncCtx3 + 4 >> 2] = $$014; //@line 2911
  HEAP32[$AsyncCtx3 + 8 >> 2] = $3; //@line 2913
  HEAP32[$AsyncCtx3 + 12 >> 2] = $2; //@line 2915
  HEAP8[$AsyncCtx3 + 16 >> 0] = $$01213; //@line 2917
  HEAP32[$AsyncCtx3 + 20 >> 2] = $2; //@line 2919
  sp = STACKTOP; //@line 2920
  STACKTOP = sp; //@line 2921
  return;
 } else if ((label | 0) == 13) {
  STACKTOP = sp; //@line 2924
  return;
 }
}
function __ZNK10__cxxabiv121__vmi_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb_56($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $20 = 0, $22 = 0, $24 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 7845
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 7849
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 7851
 $8 = HEAP8[$0 + 16 >> 0] | 0; //@line 7853
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 7855
 $12 = HEAP8[$0 + 24 >> 0] | 0; //@line 7857
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 7859
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 7861
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 7863
 $20 = HEAP32[$0 + 40 >> 2] | 0; //@line 7865
 $22 = HEAP8[$0 + 44 >> 0] & 1; //@line 7868
 $24 = HEAP32[$0 + 48 >> 2] | 0; //@line 7870
 do {
  if ((HEAP32[$0 + 4 >> 2] | 0) > 1) {
   $26 = $4 + 24 | 0; //@line 7874
   $27 = $6 + 24 | 0; //@line 7875
   $28 = $4 + 8 | 0; //@line 7876
   $29 = $6 + 54 | 0; //@line 7877
   if (!(HEAP8[$29 >> 0] | 0)) {
    if (!(HEAP8[$10 >> 0] | 0)) {
     if (HEAP8[$14 >> 0] | 0) {
      if (!(HEAP32[$28 >> 2] & 1)) {
       break;
      }
     }
    } else {
     if ((HEAP32[$27 >> 2] | 0) == 1) {
      break;
     }
     if (!(HEAP32[$28 >> 2] & 2)) {
      break;
     }
    }
    HEAP8[$10 >> 0] = 0; //@line 7907
    HEAP8[$14 >> 0] = 0; //@line 7908
    $ReallocAsyncCtx = _emscripten_realloc_async_context(60) | 0; //@line 7909
    __ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($26, $6, $16, $18, $20, $22); //@line 7910
    if (!___async) {
     ___async_unwind = 0; //@line 7913
    }
    HEAP32[$ReallocAsyncCtx >> 2] = 143; //@line 7915
    HEAP32[$ReallocAsyncCtx + 4 >> 2] = $26; //@line 7917
    HEAP32[$ReallocAsyncCtx + 8 >> 2] = $24; //@line 7919
    HEAP32[$ReallocAsyncCtx + 12 >> 2] = $29; //@line 7921
    HEAP8[$ReallocAsyncCtx + 16 >> 0] = $8; //@line 7923
    HEAP32[$ReallocAsyncCtx + 20 >> 2] = $10; //@line 7925
    HEAP8[$ReallocAsyncCtx + 24 >> 0] = $12; //@line 7927
    HEAP32[$ReallocAsyncCtx + 28 >> 2] = $14; //@line 7929
    HEAP32[$ReallocAsyncCtx + 32 >> 2] = $27; //@line 7931
    HEAP32[$ReallocAsyncCtx + 36 >> 2] = $28; //@line 7933
    HEAP32[$ReallocAsyncCtx + 40 >> 2] = $6; //@line 7935
    HEAP32[$ReallocAsyncCtx + 44 >> 2] = $16; //@line 7937
    HEAP32[$ReallocAsyncCtx + 48 >> 2] = $18; //@line 7939
    HEAP32[$ReallocAsyncCtx + 52 >> 2] = $20; //@line 7941
    HEAP8[$ReallocAsyncCtx + 56 >> 0] = $22 & 1; //@line 7944
    sp = STACKTOP; //@line 7945
    return;
   }
  }
 } while (0);
 HEAP8[$10 >> 0] = $8; //@line 7950
 HEAP8[$14 >> 0] = $12; //@line 7951
 return;
}
function _main__async_cb_42($0) {
 $0 = $0 | 0;
 var $$expand_i1_val = 0, $10 = 0, $11 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $19 = 0, $22 = 0, $23 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx = 0, $ReallocAsyncCtx2 = 0, $ReallocAsyncCtx8 = 0, sp = 0;
 sp = STACKTOP; //@line 6246
 $4 = HEAP8[$0 + 8 >> 0] & 1; //@line 6251
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 6253
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 6255
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 6257
 $11 = HEAP32[HEAP32[$0 + 4 >> 2] >> 2] | 0; //@line 6258
 if ($11 | 0) {
  $14 = HEAP32[$11 + 8 >> 2] | 0; //@line 6262
  $ReallocAsyncCtx = _emscripten_realloc_async_context(16) | 0; //@line 6263
  FUNCTION_TABLE_vi[$14 & 255]($6); //@line 6264
  if (___async) {
   HEAP32[$ReallocAsyncCtx >> 2] = 99; //@line 6267
   $15 = $ReallocAsyncCtx + 4 | 0; //@line 6268
   $$expand_i1_val = $4 & 1; //@line 6269
   HEAP8[$15 >> 0] = $$expand_i1_val; //@line 6270
   $16 = $ReallocAsyncCtx + 8 | 0; //@line 6271
   HEAP32[$16 >> 2] = $8; //@line 6272
   $17 = $ReallocAsyncCtx + 12 | 0; //@line 6273
   HEAP32[$17 >> 2] = $10; //@line 6274
   sp = STACKTOP; //@line 6275
   return;
  }
  ___async_unwind = 0; //@line 6278
  HEAP32[$ReallocAsyncCtx >> 2] = 99; //@line 6279
  $15 = $ReallocAsyncCtx + 4 | 0; //@line 6280
  $$expand_i1_val = $4 & 1; //@line 6281
  HEAP8[$15 >> 0] = $$expand_i1_val; //@line 6282
  $16 = $ReallocAsyncCtx + 8 | 0; //@line 6283
  HEAP32[$16 >> 2] = $8; //@line 6284
  $17 = $ReallocAsyncCtx + 12 | 0; //@line 6285
  HEAP32[$17 >> 2] = $10; //@line 6286
  sp = STACKTOP; //@line 6287
  return;
 }
 if (!$4) {
  $19 = (HEAP32[$8 >> 2] | 0) + -1 | 0; //@line 6292
  HEAP32[$8 >> 2] = $19; //@line 6293
  if (!$19) {
   $22 = HEAP32[$8 + 24 >> 2] | 0; //@line 6297
   $ReallocAsyncCtx2 = _emscripten_realloc_async_context(8) | 0; //@line 6298
   FUNCTION_TABLE_vi[$22 & 255]($10); //@line 6299
   if (___async) {
    HEAP32[$ReallocAsyncCtx2 >> 2] = 100; //@line 6302
    $23 = $ReallocAsyncCtx2 + 4 | 0; //@line 6303
    HEAP32[$23 >> 2] = $8; //@line 6304
    sp = STACKTOP; //@line 6305
    return;
   }
   ___async_unwind = 0; //@line 6308
   HEAP32[$ReallocAsyncCtx2 >> 2] = 100; //@line 6309
   $23 = $ReallocAsyncCtx2 + 4 | 0; //@line 6310
   HEAP32[$23 >> 2] = $8; //@line 6311
   sp = STACKTOP; //@line 6312
   return;
  }
 }
 $ReallocAsyncCtx8 = _emscripten_realloc_async_context(4) | 0; //@line 6316
 __ZN6events10EventQueue8dispatchEi(5836, -1); //@line 6317
 if (___async) {
  HEAP32[$ReallocAsyncCtx8 >> 2] = 102; //@line 6320
  sp = STACKTOP; //@line 6321
  return;
 }
 ___async_unwind = 0; //@line 6324
 HEAP32[$ReallocAsyncCtx8 >> 2] = 102; //@line 6325
 sp = STACKTOP; //@line 6326
 return;
}
function __ZNK10__cxxabiv121__vmi_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $20 = 0, $22 = 0, $24 = 0, $26 = 0, $28 = 0, $4 = 0, $43 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 7729
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 7733
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 7735
 $8 = HEAP8[$0 + 16 >> 0] | 0; //@line 7737
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 7739
 $12 = HEAP8[$0 + 24 >> 0] | 0; //@line 7741
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 7743
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 7745
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 7747
 $20 = HEAP32[$0 + 40 >> 2] | 0; //@line 7749
 $22 = HEAP32[$0 + 44 >> 2] | 0; //@line 7751
 $24 = HEAP32[$0 + 48 >> 2] | 0; //@line 7753
 $26 = HEAP32[$0 + 52 >> 2] | 0; //@line 7755
 $28 = HEAP8[$0 + 56 >> 0] & 1; //@line 7758
 $43 = (HEAP32[$0 + 4 >> 2] | 0) + 8 | 0; //@line 7759
 do {
  if ($43 >>> 0 < $4 >>> 0) {
   if (!(HEAP8[$6 >> 0] | 0)) {
    if (!(HEAP8[$10 >> 0] | 0)) {
     if (HEAP8[$14 >> 0] | 0) {
      if (!(HEAP32[$18 >> 2] & 1)) {
       break;
      }
     }
    } else {
     if ((HEAP32[$16 >> 2] | 0) == 1) {
      break;
     }
     if (!(HEAP32[$18 >> 2] & 2)) {
      break;
     }
    }
    HEAP8[$10 >> 0] = 0; //@line 7792
    HEAP8[$14 >> 0] = 0; //@line 7793
    $ReallocAsyncCtx = _emscripten_realloc_async_context(60) | 0; //@line 7794
    __ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($43, $20, $22, $24, $26, $28); //@line 7795
    if (!___async) {
     ___async_unwind = 0; //@line 7798
    }
    HEAP32[$ReallocAsyncCtx >> 2] = 143; //@line 7800
    HEAP32[$ReallocAsyncCtx + 4 >> 2] = $43; //@line 7802
    HEAP32[$ReallocAsyncCtx + 8 >> 2] = $4; //@line 7804
    HEAP32[$ReallocAsyncCtx + 12 >> 2] = $6; //@line 7806
    HEAP8[$ReallocAsyncCtx + 16 >> 0] = $8; //@line 7808
    HEAP32[$ReallocAsyncCtx + 20 >> 2] = $10; //@line 7810
    HEAP8[$ReallocAsyncCtx + 24 >> 0] = $12; //@line 7812
    HEAP32[$ReallocAsyncCtx + 28 >> 2] = $14; //@line 7814
    HEAP32[$ReallocAsyncCtx + 32 >> 2] = $16; //@line 7816
    HEAP32[$ReallocAsyncCtx + 36 >> 2] = $18; //@line 7818
    HEAP32[$ReallocAsyncCtx + 40 >> 2] = $20; //@line 7820
    HEAP32[$ReallocAsyncCtx + 44 >> 2] = $22; //@line 7822
    HEAP32[$ReallocAsyncCtx + 48 >> 2] = $24; //@line 7824
    HEAP32[$ReallocAsyncCtx + 52 >> 2] = $26; //@line 7826
    HEAP8[$ReallocAsyncCtx + 56 >> 0] = $28 & 1; //@line 7829
    sp = STACKTOP; //@line 7830
    return;
   }
  }
 } while (0);
 HEAP8[$10 >> 0] = $8; //@line 7835
 HEAP8[$14 >> 0] = $12; //@line 7836
 return;
}
function _memcpy(dest, src, num) {
 dest = dest | 0;
 src = src | 0;
 num = num | 0;
 var ret = 0, aligned_dest_end = 0, block_aligned_dest_end = 0, dest_end = 0;
 if ((num | 0) >= 8192) {
  return _emscripten_memcpy_big(dest | 0, src | 0, num | 0) | 0; //@line 9826
 }
 ret = dest | 0; //@line 9829
 dest_end = dest + num | 0; //@line 9830
 if ((dest & 3) == (src & 3)) {
  while (dest & 3) {
   if (!num) return ret | 0; //@line 9834
   HEAP8[dest >> 0] = HEAP8[src >> 0] | 0; //@line 9835
   dest = dest + 1 | 0; //@line 9836
   src = src + 1 | 0; //@line 9837
   num = num - 1 | 0; //@line 9838
  }
  aligned_dest_end = dest_end & -4 | 0; //@line 9840
  block_aligned_dest_end = aligned_dest_end - 64 | 0; //@line 9841
  while ((dest | 0) <= (block_aligned_dest_end | 0)) {
   HEAP32[dest >> 2] = HEAP32[src >> 2]; //@line 9843
   HEAP32[dest + 4 >> 2] = HEAP32[src + 4 >> 2]; //@line 9844
   HEAP32[dest + 8 >> 2] = HEAP32[src + 8 >> 2]; //@line 9845
   HEAP32[dest + 12 >> 2] = HEAP32[src + 12 >> 2]; //@line 9846
   HEAP32[dest + 16 >> 2] = HEAP32[src + 16 >> 2]; //@line 9847
   HEAP32[dest + 20 >> 2] = HEAP32[src + 20 >> 2]; //@line 9848
   HEAP32[dest + 24 >> 2] = HEAP32[src + 24 >> 2]; //@line 9849
   HEAP32[dest + 28 >> 2] = HEAP32[src + 28 >> 2]; //@line 9850
   HEAP32[dest + 32 >> 2] = HEAP32[src + 32 >> 2]; //@line 9851
   HEAP32[dest + 36 >> 2] = HEAP32[src + 36 >> 2]; //@line 9852
   HEAP32[dest + 40 >> 2] = HEAP32[src + 40 >> 2]; //@line 9853
   HEAP32[dest + 44 >> 2] = HEAP32[src + 44 >> 2]; //@line 9854
   HEAP32[dest + 48 >> 2] = HEAP32[src + 48 >> 2]; //@line 9855
   HEAP32[dest + 52 >> 2] = HEAP32[src + 52 >> 2]; //@line 9856
   HEAP32[dest + 56 >> 2] = HEAP32[src + 56 >> 2]; //@line 9857
   HEAP32[dest + 60 >> 2] = HEAP32[src + 60 >> 2]; //@line 9858
   dest = dest + 64 | 0; //@line 9859
   src = src + 64 | 0; //@line 9860
  }
  while ((dest | 0) < (aligned_dest_end | 0)) {
   HEAP32[dest >> 2] = HEAP32[src >> 2]; //@line 9863
   dest = dest + 4 | 0; //@line 9864
   src = src + 4 | 0; //@line 9865
  }
 } else {
  aligned_dest_end = dest_end - 4 | 0; //@line 9869
  while ((dest | 0) < (aligned_dest_end | 0)) {
   HEAP8[dest >> 0] = HEAP8[src >> 0] | 0; //@line 9871
   HEAP8[dest + 1 >> 0] = HEAP8[src + 1 >> 0] | 0; //@line 9872
   HEAP8[dest + 2 >> 0] = HEAP8[src + 2 >> 0] | 0; //@line 9873
   HEAP8[dest + 3 >> 0] = HEAP8[src + 3 >> 0] | 0; //@line 9874
   dest = dest + 4 | 0; //@line 9875
   src = src + 4 | 0; //@line 9876
  }
 }
 while ((dest | 0) < (dest_end | 0)) {
  HEAP8[dest >> 0] = HEAP8[src >> 0] | 0; //@line 9881
  dest = dest + 1 | 0; //@line 9882
  src = src + 1 | 0; //@line 9883
 }
 return ret | 0; //@line 9885
}
function _equeue_alloc($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0 = 0, $$038$sink$i = 0, $$03842$i = 0, $$1$i9 = 0, $10 = 0, $11 = 0, $14 = 0, $17 = 0, $20 = 0, $21 = 0, $23 = 0, $24 = 0, $26 = 0, $27 = 0, $8 = 0, $9 = 0, $AsyncCtx = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 680
 do {
  if (HEAP8[$0 + 184 >> 0] | 0) {
   $AsyncCtx = _emscripten_alloc_async_context(12, sp) | 0; //@line 686
   _wait_ms(10); //@line 687
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 26; //@line 690
    HEAP32[$AsyncCtx + 4 >> 2] = $1; //@line 692
    HEAP32[$AsyncCtx + 8 >> 2] = $0; //@line 694
    sp = STACKTOP; //@line 695
    return 0; //@line 696
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 698
    break;
   }
  }
 } while (0);
 $8 = $1 + 39 & -4; //@line 704
 $9 = $0 + 156 | 0; //@line 705
 _equeue_mutex_lock($9); //@line 706
 $10 = $0 + 24 | 0; //@line 707
 $11 = HEAP32[$10 >> 2] | 0; //@line 708
 L7 : do {
  if (!$11) {
   label = 11; //@line 712
  } else {
   $$03842$i = $10; //@line 714
   $14 = $11; //@line 714
   while (1) {
    if ((HEAP32[$14 >> 2] | 0) >>> 0 >= $8 >>> 0) {
     break;
    }
    $20 = $14 + 8 | 0; //@line 721
    $21 = HEAP32[$20 >> 2] | 0; //@line 722
    if (!$21) {
     label = 11; //@line 725
     break L7;
    } else {
     $$03842$i = $20; //@line 728
     $14 = $21; //@line 728
    }
   }
   $17 = HEAP32[$14 + 12 >> 2] | 0; //@line 732
   if (!$17) {
    $$038$sink$i = $$03842$i; //@line 735
   } else {
    HEAP32[$$03842$i >> 2] = $17; //@line 737
    $$038$sink$i = $17 + 8 | 0; //@line 739
   }
   HEAP32[$$038$sink$i >> 2] = HEAP32[$14 + 8 >> 2]; //@line 743
   _equeue_mutex_unlock($9); //@line 744
   $$1$i9 = $14; //@line 745
  }
 } while (0);
 do {
  if ((label | 0) == 11) {
   $23 = $0 + 28 | 0; //@line 750
   $24 = HEAP32[$23 >> 2] | 0; //@line 751
   if ($24 >>> 0 < $8 >>> 0) {
    _equeue_mutex_unlock($9); //@line 754
    $$0 = 0; //@line 755
    return $$0 | 0; //@line 756
   } else {
    $26 = $0 + 32 | 0; //@line 758
    $27 = HEAP32[$26 >> 2] | 0; //@line 759
    HEAP32[$26 >> 2] = $27 + $8; //@line 761
    HEAP32[$23 >> 2] = $24 - $8; //@line 763
    HEAP32[$27 >> 2] = $8; //@line 764
    HEAP8[$27 + 4 >> 0] = 1; //@line 766
    _equeue_mutex_unlock($9); //@line 767
    if (!$27) {
     $$0 = 0; //@line 770
    } else {
     $$1$i9 = $27; //@line 772
     break;
    }
    return $$0 | 0; //@line 775
   }
  }
 } while (0);
 HEAP32[$$1$i9 + 20 >> 2] = 0; //@line 780
 HEAP32[$$1$i9 + 24 >> 2] = -1; //@line 782
 HEAP32[$$1$i9 + 28 >> 2] = 0; //@line 784
 $$0 = $$1$i9 + 36 | 0; //@line 786
 return $$0 | 0; //@line 787
}
function __ZN20SimulatorBlockDevice5eraseEyy__async_cb_63($0) {
 $0 = $0 | 0;
 var $11 = 0, $14 = 0, $16 = 0, $18 = 0, $2 = 0, $21 = 0, $23 = 0, $25 = 0, $30 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $7 = 0, $9 = 0, $ReallocAsyncCtx4 = 0, sp = 0;
 sp = STACKTOP; //@line 8622
 $2 = $0 + 8 | 0; //@line 8624
 $7 = HEAP32[$2 + 4 >> 2] | 0; //@line 8629
 $9 = $0 + 16 | 0; //@line 8631
 $11 = HEAP32[$9 >> 2] | 0; //@line 8633
 $14 = HEAP32[$9 + 4 >> 2] | 0; //@line 8636
 $16 = $0 + 24 | 0; //@line 8638
 $18 = HEAP32[$16 >> 2] | 0; //@line 8640
 $21 = HEAP32[$16 + 4 >> 2] | 0; //@line 8643
 $23 = HEAP32[$0 + 32 >> 2] | 0; //@line 8645
 $25 = ___async_retval; //@line 8647
 $30 = HEAP32[$25 + 4 >> 2] | 0; //@line 8652
 if (!($7 >>> 0 > $30 >>> 0 | (($7 | 0) == ($30 | 0) ? (HEAP32[$2 >> 2] | 0) >>> 0 > (HEAP32[$25 >> 2] | 0) >>> 0 : 0))) {
  _emscripten_asm_const_iiii(10, HEAP32[$23 + 4 >> 2] | 0, $11 | 0, $18 | 0) | 0; //@line 8661
  HEAP32[___async_retval >> 2] = 0; //@line 8663
  return;
 }
 $ReallocAsyncCtx4 = _emscripten_realloc_async_context(32) | 0; //@line 8666
 _mbed_assert_internal(1851, 1878, 113); //@line 8667
 if (___async) {
  HEAP32[$ReallocAsyncCtx4 >> 2] = 87; //@line 8670
  $36 = $ReallocAsyncCtx4 + 8 | 0; //@line 8671
  $37 = $36; //@line 8672
  $38 = $37; //@line 8673
  HEAP32[$38 >> 2] = $11; //@line 8674
  $39 = $37 + 4 | 0; //@line 8675
  $40 = $39; //@line 8676
  HEAP32[$40 >> 2] = $14; //@line 8677
  $41 = $ReallocAsyncCtx4 + 16 | 0; //@line 8678
  $42 = $41; //@line 8679
  $43 = $42; //@line 8680
  HEAP32[$43 >> 2] = $18; //@line 8681
  $44 = $42 + 4 | 0; //@line 8682
  $45 = $44; //@line 8683
  HEAP32[$45 >> 2] = $21; //@line 8684
  $46 = $ReallocAsyncCtx4 + 24 | 0; //@line 8685
  HEAP32[$46 >> 2] = $23; //@line 8686
  sp = STACKTOP; //@line 8687
  return;
 }
 ___async_unwind = 0; //@line 8690
 HEAP32[$ReallocAsyncCtx4 >> 2] = 87; //@line 8691
 $36 = $ReallocAsyncCtx4 + 8 | 0; //@line 8692
 $37 = $36; //@line 8693
 $38 = $37; //@line 8694
 HEAP32[$38 >> 2] = $11; //@line 8695
 $39 = $37 + 4 | 0; //@line 8696
 $40 = $39; //@line 8697
 HEAP32[$40 >> 2] = $14; //@line 8698
 $41 = $ReallocAsyncCtx4 + 16 | 0; //@line 8699
 $42 = $41; //@line 8700
 $43 = $42; //@line 8701
 HEAP32[$43 >> 2] = $18; //@line 8702
 $44 = $42 + 4 | 0; //@line 8703
 $45 = $44; //@line 8704
 HEAP32[$45 >> 2] = $21; //@line 8705
 $46 = $ReallocAsyncCtx4 + 24 | 0; //@line 8706
 HEAP32[$46 >> 2] = $23; //@line 8707
 sp = STACKTOP; //@line 8708
 return;
}
function __ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$0 = 0, $$2 = 0, $17 = 0, $18 = 0, $3 = 0, $6 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, dest = 0, sp = 0, stop = 0;
 sp = STACKTOP; //@line 12677
 STACKTOP = STACKTOP + 64 | 0; //@line 12678
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(64); //@line 12678
 $3 = sp; //@line 12679
 if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, $1, 0) | 0) {
  $$2 = 1; //@line 12682
 } else {
  if (!$1) {
   $$2 = 0; //@line 12686
  } else {
   $AsyncCtx3 = _emscripten_alloc_async_context(16, sp) | 0; //@line 12688
   $6 = ___dynamic_cast($1, 88, 72, 0) | 0; //@line 12689
   if (___async) {
    HEAP32[$AsyncCtx3 >> 2] = 132; //@line 12692
    HEAP32[$AsyncCtx3 + 4 >> 2] = $3; //@line 12694
    HEAP32[$AsyncCtx3 + 8 >> 2] = $0; //@line 12696
    HEAP32[$AsyncCtx3 + 12 >> 2] = $2; //@line 12698
    sp = STACKTOP; //@line 12699
    STACKTOP = sp; //@line 12700
    return 0; //@line 12700
   }
   _emscripten_free_async_context($AsyncCtx3 | 0); //@line 12702
   if (!$6) {
    $$2 = 0; //@line 12705
   } else {
    dest = $3 + 4 | 0; //@line 12708
    stop = dest + 52 | 0; //@line 12708
    do {
     HEAP32[dest >> 2] = 0; //@line 12708
     dest = dest + 4 | 0; //@line 12708
    } while ((dest | 0) < (stop | 0));
    HEAP32[$3 >> 2] = $6; //@line 12709
    HEAP32[$3 + 8 >> 2] = $0; //@line 12711
    HEAP32[$3 + 12 >> 2] = -1; //@line 12713
    HEAP32[$3 + 48 >> 2] = 1; //@line 12715
    $17 = HEAP32[(HEAP32[$6 >> 2] | 0) + 28 >> 2] | 0; //@line 12718
    $18 = HEAP32[$2 >> 2] | 0; //@line 12719
    $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 12720
    FUNCTION_TABLE_viiii[$17 & 3]($6, $3, $18, 1); //@line 12721
    if (___async) {
     HEAP32[$AsyncCtx >> 2] = 133; //@line 12724
     HEAP32[$AsyncCtx + 4 >> 2] = $3; //@line 12726
     HEAP32[$AsyncCtx + 8 >> 2] = $2; //@line 12728
     HEAP32[$AsyncCtx + 12 >> 2] = $3; //@line 12730
     sp = STACKTOP; //@line 12731
     STACKTOP = sp; //@line 12732
     return 0; //@line 12732
    }
    _emscripten_free_async_context($AsyncCtx | 0); //@line 12734
    if ((HEAP32[$3 + 24 >> 2] | 0) == 1) {
     HEAP32[$2 >> 2] = HEAP32[$3 + 16 >> 2]; //@line 12741
     $$0 = 1; //@line 12742
    } else {
     $$0 = 0; //@line 12744
    }
    $$2 = $$0; //@line 12746
   }
  }
 }
 STACKTOP = sp; //@line 12750
 return $$2 | 0; //@line 12750
}
function _vsnprintf($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $$$015 = 0, $$0 = 0, $$014 = 0, $$015 = 0, $11 = 0, $14 = 0, $16 = 0, $17 = 0, $19 = 0, $26 = 0, $4 = 0, $5 = 0, $AsyncCtx = 0, dest = 0, label = 0, sp = 0, src = 0, stop = 0;
 sp = STACKTOP; //@line 12199
 STACKTOP = STACKTOP + 128 | 0; //@line 12200
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(128); //@line 12200
 $4 = sp + 124 | 0; //@line 12201
 $5 = sp; //@line 12202
 dest = $5; //@line 12203
 src = 840; //@line 12203
 stop = dest + 124 | 0; //@line 12203
 do {
  HEAP32[dest >> 2] = HEAP32[src >> 2]; //@line 12203
  dest = dest + 4 | 0; //@line 12203
  src = src + 4 | 0; //@line 12203
 } while ((dest | 0) < (stop | 0));
 if (($1 + -1 | 0) >>> 0 > 2147483646) {
  if (!$1) {
   $$014 = $4; //@line 12209
   $$015 = 1; //@line 12209
   label = 4; //@line 12210
  } else {
   HEAP32[(___errno_location() | 0) >> 2] = 75; //@line 12213
   $$0 = -1; //@line 12214
  }
 } else {
  $$014 = $0; //@line 12217
  $$015 = $1; //@line 12217
  label = 4; //@line 12218
 }
 if ((label | 0) == 4) {
  $11 = -2 - $$014 | 0; //@line 12222
  $$$015 = $$015 >>> 0 > $11 >>> 0 ? $11 : $$015; //@line 12224
  HEAP32[$5 + 48 >> 2] = $$$015; //@line 12226
  $14 = $5 + 20 | 0; //@line 12227
  HEAP32[$14 >> 2] = $$014; //@line 12228
  HEAP32[$5 + 44 >> 2] = $$014; //@line 12230
  $16 = $$014 + $$$015 | 0; //@line 12231
  $17 = $5 + 16 | 0; //@line 12232
  HEAP32[$17 >> 2] = $16; //@line 12233
  HEAP32[$5 + 28 >> 2] = $16; //@line 12235
  $AsyncCtx = _emscripten_alloc_async_context(24, sp) | 0; //@line 12236
  $19 = _vfprintf($5, $2, $3) | 0; //@line 12237
  if (___async) {
   HEAP32[$AsyncCtx >> 2] = 123; //@line 12240
   HEAP32[$AsyncCtx + 4 >> 2] = $$$015; //@line 12242
   HEAP32[$AsyncCtx + 8 >> 2] = $5; //@line 12244
   HEAP32[$AsyncCtx + 12 >> 2] = $4; //@line 12246
   HEAP32[$AsyncCtx + 16 >> 2] = $14; //@line 12248
   HEAP32[$AsyncCtx + 20 >> 2] = $17; //@line 12250
   sp = STACKTOP; //@line 12251
   STACKTOP = sp; //@line 12252
   return 0; //@line 12252
  }
  _emscripten_free_async_context($AsyncCtx | 0); //@line 12254
  if (!$$$015) {
   $$0 = $19; //@line 12257
  } else {
   $26 = HEAP32[$14 >> 2] | 0; //@line 12259
   HEAP8[$26 + ((($26 | 0) == (HEAP32[$17 >> 2] | 0)) << 31 >> 31) >> 0] = 0; //@line 12264
   $$0 = $19; //@line 12265
  }
 }
 STACKTOP = sp; //@line 12268
 return $$0 | 0; //@line 12268
}
function _equeue_alloc__async_cb($0) {
 $0 = $0 | 0;
 var $$0 = 0, $$038$sink$i = 0, $$03842$i = 0, $$1$i9 = 0, $12 = 0, $15 = 0, $18 = 0, $19 = 0, $21 = 0, $22 = 0, $24 = 0, $25 = 0, $34 = 0, $4 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0;
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 9190
 $6 = (HEAP32[$0 + 4 >> 2] | 0) + 39 & -4; //@line 9192
 $7 = $4 + 156 | 0; //@line 9193
 _equeue_mutex_lock($7); //@line 9194
 $8 = $4 + 24 | 0; //@line 9195
 $9 = HEAP32[$8 >> 2] | 0; //@line 9196
 L3 : do {
  if (!$9) {
   label = 9; //@line 9200
  } else {
   $$03842$i = $8; //@line 9202
   $12 = $9; //@line 9202
   while (1) {
    if ((HEAP32[$12 >> 2] | 0) >>> 0 >= $6 >>> 0) {
     break;
    }
    $18 = $12 + 8 | 0; //@line 9209
    $19 = HEAP32[$18 >> 2] | 0; //@line 9210
    if (!$19) {
     label = 9; //@line 9213
     break L3;
    } else {
     $$03842$i = $18; //@line 9216
     $12 = $19; //@line 9216
    }
   }
   $15 = HEAP32[$12 + 12 >> 2] | 0; //@line 9220
   if (!$15) {
    $$038$sink$i = $$03842$i; //@line 9223
   } else {
    HEAP32[$$03842$i >> 2] = $15; //@line 9225
    $$038$sink$i = $15 + 8 | 0; //@line 9227
   }
   HEAP32[$$038$sink$i >> 2] = HEAP32[$12 + 8 >> 2]; //@line 9231
   _equeue_mutex_unlock($7); //@line 9232
   $$1$i9 = $12; //@line 9233
  }
 } while (0);
 do {
  if ((label | 0) == 9) {
   $21 = $4 + 28 | 0; //@line 9238
   $22 = HEAP32[$21 >> 2] | 0; //@line 9239
   if ($22 >>> 0 < $6 >>> 0) {
    _equeue_mutex_unlock($7); //@line 9242
    $$0 = 0; //@line 9243
    $34 = ___async_retval; //@line 9244
    HEAP32[$34 >> 2] = $$0; //@line 9245
    return;
   } else {
    $24 = $4 + 32 | 0; //@line 9248
    $25 = HEAP32[$24 >> 2] | 0; //@line 9249
    HEAP32[$24 >> 2] = $25 + $6; //@line 9251
    HEAP32[$21 >> 2] = $22 - $6; //@line 9253
    HEAP32[$25 >> 2] = $6; //@line 9254
    HEAP8[$25 + 4 >> 0] = 1; //@line 9256
    _equeue_mutex_unlock($7); //@line 9257
    if (!$25) {
     $$0 = 0; //@line 9260
    } else {
     $$1$i9 = $25; //@line 9262
     break;
    }
    $34 = ___async_retval; //@line 9265
    HEAP32[$34 >> 2] = $$0; //@line 9266
    return;
   }
  }
 } while (0);
 HEAP32[$$1$i9 + 20 >> 2] = 0; //@line 9272
 HEAP32[$$1$i9 + 24 >> 2] = -1; //@line 9274
 HEAP32[$$1$i9 + 28 >> 2] = 0; //@line 9276
 $$0 = $$1$i9 + 36 | 0; //@line 9278
 $34 = ___async_retval; //@line 9279
 HEAP32[$34 >> 2] = $$0; //@line 9280
 return;
}
function __ZNK10__cxxabiv121__vmi_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $$0 = 0, $10 = 0, $19 = 0, $28 = 0, $9 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 636
 L1 : do {
  if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, 0) | 0) {
   __ZNK10__cxxabiv117__class_type_info24process_found_base_classEPNS_19__dynamic_cast_infoEPvi(0, $1, $2, $3); //@line 642
  } else {
   $9 = HEAP32[$0 + 12 >> 2] | 0; //@line 646
   $10 = $0 + 16 + ($9 << 3) | 0; //@line 647
   $AsyncCtx3 = _emscripten_alloc_async_context(28, sp) | 0; //@line 648
   __ZNK10__cxxabiv122__base_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($0 + 16 | 0, $1, $2, $3); //@line 649
   if (___async) {
    HEAP32[$AsyncCtx3 >> 2] = 149; //@line 652
    HEAP32[$AsyncCtx3 + 4 >> 2] = $9; //@line 654
    HEAP32[$AsyncCtx3 + 8 >> 2] = $0; //@line 656
    HEAP32[$AsyncCtx3 + 12 >> 2] = $1; //@line 658
    HEAP32[$AsyncCtx3 + 16 >> 2] = $2; //@line 660
    HEAP32[$AsyncCtx3 + 20 >> 2] = $3; //@line 662
    HEAP32[$AsyncCtx3 + 24 >> 2] = $10; //@line 664
    sp = STACKTOP; //@line 665
    return;
   }
   _emscripten_free_async_context($AsyncCtx3 | 0); //@line 668
   if (($9 | 0) > 1) {
    $19 = $1 + 54 | 0; //@line 672
    $$0 = $0 + 24 | 0; //@line 673
    while (1) {
     $AsyncCtx = _emscripten_alloc_async_context(28, sp) | 0; //@line 675
     __ZNK10__cxxabiv122__base_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($$0, $1, $2, $3); //@line 676
     if (___async) {
      break;
     }
     _emscripten_free_async_context($AsyncCtx | 0); //@line 681
     if (HEAP8[$19 >> 0] | 0) {
      break L1;
     }
     $28 = $$0 + 8 | 0; //@line 687
     if ($28 >>> 0 < $10 >>> 0) {
      $$0 = $28; //@line 690
     } else {
      break L1;
     }
    }
    HEAP32[$AsyncCtx >> 2] = 150; //@line 695
    HEAP32[$AsyncCtx + 4 >> 2] = $19; //@line 697
    HEAP32[$AsyncCtx + 8 >> 2] = $$0; //@line 699
    HEAP32[$AsyncCtx + 12 >> 2] = $10; //@line 701
    HEAP32[$AsyncCtx + 16 >> 2] = $1; //@line 703
    HEAP32[$AsyncCtx + 20 >> 2] = $2; //@line 705
    HEAP32[$AsyncCtx + 24 >> 2] = $3; //@line 707
    sp = STACKTOP; //@line 708
    return;
   }
  }
 } while (0);
 return;
}
function _equeue_dealloc($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$02329$i = 0, $$02330$i = 0, $$025$i = 0, $$sink$in$i = 0, $$sink21$i = 0, $10 = 0, $11 = 0, $13 = 0, $14 = 0, $15 = 0, $17 = 0, $18 = 0, $2 = 0, $25 = 0, $4 = 0, $9 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 794
 $2 = $1 + -36 | 0; //@line 795
 $4 = HEAP32[$1 + -8 >> 2] | 0; //@line 797
 do {
  if ($4 | 0) {
   $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 801
   FUNCTION_TABLE_vi[$4 & 255]($1); //@line 802
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 27; //@line 805
    HEAP32[$AsyncCtx + 4 >> 2] = $0; //@line 807
    HEAP32[$AsyncCtx + 8 >> 2] = $1; //@line 809
    HEAP32[$AsyncCtx + 12 >> 2] = $2; //@line 811
    sp = STACKTOP; //@line 812
    return;
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 815
    break;
   }
  }
 } while (0);
 $9 = $0 + 156 | 0; //@line 820
 _equeue_mutex_lock($9); //@line 821
 $10 = $0 + 24 | 0; //@line 822
 $11 = HEAP32[$10 >> 2] | 0; //@line 823
 L7 : do {
  if (!$11) {
   $$02329$i = $10; //@line 827
  } else {
   $13 = HEAP32[$2 >> 2] | 0; //@line 829
   $$025$i = $10; //@line 830
   $15 = $11; //@line 830
   while (1) {
    $14 = HEAP32[$15 >> 2] | 0; //@line 832
    if ($14 >>> 0 >= $13 >>> 0) {
     break;
    }
    $17 = $15 + 8 | 0; //@line 837
    $18 = HEAP32[$17 >> 2] | 0; //@line 838
    if (!$18) {
     $$02329$i = $17; //@line 841
     break L7;
    } else {
     $$025$i = $17; //@line 844
     $15 = $18; //@line 844
    }
   }
   if (($14 | 0) == ($13 | 0)) {
    HEAP32[$1 + -24 >> 2] = $15; //@line 850
    $$02330$i = $$025$i; //@line 853
    $$sink$in$i = (HEAP32[$$025$i >> 2] | 0) + 8 | 0; //@line 853
    $$sink21$i = HEAP32[$$sink$in$i >> 2] | 0; //@line 854
    $25 = $1 + -28 | 0; //@line 855
    HEAP32[$25 >> 2] = $$sink21$i; //@line 856
    HEAP32[$$02330$i >> 2] = $2; //@line 857
    _equeue_mutex_unlock($9); //@line 858
    return;
   } else {
    $$02329$i = $$025$i; //@line 861
   }
  }
 } while (0);
 HEAP32[$1 + -24 >> 2] = 0; //@line 866
 $$02330$i = $$02329$i; //@line 867
 $$sink$in$i = $$02329$i; //@line 867
 $$sink21$i = HEAP32[$$sink$in$i >> 2] | 0; //@line 868
 $25 = $1 + -28 | 0; //@line 869
 HEAP32[$25 >> 2] = $$sink21$i; //@line 870
 HEAP32[$$02330$i >> 2] = $2; //@line 871
 _equeue_mutex_unlock($9); //@line 872
 return;
}
function _fputc($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0 = 0, $13 = 0, $14 = 0, $19 = 0, $20 = 0, $21 = 0, $26 = 0, $27 = 0, $32 = 0, $34 = 0, $7 = 0, $8 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 12319
 if ((HEAP32[$1 + 76 >> 2] | 0) < 0) {
  label = 3; //@line 12324
 } else {
  if (!(___lockfile($1) | 0)) {
   label = 3; //@line 12329
  } else {
   $20 = $0 & 255; //@line 12331
   $21 = $0 & 255; //@line 12332
   if (($21 | 0) == (HEAP8[$1 + 75 >> 0] | 0)) {
    label = 12; //@line 12338
   } else {
    $26 = $1 + 20 | 0; //@line 12340
    $27 = HEAP32[$26 >> 2] | 0; //@line 12341
    if ($27 >>> 0 < (HEAP32[$1 + 16 >> 2] | 0) >>> 0) {
     HEAP32[$26 >> 2] = $27 + 1; //@line 12347
     HEAP8[$27 >> 0] = $20; //@line 12348
     $34 = $21; //@line 12349
    } else {
     label = 12; //@line 12351
    }
   }
   do {
    if ((label | 0) == 12) {
     $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 12356
     $32 = ___overflow($1, $0) | 0; //@line 12357
     if (___async) {
      HEAP32[$AsyncCtx >> 2] = 126; //@line 12360
      HEAP32[$AsyncCtx + 4 >> 2] = $1; //@line 12362
      sp = STACKTOP; //@line 12363
      return 0; //@line 12364
     } else {
      _emscripten_free_async_context($AsyncCtx | 0); //@line 12366
      $34 = $32; //@line 12367
      break;
     }
    }
   } while (0);
   ___unlockfile($1); //@line 12372
   $$0 = $34; //@line 12373
  }
 }
 do {
  if ((label | 0) == 3) {
   $7 = $0 & 255; //@line 12378
   $8 = $0 & 255; //@line 12379
   if (($8 | 0) != (HEAP8[$1 + 75 >> 0] | 0)) {
    $13 = $1 + 20 | 0; //@line 12385
    $14 = HEAP32[$13 >> 2] | 0; //@line 12386
    if ($14 >>> 0 < (HEAP32[$1 + 16 >> 2] | 0) >>> 0) {
     HEAP32[$13 >> 2] = $14 + 1; //@line 12392
     HEAP8[$14 >> 0] = $7; //@line 12393
     $$0 = $8; //@line 12394
     break;
    }
   }
   $AsyncCtx3 = _emscripten_alloc_async_context(4, sp) | 0; //@line 12398
   $19 = ___overflow($1, $0) | 0; //@line 12399
   if (___async) {
    HEAP32[$AsyncCtx3 >> 2] = 125; //@line 12402
    sp = STACKTOP; //@line 12403
    return 0; //@line 12404
   } else {
    _emscripten_free_async_context($AsyncCtx3 | 0); //@line 12406
    $$0 = $19; //@line 12407
    break;
   }
  }
 } while (0);
 return $$0 | 0; //@line 12412
}
function ___mo_lookup($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$090 = 0, $$094 = 0, $$4 = 0, $10 = 0, $13 = 0, $17 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $31 = 0, $35 = 0, $4 = 0, $44 = 0, $46 = 0, $49 = 0, $53 = 0, $63 = 0, $7 = 0;
 $4 = (HEAP32[$0 >> 2] | 0) + 1794895138 | 0; //@line 8188
 $7 = _swapc(HEAP32[$0 + 8 >> 2] | 0, $4) | 0; //@line 8191
 $10 = _swapc(HEAP32[$0 + 12 >> 2] | 0, $4) | 0; //@line 8194
 $13 = _swapc(HEAP32[$0 + 16 >> 2] | 0, $4) | 0; //@line 8197
 L1 : do {
  if ($7 >>> 0 < $1 >>> 2 >>> 0) {
   $17 = $1 - ($7 << 2) | 0; //@line 8203
   if ($10 >>> 0 < $17 >>> 0 & $13 >>> 0 < $17 >>> 0) {
    if (!(($13 | $10) & 3)) {
     $23 = $10 >>> 2; //@line 8212
     $24 = $13 >>> 2; //@line 8213
     $$090 = 0; //@line 8214
     $$094 = $7; //@line 8214
     while (1) {
      $25 = $$094 >>> 1; //@line 8216
      $26 = $$090 + $25 | 0; //@line 8217
      $27 = $26 << 1; //@line 8218
      $28 = $27 + $23 | 0; //@line 8219
      $31 = _swapc(HEAP32[$0 + ($28 << 2) >> 2] | 0, $4) | 0; //@line 8222
      $35 = _swapc(HEAP32[$0 + ($28 + 1 << 2) >> 2] | 0, $4) | 0; //@line 8226
      if (!($35 >>> 0 < $1 >>> 0 & $31 >>> 0 < ($1 - $35 | 0) >>> 0)) {
       $$4 = 0; //@line 8232
       break L1;
      }
      if (HEAP8[$0 + ($35 + $31) >> 0] | 0) {
       $$4 = 0; //@line 8240
       break L1;
      }
      $44 = _strcmp($2, $0 + $35 | 0) | 0; //@line 8244
      if (!$44) {
       break;
      }
      $63 = ($44 | 0) < 0; //@line 8250
      if (($$094 | 0) == 1) {
       $$4 = 0; //@line 8255
       break L1;
      } else {
       $$090 = $63 ? $$090 : $26; //@line 8258
       $$094 = $63 ? $25 : $$094 - $25 | 0; //@line 8258
      }
     }
     $46 = $27 + $24 | 0; //@line 8261
     $49 = _swapc(HEAP32[$0 + ($46 << 2) >> 2] | 0, $4) | 0; //@line 8264
     $53 = _swapc(HEAP32[$0 + ($46 + 1 << 2) >> 2] | 0, $4) | 0; //@line 8268
     if ($53 >>> 0 < $1 >>> 0 & $49 >>> 0 < ($1 - $53 | 0) >>> 0) {
      $$4 = (HEAP8[$0 + ($53 + $49) >> 0] | 0) == 0 ? $0 + $53 | 0 : 0; //@line 8280
     } else {
      $$4 = 0; //@line 8282
     }
    } else {
     $$4 = 0; //@line 8285
    }
   } else {
    $$4 = 0; //@line 8288
   }
  } else {
   $$4 = 0; //@line 8291
  }
 } while (0);
 return $$4 | 0; //@line 8294
}
function _putc($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0 = 0, $13 = 0, $14 = 0, $19 = 0, $20 = 0, $21 = 0, $26 = 0, $27 = 0, $32 = 0, $34 = 0, $7 = 0, $8 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 7853
 if ((HEAP32[$1 + 76 >> 2] | 0) < 0) {
  label = 3; //@line 7858
 } else {
  if (!(___lockfile($1) | 0)) {
   label = 3; //@line 7863
  } else {
   $20 = $0 & 255; //@line 7865
   $21 = $0 & 255; //@line 7866
   if (($21 | 0) == (HEAP8[$1 + 75 >> 0] | 0)) {
    label = 12; //@line 7872
   } else {
    $26 = $1 + 20 | 0; //@line 7874
    $27 = HEAP32[$26 >> 2] | 0; //@line 7875
    if ($27 >>> 0 < (HEAP32[$1 + 16 >> 2] | 0) >>> 0) {
     HEAP32[$26 >> 2] = $27 + 1; //@line 7881
     HEAP8[$27 >> 0] = $20; //@line 7882
     $34 = $21; //@line 7883
    } else {
     label = 12; //@line 7885
    }
   }
   do {
    if ((label | 0) == 12) {
     $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 7890
     $32 = ___overflow($1, $0) | 0; //@line 7891
     if (___async) {
      HEAP32[$AsyncCtx >> 2] = 113; //@line 7894
      HEAP32[$AsyncCtx + 4 >> 2] = $1; //@line 7896
      sp = STACKTOP; //@line 7897
      return 0; //@line 7898
     } else {
      _emscripten_free_async_context($AsyncCtx | 0); //@line 7900
      $34 = $32; //@line 7901
      break;
     }
    }
   } while (0);
   ___unlockfile($1); //@line 7906
   $$0 = $34; //@line 7907
  }
 }
 do {
  if ((label | 0) == 3) {
   $7 = $0 & 255; //@line 7912
   $8 = $0 & 255; //@line 7913
   if (($8 | 0) != (HEAP8[$1 + 75 >> 0] | 0)) {
    $13 = $1 + 20 | 0; //@line 7919
    $14 = HEAP32[$13 >> 2] | 0; //@line 7920
    if ($14 >>> 0 < (HEAP32[$1 + 16 >> 2] | 0) >>> 0) {
     HEAP32[$13 >> 2] = $14 + 1; //@line 7926
     HEAP8[$14 >> 0] = $7; //@line 7927
     $$0 = $8; //@line 7928
     break;
    }
   }
   $AsyncCtx3 = _emscripten_alloc_async_context(4, sp) | 0; //@line 7932
   $19 = ___overflow($1, $0) | 0; //@line 7933
   if (___async) {
    HEAP32[$AsyncCtx3 >> 2] = 112; //@line 7936
    sp = STACKTOP; //@line 7937
    return 0; //@line 7938
   } else {
    _emscripten_free_async_context($AsyncCtx3 | 0); //@line 7940
    $$0 = $19; //@line 7941
    break;
   }
  }
 } while (0);
 return $$0 | 0; //@line 7946
}
function ___fflush_unlocked($0) {
 $0 = $0 | 0;
 var $$0 = 0, $1 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $22 = 0, $3 = 0, $7 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 8573
 $1 = $0 + 20 | 0; //@line 8574
 $3 = $0 + 28 | 0; //@line 8576
 do {
  if ((HEAP32[$1 >> 2] | 0) >>> 0 > (HEAP32[$3 >> 2] | 0) >>> 0) {
   $7 = HEAP32[$0 + 36 >> 2] | 0; //@line 8582
   $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 8583
   FUNCTION_TABLE_iiii[$7 & 7]($0, 0, 0) | 0; //@line 8584
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 119; //@line 8587
    HEAP32[$AsyncCtx + 4 >> 2] = $1; //@line 8589
    HEAP32[$AsyncCtx + 8 >> 2] = $0; //@line 8591
    HEAP32[$AsyncCtx + 12 >> 2] = $3; //@line 8593
    sp = STACKTOP; //@line 8594
    return 0; //@line 8595
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 8597
    if (!(HEAP32[$1 >> 2] | 0)) {
     $$0 = -1; //@line 8601
     break;
    } else {
     label = 5; //@line 8604
     break;
    }
   }
  } else {
   label = 5; //@line 8609
  }
 } while (0);
 if ((label | 0) == 5) {
  $13 = $0 + 4 | 0; //@line 8613
  $14 = HEAP32[$13 >> 2] | 0; //@line 8614
  $15 = $0 + 8 | 0; //@line 8615
  $16 = HEAP32[$15 >> 2] | 0; //@line 8616
  do {
   if ($14 >>> 0 < $16 >>> 0) {
    $22 = HEAP32[$0 + 40 >> 2] | 0; //@line 8624
    $AsyncCtx3 = _emscripten_alloc_async_context(24, sp) | 0; //@line 8625
    FUNCTION_TABLE_iiii[$22 & 7]($0, $14 - $16 | 0, 1) | 0; //@line 8626
    if (___async) {
     HEAP32[$AsyncCtx3 >> 2] = 120; //@line 8629
     HEAP32[$AsyncCtx3 + 4 >> 2] = $0; //@line 8631
     HEAP32[$AsyncCtx3 + 8 >> 2] = $3; //@line 8633
     HEAP32[$AsyncCtx3 + 12 >> 2] = $1; //@line 8635
     HEAP32[$AsyncCtx3 + 16 >> 2] = $15; //@line 8637
     HEAP32[$AsyncCtx3 + 20 >> 2] = $13; //@line 8639
     sp = STACKTOP; //@line 8640
     return 0; //@line 8641
    } else {
     _emscripten_free_async_context($AsyncCtx3 | 0); //@line 8643
     break;
    }
   }
  } while (0);
  HEAP32[$0 + 16 >> 2] = 0; //@line 8649
  HEAP32[$3 >> 2] = 0; //@line 8650
  HEAP32[$1 >> 2] = 0; //@line 8651
  HEAP32[$15 >> 2] = 0; //@line 8652
  HEAP32[$13 >> 2] = 0; //@line 8653
  $$0 = 0; //@line 8654
 }
 return $$0 | 0; //@line 8656
}
function __ZN16SX1276_LoRaRadio8rx_frameEPhjjhh($0, $1, $2, $3, $4, $5) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 $5 = $5 | 0;
 var $12 = 0, $15 = 0, $6 = 0, $7 = 0, $9 = 0, $vararg_buffer = 0, $vararg_buffer12 = 0, $vararg_buffer4 = 0, $vararg_buffer8 = 0, sp = 0;
 sp = STACKTOP; //@line 77
 STACKTOP = STACKTOP + 48 | 0; //@line 78
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(48); //@line 78
 $vararg_buffer12 = sp + 32 | 0; //@line 79
 $vararg_buffer8 = sp + 24 | 0; //@line 80
 $vararg_buffer4 = sp + 16 | 0; //@line 81
 $vararg_buffer = sp; //@line 82
 $6 = $4 & 255; //@line 83
 $7 = $5 & 255; //@line 84
 HEAP32[$vararg_buffer >> 2] = $2; //@line 85
 HEAP32[$vararg_buffer + 4 >> 2] = $3; //@line 87
 HEAP32[$vararg_buffer + 8 >> 2] = $6; //@line 89
 HEAP32[$vararg_buffer + 12 >> 2] = $7; //@line 91
 _mbed_tracef(16, 1111, 1116, $vararg_buffer); //@line 92
 $9 = HEAP32[$0 + 752 >> 2] | 0; //@line 94
 if (($9 | 0) != ($6 | 0)) {
  HEAP32[$vararg_buffer4 >> 2] = $9; //@line 97
  HEAP32[$vararg_buffer4 + 4 >> 2] = $6; //@line 99
  _mbed_tracef(16, 1111, 1157, $vararg_buffer4); //@line 100
  STACKTOP = sp; //@line 101
  return;
 }
 $12 = HEAP32[$0 + 756 >> 2] | 0; //@line 104
 if (($12 | 0) != ($7 | 0)) {
  HEAP32[$vararg_buffer8 >> 2] = $12; //@line 107
  HEAP32[$vararg_buffer8 + 4 >> 2] = $7; //@line 109
  _mbed_tracef(16, 1111, 1204, $vararg_buffer8); //@line 110
  STACKTOP = sp; //@line 111
  return;
 }
 $15 = HEAP32[$0 + 692 >> 2] | 0; //@line 114
 if (($15 | 0) == ($3 | 0)) {
  _memcpy($0 + 792 | 0, $1 | 0, $2 | 0) | 0; //@line 118
  HEAP8[$0 + 782 >> 0] = $2; //@line 121
  HEAP8[$0 + 781 >> 0] = -35; //@line 123
  HEAP8[$0 + 780 >> 0] = -5; //@line 125
  HEAP8[$0 + 783 >> 0] = 1; //@line 127
  HEAP32[$0 + 784 >> 2] = _emscripten_asm_const_i(0) | 0; //@line 130
  STACKTOP = sp; //@line 131
  return;
 } else {
  HEAP32[$vararg_buffer12 >> 2] = $15; //@line 133
  HEAP32[$vararg_buffer12 + 4 >> 2] = $3; //@line 135
  _mbed_tracef(16, 1111, 1251, $vararg_buffer12); //@line 136
  STACKTOP = sp; //@line 137
  return;
 }
}
function ___strchrnul($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0 = 0, $$029$lcssa = 0, $$02936 = 0, $$030$lcssa = 0, $$03039 = 0, $$1 = 0, $10 = 0, $13 = 0, $17 = 0, $18 = 0, $2 = 0, $24 = 0, $25 = 0, $31 = 0, $38 = 0, $39 = 0, $7 = 0;
 $2 = $1 & 255; //@line 8337
 L1 : do {
  if (!$2) {
   $$0 = $0 + (_strlen($0) | 0) | 0; //@line 8343
  } else {
   if (!($0 & 3)) {
    $$030$lcssa = $0; //@line 8349
   } else {
    $7 = $1 & 255; //@line 8351
    $$03039 = $0; //@line 8352
    while (1) {
     $10 = HEAP8[$$03039 >> 0] | 0; //@line 8354
     if ($10 << 24 >> 24 == 0 ? 1 : $10 << 24 >> 24 == $7 << 24 >> 24) {
      $$0 = $$03039; //@line 8359
      break L1;
     }
     $13 = $$03039 + 1 | 0; //@line 8362
     if (!($13 & 3)) {
      $$030$lcssa = $13; //@line 8367
      break;
     } else {
      $$03039 = $13; //@line 8370
     }
    }
   }
   $17 = Math_imul($2, 16843009) | 0; //@line 8374
   $18 = HEAP32[$$030$lcssa >> 2] | 0; //@line 8375
   L10 : do {
    if (!(($18 & -2139062144 ^ -2139062144) & $18 + -16843009)) {
     $$02936 = $$030$lcssa; //@line 8383
     $25 = $18; //@line 8383
     while (1) {
      $24 = $25 ^ $17; //@line 8385
      if (($24 & -2139062144 ^ -2139062144) & $24 + -16843009 | 0) {
       $$029$lcssa = $$02936; //@line 8392
       break L10;
      }
      $31 = $$02936 + 4 | 0; //@line 8395
      $25 = HEAP32[$31 >> 2] | 0; //@line 8396
      if (($25 & -2139062144 ^ -2139062144) & $25 + -16843009 | 0) {
       $$029$lcssa = $31; //@line 8405
       break;
      } else {
       $$02936 = $31; //@line 8403
      }
     }
    } else {
     $$029$lcssa = $$030$lcssa; //@line 8410
    }
   } while (0);
   $38 = $1 & 255; //@line 8413
   $$1 = $$029$lcssa; //@line 8414
   while (1) {
    $39 = HEAP8[$$1 >> 0] | 0; //@line 8416
    if ($39 << 24 >> 24 == 0 ? 1 : $39 << 24 >> 24 == $38 << 24 >> 24) {
     $$0 = $$1; //@line 8422
     break;
    } else {
     $$1 = $$1 + 1 | 0; //@line 8425
    }
   }
  }
 } while (0);
 return $$0 | 0; //@line 8430
}
function ___fwritex($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$038 = 0, $$1 = 0, $$139 = 0, $$141 = 0, $$143 = 0, $10 = 0, $12 = 0, $14 = 0, $22 = 0, $28 = 0, $3 = 0, $31 = 0, $4 = 0, $9 = 0, label = 0;
 $3 = $2 + 16 | 0; //@line 8079
 $4 = HEAP32[$3 >> 2] | 0; //@line 8080
 if (!$4) {
  if (!(___towrite($2) | 0)) {
   $12 = HEAP32[$3 >> 2] | 0; //@line 8087
   label = 5; //@line 8088
  } else {
   $$1 = 0; //@line 8090
  }
 } else {
  $12 = $4; //@line 8094
  label = 5; //@line 8095
 }
 L5 : do {
  if ((label | 0) == 5) {
   $9 = $2 + 20 | 0; //@line 8099
   $10 = HEAP32[$9 >> 2] | 0; //@line 8100
   $14 = $10; //@line 8103
   if (($12 - $10 | 0) >>> 0 < $1 >>> 0) {
    $$1 = FUNCTION_TABLE_iiii[HEAP32[$2 + 36 >> 2] & 7]($2, $0, $1) | 0; //@line 8108
    break;
   }
   L10 : do {
    if ((HEAP8[$2 + 75 >> 0] | 0) > -1) {
     $$038 = $1; //@line 8116
     while (1) {
      if (!$$038) {
       $$139 = 0; //@line 8120
       $$141 = $0; //@line 8120
       $$143 = $1; //@line 8120
       $31 = $14; //@line 8120
       break L10;
      }
      $22 = $$038 + -1 | 0; //@line 8123
      if ((HEAP8[$0 + $22 >> 0] | 0) == 10) {
       break;
      } else {
       $$038 = $22; //@line 8130
      }
     }
     $28 = FUNCTION_TABLE_iiii[HEAP32[$2 + 36 >> 2] & 7]($2, $0, $$038) | 0; //@line 8135
     if ($28 >>> 0 < $$038 >>> 0) {
      $$1 = $28; //@line 8138
      break L5;
     }
     $$139 = $$038; //@line 8144
     $$141 = $0 + $$038 | 0; //@line 8144
     $$143 = $1 - $$038 | 0; //@line 8144
     $31 = HEAP32[$9 >> 2] | 0; //@line 8144
    } else {
     $$139 = 0; //@line 8146
     $$141 = $0; //@line 8146
     $$143 = $1; //@line 8146
     $31 = $14; //@line 8146
    }
   } while (0);
   _memcpy($31 | 0, $$141 | 0, $$143 | 0) | 0; //@line 8149
   HEAP32[$9 >> 2] = (HEAP32[$9 >> 2] | 0) + $$143; //@line 8152
   $$1 = $$139 + $$143 | 0; //@line 8154
  }
 } while (0);
 return $$1 | 0; //@line 8157
}
function _equeue_dealloc__async_cb($0) {
 $0 = $0 | 0;
 var $$02329$i = 0, $$02330$i = 0, $$025$i = 0, $$sink$in$i = 0, $$sink21$i = 0, $11 = 0, $12 = 0, $13 = 0, $15 = 0, $16 = 0, $2 = 0, $23 = 0, $4 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0;
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 9387
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 9389
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 9391
 $7 = $2 + 156 | 0; //@line 9392
 _equeue_mutex_lock($7); //@line 9393
 $8 = $2 + 24 | 0; //@line 9394
 $9 = HEAP32[$8 >> 2] | 0; //@line 9395
 L3 : do {
  if (!$9) {
   $$02329$i = $8; //@line 9399
  } else {
   $11 = HEAP32[$6 >> 2] | 0; //@line 9401
   $$025$i = $8; //@line 9402
   $13 = $9; //@line 9402
   while (1) {
    $12 = HEAP32[$13 >> 2] | 0; //@line 9404
    if ($12 >>> 0 >= $11 >>> 0) {
     break;
    }
    $15 = $13 + 8 | 0; //@line 9409
    $16 = HEAP32[$15 >> 2] | 0; //@line 9410
    if (!$16) {
     $$02329$i = $15; //@line 9413
     break L3;
    } else {
     $$025$i = $15; //@line 9416
     $13 = $16; //@line 9416
    }
   }
   if (($12 | 0) == ($11 | 0)) {
    HEAP32[$4 + -24 >> 2] = $13; //@line 9422
    $$02330$i = $$025$i; //@line 9425
    $$sink$in$i = (HEAP32[$$025$i >> 2] | 0) + 8 | 0; //@line 9425
    $$sink21$i = HEAP32[$$sink$in$i >> 2] | 0; //@line 9426
    $23 = $4 + -28 | 0; //@line 9427
    HEAP32[$23 >> 2] = $$sink21$i; //@line 9428
    HEAP32[$$02330$i >> 2] = $6; //@line 9429
    _equeue_mutex_unlock($7); //@line 9430
    return;
   } else {
    $$02329$i = $$025$i; //@line 9433
   }
  }
 } while (0);
 HEAP32[$4 + -24 >> 2] = 0; //@line 9438
 $$02330$i = $$02329$i; //@line 9439
 $$sink$in$i = $$02329$i; //@line 9439
 $$sink21$i = HEAP32[$$sink$in$i >> 2] | 0; //@line 9440
 $23 = $4 + -28 | 0; //@line 9441
 HEAP32[$23 >> 2] = $$sink21$i; //@line 9442
 HEAP32[$$02330$i >> 2] = $6; //@line 9443
 _equeue_mutex_unlock($7); //@line 9444
 return;
}
function __ZN4mbed11InterruptIn4fallENS_8CallbackIFvvEEE__async_cb_4($0) {
 $0 = $0 | 0;
 var $$phi$trans$insert = 0, $$pre10 = 0, $10 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx4 = 0, sp = 0;
 sp = STACKTOP; //@line 1015
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 1019
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 1021
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 1023
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 1025
 $$phi$trans$insert = (HEAP32[$0 + 4 >> 2] | 0) + 12 | 0; //@line 1026
 $$pre10 = HEAP32[$$phi$trans$insert >> 2] | 0; //@line 1027
 if (!$$pre10) {
  HEAP32[$4 >> 2] = 0; //@line 1030
  _gpio_irq_set($10 + 28 | 0, 2, 0); //@line 1032
  return;
 }
 $13 = HEAP32[$$pre10 + 4 >> 2] | 0; //@line 1036
 $ReallocAsyncCtx4 = _emscripten_realloc_async_context(20) | 0; //@line 1037
 FUNCTION_TABLE_vii[$13 & 3]($6, $8); //@line 1038
 if (___async) {
  HEAP32[$ReallocAsyncCtx4 >> 2] = 23; //@line 1041
  $14 = $ReallocAsyncCtx4 + 4 | 0; //@line 1042
  HEAP32[$14 >> 2] = $$phi$trans$insert; //@line 1043
  $15 = $ReallocAsyncCtx4 + 8 | 0; //@line 1044
  HEAP32[$15 >> 2] = $4; //@line 1045
  $16 = $ReallocAsyncCtx4 + 12 | 0; //@line 1046
  HEAP32[$16 >> 2] = $8; //@line 1047
  $17 = $ReallocAsyncCtx4 + 16 | 0; //@line 1048
  HEAP32[$17 >> 2] = $10; //@line 1049
  sp = STACKTOP; //@line 1050
  return;
 }
 ___async_unwind = 0; //@line 1053
 HEAP32[$ReallocAsyncCtx4 >> 2] = 23; //@line 1054
 $14 = $ReallocAsyncCtx4 + 4 | 0; //@line 1055
 HEAP32[$14 >> 2] = $$phi$trans$insert; //@line 1056
 $15 = $ReallocAsyncCtx4 + 8 | 0; //@line 1057
 HEAP32[$15 >> 2] = $4; //@line 1058
 $16 = $ReallocAsyncCtx4 + 12 | 0; //@line 1059
 HEAP32[$16 >> 2] = $8; //@line 1060
 $17 = $ReallocAsyncCtx4 + 16 | 0; //@line 1061
 HEAP32[$17 >> 2] = $10; //@line 1062
 sp = STACKTOP; //@line 1063
 return;
}
function __ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_30($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $25 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 5547
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 5551
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 5553
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 5555
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 5557
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 5559
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 5561
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 5563
 $18 = HEAP8[$0 + 36 >> 0] & 1; //@line 5566
 $25 = (HEAP32[$0 + 4 >> 2] | 0) + 8 | 0; //@line 5567
 do {
  if ($25 >>> 0 < $4 >>> 0) {
   if (!(HEAP8[$6 >> 0] | 0)) {
    if ((HEAP32[$8 >> 2] | 0) == 1) {
     if ((HEAP32[$10 >> 2] | 0) == 1) {
      break;
     }
    }
    $ReallocAsyncCtx2 = _emscripten_realloc_async_context(40) | 0; //@line 5583
    __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($25, $12, $14, $16, $18); //@line 5584
    if (!___async) {
     ___async_unwind = 0; //@line 5587
    }
    HEAP32[$ReallocAsyncCtx2 >> 2] = 147; //@line 5589
    HEAP32[$ReallocAsyncCtx2 + 4 >> 2] = $25; //@line 5591
    HEAP32[$ReallocAsyncCtx2 + 8 >> 2] = $4; //@line 5593
    HEAP32[$ReallocAsyncCtx2 + 12 >> 2] = $6; //@line 5595
    HEAP32[$ReallocAsyncCtx2 + 16 >> 2] = $8; //@line 5597
    HEAP32[$ReallocAsyncCtx2 + 20 >> 2] = $10; //@line 5599
    HEAP32[$ReallocAsyncCtx2 + 24 >> 2] = $12; //@line 5601
    HEAP32[$ReallocAsyncCtx2 + 28 >> 2] = $14; //@line 5603
    HEAP32[$ReallocAsyncCtx2 + 32 >> 2] = $16; //@line 5605
    HEAP8[$ReallocAsyncCtx2 + 36 >> 0] = $18 & 1; //@line 5608
    sp = STACKTOP; //@line 5609
    return;
   }
  }
 } while (0);
 return;
}
function _main__async_cb_36($0) {
 $0 = $0 | 0;
 var $10 = 0, $11 = 0, $12 = 0, $2 = 0, $4 = 0, $6 = 0, $9 = 0, $ReallocAsyncCtx3 = 0, $ReallocAsyncCtx7 = 0, sp = 0;
 sp = STACKTOP; //@line 6081
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 6083
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 6085
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 6087
 if (!(__ZN20SimulatorBlockDevice4initEv(5776) | 0)) {
  $9 = _malloc(512) | 0; //@line 6091
  HEAP32[1458] = $9; //@line 6092
  $ReallocAsyncCtx7 = _emscripten_realloc_async_context(16) | 0; //@line 6093
  __ZN20SimulatorBlockDevice4readEPvyy(5776, $9, 0, 0, 512, 0) | 0; //@line 6094
  if (___async) {
   HEAP32[$ReallocAsyncCtx7 >> 2] = 95; //@line 6097
   $10 = $ReallocAsyncCtx7 + 4 | 0; //@line 6098
   HEAP32[$10 >> 2] = $2; //@line 6099
   $11 = $ReallocAsyncCtx7 + 8 | 0; //@line 6100
   HEAP32[$11 >> 2] = $4; //@line 6101
   $12 = $ReallocAsyncCtx7 + 12 | 0; //@line 6102
   HEAP32[$12 >> 2] = $6; //@line 6103
   sp = STACKTOP; //@line 6104
   return;
  }
  ___async_unwind = 0; //@line 6107
  HEAP32[$ReallocAsyncCtx7 >> 2] = 95; //@line 6108
  $10 = $ReallocAsyncCtx7 + 4 | 0; //@line 6109
  HEAP32[$10 >> 2] = $2; //@line 6110
  $11 = $ReallocAsyncCtx7 + 8 | 0; //@line 6111
  HEAP32[$11 >> 2] = $4; //@line 6112
  $12 = $ReallocAsyncCtx7 + 12 | 0; //@line 6113
  HEAP32[$12 >> 2] = $6; //@line 6114
  sp = STACKTOP; //@line 6115
  return;
 } else {
  $ReallocAsyncCtx3 = _emscripten_realloc_async_context(4) | 0; //@line 6118
  _puts(2626) | 0; //@line 6119
  if (___async) {
   HEAP32[$ReallocAsyncCtx3 >> 2] = 94; //@line 6122
   sp = STACKTOP; //@line 6123
   return;
  }
  ___async_unwind = 0; //@line 6126
  HEAP32[$ReallocAsyncCtx3 >> 2] = 94; //@line 6127
  sp = STACKTOP; //@line 6128
  return;
 }
}
function ___overflow($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0 = 0, $10 = 0, $12 = 0, $13 = 0, $2 = 0, $20 = 0, $21 = 0, $3 = 0, $4 = 0, $5 = 0, $9 = 0, $AsyncCtx = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 7965
 STACKTOP = STACKTOP + 16 | 0; //@line 7966
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 7966
 $2 = sp; //@line 7967
 $3 = $1 & 255; //@line 7968
 HEAP8[$2 >> 0] = $3; //@line 7969
 $4 = $0 + 16 | 0; //@line 7970
 $5 = HEAP32[$4 >> 2] | 0; //@line 7971
 if (!$5) {
  if (!(___towrite($0) | 0)) {
   $12 = HEAP32[$4 >> 2] | 0; //@line 7978
   label = 4; //@line 7979
  } else {
   $$0 = -1; //@line 7981
  }
 } else {
  $12 = $5; //@line 7984
  label = 4; //@line 7985
 }
 do {
  if ((label | 0) == 4) {
   $9 = $0 + 20 | 0; //@line 7989
   $10 = HEAP32[$9 >> 2] | 0; //@line 7990
   if ($10 >>> 0 < $12 >>> 0) {
    $13 = $1 & 255; //@line 7993
    if (($13 | 0) != (HEAP8[$0 + 75 >> 0] | 0)) {
     HEAP32[$9 >> 2] = $10 + 1; //@line 8000
     HEAP8[$10 >> 0] = $3; //@line 8001
     $$0 = $13; //@line 8002
     break;
    }
   }
   $20 = HEAP32[$0 + 36 >> 2] | 0; //@line 8007
   $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 8008
   $21 = FUNCTION_TABLE_iiii[$20 & 7]($0, $2, 1) | 0; //@line 8009
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 114; //@line 8012
    HEAP32[$AsyncCtx + 4 >> 2] = $2; //@line 8014
    sp = STACKTOP; //@line 8015
    STACKTOP = sp; //@line 8016
    return 0; //@line 8016
   }
   _emscripten_free_async_context($AsyncCtx | 0); //@line 8018
   if (($21 | 0) == 1) {
    $$0 = HEAPU8[$2 >> 0] | 0; //@line 8023
   } else {
    $$0 = -1; //@line 8025
   }
  }
 } while (0);
 STACKTOP = sp; //@line 8029
 return $$0 | 0; //@line 8029
}
function _fflush__async_cb_28($0) {
 $0 = $0 | 0;
 var $$023 = 0, $$02325 = 0, $$02327 = 0, $$024$lcssa = 0, $$02426 = 0, $13 = 0, $16 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 5299
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 5301
 $$02325 = HEAP32[(___ofl_lock() | 0) >> 2] | 0; //@line 5303
 L3 : do {
  if (!$$02325) {
   $$024$lcssa = $AsyncRetVal; //@line 5307
  } else {
   $$02327 = $$02325; //@line 5309
   $$02426 = $AsyncRetVal; //@line 5309
   while (1) {
    if ((HEAP32[$$02327 + 76 >> 2] | 0) > -1) {
     $16 = ___lockfile($$02327) | 0; //@line 5316
    } else {
     $16 = 0; //@line 5318
    }
    if ((HEAP32[$$02327 + 20 >> 2] | 0) >>> 0 > (HEAP32[$$02327 + 28 >> 2] | 0) >>> 0) {
     break;
    }
    if ($16 | 0) {
     ___unlockfile($$02327); //@line 5330
    }
    $$023 = HEAP32[$$02327 + 56 >> 2] | 0; //@line 5333
    if (!$$023) {
     $$024$lcssa = $$02426; //@line 5336
     break L3;
    } else {
     $$02327 = $$023; //@line 5339
    }
   }
   $ReallocAsyncCtx = _emscripten_realloc_async_context(16) | 0; //@line 5342
   $13 = ___fflush_unlocked($$02327) | 0; //@line 5343
   if (!___async) {
    HEAP32[___async_retval >> 2] = $13; //@line 5347
    ___async_unwind = 0; //@line 5348
   }
   HEAP32[$ReallocAsyncCtx >> 2] = 118; //@line 5350
   HEAP32[$ReallocAsyncCtx + 4 >> 2] = $$02426; //@line 5352
   HEAP32[$ReallocAsyncCtx + 8 >> 2] = $16; //@line 5354
   HEAP32[$ReallocAsyncCtx + 12 >> 2] = $$02327; //@line 5356
   sp = STACKTOP; //@line 5357
   return;
  }
 } while (0);
 ___ofl_unlock(); //@line 5361
 HEAP32[___async_retval >> 2] = $$024$lcssa; //@line 5363
 return;
}
function _memset(ptr, value, num) {
 ptr = ptr | 0;
 value = value | 0;
 num = num | 0;
 var end = 0, aligned_end = 0, block_aligned_end = 0, value4 = 0;
 end = ptr + num | 0; //@line 9890
 value = value & 255; //@line 9892
 if ((num | 0) >= 67) {
  while (ptr & 3) {
   HEAP8[ptr >> 0] = value; //@line 9895
   ptr = ptr + 1 | 0; //@line 9896
  }
  aligned_end = end & -4 | 0; //@line 9899
  block_aligned_end = aligned_end - 64 | 0; //@line 9900
  value4 = value | value << 8 | value << 16 | value << 24; //@line 9901
  while ((ptr | 0) <= (block_aligned_end | 0)) {
   HEAP32[ptr >> 2] = value4; //@line 9904
   HEAP32[ptr + 4 >> 2] = value4; //@line 9905
   HEAP32[ptr + 8 >> 2] = value4; //@line 9906
   HEAP32[ptr + 12 >> 2] = value4; //@line 9907
   HEAP32[ptr + 16 >> 2] = value4; //@line 9908
   HEAP32[ptr + 20 >> 2] = value4; //@line 9909
   HEAP32[ptr + 24 >> 2] = value4; //@line 9910
   HEAP32[ptr + 28 >> 2] = value4; //@line 9911
   HEAP32[ptr + 32 >> 2] = value4; //@line 9912
   HEAP32[ptr + 36 >> 2] = value4; //@line 9913
   HEAP32[ptr + 40 >> 2] = value4; //@line 9914
   HEAP32[ptr + 44 >> 2] = value4; //@line 9915
   HEAP32[ptr + 48 >> 2] = value4; //@line 9916
   HEAP32[ptr + 52 >> 2] = value4; //@line 9917
   HEAP32[ptr + 56 >> 2] = value4; //@line 9918
   HEAP32[ptr + 60 >> 2] = value4; //@line 9919
   ptr = ptr + 64 | 0; //@line 9920
  }
  while ((ptr | 0) < (aligned_end | 0)) {
   HEAP32[ptr >> 2] = value4; //@line 9924
   ptr = ptr + 4 | 0; //@line 9925
  }
 }
 while ((ptr | 0) < (end | 0)) {
  HEAP8[ptr >> 0] = value; //@line 9930
  ptr = ptr + 1 | 0; //@line 9931
 }
 return end - num | 0; //@line 9933
}
function __ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $16 = 0, $21 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 5484
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 5488
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 5490
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 5492
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 5494
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 5496
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 5498
 $16 = HEAP8[$0 + 32 >> 0] & 1; //@line 5501
 $21 = (HEAP32[$0 + 4 >> 2] | 0) + 8 | 0; //@line 5502
 if ($21 >>> 0 < $4 >>> 0) {
  if (!(HEAP8[$6 >> 0] | 0)) {
   if ((HEAP32[$8 >> 2] | 0) != 1) {
    $ReallocAsyncCtx = _emscripten_realloc_async_context(36) | 0; //@line 5511
    __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($21, $10, $12, $14, $16); //@line 5512
    if (!___async) {
     ___async_unwind = 0; //@line 5515
    }
    HEAP32[$ReallocAsyncCtx >> 2] = 148; //@line 5517
    HEAP32[$ReallocAsyncCtx + 4 >> 2] = $21; //@line 5519
    HEAP32[$ReallocAsyncCtx + 8 >> 2] = $4; //@line 5521
    HEAP32[$ReallocAsyncCtx + 12 >> 2] = $6; //@line 5523
    HEAP32[$ReallocAsyncCtx + 16 >> 2] = $8; //@line 5525
    HEAP32[$ReallocAsyncCtx + 20 >> 2] = $10; //@line 5527
    HEAP32[$ReallocAsyncCtx + 24 >> 2] = $12; //@line 5529
    HEAP32[$ReallocAsyncCtx + 28 >> 2] = $14; //@line 5531
    HEAP8[$ReallocAsyncCtx + 32 >> 0] = $16 & 1; //@line 5534
    sp = STACKTOP; //@line 5535
    return;
   }
  }
 }
 return;
}
function _fflush__async_cb($0) {
 $0 = $0 | 0;
 var $$02327$reg2mem$0 = 0, $$1 = 0, $$reg2mem$0 = 0, $17 = 0, $20 = 0, $ReallocAsyncCtx = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 5200
 $$02327$reg2mem$0 = HEAP32[$0 + 12 >> 2] | 0; //@line 5210
 $$1 = HEAP32[___async_retval >> 2] | HEAP32[$0 + 4 >> 2]; //@line 5210
 $$reg2mem$0 = HEAP32[$0 + 8 >> 2] | 0; //@line 5210
 while (1) {
  if ($$reg2mem$0 | 0) {
   ___unlockfile($$02327$reg2mem$0); //@line 5214
  }
  $$02327$reg2mem$0 = HEAP32[$$02327$reg2mem$0 + 56 >> 2] | 0; //@line 5217
  if (!$$02327$reg2mem$0) {
   label = 12; //@line 5220
   break;
  }
  if ((HEAP32[$$02327$reg2mem$0 + 76 >> 2] | 0) > -1) {
   $20 = ___lockfile($$02327$reg2mem$0) | 0; //@line 5228
  } else {
   $20 = 0; //@line 5230
  }
  if ((HEAP32[$$02327$reg2mem$0 + 20 >> 2] | 0) >>> 0 > (HEAP32[$$02327$reg2mem$0 + 28 >> 2] | 0) >>> 0) {
   break;
  } else {
   $$reg2mem$0 = $20; //@line 5240
  }
 }
 if ((label | 0) == 12) {
  ___ofl_unlock(); //@line 5244
  HEAP32[___async_retval >> 2] = $$1; //@line 5246
  return;
 }
 $ReallocAsyncCtx = _emscripten_realloc_async_context(16) | 0; //@line 5249
 $17 = ___fflush_unlocked($$02327$reg2mem$0) | 0; //@line 5250
 if (!___async) {
  HEAP32[___async_retval >> 2] = $17; //@line 5254
  ___async_unwind = 0; //@line 5255
 }
 HEAP32[$ReallocAsyncCtx >> 2] = 118; //@line 5257
 HEAP32[$ReallocAsyncCtx + 4 >> 2] = $$1; //@line 5259
 HEAP32[$ReallocAsyncCtx + 8 >> 2] = $20; //@line 5261
 HEAP32[$ReallocAsyncCtx + 12 >> 2] = $$02327$reg2mem$0; //@line 5263
 sp = STACKTOP; //@line 5264
 return;
}
function ___fflush_unlocked__async_cb($0) {
 $0 = $0 | 0;
 var $$0 = 0, $10 = 0, $11 = 0, $12 = 0, $18 = 0, $2 = 0, $4 = 0, $6 = 0, $9 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 8152
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 8154
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 8156
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 8158
 do {
  if (!(HEAP32[$2 >> 2] | 0)) {
   $$0 = -1; //@line 8163
  } else {
   $9 = $4 + 4 | 0; //@line 8165
   $10 = HEAP32[$9 >> 2] | 0; //@line 8166
   $11 = $4 + 8 | 0; //@line 8167
   $12 = HEAP32[$11 >> 2] | 0; //@line 8168
   if ($10 >>> 0 >= $12 >>> 0) {
    HEAP32[$4 + 16 >> 2] = 0; //@line 8172
    HEAP32[$6 >> 2] = 0; //@line 8173
    HEAP32[$2 >> 2] = 0; //@line 8174
    HEAP32[$11 >> 2] = 0; //@line 8175
    HEAP32[$9 >> 2] = 0; //@line 8176
    $$0 = 0; //@line 8177
    break;
   }
   $18 = HEAP32[$4 + 40 >> 2] | 0; //@line 8184
   $ReallocAsyncCtx2 = _emscripten_realloc_async_context(24) | 0; //@line 8185
   FUNCTION_TABLE_iiii[$18 & 7]($4, $10 - $12 | 0, 1) | 0; //@line 8186
   if (!___async) {
    ___async_unwind = 0; //@line 8189
   }
   HEAP32[$ReallocAsyncCtx2 >> 2] = 120; //@line 8191
   HEAP32[$ReallocAsyncCtx2 + 4 >> 2] = $4; //@line 8193
   HEAP32[$ReallocAsyncCtx2 + 8 >> 2] = $6; //@line 8195
   HEAP32[$ReallocAsyncCtx2 + 12 >> 2] = $2; //@line 8197
   HEAP32[$ReallocAsyncCtx2 + 16 >> 2] = $11; //@line 8199
   HEAP32[$ReallocAsyncCtx2 + 20 >> 2] = $9; //@line 8201
   sp = STACKTOP; //@line 8202
   return;
  }
 } while (0);
 HEAP32[___async_retval >> 2] = $$0; //@line 8207
 return;
}
function _equeue_create($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0 = 0, $$033$i = 0, $$034$i = 0, $2 = 0, $21 = 0, $23 = 0, $27 = 0, $30 = 0, $5 = 0, $6 = 0;
 $2 = _malloc($1) | 0; //@line 531
 if (!$2) {
  $$0 = -1; //@line 534
  return $$0 | 0; //@line 535
 }
 HEAP32[$0 + 12 >> 2] = $2; //@line 538
 $5 = $0 + 20 | 0; //@line 539
 HEAP32[$5 >> 2] = 0; //@line 540
 $6 = $0 + 16 | 0; //@line 541
 HEAP32[$6 >> 2] = 0; //@line 542
 if ($1 | 0) {
  $$034$i = $1; //@line 545
  $23 = 0; //@line 545
  do {
   $23 = $23 + 1 | 0; //@line 547
   $$034$i = $$034$i >>> 1; //@line 548
  } while (($$034$i | 0) != 0);
  HEAP32[$6 >> 2] = $23; //@line 556
 }
 HEAP32[$0 + 24 >> 2] = 0; //@line 559
 HEAP32[$0 + 28 >> 2] = $1; //@line 561
 HEAP32[$0 + 32 >> 2] = $2; //@line 563
 HEAP32[$0 >> 2] = 0; //@line 564
 HEAP32[$0 + 4 >> 2] = _equeue_tick() | 0; //@line 567
 HEAP8[$0 + 9 >> 0] = 0; //@line 569
 HEAP8[$0 + 8 >> 0] = 0; //@line 571
 HEAP8[$0 + 36 >> 0] = 0; //@line 573
 HEAP32[$0 + 40 >> 2] = 0; //@line 575
 HEAP32[$0 + 44 >> 2] = 0; //@line 577
 HEAP8[$0 + 184 >> 0] = 0; //@line 579
 $21 = _equeue_sema_create($0 + 48 | 0) | 0; //@line 581
 if (($21 | 0) < 0) {
  $$033$i = $21; //@line 584
 } else {
  $27 = _equeue_mutex_create($0 + 128 | 0) | 0; //@line 587
  if (($27 | 0) < 0) {
   $$033$i = $27; //@line 590
  } else {
   $30 = _equeue_mutex_create($0 + 156 | 0) | 0; //@line 593
   $$033$i = ($30 | 0) < 0 ? $30 : 0; //@line 596
  }
 }
 HEAP32[$5 >> 2] = $2; //@line 599
 $$0 = $$033$i; //@line 600
 return $$0 | 0; //@line 601
}
function __ZN4mbed11InterruptIn4fallENS_8CallbackIFvvEEE__async_cb($0) {
 $0 = $0 | 0;
 var $$pre = 0, $10 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $2 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 949
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 951
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 953
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 955
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 957
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 959
 $$pre = HEAP32[$2 >> 2] | 0; //@line 960
 if (!$$pre) {
  HEAP32[$4 >> 2] = 0; //@line 963
  _gpio_irq_set($10 + 28 | 0, 2, 1); //@line 965
  return;
 }
 $13 = HEAP32[$$pre + 4 >> 2] | 0; //@line 969
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(16) | 0; //@line 970
 FUNCTION_TABLE_vii[$13 & 3]($6, $8); //@line 971
 if (___async) {
  HEAP32[$ReallocAsyncCtx2 >> 2] = 21; //@line 974
  $14 = $ReallocAsyncCtx2 + 4 | 0; //@line 975
  HEAP32[$14 >> 2] = $2; //@line 976
  $15 = $ReallocAsyncCtx2 + 8 | 0; //@line 977
  HEAP32[$15 >> 2] = $4; //@line 978
  $16 = $ReallocAsyncCtx2 + 12 | 0; //@line 979
  HEAP32[$16 >> 2] = $10; //@line 980
  sp = STACKTOP; //@line 981
  return;
 }
 ___async_unwind = 0; //@line 984
 HEAP32[$ReallocAsyncCtx2 >> 2] = 21; //@line 985
 $14 = $ReallocAsyncCtx2 + 4 | 0; //@line 986
 HEAP32[$14 >> 2] = $2; //@line 987
 $15 = $ReallocAsyncCtx2 + 8 | 0; //@line 988
 HEAP32[$15 >> 2] = $4; //@line 989
 $16 = $ReallocAsyncCtx2 + 12 | 0; //@line 990
 HEAP32[$16 >> 2] = $10; //@line 991
 sp = STACKTOP; //@line 992
 return;
}
function _wcrtomb($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$0 = 0;
 do {
  if (!$0) {
   $$0 = 1; //@line 11345
  } else {
   if ($1 >>> 0 < 128) {
    HEAP8[$0 >> 0] = $1; //@line 11350
    $$0 = 1; //@line 11351
    break;
   }
   if (!(HEAP32[HEAP32[(___pthread_self_910() | 0) + 188 >> 2] >> 2] | 0)) {
    if (($1 & -128 | 0) == 57216) {
     HEAP8[$0 >> 0] = $1; //@line 11364
     $$0 = 1; //@line 11365
     break;
    } else {
     HEAP32[(___errno_location() | 0) >> 2] = 84; //@line 11369
     $$0 = -1; //@line 11370
     break;
    }
   }
   if ($1 >>> 0 < 2048) {
    HEAP8[$0 >> 0] = $1 >>> 6 | 192; //@line 11380
    HEAP8[$0 + 1 >> 0] = $1 & 63 | 128; //@line 11384
    $$0 = 2; //@line 11385
    break;
   }
   if ($1 >>> 0 < 55296 | ($1 & -8192 | 0) == 57344) {
    HEAP8[$0 >> 0] = $1 >>> 12 | 224; //@line 11397
    HEAP8[$0 + 1 >> 0] = $1 >>> 6 & 63 | 128; //@line 11403
    HEAP8[$0 + 2 >> 0] = $1 & 63 | 128; //@line 11407
    $$0 = 3; //@line 11408
    break;
   }
   if (($1 + -65536 | 0) >>> 0 < 1048576) {
    HEAP8[$0 >> 0] = $1 >>> 18 | 240; //@line 11418
    HEAP8[$0 + 1 >> 0] = $1 >>> 12 & 63 | 128; //@line 11424
    HEAP8[$0 + 2 >> 0] = $1 >>> 6 & 63 | 128; //@line 11430
    HEAP8[$0 + 3 >> 0] = $1 & 63 | 128; //@line 11434
    $$0 = 4; //@line 11435
    break;
   } else {
    HEAP32[(___errno_location() | 0) >> 2] = 84; //@line 11439
    $$0 = -1; //@line 11440
    break;
   }
  }
 } while (0);
 return $$0 | 0; //@line 11445
}
function __ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv__async_cb_61($0) {
 $0 = $0 | 0;
 var $15 = 0, $16 = 0, $2 = 0, $4 = 0, $6 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx = 0, dest = 0, sp = 0, stop = 0;
 sp = STACKTOP; //@line 8264
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 8266
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 8268
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 8270
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 8272
 if (!$AsyncRetVal) {
  HEAP8[___async_retval >> 0] = 0; //@line 8277
  return;
 }
 dest = $2 + 4 | 0; //@line 8281
 stop = dest + 52 | 0; //@line 8281
 do {
  HEAP32[dest >> 2] = 0; //@line 8281
  dest = dest + 4 | 0; //@line 8281
 } while ((dest | 0) < (stop | 0));
 HEAP32[$2 >> 2] = $AsyncRetVal; //@line 8282
 HEAP32[$2 + 8 >> 2] = $4; //@line 8284
 HEAP32[$2 + 12 >> 2] = -1; //@line 8286
 HEAP32[$2 + 48 >> 2] = 1; //@line 8288
 $15 = HEAP32[(HEAP32[$AsyncRetVal >> 2] | 0) + 28 >> 2] | 0; //@line 8291
 $16 = HEAP32[$6 >> 2] | 0; //@line 8292
 $ReallocAsyncCtx = _emscripten_realloc_async_context(16) | 0; //@line 8293
 FUNCTION_TABLE_viiii[$15 & 3]($AsyncRetVal, $2, $16, 1); //@line 8294
 if (!___async) {
  ___async_unwind = 0; //@line 8297
 }
 HEAP32[$ReallocAsyncCtx >> 2] = 133; //@line 8299
 HEAP32[$ReallocAsyncCtx + 4 >> 2] = $2; //@line 8301
 HEAP32[$ReallocAsyncCtx + 8 >> 2] = $6; //@line 8303
 HEAP32[$ReallocAsyncCtx + 12 >> 2] = $2; //@line 8305
 sp = STACKTOP; //@line 8306
 return;
}
function __ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_31($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $17 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 5620
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 5624
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 5626
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 5628
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 5630
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 5632
 $14 = HEAP8[$0 + 28 >> 0] & 1; //@line 5635
 $17 = (HEAP32[$0 + 4 >> 2] | 0) + 8 | 0; //@line 5636
 if ($17 >>> 0 < $4 >>> 0) {
  if (!(HEAP8[$6 >> 0] | 0)) {
   $ReallocAsyncCtx3 = _emscripten_realloc_async_context(32) | 0; //@line 5642
   __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($17, $8, $10, $12, $14); //@line 5643
   if (!___async) {
    ___async_unwind = 0; //@line 5646
   }
   HEAP32[$ReallocAsyncCtx3 >> 2] = 146; //@line 5648
   HEAP32[$ReallocAsyncCtx3 + 4 >> 2] = $17; //@line 5650
   HEAP32[$ReallocAsyncCtx3 + 8 >> 2] = $4; //@line 5652
   HEAP32[$ReallocAsyncCtx3 + 12 >> 2] = $6; //@line 5654
   HEAP32[$ReallocAsyncCtx3 + 16 >> 2] = $8; //@line 5656
   HEAP32[$ReallocAsyncCtx3 + 20 >> 2] = $10; //@line 5658
   HEAP32[$ReallocAsyncCtx3 + 24 >> 2] = $12; //@line 5660
   HEAP8[$ReallocAsyncCtx3 + 28 >> 0] = $14 & 1; //@line 5663
   sp = STACKTOP; //@line 5664
   return;
  }
 }
 return;
}
function _fmt_u($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$010$lcssa$off0 = 0, $$012 = 0, $$09$lcssa = 0, $$0914 = 0, $$1$lcssa = 0, $$111 = 0, $10 = 0, $26 = 0, $8 = 0, $9 = 0, $8$looptemp = 0;
 if ($1 >>> 0 > 0 | ($1 | 0) == 0 & $0 >>> 0 > 4294967295) {
  $$0914 = $2; //@line 10229
  $8 = $0; //@line 10229
  $9 = $1; //@line 10229
  while (1) {
   $10 = ___uremdi3($8 | 0, $9 | 0, 10, 0) | 0; //@line 10231
   $$0914 = $$0914 + -1 | 0; //@line 10235
   HEAP8[$$0914 >> 0] = $10 & 255 | 48; //@line 10236
   $8$looptemp = $8;
   $8 = ___udivdi3($8 | 0, $9 | 0, 10, 0) | 0; //@line 10237
   if (!($9 >>> 0 > 9 | ($9 | 0) == 9 & $8$looptemp >>> 0 > 4294967295)) {
    break;
   } else {
    $9 = tempRet0; //@line 10245
   }
  }
  $$010$lcssa$off0 = $8; //@line 10250
  $$09$lcssa = $$0914; //@line 10250
 } else {
  $$010$lcssa$off0 = $0; //@line 10252
  $$09$lcssa = $2; //@line 10252
 }
 if (!$$010$lcssa$off0) {
  $$1$lcssa = $$09$lcssa; //@line 10256
 } else {
  $$012 = $$010$lcssa$off0; //@line 10258
  $$111 = $$09$lcssa; //@line 10258
  while (1) {
   $26 = $$111 + -1 | 0; //@line 10263
   HEAP8[$26 >> 0] = ($$012 >>> 0) % 10 | 0 | 48; //@line 10264
   if ($$012 >>> 0 < 10) {
    $$1$lcssa = $26; //@line 10268
    break;
   } else {
    $$012 = ($$012 >>> 0) / 10 | 0; //@line 10271
    $$111 = $26; //@line 10271
   }
  }
 }
 return $$1$lcssa | 0; //@line 10275
}
function _main__async_cb($0) {
 $0 = $0 | 0;
 var $11 = 0, $12 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx2 = 0, $ReallocAsyncCtx8 = 0, sp = 0;
 sp = STACKTOP; //@line 6002
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 6007
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 6009
 if (!(HEAP8[$0 + 4 >> 0] & 1)) {
  $8 = (HEAP32[$4 >> 2] | 0) + -1 | 0; //@line 6012
  HEAP32[$4 >> 2] = $8; //@line 6013
  if (!$8) {
   $11 = HEAP32[$4 + 24 >> 2] | 0; //@line 6017
   $ReallocAsyncCtx2 = _emscripten_realloc_async_context(8) | 0; //@line 6018
   FUNCTION_TABLE_vi[$11 & 255]($6); //@line 6019
   if (___async) {
    HEAP32[$ReallocAsyncCtx2 >> 2] = 100; //@line 6022
    $12 = $ReallocAsyncCtx2 + 4 | 0; //@line 6023
    HEAP32[$12 >> 2] = $4; //@line 6024
    sp = STACKTOP; //@line 6025
    return;
   }
   ___async_unwind = 0; //@line 6028
   HEAP32[$ReallocAsyncCtx2 >> 2] = 100; //@line 6029
   $12 = $ReallocAsyncCtx2 + 4 | 0; //@line 6030
   HEAP32[$12 >> 2] = $4; //@line 6031
   sp = STACKTOP; //@line 6032
   return;
  }
 }
 $ReallocAsyncCtx8 = _emscripten_realloc_async_context(4) | 0; //@line 6036
 __ZN6events10EventQueue8dispatchEi(5836, -1); //@line 6037
 if (___async) {
  HEAP32[$ReallocAsyncCtx8 >> 2] = 102; //@line 6040
  sp = STACKTOP; //@line 6041
  return;
 }
 ___async_unwind = 0; //@line 6044
 HEAP32[$ReallocAsyncCtx8 >> 2] = 102; //@line 6045
 sp = STACKTOP; //@line 6046
 return;
}
function __ZN6events5EventIFvvEE10event_postIPS1_EEiPNS2_5eventE($0) {
 $0 = $0 | 0;
 var $$0 = 0, $1 = 0, $13 = 0, $14 = 0, $2 = 0, $3 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 4138
 $1 = $0 + 4 | 0; //@line 4139
 $2 = HEAP32[$1 >> 2] | 0; //@line 4140
 $AsyncCtx3 = _emscripten_alloc_async_context(12, sp) | 0; //@line 4141
 $3 = _equeue_alloc($2, 4) | 0; //@line 4142
 if (___async) {
  HEAP32[$AsyncCtx3 >> 2] = 103; //@line 4145
  HEAP32[$AsyncCtx3 + 4 >> 2] = $0; //@line 4147
  HEAP32[$AsyncCtx3 + 8 >> 2] = $1; //@line 4149
  sp = STACKTOP; //@line 4150
  return 0; //@line 4151
 }
 _emscripten_free_async_context($AsyncCtx3 | 0); //@line 4153
 if (!$3) {
  $$0 = 0; //@line 4156
  return $$0 | 0; //@line 4157
 }
 HEAP32[$3 >> 2] = HEAP32[$0 + 28 >> 2]; //@line 4161
 _equeue_event_delay($3, HEAP32[$0 + 12 >> 2] | 0); //@line 4164
 _equeue_event_period($3, HEAP32[$0 + 16 >> 2] | 0); //@line 4167
 _equeue_event_dtor($3, 104); //@line 4168
 $13 = HEAP32[$1 >> 2] | 0; //@line 4169
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 4170
 $14 = _equeue_post($13, 105, $3) | 0; //@line 4171
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 106; //@line 4174
  sp = STACKTOP; //@line 4175
  return 0; //@line 4176
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 4178
 $$0 = $14; //@line 4179
 return $$0 | 0; //@line 4180
}
function _equeue_create_inplace($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$033 = 0, $$034 = 0, $20 = 0, $22 = 0, $26 = 0, $29 = 0, $5 = 0;
 HEAP32[$0 + 12 >> 2] = $2; //@line 611
 HEAP32[$0 + 20 >> 2] = 0; //@line 613
 $5 = $0 + 16 | 0; //@line 614
 HEAP32[$5 >> 2] = 0; //@line 615
 if ($1 | 0) {
  $$034 = $1; //@line 618
  $22 = 0; //@line 618
  do {
   $22 = $22 + 1 | 0; //@line 620
   $$034 = $$034 >>> 1; //@line 621
  } while (($$034 | 0) != 0);
  HEAP32[$5 >> 2] = $22; //@line 629
 }
 HEAP32[$0 + 24 >> 2] = 0; //@line 632
 HEAP32[$0 + 28 >> 2] = $1; //@line 634
 HEAP32[$0 + 32 >> 2] = $2; //@line 636
 HEAP32[$0 >> 2] = 0; //@line 637
 HEAP32[$0 + 4 >> 2] = _equeue_tick() | 0; //@line 640
 HEAP8[$0 + 9 >> 0] = 0; //@line 642
 HEAP8[$0 + 8 >> 0] = 0; //@line 644
 HEAP8[$0 + 36 >> 0] = 0; //@line 646
 HEAP32[$0 + 40 >> 2] = 0; //@line 648
 HEAP32[$0 + 44 >> 2] = 0; //@line 650
 HEAP8[$0 + 184 >> 0] = 0; //@line 652
 $20 = _equeue_sema_create($0 + 48 | 0) | 0; //@line 654
 if (($20 | 0) < 0) {
  $$033 = $20; //@line 657
  return $$033 | 0; //@line 658
 }
 $26 = _equeue_mutex_create($0 + 128 | 0) | 0; //@line 661
 if (($26 | 0) < 0) {
  $$033 = $26; //@line 664
  return $$033 | 0; //@line 665
 }
 $29 = _equeue_mutex_create($0 + 156 | 0) | 0; //@line 668
 $$033 = ($29 | 0) < 0 ? $29 : 0; //@line 671
 return $$033 | 0; //@line 672
}
function __ZNK10__cxxabiv121__vmi_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $13 = 0, $2 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 1152
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 1154
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 1158
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 1160
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 1162
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 1164
 if (!(HEAP8[$2 >> 0] | 0)) {
  $13 = (HEAP32[$0 + 8 >> 2] | 0) + 8 | 0; //@line 1168
  if ($13 >>> 0 < $6 >>> 0) {
   $ReallocAsyncCtx = _emscripten_realloc_async_context(28) | 0; //@line 1171
   __ZNK10__cxxabiv122__base_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($13, $8, $10, $12); //@line 1172
   if (!___async) {
    ___async_unwind = 0; //@line 1175
   }
   HEAP32[$ReallocAsyncCtx >> 2] = 150; //@line 1177
   HEAP32[$ReallocAsyncCtx + 4 >> 2] = $2; //@line 1179
   HEAP32[$ReallocAsyncCtx + 8 >> 2] = $13; //@line 1181
   HEAP32[$ReallocAsyncCtx + 12 >> 2] = $6; //@line 1183
   HEAP32[$ReallocAsyncCtx + 16 >> 2] = $8; //@line 1185
   HEAP32[$ReallocAsyncCtx + 20 >> 2] = $10; //@line 1187
   HEAP32[$ReallocAsyncCtx + 24 >> 2] = $12; //@line 1189
   sp = STACKTOP; //@line 1190
   return;
  }
 }
 return;
}
function __ZN20SimulatorBlockDeviceC2EPKcyy($0, $1, $2, $3, $4, $5) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 $5 = $5 | 0;
 var $13 = 0, $18 = 0, $23 = 0, $24 = 0, $25 = 0, $29 = 0, $8 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 3809
 HEAP32[$0 >> 2] = 264; //@line 3810
 HEAP32[$0 + 4 >> 2] = $1; //@line 3812
 $8 = $0 + 8 | 0; //@line 3814
 HEAP32[$8 >> 2] = $4; //@line 3816
 HEAP32[$8 + 4 >> 2] = $5; //@line 3819
 $13 = $0 + 16 | 0; //@line 3821
 HEAP32[$13 >> 2] = $4; //@line 3823
 HEAP32[$13 + 4 >> 2] = $5; //@line 3826
 $18 = $0 + 24 | 0; //@line 3828
 HEAP32[$18 >> 2] = $4; //@line 3830
 HEAP32[$18 + 4 >> 2] = $5; //@line 3833
 $23 = ___udivdi3($2 | 0, $3 | 0, $4 | 0, $5 | 0) | 0; //@line 3835
 $24 = tempRet0; //@line 3836
 $25 = $0 + 32 | 0; //@line 3837
 HEAP32[$25 >> 2] = $23; //@line 3839
 HEAP32[$25 + 4 >> 2] = $24; //@line 3842
 $29 = ___muldi3($23 | 0, $24 | 0, $4 | 0, $5 | 0) | 0; //@line 3843
 if (($29 | 0) == ($2 | 0) & (tempRet0 | 0) == ($3 | 0)) {
  return;
 }
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 3851
 _mbed_assert_internal(2340, 1878, 25); //@line 3852
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 88; //@line 3855
  sp = STACKTOP; //@line 3856
  return;
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 3859
 return;
}
function _strlen($0) {
 $0 = $0 | 0;
 var $$0 = 0, $$015$lcssa = 0, $$01519 = 0, $$1$lcssa = 0, $$pn = 0, $$sink = 0, $1 = 0, $10 = 0, $19 = 0, $23 = 0, $6 = 0, label = 0;
 $1 = $0; //@line 7731
 L1 : do {
  if (!($1 & 3)) {
   $$015$lcssa = $0; //@line 7736
   label = 4; //@line 7737
  } else {
   $$01519 = $0; //@line 7739
   $23 = $1; //@line 7739
   while (1) {
    if (!(HEAP8[$$01519 >> 0] | 0)) {
     $$sink = $23; //@line 7744
     break L1;
    }
    $6 = $$01519 + 1 | 0; //@line 7747
    $23 = $6; //@line 7748
    if (!($23 & 3)) {
     $$015$lcssa = $6; //@line 7752
     label = 4; //@line 7753
     break;
    } else {
     $$01519 = $6; //@line 7756
    }
   }
  }
 } while (0);
 if ((label | 0) == 4) {
  $$0 = $$015$lcssa; //@line 7762
  while (1) {
   $10 = HEAP32[$$0 >> 2] | 0; //@line 7764
   if (!(($10 & -2139062144 ^ -2139062144) & $10 + -16843009)) {
    $$0 = $$0 + 4 | 0; //@line 7772
   } else {
    break;
   }
  }
  if (!(($10 & 255) << 24 >> 24)) {
   $$1$lcssa = $$0; //@line 7780
  } else {
   $$pn = $$0; //@line 7782
   while (1) {
    $19 = $$pn + 1 | 0; //@line 7784
    if (!(HEAP8[$19 >> 0] | 0)) {
     $$1$lcssa = $19; //@line 7788
     break;
    } else {
     $$pn = $19; //@line 7791
    }
   }
  }
  $$sink = $$1$lcssa; //@line 7796
 }
 return $$sink - $1 | 0; //@line 7799
}
function __ZNK10__cxxabiv117__class_type_info29process_static_type_above_dstEPNS_19__dynamic_cast_infoEPKvS4_i($0, $1, $2, $3, $4) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 var $10 = 0, $11 = 0, $21 = 0, $22 = 0, $28 = 0, $30 = 0;
 HEAP8[$1 + 53 >> 0] = 1; //@line 12924
 do {
  if ((HEAP32[$1 + 4 >> 2] | 0) == ($3 | 0)) {
   HEAP8[$1 + 52 >> 0] = 1; //@line 12931
   $10 = $1 + 16 | 0; //@line 12932
   $11 = HEAP32[$10 >> 2] | 0; //@line 12933
   if (!$11) {
    HEAP32[$10 >> 2] = $2; //@line 12936
    HEAP32[$1 + 24 >> 2] = $4; //@line 12938
    HEAP32[$1 + 36 >> 2] = 1; //@line 12940
    if (!(($4 | 0) == 1 ? (HEAP32[$1 + 48 >> 2] | 0) == 1 : 0)) {
     break;
    }
    HEAP8[$1 + 54 >> 0] = 1; //@line 12950
    break;
   }
   if (($11 | 0) != ($2 | 0)) {
    $30 = $1 + 36 | 0; //@line 12955
    HEAP32[$30 >> 2] = (HEAP32[$30 >> 2] | 0) + 1; //@line 12958
    HEAP8[$1 + 54 >> 0] = 1; //@line 12960
    break;
   }
   $21 = $1 + 24 | 0; //@line 12963
   $22 = HEAP32[$21 >> 2] | 0; //@line 12964
   if (($22 | 0) == 2) {
    HEAP32[$21 >> 2] = $4; //@line 12967
    $28 = $4; //@line 12968
   } else {
    $28 = $22; //@line 12970
   }
   if (($28 | 0) == 1 ? (HEAP32[$1 + 48 >> 2] | 0) == 1 : 0) {
    HEAP8[$1 + 54 >> 0] = 1; //@line 12979
   }
  }
 } while (0);
 return;
}
function __ZN4mbed11InterruptIn12_irq_handlerEj14gpio_irq_event($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $12 = 0, $2 = 0, $4 = 0, $7 = 0, $9 = 0, $AsyncCtx = 0, $AsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 263
 $2 = $0; //@line 264
 L1 : do {
  switch ($1 | 0) {
  case 1:
   {
    $4 = HEAP32[$2 + 52 >> 2] | 0; //@line 269
    if ($4 | 0) {
     $7 = HEAP32[$4 >> 2] | 0; //@line 273
     $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 274
     FUNCTION_TABLE_vi[$7 & 255]($2 + 40 | 0); //@line 275
     if (___async) {
      HEAP32[$AsyncCtx >> 2] = 18; //@line 278
      sp = STACKTOP; //@line 279
      return;
     } else {
      _emscripten_free_async_context($AsyncCtx | 0); //@line 282
      break L1;
     }
    }
    break;
   }
  case 2:
   {
    $9 = HEAP32[$2 + 68 >> 2] | 0; //@line 290
    if ($9 | 0) {
     $12 = HEAP32[$9 >> 2] | 0; //@line 294
     $AsyncCtx2 = _emscripten_alloc_async_context(4, sp) | 0; //@line 295
     FUNCTION_TABLE_vi[$12 & 255]($2 + 56 | 0); //@line 296
     if (___async) {
      HEAP32[$AsyncCtx2 >> 2] = 19; //@line 299
      sp = STACKTOP; //@line 300
      return;
     } else {
      _emscripten_free_async_context($AsyncCtx2 | 0); //@line 303
      break L1;
     }
    }
    break;
   }
  default:
   {}
  }
 } while (0);
 return;
}
function _puts($0) {
 $0 = $0 | 0;
 var $1 = 0, $11 = 0, $12 = 0, $17 = 0, $19 = 0, $22 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 12418
 $1 = HEAP32[116] | 0; //@line 12419
 if ((HEAP32[$1 + 76 >> 2] | 0) > -1) {
  $19 = ___lockfile($1) | 0; //@line 12425
 } else {
  $19 = 0; //@line 12427
 }
 do {
  if ((_fputs($0, $1) | 0) < 0) {
   $22 = -1; //@line 12433
  } else {
   if ((HEAP8[$1 + 75 >> 0] | 0) != 10) {
    $11 = $1 + 20 | 0; //@line 12439
    $12 = HEAP32[$11 >> 2] | 0; //@line 12440
    if ($12 >>> 0 < (HEAP32[$1 + 16 >> 2] | 0) >>> 0) {
     HEAP32[$11 >> 2] = $12 + 1; //@line 12446
     HEAP8[$12 >> 0] = 10; //@line 12447
     $22 = 0; //@line 12448
     break;
    }
   }
   $AsyncCtx = _emscripten_alloc_async_context(12, sp) | 0; //@line 12452
   $17 = ___overflow($1, 10) | 0; //@line 12453
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 127; //@line 12456
    HEAP32[$AsyncCtx + 4 >> 2] = $19; //@line 12458
    HEAP32[$AsyncCtx + 8 >> 2] = $1; //@line 12460
    sp = STACKTOP; //@line 12461
    return 0; //@line 12462
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 12464
    $22 = $17 >> 31; //@line 12466
    break;
   }
  }
 } while (0);
 if ($19 | 0) {
  ___unlockfile($1); //@line 12473
 }
 return $22 | 0; //@line 12475
}
function __ZN4mbed11InterruptIn4fallENS_8CallbackIFvvEEE__async_cb_5($0) {
 $0 = $0 | 0;
 var $$pre$i$i4 = 0, $12 = 0, $13 = 0, $14 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx5 = 0, sp = 0;
 sp = STACKTOP; //@line 1069
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 1075
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 1077
 $$pre$i$i4 = HEAP32[HEAP32[$0 + 4 >> 2] >> 2] | 0; //@line 1078
 HEAP32[HEAP32[$0 + 8 >> 2] >> 2] = $$pre$i$i4; //@line 1079
 if (!$$pre$i$i4) {
  _gpio_irq_set($8 + 28 | 0, 2, 0); //@line 1083
  return;
 }
 $12 = HEAP32[$$pre$i$i4 + 8 >> 2] | 0; //@line 1088
 $ReallocAsyncCtx5 = _emscripten_realloc_async_context(12) | 0; //@line 1089
 FUNCTION_TABLE_vi[$12 & 255]($6); //@line 1090
 if (___async) {
  HEAP32[$ReallocAsyncCtx5 >> 2] = 24; //@line 1093
  $13 = $ReallocAsyncCtx5 + 4 | 0; //@line 1094
  HEAP32[$13 >> 2] = $6; //@line 1095
  $14 = $ReallocAsyncCtx5 + 8 | 0; //@line 1096
  HEAP32[$14 >> 2] = $8; //@line 1097
  sp = STACKTOP; //@line 1098
  return;
 }
 ___async_unwind = 0; //@line 1101
 HEAP32[$ReallocAsyncCtx5 >> 2] = 24; //@line 1102
 $13 = $ReallocAsyncCtx5 + 4 | 0; //@line 1103
 HEAP32[$13 >> 2] = $6; //@line 1104
 $14 = $ReallocAsyncCtx5 + 8 | 0; //@line 1105
 HEAP32[$14 >> 2] = $8; //@line 1106
 sp = STACKTOP; //@line 1107
 return;
}
function __ZN4mbed11InterruptInD0Ev($0) {
 $0 = $0 | 0;
 var $10 = 0, $14 = 0, $3 = 0, $7 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 194
 HEAP32[$0 >> 2] = 184; //@line 195
 _gpio_irq_free($0 + 28 | 0); //@line 197
 $3 = HEAP32[$0 + 68 >> 2] | 0; //@line 199
 do {
  if ($3 | 0) {
   $7 = HEAP32[$3 + 8 >> 2] | 0; //@line 205
   $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 206
   FUNCTION_TABLE_vi[$7 & 255]($0 + 56 | 0); //@line 207
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 16; //@line 210
    HEAP32[$AsyncCtx + 4 >> 2] = $0; //@line 212
    sp = STACKTOP; //@line 213
    return;
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 216
    break;
   }
  }
 } while (0);
 $10 = HEAP32[$0 + 52 >> 2] | 0; //@line 222
 if (!$10) {
  __ZdlPv($0); //@line 225
  return;
 }
 $14 = HEAP32[$10 + 8 >> 2] | 0; //@line 230
 $AsyncCtx3 = _emscripten_alloc_async_context(8, sp) | 0; //@line 231
 FUNCTION_TABLE_vi[$14 & 255]($0 + 40 | 0); //@line 232
 if (___async) {
  HEAP32[$AsyncCtx3 >> 2] = 17; //@line 235
  HEAP32[$AsyncCtx3 + 4 >> 2] = $0; //@line 237
  sp = STACKTOP; //@line 238
  return;
 }
 _emscripten_free_async_context($AsyncCtx3 | 0); //@line 241
 __ZdlPv($0); //@line 242
 return;
}
function _mbed_vtracef__async_cb_14($0) {
 $0 = $0 | 0;
 var $$18 = 0, $10 = 0, $12 = 0, $16 = 0, $19 = 0, $2 = 0, $20 = 0, $23 = 0, $24 = 0, $4 = 0, $6 = 0, $ReallocAsyncCtx7 = 0, sp = 0;
 sp = STACKTOP; //@line 2099
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 2101
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 2103
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 2105
 $10 = HEAP8[$0 + 20 >> 0] & 1; //@line 2110
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 2112
 HEAP32[$2 >> 2] = HEAP32[___async_retval >> 2]; //@line 2117
 $16 = _snprintf($4, $6, 1407, $2) | 0; //@line 2118
 $$18 = ($16 | 0) >= ($6 | 0) ? 0 : $16; //@line 2120
 $19 = $4 + $$18 | 0; //@line 2122
 $20 = $6 - $$18 | 0; //@line 2123
 if (($$18 | 0) > 0) {
  if (!(($$18 | 0) < 1 | ($20 | 0) < 1 | $10 ^ 1)) {
   _snprintf($19, $20, 1485, $12) | 0; //@line 2131
  }
 }
 $23 = HEAP32[59] | 0; //@line 2134
 $24 = HEAP32[52] | 0; //@line 2135
 $ReallocAsyncCtx7 = _emscripten_realloc_async_context(4) | 0; //@line 2136
 FUNCTION_TABLE_vi[$23 & 255]($24); //@line 2137
 if (___async) {
  HEAP32[$ReallocAsyncCtx7 >> 2] = 46; //@line 2140
  sp = STACKTOP; //@line 2141
  return;
 }
 ___async_unwind = 0; //@line 2144
 HEAP32[$ReallocAsyncCtx7 >> 2] = 46; //@line 2145
 sp = STACKTOP; //@line 2146
 return;
}
function __ZNK10__cxxabiv121__vmi_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb_7($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 1200
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 1206
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 1208
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 1210
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 1212
 if ((HEAP32[$0 + 4 >> 2] | 0) <= 1) {
  return;
 }
 $14 = (HEAP32[$0 + 8 >> 2] | 0) + 24 | 0; //@line 1217
 $ReallocAsyncCtx = _emscripten_realloc_async_context(28) | 0; //@line 1219
 __ZNK10__cxxabiv122__base_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($14, $6, $8, $10); //@line 1220
 if (!___async) {
  ___async_unwind = 0; //@line 1223
 }
 HEAP32[$ReallocAsyncCtx >> 2] = 150; //@line 1225
 HEAP32[$ReallocAsyncCtx + 4 >> 2] = $6 + 54; //@line 1227
 HEAP32[$ReallocAsyncCtx + 8 >> 2] = $14; //@line 1229
 HEAP32[$ReallocAsyncCtx + 12 >> 2] = $12; //@line 1231
 HEAP32[$ReallocAsyncCtx + 16 >> 2] = $6; //@line 1233
 HEAP32[$ReallocAsyncCtx + 20 >> 2] = $8; //@line 1235
 HEAP32[$ReallocAsyncCtx + 24 >> 2] = $10; //@line 1237
 sp = STACKTOP; //@line 1238
 return;
}
function __ZNK10__cxxabiv117__class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($0, $1, $2, $3, $4) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 var $13 = 0, $19 = 0;
 do {
  if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, $4) | 0) {
   __ZNK10__cxxabiv117__class_type_info29process_static_type_below_dstEPNS_19__dynamic_cast_infoEPKvi(0, $1, $2, $3); //@line 12783
  } else {
   if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 >> 2] | 0, $4) | 0) {
    if ((HEAP32[$1 + 16 >> 2] | 0) != ($2 | 0)) {
     $13 = $1 + 20 | 0; //@line 12792
     if ((HEAP32[$13 >> 2] | 0) != ($2 | 0)) {
      HEAP32[$1 + 32 >> 2] = $3; //@line 12797
      HEAP32[$13 >> 2] = $2; //@line 12798
      $19 = $1 + 40 | 0; //@line 12799
      HEAP32[$19 >> 2] = (HEAP32[$19 >> 2] | 0) + 1; //@line 12802
      if ((HEAP32[$1 + 36 >> 2] | 0) == 1) {
       if ((HEAP32[$1 + 24 >> 2] | 0) == 2) {
        HEAP8[$1 + 54 >> 0] = 1; //@line 12812
       }
      }
      HEAP32[$1 + 44 >> 2] = 4; //@line 12816
      break;
     }
    }
    if (($3 | 0) == 1) {
     HEAP32[$1 + 32 >> 2] = 1; //@line 12823
    }
   }
  }
 } while (0);
 return;
}
function __ZL25default_terminate_handlerv__async_cb($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $15 = 0, $16 = 0, $2 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 2532
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 2534
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 2536
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 2538
 $8 = HEAP32[$0 + 20 >> 2] | 0; //@line 2540
 $10 = HEAP32[$0 + 24 >> 2] | 0; //@line 2542
 if (!(HEAP8[___async_retval >> 0] & 1)) {
  HEAP32[$4 >> 2] = 5334; //@line 2547
  HEAP32[$4 + 4 >> 2] = $6; //@line 2549
  _abort_message(5243, $4); //@line 2550
 }
 $12 = HEAP32[$2 >> 2] | 0; //@line 2553
 $15 = HEAP32[(HEAP32[$12 >> 2] | 0) + 8 >> 2] | 0; //@line 2556
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(16) | 0; //@line 2557
 $16 = FUNCTION_TABLE_ii[$15 & 15]($12) | 0; //@line 2558
 if (!___async) {
  HEAP32[___async_retval >> 2] = $16; //@line 2562
  ___async_unwind = 0; //@line 2563
 }
 HEAP32[$ReallocAsyncCtx2 >> 2] = 129; //@line 2565
 HEAP32[$ReallocAsyncCtx2 + 4 >> 2] = $8; //@line 2567
 HEAP32[$ReallocAsyncCtx2 + 8 >> 2] = $6; //@line 2569
 HEAP32[$ReallocAsyncCtx2 + 12 >> 2] = $10; //@line 2571
 sp = STACKTOP; //@line 2572
 return;
}
function ___strerror_l($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$012$lcssa = 0, $$01214 = 0, $$016 = 0, $$113 = 0, $$115 = 0, $7 = 0, label = 0, $$113$looptemp = 0;
 $$016 = 0; //@line 11465
 while (1) {
  if ((HEAPU8[3306 + $$016 >> 0] | 0) == ($0 | 0)) {
   label = 2; //@line 11472
   break;
  }
  $7 = $$016 + 1 | 0; //@line 11475
  if (($7 | 0) == 87) {
   $$01214 = 3394; //@line 11478
   $$115 = 87; //@line 11478
   label = 5; //@line 11479
   break;
  } else {
   $$016 = $7; //@line 11482
  }
 }
 if ((label | 0) == 2) {
  if (!$$016) {
   $$012$lcssa = 3394; //@line 11488
  } else {
   $$01214 = 3394; //@line 11490
   $$115 = $$016; //@line 11490
   label = 5; //@line 11491
  }
 }
 if ((label | 0) == 5) {
  while (1) {
   label = 0; //@line 11496
   $$113 = $$01214; //@line 11497
   do {
    $$113$looptemp = $$113;
    $$113 = $$113 + 1 | 0; //@line 11501
   } while ((HEAP8[$$113$looptemp >> 0] | 0) != 0);
   $$115 = $$115 + -1 | 0; //@line 11508
   if (!$$115) {
    $$012$lcssa = $$113; //@line 11511
    break;
   } else {
    $$01214 = $$113; //@line 11514
    label = 5; //@line 11515
   }
  }
 }
 return ___lctrans($$012$lcssa, HEAP32[$1 + 20 >> 2] | 0) | 0; //@line 11522
}
function __ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb($0) {
 $0 = $0 | 0;
 var $$037$off038 = 0, $$037$off039 = 0, $12 = 0, $17 = 0, $4 = 0, $6 = 0, $8 = 0, label = 0;
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 1277
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 1279
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 1281
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 1285
 if (!(HEAP8[HEAP32[$0 + 4 >> 2] >> 0] | 0)) {
  $$037$off038 = 4; //@line 1289
  label = 4; //@line 1290
 } else {
  if (!(HEAP8[HEAP32[$0 + 20 >> 2] >> 0] | 0)) {
   $$037$off038 = 3; //@line 1295
   label = 4; //@line 1296
  } else {
   $$037$off039 = 3; //@line 1298
  }
 }
 if ((label | 0) == 4) {
  HEAP32[$6 >> 2] = $4; //@line 1302
  $17 = $8 + 40 | 0; //@line 1303
  HEAP32[$17 >> 2] = (HEAP32[$17 >> 2] | 0) + 1; //@line 1306
  if ((HEAP32[$8 + 36 >> 2] | 0) == 1) {
   if ((HEAP32[$8 + 24 >> 2] | 0) == 2) {
    HEAP8[$8 + 54 >> 0] = 1; //@line 1316
    $$037$off039 = $$037$off038; //@line 1317
   } else {
    $$037$off039 = $$037$off038; //@line 1319
   }
  } else {
   $$037$off039 = $$037$off038; //@line 1322
  }
 }
 HEAP32[$12 >> 2] = $$037$off039; //@line 1325
 return;
}
function __ZN6events5EventIFvvEE10event_postIPS1_EEiPNS2_5eventE__async_cb_57($0) {
 $0 = $0 | 0;
 var $13 = 0, $14 = 0, $2 = 0, $4 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 7988
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 7990
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 7992
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 7994
 if (!$AsyncRetVal) {
  HEAP32[___async_retval >> 2] = 0; //@line 7998
  return;
 }
 HEAP32[$AsyncRetVal >> 2] = HEAP32[$2 + 28 >> 2]; //@line 8003
 _equeue_event_delay($AsyncRetVal, HEAP32[$2 + 12 >> 2] | 0); //@line 8006
 _equeue_event_period($AsyncRetVal, HEAP32[$2 + 16 >> 2] | 0); //@line 8009
 _equeue_event_dtor($AsyncRetVal, 104); //@line 8010
 $13 = HEAP32[$4 >> 2] | 0; //@line 8011
 $ReallocAsyncCtx = _emscripten_realloc_async_context(4) | 0; //@line 8012
 $14 = _equeue_post($13, 105, $AsyncRetVal) | 0; //@line 8013
 if (___async) {
  HEAP32[$ReallocAsyncCtx >> 2] = 106; //@line 8016
  sp = STACKTOP; //@line 8017
  return;
 }
 HEAP32[___async_retval >> 2] = $14; //@line 8021
 ___async_unwind = 0; //@line 8022
 HEAP32[$ReallocAsyncCtx >> 2] = 106; //@line 8023
 sp = STACKTOP; //@line 8024
 return;
}
function _strstr($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0 = 0, $2 = 0, $5 = 0;
 $2 = HEAP8[$1 >> 0] | 0; //@line 11538
 do {
  if (!($2 << 24 >> 24)) {
   $$0 = $0; //@line 11542
  } else {
   $5 = _strchr($0, $2 << 24 >> 24) | 0; //@line 11545
   if (!$5) {
    $$0 = 0; //@line 11548
   } else {
    if (!(HEAP8[$1 + 1 >> 0] | 0)) {
     $$0 = $5; //@line 11554
    } else {
     if (!(HEAP8[$5 + 1 >> 0] | 0)) {
      $$0 = 0; //@line 11560
     } else {
      if (!(HEAP8[$1 + 2 >> 0] | 0)) {
       $$0 = _twobyte_strstr($5, $1) | 0; //@line 11567
       break;
      }
      if (!(HEAP8[$5 + 2 >> 0] | 0)) {
       $$0 = 0; //@line 11574
      } else {
       if (!(HEAP8[$1 + 3 >> 0] | 0)) {
        $$0 = _threebyte_strstr($5, $1) | 0; //@line 11581
        break;
       }
       if (!(HEAP8[$5 + 3 >> 0] | 0)) {
        $$0 = 0; //@line 11588
       } else {
        if (!(HEAP8[$1 + 4 >> 0] | 0)) {
         $$0 = _fourbyte_strstr($5, $1) | 0; //@line 11595
         break;
        } else {
         $$0 = _twoway_strstr($5, $1) | 0; //@line 11599
         break;
        }
       }
      }
     }
    }
   }
  }
 } while (0);
 return $$0 | 0; //@line 11609
}
function __ZN4mbed11InterruptInD2Ev($0) {
 $0 = $0 | 0;
 var $10 = 0, $14 = 0, $3 = 0, $7 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 143
 HEAP32[$0 >> 2] = 184; //@line 144
 _gpio_irq_free($0 + 28 | 0); //@line 146
 $3 = HEAP32[$0 + 68 >> 2] | 0; //@line 148
 do {
  if ($3 | 0) {
   $7 = HEAP32[$3 + 8 >> 2] | 0; //@line 154
   $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 155
   FUNCTION_TABLE_vi[$7 & 255]($0 + 56 | 0); //@line 156
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 14; //@line 159
    HEAP32[$AsyncCtx + 4 >> 2] = $0; //@line 161
    sp = STACKTOP; //@line 162
    return;
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 165
    break;
   }
  }
 } while (0);
 $10 = HEAP32[$0 + 52 >> 2] | 0; //@line 171
 if (!$10) {
  return;
 }
 $14 = HEAP32[$10 + 8 >> 2] | 0; //@line 178
 $AsyncCtx3 = _emscripten_alloc_async_context(4, sp) | 0; //@line 179
 FUNCTION_TABLE_vi[$14 & 255]($0 + 40 | 0); //@line 180
 if (___async) {
  HEAP32[$AsyncCtx3 >> 2] = 15; //@line 183
  sp = STACKTOP; //@line 184
  return;
 }
 _emscripten_free_async_context($AsyncCtx3 | 0); //@line 187
 return;
}
function _fourbyte_strstr($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$lcssa = 0, $$sink21$lcssa = 0, $$sink2123 = 0, $18 = 0, $32 = 0, $33 = 0, $35 = 0, $39 = 0, $40 = 0, $41 = 0;
 $18 = (HEAPU8[$1 + 1 >> 0] | 0) << 16 | (HEAPU8[$1 >> 0] | 0) << 24 | (HEAPU8[$1 + 2 >> 0] | 0) << 8 | (HEAPU8[$1 + 3 >> 0] | 0); //@line 11734
 $32 = $0 + 3 | 0; //@line 11748
 $33 = HEAP8[$32 >> 0] | 0; //@line 11749
 $35 = (HEAPU8[$0 + 1 >> 0] | 0) << 16 | (HEAPU8[$0 >> 0] | 0) << 24 | (HEAPU8[$0 + 2 >> 0] | 0) << 8 | $33 & 255; //@line 11751
 if ($33 << 24 >> 24 == 0 | ($35 | 0) == ($18 | 0)) {
  $$lcssa = $33; //@line 11756
  $$sink21$lcssa = $32; //@line 11756
 } else {
  $$sink2123 = $32; //@line 11758
  $39 = $35; //@line 11758
  while (1) {
   $40 = $$sink2123 + 1 | 0; //@line 11761
   $41 = HEAP8[$40 >> 0] | 0; //@line 11762
   $39 = $39 << 8 | $41 & 255; //@line 11764
   if ($41 << 24 >> 24 == 0 | ($39 | 0) == ($18 | 0)) {
    $$lcssa = $41; //@line 11769
    $$sink21$lcssa = $40; //@line 11769
    break;
   } else {
    $$sink2123 = $40; //@line 11772
   }
  }
 }
 return ($$lcssa << 24 >> 24 ? $$sink21$lcssa + -3 | 0 : 0) | 0; //@line 11779
}
function __ZN4mbed8CallbackIFvvEE13function_dtorIN6events5EventIS1_EEEEvPv($0) {
 $0 = $0 | 0;
 var $1 = 0, $11 = 0, $4 = 0, $7 = 0, $9 = 0, $AsyncCtx = 0, $AsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 4247
 $1 = HEAP32[$0 >> 2] | 0; //@line 4248
 if (!$1) {
  return;
 }
 $4 = (HEAP32[$1 >> 2] | 0) + -1 | 0; //@line 4254
 HEAP32[$1 >> 2] = $4; //@line 4255
 if ($4 | 0) {
  return;
 }
 $7 = HEAP32[$1 + 24 >> 2] | 0; //@line 4261
 $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 4262
 FUNCTION_TABLE_vi[$7 & 255]($1); //@line 4263
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 109; //@line 4266
  HEAP32[$AsyncCtx + 4 >> 2] = $0; //@line 4268
  sp = STACKTOP; //@line 4269
  return;
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 4272
 $9 = HEAP32[$0 >> 2] | 0; //@line 4273
 $11 = HEAP32[$9 + 4 >> 2] | 0; //@line 4275
 $AsyncCtx2 = _emscripten_alloc_async_context(4, sp) | 0; //@line 4276
 _equeue_dealloc($11, $9); //@line 4277
 if (___async) {
  HEAP32[$AsyncCtx2 >> 2] = 110; //@line 4280
  sp = STACKTOP; //@line 4281
  return;
 }
 _emscripten_free_async_context($AsyncCtx2 | 0); //@line 4284
 return;
}
function _mbed_vtracef__async_cb_20($0) {
 $0 = $0 | 0;
 var $3 = 0, $5 = 0, $6 = 0, $7 = 0, $ReallocAsyncCtx2 = 0, $ReallocAsyncCtx4 = 0, sp = 0;
 sp = STACKTOP; //@line 2484
 $3 = HEAP32[60] | 0; //@line 2488
 if (HEAP8[$0 + 4 >> 0] & 1 & ($3 | 0) != 0) {
  $5 = HEAP32[52] | 0; //@line 2492
  $ReallocAsyncCtx2 = _emscripten_realloc_async_context(4) | 0; //@line 2493
  FUNCTION_TABLE_vi[$3 & 255]($5); //@line 2494
  if (___async) {
   HEAP32[$ReallocAsyncCtx2 >> 2] = 39; //@line 2497
   sp = STACKTOP; //@line 2498
   return;
  }
  ___async_unwind = 0; //@line 2501
  HEAP32[$ReallocAsyncCtx2 >> 2] = 39; //@line 2502
  sp = STACKTOP; //@line 2503
  return;
 } else {
  $6 = HEAP32[59] | 0; //@line 2506
  $7 = HEAP32[52] | 0; //@line 2507
  $ReallocAsyncCtx4 = _emscripten_realloc_async_context(4) | 0; //@line 2508
  FUNCTION_TABLE_vi[$6 & 255]($7); //@line 2509
  if (___async) {
   HEAP32[$ReallocAsyncCtx4 >> 2] = 41; //@line 2512
   sp = STACKTOP; //@line 2513
   return;
  }
  ___async_unwind = 0; //@line 2516
  HEAP32[$ReallocAsyncCtx4 >> 2] = 41; //@line 2517
  sp = STACKTOP; //@line 2518
  return;
 }
}
function _invoke_ticker($0) {
 $0 = $0 | 0;
 var $2 = 0, $3 = 0, $7 = 0, $8 = 0, $AsyncCtx = 0, $AsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 3073
 $2 = $0 + 12 | 0; //@line 3075
 $3 = HEAP32[$2 >> 2] | 0; //@line 3076
 do {
  if (!$3) {
   $AsyncCtx2 = _emscripten_alloc_async_context(12, sp) | 0; //@line 3080
   _mbed_assert_internal(1762, 1767, 528); //@line 3081
   if (___async) {
    HEAP32[$AsyncCtx2 >> 2] = 73; //@line 3084
    HEAP32[$AsyncCtx2 + 4 >> 2] = $2; //@line 3086
    HEAP32[$AsyncCtx2 + 8 >> 2] = $0; //@line 3088
    sp = STACKTOP; //@line 3089
    return;
   } else {
    _emscripten_free_async_context($AsyncCtx2 | 0); //@line 3092
    $8 = HEAP32[$2 >> 2] | 0; //@line 3094
    break;
   }
  } else {
   $8 = $3; //@line 3098
  }
 } while (0);
 $7 = HEAP32[$8 >> 2] | 0; //@line 3101
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 3103
 FUNCTION_TABLE_vi[$7 & 255]($0); //@line 3104
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 74; //@line 3107
  sp = STACKTOP; //@line 3108
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 3111
  return;
 }
}
function _abort_message($0, $varargs) {
 $0 = $0 | 0;
 $varargs = $varargs | 0;
 var $1 = 0, $2 = 0, $AsyncCtx = 0, $AsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 12616
 STACKTOP = STACKTOP + 16 | 0; //@line 12617
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 12617
 $1 = sp; //@line 12618
 HEAP32[$1 >> 2] = $varargs; //@line 12619
 $2 = HEAP32[84] | 0; //@line 12620
 $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 12621
 _vfprintf($2, $0, $1) | 0; //@line 12622
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 130; //@line 12625
  HEAP32[$AsyncCtx + 4 >> 2] = $2; //@line 12627
  sp = STACKTOP; //@line 12628
  STACKTOP = sp; //@line 12629
  return;
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 12631
 $AsyncCtx2 = _emscripten_alloc_async_context(4, sp) | 0; //@line 12632
 _fputc(10, $2) | 0; //@line 12633
 if (___async) {
  HEAP32[$AsyncCtx2 >> 2] = 131; //@line 12636
  sp = STACKTOP; //@line 12637
  STACKTOP = sp; //@line 12638
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx2 | 0); //@line 12640
  _abort(); //@line 12641
 }
}
function _threebyte_strstr($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$016$lcssa = 0, $$01618 = 0, $$019 = 0, $$lcssa = 0, $14 = 0, $23 = 0, $24 = 0, $27 = 0, $30 = 0, $31 = 0;
 $14 = (HEAPU8[$1 + 1 >> 0] | 0) << 16 | (HEAPU8[$1 >> 0] | 0) << 24 | (HEAPU8[$1 + 2 >> 0] | 0) << 8; //@line 11668
 $23 = $0 + 2 | 0; //@line 11677
 $24 = HEAP8[$23 >> 0] | 0; //@line 11678
 $27 = (HEAPU8[$0 + 1 >> 0] | 0) << 16 | (HEAPU8[$0 >> 0] | 0) << 24 | ($24 & 255) << 8; //@line 11681
 if (($27 | 0) == ($14 | 0) | $24 << 24 >> 24 == 0) {
  $$016$lcssa = $23; //@line 11686
  $$lcssa = $24; //@line 11686
 } else {
  $$01618 = $23; //@line 11688
  $$019 = $27; //@line 11688
  while (1) {
   $30 = $$01618 + 1 | 0; //@line 11690
   $31 = HEAP8[$30 >> 0] | 0; //@line 11691
   $$019 = ($$019 | $31 & 255) << 8; //@line 11694
   if (($$019 | 0) == ($14 | 0) | $31 << 24 >> 24 == 0) {
    $$016$lcssa = $30; //@line 11699
    $$lcssa = $31; //@line 11699
    break;
   } else {
    $$01618 = $30; //@line 11702
   }
  }
 }
 return ($$lcssa << 24 >> 24 ? $$016$lcssa + -2 | 0 : 0) | 0; //@line 11709
}
function _frexp($0, $1) {
 $0 = +$0;
 $1 = $1 | 0;
 var $$0 = 0.0, $$016 = 0.0, $2 = 0, $3 = 0, $4 = 0, $9 = 0.0, $storemerge = 0;
 HEAPF64[tempDoublePtr >> 3] = $0; //@line 11296
 $2 = HEAP32[tempDoublePtr >> 2] | 0; //@line 11296
 $3 = HEAP32[tempDoublePtr + 4 >> 2] | 0; //@line 11297
 $4 = _bitshift64Lshr($2 | 0, $3 | 0, 52) | 0; //@line 11298
 switch ($4 & 2047) {
 case 0:
  {
   if ($0 != 0.0) {
    $9 = +_frexp($0 * 18446744073709552000.0, $1); //@line 11307
    $$016 = $9; //@line 11310
    $storemerge = (HEAP32[$1 >> 2] | 0) + -64 | 0; //@line 11310
   } else {
    $$016 = $0; //@line 11312
    $storemerge = 0; //@line 11312
   }
   HEAP32[$1 >> 2] = $storemerge; //@line 11314
   $$0 = $$016; //@line 11315
   break;
  }
 case 2047:
  {
   $$0 = $0; //@line 11319
   break;
  }
 default:
  {
   HEAP32[$1 >> 2] = ($4 & 2047) + -1022; //@line 11325
   HEAP32[tempDoublePtr >> 2] = $2; //@line 11328
   HEAP32[tempDoublePtr + 4 >> 2] = $3 & -2146435073 | 1071644672; //@line 11328
   $$0 = +HEAPF64[tempDoublePtr >> 3]; //@line 11329
  }
 }
 return +$$0;
}
function _equeue_sema_wait($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $2 = 0, $20 = 0, $3 = 0, $4 = 0, sp = 0;
 sp = STACKTOP; //@line 1698
 STACKTOP = STACKTOP + 16 | 0; //@line 1699
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 1699
 $2 = sp + 8 | 0; //@line 1700
 $3 = sp; //@line 1701
 _pthread_mutex_lock($0 | 0) | 0; //@line 1702
 $4 = $0 + 76 | 0; //@line 1703
 do {
  if (!(HEAP8[$4 >> 0] | 0)) {
   if (($1 | 0) < 0) {
    _pthread_cond_wait($0 + 28 | 0, $0 | 0) | 0; //@line 1711
    break;
   } else {
    _gettimeofday($2 | 0, 0) | 0; //@line 1714
    HEAP32[$3 >> 2] = (HEAP32[$2 >> 2] | 0) + (($1 >>> 0) / 1e3 | 0); //@line 1718
    HEAP32[$3 + 4 >> 2] = ((HEAP32[$2 + 4 >> 2] | 0) * 1e3 | 0) + ($1 * 1e6 | 0); //@line 1725
    _pthread_cond_timedwait($0 + 28 | 0, $0 | 0, $3 | 0) | 0; //@line 1727
    break;
   }
  }
 } while (0);
 $20 = (HEAP8[$4 >> 0] | 0) != 0; //@line 1733
 HEAP8[$4 >> 0] = 0; //@line 1734
 _pthread_mutex_unlock($0 | 0) | 0; //@line 1735
 STACKTOP = sp; //@line 1736
 return $20 | 0; //@line 1736
}
function __ZN4mbed8CallbackIFvvEE13function_callIN6events5EventIS1_EEEEvPKv($0) {
 $0 = $0 | 0;
 var $1 = 0, $4 = 0, $5 = 0, $AsyncCtx = 0, $AsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 4191
 $1 = HEAP32[$0 >> 2] | 0; //@line 4192
 if ($1 | 0) {
  $4 = HEAP32[$1 + 20 >> 2] | 0; //@line 4196
  $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 4197
  $5 = FUNCTION_TABLE_ii[$4 & 15]($1) | 0; //@line 4198
  if (___async) {
   HEAP32[$AsyncCtx >> 2] = 107; //@line 4201
   HEAP32[$AsyncCtx + 4 >> 2] = $0; //@line 4203
   sp = STACKTOP; //@line 4204
   return;
  }
  _emscripten_free_async_context($AsyncCtx | 0); //@line 4207
  HEAP32[(HEAP32[$0 >> 2] | 0) + 8 >> 2] = $5; //@line 4210
  if ($5 | 0) {
   return;
  }
 }
 $AsyncCtx2 = _emscripten_alloc_async_context(4, sp) | 0; //@line 4216
 _mbed_assert_internal(2690, 2693, 149); //@line 4217
 if (___async) {
  HEAP32[$AsyncCtx2 >> 2] = 108; //@line 4220
  sp = STACKTOP; //@line 4221
  return;
 }
 _emscripten_free_async_context($AsyncCtx2 | 0); //@line 4224
 return;
}
function __ZNK10__cxxabiv120__si_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($0, $1, $2, $3, $4, $5) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 $5 = $5 | 0;
 var $10 = 0, $13 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 13139
 do {
  if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, $5) | 0) {
   __ZNK10__cxxabiv117__class_type_info29process_static_type_above_dstEPNS_19__dynamic_cast_infoEPKvS4_i(0, $1, $2, $3, $4); //@line 13145
  } else {
   $10 = HEAP32[$0 + 8 >> 2] | 0; //@line 13148
   $13 = HEAP32[(HEAP32[$10 >> 2] | 0) + 20 >> 2] | 0; //@line 13151
   $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 13152
   FUNCTION_TABLE_viiiiii[$13 & 3]($10, $1, $2, $3, $4, $5); //@line 13153
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 136; //@line 13156
    sp = STACKTOP; //@line 13157
    return;
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 13160
    break;
   }
  }
 } while (0);
 return;
}
function _vfprintf__async_cb($0) {
 $0 = $0 | 0;
 var $$ = 0, $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $2 = 0, $20 = 0, $22 = 0, $33 = 0;
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 7184
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 7192
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 7194
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 7196
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 7198
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 7200
 $20 = HEAP32[$0 + 40 >> 2] | 0; //@line 7202
 $22 = HEAP32[$0 + 44 >> 2] | 0; //@line 7204
 $$ = (HEAP32[$2 >> 2] | 0) == 0 ? -1 : HEAP32[$0 + 8 >> 2] | 0; //@line 7215
 HEAP32[HEAP32[$0 + 16 >> 2] >> 2] = HEAP32[$0 + 12 >> 2]; //@line 7216
 HEAP32[$10 >> 2] = 0; //@line 7217
 HEAP32[$12 >> 2] = 0; //@line 7218
 HEAP32[$14 >> 2] = 0; //@line 7219
 HEAP32[$2 >> 2] = 0; //@line 7220
 $33 = HEAP32[$16 >> 2] | 0; //@line 7221
 HEAP32[$16 >> 2] = $33 | $18; //@line 7226
 if ($20 | 0) {
  ___unlockfile($22); //@line 7229
 }
 HEAP32[___async_retval >> 2] = ($33 & 32 | 0) == 0 ? $$ : -1; //@line 7232
 return;
}
function _mbed_vtracef__async_cb_17($0) {
 $0 = $0 | 0;
 var $$pre = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $ReallocAsyncCtx9 = 0, sp = 0;
 sp = STACKTOP; //@line 2215
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 2219
 if ((HEAP32[$0 + 4 >> 2] | 0) <= 2) {
  return;
 }
 $5 = $4 + -1 | 0; //@line 2224
 $$pre = HEAP32[62] | 0; //@line 2225
 $ReallocAsyncCtx9 = _emscripten_realloc_async_context(12) | 0; //@line 2226
 FUNCTION_TABLE_v[$$pre & 3](); //@line 2227
 if (___async) {
  HEAP32[$ReallocAsyncCtx9 >> 2] = 48; //@line 2230
  $6 = $ReallocAsyncCtx9 + 4 | 0; //@line 2231
  HEAP32[$6 >> 2] = $4; //@line 2232
  $7 = $ReallocAsyncCtx9 + 8 | 0; //@line 2233
  HEAP32[$7 >> 2] = $5; //@line 2234
  sp = STACKTOP; //@line 2235
  return;
 }
 ___async_unwind = 0; //@line 2238
 HEAP32[$ReallocAsyncCtx9 >> 2] = 48; //@line 2239
 $6 = $ReallocAsyncCtx9 + 4 | 0; //@line 2240
 HEAP32[$6 >> 2] = $4; //@line 2241
 $7 = $ReallocAsyncCtx9 + 8 | 0; //@line 2242
 HEAP32[$7 >> 2] = $5; //@line 2243
 sp = STACKTOP; //@line 2244
 return;
}
function ___cxa_can_catch($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $3 = 0, $7 = 0, $8 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 846
 STACKTOP = STACKTOP + 16 | 0; //@line 847
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 847
 $3 = sp; //@line 848
 HEAP32[$3 >> 2] = HEAP32[$2 >> 2]; //@line 850
 $7 = HEAP32[(HEAP32[$0 >> 2] | 0) + 16 >> 2] | 0; //@line 853
 $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 854
 $8 = FUNCTION_TABLE_iiii[$7 & 7]($0, $1, $3) | 0; //@line 855
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 154; //@line 858
  HEAP32[$AsyncCtx + 4 >> 2] = $3; //@line 860
  HEAP32[$AsyncCtx + 8 >> 2] = $2; //@line 862
  HEAP32[$AsyncCtx + 12 >> 2] = $3; //@line 864
  sp = STACKTOP; //@line 865
  STACKTOP = sp; //@line 866
  return 0; //@line 866
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 868
 if ($8) {
  HEAP32[$2 >> 2] = HEAP32[$3 >> 2]; //@line 872
 }
 STACKTOP = sp; //@line 874
 return $8 & 1 | 0; //@line 874
}
function __Z8btn_fallv() {
 var $0 = 0, $AsyncCtx = 0, $vararg_buffer = 0, sp = 0;
 sp = STACKTOP; //@line 3881
 STACKTOP = STACKTOP + 16 | 0; //@line 3882
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 3882
 $vararg_buffer = sp; //@line 3883
 $0 = HEAP32[1458] | 0; //@line 3884
 HEAP32[$0 >> 2] = (HEAP32[$0 >> 2] | 0) + 1; //@line 3887
 $AsyncCtx = _emscripten_alloc_async_context(12, sp) | 0; //@line 3888
 __ZN20SimulatorBlockDevice7programEPKvyy(5776, $0, 0, 0, 512, 0) | 0; //@line 3889
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 90; //@line 3892
  HEAP32[$AsyncCtx + 4 >> 2] = $vararg_buffer; //@line 3894
  HEAP32[$AsyncCtx + 8 >> 2] = $vararg_buffer; //@line 3896
  sp = STACKTOP; //@line 3897
  STACKTOP = sp; //@line 3898
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 3900
  HEAP32[$vararg_buffer >> 2] = HEAP32[HEAP32[1458] >> 2]; //@line 3903
  _printf(2383, $vararg_buffer) | 0; //@line 3904
  STACKTOP = sp; //@line 3905
  return;
 }
}
function _mbed_vtracef__async_cb_16($0) {
 $0 = $0 | 0;
 var $$pre = 0, $2 = 0, $4 = 0, $5 = 0, $6 = 0, $ReallocAsyncCtx9 = 0, sp = 0;
 sp = STACKTOP; //@line 2182
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 2184
 if (($2 | 0) <= 1) {
  return;
 }
 $4 = $2 + -1 | 0; //@line 2189
 $$pre = HEAP32[62] | 0; //@line 2190
 $ReallocAsyncCtx9 = _emscripten_realloc_async_context(12) | 0; //@line 2191
 FUNCTION_TABLE_v[$$pre & 3](); //@line 2192
 if (___async) {
  HEAP32[$ReallocAsyncCtx9 >> 2] = 48; //@line 2195
  $5 = $ReallocAsyncCtx9 + 4 | 0; //@line 2196
  HEAP32[$5 >> 2] = $2; //@line 2197
  $6 = $ReallocAsyncCtx9 + 8 | 0; //@line 2198
  HEAP32[$6 >> 2] = $4; //@line 2199
  sp = STACKTOP; //@line 2200
  return;
 }
 ___async_unwind = 0; //@line 2203
 HEAP32[$ReallocAsyncCtx9 >> 2] = 48; //@line 2204
 $5 = $ReallocAsyncCtx9 + 4 | 0; //@line 2205
 HEAP32[$5 >> 2] = $2; //@line 2206
 $6 = $ReallocAsyncCtx9 + 8 | 0; //@line 2207
 HEAP32[$6 >> 2] = $4; //@line 2208
 sp = STACKTOP; //@line 2209
 return;
}
function __ZNK10__cxxabiv120__si_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $11 = 0, $8 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 13308
 do {
  if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, 0) | 0) {
   __ZNK10__cxxabiv117__class_type_info24process_found_base_classEPNS_19__dynamic_cast_infoEPvi(0, $1, $2, $3); //@line 13314
  } else {
   $8 = HEAP32[$0 + 8 >> 2] | 0; //@line 13317
   $11 = HEAP32[(HEAP32[$8 >> 2] | 0) + 28 >> 2] | 0; //@line 13320
   $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 13321
   FUNCTION_TABLE_viiii[$11 & 3]($8, $1, $2, $3); //@line 13322
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 139; //@line 13325
    sp = STACKTOP; //@line 13326
    return;
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 13329
    break;
   }
  }
 } while (0);
 return;
}
function __ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($0, $1, $2, $3, $4, $5) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 $5 = $5 | 0;
 var $$0 = 0, $14 = 0, $17 = 0, $7 = 0, $8 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 765
 $7 = HEAP32[$0 + 4 >> 2] | 0; //@line 767
 $8 = $7 >> 8; //@line 768
 if (!($7 & 1)) {
  $$0 = $8; //@line 772
 } else {
  $$0 = HEAP32[(HEAP32[$3 >> 2] | 0) + $8 >> 2] | 0; //@line 777
 }
 $14 = HEAP32[$0 >> 2] | 0; //@line 779
 $17 = HEAP32[(HEAP32[$14 >> 2] | 0) + 20 >> 2] | 0; //@line 782
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 787
 FUNCTION_TABLE_viiiiii[$17 & 3]($14, $1, $2, $3 + $$0 | 0, $7 & 2 | 0 ? $4 : 2, $5); //@line 788
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 152; //@line 791
  sp = STACKTOP; //@line 792
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 795
  return;
 }
}
function ___dynamic_cast__async_cb_29($0) {
 $0 = $0 | 0;
 var $$0 = 0, $10 = 0, $16 = 0, $6 = 0, $8 = 0;
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 5408
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 5410
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 5412
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 5418
 L2 : do {
  switch (HEAP32[HEAP32[$0 + 4 >> 2] >> 2] | 0) {
  case 0:
   {
    $$0 = (HEAP32[$6 >> 2] | 0) == 1 & (HEAP32[$8 >> 2] | 0) == 1 & (HEAP32[$10 >> 2] | 0) == 1 ? HEAP32[HEAP32[$0 + 24 >> 2] >> 2] | 0 : 0; //@line 5433
    break;
   }
  case 1:
   {
    if ((HEAP32[HEAP32[$0 + 28 >> 2] >> 2] | 0) != 1) {
     if (!((HEAP32[$6 >> 2] | 0) == 0 & (HEAP32[$8 >> 2] | 0) == 1 & (HEAP32[$10 >> 2] | 0) == 1)) {
      $$0 = 0; //@line 5449
      break L2;
     }
    }
    $$0 = HEAP32[$16 >> 2] | 0; //@line 5454
    break;
   }
  default:
   {
    $$0 = 0; //@line 5458
   }
  }
 } while (0);
 HEAP32[___async_retval >> 2] = $$0; //@line 5463
 return;
}
function _mbed_error_vfprintf__async_cb_48($0) {
 $0 = $0 | 0;
 var $10 = 0, $2 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 7058
 $2 = HEAP8[$0 + 4 >> 0] | 0; //@line 7060
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 7062
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 7064
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 7066
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 7068
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(24) | 0; //@line 7070
 _serial_putc(5824, $2 << 24 >> 24); //@line 7071
 if (!___async) {
  ___async_unwind = 0; //@line 7074
 }
 HEAP32[$ReallocAsyncCtx2 >> 2] = 69; //@line 7076
 HEAP32[$ReallocAsyncCtx2 + 4 >> 2] = $4; //@line 7078
 HEAP32[$ReallocAsyncCtx2 + 8 >> 2] = $6; //@line 7080
 HEAP32[$ReallocAsyncCtx2 + 12 >> 2] = $8; //@line 7082
 HEAP8[$ReallocAsyncCtx2 + 16 >> 0] = $2; //@line 7084
 HEAP32[$ReallocAsyncCtx2 + 20 >> 2] = $10; //@line 7086
 sp = STACKTOP; //@line 7087
 return;
}
function __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($0, $1, $2, $3, $4) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 var $$0 = 0, $13 = 0, $16 = 0, $6 = 0, $7 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 807
 $6 = HEAP32[$0 + 4 >> 2] | 0; //@line 809
 $7 = $6 >> 8; //@line 810
 if (!($6 & 1)) {
  $$0 = $7; //@line 814
 } else {
  $$0 = HEAP32[(HEAP32[$2 >> 2] | 0) + $7 >> 2] | 0; //@line 819
 }
 $13 = HEAP32[$0 >> 2] | 0; //@line 821
 $16 = HEAP32[(HEAP32[$13 >> 2] | 0) + 24 >> 2] | 0; //@line 824
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 829
 FUNCTION_TABLE_viiiii[$16 & 3]($13, $1, $2 + $$0 | 0, $6 & 2 | 0 ? $3 : 2, $4); //@line 830
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 153; //@line 833
  sp = STACKTOP; //@line 834
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 837
  return;
 }
}
function __ZNK10__cxxabiv122__base_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $$0 = 0, $12 = 0, $15 = 0, $5 = 0, $6 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 722
 $5 = HEAP32[$0 + 4 >> 2] | 0; //@line 724
 $6 = $5 >> 8; //@line 725
 if (!($5 & 1)) {
  $$0 = $6; //@line 729
 } else {
  $$0 = HEAP32[(HEAP32[$2 >> 2] | 0) + $6 >> 2] | 0; //@line 734
 }
 $12 = HEAP32[$0 >> 2] | 0; //@line 736
 $15 = HEAP32[(HEAP32[$12 >> 2] | 0) + 28 >> 2] | 0; //@line 739
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 744
 FUNCTION_TABLE_viiii[$15 & 3]($12, $1, $2 + $$0 | 0, $5 & 2 | 0 ? $3 : 2); //@line 745
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 151; //@line 748
  sp = STACKTOP; //@line 749
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 752
  return;
 }
}
function _pad_676($0, $1, $2, $3, $4) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 var $$0$lcssa = 0, $$011 = 0, $14 = 0, $5 = 0, $9 = 0, sp = 0;
 sp = STACKTOP; //@line 10294
 STACKTOP = STACKTOP + 256 | 0; //@line 10295
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(256); //@line 10295
 $5 = sp; //@line 10296
 if (($2 | 0) > ($3 | 0) & ($4 & 73728 | 0) == 0) {
  $9 = $2 - $3 | 0; //@line 10302
  _memset($5 | 0, $1 << 24 >> 24 | 0, ($9 >>> 0 < 256 ? $9 : 256) | 0) | 0; //@line 10306
  if ($9 >>> 0 > 255) {
   $14 = $2 - $3 | 0; //@line 10309
   $$011 = $9; //@line 10310
   do {
    _out_670($0, $5, 256); //@line 10312
    $$011 = $$011 + -256 | 0; //@line 10313
   } while ($$011 >>> 0 > 255);
   $$0$lcssa = $14 & 255; //@line 10322
  } else {
   $$0$lcssa = $9; //@line 10324
  }
  _out_670($0, $5, $$0$lcssa); //@line 10326
 }
 STACKTOP = sp; //@line 10328
 return;
}
function _main__async_cb_39($0) {
 $0 = $0 | 0;
 var $10 = 0, $2 = 0, $4 = 0, $9 = 0, $ReallocAsyncCtx11 = 0, sp = 0;
 sp = STACKTOP; //@line 6187
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 6189
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 6191
 HEAP32[$4 >> 2] = HEAP32[HEAP32[1458] >> 2]; //@line 6196
 _printf(2661, $4) | 0; //@line 6197
 $ReallocAsyncCtx11 = _emscripten_realloc_async_context(8) | 0; //@line 6198
 $9 = _equeue_alloc(5836, 32) | 0; //@line 6199
 if (___async) {
  HEAP32[$ReallocAsyncCtx11 >> 2] = 96; //@line 6202
  $10 = $ReallocAsyncCtx11 + 4 | 0; //@line 6203
  HEAP32[$10 >> 2] = $2; //@line 6204
  sp = STACKTOP; //@line 6205
  return;
 }
 HEAP32[___async_retval >> 2] = $9; //@line 6209
 ___async_unwind = 0; //@line 6210
 HEAP32[$ReallocAsyncCtx11 >> 2] = 96; //@line 6211
 $10 = $ReallocAsyncCtx11 + 4 | 0; //@line 6212
 HEAP32[$10 >> 2] = $2; //@line 6213
 sp = STACKTOP; //@line 6214
 return;
}
function __ZN4mbed11InterruptInD0Ev__async_cb($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $8 = 0, $9 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 8052
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 8054
 $4 = HEAP32[$2 + 52 >> 2] | 0; //@line 8056
 if (!$4) {
  __ZdlPv($2); //@line 8059
  return;
 }
 $8 = HEAP32[$4 + 8 >> 2] | 0; //@line 8064
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(8) | 0; //@line 8065
 FUNCTION_TABLE_vi[$8 & 255]($2 + 40 | 0); //@line 8066
 if (___async) {
  HEAP32[$ReallocAsyncCtx2 >> 2] = 17; //@line 8069
  $9 = $ReallocAsyncCtx2 + 4 | 0; //@line 8070
  HEAP32[$9 >> 2] = $2; //@line 8071
  sp = STACKTOP; //@line 8072
  return;
 }
 ___async_unwind = 0; //@line 8075
 HEAP32[$ReallocAsyncCtx2 >> 2] = 17; //@line 8076
 $9 = $ReallocAsyncCtx2 + 4 | 0; //@line 8077
 HEAP32[$9 >> 2] = $2; //@line 8078
 sp = STACKTOP; //@line 8079
 return;
}
function ___stdio_seek($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $10 = 0, $3 = 0, $vararg_buffer = 0, sp = 0;
 sp = STACKTOP; //@line 7589
 STACKTOP = STACKTOP + 32 | 0; //@line 7590
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(32); //@line 7590
 $vararg_buffer = sp; //@line 7591
 $3 = sp + 20 | 0; //@line 7592
 HEAP32[$vararg_buffer >> 2] = HEAP32[$0 + 60 >> 2]; //@line 7596
 HEAP32[$vararg_buffer + 4 >> 2] = 0; //@line 7598
 HEAP32[$vararg_buffer + 8 >> 2] = $1; //@line 7600
 HEAP32[$vararg_buffer + 12 >> 2] = $3; //@line 7602
 HEAP32[$vararg_buffer + 16 >> 2] = $2; //@line 7604
 if ((___syscall_ret(___syscall140(140, $vararg_buffer | 0) | 0) | 0) < 0) {
  HEAP32[$3 >> 2] = -1; //@line 7609
  $10 = -1; //@line 7610
 } else {
  $10 = HEAP32[$3 >> 2] | 0; //@line 7613
 }
 STACKTOP = sp; //@line 7615
 return $10 | 0; //@line 7615
}
function _mbed_assert_internal($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $AsyncCtx = 0, $vararg_buffer = 0, sp = 0;
 sp = STACKTOP; //@line 2480
 STACKTOP = STACKTOP + 16 | 0; //@line 2481
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 2481
 $vararg_buffer = sp; //@line 2482
 HEAP32[$vararg_buffer >> 2] = $0; //@line 2483
 HEAP32[$vararg_buffer + 4 >> 2] = $1; //@line 2485
 HEAP32[$vararg_buffer + 8 >> 2] = $2; //@line 2487
 _mbed_error_printf(1490, $vararg_buffer); //@line 2488
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 2489
 _mbed_die(); //@line 2490
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 49; //@line 2493
  sp = STACKTOP; //@line 2494
  STACKTOP = sp; //@line 2495
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 2497
  STACKTOP = sp; //@line 2498
  return;
 }
}
function _printf($0, $varargs) {
 $0 = $0 | 0;
 $varargs = $varargs | 0;
 var $1 = 0, $2 = 0, $3 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 12294
 STACKTOP = STACKTOP + 16 | 0; //@line 12295
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 12295
 $1 = sp; //@line 12296
 HEAP32[$1 >> 2] = $varargs; //@line 12297
 $2 = HEAP32[116] | 0; //@line 12298
 $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 12299
 $3 = _vfprintf($2, $0, $1) | 0; //@line 12300
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 124; //@line 12303
  HEAP32[$AsyncCtx + 4 >> 2] = $1; //@line 12305
  sp = STACKTOP; //@line 12306
  STACKTOP = sp; //@line 12307
  return 0; //@line 12307
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 12309
  STACKTOP = sp; //@line 12310
  return $3 | 0; //@line 12310
 }
 return 0; //@line 12312
}
function _snprintf($0, $1, $2, $varargs) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $varargs = $varargs | 0;
 var $3 = 0, $4 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 12173
 STACKTOP = STACKTOP + 16 | 0; //@line 12174
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 12174
 $3 = sp; //@line 12175
 HEAP32[$3 >> 2] = $varargs; //@line 12176
 $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 12177
 $4 = _vsnprintf($0, $1, $2, $3) | 0; //@line 12178
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 122; //@line 12181
  HEAP32[$AsyncCtx + 4 >> 2] = $3; //@line 12183
  sp = STACKTOP; //@line 12184
  STACKTOP = sp; //@line 12185
  return 0; //@line 12185
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 12187
  STACKTOP = sp; //@line 12188
  return $4 | 0; //@line 12188
 }
 return 0; //@line 12190
}
function _mbed_vtracef__async_cb_15($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $5 = 0, $ReallocAsyncCtx8 = 0, sp = 0;
 sp = STACKTOP; //@line 2152
 HEAP32[56] = HEAP32[54]; //@line 2154
 $2 = HEAP32[62] | 0; //@line 2155
 if (!$2) {
  return;
 }
 $4 = HEAP32[63] | 0; //@line 2160
 HEAP32[63] = 0; //@line 2161
 $ReallocAsyncCtx8 = _emscripten_realloc_async_context(8) | 0; //@line 2162
 FUNCTION_TABLE_v[$2 & 3](); //@line 2163
 if (___async) {
  HEAP32[$ReallocAsyncCtx8 >> 2] = 47; //@line 2166
  $5 = $ReallocAsyncCtx8 + 4 | 0; //@line 2167
  HEAP32[$5 >> 2] = $4; //@line 2168
  sp = STACKTOP; //@line 2169
  return;
 }
 ___async_unwind = 0; //@line 2172
 HEAP32[$ReallocAsyncCtx8 >> 2] = 47; //@line 2173
 $5 = $ReallocAsyncCtx8 + 4 | 0; //@line 2174
 HEAP32[$5 >> 2] = $4; //@line 2175
 sp = STACKTOP; //@line 2176
 return;
}
function _mbed_vtracef__async_cb_12($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $5 = 0, $ReallocAsyncCtx8 = 0, sp = 0;
 sp = STACKTOP; //@line 1888
 HEAP32[56] = HEAP32[54]; //@line 1890
 $2 = HEAP32[62] | 0; //@line 1891
 if (!$2) {
  return;
 }
 $4 = HEAP32[63] | 0; //@line 1896
 HEAP32[63] = 0; //@line 1897
 $ReallocAsyncCtx8 = _emscripten_realloc_async_context(8) | 0; //@line 1898
 FUNCTION_TABLE_v[$2 & 3](); //@line 1899
 if (___async) {
  HEAP32[$ReallocAsyncCtx8 >> 2] = 47; //@line 1902
  $5 = $ReallocAsyncCtx8 + 4 | 0; //@line 1903
  HEAP32[$5 >> 2] = $4; //@line 1904
  sp = STACKTOP; //@line 1905
  return;
 }
 ___async_unwind = 0; //@line 1908
 HEAP32[$ReallocAsyncCtx8 >> 2] = 47; //@line 1909
 $5 = $ReallocAsyncCtx8 + 4 | 0; //@line 1910
 HEAP32[$5 >> 2] = $4; //@line 1911
 sp = STACKTOP; //@line 1912
 return;
}
function _mbed_vtracef__async_cb_11($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $5 = 0, $ReallocAsyncCtx8 = 0, sp = 0;
 sp = STACKTOP; //@line 1858
 HEAP32[56] = HEAP32[54]; //@line 1860
 $2 = HEAP32[62] | 0; //@line 1861
 if (!$2) {
  return;
 }
 $4 = HEAP32[63] | 0; //@line 1866
 HEAP32[63] = 0; //@line 1867
 $ReallocAsyncCtx8 = _emscripten_realloc_async_context(8) | 0; //@line 1868
 FUNCTION_TABLE_v[$2 & 3](); //@line 1869
 if (___async) {
  HEAP32[$ReallocAsyncCtx8 >> 2] = 47; //@line 1872
  $5 = $ReallocAsyncCtx8 + 4 | 0; //@line 1873
  HEAP32[$5 >> 2] = $4; //@line 1874
  sp = STACKTOP; //@line 1875
  return;
 }
 ___async_unwind = 0; //@line 1878
 HEAP32[$ReallocAsyncCtx8 >> 2] = 47; //@line 1879
 $5 = $ReallocAsyncCtx8 + 4 | 0; //@line 1880
 HEAP32[$5 >> 2] = $4; //@line 1881
 sp = STACKTOP; //@line 1882
 return;
}
function __ZNK10__cxxabiv117__class_type_info24process_found_base_classEPNS_19__dynamic_cast_infoEPvi($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $10 = 0, $13 = 0, $4 = 0, $5 = 0;
 $4 = $1 + 16 | 0; //@line 12861
 $5 = HEAP32[$4 >> 2] | 0; //@line 12862
 do {
  if (!$5) {
   HEAP32[$4 >> 2] = $2; //@line 12866
   HEAP32[$1 + 24 >> 2] = $3; //@line 12868
   HEAP32[$1 + 36 >> 2] = 1; //@line 12870
  } else {
   if (($5 | 0) != ($2 | 0)) {
    $13 = $1 + 36 | 0; //@line 12874
    HEAP32[$13 >> 2] = (HEAP32[$13 >> 2] | 0) + 1; //@line 12877
    HEAP32[$1 + 24 >> 2] = 2; //@line 12879
    HEAP8[$1 + 54 >> 0] = 1; //@line 12881
    break;
   }
   $10 = $1 + 24 | 0; //@line 12884
   if ((HEAP32[$10 >> 2] | 0) == 2) {
    HEAP32[$10 >> 2] = $3; //@line 12888
   }
  }
 } while (0);
 return;
}
function _equeue_post($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $4 = 0, $6 = 0, $9 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 880
 $4 = _equeue_tick() | 0; //@line 882
 HEAP32[$2 + -4 >> 2] = $1; //@line 884
 $6 = $2 + -16 | 0; //@line 885
 HEAP32[$6 >> 2] = (HEAP32[$6 >> 2] | 0) + $4; //@line 888
 $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 889
 $9 = _equeue_enqueue($0, $2 + -36 | 0, $4) | 0; //@line 890
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 28; //@line 893
  HEAP32[$AsyncCtx + 4 >> 2] = $0; //@line 895
  sp = STACKTOP; //@line 896
  return 0; //@line 897
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 899
  _equeue_sema_signal($0 + 48 | 0); //@line 901
  return $9 | 0; //@line 902
 }
 return 0; //@line 904
}
function _strcmp($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$011 = 0, $$0710 = 0, $$lcssa = 0, $$lcssa8 = 0, $2 = 0, $3 = 0, $8 = 0, $9 = 0;
 $2 = HEAP8[$0 >> 0] | 0; //@line 7696
 $3 = HEAP8[$1 >> 0] | 0; //@line 7697
 if ($2 << 24 >> 24 == 0 ? 1 : $2 << 24 >> 24 != $3 << 24 >> 24) {
  $$lcssa = $3; //@line 7702
  $$lcssa8 = $2; //@line 7702
 } else {
  $$011 = $1; //@line 7704
  $$0710 = $0; //@line 7704
  do {
   $$0710 = $$0710 + 1 | 0; //@line 7706
   $$011 = $$011 + 1 | 0; //@line 7707
   $8 = HEAP8[$$0710 >> 0] | 0; //@line 7708
   $9 = HEAP8[$$011 >> 0] | 0; //@line 7709
  } while (!($8 << 24 >> 24 == 0 ? 1 : $8 << 24 >> 24 != $9 << 24 >> 24));
  $$lcssa = $9; //@line 7714
  $$lcssa8 = $8; //@line 7714
 }
 return ($$lcssa8 & 255) - ($$lcssa & 255) | 0; //@line 7724
}
function _memcmp($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$01318 = 0, $$01417 = 0, $$019 = 0, $14 = 0, $4 = 0, $5 = 0;
 L1 : do {
  if (!$2) {
   $14 = 0; //@line 12138
  } else {
   $$01318 = $0; //@line 12140
   $$01417 = $2; //@line 12140
   $$019 = $1; //@line 12140
   while (1) {
    $4 = HEAP8[$$01318 >> 0] | 0; //@line 12142
    $5 = HEAP8[$$019 >> 0] | 0; //@line 12143
    if ($4 << 24 >> 24 != $5 << 24 >> 24) {
     break;
    }
    $$01417 = $$01417 + -1 | 0; //@line 12148
    if (!$$01417) {
     $14 = 0; //@line 12153
     break L1;
    } else {
     $$01318 = $$01318 + 1 | 0; //@line 12156
     $$019 = $$019 + 1 | 0; //@line 12156
    }
   }
   $14 = ($4 & 255) - ($5 & 255) | 0; //@line 12162
  }
 } while (0);
 return $14 | 0; //@line 12165
}
function _serial_putc($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $2 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 3045
 $2 = HEAP32[116] | 0; //@line 3046
 $AsyncCtx3 = _emscripten_alloc_async_context(8, sp) | 0; //@line 3047
 _putc($1, $2) | 0; //@line 3048
 if (___async) {
  HEAP32[$AsyncCtx3 >> 2] = 71; //@line 3051
  HEAP32[$AsyncCtx3 + 4 >> 2] = $2; //@line 3053
  sp = STACKTOP; //@line 3054
  return;
 }
 _emscripten_free_async_context($AsyncCtx3 | 0); //@line 3057
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 3058
 _fflush($2) | 0; //@line 3059
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 72; //@line 3062
  sp = STACKTOP; //@line 3063
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 3066
  return;
 }
}
function _mbed_tracef($0, $1, $2, $varargs) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $varargs = $varargs | 0;
 var $3 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 1782
 STACKTOP = STACKTOP + 16 | 0; //@line 1783
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 1783
 $3 = sp; //@line 1784
 HEAP32[$3 >> 2] = $varargs; //@line 1785
 $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 1786
 _mbed_vtracef($0, $1, $2, $3); //@line 1787
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 36; //@line 1790
  HEAP32[$AsyncCtx + 4 >> 2] = $3; //@line 1792
  sp = STACKTOP; //@line 1793
  STACKTOP = sp; //@line 1794
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 1796
  STACKTOP = sp; //@line 1797
  return;
 }
}
function ___stdout_write($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $14 = 0, $vararg_buffer = 0, sp = 0;
 sp = STACKTOP; //@line 7648
 STACKTOP = STACKTOP + 32 | 0; //@line 7649
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(32); //@line 7649
 $vararg_buffer = sp; //@line 7650
 HEAP32[$0 + 36 >> 2] = 2; //@line 7653
 if (!(HEAP32[$0 >> 2] & 64)) {
  HEAP32[$vararg_buffer >> 2] = HEAP32[$0 + 60 >> 2]; //@line 7661
  HEAP32[$vararg_buffer + 4 >> 2] = 21523; //@line 7663
  HEAP32[$vararg_buffer + 8 >> 2] = sp + 16; //@line 7665
  if (___syscall54(54, $vararg_buffer | 0) | 0) {
   HEAP8[$0 + 75 >> 0] = -1; //@line 7670
  }
 }
 $14 = ___stdio_write($0, $1, $2) | 0; //@line 7673
 STACKTOP = sp; //@line 7674
 return $14 | 0; //@line 7674
}
function _mbed_die__async_cb_79($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx15 = 0, sp = 0;
 sp = STACKTOP; //@line 9117
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 9119
 _emscripten_asm_const_iii(1, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 9121
 $ReallocAsyncCtx15 = _emscripten_realloc_async_context(8) | 0; //@line 9122
 _wait_ms(150); //@line 9123
 if (___async) {
  HEAP32[$ReallocAsyncCtx15 >> 2] = 51; //@line 9126
  $4 = $ReallocAsyncCtx15 + 4 | 0; //@line 9127
  HEAP32[$4 >> 2] = $2; //@line 9128
  sp = STACKTOP; //@line 9129
  return;
 }
 ___async_unwind = 0; //@line 9132
 HEAP32[$ReallocAsyncCtx15 >> 2] = 51; //@line 9133
 $4 = $ReallocAsyncCtx15 + 4 | 0; //@line 9134
 HEAP32[$4 >> 2] = $2; //@line 9135
 sp = STACKTOP; //@line 9136
 return;
}
function _mbed_die__async_cb_78($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx14 = 0, sp = 0;
 sp = STACKTOP; //@line 9092
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 9094
 _emscripten_asm_const_iii(1, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 9096
 $ReallocAsyncCtx14 = _emscripten_realloc_async_context(8) | 0; //@line 9097
 _wait_ms(150); //@line 9098
 if (___async) {
  HEAP32[$ReallocAsyncCtx14 >> 2] = 52; //@line 9101
  $4 = $ReallocAsyncCtx14 + 4 | 0; //@line 9102
  HEAP32[$4 >> 2] = $2; //@line 9103
  sp = STACKTOP; //@line 9104
  return;
 }
 ___async_unwind = 0; //@line 9107
 HEAP32[$ReallocAsyncCtx14 >> 2] = 52; //@line 9108
 $4 = $ReallocAsyncCtx14 + 4 | 0; //@line 9109
 HEAP32[$4 >> 2] = $2; //@line 9110
 sp = STACKTOP; //@line 9111
 return;
}
function _mbed_die__async_cb_77($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx13 = 0, sp = 0;
 sp = STACKTOP; //@line 9067
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 9069
 _emscripten_asm_const_iii(1, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 9071
 $ReallocAsyncCtx13 = _emscripten_realloc_async_context(8) | 0; //@line 9072
 _wait_ms(150); //@line 9073
 if (___async) {
  HEAP32[$ReallocAsyncCtx13 >> 2] = 53; //@line 9076
  $4 = $ReallocAsyncCtx13 + 4 | 0; //@line 9077
  HEAP32[$4 >> 2] = $2; //@line 9078
  sp = STACKTOP; //@line 9079
  return;
 }
 ___async_unwind = 0; //@line 9082
 HEAP32[$ReallocAsyncCtx13 >> 2] = 53; //@line 9083
 $4 = $ReallocAsyncCtx13 + 4 | 0; //@line 9084
 HEAP32[$4 >> 2] = $2; //@line 9085
 sp = STACKTOP; //@line 9086
 return;
}
function _mbed_die__async_cb_76($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx12 = 0, sp = 0;
 sp = STACKTOP; //@line 9042
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 9044
 _emscripten_asm_const_iii(1, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 9046
 $ReallocAsyncCtx12 = _emscripten_realloc_async_context(8) | 0; //@line 9047
 _wait_ms(150); //@line 9048
 if (___async) {
  HEAP32[$ReallocAsyncCtx12 >> 2] = 54; //@line 9051
  $4 = $ReallocAsyncCtx12 + 4 | 0; //@line 9052
  HEAP32[$4 >> 2] = $2; //@line 9053
  sp = STACKTOP; //@line 9054
  return;
 }
 ___async_unwind = 0; //@line 9057
 HEAP32[$ReallocAsyncCtx12 >> 2] = 54; //@line 9058
 $4 = $ReallocAsyncCtx12 + 4 | 0; //@line 9059
 HEAP32[$4 >> 2] = $2; //@line 9060
 sp = STACKTOP; //@line 9061
 return;
}
function _mbed_die__async_cb_75($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx11 = 0, sp = 0;
 sp = STACKTOP; //@line 9017
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 9019
 _emscripten_asm_const_iii(1, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 9021
 $ReallocAsyncCtx11 = _emscripten_realloc_async_context(8) | 0; //@line 9022
 _wait_ms(150); //@line 9023
 if (___async) {
  HEAP32[$ReallocAsyncCtx11 >> 2] = 55; //@line 9026
  $4 = $ReallocAsyncCtx11 + 4 | 0; //@line 9027
  HEAP32[$4 >> 2] = $2; //@line 9028
  sp = STACKTOP; //@line 9029
  return;
 }
 ___async_unwind = 0; //@line 9032
 HEAP32[$ReallocAsyncCtx11 >> 2] = 55; //@line 9033
 $4 = $ReallocAsyncCtx11 + 4 | 0; //@line 9034
 HEAP32[$4 >> 2] = $2; //@line 9035
 sp = STACKTOP; //@line 9036
 return;
}
function _mbed_die__async_cb_74($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx10 = 0, sp = 0;
 sp = STACKTOP; //@line 8992
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 8994
 _emscripten_asm_const_iii(1, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 8996
 $ReallocAsyncCtx10 = _emscripten_realloc_async_context(8) | 0; //@line 8997
 _wait_ms(150); //@line 8998
 if (___async) {
  HEAP32[$ReallocAsyncCtx10 >> 2] = 56; //@line 9001
  $4 = $ReallocAsyncCtx10 + 4 | 0; //@line 9002
  HEAP32[$4 >> 2] = $2; //@line 9003
  sp = STACKTOP; //@line 9004
  return;
 }
 ___async_unwind = 0; //@line 9007
 HEAP32[$ReallocAsyncCtx10 >> 2] = 56; //@line 9008
 $4 = $ReallocAsyncCtx10 + 4 | 0; //@line 9009
 HEAP32[$4 >> 2] = $2; //@line 9010
 sp = STACKTOP; //@line 9011
 return;
}
function _mbed_die__async_cb($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx16 = 0, sp = 0;
 sp = STACKTOP; //@line 8742
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 8744
 _emscripten_asm_const_iii(1, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 8746
 $ReallocAsyncCtx16 = _emscripten_realloc_async_context(8) | 0; //@line 8747
 _wait_ms(150); //@line 8748
 if (___async) {
  HEAP32[$ReallocAsyncCtx16 >> 2] = 50; //@line 8751
  $4 = $ReallocAsyncCtx16 + 4 | 0; //@line 8752
  HEAP32[$4 >> 2] = $2; //@line 8753
  sp = STACKTOP; //@line 8754
  return;
 }
 ___async_unwind = 0; //@line 8757
 HEAP32[$ReallocAsyncCtx16 >> 2] = 50; //@line 8758
 $4 = $ReallocAsyncCtx16 + 4 | 0; //@line 8759
 HEAP32[$4 >> 2] = $2; //@line 8760
 sp = STACKTOP; //@line 8761
 return;
}
function _mbed_die__async_cb_73($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx9 = 0, sp = 0;
 sp = STACKTOP; //@line 8967
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 8969
 _emscripten_asm_const_iii(1, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 8971
 $ReallocAsyncCtx9 = _emscripten_realloc_async_context(8) | 0; //@line 8972
 _wait_ms(150); //@line 8973
 if (___async) {
  HEAP32[$ReallocAsyncCtx9 >> 2] = 57; //@line 8976
  $4 = $ReallocAsyncCtx9 + 4 | 0; //@line 8977
  HEAP32[$4 >> 2] = $2; //@line 8978
  sp = STACKTOP; //@line 8979
  return;
 }
 ___async_unwind = 0; //@line 8982
 HEAP32[$ReallocAsyncCtx9 >> 2] = 57; //@line 8983
 $4 = $ReallocAsyncCtx9 + 4 | 0; //@line 8984
 HEAP32[$4 >> 2] = $2; //@line 8985
 sp = STACKTOP; //@line 8986
 return;
}
function _mbed_die__async_cb_72($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx8 = 0, sp = 0;
 sp = STACKTOP; //@line 8942
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 8944
 _emscripten_asm_const_iii(1, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 8946
 $ReallocAsyncCtx8 = _emscripten_realloc_async_context(8) | 0; //@line 8947
 _wait_ms(400); //@line 8948
 if (___async) {
  HEAP32[$ReallocAsyncCtx8 >> 2] = 58; //@line 8951
  $4 = $ReallocAsyncCtx8 + 4 | 0; //@line 8952
  HEAP32[$4 >> 2] = $2; //@line 8953
  sp = STACKTOP; //@line 8954
  return;
 }
 ___async_unwind = 0; //@line 8957
 HEAP32[$ReallocAsyncCtx8 >> 2] = 58; //@line 8958
 $4 = $ReallocAsyncCtx8 + 4 | 0; //@line 8959
 HEAP32[$4 >> 2] = $2; //@line 8960
 sp = STACKTOP; //@line 8961
 return;
}
function _mbed_die__async_cb_71($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx7 = 0, sp = 0;
 sp = STACKTOP; //@line 8917
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 8919
 _emscripten_asm_const_iii(1, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 8921
 $ReallocAsyncCtx7 = _emscripten_realloc_async_context(8) | 0; //@line 8922
 _wait_ms(400); //@line 8923
 if (___async) {
  HEAP32[$ReallocAsyncCtx7 >> 2] = 59; //@line 8926
  $4 = $ReallocAsyncCtx7 + 4 | 0; //@line 8927
  HEAP32[$4 >> 2] = $2; //@line 8928
  sp = STACKTOP; //@line 8929
  return;
 }
 ___async_unwind = 0; //@line 8932
 HEAP32[$ReallocAsyncCtx7 >> 2] = 59; //@line 8933
 $4 = $ReallocAsyncCtx7 + 4 | 0; //@line 8934
 HEAP32[$4 >> 2] = $2; //@line 8935
 sp = STACKTOP; //@line 8936
 return;
}
function _mbed_die__async_cb_70($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx6 = 0, sp = 0;
 sp = STACKTOP; //@line 8892
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 8894
 _emscripten_asm_const_iii(1, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 8896
 $ReallocAsyncCtx6 = _emscripten_realloc_async_context(8) | 0; //@line 8897
 _wait_ms(400); //@line 8898
 if (___async) {
  HEAP32[$ReallocAsyncCtx6 >> 2] = 60; //@line 8901
  $4 = $ReallocAsyncCtx6 + 4 | 0; //@line 8902
  HEAP32[$4 >> 2] = $2; //@line 8903
  sp = STACKTOP; //@line 8904
  return;
 }
 ___async_unwind = 0; //@line 8907
 HEAP32[$ReallocAsyncCtx6 >> 2] = 60; //@line 8908
 $4 = $ReallocAsyncCtx6 + 4 | 0; //@line 8909
 HEAP32[$4 >> 2] = $2; //@line 8910
 sp = STACKTOP; //@line 8911
 return;
}
function _mbed_die__async_cb_69($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx5 = 0, sp = 0;
 sp = STACKTOP; //@line 8867
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 8869
 _emscripten_asm_const_iii(1, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 8871
 $ReallocAsyncCtx5 = _emscripten_realloc_async_context(8) | 0; //@line 8872
 _wait_ms(400); //@line 8873
 if (___async) {
  HEAP32[$ReallocAsyncCtx5 >> 2] = 61; //@line 8876
  $4 = $ReallocAsyncCtx5 + 4 | 0; //@line 8877
  HEAP32[$4 >> 2] = $2; //@line 8878
  sp = STACKTOP; //@line 8879
  return;
 }
 ___async_unwind = 0; //@line 8882
 HEAP32[$ReallocAsyncCtx5 >> 2] = 61; //@line 8883
 $4 = $ReallocAsyncCtx5 + 4 | 0; //@line 8884
 HEAP32[$4 >> 2] = $2; //@line 8885
 sp = STACKTOP; //@line 8886
 return;
}
function _mbed_die__async_cb_68($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx4 = 0, sp = 0;
 sp = STACKTOP; //@line 8842
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 8844
 _emscripten_asm_const_iii(1, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 8846
 $ReallocAsyncCtx4 = _emscripten_realloc_async_context(8) | 0; //@line 8847
 _wait_ms(400); //@line 8848
 if (___async) {
  HEAP32[$ReallocAsyncCtx4 >> 2] = 62; //@line 8851
  $4 = $ReallocAsyncCtx4 + 4 | 0; //@line 8852
  HEAP32[$4 >> 2] = $2; //@line 8853
  sp = STACKTOP; //@line 8854
  return;
 }
 ___async_unwind = 0; //@line 8857
 HEAP32[$ReallocAsyncCtx4 >> 2] = 62; //@line 8858
 $4 = $ReallocAsyncCtx4 + 4 | 0; //@line 8859
 HEAP32[$4 >> 2] = $2; //@line 8860
 sp = STACKTOP; //@line 8861
 return;
}
function _mbed_die__async_cb_67($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 8817
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 8819
 _emscripten_asm_const_iii(1, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 8821
 $ReallocAsyncCtx3 = _emscripten_realloc_async_context(8) | 0; //@line 8822
 _wait_ms(400); //@line 8823
 if (___async) {
  HEAP32[$ReallocAsyncCtx3 >> 2] = 63; //@line 8826
  $4 = $ReallocAsyncCtx3 + 4 | 0; //@line 8827
  HEAP32[$4 >> 2] = $2; //@line 8828
  sp = STACKTOP; //@line 8829
  return;
 }
 ___async_unwind = 0; //@line 8832
 HEAP32[$ReallocAsyncCtx3 >> 2] = 63; //@line 8833
 $4 = $ReallocAsyncCtx3 + 4 | 0; //@line 8834
 HEAP32[$4 >> 2] = $2; //@line 8835
 sp = STACKTOP; //@line 8836
 return;
}
function _mbed_die__async_cb_66($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 8792
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 8794
 _emscripten_asm_const_iii(1, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 8796
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(8) | 0; //@line 8797
 _wait_ms(400); //@line 8798
 if (___async) {
  HEAP32[$ReallocAsyncCtx2 >> 2] = 64; //@line 8801
  $4 = $ReallocAsyncCtx2 + 4 | 0; //@line 8802
  HEAP32[$4 >> 2] = $2; //@line 8803
  sp = STACKTOP; //@line 8804
  return;
 }
 ___async_unwind = 0; //@line 8807
 HEAP32[$ReallocAsyncCtx2 >> 2] = 64; //@line 8808
 $4 = $ReallocAsyncCtx2 + 4 | 0; //@line 8809
 HEAP32[$4 >> 2] = $2; //@line 8810
 sp = STACKTOP; //@line 8811
 return;
}
function __ZSt11__terminatePFvvE($0) {
 $0 = $0 | 0;
 var $AsyncCtx = 0, $vararg_buffer = 0, sp = 0;
 sp = STACKTOP; //@line 38
 STACKTOP = STACKTOP + 16 | 0; //@line 39
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 39
 $vararg_buffer = sp; //@line 40
 $AsyncCtx = _emscripten_alloc_async_context(12, sp) | 0; //@line 41
 FUNCTION_TABLE_v[$0 & 3](); //@line 42
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 141; //@line 45
  HEAP32[$AsyncCtx + 4 >> 2] = $vararg_buffer; //@line 47
  HEAP32[$AsyncCtx + 8 >> 2] = $vararg_buffer; //@line 49
  sp = STACKTOP; //@line 50
  STACKTOP = sp; //@line 51
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 53
  _abort_message(5625, $vararg_buffer); //@line 54
 }
}
function _mbed_die__async_cb_65($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 8767
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 8769
 _emscripten_asm_const_iii(1, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 8771
 $ReallocAsyncCtx = _emscripten_realloc_async_context(8) | 0; //@line 8772
 _wait_ms(400); //@line 8773
 if (___async) {
  HEAP32[$ReallocAsyncCtx >> 2] = 65; //@line 8776
  $4 = $ReallocAsyncCtx + 4 | 0; //@line 8777
  HEAP32[$4 >> 2] = $2; //@line 8778
  sp = STACKTOP; //@line 8779
  return;
 }
 ___async_unwind = 0; //@line 8782
 HEAP32[$ReallocAsyncCtx >> 2] = 65; //@line 8783
 $4 = $ReallocAsyncCtx + 4 | 0; //@line 8784
 HEAP32[$4 >> 2] = $2; //@line 8785
 sp = STACKTOP; //@line 8786
 return;
}
function __ZN4mbed8CallbackIFvvEE13function_callIN6events5EventIS1_EEEEvPKv__async_cb($0) {
 $0 = $0 | 0;
 var $AsyncRetVal = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 9301
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 9305
 HEAP32[(HEAP32[HEAP32[$0 + 4 >> 2] >> 2] | 0) + 8 >> 2] = $AsyncRetVal; //@line 9308
 if ($AsyncRetVal | 0) {
  return;
 }
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(4) | 0; //@line 9313
 _mbed_assert_internal(2690, 2693, 149); //@line 9314
 if (___async) {
  HEAP32[$ReallocAsyncCtx2 >> 2] = 108; //@line 9317
  sp = STACKTOP; //@line 9318
  return;
 }
 ___async_unwind = 0; //@line 9321
 HEAP32[$ReallocAsyncCtx2 >> 2] = 108; //@line 9322
 sp = STACKTOP; //@line 9323
 return;
}
function _mbed_error_printf($0, $varargs) {
 $0 = $0 | 0;
 $varargs = $varargs | 0;
 var $1 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 2808
 STACKTOP = STACKTOP + 16 | 0; //@line 2809
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 2809
 $1 = sp; //@line 2810
 HEAP32[$1 >> 2] = $varargs; //@line 2811
 $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 2812
 _mbed_error_vfprintf($0, $1); //@line 2813
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 66; //@line 2816
  HEAP32[$AsyncCtx + 4 >> 2] = $1; //@line 2818
  sp = STACKTOP; //@line 2819
  STACKTOP = sp; //@line 2820
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 2822
  STACKTOP = sp; //@line 2823
  return;
 }
}
function _sbrk(increment) {
 increment = increment | 0;
 var oldDynamicTop = 0, newDynamicTop = 0;
 oldDynamicTop = HEAP32[DYNAMICTOP_PTR >> 2] | 0; //@line 9949
 newDynamicTop = oldDynamicTop + increment | 0; //@line 9950
 if ((increment | 0) > 0 & (newDynamicTop | 0) < (oldDynamicTop | 0) | (newDynamicTop | 0) < 0) {
  abortOnCannotGrowMemory() | 0; //@line 9954
  ___setErrNo(12); //@line 9955
  return -1;
 }
 HEAP32[DYNAMICTOP_PTR >> 2] = newDynamicTop; //@line 9959
 if ((newDynamicTop | 0) > (getTotalMemory() | 0)) {
  if (!(enlargeMemory() | 0)) {
   HEAP32[DYNAMICTOP_PTR >> 2] = oldDynamicTop; //@line 9963
   ___setErrNo(12); //@line 9964
   return -1;
  }
 }
 return oldDynamicTop | 0; //@line 9968
}
function _fmt_x($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $$05$lcssa = 0, $$056 = 0, $14 = 0, $15 = 0, $8 = 0;
 if (($0 | 0) == 0 & ($1 | 0) == 0) {
  $$05$lcssa = $2; //@line 10155
 } else {
  $$056 = $2; //@line 10157
  $15 = $1; //@line 10157
  $8 = $0; //@line 10157
  while (1) {
   $14 = $$056 + -1 | 0; //@line 10165
   HEAP8[$14 >> 0] = HEAPU8[3288 + ($8 & 15) >> 0] | 0 | $3; //@line 10166
   $8 = _bitshift64Lshr($8 | 0, $15 | 0, 4) | 0; //@line 10167
   $15 = tempRet0; //@line 10168
   if (($8 | 0) == 0 & ($15 | 0) == 0) {
    $$05$lcssa = $14; //@line 10173
    break;
   } else {
    $$056 = $14; //@line 10176
   }
  }
 }
 return $$05$lcssa | 0; //@line 10180
}
function _fwrite($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $$ = 0, $11 = 0, $13 = 0, $15 = 0, $4 = 0, $phitmp = 0;
 $4 = Math_imul($2, $1) | 0; //@line 7819
 $$ = ($1 | 0) == 0 ? 0 : $2; //@line 7821
 if ((HEAP32[$3 + 76 >> 2] | 0) > -1) {
  $phitmp = (___lockfile($3) | 0) == 0; //@line 7827
  $11 = ___fwritex($0, $4, $3) | 0; //@line 7828
  if ($phitmp) {
   $13 = $11; //@line 7830
  } else {
   ___unlockfile($3); //@line 7832
   $13 = $11; //@line 7833
  }
 } else {
  $13 = ___fwritex($0, $4, $3) | 0; //@line 7837
 }
 if (($13 | 0) == ($4 | 0)) {
  $15 = $$; //@line 7841
 } else {
  $15 = ($13 >>> 0) / ($1 >>> 0) | 0; //@line 7844
 }
 return $15 | 0; //@line 7846
}
function _main__async_cb_38($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $6 = 0, $ReallocAsyncCtx5 = 0, sp = 0;
 sp = STACKTOP; //@line 6161
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 6163
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 6165
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 6167
 $ReallocAsyncCtx5 = _emscripten_realloc_async_context(16) | 0; //@line 6168
 _puts(2466) | 0; //@line 6169
 if (!___async) {
  ___async_unwind = 0; //@line 6172
 }
 HEAP32[$ReallocAsyncCtx5 >> 2] = 92; //@line 6174
 HEAP32[$ReallocAsyncCtx5 + 4 >> 2] = $2; //@line 6176
 HEAP32[$ReallocAsyncCtx5 + 8 >> 2] = $4; //@line 6178
 HEAP32[$ReallocAsyncCtx5 + 12 >> 2] = $6; //@line 6180
 sp = STACKTOP; //@line 6181
 return;
}
function _main__async_cb_37($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $6 = 0, $ReallocAsyncCtx4 = 0, sp = 0;
 sp = STACKTOP; //@line 6135
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 6137
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 6139
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 6141
 $ReallocAsyncCtx4 = _emscripten_realloc_async_context(16) | 0; //@line 6142
 _puts(2535) | 0; //@line 6143
 if (!___async) {
  ___async_unwind = 0; //@line 6146
 }
 HEAP32[$ReallocAsyncCtx4 >> 2] = 93; //@line 6148
 HEAP32[$ReallocAsyncCtx4 + 4 >> 2] = $2; //@line 6150
 HEAP32[$ReallocAsyncCtx4 + 8 >> 2] = $4; //@line 6152
 HEAP32[$ReallocAsyncCtx4 + 12 >> 2] = $6; //@line 6154
 sp = STACKTOP; //@line 6155
 return;
}
function ___towrite($0) {
 $0 = $0 | 0;
 var $$0 = 0, $1 = 0, $14 = 0, $3 = 0, $7 = 0;
 $1 = $0 + 74 | 0; //@line 8036
 $3 = HEAP8[$1 >> 0] | 0; //@line 8038
 HEAP8[$1 >> 0] = $3 + 255 | $3; //@line 8042
 $7 = HEAP32[$0 >> 2] | 0; //@line 8043
 if (!($7 & 8)) {
  HEAP32[$0 + 8 >> 2] = 0; //@line 8048
  HEAP32[$0 + 4 >> 2] = 0; //@line 8050
  $14 = HEAP32[$0 + 44 >> 2] | 0; //@line 8052
  HEAP32[$0 + 28 >> 2] = $14; //@line 8054
  HEAP32[$0 + 20 >> 2] = $14; //@line 8056
  HEAP32[$0 + 16 >> 2] = $14 + (HEAP32[$0 + 48 >> 2] | 0); //@line 8062
  $$0 = 0; //@line 8063
 } else {
  HEAP32[$0 >> 2] = $7 | 32; //@line 8066
  $$0 = -1; //@line 8067
 }
 return $$0 | 0; //@line 8069
}
function __ZN4mbed11InterruptInD2Ev__async_cb($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $8 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 7116
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 7118
 $4 = HEAP32[$2 + 52 >> 2] | 0; //@line 7120
 if (!$4) {
  return;
 }
 $8 = HEAP32[$4 + 8 >> 2] | 0; //@line 7127
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(4) | 0; //@line 7128
 FUNCTION_TABLE_vi[$8 & 255]($2 + 40 | 0); //@line 7129
 if (___async) {
  HEAP32[$ReallocAsyncCtx2 >> 2] = 15; //@line 7132
  sp = STACKTOP; //@line 7133
  return;
 }
 ___async_unwind = 0; //@line 7136
 HEAP32[$ReallocAsyncCtx2 >> 2] = 15; //@line 7137
 sp = STACKTOP; //@line 7138
 return;
}
function __ZSt9terminatev() {
 var $0 = 0, $16 = 0, $17 = 0, $2 = 0, $5 = 0, sp = 0;
 sp = STACKTOP; //@line 3
 $0 = ___cxa_get_globals_fast() | 0; //@line 4
 if ($0 | 0) {
  $2 = HEAP32[$0 >> 2] | 0; //@line 7
  if ($2 | 0) {
   $5 = $2 + 48 | 0; //@line 11
   if ((HEAP32[$5 >> 2] & -256 | 0) == 1126902528 ? (HEAP32[$5 + 4 >> 2] | 0) == 1129074247 : 0) {
    $16 = HEAP32[$2 + 12 >> 2] | 0; //@line 23
    _emscripten_alloc_async_context(4, sp) | 0; //@line 24
    __ZSt11__terminatePFvvE($16); //@line 25
   }
  }
 }
 $17 = __ZSt13get_terminatev() | 0; //@line 30
 _emscripten_alloc_async_context(4, sp) | 0; //@line 31
 __ZSt11__terminatePFvvE($17); //@line 32
}
function _twobyte_strstr($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$sink$in = 0, $$sink17$sink = 0, $11 = 0, $12 = 0, $8 = 0;
 $8 = (HEAPU8[$1 >> 0] | 0) << 8 | (HEAPU8[$1 + 1 >> 0] | 0); //@line 11623
 $$sink$in = HEAPU8[$0 >> 0] | 0; //@line 11626
 $$sink17$sink = $0; //@line 11626
 while (1) {
  $11 = $$sink17$sink + 1 | 0; //@line 11628
  $12 = HEAP8[$11 >> 0] | 0; //@line 11629
  if (!($12 << 24 >> 24)) {
   break;
  }
  $$sink$in = $$sink$in << 8 & 65280 | $12 & 255; //@line 11637
  if (($$sink$in | 0) == ($8 | 0)) {
   break;
  } else {
   $$sink17$sink = $11; //@line 11642
  }
 }
 return ($12 << 24 >> 24 ? $$sink17$sink : 0) | 0; //@line 11647
}
function _fmt_o($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$0$lcssa = 0, $$06 = 0, $10 = 0, $11 = 0, $7 = 0;
 if (($0 | 0) == 0 & ($1 | 0) == 0) {
  $$0$lcssa = $2; //@line 10192
 } else {
  $$06 = $2; //@line 10194
  $11 = $1; //@line 10194
  $7 = $0; //@line 10194
  while (1) {
   $10 = $$06 + -1 | 0; //@line 10199
   HEAP8[$10 >> 0] = $7 & 7 | 48; //@line 10200
   $7 = _bitshift64Lshr($7 | 0, $11 | 0, 3) | 0; //@line 10201
   $11 = tempRet0; //@line 10202
   if (($7 | 0) == 0 & ($11 | 0) == 0) {
    $$0$lcssa = $10; //@line 10207
    break;
   } else {
    $$06 = $10; //@line 10210
   }
  }
 }
 return $$0$lcssa | 0; //@line 10214
}
function __ZN4mbed8CallbackIFvvEE13function_dtorIN6events5EventIS1_EEEEvPv__async_cb($0) {
 $0 = $0 | 0;
 var $3 = 0, $5 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 1244
 $3 = HEAP32[HEAP32[$0 + 4 >> 2] >> 2] | 0; //@line 1247
 $5 = HEAP32[$3 + 4 >> 2] | 0; //@line 1249
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(4) | 0; //@line 1250
 _equeue_dealloc($5, $3); //@line 1251
 if (___async) {
  HEAP32[$ReallocAsyncCtx2 >> 2] = 110; //@line 1254
  sp = STACKTOP; //@line 1255
  return;
 }
 ___async_unwind = 0; //@line 1258
 HEAP32[$ReallocAsyncCtx2 >> 2] = 110; //@line 1259
 sp = STACKTOP; //@line 1260
 return;
}
function _invoke_ticker__async_cb_51($0) {
 $0 = $0 | 0;
 var $5 = 0, $6 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 7156
 $5 = HEAP32[HEAP32[HEAP32[$0 + 4 >> 2] >> 2] >> 2] | 0; //@line 7162
 $6 = HEAP32[$0 + 8 >> 2] | 0; //@line 7163
 $ReallocAsyncCtx = _emscripten_realloc_async_context(4) | 0; //@line 7164
 FUNCTION_TABLE_vi[$5 & 255]($6); //@line 7165
 if (___async) {
  HEAP32[$ReallocAsyncCtx >> 2] = 74; //@line 7168
  sp = STACKTOP; //@line 7169
  return;
 }
 ___async_unwind = 0; //@line 7172
 HEAP32[$ReallocAsyncCtx >> 2] = 74; //@line 7173
 sp = STACKTOP; //@line 7174
 return;
}
function ___cxa_is_pointer_type($0) {
 $0 = $0 | 0;
 var $2 = 0, $3 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 879
 do {
  if (!$0) {
   $3 = 0; //@line 883
  } else {
   $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 885
   $2 = ___dynamic_cast($0, 88, 144, 0) | 0; //@line 886
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 155; //@line 889
    sp = STACKTOP; //@line 890
    return 0; //@line 891
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 893
    $3 = ($2 | 0) != 0 & 1; //@line 896
    break;
   }
  }
 } while (0);
 return $3 | 0; //@line 901
}
function _getint_671($0) {
 $0 = $0 | 0;
 var $$0$lcssa = 0, $$04 = 0, $11 = 0, $12 = 0, $7 = 0;
 if (!(_isdigit(HEAP8[HEAP32[$0 >> 2] >> 0] | 0) | 0)) {
  $$0$lcssa = 0; //@line 9836
 } else {
  $$04 = 0; //@line 9838
  while (1) {
   $7 = HEAP32[$0 >> 2] | 0; //@line 9841
   $11 = ($$04 * 10 | 0) + -48 + (HEAP8[$7 >> 0] | 0) | 0; //@line 9845
   $12 = $7 + 1 | 0; //@line 9846
   HEAP32[$0 >> 2] = $12; //@line 9847
   if (!(_isdigit(HEAP8[$12 >> 0] | 0) | 0)) {
    $$0$lcssa = $11; //@line 9853
    break;
   } else {
    $$04 = $11; //@line 9856
   }
  }
 }
 return $$0$lcssa | 0; //@line 9860
}
function ___muldi3($a$0, $a$1, $b$0, $b$1) {
 $a$0 = $a$0 | 0;
 $a$1 = $a$1 | 0;
 $b$0 = $b$0 | 0;
 $b$1 = $b$1 | 0;
 var $x_sroa_0_0_extract_trunc = 0, $y_sroa_0_0_extract_trunc = 0, $1$0 = 0, $1$1 = 0;
 $x_sroa_0_0_extract_trunc = $a$0; //@line 9474
 $y_sroa_0_0_extract_trunc = $b$0; //@line 9475
 $1$0 = ___muldsi3($x_sroa_0_0_extract_trunc, $y_sroa_0_0_extract_trunc) | 0; //@line 9476
 $1$1 = tempRet0; //@line 9477
 return (tempRet0 = (Math_imul($a$1, $y_sroa_0_0_extract_trunc) | 0) + (Math_imul($b$1, $x_sroa_0_0_extract_trunc) | 0) + $1$1 | $1$1 & 0, $1$0 | 0 | 0) | 0; //@line 9479
}
function _main__async_cb_34($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx9 = 0, sp = 0;
 sp = STACKTOP; //@line 6052
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 6054
 $4 = HEAP32[$2 + 4 >> 2] | 0; //@line 6056
 $ReallocAsyncCtx9 = _emscripten_realloc_async_context(4) | 0; //@line 6057
 _equeue_dealloc($4, $2); //@line 6058
 if (___async) {
  HEAP32[$ReallocAsyncCtx9 >> 2] = 101; //@line 6061
  sp = STACKTOP; //@line 6062
  return;
 }
 ___async_unwind = 0; //@line 6065
 HEAP32[$ReallocAsyncCtx9 >> 2] = 101; //@line 6066
 sp = STACKTOP; //@line 6067
 return;
}
function runPostSets() {}
function ___muldsi3($a, $b) {
 $a = $a | 0;
 $b = $b | 0;
 var $1 = 0, $2 = 0, $3 = 0, $6 = 0, $8 = 0, $11 = 0, $12 = 0;
 $1 = $a & 65535; //@line 9459
 $2 = $b & 65535; //@line 9460
 $3 = Math_imul($2, $1) | 0; //@line 9461
 $6 = $a >>> 16; //@line 9462
 $8 = ($3 >>> 16) + (Math_imul($2, $6) | 0) | 0; //@line 9463
 $11 = $b >>> 16; //@line 9464
 $12 = Math_imul($11, $1) | 0; //@line 9465
 return (tempRet0 = ($8 >>> 16) + (Math_imul($11, $6) | 0) + ((($8 & 65535) + $12 | 0) >>> 16) | 0, $8 + $12 << 16 | $3 & 65535 | 0) | 0; //@line 9466
}
function __GLOBAL__sub_I_main_cpp() {
 var $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 3864
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 3865
 __ZN20SimulatorBlockDeviceC2EPKcyy(5776, 2369, 65536, 0, 512, 0); //@line 3866
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 89; //@line 3869
  sp = STACKTOP; //@line 3870
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 3873
  __ZN6events10EventQueueC2EjPh(5836, 1664, 0); //@line 3874
  __ZN4mbed11InterruptInC2E7PinName(6040, 1337); //@line 3875
  return;
 }
}
function ___fflush_unlocked__async_cb_60($0) {
 $0 = $0 | 0;
 var $10 = 0, $4 = 0, $6 = 0, $8 = 0;
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 8217
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 8219
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 8221
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 8223
 HEAP32[(HEAP32[$0 + 4 >> 2] | 0) + 16 >> 2] = 0; //@line 8225
 HEAP32[$4 >> 2] = 0; //@line 8226
 HEAP32[$6 >> 2] = 0; //@line 8227
 HEAP32[$8 >> 2] = 0; //@line 8228
 HEAP32[$10 >> 2] = 0; //@line 8229
 HEAP32[___async_retval >> 2] = 0; //@line 8231
 return;
}
function _mbed_vtracef__async_cb_10($0) {
 $0 = $0 | 0;
 var $1 = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 1840
 $1 = HEAP32[60] | 0; //@line 1841
 $ReallocAsyncCtx3 = _emscripten_realloc_async_context(4) | 0; //@line 1842
 FUNCTION_TABLE_vi[$1 & 255](1375); //@line 1843
 if (___async) {
  HEAP32[$ReallocAsyncCtx3 >> 2] = 40; //@line 1846
  sp = STACKTOP; //@line 1847
  return;
 }
 ___async_unwind = 0; //@line 1850
 HEAP32[$ReallocAsyncCtx3 >> 2] = 40; //@line 1851
 sp = STACKTOP; //@line 1852
 return;
}
function __ZN4mbed11InterruptInC2E7PinName($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $2 = 0, $3 = 0, $4 = 0, dest = 0, stop = 0;
 HEAP32[$0 >> 2] = 184; //@line 250
 $2 = $0 + 4 | 0; //@line 251
 $3 = $0 + 28 | 0; //@line 252
 $4 = $0; //@line 253
 dest = $2; //@line 254
 stop = dest + 68 | 0; //@line 254
 do {
  HEAP32[dest >> 2] = 0; //@line 254
  dest = dest + 4 | 0; //@line 254
 } while ((dest | 0) < (stop | 0));
 _gpio_irq_init($3, $1, 2, $4) | 0; //@line 255
 _gpio_init_in($2, $1); //@line 256
 return;
}
function _serial_putc__async_cb_59($0) {
 $0 = $0 | 0;
 var $2 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 8100
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 8102
 $ReallocAsyncCtx = _emscripten_realloc_async_context(4) | 0; //@line 8103
 _fflush($2) | 0; //@line 8104
 if (___async) {
  HEAP32[$ReallocAsyncCtx >> 2] = 72; //@line 8107
  sp = STACKTOP; //@line 8108
  return;
 }
 ___async_unwind = 0; //@line 8111
 HEAP32[$ReallocAsyncCtx >> 2] = 72; //@line 8112
 sp = STACKTOP; //@line 8113
 return;
}
function __ZN6events10EventQueue13function_callINS0_9context00IPFvvEEEEEvPv($0) {
 $0 = $0 | 0;
 var $1 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 4296
 $1 = HEAP32[$0 >> 2] | 0; //@line 4297
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 4298
 FUNCTION_TABLE_v[$1 & 3](); //@line 4299
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 111; //@line 4302
  sp = STACKTOP; //@line 4303
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 4306
  return;
 }
}
function _emscripten_async_resume() {
 ___async = 0; //@line 9792
 ___async_unwind = 1; //@line 9793
 while (1) {
  if (!___async_cur_frame) return;
  dynCall_vi(HEAP32[___async_cur_frame + 8 >> 2] | 0, ___async_cur_frame + 8 | 0); //@line 9799
  if (___async) return;
  if (!___async_unwind) {
   ___async_unwind = 1; //@line 9803
   continue;
  }
  stackRestore(HEAP32[___async_cur_frame + 4 >> 2] | 0); //@line 9807
  ___async_cur_frame = HEAP32[___async_cur_frame >> 2] | 0; //@line 9809
 }
}
function ___stdio_close($0) {
 $0 = $0 | 0;
 var $5 = 0, $vararg_buffer = 0, sp = 0;
 sp = STACKTOP; //@line 7459
 STACKTOP = STACKTOP + 16 | 0; //@line 7460
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 7460
 $vararg_buffer = sp; //@line 7461
 HEAP32[$vararg_buffer >> 2] = _dummy(HEAP32[$0 + 60 >> 2] | 0) | 0; //@line 7465
 $5 = ___syscall_ret(___syscall6(6, $vararg_buffer | 0) | 0) | 0; //@line 7467
 STACKTOP = sp; //@line 7468
 return $5 | 0; //@line 7468
}
function _main__async_cb_41($0) {
 $0 = $0 | 0;
 var $ReallocAsyncCtx8 = 0, sp = 0;
 sp = STACKTOP; //@line 6228
 $ReallocAsyncCtx8 = _emscripten_realloc_async_context(4) | 0; //@line 6229
 __ZN6events10EventQueue8dispatchEi(5836, -1); //@line 6230
 if (___async) {
  HEAP32[$ReallocAsyncCtx8 >> 2] = 102; //@line 6233
  sp = STACKTOP; //@line 6234
  return;
 }
 ___async_unwind = 0; //@line 6237
 HEAP32[$ReallocAsyncCtx8 >> 2] = 102; //@line 6238
 sp = STACKTOP; //@line 6239
 return;
}
function _handle_interrupt_in($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $2 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 2961
 $2 = HEAP32[1454] | 0; //@line 2962
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 2963
 FUNCTION_TABLE_vii[$2 & 3]($0, $1); //@line 2964
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 70; //@line 2967
  sp = STACKTOP; //@line 2968
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 2971
  return;
 }
}
function ___uremdi3($a$0, $a$1, $b$0, $b$1) {
 $a$0 = $a$0 | 0;
 $a$1 = $a$1 | 0;
 $b$0 = $b$0 | 0;
 $b$1 = $b$1 | 0;
 var $rem = 0, __stackBase__ = 0;
 __stackBase__ = STACKTOP; //@line 9734
 STACKTOP = STACKTOP + 16 | 0; //@line 9735
 $rem = __stackBase__ | 0; //@line 9736
 ___udivmoddi4($a$0, $a$1, $b$0, $b$1, $rem) | 0; //@line 9737
 STACKTOP = __stackBase__; //@line 9738
 return (tempRet0 = HEAP32[$rem + 4 >> 2] | 0, HEAP32[$rem >> 2] | 0) | 0; //@line 9739
}
function _llvm_cttz_i32(x) {
 x = x | 0;
 var ret = 0;
 ret = HEAP8[cttz_i8 + (x & 255) >> 0] | 0; //@line 9504
 if ((ret | 0) < 8) return ret | 0; //@line 9505
 ret = HEAP8[cttz_i8 + (x >> 8 & 255) >> 0] | 0; //@line 9506
 if ((ret | 0) < 8) return ret + 8 | 0; //@line 9507
 ret = HEAP8[cttz_i8 + (x >> 16 & 255) >> 0] | 0; //@line 9508
 if ((ret | 0) < 8) return ret + 16 | 0; //@line 9509
 return (HEAP8[cttz_i8 + (x >>> 24) >> 0] | 0) + 24 | 0; //@line 9510
}
function ___cxa_get_globals_fast() {
 var $3 = 0, sp = 0;
 sp = STACKTOP; //@line 12597
 STACKTOP = STACKTOP + 16 | 0; //@line 12598
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 12598
 if (!(_pthread_once(6688, 3) | 0)) {
  $3 = _pthread_getspecific(HEAP32[1673] | 0) | 0; //@line 12604
  STACKTOP = sp; //@line 12605
  return $3 | 0; //@line 12605
 } else {
  _abort_message(5473, sp); //@line 12607
 }
 return 0; //@line 12610
}
function __ZNK10__cxxabiv117__class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($0, $1, $2, $3, $4, $5) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 $5 = $5 | 0;
 if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, $5) | 0) {
  __ZNK10__cxxabiv117__class_type_info29process_static_type_above_dstEPNS_19__dynamic_cast_infoEPKvS4_i(0, $1, $2, $3, $4); //@line 12765
 }
 return;
}
function _sn_write($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$ = 0, $5 = 0, $6 = 0, $7 = 0;
 $5 = $0 + 20 | 0; //@line 12278
 $6 = HEAP32[$5 >> 2] | 0; //@line 12279
 $7 = (HEAP32[$0 + 16 >> 2] | 0) - $6 | 0; //@line 12280
 $$ = $7 >>> 0 > $2 >>> 0 ? $2 : $7; //@line 12282
 _memcpy($6 | 0, $1 | 0, $$ | 0) | 0; //@line 12284
 HEAP32[$5 >> 2] = (HEAP32[$5 >> 2] | 0) + $$; //@line 12287
 return $2 | 0; //@line 12288
}
function __ZL25default_terminate_handlerv__async_cb_21($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $AsyncRetVal = 0;
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 2580
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 2582
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 2584
 HEAP32[$2 >> 2] = 5334; //@line 2585
 HEAP32[$2 + 4 >> 2] = $4; //@line 2587
 HEAP32[$2 + 8 >> 2] = $AsyncRetVal; //@line 2589
 _abort_message(5198, $2); //@line 2590
}
function __ZN6events10EventQueueC2EjPh($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $3 = 0;
 $3 = $0 + 188 | 0; //@line 497
 HEAP32[$3 >> 2] = 0; //@line 498
 HEAP32[$3 + 4 >> 2] = 0; //@line 498
 HEAP32[$3 + 8 >> 2] = 0; //@line 498
 HEAP32[$3 + 12 >> 2] = 0; //@line 498
 if (!$2) {
  _equeue_create($0, $1) | 0; //@line 501
  return;
 } else {
  _equeue_create_inplace($0, $1, $2) | 0; //@line 504
  return;
 }
}
function __ZN6events10EventQueue8dispatchEi($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 512
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 513
 _equeue_dispatch($0, $1); //@line 514
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 25; //@line 517
  sp = STACKTOP; //@line 518
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 521
  return;
 }
}
function _abort_message__async_cb($0) {
 $0 = $0 | 0;
 var $2 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 7238
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 7240
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(4) | 0; //@line 7241
 _fputc(10, $2) | 0; //@line 7242
 if (!___async) {
  ___async_unwind = 0; //@line 7245
 }
 HEAP32[$ReallocAsyncCtx2 >> 2] = 131; //@line 7247
 sp = STACKTOP; //@line 7248
 return;
}
function _gpio_irq_init($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $$0 = 0;
 if (($1 | 0) == -1) {
  $$0 = -1; //@line 2984
  return $$0 | 0; //@line 2985
 }
 HEAP32[1454] = $2; //@line 2987
 HEAP32[$0 >> 2] = $1; //@line 2988
 HEAP32[$0 + 4 >> 2] = $1; //@line 2990
 _emscripten_asm_const_iii(4, $3 | 0, $1 | 0) | 0; //@line 2991
 $$0 = 0; //@line 2992
 return $$0 | 0; //@line 2993
}
function __ZN10__cxxabiv112_GLOBAL__N_19destruct_EPv($0) {
 $0 = $0 | 0;
 var sp = 0;
 sp = STACKTOP; //@line 13359
 STACKTOP = STACKTOP + 16 | 0; //@line 13360
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 13360
 _free($0); //@line 13362
 if (!(_pthread_setspecific(HEAP32[1673] | 0, 0) | 0)) {
  STACKTOP = sp; //@line 13367
  return;
 } else {
  _abort_message(5572, sp); //@line 13369
 }
}
function _vsnprintf__async_cb($0) {
 $0 = $0 | 0;
 var $13 = 0, $AsyncRetVal = 0;
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 9167
 if (HEAP32[$0 + 4 >> 2] | 0) {
  $13 = HEAP32[HEAP32[$0 + 16 >> 2] >> 2] | 0; //@line 9170
  HEAP8[$13 + ((($13 | 0) == (HEAP32[HEAP32[$0 + 20 >> 2] >> 2] | 0)) << 31 >> 31) >> 0] = 0; //@line 9175
 }
 HEAP32[___async_retval >> 2] = $AsyncRetVal; //@line 9178
 return;
}
function __ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv__async_cb($0) {
 $0 = $0 | 0;
 var $$0 = 0, $2 = 0;
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 8239
 if ((HEAP32[$2 + 24 >> 2] | 0) == 1) {
  HEAP32[HEAP32[$0 + 8 >> 2] >> 2] = HEAP32[$2 + 16 >> 2]; //@line 8250
  $$0 = 1; //@line 8251
 } else {
  $$0 = 0; //@line 8253
 }
 HEAP8[___async_retval >> 0] = $$0 & 1; //@line 8257
 return;
}
function _serial_init($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $10 = 0, $4 = 0, $9 = 0;
 HEAP32[$0 + 4 >> 2] = $2; //@line 3024
 HEAP32[$0 >> 2] = $1; //@line 3025
 HEAP32[1455] = 1; //@line 3026
 $4 = $0; //@line 3027
 $9 = HEAP32[$4 + 4 >> 2] | 0; //@line 3032
 $10 = 5824; //@line 3033
 HEAP32[$10 >> 2] = HEAP32[$4 >> 2]; //@line 3035
 HEAP32[$10 + 4 >> 2] = $9; //@line 3038
 return;
}
function __ZNK10__cxxabiv117__class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, 0) | 0) {
  __ZNK10__cxxabiv117__class_type_info24process_found_base_classEPNS_19__dynamic_cast_infoEPvi(0, $1, $2, $3); //@line 12841
 }
 return;
}
function _mbed_trace_default_print($0) {
 $0 = $0 | 0;
 var $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 1763
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 1764
 _puts($0) | 0; //@line 1765
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 35; //@line 1768
  sp = STACKTOP; //@line 1769
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 1772
  return;
 }
}
function _equeue_sema_create($0) {
 $0 = $0 | 0;
 var $$0 = 0, $1 = 0, $4 = 0;
 $1 = _pthread_mutex_init($0 | 0, 0) | 0; //@line 1663
 if (!$1) {
  $4 = _pthread_cond_init($0 + 28 | 0, 0) | 0; //@line 1667
  if (!$4) {
   HEAP8[$0 + 76 >> 0] = 0; //@line 1671
   $$0 = 0; //@line 1672
  } else {
   $$0 = $4; //@line 1674
  }
 } else {
  $$0 = $1; //@line 1677
 }
 return $$0 | 0; //@line 1679
}
function _equeue_tick() {
 var $0 = 0, sp = 0;
 sp = STACKTOP; //@line 1626
 STACKTOP = STACKTOP + 16 | 0; //@line 1627
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 1627
 $0 = sp; //@line 1628
 _gettimeofday($0 | 0, 0) | 0; //@line 1629
 STACKTOP = sp; //@line 1636
 return ((HEAP32[$0 + 4 >> 2] | 0) / 1e3 | 0) + ((HEAP32[$0 >> 2] | 0) * 1e3 | 0) | 0; //@line 1636
}
function _wait_ms($0) {
 $0 = $0 | 0;
 var $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 3128
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 3129
 _emscripten_sleep($0 | 0); //@line 3130
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 75; //@line 3133
  sp = STACKTOP; //@line 3134
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 3137
  return;
 }
}
function __ZN20SimulatorBlockDevice4initEv($0) {
 $0 = $0 | 0;
 var $15 = 0, $2 = 0, $9 = 0;
 $2 = $0 + 32 | 0; //@line 3160
 $9 = $0 + 8 | 0; //@line 3167
 $15 = ___muldi3(HEAP32[$9 >> 2] | 0, HEAP32[$9 + 4 >> 2] | 0, HEAP32[$2 >> 2] | 0, HEAP32[$2 + 4 >> 2] | 0) | 0; //@line 3173
 _emscripten_asm_const_iii(7, HEAP32[$0 + 4 >> 2] | 0, $15 | 0) | 0; //@line 3177
 return 0; //@line 3178
}
function __ZNK10__cxxabiv117__class_type_info29process_static_type_below_dstEPNS_19__dynamic_cast_infoEPKvi($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $7 = 0;
 if ((HEAP32[$1 + 4 >> 2] | 0) == ($2 | 0)) {
  $7 = $1 + 28 | 0; //@line 12905
  if ((HEAP32[$7 >> 2] | 0) != 1) {
   HEAP32[$7 >> 2] = $3; //@line 12909
  }
 }
 return;
}
function __ZN10__cxxabiv112_GLOBAL__N_110construct_Ev() {
 var sp = 0;
 sp = STACKTOP; //@line 13344
 STACKTOP = STACKTOP + 16 | 0; //@line 13345
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 13345
 if (!(_pthread_key_create(6692, 140) | 0)) {
  STACKTOP = sp; //@line 13350
  return;
 } else {
  _abort_message(5522, sp); //@line 13352
 }
}
function _emscripten_alloc_async_context(len, sp) {
 len = len | 0;
 sp = sp | 0;
 var new_frame = 0;
 new_frame = stackAlloc(len + 8 | 0) | 0; //@line 9768
 HEAP32[new_frame + 4 >> 2] = sp; //@line 9770
 HEAP32[new_frame >> 2] = ___async_cur_frame; //@line 9772
 ___async_cur_frame = new_frame; //@line 9773
 return ___async_cur_frame + 8 | 0; //@line 9774
}
function __ZN4mbed8CallbackIFvvEE13function_moveIN6events5EventIS1_EEEEvPvPKv($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $2 = 0;
 HEAP32[$0 >> 2] = 0; //@line 4232
 $2 = HEAP32[$1 >> 2] | 0; //@line 4233
 if (!$2) {
  return;
 }
 HEAP32[$0 >> 2] = $2; //@line 4238
 HEAP32[$2 >> 2] = (HEAP32[$2 >> 2] | 0) + 1; //@line 4241
 return;
}
function ___cxa_can_catch__async_cb($0) {
 $0 = $0 | 0;
 var $AsyncRetVal = 0;
 $AsyncRetVal = HEAP8[___async_retval >> 0] & 1; //@line 8039
 if ($AsyncRetVal) {
  HEAP32[HEAP32[$0 + 8 >> 2] >> 2] = HEAP32[HEAP32[$0 + 4 >> 2] >> 2]; //@line 8043
 }
 HEAP32[___async_retval >> 2] = $AsyncRetVal & 1; //@line 8046
 return;
}
function _bitshift64Shl(low, high, bits) {
 low = low | 0;
 high = high | 0;
 bits = bits | 0;
 if ((bits | 0) < 32) {
  tempRet0 = high << bits | (low & (1 << bits) - 1 << 32 - bits) >>> 32 - bits; //@line 9757
  return low << bits; //@line 9758
 }
 tempRet0 = low << bits - 32; //@line 9760
 return 0; //@line 9761
}
function __ZN20SimulatorBlockDevice7programEPKvyy__async_cb_55($0) {
 $0 = $0 | 0;
 _emscripten_asm_const_iiiii(9, HEAP32[(HEAP32[$0 + 24 >> 2] | 0) + 4 >> 2] | 0, HEAP32[$0 + 28 >> 2] | 0, HEAP32[$0 + 8 >> 2] | 0, HEAP32[$0 + 16 >> 2] | 0) | 0; //@line 7718
 HEAP32[___async_retval >> 2] = 0; //@line 7720
 return;
}
function __ZNK20SimulatorBlockDevice4sizeEv($0) {
 $0 = $0 | 0;
 var $15 = 0, $2 = 0, $9 = 0;
 $2 = $0 + 32 | 0; //@line 3782
 $9 = $0 + 24 | 0; //@line 3789
 $15 = ___muldi3(HEAP32[$9 >> 2] | 0, HEAP32[$9 + 4 >> 2] | 0, HEAP32[$2 >> 2] | 0, HEAP32[$2 + 4 >> 2] | 0) | 0; //@line 3795
 return $15 | 0; //@line 3798
}
function _bitshift64Lshr(low, high, bits) {
 low = low | 0;
 high = high | 0;
 bits = bits | 0;
 if ((bits | 0) < 32) {
  tempRet0 = high >>> bits; //@line 9746
  return low >>> bits | (high & (1 << bits) - 1) << 32 - bits; //@line 9747
 }
 tempRet0 = 0; //@line 9749
 return high >>> bits - 32 | 0; //@line 9750
}
function __ZN20SimulatorBlockDevice4readEPvyy__async_cb_46($0) {
 $0 = $0 | 0;
 _emscripten_asm_const_iiiii(8, HEAP32[(HEAP32[$0 + 24 >> 2] | 0) + 4 >> 2] | 0, HEAP32[$0 + 28 >> 2] | 0, HEAP32[$0 + 8 >> 2] | 0, HEAP32[$0 + 16 >> 2] | 0) | 0; //@line 6857
 HEAP32[___async_retval >> 2] = 0; //@line 6859
 return;
}
function _equeue_dispatch__async_cb_23($0) {
 $0 = $0 | 0;
 var $4 = 0, $6 = 0;
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 3860
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 3862
 HEAP8[HEAP32[$0 + 4 >> 2] >> 0] = 1; //@line 3863
 _equeue_mutex_unlock($4); //@line 3864
 HEAP8[$6 >> 0] = 0; //@line 3865
 return;
}
function _fflush__async_cb_26($0) {
 $0 = $0 | 0;
 var $AsyncRetVal = 0;
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 5277
 if (!(HEAP8[$0 + 4 >> 0] & 1)) {
  ___unlockfile(HEAP32[$0 + 8 >> 2] | 0); //@line 5279
 }
 HEAP32[___async_retval >> 2] = $AsyncRetVal; //@line 5282
 return;
}
function __ZN4mbed11InterruptIn4fallENS_8CallbackIFvvEEE__async_cb_3($0) {
 $0 = $0 | 0;
 var $6 = 0;
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 1004
 HEAP32[HEAP32[$0 + 8 >> 2] >> 2] = HEAP32[HEAP32[$0 + 4 >> 2] >> 2]; //@line 1006
 _gpio_irq_set($6 + 28 | 0, 2, 1); //@line 1008
 return;
}
function __ZN20SimulatorBlockDevice5eraseEyy__async_cb_64($0) {
 $0 = $0 | 0;
 _emscripten_asm_const_iiii(10, HEAP32[(HEAP32[$0 + 24 >> 2] | 0) + 4 >> 2] | 0, HEAP32[$0 + 8 >> 2] | 0, HEAP32[$0 + 16 >> 2] | 0) | 0; //@line 8734
 HEAP32[___async_retval >> 2] = 0; //@line 8736
 return;
}
function stackAlloc(size) {
 size = size | 0;
 var ret = 0;
 ret = STACKTOP; //@line 4
 STACKTOP = STACKTOP + size | 0; //@line 5
 STACKTOP = STACKTOP + 15 & -16; //@line 6
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(size | 0); //@line 7
 return ret | 0; //@line 9
}
function _equeue_post__async_cb($0) {
 $0 = $0 | 0;
 var $AsyncRetVal = 0;
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 9362
 _equeue_sema_signal((HEAP32[$0 + 4 >> 2] | 0) + 48 | 0); //@line 9364
 HEAP32[___async_retval >> 2] = $AsyncRetVal; //@line 9366
 return;
}
function _puts__async_cb($0) {
 $0 = $0 | 0;
 var $$lobit = 0;
 $$lobit = HEAP32[___async_retval >> 2] >> 31; //@line 8126
 if (HEAP32[$0 + 4 >> 2] | 0) {
  ___unlockfile(HEAP32[$0 + 8 >> 2] | 0); //@line 8129
 }
 HEAP32[___async_retval >> 2] = $$lobit; //@line 8132
 return;
}
function dynCall_iiiiiii(index, a1, a2, a3, a4, a5, a6) {
 index = index | 0;
 a1 = a1 | 0;
 a2 = a2 | 0;
 a3 = a3 | 0;
 a4 = a4 | 0;
 a5 = a5 | 0;
 a6 = a6 | 0;
 return FUNCTION_TABLE_iiiiiii[index & 3](a1 | 0, a2 | 0, a3 | 0, a4 | 0, a5 | 0, a6 | 0) | 0; //@line 10003
}
function ___overflow__async_cb($0) {
 $0 = $0 | 0;
 var $$0 = 0;
 if ((HEAP32[___async_retval >> 2] | 0) == 1) {
  $$0 = HEAPU8[HEAP32[$0 + 4 >> 2] >> 0] | 0; //@line 1140
 } else {
  $$0 = -1; //@line 1142
 }
 HEAP32[___async_retval >> 2] = $$0; //@line 1145
 return;
}
function ___lctrans_impl($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0 = 0;
 if (!$1) {
  $$0 = 0; //@line 8166
 } else {
  $$0 = ___mo_lookup(HEAP32[$1 >> 2] | 0, HEAP32[$1 + 4 >> 2] | 0, $0) | 0; //@line 8172
 }
 return ($$0 | 0 ? $$0 : $0) | 0; //@line 8176
}
function dynCall_viiiiii(index, a1, a2, a3, a4, a5, a6) {
 index = index | 0;
 a1 = a1 | 0;
 a2 = a2 | 0;
 a3 = a3 | 0;
 a4 = a4 | 0;
 a5 = a5 | 0;
 a6 = a6 | 0;
 FUNCTION_TABLE_viiiiii[index & 3](a1 | 0, a2 | 0, a3 | 0, a4 | 0, a5 | 0, a6 | 0); //@line 10045
}
function _emscripten_free_async_context(ctx) {
 ctx = ctx | 0;
 assert((___async_cur_frame + 8 | 0) == (ctx | 0) | 0); //@line 9780
 stackRestore(___async_cur_frame | 0); //@line 9781
 ___async_cur_frame = HEAP32[___async_cur_frame >> 2] | 0; //@line 9782
}
function _fputc__async_cb($0) {
 $0 = $0 | 0;
 var $AsyncRetVal = 0;
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 7097
 ___unlockfile(HEAP32[$0 + 4 >> 2] | 0); //@line 7098
 HEAP32[___async_retval >> 2] = $AsyncRetVal; //@line 7100
 return;
}
function _putc__async_cb($0) {
 $0 = $0 | 0;
 var $AsyncRetVal = 0;
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 9339
 ___unlockfile(HEAP32[$0 + 4 >> 2] | 0); //@line 9340
 HEAP32[___async_retval >> 2] = $AsyncRetVal; //@line 9342
 return;
}
function ___DOUBLE_BITS_677($0) {
 $0 = +$0;
 var $1 = 0;
 HEAPF64[tempDoublePtr >> 3] = $0; //@line 11277
 $1 = HEAP32[tempDoublePtr >> 2] | 0; //@line 11277
 tempRet0 = HEAP32[tempDoublePtr + 4 >> 2] | 0; //@line 11279
 return $1 | 0; //@line 11280
}
function __ZNK20SimulatorBlockDevice14get_erase_sizeEy($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $4 = 0;
 $4 = $0 + 24 | 0; //@line 3768
 tempRet0 = HEAP32[$4 + 4 >> 2] | 0; //@line 3774
 return HEAP32[$4 >> 2] | 0; //@line 3775
}
function _gpio_init_out($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 HEAP32[$0 >> 2] = $1; //@line 2947
 if (($1 | 0) == -1) {
  return;
 }
 HEAP32[$0 + 4 >> 2] = $1; //@line 2953
 _emscripten_asm_const_iii(3, $0 | 0, $1 | 0) | 0; //@line 2954
 return;
}
function _gpio_init_in($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 HEAP32[$0 >> 2] = $1; //@line 2932
 if (($1 | 0) == -1) {
  return;
 }
 HEAP32[$0 + 4 >> 2] = $1; //@line 2938
 _emscripten_asm_const_iii(2, $0 | 0, $1 | 0) | 0; //@line 2939
 return;
}
function _equeue_sema_signal($0) {
 $0 = $0 | 0;
 _pthread_mutex_lock($0 | 0) | 0; //@line 1685
 HEAP8[$0 + 76 >> 0] = 1; //@line 1687
 _pthread_cond_signal($0 + 28 | 0) | 0; //@line 1689
 _pthread_mutex_unlock($0 | 0) | 0; //@line 1690
 return;
}
function ___syscall_ret($0) {
 $0 = $0 | 0;
 var $$0 = 0;
 if ($0 >>> 0 > 4294963200) {
  HEAP32[(___errno_location() | 0) >> 2] = 0 - $0; //@line 7625
  $$0 = -1; //@line 7626
 } else {
  $$0 = $0; //@line 7628
 }
 return $$0 | 0; //@line 7630
}
function dynCall_iiiiii(index, a1, a2, a3, a4, a5) {
 index = index | 0;
 a1 = a1 | 0;
 a2 = a2 | 0;
 a3 = a3 | 0;
 a4 = a4 | 0;
 a5 = a5 | 0;
 return FUNCTION_TABLE_iiiiii[index & 3](a1 | 0, a2 | 0, a3 | 0, a4 | 0, a5 | 0) | 0; //@line 9996
}
function _i64Subtract(a, b, c, d) {
 a = a | 0;
 b = b | 0;
 c = c | 0;
 d = d | 0;
 var h = 0;
 h = b - d >>> 0; //@line 9497
 h = b - d - (c >>> 0 > a >>> 0 | 0) >>> 0; //@line 9498
 return (tempRet0 = h, a - c >>> 0 | 0) | 0; //@line 9499
}
function dynCall_viiiii(index, a1, a2, a3, a4, a5) {
 index = index | 0;
 a1 = a1 | 0;
 a2 = a2 | 0;
 a3 = a3 | 0;
 a4 = a4 | 0;
 a5 = a5 | 0;
 FUNCTION_TABLE_viiiii[index & 3](a1 | 0, a2 | 0, a3 | 0, a4 | 0, a5 | 0); //@line 10038
}
function _equeue_enqueue__async_cb($0) {
 $0 = $0 | 0;
 var $4 = 0;
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 8142
 _equeue_mutex_unlock(HEAP32[$0 + 4 >> 2] | 0); //@line 8143
 HEAP32[___async_retval >> 2] = $4; //@line 8145
 return;
}
function _handle_lora_downlink($0, $1, $2, $3, $4, $5) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 $5 = $5 | 0;
 __ZN16SX1276_LoRaRadio8rx_frameEPhjjhh($0, $1, $2, $3, $4, $5); //@line 65
 return;
}
function ___clang_call_terminate($0) {
 $0 = $0 | 0;
 var sp = 0;
 sp = STACKTOP; //@line 48
 ___cxa_begin_catch($0 | 0) | 0; //@line 49
 _emscripten_alloc_async_context(4, sp) | 0; //@line 50
 __ZSt9terminatev(); //@line 51
}
function __Z8btn_fallv__async_cb($0) {
 $0 = $0 | 0;
 var $2 = 0;
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 5471
 HEAP32[$2 >> 2] = HEAP32[HEAP32[1458] >> 2]; //@line 5476
 _printf(2383, $2) | 0; //@line 5477
 return;
}
function __ZNK20SimulatorBlockDevice16get_program_sizeEv($0) {
 $0 = $0 | 0;
 var $2 = 0;
 $2 = $0 + 16 | 0; //@line 3738
 tempRet0 = HEAP32[$2 + 4 >> 2] | 0; //@line 3744
 return HEAP32[$2 >> 2] | 0; //@line 3745
}
function __ZNK20SimulatorBlockDevice14get_erase_sizeEv($0) {
 $0 = $0 | 0;
 var $2 = 0;
 $2 = $0 + 24 | 0; //@line 3752
 tempRet0 = HEAP32[$2 + 4 >> 2] | 0; //@line 3758
 return HEAP32[$2 >> 2] | 0; //@line 3759
}
function __ZNK20SimulatorBlockDevice13get_read_sizeEv($0) {
 $0 = $0 | 0;
 var $2 = 0;
 $2 = $0 + 8 | 0; //@line 3724
 tempRet0 = HEAP32[$2 + 4 >> 2] | 0; //@line 3730
 return HEAP32[$2 >> 2] | 0; //@line 3731
}
function _i64Add(a, b, c, d) {
 a = a | 0;
 b = b | 0;
 c = c | 0;
 d = d | 0;
 var l = 0;
 l = a + c >>> 0; //@line 9489
 return (tempRet0 = b + d + (l >>> 0 < a >>> 0 | 0) >>> 0, l | 0) | 0; //@line 9491
}
function dynCall_viiii(index, a1, a2, a3, a4) {
 index = index | 0;
 a1 = a1 | 0;
 a2 = a2 | 0;
 a3 = a3 | 0;
 a4 = a4 | 0;
 FUNCTION_TABLE_viiii[index & 3](a1 | 0, a2 | 0, a3 | 0, a4 | 0); //@line 10031
}
function _wctomb($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0 = 0;
 if (!$0) {
  $$0 = 0; //@line 10337
 } else {
  $$0 = _wcrtomb($0, $1, 0) | 0; //@line 10340
 }
 return $$0 | 0; //@line 10342
}
function _strchr($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $2 = 0;
 $2 = ___strchrnul($0, $1) | 0; //@line 8311
 return ((HEAP8[$2 >> 0] | 0) == ($1 & 255) << 24 >> 24 ? $2 : 0) | 0; //@line 8316
}
function __GLOBAL__sub_I_main_cpp__async_cb($0) {
 $0 = $0 | 0;
 __ZN6events10EventQueueC2EjPh(5836, 1664, 0); //@line 2597
 __ZN4mbed11InterruptInC2E7PinName(6040, 1337); //@line 2598
 return;
}
function dynCall_iiii(index, a1, a2, a3) {
 index = index | 0;
 a1 = a1 | 0;
 a2 = a2 | 0;
 a3 = a3 | 0;
 return FUNCTION_TABLE_iiii[index & 7](a1 | 0, a2 | 0, a3 | 0) | 0; //@line 9989
}
function ___udivdi3($a$0, $a$1, $b$0, $b$1) {
 $a$0 = $a$0 | 0;
 $a$1 = $a$1 | 0;
 $b$0 = $b$0 | 0;
 $b$1 = $b$1 | 0;
 return ___udivmoddi4($a$0, $a$1, $b$0, $b$1, 0) | 0; //@line 9726
}
function b17(p0, p1, p2, p3, p4, p5) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 p3 = p3 | 0;
 p4 = p4 | 0;
 p5 = p5 | 0;
 nullFunc_iiiiiii(3); //@line 10085
 return 0; //@line 10085
}
function b16(p0, p1, p2, p3, p4, p5) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 p3 = p3 | 0;
 p4 = p4 | 0;
 p5 = p5 | 0;
 nullFunc_iiiiiii(0); //@line 10082
 return 0; //@line 10082
}
function _fputs($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $2 = 0;
 $2 = _strlen($0) | 0; //@line 7806
 return ((_fwrite($0, 1, $2, $1) | 0) != ($2 | 0)) << 31 >> 31 | 0; //@line 7810
}
function ___dynamic_cast__async_cb($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = (HEAP32[HEAP32[$0 + 4 >> 2] >> 2] | 0) == 1 ? HEAP32[$0 + 8 >> 2] | 0 : 0; //@line 5394
 return;
}
function __ZN6events5EventIFvvEE10event_postIPS1_EEiPNS2_5eventE__async_cb($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = HEAP32[___async_retval >> 2]; //@line 7981
 return;
}
function _gpio_irq_set($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 _emscripten_asm_const_iiii(6, HEAP32[$0 + 4 >> 2] | 0, $1 | 0, $2 | 0) | 0; //@line 3014
 return;
}
function _emscripten_realloc_async_context(len) {
 len = len | 0;
 stackRestore(___async_cur_frame | 0); //@line 9787
 return (stackAlloc(len + 8 | 0) | 0) + 8 | 0; //@line 9788
}
function establishStackSpace(stackBase, stackMax) {
 stackBase = stackBase | 0;
 stackMax = stackMax | 0;
 STACKTOP = stackBase; //@line 21
 STACK_MAX = stackMax; //@line 22
}
function __ZN4mbed11InterruptIn4fallENS_8CallbackIFvvEEE__async_cb_6($0) {
 $0 = $0 | 0;
 _gpio_irq_set((HEAP32[$0 + 8 >> 2] | 0) + 28 | 0, 2, 0); //@line 1119
 return;
}
function __ZN10__cxxabiv120__si_class_type_infoD0Ev($0) {
 $0 = $0 | 0;
 __ZN10__cxxabiv116__shim_type_infoD2Ev($0); //@line 13127
 __ZdlPv($0); //@line 13128
 return;
}
function _swapc($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $3 = 0;
 $3 = _llvm_bswap_i32($0 | 0) | 0; //@line 8302
 return (($1 | 0) == 0 ? $0 : $3) | 0; //@line 8304
}
function b14(p0, p1, p2, p3, p4) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 p3 = p3 | 0;
 p4 = p4 | 0;
 nullFunc_iiiiii(3); //@line 10079
 return 0; //@line 10079
}
function b13(p0, p1, p2, p3, p4) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 p3 = p3 | 0;
 p4 = p4 | 0;
 nullFunc_iiiiii(0); //@line 10076
 return 0; //@line 10076
}
function __ZN10__cxxabiv117__class_type_infoD0Ev($0) {
 $0 = $0 | 0;
 __ZN10__cxxabiv116__shim_type_infoD2Ev($0); //@line 12655
 __ZdlPv($0); //@line 12656
 return;
}
function __ZN10__cxxabiv121__vmi_class_type_infoD0Ev($0) {
 $0 = $0 | 0;
 __ZN10__cxxabiv116__shim_type_infoD2Ev($0); //@line 71
 __ZdlPv($0); //@line 72
 return;
}
function setThrew(threw, value) {
 threw = threw | 0;
 value = value | 0;
 if (!__THREW__) {
  __THREW__ = threw; //@line 32
  threwValue = value; //@line 33
 }
}
function _out_670($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 if (!(HEAP32[$0 >> 2] & 32)) {
  ___fwritex($1, $2, $0) | 0; //@line 9822
 }
 return;
}
function ___cxa_is_pointer_type__async_cb($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = (HEAP32[___async_retval >> 2] | 0) != 0 & 1; //@line 7963
 return;
}
function b130(p0, p1, p2, p3, p4, p5) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 p3 = p3 | 0;
 p4 = p4 | 0;
 p5 = p5 | 0;
 nullFunc_viiiiii(0); //@line 10406
}
function __ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 return ($0 | 0) == ($1 | 0) | 0; //@line 12852
}
function _gpio_irq_free($0) {
 $0 = $0 | 0;
 _emscripten_asm_const_iii(5, HEAP32[$0 + 4 >> 2] | 0, HEAP32[$0 + 8 >> 2] | 0) | 0; //@line 3003
 return;
}
function __ZN11BlockDevice4trimEyy($0, $1, $2, $3, $4) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 return 0; //@line 1746
}
function __ZNK10__cxxabiv122__base_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function dynCall_vii(index, a1, a2) {
 index = index | 0;
 a1 = a1 | 0;
 a2 = a2 | 0;
 FUNCTION_TABLE_vii[index & 3](a1 | 0, a2 | 0); //@line 10024
}
function __ZNK10__cxxabiv120__si_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function __ZSt13get_terminatev() {
 var $0 = 0;
 $0 = HEAP32[241] | 0; //@line 61
 HEAP32[241] = $0 + 0; //@line 63
 return $0 | 0; //@line 65
}
function __ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function b128(p0, p1, p2, p3, p4) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 p3 = p3 | 0;
 p4 = p4 | 0;
 nullFunc_viiiii(0); //@line 10403
}
function _llvm_bswap_i32(x) {
 x = x | 0;
 return (x & 255) << 24 | (x >> 8 & 255) << 16 | (x >> 16 & 255) << 8 | x >>> 24 | 0; //@line 9814
}
function __ZNK10__cxxabiv120__si_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function __ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_9($0) {
 $0 = $0 | 0;
 return;
}
function _strerror($0) {
 $0 = $0 | 0;
 return ___strerror_l($0, HEAP32[(___pthread_self_85() | 0) + 188 >> 2] | 0) | 0; //@line 10285
}
function _fflush__async_cb_27($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = HEAP32[___async_retval >> 2]; //@line 5292
 return;
}
function _snprintf__async_cb($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = HEAP32[___async_retval >> 2]; //@line 1343
 return;
}
function _fputc__async_cb_49($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = HEAP32[___async_retval >> 2]; //@line 7110
 return;
}
function _putc__async_cb_81($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = HEAP32[___async_retval >> 2]; //@line 9352
 return;
}
function dynCall_ii(index, a1) {
 index = index | 0;
 a1 = a1 | 0;
 return FUNCTION_TABLE_ii[index & 15](a1 | 0) | 0; //@line 9982
}
function _printf__async_cb($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = HEAP32[___async_retval >> 2]; //@line 9378
 return;
}
function b11(p0, p1, p2) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 nullFunc_iiii(7); //@line 10073
 return 0; //@line 10073
}
function b10(p0, p1, p2) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 nullFunc_iiii(0); //@line 10070
 return 0; //@line 10070
}
function __ZN4mbed11InterruptInD0Ev__async_cb_58($0) {
 $0 = $0 | 0;
 __ZdlPv(HEAP32[$0 + 4 >> 2] | 0); //@line 8088
 return;
}
function __ZSt11__terminatePFvvE__async_cb($0) {
 $0 = $0 | 0;
 _abort_message(5625, HEAP32[$0 + 4 >> 2] | 0); //@line 9289
}
function dynCall_vi(index, a1) {
 index = index | 0;
 a1 = a1 | 0;
 FUNCTION_TABLE_vi[index & 255](a1 | 0); //@line 10017
}
function b126(p0, p1, p2, p3) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 p3 = p3 | 0;
 nullFunc_viiii(0); //@line 10400
}
function _equeue_event_period($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 HEAP32[$0 + -12 >> 2] = $1; //@line 1612
 return;
}
function _equeue_event_delay($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 HEAP32[$0 + -16 >> 2] = $1; //@line 1603
 return;
}
function __ZN4mbed8CallbackIFvvEE13function_callIN6events5EventIS1_EEEEvPKv__async_cb_80($0) {
 $0 = $0 | 0;
 return;
}
function _equeue_event_dtor($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 HEAP32[$0 + -8 >> 2] = $1; //@line 1621
 return;
}
function __ZN4mbed8CallbackIFvvEE13function_dtorIN6events5EventIS1_EEEEvPv__async_cb_8($0) {
 $0 = $0 | 0;
 return;
}
function __ZN6events10EventQueue13function_callINS0_9context00IPFvvEEEEEvPv__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function ___lctrans($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 return ___lctrans_impl($0, $1) | 0; //@line 11530
}
function _equeue_mutex_unlock($0) {
 $0 = $0 | 0;
 _pthread_mutex_unlock($0 | 0) | 0; //@line 1656
 return;
}
function _equeue_mutex_create($0) {
 $0 = $0 | 0;
 return _pthread_mutex_init($0 | 0, 0) | 0; //@line 1643
}
function _main__async_cb_40($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = 0; //@line 6222
 return;
}
function _main__async_cb_35($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = 1; //@line 6075
 return;
}
function __ZN6events10EventQueue13function_dtorINS0_9context00IPFvvEEEEEvPv($0) {
 $0 = $0 | 0;
 return;
}
function __ZN4mbed11InterruptIn12_irq_handlerEj14gpio_irq_event__async_cb_2($0) {
 $0 = $0 | 0;
 return;
}
function dynCall_i(index) {
 index = index | 0;
 return FUNCTION_TABLE_i[index & 0]() | 0; //@line 9975
}
function _equeue_mutex_lock($0) {
 $0 = $0 | 0;
 _pthread_mutex_lock($0 | 0) | 0; //@line 1649
 return;
}
function __ZN4mbed11InterruptIn12_irq_handlerEj14gpio_irq_event__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function __ZN20SimulatorBlockDeviceD0Ev($0) {
 $0 = $0 | 0;
 __ZdlPv($0); //@line 3151
 return;
}
function dynCall_v(index) {
 index = index | 0;
 FUNCTION_TABLE_v[index & 3](); //@line 10010
}
function __ZN6events5EventIFvvEE10event_dtorIPS1_EEvPNS2_5eventE($0) {
 $0 = $0 | 0;
 return;
}
function _isdigit($0) {
 $0 = $0 | 0;
 return ($0 + -48 | 0) >>> 0 < 10 | 0; //@line 7683
}
function b8(p0) {
 p0 = p0 | 0;
 nullFunc_ii(15); //@line 10067
 return 0; //@line 10067
}
function b7(p0) {
 p0 = p0 | 0;
 nullFunc_ii(14); //@line 10064
 return 0; //@line 10064
}
function b6(p0) {
 p0 = p0 | 0;
 nullFunc_ii(13); //@line 10061
 return 0; //@line 10061
}
function b5(p0) {
 p0 = p0 | 0;
 nullFunc_ii(12); //@line 10058
 return 0; //@line 10058
}
function b4(p0) {
 p0 = p0 | 0;
 nullFunc_ii(11); //@line 10055
 return 0; //@line 10055
}
function __ZN20SimulatorBlockDevice6deinitEv($0) {
 $0 = $0 | 0;
 return 0; //@line 3184
}
function b3(p0) {
 p0 = p0 | 0;
 nullFunc_ii(0); //@line 10052
 return 0; //@line 10052
}
function b124(p0, p1) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 nullFunc_vii(3); //@line 10397
}
function b123(p0, p1) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 nullFunc_vii(0); //@line 10394
}
function __ZN6events10EventQueue8dispatchEi__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function __ZN20SimulatorBlockDeviceC2EPKcyy__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function __ZNK10__cxxabiv116__shim_type_info5noop2Ev($0) {
 $0 = $0 | 0;
 return;
}
function __ZNK10__cxxabiv116__shim_type_info5noop1Ev($0) {
 $0 = $0 | 0;
 return;
}
function _abort_message__async_cb_52($0) {
 $0 = $0 | 0;
 _abort(); //@line 7255
}
function ___ofl_lock() {
 ___lock(6676); //@line 8321
 return 6684; //@line 8322
}
function setTempRet0(value) {
 value = value | 0;
 tempRet0 = value; //@line 39
}
function _frexpl($0, $1) {
 $0 = +$0;
 $1 = $1 | 0;
 return +(+_frexp($0, $1));
}
function __ZNK11BlockDevice15get_erase_valueEv($0) {
 $0 = $0 | 0;
 return -1;
}
function __ZN4mbed11InterruptInD2Ev__async_cb_50($0) {
 $0 = $0 | 0;
 return;
}
function __ZN11BlockDevice4syncEv($0) {
 $0 = $0 | 0;
 return 0; //@line 1752
}
function __ZN10__cxxabiv116__shim_type_infoD2Ev($0) {
 $0 = $0 | 0;
 return;
}
function ___pthread_self_910() {
 return _pthread_self() | 0; //@line 11451
}
function ___pthread_self_85() {
 return _pthread_self() | 0; //@line 11457
}
function _mbed_trace_default_print__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function stackRestore(top) {
 top = top | 0;
 STACKTOP = top; //@line 16
}
function _pthread_mutex_unlock(x) {
 x = x | 0;
 return 0; //@line 9941
}
function __ZdlPv($0) {
 $0 = $0 | 0;
 _free($0); //@line 12481
 return;
}
function b1() {
 nullFunc_i(0); //@line 10049
 return 0; //@line 10049
}
function _pthread_mutex_lock(x) {
 x = x | 0;
 return 0; //@line 9937
}
function _mbed_assert_internal__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function _handle_interrupt_in__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function __ZN20SimulatorBlockDeviceD2Ev($0) {
 $0 = $0 | 0;
 return;
}
function b121(p0) {
 p0 = p0 | 0;
 nullFunc_vi(255); //@line 10391
}
function b120(p0) {
 p0 = p0 | 0;
 nullFunc_vi(254); //@line 10388
}
function b119(p0) {
 p0 = p0 | 0;
 nullFunc_vi(253); //@line 10385
}
function b118(p0) {
 p0 = p0 | 0;
 nullFunc_vi(252); //@line 10382
}
function b117(p0) {
 p0 = p0 | 0;
 nullFunc_vi(251); //@line 10379
}
function b116(p0) {
 p0 = p0 | 0;
 nullFunc_vi(250); //@line 10376
}
function b115(p0) {
 p0 = p0 | 0;
 nullFunc_vi(249); //@line 10373
}
function b114(p0) {
 p0 = p0 | 0;
 nullFunc_vi(248); //@line 10370
}
function b113(p0) {
 p0 = p0 | 0;
 nullFunc_vi(247); //@line 10367
}
function b112(p0) {
 p0 = p0 | 0;
 nullFunc_vi(246); //@line 10364
}
function b111(p0) {
 p0 = p0 | 0;
 nullFunc_vi(245); //@line 10361
}
function b110(p0) {
 p0 = p0 | 0;
 nullFunc_vi(244); //@line 10358
}
function b109(p0) {
 p0 = p0 | 0;
 nullFunc_vi(243); //@line 10355
}
function b108(p0) {
 p0 = p0 | 0;
 nullFunc_vi(242); //@line 10352
}
function b107(p0) {
 p0 = p0 | 0;
 nullFunc_vi(241); //@line 10349
}
function b106(p0) {
 p0 = p0 | 0;
 nullFunc_vi(240); //@line 10346
}
function b105(p0) {
 p0 = p0 | 0;
 nullFunc_vi(239); //@line 10343
}
function b104(p0) {
 p0 = p0 | 0;
 nullFunc_vi(238); //@line 10340
}
function b103(p0) {
 p0 = p0 | 0;
 nullFunc_vi(237); //@line 10337
}
function b102(p0) {
 p0 = p0 | 0;
 nullFunc_vi(236); //@line 10334
}
function b101(p0) {
 p0 = p0 | 0;
 nullFunc_vi(235); //@line 10331
}
function b100(p0) {
 p0 = p0 | 0;
 nullFunc_vi(234); //@line 10328
}
function _mbed_error_printf__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function ___ofl_unlock() {
 ___unlock(6676); //@line 8327
 return;
}
function b99(p0) {
 p0 = p0 | 0;
 nullFunc_vi(233); //@line 10325
}
function b98(p0) {
 p0 = p0 | 0;
 nullFunc_vi(232); //@line 10322
}
function b97(p0) {
 p0 = p0 | 0;
 nullFunc_vi(231); //@line 10319
}
function b96(p0) {
 p0 = p0 | 0;
 nullFunc_vi(230); //@line 10316
}
function b95(p0) {
 p0 = p0 | 0;
 nullFunc_vi(229); //@line 10313
}
function b94(p0) {
 p0 = p0 | 0;
 nullFunc_vi(228); //@line 10310
}
function b93(p0) {
 p0 = p0 | 0;
 nullFunc_vi(227); //@line 10307
}
function b92(p0) {
 p0 = p0 | 0;
 nullFunc_vi(226); //@line 10304
}
function b91(p0) {
 p0 = p0 | 0;
 nullFunc_vi(225); //@line 10301
}
function b90(p0) {
 p0 = p0 | 0;
 nullFunc_vi(224); //@line 10298
}
function b89(p0) {
 p0 = p0 | 0;
 nullFunc_vi(223); //@line 10295
}
function b88(p0) {
 p0 = p0 | 0;
 nullFunc_vi(222); //@line 10292
}
function b87(p0) {
 p0 = p0 | 0;
 nullFunc_vi(221); //@line 10289
}
function b86(p0) {
 p0 = p0 | 0;
 nullFunc_vi(220); //@line 10286
}
function b85(p0) {
 p0 = p0 | 0;
 nullFunc_vi(219); //@line 10283
}
function b84(p0) {
 p0 = p0 | 0;
 nullFunc_vi(218); //@line 10280
}
function b83(p0) {
 p0 = p0 | 0;
 nullFunc_vi(217); //@line 10277
}
function b82(p0) {
 p0 = p0 | 0;
 nullFunc_vi(216); //@line 10274
}
function b81(p0) {
 p0 = p0 | 0;
 nullFunc_vi(215); //@line 10271
}
function b80(p0) {
 p0 = p0 | 0;
 nullFunc_vi(214); //@line 10268
}
function b79(p0) {
 p0 = p0 | 0;
 nullFunc_vi(213); //@line 10265
}
function b78(p0) {
 p0 = p0 | 0;
 nullFunc_vi(212); //@line 10262
}
function b77(p0) {
 p0 = p0 | 0;
 nullFunc_vi(211); //@line 10259
}
function b76(p0) {
 p0 = p0 | 0;
 nullFunc_vi(210); //@line 10256
}
function b75(p0) {
 p0 = p0 | 0;
 nullFunc_vi(209); //@line 10253
}
function b74(p0) {
 p0 = p0 | 0;
 nullFunc_vi(208); //@line 10250
}
function b73(p0) {
 p0 = p0 | 0;
 nullFunc_vi(207); //@line 10247
}
function b72(p0) {
 p0 = p0 | 0;
 nullFunc_vi(206); //@line 10244
}
function b71(p0) {
 p0 = p0 | 0;
 nullFunc_vi(205); //@line 10241
}
function b70(p0) {
 p0 = p0 | 0;
 nullFunc_vi(204); //@line 10238
}
function b69(p0) {
 p0 = p0 | 0;
 nullFunc_vi(203); //@line 10235
}
function b68(p0) {
 p0 = p0 | 0;
 nullFunc_vi(202); //@line 10232
}
function b67(p0) {
 p0 = p0 | 0;
 nullFunc_vi(201); //@line 10229
}
function b66(p0) {
 p0 = p0 | 0;
 nullFunc_vi(200); //@line 10226
}
function b65(p0) {
 p0 = p0 | 0;
 nullFunc_vi(199); //@line 10223
}
function b64(p0) {
 p0 = p0 | 0;
 nullFunc_vi(198); //@line 10220
}
function b63(p0) {
 p0 = p0 | 0;
 nullFunc_vi(197); //@line 10217
}
function b62(p0) {
 p0 = p0 | 0;
 nullFunc_vi(196); //@line 10214
}
function b61(p0) {
 p0 = p0 | 0;
 nullFunc_vi(195); //@line 10211
}
function b60(p0) {
 p0 = p0 | 0;
 nullFunc_vi(194); //@line 10208
}
function b59(p0) {
 p0 = p0 | 0;
 nullFunc_vi(193); //@line 10205
}
function b58(p0) {
 p0 = p0 | 0;
 nullFunc_vi(192); //@line 10202
}
function b57(p0) {
 p0 = p0 | 0;
 nullFunc_vi(191); //@line 10199
}
function b56(p0) {
 p0 = p0 | 0;
 nullFunc_vi(190); //@line 10196
}
function b55(p0) {
 p0 = p0 | 0;
 nullFunc_vi(189); //@line 10193
}
function b54(p0) {
 p0 = p0 | 0;
 nullFunc_vi(188); //@line 10190
}
function b53(p0) {
 p0 = p0 | 0;
 nullFunc_vi(187); //@line 10187
}
function b52(p0) {
 p0 = p0 | 0;
 nullFunc_vi(186); //@line 10184
}
function b51(p0) {
 p0 = p0 | 0;
 nullFunc_vi(185); //@line 10181
}
function b50(p0) {
 p0 = p0 | 0;
 nullFunc_vi(184); //@line 10178
}
function b49(p0) {
 p0 = p0 | 0;
 nullFunc_vi(183); //@line 10175
}
function b48(p0) {
 p0 = p0 | 0;
 nullFunc_vi(182); //@line 10172
}
function b47(p0) {
 p0 = p0 | 0;
 nullFunc_vi(181); //@line 10169
}
function b46(p0) {
 p0 = p0 | 0;
 nullFunc_vi(180); //@line 10166
}
function b45(p0) {
 p0 = p0 | 0;
 nullFunc_vi(179); //@line 10163
}
function b44(p0) {
 p0 = p0 | 0;
 nullFunc_vi(178); //@line 10160
}
function b43(p0) {
 p0 = p0 | 0;
 nullFunc_vi(177); //@line 10157
}
function b42(p0) {
 p0 = p0 | 0;
 nullFunc_vi(176); //@line 10154
}
function b41(p0) {
 p0 = p0 | 0;
 nullFunc_vi(175); //@line 10151
}
function b40(p0) {
 p0 = p0 | 0;
 nullFunc_vi(174); //@line 10148
}
function b39(p0) {
 p0 = p0 | 0;
 nullFunc_vi(173); //@line 10145
}
function b38(p0) {
 p0 = p0 | 0;
 nullFunc_vi(172); //@line 10142
}
function b37(p0) {
 p0 = p0 | 0;
 nullFunc_vi(171); //@line 10139
}
function b36(p0) {
 p0 = p0 | 0;
 nullFunc_vi(170); //@line 10136
}
function b35(p0) {
 p0 = p0 | 0;
 nullFunc_vi(169); //@line 10133
}
function b34(p0) {
 p0 = p0 | 0;
 nullFunc_vi(168); //@line 10130
}
function b33(p0) {
 p0 = p0 | 0;
 nullFunc_vi(167); //@line 10127
}
function b32(p0) {
 p0 = p0 | 0;
 nullFunc_vi(166); //@line 10124
}
function b31(p0) {
 p0 = p0 | 0;
 nullFunc_vi(165); //@line 10121
}
function b30(p0) {
 p0 = p0 | 0;
 nullFunc_vi(164); //@line 10118
}
function b29(p0) {
 p0 = p0 | 0;
 nullFunc_vi(163); //@line 10115
}
function b28(p0) {
 p0 = p0 | 0;
 nullFunc_vi(162); //@line 10112
}
function b27(p0) {
 p0 = p0 | 0;
 nullFunc_vi(161); //@line 10109
}
function b26(p0) {
 p0 = p0 | 0;
 nullFunc_vi(160); //@line 10106
}
function b25(p0) {
 p0 = p0 | 0;
 nullFunc_vi(159); //@line 10103
}
function b24(p0) {
 p0 = p0 | 0;
 nullFunc_vi(158); //@line 10100
}
function b23(p0) {
 p0 = p0 | 0;
 nullFunc_vi(157); //@line 10097
}
function b22(p0) {
 p0 = p0 | 0;
 nullFunc_vi(156); //@line 10094
}
function _dummy($0) {
 $0 = $0 | 0;
 return $0 | 0; //@line 7641
}
function ___lockfile($0) {
 $0 = $0 | 0;
 return 0; //@line 7958
}
function b21(p0) {
 p0 = p0 | 0;
 nullFunc_vi(0); //@line 10091
}
function _invoke_ticker__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function ___clang_call_terminate__async_cb($0) {
 $0 = $0 | 0;
}
function _serial_putc__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function _mbed_tracef__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function __ZNSt9type_infoD2Ev($0) {
 $0 = $0 | 0;
 return;
}
function getTempRet0() {
 return tempRet0 | 0; //@line 42
}
function ___errno_location() {
 return 6672; //@line 7635
}
function __ZSt9terminatev__async_cb_1($0) {
 $0 = $0 | 0;
}
function _wait_ms__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function stackSave() {
 return STACKTOP | 0; //@line 12
}
function _core_util_critical_section_enter() {
 return;
}
function __ZSt9terminatev__async_cb($0) {
 $0 = $0 | 0;
}
function _core_util_critical_section_exit() {
 return;
}
function _pthread_self() {
 return 596; //@line 7688
}
function ___unlockfile($0) {
 $0 = $0 | 0;
 return;
}
function setAsync() {
 ___async = 1; //@line 26
}
function b19() {
 nullFunc_v(0); //@line 10088
}

// EMSCRIPTEN_END_FUNCS
var FUNCTION_TABLE_i = [b1];
var FUNCTION_TABLE_ii = [b3,__ZN20SimulatorBlockDevice4initEv,__ZN20SimulatorBlockDevice6deinitEv,__ZN11BlockDevice4syncEv,__ZNK20SimulatorBlockDevice13get_read_sizeEv,__ZNK20SimulatorBlockDevice16get_program_sizeEv,__ZNK20SimulatorBlockDevice14get_erase_sizeEv,__ZNK11BlockDevice15get_erase_valueEv,__ZNK20SimulatorBlockDevice4sizeEv,___stdio_close,__ZN6events5EventIFvvEE10event_postIPS1_EEiPNS2_5eventE,b4,b5,b6,b7,b8];
var FUNCTION_TABLE_iiii = [b10,__ZNK20SimulatorBlockDevice14get_erase_sizeEy,___stdio_write,___stdio_seek,___stdout_write,_sn_write,__ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv,b11];
var FUNCTION_TABLE_iiiiii = [b13,__ZN20SimulatorBlockDevice5eraseEyy,__ZN11BlockDevice4trimEyy,b14];
var FUNCTION_TABLE_iiiiiii = [b16,__ZN20SimulatorBlockDevice4readEPvyy,__ZN20SimulatorBlockDevice7programEPKvyy,b17];
var FUNCTION_TABLE_v = [b19,__ZL25default_terminate_handlerv,__Z8btn_fallv,__ZN10__cxxabiv112_GLOBAL__N_110construct_Ev];
var FUNCTION_TABLE_vi = [b21,__ZN4mbed11InterruptInD2Ev,__ZN4mbed11InterruptInD0Ev,_mbed_trace_default_print,__ZN20SimulatorBlockDeviceD2Ev,__ZN20SimulatorBlockDeviceD0Ev,__ZN4mbed8CallbackIFvvEE13function_callIN6events5EventIS1_EEEEvPKv,__ZN4mbed8CallbackIFvvEE13function_dtorIN6events5EventIS1_EEEEvPv,__ZN10__cxxabiv116__shim_type_infoD2Ev,__ZN10__cxxabiv117__class_type_infoD0Ev,__ZNK10__cxxabiv116__shim_type_info5noop1Ev,__ZNK10__cxxabiv116__shim_type_info5noop2Ev,__ZN10__cxxabiv120__si_class_type_infoD0Ev,__ZN10__cxxabiv121__vmi_class_type_infoD0Ev,__ZN4mbed11InterruptInD2Ev__async_cb,__ZN4mbed11InterruptInD2Ev__async_cb_50,__ZN4mbed11InterruptInD0Ev__async_cb,__ZN4mbed11InterruptInD0Ev__async_cb_58,__ZN4mbed11InterruptIn12_irq_handlerEj14gpio_irq_event__async_cb,__ZN4mbed11InterruptIn12_irq_handlerEj14gpio_irq_event__async_cb_2,__ZN4mbed11InterruptIn4fallENS_8CallbackIFvvEEE__async_cb,__ZN4mbed11InterruptIn4fallENS_8CallbackIFvvEEE__async_cb_3,__ZN4mbed11InterruptIn4fallENS_8CallbackIFvvEEE__async_cb_4,__ZN4mbed11InterruptIn4fallENS_8CallbackIFvvEEE__async_cb_5,__ZN4mbed11InterruptIn4fallENS_8CallbackIFvvEEE__async_cb_6,__ZN6events10EventQueue8dispatchEi__async_cb,_equeue_alloc__async_cb,_equeue_dealloc__async_cb,_equeue_post__async_cb
,_equeue_enqueue__async_cb,_equeue_dispatch__async_cb,_equeue_dispatch__async_cb_24,_equeue_dispatch__async_cb_22,_equeue_dispatch__async_cb_23,_equeue_dispatch__async_cb_25,_mbed_trace_default_print__async_cb,_mbed_tracef__async_cb,_mbed_vtracef__async_cb,_mbed_vtracef__async_cb_20,_mbed_vtracef__async_cb_10,_mbed_vtracef__async_cb_11,_mbed_vtracef__async_cb_12,_mbed_vtracef__async_cb_19,_mbed_vtracef__async_cb_13,_mbed_vtracef__async_cb_18,_mbed_vtracef__async_cb_14,_mbed_vtracef__async_cb_15,_mbed_vtracef__async_cb_16,_mbed_vtracef__async_cb_17,_mbed_assert_internal__async_cb,_mbed_die__async_cb_79,_mbed_die__async_cb_78,_mbed_die__async_cb_77,_mbed_die__async_cb_76,_mbed_die__async_cb_75,_mbed_die__async_cb_74,_mbed_die__async_cb_73,_mbed_die__async_cb_72,_mbed_die__async_cb_71
,_mbed_die__async_cb_70,_mbed_die__async_cb_69,_mbed_die__async_cb_68,_mbed_die__async_cb_67,_mbed_die__async_cb_66,_mbed_die__async_cb_65,_mbed_die__async_cb,_mbed_error_printf__async_cb,_mbed_error_vfprintf__async_cb,_mbed_error_vfprintf__async_cb_48,_mbed_error_vfprintf__async_cb_47,_handle_interrupt_in__async_cb,_serial_putc__async_cb_59,_serial_putc__async_cb,_invoke_ticker__async_cb_51,_invoke_ticker__async_cb,_wait_ms__async_cb,__ZN20SimulatorBlockDevice4readEPvyy__async_cb,__ZN20SimulatorBlockDevice4readEPvyy__async_cb_44,__ZN20SimulatorBlockDevice4readEPvyy__async_cb_45,__ZN20SimulatorBlockDevice4readEPvyy__async_cb_46,__ZN20SimulatorBlockDevice7programEPKvyy__async_cb,__ZN20SimulatorBlockDevice7programEPKvyy__async_cb_53,__ZN20SimulatorBlockDevice7programEPKvyy__async_cb_54,__ZN20SimulatorBlockDevice7programEPKvyy__async_cb_55,__ZN20SimulatorBlockDevice5eraseEyy__async_cb,__ZN20SimulatorBlockDevice5eraseEyy__async_cb_62,__ZN20SimulatorBlockDevice5eraseEyy__async_cb_63,__ZN20SimulatorBlockDevice5eraseEyy__async_cb_64,__ZN20SimulatorBlockDeviceC2EPKcyy__async_cb
,__GLOBAL__sub_I_main_cpp__async_cb,__Z8btn_fallv__async_cb,_main__async_cb_38,_main__async_cb_37,_main__async_cb_36,_main__async_cb_35,_main__async_cb_39,_main__async_cb_43,__ZN6events5EventIFvvEE10event_dtorIPS1_EEvPNS2_5eventE,_main__async_cb_42,_main__async_cb,_main__async_cb_34,_main__async_cb_41,_main__async_cb_40,__ZN6events5EventIFvvEE10event_postIPS1_EEiPNS2_5eventE__async_cb_57,__ZN6events10EventQueue13function_dtorINS0_9context00IPFvvEEEEEvPv,__ZN6events10EventQueue13function_callINS0_9context00IPFvvEEEEEvPv,__ZN6events5EventIFvvEE10event_postIPS1_EEiPNS2_5eventE__async_cb,__ZN4mbed8CallbackIFvvEE13function_callIN6events5EventIS1_EEEEvPKv__async_cb,__ZN4mbed8CallbackIFvvEE13function_callIN6events5EventIS1_EEEEvPKv__async_cb_80,__ZN4mbed8CallbackIFvvEE13function_dtorIN6events5EventIS1_EEEEvPv__async_cb,__ZN4mbed8CallbackIFvvEE13function_dtorIN6events5EventIS1_EEEEvPv__async_cb_8,__ZN6events10EventQueue13function_callINS0_9context00IPFvvEEEEEvPv__async_cb,_putc__async_cb_81,_putc__async_cb,___overflow__async_cb,_fflush__async_cb_27,_fflush__async_cb_26,_fflush__async_cb_28,_fflush__async_cb
,___fflush_unlocked__async_cb,___fflush_unlocked__async_cb_60,_vfprintf__async_cb,_snprintf__async_cb,_vsnprintf__async_cb,_printf__async_cb,_fputc__async_cb_49,_fputc__async_cb,_puts__async_cb,__ZL25default_terminate_handlerv__async_cb,__ZL25default_terminate_handlerv__async_cb_21,_abort_message__async_cb,_abort_message__async_cb_52,__ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv__async_cb_61,__ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv__async_cb,___dynamic_cast__async_cb,___dynamic_cast__async_cb_29,__ZNK10__cxxabiv120__si_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb,__ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb,__ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_9,__ZNK10__cxxabiv120__si_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb,__ZN10__cxxabiv112_GLOBAL__N_19destruct_EPv,__ZSt11__terminatePFvvE__async_cb,__ZNK10__cxxabiv121__vmi_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb_56,__ZNK10__cxxabiv121__vmi_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb,__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_33,__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_32,__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_31,__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_30,__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb
,__ZNK10__cxxabiv121__vmi_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb_7,__ZNK10__cxxabiv121__vmi_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb,__ZNK10__cxxabiv122__base_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb,__ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb,__ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb,___cxa_can_catch__async_cb,___cxa_is_pointer_type__async_cb,b22,b23,b24,b25,b26,b27,b28,b29,b30,b31,b32,b33,b34,b35,b36,b37,b38,b39,b40,b41,b42,b43,b44
,b45,b46,b47,b48,b49,b50,b51,b52,b53,b54,b55,b56,b57,b58,b59,b60,b61,b62,b63,b64,b65,b66,b67,b68,b69,b70,b71,b72,b73,b74
,b75,b76,b77,b78,b79,b80,b81,b82,b83,b84,b85,b86,b87,b88,b89,b90,b91,b92,b93,b94,b95,b96,b97,b98,b99,b100,b101,b102,b103,b104
,b105,b106,b107,b108,b109,b110,b111,b112,b113,b114,b115,b116,b117,b118,b119,b120,b121];
var FUNCTION_TABLE_vii = [b123,__ZN4mbed8CallbackIFvvEE13function_moveIN6events5EventIS1_EEEEvPvPKv,__ZN4mbed11InterruptIn12_irq_handlerEj14gpio_irq_event,b124];
var FUNCTION_TABLE_viiii = [b126,__ZNK10__cxxabiv117__class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi,__ZNK10__cxxabiv120__si_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi,__ZNK10__cxxabiv121__vmi_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi];
var FUNCTION_TABLE_viiiii = [b128,__ZNK10__cxxabiv117__class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib,__ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib,__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib];
var FUNCTION_TABLE_viiiiii = [b130,__ZNK10__cxxabiv117__class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib,__ZNK10__cxxabiv120__si_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib,__ZNK10__cxxabiv121__vmi_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib];

  return { __GLOBAL__sub_I_main_cpp: __GLOBAL__sub_I_main_cpp, ___cxa_can_catch: ___cxa_can_catch, ___cxa_is_pointer_type: ___cxa_is_pointer_type, ___errno_location: ___errno_location, ___muldi3: ___muldi3, ___udivdi3: ___udivdi3, ___uremdi3: ___uremdi3, _bitshift64Lshr: _bitshift64Lshr, _bitshift64Shl: _bitshift64Shl, _emscripten_alloc_async_context: _emscripten_alloc_async_context, _emscripten_async_resume: _emscripten_async_resume, _emscripten_free_async_context: _emscripten_free_async_context, _emscripten_realloc_async_context: _emscripten_realloc_async_context, _fflush: _fflush, _free: _free, _handle_interrupt_in: _handle_interrupt_in, _handle_lora_downlink: _handle_lora_downlink, _i64Add: _i64Add, _i64Subtract: _i64Subtract, _invoke_ticker: _invoke_ticker, _llvm_bswap_i32: _llvm_bswap_i32, _main: _main, _malloc: _malloc, _memcpy: _memcpy, _memset: _memset, _pthread_mutex_lock: _pthread_mutex_lock, _pthread_mutex_unlock: _pthread_mutex_unlock, _sbrk: _sbrk, dynCall_i: dynCall_i, dynCall_ii: dynCall_ii, dynCall_iiii: dynCall_iiii, dynCall_iiiiii: dynCall_iiiiii, dynCall_iiiiiii: dynCall_iiiiiii, dynCall_v: dynCall_v, dynCall_vi: dynCall_vi, dynCall_vii: dynCall_vii, dynCall_viiii: dynCall_viiii, dynCall_viiiii: dynCall_viiiii, dynCall_viiiiii: dynCall_viiiiii, establishStackSpace: establishStackSpace, getTempRet0: getTempRet0, runPostSets: runPostSets, setAsync: setAsync, setTempRet0: setTempRet0, setThrew: setThrew, stackAlloc: stackAlloc, stackRestore: stackRestore, stackSave: stackSave };
})
// EMSCRIPTEN_END_ASM
(Module.asmGlobalArg, Module.asmLibraryArg, buffer);

var real___GLOBAL__sub_I_main_cpp = asm["__GLOBAL__sub_I_main_cpp"]; asm["__GLOBAL__sub_I_main_cpp"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real___GLOBAL__sub_I_main_cpp.apply(null, arguments);
};

var real____cxa_can_catch = asm["___cxa_can_catch"]; asm["___cxa_can_catch"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real____cxa_can_catch.apply(null, arguments);
};

var real____cxa_is_pointer_type = asm["___cxa_is_pointer_type"]; asm["___cxa_is_pointer_type"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real____cxa_is_pointer_type.apply(null, arguments);
};

var real____errno_location = asm["___errno_location"]; asm["___errno_location"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real____errno_location.apply(null, arguments);
};

var real____muldi3 = asm["___muldi3"]; asm["___muldi3"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real____muldi3.apply(null, arguments);
};

var real____udivdi3 = asm["___udivdi3"]; asm["___udivdi3"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real____udivdi3.apply(null, arguments);
};

var real____uremdi3 = asm["___uremdi3"]; asm["___uremdi3"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real____uremdi3.apply(null, arguments);
};

var real__bitshift64Lshr = asm["_bitshift64Lshr"]; asm["_bitshift64Lshr"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real__bitshift64Lshr.apply(null, arguments);
};

var real__bitshift64Shl = asm["_bitshift64Shl"]; asm["_bitshift64Shl"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real__bitshift64Shl.apply(null, arguments);
};

var real__emscripten_alloc_async_context = asm["_emscripten_alloc_async_context"]; asm["_emscripten_alloc_async_context"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real__emscripten_alloc_async_context.apply(null, arguments);
};

var real__emscripten_async_resume = asm["_emscripten_async_resume"]; asm["_emscripten_async_resume"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real__emscripten_async_resume.apply(null, arguments);
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

var real__fflush = asm["_fflush"]; asm["_fflush"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real__fflush.apply(null, arguments);
};

var real__free = asm["_free"]; asm["_free"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real__free.apply(null, arguments);
};

var real__handle_interrupt_in = asm["_handle_interrupt_in"]; asm["_handle_interrupt_in"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real__handle_interrupt_in.apply(null, arguments);
};

var real__handle_lora_downlink = asm["_handle_lora_downlink"]; asm["_handle_lora_downlink"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real__handle_lora_downlink.apply(null, arguments);
};

var real__i64Add = asm["_i64Add"]; asm["_i64Add"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real__i64Add.apply(null, arguments);
};

var real__i64Subtract = asm["_i64Subtract"]; asm["_i64Subtract"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real__i64Subtract.apply(null, arguments);
};

var real__invoke_ticker = asm["_invoke_ticker"]; asm["_invoke_ticker"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real__invoke_ticker.apply(null, arguments);
};

var real__llvm_bswap_i32 = asm["_llvm_bswap_i32"]; asm["_llvm_bswap_i32"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real__llvm_bswap_i32.apply(null, arguments);
};

var real__main = asm["_main"]; asm["_main"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real__main.apply(null, arguments);
};

var real__malloc = asm["_malloc"]; asm["_malloc"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real__malloc.apply(null, arguments);
};

var real__pthread_mutex_lock = asm["_pthread_mutex_lock"]; asm["_pthread_mutex_lock"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real__pthread_mutex_lock.apply(null, arguments);
};

var real__pthread_mutex_unlock = asm["_pthread_mutex_unlock"]; asm["_pthread_mutex_unlock"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real__pthread_mutex_unlock.apply(null, arguments);
};

var real__sbrk = asm["_sbrk"]; asm["_sbrk"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real__sbrk.apply(null, arguments);
};

var real_establishStackSpace = asm["establishStackSpace"]; asm["establishStackSpace"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real_establishStackSpace.apply(null, arguments);
};

var real_getTempRet0 = asm["getTempRet0"]; asm["getTempRet0"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real_getTempRet0.apply(null, arguments);
};

var real_setAsync = asm["setAsync"]; asm["setAsync"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real_setAsync.apply(null, arguments);
};

var real_setTempRet0 = asm["setTempRet0"]; asm["setTempRet0"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real_setTempRet0.apply(null, arguments);
};

var real_setThrew = asm["setThrew"]; asm["setThrew"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real_setThrew.apply(null, arguments);
};

var real_stackAlloc = asm["stackAlloc"]; asm["stackAlloc"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real_stackAlloc.apply(null, arguments);
};

var real_stackRestore = asm["stackRestore"]; asm["stackRestore"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real_stackRestore.apply(null, arguments);
};

var real_stackSave = asm["stackSave"]; asm["stackSave"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real_stackSave.apply(null, arguments);
};
var __GLOBAL__sub_I_main_cpp = Module["__GLOBAL__sub_I_main_cpp"] = asm["__GLOBAL__sub_I_main_cpp"];
var ___cxa_can_catch = Module["___cxa_can_catch"] = asm["___cxa_can_catch"];
var ___cxa_is_pointer_type = Module["___cxa_is_pointer_type"] = asm["___cxa_is_pointer_type"];
var ___errno_location = Module["___errno_location"] = asm["___errno_location"];
var ___muldi3 = Module["___muldi3"] = asm["___muldi3"];
var ___udivdi3 = Module["___udivdi3"] = asm["___udivdi3"];
var ___uremdi3 = Module["___uremdi3"] = asm["___uremdi3"];
var _bitshift64Lshr = Module["_bitshift64Lshr"] = asm["_bitshift64Lshr"];
var _bitshift64Shl = Module["_bitshift64Shl"] = asm["_bitshift64Shl"];
var _emscripten_alloc_async_context = Module["_emscripten_alloc_async_context"] = asm["_emscripten_alloc_async_context"];
var _emscripten_async_resume = Module["_emscripten_async_resume"] = asm["_emscripten_async_resume"];
var _emscripten_free_async_context = Module["_emscripten_free_async_context"] = asm["_emscripten_free_async_context"];
var _emscripten_realloc_async_context = Module["_emscripten_realloc_async_context"] = asm["_emscripten_realloc_async_context"];
var _fflush = Module["_fflush"] = asm["_fflush"];
var _free = Module["_free"] = asm["_free"];
var _handle_interrupt_in = Module["_handle_interrupt_in"] = asm["_handle_interrupt_in"];
var _handle_lora_downlink = Module["_handle_lora_downlink"] = asm["_handle_lora_downlink"];
var _i64Add = Module["_i64Add"] = asm["_i64Add"];
var _i64Subtract = Module["_i64Subtract"] = asm["_i64Subtract"];
var _invoke_ticker = Module["_invoke_ticker"] = asm["_invoke_ticker"];
var _llvm_bswap_i32 = Module["_llvm_bswap_i32"] = asm["_llvm_bswap_i32"];
var _main = Module["_main"] = asm["_main"];
var _malloc = Module["_malloc"] = asm["_malloc"];
var _memcpy = Module["_memcpy"] = asm["_memcpy"];
var _memset = Module["_memset"] = asm["_memset"];
var _pthread_mutex_lock = Module["_pthread_mutex_lock"] = asm["_pthread_mutex_lock"];
var _pthread_mutex_unlock = Module["_pthread_mutex_unlock"] = asm["_pthread_mutex_unlock"];
var _sbrk = Module["_sbrk"] = asm["_sbrk"];
var establishStackSpace = Module["establishStackSpace"] = asm["establishStackSpace"];
var getTempRet0 = Module["getTempRet0"] = asm["getTempRet0"];
var runPostSets = Module["runPostSets"] = asm["runPostSets"];
var setAsync = Module["setAsync"] = asm["setAsync"];
var setTempRet0 = Module["setTempRet0"] = asm["setTempRet0"];
var setThrew = Module["setThrew"] = asm["setThrew"];
var stackAlloc = Module["stackAlloc"] = asm["stackAlloc"];
var stackRestore = Module["stackRestore"] = asm["stackRestore"];
var stackSave = Module["stackSave"] = asm["stackSave"];
var dynCall_i = Module["dynCall_i"] = asm["dynCall_i"];
var dynCall_ii = Module["dynCall_ii"] = asm["dynCall_ii"];
var dynCall_iiii = Module["dynCall_iiii"] = asm["dynCall_iiii"];
var dynCall_iiiiii = Module["dynCall_iiiiii"] = asm["dynCall_iiiiii"];
var dynCall_iiiiiii = Module["dynCall_iiiiiii"] = asm["dynCall_iiiiiii"];
var dynCall_v = Module["dynCall_v"] = asm["dynCall_v"];
var dynCall_vi = Module["dynCall_vi"] = asm["dynCall_vi"];
var dynCall_vii = Module["dynCall_vii"] = asm["dynCall_vii"];
var dynCall_viiii = Module["dynCall_viiii"] = asm["dynCall_viiii"];
var dynCall_viiiii = Module["dynCall_viiiii"] = asm["dynCall_viiiii"];
var dynCall_viiiiii = Module["dynCall_viiiiii"] = asm["dynCall_viiiiii"];
;



// === Auto-generated postamble setup entry stuff ===

Module['asm'] = asm;

if (!Module["intArrayFromString"]) Module["intArrayFromString"] = function() { abort("'intArrayFromString' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["intArrayToString"]) Module["intArrayToString"] = function() { abort("'intArrayToString' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["ccall"]) Module["ccall"] = function() { abort("'ccall' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["cwrap"]) Module["cwrap"] = function() { abort("'cwrap' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["setValue"]) Module["setValue"] = function() { abort("'setValue' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["getValue"]) Module["getValue"] = function() { abort("'getValue' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["allocate"]) Module["allocate"] = function() { abort("'allocate' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["getMemory"]) Module["getMemory"] = function() { abort("'getMemory' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ). Alternatively, forcing filesystem support (-s FORCE_FILESYSTEM=1) can export this for you") };
if (!Module["Pointer_stringify"]) Module["Pointer_stringify"] = function() { abort("'Pointer_stringify' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["AsciiToString"]) Module["AsciiToString"] = function() { abort("'AsciiToString' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["stringToAscii"]) Module["stringToAscii"] = function() { abort("'stringToAscii' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["UTF8ArrayToString"]) Module["UTF8ArrayToString"] = function() { abort("'UTF8ArrayToString' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["UTF8ToString"]) Module["UTF8ToString"] = function() { abort("'UTF8ToString' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["stringToUTF8Array"]) Module["stringToUTF8Array"] = function() { abort("'stringToUTF8Array' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["stringToUTF8"]) Module["stringToUTF8"] = function() { abort("'stringToUTF8' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["lengthBytesUTF8"]) Module["lengthBytesUTF8"] = function() { abort("'lengthBytesUTF8' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["UTF16ToString"]) Module["UTF16ToString"] = function() { abort("'UTF16ToString' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["stringToUTF16"]) Module["stringToUTF16"] = function() { abort("'stringToUTF16' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["lengthBytesUTF16"]) Module["lengthBytesUTF16"] = function() { abort("'lengthBytesUTF16' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["UTF32ToString"]) Module["UTF32ToString"] = function() { abort("'UTF32ToString' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["stringToUTF32"]) Module["stringToUTF32"] = function() { abort("'stringToUTF32' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["lengthBytesUTF32"]) Module["lengthBytesUTF32"] = function() { abort("'lengthBytesUTF32' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["allocateUTF8"]) Module["allocateUTF8"] = function() { abort("'allocateUTF8' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["stackTrace"]) Module["stackTrace"] = function() { abort("'stackTrace' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["addOnPreRun"]) Module["addOnPreRun"] = function() { abort("'addOnPreRun' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["addOnInit"]) Module["addOnInit"] = function() { abort("'addOnInit' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["addOnPreMain"]) Module["addOnPreMain"] = function() { abort("'addOnPreMain' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["addOnExit"]) Module["addOnExit"] = function() { abort("'addOnExit' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["addOnPostRun"]) Module["addOnPostRun"] = function() { abort("'addOnPostRun' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["writeStringToMemory"]) Module["writeStringToMemory"] = function() { abort("'writeStringToMemory' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["writeArrayToMemory"]) Module["writeArrayToMemory"] = function() { abort("'writeArrayToMemory' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["writeAsciiToMemory"]) Module["writeAsciiToMemory"] = function() { abort("'writeAsciiToMemory' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["addRunDependency"]) Module["addRunDependency"] = function() { abort("'addRunDependency' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ). Alternatively, forcing filesystem support (-s FORCE_FILESYSTEM=1) can export this for you") };
if (!Module["removeRunDependency"]) Module["removeRunDependency"] = function() { abort("'removeRunDependency' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ). Alternatively, forcing filesystem support (-s FORCE_FILESYSTEM=1) can export this for you") };
if (!Module["FS"]) Module["FS"] = function() { abort("'FS' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["FS_createFolder"]) Module["FS_createFolder"] = function() { abort("'FS_createFolder' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ). Alternatively, forcing filesystem support (-s FORCE_FILESYSTEM=1) can export this for you") };
if (!Module["FS_createPath"]) Module["FS_createPath"] = function() { abort("'FS_createPath' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ). Alternatively, forcing filesystem support (-s FORCE_FILESYSTEM=1) can export this for you") };
if (!Module["FS_createDataFile"]) Module["FS_createDataFile"] = function() { abort("'FS_createDataFile' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ). Alternatively, forcing filesystem support (-s FORCE_FILESYSTEM=1) can export this for you") };
if (!Module["FS_createPreloadedFile"]) Module["FS_createPreloadedFile"] = function() { abort("'FS_createPreloadedFile' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ). Alternatively, forcing filesystem support (-s FORCE_FILESYSTEM=1) can export this for you") };
if (!Module["FS_createLazyFile"]) Module["FS_createLazyFile"] = function() { abort("'FS_createLazyFile' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ). Alternatively, forcing filesystem support (-s FORCE_FILESYSTEM=1) can export this for you") };
if (!Module["FS_createLink"]) Module["FS_createLink"] = function() { abort("'FS_createLink' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ). Alternatively, forcing filesystem support (-s FORCE_FILESYSTEM=1) can export this for you") };
if (!Module["FS_createDevice"]) Module["FS_createDevice"] = function() { abort("'FS_createDevice' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ). Alternatively, forcing filesystem support (-s FORCE_FILESYSTEM=1) can export this for you") };
if (!Module["FS_unlink"]) Module["FS_unlink"] = function() { abort("'FS_unlink' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ). Alternatively, forcing filesystem support (-s FORCE_FILESYSTEM=1) can export this for you") };
if (!Module["GL"]) Module["GL"] = function() { abort("'GL' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["staticAlloc"]) Module["staticAlloc"] = function() { abort("'staticAlloc' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["dynamicAlloc"]) Module["dynamicAlloc"] = function() { abort("'dynamicAlloc' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["warnOnce"]) Module["warnOnce"] = function() { abort("'warnOnce' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["loadDynamicLibrary"]) Module["loadDynamicLibrary"] = function() { abort("'loadDynamicLibrary' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["loadWebAssemblyModule"]) Module["loadWebAssemblyModule"] = function() { abort("'loadWebAssemblyModule' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["getLEB"]) Module["getLEB"] = function() { abort("'getLEB' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["getFunctionTables"]) Module["getFunctionTables"] = function() { abort("'getFunctionTables' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["alignFunctionTables"]) Module["alignFunctionTables"] = function() { abort("'alignFunctionTables' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["registerFunctions"]) Module["registerFunctions"] = function() { abort("'registerFunctions' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["addFunction"]) Module["addFunction"] = function() { abort("'addFunction' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["removeFunction"]) Module["removeFunction"] = function() { abort("'removeFunction' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["getFuncWrapper"]) Module["getFuncWrapper"] = function() { abort("'getFuncWrapper' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["prettyPrint"]) Module["prettyPrint"] = function() { abort("'prettyPrint' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["makeBigInt"]) Module["makeBigInt"] = function() { abort("'makeBigInt' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["dynCall"]) Module["dynCall"] = function() { abort("'dynCall' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["getCompilerSetting"]) Module["getCompilerSetting"] = function() { abort("'getCompilerSetting' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };if (!Module["ALLOC_NORMAL"]) Object.defineProperty(Module, "ALLOC_NORMAL", { get: function() { abort("'ALLOC_NORMAL' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") } });
if (!Module["ALLOC_STACK"]) Object.defineProperty(Module, "ALLOC_STACK", { get: function() { abort("'ALLOC_STACK' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") } });
if (!Module["ALLOC_STATIC"]) Object.defineProperty(Module, "ALLOC_STATIC", { get: function() { abort("'ALLOC_STATIC' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") } });
if (!Module["ALLOC_DYNAMIC"]) Object.defineProperty(Module, "ALLOC_DYNAMIC", { get: function() { abort("'ALLOC_DYNAMIC' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") } });
if (!Module["ALLOC_NONE"]) Object.defineProperty(Module, "ALLOC_NONE", { get: function() { abort("'ALLOC_NONE' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") } });

if (memoryInitializer) {
  if (!isDataURI(memoryInitializer)) {
    if (typeof Module['locateFile'] === 'function') {
      memoryInitializer = Module['locateFile'](memoryInitializer);
    } else if (Module['memoryInitializerPrefixURL']) {
      memoryInitializer = Module['memoryInitializerPrefixURL'] + memoryInitializer;
    }
  }
  if (ENVIRONMENT_IS_NODE || ENVIRONMENT_IS_SHELL) {
    var data = Module['readBinary'](memoryInitializer);
    HEAPU8.set(data, GLOBAL_BASE);
  } else {
    addRunDependency('memory initializer');
    var applyMemoryInitializer = function(data) {
      if (data.byteLength) data = new Uint8Array(data);
      for (var i = 0; i < data.length; i++) {
        assert(HEAPU8[GLOBAL_BASE + i] === 0, "area for memory initializer should not have been touched before it's loaded");
      }
      HEAPU8.set(data, GLOBAL_BASE);
      // Delete the typed array that contains the large blob of the memory initializer request response so that
      // we won't keep unnecessary memory lying around. However, keep the XHR object itself alive so that e.g.
      // its .status field can still be accessed later.
      if (Module['memoryInitializerRequest']) delete Module['memoryInitializerRequest'].response;
      removeRunDependency('memory initializer');
    }
    function doBrowserLoad() {
      Module['readAsync'](memoryInitializer, applyMemoryInitializer, function() {
        throw 'could not load memory initializer ' + memoryInitializer;
      });
    }
    if (Module['memoryInitializerRequest']) {
      // a network request has already been created, just use that
      function useRequest() {
        var request = Module['memoryInitializerRequest'];
        var response = request.response;
        if (request.status !== 200 && request.status !== 0) {
            // If you see this warning, the issue may be that you are using locateFile or memoryInitializerPrefixURL, and defining them in JS. That
            // means that the HTML file doesn't know about them, and when it tries to create the mem init request early, does it to the wrong place.
            // Look in your browser's devtools network console to see what's going on.
            console.warn('a problem seems to have happened with Module.memoryInitializerRequest, status: ' + request.status + ', retrying ' + memoryInitializer);
            doBrowserLoad();
            return;
        }
        applyMemoryInitializer(response);
      }
      if (Module['memoryInitializerRequest'].response) {
        setTimeout(useRequest, 0); // it's already here; but, apply it asynchronously
      } else {
        Module['memoryInitializerRequest'].addEventListener('load', useRequest); // wait for it
      }
    } else {
      // fetch it from the network ourselves
      doBrowserLoad();
    }
  }
}



/**
 * @constructor
 * @extends {Error}
 * @this {ExitStatus}
 */
function ExitStatus(status) {
  this.name = "ExitStatus";
  this.message = "Program terminated with exit(" + status + ")";
  this.status = status;
};
ExitStatus.prototype = new Error();
ExitStatus.prototype.constructor = ExitStatus;

var initialStackTop;
var calledMain = false;

dependenciesFulfilled = function runCaller() {
  // If run has never been called, and we should call run (INVOKE_RUN is true, and Module.noInitialRun is not false)
  if (!Module['calledRun']) run();
  if (!Module['calledRun']) dependenciesFulfilled = runCaller; // try this again later, after new deps are fulfilled
}

Module['callMain'] = function callMain(args) {
  assert(runDependencies == 0, 'cannot call main when async dependencies remain! (listen on __ATMAIN__)');
  assert(__ATPRERUN__.length == 0, 'cannot call main when preRun functions remain to be called');

  args = args || [];

  ensureInitRuntime();

  var argc = args.length+1;
  var argv = stackAlloc((argc + 1) * 4);
  HEAP32[argv >> 2] = allocateUTF8OnStack(Module['thisProgram']);
  for (var i = 1; i < argc; i++) {
    HEAP32[(argv >> 2) + i] = allocateUTF8OnStack(args[i - 1]);
  }
  HEAP32[(argv >> 2) + argc] = 0;


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
Module['run'] = run;

function checkUnflushedContent() {
  // Compiler settings do not allow exiting the runtime, so flushing
  // the streams is not possible. but in ASSERTIONS mode we check
  // if there was something to flush, and if so tell the user they
  // should request that the runtime be exitable.
  // Normally we would not even include flush() at all, but in ASSERTIONS
  // builds we do so just for this check, and here we see if there is any
  // content to flush, that is, we check if there would have been
  // something a non-ASSERTIONS build would have not seen.
  // How we flush the streams depends on whether we are in NO_FILESYSTEM
  // mode (which has its own special function for this; otherwise, all
  // the code is inside libc)
  var print = Module['print'];
  var printErr = Module['printErr'];
  var has = false;
  Module['print'] = Module['printErr'] = function(x) {
    has = true;
  }
  try { // it doesn't matter if it fails
    var flush = flush_NO_FILESYSTEM;
    if (flush) flush(0);
  } catch(e) {}
  Module['print'] = print;
  Module['printErr'] = printErr;
  if (has) {
    warnOnce('stdio streams had content in them that was not flushed. you should set NO_EXIT_RUNTIME to 0 (see the FAQ), or make sure to emit a newline when you printf etc.');
  }
}

function exit(status, implicit) {
  checkUnflushedContent();

  // if this is just main exit-ing implicitly, and the status is 0, then we
  // don't need to do anything here and can just leave. if the status is
  // non-zero, though, then we need to report it.
  // (we may have warned about this earlier, if a situation justifies doing so)
  if (implicit && Module['noExitRuntime'] && status === 0) {
    return;
  }

  if (Module['noExitRuntime']) {
    // if exit() was called, we may warn the user if the runtime isn't actually being shut down
    if (!implicit) {
      Module.printErr('exit(' + status + ') called, but NO_EXIT_RUNTIME is set, so halting execution but not exiting the runtime or preventing further async execution (build with NO_EXIT_RUNTIME=0, if you want a true shutdown)');
    }
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
Module['exit'] = exit;

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
Module['abort'] = abort;

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






//# sourceMappingURL=bd.js.map
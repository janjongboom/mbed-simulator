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

var ASM_CONSTS = [function() { console.log('rx_frame', Date.now()); },
 function() { return Date.now(); },
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

STATICTOP = STATIC_BASE + 7776;
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
var debug_table_vi = ["0", "__ZN4mbed11InterruptInD2Ev", "__ZN4mbed11InterruptInD0Ev", "_mbed_trace_default_print", "__ZN20SimulatorBlockDeviceD2Ev", "__ZN20SimulatorBlockDeviceD0Ev", "__ZN4mbed8CallbackIFvvEE13function_callIN6events5EventIS1_EEEEvPKv", "__ZN4mbed8CallbackIFvvEE13function_dtorIN6events5EventIS1_EEEEvPv", "__ZN10__cxxabiv116__shim_type_infoD2Ev", "__ZN10__cxxabiv117__class_type_infoD0Ev", "__ZNK10__cxxabiv116__shim_type_info5noop1Ev", "__ZNK10__cxxabiv116__shim_type_info5noop2Ev", "__ZN10__cxxabiv120__si_class_type_infoD0Ev", "__ZN10__cxxabiv121__vmi_class_type_infoD0Ev", "__ZN4mbed11InterruptInD2Ev__async_cb", "__ZN4mbed11InterruptInD2Ev__async_cb_11", "__ZN4mbed11InterruptInD0Ev__async_cb", "__ZN4mbed11InterruptInD0Ev__async_cb_1", "__ZN4mbed11InterruptIn12_irq_handlerEj14gpio_irq_event__async_cb", "__ZN4mbed11InterruptIn12_irq_handlerEj14gpio_irq_event__async_cb_76", "__ZN4mbed11InterruptIn4fallENS_8CallbackIFvvEEE__async_cb", "__ZN4mbed11InterruptIn4fallENS_8CallbackIFvvEEE__async_cb_67", "__ZN4mbed11InterruptIn4fallENS_8CallbackIFvvEEE__async_cb_68", "__ZN4mbed11InterruptIn4fallENS_8CallbackIFvvEEE__async_cb_69", "__ZN4mbed11InterruptIn4fallENS_8CallbackIFvvEEE__async_cb_70", "__ZN6events10EventQueue8dispatchEi__async_cb", "_equeue_alloc__async_cb", "_equeue_dealloc__async_cb", "_equeue_post__async_cb", "_equeue_enqueue__async_cb", "_equeue_dispatch__async_cb", "_equeue_dispatch__async_cb_65", "_equeue_dispatch__async_cb_63", "_equeue_dispatch__async_cb_64", "_equeue_dispatch__async_cb_66", "_mbed_trace_default_print__async_cb", "_mbed_tracef__async_cb", "_mbed_vtracef__async_cb", "_mbed_vtracef__async_cb_26", "_mbed_vtracef__async_cb_16", "_mbed_vtracef__async_cb_17", "_mbed_vtracef__async_cb_18", "_mbed_vtracef__async_cb_25", "_mbed_vtracef__async_cb_19", "_mbed_vtracef__async_cb_24", "_mbed_vtracef__async_cb_20", "_mbed_vtracef__async_cb_21", "_mbed_vtracef__async_cb_22", "_mbed_vtracef__async_cb_23", "_mbed_assert_internal__async_cb", "_mbed_die__async_cb_57", "_mbed_die__async_cb_56", "_mbed_die__async_cb_55", "_mbed_die__async_cb_54", "_mbed_die__async_cb_53", "_mbed_die__async_cb_52", "_mbed_die__async_cb_51", "_mbed_die__async_cb_50", "_mbed_die__async_cb_49", "_mbed_die__async_cb_48", "_mbed_die__async_cb_47", "_mbed_die__async_cb_46", "_mbed_die__async_cb_45", "_mbed_die__async_cb_44", "_mbed_die__async_cb_43", "_mbed_die__async_cb", "_mbed_error_printf__async_cb", "_mbed_error_vfprintf__async_cb", "_mbed_error_vfprintf__async_cb_61", "_mbed_error_vfprintf__async_cb_60", "_handle_interrupt_in__async_cb", "_serial_putc__async_cb_59", "_serial_putc__async_cb", "_invoke_ticker__async_cb_62", "_invoke_ticker__async_cb", "_wait_ms__async_cb", "__ZN20SimulatorBlockDevice4readEPvyy__async_cb", "__ZN20SimulatorBlockDevice4readEPvyy__async_cb_30", "__ZN20SimulatorBlockDevice4readEPvyy__async_cb_31", "__ZN20SimulatorBlockDevice4readEPvyy__async_cb_32", "__ZN20SimulatorBlockDevice7programEPKvyy__async_cb", "__ZN20SimulatorBlockDevice7programEPKvyy__async_cb_7", "__ZN20SimulatorBlockDevice7programEPKvyy__async_cb_8", "__ZN20SimulatorBlockDevice7programEPKvyy__async_cb_9", "__ZN20SimulatorBlockDevice5eraseEyy__async_cb", "__ZN20SimulatorBlockDevice5eraseEyy__async_cb_27", "__ZN20SimulatorBlockDevice5eraseEyy__async_cb_28", "__ZN20SimulatorBlockDevice5eraseEyy__async_cb_29", "__ZN20SimulatorBlockDeviceC2EPKcyy__async_cb", "__GLOBAL__sub_I_main_cpp__async_cb", "__Z8btn_fallv__async_cb", "_main__async_cb_37", "_main__async_cb_36", "_main__async_cb_35", "_main__async_cb_34", "_main__async_cb_38", "_main__async_cb_42", "__ZN6events5EventIFvvEE10event_dtorIPS1_EEvPNS2_5eventE", "_main__async_cb_41", "_main__async_cb", "_main__async_cb_33", "_main__async_cb_40", "_main__async_cb_39", "__ZN6events5EventIFvvEE10event_postIPS1_EEiPNS2_5eventE__async_cb_10", "__ZN6events10EventQueue13function_dtorINS0_9context00IPFvvEEEEEvPv", "__ZN6events10EventQueue13function_callINS0_9context00IPFvvEEEEEvPv", "__ZN6events5EventIFvvEE10event_postIPS1_EEiPNS2_5eventE__async_cb", "__ZN4mbed8CallbackIFvvEE13function_callIN6events5EventIS1_EEEEvPKv__async_cb", "__ZN4mbed8CallbackIFvvEE13function_callIN6events5EventIS1_EEEEvPKv__async_cb_79", "__ZN4mbed8CallbackIFvvEE13function_dtorIN6events5EventIS1_EEEEvPv__async_cb", "__ZN4mbed8CallbackIFvvEE13function_dtorIN6events5EventIS1_EEEEvPv__async_cb_71", "__ZN6events10EventQueue13function_callINS0_9context00IPFvvEEEEEvPv__async_cb", "_putc__async_cb_5", "_putc__async_cb", "___overflow__async_cb", "_fflush__async_cb_73", "_fflush__async_cb_72", "_fflush__async_cb_74", "_fflush__async_cb", "___fflush_unlocked__async_cb", "___fflush_unlocked__async_cb_77", "_vfprintf__async_cb", "_snprintf__async_cb", "_vsnprintf__async_cb", "_printf__async_cb", "_fputc__async_cb_6", "_fputc__async_cb", "_puts__async_cb", "__ZL25default_terminate_handlerv__async_cb", "__ZL25default_terminate_handlerv__async_cb_58", "_abort_message__async_cb", "_abort_message__async_cb_75", "__ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv__async_cb_4", "__ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv__async_cb", "___dynamic_cast__async_cb", "___dynamic_cast__async_cb_2", "__ZNK10__cxxabiv120__si_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb", "__ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb", "__ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_80", "__ZNK10__cxxabiv120__si_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb", "__ZN10__cxxabiv112_GLOBAL__N_19destruct_EPv", "__ZSt11__terminatePFvvE__async_cb", "__ZNK10__cxxabiv121__vmi_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb_3", "__ZNK10__cxxabiv121__vmi_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb", "__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_15", "__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_14", "__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_13", "__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_12", "__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb", "__ZNK10__cxxabiv121__vmi_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb_78", "__ZNK10__cxxabiv121__vmi_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb", "__ZNK10__cxxabiv122__base_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb", "__ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb", "__ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb", "___cxa_can_catch__async_cb", "___cxa_is_pointer_type__async_cb", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0"];
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
 sp = STACKTOP; //@line 4372
 STACKTOP = STACKTOP + 16 | 0; //@line 4373
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 4373
 $1 = sp; //@line 4374
 do {
  if ($0 >>> 0 < 245) {
   $6 = $0 >>> 0 < 11 ? 16 : $0 + 11 & -8; //@line 4381
   $7 = $6 >>> 3; //@line 4382
   $8 = HEAP32[1538] | 0; //@line 4383
   $9 = $8 >>> $7; //@line 4384
   if ($9 & 3 | 0) {
    $14 = ($9 & 1 ^ 1) + $7 | 0; //@line 4390
    $16 = 6192 + ($14 << 1 << 2) | 0; //@line 4392
    $17 = $16 + 8 | 0; //@line 4393
    $18 = HEAP32[$17 >> 2] | 0; //@line 4394
    $19 = $18 + 8 | 0; //@line 4395
    $20 = HEAP32[$19 >> 2] | 0; //@line 4396
    do {
     if (($20 | 0) == ($16 | 0)) {
      HEAP32[1538] = $8 & ~(1 << $14); //@line 4403
     } else {
      if ((HEAP32[1542] | 0) >>> 0 > $20 >>> 0) {
       _abort(); //@line 4408
      }
      $27 = $20 + 12 | 0; //@line 4411
      if ((HEAP32[$27 >> 2] | 0) == ($18 | 0)) {
       HEAP32[$27 >> 2] = $16; //@line 4415
       HEAP32[$17 >> 2] = $20; //@line 4416
       break;
      } else {
       _abort(); //@line 4419
      }
     }
    } while (0);
    $30 = $14 << 3; //@line 4424
    HEAP32[$18 + 4 >> 2] = $30 | 3; //@line 4427
    $34 = $18 + $30 + 4 | 0; //@line 4429
    HEAP32[$34 >> 2] = HEAP32[$34 >> 2] | 1; //@line 4432
    $$0 = $19; //@line 4433
    STACKTOP = sp; //@line 4434
    return $$0 | 0; //@line 4434
   }
   $37 = HEAP32[1540] | 0; //@line 4436
   if ($6 >>> 0 > $37 >>> 0) {
    if ($9 | 0) {
     $41 = 2 << $7; //@line 4442
     $44 = $9 << $7 & ($41 | 0 - $41); //@line 4445
     $47 = ($44 & 0 - $44) + -1 | 0; //@line 4448
     $49 = $47 >>> 12 & 16; //@line 4450
     $50 = $47 >>> $49; //@line 4451
     $52 = $50 >>> 5 & 8; //@line 4453
     $54 = $50 >>> $52; //@line 4455
     $56 = $54 >>> 2 & 4; //@line 4457
     $58 = $54 >>> $56; //@line 4459
     $60 = $58 >>> 1 & 2; //@line 4461
     $62 = $58 >>> $60; //@line 4463
     $64 = $62 >>> 1 & 1; //@line 4465
     $67 = ($52 | $49 | $56 | $60 | $64) + ($62 >>> $64) | 0; //@line 4468
     $69 = 6192 + ($67 << 1 << 2) | 0; //@line 4470
     $70 = $69 + 8 | 0; //@line 4471
     $71 = HEAP32[$70 >> 2] | 0; //@line 4472
     $72 = $71 + 8 | 0; //@line 4473
     $73 = HEAP32[$72 >> 2] | 0; //@line 4474
     do {
      if (($73 | 0) == ($69 | 0)) {
       $77 = $8 & ~(1 << $67); //@line 4480
       HEAP32[1538] = $77; //@line 4481
       $98 = $77; //@line 4482
      } else {
       if ((HEAP32[1542] | 0) >>> 0 > $73 >>> 0) {
        _abort(); //@line 4487
       }
       $80 = $73 + 12 | 0; //@line 4490
       if ((HEAP32[$80 >> 2] | 0) == ($71 | 0)) {
        HEAP32[$80 >> 2] = $69; //@line 4494
        HEAP32[$70 >> 2] = $73; //@line 4495
        $98 = $8; //@line 4496
        break;
       } else {
        _abort(); //@line 4499
       }
      }
     } while (0);
     $83 = $67 << 3; //@line 4504
     $84 = $83 - $6 | 0; //@line 4505
     HEAP32[$71 + 4 >> 2] = $6 | 3; //@line 4508
     $87 = $71 + $6 | 0; //@line 4509
     HEAP32[$87 + 4 >> 2] = $84 | 1; //@line 4512
     HEAP32[$71 + $83 >> 2] = $84; //@line 4514
     if ($37 | 0) {
      $92 = HEAP32[1543] | 0; //@line 4517
      $93 = $37 >>> 3; //@line 4518
      $95 = 6192 + ($93 << 1 << 2) | 0; //@line 4520
      $96 = 1 << $93; //@line 4521
      if (!($98 & $96)) {
       HEAP32[1538] = $98 | $96; //@line 4526
       $$0199 = $95; //@line 4528
       $$pre$phiZ2D = $95 + 8 | 0; //@line 4528
      } else {
       $101 = $95 + 8 | 0; //@line 4530
       $102 = HEAP32[$101 >> 2] | 0; //@line 4531
       if ((HEAP32[1542] | 0) >>> 0 > $102 >>> 0) {
        _abort(); //@line 4535
       } else {
        $$0199 = $102; //@line 4538
        $$pre$phiZ2D = $101; //@line 4538
       }
      }
      HEAP32[$$pre$phiZ2D >> 2] = $92; //@line 4541
      HEAP32[$$0199 + 12 >> 2] = $92; //@line 4543
      HEAP32[$92 + 8 >> 2] = $$0199; //@line 4545
      HEAP32[$92 + 12 >> 2] = $95; //@line 4547
     }
     HEAP32[1540] = $84; //@line 4549
     HEAP32[1543] = $87; //@line 4550
     $$0 = $72; //@line 4551
     STACKTOP = sp; //@line 4552
     return $$0 | 0; //@line 4552
    }
    $108 = HEAP32[1539] | 0; //@line 4554
    if (!$108) {
     $$0197 = $6; //@line 4557
    } else {
     $112 = ($108 & 0 - $108) + -1 | 0; //@line 4561
     $114 = $112 >>> 12 & 16; //@line 4563
     $115 = $112 >>> $114; //@line 4564
     $117 = $115 >>> 5 & 8; //@line 4566
     $119 = $115 >>> $117; //@line 4568
     $121 = $119 >>> 2 & 4; //@line 4570
     $123 = $119 >>> $121; //@line 4572
     $125 = $123 >>> 1 & 2; //@line 4574
     $127 = $123 >>> $125; //@line 4576
     $129 = $127 >>> 1 & 1; //@line 4578
     $134 = HEAP32[6456 + (($117 | $114 | $121 | $125 | $129) + ($127 >>> $129) << 2) >> 2] | 0; //@line 4583
     $138 = (HEAP32[$134 + 4 >> 2] & -8) - $6 | 0; //@line 4587
     $143 = HEAP32[$134 + 16 + (((HEAP32[$134 + 16 >> 2] | 0) == 0 & 1) << 2) >> 2] | 0; //@line 4593
     if (!$143) {
      $$0192$lcssa$i = $134; //@line 4596
      $$0193$lcssa$i = $138; //@line 4596
     } else {
      $$01926$i = $134; //@line 4598
      $$01935$i = $138; //@line 4598
      $146 = $143; //@line 4598
      while (1) {
       $149 = (HEAP32[$146 + 4 >> 2] & -8) - $6 | 0; //@line 4603
       $150 = $149 >>> 0 < $$01935$i >>> 0; //@line 4604
       $$$0193$i = $150 ? $149 : $$01935$i; //@line 4605
       $$$0192$i = $150 ? $146 : $$01926$i; //@line 4606
       $146 = HEAP32[$146 + 16 + (((HEAP32[$146 + 16 >> 2] | 0) == 0 & 1) << 2) >> 2] | 0; //@line 4612
       if (!$146) {
        $$0192$lcssa$i = $$$0192$i; //@line 4615
        $$0193$lcssa$i = $$$0193$i; //@line 4615
        break;
       } else {
        $$01926$i = $$$0192$i; //@line 4618
        $$01935$i = $$$0193$i; //@line 4618
       }
      }
     }
     $157 = HEAP32[1542] | 0; //@line 4622
     if ($157 >>> 0 > $$0192$lcssa$i >>> 0) {
      _abort(); //@line 4625
     }
     $159 = $$0192$lcssa$i + $6 | 0; //@line 4628
     if ($159 >>> 0 <= $$0192$lcssa$i >>> 0) {
      _abort(); //@line 4631
     }
     $162 = HEAP32[$$0192$lcssa$i + 24 >> 2] | 0; //@line 4635
     $164 = HEAP32[$$0192$lcssa$i + 12 >> 2] | 0; //@line 4637
     do {
      if (($164 | 0) == ($$0192$lcssa$i | 0)) {
       $175 = $$0192$lcssa$i + 20 | 0; //@line 4641
       $176 = HEAP32[$175 >> 2] | 0; //@line 4642
       if (!$176) {
        $178 = $$0192$lcssa$i + 16 | 0; //@line 4645
        $179 = HEAP32[$178 >> 2] | 0; //@line 4646
        if (!$179) {
         $$3$i = 0; //@line 4649
         break;
        } else {
         $$1196$i = $179; //@line 4652
         $$1198$i = $178; //@line 4652
        }
       } else {
        $$1196$i = $176; //@line 4655
        $$1198$i = $175; //@line 4655
       }
       while (1) {
        $181 = $$1196$i + 20 | 0; //@line 4658
        $182 = HEAP32[$181 >> 2] | 0; //@line 4659
        if ($182 | 0) {
         $$1196$i = $182; //@line 4662
         $$1198$i = $181; //@line 4662
         continue;
        }
        $184 = $$1196$i + 16 | 0; //@line 4665
        $185 = HEAP32[$184 >> 2] | 0; //@line 4666
        if (!$185) {
         break;
        } else {
         $$1196$i = $185; //@line 4671
         $$1198$i = $184; //@line 4671
        }
       }
       if ($157 >>> 0 > $$1198$i >>> 0) {
        _abort(); //@line 4676
       } else {
        HEAP32[$$1198$i >> 2] = 0; //@line 4679
        $$3$i = $$1196$i; //@line 4680
        break;
       }
      } else {
       $167 = HEAP32[$$0192$lcssa$i + 8 >> 2] | 0; //@line 4685
       if ($157 >>> 0 > $167 >>> 0) {
        _abort(); //@line 4688
       }
       $169 = $167 + 12 | 0; //@line 4691
       if ((HEAP32[$169 >> 2] | 0) != ($$0192$lcssa$i | 0)) {
        _abort(); //@line 4695
       }
       $172 = $164 + 8 | 0; //@line 4698
       if ((HEAP32[$172 >> 2] | 0) == ($$0192$lcssa$i | 0)) {
        HEAP32[$169 >> 2] = $164; //@line 4702
        HEAP32[$172 >> 2] = $167; //@line 4703
        $$3$i = $164; //@line 4704
        break;
       } else {
        _abort(); //@line 4707
       }
      }
     } while (0);
     L73 : do {
      if ($162 | 0) {
       $190 = HEAP32[$$0192$lcssa$i + 28 >> 2] | 0; //@line 4716
       $191 = 6456 + ($190 << 2) | 0; //@line 4717
       do {
        if (($$0192$lcssa$i | 0) == (HEAP32[$191 >> 2] | 0)) {
         HEAP32[$191 >> 2] = $$3$i; //@line 4722
         if (!$$3$i) {
          HEAP32[1539] = $108 & ~(1 << $190); //@line 4728
          break L73;
         }
        } else {
         if ((HEAP32[1542] | 0) >>> 0 > $162 >>> 0) {
          _abort(); //@line 4735
         } else {
          HEAP32[$162 + 16 + (((HEAP32[$162 + 16 >> 2] | 0) != ($$0192$lcssa$i | 0) & 1) << 2) >> 2] = $$3$i; //@line 4743
          if (!$$3$i) {
           break L73;
          } else {
           break;
          }
         }
        }
       } while (0);
       $204 = HEAP32[1542] | 0; //@line 4753
       if ($204 >>> 0 > $$3$i >>> 0) {
        _abort(); //@line 4756
       }
       HEAP32[$$3$i + 24 >> 2] = $162; //@line 4760
       $208 = HEAP32[$$0192$lcssa$i + 16 >> 2] | 0; //@line 4762
       do {
        if ($208 | 0) {
         if ($204 >>> 0 > $208 >>> 0) {
          _abort(); //@line 4768
         } else {
          HEAP32[$$3$i + 16 >> 2] = $208; //@line 4772
          HEAP32[$208 + 24 >> 2] = $$3$i; //@line 4774
          break;
         }
        }
       } while (0);
       $214 = HEAP32[$$0192$lcssa$i + 20 >> 2] | 0; //@line 4780
       if ($214 | 0) {
        if ((HEAP32[1542] | 0) >>> 0 > $214 >>> 0) {
         _abort(); //@line 4786
        } else {
         HEAP32[$$3$i + 20 >> 2] = $214; //@line 4790
         HEAP32[$214 + 24 >> 2] = $$3$i; //@line 4792
         break;
        }
       }
      }
     } while (0);
     if ($$0193$lcssa$i >>> 0 < 16) {
      $221 = $$0193$lcssa$i + $6 | 0; //@line 4800
      HEAP32[$$0192$lcssa$i + 4 >> 2] = $221 | 3; //@line 4803
      $225 = $$0192$lcssa$i + $221 + 4 | 0; //@line 4805
      HEAP32[$225 >> 2] = HEAP32[$225 >> 2] | 1; //@line 4808
     } else {
      HEAP32[$$0192$lcssa$i + 4 >> 2] = $6 | 3; //@line 4812
      HEAP32[$159 + 4 >> 2] = $$0193$lcssa$i | 1; //@line 4815
      HEAP32[$159 + $$0193$lcssa$i >> 2] = $$0193$lcssa$i; //@line 4817
      if ($37 | 0) {
       $234 = HEAP32[1543] | 0; //@line 4820
       $235 = $37 >>> 3; //@line 4821
       $237 = 6192 + ($235 << 1 << 2) | 0; //@line 4823
       $238 = 1 << $235; //@line 4824
       if (!($8 & $238)) {
        HEAP32[1538] = $8 | $238; //@line 4829
        $$0189$i = $237; //@line 4831
        $$pre$phi$iZ2D = $237 + 8 | 0; //@line 4831
       } else {
        $242 = $237 + 8 | 0; //@line 4833
        $243 = HEAP32[$242 >> 2] | 0; //@line 4834
        if ((HEAP32[1542] | 0) >>> 0 > $243 >>> 0) {
         _abort(); //@line 4838
        } else {
         $$0189$i = $243; //@line 4841
         $$pre$phi$iZ2D = $242; //@line 4841
        }
       }
       HEAP32[$$pre$phi$iZ2D >> 2] = $234; //@line 4844
       HEAP32[$$0189$i + 12 >> 2] = $234; //@line 4846
       HEAP32[$234 + 8 >> 2] = $$0189$i; //@line 4848
       HEAP32[$234 + 12 >> 2] = $237; //@line 4850
      }
      HEAP32[1540] = $$0193$lcssa$i; //@line 4852
      HEAP32[1543] = $159; //@line 4853
     }
     $$0 = $$0192$lcssa$i + 8 | 0; //@line 4856
     STACKTOP = sp; //@line 4857
     return $$0 | 0; //@line 4857
    }
   } else {
    $$0197 = $6; //@line 4860
   }
  } else {
   if ($0 >>> 0 > 4294967231) {
    $$0197 = -1; //@line 4865
   } else {
    $251 = $0 + 11 | 0; //@line 4867
    $252 = $251 & -8; //@line 4868
    $253 = HEAP32[1539] | 0; //@line 4869
    if (!$253) {
     $$0197 = $252; //@line 4872
    } else {
     $255 = 0 - $252 | 0; //@line 4874
     $256 = $251 >>> 8; //@line 4875
     if (!$256) {
      $$0358$i = 0; //@line 4878
     } else {
      if ($252 >>> 0 > 16777215) {
       $$0358$i = 31; //@line 4882
      } else {
       $261 = ($256 + 1048320 | 0) >>> 16 & 8; //@line 4886
       $262 = $256 << $261; //@line 4887
       $265 = ($262 + 520192 | 0) >>> 16 & 4; //@line 4890
       $267 = $262 << $265; //@line 4892
       $270 = ($267 + 245760 | 0) >>> 16 & 2; //@line 4895
       $275 = 14 - ($265 | $261 | $270) + ($267 << $270 >>> 15) | 0; //@line 4900
       $$0358$i = $252 >>> ($275 + 7 | 0) & 1 | $275 << 1; //@line 4906
      }
     }
     $282 = HEAP32[6456 + ($$0358$i << 2) >> 2] | 0; //@line 4910
     L117 : do {
      if (!$282) {
       $$2355$i = 0; //@line 4914
       $$3$i203 = 0; //@line 4914
       $$3350$i = $255; //@line 4914
       label = 81; //@line 4915
      } else {
       $$0342$i = 0; //@line 4922
       $$0347$i = $255; //@line 4922
       $$0353$i = $282; //@line 4922
       $$0359$i = $252 << (($$0358$i | 0) == 31 ? 0 : 25 - ($$0358$i >>> 1) | 0); //@line 4922
       $$0362$i = 0; //@line 4922
       while (1) {
        $292 = (HEAP32[$$0353$i + 4 >> 2] & -8) - $252 | 0; //@line 4927
        if ($292 >>> 0 < $$0347$i >>> 0) {
         if (!$292) {
          $$414$i = $$0353$i; //@line 4932
          $$435113$i = 0; //@line 4932
          $$435712$i = $$0353$i; //@line 4932
          label = 85; //@line 4933
          break L117;
         } else {
          $$1343$i = $$0353$i; //@line 4936
          $$1348$i = $292; //@line 4936
         }
        } else {
         $$1343$i = $$0342$i; //@line 4939
         $$1348$i = $$0347$i; //@line 4939
        }
        $296 = HEAP32[$$0353$i + 20 >> 2] | 0; //@line 4942
        $$0353$i = HEAP32[$$0353$i + 16 + ($$0359$i >>> 31 << 2) >> 2] | 0; //@line 4945
        $$1363$i = ($296 | 0) == 0 | ($296 | 0) == ($$0353$i | 0) ? $$0362$i : $296; //@line 4949
        $302 = ($$0353$i | 0) == 0; //@line 4950
        if ($302) {
         $$2355$i = $$1363$i; //@line 4955
         $$3$i203 = $$1343$i; //@line 4955
         $$3350$i = $$1348$i; //@line 4955
         label = 81; //@line 4956
         break;
        } else {
         $$0342$i = $$1343$i; //@line 4959
         $$0347$i = $$1348$i; //@line 4959
         $$0359$i = $$0359$i << (($302 ^ 1) & 1); //@line 4959
         $$0362$i = $$1363$i; //@line 4959
        }
       }
      }
     } while (0);
     if ((label | 0) == 81) {
      if (($$2355$i | 0) == 0 & ($$3$i203 | 0) == 0) {
       $306 = 2 << $$0358$i; //@line 4969
       $309 = $253 & ($306 | 0 - $306); //@line 4972
       if (!$309) {
        $$0197 = $252; //@line 4975
        break;
       }
       $313 = ($309 & 0 - $309) + -1 | 0; //@line 4980
       $315 = $313 >>> 12 & 16; //@line 4982
       $316 = $313 >>> $315; //@line 4983
       $318 = $316 >>> 5 & 8; //@line 4985
       $320 = $316 >>> $318; //@line 4987
       $322 = $320 >>> 2 & 4; //@line 4989
       $324 = $320 >>> $322; //@line 4991
       $326 = $324 >>> 1 & 2; //@line 4993
       $328 = $324 >>> $326; //@line 4995
       $330 = $328 >>> 1 & 1; //@line 4997
       $$4$ph$i = 0; //@line 5003
       $$4357$ph$i = HEAP32[6456 + (($318 | $315 | $322 | $326 | $330) + ($328 >>> $330) << 2) >> 2] | 0; //@line 5003
      } else {
       $$4$ph$i = $$3$i203; //@line 5005
       $$4357$ph$i = $$2355$i; //@line 5005
      }
      if (!$$4357$ph$i) {
       $$4$lcssa$i = $$4$ph$i; //@line 5009
       $$4351$lcssa$i = $$3350$i; //@line 5009
      } else {
       $$414$i = $$4$ph$i; //@line 5011
       $$435113$i = $$3350$i; //@line 5011
       $$435712$i = $$4357$ph$i; //@line 5011
       label = 85; //@line 5012
      }
     }
     if ((label | 0) == 85) {
      while (1) {
       label = 0; //@line 5017
       $340 = (HEAP32[$$435712$i + 4 >> 2] & -8) - $252 | 0; //@line 5021
       $341 = $340 >>> 0 < $$435113$i >>> 0; //@line 5022
       $$$4351$i = $341 ? $340 : $$435113$i; //@line 5023
       $$4357$$4$i = $341 ? $$435712$i : $$414$i; //@line 5024
       $$435712$i = HEAP32[$$435712$i + 16 + (((HEAP32[$$435712$i + 16 >> 2] | 0) == 0 & 1) << 2) >> 2] | 0; //@line 5030
       if (!$$435712$i) {
        $$4$lcssa$i = $$4357$$4$i; //@line 5033
        $$4351$lcssa$i = $$$4351$i; //@line 5033
        break;
       } else {
        $$414$i = $$4357$$4$i; //@line 5036
        $$435113$i = $$$4351$i; //@line 5036
        label = 85; //@line 5037
       }
      }
     }
     if (!$$4$lcssa$i) {
      $$0197 = $252; //@line 5043
     } else {
      if ($$4351$lcssa$i >>> 0 < ((HEAP32[1540] | 0) - $252 | 0) >>> 0) {
       $352 = HEAP32[1542] | 0; //@line 5049
       if ($352 >>> 0 > $$4$lcssa$i >>> 0) {
        _abort(); //@line 5052
       }
       $354 = $$4$lcssa$i + $252 | 0; //@line 5055
       if ($354 >>> 0 <= $$4$lcssa$i >>> 0) {
        _abort(); //@line 5058
       }
       $357 = HEAP32[$$4$lcssa$i + 24 >> 2] | 0; //@line 5062
       $359 = HEAP32[$$4$lcssa$i + 12 >> 2] | 0; //@line 5064
       do {
        if (($359 | 0) == ($$4$lcssa$i | 0)) {
         $370 = $$4$lcssa$i + 20 | 0; //@line 5068
         $371 = HEAP32[$370 >> 2] | 0; //@line 5069
         if (!$371) {
          $373 = $$4$lcssa$i + 16 | 0; //@line 5072
          $374 = HEAP32[$373 >> 2] | 0; //@line 5073
          if (!$374) {
           $$3372$i = 0; //@line 5076
           break;
          } else {
           $$1370$i = $374; //@line 5079
           $$1374$i = $373; //@line 5079
          }
         } else {
          $$1370$i = $371; //@line 5082
          $$1374$i = $370; //@line 5082
         }
         while (1) {
          $376 = $$1370$i + 20 | 0; //@line 5085
          $377 = HEAP32[$376 >> 2] | 0; //@line 5086
          if ($377 | 0) {
           $$1370$i = $377; //@line 5089
           $$1374$i = $376; //@line 5089
           continue;
          }
          $379 = $$1370$i + 16 | 0; //@line 5092
          $380 = HEAP32[$379 >> 2] | 0; //@line 5093
          if (!$380) {
           break;
          } else {
           $$1370$i = $380; //@line 5098
           $$1374$i = $379; //@line 5098
          }
         }
         if ($352 >>> 0 > $$1374$i >>> 0) {
          _abort(); //@line 5103
         } else {
          HEAP32[$$1374$i >> 2] = 0; //@line 5106
          $$3372$i = $$1370$i; //@line 5107
          break;
         }
        } else {
         $362 = HEAP32[$$4$lcssa$i + 8 >> 2] | 0; //@line 5112
         if ($352 >>> 0 > $362 >>> 0) {
          _abort(); //@line 5115
         }
         $364 = $362 + 12 | 0; //@line 5118
         if ((HEAP32[$364 >> 2] | 0) != ($$4$lcssa$i | 0)) {
          _abort(); //@line 5122
         }
         $367 = $359 + 8 | 0; //@line 5125
         if ((HEAP32[$367 >> 2] | 0) == ($$4$lcssa$i | 0)) {
          HEAP32[$364 >> 2] = $359; //@line 5129
          HEAP32[$367 >> 2] = $362; //@line 5130
          $$3372$i = $359; //@line 5131
          break;
         } else {
          _abort(); //@line 5134
         }
        }
       } while (0);
       L164 : do {
        if (!$357) {
         $475 = $253; //@line 5142
        } else {
         $385 = HEAP32[$$4$lcssa$i + 28 >> 2] | 0; //@line 5145
         $386 = 6456 + ($385 << 2) | 0; //@line 5146
         do {
          if (($$4$lcssa$i | 0) == (HEAP32[$386 >> 2] | 0)) {
           HEAP32[$386 >> 2] = $$3372$i; //@line 5151
           if (!$$3372$i) {
            $391 = $253 & ~(1 << $385); //@line 5156
            HEAP32[1539] = $391; //@line 5157
            $475 = $391; //@line 5158
            break L164;
           }
          } else {
           if ((HEAP32[1542] | 0) >>> 0 > $357 >>> 0) {
            _abort(); //@line 5165
           } else {
            HEAP32[$357 + 16 + (((HEAP32[$357 + 16 >> 2] | 0) != ($$4$lcssa$i | 0) & 1) << 2) >> 2] = $$3372$i; //@line 5173
            if (!$$3372$i) {
             $475 = $253; //@line 5176
             break L164;
            } else {
             break;
            }
           }
          }
         } while (0);
         $399 = HEAP32[1542] | 0; //@line 5184
         if ($399 >>> 0 > $$3372$i >>> 0) {
          _abort(); //@line 5187
         }
         HEAP32[$$3372$i + 24 >> 2] = $357; //@line 5191
         $403 = HEAP32[$$4$lcssa$i + 16 >> 2] | 0; //@line 5193
         do {
          if ($403 | 0) {
           if ($399 >>> 0 > $403 >>> 0) {
            _abort(); //@line 5199
           } else {
            HEAP32[$$3372$i + 16 >> 2] = $403; //@line 5203
            HEAP32[$403 + 24 >> 2] = $$3372$i; //@line 5205
            break;
           }
          }
         } while (0);
         $409 = HEAP32[$$4$lcssa$i + 20 >> 2] | 0; //@line 5211
         if (!$409) {
          $475 = $253; //@line 5214
         } else {
          if ((HEAP32[1542] | 0) >>> 0 > $409 >>> 0) {
           _abort(); //@line 5219
          } else {
           HEAP32[$$3372$i + 20 >> 2] = $409; //@line 5223
           HEAP32[$409 + 24 >> 2] = $$3372$i; //@line 5225
           $475 = $253; //@line 5226
           break;
          }
         }
        }
       } while (0);
       do {
        if ($$4351$lcssa$i >>> 0 < 16) {
         $416 = $$4351$lcssa$i + $252 | 0; //@line 5235
         HEAP32[$$4$lcssa$i + 4 >> 2] = $416 | 3; //@line 5238
         $420 = $$4$lcssa$i + $416 + 4 | 0; //@line 5240
         HEAP32[$420 >> 2] = HEAP32[$420 >> 2] | 1; //@line 5243
        } else {
         HEAP32[$$4$lcssa$i + 4 >> 2] = $252 | 3; //@line 5247
         HEAP32[$354 + 4 >> 2] = $$4351$lcssa$i | 1; //@line 5250
         HEAP32[$354 + $$4351$lcssa$i >> 2] = $$4351$lcssa$i; //@line 5252
         $428 = $$4351$lcssa$i >>> 3; //@line 5253
         if ($$4351$lcssa$i >>> 0 < 256) {
          $431 = 6192 + ($428 << 1 << 2) | 0; //@line 5257
          $432 = HEAP32[1538] | 0; //@line 5258
          $433 = 1 << $428; //@line 5259
          if (!($432 & $433)) {
           HEAP32[1538] = $432 | $433; //@line 5264
           $$0368$i = $431; //@line 5266
           $$pre$phi$i211Z2D = $431 + 8 | 0; //@line 5266
          } else {
           $437 = $431 + 8 | 0; //@line 5268
           $438 = HEAP32[$437 >> 2] | 0; //@line 5269
           if ((HEAP32[1542] | 0) >>> 0 > $438 >>> 0) {
            _abort(); //@line 5273
           } else {
            $$0368$i = $438; //@line 5276
            $$pre$phi$i211Z2D = $437; //@line 5276
           }
          }
          HEAP32[$$pre$phi$i211Z2D >> 2] = $354; //@line 5279
          HEAP32[$$0368$i + 12 >> 2] = $354; //@line 5281
          HEAP32[$354 + 8 >> 2] = $$0368$i; //@line 5283
          HEAP32[$354 + 12 >> 2] = $431; //@line 5285
          break;
         }
         $444 = $$4351$lcssa$i >>> 8; //@line 5288
         if (!$444) {
          $$0361$i = 0; //@line 5291
         } else {
          if ($$4351$lcssa$i >>> 0 > 16777215) {
           $$0361$i = 31; //@line 5295
          } else {
           $449 = ($444 + 1048320 | 0) >>> 16 & 8; //@line 5299
           $450 = $444 << $449; //@line 5300
           $453 = ($450 + 520192 | 0) >>> 16 & 4; //@line 5303
           $455 = $450 << $453; //@line 5305
           $458 = ($455 + 245760 | 0) >>> 16 & 2; //@line 5308
           $463 = 14 - ($453 | $449 | $458) + ($455 << $458 >>> 15) | 0; //@line 5313
           $$0361$i = $$4351$lcssa$i >>> ($463 + 7 | 0) & 1 | $463 << 1; //@line 5319
          }
         }
         $469 = 6456 + ($$0361$i << 2) | 0; //@line 5322
         HEAP32[$354 + 28 >> 2] = $$0361$i; //@line 5324
         $471 = $354 + 16 | 0; //@line 5325
         HEAP32[$471 + 4 >> 2] = 0; //@line 5327
         HEAP32[$471 >> 2] = 0; //@line 5328
         $473 = 1 << $$0361$i; //@line 5329
         if (!($475 & $473)) {
          HEAP32[1539] = $475 | $473; //@line 5334
          HEAP32[$469 >> 2] = $354; //@line 5335
          HEAP32[$354 + 24 >> 2] = $469; //@line 5337
          HEAP32[$354 + 12 >> 2] = $354; //@line 5339
          HEAP32[$354 + 8 >> 2] = $354; //@line 5341
          break;
         }
         $$0344$i = $$4351$lcssa$i << (($$0361$i | 0) == 31 ? 0 : 25 - ($$0361$i >>> 1) | 0); //@line 5350
         $$0345$i = HEAP32[$469 >> 2] | 0; //@line 5350
         while (1) {
          if ((HEAP32[$$0345$i + 4 >> 2] & -8 | 0) == ($$4351$lcssa$i | 0)) {
           label = 139; //@line 5357
           break;
          }
          $492 = $$0345$i + 16 + ($$0344$i >>> 31 << 2) | 0; //@line 5361
          $494 = HEAP32[$492 >> 2] | 0; //@line 5363
          if (!$494) {
           label = 136; //@line 5366
           break;
          } else {
           $$0344$i = $$0344$i << 1; //@line 5369
           $$0345$i = $494; //@line 5369
          }
         }
         if ((label | 0) == 136) {
          if ((HEAP32[1542] | 0) >>> 0 > $492 >>> 0) {
           _abort(); //@line 5376
          } else {
           HEAP32[$492 >> 2] = $354; //@line 5379
           HEAP32[$354 + 24 >> 2] = $$0345$i; //@line 5381
           HEAP32[$354 + 12 >> 2] = $354; //@line 5383
           HEAP32[$354 + 8 >> 2] = $354; //@line 5385
           break;
          }
         } else if ((label | 0) == 139) {
          $501 = $$0345$i + 8 | 0; //@line 5390
          $502 = HEAP32[$501 >> 2] | 0; //@line 5391
          $503 = HEAP32[1542] | 0; //@line 5392
          if ($503 >>> 0 <= $502 >>> 0 & $503 >>> 0 <= $$0345$i >>> 0) {
           HEAP32[$502 + 12 >> 2] = $354; //@line 5398
           HEAP32[$501 >> 2] = $354; //@line 5399
           HEAP32[$354 + 8 >> 2] = $502; //@line 5401
           HEAP32[$354 + 12 >> 2] = $$0345$i; //@line 5403
           HEAP32[$354 + 24 >> 2] = 0; //@line 5405
           break;
          } else {
           _abort(); //@line 5408
          }
         }
        }
       } while (0);
       $$0 = $$4$lcssa$i + 8 | 0; //@line 5415
       STACKTOP = sp; //@line 5416
       return $$0 | 0; //@line 5416
      } else {
       $$0197 = $252; //@line 5418
      }
     }
    }
   }
  }
 } while (0);
 $512 = HEAP32[1540] | 0; //@line 5425
 if ($512 >>> 0 >= $$0197 >>> 0) {
  $514 = $512 - $$0197 | 0; //@line 5428
  $515 = HEAP32[1543] | 0; //@line 5429
  if ($514 >>> 0 > 15) {
   $517 = $515 + $$0197 | 0; //@line 5432
   HEAP32[1543] = $517; //@line 5433
   HEAP32[1540] = $514; //@line 5434
   HEAP32[$517 + 4 >> 2] = $514 | 1; //@line 5437
   HEAP32[$515 + $512 >> 2] = $514; //@line 5439
   HEAP32[$515 + 4 >> 2] = $$0197 | 3; //@line 5442
  } else {
   HEAP32[1540] = 0; //@line 5444
   HEAP32[1543] = 0; //@line 5445
   HEAP32[$515 + 4 >> 2] = $512 | 3; //@line 5448
   $526 = $515 + $512 + 4 | 0; //@line 5450
   HEAP32[$526 >> 2] = HEAP32[$526 >> 2] | 1; //@line 5453
  }
  $$0 = $515 + 8 | 0; //@line 5456
  STACKTOP = sp; //@line 5457
  return $$0 | 0; //@line 5457
 }
 $530 = HEAP32[1541] | 0; //@line 5459
 if ($530 >>> 0 > $$0197 >>> 0) {
  $532 = $530 - $$0197 | 0; //@line 5462
  HEAP32[1541] = $532; //@line 5463
  $533 = HEAP32[1544] | 0; //@line 5464
  $534 = $533 + $$0197 | 0; //@line 5465
  HEAP32[1544] = $534; //@line 5466
  HEAP32[$534 + 4 >> 2] = $532 | 1; //@line 5469
  HEAP32[$533 + 4 >> 2] = $$0197 | 3; //@line 5472
  $$0 = $533 + 8 | 0; //@line 5474
  STACKTOP = sp; //@line 5475
  return $$0 | 0; //@line 5475
 }
 if (!(HEAP32[1656] | 0)) {
  HEAP32[1658] = 4096; //@line 5480
  HEAP32[1657] = 4096; //@line 5481
  HEAP32[1659] = -1; //@line 5482
  HEAP32[1660] = -1; //@line 5483
  HEAP32[1661] = 0; //@line 5484
  HEAP32[1649] = 0; //@line 5485
  HEAP32[1656] = $1 & -16 ^ 1431655768; //@line 5489
  $548 = 4096; //@line 5490
 } else {
  $548 = HEAP32[1658] | 0; //@line 5493
 }
 $545 = $$0197 + 48 | 0; //@line 5495
 $546 = $$0197 + 47 | 0; //@line 5496
 $547 = $548 + $546 | 0; //@line 5497
 $549 = 0 - $548 | 0; //@line 5498
 $550 = $547 & $549; //@line 5499
 if ($550 >>> 0 <= $$0197 >>> 0) {
  $$0 = 0; //@line 5502
  STACKTOP = sp; //@line 5503
  return $$0 | 0; //@line 5503
 }
 $552 = HEAP32[1648] | 0; //@line 5505
 if ($552 | 0) {
  $554 = HEAP32[1646] | 0; //@line 5508
  $555 = $554 + $550 | 0; //@line 5509
  if ($555 >>> 0 <= $554 >>> 0 | $555 >>> 0 > $552 >>> 0) {
   $$0 = 0; //@line 5514
   STACKTOP = sp; //@line 5515
   return $$0 | 0; //@line 5515
  }
 }
 L244 : do {
  if (!(HEAP32[1649] & 4)) {
   $561 = HEAP32[1544] | 0; //@line 5523
   L246 : do {
    if (!$561) {
     label = 163; //@line 5527
    } else {
     $$0$i$i = 6600; //@line 5529
     while (1) {
      $563 = HEAP32[$$0$i$i >> 2] | 0; //@line 5531
      if ($563 >>> 0 <= $561 >>> 0) {
       $565 = $$0$i$i + 4 | 0; //@line 5534
       if (($563 + (HEAP32[$565 >> 2] | 0) | 0) >>> 0 > $561 >>> 0) {
        break;
       }
      }
      $570 = HEAP32[$$0$i$i + 8 >> 2] | 0; //@line 5543
      if (!$570) {
       label = 163; //@line 5546
       break L246;
      } else {
       $$0$i$i = $570; //@line 5549
      }
     }
     $595 = $547 - $530 & $549; //@line 5553
     if ($595 >>> 0 < 2147483647) {
      $597 = _sbrk($595 | 0) | 0; //@line 5556
      if (($597 | 0) == ((HEAP32[$$0$i$i >> 2] | 0) + (HEAP32[$565 >> 2] | 0) | 0)) {
       if (($597 | 0) == (-1 | 0)) {
        $$2234243136$i = $595; //@line 5564
       } else {
        $$723947$i = $595; //@line 5566
        $$748$i = $597; //@line 5566
        label = 180; //@line 5567
        break L244;
       }
      } else {
       $$2247$ph$i = $597; //@line 5571
       $$2253$ph$i = $595; //@line 5571
       label = 171; //@line 5572
      }
     } else {
      $$2234243136$i = 0; //@line 5575
     }
    }
   } while (0);
   do {
    if ((label | 0) == 163) {
     $572 = _sbrk(0) | 0; //@line 5581
     if (($572 | 0) == (-1 | 0)) {
      $$2234243136$i = 0; //@line 5584
     } else {
      $574 = $572; //@line 5586
      $575 = HEAP32[1657] | 0; //@line 5587
      $576 = $575 + -1 | 0; //@line 5588
      $$$i = (($576 & $574 | 0) == 0 ? 0 : ($576 + $574 & 0 - $575) - $574 | 0) + $550 | 0; //@line 5596
      $584 = HEAP32[1646] | 0; //@line 5597
      $585 = $$$i + $584 | 0; //@line 5598
      if ($$$i >>> 0 > $$0197 >>> 0 & $$$i >>> 0 < 2147483647) {
       $588 = HEAP32[1648] | 0; //@line 5603
       if ($588 | 0) {
        if ($585 >>> 0 <= $584 >>> 0 | $585 >>> 0 > $588 >>> 0) {
         $$2234243136$i = 0; //@line 5610
         break;
        }
       }
       $592 = _sbrk($$$i | 0) | 0; //@line 5614
       if (($592 | 0) == ($572 | 0)) {
        $$723947$i = $$$i; //@line 5617
        $$748$i = $572; //@line 5617
        label = 180; //@line 5618
        break L244;
       } else {
        $$2247$ph$i = $592; //@line 5621
        $$2253$ph$i = $$$i; //@line 5621
        label = 171; //@line 5622
       }
      } else {
       $$2234243136$i = 0; //@line 5625
      }
     }
    }
   } while (0);
   do {
    if ((label | 0) == 171) {
     $603 = 0 - $$2253$ph$i | 0; //@line 5632
     if (!($545 >>> 0 > $$2253$ph$i >>> 0 & ($$2253$ph$i >>> 0 < 2147483647 & ($$2247$ph$i | 0) != (-1 | 0)))) {
      if (($$2247$ph$i | 0) == (-1 | 0)) {
       $$2234243136$i = 0; //@line 5641
       break;
      } else {
       $$723947$i = $$2253$ph$i; //@line 5644
       $$748$i = $$2247$ph$i; //@line 5644
       label = 180; //@line 5645
       break L244;
      }
     }
     $607 = HEAP32[1658] | 0; //@line 5649
     $611 = $546 - $$2253$ph$i + $607 & 0 - $607; //@line 5653
     if ($611 >>> 0 >= 2147483647) {
      $$723947$i = $$2253$ph$i; //@line 5656
      $$748$i = $$2247$ph$i; //@line 5656
      label = 180; //@line 5657
      break L244;
     }
     if ((_sbrk($611 | 0) | 0) == (-1 | 0)) {
      _sbrk($603 | 0) | 0; //@line 5663
      $$2234243136$i = 0; //@line 5664
      break;
     } else {
      $$723947$i = $611 + $$2253$ph$i | 0; //@line 5668
      $$748$i = $$2247$ph$i; //@line 5668
      label = 180; //@line 5669
      break L244;
     }
    }
   } while (0);
   HEAP32[1649] = HEAP32[1649] | 4; //@line 5676
   $$4236$i = $$2234243136$i; //@line 5677
   label = 178; //@line 5678
  } else {
   $$4236$i = 0; //@line 5680
   label = 178; //@line 5681
  }
 } while (0);
 if ((label | 0) == 178) {
  if ($550 >>> 0 < 2147483647) {
   $620 = _sbrk($550 | 0) | 0; //@line 5687
   $621 = _sbrk(0) | 0; //@line 5688
   $627 = $621 - $620 | 0; //@line 5696
   $629 = $627 >>> 0 > ($$0197 + 40 | 0) >>> 0; //@line 5698
   if (!(($620 | 0) == (-1 | 0) | $629 ^ 1 | $620 >>> 0 < $621 >>> 0 & (($620 | 0) != (-1 | 0) & ($621 | 0) != (-1 | 0)) ^ 1)) {
    $$723947$i = $629 ? $627 : $$4236$i; //@line 5706
    $$748$i = $620; //@line 5706
    label = 180; //@line 5707
   }
  }
 }
 if ((label | 0) == 180) {
  $633 = (HEAP32[1646] | 0) + $$723947$i | 0; //@line 5713
  HEAP32[1646] = $633; //@line 5714
  if ($633 >>> 0 > (HEAP32[1647] | 0) >>> 0) {
   HEAP32[1647] = $633; //@line 5718
  }
  $636 = HEAP32[1544] | 0; //@line 5720
  do {
   if (!$636) {
    $638 = HEAP32[1542] | 0; //@line 5724
    if (($638 | 0) == 0 | $$748$i >>> 0 < $638 >>> 0) {
     HEAP32[1542] = $$748$i; //@line 5729
    }
    HEAP32[1650] = $$748$i; //@line 5731
    HEAP32[1651] = $$723947$i; //@line 5732
    HEAP32[1653] = 0; //@line 5733
    HEAP32[1547] = HEAP32[1656]; //@line 5735
    HEAP32[1546] = -1; //@line 5736
    HEAP32[1551] = 6192; //@line 5737
    HEAP32[1550] = 6192; //@line 5738
    HEAP32[1553] = 6200; //@line 5739
    HEAP32[1552] = 6200; //@line 5740
    HEAP32[1555] = 6208; //@line 5741
    HEAP32[1554] = 6208; //@line 5742
    HEAP32[1557] = 6216; //@line 5743
    HEAP32[1556] = 6216; //@line 5744
    HEAP32[1559] = 6224; //@line 5745
    HEAP32[1558] = 6224; //@line 5746
    HEAP32[1561] = 6232; //@line 5747
    HEAP32[1560] = 6232; //@line 5748
    HEAP32[1563] = 6240; //@line 5749
    HEAP32[1562] = 6240; //@line 5750
    HEAP32[1565] = 6248; //@line 5751
    HEAP32[1564] = 6248; //@line 5752
    HEAP32[1567] = 6256; //@line 5753
    HEAP32[1566] = 6256; //@line 5754
    HEAP32[1569] = 6264; //@line 5755
    HEAP32[1568] = 6264; //@line 5756
    HEAP32[1571] = 6272; //@line 5757
    HEAP32[1570] = 6272; //@line 5758
    HEAP32[1573] = 6280; //@line 5759
    HEAP32[1572] = 6280; //@line 5760
    HEAP32[1575] = 6288; //@line 5761
    HEAP32[1574] = 6288; //@line 5762
    HEAP32[1577] = 6296; //@line 5763
    HEAP32[1576] = 6296; //@line 5764
    HEAP32[1579] = 6304; //@line 5765
    HEAP32[1578] = 6304; //@line 5766
    HEAP32[1581] = 6312; //@line 5767
    HEAP32[1580] = 6312; //@line 5768
    HEAP32[1583] = 6320; //@line 5769
    HEAP32[1582] = 6320; //@line 5770
    HEAP32[1585] = 6328; //@line 5771
    HEAP32[1584] = 6328; //@line 5772
    HEAP32[1587] = 6336; //@line 5773
    HEAP32[1586] = 6336; //@line 5774
    HEAP32[1589] = 6344; //@line 5775
    HEAP32[1588] = 6344; //@line 5776
    HEAP32[1591] = 6352; //@line 5777
    HEAP32[1590] = 6352; //@line 5778
    HEAP32[1593] = 6360; //@line 5779
    HEAP32[1592] = 6360; //@line 5780
    HEAP32[1595] = 6368; //@line 5781
    HEAP32[1594] = 6368; //@line 5782
    HEAP32[1597] = 6376; //@line 5783
    HEAP32[1596] = 6376; //@line 5784
    HEAP32[1599] = 6384; //@line 5785
    HEAP32[1598] = 6384; //@line 5786
    HEAP32[1601] = 6392; //@line 5787
    HEAP32[1600] = 6392; //@line 5788
    HEAP32[1603] = 6400; //@line 5789
    HEAP32[1602] = 6400; //@line 5790
    HEAP32[1605] = 6408; //@line 5791
    HEAP32[1604] = 6408; //@line 5792
    HEAP32[1607] = 6416; //@line 5793
    HEAP32[1606] = 6416; //@line 5794
    HEAP32[1609] = 6424; //@line 5795
    HEAP32[1608] = 6424; //@line 5796
    HEAP32[1611] = 6432; //@line 5797
    HEAP32[1610] = 6432; //@line 5798
    HEAP32[1613] = 6440; //@line 5799
    HEAP32[1612] = 6440; //@line 5800
    $642 = $$723947$i + -40 | 0; //@line 5801
    $644 = $$748$i + 8 | 0; //@line 5803
    $649 = ($644 & 7 | 0) == 0 ? 0 : 0 - $644 & 7; //@line 5808
    $650 = $$748$i + $649 | 0; //@line 5809
    $651 = $642 - $649 | 0; //@line 5810
    HEAP32[1544] = $650; //@line 5811
    HEAP32[1541] = $651; //@line 5812
    HEAP32[$650 + 4 >> 2] = $651 | 1; //@line 5815
    HEAP32[$$748$i + $642 + 4 >> 2] = 40; //@line 5818
    HEAP32[1545] = HEAP32[1660]; //@line 5820
   } else {
    $$024367$i = 6600; //@line 5822
    while (1) {
     $657 = HEAP32[$$024367$i >> 2] | 0; //@line 5824
     $658 = $$024367$i + 4 | 0; //@line 5825
     $659 = HEAP32[$658 >> 2] | 0; //@line 5826
     if (($$748$i | 0) == ($657 + $659 | 0)) {
      label = 188; //@line 5830
      break;
     }
     $663 = HEAP32[$$024367$i + 8 >> 2] | 0; //@line 5834
     if (!$663) {
      break;
     } else {
      $$024367$i = $663; //@line 5839
     }
    }
    if ((label | 0) == 188) {
     if (!(HEAP32[$$024367$i + 12 >> 2] & 8)) {
      if ($$748$i >>> 0 > $636 >>> 0 & $657 >>> 0 <= $636 >>> 0) {
       HEAP32[$658 >> 2] = $659 + $$723947$i; //@line 5853
       $673 = (HEAP32[1541] | 0) + $$723947$i | 0; //@line 5855
       $675 = $636 + 8 | 0; //@line 5857
       $680 = ($675 & 7 | 0) == 0 ? 0 : 0 - $675 & 7; //@line 5862
       $681 = $636 + $680 | 0; //@line 5863
       $682 = $673 - $680 | 0; //@line 5864
       HEAP32[1544] = $681; //@line 5865
       HEAP32[1541] = $682; //@line 5866
       HEAP32[$681 + 4 >> 2] = $682 | 1; //@line 5869
       HEAP32[$636 + $673 + 4 >> 2] = 40; //@line 5872
       HEAP32[1545] = HEAP32[1660]; //@line 5874
       break;
      }
     }
    }
    $688 = HEAP32[1542] | 0; //@line 5879
    if ($$748$i >>> 0 < $688 >>> 0) {
     HEAP32[1542] = $$748$i; //@line 5882
     $753 = $$748$i; //@line 5883
    } else {
     $753 = $688; //@line 5885
    }
    $690 = $$748$i + $$723947$i | 0; //@line 5887
    $$124466$i = 6600; //@line 5888
    while (1) {
     if ((HEAP32[$$124466$i >> 2] | 0) == ($690 | 0)) {
      label = 196; //@line 5893
      break;
     }
     $694 = HEAP32[$$124466$i + 8 >> 2] | 0; //@line 5897
     if (!$694) {
      $$0$i$i$i = 6600; //@line 5900
      break;
     } else {
      $$124466$i = $694; //@line 5903
     }
    }
    if ((label | 0) == 196) {
     if (!(HEAP32[$$124466$i + 12 >> 2] & 8)) {
      HEAP32[$$124466$i >> 2] = $$748$i; //@line 5912
      $700 = $$124466$i + 4 | 0; //@line 5913
      HEAP32[$700 >> 2] = (HEAP32[$700 >> 2] | 0) + $$723947$i; //@line 5916
      $704 = $$748$i + 8 | 0; //@line 5918
      $710 = $$748$i + (($704 & 7 | 0) == 0 ? 0 : 0 - $704 & 7) | 0; //@line 5924
      $712 = $690 + 8 | 0; //@line 5926
      $718 = $690 + (($712 & 7 | 0) == 0 ? 0 : 0 - $712 & 7) | 0; //@line 5932
      $722 = $710 + $$0197 | 0; //@line 5936
      $723 = $718 - $710 - $$0197 | 0; //@line 5937
      HEAP32[$710 + 4 >> 2] = $$0197 | 3; //@line 5940
      do {
       if (($636 | 0) == ($718 | 0)) {
        $728 = (HEAP32[1541] | 0) + $723 | 0; //@line 5945
        HEAP32[1541] = $728; //@line 5946
        HEAP32[1544] = $722; //@line 5947
        HEAP32[$722 + 4 >> 2] = $728 | 1; //@line 5950
       } else {
        if ((HEAP32[1543] | 0) == ($718 | 0)) {
         $734 = (HEAP32[1540] | 0) + $723 | 0; //@line 5956
         HEAP32[1540] = $734; //@line 5957
         HEAP32[1543] = $722; //@line 5958
         HEAP32[$722 + 4 >> 2] = $734 | 1; //@line 5961
         HEAP32[$722 + $734 >> 2] = $734; //@line 5963
         break;
        }
        $739 = HEAP32[$718 + 4 >> 2] | 0; //@line 5967
        if (($739 & 3 | 0) == 1) {
         $742 = $739 & -8; //@line 5971
         $743 = $739 >>> 3; //@line 5972
         L311 : do {
          if ($739 >>> 0 < 256) {
           $746 = HEAP32[$718 + 8 >> 2] | 0; //@line 5977
           $748 = HEAP32[$718 + 12 >> 2] | 0; //@line 5979
           $750 = 6192 + ($743 << 1 << 2) | 0; //@line 5981
           do {
            if (($746 | 0) != ($750 | 0)) {
             if ($753 >>> 0 > $746 >>> 0) {
              _abort(); //@line 5987
             }
             if ((HEAP32[$746 + 12 >> 2] | 0) == ($718 | 0)) {
              break;
             }
             _abort(); //@line 5996
            }
           } while (0);
           if (($748 | 0) == ($746 | 0)) {
            HEAP32[1538] = HEAP32[1538] & ~(1 << $743); //@line 6006
            break;
           }
           do {
            if (($748 | 0) == ($750 | 0)) {
             $$pre$phi11$i$iZ2D = $748 + 8 | 0; //@line 6013
            } else {
             if ($753 >>> 0 > $748 >>> 0) {
              _abort(); //@line 6017
             }
             $764 = $748 + 8 | 0; //@line 6020
             if ((HEAP32[$764 >> 2] | 0) == ($718 | 0)) {
              $$pre$phi11$i$iZ2D = $764; //@line 6024
              break;
             }
             _abort(); //@line 6027
            }
           } while (0);
           HEAP32[$746 + 12 >> 2] = $748; //@line 6032
           HEAP32[$$pre$phi11$i$iZ2D >> 2] = $746; //@line 6033
          } else {
           $769 = HEAP32[$718 + 24 >> 2] | 0; //@line 6036
           $771 = HEAP32[$718 + 12 >> 2] | 0; //@line 6038
           do {
            if (($771 | 0) == ($718 | 0)) {
             $782 = $718 + 16 | 0; //@line 6042
             $783 = $782 + 4 | 0; //@line 6043
             $784 = HEAP32[$783 >> 2] | 0; //@line 6044
             if (!$784) {
              $786 = HEAP32[$782 >> 2] | 0; //@line 6047
              if (!$786) {
               $$3$i$i = 0; //@line 6050
               break;
              } else {
               $$1291$i$i = $786; //@line 6053
               $$1293$i$i = $782; //@line 6053
              }
             } else {
              $$1291$i$i = $784; //@line 6056
              $$1293$i$i = $783; //@line 6056
             }
             while (1) {
              $788 = $$1291$i$i + 20 | 0; //@line 6059
              $789 = HEAP32[$788 >> 2] | 0; //@line 6060
              if ($789 | 0) {
               $$1291$i$i = $789; //@line 6063
               $$1293$i$i = $788; //@line 6063
               continue;
              }
              $791 = $$1291$i$i + 16 | 0; //@line 6066
              $792 = HEAP32[$791 >> 2] | 0; //@line 6067
              if (!$792) {
               break;
              } else {
               $$1291$i$i = $792; //@line 6072
               $$1293$i$i = $791; //@line 6072
              }
             }
             if ($753 >>> 0 > $$1293$i$i >>> 0) {
              _abort(); //@line 6077
             } else {
              HEAP32[$$1293$i$i >> 2] = 0; //@line 6080
              $$3$i$i = $$1291$i$i; //@line 6081
              break;
             }
            } else {
             $774 = HEAP32[$718 + 8 >> 2] | 0; //@line 6086
             if ($753 >>> 0 > $774 >>> 0) {
              _abort(); //@line 6089
             }
             $776 = $774 + 12 | 0; //@line 6092
             if ((HEAP32[$776 >> 2] | 0) != ($718 | 0)) {
              _abort(); //@line 6096
             }
             $779 = $771 + 8 | 0; //@line 6099
             if ((HEAP32[$779 >> 2] | 0) == ($718 | 0)) {
              HEAP32[$776 >> 2] = $771; //@line 6103
              HEAP32[$779 >> 2] = $774; //@line 6104
              $$3$i$i = $771; //@line 6105
              break;
             } else {
              _abort(); //@line 6108
             }
            }
           } while (0);
           if (!$769) {
            break;
           }
           $797 = HEAP32[$718 + 28 >> 2] | 0; //@line 6118
           $798 = 6456 + ($797 << 2) | 0; //@line 6119
           do {
            if ((HEAP32[$798 >> 2] | 0) == ($718 | 0)) {
             HEAP32[$798 >> 2] = $$3$i$i; //@line 6124
             if ($$3$i$i | 0) {
              break;
             }
             HEAP32[1539] = HEAP32[1539] & ~(1 << $797); //@line 6133
             break L311;
            } else {
             if ((HEAP32[1542] | 0) >>> 0 > $769 >>> 0) {
              _abort(); //@line 6139
             } else {
              HEAP32[$769 + 16 + (((HEAP32[$769 + 16 >> 2] | 0) != ($718 | 0) & 1) << 2) >> 2] = $$3$i$i; //@line 6147
              if (!$$3$i$i) {
               break L311;
              } else {
               break;
              }
             }
            }
           } while (0);
           $812 = HEAP32[1542] | 0; //@line 6157
           if ($812 >>> 0 > $$3$i$i >>> 0) {
            _abort(); //@line 6160
           }
           HEAP32[$$3$i$i + 24 >> 2] = $769; //@line 6164
           $815 = $718 + 16 | 0; //@line 6165
           $816 = HEAP32[$815 >> 2] | 0; //@line 6166
           do {
            if ($816 | 0) {
             if ($812 >>> 0 > $816 >>> 0) {
              _abort(); //@line 6172
             } else {
              HEAP32[$$3$i$i + 16 >> 2] = $816; //@line 6176
              HEAP32[$816 + 24 >> 2] = $$3$i$i; //@line 6178
              break;
             }
            }
           } while (0);
           $822 = HEAP32[$815 + 4 >> 2] | 0; //@line 6184
           if (!$822) {
            break;
           }
           if ((HEAP32[1542] | 0) >>> 0 > $822 >>> 0) {
            _abort(); //@line 6192
           } else {
            HEAP32[$$3$i$i + 20 >> 2] = $822; //@line 6196
            HEAP32[$822 + 24 >> 2] = $$3$i$i; //@line 6198
            break;
           }
          }
         } while (0);
         $$0$i17$i = $718 + $742 | 0; //@line 6205
         $$0287$i$i = $742 + $723 | 0; //@line 6205
        } else {
         $$0$i17$i = $718; //@line 6207
         $$0287$i$i = $723; //@line 6207
        }
        $830 = $$0$i17$i + 4 | 0; //@line 6209
        HEAP32[$830 >> 2] = HEAP32[$830 >> 2] & -2; //@line 6212
        HEAP32[$722 + 4 >> 2] = $$0287$i$i | 1; //@line 6215
        HEAP32[$722 + $$0287$i$i >> 2] = $$0287$i$i; //@line 6217
        $836 = $$0287$i$i >>> 3; //@line 6218
        if ($$0287$i$i >>> 0 < 256) {
         $839 = 6192 + ($836 << 1 << 2) | 0; //@line 6222
         $840 = HEAP32[1538] | 0; //@line 6223
         $841 = 1 << $836; //@line 6224
         do {
          if (!($840 & $841)) {
           HEAP32[1538] = $840 | $841; //@line 6230
           $$0295$i$i = $839; //@line 6232
           $$pre$phi$i19$iZ2D = $839 + 8 | 0; //@line 6232
          } else {
           $845 = $839 + 8 | 0; //@line 6234
           $846 = HEAP32[$845 >> 2] | 0; //@line 6235
           if ((HEAP32[1542] | 0) >>> 0 <= $846 >>> 0) {
            $$0295$i$i = $846; //@line 6239
            $$pre$phi$i19$iZ2D = $845; //@line 6239
            break;
           }
           _abort(); //@line 6242
          }
         } while (0);
         HEAP32[$$pre$phi$i19$iZ2D >> 2] = $722; //@line 6246
         HEAP32[$$0295$i$i + 12 >> 2] = $722; //@line 6248
         HEAP32[$722 + 8 >> 2] = $$0295$i$i; //@line 6250
         HEAP32[$722 + 12 >> 2] = $839; //@line 6252
         break;
        }
        $852 = $$0287$i$i >>> 8; //@line 6255
        do {
         if (!$852) {
          $$0296$i$i = 0; //@line 6259
         } else {
          if ($$0287$i$i >>> 0 > 16777215) {
           $$0296$i$i = 31; //@line 6263
           break;
          }
          $857 = ($852 + 1048320 | 0) >>> 16 & 8; //@line 6268
          $858 = $852 << $857; //@line 6269
          $861 = ($858 + 520192 | 0) >>> 16 & 4; //@line 6272
          $863 = $858 << $861; //@line 6274
          $866 = ($863 + 245760 | 0) >>> 16 & 2; //@line 6277
          $871 = 14 - ($861 | $857 | $866) + ($863 << $866 >>> 15) | 0; //@line 6282
          $$0296$i$i = $$0287$i$i >>> ($871 + 7 | 0) & 1 | $871 << 1; //@line 6288
         }
        } while (0);
        $877 = 6456 + ($$0296$i$i << 2) | 0; //@line 6291
        HEAP32[$722 + 28 >> 2] = $$0296$i$i; //@line 6293
        $879 = $722 + 16 | 0; //@line 6294
        HEAP32[$879 + 4 >> 2] = 0; //@line 6296
        HEAP32[$879 >> 2] = 0; //@line 6297
        $881 = HEAP32[1539] | 0; //@line 6298
        $882 = 1 << $$0296$i$i; //@line 6299
        if (!($881 & $882)) {
         HEAP32[1539] = $881 | $882; //@line 6304
         HEAP32[$877 >> 2] = $722; //@line 6305
         HEAP32[$722 + 24 >> 2] = $877; //@line 6307
         HEAP32[$722 + 12 >> 2] = $722; //@line 6309
         HEAP32[$722 + 8 >> 2] = $722; //@line 6311
         break;
        }
        $$0288$i$i = $$0287$i$i << (($$0296$i$i | 0) == 31 ? 0 : 25 - ($$0296$i$i >>> 1) | 0); //@line 6320
        $$0289$i$i = HEAP32[$877 >> 2] | 0; //@line 6320
        while (1) {
         if ((HEAP32[$$0289$i$i + 4 >> 2] & -8 | 0) == ($$0287$i$i | 0)) {
          label = 263; //@line 6327
          break;
         }
         $900 = $$0289$i$i + 16 + ($$0288$i$i >>> 31 << 2) | 0; //@line 6331
         $902 = HEAP32[$900 >> 2] | 0; //@line 6333
         if (!$902) {
          label = 260; //@line 6336
          break;
         } else {
          $$0288$i$i = $$0288$i$i << 1; //@line 6339
          $$0289$i$i = $902; //@line 6339
         }
        }
        if ((label | 0) == 260) {
         if ((HEAP32[1542] | 0) >>> 0 > $900 >>> 0) {
          _abort(); //@line 6346
         } else {
          HEAP32[$900 >> 2] = $722; //@line 6349
          HEAP32[$722 + 24 >> 2] = $$0289$i$i; //@line 6351
          HEAP32[$722 + 12 >> 2] = $722; //@line 6353
          HEAP32[$722 + 8 >> 2] = $722; //@line 6355
          break;
         }
        } else if ((label | 0) == 263) {
         $909 = $$0289$i$i + 8 | 0; //@line 6360
         $910 = HEAP32[$909 >> 2] | 0; //@line 6361
         $911 = HEAP32[1542] | 0; //@line 6362
         if ($911 >>> 0 <= $910 >>> 0 & $911 >>> 0 <= $$0289$i$i >>> 0) {
          HEAP32[$910 + 12 >> 2] = $722; //@line 6368
          HEAP32[$909 >> 2] = $722; //@line 6369
          HEAP32[$722 + 8 >> 2] = $910; //@line 6371
          HEAP32[$722 + 12 >> 2] = $$0289$i$i; //@line 6373
          HEAP32[$722 + 24 >> 2] = 0; //@line 6375
          break;
         } else {
          _abort(); //@line 6378
         }
        }
       }
      } while (0);
      $$0 = $710 + 8 | 0; //@line 6385
      STACKTOP = sp; //@line 6386
      return $$0 | 0; //@line 6386
     } else {
      $$0$i$i$i = 6600; //@line 6388
     }
    }
    while (1) {
     $919 = HEAP32[$$0$i$i$i >> 2] | 0; //@line 6392
     if ($919 >>> 0 <= $636 >>> 0) {
      $923 = $919 + (HEAP32[$$0$i$i$i + 4 >> 2] | 0) | 0; //@line 6397
      if ($923 >>> 0 > $636 >>> 0) {
       break;
      }
     }
     $$0$i$i$i = HEAP32[$$0$i$i$i + 8 >> 2] | 0; //@line 6405
    }
    $927 = $923 + -47 | 0; //@line 6407
    $929 = $927 + 8 | 0; //@line 6409
    $935 = $927 + (($929 & 7 | 0) == 0 ? 0 : 0 - $929 & 7) | 0; //@line 6415
    $936 = $636 + 16 | 0; //@line 6416
    $938 = $935 >>> 0 < $936 >>> 0 ? $636 : $935; //@line 6418
    $939 = $938 + 8 | 0; //@line 6419
    $940 = $938 + 24 | 0; //@line 6420
    $941 = $$723947$i + -40 | 0; //@line 6421
    $943 = $$748$i + 8 | 0; //@line 6423
    $948 = ($943 & 7 | 0) == 0 ? 0 : 0 - $943 & 7; //@line 6428
    $949 = $$748$i + $948 | 0; //@line 6429
    $950 = $941 - $948 | 0; //@line 6430
    HEAP32[1544] = $949; //@line 6431
    HEAP32[1541] = $950; //@line 6432
    HEAP32[$949 + 4 >> 2] = $950 | 1; //@line 6435
    HEAP32[$$748$i + $941 + 4 >> 2] = 40; //@line 6438
    HEAP32[1545] = HEAP32[1660]; //@line 6440
    $956 = $938 + 4 | 0; //@line 6441
    HEAP32[$956 >> 2] = 27; //@line 6442
    HEAP32[$939 >> 2] = HEAP32[1650]; //@line 6443
    HEAP32[$939 + 4 >> 2] = HEAP32[1651]; //@line 6443
    HEAP32[$939 + 8 >> 2] = HEAP32[1652]; //@line 6443
    HEAP32[$939 + 12 >> 2] = HEAP32[1653]; //@line 6443
    HEAP32[1650] = $$748$i; //@line 6444
    HEAP32[1651] = $$723947$i; //@line 6445
    HEAP32[1653] = 0; //@line 6446
    HEAP32[1652] = $939; //@line 6447
    $958 = $940; //@line 6448
    do {
     $958$looptemp = $958;
     $958 = $958 + 4 | 0; //@line 6450
     HEAP32[$958 >> 2] = 7; //@line 6451
    } while (($958$looptemp + 8 | 0) >>> 0 < $923 >>> 0);
    if (($938 | 0) != ($636 | 0)) {
     $964 = $938 - $636 | 0; //@line 6464
     HEAP32[$956 >> 2] = HEAP32[$956 >> 2] & -2; //@line 6467
     HEAP32[$636 + 4 >> 2] = $964 | 1; //@line 6470
     HEAP32[$938 >> 2] = $964; //@line 6471
     $969 = $964 >>> 3; //@line 6472
     if ($964 >>> 0 < 256) {
      $972 = 6192 + ($969 << 1 << 2) | 0; //@line 6476
      $973 = HEAP32[1538] | 0; //@line 6477
      $974 = 1 << $969; //@line 6478
      if (!($973 & $974)) {
       HEAP32[1538] = $973 | $974; //@line 6483
       $$0211$i$i = $972; //@line 6485
       $$pre$phi$i$iZ2D = $972 + 8 | 0; //@line 6485
      } else {
       $978 = $972 + 8 | 0; //@line 6487
       $979 = HEAP32[$978 >> 2] | 0; //@line 6488
       if ((HEAP32[1542] | 0) >>> 0 > $979 >>> 0) {
        _abort(); //@line 6492
       } else {
        $$0211$i$i = $979; //@line 6495
        $$pre$phi$i$iZ2D = $978; //@line 6495
       }
      }
      HEAP32[$$pre$phi$i$iZ2D >> 2] = $636; //@line 6498
      HEAP32[$$0211$i$i + 12 >> 2] = $636; //@line 6500
      HEAP32[$636 + 8 >> 2] = $$0211$i$i; //@line 6502
      HEAP32[$636 + 12 >> 2] = $972; //@line 6504
      break;
     }
     $985 = $964 >>> 8; //@line 6507
     if (!$985) {
      $$0212$i$i = 0; //@line 6510
     } else {
      if ($964 >>> 0 > 16777215) {
       $$0212$i$i = 31; //@line 6514
      } else {
       $990 = ($985 + 1048320 | 0) >>> 16 & 8; //@line 6518
       $991 = $985 << $990; //@line 6519
       $994 = ($991 + 520192 | 0) >>> 16 & 4; //@line 6522
       $996 = $991 << $994; //@line 6524
       $999 = ($996 + 245760 | 0) >>> 16 & 2; //@line 6527
       $1004 = 14 - ($994 | $990 | $999) + ($996 << $999 >>> 15) | 0; //@line 6532
       $$0212$i$i = $964 >>> ($1004 + 7 | 0) & 1 | $1004 << 1; //@line 6538
      }
     }
     $1010 = 6456 + ($$0212$i$i << 2) | 0; //@line 6541
     HEAP32[$636 + 28 >> 2] = $$0212$i$i; //@line 6543
     HEAP32[$636 + 20 >> 2] = 0; //@line 6545
     HEAP32[$936 >> 2] = 0; //@line 6546
     $1013 = HEAP32[1539] | 0; //@line 6547
     $1014 = 1 << $$0212$i$i; //@line 6548
     if (!($1013 & $1014)) {
      HEAP32[1539] = $1013 | $1014; //@line 6553
      HEAP32[$1010 >> 2] = $636; //@line 6554
      HEAP32[$636 + 24 >> 2] = $1010; //@line 6556
      HEAP32[$636 + 12 >> 2] = $636; //@line 6558
      HEAP32[$636 + 8 >> 2] = $636; //@line 6560
      break;
     }
     $$0206$i$i = $964 << (($$0212$i$i | 0) == 31 ? 0 : 25 - ($$0212$i$i >>> 1) | 0); //@line 6569
     $$0207$i$i = HEAP32[$1010 >> 2] | 0; //@line 6569
     while (1) {
      if ((HEAP32[$$0207$i$i + 4 >> 2] & -8 | 0) == ($964 | 0)) {
       label = 289; //@line 6576
       break;
      }
      $1032 = $$0207$i$i + 16 + ($$0206$i$i >>> 31 << 2) | 0; //@line 6580
      $1034 = HEAP32[$1032 >> 2] | 0; //@line 6582
      if (!$1034) {
       label = 286; //@line 6585
       break;
      } else {
       $$0206$i$i = $$0206$i$i << 1; //@line 6588
       $$0207$i$i = $1034; //@line 6588
      }
     }
     if ((label | 0) == 286) {
      if ((HEAP32[1542] | 0) >>> 0 > $1032 >>> 0) {
       _abort(); //@line 6595
      } else {
       HEAP32[$1032 >> 2] = $636; //@line 6598
       HEAP32[$636 + 24 >> 2] = $$0207$i$i; //@line 6600
       HEAP32[$636 + 12 >> 2] = $636; //@line 6602
       HEAP32[$636 + 8 >> 2] = $636; //@line 6604
       break;
      }
     } else if ((label | 0) == 289) {
      $1041 = $$0207$i$i + 8 | 0; //@line 6609
      $1042 = HEAP32[$1041 >> 2] | 0; //@line 6610
      $1043 = HEAP32[1542] | 0; //@line 6611
      if ($1043 >>> 0 <= $1042 >>> 0 & $1043 >>> 0 <= $$0207$i$i >>> 0) {
       HEAP32[$1042 + 12 >> 2] = $636; //@line 6617
       HEAP32[$1041 >> 2] = $636; //@line 6618
       HEAP32[$636 + 8 >> 2] = $1042; //@line 6620
       HEAP32[$636 + 12 >> 2] = $$0207$i$i; //@line 6622
       HEAP32[$636 + 24 >> 2] = 0; //@line 6624
       break;
      } else {
       _abort(); //@line 6627
      }
     }
    }
   }
  } while (0);
  $1052 = HEAP32[1541] | 0; //@line 6634
  if ($1052 >>> 0 > $$0197 >>> 0) {
   $1054 = $1052 - $$0197 | 0; //@line 6637
   HEAP32[1541] = $1054; //@line 6638
   $1055 = HEAP32[1544] | 0; //@line 6639
   $1056 = $1055 + $$0197 | 0; //@line 6640
   HEAP32[1544] = $1056; //@line 6641
   HEAP32[$1056 + 4 >> 2] = $1054 | 1; //@line 6644
   HEAP32[$1055 + 4 >> 2] = $$0197 | 3; //@line 6647
   $$0 = $1055 + 8 | 0; //@line 6649
   STACKTOP = sp; //@line 6650
   return $$0 | 0; //@line 6650
  }
 }
 HEAP32[(___errno_location() | 0) >> 2] = 12; //@line 6654
 $$0 = 0; //@line 6655
 STACKTOP = sp; //@line 6656
 return $$0 | 0; //@line 6656
}
function _equeue_dispatch__async_cb_66($0) {
 $0 = $0 | 0;
 var $$02329$i$i = 0, $$02330$i$i = 0, $$025$i$i = 0, $$03956$i = 0, $$03956$i$phi = 0, $$04055$i = 0, $$0405571$i = 0, $$04063$i = 0, $$04159$i = 0, $$04258$i = 0, $$057$i = 0, $$067 = 0, $$06992 = 0, $$2 = 0, $$expand_i1_val = 0, $$expand_i1_val11 = 0, $$expand_i1_val13 = 0, $$expand_i1_val9 = 0, $$sink$in$i$i = 0, $$sroa$0$i$0$$sroa$0$0$$sroa$0$0$$0$4353$pre$i75 = 0, $$sroa$0$i$0$$sroa$0$0$$sroa$0$0$$0$52$i74 = 0, $10 = 0, $100 = 0, $101 = 0, $102 = 0, $103 = 0, $104 = 0, $105 = 0, $106 = 0, $107 = 0, $108 = 0, $109 = 0, $110 = 0, $111 = 0, $112 = 0, $113 = 0, $114 = 0, $115 = 0, $116 = 0, $117 = 0, $118 = 0, $12 = 0, $127 = 0, $130 = 0, $131 = 0, $132 = 0, $133 = 0, $134 = 0, $135 = 0, $136 = 0, $137 = 0, $138 = 0, $139 = 0, $14 = 0, $140 = 0, $141 = 0, $142 = 0, $143 = 0, $144 = 0, $145 = 0, $146 = 0, $147 = 0, $148 = 0, $149 = 0, $150 = 0, $152 = 0, $153 = 0, $154 = 0, $156 = 0, $157 = 0, $16 = 0, $165 = 0, $166 = 0, $168 = 0, $171 = 0, $173 = 0, $176 = 0, $179 = 0, $18 = 0, $183 = 0, $184 = 0, $185 = 0, $186 = 0, $190 = 0, $193 = 0, $199 = 0, $2 = 0, $20 = 0, $200 = 0, $201 = 0, $202 = 0, $203 = 0, $204 = 0, $205 = 0, $206 = 0, $207 = 0, $208 = 0, $209 = 0, $210 = 0, $211 = 0, $212 = 0, $213 = 0, $214 = 0, $215 = 0, $216 = 0, $217 = 0, $22 = 0, $24 = 0, $26 = 0, $28 = 0, $30 = 0, $32 = 0, $34 = 0, $36 = 0, $4 = 0, $44 = 0, $45 = 0, $48 = 0, $54 = 0, $6 = 0, $63 = 0, $66 = 0, $67 = 0, $69 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $78 = 0, $79 = 0, $8 = 0, $80 = 0, $81 = 0, $82 = 0, $83 = 0, $84 = 0, $85 = 0, $86 = 0, $87 = 0, $88 = 0, $89 = 0, $90 = 0, $91 = 0, $93 = 0, $95 = 0, $98 = 0, $99 = 0, $ReallocAsyncCtx = 0, $ReallocAsyncCtx2 = 0, $ReallocAsyncCtx3 = 0, $ReallocAsyncCtx4 = 0, $ReallocAsyncCtx5 = 0, label = 0, sp = 0, $$04159$i$looptemp = 0, $$04258$i$looptemp = 0;
 sp = STACKTOP; //@line 7750
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 7752
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 7754
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 7756
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 7758
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 7760
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 7762
 $14 = HEAP8[$0 + 28 >> 0] & 1; //@line 7765
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 7767
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 7769
 $20 = HEAP32[$0 + 40 >> 2] | 0; //@line 7771
 $22 = HEAP32[$0 + 44 >> 2] | 0; //@line 7773
 $24 = HEAP32[$0 + 48 >> 2] | 0; //@line 7775
 $26 = HEAP32[$0 + 52 >> 2] | 0; //@line 7777
 $28 = HEAP32[$0 + 56 >> 2] | 0; //@line 7779
 $30 = HEAP32[$0 + 60 >> 2] | 0; //@line 7781
 $32 = HEAP32[$0 + 64 >> 2] | 0; //@line 7783
 $34 = HEAP32[$0 + 68 >> 2] | 0; //@line 7785
 $36 = HEAP32[$0 + 72 >> 2] | 0; //@line 7787
 _equeue_mutex_lock($2); //@line 7788
 HEAP8[$6 >> 0] = (HEAPU8[$6 >> 0] | 0) + 1; //@line 7793
 if (((HEAP32[$8 >> 2] | 0) - $4 | 0) < 1) {
  HEAP32[$8 >> 2] = $4; //@line 7798
 }
 $44 = HEAP32[$24 >> 2] | 0; //@line 7800
 HEAP32[$26 >> 2] = $44; //@line 7801
 $45 = $44; //@line 7802
 L6 : do {
  if (!$44) {
   $$04055$i = $16; //@line 7806
   $54 = $45; //@line 7806
   label = 8; //@line 7807
  } else {
   $$04063$i = $16; //@line 7809
   $48 = $45; //@line 7809
   do {
    if (((HEAP32[$48 + 20 >> 2] | 0) - $4 | 0) >= 1) {
     $$04055$i = $$04063$i; //@line 7816
     $54 = $48; //@line 7816
     label = 8; //@line 7817
     break L6;
    }
    $$04063$i = $48 + 8 | 0; //@line 7820
    $48 = HEAP32[$$04063$i >> 2] | 0; //@line 7821
   } while (($48 | 0) != 0);
   HEAP32[$28 >> 2] = 0; //@line 7829
   $$0405571$i = $$04063$i; //@line 7830
  }
 } while (0);
 if ((label | 0) == 8) {
  HEAP32[$28 >> 2] = $54; //@line 7834
  if (!$54) {
   $$0405571$i = $$04055$i; //@line 7837
  } else {
   HEAP32[$54 + 16 >> 2] = $28; //@line 7840
   $$0405571$i = $$04055$i; //@line 7841
  }
 }
 HEAP32[$$0405571$i >> 2] = 0; //@line 7844
 _equeue_mutex_unlock($2); //@line 7845
 $$sroa$0$i$0$$sroa$0$0$$sroa$0$0$$0$52$i74 = HEAP32[$16 >> 2] | 0; //@line 7846
 L15 : do {
  if (!$$sroa$0$i$0$$sroa$0$0$$sroa$0$0$$0$52$i74) {} else {
   $$04159$i = $$sroa$0$i$0$$sroa$0$0$$sroa$0$0$$0$52$i74; //@line 7851
   $$04258$i = $16; //@line 7851
   do {
    $$04258$i$looptemp = $$04258$i;
    $$04258$i = $$04159$i + 8 | 0; //@line 7853
    $$04159$i$looptemp = $$04159$i;
    $$04159$i = HEAP32[$$04258$i >> 2] | 0; //@line 7854
    $$03956$i = 0; //@line 7855
    $$057$i = $$04159$i$looptemp; //@line 7855
    while (1) {
     HEAP32[$$057$i + 8 >> 2] = $$03956$i; //@line 7858
     $63 = HEAP32[$$057$i + 12 >> 2] | 0; //@line 7860
     if (!$63) {
      break;
     } else {
      $$03956$i$phi = $$057$i; //@line 7865
      $$057$i = $63; //@line 7865
      $$03956$i = $$03956$i$phi; //@line 7865
     }
    }
    HEAP32[$$04258$i$looptemp >> 2] = $$057$i; //@line 7868
   } while (($$04159$i | 0) != 0);
   $$sroa$0$i$0$$sroa$0$0$$sroa$0$0$$0$4353$pre$i75 = HEAP32[$16 >> 2] | 0; //@line 7876
   if ($$sroa$0$i$0$$sroa$0$0$$sroa$0$0$$0$4353$pre$i75 | 0) {
    $$06992 = $$sroa$0$i$0$$sroa$0$0$$sroa$0$0$$0$4353$pre$i75; //@line 7879
    while (1) {
     $66 = $$06992 + 8 | 0; //@line 7881
     $67 = HEAP32[$66 >> 2] | 0; //@line 7882
     $69 = HEAP32[$$06992 + 32 >> 2] | 0; //@line 7884
     if ($69 | 0) {
      label = 17; //@line 7887
      break;
     }
     $93 = HEAP32[$$06992 + 24 >> 2] | 0; //@line 7891
     if (($93 | 0) > -1) {
      label = 21; //@line 7894
      break;
     }
     $117 = $$06992 + 4 | 0; //@line 7898
     $118 = HEAP8[$117 >> 0] | 0; //@line 7899
     HEAP8[$117 >> 0] = (($118 + 1 & 255) << HEAP32[$36 >> 2] | 0) == 0 ? 1 : ($118 & 255) + 1 & 255; //@line 7908
     $127 = HEAP32[$$06992 + 28 >> 2] | 0; //@line 7910
     if ($127 | 0) {
      label = 25; //@line 7913
      break;
     }
     _equeue_mutex_lock($32); //@line 7916
     $150 = HEAP32[$34 >> 2] | 0; //@line 7917
     L28 : do {
      if (!$150) {
       $$02329$i$i = $34; //@line 7921
       label = 34; //@line 7922
      } else {
       $152 = HEAP32[$$06992 >> 2] | 0; //@line 7924
       $$025$i$i = $34; //@line 7925
       $154 = $150; //@line 7925
       while (1) {
        $153 = HEAP32[$154 >> 2] | 0; //@line 7927
        if ($153 >>> 0 >= $152 >>> 0) {
         break;
        }
        $156 = $154 + 8 | 0; //@line 7932
        $157 = HEAP32[$156 >> 2] | 0; //@line 7933
        if (!$157) {
         $$02329$i$i = $156; //@line 7936
         label = 34; //@line 7937
         break L28;
        } else {
         $$025$i$i = $156; //@line 7940
         $154 = $157; //@line 7940
        }
       }
       if (($153 | 0) == ($152 | 0)) {
        HEAP32[$$06992 + 12 >> 2] = $154; //@line 7946
        $$02330$i$i = $$025$i$i; //@line 7949
        $$sink$in$i$i = (HEAP32[$$025$i$i >> 2] | 0) + 8 | 0; //@line 7949
       } else {
        $$02329$i$i = $$025$i$i; //@line 7951
        label = 34; //@line 7952
       }
      }
     } while (0);
     if ((label | 0) == 34) {
      label = 0; //@line 7957
      HEAP32[$$06992 + 12 >> 2] = 0; //@line 7959
      $$02330$i$i = $$02329$i$i; //@line 7960
      $$sink$in$i$i = $$02329$i$i; //@line 7960
     }
     HEAP32[$66 >> 2] = HEAP32[$$sink$in$i$i >> 2]; //@line 7963
     HEAP32[$$02330$i$i >> 2] = $$06992; //@line 7964
     _equeue_mutex_unlock($32); //@line 7965
     if (!$67) {
      break L15;
     } else {
      $$06992 = $67; //@line 7970
     }
    }
    if ((label | 0) == 17) {
     $ReallocAsyncCtx = _emscripten_realloc_async_context(84) | 0; //@line 7975
     FUNCTION_TABLE_vi[$69 & 255]($$06992 + 36 | 0); //@line 7976
     if (___async) {
      HEAP32[$ReallocAsyncCtx >> 2] = 30; //@line 7979
      $72 = $ReallocAsyncCtx + 4 | 0; //@line 7980
      HEAP32[$72 >> 2] = $2; //@line 7981
      $73 = $ReallocAsyncCtx + 8 | 0; //@line 7982
      HEAP32[$73 >> 2] = $6; //@line 7983
      $74 = $ReallocAsyncCtx + 12 | 0; //@line 7984
      HEAP32[$74 >> 2] = $8; //@line 7985
      $75 = $ReallocAsyncCtx + 16 | 0; //@line 7986
      HEAP32[$75 >> 2] = $10; //@line 7987
      $76 = $ReallocAsyncCtx + 20 | 0; //@line 7988
      HEAP32[$76 >> 2] = $12; //@line 7989
      $77 = $ReallocAsyncCtx + 24 | 0; //@line 7990
      $$expand_i1_val = $14 & 1; //@line 7991
      HEAP8[$77 >> 0] = $$expand_i1_val; //@line 7992
      $78 = $ReallocAsyncCtx + 28 | 0; //@line 7993
      HEAP32[$78 >> 2] = $16; //@line 7994
      $79 = $ReallocAsyncCtx + 32 | 0; //@line 7995
      HEAP32[$79 >> 2] = $18; //@line 7996
      $80 = $ReallocAsyncCtx + 36 | 0; //@line 7997
      HEAP32[$80 >> 2] = $20; //@line 7998
      $81 = $ReallocAsyncCtx + 40 | 0; //@line 7999
      HEAP32[$81 >> 2] = $22; //@line 8000
      $82 = $ReallocAsyncCtx + 44 | 0; //@line 8001
      HEAP32[$82 >> 2] = $24; //@line 8002
      $83 = $ReallocAsyncCtx + 48 | 0; //@line 8003
      HEAP32[$83 >> 2] = $26; //@line 8004
      $84 = $ReallocAsyncCtx + 52 | 0; //@line 8005
      HEAP32[$84 >> 2] = $28; //@line 8006
      $85 = $ReallocAsyncCtx + 56 | 0; //@line 8007
      HEAP32[$85 >> 2] = $30; //@line 8008
      $86 = $ReallocAsyncCtx + 60 | 0; //@line 8009
      HEAP32[$86 >> 2] = $$06992; //@line 8010
      $87 = $ReallocAsyncCtx + 64 | 0; //@line 8011
      HEAP32[$87 >> 2] = $67; //@line 8012
      $88 = $ReallocAsyncCtx + 68 | 0; //@line 8013
      HEAP32[$88 >> 2] = $32; //@line 8014
      $89 = $ReallocAsyncCtx + 72 | 0; //@line 8015
      HEAP32[$89 >> 2] = $34; //@line 8016
      $90 = $ReallocAsyncCtx + 76 | 0; //@line 8017
      HEAP32[$90 >> 2] = $36; //@line 8018
      $91 = $ReallocAsyncCtx + 80 | 0; //@line 8019
      HEAP32[$91 >> 2] = $66; //@line 8020
      sp = STACKTOP; //@line 8021
      return;
     }
     ___async_unwind = 0; //@line 8024
     HEAP32[$ReallocAsyncCtx >> 2] = 30; //@line 8025
     $72 = $ReallocAsyncCtx + 4 | 0; //@line 8026
     HEAP32[$72 >> 2] = $2; //@line 8027
     $73 = $ReallocAsyncCtx + 8 | 0; //@line 8028
     HEAP32[$73 >> 2] = $6; //@line 8029
     $74 = $ReallocAsyncCtx + 12 | 0; //@line 8030
     HEAP32[$74 >> 2] = $8; //@line 8031
     $75 = $ReallocAsyncCtx + 16 | 0; //@line 8032
     HEAP32[$75 >> 2] = $10; //@line 8033
     $76 = $ReallocAsyncCtx + 20 | 0; //@line 8034
     HEAP32[$76 >> 2] = $12; //@line 8035
     $77 = $ReallocAsyncCtx + 24 | 0; //@line 8036
     $$expand_i1_val = $14 & 1; //@line 8037
     HEAP8[$77 >> 0] = $$expand_i1_val; //@line 8038
     $78 = $ReallocAsyncCtx + 28 | 0; //@line 8039
     HEAP32[$78 >> 2] = $16; //@line 8040
     $79 = $ReallocAsyncCtx + 32 | 0; //@line 8041
     HEAP32[$79 >> 2] = $18; //@line 8042
     $80 = $ReallocAsyncCtx + 36 | 0; //@line 8043
     HEAP32[$80 >> 2] = $20; //@line 8044
     $81 = $ReallocAsyncCtx + 40 | 0; //@line 8045
     HEAP32[$81 >> 2] = $22; //@line 8046
     $82 = $ReallocAsyncCtx + 44 | 0; //@line 8047
     HEAP32[$82 >> 2] = $24; //@line 8048
     $83 = $ReallocAsyncCtx + 48 | 0; //@line 8049
     HEAP32[$83 >> 2] = $26; //@line 8050
     $84 = $ReallocAsyncCtx + 52 | 0; //@line 8051
     HEAP32[$84 >> 2] = $28; //@line 8052
     $85 = $ReallocAsyncCtx + 56 | 0; //@line 8053
     HEAP32[$85 >> 2] = $30; //@line 8054
     $86 = $ReallocAsyncCtx + 60 | 0; //@line 8055
     HEAP32[$86 >> 2] = $$06992; //@line 8056
     $87 = $ReallocAsyncCtx + 64 | 0; //@line 8057
     HEAP32[$87 >> 2] = $67; //@line 8058
     $88 = $ReallocAsyncCtx + 68 | 0; //@line 8059
     HEAP32[$88 >> 2] = $32; //@line 8060
     $89 = $ReallocAsyncCtx + 72 | 0; //@line 8061
     HEAP32[$89 >> 2] = $34; //@line 8062
     $90 = $ReallocAsyncCtx + 76 | 0; //@line 8063
     HEAP32[$90 >> 2] = $36; //@line 8064
     $91 = $ReallocAsyncCtx + 80 | 0; //@line 8065
     HEAP32[$91 >> 2] = $66; //@line 8066
     sp = STACKTOP; //@line 8067
     return;
    } else if ((label | 0) == 21) {
     $95 = $$06992 + 20 | 0; //@line 8071
     HEAP32[$95 >> 2] = (HEAP32[$95 >> 2] | 0) + $93; //@line 8074
     $98 = _equeue_tick() | 0; //@line 8075
     $ReallocAsyncCtx4 = _emscripten_realloc_async_context(76) | 0; //@line 8076
     _equeue_enqueue($10, $$06992, $98) | 0; //@line 8077
     if (___async) {
      HEAP32[$ReallocAsyncCtx4 >> 2] = 31; //@line 8080
      $99 = $ReallocAsyncCtx4 + 4 | 0; //@line 8081
      HEAP32[$99 >> 2] = $2; //@line 8082
      $100 = $ReallocAsyncCtx4 + 8 | 0; //@line 8083
      HEAP32[$100 >> 2] = $6; //@line 8084
      $101 = $ReallocAsyncCtx4 + 12 | 0; //@line 8085
      HEAP32[$101 >> 2] = $8; //@line 8086
      $102 = $ReallocAsyncCtx4 + 16 | 0; //@line 8087
      HEAP32[$102 >> 2] = $10; //@line 8088
      $103 = $ReallocAsyncCtx4 + 20 | 0; //@line 8089
      HEAP32[$103 >> 2] = $12; //@line 8090
      $104 = $ReallocAsyncCtx4 + 24 | 0; //@line 8091
      $$expand_i1_val9 = $14 & 1; //@line 8092
      HEAP8[$104 >> 0] = $$expand_i1_val9; //@line 8093
      $105 = $ReallocAsyncCtx4 + 28 | 0; //@line 8094
      HEAP32[$105 >> 2] = $16; //@line 8095
      $106 = $ReallocAsyncCtx4 + 32 | 0; //@line 8096
      HEAP32[$106 >> 2] = $18; //@line 8097
      $107 = $ReallocAsyncCtx4 + 36 | 0; //@line 8098
      HEAP32[$107 >> 2] = $20; //@line 8099
      $108 = $ReallocAsyncCtx4 + 40 | 0; //@line 8100
      HEAP32[$108 >> 2] = $22; //@line 8101
      $109 = $ReallocAsyncCtx4 + 44 | 0; //@line 8102
      HEAP32[$109 >> 2] = $24; //@line 8103
      $110 = $ReallocAsyncCtx4 + 48 | 0; //@line 8104
      HEAP32[$110 >> 2] = $26; //@line 8105
      $111 = $ReallocAsyncCtx4 + 52 | 0; //@line 8106
      HEAP32[$111 >> 2] = $28; //@line 8107
      $112 = $ReallocAsyncCtx4 + 56 | 0; //@line 8108
      HEAP32[$112 >> 2] = $30; //@line 8109
      $113 = $ReallocAsyncCtx4 + 60 | 0; //@line 8110
      HEAP32[$113 >> 2] = $32; //@line 8111
      $114 = $ReallocAsyncCtx4 + 64 | 0; //@line 8112
      HEAP32[$114 >> 2] = $34; //@line 8113
      $115 = $ReallocAsyncCtx4 + 68 | 0; //@line 8114
      HEAP32[$115 >> 2] = $36; //@line 8115
      $116 = $ReallocAsyncCtx4 + 72 | 0; //@line 8116
      HEAP32[$116 >> 2] = $67; //@line 8117
      sp = STACKTOP; //@line 8118
      return;
     }
     ___async_unwind = 0; //@line 8121
     HEAP32[$ReallocAsyncCtx4 >> 2] = 31; //@line 8122
     $99 = $ReallocAsyncCtx4 + 4 | 0; //@line 8123
     HEAP32[$99 >> 2] = $2; //@line 8124
     $100 = $ReallocAsyncCtx4 + 8 | 0; //@line 8125
     HEAP32[$100 >> 2] = $6; //@line 8126
     $101 = $ReallocAsyncCtx4 + 12 | 0; //@line 8127
     HEAP32[$101 >> 2] = $8; //@line 8128
     $102 = $ReallocAsyncCtx4 + 16 | 0; //@line 8129
     HEAP32[$102 >> 2] = $10; //@line 8130
     $103 = $ReallocAsyncCtx4 + 20 | 0; //@line 8131
     HEAP32[$103 >> 2] = $12; //@line 8132
     $104 = $ReallocAsyncCtx4 + 24 | 0; //@line 8133
     $$expand_i1_val9 = $14 & 1; //@line 8134
     HEAP8[$104 >> 0] = $$expand_i1_val9; //@line 8135
     $105 = $ReallocAsyncCtx4 + 28 | 0; //@line 8136
     HEAP32[$105 >> 2] = $16; //@line 8137
     $106 = $ReallocAsyncCtx4 + 32 | 0; //@line 8138
     HEAP32[$106 >> 2] = $18; //@line 8139
     $107 = $ReallocAsyncCtx4 + 36 | 0; //@line 8140
     HEAP32[$107 >> 2] = $20; //@line 8141
     $108 = $ReallocAsyncCtx4 + 40 | 0; //@line 8142
     HEAP32[$108 >> 2] = $22; //@line 8143
     $109 = $ReallocAsyncCtx4 + 44 | 0; //@line 8144
     HEAP32[$109 >> 2] = $24; //@line 8145
     $110 = $ReallocAsyncCtx4 + 48 | 0; //@line 8146
     HEAP32[$110 >> 2] = $26; //@line 8147
     $111 = $ReallocAsyncCtx4 + 52 | 0; //@line 8148
     HEAP32[$111 >> 2] = $28; //@line 8149
     $112 = $ReallocAsyncCtx4 + 56 | 0; //@line 8150
     HEAP32[$112 >> 2] = $30; //@line 8151
     $113 = $ReallocAsyncCtx4 + 60 | 0; //@line 8152
     HEAP32[$113 >> 2] = $32; //@line 8153
     $114 = $ReallocAsyncCtx4 + 64 | 0; //@line 8154
     HEAP32[$114 >> 2] = $34; //@line 8155
     $115 = $ReallocAsyncCtx4 + 68 | 0; //@line 8156
     HEAP32[$115 >> 2] = $36; //@line 8157
     $116 = $ReallocAsyncCtx4 + 72 | 0; //@line 8158
     HEAP32[$116 >> 2] = $67; //@line 8159
     sp = STACKTOP; //@line 8160
     return;
    } else if ((label | 0) == 25) {
     $ReallocAsyncCtx2 = _emscripten_realloc_async_context(84) | 0; //@line 8165
     FUNCTION_TABLE_vi[$127 & 255]($$06992 + 36 | 0); //@line 8166
     if (___async) {
      HEAP32[$ReallocAsyncCtx2 >> 2] = 32; //@line 8169
      $130 = $ReallocAsyncCtx2 + 4 | 0; //@line 8170
      HEAP32[$130 >> 2] = $2; //@line 8171
      $131 = $ReallocAsyncCtx2 + 8 | 0; //@line 8172
      HEAP32[$131 >> 2] = $6; //@line 8173
      $132 = $ReallocAsyncCtx2 + 12 | 0; //@line 8174
      HEAP32[$132 >> 2] = $8; //@line 8175
      $133 = $ReallocAsyncCtx2 + 16 | 0; //@line 8176
      HEAP32[$133 >> 2] = $10; //@line 8177
      $134 = $ReallocAsyncCtx2 + 20 | 0; //@line 8178
      HEAP32[$134 >> 2] = $12; //@line 8179
      $135 = $ReallocAsyncCtx2 + 24 | 0; //@line 8180
      $$expand_i1_val11 = $14 & 1; //@line 8181
      HEAP8[$135 >> 0] = $$expand_i1_val11; //@line 8182
      $136 = $ReallocAsyncCtx2 + 28 | 0; //@line 8183
      HEAP32[$136 >> 2] = $16; //@line 8184
      $137 = $ReallocAsyncCtx2 + 32 | 0; //@line 8185
      HEAP32[$137 >> 2] = $18; //@line 8186
      $138 = $ReallocAsyncCtx2 + 36 | 0; //@line 8187
      HEAP32[$138 >> 2] = $20; //@line 8188
      $139 = $ReallocAsyncCtx2 + 40 | 0; //@line 8189
      HEAP32[$139 >> 2] = $22; //@line 8190
      $140 = $ReallocAsyncCtx2 + 44 | 0; //@line 8191
      HEAP32[$140 >> 2] = $24; //@line 8192
      $141 = $ReallocAsyncCtx2 + 48 | 0; //@line 8193
      HEAP32[$141 >> 2] = $26; //@line 8194
      $142 = $ReallocAsyncCtx2 + 52 | 0; //@line 8195
      HEAP32[$142 >> 2] = $28; //@line 8196
      $143 = $ReallocAsyncCtx2 + 56 | 0; //@line 8197
      HEAP32[$143 >> 2] = $30; //@line 8198
      $144 = $ReallocAsyncCtx2 + 60 | 0; //@line 8199
      HEAP32[$144 >> 2] = $67; //@line 8200
      $145 = $ReallocAsyncCtx2 + 64 | 0; //@line 8201
      HEAP32[$145 >> 2] = $32; //@line 8202
      $146 = $ReallocAsyncCtx2 + 68 | 0; //@line 8203
      HEAP32[$146 >> 2] = $34; //@line 8204
      $147 = $ReallocAsyncCtx2 + 72 | 0; //@line 8205
      HEAP32[$147 >> 2] = $36; //@line 8206
      $148 = $ReallocAsyncCtx2 + 76 | 0; //@line 8207
      HEAP32[$148 >> 2] = $$06992; //@line 8208
      $149 = $ReallocAsyncCtx2 + 80 | 0; //@line 8209
      HEAP32[$149 >> 2] = $66; //@line 8210
      sp = STACKTOP; //@line 8211
      return;
     }
     ___async_unwind = 0; //@line 8214
     HEAP32[$ReallocAsyncCtx2 >> 2] = 32; //@line 8215
     $130 = $ReallocAsyncCtx2 + 4 | 0; //@line 8216
     HEAP32[$130 >> 2] = $2; //@line 8217
     $131 = $ReallocAsyncCtx2 + 8 | 0; //@line 8218
     HEAP32[$131 >> 2] = $6; //@line 8219
     $132 = $ReallocAsyncCtx2 + 12 | 0; //@line 8220
     HEAP32[$132 >> 2] = $8; //@line 8221
     $133 = $ReallocAsyncCtx2 + 16 | 0; //@line 8222
     HEAP32[$133 >> 2] = $10; //@line 8223
     $134 = $ReallocAsyncCtx2 + 20 | 0; //@line 8224
     HEAP32[$134 >> 2] = $12; //@line 8225
     $135 = $ReallocAsyncCtx2 + 24 | 0; //@line 8226
     $$expand_i1_val11 = $14 & 1; //@line 8227
     HEAP8[$135 >> 0] = $$expand_i1_val11; //@line 8228
     $136 = $ReallocAsyncCtx2 + 28 | 0; //@line 8229
     HEAP32[$136 >> 2] = $16; //@line 8230
     $137 = $ReallocAsyncCtx2 + 32 | 0; //@line 8231
     HEAP32[$137 >> 2] = $18; //@line 8232
     $138 = $ReallocAsyncCtx2 + 36 | 0; //@line 8233
     HEAP32[$138 >> 2] = $20; //@line 8234
     $139 = $ReallocAsyncCtx2 + 40 | 0; //@line 8235
     HEAP32[$139 >> 2] = $22; //@line 8236
     $140 = $ReallocAsyncCtx2 + 44 | 0; //@line 8237
     HEAP32[$140 >> 2] = $24; //@line 8238
     $141 = $ReallocAsyncCtx2 + 48 | 0; //@line 8239
     HEAP32[$141 >> 2] = $26; //@line 8240
     $142 = $ReallocAsyncCtx2 + 52 | 0; //@line 8241
     HEAP32[$142 >> 2] = $28; //@line 8242
     $143 = $ReallocAsyncCtx2 + 56 | 0; //@line 8243
     HEAP32[$143 >> 2] = $30; //@line 8244
     $144 = $ReallocAsyncCtx2 + 60 | 0; //@line 8245
     HEAP32[$144 >> 2] = $67; //@line 8246
     $145 = $ReallocAsyncCtx2 + 64 | 0; //@line 8247
     HEAP32[$145 >> 2] = $32; //@line 8248
     $146 = $ReallocAsyncCtx2 + 68 | 0; //@line 8249
     HEAP32[$146 >> 2] = $34; //@line 8250
     $147 = $ReallocAsyncCtx2 + 72 | 0; //@line 8251
     HEAP32[$147 >> 2] = $36; //@line 8252
     $148 = $ReallocAsyncCtx2 + 76 | 0; //@line 8253
     HEAP32[$148 >> 2] = $$06992; //@line 8254
     $149 = $ReallocAsyncCtx2 + 80 | 0; //@line 8255
     HEAP32[$149 >> 2] = $66; //@line 8256
     sp = STACKTOP; //@line 8257
     return;
    }
   }
  }
 } while (0);
 $165 = _equeue_tick() | 0; //@line 8263
 if ($14) {
  $166 = $12 - $165 | 0; //@line 8265
  if (($166 | 0) < 1) {
   $168 = $10 + 40 | 0; //@line 8268
   if (HEAP32[$168 >> 2] | 0) {
    _equeue_mutex_lock($2); //@line 8272
    $171 = HEAP32[$168 >> 2] | 0; //@line 8273
    if ($171 | 0) {
     $173 = HEAP32[$28 >> 2] | 0; //@line 8276
     if ($173 | 0) {
      $176 = HEAP32[$10 + 44 >> 2] | 0; //@line 8280
      $179 = (HEAP32[$173 + 20 >> 2] | 0) - $165 | 0; //@line 8283
      $ReallocAsyncCtx3 = _emscripten_realloc_async_context(16) | 0; //@line 8287
      FUNCTION_TABLE_vii[$171 & 3]($176, $179 & ~($179 >> 31)); //@line 8288
      if (___async) {
       HEAP32[$ReallocAsyncCtx3 >> 2] = 33; //@line 8291
       $183 = $ReallocAsyncCtx3 + 4 | 0; //@line 8292
       HEAP32[$183 >> 2] = $20; //@line 8293
       $184 = $ReallocAsyncCtx3 + 8 | 0; //@line 8294
       HEAP32[$184 >> 2] = $2; //@line 8295
       $185 = $ReallocAsyncCtx3 + 12 | 0; //@line 8296
       HEAP32[$185 >> 2] = $18; //@line 8297
       sp = STACKTOP; //@line 8298
       return;
      }
      ___async_unwind = 0; //@line 8301
      HEAP32[$ReallocAsyncCtx3 >> 2] = 33; //@line 8302
      $183 = $ReallocAsyncCtx3 + 4 | 0; //@line 8303
      HEAP32[$183 >> 2] = $20; //@line 8304
      $184 = $ReallocAsyncCtx3 + 8 | 0; //@line 8305
      HEAP32[$184 >> 2] = $2; //@line 8306
      $185 = $ReallocAsyncCtx3 + 12 | 0; //@line 8307
      HEAP32[$185 >> 2] = $18; //@line 8308
      sp = STACKTOP; //@line 8309
      return;
     }
    }
    HEAP8[$20 >> 0] = 1; //@line 8313
    _equeue_mutex_unlock($2); //@line 8314
   }
   HEAP8[$18 >> 0] = 0; //@line 8316
   return;
  } else {
   $$067 = $166; //@line 8319
  }
 } else {
  $$067 = -1; //@line 8322
 }
 _equeue_mutex_lock($2); //@line 8324
 $186 = HEAP32[$28 >> 2] | 0; //@line 8325
 if (!$186) {
  $$2 = $$067; //@line 8328
 } else {
  $190 = (HEAP32[$186 + 20 >> 2] | 0) - $165 | 0; //@line 8332
  $193 = $190 & ~($190 >> 31); //@line 8335
  $$2 = $193 >>> 0 < $$067 >>> 0 ? $193 : $$067; //@line 8338
 }
 _equeue_mutex_unlock($2); //@line 8340
 _equeue_sema_wait($30, $$2) | 0; //@line 8341
 do {
  if (HEAP8[$18 >> 0] | 0) {
   _equeue_mutex_lock($2); //@line 8346
   if (!(HEAP8[$18 >> 0] | 0)) {
    _equeue_mutex_unlock($2); //@line 8350
    break;
   }
   HEAP8[$18 >> 0] = 0; //@line 8353
   _equeue_mutex_unlock($2); //@line 8354
   return;
  }
 } while (0);
 $199 = _equeue_tick() | 0; //@line 8358
 $ReallocAsyncCtx5 = _emscripten_realloc_async_context(76) | 0; //@line 8359
 _wait_ms(20); //@line 8360
 if (___async) {
  HEAP32[$ReallocAsyncCtx5 >> 2] = 34; //@line 8363
  $200 = $ReallocAsyncCtx5 + 4 | 0; //@line 8364
  HEAP32[$200 >> 2] = $2; //@line 8365
  $201 = $ReallocAsyncCtx5 + 8 | 0; //@line 8366
  HEAP32[$201 >> 2] = $199; //@line 8367
  $202 = $ReallocAsyncCtx5 + 12 | 0; //@line 8368
  HEAP32[$202 >> 2] = $6; //@line 8369
  $203 = $ReallocAsyncCtx5 + 16 | 0; //@line 8370
  HEAP32[$203 >> 2] = $8; //@line 8371
  $204 = $ReallocAsyncCtx5 + 20 | 0; //@line 8372
  HEAP32[$204 >> 2] = $10; //@line 8373
  $205 = $ReallocAsyncCtx5 + 24 | 0; //@line 8374
  HEAP32[$205 >> 2] = $12; //@line 8375
  $206 = $ReallocAsyncCtx5 + 28 | 0; //@line 8376
  $$expand_i1_val13 = $14 & 1; //@line 8377
  HEAP8[$206 >> 0] = $$expand_i1_val13; //@line 8378
  $207 = $ReallocAsyncCtx5 + 32 | 0; //@line 8379
  HEAP32[$207 >> 2] = $16; //@line 8380
  $208 = $ReallocAsyncCtx5 + 36 | 0; //@line 8381
  HEAP32[$208 >> 2] = $18; //@line 8382
  $209 = $ReallocAsyncCtx5 + 40 | 0; //@line 8383
  HEAP32[$209 >> 2] = $20; //@line 8384
  $210 = $ReallocAsyncCtx5 + 44 | 0; //@line 8385
  HEAP32[$210 >> 2] = $22; //@line 8386
  $211 = $ReallocAsyncCtx5 + 48 | 0; //@line 8387
  HEAP32[$211 >> 2] = $24; //@line 8388
  $212 = $ReallocAsyncCtx5 + 52 | 0; //@line 8389
  HEAP32[$212 >> 2] = $26; //@line 8390
  $213 = $ReallocAsyncCtx5 + 56 | 0; //@line 8391
  HEAP32[$213 >> 2] = $28; //@line 8392
  $214 = $ReallocAsyncCtx5 + 60 | 0; //@line 8393
  HEAP32[$214 >> 2] = $30; //@line 8394
  $215 = $ReallocAsyncCtx5 + 64 | 0; //@line 8395
  HEAP32[$215 >> 2] = $32; //@line 8396
  $216 = $ReallocAsyncCtx5 + 68 | 0; //@line 8397
  HEAP32[$216 >> 2] = $34; //@line 8398
  $217 = $ReallocAsyncCtx5 + 72 | 0; //@line 8399
  HEAP32[$217 >> 2] = $36; //@line 8400
  sp = STACKTOP; //@line 8401
  return;
 }
 ___async_unwind = 0; //@line 8404
 HEAP32[$ReallocAsyncCtx5 >> 2] = 34; //@line 8405
 $200 = $ReallocAsyncCtx5 + 4 | 0; //@line 8406
 HEAP32[$200 >> 2] = $2; //@line 8407
 $201 = $ReallocAsyncCtx5 + 8 | 0; //@line 8408
 HEAP32[$201 >> 2] = $199; //@line 8409
 $202 = $ReallocAsyncCtx5 + 12 | 0; //@line 8410
 HEAP32[$202 >> 2] = $6; //@line 8411
 $203 = $ReallocAsyncCtx5 + 16 | 0; //@line 8412
 HEAP32[$203 >> 2] = $8; //@line 8413
 $204 = $ReallocAsyncCtx5 + 20 | 0; //@line 8414
 HEAP32[$204 >> 2] = $10; //@line 8415
 $205 = $ReallocAsyncCtx5 + 24 | 0; //@line 8416
 HEAP32[$205 >> 2] = $12; //@line 8417
 $206 = $ReallocAsyncCtx5 + 28 | 0; //@line 8418
 $$expand_i1_val13 = $14 & 1; //@line 8419
 HEAP8[$206 >> 0] = $$expand_i1_val13; //@line 8420
 $207 = $ReallocAsyncCtx5 + 32 | 0; //@line 8421
 HEAP32[$207 >> 2] = $16; //@line 8422
 $208 = $ReallocAsyncCtx5 + 36 | 0; //@line 8423
 HEAP32[$208 >> 2] = $18; //@line 8424
 $209 = $ReallocAsyncCtx5 + 40 | 0; //@line 8425
 HEAP32[$209 >> 2] = $20; //@line 8426
 $210 = $ReallocAsyncCtx5 + 44 | 0; //@line 8427
 HEAP32[$210 >> 2] = $22; //@line 8428
 $211 = $ReallocAsyncCtx5 + 48 | 0; //@line 8429
 HEAP32[$211 >> 2] = $24; //@line 8430
 $212 = $ReallocAsyncCtx5 + 52 | 0; //@line 8431
 HEAP32[$212 >> 2] = $26; //@line 8432
 $213 = $ReallocAsyncCtx5 + 56 | 0; //@line 8433
 HEAP32[$213 >> 2] = $28; //@line 8434
 $214 = $ReallocAsyncCtx5 + 60 | 0; //@line 8435
 HEAP32[$214 >> 2] = $30; //@line 8436
 $215 = $ReallocAsyncCtx5 + 64 | 0; //@line 8437
 HEAP32[$215 >> 2] = $32; //@line 8438
 $216 = $ReallocAsyncCtx5 + 68 | 0; //@line 8439
 HEAP32[$216 >> 2] = $34; //@line 8440
 $217 = $ReallocAsyncCtx5 + 72 | 0; //@line 8441
 HEAP32[$217 >> 2] = $36; //@line 8442
 sp = STACKTOP; //@line 8443
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
 sp = STACKTOP; //@line 10378
 STACKTOP = STACKTOP + 560 | 0; //@line 10379
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(560); //@line 10379
 $6 = sp + 8 | 0; //@line 10380
 $7 = sp; //@line 10381
 $8 = sp + 524 | 0; //@line 10382
 $9 = $8; //@line 10383
 $10 = sp + 512 | 0; //@line 10384
 HEAP32[$7 >> 2] = 0; //@line 10385
 $11 = $10 + 12 | 0; //@line 10386
 ___DOUBLE_BITS_677($1) | 0; //@line 10387
 if ((tempRet0 | 0) < 0) {
  $$0471 = -$1; //@line 10392
  $$0520 = 1; //@line 10392
  $$0521 = 3294; //@line 10392
 } else {
  $$0471 = $1; //@line 10403
  $$0520 = ($4 & 2049 | 0) != 0 & 1; //@line 10403
  $$0521 = ($4 & 2048 | 0) == 0 ? ($4 & 1 | 0) == 0 ? 3295 : 3300 : 3297; //@line 10403
 }
 ___DOUBLE_BITS_677($$0471) | 0; //@line 10405
 do {
  if (0 == 0 & (tempRet0 & 2146435072 | 0) == 2146435072) {
   $27 = ($5 & 32 | 0) != 0; //@line 10414
   $31 = $$0520 + 3 | 0; //@line 10419
   _pad_676($0, 32, $2, $31, $4 & -65537); //@line 10421
   _out_670($0, $$0521, $$0520); //@line 10422
   _out_670($0, $$0471 != $$0471 | 0.0 != 0.0 ? $27 ? 3321 : 3325 : $27 ? 3313 : 3317, 3); //@line 10423
   _pad_676($0, 32, $2, $31, $4 ^ 8192); //@line 10425
   $$sink560 = $31; //@line 10426
  } else {
   $35 = +_frexpl($$0471, $7) * 2.0; //@line 10429
   $36 = $35 != 0.0; //@line 10430
   if ($36) {
    HEAP32[$7 >> 2] = (HEAP32[$7 >> 2] | 0) + -1; //@line 10434
   }
   $39 = $5 | 32; //@line 10436
   if (($39 | 0) == 97) {
    $41 = $5 & 32; //@line 10439
    $$0521$ = ($41 | 0) == 0 ? $$0521 : $$0521 + 9 | 0; //@line 10442
    $44 = $$0520 | 2; //@line 10443
    $46 = 12 - $3 | 0; //@line 10445
    do {
     if ($3 >>> 0 > 11 | ($46 | 0) == 0) {
      $$1472 = $35; //@line 10450
     } else {
      $$0509585 = 8.0; //@line 10452
      $$1508586 = $46; //@line 10452
      do {
       $$1508586 = $$1508586 + -1 | 0; //@line 10454
       $$0509585 = $$0509585 * 16.0; //@line 10455
      } while (($$1508586 | 0) != 0);
      if ((HEAP8[$$0521$ >> 0] | 0) == 45) {
       $$1472 = -($$0509585 + (-$35 - $$0509585)); //@line 10470
       break;
      } else {
       $$1472 = $35 + $$0509585 - $$0509585; //@line 10475
       break;
      }
     }
    } while (0);
    $60 = HEAP32[$7 >> 2] | 0; //@line 10480
    $63 = ($60 | 0) < 0 ? 0 - $60 | 0 : $60; //@line 10483
    $66 = _fmt_u($63, (($63 | 0) < 0) << 31 >> 31, $11) | 0; //@line 10486
    if (($66 | 0) == ($11 | 0)) {
     $68 = $10 + 11 | 0; //@line 10489
     HEAP8[$68 >> 0] = 48; //@line 10490
     $$0511 = $68; //@line 10491
    } else {
     $$0511 = $66; //@line 10493
    }
    HEAP8[$$0511 + -1 >> 0] = ($60 >> 31 & 2) + 43; //@line 10500
    $76 = $$0511 + -2 | 0; //@line 10503
    HEAP8[$76 >> 0] = $5 + 15; //@line 10504
    $77 = ($3 | 0) < 1; //@line 10505
    $79 = ($4 & 8 | 0) == 0; //@line 10507
    $$0523 = $8; //@line 10508
    $$2473 = $$1472; //@line 10508
    while (1) {
     $80 = ~~$$2473; //@line 10510
     $86 = $$0523 + 1 | 0; //@line 10516
     HEAP8[$$0523 >> 0] = $41 | HEAPU8[3329 + $80 >> 0]; //@line 10517
     $$2473 = ($$2473 - +($80 | 0)) * 16.0; //@line 10520
     if (($86 - $9 | 0) == 1) {
      if ($79 & ($77 & $$2473 == 0.0)) {
       $$1524 = $86; //@line 10529
      } else {
       HEAP8[$86 >> 0] = 46; //@line 10532
       $$1524 = $$0523 + 2 | 0; //@line 10533
      }
     } else {
      $$1524 = $86; //@line 10536
     }
     if (!($$2473 != 0.0)) {
      break;
     } else {
      $$0523 = $$1524; //@line 10540
     }
    }
    $$pre693 = $$1524; //@line 10546
    if (!$3) {
     label = 24; //@line 10548
    } else {
     if ((-2 - $9 + $$pre693 | 0) < ($3 | 0)) {
      $$pre$phi691Z2D = $$pre693 - $9 | 0; //@line 10556
      $$sink = $3 + 2 | 0; //@line 10556
     } else {
      label = 24; //@line 10558
     }
    }
    if ((label | 0) == 24) {
     $101 = $$pre693 - $9 | 0; //@line 10562
     $$pre$phi691Z2D = $101; //@line 10563
     $$sink = $101; //@line 10563
    }
    $104 = $11 - $76 | 0; //@line 10567
    $106 = $104 + $44 + $$sink | 0; //@line 10569
    _pad_676($0, 32, $2, $106, $4); //@line 10570
    _out_670($0, $$0521$, $44); //@line 10571
    _pad_676($0, 48, $2, $106, $4 ^ 65536); //@line 10573
    _out_670($0, $8, $$pre$phi691Z2D); //@line 10574
    _pad_676($0, 48, $$sink - $$pre$phi691Z2D | 0, 0, 0); //@line 10576
    _out_670($0, $76, $104); //@line 10577
    _pad_676($0, 32, $2, $106, $4 ^ 8192); //@line 10579
    $$sink560 = $106; //@line 10580
    break;
   }
   $$540 = ($3 | 0) < 0 ? 6 : $3; //@line 10584
   if ($36) {
    $113 = (HEAP32[$7 >> 2] | 0) + -28 | 0; //@line 10588
    HEAP32[$7 >> 2] = $113; //@line 10589
    $$3 = $35 * 268435456.0; //@line 10590
    $$pr = $113; //@line 10590
   } else {
    $$3 = $35; //@line 10593
    $$pr = HEAP32[$7 >> 2] | 0; //@line 10593
   }
   $$561 = ($$pr | 0) < 0 ? $6 : $6 + 288 | 0; //@line 10597
   $$0498 = $$561; //@line 10598
   $$4 = $$3; //@line 10598
   do {
    $116 = ~~$$4 >>> 0; //@line 10600
    HEAP32[$$0498 >> 2] = $116; //@line 10601
    $$0498 = $$0498 + 4 | 0; //@line 10602
    $$4 = ($$4 - +($116 >>> 0)) * 1.0e9; //@line 10605
   } while ($$4 != 0.0);
   if (($$pr | 0) > 0) {
    $$1482663 = $$561; //@line 10615
    $$1499662 = $$0498; //@line 10615
    $124 = $$pr; //@line 10615
    while (1) {
     $125 = ($124 | 0) < 29 ? $124 : 29; //@line 10618
     $$0488655 = $$1499662 + -4 | 0; //@line 10619
     if ($$0488655 >>> 0 < $$1482663 >>> 0) {
      $$2483$ph = $$1482663; //@line 10622
     } else {
      $$0488657 = $$0488655; //@line 10624
      $$0497656 = 0; //@line 10624
      do {
       $128 = _bitshift64Shl(HEAP32[$$0488657 >> 2] | 0, 0, $125 | 0) | 0; //@line 10627
       $130 = _i64Add($128 | 0, tempRet0 | 0, $$0497656 | 0, 0) | 0; //@line 10629
       $131 = tempRet0; //@line 10630
       $132 = ___uremdi3($130 | 0, $131 | 0, 1e9, 0) | 0; //@line 10631
       HEAP32[$$0488657 >> 2] = $132; //@line 10633
       $$0497656 = ___udivdi3($130 | 0, $131 | 0, 1e9, 0) | 0; //@line 10634
       $$0488657 = $$0488657 + -4 | 0; //@line 10636
      } while ($$0488657 >>> 0 >= $$1482663 >>> 0);
      if (!$$0497656) {
       $$2483$ph = $$1482663; //@line 10646
      } else {
       $138 = $$1482663 + -4 | 0; //@line 10648
       HEAP32[$138 >> 2] = $$0497656; //@line 10649
       $$2483$ph = $138; //@line 10650
      }
     }
     $$2500 = $$1499662; //@line 10653
     while (1) {
      if ($$2500 >>> 0 <= $$2483$ph >>> 0) {
       break;
      }
      $140 = $$2500 + -4 | 0; //@line 10659
      if (!(HEAP32[$140 >> 2] | 0)) {
       $$2500 = $140; //@line 10663
      } else {
       break;
      }
     }
     $144 = (HEAP32[$7 >> 2] | 0) - $125 | 0; //@line 10669
     HEAP32[$7 >> 2] = $144; //@line 10670
     if (($144 | 0) > 0) {
      $$1482663 = $$2483$ph; //@line 10673
      $$1499662 = $$2500; //@line 10673
      $124 = $144; //@line 10673
     } else {
      $$1482$lcssa = $$2483$ph; //@line 10675
      $$1499$lcssa = $$2500; //@line 10675
      $$pr566 = $144; //@line 10675
      break;
     }
    }
   } else {
    $$1482$lcssa = $$561; //@line 10680
    $$1499$lcssa = $$0498; //@line 10680
    $$pr566 = $$pr; //@line 10680
   }
   if (($$pr566 | 0) < 0) {
    $149 = (($$540 + 25 | 0) / 9 | 0) + 1 | 0; //@line 10686
    $150 = ($39 | 0) == 102; //@line 10687
    $$3484650 = $$1482$lcssa; //@line 10688
    $$3501649 = $$1499$lcssa; //@line 10688
    $152 = $$pr566; //@line 10688
    while (1) {
     $151 = 0 - $152 | 0; //@line 10690
     $154 = ($151 | 0) < 9 ? $151 : 9; //@line 10692
     if ($$3484650 >>> 0 < $$3501649 >>> 0) {
      $160 = (1 << $154) + -1 | 0; //@line 10696
      $161 = 1e9 >>> $154; //@line 10697
      $$0487644 = 0; //@line 10698
      $$1489643 = $$3484650; //@line 10698
      do {
       $162 = HEAP32[$$1489643 >> 2] | 0; //@line 10700
       HEAP32[$$1489643 >> 2] = ($162 >>> $154) + $$0487644; //@line 10704
       $$0487644 = Math_imul($162 & $160, $161) | 0; //@line 10705
       $$1489643 = $$1489643 + 4 | 0; //@line 10706
      } while ($$1489643 >>> 0 < $$3501649 >>> 0);
      $$$3484 = (HEAP32[$$3484650 >> 2] | 0) == 0 ? $$3484650 + 4 | 0 : $$3484650; //@line 10717
      if (!$$0487644) {
       $$$3484700 = $$$3484; //@line 10720
       $$4502 = $$3501649; //@line 10720
      } else {
       HEAP32[$$3501649 >> 2] = $$0487644; //@line 10723
       $$$3484700 = $$$3484; //@line 10724
       $$4502 = $$3501649 + 4 | 0; //@line 10724
      }
     } else {
      $$$3484700 = (HEAP32[$$3484650 >> 2] | 0) == 0 ? $$3484650 + 4 | 0 : $$3484650; //@line 10731
      $$4502 = $$3501649; //@line 10731
     }
     $174 = $150 ? $$561 : $$$3484700; //@line 10733
     $$$4502 = ($$4502 - $174 >> 2 | 0) > ($149 | 0) ? $174 + ($149 << 2) | 0 : $$4502; //@line 10740
     $152 = (HEAP32[$7 >> 2] | 0) + $154 | 0; //@line 10742
     HEAP32[$7 >> 2] = $152; //@line 10743
     if (($152 | 0) >= 0) {
      $$3484$lcssa = $$$3484700; //@line 10748
      $$3501$lcssa = $$$4502; //@line 10748
      break;
     } else {
      $$3484650 = $$$3484700; //@line 10746
      $$3501649 = $$$4502; //@line 10746
     }
    }
   } else {
    $$3484$lcssa = $$1482$lcssa; //@line 10753
    $$3501$lcssa = $$1499$lcssa; //@line 10753
   }
   $185 = $$561; //@line 10756
   if ($$3484$lcssa >>> 0 < $$3501$lcssa >>> 0) {
    $189 = ($185 - $$3484$lcssa >> 2) * 9 | 0; //@line 10761
    $190 = HEAP32[$$3484$lcssa >> 2] | 0; //@line 10762
    if ($190 >>> 0 < 10) {
     $$1515 = $189; //@line 10765
    } else {
     $$0514639 = $189; //@line 10767
     $$0530638 = 10; //@line 10767
     while (1) {
      $$0530638 = $$0530638 * 10 | 0; //@line 10769
      $193 = $$0514639 + 1 | 0; //@line 10770
      if ($190 >>> 0 < $$0530638 >>> 0) {
       $$1515 = $193; //@line 10773
       break;
      } else {
       $$0514639 = $193; //@line 10776
      }
     }
    }
   } else {
    $$1515 = 0; //@line 10781
   }
   $198 = ($39 | 0) == 103; //@line 10786
   $199 = ($$540 | 0) != 0; //@line 10787
   $201 = $$540 - (($39 | 0) != 102 ? $$1515 : 0) + (($199 & $198) << 31 >> 31) | 0; //@line 10790
   if (($201 | 0) < ((($$3501$lcssa - $185 >> 2) * 9 | 0) + -9 | 0)) {
    $209 = $201 + 9216 | 0; //@line 10799
    $212 = $$561 + 4 + ((($209 | 0) / 9 | 0) + -1024 << 2) | 0; //@line 10802
    $213 = ($209 | 0) % 9 | 0; //@line 10803
    if (($213 | 0) < 8) {
     $$0527$in633 = $213; //@line 10806
     $$1531632 = 10; //@line 10806
     while (1) {
      $215 = $$1531632 * 10 | 0; //@line 10809
      if (($$0527$in633 | 0) < 7) {
       $$0527$in633 = $$0527$in633 + 1 | 0; //@line 10812
       $$1531632 = $215; //@line 10812
      } else {
       $$1531$lcssa = $215; //@line 10814
       break;
      }
     }
    } else {
     $$1531$lcssa = 10; //@line 10819
    }
    $217 = HEAP32[$212 >> 2] | 0; //@line 10821
    $218 = ($217 >>> 0) % ($$1531$lcssa >>> 0) | 0; //@line 10822
    $221 = ($212 + 4 | 0) == ($$3501$lcssa | 0); //@line 10825
    if ($221 & ($218 | 0) == 0) {
     $$4492 = $212; //@line 10828
     $$4518 = $$1515; //@line 10828
     $$8 = $$3484$lcssa; //@line 10828
    } else {
     $$543 = ((($217 >>> 0) / ($$1531$lcssa >>> 0) | 0) & 1 | 0) == 0 ? 9007199254740992.0 : 9007199254740994.0; //@line 10833
     $225 = ($$1531$lcssa | 0) / 2 | 0; //@line 10834
     $$$564 = $218 >>> 0 < $225 >>> 0 ? .5 : $221 & ($218 | 0) == ($225 | 0) ? 1.0 : 1.5; //@line 10839
     if (!$$0520) {
      $$1467 = $$$564; //@line 10842
      $$1469 = $$543; //@line 10842
     } else {
      $230 = (HEAP8[$$0521 >> 0] | 0) == 45; //@line 10845
      $$1467 = $230 ? -$$$564 : $$$564; //@line 10850
      $$1469 = $230 ? -$$543 : $$543; //@line 10850
     }
     $233 = $217 - $218 | 0; //@line 10852
     HEAP32[$212 >> 2] = $233; //@line 10853
     if ($$1469 + $$1467 != $$1469) {
      $236 = $233 + $$1531$lcssa | 0; //@line 10857
      HEAP32[$212 >> 2] = $236; //@line 10858
      if ($236 >>> 0 > 999999999) {
       $$5486626 = $$3484$lcssa; //@line 10861
       $$sink547625 = $212; //@line 10861
       while (1) {
        $238 = $$sink547625 + -4 | 0; //@line 10863
        HEAP32[$$sink547625 >> 2] = 0; //@line 10864
        if ($238 >>> 0 < $$5486626 >>> 0) {
         $240 = $$5486626 + -4 | 0; //@line 10867
         HEAP32[$240 >> 2] = 0; //@line 10868
         $$6 = $240; //@line 10869
        } else {
         $$6 = $$5486626; //@line 10871
        }
        $242 = (HEAP32[$238 >> 2] | 0) + 1 | 0; //@line 10874
        HEAP32[$238 >> 2] = $242; //@line 10875
        if ($242 >>> 0 > 999999999) {
         $$5486626 = $$6; //@line 10878
         $$sink547625 = $238; //@line 10878
        } else {
         $$5486$lcssa = $$6; //@line 10880
         $$sink547$lcssa = $238; //@line 10880
         break;
        }
       }
      } else {
       $$5486$lcssa = $$3484$lcssa; //@line 10885
       $$sink547$lcssa = $212; //@line 10885
      }
      $247 = ($185 - $$5486$lcssa >> 2) * 9 | 0; //@line 10890
      $248 = HEAP32[$$5486$lcssa >> 2] | 0; //@line 10891
      if ($248 >>> 0 < 10) {
       $$4492 = $$sink547$lcssa; //@line 10894
       $$4518 = $247; //@line 10894
       $$8 = $$5486$lcssa; //@line 10894
      } else {
       $$2516621 = $247; //@line 10896
       $$2532620 = 10; //@line 10896
       while (1) {
        $$2532620 = $$2532620 * 10 | 0; //@line 10898
        $251 = $$2516621 + 1 | 0; //@line 10899
        if ($248 >>> 0 < $$2532620 >>> 0) {
         $$4492 = $$sink547$lcssa; //@line 10902
         $$4518 = $251; //@line 10902
         $$8 = $$5486$lcssa; //@line 10902
         break;
        } else {
         $$2516621 = $251; //@line 10905
        }
       }
      }
     } else {
      $$4492 = $212; //@line 10910
      $$4518 = $$1515; //@line 10910
      $$8 = $$3484$lcssa; //@line 10910
     }
    }
    $253 = $$4492 + 4 | 0; //@line 10913
    $$5519$ph = $$4518; //@line 10916
    $$7505$ph = $$3501$lcssa >>> 0 > $253 >>> 0 ? $253 : $$3501$lcssa; //@line 10916
    $$9$ph = $$8; //@line 10916
   } else {
    $$5519$ph = $$1515; //@line 10918
    $$7505$ph = $$3501$lcssa; //@line 10918
    $$9$ph = $$3484$lcssa; //@line 10918
   }
   $$7505 = $$7505$ph; //@line 10920
   while (1) {
    if ($$7505 >>> 0 <= $$9$ph >>> 0) {
     $$lcssa675 = 0; //@line 10924
     break;
    }
    $256 = $$7505 + -4 | 0; //@line 10927
    if (!(HEAP32[$256 >> 2] | 0)) {
     $$7505 = $256; //@line 10931
    } else {
     $$lcssa675 = 1; //@line 10933
     break;
    }
   }
   $259 = 0 - $$5519$ph | 0; //@line 10937
   do {
    if ($198) {
     $$540$ = $$540 + (($199 ^ 1) & 1) | 0; //@line 10942
     if (($$540$ | 0) > ($$5519$ph | 0) & ($$5519$ph | 0) > -5) {
      $$0479 = $5 + -1 | 0; //@line 10950
      $$2476 = $$540$ + -1 - $$5519$ph | 0; //@line 10950
     } else {
      $$0479 = $5 + -2 | 0; //@line 10954
      $$2476 = $$540$ + -1 | 0; //@line 10954
     }
     $267 = $4 & 8; //@line 10956
     if (!$267) {
      if ($$lcssa675) {
       $270 = HEAP32[$$7505 + -4 >> 2] | 0; //@line 10961
       if (!$270) {
        $$2529 = 9; //@line 10964
       } else {
        if (!(($270 >>> 0) % 10 | 0)) {
         $$1528617 = 0; //@line 10969
         $$3533616 = 10; //@line 10969
         while (1) {
          $$3533616 = $$3533616 * 10 | 0; //@line 10971
          $275 = $$1528617 + 1 | 0; //@line 10972
          if (($270 >>> 0) % ($$3533616 >>> 0) | 0 | 0) {
           $$2529 = $275; //@line 10978
           break;
          } else {
           $$1528617 = $275; //@line 10976
          }
         }
        } else {
         $$2529 = 0; //@line 10983
        }
       }
      } else {
       $$2529 = 9; //@line 10987
      }
      $284 = (($$7505 - $185 >> 2) * 9 | 0) + -9 | 0; //@line 10995
      if (($$0479 | 32 | 0) == 102) {
       $285 = $284 - $$2529 | 0; //@line 10997
       $$548 = ($285 | 0) > 0 ? $285 : 0; //@line 10999
       $$1480 = $$0479; //@line 11002
       $$3477 = ($$2476 | 0) < ($$548 | 0) ? $$2476 : $$548; //@line 11002
       $$pre$phi698Z2D = 0; //@line 11002
       break;
      } else {
       $289 = $284 + $$5519$ph - $$2529 | 0; //@line 11006
       $$550 = ($289 | 0) > 0 ? $289 : 0; //@line 11008
       $$1480 = $$0479; //@line 11011
       $$3477 = ($$2476 | 0) < ($$550 | 0) ? $$2476 : $$550; //@line 11011
       $$pre$phi698Z2D = 0; //@line 11011
       break;
      }
     } else {
      $$1480 = $$0479; //@line 11015
      $$3477 = $$2476; //@line 11015
      $$pre$phi698Z2D = $267; //@line 11015
     }
    } else {
     $$1480 = $5; //@line 11019
     $$3477 = $$540; //@line 11019
     $$pre$phi698Z2D = $4 & 8; //@line 11019
    }
   } while (0);
   $292 = $$3477 | $$pre$phi698Z2D; //@line 11022
   $294 = ($292 | 0) != 0 & 1; //@line 11024
   $296 = ($$1480 | 32 | 0) == 102; //@line 11026
   if ($296) {
    $$2513 = 0; //@line 11030
    $$pn = ($$5519$ph | 0) > 0 ? $$5519$ph : 0; //@line 11030
   } else {
    $300 = ($$5519$ph | 0) < 0 ? $259 : $$5519$ph; //@line 11033
    $303 = _fmt_u($300, (($300 | 0) < 0) << 31 >> 31, $11) | 0; //@line 11036
    $304 = $11; //@line 11037
    if (($304 - $303 | 0) < 2) {
     $$1512610 = $303; //@line 11042
     while (1) {
      $308 = $$1512610 + -1 | 0; //@line 11044
      HEAP8[$308 >> 0] = 48; //@line 11045
      if (($304 - $308 | 0) < 2) {
       $$1512610 = $308; //@line 11050
      } else {
       $$1512$lcssa = $308; //@line 11052
       break;
      }
     }
    } else {
     $$1512$lcssa = $303; //@line 11057
    }
    HEAP8[$$1512$lcssa + -1 >> 0] = ($$5519$ph >> 31 & 2) + 43; //@line 11064
    $318 = $$1512$lcssa + -2 | 0; //@line 11066
    HEAP8[$318 >> 0] = $$1480; //@line 11067
    $$2513 = $318; //@line 11070
    $$pn = $304 - $318 | 0; //@line 11070
   }
   $323 = $$0520 + 1 + $$3477 + $294 + $$pn | 0; //@line 11075
   _pad_676($0, 32, $2, $323, $4); //@line 11076
   _out_670($0, $$0521, $$0520); //@line 11077
   _pad_676($0, 48, $2, $323, $4 ^ 65536); //@line 11079
   if ($296) {
    $$0496$$9 = $$9$ph >>> 0 > $$561 >>> 0 ? $$561 : $$9$ph; //@line 11082
    $326 = $8 + 9 | 0; //@line 11083
    $327 = $326; //@line 11084
    $328 = $8 + 8 | 0; //@line 11085
    $$5493600 = $$0496$$9; //@line 11086
    do {
     $330 = _fmt_u(HEAP32[$$5493600 >> 2] | 0, 0, $326) | 0; //@line 11089
     if (($$5493600 | 0) == ($$0496$$9 | 0)) {
      if (($330 | 0) == ($326 | 0)) {
       HEAP8[$328 >> 0] = 48; //@line 11094
       $$1465 = $328; //@line 11095
      } else {
       $$1465 = $330; //@line 11097
      }
     } else {
      if ($330 >>> 0 > $8 >>> 0) {
       _memset($8 | 0, 48, $330 - $9 | 0) | 0; //@line 11104
       $$0464597 = $330; //@line 11105
       while (1) {
        $335 = $$0464597 + -1 | 0; //@line 11107
        if ($335 >>> 0 > $8 >>> 0) {
         $$0464597 = $335; //@line 11110
        } else {
         $$1465 = $335; //@line 11112
         break;
        }
       }
      } else {
       $$1465 = $330; //@line 11117
      }
     }
     _out_670($0, $$1465, $327 - $$1465 | 0); //@line 11122
     $$5493600 = $$5493600 + 4 | 0; //@line 11123
    } while ($$5493600 >>> 0 <= $$561 >>> 0);
    if ($292 | 0) {
     _out_670($0, 3345, 1); //@line 11133
    }
    if ($$5493600 >>> 0 < $$7505 >>> 0 & ($$3477 | 0) > 0) {
     $$4478593 = $$3477; //@line 11139
     $$6494592 = $$5493600; //@line 11139
     while (1) {
      $347 = _fmt_u(HEAP32[$$6494592 >> 2] | 0, 0, $326) | 0; //@line 11142
      if ($347 >>> 0 > $8 >>> 0) {
       _memset($8 | 0, 48, $347 - $9 | 0) | 0; //@line 11147
       $$0463587 = $347; //@line 11148
       while (1) {
        $351 = $$0463587 + -1 | 0; //@line 11150
        if ($351 >>> 0 > $8 >>> 0) {
         $$0463587 = $351; //@line 11153
        } else {
         $$0463$lcssa = $351; //@line 11155
         break;
        }
       }
      } else {
       $$0463$lcssa = $347; //@line 11160
      }
      _out_670($0, $$0463$lcssa, ($$4478593 | 0) < 9 ? $$4478593 : 9); //@line 11164
      $$6494592 = $$6494592 + 4 | 0; //@line 11165
      $356 = $$4478593 + -9 | 0; //@line 11166
      if (!($$6494592 >>> 0 < $$7505 >>> 0 & ($$4478593 | 0) > 9)) {
       $$4478$lcssa = $356; //@line 11173
       break;
      } else {
       $$4478593 = $356; //@line 11171
      }
     }
    } else {
     $$4478$lcssa = $$3477; //@line 11178
    }
    _pad_676($0, 48, $$4478$lcssa + 9 | 0, 9, 0); //@line 11181
   } else {
    $$7505$ = $$lcssa675 ? $$7505 : $$9$ph + 4 | 0; //@line 11184
    if (($$3477 | 0) > -1) {
     $363 = $8 + 9 | 0; //@line 11187
     $364 = ($$pre$phi698Z2D | 0) == 0; //@line 11188
     $365 = $363; //@line 11189
     $366 = 0 - $9 | 0; //@line 11190
     $367 = $8 + 8 | 0; //@line 11191
     $$5605 = $$3477; //@line 11192
     $$7495604 = $$9$ph; //@line 11192
     while (1) {
      $369 = _fmt_u(HEAP32[$$7495604 >> 2] | 0, 0, $363) | 0; //@line 11195
      if (($369 | 0) == ($363 | 0)) {
       HEAP8[$367 >> 0] = 48; //@line 11198
       $$0 = $367; //@line 11199
      } else {
       $$0 = $369; //@line 11201
      }
      do {
       if (($$7495604 | 0) == ($$9$ph | 0)) {
        $375 = $$0 + 1 | 0; //@line 11206
        _out_670($0, $$0, 1); //@line 11207
        if ($364 & ($$5605 | 0) < 1) {
         $$2 = $375; //@line 11211
         break;
        }
        _out_670($0, 3345, 1); //@line 11214
        $$2 = $375; //@line 11215
       } else {
        if ($$0 >>> 0 <= $8 >>> 0) {
         $$2 = $$0; //@line 11219
         break;
        }
        _memset($8 | 0, 48, $$0 + $366 | 0) | 0; //@line 11224
        $$1601 = $$0; //@line 11225
        while (1) {
         $373 = $$1601 + -1 | 0; //@line 11227
         if ($373 >>> 0 > $8 >>> 0) {
          $$1601 = $373; //@line 11230
         } else {
          $$2 = $373; //@line 11232
          break;
         }
        }
       }
      } while (0);
      $378 = $365 - $$2 | 0; //@line 11239
      _out_670($0, $$2, ($$5605 | 0) > ($378 | 0) ? $378 : $$5605); //@line 11242
      $381 = $$5605 - $378 | 0; //@line 11243
      $$7495604 = $$7495604 + 4 | 0; //@line 11244
      if (!($$7495604 >>> 0 < $$7505$ >>> 0 & ($381 | 0) > -1)) {
       $$5$lcssa = $381; //@line 11251
       break;
      } else {
       $$5605 = $381; //@line 11249
      }
     }
    } else {
     $$5$lcssa = $$3477; //@line 11256
    }
    _pad_676($0, 48, $$5$lcssa + 18 | 0, 18, 0); //@line 11259
    _out_670($0, $$2513, $11 - $$2513 | 0); //@line 11263
   }
   _pad_676($0, 32, $2, $323, $4 ^ 8192); //@line 11266
   $$sink560 = $323; //@line 11267
  }
 } while (0);
 STACKTOP = sp; //@line 11272
 return (($$sink560 | 0) < ($2 | 0) ? $2 : $$sink560) | 0; //@line 11272
}
function _equeue_dispatch__async_cb($0) {
 $0 = $0 | 0;
 var $$02329$i$i = 0, $$02330$i$i = 0, $$025$i$i = 0, $$067 = 0, $$06992$reg2mem$0 = 0, $$06992$reg2mem$0$phi = 0, $$2 = 0, $$expand_i1_val = 0, $$expand_i1_val31 = 0, $$expand_i1_val33 = 0, $$expand_i1_val35 = 0, $$reg2mem$0 = 0, $$reg2mem24$0 = 0, $$sink$in$i$i = 0, $10 = 0, $102 = 0, $105 = 0, $106 = 0, $107 = 0, $108 = 0, $109 = 0, $110 = 0, $111 = 0, $112 = 0, $113 = 0, $114 = 0, $115 = 0, $116 = 0, $117 = 0, $118 = 0, $119 = 0, $12 = 0, $120 = 0, $121 = 0, $122 = 0, $123 = 0, $124 = 0, $125 = 0, $127 = 0, $128 = 0, $129 = 0, $131 = 0, $132 = 0, $14 = 0, $140 = 0, $141 = 0, $143 = 0, $146 = 0, $148 = 0, $151 = 0, $154 = 0, $158 = 0, $159 = 0, $16 = 0, $160 = 0, $161 = 0, $165 = 0, $168 = 0, $174 = 0, $175 = 0, $176 = 0, $177 = 0, $178 = 0, $179 = 0, $18 = 0, $180 = 0, $181 = 0, $182 = 0, $183 = 0, $184 = 0, $185 = 0, $186 = 0, $187 = 0, $188 = 0, $189 = 0, $190 = 0, $191 = 0, $192 = 0, $2 = 0, $20 = 0, $22 = 0, $24 = 0, $26 = 0, $28 = 0, $34 = 0, $36 = 0, $38 = 0, $4 = 0, $41 = 0, $42 = 0, $44 = 0, $47 = 0, $48 = 0, $49 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0, $68 = 0, $70 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $78 = 0, $79 = 0, $8 = 0, $80 = 0, $81 = 0, $82 = 0, $83 = 0, $84 = 0, $85 = 0, $86 = 0, $87 = 0, $88 = 0, $89 = 0, $90 = 0, $91 = 0, $92 = 0, $93 = 0, $ReallocAsyncCtx = 0, $ReallocAsyncCtx2 = 0, $ReallocAsyncCtx3 = 0, $ReallocAsyncCtx4 = 0, $ReallocAsyncCtx5 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 5871
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 5873
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 5875
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 5877
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 5879
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 5881
 $12 = HEAP8[$0 + 24 >> 0] & 1; //@line 5884
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 5886
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 5888
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 5890
 $20 = HEAP32[$0 + 40 >> 2] | 0; //@line 5892
 $22 = HEAP32[$0 + 44 >> 2] | 0; //@line 5894
 $24 = HEAP32[$0 + 48 >> 2] | 0; //@line 5896
 $26 = HEAP32[$0 + 52 >> 2] | 0; //@line 5898
 $28 = HEAP32[$0 + 56 >> 2] | 0; //@line 5900
 $34 = HEAP32[$0 + 68 >> 2] | 0; //@line 5906
 $36 = HEAP32[$0 + 72 >> 2] | 0; //@line 5908
 $38 = HEAP32[$0 + 76 >> 2] | 0; //@line 5910
 $$06992$reg2mem$0 = HEAP32[$0 + 60 >> 2] | 0; //@line 5913
 $$reg2mem$0 = HEAP32[$0 + 64 >> 2] | 0; //@line 5913
 $$reg2mem24$0 = HEAP32[$0 + 80 >> 2] | 0; //@line 5913
 while (1) {
  $68 = HEAP32[$$06992$reg2mem$0 + 24 >> 2] | 0; //@line 5916
  if (($68 | 0) > -1) {
   label = 8; //@line 5919
   break;
  }
  $92 = $$06992$reg2mem$0 + 4 | 0; //@line 5923
  $93 = HEAP8[$92 >> 0] | 0; //@line 5924
  HEAP8[$92 >> 0] = (($93 + 1 & 255) << HEAP32[$38 >> 2] | 0) == 0 ? 1 : ($93 & 255) + 1 & 255; //@line 5933
  $102 = HEAP32[$$06992$reg2mem$0 + 28 >> 2] | 0; //@line 5935
  if ($102 | 0) {
   label = 12; //@line 5938
   break;
  }
  _equeue_mutex_lock($34); //@line 5941
  $125 = HEAP32[$36 >> 2] | 0; //@line 5942
  L6 : do {
   if (!$125) {
    $$02329$i$i = $36; //@line 5946
    label = 21; //@line 5947
   } else {
    $127 = HEAP32[$$06992$reg2mem$0 >> 2] | 0; //@line 5949
    $$025$i$i = $36; //@line 5950
    $129 = $125; //@line 5950
    while (1) {
     $128 = HEAP32[$129 >> 2] | 0; //@line 5952
     if ($128 >>> 0 >= $127 >>> 0) {
      break;
     }
     $131 = $129 + 8 | 0; //@line 5957
     $132 = HEAP32[$131 >> 2] | 0; //@line 5958
     if (!$132) {
      $$02329$i$i = $131; //@line 5961
      label = 21; //@line 5962
      break L6;
     } else {
      $$025$i$i = $131; //@line 5965
      $129 = $132; //@line 5965
     }
    }
    if (($128 | 0) == ($127 | 0)) {
     HEAP32[$$06992$reg2mem$0 + 12 >> 2] = $129; //@line 5971
     $$02330$i$i = $$025$i$i; //@line 5974
     $$sink$in$i$i = (HEAP32[$$025$i$i >> 2] | 0) + 8 | 0; //@line 5974
    } else {
     $$02329$i$i = $$025$i$i; //@line 5976
     label = 21; //@line 5977
    }
   }
  } while (0);
  if ((label | 0) == 21) {
   label = 0; //@line 5982
   HEAP32[$$06992$reg2mem$0 + 12 >> 2] = 0; //@line 5984
   $$02330$i$i = $$02329$i$i; //@line 5985
   $$sink$in$i$i = $$02329$i$i; //@line 5985
  }
  HEAP32[$$reg2mem24$0 >> 2] = HEAP32[$$sink$in$i$i >> 2]; //@line 5988
  HEAP32[$$02330$i$i >> 2] = $$06992$reg2mem$0; //@line 5989
  _equeue_mutex_unlock($34); //@line 5990
  if (!$$reg2mem$0) {
   label = 24; //@line 5993
   break;
  }
  $41 = $$reg2mem$0 + 8 | 0; //@line 5996
  $42 = HEAP32[$41 >> 2] | 0; //@line 5997
  $44 = HEAP32[$$reg2mem$0 + 32 >> 2] | 0; //@line 5999
  if (!$44) {
   $$06992$reg2mem$0$phi = $$reg2mem$0; //@line 6002
   $$reg2mem$0 = $42; //@line 6002
   $$reg2mem24$0 = $41; //@line 6002
   $$06992$reg2mem$0 = $$06992$reg2mem$0$phi; //@line 6002
  } else {
   label = 3; //@line 6004
   break;
  }
 }
 if ((label | 0) == 3) {
  $ReallocAsyncCtx = _emscripten_realloc_async_context(84) | 0; //@line 6010
  FUNCTION_TABLE_vi[$44 & 255]($$reg2mem$0 + 36 | 0); //@line 6011
  if (___async) {
   HEAP32[$ReallocAsyncCtx >> 2] = 30; //@line 6014
   $47 = $ReallocAsyncCtx + 4 | 0; //@line 6015
   HEAP32[$47 >> 2] = $2; //@line 6016
   $48 = $ReallocAsyncCtx + 8 | 0; //@line 6017
   HEAP32[$48 >> 2] = $4; //@line 6018
   $49 = $ReallocAsyncCtx + 12 | 0; //@line 6019
   HEAP32[$49 >> 2] = $6; //@line 6020
   $50 = $ReallocAsyncCtx + 16 | 0; //@line 6021
   HEAP32[$50 >> 2] = $8; //@line 6022
   $51 = $ReallocAsyncCtx + 20 | 0; //@line 6023
   HEAP32[$51 >> 2] = $10; //@line 6024
   $52 = $ReallocAsyncCtx + 24 | 0; //@line 6025
   $$expand_i1_val = $12 & 1; //@line 6026
   HEAP8[$52 >> 0] = $$expand_i1_val; //@line 6027
   $53 = $ReallocAsyncCtx + 28 | 0; //@line 6028
   HEAP32[$53 >> 2] = $14; //@line 6029
   $54 = $ReallocAsyncCtx + 32 | 0; //@line 6030
   HEAP32[$54 >> 2] = $16; //@line 6031
   $55 = $ReallocAsyncCtx + 36 | 0; //@line 6032
   HEAP32[$55 >> 2] = $18; //@line 6033
   $56 = $ReallocAsyncCtx + 40 | 0; //@line 6034
   HEAP32[$56 >> 2] = $20; //@line 6035
   $57 = $ReallocAsyncCtx + 44 | 0; //@line 6036
   HEAP32[$57 >> 2] = $22; //@line 6037
   $58 = $ReallocAsyncCtx + 48 | 0; //@line 6038
   HEAP32[$58 >> 2] = $24; //@line 6039
   $59 = $ReallocAsyncCtx + 52 | 0; //@line 6040
   HEAP32[$59 >> 2] = $26; //@line 6041
   $60 = $ReallocAsyncCtx + 56 | 0; //@line 6042
   HEAP32[$60 >> 2] = $28; //@line 6043
   $61 = $ReallocAsyncCtx + 60 | 0; //@line 6044
   HEAP32[$61 >> 2] = $$reg2mem$0; //@line 6045
   $62 = $ReallocAsyncCtx + 64 | 0; //@line 6046
   HEAP32[$62 >> 2] = $42; //@line 6047
   $63 = $ReallocAsyncCtx + 68 | 0; //@line 6048
   HEAP32[$63 >> 2] = $34; //@line 6049
   $64 = $ReallocAsyncCtx + 72 | 0; //@line 6050
   HEAP32[$64 >> 2] = $36; //@line 6051
   $65 = $ReallocAsyncCtx + 76 | 0; //@line 6052
   HEAP32[$65 >> 2] = $38; //@line 6053
   $66 = $ReallocAsyncCtx + 80 | 0; //@line 6054
   HEAP32[$66 >> 2] = $41; //@line 6055
   sp = STACKTOP; //@line 6056
   return;
  }
  ___async_unwind = 0; //@line 6059
  HEAP32[$ReallocAsyncCtx >> 2] = 30; //@line 6060
  $47 = $ReallocAsyncCtx + 4 | 0; //@line 6061
  HEAP32[$47 >> 2] = $2; //@line 6062
  $48 = $ReallocAsyncCtx + 8 | 0; //@line 6063
  HEAP32[$48 >> 2] = $4; //@line 6064
  $49 = $ReallocAsyncCtx + 12 | 0; //@line 6065
  HEAP32[$49 >> 2] = $6; //@line 6066
  $50 = $ReallocAsyncCtx + 16 | 0; //@line 6067
  HEAP32[$50 >> 2] = $8; //@line 6068
  $51 = $ReallocAsyncCtx + 20 | 0; //@line 6069
  HEAP32[$51 >> 2] = $10; //@line 6070
  $52 = $ReallocAsyncCtx + 24 | 0; //@line 6071
  $$expand_i1_val = $12 & 1; //@line 6072
  HEAP8[$52 >> 0] = $$expand_i1_val; //@line 6073
  $53 = $ReallocAsyncCtx + 28 | 0; //@line 6074
  HEAP32[$53 >> 2] = $14; //@line 6075
  $54 = $ReallocAsyncCtx + 32 | 0; //@line 6076
  HEAP32[$54 >> 2] = $16; //@line 6077
  $55 = $ReallocAsyncCtx + 36 | 0; //@line 6078
  HEAP32[$55 >> 2] = $18; //@line 6079
  $56 = $ReallocAsyncCtx + 40 | 0; //@line 6080
  HEAP32[$56 >> 2] = $20; //@line 6081
  $57 = $ReallocAsyncCtx + 44 | 0; //@line 6082
  HEAP32[$57 >> 2] = $22; //@line 6083
  $58 = $ReallocAsyncCtx + 48 | 0; //@line 6084
  HEAP32[$58 >> 2] = $24; //@line 6085
  $59 = $ReallocAsyncCtx + 52 | 0; //@line 6086
  HEAP32[$59 >> 2] = $26; //@line 6087
  $60 = $ReallocAsyncCtx + 56 | 0; //@line 6088
  HEAP32[$60 >> 2] = $28; //@line 6089
  $61 = $ReallocAsyncCtx + 60 | 0; //@line 6090
  HEAP32[$61 >> 2] = $$reg2mem$0; //@line 6091
  $62 = $ReallocAsyncCtx + 64 | 0; //@line 6092
  HEAP32[$62 >> 2] = $42; //@line 6093
  $63 = $ReallocAsyncCtx + 68 | 0; //@line 6094
  HEAP32[$63 >> 2] = $34; //@line 6095
  $64 = $ReallocAsyncCtx + 72 | 0; //@line 6096
  HEAP32[$64 >> 2] = $36; //@line 6097
  $65 = $ReallocAsyncCtx + 76 | 0; //@line 6098
  HEAP32[$65 >> 2] = $38; //@line 6099
  $66 = $ReallocAsyncCtx + 80 | 0; //@line 6100
  HEAP32[$66 >> 2] = $41; //@line 6101
  sp = STACKTOP; //@line 6102
  return;
 } else if ((label | 0) == 8) {
  $70 = $$06992$reg2mem$0 + 20 | 0; //@line 6106
  HEAP32[$70 >> 2] = (HEAP32[$70 >> 2] | 0) + $68; //@line 6109
  $73 = _equeue_tick() | 0; //@line 6110
  $ReallocAsyncCtx4 = _emscripten_realloc_async_context(76) | 0; //@line 6111
  _equeue_enqueue($8, $$06992$reg2mem$0, $73) | 0; //@line 6112
  if (___async) {
   HEAP32[$ReallocAsyncCtx4 >> 2] = 31; //@line 6115
   $74 = $ReallocAsyncCtx4 + 4 | 0; //@line 6116
   HEAP32[$74 >> 2] = $2; //@line 6117
   $75 = $ReallocAsyncCtx4 + 8 | 0; //@line 6118
   HEAP32[$75 >> 2] = $4; //@line 6119
   $76 = $ReallocAsyncCtx4 + 12 | 0; //@line 6120
   HEAP32[$76 >> 2] = $6; //@line 6121
   $77 = $ReallocAsyncCtx4 + 16 | 0; //@line 6122
   HEAP32[$77 >> 2] = $8; //@line 6123
   $78 = $ReallocAsyncCtx4 + 20 | 0; //@line 6124
   HEAP32[$78 >> 2] = $10; //@line 6125
   $79 = $ReallocAsyncCtx4 + 24 | 0; //@line 6126
   $$expand_i1_val31 = $12 & 1; //@line 6127
   HEAP8[$79 >> 0] = $$expand_i1_val31; //@line 6128
   $80 = $ReallocAsyncCtx4 + 28 | 0; //@line 6129
   HEAP32[$80 >> 2] = $14; //@line 6130
   $81 = $ReallocAsyncCtx4 + 32 | 0; //@line 6131
   HEAP32[$81 >> 2] = $16; //@line 6132
   $82 = $ReallocAsyncCtx4 + 36 | 0; //@line 6133
   HEAP32[$82 >> 2] = $18; //@line 6134
   $83 = $ReallocAsyncCtx4 + 40 | 0; //@line 6135
   HEAP32[$83 >> 2] = $20; //@line 6136
   $84 = $ReallocAsyncCtx4 + 44 | 0; //@line 6137
   HEAP32[$84 >> 2] = $22; //@line 6138
   $85 = $ReallocAsyncCtx4 + 48 | 0; //@line 6139
   HEAP32[$85 >> 2] = $24; //@line 6140
   $86 = $ReallocAsyncCtx4 + 52 | 0; //@line 6141
   HEAP32[$86 >> 2] = $26; //@line 6142
   $87 = $ReallocAsyncCtx4 + 56 | 0; //@line 6143
   HEAP32[$87 >> 2] = $28; //@line 6144
   $88 = $ReallocAsyncCtx4 + 60 | 0; //@line 6145
   HEAP32[$88 >> 2] = $34; //@line 6146
   $89 = $ReallocAsyncCtx4 + 64 | 0; //@line 6147
   HEAP32[$89 >> 2] = $36; //@line 6148
   $90 = $ReallocAsyncCtx4 + 68 | 0; //@line 6149
   HEAP32[$90 >> 2] = $38; //@line 6150
   $91 = $ReallocAsyncCtx4 + 72 | 0; //@line 6151
   HEAP32[$91 >> 2] = $$reg2mem$0; //@line 6152
   sp = STACKTOP; //@line 6153
   return;
  }
  ___async_unwind = 0; //@line 6156
  HEAP32[$ReallocAsyncCtx4 >> 2] = 31; //@line 6157
  $74 = $ReallocAsyncCtx4 + 4 | 0; //@line 6158
  HEAP32[$74 >> 2] = $2; //@line 6159
  $75 = $ReallocAsyncCtx4 + 8 | 0; //@line 6160
  HEAP32[$75 >> 2] = $4; //@line 6161
  $76 = $ReallocAsyncCtx4 + 12 | 0; //@line 6162
  HEAP32[$76 >> 2] = $6; //@line 6163
  $77 = $ReallocAsyncCtx4 + 16 | 0; //@line 6164
  HEAP32[$77 >> 2] = $8; //@line 6165
  $78 = $ReallocAsyncCtx4 + 20 | 0; //@line 6166
  HEAP32[$78 >> 2] = $10; //@line 6167
  $79 = $ReallocAsyncCtx4 + 24 | 0; //@line 6168
  $$expand_i1_val31 = $12 & 1; //@line 6169
  HEAP8[$79 >> 0] = $$expand_i1_val31; //@line 6170
  $80 = $ReallocAsyncCtx4 + 28 | 0; //@line 6171
  HEAP32[$80 >> 2] = $14; //@line 6172
  $81 = $ReallocAsyncCtx4 + 32 | 0; //@line 6173
  HEAP32[$81 >> 2] = $16; //@line 6174
  $82 = $ReallocAsyncCtx4 + 36 | 0; //@line 6175
  HEAP32[$82 >> 2] = $18; //@line 6176
  $83 = $ReallocAsyncCtx4 + 40 | 0; //@line 6177
  HEAP32[$83 >> 2] = $20; //@line 6178
  $84 = $ReallocAsyncCtx4 + 44 | 0; //@line 6179
  HEAP32[$84 >> 2] = $22; //@line 6180
  $85 = $ReallocAsyncCtx4 + 48 | 0; //@line 6181
  HEAP32[$85 >> 2] = $24; //@line 6182
  $86 = $ReallocAsyncCtx4 + 52 | 0; //@line 6183
  HEAP32[$86 >> 2] = $26; //@line 6184
  $87 = $ReallocAsyncCtx4 + 56 | 0; //@line 6185
  HEAP32[$87 >> 2] = $28; //@line 6186
  $88 = $ReallocAsyncCtx4 + 60 | 0; //@line 6187
  HEAP32[$88 >> 2] = $34; //@line 6188
  $89 = $ReallocAsyncCtx4 + 64 | 0; //@line 6189
  HEAP32[$89 >> 2] = $36; //@line 6190
  $90 = $ReallocAsyncCtx4 + 68 | 0; //@line 6191
  HEAP32[$90 >> 2] = $38; //@line 6192
  $91 = $ReallocAsyncCtx4 + 72 | 0; //@line 6193
  HEAP32[$91 >> 2] = $$reg2mem$0; //@line 6194
  sp = STACKTOP; //@line 6195
  return;
 } else if ((label | 0) == 12) {
  $ReallocAsyncCtx2 = _emscripten_realloc_async_context(84) | 0; //@line 6200
  FUNCTION_TABLE_vi[$102 & 255]($$06992$reg2mem$0 + 36 | 0); //@line 6201
  if (___async) {
   HEAP32[$ReallocAsyncCtx2 >> 2] = 32; //@line 6204
   $105 = $ReallocAsyncCtx2 + 4 | 0; //@line 6205
   HEAP32[$105 >> 2] = $2; //@line 6206
   $106 = $ReallocAsyncCtx2 + 8 | 0; //@line 6207
   HEAP32[$106 >> 2] = $4; //@line 6208
   $107 = $ReallocAsyncCtx2 + 12 | 0; //@line 6209
   HEAP32[$107 >> 2] = $6; //@line 6210
   $108 = $ReallocAsyncCtx2 + 16 | 0; //@line 6211
   HEAP32[$108 >> 2] = $8; //@line 6212
   $109 = $ReallocAsyncCtx2 + 20 | 0; //@line 6213
   HEAP32[$109 >> 2] = $10; //@line 6214
   $110 = $ReallocAsyncCtx2 + 24 | 0; //@line 6215
   $$expand_i1_val33 = $12 & 1; //@line 6216
   HEAP8[$110 >> 0] = $$expand_i1_val33; //@line 6217
   $111 = $ReallocAsyncCtx2 + 28 | 0; //@line 6218
   HEAP32[$111 >> 2] = $14; //@line 6219
   $112 = $ReallocAsyncCtx2 + 32 | 0; //@line 6220
   HEAP32[$112 >> 2] = $16; //@line 6221
   $113 = $ReallocAsyncCtx2 + 36 | 0; //@line 6222
   HEAP32[$113 >> 2] = $18; //@line 6223
   $114 = $ReallocAsyncCtx2 + 40 | 0; //@line 6224
   HEAP32[$114 >> 2] = $20; //@line 6225
   $115 = $ReallocAsyncCtx2 + 44 | 0; //@line 6226
   HEAP32[$115 >> 2] = $22; //@line 6227
   $116 = $ReallocAsyncCtx2 + 48 | 0; //@line 6228
   HEAP32[$116 >> 2] = $24; //@line 6229
   $117 = $ReallocAsyncCtx2 + 52 | 0; //@line 6230
   HEAP32[$117 >> 2] = $26; //@line 6231
   $118 = $ReallocAsyncCtx2 + 56 | 0; //@line 6232
   HEAP32[$118 >> 2] = $28; //@line 6233
   $119 = $ReallocAsyncCtx2 + 60 | 0; //@line 6234
   HEAP32[$119 >> 2] = $$reg2mem$0; //@line 6235
   $120 = $ReallocAsyncCtx2 + 64 | 0; //@line 6236
   HEAP32[$120 >> 2] = $34; //@line 6237
   $121 = $ReallocAsyncCtx2 + 68 | 0; //@line 6238
   HEAP32[$121 >> 2] = $36; //@line 6239
   $122 = $ReallocAsyncCtx2 + 72 | 0; //@line 6240
   HEAP32[$122 >> 2] = $38; //@line 6241
   $123 = $ReallocAsyncCtx2 + 76 | 0; //@line 6242
   HEAP32[$123 >> 2] = $$06992$reg2mem$0; //@line 6243
   $124 = $ReallocAsyncCtx2 + 80 | 0; //@line 6244
   HEAP32[$124 >> 2] = $$reg2mem24$0; //@line 6245
   sp = STACKTOP; //@line 6246
   return;
  }
  ___async_unwind = 0; //@line 6249
  HEAP32[$ReallocAsyncCtx2 >> 2] = 32; //@line 6250
  $105 = $ReallocAsyncCtx2 + 4 | 0; //@line 6251
  HEAP32[$105 >> 2] = $2; //@line 6252
  $106 = $ReallocAsyncCtx2 + 8 | 0; //@line 6253
  HEAP32[$106 >> 2] = $4; //@line 6254
  $107 = $ReallocAsyncCtx2 + 12 | 0; //@line 6255
  HEAP32[$107 >> 2] = $6; //@line 6256
  $108 = $ReallocAsyncCtx2 + 16 | 0; //@line 6257
  HEAP32[$108 >> 2] = $8; //@line 6258
  $109 = $ReallocAsyncCtx2 + 20 | 0; //@line 6259
  HEAP32[$109 >> 2] = $10; //@line 6260
  $110 = $ReallocAsyncCtx2 + 24 | 0; //@line 6261
  $$expand_i1_val33 = $12 & 1; //@line 6262
  HEAP8[$110 >> 0] = $$expand_i1_val33; //@line 6263
  $111 = $ReallocAsyncCtx2 + 28 | 0; //@line 6264
  HEAP32[$111 >> 2] = $14; //@line 6265
  $112 = $ReallocAsyncCtx2 + 32 | 0; //@line 6266
  HEAP32[$112 >> 2] = $16; //@line 6267
  $113 = $ReallocAsyncCtx2 + 36 | 0; //@line 6268
  HEAP32[$113 >> 2] = $18; //@line 6269
  $114 = $ReallocAsyncCtx2 + 40 | 0; //@line 6270
  HEAP32[$114 >> 2] = $20; //@line 6271
  $115 = $ReallocAsyncCtx2 + 44 | 0; //@line 6272
  HEAP32[$115 >> 2] = $22; //@line 6273
  $116 = $ReallocAsyncCtx2 + 48 | 0; //@line 6274
  HEAP32[$116 >> 2] = $24; //@line 6275
  $117 = $ReallocAsyncCtx2 + 52 | 0; //@line 6276
  HEAP32[$117 >> 2] = $26; //@line 6277
  $118 = $ReallocAsyncCtx2 + 56 | 0; //@line 6278
  HEAP32[$118 >> 2] = $28; //@line 6279
  $119 = $ReallocAsyncCtx2 + 60 | 0; //@line 6280
  HEAP32[$119 >> 2] = $$reg2mem$0; //@line 6281
  $120 = $ReallocAsyncCtx2 + 64 | 0; //@line 6282
  HEAP32[$120 >> 2] = $34; //@line 6283
  $121 = $ReallocAsyncCtx2 + 68 | 0; //@line 6284
  HEAP32[$121 >> 2] = $36; //@line 6285
  $122 = $ReallocAsyncCtx2 + 72 | 0; //@line 6286
  HEAP32[$122 >> 2] = $38; //@line 6287
  $123 = $ReallocAsyncCtx2 + 76 | 0; //@line 6288
  HEAP32[$123 >> 2] = $$06992$reg2mem$0; //@line 6289
  $124 = $ReallocAsyncCtx2 + 80 | 0; //@line 6290
  HEAP32[$124 >> 2] = $$reg2mem24$0; //@line 6291
  sp = STACKTOP; //@line 6292
  return;
 } else if ((label | 0) == 24) {
  $140 = _equeue_tick() | 0; //@line 6296
  if ($12) {
   $141 = $10 - $140 | 0; //@line 6298
   if (($141 | 0) < 1) {
    $143 = $8 + 40 | 0; //@line 6301
    if (HEAP32[$143 >> 2] | 0) {
     _equeue_mutex_lock($2); //@line 6305
     $146 = HEAP32[$143 >> 2] | 0; //@line 6306
     if ($146 | 0) {
      $148 = HEAP32[$26 >> 2] | 0; //@line 6309
      if ($148 | 0) {
       $151 = HEAP32[$8 + 44 >> 2] | 0; //@line 6313
       $154 = (HEAP32[$148 + 20 >> 2] | 0) - $140 | 0; //@line 6316
       $ReallocAsyncCtx3 = _emscripten_realloc_async_context(16) | 0; //@line 6320
       FUNCTION_TABLE_vii[$146 & 3]($151, $154 & ~($154 >> 31)); //@line 6321
       if (___async) {
        HEAP32[$ReallocAsyncCtx3 >> 2] = 33; //@line 6324
        $158 = $ReallocAsyncCtx3 + 4 | 0; //@line 6325
        HEAP32[$158 >> 2] = $18; //@line 6326
        $159 = $ReallocAsyncCtx3 + 8 | 0; //@line 6327
        HEAP32[$159 >> 2] = $2; //@line 6328
        $160 = $ReallocAsyncCtx3 + 12 | 0; //@line 6329
        HEAP32[$160 >> 2] = $16; //@line 6330
        sp = STACKTOP; //@line 6331
        return;
       }
       ___async_unwind = 0; //@line 6334
       HEAP32[$ReallocAsyncCtx3 >> 2] = 33; //@line 6335
       $158 = $ReallocAsyncCtx3 + 4 | 0; //@line 6336
       HEAP32[$158 >> 2] = $18; //@line 6337
       $159 = $ReallocAsyncCtx3 + 8 | 0; //@line 6338
       HEAP32[$159 >> 2] = $2; //@line 6339
       $160 = $ReallocAsyncCtx3 + 12 | 0; //@line 6340
       HEAP32[$160 >> 2] = $16; //@line 6341
       sp = STACKTOP; //@line 6342
       return;
      }
     }
     HEAP8[$18 >> 0] = 1; //@line 6346
     _equeue_mutex_unlock($2); //@line 6347
    }
    HEAP8[$16 >> 0] = 0; //@line 6349
    return;
   } else {
    $$067 = $141; //@line 6352
   }
  } else {
   $$067 = -1; //@line 6355
  }
  _equeue_mutex_lock($2); //@line 6357
  $161 = HEAP32[$26 >> 2] | 0; //@line 6358
  if (!$161) {
   $$2 = $$067; //@line 6361
  } else {
   $165 = (HEAP32[$161 + 20 >> 2] | 0) - $140 | 0; //@line 6365
   $168 = $165 & ~($165 >> 31); //@line 6368
   $$2 = $168 >>> 0 < $$067 >>> 0 ? $168 : $$067; //@line 6371
  }
  _equeue_mutex_unlock($2); //@line 6373
  _equeue_sema_wait($28, $$2) | 0; //@line 6374
  do {
   if (HEAP8[$16 >> 0] | 0) {
    _equeue_mutex_lock($2); //@line 6379
    if (!(HEAP8[$16 >> 0] | 0)) {
     _equeue_mutex_unlock($2); //@line 6383
     break;
    }
    HEAP8[$16 >> 0] = 0; //@line 6386
    _equeue_mutex_unlock($2); //@line 6387
    return;
   }
  } while (0);
  $174 = _equeue_tick() | 0; //@line 6391
  $ReallocAsyncCtx5 = _emscripten_realloc_async_context(76) | 0; //@line 6392
  _wait_ms(20); //@line 6393
  if (___async) {
   HEAP32[$ReallocAsyncCtx5 >> 2] = 34; //@line 6396
   $175 = $ReallocAsyncCtx5 + 4 | 0; //@line 6397
   HEAP32[$175 >> 2] = $2; //@line 6398
   $176 = $ReallocAsyncCtx5 + 8 | 0; //@line 6399
   HEAP32[$176 >> 2] = $174; //@line 6400
   $177 = $ReallocAsyncCtx5 + 12 | 0; //@line 6401
   HEAP32[$177 >> 2] = $4; //@line 6402
   $178 = $ReallocAsyncCtx5 + 16 | 0; //@line 6403
   HEAP32[$178 >> 2] = $6; //@line 6404
   $179 = $ReallocAsyncCtx5 + 20 | 0; //@line 6405
   HEAP32[$179 >> 2] = $8; //@line 6406
   $180 = $ReallocAsyncCtx5 + 24 | 0; //@line 6407
   HEAP32[$180 >> 2] = $10; //@line 6408
   $181 = $ReallocAsyncCtx5 + 28 | 0; //@line 6409
   $$expand_i1_val35 = $12 & 1; //@line 6410
   HEAP8[$181 >> 0] = $$expand_i1_val35; //@line 6411
   $182 = $ReallocAsyncCtx5 + 32 | 0; //@line 6412
   HEAP32[$182 >> 2] = $14; //@line 6413
   $183 = $ReallocAsyncCtx5 + 36 | 0; //@line 6414
   HEAP32[$183 >> 2] = $16; //@line 6415
   $184 = $ReallocAsyncCtx5 + 40 | 0; //@line 6416
   HEAP32[$184 >> 2] = $18; //@line 6417
   $185 = $ReallocAsyncCtx5 + 44 | 0; //@line 6418
   HEAP32[$185 >> 2] = $20; //@line 6419
   $186 = $ReallocAsyncCtx5 + 48 | 0; //@line 6420
   HEAP32[$186 >> 2] = $22; //@line 6421
   $187 = $ReallocAsyncCtx5 + 52 | 0; //@line 6422
   HEAP32[$187 >> 2] = $24; //@line 6423
   $188 = $ReallocAsyncCtx5 + 56 | 0; //@line 6424
   HEAP32[$188 >> 2] = $26; //@line 6425
   $189 = $ReallocAsyncCtx5 + 60 | 0; //@line 6426
   HEAP32[$189 >> 2] = $28; //@line 6427
   $190 = $ReallocAsyncCtx5 + 64 | 0; //@line 6428
   HEAP32[$190 >> 2] = $34; //@line 6429
   $191 = $ReallocAsyncCtx5 + 68 | 0; //@line 6430
   HEAP32[$191 >> 2] = $36; //@line 6431
   $192 = $ReallocAsyncCtx5 + 72 | 0; //@line 6432
   HEAP32[$192 >> 2] = $38; //@line 6433
   sp = STACKTOP; //@line 6434
   return;
  }
  ___async_unwind = 0; //@line 6437
  HEAP32[$ReallocAsyncCtx5 >> 2] = 34; //@line 6438
  $175 = $ReallocAsyncCtx5 + 4 | 0; //@line 6439
  HEAP32[$175 >> 2] = $2; //@line 6440
  $176 = $ReallocAsyncCtx5 + 8 | 0; //@line 6441
  HEAP32[$176 >> 2] = $174; //@line 6442
  $177 = $ReallocAsyncCtx5 + 12 | 0; //@line 6443
  HEAP32[$177 >> 2] = $4; //@line 6444
  $178 = $ReallocAsyncCtx5 + 16 | 0; //@line 6445
  HEAP32[$178 >> 2] = $6; //@line 6446
  $179 = $ReallocAsyncCtx5 + 20 | 0; //@line 6447
  HEAP32[$179 >> 2] = $8; //@line 6448
  $180 = $ReallocAsyncCtx5 + 24 | 0; //@line 6449
  HEAP32[$180 >> 2] = $10; //@line 6450
  $181 = $ReallocAsyncCtx5 + 28 | 0; //@line 6451
  $$expand_i1_val35 = $12 & 1; //@line 6452
  HEAP8[$181 >> 0] = $$expand_i1_val35; //@line 6453
  $182 = $ReallocAsyncCtx5 + 32 | 0; //@line 6454
  HEAP32[$182 >> 2] = $14; //@line 6455
  $183 = $ReallocAsyncCtx5 + 36 | 0; //@line 6456
  HEAP32[$183 >> 2] = $16; //@line 6457
  $184 = $ReallocAsyncCtx5 + 40 | 0; //@line 6458
  HEAP32[$184 >> 2] = $18; //@line 6459
  $185 = $ReallocAsyncCtx5 + 44 | 0; //@line 6460
  HEAP32[$185 >> 2] = $20; //@line 6461
  $186 = $ReallocAsyncCtx5 + 48 | 0; //@line 6462
  HEAP32[$186 >> 2] = $22; //@line 6463
  $187 = $ReallocAsyncCtx5 + 52 | 0; //@line 6464
  HEAP32[$187 >> 2] = $24; //@line 6465
  $188 = $ReallocAsyncCtx5 + 56 | 0; //@line 6466
  HEAP32[$188 >> 2] = $26; //@line 6467
  $189 = $ReallocAsyncCtx5 + 60 | 0; //@line 6468
  HEAP32[$189 >> 2] = $28; //@line 6469
  $190 = $ReallocAsyncCtx5 + 64 | 0; //@line 6470
  HEAP32[$190 >> 2] = $34; //@line 6471
  $191 = $ReallocAsyncCtx5 + 68 | 0; //@line 6472
  HEAP32[$191 >> 2] = $36; //@line 6473
  $192 = $ReallocAsyncCtx5 + 72 | 0; //@line 6474
  HEAP32[$192 >> 2] = $38; //@line 6475
  sp = STACKTOP; //@line 6476
  return;
 }
}
function _equeue_dispatch__async_cb_63($0) {
 $0 = $0 | 0;
 var $$02329$i$i = 0, $$02330$i$i = 0, $$025$i$i = 0, $$067 = 0, $$06992$reg2mem$0 = 0, $$06992$reg2mem$0$phi = 0, $$2 = 0, $$expand_i1_val = 0, $$expand_i1_val31 = 0, $$expand_i1_val33 = 0, $$expand_i1_val35 = 0, $$reg2mem$0 = 0, $$reg2mem24$0 = 0, $$sink$in$i$i = 0, $10 = 0, $102 = 0, $105 = 0, $106 = 0, $107 = 0, $108 = 0, $109 = 0, $110 = 0, $111 = 0, $112 = 0, $113 = 0, $114 = 0, $115 = 0, $116 = 0, $117 = 0, $118 = 0, $119 = 0, $12 = 0, $120 = 0, $121 = 0, $122 = 0, $123 = 0, $124 = 0, $125 = 0, $127 = 0, $128 = 0, $129 = 0, $131 = 0, $132 = 0, $14 = 0, $140 = 0, $141 = 0, $143 = 0, $146 = 0, $148 = 0, $151 = 0, $154 = 0, $158 = 0, $159 = 0, $16 = 0, $160 = 0, $161 = 0, $165 = 0, $168 = 0, $174 = 0, $175 = 0, $176 = 0, $177 = 0, $178 = 0, $179 = 0, $18 = 0, $180 = 0, $181 = 0, $182 = 0, $183 = 0, $184 = 0, $185 = 0, $186 = 0, $187 = 0, $188 = 0, $189 = 0, $190 = 0, $191 = 0, $192 = 0, $2 = 0, $20 = 0, $22 = 0, $24 = 0, $26 = 0, $28 = 0, $32 = 0, $34 = 0, $36 = 0, $4 = 0, $42 = 0, $44 = 0, $47 = 0, $48 = 0, $49 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0, $68 = 0, $70 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $78 = 0, $79 = 0, $8 = 0, $80 = 0, $81 = 0, $82 = 0, $83 = 0, $84 = 0, $85 = 0, $86 = 0, $87 = 0, $88 = 0, $89 = 0, $90 = 0, $91 = 0, $92 = 0, $93 = 0, $ReallocAsyncCtx = 0, $ReallocAsyncCtx2 = 0, $ReallocAsyncCtx3 = 0, $ReallocAsyncCtx4 = 0, $ReallocAsyncCtx5 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 6494
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 6496
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 6498
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 6500
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 6502
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 6504
 $12 = HEAP8[$0 + 24 >> 0] & 1; //@line 6507
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 6509
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 6511
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 6513
 $20 = HEAP32[$0 + 40 >> 2] | 0; //@line 6515
 $22 = HEAP32[$0 + 44 >> 2] | 0; //@line 6517
 $24 = HEAP32[$0 + 48 >> 2] | 0; //@line 6519
 $26 = HEAP32[$0 + 52 >> 2] | 0; //@line 6521
 $28 = HEAP32[$0 + 56 >> 2] | 0; //@line 6523
 $32 = HEAP32[$0 + 64 >> 2] | 0; //@line 6527
 $34 = HEAP32[$0 + 68 >> 2] | 0; //@line 6529
 $36 = HEAP32[$0 + 72 >> 2] | 0; //@line 6531
 $$06992$reg2mem$0 = HEAP32[$0 + 76 >> 2] | 0; //@line 6536
 $$reg2mem$0 = HEAP32[$0 + 60 >> 2] | 0; //@line 6536
 $$reg2mem24$0 = HEAP32[$0 + 80 >> 2] | 0; //@line 6536
 while (1) {
  _equeue_mutex_lock($32); //@line 6538
  $125 = HEAP32[$34 >> 2] | 0; //@line 6539
  L4 : do {
   if (!$125) {
    $$02329$i$i = $34; //@line 6543
    label = 21; //@line 6544
   } else {
    $127 = HEAP32[$$06992$reg2mem$0 >> 2] | 0; //@line 6546
    $$025$i$i = $34; //@line 6547
    $129 = $125; //@line 6547
    while (1) {
     $128 = HEAP32[$129 >> 2] | 0; //@line 6549
     if ($128 >>> 0 >= $127 >>> 0) {
      break;
     }
     $131 = $129 + 8 | 0; //@line 6554
     $132 = HEAP32[$131 >> 2] | 0; //@line 6555
     if (!$132) {
      $$02329$i$i = $131; //@line 6558
      label = 21; //@line 6559
      break L4;
     } else {
      $$025$i$i = $131; //@line 6562
      $129 = $132; //@line 6562
     }
    }
    if (($128 | 0) == ($127 | 0)) {
     HEAP32[$$06992$reg2mem$0 + 12 >> 2] = $129; //@line 6568
     $$02330$i$i = $$025$i$i; //@line 6571
     $$sink$in$i$i = (HEAP32[$$025$i$i >> 2] | 0) + 8 | 0; //@line 6571
    } else {
     $$02329$i$i = $$025$i$i; //@line 6573
     label = 21; //@line 6574
    }
   }
  } while (0);
  if ((label | 0) == 21) {
   label = 0; //@line 6579
   HEAP32[$$06992$reg2mem$0 + 12 >> 2] = 0; //@line 6581
   $$02330$i$i = $$02329$i$i; //@line 6582
   $$sink$in$i$i = $$02329$i$i; //@line 6582
  }
  HEAP32[$$reg2mem24$0 >> 2] = HEAP32[$$sink$in$i$i >> 2]; //@line 6585
  HEAP32[$$02330$i$i >> 2] = $$06992$reg2mem$0; //@line 6586
  _equeue_mutex_unlock($32); //@line 6587
  if (!$$reg2mem$0) {
   label = 24; //@line 6590
   break;
  }
  $$reg2mem24$0 = $$reg2mem$0 + 8 | 0; //@line 6593
  $42 = HEAP32[$$reg2mem24$0 >> 2] | 0; //@line 6594
  $44 = HEAP32[$$reg2mem$0 + 32 >> 2] | 0; //@line 6596
  if ($44 | 0) {
   label = 3; //@line 6599
   break;
  }
  $68 = HEAP32[$$reg2mem$0 + 24 >> 2] | 0; //@line 6603
  if (($68 | 0) > -1) {
   label = 7; //@line 6606
   break;
  }
  $92 = $$reg2mem$0 + 4 | 0; //@line 6610
  $93 = HEAP8[$92 >> 0] | 0; //@line 6611
  HEAP8[$92 >> 0] = (($93 + 1 & 255) << HEAP32[$36 >> 2] | 0) == 0 ? 1 : ($93 & 255) + 1 & 255; //@line 6620
  $102 = HEAP32[$$reg2mem$0 + 28 >> 2] | 0; //@line 6622
  if ($102 | 0) {
   label = 11; //@line 6627
   break;
  } else {
   $$06992$reg2mem$0$phi = $$reg2mem$0; //@line 6625
   $$reg2mem$0 = $42; //@line 6625
   $$06992$reg2mem$0 = $$06992$reg2mem$0$phi; //@line 6625
  }
 }
 if ((label | 0) == 3) {
  $ReallocAsyncCtx = _emscripten_realloc_async_context(84) | 0; //@line 6633
  FUNCTION_TABLE_vi[$44 & 255]($$reg2mem$0 + 36 | 0); //@line 6634
  if (___async) {
   HEAP32[$ReallocAsyncCtx >> 2] = 30; //@line 6637
   $47 = $ReallocAsyncCtx + 4 | 0; //@line 6638
   HEAP32[$47 >> 2] = $2; //@line 6639
   $48 = $ReallocAsyncCtx + 8 | 0; //@line 6640
   HEAP32[$48 >> 2] = $4; //@line 6641
   $49 = $ReallocAsyncCtx + 12 | 0; //@line 6642
   HEAP32[$49 >> 2] = $6; //@line 6643
   $50 = $ReallocAsyncCtx + 16 | 0; //@line 6644
   HEAP32[$50 >> 2] = $8; //@line 6645
   $51 = $ReallocAsyncCtx + 20 | 0; //@line 6646
   HEAP32[$51 >> 2] = $10; //@line 6647
   $52 = $ReallocAsyncCtx + 24 | 0; //@line 6648
   $$expand_i1_val = $12 & 1; //@line 6649
   HEAP8[$52 >> 0] = $$expand_i1_val; //@line 6650
   $53 = $ReallocAsyncCtx + 28 | 0; //@line 6651
   HEAP32[$53 >> 2] = $14; //@line 6652
   $54 = $ReallocAsyncCtx + 32 | 0; //@line 6653
   HEAP32[$54 >> 2] = $16; //@line 6654
   $55 = $ReallocAsyncCtx + 36 | 0; //@line 6655
   HEAP32[$55 >> 2] = $18; //@line 6656
   $56 = $ReallocAsyncCtx + 40 | 0; //@line 6657
   HEAP32[$56 >> 2] = $20; //@line 6658
   $57 = $ReallocAsyncCtx + 44 | 0; //@line 6659
   HEAP32[$57 >> 2] = $22; //@line 6660
   $58 = $ReallocAsyncCtx + 48 | 0; //@line 6661
   HEAP32[$58 >> 2] = $24; //@line 6662
   $59 = $ReallocAsyncCtx + 52 | 0; //@line 6663
   HEAP32[$59 >> 2] = $26; //@line 6664
   $60 = $ReallocAsyncCtx + 56 | 0; //@line 6665
   HEAP32[$60 >> 2] = $28; //@line 6666
   $61 = $ReallocAsyncCtx + 60 | 0; //@line 6667
   HEAP32[$61 >> 2] = $$reg2mem$0; //@line 6668
   $62 = $ReallocAsyncCtx + 64 | 0; //@line 6669
   HEAP32[$62 >> 2] = $42; //@line 6670
   $63 = $ReallocAsyncCtx + 68 | 0; //@line 6671
   HEAP32[$63 >> 2] = $32; //@line 6672
   $64 = $ReallocAsyncCtx + 72 | 0; //@line 6673
   HEAP32[$64 >> 2] = $34; //@line 6674
   $65 = $ReallocAsyncCtx + 76 | 0; //@line 6675
   HEAP32[$65 >> 2] = $36; //@line 6676
   $66 = $ReallocAsyncCtx + 80 | 0; //@line 6677
   HEAP32[$66 >> 2] = $$reg2mem24$0; //@line 6678
   sp = STACKTOP; //@line 6679
   return;
  }
  ___async_unwind = 0; //@line 6682
  HEAP32[$ReallocAsyncCtx >> 2] = 30; //@line 6683
  $47 = $ReallocAsyncCtx + 4 | 0; //@line 6684
  HEAP32[$47 >> 2] = $2; //@line 6685
  $48 = $ReallocAsyncCtx + 8 | 0; //@line 6686
  HEAP32[$48 >> 2] = $4; //@line 6687
  $49 = $ReallocAsyncCtx + 12 | 0; //@line 6688
  HEAP32[$49 >> 2] = $6; //@line 6689
  $50 = $ReallocAsyncCtx + 16 | 0; //@line 6690
  HEAP32[$50 >> 2] = $8; //@line 6691
  $51 = $ReallocAsyncCtx + 20 | 0; //@line 6692
  HEAP32[$51 >> 2] = $10; //@line 6693
  $52 = $ReallocAsyncCtx + 24 | 0; //@line 6694
  $$expand_i1_val = $12 & 1; //@line 6695
  HEAP8[$52 >> 0] = $$expand_i1_val; //@line 6696
  $53 = $ReallocAsyncCtx + 28 | 0; //@line 6697
  HEAP32[$53 >> 2] = $14; //@line 6698
  $54 = $ReallocAsyncCtx + 32 | 0; //@line 6699
  HEAP32[$54 >> 2] = $16; //@line 6700
  $55 = $ReallocAsyncCtx + 36 | 0; //@line 6701
  HEAP32[$55 >> 2] = $18; //@line 6702
  $56 = $ReallocAsyncCtx + 40 | 0; //@line 6703
  HEAP32[$56 >> 2] = $20; //@line 6704
  $57 = $ReallocAsyncCtx + 44 | 0; //@line 6705
  HEAP32[$57 >> 2] = $22; //@line 6706
  $58 = $ReallocAsyncCtx + 48 | 0; //@line 6707
  HEAP32[$58 >> 2] = $24; //@line 6708
  $59 = $ReallocAsyncCtx + 52 | 0; //@line 6709
  HEAP32[$59 >> 2] = $26; //@line 6710
  $60 = $ReallocAsyncCtx + 56 | 0; //@line 6711
  HEAP32[$60 >> 2] = $28; //@line 6712
  $61 = $ReallocAsyncCtx + 60 | 0; //@line 6713
  HEAP32[$61 >> 2] = $$reg2mem$0; //@line 6714
  $62 = $ReallocAsyncCtx + 64 | 0; //@line 6715
  HEAP32[$62 >> 2] = $42; //@line 6716
  $63 = $ReallocAsyncCtx + 68 | 0; //@line 6717
  HEAP32[$63 >> 2] = $32; //@line 6718
  $64 = $ReallocAsyncCtx + 72 | 0; //@line 6719
  HEAP32[$64 >> 2] = $34; //@line 6720
  $65 = $ReallocAsyncCtx + 76 | 0; //@line 6721
  HEAP32[$65 >> 2] = $36; //@line 6722
  $66 = $ReallocAsyncCtx + 80 | 0; //@line 6723
  HEAP32[$66 >> 2] = $$reg2mem24$0; //@line 6724
  sp = STACKTOP; //@line 6725
  return;
 } else if ((label | 0) == 7) {
  $70 = $$reg2mem$0 + 20 | 0; //@line 6729
  HEAP32[$70 >> 2] = (HEAP32[$70 >> 2] | 0) + $68; //@line 6732
  $73 = _equeue_tick() | 0; //@line 6733
  $ReallocAsyncCtx4 = _emscripten_realloc_async_context(76) | 0; //@line 6734
  _equeue_enqueue($8, $$reg2mem$0, $73) | 0; //@line 6735
  if (___async) {
   HEAP32[$ReallocAsyncCtx4 >> 2] = 31; //@line 6738
   $74 = $ReallocAsyncCtx4 + 4 | 0; //@line 6739
   HEAP32[$74 >> 2] = $2; //@line 6740
   $75 = $ReallocAsyncCtx4 + 8 | 0; //@line 6741
   HEAP32[$75 >> 2] = $4; //@line 6742
   $76 = $ReallocAsyncCtx4 + 12 | 0; //@line 6743
   HEAP32[$76 >> 2] = $6; //@line 6744
   $77 = $ReallocAsyncCtx4 + 16 | 0; //@line 6745
   HEAP32[$77 >> 2] = $8; //@line 6746
   $78 = $ReallocAsyncCtx4 + 20 | 0; //@line 6747
   HEAP32[$78 >> 2] = $10; //@line 6748
   $79 = $ReallocAsyncCtx4 + 24 | 0; //@line 6749
   $$expand_i1_val31 = $12 & 1; //@line 6750
   HEAP8[$79 >> 0] = $$expand_i1_val31; //@line 6751
   $80 = $ReallocAsyncCtx4 + 28 | 0; //@line 6752
   HEAP32[$80 >> 2] = $14; //@line 6753
   $81 = $ReallocAsyncCtx4 + 32 | 0; //@line 6754
   HEAP32[$81 >> 2] = $16; //@line 6755
   $82 = $ReallocAsyncCtx4 + 36 | 0; //@line 6756
   HEAP32[$82 >> 2] = $18; //@line 6757
   $83 = $ReallocAsyncCtx4 + 40 | 0; //@line 6758
   HEAP32[$83 >> 2] = $20; //@line 6759
   $84 = $ReallocAsyncCtx4 + 44 | 0; //@line 6760
   HEAP32[$84 >> 2] = $22; //@line 6761
   $85 = $ReallocAsyncCtx4 + 48 | 0; //@line 6762
   HEAP32[$85 >> 2] = $24; //@line 6763
   $86 = $ReallocAsyncCtx4 + 52 | 0; //@line 6764
   HEAP32[$86 >> 2] = $26; //@line 6765
   $87 = $ReallocAsyncCtx4 + 56 | 0; //@line 6766
   HEAP32[$87 >> 2] = $28; //@line 6767
   $88 = $ReallocAsyncCtx4 + 60 | 0; //@line 6768
   HEAP32[$88 >> 2] = $32; //@line 6769
   $89 = $ReallocAsyncCtx4 + 64 | 0; //@line 6770
   HEAP32[$89 >> 2] = $34; //@line 6771
   $90 = $ReallocAsyncCtx4 + 68 | 0; //@line 6772
   HEAP32[$90 >> 2] = $36; //@line 6773
   $91 = $ReallocAsyncCtx4 + 72 | 0; //@line 6774
   HEAP32[$91 >> 2] = $42; //@line 6775
   sp = STACKTOP; //@line 6776
   return;
  }
  ___async_unwind = 0; //@line 6779
  HEAP32[$ReallocAsyncCtx4 >> 2] = 31; //@line 6780
  $74 = $ReallocAsyncCtx4 + 4 | 0; //@line 6781
  HEAP32[$74 >> 2] = $2; //@line 6782
  $75 = $ReallocAsyncCtx4 + 8 | 0; //@line 6783
  HEAP32[$75 >> 2] = $4; //@line 6784
  $76 = $ReallocAsyncCtx4 + 12 | 0; //@line 6785
  HEAP32[$76 >> 2] = $6; //@line 6786
  $77 = $ReallocAsyncCtx4 + 16 | 0; //@line 6787
  HEAP32[$77 >> 2] = $8; //@line 6788
  $78 = $ReallocAsyncCtx4 + 20 | 0; //@line 6789
  HEAP32[$78 >> 2] = $10; //@line 6790
  $79 = $ReallocAsyncCtx4 + 24 | 0; //@line 6791
  $$expand_i1_val31 = $12 & 1; //@line 6792
  HEAP8[$79 >> 0] = $$expand_i1_val31; //@line 6793
  $80 = $ReallocAsyncCtx4 + 28 | 0; //@line 6794
  HEAP32[$80 >> 2] = $14; //@line 6795
  $81 = $ReallocAsyncCtx4 + 32 | 0; //@line 6796
  HEAP32[$81 >> 2] = $16; //@line 6797
  $82 = $ReallocAsyncCtx4 + 36 | 0; //@line 6798
  HEAP32[$82 >> 2] = $18; //@line 6799
  $83 = $ReallocAsyncCtx4 + 40 | 0; //@line 6800
  HEAP32[$83 >> 2] = $20; //@line 6801
  $84 = $ReallocAsyncCtx4 + 44 | 0; //@line 6802
  HEAP32[$84 >> 2] = $22; //@line 6803
  $85 = $ReallocAsyncCtx4 + 48 | 0; //@line 6804
  HEAP32[$85 >> 2] = $24; //@line 6805
  $86 = $ReallocAsyncCtx4 + 52 | 0; //@line 6806
  HEAP32[$86 >> 2] = $26; //@line 6807
  $87 = $ReallocAsyncCtx4 + 56 | 0; //@line 6808
  HEAP32[$87 >> 2] = $28; //@line 6809
  $88 = $ReallocAsyncCtx4 + 60 | 0; //@line 6810
  HEAP32[$88 >> 2] = $32; //@line 6811
  $89 = $ReallocAsyncCtx4 + 64 | 0; //@line 6812
  HEAP32[$89 >> 2] = $34; //@line 6813
  $90 = $ReallocAsyncCtx4 + 68 | 0; //@line 6814
  HEAP32[$90 >> 2] = $36; //@line 6815
  $91 = $ReallocAsyncCtx4 + 72 | 0; //@line 6816
  HEAP32[$91 >> 2] = $42; //@line 6817
  sp = STACKTOP; //@line 6818
  return;
 } else if ((label | 0) == 11) {
  $ReallocAsyncCtx2 = _emscripten_realloc_async_context(84) | 0; //@line 6823
  FUNCTION_TABLE_vi[$102 & 255]($$reg2mem$0 + 36 | 0); //@line 6824
  if (___async) {
   HEAP32[$ReallocAsyncCtx2 >> 2] = 32; //@line 6827
   $105 = $ReallocAsyncCtx2 + 4 | 0; //@line 6828
   HEAP32[$105 >> 2] = $2; //@line 6829
   $106 = $ReallocAsyncCtx2 + 8 | 0; //@line 6830
   HEAP32[$106 >> 2] = $4; //@line 6831
   $107 = $ReallocAsyncCtx2 + 12 | 0; //@line 6832
   HEAP32[$107 >> 2] = $6; //@line 6833
   $108 = $ReallocAsyncCtx2 + 16 | 0; //@line 6834
   HEAP32[$108 >> 2] = $8; //@line 6835
   $109 = $ReallocAsyncCtx2 + 20 | 0; //@line 6836
   HEAP32[$109 >> 2] = $10; //@line 6837
   $110 = $ReallocAsyncCtx2 + 24 | 0; //@line 6838
   $$expand_i1_val33 = $12 & 1; //@line 6839
   HEAP8[$110 >> 0] = $$expand_i1_val33; //@line 6840
   $111 = $ReallocAsyncCtx2 + 28 | 0; //@line 6841
   HEAP32[$111 >> 2] = $14; //@line 6842
   $112 = $ReallocAsyncCtx2 + 32 | 0; //@line 6843
   HEAP32[$112 >> 2] = $16; //@line 6844
   $113 = $ReallocAsyncCtx2 + 36 | 0; //@line 6845
   HEAP32[$113 >> 2] = $18; //@line 6846
   $114 = $ReallocAsyncCtx2 + 40 | 0; //@line 6847
   HEAP32[$114 >> 2] = $20; //@line 6848
   $115 = $ReallocAsyncCtx2 + 44 | 0; //@line 6849
   HEAP32[$115 >> 2] = $22; //@line 6850
   $116 = $ReallocAsyncCtx2 + 48 | 0; //@line 6851
   HEAP32[$116 >> 2] = $24; //@line 6852
   $117 = $ReallocAsyncCtx2 + 52 | 0; //@line 6853
   HEAP32[$117 >> 2] = $26; //@line 6854
   $118 = $ReallocAsyncCtx2 + 56 | 0; //@line 6855
   HEAP32[$118 >> 2] = $28; //@line 6856
   $119 = $ReallocAsyncCtx2 + 60 | 0; //@line 6857
   HEAP32[$119 >> 2] = $42; //@line 6858
   $120 = $ReallocAsyncCtx2 + 64 | 0; //@line 6859
   HEAP32[$120 >> 2] = $32; //@line 6860
   $121 = $ReallocAsyncCtx2 + 68 | 0; //@line 6861
   HEAP32[$121 >> 2] = $34; //@line 6862
   $122 = $ReallocAsyncCtx2 + 72 | 0; //@line 6863
   HEAP32[$122 >> 2] = $36; //@line 6864
   $123 = $ReallocAsyncCtx2 + 76 | 0; //@line 6865
   HEAP32[$123 >> 2] = $$reg2mem$0; //@line 6866
   $124 = $ReallocAsyncCtx2 + 80 | 0; //@line 6867
   HEAP32[$124 >> 2] = $$reg2mem24$0; //@line 6868
   sp = STACKTOP; //@line 6869
   return;
  }
  ___async_unwind = 0; //@line 6872
  HEAP32[$ReallocAsyncCtx2 >> 2] = 32; //@line 6873
  $105 = $ReallocAsyncCtx2 + 4 | 0; //@line 6874
  HEAP32[$105 >> 2] = $2; //@line 6875
  $106 = $ReallocAsyncCtx2 + 8 | 0; //@line 6876
  HEAP32[$106 >> 2] = $4; //@line 6877
  $107 = $ReallocAsyncCtx2 + 12 | 0; //@line 6878
  HEAP32[$107 >> 2] = $6; //@line 6879
  $108 = $ReallocAsyncCtx2 + 16 | 0; //@line 6880
  HEAP32[$108 >> 2] = $8; //@line 6881
  $109 = $ReallocAsyncCtx2 + 20 | 0; //@line 6882
  HEAP32[$109 >> 2] = $10; //@line 6883
  $110 = $ReallocAsyncCtx2 + 24 | 0; //@line 6884
  $$expand_i1_val33 = $12 & 1; //@line 6885
  HEAP8[$110 >> 0] = $$expand_i1_val33; //@line 6886
  $111 = $ReallocAsyncCtx2 + 28 | 0; //@line 6887
  HEAP32[$111 >> 2] = $14; //@line 6888
  $112 = $ReallocAsyncCtx2 + 32 | 0; //@line 6889
  HEAP32[$112 >> 2] = $16; //@line 6890
  $113 = $ReallocAsyncCtx2 + 36 | 0; //@line 6891
  HEAP32[$113 >> 2] = $18; //@line 6892
  $114 = $ReallocAsyncCtx2 + 40 | 0; //@line 6893
  HEAP32[$114 >> 2] = $20; //@line 6894
  $115 = $ReallocAsyncCtx2 + 44 | 0; //@line 6895
  HEAP32[$115 >> 2] = $22; //@line 6896
  $116 = $ReallocAsyncCtx2 + 48 | 0; //@line 6897
  HEAP32[$116 >> 2] = $24; //@line 6898
  $117 = $ReallocAsyncCtx2 + 52 | 0; //@line 6899
  HEAP32[$117 >> 2] = $26; //@line 6900
  $118 = $ReallocAsyncCtx2 + 56 | 0; //@line 6901
  HEAP32[$118 >> 2] = $28; //@line 6902
  $119 = $ReallocAsyncCtx2 + 60 | 0; //@line 6903
  HEAP32[$119 >> 2] = $42; //@line 6904
  $120 = $ReallocAsyncCtx2 + 64 | 0; //@line 6905
  HEAP32[$120 >> 2] = $32; //@line 6906
  $121 = $ReallocAsyncCtx2 + 68 | 0; //@line 6907
  HEAP32[$121 >> 2] = $34; //@line 6908
  $122 = $ReallocAsyncCtx2 + 72 | 0; //@line 6909
  HEAP32[$122 >> 2] = $36; //@line 6910
  $123 = $ReallocAsyncCtx2 + 76 | 0; //@line 6911
  HEAP32[$123 >> 2] = $$reg2mem$0; //@line 6912
  $124 = $ReallocAsyncCtx2 + 80 | 0; //@line 6913
  HEAP32[$124 >> 2] = $$reg2mem24$0; //@line 6914
  sp = STACKTOP; //@line 6915
  return;
 } else if ((label | 0) == 24) {
  $140 = _equeue_tick() | 0; //@line 6919
  if ($12) {
   $141 = $10 - $140 | 0; //@line 6921
   if (($141 | 0) < 1) {
    $143 = $8 + 40 | 0; //@line 6924
    if (HEAP32[$143 >> 2] | 0) {
     _equeue_mutex_lock($2); //@line 6928
     $146 = HEAP32[$143 >> 2] | 0; //@line 6929
     if ($146 | 0) {
      $148 = HEAP32[$26 >> 2] | 0; //@line 6932
      if ($148 | 0) {
       $151 = HEAP32[$8 + 44 >> 2] | 0; //@line 6936
       $154 = (HEAP32[$148 + 20 >> 2] | 0) - $140 | 0; //@line 6939
       $ReallocAsyncCtx3 = _emscripten_realloc_async_context(16) | 0; //@line 6943
       FUNCTION_TABLE_vii[$146 & 3]($151, $154 & ~($154 >> 31)); //@line 6944
       if (___async) {
        HEAP32[$ReallocAsyncCtx3 >> 2] = 33; //@line 6947
        $158 = $ReallocAsyncCtx3 + 4 | 0; //@line 6948
        HEAP32[$158 >> 2] = $18; //@line 6949
        $159 = $ReallocAsyncCtx3 + 8 | 0; //@line 6950
        HEAP32[$159 >> 2] = $2; //@line 6951
        $160 = $ReallocAsyncCtx3 + 12 | 0; //@line 6952
        HEAP32[$160 >> 2] = $16; //@line 6953
        sp = STACKTOP; //@line 6954
        return;
       }
       ___async_unwind = 0; //@line 6957
       HEAP32[$ReallocAsyncCtx3 >> 2] = 33; //@line 6958
       $158 = $ReallocAsyncCtx3 + 4 | 0; //@line 6959
       HEAP32[$158 >> 2] = $18; //@line 6960
       $159 = $ReallocAsyncCtx3 + 8 | 0; //@line 6961
       HEAP32[$159 >> 2] = $2; //@line 6962
       $160 = $ReallocAsyncCtx3 + 12 | 0; //@line 6963
       HEAP32[$160 >> 2] = $16; //@line 6964
       sp = STACKTOP; //@line 6965
       return;
      }
     }
     HEAP8[$18 >> 0] = 1; //@line 6969
     _equeue_mutex_unlock($2); //@line 6970
    }
    HEAP8[$16 >> 0] = 0; //@line 6972
    return;
   } else {
    $$067 = $141; //@line 6975
   }
  } else {
   $$067 = -1; //@line 6978
  }
  _equeue_mutex_lock($2); //@line 6980
  $161 = HEAP32[$26 >> 2] | 0; //@line 6981
  if (!$161) {
   $$2 = $$067; //@line 6984
  } else {
   $165 = (HEAP32[$161 + 20 >> 2] | 0) - $140 | 0; //@line 6988
   $168 = $165 & ~($165 >> 31); //@line 6991
   $$2 = $168 >>> 0 < $$067 >>> 0 ? $168 : $$067; //@line 6994
  }
  _equeue_mutex_unlock($2); //@line 6996
  _equeue_sema_wait($28, $$2) | 0; //@line 6997
  do {
   if (HEAP8[$16 >> 0] | 0) {
    _equeue_mutex_lock($2); //@line 7002
    if (!(HEAP8[$16 >> 0] | 0)) {
     _equeue_mutex_unlock($2); //@line 7006
     break;
    }
    HEAP8[$16 >> 0] = 0; //@line 7009
    _equeue_mutex_unlock($2); //@line 7010
    return;
   }
  } while (0);
  $174 = _equeue_tick() | 0; //@line 7014
  $ReallocAsyncCtx5 = _emscripten_realloc_async_context(76) | 0; //@line 7015
  _wait_ms(20); //@line 7016
  if (___async) {
   HEAP32[$ReallocAsyncCtx5 >> 2] = 34; //@line 7019
   $175 = $ReallocAsyncCtx5 + 4 | 0; //@line 7020
   HEAP32[$175 >> 2] = $2; //@line 7021
   $176 = $ReallocAsyncCtx5 + 8 | 0; //@line 7022
   HEAP32[$176 >> 2] = $174; //@line 7023
   $177 = $ReallocAsyncCtx5 + 12 | 0; //@line 7024
   HEAP32[$177 >> 2] = $4; //@line 7025
   $178 = $ReallocAsyncCtx5 + 16 | 0; //@line 7026
   HEAP32[$178 >> 2] = $6; //@line 7027
   $179 = $ReallocAsyncCtx5 + 20 | 0; //@line 7028
   HEAP32[$179 >> 2] = $8; //@line 7029
   $180 = $ReallocAsyncCtx5 + 24 | 0; //@line 7030
   HEAP32[$180 >> 2] = $10; //@line 7031
   $181 = $ReallocAsyncCtx5 + 28 | 0; //@line 7032
   $$expand_i1_val35 = $12 & 1; //@line 7033
   HEAP8[$181 >> 0] = $$expand_i1_val35; //@line 7034
   $182 = $ReallocAsyncCtx5 + 32 | 0; //@line 7035
   HEAP32[$182 >> 2] = $14; //@line 7036
   $183 = $ReallocAsyncCtx5 + 36 | 0; //@line 7037
   HEAP32[$183 >> 2] = $16; //@line 7038
   $184 = $ReallocAsyncCtx5 + 40 | 0; //@line 7039
   HEAP32[$184 >> 2] = $18; //@line 7040
   $185 = $ReallocAsyncCtx5 + 44 | 0; //@line 7041
   HEAP32[$185 >> 2] = $20; //@line 7042
   $186 = $ReallocAsyncCtx5 + 48 | 0; //@line 7043
   HEAP32[$186 >> 2] = $22; //@line 7044
   $187 = $ReallocAsyncCtx5 + 52 | 0; //@line 7045
   HEAP32[$187 >> 2] = $24; //@line 7046
   $188 = $ReallocAsyncCtx5 + 56 | 0; //@line 7047
   HEAP32[$188 >> 2] = $26; //@line 7048
   $189 = $ReallocAsyncCtx5 + 60 | 0; //@line 7049
   HEAP32[$189 >> 2] = $28; //@line 7050
   $190 = $ReallocAsyncCtx5 + 64 | 0; //@line 7051
   HEAP32[$190 >> 2] = $32; //@line 7052
   $191 = $ReallocAsyncCtx5 + 68 | 0; //@line 7053
   HEAP32[$191 >> 2] = $34; //@line 7054
   $192 = $ReallocAsyncCtx5 + 72 | 0; //@line 7055
   HEAP32[$192 >> 2] = $36; //@line 7056
   sp = STACKTOP; //@line 7057
   return;
  }
  ___async_unwind = 0; //@line 7060
  HEAP32[$ReallocAsyncCtx5 >> 2] = 34; //@line 7061
  $175 = $ReallocAsyncCtx5 + 4 | 0; //@line 7062
  HEAP32[$175 >> 2] = $2; //@line 7063
  $176 = $ReallocAsyncCtx5 + 8 | 0; //@line 7064
  HEAP32[$176 >> 2] = $174; //@line 7065
  $177 = $ReallocAsyncCtx5 + 12 | 0; //@line 7066
  HEAP32[$177 >> 2] = $4; //@line 7067
  $178 = $ReallocAsyncCtx5 + 16 | 0; //@line 7068
  HEAP32[$178 >> 2] = $6; //@line 7069
  $179 = $ReallocAsyncCtx5 + 20 | 0; //@line 7070
  HEAP32[$179 >> 2] = $8; //@line 7071
  $180 = $ReallocAsyncCtx5 + 24 | 0; //@line 7072
  HEAP32[$180 >> 2] = $10; //@line 7073
  $181 = $ReallocAsyncCtx5 + 28 | 0; //@line 7074
  $$expand_i1_val35 = $12 & 1; //@line 7075
  HEAP8[$181 >> 0] = $$expand_i1_val35; //@line 7076
  $182 = $ReallocAsyncCtx5 + 32 | 0; //@line 7077
  HEAP32[$182 >> 2] = $14; //@line 7078
  $183 = $ReallocAsyncCtx5 + 36 | 0; //@line 7079
  HEAP32[$183 >> 2] = $16; //@line 7080
  $184 = $ReallocAsyncCtx5 + 40 | 0; //@line 7081
  HEAP32[$184 >> 2] = $18; //@line 7082
  $185 = $ReallocAsyncCtx5 + 44 | 0; //@line 7083
  HEAP32[$185 >> 2] = $20; //@line 7084
  $186 = $ReallocAsyncCtx5 + 48 | 0; //@line 7085
  HEAP32[$186 >> 2] = $22; //@line 7086
  $187 = $ReallocAsyncCtx5 + 52 | 0; //@line 7087
  HEAP32[$187 >> 2] = $24; //@line 7088
  $188 = $ReallocAsyncCtx5 + 56 | 0; //@line 7089
  HEAP32[$188 >> 2] = $26; //@line 7090
  $189 = $ReallocAsyncCtx5 + 60 | 0; //@line 7091
  HEAP32[$189 >> 2] = $28; //@line 7092
  $190 = $ReallocAsyncCtx5 + 64 | 0; //@line 7093
  HEAP32[$190 >> 2] = $32; //@line 7094
  $191 = $ReallocAsyncCtx5 + 68 | 0; //@line 7095
  HEAP32[$191 >> 2] = $34; //@line 7096
  $192 = $ReallocAsyncCtx5 + 72 | 0; //@line 7097
  HEAP32[$192 >> 2] = $36; //@line 7098
  sp = STACKTOP; //@line 7099
  return;
 }
}
function _equeue_dispatch__async_cb_65($0) {
 $0 = $0 | 0;
 var $$02329$i$i = 0, $$02330$i$i = 0, $$025$i$i = 0, $$067 = 0, $$2 = 0, $$expand_i1_val = 0, $$expand_i1_val12 = 0, $$expand_i1_val14 = 0, $$expand_i1_val16 = 0, $$reg2mem$0 = 0, $$sink$in$i$i = 0, $10 = 0, $101 = 0, $102 = 0, $103 = 0, $104 = 0, $105 = 0, $106 = 0, $107 = 0, $108 = 0, $109 = 0, $110 = 0, $111 = 0, $112 = 0, $113 = 0, $114 = 0, $115 = 0, $116 = 0, $117 = 0, $118 = 0, $119 = 0, $12 = 0, $120 = 0, $121 = 0, $123 = 0, $124 = 0, $125 = 0, $127 = 0, $128 = 0, $136 = 0, $137 = 0, $139 = 0, $14 = 0, $142 = 0, $144 = 0, $147 = 0, $150 = 0, $154 = 0, $155 = 0, $156 = 0, $157 = 0, $16 = 0, $161 = 0, $164 = 0, $170 = 0, $171 = 0, $172 = 0, $173 = 0, $174 = 0, $175 = 0, $176 = 0, $177 = 0, $178 = 0, $179 = 0, $18 = 0, $180 = 0, $181 = 0, $182 = 0, $183 = 0, $184 = 0, $185 = 0, $186 = 0, $187 = 0, $188 = 0, $2 = 0, $20 = 0, $22 = 0, $24 = 0, $26 = 0, $28 = 0, $30 = 0, $32 = 0, $34 = 0, $37 = 0, $38 = 0, $4 = 0, $40 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0, $64 = 0, $66 = 0, $69 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $78 = 0, $79 = 0, $8 = 0, $80 = 0, $81 = 0, $82 = 0, $83 = 0, $84 = 0, $85 = 0, $86 = 0, $87 = 0, $88 = 0, $89 = 0, $98 = 0, $ReallocAsyncCtx = 0, $ReallocAsyncCtx2 = 0, $ReallocAsyncCtx3 = 0, $ReallocAsyncCtx4 = 0, $ReallocAsyncCtx5 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 7131
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 7133
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 7135
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 7137
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 7139
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 7141
 $12 = HEAP8[$0 + 24 >> 0] & 1; //@line 7144
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 7146
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 7148
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 7150
 $20 = HEAP32[$0 + 40 >> 2] | 0; //@line 7152
 $22 = HEAP32[$0 + 44 >> 2] | 0; //@line 7154
 $24 = HEAP32[$0 + 48 >> 2] | 0; //@line 7156
 $26 = HEAP32[$0 + 52 >> 2] | 0; //@line 7158
 $28 = HEAP32[$0 + 56 >> 2] | 0; //@line 7160
 $30 = HEAP32[$0 + 60 >> 2] | 0; //@line 7162
 $32 = HEAP32[$0 + 64 >> 2] | 0; //@line 7164
 $34 = HEAP32[$0 + 68 >> 2] | 0; //@line 7166
 $$reg2mem$0 = HEAP32[$0 + 72 >> 2] | 0; //@line 7169
 while (1) {
  if (!$$reg2mem$0) {
   label = 24; //@line 7173
   break;
  }
  $37 = $$reg2mem$0 + 8 | 0; //@line 7176
  $38 = HEAP32[$37 >> 2] | 0; //@line 7177
  $40 = HEAP32[$$reg2mem$0 + 32 >> 2] | 0; //@line 7179
  if ($40 | 0) {
   label = 3; //@line 7182
   break;
  }
  $64 = HEAP32[$$reg2mem$0 + 24 >> 2] | 0; //@line 7186
  if (($64 | 0) > -1) {
   label = 7; //@line 7189
   break;
  }
  $88 = $$reg2mem$0 + 4 | 0; //@line 7193
  $89 = HEAP8[$88 >> 0] | 0; //@line 7194
  HEAP8[$88 >> 0] = (($89 + 1 & 255) << HEAP32[$34 >> 2] | 0) == 0 ? 1 : ($89 & 255) + 1 & 255; //@line 7203
  $98 = HEAP32[$$reg2mem$0 + 28 >> 2] | 0; //@line 7205
  if ($98 | 0) {
   label = 12; //@line 7208
   break;
  }
  _equeue_mutex_lock($30); //@line 7211
  $121 = HEAP32[$32 >> 2] | 0; //@line 7212
  L8 : do {
   if (!$121) {
    $$02329$i$i = $32; //@line 7216
    label = 21; //@line 7217
   } else {
    $123 = HEAP32[$$reg2mem$0 >> 2] | 0; //@line 7219
    $$025$i$i = $32; //@line 7220
    $125 = $121; //@line 7220
    while (1) {
     $124 = HEAP32[$125 >> 2] | 0; //@line 7222
     if ($124 >>> 0 >= $123 >>> 0) {
      break;
     }
     $127 = $125 + 8 | 0; //@line 7227
     $128 = HEAP32[$127 >> 2] | 0; //@line 7228
     if (!$128) {
      $$02329$i$i = $127; //@line 7231
      label = 21; //@line 7232
      break L8;
     } else {
      $$025$i$i = $127; //@line 7235
      $125 = $128; //@line 7235
     }
    }
    if (($124 | 0) == ($123 | 0)) {
     HEAP32[$$reg2mem$0 + 12 >> 2] = $125; //@line 7241
     $$02330$i$i = $$025$i$i; //@line 7244
     $$sink$in$i$i = (HEAP32[$$025$i$i >> 2] | 0) + 8 | 0; //@line 7244
    } else {
     $$02329$i$i = $$025$i$i; //@line 7246
     label = 21; //@line 7247
    }
   }
  } while (0);
  if ((label | 0) == 21) {
   label = 0; //@line 7252
   HEAP32[$$reg2mem$0 + 12 >> 2] = 0; //@line 7254
   $$02330$i$i = $$02329$i$i; //@line 7255
   $$sink$in$i$i = $$02329$i$i; //@line 7255
  }
  HEAP32[$37 >> 2] = HEAP32[$$sink$in$i$i >> 2]; //@line 7258
  HEAP32[$$02330$i$i >> 2] = $$reg2mem$0; //@line 7259
  _equeue_mutex_unlock($30); //@line 7260
  $$reg2mem$0 = $38; //@line 7261
 }
 if ((label | 0) == 3) {
  $ReallocAsyncCtx = _emscripten_realloc_async_context(84) | 0; //@line 7265
  FUNCTION_TABLE_vi[$40 & 255]($$reg2mem$0 + 36 | 0); //@line 7266
  if (___async) {
   HEAP32[$ReallocAsyncCtx >> 2] = 30; //@line 7269
   $43 = $ReallocAsyncCtx + 4 | 0; //@line 7270
   HEAP32[$43 >> 2] = $2; //@line 7271
   $44 = $ReallocAsyncCtx + 8 | 0; //@line 7272
   HEAP32[$44 >> 2] = $4; //@line 7273
   $45 = $ReallocAsyncCtx + 12 | 0; //@line 7274
   HEAP32[$45 >> 2] = $6; //@line 7275
   $46 = $ReallocAsyncCtx + 16 | 0; //@line 7276
   HEAP32[$46 >> 2] = $8; //@line 7277
   $47 = $ReallocAsyncCtx + 20 | 0; //@line 7278
   HEAP32[$47 >> 2] = $10; //@line 7279
   $48 = $ReallocAsyncCtx + 24 | 0; //@line 7280
   $$expand_i1_val = $12 & 1; //@line 7281
   HEAP8[$48 >> 0] = $$expand_i1_val; //@line 7282
   $49 = $ReallocAsyncCtx + 28 | 0; //@line 7283
   HEAP32[$49 >> 2] = $14; //@line 7284
   $50 = $ReallocAsyncCtx + 32 | 0; //@line 7285
   HEAP32[$50 >> 2] = $16; //@line 7286
   $51 = $ReallocAsyncCtx + 36 | 0; //@line 7287
   HEAP32[$51 >> 2] = $18; //@line 7288
   $52 = $ReallocAsyncCtx + 40 | 0; //@line 7289
   HEAP32[$52 >> 2] = $20; //@line 7290
   $53 = $ReallocAsyncCtx + 44 | 0; //@line 7291
   HEAP32[$53 >> 2] = $22; //@line 7292
   $54 = $ReallocAsyncCtx + 48 | 0; //@line 7293
   HEAP32[$54 >> 2] = $24; //@line 7294
   $55 = $ReallocAsyncCtx + 52 | 0; //@line 7295
   HEAP32[$55 >> 2] = $26; //@line 7296
   $56 = $ReallocAsyncCtx + 56 | 0; //@line 7297
   HEAP32[$56 >> 2] = $28; //@line 7298
   $57 = $ReallocAsyncCtx + 60 | 0; //@line 7299
   HEAP32[$57 >> 2] = $$reg2mem$0; //@line 7300
   $58 = $ReallocAsyncCtx + 64 | 0; //@line 7301
   HEAP32[$58 >> 2] = $38; //@line 7302
   $59 = $ReallocAsyncCtx + 68 | 0; //@line 7303
   HEAP32[$59 >> 2] = $30; //@line 7304
   $60 = $ReallocAsyncCtx + 72 | 0; //@line 7305
   HEAP32[$60 >> 2] = $32; //@line 7306
   $61 = $ReallocAsyncCtx + 76 | 0; //@line 7307
   HEAP32[$61 >> 2] = $34; //@line 7308
   $62 = $ReallocAsyncCtx + 80 | 0; //@line 7309
   HEAP32[$62 >> 2] = $37; //@line 7310
   sp = STACKTOP; //@line 7311
   return;
  }
  ___async_unwind = 0; //@line 7314
  HEAP32[$ReallocAsyncCtx >> 2] = 30; //@line 7315
  $43 = $ReallocAsyncCtx + 4 | 0; //@line 7316
  HEAP32[$43 >> 2] = $2; //@line 7317
  $44 = $ReallocAsyncCtx + 8 | 0; //@line 7318
  HEAP32[$44 >> 2] = $4; //@line 7319
  $45 = $ReallocAsyncCtx + 12 | 0; //@line 7320
  HEAP32[$45 >> 2] = $6; //@line 7321
  $46 = $ReallocAsyncCtx + 16 | 0; //@line 7322
  HEAP32[$46 >> 2] = $8; //@line 7323
  $47 = $ReallocAsyncCtx + 20 | 0; //@line 7324
  HEAP32[$47 >> 2] = $10; //@line 7325
  $48 = $ReallocAsyncCtx + 24 | 0; //@line 7326
  $$expand_i1_val = $12 & 1; //@line 7327
  HEAP8[$48 >> 0] = $$expand_i1_val; //@line 7328
  $49 = $ReallocAsyncCtx + 28 | 0; //@line 7329
  HEAP32[$49 >> 2] = $14; //@line 7330
  $50 = $ReallocAsyncCtx + 32 | 0; //@line 7331
  HEAP32[$50 >> 2] = $16; //@line 7332
  $51 = $ReallocAsyncCtx + 36 | 0; //@line 7333
  HEAP32[$51 >> 2] = $18; //@line 7334
  $52 = $ReallocAsyncCtx + 40 | 0; //@line 7335
  HEAP32[$52 >> 2] = $20; //@line 7336
  $53 = $ReallocAsyncCtx + 44 | 0; //@line 7337
  HEAP32[$53 >> 2] = $22; //@line 7338
  $54 = $ReallocAsyncCtx + 48 | 0; //@line 7339
  HEAP32[$54 >> 2] = $24; //@line 7340
  $55 = $ReallocAsyncCtx + 52 | 0; //@line 7341
  HEAP32[$55 >> 2] = $26; //@line 7342
  $56 = $ReallocAsyncCtx + 56 | 0; //@line 7343
  HEAP32[$56 >> 2] = $28; //@line 7344
  $57 = $ReallocAsyncCtx + 60 | 0; //@line 7345
  HEAP32[$57 >> 2] = $$reg2mem$0; //@line 7346
  $58 = $ReallocAsyncCtx + 64 | 0; //@line 7347
  HEAP32[$58 >> 2] = $38; //@line 7348
  $59 = $ReallocAsyncCtx + 68 | 0; //@line 7349
  HEAP32[$59 >> 2] = $30; //@line 7350
  $60 = $ReallocAsyncCtx + 72 | 0; //@line 7351
  HEAP32[$60 >> 2] = $32; //@line 7352
  $61 = $ReallocAsyncCtx + 76 | 0; //@line 7353
  HEAP32[$61 >> 2] = $34; //@line 7354
  $62 = $ReallocAsyncCtx + 80 | 0; //@line 7355
  HEAP32[$62 >> 2] = $37; //@line 7356
  sp = STACKTOP; //@line 7357
  return;
 } else if ((label | 0) == 7) {
  $66 = $$reg2mem$0 + 20 | 0; //@line 7361
  HEAP32[$66 >> 2] = (HEAP32[$66 >> 2] | 0) + $64; //@line 7364
  $69 = _equeue_tick() | 0; //@line 7365
  $ReallocAsyncCtx4 = _emscripten_realloc_async_context(76) | 0; //@line 7366
  _equeue_enqueue($8, $$reg2mem$0, $69) | 0; //@line 7367
  if (___async) {
   HEAP32[$ReallocAsyncCtx4 >> 2] = 31; //@line 7370
   $70 = $ReallocAsyncCtx4 + 4 | 0; //@line 7371
   HEAP32[$70 >> 2] = $2; //@line 7372
   $71 = $ReallocAsyncCtx4 + 8 | 0; //@line 7373
   HEAP32[$71 >> 2] = $4; //@line 7374
   $72 = $ReallocAsyncCtx4 + 12 | 0; //@line 7375
   HEAP32[$72 >> 2] = $6; //@line 7376
   $73 = $ReallocAsyncCtx4 + 16 | 0; //@line 7377
   HEAP32[$73 >> 2] = $8; //@line 7378
   $74 = $ReallocAsyncCtx4 + 20 | 0; //@line 7379
   HEAP32[$74 >> 2] = $10; //@line 7380
   $75 = $ReallocAsyncCtx4 + 24 | 0; //@line 7381
   $$expand_i1_val12 = $12 & 1; //@line 7382
   HEAP8[$75 >> 0] = $$expand_i1_val12; //@line 7383
   $76 = $ReallocAsyncCtx4 + 28 | 0; //@line 7384
   HEAP32[$76 >> 2] = $14; //@line 7385
   $77 = $ReallocAsyncCtx4 + 32 | 0; //@line 7386
   HEAP32[$77 >> 2] = $16; //@line 7387
   $78 = $ReallocAsyncCtx4 + 36 | 0; //@line 7388
   HEAP32[$78 >> 2] = $18; //@line 7389
   $79 = $ReallocAsyncCtx4 + 40 | 0; //@line 7390
   HEAP32[$79 >> 2] = $20; //@line 7391
   $80 = $ReallocAsyncCtx4 + 44 | 0; //@line 7392
   HEAP32[$80 >> 2] = $22; //@line 7393
   $81 = $ReallocAsyncCtx4 + 48 | 0; //@line 7394
   HEAP32[$81 >> 2] = $24; //@line 7395
   $82 = $ReallocAsyncCtx4 + 52 | 0; //@line 7396
   HEAP32[$82 >> 2] = $26; //@line 7397
   $83 = $ReallocAsyncCtx4 + 56 | 0; //@line 7398
   HEAP32[$83 >> 2] = $28; //@line 7399
   $84 = $ReallocAsyncCtx4 + 60 | 0; //@line 7400
   HEAP32[$84 >> 2] = $30; //@line 7401
   $85 = $ReallocAsyncCtx4 + 64 | 0; //@line 7402
   HEAP32[$85 >> 2] = $32; //@line 7403
   $86 = $ReallocAsyncCtx4 + 68 | 0; //@line 7404
   HEAP32[$86 >> 2] = $34; //@line 7405
   $87 = $ReallocAsyncCtx4 + 72 | 0; //@line 7406
   HEAP32[$87 >> 2] = $38; //@line 7407
   sp = STACKTOP; //@line 7408
   return;
  }
  ___async_unwind = 0; //@line 7411
  HEAP32[$ReallocAsyncCtx4 >> 2] = 31; //@line 7412
  $70 = $ReallocAsyncCtx4 + 4 | 0; //@line 7413
  HEAP32[$70 >> 2] = $2; //@line 7414
  $71 = $ReallocAsyncCtx4 + 8 | 0; //@line 7415
  HEAP32[$71 >> 2] = $4; //@line 7416
  $72 = $ReallocAsyncCtx4 + 12 | 0; //@line 7417
  HEAP32[$72 >> 2] = $6; //@line 7418
  $73 = $ReallocAsyncCtx4 + 16 | 0; //@line 7419
  HEAP32[$73 >> 2] = $8; //@line 7420
  $74 = $ReallocAsyncCtx4 + 20 | 0; //@line 7421
  HEAP32[$74 >> 2] = $10; //@line 7422
  $75 = $ReallocAsyncCtx4 + 24 | 0; //@line 7423
  $$expand_i1_val12 = $12 & 1; //@line 7424
  HEAP8[$75 >> 0] = $$expand_i1_val12; //@line 7425
  $76 = $ReallocAsyncCtx4 + 28 | 0; //@line 7426
  HEAP32[$76 >> 2] = $14; //@line 7427
  $77 = $ReallocAsyncCtx4 + 32 | 0; //@line 7428
  HEAP32[$77 >> 2] = $16; //@line 7429
  $78 = $ReallocAsyncCtx4 + 36 | 0; //@line 7430
  HEAP32[$78 >> 2] = $18; //@line 7431
  $79 = $ReallocAsyncCtx4 + 40 | 0; //@line 7432
  HEAP32[$79 >> 2] = $20; //@line 7433
  $80 = $ReallocAsyncCtx4 + 44 | 0; //@line 7434
  HEAP32[$80 >> 2] = $22; //@line 7435
  $81 = $ReallocAsyncCtx4 + 48 | 0; //@line 7436
  HEAP32[$81 >> 2] = $24; //@line 7437
  $82 = $ReallocAsyncCtx4 + 52 | 0; //@line 7438
  HEAP32[$82 >> 2] = $26; //@line 7439
  $83 = $ReallocAsyncCtx4 + 56 | 0; //@line 7440
  HEAP32[$83 >> 2] = $28; //@line 7441
  $84 = $ReallocAsyncCtx4 + 60 | 0; //@line 7442
  HEAP32[$84 >> 2] = $30; //@line 7443
  $85 = $ReallocAsyncCtx4 + 64 | 0; //@line 7444
  HEAP32[$85 >> 2] = $32; //@line 7445
  $86 = $ReallocAsyncCtx4 + 68 | 0; //@line 7446
  HEAP32[$86 >> 2] = $34; //@line 7447
  $87 = $ReallocAsyncCtx4 + 72 | 0; //@line 7448
  HEAP32[$87 >> 2] = $38; //@line 7449
  sp = STACKTOP; //@line 7450
  return;
 } else if ((label | 0) == 12) {
  $ReallocAsyncCtx2 = _emscripten_realloc_async_context(84) | 0; //@line 7455
  FUNCTION_TABLE_vi[$98 & 255]($$reg2mem$0 + 36 | 0); //@line 7456
  if (___async) {
   HEAP32[$ReallocAsyncCtx2 >> 2] = 32; //@line 7459
   $101 = $ReallocAsyncCtx2 + 4 | 0; //@line 7460
   HEAP32[$101 >> 2] = $2; //@line 7461
   $102 = $ReallocAsyncCtx2 + 8 | 0; //@line 7462
   HEAP32[$102 >> 2] = $4; //@line 7463
   $103 = $ReallocAsyncCtx2 + 12 | 0; //@line 7464
   HEAP32[$103 >> 2] = $6; //@line 7465
   $104 = $ReallocAsyncCtx2 + 16 | 0; //@line 7466
   HEAP32[$104 >> 2] = $8; //@line 7467
   $105 = $ReallocAsyncCtx2 + 20 | 0; //@line 7468
   HEAP32[$105 >> 2] = $10; //@line 7469
   $106 = $ReallocAsyncCtx2 + 24 | 0; //@line 7470
   $$expand_i1_val14 = $12 & 1; //@line 7471
   HEAP8[$106 >> 0] = $$expand_i1_val14; //@line 7472
   $107 = $ReallocAsyncCtx2 + 28 | 0; //@line 7473
   HEAP32[$107 >> 2] = $14; //@line 7474
   $108 = $ReallocAsyncCtx2 + 32 | 0; //@line 7475
   HEAP32[$108 >> 2] = $16; //@line 7476
   $109 = $ReallocAsyncCtx2 + 36 | 0; //@line 7477
   HEAP32[$109 >> 2] = $18; //@line 7478
   $110 = $ReallocAsyncCtx2 + 40 | 0; //@line 7479
   HEAP32[$110 >> 2] = $20; //@line 7480
   $111 = $ReallocAsyncCtx2 + 44 | 0; //@line 7481
   HEAP32[$111 >> 2] = $22; //@line 7482
   $112 = $ReallocAsyncCtx2 + 48 | 0; //@line 7483
   HEAP32[$112 >> 2] = $24; //@line 7484
   $113 = $ReallocAsyncCtx2 + 52 | 0; //@line 7485
   HEAP32[$113 >> 2] = $26; //@line 7486
   $114 = $ReallocAsyncCtx2 + 56 | 0; //@line 7487
   HEAP32[$114 >> 2] = $28; //@line 7488
   $115 = $ReallocAsyncCtx2 + 60 | 0; //@line 7489
   HEAP32[$115 >> 2] = $38; //@line 7490
   $116 = $ReallocAsyncCtx2 + 64 | 0; //@line 7491
   HEAP32[$116 >> 2] = $30; //@line 7492
   $117 = $ReallocAsyncCtx2 + 68 | 0; //@line 7493
   HEAP32[$117 >> 2] = $32; //@line 7494
   $118 = $ReallocAsyncCtx2 + 72 | 0; //@line 7495
   HEAP32[$118 >> 2] = $34; //@line 7496
   $119 = $ReallocAsyncCtx2 + 76 | 0; //@line 7497
   HEAP32[$119 >> 2] = $$reg2mem$0; //@line 7498
   $120 = $ReallocAsyncCtx2 + 80 | 0; //@line 7499
   HEAP32[$120 >> 2] = $37; //@line 7500
   sp = STACKTOP; //@line 7501
   return;
  }
  ___async_unwind = 0; //@line 7504
  HEAP32[$ReallocAsyncCtx2 >> 2] = 32; //@line 7505
  $101 = $ReallocAsyncCtx2 + 4 | 0; //@line 7506
  HEAP32[$101 >> 2] = $2; //@line 7507
  $102 = $ReallocAsyncCtx2 + 8 | 0; //@line 7508
  HEAP32[$102 >> 2] = $4; //@line 7509
  $103 = $ReallocAsyncCtx2 + 12 | 0; //@line 7510
  HEAP32[$103 >> 2] = $6; //@line 7511
  $104 = $ReallocAsyncCtx2 + 16 | 0; //@line 7512
  HEAP32[$104 >> 2] = $8; //@line 7513
  $105 = $ReallocAsyncCtx2 + 20 | 0; //@line 7514
  HEAP32[$105 >> 2] = $10; //@line 7515
  $106 = $ReallocAsyncCtx2 + 24 | 0; //@line 7516
  $$expand_i1_val14 = $12 & 1; //@line 7517
  HEAP8[$106 >> 0] = $$expand_i1_val14; //@line 7518
  $107 = $ReallocAsyncCtx2 + 28 | 0; //@line 7519
  HEAP32[$107 >> 2] = $14; //@line 7520
  $108 = $ReallocAsyncCtx2 + 32 | 0; //@line 7521
  HEAP32[$108 >> 2] = $16; //@line 7522
  $109 = $ReallocAsyncCtx2 + 36 | 0; //@line 7523
  HEAP32[$109 >> 2] = $18; //@line 7524
  $110 = $ReallocAsyncCtx2 + 40 | 0; //@line 7525
  HEAP32[$110 >> 2] = $20; //@line 7526
  $111 = $ReallocAsyncCtx2 + 44 | 0; //@line 7527
  HEAP32[$111 >> 2] = $22; //@line 7528
  $112 = $ReallocAsyncCtx2 + 48 | 0; //@line 7529
  HEAP32[$112 >> 2] = $24; //@line 7530
  $113 = $ReallocAsyncCtx2 + 52 | 0; //@line 7531
  HEAP32[$113 >> 2] = $26; //@line 7532
  $114 = $ReallocAsyncCtx2 + 56 | 0; //@line 7533
  HEAP32[$114 >> 2] = $28; //@line 7534
  $115 = $ReallocAsyncCtx2 + 60 | 0; //@line 7535
  HEAP32[$115 >> 2] = $38; //@line 7536
  $116 = $ReallocAsyncCtx2 + 64 | 0; //@line 7537
  HEAP32[$116 >> 2] = $30; //@line 7538
  $117 = $ReallocAsyncCtx2 + 68 | 0; //@line 7539
  HEAP32[$117 >> 2] = $32; //@line 7540
  $118 = $ReallocAsyncCtx2 + 72 | 0; //@line 7541
  HEAP32[$118 >> 2] = $34; //@line 7542
  $119 = $ReallocAsyncCtx2 + 76 | 0; //@line 7543
  HEAP32[$119 >> 2] = $$reg2mem$0; //@line 7544
  $120 = $ReallocAsyncCtx2 + 80 | 0; //@line 7545
  HEAP32[$120 >> 2] = $37; //@line 7546
  sp = STACKTOP; //@line 7547
  return;
 } else if ((label | 0) == 24) {
  $136 = _equeue_tick() | 0; //@line 7551
  if ($12) {
   $137 = $10 - $136 | 0; //@line 7553
   if (($137 | 0) < 1) {
    $139 = $8 + 40 | 0; //@line 7556
    if (HEAP32[$139 >> 2] | 0) {
     _equeue_mutex_lock($2); //@line 7560
     $142 = HEAP32[$139 >> 2] | 0; //@line 7561
     if ($142 | 0) {
      $144 = HEAP32[$26 >> 2] | 0; //@line 7564
      if ($144 | 0) {
       $147 = HEAP32[$8 + 44 >> 2] | 0; //@line 7568
       $150 = (HEAP32[$144 + 20 >> 2] | 0) - $136 | 0; //@line 7571
       $ReallocAsyncCtx3 = _emscripten_realloc_async_context(16) | 0; //@line 7575
       FUNCTION_TABLE_vii[$142 & 3]($147, $150 & ~($150 >> 31)); //@line 7576
       if (___async) {
        HEAP32[$ReallocAsyncCtx3 >> 2] = 33; //@line 7579
        $154 = $ReallocAsyncCtx3 + 4 | 0; //@line 7580
        HEAP32[$154 >> 2] = $18; //@line 7581
        $155 = $ReallocAsyncCtx3 + 8 | 0; //@line 7582
        HEAP32[$155 >> 2] = $2; //@line 7583
        $156 = $ReallocAsyncCtx3 + 12 | 0; //@line 7584
        HEAP32[$156 >> 2] = $16; //@line 7585
        sp = STACKTOP; //@line 7586
        return;
       }
       ___async_unwind = 0; //@line 7589
       HEAP32[$ReallocAsyncCtx3 >> 2] = 33; //@line 7590
       $154 = $ReallocAsyncCtx3 + 4 | 0; //@line 7591
       HEAP32[$154 >> 2] = $18; //@line 7592
       $155 = $ReallocAsyncCtx3 + 8 | 0; //@line 7593
       HEAP32[$155 >> 2] = $2; //@line 7594
       $156 = $ReallocAsyncCtx3 + 12 | 0; //@line 7595
       HEAP32[$156 >> 2] = $16; //@line 7596
       sp = STACKTOP; //@line 7597
       return;
      }
     }
     HEAP8[$18 >> 0] = 1; //@line 7601
     _equeue_mutex_unlock($2); //@line 7602
    }
    HEAP8[$16 >> 0] = 0; //@line 7604
    return;
   } else {
    $$067 = $137; //@line 7607
   }
  } else {
   $$067 = -1; //@line 7610
  }
  _equeue_mutex_lock($2); //@line 7612
  $157 = HEAP32[$26 >> 2] | 0; //@line 7613
  if (!$157) {
   $$2 = $$067; //@line 7616
  } else {
   $161 = (HEAP32[$157 + 20 >> 2] | 0) - $136 | 0; //@line 7620
   $164 = $161 & ~($161 >> 31); //@line 7623
   $$2 = $164 >>> 0 < $$067 >>> 0 ? $164 : $$067; //@line 7626
  }
  _equeue_mutex_unlock($2); //@line 7628
  _equeue_sema_wait($28, $$2) | 0; //@line 7629
  do {
   if (HEAP8[$16 >> 0] | 0) {
    _equeue_mutex_lock($2); //@line 7634
    if (!(HEAP8[$16 >> 0] | 0)) {
     _equeue_mutex_unlock($2); //@line 7638
     break;
    }
    HEAP8[$16 >> 0] = 0; //@line 7641
    _equeue_mutex_unlock($2); //@line 7642
    return;
   }
  } while (0);
  $170 = _equeue_tick() | 0; //@line 7646
  $ReallocAsyncCtx5 = _emscripten_realloc_async_context(76) | 0; //@line 7647
  _wait_ms(20); //@line 7648
  if (___async) {
   HEAP32[$ReallocAsyncCtx5 >> 2] = 34; //@line 7651
   $171 = $ReallocAsyncCtx5 + 4 | 0; //@line 7652
   HEAP32[$171 >> 2] = $2; //@line 7653
   $172 = $ReallocAsyncCtx5 + 8 | 0; //@line 7654
   HEAP32[$172 >> 2] = $170; //@line 7655
   $173 = $ReallocAsyncCtx5 + 12 | 0; //@line 7656
   HEAP32[$173 >> 2] = $4; //@line 7657
   $174 = $ReallocAsyncCtx5 + 16 | 0; //@line 7658
   HEAP32[$174 >> 2] = $6; //@line 7659
   $175 = $ReallocAsyncCtx5 + 20 | 0; //@line 7660
   HEAP32[$175 >> 2] = $8; //@line 7661
   $176 = $ReallocAsyncCtx5 + 24 | 0; //@line 7662
   HEAP32[$176 >> 2] = $10; //@line 7663
   $177 = $ReallocAsyncCtx5 + 28 | 0; //@line 7664
   $$expand_i1_val16 = $12 & 1; //@line 7665
   HEAP8[$177 >> 0] = $$expand_i1_val16; //@line 7666
   $178 = $ReallocAsyncCtx5 + 32 | 0; //@line 7667
   HEAP32[$178 >> 2] = $14; //@line 7668
   $179 = $ReallocAsyncCtx5 + 36 | 0; //@line 7669
   HEAP32[$179 >> 2] = $16; //@line 7670
   $180 = $ReallocAsyncCtx5 + 40 | 0; //@line 7671
   HEAP32[$180 >> 2] = $18; //@line 7672
   $181 = $ReallocAsyncCtx5 + 44 | 0; //@line 7673
   HEAP32[$181 >> 2] = $20; //@line 7674
   $182 = $ReallocAsyncCtx5 + 48 | 0; //@line 7675
   HEAP32[$182 >> 2] = $22; //@line 7676
   $183 = $ReallocAsyncCtx5 + 52 | 0; //@line 7677
   HEAP32[$183 >> 2] = $24; //@line 7678
   $184 = $ReallocAsyncCtx5 + 56 | 0; //@line 7679
   HEAP32[$184 >> 2] = $26; //@line 7680
   $185 = $ReallocAsyncCtx5 + 60 | 0; //@line 7681
   HEAP32[$185 >> 2] = $28; //@line 7682
   $186 = $ReallocAsyncCtx5 + 64 | 0; //@line 7683
   HEAP32[$186 >> 2] = $30; //@line 7684
   $187 = $ReallocAsyncCtx5 + 68 | 0; //@line 7685
   HEAP32[$187 >> 2] = $32; //@line 7686
   $188 = $ReallocAsyncCtx5 + 72 | 0; //@line 7687
   HEAP32[$188 >> 2] = $34; //@line 7688
   sp = STACKTOP; //@line 7689
   return;
  }
  ___async_unwind = 0; //@line 7692
  HEAP32[$ReallocAsyncCtx5 >> 2] = 34; //@line 7693
  $171 = $ReallocAsyncCtx5 + 4 | 0; //@line 7694
  HEAP32[$171 >> 2] = $2; //@line 7695
  $172 = $ReallocAsyncCtx5 + 8 | 0; //@line 7696
  HEAP32[$172 >> 2] = $170; //@line 7697
  $173 = $ReallocAsyncCtx5 + 12 | 0; //@line 7698
  HEAP32[$173 >> 2] = $4; //@line 7699
  $174 = $ReallocAsyncCtx5 + 16 | 0; //@line 7700
  HEAP32[$174 >> 2] = $6; //@line 7701
  $175 = $ReallocAsyncCtx5 + 20 | 0; //@line 7702
  HEAP32[$175 >> 2] = $8; //@line 7703
  $176 = $ReallocAsyncCtx5 + 24 | 0; //@line 7704
  HEAP32[$176 >> 2] = $10; //@line 7705
  $177 = $ReallocAsyncCtx5 + 28 | 0; //@line 7706
  $$expand_i1_val16 = $12 & 1; //@line 7707
  HEAP8[$177 >> 0] = $$expand_i1_val16; //@line 7708
  $178 = $ReallocAsyncCtx5 + 32 | 0; //@line 7709
  HEAP32[$178 >> 2] = $14; //@line 7710
  $179 = $ReallocAsyncCtx5 + 36 | 0; //@line 7711
  HEAP32[$179 >> 2] = $16; //@line 7712
  $180 = $ReallocAsyncCtx5 + 40 | 0; //@line 7713
  HEAP32[$180 >> 2] = $18; //@line 7714
  $181 = $ReallocAsyncCtx5 + 44 | 0; //@line 7715
  HEAP32[$181 >> 2] = $20; //@line 7716
  $182 = $ReallocAsyncCtx5 + 48 | 0; //@line 7717
  HEAP32[$182 >> 2] = $22; //@line 7718
  $183 = $ReallocAsyncCtx5 + 52 | 0; //@line 7719
  HEAP32[$183 >> 2] = $24; //@line 7720
  $184 = $ReallocAsyncCtx5 + 56 | 0; //@line 7721
  HEAP32[$184 >> 2] = $26; //@line 7722
  $185 = $ReallocAsyncCtx5 + 60 | 0; //@line 7723
  HEAP32[$185 >> 2] = $28; //@line 7724
  $186 = $ReallocAsyncCtx5 + 64 | 0; //@line 7725
  HEAP32[$186 >> 2] = $30; //@line 7726
  $187 = $ReallocAsyncCtx5 + 68 | 0; //@line 7727
  HEAP32[$187 >> 2] = $32; //@line 7728
  $188 = $ReallocAsyncCtx5 + 72 | 0; //@line 7729
  HEAP32[$188 >> 2] = $34; //@line 7730
  sp = STACKTOP; //@line 7731
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
 sp = STACKTOP; //@line 8950
 STACKTOP = STACKTOP + 64 | 0; //@line 8951
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(64); //@line 8951
 $5 = sp + 16 | 0; //@line 8952
 $6 = sp; //@line 8953
 $7 = sp + 24 | 0; //@line 8954
 $8 = sp + 8 | 0; //@line 8955
 $9 = sp + 20 | 0; //@line 8956
 HEAP32[$5 >> 2] = $1; //@line 8957
 $10 = ($0 | 0) != 0; //@line 8958
 $11 = $7 + 40 | 0; //@line 8959
 $12 = $11; //@line 8960
 $13 = $7 + 39 | 0; //@line 8961
 $14 = $8 + 4 | 0; //@line 8962
 $$0243 = 0; //@line 8963
 $$0247 = 0; //@line 8963
 $$0269 = 0; //@line 8963
 L1 : while (1) {
  do {
   if (($$0247 | 0) > -1) {
    if (($$0243 | 0) > (2147483647 - $$0247 | 0)) {
     HEAP32[(___errno_location() | 0) >> 2] = 75; //@line 8972
     $$1248 = -1; //@line 8973
     break;
    } else {
     $$1248 = $$0243 + $$0247 | 0; //@line 8977
     break;
    }
   } else {
    $$1248 = $$0247; //@line 8981
   }
  } while (0);
  $20 = HEAP32[$5 >> 2] | 0; //@line 8984
  $21 = HEAP8[$20 >> 0] | 0; //@line 8985
  if (!($21 << 24 >> 24)) {
   label = 88; //@line 8988
   break;
  } else {
   $23 = $21; //@line 8991
   $25 = $20; //@line 8991
  }
  L9 : while (1) {
   switch ($23 << 24 >> 24) {
   case 37:
    {
     $$0249303 = $25; //@line 8996
     $27 = $25; //@line 8996
     label = 9; //@line 8997
     break L9;
     break;
    }
   case 0:
    {
     $$0249$lcssa = $25; //@line 9002
     break L9;
     break;
    }
   default:
    {}
   }
   $24 = $25 + 1 | 0; //@line 9009
   HEAP32[$5 >> 2] = $24; //@line 9010
   $23 = HEAP8[$24 >> 0] | 0; //@line 9012
   $25 = $24; //@line 9012
  }
  L12 : do {
   if ((label | 0) == 9) {
    while (1) {
     label = 0; //@line 9017
     if ((HEAP8[$27 + 1 >> 0] | 0) != 37) {
      $$0249$lcssa = $$0249303; //@line 9022
      break L12;
     }
     $30 = $$0249303 + 1 | 0; //@line 9025
     $27 = $27 + 2 | 0; //@line 9026
     HEAP32[$5 >> 2] = $27; //@line 9027
     if ((HEAP8[$27 >> 0] | 0) != 37) {
      $$0249$lcssa = $30; //@line 9034
      break;
     } else {
      $$0249303 = $30; //@line 9031
      label = 9; //@line 9032
     }
    }
   }
  } while (0);
  $36 = $$0249$lcssa - $20 | 0; //@line 9042
  if ($10) {
   _out_670($0, $20, $36); //@line 9044
  }
  if ($36 | 0) {
   $$0243 = $36; //@line 9048
   $$0247 = $$1248; //@line 9048
   continue;
  }
  $43 = (_isdigit(HEAP8[(HEAP32[$5 >> 2] | 0) + 1 >> 0] | 0) | 0) == 0; //@line 9056
  $$pre342 = HEAP32[$5 >> 2] | 0; //@line 9057
  if ($43) {
   $$0253 = -1; //@line 9059
   $$1270 = $$0269; //@line 9059
   $$sink = 1; //@line 9059
  } else {
   if ((HEAP8[$$pre342 + 2 >> 0] | 0) == 36) {
    $$0253 = (HEAP8[$$pre342 + 1 >> 0] | 0) + -48 | 0; //@line 9069
    $$1270 = 1; //@line 9069
    $$sink = 3; //@line 9069
   } else {
    $$0253 = -1; //@line 9071
    $$1270 = $$0269; //@line 9071
    $$sink = 1; //@line 9071
   }
  }
  $51 = $$pre342 + $$sink | 0; //@line 9074
  HEAP32[$5 >> 2] = $51; //@line 9075
  $52 = HEAP8[$51 >> 0] | 0; //@line 9076
  $54 = ($52 << 24 >> 24) + -32 | 0; //@line 9078
  if ($54 >>> 0 > 31 | (1 << $54 & 75913 | 0) == 0) {
   $$0262$lcssa = 0; //@line 9085
   $$lcssa291 = $52; //@line 9085
   $$lcssa292 = $51; //@line 9085
  } else {
   $$0262309 = 0; //@line 9087
   $60 = $52; //@line 9087
   $65 = $51; //@line 9087
   while (1) {
    $63 = 1 << ($60 << 24 >> 24) + -32 | $$0262309; //@line 9092
    $64 = $65 + 1 | 0; //@line 9093
    HEAP32[$5 >> 2] = $64; //@line 9094
    $66 = HEAP8[$64 >> 0] | 0; //@line 9095
    $68 = ($66 << 24 >> 24) + -32 | 0; //@line 9097
    if ($68 >>> 0 > 31 | (1 << $68 & 75913 | 0) == 0) {
     $$0262$lcssa = $63; //@line 9104
     $$lcssa291 = $66; //@line 9104
     $$lcssa292 = $64; //@line 9104
     break;
    } else {
     $$0262309 = $63; //@line 9107
     $60 = $66; //@line 9107
     $65 = $64; //@line 9107
    }
   }
  }
  if ($$lcssa291 << 24 >> 24 == 42) {
   if (!(_isdigit(HEAP8[$$lcssa292 + 1 >> 0] | 0) | 0)) {
    label = 23; //@line 9119
   } else {
    $79 = HEAP32[$5 >> 2] | 0; //@line 9121
    if ((HEAP8[$79 + 2 >> 0] | 0) == 36) {
     $83 = $79 + 1 | 0; //@line 9126
     HEAP32[$4 + ((HEAP8[$83 >> 0] | 0) + -48 << 2) >> 2] = 10; //@line 9131
     $$0259 = HEAP32[$3 + ((HEAP8[$83 >> 0] | 0) + -48 << 3) >> 2] | 0; //@line 9143
     $$2271 = 1; //@line 9143
     $storemerge274 = $79 + 3 | 0; //@line 9143
    } else {
     label = 23; //@line 9145
    }
   }
   if ((label | 0) == 23) {
    label = 0; //@line 9149
    if ($$1270 | 0) {
     $$0 = -1; //@line 9152
     break;
    }
    if ($10) {
     $105 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 9167
     $106 = HEAP32[$105 >> 2] | 0; //@line 9168
     HEAP32[$2 >> 2] = $105 + 4; //@line 9170
     $363 = $106; //@line 9171
    } else {
     $363 = 0; //@line 9173
    }
    $$0259 = $363; //@line 9177
    $$2271 = 0; //@line 9177
    $storemerge274 = (HEAP32[$5 >> 2] | 0) + 1 | 0; //@line 9177
   }
   HEAP32[$5 >> 2] = $storemerge274; //@line 9179
   $109 = ($$0259 | 0) < 0; //@line 9180
   $$1260 = $109 ? 0 - $$0259 | 0 : $$0259; //@line 9185
   $$1263 = $109 ? $$0262$lcssa | 8192 : $$0262$lcssa; //@line 9185
   $$3272 = $$2271; //@line 9185
   $115 = $storemerge274; //@line 9185
  } else {
   $112 = _getint_671($5) | 0; //@line 9187
   if (($112 | 0) < 0) {
    $$0 = -1; //@line 9190
    break;
   }
   $$1260 = $112; //@line 9194
   $$1263 = $$0262$lcssa; //@line 9194
   $$3272 = $$1270; //@line 9194
   $115 = HEAP32[$5 >> 2] | 0; //@line 9194
  }
  do {
   if ((HEAP8[$115 >> 0] | 0) == 46) {
    if ((HEAP8[$115 + 1 >> 0] | 0) != 42) {
     HEAP32[$5 >> 2] = $115 + 1; //@line 9205
     $156 = _getint_671($5) | 0; //@line 9206
     $$0254 = $156; //@line 9208
     $$pre345 = HEAP32[$5 >> 2] | 0; //@line 9208
     break;
    }
    if (_isdigit(HEAP8[$115 + 2 >> 0] | 0) | 0) {
     $125 = HEAP32[$5 >> 2] | 0; //@line 9217
     if ((HEAP8[$125 + 3 >> 0] | 0) == 36) {
      $129 = $125 + 2 | 0; //@line 9222
      HEAP32[$4 + ((HEAP8[$129 >> 0] | 0) + -48 << 2) >> 2] = 10; //@line 9227
      $140 = HEAP32[$3 + ((HEAP8[$129 >> 0] | 0) + -48 << 3) >> 2] | 0; //@line 9234
      $144 = $125 + 4 | 0; //@line 9238
      HEAP32[$5 >> 2] = $144; //@line 9239
      $$0254 = $140; //@line 9240
      $$pre345 = $144; //@line 9240
      break;
     }
    }
    if ($$3272 | 0) {
     $$0 = -1; //@line 9246
     break L1;
    }
    if ($10) {
     $151 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 9261
     $152 = HEAP32[$151 >> 2] | 0; //@line 9262
     HEAP32[$2 >> 2] = $151 + 4; //@line 9264
     $364 = $152; //@line 9265
    } else {
     $364 = 0; //@line 9267
    }
    $154 = (HEAP32[$5 >> 2] | 0) + 2 | 0; //@line 9270
    HEAP32[$5 >> 2] = $154; //@line 9271
    $$0254 = $364; //@line 9272
    $$pre345 = $154; //@line 9272
   } else {
    $$0254 = -1; //@line 9274
    $$pre345 = $115; //@line 9274
   }
  } while (0);
  $$0252 = 0; //@line 9277
  $158 = $$pre345; //@line 9277
  while (1) {
   if (((HEAP8[$158 >> 0] | 0) + -65 | 0) >>> 0 > 57) {
    $$0 = -1; //@line 9284
    break L1;
   }
   $158$looptemp = $158;
   $158 = $158 + 1 | 0; //@line 9287
   HEAP32[$5 >> 2] = $158; //@line 9288
   $167 = HEAP8[(HEAP8[$158$looptemp >> 0] | 0) + -65 + (2813 + ($$0252 * 58 | 0)) >> 0] | 0; //@line 9293
   $168 = $167 & 255; //@line 9294
   if (($168 + -1 | 0) >>> 0 >= 8) {
    break;
   } else {
    $$0252 = $168; //@line 9298
   }
  }
  if (!($167 << 24 >> 24)) {
   $$0 = -1; //@line 9305
   break;
  }
  $173 = ($$0253 | 0) > -1; //@line 9309
  do {
   if ($167 << 24 >> 24 == 19) {
    if ($173) {
     $$0 = -1; //@line 9313
     break L1;
    } else {
     label = 50; //@line 9316
    }
   } else {
    if ($173) {
     HEAP32[$4 + ($$0253 << 2) >> 2] = $168; //@line 9321
     $176 = $3 + ($$0253 << 3) | 0; //@line 9323
     $181 = HEAP32[$176 + 4 >> 2] | 0; //@line 9328
     $182 = $6; //@line 9329
     HEAP32[$182 >> 2] = HEAP32[$176 >> 2]; //@line 9331
     HEAP32[$182 + 4 >> 2] = $181; //@line 9334
     label = 50; //@line 9335
     break;
    }
    if (!$10) {
     $$0 = 0; //@line 9339
     break L1;
    }
    _pop_arg_673($6, $168, $2); //@line 9342
    $187 = HEAP32[$5 >> 2] | 0; //@line 9344
   }
  } while (0);
  if ((label | 0) == 50) {
   label = 0; //@line 9348
   if ($10) {
    $187 = $158; //@line 9350
   } else {
    $$0243 = 0; //@line 9352
    $$0247 = $$1248; //@line 9352
    $$0269 = $$3272; //@line 9352
    continue;
   }
  }
  $189 = HEAP8[$187 + -1 >> 0] | 0; //@line 9358
  $$0235 = ($$0252 | 0) != 0 & ($189 & 15 | 0) == 3 ? $189 & -33 : $189; //@line 9364
  $196 = $$1263 & -65537; //@line 9367
  $$1263$ = ($$1263 & 8192 | 0) == 0 ? $$1263 : $196; //@line 9368
  L73 : do {
   switch ($$0235 | 0) {
   case 110:
    {
     switch (($$0252 & 255) << 24 >> 24) {
     case 0:
      {
       HEAP32[HEAP32[$6 >> 2] >> 2] = $$1248; //@line 9376
       $$0243 = 0; //@line 9377
       $$0247 = $$1248; //@line 9377
       $$0269 = $$3272; //@line 9377
       continue L1;
       break;
      }
     case 1:
      {
       HEAP32[HEAP32[$6 >> 2] >> 2] = $$1248; //@line 9383
       $$0243 = 0; //@line 9384
       $$0247 = $$1248; //@line 9384
       $$0269 = $$3272; //@line 9384
       continue L1;
       break;
      }
     case 2:
      {
       $208 = HEAP32[$6 >> 2] | 0; //@line 9392
       HEAP32[$208 >> 2] = $$1248; //@line 9394
       HEAP32[$208 + 4 >> 2] = (($$1248 | 0) < 0) << 31 >> 31; //@line 9397
       $$0243 = 0; //@line 9398
       $$0247 = $$1248; //@line 9398
       $$0269 = $$3272; //@line 9398
       continue L1;
       break;
      }
     case 3:
      {
       HEAP16[HEAP32[$6 >> 2] >> 1] = $$1248; //@line 9405
       $$0243 = 0; //@line 9406
       $$0247 = $$1248; //@line 9406
       $$0269 = $$3272; //@line 9406
       continue L1;
       break;
      }
     case 4:
      {
       HEAP8[HEAP32[$6 >> 2] >> 0] = $$1248; //@line 9413
       $$0243 = 0; //@line 9414
       $$0247 = $$1248; //@line 9414
       $$0269 = $$3272; //@line 9414
       continue L1;
       break;
      }
     case 6:
      {
       HEAP32[HEAP32[$6 >> 2] >> 2] = $$1248; //@line 9420
       $$0243 = 0; //@line 9421
       $$0247 = $$1248; //@line 9421
       $$0269 = $$3272; //@line 9421
       continue L1;
       break;
      }
     case 7:
      {
       $220 = HEAP32[$6 >> 2] | 0; //@line 9429
       HEAP32[$220 >> 2] = $$1248; //@line 9431
       HEAP32[$220 + 4 >> 2] = (($$1248 | 0) < 0) << 31 >> 31; //@line 9434
       $$0243 = 0; //@line 9435
       $$0247 = $$1248; //@line 9435
       $$0269 = $$3272; //@line 9435
       continue L1;
       break;
      }
     default:
      {
       $$0243 = 0; //@line 9440
       $$0247 = $$1248; //@line 9440
       $$0269 = $$3272; //@line 9440
       continue L1;
      }
     }
     break;
    }
   case 112:
    {
     $$1236 = 120; //@line 9450
     $$1255 = $$0254 >>> 0 > 8 ? $$0254 : 8; //@line 9450
     $$3265 = $$1263$ | 8; //@line 9450
     label = 62; //@line 9451
     break;
    }
   case 88:
   case 120:
    {
     $$1236 = $$0235; //@line 9455
     $$1255 = $$0254; //@line 9455
     $$3265 = $$1263$; //@line 9455
     label = 62; //@line 9456
     break;
    }
   case 111:
    {
     $242 = $6; //@line 9460
     $244 = HEAP32[$242 >> 2] | 0; //@line 9462
     $247 = HEAP32[$242 + 4 >> 2] | 0; //@line 9465
     $248 = _fmt_o($244, $247, $11) | 0; //@line 9466
     $252 = $12 - $248 | 0; //@line 9470
     $$0228 = $248; //@line 9475
     $$1233 = 0; //@line 9475
     $$1238 = 3277; //@line 9475
     $$2256 = ($$1263$ & 8 | 0) == 0 | ($$0254 | 0) > ($252 | 0) ? $$0254 : $252 + 1 | 0; //@line 9475
     $$4266 = $$1263$; //@line 9475
     $281 = $244; //@line 9475
     $283 = $247; //@line 9475
     label = 68; //@line 9476
     break;
    }
   case 105:
   case 100:
    {
     $256 = $6; //@line 9480
     $258 = HEAP32[$256 >> 2] | 0; //@line 9482
     $261 = HEAP32[$256 + 4 >> 2] | 0; //@line 9485
     if (($261 | 0) < 0) {
      $263 = _i64Subtract(0, 0, $258 | 0, $261 | 0) | 0; //@line 9488
      $264 = tempRet0; //@line 9489
      $265 = $6; //@line 9490
      HEAP32[$265 >> 2] = $263; //@line 9492
      HEAP32[$265 + 4 >> 2] = $264; //@line 9495
      $$0232 = 1; //@line 9496
      $$0237 = 3277; //@line 9496
      $275 = $263; //@line 9496
      $276 = $264; //@line 9496
      label = 67; //@line 9497
      break L73;
     } else {
      $$0232 = ($$1263$ & 2049 | 0) != 0 & 1; //@line 9509
      $$0237 = ($$1263$ & 2048 | 0) == 0 ? ($$1263$ & 1 | 0) == 0 ? 3277 : 3279 : 3278; //@line 9509
      $275 = $258; //@line 9509
      $276 = $261; //@line 9509
      label = 67; //@line 9510
      break L73;
     }
     break;
    }
   case 117:
    {
     $197 = $6; //@line 9516
     $$0232 = 0; //@line 9522
     $$0237 = 3277; //@line 9522
     $275 = HEAP32[$197 >> 2] | 0; //@line 9522
     $276 = HEAP32[$197 + 4 >> 2] | 0; //@line 9522
     label = 67; //@line 9523
     break;
    }
   case 99:
    {
     HEAP8[$13 >> 0] = HEAP32[$6 >> 2]; //@line 9534
     $$2 = $13; //@line 9535
     $$2234 = 0; //@line 9535
     $$2239 = 3277; //@line 9535
     $$2251 = $11; //@line 9535
     $$5 = 1; //@line 9535
     $$6268 = $196; //@line 9535
     break;
    }
   case 109:
    {
     $$1 = _strerror(HEAP32[(___errno_location() | 0) >> 2] | 0) | 0; //@line 9542
     label = 72; //@line 9543
     break;
    }
   case 115:
    {
     $302 = HEAP32[$6 >> 2] | 0; //@line 9547
     $$1 = $302 | 0 ? $302 : 3287; //@line 9550
     label = 72; //@line 9551
     break;
    }
   case 67:
    {
     HEAP32[$8 >> 2] = HEAP32[$6 >> 2]; //@line 9561
     HEAP32[$14 >> 2] = 0; //@line 9562
     HEAP32[$6 >> 2] = $8; //@line 9563
     $$4258354 = -1; //@line 9564
     $365 = $8; //@line 9564
     label = 76; //@line 9565
     break;
    }
   case 83:
    {
     $$pre348 = HEAP32[$6 >> 2] | 0; //@line 9569
     if (!$$0254) {
      _pad_676($0, 32, $$1260, 0, $$1263$); //@line 9572
      $$0240$lcssa356 = 0; //@line 9573
      label = 85; //@line 9574
     } else {
      $$4258354 = $$0254; //@line 9576
      $365 = $$pre348; //@line 9576
      label = 76; //@line 9577
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
     $$0243 = _fmt_fp($0, +HEAPF64[$6 >> 3], $$1260, $$0254, $$1263$, $$0235) | 0; //@line 9584
     $$0247 = $$1248; //@line 9584
     $$0269 = $$3272; //@line 9584
     continue L1;
     break;
    }
   default:
    {
     $$2 = $20; //@line 9589
     $$2234 = 0; //@line 9589
     $$2239 = 3277; //@line 9589
     $$2251 = $11; //@line 9589
     $$5 = $$0254; //@line 9589
     $$6268 = $$1263$; //@line 9589
    }
   }
  } while (0);
  L97 : do {
   if ((label | 0) == 62) {
    label = 0; //@line 9595
    $227 = $6; //@line 9596
    $229 = HEAP32[$227 >> 2] | 0; //@line 9598
    $232 = HEAP32[$227 + 4 >> 2] | 0; //@line 9601
    $234 = _fmt_x($229, $232, $11, $$1236 & 32) | 0; //@line 9603
    $or$cond278 = ($$3265 & 8 | 0) == 0 | ($229 | 0) == 0 & ($232 | 0) == 0; //@line 9609
    $$0228 = $234; //@line 9614
    $$1233 = $or$cond278 ? 0 : 2; //@line 9614
    $$1238 = $or$cond278 ? 3277 : 3277 + ($$1236 >> 4) | 0; //@line 9614
    $$2256 = $$1255; //@line 9614
    $$4266 = $$3265; //@line 9614
    $281 = $229; //@line 9614
    $283 = $232; //@line 9614
    label = 68; //@line 9615
   } else if ((label | 0) == 67) {
    label = 0; //@line 9618
    $$0228 = _fmt_u($275, $276, $11) | 0; //@line 9620
    $$1233 = $$0232; //@line 9620
    $$1238 = $$0237; //@line 9620
    $$2256 = $$0254; //@line 9620
    $$4266 = $$1263$; //@line 9620
    $281 = $275; //@line 9620
    $283 = $276; //@line 9620
    label = 68; //@line 9621
   } else if ((label | 0) == 72) {
    label = 0; //@line 9624
    $305 = _memchr($$1, 0, $$0254) | 0; //@line 9625
    $306 = ($305 | 0) == 0; //@line 9626
    $$2 = $$1; //@line 9633
    $$2234 = 0; //@line 9633
    $$2239 = 3277; //@line 9633
    $$2251 = $306 ? $$1 + $$0254 | 0 : $305; //@line 9633
    $$5 = $306 ? $$0254 : $305 - $$1 | 0; //@line 9633
    $$6268 = $196; //@line 9633
   } else if ((label | 0) == 76) {
    label = 0; //@line 9636
    $$0229316 = $365; //@line 9637
    $$0240315 = 0; //@line 9637
    $$1244314 = 0; //@line 9637
    while (1) {
     $318 = HEAP32[$$0229316 >> 2] | 0; //@line 9639
     if (!$318) {
      $$0240$lcssa = $$0240315; //@line 9642
      $$2245 = $$1244314; //@line 9642
      break;
     }
     $320 = _wctomb($9, $318) | 0; //@line 9645
     if (($320 | 0) < 0 | $320 >>> 0 > ($$4258354 - $$0240315 | 0) >>> 0) {
      $$0240$lcssa = $$0240315; //@line 9651
      $$2245 = $320; //@line 9651
      break;
     }
     $325 = $320 + $$0240315 | 0; //@line 9655
     if ($$4258354 >>> 0 > $325 >>> 0) {
      $$0229316 = $$0229316 + 4 | 0; //@line 9658
      $$0240315 = $325; //@line 9658
      $$1244314 = $320; //@line 9658
     } else {
      $$0240$lcssa = $325; //@line 9660
      $$2245 = $320; //@line 9660
      break;
     }
    }
    if (($$2245 | 0) < 0) {
     $$0 = -1; //@line 9666
     break L1;
    }
    _pad_676($0, 32, $$1260, $$0240$lcssa, $$1263$); //@line 9669
    if (!$$0240$lcssa) {
     $$0240$lcssa356 = 0; //@line 9672
     label = 85; //@line 9673
    } else {
     $$1230327 = $365; //@line 9675
     $$1241326 = 0; //@line 9675
     while (1) {
      $329 = HEAP32[$$1230327 >> 2] | 0; //@line 9677
      if (!$329) {
       $$0240$lcssa356 = $$0240$lcssa; //@line 9680
       label = 85; //@line 9681
       break L97;
      }
      $331 = _wctomb($9, $329) | 0; //@line 9684
      $$1241326 = $331 + $$1241326 | 0; //@line 9685
      if (($$1241326 | 0) > ($$0240$lcssa | 0)) {
       $$0240$lcssa356 = $$0240$lcssa; //@line 9688
       label = 85; //@line 9689
       break L97;
      }
      _out_670($0, $9, $331); //@line 9693
      if ($$1241326 >>> 0 >= $$0240$lcssa >>> 0) {
       $$0240$lcssa356 = $$0240$lcssa; //@line 9698
       label = 85; //@line 9699
       break;
      } else {
       $$1230327 = $$1230327 + 4 | 0; //@line 9696
      }
     }
    }
   }
  } while (0);
  if ((label | 0) == 68) {
   label = 0; //@line 9707
   $284 = ($281 | 0) != 0 | ($283 | 0) != 0; //@line 9713
   $or$cond = ($$2256 | 0) != 0 | $284; //@line 9715
   $290 = $12 - $$0228 + (($284 ^ 1) & 1) | 0; //@line 9720
   $$2 = $or$cond ? $$0228 : $11; //@line 9725
   $$2234 = $$1233; //@line 9725
   $$2239 = $$1238; //@line 9725
   $$2251 = $11; //@line 9725
   $$5 = $or$cond ? ($$2256 | 0) > ($290 | 0) ? $$2256 : $290 : $$2256; //@line 9725
   $$6268 = ($$2256 | 0) > -1 ? $$4266 & -65537 : $$4266; //@line 9725
  } else if ((label | 0) == 85) {
   label = 0; //@line 9728
   _pad_676($0, 32, $$1260, $$0240$lcssa356, $$1263$ ^ 8192); //@line 9730
   $$0243 = ($$1260 | 0) > ($$0240$lcssa356 | 0) ? $$1260 : $$0240$lcssa356; //@line 9733
   $$0247 = $$1248; //@line 9733
   $$0269 = $$3272; //@line 9733
   continue;
  }
  $343 = $$2251 - $$2 | 0; //@line 9738
  $$$5 = ($$5 | 0) < ($343 | 0) ? $343 : $$5; //@line 9740
  $345 = $$$5 + $$2234 | 0; //@line 9741
  $$2261 = ($$1260 | 0) < ($345 | 0) ? $345 : $$1260; //@line 9743
  _pad_676($0, 32, $$2261, $345, $$6268); //@line 9744
  _out_670($0, $$2239, $$2234); //@line 9745
  _pad_676($0, 48, $$2261, $345, $$6268 ^ 65536); //@line 9747
  _pad_676($0, 48, $$$5, $343, 0); //@line 9748
  _out_670($0, $$2, $343); //@line 9749
  _pad_676($0, 32, $$2261, $345, $$6268 ^ 8192); //@line 9751
  $$0243 = $$2261; //@line 9752
  $$0247 = $$1248; //@line 9752
  $$0269 = $$3272; //@line 9752
 }
 L116 : do {
  if ((label | 0) == 88) {
   if (!$0) {
    if (!$$0269) {
     $$0 = 0; //@line 9760
    } else {
     $$2242302 = 1; //@line 9762
     while (1) {
      $352 = HEAP32[$4 + ($$2242302 << 2) >> 2] | 0; //@line 9765
      if (!$352) {
       $$2242$lcssa = $$2242302; //@line 9768
       break;
      }
      _pop_arg_673($3 + ($$2242302 << 3) | 0, $352, $2); //@line 9772
      $356 = $$2242302 + 1 | 0; //@line 9773
      if (($$2242302 | 0) < 9) {
       $$2242302 = $356; //@line 9776
      } else {
       $$2242$lcssa = $356; //@line 9778
       break;
      }
     }
     if (($$2242$lcssa | 0) < 10) {
      $$3300 = $$2242$lcssa; //@line 9784
      while (1) {
       if (HEAP32[$4 + ($$3300 << 2) >> 2] | 0) {
        $$0 = -1; //@line 9790
        break L116;
       }
       if (($$3300 | 0) < 9) {
        $$3300 = $$3300 + 1 | 0; //@line 9796
       } else {
        $$0 = 1; //@line 9798
        break;
       }
      }
     } else {
      $$0 = 1; //@line 9803
     }
    }
   } else {
    $$0 = $$1248; //@line 9807
   }
  }
 } while (0);
 STACKTOP = sp; //@line 9811
 return $$0 | 0; //@line 9811
}
function _mbed_vtracef($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $$ = 0, $$0$i = 0, $$0141 = 0, $$0142 = 0, $$0144 = 0, $$0199 = 0, $$1$off0 = 0, $$10 = 0, $$1143 = 0, $$1145 = 0, $$1152 = 0, $$1152$ = 0, $$13 = 0, $$18 = 0, $$3 = 0, $$3147 = 0, $$3147168 = 0, $$3154 = 0, $$3169 = 0, $$5156 = 0, $$5156$ = 0, $$6 = 0, $$6150 = 0, $$9 = 0, $$lobit = 0, $$pre = 0, $$sink = 0, $125 = 0, $126 = 0, $151 = 0, $157 = 0, $168 = 0, $169 = 0, $171 = 0, $181 = 0, $182 = 0, $184 = 0, $186 = 0, $194 = 0, $201 = 0, $202 = 0, $204 = 0, $206 = 0, $209 = 0, $34 = 0, $38 = 0, $4 = 0, $43 = 0, $5 = 0, $54 = 0, $55 = 0, $59 = 0, $60 = 0, $64 = 0, $65 = 0, $66 = 0, $67 = 0, $69 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $76 = 0, $78 = 0, $82 = 0, $89 = 0, $95 = 0, $AsyncCtx = 0, $AsyncCtx27 = 0, $AsyncCtx30 = 0, $AsyncCtx34 = 0, $AsyncCtx38 = 0, $AsyncCtx42 = 0, $AsyncCtx45 = 0, $AsyncCtx49 = 0, $AsyncCtx52 = 0, $AsyncCtx56 = 0, $AsyncCtx60 = 0, $AsyncCtx64 = 0, $extract$t159 = 0, $vararg_buffer = 0, $vararg_buffer1 = 0, $vararg_buffer12 = 0, $vararg_buffer15 = 0, $vararg_buffer18 = 0, $vararg_buffer20 = 0, $vararg_buffer23 = 0, $vararg_buffer3 = 0, $vararg_buffer6 = 0, $vararg_buffer9 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 1821
 STACKTOP = STACKTOP + 96 | 0; //@line 1822
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(96); //@line 1822
 $vararg_buffer23 = sp + 72 | 0; //@line 1823
 $vararg_buffer20 = sp + 64 | 0; //@line 1824
 $vararg_buffer18 = sp + 56 | 0; //@line 1825
 $vararg_buffer15 = sp + 48 | 0; //@line 1826
 $vararg_buffer12 = sp + 40 | 0; //@line 1827
 $vararg_buffer9 = sp + 32 | 0; //@line 1828
 $vararg_buffer6 = sp + 24 | 0; //@line 1829
 $vararg_buffer3 = sp + 16 | 0; //@line 1830
 $vararg_buffer1 = sp + 8 | 0; //@line 1831
 $vararg_buffer = sp; //@line 1832
 $4 = sp + 80 | 0; //@line 1833
 $5 = HEAP32[61] | 0; //@line 1834
 do {
  if ($5 | 0) {
   $AsyncCtx = _emscripten_alloc_async_context(104, sp) | 0; //@line 1838
   FUNCTION_TABLE_v[$5 & 3](); //@line 1839
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 37; //@line 1842
    HEAP32[$AsyncCtx + 4 >> 2] = $vararg_buffer; //@line 1844
    HEAP32[$AsyncCtx + 8 >> 2] = $vararg_buffer; //@line 1846
    HEAP8[$AsyncCtx + 12 >> 0] = $0; //@line 1848
    HEAP32[$AsyncCtx + 16 >> 2] = $2; //@line 1850
    HEAP32[$AsyncCtx + 20 >> 2] = $3; //@line 1852
    HEAP32[$AsyncCtx + 24 >> 2] = $vararg_buffer1; //@line 1854
    HEAP32[$AsyncCtx + 28 >> 2] = $vararg_buffer1; //@line 1856
    HEAP32[$AsyncCtx + 32 >> 2] = $vararg_buffer20; //@line 1858
    HEAP32[$AsyncCtx + 36 >> 2] = $vararg_buffer20; //@line 1860
    HEAP32[$AsyncCtx + 40 >> 2] = $vararg_buffer9; //@line 1862
    HEAP32[$AsyncCtx + 44 >> 2] = $1; //@line 1864
    HEAP32[$AsyncCtx + 48 >> 2] = $vararg_buffer9; //@line 1866
    HEAP32[$AsyncCtx + 52 >> 2] = $vararg_buffer12; //@line 1868
    HEAP32[$AsyncCtx + 56 >> 2] = $vararg_buffer12; //@line 1870
    HEAP32[$AsyncCtx + 60 >> 2] = $vararg_buffer15; //@line 1872
    HEAP32[$AsyncCtx + 64 >> 2] = $vararg_buffer15; //@line 1874
    HEAP32[$AsyncCtx + 68 >> 2] = $vararg_buffer18; //@line 1876
    HEAP32[$AsyncCtx + 72 >> 2] = $vararg_buffer18; //@line 1878
    HEAP32[$AsyncCtx + 76 >> 2] = $4; //@line 1880
    HEAP32[$AsyncCtx + 80 >> 2] = $vararg_buffer6; //@line 1882
    HEAP32[$AsyncCtx + 84 >> 2] = $vararg_buffer6; //@line 1884
    HEAP32[$AsyncCtx + 88 >> 2] = $vararg_buffer23; //@line 1886
    HEAP32[$AsyncCtx + 92 >> 2] = $vararg_buffer23; //@line 1888
    HEAP32[$AsyncCtx + 96 >> 2] = $vararg_buffer3; //@line 1890
    HEAP32[$AsyncCtx + 100 >> 2] = $vararg_buffer3; //@line 1892
    sp = STACKTOP; //@line 1893
    STACKTOP = sp; //@line 1894
    return;
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 1896
    HEAP32[63] = (HEAP32[63] | 0) + 1; //@line 1899
    break;
   }
  }
 } while (0);
 $34 = HEAP32[52] | 0; //@line 1904
 do {
  if ($34 | 0) {
   HEAP8[$34 >> 0] = 0; //@line 1908
   do {
    if ($0 << 24 >> 24 > -1 & ($1 | 0) != 0) {
     $38 = HEAP32[49] | 0; //@line 1914
     if (HEAP8[$38 >> 0] | 0) {
      if (_strstr($38, $1) | 0) {
       $$0$i = 1; //@line 1921
       break;
      }
     }
     $43 = HEAP32[50] | 0; //@line 1925
     if (!(HEAP8[$43 >> 0] | 0)) {
      label = 11; //@line 1929
     } else {
      if (!(_strstr($43, $1) | 0)) {
       $$0$i = 1; //@line 1934
      } else {
       label = 11; //@line 1936
      }
     }
    } else {
     label = 11; //@line 1940
    }
   } while (0);
   if ((label | 0) == 11) {
    $$0$i = 0; //@line 1944
   }
   if (!((HEAP32[59] | 0) != 0 & ((($1 | 0) == 0 | (($2 | 0) == 0 | $$0$i)) ^ 1))) {
    HEAP32[56] = HEAP32[54]; //@line 1956
    break;
   }
   $54 = HEAPU8[192] | 0; //@line 1960
   $55 = $0 & 255; //@line 1961
   if ($55 & 31 & $54 | 0) {
    $59 = $54 & 64; //@line 1966
    $$lobit = $59 >>> 6; //@line 1967
    $60 = $$lobit & 255; //@line 1968
    $64 = ($54 & 32 | 0) == 0; //@line 1972
    $65 = HEAP32[53] | 0; //@line 1973
    $66 = HEAP32[52] | 0; //@line 1974
    $67 = $0 << 24 >> 24 == 1; //@line 1975
    do {
     if ($67 | ($54 & 128 | 0) != 0) {
      $AsyncCtx64 = _emscripten_alloc_async_context(8, sp) | 0; //@line 1979
      _vsnprintf($66, $65, $2, $3) | 0; //@line 1980
      if (___async) {
       HEAP32[$AsyncCtx64 >> 2] = 38; //@line 1983
       HEAP8[$AsyncCtx64 + 4 >> 0] = $67 & 1; //@line 1986
       sp = STACKTOP; //@line 1987
       STACKTOP = sp; //@line 1988
       return;
      }
      _emscripten_free_async_context($AsyncCtx64 | 0); //@line 1990
      $69 = HEAP32[60] | 0; //@line 1991
      if (!($67 & ($69 | 0) != 0)) {
       $73 = HEAP32[59] | 0; //@line 1995
       $74 = HEAP32[52] | 0; //@line 1996
       $AsyncCtx34 = _emscripten_alloc_async_context(4, sp) | 0; //@line 1997
       FUNCTION_TABLE_vi[$73 & 255]($74); //@line 1998
       if (___async) {
        HEAP32[$AsyncCtx34 >> 2] = 41; //@line 2001
        sp = STACKTOP; //@line 2002
        STACKTOP = sp; //@line 2003
        return;
       } else {
        _emscripten_free_async_context($AsyncCtx34 | 0); //@line 2005
        break;
       }
      }
      $71 = HEAP32[52] | 0; //@line 2009
      $AsyncCtx27 = _emscripten_alloc_async_context(4, sp) | 0; //@line 2010
      FUNCTION_TABLE_vi[$69 & 255]($71); //@line 2011
      if (___async) {
       HEAP32[$AsyncCtx27 >> 2] = 39; //@line 2014
       sp = STACKTOP; //@line 2015
       STACKTOP = sp; //@line 2016
       return;
      }
      _emscripten_free_async_context($AsyncCtx27 | 0); //@line 2018
      $72 = HEAP32[60] | 0; //@line 2019
      $AsyncCtx30 = _emscripten_alloc_async_context(4, sp) | 0; //@line 2020
      FUNCTION_TABLE_vi[$72 & 255](1416); //@line 2021
      if (___async) {
       HEAP32[$AsyncCtx30 >> 2] = 40; //@line 2024
       sp = STACKTOP; //@line 2025
       STACKTOP = sp; //@line 2026
       return;
      } else {
       _emscripten_free_async_context($AsyncCtx30 | 0); //@line 2028
       break;
      }
     } else {
      if (!$59) {
       $$1$off0 = ($$lobit | 0) != 0; //@line 2035
       $$1143 = $66; //@line 2035
       $$1145 = $65; //@line 2035
       $$3154 = 0; //@line 2035
       label = 38; //@line 2036
      } else {
       if ($64) {
        $$0142 = $66; //@line 2039
        $$0144 = $65; //@line 2039
       } else {
        $76 = _snprintf($66, $65, 1418, $vararg_buffer) | 0; //@line 2041
        $$ = ($76 | 0) >= ($65 | 0) ? 0 : $76; //@line 2043
        $78 = ($$ | 0) > 0; //@line 2044
        $$0142 = $78 ? $66 + $$ | 0 : $66; //@line 2049
        $$0144 = $65 - ($78 ? $$ : 0) | 0; //@line 2049
       }
       if (($$0144 | 0) > 0) {
        $82 = $55 + -2 | 0; //@line 2053
        switch ($82 >>> 1 | $82 << 31 | 0) {
        case 0:
         {
          $$sink = 1436; //@line 2059
          label = 35; //@line 2060
          break;
         }
        case 1:
         {
          $$sink = 1442; //@line 2064
          label = 35; //@line 2065
          break;
         }
        case 3:
         {
          $$sink = 1430; //@line 2069
          label = 35; //@line 2070
          break;
         }
        case 7:
         {
          $$sink = 1424; //@line 2074
          label = 35; //@line 2075
          break;
         }
        default:
         {
          $$0141 = 0; //@line 2079
          $$1152 = 0; //@line 2079
         }
        }
        if ((label | 0) == 35) {
         HEAP32[$vararg_buffer1 >> 2] = $$sink; //@line 2083
         $$0141 = $60 & 1; //@line 2086
         $$1152 = _snprintf($$0142, $$0144, 1448, $vararg_buffer1) | 0; //@line 2086
        }
        $$1152$ = ($$1152 | 0) < ($$0144 | 0) ? $$1152 : 0; //@line 2089
        $extract$t159 = $$0141 << 24 >> 24 != 0; //@line 2091
        if (($$1152$ | 0) > 0) {
         $89 = $$0141 << 24 >> 24 == 0; //@line 2093
         $$1$off0 = $extract$t159; //@line 2098
         $$1143 = $89 ? $$0142 : $$0142 + $$1152$ | 0; //@line 2098
         $$1145 = $$0144 - ($89 ? 0 : $$1152$) | 0; //@line 2098
         $$3154 = $$1152; //@line 2098
         label = 38; //@line 2099
        } else {
         $$1$off0 = $extract$t159; //@line 2101
         $$1143 = $$0142; //@line 2101
         $$1145 = $$0144; //@line 2101
         $$3154 = $$1152$; //@line 2101
         label = 38; //@line 2102
        }
       }
      }
      L54 : do {
       if ((label | 0) == 38) {
        do {
         if (($$1145 | 0) > 0 & (HEAP32[57] | 0) != 0) {
          HEAP32[$4 >> 2] = HEAP32[$3 >> 2]; //@line 2115
          $AsyncCtx60 = _emscripten_alloc_async_context(104, sp) | 0; //@line 2116
          $95 = _vsnprintf(0, 0, $2, $4) | 0; //@line 2117
          if (___async) {
           HEAP32[$AsyncCtx60 >> 2] = 42; //@line 2120
           HEAP32[$AsyncCtx60 + 4 >> 2] = $vararg_buffer20; //@line 2122
           HEAP32[$AsyncCtx60 + 8 >> 2] = $vararg_buffer20; //@line 2124
           HEAP32[$AsyncCtx60 + 12 >> 2] = $vararg_buffer9; //@line 2126
           HEAP32[$AsyncCtx60 + 16 >> 2] = $1; //@line 2128
           HEAP32[$AsyncCtx60 + 20 >> 2] = $vararg_buffer9; //@line 2130
           HEAP32[$AsyncCtx60 + 24 >> 2] = $vararg_buffer12; //@line 2132
           HEAP32[$AsyncCtx60 + 28 >> 2] = $vararg_buffer12; //@line 2134
           HEAP32[$AsyncCtx60 + 32 >> 2] = $vararg_buffer15; //@line 2136
           HEAP32[$AsyncCtx60 + 36 >> 2] = $vararg_buffer15; //@line 2138
           HEAP32[$AsyncCtx60 + 40 >> 2] = $vararg_buffer18; //@line 2140
           HEAP32[$AsyncCtx60 + 44 >> 2] = $vararg_buffer18; //@line 2142
           HEAP32[$AsyncCtx60 + 48 >> 2] = $$1143; //@line 2144
           HEAP32[$AsyncCtx60 + 52 >> 2] = $$1145; //@line 2146
           HEAP32[$AsyncCtx60 + 56 >> 2] = $55; //@line 2148
           HEAP32[$AsyncCtx60 + 60 >> 2] = $vararg_buffer6; //@line 2150
           HEAP32[$AsyncCtx60 + 64 >> 2] = $vararg_buffer6; //@line 2152
           HEAP8[$AsyncCtx60 + 68 >> 0] = $$1$off0 & 1; //@line 2155
           HEAP32[$AsyncCtx60 + 72 >> 2] = $vararg_buffer23; //@line 2157
           HEAP32[$AsyncCtx60 + 76 >> 2] = $vararg_buffer23; //@line 2159
           HEAP32[$AsyncCtx60 + 80 >> 2] = $vararg_buffer3; //@line 2161
           HEAP32[$AsyncCtx60 + 84 >> 2] = $vararg_buffer3; //@line 2163
           HEAP32[$AsyncCtx60 + 88 >> 2] = $4; //@line 2165
           HEAP32[$AsyncCtx60 + 92 >> 2] = $2; //@line 2167
           HEAP32[$AsyncCtx60 + 96 >> 2] = $3; //@line 2169
           HEAP32[$AsyncCtx60 + 100 >> 2] = $$3154; //@line 2171
           sp = STACKTOP; //@line 2172
           STACKTOP = sp; //@line 2173
           return;
          }
          _emscripten_free_async_context($AsyncCtx60 | 0); //@line 2175
          $125 = HEAP32[57] | 0; //@line 2180
          $AsyncCtx38 = _emscripten_alloc_async_context(100, sp) | 0; //@line 2181
          $126 = FUNCTION_TABLE_ii[$125 & 15](($$3154 | 0 ? 4 : 0) + $$3154 + $95 | 0) | 0; //@line 2182
          if (___async) {
           HEAP32[$AsyncCtx38 >> 2] = 43; //@line 2185
           HEAP32[$AsyncCtx38 + 4 >> 2] = $vararg_buffer20; //@line 2187
           HEAP32[$AsyncCtx38 + 8 >> 2] = $vararg_buffer20; //@line 2189
           HEAP32[$AsyncCtx38 + 12 >> 2] = $vararg_buffer9; //@line 2191
           HEAP32[$AsyncCtx38 + 16 >> 2] = $1; //@line 2193
           HEAP32[$AsyncCtx38 + 20 >> 2] = $vararg_buffer9; //@line 2195
           HEAP32[$AsyncCtx38 + 24 >> 2] = $vararg_buffer12; //@line 2197
           HEAP32[$AsyncCtx38 + 28 >> 2] = $vararg_buffer12; //@line 2199
           HEAP32[$AsyncCtx38 + 32 >> 2] = $vararg_buffer15; //@line 2201
           HEAP32[$AsyncCtx38 + 36 >> 2] = $vararg_buffer15; //@line 2203
           HEAP32[$AsyncCtx38 + 40 >> 2] = $vararg_buffer18; //@line 2205
           HEAP32[$AsyncCtx38 + 44 >> 2] = $vararg_buffer18; //@line 2207
           HEAP32[$AsyncCtx38 + 48 >> 2] = $$1143; //@line 2209
           HEAP32[$AsyncCtx38 + 52 >> 2] = $$1145; //@line 2211
           HEAP32[$AsyncCtx38 + 56 >> 2] = $55; //@line 2213
           HEAP32[$AsyncCtx38 + 60 >> 2] = $vararg_buffer6; //@line 2215
           HEAP32[$AsyncCtx38 + 64 >> 2] = $vararg_buffer6; //@line 2217
           HEAP8[$AsyncCtx38 + 68 >> 0] = $$1$off0 & 1; //@line 2220
           HEAP32[$AsyncCtx38 + 72 >> 2] = $vararg_buffer23; //@line 2222
           HEAP32[$AsyncCtx38 + 76 >> 2] = $vararg_buffer23; //@line 2224
           HEAP32[$AsyncCtx38 + 80 >> 2] = $vararg_buffer3; //@line 2226
           HEAP32[$AsyncCtx38 + 84 >> 2] = $vararg_buffer3; //@line 2228
           HEAP32[$AsyncCtx38 + 88 >> 2] = $4; //@line 2230
           HEAP32[$AsyncCtx38 + 92 >> 2] = $2; //@line 2232
           HEAP32[$AsyncCtx38 + 96 >> 2] = $3; //@line 2234
           sp = STACKTOP; //@line 2235
           STACKTOP = sp; //@line 2236
           return;
          } else {
           _emscripten_free_async_context($AsyncCtx38 | 0); //@line 2238
           HEAP32[$vararg_buffer3 >> 2] = $126; //@line 2239
           $151 = _snprintf($$1143, $$1145, 1448, $vararg_buffer3) | 0; //@line 2240
           $$10 = ($151 | 0) >= ($$1145 | 0) ? 0 : $151; //@line 2242
           if (($$10 | 0) > 0) {
            $$3 = $$1143 + $$10 | 0; //@line 2247
            $$3147 = $$1145 - $$10 | 0; //@line 2247
            label = 44; //@line 2248
            break;
           } else {
            $$3147168 = $$1145; //@line 2251
            $$3169 = $$1143; //@line 2251
            break;
           }
          }
         } else {
          $$3 = $$1143; //@line 2256
          $$3147 = $$1145; //@line 2256
          label = 44; //@line 2257
         }
        } while (0);
        if ((label | 0) == 44) {
         if (($$3147 | 0) > 0) {
          $$3147168 = $$3147; //@line 2263
          $$3169 = $$3; //@line 2263
         } else {
          break;
         }
        }
        $157 = $55 + -2 | 0; //@line 2268
        switch ($157 >>> 1 | $157 << 31 | 0) {
        case 0:
         {
          HEAP32[$vararg_buffer6 >> 2] = $1; //@line 2274
          $$5156 = _snprintf($$3169, $$3147168, 1451, $vararg_buffer6) | 0; //@line 2276
          break;
         }
        case 1:
         {
          HEAP32[$vararg_buffer9 >> 2] = $1; //@line 2280
          $$5156 = _snprintf($$3169, $$3147168, 1466, $vararg_buffer9) | 0; //@line 2282
          break;
         }
        case 3:
         {
          HEAP32[$vararg_buffer12 >> 2] = $1; //@line 2286
          $$5156 = _snprintf($$3169, $$3147168, 1481, $vararg_buffer12) | 0; //@line 2288
          break;
         }
        case 7:
         {
          HEAP32[$vararg_buffer15 >> 2] = $1; //@line 2292
          $$5156 = _snprintf($$3169, $$3147168, 1496, $vararg_buffer15) | 0; //@line 2294
          break;
         }
        default:
         {
          $$5156 = _snprintf($$3169, $$3147168, 1511, $vararg_buffer18) | 0; //@line 2299
         }
        }
        $$5156$ = ($$5156 | 0) < ($$3147168 | 0) ? $$5156 : 0; //@line 2303
        $168 = $$3169 + $$5156$ | 0; //@line 2305
        $169 = $$3147168 - $$5156$ | 0; //@line 2306
        if (($$5156$ | 0) > 0 & ($169 | 0) > 0) {
         $AsyncCtx56 = _emscripten_alloc_async_context(32, sp) | 0; //@line 2310
         $171 = _vsnprintf($168, $169, $2, $3) | 0; //@line 2311
         if (___async) {
          HEAP32[$AsyncCtx56 >> 2] = 44; //@line 2314
          HEAP32[$AsyncCtx56 + 4 >> 2] = $169; //@line 2316
          HEAP32[$AsyncCtx56 + 8 >> 2] = $168; //@line 2318
          HEAP32[$AsyncCtx56 + 12 >> 2] = $vararg_buffer20; //@line 2320
          HEAP32[$AsyncCtx56 + 16 >> 2] = $vararg_buffer20; //@line 2322
          HEAP8[$AsyncCtx56 + 20 >> 0] = $$1$off0 & 1; //@line 2325
          HEAP32[$AsyncCtx56 + 24 >> 2] = $vararg_buffer23; //@line 2327
          HEAP32[$AsyncCtx56 + 28 >> 2] = $vararg_buffer23; //@line 2329
          sp = STACKTOP; //@line 2330
          STACKTOP = sp; //@line 2331
          return;
         }
         _emscripten_free_async_context($AsyncCtx56 | 0); //@line 2333
         $$13 = ($171 | 0) >= ($169 | 0) ? 0 : $171; //@line 2335
         $181 = $168 + $$13 | 0; //@line 2337
         $182 = $169 - $$13 | 0; //@line 2338
         if (($$13 | 0) > 0) {
          $184 = HEAP32[58] | 0; //@line 2341
          do {
           if (($182 | 0) > 0 & ($184 | 0) != 0) {
            $AsyncCtx42 = _emscripten_alloc_async_context(32, sp) | 0; //@line 2346
            $186 = FUNCTION_TABLE_i[$184 & 0]() | 0; //@line 2347
            if (___async) {
             HEAP32[$AsyncCtx42 >> 2] = 45; //@line 2350
             HEAP32[$AsyncCtx42 + 4 >> 2] = $vararg_buffer20; //@line 2352
             HEAP32[$AsyncCtx42 + 8 >> 2] = $181; //@line 2354
             HEAP32[$AsyncCtx42 + 12 >> 2] = $182; //@line 2356
             HEAP32[$AsyncCtx42 + 16 >> 2] = $vararg_buffer20; //@line 2358
             HEAP8[$AsyncCtx42 + 20 >> 0] = $$1$off0 & 1; //@line 2361
             HEAP32[$AsyncCtx42 + 24 >> 2] = $vararg_buffer23; //@line 2363
             HEAP32[$AsyncCtx42 + 28 >> 2] = $vararg_buffer23; //@line 2365
             sp = STACKTOP; //@line 2366
             STACKTOP = sp; //@line 2367
             return;
            } else {
             _emscripten_free_async_context($AsyncCtx42 | 0); //@line 2369
             HEAP32[$vararg_buffer20 >> 2] = $186; //@line 2370
             $194 = _snprintf($181, $182, 1448, $vararg_buffer20) | 0; //@line 2371
             $$18 = ($194 | 0) >= ($182 | 0) ? 0 : $194; //@line 2373
             if (($$18 | 0) > 0) {
              $$6 = $181 + $$18 | 0; //@line 2378
              $$6150 = $182 - $$18 | 0; //@line 2378
              $$9 = $$18; //@line 2378
              break;
             } else {
              break L54;
             }
            }
           } else {
            $$6 = $181; //@line 2385
            $$6150 = $182; //@line 2385
            $$9 = $$13; //@line 2385
           }
          } while (0);
          if (!(($$9 | 0) < 1 | ($$6150 | 0) < 1 | $$1$off0 ^ 1)) {
           _snprintf($$6, $$6150, 1526, $vararg_buffer23) | 0; //@line 2394
          }
         }
        }
       }
      } while (0);
      $201 = HEAP32[59] | 0; //@line 2400
      $202 = HEAP32[52] | 0; //@line 2401
      $AsyncCtx45 = _emscripten_alloc_async_context(4, sp) | 0; //@line 2402
      FUNCTION_TABLE_vi[$201 & 255]($202); //@line 2403
      if (___async) {
       HEAP32[$AsyncCtx45 >> 2] = 46; //@line 2406
       sp = STACKTOP; //@line 2407
       STACKTOP = sp; //@line 2408
       return;
      } else {
       _emscripten_free_async_context($AsyncCtx45 | 0); //@line 2410
       break;
      }
     }
    } while (0);
    HEAP32[56] = HEAP32[54]; //@line 2416
   }
  }
 } while (0);
 $204 = HEAP32[62] | 0; //@line 2420
 if (!$204) {
  STACKTOP = sp; //@line 2423
  return;
 }
 $206 = HEAP32[63] | 0; //@line 2425
 HEAP32[63] = 0; //@line 2426
 $AsyncCtx49 = _emscripten_alloc_async_context(8, sp) | 0; //@line 2427
 FUNCTION_TABLE_v[$204 & 3](); //@line 2428
 if (___async) {
  HEAP32[$AsyncCtx49 >> 2] = 47; //@line 2431
  HEAP32[$AsyncCtx49 + 4 >> 2] = $206; //@line 2433
  sp = STACKTOP; //@line 2434
  STACKTOP = sp; //@line 2435
  return;
 }
 _emscripten_free_async_context($AsyncCtx49 | 0); //@line 2437
 if (($206 | 0) > 1) {
  $$0199 = $206; //@line 2440
 } else {
  STACKTOP = sp; //@line 2442
  return;
 }
 while (1) {
  $209 = $$0199 + -1 | 0; //@line 2445
  $$pre = HEAP32[62] | 0; //@line 2446
  $AsyncCtx52 = _emscripten_alloc_async_context(12, sp) | 0; //@line 2447
  FUNCTION_TABLE_v[$$pre & 3](); //@line 2448
  if (___async) {
   label = 70; //@line 2451
   break;
  }
  _emscripten_free_async_context($AsyncCtx52 | 0); //@line 2454
  if (($$0199 | 0) > 2) {
   $$0199 = $209; //@line 2457
  } else {
   label = 72; //@line 2459
   break;
  }
 }
 if ((label | 0) == 70) {
  HEAP32[$AsyncCtx52 >> 2] = 48; //@line 2464
  HEAP32[$AsyncCtx52 + 4 >> 2] = $$0199; //@line 2466
  HEAP32[$AsyncCtx52 + 8 >> 2] = $209; //@line 2468
  sp = STACKTOP; //@line 2469
  STACKTOP = sp; //@line 2470
  return;
 } else if ((label | 0) == 72) {
  STACKTOP = sp; //@line 2473
  return;
 }
}
function _mbed_vtracef__async_cb($0) {
 $0 = $0 | 0;
 var $$ = 0, $$0$i = 0, $$0141 = 0, $$0142 = 0, $$0144 = 0, $$1$off0 = 0, $$1$off0$expand_i1_val = 0, $$1$off0$expand_i1_val18 = 0, $$1143 = 0, $$1145 = 0, $$1152 = 0, $$1152$ = 0, $$3154 = 0, $$5156 = 0, $$5156$ = 0, $$expand_i1_val = 0, $$lobit = 0, $$sink = 0, $10 = 0, $102 = 0, $108 = 0, $109 = 0, $110 = 0, $111 = 0, $112 = 0, $113 = 0, $114 = 0, $115 = 0, $116 = 0, $117 = 0, $118 = 0, $119 = 0, $12 = 0, $120 = 0, $121 = 0, $122 = 0, $123 = 0, $124 = 0, $125 = 0, $126 = 0, $127 = 0, $128 = 0, $129 = 0, $130 = 0, $131 = 0, $132 = 0, $133 = 0, $136 = 0, $147 = 0, $148 = 0, $150 = 0, $151 = 0, $152 = 0, $153 = 0, $154 = 0, $155 = 0, $156 = 0, $157 = 0, $159 = 0, $16 = 0, $160 = 0, $161 = 0, $163 = 0, $164 = 0, $18 = 0, $2 = 0, $20 = 0, $22 = 0, $24 = 0, $26 = 0, $28 = 0, $30 = 0, $32 = 0, $34 = 0, $36 = 0, $38 = 0, $40 = 0, $42 = 0, $44 = 0, $46 = 0, $48 = 0, $50 = 0, $53 = 0, $57 = 0, $6 = 0, $62 = 0, $73 = 0, $74 = 0, $78 = 0, $79 = 0, $8 = 0, $83 = 0, $84 = 0, $85 = 0, $86 = 0, $87 = 0, $89 = 0, $91 = 0, $95 = 0, $ReallocAsyncCtx10 = 0, $ReallocAsyncCtx11 = 0, $ReallocAsyncCtx12 = 0, $ReallocAsyncCtx7 = 0, $ReallocAsyncCtx8 = 0, $extract$t159 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 2573
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 2575
 $6 = HEAP8[$0 + 12 >> 0] | 0; //@line 2579
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 2581
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 2583
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 2585
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 2589
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 2591
 $20 = HEAP32[$0 + 40 >> 2] | 0; //@line 2593
 $22 = HEAP32[$0 + 44 >> 2] | 0; //@line 2595
 $24 = HEAP32[$0 + 48 >> 2] | 0; //@line 2597
 $26 = HEAP32[$0 + 52 >> 2] | 0; //@line 2599
 $28 = HEAP32[$0 + 56 >> 2] | 0; //@line 2601
 $30 = HEAP32[$0 + 60 >> 2] | 0; //@line 2603
 $32 = HEAP32[$0 + 64 >> 2] | 0; //@line 2605
 $34 = HEAP32[$0 + 68 >> 2] | 0; //@line 2607
 $36 = HEAP32[$0 + 72 >> 2] | 0; //@line 2609
 $38 = HEAP32[$0 + 76 >> 2] | 0; //@line 2611
 $40 = HEAP32[$0 + 80 >> 2] | 0; //@line 2613
 $42 = HEAP32[$0 + 84 >> 2] | 0; //@line 2615
 $44 = HEAP32[$0 + 88 >> 2] | 0; //@line 2617
 $46 = HEAP32[$0 + 92 >> 2] | 0; //@line 2619
 $48 = HEAP32[$0 + 96 >> 2] | 0; //@line 2621
 $50 = HEAP32[$0 + 100 >> 2] | 0; //@line 2623
 HEAP32[63] = (HEAP32[63] | 0) + 1; //@line 2626
 $53 = HEAP32[52] | 0; //@line 2627
 do {
  if ($53 | 0) {
   HEAP8[$53 >> 0] = 0; //@line 2631
   do {
    if ($6 << 24 >> 24 > -1 & ($22 | 0) != 0) {
     $57 = HEAP32[49] | 0; //@line 2637
     if (HEAP8[$57 >> 0] | 0) {
      if (_strstr($57, $22) | 0) {
       $$0$i = 1; //@line 2644
       break;
      }
     }
     $62 = HEAP32[50] | 0; //@line 2648
     if (!(HEAP8[$62 >> 0] | 0)) {
      label = 9; //@line 2652
     } else {
      if (!(_strstr($62, $22) | 0)) {
       $$0$i = 1; //@line 2657
      } else {
       label = 9; //@line 2659
      }
     }
    } else {
     label = 9; //@line 2663
    }
   } while (0);
   if ((label | 0) == 9) {
    $$0$i = 0; //@line 2667
   }
   if (!((HEAP32[59] | 0) != 0 & ((($22 | 0) == 0 | (($8 | 0) == 0 | $$0$i)) ^ 1))) {
    HEAP32[56] = HEAP32[54]; //@line 2679
    break;
   }
   $73 = HEAPU8[192] | 0; //@line 2683
   $74 = $6 & 255; //@line 2684
   if ($74 & 31 & $73 | 0) {
    $78 = $73 & 64; //@line 2689
    $$lobit = $78 >>> 6; //@line 2690
    $79 = $$lobit & 255; //@line 2691
    $83 = ($73 & 32 | 0) == 0; //@line 2695
    $84 = HEAP32[53] | 0; //@line 2696
    $85 = HEAP32[52] | 0; //@line 2697
    $86 = $6 << 24 >> 24 == 1; //@line 2698
    if ($86 | ($73 & 128 | 0) != 0) {
     $ReallocAsyncCtx12 = _emscripten_realloc_async_context(8) | 0; //@line 2701
     _vsnprintf($85, $84, $8, $10) | 0; //@line 2702
     if (___async) {
      HEAP32[$ReallocAsyncCtx12 >> 2] = 38; //@line 2705
      $87 = $ReallocAsyncCtx12 + 4 | 0; //@line 2706
      $$expand_i1_val = $86 & 1; //@line 2707
      HEAP8[$87 >> 0] = $$expand_i1_val; //@line 2708
      sp = STACKTOP; //@line 2709
      return;
     }
     ___async_unwind = 0; //@line 2712
     HEAP32[$ReallocAsyncCtx12 >> 2] = 38; //@line 2713
     $87 = $ReallocAsyncCtx12 + 4 | 0; //@line 2714
     $$expand_i1_val = $86 & 1; //@line 2715
     HEAP8[$87 >> 0] = $$expand_i1_val; //@line 2716
     sp = STACKTOP; //@line 2717
     return;
    }
    if (!$78) {
     $$1$off0 = ($$lobit | 0) != 0; //@line 2723
     $$1143 = $85; //@line 2723
     $$1145 = $84; //@line 2723
     $$3154 = 0; //@line 2723
     label = 28; //@line 2724
    } else {
     if ($83) {
      $$0142 = $85; //@line 2727
      $$0144 = $84; //@line 2727
     } else {
      $89 = _snprintf($85, $84, 1418, $2) | 0; //@line 2729
      $$ = ($89 | 0) >= ($84 | 0) ? 0 : $89; //@line 2731
      $91 = ($$ | 0) > 0; //@line 2732
      $$0142 = $91 ? $85 + $$ | 0 : $85; //@line 2737
      $$0144 = $84 - ($91 ? $$ : 0) | 0; //@line 2737
     }
     if (($$0144 | 0) > 0) {
      $95 = $74 + -2 | 0; //@line 2741
      switch ($95 >>> 1 | $95 << 31 | 0) {
      case 0:
       {
        $$sink = 1436; //@line 2747
        label = 25; //@line 2748
        break;
       }
      case 1:
       {
        $$sink = 1442; //@line 2752
        label = 25; //@line 2753
        break;
       }
      case 3:
       {
        $$sink = 1430; //@line 2757
        label = 25; //@line 2758
        break;
       }
      case 7:
       {
        $$sink = 1424; //@line 2762
        label = 25; //@line 2763
        break;
       }
      default:
       {
        $$0141 = 0; //@line 2767
        $$1152 = 0; //@line 2767
       }
      }
      if ((label | 0) == 25) {
       HEAP32[$12 >> 2] = $$sink; //@line 2771
       $$0141 = $79 & 1; //@line 2774
       $$1152 = _snprintf($$0142, $$0144, 1448, $12) | 0; //@line 2774
      }
      $$1152$ = ($$1152 | 0) < ($$0144 | 0) ? $$1152 : 0; //@line 2777
      $extract$t159 = $$0141 << 24 >> 24 != 0; //@line 2779
      if (($$1152$ | 0) > 0) {
       $102 = $$0141 << 24 >> 24 == 0; //@line 2781
       $$1$off0 = $extract$t159; //@line 2786
       $$1143 = $102 ? $$0142 : $$0142 + $$1152$ | 0; //@line 2786
       $$1145 = $$0144 - ($102 ? 0 : $$1152$) | 0; //@line 2786
       $$3154 = $$1152; //@line 2786
       label = 28; //@line 2787
      } else {
       $$1$off0 = $extract$t159; //@line 2789
       $$1143 = $$0142; //@line 2789
       $$1145 = $$0144; //@line 2789
       $$3154 = $$1152$; //@line 2789
       label = 28; //@line 2790
      }
     }
    }
    if ((label | 0) == 28) {
     if (($$1145 | 0) > 0 & (HEAP32[57] | 0) != 0) {
      HEAP32[$38 >> 2] = HEAP32[$10 >> 2]; //@line 2801
      $ReallocAsyncCtx11 = _emscripten_realloc_async_context(104) | 0; //@line 2802
      $108 = _vsnprintf(0, 0, $8, $38) | 0; //@line 2803
      if (___async) {
       HEAP32[$ReallocAsyncCtx11 >> 2] = 42; //@line 2806
       $109 = $ReallocAsyncCtx11 + 4 | 0; //@line 2807
       HEAP32[$109 >> 2] = $16; //@line 2808
       $110 = $ReallocAsyncCtx11 + 8 | 0; //@line 2809
       HEAP32[$110 >> 2] = $18; //@line 2810
       $111 = $ReallocAsyncCtx11 + 12 | 0; //@line 2811
       HEAP32[$111 >> 2] = $20; //@line 2812
       $112 = $ReallocAsyncCtx11 + 16 | 0; //@line 2813
       HEAP32[$112 >> 2] = $22; //@line 2814
       $113 = $ReallocAsyncCtx11 + 20 | 0; //@line 2815
       HEAP32[$113 >> 2] = $24; //@line 2816
       $114 = $ReallocAsyncCtx11 + 24 | 0; //@line 2817
       HEAP32[$114 >> 2] = $26; //@line 2818
       $115 = $ReallocAsyncCtx11 + 28 | 0; //@line 2819
       HEAP32[$115 >> 2] = $28; //@line 2820
       $116 = $ReallocAsyncCtx11 + 32 | 0; //@line 2821
       HEAP32[$116 >> 2] = $30; //@line 2822
       $117 = $ReallocAsyncCtx11 + 36 | 0; //@line 2823
       HEAP32[$117 >> 2] = $32; //@line 2824
       $118 = $ReallocAsyncCtx11 + 40 | 0; //@line 2825
       HEAP32[$118 >> 2] = $34; //@line 2826
       $119 = $ReallocAsyncCtx11 + 44 | 0; //@line 2827
       HEAP32[$119 >> 2] = $36; //@line 2828
       $120 = $ReallocAsyncCtx11 + 48 | 0; //@line 2829
       HEAP32[$120 >> 2] = $$1143; //@line 2830
       $121 = $ReallocAsyncCtx11 + 52 | 0; //@line 2831
       HEAP32[$121 >> 2] = $$1145; //@line 2832
       $122 = $ReallocAsyncCtx11 + 56 | 0; //@line 2833
       HEAP32[$122 >> 2] = $74; //@line 2834
       $123 = $ReallocAsyncCtx11 + 60 | 0; //@line 2835
       HEAP32[$123 >> 2] = $40; //@line 2836
       $124 = $ReallocAsyncCtx11 + 64 | 0; //@line 2837
       HEAP32[$124 >> 2] = $42; //@line 2838
       $125 = $ReallocAsyncCtx11 + 68 | 0; //@line 2839
       $$1$off0$expand_i1_val = $$1$off0 & 1; //@line 2840
       HEAP8[$125 >> 0] = $$1$off0$expand_i1_val; //@line 2841
       $126 = $ReallocAsyncCtx11 + 72 | 0; //@line 2842
       HEAP32[$126 >> 2] = $44; //@line 2843
       $127 = $ReallocAsyncCtx11 + 76 | 0; //@line 2844
       HEAP32[$127 >> 2] = $46; //@line 2845
       $128 = $ReallocAsyncCtx11 + 80 | 0; //@line 2846
       HEAP32[$128 >> 2] = $48; //@line 2847
       $129 = $ReallocAsyncCtx11 + 84 | 0; //@line 2848
       HEAP32[$129 >> 2] = $50; //@line 2849
       $130 = $ReallocAsyncCtx11 + 88 | 0; //@line 2850
       HEAP32[$130 >> 2] = $38; //@line 2851
       $131 = $ReallocAsyncCtx11 + 92 | 0; //@line 2852
       HEAP32[$131 >> 2] = $8; //@line 2853
       $132 = $ReallocAsyncCtx11 + 96 | 0; //@line 2854
       HEAP32[$132 >> 2] = $10; //@line 2855
       $133 = $ReallocAsyncCtx11 + 100 | 0; //@line 2856
       HEAP32[$133 >> 2] = $$3154; //@line 2857
       sp = STACKTOP; //@line 2858
       return;
      }
      HEAP32[___async_retval >> 2] = $108; //@line 2862
      ___async_unwind = 0; //@line 2863
      HEAP32[$ReallocAsyncCtx11 >> 2] = 42; //@line 2864
      $109 = $ReallocAsyncCtx11 + 4 | 0; //@line 2865
      HEAP32[$109 >> 2] = $16; //@line 2866
      $110 = $ReallocAsyncCtx11 + 8 | 0; //@line 2867
      HEAP32[$110 >> 2] = $18; //@line 2868
      $111 = $ReallocAsyncCtx11 + 12 | 0; //@line 2869
      HEAP32[$111 >> 2] = $20; //@line 2870
      $112 = $ReallocAsyncCtx11 + 16 | 0; //@line 2871
      HEAP32[$112 >> 2] = $22; //@line 2872
      $113 = $ReallocAsyncCtx11 + 20 | 0; //@line 2873
      HEAP32[$113 >> 2] = $24; //@line 2874
      $114 = $ReallocAsyncCtx11 + 24 | 0; //@line 2875
      HEAP32[$114 >> 2] = $26; //@line 2876
      $115 = $ReallocAsyncCtx11 + 28 | 0; //@line 2877
      HEAP32[$115 >> 2] = $28; //@line 2878
      $116 = $ReallocAsyncCtx11 + 32 | 0; //@line 2879
      HEAP32[$116 >> 2] = $30; //@line 2880
      $117 = $ReallocAsyncCtx11 + 36 | 0; //@line 2881
      HEAP32[$117 >> 2] = $32; //@line 2882
      $118 = $ReallocAsyncCtx11 + 40 | 0; //@line 2883
      HEAP32[$118 >> 2] = $34; //@line 2884
      $119 = $ReallocAsyncCtx11 + 44 | 0; //@line 2885
      HEAP32[$119 >> 2] = $36; //@line 2886
      $120 = $ReallocAsyncCtx11 + 48 | 0; //@line 2887
      HEAP32[$120 >> 2] = $$1143; //@line 2888
      $121 = $ReallocAsyncCtx11 + 52 | 0; //@line 2889
      HEAP32[$121 >> 2] = $$1145; //@line 2890
      $122 = $ReallocAsyncCtx11 + 56 | 0; //@line 2891
      HEAP32[$122 >> 2] = $74; //@line 2892
      $123 = $ReallocAsyncCtx11 + 60 | 0; //@line 2893
      HEAP32[$123 >> 2] = $40; //@line 2894
      $124 = $ReallocAsyncCtx11 + 64 | 0; //@line 2895
      HEAP32[$124 >> 2] = $42; //@line 2896
      $125 = $ReallocAsyncCtx11 + 68 | 0; //@line 2897
      $$1$off0$expand_i1_val = $$1$off0 & 1; //@line 2898
      HEAP8[$125 >> 0] = $$1$off0$expand_i1_val; //@line 2899
      $126 = $ReallocAsyncCtx11 + 72 | 0; //@line 2900
      HEAP32[$126 >> 2] = $44; //@line 2901
      $127 = $ReallocAsyncCtx11 + 76 | 0; //@line 2902
      HEAP32[$127 >> 2] = $46; //@line 2903
      $128 = $ReallocAsyncCtx11 + 80 | 0; //@line 2904
      HEAP32[$128 >> 2] = $48; //@line 2905
      $129 = $ReallocAsyncCtx11 + 84 | 0; //@line 2906
      HEAP32[$129 >> 2] = $50; //@line 2907
      $130 = $ReallocAsyncCtx11 + 88 | 0; //@line 2908
      HEAP32[$130 >> 2] = $38; //@line 2909
      $131 = $ReallocAsyncCtx11 + 92 | 0; //@line 2910
      HEAP32[$131 >> 2] = $8; //@line 2911
      $132 = $ReallocAsyncCtx11 + 96 | 0; //@line 2912
      HEAP32[$132 >> 2] = $10; //@line 2913
      $133 = $ReallocAsyncCtx11 + 100 | 0; //@line 2914
      HEAP32[$133 >> 2] = $$3154; //@line 2915
      sp = STACKTOP; //@line 2916
      return;
     }
     if (($$1145 | 0) > 0) {
      $136 = $74 + -2 | 0; //@line 2921
      switch ($136 >>> 1 | $136 << 31 | 0) {
      case 0:
       {
        HEAP32[$40 >> 2] = $22; //@line 2927
        $$5156 = _snprintf($$1143, $$1145, 1451, $40) | 0; //@line 2929
        break;
       }
      case 1:
       {
        HEAP32[$20 >> 2] = $22; //@line 2933
        $$5156 = _snprintf($$1143, $$1145, 1466, $20) | 0; //@line 2935
        break;
       }
      case 3:
       {
        HEAP32[$26 >> 2] = $22; //@line 2939
        $$5156 = _snprintf($$1143, $$1145, 1481, $26) | 0; //@line 2941
        break;
       }
      case 7:
       {
        HEAP32[$30 >> 2] = $22; //@line 2945
        $$5156 = _snprintf($$1143, $$1145, 1496, $30) | 0; //@line 2947
        break;
       }
      default:
       {
        $$5156 = _snprintf($$1143, $$1145, 1511, $34) | 0; //@line 2952
       }
      }
      $$5156$ = ($$5156 | 0) < ($$1145 | 0) ? $$5156 : 0; //@line 2956
      $147 = $$1143 + $$5156$ | 0; //@line 2958
      $148 = $$1145 - $$5156$ | 0; //@line 2959
      if (($$5156$ | 0) > 0 & ($148 | 0) > 0) {
       $ReallocAsyncCtx10 = _emscripten_realloc_async_context(32) | 0; //@line 2963
       $150 = _vsnprintf($147, $148, $8, $10) | 0; //@line 2964
       if (___async) {
        HEAP32[$ReallocAsyncCtx10 >> 2] = 44; //@line 2967
        $151 = $ReallocAsyncCtx10 + 4 | 0; //@line 2968
        HEAP32[$151 >> 2] = $148; //@line 2969
        $152 = $ReallocAsyncCtx10 + 8 | 0; //@line 2970
        HEAP32[$152 >> 2] = $147; //@line 2971
        $153 = $ReallocAsyncCtx10 + 12 | 0; //@line 2972
        HEAP32[$153 >> 2] = $16; //@line 2973
        $154 = $ReallocAsyncCtx10 + 16 | 0; //@line 2974
        HEAP32[$154 >> 2] = $18; //@line 2975
        $155 = $ReallocAsyncCtx10 + 20 | 0; //@line 2976
        $$1$off0$expand_i1_val18 = $$1$off0 & 1; //@line 2977
        HEAP8[$155 >> 0] = $$1$off0$expand_i1_val18; //@line 2978
        $156 = $ReallocAsyncCtx10 + 24 | 0; //@line 2979
        HEAP32[$156 >> 2] = $44; //@line 2980
        $157 = $ReallocAsyncCtx10 + 28 | 0; //@line 2981
        HEAP32[$157 >> 2] = $46; //@line 2982
        sp = STACKTOP; //@line 2983
        return;
       }
       HEAP32[___async_retval >> 2] = $150; //@line 2987
       ___async_unwind = 0; //@line 2988
       HEAP32[$ReallocAsyncCtx10 >> 2] = 44; //@line 2989
       $151 = $ReallocAsyncCtx10 + 4 | 0; //@line 2990
       HEAP32[$151 >> 2] = $148; //@line 2991
       $152 = $ReallocAsyncCtx10 + 8 | 0; //@line 2992
       HEAP32[$152 >> 2] = $147; //@line 2993
       $153 = $ReallocAsyncCtx10 + 12 | 0; //@line 2994
       HEAP32[$153 >> 2] = $16; //@line 2995
       $154 = $ReallocAsyncCtx10 + 16 | 0; //@line 2996
       HEAP32[$154 >> 2] = $18; //@line 2997
       $155 = $ReallocAsyncCtx10 + 20 | 0; //@line 2998
       $$1$off0$expand_i1_val18 = $$1$off0 & 1; //@line 2999
       HEAP8[$155 >> 0] = $$1$off0$expand_i1_val18; //@line 3000
       $156 = $ReallocAsyncCtx10 + 24 | 0; //@line 3001
       HEAP32[$156 >> 2] = $44; //@line 3002
       $157 = $ReallocAsyncCtx10 + 28 | 0; //@line 3003
       HEAP32[$157 >> 2] = $46; //@line 3004
       sp = STACKTOP; //@line 3005
       return;
      }
     }
    }
    $159 = HEAP32[59] | 0; //@line 3010
    $160 = HEAP32[52] | 0; //@line 3011
    $ReallocAsyncCtx7 = _emscripten_realloc_async_context(4) | 0; //@line 3012
    FUNCTION_TABLE_vi[$159 & 255]($160); //@line 3013
    if (___async) {
     HEAP32[$ReallocAsyncCtx7 >> 2] = 46; //@line 3016
     sp = STACKTOP; //@line 3017
     return;
    }
    ___async_unwind = 0; //@line 3020
    HEAP32[$ReallocAsyncCtx7 >> 2] = 46; //@line 3021
    sp = STACKTOP; //@line 3022
    return;
   }
  }
 } while (0);
 $161 = HEAP32[62] | 0; //@line 3027
 if (!$161) {
  return;
 }
 $163 = HEAP32[63] | 0; //@line 3032
 HEAP32[63] = 0; //@line 3033
 $ReallocAsyncCtx8 = _emscripten_realloc_async_context(8) | 0; //@line 3034
 FUNCTION_TABLE_v[$161 & 3](); //@line 3035
 if (___async) {
  HEAP32[$ReallocAsyncCtx8 >> 2] = 47; //@line 3038
  $164 = $ReallocAsyncCtx8 + 4 | 0; //@line 3039
  HEAP32[$164 >> 2] = $163; //@line 3040
  sp = STACKTOP; //@line 3041
  return;
 }
 ___async_unwind = 0; //@line 3044
 HEAP32[$ReallocAsyncCtx8 >> 2] = 47; //@line 3045
 $164 = $ReallocAsyncCtx8 + 4 | 0; //@line 3046
 HEAP32[$164 >> 2] = $163; //@line 3047
 sp = STACKTOP; //@line 3048
 return;
}
function _free($0) {
 $0 = $0 | 0;
 var $$0212$i = 0, $$0212$in$i = 0, $$0383 = 0, $$0384 = 0, $$0396 = 0, $$0403 = 0, $$1 = 0, $$1382 = 0, $$1387 = 0, $$1390 = 0, $$1398 = 0, $$1402 = 0, $$2 = 0, $$3 = 0, $$3400 = 0, $$pre$phi442Z2D = 0, $$pre$phi444Z2D = 0, $$pre$phiZ2D = 0, $10 = 0, $105 = 0, $106 = 0, $114 = 0, $115 = 0, $116 = 0, $124 = 0, $13 = 0, $132 = 0, $137 = 0, $138 = 0, $141 = 0, $143 = 0, $145 = 0, $16 = 0, $160 = 0, $165 = 0, $167 = 0, $17 = 0, $170 = 0, $173 = 0, $176 = 0, $179 = 0, $180 = 0, $181 = 0, $183 = 0, $185 = 0, $186 = 0, $188 = 0, $189 = 0, $195 = 0, $196 = 0, $2 = 0, $21 = 0, $210 = 0, $213 = 0, $214 = 0, $220 = 0, $235 = 0, $238 = 0, $239 = 0, $24 = 0, $240 = 0, $244 = 0, $245 = 0, $251 = 0, $256 = 0, $257 = 0, $26 = 0, $260 = 0, $262 = 0, $265 = 0, $270 = 0, $276 = 0, $28 = 0, $280 = 0, $281 = 0, $299 = 0, $3 = 0, $301 = 0, $308 = 0, $309 = 0, $310 = 0, $319 = 0, $41 = 0, $46 = 0, $48 = 0, $51 = 0, $53 = 0, $56 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $63 = 0, $65 = 0, $66 = 0, $68 = 0, $69 = 0, $7 = 0, $74 = 0, $75 = 0, $89 = 0, $9 = 0, $92 = 0, $93 = 0, $99 = 0, label = 0;
 if (!$0) {
  return;
 }
 $2 = $0 + -8 | 0; //@line 6683
 $3 = HEAP32[1542] | 0; //@line 6684
 if ($2 >>> 0 < $3 >>> 0) {
  _abort(); //@line 6687
 }
 $6 = HEAP32[$0 + -4 >> 2] | 0; //@line 6691
 $7 = $6 & 3; //@line 6692
 if (($7 | 0) == 1) {
  _abort(); //@line 6695
 }
 $9 = $6 & -8; //@line 6698
 $10 = $2 + $9 | 0; //@line 6699
 L10 : do {
  if (!($6 & 1)) {
   $13 = HEAP32[$2 >> 2] | 0; //@line 6704
   if (!$7) {
    return;
   }
   $16 = $2 + (0 - $13) | 0; //@line 6710
   $17 = $13 + $9 | 0; //@line 6711
   if ($16 >>> 0 < $3 >>> 0) {
    _abort(); //@line 6714
   }
   if ((HEAP32[1543] | 0) == ($16 | 0)) {
    $105 = $10 + 4 | 0; //@line 6720
    $106 = HEAP32[$105 >> 2] | 0; //@line 6721
    if (($106 & 3 | 0) != 3) {
     $$1 = $16; //@line 6725
     $$1382 = $17; //@line 6725
     $114 = $16; //@line 6725
     break;
    }
    HEAP32[1540] = $17; //@line 6728
    HEAP32[$105 >> 2] = $106 & -2; //@line 6730
    HEAP32[$16 + 4 >> 2] = $17 | 1; //@line 6733
    HEAP32[$16 + $17 >> 2] = $17; //@line 6735
    return;
   }
   $21 = $13 >>> 3; //@line 6738
   if ($13 >>> 0 < 256) {
    $24 = HEAP32[$16 + 8 >> 2] | 0; //@line 6742
    $26 = HEAP32[$16 + 12 >> 2] | 0; //@line 6744
    $28 = 6192 + ($21 << 1 << 2) | 0; //@line 6746
    if (($24 | 0) != ($28 | 0)) {
     if ($3 >>> 0 > $24 >>> 0) {
      _abort(); //@line 6751
     }
     if ((HEAP32[$24 + 12 >> 2] | 0) != ($16 | 0)) {
      _abort(); //@line 6758
     }
    }
    if (($26 | 0) == ($24 | 0)) {
     HEAP32[1538] = HEAP32[1538] & ~(1 << $21); //@line 6768
     $$1 = $16; //@line 6769
     $$1382 = $17; //@line 6769
     $114 = $16; //@line 6769
     break;
    }
    if (($26 | 0) == ($28 | 0)) {
     $$pre$phi444Z2D = $26 + 8 | 0; //@line 6775
    } else {
     if ($3 >>> 0 > $26 >>> 0) {
      _abort(); //@line 6779
     }
     $41 = $26 + 8 | 0; //@line 6782
     if ((HEAP32[$41 >> 2] | 0) == ($16 | 0)) {
      $$pre$phi444Z2D = $41; //@line 6786
     } else {
      _abort(); //@line 6788
     }
    }
    HEAP32[$24 + 12 >> 2] = $26; //@line 6793
    HEAP32[$$pre$phi444Z2D >> 2] = $24; //@line 6794
    $$1 = $16; //@line 6795
    $$1382 = $17; //@line 6795
    $114 = $16; //@line 6795
    break;
   }
   $46 = HEAP32[$16 + 24 >> 2] | 0; //@line 6799
   $48 = HEAP32[$16 + 12 >> 2] | 0; //@line 6801
   do {
    if (($48 | 0) == ($16 | 0)) {
     $59 = $16 + 16 | 0; //@line 6805
     $60 = $59 + 4 | 0; //@line 6806
     $61 = HEAP32[$60 >> 2] | 0; //@line 6807
     if (!$61) {
      $63 = HEAP32[$59 >> 2] | 0; //@line 6810
      if (!$63) {
       $$3 = 0; //@line 6813
       break;
      } else {
       $$1387 = $63; //@line 6816
       $$1390 = $59; //@line 6816
      }
     } else {
      $$1387 = $61; //@line 6819
      $$1390 = $60; //@line 6819
     }
     while (1) {
      $65 = $$1387 + 20 | 0; //@line 6822
      $66 = HEAP32[$65 >> 2] | 0; //@line 6823
      if ($66 | 0) {
       $$1387 = $66; //@line 6826
       $$1390 = $65; //@line 6826
       continue;
      }
      $68 = $$1387 + 16 | 0; //@line 6829
      $69 = HEAP32[$68 >> 2] | 0; //@line 6830
      if (!$69) {
       break;
      } else {
       $$1387 = $69; //@line 6835
       $$1390 = $68; //@line 6835
      }
     }
     if ($3 >>> 0 > $$1390 >>> 0) {
      _abort(); //@line 6840
     } else {
      HEAP32[$$1390 >> 2] = 0; //@line 6843
      $$3 = $$1387; //@line 6844
      break;
     }
    } else {
     $51 = HEAP32[$16 + 8 >> 2] | 0; //@line 6849
     if ($3 >>> 0 > $51 >>> 0) {
      _abort(); //@line 6852
     }
     $53 = $51 + 12 | 0; //@line 6855
     if ((HEAP32[$53 >> 2] | 0) != ($16 | 0)) {
      _abort(); //@line 6859
     }
     $56 = $48 + 8 | 0; //@line 6862
     if ((HEAP32[$56 >> 2] | 0) == ($16 | 0)) {
      HEAP32[$53 >> 2] = $48; //@line 6866
      HEAP32[$56 >> 2] = $51; //@line 6867
      $$3 = $48; //@line 6868
      break;
     } else {
      _abort(); //@line 6871
     }
    }
   } while (0);
   if (!$46) {
    $$1 = $16; //@line 6878
    $$1382 = $17; //@line 6878
    $114 = $16; //@line 6878
   } else {
    $74 = HEAP32[$16 + 28 >> 2] | 0; //@line 6881
    $75 = 6456 + ($74 << 2) | 0; //@line 6882
    do {
     if ((HEAP32[$75 >> 2] | 0) == ($16 | 0)) {
      HEAP32[$75 >> 2] = $$3; //@line 6887
      if (!$$3) {
       HEAP32[1539] = HEAP32[1539] & ~(1 << $74); //@line 6894
       $$1 = $16; //@line 6895
       $$1382 = $17; //@line 6895
       $114 = $16; //@line 6895
       break L10;
      }
     } else {
      if ((HEAP32[1542] | 0) >>> 0 > $46 >>> 0) {
       _abort(); //@line 6902
      } else {
       HEAP32[$46 + 16 + (((HEAP32[$46 + 16 >> 2] | 0) != ($16 | 0) & 1) << 2) >> 2] = $$3; //@line 6910
       if (!$$3) {
        $$1 = $16; //@line 6913
        $$1382 = $17; //@line 6913
        $114 = $16; //@line 6913
        break L10;
       } else {
        break;
       }
      }
     }
    } while (0);
    $89 = HEAP32[1542] | 0; //@line 6921
    if ($89 >>> 0 > $$3 >>> 0) {
     _abort(); //@line 6924
    }
    HEAP32[$$3 + 24 >> 2] = $46; //@line 6928
    $92 = $16 + 16 | 0; //@line 6929
    $93 = HEAP32[$92 >> 2] | 0; //@line 6930
    do {
     if ($93 | 0) {
      if ($89 >>> 0 > $93 >>> 0) {
       _abort(); //@line 6936
      } else {
       HEAP32[$$3 + 16 >> 2] = $93; //@line 6940
       HEAP32[$93 + 24 >> 2] = $$3; //@line 6942
       break;
      }
     }
    } while (0);
    $99 = HEAP32[$92 + 4 >> 2] | 0; //@line 6948
    if (!$99) {
     $$1 = $16; //@line 6951
     $$1382 = $17; //@line 6951
     $114 = $16; //@line 6951
    } else {
     if ((HEAP32[1542] | 0) >>> 0 > $99 >>> 0) {
      _abort(); //@line 6956
     } else {
      HEAP32[$$3 + 20 >> 2] = $99; //@line 6960
      HEAP32[$99 + 24 >> 2] = $$3; //@line 6962
      $$1 = $16; //@line 6963
      $$1382 = $17; //@line 6963
      $114 = $16; //@line 6963
      break;
     }
    }
   }
  } else {
   $$1 = $2; //@line 6969
   $$1382 = $9; //@line 6969
   $114 = $2; //@line 6969
  }
 } while (0);
 if ($114 >>> 0 >= $10 >>> 0) {
  _abort(); //@line 6974
 }
 $115 = $10 + 4 | 0; //@line 6977
 $116 = HEAP32[$115 >> 2] | 0; //@line 6978
 if (!($116 & 1)) {
  _abort(); //@line 6982
 }
 if (!($116 & 2)) {
  if ((HEAP32[1544] | 0) == ($10 | 0)) {
   $124 = (HEAP32[1541] | 0) + $$1382 | 0; //@line 6992
   HEAP32[1541] = $124; //@line 6993
   HEAP32[1544] = $$1; //@line 6994
   HEAP32[$$1 + 4 >> 2] = $124 | 1; //@line 6997
   if (($$1 | 0) != (HEAP32[1543] | 0)) {
    return;
   }
   HEAP32[1543] = 0; //@line 7003
   HEAP32[1540] = 0; //@line 7004
   return;
  }
  if ((HEAP32[1543] | 0) == ($10 | 0)) {
   $132 = (HEAP32[1540] | 0) + $$1382 | 0; //@line 7011
   HEAP32[1540] = $132; //@line 7012
   HEAP32[1543] = $114; //@line 7013
   HEAP32[$$1 + 4 >> 2] = $132 | 1; //@line 7016
   HEAP32[$114 + $132 >> 2] = $132; //@line 7018
   return;
  }
  $137 = ($116 & -8) + $$1382 | 0; //@line 7022
  $138 = $116 >>> 3; //@line 7023
  L108 : do {
   if ($116 >>> 0 < 256) {
    $141 = HEAP32[$10 + 8 >> 2] | 0; //@line 7028
    $143 = HEAP32[$10 + 12 >> 2] | 0; //@line 7030
    $145 = 6192 + ($138 << 1 << 2) | 0; //@line 7032
    if (($141 | 0) != ($145 | 0)) {
     if ((HEAP32[1542] | 0) >>> 0 > $141 >>> 0) {
      _abort(); //@line 7038
     }
     if ((HEAP32[$141 + 12 >> 2] | 0) != ($10 | 0)) {
      _abort(); //@line 7045
     }
    }
    if (($143 | 0) == ($141 | 0)) {
     HEAP32[1538] = HEAP32[1538] & ~(1 << $138); //@line 7055
     break;
    }
    if (($143 | 0) == ($145 | 0)) {
     $$pre$phi442Z2D = $143 + 8 | 0; //@line 7061
    } else {
     if ((HEAP32[1542] | 0) >>> 0 > $143 >>> 0) {
      _abort(); //@line 7066
     }
     $160 = $143 + 8 | 0; //@line 7069
     if ((HEAP32[$160 >> 2] | 0) == ($10 | 0)) {
      $$pre$phi442Z2D = $160; //@line 7073
     } else {
      _abort(); //@line 7075
     }
    }
    HEAP32[$141 + 12 >> 2] = $143; //@line 7080
    HEAP32[$$pre$phi442Z2D >> 2] = $141; //@line 7081
   } else {
    $165 = HEAP32[$10 + 24 >> 2] | 0; //@line 7084
    $167 = HEAP32[$10 + 12 >> 2] | 0; //@line 7086
    do {
     if (($167 | 0) == ($10 | 0)) {
      $179 = $10 + 16 | 0; //@line 7090
      $180 = $179 + 4 | 0; //@line 7091
      $181 = HEAP32[$180 >> 2] | 0; //@line 7092
      if (!$181) {
       $183 = HEAP32[$179 >> 2] | 0; //@line 7095
       if (!$183) {
        $$3400 = 0; //@line 7098
        break;
       } else {
        $$1398 = $183; //@line 7101
        $$1402 = $179; //@line 7101
       }
      } else {
       $$1398 = $181; //@line 7104
       $$1402 = $180; //@line 7104
      }
      while (1) {
       $185 = $$1398 + 20 | 0; //@line 7107
       $186 = HEAP32[$185 >> 2] | 0; //@line 7108
       if ($186 | 0) {
        $$1398 = $186; //@line 7111
        $$1402 = $185; //@line 7111
        continue;
       }
       $188 = $$1398 + 16 | 0; //@line 7114
       $189 = HEAP32[$188 >> 2] | 0; //@line 7115
       if (!$189) {
        break;
       } else {
        $$1398 = $189; //@line 7120
        $$1402 = $188; //@line 7120
       }
      }
      if ((HEAP32[1542] | 0) >>> 0 > $$1402 >>> 0) {
       _abort(); //@line 7126
      } else {
       HEAP32[$$1402 >> 2] = 0; //@line 7129
       $$3400 = $$1398; //@line 7130
       break;
      }
     } else {
      $170 = HEAP32[$10 + 8 >> 2] | 0; //@line 7135
      if ((HEAP32[1542] | 0) >>> 0 > $170 >>> 0) {
       _abort(); //@line 7139
      }
      $173 = $170 + 12 | 0; //@line 7142
      if ((HEAP32[$173 >> 2] | 0) != ($10 | 0)) {
       _abort(); //@line 7146
      }
      $176 = $167 + 8 | 0; //@line 7149
      if ((HEAP32[$176 >> 2] | 0) == ($10 | 0)) {
       HEAP32[$173 >> 2] = $167; //@line 7153
       HEAP32[$176 >> 2] = $170; //@line 7154
       $$3400 = $167; //@line 7155
       break;
      } else {
       _abort(); //@line 7158
      }
     }
    } while (0);
    if ($165 | 0) {
     $195 = HEAP32[$10 + 28 >> 2] | 0; //@line 7166
     $196 = 6456 + ($195 << 2) | 0; //@line 7167
     do {
      if ((HEAP32[$196 >> 2] | 0) == ($10 | 0)) {
       HEAP32[$196 >> 2] = $$3400; //@line 7172
       if (!$$3400) {
        HEAP32[1539] = HEAP32[1539] & ~(1 << $195); //@line 7179
        break L108;
       }
      } else {
       if ((HEAP32[1542] | 0) >>> 0 > $165 >>> 0) {
        _abort(); //@line 7186
       } else {
        HEAP32[$165 + 16 + (((HEAP32[$165 + 16 >> 2] | 0) != ($10 | 0) & 1) << 2) >> 2] = $$3400; //@line 7194
        if (!$$3400) {
         break L108;
        } else {
         break;
        }
       }
      }
     } while (0);
     $210 = HEAP32[1542] | 0; //@line 7204
     if ($210 >>> 0 > $$3400 >>> 0) {
      _abort(); //@line 7207
     }
     HEAP32[$$3400 + 24 >> 2] = $165; //@line 7211
     $213 = $10 + 16 | 0; //@line 7212
     $214 = HEAP32[$213 >> 2] | 0; //@line 7213
     do {
      if ($214 | 0) {
       if ($210 >>> 0 > $214 >>> 0) {
        _abort(); //@line 7219
       } else {
        HEAP32[$$3400 + 16 >> 2] = $214; //@line 7223
        HEAP32[$214 + 24 >> 2] = $$3400; //@line 7225
        break;
       }
      }
     } while (0);
     $220 = HEAP32[$213 + 4 >> 2] | 0; //@line 7231
     if ($220 | 0) {
      if ((HEAP32[1542] | 0) >>> 0 > $220 >>> 0) {
       _abort(); //@line 7237
      } else {
       HEAP32[$$3400 + 20 >> 2] = $220; //@line 7241
       HEAP32[$220 + 24 >> 2] = $$3400; //@line 7243
       break;
      }
     }
    }
   }
  } while (0);
  HEAP32[$$1 + 4 >> 2] = $137 | 1; //@line 7252
  HEAP32[$114 + $137 >> 2] = $137; //@line 7254
  if (($$1 | 0) == (HEAP32[1543] | 0)) {
   HEAP32[1540] = $137; //@line 7258
   return;
  } else {
   $$2 = $137; //@line 7261
  }
 } else {
  HEAP32[$115 >> 2] = $116 & -2; //@line 7265
  HEAP32[$$1 + 4 >> 2] = $$1382 | 1; //@line 7268
  HEAP32[$114 + $$1382 >> 2] = $$1382; //@line 7270
  $$2 = $$1382; //@line 7271
 }
 $235 = $$2 >>> 3; //@line 7273
 if ($$2 >>> 0 < 256) {
  $238 = 6192 + ($235 << 1 << 2) | 0; //@line 7277
  $239 = HEAP32[1538] | 0; //@line 7278
  $240 = 1 << $235; //@line 7279
  if (!($239 & $240)) {
   HEAP32[1538] = $239 | $240; //@line 7284
   $$0403 = $238; //@line 7286
   $$pre$phiZ2D = $238 + 8 | 0; //@line 7286
  } else {
   $244 = $238 + 8 | 0; //@line 7288
   $245 = HEAP32[$244 >> 2] | 0; //@line 7289
   if ((HEAP32[1542] | 0) >>> 0 > $245 >>> 0) {
    _abort(); //@line 7293
   } else {
    $$0403 = $245; //@line 7296
    $$pre$phiZ2D = $244; //@line 7296
   }
  }
  HEAP32[$$pre$phiZ2D >> 2] = $$1; //@line 7299
  HEAP32[$$0403 + 12 >> 2] = $$1; //@line 7301
  HEAP32[$$1 + 8 >> 2] = $$0403; //@line 7303
  HEAP32[$$1 + 12 >> 2] = $238; //@line 7305
  return;
 }
 $251 = $$2 >>> 8; //@line 7308
 if (!$251) {
  $$0396 = 0; //@line 7311
 } else {
  if ($$2 >>> 0 > 16777215) {
   $$0396 = 31; //@line 7315
  } else {
   $256 = ($251 + 1048320 | 0) >>> 16 & 8; //@line 7319
   $257 = $251 << $256; //@line 7320
   $260 = ($257 + 520192 | 0) >>> 16 & 4; //@line 7323
   $262 = $257 << $260; //@line 7325
   $265 = ($262 + 245760 | 0) >>> 16 & 2; //@line 7328
   $270 = 14 - ($260 | $256 | $265) + ($262 << $265 >>> 15) | 0; //@line 7333
   $$0396 = $$2 >>> ($270 + 7 | 0) & 1 | $270 << 1; //@line 7339
  }
 }
 $276 = 6456 + ($$0396 << 2) | 0; //@line 7342
 HEAP32[$$1 + 28 >> 2] = $$0396; //@line 7344
 HEAP32[$$1 + 20 >> 2] = 0; //@line 7347
 HEAP32[$$1 + 16 >> 2] = 0; //@line 7348
 $280 = HEAP32[1539] | 0; //@line 7349
 $281 = 1 << $$0396; //@line 7350
 do {
  if (!($280 & $281)) {
   HEAP32[1539] = $280 | $281; //@line 7356
   HEAP32[$276 >> 2] = $$1; //@line 7357
   HEAP32[$$1 + 24 >> 2] = $276; //@line 7359
   HEAP32[$$1 + 12 >> 2] = $$1; //@line 7361
   HEAP32[$$1 + 8 >> 2] = $$1; //@line 7363
  } else {
   $$0383 = $$2 << (($$0396 | 0) == 31 ? 0 : 25 - ($$0396 >>> 1) | 0); //@line 7371
   $$0384 = HEAP32[$276 >> 2] | 0; //@line 7371
   while (1) {
    if ((HEAP32[$$0384 + 4 >> 2] & -8 | 0) == ($$2 | 0)) {
     label = 124; //@line 7378
     break;
    }
    $299 = $$0384 + 16 + ($$0383 >>> 31 << 2) | 0; //@line 7382
    $301 = HEAP32[$299 >> 2] | 0; //@line 7384
    if (!$301) {
     label = 121; //@line 7387
     break;
    } else {
     $$0383 = $$0383 << 1; //@line 7390
     $$0384 = $301; //@line 7390
    }
   }
   if ((label | 0) == 121) {
    if ((HEAP32[1542] | 0) >>> 0 > $299 >>> 0) {
     _abort(); //@line 7397
    } else {
     HEAP32[$299 >> 2] = $$1; //@line 7400
     HEAP32[$$1 + 24 >> 2] = $$0384; //@line 7402
     HEAP32[$$1 + 12 >> 2] = $$1; //@line 7404
     HEAP32[$$1 + 8 >> 2] = $$1; //@line 7406
     break;
    }
   } else if ((label | 0) == 124) {
    $308 = $$0384 + 8 | 0; //@line 7411
    $309 = HEAP32[$308 >> 2] | 0; //@line 7412
    $310 = HEAP32[1542] | 0; //@line 7413
    if ($310 >>> 0 <= $309 >>> 0 & $310 >>> 0 <= $$0384 >>> 0) {
     HEAP32[$309 + 12 >> 2] = $$1; //@line 7419
     HEAP32[$308 >> 2] = $$1; //@line 7420
     HEAP32[$$1 + 8 >> 2] = $309; //@line 7422
     HEAP32[$$1 + 12 >> 2] = $$0384; //@line 7424
     HEAP32[$$1 + 24 >> 2] = 0; //@line 7426
     break;
    } else {
     _abort(); //@line 7429
    }
   }
  }
 } while (0);
 $319 = (HEAP32[1546] | 0) + -1 | 0; //@line 7436
 HEAP32[1546] = $319; //@line 7437
 if (!$319) {
  $$0212$in$i = 6608; //@line 7440
 } else {
  return;
 }
 while (1) {
  $$0212$i = HEAP32[$$0212$in$i >> 2] | 0; //@line 7445
  if (!$$0212$i) {
   break;
  } else {
   $$0212$in$i = $$0212$i + 8 | 0; //@line 7451
  }
 }
 HEAP32[1546] = -1; //@line 7454
 return;
}
function _equeue_dispatch($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0 = 0, $$02329$i$i = 0, $$02330$i$i = 0, $$025$i$i = 0, $$03956$i = 0, $$03956$i$phi = 0, $$04055$i = 0, $$0405571$i = 0, $$04063$i = 0, $$04159$i = 0, $$04258$i = 0, $$057$i = 0, $$067 = 0, $$06992 = 0, $$2 = 0, $$idx = 0, $$sink$in$i$i = 0, $$sroa$0$i = 0, $$sroa$0$i$0$$sroa$0$0$$sroa$0$0$$0$4353$pre$i75 = 0, $$sroa$0$i$0$$sroa$0$0$$sroa$0$0$$0$52$i74 = 0, $10 = 0, $106 = 0, $11 = 0, $12 = 0, $129 = 0, $13 = 0, $131 = 0, $132 = 0, $133 = 0, $135 = 0, $136 = 0, $14 = 0, $144 = 0, $145 = 0, $147 = 0, $15 = 0, $150 = 0, $152 = 0, $155 = 0, $158 = 0, $165 = 0, $169 = 0, $172 = 0, $178 = 0, $2 = 0, $23 = 0, $24 = 0, $27 = 0, $33 = 0, $42 = 0, $45 = 0, $46 = 0, $48 = 0, $5 = 0, $6 = 0, $7 = 0, $72 = 0, $74 = 0, $77 = 0, $8 = 0, $9 = 0, $96 = 0, $97 = 0, $AsyncCtx = 0, $AsyncCtx11 = 0, $AsyncCtx15 = 0, $AsyncCtx3 = 0, $AsyncCtx7 = 0, label = 0, sp = 0, $$04159$i$looptemp = 0, $$04258$i$looptemp = 0;
 sp = STACKTOP; //@line 1078
 STACKTOP = STACKTOP + 16 | 0; //@line 1079
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 1079
 $$sroa$0$i = sp; //@line 1080
 $2 = $0 + 184 | 0; //@line 1081
 if (!(HEAP8[$2 >> 0] | 0)) {
  HEAP8[$2 >> 0] = 1; //@line 1085
 }
 $5 = _equeue_tick() | 0; //@line 1087
 $6 = $5 + $1 | 0; //@line 1088
 $7 = $0 + 36 | 0; //@line 1089
 HEAP8[$7 >> 0] = 0; //@line 1090
 $8 = $0 + 128 | 0; //@line 1091
 $9 = $0 + 9 | 0; //@line 1092
 $10 = $0 + 4 | 0; //@line 1093
 $11 = ($1 | 0) > -1; //@line 1094
 $12 = $0 + 48 | 0; //@line 1095
 $13 = $0 + 8 | 0; //@line 1096
 $$idx = $0 + 16 | 0; //@line 1097
 $14 = $0 + 156 | 0; //@line 1098
 $15 = $0 + 24 | 0; //@line 1099
 $$0 = $5; //@line 1100
 L4 : while (1) {
  _equeue_mutex_lock($8); //@line 1102
  HEAP8[$9 >> 0] = (HEAPU8[$9 >> 0] | 0) + 1; //@line 1107
  if (((HEAP32[$10 >> 2] | 0) - $$0 | 0) < 1) {
   HEAP32[$10 >> 2] = $$0; //@line 1112
  }
  $23 = HEAP32[$0 >> 2] | 0; //@line 1114
  HEAP32[$$sroa$0$i >> 2] = $23; //@line 1115
  $24 = $23; //@line 1116
  L9 : do {
   if (!$23) {
    $$04055$i = $$sroa$0$i; //@line 1120
    $33 = $24; //@line 1120
    label = 10; //@line 1121
   } else {
    $$04063$i = $$sroa$0$i; //@line 1123
    $27 = $24; //@line 1123
    do {
     if (((HEAP32[$27 + 20 >> 2] | 0) - $$0 | 0) >= 1) {
      $$04055$i = $$04063$i; //@line 1130
      $33 = $27; //@line 1130
      label = 10; //@line 1131
      break L9;
     }
     $$04063$i = $27 + 8 | 0; //@line 1134
     $27 = HEAP32[$$04063$i >> 2] | 0; //@line 1135
    } while (($27 | 0) != 0);
    HEAP32[$0 >> 2] = 0; //@line 1143
    $$0405571$i = $$04063$i; //@line 1144
   }
  } while (0);
  if ((label | 0) == 10) {
   label = 0; //@line 1148
   HEAP32[$0 >> 2] = $33; //@line 1149
   if (!$33) {
    $$0405571$i = $$04055$i; //@line 1152
   } else {
    HEAP32[$33 + 16 >> 2] = $0; //@line 1155
    $$0405571$i = $$04055$i; //@line 1156
   }
  }
  HEAP32[$$0405571$i >> 2] = 0; //@line 1159
  _equeue_mutex_unlock($8); //@line 1160
  $$sroa$0$i$0$$sroa$0$0$$sroa$0$0$$0$52$i74 = HEAP32[$$sroa$0$i >> 2] | 0; //@line 1161
  if (!$$sroa$0$i$0$$sroa$0$0$$sroa$0$0$$0$52$i74) {} else {
   $$04159$i = $$sroa$0$i$0$$sroa$0$0$$sroa$0$0$$0$52$i74; //@line 1165
   $$04258$i = $$sroa$0$i; //@line 1165
   do {
    $$04258$i$looptemp = $$04258$i;
    $$04258$i = $$04159$i + 8 | 0; //@line 1167
    $$04159$i$looptemp = $$04159$i;
    $$04159$i = HEAP32[$$04258$i >> 2] | 0; //@line 1168
    $$03956$i = 0; //@line 1169
    $$057$i = $$04159$i$looptemp; //@line 1169
    while (1) {
     HEAP32[$$057$i + 8 >> 2] = $$03956$i; //@line 1172
     $42 = HEAP32[$$057$i + 12 >> 2] | 0; //@line 1174
     if (!$42) {
      break;
     } else {
      $$03956$i$phi = $$057$i; //@line 1179
      $$057$i = $42; //@line 1179
      $$03956$i = $$03956$i$phi; //@line 1179
     }
    }
    HEAP32[$$04258$i$looptemp >> 2] = $$057$i; //@line 1182
   } while (($$04159$i | 0) != 0);
   $$sroa$0$i$0$$sroa$0$0$$sroa$0$0$$0$4353$pre$i75 = HEAP32[$$sroa$0$i >> 2] | 0; //@line 1190
   if ($$sroa$0$i$0$$sroa$0$0$$sroa$0$0$$0$4353$pre$i75 | 0) {
    $$06992 = $$sroa$0$i$0$$sroa$0$0$$sroa$0$0$$0$4353$pre$i75; //@line 1193
    while (1) {
     $45 = $$06992 + 8 | 0; //@line 1195
     $46 = HEAP32[$45 >> 2] | 0; //@line 1196
     $48 = HEAP32[$$06992 + 32 >> 2] | 0; //@line 1198
     if ($48 | 0) {
      $AsyncCtx = _emscripten_alloc_async_context(84, sp) | 0; //@line 1202
      FUNCTION_TABLE_vi[$48 & 255]($$06992 + 36 | 0); //@line 1203
      if (___async) {
       label = 20; //@line 1206
       break L4;
      }
      _emscripten_free_async_context($AsyncCtx | 0); //@line 1209
     }
     $72 = HEAP32[$$06992 + 24 >> 2] | 0; //@line 1212
     if (($72 | 0) > -1) {
      $74 = $$06992 + 20 | 0; //@line 1215
      HEAP32[$74 >> 2] = (HEAP32[$74 >> 2] | 0) + $72; //@line 1218
      $77 = _equeue_tick() | 0; //@line 1219
      $AsyncCtx11 = _emscripten_alloc_async_context(76, sp) | 0; //@line 1220
      _equeue_enqueue($0, $$06992, $77) | 0; //@line 1221
      if (___async) {
       label = 24; //@line 1224
       break L4;
      }
      _emscripten_free_async_context($AsyncCtx11 | 0); //@line 1227
     } else {
      $96 = $$06992 + 4 | 0; //@line 1230
      $97 = HEAP8[$96 >> 0] | 0; //@line 1231
      HEAP8[$96 >> 0] = (($97 + 1 & 255) << HEAP32[$$idx >> 2] | 0) == 0 ? 1 : ($97 & 255) + 1 & 255; //@line 1240
      $106 = HEAP32[$$06992 + 28 >> 2] | 0; //@line 1242
      if ($106 | 0) {
       $AsyncCtx3 = _emscripten_alloc_async_context(84, sp) | 0; //@line 1246
       FUNCTION_TABLE_vi[$106 & 255]($$06992 + 36 | 0); //@line 1247
       if (___async) {
        label = 28; //@line 1250
        break L4;
       }
       _emscripten_free_async_context($AsyncCtx3 | 0); //@line 1253
      }
      _equeue_mutex_lock($14); //@line 1255
      $129 = HEAP32[$15 >> 2] | 0; //@line 1256
      L40 : do {
       if (!$129) {
        $$02329$i$i = $15; //@line 1260
        label = 36; //@line 1261
       } else {
        $131 = HEAP32[$$06992 >> 2] | 0; //@line 1263
        $$025$i$i = $15; //@line 1264
        $133 = $129; //@line 1264
        while (1) {
         $132 = HEAP32[$133 >> 2] | 0; //@line 1266
         if ($132 >>> 0 >= $131 >>> 0) {
          break;
         }
         $135 = $133 + 8 | 0; //@line 1271
         $136 = HEAP32[$135 >> 2] | 0; //@line 1272
         if (!$136) {
          $$02329$i$i = $135; //@line 1275
          label = 36; //@line 1276
          break L40;
         } else {
          $$025$i$i = $135; //@line 1279
          $133 = $136; //@line 1279
         }
        }
        if (($132 | 0) == ($131 | 0)) {
         HEAP32[$$06992 + 12 >> 2] = $133; //@line 1285
         $$02330$i$i = $$025$i$i; //@line 1288
         $$sink$in$i$i = (HEAP32[$$025$i$i >> 2] | 0) + 8 | 0; //@line 1288
        } else {
         $$02329$i$i = $$025$i$i; //@line 1290
         label = 36; //@line 1291
        }
       }
      } while (0);
      if ((label | 0) == 36) {
       label = 0; //@line 1296
       HEAP32[$$06992 + 12 >> 2] = 0; //@line 1298
       $$02330$i$i = $$02329$i$i; //@line 1299
       $$sink$in$i$i = $$02329$i$i; //@line 1299
      }
      HEAP32[$45 >> 2] = HEAP32[$$sink$in$i$i >> 2]; //@line 1302
      HEAP32[$$02330$i$i >> 2] = $$06992; //@line 1303
      _equeue_mutex_unlock($14); //@line 1304
     }
     if (!$46) {
      break;
     } else {
      $$06992 = $46; //@line 1310
     }
    }
   }
  }
  $144 = _equeue_tick() | 0; //@line 1315
  if ($11) {
   $145 = $6 - $144 | 0; //@line 1317
   if (($145 | 0) < 1) {
    label = 41; //@line 1320
    break;
   } else {
    $$067 = $145; //@line 1323
   }
  } else {
   $$067 = -1; //@line 1326
  }
  _equeue_mutex_lock($8); //@line 1328
  $165 = HEAP32[$0 >> 2] | 0; //@line 1329
  if (!$165) {
   $$2 = $$067; //@line 1332
  } else {
   $169 = (HEAP32[$165 + 20 >> 2] | 0) - $144 | 0; //@line 1336
   $172 = $169 & ~($169 >> 31); //@line 1339
   $$2 = $172 >>> 0 < $$067 >>> 0 ? $172 : $$067; //@line 1342
  }
  _equeue_mutex_unlock($8); //@line 1344
  _equeue_sema_wait($12, $$2) | 0; //@line 1345
  if (HEAP8[$13 >> 0] | 0) {
   _equeue_mutex_lock($8); //@line 1349
   if (HEAP8[$13 >> 0] | 0) {
    label = 53; //@line 1353
    break;
   }
   _equeue_mutex_unlock($8); //@line 1356
  }
  $178 = _equeue_tick() | 0; //@line 1358
  $AsyncCtx15 = _emscripten_alloc_async_context(76, sp) | 0; //@line 1359
  _wait_ms(20); //@line 1360
  if (___async) {
   label = 56; //@line 1363
   break;
  }
  _emscripten_free_async_context($AsyncCtx15 | 0); //@line 1366
  $$0 = $178; //@line 1367
 }
 if ((label | 0) == 20) {
  HEAP32[$AsyncCtx >> 2] = 30; //@line 1370
  HEAP32[$AsyncCtx + 4 >> 2] = $8; //@line 1372
  HEAP32[$AsyncCtx + 8 >> 2] = $9; //@line 1374
  HEAP32[$AsyncCtx + 12 >> 2] = $10; //@line 1376
  HEAP32[$AsyncCtx + 16 >> 2] = $0; //@line 1378
  HEAP32[$AsyncCtx + 20 >> 2] = $6; //@line 1380
  HEAP8[$AsyncCtx + 24 >> 0] = $11 & 1; //@line 1383
  HEAP32[$AsyncCtx + 28 >> 2] = $$sroa$0$i; //@line 1385
  HEAP32[$AsyncCtx + 32 >> 2] = $13; //@line 1387
  HEAP32[$AsyncCtx + 36 >> 2] = $7; //@line 1389
  HEAP32[$AsyncCtx + 40 >> 2] = $$sroa$0$i; //@line 1391
  HEAP32[$AsyncCtx + 44 >> 2] = $0; //@line 1393
  HEAP32[$AsyncCtx + 48 >> 2] = $$sroa$0$i; //@line 1395
  HEAP32[$AsyncCtx + 52 >> 2] = $0; //@line 1397
  HEAP32[$AsyncCtx + 56 >> 2] = $12; //@line 1399
  HEAP32[$AsyncCtx + 60 >> 2] = $$06992; //@line 1401
  HEAP32[$AsyncCtx + 64 >> 2] = $46; //@line 1403
  HEAP32[$AsyncCtx + 68 >> 2] = $14; //@line 1405
  HEAP32[$AsyncCtx + 72 >> 2] = $15; //@line 1407
  HEAP32[$AsyncCtx + 76 >> 2] = $$idx; //@line 1409
  HEAP32[$AsyncCtx + 80 >> 2] = $45; //@line 1411
  sp = STACKTOP; //@line 1412
  STACKTOP = sp; //@line 1413
  return;
 } else if ((label | 0) == 24) {
  HEAP32[$AsyncCtx11 >> 2] = 31; //@line 1416
  HEAP32[$AsyncCtx11 + 4 >> 2] = $8; //@line 1418
  HEAP32[$AsyncCtx11 + 8 >> 2] = $9; //@line 1420
  HEAP32[$AsyncCtx11 + 12 >> 2] = $10; //@line 1422
  HEAP32[$AsyncCtx11 + 16 >> 2] = $0; //@line 1424
  HEAP32[$AsyncCtx11 + 20 >> 2] = $6; //@line 1426
  HEAP8[$AsyncCtx11 + 24 >> 0] = $11 & 1; //@line 1429
  HEAP32[$AsyncCtx11 + 28 >> 2] = $$sroa$0$i; //@line 1431
  HEAP32[$AsyncCtx11 + 32 >> 2] = $13; //@line 1433
  HEAP32[$AsyncCtx11 + 36 >> 2] = $7; //@line 1435
  HEAP32[$AsyncCtx11 + 40 >> 2] = $$sroa$0$i; //@line 1437
  HEAP32[$AsyncCtx11 + 44 >> 2] = $0; //@line 1439
  HEAP32[$AsyncCtx11 + 48 >> 2] = $$sroa$0$i; //@line 1441
  HEAP32[$AsyncCtx11 + 52 >> 2] = $0; //@line 1443
  HEAP32[$AsyncCtx11 + 56 >> 2] = $12; //@line 1445
  HEAP32[$AsyncCtx11 + 60 >> 2] = $14; //@line 1447
  HEAP32[$AsyncCtx11 + 64 >> 2] = $15; //@line 1449
  HEAP32[$AsyncCtx11 + 68 >> 2] = $$idx; //@line 1451
  HEAP32[$AsyncCtx11 + 72 >> 2] = $46; //@line 1453
  sp = STACKTOP; //@line 1454
  STACKTOP = sp; //@line 1455
  return;
 } else if ((label | 0) == 28) {
  HEAP32[$AsyncCtx3 >> 2] = 32; //@line 1458
  HEAP32[$AsyncCtx3 + 4 >> 2] = $8; //@line 1460
  HEAP32[$AsyncCtx3 + 8 >> 2] = $9; //@line 1462
  HEAP32[$AsyncCtx3 + 12 >> 2] = $10; //@line 1464
  HEAP32[$AsyncCtx3 + 16 >> 2] = $0; //@line 1466
  HEAP32[$AsyncCtx3 + 20 >> 2] = $6; //@line 1468
  HEAP8[$AsyncCtx3 + 24 >> 0] = $11 & 1; //@line 1471
  HEAP32[$AsyncCtx3 + 28 >> 2] = $$sroa$0$i; //@line 1473
  HEAP32[$AsyncCtx3 + 32 >> 2] = $13; //@line 1475
  HEAP32[$AsyncCtx3 + 36 >> 2] = $7; //@line 1477
  HEAP32[$AsyncCtx3 + 40 >> 2] = $$sroa$0$i; //@line 1479
  HEAP32[$AsyncCtx3 + 44 >> 2] = $0; //@line 1481
  HEAP32[$AsyncCtx3 + 48 >> 2] = $$sroa$0$i; //@line 1483
  HEAP32[$AsyncCtx3 + 52 >> 2] = $0; //@line 1485
  HEAP32[$AsyncCtx3 + 56 >> 2] = $12; //@line 1487
  HEAP32[$AsyncCtx3 + 60 >> 2] = $46; //@line 1489
  HEAP32[$AsyncCtx3 + 64 >> 2] = $14; //@line 1491
  HEAP32[$AsyncCtx3 + 68 >> 2] = $15; //@line 1493
  HEAP32[$AsyncCtx3 + 72 >> 2] = $$idx; //@line 1495
  HEAP32[$AsyncCtx3 + 76 >> 2] = $$06992; //@line 1497
  HEAP32[$AsyncCtx3 + 80 >> 2] = $45; //@line 1499
  sp = STACKTOP; //@line 1500
  STACKTOP = sp; //@line 1501
  return;
 } else if ((label | 0) == 41) {
  $147 = $0 + 40 | 0; //@line 1504
  if (HEAP32[$147 >> 2] | 0) {
   _equeue_mutex_lock($8); //@line 1508
   $150 = HEAP32[$147 >> 2] | 0; //@line 1509
   do {
    if ($150 | 0) {
     $152 = HEAP32[$0 >> 2] | 0; //@line 1513
     if ($152 | 0) {
      $155 = HEAP32[$0 + 44 >> 2] | 0; //@line 1517
      $158 = (HEAP32[$152 + 20 >> 2] | 0) - $144 | 0; //@line 1520
      $AsyncCtx7 = _emscripten_alloc_async_context(16, sp) | 0; //@line 1524
      FUNCTION_TABLE_vii[$150 & 3]($155, $158 & ~($158 >> 31)); //@line 1525
      if (___async) {
       HEAP32[$AsyncCtx7 >> 2] = 33; //@line 1528
       HEAP32[$AsyncCtx7 + 4 >> 2] = $7; //@line 1530
       HEAP32[$AsyncCtx7 + 8 >> 2] = $8; //@line 1532
       HEAP32[$AsyncCtx7 + 12 >> 2] = $13; //@line 1534
       sp = STACKTOP; //@line 1535
       STACKTOP = sp; //@line 1536
       return;
      } else {
       _emscripten_free_async_context($AsyncCtx7 | 0); //@line 1538
       break;
      }
     }
    }
   } while (0);
   HEAP8[$7 >> 0] = 1; //@line 1544
   _equeue_mutex_unlock($8); //@line 1545
  }
  HEAP8[$13 >> 0] = 0; //@line 1547
  STACKTOP = sp; //@line 1548
  return;
 } else if ((label | 0) == 53) {
  HEAP8[$13 >> 0] = 0; //@line 1551
  _equeue_mutex_unlock($8); //@line 1552
  STACKTOP = sp; //@line 1553
  return;
 } else if ((label | 0) == 56) {
  HEAP32[$AsyncCtx15 >> 2] = 34; //@line 1556
  HEAP32[$AsyncCtx15 + 4 >> 2] = $8; //@line 1558
  HEAP32[$AsyncCtx15 + 8 >> 2] = $178; //@line 1560
  HEAP32[$AsyncCtx15 + 12 >> 2] = $9; //@line 1562
  HEAP32[$AsyncCtx15 + 16 >> 2] = $10; //@line 1564
  HEAP32[$AsyncCtx15 + 20 >> 2] = $0; //@line 1566
  HEAP32[$AsyncCtx15 + 24 >> 2] = $6; //@line 1568
  HEAP8[$AsyncCtx15 + 28 >> 0] = $11 & 1; //@line 1571
  HEAP32[$AsyncCtx15 + 32 >> 2] = $$sroa$0$i; //@line 1573
  HEAP32[$AsyncCtx15 + 36 >> 2] = $13; //@line 1575
  HEAP32[$AsyncCtx15 + 40 >> 2] = $7; //@line 1577
  HEAP32[$AsyncCtx15 + 44 >> 2] = $$sroa$0$i; //@line 1579
  HEAP32[$AsyncCtx15 + 48 >> 2] = $0; //@line 1581
  HEAP32[$AsyncCtx15 + 52 >> 2] = $$sroa$0$i; //@line 1583
  HEAP32[$AsyncCtx15 + 56 >> 2] = $0; //@line 1585
  HEAP32[$AsyncCtx15 + 60 >> 2] = $12; //@line 1587
  HEAP32[$AsyncCtx15 + 64 >> 2] = $14; //@line 1589
  HEAP32[$AsyncCtx15 + 68 >> 2] = $15; //@line 1591
  HEAP32[$AsyncCtx15 + 72 >> 2] = $$idx; //@line 1593
  sp = STACKTOP; //@line 1594
  STACKTOP = sp; //@line 1595
  return;
 }
}
function _twoway_strstr($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0166 = 0, $$0168 = 0, $$0169 = 0, $$0169$be = 0, $$0170 = 0, $$0175$ph$ph$lcssa216 = 0, $$0175$ph$ph$lcssa216328 = 0, $$0175$ph$ph254 = 0, $$0179242 = 0, $$0183$ph197$ph253 = 0, $$0183$ph197248 = 0, $$0183$ph260 = 0, $$0185$ph$lcssa = 0, $$0185$ph$lcssa327 = 0, $$0185$ph259 = 0, $$0187219$ph325326 = 0, $$0187263 = 0, $$1176$$0175 = 0, $$1176$ph$ph$lcssa208 = 0, $$1176$ph$ph233 = 0, $$1180222 = 0, $$1184$ph193$ph232 = 0, $$1184$ph193227 = 0, $$1184$ph239 = 0, $$1186$$0185 = 0, $$1186$ph$lcssa = 0, $$1186$ph238 = 0, $$2181$sink = 0, $$3 = 0, $$3173 = 0, $$3178 = 0, $$3182221 = 0, $$4 = 0, $$pr = 0, $10 = 0, $105 = 0, $111 = 0, $113 = 0, $118 = 0, $130 = 0, $131 = 0, $132 = 0, $133 = 0, $134 = 0, $135 = 0, $14 = 0, $2 = 0, $23 = 0, $25 = 0, $27 = 0, $3 = 0, $32 = 0, $34 = 0, $37 = 0, $4 = 0, $41 = 0, $45 = 0, $50 = 0, $52 = 0, $53 = 0, $56 = 0, $60 = 0, $68 = 0, $70 = 0, $74 = 0, $78 = 0, $79 = 0, $80 = 0, $81 = 0, $83 = 0, $86 = 0, $93 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 11794
 STACKTOP = STACKTOP + 1056 | 0; //@line 11795
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(1056); //@line 11795
 $2 = sp + 1024 | 0; //@line 11796
 $3 = sp; //@line 11797
 HEAP32[$2 >> 2] = 0; //@line 11798
 HEAP32[$2 + 4 >> 2] = 0; //@line 11798
 HEAP32[$2 + 8 >> 2] = 0; //@line 11798
 HEAP32[$2 + 12 >> 2] = 0; //@line 11798
 HEAP32[$2 + 16 >> 2] = 0; //@line 11798
 HEAP32[$2 + 20 >> 2] = 0; //@line 11798
 HEAP32[$2 + 24 >> 2] = 0; //@line 11798
 HEAP32[$2 + 28 >> 2] = 0; //@line 11798
 $4 = HEAP8[$1 >> 0] | 0; //@line 11799
 L1 : do {
  if (!($4 << 24 >> 24)) {
   $$0175$ph$ph$lcssa216328 = 1; //@line 11803
   $$0185$ph$lcssa327 = -1; //@line 11803
   $$0187219$ph325326 = 0; //@line 11803
   $$1176$ph$ph$lcssa208 = 1; //@line 11803
   $$1186$ph$lcssa = -1; //@line 11803
   label = 26; //@line 11804
  } else {
   $$0187263 = 0; //@line 11806
   $10 = $4; //@line 11806
   do {
    if (!(HEAP8[$0 + $$0187263 >> 0] | 0)) {
     $$3 = 0; //@line 11812
     break L1;
    }
    $14 = $2 + ((($10 & 255) >>> 5 & 255) << 2) | 0; //@line 11820
    HEAP32[$14 >> 2] = HEAP32[$14 >> 2] | 1 << ($10 & 31); //@line 11823
    $$0187263 = $$0187263 + 1 | 0; //@line 11824
    HEAP32[$3 + (($10 & 255) << 2) >> 2] = $$0187263; //@line 11827
    $10 = HEAP8[$1 + $$0187263 >> 0] | 0; //@line 11829
   } while ($10 << 24 >> 24 != 0);
   $23 = $$0187263 >>> 0 > 1; //@line 11837
   if ($23) {
    $$0183$ph260 = 0; //@line 11839
    $$0185$ph259 = -1; //@line 11839
    $130 = 1; //@line 11839
    L6 : while (1) {
     $$0175$ph$ph254 = 1; //@line 11841
     $$0183$ph197$ph253 = $$0183$ph260; //@line 11841
     $131 = $130; //@line 11841
     while (1) {
      $$0183$ph197248 = $$0183$ph197$ph253; //@line 11843
      $132 = $131; //@line 11843
      L10 : while (1) {
       $$0179242 = 1; //@line 11845
       $25 = $132; //@line 11845
       while (1) {
        $32 = HEAP8[$1 + ($$0179242 + $$0185$ph259) >> 0] | 0; //@line 11849
        $34 = HEAP8[$1 + $25 >> 0] | 0; //@line 11851
        if ($32 << 24 >> 24 != $34 << 24 >> 24) {
         break L10;
        }
        if (($$0179242 | 0) == ($$0175$ph$ph254 | 0)) {
         break;
        }
        $$0179242 = $$0179242 + 1 | 0; //@line 11857
        $27 = $$0179242 + $$0183$ph197248 | 0; //@line 11861
        if ($27 >>> 0 >= $$0187263 >>> 0) {
         $$0175$ph$ph$lcssa216 = $$0175$ph$ph254; //@line 11866
         $$0185$ph$lcssa = $$0185$ph259; //@line 11866
         break L6;
        } else {
         $25 = $27; //@line 11864
        }
       }
       $37 = $$0175$ph$ph254 + $$0183$ph197248 | 0; //@line 11870
       $132 = $37 + 1 | 0; //@line 11871
       if ($132 >>> 0 >= $$0187263 >>> 0) {
        $$0175$ph$ph$lcssa216 = $$0175$ph$ph254; //@line 11876
        $$0185$ph$lcssa = $$0185$ph259; //@line 11876
        break L6;
       } else {
        $$0183$ph197248 = $37; //@line 11874
       }
      }
      $41 = $25 - $$0185$ph259 | 0; //@line 11881
      if (($32 & 255) <= ($34 & 255)) {
       break;
      }
      $131 = $25 + 1 | 0; //@line 11885
      if ($131 >>> 0 >= $$0187263 >>> 0) {
       $$0175$ph$ph$lcssa216 = $41; //@line 11890
       $$0185$ph$lcssa = $$0185$ph259; //@line 11890
       break L6;
      } else {
       $$0175$ph$ph254 = $41; //@line 11888
       $$0183$ph197$ph253 = $25; //@line 11888
      }
     }
     $130 = $$0183$ph197248 + 2 | 0; //@line 11895
     if ($130 >>> 0 >= $$0187263 >>> 0) {
      $$0175$ph$ph$lcssa216 = 1; //@line 11900
      $$0185$ph$lcssa = $$0183$ph197248; //@line 11900
      break;
     } else {
      $$0183$ph260 = $$0183$ph197248 + 1 | 0; //@line 11898
      $$0185$ph259 = $$0183$ph197248; //@line 11898
     }
    }
    if ($23) {
     $$1184$ph239 = 0; //@line 11905
     $$1186$ph238 = -1; //@line 11905
     $133 = 1; //@line 11905
     while (1) {
      $$1176$ph$ph233 = 1; //@line 11907
      $$1184$ph193$ph232 = $$1184$ph239; //@line 11907
      $135 = $133; //@line 11907
      while (1) {
       $$1184$ph193227 = $$1184$ph193$ph232; //@line 11909
       $134 = $135; //@line 11909
       L25 : while (1) {
        $$1180222 = 1; //@line 11911
        $52 = $134; //@line 11911
        while (1) {
         $50 = HEAP8[$1 + ($$1180222 + $$1186$ph238) >> 0] | 0; //@line 11915
         $53 = HEAP8[$1 + $52 >> 0] | 0; //@line 11917
         if ($50 << 24 >> 24 != $53 << 24 >> 24) {
          break L25;
         }
         if (($$1180222 | 0) == ($$1176$ph$ph233 | 0)) {
          break;
         }
         $$1180222 = $$1180222 + 1 | 0; //@line 11923
         $45 = $$1180222 + $$1184$ph193227 | 0; //@line 11927
         if ($45 >>> 0 >= $$0187263 >>> 0) {
          $$0175$ph$ph$lcssa216328 = $$0175$ph$ph$lcssa216; //@line 11932
          $$0185$ph$lcssa327 = $$0185$ph$lcssa; //@line 11932
          $$0187219$ph325326 = $$0187263; //@line 11932
          $$1176$ph$ph$lcssa208 = $$1176$ph$ph233; //@line 11932
          $$1186$ph$lcssa = $$1186$ph238; //@line 11932
          label = 26; //@line 11933
          break L1;
         } else {
          $52 = $45; //@line 11930
         }
        }
        $56 = $$1176$ph$ph233 + $$1184$ph193227 | 0; //@line 11937
        $134 = $56 + 1 | 0; //@line 11938
        if ($134 >>> 0 >= $$0187263 >>> 0) {
         $$0175$ph$ph$lcssa216328 = $$0175$ph$ph$lcssa216; //@line 11943
         $$0185$ph$lcssa327 = $$0185$ph$lcssa; //@line 11943
         $$0187219$ph325326 = $$0187263; //@line 11943
         $$1176$ph$ph$lcssa208 = $$1176$ph$ph233; //@line 11943
         $$1186$ph$lcssa = $$1186$ph238; //@line 11943
         label = 26; //@line 11944
         break L1;
        } else {
         $$1184$ph193227 = $56; //@line 11941
        }
       }
       $60 = $52 - $$1186$ph238 | 0; //@line 11949
       if (($50 & 255) >= ($53 & 255)) {
        break;
       }
       $135 = $52 + 1 | 0; //@line 11953
       if ($135 >>> 0 >= $$0187263 >>> 0) {
        $$0175$ph$ph$lcssa216328 = $$0175$ph$ph$lcssa216; //@line 11958
        $$0185$ph$lcssa327 = $$0185$ph$lcssa; //@line 11958
        $$0187219$ph325326 = $$0187263; //@line 11958
        $$1176$ph$ph$lcssa208 = $60; //@line 11958
        $$1186$ph$lcssa = $$1186$ph238; //@line 11958
        label = 26; //@line 11959
        break L1;
       } else {
        $$1176$ph$ph233 = $60; //@line 11956
        $$1184$ph193$ph232 = $52; //@line 11956
       }
      }
      $133 = $$1184$ph193227 + 2 | 0; //@line 11964
      if ($133 >>> 0 >= $$0187263 >>> 0) {
       $$0175$ph$ph$lcssa216328 = $$0175$ph$ph$lcssa216; //@line 11969
       $$0185$ph$lcssa327 = $$0185$ph$lcssa; //@line 11969
       $$0187219$ph325326 = $$0187263; //@line 11969
       $$1176$ph$ph$lcssa208 = 1; //@line 11969
       $$1186$ph$lcssa = $$1184$ph193227; //@line 11969
       label = 26; //@line 11970
       break;
      } else {
       $$1184$ph239 = $$1184$ph193227 + 1 | 0; //@line 11967
       $$1186$ph238 = $$1184$ph193227; //@line 11967
      }
     }
    } else {
     $$0175$ph$ph$lcssa216328 = $$0175$ph$ph$lcssa216; //@line 11975
     $$0185$ph$lcssa327 = $$0185$ph$lcssa; //@line 11975
     $$0187219$ph325326 = $$0187263; //@line 11975
     $$1176$ph$ph$lcssa208 = 1; //@line 11975
     $$1186$ph$lcssa = -1; //@line 11975
     label = 26; //@line 11976
    }
   } else {
    $$0175$ph$ph$lcssa216328 = 1; //@line 11979
    $$0185$ph$lcssa327 = -1; //@line 11979
    $$0187219$ph325326 = $$0187263; //@line 11979
    $$1176$ph$ph$lcssa208 = 1; //@line 11979
    $$1186$ph$lcssa = -1; //@line 11979
    label = 26; //@line 11980
   }
  }
 } while (0);
 L35 : do {
  if ((label | 0) == 26) {
   $68 = ($$1186$ph$lcssa + 1 | 0) >>> 0 > ($$0185$ph$lcssa327 + 1 | 0) >>> 0; //@line 11988
   $$1176$$0175 = $68 ? $$1176$ph$ph$lcssa208 : $$0175$ph$ph$lcssa216328; //@line 11989
   $$1186$$0185 = $68 ? $$1186$ph$lcssa : $$0185$ph$lcssa327; //@line 11990
   $70 = $$1186$$0185 + 1 | 0; //@line 11992
   if (!(_memcmp($1, $1 + $$1176$$0175 | 0, $70) | 0)) {
    $$0168 = $$0187219$ph325326 - $$1176$$0175 | 0; //@line 11997
    $$3178 = $$1176$$0175; //@line 11997
   } else {
    $74 = $$0187219$ph325326 - $$1186$$0185 + -1 | 0; //@line 12000
    $$0168 = 0; //@line 12004
    $$3178 = ($$1186$$0185 >>> 0 > $74 >>> 0 ? $$1186$$0185 : $74) + 1 | 0; //@line 12004
   }
   $78 = $$0187219$ph325326 | 63; //@line 12006
   $79 = $$0187219$ph325326 + -1 | 0; //@line 12007
   $80 = ($$0168 | 0) != 0; //@line 12008
   $81 = $$0187219$ph325326 - $$3178 | 0; //@line 12009
   $$0166 = $0; //@line 12010
   $$0169 = 0; //@line 12010
   $$0170 = $0; //@line 12010
   while (1) {
    $83 = $$0166; //@line 12013
    do {
     if (($$0170 - $83 | 0) >>> 0 < $$0187219$ph325326 >>> 0) {
      $86 = _memchr($$0170, 0, $78) | 0; //@line 12018
      if (!$86) {
       $$3173 = $$0170 + $78 | 0; //@line 12022
       break;
      } else {
       if (($86 - $83 | 0) >>> 0 < $$0187219$ph325326 >>> 0) {
        $$3 = 0; //@line 12029
        break L35;
       } else {
        $$3173 = $86; //@line 12032
        break;
       }
      }
     } else {
      $$3173 = $$0170; //@line 12037
     }
    } while (0);
    $93 = HEAP8[$$0166 + $79 >> 0] | 0; //@line 12041
    L49 : do {
     if (!(1 << ($93 & 31) & HEAP32[$2 + ((($93 & 255) >>> 5 & 255) << 2) >> 2])) {
      $$0169$be = 0; //@line 12053
      $$2181$sink = $$0187219$ph325326; //@line 12053
     } else {
      $105 = $$0187219$ph325326 - (HEAP32[$3 + (($93 & 255) << 2) >> 2] | 0) | 0; //@line 12058
      if ($105 | 0) {
       $$0169$be = 0; //@line 12066
       $$2181$sink = $80 & ($$0169 | 0) != 0 & $105 >>> 0 < $$3178 >>> 0 ? $81 : $105; //@line 12066
       break;
      }
      $111 = $70 >>> 0 > $$0169 >>> 0 ? $70 : $$0169; //@line 12070
      $113 = HEAP8[$1 + $111 >> 0] | 0; //@line 12072
      L54 : do {
       if (!($113 << 24 >> 24)) {
        $$4 = $70; //@line 12076
       } else {
        $$3182221 = $111; //@line 12078
        $$pr = $113; //@line 12078
        while (1) {
         if ($$pr << 24 >> 24 != (HEAP8[$$0166 + $$3182221 >> 0] | 0)) {
          break;
         }
         $118 = $$3182221 + 1 | 0; //@line 12086
         $$pr = HEAP8[$1 + $118 >> 0] | 0; //@line 12088
         if (!($$pr << 24 >> 24)) {
          $$4 = $70; //@line 12091
          break L54;
         } else {
          $$3182221 = $118; //@line 12094
         }
        }
        $$0169$be = 0; //@line 12098
        $$2181$sink = $$3182221 - $$1186$$0185 | 0; //@line 12098
        break L49;
       }
      } while (0);
      while (1) {
       if ($$4 >>> 0 <= $$0169 >>> 0) {
        $$3 = $$0166; //@line 12105
        break L35;
       }
       $$4 = $$4 + -1 | 0; //@line 12108
       if ((HEAP8[$1 + $$4 >> 0] | 0) != (HEAP8[$$0166 + $$4 >> 0] | 0)) {
        $$0169$be = $$0168; //@line 12117
        $$2181$sink = $$3178; //@line 12117
        break;
       }
      }
     }
    } while (0);
    $$0166 = $$0166 + $$2181$sink | 0; //@line 12124
    $$0169 = $$0169$be; //@line 12124
    $$0170 = $$3173; //@line 12124
   }
  }
 } while (0);
 STACKTOP = sp; //@line 12128
 return $$3 | 0; //@line 12128
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
       HEAP32[$AsyncCtx15 + 4 >> 2] = $19; //@line 353
       HEAP32[$AsyncCtx15 + 8 >> 2] = $28; //@line 355
       HEAP32[$AsyncCtx15 + 12 >> 2] = $29; //@line 357
       HEAP8[$AsyncCtx15 + 16 >> 0] = $$085$off0 & 1; //@line 360
       HEAP8[$AsyncCtx15 + 17 >> 0] = $$081$off0 & 1; //@line 363
       HEAP32[$AsyncCtx15 + 20 >> 2] = $$084; //@line 365
       HEAP32[$AsyncCtx15 + 24 >> 2] = $30; //@line 367
       HEAP32[$AsyncCtx15 + 28 >> 2] = $2; //@line 369
       HEAP32[$AsyncCtx15 + 32 >> 2] = $13; //@line 371
       HEAP32[$AsyncCtx15 + 36 >> 2] = $1; //@line 373
       HEAP32[$AsyncCtx15 + 40 >> 2] = $26; //@line 375
       HEAP32[$AsyncCtx15 + 44 >> 2] = $27; //@line 377
       HEAP8[$AsyncCtx15 + 48 >> 0] = $4 & 1; //@line 380
       HEAP32[$AsyncCtx15 + 52 >> 2] = $25; //@line 382
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
    HEAP32[$AsyncCtx11 + 4 >> 2] = $73; //@line 444
    HEAP32[$AsyncCtx11 + 8 >> 2] = $1; //@line 446
    HEAP32[$AsyncCtx11 + 12 >> 2] = $0; //@line 448
    HEAP32[$AsyncCtx11 + 16 >> 2] = $2; //@line 450
    HEAP32[$AsyncCtx11 + 20 >> 2] = $3; //@line 452
    HEAP8[$AsyncCtx11 + 24 >> 0] = $4 & 1; //@line 455
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
 sp = STACKTOP; //@line 2508
 STACKTOP = STACKTOP + 32 | 0; //@line 2509
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(32); //@line 2509
 $0 = sp; //@line 2510
 _gpio_init_out($0, 50); //@line 2511
 while (1) {
  _emscripten_asm_const_iii(2, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 2514
  $AsyncCtx59 = _emscripten_alloc_async_context(8, sp) | 0; //@line 2515
  _wait_ms(150); //@line 2516
  if (___async) {
   label = 3; //@line 2519
   break;
  }
  _emscripten_free_async_context($AsyncCtx59 | 0); //@line 2522
  _emscripten_asm_const_iii(2, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 2524
  $AsyncCtx55 = _emscripten_alloc_async_context(8, sp) | 0; //@line 2525
  _wait_ms(150); //@line 2526
  if (___async) {
   label = 5; //@line 2529
   break;
  }
  _emscripten_free_async_context($AsyncCtx55 | 0); //@line 2532
  _emscripten_asm_const_iii(2, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 2534
  $AsyncCtx51 = _emscripten_alloc_async_context(8, sp) | 0; //@line 2535
  _wait_ms(150); //@line 2536
  if (___async) {
   label = 7; //@line 2539
   break;
  }
  _emscripten_free_async_context($AsyncCtx51 | 0); //@line 2542
  _emscripten_asm_const_iii(2, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 2544
  $AsyncCtx47 = _emscripten_alloc_async_context(8, sp) | 0; //@line 2545
  _wait_ms(150); //@line 2546
  if (___async) {
   label = 9; //@line 2549
   break;
  }
  _emscripten_free_async_context($AsyncCtx47 | 0); //@line 2552
  _emscripten_asm_const_iii(2, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 2554
  $AsyncCtx43 = _emscripten_alloc_async_context(8, sp) | 0; //@line 2555
  _wait_ms(150); //@line 2556
  if (___async) {
   label = 11; //@line 2559
   break;
  }
  _emscripten_free_async_context($AsyncCtx43 | 0); //@line 2562
  _emscripten_asm_const_iii(2, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 2564
  $AsyncCtx39 = _emscripten_alloc_async_context(8, sp) | 0; //@line 2565
  _wait_ms(150); //@line 2566
  if (___async) {
   label = 13; //@line 2569
   break;
  }
  _emscripten_free_async_context($AsyncCtx39 | 0); //@line 2572
  _emscripten_asm_const_iii(2, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 2574
  $AsyncCtx35 = _emscripten_alloc_async_context(8, sp) | 0; //@line 2575
  _wait_ms(150); //@line 2576
  if (___async) {
   label = 15; //@line 2579
   break;
  }
  _emscripten_free_async_context($AsyncCtx35 | 0); //@line 2582
  _emscripten_asm_const_iii(2, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 2584
  $AsyncCtx31 = _emscripten_alloc_async_context(8, sp) | 0; //@line 2585
  _wait_ms(150); //@line 2586
  if (___async) {
   label = 17; //@line 2589
   break;
  }
  _emscripten_free_async_context($AsyncCtx31 | 0); //@line 2592
  _emscripten_asm_const_iii(2, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 2594
  $AsyncCtx27 = _emscripten_alloc_async_context(8, sp) | 0; //@line 2595
  _wait_ms(400); //@line 2596
  if (___async) {
   label = 19; //@line 2599
   break;
  }
  _emscripten_free_async_context($AsyncCtx27 | 0); //@line 2602
  _emscripten_asm_const_iii(2, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 2604
  $AsyncCtx23 = _emscripten_alloc_async_context(8, sp) | 0; //@line 2605
  _wait_ms(400); //@line 2606
  if (___async) {
   label = 21; //@line 2609
   break;
  }
  _emscripten_free_async_context($AsyncCtx23 | 0); //@line 2612
  _emscripten_asm_const_iii(2, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 2614
  $AsyncCtx19 = _emscripten_alloc_async_context(8, sp) | 0; //@line 2615
  _wait_ms(400); //@line 2616
  if (___async) {
   label = 23; //@line 2619
   break;
  }
  _emscripten_free_async_context($AsyncCtx19 | 0); //@line 2622
  _emscripten_asm_const_iii(2, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 2624
  $AsyncCtx15 = _emscripten_alloc_async_context(8, sp) | 0; //@line 2625
  _wait_ms(400); //@line 2626
  if (___async) {
   label = 25; //@line 2629
   break;
  }
  _emscripten_free_async_context($AsyncCtx15 | 0); //@line 2632
  _emscripten_asm_const_iii(2, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 2634
  $AsyncCtx11 = _emscripten_alloc_async_context(8, sp) | 0; //@line 2635
  _wait_ms(400); //@line 2636
  if (___async) {
   label = 27; //@line 2639
   break;
  }
  _emscripten_free_async_context($AsyncCtx11 | 0); //@line 2642
  _emscripten_asm_const_iii(2, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 2644
  $AsyncCtx7 = _emscripten_alloc_async_context(8, sp) | 0; //@line 2645
  _wait_ms(400); //@line 2646
  if (___async) {
   label = 29; //@line 2649
   break;
  }
  _emscripten_free_async_context($AsyncCtx7 | 0); //@line 2652
  _emscripten_asm_const_iii(2, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 2654
  $AsyncCtx3 = _emscripten_alloc_async_context(8, sp) | 0; //@line 2655
  _wait_ms(400); //@line 2656
  if (___async) {
   label = 31; //@line 2659
   break;
  }
  _emscripten_free_async_context($AsyncCtx3 | 0); //@line 2662
  _emscripten_asm_const_iii(2, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 2664
  $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 2665
  _wait_ms(400); //@line 2666
  if (___async) {
   label = 33; //@line 2669
   break;
  }
  _emscripten_free_async_context($AsyncCtx | 0); //@line 2672
 }
 switch (label | 0) {
 case 3:
  {
   HEAP32[$AsyncCtx59 >> 2] = 50; //@line 2676
   HEAP32[$AsyncCtx59 + 4 >> 2] = $0; //@line 2678
   sp = STACKTOP; //@line 2679
   STACKTOP = sp; //@line 2680
   return;
  }
 case 5:
  {
   HEAP32[$AsyncCtx55 >> 2] = 51; //@line 2684
   HEAP32[$AsyncCtx55 + 4 >> 2] = $0; //@line 2686
   sp = STACKTOP; //@line 2687
   STACKTOP = sp; //@line 2688
   return;
  }
 case 7:
  {
   HEAP32[$AsyncCtx51 >> 2] = 52; //@line 2692
   HEAP32[$AsyncCtx51 + 4 >> 2] = $0; //@line 2694
   sp = STACKTOP; //@line 2695
   STACKTOP = sp; //@line 2696
   return;
  }
 case 9:
  {
   HEAP32[$AsyncCtx47 >> 2] = 53; //@line 2700
   HEAP32[$AsyncCtx47 + 4 >> 2] = $0; //@line 2702
   sp = STACKTOP; //@line 2703
   STACKTOP = sp; //@line 2704
   return;
  }
 case 11:
  {
   HEAP32[$AsyncCtx43 >> 2] = 54; //@line 2708
   HEAP32[$AsyncCtx43 + 4 >> 2] = $0; //@line 2710
   sp = STACKTOP; //@line 2711
   STACKTOP = sp; //@line 2712
   return;
  }
 case 13:
  {
   HEAP32[$AsyncCtx39 >> 2] = 55; //@line 2716
   HEAP32[$AsyncCtx39 + 4 >> 2] = $0; //@line 2718
   sp = STACKTOP; //@line 2719
   STACKTOP = sp; //@line 2720
   return;
  }
 case 15:
  {
   HEAP32[$AsyncCtx35 >> 2] = 56; //@line 2724
   HEAP32[$AsyncCtx35 + 4 >> 2] = $0; //@line 2726
   sp = STACKTOP; //@line 2727
   STACKTOP = sp; //@line 2728
   return;
  }
 case 17:
  {
   HEAP32[$AsyncCtx31 >> 2] = 57; //@line 2732
   HEAP32[$AsyncCtx31 + 4 >> 2] = $0; //@line 2734
   sp = STACKTOP; //@line 2735
   STACKTOP = sp; //@line 2736
   return;
  }
 case 19:
  {
   HEAP32[$AsyncCtx27 >> 2] = 58; //@line 2740
   HEAP32[$AsyncCtx27 + 4 >> 2] = $0; //@line 2742
   sp = STACKTOP; //@line 2743
   STACKTOP = sp; //@line 2744
   return;
  }
 case 21:
  {
   HEAP32[$AsyncCtx23 >> 2] = 59; //@line 2748
   HEAP32[$AsyncCtx23 + 4 >> 2] = $0; //@line 2750
   sp = STACKTOP; //@line 2751
   STACKTOP = sp; //@line 2752
   return;
  }
 case 23:
  {
   HEAP32[$AsyncCtx19 >> 2] = 60; //@line 2756
   HEAP32[$AsyncCtx19 + 4 >> 2] = $0; //@line 2758
   sp = STACKTOP; //@line 2759
   STACKTOP = sp; //@line 2760
   return;
  }
 case 25:
  {
   HEAP32[$AsyncCtx15 >> 2] = 61; //@line 2764
   HEAP32[$AsyncCtx15 + 4 >> 2] = $0; //@line 2766
   sp = STACKTOP; //@line 2767
   STACKTOP = sp; //@line 2768
   return;
  }
 case 27:
  {
   HEAP32[$AsyncCtx11 >> 2] = 62; //@line 2772
   HEAP32[$AsyncCtx11 + 4 >> 2] = $0; //@line 2774
   sp = STACKTOP; //@line 2775
   STACKTOP = sp; //@line 2776
   return;
  }
 case 29:
  {
   HEAP32[$AsyncCtx7 >> 2] = 63; //@line 2780
   HEAP32[$AsyncCtx7 + 4 >> 2] = $0; //@line 2782
   sp = STACKTOP; //@line 2783
   STACKTOP = sp; //@line 2784
   return;
  }
 case 31:
  {
   HEAP32[$AsyncCtx3 >> 2] = 64; //@line 2788
   HEAP32[$AsyncCtx3 + 4 >> 2] = $0; //@line 2790
   sp = STACKTOP; //@line 2791
   STACKTOP = sp; //@line 2792
   return;
  }
 case 33:
  {
   HEAP32[$AsyncCtx >> 2] = 65; //@line 2796
   HEAP32[$AsyncCtx + 4 >> 2] = $0; //@line 2798
   sp = STACKTOP; //@line 2799
   STACKTOP = sp; //@line 2800
   return;
  }
 }
}
function _main() {
 var $$03 = 0, $0 = 0, $12 = 0, $18 = 0, $28 = 0, $31 = 0, $34 = 0, $36 = 0, $39 = 0, $42 = 0, $47 = 0, $50 = 0, $53 = 0, $AsyncCtx = 0, $AsyncCtx11 = 0, $AsyncCtx15 = 0, $AsyncCtx19 = 0, $AsyncCtx23 = 0, $AsyncCtx26 = 0, $AsyncCtx29 = 0, $AsyncCtx3 = 0, $AsyncCtx33 = 0, $AsyncCtx36 = 0, $AsyncCtx7 = 0, $vararg_buffer = 0, sp = 0;
 sp = STACKTOP; //@line 3915
 STACKTOP = STACKTOP + 32 | 0; //@line 3916
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(32); //@line 3916
 $vararg_buffer = sp; //@line 3917
 $0 = sp + 8 | 0; //@line 3918
 $AsyncCtx19 = _emscripten_alloc_async_context(16, sp) | 0; //@line 3919
 _puts(2443) | 0; //@line 3920
 if (___async) {
  HEAP32[$AsyncCtx19 >> 2] = 91; //@line 3923
  HEAP32[$AsyncCtx19 + 4 >> 2] = $vararg_buffer; //@line 3925
  HEAP32[$AsyncCtx19 + 8 >> 2] = $vararg_buffer; //@line 3927
  HEAP32[$AsyncCtx19 + 12 >> 2] = $0; //@line 3929
  sp = STACKTOP; //@line 3930
  STACKTOP = sp; //@line 3931
  return 0; //@line 3931
 }
 _emscripten_free_async_context($AsyncCtx19 | 0); //@line 3933
 $AsyncCtx15 = _emscripten_alloc_async_context(16, sp) | 0; //@line 3934
 _puts(2507) | 0; //@line 3935
 if (___async) {
  HEAP32[$AsyncCtx15 >> 2] = 92; //@line 3938
  HEAP32[$AsyncCtx15 + 4 >> 2] = $vararg_buffer; //@line 3940
  HEAP32[$AsyncCtx15 + 8 >> 2] = $vararg_buffer; //@line 3942
  HEAP32[$AsyncCtx15 + 12 >> 2] = $0; //@line 3944
  sp = STACKTOP; //@line 3945
  STACKTOP = sp; //@line 3946
  return 0; //@line 3946
 }
 _emscripten_free_async_context($AsyncCtx15 | 0); //@line 3948
 $AsyncCtx11 = _emscripten_alloc_async_context(16, sp) | 0; //@line 3949
 _puts(2576) | 0; //@line 3950
 if (___async) {
  HEAP32[$AsyncCtx11 >> 2] = 93; //@line 3953
  HEAP32[$AsyncCtx11 + 4 >> 2] = $vararg_buffer; //@line 3955
  HEAP32[$AsyncCtx11 + 8 >> 2] = $vararg_buffer; //@line 3957
  HEAP32[$AsyncCtx11 + 12 >> 2] = $0; //@line 3959
  sp = STACKTOP; //@line 3960
  STACKTOP = sp; //@line 3961
  return 0; //@line 3961
 }
 _emscripten_free_async_context($AsyncCtx11 | 0); //@line 3963
 if (__ZN20SimulatorBlockDevice4initEv(5816) | 0) {
  $AsyncCtx7 = _emscripten_alloc_async_context(4, sp) | 0; //@line 3967
  _puts(2667) | 0; //@line 3968
  if (___async) {
   HEAP32[$AsyncCtx7 >> 2] = 94; //@line 3971
   sp = STACKTOP; //@line 3972
   STACKTOP = sp; //@line 3973
   return 0; //@line 3973
  }
  _emscripten_free_async_context($AsyncCtx7 | 0); //@line 3975
  $$03 = 1; //@line 3976
  STACKTOP = sp; //@line 3977
  return $$03 | 0; //@line 3977
 }
 $12 = _malloc(512) | 0; //@line 3979
 HEAP32[1468] = $12; //@line 3980
 $AsyncCtx23 = _emscripten_alloc_async_context(16, sp) | 0; //@line 3981
 __ZN20SimulatorBlockDevice4readEPvyy(5816, $12, 0, 0, 512, 0) | 0; //@line 3982
 if (___async) {
  HEAP32[$AsyncCtx23 >> 2] = 95; //@line 3985
  HEAP32[$AsyncCtx23 + 4 >> 2] = $vararg_buffer; //@line 3987
  HEAP32[$AsyncCtx23 + 8 >> 2] = $vararg_buffer; //@line 3989
  HEAP32[$AsyncCtx23 + 12 >> 2] = $0; //@line 3991
  sp = STACKTOP; //@line 3992
  STACKTOP = sp; //@line 3993
  return 0; //@line 3993
 }
 _emscripten_free_async_context($AsyncCtx23 | 0); //@line 3995
 HEAP32[$vararg_buffer >> 2] = HEAP32[HEAP32[1468] >> 2]; //@line 3998
 _printf(2702, $vararg_buffer) | 0; //@line 3999
 $AsyncCtx36 = _emscripten_alloc_async_context(8, sp) | 0; //@line 4000
 $18 = _equeue_alloc(5876, 32) | 0; //@line 4001
 if (___async) {
  HEAP32[$AsyncCtx36 >> 2] = 96; //@line 4004
  HEAP32[$AsyncCtx36 + 4 >> 2] = $0; //@line 4006
  sp = STACKTOP; //@line 4007
  STACKTOP = sp; //@line 4008
  return 0; //@line 4008
 }
 _emscripten_free_async_context($AsyncCtx36 | 0); //@line 4010
 if (!$18) {
  HEAP32[$0 >> 2] = 0; //@line 4013
  HEAP32[$0 + 4 >> 2] = 0; //@line 4013
  HEAP32[$0 + 8 >> 2] = 0; //@line 4013
  HEAP32[$0 + 12 >> 2] = 0; //@line 4013
  $34 = 1; //@line 4014
  $36 = $0; //@line 4014
 } else {
  HEAP32[$18 + 4 >> 2] = 5876; //@line 4017
  HEAP32[$18 + 8 >> 2] = 0; //@line 4019
  HEAP32[$18 + 12 >> 2] = 0; //@line 4021
  HEAP32[$18 + 16 >> 2] = -1; //@line 4023
  HEAP32[$18 + 20 >> 2] = 10; //@line 4025
  HEAP32[$18 + 24 >> 2] = 97; //@line 4027
  HEAP32[$18 + 28 >> 2] = 2; //@line 4029
  HEAP32[$18 >> 2] = 1; //@line 4030
  $28 = $0 + 4 | 0; //@line 4031
  HEAP32[$28 >> 2] = 0; //@line 4032
  HEAP32[$28 + 4 >> 2] = 0; //@line 4032
  HEAP32[$28 + 8 >> 2] = 0; //@line 4032
  HEAP32[$0 >> 2] = $18; //@line 4033
  HEAP32[$18 >> 2] = (HEAP32[$18 >> 2] | 0) + 1; //@line 4036
  $34 = 0; //@line 4037
  $36 = $0; //@line 4037
 }
 $31 = $0 + 12 | 0; //@line 4039
 HEAP32[$31 >> 2] = 324; //@line 4040
 $AsyncCtx33 = _emscripten_alloc_async_context(24, sp) | 0; //@line 4041
 __ZN4mbed11InterruptIn4fallENS_8CallbackIFvvEEE(6080, $0); //@line 4042
 if (___async) {
  HEAP32[$AsyncCtx33 >> 2] = 98; //@line 4045
  HEAP32[$AsyncCtx33 + 4 >> 2] = $31; //@line 4047
  HEAP8[$AsyncCtx33 + 8 >> 0] = $34 & 1; //@line 4050
  HEAP32[$AsyncCtx33 + 12 >> 2] = $36; //@line 4052
  HEAP32[$AsyncCtx33 + 16 >> 2] = $18; //@line 4054
  HEAP32[$AsyncCtx33 + 20 >> 2] = $18; //@line 4056
  sp = STACKTOP; //@line 4057
  STACKTOP = sp; //@line 4058
  return 0; //@line 4058
 }
 _emscripten_free_async_context($AsyncCtx33 | 0); //@line 4060
 $39 = HEAP32[$31 >> 2] | 0; //@line 4061
 do {
  if ($39 | 0) {
   $42 = HEAP32[$39 + 8 >> 2] | 0; //@line 4066
   $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 4067
   FUNCTION_TABLE_vi[$42 & 255]($36); //@line 4068
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 99; //@line 4071
    HEAP8[$AsyncCtx + 4 >> 0] = $34 & 1; //@line 4074
    HEAP32[$AsyncCtx + 8 >> 2] = $18; //@line 4076
    HEAP32[$AsyncCtx + 12 >> 2] = $18; //@line 4078
    sp = STACKTOP; //@line 4079
    STACKTOP = sp; //@line 4080
    return 0; //@line 4080
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 4082
    break;
   }
  }
 } while (0);
 do {
  if (!$34) {
   $47 = (HEAP32[$18 >> 2] | 0) + -1 | 0; //@line 4090
   HEAP32[$18 >> 2] = $47; //@line 4091
   if (!$47) {
    $50 = HEAP32[$18 + 24 >> 2] | 0; //@line 4095
    $AsyncCtx3 = _emscripten_alloc_async_context(8, sp) | 0; //@line 4096
    FUNCTION_TABLE_vi[$50 & 255]($18); //@line 4097
    if (___async) {
     HEAP32[$AsyncCtx3 >> 2] = 100; //@line 4100
     HEAP32[$AsyncCtx3 + 4 >> 2] = $18; //@line 4102
     sp = STACKTOP; //@line 4103
     STACKTOP = sp; //@line 4104
     return 0; //@line 4104
    }
    _emscripten_free_async_context($AsyncCtx3 | 0); //@line 4106
    $53 = HEAP32[$18 + 4 >> 2] | 0; //@line 4108
    $AsyncCtx29 = _emscripten_alloc_async_context(4, sp) | 0; //@line 4109
    _equeue_dealloc($53, $18); //@line 4110
    if (___async) {
     HEAP32[$AsyncCtx29 >> 2] = 101; //@line 4113
     sp = STACKTOP; //@line 4114
     STACKTOP = sp; //@line 4115
     return 0; //@line 4115
    } else {
     _emscripten_free_async_context($AsyncCtx29 | 0); //@line 4117
     break;
    }
   }
  }
 } while (0);
 $AsyncCtx26 = _emscripten_alloc_async_context(4, sp) | 0; //@line 4123
 __ZN6events10EventQueue8dispatchEi(5876, -1); //@line 4124
 if (___async) {
  HEAP32[$AsyncCtx26 >> 2] = 102; //@line 4127
  sp = STACKTOP; //@line 4128
  STACKTOP = sp; //@line 4129
  return 0; //@line 4129
 }
 _emscripten_free_async_context($AsyncCtx26 | 0); //@line 4131
 $$03 = 0; //@line 4132
 STACKTOP = sp; //@line 4133
 return $$03 | 0; //@line 4133
}
function __ZN20SimulatorBlockDevice7programEPKvyy__async_cb_7($0) {
 $0 = $0 | 0;
 var $11 = 0, $14 = 0, $16 = 0, $18 = 0, $2 = 0, $20 = 0, $22 = 0, $24 = 0, $30 = 0, $35 = 0, $36 = 0, $39 = 0, $4 = 0, $40 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $60 = 0, $64 = 0, $65 = 0, $66 = 0, $67 = 0, $68 = 0, $69 = 0, $7 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $9 = 0, $ReallocAsyncCtx3 = 0, $ReallocAsyncCtx4 = 0, sp = 0;
 sp = STACKTOP; //@line 1646
 $2 = $0 + 8 | 0; //@line 1648
 $4 = HEAP32[$2 >> 2] | 0; //@line 1650
 $7 = HEAP32[$2 + 4 >> 2] | 0; //@line 1653
 $9 = $0 + 16 | 0; //@line 1655
 $11 = HEAP32[$9 >> 2] | 0; //@line 1657
 $14 = HEAP32[$9 + 4 >> 2] | 0; //@line 1660
 $16 = HEAP32[$0 + 24 >> 2] | 0; //@line 1662
 $18 = HEAP32[$0 + 28 >> 2] | 0; //@line 1664
 $20 = HEAP32[$0 + 32 >> 2] | 0; //@line 1666
 $22 = HEAP32[$0 + 36 >> 2] | 0; //@line 1668
 $24 = ___async_retval; //@line 1670
 $30 = ___uremdi3($4 | 0, $7 | 0, HEAP32[$24 >> 2] | 0, HEAP32[$24 + 4 >> 2] | 0) | 0; //@line 1676
 if (($30 | 0) == 0 & (tempRet0 | 0) == 0) {
  $35 = _i64Add($4 | 0, $7 | 0, $11 | 0, $14 | 0) | 0; //@line 1682
  $36 = tempRet0; //@line 1683
  $39 = HEAP32[(HEAP32[$16 >> 2] | 0) + 56 >> 2] | 0; //@line 1686
  $ReallocAsyncCtx3 = _emscripten_realloc_async_context(40) | 0; //@line 1687
  $40 = FUNCTION_TABLE_ii[$39 & 15]($18) | 0; //@line 1688
  if (___async) {
   HEAP32[$ReallocAsyncCtx3 >> 2] = 82; //@line 1692
   $42 = $ReallocAsyncCtx3 + 8 | 0; //@line 1693
   $43 = $42; //@line 1694
   $44 = $43; //@line 1695
   HEAP32[$44 >> 2] = $35; //@line 1696
   $45 = $43 + 4 | 0; //@line 1697
   $46 = $45; //@line 1698
   HEAP32[$46 >> 2] = $36; //@line 1699
   $47 = $ReallocAsyncCtx3 + 16 | 0; //@line 1700
   $48 = $47; //@line 1701
   $49 = $48; //@line 1702
   HEAP32[$49 >> 2] = $11; //@line 1703
   $50 = $48 + 4 | 0; //@line 1704
   $51 = $50; //@line 1705
   HEAP32[$51 >> 2] = $14; //@line 1706
   $52 = $ReallocAsyncCtx3 + 24 | 0; //@line 1707
   $53 = $52; //@line 1708
   $54 = $53; //@line 1709
   HEAP32[$54 >> 2] = $4; //@line 1710
   $55 = $53 + 4 | 0; //@line 1711
   $56 = $55; //@line 1712
   HEAP32[$56 >> 2] = $7; //@line 1713
   $57 = $ReallocAsyncCtx3 + 32 | 0; //@line 1714
   HEAP32[$57 >> 2] = $20; //@line 1715
   $58 = $ReallocAsyncCtx3 + 36 | 0; //@line 1716
   HEAP32[$58 >> 2] = $22; //@line 1717
   sp = STACKTOP; //@line 1718
   return;
  }
  $60 = ___async_retval; //@line 1722
  HEAP32[$60 >> 2] = $40; //@line 1724
  HEAP32[$60 + 4 >> 2] = tempRet0; //@line 1727
  ___async_unwind = 0; //@line 1728
  HEAP32[$ReallocAsyncCtx3 >> 2] = 82; //@line 1729
  $42 = $ReallocAsyncCtx3 + 8 | 0; //@line 1730
  $43 = $42; //@line 1731
  $44 = $43; //@line 1732
  HEAP32[$44 >> 2] = $35; //@line 1733
  $45 = $43 + 4 | 0; //@line 1734
  $46 = $45; //@line 1735
  HEAP32[$46 >> 2] = $36; //@line 1736
  $47 = $ReallocAsyncCtx3 + 16 | 0; //@line 1737
  $48 = $47; //@line 1738
  $49 = $48; //@line 1739
  HEAP32[$49 >> 2] = $11; //@line 1740
  $50 = $48 + 4 | 0; //@line 1741
  $51 = $50; //@line 1742
  HEAP32[$51 >> 2] = $14; //@line 1743
  $52 = $ReallocAsyncCtx3 + 24 | 0; //@line 1744
  $53 = $52; //@line 1745
  $54 = $53; //@line 1746
  HEAP32[$54 >> 2] = $4; //@line 1747
  $55 = $53 + 4 | 0; //@line 1748
  $56 = $55; //@line 1749
  HEAP32[$56 >> 2] = $7; //@line 1750
  $57 = $ReallocAsyncCtx3 + 32 | 0; //@line 1751
  HEAP32[$57 >> 2] = $20; //@line 1752
  $58 = $ReallocAsyncCtx3 + 36 | 0; //@line 1753
  HEAP32[$58 >> 2] = $22; //@line 1754
  sp = STACKTOP; //@line 1755
  return;
 } else {
  $ReallocAsyncCtx4 = _emscripten_realloc_async_context(32) | 0; //@line 1758
  _mbed_assert_internal(2086, 1919, 98); //@line 1759
  if (___async) {
   HEAP32[$ReallocAsyncCtx4 >> 2] = 83; //@line 1762
   $64 = $ReallocAsyncCtx4 + 8 | 0; //@line 1763
   $65 = $64; //@line 1764
   $66 = $65; //@line 1765
   HEAP32[$66 >> 2] = $11; //@line 1766
   $67 = $65 + 4 | 0; //@line 1767
   $68 = $67; //@line 1768
   HEAP32[$68 >> 2] = $14; //@line 1769
   $69 = $ReallocAsyncCtx4 + 16 | 0; //@line 1770
   $70 = $69; //@line 1771
   $71 = $70; //@line 1772
   HEAP32[$71 >> 2] = $4; //@line 1773
   $72 = $70 + 4 | 0; //@line 1774
   $73 = $72; //@line 1775
   HEAP32[$73 >> 2] = $7; //@line 1776
   $74 = $ReallocAsyncCtx4 + 24 | 0; //@line 1777
   HEAP32[$74 >> 2] = $20; //@line 1778
   $75 = $ReallocAsyncCtx4 + 28 | 0; //@line 1779
   HEAP32[$75 >> 2] = $22; //@line 1780
   sp = STACKTOP; //@line 1781
   return;
  }
  ___async_unwind = 0; //@line 1784
  HEAP32[$ReallocAsyncCtx4 >> 2] = 83; //@line 1785
  $64 = $ReallocAsyncCtx4 + 8 | 0; //@line 1786
  $65 = $64; //@line 1787
  $66 = $65; //@line 1788
  HEAP32[$66 >> 2] = $11; //@line 1789
  $67 = $65 + 4 | 0; //@line 1790
  $68 = $67; //@line 1791
  HEAP32[$68 >> 2] = $14; //@line 1792
  $69 = $ReallocAsyncCtx4 + 16 | 0; //@line 1793
  $70 = $69; //@line 1794
  $71 = $70; //@line 1795
  HEAP32[$71 >> 2] = $4; //@line 1796
  $72 = $70 + 4 | 0; //@line 1797
  $73 = $72; //@line 1798
  HEAP32[$73 >> 2] = $7; //@line 1799
  $74 = $ReallocAsyncCtx4 + 24 | 0; //@line 1800
  HEAP32[$74 >> 2] = $20; //@line 1801
  $75 = $ReallocAsyncCtx4 + 28 | 0; //@line 1802
  HEAP32[$75 >> 2] = $22; //@line 1803
  sp = STACKTOP; //@line 1804
  return;
 }
}
function __ZN20SimulatorBlockDevice4readEPvyy__async_cb_30($0) {
 $0 = $0 | 0;
 var $11 = 0, $14 = 0, $16 = 0, $18 = 0, $2 = 0, $20 = 0, $22 = 0, $24 = 0, $30 = 0, $35 = 0, $36 = 0, $39 = 0, $4 = 0, $40 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $60 = 0, $64 = 0, $65 = 0, $66 = 0, $67 = 0, $68 = 0, $69 = 0, $7 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $9 = 0, $ReallocAsyncCtx3 = 0, $ReallocAsyncCtx4 = 0, sp = 0;
 sp = STACKTOP; //@line 4381
 $2 = $0 + 8 | 0; //@line 4383
 $4 = HEAP32[$2 >> 2] | 0; //@line 4385
 $7 = HEAP32[$2 + 4 >> 2] | 0; //@line 4388
 $9 = $0 + 16 | 0; //@line 4390
 $11 = HEAP32[$9 >> 2] | 0; //@line 4392
 $14 = HEAP32[$9 + 4 >> 2] | 0; //@line 4395
 $16 = HEAP32[$0 + 24 >> 2] | 0; //@line 4397
 $18 = HEAP32[$0 + 28 >> 2] | 0; //@line 4399
 $20 = HEAP32[$0 + 32 >> 2] | 0; //@line 4401
 $22 = HEAP32[$0 + 36 >> 2] | 0; //@line 4403
 $24 = ___async_retval; //@line 4405
 $30 = ___uremdi3($4 | 0, $7 | 0, HEAP32[$24 >> 2] | 0, HEAP32[$24 + 4 >> 2] | 0) | 0; //@line 4411
 if (($30 | 0) == 0 & (tempRet0 | 0) == 0) {
  $35 = _i64Add($4 | 0, $7 | 0, $11 | 0, $14 | 0) | 0; //@line 4417
  $36 = tempRet0; //@line 4418
  $39 = HEAP32[(HEAP32[$16 >> 2] | 0) + 56 >> 2] | 0; //@line 4421
  $ReallocAsyncCtx3 = _emscripten_realloc_async_context(40) | 0; //@line 4422
  $40 = FUNCTION_TABLE_ii[$39 & 15]($18) | 0; //@line 4423
  if (___async) {
   HEAP32[$ReallocAsyncCtx3 >> 2] = 78; //@line 4427
   $42 = $ReallocAsyncCtx3 + 8 | 0; //@line 4428
   $43 = $42; //@line 4429
   $44 = $43; //@line 4430
   HEAP32[$44 >> 2] = $35; //@line 4431
   $45 = $43 + 4 | 0; //@line 4432
   $46 = $45; //@line 4433
   HEAP32[$46 >> 2] = $36; //@line 4434
   $47 = $ReallocAsyncCtx3 + 16 | 0; //@line 4435
   $48 = $47; //@line 4436
   $49 = $48; //@line 4437
   HEAP32[$49 >> 2] = $11; //@line 4438
   $50 = $48 + 4 | 0; //@line 4439
   $51 = $50; //@line 4440
   HEAP32[$51 >> 2] = $14; //@line 4441
   $52 = $ReallocAsyncCtx3 + 24 | 0; //@line 4442
   $53 = $52; //@line 4443
   $54 = $53; //@line 4444
   HEAP32[$54 >> 2] = $4; //@line 4445
   $55 = $53 + 4 | 0; //@line 4446
   $56 = $55; //@line 4447
   HEAP32[$56 >> 2] = $7; //@line 4448
   $57 = $ReallocAsyncCtx3 + 32 | 0; //@line 4449
   HEAP32[$57 >> 2] = $20; //@line 4450
   $58 = $ReallocAsyncCtx3 + 36 | 0; //@line 4451
   HEAP32[$58 >> 2] = $22; //@line 4452
   sp = STACKTOP; //@line 4453
   return;
  }
  $60 = ___async_retval; //@line 4457
  HEAP32[$60 >> 2] = $40; //@line 4459
  HEAP32[$60 + 4 >> 2] = tempRet0; //@line 4462
  ___async_unwind = 0; //@line 4463
  HEAP32[$ReallocAsyncCtx3 >> 2] = 78; //@line 4464
  $42 = $ReallocAsyncCtx3 + 8 | 0; //@line 4465
  $43 = $42; //@line 4466
  $44 = $43; //@line 4467
  HEAP32[$44 >> 2] = $35; //@line 4468
  $45 = $43 + 4 | 0; //@line 4469
  $46 = $45; //@line 4470
  HEAP32[$46 >> 2] = $36; //@line 4471
  $47 = $ReallocAsyncCtx3 + 16 | 0; //@line 4472
  $48 = $47; //@line 4473
  $49 = $48; //@line 4474
  HEAP32[$49 >> 2] = $11; //@line 4475
  $50 = $48 + 4 | 0; //@line 4476
  $51 = $50; //@line 4477
  HEAP32[$51 >> 2] = $14; //@line 4478
  $52 = $ReallocAsyncCtx3 + 24 | 0; //@line 4479
  $53 = $52; //@line 4480
  $54 = $53; //@line 4481
  HEAP32[$54 >> 2] = $4; //@line 4482
  $55 = $53 + 4 | 0; //@line 4483
  $56 = $55; //@line 4484
  HEAP32[$56 >> 2] = $7; //@line 4485
  $57 = $ReallocAsyncCtx3 + 32 | 0; //@line 4486
  HEAP32[$57 >> 2] = $20; //@line 4487
  $58 = $ReallocAsyncCtx3 + 36 | 0; //@line 4488
  HEAP32[$58 >> 2] = $22; //@line 4489
  sp = STACKTOP; //@line 4490
  return;
 } else {
  $ReallocAsyncCtx4 = _emscripten_realloc_async_context(32) | 0; //@line 4493
  _mbed_assert_internal(2192, 1919, 83); //@line 4494
  if (___async) {
   HEAP32[$ReallocAsyncCtx4 >> 2] = 79; //@line 4497
   $64 = $ReallocAsyncCtx4 + 8 | 0; //@line 4498
   $65 = $64; //@line 4499
   $66 = $65; //@line 4500
   HEAP32[$66 >> 2] = $11; //@line 4501
   $67 = $65 + 4 | 0; //@line 4502
   $68 = $67; //@line 4503
   HEAP32[$68 >> 2] = $14; //@line 4504
   $69 = $ReallocAsyncCtx4 + 16 | 0; //@line 4505
   $70 = $69; //@line 4506
   $71 = $70; //@line 4507
   HEAP32[$71 >> 2] = $4; //@line 4508
   $72 = $70 + 4 | 0; //@line 4509
   $73 = $72; //@line 4510
   HEAP32[$73 >> 2] = $7; //@line 4511
   $74 = $ReallocAsyncCtx4 + 24 | 0; //@line 4512
   HEAP32[$74 >> 2] = $20; //@line 4513
   $75 = $ReallocAsyncCtx4 + 28 | 0; //@line 4514
   HEAP32[$75 >> 2] = $22; //@line 4515
   sp = STACKTOP; //@line 4516
   return;
  }
  ___async_unwind = 0; //@line 4519
  HEAP32[$ReallocAsyncCtx4 >> 2] = 79; //@line 4520
  $64 = $ReallocAsyncCtx4 + 8 | 0; //@line 4521
  $65 = $64; //@line 4522
  $66 = $65; //@line 4523
  HEAP32[$66 >> 2] = $11; //@line 4524
  $67 = $65 + 4 | 0; //@line 4525
  $68 = $67; //@line 4526
  HEAP32[$68 >> 2] = $14; //@line 4527
  $69 = $ReallocAsyncCtx4 + 16 | 0; //@line 4528
  $70 = $69; //@line 4529
  $71 = $70; //@line 4530
  HEAP32[$71 >> 2] = $4; //@line 4531
  $72 = $70 + 4 | 0; //@line 4532
  $73 = $72; //@line 4533
  HEAP32[$73 >> 2] = $7; //@line 4534
  $74 = $ReallocAsyncCtx4 + 24 | 0; //@line 4535
  HEAP32[$74 >> 2] = $20; //@line 4536
  $75 = $ReallocAsyncCtx4 + 28 | 0; //@line 4537
  HEAP32[$75 >> 2] = $22; //@line 4538
  sp = STACKTOP; //@line 4539
  return;
 }
}
function __ZN4mbed11InterruptIn4fallENS_8CallbackIFvvEEE($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$phi$trans$insert = 0, $$pre = 0, $$pre$i$i4 = 0, $$pre10 = 0, $12 = 0, $2 = 0, $20 = 0, $21 = 0, $25 = 0, $27 = 0, $29 = 0, $3 = 0, $30 = 0, $33 = 0, $4 = 0, $41 = 0, $49 = 0, $6 = 0, $8 = 0, $9 = 0, $AsyncCtx = 0, $AsyncCtx11 = 0, $AsyncCtx2 = 0, $AsyncCtx5 = 0, $AsyncCtx8 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 323
 STACKTOP = STACKTOP + 16 | 0; //@line 324
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 324
 $2 = sp; //@line 325
 $3 = $1 + 12 | 0; //@line 326
 $4 = HEAP32[$3 >> 2] | 0; //@line 327
 if ($4 | 0) {
  $6 = $0 + 56 | 0; //@line 330
  if (($6 | 0) != ($1 | 0)) {
   $8 = $0 + 68 | 0; //@line 333
   $9 = HEAP32[$8 >> 2] | 0; //@line 334
   do {
    if (!$9) {
     $20 = $4; //@line 338
     label = 7; //@line 339
    } else {
     $12 = HEAP32[$9 + 8 >> 2] | 0; //@line 342
     $AsyncCtx = _emscripten_alloc_async_context(24, sp) | 0; //@line 343
     FUNCTION_TABLE_vi[$12 & 255]($6); //@line 344
     if (___async) {
      HEAP32[$AsyncCtx >> 2] = 20; //@line 347
      HEAP32[$AsyncCtx + 4 >> 2] = $3; //@line 349
      HEAP32[$AsyncCtx + 8 >> 2] = $8; //@line 351
      HEAP32[$AsyncCtx + 12 >> 2] = $6; //@line 353
      HEAP32[$AsyncCtx + 16 >> 2] = $1; //@line 355
      HEAP32[$AsyncCtx + 20 >> 2] = $0; //@line 357
      sp = STACKTOP; //@line 358
      STACKTOP = sp; //@line 359
      return;
     } else {
      _emscripten_free_async_context($AsyncCtx | 0); //@line 361
      $$pre = HEAP32[$3 >> 2] | 0; //@line 362
      if (!$$pre) {
       $25 = 0; //@line 365
       break;
      } else {
       $20 = $$pre; //@line 368
       label = 7; //@line 369
       break;
      }
     }
    }
   } while (0);
   do {
    if ((label | 0) == 7) {
     $21 = HEAP32[$20 + 4 >> 2] | 0; //@line 378
     $AsyncCtx2 = _emscripten_alloc_async_context(16, sp) | 0; //@line 379
     FUNCTION_TABLE_vii[$21 & 3]($6, $1); //@line 380
     if (___async) {
      HEAP32[$AsyncCtx2 >> 2] = 21; //@line 383
      HEAP32[$AsyncCtx2 + 4 >> 2] = $3; //@line 385
      HEAP32[$AsyncCtx2 + 8 >> 2] = $8; //@line 387
      HEAP32[$AsyncCtx2 + 12 >> 2] = $0; //@line 389
      sp = STACKTOP; //@line 390
      STACKTOP = sp; //@line 391
      return;
     } else {
      _emscripten_free_async_context($AsyncCtx2 | 0); //@line 393
      $25 = HEAP32[$3 >> 2] | 0; //@line 395
      break;
     }
    }
   } while (0);
   HEAP32[$8 >> 2] = $25; //@line 400
  }
  _gpio_irq_set($0 + 28 | 0, 2, 1); //@line 403
  STACKTOP = sp; //@line 404
  return;
 }
 HEAP32[$2 >> 2] = 0; //@line 406
 HEAP32[$2 + 4 >> 2] = 0; //@line 406
 HEAP32[$2 + 8 >> 2] = 0; //@line 406
 HEAP32[$2 + 12 >> 2] = 0; //@line 406
 $27 = $0 + 56 | 0; //@line 407
 do {
  if (($27 | 0) != ($2 | 0)) {
   $29 = $0 + 68 | 0; //@line 411
   $30 = HEAP32[$29 >> 2] | 0; //@line 412
   if ($30 | 0) {
    $33 = HEAP32[$30 + 8 >> 2] | 0; //@line 416
    $AsyncCtx5 = _emscripten_alloc_async_context(24, sp) | 0; //@line 417
    FUNCTION_TABLE_vi[$33 & 255]($27); //@line 418
    if (___async) {
     HEAP32[$AsyncCtx5 >> 2] = 22; //@line 421
     HEAP32[$AsyncCtx5 + 4 >> 2] = $2; //@line 423
     HEAP32[$AsyncCtx5 + 8 >> 2] = $29; //@line 425
     HEAP32[$AsyncCtx5 + 12 >> 2] = $27; //@line 427
     HEAP32[$AsyncCtx5 + 16 >> 2] = $2; //@line 429
     HEAP32[$AsyncCtx5 + 20 >> 2] = $0; //@line 431
     sp = STACKTOP; //@line 432
     STACKTOP = sp; //@line 433
     return;
    }
    _emscripten_free_async_context($AsyncCtx5 | 0); //@line 435
    $$phi$trans$insert = $2 + 12 | 0; //@line 436
    $$pre10 = HEAP32[$$phi$trans$insert >> 2] | 0; //@line 437
    if ($$pre10 | 0) {
     $41 = HEAP32[$$pre10 + 4 >> 2] | 0; //@line 441
     $AsyncCtx8 = _emscripten_alloc_async_context(20, sp) | 0; //@line 442
     FUNCTION_TABLE_vii[$41 & 3]($27, $2); //@line 443
     if (___async) {
      HEAP32[$AsyncCtx8 >> 2] = 23; //@line 446
      HEAP32[$AsyncCtx8 + 4 >> 2] = $$phi$trans$insert; //@line 448
      HEAP32[$AsyncCtx8 + 8 >> 2] = $29; //@line 450
      HEAP32[$AsyncCtx8 + 12 >> 2] = $2; //@line 452
      HEAP32[$AsyncCtx8 + 16 >> 2] = $0; //@line 454
      sp = STACKTOP; //@line 455
      STACKTOP = sp; //@line 456
      return;
     }
     _emscripten_free_async_context($AsyncCtx8 | 0); //@line 458
     $$pre$i$i4 = HEAP32[$$phi$trans$insert >> 2] | 0; //@line 459
     HEAP32[$29 >> 2] = $$pre$i$i4; //@line 460
     if (!$$pre$i$i4) {
      break;
     }
     $49 = HEAP32[$$pre$i$i4 + 8 >> 2] | 0; //@line 467
     $AsyncCtx11 = _emscripten_alloc_async_context(12, sp) | 0; //@line 468
     FUNCTION_TABLE_vi[$49 & 255]($2); //@line 469
     if (___async) {
      HEAP32[$AsyncCtx11 >> 2] = 24; //@line 472
      HEAP32[$AsyncCtx11 + 4 >> 2] = $2; //@line 474
      HEAP32[$AsyncCtx11 + 8 >> 2] = $0; //@line 476
      sp = STACKTOP; //@line 477
      STACKTOP = sp; //@line 478
      return;
     } else {
      _emscripten_free_async_context($AsyncCtx11 | 0); //@line 480
      break;
     }
    }
   }
   HEAP32[$29 >> 2] = 0; //@line 485
  }
 } while (0);
 _gpio_irq_set($0 + 28 | 0, 2, 0); //@line 489
 STACKTOP = sp; //@line 490
 return;
}
function __ZN20SimulatorBlockDevice7programEPKvyy__async_cb($0) {
 $0 = $0 | 0;
 var $11 = 0, $13 = 0, $15 = 0, $18 = 0, $2 = 0, $20 = 0, $22 = 0, $24 = 0, $30 = 0, $37 = 0, $38 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $55 = 0, $59 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0, $67 = 0, $68 = 0, $69 = 0, $7 = 0, $70 = 0, $9 = 0, $ReallocAsyncCtx2 = 0, $ReallocAsyncCtx4 = 0, sp = 0;
 sp = STACKTOP; //@line 1485
 $2 = $0 + 8 | 0; //@line 1487
 $4 = HEAP32[$2 >> 2] | 0; //@line 1489
 $7 = HEAP32[$2 + 4 >> 2] | 0; //@line 1492
 $9 = HEAP32[$0 + 16 >> 2] | 0; //@line 1494
 $11 = HEAP32[$0 + 20 >> 2] | 0; //@line 1496
 $13 = $0 + 24 | 0; //@line 1498
 $15 = HEAP32[$13 >> 2] | 0; //@line 1500
 $18 = HEAP32[$13 + 4 >> 2] | 0; //@line 1503
 $20 = HEAP32[$0 + 32 >> 2] | 0; //@line 1505
 $22 = HEAP32[$0 + 36 >> 2] | 0; //@line 1507
 $24 = ___async_retval; //@line 1509
 $30 = ___uremdi3($4 | 0, $7 | 0, HEAP32[$24 >> 2] | 0, HEAP32[$24 + 4 >> 2] | 0) | 0; //@line 1515
 if (($30 | 0) == 0 & (tempRet0 | 0) == 0) {
  $37 = HEAP32[(HEAP32[$9 >> 2] | 0) + 40 >> 2] | 0; //@line 1523
  $ReallocAsyncCtx2 = _emscripten_realloc_async_context(40) | 0; //@line 1524
  $38 = FUNCTION_TABLE_ii[$37 & 15]($11) | 0; //@line 1525
  if (___async) {
   HEAP32[$ReallocAsyncCtx2 >> 2] = 81; //@line 1529
   $40 = $ReallocAsyncCtx2 + 8 | 0; //@line 1530
   $41 = $40; //@line 1531
   $42 = $41; //@line 1532
   HEAP32[$42 >> 2] = $15; //@line 1533
   $43 = $41 + 4 | 0; //@line 1534
   $44 = $43; //@line 1535
   HEAP32[$44 >> 2] = $18; //@line 1536
   $45 = $ReallocAsyncCtx2 + 16 | 0; //@line 1537
   $46 = $45; //@line 1538
   $47 = $46; //@line 1539
   HEAP32[$47 >> 2] = $4; //@line 1540
   $48 = $46 + 4 | 0; //@line 1541
   $49 = $48; //@line 1542
   HEAP32[$49 >> 2] = $7; //@line 1543
   $50 = $ReallocAsyncCtx2 + 24 | 0; //@line 1544
   HEAP32[$50 >> 2] = $9; //@line 1545
   $51 = $ReallocAsyncCtx2 + 28 | 0; //@line 1546
   HEAP32[$51 >> 2] = $11; //@line 1547
   $52 = $ReallocAsyncCtx2 + 32 | 0; //@line 1548
   HEAP32[$52 >> 2] = $20; //@line 1549
   $53 = $ReallocAsyncCtx2 + 36 | 0; //@line 1550
   HEAP32[$53 >> 2] = $22; //@line 1551
   sp = STACKTOP; //@line 1552
   return;
  }
  $55 = ___async_retval; //@line 1556
  HEAP32[$55 >> 2] = $38; //@line 1558
  HEAP32[$55 + 4 >> 2] = tempRet0; //@line 1561
  ___async_unwind = 0; //@line 1562
  HEAP32[$ReallocAsyncCtx2 >> 2] = 81; //@line 1563
  $40 = $ReallocAsyncCtx2 + 8 | 0; //@line 1564
  $41 = $40; //@line 1565
  $42 = $41; //@line 1566
  HEAP32[$42 >> 2] = $15; //@line 1567
  $43 = $41 + 4 | 0; //@line 1568
  $44 = $43; //@line 1569
  HEAP32[$44 >> 2] = $18; //@line 1570
  $45 = $ReallocAsyncCtx2 + 16 | 0; //@line 1571
  $46 = $45; //@line 1572
  $47 = $46; //@line 1573
  HEAP32[$47 >> 2] = $4; //@line 1574
  $48 = $46 + 4 | 0; //@line 1575
  $49 = $48; //@line 1576
  HEAP32[$49 >> 2] = $7; //@line 1577
  $50 = $ReallocAsyncCtx2 + 24 | 0; //@line 1578
  HEAP32[$50 >> 2] = $9; //@line 1579
  $51 = $ReallocAsyncCtx2 + 28 | 0; //@line 1580
  HEAP32[$51 >> 2] = $11; //@line 1581
  $52 = $ReallocAsyncCtx2 + 32 | 0; //@line 1582
  HEAP32[$52 >> 2] = $20; //@line 1583
  $53 = $ReallocAsyncCtx2 + 36 | 0; //@line 1584
  HEAP32[$53 >> 2] = $22; //@line 1585
  sp = STACKTOP; //@line 1586
  return;
 } else {
  $ReallocAsyncCtx4 = _emscripten_realloc_async_context(32) | 0; //@line 1589
  _mbed_assert_internal(2086, 1919, 98); //@line 1590
  if (___async) {
   HEAP32[$ReallocAsyncCtx4 >> 2] = 83; //@line 1593
   $59 = $ReallocAsyncCtx4 + 8 | 0; //@line 1594
   $60 = $59; //@line 1595
   $61 = $60; //@line 1596
   HEAP32[$61 >> 2] = $4; //@line 1597
   $62 = $60 + 4 | 0; //@line 1598
   $63 = $62; //@line 1599
   HEAP32[$63 >> 2] = $7; //@line 1600
   $64 = $ReallocAsyncCtx4 + 16 | 0; //@line 1601
   $65 = $64; //@line 1602
   $66 = $65; //@line 1603
   HEAP32[$66 >> 2] = $15; //@line 1604
   $67 = $65 + 4 | 0; //@line 1605
   $68 = $67; //@line 1606
   HEAP32[$68 >> 2] = $18; //@line 1607
   $69 = $ReallocAsyncCtx4 + 24 | 0; //@line 1608
   HEAP32[$69 >> 2] = $20; //@line 1609
   $70 = $ReallocAsyncCtx4 + 28 | 0; //@line 1610
   HEAP32[$70 >> 2] = $22; //@line 1611
   sp = STACKTOP; //@line 1612
   return;
  }
  ___async_unwind = 0; //@line 1615
  HEAP32[$ReallocAsyncCtx4 >> 2] = 83; //@line 1616
  $59 = $ReallocAsyncCtx4 + 8 | 0; //@line 1617
  $60 = $59; //@line 1618
  $61 = $60; //@line 1619
  HEAP32[$61 >> 2] = $4; //@line 1620
  $62 = $60 + 4 | 0; //@line 1621
  $63 = $62; //@line 1622
  HEAP32[$63 >> 2] = $7; //@line 1623
  $64 = $ReallocAsyncCtx4 + 16 | 0; //@line 1624
  $65 = $64; //@line 1625
  $66 = $65; //@line 1626
  HEAP32[$66 >> 2] = $15; //@line 1627
  $67 = $65 + 4 | 0; //@line 1628
  $68 = $67; //@line 1629
  HEAP32[$68 >> 2] = $18; //@line 1630
  $69 = $ReallocAsyncCtx4 + 24 | 0; //@line 1631
  HEAP32[$69 >> 2] = $20; //@line 1632
  $70 = $ReallocAsyncCtx4 + 28 | 0; //@line 1633
  HEAP32[$70 >> 2] = $22; //@line 1634
  sp = STACKTOP; //@line 1635
  return;
 }
}
function __ZN20SimulatorBlockDevice4readEPvyy__async_cb($0) {
 $0 = $0 | 0;
 var $11 = 0, $13 = 0, $15 = 0, $18 = 0, $2 = 0, $20 = 0, $22 = 0, $24 = 0, $30 = 0, $37 = 0, $38 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $55 = 0, $59 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0, $67 = 0, $68 = 0, $69 = 0, $7 = 0, $70 = 0, $9 = 0, $ReallocAsyncCtx2 = 0, $ReallocAsyncCtx4 = 0, sp = 0;
 sp = STACKTOP; //@line 4220
 $2 = $0 + 8 | 0; //@line 4222
 $4 = HEAP32[$2 >> 2] | 0; //@line 4224
 $7 = HEAP32[$2 + 4 >> 2] | 0; //@line 4227
 $9 = HEAP32[$0 + 16 >> 2] | 0; //@line 4229
 $11 = HEAP32[$0 + 20 >> 2] | 0; //@line 4231
 $13 = $0 + 24 | 0; //@line 4233
 $15 = HEAP32[$13 >> 2] | 0; //@line 4235
 $18 = HEAP32[$13 + 4 >> 2] | 0; //@line 4238
 $20 = HEAP32[$0 + 32 >> 2] | 0; //@line 4240
 $22 = HEAP32[$0 + 36 >> 2] | 0; //@line 4242
 $24 = ___async_retval; //@line 4244
 $30 = ___uremdi3($4 | 0, $7 | 0, HEAP32[$24 >> 2] | 0, HEAP32[$24 + 4 >> 2] | 0) | 0; //@line 4250
 if (($30 | 0) == 0 & (tempRet0 | 0) == 0) {
  $37 = HEAP32[(HEAP32[$9 >> 2] | 0) + 36 >> 2] | 0; //@line 4258
  $ReallocAsyncCtx2 = _emscripten_realloc_async_context(40) | 0; //@line 4259
  $38 = FUNCTION_TABLE_ii[$37 & 15]($11) | 0; //@line 4260
  if (___async) {
   HEAP32[$ReallocAsyncCtx2 >> 2] = 77; //@line 4264
   $40 = $ReallocAsyncCtx2 + 8 | 0; //@line 4265
   $41 = $40; //@line 4266
   $42 = $41; //@line 4267
   HEAP32[$42 >> 2] = $15; //@line 4268
   $43 = $41 + 4 | 0; //@line 4269
   $44 = $43; //@line 4270
   HEAP32[$44 >> 2] = $18; //@line 4271
   $45 = $ReallocAsyncCtx2 + 16 | 0; //@line 4272
   $46 = $45; //@line 4273
   $47 = $46; //@line 4274
   HEAP32[$47 >> 2] = $4; //@line 4275
   $48 = $46 + 4 | 0; //@line 4276
   $49 = $48; //@line 4277
   HEAP32[$49 >> 2] = $7; //@line 4278
   $50 = $ReallocAsyncCtx2 + 24 | 0; //@line 4279
   HEAP32[$50 >> 2] = $9; //@line 4280
   $51 = $ReallocAsyncCtx2 + 28 | 0; //@line 4281
   HEAP32[$51 >> 2] = $11; //@line 4282
   $52 = $ReallocAsyncCtx2 + 32 | 0; //@line 4283
   HEAP32[$52 >> 2] = $20; //@line 4284
   $53 = $ReallocAsyncCtx2 + 36 | 0; //@line 4285
   HEAP32[$53 >> 2] = $22; //@line 4286
   sp = STACKTOP; //@line 4287
   return;
  }
  $55 = ___async_retval; //@line 4291
  HEAP32[$55 >> 2] = $38; //@line 4293
  HEAP32[$55 + 4 >> 2] = tempRet0; //@line 4296
  ___async_unwind = 0; //@line 4297
  HEAP32[$ReallocAsyncCtx2 >> 2] = 77; //@line 4298
  $40 = $ReallocAsyncCtx2 + 8 | 0; //@line 4299
  $41 = $40; //@line 4300
  $42 = $41; //@line 4301
  HEAP32[$42 >> 2] = $15; //@line 4302
  $43 = $41 + 4 | 0; //@line 4303
  $44 = $43; //@line 4304
  HEAP32[$44 >> 2] = $18; //@line 4305
  $45 = $ReallocAsyncCtx2 + 16 | 0; //@line 4306
  $46 = $45; //@line 4307
  $47 = $46; //@line 4308
  HEAP32[$47 >> 2] = $4; //@line 4309
  $48 = $46 + 4 | 0; //@line 4310
  $49 = $48; //@line 4311
  HEAP32[$49 >> 2] = $7; //@line 4312
  $50 = $ReallocAsyncCtx2 + 24 | 0; //@line 4313
  HEAP32[$50 >> 2] = $9; //@line 4314
  $51 = $ReallocAsyncCtx2 + 28 | 0; //@line 4315
  HEAP32[$51 >> 2] = $11; //@line 4316
  $52 = $ReallocAsyncCtx2 + 32 | 0; //@line 4317
  HEAP32[$52 >> 2] = $20; //@line 4318
  $53 = $ReallocAsyncCtx2 + 36 | 0; //@line 4319
  HEAP32[$53 >> 2] = $22; //@line 4320
  sp = STACKTOP; //@line 4321
  return;
 } else {
  $ReallocAsyncCtx4 = _emscripten_realloc_async_context(32) | 0; //@line 4324
  _mbed_assert_internal(2192, 1919, 83); //@line 4325
  if (___async) {
   HEAP32[$ReallocAsyncCtx4 >> 2] = 79; //@line 4328
   $59 = $ReallocAsyncCtx4 + 8 | 0; //@line 4329
   $60 = $59; //@line 4330
   $61 = $60; //@line 4331
   HEAP32[$61 >> 2] = $4; //@line 4332
   $62 = $60 + 4 | 0; //@line 4333
   $63 = $62; //@line 4334
   HEAP32[$63 >> 2] = $7; //@line 4335
   $64 = $ReallocAsyncCtx4 + 16 | 0; //@line 4336
   $65 = $64; //@line 4337
   $66 = $65; //@line 4338
   HEAP32[$66 >> 2] = $15; //@line 4339
   $67 = $65 + 4 | 0; //@line 4340
   $68 = $67; //@line 4341
   HEAP32[$68 >> 2] = $18; //@line 4342
   $69 = $ReallocAsyncCtx4 + 24 | 0; //@line 4343
   HEAP32[$69 >> 2] = $20; //@line 4344
   $70 = $ReallocAsyncCtx4 + 28 | 0; //@line 4345
   HEAP32[$70 >> 2] = $22; //@line 4346
   sp = STACKTOP; //@line 4347
   return;
  }
  ___async_unwind = 0; //@line 4350
  HEAP32[$ReallocAsyncCtx4 >> 2] = 79; //@line 4351
  $59 = $ReallocAsyncCtx4 + 8 | 0; //@line 4352
  $60 = $59; //@line 4353
  $61 = $60; //@line 4354
  HEAP32[$61 >> 2] = $4; //@line 4355
  $62 = $60 + 4 | 0; //@line 4356
  $63 = $62; //@line 4357
  HEAP32[$63 >> 2] = $7; //@line 4358
  $64 = $ReallocAsyncCtx4 + 16 | 0; //@line 4359
  $65 = $64; //@line 4360
  $66 = $65; //@line 4361
  HEAP32[$66 >> 2] = $15; //@line 4362
  $67 = $65 + 4 | 0; //@line 4363
  $68 = $67; //@line 4364
  HEAP32[$68 >> 2] = $18; //@line 4365
  $69 = $ReallocAsyncCtx4 + 24 | 0; //@line 4366
  HEAP32[$69 >> 2] = $20; //@line 4367
  $70 = $ReallocAsyncCtx4 + 28 | 0; //@line 4368
  HEAP32[$70 >> 2] = $22; //@line 4369
  sp = STACKTOP; //@line 4370
  return;
 }
}
function _mbed_vtracef__async_cb_19($0) {
 $0 = $0 | 0;
 var $$10 = 0, $$3147168 = 0, $$3169 = 0, $$5156 = 0, $$5156$ = 0, $$expand_i1_val = 0, $12 = 0, $16 = 0, $2 = 0, $20 = 0, $24 = 0, $26 = 0, $28 = 0, $30 = 0, $34 = 0, $36 = 0, $38 = 0, $4 = 0, $40 = 0, $46 = 0, $48 = 0, $50 = 0, $53 = 0, $54 = 0, $56 = 0, $6 = 0, $67 = 0, $68 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $79 = 0, $8 = 0, $80 = 0, $ReallocAsyncCtx10 = 0, $ReallocAsyncCtx7 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 3136
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 3138
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 3140
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 3142
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 3144
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 3148
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 3152
 $20 = HEAP32[$0 + 40 >> 2] | 0; //@line 3156
 $24 = HEAP32[$0 + 48 >> 2] | 0; //@line 3160
 $26 = HEAP32[$0 + 52 >> 2] | 0; //@line 3162
 $28 = HEAP32[$0 + 56 >> 2] | 0; //@line 3164
 $30 = HEAP32[$0 + 60 >> 2] | 0; //@line 3166
 $34 = HEAP8[$0 + 68 >> 0] & 1; //@line 3171
 $36 = HEAP32[$0 + 72 >> 2] | 0; //@line 3173
 $38 = HEAP32[$0 + 76 >> 2] | 0; //@line 3175
 $40 = HEAP32[$0 + 80 >> 2] | 0; //@line 3177
 $46 = HEAP32[$0 + 92 >> 2] | 0; //@line 3183
 $48 = HEAP32[$0 + 96 >> 2] | 0; //@line 3185
 HEAP32[$40 >> 2] = HEAP32[___async_retval >> 2]; //@line 3188
 $50 = _snprintf($24, $26, 1448, $40) | 0; //@line 3189
 $$10 = ($50 | 0) >= ($26 | 0) ? 0 : $50; //@line 3191
 $53 = $24 + $$10 | 0; //@line 3193
 $54 = $26 - $$10 | 0; //@line 3194
 if (($$10 | 0) > 0) {
  if (($54 | 0) > 0) {
   $$3147168 = $54; //@line 3198
   $$3169 = $53; //@line 3198
   label = 4; //@line 3199
  }
 } else {
  $$3147168 = $26; //@line 3202
  $$3169 = $24; //@line 3202
  label = 4; //@line 3203
 }
 if ((label | 0) == 4) {
  $56 = $28 + -2 | 0; //@line 3206
  switch ($56 >>> 1 | $56 << 31 | 0) {
  case 0:
   {
    HEAP32[$30 >> 2] = $8; //@line 3212
    $$5156 = _snprintf($$3169, $$3147168, 1451, $30) | 0; //@line 3214
    break;
   }
  case 1:
   {
    HEAP32[$6 >> 2] = $8; //@line 3218
    $$5156 = _snprintf($$3169, $$3147168, 1466, $6) | 0; //@line 3220
    break;
   }
  case 3:
   {
    HEAP32[$12 >> 2] = $8; //@line 3224
    $$5156 = _snprintf($$3169, $$3147168, 1481, $12) | 0; //@line 3226
    break;
   }
  case 7:
   {
    HEAP32[$16 >> 2] = $8; //@line 3230
    $$5156 = _snprintf($$3169, $$3147168, 1496, $16) | 0; //@line 3232
    break;
   }
  default:
   {
    $$5156 = _snprintf($$3169, $$3147168, 1511, $20) | 0; //@line 3237
   }
  }
  $$5156$ = ($$5156 | 0) < ($$3147168 | 0) ? $$5156 : 0; //@line 3241
  $67 = $$3169 + $$5156$ | 0; //@line 3243
  $68 = $$3147168 - $$5156$ | 0; //@line 3244
  if (($$5156$ | 0) > 0 & ($68 | 0) > 0) {
   $ReallocAsyncCtx10 = _emscripten_realloc_async_context(32) | 0; //@line 3248
   $70 = _vsnprintf($67, $68, $46, $48) | 0; //@line 3249
   if (___async) {
    HEAP32[$ReallocAsyncCtx10 >> 2] = 44; //@line 3252
    $71 = $ReallocAsyncCtx10 + 4 | 0; //@line 3253
    HEAP32[$71 >> 2] = $68; //@line 3254
    $72 = $ReallocAsyncCtx10 + 8 | 0; //@line 3255
    HEAP32[$72 >> 2] = $67; //@line 3256
    $73 = $ReallocAsyncCtx10 + 12 | 0; //@line 3257
    HEAP32[$73 >> 2] = $2; //@line 3258
    $74 = $ReallocAsyncCtx10 + 16 | 0; //@line 3259
    HEAP32[$74 >> 2] = $4; //@line 3260
    $75 = $ReallocAsyncCtx10 + 20 | 0; //@line 3261
    $$expand_i1_val = $34 & 1; //@line 3262
    HEAP8[$75 >> 0] = $$expand_i1_val; //@line 3263
    $76 = $ReallocAsyncCtx10 + 24 | 0; //@line 3264
    HEAP32[$76 >> 2] = $36; //@line 3265
    $77 = $ReallocAsyncCtx10 + 28 | 0; //@line 3266
    HEAP32[$77 >> 2] = $38; //@line 3267
    sp = STACKTOP; //@line 3268
    return;
   }
   HEAP32[___async_retval >> 2] = $70; //@line 3272
   ___async_unwind = 0; //@line 3273
   HEAP32[$ReallocAsyncCtx10 >> 2] = 44; //@line 3274
   $71 = $ReallocAsyncCtx10 + 4 | 0; //@line 3275
   HEAP32[$71 >> 2] = $68; //@line 3276
   $72 = $ReallocAsyncCtx10 + 8 | 0; //@line 3277
   HEAP32[$72 >> 2] = $67; //@line 3278
   $73 = $ReallocAsyncCtx10 + 12 | 0; //@line 3279
   HEAP32[$73 >> 2] = $2; //@line 3280
   $74 = $ReallocAsyncCtx10 + 16 | 0; //@line 3281
   HEAP32[$74 >> 2] = $4; //@line 3282
   $75 = $ReallocAsyncCtx10 + 20 | 0; //@line 3283
   $$expand_i1_val = $34 & 1; //@line 3284
   HEAP8[$75 >> 0] = $$expand_i1_val; //@line 3285
   $76 = $ReallocAsyncCtx10 + 24 | 0; //@line 3286
   HEAP32[$76 >> 2] = $36; //@line 3287
   $77 = $ReallocAsyncCtx10 + 28 | 0; //@line 3288
   HEAP32[$77 >> 2] = $38; //@line 3289
   sp = STACKTOP; //@line 3290
   return;
  }
 }
 $79 = HEAP32[59] | 0; //@line 3294
 $80 = HEAP32[52] | 0; //@line 3295
 $ReallocAsyncCtx7 = _emscripten_realloc_async_context(4) | 0; //@line 3296
 FUNCTION_TABLE_vi[$79 & 255]($80); //@line 3297
 if (___async) {
  HEAP32[$ReallocAsyncCtx7 >> 2] = 46; //@line 3300
  sp = STACKTOP; //@line 3301
  return;
 }
 ___async_unwind = 0; //@line 3304
 HEAP32[$ReallocAsyncCtx7 >> 2] = 46; //@line 3305
 sp = STACKTOP; //@line 3306
 return;
}
function __ZN20SimulatorBlockDevice5eraseEyy__async_cb_27($0) {
 $0 = $0 | 0;
 var $11 = 0, $14 = 0, $16 = 0, $18 = 0, $2 = 0, $20 = 0, $22 = 0, $28 = 0, $33 = 0, $34 = 0, $37 = 0, $38 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $57 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0, $67 = 0, $68 = 0, $69 = 0, $7 = 0, $70 = 0, $71 = 0, $9 = 0, $ReallocAsyncCtx3 = 0, $ReallocAsyncCtx4 = 0, sp = 0;
 sp = STACKTOP; //@line 3892
 $2 = $0 + 8 | 0; //@line 3894
 $4 = HEAP32[$2 >> 2] | 0; //@line 3896
 $7 = HEAP32[$2 + 4 >> 2] | 0; //@line 3899
 $9 = $0 + 16 | 0; //@line 3901
 $11 = HEAP32[$9 >> 2] | 0; //@line 3903
 $14 = HEAP32[$9 + 4 >> 2] | 0; //@line 3906
 $16 = HEAP32[$0 + 24 >> 2] | 0; //@line 3908
 $18 = HEAP32[$0 + 28 >> 2] | 0; //@line 3910
 $20 = HEAP32[$0 + 32 >> 2] | 0; //@line 3912
 $22 = ___async_retval; //@line 3914
 $28 = ___uremdi3($4 | 0, $7 | 0, HEAP32[$22 >> 2] | 0, HEAP32[$22 + 4 >> 2] | 0) | 0; //@line 3920
 if (($28 | 0) == 0 & (tempRet0 | 0) == 0) {
  $33 = _i64Add($4 | 0, $7 | 0, $11 | 0, $14 | 0) | 0; //@line 3926
  $34 = tempRet0; //@line 3927
  $37 = HEAP32[(HEAP32[$16 >> 2] | 0) + 56 >> 2] | 0; //@line 3930
  $ReallocAsyncCtx3 = _emscripten_realloc_async_context(40) | 0; //@line 3931
  $38 = FUNCTION_TABLE_ii[$37 & 15]($18) | 0; //@line 3932
  if (___async) {
   HEAP32[$ReallocAsyncCtx3 >> 2] = 86; //@line 3936
   $40 = $ReallocAsyncCtx3 + 8 | 0; //@line 3937
   $41 = $40; //@line 3938
   $42 = $41; //@line 3939
   HEAP32[$42 >> 2] = $33; //@line 3940
   $43 = $41 + 4 | 0; //@line 3941
   $44 = $43; //@line 3942
   HEAP32[$44 >> 2] = $34; //@line 3943
   $45 = $ReallocAsyncCtx3 + 16 | 0; //@line 3944
   $46 = $45; //@line 3945
   $47 = $46; //@line 3946
   HEAP32[$47 >> 2] = $11; //@line 3947
   $48 = $46 + 4 | 0; //@line 3948
   $49 = $48; //@line 3949
   HEAP32[$49 >> 2] = $14; //@line 3950
   $50 = $ReallocAsyncCtx3 + 24 | 0; //@line 3951
   $51 = $50; //@line 3952
   $52 = $51; //@line 3953
   HEAP32[$52 >> 2] = $4; //@line 3954
   $53 = $51 + 4 | 0; //@line 3955
   $54 = $53; //@line 3956
   HEAP32[$54 >> 2] = $7; //@line 3957
   $55 = $ReallocAsyncCtx3 + 32 | 0; //@line 3958
   HEAP32[$55 >> 2] = $20; //@line 3959
   sp = STACKTOP; //@line 3960
   return;
  }
  $57 = ___async_retval; //@line 3964
  HEAP32[$57 >> 2] = $38; //@line 3966
  HEAP32[$57 + 4 >> 2] = tempRet0; //@line 3969
  ___async_unwind = 0; //@line 3970
  HEAP32[$ReallocAsyncCtx3 >> 2] = 86; //@line 3971
  $40 = $ReallocAsyncCtx3 + 8 | 0; //@line 3972
  $41 = $40; //@line 3973
  $42 = $41; //@line 3974
  HEAP32[$42 >> 2] = $33; //@line 3975
  $43 = $41 + 4 | 0; //@line 3976
  $44 = $43; //@line 3977
  HEAP32[$44 >> 2] = $34; //@line 3978
  $45 = $ReallocAsyncCtx3 + 16 | 0; //@line 3979
  $46 = $45; //@line 3980
  $47 = $46; //@line 3981
  HEAP32[$47 >> 2] = $11; //@line 3982
  $48 = $46 + 4 | 0; //@line 3983
  $49 = $48; //@line 3984
  HEAP32[$49 >> 2] = $14; //@line 3985
  $50 = $ReallocAsyncCtx3 + 24 | 0; //@line 3986
  $51 = $50; //@line 3987
  $52 = $51; //@line 3988
  HEAP32[$52 >> 2] = $4; //@line 3989
  $53 = $51 + 4 | 0; //@line 3990
  $54 = $53; //@line 3991
  HEAP32[$54 >> 2] = $7; //@line 3992
  $55 = $ReallocAsyncCtx3 + 32 | 0; //@line 3993
  HEAP32[$55 >> 2] = $20; //@line 3994
  sp = STACKTOP; //@line 3995
  return;
 } else {
  $ReallocAsyncCtx4 = _emscripten_realloc_async_context(32) | 0; //@line 3998
  _mbed_assert_internal(1892, 1919, 113); //@line 3999
  if (___async) {
   HEAP32[$ReallocAsyncCtx4 >> 2] = 87; //@line 4002
   $61 = $ReallocAsyncCtx4 + 8 | 0; //@line 4003
   $62 = $61; //@line 4004
   $63 = $62; //@line 4005
   HEAP32[$63 >> 2] = $11; //@line 4006
   $64 = $62 + 4 | 0; //@line 4007
   $65 = $64; //@line 4008
   HEAP32[$65 >> 2] = $14; //@line 4009
   $66 = $ReallocAsyncCtx4 + 16 | 0; //@line 4010
   $67 = $66; //@line 4011
   $68 = $67; //@line 4012
   HEAP32[$68 >> 2] = $4; //@line 4013
   $69 = $67 + 4 | 0; //@line 4014
   $70 = $69; //@line 4015
   HEAP32[$70 >> 2] = $7; //@line 4016
   $71 = $ReallocAsyncCtx4 + 24 | 0; //@line 4017
   HEAP32[$71 >> 2] = $20; //@line 4018
   sp = STACKTOP; //@line 4019
   return;
  }
  ___async_unwind = 0; //@line 4022
  HEAP32[$ReallocAsyncCtx4 >> 2] = 87; //@line 4023
  $61 = $ReallocAsyncCtx4 + 8 | 0; //@line 4024
  $62 = $61; //@line 4025
  $63 = $62; //@line 4026
  HEAP32[$63 >> 2] = $11; //@line 4027
  $64 = $62 + 4 | 0; //@line 4028
  $65 = $64; //@line 4029
  HEAP32[$65 >> 2] = $14; //@line 4030
  $66 = $ReallocAsyncCtx4 + 16 | 0; //@line 4031
  $67 = $66; //@line 4032
  $68 = $67; //@line 4033
  HEAP32[$68 >> 2] = $4; //@line 4034
  $69 = $67 + 4 | 0; //@line 4035
  $70 = $69; //@line 4036
  HEAP32[$70 >> 2] = $7; //@line 4037
  $71 = $ReallocAsyncCtx4 + 24 | 0; //@line 4038
  HEAP32[$71 >> 2] = $20; //@line 4039
  sp = STACKTOP; //@line 4040
  return;
 }
}
function __ZN20SimulatorBlockDevice5eraseEyy__async_cb($0) {
 $0 = $0 | 0;
 var $11 = 0, $13 = 0, $15 = 0, $18 = 0, $2 = 0, $20 = 0, $22 = 0, $28 = 0, $35 = 0, $36 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $50 = 0, $52 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0, $7 = 0, $9 = 0, $ReallocAsyncCtx2 = 0, $ReallocAsyncCtx4 = 0, sp = 0;
 sp = STACKTOP; //@line 3742
 $2 = $0 + 8 | 0; //@line 3744
 $4 = HEAP32[$2 >> 2] | 0; //@line 3746
 $7 = HEAP32[$2 + 4 >> 2] | 0; //@line 3749
 $9 = HEAP32[$0 + 16 >> 2] | 0; //@line 3751
 $11 = HEAP32[$0 + 20 >> 2] | 0; //@line 3753
 $13 = $0 + 24 | 0; //@line 3755
 $15 = HEAP32[$13 >> 2] | 0; //@line 3757
 $18 = HEAP32[$13 + 4 >> 2] | 0; //@line 3760
 $20 = HEAP32[$0 + 32 >> 2] | 0; //@line 3762
 $22 = ___async_retval; //@line 3764
 $28 = ___uremdi3($4 | 0, $7 | 0, HEAP32[$22 >> 2] | 0, HEAP32[$22 + 4 >> 2] | 0) | 0; //@line 3770
 if (($28 | 0) == 0 & (tempRet0 | 0) == 0) {
  $35 = HEAP32[(HEAP32[$9 >> 2] | 0) + 44 >> 2] | 0; //@line 3778
  $ReallocAsyncCtx2 = _emscripten_realloc_async_context(40) | 0; //@line 3779
  $36 = FUNCTION_TABLE_ii[$35 & 15]($11) | 0; //@line 3780
  if (___async) {
   HEAP32[$ReallocAsyncCtx2 >> 2] = 85; //@line 3784
   $38 = $ReallocAsyncCtx2 + 8 | 0; //@line 3785
   $39 = $38; //@line 3786
   $40 = $39; //@line 3787
   HEAP32[$40 >> 2] = $15; //@line 3788
   $41 = $39 + 4 | 0; //@line 3789
   $42 = $41; //@line 3790
   HEAP32[$42 >> 2] = $18; //@line 3791
   $43 = $ReallocAsyncCtx2 + 16 | 0; //@line 3792
   $44 = $43; //@line 3793
   $45 = $44; //@line 3794
   HEAP32[$45 >> 2] = $4; //@line 3795
   $46 = $44 + 4 | 0; //@line 3796
   $47 = $46; //@line 3797
   HEAP32[$47 >> 2] = $7; //@line 3798
   $48 = $ReallocAsyncCtx2 + 24 | 0; //@line 3799
   HEAP32[$48 >> 2] = $9; //@line 3800
   $49 = $ReallocAsyncCtx2 + 28 | 0; //@line 3801
   HEAP32[$49 >> 2] = $11; //@line 3802
   $50 = $ReallocAsyncCtx2 + 32 | 0; //@line 3803
   HEAP32[$50 >> 2] = $20; //@line 3804
   sp = STACKTOP; //@line 3805
   return;
  }
  $52 = ___async_retval; //@line 3809
  HEAP32[$52 >> 2] = $36; //@line 3811
  HEAP32[$52 + 4 >> 2] = tempRet0; //@line 3814
  ___async_unwind = 0; //@line 3815
  HEAP32[$ReallocAsyncCtx2 >> 2] = 85; //@line 3816
  $38 = $ReallocAsyncCtx2 + 8 | 0; //@line 3817
  $39 = $38; //@line 3818
  $40 = $39; //@line 3819
  HEAP32[$40 >> 2] = $15; //@line 3820
  $41 = $39 + 4 | 0; //@line 3821
  $42 = $41; //@line 3822
  HEAP32[$42 >> 2] = $18; //@line 3823
  $43 = $ReallocAsyncCtx2 + 16 | 0; //@line 3824
  $44 = $43; //@line 3825
  $45 = $44; //@line 3826
  HEAP32[$45 >> 2] = $4; //@line 3827
  $46 = $44 + 4 | 0; //@line 3828
  $47 = $46; //@line 3829
  HEAP32[$47 >> 2] = $7; //@line 3830
  $48 = $ReallocAsyncCtx2 + 24 | 0; //@line 3831
  HEAP32[$48 >> 2] = $9; //@line 3832
  $49 = $ReallocAsyncCtx2 + 28 | 0; //@line 3833
  HEAP32[$49 >> 2] = $11; //@line 3834
  $50 = $ReallocAsyncCtx2 + 32 | 0; //@line 3835
  HEAP32[$50 >> 2] = $20; //@line 3836
  sp = STACKTOP; //@line 3837
  return;
 } else {
  $ReallocAsyncCtx4 = _emscripten_realloc_async_context(32) | 0; //@line 3840
  _mbed_assert_internal(1892, 1919, 113); //@line 3841
  if (___async) {
   HEAP32[$ReallocAsyncCtx4 >> 2] = 87; //@line 3844
   $56 = $ReallocAsyncCtx4 + 8 | 0; //@line 3845
   $57 = $56; //@line 3846
   $58 = $57; //@line 3847
   HEAP32[$58 >> 2] = $4; //@line 3848
   $59 = $57 + 4 | 0; //@line 3849
   $60 = $59; //@line 3850
   HEAP32[$60 >> 2] = $7; //@line 3851
   $61 = $ReallocAsyncCtx4 + 16 | 0; //@line 3852
   $62 = $61; //@line 3853
   $63 = $62; //@line 3854
   HEAP32[$63 >> 2] = $15; //@line 3855
   $64 = $62 + 4 | 0; //@line 3856
   $65 = $64; //@line 3857
   HEAP32[$65 >> 2] = $18; //@line 3858
   $66 = $ReallocAsyncCtx4 + 24 | 0; //@line 3859
   HEAP32[$66 >> 2] = $20; //@line 3860
   sp = STACKTOP; //@line 3861
   return;
  }
  ___async_unwind = 0; //@line 3864
  HEAP32[$ReallocAsyncCtx4 >> 2] = 87; //@line 3865
  $56 = $ReallocAsyncCtx4 + 8 | 0; //@line 3866
  $57 = $56; //@line 3867
  $58 = $57; //@line 3868
  HEAP32[$58 >> 2] = $4; //@line 3869
  $59 = $57 + 4 | 0; //@line 3870
  $60 = $59; //@line 3871
  HEAP32[$60 >> 2] = $7; //@line 3872
  $61 = $ReallocAsyncCtx4 + 16 | 0; //@line 3873
  $62 = $61; //@line 3874
  $63 = $62; //@line 3875
  HEAP32[$63 >> 2] = $15; //@line 3876
  $64 = $62 + 4 | 0; //@line 3877
  $65 = $64; //@line 3878
  HEAP32[$65 >> 2] = $18; //@line 3879
  $66 = $ReallocAsyncCtx4 + 24 | 0; //@line 3880
  HEAP32[$66 >> 2] = $20; //@line 3881
  sp = STACKTOP; //@line 3882
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
 sp = STACKTOP; //@line 3381
 $8 = HEAP32[(HEAP32[$0 >> 2] | 0) + 40 >> 2] | 0; //@line 3384
 $AsyncCtx = _emscripten_alloc_async_context(40, sp) | 0; //@line 3385
 $9 = FUNCTION_TABLE_ii[$8 & 15]($0) | 0; //@line 3386
 $10 = tempRet0; //@line 3387
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 80; //@line 3390
  $12 = $AsyncCtx + 8 | 0; //@line 3392
  HEAP32[$12 >> 2] = $2; //@line 3394
  HEAP32[$12 + 4 >> 2] = $3; //@line 3397
  HEAP32[$AsyncCtx + 16 >> 2] = $0; //@line 3399
  HEAP32[$AsyncCtx + 20 >> 2] = $0; //@line 3401
  $19 = $AsyncCtx + 24 | 0; //@line 3403
  HEAP32[$19 >> 2] = $4; //@line 3405
  HEAP32[$19 + 4 >> 2] = $5; //@line 3408
  HEAP32[$AsyncCtx + 32 >> 2] = $0; //@line 3410
  HEAP32[$AsyncCtx + 36 >> 2] = $1; //@line 3412
  sp = STACKTOP; //@line 3413
  return 0; //@line 3414
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 3416
 $25 = ___uremdi3($2 | 0, $3 | 0, $9 | 0, $10 | 0) | 0; //@line 3417
 if (($25 | 0) == 0 & (tempRet0 | 0) == 0) {
  $32 = HEAP32[(HEAP32[$0 >> 2] | 0) + 40 >> 2] | 0; //@line 3425
  $AsyncCtx3 = _emscripten_alloc_async_context(40, sp) | 0; //@line 3426
  $33 = FUNCTION_TABLE_ii[$32 & 15]($0) | 0; //@line 3427
  $34 = tempRet0; //@line 3428
  if (___async) {
   HEAP32[$AsyncCtx3 >> 2] = 81; //@line 3431
   $36 = $AsyncCtx3 + 8 | 0; //@line 3433
   HEAP32[$36 >> 2] = $4; //@line 3435
   HEAP32[$36 + 4 >> 2] = $5; //@line 3438
   $41 = $AsyncCtx3 + 16 | 0; //@line 3440
   HEAP32[$41 >> 2] = $2; //@line 3442
   HEAP32[$41 + 4 >> 2] = $3; //@line 3445
   HEAP32[$AsyncCtx3 + 24 >> 2] = $0; //@line 3447
   HEAP32[$AsyncCtx3 + 28 >> 2] = $0; //@line 3449
   HEAP32[$AsyncCtx3 + 32 >> 2] = $0; //@line 3451
   HEAP32[$AsyncCtx3 + 36 >> 2] = $1; //@line 3453
   sp = STACKTOP; //@line 3454
   return 0; //@line 3455
  }
  _emscripten_free_async_context($AsyncCtx3 | 0); //@line 3457
  $49 = ___uremdi3($4 | 0, $5 | 0, $33 | 0, $34 | 0) | 0; //@line 3458
  if (($49 | 0) == 0 & (tempRet0 | 0) == 0) {
   $54 = _i64Add($4 | 0, $5 | 0, $2 | 0, $3 | 0) | 0; //@line 3464
   $55 = tempRet0; //@line 3465
   $58 = HEAP32[(HEAP32[$0 >> 2] | 0) + 56 >> 2] | 0; //@line 3468
   $AsyncCtx6 = _emscripten_alloc_async_context(40, sp) | 0; //@line 3469
   $59 = FUNCTION_TABLE_ii[$58 & 15]($0) | 0; //@line 3470
   $60 = tempRet0; //@line 3471
   if (___async) {
    HEAP32[$AsyncCtx6 >> 2] = 82; //@line 3474
    $62 = $AsyncCtx6 + 8 | 0; //@line 3476
    HEAP32[$62 >> 2] = $54; //@line 3478
    HEAP32[$62 + 4 >> 2] = $55; //@line 3481
    $67 = $AsyncCtx6 + 16 | 0; //@line 3483
    HEAP32[$67 >> 2] = $2; //@line 3485
    HEAP32[$67 + 4 >> 2] = $3; //@line 3488
    $72 = $AsyncCtx6 + 24 | 0; //@line 3490
    HEAP32[$72 >> 2] = $4; //@line 3492
    HEAP32[$72 + 4 >> 2] = $5; //@line 3495
    HEAP32[$AsyncCtx6 + 32 >> 2] = $0; //@line 3497
    HEAP32[$AsyncCtx6 + 36 >> 2] = $1; //@line 3499
    sp = STACKTOP; //@line 3500
    return 0; //@line 3501
   }
   _emscripten_free_async_context($AsyncCtx6 | 0); //@line 3503
   if (!($55 >>> 0 > $60 >>> 0 | ($55 | 0) == ($60 | 0) & $54 >>> 0 > $59 >>> 0)) {
    $95 = $0 + 4 | 0; //@line 3510
    $96 = HEAP32[$95 >> 2] | 0; //@line 3511
    $97 = _emscripten_asm_const_iiiii(10, $96 | 0, $1 | 0, $2 | 0, $4 | 0) | 0; //@line 3512
    return 0; //@line 3513
   }
  }
 }
 $AsyncCtx9 = _emscripten_alloc_async_context(32, sp) | 0; //@line 3517
 _mbed_assert_internal(2086, 1919, 98); //@line 3518
 if (___async) {
  HEAP32[$AsyncCtx9 >> 2] = 83; //@line 3521
  $84 = $AsyncCtx9 + 8 | 0; //@line 3523
  HEAP32[$84 >> 2] = $2; //@line 3525
  HEAP32[$84 + 4 >> 2] = $3; //@line 3528
  $89 = $AsyncCtx9 + 16 | 0; //@line 3530
  HEAP32[$89 >> 2] = $4; //@line 3532
  HEAP32[$89 + 4 >> 2] = $5; //@line 3535
  HEAP32[$AsyncCtx9 + 24 >> 2] = $0; //@line 3537
  HEAP32[$AsyncCtx9 + 28 >> 2] = $1; //@line 3539
  sp = STACKTOP; //@line 3540
  return 0; //@line 3541
 }
 _emscripten_free_async_context($AsyncCtx9 | 0); //@line 3543
 $95 = $0 + 4 | 0; //@line 3544
 $96 = HEAP32[$95 >> 2] | 0; //@line 3545
 $97 = _emscripten_asm_const_iiiii(10, $96 | 0, $1 | 0, $2 | 0, $4 | 0) | 0; //@line 3546
 return 0; //@line 3547
}
function __ZN20SimulatorBlockDevice4readEPvyy($0, $1, $2, $3, $4, $5) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 $5 = $5 | 0;
 var $10 = 0, $12 = 0, $19 = 0, $25 = 0, $32 = 0, $33 = 0, $34 = 0, $36 = 0, $41 = 0, $49 = 0, $54 = 0, $55 = 0, $58 = 0, $59 = 0, $60 = 0, $62 = 0, $67 = 0, $72 = 0, $8 = 0, $84 = 0, $89 = 0, $9 = 0, $95 = 0, $96 = 0, $97 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, $AsyncCtx6 = 0, $AsyncCtx9 = 0, sp = 0;
 sp = STACKTOP; //@line 3200
 $8 = HEAP32[(HEAP32[$0 >> 2] | 0) + 36 >> 2] | 0; //@line 3203
 $AsyncCtx = _emscripten_alloc_async_context(40, sp) | 0; //@line 3204
 $9 = FUNCTION_TABLE_ii[$8 & 15]($0) | 0; //@line 3205
 $10 = tempRet0; //@line 3206
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 76; //@line 3209
  $12 = $AsyncCtx + 8 | 0; //@line 3211
  HEAP32[$12 >> 2] = $2; //@line 3213
  HEAP32[$12 + 4 >> 2] = $3; //@line 3216
  HEAP32[$AsyncCtx + 16 >> 2] = $0; //@line 3218
  HEAP32[$AsyncCtx + 20 >> 2] = $0; //@line 3220
  $19 = $AsyncCtx + 24 | 0; //@line 3222
  HEAP32[$19 >> 2] = $4; //@line 3224
  HEAP32[$19 + 4 >> 2] = $5; //@line 3227
  HEAP32[$AsyncCtx + 32 >> 2] = $0; //@line 3229
  HEAP32[$AsyncCtx + 36 >> 2] = $1; //@line 3231
  sp = STACKTOP; //@line 3232
  return 0; //@line 3233
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 3235
 $25 = ___uremdi3($2 | 0, $3 | 0, $9 | 0, $10 | 0) | 0; //@line 3236
 if (($25 | 0) == 0 & (tempRet0 | 0) == 0) {
  $32 = HEAP32[(HEAP32[$0 >> 2] | 0) + 36 >> 2] | 0; //@line 3244
  $AsyncCtx3 = _emscripten_alloc_async_context(40, sp) | 0; //@line 3245
  $33 = FUNCTION_TABLE_ii[$32 & 15]($0) | 0; //@line 3246
  $34 = tempRet0; //@line 3247
  if (___async) {
   HEAP32[$AsyncCtx3 >> 2] = 77; //@line 3250
   $36 = $AsyncCtx3 + 8 | 0; //@line 3252
   HEAP32[$36 >> 2] = $4; //@line 3254
   HEAP32[$36 + 4 >> 2] = $5; //@line 3257
   $41 = $AsyncCtx3 + 16 | 0; //@line 3259
   HEAP32[$41 >> 2] = $2; //@line 3261
   HEAP32[$41 + 4 >> 2] = $3; //@line 3264
   HEAP32[$AsyncCtx3 + 24 >> 2] = $0; //@line 3266
   HEAP32[$AsyncCtx3 + 28 >> 2] = $0; //@line 3268
   HEAP32[$AsyncCtx3 + 32 >> 2] = $0; //@line 3270
   HEAP32[$AsyncCtx3 + 36 >> 2] = $1; //@line 3272
   sp = STACKTOP; //@line 3273
   return 0; //@line 3274
  }
  _emscripten_free_async_context($AsyncCtx3 | 0); //@line 3276
  $49 = ___uremdi3($4 | 0, $5 | 0, $33 | 0, $34 | 0) | 0; //@line 3277
  if (($49 | 0) == 0 & (tempRet0 | 0) == 0) {
   $54 = _i64Add($4 | 0, $5 | 0, $2 | 0, $3 | 0) | 0; //@line 3283
   $55 = tempRet0; //@line 3284
   $58 = HEAP32[(HEAP32[$0 >> 2] | 0) + 56 >> 2] | 0; //@line 3287
   $AsyncCtx6 = _emscripten_alloc_async_context(40, sp) | 0; //@line 3288
   $59 = FUNCTION_TABLE_ii[$58 & 15]($0) | 0; //@line 3289
   $60 = tempRet0; //@line 3290
   if (___async) {
    HEAP32[$AsyncCtx6 >> 2] = 78; //@line 3293
    $62 = $AsyncCtx6 + 8 | 0; //@line 3295
    HEAP32[$62 >> 2] = $54; //@line 3297
    HEAP32[$62 + 4 >> 2] = $55; //@line 3300
    $67 = $AsyncCtx6 + 16 | 0; //@line 3302
    HEAP32[$67 >> 2] = $2; //@line 3304
    HEAP32[$67 + 4 >> 2] = $3; //@line 3307
    $72 = $AsyncCtx6 + 24 | 0; //@line 3309
    HEAP32[$72 >> 2] = $4; //@line 3311
    HEAP32[$72 + 4 >> 2] = $5; //@line 3314
    HEAP32[$AsyncCtx6 + 32 >> 2] = $0; //@line 3316
    HEAP32[$AsyncCtx6 + 36 >> 2] = $1; //@line 3318
    sp = STACKTOP; //@line 3319
    return 0; //@line 3320
   }
   _emscripten_free_async_context($AsyncCtx6 | 0); //@line 3322
   if (!($55 >>> 0 > $60 >>> 0 | ($55 | 0) == ($60 | 0) & $54 >>> 0 > $59 >>> 0)) {
    $95 = $0 + 4 | 0; //@line 3329
    $96 = HEAP32[$95 >> 2] | 0; //@line 3330
    $97 = _emscripten_asm_const_iiiii(9, $96 | 0, $1 | 0, $2 | 0, $4 | 0) | 0; //@line 3331
    return 0; //@line 3332
   }
  }
 }
 $AsyncCtx9 = _emscripten_alloc_async_context(32, sp) | 0; //@line 3336
 _mbed_assert_internal(2192, 1919, 83); //@line 3337
 if (___async) {
  HEAP32[$AsyncCtx9 >> 2] = 79; //@line 3340
  $84 = $AsyncCtx9 + 8 | 0; //@line 3342
  HEAP32[$84 >> 2] = $2; //@line 3344
  HEAP32[$84 + 4 >> 2] = $3; //@line 3347
  $89 = $AsyncCtx9 + 16 | 0; //@line 3349
  HEAP32[$89 >> 2] = $4; //@line 3351
  HEAP32[$89 + 4 >> 2] = $5; //@line 3354
  HEAP32[$AsyncCtx9 + 24 >> 2] = $0; //@line 3356
  HEAP32[$AsyncCtx9 + 28 >> 2] = $1; //@line 3358
  sp = STACKTOP; //@line 3359
  return 0; //@line 3360
 }
 _emscripten_free_async_context($AsyncCtx9 | 0); //@line 3362
 $95 = $0 + 4 | 0; //@line 3363
 $96 = HEAP32[$95 >> 2] | 0; //@line 3364
 $97 = _emscripten_asm_const_iiiii(9, $96 | 0, $1 | 0, $2 | 0, $4 | 0) | 0; //@line 3365
 return 0; //@line 3366
}
function __ZN20SimulatorBlockDevice5eraseEyy($0, $1, $2, $3, $4) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 var $11 = 0, $18 = 0, $23 = 0, $30 = 0, $31 = 0, $32 = 0, $34 = 0, $39 = 0, $46 = 0, $51 = 0, $52 = 0, $55 = 0, $56 = 0, $57 = 0, $59 = 0, $64 = 0, $69 = 0, $7 = 0, $8 = 0, $80 = 0, $85 = 0, $9 = 0, $90 = 0, $91 = 0, $92 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, $AsyncCtx6 = 0, $AsyncCtx9 = 0, sp = 0;
 sp = STACKTOP; //@line 3560
 $7 = HEAP32[(HEAP32[$0 >> 2] | 0) + 44 >> 2] | 0; //@line 3563
 $AsyncCtx = _emscripten_alloc_async_context(40, sp) | 0; //@line 3564
 $8 = FUNCTION_TABLE_ii[$7 & 15]($0) | 0; //@line 3565
 $9 = tempRet0; //@line 3566
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 84; //@line 3569
  $11 = $AsyncCtx + 8 | 0; //@line 3571
  HEAP32[$11 >> 2] = $1; //@line 3573
  HEAP32[$11 + 4 >> 2] = $2; //@line 3576
  HEAP32[$AsyncCtx + 16 >> 2] = $0; //@line 3578
  HEAP32[$AsyncCtx + 20 >> 2] = $0; //@line 3580
  $18 = $AsyncCtx + 24 | 0; //@line 3582
  HEAP32[$18 >> 2] = $3; //@line 3584
  HEAP32[$18 + 4 >> 2] = $4; //@line 3587
  HEAP32[$AsyncCtx + 32 >> 2] = $0; //@line 3589
  sp = STACKTOP; //@line 3590
  return 0; //@line 3591
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 3593
 $23 = ___uremdi3($1 | 0, $2 | 0, $8 | 0, $9 | 0) | 0; //@line 3594
 if (($23 | 0) == 0 & (tempRet0 | 0) == 0) {
  $30 = HEAP32[(HEAP32[$0 >> 2] | 0) + 44 >> 2] | 0; //@line 3602
  $AsyncCtx3 = _emscripten_alloc_async_context(40, sp) | 0; //@line 3603
  $31 = FUNCTION_TABLE_ii[$30 & 15]($0) | 0; //@line 3604
  $32 = tempRet0; //@line 3605
  if (___async) {
   HEAP32[$AsyncCtx3 >> 2] = 85; //@line 3608
   $34 = $AsyncCtx3 + 8 | 0; //@line 3610
   HEAP32[$34 >> 2] = $3; //@line 3612
   HEAP32[$34 + 4 >> 2] = $4; //@line 3615
   $39 = $AsyncCtx3 + 16 | 0; //@line 3617
   HEAP32[$39 >> 2] = $1; //@line 3619
   HEAP32[$39 + 4 >> 2] = $2; //@line 3622
   HEAP32[$AsyncCtx3 + 24 >> 2] = $0; //@line 3624
   HEAP32[$AsyncCtx3 + 28 >> 2] = $0; //@line 3626
   HEAP32[$AsyncCtx3 + 32 >> 2] = $0; //@line 3628
   sp = STACKTOP; //@line 3629
   return 0; //@line 3630
  }
  _emscripten_free_async_context($AsyncCtx3 | 0); //@line 3632
  $46 = ___uremdi3($3 | 0, $4 | 0, $31 | 0, $32 | 0) | 0; //@line 3633
  if (($46 | 0) == 0 & (tempRet0 | 0) == 0) {
   $51 = _i64Add($3 | 0, $4 | 0, $1 | 0, $2 | 0) | 0; //@line 3639
   $52 = tempRet0; //@line 3640
   $55 = HEAP32[(HEAP32[$0 >> 2] | 0) + 56 >> 2] | 0; //@line 3643
   $AsyncCtx6 = _emscripten_alloc_async_context(40, sp) | 0; //@line 3644
   $56 = FUNCTION_TABLE_ii[$55 & 15]($0) | 0; //@line 3645
   $57 = tempRet0; //@line 3646
   if (___async) {
    HEAP32[$AsyncCtx6 >> 2] = 86; //@line 3649
    $59 = $AsyncCtx6 + 8 | 0; //@line 3651
    HEAP32[$59 >> 2] = $51; //@line 3653
    HEAP32[$59 + 4 >> 2] = $52; //@line 3656
    $64 = $AsyncCtx6 + 16 | 0; //@line 3658
    HEAP32[$64 >> 2] = $1; //@line 3660
    HEAP32[$64 + 4 >> 2] = $2; //@line 3663
    $69 = $AsyncCtx6 + 24 | 0; //@line 3665
    HEAP32[$69 >> 2] = $3; //@line 3667
    HEAP32[$69 + 4 >> 2] = $4; //@line 3670
    HEAP32[$AsyncCtx6 + 32 >> 2] = $0; //@line 3672
    sp = STACKTOP; //@line 3673
    return 0; //@line 3674
   }
   _emscripten_free_async_context($AsyncCtx6 | 0); //@line 3676
   if (!($52 >>> 0 > $57 >>> 0 | ($52 | 0) == ($57 | 0) & $51 >>> 0 > $56 >>> 0)) {
    $90 = $0 + 4 | 0; //@line 3683
    $91 = HEAP32[$90 >> 2] | 0; //@line 3684
    $92 = _emscripten_asm_const_iiii(11, $91 | 0, $1 | 0, $3 | 0) | 0; //@line 3685
    return 0; //@line 3686
   }
  }
 }
 $AsyncCtx9 = _emscripten_alloc_async_context(32, sp) | 0; //@line 3690
 _mbed_assert_internal(1892, 1919, 113); //@line 3691
 if (___async) {
  HEAP32[$AsyncCtx9 >> 2] = 87; //@line 3694
  $80 = $AsyncCtx9 + 8 | 0; //@line 3696
  HEAP32[$80 >> 2] = $1; //@line 3698
  HEAP32[$80 + 4 >> 2] = $2; //@line 3701
  $85 = $AsyncCtx9 + 16 | 0; //@line 3703
  HEAP32[$85 >> 2] = $3; //@line 3705
  HEAP32[$85 + 4 >> 2] = $4; //@line 3708
  HEAP32[$AsyncCtx9 + 24 >> 2] = $0; //@line 3710
  sp = STACKTOP; //@line 3711
  return 0; //@line 3712
 }
 _emscripten_free_async_context($AsyncCtx9 | 0); //@line 3714
 $90 = $0 + 4 | 0; //@line 3715
 $91 = HEAP32[$90 >> 2] | 0; //@line 3716
 $92 = _emscripten_asm_const_iiii(11, $91 | 0, $1 | 0, $3 | 0) | 0; //@line 3717
 return 0; //@line 3718
}
function __ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_15($0) {
 $0 = $0 | 0;
 var $$085$off0$reg2mem$0 = 0, $$182$off0 = 0, $$186$off0 = 0, $$283$off0 = 0, $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $2 = 0, $20 = 0, $22 = 0, $24 = 0, $26 = 0, $28 = 0, $30 = 0, $4 = 0, $59 = 0, $6 = 0, $67 = 0, $8 = 0, $ReallocAsyncCtx5 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 2393
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 2395
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 2397
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 2399
 $8 = HEAP8[$0 + 16 >> 0] & 1; //@line 2402
 $10 = HEAP8[$0 + 17 >> 0] & 1; //@line 2405
 $12 = HEAP32[$0 + 20 >> 2] | 0; //@line 2407
 $14 = HEAP32[$0 + 24 >> 2] | 0; //@line 2409
 $16 = HEAP32[$0 + 28 >> 2] | 0; //@line 2411
 $18 = HEAP32[$0 + 32 >> 2] | 0; //@line 2413
 $20 = HEAP32[$0 + 36 >> 2] | 0; //@line 2415
 $22 = HEAP32[$0 + 40 >> 2] | 0; //@line 2417
 $24 = HEAP32[$0 + 44 >> 2] | 0; //@line 2419
 $26 = HEAP8[$0 + 48 >> 0] & 1; //@line 2422
 $28 = HEAP32[$0 + 52 >> 2] | 0; //@line 2424
 L2 : do {
  if (!(HEAP8[$4 >> 0] | 0)) {
   do {
    if (!(HEAP8[$24 >> 0] | 0)) {
     $$182$off0 = $10; //@line 2433
     $$186$off0 = $8; //@line 2433
    } else {
     if (!(HEAP8[$22 >> 0] | 0)) {
      if (!(HEAP32[$6 >> 2] & 1)) {
       $$085$off0$reg2mem$0 = $8; //@line 2442
       $$283$off0 = 1; //@line 2442
       label = 13; //@line 2443
       break L2;
      } else {
       $$182$off0 = 1; //@line 2446
       $$186$off0 = $8; //@line 2446
       break;
      }
     }
     if ((HEAP32[$14 >> 2] | 0) == 1) {
      label = 18; //@line 2453
      break L2;
     }
     if (!(HEAP32[$6 >> 2] & 2)) {
      label = 18; //@line 2460
      break L2;
     } else {
      $$182$off0 = 1; //@line 2463
      $$186$off0 = 1; //@line 2463
     }
    }
   } while (0);
   $30 = $12 + 8 | 0; //@line 2467
   if ($30 >>> 0 < $28 >>> 0) {
    HEAP8[$22 >> 0] = 0; //@line 2470
    HEAP8[$24 >> 0] = 0; //@line 2471
    $ReallocAsyncCtx5 = _emscripten_realloc_async_context(56) | 0; //@line 2472
    __ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($30, $20, $16, $16, 1, $26); //@line 2473
    if (!___async) {
     ___async_unwind = 0; //@line 2476
    }
    HEAP32[$ReallocAsyncCtx5 >> 2] = 144; //@line 2478
    HEAP32[$ReallocAsyncCtx5 + 4 >> 2] = $2; //@line 2480
    HEAP32[$ReallocAsyncCtx5 + 8 >> 2] = $4; //@line 2482
    HEAP32[$ReallocAsyncCtx5 + 12 >> 2] = $6; //@line 2484
    HEAP8[$ReallocAsyncCtx5 + 16 >> 0] = $$186$off0 & 1; //@line 2487
    HEAP8[$ReallocAsyncCtx5 + 17 >> 0] = $$182$off0 & 1; //@line 2490
    HEAP32[$ReallocAsyncCtx5 + 20 >> 2] = $30; //@line 2492
    HEAP32[$ReallocAsyncCtx5 + 24 >> 2] = $14; //@line 2494
    HEAP32[$ReallocAsyncCtx5 + 28 >> 2] = $16; //@line 2496
    HEAP32[$ReallocAsyncCtx5 + 32 >> 2] = $18; //@line 2498
    HEAP32[$ReallocAsyncCtx5 + 36 >> 2] = $20; //@line 2500
    HEAP32[$ReallocAsyncCtx5 + 40 >> 2] = $22; //@line 2502
    HEAP32[$ReallocAsyncCtx5 + 44 >> 2] = $24; //@line 2504
    HEAP8[$ReallocAsyncCtx5 + 48 >> 0] = $26 & 1; //@line 2507
    HEAP32[$ReallocAsyncCtx5 + 52 >> 2] = $28; //@line 2509
    sp = STACKTOP; //@line 2510
    return;
   } else {
    $$085$off0$reg2mem$0 = $$186$off0; //@line 2513
    $$283$off0 = $$182$off0; //@line 2513
    label = 13; //@line 2514
   }
  } else {
   $$085$off0$reg2mem$0 = $8; //@line 2517
   $$283$off0 = $10; //@line 2517
   label = 13; //@line 2518
  }
 } while (0);
 do {
  if ((label | 0) == 13) {
   if (!$$085$off0$reg2mem$0) {
    HEAP32[$18 >> 2] = $16; //@line 2524
    $59 = $20 + 40 | 0; //@line 2525
    HEAP32[$59 >> 2] = (HEAP32[$59 >> 2] | 0) + 1; //@line 2528
    if ((HEAP32[$20 + 36 >> 2] | 0) == 1) {
     if ((HEAP32[$14 >> 2] | 0) == 2) {
      HEAP8[$4 >> 0] = 1; //@line 2536
      if ($$283$off0) {
       label = 18; //@line 2538
       break;
      } else {
       $67 = 4; //@line 2541
       break;
      }
     }
    }
   }
   if ($$283$off0) {
    label = 18; //@line 2548
   } else {
    $67 = 4; //@line 2550
   }
  }
 } while (0);
 if ((label | 0) == 18) {
  $67 = 3; //@line 2555
 }
 HEAP32[$2 >> 2] = $67; //@line 2557
 return;
}
function __ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_14($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $15 = 0, $18 = 0, $2 = 0, $21 = 0, $24 = 0, $36 = 0, $37 = 0, $38 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx = 0, $ReallocAsyncCtx2 = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 2237
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 2239
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 2241
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 2243
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 2245
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 2247
 $12 = HEAP8[$0 + 24 >> 0] & 1; //@line 2250
 $15 = $6 + 24 | 0; //@line 2253
 do {
  if ((HEAP32[$0 + 28 >> 2] | 0) > 1) {
   $18 = HEAP32[$6 + 8 >> 2] | 0; //@line 2258
   if (!($18 & 2)) {
    $21 = $4 + 36 | 0; //@line 2262
    if ((HEAP32[$21 >> 2] | 0) != 1) {
     if (!($18 & 1)) {
      $38 = $4 + 54 | 0; //@line 2269
      if (HEAP8[$38 >> 0] | 0) {
       break;
      }
      if ((HEAP32[$21 >> 2] | 0) == 1) {
       break;
      }
      $ReallocAsyncCtx = _emscripten_realloc_async_context(36) | 0; //@line 2280
      __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($15, $4, $8, $10, $12); //@line 2281
      if (!___async) {
       ___async_unwind = 0; //@line 2284
      }
      HEAP32[$ReallocAsyncCtx >> 2] = 148; //@line 2286
      HEAP32[$ReallocAsyncCtx + 4 >> 2] = $15; //@line 2288
      HEAP32[$ReallocAsyncCtx + 8 >> 2] = $2; //@line 2290
      HEAP32[$ReallocAsyncCtx + 12 >> 2] = $38; //@line 2292
      HEAP32[$ReallocAsyncCtx + 16 >> 2] = $21; //@line 2294
      HEAP32[$ReallocAsyncCtx + 20 >> 2] = $4; //@line 2296
      HEAP32[$ReallocAsyncCtx + 24 >> 2] = $8; //@line 2298
      HEAP32[$ReallocAsyncCtx + 28 >> 2] = $10; //@line 2300
      HEAP8[$ReallocAsyncCtx + 32 >> 0] = $12 & 1; //@line 2303
      sp = STACKTOP; //@line 2304
      return;
     }
     $36 = $4 + 24 | 0; //@line 2307
     $37 = $4 + 54 | 0; //@line 2308
     if (HEAP8[$37 >> 0] | 0) {
      break;
     }
     if ((HEAP32[$21 >> 2] | 0) == 1) {
      if ((HEAP32[$36 >> 2] | 0) == 1) {
       break;
      }
     }
     $ReallocAsyncCtx2 = _emscripten_realloc_async_context(40) | 0; //@line 2323
     __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($15, $4, $8, $10, $12); //@line 2324
     if (!___async) {
      ___async_unwind = 0; //@line 2327
     }
     HEAP32[$ReallocAsyncCtx2 >> 2] = 147; //@line 2329
     HEAP32[$ReallocAsyncCtx2 + 4 >> 2] = $15; //@line 2331
     HEAP32[$ReallocAsyncCtx2 + 8 >> 2] = $2; //@line 2333
     HEAP32[$ReallocAsyncCtx2 + 12 >> 2] = $37; //@line 2335
     HEAP32[$ReallocAsyncCtx2 + 16 >> 2] = $21; //@line 2337
     HEAP32[$ReallocAsyncCtx2 + 20 >> 2] = $36; //@line 2339
     HEAP32[$ReallocAsyncCtx2 + 24 >> 2] = $4; //@line 2341
     HEAP32[$ReallocAsyncCtx2 + 28 >> 2] = $8; //@line 2343
     HEAP32[$ReallocAsyncCtx2 + 32 >> 2] = $10; //@line 2345
     HEAP8[$ReallocAsyncCtx2 + 36 >> 0] = $12 & 1; //@line 2348
     sp = STACKTOP; //@line 2349
     return;
    }
   }
   $24 = $4 + 54 | 0; //@line 2353
   if (!(HEAP8[$24 >> 0] | 0)) {
    $ReallocAsyncCtx3 = _emscripten_realloc_async_context(32) | 0; //@line 2357
    __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($15, $4, $8, $10, $12); //@line 2358
    if (!___async) {
     ___async_unwind = 0; //@line 2361
    }
    HEAP32[$ReallocAsyncCtx3 >> 2] = 146; //@line 2363
    HEAP32[$ReallocAsyncCtx3 + 4 >> 2] = $15; //@line 2365
    HEAP32[$ReallocAsyncCtx3 + 8 >> 2] = $2; //@line 2367
    HEAP32[$ReallocAsyncCtx3 + 12 >> 2] = $24; //@line 2369
    HEAP32[$ReallocAsyncCtx3 + 16 >> 2] = $4; //@line 2371
    HEAP32[$ReallocAsyncCtx3 + 20 >> 2] = $8; //@line 2373
    HEAP32[$ReallocAsyncCtx3 + 24 >> 2] = $10; //@line 2375
    HEAP8[$ReallocAsyncCtx3 + 28 >> 0] = $12 & 1; //@line 2378
    sp = STACKTOP; //@line 2379
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
      $9 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 9895
      $10 = HEAP32[$9 >> 2] | 0; //@line 9896
      HEAP32[$2 >> 2] = $9 + 4; //@line 9898
      HEAP32[$0 >> 2] = $10; //@line 9899
      break L1;
      break;
     }
    case 10:
     {
      $16 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 9915
      $17 = HEAP32[$16 >> 2] | 0; //@line 9916
      HEAP32[$2 >> 2] = $16 + 4; //@line 9918
      $20 = $0; //@line 9921
      HEAP32[$20 >> 2] = $17; //@line 9923
      HEAP32[$20 + 4 >> 2] = (($17 | 0) < 0) << 31 >> 31; //@line 9926
      break L1;
      break;
     }
    case 11:
     {
      $29 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 9942
      $30 = HEAP32[$29 >> 2] | 0; //@line 9943
      HEAP32[$2 >> 2] = $29 + 4; //@line 9945
      $31 = $0; //@line 9946
      HEAP32[$31 >> 2] = $30; //@line 9948
      HEAP32[$31 + 4 >> 2] = 0; //@line 9951
      break L1;
      break;
     }
    case 12:
     {
      $40 = (HEAP32[$2 >> 2] | 0) + (8 - 1) & ~(8 - 1); //@line 9967
      $41 = $40; //@line 9968
      $43 = HEAP32[$41 >> 2] | 0; //@line 9970
      $46 = HEAP32[$41 + 4 >> 2] | 0; //@line 9973
      HEAP32[$2 >> 2] = $40 + 8; //@line 9975
      $47 = $0; //@line 9976
      HEAP32[$47 >> 2] = $43; //@line 9978
      HEAP32[$47 + 4 >> 2] = $46; //@line 9981
      break L1;
      break;
     }
    case 13:
     {
      $56 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 9997
      $57 = HEAP32[$56 >> 2] | 0; //@line 9998
      HEAP32[$2 >> 2] = $56 + 4; //@line 10000
      $59 = ($57 & 65535) << 16 >> 16; //@line 10002
      $62 = $0; //@line 10005
      HEAP32[$62 >> 2] = $59; //@line 10007
      HEAP32[$62 + 4 >> 2] = (($59 | 0) < 0) << 31 >> 31; //@line 10010
      break L1;
      break;
     }
    case 14:
     {
      $71 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 10026
      $72 = HEAP32[$71 >> 2] | 0; //@line 10027
      HEAP32[$2 >> 2] = $71 + 4; //@line 10029
      $73 = $0; //@line 10031
      HEAP32[$73 >> 2] = $72 & 65535; //@line 10033
      HEAP32[$73 + 4 >> 2] = 0; //@line 10036
      break L1;
      break;
     }
    case 15:
     {
      $82 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 10052
      $83 = HEAP32[$82 >> 2] | 0; //@line 10053
      HEAP32[$2 >> 2] = $82 + 4; //@line 10055
      $85 = ($83 & 255) << 24 >> 24; //@line 10057
      $88 = $0; //@line 10060
      HEAP32[$88 >> 2] = $85; //@line 10062
      HEAP32[$88 + 4 >> 2] = (($85 | 0) < 0) << 31 >> 31; //@line 10065
      break L1;
      break;
     }
    case 16:
     {
      $97 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 10081
      $98 = HEAP32[$97 >> 2] | 0; //@line 10082
      HEAP32[$2 >> 2] = $97 + 4; //@line 10084
      $99 = $0; //@line 10086
      HEAP32[$99 >> 2] = $98 & 255; //@line 10088
      HEAP32[$99 + 4 >> 2] = 0; //@line 10091
      break L1;
      break;
     }
    case 17:
     {
      $108 = (HEAP32[$2 >> 2] | 0) + (8 - 1) & ~(8 - 1); //@line 10107
      $109 = +HEAPF64[$108 >> 3]; //@line 10108
      HEAP32[$2 >> 2] = $108 + 8; //@line 10110
      HEAPF64[$0 >> 3] = $109; //@line 10111
      break L1;
      break;
     }
    case 18:
     {
      $115 = (HEAP32[$2 >> 2] | 0) + (8 - 1) & ~(8 - 1); //@line 10127
      $116 = +HEAPF64[$115 >> 3]; //@line 10128
      HEAP32[$2 >> 2] = $115 + 8; //@line 10130
      HEAPF64[$0 >> 3] = $116; //@line 10131
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
 sp = STACKTOP; //@line 8795
 STACKTOP = STACKTOP + 224 | 0; //@line 8796
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(224); //@line 8796
 $3 = sp + 120 | 0; //@line 8797
 $4 = sp + 80 | 0; //@line 8798
 $5 = sp; //@line 8799
 $6 = sp + 136 | 0; //@line 8800
 dest = $4; //@line 8801
 stop = dest + 40 | 0; //@line 8801
 do {
  HEAP32[dest >> 2] = 0; //@line 8801
  dest = dest + 4 | 0; //@line 8801
 } while ((dest | 0) < (stop | 0));
 HEAP32[$3 >> 2] = HEAP32[$2 >> 2]; //@line 8803
 if ((_printf_core(0, $1, $3, $5, $4) | 0) < 0) {
  $$0 = -1; //@line 8807
 } else {
  if ((HEAP32[$0 + 76 >> 2] | 0) > -1) {
   $43 = ___lockfile($0) | 0; //@line 8814
  } else {
   $43 = 0; //@line 8816
  }
  $13 = HEAP32[$0 >> 2] | 0; //@line 8818
  $14 = $13 & 32; //@line 8819
  if ((HEAP8[$0 + 74 >> 0] | 0) < 1) {
   HEAP32[$0 >> 2] = $13 & -33; //@line 8825
  }
  $19 = $0 + 48 | 0; //@line 8827
  do {
   if (!(HEAP32[$19 >> 2] | 0)) {
    $23 = $0 + 44 | 0; //@line 8832
    $24 = HEAP32[$23 >> 2] | 0; //@line 8833
    HEAP32[$23 >> 2] = $6; //@line 8834
    $25 = $0 + 28 | 0; //@line 8835
    HEAP32[$25 >> 2] = $6; //@line 8836
    $26 = $0 + 20 | 0; //@line 8837
    HEAP32[$26 >> 2] = $6; //@line 8838
    HEAP32[$19 >> 2] = 80; //@line 8839
    $28 = $0 + 16 | 0; //@line 8841
    HEAP32[$28 >> 2] = $6 + 80; //@line 8842
    $29 = _printf_core($0, $1, $3, $5, $4) | 0; //@line 8843
    if (!$24) {
     $$1 = $29; //@line 8846
    } else {
     $32 = HEAP32[$0 + 36 >> 2] | 0; //@line 8849
     $AsyncCtx = _emscripten_alloc_async_context(64, sp) | 0; //@line 8850
     FUNCTION_TABLE_iiii[$32 & 7]($0, 0, 0) | 0; //@line 8851
     if (___async) {
      HEAP32[$AsyncCtx >> 2] = 121; //@line 8854
      HEAP32[$AsyncCtx + 4 >> 2] = $26; //@line 8856
      HEAP32[$AsyncCtx + 8 >> 2] = $29; //@line 8858
      HEAP32[$AsyncCtx + 12 >> 2] = $24; //@line 8860
      HEAP32[$AsyncCtx + 16 >> 2] = $23; //@line 8862
      HEAP32[$AsyncCtx + 20 >> 2] = $19; //@line 8864
      HEAP32[$AsyncCtx + 24 >> 2] = $28; //@line 8866
      HEAP32[$AsyncCtx + 28 >> 2] = $25; //@line 8868
      HEAP32[$AsyncCtx + 32 >> 2] = $0; //@line 8870
      HEAP32[$AsyncCtx + 36 >> 2] = $14; //@line 8872
      HEAP32[$AsyncCtx + 40 >> 2] = $43; //@line 8874
      HEAP32[$AsyncCtx + 44 >> 2] = $0; //@line 8876
      HEAP32[$AsyncCtx + 48 >> 2] = $6; //@line 8878
      HEAP32[$AsyncCtx + 52 >> 2] = $5; //@line 8880
      HEAP32[$AsyncCtx + 56 >> 2] = $4; //@line 8882
      HEAP32[$AsyncCtx + 60 >> 2] = $3; //@line 8884
      sp = STACKTOP; //@line 8885
      STACKTOP = sp; //@line 8886
      return 0; //@line 8886
     } else {
      _emscripten_free_async_context($AsyncCtx | 0); //@line 8888
      $$ = (HEAP32[$26 >> 2] | 0) == 0 ? -1 : $29; //@line 8891
      HEAP32[$23 >> 2] = $24; //@line 8892
      HEAP32[$19 >> 2] = 0; //@line 8893
      HEAP32[$28 >> 2] = 0; //@line 8894
      HEAP32[$25 >> 2] = 0; //@line 8895
      HEAP32[$26 >> 2] = 0; //@line 8896
      $$1 = $$; //@line 8897
      break;
     }
    }
   } else {
    $$1 = _printf_core($0, $1, $3, $5, $4) | 0; //@line 8903
   }
  } while (0);
  $51 = HEAP32[$0 >> 2] | 0; //@line 8906
  HEAP32[$0 >> 2] = $51 | $14; //@line 8911
  if ($43 | 0) {
   ___unlockfile($0); //@line 8914
  }
  $$0 = ($51 & 32 | 0) == 0 ? $$1 : -1; //@line 8916
 }
 STACKTOP = sp; //@line 8918
 return $$0 | 0; //@line 8918
}
function ___dynamic_cast($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $$0 = 0, $10 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $24 = 0, $30 = 0, $33 = 0, $4 = 0, $5 = 0, $8 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, dest = 0, sp = 0, stop = 0;
 sp = STACKTOP; //@line 12995
 STACKTOP = STACKTOP + 64 | 0; //@line 12996
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(64); //@line 12996
 $4 = sp; //@line 12997
 $5 = HEAP32[$0 >> 2] | 0; //@line 12998
 $8 = $0 + (HEAP32[$5 + -8 >> 2] | 0) | 0; //@line 13001
 $10 = HEAP32[$5 + -4 >> 2] | 0; //@line 13003
 HEAP32[$4 >> 2] = $2; //@line 13004
 HEAP32[$4 + 4 >> 2] = $0; //@line 13006
 HEAP32[$4 + 8 >> 2] = $1; //@line 13008
 HEAP32[$4 + 12 >> 2] = $3; //@line 13010
 $14 = $4 + 16 | 0; //@line 13011
 $15 = $4 + 20 | 0; //@line 13012
 $16 = $4 + 24 | 0; //@line 13013
 $17 = $4 + 28 | 0; //@line 13014
 $18 = $4 + 32 | 0; //@line 13015
 $19 = $4 + 40 | 0; //@line 13016
 dest = $14; //@line 13017
 stop = dest + 36 | 0; //@line 13017
 do {
  HEAP32[dest >> 2] = 0; //@line 13017
  dest = dest + 4 | 0; //@line 13017
 } while ((dest | 0) < (stop | 0));
 HEAP16[$14 + 36 >> 1] = 0; //@line 13017
 HEAP8[$14 + 38 >> 0] = 0; //@line 13017
 L1 : do {
  if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($10, $2, 0) | 0) {
   HEAP32[$4 + 48 >> 2] = 1; //@line 13022
   $24 = HEAP32[(HEAP32[$10 >> 2] | 0) + 20 >> 2] | 0; //@line 13025
   $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 13026
   FUNCTION_TABLE_viiiiii[$24 & 3]($10, $4, $8, $8, 1, 0); //@line 13027
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 134; //@line 13030
    HEAP32[$AsyncCtx + 4 >> 2] = $16; //@line 13032
    HEAP32[$AsyncCtx + 8 >> 2] = $8; //@line 13034
    HEAP32[$AsyncCtx + 12 >> 2] = $4; //@line 13036
    sp = STACKTOP; //@line 13037
    STACKTOP = sp; //@line 13038
    return 0; //@line 13038
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 13040
    $$0 = (HEAP32[$16 >> 2] | 0) == 1 ? $8 : 0; //@line 13044
    break;
   }
  } else {
   $30 = $4 + 36 | 0; //@line 13048
   $33 = HEAP32[(HEAP32[$10 >> 2] | 0) + 24 >> 2] | 0; //@line 13051
   $AsyncCtx3 = _emscripten_alloc_async_context(36, sp) | 0; //@line 13052
   FUNCTION_TABLE_viiiii[$33 & 3]($10, $4, $8, 1, 0); //@line 13053
   if (___async) {
    HEAP32[$AsyncCtx3 >> 2] = 135; //@line 13056
    HEAP32[$AsyncCtx3 + 4 >> 2] = $30; //@line 13058
    HEAP32[$AsyncCtx3 + 8 >> 2] = $4; //@line 13060
    HEAP32[$AsyncCtx3 + 12 >> 2] = $19; //@line 13062
    HEAP32[$AsyncCtx3 + 16 >> 2] = $17; //@line 13064
    HEAP32[$AsyncCtx3 + 20 >> 2] = $18; //@line 13066
    HEAP32[$AsyncCtx3 + 24 >> 2] = $15; //@line 13068
    HEAP32[$AsyncCtx3 + 28 >> 2] = $16; //@line 13070
    HEAP32[$AsyncCtx3 + 32 >> 2] = $14; //@line 13072
    sp = STACKTOP; //@line 13073
    STACKTOP = sp; //@line 13074
    return 0; //@line 13074
   }
   _emscripten_free_async_context($AsyncCtx3 | 0); //@line 13076
   switch (HEAP32[$30 >> 2] | 0) {
   case 0:
    {
     $$0 = (HEAP32[$19 >> 2] | 0) == 1 & (HEAP32[$17 >> 2] | 0) == 1 & (HEAP32[$18 >> 2] | 0) == 1 ? HEAP32[$15 >> 2] | 0 : 0; //@line 13090
     break L1;
     break;
    }
   case 1:
    {
     break;
    }
   default:
    {
     $$0 = 0; //@line 13098
     break L1;
    }
   }
   if ((HEAP32[$16 >> 2] | 0) != 1) {
    if (!((HEAP32[$19 >> 2] | 0) == 0 & (HEAP32[$17 >> 2] | 0) == 1 & (HEAP32[$18 >> 2] | 0) == 1)) {
     $$0 = 0; //@line 13114
     break;
    }
   }
   $$0 = HEAP32[$14 >> 2] | 0; //@line 13119
  }
 } while (0);
 STACKTOP = sp; //@line 13122
 return $$0 | 0; //@line 13122
}
function _memchr($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$0$lcssa = 0, $$035$lcssa = 0, $$035$lcssa65 = 0, $$03555 = 0, $$036$lcssa = 0, $$036$lcssa64 = 0, $$03654 = 0, $$046 = 0, $$137$lcssa = 0, $$13745 = 0, $$140 = 0, $$2 = 0, $$23839 = 0, $$3 = 0, $$lcssa = 0, $11 = 0, $12 = 0, $16 = 0, $18 = 0, $20 = 0, $23 = 0, $29 = 0, $3 = 0, $30 = 0, $35 = 0, $7 = 0, $8 = 0, label = 0;
 $3 = $1 & 255; //@line 8667
 $7 = ($2 | 0) != 0; //@line 8671
 L1 : do {
  if ($7 & ($0 & 3 | 0) != 0) {
   $8 = $1 & 255; //@line 8675
   $$03555 = $0; //@line 8676
   $$03654 = $2; //@line 8676
   while (1) {
    if ((HEAP8[$$03555 >> 0] | 0) == $8 << 24 >> 24) {
     $$035$lcssa65 = $$03555; //@line 8681
     $$036$lcssa64 = $$03654; //@line 8681
     label = 6; //@line 8682
     break L1;
    }
    $11 = $$03555 + 1 | 0; //@line 8685
    $12 = $$03654 + -1 | 0; //@line 8686
    $16 = ($12 | 0) != 0; //@line 8690
    if ($16 & ($11 & 3 | 0) != 0) {
     $$03555 = $11; //@line 8693
     $$03654 = $12; //@line 8693
    } else {
     $$035$lcssa = $11; //@line 8695
     $$036$lcssa = $12; //@line 8695
     $$lcssa = $16; //@line 8695
     label = 5; //@line 8696
     break;
    }
   }
  } else {
   $$035$lcssa = $0; //@line 8701
   $$036$lcssa = $2; //@line 8701
   $$lcssa = $7; //@line 8701
   label = 5; //@line 8702
  }
 } while (0);
 if ((label | 0) == 5) {
  if ($$lcssa) {
   $$035$lcssa65 = $$035$lcssa; //@line 8707
   $$036$lcssa64 = $$036$lcssa; //@line 8707
   label = 6; //@line 8708
  } else {
   $$2 = $$035$lcssa; //@line 8710
   $$3 = 0; //@line 8710
  }
 }
 L8 : do {
  if ((label | 0) == 6) {
   $18 = $1 & 255; //@line 8716
   if ((HEAP8[$$035$lcssa65 >> 0] | 0) == $18 << 24 >> 24) {
    $$2 = $$035$lcssa65; //@line 8719
    $$3 = $$036$lcssa64; //@line 8719
   } else {
    $20 = Math_imul($3, 16843009) | 0; //@line 8721
    L11 : do {
     if ($$036$lcssa64 >>> 0 > 3) {
      $$046 = $$035$lcssa65; //@line 8725
      $$13745 = $$036$lcssa64; //@line 8725
      while (1) {
       $23 = HEAP32[$$046 >> 2] ^ $20; //@line 8728
       if (($23 & -2139062144 ^ -2139062144) & $23 + -16843009 | 0) {
        break;
       }
       $29 = $$046 + 4 | 0; //@line 8737
       $30 = $$13745 + -4 | 0; //@line 8738
       if ($30 >>> 0 > 3) {
        $$046 = $29; //@line 8741
        $$13745 = $30; //@line 8741
       } else {
        $$0$lcssa = $29; //@line 8743
        $$137$lcssa = $30; //@line 8743
        label = 11; //@line 8744
        break L11;
       }
      }
      $$140 = $$046; //@line 8748
      $$23839 = $$13745; //@line 8748
     } else {
      $$0$lcssa = $$035$lcssa65; //@line 8750
      $$137$lcssa = $$036$lcssa64; //@line 8750
      label = 11; //@line 8751
     }
    } while (0);
    if ((label | 0) == 11) {
     if (!$$137$lcssa) {
      $$2 = $$0$lcssa; //@line 8757
      $$3 = 0; //@line 8757
      break;
     } else {
      $$140 = $$0$lcssa; //@line 8760
      $$23839 = $$137$lcssa; //@line 8760
     }
    }
    while (1) {
     if ((HEAP8[$$140 >> 0] | 0) == $18 << 24 >> 24) {
      $$2 = $$140; //@line 8767
      $$3 = $$23839; //@line 8767
      break L8;
     }
     $35 = $$140 + 1 | 0; //@line 8770
     $$23839 = $$23839 + -1 | 0; //@line 8771
     if (!$$23839) {
      $$2 = $35; //@line 8774
      $$3 = 0; //@line 8774
      break;
     } else {
      $$140 = $35; //@line 8777
     }
    }
   }
  }
 } while (0);
 return ($$3 | 0 ? $$2 : 0) | 0; //@line 8785
}
function _fflush($0) {
 $0 = $0 | 0;
 var $$0 = 0, $$023 = 0, $$02325 = 0, $$02327 = 0, $$024$lcssa = 0, $$02426 = 0, $$1 = 0, $12 = 0, $13 = 0, $25 = 0, $28 = 0, $34 = 0, $5 = 0, $7 = 0, $AsyncCtx = 0, $AsyncCtx10 = 0, $AsyncCtx3 = 0, $AsyncCtx6 = 0, $phitmp = 0, sp = 0;
 sp = STACKTOP; //@line 8438
 do {
  if (!$0) {
   do {
    if (!(HEAP32[148] | 0)) {
     $34 = 0; //@line 8446
    } else {
     $12 = HEAP32[148] | 0; //@line 8448
     $AsyncCtx10 = _emscripten_alloc_async_context(4, sp) | 0; //@line 8449
     $13 = _fflush($12) | 0; //@line 8450
     if (___async) {
      HEAP32[$AsyncCtx10 >> 2] = 117; //@line 8453
      sp = STACKTOP; //@line 8454
      return 0; //@line 8455
     } else {
      _emscripten_free_async_context($AsyncCtx10 | 0); //@line 8457
      $34 = $13; //@line 8458
      break;
     }
    }
   } while (0);
   $$02325 = HEAP32[(___ofl_lock() | 0) >> 2] | 0; //@line 8464
   L9 : do {
    if (!$$02325) {
     $$024$lcssa = $34; //@line 8468
    } else {
     $$02327 = $$02325; //@line 8470
     $$02426 = $34; //@line 8470
     while (1) {
      if ((HEAP32[$$02327 + 76 >> 2] | 0) > -1) {
       $28 = ___lockfile($$02327) | 0; //@line 8477
      } else {
       $28 = 0; //@line 8479
      }
      if ((HEAP32[$$02327 + 20 >> 2] | 0) >>> 0 > (HEAP32[$$02327 + 28 >> 2] | 0) >>> 0) {
       $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 8487
       $25 = ___fflush_unlocked($$02327) | 0; //@line 8488
       if (___async) {
        break;
       }
       _emscripten_free_async_context($AsyncCtx | 0); //@line 8493
       $$1 = $25 | $$02426; //@line 8495
      } else {
       $$1 = $$02426; //@line 8497
      }
      if ($28 | 0) {
       ___unlockfile($$02327); //@line 8501
      }
      $$023 = HEAP32[$$02327 + 56 >> 2] | 0; //@line 8504
      if (!$$023) {
       $$024$lcssa = $$1; //@line 8507
       break L9;
      } else {
       $$02327 = $$023; //@line 8510
       $$02426 = $$1; //@line 8510
      }
     }
     HEAP32[$AsyncCtx >> 2] = 118; //@line 8513
     HEAP32[$AsyncCtx + 4 >> 2] = $$02426; //@line 8515
     HEAP32[$AsyncCtx + 8 >> 2] = $28; //@line 8517
     HEAP32[$AsyncCtx + 12 >> 2] = $$02327; //@line 8519
     sp = STACKTOP; //@line 8520
     return 0; //@line 8521
    }
   } while (0);
   ___ofl_unlock(); //@line 8524
   $$0 = $$024$lcssa; //@line 8525
  } else {
   if ((HEAP32[$0 + 76 >> 2] | 0) <= -1) {
    $AsyncCtx6 = _emscripten_alloc_async_context(4, sp) | 0; //@line 8531
    $5 = ___fflush_unlocked($0) | 0; //@line 8532
    if (___async) {
     HEAP32[$AsyncCtx6 >> 2] = 115; //@line 8535
     sp = STACKTOP; //@line 8536
     return 0; //@line 8537
    } else {
     _emscripten_free_async_context($AsyncCtx6 | 0); //@line 8539
     $$0 = $5; //@line 8540
     break;
    }
   }
   $phitmp = (___lockfile($0) | 0) == 0; //@line 8545
   $AsyncCtx3 = _emscripten_alloc_async_context(12, sp) | 0; //@line 8546
   $7 = ___fflush_unlocked($0) | 0; //@line 8547
   if (___async) {
    HEAP32[$AsyncCtx3 >> 2] = 116; //@line 8550
    HEAP8[$AsyncCtx3 + 4 >> 0] = $phitmp & 1; //@line 8553
    HEAP32[$AsyncCtx3 + 8 >> 2] = $0; //@line 8555
    sp = STACKTOP; //@line 8556
    return 0; //@line 8557
   }
   _emscripten_free_async_context($AsyncCtx3 | 0); //@line 8559
   if ($phitmp) {
    $$0 = $7; //@line 8561
   } else {
    ___unlockfile($0); //@line 8563
    $$0 = $7; //@line 8564
   }
  }
 } while (0);
 return $$0 | 0; //@line 8568
}
function __ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($0, $1, $2, $3, $4) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 var $$037$off038 = 0, $$037$off039 = 0, $13 = 0, $19 = 0, $22 = 0, $23 = 0, $25 = 0, $28 = 0, $39 = 0, $50 = 0, $53 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 13177
 do {
  if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, $4) | 0) {
   __ZNK10__cxxabiv117__class_type_info29process_static_type_below_dstEPNS_19__dynamic_cast_infoEPKvi(0, $1, $2, $3); //@line 13183
  } else {
   if (!(__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 >> 2] | 0, $4) | 0)) {
    $50 = HEAP32[$0 + 8 >> 2] | 0; //@line 13189
    $53 = HEAP32[(HEAP32[$50 >> 2] | 0) + 24 >> 2] | 0; //@line 13192
    $AsyncCtx3 = _emscripten_alloc_async_context(4, sp) | 0; //@line 13193
    FUNCTION_TABLE_viiiii[$53 & 3]($50, $1, $2, $3, $4); //@line 13194
    if (___async) {
     HEAP32[$AsyncCtx3 >> 2] = 138; //@line 13197
     sp = STACKTOP; //@line 13198
     return;
    } else {
     _emscripten_free_async_context($AsyncCtx3 | 0); //@line 13201
     break;
    }
   }
   if ((HEAP32[$1 + 16 >> 2] | 0) != ($2 | 0)) {
    $13 = $1 + 20 | 0; //@line 13209
    if ((HEAP32[$13 >> 2] | 0) != ($2 | 0)) {
     HEAP32[$1 + 32 >> 2] = $3; //@line 13214
     $19 = $1 + 44 | 0; //@line 13215
     if ((HEAP32[$19 >> 2] | 0) == 4) {
      break;
     }
     $22 = $1 + 52 | 0; //@line 13221
     HEAP8[$22 >> 0] = 0; //@line 13222
     $23 = $1 + 53 | 0; //@line 13223
     HEAP8[$23 >> 0] = 0; //@line 13224
     $25 = HEAP32[$0 + 8 >> 2] | 0; //@line 13226
     $28 = HEAP32[(HEAP32[$25 >> 2] | 0) + 20 >> 2] | 0; //@line 13229
     $AsyncCtx = _emscripten_alloc_async_context(28, sp) | 0; //@line 13230
     FUNCTION_TABLE_viiiiii[$28 & 3]($25, $1, $2, $2, 1, $4); //@line 13231
     if (___async) {
      HEAP32[$AsyncCtx >> 2] = 137; //@line 13234
      HEAP32[$AsyncCtx + 4 >> 2] = $23; //@line 13236
      HEAP32[$AsyncCtx + 8 >> 2] = $2; //@line 13238
      HEAP32[$AsyncCtx + 12 >> 2] = $13; //@line 13240
      HEAP32[$AsyncCtx + 16 >> 2] = $1; //@line 13242
      HEAP32[$AsyncCtx + 20 >> 2] = $22; //@line 13244
      HEAP32[$AsyncCtx + 24 >> 2] = $19; //@line 13246
      sp = STACKTOP; //@line 13247
      return;
     }
     _emscripten_free_async_context($AsyncCtx | 0); //@line 13250
     if (!(HEAP8[$23 >> 0] | 0)) {
      $$037$off038 = 4; //@line 13254
      label = 13; //@line 13255
     } else {
      if (!(HEAP8[$22 >> 0] | 0)) {
       $$037$off038 = 3; //@line 13260
       label = 13; //@line 13261
      } else {
       $$037$off039 = 3; //@line 13263
      }
     }
     if ((label | 0) == 13) {
      HEAP32[$13 >> 2] = $2; //@line 13267
      $39 = $1 + 40 | 0; //@line 13268
      HEAP32[$39 >> 2] = (HEAP32[$39 >> 2] | 0) + 1; //@line 13271
      if ((HEAP32[$1 + 36 >> 2] | 0) == 1) {
       if ((HEAP32[$1 + 24 >> 2] | 0) == 2) {
        HEAP8[$1 + 54 >> 0] = 1; //@line 13281
        $$037$off039 = $$037$off038; //@line 13282
       } else {
        $$037$off039 = $$037$off038; //@line 13284
       }
      } else {
       $$037$off039 = $$037$off038; //@line 13287
      }
     }
     HEAP32[$19 >> 2] = $$037$off039; //@line 13290
     break;
    }
   }
   if (($3 | 0) == 1) {
    HEAP32[$1 + 32 >> 2] = 1; //@line 13297
   }
  }
 } while (0);
 return;
}
function _mbed_vtracef__async_cb_24($0) {
 $0 = $0 | 0;
 var $$13 = 0, $$expand_i1_val = 0, $10 = 0, $12 = 0, $14 = 0, $18 = 0, $19 = 0, $2 = 0, $21 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $30 = 0, $34 = 0, $35 = 0, $6 = 0, $8 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx6 = 0, $ReallocAsyncCtx7 = 0, sp = 0;
 sp = STACKTOP; //@line 3466
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 3468
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 3472
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 3474
 $10 = HEAP8[$0 + 20 >> 0] & 1; //@line 3477
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 3479
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 3481
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 3483
 $$13 = ($AsyncRetVal | 0) >= ($2 | 0) ? 0 : $AsyncRetVal; //@line 3485
 $18 = (HEAP32[$0 + 8 >> 2] | 0) + $$13 | 0; //@line 3487
 $19 = $2 - $$13 | 0; //@line 3488
 do {
  if (($$13 | 0) > 0) {
   $21 = HEAP32[58] | 0; //@line 3492
   if (!(($19 | 0) > 0 & ($21 | 0) != 0)) {
    if (($$13 | 0) < 1 | ($19 | 0) < 1 | $10 ^ 1) {
     break;
    }
    _snprintf($18, $19, 1526, $12) | 0; //@line 3504
    break;
   }
   $ReallocAsyncCtx6 = _emscripten_realloc_async_context(32) | 0; //@line 3507
   $23 = FUNCTION_TABLE_i[$21 & 0]() | 0; //@line 3508
   if (___async) {
    HEAP32[$ReallocAsyncCtx6 >> 2] = 45; //@line 3511
    $24 = $ReallocAsyncCtx6 + 4 | 0; //@line 3512
    HEAP32[$24 >> 2] = $6; //@line 3513
    $25 = $ReallocAsyncCtx6 + 8 | 0; //@line 3514
    HEAP32[$25 >> 2] = $18; //@line 3515
    $26 = $ReallocAsyncCtx6 + 12 | 0; //@line 3516
    HEAP32[$26 >> 2] = $19; //@line 3517
    $27 = $ReallocAsyncCtx6 + 16 | 0; //@line 3518
    HEAP32[$27 >> 2] = $8; //@line 3519
    $28 = $ReallocAsyncCtx6 + 20 | 0; //@line 3520
    $$expand_i1_val = $10 & 1; //@line 3521
    HEAP8[$28 >> 0] = $$expand_i1_val; //@line 3522
    $29 = $ReallocAsyncCtx6 + 24 | 0; //@line 3523
    HEAP32[$29 >> 2] = $12; //@line 3524
    $30 = $ReallocAsyncCtx6 + 28 | 0; //@line 3525
    HEAP32[$30 >> 2] = $14; //@line 3526
    sp = STACKTOP; //@line 3527
    return;
   }
   HEAP32[___async_retval >> 2] = $23; //@line 3531
   ___async_unwind = 0; //@line 3532
   HEAP32[$ReallocAsyncCtx6 >> 2] = 45; //@line 3533
   $24 = $ReallocAsyncCtx6 + 4 | 0; //@line 3534
   HEAP32[$24 >> 2] = $6; //@line 3535
   $25 = $ReallocAsyncCtx6 + 8 | 0; //@line 3536
   HEAP32[$25 >> 2] = $18; //@line 3537
   $26 = $ReallocAsyncCtx6 + 12 | 0; //@line 3538
   HEAP32[$26 >> 2] = $19; //@line 3539
   $27 = $ReallocAsyncCtx6 + 16 | 0; //@line 3540
   HEAP32[$27 >> 2] = $8; //@line 3541
   $28 = $ReallocAsyncCtx6 + 20 | 0; //@line 3542
   $$expand_i1_val = $10 & 1; //@line 3543
   HEAP8[$28 >> 0] = $$expand_i1_val; //@line 3544
   $29 = $ReallocAsyncCtx6 + 24 | 0; //@line 3545
   HEAP32[$29 >> 2] = $12; //@line 3546
   $30 = $ReallocAsyncCtx6 + 28 | 0; //@line 3547
   HEAP32[$30 >> 2] = $14; //@line 3548
   sp = STACKTOP; //@line 3549
   return;
  }
 } while (0);
 $34 = HEAP32[59] | 0; //@line 3553
 $35 = HEAP32[52] | 0; //@line 3554
 $ReallocAsyncCtx7 = _emscripten_realloc_async_context(4) | 0; //@line 3555
 FUNCTION_TABLE_vi[$34 & 255]($35); //@line 3556
 if (___async) {
  HEAP32[$ReallocAsyncCtx7 >> 2] = 46; //@line 3559
  sp = STACKTOP; //@line 3560
  return;
 }
 ___async_unwind = 0; //@line 3563
 HEAP32[$ReallocAsyncCtx7 >> 2] = 46; //@line 3564
 sp = STACKTOP; //@line 3565
 return;
}
function _equeue_enqueue($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$051$ph = 0, $$05157 = 0, $$0515859 = 0, $$053 = 0, $13 = 0, $14 = 0, $16 = 0, $24 = 0, $25 = 0, $27 = 0, $29 = 0, $33 = 0, $34 = 0, $42 = 0, $43 = 0, $46 = 0, $47 = 0, $49 = 0, $54 = 0, $65 = 0, $67 = 0, $AsyncCtx = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 915
 $13 = $1 - (HEAP32[$0 + 12 >> 2] | 0) | HEAPU8[$1 + 4 >> 0] << HEAP32[$0 + 16 >> 2]; //@line 926
 $14 = $1 + 20 | 0; //@line 927
 $16 = (HEAP32[$14 >> 2] | 0) - $2 | 0; //@line 929
 HEAP32[$14 >> 2] = ($16 & ~($16 >> 31)) + $2; //@line 934
 HEAP8[$1 + 5 >> 0] = HEAP8[$0 + 9 >> 0] | 0; //@line 938
 $24 = $0 + 128 | 0; //@line 939
 _equeue_mutex_lock($24); //@line 940
 $25 = HEAP32[$0 >> 2] | 0; //@line 941
 L1 : do {
  if (!$25) {
   $$051$ph = $0; //@line 945
   label = 5; //@line 946
  } else {
   $27 = HEAP32[$14 >> 2] | 0; //@line 948
   $$053 = $0; //@line 949
   $29 = $25; //@line 949
   while (1) {
    if (((HEAP32[$29 + 20 >> 2] | 0) - $27 | 0) >= 0) {
     break;
    }
    $33 = $29 + 8 | 0; //@line 958
    $34 = HEAP32[$33 >> 2] | 0; //@line 959
    if (!$34) {
     $$051$ph = $33; //@line 962
     label = 5; //@line 963
     break L1;
    } else {
     $$053 = $33; //@line 966
     $29 = $34; //@line 966
    }
   }
   if ((HEAP32[$29 + 20 >> 2] | 0) != (HEAP32[$14 >> 2] | 0)) {
    $49 = $1 + 8 | 0; //@line 974
    HEAP32[$49 >> 2] = $29; //@line 975
    HEAP32[$29 + 16 >> 2] = $49; //@line 977
    $$0515859 = $$053; //@line 978
    label = 11; //@line 979
    break;
   }
   $42 = HEAP32[$29 + 8 >> 2] | 0; //@line 983
   $43 = $1 + 8 | 0; //@line 984
   HEAP32[$43 >> 2] = $42; //@line 985
   if ($42 | 0) {
    HEAP32[$42 + 16 >> 2] = $43; //@line 989
   }
   $46 = HEAP32[$$053 >> 2] | 0; //@line 991
   $47 = $1 + 12 | 0; //@line 992
   HEAP32[$47 >> 2] = $46; //@line 993
   HEAP32[$46 + 16 >> 2] = $47; //@line 995
   $$05157 = $$053; //@line 996
  }
 } while (0);
 if ((label | 0) == 5) {
  HEAP32[$1 + 8 >> 2] = 0; //@line 1001
  $$0515859 = $$051$ph; //@line 1002
  label = 11; //@line 1003
 }
 if ((label | 0) == 11) {
  HEAP32[$1 + 12 >> 2] = 0; //@line 1007
  $$05157 = $$0515859; //@line 1008
 }
 HEAP32[$$05157 >> 2] = $1; //@line 1010
 HEAP32[$1 + 16 >> 2] = $$05157; //@line 1012
 $54 = HEAP32[$0 + 40 >> 2] | 0; //@line 1014
 if (!$54) {
  _equeue_mutex_unlock($24); //@line 1017
  return $13 | 0; //@line 1018
 }
 if (!(HEAP8[$0 + 36 >> 0] | 0)) {
  _equeue_mutex_unlock($24); //@line 1024
  return $13 | 0; //@line 1025
 }
 if ((HEAP32[$0 >> 2] | 0) != ($1 | 0)) {
  _equeue_mutex_unlock($24); //@line 1030
  return $13 | 0; //@line 1031
 }
 if (HEAP32[$1 + 12 >> 2] | 0) {
  _equeue_mutex_unlock($24); //@line 1037
  return $13 | 0; //@line 1038
 }
 $65 = HEAP32[$0 + 44 >> 2] | 0; //@line 1041
 $67 = (HEAP32[$14 >> 2] | 0) - $2 | 0; //@line 1043
 $AsyncCtx = _emscripten_alloc_async_context(12, sp) | 0; //@line 1047
 FUNCTION_TABLE_vii[$54 & 3]($65, $67 & ~($67 >> 31)); //@line 1048
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 29; //@line 1051
  HEAP32[$AsyncCtx + 4 >> 2] = $24; //@line 1053
  HEAP32[$AsyncCtx + 8 >> 2] = $13; //@line 1055
  sp = STACKTOP; //@line 1056
  return 0; //@line 1057
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 1059
 _equeue_mutex_unlock($24); //@line 1060
 return $13 | 0; //@line 1061
}
function _mbed_vtracef__async_cb_25($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $2 = 0, $20 = 0, $22 = 0, $24 = 0, $26 = 0, $28 = 0, $30 = 0, $32 = 0, $34 = 0, $36 = 0, $38 = 0, $4 = 0, $40 = 0, $42 = 0, $44 = 0, $46 = 0, $48 = 0, $50 = 0, $55 = 0, $56 = 0, $57 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx5 = 0, sp = 0;
 sp = STACKTOP; //@line 3575
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 3577
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 3579
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 3581
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 3583
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 3585
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 3587
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 3589
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 3591
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 3593
 $20 = HEAP32[$0 + 40 >> 2] | 0; //@line 3595
 $22 = HEAP32[$0 + 44 >> 2] | 0; //@line 3597
 $24 = HEAP32[$0 + 48 >> 2] | 0; //@line 3599
 $26 = HEAP32[$0 + 52 >> 2] | 0; //@line 3601
 $28 = HEAP32[$0 + 56 >> 2] | 0; //@line 3603
 $30 = HEAP32[$0 + 60 >> 2] | 0; //@line 3605
 $32 = HEAP32[$0 + 64 >> 2] | 0; //@line 3607
 $34 = HEAP8[$0 + 68 >> 0] & 1; //@line 3610
 $36 = HEAP32[$0 + 72 >> 2] | 0; //@line 3612
 $38 = HEAP32[$0 + 76 >> 2] | 0; //@line 3614
 $40 = HEAP32[$0 + 80 >> 2] | 0; //@line 3616
 $42 = HEAP32[$0 + 84 >> 2] | 0; //@line 3618
 $44 = HEAP32[$0 + 88 >> 2] | 0; //@line 3620
 $46 = HEAP32[$0 + 92 >> 2] | 0; //@line 3622
 $48 = HEAP32[$0 + 96 >> 2] | 0; //@line 3624
 $50 = HEAP32[$0 + 100 >> 2] | 0; //@line 3626
 $55 = ($50 | 0 ? 4 : 0) + $50 + (HEAP32[___async_retval >> 2] | 0) | 0; //@line 3632
 $56 = HEAP32[57] | 0; //@line 3633
 $ReallocAsyncCtx5 = _emscripten_realloc_async_context(100) | 0; //@line 3634
 $57 = FUNCTION_TABLE_ii[$56 & 15]($55) | 0; //@line 3635
 if (!___async) {
  HEAP32[___async_retval >> 2] = $57; //@line 3639
  ___async_unwind = 0; //@line 3640
 }
 HEAP32[$ReallocAsyncCtx5 >> 2] = 43; //@line 3642
 HEAP32[$ReallocAsyncCtx5 + 4 >> 2] = $2; //@line 3644
 HEAP32[$ReallocAsyncCtx5 + 8 >> 2] = $4; //@line 3646
 HEAP32[$ReallocAsyncCtx5 + 12 >> 2] = $6; //@line 3648
 HEAP32[$ReallocAsyncCtx5 + 16 >> 2] = $8; //@line 3650
 HEAP32[$ReallocAsyncCtx5 + 20 >> 2] = $10; //@line 3652
 HEAP32[$ReallocAsyncCtx5 + 24 >> 2] = $12; //@line 3654
 HEAP32[$ReallocAsyncCtx5 + 28 >> 2] = $14; //@line 3656
 HEAP32[$ReallocAsyncCtx5 + 32 >> 2] = $16; //@line 3658
 HEAP32[$ReallocAsyncCtx5 + 36 >> 2] = $18; //@line 3660
 HEAP32[$ReallocAsyncCtx5 + 40 >> 2] = $20; //@line 3662
 HEAP32[$ReallocAsyncCtx5 + 44 >> 2] = $22; //@line 3664
 HEAP32[$ReallocAsyncCtx5 + 48 >> 2] = $24; //@line 3666
 HEAP32[$ReallocAsyncCtx5 + 52 >> 2] = $26; //@line 3668
 HEAP32[$ReallocAsyncCtx5 + 56 >> 2] = $28; //@line 3670
 HEAP32[$ReallocAsyncCtx5 + 60 >> 2] = $30; //@line 3672
 HEAP32[$ReallocAsyncCtx5 + 64 >> 2] = $32; //@line 3674
 HEAP8[$ReallocAsyncCtx5 + 68 >> 0] = $34 & 1; //@line 3677
 HEAP32[$ReallocAsyncCtx5 + 72 >> 2] = $36; //@line 3679
 HEAP32[$ReallocAsyncCtx5 + 76 >> 2] = $38; //@line 3681
 HEAP32[$ReallocAsyncCtx5 + 80 >> 2] = $40; //@line 3683
 HEAP32[$ReallocAsyncCtx5 + 84 >> 2] = $42; //@line 3685
 HEAP32[$ReallocAsyncCtx5 + 88 >> 2] = $44; //@line 3687
 HEAP32[$ReallocAsyncCtx5 + 92 >> 2] = $46; //@line 3689
 HEAP32[$ReallocAsyncCtx5 + 96 >> 2] = $48; //@line 3691
 sp = STACKTOP; //@line 3692
 return;
}
function __ZL25default_terminate_handlerv() {
 var $0 = 0, $1 = 0, $12 = 0, $22 = 0, $23 = 0, $25 = 0, $28 = 0, $29 = 0, $3 = 0, $36 = 0, $39 = 0, $40 = 0, $7 = 0, $9 = 0, $AsyncCtx = 0, $AsyncCtx14 = 0, $vararg_buffer = 0, $vararg_buffer10 = 0, $vararg_buffer3 = 0, $vararg_buffer7 = 0, sp = 0;
 sp = STACKTOP; //@line 12489
 STACKTOP = STACKTOP + 48 | 0; //@line 12490
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(48); //@line 12490
 $vararg_buffer10 = sp + 32 | 0; //@line 12491
 $vararg_buffer7 = sp + 24 | 0; //@line 12492
 $vararg_buffer3 = sp + 16 | 0; //@line 12493
 $vararg_buffer = sp; //@line 12494
 $0 = sp + 36 | 0; //@line 12495
 $1 = ___cxa_get_globals_fast() | 0; //@line 12496
 if ($1 | 0) {
  $3 = HEAP32[$1 >> 2] | 0; //@line 12499
  if ($3 | 0) {
   $7 = $3 + 48 | 0; //@line 12504
   $9 = HEAP32[$7 >> 2] | 0; //@line 12506
   $12 = HEAP32[$7 + 4 >> 2] | 0; //@line 12509
   if (!(($9 & -256 | 0) == 1126902528 & ($12 | 0) == 1129074247)) {
    HEAP32[$vararg_buffer7 >> 2] = 5375; //@line 12515
    _abort_message(5325, $vararg_buffer7); //@line 12516
   }
   if (($9 | 0) == 1126902529 & ($12 | 0) == 1129074247) {
    $22 = HEAP32[$3 + 44 >> 2] | 0; //@line 12525
   } else {
    $22 = $3 + 80 | 0; //@line 12527
   }
   HEAP32[$0 >> 2] = $22; //@line 12529
   $23 = HEAP32[$3 >> 2] | 0; //@line 12530
   $25 = HEAP32[$23 + 4 >> 2] | 0; //@line 12532
   $28 = HEAP32[(HEAP32[16] | 0) + 16 >> 2] | 0; //@line 12535
   $AsyncCtx = _emscripten_alloc_async_context(28, sp) | 0; //@line 12536
   $29 = FUNCTION_TABLE_iiii[$28 & 7](64, $23, $0) | 0; //@line 12537
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 128; //@line 12540
    HEAP32[$AsyncCtx + 4 >> 2] = $0; //@line 12542
    HEAP32[$AsyncCtx + 8 >> 2] = $vararg_buffer3; //@line 12544
    HEAP32[$AsyncCtx + 12 >> 2] = $25; //@line 12546
    HEAP32[$AsyncCtx + 16 >> 2] = $vararg_buffer3; //@line 12548
    HEAP32[$AsyncCtx + 20 >> 2] = $vararg_buffer; //@line 12550
    HEAP32[$AsyncCtx + 24 >> 2] = $vararg_buffer; //@line 12552
    sp = STACKTOP; //@line 12553
    STACKTOP = sp; //@line 12554
    return;
   }
   _emscripten_free_async_context($AsyncCtx | 0); //@line 12556
   if (!$29) {
    HEAP32[$vararg_buffer3 >> 2] = 5375; //@line 12558
    HEAP32[$vararg_buffer3 + 4 >> 2] = $25; //@line 12560
    _abort_message(5284, $vararg_buffer3); //@line 12561
   }
   $36 = HEAP32[$0 >> 2] | 0; //@line 12564
   $39 = HEAP32[(HEAP32[$36 >> 2] | 0) + 8 >> 2] | 0; //@line 12567
   $AsyncCtx14 = _emscripten_alloc_async_context(16, sp) | 0; //@line 12568
   $40 = FUNCTION_TABLE_ii[$39 & 15]($36) | 0; //@line 12569
   if (___async) {
    HEAP32[$AsyncCtx14 >> 2] = 129; //@line 12572
    HEAP32[$AsyncCtx14 + 4 >> 2] = $vararg_buffer; //@line 12574
    HEAP32[$AsyncCtx14 + 8 >> 2] = $25; //@line 12576
    HEAP32[$AsyncCtx14 + 12 >> 2] = $vararg_buffer; //@line 12578
    sp = STACKTOP; //@line 12579
    STACKTOP = sp; //@line 12580
    return;
   } else {
    _emscripten_free_async_context($AsyncCtx14 | 0); //@line 12582
    HEAP32[$vararg_buffer >> 2] = 5375; //@line 12583
    HEAP32[$vararg_buffer + 4 >> 2] = $25; //@line 12585
    HEAP32[$vararg_buffer + 8 >> 2] = $40; //@line 12587
    _abort_message(5239, $vararg_buffer); //@line 12588
   }
  }
 }
 _abort_message(5363, $vararg_buffer10); //@line 12593
}
function _mbed_error_vfprintf__async_cb($0) {
 $0 = $0 | 0;
 var $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $4 = 0, $9 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx2 = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 5571
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 5573
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 5575
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 5577
 if (($AsyncRetVal | 0) <= 0) {
  return;
 }
 if (!(HEAP32[1465] | 0)) {
  _serial_init(5864, 2, 3); //@line 5585
 }
 $9 = HEAP8[$4 >> 0] | 0; //@line 5587
 if (0 == 13 | $9 << 24 >> 24 != 10) {
  $ReallocAsyncCtx2 = _emscripten_realloc_async_context(24) | 0; //@line 5593
  _serial_putc(5864, $9 << 24 >> 24); //@line 5594
  if (___async) {
   HEAP32[$ReallocAsyncCtx2 >> 2] = 69; //@line 5597
   $18 = $ReallocAsyncCtx2 + 4 | 0; //@line 5598
   HEAP32[$18 >> 2] = 0; //@line 5599
   $19 = $ReallocAsyncCtx2 + 8 | 0; //@line 5600
   HEAP32[$19 >> 2] = $AsyncRetVal; //@line 5601
   $20 = $ReallocAsyncCtx2 + 12 | 0; //@line 5602
   HEAP32[$20 >> 2] = $2; //@line 5603
   $21 = $ReallocAsyncCtx2 + 16 | 0; //@line 5604
   HEAP8[$21 >> 0] = $9; //@line 5605
   $22 = $ReallocAsyncCtx2 + 20 | 0; //@line 5606
   HEAP32[$22 >> 2] = $4; //@line 5607
   sp = STACKTOP; //@line 5608
   return;
  }
  ___async_unwind = 0; //@line 5611
  HEAP32[$ReallocAsyncCtx2 >> 2] = 69; //@line 5612
  $18 = $ReallocAsyncCtx2 + 4 | 0; //@line 5613
  HEAP32[$18 >> 2] = 0; //@line 5614
  $19 = $ReallocAsyncCtx2 + 8 | 0; //@line 5615
  HEAP32[$19 >> 2] = $AsyncRetVal; //@line 5616
  $20 = $ReallocAsyncCtx2 + 12 | 0; //@line 5617
  HEAP32[$20 >> 2] = $2; //@line 5618
  $21 = $ReallocAsyncCtx2 + 16 | 0; //@line 5619
  HEAP8[$21 >> 0] = $9; //@line 5620
  $22 = $ReallocAsyncCtx2 + 20 | 0; //@line 5621
  HEAP32[$22 >> 2] = $4; //@line 5622
  sp = STACKTOP; //@line 5623
  return;
 } else {
  $ReallocAsyncCtx3 = _emscripten_realloc_async_context(24) | 0; //@line 5626
  _serial_putc(5864, 13); //@line 5627
  if (___async) {
   HEAP32[$ReallocAsyncCtx3 >> 2] = 68; //@line 5630
   $12 = $ReallocAsyncCtx3 + 4 | 0; //@line 5631
   HEAP8[$12 >> 0] = $9; //@line 5632
   $13 = $ReallocAsyncCtx3 + 8 | 0; //@line 5633
   HEAP32[$13 >> 2] = 0; //@line 5634
   $14 = $ReallocAsyncCtx3 + 12 | 0; //@line 5635
   HEAP32[$14 >> 2] = $AsyncRetVal; //@line 5636
   $15 = $ReallocAsyncCtx3 + 16 | 0; //@line 5637
   HEAP32[$15 >> 2] = $2; //@line 5638
   $16 = $ReallocAsyncCtx3 + 20 | 0; //@line 5639
   HEAP32[$16 >> 2] = $4; //@line 5640
   sp = STACKTOP; //@line 5641
   return;
  }
  ___async_unwind = 0; //@line 5644
  HEAP32[$ReallocAsyncCtx3 >> 2] = 68; //@line 5645
  $12 = $ReallocAsyncCtx3 + 4 | 0; //@line 5646
  HEAP8[$12 >> 0] = $9; //@line 5647
  $13 = $ReallocAsyncCtx3 + 8 | 0; //@line 5648
  HEAP32[$13 >> 2] = 0; //@line 5649
  $14 = $ReallocAsyncCtx3 + 12 | 0; //@line 5650
  HEAP32[$14 >> 2] = $AsyncRetVal; //@line 5651
  $15 = $ReallocAsyncCtx3 + 16 | 0; //@line 5652
  HEAP32[$15 >> 2] = $2; //@line 5653
  $16 = $ReallocAsyncCtx3 + 20 | 0; //@line 5654
  HEAP32[$16 >> 2] = $4; //@line 5655
  sp = STACKTOP; //@line 5656
  return;
 }
}
function _mbed_error_vfprintf__async_cb_60($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $13 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $4 = 0, $6 = 0, $ReallocAsyncCtx2 = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 5664
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 5668
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 5670
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 5674
 $12 = (HEAP32[$0 + 4 >> 2] | 0) + 1 | 0; //@line 5675
 if (($12 | 0) == ($4 | 0)) {
  return;
 }
 $13 = HEAP8[$10 + $12 >> 0] | 0; //@line 5681
 if ((HEAP8[$0 + 16 >> 0] | 0) == 13 | $13 << 24 >> 24 != 10) {
  $ReallocAsyncCtx2 = _emscripten_realloc_async_context(24) | 0; //@line 5687
  _serial_putc(5864, $13 << 24 >> 24); //@line 5688
  if (___async) {
   HEAP32[$ReallocAsyncCtx2 >> 2] = 69; //@line 5691
   $22 = $ReallocAsyncCtx2 + 4 | 0; //@line 5692
   HEAP32[$22 >> 2] = $12; //@line 5693
   $23 = $ReallocAsyncCtx2 + 8 | 0; //@line 5694
   HEAP32[$23 >> 2] = $4; //@line 5695
   $24 = $ReallocAsyncCtx2 + 12 | 0; //@line 5696
   HEAP32[$24 >> 2] = $6; //@line 5697
   $25 = $ReallocAsyncCtx2 + 16 | 0; //@line 5698
   HEAP8[$25 >> 0] = $13; //@line 5699
   $26 = $ReallocAsyncCtx2 + 20 | 0; //@line 5700
   HEAP32[$26 >> 2] = $10; //@line 5701
   sp = STACKTOP; //@line 5702
   return;
  }
  ___async_unwind = 0; //@line 5705
  HEAP32[$ReallocAsyncCtx2 >> 2] = 69; //@line 5706
  $22 = $ReallocAsyncCtx2 + 4 | 0; //@line 5707
  HEAP32[$22 >> 2] = $12; //@line 5708
  $23 = $ReallocAsyncCtx2 + 8 | 0; //@line 5709
  HEAP32[$23 >> 2] = $4; //@line 5710
  $24 = $ReallocAsyncCtx2 + 12 | 0; //@line 5711
  HEAP32[$24 >> 2] = $6; //@line 5712
  $25 = $ReallocAsyncCtx2 + 16 | 0; //@line 5713
  HEAP8[$25 >> 0] = $13; //@line 5714
  $26 = $ReallocAsyncCtx2 + 20 | 0; //@line 5715
  HEAP32[$26 >> 2] = $10; //@line 5716
  sp = STACKTOP; //@line 5717
  return;
 } else {
  $ReallocAsyncCtx3 = _emscripten_realloc_async_context(24) | 0; //@line 5720
  _serial_putc(5864, 13); //@line 5721
  if (___async) {
   HEAP32[$ReallocAsyncCtx3 >> 2] = 68; //@line 5724
   $16 = $ReallocAsyncCtx3 + 4 | 0; //@line 5725
   HEAP8[$16 >> 0] = $13; //@line 5726
   $17 = $ReallocAsyncCtx3 + 8 | 0; //@line 5727
   HEAP32[$17 >> 2] = $12; //@line 5728
   $18 = $ReallocAsyncCtx3 + 12 | 0; //@line 5729
   HEAP32[$18 >> 2] = $4; //@line 5730
   $19 = $ReallocAsyncCtx3 + 16 | 0; //@line 5731
   HEAP32[$19 >> 2] = $6; //@line 5732
   $20 = $ReallocAsyncCtx3 + 20 | 0; //@line 5733
   HEAP32[$20 >> 2] = $10; //@line 5734
   sp = STACKTOP; //@line 5735
   return;
  }
  ___async_unwind = 0; //@line 5738
  HEAP32[$ReallocAsyncCtx3 >> 2] = 68; //@line 5739
  $16 = $ReallocAsyncCtx3 + 4 | 0; //@line 5740
  HEAP8[$16 >> 0] = $13; //@line 5741
  $17 = $ReallocAsyncCtx3 + 8 | 0; //@line 5742
  HEAP32[$17 >> 2] = $12; //@line 5743
  $18 = $ReallocAsyncCtx3 + 12 | 0; //@line 5744
  HEAP32[$18 >> 2] = $4; //@line 5745
  $19 = $ReallocAsyncCtx3 + 16 | 0; //@line 5746
  HEAP32[$19 >> 2] = $6; //@line 5747
  $20 = $ReallocAsyncCtx3 + 20 | 0; //@line 5748
  HEAP32[$20 >> 2] = $10; //@line 5749
  sp = STACKTOP; //@line 5750
  return;
 }
}
function ___stdio_write($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$0 = 0, $$04756 = 0, $$04855 = 0, $$04954 = 0, $$051 = 0, $$1 = 0, $$150 = 0, $12 = 0, $13 = 0, $17 = 0, $20 = 0, $25 = 0, $27 = 0, $3 = 0, $37 = 0, $38 = 0, $4 = 0, $44 = 0, $5 = 0, $7 = 0, $9 = 0, $vararg_buffer = 0, $vararg_buffer3 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 7479
 STACKTOP = STACKTOP + 48 | 0; //@line 7480
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(48); //@line 7480
 $vararg_buffer3 = sp + 16 | 0; //@line 7481
 $vararg_buffer = sp; //@line 7482
 $3 = sp + 32 | 0; //@line 7483
 $4 = $0 + 28 | 0; //@line 7484
 $5 = HEAP32[$4 >> 2] | 0; //@line 7485
 HEAP32[$3 >> 2] = $5; //@line 7486
 $7 = $0 + 20 | 0; //@line 7488
 $9 = (HEAP32[$7 >> 2] | 0) - $5 | 0; //@line 7490
 HEAP32[$3 + 4 >> 2] = $9; //@line 7491
 HEAP32[$3 + 8 >> 2] = $1; //@line 7493
 HEAP32[$3 + 12 >> 2] = $2; //@line 7495
 $12 = $9 + $2 | 0; //@line 7496
 $13 = $0 + 60 | 0; //@line 7497
 HEAP32[$vararg_buffer >> 2] = HEAP32[$13 >> 2]; //@line 7500
 HEAP32[$vararg_buffer + 4 >> 2] = $3; //@line 7502
 HEAP32[$vararg_buffer + 8 >> 2] = 2; //@line 7504
 $17 = ___syscall_ret(___syscall146(146, $vararg_buffer | 0) | 0) | 0; //@line 7506
 L1 : do {
  if (($12 | 0) == ($17 | 0)) {
   label = 3; //@line 7510
  } else {
   $$04756 = 2; //@line 7512
   $$04855 = $12; //@line 7512
   $$04954 = $3; //@line 7512
   $27 = $17; //@line 7512
   while (1) {
    if (($27 | 0) < 0) {
     break;
    }
    $$04855 = $$04855 - $27 | 0; //@line 7518
    $37 = HEAP32[$$04954 + 4 >> 2] | 0; //@line 7520
    $38 = $27 >>> 0 > $37 >>> 0; //@line 7521
    $$150 = $38 ? $$04954 + 8 | 0 : $$04954; //@line 7523
    $$1 = $$04756 + ($38 << 31 >> 31) | 0; //@line 7525
    $$0 = $27 - ($38 ? $37 : 0) | 0; //@line 7527
    HEAP32[$$150 >> 2] = (HEAP32[$$150 >> 2] | 0) + $$0; //@line 7530
    $44 = $$150 + 4 | 0; //@line 7531
    HEAP32[$44 >> 2] = (HEAP32[$44 >> 2] | 0) - $$0; //@line 7534
    HEAP32[$vararg_buffer3 >> 2] = HEAP32[$13 >> 2]; //@line 7537
    HEAP32[$vararg_buffer3 + 4 >> 2] = $$150; //@line 7539
    HEAP32[$vararg_buffer3 + 8 >> 2] = $$1; //@line 7541
    $27 = ___syscall_ret(___syscall146(146, $vararg_buffer3 | 0) | 0) | 0; //@line 7543
    if (($$04855 | 0) == ($27 | 0)) {
     label = 3; //@line 7546
     break L1;
    } else {
     $$04756 = $$1; //@line 7549
     $$04954 = $$150; //@line 7549
    }
   }
   HEAP32[$0 + 16 >> 2] = 0; //@line 7553
   HEAP32[$4 >> 2] = 0; //@line 7554
   HEAP32[$7 >> 2] = 0; //@line 7555
   HEAP32[$0 >> 2] = HEAP32[$0 >> 2] | 32; //@line 7558
   if (($$04756 | 0) == 2) {
    $$051 = 0; //@line 7561
   } else {
    $$051 = $2 - (HEAP32[$$04954 + 4 >> 2] | 0) | 0; //@line 7566
   }
  }
 } while (0);
 if ((label | 0) == 3) {
  $20 = HEAP32[$0 + 44 >> 2] | 0; //@line 7572
  HEAP32[$0 + 16 >> 2] = $20 + (HEAP32[$0 + 48 >> 2] | 0); //@line 7577
  $25 = $20; //@line 7578
  HEAP32[$4 >> 2] = $25; //@line 7579
  HEAP32[$7 >> 2] = $25; //@line 7580
  $$051 = $2; //@line 7581
 }
 STACKTOP = sp; //@line 7583
 return $$051 | 0; //@line 7583
}
function _main__async_cb_42($0) {
 $0 = $0 | 0;
 var $$expand_i1_val = 0, $12 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx10 = 0, sp = 0;
 sp = STACKTOP; //@line 5007
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 5009
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 5011
 if (!$AsyncRetVal) {
  HEAP32[$2 >> 2] = 0; //@line 5014
  HEAP32[$2 + 4 >> 2] = 0; //@line 5014
  HEAP32[$2 + 8 >> 2] = 0; //@line 5014
  HEAP32[$2 + 12 >> 2] = 0; //@line 5014
  $18 = 1; //@line 5015
  $20 = $2; //@line 5015
 } else {
  HEAP32[$AsyncRetVal + 4 >> 2] = 5876; //@line 5018
  HEAP32[$AsyncRetVal + 8 >> 2] = 0; //@line 5020
  HEAP32[$AsyncRetVal + 12 >> 2] = 0; //@line 5022
  HEAP32[$AsyncRetVal + 16 >> 2] = -1; //@line 5024
  HEAP32[$AsyncRetVal + 20 >> 2] = 10; //@line 5026
  HEAP32[$AsyncRetVal + 24 >> 2] = 97; //@line 5028
  HEAP32[$AsyncRetVal + 28 >> 2] = 2; //@line 5030
  HEAP32[$AsyncRetVal >> 2] = 1; //@line 5031
  $12 = $2 + 4 | 0; //@line 5032
  HEAP32[$12 >> 2] = 0; //@line 5033
  HEAP32[$12 + 4 >> 2] = 0; //@line 5033
  HEAP32[$12 + 8 >> 2] = 0; //@line 5033
  HEAP32[$2 >> 2] = $AsyncRetVal; //@line 5034
  HEAP32[$AsyncRetVal >> 2] = (HEAP32[$AsyncRetVal >> 2] | 0) + 1; //@line 5037
  $18 = 0; //@line 5038
  $20 = $2; //@line 5038
 }
 $15 = $2 + 12 | 0; //@line 5040
 HEAP32[$15 >> 2] = 324; //@line 5041
 $ReallocAsyncCtx10 = _emscripten_realloc_async_context(24) | 0; //@line 5042
 __ZN4mbed11InterruptIn4fallENS_8CallbackIFvvEEE(6080, $2); //@line 5043
 if (___async) {
  HEAP32[$ReallocAsyncCtx10 >> 2] = 98; //@line 5046
  $16 = $ReallocAsyncCtx10 + 4 | 0; //@line 5047
  HEAP32[$16 >> 2] = $15; //@line 5048
  $17 = $ReallocAsyncCtx10 + 8 | 0; //@line 5049
  $$expand_i1_val = $18 & 1; //@line 5050
  HEAP8[$17 >> 0] = $$expand_i1_val; //@line 5051
  $19 = $ReallocAsyncCtx10 + 12 | 0; //@line 5052
  HEAP32[$19 >> 2] = $20; //@line 5053
  $21 = $ReallocAsyncCtx10 + 16 | 0; //@line 5054
  HEAP32[$21 >> 2] = $AsyncRetVal; //@line 5055
  $22 = $ReallocAsyncCtx10 + 20 | 0; //@line 5056
  HEAP32[$22 >> 2] = $AsyncRetVal; //@line 5057
  sp = STACKTOP; //@line 5058
  return;
 }
 ___async_unwind = 0; //@line 5061
 HEAP32[$ReallocAsyncCtx10 >> 2] = 98; //@line 5062
 $16 = $ReallocAsyncCtx10 + 4 | 0; //@line 5063
 HEAP32[$16 >> 2] = $15; //@line 5064
 $17 = $ReallocAsyncCtx10 + 8 | 0; //@line 5065
 $$expand_i1_val = $18 & 1; //@line 5066
 HEAP8[$17 >> 0] = $$expand_i1_val; //@line 5067
 $19 = $ReallocAsyncCtx10 + 12 | 0; //@line 5068
 HEAP32[$19 >> 2] = $20; //@line 5069
 $21 = $ReallocAsyncCtx10 + 16 | 0; //@line 5070
 HEAP32[$21 >> 2] = $AsyncRetVal; //@line 5071
 $22 = $ReallocAsyncCtx10 + 20 | 0; //@line 5072
 HEAP32[$22 >> 2] = $AsyncRetVal; //@line 5073
 sp = STACKTOP; //@line 5074
 return;
}
function __ZN20SimulatorBlockDevice7programEPKvyy__async_cb_8($0) {
 $0 = $0 | 0;
 var $11 = 0, $14 = 0, $16 = 0, $18 = 0, $2 = 0, $21 = 0, $23 = 0, $25 = 0, $27 = 0, $32 = 0, $38 = 0, $39 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $7 = 0, $9 = 0, $ReallocAsyncCtx4 = 0, sp = 0;
 sp = STACKTOP; //@line 1813
 $2 = $0 + 8 | 0; //@line 1815
 $7 = HEAP32[$2 + 4 >> 2] | 0; //@line 1820
 $9 = $0 + 16 | 0; //@line 1822
 $11 = HEAP32[$9 >> 2] | 0; //@line 1824
 $14 = HEAP32[$9 + 4 >> 2] | 0; //@line 1827
 $16 = $0 + 24 | 0; //@line 1829
 $18 = HEAP32[$16 >> 2] | 0; //@line 1831
 $21 = HEAP32[$16 + 4 >> 2] | 0; //@line 1834
 $23 = HEAP32[$0 + 32 >> 2] | 0; //@line 1836
 $25 = HEAP32[$0 + 36 >> 2] | 0; //@line 1838
 $27 = ___async_retval; //@line 1840
 $32 = HEAP32[$27 + 4 >> 2] | 0; //@line 1845
 if (!($7 >>> 0 > $32 >>> 0 | (($7 | 0) == ($32 | 0) ? (HEAP32[$2 >> 2] | 0) >>> 0 > (HEAP32[$27 >> 2] | 0) >>> 0 : 0))) {
  _emscripten_asm_const_iiiii(10, HEAP32[$23 + 4 >> 2] | 0, $25 | 0, $11 | 0, $18 | 0) | 0; //@line 1854
  HEAP32[___async_retval >> 2] = 0; //@line 1856
  return;
 }
 $ReallocAsyncCtx4 = _emscripten_realloc_async_context(32) | 0; //@line 1859
 _mbed_assert_internal(2086, 1919, 98); //@line 1860
 if (___async) {
  HEAP32[$ReallocAsyncCtx4 >> 2] = 83; //@line 1863
  $38 = $ReallocAsyncCtx4 + 8 | 0; //@line 1864
  $39 = $38; //@line 1865
  $40 = $39; //@line 1866
  HEAP32[$40 >> 2] = $11; //@line 1867
  $41 = $39 + 4 | 0; //@line 1868
  $42 = $41; //@line 1869
  HEAP32[$42 >> 2] = $14; //@line 1870
  $43 = $ReallocAsyncCtx4 + 16 | 0; //@line 1871
  $44 = $43; //@line 1872
  $45 = $44; //@line 1873
  HEAP32[$45 >> 2] = $18; //@line 1874
  $46 = $44 + 4 | 0; //@line 1875
  $47 = $46; //@line 1876
  HEAP32[$47 >> 2] = $21; //@line 1877
  $48 = $ReallocAsyncCtx4 + 24 | 0; //@line 1878
  HEAP32[$48 >> 2] = $23; //@line 1879
  $49 = $ReallocAsyncCtx4 + 28 | 0; //@line 1880
  HEAP32[$49 >> 2] = $25; //@line 1881
  sp = STACKTOP; //@line 1882
  return;
 }
 ___async_unwind = 0; //@line 1885
 HEAP32[$ReallocAsyncCtx4 >> 2] = 83; //@line 1886
 $38 = $ReallocAsyncCtx4 + 8 | 0; //@line 1887
 $39 = $38; //@line 1888
 $40 = $39; //@line 1889
 HEAP32[$40 >> 2] = $11; //@line 1890
 $41 = $39 + 4 | 0; //@line 1891
 $42 = $41; //@line 1892
 HEAP32[$42 >> 2] = $14; //@line 1893
 $43 = $ReallocAsyncCtx4 + 16 | 0; //@line 1894
 $44 = $43; //@line 1895
 $45 = $44; //@line 1896
 HEAP32[$45 >> 2] = $18; //@line 1897
 $46 = $44 + 4 | 0; //@line 1898
 $47 = $46; //@line 1899
 HEAP32[$47 >> 2] = $21; //@line 1900
 $48 = $ReallocAsyncCtx4 + 24 | 0; //@line 1901
 HEAP32[$48 >> 2] = $23; //@line 1902
 $49 = $ReallocAsyncCtx4 + 28 | 0; //@line 1903
 HEAP32[$49 >> 2] = $25; //@line 1904
 sp = STACKTOP; //@line 1905
 return;
}
function __ZN20SimulatorBlockDevice4readEPvyy__async_cb_31($0) {
 $0 = $0 | 0;
 var $11 = 0, $14 = 0, $16 = 0, $18 = 0, $2 = 0, $21 = 0, $23 = 0, $25 = 0, $27 = 0, $32 = 0, $38 = 0, $39 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $7 = 0, $9 = 0, $ReallocAsyncCtx4 = 0, sp = 0;
 sp = STACKTOP; //@line 4548
 $2 = $0 + 8 | 0; //@line 4550
 $7 = HEAP32[$2 + 4 >> 2] | 0; //@line 4555
 $9 = $0 + 16 | 0; //@line 4557
 $11 = HEAP32[$9 >> 2] | 0; //@line 4559
 $14 = HEAP32[$9 + 4 >> 2] | 0; //@line 4562
 $16 = $0 + 24 | 0; //@line 4564
 $18 = HEAP32[$16 >> 2] | 0; //@line 4566
 $21 = HEAP32[$16 + 4 >> 2] | 0; //@line 4569
 $23 = HEAP32[$0 + 32 >> 2] | 0; //@line 4571
 $25 = HEAP32[$0 + 36 >> 2] | 0; //@line 4573
 $27 = ___async_retval; //@line 4575
 $32 = HEAP32[$27 + 4 >> 2] | 0; //@line 4580
 if (!($7 >>> 0 > $32 >>> 0 | (($7 | 0) == ($32 | 0) ? (HEAP32[$2 >> 2] | 0) >>> 0 > (HEAP32[$27 >> 2] | 0) >>> 0 : 0))) {
  _emscripten_asm_const_iiiii(9, HEAP32[$23 + 4 >> 2] | 0, $25 | 0, $11 | 0, $18 | 0) | 0; //@line 4589
  HEAP32[___async_retval >> 2] = 0; //@line 4591
  return;
 }
 $ReallocAsyncCtx4 = _emscripten_realloc_async_context(32) | 0; //@line 4594
 _mbed_assert_internal(2192, 1919, 83); //@line 4595
 if (___async) {
  HEAP32[$ReallocAsyncCtx4 >> 2] = 79; //@line 4598
  $38 = $ReallocAsyncCtx4 + 8 | 0; //@line 4599
  $39 = $38; //@line 4600
  $40 = $39; //@line 4601
  HEAP32[$40 >> 2] = $11; //@line 4602
  $41 = $39 + 4 | 0; //@line 4603
  $42 = $41; //@line 4604
  HEAP32[$42 >> 2] = $14; //@line 4605
  $43 = $ReallocAsyncCtx4 + 16 | 0; //@line 4606
  $44 = $43; //@line 4607
  $45 = $44; //@line 4608
  HEAP32[$45 >> 2] = $18; //@line 4609
  $46 = $44 + 4 | 0; //@line 4610
  $47 = $46; //@line 4611
  HEAP32[$47 >> 2] = $21; //@line 4612
  $48 = $ReallocAsyncCtx4 + 24 | 0; //@line 4613
  HEAP32[$48 >> 2] = $23; //@line 4614
  $49 = $ReallocAsyncCtx4 + 28 | 0; //@line 4615
  HEAP32[$49 >> 2] = $25; //@line 4616
  sp = STACKTOP; //@line 4617
  return;
 }
 ___async_unwind = 0; //@line 4620
 HEAP32[$ReallocAsyncCtx4 >> 2] = 79; //@line 4621
 $38 = $ReallocAsyncCtx4 + 8 | 0; //@line 4622
 $39 = $38; //@line 4623
 $40 = $39; //@line 4624
 HEAP32[$40 >> 2] = $11; //@line 4625
 $41 = $39 + 4 | 0; //@line 4626
 $42 = $41; //@line 4627
 HEAP32[$42 >> 2] = $14; //@line 4628
 $43 = $ReallocAsyncCtx4 + 16 | 0; //@line 4629
 $44 = $43; //@line 4630
 $45 = $44; //@line 4631
 HEAP32[$45 >> 2] = $18; //@line 4632
 $46 = $44 + 4 | 0; //@line 4633
 $47 = $46; //@line 4634
 HEAP32[$47 >> 2] = $21; //@line 4635
 $48 = $ReallocAsyncCtx4 + 24 | 0; //@line 4636
 HEAP32[$48 >> 2] = $23; //@line 4637
 $49 = $ReallocAsyncCtx4 + 28 | 0; //@line 4638
 HEAP32[$49 >> 2] = $25; //@line 4639
 sp = STACKTOP; //@line 4640
 return;
}
function _mbed_error_vfprintf($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$01213 = 0, $$014 = 0, $2 = 0, $24 = 0, $3 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, $AsyncCtx7 = 0, label = 0, sp = 0, $$01213$looptemp = 0;
 sp = STACKTOP; //@line 2832
 STACKTOP = STACKTOP + 128 | 0; //@line 2833
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(128); //@line 2833
 $2 = sp; //@line 2834
 $AsyncCtx = _emscripten_alloc_async_context(12, sp) | 0; //@line 2835
 $3 = _vsnprintf($2, 128, $0, $1) | 0; //@line 2836
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 67; //@line 2839
  HEAP32[$AsyncCtx + 4 >> 2] = $2; //@line 2841
  HEAP32[$AsyncCtx + 8 >> 2] = $2; //@line 2843
  sp = STACKTOP; //@line 2844
  STACKTOP = sp; //@line 2845
  return;
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 2847
 if (($3 | 0) <= 0) {
  STACKTOP = sp; //@line 2850
  return;
 }
 if (!(HEAP32[1465] | 0)) {
  _serial_init(5864, 2, 3); //@line 2855
  $$01213 = 0; //@line 2856
  $$014 = 0; //@line 2856
 } else {
  $$01213 = 0; //@line 2858
  $$014 = 0; //@line 2858
 }
 while (1) {
  $$01213$looptemp = $$01213;
  $$01213 = HEAP8[$2 + $$014 >> 0] | 0; //@line 2862
  if (!($$01213$looptemp << 24 >> 24 == 13 | $$01213 << 24 >> 24 != 10)) {
   $AsyncCtx7 = _emscripten_alloc_async_context(24, sp) | 0; //@line 2867
   _serial_putc(5864, 13); //@line 2868
   if (___async) {
    label = 8; //@line 2871
    break;
   }
   _emscripten_free_async_context($AsyncCtx7 | 0); //@line 2874
  }
  $AsyncCtx3 = _emscripten_alloc_async_context(24, sp) | 0; //@line 2877
  _serial_putc(5864, $$01213 << 24 >> 24); //@line 2878
  if (___async) {
   label = 11; //@line 2881
   break;
  }
  _emscripten_free_async_context($AsyncCtx3 | 0); //@line 2884
  $24 = $$014 + 1 | 0; //@line 2885
  if (($24 | 0) == ($3 | 0)) {
   label = 13; //@line 2888
   break;
  } else {
   $$014 = $24; //@line 2891
  }
 }
 if ((label | 0) == 8) {
  HEAP32[$AsyncCtx7 >> 2] = 68; //@line 2895
  HEAP8[$AsyncCtx7 + 4 >> 0] = $$01213; //@line 2897
  HEAP32[$AsyncCtx7 + 8 >> 2] = $$014; //@line 2899
  HEAP32[$AsyncCtx7 + 12 >> 2] = $3; //@line 2901
  HEAP32[$AsyncCtx7 + 16 >> 2] = $2; //@line 2903
  HEAP32[$AsyncCtx7 + 20 >> 2] = $2; //@line 2905
  sp = STACKTOP; //@line 2906
  STACKTOP = sp; //@line 2907
  return;
 } else if ((label | 0) == 11) {
  HEAP32[$AsyncCtx3 >> 2] = 69; //@line 2910
  HEAP32[$AsyncCtx3 + 4 >> 2] = $$014; //@line 2912
  HEAP32[$AsyncCtx3 + 8 >> 2] = $3; //@line 2914
  HEAP32[$AsyncCtx3 + 12 >> 2] = $2; //@line 2916
  HEAP8[$AsyncCtx3 + 16 >> 0] = $$01213; //@line 2918
  HEAP32[$AsyncCtx3 + 20 >> 2] = $2; //@line 2920
  sp = STACKTOP; //@line 2921
  STACKTOP = sp; //@line 2922
  return;
 } else if ((label | 0) == 13) {
  STACKTOP = sp; //@line 2925
  return;
 }
}
function __ZNK10__cxxabiv121__vmi_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb_3($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $20 = 0, $22 = 0, $24 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 1191
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 1195
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 1197
 $8 = HEAP8[$0 + 16 >> 0] | 0; //@line 1199
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 1201
 $12 = HEAP8[$0 + 24 >> 0] | 0; //@line 1203
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 1205
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 1207
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 1209
 $20 = HEAP32[$0 + 40 >> 2] | 0; //@line 1211
 $22 = HEAP8[$0 + 44 >> 0] & 1; //@line 1214
 $24 = HEAP32[$0 + 48 >> 2] | 0; //@line 1216
 do {
  if ((HEAP32[$0 + 4 >> 2] | 0) > 1) {
   $26 = $4 + 24 | 0; //@line 1220
   $27 = $6 + 24 | 0; //@line 1221
   $28 = $4 + 8 | 0; //@line 1222
   $29 = $6 + 54 | 0; //@line 1223
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
    HEAP8[$10 >> 0] = 0; //@line 1253
    HEAP8[$14 >> 0] = 0; //@line 1254
    $ReallocAsyncCtx = _emscripten_realloc_async_context(60) | 0; //@line 1255
    __ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($26, $6, $16, $18, $20, $22); //@line 1256
    if (!___async) {
     ___async_unwind = 0; //@line 1259
    }
    HEAP32[$ReallocAsyncCtx >> 2] = 143; //@line 1261
    HEAP32[$ReallocAsyncCtx + 4 >> 2] = $26; //@line 1263
    HEAP32[$ReallocAsyncCtx + 8 >> 2] = $24; //@line 1265
    HEAP32[$ReallocAsyncCtx + 12 >> 2] = $29; //@line 1267
    HEAP8[$ReallocAsyncCtx + 16 >> 0] = $8; //@line 1269
    HEAP32[$ReallocAsyncCtx + 20 >> 2] = $10; //@line 1271
    HEAP8[$ReallocAsyncCtx + 24 >> 0] = $12; //@line 1273
    HEAP32[$ReallocAsyncCtx + 28 >> 2] = $14; //@line 1275
    HEAP32[$ReallocAsyncCtx + 32 >> 2] = $27; //@line 1277
    HEAP32[$ReallocAsyncCtx + 36 >> 2] = $28; //@line 1279
    HEAP32[$ReallocAsyncCtx + 40 >> 2] = $6; //@line 1281
    HEAP32[$ReallocAsyncCtx + 44 >> 2] = $16; //@line 1283
    HEAP32[$ReallocAsyncCtx + 48 >> 2] = $18; //@line 1285
    HEAP32[$ReallocAsyncCtx + 52 >> 2] = $20; //@line 1287
    HEAP8[$ReallocAsyncCtx + 56 >> 0] = $22 & 1; //@line 1290
    sp = STACKTOP; //@line 1291
    return;
   }
  }
 } while (0);
 HEAP8[$10 >> 0] = $8; //@line 1296
 HEAP8[$14 >> 0] = $12; //@line 1297
 return;
}
function _main__async_cb_41($0) {
 $0 = $0 | 0;
 var $$expand_i1_val = 0, $10 = 0, $11 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $19 = 0, $22 = 0, $23 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx = 0, $ReallocAsyncCtx2 = 0, $ReallocAsyncCtx8 = 0, sp = 0;
 sp = STACKTOP; //@line 4920
 $4 = HEAP8[$0 + 8 >> 0] & 1; //@line 4925
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 4927
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 4929
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 4931
 $11 = HEAP32[HEAP32[$0 + 4 >> 2] >> 2] | 0; //@line 4932
 if ($11 | 0) {
  $14 = HEAP32[$11 + 8 >> 2] | 0; //@line 4936
  $ReallocAsyncCtx = _emscripten_realloc_async_context(16) | 0; //@line 4937
  FUNCTION_TABLE_vi[$14 & 255]($6); //@line 4938
  if (___async) {
   HEAP32[$ReallocAsyncCtx >> 2] = 99; //@line 4941
   $15 = $ReallocAsyncCtx + 4 | 0; //@line 4942
   $$expand_i1_val = $4 & 1; //@line 4943
   HEAP8[$15 >> 0] = $$expand_i1_val; //@line 4944
   $16 = $ReallocAsyncCtx + 8 | 0; //@line 4945
   HEAP32[$16 >> 2] = $8; //@line 4946
   $17 = $ReallocAsyncCtx + 12 | 0; //@line 4947
   HEAP32[$17 >> 2] = $10; //@line 4948
   sp = STACKTOP; //@line 4949
   return;
  }
  ___async_unwind = 0; //@line 4952
  HEAP32[$ReallocAsyncCtx >> 2] = 99; //@line 4953
  $15 = $ReallocAsyncCtx + 4 | 0; //@line 4954
  $$expand_i1_val = $4 & 1; //@line 4955
  HEAP8[$15 >> 0] = $$expand_i1_val; //@line 4956
  $16 = $ReallocAsyncCtx + 8 | 0; //@line 4957
  HEAP32[$16 >> 2] = $8; //@line 4958
  $17 = $ReallocAsyncCtx + 12 | 0; //@line 4959
  HEAP32[$17 >> 2] = $10; //@line 4960
  sp = STACKTOP; //@line 4961
  return;
 }
 if (!$4) {
  $19 = (HEAP32[$8 >> 2] | 0) + -1 | 0; //@line 4966
  HEAP32[$8 >> 2] = $19; //@line 4967
  if (!$19) {
   $22 = HEAP32[$8 + 24 >> 2] | 0; //@line 4971
   $ReallocAsyncCtx2 = _emscripten_realloc_async_context(8) | 0; //@line 4972
   FUNCTION_TABLE_vi[$22 & 255]($10); //@line 4973
   if (___async) {
    HEAP32[$ReallocAsyncCtx2 >> 2] = 100; //@line 4976
    $23 = $ReallocAsyncCtx2 + 4 | 0; //@line 4977
    HEAP32[$23 >> 2] = $8; //@line 4978
    sp = STACKTOP; //@line 4979
    return;
   }
   ___async_unwind = 0; //@line 4982
   HEAP32[$ReallocAsyncCtx2 >> 2] = 100; //@line 4983
   $23 = $ReallocAsyncCtx2 + 4 | 0; //@line 4984
   HEAP32[$23 >> 2] = $8; //@line 4985
   sp = STACKTOP; //@line 4986
   return;
  }
 }
 $ReallocAsyncCtx8 = _emscripten_realloc_async_context(4) | 0; //@line 4990
 __ZN6events10EventQueue8dispatchEi(5876, -1); //@line 4991
 if (___async) {
  HEAP32[$ReallocAsyncCtx8 >> 2] = 102; //@line 4994
  sp = STACKTOP; //@line 4995
  return;
 }
 ___async_unwind = 0; //@line 4998
 HEAP32[$ReallocAsyncCtx8 >> 2] = 102; //@line 4999
 sp = STACKTOP; //@line 5000
 return;
}
function __ZNK10__cxxabiv121__vmi_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $20 = 0, $22 = 0, $24 = 0, $26 = 0, $28 = 0, $4 = 0, $43 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 1075
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 1079
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 1081
 $8 = HEAP8[$0 + 16 >> 0] | 0; //@line 1083
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 1085
 $12 = HEAP8[$0 + 24 >> 0] | 0; //@line 1087
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 1089
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 1091
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 1093
 $20 = HEAP32[$0 + 40 >> 2] | 0; //@line 1095
 $22 = HEAP32[$0 + 44 >> 2] | 0; //@line 1097
 $24 = HEAP32[$0 + 48 >> 2] | 0; //@line 1099
 $26 = HEAP32[$0 + 52 >> 2] | 0; //@line 1101
 $28 = HEAP8[$0 + 56 >> 0] & 1; //@line 1104
 $43 = (HEAP32[$0 + 4 >> 2] | 0) + 8 | 0; //@line 1105
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
    HEAP8[$10 >> 0] = 0; //@line 1138
    HEAP8[$14 >> 0] = 0; //@line 1139
    $ReallocAsyncCtx = _emscripten_realloc_async_context(60) | 0; //@line 1140
    __ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($43, $20, $22, $24, $26, $28); //@line 1141
    if (!___async) {
     ___async_unwind = 0; //@line 1144
    }
    HEAP32[$ReallocAsyncCtx >> 2] = 143; //@line 1146
    HEAP32[$ReallocAsyncCtx + 4 >> 2] = $43; //@line 1148
    HEAP32[$ReallocAsyncCtx + 8 >> 2] = $4; //@line 1150
    HEAP32[$ReallocAsyncCtx + 12 >> 2] = $6; //@line 1152
    HEAP8[$ReallocAsyncCtx + 16 >> 0] = $8; //@line 1154
    HEAP32[$ReallocAsyncCtx + 20 >> 2] = $10; //@line 1156
    HEAP8[$ReallocAsyncCtx + 24 >> 0] = $12; //@line 1158
    HEAP32[$ReallocAsyncCtx + 28 >> 2] = $14; //@line 1160
    HEAP32[$ReallocAsyncCtx + 32 >> 2] = $16; //@line 1162
    HEAP32[$ReallocAsyncCtx + 36 >> 2] = $18; //@line 1164
    HEAP32[$ReallocAsyncCtx + 40 >> 2] = $20; //@line 1166
    HEAP32[$ReallocAsyncCtx + 44 >> 2] = $22; //@line 1168
    HEAP32[$ReallocAsyncCtx + 48 >> 2] = $24; //@line 1170
    HEAP32[$ReallocAsyncCtx + 52 >> 2] = $26; //@line 1172
    HEAP8[$ReallocAsyncCtx + 56 >> 0] = $28 & 1; //@line 1175
    sp = STACKTOP; //@line 1176
    return;
   }
  }
 } while (0);
 HEAP8[$10 >> 0] = $8; //@line 1181
 HEAP8[$14 >> 0] = $12; //@line 1182
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
 sp = STACKTOP; //@line 681
 do {
  if (HEAP8[$0 + 184 >> 0] | 0) {
   $AsyncCtx = _emscripten_alloc_async_context(12, sp) | 0; //@line 687
   _wait_ms(10); //@line 688
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 26; //@line 691
    HEAP32[$AsyncCtx + 4 >> 2] = $1; //@line 693
    HEAP32[$AsyncCtx + 8 >> 2] = $0; //@line 695
    sp = STACKTOP; //@line 696
    return 0; //@line 697
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 699
    break;
   }
  }
 } while (0);
 $8 = $1 + 39 & -4; //@line 705
 $9 = $0 + 156 | 0; //@line 706
 _equeue_mutex_lock($9); //@line 707
 $10 = $0 + 24 | 0; //@line 708
 $11 = HEAP32[$10 >> 2] | 0; //@line 709
 L7 : do {
  if (!$11) {
   label = 11; //@line 713
  } else {
   $$03842$i = $10; //@line 715
   $14 = $11; //@line 715
   while (1) {
    if ((HEAP32[$14 >> 2] | 0) >>> 0 >= $8 >>> 0) {
     break;
    }
    $20 = $14 + 8 | 0; //@line 722
    $21 = HEAP32[$20 >> 2] | 0; //@line 723
    if (!$21) {
     label = 11; //@line 726
     break L7;
    } else {
     $$03842$i = $20; //@line 729
     $14 = $21; //@line 729
    }
   }
   $17 = HEAP32[$14 + 12 >> 2] | 0; //@line 733
   if (!$17) {
    $$038$sink$i = $$03842$i; //@line 736
   } else {
    HEAP32[$$03842$i >> 2] = $17; //@line 738
    $$038$sink$i = $17 + 8 | 0; //@line 740
   }
   HEAP32[$$038$sink$i >> 2] = HEAP32[$14 + 8 >> 2]; //@line 744
   _equeue_mutex_unlock($9); //@line 745
   $$1$i9 = $14; //@line 746
  }
 } while (0);
 do {
  if ((label | 0) == 11) {
   $23 = $0 + 28 | 0; //@line 751
   $24 = HEAP32[$23 >> 2] | 0; //@line 752
   if ($24 >>> 0 < $8 >>> 0) {
    _equeue_mutex_unlock($9); //@line 755
    $$0 = 0; //@line 756
    return $$0 | 0; //@line 757
   } else {
    $26 = $0 + 32 | 0; //@line 759
    $27 = HEAP32[$26 >> 2] | 0; //@line 760
    HEAP32[$26 >> 2] = $27 + $8; //@line 762
    HEAP32[$23 >> 2] = $24 - $8; //@line 764
    HEAP32[$27 >> 2] = $8; //@line 765
    HEAP8[$27 + 4 >> 0] = 1; //@line 767
    _equeue_mutex_unlock($9); //@line 768
    if (!$27) {
     $$0 = 0; //@line 771
    } else {
     $$1$i9 = $27; //@line 773
     break;
    }
    return $$0 | 0; //@line 776
   }
  }
 } while (0);
 HEAP32[$$1$i9 + 20 >> 2] = 0; //@line 781
 HEAP32[$$1$i9 + 24 >> 2] = -1; //@line 783
 HEAP32[$$1$i9 + 28 >> 2] = 0; //@line 785
 $$0 = $$1$i9 + 36 | 0; //@line 787
 return $$0 | 0; //@line 788
}
function __ZN20SimulatorBlockDevice5eraseEyy__async_cb_28($0) {
 $0 = $0 | 0;
 var $11 = 0, $14 = 0, $16 = 0, $18 = 0, $2 = 0, $21 = 0, $23 = 0, $25 = 0, $30 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $7 = 0, $9 = 0, $ReallocAsyncCtx4 = 0, sp = 0;
 sp = STACKTOP; //@line 4049
 $2 = $0 + 8 | 0; //@line 4051
 $7 = HEAP32[$2 + 4 >> 2] | 0; //@line 4056
 $9 = $0 + 16 | 0; //@line 4058
 $11 = HEAP32[$9 >> 2] | 0; //@line 4060
 $14 = HEAP32[$9 + 4 >> 2] | 0; //@line 4063
 $16 = $0 + 24 | 0; //@line 4065
 $18 = HEAP32[$16 >> 2] | 0; //@line 4067
 $21 = HEAP32[$16 + 4 >> 2] | 0; //@line 4070
 $23 = HEAP32[$0 + 32 >> 2] | 0; //@line 4072
 $25 = ___async_retval; //@line 4074
 $30 = HEAP32[$25 + 4 >> 2] | 0; //@line 4079
 if (!($7 >>> 0 > $30 >>> 0 | (($7 | 0) == ($30 | 0) ? (HEAP32[$2 >> 2] | 0) >>> 0 > (HEAP32[$25 >> 2] | 0) >>> 0 : 0))) {
  _emscripten_asm_const_iiii(11, HEAP32[$23 + 4 >> 2] | 0, $11 | 0, $18 | 0) | 0; //@line 4088
  HEAP32[___async_retval >> 2] = 0; //@line 4090
  return;
 }
 $ReallocAsyncCtx4 = _emscripten_realloc_async_context(32) | 0; //@line 4093
 _mbed_assert_internal(1892, 1919, 113); //@line 4094
 if (___async) {
  HEAP32[$ReallocAsyncCtx4 >> 2] = 87; //@line 4097
  $36 = $ReallocAsyncCtx4 + 8 | 0; //@line 4098
  $37 = $36; //@line 4099
  $38 = $37; //@line 4100
  HEAP32[$38 >> 2] = $11; //@line 4101
  $39 = $37 + 4 | 0; //@line 4102
  $40 = $39; //@line 4103
  HEAP32[$40 >> 2] = $14; //@line 4104
  $41 = $ReallocAsyncCtx4 + 16 | 0; //@line 4105
  $42 = $41; //@line 4106
  $43 = $42; //@line 4107
  HEAP32[$43 >> 2] = $18; //@line 4108
  $44 = $42 + 4 | 0; //@line 4109
  $45 = $44; //@line 4110
  HEAP32[$45 >> 2] = $21; //@line 4111
  $46 = $ReallocAsyncCtx4 + 24 | 0; //@line 4112
  HEAP32[$46 >> 2] = $23; //@line 4113
  sp = STACKTOP; //@line 4114
  return;
 }
 ___async_unwind = 0; //@line 4117
 HEAP32[$ReallocAsyncCtx4 >> 2] = 87; //@line 4118
 $36 = $ReallocAsyncCtx4 + 8 | 0; //@line 4119
 $37 = $36; //@line 4120
 $38 = $37; //@line 4121
 HEAP32[$38 >> 2] = $11; //@line 4122
 $39 = $37 + 4 | 0; //@line 4123
 $40 = $39; //@line 4124
 HEAP32[$40 >> 2] = $14; //@line 4125
 $41 = $ReallocAsyncCtx4 + 16 | 0; //@line 4126
 $42 = $41; //@line 4127
 $43 = $42; //@line 4128
 HEAP32[$43 >> 2] = $18; //@line 4129
 $44 = $42 + 4 | 0; //@line 4130
 $45 = $44; //@line 4131
 HEAP32[$45 >> 2] = $21; //@line 4132
 $46 = $ReallocAsyncCtx4 + 24 | 0; //@line 4133
 HEAP32[$46 >> 2] = $23; //@line 4134
 sp = STACKTOP; //@line 4135
 return;
}
function __ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$0 = 0, $$2 = 0, $17 = 0, $18 = 0, $3 = 0, $6 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, dest = 0, sp = 0, stop = 0;
 sp = STACKTOP; //@line 12678
 STACKTOP = STACKTOP + 64 | 0; //@line 12679
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(64); //@line 12679
 $3 = sp; //@line 12680
 if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, $1, 0) | 0) {
  $$2 = 1; //@line 12683
 } else {
  if (!$1) {
   $$2 = 0; //@line 12687
  } else {
   $AsyncCtx3 = _emscripten_alloc_async_context(16, sp) | 0; //@line 12689
   $6 = ___dynamic_cast($1, 88, 72, 0) | 0; //@line 12690
   if (___async) {
    HEAP32[$AsyncCtx3 >> 2] = 132; //@line 12693
    HEAP32[$AsyncCtx3 + 4 >> 2] = $3; //@line 12695
    HEAP32[$AsyncCtx3 + 8 >> 2] = $0; //@line 12697
    HEAP32[$AsyncCtx3 + 12 >> 2] = $2; //@line 12699
    sp = STACKTOP; //@line 12700
    STACKTOP = sp; //@line 12701
    return 0; //@line 12701
   }
   _emscripten_free_async_context($AsyncCtx3 | 0); //@line 12703
   if (!$6) {
    $$2 = 0; //@line 12706
   } else {
    dest = $3 + 4 | 0; //@line 12709
    stop = dest + 52 | 0; //@line 12709
    do {
     HEAP32[dest >> 2] = 0; //@line 12709
     dest = dest + 4 | 0; //@line 12709
    } while ((dest | 0) < (stop | 0));
    HEAP32[$3 >> 2] = $6; //@line 12710
    HEAP32[$3 + 8 >> 2] = $0; //@line 12712
    HEAP32[$3 + 12 >> 2] = -1; //@line 12714
    HEAP32[$3 + 48 >> 2] = 1; //@line 12716
    $17 = HEAP32[(HEAP32[$6 >> 2] | 0) + 28 >> 2] | 0; //@line 12719
    $18 = HEAP32[$2 >> 2] | 0; //@line 12720
    $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 12721
    FUNCTION_TABLE_viiii[$17 & 3]($6, $3, $18, 1); //@line 12722
    if (___async) {
     HEAP32[$AsyncCtx >> 2] = 133; //@line 12725
     HEAP32[$AsyncCtx + 4 >> 2] = $3; //@line 12727
     HEAP32[$AsyncCtx + 8 >> 2] = $2; //@line 12729
     HEAP32[$AsyncCtx + 12 >> 2] = $3; //@line 12731
     sp = STACKTOP; //@line 12732
     STACKTOP = sp; //@line 12733
     return 0; //@line 12733
    }
    _emscripten_free_async_context($AsyncCtx | 0); //@line 12735
    if ((HEAP32[$3 + 24 >> 2] | 0) == 1) {
     HEAP32[$2 >> 2] = HEAP32[$3 + 16 >> 2]; //@line 12742
     $$0 = 1; //@line 12743
    } else {
     $$0 = 0; //@line 12745
    }
    $$2 = $$0; //@line 12747
   }
  }
 }
 STACKTOP = sp; //@line 12751
 return $$2 | 0; //@line 12751
}
function _vsnprintf($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $$$015 = 0, $$0 = 0, $$014 = 0, $$015 = 0, $11 = 0, $14 = 0, $16 = 0, $17 = 0, $19 = 0, $26 = 0, $4 = 0, $5 = 0, $AsyncCtx = 0, dest = 0, label = 0, sp = 0, src = 0, stop = 0;
 sp = STACKTOP; //@line 12200
 STACKTOP = STACKTOP + 128 | 0; //@line 12201
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(128); //@line 12201
 $4 = sp + 124 | 0; //@line 12202
 $5 = sp; //@line 12203
 dest = $5; //@line 12204
 src = 840; //@line 12204
 stop = dest + 124 | 0; //@line 12204
 do {
  HEAP32[dest >> 2] = HEAP32[src >> 2]; //@line 12204
  dest = dest + 4 | 0; //@line 12204
  src = src + 4 | 0; //@line 12204
 } while ((dest | 0) < (stop | 0));
 if (($1 + -1 | 0) >>> 0 > 2147483646) {
  if (!$1) {
   $$014 = $4; //@line 12210
   $$015 = 1; //@line 12210
   label = 4; //@line 12211
  } else {
   HEAP32[(___errno_location() | 0) >> 2] = 75; //@line 12214
   $$0 = -1; //@line 12215
  }
 } else {
  $$014 = $0; //@line 12218
  $$015 = $1; //@line 12218
  label = 4; //@line 12219
 }
 if ((label | 0) == 4) {
  $11 = -2 - $$014 | 0; //@line 12223
  $$$015 = $$015 >>> 0 > $11 >>> 0 ? $11 : $$015; //@line 12225
  HEAP32[$5 + 48 >> 2] = $$$015; //@line 12227
  $14 = $5 + 20 | 0; //@line 12228
  HEAP32[$14 >> 2] = $$014; //@line 12229
  HEAP32[$5 + 44 >> 2] = $$014; //@line 12231
  $16 = $$014 + $$$015 | 0; //@line 12232
  $17 = $5 + 16 | 0; //@line 12233
  HEAP32[$17 >> 2] = $16; //@line 12234
  HEAP32[$5 + 28 >> 2] = $16; //@line 12236
  $AsyncCtx = _emscripten_alloc_async_context(24, sp) | 0; //@line 12237
  $19 = _vfprintf($5, $2, $3) | 0; //@line 12238
  if (___async) {
   HEAP32[$AsyncCtx >> 2] = 123; //@line 12241
   HEAP32[$AsyncCtx + 4 >> 2] = $$$015; //@line 12243
   HEAP32[$AsyncCtx + 8 >> 2] = $5; //@line 12245
   HEAP32[$AsyncCtx + 12 >> 2] = $4; //@line 12247
   HEAP32[$AsyncCtx + 16 >> 2] = $14; //@line 12249
   HEAP32[$AsyncCtx + 20 >> 2] = $17; //@line 12251
   sp = STACKTOP; //@line 12252
   STACKTOP = sp; //@line 12253
   return 0; //@line 12253
  }
  _emscripten_free_async_context($AsyncCtx | 0); //@line 12255
  if (!$$$015) {
   $$0 = $19; //@line 12258
  } else {
   $26 = HEAP32[$14 >> 2] | 0; //@line 12260
   HEAP8[$26 + ((($26 | 0) == (HEAP32[$17 >> 2] | 0)) << 31 >> 31) >> 0] = 0; //@line 12265
   $$0 = $19; //@line 12266
  }
 }
 STACKTOP = sp; //@line 12269
 return $$0 | 0; //@line 12269
}
function _equeue_alloc__async_cb($0) {
 $0 = $0 | 0;
 var $$0 = 0, $$038$sink$i = 0, $$03842$i = 0, $$1$i9 = 0, $12 = 0, $15 = 0, $18 = 0, $19 = 0, $21 = 0, $22 = 0, $24 = 0, $25 = 0, $34 = 0, $4 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0;
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 9336
 $6 = (HEAP32[$0 + 4 >> 2] | 0) + 39 & -4; //@line 9338
 $7 = $4 + 156 | 0; //@line 9339
 _equeue_mutex_lock($7); //@line 9340
 $8 = $4 + 24 | 0; //@line 9341
 $9 = HEAP32[$8 >> 2] | 0; //@line 9342
 L3 : do {
  if (!$9) {
   label = 9; //@line 9346
  } else {
   $$03842$i = $8; //@line 9348
   $12 = $9; //@line 9348
   while (1) {
    if ((HEAP32[$12 >> 2] | 0) >>> 0 >= $6 >>> 0) {
     break;
    }
    $18 = $12 + 8 | 0; //@line 9355
    $19 = HEAP32[$18 >> 2] | 0; //@line 9356
    if (!$19) {
     label = 9; //@line 9359
     break L3;
    } else {
     $$03842$i = $18; //@line 9362
     $12 = $19; //@line 9362
    }
   }
   $15 = HEAP32[$12 + 12 >> 2] | 0; //@line 9366
   if (!$15) {
    $$038$sink$i = $$03842$i; //@line 9369
   } else {
    HEAP32[$$03842$i >> 2] = $15; //@line 9371
    $$038$sink$i = $15 + 8 | 0; //@line 9373
   }
   HEAP32[$$038$sink$i >> 2] = HEAP32[$12 + 8 >> 2]; //@line 9377
   _equeue_mutex_unlock($7); //@line 9378
   $$1$i9 = $12; //@line 9379
  }
 } while (0);
 do {
  if ((label | 0) == 9) {
   $21 = $4 + 28 | 0; //@line 9384
   $22 = HEAP32[$21 >> 2] | 0; //@line 9385
   if ($22 >>> 0 < $6 >>> 0) {
    _equeue_mutex_unlock($7); //@line 9388
    $$0 = 0; //@line 9389
    $34 = ___async_retval; //@line 9390
    HEAP32[$34 >> 2] = $$0; //@line 9391
    return;
   } else {
    $24 = $4 + 32 | 0; //@line 9394
    $25 = HEAP32[$24 >> 2] | 0; //@line 9395
    HEAP32[$24 >> 2] = $25 + $6; //@line 9397
    HEAP32[$21 >> 2] = $22 - $6; //@line 9399
    HEAP32[$25 >> 2] = $6; //@line 9400
    HEAP8[$25 + 4 >> 0] = 1; //@line 9402
    _equeue_mutex_unlock($7); //@line 9403
    if (!$25) {
     $$0 = 0; //@line 9406
    } else {
     $$1$i9 = $25; //@line 9408
     break;
    }
    $34 = ___async_retval; //@line 9411
    HEAP32[$34 >> 2] = $$0; //@line 9412
    return;
   }
  }
 } while (0);
 HEAP32[$$1$i9 + 20 >> 2] = 0; //@line 9418
 HEAP32[$$1$i9 + 24 >> 2] = -1; //@line 9420
 HEAP32[$$1$i9 + 28 >> 2] = 0; //@line 9422
 $$0 = $$1$i9 + 36 | 0; //@line 9424
 $34 = ___async_retval; //@line 9425
 HEAP32[$34 >> 2] = $$0; //@line 9426
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
 sp = STACKTOP; //@line 795
 $2 = $1 + -36 | 0; //@line 796
 $4 = HEAP32[$1 + -8 >> 2] | 0; //@line 798
 do {
  if ($4 | 0) {
   $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 802
   FUNCTION_TABLE_vi[$4 & 255]($1); //@line 803
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 27; //@line 806
    HEAP32[$AsyncCtx + 4 >> 2] = $0; //@line 808
    HEAP32[$AsyncCtx + 8 >> 2] = $1; //@line 810
    HEAP32[$AsyncCtx + 12 >> 2] = $2; //@line 812
    sp = STACKTOP; //@line 813
    return;
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 816
    break;
   }
  }
 } while (0);
 $9 = $0 + 156 | 0; //@line 821
 _equeue_mutex_lock($9); //@line 822
 $10 = $0 + 24 | 0; //@line 823
 $11 = HEAP32[$10 >> 2] | 0; //@line 824
 L7 : do {
  if (!$11) {
   $$02329$i = $10; //@line 828
  } else {
   $13 = HEAP32[$2 >> 2] | 0; //@line 830
   $$025$i = $10; //@line 831
   $15 = $11; //@line 831
   while (1) {
    $14 = HEAP32[$15 >> 2] | 0; //@line 833
    if ($14 >>> 0 >= $13 >>> 0) {
     break;
    }
    $17 = $15 + 8 | 0; //@line 838
    $18 = HEAP32[$17 >> 2] | 0; //@line 839
    if (!$18) {
     $$02329$i = $17; //@line 842
     break L7;
    } else {
     $$025$i = $17; //@line 845
     $15 = $18; //@line 845
    }
   }
   if (($14 | 0) == ($13 | 0)) {
    HEAP32[$1 + -24 >> 2] = $15; //@line 851
    $$02330$i = $$025$i; //@line 854
    $$sink$in$i = (HEAP32[$$025$i >> 2] | 0) + 8 | 0; //@line 854
    $$sink21$i = HEAP32[$$sink$in$i >> 2] | 0; //@line 855
    $25 = $1 + -28 | 0; //@line 856
    HEAP32[$25 >> 2] = $$sink21$i; //@line 857
    HEAP32[$$02330$i >> 2] = $2; //@line 858
    _equeue_mutex_unlock($9); //@line 859
    return;
   } else {
    $$02329$i = $$025$i; //@line 862
   }
  }
 } while (0);
 HEAP32[$1 + -24 >> 2] = 0; //@line 867
 $$02330$i = $$02329$i; //@line 868
 $$sink$in$i = $$02329$i; //@line 868
 $$sink21$i = HEAP32[$$sink$in$i >> 2] | 0; //@line 869
 $25 = $1 + -28 | 0; //@line 870
 HEAP32[$25 >> 2] = $$sink21$i; //@line 871
 HEAP32[$$02330$i >> 2] = $2; //@line 872
 _equeue_mutex_unlock($9); //@line 873
 return;
}
function _fputc($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0 = 0, $13 = 0, $14 = 0, $19 = 0, $20 = 0, $21 = 0, $26 = 0, $27 = 0, $32 = 0, $34 = 0, $7 = 0, $8 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 12320
 if ((HEAP32[$1 + 76 >> 2] | 0) < 0) {
  label = 3; //@line 12325
 } else {
  if (!(___lockfile($1) | 0)) {
   label = 3; //@line 12330
  } else {
   $20 = $0 & 255; //@line 12332
   $21 = $0 & 255; //@line 12333
   if (($21 | 0) == (HEAP8[$1 + 75 >> 0] | 0)) {
    label = 12; //@line 12339
   } else {
    $26 = $1 + 20 | 0; //@line 12341
    $27 = HEAP32[$26 >> 2] | 0; //@line 12342
    if ($27 >>> 0 < (HEAP32[$1 + 16 >> 2] | 0) >>> 0) {
     HEAP32[$26 >> 2] = $27 + 1; //@line 12348
     HEAP8[$27 >> 0] = $20; //@line 12349
     $34 = $21; //@line 12350
    } else {
     label = 12; //@line 12352
    }
   }
   do {
    if ((label | 0) == 12) {
     $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 12357
     $32 = ___overflow($1, $0) | 0; //@line 12358
     if (___async) {
      HEAP32[$AsyncCtx >> 2] = 126; //@line 12361
      HEAP32[$AsyncCtx + 4 >> 2] = $1; //@line 12363
      sp = STACKTOP; //@line 12364
      return 0; //@line 12365
     } else {
      _emscripten_free_async_context($AsyncCtx | 0); //@line 12367
      $34 = $32; //@line 12368
      break;
     }
    }
   } while (0);
   ___unlockfile($1); //@line 12373
   $$0 = $34; //@line 12374
  }
 }
 do {
  if ((label | 0) == 3) {
   $7 = $0 & 255; //@line 12379
   $8 = $0 & 255; //@line 12380
   if (($8 | 0) != (HEAP8[$1 + 75 >> 0] | 0)) {
    $13 = $1 + 20 | 0; //@line 12386
    $14 = HEAP32[$13 >> 2] | 0; //@line 12387
    if ($14 >>> 0 < (HEAP32[$1 + 16 >> 2] | 0) >>> 0) {
     HEAP32[$13 >> 2] = $14 + 1; //@line 12393
     HEAP8[$14 >> 0] = $7; //@line 12394
     $$0 = $8; //@line 12395
     break;
    }
   }
   $AsyncCtx3 = _emscripten_alloc_async_context(4, sp) | 0; //@line 12399
   $19 = ___overflow($1, $0) | 0; //@line 12400
   if (___async) {
    HEAP32[$AsyncCtx3 >> 2] = 125; //@line 12403
    sp = STACKTOP; //@line 12404
    return 0; //@line 12405
   } else {
    _emscripten_free_async_context($AsyncCtx3 | 0); //@line 12407
    $$0 = $19; //@line 12408
    break;
   }
  }
 } while (0);
 return $$0 | 0; //@line 12413
}
function ___mo_lookup($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$090 = 0, $$094 = 0, $$4 = 0, $10 = 0, $13 = 0, $17 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $31 = 0, $35 = 0, $4 = 0, $44 = 0, $46 = 0, $49 = 0, $53 = 0, $63 = 0, $7 = 0;
 $4 = (HEAP32[$0 >> 2] | 0) + 1794895138 | 0; //@line 8189
 $7 = _swapc(HEAP32[$0 + 8 >> 2] | 0, $4) | 0; //@line 8192
 $10 = _swapc(HEAP32[$0 + 12 >> 2] | 0, $4) | 0; //@line 8195
 $13 = _swapc(HEAP32[$0 + 16 >> 2] | 0, $4) | 0; //@line 8198
 L1 : do {
  if ($7 >>> 0 < $1 >>> 2 >>> 0) {
   $17 = $1 - ($7 << 2) | 0; //@line 8204
   if ($10 >>> 0 < $17 >>> 0 & $13 >>> 0 < $17 >>> 0) {
    if (!(($13 | $10) & 3)) {
     $23 = $10 >>> 2; //@line 8213
     $24 = $13 >>> 2; //@line 8214
     $$090 = 0; //@line 8215
     $$094 = $7; //@line 8215
     while (1) {
      $25 = $$094 >>> 1; //@line 8217
      $26 = $$090 + $25 | 0; //@line 8218
      $27 = $26 << 1; //@line 8219
      $28 = $27 + $23 | 0; //@line 8220
      $31 = _swapc(HEAP32[$0 + ($28 << 2) >> 2] | 0, $4) | 0; //@line 8223
      $35 = _swapc(HEAP32[$0 + ($28 + 1 << 2) >> 2] | 0, $4) | 0; //@line 8227
      if (!($35 >>> 0 < $1 >>> 0 & $31 >>> 0 < ($1 - $35 | 0) >>> 0)) {
       $$4 = 0; //@line 8233
       break L1;
      }
      if (HEAP8[$0 + ($35 + $31) >> 0] | 0) {
       $$4 = 0; //@line 8241
       break L1;
      }
      $44 = _strcmp($2, $0 + $35 | 0) | 0; //@line 8245
      if (!$44) {
       break;
      }
      $63 = ($44 | 0) < 0; //@line 8251
      if (($$094 | 0) == 1) {
       $$4 = 0; //@line 8256
       break L1;
      } else {
       $$090 = $63 ? $$090 : $26; //@line 8259
       $$094 = $63 ? $25 : $$094 - $25 | 0; //@line 8259
      }
     }
     $46 = $27 + $24 | 0; //@line 8262
     $49 = _swapc(HEAP32[$0 + ($46 << 2) >> 2] | 0, $4) | 0; //@line 8265
     $53 = _swapc(HEAP32[$0 + ($46 + 1 << 2) >> 2] | 0, $4) | 0; //@line 8269
     if ($53 >>> 0 < $1 >>> 0 & $49 >>> 0 < ($1 - $53 | 0) >>> 0) {
      $$4 = (HEAP8[$0 + ($53 + $49) >> 0] | 0) == 0 ? $0 + $53 | 0 : 0; //@line 8281
     } else {
      $$4 = 0; //@line 8283
     }
    } else {
     $$4 = 0; //@line 8286
    }
   } else {
    $$4 = 0; //@line 8289
   }
  } else {
   $$4 = 0; //@line 8292
  }
 } while (0);
 return $$4 | 0; //@line 8295
}
function _putc($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0 = 0, $13 = 0, $14 = 0, $19 = 0, $20 = 0, $21 = 0, $26 = 0, $27 = 0, $32 = 0, $34 = 0, $7 = 0, $8 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 7854
 if ((HEAP32[$1 + 76 >> 2] | 0) < 0) {
  label = 3; //@line 7859
 } else {
  if (!(___lockfile($1) | 0)) {
   label = 3; //@line 7864
  } else {
   $20 = $0 & 255; //@line 7866
   $21 = $0 & 255; //@line 7867
   if (($21 | 0) == (HEAP8[$1 + 75 >> 0] | 0)) {
    label = 12; //@line 7873
   } else {
    $26 = $1 + 20 | 0; //@line 7875
    $27 = HEAP32[$26 >> 2] | 0; //@line 7876
    if ($27 >>> 0 < (HEAP32[$1 + 16 >> 2] | 0) >>> 0) {
     HEAP32[$26 >> 2] = $27 + 1; //@line 7882
     HEAP8[$27 >> 0] = $20; //@line 7883
     $34 = $21; //@line 7884
    } else {
     label = 12; //@line 7886
    }
   }
   do {
    if ((label | 0) == 12) {
     $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 7891
     $32 = ___overflow($1, $0) | 0; //@line 7892
     if (___async) {
      HEAP32[$AsyncCtx >> 2] = 113; //@line 7895
      HEAP32[$AsyncCtx + 4 >> 2] = $1; //@line 7897
      sp = STACKTOP; //@line 7898
      return 0; //@line 7899
     } else {
      _emscripten_free_async_context($AsyncCtx | 0); //@line 7901
      $34 = $32; //@line 7902
      break;
     }
    }
   } while (0);
   ___unlockfile($1); //@line 7907
   $$0 = $34; //@line 7908
  }
 }
 do {
  if ((label | 0) == 3) {
   $7 = $0 & 255; //@line 7913
   $8 = $0 & 255; //@line 7914
   if (($8 | 0) != (HEAP8[$1 + 75 >> 0] | 0)) {
    $13 = $1 + 20 | 0; //@line 7920
    $14 = HEAP32[$13 >> 2] | 0; //@line 7921
    if ($14 >>> 0 < (HEAP32[$1 + 16 >> 2] | 0) >>> 0) {
     HEAP32[$13 >> 2] = $14 + 1; //@line 7927
     HEAP8[$14 >> 0] = $7; //@line 7928
     $$0 = $8; //@line 7929
     break;
    }
   }
   $AsyncCtx3 = _emscripten_alloc_async_context(4, sp) | 0; //@line 7933
   $19 = ___overflow($1, $0) | 0; //@line 7934
   if (___async) {
    HEAP32[$AsyncCtx3 >> 2] = 112; //@line 7937
    sp = STACKTOP; //@line 7938
    return 0; //@line 7939
   } else {
    _emscripten_free_async_context($AsyncCtx3 | 0); //@line 7941
    $$0 = $19; //@line 7942
    break;
   }
  }
 } while (0);
 return $$0 | 0; //@line 7947
}
function ___fflush_unlocked($0) {
 $0 = $0 | 0;
 var $$0 = 0, $1 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $22 = 0, $3 = 0, $7 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 8574
 $1 = $0 + 20 | 0; //@line 8575
 $3 = $0 + 28 | 0; //@line 8577
 do {
  if ((HEAP32[$1 >> 2] | 0) >>> 0 > (HEAP32[$3 >> 2] | 0) >>> 0) {
   $7 = HEAP32[$0 + 36 >> 2] | 0; //@line 8583
   $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 8584
   FUNCTION_TABLE_iiii[$7 & 7]($0, 0, 0) | 0; //@line 8585
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 119; //@line 8588
    HEAP32[$AsyncCtx + 4 >> 2] = $1; //@line 8590
    HEAP32[$AsyncCtx + 8 >> 2] = $0; //@line 8592
    HEAP32[$AsyncCtx + 12 >> 2] = $3; //@line 8594
    sp = STACKTOP; //@line 8595
    return 0; //@line 8596
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 8598
    if (!(HEAP32[$1 >> 2] | 0)) {
     $$0 = -1; //@line 8602
     break;
    } else {
     label = 5; //@line 8605
     break;
    }
   }
  } else {
   label = 5; //@line 8610
  }
 } while (0);
 if ((label | 0) == 5) {
  $13 = $0 + 4 | 0; //@line 8614
  $14 = HEAP32[$13 >> 2] | 0; //@line 8615
  $15 = $0 + 8 | 0; //@line 8616
  $16 = HEAP32[$15 >> 2] | 0; //@line 8617
  do {
   if ($14 >>> 0 < $16 >>> 0) {
    $22 = HEAP32[$0 + 40 >> 2] | 0; //@line 8625
    $AsyncCtx3 = _emscripten_alloc_async_context(24, sp) | 0; //@line 8626
    FUNCTION_TABLE_iiii[$22 & 7]($0, $14 - $16 | 0, 1) | 0; //@line 8627
    if (___async) {
     HEAP32[$AsyncCtx3 >> 2] = 120; //@line 8630
     HEAP32[$AsyncCtx3 + 4 >> 2] = $0; //@line 8632
     HEAP32[$AsyncCtx3 + 8 >> 2] = $3; //@line 8634
     HEAP32[$AsyncCtx3 + 12 >> 2] = $1; //@line 8636
     HEAP32[$AsyncCtx3 + 16 >> 2] = $15; //@line 8638
     HEAP32[$AsyncCtx3 + 20 >> 2] = $13; //@line 8640
     sp = STACKTOP; //@line 8641
     return 0; //@line 8642
    } else {
     _emscripten_free_async_context($AsyncCtx3 | 0); //@line 8644
     break;
    }
   }
  } while (0);
  HEAP32[$0 + 16 >> 2] = 0; //@line 8650
  HEAP32[$3 >> 2] = 0; //@line 8651
  HEAP32[$1 >> 2] = 0; //@line 8652
  HEAP32[$15 >> 2] = 0; //@line 8653
  HEAP32[$13 >> 2] = 0; //@line 8654
  $$0 = 0; //@line 8655
 }
 return $$0 | 0; //@line 8657
}
function __ZN16SX1276_LoRaRadio8rx_frameEPhjjhh($0, $1, $2, $3, $4, $5) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 $5 = $5 | 0;
 var $10 = 0, $13 = 0, $16 = 0, $6 = 0, $7 = 0, $vararg_buffer = 0, $vararg_buffer12 = 0, $vararg_buffer4 = 0, $vararg_buffer8 = 0, sp = 0;
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
 _mbed_tracef(16, 1088, 1116, $vararg_buffer); //@line 92
 _emscripten_asm_const_i(0) | 0; //@line 93
 $10 = HEAP32[$0 + 752 >> 2] | 0; //@line 95
 if (($10 | 0) != ($6 | 0)) {
  HEAP32[$vararg_buffer4 >> 2] = $10; //@line 98
  HEAP32[$vararg_buffer4 + 4 >> 2] = $6; //@line 100
  _mbed_tracef(16, 1088, 1198, $vararg_buffer4); //@line 101
  STACKTOP = sp; //@line 102
  return;
 }
 $13 = HEAP32[$0 + 756 >> 2] | 0; //@line 105
 if (($13 | 0) != ($7 | 0)) {
  HEAP32[$vararg_buffer8 >> 2] = $13; //@line 108
  HEAP32[$vararg_buffer8 + 4 >> 2] = $7; //@line 110
  _mbed_tracef(16, 1088, 1245, $vararg_buffer8); //@line 111
  STACKTOP = sp; //@line 112
  return;
 }
 $16 = HEAP32[$0 + 692 >> 2] | 0; //@line 115
 if (($16 | 0) == ($3 | 0)) {
  _memcpy($0 + 792 | 0, $1 | 0, $2 | 0) | 0; //@line 119
  HEAP8[$0 + 782 >> 0] = $2; //@line 122
  HEAP8[$0 + 781 >> 0] = -35; //@line 124
  HEAP8[$0 + 780 >> 0] = -5; //@line 126
  HEAP8[$0 + 783 >> 0] = 1; //@line 128
  HEAP32[$0 + 784 >> 2] = _emscripten_asm_const_i(1) | 0; //@line 131
  STACKTOP = sp; //@line 132
  return;
 } else {
  HEAP32[$vararg_buffer12 >> 2] = $16; //@line 134
  HEAP32[$vararg_buffer12 + 4 >> 2] = $3; //@line 136
  _mbed_tracef(16, 1088, 1292, $vararg_buffer12); //@line 137
  STACKTOP = sp; //@line 138
  return;
 }
}
function ___strchrnul($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0 = 0, $$029$lcssa = 0, $$02936 = 0, $$030$lcssa = 0, $$03039 = 0, $$1 = 0, $10 = 0, $13 = 0, $17 = 0, $18 = 0, $2 = 0, $24 = 0, $25 = 0, $31 = 0, $38 = 0, $39 = 0, $7 = 0;
 $2 = $1 & 255; //@line 8338
 L1 : do {
  if (!$2) {
   $$0 = $0 + (_strlen($0) | 0) | 0; //@line 8344
  } else {
   if (!($0 & 3)) {
    $$030$lcssa = $0; //@line 8350
   } else {
    $7 = $1 & 255; //@line 8352
    $$03039 = $0; //@line 8353
    while (1) {
     $10 = HEAP8[$$03039 >> 0] | 0; //@line 8355
     if ($10 << 24 >> 24 == 0 ? 1 : $10 << 24 >> 24 == $7 << 24 >> 24) {
      $$0 = $$03039; //@line 8360
      break L1;
     }
     $13 = $$03039 + 1 | 0; //@line 8363
     if (!($13 & 3)) {
      $$030$lcssa = $13; //@line 8368
      break;
     } else {
      $$03039 = $13; //@line 8371
     }
    }
   }
   $17 = Math_imul($2, 16843009) | 0; //@line 8375
   $18 = HEAP32[$$030$lcssa >> 2] | 0; //@line 8376
   L10 : do {
    if (!(($18 & -2139062144 ^ -2139062144) & $18 + -16843009)) {
     $$02936 = $$030$lcssa; //@line 8384
     $25 = $18; //@line 8384
     while (1) {
      $24 = $25 ^ $17; //@line 8386
      if (($24 & -2139062144 ^ -2139062144) & $24 + -16843009 | 0) {
       $$029$lcssa = $$02936; //@line 8393
       break L10;
      }
      $31 = $$02936 + 4 | 0; //@line 8396
      $25 = HEAP32[$31 >> 2] | 0; //@line 8397
      if (($25 & -2139062144 ^ -2139062144) & $25 + -16843009 | 0) {
       $$029$lcssa = $31; //@line 8406
       break;
      } else {
       $$02936 = $31; //@line 8404
      }
     }
    } else {
     $$029$lcssa = $$030$lcssa; //@line 8411
    }
   } while (0);
   $38 = $1 & 255; //@line 8414
   $$1 = $$029$lcssa; //@line 8415
   while (1) {
    $39 = HEAP8[$$1 >> 0] | 0; //@line 8417
    if ($39 << 24 >> 24 == 0 ? 1 : $39 << 24 >> 24 == $38 << 24 >> 24) {
     $$0 = $$1; //@line 8423
     break;
    } else {
     $$1 = $$1 + 1 | 0; //@line 8426
    }
   }
  }
 } while (0);
 return $$0 | 0; //@line 8431
}
function ___fwritex($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$038 = 0, $$1 = 0, $$139 = 0, $$141 = 0, $$143 = 0, $10 = 0, $12 = 0, $14 = 0, $22 = 0, $28 = 0, $3 = 0, $31 = 0, $4 = 0, $9 = 0, label = 0;
 $3 = $2 + 16 | 0; //@line 8080
 $4 = HEAP32[$3 >> 2] | 0; //@line 8081
 if (!$4) {
  if (!(___towrite($2) | 0)) {
   $12 = HEAP32[$3 >> 2] | 0; //@line 8088
   label = 5; //@line 8089
  } else {
   $$1 = 0; //@line 8091
  }
 } else {
  $12 = $4; //@line 8095
  label = 5; //@line 8096
 }
 L5 : do {
  if ((label | 0) == 5) {
   $9 = $2 + 20 | 0; //@line 8100
   $10 = HEAP32[$9 >> 2] | 0; //@line 8101
   $14 = $10; //@line 8104
   if (($12 - $10 | 0) >>> 0 < $1 >>> 0) {
    $$1 = FUNCTION_TABLE_iiii[HEAP32[$2 + 36 >> 2] & 7]($2, $0, $1) | 0; //@line 8109
    break;
   }
   L10 : do {
    if ((HEAP8[$2 + 75 >> 0] | 0) > -1) {
     $$038 = $1; //@line 8117
     while (1) {
      if (!$$038) {
       $$139 = 0; //@line 8121
       $$141 = $0; //@line 8121
       $$143 = $1; //@line 8121
       $31 = $14; //@line 8121
       break L10;
      }
      $22 = $$038 + -1 | 0; //@line 8124
      if ((HEAP8[$0 + $22 >> 0] | 0) == 10) {
       break;
      } else {
       $$038 = $22; //@line 8131
      }
     }
     $28 = FUNCTION_TABLE_iiii[HEAP32[$2 + 36 >> 2] & 7]($2, $0, $$038) | 0; //@line 8136
     if ($28 >>> 0 < $$038 >>> 0) {
      $$1 = $28; //@line 8139
      break L5;
     }
     $$139 = $$038; //@line 8145
     $$141 = $0 + $$038 | 0; //@line 8145
     $$143 = $1 - $$038 | 0; //@line 8145
     $31 = HEAP32[$9 >> 2] | 0; //@line 8145
    } else {
     $$139 = 0; //@line 8147
     $$141 = $0; //@line 8147
     $$143 = $1; //@line 8147
     $31 = $14; //@line 8147
    }
   } while (0);
   _memcpy($31 | 0, $$141 | 0, $$143 | 0) | 0; //@line 8150
   HEAP32[$9 >> 2] = (HEAP32[$9 >> 2] | 0) + $$143; //@line 8153
   $$1 = $$139 + $$143 | 0; //@line 8155
  }
 } while (0);
 return $$1 | 0; //@line 8158
}
function _equeue_dealloc__async_cb($0) {
 $0 = $0 | 0;
 var $$02329$i = 0, $$02330$i = 0, $$025$i = 0, $$sink$in$i = 0, $$sink21$i = 0, $11 = 0, $12 = 0, $13 = 0, $15 = 0, $16 = 0, $2 = 0, $23 = 0, $4 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0;
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 9132
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 9134
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 9136
 $7 = $2 + 156 | 0; //@line 9137
 _equeue_mutex_lock($7); //@line 9138
 $8 = $2 + 24 | 0; //@line 9139
 $9 = HEAP32[$8 >> 2] | 0; //@line 9140
 L3 : do {
  if (!$9) {
   $$02329$i = $8; //@line 9144
  } else {
   $11 = HEAP32[$6 >> 2] | 0; //@line 9146
   $$025$i = $8; //@line 9147
   $13 = $9; //@line 9147
   while (1) {
    $12 = HEAP32[$13 >> 2] | 0; //@line 9149
    if ($12 >>> 0 >= $11 >>> 0) {
     break;
    }
    $15 = $13 + 8 | 0; //@line 9154
    $16 = HEAP32[$15 >> 2] | 0; //@line 9155
    if (!$16) {
     $$02329$i = $15; //@line 9158
     break L3;
    } else {
     $$025$i = $15; //@line 9161
     $13 = $16; //@line 9161
    }
   }
   if (($12 | 0) == ($11 | 0)) {
    HEAP32[$4 + -24 >> 2] = $13; //@line 9167
    $$02330$i = $$025$i; //@line 9170
    $$sink$in$i = (HEAP32[$$025$i >> 2] | 0) + 8 | 0; //@line 9170
    $$sink21$i = HEAP32[$$sink$in$i >> 2] | 0; //@line 9171
    $23 = $4 + -28 | 0; //@line 9172
    HEAP32[$23 >> 2] = $$sink21$i; //@line 9173
    HEAP32[$$02330$i >> 2] = $6; //@line 9174
    _equeue_mutex_unlock($7); //@line 9175
    return;
   } else {
    $$02329$i = $$025$i; //@line 9178
   }
  }
 } while (0);
 HEAP32[$4 + -24 >> 2] = 0; //@line 9183
 $$02330$i = $$02329$i; //@line 9184
 $$sink$in$i = $$02329$i; //@line 9184
 $$sink21$i = HEAP32[$$sink$in$i >> 2] | 0; //@line 9185
 $23 = $4 + -28 | 0; //@line 9186
 HEAP32[$23 >> 2] = $$sink21$i; //@line 9187
 HEAP32[$$02330$i >> 2] = $6; //@line 9188
 _equeue_mutex_unlock($7); //@line 9189
 return;
}
function __ZN4mbed11InterruptIn4fallENS_8CallbackIFvvEEE__async_cb_68($0) {
 $0 = $0 | 0;
 var $$phi$trans$insert = 0, $$pre10 = 0, $10 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx4 = 0, sp = 0;
 sp = STACKTOP; //@line 8554
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 8558
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 8560
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 8562
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 8564
 $$phi$trans$insert = (HEAP32[$0 + 4 >> 2] | 0) + 12 | 0; //@line 8565
 $$pre10 = HEAP32[$$phi$trans$insert >> 2] | 0; //@line 8566
 if (!$$pre10) {
  HEAP32[$4 >> 2] = 0; //@line 8569
  _gpio_irq_set($10 + 28 | 0, 2, 0); //@line 8571
  return;
 }
 $13 = HEAP32[$$pre10 + 4 >> 2] | 0; //@line 8575
 $ReallocAsyncCtx4 = _emscripten_realloc_async_context(20) | 0; //@line 8576
 FUNCTION_TABLE_vii[$13 & 3]($6, $8); //@line 8577
 if (___async) {
  HEAP32[$ReallocAsyncCtx4 >> 2] = 23; //@line 8580
  $14 = $ReallocAsyncCtx4 + 4 | 0; //@line 8581
  HEAP32[$14 >> 2] = $$phi$trans$insert; //@line 8582
  $15 = $ReallocAsyncCtx4 + 8 | 0; //@line 8583
  HEAP32[$15 >> 2] = $4; //@line 8584
  $16 = $ReallocAsyncCtx4 + 12 | 0; //@line 8585
  HEAP32[$16 >> 2] = $8; //@line 8586
  $17 = $ReallocAsyncCtx4 + 16 | 0; //@line 8587
  HEAP32[$17 >> 2] = $10; //@line 8588
  sp = STACKTOP; //@line 8589
  return;
 }
 ___async_unwind = 0; //@line 8592
 HEAP32[$ReallocAsyncCtx4 >> 2] = 23; //@line 8593
 $14 = $ReallocAsyncCtx4 + 4 | 0; //@line 8594
 HEAP32[$14 >> 2] = $$phi$trans$insert; //@line 8595
 $15 = $ReallocAsyncCtx4 + 8 | 0; //@line 8596
 HEAP32[$15 >> 2] = $4; //@line 8597
 $16 = $ReallocAsyncCtx4 + 12 | 0; //@line 8598
 HEAP32[$16 >> 2] = $8; //@line 8599
 $17 = $ReallocAsyncCtx4 + 16 | 0; //@line 8600
 HEAP32[$17 >> 2] = $10; //@line 8601
 sp = STACKTOP; //@line 8602
 return;
}
function __ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_12($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $25 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 2108
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 2112
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 2114
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 2116
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 2118
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 2120
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 2122
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 2124
 $18 = HEAP8[$0 + 36 >> 0] & 1; //@line 2127
 $25 = (HEAP32[$0 + 4 >> 2] | 0) + 8 | 0; //@line 2128
 do {
  if ($25 >>> 0 < $4 >>> 0) {
   if (!(HEAP8[$6 >> 0] | 0)) {
    if ((HEAP32[$8 >> 2] | 0) == 1) {
     if ((HEAP32[$10 >> 2] | 0) == 1) {
      break;
     }
    }
    $ReallocAsyncCtx2 = _emscripten_realloc_async_context(40) | 0; //@line 2144
    __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($25, $12, $14, $16, $18); //@line 2145
    if (!___async) {
     ___async_unwind = 0; //@line 2148
    }
    HEAP32[$ReallocAsyncCtx2 >> 2] = 147; //@line 2150
    HEAP32[$ReallocAsyncCtx2 + 4 >> 2] = $25; //@line 2152
    HEAP32[$ReallocAsyncCtx2 + 8 >> 2] = $4; //@line 2154
    HEAP32[$ReallocAsyncCtx2 + 12 >> 2] = $6; //@line 2156
    HEAP32[$ReallocAsyncCtx2 + 16 >> 2] = $8; //@line 2158
    HEAP32[$ReallocAsyncCtx2 + 20 >> 2] = $10; //@line 2160
    HEAP32[$ReallocAsyncCtx2 + 24 >> 2] = $12; //@line 2162
    HEAP32[$ReallocAsyncCtx2 + 28 >> 2] = $14; //@line 2164
    HEAP32[$ReallocAsyncCtx2 + 32 >> 2] = $16; //@line 2166
    HEAP8[$ReallocAsyncCtx2 + 36 >> 0] = $18 & 1; //@line 2169
    sp = STACKTOP; //@line 2170
    return;
   }
  }
 } while (0);
 return;
}
function _main__async_cb_35($0) {
 $0 = $0 | 0;
 var $10 = 0, $11 = 0, $12 = 0, $2 = 0, $4 = 0, $6 = 0, $9 = 0, $ReallocAsyncCtx3 = 0, $ReallocAsyncCtx7 = 0, sp = 0;
 sp = STACKTOP; //@line 4755
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 4757
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 4759
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 4761
 if (!(__ZN20SimulatorBlockDevice4initEv(5816) | 0)) {
  $9 = _malloc(512) | 0; //@line 4765
  HEAP32[1468] = $9; //@line 4766
  $ReallocAsyncCtx7 = _emscripten_realloc_async_context(16) | 0; //@line 4767
  __ZN20SimulatorBlockDevice4readEPvyy(5816, $9, 0, 0, 512, 0) | 0; //@line 4768
  if (___async) {
   HEAP32[$ReallocAsyncCtx7 >> 2] = 95; //@line 4771
   $10 = $ReallocAsyncCtx7 + 4 | 0; //@line 4772
   HEAP32[$10 >> 2] = $2; //@line 4773
   $11 = $ReallocAsyncCtx7 + 8 | 0; //@line 4774
   HEAP32[$11 >> 2] = $4; //@line 4775
   $12 = $ReallocAsyncCtx7 + 12 | 0; //@line 4776
   HEAP32[$12 >> 2] = $6; //@line 4777
   sp = STACKTOP; //@line 4778
   return;
  }
  ___async_unwind = 0; //@line 4781
  HEAP32[$ReallocAsyncCtx7 >> 2] = 95; //@line 4782
  $10 = $ReallocAsyncCtx7 + 4 | 0; //@line 4783
  HEAP32[$10 >> 2] = $2; //@line 4784
  $11 = $ReallocAsyncCtx7 + 8 | 0; //@line 4785
  HEAP32[$11 >> 2] = $4; //@line 4786
  $12 = $ReallocAsyncCtx7 + 12 | 0; //@line 4787
  HEAP32[$12 >> 2] = $6; //@line 4788
  sp = STACKTOP; //@line 4789
  return;
 } else {
  $ReallocAsyncCtx3 = _emscripten_realloc_async_context(4) | 0; //@line 4792
  _puts(2667) | 0; //@line 4793
  if (___async) {
   HEAP32[$ReallocAsyncCtx3 >> 2] = 94; //@line 4796
   sp = STACKTOP; //@line 4797
   return;
  }
  ___async_unwind = 0; //@line 4800
  HEAP32[$ReallocAsyncCtx3 >> 2] = 94; //@line 4801
  sp = STACKTOP; //@line 4802
  return;
 }
}
function ___overflow($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0 = 0, $10 = 0, $12 = 0, $13 = 0, $2 = 0, $20 = 0, $21 = 0, $3 = 0, $4 = 0, $5 = 0, $9 = 0, $AsyncCtx = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 7966
 STACKTOP = STACKTOP + 16 | 0; //@line 7967
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 7967
 $2 = sp; //@line 7968
 $3 = $1 & 255; //@line 7969
 HEAP8[$2 >> 0] = $3; //@line 7970
 $4 = $0 + 16 | 0; //@line 7971
 $5 = HEAP32[$4 >> 2] | 0; //@line 7972
 if (!$5) {
  if (!(___towrite($0) | 0)) {
   $12 = HEAP32[$4 >> 2] | 0; //@line 7979
   label = 4; //@line 7980
  } else {
   $$0 = -1; //@line 7982
  }
 } else {
  $12 = $5; //@line 7985
  label = 4; //@line 7986
 }
 do {
  if ((label | 0) == 4) {
   $9 = $0 + 20 | 0; //@line 7990
   $10 = HEAP32[$9 >> 2] | 0; //@line 7991
   if ($10 >>> 0 < $12 >>> 0) {
    $13 = $1 & 255; //@line 7994
    if (($13 | 0) != (HEAP8[$0 + 75 >> 0] | 0)) {
     HEAP32[$9 >> 2] = $10 + 1; //@line 8001
     HEAP8[$10 >> 0] = $3; //@line 8002
     $$0 = $13; //@line 8003
     break;
    }
   }
   $20 = HEAP32[$0 + 36 >> 2] | 0; //@line 8008
   $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 8009
   $21 = FUNCTION_TABLE_iiii[$20 & 7]($0, $2, 1) | 0; //@line 8010
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 114; //@line 8013
    HEAP32[$AsyncCtx + 4 >> 2] = $2; //@line 8015
    sp = STACKTOP; //@line 8016
    STACKTOP = sp; //@line 8017
    return 0; //@line 8017
   }
   _emscripten_free_async_context($AsyncCtx | 0); //@line 8019
   if (($21 | 0) == 1) {
    $$0 = HEAPU8[$2 >> 0] | 0; //@line 8024
   } else {
    $$0 = -1; //@line 8026
   }
  }
 } while (0);
 STACKTOP = sp; //@line 8030
 return $$0 | 0; //@line 8030
}
function _fflush__async_cb_74($0) {
 $0 = $0 | 0;
 var $$023 = 0, $$02325 = 0, $$02327 = 0, $$024$lcssa = 0, $$02426 = 0, $13 = 0, $16 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 8809
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 8811
 $$02325 = HEAP32[(___ofl_lock() | 0) >> 2] | 0; //@line 8813
 L3 : do {
  if (!$$02325) {
   $$024$lcssa = $AsyncRetVal; //@line 8817
  } else {
   $$02327 = $$02325; //@line 8819
   $$02426 = $AsyncRetVal; //@line 8819
   while (1) {
    if ((HEAP32[$$02327 + 76 >> 2] | 0) > -1) {
     $16 = ___lockfile($$02327) | 0; //@line 8826
    } else {
     $16 = 0; //@line 8828
    }
    if ((HEAP32[$$02327 + 20 >> 2] | 0) >>> 0 > (HEAP32[$$02327 + 28 >> 2] | 0) >>> 0) {
     break;
    }
    if ($16 | 0) {
     ___unlockfile($$02327); //@line 8840
    }
    $$023 = HEAP32[$$02327 + 56 >> 2] | 0; //@line 8843
    if (!$$023) {
     $$024$lcssa = $$02426; //@line 8846
     break L3;
    } else {
     $$02327 = $$023; //@line 8849
    }
   }
   $ReallocAsyncCtx = _emscripten_realloc_async_context(16) | 0; //@line 8852
   $13 = ___fflush_unlocked($$02327) | 0; //@line 8853
   if (!___async) {
    HEAP32[___async_retval >> 2] = $13; //@line 8857
    ___async_unwind = 0; //@line 8858
   }
   HEAP32[$ReallocAsyncCtx >> 2] = 118; //@line 8860
   HEAP32[$ReallocAsyncCtx + 4 >> 2] = $$02426; //@line 8862
   HEAP32[$ReallocAsyncCtx + 8 >> 2] = $16; //@line 8864
   HEAP32[$ReallocAsyncCtx + 12 >> 2] = $$02327; //@line 8866
   sp = STACKTOP; //@line 8867
   return;
  }
 } while (0);
 ___ofl_unlock(); //@line 8871
 HEAP32[___async_retval >> 2] = $$024$lcssa; //@line 8873
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
 sp = STACKTOP; //@line 2045
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 2049
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 2051
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 2053
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 2055
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 2057
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 2059
 $16 = HEAP8[$0 + 32 >> 0] & 1; //@line 2062
 $21 = (HEAP32[$0 + 4 >> 2] | 0) + 8 | 0; //@line 2063
 if ($21 >>> 0 < $4 >>> 0) {
  if (!(HEAP8[$6 >> 0] | 0)) {
   if ((HEAP32[$8 >> 2] | 0) != 1) {
    $ReallocAsyncCtx = _emscripten_realloc_async_context(36) | 0; //@line 2072
    __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($21, $10, $12, $14, $16); //@line 2073
    if (!___async) {
     ___async_unwind = 0; //@line 2076
    }
    HEAP32[$ReallocAsyncCtx >> 2] = 148; //@line 2078
    HEAP32[$ReallocAsyncCtx + 4 >> 2] = $21; //@line 2080
    HEAP32[$ReallocAsyncCtx + 8 >> 2] = $4; //@line 2082
    HEAP32[$ReallocAsyncCtx + 12 >> 2] = $6; //@line 2084
    HEAP32[$ReallocAsyncCtx + 16 >> 2] = $8; //@line 2086
    HEAP32[$ReallocAsyncCtx + 20 >> 2] = $10; //@line 2088
    HEAP32[$ReallocAsyncCtx + 24 >> 2] = $12; //@line 2090
    HEAP32[$ReallocAsyncCtx + 28 >> 2] = $14; //@line 2092
    HEAP8[$ReallocAsyncCtx + 32 >> 0] = $16 & 1; //@line 2095
    sp = STACKTOP; //@line 2096
    return;
   }
  }
 }
 return;
}
function _fflush__async_cb($0) {
 $0 = $0 | 0;
 var $$02327$reg2mem$0 = 0, $$1 = 0, $$reg2mem$0 = 0, $17 = 0, $20 = 0, $ReallocAsyncCtx = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 8710
 $$02327$reg2mem$0 = HEAP32[$0 + 12 >> 2] | 0; //@line 8720
 $$1 = HEAP32[___async_retval >> 2] | HEAP32[$0 + 4 >> 2]; //@line 8720
 $$reg2mem$0 = HEAP32[$0 + 8 >> 2] | 0; //@line 8720
 while (1) {
  if ($$reg2mem$0 | 0) {
   ___unlockfile($$02327$reg2mem$0); //@line 8724
  }
  $$02327$reg2mem$0 = HEAP32[$$02327$reg2mem$0 + 56 >> 2] | 0; //@line 8727
  if (!$$02327$reg2mem$0) {
   label = 12; //@line 8730
   break;
  }
  if ((HEAP32[$$02327$reg2mem$0 + 76 >> 2] | 0) > -1) {
   $20 = ___lockfile($$02327$reg2mem$0) | 0; //@line 8738
  } else {
   $20 = 0; //@line 8740
  }
  if ((HEAP32[$$02327$reg2mem$0 + 20 >> 2] | 0) >>> 0 > (HEAP32[$$02327$reg2mem$0 + 28 >> 2] | 0) >>> 0) {
   break;
  } else {
   $$reg2mem$0 = $20; //@line 8750
  }
 }
 if ((label | 0) == 12) {
  ___ofl_unlock(); //@line 8754
  HEAP32[___async_retval >> 2] = $$1; //@line 8756
  return;
 }
 $ReallocAsyncCtx = _emscripten_realloc_async_context(16) | 0; //@line 8759
 $17 = ___fflush_unlocked($$02327$reg2mem$0) | 0; //@line 8760
 if (!___async) {
  HEAP32[___async_retval >> 2] = $17; //@line 8764
  ___async_unwind = 0; //@line 8765
 }
 HEAP32[$ReallocAsyncCtx >> 2] = 118; //@line 8767
 HEAP32[$ReallocAsyncCtx + 4 >> 2] = $$1; //@line 8769
 HEAP32[$ReallocAsyncCtx + 8 >> 2] = $20; //@line 8771
 HEAP32[$ReallocAsyncCtx + 12 >> 2] = $$02327$reg2mem$0; //@line 8773
 sp = STACKTOP; //@line 8774
 return;
}
function ___fflush_unlocked__async_cb($0) {
 $0 = $0 | 0;
 var $$0 = 0, $10 = 0, $11 = 0, $12 = 0, $18 = 0, $2 = 0, $4 = 0, $6 = 0, $9 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 8951
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 8953
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 8955
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 8957
 do {
  if (!(HEAP32[$2 >> 2] | 0)) {
   $$0 = -1; //@line 8962
  } else {
   $9 = $4 + 4 | 0; //@line 8964
   $10 = HEAP32[$9 >> 2] | 0; //@line 8965
   $11 = $4 + 8 | 0; //@line 8966
   $12 = HEAP32[$11 >> 2] | 0; //@line 8967
   if ($10 >>> 0 >= $12 >>> 0) {
    HEAP32[$4 + 16 >> 2] = 0; //@line 8971
    HEAP32[$6 >> 2] = 0; //@line 8972
    HEAP32[$2 >> 2] = 0; //@line 8973
    HEAP32[$11 >> 2] = 0; //@line 8974
    HEAP32[$9 >> 2] = 0; //@line 8975
    $$0 = 0; //@line 8976
    break;
   }
   $18 = HEAP32[$4 + 40 >> 2] | 0; //@line 8983
   $ReallocAsyncCtx2 = _emscripten_realloc_async_context(24) | 0; //@line 8984
   FUNCTION_TABLE_iiii[$18 & 7]($4, $10 - $12 | 0, 1) | 0; //@line 8985
   if (!___async) {
    ___async_unwind = 0; //@line 8988
   }
   HEAP32[$ReallocAsyncCtx2 >> 2] = 120; //@line 8990
   HEAP32[$ReallocAsyncCtx2 + 4 >> 2] = $4; //@line 8992
   HEAP32[$ReallocAsyncCtx2 + 8 >> 2] = $6; //@line 8994
   HEAP32[$ReallocAsyncCtx2 + 12 >> 2] = $2; //@line 8996
   HEAP32[$ReallocAsyncCtx2 + 16 >> 2] = $11; //@line 8998
   HEAP32[$ReallocAsyncCtx2 + 20 >> 2] = $9; //@line 9000
   sp = STACKTOP; //@line 9001
   return;
  }
 } while (0);
 HEAP32[___async_retval >> 2] = $$0; //@line 9006
 return;
}
function __ZN4mbed11InterruptIn4fallENS_8CallbackIFvvEEE__async_cb($0) {
 $0 = $0 | 0;
 var $$pre = 0, $10 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $2 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 8488
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 8490
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 8492
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 8494
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 8496
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 8498
 $$pre = HEAP32[$2 >> 2] | 0; //@line 8499
 if (!$$pre) {
  HEAP32[$4 >> 2] = 0; //@line 8502
  _gpio_irq_set($10 + 28 | 0, 2, 1); //@line 8504
  return;
 }
 $13 = HEAP32[$$pre + 4 >> 2] | 0; //@line 8508
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(16) | 0; //@line 8509
 FUNCTION_TABLE_vii[$13 & 3]($6, $8); //@line 8510
 if (___async) {
  HEAP32[$ReallocAsyncCtx2 >> 2] = 21; //@line 8513
  $14 = $ReallocAsyncCtx2 + 4 | 0; //@line 8514
  HEAP32[$14 >> 2] = $2; //@line 8515
  $15 = $ReallocAsyncCtx2 + 8 | 0; //@line 8516
  HEAP32[$15 >> 2] = $4; //@line 8517
  $16 = $ReallocAsyncCtx2 + 12 | 0; //@line 8518
  HEAP32[$16 >> 2] = $10; //@line 8519
  sp = STACKTOP; //@line 8520
  return;
 }
 ___async_unwind = 0; //@line 8523
 HEAP32[$ReallocAsyncCtx2 >> 2] = 21; //@line 8524
 $14 = $ReallocAsyncCtx2 + 4 | 0; //@line 8525
 HEAP32[$14 >> 2] = $2; //@line 8526
 $15 = $ReallocAsyncCtx2 + 8 | 0; //@line 8527
 HEAP32[$15 >> 2] = $4; //@line 8528
 $16 = $ReallocAsyncCtx2 + 12 | 0; //@line 8529
 HEAP32[$16 >> 2] = $10; //@line 8530
 sp = STACKTOP; //@line 8531
 return;
}
function _equeue_create($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0 = 0, $$033$i = 0, $$034$i = 0, $2 = 0, $21 = 0, $23 = 0, $27 = 0, $30 = 0, $5 = 0, $6 = 0;
 $2 = _malloc($1) | 0; //@line 532
 if (!$2) {
  $$0 = -1; //@line 535
  return $$0 | 0; //@line 536
 }
 HEAP32[$0 + 12 >> 2] = $2; //@line 539
 $5 = $0 + 20 | 0; //@line 540
 HEAP32[$5 >> 2] = 0; //@line 541
 $6 = $0 + 16 | 0; //@line 542
 HEAP32[$6 >> 2] = 0; //@line 543
 if ($1 | 0) {
  $$034$i = $1; //@line 546
  $23 = 0; //@line 546
  do {
   $23 = $23 + 1 | 0; //@line 548
   $$034$i = $$034$i >>> 1; //@line 549
  } while (($$034$i | 0) != 0);
  HEAP32[$6 >> 2] = $23; //@line 557
 }
 HEAP32[$0 + 24 >> 2] = 0; //@line 560
 HEAP32[$0 + 28 >> 2] = $1; //@line 562
 HEAP32[$0 + 32 >> 2] = $2; //@line 564
 HEAP32[$0 >> 2] = 0; //@line 565
 HEAP32[$0 + 4 >> 2] = _equeue_tick() | 0; //@line 568
 HEAP8[$0 + 9 >> 0] = 0; //@line 570
 HEAP8[$0 + 8 >> 0] = 0; //@line 572
 HEAP8[$0 + 36 >> 0] = 0; //@line 574
 HEAP32[$0 + 40 >> 2] = 0; //@line 576
 HEAP32[$0 + 44 >> 2] = 0; //@line 578
 HEAP8[$0 + 184 >> 0] = 0; //@line 580
 $21 = _equeue_sema_create($0 + 48 | 0) | 0; //@line 582
 if (($21 | 0) < 0) {
  $$033$i = $21; //@line 585
 } else {
  $27 = _equeue_mutex_create($0 + 128 | 0) | 0; //@line 588
  if (($27 | 0) < 0) {
   $$033$i = $27; //@line 591
  } else {
   $30 = _equeue_mutex_create($0 + 156 | 0) | 0; //@line 594
   $$033$i = ($30 | 0) < 0 ? $30 : 0; //@line 597
  }
 }
 HEAP32[$5 >> 2] = $2; //@line 600
 $$0 = $$033$i; //@line 601
 return $$0 | 0; //@line 602
}
function _wcrtomb($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$0 = 0;
 do {
  if (!$0) {
   $$0 = 1; //@line 11346
  } else {
   if ($1 >>> 0 < 128) {
    HEAP8[$0 >> 0] = $1; //@line 11351
    $$0 = 1; //@line 11352
    break;
   }
   if (!(HEAP32[HEAP32[(___pthread_self_910() | 0) + 188 >> 2] >> 2] | 0)) {
    if (($1 & -128 | 0) == 57216) {
     HEAP8[$0 >> 0] = $1; //@line 11365
     $$0 = 1; //@line 11366
     break;
    } else {
     HEAP32[(___errno_location() | 0) >> 2] = 84; //@line 11370
     $$0 = -1; //@line 11371
     break;
    }
   }
   if ($1 >>> 0 < 2048) {
    HEAP8[$0 >> 0] = $1 >>> 6 | 192; //@line 11381
    HEAP8[$0 + 1 >> 0] = $1 & 63 | 128; //@line 11385
    $$0 = 2; //@line 11386
    break;
   }
   if ($1 >>> 0 < 55296 | ($1 & -8192 | 0) == 57344) {
    HEAP8[$0 >> 0] = $1 >>> 12 | 224; //@line 11398
    HEAP8[$0 + 1 >> 0] = $1 >>> 6 & 63 | 128; //@line 11404
    HEAP8[$0 + 2 >> 0] = $1 & 63 | 128; //@line 11408
    $$0 = 3; //@line 11409
    break;
   }
   if (($1 + -65536 | 0) >>> 0 < 1048576) {
    HEAP8[$0 >> 0] = $1 >>> 18 | 240; //@line 11419
    HEAP8[$0 + 1 >> 0] = $1 >>> 12 & 63 | 128; //@line 11425
    HEAP8[$0 + 2 >> 0] = $1 >>> 6 & 63 | 128; //@line 11431
    HEAP8[$0 + 3 >> 0] = $1 & 63 | 128; //@line 11435
    $$0 = 4; //@line 11436
    break;
   } else {
    HEAP32[(___errno_location() | 0) >> 2] = 84; //@line 11440
    $$0 = -1; //@line 11441
    break;
   }
  }
 } while (0);
 return $$0 | 0; //@line 11446
}
function __ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv__async_cb_4($0) {
 $0 = $0 | 0;
 var $15 = 0, $16 = 0, $2 = 0, $4 = 0, $6 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx = 0, dest = 0, sp = 0, stop = 0;
 sp = STACKTOP; //@line 1330
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 1332
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 1334
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 1336
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 1338
 if (!$AsyncRetVal) {
  HEAP8[___async_retval >> 0] = 0; //@line 1343
  return;
 }
 dest = $2 + 4 | 0; //@line 1347
 stop = dest + 52 | 0; //@line 1347
 do {
  HEAP32[dest >> 2] = 0; //@line 1347
  dest = dest + 4 | 0; //@line 1347
 } while ((dest | 0) < (stop | 0));
 HEAP32[$2 >> 2] = $AsyncRetVal; //@line 1348
 HEAP32[$2 + 8 >> 2] = $4; //@line 1350
 HEAP32[$2 + 12 >> 2] = -1; //@line 1352
 HEAP32[$2 + 48 >> 2] = 1; //@line 1354
 $15 = HEAP32[(HEAP32[$AsyncRetVal >> 2] | 0) + 28 >> 2] | 0; //@line 1357
 $16 = HEAP32[$6 >> 2] | 0; //@line 1358
 $ReallocAsyncCtx = _emscripten_realloc_async_context(16) | 0; //@line 1359
 FUNCTION_TABLE_viiii[$15 & 3]($AsyncRetVal, $2, $16, 1); //@line 1360
 if (!___async) {
  ___async_unwind = 0; //@line 1363
 }
 HEAP32[$ReallocAsyncCtx >> 2] = 133; //@line 1365
 HEAP32[$ReallocAsyncCtx + 4 >> 2] = $2; //@line 1367
 HEAP32[$ReallocAsyncCtx + 8 >> 2] = $6; //@line 1369
 HEAP32[$ReallocAsyncCtx + 12 >> 2] = $2; //@line 1371
 sp = STACKTOP; //@line 1372
 return;
}
function __ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_13($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $17 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 2181
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 2185
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 2187
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 2189
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 2191
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 2193
 $14 = HEAP8[$0 + 28 >> 0] & 1; //@line 2196
 $17 = (HEAP32[$0 + 4 >> 2] | 0) + 8 | 0; //@line 2197
 if ($17 >>> 0 < $4 >>> 0) {
  if (!(HEAP8[$6 >> 0] | 0)) {
   $ReallocAsyncCtx3 = _emscripten_realloc_async_context(32) | 0; //@line 2203
   __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($17, $8, $10, $12, $14); //@line 2204
   if (!___async) {
    ___async_unwind = 0; //@line 2207
   }
   HEAP32[$ReallocAsyncCtx3 >> 2] = 146; //@line 2209
   HEAP32[$ReallocAsyncCtx3 + 4 >> 2] = $17; //@line 2211
   HEAP32[$ReallocAsyncCtx3 + 8 >> 2] = $4; //@line 2213
   HEAP32[$ReallocAsyncCtx3 + 12 >> 2] = $6; //@line 2215
   HEAP32[$ReallocAsyncCtx3 + 16 >> 2] = $8; //@line 2217
   HEAP32[$ReallocAsyncCtx3 + 20 >> 2] = $10; //@line 2219
   HEAP32[$ReallocAsyncCtx3 + 24 >> 2] = $12; //@line 2221
   HEAP8[$ReallocAsyncCtx3 + 28 >> 0] = $14 & 1; //@line 2224
   sp = STACKTOP; //@line 2225
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
  $$0914 = $2; //@line 10230
  $8 = $0; //@line 10230
  $9 = $1; //@line 10230
  while (1) {
   $10 = ___uremdi3($8 | 0, $9 | 0, 10, 0) | 0; //@line 10232
   $$0914 = $$0914 + -1 | 0; //@line 10236
   HEAP8[$$0914 >> 0] = $10 & 255 | 48; //@line 10237
   $8$looptemp = $8;
   $8 = ___udivdi3($8 | 0, $9 | 0, 10, 0) | 0; //@line 10238
   if (!($9 >>> 0 > 9 | ($9 | 0) == 9 & $8$looptemp >>> 0 > 4294967295)) {
    break;
   } else {
    $9 = tempRet0; //@line 10246
   }
  }
  $$010$lcssa$off0 = $8; //@line 10251
  $$09$lcssa = $$0914; //@line 10251
 } else {
  $$010$lcssa$off0 = $0; //@line 10253
  $$09$lcssa = $2; //@line 10253
 }
 if (!$$010$lcssa$off0) {
  $$1$lcssa = $$09$lcssa; //@line 10257
 } else {
  $$012 = $$010$lcssa$off0; //@line 10259
  $$111 = $$09$lcssa; //@line 10259
  while (1) {
   $26 = $$111 + -1 | 0; //@line 10264
   HEAP8[$26 >> 0] = ($$012 >>> 0) % 10 | 0 | 48; //@line 10265
   if ($$012 >>> 0 < 10) {
    $$1$lcssa = $26; //@line 10269
    break;
   } else {
    $$012 = ($$012 >>> 0) / 10 | 0; //@line 10272
    $$111 = $26; //@line 10272
   }
  }
 }
 return $$1$lcssa | 0; //@line 10276
}
function _main__async_cb($0) {
 $0 = $0 | 0;
 var $11 = 0, $12 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx2 = 0, $ReallocAsyncCtx8 = 0, sp = 0;
 sp = STACKTOP; //@line 4676
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 4681
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 4683
 if (!(HEAP8[$0 + 4 >> 0] & 1)) {
  $8 = (HEAP32[$4 >> 2] | 0) + -1 | 0; //@line 4686
  HEAP32[$4 >> 2] = $8; //@line 4687
  if (!$8) {
   $11 = HEAP32[$4 + 24 >> 2] | 0; //@line 4691
   $ReallocAsyncCtx2 = _emscripten_realloc_async_context(8) | 0; //@line 4692
   FUNCTION_TABLE_vi[$11 & 255]($6); //@line 4693
   if (___async) {
    HEAP32[$ReallocAsyncCtx2 >> 2] = 100; //@line 4696
    $12 = $ReallocAsyncCtx2 + 4 | 0; //@line 4697
    HEAP32[$12 >> 2] = $4; //@line 4698
    sp = STACKTOP; //@line 4699
    return;
   }
   ___async_unwind = 0; //@line 4702
   HEAP32[$ReallocAsyncCtx2 >> 2] = 100; //@line 4703
   $12 = $ReallocAsyncCtx2 + 4 | 0; //@line 4704
   HEAP32[$12 >> 2] = $4; //@line 4705
   sp = STACKTOP; //@line 4706
   return;
  }
 }
 $ReallocAsyncCtx8 = _emscripten_realloc_async_context(4) | 0; //@line 4710
 __ZN6events10EventQueue8dispatchEi(5876, -1); //@line 4711
 if (___async) {
  HEAP32[$ReallocAsyncCtx8 >> 2] = 102; //@line 4714
  sp = STACKTOP; //@line 4715
  return;
 }
 ___async_unwind = 0; //@line 4718
 HEAP32[$ReallocAsyncCtx8 >> 2] = 102; //@line 4719
 sp = STACKTOP; //@line 4720
 return;
}
function __ZN6events5EventIFvvEE10event_postIPS1_EEiPNS2_5eventE($0) {
 $0 = $0 | 0;
 var $$0 = 0, $1 = 0, $13 = 0, $14 = 0, $2 = 0, $3 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 4139
 $1 = $0 + 4 | 0; //@line 4140
 $2 = HEAP32[$1 >> 2] | 0; //@line 4141
 $AsyncCtx3 = _emscripten_alloc_async_context(12, sp) | 0; //@line 4142
 $3 = _equeue_alloc($2, 4) | 0; //@line 4143
 if (___async) {
  HEAP32[$AsyncCtx3 >> 2] = 103; //@line 4146
  HEAP32[$AsyncCtx3 + 4 >> 2] = $0; //@line 4148
  HEAP32[$AsyncCtx3 + 8 >> 2] = $1; //@line 4150
  sp = STACKTOP; //@line 4151
  return 0; //@line 4152
 }
 _emscripten_free_async_context($AsyncCtx3 | 0); //@line 4154
 if (!$3) {
  $$0 = 0; //@line 4157
  return $$0 | 0; //@line 4158
 }
 HEAP32[$3 >> 2] = HEAP32[$0 + 28 >> 2]; //@line 4162
 _equeue_event_delay($3, HEAP32[$0 + 12 >> 2] | 0); //@line 4165
 _equeue_event_period($3, HEAP32[$0 + 16 >> 2] | 0); //@line 4168
 _equeue_event_dtor($3, 104); //@line 4169
 $13 = HEAP32[$1 >> 2] | 0; //@line 4170
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 4171
 $14 = _equeue_post($13, 105, $3) | 0; //@line 4172
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 106; //@line 4175
  sp = STACKTOP; //@line 4176
  return 0; //@line 4177
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 4179
 $$0 = $14; //@line 4180
 return $$0 | 0; //@line 4181
}
function _equeue_create_inplace($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$033 = 0, $$034 = 0, $20 = 0, $22 = 0, $26 = 0, $29 = 0, $5 = 0;
 HEAP32[$0 + 12 >> 2] = $2; //@line 612
 HEAP32[$0 + 20 >> 2] = 0; //@line 614
 $5 = $0 + 16 | 0; //@line 615
 HEAP32[$5 >> 2] = 0; //@line 616
 if ($1 | 0) {
  $$034 = $1; //@line 619
  $22 = 0; //@line 619
  do {
   $22 = $22 + 1 | 0; //@line 621
   $$034 = $$034 >>> 1; //@line 622
  } while (($$034 | 0) != 0);
  HEAP32[$5 >> 2] = $22; //@line 630
 }
 HEAP32[$0 + 24 >> 2] = 0; //@line 633
 HEAP32[$0 + 28 >> 2] = $1; //@line 635
 HEAP32[$0 + 32 >> 2] = $2; //@line 637
 HEAP32[$0 >> 2] = 0; //@line 638
 HEAP32[$0 + 4 >> 2] = _equeue_tick() | 0; //@line 641
 HEAP8[$0 + 9 >> 0] = 0; //@line 643
 HEAP8[$0 + 8 >> 0] = 0; //@line 645
 HEAP8[$0 + 36 >> 0] = 0; //@line 647
 HEAP32[$0 + 40 >> 2] = 0; //@line 649
 HEAP32[$0 + 44 >> 2] = 0; //@line 651
 HEAP8[$0 + 184 >> 0] = 0; //@line 653
 $20 = _equeue_sema_create($0 + 48 | 0) | 0; //@line 655
 if (($20 | 0) < 0) {
  $$033 = $20; //@line 658
  return $$033 | 0; //@line 659
 }
 $26 = _equeue_mutex_create($0 + 128 | 0) | 0; //@line 662
 if (($26 | 0) < 0) {
  $$033 = $26; //@line 665
  return $$033 | 0; //@line 666
 }
 $29 = _equeue_mutex_create($0 + 156 | 0) | 0; //@line 669
 $$033 = ($29 | 0) < 0 ? $29 : 0; //@line 672
 return $$033 | 0; //@line 673
}
function __ZNK10__cxxabiv121__vmi_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $13 = 0, $2 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 9037
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 9039
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 9043
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 9045
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 9047
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 9049
 if (!(HEAP8[$2 >> 0] | 0)) {
  $13 = (HEAP32[$0 + 8 >> 2] | 0) + 8 | 0; //@line 9053
  if ($13 >>> 0 < $6 >>> 0) {
   $ReallocAsyncCtx = _emscripten_realloc_async_context(28) | 0; //@line 9056
   __ZNK10__cxxabiv122__base_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($13, $8, $10, $12); //@line 9057
   if (!___async) {
    ___async_unwind = 0; //@line 9060
   }
   HEAP32[$ReallocAsyncCtx >> 2] = 150; //@line 9062
   HEAP32[$ReallocAsyncCtx + 4 >> 2] = $2; //@line 9064
   HEAP32[$ReallocAsyncCtx + 8 >> 2] = $13; //@line 9066
   HEAP32[$ReallocAsyncCtx + 12 >> 2] = $6; //@line 9068
   HEAP32[$ReallocAsyncCtx + 16 >> 2] = $8; //@line 9070
   HEAP32[$ReallocAsyncCtx + 20 >> 2] = $10; //@line 9072
   HEAP32[$ReallocAsyncCtx + 24 >> 2] = $12; //@line 9074
   sp = STACKTOP; //@line 9075
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
 sp = STACKTOP; //@line 3810
 HEAP32[$0 >> 2] = 264; //@line 3811
 HEAP32[$0 + 4 >> 2] = $1; //@line 3813
 $8 = $0 + 8 | 0; //@line 3815
 HEAP32[$8 >> 2] = $4; //@line 3817
 HEAP32[$8 + 4 >> 2] = $5; //@line 3820
 $13 = $0 + 16 | 0; //@line 3822
 HEAP32[$13 >> 2] = $4; //@line 3824
 HEAP32[$13 + 4 >> 2] = $5; //@line 3827
 $18 = $0 + 24 | 0; //@line 3829
 HEAP32[$18 >> 2] = $4; //@line 3831
 HEAP32[$18 + 4 >> 2] = $5; //@line 3834
 $23 = ___udivdi3($2 | 0, $3 | 0, $4 | 0, $5 | 0) | 0; //@line 3836
 $24 = tempRet0; //@line 3837
 $25 = $0 + 32 | 0; //@line 3838
 HEAP32[$25 >> 2] = $23; //@line 3840
 HEAP32[$25 + 4 >> 2] = $24; //@line 3843
 $29 = ___muldi3($23 | 0, $24 | 0, $4 | 0, $5 | 0) | 0; //@line 3844
 if (($29 | 0) == ($2 | 0) & (tempRet0 | 0) == ($3 | 0)) {
  return;
 }
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 3852
 _mbed_assert_internal(2381, 1919, 25); //@line 3853
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 88; //@line 3856
  sp = STACKTOP; //@line 3857
  return;
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 3860
 return;
}
function _strlen($0) {
 $0 = $0 | 0;
 var $$0 = 0, $$015$lcssa = 0, $$01519 = 0, $$1$lcssa = 0, $$pn = 0, $$sink = 0, $1 = 0, $10 = 0, $19 = 0, $23 = 0, $6 = 0, label = 0;
 $1 = $0; //@line 7732
 L1 : do {
  if (!($1 & 3)) {
   $$015$lcssa = $0; //@line 7737
   label = 4; //@line 7738
  } else {
   $$01519 = $0; //@line 7740
   $23 = $1; //@line 7740
   while (1) {
    if (!(HEAP8[$$01519 >> 0] | 0)) {
     $$sink = $23; //@line 7745
     break L1;
    }
    $6 = $$01519 + 1 | 0; //@line 7748
    $23 = $6; //@line 7749
    if (!($23 & 3)) {
     $$015$lcssa = $6; //@line 7753
     label = 4; //@line 7754
     break;
    } else {
     $$01519 = $6; //@line 7757
    }
   }
  }
 } while (0);
 if ((label | 0) == 4) {
  $$0 = $$015$lcssa; //@line 7763
  while (1) {
   $10 = HEAP32[$$0 >> 2] | 0; //@line 7765
   if (!(($10 & -2139062144 ^ -2139062144) & $10 + -16843009)) {
    $$0 = $$0 + 4 | 0; //@line 7773
   } else {
    break;
   }
  }
  if (!(($10 & 255) << 24 >> 24)) {
   $$1$lcssa = $$0; //@line 7781
  } else {
   $$pn = $$0; //@line 7783
   while (1) {
    $19 = $$pn + 1 | 0; //@line 7785
    if (!(HEAP8[$19 >> 0] | 0)) {
     $$1$lcssa = $19; //@line 7789
     break;
    } else {
     $$pn = $19; //@line 7792
    }
   }
  }
  $$sink = $$1$lcssa; //@line 7797
 }
 return $$sink - $1 | 0; //@line 7800
}
function __ZNK10__cxxabiv117__class_type_info29process_static_type_above_dstEPNS_19__dynamic_cast_infoEPKvS4_i($0, $1, $2, $3, $4) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 var $10 = 0, $11 = 0, $21 = 0, $22 = 0, $28 = 0, $30 = 0;
 HEAP8[$1 + 53 >> 0] = 1; //@line 12925
 do {
  if ((HEAP32[$1 + 4 >> 2] | 0) == ($3 | 0)) {
   HEAP8[$1 + 52 >> 0] = 1; //@line 12932
   $10 = $1 + 16 | 0; //@line 12933
   $11 = HEAP32[$10 >> 2] | 0; //@line 12934
   if (!$11) {
    HEAP32[$10 >> 2] = $2; //@line 12937
    HEAP32[$1 + 24 >> 2] = $4; //@line 12939
    HEAP32[$1 + 36 >> 2] = 1; //@line 12941
    if (!(($4 | 0) == 1 ? (HEAP32[$1 + 48 >> 2] | 0) == 1 : 0)) {
     break;
    }
    HEAP8[$1 + 54 >> 0] = 1; //@line 12951
    break;
   }
   if (($11 | 0) != ($2 | 0)) {
    $30 = $1 + 36 | 0; //@line 12956
    HEAP32[$30 >> 2] = (HEAP32[$30 >> 2] | 0) + 1; //@line 12959
    HEAP8[$1 + 54 >> 0] = 1; //@line 12961
    break;
   }
   $21 = $1 + 24 | 0; //@line 12964
   $22 = HEAP32[$21 >> 2] | 0; //@line 12965
   if (($22 | 0) == 2) {
    HEAP32[$21 >> 2] = $4; //@line 12968
    $28 = $4; //@line 12969
   } else {
    $28 = $22; //@line 12971
   }
   if (($28 | 0) == 1 ? (HEAP32[$1 + 48 >> 2] | 0) == 1 : 0) {
    HEAP8[$1 + 54 >> 0] = 1; //@line 12980
   }
  }
 } while (0);
 return;
}
function __ZN4mbed11InterruptIn12_irq_handlerEj14gpio_irq_event($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $12 = 0, $2 = 0, $4 = 0, $7 = 0, $9 = 0, $AsyncCtx = 0, $AsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 264
 $2 = $0; //@line 265
 L1 : do {
  switch ($1 | 0) {
  case 1:
   {
    $4 = HEAP32[$2 + 52 >> 2] | 0; //@line 270
    if ($4 | 0) {
     $7 = HEAP32[$4 >> 2] | 0; //@line 274
     $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 275
     FUNCTION_TABLE_vi[$7 & 255]($2 + 40 | 0); //@line 276
     if (___async) {
      HEAP32[$AsyncCtx >> 2] = 18; //@line 279
      sp = STACKTOP; //@line 280
      return;
     } else {
      _emscripten_free_async_context($AsyncCtx | 0); //@line 283
      break L1;
     }
    }
    break;
   }
  case 2:
   {
    $9 = HEAP32[$2 + 68 >> 2] | 0; //@line 291
    if ($9 | 0) {
     $12 = HEAP32[$9 >> 2] | 0; //@line 295
     $AsyncCtx2 = _emscripten_alloc_async_context(4, sp) | 0; //@line 296
     FUNCTION_TABLE_vi[$12 & 255]($2 + 56 | 0); //@line 297
     if (___async) {
      HEAP32[$AsyncCtx2 >> 2] = 19; //@line 300
      sp = STACKTOP; //@line 301
      return;
     } else {
      _emscripten_free_async_context($AsyncCtx2 | 0); //@line 304
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
 sp = STACKTOP; //@line 12419
 $1 = HEAP32[116] | 0; //@line 12420
 if ((HEAP32[$1 + 76 >> 2] | 0) > -1) {
  $19 = ___lockfile($1) | 0; //@line 12426
 } else {
  $19 = 0; //@line 12428
 }
 do {
  if ((_fputs($0, $1) | 0) < 0) {
   $22 = -1; //@line 12434
  } else {
   if ((HEAP8[$1 + 75 >> 0] | 0) != 10) {
    $11 = $1 + 20 | 0; //@line 12440
    $12 = HEAP32[$11 >> 2] | 0; //@line 12441
    if ($12 >>> 0 < (HEAP32[$1 + 16 >> 2] | 0) >>> 0) {
     HEAP32[$11 >> 2] = $12 + 1; //@line 12447
     HEAP8[$12 >> 0] = 10; //@line 12448
     $22 = 0; //@line 12449
     break;
    }
   }
   $AsyncCtx = _emscripten_alloc_async_context(12, sp) | 0; //@line 12453
   $17 = ___overflow($1, 10) | 0; //@line 12454
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 127; //@line 12457
    HEAP32[$AsyncCtx + 4 >> 2] = $19; //@line 12459
    HEAP32[$AsyncCtx + 8 >> 2] = $1; //@line 12461
    sp = STACKTOP; //@line 12462
    return 0; //@line 12463
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 12465
    $22 = $17 >> 31; //@line 12467
    break;
   }
  }
 } while (0);
 if ($19 | 0) {
  ___unlockfile($1); //@line 12474
 }
 return $22 | 0; //@line 12476
}
function __ZN4mbed11InterruptIn4fallENS_8CallbackIFvvEEE__async_cb_69($0) {
 $0 = $0 | 0;
 var $$pre$i$i4 = 0, $12 = 0, $13 = 0, $14 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx5 = 0, sp = 0;
 sp = STACKTOP; //@line 8608
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 8614
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 8616
 $$pre$i$i4 = HEAP32[HEAP32[$0 + 4 >> 2] >> 2] | 0; //@line 8617
 HEAP32[HEAP32[$0 + 8 >> 2] >> 2] = $$pre$i$i4; //@line 8618
 if (!$$pre$i$i4) {
  _gpio_irq_set($8 + 28 | 0, 2, 0); //@line 8622
  return;
 }
 $12 = HEAP32[$$pre$i$i4 + 8 >> 2] | 0; //@line 8627
 $ReallocAsyncCtx5 = _emscripten_realloc_async_context(12) | 0; //@line 8628
 FUNCTION_TABLE_vi[$12 & 255]($6); //@line 8629
 if (___async) {
  HEAP32[$ReallocAsyncCtx5 >> 2] = 24; //@line 8632
  $13 = $ReallocAsyncCtx5 + 4 | 0; //@line 8633
  HEAP32[$13 >> 2] = $6; //@line 8634
  $14 = $ReallocAsyncCtx5 + 8 | 0; //@line 8635
  HEAP32[$14 >> 2] = $8; //@line 8636
  sp = STACKTOP; //@line 8637
  return;
 }
 ___async_unwind = 0; //@line 8640
 HEAP32[$ReallocAsyncCtx5 >> 2] = 24; //@line 8641
 $13 = $ReallocAsyncCtx5 + 4 | 0; //@line 8642
 HEAP32[$13 >> 2] = $6; //@line 8643
 $14 = $ReallocAsyncCtx5 + 8 | 0; //@line 8644
 HEAP32[$14 >> 2] = $8; //@line 8645
 sp = STACKTOP; //@line 8646
 return;
}
function __ZN4mbed11InterruptInD0Ev($0) {
 $0 = $0 | 0;
 var $10 = 0, $14 = 0, $3 = 0, $7 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 195
 HEAP32[$0 >> 2] = 184; //@line 196
 _gpio_irq_free($0 + 28 | 0); //@line 198
 $3 = HEAP32[$0 + 68 >> 2] | 0; //@line 200
 do {
  if ($3 | 0) {
   $7 = HEAP32[$3 + 8 >> 2] | 0; //@line 206
   $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 207
   FUNCTION_TABLE_vi[$7 & 255]($0 + 56 | 0); //@line 208
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 16; //@line 211
    HEAP32[$AsyncCtx + 4 >> 2] = $0; //@line 213
    sp = STACKTOP; //@line 214
    return;
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 217
    break;
   }
  }
 } while (0);
 $10 = HEAP32[$0 + 52 >> 2] | 0; //@line 223
 if (!$10) {
  __ZdlPv($0); //@line 226
  return;
 }
 $14 = HEAP32[$10 + 8 >> 2] | 0; //@line 231
 $AsyncCtx3 = _emscripten_alloc_async_context(8, sp) | 0; //@line 232
 FUNCTION_TABLE_vi[$14 & 255]($0 + 40 | 0); //@line 233
 if (___async) {
  HEAP32[$AsyncCtx3 >> 2] = 17; //@line 236
  HEAP32[$AsyncCtx3 + 4 >> 2] = $0; //@line 238
  sp = STACKTOP; //@line 239
  return;
 }
 _emscripten_free_async_context($AsyncCtx3 | 0); //@line 242
 __ZdlPv($0); //@line 243
 return;
}
function _mbed_vtracef__async_cb_20($0) {
 $0 = $0 | 0;
 var $$18 = 0, $10 = 0, $12 = 0, $16 = 0, $19 = 0, $2 = 0, $20 = 0, $23 = 0, $24 = 0, $4 = 0, $6 = 0, $ReallocAsyncCtx7 = 0, sp = 0;
 sp = STACKTOP; //@line 3313
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 3315
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 3317
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 3319
 $10 = HEAP8[$0 + 20 >> 0] & 1; //@line 3324
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 3326
 HEAP32[$2 >> 2] = HEAP32[___async_retval >> 2]; //@line 3331
 $16 = _snprintf($4, $6, 1448, $2) | 0; //@line 3332
 $$18 = ($16 | 0) >= ($6 | 0) ? 0 : $16; //@line 3334
 $19 = $4 + $$18 | 0; //@line 3336
 $20 = $6 - $$18 | 0; //@line 3337
 if (($$18 | 0) > 0) {
  if (!(($$18 | 0) < 1 | ($20 | 0) < 1 | $10 ^ 1)) {
   _snprintf($19, $20, 1526, $12) | 0; //@line 3345
  }
 }
 $23 = HEAP32[59] | 0; //@line 3348
 $24 = HEAP32[52] | 0; //@line 3349
 $ReallocAsyncCtx7 = _emscripten_realloc_async_context(4) | 0; //@line 3350
 FUNCTION_TABLE_vi[$23 & 255]($24); //@line 3351
 if (___async) {
  HEAP32[$ReallocAsyncCtx7 >> 2] = 46; //@line 3354
  sp = STACKTOP; //@line 3355
  return;
 }
 ___async_unwind = 0; //@line 3358
 HEAP32[$ReallocAsyncCtx7 >> 2] = 46; //@line 3359
 sp = STACKTOP; //@line 3360
 return;
}
function __ZNK10__cxxabiv121__vmi_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb_78($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 9085
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 9091
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 9093
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 9095
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 9097
 if ((HEAP32[$0 + 4 >> 2] | 0) <= 1) {
  return;
 }
 $14 = (HEAP32[$0 + 8 >> 2] | 0) + 24 | 0; //@line 9102
 $ReallocAsyncCtx = _emscripten_realloc_async_context(28) | 0; //@line 9104
 __ZNK10__cxxabiv122__base_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($14, $6, $8, $10); //@line 9105
 if (!___async) {
  ___async_unwind = 0; //@line 9108
 }
 HEAP32[$ReallocAsyncCtx >> 2] = 150; //@line 9110
 HEAP32[$ReallocAsyncCtx + 4 >> 2] = $6 + 54; //@line 9112
 HEAP32[$ReallocAsyncCtx + 8 >> 2] = $14; //@line 9114
 HEAP32[$ReallocAsyncCtx + 12 >> 2] = $12; //@line 9116
 HEAP32[$ReallocAsyncCtx + 16 >> 2] = $6; //@line 9118
 HEAP32[$ReallocAsyncCtx + 20 >> 2] = $8; //@line 9120
 HEAP32[$ReallocAsyncCtx + 24 >> 2] = $10; //@line 9122
 sp = STACKTOP; //@line 9123
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
   __ZNK10__cxxabiv117__class_type_info29process_static_type_below_dstEPNS_19__dynamic_cast_infoEPKvi(0, $1, $2, $3); //@line 12784
  } else {
   if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 >> 2] | 0, $4) | 0) {
    if ((HEAP32[$1 + 16 >> 2] | 0) != ($2 | 0)) {
     $13 = $1 + 20 | 0; //@line 12793
     if ((HEAP32[$13 >> 2] | 0) != ($2 | 0)) {
      HEAP32[$1 + 32 >> 2] = $3; //@line 12798
      HEAP32[$13 >> 2] = $2; //@line 12799
      $19 = $1 + 40 | 0; //@line 12800
      HEAP32[$19 >> 2] = (HEAP32[$19 >> 2] | 0) + 1; //@line 12803
      if ((HEAP32[$1 + 36 >> 2] | 0) == 1) {
       if ((HEAP32[$1 + 24 >> 2] | 0) == 2) {
        HEAP8[$1 + 54 >> 0] = 1; //@line 12813
       }
      }
      HEAP32[$1 + 44 >> 2] = 4; //@line 12817
      break;
     }
    }
    if (($3 | 0) == 1) {
     HEAP32[$1 + 32 >> 2] = 1; //@line 12824
    }
   }
  }
 } while (0);
 return;
}
function __ZL25default_terminate_handlerv__async_cb($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $15 = 0, $16 = 0, $2 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 5481
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 5483
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 5485
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 5487
 $8 = HEAP32[$0 + 20 >> 2] | 0; //@line 5489
 $10 = HEAP32[$0 + 24 >> 2] | 0; //@line 5491
 if (!(HEAP8[___async_retval >> 0] & 1)) {
  HEAP32[$4 >> 2] = 5375; //@line 5496
  HEAP32[$4 + 4 >> 2] = $6; //@line 5498
  _abort_message(5284, $4); //@line 5499
 }
 $12 = HEAP32[$2 >> 2] | 0; //@line 5502
 $15 = HEAP32[(HEAP32[$12 >> 2] | 0) + 8 >> 2] | 0; //@line 5505
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(16) | 0; //@line 5506
 $16 = FUNCTION_TABLE_ii[$15 & 15]($12) | 0; //@line 5507
 if (!___async) {
  HEAP32[___async_retval >> 2] = $16; //@line 5511
  ___async_unwind = 0; //@line 5512
 }
 HEAP32[$ReallocAsyncCtx2 >> 2] = 129; //@line 5514
 HEAP32[$ReallocAsyncCtx2 + 4 >> 2] = $8; //@line 5516
 HEAP32[$ReallocAsyncCtx2 + 8 >> 2] = $6; //@line 5518
 HEAP32[$ReallocAsyncCtx2 + 12 >> 2] = $10; //@line 5520
 sp = STACKTOP; //@line 5521
 return;
}
function ___strerror_l($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$012$lcssa = 0, $$01214 = 0, $$016 = 0, $$113 = 0, $$115 = 0, $7 = 0, label = 0, $$113$looptemp = 0;
 $$016 = 0; //@line 11466
 while (1) {
  if ((HEAPU8[3347 + $$016 >> 0] | 0) == ($0 | 0)) {
   label = 2; //@line 11473
   break;
  }
  $7 = $$016 + 1 | 0; //@line 11476
  if (($7 | 0) == 87) {
   $$01214 = 3435; //@line 11479
   $$115 = 87; //@line 11479
   label = 5; //@line 11480
   break;
  } else {
   $$016 = $7; //@line 11483
  }
 }
 if ((label | 0) == 2) {
  if (!$$016) {
   $$012$lcssa = 3435; //@line 11489
  } else {
   $$01214 = 3435; //@line 11491
   $$115 = $$016; //@line 11491
   label = 5; //@line 11492
  }
 }
 if ((label | 0) == 5) {
  while (1) {
   label = 0; //@line 11497
   $$113 = $$01214; //@line 11498
   do {
    $$113$looptemp = $$113;
    $$113 = $$113 + 1 | 0; //@line 11502
   } while ((HEAP8[$$113$looptemp >> 0] | 0) != 0);
   $$115 = $$115 + -1 | 0; //@line 11509
   if (!$$115) {
    $$012$lcssa = $$113; //@line 11512
    break;
   } else {
    $$01214 = $$113; //@line 11515
    label = 5; //@line 11516
   }
  }
 }
 return ___lctrans($$012$lcssa, HEAP32[$1 + 20 >> 2] | 0) | 0; //@line 11523
}
function __ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb($0) {
 $0 = $0 | 0;
 var $$037$off038 = 0, $$037$off039 = 0, $12 = 0, $17 = 0, $4 = 0, $6 = 0, $8 = 0, label = 0;
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 9240
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 9242
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 9244
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 9248
 if (!(HEAP8[HEAP32[$0 + 4 >> 2] >> 0] | 0)) {
  $$037$off038 = 4; //@line 9252
  label = 4; //@line 9253
 } else {
  if (!(HEAP8[HEAP32[$0 + 20 >> 2] >> 0] | 0)) {
   $$037$off038 = 3; //@line 9258
   label = 4; //@line 9259
  } else {
   $$037$off039 = 3; //@line 9261
  }
 }
 if ((label | 0) == 4) {
  HEAP32[$6 >> 2] = $4; //@line 9265
  $17 = $8 + 40 | 0; //@line 9266
  HEAP32[$17 >> 2] = (HEAP32[$17 >> 2] | 0) + 1; //@line 9269
  if ((HEAP32[$8 + 36 >> 2] | 0) == 1) {
   if ((HEAP32[$8 + 24 >> 2] | 0) == 2) {
    HEAP8[$8 + 54 >> 0] = 1; //@line 9279
    $$037$off039 = $$037$off038; //@line 9280
   } else {
    $$037$off039 = $$037$off038; //@line 9282
   }
  } else {
   $$037$off039 = $$037$off038; //@line 9285
  }
 }
 HEAP32[$12 >> 2] = $$037$off039; //@line 9288
 return;
}
function __ZN6events5EventIFvvEE10event_postIPS1_EEiPNS2_5eventE__async_cb_10($0) {
 $0 = $0 | 0;
 var $13 = 0, $14 = 0, $2 = 0, $4 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 1960
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 1962
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 1964
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 1966
 if (!$AsyncRetVal) {
  HEAP32[___async_retval >> 2] = 0; //@line 1970
  return;
 }
 HEAP32[$AsyncRetVal >> 2] = HEAP32[$2 + 28 >> 2]; //@line 1975
 _equeue_event_delay($AsyncRetVal, HEAP32[$2 + 12 >> 2] | 0); //@line 1978
 _equeue_event_period($AsyncRetVal, HEAP32[$2 + 16 >> 2] | 0); //@line 1981
 _equeue_event_dtor($AsyncRetVal, 104); //@line 1982
 $13 = HEAP32[$4 >> 2] | 0; //@line 1983
 $ReallocAsyncCtx = _emscripten_realloc_async_context(4) | 0; //@line 1984
 $14 = _equeue_post($13, 105, $AsyncRetVal) | 0; //@line 1985
 if (___async) {
  HEAP32[$ReallocAsyncCtx >> 2] = 106; //@line 1988
  sp = STACKTOP; //@line 1989
  return;
 }
 HEAP32[___async_retval >> 2] = $14; //@line 1993
 ___async_unwind = 0; //@line 1994
 HEAP32[$ReallocAsyncCtx >> 2] = 106; //@line 1995
 sp = STACKTOP; //@line 1996
 return;
}
function _strstr($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0 = 0, $2 = 0, $5 = 0;
 $2 = HEAP8[$1 >> 0] | 0; //@line 11539
 do {
  if (!($2 << 24 >> 24)) {
   $$0 = $0; //@line 11543
  } else {
   $5 = _strchr($0, $2 << 24 >> 24) | 0; //@line 11546
   if (!$5) {
    $$0 = 0; //@line 11549
   } else {
    if (!(HEAP8[$1 + 1 >> 0] | 0)) {
     $$0 = $5; //@line 11555
    } else {
     if (!(HEAP8[$5 + 1 >> 0] | 0)) {
      $$0 = 0; //@line 11561
     } else {
      if (!(HEAP8[$1 + 2 >> 0] | 0)) {
       $$0 = _twobyte_strstr($5, $1) | 0; //@line 11568
       break;
      }
      if (!(HEAP8[$5 + 2 >> 0] | 0)) {
       $$0 = 0; //@line 11575
      } else {
       if (!(HEAP8[$1 + 3 >> 0] | 0)) {
        $$0 = _threebyte_strstr($5, $1) | 0; //@line 11582
        break;
       }
       if (!(HEAP8[$5 + 3 >> 0] | 0)) {
        $$0 = 0; //@line 11589
       } else {
        if (!(HEAP8[$1 + 4 >> 0] | 0)) {
         $$0 = _fourbyte_strstr($5, $1) | 0; //@line 11596
         break;
        } else {
         $$0 = _twoway_strstr($5, $1) | 0; //@line 11600
         break;
        }
       }
      }
     }
    }
   }
  }
 } while (0);
 return $$0 | 0; //@line 11610
}
function __ZN4mbed11InterruptInD2Ev($0) {
 $0 = $0 | 0;
 var $10 = 0, $14 = 0, $3 = 0, $7 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 144
 HEAP32[$0 >> 2] = 184; //@line 145
 _gpio_irq_free($0 + 28 | 0); //@line 147
 $3 = HEAP32[$0 + 68 >> 2] | 0; //@line 149
 do {
  if ($3 | 0) {
   $7 = HEAP32[$3 + 8 >> 2] | 0; //@line 155
   $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 156
   FUNCTION_TABLE_vi[$7 & 255]($0 + 56 | 0); //@line 157
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 14; //@line 160
    HEAP32[$AsyncCtx + 4 >> 2] = $0; //@line 162
    sp = STACKTOP; //@line 163
    return;
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 166
    break;
   }
  }
 } while (0);
 $10 = HEAP32[$0 + 52 >> 2] | 0; //@line 172
 if (!$10) {
  return;
 }
 $14 = HEAP32[$10 + 8 >> 2] | 0; //@line 179
 $AsyncCtx3 = _emscripten_alloc_async_context(4, sp) | 0; //@line 180
 FUNCTION_TABLE_vi[$14 & 255]($0 + 40 | 0); //@line 181
 if (___async) {
  HEAP32[$AsyncCtx3 >> 2] = 15; //@line 184
  sp = STACKTOP; //@line 185
  return;
 }
 _emscripten_free_async_context($AsyncCtx3 | 0); //@line 188
 return;
}
function _fourbyte_strstr($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$lcssa = 0, $$sink21$lcssa = 0, $$sink2123 = 0, $18 = 0, $32 = 0, $33 = 0, $35 = 0, $39 = 0, $40 = 0, $41 = 0;
 $18 = (HEAPU8[$1 + 1 >> 0] | 0) << 16 | (HEAPU8[$1 >> 0] | 0) << 24 | (HEAPU8[$1 + 2 >> 0] | 0) << 8 | (HEAPU8[$1 + 3 >> 0] | 0); //@line 11735
 $32 = $0 + 3 | 0; //@line 11749
 $33 = HEAP8[$32 >> 0] | 0; //@line 11750
 $35 = (HEAPU8[$0 + 1 >> 0] | 0) << 16 | (HEAPU8[$0 >> 0] | 0) << 24 | (HEAPU8[$0 + 2 >> 0] | 0) << 8 | $33 & 255; //@line 11752
 if ($33 << 24 >> 24 == 0 | ($35 | 0) == ($18 | 0)) {
  $$lcssa = $33; //@line 11757
  $$sink21$lcssa = $32; //@line 11757
 } else {
  $$sink2123 = $32; //@line 11759
  $39 = $35; //@line 11759
  while (1) {
   $40 = $$sink2123 + 1 | 0; //@line 11762
   $41 = HEAP8[$40 >> 0] | 0; //@line 11763
   $39 = $39 << 8 | $41 & 255; //@line 11765
   if ($41 << 24 >> 24 == 0 | ($39 | 0) == ($18 | 0)) {
    $$lcssa = $41; //@line 11770
    $$sink21$lcssa = $40; //@line 11770
    break;
   } else {
    $$sink2123 = $40; //@line 11773
   }
  }
 }
 return ($$lcssa << 24 >> 24 ? $$sink21$lcssa + -3 | 0 : 0) | 0; //@line 11780
}
function __ZN4mbed8CallbackIFvvEE13function_dtorIN6events5EventIS1_EEEEvPv($0) {
 $0 = $0 | 0;
 var $1 = 0, $11 = 0, $4 = 0, $7 = 0, $9 = 0, $AsyncCtx = 0, $AsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 4248
 $1 = HEAP32[$0 >> 2] | 0; //@line 4249
 if (!$1) {
  return;
 }
 $4 = (HEAP32[$1 >> 2] | 0) + -1 | 0; //@line 4255
 HEAP32[$1 >> 2] = $4; //@line 4256
 if ($4 | 0) {
  return;
 }
 $7 = HEAP32[$1 + 24 >> 2] | 0; //@line 4262
 $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 4263
 FUNCTION_TABLE_vi[$7 & 255]($1); //@line 4264
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 109; //@line 4267
  HEAP32[$AsyncCtx + 4 >> 2] = $0; //@line 4269
  sp = STACKTOP; //@line 4270
  return;
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 4273
 $9 = HEAP32[$0 >> 2] | 0; //@line 4274
 $11 = HEAP32[$9 + 4 >> 2] | 0; //@line 4276
 $AsyncCtx2 = _emscripten_alloc_async_context(4, sp) | 0; //@line 4277
 _equeue_dealloc($11, $9); //@line 4278
 if (___async) {
  HEAP32[$AsyncCtx2 >> 2] = 110; //@line 4281
  sp = STACKTOP; //@line 4282
  return;
 }
 _emscripten_free_async_context($AsyncCtx2 | 0); //@line 4285
 return;
}
function _mbed_vtracef__async_cb_26($0) {
 $0 = $0 | 0;
 var $3 = 0, $5 = 0, $6 = 0, $7 = 0, $ReallocAsyncCtx2 = 0, $ReallocAsyncCtx4 = 0, sp = 0;
 sp = STACKTOP; //@line 3698
 $3 = HEAP32[60] | 0; //@line 3702
 if (HEAP8[$0 + 4 >> 0] & 1 & ($3 | 0) != 0) {
  $5 = HEAP32[52] | 0; //@line 3706
  $ReallocAsyncCtx2 = _emscripten_realloc_async_context(4) | 0; //@line 3707
  FUNCTION_TABLE_vi[$3 & 255]($5); //@line 3708
  if (___async) {
   HEAP32[$ReallocAsyncCtx2 >> 2] = 39; //@line 3711
   sp = STACKTOP; //@line 3712
   return;
  }
  ___async_unwind = 0; //@line 3715
  HEAP32[$ReallocAsyncCtx2 >> 2] = 39; //@line 3716
  sp = STACKTOP; //@line 3717
  return;
 } else {
  $6 = HEAP32[59] | 0; //@line 3720
  $7 = HEAP32[52] | 0; //@line 3721
  $ReallocAsyncCtx4 = _emscripten_realloc_async_context(4) | 0; //@line 3722
  FUNCTION_TABLE_vi[$6 & 255]($7); //@line 3723
  if (___async) {
   HEAP32[$ReallocAsyncCtx4 >> 2] = 41; //@line 3726
   sp = STACKTOP; //@line 3727
   return;
  }
  ___async_unwind = 0; //@line 3730
  HEAP32[$ReallocAsyncCtx4 >> 2] = 41; //@line 3731
  sp = STACKTOP; //@line 3732
  return;
 }
}
function _invoke_ticker($0) {
 $0 = $0 | 0;
 var $2 = 0, $3 = 0, $7 = 0, $8 = 0, $AsyncCtx = 0, $AsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 3074
 $2 = $0 + 12 | 0; //@line 3076
 $3 = HEAP32[$2 >> 2] | 0; //@line 3077
 do {
  if (!$3) {
   $AsyncCtx2 = _emscripten_alloc_async_context(12, sp) | 0; //@line 3081
   _mbed_assert_internal(1803, 1808, 528); //@line 3082
   if (___async) {
    HEAP32[$AsyncCtx2 >> 2] = 73; //@line 3085
    HEAP32[$AsyncCtx2 + 4 >> 2] = $2; //@line 3087
    HEAP32[$AsyncCtx2 + 8 >> 2] = $0; //@line 3089
    sp = STACKTOP; //@line 3090
    return;
   } else {
    _emscripten_free_async_context($AsyncCtx2 | 0); //@line 3093
    $8 = HEAP32[$2 >> 2] | 0; //@line 3095
    break;
   }
  } else {
   $8 = $3; //@line 3099
  }
 } while (0);
 $7 = HEAP32[$8 >> 2] | 0; //@line 3102
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 3104
 FUNCTION_TABLE_vi[$7 & 255]($0); //@line 3105
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 74; //@line 3108
  sp = STACKTOP; //@line 3109
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 3112
  return;
 }
}
function _abort_message($0, $varargs) {
 $0 = $0 | 0;
 $varargs = $varargs | 0;
 var $1 = 0, $2 = 0, $AsyncCtx = 0, $AsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 12617
 STACKTOP = STACKTOP + 16 | 0; //@line 12618
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 12618
 $1 = sp; //@line 12619
 HEAP32[$1 >> 2] = $varargs; //@line 12620
 $2 = HEAP32[84] | 0; //@line 12621
 $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 12622
 _vfprintf($2, $0, $1) | 0; //@line 12623
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 130; //@line 12626
  HEAP32[$AsyncCtx + 4 >> 2] = $2; //@line 12628
  sp = STACKTOP; //@line 12629
  STACKTOP = sp; //@line 12630
  return;
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 12632
 $AsyncCtx2 = _emscripten_alloc_async_context(4, sp) | 0; //@line 12633
 _fputc(10, $2) | 0; //@line 12634
 if (___async) {
  HEAP32[$AsyncCtx2 >> 2] = 131; //@line 12637
  sp = STACKTOP; //@line 12638
  STACKTOP = sp; //@line 12639
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx2 | 0); //@line 12641
  _abort(); //@line 12642
 }
}
function _threebyte_strstr($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$016$lcssa = 0, $$01618 = 0, $$019 = 0, $$lcssa = 0, $14 = 0, $23 = 0, $24 = 0, $27 = 0, $30 = 0, $31 = 0;
 $14 = (HEAPU8[$1 + 1 >> 0] | 0) << 16 | (HEAPU8[$1 >> 0] | 0) << 24 | (HEAPU8[$1 + 2 >> 0] | 0) << 8; //@line 11669
 $23 = $0 + 2 | 0; //@line 11678
 $24 = HEAP8[$23 >> 0] | 0; //@line 11679
 $27 = (HEAPU8[$0 + 1 >> 0] | 0) << 16 | (HEAPU8[$0 >> 0] | 0) << 24 | ($24 & 255) << 8; //@line 11682
 if (($27 | 0) == ($14 | 0) | $24 << 24 >> 24 == 0) {
  $$016$lcssa = $23; //@line 11687
  $$lcssa = $24; //@line 11687
 } else {
  $$01618 = $23; //@line 11689
  $$019 = $27; //@line 11689
  while (1) {
   $30 = $$01618 + 1 | 0; //@line 11691
   $31 = HEAP8[$30 >> 0] | 0; //@line 11692
   $$019 = ($$019 | $31 & 255) << 8; //@line 11695
   if (($$019 | 0) == ($14 | 0) | $31 << 24 >> 24 == 0) {
    $$016$lcssa = $30; //@line 11700
    $$lcssa = $31; //@line 11700
    break;
   } else {
    $$01618 = $30; //@line 11703
   }
  }
 }
 return ($$lcssa << 24 >> 24 ? $$016$lcssa + -2 | 0 : 0) | 0; //@line 11710
}
function _frexp($0, $1) {
 $0 = +$0;
 $1 = $1 | 0;
 var $$0 = 0.0, $$016 = 0.0, $2 = 0, $3 = 0, $4 = 0, $9 = 0.0, $storemerge = 0;
 HEAPF64[tempDoublePtr >> 3] = $0; //@line 11297
 $2 = HEAP32[tempDoublePtr >> 2] | 0; //@line 11297
 $3 = HEAP32[tempDoublePtr + 4 >> 2] | 0; //@line 11298
 $4 = _bitshift64Lshr($2 | 0, $3 | 0, 52) | 0; //@line 11299
 switch ($4 & 2047) {
 case 0:
  {
   if ($0 != 0.0) {
    $9 = +_frexp($0 * 18446744073709552000.0, $1); //@line 11308
    $$016 = $9; //@line 11311
    $storemerge = (HEAP32[$1 >> 2] | 0) + -64 | 0; //@line 11311
   } else {
    $$016 = $0; //@line 11313
    $storemerge = 0; //@line 11313
   }
   HEAP32[$1 >> 2] = $storemerge; //@line 11315
   $$0 = $$016; //@line 11316
   break;
  }
 case 2047:
  {
   $$0 = $0; //@line 11320
   break;
  }
 default:
  {
   HEAP32[$1 >> 2] = ($4 & 2047) + -1022; //@line 11326
   HEAP32[tempDoublePtr >> 2] = $2; //@line 11329
   HEAP32[tempDoublePtr + 4 >> 2] = $3 & -2146435073 | 1071644672; //@line 11329
   $$0 = +HEAPF64[tempDoublePtr >> 3]; //@line 11330
  }
 }
 return +$$0;
}
function _equeue_sema_wait($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $2 = 0, $20 = 0, $3 = 0, $4 = 0, sp = 0;
 sp = STACKTOP; //@line 1699
 STACKTOP = STACKTOP + 16 | 0; //@line 1700
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 1700
 $2 = sp + 8 | 0; //@line 1701
 $3 = sp; //@line 1702
 _pthread_mutex_lock($0 | 0) | 0; //@line 1703
 $4 = $0 + 76 | 0; //@line 1704
 do {
  if (!(HEAP8[$4 >> 0] | 0)) {
   if (($1 | 0) < 0) {
    _pthread_cond_wait($0 + 28 | 0, $0 | 0) | 0; //@line 1712
    break;
   } else {
    _gettimeofday($2 | 0, 0) | 0; //@line 1715
    HEAP32[$3 >> 2] = (HEAP32[$2 >> 2] | 0) + (($1 >>> 0) / 1e3 | 0); //@line 1719
    HEAP32[$3 + 4 >> 2] = ((HEAP32[$2 + 4 >> 2] | 0) * 1e3 | 0) + ($1 * 1e6 | 0); //@line 1726
    _pthread_cond_timedwait($0 + 28 | 0, $0 | 0, $3 | 0) | 0; //@line 1728
    break;
   }
  }
 } while (0);
 $20 = (HEAP8[$4 >> 0] | 0) != 0; //@line 1734
 HEAP8[$4 >> 0] = 0; //@line 1735
 _pthread_mutex_unlock($0 | 0) | 0; //@line 1736
 STACKTOP = sp; //@line 1737
 return $20 | 0; //@line 1737
}
function __ZN4mbed8CallbackIFvvEE13function_callIN6events5EventIS1_EEEEvPKv($0) {
 $0 = $0 | 0;
 var $1 = 0, $4 = 0, $5 = 0, $AsyncCtx = 0, $AsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 4192
 $1 = HEAP32[$0 >> 2] | 0; //@line 4193
 if ($1 | 0) {
  $4 = HEAP32[$1 + 20 >> 2] | 0; //@line 4197
  $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 4198
  $5 = FUNCTION_TABLE_ii[$4 & 15]($1) | 0; //@line 4199
  if (___async) {
   HEAP32[$AsyncCtx >> 2] = 107; //@line 4202
   HEAP32[$AsyncCtx + 4 >> 2] = $0; //@line 4204
   sp = STACKTOP; //@line 4205
   return;
  }
  _emscripten_free_async_context($AsyncCtx | 0); //@line 4208
  HEAP32[(HEAP32[$0 >> 2] | 0) + 8 >> 2] = $5; //@line 4211
  if ($5 | 0) {
   return;
  }
 }
 $AsyncCtx2 = _emscripten_alloc_async_context(4, sp) | 0; //@line 4217
 _mbed_assert_internal(2731, 2734, 149); //@line 4218
 if (___async) {
  HEAP32[$AsyncCtx2 >> 2] = 108; //@line 4221
  sp = STACKTOP; //@line 4222
  return;
 }
 _emscripten_free_async_context($AsyncCtx2 | 0); //@line 4225
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
 sp = STACKTOP; //@line 13140
 do {
  if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, $5) | 0) {
   __ZNK10__cxxabiv117__class_type_info29process_static_type_above_dstEPNS_19__dynamic_cast_infoEPKvS4_i(0, $1, $2, $3, $4); //@line 13146
  } else {
   $10 = HEAP32[$0 + 8 >> 2] | 0; //@line 13149
   $13 = HEAP32[(HEAP32[$10 >> 2] | 0) + 20 >> 2] | 0; //@line 13152
   $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 13153
   FUNCTION_TABLE_viiiiii[$13 & 3]($10, $1, $2, $3, $4, $5); //@line 13154
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 136; //@line 13157
    sp = STACKTOP; //@line 13158
    return;
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 13161
    break;
   }
  }
 } while (0);
 return;
}
function _vfprintf__async_cb($0) {
 $0 = $0 | 0;
 var $$ = 0, $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $2 = 0, $20 = 0, $22 = 0, $33 = 0;
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 1382
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 1390
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 1392
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 1394
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 1396
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 1398
 $20 = HEAP32[$0 + 40 >> 2] | 0; //@line 1400
 $22 = HEAP32[$0 + 44 >> 2] | 0; //@line 1402
 $$ = (HEAP32[$2 >> 2] | 0) == 0 ? -1 : HEAP32[$0 + 8 >> 2] | 0; //@line 1413
 HEAP32[HEAP32[$0 + 16 >> 2] >> 2] = HEAP32[$0 + 12 >> 2]; //@line 1414
 HEAP32[$10 >> 2] = 0; //@line 1415
 HEAP32[$12 >> 2] = 0; //@line 1416
 HEAP32[$14 >> 2] = 0; //@line 1417
 HEAP32[$2 >> 2] = 0; //@line 1418
 $33 = HEAP32[$16 >> 2] | 0; //@line 1419
 HEAP32[$16 >> 2] = $33 | $18; //@line 1424
 if ($20 | 0) {
  ___unlockfile($22); //@line 1427
 }
 HEAP32[___async_retval >> 2] = ($33 & 32 | 0) == 0 ? $$ : -1; //@line 1430
 return;
}
function _mbed_vtracef__async_cb_23($0) {
 $0 = $0 | 0;
 var $$pre = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $ReallocAsyncCtx9 = 0, sp = 0;
 sp = STACKTOP; //@line 3429
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 3433
 if ((HEAP32[$0 + 4 >> 2] | 0) <= 2) {
  return;
 }
 $5 = $4 + -1 | 0; //@line 3438
 $$pre = HEAP32[62] | 0; //@line 3439
 $ReallocAsyncCtx9 = _emscripten_realloc_async_context(12) | 0; //@line 3440
 FUNCTION_TABLE_v[$$pre & 3](); //@line 3441
 if (___async) {
  HEAP32[$ReallocAsyncCtx9 >> 2] = 48; //@line 3444
  $6 = $ReallocAsyncCtx9 + 4 | 0; //@line 3445
  HEAP32[$6 >> 2] = $4; //@line 3446
  $7 = $ReallocAsyncCtx9 + 8 | 0; //@line 3447
  HEAP32[$7 >> 2] = $5; //@line 3448
  sp = STACKTOP; //@line 3449
  return;
 }
 ___async_unwind = 0; //@line 3452
 HEAP32[$ReallocAsyncCtx9 >> 2] = 48; //@line 3453
 $6 = $ReallocAsyncCtx9 + 4 | 0; //@line 3454
 HEAP32[$6 >> 2] = $4; //@line 3455
 $7 = $ReallocAsyncCtx9 + 8 | 0; //@line 3456
 HEAP32[$7 >> 2] = $5; //@line 3457
 sp = STACKTOP; //@line 3458
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
 sp = STACKTOP; //@line 3882
 STACKTOP = STACKTOP + 16 | 0; //@line 3883
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 3883
 $vararg_buffer = sp; //@line 3884
 $0 = HEAP32[1468] | 0; //@line 3885
 HEAP32[$0 >> 2] = (HEAP32[$0 >> 2] | 0) + 1; //@line 3888
 $AsyncCtx = _emscripten_alloc_async_context(12, sp) | 0; //@line 3889
 __ZN20SimulatorBlockDevice7programEPKvyy(5816, $0, 0, 0, 512, 0) | 0; //@line 3890
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 90; //@line 3893
  HEAP32[$AsyncCtx + 4 >> 2] = $vararg_buffer; //@line 3895
  HEAP32[$AsyncCtx + 8 >> 2] = $vararg_buffer; //@line 3897
  sp = STACKTOP; //@line 3898
  STACKTOP = sp; //@line 3899
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 3901
  HEAP32[$vararg_buffer >> 2] = HEAP32[HEAP32[1468] >> 2]; //@line 3904
  _printf(2424, $vararg_buffer) | 0; //@line 3905
  STACKTOP = sp; //@line 3906
  return;
 }
}
function _mbed_vtracef__async_cb_22($0) {
 $0 = $0 | 0;
 var $$pre = 0, $2 = 0, $4 = 0, $5 = 0, $6 = 0, $ReallocAsyncCtx9 = 0, sp = 0;
 sp = STACKTOP; //@line 3396
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 3398
 if (($2 | 0) <= 1) {
  return;
 }
 $4 = $2 + -1 | 0; //@line 3403
 $$pre = HEAP32[62] | 0; //@line 3404
 $ReallocAsyncCtx9 = _emscripten_realloc_async_context(12) | 0; //@line 3405
 FUNCTION_TABLE_v[$$pre & 3](); //@line 3406
 if (___async) {
  HEAP32[$ReallocAsyncCtx9 >> 2] = 48; //@line 3409
  $5 = $ReallocAsyncCtx9 + 4 | 0; //@line 3410
  HEAP32[$5 >> 2] = $2; //@line 3411
  $6 = $ReallocAsyncCtx9 + 8 | 0; //@line 3412
  HEAP32[$6 >> 2] = $4; //@line 3413
  sp = STACKTOP; //@line 3414
  return;
 }
 ___async_unwind = 0; //@line 3417
 HEAP32[$ReallocAsyncCtx9 >> 2] = 48; //@line 3418
 $5 = $ReallocAsyncCtx9 + 4 | 0; //@line 3419
 HEAP32[$5 >> 2] = $2; //@line 3420
 $6 = $ReallocAsyncCtx9 + 8 | 0; //@line 3421
 HEAP32[$6 >> 2] = $4; //@line 3422
 sp = STACKTOP; //@line 3423
 return;
}
function __ZNK10__cxxabiv120__si_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $11 = 0, $8 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 13309
 do {
  if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, 0) | 0) {
   __ZNK10__cxxabiv117__class_type_info24process_found_base_classEPNS_19__dynamic_cast_infoEPvi(0, $1, $2, $3); //@line 13315
  } else {
   $8 = HEAP32[$0 + 8 >> 2] | 0; //@line 13318
   $11 = HEAP32[(HEAP32[$8 >> 2] | 0) + 28 >> 2] | 0; //@line 13321
   $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 13322
   FUNCTION_TABLE_viiii[$11 & 3]($8, $1, $2, $3); //@line 13323
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 139; //@line 13326
    sp = STACKTOP; //@line 13327
    return;
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 13330
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
function ___dynamic_cast__async_cb_2($0) {
 $0 = $0 | 0;
 var $$0 = 0, $10 = 0, $16 = 0, $6 = 0, $8 = 0;
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 1005
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 1007
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 1009
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 1015
 L2 : do {
  switch (HEAP32[HEAP32[$0 + 4 >> 2] >> 2] | 0) {
  case 0:
   {
    $$0 = (HEAP32[$6 >> 2] | 0) == 1 & (HEAP32[$8 >> 2] | 0) == 1 & (HEAP32[$10 >> 2] | 0) == 1 ? HEAP32[HEAP32[$0 + 24 >> 2] >> 2] | 0 : 0; //@line 1030
    break;
   }
  case 1:
   {
    if ((HEAP32[HEAP32[$0 + 28 >> 2] >> 2] | 0) != 1) {
     if (!((HEAP32[$6 >> 2] | 0) == 0 & (HEAP32[$8 >> 2] | 0) == 1 & (HEAP32[$10 >> 2] | 0) == 1)) {
      $$0 = 0; //@line 1046
      break L2;
     }
    }
    $$0 = HEAP32[$16 >> 2] | 0; //@line 1051
    break;
   }
  default:
   {
    $$0 = 0; //@line 1055
   }
  }
 } while (0);
 HEAP32[___async_retval >> 2] = $$0; //@line 1060
 return;
}
function _mbed_error_vfprintf__async_cb_61($0) {
 $0 = $0 | 0;
 var $10 = 0, $2 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 5757
 $2 = HEAP8[$0 + 4 >> 0] | 0; //@line 5759
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 5761
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 5763
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 5765
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 5767
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(24) | 0; //@line 5769
 _serial_putc(5864, $2 << 24 >> 24); //@line 5770
 if (!___async) {
  ___async_unwind = 0; //@line 5773
 }
 HEAP32[$ReallocAsyncCtx2 >> 2] = 69; //@line 5775
 HEAP32[$ReallocAsyncCtx2 + 4 >> 2] = $4; //@line 5777
 HEAP32[$ReallocAsyncCtx2 + 8 >> 2] = $6; //@line 5779
 HEAP32[$ReallocAsyncCtx2 + 12 >> 2] = $8; //@line 5781
 HEAP8[$ReallocAsyncCtx2 + 16 >> 0] = $2; //@line 5783
 HEAP32[$ReallocAsyncCtx2 + 20 >> 2] = $10; //@line 5785
 sp = STACKTOP; //@line 5786
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
 sp = STACKTOP; //@line 10295
 STACKTOP = STACKTOP + 256 | 0; //@line 10296
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(256); //@line 10296
 $5 = sp; //@line 10297
 if (($2 | 0) > ($3 | 0) & ($4 & 73728 | 0) == 0) {
  $9 = $2 - $3 | 0; //@line 10303
  _memset($5 | 0, $1 << 24 >> 24 | 0, ($9 >>> 0 < 256 ? $9 : 256) | 0) | 0; //@line 10307
  if ($9 >>> 0 > 255) {
   $14 = $2 - $3 | 0; //@line 10310
   $$011 = $9; //@line 10311
   do {
    _out_670($0, $5, 256); //@line 10313
    $$011 = $$011 + -256 | 0; //@line 10314
   } while ($$011 >>> 0 > 255);
   $$0$lcssa = $14 & 255; //@line 10323
  } else {
   $$0$lcssa = $9; //@line 10325
  }
  _out_670($0, $5, $$0$lcssa); //@line 10327
 }
 STACKTOP = sp; //@line 10329
 return;
}
function _main__async_cb_38($0) {
 $0 = $0 | 0;
 var $10 = 0, $2 = 0, $6 = 0, $9 = 0, $ReallocAsyncCtx11 = 0, sp = 0;
 sp = STACKTOP; //@line 4861
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 4863
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 4867
 HEAP32[$2 >> 2] = HEAP32[HEAP32[1468] >> 2]; //@line 4870
 _printf(2702, $2) | 0; //@line 4871
 $ReallocAsyncCtx11 = _emscripten_realloc_async_context(8) | 0; //@line 4872
 $9 = _equeue_alloc(5876, 32) | 0; //@line 4873
 if (___async) {
  HEAP32[$ReallocAsyncCtx11 >> 2] = 96; //@line 4876
  $10 = $ReallocAsyncCtx11 + 4 | 0; //@line 4877
  HEAP32[$10 >> 2] = $6; //@line 4878
  sp = STACKTOP; //@line 4879
  return;
 }
 HEAP32[___async_retval >> 2] = $9; //@line 4883
 ___async_unwind = 0; //@line 4884
 HEAP32[$ReallocAsyncCtx11 >> 2] = 96; //@line 4885
 $10 = $ReallocAsyncCtx11 + 4 | 0; //@line 4886
 HEAP32[$10 >> 2] = $6; //@line 4887
 sp = STACKTOP; //@line 4888
 return;
}
function ___stdio_seek($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $10 = 0, $3 = 0, $vararg_buffer = 0, sp = 0;
 sp = STACKTOP; //@line 7590
 STACKTOP = STACKTOP + 32 | 0; //@line 7591
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(32); //@line 7591
 $vararg_buffer = sp; //@line 7592
 $3 = sp + 20 | 0; //@line 7593
 HEAP32[$vararg_buffer >> 2] = HEAP32[$0 + 60 >> 2]; //@line 7597
 HEAP32[$vararg_buffer + 4 >> 2] = 0; //@line 7599
 HEAP32[$vararg_buffer + 8 >> 2] = $1; //@line 7601
 HEAP32[$vararg_buffer + 12 >> 2] = $3; //@line 7603
 HEAP32[$vararg_buffer + 16 >> 2] = $2; //@line 7605
 if ((___syscall_ret(___syscall140(140, $vararg_buffer | 0) | 0) | 0) < 0) {
  HEAP32[$3 >> 2] = -1; //@line 7610
  $10 = -1; //@line 7611
 } else {
  $10 = HEAP32[$3 >> 2] | 0; //@line 7614
 }
 STACKTOP = sp; //@line 7616
 return $10 | 0; //@line 7616
}
function _mbed_assert_internal($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $AsyncCtx = 0, $vararg_buffer = 0, sp = 0;
 sp = STACKTOP; //@line 2481
 STACKTOP = STACKTOP + 16 | 0; //@line 2482
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 2482
 $vararg_buffer = sp; //@line 2483
 HEAP32[$vararg_buffer >> 2] = $0; //@line 2484
 HEAP32[$vararg_buffer + 4 >> 2] = $1; //@line 2486
 HEAP32[$vararg_buffer + 8 >> 2] = $2; //@line 2488
 _mbed_error_printf(1531, $vararg_buffer); //@line 2489
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 2490
 _mbed_die(); //@line 2491
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 49; //@line 2494
  sp = STACKTOP; //@line 2495
  STACKTOP = sp; //@line 2496
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 2498
  STACKTOP = sp; //@line 2499
  return;
 }
}
function __ZN4mbed11InterruptInD0Ev__async_cb($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $8 = 0, $9 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 938
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 940
 $4 = HEAP32[$2 + 52 >> 2] | 0; //@line 942
 if (!$4) {
  __ZdlPv($2); //@line 945
  return;
 }
 $8 = HEAP32[$4 + 8 >> 2] | 0; //@line 950
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(8) | 0; //@line 951
 FUNCTION_TABLE_vi[$8 & 255]($2 + 40 | 0); //@line 952
 if (___async) {
  HEAP32[$ReallocAsyncCtx2 >> 2] = 17; //@line 955
  $9 = $ReallocAsyncCtx2 + 4 | 0; //@line 956
  HEAP32[$9 >> 2] = $2; //@line 957
  sp = STACKTOP; //@line 958
  return;
 }
 ___async_unwind = 0; //@line 961
 HEAP32[$ReallocAsyncCtx2 >> 2] = 17; //@line 962
 $9 = $ReallocAsyncCtx2 + 4 | 0; //@line 963
 HEAP32[$9 >> 2] = $2; //@line 964
 sp = STACKTOP; //@line 965
 return;
}
function _printf($0, $varargs) {
 $0 = $0 | 0;
 $varargs = $varargs | 0;
 var $1 = 0, $2 = 0, $3 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 12295
 STACKTOP = STACKTOP + 16 | 0; //@line 12296
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 12296
 $1 = sp; //@line 12297
 HEAP32[$1 >> 2] = $varargs; //@line 12298
 $2 = HEAP32[116] | 0; //@line 12299
 $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 12300
 $3 = _vfprintf($2, $0, $1) | 0; //@line 12301
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 124; //@line 12304
  HEAP32[$AsyncCtx + 4 >> 2] = $1; //@line 12306
  sp = STACKTOP; //@line 12307
  STACKTOP = sp; //@line 12308
  return 0; //@line 12308
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 12310
  STACKTOP = sp; //@line 12311
  return $3 | 0; //@line 12311
 }
 return 0; //@line 12313
}
function _snprintf($0, $1, $2, $varargs) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $varargs = $varargs | 0;
 var $3 = 0, $4 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 12174
 STACKTOP = STACKTOP + 16 | 0; //@line 12175
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 12175
 $3 = sp; //@line 12176
 HEAP32[$3 >> 2] = $varargs; //@line 12177
 $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 12178
 $4 = _vsnprintf($0, $1, $2, $3) | 0; //@line 12179
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 122; //@line 12182
  HEAP32[$AsyncCtx + 4 >> 2] = $3; //@line 12184
  sp = STACKTOP; //@line 12185
  STACKTOP = sp; //@line 12186
  return 0; //@line 12186
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 12188
  STACKTOP = sp; //@line 12189
  return $4 | 0; //@line 12189
 }
 return 0; //@line 12191
}
function _mbed_vtracef__async_cb_21($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $5 = 0, $ReallocAsyncCtx8 = 0, sp = 0;
 sp = STACKTOP; //@line 3366
 HEAP32[56] = HEAP32[54]; //@line 3368
 $2 = HEAP32[62] | 0; //@line 3369
 if (!$2) {
  return;
 }
 $4 = HEAP32[63] | 0; //@line 3374
 HEAP32[63] = 0; //@line 3375
 $ReallocAsyncCtx8 = _emscripten_realloc_async_context(8) | 0; //@line 3376
 FUNCTION_TABLE_v[$2 & 3](); //@line 3377
 if (___async) {
  HEAP32[$ReallocAsyncCtx8 >> 2] = 47; //@line 3380
  $5 = $ReallocAsyncCtx8 + 4 | 0; //@line 3381
  HEAP32[$5 >> 2] = $4; //@line 3382
  sp = STACKTOP; //@line 3383
  return;
 }
 ___async_unwind = 0; //@line 3386
 HEAP32[$ReallocAsyncCtx8 >> 2] = 47; //@line 3387
 $5 = $ReallocAsyncCtx8 + 4 | 0; //@line 3388
 HEAP32[$5 >> 2] = $4; //@line 3389
 sp = STACKTOP; //@line 3390
 return;
}
function _mbed_vtracef__async_cb_18($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $5 = 0, $ReallocAsyncCtx8 = 0, sp = 0;
 sp = STACKTOP; //@line 3102
 HEAP32[56] = HEAP32[54]; //@line 3104
 $2 = HEAP32[62] | 0; //@line 3105
 if (!$2) {
  return;
 }
 $4 = HEAP32[63] | 0; //@line 3110
 HEAP32[63] = 0; //@line 3111
 $ReallocAsyncCtx8 = _emscripten_realloc_async_context(8) | 0; //@line 3112
 FUNCTION_TABLE_v[$2 & 3](); //@line 3113
 if (___async) {
  HEAP32[$ReallocAsyncCtx8 >> 2] = 47; //@line 3116
  $5 = $ReallocAsyncCtx8 + 4 | 0; //@line 3117
  HEAP32[$5 >> 2] = $4; //@line 3118
  sp = STACKTOP; //@line 3119
  return;
 }
 ___async_unwind = 0; //@line 3122
 HEAP32[$ReallocAsyncCtx8 >> 2] = 47; //@line 3123
 $5 = $ReallocAsyncCtx8 + 4 | 0; //@line 3124
 HEAP32[$5 >> 2] = $4; //@line 3125
 sp = STACKTOP; //@line 3126
 return;
}
function _mbed_vtracef__async_cb_17($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $5 = 0, $ReallocAsyncCtx8 = 0, sp = 0;
 sp = STACKTOP; //@line 3072
 HEAP32[56] = HEAP32[54]; //@line 3074
 $2 = HEAP32[62] | 0; //@line 3075
 if (!$2) {
  return;
 }
 $4 = HEAP32[63] | 0; //@line 3080
 HEAP32[63] = 0; //@line 3081
 $ReallocAsyncCtx8 = _emscripten_realloc_async_context(8) | 0; //@line 3082
 FUNCTION_TABLE_v[$2 & 3](); //@line 3083
 if (___async) {
  HEAP32[$ReallocAsyncCtx8 >> 2] = 47; //@line 3086
  $5 = $ReallocAsyncCtx8 + 4 | 0; //@line 3087
  HEAP32[$5 >> 2] = $4; //@line 3088
  sp = STACKTOP; //@line 3089
  return;
 }
 ___async_unwind = 0; //@line 3092
 HEAP32[$ReallocAsyncCtx8 >> 2] = 47; //@line 3093
 $5 = $ReallocAsyncCtx8 + 4 | 0; //@line 3094
 HEAP32[$5 >> 2] = $4; //@line 3095
 sp = STACKTOP; //@line 3096
 return;
}
function __ZNK10__cxxabiv117__class_type_info24process_found_base_classEPNS_19__dynamic_cast_infoEPvi($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $10 = 0, $13 = 0, $4 = 0, $5 = 0;
 $4 = $1 + 16 | 0; //@line 12862
 $5 = HEAP32[$4 >> 2] | 0; //@line 12863
 do {
  if (!$5) {
   HEAP32[$4 >> 2] = $2; //@line 12867
   HEAP32[$1 + 24 >> 2] = $3; //@line 12869
   HEAP32[$1 + 36 >> 2] = 1; //@line 12871
  } else {
   if (($5 | 0) != ($2 | 0)) {
    $13 = $1 + 36 | 0; //@line 12875
    HEAP32[$13 >> 2] = (HEAP32[$13 >> 2] | 0) + 1; //@line 12878
    HEAP32[$1 + 24 >> 2] = 2; //@line 12880
    HEAP8[$1 + 54 >> 0] = 1; //@line 12882
    break;
   }
   $10 = $1 + 24 | 0; //@line 12885
   if ((HEAP32[$10 >> 2] | 0) == 2) {
    HEAP32[$10 >> 2] = $3; //@line 12889
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
 sp = STACKTOP; //@line 881
 $4 = _equeue_tick() | 0; //@line 883
 HEAP32[$2 + -4 >> 2] = $1; //@line 885
 $6 = $2 + -16 | 0; //@line 886
 HEAP32[$6 >> 2] = (HEAP32[$6 >> 2] | 0) + $4; //@line 889
 $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 890
 $9 = _equeue_enqueue($0, $2 + -36 | 0, $4) | 0; //@line 891
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 28; //@line 894
  HEAP32[$AsyncCtx + 4 >> 2] = $0; //@line 896
  sp = STACKTOP; //@line 897
  return 0; //@line 898
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 900
  _equeue_sema_signal($0 + 48 | 0); //@line 902
  return $9 | 0; //@line 903
 }
 return 0; //@line 905
}
function _strcmp($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$011 = 0, $$0710 = 0, $$lcssa = 0, $$lcssa8 = 0, $2 = 0, $3 = 0, $8 = 0, $9 = 0;
 $2 = HEAP8[$0 >> 0] | 0; //@line 7697
 $3 = HEAP8[$1 >> 0] | 0; //@line 7698
 if ($2 << 24 >> 24 == 0 ? 1 : $2 << 24 >> 24 != $3 << 24 >> 24) {
  $$lcssa = $3; //@line 7703
  $$lcssa8 = $2; //@line 7703
 } else {
  $$011 = $1; //@line 7705
  $$0710 = $0; //@line 7705
  do {
   $$0710 = $$0710 + 1 | 0; //@line 7707
   $$011 = $$011 + 1 | 0; //@line 7708
   $8 = HEAP8[$$0710 >> 0] | 0; //@line 7709
   $9 = HEAP8[$$011 >> 0] | 0; //@line 7710
  } while (!($8 << 24 >> 24 == 0 ? 1 : $8 << 24 >> 24 != $9 << 24 >> 24));
  $$lcssa = $9; //@line 7715
  $$lcssa8 = $8; //@line 7715
 }
 return ($$lcssa8 & 255) - ($$lcssa & 255) | 0; //@line 7725
}
function _memcmp($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$01318 = 0, $$01417 = 0, $$019 = 0, $14 = 0, $4 = 0, $5 = 0;
 L1 : do {
  if (!$2) {
   $14 = 0; //@line 12139
  } else {
   $$01318 = $0; //@line 12141
   $$01417 = $2; //@line 12141
   $$019 = $1; //@line 12141
   while (1) {
    $4 = HEAP8[$$01318 >> 0] | 0; //@line 12143
    $5 = HEAP8[$$019 >> 0] | 0; //@line 12144
    if ($4 << 24 >> 24 != $5 << 24 >> 24) {
     break;
    }
    $$01417 = $$01417 + -1 | 0; //@line 12149
    if (!$$01417) {
     $14 = 0; //@line 12154
     break L1;
    } else {
     $$01318 = $$01318 + 1 | 0; //@line 12157
     $$019 = $$019 + 1 | 0; //@line 12157
    }
   }
   $14 = ($4 & 255) - ($5 & 255) | 0; //@line 12163
  }
 } while (0);
 return $14 | 0; //@line 12166
}
function _serial_putc($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $2 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 3046
 $2 = HEAP32[116] | 0; //@line 3047
 $AsyncCtx3 = _emscripten_alloc_async_context(8, sp) | 0; //@line 3048
 _putc($1, $2) | 0; //@line 3049
 if (___async) {
  HEAP32[$AsyncCtx3 >> 2] = 71; //@line 3052
  HEAP32[$AsyncCtx3 + 4 >> 2] = $2; //@line 3054
  sp = STACKTOP; //@line 3055
  return;
 }
 _emscripten_free_async_context($AsyncCtx3 | 0); //@line 3058
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 3059
 _fflush($2) | 0; //@line 3060
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 72; //@line 3063
  sp = STACKTOP; //@line 3064
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 3067
  return;
 }
}
function _mbed_tracef($0, $1, $2, $varargs) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $varargs = $varargs | 0;
 var $3 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 1783
 STACKTOP = STACKTOP + 16 | 0; //@line 1784
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 1784
 $3 = sp; //@line 1785
 HEAP32[$3 >> 2] = $varargs; //@line 1786
 $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 1787
 _mbed_vtracef($0, $1, $2, $3); //@line 1788
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 36; //@line 1791
  HEAP32[$AsyncCtx + 4 >> 2] = $3; //@line 1793
  sp = STACKTOP; //@line 1794
  STACKTOP = sp; //@line 1795
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 1797
  STACKTOP = sp; //@line 1798
  return;
 }
}
function ___stdout_write($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $14 = 0, $vararg_buffer = 0, sp = 0;
 sp = STACKTOP; //@line 7649
 STACKTOP = STACKTOP + 32 | 0; //@line 7650
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(32); //@line 7650
 $vararg_buffer = sp; //@line 7651
 HEAP32[$0 + 36 >> 2] = 2; //@line 7654
 if (!(HEAP32[$0 >> 2] & 64)) {
  HEAP32[$vararg_buffer >> 2] = HEAP32[$0 + 60 >> 2]; //@line 7662
  HEAP32[$vararg_buffer + 4 >> 2] = 21523; //@line 7664
  HEAP32[$vararg_buffer + 8 >> 2] = sp + 16; //@line 7666
  if (___syscall54(54, $vararg_buffer | 0) | 0) {
   HEAP8[$0 + 75 >> 0] = -1; //@line 7671
  }
 }
 $14 = ___stdio_write($0, $1, $2) | 0; //@line 7674
 STACKTOP = sp; //@line 7675
 return $14 | 0; //@line 7675
}
function _mbed_die__async_cb_57($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx15 = 0, sp = 0;
 sp = STACKTOP; //@line 5455
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 5457
 _emscripten_asm_const_iii(2, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 5459
 $ReallocAsyncCtx15 = _emscripten_realloc_async_context(8) | 0; //@line 5460
 _wait_ms(150); //@line 5461
 if (___async) {
  HEAP32[$ReallocAsyncCtx15 >> 2] = 51; //@line 5464
  $4 = $ReallocAsyncCtx15 + 4 | 0; //@line 5465
  HEAP32[$4 >> 2] = $2; //@line 5466
  sp = STACKTOP; //@line 5467
  return;
 }
 ___async_unwind = 0; //@line 5470
 HEAP32[$ReallocAsyncCtx15 >> 2] = 51; //@line 5471
 $4 = $ReallocAsyncCtx15 + 4 | 0; //@line 5472
 HEAP32[$4 >> 2] = $2; //@line 5473
 sp = STACKTOP; //@line 5474
 return;
}
function _mbed_die__async_cb_56($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx14 = 0, sp = 0;
 sp = STACKTOP; //@line 5430
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 5432
 _emscripten_asm_const_iii(2, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 5434
 $ReallocAsyncCtx14 = _emscripten_realloc_async_context(8) | 0; //@line 5435
 _wait_ms(150); //@line 5436
 if (___async) {
  HEAP32[$ReallocAsyncCtx14 >> 2] = 52; //@line 5439
  $4 = $ReallocAsyncCtx14 + 4 | 0; //@line 5440
  HEAP32[$4 >> 2] = $2; //@line 5441
  sp = STACKTOP; //@line 5442
  return;
 }
 ___async_unwind = 0; //@line 5445
 HEAP32[$ReallocAsyncCtx14 >> 2] = 52; //@line 5446
 $4 = $ReallocAsyncCtx14 + 4 | 0; //@line 5447
 HEAP32[$4 >> 2] = $2; //@line 5448
 sp = STACKTOP; //@line 5449
 return;
}
function _mbed_die__async_cb_55($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx13 = 0, sp = 0;
 sp = STACKTOP; //@line 5405
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 5407
 _emscripten_asm_const_iii(2, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 5409
 $ReallocAsyncCtx13 = _emscripten_realloc_async_context(8) | 0; //@line 5410
 _wait_ms(150); //@line 5411
 if (___async) {
  HEAP32[$ReallocAsyncCtx13 >> 2] = 53; //@line 5414
  $4 = $ReallocAsyncCtx13 + 4 | 0; //@line 5415
  HEAP32[$4 >> 2] = $2; //@line 5416
  sp = STACKTOP; //@line 5417
  return;
 }
 ___async_unwind = 0; //@line 5420
 HEAP32[$ReallocAsyncCtx13 >> 2] = 53; //@line 5421
 $4 = $ReallocAsyncCtx13 + 4 | 0; //@line 5422
 HEAP32[$4 >> 2] = $2; //@line 5423
 sp = STACKTOP; //@line 5424
 return;
}
function _mbed_die__async_cb_54($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx12 = 0, sp = 0;
 sp = STACKTOP; //@line 5380
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 5382
 _emscripten_asm_const_iii(2, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 5384
 $ReallocAsyncCtx12 = _emscripten_realloc_async_context(8) | 0; //@line 5385
 _wait_ms(150); //@line 5386
 if (___async) {
  HEAP32[$ReallocAsyncCtx12 >> 2] = 54; //@line 5389
  $4 = $ReallocAsyncCtx12 + 4 | 0; //@line 5390
  HEAP32[$4 >> 2] = $2; //@line 5391
  sp = STACKTOP; //@line 5392
  return;
 }
 ___async_unwind = 0; //@line 5395
 HEAP32[$ReallocAsyncCtx12 >> 2] = 54; //@line 5396
 $4 = $ReallocAsyncCtx12 + 4 | 0; //@line 5397
 HEAP32[$4 >> 2] = $2; //@line 5398
 sp = STACKTOP; //@line 5399
 return;
}
function _mbed_die__async_cb_53($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx11 = 0, sp = 0;
 sp = STACKTOP; //@line 5355
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 5357
 _emscripten_asm_const_iii(2, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 5359
 $ReallocAsyncCtx11 = _emscripten_realloc_async_context(8) | 0; //@line 5360
 _wait_ms(150); //@line 5361
 if (___async) {
  HEAP32[$ReallocAsyncCtx11 >> 2] = 55; //@line 5364
  $4 = $ReallocAsyncCtx11 + 4 | 0; //@line 5365
  HEAP32[$4 >> 2] = $2; //@line 5366
  sp = STACKTOP; //@line 5367
  return;
 }
 ___async_unwind = 0; //@line 5370
 HEAP32[$ReallocAsyncCtx11 >> 2] = 55; //@line 5371
 $4 = $ReallocAsyncCtx11 + 4 | 0; //@line 5372
 HEAP32[$4 >> 2] = $2; //@line 5373
 sp = STACKTOP; //@line 5374
 return;
}
function _mbed_die__async_cb_52($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx10 = 0, sp = 0;
 sp = STACKTOP; //@line 5330
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 5332
 _emscripten_asm_const_iii(2, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 5334
 $ReallocAsyncCtx10 = _emscripten_realloc_async_context(8) | 0; //@line 5335
 _wait_ms(150); //@line 5336
 if (___async) {
  HEAP32[$ReallocAsyncCtx10 >> 2] = 56; //@line 5339
  $4 = $ReallocAsyncCtx10 + 4 | 0; //@line 5340
  HEAP32[$4 >> 2] = $2; //@line 5341
  sp = STACKTOP; //@line 5342
  return;
 }
 ___async_unwind = 0; //@line 5345
 HEAP32[$ReallocAsyncCtx10 >> 2] = 56; //@line 5346
 $4 = $ReallocAsyncCtx10 + 4 | 0; //@line 5347
 HEAP32[$4 >> 2] = $2; //@line 5348
 sp = STACKTOP; //@line 5349
 return;
}
function _mbed_die__async_cb($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx16 = 0, sp = 0;
 sp = STACKTOP; //@line 5080
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 5082
 _emscripten_asm_const_iii(2, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 5084
 $ReallocAsyncCtx16 = _emscripten_realloc_async_context(8) | 0; //@line 5085
 _wait_ms(150); //@line 5086
 if (___async) {
  HEAP32[$ReallocAsyncCtx16 >> 2] = 50; //@line 5089
  $4 = $ReallocAsyncCtx16 + 4 | 0; //@line 5090
  HEAP32[$4 >> 2] = $2; //@line 5091
  sp = STACKTOP; //@line 5092
  return;
 }
 ___async_unwind = 0; //@line 5095
 HEAP32[$ReallocAsyncCtx16 >> 2] = 50; //@line 5096
 $4 = $ReallocAsyncCtx16 + 4 | 0; //@line 5097
 HEAP32[$4 >> 2] = $2; //@line 5098
 sp = STACKTOP; //@line 5099
 return;
}
function _mbed_die__async_cb_51($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx9 = 0, sp = 0;
 sp = STACKTOP; //@line 5305
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 5307
 _emscripten_asm_const_iii(2, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 5309
 $ReallocAsyncCtx9 = _emscripten_realloc_async_context(8) | 0; //@line 5310
 _wait_ms(150); //@line 5311
 if (___async) {
  HEAP32[$ReallocAsyncCtx9 >> 2] = 57; //@line 5314
  $4 = $ReallocAsyncCtx9 + 4 | 0; //@line 5315
  HEAP32[$4 >> 2] = $2; //@line 5316
  sp = STACKTOP; //@line 5317
  return;
 }
 ___async_unwind = 0; //@line 5320
 HEAP32[$ReallocAsyncCtx9 >> 2] = 57; //@line 5321
 $4 = $ReallocAsyncCtx9 + 4 | 0; //@line 5322
 HEAP32[$4 >> 2] = $2; //@line 5323
 sp = STACKTOP; //@line 5324
 return;
}
function _mbed_die__async_cb_50($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx8 = 0, sp = 0;
 sp = STACKTOP; //@line 5280
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 5282
 _emscripten_asm_const_iii(2, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 5284
 $ReallocAsyncCtx8 = _emscripten_realloc_async_context(8) | 0; //@line 5285
 _wait_ms(400); //@line 5286
 if (___async) {
  HEAP32[$ReallocAsyncCtx8 >> 2] = 58; //@line 5289
  $4 = $ReallocAsyncCtx8 + 4 | 0; //@line 5290
  HEAP32[$4 >> 2] = $2; //@line 5291
  sp = STACKTOP; //@line 5292
  return;
 }
 ___async_unwind = 0; //@line 5295
 HEAP32[$ReallocAsyncCtx8 >> 2] = 58; //@line 5296
 $4 = $ReallocAsyncCtx8 + 4 | 0; //@line 5297
 HEAP32[$4 >> 2] = $2; //@line 5298
 sp = STACKTOP; //@line 5299
 return;
}
function _mbed_die__async_cb_49($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx7 = 0, sp = 0;
 sp = STACKTOP; //@line 5255
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 5257
 _emscripten_asm_const_iii(2, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 5259
 $ReallocAsyncCtx7 = _emscripten_realloc_async_context(8) | 0; //@line 5260
 _wait_ms(400); //@line 5261
 if (___async) {
  HEAP32[$ReallocAsyncCtx7 >> 2] = 59; //@line 5264
  $4 = $ReallocAsyncCtx7 + 4 | 0; //@line 5265
  HEAP32[$4 >> 2] = $2; //@line 5266
  sp = STACKTOP; //@line 5267
  return;
 }
 ___async_unwind = 0; //@line 5270
 HEAP32[$ReallocAsyncCtx7 >> 2] = 59; //@line 5271
 $4 = $ReallocAsyncCtx7 + 4 | 0; //@line 5272
 HEAP32[$4 >> 2] = $2; //@line 5273
 sp = STACKTOP; //@line 5274
 return;
}
function _mbed_die__async_cb_48($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx6 = 0, sp = 0;
 sp = STACKTOP; //@line 5230
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 5232
 _emscripten_asm_const_iii(2, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 5234
 $ReallocAsyncCtx6 = _emscripten_realloc_async_context(8) | 0; //@line 5235
 _wait_ms(400); //@line 5236
 if (___async) {
  HEAP32[$ReallocAsyncCtx6 >> 2] = 60; //@line 5239
  $4 = $ReallocAsyncCtx6 + 4 | 0; //@line 5240
  HEAP32[$4 >> 2] = $2; //@line 5241
  sp = STACKTOP; //@line 5242
  return;
 }
 ___async_unwind = 0; //@line 5245
 HEAP32[$ReallocAsyncCtx6 >> 2] = 60; //@line 5246
 $4 = $ReallocAsyncCtx6 + 4 | 0; //@line 5247
 HEAP32[$4 >> 2] = $2; //@line 5248
 sp = STACKTOP; //@line 5249
 return;
}
function _mbed_die__async_cb_47($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx5 = 0, sp = 0;
 sp = STACKTOP; //@line 5205
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 5207
 _emscripten_asm_const_iii(2, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 5209
 $ReallocAsyncCtx5 = _emscripten_realloc_async_context(8) | 0; //@line 5210
 _wait_ms(400); //@line 5211
 if (___async) {
  HEAP32[$ReallocAsyncCtx5 >> 2] = 61; //@line 5214
  $4 = $ReallocAsyncCtx5 + 4 | 0; //@line 5215
  HEAP32[$4 >> 2] = $2; //@line 5216
  sp = STACKTOP; //@line 5217
  return;
 }
 ___async_unwind = 0; //@line 5220
 HEAP32[$ReallocAsyncCtx5 >> 2] = 61; //@line 5221
 $4 = $ReallocAsyncCtx5 + 4 | 0; //@line 5222
 HEAP32[$4 >> 2] = $2; //@line 5223
 sp = STACKTOP; //@line 5224
 return;
}
function _mbed_die__async_cb_46($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx4 = 0, sp = 0;
 sp = STACKTOP; //@line 5180
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 5182
 _emscripten_asm_const_iii(2, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 5184
 $ReallocAsyncCtx4 = _emscripten_realloc_async_context(8) | 0; //@line 5185
 _wait_ms(400); //@line 5186
 if (___async) {
  HEAP32[$ReallocAsyncCtx4 >> 2] = 62; //@line 5189
  $4 = $ReallocAsyncCtx4 + 4 | 0; //@line 5190
  HEAP32[$4 >> 2] = $2; //@line 5191
  sp = STACKTOP; //@line 5192
  return;
 }
 ___async_unwind = 0; //@line 5195
 HEAP32[$ReallocAsyncCtx4 >> 2] = 62; //@line 5196
 $4 = $ReallocAsyncCtx4 + 4 | 0; //@line 5197
 HEAP32[$4 >> 2] = $2; //@line 5198
 sp = STACKTOP; //@line 5199
 return;
}
function _mbed_die__async_cb_45($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 5155
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 5157
 _emscripten_asm_const_iii(2, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 5159
 $ReallocAsyncCtx3 = _emscripten_realloc_async_context(8) | 0; //@line 5160
 _wait_ms(400); //@line 5161
 if (___async) {
  HEAP32[$ReallocAsyncCtx3 >> 2] = 63; //@line 5164
  $4 = $ReallocAsyncCtx3 + 4 | 0; //@line 5165
  HEAP32[$4 >> 2] = $2; //@line 5166
  sp = STACKTOP; //@line 5167
  return;
 }
 ___async_unwind = 0; //@line 5170
 HEAP32[$ReallocAsyncCtx3 >> 2] = 63; //@line 5171
 $4 = $ReallocAsyncCtx3 + 4 | 0; //@line 5172
 HEAP32[$4 >> 2] = $2; //@line 5173
 sp = STACKTOP; //@line 5174
 return;
}
function _mbed_die__async_cb_44($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 5130
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 5132
 _emscripten_asm_const_iii(2, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 5134
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(8) | 0; //@line 5135
 _wait_ms(400); //@line 5136
 if (___async) {
  HEAP32[$ReallocAsyncCtx2 >> 2] = 64; //@line 5139
  $4 = $ReallocAsyncCtx2 + 4 | 0; //@line 5140
  HEAP32[$4 >> 2] = $2; //@line 5141
  sp = STACKTOP; //@line 5142
  return;
 }
 ___async_unwind = 0; //@line 5145
 HEAP32[$ReallocAsyncCtx2 >> 2] = 64; //@line 5146
 $4 = $ReallocAsyncCtx2 + 4 | 0; //@line 5147
 HEAP32[$4 >> 2] = $2; //@line 5148
 sp = STACKTOP; //@line 5149
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
  _abort_message(5666, $vararg_buffer); //@line 54
 }
}
function _mbed_die__async_cb_43($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 5105
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 5107
 _emscripten_asm_const_iii(2, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 5109
 $ReallocAsyncCtx = _emscripten_realloc_async_context(8) | 0; //@line 5110
 _wait_ms(400); //@line 5111
 if (___async) {
  HEAP32[$ReallocAsyncCtx >> 2] = 65; //@line 5114
  $4 = $ReallocAsyncCtx + 4 | 0; //@line 5115
  HEAP32[$4 >> 2] = $2; //@line 5116
  sp = STACKTOP; //@line 5117
  return;
 }
 ___async_unwind = 0; //@line 5120
 HEAP32[$ReallocAsyncCtx >> 2] = 65; //@line 5121
 $4 = $ReallocAsyncCtx + 4 | 0; //@line 5122
 HEAP32[$4 >> 2] = $2; //@line 5123
 sp = STACKTOP; //@line 5124
 return;
}
function __ZN4mbed8CallbackIFvvEE13function_callIN6events5EventIS1_EEEEvPKv__async_cb($0) {
 $0 = $0 | 0;
 var $AsyncRetVal = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 9201
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 9205
 HEAP32[(HEAP32[HEAP32[$0 + 4 >> 2] >> 2] | 0) + 8 >> 2] = $AsyncRetVal; //@line 9208
 if ($AsyncRetVal | 0) {
  return;
 }
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(4) | 0; //@line 9213
 _mbed_assert_internal(2731, 2734, 149); //@line 9214
 if (___async) {
  HEAP32[$ReallocAsyncCtx2 >> 2] = 108; //@line 9217
  sp = STACKTOP; //@line 9218
  return;
 }
 ___async_unwind = 0; //@line 9221
 HEAP32[$ReallocAsyncCtx2 >> 2] = 108; //@line 9222
 sp = STACKTOP; //@line 9223
 return;
}
function _mbed_error_printf($0, $varargs) {
 $0 = $0 | 0;
 $varargs = $varargs | 0;
 var $1 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 2809
 STACKTOP = STACKTOP + 16 | 0; //@line 2810
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 2810
 $1 = sp; //@line 2811
 HEAP32[$1 >> 2] = $varargs; //@line 2812
 $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 2813
 _mbed_error_vfprintf($0, $1); //@line 2814
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 66; //@line 2817
  HEAP32[$AsyncCtx + 4 >> 2] = $1; //@line 2819
  sp = STACKTOP; //@line 2820
  STACKTOP = sp; //@line 2821
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 2823
  STACKTOP = sp; //@line 2824
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
  $$05$lcssa = $2; //@line 10156
 } else {
  $$056 = $2; //@line 10158
  $15 = $1; //@line 10158
  $8 = $0; //@line 10158
  while (1) {
   $14 = $$056 + -1 | 0; //@line 10166
   HEAP8[$14 >> 0] = HEAPU8[3329 + ($8 & 15) >> 0] | 0 | $3; //@line 10167
   $8 = _bitshift64Lshr($8 | 0, $15 | 0, 4) | 0; //@line 10168
   $15 = tempRet0; //@line 10169
   if (($8 | 0) == 0 & ($15 | 0) == 0) {
    $$05$lcssa = $14; //@line 10174
    break;
   } else {
    $$056 = $14; //@line 10177
   }
  }
 }
 return $$05$lcssa | 0; //@line 10181
}
function _fwrite($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $$ = 0, $11 = 0, $13 = 0, $15 = 0, $4 = 0, $phitmp = 0;
 $4 = Math_imul($2, $1) | 0; //@line 7820
 $$ = ($1 | 0) == 0 ? 0 : $2; //@line 7822
 if ((HEAP32[$3 + 76 >> 2] | 0) > -1) {
  $phitmp = (___lockfile($3) | 0) == 0; //@line 7828
  $11 = ___fwritex($0, $4, $3) | 0; //@line 7829
  if ($phitmp) {
   $13 = $11; //@line 7831
  } else {
   ___unlockfile($3); //@line 7833
   $13 = $11; //@line 7834
  }
 } else {
  $13 = ___fwritex($0, $4, $3) | 0; //@line 7838
 }
 if (($13 | 0) == ($4 | 0)) {
  $15 = $$; //@line 7842
 } else {
  $15 = ($13 >>> 0) / ($1 >>> 0) | 0; //@line 7845
 }
 return $15 | 0; //@line 7847
}
function _main__async_cb_37($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $6 = 0, $ReallocAsyncCtx5 = 0, sp = 0;
 sp = STACKTOP; //@line 4835
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 4837
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 4839
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 4841
 $ReallocAsyncCtx5 = _emscripten_realloc_async_context(16) | 0; //@line 4842
 _puts(2507) | 0; //@line 4843
 if (!___async) {
  ___async_unwind = 0; //@line 4846
 }
 HEAP32[$ReallocAsyncCtx5 >> 2] = 92; //@line 4848
 HEAP32[$ReallocAsyncCtx5 + 4 >> 2] = $2; //@line 4850
 HEAP32[$ReallocAsyncCtx5 + 8 >> 2] = $4; //@line 4852
 HEAP32[$ReallocAsyncCtx5 + 12 >> 2] = $6; //@line 4854
 sp = STACKTOP; //@line 4855
 return;
}
function _main__async_cb_36($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $6 = 0, $ReallocAsyncCtx4 = 0, sp = 0;
 sp = STACKTOP; //@line 4809
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 4811
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 4813
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 4815
 $ReallocAsyncCtx4 = _emscripten_realloc_async_context(16) | 0; //@line 4816
 _puts(2576) | 0; //@line 4817
 if (!___async) {
  ___async_unwind = 0; //@line 4820
 }
 HEAP32[$ReallocAsyncCtx4 >> 2] = 93; //@line 4822
 HEAP32[$ReallocAsyncCtx4 + 4 >> 2] = $2; //@line 4824
 HEAP32[$ReallocAsyncCtx4 + 8 >> 2] = $4; //@line 4826
 HEAP32[$ReallocAsyncCtx4 + 12 >> 2] = $6; //@line 4828
 sp = STACKTOP; //@line 4829
 return;
}
function ___towrite($0) {
 $0 = $0 | 0;
 var $$0 = 0, $1 = 0, $14 = 0, $3 = 0, $7 = 0;
 $1 = $0 + 74 | 0; //@line 8037
 $3 = HEAP8[$1 >> 0] | 0; //@line 8039
 HEAP8[$1 >> 0] = $3 + 255 | $3; //@line 8043
 $7 = HEAP32[$0 >> 2] | 0; //@line 8044
 if (!($7 & 8)) {
  HEAP32[$0 + 8 >> 2] = 0; //@line 8049
  HEAP32[$0 + 4 >> 2] = 0; //@line 8051
  $14 = HEAP32[$0 + 44 >> 2] | 0; //@line 8053
  HEAP32[$0 + 28 >> 2] = $14; //@line 8055
  HEAP32[$0 + 20 >> 2] = $14; //@line 8057
  HEAP32[$0 + 16 >> 2] = $14 + (HEAP32[$0 + 48 >> 2] | 0); //@line 8063
  $$0 = 0; //@line 8064
 } else {
  HEAP32[$0 >> 2] = $7 | 32; //@line 8067
  $$0 = -1; //@line 8068
 }
 return $$0 | 0; //@line 8070
}
function __ZN4mbed11InterruptInD2Ev__async_cb($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $8 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 2010
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 2012
 $4 = HEAP32[$2 + 52 >> 2] | 0; //@line 2014
 if (!$4) {
  return;
 }
 $8 = HEAP32[$4 + 8 >> 2] | 0; //@line 2021
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(4) | 0; //@line 2022
 FUNCTION_TABLE_vi[$8 & 255]($2 + 40 | 0); //@line 2023
 if (___async) {
  HEAP32[$ReallocAsyncCtx2 >> 2] = 15; //@line 2026
  sp = STACKTOP; //@line 2027
  return;
 }
 ___async_unwind = 0; //@line 2030
 HEAP32[$ReallocAsyncCtx2 >> 2] = 15; //@line 2031
 sp = STACKTOP; //@line 2032
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
 $8 = (HEAPU8[$1 >> 0] | 0) << 8 | (HEAPU8[$1 + 1 >> 0] | 0); //@line 11624
 $$sink$in = HEAPU8[$0 >> 0] | 0; //@line 11627
 $$sink17$sink = $0; //@line 11627
 while (1) {
  $11 = $$sink17$sink + 1 | 0; //@line 11629
  $12 = HEAP8[$11 >> 0] | 0; //@line 11630
  if (!($12 << 24 >> 24)) {
   break;
  }
  $$sink$in = $$sink$in << 8 & 65280 | $12 & 255; //@line 11638
  if (($$sink$in | 0) == ($8 | 0)) {
   break;
  } else {
   $$sink17$sink = $11; //@line 11643
  }
 }
 return ($12 << 24 >> 24 ? $$sink17$sink : 0) | 0; //@line 11648
}
function _fmt_o($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$0$lcssa = 0, $$06 = 0, $10 = 0, $11 = 0, $7 = 0;
 if (($0 | 0) == 0 & ($1 | 0) == 0) {
  $$0$lcssa = $2; //@line 10193
 } else {
  $$06 = $2; //@line 10195
  $11 = $1; //@line 10195
  $7 = $0; //@line 10195
  while (1) {
   $10 = $$06 + -1 | 0; //@line 10200
   HEAP8[$10 >> 0] = $7 & 7 | 48; //@line 10201
   $7 = _bitshift64Lshr($7 | 0, $11 | 0, 3) | 0; //@line 10202
   $11 = tempRet0; //@line 10203
   if (($7 | 0) == 0 & ($11 | 0) == 0) {
    $$0$lcssa = $10; //@line 10208
    break;
   } else {
    $$06 = $10; //@line 10211
   }
  }
 }
 return $$0$lcssa | 0; //@line 10215
}
function __ZN4mbed8CallbackIFvvEE13function_dtorIN6events5EventIS1_EEEEvPv__async_cb($0) {
 $0 = $0 | 0;
 var $3 = 0, $5 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 8681
 $3 = HEAP32[HEAP32[$0 + 4 >> 2] >> 2] | 0; //@line 8684
 $5 = HEAP32[$3 + 4 >> 2] | 0; //@line 8686
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(4) | 0; //@line 8687
 _equeue_dealloc($5, $3); //@line 8688
 if (___async) {
  HEAP32[$ReallocAsyncCtx2 >> 2] = 110; //@line 8691
  sp = STACKTOP; //@line 8692
  return;
 }
 ___async_unwind = 0; //@line 8695
 HEAP32[$ReallocAsyncCtx2 >> 2] = 110; //@line 8696
 sp = STACKTOP; //@line 8697
 return;
}
function _invoke_ticker__async_cb_62($0) {
 $0 = $0 | 0;
 var $5 = 0, $6 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 5836
 $5 = HEAP32[HEAP32[HEAP32[$0 + 4 >> 2] >> 2] >> 2] | 0; //@line 5842
 $6 = HEAP32[$0 + 8 >> 2] | 0; //@line 5843
 $ReallocAsyncCtx = _emscripten_realloc_async_context(4) | 0; //@line 5844
 FUNCTION_TABLE_vi[$5 & 255]($6); //@line 5845
 if (___async) {
  HEAP32[$ReallocAsyncCtx >> 2] = 74; //@line 5848
  sp = STACKTOP; //@line 5849
  return;
 }
 ___async_unwind = 0; //@line 5852
 HEAP32[$ReallocAsyncCtx >> 2] = 74; //@line 5853
 sp = STACKTOP; //@line 5854
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
  $$0$lcssa = 0; //@line 9837
 } else {
  $$04 = 0; //@line 9839
  while (1) {
   $7 = HEAP32[$0 >> 2] | 0; //@line 9842
   $11 = ($$04 * 10 | 0) + -48 + (HEAP8[$7 >> 0] | 0) | 0; //@line 9846
   $12 = $7 + 1 | 0; //@line 9847
   HEAP32[$0 >> 2] = $12; //@line 9848
   if (!(_isdigit(HEAP8[$12 >> 0] | 0) | 0)) {
    $$0$lcssa = $11; //@line 9854
    break;
   } else {
    $$04 = $11; //@line 9857
   }
  }
 }
 return $$0$lcssa | 0; //@line 9861
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
function _main__async_cb_33($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx9 = 0, sp = 0;
 sp = STACKTOP; //@line 4726
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 4728
 $4 = HEAP32[$2 + 4 >> 2] | 0; //@line 4730
 $ReallocAsyncCtx9 = _emscripten_realloc_async_context(4) | 0; //@line 4731
 _equeue_dealloc($4, $2); //@line 4732
 if (___async) {
  HEAP32[$ReallocAsyncCtx9 >> 2] = 101; //@line 4735
  sp = STACKTOP; //@line 4736
  return;
 }
 ___async_unwind = 0; //@line 4739
 HEAP32[$ReallocAsyncCtx9 >> 2] = 101; //@line 4740
 sp = STACKTOP; //@line 4741
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
 sp = STACKTOP; //@line 3865
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 3866
 __ZN20SimulatorBlockDeviceC2EPKcyy(5816, 2410, 65536, 0, 512, 0); //@line 3867
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 89; //@line 3870
  sp = STACKTOP; //@line 3871
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 3874
  __ZN6events10EventQueueC2EjPh(5876, 1664, 0); //@line 3875
  __ZN4mbed11InterruptInC2E7PinName(6080, 1337); //@line 3876
  return;
 }
}
function ___fflush_unlocked__async_cb_77($0) {
 $0 = $0 | 0;
 var $10 = 0, $4 = 0, $6 = 0, $8 = 0;
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 9016
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 9018
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 9020
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 9022
 HEAP32[(HEAP32[$0 + 4 >> 2] | 0) + 16 >> 2] = 0; //@line 9024
 HEAP32[$4 >> 2] = 0; //@line 9025
 HEAP32[$6 >> 2] = 0; //@line 9026
 HEAP32[$8 >> 2] = 0; //@line 9027
 HEAP32[$10 >> 2] = 0; //@line 9028
 HEAP32[___async_retval >> 2] = 0; //@line 9030
 return;
}
function _mbed_vtracef__async_cb_16($0) {
 $0 = $0 | 0;
 var $1 = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 3054
 $1 = HEAP32[60] | 0; //@line 3055
 $ReallocAsyncCtx3 = _emscripten_realloc_async_context(4) | 0; //@line 3056
 FUNCTION_TABLE_vi[$1 & 255](1416); //@line 3057
 if (___async) {
  HEAP32[$ReallocAsyncCtx3 >> 2] = 40; //@line 3060
  sp = STACKTOP; //@line 3061
  return;
 }
 ___async_unwind = 0; //@line 3064
 HEAP32[$ReallocAsyncCtx3 >> 2] = 40; //@line 3065
 sp = STACKTOP; //@line 3066
 return;
}
function __ZN4mbed11InterruptInC2E7PinName($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $2 = 0, $3 = 0, $4 = 0, dest = 0, stop = 0;
 HEAP32[$0 >> 2] = 184; //@line 251
 $2 = $0 + 4 | 0; //@line 252
 $3 = $0 + 28 | 0; //@line 253
 $4 = $0; //@line 254
 dest = $2; //@line 255
 stop = dest + 68 | 0; //@line 255
 do {
  HEAP32[dest >> 2] = 0; //@line 255
  dest = dest + 4 | 0; //@line 255
 } while ((dest | 0) < (stop | 0));
 _gpio_irq_init($3, $1, 2, $4) | 0; //@line 256
 _gpio_init_in($2, $1); //@line 257
 return;
}
function _serial_putc__async_cb_59($0) {
 $0 = $0 | 0;
 var $2 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 5551
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 5553
 $ReallocAsyncCtx = _emscripten_realloc_async_context(4) | 0; //@line 5554
 _fflush($2) | 0; //@line 5555
 if (___async) {
  HEAP32[$ReallocAsyncCtx >> 2] = 72; //@line 5558
  sp = STACKTOP; //@line 5559
  return;
 }
 ___async_unwind = 0; //@line 5562
 HEAP32[$ReallocAsyncCtx >> 2] = 72; //@line 5563
 sp = STACKTOP; //@line 5564
 return;
}
function __ZN6events10EventQueue13function_callINS0_9context00IPFvvEEEEEvPv($0) {
 $0 = $0 | 0;
 var $1 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 4297
 $1 = HEAP32[$0 >> 2] | 0; //@line 4298
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 4299
 FUNCTION_TABLE_v[$1 & 3](); //@line 4300
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 111; //@line 4303
  sp = STACKTOP; //@line 4304
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 4307
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
 sp = STACKTOP; //@line 7460
 STACKTOP = STACKTOP + 16 | 0; //@line 7461
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 7461
 $vararg_buffer = sp; //@line 7462
 HEAP32[$vararg_buffer >> 2] = _dummy(HEAP32[$0 + 60 >> 2] | 0) | 0; //@line 7466
 $5 = ___syscall_ret(___syscall6(6, $vararg_buffer | 0) | 0) | 0; //@line 7468
 STACKTOP = sp; //@line 7469
 return $5 | 0; //@line 7469
}
function _main__async_cb_40($0) {
 $0 = $0 | 0;
 var $ReallocAsyncCtx8 = 0, sp = 0;
 sp = STACKTOP; //@line 4902
 $ReallocAsyncCtx8 = _emscripten_realloc_async_context(4) | 0; //@line 4903
 __ZN6events10EventQueue8dispatchEi(5876, -1); //@line 4904
 if (___async) {
  HEAP32[$ReallocAsyncCtx8 >> 2] = 102; //@line 4907
  sp = STACKTOP; //@line 4908
  return;
 }
 ___async_unwind = 0; //@line 4911
 HEAP32[$ReallocAsyncCtx8 >> 2] = 102; //@line 4912
 sp = STACKTOP; //@line 4913
 return;
}
function _handle_interrupt_in($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $2 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 2962
 $2 = HEAP32[1464] | 0; //@line 2963
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 2964
 FUNCTION_TABLE_vii[$2 & 3]($0, $1); //@line 2965
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 70; //@line 2968
  sp = STACKTOP; //@line 2969
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 2972
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
 sp = STACKTOP; //@line 12598
 STACKTOP = STACKTOP + 16 | 0; //@line 12599
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 12599
 if (!(_pthread_once(6728, 3) | 0)) {
  $3 = _pthread_getspecific(HEAP32[1683] | 0) | 0; //@line 12605
  STACKTOP = sp; //@line 12606
  return $3 | 0; //@line 12606
 } else {
  _abort_message(5514, sp); //@line 12608
 }
 return 0; //@line 12611
}
function __ZNK10__cxxabiv117__class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($0, $1, $2, $3, $4, $5) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 $5 = $5 | 0;
 if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, $5) | 0) {
  __ZNK10__cxxabiv117__class_type_info29process_static_type_above_dstEPNS_19__dynamic_cast_infoEPKvS4_i(0, $1, $2, $3, $4); //@line 12766
 }
 return;
}
function _sn_write($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$ = 0, $5 = 0, $6 = 0, $7 = 0;
 $5 = $0 + 20 | 0; //@line 12279
 $6 = HEAP32[$5 >> 2] | 0; //@line 12280
 $7 = (HEAP32[$0 + 16 >> 2] | 0) - $6 | 0; //@line 12281
 $$ = $7 >>> 0 > $2 >>> 0 ? $2 : $7; //@line 12283
 _memcpy($6 | 0, $1 | 0, $$ | 0) | 0; //@line 12285
 HEAP32[$5 >> 2] = (HEAP32[$5 >> 2] | 0) + $$; //@line 12288
 return $2 | 0; //@line 12289
}
function __ZL25default_terminate_handlerv__async_cb_58($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $AsyncRetVal = 0;
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 5529
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 5531
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 5533
 HEAP32[$2 >> 2] = 5375; //@line 5534
 HEAP32[$2 + 4 >> 2] = $4; //@line 5536
 HEAP32[$2 + 8 >> 2] = $AsyncRetVal; //@line 5538
 _abort_message(5239, $2); //@line 5539
}
function __ZN6events10EventQueueC2EjPh($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $3 = 0;
 $3 = $0 + 188 | 0; //@line 498
 HEAP32[$3 >> 2] = 0; //@line 499
 HEAP32[$3 + 4 >> 2] = 0; //@line 499
 HEAP32[$3 + 8 >> 2] = 0; //@line 499
 HEAP32[$3 + 12 >> 2] = 0; //@line 499
 if (!$2) {
  _equeue_create($0, $1) | 0; //@line 502
  return;
 } else {
  _equeue_create_inplace($0, $1, $2) | 0; //@line 505
  return;
 }
}
function __ZN6events10EventQueue8dispatchEi($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 513
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 514
 _equeue_dispatch($0, $1); //@line 515
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 25; //@line 518
  sp = STACKTOP; //@line 519
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 522
  return;
 }
}
function _abort_message__async_cb($0) {
 $0 = $0 | 0;
 var $2 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 8885
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 8887
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(4) | 0; //@line 8888
 _fputc(10, $2) | 0; //@line 8889
 if (!___async) {
  ___async_unwind = 0; //@line 8892
 }
 HEAP32[$ReallocAsyncCtx2 >> 2] = 131; //@line 8894
 sp = STACKTOP; //@line 8895
 return;
}
function _gpio_irq_init($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $$0 = 0;
 if (($1 | 0) == -1) {
  $$0 = -1; //@line 2985
  return $$0 | 0; //@line 2986
 }
 HEAP32[1464] = $2; //@line 2988
 HEAP32[$0 >> 2] = $1; //@line 2989
 HEAP32[$0 + 4 >> 2] = $1; //@line 2991
 _emscripten_asm_const_iii(5, $3 | 0, $1 | 0) | 0; //@line 2992
 $$0 = 0; //@line 2993
 return $$0 | 0; //@line 2994
}
function __ZN10__cxxabiv112_GLOBAL__N_19destruct_EPv($0) {
 $0 = $0 | 0;
 var sp = 0;
 sp = STACKTOP; //@line 13360
 STACKTOP = STACKTOP + 16 | 0; //@line 13361
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 13361
 _free($0); //@line 13363
 if (!(_pthread_setspecific(HEAP32[1683] | 0, 0) | 0)) {
  STACKTOP = sp; //@line 13368
  return;
 } else {
  _abort_message(5613, sp); //@line 13370
 }
}
function _vsnprintf__async_cb($0) {
 $0 = $0 | 0;
 var $13 = 0, $AsyncRetVal = 0;
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 9313
 if (HEAP32[$0 + 4 >> 2] | 0) {
  $13 = HEAP32[HEAP32[$0 + 16 >> 2] >> 2] | 0; //@line 9316
  HEAP8[$13 + ((($13 | 0) == (HEAP32[HEAP32[$0 + 20 >> 2] >> 2] | 0)) << 31 >> 31) >> 0] = 0; //@line 9321
 }
 HEAP32[___async_retval >> 2] = $AsyncRetVal; //@line 9324
 return;
}
function __ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv__async_cb($0) {
 $0 = $0 | 0;
 var $$0 = 0, $2 = 0;
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 1305
 if ((HEAP32[$2 + 24 >> 2] | 0) == 1) {
  HEAP32[HEAP32[$0 + 8 >> 2] >> 2] = HEAP32[$2 + 16 >> 2]; //@line 1316
  $$0 = 1; //@line 1317
 } else {
  $$0 = 0; //@line 1319
 }
 HEAP8[___async_retval >> 0] = $$0 & 1; //@line 1323
 return;
}
function _serial_init($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $10 = 0, $4 = 0, $9 = 0;
 HEAP32[$0 + 4 >> 2] = $2; //@line 3025
 HEAP32[$0 >> 2] = $1; //@line 3026
 HEAP32[1465] = 1; //@line 3027
 $4 = $0; //@line 3028
 $9 = HEAP32[$4 + 4 >> 2] | 0; //@line 3033
 $10 = 5864; //@line 3034
 HEAP32[$10 >> 2] = HEAP32[$4 >> 2]; //@line 3036
 HEAP32[$10 + 4 >> 2] = $9; //@line 3039
 return;
}
function __ZNK10__cxxabiv117__class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, 0) | 0) {
  __ZNK10__cxxabiv117__class_type_info24process_found_base_classEPNS_19__dynamic_cast_infoEPvi(0, $1, $2, $3); //@line 12842
 }
 return;
}
function _mbed_trace_default_print($0) {
 $0 = $0 | 0;
 var $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 1764
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 1765
 _puts($0) | 0; //@line 1766
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 35; //@line 1769
  sp = STACKTOP; //@line 1770
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 1773
  return;
 }
}
function _equeue_sema_create($0) {
 $0 = $0 | 0;
 var $$0 = 0, $1 = 0, $4 = 0;
 $1 = _pthread_mutex_init($0 | 0, 0) | 0; //@line 1664
 if (!$1) {
  $4 = _pthread_cond_init($0 + 28 | 0, 0) | 0; //@line 1668
  if (!$4) {
   HEAP8[$0 + 76 >> 0] = 0; //@line 1672
   $$0 = 0; //@line 1673
  } else {
   $$0 = $4; //@line 1675
  }
 } else {
  $$0 = $1; //@line 1678
 }
 return $$0 | 0; //@line 1680
}
function _equeue_tick() {
 var $0 = 0, sp = 0;
 sp = STACKTOP; //@line 1627
 STACKTOP = STACKTOP + 16 | 0; //@line 1628
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 1628
 $0 = sp; //@line 1629
 _gettimeofday($0 | 0, 0) | 0; //@line 1630
 STACKTOP = sp; //@line 1637
 return ((HEAP32[$0 + 4 >> 2] | 0) / 1e3 | 0) + ((HEAP32[$0 >> 2] | 0) * 1e3 | 0) | 0; //@line 1637
}
function _wait_ms($0) {
 $0 = $0 | 0;
 var $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 3129
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 3130
 _emscripten_sleep($0 | 0); //@line 3131
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 75; //@line 3134
  sp = STACKTOP; //@line 3135
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 3138
  return;
 }
}
function __ZN20SimulatorBlockDevice4initEv($0) {
 $0 = $0 | 0;
 var $15 = 0, $2 = 0, $9 = 0;
 $2 = $0 + 32 | 0; //@line 3161
 $9 = $0 + 8 | 0; //@line 3168
 $15 = ___muldi3(HEAP32[$9 >> 2] | 0, HEAP32[$9 + 4 >> 2] | 0, HEAP32[$2 >> 2] | 0, HEAP32[$2 + 4 >> 2] | 0) | 0; //@line 3174
 _emscripten_asm_const_iii(8, HEAP32[$0 + 4 >> 2] | 0, $15 | 0) | 0; //@line 3178
 return 0; //@line 3179
}
function __ZNK10__cxxabiv117__class_type_info29process_static_type_below_dstEPNS_19__dynamic_cast_infoEPKvi($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $7 = 0;
 if ((HEAP32[$1 + 4 >> 2] | 0) == ($2 | 0)) {
  $7 = $1 + 28 | 0; //@line 12906
  if ((HEAP32[$7 >> 2] | 0) != 1) {
   HEAP32[$7 >> 2] = $3; //@line 12910
  }
 }
 return;
}
function __ZN10__cxxabiv112_GLOBAL__N_110construct_Ev() {
 var sp = 0;
 sp = STACKTOP; //@line 13345
 STACKTOP = STACKTOP + 16 | 0; //@line 13346
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 13346
 if (!(_pthread_key_create(6732, 140) | 0)) {
  STACKTOP = sp; //@line 13351
  return;
 } else {
  _abort_message(5563, sp); //@line 13353
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
 HEAP32[$0 >> 2] = 0; //@line 4233
 $2 = HEAP32[$1 >> 2] | 0; //@line 4234
 if (!$2) {
  return;
 }
 HEAP32[$0 >> 2] = $2; //@line 4239
 HEAP32[$2 >> 2] = (HEAP32[$2 >> 2] | 0) + 1; //@line 4242
 return;
}
function ___cxa_can_catch__async_cb($0) {
 $0 = $0 | 0;
 var $AsyncRetVal = 0;
 $AsyncRetVal = HEAP8[___async_retval >> 0] & 1; //@line 4204
 if ($AsyncRetVal) {
  HEAP32[HEAP32[$0 + 8 >> 2] >> 2] = HEAP32[HEAP32[$0 + 4 >> 2] >> 2]; //@line 4208
 }
 HEAP32[___async_retval >> 2] = $AsyncRetVal & 1; //@line 4211
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
function __ZN20SimulatorBlockDevice7programEPKvyy__async_cb_9($0) {
 $0 = $0 | 0;
 _emscripten_asm_const_iiiii(10, HEAP32[(HEAP32[$0 + 24 >> 2] | 0) + 4 >> 2] | 0, HEAP32[$0 + 28 >> 2] | 0, HEAP32[$0 + 8 >> 2] | 0, HEAP32[$0 + 16 >> 2] | 0) | 0; //@line 1933
 HEAP32[___async_retval >> 2] = 0; //@line 1935
 return;
}
function __ZNK20SimulatorBlockDevice4sizeEv($0) {
 $0 = $0 | 0;
 var $15 = 0, $2 = 0, $9 = 0;
 $2 = $0 + 32 | 0; //@line 3783
 $9 = $0 + 24 | 0; //@line 3790
 $15 = ___muldi3(HEAP32[$9 >> 2] | 0, HEAP32[$9 + 4 >> 2] | 0, HEAP32[$2 >> 2] | 0, HEAP32[$2 + 4 >> 2] | 0) | 0; //@line 3796
 return $15 | 0; //@line 3799
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
function __ZN20SimulatorBlockDevice4readEPvyy__async_cb_32($0) {
 $0 = $0 | 0;
 _emscripten_asm_const_iiiii(9, HEAP32[(HEAP32[$0 + 24 >> 2] | 0) + 4 >> 2] | 0, HEAP32[$0 + 28 >> 2] | 0, HEAP32[$0 + 8 >> 2] | 0, HEAP32[$0 + 16 >> 2] | 0) | 0; //@line 4668
 HEAP32[___async_retval >> 2] = 0; //@line 4670
 return;
}
function _equeue_dispatch__async_cb_64($0) {
 $0 = $0 | 0;
 var $4 = 0, $6 = 0;
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 7110
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 7112
 HEAP8[HEAP32[$0 + 4 >> 2] >> 0] = 1; //@line 7113
 _equeue_mutex_unlock($4); //@line 7114
 HEAP8[$6 >> 0] = 0; //@line 7115
 return;
}
function _fflush__async_cb_72($0) {
 $0 = $0 | 0;
 var $AsyncRetVal = 0;
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 8787
 if (!(HEAP8[$0 + 4 >> 0] & 1)) {
  ___unlockfile(HEAP32[$0 + 8 >> 2] | 0); //@line 8789
 }
 HEAP32[___async_retval >> 2] = $AsyncRetVal; //@line 8792
 return;
}
function __ZN4mbed11InterruptIn4fallENS_8CallbackIFvvEEE__async_cb_67($0) {
 $0 = $0 | 0;
 var $6 = 0;
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 8543
 HEAP32[HEAP32[$0 + 8 >> 2] >> 2] = HEAP32[HEAP32[$0 + 4 >> 2] >> 2]; //@line 8545
 _gpio_irq_set($6 + 28 | 0, 2, 1); //@line 8547
 return;
}
function __ZN20SimulatorBlockDevice5eraseEyy__async_cb_29($0) {
 $0 = $0 | 0;
 _emscripten_asm_const_iiii(11, HEAP32[(HEAP32[$0 + 24 >> 2] | 0) + 4 >> 2] | 0, HEAP32[$0 + 8 >> 2] | 0, HEAP32[$0 + 16 >> 2] | 0) | 0; //@line 4161
 HEAP32[___async_retval >> 2] = 0; //@line 4163
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
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 4185
 _equeue_sema_signal((HEAP32[$0 + 4 >> 2] | 0) + 48 | 0); //@line 4187
 HEAP32[___async_retval >> 2] = $AsyncRetVal; //@line 4189
 return;
}
function _puts__async_cb($0) {
 $0 = $0 | 0;
 var $$lobit = 0;
 $$lobit = HEAP32[___async_retval >> 2] >> 31; //@line 926
 if (HEAP32[$0 + 4 >> 2] | 0) {
  ___unlockfile(HEAP32[$0 + 8 >> 2] | 0); //@line 929
 }
 HEAP32[___async_retval >> 2] = $$lobit; //@line 932
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
  $$0 = HEAPU8[HEAP32[$0 + 4 >> 2] >> 0] | 0; //@line 5801
 } else {
  $$0 = -1; //@line 5803
 }
 HEAP32[___async_retval >> 2] = $$0; //@line 5806
 return;
}
function ___lctrans_impl($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0 = 0;
 if (!$1) {
  $$0 = 0; //@line 8167
 } else {
  $$0 = ___mo_lookup(HEAP32[$1 >> 2] | 0, HEAP32[$1 + 4 >> 2] | 0, $0) | 0; //@line 8173
 }
 return ($$0 | 0 ? $$0 : $0) | 0; //@line 8177
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
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 1463
 ___unlockfile(HEAP32[$0 + 4 >> 2] | 0); //@line 1464
 HEAP32[___async_retval >> 2] = $AsyncRetVal; //@line 1466
 return;
}
function _putc__async_cb($0) {
 $0 = $0 | 0;
 var $AsyncRetVal = 0;
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 1440
 ___unlockfile(HEAP32[$0 + 4 >> 2] | 0); //@line 1441
 HEAP32[___async_retval >> 2] = $AsyncRetVal; //@line 1443
 return;
}
function ___DOUBLE_BITS_677($0) {
 $0 = +$0;
 var $1 = 0;
 HEAPF64[tempDoublePtr >> 3] = $0; //@line 11278
 $1 = HEAP32[tempDoublePtr >> 2] | 0; //@line 11278
 tempRet0 = HEAP32[tempDoublePtr + 4 >> 2] | 0; //@line 11280
 return $1 | 0; //@line 11281
}
function __ZNK20SimulatorBlockDevice14get_erase_sizeEy($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $4 = 0;
 $4 = $0 + 24 | 0; //@line 3769
 tempRet0 = HEAP32[$4 + 4 >> 2] | 0; //@line 3775
 return HEAP32[$4 >> 2] | 0; //@line 3776
}
function _gpio_init_out($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 HEAP32[$0 >> 2] = $1; //@line 2948
 if (($1 | 0) == -1) {
  return;
 }
 HEAP32[$0 + 4 >> 2] = $1; //@line 2954
 _emscripten_asm_const_iii(4, $0 | 0, $1 | 0) | 0; //@line 2955
 return;
}
function _gpio_init_in($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 HEAP32[$0 >> 2] = $1; //@line 2933
 if (($1 | 0) == -1) {
  return;
 }
 HEAP32[$0 + 4 >> 2] = $1; //@line 2939
 _emscripten_asm_const_iii(3, $0 | 0, $1 | 0) | 0; //@line 2940
 return;
}
function _equeue_sema_signal($0) {
 $0 = $0 | 0;
 _pthread_mutex_lock($0 | 0) | 0; //@line 1686
 HEAP8[$0 + 76 >> 0] = 1; //@line 1688
 _pthread_cond_signal($0 + 28 | 0) | 0; //@line 1690
 _pthread_mutex_unlock($0 | 0) | 0; //@line 1691
 return;
}
function ___syscall_ret($0) {
 $0 = $0 | 0;
 var $$0 = 0;
 if ($0 >>> 0 > 4294963200) {
  HEAP32[(___errno_location() | 0) >> 2] = 0 - $0; //@line 7626
  $$0 = -1; //@line 7627
 } else {
  $$0 = $0; //@line 7629
 }
 return $$0 | 0; //@line 7631
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
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 910
 _equeue_mutex_unlock(HEAP32[$0 + 4 >> 2] | 0); //@line 911
 HEAP32[___async_retval >> 2] = $4; //@line 913
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
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 8451
 HEAP32[$2 >> 2] = HEAP32[HEAP32[1468] >> 2]; //@line 8456
 _printf(2424, $2) | 0; //@line 8457
 return;
}
function __ZNK20SimulatorBlockDevice16get_program_sizeEv($0) {
 $0 = $0 | 0;
 var $2 = 0;
 $2 = $0 + 16 | 0; //@line 3739
 tempRet0 = HEAP32[$2 + 4 >> 2] | 0; //@line 3745
 return HEAP32[$2 >> 2] | 0; //@line 3746
}
function __ZNK20SimulatorBlockDevice14get_erase_sizeEv($0) {
 $0 = $0 | 0;
 var $2 = 0;
 $2 = $0 + 24 | 0; //@line 3753
 tempRet0 = HEAP32[$2 + 4 >> 2] | 0; //@line 3759
 return HEAP32[$2 >> 2] | 0; //@line 3760
}
function __ZNK20SimulatorBlockDevice13get_read_sizeEv($0) {
 $0 = $0 | 0;
 var $2 = 0;
 $2 = $0 + 8 | 0; //@line 3725
 tempRet0 = HEAP32[$2 + 4 >> 2] | 0; //@line 3731
 return HEAP32[$2 >> 2] | 0; //@line 3732
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
  $$0 = 0; //@line 10338
 } else {
  $$0 = _wcrtomb($0, $1, 0) | 0; //@line 10341
 }
 return $$0 | 0; //@line 10343
}
function _strchr($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $2 = 0;
 $2 = ___strchrnul($0, $1) | 0; //@line 8312
 return ((HEAP8[$2 >> 0] | 0) == ($1 & 255) << 24 >> 24 ? $2 : 0) | 0; //@line 8317
}
function __GLOBAL__sub_I_main_cpp__async_cb($0) {
 $0 = $0 | 0;
 __ZN6events10EventQueueC2EjPh(5876, 1664, 0); //@line 8674
 __ZN4mbed11InterruptInC2E7PinName(6080, 1337); //@line 8675
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
 $2 = _strlen($0) | 0; //@line 7807
 return ((_fwrite($0, 1, $2, $1) | 0) != ($2 | 0)) << 31 >> 31 | 0; //@line 7811
}
function ___dynamic_cast__async_cb($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = (HEAP32[HEAP32[$0 + 4 >> 2] >> 2] | 0) == 1 ? HEAP32[$0 + 8 >> 2] | 0 : 0; //@line 991
 return;
}
function __ZN6events5EventIFvvEE10event_postIPS1_EEiPNS2_5eventE__async_cb($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = HEAP32[___async_retval >> 2]; //@line 1953
 return;
}
function _gpio_irq_set($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 _emscripten_asm_const_iiii(7, HEAP32[$0 + 4 >> 2] | 0, $1 | 0, $2 | 0) | 0; //@line 3015
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
function __ZN4mbed11InterruptIn4fallENS_8CallbackIFvvEEE__async_cb_70($0) {
 $0 = $0 | 0;
 _gpio_irq_set((HEAP32[$0 + 8 >> 2] | 0) + 28 | 0, 2, 0); //@line 8658
 return;
}
function __ZN10__cxxabiv120__si_class_type_infoD0Ev($0) {
 $0 = $0 | 0;
 __ZN10__cxxabiv116__shim_type_infoD2Ev($0); //@line 13128
 __ZdlPv($0); //@line 13129
 return;
}
function _swapc($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $3 = 0;
 $3 = _llvm_bswap_i32($0 | 0) | 0; //@line 8303
 return (($1 | 0) == 0 ? $0 : $3) | 0; //@line 8305
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
 __ZN10__cxxabiv116__shim_type_infoD2Ev($0); //@line 12656
 __ZdlPv($0); //@line 12657
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
  ___fwritex($1, $2, $0) | 0; //@line 9823
 }
 return;
}
function ___cxa_is_pointer_type__async_cb($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = (HEAP32[___async_retval >> 2] | 0) != 0 & 1; //@line 5824
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
 return ($0 | 0) == ($1 | 0) | 0; //@line 12853
}
function _gpio_irq_free($0) {
 $0 = $0 | 0;
 _emscripten_asm_const_iii(6, HEAP32[$0 + 4 >> 2] | 0, HEAP32[$0 + 8 >> 2] | 0) | 0; //@line 3004
 return;
}
function __ZN11BlockDevice4trimEyy($0, $1, $2, $3, $4) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 return 0; //@line 1747
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
function __ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_80($0) {
 $0 = $0 | 0;
 return;
}
function __ZNK10__cxxabiv120__si_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function _strerror($0) {
 $0 = $0 | 0;
 return ___strerror_l($0, HEAP32[(___pthread_self_85() | 0) + 188 >> 2] | 0) | 0; //@line 10286
}
function _fflush__async_cb_73($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = HEAP32[___async_retval >> 2]; //@line 8802
 return;
}
function _snprintf__async_cb($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = HEAP32[___async_retval >> 2]; //@line 4175
 return;
}
function _fputc__async_cb_6($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = HEAP32[___async_retval >> 2]; //@line 1476
 return;
}
function dynCall_ii(index, a1) {
 index = index | 0;
 a1 = a1 | 0;
 return FUNCTION_TABLE_ii[index & 15](a1 | 0) | 0; //@line 9982
}
function _putc__async_cb_5($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = HEAP32[___async_retval >> 2]; //@line 1453
 return;
}
function _printf__async_cb($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = HEAP32[___async_retval >> 2]; //@line 8920
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
function __ZSt11__terminatePFvvE__async_cb($0) {
 $0 = $0 | 0;
 _abort_message(5666, HEAP32[$0 + 4 >> 2] | 0); //@line 8667
}
function __ZN4mbed11InterruptInD0Ev__async_cb_1($0) {
 $0 = $0 | 0;
 __ZdlPv(HEAP32[$0 + 4 >> 2] | 0); //@line 974
 return;
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
 HEAP32[$0 + -12 >> 2] = $1; //@line 1613
 return;
}
function _equeue_event_delay($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 HEAP32[$0 + -16 >> 2] = $1; //@line 1604
 return;
}
function __ZN4mbed8CallbackIFvvEE13function_callIN6events5EventIS1_EEEEvPKv__async_cb_79($0) {
 $0 = $0 | 0;
 return;
}
function __ZN4mbed8CallbackIFvvEE13function_dtorIN6events5EventIS1_EEEEvPv__async_cb_71($0) {
 $0 = $0 | 0;
 return;
}
function _equeue_event_dtor($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 HEAP32[$0 + -8 >> 2] = $1; //@line 1622
 return;
}
function __ZN6events10EventQueue13function_callINS0_9context00IPFvvEEEEEvPv__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function ___lctrans($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 return ___lctrans_impl($0, $1) | 0; //@line 11531
}
function _equeue_mutex_unlock($0) {
 $0 = $0 | 0;
 _pthread_mutex_unlock($0 | 0) | 0; //@line 1657
 return;
}
function _equeue_mutex_create($0) {
 $0 = $0 | 0;
 return _pthread_mutex_init($0 | 0, 0) | 0; //@line 1644
}
function __ZN4mbed11InterruptIn12_irq_handlerEj14gpio_irq_event__async_cb_76($0) {
 $0 = $0 | 0;
 return;
}
function _main__async_cb_39($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = 0; //@line 4896
 return;
}
function _main__async_cb_34($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = 1; //@line 4749
 return;
}
function __ZN6events10EventQueue13function_dtorINS0_9context00IPFvvEEEEEvPv($0) {
 $0 = $0 | 0;
 return;
}
function dynCall_i(index) {
 index = index | 0;
 return FUNCTION_TABLE_i[index & 0]() | 0; //@line 9975
}
function _equeue_mutex_lock($0) {
 $0 = $0 | 0;
 _pthread_mutex_lock($0 | 0) | 0; //@line 1650
 return;
}
function __ZN4mbed11InterruptIn12_irq_handlerEj14gpio_irq_event__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function __ZN20SimulatorBlockDeviceD0Ev($0) {
 $0 = $0 | 0;
 __ZdlPv($0); //@line 3152
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
 return ($0 + -48 | 0) >>> 0 < 10 | 0; //@line 7684
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
 return 0; //@line 3185
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
function _abort_message__async_cb_75($0) {
 $0 = $0 | 0;
 _abort(); //@line 8902
}
function ___ofl_lock() {
 ___lock(6716); //@line 8322
 return 6724; //@line 8323
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
function __ZN4mbed11InterruptInD2Ev__async_cb_11($0) {
 $0 = $0 | 0;
 return;
}
function __ZN11BlockDevice4syncEv($0) {
 $0 = $0 | 0;
 return 0; //@line 1753
}
function __ZN10__cxxabiv116__shim_type_infoD2Ev($0) {
 $0 = $0 | 0;
 return;
}
function ___pthread_self_910() {
 return _pthread_self() | 0; //@line 11452
}
function ___pthread_self_85() {
 return _pthread_self() | 0; //@line 11458
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
 _free($0); //@line 12482
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
 ___unlock(6716); //@line 8328
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
 return $0 | 0; //@line 7642
}
function ___lockfile($0) {
 $0 = $0 | 0;
 return 0; //@line 7959
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
function __ZSt9terminatev__async_cb_81($0) {
 $0 = $0 | 0;
}
function __ZNSt9type_infoD2Ev($0) {
 $0 = $0 | 0;
 return;
}
function getTempRet0() {
 return tempRet0 | 0; //@line 42
}
function ___errno_location() {
 return 6712; //@line 7636
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
 return 596; //@line 7689
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
var FUNCTION_TABLE_vi = [b21,__ZN4mbed11InterruptInD2Ev,__ZN4mbed11InterruptInD0Ev,_mbed_trace_default_print,__ZN20SimulatorBlockDeviceD2Ev,__ZN20SimulatorBlockDeviceD0Ev,__ZN4mbed8CallbackIFvvEE13function_callIN6events5EventIS1_EEEEvPKv,__ZN4mbed8CallbackIFvvEE13function_dtorIN6events5EventIS1_EEEEvPv,__ZN10__cxxabiv116__shim_type_infoD2Ev,__ZN10__cxxabiv117__class_type_infoD0Ev,__ZNK10__cxxabiv116__shim_type_info5noop1Ev,__ZNK10__cxxabiv116__shim_type_info5noop2Ev,__ZN10__cxxabiv120__si_class_type_infoD0Ev,__ZN10__cxxabiv121__vmi_class_type_infoD0Ev,__ZN4mbed11InterruptInD2Ev__async_cb,__ZN4mbed11InterruptInD2Ev__async_cb_11,__ZN4mbed11InterruptInD0Ev__async_cb,__ZN4mbed11InterruptInD0Ev__async_cb_1,__ZN4mbed11InterruptIn12_irq_handlerEj14gpio_irq_event__async_cb,__ZN4mbed11InterruptIn12_irq_handlerEj14gpio_irq_event__async_cb_76,__ZN4mbed11InterruptIn4fallENS_8CallbackIFvvEEE__async_cb,__ZN4mbed11InterruptIn4fallENS_8CallbackIFvvEEE__async_cb_67,__ZN4mbed11InterruptIn4fallENS_8CallbackIFvvEEE__async_cb_68,__ZN4mbed11InterruptIn4fallENS_8CallbackIFvvEEE__async_cb_69,__ZN4mbed11InterruptIn4fallENS_8CallbackIFvvEEE__async_cb_70,__ZN6events10EventQueue8dispatchEi__async_cb,_equeue_alloc__async_cb,_equeue_dealloc__async_cb,_equeue_post__async_cb
,_equeue_enqueue__async_cb,_equeue_dispatch__async_cb,_equeue_dispatch__async_cb_65,_equeue_dispatch__async_cb_63,_equeue_dispatch__async_cb_64,_equeue_dispatch__async_cb_66,_mbed_trace_default_print__async_cb,_mbed_tracef__async_cb,_mbed_vtracef__async_cb,_mbed_vtracef__async_cb_26,_mbed_vtracef__async_cb_16,_mbed_vtracef__async_cb_17,_mbed_vtracef__async_cb_18,_mbed_vtracef__async_cb_25,_mbed_vtracef__async_cb_19,_mbed_vtracef__async_cb_24,_mbed_vtracef__async_cb_20,_mbed_vtracef__async_cb_21,_mbed_vtracef__async_cb_22,_mbed_vtracef__async_cb_23,_mbed_assert_internal__async_cb,_mbed_die__async_cb_57,_mbed_die__async_cb_56,_mbed_die__async_cb_55,_mbed_die__async_cb_54,_mbed_die__async_cb_53,_mbed_die__async_cb_52,_mbed_die__async_cb_51,_mbed_die__async_cb_50,_mbed_die__async_cb_49
,_mbed_die__async_cb_48,_mbed_die__async_cb_47,_mbed_die__async_cb_46,_mbed_die__async_cb_45,_mbed_die__async_cb_44,_mbed_die__async_cb_43,_mbed_die__async_cb,_mbed_error_printf__async_cb,_mbed_error_vfprintf__async_cb,_mbed_error_vfprintf__async_cb_61,_mbed_error_vfprintf__async_cb_60,_handle_interrupt_in__async_cb,_serial_putc__async_cb_59,_serial_putc__async_cb,_invoke_ticker__async_cb_62,_invoke_ticker__async_cb,_wait_ms__async_cb,__ZN20SimulatorBlockDevice4readEPvyy__async_cb,__ZN20SimulatorBlockDevice4readEPvyy__async_cb_30,__ZN20SimulatorBlockDevice4readEPvyy__async_cb_31,__ZN20SimulatorBlockDevice4readEPvyy__async_cb_32,__ZN20SimulatorBlockDevice7programEPKvyy__async_cb,__ZN20SimulatorBlockDevice7programEPKvyy__async_cb_7,__ZN20SimulatorBlockDevice7programEPKvyy__async_cb_8,__ZN20SimulatorBlockDevice7programEPKvyy__async_cb_9,__ZN20SimulatorBlockDevice5eraseEyy__async_cb,__ZN20SimulatorBlockDevice5eraseEyy__async_cb_27,__ZN20SimulatorBlockDevice5eraseEyy__async_cb_28,__ZN20SimulatorBlockDevice5eraseEyy__async_cb_29,__ZN20SimulatorBlockDeviceC2EPKcyy__async_cb
,__GLOBAL__sub_I_main_cpp__async_cb,__Z8btn_fallv__async_cb,_main__async_cb_37,_main__async_cb_36,_main__async_cb_35,_main__async_cb_34,_main__async_cb_38,_main__async_cb_42,__ZN6events5EventIFvvEE10event_dtorIPS1_EEvPNS2_5eventE,_main__async_cb_41,_main__async_cb,_main__async_cb_33,_main__async_cb_40,_main__async_cb_39,__ZN6events5EventIFvvEE10event_postIPS1_EEiPNS2_5eventE__async_cb_10,__ZN6events10EventQueue13function_dtorINS0_9context00IPFvvEEEEEvPv,__ZN6events10EventQueue13function_callINS0_9context00IPFvvEEEEEvPv,__ZN6events5EventIFvvEE10event_postIPS1_EEiPNS2_5eventE__async_cb,__ZN4mbed8CallbackIFvvEE13function_callIN6events5EventIS1_EEEEvPKv__async_cb,__ZN4mbed8CallbackIFvvEE13function_callIN6events5EventIS1_EEEEvPKv__async_cb_79,__ZN4mbed8CallbackIFvvEE13function_dtorIN6events5EventIS1_EEEEvPv__async_cb,__ZN4mbed8CallbackIFvvEE13function_dtorIN6events5EventIS1_EEEEvPv__async_cb_71,__ZN6events10EventQueue13function_callINS0_9context00IPFvvEEEEEvPv__async_cb,_putc__async_cb_5,_putc__async_cb,___overflow__async_cb,_fflush__async_cb_73,_fflush__async_cb_72,_fflush__async_cb_74,_fflush__async_cb
,___fflush_unlocked__async_cb,___fflush_unlocked__async_cb_77,_vfprintf__async_cb,_snprintf__async_cb,_vsnprintf__async_cb,_printf__async_cb,_fputc__async_cb_6,_fputc__async_cb,_puts__async_cb,__ZL25default_terminate_handlerv__async_cb,__ZL25default_terminate_handlerv__async_cb_58,_abort_message__async_cb,_abort_message__async_cb_75,__ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv__async_cb_4,__ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv__async_cb,___dynamic_cast__async_cb,___dynamic_cast__async_cb_2,__ZNK10__cxxabiv120__si_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb,__ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb,__ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_80,__ZNK10__cxxabiv120__si_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb,__ZN10__cxxabiv112_GLOBAL__N_19destruct_EPv,__ZSt11__terminatePFvvE__async_cb,__ZNK10__cxxabiv121__vmi_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb_3,__ZNK10__cxxabiv121__vmi_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb,__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_15,__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_14,__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_13,__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_12,__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb
,__ZNK10__cxxabiv121__vmi_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb_78,__ZNK10__cxxabiv121__vmi_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb,__ZNK10__cxxabiv122__base_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb,__ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb,__ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb,___cxa_can_catch__async_cb,___cxa_is_pointer_type__async_cb,b22,b23,b24,b25,b26,b27,b28,b29,b30,b31,b32,b33,b34,b35,b36,b37,b38,b39,b40,b41,b42,b43,b44
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
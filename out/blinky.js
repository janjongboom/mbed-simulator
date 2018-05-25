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
 function($0, $1) { MbedJSHal.gpio.init_out($0, $1, 0); },
 function($0) { return MbedJSHal.gpio.read($0); }];

function _emscripten_asm_const_iii(code, a0, a1) {
  return ASM_CONSTS[code](a0, a1);
}

function _emscripten_asm_const_i(code) {
  return ASM_CONSTS[code]();
}

function _emscripten_asm_const_ii(code, a0) {
  return ASM_CONSTS[code](a0);
}




STATIC_BASE = GLOBAL_BASE;

STATICTOP = STATIC_BASE + 5648;
/* global initializers */  __ATINIT__.push({ func: function() { __GLOBAL__sub_I_main_cpp() } });


memoryInitializer = "blinky.js.mem";





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



   

  
  function _emscripten_memcpy_big(dest, src, num) {
      HEAPU8.set(HEAPU8.subarray(src, src+num), dest);
      return dest;
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
var debug_table_ii = ["0", "___stdio_close"];
var debug_table_iiii = ["0", "___stdout_write", "___stdio_seek", "_sn_write", "__ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv", "___stdio_write", "0", "0"];
var debug_table_v = ["0"];
var debug_table_vi = ["0", "_mbed_trace_default_print", "__ZN10__cxxabiv116__shim_type_infoD2Ev", "__ZN10__cxxabiv117__class_type_infoD0Ev", "__ZNK10__cxxabiv116__shim_type_info5noop1Ev", "__ZNK10__cxxabiv116__shim_type_info5noop2Ev", "__ZN10__cxxabiv120__si_class_type_infoD0Ev", "_mbed_trace_default_print__async_cb", "_mbed_tracef__async_cb", "_mbed_vtracef__async_cb", "_mbed_vtracef__async_cb_12", "_mbed_vtracef__async_cb_2", "_mbed_vtracef__async_cb_3", "_mbed_vtracef__async_cb_4", "_mbed_vtracef__async_cb_11", "_mbed_vtracef__async_cb_5", "_mbed_vtracef__async_cb_10", "_mbed_vtracef__async_cb_6", "_mbed_vtracef__async_cb_7", "_mbed_vtracef__async_cb_8", "_mbed_vtracef__async_cb_9", "_mbed_assert_internal__async_cb", "_mbed_die__async_cb_27", "_mbed_die__async_cb_26", "_mbed_die__async_cb_25", "_mbed_die__async_cb_24", "_mbed_die__async_cb_23", "_mbed_die__async_cb_22", "_mbed_die__async_cb_21", "_mbed_die__async_cb_20", "_mbed_die__async_cb_19", "_mbed_die__async_cb_18", "_mbed_die__async_cb_17", "_mbed_die__async_cb_16", "_mbed_die__async_cb_15", "_mbed_die__async_cb_14", "_mbed_die__async_cb_13", "_mbed_die__async_cb", "_mbed_error_printf__async_cb", "_mbed_error_vfprintf__async_cb", "_mbed_error_vfprintf__async_cb_36", "_mbed_error_vfprintf__async_cb_35", "_serial_putc__async_cb_38", "_serial_putc__async_cb", "_invoke_ticker__async_cb_29", "_invoke_ticker__async_cb", "_wait_ms__async_cb", "_main__async_cb", "_putc__async_cb_1", "_putc__async_cb", "___overflow__async_cb", "_fflush__async_cb_31", "_fflush__async_cb_30", "_fflush__async_cb_32", "_fflush__async_cb", "___fflush_unlocked__async_cb", "___fflush_unlocked__async_cb_37", "_vfprintf__async_cb", "_snprintf__async_cb", "_vsnprintf__async_cb", "_printf__async_cb", "_puts__async_cb", "__ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv__async_cb_33", "__ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv__async_cb", "___dynamic_cast__async_cb", "___dynamic_cast__async_cb_34", "__ZNK10__cxxabiv120__si_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb", "__ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb", "__ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_28", "__ZNK10__cxxabiv120__si_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb", "___cxa_can_catch__async_cb", "___cxa_is_pointer_type__async_cb", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0"];
var debug_table_viiii = ["0", "__ZNK10__cxxabiv117__class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi", "__ZNK10__cxxabiv120__si_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi", "0"];
var debug_table_viiiii = ["0", "__ZNK10__cxxabiv117__class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib", "__ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib", "0"];
var debug_table_viiiiii = ["0", "__ZNK10__cxxabiv117__class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib", "__ZNK10__cxxabiv120__si_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib", "0"];
function nullFunc_i(x) { Module["printErr"]("Invalid function pointer '" + x + "' called with signature 'i'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  Module["printErr"]("This pointer might make sense in another type signature: ii: " + debug_table_ii[x] + "  iiii: " + debug_table_iiii[x] + "  vi: " + debug_table_vi[x] + "  v: " + debug_table_v[x] + "  viiii: " + debug_table_viiii[x] + "  viiiii: " + debug_table_viiiii[x] + "  viiiiii: " + debug_table_viiiiii[x] + "  "); abort(x) }

function nullFunc_ii(x) { Module["printErr"]("Invalid function pointer '" + x + "' called with signature 'ii'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  Module["printErr"]("This pointer might make sense in another type signature: i: " + debug_table_i[x] + "  iiii: " + debug_table_iiii[x] + "  vi: " + debug_table_vi[x] + "  v: " + debug_table_v[x] + "  viiii: " + debug_table_viiii[x] + "  viiiii: " + debug_table_viiiii[x] + "  viiiiii: " + debug_table_viiiiii[x] + "  "); abort(x) }

function nullFunc_iiii(x) { Module["printErr"]("Invalid function pointer '" + x + "' called with signature 'iiii'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  Module["printErr"]("This pointer might make sense in another type signature: ii: " + debug_table_ii[x] + "  i: " + debug_table_i[x] + "  viiii: " + debug_table_viiii[x] + "  vi: " + debug_table_vi[x] + "  viiiii: " + debug_table_viiiii[x] + "  viiiiii: " + debug_table_viiiiii[x] + "  v: " + debug_table_v[x] + "  "); abort(x) }

function nullFunc_v(x) { Module["printErr"]("Invalid function pointer '" + x + "' called with signature 'v'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  Module["printErr"]("This pointer might make sense in another type signature: vi: " + debug_table_vi[x] + "  viiii: " + debug_table_viiii[x] + "  viiiii: " + debug_table_viiiii[x] + "  viiiiii: " + debug_table_viiiiii[x] + "  i: " + debug_table_i[x] + "  ii: " + debug_table_ii[x] + "  iiii: " + debug_table_iiii[x] + "  "); abort(x) }

function nullFunc_vi(x) { Module["printErr"]("Invalid function pointer '" + x + "' called with signature 'vi'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  Module["printErr"]("This pointer might make sense in another type signature: v: " + debug_table_v[x] + "  viiii: " + debug_table_viiii[x] + "  viiiii: " + debug_table_viiiii[x] + "  viiiiii: " + debug_table_viiiiii[x] + "  i: " + debug_table_i[x] + "  ii: " + debug_table_ii[x] + "  iiii: " + debug_table_iiii[x] + "  "); abort(x) }

function nullFunc_viiii(x) { Module["printErr"]("Invalid function pointer '" + x + "' called with signature 'viiii'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  Module["printErr"]("This pointer might make sense in another type signature: vi: " + debug_table_vi[x] + "  viiiii: " + debug_table_viiiii[x] + "  viiiiii: " + debug_table_viiiiii[x] + "  v: " + debug_table_v[x] + "  iiii: " + debug_table_iiii[x] + "  ii: " + debug_table_ii[x] + "  i: " + debug_table_i[x] + "  "); abort(x) }

function nullFunc_viiiii(x) { Module["printErr"]("Invalid function pointer '" + x + "' called with signature 'viiiii'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  Module["printErr"]("This pointer might make sense in another type signature: viiii: " + debug_table_viiii[x] + "  vi: " + debug_table_vi[x] + "  viiiiii: " + debug_table_viiiiii[x] + "  v: " + debug_table_v[x] + "  iiii: " + debug_table_iiii[x] + "  ii: " + debug_table_ii[x] + "  i: " + debug_table_i[x] + "  "); abort(x) }

function nullFunc_viiiiii(x) { Module["printErr"]("Invalid function pointer '" + x + "' called with signature 'viiiiii'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  Module["printErr"]("This pointer might make sense in another type signature: viiii: " + debug_table_viiii[x] + "  viiiii: " + debug_table_viiiii[x] + "  vi: " + debug_table_vi[x] + "  v: " + debug_table_v[x] + "  iiii: " + debug_table_iiii[x] + "  ii: " + debug_table_ii[x] + "  i: " + debug_table_i[x] + "  "); abort(x) }

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

Module.asmLibraryArg = { "abort": abort, "assert": assert, "enlargeMemory": enlargeMemory, "getTotalMemory": getTotalMemory, "abortOnCannotGrowMemory": abortOnCannotGrowMemory, "abortStackOverflow": abortStackOverflow, "nullFunc_i": nullFunc_i, "nullFunc_ii": nullFunc_ii, "nullFunc_iiii": nullFunc_iiii, "nullFunc_v": nullFunc_v, "nullFunc_vi": nullFunc_vi, "nullFunc_viiii": nullFunc_viiii, "nullFunc_viiiii": nullFunc_viiiii, "nullFunc_viiiiii": nullFunc_viiiiii, "invoke_i": invoke_i, "invoke_ii": invoke_ii, "invoke_iiii": invoke_iiii, "invoke_v": invoke_v, "invoke_vi": invoke_vi, "invoke_viiii": invoke_viiii, "invoke_viiiii": invoke_viiiii, "invoke_viiiiii": invoke_viiiiii, "___lock": ___lock, "___setErrNo": ___setErrNo, "___syscall140": ___syscall140, "___syscall146": ___syscall146, "___syscall54": ___syscall54, "___syscall6": ___syscall6, "___unlock": ___unlock, "_abort": _abort, "_emscripten_asm_const_i": _emscripten_asm_const_i, "_emscripten_asm_const_ii": _emscripten_asm_const_ii, "_emscripten_asm_const_iii": _emscripten_asm_const_iii, "_emscripten_get_now": _emscripten_get_now, "_emscripten_memcpy_big": _emscripten_memcpy_big, "_emscripten_set_main_loop": _emscripten_set_main_loop, "_emscripten_set_main_loop_timing": _emscripten_set_main_loop_timing, "_emscripten_sleep": _emscripten_sleep, "flush_NO_FILESYSTEM": flush_NO_FILESYSTEM, "DYNAMICTOP_PTR": DYNAMICTOP_PTR, "tempDoublePtr": tempDoublePtr, "ABORT": ABORT, "STACKTOP": STACKTOP, "STACK_MAX": STACK_MAX, "cttz_i8": cttz_i8, "___async": ___async, "___async_unwind": ___async_unwind, "___async_retval": ___async_retval, "___async_cur_frame": ___async_cur_frame };
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
  var nullFunc_v=env.nullFunc_v;
  var nullFunc_vi=env.nullFunc_vi;
  var nullFunc_viiii=env.nullFunc_viiii;
  var nullFunc_viiiii=env.nullFunc_viiiii;
  var nullFunc_viiiiii=env.nullFunc_viiiiii;
  var invoke_i=env.invoke_i;
  var invoke_ii=env.invoke_ii;
  var invoke_iiii=env.invoke_iiii;
  var invoke_v=env.invoke_v;
  var invoke_vi=env.invoke_vi;
  var invoke_viiii=env.invoke_viiii;
  var invoke_viiiii=env.invoke_viiiii;
  var invoke_viiiiii=env.invoke_viiiiii;
  var ___lock=env.___lock;
  var ___setErrNo=env.___setErrNo;
  var ___syscall140=env.___syscall140;
  var ___syscall146=env.___syscall146;
  var ___syscall54=env.___syscall54;
  var ___syscall6=env.___syscall6;
  var ___unlock=env.___unlock;
  var _abort=env._abort;
  var _emscripten_asm_const_i=env._emscripten_asm_const_i;
  var _emscripten_asm_const_ii=env._emscripten_asm_const_ii;
  var _emscripten_asm_const_iii=env._emscripten_asm_const_iii;
  var _emscripten_get_now=env._emscripten_get_now;
  var _emscripten_memcpy_big=env._emscripten_memcpy_big;
  var _emscripten_set_main_loop=env._emscripten_set_main_loop;
  var _emscripten_set_main_loop_timing=env._emscripten_set_main_loop_timing;
  var _emscripten_sleep=env._emscripten_sleep;
  var flush_NO_FILESYSTEM=env.flush_NO_FILESYSTEM;
  var tempFloat = 0.0;

// EMSCRIPTEN_START_FUNCS
function _malloc($0) {
 $0 = $0 | 0;
 var $$$0192$i = 0, $$$0193$i = 0, $$$4351$i = 0, $$$i = 0, $$0 = 0, $$0$i$i = 0, $$0$i$i$i = 0, $$0$i17$i = 0, $$0189$i = 0, $$0192$lcssa$i = 0, $$01926$i = 0, $$0193$lcssa$i = 0, $$01935$i = 0, $$0197 = 0, $$0199 = 0, $$0206$i$i = 0, $$0207$i$i = 0, $$0211$i$i = 0, $$0212$i$i = 0, $$024367$i = 0, $$0287$i$i = 0, $$0288$i$i = 0, $$0289$i$i = 0, $$0295$i$i = 0, $$0296$i$i = 0, $$0342$i = 0, $$0344$i = 0, $$0345$i = 0, $$0347$i = 0, $$0353$i = 0, $$0358$i = 0, $$0359$i = 0, $$0361$i = 0, $$0362$i = 0, $$0368$i = 0, $$1196$i = 0, $$1198$i = 0, $$124466$i = 0, $$1291$i$i = 0, $$1293$i$i = 0, $$1343$i = 0, $$1348$i = 0, $$1363$i = 0, $$1370$i = 0, $$1374$i = 0, $$2234243136$i = 0, $$2247$ph$i = 0, $$2253$ph$i = 0, $$2355$i = 0, $$3$i = 0, $$3$i$i = 0, $$3$i203 = 0, $$3350$i = 0, $$3372$i = 0, $$4$lcssa$i = 0, $$4$ph$i = 0, $$414$i = 0, $$4236$i = 0, $$4351$lcssa$i = 0, $$435113$i = 0, $$4357$$4$i = 0, $$4357$ph$i = 0, $$435712$i = 0, $$723947$i = 0, $$748$i = 0, $$pre$phi$i$iZ2D = 0, $$pre$phi$i19$iZ2D = 0, $$pre$phi$i211Z2D = 0, $$pre$phi$iZ2D = 0, $$pre$phi11$i$iZ2D = 0, $$pre$phiZ2D = 0, $1 = 0, $1004 = 0, $101 = 0, $1010 = 0, $1013 = 0, $1014 = 0, $102 = 0, $1032 = 0, $1034 = 0, $1041 = 0, $1042 = 0, $1043 = 0, $1052 = 0, $1054 = 0, $1055 = 0, $1056 = 0, $108 = 0, $112 = 0, $114 = 0, $115 = 0, $117 = 0, $119 = 0, $121 = 0, $123 = 0, $125 = 0, $127 = 0, $129 = 0, $134 = 0, $138 = 0, $14 = 0, $143 = 0, $146 = 0, $149 = 0, $150 = 0, $157 = 0, $159 = 0, $16 = 0, $162 = 0, $164 = 0, $167 = 0, $169 = 0, $17 = 0, $172 = 0, $175 = 0, $176 = 0, $178 = 0, $179 = 0, $18 = 0, $181 = 0, $182 = 0, $184 = 0, $185 = 0, $19 = 0, $190 = 0, $191 = 0, $20 = 0, $204 = 0, $208 = 0, $214 = 0, $221 = 0, $225 = 0, $234 = 0, $235 = 0, $237 = 0, $238 = 0, $242 = 0, $243 = 0, $251 = 0, $252 = 0, $253 = 0, $255 = 0, $256 = 0, $261 = 0, $262 = 0, $265 = 0, $267 = 0, $27 = 0, $270 = 0, $275 = 0, $282 = 0, $292 = 0, $296 = 0, $30 = 0, $302 = 0, $306 = 0, $309 = 0, $313 = 0, $315 = 0, $316 = 0, $318 = 0, $320 = 0, $322 = 0, $324 = 0, $326 = 0, $328 = 0, $330 = 0, $34 = 0, $340 = 0, $341 = 0, $352 = 0, $354 = 0, $357 = 0, $359 = 0, $362 = 0, $364 = 0, $367 = 0, $37 = 0, $370 = 0, $371 = 0, $373 = 0, $374 = 0, $376 = 0, $377 = 0, $379 = 0, $380 = 0, $385 = 0, $386 = 0, $391 = 0, $399 = 0, $403 = 0, $409 = 0, $41 = 0, $416 = 0, $420 = 0, $428 = 0, $431 = 0, $432 = 0, $433 = 0, $437 = 0, $438 = 0, $44 = 0, $444 = 0, $449 = 0, $450 = 0, $453 = 0, $455 = 0, $458 = 0, $463 = 0, $469 = 0, $47 = 0, $471 = 0, $473 = 0, $475 = 0, $49 = 0, $492 = 0, $494 = 0, $50 = 0, $501 = 0, $502 = 0, $503 = 0, $512 = 0, $514 = 0, $515 = 0, $517 = 0, $52 = 0, $526 = 0, $530 = 0, $532 = 0, $533 = 0, $534 = 0, $54 = 0, $545 = 0, $546 = 0, $547 = 0, $548 = 0, $549 = 0, $550 = 0, $552 = 0, $554 = 0, $555 = 0, $56 = 0, $561 = 0, $563 = 0, $565 = 0, $570 = 0, $572 = 0, $574 = 0, $575 = 0, $576 = 0, $58 = 0, $584 = 0, $585 = 0, $588 = 0, $592 = 0, $595 = 0, $597 = 0, $6 = 0, $60 = 0, $603 = 0, $607 = 0, $611 = 0, $62 = 0, $620 = 0, $621 = 0, $627 = 0, $629 = 0, $633 = 0, $636 = 0, $638 = 0, $64 = 0, $642 = 0, $644 = 0, $649 = 0, $650 = 0, $651 = 0, $657 = 0, $658 = 0, $659 = 0, $663 = 0, $67 = 0, $673 = 0, $675 = 0, $680 = 0, $681 = 0, $682 = 0, $688 = 0, $69 = 0, $690 = 0, $694 = 0, $7 = 0, $70 = 0, $700 = 0, $704 = 0, $71 = 0, $710 = 0, $712 = 0, $718 = 0, $72 = 0, $722 = 0, $723 = 0, $728 = 0, $73 = 0, $734 = 0, $739 = 0, $742 = 0, $743 = 0, $746 = 0, $748 = 0, $750 = 0, $753 = 0, $764 = 0, $769 = 0, $77 = 0, $771 = 0, $774 = 0, $776 = 0, $779 = 0, $782 = 0, $783 = 0, $784 = 0, $786 = 0, $788 = 0, $789 = 0, $791 = 0, $792 = 0, $797 = 0, $798 = 0, $8 = 0, $80 = 0, $812 = 0, $815 = 0, $816 = 0, $822 = 0, $83 = 0, $830 = 0, $836 = 0, $839 = 0, $84 = 0, $840 = 0, $841 = 0, $845 = 0, $846 = 0, $852 = 0, $857 = 0, $858 = 0, $861 = 0, $863 = 0, $866 = 0, $87 = 0, $871 = 0, $877 = 0, $879 = 0, $881 = 0, $882 = 0, $9 = 0, $900 = 0, $902 = 0, $909 = 0, $910 = 0, $911 = 0, $919 = 0, $92 = 0, $923 = 0, $927 = 0, $929 = 0, $93 = 0, $935 = 0, $936 = 0, $938 = 0, $939 = 0, $940 = 0, $941 = 0, $943 = 0, $948 = 0, $949 = 0, $95 = 0, $950 = 0, $956 = 0, $958 = 0, $96 = 0, $964 = 0, $969 = 0, $972 = 0, $973 = 0, $974 = 0, $978 = 0, $979 = 0, $98 = 0, $985 = 0, $990 = 0, $991 = 0, $994 = 0, $996 = 0, $999 = 0, label = 0, sp = 0, $958$looptemp = 0;
 sp = STACKTOP; //@line 1545
 STACKTOP = STACKTOP + 16 | 0; //@line 1546
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 1546
 $1 = sp; //@line 1547
 do {
  if ($0 >>> 0 < 245) {
   $6 = $0 >>> 0 < 11 ? 16 : $0 + 11 & -8; //@line 1554
   $7 = $6 >>> 3; //@line 1555
   $8 = HEAP32[1007] | 0; //@line 1556
   $9 = $8 >>> $7; //@line 1557
   if ($9 & 3 | 0) {
    $14 = ($9 & 1 ^ 1) + $7 | 0; //@line 1563
    $16 = 4068 + ($14 << 1 << 2) | 0; //@line 1565
    $17 = $16 + 8 | 0; //@line 1566
    $18 = HEAP32[$17 >> 2] | 0; //@line 1567
    $19 = $18 + 8 | 0; //@line 1568
    $20 = HEAP32[$19 >> 2] | 0; //@line 1569
    do {
     if (($20 | 0) == ($16 | 0)) {
      HEAP32[1007] = $8 & ~(1 << $14); //@line 1576
     } else {
      if ((HEAP32[1011] | 0) >>> 0 > $20 >>> 0) {
       _abort(); //@line 1581
      }
      $27 = $20 + 12 | 0; //@line 1584
      if ((HEAP32[$27 >> 2] | 0) == ($18 | 0)) {
       HEAP32[$27 >> 2] = $16; //@line 1588
       HEAP32[$17 >> 2] = $20; //@line 1589
       break;
      } else {
       _abort(); //@line 1592
      }
     }
    } while (0);
    $30 = $14 << 3; //@line 1597
    HEAP32[$18 + 4 >> 2] = $30 | 3; //@line 1600
    $34 = $18 + $30 + 4 | 0; //@line 1602
    HEAP32[$34 >> 2] = HEAP32[$34 >> 2] | 1; //@line 1605
    $$0 = $19; //@line 1606
    STACKTOP = sp; //@line 1607
    return $$0 | 0; //@line 1607
   }
   $37 = HEAP32[1009] | 0; //@line 1609
   if ($6 >>> 0 > $37 >>> 0) {
    if ($9 | 0) {
     $41 = 2 << $7; //@line 1615
     $44 = $9 << $7 & ($41 | 0 - $41); //@line 1618
     $47 = ($44 & 0 - $44) + -1 | 0; //@line 1621
     $49 = $47 >>> 12 & 16; //@line 1623
     $50 = $47 >>> $49; //@line 1624
     $52 = $50 >>> 5 & 8; //@line 1626
     $54 = $50 >>> $52; //@line 1628
     $56 = $54 >>> 2 & 4; //@line 1630
     $58 = $54 >>> $56; //@line 1632
     $60 = $58 >>> 1 & 2; //@line 1634
     $62 = $58 >>> $60; //@line 1636
     $64 = $62 >>> 1 & 1; //@line 1638
     $67 = ($52 | $49 | $56 | $60 | $64) + ($62 >>> $64) | 0; //@line 1641
     $69 = 4068 + ($67 << 1 << 2) | 0; //@line 1643
     $70 = $69 + 8 | 0; //@line 1644
     $71 = HEAP32[$70 >> 2] | 0; //@line 1645
     $72 = $71 + 8 | 0; //@line 1646
     $73 = HEAP32[$72 >> 2] | 0; //@line 1647
     do {
      if (($73 | 0) == ($69 | 0)) {
       $77 = $8 & ~(1 << $67); //@line 1653
       HEAP32[1007] = $77; //@line 1654
       $98 = $77; //@line 1655
      } else {
       if ((HEAP32[1011] | 0) >>> 0 > $73 >>> 0) {
        _abort(); //@line 1660
       }
       $80 = $73 + 12 | 0; //@line 1663
       if ((HEAP32[$80 >> 2] | 0) == ($71 | 0)) {
        HEAP32[$80 >> 2] = $69; //@line 1667
        HEAP32[$70 >> 2] = $73; //@line 1668
        $98 = $8; //@line 1669
        break;
       } else {
        _abort(); //@line 1672
       }
      }
     } while (0);
     $83 = $67 << 3; //@line 1677
     $84 = $83 - $6 | 0; //@line 1678
     HEAP32[$71 + 4 >> 2] = $6 | 3; //@line 1681
     $87 = $71 + $6 | 0; //@line 1682
     HEAP32[$87 + 4 >> 2] = $84 | 1; //@line 1685
     HEAP32[$71 + $83 >> 2] = $84; //@line 1687
     if ($37 | 0) {
      $92 = HEAP32[1012] | 0; //@line 1690
      $93 = $37 >>> 3; //@line 1691
      $95 = 4068 + ($93 << 1 << 2) | 0; //@line 1693
      $96 = 1 << $93; //@line 1694
      if (!($98 & $96)) {
       HEAP32[1007] = $98 | $96; //@line 1699
       $$0199 = $95; //@line 1701
       $$pre$phiZ2D = $95 + 8 | 0; //@line 1701
      } else {
       $101 = $95 + 8 | 0; //@line 1703
       $102 = HEAP32[$101 >> 2] | 0; //@line 1704
       if ((HEAP32[1011] | 0) >>> 0 > $102 >>> 0) {
        _abort(); //@line 1708
       } else {
        $$0199 = $102; //@line 1711
        $$pre$phiZ2D = $101; //@line 1711
       }
      }
      HEAP32[$$pre$phiZ2D >> 2] = $92; //@line 1714
      HEAP32[$$0199 + 12 >> 2] = $92; //@line 1716
      HEAP32[$92 + 8 >> 2] = $$0199; //@line 1718
      HEAP32[$92 + 12 >> 2] = $95; //@line 1720
     }
     HEAP32[1009] = $84; //@line 1722
     HEAP32[1012] = $87; //@line 1723
     $$0 = $72; //@line 1724
     STACKTOP = sp; //@line 1725
     return $$0 | 0; //@line 1725
    }
    $108 = HEAP32[1008] | 0; //@line 1727
    if (!$108) {
     $$0197 = $6; //@line 1730
    } else {
     $112 = ($108 & 0 - $108) + -1 | 0; //@line 1734
     $114 = $112 >>> 12 & 16; //@line 1736
     $115 = $112 >>> $114; //@line 1737
     $117 = $115 >>> 5 & 8; //@line 1739
     $119 = $115 >>> $117; //@line 1741
     $121 = $119 >>> 2 & 4; //@line 1743
     $123 = $119 >>> $121; //@line 1745
     $125 = $123 >>> 1 & 2; //@line 1747
     $127 = $123 >>> $125; //@line 1749
     $129 = $127 >>> 1 & 1; //@line 1751
     $134 = HEAP32[4332 + (($117 | $114 | $121 | $125 | $129) + ($127 >>> $129) << 2) >> 2] | 0; //@line 1756
     $138 = (HEAP32[$134 + 4 >> 2] & -8) - $6 | 0; //@line 1760
     $143 = HEAP32[$134 + 16 + (((HEAP32[$134 + 16 >> 2] | 0) == 0 & 1) << 2) >> 2] | 0; //@line 1766
     if (!$143) {
      $$0192$lcssa$i = $134; //@line 1769
      $$0193$lcssa$i = $138; //@line 1769
     } else {
      $$01926$i = $134; //@line 1771
      $$01935$i = $138; //@line 1771
      $146 = $143; //@line 1771
      while (1) {
       $149 = (HEAP32[$146 + 4 >> 2] & -8) - $6 | 0; //@line 1776
       $150 = $149 >>> 0 < $$01935$i >>> 0; //@line 1777
       $$$0193$i = $150 ? $149 : $$01935$i; //@line 1778
       $$$0192$i = $150 ? $146 : $$01926$i; //@line 1779
       $146 = HEAP32[$146 + 16 + (((HEAP32[$146 + 16 >> 2] | 0) == 0 & 1) << 2) >> 2] | 0; //@line 1785
       if (!$146) {
        $$0192$lcssa$i = $$$0192$i; //@line 1788
        $$0193$lcssa$i = $$$0193$i; //@line 1788
        break;
       } else {
        $$01926$i = $$$0192$i; //@line 1791
        $$01935$i = $$$0193$i; //@line 1791
       }
      }
     }
     $157 = HEAP32[1011] | 0; //@line 1795
     if ($157 >>> 0 > $$0192$lcssa$i >>> 0) {
      _abort(); //@line 1798
     }
     $159 = $$0192$lcssa$i + $6 | 0; //@line 1801
     if ($159 >>> 0 <= $$0192$lcssa$i >>> 0) {
      _abort(); //@line 1804
     }
     $162 = HEAP32[$$0192$lcssa$i + 24 >> 2] | 0; //@line 1808
     $164 = HEAP32[$$0192$lcssa$i + 12 >> 2] | 0; //@line 1810
     do {
      if (($164 | 0) == ($$0192$lcssa$i | 0)) {
       $175 = $$0192$lcssa$i + 20 | 0; //@line 1814
       $176 = HEAP32[$175 >> 2] | 0; //@line 1815
       if (!$176) {
        $178 = $$0192$lcssa$i + 16 | 0; //@line 1818
        $179 = HEAP32[$178 >> 2] | 0; //@line 1819
        if (!$179) {
         $$3$i = 0; //@line 1822
         break;
        } else {
         $$1196$i = $179; //@line 1825
         $$1198$i = $178; //@line 1825
        }
       } else {
        $$1196$i = $176; //@line 1828
        $$1198$i = $175; //@line 1828
       }
       while (1) {
        $181 = $$1196$i + 20 | 0; //@line 1831
        $182 = HEAP32[$181 >> 2] | 0; //@line 1832
        if ($182 | 0) {
         $$1196$i = $182; //@line 1835
         $$1198$i = $181; //@line 1835
         continue;
        }
        $184 = $$1196$i + 16 | 0; //@line 1838
        $185 = HEAP32[$184 >> 2] | 0; //@line 1839
        if (!$185) {
         break;
        } else {
         $$1196$i = $185; //@line 1844
         $$1198$i = $184; //@line 1844
        }
       }
       if ($157 >>> 0 > $$1198$i >>> 0) {
        _abort(); //@line 1849
       } else {
        HEAP32[$$1198$i >> 2] = 0; //@line 1852
        $$3$i = $$1196$i; //@line 1853
        break;
       }
      } else {
       $167 = HEAP32[$$0192$lcssa$i + 8 >> 2] | 0; //@line 1858
       if ($157 >>> 0 > $167 >>> 0) {
        _abort(); //@line 1861
       }
       $169 = $167 + 12 | 0; //@line 1864
       if ((HEAP32[$169 >> 2] | 0) != ($$0192$lcssa$i | 0)) {
        _abort(); //@line 1868
       }
       $172 = $164 + 8 | 0; //@line 1871
       if ((HEAP32[$172 >> 2] | 0) == ($$0192$lcssa$i | 0)) {
        HEAP32[$169 >> 2] = $164; //@line 1875
        HEAP32[$172 >> 2] = $167; //@line 1876
        $$3$i = $164; //@line 1877
        break;
       } else {
        _abort(); //@line 1880
       }
      }
     } while (0);
     L73 : do {
      if ($162 | 0) {
       $190 = HEAP32[$$0192$lcssa$i + 28 >> 2] | 0; //@line 1889
       $191 = 4332 + ($190 << 2) | 0; //@line 1890
       do {
        if (($$0192$lcssa$i | 0) == (HEAP32[$191 >> 2] | 0)) {
         HEAP32[$191 >> 2] = $$3$i; //@line 1895
         if (!$$3$i) {
          HEAP32[1008] = $108 & ~(1 << $190); //@line 1901
          break L73;
         }
        } else {
         if ((HEAP32[1011] | 0) >>> 0 > $162 >>> 0) {
          _abort(); //@line 1908
         } else {
          HEAP32[$162 + 16 + (((HEAP32[$162 + 16 >> 2] | 0) != ($$0192$lcssa$i | 0) & 1) << 2) >> 2] = $$3$i; //@line 1916
          if (!$$3$i) {
           break L73;
          } else {
           break;
          }
         }
        }
       } while (0);
       $204 = HEAP32[1011] | 0; //@line 1926
       if ($204 >>> 0 > $$3$i >>> 0) {
        _abort(); //@line 1929
       }
       HEAP32[$$3$i + 24 >> 2] = $162; //@line 1933
       $208 = HEAP32[$$0192$lcssa$i + 16 >> 2] | 0; //@line 1935
       do {
        if ($208 | 0) {
         if ($204 >>> 0 > $208 >>> 0) {
          _abort(); //@line 1941
         } else {
          HEAP32[$$3$i + 16 >> 2] = $208; //@line 1945
          HEAP32[$208 + 24 >> 2] = $$3$i; //@line 1947
          break;
         }
        }
       } while (0);
       $214 = HEAP32[$$0192$lcssa$i + 20 >> 2] | 0; //@line 1953
       if ($214 | 0) {
        if ((HEAP32[1011] | 0) >>> 0 > $214 >>> 0) {
         _abort(); //@line 1959
        } else {
         HEAP32[$$3$i + 20 >> 2] = $214; //@line 1963
         HEAP32[$214 + 24 >> 2] = $$3$i; //@line 1965
         break;
        }
       }
      }
     } while (0);
     if ($$0193$lcssa$i >>> 0 < 16) {
      $221 = $$0193$lcssa$i + $6 | 0; //@line 1973
      HEAP32[$$0192$lcssa$i + 4 >> 2] = $221 | 3; //@line 1976
      $225 = $$0192$lcssa$i + $221 + 4 | 0; //@line 1978
      HEAP32[$225 >> 2] = HEAP32[$225 >> 2] | 1; //@line 1981
     } else {
      HEAP32[$$0192$lcssa$i + 4 >> 2] = $6 | 3; //@line 1985
      HEAP32[$159 + 4 >> 2] = $$0193$lcssa$i | 1; //@line 1988
      HEAP32[$159 + $$0193$lcssa$i >> 2] = $$0193$lcssa$i; //@line 1990
      if ($37 | 0) {
       $234 = HEAP32[1012] | 0; //@line 1993
       $235 = $37 >>> 3; //@line 1994
       $237 = 4068 + ($235 << 1 << 2) | 0; //@line 1996
       $238 = 1 << $235; //@line 1997
       if (!($8 & $238)) {
        HEAP32[1007] = $8 | $238; //@line 2002
        $$0189$i = $237; //@line 2004
        $$pre$phi$iZ2D = $237 + 8 | 0; //@line 2004
       } else {
        $242 = $237 + 8 | 0; //@line 2006
        $243 = HEAP32[$242 >> 2] | 0; //@line 2007
        if ((HEAP32[1011] | 0) >>> 0 > $243 >>> 0) {
         _abort(); //@line 2011
        } else {
         $$0189$i = $243; //@line 2014
         $$pre$phi$iZ2D = $242; //@line 2014
        }
       }
       HEAP32[$$pre$phi$iZ2D >> 2] = $234; //@line 2017
       HEAP32[$$0189$i + 12 >> 2] = $234; //@line 2019
       HEAP32[$234 + 8 >> 2] = $$0189$i; //@line 2021
       HEAP32[$234 + 12 >> 2] = $237; //@line 2023
      }
      HEAP32[1009] = $$0193$lcssa$i; //@line 2025
      HEAP32[1012] = $159; //@line 2026
     }
     $$0 = $$0192$lcssa$i + 8 | 0; //@line 2029
     STACKTOP = sp; //@line 2030
     return $$0 | 0; //@line 2030
    }
   } else {
    $$0197 = $6; //@line 2033
   }
  } else {
   if ($0 >>> 0 > 4294967231) {
    $$0197 = -1; //@line 2038
   } else {
    $251 = $0 + 11 | 0; //@line 2040
    $252 = $251 & -8; //@line 2041
    $253 = HEAP32[1008] | 0; //@line 2042
    if (!$253) {
     $$0197 = $252; //@line 2045
    } else {
     $255 = 0 - $252 | 0; //@line 2047
     $256 = $251 >>> 8; //@line 2048
     if (!$256) {
      $$0358$i = 0; //@line 2051
     } else {
      if ($252 >>> 0 > 16777215) {
       $$0358$i = 31; //@line 2055
      } else {
       $261 = ($256 + 1048320 | 0) >>> 16 & 8; //@line 2059
       $262 = $256 << $261; //@line 2060
       $265 = ($262 + 520192 | 0) >>> 16 & 4; //@line 2063
       $267 = $262 << $265; //@line 2065
       $270 = ($267 + 245760 | 0) >>> 16 & 2; //@line 2068
       $275 = 14 - ($265 | $261 | $270) + ($267 << $270 >>> 15) | 0; //@line 2073
       $$0358$i = $252 >>> ($275 + 7 | 0) & 1 | $275 << 1; //@line 2079
      }
     }
     $282 = HEAP32[4332 + ($$0358$i << 2) >> 2] | 0; //@line 2083
     L117 : do {
      if (!$282) {
       $$2355$i = 0; //@line 2087
       $$3$i203 = 0; //@line 2087
       $$3350$i = $255; //@line 2087
       label = 81; //@line 2088
      } else {
       $$0342$i = 0; //@line 2095
       $$0347$i = $255; //@line 2095
       $$0353$i = $282; //@line 2095
       $$0359$i = $252 << (($$0358$i | 0) == 31 ? 0 : 25 - ($$0358$i >>> 1) | 0); //@line 2095
       $$0362$i = 0; //@line 2095
       while (1) {
        $292 = (HEAP32[$$0353$i + 4 >> 2] & -8) - $252 | 0; //@line 2100
        if ($292 >>> 0 < $$0347$i >>> 0) {
         if (!$292) {
          $$414$i = $$0353$i; //@line 2105
          $$435113$i = 0; //@line 2105
          $$435712$i = $$0353$i; //@line 2105
          label = 85; //@line 2106
          break L117;
         } else {
          $$1343$i = $$0353$i; //@line 2109
          $$1348$i = $292; //@line 2109
         }
        } else {
         $$1343$i = $$0342$i; //@line 2112
         $$1348$i = $$0347$i; //@line 2112
        }
        $296 = HEAP32[$$0353$i + 20 >> 2] | 0; //@line 2115
        $$0353$i = HEAP32[$$0353$i + 16 + ($$0359$i >>> 31 << 2) >> 2] | 0; //@line 2118
        $$1363$i = ($296 | 0) == 0 | ($296 | 0) == ($$0353$i | 0) ? $$0362$i : $296; //@line 2122
        $302 = ($$0353$i | 0) == 0; //@line 2123
        if ($302) {
         $$2355$i = $$1363$i; //@line 2128
         $$3$i203 = $$1343$i; //@line 2128
         $$3350$i = $$1348$i; //@line 2128
         label = 81; //@line 2129
         break;
        } else {
         $$0342$i = $$1343$i; //@line 2132
         $$0347$i = $$1348$i; //@line 2132
         $$0359$i = $$0359$i << (($302 ^ 1) & 1); //@line 2132
         $$0362$i = $$1363$i; //@line 2132
        }
       }
      }
     } while (0);
     if ((label | 0) == 81) {
      if (($$2355$i | 0) == 0 & ($$3$i203 | 0) == 0) {
       $306 = 2 << $$0358$i; //@line 2142
       $309 = $253 & ($306 | 0 - $306); //@line 2145
       if (!$309) {
        $$0197 = $252; //@line 2148
        break;
       }
       $313 = ($309 & 0 - $309) + -1 | 0; //@line 2153
       $315 = $313 >>> 12 & 16; //@line 2155
       $316 = $313 >>> $315; //@line 2156
       $318 = $316 >>> 5 & 8; //@line 2158
       $320 = $316 >>> $318; //@line 2160
       $322 = $320 >>> 2 & 4; //@line 2162
       $324 = $320 >>> $322; //@line 2164
       $326 = $324 >>> 1 & 2; //@line 2166
       $328 = $324 >>> $326; //@line 2168
       $330 = $328 >>> 1 & 1; //@line 2170
       $$4$ph$i = 0; //@line 2176
       $$4357$ph$i = HEAP32[4332 + (($318 | $315 | $322 | $326 | $330) + ($328 >>> $330) << 2) >> 2] | 0; //@line 2176
      } else {
       $$4$ph$i = $$3$i203; //@line 2178
       $$4357$ph$i = $$2355$i; //@line 2178
      }
      if (!$$4357$ph$i) {
       $$4$lcssa$i = $$4$ph$i; //@line 2182
       $$4351$lcssa$i = $$3350$i; //@line 2182
      } else {
       $$414$i = $$4$ph$i; //@line 2184
       $$435113$i = $$3350$i; //@line 2184
       $$435712$i = $$4357$ph$i; //@line 2184
       label = 85; //@line 2185
      }
     }
     if ((label | 0) == 85) {
      while (1) {
       label = 0; //@line 2190
       $340 = (HEAP32[$$435712$i + 4 >> 2] & -8) - $252 | 0; //@line 2194
       $341 = $340 >>> 0 < $$435113$i >>> 0; //@line 2195
       $$$4351$i = $341 ? $340 : $$435113$i; //@line 2196
       $$4357$$4$i = $341 ? $$435712$i : $$414$i; //@line 2197
       $$435712$i = HEAP32[$$435712$i + 16 + (((HEAP32[$$435712$i + 16 >> 2] | 0) == 0 & 1) << 2) >> 2] | 0; //@line 2203
       if (!$$435712$i) {
        $$4$lcssa$i = $$4357$$4$i; //@line 2206
        $$4351$lcssa$i = $$$4351$i; //@line 2206
        break;
       } else {
        $$414$i = $$4357$$4$i; //@line 2209
        $$435113$i = $$$4351$i; //@line 2209
        label = 85; //@line 2210
       }
      }
     }
     if (!$$4$lcssa$i) {
      $$0197 = $252; //@line 2216
     } else {
      if ($$4351$lcssa$i >>> 0 < ((HEAP32[1009] | 0) - $252 | 0) >>> 0) {
       $352 = HEAP32[1011] | 0; //@line 2222
       if ($352 >>> 0 > $$4$lcssa$i >>> 0) {
        _abort(); //@line 2225
       }
       $354 = $$4$lcssa$i + $252 | 0; //@line 2228
       if ($354 >>> 0 <= $$4$lcssa$i >>> 0) {
        _abort(); //@line 2231
       }
       $357 = HEAP32[$$4$lcssa$i + 24 >> 2] | 0; //@line 2235
       $359 = HEAP32[$$4$lcssa$i + 12 >> 2] | 0; //@line 2237
       do {
        if (($359 | 0) == ($$4$lcssa$i | 0)) {
         $370 = $$4$lcssa$i + 20 | 0; //@line 2241
         $371 = HEAP32[$370 >> 2] | 0; //@line 2242
         if (!$371) {
          $373 = $$4$lcssa$i + 16 | 0; //@line 2245
          $374 = HEAP32[$373 >> 2] | 0; //@line 2246
          if (!$374) {
           $$3372$i = 0; //@line 2249
           break;
          } else {
           $$1370$i = $374; //@line 2252
           $$1374$i = $373; //@line 2252
          }
         } else {
          $$1370$i = $371; //@line 2255
          $$1374$i = $370; //@line 2255
         }
         while (1) {
          $376 = $$1370$i + 20 | 0; //@line 2258
          $377 = HEAP32[$376 >> 2] | 0; //@line 2259
          if ($377 | 0) {
           $$1370$i = $377; //@line 2262
           $$1374$i = $376; //@line 2262
           continue;
          }
          $379 = $$1370$i + 16 | 0; //@line 2265
          $380 = HEAP32[$379 >> 2] | 0; //@line 2266
          if (!$380) {
           break;
          } else {
           $$1370$i = $380; //@line 2271
           $$1374$i = $379; //@line 2271
          }
         }
         if ($352 >>> 0 > $$1374$i >>> 0) {
          _abort(); //@line 2276
         } else {
          HEAP32[$$1374$i >> 2] = 0; //@line 2279
          $$3372$i = $$1370$i; //@line 2280
          break;
         }
        } else {
         $362 = HEAP32[$$4$lcssa$i + 8 >> 2] | 0; //@line 2285
         if ($352 >>> 0 > $362 >>> 0) {
          _abort(); //@line 2288
         }
         $364 = $362 + 12 | 0; //@line 2291
         if ((HEAP32[$364 >> 2] | 0) != ($$4$lcssa$i | 0)) {
          _abort(); //@line 2295
         }
         $367 = $359 + 8 | 0; //@line 2298
         if ((HEAP32[$367 >> 2] | 0) == ($$4$lcssa$i | 0)) {
          HEAP32[$364 >> 2] = $359; //@line 2302
          HEAP32[$367 >> 2] = $362; //@line 2303
          $$3372$i = $359; //@line 2304
          break;
         } else {
          _abort(); //@line 2307
         }
        }
       } while (0);
       L164 : do {
        if (!$357) {
         $475 = $253; //@line 2315
        } else {
         $385 = HEAP32[$$4$lcssa$i + 28 >> 2] | 0; //@line 2318
         $386 = 4332 + ($385 << 2) | 0; //@line 2319
         do {
          if (($$4$lcssa$i | 0) == (HEAP32[$386 >> 2] | 0)) {
           HEAP32[$386 >> 2] = $$3372$i; //@line 2324
           if (!$$3372$i) {
            $391 = $253 & ~(1 << $385); //@line 2329
            HEAP32[1008] = $391; //@line 2330
            $475 = $391; //@line 2331
            break L164;
           }
          } else {
           if ((HEAP32[1011] | 0) >>> 0 > $357 >>> 0) {
            _abort(); //@line 2338
           } else {
            HEAP32[$357 + 16 + (((HEAP32[$357 + 16 >> 2] | 0) != ($$4$lcssa$i | 0) & 1) << 2) >> 2] = $$3372$i; //@line 2346
            if (!$$3372$i) {
             $475 = $253; //@line 2349
             break L164;
            } else {
             break;
            }
           }
          }
         } while (0);
         $399 = HEAP32[1011] | 0; //@line 2357
         if ($399 >>> 0 > $$3372$i >>> 0) {
          _abort(); //@line 2360
         }
         HEAP32[$$3372$i + 24 >> 2] = $357; //@line 2364
         $403 = HEAP32[$$4$lcssa$i + 16 >> 2] | 0; //@line 2366
         do {
          if ($403 | 0) {
           if ($399 >>> 0 > $403 >>> 0) {
            _abort(); //@line 2372
           } else {
            HEAP32[$$3372$i + 16 >> 2] = $403; //@line 2376
            HEAP32[$403 + 24 >> 2] = $$3372$i; //@line 2378
            break;
           }
          }
         } while (0);
         $409 = HEAP32[$$4$lcssa$i + 20 >> 2] | 0; //@line 2384
         if (!$409) {
          $475 = $253; //@line 2387
         } else {
          if ((HEAP32[1011] | 0) >>> 0 > $409 >>> 0) {
           _abort(); //@line 2392
          } else {
           HEAP32[$$3372$i + 20 >> 2] = $409; //@line 2396
           HEAP32[$409 + 24 >> 2] = $$3372$i; //@line 2398
           $475 = $253; //@line 2399
           break;
          }
         }
        }
       } while (0);
       do {
        if ($$4351$lcssa$i >>> 0 < 16) {
         $416 = $$4351$lcssa$i + $252 | 0; //@line 2408
         HEAP32[$$4$lcssa$i + 4 >> 2] = $416 | 3; //@line 2411
         $420 = $$4$lcssa$i + $416 + 4 | 0; //@line 2413
         HEAP32[$420 >> 2] = HEAP32[$420 >> 2] | 1; //@line 2416
        } else {
         HEAP32[$$4$lcssa$i + 4 >> 2] = $252 | 3; //@line 2420
         HEAP32[$354 + 4 >> 2] = $$4351$lcssa$i | 1; //@line 2423
         HEAP32[$354 + $$4351$lcssa$i >> 2] = $$4351$lcssa$i; //@line 2425
         $428 = $$4351$lcssa$i >>> 3; //@line 2426
         if ($$4351$lcssa$i >>> 0 < 256) {
          $431 = 4068 + ($428 << 1 << 2) | 0; //@line 2430
          $432 = HEAP32[1007] | 0; //@line 2431
          $433 = 1 << $428; //@line 2432
          if (!($432 & $433)) {
           HEAP32[1007] = $432 | $433; //@line 2437
           $$0368$i = $431; //@line 2439
           $$pre$phi$i211Z2D = $431 + 8 | 0; //@line 2439
          } else {
           $437 = $431 + 8 | 0; //@line 2441
           $438 = HEAP32[$437 >> 2] | 0; //@line 2442
           if ((HEAP32[1011] | 0) >>> 0 > $438 >>> 0) {
            _abort(); //@line 2446
           } else {
            $$0368$i = $438; //@line 2449
            $$pre$phi$i211Z2D = $437; //@line 2449
           }
          }
          HEAP32[$$pre$phi$i211Z2D >> 2] = $354; //@line 2452
          HEAP32[$$0368$i + 12 >> 2] = $354; //@line 2454
          HEAP32[$354 + 8 >> 2] = $$0368$i; //@line 2456
          HEAP32[$354 + 12 >> 2] = $431; //@line 2458
          break;
         }
         $444 = $$4351$lcssa$i >>> 8; //@line 2461
         if (!$444) {
          $$0361$i = 0; //@line 2464
         } else {
          if ($$4351$lcssa$i >>> 0 > 16777215) {
           $$0361$i = 31; //@line 2468
          } else {
           $449 = ($444 + 1048320 | 0) >>> 16 & 8; //@line 2472
           $450 = $444 << $449; //@line 2473
           $453 = ($450 + 520192 | 0) >>> 16 & 4; //@line 2476
           $455 = $450 << $453; //@line 2478
           $458 = ($455 + 245760 | 0) >>> 16 & 2; //@line 2481
           $463 = 14 - ($453 | $449 | $458) + ($455 << $458 >>> 15) | 0; //@line 2486
           $$0361$i = $$4351$lcssa$i >>> ($463 + 7 | 0) & 1 | $463 << 1; //@line 2492
          }
         }
         $469 = 4332 + ($$0361$i << 2) | 0; //@line 2495
         HEAP32[$354 + 28 >> 2] = $$0361$i; //@line 2497
         $471 = $354 + 16 | 0; //@line 2498
         HEAP32[$471 + 4 >> 2] = 0; //@line 2500
         HEAP32[$471 >> 2] = 0; //@line 2501
         $473 = 1 << $$0361$i; //@line 2502
         if (!($475 & $473)) {
          HEAP32[1008] = $475 | $473; //@line 2507
          HEAP32[$469 >> 2] = $354; //@line 2508
          HEAP32[$354 + 24 >> 2] = $469; //@line 2510
          HEAP32[$354 + 12 >> 2] = $354; //@line 2512
          HEAP32[$354 + 8 >> 2] = $354; //@line 2514
          break;
         }
         $$0344$i = $$4351$lcssa$i << (($$0361$i | 0) == 31 ? 0 : 25 - ($$0361$i >>> 1) | 0); //@line 2523
         $$0345$i = HEAP32[$469 >> 2] | 0; //@line 2523
         while (1) {
          if ((HEAP32[$$0345$i + 4 >> 2] & -8 | 0) == ($$4351$lcssa$i | 0)) {
           label = 139; //@line 2530
           break;
          }
          $492 = $$0345$i + 16 + ($$0344$i >>> 31 << 2) | 0; //@line 2534
          $494 = HEAP32[$492 >> 2] | 0; //@line 2536
          if (!$494) {
           label = 136; //@line 2539
           break;
          } else {
           $$0344$i = $$0344$i << 1; //@line 2542
           $$0345$i = $494; //@line 2542
          }
         }
         if ((label | 0) == 136) {
          if ((HEAP32[1011] | 0) >>> 0 > $492 >>> 0) {
           _abort(); //@line 2549
          } else {
           HEAP32[$492 >> 2] = $354; //@line 2552
           HEAP32[$354 + 24 >> 2] = $$0345$i; //@line 2554
           HEAP32[$354 + 12 >> 2] = $354; //@line 2556
           HEAP32[$354 + 8 >> 2] = $354; //@line 2558
           break;
          }
         } else if ((label | 0) == 139) {
          $501 = $$0345$i + 8 | 0; //@line 2563
          $502 = HEAP32[$501 >> 2] | 0; //@line 2564
          $503 = HEAP32[1011] | 0; //@line 2565
          if ($503 >>> 0 <= $502 >>> 0 & $503 >>> 0 <= $$0345$i >>> 0) {
           HEAP32[$502 + 12 >> 2] = $354; //@line 2571
           HEAP32[$501 >> 2] = $354; //@line 2572
           HEAP32[$354 + 8 >> 2] = $502; //@line 2574
           HEAP32[$354 + 12 >> 2] = $$0345$i; //@line 2576
           HEAP32[$354 + 24 >> 2] = 0; //@line 2578
           break;
          } else {
           _abort(); //@line 2581
          }
         }
        }
       } while (0);
       $$0 = $$4$lcssa$i + 8 | 0; //@line 2588
       STACKTOP = sp; //@line 2589
       return $$0 | 0; //@line 2589
      } else {
       $$0197 = $252; //@line 2591
      }
     }
    }
   }
  }
 } while (0);
 $512 = HEAP32[1009] | 0; //@line 2598
 if ($512 >>> 0 >= $$0197 >>> 0) {
  $514 = $512 - $$0197 | 0; //@line 2601
  $515 = HEAP32[1012] | 0; //@line 2602
  if ($514 >>> 0 > 15) {
   $517 = $515 + $$0197 | 0; //@line 2605
   HEAP32[1012] = $517; //@line 2606
   HEAP32[1009] = $514; //@line 2607
   HEAP32[$517 + 4 >> 2] = $514 | 1; //@line 2610
   HEAP32[$515 + $512 >> 2] = $514; //@line 2612
   HEAP32[$515 + 4 >> 2] = $$0197 | 3; //@line 2615
  } else {
   HEAP32[1009] = 0; //@line 2617
   HEAP32[1012] = 0; //@line 2618
   HEAP32[$515 + 4 >> 2] = $512 | 3; //@line 2621
   $526 = $515 + $512 + 4 | 0; //@line 2623
   HEAP32[$526 >> 2] = HEAP32[$526 >> 2] | 1; //@line 2626
  }
  $$0 = $515 + 8 | 0; //@line 2629
  STACKTOP = sp; //@line 2630
  return $$0 | 0; //@line 2630
 }
 $530 = HEAP32[1010] | 0; //@line 2632
 if ($530 >>> 0 > $$0197 >>> 0) {
  $532 = $530 - $$0197 | 0; //@line 2635
  HEAP32[1010] = $532; //@line 2636
  $533 = HEAP32[1013] | 0; //@line 2637
  $534 = $533 + $$0197 | 0; //@line 2638
  HEAP32[1013] = $534; //@line 2639
  HEAP32[$534 + 4 >> 2] = $532 | 1; //@line 2642
  HEAP32[$533 + 4 >> 2] = $$0197 | 3; //@line 2645
  $$0 = $533 + 8 | 0; //@line 2647
  STACKTOP = sp; //@line 2648
  return $$0 | 0; //@line 2648
 }
 if (!(HEAP32[1125] | 0)) {
  HEAP32[1127] = 4096; //@line 2653
  HEAP32[1126] = 4096; //@line 2654
  HEAP32[1128] = -1; //@line 2655
  HEAP32[1129] = -1; //@line 2656
  HEAP32[1130] = 0; //@line 2657
  HEAP32[1118] = 0; //@line 2658
  HEAP32[1125] = $1 & -16 ^ 1431655768; //@line 2662
  $548 = 4096; //@line 2663
 } else {
  $548 = HEAP32[1127] | 0; //@line 2666
 }
 $545 = $$0197 + 48 | 0; //@line 2668
 $546 = $$0197 + 47 | 0; //@line 2669
 $547 = $548 + $546 | 0; //@line 2670
 $549 = 0 - $548 | 0; //@line 2671
 $550 = $547 & $549; //@line 2672
 if ($550 >>> 0 <= $$0197 >>> 0) {
  $$0 = 0; //@line 2675
  STACKTOP = sp; //@line 2676
  return $$0 | 0; //@line 2676
 }
 $552 = HEAP32[1117] | 0; //@line 2678
 if ($552 | 0) {
  $554 = HEAP32[1115] | 0; //@line 2681
  $555 = $554 + $550 | 0; //@line 2682
  if ($555 >>> 0 <= $554 >>> 0 | $555 >>> 0 > $552 >>> 0) {
   $$0 = 0; //@line 2687
   STACKTOP = sp; //@line 2688
   return $$0 | 0; //@line 2688
  }
 }
 L244 : do {
  if (!(HEAP32[1118] & 4)) {
   $561 = HEAP32[1013] | 0; //@line 2696
   L246 : do {
    if (!$561) {
     label = 163; //@line 2700
    } else {
     $$0$i$i = 4476; //@line 2702
     while (1) {
      $563 = HEAP32[$$0$i$i >> 2] | 0; //@line 2704
      if ($563 >>> 0 <= $561 >>> 0) {
       $565 = $$0$i$i + 4 | 0; //@line 2707
       if (($563 + (HEAP32[$565 >> 2] | 0) | 0) >>> 0 > $561 >>> 0) {
        break;
       }
      }
      $570 = HEAP32[$$0$i$i + 8 >> 2] | 0; //@line 2716
      if (!$570) {
       label = 163; //@line 2719
       break L246;
      } else {
       $$0$i$i = $570; //@line 2722
      }
     }
     $595 = $547 - $530 & $549; //@line 2726
     if ($595 >>> 0 < 2147483647) {
      $597 = _sbrk($595 | 0) | 0; //@line 2729
      if (($597 | 0) == ((HEAP32[$$0$i$i >> 2] | 0) + (HEAP32[$565 >> 2] | 0) | 0)) {
       if (($597 | 0) == (-1 | 0)) {
        $$2234243136$i = $595; //@line 2737
       } else {
        $$723947$i = $595; //@line 2739
        $$748$i = $597; //@line 2739
        label = 180; //@line 2740
        break L244;
       }
      } else {
       $$2247$ph$i = $597; //@line 2744
       $$2253$ph$i = $595; //@line 2744
       label = 171; //@line 2745
      }
     } else {
      $$2234243136$i = 0; //@line 2748
     }
    }
   } while (0);
   do {
    if ((label | 0) == 163) {
     $572 = _sbrk(0) | 0; //@line 2754
     if (($572 | 0) == (-1 | 0)) {
      $$2234243136$i = 0; //@line 2757
     } else {
      $574 = $572; //@line 2759
      $575 = HEAP32[1126] | 0; //@line 2760
      $576 = $575 + -1 | 0; //@line 2761
      $$$i = (($576 & $574 | 0) == 0 ? 0 : ($576 + $574 & 0 - $575) - $574 | 0) + $550 | 0; //@line 2769
      $584 = HEAP32[1115] | 0; //@line 2770
      $585 = $$$i + $584 | 0; //@line 2771
      if ($$$i >>> 0 > $$0197 >>> 0 & $$$i >>> 0 < 2147483647) {
       $588 = HEAP32[1117] | 0; //@line 2776
       if ($588 | 0) {
        if ($585 >>> 0 <= $584 >>> 0 | $585 >>> 0 > $588 >>> 0) {
         $$2234243136$i = 0; //@line 2783
         break;
        }
       }
       $592 = _sbrk($$$i | 0) | 0; //@line 2787
       if (($592 | 0) == ($572 | 0)) {
        $$723947$i = $$$i; //@line 2790
        $$748$i = $572; //@line 2790
        label = 180; //@line 2791
        break L244;
       } else {
        $$2247$ph$i = $592; //@line 2794
        $$2253$ph$i = $$$i; //@line 2794
        label = 171; //@line 2795
       }
      } else {
       $$2234243136$i = 0; //@line 2798
      }
     }
    }
   } while (0);
   do {
    if ((label | 0) == 171) {
     $603 = 0 - $$2253$ph$i | 0; //@line 2805
     if (!($545 >>> 0 > $$2253$ph$i >>> 0 & ($$2253$ph$i >>> 0 < 2147483647 & ($$2247$ph$i | 0) != (-1 | 0)))) {
      if (($$2247$ph$i | 0) == (-1 | 0)) {
       $$2234243136$i = 0; //@line 2814
       break;
      } else {
       $$723947$i = $$2253$ph$i; //@line 2817
       $$748$i = $$2247$ph$i; //@line 2817
       label = 180; //@line 2818
       break L244;
      }
     }
     $607 = HEAP32[1127] | 0; //@line 2822
     $611 = $546 - $$2253$ph$i + $607 & 0 - $607; //@line 2826
     if ($611 >>> 0 >= 2147483647) {
      $$723947$i = $$2253$ph$i; //@line 2829
      $$748$i = $$2247$ph$i; //@line 2829
      label = 180; //@line 2830
      break L244;
     }
     if ((_sbrk($611 | 0) | 0) == (-1 | 0)) {
      _sbrk($603 | 0) | 0; //@line 2836
      $$2234243136$i = 0; //@line 2837
      break;
     } else {
      $$723947$i = $611 + $$2253$ph$i | 0; //@line 2841
      $$748$i = $$2247$ph$i; //@line 2841
      label = 180; //@line 2842
      break L244;
     }
    }
   } while (0);
   HEAP32[1118] = HEAP32[1118] | 4; //@line 2849
   $$4236$i = $$2234243136$i; //@line 2850
   label = 178; //@line 2851
  } else {
   $$4236$i = 0; //@line 2853
   label = 178; //@line 2854
  }
 } while (0);
 if ((label | 0) == 178) {
  if ($550 >>> 0 < 2147483647) {
   $620 = _sbrk($550 | 0) | 0; //@line 2860
   $621 = _sbrk(0) | 0; //@line 2861
   $627 = $621 - $620 | 0; //@line 2869
   $629 = $627 >>> 0 > ($$0197 + 40 | 0) >>> 0; //@line 2871
   if (!(($620 | 0) == (-1 | 0) | $629 ^ 1 | $620 >>> 0 < $621 >>> 0 & (($620 | 0) != (-1 | 0) & ($621 | 0) != (-1 | 0)) ^ 1)) {
    $$723947$i = $629 ? $627 : $$4236$i; //@line 2879
    $$748$i = $620; //@line 2879
    label = 180; //@line 2880
   }
  }
 }
 if ((label | 0) == 180) {
  $633 = (HEAP32[1115] | 0) + $$723947$i | 0; //@line 2886
  HEAP32[1115] = $633; //@line 2887
  if ($633 >>> 0 > (HEAP32[1116] | 0) >>> 0) {
   HEAP32[1116] = $633; //@line 2891
  }
  $636 = HEAP32[1013] | 0; //@line 2893
  do {
   if (!$636) {
    $638 = HEAP32[1011] | 0; //@line 2897
    if (($638 | 0) == 0 | $$748$i >>> 0 < $638 >>> 0) {
     HEAP32[1011] = $$748$i; //@line 2902
    }
    HEAP32[1119] = $$748$i; //@line 2904
    HEAP32[1120] = $$723947$i; //@line 2905
    HEAP32[1122] = 0; //@line 2906
    HEAP32[1016] = HEAP32[1125]; //@line 2908
    HEAP32[1015] = -1; //@line 2909
    HEAP32[1020] = 4068; //@line 2910
    HEAP32[1019] = 4068; //@line 2911
    HEAP32[1022] = 4076; //@line 2912
    HEAP32[1021] = 4076; //@line 2913
    HEAP32[1024] = 4084; //@line 2914
    HEAP32[1023] = 4084; //@line 2915
    HEAP32[1026] = 4092; //@line 2916
    HEAP32[1025] = 4092; //@line 2917
    HEAP32[1028] = 4100; //@line 2918
    HEAP32[1027] = 4100; //@line 2919
    HEAP32[1030] = 4108; //@line 2920
    HEAP32[1029] = 4108; //@line 2921
    HEAP32[1032] = 4116; //@line 2922
    HEAP32[1031] = 4116; //@line 2923
    HEAP32[1034] = 4124; //@line 2924
    HEAP32[1033] = 4124; //@line 2925
    HEAP32[1036] = 4132; //@line 2926
    HEAP32[1035] = 4132; //@line 2927
    HEAP32[1038] = 4140; //@line 2928
    HEAP32[1037] = 4140; //@line 2929
    HEAP32[1040] = 4148; //@line 2930
    HEAP32[1039] = 4148; //@line 2931
    HEAP32[1042] = 4156; //@line 2932
    HEAP32[1041] = 4156; //@line 2933
    HEAP32[1044] = 4164; //@line 2934
    HEAP32[1043] = 4164; //@line 2935
    HEAP32[1046] = 4172; //@line 2936
    HEAP32[1045] = 4172; //@line 2937
    HEAP32[1048] = 4180; //@line 2938
    HEAP32[1047] = 4180; //@line 2939
    HEAP32[1050] = 4188; //@line 2940
    HEAP32[1049] = 4188; //@line 2941
    HEAP32[1052] = 4196; //@line 2942
    HEAP32[1051] = 4196; //@line 2943
    HEAP32[1054] = 4204; //@line 2944
    HEAP32[1053] = 4204; //@line 2945
    HEAP32[1056] = 4212; //@line 2946
    HEAP32[1055] = 4212; //@line 2947
    HEAP32[1058] = 4220; //@line 2948
    HEAP32[1057] = 4220; //@line 2949
    HEAP32[1060] = 4228; //@line 2950
    HEAP32[1059] = 4228; //@line 2951
    HEAP32[1062] = 4236; //@line 2952
    HEAP32[1061] = 4236; //@line 2953
    HEAP32[1064] = 4244; //@line 2954
    HEAP32[1063] = 4244; //@line 2955
    HEAP32[1066] = 4252; //@line 2956
    HEAP32[1065] = 4252; //@line 2957
    HEAP32[1068] = 4260; //@line 2958
    HEAP32[1067] = 4260; //@line 2959
    HEAP32[1070] = 4268; //@line 2960
    HEAP32[1069] = 4268; //@line 2961
    HEAP32[1072] = 4276; //@line 2962
    HEAP32[1071] = 4276; //@line 2963
    HEAP32[1074] = 4284; //@line 2964
    HEAP32[1073] = 4284; //@line 2965
    HEAP32[1076] = 4292; //@line 2966
    HEAP32[1075] = 4292; //@line 2967
    HEAP32[1078] = 4300; //@line 2968
    HEAP32[1077] = 4300; //@line 2969
    HEAP32[1080] = 4308; //@line 2970
    HEAP32[1079] = 4308; //@line 2971
    HEAP32[1082] = 4316; //@line 2972
    HEAP32[1081] = 4316; //@line 2973
    $642 = $$723947$i + -40 | 0; //@line 2974
    $644 = $$748$i + 8 | 0; //@line 2976
    $649 = ($644 & 7 | 0) == 0 ? 0 : 0 - $644 & 7; //@line 2981
    $650 = $$748$i + $649 | 0; //@line 2982
    $651 = $642 - $649 | 0; //@line 2983
    HEAP32[1013] = $650; //@line 2984
    HEAP32[1010] = $651; //@line 2985
    HEAP32[$650 + 4 >> 2] = $651 | 1; //@line 2988
    HEAP32[$$748$i + $642 + 4 >> 2] = 40; //@line 2991
    HEAP32[1014] = HEAP32[1129]; //@line 2993
   } else {
    $$024367$i = 4476; //@line 2995
    while (1) {
     $657 = HEAP32[$$024367$i >> 2] | 0; //@line 2997
     $658 = $$024367$i + 4 | 0; //@line 2998
     $659 = HEAP32[$658 >> 2] | 0; //@line 2999
     if (($$748$i | 0) == ($657 + $659 | 0)) {
      label = 188; //@line 3003
      break;
     }
     $663 = HEAP32[$$024367$i + 8 >> 2] | 0; //@line 3007
     if (!$663) {
      break;
     } else {
      $$024367$i = $663; //@line 3012
     }
    }
    if ((label | 0) == 188) {
     if (!(HEAP32[$$024367$i + 12 >> 2] & 8)) {
      if ($$748$i >>> 0 > $636 >>> 0 & $657 >>> 0 <= $636 >>> 0) {
       HEAP32[$658 >> 2] = $659 + $$723947$i; //@line 3026
       $673 = (HEAP32[1010] | 0) + $$723947$i | 0; //@line 3028
       $675 = $636 + 8 | 0; //@line 3030
       $680 = ($675 & 7 | 0) == 0 ? 0 : 0 - $675 & 7; //@line 3035
       $681 = $636 + $680 | 0; //@line 3036
       $682 = $673 - $680 | 0; //@line 3037
       HEAP32[1013] = $681; //@line 3038
       HEAP32[1010] = $682; //@line 3039
       HEAP32[$681 + 4 >> 2] = $682 | 1; //@line 3042
       HEAP32[$636 + $673 + 4 >> 2] = 40; //@line 3045
       HEAP32[1014] = HEAP32[1129]; //@line 3047
       break;
      }
     }
    }
    $688 = HEAP32[1011] | 0; //@line 3052
    if ($$748$i >>> 0 < $688 >>> 0) {
     HEAP32[1011] = $$748$i; //@line 3055
     $753 = $$748$i; //@line 3056
    } else {
     $753 = $688; //@line 3058
    }
    $690 = $$748$i + $$723947$i | 0; //@line 3060
    $$124466$i = 4476; //@line 3061
    while (1) {
     if ((HEAP32[$$124466$i >> 2] | 0) == ($690 | 0)) {
      label = 196; //@line 3066
      break;
     }
     $694 = HEAP32[$$124466$i + 8 >> 2] | 0; //@line 3070
     if (!$694) {
      $$0$i$i$i = 4476; //@line 3073
      break;
     } else {
      $$124466$i = $694; //@line 3076
     }
    }
    if ((label | 0) == 196) {
     if (!(HEAP32[$$124466$i + 12 >> 2] & 8)) {
      HEAP32[$$124466$i >> 2] = $$748$i; //@line 3085
      $700 = $$124466$i + 4 | 0; //@line 3086
      HEAP32[$700 >> 2] = (HEAP32[$700 >> 2] | 0) + $$723947$i; //@line 3089
      $704 = $$748$i + 8 | 0; //@line 3091
      $710 = $$748$i + (($704 & 7 | 0) == 0 ? 0 : 0 - $704 & 7) | 0; //@line 3097
      $712 = $690 + 8 | 0; //@line 3099
      $718 = $690 + (($712 & 7 | 0) == 0 ? 0 : 0 - $712 & 7) | 0; //@line 3105
      $722 = $710 + $$0197 | 0; //@line 3109
      $723 = $718 - $710 - $$0197 | 0; //@line 3110
      HEAP32[$710 + 4 >> 2] = $$0197 | 3; //@line 3113
      do {
       if (($636 | 0) == ($718 | 0)) {
        $728 = (HEAP32[1010] | 0) + $723 | 0; //@line 3118
        HEAP32[1010] = $728; //@line 3119
        HEAP32[1013] = $722; //@line 3120
        HEAP32[$722 + 4 >> 2] = $728 | 1; //@line 3123
       } else {
        if ((HEAP32[1012] | 0) == ($718 | 0)) {
         $734 = (HEAP32[1009] | 0) + $723 | 0; //@line 3129
         HEAP32[1009] = $734; //@line 3130
         HEAP32[1012] = $722; //@line 3131
         HEAP32[$722 + 4 >> 2] = $734 | 1; //@line 3134
         HEAP32[$722 + $734 >> 2] = $734; //@line 3136
         break;
        }
        $739 = HEAP32[$718 + 4 >> 2] | 0; //@line 3140
        if (($739 & 3 | 0) == 1) {
         $742 = $739 & -8; //@line 3144
         $743 = $739 >>> 3; //@line 3145
         L311 : do {
          if ($739 >>> 0 < 256) {
           $746 = HEAP32[$718 + 8 >> 2] | 0; //@line 3150
           $748 = HEAP32[$718 + 12 >> 2] | 0; //@line 3152
           $750 = 4068 + ($743 << 1 << 2) | 0; //@line 3154
           do {
            if (($746 | 0) != ($750 | 0)) {
             if ($753 >>> 0 > $746 >>> 0) {
              _abort(); //@line 3160
             }
             if ((HEAP32[$746 + 12 >> 2] | 0) == ($718 | 0)) {
              break;
             }
             _abort(); //@line 3169
            }
           } while (0);
           if (($748 | 0) == ($746 | 0)) {
            HEAP32[1007] = HEAP32[1007] & ~(1 << $743); //@line 3179
            break;
           }
           do {
            if (($748 | 0) == ($750 | 0)) {
             $$pre$phi11$i$iZ2D = $748 + 8 | 0; //@line 3186
            } else {
             if ($753 >>> 0 > $748 >>> 0) {
              _abort(); //@line 3190
             }
             $764 = $748 + 8 | 0; //@line 3193
             if ((HEAP32[$764 >> 2] | 0) == ($718 | 0)) {
              $$pre$phi11$i$iZ2D = $764; //@line 3197
              break;
             }
             _abort(); //@line 3200
            }
           } while (0);
           HEAP32[$746 + 12 >> 2] = $748; //@line 3205
           HEAP32[$$pre$phi11$i$iZ2D >> 2] = $746; //@line 3206
          } else {
           $769 = HEAP32[$718 + 24 >> 2] | 0; //@line 3209
           $771 = HEAP32[$718 + 12 >> 2] | 0; //@line 3211
           do {
            if (($771 | 0) == ($718 | 0)) {
             $782 = $718 + 16 | 0; //@line 3215
             $783 = $782 + 4 | 0; //@line 3216
             $784 = HEAP32[$783 >> 2] | 0; //@line 3217
             if (!$784) {
              $786 = HEAP32[$782 >> 2] | 0; //@line 3220
              if (!$786) {
               $$3$i$i = 0; //@line 3223
               break;
              } else {
               $$1291$i$i = $786; //@line 3226
               $$1293$i$i = $782; //@line 3226
              }
             } else {
              $$1291$i$i = $784; //@line 3229
              $$1293$i$i = $783; //@line 3229
             }
             while (1) {
              $788 = $$1291$i$i + 20 | 0; //@line 3232
              $789 = HEAP32[$788 >> 2] | 0; //@line 3233
              if ($789 | 0) {
               $$1291$i$i = $789; //@line 3236
               $$1293$i$i = $788; //@line 3236
               continue;
              }
              $791 = $$1291$i$i + 16 | 0; //@line 3239
              $792 = HEAP32[$791 >> 2] | 0; //@line 3240
              if (!$792) {
               break;
              } else {
               $$1291$i$i = $792; //@line 3245
               $$1293$i$i = $791; //@line 3245
              }
             }
             if ($753 >>> 0 > $$1293$i$i >>> 0) {
              _abort(); //@line 3250
             } else {
              HEAP32[$$1293$i$i >> 2] = 0; //@line 3253
              $$3$i$i = $$1291$i$i; //@line 3254
              break;
             }
            } else {
             $774 = HEAP32[$718 + 8 >> 2] | 0; //@line 3259
             if ($753 >>> 0 > $774 >>> 0) {
              _abort(); //@line 3262
             }
             $776 = $774 + 12 | 0; //@line 3265
             if ((HEAP32[$776 >> 2] | 0) != ($718 | 0)) {
              _abort(); //@line 3269
             }
             $779 = $771 + 8 | 0; //@line 3272
             if ((HEAP32[$779 >> 2] | 0) == ($718 | 0)) {
              HEAP32[$776 >> 2] = $771; //@line 3276
              HEAP32[$779 >> 2] = $774; //@line 3277
              $$3$i$i = $771; //@line 3278
              break;
             } else {
              _abort(); //@line 3281
             }
            }
           } while (0);
           if (!$769) {
            break;
           }
           $797 = HEAP32[$718 + 28 >> 2] | 0; //@line 3291
           $798 = 4332 + ($797 << 2) | 0; //@line 3292
           do {
            if ((HEAP32[$798 >> 2] | 0) == ($718 | 0)) {
             HEAP32[$798 >> 2] = $$3$i$i; //@line 3297
             if ($$3$i$i | 0) {
              break;
             }
             HEAP32[1008] = HEAP32[1008] & ~(1 << $797); //@line 3306
             break L311;
            } else {
             if ((HEAP32[1011] | 0) >>> 0 > $769 >>> 0) {
              _abort(); //@line 3312
             } else {
              HEAP32[$769 + 16 + (((HEAP32[$769 + 16 >> 2] | 0) != ($718 | 0) & 1) << 2) >> 2] = $$3$i$i; //@line 3320
              if (!$$3$i$i) {
               break L311;
              } else {
               break;
              }
             }
            }
           } while (0);
           $812 = HEAP32[1011] | 0; //@line 3330
           if ($812 >>> 0 > $$3$i$i >>> 0) {
            _abort(); //@line 3333
           }
           HEAP32[$$3$i$i + 24 >> 2] = $769; //@line 3337
           $815 = $718 + 16 | 0; //@line 3338
           $816 = HEAP32[$815 >> 2] | 0; //@line 3339
           do {
            if ($816 | 0) {
             if ($812 >>> 0 > $816 >>> 0) {
              _abort(); //@line 3345
             } else {
              HEAP32[$$3$i$i + 16 >> 2] = $816; //@line 3349
              HEAP32[$816 + 24 >> 2] = $$3$i$i; //@line 3351
              break;
             }
            }
           } while (0);
           $822 = HEAP32[$815 + 4 >> 2] | 0; //@line 3357
           if (!$822) {
            break;
           }
           if ((HEAP32[1011] | 0) >>> 0 > $822 >>> 0) {
            _abort(); //@line 3365
           } else {
            HEAP32[$$3$i$i + 20 >> 2] = $822; //@line 3369
            HEAP32[$822 + 24 >> 2] = $$3$i$i; //@line 3371
            break;
           }
          }
         } while (0);
         $$0$i17$i = $718 + $742 | 0; //@line 3378
         $$0287$i$i = $742 + $723 | 0; //@line 3378
        } else {
         $$0$i17$i = $718; //@line 3380
         $$0287$i$i = $723; //@line 3380
        }
        $830 = $$0$i17$i + 4 | 0; //@line 3382
        HEAP32[$830 >> 2] = HEAP32[$830 >> 2] & -2; //@line 3385
        HEAP32[$722 + 4 >> 2] = $$0287$i$i | 1; //@line 3388
        HEAP32[$722 + $$0287$i$i >> 2] = $$0287$i$i; //@line 3390
        $836 = $$0287$i$i >>> 3; //@line 3391
        if ($$0287$i$i >>> 0 < 256) {
         $839 = 4068 + ($836 << 1 << 2) | 0; //@line 3395
         $840 = HEAP32[1007] | 0; //@line 3396
         $841 = 1 << $836; //@line 3397
         do {
          if (!($840 & $841)) {
           HEAP32[1007] = $840 | $841; //@line 3403
           $$0295$i$i = $839; //@line 3405
           $$pre$phi$i19$iZ2D = $839 + 8 | 0; //@line 3405
          } else {
           $845 = $839 + 8 | 0; //@line 3407
           $846 = HEAP32[$845 >> 2] | 0; //@line 3408
           if ((HEAP32[1011] | 0) >>> 0 <= $846 >>> 0) {
            $$0295$i$i = $846; //@line 3412
            $$pre$phi$i19$iZ2D = $845; //@line 3412
            break;
           }
           _abort(); //@line 3415
          }
         } while (0);
         HEAP32[$$pre$phi$i19$iZ2D >> 2] = $722; //@line 3419
         HEAP32[$$0295$i$i + 12 >> 2] = $722; //@line 3421
         HEAP32[$722 + 8 >> 2] = $$0295$i$i; //@line 3423
         HEAP32[$722 + 12 >> 2] = $839; //@line 3425
         break;
        }
        $852 = $$0287$i$i >>> 8; //@line 3428
        do {
         if (!$852) {
          $$0296$i$i = 0; //@line 3432
         } else {
          if ($$0287$i$i >>> 0 > 16777215) {
           $$0296$i$i = 31; //@line 3436
           break;
          }
          $857 = ($852 + 1048320 | 0) >>> 16 & 8; //@line 3441
          $858 = $852 << $857; //@line 3442
          $861 = ($858 + 520192 | 0) >>> 16 & 4; //@line 3445
          $863 = $858 << $861; //@line 3447
          $866 = ($863 + 245760 | 0) >>> 16 & 2; //@line 3450
          $871 = 14 - ($861 | $857 | $866) + ($863 << $866 >>> 15) | 0; //@line 3455
          $$0296$i$i = $$0287$i$i >>> ($871 + 7 | 0) & 1 | $871 << 1; //@line 3461
         }
        } while (0);
        $877 = 4332 + ($$0296$i$i << 2) | 0; //@line 3464
        HEAP32[$722 + 28 >> 2] = $$0296$i$i; //@line 3466
        $879 = $722 + 16 | 0; //@line 3467
        HEAP32[$879 + 4 >> 2] = 0; //@line 3469
        HEAP32[$879 >> 2] = 0; //@line 3470
        $881 = HEAP32[1008] | 0; //@line 3471
        $882 = 1 << $$0296$i$i; //@line 3472
        if (!($881 & $882)) {
         HEAP32[1008] = $881 | $882; //@line 3477
         HEAP32[$877 >> 2] = $722; //@line 3478
         HEAP32[$722 + 24 >> 2] = $877; //@line 3480
         HEAP32[$722 + 12 >> 2] = $722; //@line 3482
         HEAP32[$722 + 8 >> 2] = $722; //@line 3484
         break;
        }
        $$0288$i$i = $$0287$i$i << (($$0296$i$i | 0) == 31 ? 0 : 25 - ($$0296$i$i >>> 1) | 0); //@line 3493
        $$0289$i$i = HEAP32[$877 >> 2] | 0; //@line 3493
        while (1) {
         if ((HEAP32[$$0289$i$i + 4 >> 2] & -8 | 0) == ($$0287$i$i | 0)) {
          label = 263; //@line 3500
          break;
         }
         $900 = $$0289$i$i + 16 + ($$0288$i$i >>> 31 << 2) | 0; //@line 3504
         $902 = HEAP32[$900 >> 2] | 0; //@line 3506
         if (!$902) {
          label = 260; //@line 3509
          break;
         } else {
          $$0288$i$i = $$0288$i$i << 1; //@line 3512
          $$0289$i$i = $902; //@line 3512
         }
        }
        if ((label | 0) == 260) {
         if ((HEAP32[1011] | 0) >>> 0 > $900 >>> 0) {
          _abort(); //@line 3519
         } else {
          HEAP32[$900 >> 2] = $722; //@line 3522
          HEAP32[$722 + 24 >> 2] = $$0289$i$i; //@line 3524
          HEAP32[$722 + 12 >> 2] = $722; //@line 3526
          HEAP32[$722 + 8 >> 2] = $722; //@line 3528
          break;
         }
        } else if ((label | 0) == 263) {
         $909 = $$0289$i$i + 8 | 0; //@line 3533
         $910 = HEAP32[$909 >> 2] | 0; //@line 3534
         $911 = HEAP32[1011] | 0; //@line 3535
         if ($911 >>> 0 <= $910 >>> 0 & $911 >>> 0 <= $$0289$i$i >>> 0) {
          HEAP32[$910 + 12 >> 2] = $722; //@line 3541
          HEAP32[$909 >> 2] = $722; //@line 3542
          HEAP32[$722 + 8 >> 2] = $910; //@line 3544
          HEAP32[$722 + 12 >> 2] = $$0289$i$i; //@line 3546
          HEAP32[$722 + 24 >> 2] = 0; //@line 3548
          break;
         } else {
          _abort(); //@line 3551
         }
        }
       }
      } while (0);
      $$0 = $710 + 8 | 0; //@line 3558
      STACKTOP = sp; //@line 3559
      return $$0 | 0; //@line 3559
     } else {
      $$0$i$i$i = 4476; //@line 3561
     }
    }
    while (1) {
     $919 = HEAP32[$$0$i$i$i >> 2] | 0; //@line 3565
     if ($919 >>> 0 <= $636 >>> 0) {
      $923 = $919 + (HEAP32[$$0$i$i$i + 4 >> 2] | 0) | 0; //@line 3570
      if ($923 >>> 0 > $636 >>> 0) {
       break;
      }
     }
     $$0$i$i$i = HEAP32[$$0$i$i$i + 8 >> 2] | 0; //@line 3578
    }
    $927 = $923 + -47 | 0; //@line 3580
    $929 = $927 + 8 | 0; //@line 3582
    $935 = $927 + (($929 & 7 | 0) == 0 ? 0 : 0 - $929 & 7) | 0; //@line 3588
    $936 = $636 + 16 | 0; //@line 3589
    $938 = $935 >>> 0 < $936 >>> 0 ? $636 : $935; //@line 3591
    $939 = $938 + 8 | 0; //@line 3592
    $940 = $938 + 24 | 0; //@line 3593
    $941 = $$723947$i + -40 | 0; //@line 3594
    $943 = $$748$i + 8 | 0; //@line 3596
    $948 = ($943 & 7 | 0) == 0 ? 0 : 0 - $943 & 7; //@line 3601
    $949 = $$748$i + $948 | 0; //@line 3602
    $950 = $941 - $948 | 0; //@line 3603
    HEAP32[1013] = $949; //@line 3604
    HEAP32[1010] = $950; //@line 3605
    HEAP32[$949 + 4 >> 2] = $950 | 1; //@line 3608
    HEAP32[$$748$i + $941 + 4 >> 2] = 40; //@line 3611
    HEAP32[1014] = HEAP32[1129]; //@line 3613
    $956 = $938 + 4 | 0; //@line 3614
    HEAP32[$956 >> 2] = 27; //@line 3615
    HEAP32[$939 >> 2] = HEAP32[1119]; //@line 3616
    HEAP32[$939 + 4 >> 2] = HEAP32[1120]; //@line 3616
    HEAP32[$939 + 8 >> 2] = HEAP32[1121]; //@line 3616
    HEAP32[$939 + 12 >> 2] = HEAP32[1122]; //@line 3616
    HEAP32[1119] = $$748$i; //@line 3617
    HEAP32[1120] = $$723947$i; //@line 3618
    HEAP32[1122] = 0; //@line 3619
    HEAP32[1121] = $939; //@line 3620
    $958 = $940; //@line 3621
    do {
     $958$looptemp = $958;
     $958 = $958 + 4 | 0; //@line 3623
     HEAP32[$958 >> 2] = 7; //@line 3624
    } while (($958$looptemp + 8 | 0) >>> 0 < $923 >>> 0);
    if (($938 | 0) != ($636 | 0)) {
     $964 = $938 - $636 | 0; //@line 3637
     HEAP32[$956 >> 2] = HEAP32[$956 >> 2] & -2; //@line 3640
     HEAP32[$636 + 4 >> 2] = $964 | 1; //@line 3643
     HEAP32[$938 >> 2] = $964; //@line 3644
     $969 = $964 >>> 3; //@line 3645
     if ($964 >>> 0 < 256) {
      $972 = 4068 + ($969 << 1 << 2) | 0; //@line 3649
      $973 = HEAP32[1007] | 0; //@line 3650
      $974 = 1 << $969; //@line 3651
      if (!($973 & $974)) {
       HEAP32[1007] = $973 | $974; //@line 3656
       $$0211$i$i = $972; //@line 3658
       $$pre$phi$i$iZ2D = $972 + 8 | 0; //@line 3658
      } else {
       $978 = $972 + 8 | 0; //@line 3660
       $979 = HEAP32[$978 >> 2] | 0; //@line 3661
       if ((HEAP32[1011] | 0) >>> 0 > $979 >>> 0) {
        _abort(); //@line 3665
       } else {
        $$0211$i$i = $979; //@line 3668
        $$pre$phi$i$iZ2D = $978; //@line 3668
       }
      }
      HEAP32[$$pre$phi$i$iZ2D >> 2] = $636; //@line 3671
      HEAP32[$$0211$i$i + 12 >> 2] = $636; //@line 3673
      HEAP32[$636 + 8 >> 2] = $$0211$i$i; //@line 3675
      HEAP32[$636 + 12 >> 2] = $972; //@line 3677
      break;
     }
     $985 = $964 >>> 8; //@line 3680
     if (!$985) {
      $$0212$i$i = 0; //@line 3683
     } else {
      if ($964 >>> 0 > 16777215) {
       $$0212$i$i = 31; //@line 3687
      } else {
       $990 = ($985 + 1048320 | 0) >>> 16 & 8; //@line 3691
       $991 = $985 << $990; //@line 3692
       $994 = ($991 + 520192 | 0) >>> 16 & 4; //@line 3695
       $996 = $991 << $994; //@line 3697
       $999 = ($996 + 245760 | 0) >>> 16 & 2; //@line 3700
       $1004 = 14 - ($994 | $990 | $999) + ($996 << $999 >>> 15) | 0; //@line 3705
       $$0212$i$i = $964 >>> ($1004 + 7 | 0) & 1 | $1004 << 1; //@line 3711
      }
     }
     $1010 = 4332 + ($$0212$i$i << 2) | 0; //@line 3714
     HEAP32[$636 + 28 >> 2] = $$0212$i$i; //@line 3716
     HEAP32[$636 + 20 >> 2] = 0; //@line 3718
     HEAP32[$936 >> 2] = 0; //@line 3719
     $1013 = HEAP32[1008] | 0; //@line 3720
     $1014 = 1 << $$0212$i$i; //@line 3721
     if (!($1013 & $1014)) {
      HEAP32[1008] = $1013 | $1014; //@line 3726
      HEAP32[$1010 >> 2] = $636; //@line 3727
      HEAP32[$636 + 24 >> 2] = $1010; //@line 3729
      HEAP32[$636 + 12 >> 2] = $636; //@line 3731
      HEAP32[$636 + 8 >> 2] = $636; //@line 3733
      break;
     }
     $$0206$i$i = $964 << (($$0212$i$i | 0) == 31 ? 0 : 25 - ($$0212$i$i >>> 1) | 0); //@line 3742
     $$0207$i$i = HEAP32[$1010 >> 2] | 0; //@line 3742
     while (1) {
      if ((HEAP32[$$0207$i$i + 4 >> 2] & -8 | 0) == ($964 | 0)) {
       label = 289; //@line 3749
       break;
      }
      $1032 = $$0207$i$i + 16 + ($$0206$i$i >>> 31 << 2) | 0; //@line 3753
      $1034 = HEAP32[$1032 >> 2] | 0; //@line 3755
      if (!$1034) {
       label = 286; //@line 3758
       break;
      } else {
       $$0206$i$i = $$0206$i$i << 1; //@line 3761
       $$0207$i$i = $1034; //@line 3761
      }
     }
     if ((label | 0) == 286) {
      if ((HEAP32[1011] | 0) >>> 0 > $1032 >>> 0) {
       _abort(); //@line 3768
      } else {
       HEAP32[$1032 >> 2] = $636; //@line 3771
       HEAP32[$636 + 24 >> 2] = $$0207$i$i; //@line 3773
       HEAP32[$636 + 12 >> 2] = $636; //@line 3775
       HEAP32[$636 + 8 >> 2] = $636; //@line 3777
       break;
      }
     } else if ((label | 0) == 289) {
      $1041 = $$0207$i$i + 8 | 0; //@line 3782
      $1042 = HEAP32[$1041 >> 2] | 0; //@line 3783
      $1043 = HEAP32[1011] | 0; //@line 3784
      if ($1043 >>> 0 <= $1042 >>> 0 & $1043 >>> 0 <= $$0207$i$i >>> 0) {
       HEAP32[$1042 + 12 >> 2] = $636; //@line 3790
       HEAP32[$1041 >> 2] = $636; //@line 3791
       HEAP32[$636 + 8 >> 2] = $1042; //@line 3793
       HEAP32[$636 + 12 >> 2] = $$0207$i$i; //@line 3795
       HEAP32[$636 + 24 >> 2] = 0; //@line 3797
       break;
      } else {
       _abort(); //@line 3800
      }
     }
    }
   }
  } while (0);
  $1052 = HEAP32[1010] | 0; //@line 3807
  if ($1052 >>> 0 > $$0197 >>> 0) {
   $1054 = $1052 - $$0197 | 0; //@line 3810
   HEAP32[1010] = $1054; //@line 3811
   $1055 = HEAP32[1013] | 0; //@line 3812
   $1056 = $1055 + $$0197 | 0; //@line 3813
   HEAP32[1013] = $1056; //@line 3814
   HEAP32[$1056 + 4 >> 2] = $1054 | 1; //@line 3817
   HEAP32[$1055 + 4 >> 2] = $$0197 | 3; //@line 3820
   $$0 = $1055 + 8 | 0; //@line 3822
   STACKTOP = sp; //@line 3823
   return $$0 | 0; //@line 3823
  }
 }
 HEAP32[(___errno_location() | 0) >> 2] = 12; //@line 3827
 $$0 = 0; //@line 3828
 STACKTOP = sp; //@line 3829
 return $$0 | 0; //@line 3829
}
function _fmt_fp($0, $1, $2, $3, $4, $5) {
 $0 = $0 | 0;
 $1 = +$1;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 $5 = $5 | 0;
 var $$$3484 = 0, $$$3484700 = 0, $$$4502 = 0, $$$564 = 0.0, $$0 = 0, $$0463$lcssa = 0, $$0463587 = 0, $$0464597 = 0, $$0471 = 0.0, $$0479 = 0, $$0487644 = 0, $$0488655 = 0, $$0488657 = 0, $$0496$$9 = 0, $$0497656 = 0, $$0498 = 0, $$0509585 = 0.0, $$0511 = 0, $$0514639 = 0, $$0520 = 0, $$0521 = 0, $$0521$ = 0, $$0523 = 0, $$0527$in633 = 0, $$0530638 = 0, $$1465 = 0, $$1467 = 0.0, $$1469 = 0.0, $$1472 = 0.0, $$1480 = 0, $$1482$lcssa = 0, $$1482663 = 0, $$1489643 = 0, $$1499$lcssa = 0, $$1499662 = 0, $$1508586 = 0, $$1512$lcssa = 0, $$1512610 = 0, $$1515 = 0, $$1524 = 0, $$1528617 = 0, $$1531$lcssa = 0, $$1531632 = 0, $$1601 = 0, $$2 = 0, $$2473 = 0.0, $$2476 = 0, $$2483$ph = 0, $$2500 = 0, $$2513 = 0, $$2516621 = 0, $$2529 = 0, $$2532620 = 0, $$3 = 0.0, $$3477 = 0, $$3484$lcssa = 0, $$3484650 = 0, $$3501$lcssa = 0, $$3501649 = 0, $$3533616 = 0, $$4 = 0.0, $$4478$lcssa = 0, $$4478593 = 0, $$4492 = 0, $$4502 = 0, $$4518 = 0, $$5$lcssa = 0, $$540 = 0, $$540$ = 0, $$543 = 0.0, $$548 = 0, $$5486$lcssa = 0, $$5486626 = 0, $$5493600 = 0, $$550 = 0, $$5519$ph = 0, $$5605 = 0, $$561 = 0, $$6 = 0, $$6494592 = 0, $$7495604 = 0, $$7505 = 0, $$7505$ = 0, $$7505$ph = 0, $$8 = 0, $$9$ph = 0, $$lcssa675 = 0, $$pn = 0, $$pr = 0, $$pr566 = 0, $$pre$phi691Z2D = 0, $$pre$phi698Z2D = 0, $$pre693 = 0, $$sink = 0, $$sink547$lcssa = 0, $$sink547625 = 0, $$sink560 = 0, $10 = 0, $101 = 0, $104 = 0, $106 = 0, $11 = 0, $113 = 0, $116 = 0, $124 = 0, $125 = 0, $128 = 0, $130 = 0, $131 = 0, $132 = 0, $138 = 0, $140 = 0, $144 = 0, $149 = 0, $150 = 0, $151 = 0, $152 = 0, $154 = 0, $160 = 0, $161 = 0, $162 = 0, $174 = 0, $185 = 0, $189 = 0, $190 = 0, $193 = 0, $198 = 0, $199 = 0, $201 = 0, $209 = 0, $212 = 0, $213 = 0, $215 = 0, $217 = 0, $218 = 0, $221 = 0, $225 = 0, $230 = 0, $233 = 0, $236 = 0, $238 = 0, $240 = 0, $242 = 0, $247 = 0, $248 = 0, $251 = 0, $253 = 0, $256 = 0, $259 = 0, $267 = 0, $27 = 0, $270 = 0, $275 = 0, $284 = 0, $285 = 0, $289 = 0, $292 = 0, $294 = 0, $296 = 0, $300 = 0, $303 = 0, $304 = 0, $308 = 0, $31 = 0, $318 = 0, $323 = 0, $326 = 0, $327 = 0, $328 = 0, $330 = 0, $335 = 0, $347 = 0, $35 = 0.0, $351 = 0, $356 = 0, $36 = 0, $363 = 0, $364 = 0, $365 = 0, $366 = 0, $367 = 0, $369 = 0, $373 = 0, $375 = 0, $378 = 0, $381 = 0, $39 = 0, $41 = 0, $44 = 0, $46 = 0, $6 = 0, $60 = 0, $63 = 0, $66 = 0, $68 = 0, $7 = 0, $76 = 0, $77 = 0, $79 = 0, $8 = 0, $80 = 0, $86 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 7551
 STACKTOP = STACKTOP + 560 | 0; //@line 7552
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(560); //@line 7552
 $6 = sp + 8 | 0; //@line 7553
 $7 = sp; //@line 7554
 $8 = sp + 524 | 0; //@line 7555
 $9 = $8; //@line 7556
 $10 = sp + 512 | 0; //@line 7557
 HEAP32[$7 >> 2] = 0; //@line 7558
 $11 = $10 + 12 | 0; //@line 7559
 ___DOUBLE_BITS_677($1) | 0; //@line 7560
 if ((tempRet0 | 0) < 0) {
  $$0471 = -$1; //@line 7565
  $$0520 = 1; //@line 7565
  $$0521 = 1859; //@line 7565
 } else {
  $$0471 = $1; //@line 7576
  $$0520 = ($4 & 2049 | 0) != 0 & 1; //@line 7576
  $$0521 = ($4 & 2048 | 0) == 0 ? ($4 & 1 | 0) == 0 ? 1860 : 1865 : 1862; //@line 7576
 }
 ___DOUBLE_BITS_677($$0471) | 0; //@line 7578
 do {
  if (0 == 0 & (tempRet0 & 2146435072 | 0) == 2146435072) {
   $27 = ($5 & 32 | 0) != 0; //@line 7587
   $31 = $$0520 + 3 | 0; //@line 7592
   _pad_676($0, 32, $2, $31, $4 & -65537); //@line 7594
   _out_670($0, $$0521, $$0520); //@line 7595
   _out_670($0, $$0471 != $$0471 | 0.0 != 0.0 ? $27 ? 1886 : 1890 : $27 ? 1878 : 1882, 3); //@line 7596
   _pad_676($0, 32, $2, $31, $4 ^ 8192); //@line 7598
   $$sink560 = $31; //@line 7599
  } else {
   $35 = +_frexpl($$0471, $7) * 2.0; //@line 7602
   $36 = $35 != 0.0; //@line 7603
   if ($36) {
    HEAP32[$7 >> 2] = (HEAP32[$7 >> 2] | 0) + -1; //@line 7607
   }
   $39 = $5 | 32; //@line 7609
   if (($39 | 0) == 97) {
    $41 = $5 & 32; //@line 7612
    $$0521$ = ($41 | 0) == 0 ? $$0521 : $$0521 + 9 | 0; //@line 7615
    $44 = $$0520 | 2; //@line 7616
    $46 = 12 - $3 | 0; //@line 7618
    do {
     if ($3 >>> 0 > 11 | ($46 | 0) == 0) {
      $$1472 = $35; //@line 7623
     } else {
      $$0509585 = 8.0; //@line 7625
      $$1508586 = $46; //@line 7625
      do {
       $$1508586 = $$1508586 + -1 | 0; //@line 7627
       $$0509585 = $$0509585 * 16.0; //@line 7628
      } while (($$1508586 | 0) != 0);
      if ((HEAP8[$$0521$ >> 0] | 0) == 45) {
       $$1472 = -($$0509585 + (-$35 - $$0509585)); //@line 7643
       break;
      } else {
       $$1472 = $35 + $$0509585 - $$0509585; //@line 7648
       break;
      }
     }
    } while (0);
    $60 = HEAP32[$7 >> 2] | 0; //@line 7653
    $63 = ($60 | 0) < 0 ? 0 - $60 | 0 : $60; //@line 7656
    $66 = _fmt_u($63, (($63 | 0) < 0) << 31 >> 31, $11) | 0; //@line 7659
    if (($66 | 0) == ($11 | 0)) {
     $68 = $10 + 11 | 0; //@line 7662
     HEAP8[$68 >> 0] = 48; //@line 7663
     $$0511 = $68; //@line 7664
    } else {
     $$0511 = $66; //@line 7666
    }
    HEAP8[$$0511 + -1 >> 0] = ($60 >> 31 & 2) + 43; //@line 7673
    $76 = $$0511 + -2 | 0; //@line 7676
    HEAP8[$76 >> 0] = $5 + 15; //@line 7677
    $77 = ($3 | 0) < 1; //@line 7678
    $79 = ($4 & 8 | 0) == 0; //@line 7680
    $$0523 = $8; //@line 7681
    $$2473 = $$1472; //@line 7681
    while (1) {
     $80 = ~~$$2473; //@line 7683
     $86 = $$0523 + 1 | 0; //@line 7689
     HEAP8[$$0523 >> 0] = $41 | HEAPU8[1894 + $80 >> 0]; //@line 7690
     $$2473 = ($$2473 - +($80 | 0)) * 16.0; //@line 7693
     if (($86 - $9 | 0) == 1) {
      if ($79 & ($77 & $$2473 == 0.0)) {
       $$1524 = $86; //@line 7702
      } else {
       HEAP8[$86 >> 0] = 46; //@line 7705
       $$1524 = $$0523 + 2 | 0; //@line 7706
      }
     } else {
      $$1524 = $86; //@line 7709
     }
     if (!($$2473 != 0.0)) {
      break;
     } else {
      $$0523 = $$1524; //@line 7713
     }
    }
    $$pre693 = $$1524; //@line 7719
    if (!$3) {
     label = 24; //@line 7721
    } else {
     if ((-2 - $9 + $$pre693 | 0) < ($3 | 0)) {
      $$pre$phi691Z2D = $$pre693 - $9 | 0; //@line 7729
      $$sink = $3 + 2 | 0; //@line 7729
     } else {
      label = 24; //@line 7731
     }
    }
    if ((label | 0) == 24) {
     $101 = $$pre693 - $9 | 0; //@line 7735
     $$pre$phi691Z2D = $101; //@line 7736
     $$sink = $101; //@line 7736
    }
    $104 = $11 - $76 | 0; //@line 7740
    $106 = $104 + $44 + $$sink | 0; //@line 7742
    _pad_676($0, 32, $2, $106, $4); //@line 7743
    _out_670($0, $$0521$, $44); //@line 7744
    _pad_676($0, 48, $2, $106, $4 ^ 65536); //@line 7746
    _out_670($0, $8, $$pre$phi691Z2D); //@line 7747
    _pad_676($0, 48, $$sink - $$pre$phi691Z2D | 0, 0, 0); //@line 7749
    _out_670($0, $76, $104); //@line 7750
    _pad_676($0, 32, $2, $106, $4 ^ 8192); //@line 7752
    $$sink560 = $106; //@line 7753
    break;
   }
   $$540 = ($3 | 0) < 0 ? 6 : $3; //@line 7757
   if ($36) {
    $113 = (HEAP32[$7 >> 2] | 0) + -28 | 0; //@line 7761
    HEAP32[$7 >> 2] = $113; //@line 7762
    $$3 = $35 * 268435456.0; //@line 7763
    $$pr = $113; //@line 7763
   } else {
    $$3 = $35; //@line 7766
    $$pr = HEAP32[$7 >> 2] | 0; //@line 7766
   }
   $$561 = ($$pr | 0) < 0 ? $6 : $6 + 288 | 0; //@line 7770
   $$0498 = $$561; //@line 7771
   $$4 = $$3; //@line 7771
   do {
    $116 = ~~$$4 >>> 0; //@line 7773
    HEAP32[$$0498 >> 2] = $116; //@line 7774
    $$0498 = $$0498 + 4 | 0; //@line 7775
    $$4 = ($$4 - +($116 >>> 0)) * 1.0e9; //@line 7778
   } while ($$4 != 0.0);
   if (($$pr | 0) > 0) {
    $$1482663 = $$561; //@line 7788
    $$1499662 = $$0498; //@line 7788
    $124 = $$pr; //@line 7788
    while (1) {
     $125 = ($124 | 0) < 29 ? $124 : 29; //@line 7791
     $$0488655 = $$1499662 + -4 | 0; //@line 7792
     if ($$0488655 >>> 0 < $$1482663 >>> 0) {
      $$2483$ph = $$1482663; //@line 7795
     } else {
      $$0488657 = $$0488655; //@line 7797
      $$0497656 = 0; //@line 7797
      do {
       $128 = _bitshift64Shl(HEAP32[$$0488657 >> 2] | 0, 0, $125 | 0) | 0; //@line 7800
       $130 = _i64Add($128 | 0, tempRet0 | 0, $$0497656 | 0, 0) | 0; //@line 7802
       $131 = tempRet0; //@line 7803
       $132 = ___uremdi3($130 | 0, $131 | 0, 1e9, 0) | 0; //@line 7804
       HEAP32[$$0488657 >> 2] = $132; //@line 7806
       $$0497656 = ___udivdi3($130 | 0, $131 | 0, 1e9, 0) | 0; //@line 7807
       $$0488657 = $$0488657 + -4 | 0; //@line 7809
      } while ($$0488657 >>> 0 >= $$1482663 >>> 0);
      if (!$$0497656) {
       $$2483$ph = $$1482663; //@line 7819
      } else {
       $138 = $$1482663 + -4 | 0; //@line 7821
       HEAP32[$138 >> 2] = $$0497656; //@line 7822
       $$2483$ph = $138; //@line 7823
      }
     }
     $$2500 = $$1499662; //@line 7826
     while (1) {
      if ($$2500 >>> 0 <= $$2483$ph >>> 0) {
       break;
      }
      $140 = $$2500 + -4 | 0; //@line 7832
      if (!(HEAP32[$140 >> 2] | 0)) {
       $$2500 = $140; //@line 7836
      } else {
       break;
      }
     }
     $144 = (HEAP32[$7 >> 2] | 0) - $125 | 0; //@line 7842
     HEAP32[$7 >> 2] = $144; //@line 7843
     if (($144 | 0) > 0) {
      $$1482663 = $$2483$ph; //@line 7846
      $$1499662 = $$2500; //@line 7846
      $124 = $144; //@line 7846
     } else {
      $$1482$lcssa = $$2483$ph; //@line 7848
      $$1499$lcssa = $$2500; //@line 7848
      $$pr566 = $144; //@line 7848
      break;
     }
    }
   } else {
    $$1482$lcssa = $$561; //@line 7853
    $$1499$lcssa = $$0498; //@line 7853
    $$pr566 = $$pr; //@line 7853
   }
   if (($$pr566 | 0) < 0) {
    $149 = (($$540 + 25 | 0) / 9 | 0) + 1 | 0; //@line 7859
    $150 = ($39 | 0) == 102; //@line 7860
    $$3484650 = $$1482$lcssa; //@line 7861
    $$3501649 = $$1499$lcssa; //@line 7861
    $152 = $$pr566; //@line 7861
    while (1) {
     $151 = 0 - $152 | 0; //@line 7863
     $154 = ($151 | 0) < 9 ? $151 : 9; //@line 7865
     if ($$3484650 >>> 0 < $$3501649 >>> 0) {
      $160 = (1 << $154) + -1 | 0; //@line 7869
      $161 = 1e9 >>> $154; //@line 7870
      $$0487644 = 0; //@line 7871
      $$1489643 = $$3484650; //@line 7871
      do {
       $162 = HEAP32[$$1489643 >> 2] | 0; //@line 7873
       HEAP32[$$1489643 >> 2] = ($162 >>> $154) + $$0487644; //@line 7877
       $$0487644 = Math_imul($162 & $160, $161) | 0; //@line 7878
       $$1489643 = $$1489643 + 4 | 0; //@line 7879
      } while ($$1489643 >>> 0 < $$3501649 >>> 0);
      $$$3484 = (HEAP32[$$3484650 >> 2] | 0) == 0 ? $$3484650 + 4 | 0 : $$3484650; //@line 7890
      if (!$$0487644) {
       $$$3484700 = $$$3484; //@line 7893
       $$4502 = $$3501649; //@line 7893
      } else {
       HEAP32[$$3501649 >> 2] = $$0487644; //@line 7896
       $$$3484700 = $$$3484; //@line 7897
       $$4502 = $$3501649 + 4 | 0; //@line 7897
      }
     } else {
      $$$3484700 = (HEAP32[$$3484650 >> 2] | 0) == 0 ? $$3484650 + 4 | 0 : $$3484650; //@line 7904
      $$4502 = $$3501649; //@line 7904
     }
     $174 = $150 ? $$561 : $$$3484700; //@line 7906
     $$$4502 = ($$4502 - $174 >> 2 | 0) > ($149 | 0) ? $174 + ($149 << 2) | 0 : $$4502; //@line 7913
     $152 = (HEAP32[$7 >> 2] | 0) + $154 | 0; //@line 7915
     HEAP32[$7 >> 2] = $152; //@line 7916
     if (($152 | 0) >= 0) {
      $$3484$lcssa = $$$3484700; //@line 7921
      $$3501$lcssa = $$$4502; //@line 7921
      break;
     } else {
      $$3484650 = $$$3484700; //@line 7919
      $$3501649 = $$$4502; //@line 7919
     }
    }
   } else {
    $$3484$lcssa = $$1482$lcssa; //@line 7926
    $$3501$lcssa = $$1499$lcssa; //@line 7926
   }
   $185 = $$561; //@line 7929
   if ($$3484$lcssa >>> 0 < $$3501$lcssa >>> 0) {
    $189 = ($185 - $$3484$lcssa >> 2) * 9 | 0; //@line 7934
    $190 = HEAP32[$$3484$lcssa >> 2] | 0; //@line 7935
    if ($190 >>> 0 < 10) {
     $$1515 = $189; //@line 7938
    } else {
     $$0514639 = $189; //@line 7940
     $$0530638 = 10; //@line 7940
     while (1) {
      $$0530638 = $$0530638 * 10 | 0; //@line 7942
      $193 = $$0514639 + 1 | 0; //@line 7943
      if ($190 >>> 0 < $$0530638 >>> 0) {
       $$1515 = $193; //@line 7946
       break;
      } else {
       $$0514639 = $193; //@line 7949
      }
     }
    }
   } else {
    $$1515 = 0; //@line 7954
   }
   $198 = ($39 | 0) == 103; //@line 7959
   $199 = ($$540 | 0) != 0; //@line 7960
   $201 = $$540 - (($39 | 0) != 102 ? $$1515 : 0) + (($199 & $198) << 31 >> 31) | 0; //@line 7963
   if (($201 | 0) < ((($$3501$lcssa - $185 >> 2) * 9 | 0) + -9 | 0)) {
    $209 = $201 + 9216 | 0; //@line 7972
    $212 = $$561 + 4 + ((($209 | 0) / 9 | 0) + -1024 << 2) | 0; //@line 7975
    $213 = ($209 | 0) % 9 | 0; //@line 7976
    if (($213 | 0) < 8) {
     $$0527$in633 = $213; //@line 7979
     $$1531632 = 10; //@line 7979
     while (1) {
      $215 = $$1531632 * 10 | 0; //@line 7982
      if (($$0527$in633 | 0) < 7) {
       $$0527$in633 = $$0527$in633 + 1 | 0; //@line 7985
       $$1531632 = $215; //@line 7985
      } else {
       $$1531$lcssa = $215; //@line 7987
       break;
      }
     }
    } else {
     $$1531$lcssa = 10; //@line 7992
    }
    $217 = HEAP32[$212 >> 2] | 0; //@line 7994
    $218 = ($217 >>> 0) % ($$1531$lcssa >>> 0) | 0; //@line 7995
    $221 = ($212 + 4 | 0) == ($$3501$lcssa | 0); //@line 7998
    if ($221 & ($218 | 0) == 0) {
     $$4492 = $212; //@line 8001
     $$4518 = $$1515; //@line 8001
     $$8 = $$3484$lcssa; //@line 8001
    } else {
     $$543 = ((($217 >>> 0) / ($$1531$lcssa >>> 0) | 0) & 1 | 0) == 0 ? 9007199254740992.0 : 9007199254740994.0; //@line 8006
     $225 = ($$1531$lcssa | 0) / 2 | 0; //@line 8007
     $$$564 = $218 >>> 0 < $225 >>> 0 ? .5 : $221 & ($218 | 0) == ($225 | 0) ? 1.0 : 1.5; //@line 8012
     if (!$$0520) {
      $$1467 = $$$564; //@line 8015
      $$1469 = $$543; //@line 8015
     } else {
      $230 = (HEAP8[$$0521 >> 0] | 0) == 45; //@line 8018
      $$1467 = $230 ? -$$$564 : $$$564; //@line 8023
      $$1469 = $230 ? -$$543 : $$543; //@line 8023
     }
     $233 = $217 - $218 | 0; //@line 8025
     HEAP32[$212 >> 2] = $233; //@line 8026
     if ($$1469 + $$1467 != $$1469) {
      $236 = $233 + $$1531$lcssa | 0; //@line 8030
      HEAP32[$212 >> 2] = $236; //@line 8031
      if ($236 >>> 0 > 999999999) {
       $$5486626 = $$3484$lcssa; //@line 8034
       $$sink547625 = $212; //@line 8034
       while (1) {
        $238 = $$sink547625 + -4 | 0; //@line 8036
        HEAP32[$$sink547625 >> 2] = 0; //@line 8037
        if ($238 >>> 0 < $$5486626 >>> 0) {
         $240 = $$5486626 + -4 | 0; //@line 8040
         HEAP32[$240 >> 2] = 0; //@line 8041
         $$6 = $240; //@line 8042
        } else {
         $$6 = $$5486626; //@line 8044
        }
        $242 = (HEAP32[$238 >> 2] | 0) + 1 | 0; //@line 8047
        HEAP32[$238 >> 2] = $242; //@line 8048
        if ($242 >>> 0 > 999999999) {
         $$5486626 = $$6; //@line 8051
         $$sink547625 = $238; //@line 8051
        } else {
         $$5486$lcssa = $$6; //@line 8053
         $$sink547$lcssa = $238; //@line 8053
         break;
        }
       }
      } else {
       $$5486$lcssa = $$3484$lcssa; //@line 8058
       $$sink547$lcssa = $212; //@line 8058
      }
      $247 = ($185 - $$5486$lcssa >> 2) * 9 | 0; //@line 8063
      $248 = HEAP32[$$5486$lcssa >> 2] | 0; //@line 8064
      if ($248 >>> 0 < 10) {
       $$4492 = $$sink547$lcssa; //@line 8067
       $$4518 = $247; //@line 8067
       $$8 = $$5486$lcssa; //@line 8067
      } else {
       $$2516621 = $247; //@line 8069
       $$2532620 = 10; //@line 8069
       while (1) {
        $$2532620 = $$2532620 * 10 | 0; //@line 8071
        $251 = $$2516621 + 1 | 0; //@line 8072
        if ($248 >>> 0 < $$2532620 >>> 0) {
         $$4492 = $$sink547$lcssa; //@line 8075
         $$4518 = $251; //@line 8075
         $$8 = $$5486$lcssa; //@line 8075
         break;
        } else {
         $$2516621 = $251; //@line 8078
        }
       }
      }
     } else {
      $$4492 = $212; //@line 8083
      $$4518 = $$1515; //@line 8083
      $$8 = $$3484$lcssa; //@line 8083
     }
    }
    $253 = $$4492 + 4 | 0; //@line 8086
    $$5519$ph = $$4518; //@line 8089
    $$7505$ph = $$3501$lcssa >>> 0 > $253 >>> 0 ? $253 : $$3501$lcssa; //@line 8089
    $$9$ph = $$8; //@line 8089
   } else {
    $$5519$ph = $$1515; //@line 8091
    $$7505$ph = $$3501$lcssa; //@line 8091
    $$9$ph = $$3484$lcssa; //@line 8091
   }
   $$7505 = $$7505$ph; //@line 8093
   while (1) {
    if ($$7505 >>> 0 <= $$9$ph >>> 0) {
     $$lcssa675 = 0; //@line 8097
     break;
    }
    $256 = $$7505 + -4 | 0; //@line 8100
    if (!(HEAP32[$256 >> 2] | 0)) {
     $$7505 = $256; //@line 8104
    } else {
     $$lcssa675 = 1; //@line 8106
     break;
    }
   }
   $259 = 0 - $$5519$ph | 0; //@line 8110
   do {
    if ($198) {
     $$540$ = $$540 + (($199 ^ 1) & 1) | 0; //@line 8115
     if (($$540$ | 0) > ($$5519$ph | 0) & ($$5519$ph | 0) > -5) {
      $$0479 = $5 + -1 | 0; //@line 8123
      $$2476 = $$540$ + -1 - $$5519$ph | 0; //@line 8123
     } else {
      $$0479 = $5 + -2 | 0; //@line 8127
      $$2476 = $$540$ + -1 | 0; //@line 8127
     }
     $267 = $4 & 8; //@line 8129
     if (!$267) {
      if ($$lcssa675) {
       $270 = HEAP32[$$7505 + -4 >> 2] | 0; //@line 8134
       if (!$270) {
        $$2529 = 9; //@line 8137
       } else {
        if (!(($270 >>> 0) % 10 | 0)) {
         $$1528617 = 0; //@line 8142
         $$3533616 = 10; //@line 8142
         while (1) {
          $$3533616 = $$3533616 * 10 | 0; //@line 8144
          $275 = $$1528617 + 1 | 0; //@line 8145
          if (($270 >>> 0) % ($$3533616 >>> 0) | 0 | 0) {
           $$2529 = $275; //@line 8151
           break;
          } else {
           $$1528617 = $275; //@line 8149
          }
         }
        } else {
         $$2529 = 0; //@line 8156
        }
       }
      } else {
       $$2529 = 9; //@line 8160
      }
      $284 = (($$7505 - $185 >> 2) * 9 | 0) + -9 | 0; //@line 8168
      if (($$0479 | 32 | 0) == 102) {
       $285 = $284 - $$2529 | 0; //@line 8170
       $$548 = ($285 | 0) > 0 ? $285 : 0; //@line 8172
       $$1480 = $$0479; //@line 8175
       $$3477 = ($$2476 | 0) < ($$548 | 0) ? $$2476 : $$548; //@line 8175
       $$pre$phi698Z2D = 0; //@line 8175
       break;
      } else {
       $289 = $284 + $$5519$ph - $$2529 | 0; //@line 8179
       $$550 = ($289 | 0) > 0 ? $289 : 0; //@line 8181
       $$1480 = $$0479; //@line 8184
       $$3477 = ($$2476 | 0) < ($$550 | 0) ? $$2476 : $$550; //@line 8184
       $$pre$phi698Z2D = 0; //@line 8184
       break;
      }
     } else {
      $$1480 = $$0479; //@line 8188
      $$3477 = $$2476; //@line 8188
      $$pre$phi698Z2D = $267; //@line 8188
     }
    } else {
     $$1480 = $5; //@line 8192
     $$3477 = $$540; //@line 8192
     $$pre$phi698Z2D = $4 & 8; //@line 8192
    }
   } while (0);
   $292 = $$3477 | $$pre$phi698Z2D; //@line 8195
   $294 = ($292 | 0) != 0 & 1; //@line 8197
   $296 = ($$1480 | 32 | 0) == 102; //@line 8199
   if ($296) {
    $$2513 = 0; //@line 8203
    $$pn = ($$5519$ph | 0) > 0 ? $$5519$ph : 0; //@line 8203
   } else {
    $300 = ($$5519$ph | 0) < 0 ? $259 : $$5519$ph; //@line 8206
    $303 = _fmt_u($300, (($300 | 0) < 0) << 31 >> 31, $11) | 0; //@line 8209
    $304 = $11; //@line 8210
    if (($304 - $303 | 0) < 2) {
     $$1512610 = $303; //@line 8215
     while (1) {
      $308 = $$1512610 + -1 | 0; //@line 8217
      HEAP8[$308 >> 0] = 48; //@line 8218
      if (($304 - $308 | 0) < 2) {
       $$1512610 = $308; //@line 8223
      } else {
       $$1512$lcssa = $308; //@line 8225
       break;
      }
     }
    } else {
     $$1512$lcssa = $303; //@line 8230
    }
    HEAP8[$$1512$lcssa + -1 >> 0] = ($$5519$ph >> 31 & 2) + 43; //@line 8237
    $318 = $$1512$lcssa + -2 | 0; //@line 8239
    HEAP8[$318 >> 0] = $$1480; //@line 8240
    $$2513 = $318; //@line 8243
    $$pn = $304 - $318 | 0; //@line 8243
   }
   $323 = $$0520 + 1 + $$3477 + $294 + $$pn | 0; //@line 8248
   _pad_676($0, 32, $2, $323, $4); //@line 8249
   _out_670($0, $$0521, $$0520); //@line 8250
   _pad_676($0, 48, $2, $323, $4 ^ 65536); //@line 8252
   if ($296) {
    $$0496$$9 = $$9$ph >>> 0 > $$561 >>> 0 ? $$561 : $$9$ph; //@line 8255
    $326 = $8 + 9 | 0; //@line 8256
    $327 = $326; //@line 8257
    $328 = $8 + 8 | 0; //@line 8258
    $$5493600 = $$0496$$9; //@line 8259
    do {
     $330 = _fmt_u(HEAP32[$$5493600 >> 2] | 0, 0, $326) | 0; //@line 8262
     if (($$5493600 | 0) == ($$0496$$9 | 0)) {
      if (($330 | 0) == ($326 | 0)) {
       HEAP8[$328 >> 0] = 48; //@line 8267
       $$1465 = $328; //@line 8268
      } else {
       $$1465 = $330; //@line 8270
      }
     } else {
      if ($330 >>> 0 > $8 >>> 0) {
       _memset($8 | 0, 48, $330 - $9 | 0) | 0; //@line 8277
       $$0464597 = $330; //@line 8278
       while (1) {
        $335 = $$0464597 + -1 | 0; //@line 8280
        if ($335 >>> 0 > $8 >>> 0) {
         $$0464597 = $335; //@line 8283
        } else {
         $$1465 = $335; //@line 8285
         break;
        }
       }
      } else {
       $$1465 = $330; //@line 8290
      }
     }
     _out_670($0, $$1465, $327 - $$1465 | 0); //@line 8295
     $$5493600 = $$5493600 + 4 | 0; //@line 8296
    } while ($$5493600 >>> 0 <= $$561 >>> 0);
    if ($292 | 0) {
     _out_670($0, 1910, 1); //@line 8306
    }
    if ($$5493600 >>> 0 < $$7505 >>> 0 & ($$3477 | 0) > 0) {
     $$4478593 = $$3477; //@line 8312
     $$6494592 = $$5493600; //@line 8312
     while (1) {
      $347 = _fmt_u(HEAP32[$$6494592 >> 2] | 0, 0, $326) | 0; //@line 8315
      if ($347 >>> 0 > $8 >>> 0) {
       _memset($8 | 0, 48, $347 - $9 | 0) | 0; //@line 8320
       $$0463587 = $347; //@line 8321
       while (1) {
        $351 = $$0463587 + -1 | 0; //@line 8323
        if ($351 >>> 0 > $8 >>> 0) {
         $$0463587 = $351; //@line 8326
        } else {
         $$0463$lcssa = $351; //@line 8328
         break;
        }
       }
      } else {
       $$0463$lcssa = $347; //@line 8333
      }
      _out_670($0, $$0463$lcssa, ($$4478593 | 0) < 9 ? $$4478593 : 9); //@line 8337
      $$6494592 = $$6494592 + 4 | 0; //@line 8338
      $356 = $$4478593 + -9 | 0; //@line 8339
      if (!($$6494592 >>> 0 < $$7505 >>> 0 & ($$4478593 | 0) > 9)) {
       $$4478$lcssa = $356; //@line 8346
       break;
      } else {
       $$4478593 = $356; //@line 8344
      }
     }
    } else {
     $$4478$lcssa = $$3477; //@line 8351
    }
    _pad_676($0, 48, $$4478$lcssa + 9 | 0, 9, 0); //@line 8354
   } else {
    $$7505$ = $$lcssa675 ? $$7505 : $$9$ph + 4 | 0; //@line 8357
    if (($$3477 | 0) > -1) {
     $363 = $8 + 9 | 0; //@line 8360
     $364 = ($$pre$phi698Z2D | 0) == 0; //@line 8361
     $365 = $363; //@line 8362
     $366 = 0 - $9 | 0; //@line 8363
     $367 = $8 + 8 | 0; //@line 8364
     $$5605 = $$3477; //@line 8365
     $$7495604 = $$9$ph; //@line 8365
     while (1) {
      $369 = _fmt_u(HEAP32[$$7495604 >> 2] | 0, 0, $363) | 0; //@line 8368
      if (($369 | 0) == ($363 | 0)) {
       HEAP8[$367 >> 0] = 48; //@line 8371
       $$0 = $367; //@line 8372
      } else {
       $$0 = $369; //@line 8374
      }
      do {
       if (($$7495604 | 0) == ($$9$ph | 0)) {
        $375 = $$0 + 1 | 0; //@line 8379
        _out_670($0, $$0, 1); //@line 8380
        if ($364 & ($$5605 | 0) < 1) {
         $$2 = $375; //@line 8384
         break;
        }
        _out_670($0, 1910, 1); //@line 8387
        $$2 = $375; //@line 8388
       } else {
        if ($$0 >>> 0 <= $8 >>> 0) {
         $$2 = $$0; //@line 8392
         break;
        }
        _memset($8 | 0, 48, $$0 + $366 | 0) | 0; //@line 8397
        $$1601 = $$0; //@line 8398
        while (1) {
         $373 = $$1601 + -1 | 0; //@line 8400
         if ($373 >>> 0 > $8 >>> 0) {
          $$1601 = $373; //@line 8403
         } else {
          $$2 = $373; //@line 8405
          break;
         }
        }
       }
      } while (0);
      $378 = $365 - $$2 | 0; //@line 8412
      _out_670($0, $$2, ($$5605 | 0) > ($378 | 0) ? $378 : $$5605); //@line 8415
      $381 = $$5605 - $378 | 0; //@line 8416
      $$7495604 = $$7495604 + 4 | 0; //@line 8417
      if (!($$7495604 >>> 0 < $$7505$ >>> 0 & ($381 | 0) > -1)) {
       $$5$lcssa = $381; //@line 8424
       break;
      } else {
       $$5605 = $381; //@line 8422
      }
     }
    } else {
     $$5$lcssa = $$3477; //@line 8429
    }
    _pad_676($0, 48, $$5$lcssa + 18 | 0, 18, 0); //@line 8432
    _out_670($0, $$2513, $11 - $$2513 | 0); //@line 8436
   }
   _pad_676($0, 32, $2, $323, $4 ^ 8192); //@line 8439
   $$sink560 = $323; //@line 8440
  }
 } while (0);
 STACKTOP = sp; //@line 8445
 return (($$sink560 | 0) < ($2 | 0) ? $2 : $$sink560) | 0; //@line 8445
}
function _printf_core($0, $1, $2, $3, $4) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 var $$$5 = 0, $$0 = 0, $$0228 = 0, $$0229316 = 0, $$0232 = 0, $$0235 = 0, $$0237 = 0, $$0240$lcssa = 0, $$0240$lcssa356 = 0, $$0240315 = 0, $$0243 = 0, $$0247 = 0, $$0249$lcssa = 0, $$0249303 = 0, $$0252 = 0, $$0253 = 0, $$0254 = 0, $$0259 = 0, $$0262$lcssa = 0, $$0262309 = 0, $$0269 = 0, $$1 = 0, $$1230327 = 0, $$1233 = 0, $$1236 = 0, $$1238 = 0, $$1241326 = 0, $$1244314 = 0, $$1248 = 0, $$1255 = 0, $$1260 = 0, $$1263 = 0, $$1263$ = 0, $$1270 = 0, $$2 = 0, $$2234 = 0, $$2239 = 0, $$2242$lcssa = 0, $$2242302 = 0, $$2245 = 0, $$2251 = 0, $$2256 = 0, $$2261 = 0, $$2271 = 0, $$3265 = 0, $$3272 = 0, $$3300 = 0, $$4258354 = 0, $$4266 = 0, $$5 = 0, $$6268 = 0, $$lcssa291 = 0, $$lcssa292 = 0, $$pre342 = 0, $$pre345 = 0, $$pre348 = 0, $$sink = 0, $10 = 0, $105 = 0, $106 = 0, $109 = 0, $11 = 0, $112 = 0, $115 = 0, $12 = 0, $125 = 0, $129 = 0, $13 = 0, $14 = 0, $140 = 0, $144 = 0, $151 = 0, $152 = 0, $154 = 0, $156 = 0, $158 = 0, $167 = 0, $168 = 0, $173 = 0, $176 = 0, $181 = 0, $182 = 0, $187 = 0, $189 = 0, $196 = 0, $197 = 0, $20 = 0, $208 = 0, $21 = 0, $220 = 0, $227 = 0, $229 = 0, $23 = 0, $232 = 0, $234 = 0, $24 = 0, $242 = 0, $244 = 0, $247 = 0, $248 = 0, $25 = 0, $252 = 0, $256 = 0, $258 = 0, $261 = 0, $263 = 0, $264 = 0, $265 = 0, $27 = 0, $275 = 0, $276 = 0, $281 = 0, $283 = 0, $284 = 0, $290 = 0, $30 = 0, $302 = 0, $305 = 0, $306 = 0, $318 = 0, $320 = 0, $325 = 0, $329 = 0, $331 = 0, $343 = 0, $345 = 0, $352 = 0, $356 = 0, $36 = 0, $363 = 0, $364 = 0, $365 = 0, $43 = 0, $5 = 0, $51 = 0, $52 = 0, $54 = 0, $6 = 0, $60 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0, $68 = 0, $7 = 0, $79 = 0, $8 = 0, $83 = 0, $9 = 0, $or$cond = 0, $or$cond278 = 0, $storemerge274 = 0, label = 0, sp = 0, $158$looptemp = 0;
 sp = STACKTOP; //@line 6123
 STACKTOP = STACKTOP + 64 | 0; //@line 6124
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(64); //@line 6124
 $5 = sp + 16 | 0; //@line 6125
 $6 = sp; //@line 6126
 $7 = sp + 24 | 0; //@line 6127
 $8 = sp + 8 | 0; //@line 6128
 $9 = sp + 20 | 0; //@line 6129
 HEAP32[$5 >> 2] = $1; //@line 6130
 $10 = ($0 | 0) != 0; //@line 6131
 $11 = $7 + 40 | 0; //@line 6132
 $12 = $11; //@line 6133
 $13 = $7 + 39 | 0; //@line 6134
 $14 = $8 + 4 | 0; //@line 6135
 $$0243 = 0; //@line 6136
 $$0247 = 0; //@line 6136
 $$0269 = 0; //@line 6136
 L1 : while (1) {
  do {
   if (($$0247 | 0) > -1) {
    if (($$0243 | 0) > (2147483647 - $$0247 | 0)) {
     HEAP32[(___errno_location() | 0) >> 2] = 75; //@line 6145
     $$1248 = -1; //@line 6146
     break;
    } else {
     $$1248 = $$0243 + $$0247 | 0; //@line 6150
     break;
    }
   } else {
    $$1248 = $$0247; //@line 6154
   }
  } while (0);
  $20 = HEAP32[$5 >> 2] | 0; //@line 6157
  $21 = HEAP8[$20 >> 0] | 0; //@line 6158
  if (!($21 << 24 >> 24)) {
   label = 88; //@line 6161
   break;
  } else {
   $23 = $21; //@line 6164
   $25 = $20; //@line 6164
  }
  L9 : while (1) {
   switch ($23 << 24 >> 24) {
   case 37:
    {
     $$0249303 = $25; //@line 6169
     $27 = $25; //@line 6169
     label = 9; //@line 6170
     break L9;
     break;
    }
   case 0:
    {
     $$0249$lcssa = $25; //@line 6175
     break L9;
     break;
    }
   default:
    {}
   }
   $24 = $25 + 1 | 0; //@line 6182
   HEAP32[$5 >> 2] = $24; //@line 6183
   $23 = HEAP8[$24 >> 0] | 0; //@line 6185
   $25 = $24; //@line 6185
  }
  L12 : do {
   if ((label | 0) == 9) {
    while (1) {
     label = 0; //@line 6190
     if ((HEAP8[$27 + 1 >> 0] | 0) != 37) {
      $$0249$lcssa = $$0249303; //@line 6195
      break L12;
     }
     $30 = $$0249303 + 1 | 0; //@line 6198
     $27 = $27 + 2 | 0; //@line 6199
     HEAP32[$5 >> 2] = $27; //@line 6200
     if ((HEAP8[$27 >> 0] | 0) != 37) {
      $$0249$lcssa = $30; //@line 6207
      break;
     } else {
      $$0249303 = $30; //@line 6204
      label = 9; //@line 6205
     }
    }
   }
  } while (0);
  $36 = $$0249$lcssa - $20 | 0; //@line 6215
  if ($10) {
   _out_670($0, $20, $36); //@line 6217
  }
  if ($36 | 0) {
   $$0243 = $36; //@line 6221
   $$0247 = $$1248; //@line 6221
   continue;
  }
  $43 = (_isdigit(HEAP8[(HEAP32[$5 >> 2] | 0) + 1 >> 0] | 0) | 0) == 0; //@line 6229
  $$pre342 = HEAP32[$5 >> 2] | 0; //@line 6230
  if ($43) {
   $$0253 = -1; //@line 6232
   $$1270 = $$0269; //@line 6232
   $$sink = 1; //@line 6232
  } else {
   if ((HEAP8[$$pre342 + 2 >> 0] | 0) == 36) {
    $$0253 = (HEAP8[$$pre342 + 1 >> 0] | 0) + -48 | 0; //@line 6242
    $$1270 = 1; //@line 6242
    $$sink = 3; //@line 6242
   } else {
    $$0253 = -1; //@line 6244
    $$1270 = $$0269; //@line 6244
    $$sink = 1; //@line 6244
   }
  }
  $51 = $$pre342 + $$sink | 0; //@line 6247
  HEAP32[$5 >> 2] = $51; //@line 6248
  $52 = HEAP8[$51 >> 0] | 0; //@line 6249
  $54 = ($52 << 24 >> 24) + -32 | 0; //@line 6251
  if ($54 >>> 0 > 31 | (1 << $54 & 75913 | 0) == 0) {
   $$0262$lcssa = 0; //@line 6258
   $$lcssa291 = $52; //@line 6258
   $$lcssa292 = $51; //@line 6258
  } else {
   $$0262309 = 0; //@line 6260
   $60 = $52; //@line 6260
   $65 = $51; //@line 6260
   while (1) {
    $63 = 1 << ($60 << 24 >> 24) + -32 | $$0262309; //@line 6265
    $64 = $65 + 1 | 0; //@line 6266
    HEAP32[$5 >> 2] = $64; //@line 6267
    $66 = HEAP8[$64 >> 0] | 0; //@line 6268
    $68 = ($66 << 24 >> 24) + -32 | 0; //@line 6270
    if ($68 >>> 0 > 31 | (1 << $68 & 75913 | 0) == 0) {
     $$0262$lcssa = $63; //@line 6277
     $$lcssa291 = $66; //@line 6277
     $$lcssa292 = $64; //@line 6277
     break;
    } else {
     $$0262309 = $63; //@line 6280
     $60 = $66; //@line 6280
     $65 = $64; //@line 6280
    }
   }
  }
  if ($$lcssa291 << 24 >> 24 == 42) {
   if (!(_isdigit(HEAP8[$$lcssa292 + 1 >> 0] | 0) | 0)) {
    label = 23; //@line 6292
   } else {
    $79 = HEAP32[$5 >> 2] | 0; //@line 6294
    if ((HEAP8[$79 + 2 >> 0] | 0) == 36) {
     $83 = $79 + 1 | 0; //@line 6299
     HEAP32[$4 + ((HEAP8[$83 >> 0] | 0) + -48 << 2) >> 2] = 10; //@line 6304
     $$0259 = HEAP32[$3 + ((HEAP8[$83 >> 0] | 0) + -48 << 3) >> 2] | 0; //@line 6316
     $$2271 = 1; //@line 6316
     $storemerge274 = $79 + 3 | 0; //@line 6316
    } else {
     label = 23; //@line 6318
    }
   }
   if ((label | 0) == 23) {
    label = 0; //@line 6322
    if ($$1270 | 0) {
     $$0 = -1; //@line 6325
     break;
    }
    if ($10) {
     $105 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 6340
     $106 = HEAP32[$105 >> 2] | 0; //@line 6341
     HEAP32[$2 >> 2] = $105 + 4; //@line 6343
     $363 = $106; //@line 6344
    } else {
     $363 = 0; //@line 6346
    }
    $$0259 = $363; //@line 6350
    $$2271 = 0; //@line 6350
    $storemerge274 = (HEAP32[$5 >> 2] | 0) + 1 | 0; //@line 6350
   }
   HEAP32[$5 >> 2] = $storemerge274; //@line 6352
   $109 = ($$0259 | 0) < 0; //@line 6353
   $$1260 = $109 ? 0 - $$0259 | 0 : $$0259; //@line 6358
   $$1263 = $109 ? $$0262$lcssa | 8192 : $$0262$lcssa; //@line 6358
   $$3272 = $$2271; //@line 6358
   $115 = $storemerge274; //@line 6358
  } else {
   $112 = _getint_671($5) | 0; //@line 6360
   if (($112 | 0) < 0) {
    $$0 = -1; //@line 6363
    break;
   }
   $$1260 = $112; //@line 6367
   $$1263 = $$0262$lcssa; //@line 6367
   $$3272 = $$1270; //@line 6367
   $115 = HEAP32[$5 >> 2] | 0; //@line 6367
  }
  do {
   if ((HEAP8[$115 >> 0] | 0) == 46) {
    if ((HEAP8[$115 + 1 >> 0] | 0) != 42) {
     HEAP32[$5 >> 2] = $115 + 1; //@line 6378
     $156 = _getint_671($5) | 0; //@line 6379
     $$0254 = $156; //@line 6381
     $$pre345 = HEAP32[$5 >> 2] | 0; //@line 6381
     break;
    }
    if (_isdigit(HEAP8[$115 + 2 >> 0] | 0) | 0) {
     $125 = HEAP32[$5 >> 2] | 0; //@line 6390
     if ((HEAP8[$125 + 3 >> 0] | 0) == 36) {
      $129 = $125 + 2 | 0; //@line 6395
      HEAP32[$4 + ((HEAP8[$129 >> 0] | 0) + -48 << 2) >> 2] = 10; //@line 6400
      $140 = HEAP32[$3 + ((HEAP8[$129 >> 0] | 0) + -48 << 3) >> 2] | 0; //@line 6407
      $144 = $125 + 4 | 0; //@line 6411
      HEAP32[$5 >> 2] = $144; //@line 6412
      $$0254 = $140; //@line 6413
      $$pre345 = $144; //@line 6413
      break;
     }
    }
    if ($$3272 | 0) {
     $$0 = -1; //@line 6419
     break L1;
    }
    if ($10) {
     $151 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 6434
     $152 = HEAP32[$151 >> 2] | 0; //@line 6435
     HEAP32[$2 >> 2] = $151 + 4; //@line 6437
     $364 = $152; //@line 6438
    } else {
     $364 = 0; //@line 6440
    }
    $154 = (HEAP32[$5 >> 2] | 0) + 2 | 0; //@line 6443
    HEAP32[$5 >> 2] = $154; //@line 6444
    $$0254 = $364; //@line 6445
    $$pre345 = $154; //@line 6445
   } else {
    $$0254 = -1; //@line 6447
    $$pre345 = $115; //@line 6447
   }
  } while (0);
  $$0252 = 0; //@line 6450
  $158 = $$pre345; //@line 6450
  while (1) {
   if (((HEAP8[$158 >> 0] | 0) + -65 | 0) >>> 0 > 57) {
    $$0 = -1; //@line 6457
    break L1;
   }
   $158$looptemp = $158;
   $158 = $158 + 1 | 0; //@line 6460
   HEAP32[$5 >> 2] = $158; //@line 6461
   $167 = HEAP8[(HEAP8[$158$looptemp >> 0] | 0) + -65 + (1378 + ($$0252 * 58 | 0)) >> 0] | 0; //@line 6466
   $168 = $167 & 255; //@line 6467
   if (($168 + -1 | 0) >>> 0 >= 8) {
    break;
   } else {
    $$0252 = $168; //@line 6471
   }
  }
  if (!($167 << 24 >> 24)) {
   $$0 = -1; //@line 6478
   break;
  }
  $173 = ($$0253 | 0) > -1; //@line 6482
  do {
   if ($167 << 24 >> 24 == 19) {
    if ($173) {
     $$0 = -1; //@line 6486
     break L1;
    } else {
     label = 50; //@line 6489
    }
   } else {
    if ($173) {
     HEAP32[$4 + ($$0253 << 2) >> 2] = $168; //@line 6494
     $176 = $3 + ($$0253 << 3) | 0; //@line 6496
     $181 = HEAP32[$176 + 4 >> 2] | 0; //@line 6501
     $182 = $6; //@line 6502
     HEAP32[$182 >> 2] = HEAP32[$176 >> 2]; //@line 6504
     HEAP32[$182 + 4 >> 2] = $181; //@line 6507
     label = 50; //@line 6508
     break;
    }
    if (!$10) {
     $$0 = 0; //@line 6512
     break L1;
    }
    _pop_arg_673($6, $168, $2); //@line 6515
    $187 = HEAP32[$5 >> 2] | 0; //@line 6517
   }
  } while (0);
  if ((label | 0) == 50) {
   label = 0; //@line 6521
   if ($10) {
    $187 = $158; //@line 6523
   } else {
    $$0243 = 0; //@line 6525
    $$0247 = $$1248; //@line 6525
    $$0269 = $$3272; //@line 6525
    continue;
   }
  }
  $189 = HEAP8[$187 + -1 >> 0] | 0; //@line 6531
  $$0235 = ($$0252 | 0) != 0 & ($189 & 15 | 0) == 3 ? $189 & -33 : $189; //@line 6537
  $196 = $$1263 & -65537; //@line 6540
  $$1263$ = ($$1263 & 8192 | 0) == 0 ? $$1263 : $196; //@line 6541
  L73 : do {
   switch ($$0235 | 0) {
   case 110:
    {
     switch (($$0252 & 255) << 24 >> 24) {
     case 0:
      {
       HEAP32[HEAP32[$6 >> 2] >> 2] = $$1248; //@line 6549
       $$0243 = 0; //@line 6550
       $$0247 = $$1248; //@line 6550
       $$0269 = $$3272; //@line 6550
       continue L1;
       break;
      }
     case 1:
      {
       HEAP32[HEAP32[$6 >> 2] >> 2] = $$1248; //@line 6556
       $$0243 = 0; //@line 6557
       $$0247 = $$1248; //@line 6557
       $$0269 = $$3272; //@line 6557
       continue L1;
       break;
      }
     case 2:
      {
       $208 = HEAP32[$6 >> 2] | 0; //@line 6565
       HEAP32[$208 >> 2] = $$1248; //@line 6567
       HEAP32[$208 + 4 >> 2] = (($$1248 | 0) < 0) << 31 >> 31; //@line 6570
       $$0243 = 0; //@line 6571
       $$0247 = $$1248; //@line 6571
       $$0269 = $$3272; //@line 6571
       continue L1;
       break;
      }
     case 3:
      {
       HEAP16[HEAP32[$6 >> 2] >> 1] = $$1248; //@line 6578
       $$0243 = 0; //@line 6579
       $$0247 = $$1248; //@line 6579
       $$0269 = $$3272; //@line 6579
       continue L1;
       break;
      }
     case 4:
      {
       HEAP8[HEAP32[$6 >> 2] >> 0] = $$1248; //@line 6586
       $$0243 = 0; //@line 6587
       $$0247 = $$1248; //@line 6587
       $$0269 = $$3272; //@line 6587
       continue L1;
       break;
      }
     case 6:
      {
       HEAP32[HEAP32[$6 >> 2] >> 2] = $$1248; //@line 6593
       $$0243 = 0; //@line 6594
       $$0247 = $$1248; //@line 6594
       $$0269 = $$3272; //@line 6594
       continue L1;
       break;
      }
     case 7:
      {
       $220 = HEAP32[$6 >> 2] | 0; //@line 6602
       HEAP32[$220 >> 2] = $$1248; //@line 6604
       HEAP32[$220 + 4 >> 2] = (($$1248 | 0) < 0) << 31 >> 31; //@line 6607
       $$0243 = 0; //@line 6608
       $$0247 = $$1248; //@line 6608
       $$0269 = $$3272; //@line 6608
       continue L1;
       break;
      }
     default:
      {
       $$0243 = 0; //@line 6613
       $$0247 = $$1248; //@line 6613
       $$0269 = $$3272; //@line 6613
       continue L1;
      }
     }
     break;
    }
   case 112:
    {
     $$1236 = 120; //@line 6623
     $$1255 = $$0254 >>> 0 > 8 ? $$0254 : 8; //@line 6623
     $$3265 = $$1263$ | 8; //@line 6623
     label = 62; //@line 6624
     break;
    }
   case 88:
   case 120:
    {
     $$1236 = $$0235; //@line 6628
     $$1255 = $$0254; //@line 6628
     $$3265 = $$1263$; //@line 6628
     label = 62; //@line 6629
     break;
    }
   case 111:
    {
     $242 = $6; //@line 6633
     $244 = HEAP32[$242 >> 2] | 0; //@line 6635
     $247 = HEAP32[$242 + 4 >> 2] | 0; //@line 6638
     $248 = _fmt_o($244, $247, $11) | 0; //@line 6639
     $252 = $12 - $248 | 0; //@line 6643
     $$0228 = $248; //@line 6648
     $$1233 = 0; //@line 6648
     $$1238 = 1842; //@line 6648
     $$2256 = ($$1263$ & 8 | 0) == 0 | ($$0254 | 0) > ($252 | 0) ? $$0254 : $252 + 1 | 0; //@line 6648
     $$4266 = $$1263$; //@line 6648
     $281 = $244; //@line 6648
     $283 = $247; //@line 6648
     label = 68; //@line 6649
     break;
    }
   case 105:
   case 100:
    {
     $256 = $6; //@line 6653
     $258 = HEAP32[$256 >> 2] | 0; //@line 6655
     $261 = HEAP32[$256 + 4 >> 2] | 0; //@line 6658
     if (($261 | 0) < 0) {
      $263 = _i64Subtract(0, 0, $258 | 0, $261 | 0) | 0; //@line 6661
      $264 = tempRet0; //@line 6662
      $265 = $6; //@line 6663
      HEAP32[$265 >> 2] = $263; //@line 6665
      HEAP32[$265 + 4 >> 2] = $264; //@line 6668
      $$0232 = 1; //@line 6669
      $$0237 = 1842; //@line 6669
      $275 = $263; //@line 6669
      $276 = $264; //@line 6669
      label = 67; //@line 6670
      break L73;
     } else {
      $$0232 = ($$1263$ & 2049 | 0) != 0 & 1; //@line 6682
      $$0237 = ($$1263$ & 2048 | 0) == 0 ? ($$1263$ & 1 | 0) == 0 ? 1842 : 1844 : 1843; //@line 6682
      $275 = $258; //@line 6682
      $276 = $261; //@line 6682
      label = 67; //@line 6683
      break L73;
     }
     break;
    }
   case 117:
    {
     $197 = $6; //@line 6689
     $$0232 = 0; //@line 6695
     $$0237 = 1842; //@line 6695
     $275 = HEAP32[$197 >> 2] | 0; //@line 6695
     $276 = HEAP32[$197 + 4 >> 2] | 0; //@line 6695
     label = 67; //@line 6696
     break;
    }
   case 99:
    {
     HEAP8[$13 >> 0] = HEAP32[$6 >> 2]; //@line 6707
     $$2 = $13; //@line 6708
     $$2234 = 0; //@line 6708
     $$2239 = 1842; //@line 6708
     $$2251 = $11; //@line 6708
     $$5 = 1; //@line 6708
     $$6268 = $196; //@line 6708
     break;
    }
   case 109:
    {
     $$1 = _strerror(HEAP32[(___errno_location() | 0) >> 2] | 0) | 0; //@line 6715
     label = 72; //@line 6716
     break;
    }
   case 115:
    {
     $302 = HEAP32[$6 >> 2] | 0; //@line 6720
     $$1 = $302 | 0 ? $302 : 1852; //@line 6723
     label = 72; //@line 6724
     break;
    }
   case 67:
    {
     HEAP32[$8 >> 2] = HEAP32[$6 >> 2]; //@line 6734
     HEAP32[$14 >> 2] = 0; //@line 6735
     HEAP32[$6 >> 2] = $8; //@line 6736
     $$4258354 = -1; //@line 6737
     $365 = $8; //@line 6737
     label = 76; //@line 6738
     break;
    }
   case 83:
    {
     $$pre348 = HEAP32[$6 >> 2] | 0; //@line 6742
     if (!$$0254) {
      _pad_676($0, 32, $$1260, 0, $$1263$); //@line 6745
      $$0240$lcssa356 = 0; //@line 6746
      label = 85; //@line 6747
     } else {
      $$4258354 = $$0254; //@line 6749
      $365 = $$pre348; //@line 6749
      label = 76; //@line 6750
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
     $$0243 = _fmt_fp($0, +HEAPF64[$6 >> 3], $$1260, $$0254, $$1263$, $$0235) | 0; //@line 6757
     $$0247 = $$1248; //@line 6757
     $$0269 = $$3272; //@line 6757
     continue L1;
     break;
    }
   default:
    {
     $$2 = $20; //@line 6762
     $$2234 = 0; //@line 6762
     $$2239 = 1842; //@line 6762
     $$2251 = $11; //@line 6762
     $$5 = $$0254; //@line 6762
     $$6268 = $$1263$; //@line 6762
    }
   }
  } while (0);
  L97 : do {
   if ((label | 0) == 62) {
    label = 0; //@line 6768
    $227 = $6; //@line 6769
    $229 = HEAP32[$227 >> 2] | 0; //@line 6771
    $232 = HEAP32[$227 + 4 >> 2] | 0; //@line 6774
    $234 = _fmt_x($229, $232, $11, $$1236 & 32) | 0; //@line 6776
    $or$cond278 = ($$3265 & 8 | 0) == 0 | ($229 | 0) == 0 & ($232 | 0) == 0; //@line 6782
    $$0228 = $234; //@line 6787
    $$1233 = $or$cond278 ? 0 : 2; //@line 6787
    $$1238 = $or$cond278 ? 1842 : 1842 + ($$1236 >> 4) | 0; //@line 6787
    $$2256 = $$1255; //@line 6787
    $$4266 = $$3265; //@line 6787
    $281 = $229; //@line 6787
    $283 = $232; //@line 6787
    label = 68; //@line 6788
   } else if ((label | 0) == 67) {
    label = 0; //@line 6791
    $$0228 = _fmt_u($275, $276, $11) | 0; //@line 6793
    $$1233 = $$0232; //@line 6793
    $$1238 = $$0237; //@line 6793
    $$2256 = $$0254; //@line 6793
    $$4266 = $$1263$; //@line 6793
    $281 = $275; //@line 6793
    $283 = $276; //@line 6793
    label = 68; //@line 6794
   } else if ((label | 0) == 72) {
    label = 0; //@line 6797
    $305 = _memchr($$1, 0, $$0254) | 0; //@line 6798
    $306 = ($305 | 0) == 0; //@line 6799
    $$2 = $$1; //@line 6806
    $$2234 = 0; //@line 6806
    $$2239 = 1842; //@line 6806
    $$2251 = $306 ? $$1 + $$0254 | 0 : $305; //@line 6806
    $$5 = $306 ? $$0254 : $305 - $$1 | 0; //@line 6806
    $$6268 = $196; //@line 6806
   } else if ((label | 0) == 76) {
    label = 0; //@line 6809
    $$0229316 = $365; //@line 6810
    $$0240315 = 0; //@line 6810
    $$1244314 = 0; //@line 6810
    while (1) {
     $318 = HEAP32[$$0229316 >> 2] | 0; //@line 6812
     if (!$318) {
      $$0240$lcssa = $$0240315; //@line 6815
      $$2245 = $$1244314; //@line 6815
      break;
     }
     $320 = _wctomb($9, $318) | 0; //@line 6818
     if (($320 | 0) < 0 | $320 >>> 0 > ($$4258354 - $$0240315 | 0) >>> 0) {
      $$0240$lcssa = $$0240315; //@line 6824
      $$2245 = $320; //@line 6824
      break;
     }
     $325 = $320 + $$0240315 | 0; //@line 6828
     if ($$4258354 >>> 0 > $325 >>> 0) {
      $$0229316 = $$0229316 + 4 | 0; //@line 6831
      $$0240315 = $325; //@line 6831
      $$1244314 = $320; //@line 6831
     } else {
      $$0240$lcssa = $325; //@line 6833
      $$2245 = $320; //@line 6833
      break;
     }
    }
    if (($$2245 | 0) < 0) {
     $$0 = -1; //@line 6839
     break L1;
    }
    _pad_676($0, 32, $$1260, $$0240$lcssa, $$1263$); //@line 6842
    if (!$$0240$lcssa) {
     $$0240$lcssa356 = 0; //@line 6845
     label = 85; //@line 6846
    } else {
     $$1230327 = $365; //@line 6848
     $$1241326 = 0; //@line 6848
     while (1) {
      $329 = HEAP32[$$1230327 >> 2] | 0; //@line 6850
      if (!$329) {
       $$0240$lcssa356 = $$0240$lcssa; //@line 6853
       label = 85; //@line 6854
       break L97;
      }
      $331 = _wctomb($9, $329) | 0; //@line 6857
      $$1241326 = $331 + $$1241326 | 0; //@line 6858
      if (($$1241326 | 0) > ($$0240$lcssa | 0)) {
       $$0240$lcssa356 = $$0240$lcssa; //@line 6861
       label = 85; //@line 6862
       break L97;
      }
      _out_670($0, $9, $331); //@line 6866
      if ($$1241326 >>> 0 >= $$0240$lcssa >>> 0) {
       $$0240$lcssa356 = $$0240$lcssa; //@line 6871
       label = 85; //@line 6872
       break;
      } else {
       $$1230327 = $$1230327 + 4 | 0; //@line 6869
      }
     }
    }
   }
  } while (0);
  if ((label | 0) == 68) {
   label = 0; //@line 6880
   $284 = ($281 | 0) != 0 | ($283 | 0) != 0; //@line 6886
   $or$cond = ($$2256 | 0) != 0 | $284; //@line 6888
   $290 = $12 - $$0228 + (($284 ^ 1) & 1) | 0; //@line 6893
   $$2 = $or$cond ? $$0228 : $11; //@line 6898
   $$2234 = $$1233; //@line 6898
   $$2239 = $$1238; //@line 6898
   $$2251 = $11; //@line 6898
   $$5 = $or$cond ? ($$2256 | 0) > ($290 | 0) ? $$2256 : $290 : $$2256; //@line 6898
   $$6268 = ($$2256 | 0) > -1 ? $$4266 & -65537 : $$4266; //@line 6898
  } else if ((label | 0) == 85) {
   label = 0; //@line 6901
   _pad_676($0, 32, $$1260, $$0240$lcssa356, $$1263$ ^ 8192); //@line 6903
   $$0243 = ($$1260 | 0) > ($$0240$lcssa356 | 0) ? $$1260 : $$0240$lcssa356; //@line 6906
   $$0247 = $$1248; //@line 6906
   $$0269 = $$3272; //@line 6906
   continue;
  }
  $343 = $$2251 - $$2 | 0; //@line 6911
  $$$5 = ($$5 | 0) < ($343 | 0) ? $343 : $$5; //@line 6913
  $345 = $$$5 + $$2234 | 0; //@line 6914
  $$2261 = ($$1260 | 0) < ($345 | 0) ? $345 : $$1260; //@line 6916
  _pad_676($0, 32, $$2261, $345, $$6268); //@line 6917
  _out_670($0, $$2239, $$2234); //@line 6918
  _pad_676($0, 48, $$2261, $345, $$6268 ^ 65536); //@line 6920
  _pad_676($0, 48, $$$5, $343, 0); //@line 6921
  _out_670($0, $$2, $343); //@line 6922
  _pad_676($0, 32, $$2261, $345, $$6268 ^ 8192); //@line 6924
  $$0243 = $$2261; //@line 6925
  $$0247 = $$1248; //@line 6925
  $$0269 = $$3272; //@line 6925
 }
 L116 : do {
  if ((label | 0) == 88) {
   if (!$0) {
    if (!$$0269) {
     $$0 = 0; //@line 6933
    } else {
     $$2242302 = 1; //@line 6935
     while (1) {
      $352 = HEAP32[$4 + ($$2242302 << 2) >> 2] | 0; //@line 6938
      if (!$352) {
       $$2242$lcssa = $$2242302; //@line 6941
       break;
      }
      _pop_arg_673($3 + ($$2242302 << 3) | 0, $352, $2); //@line 6945
      $356 = $$2242302 + 1 | 0; //@line 6946
      if (($$2242302 | 0) < 9) {
       $$2242302 = $356; //@line 6949
      } else {
       $$2242$lcssa = $356; //@line 6951
       break;
      }
     }
     if (($$2242$lcssa | 0) < 10) {
      $$3300 = $$2242$lcssa; //@line 6957
      while (1) {
       if (HEAP32[$4 + ($$3300 << 2) >> 2] | 0) {
        $$0 = -1; //@line 6963
        break L116;
       }
       if (($$3300 | 0) < 9) {
        $$3300 = $$3300 + 1 | 0; //@line 6969
       } else {
        $$0 = 1; //@line 6971
        break;
       }
      }
     } else {
      $$0 = 1; //@line 6976
     }
    }
   } else {
    $$0 = $$1248; //@line 6980
   }
  }
 } while (0);
 STACKTOP = sp; //@line 6984
 return $$0 | 0; //@line 6984
}
function _mbed_vtracef($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $$ = 0, $$0$i = 0, $$0141 = 0, $$0142 = 0, $$0144 = 0, $$0199 = 0, $$1$off0 = 0, $$10 = 0, $$1143 = 0, $$1145 = 0, $$1152 = 0, $$1152$ = 0, $$13 = 0, $$18 = 0, $$3 = 0, $$3147 = 0, $$3147168 = 0, $$3154 = 0, $$3169 = 0, $$5156 = 0, $$5156$ = 0, $$6 = 0, $$6150 = 0, $$9 = 0, $$lobit = 0, $$pre = 0, $$sink = 0, $125 = 0, $126 = 0, $151 = 0, $157 = 0, $168 = 0, $169 = 0, $171 = 0, $181 = 0, $182 = 0, $184 = 0, $186 = 0, $194 = 0, $201 = 0, $202 = 0, $204 = 0, $206 = 0, $209 = 0, $34 = 0, $38 = 0, $4 = 0, $43 = 0, $5 = 0, $54 = 0, $55 = 0, $59 = 0, $60 = 0, $64 = 0, $65 = 0, $66 = 0, $67 = 0, $69 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $76 = 0, $78 = 0, $82 = 0, $89 = 0, $95 = 0, $AsyncCtx = 0, $AsyncCtx27 = 0, $AsyncCtx30 = 0, $AsyncCtx34 = 0, $AsyncCtx38 = 0, $AsyncCtx42 = 0, $AsyncCtx45 = 0, $AsyncCtx49 = 0, $AsyncCtx52 = 0, $AsyncCtx56 = 0, $AsyncCtx60 = 0, $AsyncCtx64 = 0, $extract$t159 = 0, $vararg_buffer = 0, $vararg_buffer1 = 0, $vararg_buffer12 = 0, $vararg_buffer15 = 0, $vararg_buffer18 = 0, $vararg_buffer20 = 0, $vararg_buffer23 = 0, $vararg_buffer3 = 0, $vararg_buffer6 = 0, $vararg_buffer9 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 192
 STACKTOP = STACKTOP + 96 | 0; //@line 193
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(96); //@line 193
 $vararg_buffer23 = sp + 72 | 0; //@line 194
 $vararg_buffer20 = sp + 64 | 0; //@line 195
 $vararg_buffer18 = sp + 56 | 0; //@line 196
 $vararg_buffer15 = sp + 48 | 0; //@line 197
 $vararg_buffer12 = sp + 40 | 0; //@line 198
 $vararg_buffer9 = sp + 32 | 0; //@line 199
 $vararg_buffer6 = sp + 24 | 0; //@line 200
 $vararg_buffer3 = sp + 16 | 0; //@line 201
 $vararg_buffer1 = sp + 8 | 0; //@line 202
 $vararg_buffer = sp; //@line 203
 $4 = sp + 80 | 0; //@line 204
 $5 = HEAP32[37] | 0; //@line 205
 do {
  if ($5 | 0) {
   $AsyncCtx = _emscripten_alloc_async_context(104, sp) | 0; //@line 209
   FUNCTION_TABLE_v[$5 & 0](); //@line 210
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 9; //@line 213
    HEAP32[$AsyncCtx + 4 >> 2] = $4; //@line 215
    HEAP32[$AsyncCtx + 8 >> 2] = $3; //@line 217
    HEAP32[$AsyncCtx + 12 >> 2] = $2; //@line 219
    HEAP32[$AsyncCtx + 16 >> 2] = $vararg_buffer20; //@line 221
    HEAP32[$AsyncCtx + 20 >> 2] = $vararg_buffer20; //@line 223
    HEAP32[$AsyncCtx + 24 >> 2] = $vararg_buffer1; //@line 225
    HEAP32[$AsyncCtx + 28 >> 2] = $vararg_buffer1; //@line 227
    HEAP32[$AsyncCtx + 32 >> 2] = $vararg_buffer15; //@line 229
    HEAP32[$AsyncCtx + 36 >> 2] = $1; //@line 231
    HEAP32[$AsyncCtx + 40 >> 2] = $vararg_buffer15; //@line 233
    HEAP32[$AsyncCtx + 44 >> 2] = $vararg_buffer18; //@line 235
    HEAP32[$AsyncCtx + 48 >> 2] = $vararg_buffer18; //@line 237
    HEAP32[$AsyncCtx + 52 >> 2] = $vararg_buffer6; //@line 239
    HEAP32[$AsyncCtx + 56 >> 2] = $vararg_buffer6; //@line 241
    HEAP8[$AsyncCtx + 60 >> 0] = $0; //@line 243
    HEAP32[$AsyncCtx + 64 >> 2] = $vararg_buffer9; //@line 245
    HEAP32[$AsyncCtx + 68 >> 2] = $vararg_buffer9; //@line 247
    HEAP32[$AsyncCtx + 72 >> 2] = $vararg_buffer12; //@line 249
    HEAP32[$AsyncCtx + 76 >> 2] = $vararg_buffer12; //@line 251
    HEAP32[$AsyncCtx + 80 >> 2] = $vararg_buffer23; //@line 253
    HEAP32[$AsyncCtx + 84 >> 2] = $vararg_buffer23; //@line 255
    HEAP32[$AsyncCtx + 88 >> 2] = $vararg_buffer; //@line 257
    HEAP32[$AsyncCtx + 92 >> 2] = $vararg_buffer; //@line 259
    HEAP32[$AsyncCtx + 96 >> 2] = $vararg_buffer3; //@line 261
    HEAP32[$AsyncCtx + 100 >> 2] = $vararg_buffer3; //@line 263
    sp = STACKTOP; //@line 264
    STACKTOP = sp; //@line 265
    return;
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 267
    HEAP32[39] = (HEAP32[39] | 0) + 1; //@line 270
    break;
   }
  }
 } while (0);
 $34 = HEAP32[28] | 0; //@line 275
 do {
  if ($34 | 0) {
   HEAP8[$34 >> 0] = 0; //@line 279
   do {
    if ($0 << 24 >> 24 > -1 & ($1 | 0) != 0) {
     $38 = HEAP32[25] | 0; //@line 285
     if (HEAP8[$38 >> 0] | 0) {
      if (_strstr($38, $1) | 0) {
       $$0$i = 1; //@line 292
       break;
      }
     }
     $43 = HEAP32[26] | 0; //@line 296
     if (!(HEAP8[$43 >> 0] | 0)) {
      label = 11; //@line 300
     } else {
      if (!(_strstr($43, $1) | 0)) {
       $$0$i = 1; //@line 305
      } else {
       label = 11; //@line 307
      }
     }
    } else {
     label = 11; //@line 311
    }
   } while (0);
   if ((label | 0) == 11) {
    $$0$i = 0; //@line 315
   }
   if (!((HEAP32[35] | 0) != 0 & ((($1 | 0) == 0 | (($2 | 0) == 0 | $$0$i)) ^ 1))) {
    HEAP32[32] = HEAP32[30]; //@line 327
    break;
   }
   $54 = HEAPU8[96] | 0; //@line 331
   $55 = $0 & 255; //@line 332
   if ($55 & 31 & $54 | 0) {
    $59 = $54 & 64; //@line 337
    $$lobit = $59 >>> 6; //@line 338
    $60 = $$lobit & 255; //@line 339
    $64 = ($54 & 32 | 0) == 0; //@line 343
    $65 = HEAP32[29] | 0; //@line 344
    $66 = HEAP32[28] | 0; //@line 345
    $67 = $0 << 24 >> 24 == 1; //@line 346
    do {
     if ($67 | ($54 & 128 | 0) != 0) {
      $AsyncCtx64 = _emscripten_alloc_async_context(8, sp) | 0; //@line 350
      _vsnprintf($66, $65, $2, $3) | 0; //@line 351
      if (___async) {
       HEAP32[$AsyncCtx64 >> 2] = 10; //@line 354
       HEAP8[$AsyncCtx64 + 4 >> 0] = $67 & 1; //@line 357
       sp = STACKTOP; //@line 358
       STACKTOP = sp; //@line 359
       return;
      }
      _emscripten_free_async_context($AsyncCtx64 | 0); //@line 361
      $69 = HEAP32[36] | 0; //@line 362
      if (!($67 & ($69 | 0) != 0)) {
       $73 = HEAP32[35] | 0; //@line 366
       $74 = HEAP32[28] | 0; //@line 367
       $AsyncCtx34 = _emscripten_alloc_async_context(4, sp) | 0; //@line 368
       FUNCTION_TABLE_vi[$73 & 127]($74); //@line 369
       if (___async) {
        HEAP32[$AsyncCtx34 >> 2] = 13; //@line 372
        sp = STACKTOP; //@line 373
        STACKTOP = sp; //@line 374
        return;
       } else {
        _emscripten_free_async_context($AsyncCtx34 | 0); //@line 376
        break;
       }
      }
      $71 = HEAP32[28] | 0; //@line 380
      $AsyncCtx27 = _emscripten_alloc_async_context(4, sp) | 0; //@line 381
      FUNCTION_TABLE_vi[$69 & 127]($71); //@line 382
      if (___async) {
       HEAP32[$AsyncCtx27 >> 2] = 11; //@line 385
       sp = STACKTOP; //@line 386
       STACKTOP = sp; //@line 387
       return;
      }
      _emscripten_free_async_context($AsyncCtx27 | 0); //@line 389
      $72 = HEAP32[36] | 0; //@line 390
      $AsyncCtx30 = _emscripten_alloc_async_context(4, sp) | 0; //@line 391
      FUNCTION_TABLE_vi[$72 & 127](993); //@line 392
      if (___async) {
       HEAP32[$AsyncCtx30 >> 2] = 12; //@line 395
       sp = STACKTOP; //@line 396
       STACKTOP = sp; //@line 397
       return;
      } else {
       _emscripten_free_async_context($AsyncCtx30 | 0); //@line 399
       break;
      }
     } else {
      if (!$59) {
       $$1$off0 = ($$lobit | 0) != 0; //@line 406
       $$1143 = $66; //@line 406
       $$1145 = $65; //@line 406
       $$3154 = 0; //@line 406
       label = 38; //@line 407
      } else {
       if ($64) {
        $$0142 = $66; //@line 410
        $$0144 = $65; //@line 410
       } else {
        $76 = _snprintf($66, $65, 995, $vararg_buffer) | 0; //@line 412
        $$ = ($76 | 0) >= ($65 | 0) ? 0 : $76; //@line 414
        $78 = ($$ | 0) > 0; //@line 415
        $$0142 = $78 ? $66 + $$ | 0 : $66; //@line 420
        $$0144 = $65 - ($78 ? $$ : 0) | 0; //@line 420
       }
       if (($$0144 | 0) > 0) {
        $82 = $55 + -2 | 0; //@line 424
        switch ($82 >>> 1 | $82 << 31 | 0) {
        case 0:
         {
          $$sink = 1013; //@line 430
          label = 35; //@line 431
          break;
         }
        case 1:
         {
          $$sink = 1019; //@line 435
          label = 35; //@line 436
          break;
         }
        case 3:
         {
          $$sink = 1007; //@line 440
          label = 35; //@line 441
          break;
         }
        case 7:
         {
          $$sink = 1001; //@line 445
          label = 35; //@line 446
          break;
         }
        default:
         {
          $$0141 = 0; //@line 450
          $$1152 = 0; //@line 450
         }
        }
        if ((label | 0) == 35) {
         HEAP32[$vararg_buffer1 >> 2] = $$sink; //@line 454
         $$0141 = $60 & 1; //@line 457
         $$1152 = _snprintf($$0142, $$0144, 1025, $vararg_buffer1) | 0; //@line 457
        }
        $$1152$ = ($$1152 | 0) < ($$0144 | 0) ? $$1152 : 0; //@line 460
        $extract$t159 = $$0141 << 24 >> 24 != 0; //@line 462
        if (($$1152$ | 0) > 0) {
         $89 = $$0141 << 24 >> 24 == 0; //@line 464
         $$1$off0 = $extract$t159; //@line 469
         $$1143 = $89 ? $$0142 : $$0142 + $$1152$ | 0; //@line 469
         $$1145 = $$0144 - ($89 ? 0 : $$1152$) | 0; //@line 469
         $$3154 = $$1152; //@line 469
         label = 38; //@line 470
        } else {
         $$1$off0 = $extract$t159; //@line 472
         $$1143 = $$0142; //@line 472
         $$1145 = $$0144; //@line 472
         $$3154 = $$1152$; //@line 472
         label = 38; //@line 473
        }
       }
      }
      L54 : do {
       if ((label | 0) == 38) {
        do {
         if (($$1145 | 0) > 0 & (HEAP32[33] | 0) != 0) {
          HEAP32[$4 >> 2] = HEAP32[$3 >> 2]; //@line 486
          $AsyncCtx60 = _emscripten_alloc_async_context(104, sp) | 0; //@line 487
          $95 = _vsnprintf(0, 0, $2, $4) | 0; //@line 488
          if (___async) {
           HEAP32[$AsyncCtx60 >> 2] = 14; //@line 491
           HEAP32[$AsyncCtx60 + 4 >> 2] = $$3154; //@line 493
           HEAP32[$AsyncCtx60 + 8 >> 2] = $vararg_buffer20; //@line 495
           HEAP32[$AsyncCtx60 + 12 >> 2] = $vararg_buffer20; //@line 497
           HEAP32[$AsyncCtx60 + 16 >> 2] = $vararg_buffer15; //@line 499
           HEAP32[$AsyncCtx60 + 20 >> 2] = $1; //@line 501
           HEAP32[$AsyncCtx60 + 24 >> 2] = $vararg_buffer15; //@line 503
           HEAP32[$AsyncCtx60 + 28 >> 2] = $vararg_buffer18; //@line 505
           HEAP32[$AsyncCtx60 + 32 >> 2] = $vararg_buffer18; //@line 507
           HEAP32[$AsyncCtx60 + 36 >> 2] = $2; //@line 509
           HEAP32[$AsyncCtx60 + 40 >> 2] = $3; //@line 511
           HEAP32[$AsyncCtx60 + 44 >> 2] = $$1143; //@line 513
           HEAP32[$AsyncCtx60 + 48 >> 2] = $$1145; //@line 515
           HEAP32[$AsyncCtx60 + 52 >> 2] = $55; //@line 517
           HEAP32[$AsyncCtx60 + 56 >> 2] = $vararg_buffer6; //@line 519
           HEAP32[$AsyncCtx60 + 60 >> 2] = $vararg_buffer6; //@line 521
           HEAP32[$AsyncCtx60 + 64 >> 2] = $vararg_buffer9; //@line 523
           HEAP32[$AsyncCtx60 + 68 >> 2] = $vararg_buffer9; //@line 525
           HEAP32[$AsyncCtx60 + 72 >> 2] = $vararg_buffer12; //@line 527
           HEAP32[$AsyncCtx60 + 76 >> 2] = $vararg_buffer12; //@line 529
           HEAP32[$AsyncCtx60 + 80 >> 2] = $vararg_buffer23; //@line 531
           HEAP32[$AsyncCtx60 + 84 >> 2] = $vararg_buffer23; //@line 533
           HEAP8[$AsyncCtx60 + 88 >> 0] = $$1$off0 & 1; //@line 536
           HEAP32[$AsyncCtx60 + 92 >> 2] = $vararg_buffer3; //@line 538
           HEAP32[$AsyncCtx60 + 96 >> 2] = $vararg_buffer3; //@line 540
           HEAP32[$AsyncCtx60 + 100 >> 2] = $4; //@line 542
           sp = STACKTOP; //@line 543
           STACKTOP = sp; //@line 544
           return;
          }
          _emscripten_free_async_context($AsyncCtx60 | 0); //@line 546
          $125 = HEAP32[33] | 0; //@line 551
          $AsyncCtx38 = _emscripten_alloc_async_context(100, sp) | 0; //@line 552
          $126 = FUNCTION_TABLE_ii[$125 & 1](($$3154 | 0 ? 4 : 0) + $$3154 + $95 | 0) | 0; //@line 553
          if (___async) {
           HEAP32[$AsyncCtx38 >> 2] = 15; //@line 556
           HEAP32[$AsyncCtx38 + 4 >> 2] = $vararg_buffer20; //@line 558
           HEAP32[$AsyncCtx38 + 8 >> 2] = $vararg_buffer20; //@line 560
           HEAP32[$AsyncCtx38 + 12 >> 2] = $vararg_buffer15; //@line 562
           HEAP32[$AsyncCtx38 + 16 >> 2] = $1; //@line 564
           HEAP32[$AsyncCtx38 + 20 >> 2] = $vararg_buffer15; //@line 566
           HEAP32[$AsyncCtx38 + 24 >> 2] = $vararg_buffer18; //@line 568
           HEAP32[$AsyncCtx38 + 28 >> 2] = $vararg_buffer18; //@line 570
           HEAP32[$AsyncCtx38 + 32 >> 2] = $2; //@line 572
           HEAP32[$AsyncCtx38 + 36 >> 2] = $3; //@line 574
           HEAP32[$AsyncCtx38 + 40 >> 2] = $$1143; //@line 576
           HEAP32[$AsyncCtx38 + 44 >> 2] = $$1145; //@line 578
           HEAP32[$AsyncCtx38 + 48 >> 2] = $55; //@line 580
           HEAP32[$AsyncCtx38 + 52 >> 2] = $vararg_buffer6; //@line 582
           HEAP32[$AsyncCtx38 + 56 >> 2] = $vararg_buffer6; //@line 584
           HEAP32[$AsyncCtx38 + 60 >> 2] = $vararg_buffer9; //@line 586
           HEAP32[$AsyncCtx38 + 64 >> 2] = $vararg_buffer9; //@line 588
           HEAP32[$AsyncCtx38 + 68 >> 2] = $vararg_buffer12; //@line 590
           HEAP32[$AsyncCtx38 + 72 >> 2] = $vararg_buffer12; //@line 592
           HEAP32[$AsyncCtx38 + 76 >> 2] = $vararg_buffer23; //@line 594
           HEAP32[$AsyncCtx38 + 80 >> 2] = $vararg_buffer23; //@line 596
           HEAP8[$AsyncCtx38 + 84 >> 0] = $$1$off0 & 1; //@line 599
           HEAP32[$AsyncCtx38 + 88 >> 2] = $vararg_buffer3; //@line 601
           HEAP32[$AsyncCtx38 + 92 >> 2] = $vararg_buffer3; //@line 603
           HEAP32[$AsyncCtx38 + 96 >> 2] = $4; //@line 605
           sp = STACKTOP; //@line 606
           STACKTOP = sp; //@line 607
           return;
          } else {
           _emscripten_free_async_context($AsyncCtx38 | 0); //@line 609
           HEAP32[$vararg_buffer3 >> 2] = $126; //@line 610
           $151 = _snprintf($$1143, $$1145, 1025, $vararg_buffer3) | 0; //@line 611
           $$10 = ($151 | 0) >= ($$1145 | 0) ? 0 : $151; //@line 613
           if (($$10 | 0) > 0) {
            $$3 = $$1143 + $$10 | 0; //@line 618
            $$3147 = $$1145 - $$10 | 0; //@line 618
            label = 44; //@line 619
            break;
           } else {
            $$3147168 = $$1145; //@line 622
            $$3169 = $$1143; //@line 622
            break;
           }
          }
         } else {
          $$3 = $$1143; //@line 627
          $$3147 = $$1145; //@line 627
          label = 44; //@line 628
         }
        } while (0);
        if ((label | 0) == 44) {
         if (($$3147 | 0) > 0) {
          $$3147168 = $$3147; //@line 634
          $$3169 = $$3; //@line 634
         } else {
          break;
         }
        }
        $157 = $55 + -2 | 0; //@line 639
        switch ($157 >>> 1 | $157 << 31 | 0) {
        case 0:
         {
          HEAP32[$vararg_buffer6 >> 2] = $1; //@line 645
          $$5156 = _snprintf($$3169, $$3147168, 1028, $vararg_buffer6) | 0; //@line 647
          break;
         }
        case 1:
         {
          HEAP32[$vararg_buffer9 >> 2] = $1; //@line 651
          $$5156 = _snprintf($$3169, $$3147168, 1043, $vararg_buffer9) | 0; //@line 653
          break;
         }
        case 3:
         {
          HEAP32[$vararg_buffer12 >> 2] = $1; //@line 657
          $$5156 = _snprintf($$3169, $$3147168, 1058, $vararg_buffer12) | 0; //@line 659
          break;
         }
        case 7:
         {
          HEAP32[$vararg_buffer15 >> 2] = $1; //@line 663
          $$5156 = _snprintf($$3169, $$3147168, 1073, $vararg_buffer15) | 0; //@line 665
          break;
         }
        default:
         {
          $$5156 = _snprintf($$3169, $$3147168, 1088, $vararg_buffer18) | 0; //@line 670
         }
        }
        $$5156$ = ($$5156 | 0) < ($$3147168 | 0) ? $$5156 : 0; //@line 674
        $168 = $$3169 + $$5156$ | 0; //@line 676
        $169 = $$3147168 - $$5156$ | 0; //@line 677
        if (($$5156$ | 0) > 0 & ($169 | 0) > 0) {
         $AsyncCtx56 = _emscripten_alloc_async_context(32, sp) | 0; //@line 681
         $171 = _vsnprintf($168, $169, $2, $3) | 0; //@line 682
         if (___async) {
          HEAP32[$AsyncCtx56 >> 2] = 16; //@line 685
          HEAP32[$AsyncCtx56 + 4 >> 2] = $vararg_buffer20; //@line 687
          HEAP32[$AsyncCtx56 + 8 >> 2] = $vararg_buffer20; //@line 689
          HEAP32[$AsyncCtx56 + 12 >> 2] = $vararg_buffer23; //@line 691
          HEAP32[$AsyncCtx56 + 16 >> 2] = $vararg_buffer23; //@line 693
          HEAP8[$AsyncCtx56 + 20 >> 0] = $$1$off0 & 1; //@line 696
          HEAP32[$AsyncCtx56 + 24 >> 2] = $169; //@line 698
          HEAP32[$AsyncCtx56 + 28 >> 2] = $168; //@line 700
          sp = STACKTOP; //@line 701
          STACKTOP = sp; //@line 702
          return;
         }
         _emscripten_free_async_context($AsyncCtx56 | 0); //@line 704
         $$13 = ($171 | 0) >= ($169 | 0) ? 0 : $171; //@line 706
         $181 = $168 + $$13 | 0; //@line 708
         $182 = $169 - $$13 | 0; //@line 709
         if (($$13 | 0) > 0) {
          $184 = HEAP32[34] | 0; //@line 712
          do {
           if (($182 | 0) > 0 & ($184 | 0) != 0) {
            $AsyncCtx42 = _emscripten_alloc_async_context(32, sp) | 0; //@line 717
            $186 = FUNCTION_TABLE_i[$184 & 0]() | 0; //@line 718
            if (___async) {
             HEAP32[$AsyncCtx42 >> 2] = 17; //@line 721
             HEAP32[$AsyncCtx42 + 4 >> 2] = $vararg_buffer20; //@line 723
             HEAP32[$AsyncCtx42 + 8 >> 2] = $181; //@line 725
             HEAP32[$AsyncCtx42 + 12 >> 2] = $182; //@line 727
             HEAP32[$AsyncCtx42 + 16 >> 2] = $vararg_buffer20; //@line 729
             HEAP8[$AsyncCtx42 + 20 >> 0] = $$1$off0 & 1; //@line 732
             HEAP32[$AsyncCtx42 + 24 >> 2] = $vararg_buffer23; //@line 734
             HEAP32[$AsyncCtx42 + 28 >> 2] = $vararg_buffer23; //@line 736
             sp = STACKTOP; //@line 737
             STACKTOP = sp; //@line 738
             return;
            } else {
             _emscripten_free_async_context($AsyncCtx42 | 0); //@line 740
             HEAP32[$vararg_buffer20 >> 2] = $186; //@line 741
             $194 = _snprintf($181, $182, 1025, $vararg_buffer20) | 0; //@line 742
             $$18 = ($194 | 0) >= ($182 | 0) ? 0 : $194; //@line 744
             if (($$18 | 0) > 0) {
              $$6 = $181 + $$18 | 0; //@line 749
              $$6150 = $182 - $$18 | 0; //@line 749
              $$9 = $$18; //@line 749
              break;
             } else {
              break L54;
             }
            }
           } else {
            $$6 = $181; //@line 756
            $$6150 = $182; //@line 756
            $$9 = $$13; //@line 756
           }
          } while (0);
          if (!(($$9 | 0) < 1 | ($$6150 | 0) < 1 | $$1$off0 ^ 1)) {
           _snprintf($$6, $$6150, 1103, $vararg_buffer23) | 0; //@line 765
          }
         }
        }
       }
      } while (0);
      $201 = HEAP32[35] | 0; //@line 771
      $202 = HEAP32[28] | 0; //@line 772
      $AsyncCtx45 = _emscripten_alloc_async_context(4, sp) | 0; //@line 773
      FUNCTION_TABLE_vi[$201 & 127]($202); //@line 774
      if (___async) {
       HEAP32[$AsyncCtx45 >> 2] = 18; //@line 777
       sp = STACKTOP; //@line 778
       STACKTOP = sp; //@line 779
       return;
      } else {
       _emscripten_free_async_context($AsyncCtx45 | 0); //@line 781
       break;
      }
     }
    } while (0);
    HEAP32[32] = HEAP32[30]; //@line 787
   }
  }
 } while (0);
 $204 = HEAP32[38] | 0; //@line 791
 if (!$204) {
  STACKTOP = sp; //@line 794
  return;
 }
 $206 = HEAP32[39] | 0; //@line 796
 HEAP32[39] = 0; //@line 797
 $AsyncCtx49 = _emscripten_alloc_async_context(8, sp) | 0; //@line 798
 FUNCTION_TABLE_v[$204 & 0](); //@line 799
 if (___async) {
  HEAP32[$AsyncCtx49 >> 2] = 19; //@line 802
  HEAP32[$AsyncCtx49 + 4 >> 2] = $206; //@line 804
  sp = STACKTOP; //@line 805
  STACKTOP = sp; //@line 806
  return;
 }
 _emscripten_free_async_context($AsyncCtx49 | 0); //@line 808
 if (($206 | 0) > 1) {
  $$0199 = $206; //@line 811
 } else {
  STACKTOP = sp; //@line 813
  return;
 }
 while (1) {
  $209 = $$0199 + -1 | 0; //@line 816
  $$pre = HEAP32[38] | 0; //@line 817
  $AsyncCtx52 = _emscripten_alloc_async_context(12, sp) | 0; //@line 818
  FUNCTION_TABLE_v[$$pre & 0](); //@line 819
  if (___async) {
   label = 70; //@line 822
   break;
  }
  _emscripten_free_async_context($AsyncCtx52 | 0); //@line 825
  if (($$0199 | 0) > 2) {
   $$0199 = $209; //@line 828
  } else {
   label = 72; //@line 830
   break;
  }
 }
 if ((label | 0) == 70) {
  HEAP32[$AsyncCtx52 >> 2] = 20; //@line 835
  HEAP32[$AsyncCtx52 + 4 >> 2] = $$0199; //@line 837
  HEAP32[$AsyncCtx52 + 8 >> 2] = $209; //@line 839
  sp = STACKTOP; //@line 840
  STACKTOP = sp; //@line 841
  return;
 } else if ((label | 0) == 72) {
  STACKTOP = sp; //@line 844
  return;
 }
}
function _mbed_vtracef__async_cb($0) {
 $0 = $0 | 0;
 var $$ = 0, $$0$i = 0, $$0141 = 0, $$0142 = 0, $$0144 = 0, $$1$off0 = 0, $$1$off0$expand_i1_val = 0, $$1$off0$expand_i1_val18 = 0, $$1143 = 0, $$1145 = 0, $$1152 = 0, $$1152$ = 0, $$3154 = 0, $$5156 = 0, $$5156$ = 0, $$expand_i1_val = 0, $$lobit = 0, $$sink = 0, $10 = 0, $102 = 0, $108 = 0, $109 = 0, $110 = 0, $111 = 0, $112 = 0, $113 = 0, $114 = 0, $115 = 0, $116 = 0, $117 = 0, $118 = 0, $119 = 0, $12 = 0, $120 = 0, $121 = 0, $122 = 0, $123 = 0, $124 = 0, $125 = 0, $126 = 0, $127 = 0, $128 = 0, $129 = 0, $130 = 0, $131 = 0, $132 = 0, $133 = 0, $136 = 0, $147 = 0, $148 = 0, $150 = 0, $151 = 0, $152 = 0, $153 = 0, $154 = 0, $155 = 0, $156 = 0, $157 = 0, $159 = 0, $16 = 0, $160 = 0, $161 = 0, $163 = 0, $164 = 0, $18 = 0, $2 = 0, $20 = 0, $22 = 0, $24 = 0, $26 = 0, $28 = 0, $30 = 0, $32 = 0, $34 = 0, $36 = 0, $38 = 0, $4 = 0, $40 = 0, $42 = 0, $44 = 0, $48 = 0, $50 = 0, $53 = 0, $57 = 0, $6 = 0, $62 = 0, $73 = 0, $74 = 0, $78 = 0, $79 = 0, $8 = 0, $83 = 0, $84 = 0, $85 = 0, $86 = 0, $87 = 0, $89 = 0, $91 = 0, $95 = 0, $ReallocAsyncCtx10 = 0, $ReallocAsyncCtx11 = 0, $ReallocAsyncCtx12 = 0, $ReallocAsyncCtx7 = 0, $ReallocAsyncCtx8 = 0, $extract$t159 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 10392
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 10394
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 10396
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 10398
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 10400
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 10402
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 10404
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 10408
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 10410
 $20 = HEAP32[$0 + 40 >> 2] | 0; //@line 10412
 $22 = HEAP32[$0 + 44 >> 2] | 0; //@line 10414
 $24 = HEAP32[$0 + 48 >> 2] | 0; //@line 10416
 $26 = HEAP32[$0 + 52 >> 2] | 0; //@line 10418
 $28 = HEAP32[$0 + 56 >> 2] | 0; //@line 10420
 $30 = HEAP8[$0 + 60 >> 0] | 0; //@line 10422
 $32 = HEAP32[$0 + 64 >> 2] | 0; //@line 10424
 $34 = HEAP32[$0 + 68 >> 2] | 0; //@line 10426
 $36 = HEAP32[$0 + 72 >> 2] | 0; //@line 10428
 $38 = HEAP32[$0 + 76 >> 2] | 0; //@line 10430
 $40 = HEAP32[$0 + 80 >> 2] | 0; //@line 10432
 $42 = HEAP32[$0 + 84 >> 2] | 0; //@line 10434
 $44 = HEAP32[$0 + 88 >> 2] | 0; //@line 10436
 $48 = HEAP32[$0 + 96 >> 2] | 0; //@line 10440
 $50 = HEAP32[$0 + 100 >> 2] | 0; //@line 10442
 HEAP32[39] = (HEAP32[39] | 0) + 1; //@line 10445
 $53 = HEAP32[28] | 0; //@line 10446
 do {
  if ($53 | 0) {
   HEAP8[$53 >> 0] = 0; //@line 10450
   do {
    if ($30 << 24 >> 24 > -1 & ($18 | 0) != 0) {
     $57 = HEAP32[25] | 0; //@line 10456
     if (HEAP8[$57 >> 0] | 0) {
      if (_strstr($57, $18) | 0) {
       $$0$i = 1; //@line 10463
       break;
      }
     }
     $62 = HEAP32[26] | 0; //@line 10467
     if (!(HEAP8[$62 >> 0] | 0)) {
      label = 9; //@line 10471
     } else {
      if (!(_strstr($62, $18) | 0)) {
       $$0$i = 1; //@line 10476
      } else {
       label = 9; //@line 10478
      }
     }
    } else {
     label = 9; //@line 10482
    }
   } while (0);
   if ((label | 0) == 9) {
    $$0$i = 0; //@line 10486
   }
   if (!((HEAP32[35] | 0) != 0 & ((($18 | 0) == 0 | (($6 | 0) == 0 | $$0$i)) ^ 1))) {
    HEAP32[32] = HEAP32[30]; //@line 10498
    break;
   }
   $73 = HEAPU8[96] | 0; //@line 10502
   $74 = $30 & 255; //@line 10503
   if ($74 & 31 & $73 | 0) {
    $78 = $73 & 64; //@line 10508
    $$lobit = $78 >>> 6; //@line 10509
    $79 = $$lobit & 255; //@line 10510
    $83 = ($73 & 32 | 0) == 0; //@line 10514
    $84 = HEAP32[29] | 0; //@line 10515
    $85 = HEAP32[28] | 0; //@line 10516
    $86 = $30 << 24 >> 24 == 1; //@line 10517
    if ($86 | ($73 & 128 | 0) != 0) {
     $ReallocAsyncCtx12 = _emscripten_realloc_async_context(8) | 0; //@line 10520
     _vsnprintf($85, $84, $6, $4) | 0; //@line 10521
     if (___async) {
      HEAP32[$ReallocAsyncCtx12 >> 2] = 10; //@line 10524
      $87 = $ReallocAsyncCtx12 + 4 | 0; //@line 10525
      $$expand_i1_val = $86 & 1; //@line 10526
      HEAP8[$87 >> 0] = $$expand_i1_val; //@line 10527
      sp = STACKTOP; //@line 10528
      return;
     }
     ___async_unwind = 0; //@line 10531
     HEAP32[$ReallocAsyncCtx12 >> 2] = 10; //@line 10532
     $87 = $ReallocAsyncCtx12 + 4 | 0; //@line 10533
     $$expand_i1_val = $86 & 1; //@line 10534
     HEAP8[$87 >> 0] = $$expand_i1_val; //@line 10535
     sp = STACKTOP; //@line 10536
     return;
    }
    if (!$78) {
     $$1$off0 = ($$lobit | 0) != 0; //@line 10542
     $$1143 = $85; //@line 10542
     $$1145 = $84; //@line 10542
     $$3154 = 0; //@line 10542
     label = 28; //@line 10543
    } else {
     if ($83) {
      $$0142 = $85; //@line 10546
      $$0144 = $84; //@line 10546
     } else {
      $89 = _snprintf($85, $84, 995, $44) | 0; //@line 10548
      $$ = ($89 | 0) >= ($84 | 0) ? 0 : $89; //@line 10550
      $91 = ($$ | 0) > 0; //@line 10551
      $$0142 = $91 ? $85 + $$ | 0 : $85; //@line 10556
      $$0144 = $84 - ($91 ? $$ : 0) | 0; //@line 10556
     }
     if (($$0144 | 0) > 0) {
      $95 = $74 + -2 | 0; //@line 10560
      switch ($95 >>> 1 | $95 << 31 | 0) {
      case 0:
       {
        $$sink = 1013; //@line 10566
        label = 25; //@line 10567
        break;
       }
      case 1:
       {
        $$sink = 1019; //@line 10571
        label = 25; //@line 10572
        break;
       }
      case 3:
       {
        $$sink = 1007; //@line 10576
        label = 25; //@line 10577
        break;
       }
      case 7:
       {
        $$sink = 1001; //@line 10581
        label = 25; //@line 10582
        break;
       }
      default:
       {
        $$0141 = 0; //@line 10586
        $$1152 = 0; //@line 10586
       }
      }
      if ((label | 0) == 25) {
       HEAP32[$12 >> 2] = $$sink; //@line 10590
       $$0141 = $79 & 1; //@line 10593
       $$1152 = _snprintf($$0142, $$0144, 1025, $12) | 0; //@line 10593
      }
      $$1152$ = ($$1152 | 0) < ($$0144 | 0) ? $$1152 : 0; //@line 10596
      $extract$t159 = $$0141 << 24 >> 24 != 0; //@line 10598
      if (($$1152$ | 0) > 0) {
       $102 = $$0141 << 24 >> 24 == 0; //@line 10600
       $$1$off0 = $extract$t159; //@line 10605
       $$1143 = $102 ? $$0142 : $$0142 + $$1152$ | 0; //@line 10605
       $$1145 = $$0144 - ($102 ? 0 : $$1152$) | 0; //@line 10605
       $$3154 = $$1152; //@line 10605
       label = 28; //@line 10606
      } else {
       $$1$off0 = $extract$t159; //@line 10608
       $$1143 = $$0142; //@line 10608
       $$1145 = $$0144; //@line 10608
       $$3154 = $$1152$; //@line 10608
       label = 28; //@line 10609
      }
     }
    }
    if ((label | 0) == 28) {
     if (($$1145 | 0) > 0 & (HEAP32[33] | 0) != 0) {
      HEAP32[$2 >> 2] = HEAP32[$4 >> 2]; //@line 10620
      $ReallocAsyncCtx11 = _emscripten_realloc_async_context(104) | 0; //@line 10621
      $108 = _vsnprintf(0, 0, $6, $2) | 0; //@line 10622
      if (___async) {
       HEAP32[$ReallocAsyncCtx11 >> 2] = 14; //@line 10625
       $109 = $ReallocAsyncCtx11 + 4 | 0; //@line 10626
       HEAP32[$109 >> 2] = $$3154; //@line 10627
       $110 = $ReallocAsyncCtx11 + 8 | 0; //@line 10628
       HEAP32[$110 >> 2] = $8; //@line 10629
       $111 = $ReallocAsyncCtx11 + 12 | 0; //@line 10630
       HEAP32[$111 >> 2] = $10; //@line 10631
       $112 = $ReallocAsyncCtx11 + 16 | 0; //@line 10632
       HEAP32[$112 >> 2] = $16; //@line 10633
       $113 = $ReallocAsyncCtx11 + 20 | 0; //@line 10634
       HEAP32[$113 >> 2] = $18; //@line 10635
       $114 = $ReallocAsyncCtx11 + 24 | 0; //@line 10636
       HEAP32[$114 >> 2] = $20; //@line 10637
       $115 = $ReallocAsyncCtx11 + 28 | 0; //@line 10638
       HEAP32[$115 >> 2] = $22; //@line 10639
       $116 = $ReallocAsyncCtx11 + 32 | 0; //@line 10640
       HEAP32[$116 >> 2] = $24; //@line 10641
       $117 = $ReallocAsyncCtx11 + 36 | 0; //@line 10642
       HEAP32[$117 >> 2] = $6; //@line 10643
       $118 = $ReallocAsyncCtx11 + 40 | 0; //@line 10644
       HEAP32[$118 >> 2] = $4; //@line 10645
       $119 = $ReallocAsyncCtx11 + 44 | 0; //@line 10646
       HEAP32[$119 >> 2] = $$1143; //@line 10647
       $120 = $ReallocAsyncCtx11 + 48 | 0; //@line 10648
       HEAP32[$120 >> 2] = $$1145; //@line 10649
       $121 = $ReallocAsyncCtx11 + 52 | 0; //@line 10650
       HEAP32[$121 >> 2] = $74; //@line 10651
       $122 = $ReallocAsyncCtx11 + 56 | 0; //@line 10652
       HEAP32[$122 >> 2] = $26; //@line 10653
       $123 = $ReallocAsyncCtx11 + 60 | 0; //@line 10654
       HEAP32[$123 >> 2] = $28; //@line 10655
       $124 = $ReallocAsyncCtx11 + 64 | 0; //@line 10656
       HEAP32[$124 >> 2] = $32; //@line 10657
       $125 = $ReallocAsyncCtx11 + 68 | 0; //@line 10658
       HEAP32[$125 >> 2] = $34; //@line 10659
       $126 = $ReallocAsyncCtx11 + 72 | 0; //@line 10660
       HEAP32[$126 >> 2] = $36; //@line 10661
       $127 = $ReallocAsyncCtx11 + 76 | 0; //@line 10662
       HEAP32[$127 >> 2] = $38; //@line 10663
       $128 = $ReallocAsyncCtx11 + 80 | 0; //@line 10664
       HEAP32[$128 >> 2] = $40; //@line 10665
       $129 = $ReallocAsyncCtx11 + 84 | 0; //@line 10666
       HEAP32[$129 >> 2] = $42; //@line 10667
       $130 = $ReallocAsyncCtx11 + 88 | 0; //@line 10668
       $$1$off0$expand_i1_val = $$1$off0 & 1; //@line 10669
       HEAP8[$130 >> 0] = $$1$off0$expand_i1_val; //@line 10670
       $131 = $ReallocAsyncCtx11 + 92 | 0; //@line 10671
       HEAP32[$131 >> 2] = $48; //@line 10672
       $132 = $ReallocAsyncCtx11 + 96 | 0; //@line 10673
       HEAP32[$132 >> 2] = $50; //@line 10674
       $133 = $ReallocAsyncCtx11 + 100 | 0; //@line 10675
       HEAP32[$133 >> 2] = $2; //@line 10676
       sp = STACKTOP; //@line 10677
       return;
      }
      HEAP32[___async_retval >> 2] = $108; //@line 10681
      ___async_unwind = 0; //@line 10682
      HEAP32[$ReallocAsyncCtx11 >> 2] = 14; //@line 10683
      $109 = $ReallocAsyncCtx11 + 4 | 0; //@line 10684
      HEAP32[$109 >> 2] = $$3154; //@line 10685
      $110 = $ReallocAsyncCtx11 + 8 | 0; //@line 10686
      HEAP32[$110 >> 2] = $8; //@line 10687
      $111 = $ReallocAsyncCtx11 + 12 | 0; //@line 10688
      HEAP32[$111 >> 2] = $10; //@line 10689
      $112 = $ReallocAsyncCtx11 + 16 | 0; //@line 10690
      HEAP32[$112 >> 2] = $16; //@line 10691
      $113 = $ReallocAsyncCtx11 + 20 | 0; //@line 10692
      HEAP32[$113 >> 2] = $18; //@line 10693
      $114 = $ReallocAsyncCtx11 + 24 | 0; //@line 10694
      HEAP32[$114 >> 2] = $20; //@line 10695
      $115 = $ReallocAsyncCtx11 + 28 | 0; //@line 10696
      HEAP32[$115 >> 2] = $22; //@line 10697
      $116 = $ReallocAsyncCtx11 + 32 | 0; //@line 10698
      HEAP32[$116 >> 2] = $24; //@line 10699
      $117 = $ReallocAsyncCtx11 + 36 | 0; //@line 10700
      HEAP32[$117 >> 2] = $6; //@line 10701
      $118 = $ReallocAsyncCtx11 + 40 | 0; //@line 10702
      HEAP32[$118 >> 2] = $4; //@line 10703
      $119 = $ReallocAsyncCtx11 + 44 | 0; //@line 10704
      HEAP32[$119 >> 2] = $$1143; //@line 10705
      $120 = $ReallocAsyncCtx11 + 48 | 0; //@line 10706
      HEAP32[$120 >> 2] = $$1145; //@line 10707
      $121 = $ReallocAsyncCtx11 + 52 | 0; //@line 10708
      HEAP32[$121 >> 2] = $74; //@line 10709
      $122 = $ReallocAsyncCtx11 + 56 | 0; //@line 10710
      HEAP32[$122 >> 2] = $26; //@line 10711
      $123 = $ReallocAsyncCtx11 + 60 | 0; //@line 10712
      HEAP32[$123 >> 2] = $28; //@line 10713
      $124 = $ReallocAsyncCtx11 + 64 | 0; //@line 10714
      HEAP32[$124 >> 2] = $32; //@line 10715
      $125 = $ReallocAsyncCtx11 + 68 | 0; //@line 10716
      HEAP32[$125 >> 2] = $34; //@line 10717
      $126 = $ReallocAsyncCtx11 + 72 | 0; //@line 10718
      HEAP32[$126 >> 2] = $36; //@line 10719
      $127 = $ReallocAsyncCtx11 + 76 | 0; //@line 10720
      HEAP32[$127 >> 2] = $38; //@line 10721
      $128 = $ReallocAsyncCtx11 + 80 | 0; //@line 10722
      HEAP32[$128 >> 2] = $40; //@line 10723
      $129 = $ReallocAsyncCtx11 + 84 | 0; //@line 10724
      HEAP32[$129 >> 2] = $42; //@line 10725
      $130 = $ReallocAsyncCtx11 + 88 | 0; //@line 10726
      $$1$off0$expand_i1_val = $$1$off0 & 1; //@line 10727
      HEAP8[$130 >> 0] = $$1$off0$expand_i1_val; //@line 10728
      $131 = $ReallocAsyncCtx11 + 92 | 0; //@line 10729
      HEAP32[$131 >> 2] = $48; //@line 10730
      $132 = $ReallocAsyncCtx11 + 96 | 0; //@line 10731
      HEAP32[$132 >> 2] = $50; //@line 10732
      $133 = $ReallocAsyncCtx11 + 100 | 0; //@line 10733
      HEAP32[$133 >> 2] = $2; //@line 10734
      sp = STACKTOP; //@line 10735
      return;
     }
     if (($$1145 | 0) > 0) {
      $136 = $74 + -2 | 0; //@line 10740
      switch ($136 >>> 1 | $136 << 31 | 0) {
      case 0:
       {
        HEAP32[$26 >> 2] = $18; //@line 10746
        $$5156 = _snprintf($$1143, $$1145, 1028, $26) | 0; //@line 10748
        break;
       }
      case 1:
       {
        HEAP32[$32 >> 2] = $18; //@line 10752
        $$5156 = _snprintf($$1143, $$1145, 1043, $32) | 0; //@line 10754
        break;
       }
      case 3:
       {
        HEAP32[$36 >> 2] = $18; //@line 10758
        $$5156 = _snprintf($$1143, $$1145, 1058, $36) | 0; //@line 10760
        break;
       }
      case 7:
       {
        HEAP32[$16 >> 2] = $18; //@line 10764
        $$5156 = _snprintf($$1143, $$1145, 1073, $16) | 0; //@line 10766
        break;
       }
      default:
       {
        $$5156 = _snprintf($$1143, $$1145, 1088, $22) | 0; //@line 10771
       }
      }
      $$5156$ = ($$5156 | 0) < ($$1145 | 0) ? $$5156 : 0; //@line 10775
      $147 = $$1143 + $$5156$ | 0; //@line 10777
      $148 = $$1145 - $$5156$ | 0; //@line 10778
      if (($$5156$ | 0) > 0 & ($148 | 0) > 0) {
       $ReallocAsyncCtx10 = _emscripten_realloc_async_context(32) | 0; //@line 10782
       $150 = _vsnprintf($147, $148, $6, $4) | 0; //@line 10783
       if (___async) {
        HEAP32[$ReallocAsyncCtx10 >> 2] = 16; //@line 10786
        $151 = $ReallocAsyncCtx10 + 4 | 0; //@line 10787
        HEAP32[$151 >> 2] = $8; //@line 10788
        $152 = $ReallocAsyncCtx10 + 8 | 0; //@line 10789
        HEAP32[$152 >> 2] = $10; //@line 10790
        $153 = $ReallocAsyncCtx10 + 12 | 0; //@line 10791
        HEAP32[$153 >> 2] = $40; //@line 10792
        $154 = $ReallocAsyncCtx10 + 16 | 0; //@line 10793
        HEAP32[$154 >> 2] = $42; //@line 10794
        $155 = $ReallocAsyncCtx10 + 20 | 0; //@line 10795
        $$1$off0$expand_i1_val18 = $$1$off0 & 1; //@line 10796
        HEAP8[$155 >> 0] = $$1$off0$expand_i1_val18; //@line 10797
        $156 = $ReallocAsyncCtx10 + 24 | 0; //@line 10798
        HEAP32[$156 >> 2] = $148; //@line 10799
        $157 = $ReallocAsyncCtx10 + 28 | 0; //@line 10800
        HEAP32[$157 >> 2] = $147; //@line 10801
        sp = STACKTOP; //@line 10802
        return;
       }
       HEAP32[___async_retval >> 2] = $150; //@line 10806
       ___async_unwind = 0; //@line 10807
       HEAP32[$ReallocAsyncCtx10 >> 2] = 16; //@line 10808
       $151 = $ReallocAsyncCtx10 + 4 | 0; //@line 10809
       HEAP32[$151 >> 2] = $8; //@line 10810
       $152 = $ReallocAsyncCtx10 + 8 | 0; //@line 10811
       HEAP32[$152 >> 2] = $10; //@line 10812
       $153 = $ReallocAsyncCtx10 + 12 | 0; //@line 10813
       HEAP32[$153 >> 2] = $40; //@line 10814
       $154 = $ReallocAsyncCtx10 + 16 | 0; //@line 10815
       HEAP32[$154 >> 2] = $42; //@line 10816
       $155 = $ReallocAsyncCtx10 + 20 | 0; //@line 10817
       $$1$off0$expand_i1_val18 = $$1$off0 & 1; //@line 10818
       HEAP8[$155 >> 0] = $$1$off0$expand_i1_val18; //@line 10819
       $156 = $ReallocAsyncCtx10 + 24 | 0; //@line 10820
       HEAP32[$156 >> 2] = $148; //@line 10821
       $157 = $ReallocAsyncCtx10 + 28 | 0; //@line 10822
       HEAP32[$157 >> 2] = $147; //@line 10823
       sp = STACKTOP; //@line 10824
       return;
      }
     }
    }
    $159 = HEAP32[35] | 0; //@line 10829
    $160 = HEAP32[28] | 0; //@line 10830
    $ReallocAsyncCtx7 = _emscripten_realloc_async_context(4) | 0; //@line 10831
    FUNCTION_TABLE_vi[$159 & 127]($160); //@line 10832
    if (___async) {
     HEAP32[$ReallocAsyncCtx7 >> 2] = 18; //@line 10835
     sp = STACKTOP; //@line 10836
     return;
    }
    ___async_unwind = 0; //@line 10839
    HEAP32[$ReallocAsyncCtx7 >> 2] = 18; //@line 10840
    sp = STACKTOP; //@line 10841
    return;
   }
  }
 } while (0);
 $161 = HEAP32[38] | 0; //@line 10846
 if (!$161) {
  return;
 }
 $163 = HEAP32[39] | 0; //@line 10851
 HEAP32[39] = 0; //@line 10852
 $ReallocAsyncCtx8 = _emscripten_realloc_async_context(8) | 0; //@line 10853
 FUNCTION_TABLE_v[$161 & 0](); //@line 10854
 if (___async) {
  HEAP32[$ReallocAsyncCtx8 >> 2] = 19; //@line 10857
  $164 = $ReallocAsyncCtx8 + 4 | 0; //@line 10858
  HEAP32[$164 >> 2] = $163; //@line 10859
  sp = STACKTOP; //@line 10860
  return;
 }
 ___async_unwind = 0; //@line 10863
 HEAP32[$ReallocAsyncCtx8 >> 2] = 19; //@line 10864
 $164 = $ReallocAsyncCtx8 + 4 | 0; //@line 10865
 HEAP32[$164 >> 2] = $163; //@line 10866
 sp = STACKTOP; //@line 10867
 return;
}
function _free($0) {
 $0 = $0 | 0;
 var $$0212$i = 0, $$0212$in$i = 0, $$0383 = 0, $$0384 = 0, $$0396 = 0, $$0403 = 0, $$1 = 0, $$1382 = 0, $$1387 = 0, $$1390 = 0, $$1398 = 0, $$1402 = 0, $$2 = 0, $$3 = 0, $$3400 = 0, $$pre$phi442Z2D = 0, $$pre$phi444Z2D = 0, $$pre$phiZ2D = 0, $10 = 0, $105 = 0, $106 = 0, $114 = 0, $115 = 0, $116 = 0, $124 = 0, $13 = 0, $132 = 0, $137 = 0, $138 = 0, $141 = 0, $143 = 0, $145 = 0, $16 = 0, $160 = 0, $165 = 0, $167 = 0, $17 = 0, $170 = 0, $173 = 0, $176 = 0, $179 = 0, $180 = 0, $181 = 0, $183 = 0, $185 = 0, $186 = 0, $188 = 0, $189 = 0, $195 = 0, $196 = 0, $2 = 0, $21 = 0, $210 = 0, $213 = 0, $214 = 0, $220 = 0, $235 = 0, $238 = 0, $239 = 0, $24 = 0, $240 = 0, $244 = 0, $245 = 0, $251 = 0, $256 = 0, $257 = 0, $26 = 0, $260 = 0, $262 = 0, $265 = 0, $270 = 0, $276 = 0, $28 = 0, $280 = 0, $281 = 0, $299 = 0, $3 = 0, $301 = 0, $308 = 0, $309 = 0, $310 = 0, $319 = 0, $41 = 0, $46 = 0, $48 = 0, $51 = 0, $53 = 0, $56 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $63 = 0, $65 = 0, $66 = 0, $68 = 0, $69 = 0, $7 = 0, $74 = 0, $75 = 0, $89 = 0, $9 = 0, $92 = 0, $93 = 0, $99 = 0, label = 0;
 if (!$0) {
  return;
 }
 $2 = $0 + -8 | 0; //@line 3856
 $3 = HEAP32[1011] | 0; //@line 3857
 if ($2 >>> 0 < $3 >>> 0) {
  _abort(); //@line 3860
 }
 $6 = HEAP32[$0 + -4 >> 2] | 0; //@line 3864
 $7 = $6 & 3; //@line 3865
 if (($7 | 0) == 1) {
  _abort(); //@line 3868
 }
 $9 = $6 & -8; //@line 3871
 $10 = $2 + $9 | 0; //@line 3872
 L10 : do {
  if (!($6 & 1)) {
   $13 = HEAP32[$2 >> 2] | 0; //@line 3877
   if (!$7) {
    return;
   }
   $16 = $2 + (0 - $13) | 0; //@line 3883
   $17 = $13 + $9 | 0; //@line 3884
   if ($16 >>> 0 < $3 >>> 0) {
    _abort(); //@line 3887
   }
   if ((HEAP32[1012] | 0) == ($16 | 0)) {
    $105 = $10 + 4 | 0; //@line 3893
    $106 = HEAP32[$105 >> 2] | 0; //@line 3894
    if (($106 & 3 | 0) != 3) {
     $$1 = $16; //@line 3898
     $$1382 = $17; //@line 3898
     $114 = $16; //@line 3898
     break;
    }
    HEAP32[1009] = $17; //@line 3901
    HEAP32[$105 >> 2] = $106 & -2; //@line 3903
    HEAP32[$16 + 4 >> 2] = $17 | 1; //@line 3906
    HEAP32[$16 + $17 >> 2] = $17; //@line 3908
    return;
   }
   $21 = $13 >>> 3; //@line 3911
   if ($13 >>> 0 < 256) {
    $24 = HEAP32[$16 + 8 >> 2] | 0; //@line 3915
    $26 = HEAP32[$16 + 12 >> 2] | 0; //@line 3917
    $28 = 4068 + ($21 << 1 << 2) | 0; //@line 3919
    if (($24 | 0) != ($28 | 0)) {
     if ($3 >>> 0 > $24 >>> 0) {
      _abort(); //@line 3924
     }
     if ((HEAP32[$24 + 12 >> 2] | 0) != ($16 | 0)) {
      _abort(); //@line 3931
     }
    }
    if (($26 | 0) == ($24 | 0)) {
     HEAP32[1007] = HEAP32[1007] & ~(1 << $21); //@line 3941
     $$1 = $16; //@line 3942
     $$1382 = $17; //@line 3942
     $114 = $16; //@line 3942
     break;
    }
    if (($26 | 0) == ($28 | 0)) {
     $$pre$phi444Z2D = $26 + 8 | 0; //@line 3948
    } else {
     if ($3 >>> 0 > $26 >>> 0) {
      _abort(); //@line 3952
     }
     $41 = $26 + 8 | 0; //@line 3955
     if ((HEAP32[$41 >> 2] | 0) == ($16 | 0)) {
      $$pre$phi444Z2D = $41; //@line 3959
     } else {
      _abort(); //@line 3961
     }
    }
    HEAP32[$24 + 12 >> 2] = $26; //@line 3966
    HEAP32[$$pre$phi444Z2D >> 2] = $24; //@line 3967
    $$1 = $16; //@line 3968
    $$1382 = $17; //@line 3968
    $114 = $16; //@line 3968
    break;
   }
   $46 = HEAP32[$16 + 24 >> 2] | 0; //@line 3972
   $48 = HEAP32[$16 + 12 >> 2] | 0; //@line 3974
   do {
    if (($48 | 0) == ($16 | 0)) {
     $59 = $16 + 16 | 0; //@line 3978
     $60 = $59 + 4 | 0; //@line 3979
     $61 = HEAP32[$60 >> 2] | 0; //@line 3980
     if (!$61) {
      $63 = HEAP32[$59 >> 2] | 0; //@line 3983
      if (!$63) {
       $$3 = 0; //@line 3986
       break;
      } else {
       $$1387 = $63; //@line 3989
       $$1390 = $59; //@line 3989
      }
     } else {
      $$1387 = $61; //@line 3992
      $$1390 = $60; //@line 3992
     }
     while (1) {
      $65 = $$1387 + 20 | 0; //@line 3995
      $66 = HEAP32[$65 >> 2] | 0; //@line 3996
      if ($66 | 0) {
       $$1387 = $66; //@line 3999
       $$1390 = $65; //@line 3999
       continue;
      }
      $68 = $$1387 + 16 | 0; //@line 4002
      $69 = HEAP32[$68 >> 2] | 0; //@line 4003
      if (!$69) {
       break;
      } else {
       $$1387 = $69; //@line 4008
       $$1390 = $68; //@line 4008
      }
     }
     if ($3 >>> 0 > $$1390 >>> 0) {
      _abort(); //@line 4013
     } else {
      HEAP32[$$1390 >> 2] = 0; //@line 4016
      $$3 = $$1387; //@line 4017
      break;
     }
    } else {
     $51 = HEAP32[$16 + 8 >> 2] | 0; //@line 4022
     if ($3 >>> 0 > $51 >>> 0) {
      _abort(); //@line 4025
     }
     $53 = $51 + 12 | 0; //@line 4028
     if ((HEAP32[$53 >> 2] | 0) != ($16 | 0)) {
      _abort(); //@line 4032
     }
     $56 = $48 + 8 | 0; //@line 4035
     if ((HEAP32[$56 >> 2] | 0) == ($16 | 0)) {
      HEAP32[$53 >> 2] = $48; //@line 4039
      HEAP32[$56 >> 2] = $51; //@line 4040
      $$3 = $48; //@line 4041
      break;
     } else {
      _abort(); //@line 4044
     }
    }
   } while (0);
   if (!$46) {
    $$1 = $16; //@line 4051
    $$1382 = $17; //@line 4051
    $114 = $16; //@line 4051
   } else {
    $74 = HEAP32[$16 + 28 >> 2] | 0; //@line 4054
    $75 = 4332 + ($74 << 2) | 0; //@line 4055
    do {
     if ((HEAP32[$75 >> 2] | 0) == ($16 | 0)) {
      HEAP32[$75 >> 2] = $$3; //@line 4060
      if (!$$3) {
       HEAP32[1008] = HEAP32[1008] & ~(1 << $74); //@line 4067
       $$1 = $16; //@line 4068
       $$1382 = $17; //@line 4068
       $114 = $16; //@line 4068
       break L10;
      }
     } else {
      if ((HEAP32[1011] | 0) >>> 0 > $46 >>> 0) {
       _abort(); //@line 4075
      } else {
       HEAP32[$46 + 16 + (((HEAP32[$46 + 16 >> 2] | 0) != ($16 | 0) & 1) << 2) >> 2] = $$3; //@line 4083
       if (!$$3) {
        $$1 = $16; //@line 4086
        $$1382 = $17; //@line 4086
        $114 = $16; //@line 4086
        break L10;
       } else {
        break;
       }
      }
     }
    } while (0);
    $89 = HEAP32[1011] | 0; //@line 4094
    if ($89 >>> 0 > $$3 >>> 0) {
     _abort(); //@line 4097
    }
    HEAP32[$$3 + 24 >> 2] = $46; //@line 4101
    $92 = $16 + 16 | 0; //@line 4102
    $93 = HEAP32[$92 >> 2] | 0; //@line 4103
    do {
     if ($93 | 0) {
      if ($89 >>> 0 > $93 >>> 0) {
       _abort(); //@line 4109
      } else {
       HEAP32[$$3 + 16 >> 2] = $93; //@line 4113
       HEAP32[$93 + 24 >> 2] = $$3; //@line 4115
       break;
      }
     }
    } while (0);
    $99 = HEAP32[$92 + 4 >> 2] | 0; //@line 4121
    if (!$99) {
     $$1 = $16; //@line 4124
     $$1382 = $17; //@line 4124
     $114 = $16; //@line 4124
    } else {
     if ((HEAP32[1011] | 0) >>> 0 > $99 >>> 0) {
      _abort(); //@line 4129
     } else {
      HEAP32[$$3 + 20 >> 2] = $99; //@line 4133
      HEAP32[$99 + 24 >> 2] = $$3; //@line 4135
      $$1 = $16; //@line 4136
      $$1382 = $17; //@line 4136
      $114 = $16; //@line 4136
      break;
     }
    }
   }
  } else {
   $$1 = $2; //@line 4142
   $$1382 = $9; //@line 4142
   $114 = $2; //@line 4142
  }
 } while (0);
 if ($114 >>> 0 >= $10 >>> 0) {
  _abort(); //@line 4147
 }
 $115 = $10 + 4 | 0; //@line 4150
 $116 = HEAP32[$115 >> 2] | 0; //@line 4151
 if (!($116 & 1)) {
  _abort(); //@line 4155
 }
 if (!($116 & 2)) {
  if ((HEAP32[1013] | 0) == ($10 | 0)) {
   $124 = (HEAP32[1010] | 0) + $$1382 | 0; //@line 4165
   HEAP32[1010] = $124; //@line 4166
   HEAP32[1013] = $$1; //@line 4167
   HEAP32[$$1 + 4 >> 2] = $124 | 1; //@line 4170
   if (($$1 | 0) != (HEAP32[1012] | 0)) {
    return;
   }
   HEAP32[1012] = 0; //@line 4176
   HEAP32[1009] = 0; //@line 4177
   return;
  }
  if ((HEAP32[1012] | 0) == ($10 | 0)) {
   $132 = (HEAP32[1009] | 0) + $$1382 | 0; //@line 4184
   HEAP32[1009] = $132; //@line 4185
   HEAP32[1012] = $114; //@line 4186
   HEAP32[$$1 + 4 >> 2] = $132 | 1; //@line 4189
   HEAP32[$114 + $132 >> 2] = $132; //@line 4191
   return;
  }
  $137 = ($116 & -8) + $$1382 | 0; //@line 4195
  $138 = $116 >>> 3; //@line 4196
  L108 : do {
   if ($116 >>> 0 < 256) {
    $141 = HEAP32[$10 + 8 >> 2] | 0; //@line 4201
    $143 = HEAP32[$10 + 12 >> 2] | 0; //@line 4203
    $145 = 4068 + ($138 << 1 << 2) | 0; //@line 4205
    if (($141 | 0) != ($145 | 0)) {
     if ((HEAP32[1011] | 0) >>> 0 > $141 >>> 0) {
      _abort(); //@line 4211
     }
     if ((HEAP32[$141 + 12 >> 2] | 0) != ($10 | 0)) {
      _abort(); //@line 4218
     }
    }
    if (($143 | 0) == ($141 | 0)) {
     HEAP32[1007] = HEAP32[1007] & ~(1 << $138); //@line 4228
     break;
    }
    if (($143 | 0) == ($145 | 0)) {
     $$pre$phi442Z2D = $143 + 8 | 0; //@line 4234
    } else {
     if ((HEAP32[1011] | 0) >>> 0 > $143 >>> 0) {
      _abort(); //@line 4239
     }
     $160 = $143 + 8 | 0; //@line 4242
     if ((HEAP32[$160 >> 2] | 0) == ($10 | 0)) {
      $$pre$phi442Z2D = $160; //@line 4246
     } else {
      _abort(); //@line 4248
     }
    }
    HEAP32[$141 + 12 >> 2] = $143; //@line 4253
    HEAP32[$$pre$phi442Z2D >> 2] = $141; //@line 4254
   } else {
    $165 = HEAP32[$10 + 24 >> 2] | 0; //@line 4257
    $167 = HEAP32[$10 + 12 >> 2] | 0; //@line 4259
    do {
     if (($167 | 0) == ($10 | 0)) {
      $179 = $10 + 16 | 0; //@line 4263
      $180 = $179 + 4 | 0; //@line 4264
      $181 = HEAP32[$180 >> 2] | 0; //@line 4265
      if (!$181) {
       $183 = HEAP32[$179 >> 2] | 0; //@line 4268
       if (!$183) {
        $$3400 = 0; //@line 4271
        break;
       } else {
        $$1398 = $183; //@line 4274
        $$1402 = $179; //@line 4274
       }
      } else {
       $$1398 = $181; //@line 4277
       $$1402 = $180; //@line 4277
      }
      while (1) {
       $185 = $$1398 + 20 | 0; //@line 4280
       $186 = HEAP32[$185 >> 2] | 0; //@line 4281
       if ($186 | 0) {
        $$1398 = $186; //@line 4284
        $$1402 = $185; //@line 4284
        continue;
       }
       $188 = $$1398 + 16 | 0; //@line 4287
       $189 = HEAP32[$188 >> 2] | 0; //@line 4288
       if (!$189) {
        break;
       } else {
        $$1398 = $189; //@line 4293
        $$1402 = $188; //@line 4293
       }
      }
      if ((HEAP32[1011] | 0) >>> 0 > $$1402 >>> 0) {
       _abort(); //@line 4299
      } else {
       HEAP32[$$1402 >> 2] = 0; //@line 4302
       $$3400 = $$1398; //@line 4303
       break;
      }
     } else {
      $170 = HEAP32[$10 + 8 >> 2] | 0; //@line 4308
      if ((HEAP32[1011] | 0) >>> 0 > $170 >>> 0) {
       _abort(); //@line 4312
      }
      $173 = $170 + 12 | 0; //@line 4315
      if ((HEAP32[$173 >> 2] | 0) != ($10 | 0)) {
       _abort(); //@line 4319
      }
      $176 = $167 + 8 | 0; //@line 4322
      if ((HEAP32[$176 >> 2] | 0) == ($10 | 0)) {
       HEAP32[$173 >> 2] = $167; //@line 4326
       HEAP32[$176 >> 2] = $170; //@line 4327
       $$3400 = $167; //@line 4328
       break;
      } else {
       _abort(); //@line 4331
      }
     }
    } while (0);
    if ($165 | 0) {
     $195 = HEAP32[$10 + 28 >> 2] | 0; //@line 4339
     $196 = 4332 + ($195 << 2) | 0; //@line 4340
     do {
      if ((HEAP32[$196 >> 2] | 0) == ($10 | 0)) {
       HEAP32[$196 >> 2] = $$3400; //@line 4345
       if (!$$3400) {
        HEAP32[1008] = HEAP32[1008] & ~(1 << $195); //@line 4352
        break L108;
       }
      } else {
       if ((HEAP32[1011] | 0) >>> 0 > $165 >>> 0) {
        _abort(); //@line 4359
       } else {
        HEAP32[$165 + 16 + (((HEAP32[$165 + 16 >> 2] | 0) != ($10 | 0) & 1) << 2) >> 2] = $$3400; //@line 4367
        if (!$$3400) {
         break L108;
        } else {
         break;
        }
       }
      }
     } while (0);
     $210 = HEAP32[1011] | 0; //@line 4377
     if ($210 >>> 0 > $$3400 >>> 0) {
      _abort(); //@line 4380
     }
     HEAP32[$$3400 + 24 >> 2] = $165; //@line 4384
     $213 = $10 + 16 | 0; //@line 4385
     $214 = HEAP32[$213 >> 2] | 0; //@line 4386
     do {
      if ($214 | 0) {
       if ($210 >>> 0 > $214 >>> 0) {
        _abort(); //@line 4392
       } else {
        HEAP32[$$3400 + 16 >> 2] = $214; //@line 4396
        HEAP32[$214 + 24 >> 2] = $$3400; //@line 4398
        break;
       }
      }
     } while (0);
     $220 = HEAP32[$213 + 4 >> 2] | 0; //@line 4404
     if ($220 | 0) {
      if ((HEAP32[1011] | 0) >>> 0 > $220 >>> 0) {
       _abort(); //@line 4410
      } else {
       HEAP32[$$3400 + 20 >> 2] = $220; //@line 4414
       HEAP32[$220 + 24 >> 2] = $$3400; //@line 4416
       break;
      }
     }
    }
   }
  } while (0);
  HEAP32[$$1 + 4 >> 2] = $137 | 1; //@line 4425
  HEAP32[$114 + $137 >> 2] = $137; //@line 4427
  if (($$1 | 0) == (HEAP32[1012] | 0)) {
   HEAP32[1009] = $137; //@line 4431
   return;
  } else {
   $$2 = $137; //@line 4434
  }
 } else {
  HEAP32[$115 >> 2] = $116 & -2; //@line 4438
  HEAP32[$$1 + 4 >> 2] = $$1382 | 1; //@line 4441
  HEAP32[$114 + $$1382 >> 2] = $$1382; //@line 4443
  $$2 = $$1382; //@line 4444
 }
 $235 = $$2 >>> 3; //@line 4446
 if ($$2 >>> 0 < 256) {
  $238 = 4068 + ($235 << 1 << 2) | 0; //@line 4450
  $239 = HEAP32[1007] | 0; //@line 4451
  $240 = 1 << $235; //@line 4452
  if (!($239 & $240)) {
   HEAP32[1007] = $239 | $240; //@line 4457
   $$0403 = $238; //@line 4459
   $$pre$phiZ2D = $238 + 8 | 0; //@line 4459
  } else {
   $244 = $238 + 8 | 0; //@line 4461
   $245 = HEAP32[$244 >> 2] | 0; //@line 4462
   if ((HEAP32[1011] | 0) >>> 0 > $245 >>> 0) {
    _abort(); //@line 4466
   } else {
    $$0403 = $245; //@line 4469
    $$pre$phiZ2D = $244; //@line 4469
   }
  }
  HEAP32[$$pre$phiZ2D >> 2] = $$1; //@line 4472
  HEAP32[$$0403 + 12 >> 2] = $$1; //@line 4474
  HEAP32[$$1 + 8 >> 2] = $$0403; //@line 4476
  HEAP32[$$1 + 12 >> 2] = $238; //@line 4478
  return;
 }
 $251 = $$2 >>> 8; //@line 4481
 if (!$251) {
  $$0396 = 0; //@line 4484
 } else {
  if ($$2 >>> 0 > 16777215) {
   $$0396 = 31; //@line 4488
  } else {
   $256 = ($251 + 1048320 | 0) >>> 16 & 8; //@line 4492
   $257 = $251 << $256; //@line 4493
   $260 = ($257 + 520192 | 0) >>> 16 & 4; //@line 4496
   $262 = $257 << $260; //@line 4498
   $265 = ($262 + 245760 | 0) >>> 16 & 2; //@line 4501
   $270 = 14 - ($260 | $256 | $265) + ($262 << $265 >>> 15) | 0; //@line 4506
   $$0396 = $$2 >>> ($270 + 7 | 0) & 1 | $270 << 1; //@line 4512
  }
 }
 $276 = 4332 + ($$0396 << 2) | 0; //@line 4515
 HEAP32[$$1 + 28 >> 2] = $$0396; //@line 4517
 HEAP32[$$1 + 20 >> 2] = 0; //@line 4520
 HEAP32[$$1 + 16 >> 2] = 0; //@line 4521
 $280 = HEAP32[1008] | 0; //@line 4522
 $281 = 1 << $$0396; //@line 4523
 do {
  if (!($280 & $281)) {
   HEAP32[1008] = $280 | $281; //@line 4529
   HEAP32[$276 >> 2] = $$1; //@line 4530
   HEAP32[$$1 + 24 >> 2] = $276; //@line 4532
   HEAP32[$$1 + 12 >> 2] = $$1; //@line 4534
   HEAP32[$$1 + 8 >> 2] = $$1; //@line 4536
  } else {
   $$0383 = $$2 << (($$0396 | 0) == 31 ? 0 : 25 - ($$0396 >>> 1) | 0); //@line 4544
   $$0384 = HEAP32[$276 >> 2] | 0; //@line 4544
   while (1) {
    if ((HEAP32[$$0384 + 4 >> 2] & -8 | 0) == ($$2 | 0)) {
     label = 124; //@line 4551
     break;
    }
    $299 = $$0384 + 16 + ($$0383 >>> 31 << 2) | 0; //@line 4555
    $301 = HEAP32[$299 >> 2] | 0; //@line 4557
    if (!$301) {
     label = 121; //@line 4560
     break;
    } else {
     $$0383 = $$0383 << 1; //@line 4563
     $$0384 = $301; //@line 4563
    }
   }
   if ((label | 0) == 121) {
    if ((HEAP32[1011] | 0) >>> 0 > $299 >>> 0) {
     _abort(); //@line 4570
    } else {
     HEAP32[$299 >> 2] = $$1; //@line 4573
     HEAP32[$$1 + 24 >> 2] = $$0384; //@line 4575
     HEAP32[$$1 + 12 >> 2] = $$1; //@line 4577
     HEAP32[$$1 + 8 >> 2] = $$1; //@line 4579
     break;
    }
   } else if ((label | 0) == 124) {
    $308 = $$0384 + 8 | 0; //@line 4584
    $309 = HEAP32[$308 >> 2] | 0; //@line 4585
    $310 = HEAP32[1011] | 0; //@line 4586
    if ($310 >>> 0 <= $309 >>> 0 & $310 >>> 0 <= $$0384 >>> 0) {
     HEAP32[$309 + 12 >> 2] = $$1; //@line 4592
     HEAP32[$308 >> 2] = $$1; //@line 4593
     HEAP32[$$1 + 8 >> 2] = $309; //@line 4595
     HEAP32[$$1 + 12 >> 2] = $$0384; //@line 4597
     HEAP32[$$1 + 24 >> 2] = 0; //@line 4599
     break;
    } else {
     _abort(); //@line 4602
    }
   }
  }
 } while (0);
 $319 = (HEAP32[1015] | 0) + -1 | 0; //@line 4609
 HEAP32[1015] = $319; //@line 4610
 if (!$319) {
  $$0212$in$i = 4484; //@line 4613
 } else {
  return;
 }
 while (1) {
  $$0212$i = HEAP32[$$0212$in$i >> 2] | 0; //@line 4618
  if (!$$0212$i) {
   break;
  } else {
   $$0212$in$i = $$0212$i + 8 | 0; //@line 4624
  }
 }
 HEAP32[1015] = -1; //@line 4627
 return;
}
function _twoway_strstr($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0166 = 0, $$0168 = 0, $$0169 = 0, $$0169$be = 0, $$0170 = 0, $$0175$ph$ph$lcssa216 = 0, $$0175$ph$ph$lcssa216328 = 0, $$0175$ph$ph254 = 0, $$0179242 = 0, $$0183$ph197$ph253 = 0, $$0183$ph197248 = 0, $$0183$ph260 = 0, $$0185$ph$lcssa = 0, $$0185$ph$lcssa327 = 0, $$0185$ph259 = 0, $$0187219$ph325326 = 0, $$0187263 = 0, $$1176$$0175 = 0, $$1176$ph$ph$lcssa208 = 0, $$1176$ph$ph233 = 0, $$1180222 = 0, $$1184$ph193$ph232 = 0, $$1184$ph193227 = 0, $$1184$ph239 = 0, $$1186$$0185 = 0, $$1186$ph$lcssa = 0, $$1186$ph238 = 0, $$2181$sink = 0, $$3 = 0, $$3173 = 0, $$3178 = 0, $$3182221 = 0, $$4 = 0, $$pr = 0, $10 = 0, $105 = 0, $111 = 0, $113 = 0, $118 = 0, $130 = 0, $131 = 0, $132 = 0, $133 = 0, $134 = 0, $135 = 0, $14 = 0, $2 = 0, $23 = 0, $25 = 0, $27 = 0, $3 = 0, $32 = 0, $34 = 0, $37 = 0, $4 = 0, $41 = 0, $45 = 0, $50 = 0, $52 = 0, $53 = 0, $56 = 0, $60 = 0, $68 = 0, $70 = 0, $74 = 0, $78 = 0, $79 = 0, $80 = 0, $81 = 0, $83 = 0, $86 = 0, $93 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 8967
 STACKTOP = STACKTOP + 1056 | 0; //@line 8968
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(1056); //@line 8968
 $2 = sp + 1024 | 0; //@line 8969
 $3 = sp; //@line 8970
 HEAP32[$2 >> 2] = 0; //@line 8971
 HEAP32[$2 + 4 >> 2] = 0; //@line 8971
 HEAP32[$2 + 8 >> 2] = 0; //@line 8971
 HEAP32[$2 + 12 >> 2] = 0; //@line 8971
 HEAP32[$2 + 16 >> 2] = 0; //@line 8971
 HEAP32[$2 + 20 >> 2] = 0; //@line 8971
 HEAP32[$2 + 24 >> 2] = 0; //@line 8971
 HEAP32[$2 + 28 >> 2] = 0; //@line 8971
 $4 = HEAP8[$1 >> 0] | 0; //@line 8972
 L1 : do {
  if (!($4 << 24 >> 24)) {
   $$0175$ph$ph$lcssa216328 = 1; //@line 8976
   $$0185$ph$lcssa327 = -1; //@line 8976
   $$0187219$ph325326 = 0; //@line 8976
   $$1176$ph$ph$lcssa208 = 1; //@line 8976
   $$1186$ph$lcssa = -1; //@line 8976
   label = 26; //@line 8977
  } else {
   $$0187263 = 0; //@line 8979
   $10 = $4; //@line 8979
   do {
    if (!(HEAP8[$0 + $$0187263 >> 0] | 0)) {
     $$3 = 0; //@line 8985
     break L1;
    }
    $14 = $2 + ((($10 & 255) >>> 5 & 255) << 2) | 0; //@line 8993
    HEAP32[$14 >> 2] = HEAP32[$14 >> 2] | 1 << ($10 & 31); //@line 8996
    $$0187263 = $$0187263 + 1 | 0; //@line 8997
    HEAP32[$3 + (($10 & 255) << 2) >> 2] = $$0187263; //@line 9000
    $10 = HEAP8[$1 + $$0187263 >> 0] | 0; //@line 9002
   } while ($10 << 24 >> 24 != 0);
   $23 = $$0187263 >>> 0 > 1; //@line 9010
   if ($23) {
    $$0183$ph260 = 0; //@line 9012
    $$0185$ph259 = -1; //@line 9012
    $130 = 1; //@line 9012
    L6 : while (1) {
     $$0175$ph$ph254 = 1; //@line 9014
     $$0183$ph197$ph253 = $$0183$ph260; //@line 9014
     $131 = $130; //@line 9014
     while (1) {
      $$0183$ph197248 = $$0183$ph197$ph253; //@line 9016
      $132 = $131; //@line 9016
      L10 : while (1) {
       $$0179242 = 1; //@line 9018
       $25 = $132; //@line 9018
       while (1) {
        $32 = HEAP8[$1 + ($$0179242 + $$0185$ph259) >> 0] | 0; //@line 9022
        $34 = HEAP8[$1 + $25 >> 0] | 0; //@line 9024
        if ($32 << 24 >> 24 != $34 << 24 >> 24) {
         break L10;
        }
        if (($$0179242 | 0) == ($$0175$ph$ph254 | 0)) {
         break;
        }
        $$0179242 = $$0179242 + 1 | 0; //@line 9030
        $27 = $$0179242 + $$0183$ph197248 | 0; //@line 9034
        if ($27 >>> 0 >= $$0187263 >>> 0) {
         $$0175$ph$ph$lcssa216 = $$0175$ph$ph254; //@line 9039
         $$0185$ph$lcssa = $$0185$ph259; //@line 9039
         break L6;
        } else {
         $25 = $27; //@line 9037
        }
       }
       $37 = $$0175$ph$ph254 + $$0183$ph197248 | 0; //@line 9043
       $132 = $37 + 1 | 0; //@line 9044
       if ($132 >>> 0 >= $$0187263 >>> 0) {
        $$0175$ph$ph$lcssa216 = $$0175$ph$ph254; //@line 9049
        $$0185$ph$lcssa = $$0185$ph259; //@line 9049
        break L6;
       } else {
        $$0183$ph197248 = $37; //@line 9047
       }
      }
      $41 = $25 - $$0185$ph259 | 0; //@line 9054
      if (($32 & 255) <= ($34 & 255)) {
       break;
      }
      $131 = $25 + 1 | 0; //@line 9058
      if ($131 >>> 0 >= $$0187263 >>> 0) {
       $$0175$ph$ph$lcssa216 = $41; //@line 9063
       $$0185$ph$lcssa = $$0185$ph259; //@line 9063
       break L6;
      } else {
       $$0175$ph$ph254 = $41; //@line 9061
       $$0183$ph197$ph253 = $25; //@line 9061
      }
     }
     $130 = $$0183$ph197248 + 2 | 0; //@line 9068
     if ($130 >>> 0 >= $$0187263 >>> 0) {
      $$0175$ph$ph$lcssa216 = 1; //@line 9073
      $$0185$ph$lcssa = $$0183$ph197248; //@line 9073
      break;
     } else {
      $$0183$ph260 = $$0183$ph197248 + 1 | 0; //@line 9071
      $$0185$ph259 = $$0183$ph197248; //@line 9071
     }
    }
    if ($23) {
     $$1184$ph239 = 0; //@line 9078
     $$1186$ph238 = -1; //@line 9078
     $133 = 1; //@line 9078
     while (1) {
      $$1176$ph$ph233 = 1; //@line 9080
      $$1184$ph193$ph232 = $$1184$ph239; //@line 9080
      $135 = $133; //@line 9080
      while (1) {
       $$1184$ph193227 = $$1184$ph193$ph232; //@line 9082
       $134 = $135; //@line 9082
       L25 : while (1) {
        $$1180222 = 1; //@line 9084
        $52 = $134; //@line 9084
        while (1) {
         $50 = HEAP8[$1 + ($$1180222 + $$1186$ph238) >> 0] | 0; //@line 9088
         $53 = HEAP8[$1 + $52 >> 0] | 0; //@line 9090
         if ($50 << 24 >> 24 != $53 << 24 >> 24) {
          break L25;
         }
         if (($$1180222 | 0) == ($$1176$ph$ph233 | 0)) {
          break;
         }
         $$1180222 = $$1180222 + 1 | 0; //@line 9096
         $45 = $$1180222 + $$1184$ph193227 | 0; //@line 9100
         if ($45 >>> 0 >= $$0187263 >>> 0) {
          $$0175$ph$ph$lcssa216328 = $$0175$ph$ph$lcssa216; //@line 9105
          $$0185$ph$lcssa327 = $$0185$ph$lcssa; //@line 9105
          $$0187219$ph325326 = $$0187263; //@line 9105
          $$1176$ph$ph$lcssa208 = $$1176$ph$ph233; //@line 9105
          $$1186$ph$lcssa = $$1186$ph238; //@line 9105
          label = 26; //@line 9106
          break L1;
         } else {
          $52 = $45; //@line 9103
         }
        }
        $56 = $$1176$ph$ph233 + $$1184$ph193227 | 0; //@line 9110
        $134 = $56 + 1 | 0; //@line 9111
        if ($134 >>> 0 >= $$0187263 >>> 0) {
         $$0175$ph$ph$lcssa216328 = $$0175$ph$ph$lcssa216; //@line 9116
         $$0185$ph$lcssa327 = $$0185$ph$lcssa; //@line 9116
         $$0187219$ph325326 = $$0187263; //@line 9116
         $$1176$ph$ph$lcssa208 = $$1176$ph$ph233; //@line 9116
         $$1186$ph$lcssa = $$1186$ph238; //@line 9116
         label = 26; //@line 9117
         break L1;
        } else {
         $$1184$ph193227 = $56; //@line 9114
        }
       }
       $60 = $52 - $$1186$ph238 | 0; //@line 9122
       if (($50 & 255) >= ($53 & 255)) {
        break;
       }
       $135 = $52 + 1 | 0; //@line 9126
       if ($135 >>> 0 >= $$0187263 >>> 0) {
        $$0175$ph$ph$lcssa216328 = $$0175$ph$ph$lcssa216; //@line 9131
        $$0185$ph$lcssa327 = $$0185$ph$lcssa; //@line 9131
        $$0187219$ph325326 = $$0187263; //@line 9131
        $$1176$ph$ph$lcssa208 = $60; //@line 9131
        $$1186$ph$lcssa = $$1186$ph238; //@line 9131
        label = 26; //@line 9132
        break L1;
       } else {
        $$1176$ph$ph233 = $60; //@line 9129
        $$1184$ph193$ph232 = $52; //@line 9129
       }
      }
      $133 = $$1184$ph193227 + 2 | 0; //@line 9137
      if ($133 >>> 0 >= $$0187263 >>> 0) {
       $$0175$ph$ph$lcssa216328 = $$0175$ph$ph$lcssa216; //@line 9142
       $$0185$ph$lcssa327 = $$0185$ph$lcssa; //@line 9142
       $$0187219$ph325326 = $$0187263; //@line 9142
       $$1176$ph$ph$lcssa208 = 1; //@line 9142
       $$1186$ph$lcssa = $$1184$ph193227; //@line 9142
       label = 26; //@line 9143
       break;
      } else {
       $$1184$ph239 = $$1184$ph193227 + 1 | 0; //@line 9140
       $$1186$ph238 = $$1184$ph193227; //@line 9140
      }
     }
    } else {
     $$0175$ph$ph$lcssa216328 = $$0175$ph$ph$lcssa216; //@line 9148
     $$0185$ph$lcssa327 = $$0185$ph$lcssa; //@line 9148
     $$0187219$ph325326 = $$0187263; //@line 9148
     $$1176$ph$ph$lcssa208 = 1; //@line 9148
     $$1186$ph$lcssa = -1; //@line 9148
     label = 26; //@line 9149
    }
   } else {
    $$0175$ph$ph$lcssa216328 = 1; //@line 9152
    $$0185$ph$lcssa327 = -1; //@line 9152
    $$0187219$ph325326 = $$0187263; //@line 9152
    $$1176$ph$ph$lcssa208 = 1; //@line 9152
    $$1186$ph$lcssa = -1; //@line 9152
    label = 26; //@line 9153
   }
  }
 } while (0);
 L35 : do {
  if ((label | 0) == 26) {
   $68 = ($$1186$ph$lcssa + 1 | 0) >>> 0 > ($$0185$ph$lcssa327 + 1 | 0) >>> 0; //@line 9161
   $$1176$$0175 = $68 ? $$1176$ph$ph$lcssa208 : $$0175$ph$ph$lcssa216328; //@line 9162
   $$1186$$0185 = $68 ? $$1186$ph$lcssa : $$0185$ph$lcssa327; //@line 9163
   $70 = $$1186$$0185 + 1 | 0; //@line 9165
   if (!(_memcmp($1, $1 + $$1176$$0175 | 0, $70) | 0)) {
    $$0168 = $$0187219$ph325326 - $$1176$$0175 | 0; //@line 9170
    $$3178 = $$1176$$0175; //@line 9170
   } else {
    $74 = $$0187219$ph325326 - $$1186$$0185 + -1 | 0; //@line 9173
    $$0168 = 0; //@line 9177
    $$3178 = ($$1186$$0185 >>> 0 > $74 >>> 0 ? $$1186$$0185 : $74) + 1 | 0; //@line 9177
   }
   $78 = $$0187219$ph325326 | 63; //@line 9179
   $79 = $$0187219$ph325326 + -1 | 0; //@line 9180
   $80 = ($$0168 | 0) != 0; //@line 9181
   $81 = $$0187219$ph325326 - $$3178 | 0; //@line 9182
   $$0166 = $0; //@line 9183
   $$0169 = 0; //@line 9183
   $$0170 = $0; //@line 9183
   while (1) {
    $83 = $$0166; //@line 9186
    do {
     if (($$0170 - $83 | 0) >>> 0 < $$0187219$ph325326 >>> 0) {
      $86 = _memchr($$0170, 0, $78) | 0; //@line 9191
      if (!$86) {
       $$3173 = $$0170 + $78 | 0; //@line 9195
       break;
      } else {
       if (($86 - $83 | 0) >>> 0 < $$0187219$ph325326 >>> 0) {
        $$3 = 0; //@line 9202
        break L35;
       } else {
        $$3173 = $86; //@line 9205
        break;
       }
      }
     } else {
      $$3173 = $$0170; //@line 9210
     }
    } while (0);
    $93 = HEAP8[$$0166 + $79 >> 0] | 0; //@line 9214
    L49 : do {
     if (!(1 << ($93 & 31) & HEAP32[$2 + ((($93 & 255) >>> 5 & 255) << 2) >> 2])) {
      $$0169$be = 0; //@line 9226
      $$2181$sink = $$0187219$ph325326; //@line 9226
     } else {
      $105 = $$0187219$ph325326 - (HEAP32[$3 + (($93 & 255) << 2) >> 2] | 0) | 0; //@line 9231
      if ($105 | 0) {
       $$0169$be = 0; //@line 9239
       $$2181$sink = $80 & ($$0169 | 0) != 0 & $105 >>> 0 < $$3178 >>> 0 ? $81 : $105; //@line 9239
       break;
      }
      $111 = $70 >>> 0 > $$0169 >>> 0 ? $70 : $$0169; //@line 9243
      $113 = HEAP8[$1 + $111 >> 0] | 0; //@line 9245
      L54 : do {
       if (!($113 << 24 >> 24)) {
        $$4 = $70; //@line 9249
       } else {
        $$3182221 = $111; //@line 9251
        $$pr = $113; //@line 9251
        while (1) {
         if ($$pr << 24 >> 24 != (HEAP8[$$0166 + $$3182221 >> 0] | 0)) {
          break;
         }
         $118 = $$3182221 + 1 | 0; //@line 9259
         $$pr = HEAP8[$1 + $118 >> 0] | 0; //@line 9261
         if (!($$pr << 24 >> 24)) {
          $$4 = $70; //@line 9264
          break L54;
         } else {
          $$3182221 = $118; //@line 9267
         }
        }
        $$0169$be = 0; //@line 9271
        $$2181$sink = $$3182221 - $$1186$$0185 | 0; //@line 9271
        break L49;
       }
      } while (0);
      while (1) {
       if ($$4 >>> 0 <= $$0169 >>> 0) {
        $$3 = $$0166; //@line 9278
        break L35;
       }
       $$4 = $$4 + -1 | 0; //@line 9281
       if ((HEAP8[$1 + $$4 >> 0] | 0) != (HEAP8[$$0166 + $$4 >> 0] | 0)) {
        $$0169$be = $$0168; //@line 9290
        $$2181$sink = $$3178; //@line 9290
        break;
       }
      }
     }
    } while (0);
    $$0166 = $$0166 + $$2181$sink | 0; //@line 9297
    $$0169 = $$0169$be; //@line 9297
    $$0170 = $$3173; //@line 9297
   }
  }
 } while (0);
 STACKTOP = sp; //@line 9301
 return $$3 | 0; //@line 9301
}
function ___udivmoddi4($a$0, $a$1, $b$0, $b$1, $rem) {
 $a$0 = $a$0 | 0;
 $a$1 = $a$1 | 0;
 $b$0 = $b$0 | 0;
 $b$1 = $b$1 | 0;
 $rem = $rem | 0;
 var $n_sroa_0_0_extract_trunc = 0, $n_sroa_1_4_extract_shift$0 = 0, $n_sroa_1_4_extract_trunc = 0, $d_sroa_0_0_extract_trunc = 0, $d_sroa_1_4_extract_shift$0 = 0, $d_sroa_1_4_extract_trunc = 0, $4 = 0, $17 = 0, $37 = 0, $51 = 0, $57 = 0, $58 = 0, $66 = 0, $78 = 0, $88 = 0, $89 = 0, $91 = 0, $92 = 0, $95 = 0, $105 = 0, $119 = 0, $125 = 0, $126 = 0, $130 = 0, $q_sroa_1_1_ph = 0, $q_sroa_0_1_ph = 0, $r_sroa_1_1_ph = 0, $r_sroa_0_1_ph = 0, $sr_1_ph = 0, $d_sroa_0_0_insert_insert99$0 = 0, $d_sroa_0_0_insert_insert99$1 = 0, $137$0 = 0, $137$1 = 0, $carry_0203 = 0, $sr_1202 = 0, $r_sroa_0_1201 = 0, $r_sroa_1_1200 = 0, $q_sroa_0_1199 = 0, $q_sroa_1_1198 = 0, $r_sroa_0_0_insert_insert42$0 = 0, $r_sroa_0_0_insert_insert42$1 = 0, $150$1 = 0, $151$0 = 0, $carry_0_lcssa$0 = 0, $carry_0_lcssa$1 = 0, $r_sroa_0_1_lcssa = 0, $r_sroa_1_1_lcssa = 0, $q_sroa_0_1_lcssa = 0, $q_sroa_1_1_lcssa = 0, $q_sroa_0_0_insert_ext75$0 = 0, $q_sroa_0_0_insert_ext75$1 = 0, $_0$0 = 0, $_0$1 = 0, $q_sroa_1_1198$looptemp = 0;
 $n_sroa_0_0_extract_trunc = $a$0; //@line 12985
 $n_sroa_1_4_extract_shift$0 = $a$1; //@line 12986
 $n_sroa_1_4_extract_trunc = $n_sroa_1_4_extract_shift$0; //@line 12987
 $d_sroa_0_0_extract_trunc = $b$0; //@line 12988
 $d_sroa_1_4_extract_shift$0 = $b$1; //@line 12989
 $d_sroa_1_4_extract_trunc = $d_sroa_1_4_extract_shift$0; //@line 12990
 if (!$n_sroa_1_4_extract_trunc) {
  $4 = ($rem | 0) != 0; //@line 12992
  if (!$d_sroa_1_4_extract_trunc) {
   if ($4) {
    HEAP32[$rem >> 2] = ($n_sroa_0_0_extract_trunc >>> 0) % ($d_sroa_0_0_extract_trunc >>> 0); //@line 12995
    HEAP32[$rem + 4 >> 2] = 0; //@line 12996
   }
   $_0$1 = 0; //@line 12998
   $_0$0 = ($n_sroa_0_0_extract_trunc >>> 0) / ($d_sroa_0_0_extract_trunc >>> 0) >>> 0; //@line 12999
   return (tempRet0 = $_0$1, $_0$0) | 0; //@line 13000
  } else {
   if (!$4) {
    $_0$1 = 0; //@line 13003
    $_0$0 = 0; //@line 13004
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 13005
   }
   HEAP32[$rem >> 2] = $a$0 | 0; //@line 13007
   HEAP32[$rem + 4 >> 2] = $a$1 & 0; //@line 13008
   $_0$1 = 0; //@line 13009
   $_0$0 = 0; //@line 13010
   return (tempRet0 = $_0$1, $_0$0) | 0; //@line 13011
  }
 }
 $17 = ($d_sroa_1_4_extract_trunc | 0) == 0; //@line 13014
 do {
  if (!$d_sroa_0_0_extract_trunc) {
   if ($17) {
    if ($rem | 0) {
     HEAP32[$rem >> 2] = ($n_sroa_1_4_extract_trunc >>> 0) % ($d_sroa_0_0_extract_trunc >>> 0); //@line 13019
     HEAP32[$rem + 4 >> 2] = 0; //@line 13020
    }
    $_0$1 = 0; //@line 13022
    $_0$0 = ($n_sroa_1_4_extract_trunc >>> 0) / ($d_sroa_0_0_extract_trunc >>> 0) >>> 0; //@line 13023
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 13024
   }
   if (!$n_sroa_0_0_extract_trunc) {
    if ($rem | 0) {
     HEAP32[$rem >> 2] = 0; //@line 13028
     HEAP32[$rem + 4 >> 2] = ($n_sroa_1_4_extract_trunc >>> 0) % ($d_sroa_1_4_extract_trunc >>> 0); //@line 13029
    }
    $_0$1 = 0; //@line 13031
    $_0$0 = ($n_sroa_1_4_extract_trunc >>> 0) / ($d_sroa_1_4_extract_trunc >>> 0) >>> 0; //@line 13032
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 13033
   }
   $37 = $d_sroa_1_4_extract_trunc - 1 | 0; //@line 13035
   if (!($37 & $d_sroa_1_4_extract_trunc)) {
    if ($rem | 0) {
     HEAP32[$rem >> 2] = $a$0 | 0; //@line 13038
     HEAP32[$rem + 4 >> 2] = $37 & $n_sroa_1_4_extract_trunc | $a$1 & 0; //@line 13039
    }
    $_0$1 = 0; //@line 13041
    $_0$0 = $n_sroa_1_4_extract_trunc >>> ((_llvm_cttz_i32($d_sroa_1_4_extract_trunc | 0) | 0) >>> 0); //@line 13042
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 13043
   }
   $51 = (Math_clz32($d_sroa_1_4_extract_trunc | 0) | 0) - (Math_clz32($n_sroa_1_4_extract_trunc | 0) | 0) | 0; //@line 13046
   if ($51 >>> 0 <= 30) {
    $57 = $51 + 1 | 0; //@line 13048
    $58 = 31 - $51 | 0; //@line 13049
    $sr_1_ph = $57; //@line 13050
    $r_sroa_0_1_ph = $n_sroa_1_4_extract_trunc << $58 | $n_sroa_0_0_extract_trunc >>> ($57 >>> 0); //@line 13051
    $r_sroa_1_1_ph = $n_sroa_1_4_extract_trunc >>> ($57 >>> 0); //@line 13052
    $q_sroa_0_1_ph = 0; //@line 13053
    $q_sroa_1_1_ph = $n_sroa_0_0_extract_trunc << $58; //@line 13054
    break;
   }
   if (!$rem) {
    $_0$1 = 0; //@line 13058
    $_0$0 = 0; //@line 13059
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 13060
   }
   HEAP32[$rem >> 2] = $a$0 | 0; //@line 13062
   HEAP32[$rem + 4 >> 2] = $n_sroa_1_4_extract_shift$0 | $a$1 & 0; //@line 13063
   $_0$1 = 0; //@line 13064
   $_0$0 = 0; //@line 13065
   return (tempRet0 = $_0$1, $_0$0) | 0; //@line 13066
  } else {
   if (!$17) {
    $119 = (Math_clz32($d_sroa_1_4_extract_trunc | 0) | 0) - (Math_clz32($n_sroa_1_4_extract_trunc | 0) | 0) | 0; //@line 13070
    if ($119 >>> 0 <= 31) {
     $125 = $119 + 1 | 0; //@line 13072
     $126 = 31 - $119 | 0; //@line 13073
     $130 = $119 - 31 >> 31; //@line 13074
     $sr_1_ph = $125; //@line 13075
     $r_sroa_0_1_ph = $n_sroa_0_0_extract_trunc >>> ($125 >>> 0) & $130 | $n_sroa_1_4_extract_trunc << $126; //@line 13076
     $r_sroa_1_1_ph = $n_sroa_1_4_extract_trunc >>> ($125 >>> 0) & $130; //@line 13077
     $q_sroa_0_1_ph = 0; //@line 13078
     $q_sroa_1_1_ph = $n_sroa_0_0_extract_trunc << $126; //@line 13079
     break;
    }
    if (!$rem) {
     $_0$1 = 0; //@line 13083
     $_0$0 = 0; //@line 13084
     return (tempRet0 = $_0$1, $_0$0) | 0; //@line 13085
    }
    HEAP32[$rem >> 2] = $a$0 | 0; //@line 13087
    HEAP32[$rem + 4 >> 2] = $n_sroa_1_4_extract_shift$0 | $a$1 & 0; //@line 13088
    $_0$1 = 0; //@line 13089
    $_0$0 = 0; //@line 13090
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 13091
   }
   $66 = $d_sroa_0_0_extract_trunc - 1 | 0; //@line 13093
   if ($66 & $d_sroa_0_0_extract_trunc | 0) {
    $88 = (Math_clz32($d_sroa_0_0_extract_trunc | 0) | 0) + 33 - (Math_clz32($n_sroa_1_4_extract_trunc | 0) | 0) | 0; //@line 13096
    $89 = 64 - $88 | 0; //@line 13097
    $91 = 32 - $88 | 0; //@line 13098
    $92 = $91 >> 31; //@line 13099
    $95 = $88 - 32 | 0; //@line 13100
    $105 = $95 >> 31; //@line 13101
    $sr_1_ph = $88; //@line 13102
    $r_sroa_0_1_ph = $91 - 1 >> 31 & $n_sroa_1_4_extract_trunc >>> ($95 >>> 0) | ($n_sroa_1_4_extract_trunc << $91 | $n_sroa_0_0_extract_trunc >>> ($88 >>> 0)) & $105; //@line 13103
    $r_sroa_1_1_ph = $105 & $n_sroa_1_4_extract_trunc >>> ($88 >>> 0); //@line 13104
    $q_sroa_0_1_ph = $n_sroa_0_0_extract_trunc << $89 & $92; //@line 13105
    $q_sroa_1_1_ph = ($n_sroa_1_4_extract_trunc << $89 | $n_sroa_0_0_extract_trunc >>> ($95 >>> 0)) & $92 | $n_sroa_0_0_extract_trunc << $91 & $88 - 33 >> 31; //@line 13106
    break;
   }
   if ($rem | 0) {
    HEAP32[$rem >> 2] = $66 & $n_sroa_0_0_extract_trunc; //@line 13110
    HEAP32[$rem + 4 >> 2] = 0; //@line 13111
   }
   if (($d_sroa_0_0_extract_trunc | 0) == 1) {
    $_0$1 = $n_sroa_1_4_extract_shift$0 | $a$1 & 0; //@line 13114
    $_0$0 = $a$0 | 0 | 0; //@line 13115
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 13116
   } else {
    $78 = _llvm_cttz_i32($d_sroa_0_0_extract_trunc | 0) | 0; //@line 13118
    $_0$1 = $n_sroa_1_4_extract_trunc >>> ($78 >>> 0) | 0; //@line 13119
    $_0$0 = $n_sroa_1_4_extract_trunc << 32 - $78 | $n_sroa_0_0_extract_trunc >>> ($78 >>> 0) | 0; //@line 13120
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 13121
   }
  }
 } while (0);
 if (!$sr_1_ph) {
  $q_sroa_1_1_lcssa = $q_sroa_1_1_ph; //@line 13126
  $q_sroa_0_1_lcssa = $q_sroa_0_1_ph; //@line 13127
  $r_sroa_1_1_lcssa = $r_sroa_1_1_ph; //@line 13128
  $r_sroa_0_1_lcssa = $r_sroa_0_1_ph; //@line 13129
  $carry_0_lcssa$1 = 0; //@line 13130
  $carry_0_lcssa$0 = 0; //@line 13131
 } else {
  $d_sroa_0_0_insert_insert99$0 = $b$0 | 0 | 0; //@line 13133
  $d_sroa_0_0_insert_insert99$1 = $d_sroa_1_4_extract_shift$0 | $b$1 & 0; //@line 13134
  $137$0 = _i64Add($d_sroa_0_0_insert_insert99$0 | 0, $d_sroa_0_0_insert_insert99$1 | 0, -1, -1) | 0; //@line 13135
  $137$1 = tempRet0; //@line 13136
  $q_sroa_1_1198 = $q_sroa_1_1_ph; //@line 13137
  $q_sroa_0_1199 = $q_sroa_0_1_ph; //@line 13138
  $r_sroa_1_1200 = $r_sroa_1_1_ph; //@line 13139
  $r_sroa_0_1201 = $r_sroa_0_1_ph; //@line 13140
  $sr_1202 = $sr_1_ph; //@line 13141
  $carry_0203 = 0; //@line 13142
  do {
   $q_sroa_1_1198$looptemp = $q_sroa_1_1198;
   $q_sroa_1_1198 = $q_sroa_0_1199 >>> 31 | $q_sroa_1_1198 << 1; //@line 13144
   $q_sroa_0_1199 = $carry_0203 | $q_sroa_0_1199 << 1; //@line 13145
   $r_sroa_0_0_insert_insert42$0 = $r_sroa_0_1201 << 1 | $q_sroa_1_1198$looptemp >>> 31 | 0; //@line 13146
   $r_sroa_0_0_insert_insert42$1 = $r_sroa_0_1201 >>> 31 | $r_sroa_1_1200 << 1 | 0; //@line 13147
   _i64Subtract($137$0 | 0, $137$1 | 0, $r_sroa_0_0_insert_insert42$0 | 0, $r_sroa_0_0_insert_insert42$1 | 0) | 0; //@line 13148
   $150$1 = tempRet0; //@line 13149
   $151$0 = $150$1 >> 31 | (($150$1 | 0) < 0 ? -1 : 0) << 1; //@line 13150
   $carry_0203 = $151$0 & 1; //@line 13151
   $r_sroa_0_1201 = _i64Subtract($r_sroa_0_0_insert_insert42$0 | 0, $r_sroa_0_0_insert_insert42$1 | 0, $151$0 & $d_sroa_0_0_insert_insert99$0 | 0, ((($150$1 | 0) < 0 ? -1 : 0) >> 31 | (($150$1 | 0) < 0 ? -1 : 0) << 1) & $d_sroa_0_0_insert_insert99$1 | 0) | 0; //@line 13153
   $r_sroa_1_1200 = tempRet0; //@line 13154
   $sr_1202 = $sr_1202 - 1 | 0; //@line 13155
  } while (($sr_1202 | 0) != 0);
  $q_sroa_1_1_lcssa = $q_sroa_1_1198; //@line 13167
  $q_sroa_0_1_lcssa = $q_sroa_0_1199; //@line 13168
  $r_sroa_1_1_lcssa = $r_sroa_1_1200; //@line 13169
  $r_sroa_0_1_lcssa = $r_sroa_0_1201; //@line 13170
  $carry_0_lcssa$1 = 0; //@line 13171
  $carry_0_lcssa$0 = $carry_0203; //@line 13172
 }
 $q_sroa_0_0_insert_ext75$0 = $q_sroa_0_1_lcssa; //@line 13174
 $q_sroa_0_0_insert_ext75$1 = 0; //@line 13175
 if ($rem | 0) {
  HEAP32[$rem >> 2] = $r_sroa_0_1_lcssa; //@line 13178
  HEAP32[$rem + 4 >> 2] = $r_sroa_1_1_lcssa; //@line 13179
 }
 $_0$1 = ($q_sroa_0_0_insert_ext75$0 | 0) >>> 31 | ($q_sroa_1_1_lcssa | $q_sroa_0_0_insert_ext75$1) << 1 | ($q_sroa_0_0_insert_ext75$1 << 1 | $q_sroa_0_0_insert_ext75$0 >>> 31) & 0 | $carry_0_lcssa$1; //@line 13181
 $_0$0 = ($q_sroa_0_0_insert_ext75$0 << 1 | 0 >>> 31) & -2 | $carry_0_lcssa$0; //@line 13182
 return (tempRet0 = $_0$1, $_0$0) | 0; //@line 13183
}
function _mbed_die() {
 var $0 = 0, $AsyncCtx = 0, $AsyncCtx11 = 0, $AsyncCtx15 = 0, $AsyncCtx19 = 0, $AsyncCtx23 = 0, $AsyncCtx27 = 0, $AsyncCtx3 = 0, $AsyncCtx31 = 0, $AsyncCtx35 = 0, $AsyncCtx39 = 0, $AsyncCtx43 = 0, $AsyncCtx47 = 0, $AsyncCtx51 = 0, $AsyncCtx55 = 0, $AsyncCtx59 = 0, $AsyncCtx7 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 879
 STACKTOP = STACKTOP + 32 | 0; //@line 880
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(32); //@line 880
 $0 = sp; //@line 881
 _gpio_init_out($0, 50); //@line 882
 while (1) {
  _emscripten_asm_const_iii(2, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 885
  $AsyncCtx59 = _emscripten_alloc_async_context(8, sp) | 0; //@line 886
  _wait_ms(150); //@line 887
  if (___async) {
   label = 3; //@line 890
   break;
  }
  _emscripten_free_async_context($AsyncCtx59 | 0); //@line 893
  _emscripten_asm_const_iii(2, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 895
  $AsyncCtx55 = _emscripten_alloc_async_context(8, sp) | 0; //@line 896
  _wait_ms(150); //@line 897
  if (___async) {
   label = 5; //@line 900
   break;
  }
  _emscripten_free_async_context($AsyncCtx55 | 0); //@line 903
  _emscripten_asm_const_iii(2, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 905
  $AsyncCtx51 = _emscripten_alloc_async_context(8, sp) | 0; //@line 906
  _wait_ms(150); //@line 907
  if (___async) {
   label = 7; //@line 910
   break;
  }
  _emscripten_free_async_context($AsyncCtx51 | 0); //@line 913
  _emscripten_asm_const_iii(2, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 915
  $AsyncCtx47 = _emscripten_alloc_async_context(8, sp) | 0; //@line 916
  _wait_ms(150); //@line 917
  if (___async) {
   label = 9; //@line 920
   break;
  }
  _emscripten_free_async_context($AsyncCtx47 | 0); //@line 923
  _emscripten_asm_const_iii(2, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 925
  $AsyncCtx43 = _emscripten_alloc_async_context(8, sp) | 0; //@line 926
  _wait_ms(150); //@line 927
  if (___async) {
   label = 11; //@line 930
   break;
  }
  _emscripten_free_async_context($AsyncCtx43 | 0); //@line 933
  _emscripten_asm_const_iii(2, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 935
  $AsyncCtx39 = _emscripten_alloc_async_context(8, sp) | 0; //@line 936
  _wait_ms(150); //@line 937
  if (___async) {
   label = 13; //@line 940
   break;
  }
  _emscripten_free_async_context($AsyncCtx39 | 0); //@line 943
  _emscripten_asm_const_iii(2, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 945
  $AsyncCtx35 = _emscripten_alloc_async_context(8, sp) | 0; //@line 946
  _wait_ms(150); //@line 947
  if (___async) {
   label = 15; //@line 950
   break;
  }
  _emscripten_free_async_context($AsyncCtx35 | 0); //@line 953
  _emscripten_asm_const_iii(2, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 955
  $AsyncCtx31 = _emscripten_alloc_async_context(8, sp) | 0; //@line 956
  _wait_ms(150); //@line 957
  if (___async) {
   label = 17; //@line 960
   break;
  }
  _emscripten_free_async_context($AsyncCtx31 | 0); //@line 963
  _emscripten_asm_const_iii(2, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 965
  $AsyncCtx27 = _emscripten_alloc_async_context(8, sp) | 0; //@line 966
  _wait_ms(400); //@line 967
  if (___async) {
   label = 19; //@line 970
   break;
  }
  _emscripten_free_async_context($AsyncCtx27 | 0); //@line 973
  _emscripten_asm_const_iii(2, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 975
  $AsyncCtx23 = _emscripten_alloc_async_context(8, sp) | 0; //@line 976
  _wait_ms(400); //@line 977
  if (___async) {
   label = 21; //@line 980
   break;
  }
  _emscripten_free_async_context($AsyncCtx23 | 0); //@line 983
  _emscripten_asm_const_iii(2, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 985
  $AsyncCtx19 = _emscripten_alloc_async_context(8, sp) | 0; //@line 986
  _wait_ms(400); //@line 987
  if (___async) {
   label = 23; //@line 990
   break;
  }
  _emscripten_free_async_context($AsyncCtx19 | 0); //@line 993
  _emscripten_asm_const_iii(2, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 995
  $AsyncCtx15 = _emscripten_alloc_async_context(8, sp) | 0; //@line 996
  _wait_ms(400); //@line 997
  if (___async) {
   label = 25; //@line 1000
   break;
  }
  _emscripten_free_async_context($AsyncCtx15 | 0); //@line 1003
  _emscripten_asm_const_iii(2, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 1005
  $AsyncCtx11 = _emscripten_alloc_async_context(8, sp) | 0; //@line 1006
  _wait_ms(400); //@line 1007
  if (___async) {
   label = 27; //@line 1010
   break;
  }
  _emscripten_free_async_context($AsyncCtx11 | 0); //@line 1013
  _emscripten_asm_const_iii(2, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 1015
  $AsyncCtx7 = _emscripten_alloc_async_context(8, sp) | 0; //@line 1016
  _wait_ms(400); //@line 1017
  if (___async) {
   label = 29; //@line 1020
   break;
  }
  _emscripten_free_async_context($AsyncCtx7 | 0); //@line 1023
  _emscripten_asm_const_iii(2, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 1025
  $AsyncCtx3 = _emscripten_alloc_async_context(8, sp) | 0; //@line 1026
  _wait_ms(400); //@line 1027
  if (___async) {
   label = 31; //@line 1030
   break;
  }
  _emscripten_free_async_context($AsyncCtx3 | 0); //@line 1033
  _emscripten_asm_const_iii(2, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 1035
  $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 1036
  _wait_ms(400); //@line 1037
  if (___async) {
   label = 33; //@line 1040
   break;
  }
  _emscripten_free_async_context($AsyncCtx | 0); //@line 1043
 }
 switch (label | 0) {
 case 3:
  {
   HEAP32[$AsyncCtx59 >> 2] = 22; //@line 1047
   HEAP32[$AsyncCtx59 + 4 >> 2] = $0; //@line 1049
   sp = STACKTOP; //@line 1050
   STACKTOP = sp; //@line 1051
   return;
  }
 case 5:
  {
   HEAP32[$AsyncCtx55 >> 2] = 23; //@line 1055
   HEAP32[$AsyncCtx55 + 4 >> 2] = $0; //@line 1057
   sp = STACKTOP; //@line 1058
   STACKTOP = sp; //@line 1059
   return;
  }
 case 7:
  {
   HEAP32[$AsyncCtx51 >> 2] = 24; //@line 1063
   HEAP32[$AsyncCtx51 + 4 >> 2] = $0; //@line 1065
   sp = STACKTOP; //@line 1066
   STACKTOP = sp; //@line 1067
   return;
  }
 case 9:
  {
   HEAP32[$AsyncCtx47 >> 2] = 25; //@line 1071
   HEAP32[$AsyncCtx47 + 4 >> 2] = $0; //@line 1073
   sp = STACKTOP; //@line 1074
   STACKTOP = sp; //@line 1075
   return;
  }
 case 11:
  {
   HEAP32[$AsyncCtx43 >> 2] = 26; //@line 1079
   HEAP32[$AsyncCtx43 + 4 >> 2] = $0; //@line 1081
   sp = STACKTOP; //@line 1082
   STACKTOP = sp; //@line 1083
   return;
  }
 case 13:
  {
   HEAP32[$AsyncCtx39 >> 2] = 27; //@line 1087
   HEAP32[$AsyncCtx39 + 4 >> 2] = $0; //@line 1089
   sp = STACKTOP; //@line 1090
   STACKTOP = sp; //@line 1091
   return;
  }
 case 15:
  {
   HEAP32[$AsyncCtx35 >> 2] = 28; //@line 1095
   HEAP32[$AsyncCtx35 + 4 >> 2] = $0; //@line 1097
   sp = STACKTOP; //@line 1098
   STACKTOP = sp; //@line 1099
   return;
  }
 case 17:
  {
   HEAP32[$AsyncCtx31 >> 2] = 29; //@line 1103
   HEAP32[$AsyncCtx31 + 4 >> 2] = $0; //@line 1105
   sp = STACKTOP; //@line 1106
   STACKTOP = sp; //@line 1107
   return;
  }
 case 19:
  {
   HEAP32[$AsyncCtx27 >> 2] = 30; //@line 1111
   HEAP32[$AsyncCtx27 + 4 >> 2] = $0; //@line 1113
   sp = STACKTOP; //@line 1114
   STACKTOP = sp; //@line 1115
   return;
  }
 case 21:
  {
   HEAP32[$AsyncCtx23 >> 2] = 31; //@line 1119
   HEAP32[$AsyncCtx23 + 4 >> 2] = $0; //@line 1121
   sp = STACKTOP; //@line 1122
   STACKTOP = sp; //@line 1123
   return;
  }
 case 23:
  {
   HEAP32[$AsyncCtx19 >> 2] = 32; //@line 1127
   HEAP32[$AsyncCtx19 + 4 >> 2] = $0; //@line 1129
   sp = STACKTOP; //@line 1130
   STACKTOP = sp; //@line 1131
   return;
  }
 case 25:
  {
   HEAP32[$AsyncCtx15 >> 2] = 33; //@line 1135
   HEAP32[$AsyncCtx15 + 4 >> 2] = $0; //@line 1137
   sp = STACKTOP; //@line 1138
   STACKTOP = sp; //@line 1139
   return;
  }
 case 27:
  {
   HEAP32[$AsyncCtx11 >> 2] = 34; //@line 1143
   HEAP32[$AsyncCtx11 + 4 >> 2] = $0; //@line 1145
   sp = STACKTOP; //@line 1146
   STACKTOP = sp; //@line 1147
   return;
  }
 case 29:
  {
   HEAP32[$AsyncCtx7 >> 2] = 35; //@line 1151
   HEAP32[$AsyncCtx7 + 4 >> 2] = $0; //@line 1153
   sp = STACKTOP; //@line 1154
   STACKTOP = sp; //@line 1155
   return;
  }
 case 31:
  {
   HEAP32[$AsyncCtx3 >> 2] = 36; //@line 1159
   HEAP32[$AsyncCtx3 + 4 >> 2] = $0; //@line 1161
   sp = STACKTOP; //@line 1162
   STACKTOP = sp; //@line 1163
   return;
  }
 case 33:
  {
   HEAP32[$AsyncCtx >> 2] = 37; //@line 1167
   HEAP32[$AsyncCtx + 4 >> 2] = $0; //@line 1169
   sp = STACKTOP; //@line 1170
   STACKTOP = sp; //@line 1171
   return;
  }
 }
}
function _mbed_vtracef__async_cb_5($0) {
 $0 = $0 | 0;
 var $$10 = 0, $$3147168 = 0, $$3169 = 0, $$5156 = 0, $$5156$ = 0, $$expand_i1_val = 0, $12 = 0, $16 = 0, $18 = 0, $2 = 0, $20 = 0, $22 = 0, $24 = 0, $26 = 0, $30 = 0, $34 = 0, $38 = 0, $4 = 0, $40 = 0, $42 = 0, $44 = 0, $50 = 0, $53 = 0, $54 = 0, $56 = 0, $6 = 0, $67 = 0, $68 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $79 = 0, $8 = 0, $80 = 0, $ReallocAsyncCtx10 = 0, $ReallocAsyncCtx7 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 10955
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 10957
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 10959
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 10961
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 10963
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 10967
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 10971
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 10973
 $20 = HEAP32[$0 + 40 >> 2] | 0; //@line 10975
 $22 = HEAP32[$0 + 44 >> 2] | 0; //@line 10977
 $24 = HEAP32[$0 + 48 >> 2] | 0; //@line 10979
 $26 = HEAP32[$0 + 52 >> 2] | 0; //@line 10981
 $30 = HEAP32[$0 + 60 >> 2] | 0; //@line 10985
 $34 = HEAP32[$0 + 68 >> 2] | 0; //@line 10989
 $38 = HEAP32[$0 + 76 >> 2] | 0; //@line 10993
 $40 = HEAP32[$0 + 80 >> 2] | 0; //@line 10995
 $42 = HEAP8[$0 + 84 >> 0] & 1; //@line 10998
 $44 = HEAP32[$0 + 88 >> 2] | 0; //@line 11000
 HEAP32[$44 >> 2] = HEAP32[___async_retval >> 2]; //@line 11007
 $50 = _snprintf($20, $22, 1025, $44) | 0; //@line 11008
 $$10 = ($50 | 0) >= ($22 | 0) ? 0 : $50; //@line 11010
 $53 = $20 + $$10 | 0; //@line 11012
 $54 = $22 - $$10 | 0; //@line 11013
 if (($$10 | 0) > 0) {
  if (($54 | 0) > 0) {
   $$3147168 = $54; //@line 11017
   $$3169 = $53; //@line 11017
   label = 4; //@line 11018
  }
 } else {
  $$3147168 = $22; //@line 11021
  $$3169 = $20; //@line 11021
  label = 4; //@line 11022
 }
 if ((label | 0) == 4) {
  $56 = $24 + -2 | 0; //@line 11025
  switch ($56 >>> 1 | $56 << 31 | 0) {
  case 0:
   {
    HEAP32[$26 >> 2] = $8; //@line 11031
    $$5156 = _snprintf($$3169, $$3147168, 1028, $26) | 0; //@line 11033
    break;
   }
  case 1:
   {
    HEAP32[$30 >> 2] = $8; //@line 11037
    $$5156 = _snprintf($$3169, $$3147168, 1043, $30) | 0; //@line 11039
    break;
   }
  case 3:
   {
    HEAP32[$34 >> 2] = $8; //@line 11043
    $$5156 = _snprintf($$3169, $$3147168, 1058, $34) | 0; //@line 11045
    break;
   }
  case 7:
   {
    HEAP32[$6 >> 2] = $8; //@line 11049
    $$5156 = _snprintf($$3169, $$3147168, 1073, $6) | 0; //@line 11051
    break;
   }
  default:
   {
    $$5156 = _snprintf($$3169, $$3147168, 1088, $12) | 0; //@line 11056
   }
  }
  $$5156$ = ($$5156 | 0) < ($$3147168 | 0) ? $$5156 : 0; //@line 11060
  $67 = $$3169 + $$5156$ | 0; //@line 11062
  $68 = $$3147168 - $$5156$ | 0; //@line 11063
  if (($$5156$ | 0) > 0 & ($68 | 0) > 0) {
   $ReallocAsyncCtx10 = _emscripten_realloc_async_context(32) | 0; //@line 11067
   $70 = _vsnprintf($67, $68, $16, $18) | 0; //@line 11068
   if (___async) {
    HEAP32[$ReallocAsyncCtx10 >> 2] = 16; //@line 11071
    $71 = $ReallocAsyncCtx10 + 4 | 0; //@line 11072
    HEAP32[$71 >> 2] = $2; //@line 11073
    $72 = $ReallocAsyncCtx10 + 8 | 0; //@line 11074
    HEAP32[$72 >> 2] = $4; //@line 11075
    $73 = $ReallocAsyncCtx10 + 12 | 0; //@line 11076
    HEAP32[$73 >> 2] = $38; //@line 11077
    $74 = $ReallocAsyncCtx10 + 16 | 0; //@line 11078
    HEAP32[$74 >> 2] = $40; //@line 11079
    $75 = $ReallocAsyncCtx10 + 20 | 0; //@line 11080
    $$expand_i1_val = $42 & 1; //@line 11081
    HEAP8[$75 >> 0] = $$expand_i1_val; //@line 11082
    $76 = $ReallocAsyncCtx10 + 24 | 0; //@line 11083
    HEAP32[$76 >> 2] = $68; //@line 11084
    $77 = $ReallocAsyncCtx10 + 28 | 0; //@line 11085
    HEAP32[$77 >> 2] = $67; //@line 11086
    sp = STACKTOP; //@line 11087
    return;
   }
   HEAP32[___async_retval >> 2] = $70; //@line 11091
   ___async_unwind = 0; //@line 11092
   HEAP32[$ReallocAsyncCtx10 >> 2] = 16; //@line 11093
   $71 = $ReallocAsyncCtx10 + 4 | 0; //@line 11094
   HEAP32[$71 >> 2] = $2; //@line 11095
   $72 = $ReallocAsyncCtx10 + 8 | 0; //@line 11096
   HEAP32[$72 >> 2] = $4; //@line 11097
   $73 = $ReallocAsyncCtx10 + 12 | 0; //@line 11098
   HEAP32[$73 >> 2] = $38; //@line 11099
   $74 = $ReallocAsyncCtx10 + 16 | 0; //@line 11100
   HEAP32[$74 >> 2] = $40; //@line 11101
   $75 = $ReallocAsyncCtx10 + 20 | 0; //@line 11102
   $$expand_i1_val = $42 & 1; //@line 11103
   HEAP8[$75 >> 0] = $$expand_i1_val; //@line 11104
   $76 = $ReallocAsyncCtx10 + 24 | 0; //@line 11105
   HEAP32[$76 >> 2] = $68; //@line 11106
   $77 = $ReallocAsyncCtx10 + 28 | 0; //@line 11107
   HEAP32[$77 >> 2] = $67; //@line 11108
   sp = STACKTOP; //@line 11109
   return;
  }
 }
 $79 = HEAP32[35] | 0; //@line 11113
 $80 = HEAP32[28] | 0; //@line 11114
 $ReallocAsyncCtx7 = _emscripten_realloc_async_context(4) | 0; //@line 11115
 FUNCTION_TABLE_vi[$79 & 127]($80); //@line 11116
 if (___async) {
  HEAP32[$ReallocAsyncCtx7 >> 2] = 18; //@line 11119
  sp = STACKTOP; //@line 11120
  return;
 }
 ___async_unwind = 0; //@line 11123
 HEAP32[$ReallocAsyncCtx7 >> 2] = 18; //@line 11124
 sp = STACKTOP; //@line 11125
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
      $9 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 7068
      $10 = HEAP32[$9 >> 2] | 0; //@line 7069
      HEAP32[$2 >> 2] = $9 + 4; //@line 7071
      HEAP32[$0 >> 2] = $10; //@line 7072
      break L1;
      break;
     }
    case 10:
     {
      $16 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 7088
      $17 = HEAP32[$16 >> 2] | 0; //@line 7089
      HEAP32[$2 >> 2] = $16 + 4; //@line 7091
      $20 = $0; //@line 7094
      HEAP32[$20 >> 2] = $17; //@line 7096
      HEAP32[$20 + 4 >> 2] = (($17 | 0) < 0) << 31 >> 31; //@line 7099
      break L1;
      break;
     }
    case 11:
     {
      $29 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 7115
      $30 = HEAP32[$29 >> 2] | 0; //@line 7116
      HEAP32[$2 >> 2] = $29 + 4; //@line 7118
      $31 = $0; //@line 7119
      HEAP32[$31 >> 2] = $30; //@line 7121
      HEAP32[$31 + 4 >> 2] = 0; //@line 7124
      break L1;
      break;
     }
    case 12:
     {
      $40 = (HEAP32[$2 >> 2] | 0) + (8 - 1) & ~(8 - 1); //@line 7140
      $41 = $40; //@line 7141
      $43 = HEAP32[$41 >> 2] | 0; //@line 7143
      $46 = HEAP32[$41 + 4 >> 2] | 0; //@line 7146
      HEAP32[$2 >> 2] = $40 + 8; //@line 7148
      $47 = $0; //@line 7149
      HEAP32[$47 >> 2] = $43; //@line 7151
      HEAP32[$47 + 4 >> 2] = $46; //@line 7154
      break L1;
      break;
     }
    case 13:
     {
      $56 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 7170
      $57 = HEAP32[$56 >> 2] | 0; //@line 7171
      HEAP32[$2 >> 2] = $56 + 4; //@line 7173
      $59 = ($57 & 65535) << 16 >> 16; //@line 7175
      $62 = $0; //@line 7178
      HEAP32[$62 >> 2] = $59; //@line 7180
      HEAP32[$62 + 4 >> 2] = (($59 | 0) < 0) << 31 >> 31; //@line 7183
      break L1;
      break;
     }
    case 14:
     {
      $71 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 7199
      $72 = HEAP32[$71 >> 2] | 0; //@line 7200
      HEAP32[$2 >> 2] = $71 + 4; //@line 7202
      $73 = $0; //@line 7204
      HEAP32[$73 >> 2] = $72 & 65535; //@line 7206
      HEAP32[$73 + 4 >> 2] = 0; //@line 7209
      break L1;
      break;
     }
    case 15:
     {
      $82 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 7225
      $83 = HEAP32[$82 >> 2] | 0; //@line 7226
      HEAP32[$2 >> 2] = $82 + 4; //@line 7228
      $85 = ($83 & 255) << 24 >> 24; //@line 7230
      $88 = $0; //@line 7233
      HEAP32[$88 >> 2] = $85; //@line 7235
      HEAP32[$88 + 4 >> 2] = (($85 | 0) < 0) << 31 >> 31; //@line 7238
      break L1;
      break;
     }
    case 16:
     {
      $97 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 7254
      $98 = HEAP32[$97 >> 2] | 0; //@line 7255
      HEAP32[$2 >> 2] = $97 + 4; //@line 7257
      $99 = $0; //@line 7259
      HEAP32[$99 >> 2] = $98 & 255; //@line 7261
      HEAP32[$99 + 4 >> 2] = 0; //@line 7264
      break L1;
      break;
     }
    case 17:
     {
      $108 = (HEAP32[$2 >> 2] | 0) + (8 - 1) & ~(8 - 1); //@line 7280
      $109 = +HEAPF64[$108 >> 3]; //@line 7281
      HEAP32[$2 >> 2] = $108 + 8; //@line 7283
      HEAPF64[$0 >> 3] = $109; //@line 7284
      break L1;
      break;
     }
    case 18:
     {
      $115 = (HEAP32[$2 >> 2] | 0) + (8 - 1) & ~(8 - 1); //@line 7300
      $116 = +HEAPF64[$115 >> 3]; //@line 7301
      HEAP32[$2 >> 2] = $115 + 8; //@line 7303
      HEAPF64[$0 >> 3] = $116; //@line 7304
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
function _vfprintf($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$ = 0, $$0 = 0, $$1 = 0, $13 = 0, $14 = 0, $19 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $28 = 0, $29 = 0, $3 = 0, $32 = 0, $4 = 0, $43 = 0, $5 = 0, $51 = 0, $6 = 0, $AsyncCtx = 0, dest = 0, sp = 0, stop = 0;
 sp = STACKTOP; //@line 5968
 STACKTOP = STACKTOP + 224 | 0; //@line 5969
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(224); //@line 5969
 $3 = sp + 120 | 0; //@line 5970
 $4 = sp + 80 | 0; //@line 5971
 $5 = sp; //@line 5972
 $6 = sp + 136 | 0; //@line 5973
 dest = $4; //@line 5974
 stop = dest + 40 | 0; //@line 5974
 do {
  HEAP32[dest >> 2] = 0; //@line 5974
  dest = dest + 4 | 0; //@line 5974
 } while ((dest | 0) < (stop | 0));
 HEAP32[$3 >> 2] = HEAP32[$2 >> 2]; //@line 5976
 if ((_printf_core(0, $1, $3, $5, $4) | 0) < 0) {
  $$0 = -1; //@line 5980
 } else {
  if ((HEAP32[$0 + 76 >> 2] | 0) > -1) {
   $43 = ___lockfile($0) | 0; //@line 5987
  } else {
   $43 = 0; //@line 5989
  }
  $13 = HEAP32[$0 >> 2] | 0; //@line 5991
  $14 = $13 & 32; //@line 5992
  if ((HEAP8[$0 + 74 >> 0] | 0) < 1) {
   HEAP32[$0 >> 2] = $13 & -33; //@line 5998
  }
  $19 = $0 + 48 | 0; //@line 6000
  do {
   if (!(HEAP32[$19 >> 2] | 0)) {
    $23 = $0 + 44 | 0; //@line 6005
    $24 = HEAP32[$23 >> 2] | 0; //@line 6006
    HEAP32[$23 >> 2] = $6; //@line 6007
    $25 = $0 + 28 | 0; //@line 6008
    HEAP32[$25 >> 2] = $6; //@line 6009
    $26 = $0 + 20 | 0; //@line 6010
    HEAP32[$26 >> 2] = $6; //@line 6011
    HEAP32[$19 >> 2] = 80; //@line 6012
    $28 = $0 + 16 | 0; //@line 6014
    HEAP32[$28 >> 2] = $6 + 80; //@line 6015
    $29 = _printf_core($0, $1, $3, $5, $4) | 0; //@line 6016
    if (!$24) {
     $$1 = $29; //@line 6019
    } else {
     $32 = HEAP32[$0 + 36 >> 2] | 0; //@line 6022
     $AsyncCtx = _emscripten_alloc_async_context(64, sp) | 0; //@line 6023
     FUNCTION_TABLE_iiii[$32 & 7]($0, 0, 0) | 0; //@line 6024
     if (___async) {
      HEAP32[$AsyncCtx >> 2] = 57; //@line 6027
      HEAP32[$AsyncCtx + 4 >> 2] = $26; //@line 6029
      HEAP32[$AsyncCtx + 8 >> 2] = $29; //@line 6031
      HEAP32[$AsyncCtx + 12 >> 2] = $24; //@line 6033
      HEAP32[$AsyncCtx + 16 >> 2] = $23; //@line 6035
      HEAP32[$AsyncCtx + 20 >> 2] = $19; //@line 6037
      HEAP32[$AsyncCtx + 24 >> 2] = $28; //@line 6039
      HEAP32[$AsyncCtx + 28 >> 2] = $25; //@line 6041
      HEAP32[$AsyncCtx + 32 >> 2] = $0; //@line 6043
      HEAP32[$AsyncCtx + 36 >> 2] = $14; //@line 6045
      HEAP32[$AsyncCtx + 40 >> 2] = $43; //@line 6047
      HEAP32[$AsyncCtx + 44 >> 2] = $0; //@line 6049
      HEAP32[$AsyncCtx + 48 >> 2] = $6; //@line 6051
      HEAP32[$AsyncCtx + 52 >> 2] = $5; //@line 6053
      HEAP32[$AsyncCtx + 56 >> 2] = $4; //@line 6055
      HEAP32[$AsyncCtx + 60 >> 2] = $3; //@line 6057
      sp = STACKTOP; //@line 6058
      STACKTOP = sp; //@line 6059
      return 0; //@line 6059
     } else {
      _emscripten_free_async_context($AsyncCtx | 0); //@line 6061
      $$ = (HEAP32[$26 >> 2] | 0) == 0 ? -1 : $29; //@line 6064
      HEAP32[$23 >> 2] = $24; //@line 6065
      HEAP32[$19 >> 2] = 0; //@line 6066
      HEAP32[$28 >> 2] = 0; //@line 6067
      HEAP32[$25 >> 2] = 0; //@line 6068
      HEAP32[$26 >> 2] = 0; //@line 6069
      $$1 = $$; //@line 6070
      break;
     }
    }
   } else {
    $$1 = _printf_core($0, $1, $3, $5, $4) | 0; //@line 6076
   }
  } while (0);
  $51 = HEAP32[$0 >> 2] | 0; //@line 6079
  HEAP32[$0 >> 2] = $51 | $14; //@line 6084
  if ($43 | 0) {
   ___unlockfile($0); //@line 6087
  }
  $$0 = ($51 & 32 | 0) == 0 ? $$1 : -1; //@line 6089
 }
 STACKTOP = sp; //@line 6091
 return $$0 | 0; //@line 6091
}
function ___dynamic_cast($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $$0 = 0, $10 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $24 = 0, $30 = 0, $33 = 0, $4 = 0, $5 = 0, $8 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, dest = 0, sp = 0, stop = 0;
 sp = STACKTOP; //@line 9907
 STACKTOP = STACKTOP + 64 | 0; //@line 9908
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(64); //@line 9908
 $4 = sp; //@line 9909
 $5 = HEAP32[$0 >> 2] | 0; //@line 9910
 $8 = $0 + (HEAP32[$5 + -8 >> 2] | 0) | 0; //@line 9913
 $10 = HEAP32[$5 + -4 >> 2] | 0; //@line 9915
 HEAP32[$4 >> 2] = $2; //@line 9916
 HEAP32[$4 + 4 >> 2] = $0; //@line 9918
 HEAP32[$4 + 8 >> 2] = $1; //@line 9920
 HEAP32[$4 + 12 >> 2] = $3; //@line 9922
 $14 = $4 + 16 | 0; //@line 9923
 $15 = $4 + 20 | 0; //@line 9924
 $16 = $4 + 24 | 0; //@line 9925
 $17 = $4 + 28 | 0; //@line 9926
 $18 = $4 + 32 | 0; //@line 9927
 $19 = $4 + 40 | 0; //@line 9928
 dest = $14; //@line 9929
 stop = dest + 36 | 0; //@line 9929
 do {
  HEAP32[dest >> 2] = 0; //@line 9929
  dest = dest + 4 | 0; //@line 9929
 } while ((dest | 0) < (stop | 0));
 HEAP16[$14 + 36 >> 1] = 0; //@line 9929
 HEAP8[$14 + 38 >> 0] = 0; //@line 9929
 L1 : do {
  if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($10, $2, 0) | 0) {
   HEAP32[$4 + 48 >> 2] = 1; //@line 9934
   $24 = HEAP32[(HEAP32[$10 >> 2] | 0) + 20 >> 2] | 0; //@line 9937
   $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 9938
   FUNCTION_TABLE_viiiiii[$24 & 3]($10, $4, $8, $8, 1, 0); //@line 9939
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 64; //@line 9942
    HEAP32[$AsyncCtx + 4 >> 2] = $16; //@line 9944
    HEAP32[$AsyncCtx + 8 >> 2] = $8; //@line 9946
    HEAP32[$AsyncCtx + 12 >> 2] = $4; //@line 9948
    sp = STACKTOP; //@line 9949
    STACKTOP = sp; //@line 9950
    return 0; //@line 9950
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 9952
    $$0 = (HEAP32[$16 >> 2] | 0) == 1 ? $8 : 0; //@line 9956
    break;
   }
  } else {
   $30 = $4 + 36 | 0; //@line 9960
   $33 = HEAP32[(HEAP32[$10 >> 2] | 0) + 24 >> 2] | 0; //@line 9963
   $AsyncCtx3 = _emscripten_alloc_async_context(36, sp) | 0; //@line 9964
   FUNCTION_TABLE_viiiii[$33 & 3]($10, $4, $8, 1, 0); //@line 9965
   if (___async) {
    HEAP32[$AsyncCtx3 >> 2] = 65; //@line 9968
    HEAP32[$AsyncCtx3 + 4 >> 2] = $30; //@line 9970
    HEAP32[$AsyncCtx3 + 8 >> 2] = $4; //@line 9972
    HEAP32[$AsyncCtx3 + 12 >> 2] = $19; //@line 9974
    HEAP32[$AsyncCtx3 + 16 >> 2] = $17; //@line 9976
    HEAP32[$AsyncCtx3 + 20 >> 2] = $18; //@line 9978
    HEAP32[$AsyncCtx3 + 24 >> 2] = $15; //@line 9980
    HEAP32[$AsyncCtx3 + 28 >> 2] = $16; //@line 9982
    HEAP32[$AsyncCtx3 + 32 >> 2] = $14; //@line 9984
    sp = STACKTOP; //@line 9985
    STACKTOP = sp; //@line 9986
    return 0; //@line 9986
   }
   _emscripten_free_async_context($AsyncCtx3 | 0); //@line 9988
   switch (HEAP32[$30 >> 2] | 0) {
   case 0:
    {
     $$0 = (HEAP32[$19 >> 2] | 0) == 1 & (HEAP32[$17 >> 2] | 0) == 1 & (HEAP32[$18 >> 2] | 0) == 1 ? HEAP32[$15 >> 2] | 0 : 0; //@line 10002
     break L1;
     break;
    }
   case 1:
    {
     break;
    }
   default:
    {
     $$0 = 0; //@line 10010
     break L1;
    }
   }
   if ((HEAP32[$16 >> 2] | 0) != 1) {
    if (!((HEAP32[$19 >> 2] | 0) == 0 & (HEAP32[$17 >> 2] | 0) == 1 & (HEAP32[$18 >> 2] | 0) == 1)) {
     $$0 = 0; //@line 10026
     break;
    }
   }
   $$0 = HEAP32[$14 >> 2] | 0; //@line 10031
  }
 } while (0);
 STACKTOP = sp; //@line 10034
 return $$0 | 0; //@line 10034
}
function _memchr($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$0$lcssa = 0, $$035$lcssa = 0, $$035$lcssa65 = 0, $$03555 = 0, $$036$lcssa = 0, $$036$lcssa64 = 0, $$03654 = 0, $$046 = 0, $$137$lcssa = 0, $$13745 = 0, $$140 = 0, $$2 = 0, $$23839 = 0, $$3 = 0, $$lcssa = 0, $11 = 0, $12 = 0, $16 = 0, $18 = 0, $20 = 0, $23 = 0, $29 = 0, $3 = 0, $30 = 0, $35 = 0, $7 = 0, $8 = 0, label = 0;
 $3 = $1 & 255; //@line 5840
 $7 = ($2 | 0) != 0; //@line 5844
 L1 : do {
  if ($7 & ($0 & 3 | 0) != 0) {
   $8 = $1 & 255; //@line 5848
   $$03555 = $0; //@line 5849
   $$03654 = $2; //@line 5849
   while (1) {
    if ((HEAP8[$$03555 >> 0] | 0) == $8 << 24 >> 24) {
     $$035$lcssa65 = $$03555; //@line 5854
     $$036$lcssa64 = $$03654; //@line 5854
     label = 6; //@line 5855
     break L1;
    }
    $11 = $$03555 + 1 | 0; //@line 5858
    $12 = $$03654 + -1 | 0; //@line 5859
    $16 = ($12 | 0) != 0; //@line 5863
    if ($16 & ($11 & 3 | 0) != 0) {
     $$03555 = $11; //@line 5866
     $$03654 = $12; //@line 5866
    } else {
     $$035$lcssa = $11; //@line 5868
     $$036$lcssa = $12; //@line 5868
     $$lcssa = $16; //@line 5868
     label = 5; //@line 5869
     break;
    }
   }
  } else {
   $$035$lcssa = $0; //@line 5874
   $$036$lcssa = $2; //@line 5874
   $$lcssa = $7; //@line 5874
   label = 5; //@line 5875
  }
 } while (0);
 if ((label | 0) == 5) {
  if ($$lcssa) {
   $$035$lcssa65 = $$035$lcssa; //@line 5880
   $$036$lcssa64 = $$036$lcssa; //@line 5880
   label = 6; //@line 5881
  } else {
   $$2 = $$035$lcssa; //@line 5883
   $$3 = 0; //@line 5883
  }
 }
 L8 : do {
  if ((label | 0) == 6) {
   $18 = $1 & 255; //@line 5889
   if ((HEAP8[$$035$lcssa65 >> 0] | 0) == $18 << 24 >> 24) {
    $$2 = $$035$lcssa65; //@line 5892
    $$3 = $$036$lcssa64; //@line 5892
   } else {
    $20 = Math_imul($3, 16843009) | 0; //@line 5894
    L11 : do {
     if ($$036$lcssa64 >>> 0 > 3) {
      $$046 = $$035$lcssa65; //@line 5898
      $$13745 = $$036$lcssa64; //@line 5898
      while (1) {
       $23 = HEAP32[$$046 >> 2] ^ $20; //@line 5901
       if (($23 & -2139062144 ^ -2139062144) & $23 + -16843009 | 0) {
        break;
       }
       $29 = $$046 + 4 | 0; //@line 5910
       $30 = $$13745 + -4 | 0; //@line 5911
       if ($30 >>> 0 > 3) {
        $$046 = $29; //@line 5914
        $$13745 = $30; //@line 5914
       } else {
        $$0$lcssa = $29; //@line 5916
        $$137$lcssa = $30; //@line 5916
        label = 11; //@line 5917
        break L11;
       }
      }
      $$140 = $$046; //@line 5921
      $$23839 = $$13745; //@line 5921
     } else {
      $$0$lcssa = $$035$lcssa65; //@line 5923
      $$137$lcssa = $$036$lcssa64; //@line 5923
      label = 11; //@line 5924
     }
    } while (0);
    if ((label | 0) == 11) {
     if (!$$137$lcssa) {
      $$2 = $$0$lcssa; //@line 5930
      $$3 = 0; //@line 5930
      break;
     } else {
      $$140 = $$0$lcssa; //@line 5933
      $$23839 = $$137$lcssa; //@line 5933
     }
    }
    while (1) {
     if ((HEAP8[$$140 >> 0] | 0) == $18 << 24 >> 24) {
      $$2 = $$140; //@line 5940
      $$3 = $$23839; //@line 5940
      break L8;
     }
     $35 = $$140 + 1 | 0; //@line 5943
     $$23839 = $$23839 + -1 | 0; //@line 5944
     if (!$$23839) {
      $$2 = $35; //@line 5947
      $$3 = 0; //@line 5947
      break;
     } else {
      $$140 = $35; //@line 5950
     }
    }
   }
  }
 } while (0);
 return ($$3 | 0 ? $$2 : 0) | 0; //@line 5958
}
function _fflush($0) {
 $0 = $0 | 0;
 var $$0 = 0, $$023 = 0, $$02325 = 0, $$02327 = 0, $$024$lcssa = 0, $$02426 = 0, $$1 = 0, $12 = 0, $13 = 0, $25 = 0, $28 = 0, $34 = 0, $5 = 0, $7 = 0, $AsyncCtx = 0, $AsyncCtx10 = 0, $AsyncCtx3 = 0, $AsyncCtx6 = 0, $phitmp = 0, sp = 0;
 sp = STACKTOP; //@line 5611
 do {
  if (!$0) {
   do {
    if (!(HEAP32[72] | 0)) {
     $34 = 0; //@line 5619
    } else {
     $12 = HEAP32[72] | 0; //@line 5621
     $AsyncCtx10 = _emscripten_alloc_async_context(4, sp) | 0; //@line 5622
     $13 = _fflush($12) | 0; //@line 5623
     if (___async) {
      HEAP32[$AsyncCtx10 >> 2] = 53; //@line 5626
      sp = STACKTOP; //@line 5627
      return 0; //@line 5628
     } else {
      _emscripten_free_async_context($AsyncCtx10 | 0); //@line 5630
      $34 = $13; //@line 5631
      break;
     }
    }
   } while (0);
   $$02325 = HEAP32[(___ofl_lock() | 0) >> 2] | 0; //@line 5637
   L9 : do {
    if (!$$02325) {
     $$024$lcssa = $34; //@line 5641
    } else {
     $$02327 = $$02325; //@line 5643
     $$02426 = $34; //@line 5643
     while (1) {
      if ((HEAP32[$$02327 + 76 >> 2] | 0) > -1) {
       $28 = ___lockfile($$02327) | 0; //@line 5650
      } else {
       $28 = 0; //@line 5652
      }
      if ((HEAP32[$$02327 + 20 >> 2] | 0) >>> 0 > (HEAP32[$$02327 + 28 >> 2] | 0) >>> 0) {
       $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 5660
       $25 = ___fflush_unlocked($$02327) | 0; //@line 5661
       if (___async) {
        break;
       }
       _emscripten_free_async_context($AsyncCtx | 0); //@line 5666
       $$1 = $25 | $$02426; //@line 5668
      } else {
       $$1 = $$02426; //@line 5670
      }
      if ($28 | 0) {
       ___unlockfile($$02327); //@line 5674
      }
      $$023 = HEAP32[$$02327 + 56 >> 2] | 0; //@line 5677
      if (!$$023) {
       $$024$lcssa = $$1; //@line 5680
       break L9;
      } else {
       $$02327 = $$023; //@line 5683
       $$02426 = $$1; //@line 5683
      }
     }
     HEAP32[$AsyncCtx >> 2] = 54; //@line 5686
     HEAP32[$AsyncCtx + 4 >> 2] = $$02426; //@line 5688
     HEAP32[$AsyncCtx + 8 >> 2] = $28; //@line 5690
     HEAP32[$AsyncCtx + 12 >> 2] = $$02327; //@line 5692
     sp = STACKTOP; //@line 5693
     return 0; //@line 5694
    }
   } while (0);
   ___ofl_unlock(); //@line 5697
   $$0 = $$024$lcssa; //@line 5698
  } else {
   if ((HEAP32[$0 + 76 >> 2] | 0) <= -1) {
    $AsyncCtx6 = _emscripten_alloc_async_context(4, sp) | 0; //@line 5704
    $5 = ___fflush_unlocked($0) | 0; //@line 5705
    if (___async) {
     HEAP32[$AsyncCtx6 >> 2] = 51; //@line 5708
     sp = STACKTOP; //@line 5709
     return 0; //@line 5710
    } else {
     _emscripten_free_async_context($AsyncCtx6 | 0); //@line 5712
     $$0 = $5; //@line 5713
     break;
    }
   }
   $phitmp = (___lockfile($0) | 0) == 0; //@line 5718
   $AsyncCtx3 = _emscripten_alloc_async_context(12, sp) | 0; //@line 5719
   $7 = ___fflush_unlocked($0) | 0; //@line 5720
   if (___async) {
    HEAP32[$AsyncCtx3 >> 2] = 52; //@line 5723
    HEAP8[$AsyncCtx3 + 4 >> 0] = $phitmp & 1; //@line 5726
    HEAP32[$AsyncCtx3 + 8 >> 2] = $0; //@line 5728
    sp = STACKTOP; //@line 5729
    return 0; //@line 5730
   }
   _emscripten_free_async_context($AsyncCtx3 | 0); //@line 5732
   if ($phitmp) {
    $$0 = $7; //@line 5734
   } else {
    ___unlockfile($0); //@line 5736
    $$0 = $7; //@line 5737
   }
  }
 } while (0);
 return $$0 | 0; //@line 5741
}
function _mbed_vtracef__async_cb_10($0) {
 $0 = $0 | 0;
 var $$13 = 0, $$expand_i1_val = 0, $10 = 0, $12 = 0, $18 = 0, $19 = 0, $2 = 0, $21 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $30 = 0, $34 = 0, $35 = 0, $4 = 0, $6 = 0, $8 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx6 = 0, $ReallocAsyncCtx7 = 0, sp = 0;
 sp = STACKTOP; //@line 11285
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 11287
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 11289
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 11291
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 11293
 $10 = HEAP8[$0 + 20 >> 0] & 1; //@line 11296
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 11298
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 11302
 $$13 = ($AsyncRetVal | 0) >= ($12 | 0) ? 0 : $AsyncRetVal; //@line 11304
 $18 = (HEAP32[$0 + 28 >> 2] | 0) + $$13 | 0; //@line 11306
 $19 = $12 - $$13 | 0; //@line 11307
 do {
  if (($$13 | 0) > 0) {
   $21 = HEAP32[34] | 0; //@line 11311
   if (!(($19 | 0) > 0 & ($21 | 0) != 0)) {
    if (($$13 | 0) < 1 | ($19 | 0) < 1 | $10 ^ 1) {
     break;
    }
    _snprintf($18, $19, 1103, $6) | 0; //@line 11323
    break;
   }
   $ReallocAsyncCtx6 = _emscripten_realloc_async_context(32) | 0; //@line 11326
   $23 = FUNCTION_TABLE_i[$21 & 0]() | 0; //@line 11327
   if (___async) {
    HEAP32[$ReallocAsyncCtx6 >> 2] = 17; //@line 11330
    $24 = $ReallocAsyncCtx6 + 4 | 0; //@line 11331
    HEAP32[$24 >> 2] = $2; //@line 11332
    $25 = $ReallocAsyncCtx6 + 8 | 0; //@line 11333
    HEAP32[$25 >> 2] = $18; //@line 11334
    $26 = $ReallocAsyncCtx6 + 12 | 0; //@line 11335
    HEAP32[$26 >> 2] = $19; //@line 11336
    $27 = $ReallocAsyncCtx6 + 16 | 0; //@line 11337
    HEAP32[$27 >> 2] = $4; //@line 11338
    $28 = $ReallocAsyncCtx6 + 20 | 0; //@line 11339
    $$expand_i1_val = $10 & 1; //@line 11340
    HEAP8[$28 >> 0] = $$expand_i1_val; //@line 11341
    $29 = $ReallocAsyncCtx6 + 24 | 0; //@line 11342
    HEAP32[$29 >> 2] = $6; //@line 11343
    $30 = $ReallocAsyncCtx6 + 28 | 0; //@line 11344
    HEAP32[$30 >> 2] = $8; //@line 11345
    sp = STACKTOP; //@line 11346
    return;
   }
   HEAP32[___async_retval >> 2] = $23; //@line 11350
   ___async_unwind = 0; //@line 11351
   HEAP32[$ReallocAsyncCtx6 >> 2] = 17; //@line 11352
   $24 = $ReallocAsyncCtx6 + 4 | 0; //@line 11353
   HEAP32[$24 >> 2] = $2; //@line 11354
   $25 = $ReallocAsyncCtx6 + 8 | 0; //@line 11355
   HEAP32[$25 >> 2] = $18; //@line 11356
   $26 = $ReallocAsyncCtx6 + 12 | 0; //@line 11357
   HEAP32[$26 >> 2] = $19; //@line 11358
   $27 = $ReallocAsyncCtx6 + 16 | 0; //@line 11359
   HEAP32[$27 >> 2] = $4; //@line 11360
   $28 = $ReallocAsyncCtx6 + 20 | 0; //@line 11361
   $$expand_i1_val = $10 & 1; //@line 11362
   HEAP8[$28 >> 0] = $$expand_i1_val; //@line 11363
   $29 = $ReallocAsyncCtx6 + 24 | 0; //@line 11364
   HEAP32[$29 >> 2] = $6; //@line 11365
   $30 = $ReallocAsyncCtx6 + 28 | 0; //@line 11366
   HEAP32[$30 >> 2] = $8; //@line 11367
   sp = STACKTOP; //@line 11368
   return;
  }
 } while (0);
 $34 = HEAP32[35] | 0; //@line 11372
 $35 = HEAP32[28] | 0; //@line 11373
 $ReallocAsyncCtx7 = _emscripten_realloc_async_context(4) | 0; //@line 11374
 FUNCTION_TABLE_vi[$34 & 127]($35); //@line 11375
 if (___async) {
  HEAP32[$ReallocAsyncCtx7 >> 2] = 18; //@line 11378
  sp = STACKTOP; //@line 11379
  return;
 }
 ___async_unwind = 0; //@line 11382
 HEAP32[$ReallocAsyncCtx7 >> 2] = 18; //@line 11383
 sp = STACKTOP; //@line 11384
 return;
}
function __ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($0, $1, $2, $3, $4) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 var $$037$off038 = 0, $$037$off039 = 0, $13 = 0, $19 = 0, $22 = 0, $23 = 0, $25 = 0, $28 = 0, $39 = 0, $50 = 0, $53 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 10089
 do {
  if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, $4) | 0) {
   __ZNK10__cxxabiv117__class_type_info29process_static_type_below_dstEPNS_19__dynamic_cast_infoEPKvi(0, $1, $2, $3); //@line 10095
  } else {
   if (!(__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 >> 2] | 0, $4) | 0)) {
    $50 = HEAP32[$0 + 8 >> 2] | 0; //@line 10101
    $53 = HEAP32[(HEAP32[$50 >> 2] | 0) + 24 >> 2] | 0; //@line 10104
    $AsyncCtx3 = _emscripten_alloc_async_context(4, sp) | 0; //@line 10105
    FUNCTION_TABLE_viiiii[$53 & 3]($50, $1, $2, $3, $4); //@line 10106
    if (___async) {
     HEAP32[$AsyncCtx3 >> 2] = 68; //@line 10109
     sp = STACKTOP; //@line 10110
     return;
    } else {
     _emscripten_free_async_context($AsyncCtx3 | 0); //@line 10113
     break;
    }
   }
   if ((HEAP32[$1 + 16 >> 2] | 0) != ($2 | 0)) {
    $13 = $1 + 20 | 0; //@line 10121
    if ((HEAP32[$13 >> 2] | 0) != ($2 | 0)) {
     HEAP32[$1 + 32 >> 2] = $3; //@line 10126
     $19 = $1 + 44 | 0; //@line 10127
     if ((HEAP32[$19 >> 2] | 0) == 4) {
      break;
     }
     $22 = $1 + 52 | 0; //@line 10133
     HEAP8[$22 >> 0] = 0; //@line 10134
     $23 = $1 + 53 | 0; //@line 10135
     HEAP8[$23 >> 0] = 0; //@line 10136
     $25 = HEAP32[$0 + 8 >> 2] | 0; //@line 10138
     $28 = HEAP32[(HEAP32[$25 >> 2] | 0) + 20 >> 2] | 0; //@line 10141
     $AsyncCtx = _emscripten_alloc_async_context(28, sp) | 0; //@line 10142
     FUNCTION_TABLE_viiiiii[$28 & 3]($25, $1, $2, $2, 1, $4); //@line 10143
     if (___async) {
      HEAP32[$AsyncCtx >> 2] = 67; //@line 10146
      HEAP32[$AsyncCtx + 4 >> 2] = $23; //@line 10148
      HEAP32[$AsyncCtx + 8 >> 2] = $2; //@line 10150
      HEAP32[$AsyncCtx + 12 >> 2] = $13; //@line 10152
      HEAP32[$AsyncCtx + 16 >> 2] = $1; //@line 10154
      HEAP32[$AsyncCtx + 20 >> 2] = $22; //@line 10156
      HEAP32[$AsyncCtx + 24 >> 2] = $19; //@line 10158
      sp = STACKTOP; //@line 10159
      return;
     }
     _emscripten_free_async_context($AsyncCtx | 0); //@line 10162
     if (!(HEAP8[$23 >> 0] | 0)) {
      $$037$off038 = 4; //@line 10166
      label = 13; //@line 10167
     } else {
      if (!(HEAP8[$22 >> 0] | 0)) {
       $$037$off038 = 3; //@line 10172
       label = 13; //@line 10173
      } else {
       $$037$off039 = 3; //@line 10175
      }
     }
     if ((label | 0) == 13) {
      HEAP32[$13 >> 2] = $2; //@line 10179
      $39 = $1 + 40 | 0; //@line 10180
      HEAP32[$39 >> 2] = (HEAP32[$39 >> 2] | 0) + 1; //@line 10183
      if ((HEAP32[$1 + 36 >> 2] | 0) == 1) {
       if ((HEAP32[$1 + 24 >> 2] | 0) == 2) {
        HEAP8[$1 + 54 >> 0] = 1; //@line 10193
        $$037$off039 = $$037$off038; //@line 10194
       } else {
        $$037$off039 = $$037$off038; //@line 10196
       }
      } else {
       $$037$off039 = $$037$off038; //@line 10199
      }
     }
     HEAP32[$19 >> 2] = $$037$off039; //@line 10202
     break;
    }
   }
   if (($3 | 0) == 1) {
    HEAP32[$1 + 32 >> 2] = 1; //@line 10209
   }
  }
 } while (0);
 return;
}
function _mbed_vtracef__async_cb_11($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $2 = 0, $20 = 0, $22 = 0, $24 = 0, $26 = 0, $28 = 0, $30 = 0, $32 = 0, $34 = 0, $36 = 0, $38 = 0, $4 = 0, $40 = 0, $42 = 0, $44 = 0, $46 = 0, $48 = 0, $50 = 0, $55 = 0, $56 = 0, $57 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx5 = 0, sp = 0;
 sp = STACKTOP; //@line 11394
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 11396
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 11398
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 11400
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 11402
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 11404
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 11406
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 11408
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 11410
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 11412
 $20 = HEAP32[$0 + 40 >> 2] | 0; //@line 11414
 $22 = HEAP32[$0 + 44 >> 2] | 0; //@line 11416
 $24 = HEAP32[$0 + 48 >> 2] | 0; //@line 11418
 $26 = HEAP32[$0 + 52 >> 2] | 0; //@line 11420
 $28 = HEAP32[$0 + 56 >> 2] | 0; //@line 11422
 $30 = HEAP32[$0 + 60 >> 2] | 0; //@line 11424
 $32 = HEAP32[$0 + 64 >> 2] | 0; //@line 11426
 $34 = HEAP32[$0 + 68 >> 2] | 0; //@line 11428
 $36 = HEAP32[$0 + 72 >> 2] | 0; //@line 11430
 $38 = HEAP32[$0 + 76 >> 2] | 0; //@line 11432
 $40 = HEAP32[$0 + 80 >> 2] | 0; //@line 11434
 $42 = HEAP32[$0 + 84 >> 2] | 0; //@line 11436
 $44 = HEAP8[$0 + 88 >> 0] & 1; //@line 11439
 $46 = HEAP32[$0 + 92 >> 2] | 0; //@line 11441
 $48 = HEAP32[$0 + 96 >> 2] | 0; //@line 11443
 $50 = HEAP32[$0 + 100 >> 2] | 0; //@line 11445
 $55 = ($2 | 0 ? 4 : 0) + $2 + (HEAP32[___async_retval >> 2] | 0) | 0; //@line 11451
 $56 = HEAP32[33] | 0; //@line 11452
 $ReallocAsyncCtx5 = _emscripten_realloc_async_context(100) | 0; //@line 11453
 $57 = FUNCTION_TABLE_ii[$56 & 1]($55) | 0; //@line 11454
 if (!___async) {
  HEAP32[___async_retval >> 2] = $57; //@line 11458
  ___async_unwind = 0; //@line 11459
 }
 HEAP32[$ReallocAsyncCtx5 >> 2] = 15; //@line 11461
 HEAP32[$ReallocAsyncCtx5 + 4 >> 2] = $4; //@line 11463
 HEAP32[$ReallocAsyncCtx5 + 8 >> 2] = $6; //@line 11465
 HEAP32[$ReallocAsyncCtx5 + 12 >> 2] = $8; //@line 11467
 HEAP32[$ReallocAsyncCtx5 + 16 >> 2] = $10; //@line 11469
 HEAP32[$ReallocAsyncCtx5 + 20 >> 2] = $12; //@line 11471
 HEAP32[$ReallocAsyncCtx5 + 24 >> 2] = $14; //@line 11473
 HEAP32[$ReallocAsyncCtx5 + 28 >> 2] = $16; //@line 11475
 HEAP32[$ReallocAsyncCtx5 + 32 >> 2] = $18; //@line 11477
 HEAP32[$ReallocAsyncCtx5 + 36 >> 2] = $20; //@line 11479
 HEAP32[$ReallocAsyncCtx5 + 40 >> 2] = $22; //@line 11481
 HEAP32[$ReallocAsyncCtx5 + 44 >> 2] = $24; //@line 11483
 HEAP32[$ReallocAsyncCtx5 + 48 >> 2] = $26; //@line 11485
 HEAP32[$ReallocAsyncCtx5 + 52 >> 2] = $28; //@line 11487
 HEAP32[$ReallocAsyncCtx5 + 56 >> 2] = $30; //@line 11489
 HEAP32[$ReallocAsyncCtx5 + 60 >> 2] = $32; //@line 11491
 HEAP32[$ReallocAsyncCtx5 + 64 >> 2] = $34; //@line 11493
 HEAP32[$ReallocAsyncCtx5 + 68 >> 2] = $36; //@line 11495
 HEAP32[$ReallocAsyncCtx5 + 72 >> 2] = $38; //@line 11497
 HEAP32[$ReallocAsyncCtx5 + 76 >> 2] = $40; //@line 11499
 HEAP32[$ReallocAsyncCtx5 + 80 >> 2] = $42; //@line 11501
 HEAP8[$ReallocAsyncCtx5 + 84 >> 0] = $44 & 1; //@line 11504
 HEAP32[$ReallocAsyncCtx5 + 88 >> 2] = $46; //@line 11506
 HEAP32[$ReallocAsyncCtx5 + 92 >> 2] = $48; //@line 11508
 HEAP32[$ReallocAsyncCtx5 + 96 >> 2] = $50; //@line 11510
 sp = STACKTOP; //@line 11511
 return;
}
function _mbed_error_vfprintf__async_cb($0) {
 $0 = $0 | 0;
 var $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $4 = 0, $9 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx2 = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 12499
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 12501
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 12503
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 12505
 if (($AsyncRetVal | 0) <= 0) {
  return;
 }
 if (!(HEAP32[998] | 0)) {
  _serial_init(3996, 2, 3); //@line 12513
 }
 $9 = HEAP8[$4 >> 0] | 0; //@line 12515
 if (0 == 13 | $9 << 24 >> 24 != 10) {
  $ReallocAsyncCtx2 = _emscripten_realloc_async_context(24) | 0; //@line 12521
  _serial_putc(3996, $9 << 24 >> 24); //@line 12522
  if (___async) {
   HEAP32[$ReallocAsyncCtx2 >> 2] = 41; //@line 12525
   $18 = $ReallocAsyncCtx2 + 4 | 0; //@line 12526
   HEAP32[$18 >> 2] = 0; //@line 12527
   $19 = $ReallocAsyncCtx2 + 8 | 0; //@line 12528
   HEAP32[$19 >> 2] = $AsyncRetVal; //@line 12529
   $20 = $ReallocAsyncCtx2 + 12 | 0; //@line 12530
   HEAP32[$20 >> 2] = $2; //@line 12531
   $21 = $ReallocAsyncCtx2 + 16 | 0; //@line 12532
   HEAP8[$21 >> 0] = $9; //@line 12533
   $22 = $ReallocAsyncCtx2 + 20 | 0; //@line 12534
   HEAP32[$22 >> 2] = $4; //@line 12535
   sp = STACKTOP; //@line 12536
   return;
  }
  ___async_unwind = 0; //@line 12539
  HEAP32[$ReallocAsyncCtx2 >> 2] = 41; //@line 12540
  $18 = $ReallocAsyncCtx2 + 4 | 0; //@line 12541
  HEAP32[$18 >> 2] = 0; //@line 12542
  $19 = $ReallocAsyncCtx2 + 8 | 0; //@line 12543
  HEAP32[$19 >> 2] = $AsyncRetVal; //@line 12544
  $20 = $ReallocAsyncCtx2 + 12 | 0; //@line 12545
  HEAP32[$20 >> 2] = $2; //@line 12546
  $21 = $ReallocAsyncCtx2 + 16 | 0; //@line 12547
  HEAP8[$21 >> 0] = $9; //@line 12548
  $22 = $ReallocAsyncCtx2 + 20 | 0; //@line 12549
  HEAP32[$22 >> 2] = $4; //@line 12550
  sp = STACKTOP; //@line 12551
  return;
 } else {
  $ReallocAsyncCtx3 = _emscripten_realloc_async_context(24) | 0; //@line 12554
  _serial_putc(3996, 13); //@line 12555
  if (___async) {
   HEAP32[$ReallocAsyncCtx3 >> 2] = 40; //@line 12558
   $12 = $ReallocAsyncCtx3 + 4 | 0; //@line 12559
   HEAP8[$12 >> 0] = $9; //@line 12560
   $13 = $ReallocAsyncCtx3 + 8 | 0; //@line 12561
   HEAP32[$13 >> 2] = 0; //@line 12562
   $14 = $ReallocAsyncCtx3 + 12 | 0; //@line 12563
   HEAP32[$14 >> 2] = $AsyncRetVal; //@line 12564
   $15 = $ReallocAsyncCtx3 + 16 | 0; //@line 12565
   HEAP32[$15 >> 2] = $2; //@line 12566
   $16 = $ReallocAsyncCtx3 + 20 | 0; //@line 12567
   HEAP32[$16 >> 2] = $4; //@line 12568
   sp = STACKTOP; //@line 12569
   return;
  }
  ___async_unwind = 0; //@line 12572
  HEAP32[$ReallocAsyncCtx3 >> 2] = 40; //@line 12573
  $12 = $ReallocAsyncCtx3 + 4 | 0; //@line 12574
  HEAP8[$12 >> 0] = $9; //@line 12575
  $13 = $ReallocAsyncCtx3 + 8 | 0; //@line 12576
  HEAP32[$13 >> 2] = 0; //@line 12577
  $14 = $ReallocAsyncCtx3 + 12 | 0; //@line 12578
  HEAP32[$14 >> 2] = $AsyncRetVal; //@line 12579
  $15 = $ReallocAsyncCtx3 + 16 | 0; //@line 12580
  HEAP32[$15 >> 2] = $2; //@line 12581
  $16 = $ReallocAsyncCtx3 + 20 | 0; //@line 12582
  HEAP32[$16 >> 2] = $4; //@line 12583
  sp = STACKTOP; //@line 12584
  return;
 }
}
function _mbed_error_vfprintf__async_cb_35($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $13 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $4 = 0, $6 = 0, $ReallocAsyncCtx2 = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 12592
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 12596
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 12598
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 12602
 $12 = (HEAP32[$0 + 4 >> 2] | 0) + 1 | 0; //@line 12603
 if (($12 | 0) == ($4 | 0)) {
  return;
 }
 $13 = HEAP8[$10 + $12 >> 0] | 0; //@line 12609
 if ((HEAP8[$0 + 16 >> 0] | 0) == 13 | $13 << 24 >> 24 != 10) {
  $ReallocAsyncCtx2 = _emscripten_realloc_async_context(24) | 0; //@line 12615
  _serial_putc(3996, $13 << 24 >> 24); //@line 12616
  if (___async) {
   HEAP32[$ReallocAsyncCtx2 >> 2] = 41; //@line 12619
   $22 = $ReallocAsyncCtx2 + 4 | 0; //@line 12620
   HEAP32[$22 >> 2] = $12; //@line 12621
   $23 = $ReallocAsyncCtx2 + 8 | 0; //@line 12622
   HEAP32[$23 >> 2] = $4; //@line 12623
   $24 = $ReallocAsyncCtx2 + 12 | 0; //@line 12624
   HEAP32[$24 >> 2] = $6; //@line 12625
   $25 = $ReallocAsyncCtx2 + 16 | 0; //@line 12626
   HEAP8[$25 >> 0] = $13; //@line 12627
   $26 = $ReallocAsyncCtx2 + 20 | 0; //@line 12628
   HEAP32[$26 >> 2] = $10; //@line 12629
   sp = STACKTOP; //@line 12630
   return;
  }
  ___async_unwind = 0; //@line 12633
  HEAP32[$ReallocAsyncCtx2 >> 2] = 41; //@line 12634
  $22 = $ReallocAsyncCtx2 + 4 | 0; //@line 12635
  HEAP32[$22 >> 2] = $12; //@line 12636
  $23 = $ReallocAsyncCtx2 + 8 | 0; //@line 12637
  HEAP32[$23 >> 2] = $4; //@line 12638
  $24 = $ReallocAsyncCtx2 + 12 | 0; //@line 12639
  HEAP32[$24 >> 2] = $6; //@line 12640
  $25 = $ReallocAsyncCtx2 + 16 | 0; //@line 12641
  HEAP8[$25 >> 0] = $13; //@line 12642
  $26 = $ReallocAsyncCtx2 + 20 | 0; //@line 12643
  HEAP32[$26 >> 2] = $10; //@line 12644
  sp = STACKTOP; //@line 12645
  return;
 } else {
  $ReallocAsyncCtx3 = _emscripten_realloc_async_context(24) | 0; //@line 12648
  _serial_putc(3996, 13); //@line 12649
  if (___async) {
   HEAP32[$ReallocAsyncCtx3 >> 2] = 40; //@line 12652
   $16 = $ReallocAsyncCtx3 + 4 | 0; //@line 12653
   HEAP8[$16 >> 0] = $13; //@line 12654
   $17 = $ReallocAsyncCtx3 + 8 | 0; //@line 12655
   HEAP32[$17 >> 2] = $12; //@line 12656
   $18 = $ReallocAsyncCtx3 + 12 | 0; //@line 12657
   HEAP32[$18 >> 2] = $4; //@line 12658
   $19 = $ReallocAsyncCtx3 + 16 | 0; //@line 12659
   HEAP32[$19 >> 2] = $6; //@line 12660
   $20 = $ReallocAsyncCtx3 + 20 | 0; //@line 12661
   HEAP32[$20 >> 2] = $10; //@line 12662
   sp = STACKTOP; //@line 12663
   return;
  }
  ___async_unwind = 0; //@line 12666
  HEAP32[$ReallocAsyncCtx3 >> 2] = 40; //@line 12667
  $16 = $ReallocAsyncCtx3 + 4 | 0; //@line 12668
  HEAP8[$16 >> 0] = $13; //@line 12669
  $17 = $ReallocAsyncCtx3 + 8 | 0; //@line 12670
  HEAP32[$17 >> 2] = $12; //@line 12671
  $18 = $ReallocAsyncCtx3 + 12 | 0; //@line 12672
  HEAP32[$18 >> 2] = $4; //@line 12673
  $19 = $ReallocAsyncCtx3 + 16 | 0; //@line 12674
  HEAP32[$19 >> 2] = $6; //@line 12675
  $20 = $ReallocAsyncCtx3 + 20 | 0; //@line 12676
  HEAP32[$20 >> 2] = $10; //@line 12677
  sp = STACKTOP; //@line 12678
  return;
 }
}
function ___stdio_write($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$0 = 0, $$04756 = 0, $$04855 = 0, $$04954 = 0, $$051 = 0, $$1 = 0, $$150 = 0, $12 = 0, $13 = 0, $17 = 0, $20 = 0, $25 = 0, $27 = 0, $3 = 0, $37 = 0, $38 = 0, $4 = 0, $44 = 0, $5 = 0, $7 = 0, $9 = 0, $vararg_buffer = 0, $vararg_buffer3 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 4652
 STACKTOP = STACKTOP + 48 | 0; //@line 4653
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(48); //@line 4653
 $vararg_buffer3 = sp + 16 | 0; //@line 4654
 $vararg_buffer = sp; //@line 4655
 $3 = sp + 32 | 0; //@line 4656
 $4 = $0 + 28 | 0; //@line 4657
 $5 = HEAP32[$4 >> 2] | 0; //@line 4658
 HEAP32[$3 >> 2] = $5; //@line 4659
 $7 = $0 + 20 | 0; //@line 4661
 $9 = (HEAP32[$7 >> 2] | 0) - $5 | 0; //@line 4663
 HEAP32[$3 + 4 >> 2] = $9; //@line 4664
 HEAP32[$3 + 8 >> 2] = $1; //@line 4666
 HEAP32[$3 + 12 >> 2] = $2; //@line 4668
 $12 = $9 + $2 | 0; //@line 4669
 $13 = $0 + 60 | 0; //@line 4670
 HEAP32[$vararg_buffer >> 2] = HEAP32[$13 >> 2]; //@line 4673
 HEAP32[$vararg_buffer + 4 >> 2] = $3; //@line 4675
 HEAP32[$vararg_buffer + 8 >> 2] = 2; //@line 4677
 $17 = ___syscall_ret(___syscall146(146, $vararg_buffer | 0) | 0) | 0; //@line 4679
 L1 : do {
  if (($12 | 0) == ($17 | 0)) {
   label = 3; //@line 4683
  } else {
   $$04756 = 2; //@line 4685
   $$04855 = $12; //@line 4685
   $$04954 = $3; //@line 4685
   $27 = $17; //@line 4685
   while (1) {
    if (($27 | 0) < 0) {
     break;
    }
    $$04855 = $$04855 - $27 | 0; //@line 4691
    $37 = HEAP32[$$04954 + 4 >> 2] | 0; //@line 4693
    $38 = $27 >>> 0 > $37 >>> 0; //@line 4694
    $$150 = $38 ? $$04954 + 8 | 0 : $$04954; //@line 4696
    $$1 = $$04756 + ($38 << 31 >> 31) | 0; //@line 4698
    $$0 = $27 - ($38 ? $37 : 0) | 0; //@line 4700
    HEAP32[$$150 >> 2] = (HEAP32[$$150 >> 2] | 0) + $$0; //@line 4703
    $44 = $$150 + 4 | 0; //@line 4704
    HEAP32[$44 >> 2] = (HEAP32[$44 >> 2] | 0) - $$0; //@line 4707
    HEAP32[$vararg_buffer3 >> 2] = HEAP32[$13 >> 2]; //@line 4710
    HEAP32[$vararg_buffer3 + 4 >> 2] = $$150; //@line 4712
    HEAP32[$vararg_buffer3 + 8 >> 2] = $$1; //@line 4714
    $27 = ___syscall_ret(___syscall146(146, $vararg_buffer3 | 0) | 0) | 0; //@line 4716
    if (($$04855 | 0) == ($27 | 0)) {
     label = 3; //@line 4719
     break L1;
    } else {
     $$04756 = $$1; //@line 4722
     $$04954 = $$150; //@line 4722
    }
   }
   HEAP32[$0 + 16 >> 2] = 0; //@line 4726
   HEAP32[$4 >> 2] = 0; //@line 4727
   HEAP32[$7 >> 2] = 0; //@line 4728
   HEAP32[$0 >> 2] = HEAP32[$0 >> 2] | 32; //@line 4731
   if (($$04756 | 0) == 2) {
    $$051 = 0; //@line 4734
   } else {
    $$051 = $2 - (HEAP32[$$04954 + 4 >> 2] | 0) | 0; //@line 4739
   }
  }
 } while (0);
 if ((label | 0) == 3) {
  $20 = HEAP32[$0 + 44 >> 2] | 0; //@line 4745
  HEAP32[$0 + 16 >> 2] = $20 + (HEAP32[$0 + 48 >> 2] | 0); //@line 4750
  $25 = $20; //@line 4751
  HEAP32[$4 >> 2] = $25; //@line 4752
  HEAP32[$7 >> 2] = $25; //@line 4753
  $$051 = $2; //@line 4754
 }
 STACKTOP = sp; //@line 4756
 return $$051 | 0; //@line 4756
}
function _mbed_error_vfprintf($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$01213 = 0, $$014 = 0, $2 = 0, $24 = 0, $3 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, $AsyncCtx7 = 0, label = 0, sp = 0, $$01213$looptemp = 0;
 sp = STACKTOP; //@line 1203
 STACKTOP = STACKTOP + 128 | 0; //@line 1204
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(128); //@line 1204
 $2 = sp; //@line 1205
 $AsyncCtx = _emscripten_alloc_async_context(12, sp) | 0; //@line 1206
 $3 = _vsnprintf($2, 128, $0, $1) | 0; //@line 1207
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 39; //@line 1210
  HEAP32[$AsyncCtx + 4 >> 2] = $2; //@line 1212
  HEAP32[$AsyncCtx + 8 >> 2] = $2; //@line 1214
  sp = STACKTOP; //@line 1215
  STACKTOP = sp; //@line 1216
  return;
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 1218
 if (($3 | 0) <= 0) {
  STACKTOP = sp; //@line 1221
  return;
 }
 if (!(HEAP32[998] | 0)) {
  _serial_init(3996, 2, 3); //@line 1226
  $$01213 = 0; //@line 1227
  $$014 = 0; //@line 1227
 } else {
  $$01213 = 0; //@line 1229
  $$014 = 0; //@line 1229
 }
 while (1) {
  $$01213$looptemp = $$01213;
  $$01213 = HEAP8[$2 + $$014 >> 0] | 0; //@line 1233
  if (!($$01213$looptemp << 24 >> 24 == 13 | $$01213 << 24 >> 24 != 10)) {
   $AsyncCtx7 = _emscripten_alloc_async_context(24, sp) | 0; //@line 1238
   _serial_putc(3996, 13); //@line 1239
   if (___async) {
    label = 8; //@line 1242
    break;
   }
   _emscripten_free_async_context($AsyncCtx7 | 0); //@line 1245
  }
  $AsyncCtx3 = _emscripten_alloc_async_context(24, sp) | 0; //@line 1248
  _serial_putc(3996, $$01213 << 24 >> 24); //@line 1249
  if (___async) {
   label = 11; //@line 1252
   break;
  }
  _emscripten_free_async_context($AsyncCtx3 | 0); //@line 1255
  $24 = $$014 + 1 | 0; //@line 1256
  if (($24 | 0) == ($3 | 0)) {
   label = 13; //@line 1259
   break;
  } else {
   $$014 = $24; //@line 1262
  }
 }
 if ((label | 0) == 8) {
  HEAP32[$AsyncCtx7 >> 2] = 40; //@line 1266
  HEAP8[$AsyncCtx7 + 4 >> 0] = $$01213; //@line 1268
  HEAP32[$AsyncCtx7 + 8 >> 2] = $$014; //@line 1270
  HEAP32[$AsyncCtx7 + 12 >> 2] = $3; //@line 1272
  HEAP32[$AsyncCtx7 + 16 >> 2] = $2; //@line 1274
  HEAP32[$AsyncCtx7 + 20 >> 2] = $2; //@line 1276
  sp = STACKTOP; //@line 1277
  STACKTOP = sp; //@line 1278
  return;
 } else if ((label | 0) == 11) {
  HEAP32[$AsyncCtx3 >> 2] = 41; //@line 1281
  HEAP32[$AsyncCtx3 + 4 >> 2] = $$014; //@line 1283
  HEAP32[$AsyncCtx3 + 8 >> 2] = $3; //@line 1285
  HEAP32[$AsyncCtx3 + 12 >> 2] = $2; //@line 1287
  HEAP8[$AsyncCtx3 + 16 >> 0] = $$01213; //@line 1289
  HEAP32[$AsyncCtx3 + 20 >> 2] = $2; //@line 1291
  sp = STACKTOP; //@line 1292
  STACKTOP = sp; //@line 1293
  return;
 } else if ((label | 0) == 13) {
  STACKTOP = sp; //@line 1296
  return;
 }
}
function _memcpy(dest, src, num) {
 dest = dest | 0;
 src = src | 0;
 num = num | 0;
 var ret = 0, aligned_dest_end = 0, block_aligned_dest_end = 0, dest_end = 0;
 if ((num | 0) >= 8192) {
  return _emscripten_memcpy_big(dest | 0, src | 0, num | 0) | 0; //@line 13292
 }
 ret = dest | 0; //@line 13295
 dest_end = dest + num | 0; //@line 13296
 if ((dest & 3) == (src & 3)) {
  while (dest & 3) {
   if (!num) return ret | 0; //@line 13300
   HEAP8[dest >> 0] = HEAP8[src >> 0] | 0; //@line 13301
   dest = dest + 1 | 0; //@line 13302
   src = src + 1 | 0; //@line 13303
   num = num - 1 | 0; //@line 13304
  }
  aligned_dest_end = dest_end & -4 | 0; //@line 13306
  block_aligned_dest_end = aligned_dest_end - 64 | 0; //@line 13307
  while ((dest | 0) <= (block_aligned_dest_end | 0)) {
   HEAP32[dest >> 2] = HEAP32[src >> 2]; //@line 13309
   HEAP32[dest + 4 >> 2] = HEAP32[src + 4 >> 2]; //@line 13310
   HEAP32[dest + 8 >> 2] = HEAP32[src + 8 >> 2]; //@line 13311
   HEAP32[dest + 12 >> 2] = HEAP32[src + 12 >> 2]; //@line 13312
   HEAP32[dest + 16 >> 2] = HEAP32[src + 16 >> 2]; //@line 13313
   HEAP32[dest + 20 >> 2] = HEAP32[src + 20 >> 2]; //@line 13314
   HEAP32[dest + 24 >> 2] = HEAP32[src + 24 >> 2]; //@line 13315
   HEAP32[dest + 28 >> 2] = HEAP32[src + 28 >> 2]; //@line 13316
   HEAP32[dest + 32 >> 2] = HEAP32[src + 32 >> 2]; //@line 13317
   HEAP32[dest + 36 >> 2] = HEAP32[src + 36 >> 2]; //@line 13318
   HEAP32[dest + 40 >> 2] = HEAP32[src + 40 >> 2]; //@line 13319
   HEAP32[dest + 44 >> 2] = HEAP32[src + 44 >> 2]; //@line 13320
   HEAP32[dest + 48 >> 2] = HEAP32[src + 48 >> 2]; //@line 13321
   HEAP32[dest + 52 >> 2] = HEAP32[src + 52 >> 2]; //@line 13322
   HEAP32[dest + 56 >> 2] = HEAP32[src + 56 >> 2]; //@line 13323
   HEAP32[dest + 60 >> 2] = HEAP32[src + 60 >> 2]; //@line 13324
   dest = dest + 64 | 0; //@line 13325
   src = src + 64 | 0; //@line 13326
  }
  while ((dest | 0) < (aligned_dest_end | 0)) {
   HEAP32[dest >> 2] = HEAP32[src >> 2]; //@line 13329
   dest = dest + 4 | 0; //@line 13330
   src = src + 4 | 0; //@line 13331
  }
 } else {
  aligned_dest_end = dest_end - 4 | 0; //@line 13335
  while ((dest | 0) < (aligned_dest_end | 0)) {
   HEAP8[dest >> 0] = HEAP8[src >> 0] | 0; //@line 13337
   HEAP8[dest + 1 >> 0] = HEAP8[src + 1 >> 0] | 0; //@line 13338
   HEAP8[dest + 2 >> 0] = HEAP8[src + 2 >> 0] | 0; //@line 13339
   HEAP8[dest + 3 >> 0] = HEAP8[src + 3 >> 0] | 0; //@line 13340
   dest = dest + 4 | 0; //@line 13341
   src = src + 4 | 0; //@line 13342
  }
 }
 while ((dest | 0) < (dest_end | 0)) {
  HEAP8[dest >> 0] = HEAP8[src >> 0] | 0; //@line 13347
  dest = dest + 1 | 0; //@line 13348
  src = src + 1 | 0; //@line 13349
 }
 return ret | 0; //@line 13351
}
function __ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$0 = 0, $$2 = 0, $17 = 0, $18 = 0, $3 = 0, $6 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, dest = 0, sp = 0, stop = 0;
 sp = STACKTOP; //@line 9590
 STACKTOP = STACKTOP + 64 | 0; //@line 9591
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(64); //@line 9591
 $3 = sp; //@line 9592
 if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, $1, 0) | 0) {
  $$2 = 1; //@line 9595
 } else {
  if (!$1) {
   $$2 = 0; //@line 9599
  } else {
   $AsyncCtx3 = _emscripten_alloc_async_context(16, sp) | 0; //@line 9601
   $6 = ___dynamic_cast($1, 24, 8, 0) | 0; //@line 9602
   if (___async) {
    HEAP32[$AsyncCtx3 >> 2] = 62; //@line 9605
    HEAP32[$AsyncCtx3 + 4 >> 2] = $3; //@line 9607
    HEAP32[$AsyncCtx3 + 8 >> 2] = $0; //@line 9609
    HEAP32[$AsyncCtx3 + 12 >> 2] = $2; //@line 9611
    sp = STACKTOP; //@line 9612
    STACKTOP = sp; //@line 9613
    return 0; //@line 9613
   }
   _emscripten_free_async_context($AsyncCtx3 | 0); //@line 9615
   if (!$6) {
    $$2 = 0; //@line 9618
   } else {
    dest = $3 + 4 | 0; //@line 9621
    stop = dest + 52 | 0; //@line 9621
    do {
     HEAP32[dest >> 2] = 0; //@line 9621
     dest = dest + 4 | 0; //@line 9621
    } while ((dest | 0) < (stop | 0));
    HEAP32[$3 >> 2] = $6; //@line 9622
    HEAP32[$3 + 8 >> 2] = $0; //@line 9624
    HEAP32[$3 + 12 >> 2] = -1; //@line 9626
    HEAP32[$3 + 48 >> 2] = 1; //@line 9628
    $17 = HEAP32[(HEAP32[$6 >> 2] | 0) + 28 >> 2] | 0; //@line 9631
    $18 = HEAP32[$2 >> 2] | 0; //@line 9632
    $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 9633
    FUNCTION_TABLE_viiii[$17 & 3]($6, $3, $18, 1); //@line 9634
    if (___async) {
     HEAP32[$AsyncCtx >> 2] = 63; //@line 9637
     HEAP32[$AsyncCtx + 4 >> 2] = $3; //@line 9639
     HEAP32[$AsyncCtx + 8 >> 2] = $2; //@line 9641
     HEAP32[$AsyncCtx + 12 >> 2] = $3; //@line 9643
     sp = STACKTOP; //@line 9644
     STACKTOP = sp; //@line 9645
     return 0; //@line 9645
    }
    _emscripten_free_async_context($AsyncCtx | 0); //@line 9647
    if ((HEAP32[$3 + 24 >> 2] | 0) == 1) {
     HEAP32[$2 >> 2] = HEAP32[$3 + 16 >> 2]; //@line 9654
     $$0 = 1; //@line 9655
    } else {
     $$0 = 0; //@line 9657
    }
    $$2 = $$0; //@line 9659
   }
  }
 }
 STACKTOP = sp; //@line 9663
 return $$2 | 0; //@line 9663
}
function _vsnprintf($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $$$015 = 0, $$0 = 0, $$014 = 0, $$015 = 0, $11 = 0, $14 = 0, $16 = 0, $17 = 0, $19 = 0, $26 = 0, $4 = 0, $5 = 0, $AsyncCtx = 0, dest = 0, label = 0, sp = 0, src = 0, stop = 0;
 sp = STACKTOP; //@line 9373
 STACKTOP = STACKTOP + 128 | 0; //@line 9374
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(128); //@line 9374
 $4 = sp + 124 | 0; //@line 9375
 $5 = sp; //@line 9376
 dest = $5; //@line 9377
 src = 536; //@line 9377
 stop = dest + 124 | 0; //@line 9377
 do {
  HEAP32[dest >> 2] = HEAP32[src >> 2]; //@line 9377
  dest = dest + 4 | 0; //@line 9377
  src = src + 4 | 0; //@line 9377
 } while ((dest | 0) < (stop | 0));
 if (($1 + -1 | 0) >>> 0 > 2147483646) {
  if (!$1) {
   $$014 = $4; //@line 9383
   $$015 = 1; //@line 9383
   label = 4; //@line 9384
  } else {
   HEAP32[(___errno_location() | 0) >> 2] = 75; //@line 9387
   $$0 = -1; //@line 9388
  }
 } else {
  $$014 = $0; //@line 9391
  $$015 = $1; //@line 9391
  label = 4; //@line 9392
 }
 if ((label | 0) == 4) {
  $11 = -2 - $$014 | 0; //@line 9396
  $$$015 = $$015 >>> 0 > $11 >>> 0 ? $11 : $$015; //@line 9398
  HEAP32[$5 + 48 >> 2] = $$$015; //@line 9400
  $14 = $5 + 20 | 0; //@line 9401
  HEAP32[$14 >> 2] = $$014; //@line 9402
  HEAP32[$5 + 44 >> 2] = $$014; //@line 9404
  $16 = $$014 + $$$015 | 0; //@line 9405
  $17 = $5 + 16 | 0; //@line 9406
  HEAP32[$17 >> 2] = $16; //@line 9407
  HEAP32[$5 + 28 >> 2] = $16; //@line 9409
  $AsyncCtx = _emscripten_alloc_async_context(24, sp) | 0; //@line 9410
  $19 = _vfprintf($5, $2, $3) | 0; //@line 9411
  if (___async) {
   HEAP32[$AsyncCtx >> 2] = 59; //@line 9414
   HEAP32[$AsyncCtx + 4 >> 2] = $$$015; //@line 9416
   HEAP32[$AsyncCtx + 8 >> 2] = $5; //@line 9418
   HEAP32[$AsyncCtx + 12 >> 2] = $4; //@line 9420
   HEAP32[$AsyncCtx + 16 >> 2] = $14; //@line 9422
   HEAP32[$AsyncCtx + 20 >> 2] = $17; //@line 9424
   sp = STACKTOP; //@line 9425
   STACKTOP = sp; //@line 9426
   return 0; //@line 9426
  }
  _emscripten_free_async_context($AsyncCtx | 0); //@line 9428
  if (!$$$015) {
   $$0 = $19; //@line 9431
  } else {
   $26 = HEAP32[$14 >> 2] | 0; //@line 9433
   HEAP8[$26 + ((($26 | 0) == (HEAP32[$17 >> 2] | 0)) << 31 >> 31) >> 0] = 0; //@line 9438
   $$0 = $19; //@line 9439
  }
 }
 STACKTOP = sp; //@line 9442
 return $$0 | 0; //@line 9442
}
function ___mo_lookup($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$090 = 0, $$094 = 0, $$4 = 0, $10 = 0, $13 = 0, $17 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $31 = 0, $35 = 0, $4 = 0, $44 = 0, $46 = 0, $49 = 0, $53 = 0, $63 = 0, $7 = 0;
 $4 = (HEAP32[$0 >> 2] | 0) + 1794895138 | 0; //@line 5362
 $7 = _swapc(HEAP32[$0 + 8 >> 2] | 0, $4) | 0; //@line 5365
 $10 = _swapc(HEAP32[$0 + 12 >> 2] | 0, $4) | 0; //@line 5368
 $13 = _swapc(HEAP32[$0 + 16 >> 2] | 0, $4) | 0; //@line 5371
 L1 : do {
  if ($7 >>> 0 < $1 >>> 2 >>> 0) {
   $17 = $1 - ($7 << 2) | 0; //@line 5377
   if ($10 >>> 0 < $17 >>> 0 & $13 >>> 0 < $17 >>> 0) {
    if (!(($13 | $10) & 3)) {
     $23 = $10 >>> 2; //@line 5386
     $24 = $13 >>> 2; //@line 5387
     $$090 = 0; //@line 5388
     $$094 = $7; //@line 5388
     while (1) {
      $25 = $$094 >>> 1; //@line 5390
      $26 = $$090 + $25 | 0; //@line 5391
      $27 = $26 << 1; //@line 5392
      $28 = $27 + $23 | 0; //@line 5393
      $31 = _swapc(HEAP32[$0 + ($28 << 2) >> 2] | 0, $4) | 0; //@line 5396
      $35 = _swapc(HEAP32[$0 + ($28 + 1 << 2) >> 2] | 0, $4) | 0; //@line 5400
      if (!($35 >>> 0 < $1 >>> 0 & $31 >>> 0 < ($1 - $35 | 0) >>> 0)) {
       $$4 = 0; //@line 5406
       break L1;
      }
      if (HEAP8[$0 + ($35 + $31) >> 0] | 0) {
       $$4 = 0; //@line 5414
       break L1;
      }
      $44 = _strcmp($2, $0 + $35 | 0) | 0; //@line 5418
      if (!$44) {
       break;
      }
      $63 = ($44 | 0) < 0; //@line 5424
      if (($$094 | 0) == 1) {
       $$4 = 0; //@line 5429
       break L1;
      } else {
       $$090 = $63 ? $$090 : $26; //@line 5432
       $$094 = $63 ? $25 : $$094 - $25 | 0; //@line 5432
      }
     }
     $46 = $27 + $24 | 0; //@line 5435
     $49 = _swapc(HEAP32[$0 + ($46 << 2) >> 2] | 0, $4) | 0; //@line 5438
     $53 = _swapc(HEAP32[$0 + ($46 + 1 << 2) >> 2] | 0, $4) | 0; //@line 5442
     if ($53 >>> 0 < $1 >>> 0 & $49 >>> 0 < ($1 - $53 | 0) >>> 0) {
      $$4 = (HEAP8[$0 + ($53 + $49) >> 0] | 0) == 0 ? $0 + $53 | 0 : 0; //@line 5454
     } else {
      $$4 = 0; //@line 5456
     }
    } else {
     $$4 = 0; //@line 5459
    }
   } else {
    $$4 = 0; //@line 5462
   }
  } else {
   $$4 = 0; //@line 5465
  }
 } while (0);
 return $$4 | 0; //@line 5468
}
function _putc($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0 = 0, $13 = 0, $14 = 0, $19 = 0, $20 = 0, $21 = 0, $26 = 0, $27 = 0, $32 = 0, $34 = 0, $7 = 0, $8 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 5027
 if ((HEAP32[$1 + 76 >> 2] | 0) < 0) {
  label = 3; //@line 5032
 } else {
  if (!(___lockfile($1) | 0)) {
   label = 3; //@line 5037
  } else {
   $20 = $0 & 255; //@line 5039
   $21 = $0 & 255; //@line 5040
   if (($21 | 0) == (HEAP8[$1 + 75 >> 0] | 0)) {
    label = 12; //@line 5046
   } else {
    $26 = $1 + 20 | 0; //@line 5048
    $27 = HEAP32[$26 >> 2] | 0; //@line 5049
    if ($27 >>> 0 < (HEAP32[$1 + 16 >> 2] | 0) >>> 0) {
     HEAP32[$26 >> 2] = $27 + 1; //@line 5055
     HEAP8[$27 >> 0] = $20; //@line 5056
     $34 = $21; //@line 5057
    } else {
     label = 12; //@line 5059
    }
   }
   do {
    if ((label | 0) == 12) {
     $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 5064
     $32 = ___overflow($1, $0) | 0; //@line 5065
     if (___async) {
      HEAP32[$AsyncCtx >> 2] = 49; //@line 5068
      HEAP32[$AsyncCtx + 4 >> 2] = $1; //@line 5070
      sp = STACKTOP; //@line 5071
      return 0; //@line 5072
     } else {
      _emscripten_free_async_context($AsyncCtx | 0); //@line 5074
      $34 = $32; //@line 5075
      break;
     }
    }
   } while (0);
   ___unlockfile($1); //@line 5080
   $$0 = $34; //@line 5081
  }
 }
 do {
  if ((label | 0) == 3) {
   $7 = $0 & 255; //@line 5086
   $8 = $0 & 255; //@line 5087
   if (($8 | 0) != (HEAP8[$1 + 75 >> 0] | 0)) {
    $13 = $1 + 20 | 0; //@line 5093
    $14 = HEAP32[$13 >> 2] | 0; //@line 5094
    if ($14 >>> 0 < (HEAP32[$1 + 16 >> 2] | 0) >>> 0) {
     HEAP32[$13 >> 2] = $14 + 1; //@line 5100
     HEAP8[$14 >> 0] = $7; //@line 5101
     $$0 = $8; //@line 5102
     break;
    }
   }
   $AsyncCtx3 = _emscripten_alloc_async_context(4, sp) | 0; //@line 5106
   $19 = ___overflow($1, $0) | 0; //@line 5107
   if (___async) {
    HEAP32[$AsyncCtx3 >> 2] = 48; //@line 5110
    sp = STACKTOP; //@line 5111
    return 0; //@line 5112
   } else {
    _emscripten_free_async_context($AsyncCtx3 | 0); //@line 5114
    $$0 = $19; //@line 5115
    break;
   }
  }
 } while (0);
 return $$0 | 0; //@line 5120
}
function ___fflush_unlocked($0) {
 $0 = $0 | 0;
 var $$0 = 0, $1 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $22 = 0, $3 = 0, $7 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 5747
 $1 = $0 + 20 | 0; //@line 5748
 $3 = $0 + 28 | 0; //@line 5750
 do {
  if ((HEAP32[$1 >> 2] | 0) >>> 0 > (HEAP32[$3 >> 2] | 0) >>> 0) {
   $7 = HEAP32[$0 + 36 >> 2] | 0; //@line 5756
   $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 5757
   FUNCTION_TABLE_iiii[$7 & 7]($0, 0, 0) | 0; //@line 5758
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 55; //@line 5761
    HEAP32[$AsyncCtx + 4 >> 2] = $1; //@line 5763
    HEAP32[$AsyncCtx + 8 >> 2] = $0; //@line 5765
    HEAP32[$AsyncCtx + 12 >> 2] = $3; //@line 5767
    sp = STACKTOP; //@line 5768
    return 0; //@line 5769
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 5771
    if (!(HEAP32[$1 >> 2] | 0)) {
     $$0 = -1; //@line 5775
     break;
    } else {
     label = 5; //@line 5778
     break;
    }
   }
  } else {
   label = 5; //@line 5783
  }
 } while (0);
 if ((label | 0) == 5) {
  $13 = $0 + 4 | 0; //@line 5787
  $14 = HEAP32[$13 >> 2] | 0; //@line 5788
  $15 = $0 + 8 | 0; //@line 5789
  $16 = HEAP32[$15 >> 2] | 0; //@line 5790
  do {
   if ($14 >>> 0 < $16 >>> 0) {
    $22 = HEAP32[$0 + 40 >> 2] | 0; //@line 5798
    $AsyncCtx3 = _emscripten_alloc_async_context(24, sp) | 0; //@line 5799
    FUNCTION_TABLE_iiii[$22 & 7]($0, $14 - $16 | 0, 1) | 0; //@line 5800
    if (___async) {
     HEAP32[$AsyncCtx3 >> 2] = 56; //@line 5803
     HEAP32[$AsyncCtx3 + 4 >> 2] = $0; //@line 5805
     HEAP32[$AsyncCtx3 + 8 >> 2] = $3; //@line 5807
     HEAP32[$AsyncCtx3 + 12 >> 2] = $1; //@line 5809
     HEAP32[$AsyncCtx3 + 16 >> 2] = $15; //@line 5811
     HEAP32[$AsyncCtx3 + 20 >> 2] = $13; //@line 5813
     sp = STACKTOP; //@line 5814
     return 0; //@line 5815
    } else {
     _emscripten_free_async_context($AsyncCtx3 | 0); //@line 5817
     break;
    }
   }
  } while (0);
  HEAP32[$0 + 16 >> 2] = 0; //@line 5823
  HEAP32[$3 >> 2] = 0; //@line 5824
  HEAP32[$1 >> 2] = 0; //@line 5825
  HEAP32[$15 >> 2] = 0; //@line 5826
  HEAP32[$13 >> 2] = 0; //@line 5827
  $$0 = 0; //@line 5828
 }
 return $$0 | 0; //@line 5830
}
function __ZN16SX1276_LoRaRadio8rx_frameEPhjjhh($0, $1, $2, $3, $4, $5) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 $5 = $5 | 0;
 var $10 = 0, $13 = 0, $16 = 0, $6 = 0, $7 = 0, $vararg_buffer = 0, $vararg_buffer12 = 0, $vararg_buffer4 = 0, $vararg_buffer8 = 0, sp = 0;
 sp = STACKTOP; //@line 68
 STACKTOP = STACKTOP + 48 | 0; //@line 69
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(48); //@line 69
 $vararg_buffer12 = sp + 32 | 0; //@line 70
 $vararg_buffer8 = sp + 24 | 0; //@line 71
 $vararg_buffer4 = sp + 16 | 0; //@line 72
 $vararg_buffer = sp; //@line 73
 $6 = $4 & 255; //@line 74
 $7 = $5 & 255; //@line 75
 HEAP32[$vararg_buffer >> 2] = $2; //@line 76
 HEAP32[$vararg_buffer + 4 >> 2] = $3; //@line 78
 HEAP32[$vararg_buffer + 8 >> 2] = $6; //@line 80
 HEAP32[$vararg_buffer + 12 >> 2] = $7; //@line 82
 _mbed_tracef(16, 740, 768, $vararg_buffer); //@line 83
 _emscripten_asm_const_i(0) | 0; //@line 84
 $10 = HEAP32[$0 + 752 >> 2] | 0; //@line 86
 if (($10 | 0) != ($6 | 0)) {
  HEAP32[$vararg_buffer4 >> 2] = $10; //@line 89
  HEAP32[$vararg_buffer4 + 4 >> 2] = $6; //@line 91
  _mbed_tracef(16, 740, 850, $vararg_buffer4); //@line 92
  STACKTOP = sp; //@line 93
  return;
 }
 $13 = HEAP32[$0 + 756 >> 2] | 0; //@line 96
 if (($13 | 0) != ($7 | 0)) {
  HEAP32[$vararg_buffer8 >> 2] = $13; //@line 99
  HEAP32[$vararg_buffer8 + 4 >> 2] = $7; //@line 101
  _mbed_tracef(16, 740, 897, $vararg_buffer8); //@line 102
  STACKTOP = sp; //@line 103
  return;
 }
 $16 = HEAP32[$0 + 692 >> 2] | 0; //@line 106
 if (($16 | 0) == ($3 | 0)) {
  _memcpy($0 + 792 | 0, $1 | 0, $2 | 0) | 0; //@line 110
  HEAP8[$0 + 782 >> 0] = $2; //@line 113
  HEAP8[$0 + 781 >> 0] = -35; //@line 115
  HEAP8[$0 + 780 >> 0] = -5; //@line 117
  HEAP8[$0 + 783 >> 0] = 1; //@line 119
  HEAP32[$0 + 784 >> 2] = _emscripten_asm_const_i(1) | 0; //@line 122
  STACKTOP = sp; //@line 123
  return;
 } else {
  HEAP32[$vararg_buffer12 >> 2] = $16; //@line 125
  HEAP32[$vararg_buffer12 + 4 >> 2] = $3; //@line 127
  _mbed_tracef(16, 740, 944, $vararg_buffer12); //@line 128
  STACKTOP = sp; //@line 129
  return;
 }
}
function ___strchrnul($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0 = 0, $$029$lcssa = 0, $$02936 = 0, $$030$lcssa = 0, $$03039 = 0, $$1 = 0, $10 = 0, $13 = 0, $17 = 0, $18 = 0, $2 = 0, $24 = 0, $25 = 0, $31 = 0, $38 = 0, $39 = 0, $7 = 0;
 $2 = $1 & 255; //@line 5511
 L1 : do {
  if (!$2) {
   $$0 = $0 + (_strlen($0) | 0) | 0; //@line 5517
  } else {
   if (!($0 & 3)) {
    $$030$lcssa = $0; //@line 5523
   } else {
    $7 = $1 & 255; //@line 5525
    $$03039 = $0; //@line 5526
    while (1) {
     $10 = HEAP8[$$03039 >> 0] | 0; //@line 5528
     if ($10 << 24 >> 24 == 0 ? 1 : $10 << 24 >> 24 == $7 << 24 >> 24) {
      $$0 = $$03039; //@line 5533
      break L1;
     }
     $13 = $$03039 + 1 | 0; //@line 5536
     if (!($13 & 3)) {
      $$030$lcssa = $13; //@line 5541
      break;
     } else {
      $$03039 = $13; //@line 5544
     }
    }
   }
   $17 = Math_imul($2, 16843009) | 0; //@line 5548
   $18 = HEAP32[$$030$lcssa >> 2] | 0; //@line 5549
   L10 : do {
    if (!(($18 & -2139062144 ^ -2139062144) & $18 + -16843009)) {
     $$02936 = $$030$lcssa; //@line 5557
     $25 = $18; //@line 5557
     while (1) {
      $24 = $25 ^ $17; //@line 5559
      if (($24 & -2139062144 ^ -2139062144) & $24 + -16843009 | 0) {
       $$029$lcssa = $$02936; //@line 5566
       break L10;
      }
      $31 = $$02936 + 4 | 0; //@line 5569
      $25 = HEAP32[$31 >> 2] | 0; //@line 5570
      if (($25 & -2139062144 ^ -2139062144) & $25 + -16843009 | 0) {
       $$029$lcssa = $31; //@line 5579
       break;
      } else {
       $$02936 = $31; //@line 5577
      }
     }
    } else {
     $$029$lcssa = $$030$lcssa; //@line 5584
    }
   } while (0);
   $38 = $1 & 255; //@line 5587
   $$1 = $$029$lcssa; //@line 5588
   while (1) {
    $39 = HEAP8[$$1 >> 0] | 0; //@line 5590
    if ($39 << 24 >> 24 == 0 ? 1 : $39 << 24 >> 24 == $38 << 24 >> 24) {
     $$0 = $$1; //@line 5596
     break;
    } else {
     $$1 = $$1 + 1 | 0; //@line 5599
    }
   }
  }
 } while (0);
 return $$0 | 0; //@line 5604
}
function ___fwritex($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$038 = 0, $$1 = 0, $$139 = 0, $$141 = 0, $$143 = 0, $10 = 0, $12 = 0, $14 = 0, $22 = 0, $28 = 0, $3 = 0, $31 = 0, $4 = 0, $9 = 0, label = 0;
 $3 = $2 + 16 | 0; //@line 5253
 $4 = HEAP32[$3 >> 2] | 0; //@line 5254
 if (!$4) {
  if (!(___towrite($2) | 0)) {
   $12 = HEAP32[$3 >> 2] | 0; //@line 5261
   label = 5; //@line 5262
  } else {
   $$1 = 0; //@line 5264
  }
 } else {
  $12 = $4; //@line 5268
  label = 5; //@line 5269
 }
 L5 : do {
  if ((label | 0) == 5) {
   $9 = $2 + 20 | 0; //@line 5273
   $10 = HEAP32[$9 >> 2] | 0; //@line 5274
   $14 = $10; //@line 5277
   if (($12 - $10 | 0) >>> 0 < $1 >>> 0) {
    $$1 = FUNCTION_TABLE_iiii[HEAP32[$2 + 36 >> 2] & 7]($2, $0, $1) | 0; //@line 5282
    break;
   }
   L10 : do {
    if ((HEAP8[$2 + 75 >> 0] | 0) > -1) {
     $$038 = $1; //@line 5290
     while (1) {
      if (!$$038) {
       $$139 = 0; //@line 5294
       $$141 = $0; //@line 5294
       $$143 = $1; //@line 5294
       $31 = $14; //@line 5294
       break L10;
      }
      $22 = $$038 + -1 | 0; //@line 5297
      if ((HEAP8[$0 + $22 >> 0] | 0) == 10) {
       break;
      } else {
       $$038 = $22; //@line 5304
      }
     }
     $28 = FUNCTION_TABLE_iiii[HEAP32[$2 + 36 >> 2] & 7]($2, $0, $$038) | 0; //@line 5309
     if ($28 >>> 0 < $$038 >>> 0) {
      $$1 = $28; //@line 5312
      break L5;
     }
     $$139 = $$038; //@line 5318
     $$141 = $0 + $$038 | 0; //@line 5318
     $$143 = $1 - $$038 | 0; //@line 5318
     $31 = HEAP32[$9 >> 2] | 0; //@line 5318
    } else {
     $$139 = 0; //@line 5320
     $$141 = $0; //@line 5320
     $$143 = $1; //@line 5320
     $31 = $14; //@line 5320
    }
   } while (0);
   _memcpy($31 | 0, $$141 | 0, $$143 | 0) | 0; //@line 5323
   HEAP32[$9 >> 2] = (HEAP32[$9 >> 2] | 0) + $$143; //@line 5326
   $$1 = $$139 + $$143 | 0; //@line 5328
  }
 } while (0);
 return $$1 | 0; //@line 5331
}
function ___overflow($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0 = 0, $10 = 0, $12 = 0, $13 = 0, $2 = 0, $20 = 0, $21 = 0, $3 = 0, $4 = 0, $5 = 0, $9 = 0, $AsyncCtx = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 5139
 STACKTOP = STACKTOP + 16 | 0; //@line 5140
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 5140
 $2 = sp; //@line 5141
 $3 = $1 & 255; //@line 5142
 HEAP8[$2 >> 0] = $3; //@line 5143
 $4 = $0 + 16 | 0; //@line 5144
 $5 = HEAP32[$4 >> 2] | 0; //@line 5145
 if (!$5) {
  if (!(___towrite($0) | 0)) {
   $12 = HEAP32[$4 >> 2] | 0; //@line 5152
   label = 4; //@line 5153
  } else {
   $$0 = -1; //@line 5155
  }
 } else {
  $12 = $5; //@line 5158
  label = 4; //@line 5159
 }
 do {
  if ((label | 0) == 4) {
   $9 = $0 + 20 | 0; //@line 5163
   $10 = HEAP32[$9 >> 2] | 0; //@line 5164
   if ($10 >>> 0 < $12 >>> 0) {
    $13 = $1 & 255; //@line 5167
    if (($13 | 0) != (HEAP8[$0 + 75 >> 0] | 0)) {
     HEAP32[$9 >> 2] = $10 + 1; //@line 5174
     HEAP8[$10 >> 0] = $3; //@line 5175
     $$0 = $13; //@line 5176
     break;
    }
   }
   $20 = HEAP32[$0 + 36 >> 2] | 0; //@line 5181
   $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 5182
   $21 = FUNCTION_TABLE_iiii[$20 & 7]($0, $2, 1) | 0; //@line 5183
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 50; //@line 5186
    HEAP32[$AsyncCtx + 4 >> 2] = $2; //@line 5188
    sp = STACKTOP; //@line 5189
    STACKTOP = sp; //@line 5190
    return 0; //@line 5190
   }
   _emscripten_free_async_context($AsyncCtx | 0); //@line 5192
   if (($21 | 0) == 1) {
    $$0 = HEAPU8[$2 >> 0] | 0; //@line 5197
   } else {
    $$0 = -1; //@line 5199
   }
  }
 } while (0);
 STACKTOP = sp; //@line 5203
 return $$0 | 0; //@line 5203
}
function _fflush__async_cb_32($0) {
 $0 = $0 | 0;
 var $$023 = 0, $$02325 = 0, $$02327 = 0, $$024$lcssa = 0, $$02426 = 0, $13 = 0, $16 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 12211
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 12213
 $$02325 = HEAP32[(___ofl_lock() | 0) >> 2] | 0; //@line 12215
 L3 : do {
  if (!$$02325) {
   $$024$lcssa = $AsyncRetVal; //@line 12219
  } else {
   $$02327 = $$02325; //@line 12221
   $$02426 = $AsyncRetVal; //@line 12221
   while (1) {
    if ((HEAP32[$$02327 + 76 >> 2] | 0) > -1) {
     $16 = ___lockfile($$02327) | 0; //@line 12228
    } else {
     $16 = 0; //@line 12230
    }
    if ((HEAP32[$$02327 + 20 >> 2] | 0) >>> 0 > (HEAP32[$$02327 + 28 >> 2] | 0) >>> 0) {
     break;
    }
    if ($16 | 0) {
     ___unlockfile($$02327); //@line 12242
    }
    $$023 = HEAP32[$$02327 + 56 >> 2] | 0; //@line 12245
    if (!$$023) {
     $$024$lcssa = $$02426; //@line 12248
     break L3;
    } else {
     $$02327 = $$023; //@line 12251
    }
   }
   $ReallocAsyncCtx = _emscripten_realloc_async_context(16) | 0; //@line 12254
   $13 = ___fflush_unlocked($$02327) | 0; //@line 12255
   if (!___async) {
    HEAP32[___async_retval >> 2] = $13; //@line 12259
    ___async_unwind = 0; //@line 12260
   }
   HEAP32[$ReallocAsyncCtx >> 2] = 54; //@line 12262
   HEAP32[$ReallocAsyncCtx + 4 >> 2] = $$02426; //@line 12264
   HEAP32[$ReallocAsyncCtx + 8 >> 2] = $16; //@line 12266
   HEAP32[$ReallocAsyncCtx + 12 >> 2] = $$02327; //@line 12268
   sp = STACKTOP; //@line 12269
   return;
  }
 } while (0);
 ___ofl_unlock(); //@line 12273
 HEAP32[___async_retval >> 2] = $$024$lcssa; //@line 12275
 return;
}
function _memset(ptr, value, num) {
 ptr = ptr | 0;
 value = value | 0;
 num = num | 0;
 var end = 0, aligned_end = 0, block_aligned_end = 0, value4 = 0;
 end = ptr + num | 0; //@line 13356
 value = value & 255; //@line 13358
 if ((num | 0) >= 67) {
  while (ptr & 3) {
   HEAP8[ptr >> 0] = value; //@line 13361
   ptr = ptr + 1 | 0; //@line 13362
  }
  aligned_end = end & -4 | 0; //@line 13365
  block_aligned_end = aligned_end - 64 | 0; //@line 13366
  value4 = value | value << 8 | value << 16 | value << 24; //@line 13367
  while ((ptr | 0) <= (block_aligned_end | 0)) {
   HEAP32[ptr >> 2] = value4; //@line 13370
   HEAP32[ptr + 4 >> 2] = value4; //@line 13371
   HEAP32[ptr + 8 >> 2] = value4; //@line 13372
   HEAP32[ptr + 12 >> 2] = value4; //@line 13373
   HEAP32[ptr + 16 >> 2] = value4; //@line 13374
   HEAP32[ptr + 20 >> 2] = value4; //@line 13375
   HEAP32[ptr + 24 >> 2] = value4; //@line 13376
   HEAP32[ptr + 28 >> 2] = value4; //@line 13377
   HEAP32[ptr + 32 >> 2] = value4; //@line 13378
   HEAP32[ptr + 36 >> 2] = value4; //@line 13379
   HEAP32[ptr + 40 >> 2] = value4; //@line 13380
   HEAP32[ptr + 44 >> 2] = value4; //@line 13381
   HEAP32[ptr + 48 >> 2] = value4; //@line 13382
   HEAP32[ptr + 52 >> 2] = value4; //@line 13383
   HEAP32[ptr + 56 >> 2] = value4; //@line 13384
   HEAP32[ptr + 60 >> 2] = value4; //@line 13385
   ptr = ptr + 64 | 0; //@line 13386
  }
  while ((ptr | 0) < (aligned_end | 0)) {
   HEAP32[ptr >> 2] = value4; //@line 13390
   ptr = ptr + 4 | 0; //@line 13391
  }
 }
 while ((ptr | 0) < (end | 0)) {
  HEAP8[ptr >> 0] = value; //@line 13396
  ptr = ptr + 1 | 0; //@line 13397
 }
 return end - num | 0; //@line 13399
}
function _fflush__async_cb($0) {
 $0 = $0 | 0;
 var $$02327$reg2mem$0 = 0, $$1 = 0, $$reg2mem$0 = 0, $17 = 0, $20 = 0, $ReallocAsyncCtx = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 12112
 $$02327$reg2mem$0 = HEAP32[$0 + 12 >> 2] | 0; //@line 12122
 $$1 = HEAP32[___async_retval >> 2] | HEAP32[$0 + 4 >> 2]; //@line 12122
 $$reg2mem$0 = HEAP32[$0 + 8 >> 2] | 0; //@line 12122
 while (1) {
  if ($$reg2mem$0 | 0) {
   ___unlockfile($$02327$reg2mem$0); //@line 12126
  }
  $$02327$reg2mem$0 = HEAP32[$$02327$reg2mem$0 + 56 >> 2] | 0; //@line 12129
  if (!$$02327$reg2mem$0) {
   label = 12; //@line 12132
   break;
  }
  if ((HEAP32[$$02327$reg2mem$0 + 76 >> 2] | 0) > -1) {
   $20 = ___lockfile($$02327$reg2mem$0) | 0; //@line 12140
  } else {
   $20 = 0; //@line 12142
  }
  if ((HEAP32[$$02327$reg2mem$0 + 20 >> 2] | 0) >>> 0 > (HEAP32[$$02327$reg2mem$0 + 28 >> 2] | 0) >>> 0) {
   break;
  } else {
   $$reg2mem$0 = $20; //@line 12152
  }
 }
 if ((label | 0) == 12) {
  ___ofl_unlock(); //@line 12156
  HEAP32[___async_retval >> 2] = $$1; //@line 12158
  return;
 }
 $ReallocAsyncCtx = _emscripten_realloc_async_context(16) | 0; //@line 12161
 $17 = ___fflush_unlocked($$02327$reg2mem$0) | 0; //@line 12162
 if (!___async) {
  HEAP32[___async_retval >> 2] = $17; //@line 12166
  ___async_unwind = 0; //@line 12167
 }
 HEAP32[$ReallocAsyncCtx >> 2] = 54; //@line 12169
 HEAP32[$ReallocAsyncCtx + 4 >> 2] = $$1; //@line 12171
 HEAP32[$ReallocAsyncCtx + 8 >> 2] = $20; //@line 12173
 HEAP32[$ReallocAsyncCtx + 12 >> 2] = $$02327$reg2mem$0; //@line 12175
 sp = STACKTOP; //@line 12176
 return;
}
function ___fflush_unlocked__async_cb($0) {
 $0 = $0 | 0;
 var $$0 = 0, $10 = 0, $11 = 0, $12 = 0, $18 = 0, $2 = 0, $4 = 0, $6 = 0, $9 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 12741
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 12743
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 12745
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 12747
 do {
  if (!(HEAP32[$2 >> 2] | 0)) {
   $$0 = -1; //@line 12752
  } else {
   $9 = $4 + 4 | 0; //@line 12754
   $10 = HEAP32[$9 >> 2] | 0; //@line 12755
   $11 = $4 + 8 | 0; //@line 12756
   $12 = HEAP32[$11 >> 2] | 0; //@line 12757
   if ($10 >>> 0 >= $12 >>> 0) {
    HEAP32[$4 + 16 >> 2] = 0; //@line 12761
    HEAP32[$6 >> 2] = 0; //@line 12762
    HEAP32[$2 >> 2] = 0; //@line 12763
    HEAP32[$11 >> 2] = 0; //@line 12764
    HEAP32[$9 >> 2] = 0; //@line 12765
    $$0 = 0; //@line 12766
    break;
   }
   $18 = HEAP32[$4 + 40 >> 2] | 0; //@line 12773
   $ReallocAsyncCtx2 = _emscripten_realloc_async_context(24) | 0; //@line 12774
   FUNCTION_TABLE_iiii[$18 & 7]($4, $10 - $12 | 0, 1) | 0; //@line 12775
   if (!___async) {
    ___async_unwind = 0; //@line 12778
   }
   HEAP32[$ReallocAsyncCtx2 >> 2] = 56; //@line 12780
   HEAP32[$ReallocAsyncCtx2 + 4 >> 2] = $4; //@line 12782
   HEAP32[$ReallocAsyncCtx2 + 8 >> 2] = $6; //@line 12784
   HEAP32[$ReallocAsyncCtx2 + 12 >> 2] = $2; //@line 12786
   HEAP32[$ReallocAsyncCtx2 + 16 >> 2] = $11; //@line 12788
   HEAP32[$ReallocAsyncCtx2 + 20 >> 2] = $9; //@line 12790
   sp = STACKTOP; //@line 12791
   return;
  }
 } while (0);
 HEAP32[___async_retval >> 2] = $$0; //@line 12796
 return;
}
function __ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv__async_cb_33($0) {
 $0 = $0 | 0;
 var $15 = 0, $16 = 0, $2 = 0, $4 = 0, $6 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx = 0, dest = 0, sp = 0, stop = 0;
 sp = STACKTOP; //@line 12322
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 12324
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 12326
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 12328
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 12330
 if (!$AsyncRetVal) {
  HEAP8[___async_retval >> 0] = 0; //@line 12335
  return;
 }
 dest = $2 + 4 | 0; //@line 12339
 stop = dest + 52 | 0; //@line 12339
 do {
  HEAP32[dest >> 2] = 0; //@line 12339
  dest = dest + 4 | 0; //@line 12339
 } while ((dest | 0) < (stop | 0));
 HEAP32[$2 >> 2] = $AsyncRetVal; //@line 12340
 HEAP32[$2 + 8 >> 2] = $4; //@line 12342
 HEAP32[$2 + 12 >> 2] = -1; //@line 12344
 HEAP32[$2 + 48 >> 2] = 1; //@line 12346
 $15 = HEAP32[(HEAP32[$AsyncRetVal >> 2] | 0) + 28 >> 2] | 0; //@line 12349
 $16 = HEAP32[$6 >> 2] | 0; //@line 12350
 $ReallocAsyncCtx = _emscripten_realloc_async_context(16) | 0; //@line 12351
 FUNCTION_TABLE_viiii[$15 & 3]($AsyncRetVal, $2, $16, 1); //@line 12352
 if (!___async) {
  ___async_unwind = 0; //@line 12355
 }
 HEAP32[$ReallocAsyncCtx >> 2] = 63; //@line 12357
 HEAP32[$ReallocAsyncCtx + 4 >> 2] = $2; //@line 12359
 HEAP32[$ReallocAsyncCtx + 8 >> 2] = $6; //@line 12361
 HEAP32[$ReallocAsyncCtx + 12 >> 2] = $2; //@line 12363
 sp = STACKTOP; //@line 12364
 return;
}
function _wcrtomb($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$0 = 0;
 do {
  if (!$0) {
   $$0 = 1; //@line 8519
  } else {
   if ($1 >>> 0 < 128) {
    HEAP8[$0 >> 0] = $1; //@line 8524
    $$0 = 1; //@line 8525
    break;
   }
   if (!(HEAP32[HEAP32[(___pthread_self_910() | 0) + 188 >> 2] >> 2] | 0)) {
    if (($1 & -128 | 0) == 57216) {
     HEAP8[$0 >> 0] = $1; //@line 8538
     $$0 = 1; //@line 8539
     break;
    } else {
     HEAP32[(___errno_location() | 0) >> 2] = 84; //@line 8543
     $$0 = -1; //@line 8544
     break;
    }
   }
   if ($1 >>> 0 < 2048) {
    HEAP8[$0 >> 0] = $1 >>> 6 | 192; //@line 8554
    HEAP8[$0 + 1 >> 0] = $1 & 63 | 128; //@line 8558
    $$0 = 2; //@line 8559
    break;
   }
   if ($1 >>> 0 < 55296 | ($1 & -8192 | 0) == 57344) {
    HEAP8[$0 >> 0] = $1 >>> 12 | 224; //@line 8571
    HEAP8[$0 + 1 >> 0] = $1 >>> 6 & 63 | 128; //@line 8577
    HEAP8[$0 + 2 >> 0] = $1 & 63 | 128; //@line 8581
    $$0 = 3; //@line 8582
    break;
   }
   if (($1 + -65536 | 0) >>> 0 < 1048576) {
    HEAP8[$0 >> 0] = $1 >>> 18 | 240; //@line 8592
    HEAP8[$0 + 1 >> 0] = $1 >>> 12 & 63 | 128; //@line 8598
    HEAP8[$0 + 2 >> 0] = $1 >>> 6 & 63 | 128; //@line 8604
    HEAP8[$0 + 3 >> 0] = $1 & 63 | 128; //@line 8608
    $$0 = 4; //@line 8609
    break;
   } else {
    HEAP32[(___errno_location() | 0) >> 2] = 84; //@line 8613
    $$0 = -1; //@line 8614
    break;
   }
  }
 } while (0);
 return $$0 | 0; //@line 8619
}
function _fmt_u($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$010$lcssa$off0 = 0, $$012 = 0, $$09$lcssa = 0, $$0914 = 0, $$1$lcssa = 0, $$111 = 0, $10 = 0, $26 = 0, $8 = 0, $9 = 0, $8$looptemp = 0;
 if ($1 >>> 0 > 0 | ($1 | 0) == 0 & $0 >>> 0 > 4294967295) {
  $$0914 = $2; //@line 7403
  $8 = $0; //@line 7403
  $9 = $1; //@line 7403
  while (1) {
   $10 = ___uremdi3($8 | 0, $9 | 0, 10, 0) | 0; //@line 7405
   $$0914 = $$0914 + -1 | 0; //@line 7409
   HEAP8[$$0914 >> 0] = $10 & 255 | 48; //@line 7410
   $8$looptemp = $8;
   $8 = ___udivdi3($8 | 0, $9 | 0, 10, 0) | 0; //@line 7411
   if (!($9 >>> 0 > 9 | ($9 | 0) == 9 & $8$looptemp >>> 0 > 4294967295)) {
    break;
   } else {
    $9 = tempRet0; //@line 7419
   }
  }
  $$010$lcssa$off0 = $8; //@line 7424
  $$09$lcssa = $$0914; //@line 7424
 } else {
  $$010$lcssa$off0 = $0; //@line 7426
  $$09$lcssa = $2; //@line 7426
 }
 if (!$$010$lcssa$off0) {
  $$1$lcssa = $$09$lcssa; //@line 7430
 } else {
  $$012 = $$010$lcssa$off0; //@line 7432
  $$111 = $$09$lcssa; //@line 7432
  while (1) {
   $26 = $$111 + -1 | 0; //@line 7437
   HEAP8[$26 >> 0] = ($$012 >>> 0) % 10 | 0 | 48; //@line 7438
   if ($$012 >>> 0 < 10) {
    $$1$lcssa = $26; //@line 7442
    break;
   } else {
    $$012 = ($$012 >>> 0) / 10 | 0; //@line 7445
    $$111 = $26; //@line 7445
   }
  }
 }
 return $$1$lcssa | 0; //@line 7449
}
function _strlen($0) {
 $0 = $0 | 0;
 var $$0 = 0, $$015$lcssa = 0, $$01519 = 0, $$1$lcssa = 0, $$pn = 0, $$sink = 0, $1 = 0, $10 = 0, $19 = 0, $23 = 0, $6 = 0, label = 0;
 $1 = $0; //@line 4905
 L1 : do {
  if (!($1 & 3)) {
   $$015$lcssa = $0; //@line 4910
   label = 4; //@line 4911
  } else {
   $$01519 = $0; //@line 4913
   $23 = $1; //@line 4913
   while (1) {
    if (!(HEAP8[$$01519 >> 0] | 0)) {
     $$sink = $23; //@line 4918
     break L1;
    }
    $6 = $$01519 + 1 | 0; //@line 4921
    $23 = $6; //@line 4922
    if (!($23 & 3)) {
     $$015$lcssa = $6; //@line 4926
     label = 4; //@line 4927
     break;
    } else {
     $$01519 = $6; //@line 4930
    }
   }
  }
 } while (0);
 if ((label | 0) == 4) {
  $$0 = $$015$lcssa; //@line 4936
  while (1) {
   $10 = HEAP32[$$0 >> 2] | 0; //@line 4938
   if (!(($10 & -2139062144 ^ -2139062144) & $10 + -16843009)) {
    $$0 = $$0 + 4 | 0; //@line 4946
   } else {
    break;
   }
  }
  if (!(($10 & 255) << 24 >> 24)) {
   $$1$lcssa = $$0; //@line 4954
  } else {
   $$pn = $$0; //@line 4956
   while (1) {
    $19 = $$pn + 1 | 0; //@line 4958
    if (!(HEAP8[$19 >> 0] | 0)) {
     $$1$lcssa = $19; //@line 4962
     break;
    } else {
     $$pn = $19; //@line 4965
    }
   }
  }
  $$sink = $$1$lcssa; //@line 4970
 }
 return $$sink - $1 | 0; //@line 4973
}
function __ZNK10__cxxabiv117__class_type_info29process_static_type_above_dstEPNS_19__dynamic_cast_infoEPKvS4_i($0, $1, $2, $3, $4) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 var $10 = 0, $11 = 0, $21 = 0, $22 = 0, $28 = 0, $30 = 0;
 HEAP8[$1 + 53 >> 0] = 1; //@line 9837
 do {
  if ((HEAP32[$1 + 4 >> 2] | 0) == ($3 | 0)) {
   HEAP8[$1 + 52 >> 0] = 1; //@line 9844
   $10 = $1 + 16 | 0; //@line 9845
   $11 = HEAP32[$10 >> 2] | 0; //@line 9846
   if (!$11) {
    HEAP32[$10 >> 2] = $2; //@line 9849
    HEAP32[$1 + 24 >> 2] = $4; //@line 9851
    HEAP32[$1 + 36 >> 2] = 1; //@line 9853
    if (!(($4 | 0) == 1 ? (HEAP32[$1 + 48 >> 2] | 0) == 1 : 0)) {
     break;
    }
    HEAP8[$1 + 54 >> 0] = 1; //@line 9863
    break;
   }
   if (($11 | 0) != ($2 | 0)) {
    $30 = $1 + 36 | 0; //@line 9868
    HEAP32[$30 >> 2] = (HEAP32[$30 >> 2] | 0) + 1; //@line 9871
    HEAP8[$1 + 54 >> 0] = 1; //@line 9873
    break;
   }
   $21 = $1 + 24 | 0; //@line 9876
   $22 = HEAP32[$21 >> 2] | 0; //@line 9877
   if (($22 | 0) == 2) {
    HEAP32[$21 >> 2] = $4; //@line 9880
    $28 = $4; //@line 9881
   } else {
    $28 = $22; //@line 9883
   }
   if (($28 | 0) == 1 ? (HEAP32[$1 + 48 >> 2] | 0) == 1 : 0) {
    HEAP8[$1 + 54 >> 0] = 1; //@line 9892
   }
  }
 } while (0);
 return;
}
function _mbed_vtracef__async_cb_6($0) {
 $0 = $0 | 0;
 var $$18 = 0, $10 = 0, $12 = 0, $16 = 0, $19 = 0, $2 = 0, $20 = 0, $23 = 0, $24 = 0, $4 = 0, $6 = 0, $ReallocAsyncCtx7 = 0, sp = 0;
 sp = STACKTOP; //@line 11132
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 11134
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 11136
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 11138
 $10 = HEAP8[$0 + 20 >> 0] & 1; //@line 11143
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 11145
 HEAP32[$2 >> 2] = HEAP32[___async_retval >> 2]; //@line 11150
 $16 = _snprintf($4, $6, 1025, $2) | 0; //@line 11151
 $$18 = ($16 | 0) >= ($6 | 0) ? 0 : $16; //@line 11153
 $19 = $4 + $$18 | 0; //@line 11155
 $20 = $6 - $$18 | 0; //@line 11156
 if (($$18 | 0) > 0) {
  if (!(($$18 | 0) < 1 | ($20 | 0) < 1 | $10 ^ 1)) {
   _snprintf($19, $20, 1103, $12) | 0; //@line 11164
  }
 }
 $23 = HEAP32[35] | 0; //@line 11167
 $24 = HEAP32[28] | 0; //@line 11168
 $ReallocAsyncCtx7 = _emscripten_realloc_async_context(4) | 0; //@line 11169
 FUNCTION_TABLE_vi[$23 & 127]($24); //@line 11170
 if (___async) {
  HEAP32[$ReallocAsyncCtx7 >> 2] = 18; //@line 11173
  sp = STACKTOP; //@line 11174
  return;
 }
 ___async_unwind = 0; //@line 11177
 HEAP32[$ReallocAsyncCtx7 >> 2] = 18; //@line 11178
 sp = STACKTOP; //@line 11179
 return;
}
function _puts($0) {
 $0 = $0 | 0;
 var $1 = 0, $11 = 0, $12 = 0, $17 = 0, $19 = 0, $22 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 9492
 $1 = HEAP32[40] | 0; //@line 9493
 if ((HEAP32[$1 + 76 >> 2] | 0) > -1) {
  $19 = ___lockfile($1) | 0; //@line 9499
 } else {
  $19 = 0; //@line 9501
 }
 do {
  if ((_fputs($0, $1) | 0) < 0) {
   $22 = -1; //@line 9507
  } else {
   if ((HEAP8[$1 + 75 >> 0] | 0) != 10) {
    $11 = $1 + 20 | 0; //@line 9513
    $12 = HEAP32[$11 >> 2] | 0; //@line 9514
    if ($12 >>> 0 < (HEAP32[$1 + 16 >> 2] | 0) >>> 0) {
     HEAP32[$11 >> 2] = $12 + 1; //@line 9520
     HEAP8[$12 >> 0] = 10; //@line 9521
     $22 = 0; //@line 9522
     break;
    }
   }
   $AsyncCtx = _emscripten_alloc_async_context(12, sp) | 0; //@line 9526
   $17 = ___overflow($1, 10) | 0; //@line 9527
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 61; //@line 9530
    HEAP32[$AsyncCtx + 4 >> 2] = $19; //@line 9532
    HEAP32[$AsyncCtx + 8 >> 2] = $1; //@line 9534
    sp = STACKTOP; //@line 9535
    return 0; //@line 9536
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 9538
    $22 = $17 >> 31; //@line 9540
    break;
   }
  }
 } while (0);
 if ($19 | 0) {
  ___unlockfile($1); //@line 9547
 }
 return $22 | 0; //@line 9549
}
function _main__async_cb($0) {
 $0 = $0 | 0;
 var $10 = 0, $11 = 0, $2 = 0, $4 = 0, $7 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 10320
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 10322
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 10324
 $7 = (_emscripten_asm_const_ii(4, HEAP32[1001] | 0) | 0) == 0 & 1; //@line 10328
 _emscripten_asm_const_iii(2, HEAP32[1001] | 0, $7 | 0) | 0; //@line 10330
 HEAP32[$2 >> 2] = _emscripten_asm_const_ii(4, HEAP32[1001] | 0) | 0; //@line 10333
 _printf(1356, $2) | 0; //@line 10334
 $ReallocAsyncCtx = _emscripten_realloc_async_context(12) | 0; //@line 10335
 _wait_ms(500); //@line 10336
 if (___async) {
  HEAP32[$ReallocAsyncCtx >> 2] = 47; //@line 10339
  $10 = $ReallocAsyncCtx + 4 | 0; //@line 10340
  HEAP32[$10 >> 2] = $2; //@line 10341
  $11 = $ReallocAsyncCtx + 8 | 0; //@line 10342
  HEAP32[$11 >> 2] = $4; //@line 10343
  sp = STACKTOP; //@line 10344
  return;
 }
 ___async_unwind = 0; //@line 10347
 HEAP32[$ReallocAsyncCtx >> 2] = 47; //@line 10348
 $10 = $ReallocAsyncCtx + 4 | 0; //@line 10349
 HEAP32[$10 >> 2] = $2; //@line 10350
 $11 = $ReallocAsyncCtx + 8 | 0; //@line 10351
 HEAP32[$11 >> 2] = $4; //@line 10352
 sp = STACKTOP; //@line 10353
 return;
}
function __ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb($0) {
 $0 = $0 | 0;
 var $$037$off038 = 0, $$037$off039 = 0, $12 = 0, $17 = 0, $4 = 0, $6 = 0, $8 = 0, label = 0;
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 12003
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 12005
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 12007
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 12011
 if (!(HEAP8[HEAP32[$0 + 4 >> 2] >> 0] | 0)) {
  $$037$off038 = 4; //@line 12015
  label = 4; //@line 12016
 } else {
  if (!(HEAP8[HEAP32[$0 + 20 >> 2] >> 0] | 0)) {
   $$037$off038 = 3; //@line 12021
   label = 4; //@line 12022
  } else {
   $$037$off039 = 3; //@line 12024
  }
 }
 if ((label | 0) == 4) {
  HEAP32[$6 >> 2] = $4; //@line 12028
  $17 = $8 + 40 | 0; //@line 12029
  HEAP32[$17 >> 2] = (HEAP32[$17 >> 2] | 0) + 1; //@line 12032
  if ((HEAP32[$8 + 36 >> 2] | 0) == 1) {
   if ((HEAP32[$8 + 24 >> 2] | 0) == 2) {
    HEAP8[$8 + 54 >> 0] = 1; //@line 12042
    $$037$off039 = $$037$off038; //@line 12043
   } else {
    $$037$off039 = $$037$off038; //@line 12045
   }
  } else {
   $$037$off039 = $$037$off038; //@line 12048
  }
 }
 HEAP32[$12 >> 2] = $$037$off039; //@line 12051
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
   __ZNK10__cxxabiv117__class_type_info29process_static_type_below_dstEPNS_19__dynamic_cast_infoEPKvi(0, $1, $2, $3); //@line 9696
  } else {
   if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 >> 2] | 0, $4) | 0) {
    if ((HEAP32[$1 + 16 >> 2] | 0) != ($2 | 0)) {
     $13 = $1 + 20 | 0; //@line 9705
     if ((HEAP32[$13 >> 2] | 0) != ($2 | 0)) {
      HEAP32[$1 + 32 >> 2] = $3; //@line 9710
      HEAP32[$13 >> 2] = $2; //@line 9711
      $19 = $1 + 40 | 0; //@line 9712
      HEAP32[$19 >> 2] = (HEAP32[$19 >> 2] | 0) + 1; //@line 9715
      if ((HEAP32[$1 + 36 >> 2] | 0) == 1) {
       if ((HEAP32[$1 + 24 >> 2] | 0) == 2) {
        HEAP8[$1 + 54 >> 0] = 1; //@line 9725
       }
      }
      HEAP32[$1 + 44 >> 2] = 4; //@line 9729
      break;
     }
    }
    if (($3 | 0) == 1) {
     HEAP32[$1 + 32 >> 2] = 1; //@line 9736
    }
   }
  }
 } while (0);
 return;
}
function ___strerror_l($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$012$lcssa = 0, $$01214 = 0, $$016 = 0, $$113 = 0, $$115 = 0, $7 = 0, label = 0, $$113$looptemp = 0;
 $$016 = 0; //@line 8639
 while (1) {
  if ((HEAPU8[1912 + $$016 >> 0] | 0) == ($0 | 0)) {
   label = 2; //@line 8646
   break;
  }
  $7 = $$016 + 1 | 0; //@line 8649
  if (($7 | 0) == 87) {
   $$01214 = 2e3; //@line 8652
   $$115 = 87; //@line 8652
   label = 5; //@line 8653
   break;
  } else {
   $$016 = $7; //@line 8656
  }
 }
 if ((label | 0) == 2) {
  if (!$$016) {
   $$012$lcssa = 2e3; //@line 8662
  } else {
   $$01214 = 2e3; //@line 8664
   $$115 = $$016; //@line 8664
   label = 5; //@line 8665
  }
 }
 if ((label | 0) == 5) {
  while (1) {
   label = 0; //@line 8670
   $$113 = $$01214; //@line 8671
   do {
    $$113$looptemp = $$113;
    $$113 = $$113 + 1 | 0; //@line 8675
   } while ((HEAP8[$$113$looptemp >> 0] | 0) != 0);
   $$115 = $$115 + -1 | 0; //@line 8682
   if (!$$115) {
    $$012$lcssa = $$113; //@line 8685
    break;
   } else {
    $$01214 = $$113; //@line 8688
    label = 5; //@line 8689
   }
  }
 }
 return ___lctrans($$012$lcssa, HEAP32[$1 + 20 >> 2] | 0) | 0; //@line 8696
}
function _strstr($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0 = 0, $2 = 0, $5 = 0;
 $2 = HEAP8[$1 >> 0] | 0; //@line 8712
 do {
  if (!($2 << 24 >> 24)) {
   $$0 = $0; //@line 8716
  } else {
   $5 = _strchr($0, $2 << 24 >> 24) | 0; //@line 8719
   if (!$5) {
    $$0 = 0; //@line 8722
   } else {
    if (!(HEAP8[$1 + 1 >> 0] | 0)) {
     $$0 = $5; //@line 8728
    } else {
     if (!(HEAP8[$5 + 1 >> 0] | 0)) {
      $$0 = 0; //@line 8734
     } else {
      if (!(HEAP8[$1 + 2 >> 0] | 0)) {
       $$0 = _twobyte_strstr($5, $1) | 0; //@line 8741
       break;
      }
      if (!(HEAP8[$5 + 2 >> 0] | 0)) {
       $$0 = 0; //@line 8748
      } else {
       if (!(HEAP8[$1 + 3 >> 0] | 0)) {
        $$0 = _threebyte_strstr($5, $1) | 0; //@line 8755
        break;
       }
       if (!(HEAP8[$5 + 3 >> 0] | 0)) {
        $$0 = 0; //@line 8762
       } else {
        if (!(HEAP8[$1 + 4 >> 0] | 0)) {
         $$0 = _fourbyte_strstr($5, $1) | 0; //@line 8769
         break;
        } else {
         $$0 = _twoway_strstr($5, $1) | 0; //@line 8773
         break;
        }
       }
      }
     }
    }
   }
  }
 } while (0);
 return $$0 | 0; //@line 8783
}
function _mbed_vtracef__async_cb_12($0) {
 $0 = $0 | 0;
 var $3 = 0, $5 = 0, $6 = 0, $7 = 0, $ReallocAsyncCtx2 = 0, $ReallocAsyncCtx4 = 0, sp = 0;
 sp = STACKTOP; //@line 11517
 $3 = HEAP32[36] | 0; //@line 11521
 if (HEAP8[$0 + 4 >> 0] & 1 & ($3 | 0) != 0) {
  $5 = HEAP32[28] | 0; //@line 11525
  $ReallocAsyncCtx2 = _emscripten_realloc_async_context(4) | 0; //@line 11526
  FUNCTION_TABLE_vi[$3 & 127]($5); //@line 11527
  if (___async) {
   HEAP32[$ReallocAsyncCtx2 >> 2] = 11; //@line 11530
   sp = STACKTOP; //@line 11531
   return;
  }
  ___async_unwind = 0; //@line 11534
  HEAP32[$ReallocAsyncCtx2 >> 2] = 11; //@line 11535
  sp = STACKTOP; //@line 11536
  return;
 } else {
  $6 = HEAP32[35] | 0; //@line 11539
  $7 = HEAP32[28] | 0; //@line 11540
  $ReallocAsyncCtx4 = _emscripten_realloc_async_context(4) | 0; //@line 11541
  FUNCTION_TABLE_vi[$6 & 127]($7); //@line 11542
  if (___async) {
   HEAP32[$ReallocAsyncCtx4 >> 2] = 13; //@line 11545
   sp = STACKTOP; //@line 11546
   return;
  }
  ___async_unwind = 0; //@line 11549
  HEAP32[$ReallocAsyncCtx4 >> 2] = 13; //@line 11550
  sp = STACKTOP; //@line 11551
  return;
 }
}
function _fourbyte_strstr($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$lcssa = 0, $$sink21$lcssa = 0, $$sink2123 = 0, $18 = 0, $32 = 0, $33 = 0, $35 = 0, $39 = 0, $40 = 0, $41 = 0;
 $18 = (HEAPU8[$1 + 1 >> 0] | 0) << 16 | (HEAPU8[$1 >> 0] | 0) << 24 | (HEAPU8[$1 + 2 >> 0] | 0) << 8 | (HEAPU8[$1 + 3 >> 0] | 0); //@line 8908
 $32 = $0 + 3 | 0; //@line 8922
 $33 = HEAP8[$32 >> 0] | 0; //@line 8923
 $35 = (HEAPU8[$0 + 1 >> 0] | 0) << 16 | (HEAPU8[$0 >> 0] | 0) << 24 | (HEAPU8[$0 + 2 >> 0] | 0) << 8 | $33 & 255; //@line 8925
 if ($33 << 24 >> 24 == 0 | ($35 | 0) == ($18 | 0)) {
  $$lcssa = $33; //@line 8930
  $$sink21$lcssa = $32; //@line 8930
 } else {
  $$sink2123 = $32; //@line 8932
  $39 = $35; //@line 8932
  while (1) {
   $40 = $$sink2123 + 1 | 0; //@line 8935
   $41 = HEAP8[$40 >> 0] | 0; //@line 8936
   $39 = $39 << 8 | $41 & 255; //@line 8938
   if ($41 << 24 >> 24 == 0 | ($39 | 0) == ($18 | 0)) {
    $$lcssa = $41; //@line 8943
    $$sink21$lcssa = $40; //@line 8943
    break;
   } else {
    $$sink2123 = $40; //@line 8946
   }
  }
 }
 return ($$lcssa << 24 >> 24 ? $$sink21$lcssa + -3 | 0 : 0) | 0; //@line 8953
}
function _invoke_ticker($0) {
 $0 = $0 | 0;
 var $2 = 0, $3 = 0, $7 = 0, $8 = 0, $AsyncCtx = 0, $AsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 1377
 $2 = $0 + 12 | 0; //@line 1379
 $3 = HEAP32[$2 >> 2] | 0; //@line 1380
 do {
  if (!$3) {
   $AsyncCtx2 = _emscripten_alloc_async_context(12, sp) | 0; //@line 1384
   _mbed_assert_internal(1197, 1202, 528); //@line 1385
   if (___async) {
    HEAP32[$AsyncCtx2 >> 2] = 44; //@line 1388
    HEAP32[$AsyncCtx2 + 4 >> 2] = $2; //@line 1390
    HEAP32[$AsyncCtx2 + 8 >> 2] = $0; //@line 1392
    sp = STACKTOP; //@line 1393
    return;
   } else {
    _emscripten_free_async_context($AsyncCtx2 | 0); //@line 1396
    $8 = HEAP32[$2 >> 2] | 0; //@line 1398
    break;
   }
  } else {
   $8 = $3; //@line 1402
  }
 } while (0);
 $7 = HEAP32[$8 >> 2] | 0; //@line 1405
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 1407
 FUNCTION_TABLE_vi[$7 & 127]($0); //@line 1408
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 45; //@line 1411
  sp = STACKTOP; //@line 1412
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 1415
  return;
 }
}
function _threebyte_strstr($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$016$lcssa = 0, $$01618 = 0, $$019 = 0, $$lcssa = 0, $14 = 0, $23 = 0, $24 = 0, $27 = 0, $30 = 0, $31 = 0;
 $14 = (HEAPU8[$1 + 1 >> 0] | 0) << 16 | (HEAPU8[$1 >> 0] | 0) << 24 | (HEAPU8[$1 + 2 >> 0] | 0) << 8; //@line 8842
 $23 = $0 + 2 | 0; //@line 8851
 $24 = HEAP8[$23 >> 0] | 0; //@line 8852
 $27 = (HEAPU8[$0 + 1 >> 0] | 0) << 16 | (HEAPU8[$0 >> 0] | 0) << 24 | ($24 & 255) << 8; //@line 8855
 if (($27 | 0) == ($14 | 0) | $24 << 24 >> 24 == 0) {
  $$016$lcssa = $23; //@line 8860
  $$lcssa = $24; //@line 8860
 } else {
  $$01618 = $23; //@line 8862
  $$019 = $27; //@line 8862
  while (1) {
   $30 = $$01618 + 1 | 0; //@line 8864
   $31 = HEAP8[$30 >> 0] | 0; //@line 8865
   $$019 = ($$019 | $31 & 255) << 8; //@line 8868
   if (($$019 | 0) == ($14 | 0) | $31 << 24 >> 24 == 0) {
    $$016$lcssa = $30; //@line 8873
    $$lcssa = $31; //@line 8873
    break;
   } else {
    $$01618 = $30; //@line 8876
   }
  }
 }
 return ($$lcssa << 24 >> 24 ? $$016$lcssa + -2 | 0 : 0) | 0; //@line 8883
}
function ___cxa_can_catch($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $3 = 0, $7 = 0, $8 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 10260
 STACKTOP = STACKTOP + 16 | 0; //@line 10261
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 10261
 $3 = sp; //@line 10262
 HEAP32[$3 >> 2] = HEAP32[$2 >> 2]; //@line 10264
 $7 = HEAP32[(HEAP32[$0 >> 2] | 0) + 16 >> 2] | 0; //@line 10267
 $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 10268
 $8 = FUNCTION_TABLE_iiii[$7 & 7]($0, $1, $3) | 0; //@line 10269
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 70; //@line 10272
  HEAP32[$AsyncCtx + 4 >> 2] = $3; //@line 10274
  HEAP32[$AsyncCtx + 8 >> 2] = $2; //@line 10276
  HEAP32[$AsyncCtx + 12 >> 2] = $3; //@line 10278
  sp = STACKTOP; //@line 10279
  STACKTOP = sp; //@line 10280
  return 0; //@line 10280
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 10282
 if ($8) {
  HEAP32[$2 >> 2] = HEAP32[$3 >> 2]; //@line 10286
 }
 STACKTOP = sp; //@line 10288
 return $8 & 1 | 0; //@line 10288
}
function _frexp($0, $1) {
 $0 = +$0;
 $1 = $1 | 0;
 var $$0 = 0.0, $$016 = 0.0, $2 = 0, $3 = 0, $4 = 0, $9 = 0.0, $storemerge = 0;
 HEAPF64[tempDoublePtr >> 3] = $0; //@line 8470
 $2 = HEAP32[tempDoublePtr >> 2] | 0; //@line 8470
 $3 = HEAP32[tempDoublePtr + 4 >> 2] | 0; //@line 8471
 $4 = _bitshift64Lshr($2 | 0, $3 | 0, 52) | 0; //@line 8472
 switch ($4 & 2047) {
 case 0:
  {
   if ($0 != 0.0) {
    $9 = +_frexp($0 * 18446744073709552000.0, $1); //@line 8481
    $$016 = $9; //@line 8484
    $storemerge = (HEAP32[$1 >> 2] | 0) + -64 | 0; //@line 8484
   } else {
    $$016 = $0; //@line 8486
    $storemerge = 0; //@line 8486
   }
   HEAP32[$1 >> 2] = $storemerge; //@line 8488
   $$0 = $$016; //@line 8489
   break;
  }
 case 2047:
  {
   $$0 = $0; //@line 8493
   break;
  }
 default:
  {
   HEAP32[$1 >> 2] = ($4 & 2047) + -1022; //@line 8499
   HEAP32[tempDoublePtr >> 2] = $2; //@line 8502
   HEAP32[tempDoublePtr + 4 >> 2] = $3 & -2146435073 | 1071644672; //@line 8502
   $$0 = +HEAPF64[tempDoublePtr >> 3]; //@line 8503
  }
 }
 return +$$0;
}
function _vfprintf__async_cb($0) {
 $0 = $0 | 0;
 var $$ = 0, $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $2 = 0, $20 = 0, $22 = 0, $33 = 0;
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 12855
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 12863
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 12865
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 12867
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 12869
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 12871
 $20 = HEAP32[$0 + 40 >> 2] | 0; //@line 12873
 $22 = HEAP32[$0 + 44 >> 2] | 0; //@line 12875
 $$ = (HEAP32[$2 >> 2] | 0) == 0 ? -1 : HEAP32[$0 + 8 >> 2] | 0; //@line 12886
 HEAP32[HEAP32[$0 + 16 >> 2] >> 2] = HEAP32[$0 + 12 >> 2]; //@line 12887
 HEAP32[$10 >> 2] = 0; //@line 12888
 HEAP32[$12 >> 2] = 0; //@line 12889
 HEAP32[$14 >> 2] = 0; //@line 12890
 HEAP32[$2 >> 2] = 0; //@line 12891
 $33 = HEAP32[$16 >> 2] | 0; //@line 12892
 HEAP32[$16 >> 2] = $33 | $18; //@line 12897
 if ($20 | 0) {
  ___unlockfile($22); //@line 12900
 }
 HEAP32[___async_retval >> 2] = ($33 & 32 | 0) == 0 ? $$ : -1; //@line 12903
 return;
}
function _mbed_vtracef__async_cb_9($0) {
 $0 = $0 | 0;
 var $$pre = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $ReallocAsyncCtx9 = 0, sp = 0;
 sp = STACKTOP; //@line 11248
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 11252
 if ((HEAP32[$0 + 4 >> 2] | 0) <= 2) {
  return;
 }
 $5 = $4 + -1 | 0; //@line 11257
 $$pre = HEAP32[38] | 0; //@line 11258
 $ReallocAsyncCtx9 = _emscripten_realloc_async_context(12) | 0; //@line 11259
 FUNCTION_TABLE_v[$$pre & 0](); //@line 11260
 if (___async) {
  HEAP32[$ReallocAsyncCtx9 >> 2] = 20; //@line 11263
  $6 = $ReallocAsyncCtx9 + 4 | 0; //@line 11264
  HEAP32[$6 >> 2] = $4; //@line 11265
  $7 = $ReallocAsyncCtx9 + 8 | 0; //@line 11266
  HEAP32[$7 >> 2] = $5; //@line 11267
  sp = STACKTOP; //@line 11268
  return;
 }
 ___async_unwind = 0; //@line 11271
 HEAP32[$ReallocAsyncCtx9 >> 2] = 20; //@line 11272
 $6 = $ReallocAsyncCtx9 + 4 | 0; //@line 11273
 HEAP32[$6 >> 2] = $4; //@line 11274
 $7 = $ReallocAsyncCtx9 + 8 | 0; //@line 11275
 HEAP32[$7 >> 2] = $5; //@line 11276
 sp = STACKTOP; //@line 11277
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
 sp = STACKTOP; //@line 10052
 do {
  if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, $5) | 0) {
   __ZNK10__cxxabiv117__class_type_info29process_static_type_above_dstEPNS_19__dynamic_cast_infoEPKvS4_i(0, $1, $2, $3, $4); //@line 10058
  } else {
   $10 = HEAP32[$0 + 8 >> 2] | 0; //@line 10061
   $13 = HEAP32[(HEAP32[$10 >> 2] | 0) + 20 >> 2] | 0; //@line 10064
   $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 10065
   FUNCTION_TABLE_viiiiii[$13 & 3]($10, $1, $2, $3, $4, $5); //@line 10066
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 66; //@line 10069
    sp = STACKTOP; //@line 10070
    return;
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 10073
    break;
   }
  }
 } while (0);
 return;
}
function _mbed_vtracef__async_cb_8($0) {
 $0 = $0 | 0;
 var $$pre = 0, $2 = 0, $4 = 0, $5 = 0, $6 = 0, $ReallocAsyncCtx9 = 0, sp = 0;
 sp = STACKTOP; //@line 11215
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 11217
 if (($2 | 0) <= 1) {
  return;
 }
 $4 = $2 + -1 | 0; //@line 11222
 $$pre = HEAP32[38] | 0; //@line 11223
 $ReallocAsyncCtx9 = _emscripten_realloc_async_context(12) | 0; //@line 11224
 FUNCTION_TABLE_v[$$pre & 0](); //@line 11225
 if (___async) {
  HEAP32[$ReallocAsyncCtx9 >> 2] = 20; //@line 11228
  $5 = $ReallocAsyncCtx9 + 4 | 0; //@line 11229
  HEAP32[$5 >> 2] = $2; //@line 11230
  $6 = $ReallocAsyncCtx9 + 8 | 0; //@line 11231
  HEAP32[$6 >> 2] = $4; //@line 11232
  sp = STACKTOP; //@line 11233
  return;
 }
 ___async_unwind = 0; //@line 11236
 HEAP32[$ReallocAsyncCtx9 >> 2] = 20; //@line 11237
 $5 = $ReallocAsyncCtx9 + 4 | 0; //@line 11238
 HEAP32[$5 >> 2] = $2; //@line 11239
 $6 = $ReallocAsyncCtx9 + 8 | 0; //@line 11240
 HEAP32[$6 >> 2] = $4; //@line 11241
 sp = STACKTOP; //@line 11242
 return;
}
function _main() {
 var $2 = 0, $AsyncCtx = 0, $vararg_buffer = 0, sp = 0;
 sp = STACKTOP; //@line 1454
 STACKTOP = STACKTOP + 16 | 0; //@line 1455
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 1455
 $vararg_buffer = sp; //@line 1456
 while (1) {
  $2 = (_emscripten_asm_const_ii(4, HEAP32[1001] | 0) | 0) == 0 & 1; //@line 1461
  _emscripten_asm_const_iii(2, HEAP32[1001] | 0, $2 | 0) | 0; //@line 1463
  HEAP32[$vararg_buffer >> 2] = _emscripten_asm_const_ii(4, HEAP32[1001] | 0) | 0; //@line 1466
  _printf(1356, $vararg_buffer) | 0; //@line 1467
  $AsyncCtx = _emscripten_alloc_async_context(12, sp) | 0; //@line 1468
  _wait_ms(500); //@line 1469
  if (___async) {
   break;
  }
  _emscripten_free_async_context($AsyncCtx | 0); //@line 1474
 }
 HEAP32[$AsyncCtx >> 2] = 47; //@line 1476
 HEAP32[$AsyncCtx + 4 >> 2] = $vararg_buffer; //@line 1478
 HEAP32[$AsyncCtx + 8 >> 2] = $vararg_buffer; //@line 1480
 sp = STACKTOP; //@line 1481
 STACKTOP = sp; //@line 1482
 return 0; //@line 1482
}
function __ZNK10__cxxabiv120__si_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $11 = 0, $8 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 10221
 do {
  if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, 0) | 0) {
   __ZNK10__cxxabiv117__class_type_info24process_found_base_classEPNS_19__dynamic_cast_infoEPvi(0, $1, $2, $3); //@line 10227
  } else {
   $8 = HEAP32[$0 + 8 >> 2] | 0; //@line 10230
   $11 = HEAP32[(HEAP32[$8 >> 2] | 0) + 28 >> 2] | 0; //@line 10233
   $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 10234
   FUNCTION_TABLE_viiii[$11 & 3]($8, $1, $2, $3); //@line 10235
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 69; //@line 10238
    sp = STACKTOP; //@line 10239
    return;
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 10242
    break;
   }
  }
 } while (0);
 return;
}
function _mbed_error_vfprintf__async_cb_36($0) {
 $0 = $0 | 0;
 var $10 = 0, $2 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 12685
 $2 = HEAP8[$0 + 4 >> 0] | 0; //@line 12687
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 12689
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 12691
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 12693
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 12695
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(24) | 0; //@line 12697
 _serial_putc(3996, $2 << 24 >> 24); //@line 12698
 if (!___async) {
  ___async_unwind = 0; //@line 12701
 }
 HEAP32[$ReallocAsyncCtx2 >> 2] = 41; //@line 12703
 HEAP32[$ReallocAsyncCtx2 + 4 >> 2] = $4; //@line 12705
 HEAP32[$ReallocAsyncCtx2 + 8 >> 2] = $6; //@line 12707
 HEAP32[$ReallocAsyncCtx2 + 12 >> 2] = $8; //@line 12709
 HEAP8[$ReallocAsyncCtx2 + 16 >> 0] = $2; //@line 12711
 HEAP32[$ReallocAsyncCtx2 + 20 >> 2] = $10; //@line 12713
 sp = STACKTOP; //@line 12714
 return;
}
function ___dynamic_cast__async_cb_34($0) {
 $0 = $0 | 0;
 var $$0 = 0, $10 = 0, $16 = 0, $6 = 0, $8 = 0;
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 12431
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 12433
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 12435
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 12441
 L2 : do {
  switch (HEAP32[HEAP32[$0 + 4 >> 2] >> 2] | 0) {
  case 0:
   {
    $$0 = (HEAP32[$6 >> 2] | 0) == 1 & (HEAP32[$8 >> 2] | 0) == 1 & (HEAP32[$10 >> 2] | 0) == 1 ? HEAP32[HEAP32[$0 + 24 >> 2] >> 2] | 0 : 0; //@line 12456
    break;
   }
  case 1:
   {
    if ((HEAP32[HEAP32[$0 + 28 >> 2] >> 2] | 0) != 1) {
     if (!((HEAP32[$6 >> 2] | 0) == 0 & (HEAP32[$8 >> 2] | 0) == 1 & (HEAP32[$10 >> 2] | 0) == 1)) {
      $$0 = 0; //@line 12472
      break L2;
     }
    }
    $$0 = HEAP32[$16 >> 2] | 0; //@line 12477
    break;
   }
  default:
   {
    $$0 = 0; //@line 12481
   }
  }
 } while (0);
 HEAP32[___async_retval >> 2] = $$0; //@line 12486
 return;
}
function _pad_676($0, $1, $2, $3, $4) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 var $$0$lcssa = 0, $$011 = 0, $14 = 0, $5 = 0, $9 = 0, sp = 0;
 sp = STACKTOP; //@line 7468
 STACKTOP = STACKTOP + 256 | 0; //@line 7469
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(256); //@line 7469
 $5 = sp; //@line 7470
 if (($2 | 0) > ($3 | 0) & ($4 & 73728 | 0) == 0) {
  $9 = $2 - $3 | 0; //@line 7476
  _memset($5 | 0, $1 << 24 >> 24 | 0, ($9 >>> 0 < 256 ? $9 : 256) | 0) | 0; //@line 7480
  if ($9 >>> 0 > 255) {
   $14 = $2 - $3 | 0; //@line 7483
   $$011 = $9; //@line 7484
   do {
    _out_670($0, $5, 256); //@line 7486
    $$011 = $$011 + -256 | 0; //@line 7487
   } while ($$011 >>> 0 > 255);
   $$0$lcssa = $14 & 255; //@line 7496
  } else {
   $$0$lcssa = $9; //@line 7498
  }
  _out_670($0, $5, $$0$lcssa); //@line 7500
 }
 STACKTOP = sp; //@line 7502
 return;
}
function ___stdio_seek($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $10 = 0, $3 = 0, $vararg_buffer = 0, sp = 0;
 sp = STACKTOP; //@line 4763
 STACKTOP = STACKTOP + 32 | 0; //@line 4764
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(32); //@line 4764
 $vararg_buffer = sp; //@line 4765
 $3 = sp + 20 | 0; //@line 4766
 HEAP32[$vararg_buffer >> 2] = HEAP32[$0 + 60 >> 2]; //@line 4770
 HEAP32[$vararg_buffer + 4 >> 2] = 0; //@line 4772
 HEAP32[$vararg_buffer + 8 >> 2] = $1; //@line 4774
 HEAP32[$vararg_buffer + 12 >> 2] = $3; //@line 4776
 HEAP32[$vararg_buffer + 16 >> 2] = $2; //@line 4778
 if ((___syscall_ret(___syscall140(140, $vararg_buffer | 0) | 0) | 0) < 0) {
  HEAP32[$3 >> 2] = -1; //@line 4783
  $10 = -1; //@line 4784
 } else {
  $10 = HEAP32[$3 >> 2] | 0; //@line 4787
 }
 STACKTOP = sp; //@line 4789
 return $10 | 0; //@line 4789
}
function _mbed_assert_internal($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $AsyncCtx = 0, $vararg_buffer = 0, sp = 0;
 sp = STACKTOP; //@line 852
 STACKTOP = STACKTOP + 16 | 0; //@line 853
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 853
 $vararg_buffer = sp; //@line 854
 HEAP32[$vararg_buffer >> 2] = $0; //@line 855
 HEAP32[$vararg_buffer + 4 >> 2] = $1; //@line 857
 HEAP32[$vararg_buffer + 8 >> 2] = $2; //@line 859
 _mbed_error_printf(1108, $vararg_buffer); //@line 860
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 861
 _mbed_die(); //@line 862
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 21; //@line 865
  sp = STACKTOP; //@line 866
  STACKTOP = sp; //@line 867
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 869
  STACKTOP = sp; //@line 870
  return;
 }
}
function _snprintf($0, $1, $2, $varargs) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $varargs = $varargs | 0;
 var $3 = 0, $4 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 9347
 STACKTOP = STACKTOP + 16 | 0; //@line 9348
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 9348
 $3 = sp; //@line 9349
 HEAP32[$3 >> 2] = $varargs; //@line 9350
 $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 9351
 $4 = _vsnprintf($0, $1, $2, $3) | 0; //@line 9352
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 58; //@line 9355
  HEAP32[$AsyncCtx + 4 >> 2] = $3; //@line 9357
  sp = STACKTOP; //@line 9358
  STACKTOP = sp; //@line 9359
  return 0; //@line 9359
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 9361
  STACKTOP = sp; //@line 9362
  return $4 | 0; //@line 9362
 }
 return 0; //@line 9364
}
function _printf($0, $varargs) {
 $0 = $0 | 0;
 $varargs = $varargs | 0;
 var $1 = 0, $2 = 0, $3 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 9468
 STACKTOP = STACKTOP + 16 | 0; //@line 9469
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 9469
 $1 = sp; //@line 9470
 HEAP32[$1 >> 2] = $varargs; //@line 9471
 $2 = HEAP32[40] | 0; //@line 9472
 $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 9473
 $3 = _vfprintf($2, $0, $1) | 0; //@line 9474
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 60; //@line 9477
  HEAP32[$AsyncCtx + 4 >> 2] = $1; //@line 9479
  sp = STACKTOP; //@line 9480
  STACKTOP = sp; //@line 9481
  return 0; //@line 9481
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 9483
  STACKTOP = sp; //@line 9484
  return $3 | 0; //@line 9484
 }
 return 0; //@line 9486
}
function _mbed_vtracef__async_cb_7($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $5 = 0, $ReallocAsyncCtx8 = 0, sp = 0;
 sp = STACKTOP; //@line 11185
 HEAP32[32] = HEAP32[30]; //@line 11187
 $2 = HEAP32[38] | 0; //@line 11188
 if (!$2) {
  return;
 }
 $4 = HEAP32[39] | 0; //@line 11193
 HEAP32[39] = 0; //@line 11194
 $ReallocAsyncCtx8 = _emscripten_realloc_async_context(8) | 0; //@line 11195
 FUNCTION_TABLE_v[$2 & 0](); //@line 11196
 if (___async) {
  HEAP32[$ReallocAsyncCtx8 >> 2] = 19; //@line 11199
  $5 = $ReallocAsyncCtx8 + 4 | 0; //@line 11200
  HEAP32[$5 >> 2] = $4; //@line 11201
  sp = STACKTOP; //@line 11202
  return;
 }
 ___async_unwind = 0; //@line 11205
 HEAP32[$ReallocAsyncCtx8 >> 2] = 19; //@line 11206
 $5 = $ReallocAsyncCtx8 + 4 | 0; //@line 11207
 HEAP32[$5 >> 2] = $4; //@line 11208
 sp = STACKTOP; //@line 11209
 return;
}
function _mbed_vtracef__async_cb_4($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $5 = 0, $ReallocAsyncCtx8 = 0, sp = 0;
 sp = STACKTOP; //@line 10921
 HEAP32[32] = HEAP32[30]; //@line 10923
 $2 = HEAP32[38] | 0; //@line 10924
 if (!$2) {
  return;
 }
 $4 = HEAP32[39] | 0; //@line 10929
 HEAP32[39] = 0; //@line 10930
 $ReallocAsyncCtx8 = _emscripten_realloc_async_context(8) | 0; //@line 10931
 FUNCTION_TABLE_v[$2 & 0](); //@line 10932
 if (___async) {
  HEAP32[$ReallocAsyncCtx8 >> 2] = 19; //@line 10935
  $5 = $ReallocAsyncCtx8 + 4 | 0; //@line 10936
  HEAP32[$5 >> 2] = $4; //@line 10937
  sp = STACKTOP; //@line 10938
  return;
 }
 ___async_unwind = 0; //@line 10941
 HEAP32[$ReallocAsyncCtx8 >> 2] = 19; //@line 10942
 $5 = $ReallocAsyncCtx8 + 4 | 0; //@line 10943
 HEAP32[$5 >> 2] = $4; //@line 10944
 sp = STACKTOP; //@line 10945
 return;
}
function _mbed_vtracef__async_cb_3($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $5 = 0, $ReallocAsyncCtx8 = 0, sp = 0;
 sp = STACKTOP; //@line 10891
 HEAP32[32] = HEAP32[30]; //@line 10893
 $2 = HEAP32[38] | 0; //@line 10894
 if (!$2) {
  return;
 }
 $4 = HEAP32[39] | 0; //@line 10899
 HEAP32[39] = 0; //@line 10900
 $ReallocAsyncCtx8 = _emscripten_realloc_async_context(8) | 0; //@line 10901
 FUNCTION_TABLE_v[$2 & 0](); //@line 10902
 if (___async) {
  HEAP32[$ReallocAsyncCtx8 >> 2] = 19; //@line 10905
  $5 = $ReallocAsyncCtx8 + 4 | 0; //@line 10906
  HEAP32[$5 >> 2] = $4; //@line 10907
  sp = STACKTOP; //@line 10908
  return;
 }
 ___async_unwind = 0; //@line 10911
 HEAP32[$ReallocAsyncCtx8 >> 2] = 19; //@line 10912
 $5 = $ReallocAsyncCtx8 + 4 | 0; //@line 10913
 HEAP32[$5 >> 2] = $4; //@line 10914
 sp = STACKTOP; //@line 10915
 return;
}
function __ZNK10__cxxabiv117__class_type_info24process_found_base_classEPNS_19__dynamic_cast_infoEPvi($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $10 = 0, $13 = 0, $4 = 0, $5 = 0;
 $4 = $1 + 16 | 0; //@line 9774
 $5 = HEAP32[$4 >> 2] | 0; //@line 9775
 do {
  if (!$5) {
   HEAP32[$4 >> 2] = $2; //@line 9779
   HEAP32[$1 + 24 >> 2] = $3; //@line 9781
   HEAP32[$1 + 36 >> 2] = 1; //@line 9783
  } else {
   if (($5 | 0) != ($2 | 0)) {
    $13 = $1 + 36 | 0; //@line 9787
    HEAP32[$13 >> 2] = (HEAP32[$13 >> 2] | 0) + 1; //@line 9790
    HEAP32[$1 + 24 >> 2] = 2; //@line 9792
    HEAP8[$1 + 54 >> 0] = 1; //@line 9794
    break;
   }
   $10 = $1 + 24 | 0; //@line 9797
   if ((HEAP32[$10 >> 2] | 0) == 2) {
    HEAP32[$10 >> 2] = $3; //@line 9801
   }
  }
 } while (0);
 return;
}
function _strcmp($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$011 = 0, $$0710 = 0, $$lcssa = 0, $$lcssa8 = 0, $2 = 0, $3 = 0, $8 = 0, $9 = 0;
 $2 = HEAP8[$0 >> 0] | 0; //@line 4870
 $3 = HEAP8[$1 >> 0] | 0; //@line 4871
 if ($2 << 24 >> 24 == 0 ? 1 : $2 << 24 >> 24 != $3 << 24 >> 24) {
  $$lcssa = $3; //@line 4876
  $$lcssa8 = $2; //@line 4876
 } else {
  $$011 = $1; //@line 4878
  $$0710 = $0; //@line 4878
  do {
   $$0710 = $$0710 + 1 | 0; //@line 4880
   $$011 = $$011 + 1 | 0; //@line 4881
   $8 = HEAP8[$$0710 >> 0] | 0; //@line 4882
   $9 = HEAP8[$$011 >> 0] | 0; //@line 4883
  } while (!($8 << 24 >> 24 == 0 ? 1 : $8 << 24 >> 24 != $9 << 24 >> 24));
  $$lcssa = $9; //@line 4888
  $$lcssa8 = $8; //@line 4888
 }
 return ($$lcssa8 & 255) - ($$lcssa & 255) | 0; //@line 4898
}
function _serial_putc($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $2 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 1349
 $2 = HEAP32[40] | 0; //@line 1350
 $AsyncCtx3 = _emscripten_alloc_async_context(8, sp) | 0; //@line 1351
 _putc($1, $2) | 0; //@line 1352
 if (___async) {
  HEAP32[$AsyncCtx3 >> 2] = 42; //@line 1355
  HEAP32[$AsyncCtx3 + 4 >> 2] = $2; //@line 1357
  sp = STACKTOP; //@line 1358
  return;
 }
 _emscripten_free_async_context($AsyncCtx3 | 0); //@line 1361
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 1362
 _fflush($2) | 0; //@line 1363
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 43; //@line 1366
  sp = STACKTOP; //@line 1367
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 1370
  return;
 }
}
function _mbed_die__async_cb_27($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx15 = 0, sp = 0;
 sp = STACKTOP; //@line 11961
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 11963
 _emscripten_asm_const_iii(2, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 11965
 $ReallocAsyncCtx15 = _emscripten_realloc_async_context(8) | 0; //@line 11966
 _wait_ms(150); //@line 11967
 if (___async) {
  HEAP32[$ReallocAsyncCtx15 >> 2] = 23; //@line 11970
  $4 = $ReallocAsyncCtx15 + 4 | 0; //@line 11971
  HEAP32[$4 >> 2] = $2; //@line 11972
  sp = STACKTOP; //@line 11973
  return;
 }
 ___async_unwind = 0; //@line 11976
 HEAP32[$ReallocAsyncCtx15 >> 2] = 23; //@line 11977
 $4 = $ReallocAsyncCtx15 + 4 | 0; //@line 11978
 HEAP32[$4 >> 2] = $2; //@line 11979
 sp = STACKTOP; //@line 11980
 return;
}
function _mbed_die__async_cb_26($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx14 = 0, sp = 0;
 sp = STACKTOP; //@line 11936
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 11938
 _emscripten_asm_const_iii(2, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 11940
 $ReallocAsyncCtx14 = _emscripten_realloc_async_context(8) | 0; //@line 11941
 _wait_ms(150); //@line 11942
 if (___async) {
  HEAP32[$ReallocAsyncCtx14 >> 2] = 24; //@line 11945
  $4 = $ReallocAsyncCtx14 + 4 | 0; //@line 11946
  HEAP32[$4 >> 2] = $2; //@line 11947
  sp = STACKTOP; //@line 11948
  return;
 }
 ___async_unwind = 0; //@line 11951
 HEAP32[$ReallocAsyncCtx14 >> 2] = 24; //@line 11952
 $4 = $ReallocAsyncCtx14 + 4 | 0; //@line 11953
 HEAP32[$4 >> 2] = $2; //@line 11954
 sp = STACKTOP; //@line 11955
 return;
}
function _mbed_die__async_cb_25($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx13 = 0, sp = 0;
 sp = STACKTOP; //@line 11911
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 11913
 _emscripten_asm_const_iii(2, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 11915
 $ReallocAsyncCtx13 = _emscripten_realloc_async_context(8) | 0; //@line 11916
 _wait_ms(150); //@line 11917
 if (___async) {
  HEAP32[$ReallocAsyncCtx13 >> 2] = 25; //@line 11920
  $4 = $ReallocAsyncCtx13 + 4 | 0; //@line 11921
  HEAP32[$4 >> 2] = $2; //@line 11922
  sp = STACKTOP; //@line 11923
  return;
 }
 ___async_unwind = 0; //@line 11926
 HEAP32[$ReallocAsyncCtx13 >> 2] = 25; //@line 11927
 $4 = $ReallocAsyncCtx13 + 4 | 0; //@line 11928
 HEAP32[$4 >> 2] = $2; //@line 11929
 sp = STACKTOP; //@line 11930
 return;
}
function _mbed_die__async_cb_24($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx12 = 0, sp = 0;
 sp = STACKTOP; //@line 11886
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 11888
 _emscripten_asm_const_iii(2, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 11890
 $ReallocAsyncCtx12 = _emscripten_realloc_async_context(8) | 0; //@line 11891
 _wait_ms(150); //@line 11892
 if (___async) {
  HEAP32[$ReallocAsyncCtx12 >> 2] = 26; //@line 11895
  $4 = $ReallocAsyncCtx12 + 4 | 0; //@line 11896
  HEAP32[$4 >> 2] = $2; //@line 11897
  sp = STACKTOP; //@line 11898
  return;
 }
 ___async_unwind = 0; //@line 11901
 HEAP32[$ReallocAsyncCtx12 >> 2] = 26; //@line 11902
 $4 = $ReallocAsyncCtx12 + 4 | 0; //@line 11903
 HEAP32[$4 >> 2] = $2; //@line 11904
 sp = STACKTOP; //@line 11905
 return;
}
function _mbed_die__async_cb_23($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx11 = 0, sp = 0;
 sp = STACKTOP; //@line 11861
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 11863
 _emscripten_asm_const_iii(2, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 11865
 $ReallocAsyncCtx11 = _emscripten_realloc_async_context(8) | 0; //@line 11866
 _wait_ms(150); //@line 11867
 if (___async) {
  HEAP32[$ReallocAsyncCtx11 >> 2] = 27; //@line 11870
  $4 = $ReallocAsyncCtx11 + 4 | 0; //@line 11871
  HEAP32[$4 >> 2] = $2; //@line 11872
  sp = STACKTOP; //@line 11873
  return;
 }
 ___async_unwind = 0; //@line 11876
 HEAP32[$ReallocAsyncCtx11 >> 2] = 27; //@line 11877
 $4 = $ReallocAsyncCtx11 + 4 | 0; //@line 11878
 HEAP32[$4 >> 2] = $2; //@line 11879
 sp = STACKTOP; //@line 11880
 return;
}
function _mbed_die__async_cb_22($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx10 = 0, sp = 0;
 sp = STACKTOP; //@line 11836
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 11838
 _emscripten_asm_const_iii(2, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 11840
 $ReallocAsyncCtx10 = _emscripten_realloc_async_context(8) | 0; //@line 11841
 _wait_ms(150); //@line 11842
 if (___async) {
  HEAP32[$ReallocAsyncCtx10 >> 2] = 28; //@line 11845
  $4 = $ReallocAsyncCtx10 + 4 | 0; //@line 11846
  HEAP32[$4 >> 2] = $2; //@line 11847
  sp = STACKTOP; //@line 11848
  return;
 }
 ___async_unwind = 0; //@line 11851
 HEAP32[$ReallocAsyncCtx10 >> 2] = 28; //@line 11852
 $4 = $ReallocAsyncCtx10 + 4 | 0; //@line 11853
 HEAP32[$4 >> 2] = $2; //@line 11854
 sp = STACKTOP; //@line 11855
 return;
}
function _memcmp($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$01318 = 0, $$01417 = 0, $$019 = 0, $14 = 0, $4 = 0, $5 = 0;
 L1 : do {
  if (!$2) {
   $14 = 0; //@line 9312
  } else {
   $$01318 = $0; //@line 9314
   $$01417 = $2; //@line 9314
   $$019 = $1; //@line 9314
   while (1) {
    $4 = HEAP8[$$01318 >> 0] | 0; //@line 9316
    $5 = HEAP8[$$019 >> 0] | 0; //@line 9317
    if ($4 << 24 >> 24 != $5 << 24 >> 24) {
     break;
    }
    $$01417 = $$01417 + -1 | 0; //@line 9322
    if (!$$01417) {
     $14 = 0; //@line 9327
     break L1;
    } else {
     $$01318 = $$01318 + 1 | 0; //@line 9330
     $$019 = $$019 + 1 | 0; //@line 9330
    }
   }
   $14 = ($4 & 255) - ($5 & 255) | 0; //@line 9336
  }
 } while (0);
 return $14 | 0; //@line 9339
}
function _mbed_die__async_cb($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx16 = 0, sp = 0;
 sp = STACKTOP; //@line 11586
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 11588
 _emscripten_asm_const_iii(2, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 11590
 $ReallocAsyncCtx16 = _emscripten_realloc_async_context(8) | 0; //@line 11591
 _wait_ms(150); //@line 11592
 if (___async) {
  HEAP32[$ReallocAsyncCtx16 >> 2] = 22; //@line 11595
  $4 = $ReallocAsyncCtx16 + 4 | 0; //@line 11596
  HEAP32[$4 >> 2] = $2; //@line 11597
  sp = STACKTOP; //@line 11598
  return;
 }
 ___async_unwind = 0; //@line 11601
 HEAP32[$ReallocAsyncCtx16 >> 2] = 22; //@line 11602
 $4 = $ReallocAsyncCtx16 + 4 | 0; //@line 11603
 HEAP32[$4 >> 2] = $2; //@line 11604
 sp = STACKTOP; //@line 11605
 return;
}
function ___stdout_write($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $14 = 0, $vararg_buffer = 0, sp = 0;
 sp = STACKTOP; //@line 4822
 STACKTOP = STACKTOP + 32 | 0; //@line 4823
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(32); //@line 4823
 $vararg_buffer = sp; //@line 4824
 HEAP32[$0 + 36 >> 2] = 5; //@line 4827
 if (!(HEAP32[$0 >> 2] & 64)) {
  HEAP32[$vararg_buffer >> 2] = HEAP32[$0 + 60 >> 2]; //@line 4835
  HEAP32[$vararg_buffer + 4 >> 2] = 21523; //@line 4837
  HEAP32[$vararg_buffer + 8 >> 2] = sp + 16; //@line 4839
  if (___syscall54(54, $vararg_buffer | 0) | 0) {
   HEAP8[$0 + 75 >> 0] = -1; //@line 4844
  }
 }
 $14 = ___stdio_write($0, $1, $2) | 0; //@line 4847
 STACKTOP = sp; //@line 4848
 return $14 | 0; //@line 4848
}
function _mbed_die__async_cb_21($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx9 = 0, sp = 0;
 sp = STACKTOP; //@line 11811
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 11813
 _emscripten_asm_const_iii(2, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 11815
 $ReallocAsyncCtx9 = _emscripten_realloc_async_context(8) | 0; //@line 11816
 _wait_ms(150); //@line 11817
 if (___async) {
  HEAP32[$ReallocAsyncCtx9 >> 2] = 29; //@line 11820
  $4 = $ReallocAsyncCtx9 + 4 | 0; //@line 11821
  HEAP32[$4 >> 2] = $2; //@line 11822
  sp = STACKTOP; //@line 11823
  return;
 }
 ___async_unwind = 0; //@line 11826
 HEAP32[$ReallocAsyncCtx9 >> 2] = 29; //@line 11827
 $4 = $ReallocAsyncCtx9 + 4 | 0; //@line 11828
 HEAP32[$4 >> 2] = $2; //@line 11829
 sp = STACKTOP; //@line 11830
 return;
}
function _mbed_die__async_cb_20($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx8 = 0, sp = 0;
 sp = STACKTOP; //@line 11786
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 11788
 _emscripten_asm_const_iii(2, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 11790
 $ReallocAsyncCtx8 = _emscripten_realloc_async_context(8) | 0; //@line 11791
 _wait_ms(400); //@line 11792
 if (___async) {
  HEAP32[$ReallocAsyncCtx8 >> 2] = 30; //@line 11795
  $4 = $ReallocAsyncCtx8 + 4 | 0; //@line 11796
  HEAP32[$4 >> 2] = $2; //@line 11797
  sp = STACKTOP; //@line 11798
  return;
 }
 ___async_unwind = 0; //@line 11801
 HEAP32[$ReallocAsyncCtx8 >> 2] = 30; //@line 11802
 $4 = $ReallocAsyncCtx8 + 4 | 0; //@line 11803
 HEAP32[$4 >> 2] = $2; //@line 11804
 sp = STACKTOP; //@line 11805
 return;
}
function _mbed_die__async_cb_19($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx7 = 0, sp = 0;
 sp = STACKTOP; //@line 11761
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 11763
 _emscripten_asm_const_iii(2, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 11765
 $ReallocAsyncCtx7 = _emscripten_realloc_async_context(8) | 0; //@line 11766
 _wait_ms(400); //@line 11767
 if (___async) {
  HEAP32[$ReallocAsyncCtx7 >> 2] = 31; //@line 11770
  $4 = $ReallocAsyncCtx7 + 4 | 0; //@line 11771
  HEAP32[$4 >> 2] = $2; //@line 11772
  sp = STACKTOP; //@line 11773
  return;
 }
 ___async_unwind = 0; //@line 11776
 HEAP32[$ReallocAsyncCtx7 >> 2] = 31; //@line 11777
 $4 = $ReallocAsyncCtx7 + 4 | 0; //@line 11778
 HEAP32[$4 >> 2] = $2; //@line 11779
 sp = STACKTOP; //@line 11780
 return;
}
function _mbed_die__async_cb_18($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx6 = 0, sp = 0;
 sp = STACKTOP; //@line 11736
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 11738
 _emscripten_asm_const_iii(2, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 11740
 $ReallocAsyncCtx6 = _emscripten_realloc_async_context(8) | 0; //@line 11741
 _wait_ms(400); //@line 11742
 if (___async) {
  HEAP32[$ReallocAsyncCtx6 >> 2] = 32; //@line 11745
  $4 = $ReallocAsyncCtx6 + 4 | 0; //@line 11746
  HEAP32[$4 >> 2] = $2; //@line 11747
  sp = STACKTOP; //@line 11748
  return;
 }
 ___async_unwind = 0; //@line 11751
 HEAP32[$ReallocAsyncCtx6 >> 2] = 32; //@line 11752
 $4 = $ReallocAsyncCtx6 + 4 | 0; //@line 11753
 HEAP32[$4 >> 2] = $2; //@line 11754
 sp = STACKTOP; //@line 11755
 return;
}
function _mbed_die__async_cb_17($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx5 = 0, sp = 0;
 sp = STACKTOP; //@line 11711
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 11713
 _emscripten_asm_const_iii(2, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 11715
 $ReallocAsyncCtx5 = _emscripten_realloc_async_context(8) | 0; //@line 11716
 _wait_ms(400); //@line 11717
 if (___async) {
  HEAP32[$ReallocAsyncCtx5 >> 2] = 33; //@line 11720
  $4 = $ReallocAsyncCtx5 + 4 | 0; //@line 11721
  HEAP32[$4 >> 2] = $2; //@line 11722
  sp = STACKTOP; //@line 11723
  return;
 }
 ___async_unwind = 0; //@line 11726
 HEAP32[$ReallocAsyncCtx5 >> 2] = 33; //@line 11727
 $4 = $ReallocAsyncCtx5 + 4 | 0; //@line 11728
 HEAP32[$4 >> 2] = $2; //@line 11729
 sp = STACKTOP; //@line 11730
 return;
}
function _mbed_die__async_cb_16($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx4 = 0, sp = 0;
 sp = STACKTOP; //@line 11686
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 11688
 _emscripten_asm_const_iii(2, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 11690
 $ReallocAsyncCtx4 = _emscripten_realloc_async_context(8) | 0; //@line 11691
 _wait_ms(400); //@line 11692
 if (___async) {
  HEAP32[$ReallocAsyncCtx4 >> 2] = 34; //@line 11695
  $4 = $ReallocAsyncCtx4 + 4 | 0; //@line 11696
  HEAP32[$4 >> 2] = $2; //@line 11697
  sp = STACKTOP; //@line 11698
  return;
 }
 ___async_unwind = 0; //@line 11701
 HEAP32[$ReallocAsyncCtx4 >> 2] = 34; //@line 11702
 $4 = $ReallocAsyncCtx4 + 4 | 0; //@line 11703
 HEAP32[$4 >> 2] = $2; //@line 11704
 sp = STACKTOP; //@line 11705
 return;
}
function _mbed_die__async_cb_15($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 11661
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 11663
 _emscripten_asm_const_iii(2, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 11665
 $ReallocAsyncCtx3 = _emscripten_realloc_async_context(8) | 0; //@line 11666
 _wait_ms(400); //@line 11667
 if (___async) {
  HEAP32[$ReallocAsyncCtx3 >> 2] = 35; //@line 11670
  $4 = $ReallocAsyncCtx3 + 4 | 0; //@line 11671
  HEAP32[$4 >> 2] = $2; //@line 11672
  sp = STACKTOP; //@line 11673
  return;
 }
 ___async_unwind = 0; //@line 11676
 HEAP32[$ReallocAsyncCtx3 >> 2] = 35; //@line 11677
 $4 = $ReallocAsyncCtx3 + 4 | 0; //@line 11678
 HEAP32[$4 >> 2] = $2; //@line 11679
 sp = STACKTOP; //@line 11680
 return;
}
function _mbed_die__async_cb_14($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 11636
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 11638
 _emscripten_asm_const_iii(2, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 11640
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(8) | 0; //@line 11641
 _wait_ms(400); //@line 11642
 if (___async) {
  HEAP32[$ReallocAsyncCtx2 >> 2] = 36; //@line 11645
  $4 = $ReallocAsyncCtx2 + 4 | 0; //@line 11646
  HEAP32[$4 >> 2] = $2; //@line 11647
  sp = STACKTOP; //@line 11648
  return;
 }
 ___async_unwind = 0; //@line 11651
 HEAP32[$ReallocAsyncCtx2 >> 2] = 36; //@line 11652
 $4 = $ReallocAsyncCtx2 + 4 | 0; //@line 11653
 HEAP32[$4 >> 2] = $2; //@line 11654
 sp = STACKTOP; //@line 11655
 return;
}
function _mbed_die__async_cb_13($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 11611
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 11613
 _emscripten_asm_const_iii(2, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 11615
 $ReallocAsyncCtx = _emscripten_realloc_async_context(8) | 0; //@line 11616
 _wait_ms(400); //@line 11617
 if (___async) {
  HEAP32[$ReallocAsyncCtx >> 2] = 37; //@line 11620
  $4 = $ReallocAsyncCtx + 4 | 0; //@line 11621
  HEAP32[$4 >> 2] = $2; //@line 11622
  sp = STACKTOP; //@line 11623
  return;
 }
 ___async_unwind = 0; //@line 11626
 HEAP32[$ReallocAsyncCtx >> 2] = 37; //@line 11627
 $4 = $ReallocAsyncCtx + 4 | 0; //@line 11628
 HEAP32[$4 >> 2] = $2; //@line 11629
 sp = STACKTOP; //@line 11630
 return;
}
function _mbed_tracef($0, $1, $2, $varargs) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $varargs = $varargs | 0;
 var $3 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 154
 STACKTOP = STACKTOP + 16 | 0; //@line 155
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 155
 $3 = sp; //@line 156
 HEAP32[$3 >> 2] = $varargs; //@line 157
 $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 158
 _mbed_vtracef($0, $1, $2, $3); //@line 159
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 8; //@line 162
  HEAP32[$AsyncCtx + 4 >> 2] = $3; //@line 164
  sp = STACKTOP; //@line 165
  STACKTOP = sp; //@line 166
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 168
  STACKTOP = sp; //@line 169
  return;
 }
}
function _mbed_error_printf($0, $varargs) {
 $0 = $0 | 0;
 $varargs = $varargs | 0;
 var $1 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 1180
 STACKTOP = STACKTOP + 16 | 0; //@line 1181
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 1181
 $1 = sp; //@line 1182
 HEAP32[$1 >> 2] = $varargs; //@line 1183
 $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 1184
 _mbed_error_vfprintf($0, $1); //@line 1185
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 38; //@line 1188
  HEAP32[$AsyncCtx + 4 >> 2] = $1; //@line 1190
  sp = STACKTOP; //@line 1191
  STACKTOP = sp; //@line 1192
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 1194
  STACKTOP = sp; //@line 1195
  return;
 }
}
function _sbrk(increment) {
 increment = increment | 0;
 var oldDynamicTop = 0, newDynamicTop = 0;
 oldDynamicTop = HEAP32[DYNAMICTOP_PTR >> 2] | 0; //@line 13407
 newDynamicTop = oldDynamicTop + increment | 0; //@line 13408
 if ((increment | 0) > 0 & (newDynamicTop | 0) < (oldDynamicTop | 0) | (newDynamicTop | 0) < 0) {
  abortOnCannotGrowMemory() | 0; //@line 13412
  ___setErrNo(12); //@line 13413
  return -1;
 }
 HEAP32[DYNAMICTOP_PTR >> 2] = newDynamicTop; //@line 13417
 if ((newDynamicTop | 0) > (getTotalMemory() | 0)) {
  if (!(enlargeMemory() | 0)) {
   HEAP32[DYNAMICTOP_PTR >> 2] = oldDynamicTop; //@line 13421
   ___setErrNo(12); //@line 13422
   return -1;
  }
 }
 return oldDynamicTop | 0; //@line 13426
}
function _fwrite($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $$ = 0, $11 = 0, $13 = 0, $15 = 0, $4 = 0, $phitmp = 0;
 $4 = Math_imul($2, $1) | 0; //@line 4993
 $$ = ($1 | 0) == 0 ? 0 : $2; //@line 4995
 if ((HEAP32[$3 + 76 >> 2] | 0) > -1) {
  $phitmp = (___lockfile($3) | 0) == 0; //@line 5001
  $11 = ___fwritex($0, $4, $3) | 0; //@line 5002
  if ($phitmp) {
   $13 = $11; //@line 5004
  } else {
   ___unlockfile($3); //@line 5006
   $13 = $11; //@line 5007
  }
 } else {
  $13 = ___fwritex($0, $4, $3) | 0; //@line 5011
 }
 if (($13 | 0) == ($4 | 0)) {
  $15 = $$; //@line 5015
 } else {
  $15 = ($13 >>> 0) / ($1 >>> 0) | 0; //@line 5018
 }
 return $15 | 0; //@line 5020
}
function _fmt_x($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $$05$lcssa = 0, $$056 = 0, $14 = 0, $15 = 0, $8 = 0;
 if (($0 | 0) == 0 & ($1 | 0) == 0) {
  $$05$lcssa = $2; //@line 7329
 } else {
  $$056 = $2; //@line 7331
  $15 = $1; //@line 7331
  $8 = $0; //@line 7331
  while (1) {
   $14 = $$056 + -1 | 0; //@line 7339
   HEAP8[$14 >> 0] = HEAPU8[1894 + ($8 & 15) >> 0] | 0 | $3; //@line 7340
   $8 = _bitshift64Lshr($8 | 0, $15 | 0, 4) | 0; //@line 7341
   $15 = tempRet0; //@line 7342
   if (($8 | 0) == 0 & ($15 | 0) == 0) {
    $$05$lcssa = $14; //@line 7347
    break;
   } else {
    $$056 = $14; //@line 7350
   }
  }
 }
 return $$05$lcssa | 0; //@line 7354
}
function ___towrite($0) {
 $0 = $0 | 0;
 var $$0 = 0, $1 = 0, $14 = 0, $3 = 0, $7 = 0;
 $1 = $0 + 74 | 0; //@line 5210
 $3 = HEAP8[$1 >> 0] | 0; //@line 5212
 HEAP8[$1 >> 0] = $3 + 255 | $3; //@line 5216
 $7 = HEAP32[$0 >> 2] | 0; //@line 5217
 if (!($7 & 8)) {
  HEAP32[$0 + 8 >> 2] = 0; //@line 5222
  HEAP32[$0 + 4 >> 2] = 0; //@line 5224
  $14 = HEAP32[$0 + 44 >> 2] | 0; //@line 5226
  HEAP32[$0 + 28 >> 2] = $14; //@line 5228
  HEAP32[$0 + 20 >> 2] = $14; //@line 5230
  HEAP32[$0 + 16 >> 2] = $14 + (HEAP32[$0 + 48 >> 2] | 0); //@line 5236
  $$0 = 0; //@line 5237
 } else {
  HEAP32[$0 >> 2] = $7 | 32; //@line 5240
  $$0 = -1; //@line 5241
 }
 return $$0 | 0; //@line 5243
}
function _twobyte_strstr($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$sink$in = 0, $$sink17$sink = 0, $11 = 0, $12 = 0, $8 = 0;
 $8 = (HEAPU8[$1 >> 0] | 0) << 8 | (HEAPU8[$1 + 1 >> 0] | 0); //@line 8797
 $$sink$in = HEAPU8[$0 >> 0] | 0; //@line 8800
 $$sink17$sink = $0; //@line 8800
 while (1) {
  $11 = $$sink17$sink + 1 | 0; //@line 8802
  $12 = HEAP8[$11 >> 0] | 0; //@line 8803
  if (!($12 << 24 >> 24)) {
   break;
  }
  $$sink$in = $$sink$in << 8 & 65280 | $12 & 255; //@line 8811
  if (($$sink$in | 0) == ($8 | 0)) {
   break;
  } else {
   $$sink17$sink = $11; //@line 8816
  }
 }
 return ($12 << 24 >> 24 ? $$sink17$sink : 0) | 0; //@line 8821
}
function _fmt_o($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$0$lcssa = 0, $$06 = 0, $10 = 0, $11 = 0, $7 = 0;
 if (($0 | 0) == 0 & ($1 | 0) == 0) {
  $$0$lcssa = $2; //@line 7366
 } else {
  $$06 = $2; //@line 7368
  $11 = $1; //@line 7368
  $7 = $0; //@line 7368
  while (1) {
   $10 = $$06 + -1 | 0; //@line 7373
   HEAP8[$10 >> 0] = $7 & 7 | 48; //@line 7374
   $7 = _bitshift64Lshr($7 | 0, $11 | 0, 3) | 0; //@line 7375
   $11 = tempRet0; //@line 7376
   if (($7 | 0) == 0 & ($11 | 0) == 0) {
    $$0$lcssa = $10; //@line 7381
    break;
   } else {
    $$06 = $10; //@line 7384
   }
  }
 }
 return $$0$lcssa | 0; //@line 7388
}
function ___cxa_is_pointer_type($0) {
 $0 = $0 | 0;
 var $2 = 0, $3 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 10293
 do {
  if (!$0) {
   $3 = 0; //@line 10297
  } else {
   $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 10299
   $2 = ___dynamic_cast($0, 24, 80, 0) | 0; //@line 10300
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 71; //@line 10303
    sp = STACKTOP; //@line 10304
    return 0; //@line 10305
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 10307
    $3 = ($2 | 0) != 0 & 1; //@line 10310
    break;
   }
  }
 } while (0);
 return $3 | 0; //@line 10315
}
function _invoke_ticker__async_cb_29($0) {
 $0 = $0 | 0;
 var $5 = 0, $6 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 12069
 $5 = HEAP32[HEAP32[HEAP32[$0 + 4 >> 2] >> 2] >> 2] | 0; //@line 12075
 $6 = HEAP32[$0 + 8 >> 2] | 0; //@line 12076
 $ReallocAsyncCtx = _emscripten_realloc_async_context(4) | 0; //@line 12077
 FUNCTION_TABLE_vi[$5 & 127]($6); //@line 12078
 if (___async) {
  HEAP32[$ReallocAsyncCtx >> 2] = 45; //@line 12081
  sp = STACKTOP; //@line 12082
  return;
 }
 ___async_unwind = 0; //@line 12085
 HEAP32[$ReallocAsyncCtx >> 2] = 45; //@line 12086
 sp = STACKTOP; //@line 12087
 return;
}
function _getint_671($0) {
 $0 = $0 | 0;
 var $$0$lcssa = 0, $$04 = 0, $11 = 0, $12 = 0, $7 = 0;
 if (!(_isdigit(HEAP8[HEAP32[$0 >> 2] >> 0] | 0) | 0)) {
  $$0$lcssa = 0; //@line 7010
 } else {
  $$04 = 0; //@line 7012
  while (1) {
   $7 = HEAP32[$0 >> 2] | 0; //@line 7015
   $11 = ($$04 * 10 | 0) + -48 + (HEAP8[$7 >> 0] | 0) | 0; //@line 7019
   $12 = $7 + 1 | 0; //@line 7020
   HEAP32[$0 >> 2] = $12; //@line 7021
   if (!(_isdigit(HEAP8[$12 >> 0] | 0) | 0)) {
    $$0$lcssa = $11; //@line 7027
    break;
   } else {
    $$04 = $11; //@line 7030
   }
  }
 }
 return $$0$lcssa | 0; //@line 7034
}
function ___fflush_unlocked__async_cb_37($0) {
 $0 = $0 | 0;
 var $10 = 0, $4 = 0, $6 = 0, $8 = 0;
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 12806
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 12808
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 12810
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 12812
 HEAP32[(HEAP32[$0 + 4 >> 2] | 0) + 16 >> 2] = 0; //@line 12814
 HEAP32[$4 >> 2] = 0; //@line 12815
 HEAP32[$6 >> 2] = 0; //@line 12816
 HEAP32[$8 >> 2] = 0; //@line 12817
 HEAP32[$10 >> 2] = 0; //@line 12818
 HEAP32[___async_retval >> 2] = 0; //@line 12820
 return;
}
function _mbed_vtracef__async_cb_2($0) {
 $0 = $0 | 0;
 var $1 = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 10873
 $1 = HEAP32[36] | 0; //@line 10874
 $ReallocAsyncCtx3 = _emscripten_realloc_async_context(4) | 0; //@line 10875
 FUNCTION_TABLE_vi[$1 & 127](993); //@line 10876
 if (___async) {
  HEAP32[$ReallocAsyncCtx3 >> 2] = 12; //@line 10879
  sp = STACKTOP; //@line 10880
  return;
 }
 ___async_unwind = 0; //@line 10883
 HEAP32[$ReallocAsyncCtx3 >> 2] = 12; //@line 10884
 sp = STACKTOP; //@line 10885
 return;
}
function _serial_putc__async_cb_38($0) {
 $0 = $0 | 0;
 var $2 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 12832
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 12834
 $ReallocAsyncCtx = _emscripten_realloc_async_context(4) | 0; //@line 12835
 _fflush($2) | 0; //@line 12836
 if (___async) {
  HEAP32[$ReallocAsyncCtx >> 2] = 43; //@line 12839
  sp = STACKTOP; //@line 12840
  return;
 }
 ___async_unwind = 0; //@line 12843
 HEAP32[$ReallocAsyncCtx >> 2] = 43; //@line 12844
 sp = STACKTOP; //@line 12845
 return;
}
function _emscripten_async_resume() {
 ___async = 0; //@line 13258
 ___async_unwind = 1; //@line 13259
 while (1) {
  if (!___async_cur_frame) return;
  dynCall_vi(HEAP32[___async_cur_frame + 8 >> 2] | 0, ___async_cur_frame + 8 | 0); //@line 13265
  if (___async) return;
  if (!___async_unwind) {
   ___async_unwind = 1; //@line 13269
   continue;
  }
  stackRestore(HEAP32[___async_cur_frame + 4 >> 2] | 0); //@line 13273
  ___async_cur_frame = HEAP32[___async_cur_frame >> 2] | 0; //@line 13275
 }
}
function ___stdio_close($0) {
 $0 = $0 | 0;
 var $5 = 0, $vararg_buffer = 0, sp = 0;
 sp = STACKTOP; //@line 4633
 STACKTOP = STACKTOP + 16 | 0; //@line 4634
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 4634
 $vararg_buffer = sp; //@line 4635
 HEAP32[$vararg_buffer >> 2] = _dummy(HEAP32[$0 + 60 >> 2] | 0) | 0; //@line 4639
 $5 = ___syscall_ret(___syscall6(6, $vararg_buffer | 0) | 0) | 0; //@line 4641
 STACKTOP = sp; //@line 4642
 return $5 | 0; //@line 4642
}
function ___uremdi3($a$0, $a$1, $b$0, $b$1) {
 $a$0 = $a$0 | 0;
 $a$1 = $a$1 | 0;
 $b$0 = $b$0 | 0;
 $b$1 = $b$1 | 0;
 var $rem = 0, __stackBase__ = 0;
 __stackBase__ = STACKTOP; //@line 13200
 STACKTOP = STACKTOP + 16 | 0; //@line 13201
 $rem = __stackBase__ | 0; //@line 13202
 ___udivmoddi4($a$0, $a$1, $b$0, $b$1, $rem) | 0; //@line 13203
 STACKTOP = __stackBase__; //@line 13204
 return (tempRet0 = HEAP32[$rem + 4 >> 2] | 0, HEAP32[$rem >> 2] | 0) | 0; //@line 13205
}
function _llvm_cttz_i32(x) {
 x = x | 0;
 var ret = 0;
 ret = HEAP8[cttz_i8 + (x & 255) >> 0] | 0; //@line 12970
 if ((ret | 0) < 8) return ret | 0; //@line 12971
 ret = HEAP8[cttz_i8 + (x >> 8 & 255) >> 0] | 0; //@line 12972
 if ((ret | 0) < 8) return ret + 8 | 0; //@line 12973
 ret = HEAP8[cttz_i8 + (x >> 16 & 255) >> 0] | 0; //@line 12974
 if ((ret | 0) < 8) return ret + 16 | 0; //@line 12975
 return (HEAP8[cttz_i8 + (x >>> 24) >> 0] | 0) + 24 | 0; //@line 12976
}
function __ZNK10__cxxabiv117__class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($0, $1, $2, $3, $4, $5) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 $5 = $5 | 0;
 if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, $5) | 0) {
  __ZNK10__cxxabiv117__class_type_info29process_static_type_above_dstEPNS_19__dynamic_cast_infoEPKvS4_i(0, $1, $2, $3, $4); //@line 9678
 }
 return;
}
function _sn_write($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$ = 0, $5 = 0, $6 = 0, $7 = 0;
 $5 = $0 + 20 | 0; //@line 9452
 $6 = HEAP32[$5 >> 2] | 0; //@line 9453
 $7 = (HEAP32[$0 + 16 >> 2] | 0) - $6 | 0; //@line 9454
 $$ = $7 >>> 0 > $2 >>> 0 ? $2 : $7; //@line 9456
 _memcpy($6 | 0, $1 | 0, $$ | 0) | 0; //@line 9458
 HEAP32[$5 >> 2] = (HEAP32[$5 >> 2] | 0) + $$; //@line 9461
 return $2 | 0; //@line 9462
}
function __ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv__async_cb($0) {
 $0 = $0 | 0;
 var $$0 = 0, $2 = 0;
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 12297
 if ((HEAP32[$2 + 24 >> 2] | 0) == 1) {
  HEAP32[HEAP32[$0 + 8 >> 2] >> 2] = HEAP32[$2 + 16 >> 2]; //@line 12308
  $$0 = 1; //@line 12309
 } else {
  $$0 = 0; //@line 12311
 }
 HEAP8[___async_retval >> 0] = $$0 & 1; //@line 12315
 return;
}
function _vsnprintf__async_cb($0) {
 $0 = $0 | 0;
 var $13 = 0, $AsyncRetVal = 0;
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 12389
 if (HEAP32[$0 + 4 >> 2] | 0) {
  $13 = HEAP32[HEAP32[$0 + 16 >> 2] >> 2] | 0; //@line 12392
  HEAP8[$13 + ((($13 | 0) == (HEAP32[HEAP32[$0 + 20 >> 2] >> 2] | 0)) << 31 >> 31) >> 0] = 0; //@line 12397
 }
 HEAP32[___async_retval >> 2] = $AsyncRetVal; //@line 12400
 return;
}
function _serial_init($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $10 = 0, $4 = 0, $9 = 0;
 HEAP32[$0 + 4 >> 2] = $2; //@line 1328
 HEAP32[$0 >> 2] = $1; //@line 1329
 HEAP32[998] = 1; //@line 1330
 $4 = $0; //@line 1331
 $9 = HEAP32[$4 + 4 >> 2] | 0; //@line 1336
 $10 = 3996; //@line 1337
 HEAP32[$10 >> 2] = HEAP32[$4 >> 2]; //@line 1339
 HEAP32[$10 + 4 >> 2] = $9; //@line 1342
 return;
}
function __ZNK10__cxxabiv117__class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, 0) | 0) {
  __ZNK10__cxxabiv117__class_type_info24process_found_base_classEPNS_19__dynamic_cast_infoEPvi(0, $1, $2, $3); //@line 9754
 }
 return;
}
function _wait_ms($0) {
 $0 = $0 | 0;
 var $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 1432
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 1433
 _emscripten_sleep($0 | 0); //@line 1434
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 46; //@line 1437
  sp = STACKTOP; //@line 1438
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 1441
  return;
 }
}
function _mbed_trace_default_print($0) {
 $0 = $0 | 0;
 var $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 135
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 136
 _puts($0) | 0; //@line 137
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 7; //@line 140
  sp = STACKTOP; //@line 141
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 144
  return;
 }
}
function __ZNK10__cxxabiv117__class_type_info29process_static_type_below_dstEPNS_19__dynamic_cast_infoEPKvi($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $7 = 0;
 if ((HEAP32[$1 + 4 >> 2] | 0) == ($2 | 0)) {
  $7 = $1 + 28 | 0; //@line 9818
  if ((HEAP32[$7 >> 2] | 0) != 1) {
   HEAP32[$7 >> 2] = $3; //@line 9822
  }
 }
 return;
}
function _emscripten_alloc_async_context(len, sp) {
 len = len | 0;
 sp = sp | 0;
 var new_frame = 0;
 new_frame = stackAlloc(len + 8 | 0) | 0; //@line 13234
 HEAP32[new_frame + 4 >> 2] = sp; //@line 13236
 HEAP32[new_frame >> 2] = ___async_cur_frame; //@line 13238
 ___async_cur_frame = new_frame; //@line 13239
 return ___async_cur_frame + 8 | 0; //@line 13240
}
function ___cxa_can_catch__async_cb($0) {
 $0 = $0 | 0;
 var $AsyncRetVal = 0;
 $AsyncRetVal = HEAP8[___async_retval >> 0] & 1; //@line 11573
 if ($AsyncRetVal) {
  HEAP32[HEAP32[$0 + 8 >> 2] >> 2] = HEAP32[HEAP32[$0 + 4 >> 2] >> 2]; //@line 11577
 }
 HEAP32[___async_retval >> 2] = $AsyncRetVal & 1; //@line 11580
 return;
}
function _bitshift64Shl(low, high, bits) {
 low = low | 0;
 high = high | 0;
 bits = bits | 0;
 if ((bits | 0) < 32) {
  tempRet0 = high << bits | (low & (1 << bits) - 1 << 32 - bits) >>> 32 - bits; //@line 13223
  return low << bits; //@line 13224
 }
 tempRet0 = low << bits - 32; //@line 13226
 return 0; //@line 13227
}
function _bitshift64Lshr(low, high, bits) {
 low = low | 0;
 high = high | 0;
 bits = bits | 0;
 if ((bits | 0) < 32) {
  tempRet0 = high >>> bits; //@line 13212
  return low >>> bits | (high & (1 << bits) - 1) << 32 - bits; //@line 13213
 }
 tempRet0 = 0; //@line 13215
 return high >>> bits - 32 | 0; //@line 13216
}
function _fflush__async_cb_30($0) {
 $0 = $0 | 0;
 var $AsyncRetVal = 0;
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 12189
 if (!(HEAP8[$0 + 4 >> 0] & 1)) {
  ___unlockfile(HEAP32[$0 + 8 >> 2] | 0); //@line 12191
 }
 HEAP32[___async_retval >> 2] = $AsyncRetVal; //@line 12194
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
function _puts__async_cb($0) {
 $0 = $0 | 0;
 var $$lobit = 0;
 $$lobit = HEAP32[___async_retval >> 2] >> 31; //@line 12936
 if (HEAP32[$0 + 4 >> 2] | 0) {
  ___unlockfile(HEAP32[$0 + 8 >> 2] | 0); //@line 12939
 }
 HEAP32[___async_retval >> 2] = $$lobit; //@line 12942
 return;
}
function __GLOBAL__sub_I_main_cpp() {
 HEAP32[1001] = 0; //@line 1448
 HEAP32[1002] = 0; //@line 1448
 HEAP32[1003] = 0; //@line 1448
 HEAP32[1004] = 0; //@line 1448
 HEAP32[1005] = 0; //@line 1448
 HEAP32[1006] = 0; //@line 1448
 _gpio_init_out(4004, 50); //@line 1449
 return;
}
function ___overflow__async_cb($0) {
 $0 = $0 | 0;
 var $$0 = 0;
 if ((HEAP32[___async_retval >> 2] | 0) == 1) {
  $$0 = HEAPU8[HEAP32[$0 + 4 >> 2] >> 0] | 0; //@line 12729
 } else {
  $$0 = -1; //@line 12731
 }
 HEAP32[___async_retval >> 2] = $$0; //@line 12734
 return;
}
function ___lctrans_impl($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0 = 0;
 if (!$1) {
  $$0 = 0; //@line 5340
 } else {
  $$0 = ___mo_lookup(HEAP32[$1 >> 2] | 0, HEAP32[$1 + 4 >> 2] | 0, $0) | 0; //@line 5346
 }
 return ($$0 | 0 ? $$0 : $0) | 0; //@line 5350
}
function dynCall_viiiiii(index, a1, a2, a3, a4, a5, a6) {
 index = index | 0;
 a1 = a1 | 0;
 a2 = a2 | 0;
 a3 = a3 | 0;
 a4 = a4 | 0;
 a5 = a5 | 0;
 a6 = a6 | 0;
 FUNCTION_TABLE_viiiiii[index & 3](a1 | 0, a2 | 0, a3 | 0, a4 | 0, a5 | 0, a6 | 0); //@line 13482
}
function _emscripten_free_async_context(ctx) {
 ctx = ctx | 0;
 assert((___async_cur_frame + 8 | 0) == (ctx | 0) | 0); //@line 13246
 stackRestore(___async_cur_frame | 0); //@line 13247
 ___async_cur_frame = HEAP32[___async_cur_frame >> 2] | 0; //@line 13248
}
function _putc__async_cb($0) {
 $0 = $0 | 0;
 var $AsyncRetVal = 0;
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 10363
 ___unlockfile(HEAP32[$0 + 4 >> 2] | 0); //@line 10364
 HEAP32[___async_retval >> 2] = $AsyncRetVal; //@line 10366
 return;
}
function _gpio_init_out($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 HEAP32[$0 >> 2] = $1; //@line 1304
 if (($1 | 0) == -1) {
  return;
 }
 HEAP32[$0 + 4 >> 2] = $1; //@line 1310
 _emscripten_asm_const_iii(3, $0 | 0, $1 | 0) | 0; //@line 1311
 return;
}
function ___DOUBLE_BITS_677($0) {
 $0 = +$0;
 var $1 = 0;
 HEAPF64[tempDoublePtr >> 3] = $0; //@line 8451
 $1 = HEAP32[tempDoublePtr >> 2] | 0; //@line 8451
 tempRet0 = HEAP32[tempDoublePtr + 4 >> 2] | 0; //@line 8453
 return $1 | 0; //@line 8454
}
function _i64Subtract(a, b, c, d) {
 a = a | 0;
 b = b | 0;
 c = c | 0;
 d = d | 0;
 var h = 0;
 h = b - d >>> 0; //@line 12963
 h = b - d - (c >>> 0 > a >>> 0 | 0) >>> 0; //@line 12964
 return (tempRet0 = h, a - c >>> 0 | 0) | 0; //@line 12965
}
function ___syscall_ret($0) {
 $0 = $0 | 0;
 var $$0 = 0;
 if ($0 >>> 0 > 4294963200) {
  HEAP32[(___errno_location() | 0) >> 2] = 0 - $0; //@line 4799
  $$0 = -1; //@line 4800
 } else {
  $$0 = $0; //@line 4802
 }
 return $$0 | 0; //@line 4804
}
function runPostSets() {}
function _i64Add(a, b, c, d) {
 a = a | 0;
 b = b | 0;
 c = c | 0;
 d = d | 0;
 var l = 0;
 l = a + c >>> 0; //@line 12955
 return (tempRet0 = b + d + (l >>> 0 < a >>> 0 | 0) >>> 0, l | 0) | 0; //@line 12957
}
function dynCall_viiiii(index, a1, a2, a3, a4, a5) {
 index = index | 0;
 a1 = a1 | 0;
 a2 = a2 | 0;
 a3 = a3 | 0;
 a4 = a4 | 0;
 a5 = a5 | 0;
 FUNCTION_TABLE_viiiii[index & 3](a1 | 0, a2 | 0, a3 | 0, a4 | 0, a5 | 0); //@line 13475
}
function _handle_lora_downlink($0, $1, $2, $3, $4, $5) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 $5 = $5 | 0;
 __ZN16SX1276_LoRaRadio8rx_frameEPhjjhh($0, $1, $2, $3, $4, $5); //@line 56
 return;
}
function dynCall_viiii(index, a1, a2, a3, a4) {
 index = index | 0;
 a1 = a1 | 0;
 a2 = a2 | 0;
 a3 = a3 | 0;
 a4 = a4 | 0;
 FUNCTION_TABLE_viiii[index & 3](a1 | 0, a2 | 0, a3 | 0, a4 | 0); //@line 13468
}
function _strchr($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $2 = 0;
 $2 = ___strchrnul($0, $1) | 0; //@line 5485
 return ((HEAP8[$2 >> 0] | 0) == ($1 & 255) << 24 >> 24 ? $2 : 0) | 0; //@line 5490
}
function _wctomb($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0 = 0;
 if (!$0) {
  $$0 = 0; //@line 7511
 } else {
  $$0 = _wcrtomb($0, $1, 0) | 0; //@line 7514
 }
 return $$0 | 0; //@line 7516
}
function dynCall_iiii(index, a1, a2, a3) {
 index = index | 0;
 a1 = a1 | 0;
 a2 = a2 | 0;
 a3 = a3 | 0;
 return FUNCTION_TABLE_iiii[index & 7](a1 | 0, a2 | 0, a3 | 0) | 0; //@line 13447
}
function ___udivdi3($a$0, $a$1, $b$0, $b$1) {
 $a$0 = $a$0 | 0;
 $a$1 = $a$1 | 0;
 $b$0 = $b$0 | 0;
 $b$1 = $b$1 | 0;
 return ___udivmoddi4($a$0, $a$1, $b$0, $b$1, 0) | 0; //@line 13192
}
function ___dynamic_cast__async_cb($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = (HEAP32[HEAP32[$0 + 4 >> 2] >> 2] | 0) == 1 ? HEAP32[$0 + 8 >> 2] | 0 : 0; //@line 12417
 return;
}
function _fputs($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $2 = 0;
 $2 = _strlen($0) | 0; //@line 4980
 return ((_fwrite($0, 1, $2, $1) | 0) != ($2 | 0)) << 31 >> 31 | 0; //@line 4984
}
function _emscripten_realloc_async_context(len) {
 len = len | 0;
 stackRestore(___async_cur_frame | 0); //@line 13253
 return (stackAlloc(len + 8 | 0) | 0) + 8 | 0; //@line 13254
}
function establishStackSpace(stackBase, stackMax) {
 stackBase = stackBase | 0;
 stackMax = stackMax | 0;
 STACKTOP = stackBase; //@line 21
 STACK_MAX = stackMax; //@line 22
}
function __ZN10__cxxabiv120__si_class_type_infoD0Ev($0) {
 $0 = $0 | 0;
 __ZN10__cxxabiv116__shim_type_infoD2Ev($0); //@line 10040
 __ZdlPv($0); //@line 10041
 return;
}
function _swapc($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $3 = 0;
 $3 = _llvm_bswap_i32($0 | 0) | 0; //@line 5476
 return (($1 | 0) == 0 ? $0 : $3) | 0; //@line 5478
}
function __ZN10__cxxabiv117__class_type_infoD0Ev($0) {
 $0 = $0 | 0;
 __ZN10__cxxabiv116__shim_type_infoD2Ev($0); //@line 9568
 __ZdlPv($0); //@line 9569
 return;
}
function ___cxa_is_pointer_type__async_cb($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = (HEAP32[___async_retval >> 2] | 0) != 0 & 1; //@line 12099
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
  ___fwritex($1, $2, $0) | 0; //@line 6996
 }
 return;
}
function b76(p0, p1, p2, p3, p4, p5) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 p3 = p3 | 0;
 p4 = p4 | 0;
 p5 = p5 | 0;
 nullFunc_viiiiii(3); //@line 13690
}
function b75(p0, p1, p2, p3, p4, p5) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 p3 = p3 | 0;
 p4 = p4 | 0;
 p5 = p5 | 0;
 nullFunc_viiiiii(0); //@line 13687
}
function __ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 return ($0 | 0) == ($1 | 0) | 0; //@line 9765
}
function __ZNK10__cxxabiv120__si_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function _llvm_bswap_i32(x) {
 x = x | 0;
 return (x & 255) << 24 | (x >> 8 & 255) << 16 | (x >> 16 & 255) << 8 | x >>> 24 | 0; //@line 13280
}
function __ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_28($0) {
 $0 = $0 | 0;
 return;
}
function __ZNK10__cxxabiv120__si_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function b73(p0, p1, p2, p3, p4) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 p3 = p3 | 0;
 p4 = p4 | 0;
 nullFunc_viiiii(3); //@line 13684
}
function b72(p0, p1, p2, p3, p4) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 p3 = p3 | 0;
 p4 = p4 | 0;
 nullFunc_viiiii(0); //@line 13681
}
function _fflush__async_cb_31($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = HEAP32[___async_retval >> 2]; //@line 12204
 return;
}
function _strerror($0) {
 $0 = $0 | 0;
 return ___strerror_l($0, HEAP32[(___pthread_self_85() | 0) + 188 >> 2] | 0) | 0; //@line 7459
}
function _snprintf__async_cb($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = HEAP32[___async_retval >> 2]; //@line 12915
 return;
}
function _putc__async_cb_1($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = HEAP32[___async_retval >> 2]; //@line 10376
 return;
}
function _printf__async_cb($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = HEAP32[___async_retval >> 2]; //@line 11992
 return;
}
function dynCall_ii(index, a1) {
 index = index | 0;
 a1 = a1 | 0;
 return FUNCTION_TABLE_ii[index & 1](a1 | 0) | 0; //@line 13440
}
function b7(p0, p1, p2) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 nullFunc_iiii(7); //@line 13498
 return 0; //@line 13498
}
function b6(p0, p1, p2) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 nullFunc_iiii(6); //@line 13495
 return 0; //@line 13495
}
function b5(p0, p1, p2) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 nullFunc_iiii(0); //@line 13492
 return 0; //@line 13492
}
function dynCall_vi(index, a1) {
 index = index | 0;
 a1 = a1 | 0;
 FUNCTION_TABLE_vi[index & 127](a1 | 0); //@line 13461
}
function b70(p0, p1, p2, p3) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 p3 = p3 | 0;
 nullFunc_viiii(3); //@line 13678
}
function b69(p0, p1, p2, p3) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 p3 = p3 | 0;
 nullFunc_viiii(0); //@line 13675
}
function ___lctrans($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 return ___lctrans_impl($0, $1) | 0; //@line 8704
}
function dynCall_i(index) {
 index = index | 0;
 return FUNCTION_TABLE_i[index & 0]() | 0; //@line 13433
}
function dynCall_v(index) {
 index = index | 0;
 FUNCTION_TABLE_v[index & 0](); //@line 13454
}
function _isdigit($0) {
 $0 = $0 | 0;
 return ($0 + -48 | 0) >>> 0 < 10 | 0; //@line 4857
}
function b3(p0) {
 p0 = p0 | 0;
 nullFunc_ii(0); //@line 13489
 return 0; //@line 13489
}
function __ZNK10__cxxabiv116__shim_type_info5noop2Ev($0) {
 $0 = $0 | 0;
 return;
}
function __ZNK10__cxxabiv116__shim_type_info5noop1Ev($0) {
 $0 = $0 | 0;
 return;
}
function ___ofl_lock() {
 ___lock(4592); //@line 5495
 return 4600; //@line 5496
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
function __ZN10__cxxabiv116__shim_type_infoD2Ev($0) {
 $0 = $0 | 0;
 return;
}
function ___pthread_self_910() {
 return _pthread_self() | 0; //@line 8625
}
function _mbed_trace_default_print__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function ___pthread_self_85() {
 return _pthread_self() | 0; //@line 8631
}
function stackRestore(top) {
 top = top | 0;
 STACKTOP = top; //@line 16
}
function b1() {
 nullFunc_i(0); //@line 13486
 return 0; //@line 13486
}
function __ZdlPv($0) {
 $0 = $0 | 0;
 _free($0); //@line 9555
 return;
}
function _mbed_assert_internal__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function _handle_interrupt_in($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
}
function _mbed_error_printf__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function ___ofl_unlock() {
 ___unlock(4592); //@line 5501
 return;
}
function b67(p0) {
 p0 = p0 | 0;
 nullFunc_vi(127); //@line 13672
}
function b66(p0) {
 p0 = p0 | 0;
 nullFunc_vi(126); //@line 13669
}
function b65(p0) {
 p0 = p0 | 0;
 nullFunc_vi(125); //@line 13666
}
function b64(p0) {
 p0 = p0 | 0;
 nullFunc_vi(124); //@line 13663
}
function b63(p0) {
 p0 = p0 | 0;
 nullFunc_vi(123); //@line 13660
}
function b62(p0) {
 p0 = p0 | 0;
 nullFunc_vi(122); //@line 13657
}
function b61(p0) {
 p0 = p0 | 0;
 nullFunc_vi(121); //@line 13654
}
function b60(p0) {
 p0 = p0 | 0;
 nullFunc_vi(120); //@line 13651
}
function b59(p0) {
 p0 = p0 | 0;
 nullFunc_vi(119); //@line 13648
}
function b58(p0) {
 p0 = p0 | 0;
 nullFunc_vi(118); //@line 13645
}
function b57(p0) {
 p0 = p0 | 0;
 nullFunc_vi(117); //@line 13642
}
function b56(p0) {
 p0 = p0 | 0;
 nullFunc_vi(116); //@line 13639
}
function b55(p0) {
 p0 = p0 | 0;
 nullFunc_vi(115); //@line 13636
}
function b54(p0) {
 p0 = p0 | 0;
 nullFunc_vi(114); //@line 13633
}
function b53(p0) {
 p0 = p0 | 0;
 nullFunc_vi(113); //@line 13630
}
function b52(p0) {
 p0 = p0 | 0;
 nullFunc_vi(112); //@line 13627
}
function b51(p0) {
 p0 = p0 | 0;
 nullFunc_vi(111); //@line 13624
}
function b50(p0) {
 p0 = p0 | 0;
 nullFunc_vi(110); //@line 13621
}
function b49(p0) {
 p0 = p0 | 0;
 nullFunc_vi(109); //@line 13618
}
function b48(p0) {
 p0 = p0 | 0;
 nullFunc_vi(108); //@line 13615
}
function b47(p0) {
 p0 = p0 | 0;
 nullFunc_vi(107); //@line 13612
}
function b46(p0) {
 p0 = p0 | 0;
 nullFunc_vi(106); //@line 13609
}
function b45(p0) {
 p0 = p0 | 0;
 nullFunc_vi(105); //@line 13606
}
function b44(p0) {
 p0 = p0 | 0;
 nullFunc_vi(104); //@line 13603
}
function b43(p0) {
 p0 = p0 | 0;
 nullFunc_vi(103); //@line 13600
}
function b42(p0) {
 p0 = p0 | 0;
 nullFunc_vi(102); //@line 13597
}
function b41(p0) {
 p0 = p0 | 0;
 nullFunc_vi(101); //@line 13594
}
function b40(p0) {
 p0 = p0 | 0;
 nullFunc_vi(100); //@line 13591
}
function b39(p0) {
 p0 = p0 | 0;
 nullFunc_vi(99); //@line 13588
}
function b38(p0) {
 p0 = p0 | 0;
 nullFunc_vi(98); //@line 13585
}
function b37(p0) {
 p0 = p0 | 0;
 nullFunc_vi(97); //@line 13582
}
function b36(p0) {
 p0 = p0 | 0;
 nullFunc_vi(96); //@line 13579
}
function b35(p0) {
 p0 = p0 | 0;
 nullFunc_vi(95); //@line 13576
}
function b34(p0) {
 p0 = p0 | 0;
 nullFunc_vi(94); //@line 13573
}
function b33(p0) {
 p0 = p0 | 0;
 nullFunc_vi(93); //@line 13570
}
function b32(p0) {
 p0 = p0 | 0;
 nullFunc_vi(92); //@line 13567
}
function b31(p0) {
 p0 = p0 | 0;
 nullFunc_vi(91); //@line 13564
}
function b30(p0) {
 p0 = p0 | 0;
 nullFunc_vi(90); //@line 13561
}
function b29(p0) {
 p0 = p0 | 0;
 nullFunc_vi(89); //@line 13558
}
function b28(p0) {
 p0 = p0 | 0;
 nullFunc_vi(88); //@line 13555
}
function b27(p0) {
 p0 = p0 | 0;
 nullFunc_vi(87); //@line 13552
}
function b26(p0) {
 p0 = p0 | 0;
 nullFunc_vi(86); //@line 13549
}
function b25(p0) {
 p0 = p0 | 0;
 nullFunc_vi(85); //@line 13546
}
function b24(p0) {
 p0 = p0 | 0;
 nullFunc_vi(84); //@line 13543
}
function b23(p0) {
 p0 = p0 | 0;
 nullFunc_vi(83); //@line 13540
}
function b22(p0) {
 p0 = p0 | 0;
 nullFunc_vi(82); //@line 13537
}
function b21(p0) {
 p0 = p0 | 0;
 nullFunc_vi(81); //@line 13534
}
function b20(p0) {
 p0 = p0 | 0;
 nullFunc_vi(80); //@line 13531
}
function b19(p0) {
 p0 = p0 | 0;
 nullFunc_vi(79); //@line 13528
}
function b18(p0) {
 p0 = p0 | 0;
 nullFunc_vi(78); //@line 13525
}
function b17(p0) {
 p0 = p0 | 0;
 nullFunc_vi(77); //@line 13522
}
function b16(p0) {
 p0 = p0 | 0;
 nullFunc_vi(76); //@line 13519
}
function b15(p0) {
 p0 = p0 | 0;
 nullFunc_vi(75); //@line 13516
}
function b14(p0) {
 p0 = p0 | 0;
 nullFunc_vi(74); //@line 13513
}
function b13(p0) {
 p0 = p0 | 0;
 nullFunc_vi(73); //@line 13510
}
function b12(p0) {
 p0 = p0 | 0;
 nullFunc_vi(72); //@line 13507
}
function _dummy($0) {
 $0 = $0 | 0;
 return $0 | 0; //@line 4815
}
function ___lockfile($0) {
 $0 = $0 | 0;
 return 0; //@line 5132
}
function b11(p0) {
 p0 = p0 | 0;
 nullFunc_vi(0); //@line 13504
}
function _invoke_ticker__async_cb($0) {
 $0 = $0 | 0;
 return;
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
 return 4588; //@line 4809
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
function _core_util_critical_section_exit() {
 return;
}
function _pthread_self() {
 return 292; //@line 4862
}
function ___unlockfile($0) {
 $0 = $0 | 0;
 return;
}
function setAsync() {
 ___async = 1; //@line 26
}
function b9() {
 nullFunc_v(0); //@line 13501
}

// EMSCRIPTEN_END_FUNCS
var FUNCTION_TABLE_i = [b1];
var FUNCTION_TABLE_ii = [b3,___stdio_close];
var FUNCTION_TABLE_iiii = [b5,___stdout_write,___stdio_seek,_sn_write,__ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv,___stdio_write,b6,b7];
var FUNCTION_TABLE_v = [b9];
var FUNCTION_TABLE_vi = [b11,_mbed_trace_default_print,__ZN10__cxxabiv116__shim_type_infoD2Ev,__ZN10__cxxabiv117__class_type_infoD0Ev,__ZNK10__cxxabiv116__shim_type_info5noop1Ev,__ZNK10__cxxabiv116__shim_type_info5noop2Ev,__ZN10__cxxabiv120__si_class_type_infoD0Ev,_mbed_trace_default_print__async_cb,_mbed_tracef__async_cb,_mbed_vtracef__async_cb,_mbed_vtracef__async_cb_12,_mbed_vtracef__async_cb_2,_mbed_vtracef__async_cb_3,_mbed_vtracef__async_cb_4,_mbed_vtracef__async_cb_11,_mbed_vtracef__async_cb_5,_mbed_vtracef__async_cb_10,_mbed_vtracef__async_cb_6,_mbed_vtracef__async_cb_7,_mbed_vtracef__async_cb_8,_mbed_vtracef__async_cb_9,_mbed_assert_internal__async_cb,_mbed_die__async_cb_27,_mbed_die__async_cb_26,_mbed_die__async_cb_25,_mbed_die__async_cb_24,_mbed_die__async_cb_23,_mbed_die__async_cb_22,_mbed_die__async_cb_21
,_mbed_die__async_cb_20,_mbed_die__async_cb_19,_mbed_die__async_cb_18,_mbed_die__async_cb_17,_mbed_die__async_cb_16,_mbed_die__async_cb_15,_mbed_die__async_cb_14,_mbed_die__async_cb_13,_mbed_die__async_cb,_mbed_error_printf__async_cb,_mbed_error_vfprintf__async_cb,_mbed_error_vfprintf__async_cb_36,_mbed_error_vfprintf__async_cb_35,_serial_putc__async_cb_38,_serial_putc__async_cb,_invoke_ticker__async_cb_29,_invoke_ticker__async_cb,_wait_ms__async_cb,_main__async_cb,_putc__async_cb_1,_putc__async_cb,___overflow__async_cb,_fflush__async_cb_31,_fflush__async_cb_30,_fflush__async_cb_32,_fflush__async_cb,___fflush_unlocked__async_cb,___fflush_unlocked__async_cb_37,_vfprintf__async_cb,_snprintf__async_cb
,_vsnprintf__async_cb,_printf__async_cb,_puts__async_cb,__ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv__async_cb_33,__ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv__async_cb,___dynamic_cast__async_cb,___dynamic_cast__async_cb_34,__ZNK10__cxxabiv120__si_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb,__ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb,__ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_28,__ZNK10__cxxabiv120__si_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb,___cxa_can_catch__async_cb,___cxa_is_pointer_type__async_cb,b12,b13,b14,b15,b16,b17,b18,b19,b20,b21,b22,b23,b24,b25,b26,b27,b28
,b29,b30,b31,b32,b33,b34,b35,b36,b37,b38,b39,b40,b41,b42,b43,b44,b45,b46,b47,b48,b49,b50,b51,b52,b53,b54,b55,b56,b57,b58
,b59,b60,b61,b62,b63,b64,b65,b66,b67];
var FUNCTION_TABLE_viiii = [b69,__ZNK10__cxxabiv117__class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi,__ZNK10__cxxabiv120__si_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi,b70];
var FUNCTION_TABLE_viiiii = [b72,__ZNK10__cxxabiv117__class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib,__ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib,b73];
var FUNCTION_TABLE_viiiiii = [b75,__ZNK10__cxxabiv117__class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib,__ZNK10__cxxabiv120__si_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib,b76];

  return { __GLOBAL__sub_I_main_cpp: __GLOBAL__sub_I_main_cpp, ___cxa_can_catch: ___cxa_can_catch, ___cxa_is_pointer_type: ___cxa_is_pointer_type, ___errno_location: ___errno_location, ___udivdi3: ___udivdi3, ___uremdi3: ___uremdi3, _bitshift64Lshr: _bitshift64Lshr, _bitshift64Shl: _bitshift64Shl, _emscripten_alloc_async_context: _emscripten_alloc_async_context, _emscripten_async_resume: _emscripten_async_resume, _emscripten_free_async_context: _emscripten_free_async_context, _emscripten_realloc_async_context: _emscripten_realloc_async_context, _fflush: _fflush, _free: _free, _handle_interrupt_in: _handle_interrupt_in, _handle_lora_downlink: _handle_lora_downlink, _i64Add: _i64Add, _i64Subtract: _i64Subtract, _invoke_ticker: _invoke_ticker, _llvm_bswap_i32: _llvm_bswap_i32, _main: _main, _malloc: _malloc, _memcpy: _memcpy, _memset: _memset, _sbrk: _sbrk, dynCall_i: dynCall_i, dynCall_ii: dynCall_ii, dynCall_iiii: dynCall_iiii, dynCall_v: dynCall_v, dynCall_vi: dynCall_vi, dynCall_viiii: dynCall_viiii, dynCall_viiiii: dynCall_viiiii, dynCall_viiiiii: dynCall_viiiiii, establishStackSpace: establishStackSpace, getTempRet0: getTempRet0, runPostSets: runPostSets, setAsync: setAsync, setTempRet0: setTempRet0, setThrew: setThrew, stackAlloc: stackAlloc, stackRestore: stackRestore, stackSave: stackSave };
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
var dynCall_v = Module["dynCall_v"] = asm["dynCall_v"];
var dynCall_vi = Module["dynCall_vi"] = asm["dynCall_vi"];
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






//# sourceMappingURL=blinky.js.map
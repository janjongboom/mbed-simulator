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
    return Module['dynCall_' + sig].apply(null, [ptr].concat(args));
  } else {
    return Module['dynCall_' + sig].call(null, ptr);
  }
}



var Runtime = {
  // FIXME backwards compatibility layer for ports. Support some Runtime.*
  //       for now, fix it there, then remove it from here. That way we
  //       can minimize any period of breakage.
  dynCall: dynCall, // for SDL2 port
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



// Use a provided buffer, if there is one, or else allocate a new one
if (Module['buffer']) {
  buffer = Module['buffer'];
} else {
  // Use a WebAssembly memory where available
  {
    buffer = new ArrayBuffer(TOTAL_MEMORY);
  }
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
  if (runtimeInitialized) return;
  runtimeInitialized = true;
  callRuntimeCallbacks(__ATINIT__);
}

function preMain() {
  callRuntimeCallbacks(__ATMAIN__);
}

function exitRuntime() {
  callRuntimeCallbacks(__ATEXIT__);
  runtimeExited = true;
}

function postRun() {
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
  HEAP8.set(array, buffer);
}

function writeAsciiToMemory(str, buffer, dontAddNull) {
  for (var i = 0; i < str.length; ++i) {
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

function getUniqueRunDependency(id) {
  return id;
}

function addRunDependency(id) {
  runDependencies++;
  if (Module['monitorRunDependencies']) {
    Module['monitorRunDependencies'](runDependencies);
  }
}

function removeRunDependency(id) {
  runDependencies--;
  if (Module['monitorRunDependencies']) {
    Module['monitorRunDependencies'](runDependencies);
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






// Prefix of data URIs emitted by SINGLE_FILE and related options.
var dataURIPrefix = 'data:application/octet-stream;base64,';

// Indicates whether filename is a base64 data URI.
function isDataURI(filename) {
  return String.prototype.startsWith ?
      filename.startsWith(dataURIPrefix) :
      filename.indexOf(dataURIPrefix) === 0;
}





// === Body ===

var ASM_CONSTS = [function($0, $1) { MbedJSHal.gpio.write($0, $1); },
 function($0, $1) { MbedJSHal.gpio.init_out($0, $1, 0); },
 function($0) { return MbedJSHal.gpio.read($0); }];

function _emscripten_asm_const_iii(code, a0, a1) {
  return ASM_CONSTS[code](a0, a1);
}

function _emscripten_asm_const_ii(code, a0) {
  return ASM_CONSTS[code](a0);
}




STATIC_BASE = GLOBAL_BASE;

STATICTOP = STATIC_BASE + 5056;
/* global initializers */  __ATINIT__.push({ func: function() { __GLOBAL__sub_I_main_cpp() } });


memoryInitializer = "blinky.js.mem";





/* no memory initializer */
var tempDoublePtr = STATICTOP; STATICTOP += 16;

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

var ASSERTIONS = false;

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

Module.asmLibraryArg = { "abort": abort, "assert": assert, "enlargeMemory": enlargeMemory, "getTotalMemory": getTotalMemory, "abortOnCannotGrowMemory": abortOnCannotGrowMemory, "invoke_ii": invoke_ii, "invoke_iiii": invoke_iiii, "invoke_vi": invoke_vi, "invoke_viiii": invoke_viiii, "invoke_viiiii": invoke_viiiii, "invoke_viiiiii": invoke_viiiiii, "___setErrNo": ___setErrNo, "___syscall140": ___syscall140, "___syscall146": ___syscall146, "___syscall54": ___syscall54, "___syscall6": ___syscall6, "_abort": _abort, "_emscripten_asm_const_ii": _emscripten_asm_const_ii, "_emscripten_asm_const_iii": _emscripten_asm_const_iii, "_emscripten_get_now": _emscripten_get_now, "_emscripten_memcpy_big": _emscripten_memcpy_big, "_emscripten_set_main_loop": _emscripten_set_main_loop, "_emscripten_set_main_loop_timing": _emscripten_set_main_loop_timing, "_emscripten_sleep": _emscripten_sleep, "flush_NO_FILESYSTEM": flush_NO_FILESYSTEM, "DYNAMICTOP_PTR": DYNAMICTOP_PTR, "tempDoublePtr": tempDoublePtr, "ABORT": ABORT, "STACKTOP": STACKTOP, "STACK_MAX": STACK_MAX, "cttz_i8": cttz_i8, "___async": ___async, "___async_unwind": ___async_unwind, "___async_retval": ___async_retval, "___async_cur_frame": ___async_cur_frame };
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
  var invoke_ii=env.invoke_ii;
  var invoke_iiii=env.invoke_iiii;
  var invoke_vi=env.invoke_vi;
  var invoke_viiii=env.invoke_viiii;
  var invoke_viiiii=env.invoke_viiiii;
  var invoke_viiiiii=env.invoke_viiiiii;
  var ___setErrNo=env.___setErrNo;
  var ___syscall140=env.___syscall140;
  var ___syscall146=env.___syscall146;
  var ___syscall54=env.___syscall54;
  var ___syscall6=env.___syscall6;
  var _abort=env._abort;
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
 sp = STACKTOP; //@line 568
 STACKTOP = STACKTOP + 16 | 0; //@line 569
 $1 = sp; //@line 570
 do {
  if ($0 >>> 0 < 245) {
   $6 = $0 >>> 0 < 11 ? 16 : $0 + 11 & -8; //@line 577
   $7 = $6 >>> 3; //@line 578
   $8 = HEAP32[864] | 0; //@line 579
   $9 = $8 >>> $7; //@line 580
   if ($9 & 3 | 0) {
    $14 = ($9 & 1 ^ 1) + $7 | 0; //@line 586
    $16 = 3496 + ($14 << 1 << 2) | 0; //@line 588
    $17 = $16 + 8 | 0; //@line 589
    $18 = HEAP32[$17 >> 2] | 0; //@line 590
    $19 = $18 + 8 | 0; //@line 591
    $20 = HEAP32[$19 >> 2] | 0; //@line 592
    do {
     if (($20 | 0) == ($16 | 0)) {
      HEAP32[864] = $8 & ~(1 << $14); //@line 599
     } else {
      if ((HEAP32[868] | 0) >>> 0 > $20 >>> 0) {
       _abort(); //@line 604
      }
      $27 = $20 + 12 | 0; //@line 607
      if ((HEAP32[$27 >> 2] | 0) == ($18 | 0)) {
       HEAP32[$27 >> 2] = $16; //@line 611
       HEAP32[$17 >> 2] = $20; //@line 612
       break;
      } else {
       _abort(); //@line 615
      }
     }
    } while (0);
    $30 = $14 << 3; //@line 620
    HEAP32[$18 + 4 >> 2] = $30 | 3; //@line 623
    $34 = $18 + $30 + 4 | 0; //@line 625
    HEAP32[$34 >> 2] = HEAP32[$34 >> 2] | 1; //@line 628
    $$0 = $19; //@line 629
    STACKTOP = sp; //@line 630
    return $$0 | 0; //@line 630
   }
   $37 = HEAP32[866] | 0; //@line 632
   if ($6 >>> 0 > $37 >>> 0) {
    if ($9 | 0) {
     $41 = 2 << $7; //@line 638
     $44 = $9 << $7 & ($41 | 0 - $41); //@line 641
     $47 = ($44 & 0 - $44) + -1 | 0; //@line 644
     $49 = $47 >>> 12 & 16; //@line 646
     $50 = $47 >>> $49; //@line 647
     $52 = $50 >>> 5 & 8; //@line 649
     $54 = $50 >>> $52; //@line 651
     $56 = $54 >>> 2 & 4; //@line 653
     $58 = $54 >>> $56; //@line 655
     $60 = $58 >>> 1 & 2; //@line 657
     $62 = $58 >>> $60; //@line 659
     $64 = $62 >>> 1 & 1; //@line 661
     $67 = ($52 | $49 | $56 | $60 | $64) + ($62 >>> $64) | 0; //@line 664
     $69 = 3496 + ($67 << 1 << 2) | 0; //@line 666
     $70 = $69 + 8 | 0; //@line 667
     $71 = HEAP32[$70 >> 2] | 0; //@line 668
     $72 = $71 + 8 | 0; //@line 669
     $73 = HEAP32[$72 >> 2] | 0; //@line 670
     do {
      if (($73 | 0) == ($69 | 0)) {
       $77 = $8 & ~(1 << $67); //@line 676
       HEAP32[864] = $77; //@line 677
       $98 = $77; //@line 678
      } else {
       if ((HEAP32[868] | 0) >>> 0 > $73 >>> 0) {
        _abort(); //@line 683
       }
       $80 = $73 + 12 | 0; //@line 686
       if ((HEAP32[$80 >> 2] | 0) == ($71 | 0)) {
        HEAP32[$80 >> 2] = $69; //@line 690
        HEAP32[$70 >> 2] = $73; //@line 691
        $98 = $8; //@line 692
        break;
       } else {
        _abort(); //@line 695
       }
      }
     } while (0);
     $83 = $67 << 3; //@line 700
     $84 = $83 - $6 | 0; //@line 701
     HEAP32[$71 + 4 >> 2] = $6 | 3; //@line 704
     $87 = $71 + $6 | 0; //@line 705
     HEAP32[$87 + 4 >> 2] = $84 | 1; //@line 708
     HEAP32[$71 + $83 >> 2] = $84; //@line 710
     if ($37 | 0) {
      $92 = HEAP32[869] | 0; //@line 713
      $93 = $37 >>> 3; //@line 714
      $95 = 3496 + ($93 << 1 << 2) | 0; //@line 716
      $96 = 1 << $93; //@line 717
      if (!($98 & $96)) {
       HEAP32[864] = $98 | $96; //@line 722
       $$0199 = $95; //@line 724
       $$pre$phiZ2D = $95 + 8 | 0; //@line 724
      } else {
       $101 = $95 + 8 | 0; //@line 726
       $102 = HEAP32[$101 >> 2] | 0; //@line 727
       if ((HEAP32[868] | 0) >>> 0 > $102 >>> 0) {
        _abort(); //@line 731
       } else {
        $$0199 = $102; //@line 734
        $$pre$phiZ2D = $101; //@line 734
       }
      }
      HEAP32[$$pre$phiZ2D >> 2] = $92; //@line 737
      HEAP32[$$0199 + 12 >> 2] = $92; //@line 739
      HEAP32[$92 + 8 >> 2] = $$0199; //@line 741
      HEAP32[$92 + 12 >> 2] = $95; //@line 743
     }
     HEAP32[866] = $84; //@line 745
     HEAP32[869] = $87; //@line 746
     $$0 = $72; //@line 747
     STACKTOP = sp; //@line 748
     return $$0 | 0; //@line 748
    }
    $108 = HEAP32[865] | 0; //@line 750
    if (!$108) {
     $$0197 = $6; //@line 753
    } else {
     $112 = ($108 & 0 - $108) + -1 | 0; //@line 757
     $114 = $112 >>> 12 & 16; //@line 759
     $115 = $112 >>> $114; //@line 760
     $117 = $115 >>> 5 & 8; //@line 762
     $119 = $115 >>> $117; //@line 764
     $121 = $119 >>> 2 & 4; //@line 766
     $123 = $119 >>> $121; //@line 768
     $125 = $123 >>> 1 & 2; //@line 770
     $127 = $123 >>> $125; //@line 772
     $129 = $127 >>> 1 & 1; //@line 774
     $134 = HEAP32[3760 + (($117 | $114 | $121 | $125 | $129) + ($127 >>> $129) << 2) >> 2] | 0; //@line 779
     $138 = (HEAP32[$134 + 4 >> 2] & -8) - $6 | 0; //@line 783
     $143 = HEAP32[$134 + 16 + (((HEAP32[$134 + 16 >> 2] | 0) == 0 & 1) << 2) >> 2] | 0; //@line 789
     if (!$143) {
      $$0192$lcssa$i = $134; //@line 792
      $$0193$lcssa$i = $138; //@line 792
     } else {
      $$01926$i = $134; //@line 794
      $$01935$i = $138; //@line 794
      $146 = $143; //@line 794
      while (1) {
       $149 = (HEAP32[$146 + 4 >> 2] & -8) - $6 | 0; //@line 799
       $150 = $149 >>> 0 < $$01935$i >>> 0; //@line 800
       $$$0193$i = $150 ? $149 : $$01935$i; //@line 801
       $$$0192$i = $150 ? $146 : $$01926$i; //@line 802
       $146 = HEAP32[$146 + 16 + (((HEAP32[$146 + 16 >> 2] | 0) == 0 & 1) << 2) >> 2] | 0; //@line 808
       if (!$146) {
        $$0192$lcssa$i = $$$0192$i; //@line 811
        $$0193$lcssa$i = $$$0193$i; //@line 811
        break;
       } else {
        $$01926$i = $$$0192$i; //@line 814
        $$01935$i = $$$0193$i; //@line 814
       }
      }
     }
     $157 = HEAP32[868] | 0; //@line 818
     if ($157 >>> 0 > $$0192$lcssa$i >>> 0) {
      _abort(); //@line 821
     }
     $159 = $$0192$lcssa$i + $6 | 0; //@line 824
     if ($159 >>> 0 <= $$0192$lcssa$i >>> 0) {
      _abort(); //@line 827
     }
     $162 = HEAP32[$$0192$lcssa$i + 24 >> 2] | 0; //@line 831
     $164 = HEAP32[$$0192$lcssa$i + 12 >> 2] | 0; //@line 833
     do {
      if (($164 | 0) == ($$0192$lcssa$i | 0)) {
       $175 = $$0192$lcssa$i + 20 | 0; //@line 837
       $176 = HEAP32[$175 >> 2] | 0; //@line 838
       if (!$176) {
        $178 = $$0192$lcssa$i + 16 | 0; //@line 841
        $179 = HEAP32[$178 >> 2] | 0; //@line 842
        if (!$179) {
         $$3$i = 0; //@line 845
         break;
        } else {
         $$1196$i = $179; //@line 848
         $$1198$i = $178; //@line 848
        }
       } else {
        $$1196$i = $176; //@line 851
        $$1198$i = $175; //@line 851
       }
       while (1) {
        $181 = $$1196$i + 20 | 0; //@line 854
        $182 = HEAP32[$181 >> 2] | 0; //@line 855
        if ($182 | 0) {
         $$1196$i = $182; //@line 858
         $$1198$i = $181; //@line 858
         continue;
        }
        $184 = $$1196$i + 16 | 0; //@line 861
        $185 = HEAP32[$184 >> 2] | 0; //@line 862
        if (!$185) {
         break;
        } else {
         $$1196$i = $185; //@line 867
         $$1198$i = $184; //@line 867
        }
       }
       if ($157 >>> 0 > $$1198$i >>> 0) {
        _abort(); //@line 872
       } else {
        HEAP32[$$1198$i >> 2] = 0; //@line 875
        $$3$i = $$1196$i; //@line 876
        break;
       }
      } else {
       $167 = HEAP32[$$0192$lcssa$i + 8 >> 2] | 0; //@line 881
       if ($157 >>> 0 > $167 >>> 0) {
        _abort(); //@line 884
       }
       $169 = $167 + 12 | 0; //@line 887
       if ((HEAP32[$169 >> 2] | 0) != ($$0192$lcssa$i | 0)) {
        _abort(); //@line 891
       }
       $172 = $164 + 8 | 0; //@line 894
       if ((HEAP32[$172 >> 2] | 0) == ($$0192$lcssa$i | 0)) {
        HEAP32[$169 >> 2] = $164; //@line 898
        HEAP32[$172 >> 2] = $167; //@line 899
        $$3$i = $164; //@line 900
        break;
       } else {
        _abort(); //@line 903
       }
      }
     } while (0);
     L73 : do {
      if ($162 | 0) {
       $190 = HEAP32[$$0192$lcssa$i + 28 >> 2] | 0; //@line 912
       $191 = 3760 + ($190 << 2) | 0; //@line 913
       do {
        if (($$0192$lcssa$i | 0) == (HEAP32[$191 >> 2] | 0)) {
         HEAP32[$191 >> 2] = $$3$i; //@line 918
         if (!$$3$i) {
          HEAP32[865] = $108 & ~(1 << $190); //@line 924
          break L73;
         }
        } else {
         if ((HEAP32[868] | 0) >>> 0 > $162 >>> 0) {
          _abort(); //@line 931
         } else {
          HEAP32[$162 + 16 + (((HEAP32[$162 + 16 >> 2] | 0) != ($$0192$lcssa$i | 0) & 1) << 2) >> 2] = $$3$i; //@line 939
          if (!$$3$i) {
           break L73;
          } else {
           break;
          }
         }
        }
       } while (0);
       $204 = HEAP32[868] | 0; //@line 949
       if ($204 >>> 0 > $$3$i >>> 0) {
        _abort(); //@line 952
       }
       HEAP32[$$3$i + 24 >> 2] = $162; //@line 956
       $208 = HEAP32[$$0192$lcssa$i + 16 >> 2] | 0; //@line 958
       do {
        if ($208 | 0) {
         if ($204 >>> 0 > $208 >>> 0) {
          _abort(); //@line 964
         } else {
          HEAP32[$$3$i + 16 >> 2] = $208; //@line 968
          HEAP32[$208 + 24 >> 2] = $$3$i; //@line 970
          break;
         }
        }
       } while (0);
       $214 = HEAP32[$$0192$lcssa$i + 20 >> 2] | 0; //@line 976
       if ($214 | 0) {
        if ((HEAP32[868] | 0) >>> 0 > $214 >>> 0) {
         _abort(); //@line 982
        } else {
         HEAP32[$$3$i + 20 >> 2] = $214; //@line 986
         HEAP32[$214 + 24 >> 2] = $$3$i; //@line 988
         break;
        }
       }
      }
     } while (0);
     if ($$0193$lcssa$i >>> 0 < 16) {
      $221 = $$0193$lcssa$i + $6 | 0; //@line 996
      HEAP32[$$0192$lcssa$i + 4 >> 2] = $221 | 3; //@line 999
      $225 = $$0192$lcssa$i + $221 + 4 | 0; //@line 1001
      HEAP32[$225 >> 2] = HEAP32[$225 >> 2] | 1; //@line 1004
     } else {
      HEAP32[$$0192$lcssa$i + 4 >> 2] = $6 | 3; //@line 1008
      HEAP32[$159 + 4 >> 2] = $$0193$lcssa$i | 1; //@line 1011
      HEAP32[$159 + $$0193$lcssa$i >> 2] = $$0193$lcssa$i; //@line 1013
      if ($37 | 0) {
       $234 = HEAP32[869] | 0; //@line 1016
       $235 = $37 >>> 3; //@line 1017
       $237 = 3496 + ($235 << 1 << 2) | 0; //@line 1019
       $238 = 1 << $235; //@line 1020
       if (!($8 & $238)) {
        HEAP32[864] = $8 | $238; //@line 1025
        $$0189$i = $237; //@line 1027
        $$pre$phi$iZ2D = $237 + 8 | 0; //@line 1027
       } else {
        $242 = $237 + 8 | 0; //@line 1029
        $243 = HEAP32[$242 >> 2] | 0; //@line 1030
        if ((HEAP32[868] | 0) >>> 0 > $243 >>> 0) {
         _abort(); //@line 1034
        } else {
         $$0189$i = $243; //@line 1037
         $$pre$phi$iZ2D = $242; //@line 1037
        }
       }
       HEAP32[$$pre$phi$iZ2D >> 2] = $234; //@line 1040
       HEAP32[$$0189$i + 12 >> 2] = $234; //@line 1042
       HEAP32[$234 + 8 >> 2] = $$0189$i; //@line 1044
       HEAP32[$234 + 12 >> 2] = $237; //@line 1046
      }
      HEAP32[866] = $$0193$lcssa$i; //@line 1048
      HEAP32[869] = $159; //@line 1049
     }
     $$0 = $$0192$lcssa$i + 8 | 0; //@line 1052
     STACKTOP = sp; //@line 1053
     return $$0 | 0; //@line 1053
    }
   } else {
    $$0197 = $6; //@line 1056
   }
  } else {
   if ($0 >>> 0 > 4294967231) {
    $$0197 = -1; //@line 1061
   } else {
    $251 = $0 + 11 | 0; //@line 1063
    $252 = $251 & -8; //@line 1064
    $253 = HEAP32[865] | 0; //@line 1065
    if (!$253) {
     $$0197 = $252; //@line 1068
    } else {
     $255 = 0 - $252 | 0; //@line 1070
     $256 = $251 >>> 8; //@line 1071
     if (!$256) {
      $$0358$i = 0; //@line 1074
     } else {
      if ($252 >>> 0 > 16777215) {
       $$0358$i = 31; //@line 1078
      } else {
       $261 = ($256 + 1048320 | 0) >>> 16 & 8; //@line 1082
       $262 = $256 << $261; //@line 1083
       $265 = ($262 + 520192 | 0) >>> 16 & 4; //@line 1086
       $267 = $262 << $265; //@line 1088
       $270 = ($267 + 245760 | 0) >>> 16 & 2; //@line 1091
       $275 = 14 - ($265 | $261 | $270) + ($267 << $270 >>> 15) | 0; //@line 1096
       $$0358$i = $252 >>> ($275 + 7 | 0) & 1 | $275 << 1; //@line 1102
      }
     }
     $282 = HEAP32[3760 + ($$0358$i << 2) >> 2] | 0; //@line 1106
     L117 : do {
      if (!$282) {
       $$2355$i = 0; //@line 1110
       $$3$i203 = 0; //@line 1110
       $$3350$i = $255; //@line 1110
       label = 81; //@line 1111
      } else {
       $$0342$i = 0; //@line 1118
       $$0347$i = $255; //@line 1118
       $$0353$i = $282; //@line 1118
       $$0359$i = $252 << (($$0358$i | 0) == 31 ? 0 : 25 - ($$0358$i >>> 1) | 0); //@line 1118
       $$0362$i = 0; //@line 1118
       while (1) {
        $292 = (HEAP32[$$0353$i + 4 >> 2] & -8) - $252 | 0; //@line 1123
        if ($292 >>> 0 < $$0347$i >>> 0) {
         if (!$292) {
          $$414$i = $$0353$i; //@line 1128
          $$435113$i = 0; //@line 1128
          $$435712$i = $$0353$i; //@line 1128
          label = 85; //@line 1129
          break L117;
         } else {
          $$1343$i = $$0353$i; //@line 1132
          $$1348$i = $292; //@line 1132
         }
        } else {
         $$1343$i = $$0342$i; //@line 1135
         $$1348$i = $$0347$i; //@line 1135
        }
        $296 = HEAP32[$$0353$i + 20 >> 2] | 0; //@line 1138
        $$0353$i = HEAP32[$$0353$i + 16 + ($$0359$i >>> 31 << 2) >> 2] | 0; //@line 1141
        $$1363$i = ($296 | 0) == 0 | ($296 | 0) == ($$0353$i | 0) ? $$0362$i : $296; //@line 1145
        $302 = ($$0353$i | 0) == 0; //@line 1146
        if ($302) {
         $$2355$i = $$1363$i; //@line 1151
         $$3$i203 = $$1343$i; //@line 1151
         $$3350$i = $$1348$i; //@line 1151
         label = 81; //@line 1152
         break;
        } else {
         $$0342$i = $$1343$i; //@line 1155
         $$0347$i = $$1348$i; //@line 1155
         $$0359$i = $$0359$i << (($302 ^ 1) & 1); //@line 1155
         $$0362$i = $$1363$i; //@line 1155
        }
       }
      }
     } while (0);
     if ((label | 0) == 81) {
      if (($$2355$i | 0) == 0 & ($$3$i203 | 0) == 0) {
       $306 = 2 << $$0358$i; //@line 1165
       $309 = $253 & ($306 | 0 - $306); //@line 1168
       if (!$309) {
        $$0197 = $252; //@line 1171
        break;
       }
       $313 = ($309 & 0 - $309) + -1 | 0; //@line 1176
       $315 = $313 >>> 12 & 16; //@line 1178
       $316 = $313 >>> $315; //@line 1179
       $318 = $316 >>> 5 & 8; //@line 1181
       $320 = $316 >>> $318; //@line 1183
       $322 = $320 >>> 2 & 4; //@line 1185
       $324 = $320 >>> $322; //@line 1187
       $326 = $324 >>> 1 & 2; //@line 1189
       $328 = $324 >>> $326; //@line 1191
       $330 = $328 >>> 1 & 1; //@line 1193
       $$4$ph$i = 0; //@line 1199
       $$4357$ph$i = HEAP32[3760 + (($318 | $315 | $322 | $326 | $330) + ($328 >>> $330) << 2) >> 2] | 0; //@line 1199
      } else {
       $$4$ph$i = $$3$i203; //@line 1201
       $$4357$ph$i = $$2355$i; //@line 1201
      }
      if (!$$4357$ph$i) {
       $$4$lcssa$i = $$4$ph$i; //@line 1205
       $$4351$lcssa$i = $$3350$i; //@line 1205
      } else {
       $$414$i = $$4$ph$i; //@line 1207
       $$435113$i = $$3350$i; //@line 1207
       $$435712$i = $$4357$ph$i; //@line 1207
       label = 85; //@line 1208
      }
     }
     if ((label | 0) == 85) {
      while (1) {
       label = 0; //@line 1213
       $340 = (HEAP32[$$435712$i + 4 >> 2] & -8) - $252 | 0; //@line 1217
       $341 = $340 >>> 0 < $$435113$i >>> 0; //@line 1218
       $$$4351$i = $341 ? $340 : $$435113$i; //@line 1219
       $$4357$$4$i = $341 ? $$435712$i : $$414$i; //@line 1220
       $$435712$i = HEAP32[$$435712$i + 16 + (((HEAP32[$$435712$i + 16 >> 2] | 0) == 0 & 1) << 2) >> 2] | 0; //@line 1226
       if (!$$435712$i) {
        $$4$lcssa$i = $$4357$$4$i; //@line 1229
        $$4351$lcssa$i = $$$4351$i; //@line 1229
        break;
       } else {
        $$414$i = $$4357$$4$i; //@line 1232
        $$435113$i = $$$4351$i; //@line 1232
        label = 85; //@line 1233
       }
      }
     }
     if (!$$4$lcssa$i) {
      $$0197 = $252; //@line 1239
     } else {
      if ($$4351$lcssa$i >>> 0 < ((HEAP32[866] | 0) - $252 | 0) >>> 0) {
       $352 = HEAP32[868] | 0; //@line 1245
       if ($352 >>> 0 > $$4$lcssa$i >>> 0) {
        _abort(); //@line 1248
       }
       $354 = $$4$lcssa$i + $252 | 0; //@line 1251
       if ($354 >>> 0 <= $$4$lcssa$i >>> 0) {
        _abort(); //@line 1254
       }
       $357 = HEAP32[$$4$lcssa$i + 24 >> 2] | 0; //@line 1258
       $359 = HEAP32[$$4$lcssa$i + 12 >> 2] | 0; //@line 1260
       do {
        if (($359 | 0) == ($$4$lcssa$i | 0)) {
         $370 = $$4$lcssa$i + 20 | 0; //@line 1264
         $371 = HEAP32[$370 >> 2] | 0; //@line 1265
         if (!$371) {
          $373 = $$4$lcssa$i + 16 | 0; //@line 1268
          $374 = HEAP32[$373 >> 2] | 0; //@line 1269
          if (!$374) {
           $$3372$i = 0; //@line 1272
           break;
          } else {
           $$1370$i = $374; //@line 1275
           $$1374$i = $373; //@line 1275
          }
         } else {
          $$1370$i = $371; //@line 1278
          $$1374$i = $370; //@line 1278
         }
         while (1) {
          $376 = $$1370$i + 20 | 0; //@line 1281
          $377 = HEAP32[$376 >> 2] | 0; //@line 1282
          if ($377 | 0) {
           $$1370$i = $377; //@line 1285
           $$1374$i = $376; //@line 1285
           continue;
          }
          $379 = $$1370$i + 16 | 0; //@line 1288
          $380 = HEAP32[$379 >> 2] | 0; //@line 1289
          if (!$380) {
           break;
          } else {
           $$1370$i = $380; //@line 1294
           $$1374$i = $379; //@line 1294
          }
         }
         if ($352 >>> 0 > $$1374$i >>> 0) {
          _abort(); //@line 1299
         } else {
          HEAP32[$$1374$i >> 2] = 0; //@line 1302
          $$3372$i = $$1370$i; //@line 1303
          break;
         }
        } else {
         $362 = HEAP32[$$4$lcssa$i + 8 >> 2] | 0; //@line 1308
         if ($352 >>> 0 > $362 >>> 0) {
          _abort(); //@line 1311
         }
         $364 = $362 + 12 | 0; //@line 1314
         if ((HEAP32[$364 >> 2] | 0) != ($$4$lcssa$i | 0)) {
          _abort(); //@line 1318
         }
         $367 = $359 + 8 | 0; //@line 1321
         if ((HEAP32[$367 >> 2] | 0) == ($$4$lcssa$i | 0)) {
          HEAP32[$364 >> 2] = $359; //@line 1325
          HEAP32[$367 >> 2] = $362; //@line 1326
          $$3372$i = $359; //@line 1327
          break;
         } else {
          _abort(); //@line 1330
         }
        }
       } while (0);
       L164 : do {
        if (!$357) {
         $475 = $253; //@line 1338
        } else {
         $385 = HEAP32[$$4$lcssa$i + 28 >> 2] | 0; //@line 1341
         $386 = 3760 + ($385 << 2) | 0; //@line 1342
         do {
          if (($$4$lcssa$i | 0) == (HEAP32[$386 >> 2] | 0)) {
           HEAP32[$386 >> 2] = $$3372$i; //@line 1347
           if (!$$3372$i) {
            $391 = $253 & ~(1 << $385); //@line 1352
            HEAP32[865] = $391; //@line 1353
            $475 = $391; //@line 1354
            break L164;
           }
          } else {
           if ((HEAP32[868] | 0) >>> 0 > $357 >>> 0) {
            _abort(); //@line 1361
           } else {
            HEAP32[$357 + 16 + (((HEAP32[$357 + 16 >> 2] | 0) != ($$4$lcssa$i | 0) & 1) << 2) >> 2] = $$3372$i; //@line 1369
            if (!$$3372$i) {
             $475 = $253; //@line 1372
             break L164;
            } else {
             break;
            }
           }
          }
         } while (0);
         $399 = HEAP32[868] | 0; //@line 1380
         if ($399 >>> 0 > $$3372$i >>> 0) {
          _abort(); //@line 1383
         }
         HEAP32[$$3372$i + 24 >> 2] = $357; //@line 1387
         $403 = HEAP32[$$4$lcssa$i + 16 >> 2] | 0; //@line 1389
         do {
          if ($403 | 0) {
           if ($399 >>> 0 > $403 >>> 0) {
            _abort(); //@line 1395
           } else {
            HEAP32[$$3372$i + 16 >> 2] = $403; //@line 1399
            HEAP32[$403 + 24 >> 2] = $$3372$i; //@line 1401
            break;
           }
          }
         } while (0);
         $409 = HEAP32[$$4$lcssa$i + 20 >> 2] | 0; //@line 1407
         if (!$409) {
          $475 = $253; //@line 1410
         } else {
          if ((HEAP32[868] | 0) >>> 0 > $409 >>> 0) {
           _abort(); //@line 1415
          } else {
           HEAP32[$$3372$i + 20 >> 2] = $409; //@line 1419
           HEAP32[$409 + 24 >> 2] = $$3372$i; //@line 1421
           $475 = $253; //@line 1422
           break;
          }
         }
        }
       } while (0);
       do {
        if ($$4351$lcssa$i >>> 0 < 16) {
         $416 = $$4351$lcssa$i + $252 | 0; //@line 1431
         HEAP32[$$4$lcssa$i + 4 >> 2] = $416 | 3; //@line 1434
         $420 = $$4$lcssa$i + $416 + 4 | 0; //@line 1436
         HEAP32[$420 >> 2] = HEAP32[$420 >> 2] | 1; //@line 1439
        } else {
         HEAP32[$$4$lcssa$i + 4 >> 2] = $252 | 3; //@line 1443
         HEAP32[$354 + 4 >> 2] = $$4351$lcssa$i | 1; //@line 1446
         HEAP32[$354 + $$4351$lcssa$i >> 2] = $$4351$lcssa$i; //@line 1448
         $428 = $$4351$lcssa$i >>> 3; //@line 1449
         if ($$4351$lcssa$i >>> 0 < 256) {
          $431 = 3496 + ($428 << 1 << 2) | 0; //@line 1453
          $432 = HEAP32[864] | 0; //@line 1454
          $433 = 1 << $428; //@line 1455
          if (!($432 & $433)) {
           HEAP32[864] = $432 | $433; //@line 1460
           $$0368$i = $431; //@line 1462
           $$pre$phi$i211Z2D = $431 + 8 | 0; //@line 1462
          } else {
           $437 = $431 + 8 | 0; //@line 1464
           $438 = HEAP32[$437 >> 2] | 0; //@line 1465
           if ((HEAP32[868] | 0) >>> 0 > $438 >>> 0) {
            _abort(); //@line 1469
           } else {
            $$0368$i = $438; //@line 1472
            $$pre$phi$i211Z2D = $437; //@line 1472
           }
          }
          HEAP32[$$pre$phi$i211Z2D >> 2] = $354; //@line 1475
          HEAP32[$$0368$i + 12 >> 2] = $354; //@line 1477
          HEAP32[$354 + 8 >> 2] = $$0368$i; //@line 1479
          HEAP32[$354 + 12 >> 2] = $431; //@line 1481
          break;
         }
         $444 = $$4351$lcssa$i >>> 8; //@line 1484
         if (!$444) {
          $$0361$i = 0; //@line 1487
         } else {
          if ($$4351$lcssa$i >>> 0 > 16777215) {
           $$0361$i = 31; //@line 1491
          } else {
           $449 = ($444 + 1048320 | 0) >>> 16 & 8; //@line 1495
           $450 = $444 << $449; //@line 1496
           $453 = ($450 + 520192 | 0) >>> 16 & 4; //@line 1499
           $455 = $450 << $453; //@line 1501
           $458 = ($455 + 245760 | 0) >>> 16 & 2; //@line 1504
           $463 = 14 - ($453 | $449 | $458) + ($455 << $458 >>> 15) | 0; //@line 1509
           $$0361$i = $$4351$lcssa$i >>> ($463 + 7 | 0) & 1 | $463 << 1; //@line 1515
          }
         }
         $469 = 3760 + ($$0361$i << 2) | 0; //@line 1518
         HEAP32[$354 + 28 >> 2] = $$0361$i; //@line 1520
         $471 = $354 + 16 | 0; //@line 1521
         HEAP32[$471 + 4 >> 2] = 0; //@line 1523
         HEAP32[$471 >> 2] = 0; //@line 1524
         $473 = 1 << $$0361$i; //@line 1525
         if (!($475 & $473)) {
          HEAP32[865] = $475 | $473; //@line 1530
          HEAP32[$469 >> 2] = $354; //@line 1531
          HEAP32[$354 + 24 >> 2] = $469; //@line 1533
          HEAP32[$354 + 12 >> 2] = $354; //@line 1535
          HEAP32[$354 + 8 >> 2] = $354; //@line 1537
          break;
         }
         $$0344$i = $$4351$lcssa$i << (($$0361$i | 0) == 31 ? 0 : 25 - ($$0361$i >>> 1) | 0); //@line 1546
         $$0345$i = HEAP32[$469 >> 2] | 0; //@line 1546
         while (1) {
          if ((HEAP32[$$0345$i + 4 >> 2] & -8 | 0) == ($$4351$lcssa$i | 0)) {
           label = 139; //@line 1553
           break;
          }
          $492 = $$0345$i + 16 + ($$0344$i >>> 31 << 2) | 0; //@line 1557
          $494 = HEAP32[$492 >> 2] | 0; //@line 1559
          if (!$494) {
           label = 136; //@line 1562
           break;
          } else {
           $$0344$i = $$0344$i << 1; //@line 1565
           $$0345$i = $494; //@line 1565
          }
         }
         if ((label | 0) == 136) {
          if ((HEAP32[868] | 0) >>> 0 > $492 >>> 0) {
           _abort(); //@line 1572
          } else {
           HEAP32[$492 >> 2] = $354; //@line 1575
           HEAP32[$354 + 24 >> 2] = $$0345$i; //@line 1577
           HEAP32[$354 + 12 >> 2] = $354; //@line 1579
           HEAP32[$354 + 8 >> 2] = $354; //@line 1581
           break;
          }
         } else if ((label | 0) == 139) {
          $501 = $$0345$i + 8 | 0; //@line 1586
          $502 = HEAP32[$501 >> 2] | 0; //@line 1587
          $503 = HEAP32[868] | 0; //@line 1588
          if ($503 >>> 0 <= $502 >>> 0 & $503 >>> 0 <= $$0345$i >>> 0) {
           HEAP32[$502 + 12 >> 2] = $354; //@line 1594
           HEAP32[$501 >> 2] = $354; //@line 1595
           HEAP32[$354 + 8 >> 2] = $502; //@line 1597
           HEAP32[$354 + 12 >> 2] = $$0345$i; //@line 1599
           HEAP32[$354 + 24 >> 2] = 0; //@line 1601
           break;
          } else {
           _abort(); //@line 1604
          }
         }
        }
       } while (0);
       $$0 = $$4$lcssa$i + 8 | 0; //@line 1611
       STACKTOP = sp; //@line 1612
       return $$0 | 0; //@line 1612
      } else {
       $$0197 = $252; //@line 1614
      }
     }
    }
   }
  }
 } while (0);
 $512 = HEAP32[866] | 0; //@line 1621
 if ($512 >>> 0 >= $$0197 >>> 0) {
  $514 = $512 - $$0197 | 0; //@line 1624
  $515 = HEAP32[869] | 0; //@line 1625
  if ($514 >>> 0 > 15) {
   $517 = $515 + $$0197 | 0; //@line 1628
   HEAP32[869] = $517; //@line 1629
   HEAP32[866] = $514; //@line 1630
   HEAP32[$517 + 4 >> 2] = $514 | 1; //@line 1633
   HEAP32[$515 + $512 >> 2] = $514; //@line 1635
   HEAP32[$515 + 4 >> 2] = $$0197 | 3; //@line 1638
  } else {
   HEAP32[866] = 0; //@line 1640
   HEAP32[869] = 0; //@line 1641
   HEAP32[$515 + 4 >> 2] = $512 | 3; //@line 1644
   $526 = $515 + $512 + 4 | 0; //@line 1646
   HEAP32[$526 >> 2] = HEAP32[$526 >> 2] | 1; //@line 1649
  }
  $$0 = $515 + 8 | 0; //@line 1652
  STACKTOP = sp; //@line 1653
  return $$0 | 0; //@line 1653
 }
 $530 = HEAP32[867] | 0; //@line 1655
 if ($530 >>> 0 > $$0197 >>> 0) {
  $532 = $530 - $$0197 | 0; //@line 1658
  HEAP32[867] = $532; //@line 1659
  $533 = HEAP32[870] | 0; //@line 1660
  $534 = $533 + $$0197 | 0; //@line 1661
  HEAP32[870] = $534; //@line 1662
  HEAP32[$534 + 4 >> 2] = $532 | 1; //@line 1665
  HEAP32[$533 + 4 >> 2] = $$0197 | 3; //@line 1668
  $$0 = $533 + 8 | 0; //@line 1670
  STACKTOP = sp; //@line 1671
  return $$0 | 0; //@line 1671
 }
 if (!(HEAP32[982] | 0)) {
  HEAP32[984] = 4096; //@line 1676
  HEAP32[983] = 4096; //@line 1677
  HEAP32[985] = -1; //@line 1678
  HEAP32[986] = -1; //@line 1679
  HEAP32[987] = 0; //@line 1680
  HEAP32[975] = 0; //@line 1681
  HEAP32[982] = $1 & -16 ^ 1431655768; //@line 1685
  $548 = 4096; //@line 1686
 } else {
  $548 = HEAP32[984] | 0; //@line 1689
 }
 $545 = $$0197 + 48 | 0; //@line 1691
 $546 = $$0197 + 47 | 0; //@line 1692
 $547 = $548 + $546 | 0; //@line 1693
 $549 = 0 - $548 | 0; //@line 1694
 $550 = $547 & $549; //@line 1695
 if ($550 >>> 0 <= $$0197 >>> 0) {
  $$0 = 0; //@line 1698
  STACKTOP = sp; //@line 1699
  return $$0 | 0; //@line 1699
 }
 $552 = HEAP32[974] | 0; //@line 1701
 if ($552 | 0) {
  $554 = HEAP32[972] | 0; //@line 1704
  $555 = $554 + $550 | 0; //@line 1705
  if ($555 >>> 0 <= $554 >>> 0 | $555 >>> 0 > $552 >>> 0) {
   $$0 = 0; //@line 1710
   STACKTOP = sp; //@line 1711
   return $$0 | 0; //@line 1711
  }
 }
 L244 : do {
  if (!(HEAP32[975] & 4)) {
   $561 = HEAP32[870] | 0; //@line 1719
   L246 : do {
    if (!$561) {
     label = 163; //@line 1723
    } else {
     $$0$i$i = 3904; //@line 1725
     while (1) {
      $563 = HEAP32[$$0$i$i >> 2] | 0; //@line 1727
      if ($563 >>> 0 <= $561 >>> 0) {
       $565 = $$0$i$i + 4 | 0; //@line 1730
       if (($563 + (HEAP32[$565 >> 2] | 0) | 0) >>> 0 > $561 >>> 0) {
        break;
       }
      }
      $570 = HEAP32[$$0$i$i + 8 >> 2] | 0; //@line 1739
      if (!$570) {
       label = 163; //@line 1742
       break L246;
      } else {
       $$0$i$i = $570; //@line 1745
      }
     }
     $595 = $547 - $530 & $549; //@line 1749
     if ($595 >>> 0 < 2147483647) {
      $597 = _sbrk($595 | 0) | 0; //@line 1752
      if (($597 | 0) == ((HEAP32[$$0$i$i >> 2] | 0) + (HEAP32[$565 >> 2] | 0) | 0)) {
       if (($597 | 0) == (-1 | 0)) {
        $$2234243136$i = $595; //@line 1760
       } else {
        $$723947$i = $595; //@line 1762
        $$748$i = $597; //@line 1762
        label = 180; //@line 1763
        break L244;
       }
      } else {
       $$2247$ph$i = $597; //@line 1767
       $$2253$ph$i = $595; //@line 1767
       label = 171; //@line 1768
      }
     } else {
      $$2234243136$i = 0; //@line 1771
     }
    }
   } while (0);
   do {
    if ((label | 0) == 163) {
     $572 = _sbrk(0) | 0; //@line 1777
     if (($572 | 0) == (-1 | 0)) {
      $$2234243136$i = 0; //@line 1780
     } else {
      $574 = $572; //@line 1782
      $575 = HEAP32[983] | 0; //@line 1783
      $576 = $575 + -1 | 0; //@line 1784
      $$$i = (($576 & $574 | 0) == 0 ? 0 : ($576 + $574 & 0 - $575) - $574 | 0) + $550 | 0; //@line 1792
      $584 = HEAP32[972] | 0; //@line 1793
      $585 = $$$i + $584 | 0; //@line 1794
      if ($$$i >>> 0 > $$0197 >>> 0 & $$$i >>> 0 < 2147483647) {
       $588 = HEAP32[974] | 0; //@line 1799
       if ($588 | 0) {
        if ($585 >>> 0 <= $584 >>> 0 | $585 >>> 0 > $588 >>> 0) {
         $$2234243136$i = 0; //@line 1806
         break;
        }
       }
       $592 = _sbrk($$$i | 0) | 0; //@line 1810
       if (($592 | 0) == ($572 | 0)) {
        $$723947$i = $$$i; //@line 1813
        $$748$i = $572; //@line 1813
        label = 180; //@line 1814
        break L244;
       } else {
        $$2247$ph$i = $592; //@line 1817
        $$2253$ph$i = $$$i; //@line 1817
        label = 171; //@line 1818
       }
      } else {
       $$2234243136$i = 0; //@line 1821
      }
     }
    }
   } while (0);
   do {
    if ((label | 0) == 171) {
     $603 = 0 - $$2253$ph$i | 0; //@line 1828
     if (!($545 >>> 0 > $$2253$ph$i >>> 0 & ($$2253$ph$i >>> 0 < 2147483647 & ($$2247$ph$i | 0) != (-1 | 0)))) {
      if (($$2247$ph$i | 0) == (-1 | 0)) {
       $$2234243136$i = 0; //@line 1837
       break;
      } else {
       $$723947$i = $$2253$ph$i; //@line 1840
       $$748$i = $$2247$ph$i; //@line 1840
       label = 180; //@line 1841
       break L244;
      }
     }
     $607 = HEAP32[984] | 0; //@line 1845
     $611 = $546 - $$2253$ph$i + $607 & 0 - $607; //@line 1849
     if ($611 >>> 0 >= 2147483647) {
      $$723947$i = $$2253$ph$i; //@line 1852
      $$748$i = $$2247$ph$i; //@line 1852
      label = 180; //@line 1853
      break L244;
     }
     if ((_sbrk($611 | 0) | 0) == (-1 | 0)) {
      _sbrk($603 | 0) | 0; //@line 1859
      $$2234243136$i = 0; //@line 1860
      break;
     } else {
      $$723947$i = $611 + $$2253$ph$i | 0; //@line 1864
      $$748$i = $$2247$ph$i; //@line 1864
      label = 180; //@line 1865
      break L244;
     }
    }
   } while (0);
   HEAP32[975] = HEAP32[975] | 4; //@line 1872
   $$4236$i = $$2234243136$i; //@line 1873
   label = 178; //@line 1874
  } else {
   $$4236$i = 0; //@line 1876
   label = 178; //@line 1877
  }
 } while (0);
 if ((label | 0) == 178) {
  if ($550 >>> 0 < 2147483647) {
   $620 = _sbrk($550 | 0) | 0; //@line 1883
   $621 = _sbrk(0) | 0; //@line 1884
   $627 = $621 - $620 | 0; //@line 1892
   $629 = $627 >>> 0 > ($$0197 + 40 | 0) >>> 0; //@line 1894
   if (!(($620 | 0) == (-1 | 0) | $629 ^ 1 | $620 >>> 0 < $621 >>> 0 & (($620 | 0) != (-1 | 0) & ($621 | 0) != (-1 | 0)) ^ 1)) {
    $$723947$i = $629 ? $627 : $$4236$i; //@line 1902
    $$748$i = $620; //@line 1902
    label = 180; //@line 1903
   }
  }
 }
 if ((label | 0) == 180) {
  $633 = (HEAP32[972] | 0) + $$723947$i | 0; //@line 1909
  HEAP32[972] = $633; //@line 1910
  if ($633 >>> 0 > (HEAP32[973] | 0) >>> 0) {
   HEAP32[973] = $633; //@line 1914
  }
  $636 = HEAP32[870] | 0; //@line 1916
  do {
   if (!$636) {
    $638 = HEAP32[868] | 0; //@line 1920
    if (($638 | 0) == 0 | $$748$i >>> 0 < $638 >>> 0) {
     HEAP32[868] = $$748$i; //@line 1925
    }
    HEAP32[976] = $$748$i; //@line 1927
    HEAP32[977] = $$723947$i; //@line 1928
    HEAP32[979] = 0; //@line 1929
    HEAP32[873] = HEAP32[982]; //@line 1931
    HEAP32[872] = -1; //@line 1932
    HEAP32[877] = 3496; //@line 1933
    HEAP32[876] = 3496; //@line 1934
    HEAP32[879] = 3504; //@line 1935
    HEAP32[878] = 3504; //@line 1936
    HEAP32[881] = 3512; //@line 1937
    HEAP32[880] = 3512; //@line 1938
    HEAP32[883] = 3520; //@line 1939
    HEAP32[882] = 3520; //@line 1940
    HEAP32[885] = 3528; //@line 1941
    HEAP32[884] = 3528; //@line 1942
    HEAP32[887] = 3536; //@line 1943
    HEAP32[886] = 3536; //@line 1944
    HEAP32[889] = 3544; //@line 1945
    HEAP32[888] = 3544; //@line 1946
    HEAP32[891] = 3552; //@line 1947
    HEAP32[890] = 3552; //@line 1948
    HEAP32[893] = 3560; //@line 1949
    HEAP32[892] = 3560; //@line 1950
    HEAP32[895] = 3568; //@line 1951
    HEAP32[894] = 3568; //@line 1952
    HEAP32[897] = 3576; //@line 1953
    HEAP32[896] = 3576; //@line 1954
    HEAP32[899] = 3584; //@line 1955
    HEAP32[898] = 3584; //@line 1956
    HEAP32[901] = 3592; //@line 1957
    HEAP32[900] = 3592; //@line 1958
    HEAP32[903] = 3600; //@line 1959
    HEAP32[902] = 3600; //@line 1960
    HEAP32[905] = 3608; //@line 1961
    HEAP32[904] = 3608; //@line 1962
    HEAP32[907] = 3616; //@line 1963
    HEAP32[906] = 3616; //@line 1964
    HEAP32[909] = 3624; //@line 1965
    HEAP32[908] = 3624; //@line 1966
    HEAP32[911] = 3632; //@line 1967
    HEAP32[910] = 3632; //@line 1968
    HEAP32[913] = 3640; //@line 1969
    HEAP32[912] = 3640; //@line 1970
    HEAP32[915] = 3648; //@line 1971
    HEAP32[914] = 3648; //@line 1972
    HEAP32[917] = 3656; //@line 1973
    HEAP32[916] = 3656; //@line 1974
    HEAP32[919] = 3664; //@line 1975
    HEAP32[918] = 3664; //@line 1976
    HEAP32[921] = 3672; //@line 1977
    HEAP32[920] = 3672; //@line 1978
    HEAP32[923] = 3680; //@line 1979
    HEAP32[922] = 3680; //@line 1980
    HEAP32[925] = 3688; //@line 1981
    HEAP32[924] = 3688; //@line 1982
    HEAP32[927] = 3696; //@line 1983
    HEAP32[926] = 3696; //@line 1984
    HEAP32[929] = 3704; //@line 1985
    HEAP32[928] = 3704; //@line 1986
    HEAP32[931] = 3712; //@line 1987
    HEAP32[930] = 3712; //@line 1988
    HEAP32[933] = 3720; //@line 1989
    HEAP32[932] = 3720; //@line 1990
    HEAP32[935] = 3728; //@line 1991
    HEAP32[934] = 3728; //@line 1992
    HEAP32[937] = 3736; //@line 1993
    HEAP32[936] = 3736; //@line 1994
    HEAP32[939] = 3744; //@line 1995
    HEAP32[938] = 3744; //@line 1996
    $642 = $$723947$i + -40 | 0; //@line 1997
    $644 = $$748$i + 8 | 0; //@line 1999
    $649 = ($644 & 7 | 0) == 0 ? 0 : 0 - $644 & 7; //@line 2004
    $650 = $$748$i + $649 | 0; //@line 2005
    $651 = $642 - $649 | 0; //@line 2006
    HEAP32[870] = $650; //@line 2007
    HEAP32[867] = $651; //@line 2008
    HEAP32[$650 + 4 >> 2] = $651 | 1; //@line 2011
    HEAP32[$$748$i + $642 + 4 >> 2] = 40; //@line 2014
    HEAP32[871] = HEAP32[986]; //@line 2016
   } else {
    $$024367$i = 3904; //@line 2018
    while (1) {
     $657 = HEAP32[$$024367$i >> 2] | 0; //@line 2020
     $658 = $$024367$i + 4 | 0; //@line 2021
     $659 = HEAP32[$658 >> 2] | 0; //@line 2022
     if (($$748$i | 0) == ($657 + $659 | 0)) {
      label = 188; //@line 2026
      break;
     }
     $663 = HEAP32[$$024367$i + 8 >> 2] | 0; //@line 2030
     if (!$663) {
      break;
     } else {
      $$024367$i = $663; //@line 2035
     }
    }
    if ((label | 0) == 188) {
     if (!(HEAP32[$$024367$i + 12 >> 2] & 8)) {
      if ($$748$i >>> 0 > $636 >>> 0 & $657 >>> 0 <= $636 >>> 0) {
       HEAP32[$658 >> 2] = $659 + $$723947$i; //@line 2049
       $673 = (HEAP32[867] | 0) + $$723947$i | 0; //@line 2051
       $675 = $636 + 8 | 0; //@line 2053
       $680 = ($675 & 7 | 0) == 0 ? 0 : 0 - $675 & 7; //@line 2058
       $681 = $636 + $680 | 0; //@line 2059
       $682 = $673 - $680 | 0; //@line 2060
       HEAP32[870] = $681; //@line 2061
       HEAP32[867] = $682; //@line 2062
       HEAP32[$681 + 4 >> 2] = $682 | 1; //@line 2065
       HEAP32[$636 + $673 + 4 >> 2] = 40; //@line 2068
       HEAP32[871] = HEAP32[986]; //@line 2070
       break;
      }
     }
    }
    $688 = HEAP32[868] | 0; //@line 2075
    if ($$748$i >>> 0 < $688 >>> 0) {
     HEAP32[868] = $$748$i; //@line 2078
     $753 = $$748$i; //@line 2079
    } else {
     $753 = $688; //@line 2081
    }
    $690 = $$748$i + $$723947$i | 0; //@line 2083
    $$124466$i = 3904; //@line 2084
    while (1) {
     if ((HEAP32[$$124466$i >> 2] | 0) == ($690 | 0)) {
      label = 196; //@line 2089
      break;
     }
     $694 = HEAP32[$$124466$i + 8 >> 2] | 0; //@line 2093
     if (!$694) {
      $$0$i$i$i = 3904; //@line 2096
      break;
     } else {
      $$124466$i = $694; //@line 2099
     }
    }
    if ((label | 0) == 196) {
     if (!(HEAP32[$$124466$i + 12 >> 2] & 8)) {
      HEAP32[$$124466$i >> 2] = $$748$i; //@line 2108
      $700 = $$124466$i + 4 | 0; //@line 2109
      HEAP32[$700 >> 2] = (HEAP32[$700 >> 2] | 0) + $$723947$i; //@line 2112
      $704 = $$748$i + 8 | 0; //@line 2114
      $710 = $$748$i + (($704 & 7 | 0) == 0 ? 0 : 0 - $704 & 7) | 0; //@line 2120
      $712 = $690 + 8 | 0; //@line 2122
      $718 = $690 + (($712 & 7 | 0) == 0 ? 0 : 0 - $712 & 7) | 0; //@line 2128
      $722 = $710 + $$0197 | 0; //@line 2132
      $723 = $718 - $710 - $$0197 | 0; //@line 2133
      HEAP32[$710 + 4 >> 2] = $$0197 | 3; //@line 2136
      do {
       if (($636 | 0) == ($718 | 0)) {
        $728 = (HEAP32[867] | 0) + $723 | 0; //@line 2141
        HEAP32[867] = $728; //@line 2142
        HEAP32[870] = $722; //@line 2143
        HEAP32[$722 + 4 >> 2] = $728 | 1; //@line 2146
       } else {
        if ((HEAP32[869] | 0) == ($718 | 0)) {
         $734 = (HEAP32[866] | 0) + $723 | 0; //@line 2152
         HEAP32[866] = $734; //@line 2153
         HEAP32[869] = $722; //@line 2154
         HEAP32[$722 + 4 >> 2] = $734 | 1; //@line 2157
         HEAP32[$722 + $734 >> 2] = $734; //@line 2159
         break;
        }
        $739 = HEAP32[$718 + 4 >> 2] | 0; //@line 2163
        if (($739 & 3 | 0) == 1) {
         $742 = $739 & -8; //@line 2167
         $743 = $739 >>> 3; //@line 2168
         L311 : do {
          if ($739 >>> 0 < 256) {
           $746 = HEAP32[$718 + 8 >> 2] | 0; //@line 2173
           $748 = HEAP32[$718 + 12 >> 2] | 0; //@line 2175
           $750 = 3496 + ($743 << 1 << 2) | 0; //@line 2177
           do {
            if (($746 | 0) != ($750 | 0)) {
             if ($753 >>> 0 > $746 >>> 0) {
              _abort(); //@line 2183
             }
             if ((HEAP32[$746 + 12 >> 2] | 0) == ($718 | 0)) {
              break;
             }
             _abort(); //@line 2192
            }
           } while (0);
           if (($748 | 0) == ($746 | 0)) {
            HEAP32[864] = HEAP32[864] & ~(1 << $743); //@line 2202
            break;
           }
           do {
            if (($748 | 0) == ($750 | 0)) {
             $$pre$phi11$i$iZ2D = $748 + 8 | 0; //@line 2209
            } else {
             if ($753 >>> 0 > $748 >>> 0) {
              _abort(); //@line 2213
             }
             $764 = $748 + 8 | 0; //@line 2216
             if ((HEAP32[$764 >> 2] | 0) == ($718 | 0)) {
              $$pre$phi11$i$iZ2D = $764; //@line 2220
              break;
             }
             _abort(); //@line 2223
            }
           } while (0);
           HEAP32[$746 + 12 >> 2] = $748; //@line 2228
           HEAP32[$$pre$phi11$i$iZ2D >> 2] = $746; //@line 2229
          } else {
           $769 = HEAP32[$718 + 24 >> 2] | 0; //@line 2232
           $771 = HEAP32[$718 + 12 >> 2] | 0; //@line 2234
           do {
            if (($771 | 0) == ($718 | 0)) {
             $782 = $718 + 16 | 0; //@line 2238
             $783 = $782 + 4 | 0; //@line 2239
             $784 = HEAP32[$783 >> 2] | 0; //@line 2240
             if (!$784) {
              $786 = HEAP32[$782 >> 2] | 0; //@line 2243
              if (!$786) {
               $$3$i$i = 0; //@line 2246
               break;
              } else {
               $$1291$i$i = $786; //@line 2249
               $$1293$i$i = $782; //@line 2249
              }
             } else {
              $$1291$i$i = $784; //@line 2252
              $$1293$i$i = $783; //@line 2252
             }
             while (1) {
              $788 = $$1291$i$i + 20 | 0; //@line 2255
              $789 = HEAP32[$788 >> 2] | 0; //@line 2256
              if ($789 | 0) {
               $$1291$i$i = $789; //@line 2259
               $$1293$i$i = $788; //@line 2259
               continue;
              }
              $791 = $$1291$i$i + 16 | 0; //@line 2262
              $792 = HEAP32[$791 >> 2] | 0; //@line 2263
              if (!$792) {
               break;
              } else {
               $$1291$i$i = $792; //@line 2268
               $$1293$i$i = $791; //@line 2268
              }
             }
             if ($753 >>> 0 > $$1293$i$i >>> 0) {
              _abort(); //@line 2273
             } else {
              HEAP32[$$1293$i$i >> 2] = 0; //@line 2276
              $$3$i$i = $$1291$i$i; //@line 2277
              break;
             }
            } else {
             $774 = HEAP32[$718 + 8 >> 2] | 0; //@line 2282
             if ($753 >>> 0 > $774 >>> 0) {
              _abort(); //@line 2285
             }
             $776 = $774 + 12 | 0; //@line 2288
             if ((HEAP32[$776 >> 2] | 0) != ($718 | 0)) {
              _abort(); //@line 2292
             }
             $779 = $771 + 8 | 0; //@line 2295
             if ((HEAP32[$779 >> 2] | 0) == ($718 | 0)) {
              HEAP32[$776 >> 2] = $771; //@line 2299
              HEAP32[$779 >> 2] = $774; //@line 2300
              $$3$i$i = $771; //@line 2301
              break;
             } else {
              _abort(); //@line 2304
             }
            }
           } while (0);
           if (!$769) {
            break;
           }
           $797 = HEAP32[$718 + 28 >> 2] | 0; //@line 2314
           $798 = 3760 + ($797 << 2) | 0; //@line 2315
           do {
            if ((HEAP32[$798 >> 2] | 0) == ($718 | 0)) {
             HEAP32[$798 >> 2] = $$3$i$i; //@line 2320
             if ($$3$i$i | 0) {
              break;
             }
             HEAP32[865] = HEAP32[865] & ~(1 << $797); //@line 2329
             break L311;
            } else {
             if ((HEAP32[868] | 0) >>> 0 > $769 >>> 0) {
              _abort(); //@line 2335
             } else {
              HEAP32[$769 + 16 + (((HEAP32[$769 + 16 >> 2] | 0) != ($718 | 0) & 1) << 2) >> 2] = $$3$i$i; //@line 2343
              if (!$$3$i$i) {
               break L311;
              } else {
               break;
              }
             }
            }
           } while (0);
           $812 = HEAP32[868] | 0; //@line 2353
           if ($812 >>> 0 > $$3$i$i >>> 0) {
            _abort(); //@line 2356
           }
           HEAP32[$$3$i$i + 24 >> 2] = $769; //@line 2360
           $815 = $718 + 16 | 0; //@line 2361
           $816 = HEAP32[$815 >> 2] | 0; //@line 2362
           do {
            if ($816 | 0) {
             if ($812 >>> 0 > $816 >>> 0) {
              _abort(); //@line 2368
             } else {
              HEAP32[$$3$i$i + 16 >> 2] = $816; //@line 2372
              HEAP32[$816 + 24 >> 2] = $$3$i$i; //@line 2374
              break;
             }
            }
           } while (0);
           $822 = HEAP32[$815 + 4 >> 2] | 0; //@line 2380
           if (!$822) {
            break;
           }
           if ((HEAP32[868] | 0) >>> 0 > $822 >>> 0) {
            _abort(); //@line 2388
           } else {
            HEAP32[$$3$i$i + 20 >> 2] = $822; //@line 2392
            HEAP32[$822 + 24 >> 2] = $$3$i$i; //@line 2394
            break;
           }
          }
         } while (0);
         $$0$i17$i = $718 + $742 | 0; //@line 2401
         $$0287$i$i = $742 + $723 | 0; //@line 2401
        } else {
         $$0$i17$i = $718; //@line 2403
         $$0287$i$i = $723; //@line 2403
        }
        $830 = $$0$i17$i + 4 | 0; //@line 2405
        HEAP32[$830 >> 2] = HEAP32[$830 >> 2] & -2; //@line 2408
        HEAP32[$722 + 4 >> 2] = $$0287$i$i | 1; //@line 2411
        HEAP32[$722 + $$0287$i$i >> 2] = $$0287$i$i; //@line 2413
        $836 = $$0287$i$i >>> 3; //@line 2414
        if ($$0287$i$i >>> 0 < 256) {
         $839 = 3496 + ($836 << 1 << 2) | 0; //@line 2418
         $840 = HEAP32[864] | 0; //@line 2419
         $841 = 1 << $836; //@line 2420
         do {
          if (!($840 & $841)) {
           HEAP32[864] = $840 | $841; //@line 2426
           $$0295$i$i = $839; //@line 2428
           $$pre$phi$i19$iZ2D = $839 + 8 | 0; //@line 2428
          } else {
           $845 = $839 + 8 | 0; //@line 2430
           $846 = HEAP32[$845 >> 2] | 0; //@line 2431
           if ((HEAP32[868] | 0) >>> 0 <= $846 >>> 0) {
            $$0295$i$i = $846; //@line 2435
            $$pre$phi$i19$iZ2D = $845; //@line 2435
            break;
           }
           _abort(); //@line 2438
          }
         } while (0);
         HEAP32[$$pre$phi$i19$iZ2D >> 2] = $722; //@line 2442
         HEAP32[$$0295$i$i + 12 >> 2] = $722; //@line 2444
         HEAP32[$722 + 8 >> 2] = $$0295$i$i; //@line 2446
         HEAP32[$722 + 12 >> 2] = $839; //@line 2448
         break;
        }
        $852 = $$0287$i$i >>> 8; //@line 2451
        do {
         if (!$852) {
          $$0296$i$i = 0; //@line 2455
         } else {
          if ($$0287$i$i >>> 0 > 16777215) {
           $$0296$i$i = 31; //@line 2459
           break;
          }
          $857 = ($852 + 1048320 | 0) >>> 16 & 8; //@line 2464
          $858 = $852 << $857; //@line 2465
          $861 = ($858 + 520192 | 0) >>> 16 & 4; //@line 2468
          $863 = $858 << $861; //@line 2470
          $866 = ($863 + 245760 | 0) >>> 16 & 2; //@line 2473
          $871 = 14 - ($861 | $857 | $866) + ($863 << $866 >>> 15) | 0; //@line 2478
          $$0296$i$i = $$0287$i$i >>> ($871 + 7 | 0) & 1 | $871 << 1; //@line 2484
         }
        } while (0);
        $877 = 3760 + ($$0296$i$i << 2) | 0; //@line 2487
        HEAP32[$722 + 28 >> 2] = $$0296$i$i; //@line 2489
        $879 = $722 + 16 | 0; //@line 2490
        HEAP32[$879 + 4 >> 2] = 0; //@line 2492
        HEAP32[$879 >> 2] = 0; //@line 2493
        $881 = HEAP32[865] | 0; //@line 2494
        $882 = 1 << $$0296$i$i; //@line 2495
        if (!($881 & $882)) {
         HEAP32[865] = $881 | $882; //@line 2500
         HEAP32[$877 >> 2] = $722; //@line 2501
         HEAP32[$722 + 24 >> 2] = $877; //@line 2503
         HEAP32[$722 + 12 >> 2] = $722; //@line 2505
         HEAP32[$722 + 8 >> 2] = $722; //@line 2507
         break;
        }
        $$0288$i$i = $$0287$i$i << (($$0296$i$i | 0) == 31 ? 0 : 25 - ($$0296$i$i >>> 1) | 0); //@line 2516
        $$0289$i$i = HEAP32[$877 >> 2] | 0; //@line 2516
        while (1) {
         if ((HEAP32[$$0289$i$i + 4 >> 2] & -8 | 0) == ($$0287$i$i | 0)) {
          label = 263; //@line 2523
          break;
         }
         $900 = $$0289$i$i + 16 + ($$0288$i$i >>> 31 << 2) | 0; //@line 2527
         $902 = HEAP32[$900 >> 2] | 0; //@line 2529
         if (!$902) {
          label = 260; //@line 2532
          break;
         } else {
          $$0288$i$i = $$0288$i$i << 1; //@line 2535
          $$0289$i$i = $902; //@line 2535
         }
        }
        if ((label | 0) == 260) {
         if ((HEAP32[868] | 0) >>> 0 > $900 >>> 0) {
          _abort(); //@line 2542
         } else {
          HEAP32[$900 >> 2] = $722; //@line 2545
          HEAP32[$722 + 24 >> 2] = $$0289$i$i; //@line 2547
          HEAP32[$722 + 12 >> 2] = $722; //@line 2549
          HEAP32[$722 + 8 >> 2] = $722; //@line 2551
          break;
         }
        } else if ((label | 0) == 263) {
         $909 = $$0289$i$i + 8 | 0; //@line 2556
         $910 = HEAP32[$909 >> 2] | 0; //@line 2557
         $911 = HEAP32[868] | 0; //@line 2558
         if ($911 >>> 0 <= $910 >>> 0 & $911 >>> 0 <= $$0289$i$i >>> 0) {
          HEAP32[$910 + 12 >> 2] = $722; //@line 2564
          HEAP32[$909 >> 2] = $722; //@line 2565
          HEAP32[$722 + 8 >> 2] = $910; //@line 2567
          HEAP32[$722 + 12 >> 2] = $$0289$i$i; //@line 2569
          HEAP32[$722 + 24 >> 2] = 0; //@line 2571
          break;
         } else {
          _abort(); //@line 2574
         }
        }
       }
      } while (0);
      $$0 = $710 + 8 | 0; //@line 2581
      STACKTOP = sp; //@line 2582
      return $$0 | 0; //@line 2582
     } else {
      $$0$i$i$i = 3904; //@line 2584
     }
    }
    while (1) {
     $919 = HEAP32[$$0$i$i$i >> 2] | 0; //@line 2588
     if ($919 >>> 0 <= $636 >>> 0) {
      $923 = $919 + (HEAP32[$$0$i$i$i + 4 >> 2] | 0) | 0; //@line 2593
      if ($923 >>> 0 > $636 >>> 0) {
       break;
      }
     }
     $$0$i$i$i = HEAP32[$$0$i$i$i + 8 >> 2] | 0; //@line 2601
    }
    $927 = $923 + -47 | 0; //@line 2603
    $929 = $927 + 8 | 0; //@line 2605
    $935 = $927 + (($929 & 7 | 0) == 0 ? 0 : 0 - $929 & 7) | 0; //@line 2611
    $936 = $636 + 16 | 0; //@line 2612
    $938 = $935 >>> 0 < $936 >>> 0 ? $636 : $935; //@line 2614
    $939 = $938 + 8 | 0; //@line 2615
    $940 = $938 + 24 | 0; //@line 2616
    $941 = $$723947$i + -40 | 0; //@line 2617
    $943 = $$748$i + 8 | 0; //@line 2619
    $948 = ($943 & 7 | 0) == 0 ? 0 : 0 - $943 & 7; //@line 2624
    $949 = $$748$i + $948 | 0; //@line 2625
    $950 = $941 - $948 | 0; //@line 2626
    HEAP32[870] = $949; //@line 2627
    HEAP32[867] = $950; //@line 2628
    HEAP32[$949 + 4 >> 2] = $950 | 1; //@line 2631
    HEAP32[$$748$i + $941 + 4 >> 2] = 40; //@line 2634
    HEAP32[871] = HEAP32[986]; //@line 2636
    $956 = $938 + 4 | 0; //@line 2637
    HEAP32[$956 >> 2] = 27; //@line 2638
    HEAP32[$939 >> 2] = HEAP32[976]; //@line 2639
    HEAP32[$939 + 4 >> 2] = HEAP32[977]; //@line 2639
    HEAP32[$939 + 8 >> 2] = HEAP32[978]; //@line 2639
    HEAP32[$939 + 12 >> 2] = HEAP32[979]; //@line 2639
    HEAP32[976] = $$748$i; //@line 2640
    HEAP32[977] = $$723947$i; //@line 2641
    HEAP32[979] = 0; //@line 2642
    HEAP32[978] = $939; //@line 2643
    $958 = $940; //@line 2644
    do {
     $958$looptemp = $958;
     $958 = $958 + 4 | 0; //@line 2646
     HEAP32[$958 >> 2] = 7; //@line 2647
    } while (($958$looptemp + 8 | 0) >>> 0 < $923 >>> 0);
    if (($938 | 0) != ($636 | 0)) {
     $964 = $938 - $636 | 0; //@line 2660
     HEAP32[$956 >> 2] = HEAP32[$956 >> 2] & -2; //@line 2663
     HEAP32[$636 + 4 >> 2] = $964 | 1; //@line 2666
     HEAP32[$938 >> 2] = $964; //@line 2667
     $969 = $964 >>> 3; //@line 2668
     if ($964 >>> 0 < 256) {
      $972 = 3496 + ($969 << 1 << 2) | 0; //@line 2672
      $973 = HEAP32[864] | 0; //@line 2673
      $974 = 1 << $969; //@line 2674
      if (!($973 & $974)) {
       HEAP32[864] = $973 | $974; //@line 2679
       $$0211$i$i = $972; //@line 2681
       $$pre$phi$i$iZ2D = $972 + 8 | 0; //@line 2681
      } else {
       $978 = $972 + 8 | 0; //@line 2683
       $979 = HEAP32[$978 >> 2] | 0; //@line 2684
       if ((HEAP32[868] | 0) >>> 0 > $979 >>> 0) {
        _abort(); //@line 2688
       } else {
        $$0211$i$i = $979; //@line 2691
        $$pre$phi$i$iZ2D = $978; //@line 2691
       }
      }
      HEAP32[$$pre$phi$i$iZ2D >> 2] = $636; //@line 2694
      HEAP32[$$0211$i$i + 12 >> 2] = $636; //@line 2696
      HEAP32[$636 + 8 >> 2] = $$0211$i$i; //@line 2698
      HEAP32[$636 + 12 >> 2] = $972; //@line 2700
      break;
     }
     $985 = $964 >>> 8; //@line 2703
     if (!$985) {
      $$0212$i$i = 0; //@line 2706
     } else {
      if ($964 >>> 0 > 16777215) {
       $$0212$i$i = 31; //@line 2710
      } else {
       $990 = ($985 + 1048320 | 0) >>> 16 & 8; //@line 2714
       $991 = $985 << $990; //@line 2715
       $994 = ($991 + 520192 | 0) >>> 16 & 4; //@line 2718
       $996 = $991 << $994; //@line 2720
       $999 = ($996 + 245760 | 0) >>> 16 & 2; //@line 2723
       $1004 = 14 - ($994 | $990 | $999) + ($996 << $999 >>> 15) | 0; //@line 2728
       $$0212$i$i = $964 >>> ($1004 + 7 | 0) & 1 | $1004 << 1; //@line 2734
      }
     }
     $1010 = 3760 + ($$0212$i$i << 2) | 0; //@line 2737
     HEAP32[$636 + 28 >> 2] = $$0212$i$i; //@line 2739
     HEAP32[$636 + 20 >> 2] = 0; //@line 2741
     HEAP32[$936 >> 2] = 0; //@line 2742
     $1013 = HEAP32[865] | 0; //@line 2743
     $1014 = 1 << $$0212$i$i; //@line 2744
     if (!($1013 & $1014)) {
      HEAP32[865] = $1013 | $1014; //@line 2749
      HEAP32[$1010 >> 2] = $636; //@line 2750
      HEAP32[$636 + 24 >> 2] = $1010; //@line 2752
      HEAP32[$636 + 12 >> 2] = $636; //@line 2754
      HEAP32[$636 + 8 >> 2] = $636; //@line 2756
      break;
     }
     $$0206$i$i = $964 << (($$0212$i$i | 0) == 31 ? 0 : 25 - ($$0212$i$i >>> 1) | 0); //@line 2765
     $$0207$i$i = HEAP32[$1010 >> 2] | 0; //@line 2765
     while (1) {
      if ((HEAP32[$$0207$i$i + 4 >> 2] & -8 | 0) == ($964 | 0)) {
       label = 289; //@line 2772
       break;
      }
      $1032 = $$0207$i$i + 16 + ($$0206$i$i >>> 31 << 2) | 0; //@line 2776
      $1034 = HEAP32[$1032 >> 2] | 0; //@line 2778
      if (!$1034) {
       label = 286; //@line 2781
       break;
      } else {
       $$0206$i$i = $$0206$i$i << 1; //@line 2784
       $$0207$i$i = $1034; //@line 2784
      }
     }
     if ((label | 0) == 286) {
      if ((HEAP32[868] | 0) >>> 0 > $1032 >>> 0) {
       _abort(); //@line 2791
      } else {
       HEAP32[$1032 >> 2] = $636; //@line 2794
       HEAP32[$636 + 24 >> 2] = $$0207$i$i; //@line 2796
       HEAP32[$636 + 12 >> 2] = $636; //@line 2798
       HEAP32[$636 + 8 >> 2] = $636; //@line 2800
       break;
      }
     } else if ((label | 0) == 289) {
      $1041 = $$0207$i$i + 8 | 0; //@line 2805
      $1042 = HEAP32[$1041 >> 2] | 0; //@line 2806
      $1043 = HEAP32[868] | 0; //@line 2807
      if ($1043 >>> 0 <= $1042 >>> 0 & $1043 >>> 0 <= $$0207$i$i >>> 0) {
       HEAP32[$1042 + 12 >> 2] = $636; //@line 2813
       HEAP32[$1041 >> 2] = $636; //@line 2814
       HEAP32[$636 + 8 >> 2] = $1042; //@line 2816
       HEAP32[$636 + 12 >> 2] = $$0207$i$i; //@line 2818
       HEAP32[$636 + 24 >> 2] = 0; //@line 2820
       break;
      } else {
       _abort(); //@line 2823
      }
     }
    }
   }
  } while (0);
  $1052 = HEAP32[867] | 0; //@line 2830
  if ($1052 >>> 0 > $$0197 >>> 0) {
   $1054 = $1052 - $$0197 | 0; //@line 2833
   HEAP32[867] = $1054; //@line 2834
   $1055 = HEAP32[870] | 0; //@line 2835
   $1056 = $1055 + $$0197 | 0; //@line 2836
   HEAP32[870] = $1056; //@line 2837
   HEAP32[$1056 + 4 >> 2] = $1054 | 1; //@line 2840
   HEAP32[$1055 + 4 >> 2] = $$0197 | 3; //@line 2843
   $$0 = $1055 + 8 | 0; //@line 2845
   STACKTOP = sp; //@line 2846
   return $$0 | 0; //@line 2846
  }
 }
 HEAP32[(___errno_location() | 0) >> 2] = 12; //@line 2850
 $$0 = 0; //@line 2851
 STACKTOP = sp; //@line 2852
 return $$0 | 0; //@line 2852
}
function _fmt_fp($0, $1, $2, $3, $4, $5) {
 $0 = $0 | 0;
 $1 = +$1;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 $5 = $5 | 0;
 var $$$3484 = 0, $$$3484700 = 0, $$$4502 = 0, $$$564 = 0.0, $$0 = 0, $$0463$lcssa = 0, $$0463587 = 0, $$0464597 = 0, $$0471 = 0.0, $$0479 = 0, $$0487644 = 0, $$0488655 = 0, $$0488657 = 0, $$0496$$9 = 0, $$0497656 = 0, $$0498 = 0, $$0509585 = 0.0, $$0511 = 0, $$0514639 = 0, $$0520 = 0, $$0521 = 0, $$0521$ = 0, $$0523 = 0, $$0527$in633 = 0, $$0530638 = 0, $$1465 = 0, $$1467 = 0.0, $$1469 = 0.0, $$1472 = 0.0, $$1480 = 0, $$1482$lcssa = 0, $$1482663 = 0, $$1489643 = 0, $$1499$lcssa = 0, $$1499662 = 0, $$1508586 = 0, $$1512$lcssa = 0, $$1512610 = 0, $$1515 = 0, $$1524 = 0, $$1528617 = 0, $$1531$lcssa = 0, $$1531632 = 0, $$1601 = 0, $$2 = 0, $$2473 = 0.0, $$2476 = 0, $$2483$ph = 0, $$2500 = 0, $$2513 = 0, $$2516621 = 0, $$2529 = 0, $$2532620 = 0, $$3 = 0.0, $$3477 = 0, $$3484$lcssa = 0, $$3484650 = 0, $$3501$lcssa = 0, $$3501649 = 0, $$3533616 = 0, $$4 = 0.0, $$4478$lcssa = 0, $$4478593 = 0, $$4492 = 0, $$4502 = 0, $$4518 = 0, $$5$lcssa = 0, $$540 = 0, $$540$ = 0, $$543 = 0.0, $$548 = 0, $$5486$lcssa = 0, $$5486626 = 0, $$5493600 = 0, $$550 = 0, $$5519$ph = 0, $$5605 = 0, $$561 = 0, $$6 = 0, $$6494592 = 0, $$7495604 = 0, $$7505 = 0, $$7505$ = 0, $$7505$ph = 0, $$8 = 0, $$9$ph = 0, $$lcssa675 = 0, $$pn = 0, $$pr = 0, $$pr566 = 0, $$pre$phi691Z2D = 0, $$pre$phi698Z2D = 0, $$pre693 = 0, $$sink = 0, $$sink547$lcssa = 0, $$sink547625 = 0, $$sink560 = 0, $10 = 0, $101 = 0, $104 = 0, $106 = 0, $11 = 0, $113 = 0, $116 = 0, $124 = 0, $125 = 0, $128 = 0, $130 = 0, $131 = 0, $132 = 0, $138 = 0, $140 = 0, $144 = 0, $149 = 0, $150 = 0, $151 = 0, $152 = 0, $154 = 0, $160 = 0, $161 = 0, $162 = 0, $174 = 0, $185 = 0, $189 = 0, $190 = 0, $193 = 0, $198 = 0, $199 = 0, $201 = 0, $209 = 0, $212 = 0, $213 = 0, $215 = 0, $217 = 0, $218 = 0, $221 = 0, $225 = 0, $230 = 0, $233 = 0, $236 = 0, $238 = 0, $240 = 0, $242 = 0, $247 = 0, $248 = 0, $251 = 0, $253 = 0, $256 = 0, $259 = 0, $267 = 0, $27 = 0, $270 = 0, $275 = 0, $284 = 0, $285 = 0, $289 = 0, $292 = 0, $294 = 0, $296 = 0, $300 = 0, $303 = 0, $304 = 0, $308 = 0, $31 = 0, $318 = 0, $323 = 0, $326 = 0, $327 = 0, $328 = 0, $330 = 0, $335 = 0, $347 = 0, $35 = 0.0, $351 = 0, $356 = 0, $36 = 0, $363 = 0, $364 = 0, $365 = 0, $366 = 0, $367 = 0, $369 = 0, $373 = 0, $375 = 0, $378 = 0, $381 = 0, $39 = 0, $41 = 0, $44 = 0, $46 = 0, $6 = 0, $60 = 0, $63 = 0, $66 = 0, $68 = 0, $7 = 0, $76 = 0, $77 = 0, $79 = 0, $8 = 0, $80 = 0, $86 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 5929
 STACKTOP = STACKTOP + 560 | 0; //@line 5930
 $6 = sp + 8 | 0; //@line 5931
 $7 = sp; //@line 5932
 $8 = sp + 524 | 0; //@line 5933
 $9 = $8; //@line 5934
 $10 = sp + 512 | 0; //@line 5935
 HEAP32[$7 >> 2] = 0; //@line 5936
 $11 = $10 + 12 | 0; //@line 5937
 ___DOUBLE_BITS_677($1) | 0; //@line 5938
 if ((tempRet0 | 0) < 0) {
  $$0471 = -$1; //@line 5943
  $$0520 = 1; //@line 5943
  $$0521 = 1299; //@line 5943
 } else {
  $$0471 = $1; //@line 5954
  $$0520 = ($4 & 2049 | 0) != 0 & 1; //@line 5954
  $$0521 = ($4 & 2048 | 0) == 0 ? ($4 & 1 | 0) == 0 ? 1300 : 1305 : 1302; //@line 5954
 }
 ___DOUBLE_BITS_677($$0471) | 0; //@line 5956
 do {
  if (0 == 0 & (tempRet0 & 2146435072 | 0) == 2146435072) {
   $27 = ($5 & 32 | 0) != 0; //@line 5965
   $31 = $$0520 + 3 | 0; //@line 5970
   _pad_676($0, 32, $2, $31, $4 & -65537); //@line 5972
   _out_670($0, $$0521, $$0520); //@line 5973
   _out_670($0, $$0471 != $$0471 | 0.0 != 0.0 ? $27 ? 1326 : 1330 : $27 ? 1318 : 1322, 3); //@line 5974
   _pad_676($0, 32, $2, $31, $4 ^ 8192); //@line 5976
   $$sink560 = $31; //@line 5977
  } else {
   $35 = +_frexpl($$0471, $7) * 2.0; //@line 5980
   $36 = $35 != 0.0; //@line 5981
   if ($36) {
    HEAP32[$7 >> 2] = (HEAP32[$7 >> 2] | 0) + -1; //@line 5985
   }
   $39 = $5 | 32; //@line 5987
   if (($39 | 0) == 97) {
    $41 = $5 & 32; //@line 5990
    $$0521$ = ($41 | 0) == 0 ? $$0521 : $$0521 + 9 | 0; //@line 5993
    $44 = $$0520 | 2; //@line 5994
    $46 = 12 - $3 | 0; //@line 5996
    do {
     if ($3 >>> 0 > 11 | ($46 | 0) == 0) {
      $$1472 = $35; //@line 6001
     } else {
      $$0509585 = 8.0; //@line 6003
      $$1508586 = $46; //@line 6003
      do {
       $$1508586 = $$1508586 + -1 | 0; //@line 6005
       $$0509585 = $$0509585 * 16.0; //@line 6006
      } while (($$1508586 | 0) != 0);
      if ((HEAP8[$$0521$ >> 0] | 0) == 45) {
       $$1472 = -($$0509585 + (-$35 - $$0509585)); //@line 6021
       break;
      } else {
       $$1472 = $35 + $$0509585 - $$0509585; //@line 6026
       break;
      }
     }
    } while (0);
    $60 = HEAP32[$7 >> 2] | 0; //@line 6031
    $63 = ($60 | 0) < 0 ? 0 - $60 | 0 : $60; //@line 6034
    $66 = _fmt_u($63, (($63 | 0) < 0) << 31 >> 31, $11) | 0; //@line 6037
    if (($66 | 0) == ($11 | 0)) {
     $68 = $10 + 11 | 0; //@line 6040
     HEAP8[$68 >> 0] = 48; //@line 6041
     $$0511 = $68; //@line 6042
    } else {
     $$0511 = $66; //@line 6044
    }
    HEAP8[$$0511 + -1 >> 0] = ($60 >> 31 & 2) + 43; //@line 6051
    $76 = $$0511 + -2 | 0; //@line 6054
    HEAP8[$76 >> 0] = $5 + 15; //@line 6055
    $77 = ($3 | 0) < 1; //@line 6056
    $79 = ($4 & 8 | 0) == 0; //@line 6058
    $$0523 = $8; //@line 6059
    $$2473 = $$1472; //@line 6059
    while (1) {
     $80 = ~~$$2473; //@line 6061
     $86 = $$0523 + 1 | 0; //@line 6067
     HEAP8[$$0523 >> 0] = $41 | HEAPU8[1334 + $80 >> 0]; //@line 6068
     $$2473 = ($$2473 - +($80 | 0)) * 16.0; //@line 6071
     if (($86 - $9 | 0) == 1) {
      if ($79 & ($77 & $$2473 == 0.0)) {
       $$1524 = $86; //@line 6080
      } else {
       HEAP8[$86 >> 0] = 46; //@line 6083
       $$1524 = $$0523 + 2 | 0; //@line 6084
      }
     } else {
      $$1524 = $86; //@line 6087
     }
     if (!($$2473 != 0.0)) {
      break;
     } else {
      $$0523 = $$1524; //@line 6091
     }
    }
    $$pre693 = $$1524; //@line 6097
    if (!$3) {
     label = 24; //@line 6099
    } else {
     if ((-2 - $9 + $$pre693 | 0) < ($3 | 0)) {
      $$pre$phi691Z2D = $$pre693 - $9 | 0; //@line 6107
      $$sink = $3 + 2 | 0; //@line 6107
     } else {
      label = 24; //@line 6109
     }
    }
    if ((label | 0) == 24) {
     $101 = $$pre693 - $9 | 0; //@line 6113
     $$pre$phi691Z2D = $101; //@line 6114
     $$sink = $101; //@line 6114
    }
    $104 = $11 - $76 | 0; //@line 6118
    $106 = $104 + $44 + $$sink | 0; //@line 6120
    _pad_676($0, 32, $2, $106, $4); //@line 6121
    _out_670($0, $$0521$, $44); //@line 6122
    _pad_676($0, 48, $2, $106, $4 ^ 65536); //@line 6124
    _out_670($0, $8, $$pre$phi691Z2D); //@line 6125
    _pad_676($0, 48, $$sink - $$pre$phi691Z2D | 0, 0, 0); //@line 6127
    _out_670($0, $76, $104); //@line 6128
    _pad_676($0, 32, $2, $106, $4 ^ 8192); //@line 6130
    $$sink560 = $106; //@line 6131
    break;
   }
   $$540 = ($3 | 0) < 0 ? 6 : $3; //@line 6135
   if ($36) {
    $113 = (HEAP32[$7 >> 2] | 0) + -28 | 0; //@line 6139
    HEAP32[$7 >> 2] = $113; //@line 6140
    $$3 = $35 * 268435456.0; //@line 6141
    $$pr = $113; //@line 6141
   } else {
    $$3 = $35; //@line 6144
    $$pr = HEAP32[$7 >> 2] | 0; //@line 6144
   }
   $$561 = ($$pr | 0) < 0 ? $6 : $6 + 288 | 0; //@line 6148
   $$0498 = $$561; //@line 6149
   $$4 = $$3; //@line 6149
   do {
    $116 = ~~$$4 >>> 0; //@line 6151
    HEAP32[$$0498 >> 2] = $116; //@line 6152
    $$0498 = $$0498 + 4 | 0; //@line 6153
    $$4 = ($$4 - +($116 >>> 0)) * 1.0e9; //@line 6156
   } while ($$4 != 0.0);
   if (($$pr | 0) > 0) {
    $$1482663 = $$561; //@line 6166
    $$1499662 = $$0498; //@line 6166
    $124 = $$pr; //@line 6166
    while (1) {
     $125 = ($124 | 0) < 29 ? $124 : 29; //@line 6169
     $$0488655 = $$1499662 + -4 | 0; //@line 6170
     if ($$0488655 >>> 0 < $$1482663 >>> 0) {
      $$2483$ph = $$1482663; //@line 6173
     } else {
      $$0488657 = $$0488655; //@line 6175
      $$0497656 = 0; //@line 6175
      do {
       $128 = _bitshift64Shl(HEAP32[$$0488657 >> 2] | 0, 0, $125 | 0) | 0; //@line 6178
       $130 = _i64Add($128 | 0, tempRet0 | 0, $$0497656 | 0, 0) | 0; //@line 6180
       $131 = tempRet0; //@line 6181
       $132 = ___uremdi3($130 | 0, $131 | 0, 1e9, 0) | 0; //@line 6182
       HEAP32[$$0488657 >> 2] = $132; //@line 6184
       $$0497656 = ___udivdi3($130 | 0, $131 | 0, 1e9, 0) | 0; //@line 6185
       $$0488657 = $$0488657 + -4 | 0; //@line 6187
      } while ($$0488657 >>> 0 >= $$1482663 >>> 0);
      if (!$$0497656) {
       $$2483$ph = $$1482663; //@line 6197
      } else {
       $138 = $$1482663 + -4 | 0; //@line 6199
       HEAP32[$138 >> 2] = $$0497656; //@line 6200
       $$2483$ph = $138; //@line 6201
      }
     }
     $$2500 = $$1499662; //@line 6204
     while (1) {
      if ($$2500 >>> 0 <= $$2483$ph >>> 0) {
       break;
      }
      $140 = $$2500 + -4 | 0; //@line 6210
      if (!(HEAP32[$140 >> 2] | 0)) {
       $$2500 = $140; //@line 6214
      } else {
       break;
      }
     }
     $144 = (HEAP32[$7 >> 2] | 0) - $125 | 0; //@line 6220
     HEAP32[$7 >> 2] = $144; //@line 6221
     if (($144 | 0) > 0) {
      $$1482663 = $$2483$ph; //@line 6224
      $$1499662 = $$2500; //@line 6224
      $124 = $144; //@line 6224
     } else {
      $$1482$lcssa = $$2483$ph; //@line 6226
      $$1499$lcssa = $$2500; //@line 6226
      $$pr566 = $144; //@line 6226
      break;
     }
    }
   } else {
    $$1482$lcssa = $$561; //@line 6231
    $$1499$lcssa = $$0498; //@line 6231
    $$pr566 = $$pr; //@line 6231
   }
   if (($$pr566 | 0) < 0) {
    $149 = (($$540 + 25 | 0) / 9 | 0) + 1 | 0; //@line 6237
    $150 = ($39 | 0) == 102; //@line 6238
    $$3484650 = $$1482$lcssa; //@line 6239
    $$3501649 = $$1499$lcssa; //@line 6239
    $152 = $$pr566; //@line 6239
    while (1) {
     $151 = 0 - $152 | 0; //@line 6241
     $154 = ($151 | 0) < 9 ? $151 : 9; //@line 6243
     if ($$3484650 >>> 0 < $$3501649 >>> 0) {
      $160 = (1 << $154) + -1 | 0; //@line 6247
      $161 = 1e9 >>> $154; //@line 6248
      $$0487644 = 0; //@line 6249
      $$1489643 = $$3484650; //@line 6249
      do {
       $162 = HEAP32[$$1489643 >> 2] | 0; //@line 6251
       HEAP32[$$1489643 >> 2] = ($162 >>> $154) + $$0487644; //@line 6255
       $$0487644 = Math_imul($162 & $160, $161) | 0; //@line 6256
       $$1489643 = $$1489643 + 4 | 0; //@line 6257
      } while ($$1489643 >>> 0 < $$3501649 >>> 0);
      $$$3484 = (HEAP32[$$3484650 >> 2] | 0) == 0 ? $$3484650 + 4 | 0 : $$3484650; //@line 6268
      if (!$$0487644) {
       $$$3484700 = $$$3484; //@line 6271
       $$4502 = $$3501649; //@line 6271
      } else {
       HEAP32[$$3501649 >> 2] = $$0487644; //@line 6274
       $$$3484700 = $$$3484; //@line 6275
       $$4502 = $$3501649 + 4 | 0; //@line 6275
      }
     } else {
      $$$3484700 = (HEAP32[$$3484650 >> 2] | 0) == 0 ? $$3484650 + 4 | 0 : $$3484650; //@line 6282
      $$4502 = $$3501649; //@line 6282
     }
     $174 = $150 ? $$561 : $$$3484700; //@line 6284
     $$$4502 = ($$4502 - $174 >> 2 | 0) > ($149 | 0) ? $174 + ($149 << 2) | 0 : $$4502; //@line 6291
     $152 = (HEAP32[$7 >> 2] | 0) + $154 | 0; //@line 6293
     HEAP32[$7 >> 2] = $152; //@line 6294
     if (($152 | 0) >= 0) {
      $$3484$lcssa = $$$3484700; //@line 6299
      $$3501$lcssa = $$$4502; //@line 6299
      break;
     } else {
      $$3484650 = $$$3484700; //@line 6297
      $$3501649 = $$$4502; //@line 6297
     }
    }
   } else {
    $$3484$lcssa = $$1482$lcssa; //@line 6304
    $$3501$lcssa = $$1499$lcssa; //@line 6304
   }
   $185 = $$561; //@line 6307
   if ($$3484$lcssa >>> 0 < $$3501$lcssa >>> 0) {
    $189 = ($185 - $$3484$lcssa >> 2) * 9 | 0; //@line 6312
    $190 = HEAP32[$$3484$lcssa >> 2] | 0; //@line 6313
    if ($190 >>> 0 < 10) {
     $$1515 = $189; //@line 6316
    } else {
     $$0514639 = $189; //@line 6318
     $$0530638 = 10; //@line 6318
     while (1) {
      $$0530638 = $$0530638 * 10 | 0; //@line 6320
      $193 = $$0514639 + 1 | 0; //@line 6321
      if ($190 >>> 0 < $$0530638 >>> 0) {
       $$1515 = $193; //@line 6324
       break;
      } else {
       $$0514639 = $193; //@line 6327
      }
     }
    }
   } else {
    $$1515 = 0; //@line 6332
   }
   $198 = ($39 | 0) == 103; //@line 6337
   $199 = ($$540 | 0) != 0; //@line 6338
   $201 = $$540 - (($39 | 0) != 102 ? $$1515 : 0) + (($199 & $198) << 31 >> 31) | 0; //@line 6341
   if (($201 | 0) < ((($$3501$lcssa - $185 >> 2) * 9 | 0) + -9 | 0)) {
    $209 = $201 + 9216 | 0; //@line 6350
    $212 = $$561 + 4 + ((($209 | 0) / 9 | 0) + -1024 << 2) | 0; //@line 6353
    $213 = ($209 | 0) % 9 | 0; //@line 6354
    if (($213 | 0) < 8) {
     $$0527$in633 = $213; //@line 6357
     $$1531632 = 10; //@line 6357
     while (1) {
      $215 = $$1531632 * 10 | 0; //@line 6360
      if (($$0527$in633 | 0) < 7) {
       $$0527$in633 = $$0527$in633 + 1 | 0; //@line 6363
       $$1531632 = $215; //@line 6363
      } else {
       $$1531$lcssa = $215; //@line 6365
       break;
      }
     }
    } else {
     $$1531$lcssa = 10; //@line 6370
    }
    $217 = HEAP32[$212 >> 2] | 0; //@line 6372
    $218 = ($217 >>> 0) % ($$1531$lcssa >>> 0) | 0; //@line 6373
    $221 = ($212 + 4 | 0) == ($$3501$lcssa | 0); //@line 6376
    if ($221 & ($218 | 0) == 0) {
     $$4492 = $212; //@line 6379
     $$4518 = $$1515; //@line 6379
     $$8 = $$3484$lcssa; //@line 6379
    } else {
     $$543 = ((($217 >>> 0) / ($$1531$lcssa >>> 0) | 0) & 1 | 0) == 0 ? 9007199254740992.0 : 9007199254740994.0; //@line 6384
     $225 = ($$1531$lcssa | 0) / 2 | 0; //@line 6385
     $$$564 = $218 >>> 0 < $225 >>> 0 ? .5 : $221 & ($218 | 0) == ($225 | 0) ? 1.0 : 1.5; //@line 6390
     if (!$$0520) {
      $$1467 = $$$564; //@line 6393
      $$1469 = $$543; //@line 6393
     } else {
      $230 = (HEAP8[$$0521 >> 0] | 0) == 45; //@line 6396
      $$1467 = $230 ? -$$$564 : $$$564; //@line 6401
      $$1469 = $230 ? -$$543 : $$543; //@line 6401
     }
     $233 = $217 - $218 | 0; //@line 6403
     HEAP32[$212 >> 2] = $233; //@line 6404
     if ($$1469 + $$1467 != $$1469) {
      $236 = $233 + $$1531$lcssa | 0; //@line 6408
      HEAP32[$212 >> 2] = $236; //@line 6409
      if ($236 >>> 0 > 999999999) {
       $$5486626 = $$3484$lcssa; //@line 6412
       $$sink547625 = $212; //@line 6412
       while (1) {
        $238 = $$sink547625 + -4 | 0; //@line 6414
        HEAP32[$$sink547625 >> 2] = 0; //@line 6415
        if ($238 >>> 0 < $$5486626 >>> 0) {
         $240 = $$5486626 + -4 | 0; //@line 6418
         HEAP32[$240 >> 2] = 0; //@line 6419
         $$6 = $240; //@line 6420
        } else {
         $$6 = $$5486626; //@line 6422
        }
        $242 = (HEAP32[$238 >> 2] | 0) + 1 | 0; //@line 6425
        HEAP32[$238 >> 2] = $242; //@line 6426
        if ($242 >>> 0 > 999999999) {
         $$5486626 = $$6; //@line 6429
         $$sink547625 = $238; //@line 6429
        } else {
         $$5486$lcssa = $$6; //@line 6431
         $$sink547$lcssa = $238; //@line 6431
         break;
        }
       }
      } else {
       $$5486$lcssa = $$3484$lcssa; //@line 6436
       $$sink547$lcssa = $212; //@line 6436
      }
      $247 = ($185 - $$5486$lcssa >> 2) * 9 | 0; //@line 6441
      $248 = HEAP32[$$5486$lcssa >> 2] | 0; //@line 6442
      if ($248 >>> 0 < 10) {
       $$4492 = $$sink547$lcssa; //@line 6445
       $$4518 = $247; //@line 6445
       $$8 = $$5486$lcssa; //@line 6445
      } else {
       $$2516621 = $247; //@line 6447
       $$2532620 = 10; //@line 6447
       while (1) {
        $$2532620 = $$2532620 * 10 | 0; //@line 6449
        $251 = $$2516621 + 1 | 0; //@line 6450
        if ($248 >>> 0 < $$2532620 >>> 0) {
         $$4492 = $$sink547$lcssa; //@line 6453
         $$4518 = $251; //@line 6453
         $$8 = $$5486$lcssa; //@line 6453
         break;
        } else {
         $$2516621 = $251; //@line 6456
        }
       }
      }
     } else {
      $$4492 = $212; //@line 6461
      $$4518 = $$1515; //@line 6461
      $$8 = $$3484$lcssa; //@line 6461
     }
    }
    $253 = $$4492 + 4 | 0; //@line 6464
    $$5519$ph = $$4518; //@line 6467
    $$7505$ph = $$3501$lcssa >>> 0 > $253 >>> 0 ? $253 : $$3501$lcssa; //@line 6467
    $$9$ph = $$8; //@line 6467
   } else {
    $$5519$ph = $$1515; //@line 6469
    $$7505$ph = $$3501$lcssa; //@line 6469
    $$9$ph = $$3484$lcssa; //@line 6469
   }
   $$7505 = $$7505$ph; //@line 6471
   while (1) {
    if ($$7505 >>> 0 <= $$9$ph >>> 0) {
     $$lcssa675 = 0; //@line 6475
     break;
    }
    $256 = $$7505 + -4 | 0; //@line 6478
    if (!(HEAP32[$256 >> 2] | 0)) {
     $$7505 = $256; //@line 6482
    } else {
     $$lcssa675 = 1; //@line 6484
     break;
    }
   }
   $259 = 0 - $$5519$ph | 0; //@line 6488
   do {
    if ($198) {
     $$540$ = $$540 + (($199 ^ 1) & 1) | 0; //@line 6493
     if (($$540$ | 0) > ($$5519$ph | 0) & ($$5519$ph | 0) > -5) {
      $$0479 = $5 + -1 | 0; //@line 6501
      $$2476 = $$540$ + -1 - $$5519$ph | 0; //@line 6501
     } else {
      $$0479 = $5 + -2 | 0; //@line 6505
      $$2476 = $$540$ + -1 | 0; //@line 6505
     }
     $267 = $4 & 8; //@line 6507
     if (!$267) {
      if ($$lcssa675) {
       $270 = HEAP32[$$7505 + -4 >> 2] | 0; //@line 6512
       if (!$270) {
        $$2529 = 9; //@line 6515
       } else {
        if (!(($270 >>> 0) % 10 | 0)) {
         $$1528617 = 0; //@line 6520
         $$3533616 = 10; //@line 6520
         while (1) {
          $$3533616 = $$3533616 * 10 | 0; //@line 6522
          $275 = $$1528617 + 1 | 0; //@line 6523
          if (($270 >>> 0) % ($$3533616 >>> 0) | 0 | 0) {
           $$2529 = $275; //@line 6529
           break;
          } else {
           $$1528617 = $275; //@line 6527
          }
         }
        } else {
         $$2529 = 0; //@line 6534
        }
       }
      } else {
       $$2529 = 9; //@line 6538
      }
      $284 = (($$7505 - $185 >> 2) * 9 | 0) + -9 | 0; //@line 6546
      if (($$0479 | 32 | 0) == 102) {
       $285 = $284 - $$2529 | 0; //@line 6548
       $$548 = ($285 | 0) > 0 ? $285 : 0; //@line 6550
       $$1480 = $$0479; //@line 6553
       $$3477 = ($$2476 | 0) < ($$548 | 0) ? $$2476 : $$548; //@line 6553
       $$pre$phi698Z2D = 0; //@line 6553
       break;
      } else {
       $289 = $284 + $$5519$ph - $$2529 | 0; //@line 6557
       $$550 = ($289 | 0) > 0 ? $289 : 0; //@line 6559
       $$1480 = $$0479; //@line 6562
       $$3477 = ($$2476 | 0) < ($$550 | 0) ? $$2476 : $$550; //@line 6562
       $$pre$phi698Z2D = 0; //@line 6562
       break;
      }
     } else {
      $$1480 = $$0479; //@line 6566
      $$3477 = $$2476; //@line 6566
      $$pre$phi698Z2D = $267; //@line 6566
     }
    } else {
     $$1480 = $5; //@line 6570
     $$3477 = $$540; //@line 6570
     $$pre$phi698Z2D = $4 & 8; //@line 6570
    }
   } while (0);
   $292 = $$3477 | $$pre$phi698Z2D; //@line 6573
   $294 = ($292 | 0) != 0 & 1; //@line 6575
   $296 = ($$1480 | 32 | 0) == 102; //@line 6577
   if ($296) {
    $$2513 = 0; //@line 6581
    $$pn = ($$5519$ph | 0) > 0 ? $$5519$ph : 0; //@line 6581
   } else {
    $300 = ($$5519$ph | 0) < 0 ? $259 : $$5519$ph; //@line 6584
    $303 = _fmt_u($300, (($300 | 0) < 0) << 31 >> 31, $11) | 0; //@line 6587
    $304 = $11; //@line 6588
    if (($304 - $303 | 0) < 2) {
     $$1512610 = $303; //@line 6593
     while (1) {
      $308 = $$1512610 + -1 | 0; //@line 6595
      HEAP8[$308 >> 0] = 48; //@line 6596
      if (($304 - $308 | 0) < 2) {
       $$1512610 = $308; //@line 6601
      } else {
       $$1512$lcssa = $308; //@line 6603
       break;
      }
     }
    } else {
     $$1512$lcssa = $303; //@line 6608
    }
    HEAP8[$$1512$lcssa + -1 >> 0] = ($$5519$ph >> 31 & 2) + 43; //@line 6615
    $318 = $$1512$lcssa + -2 | 0; //@line 6617
    HEAP8[$318 >> 0] = $$1480; //@line 6618
    $$2513 = $318; //@line 6621
    $$pn = $304 - $318 | 0; //@line 6621
   }
   $323 = $$0520 + 1 + $$3477 + $294 + $$pn | 0; //@line 6626
   _pad_676($0, 32, $2, $323, $4); //@line 6627
   _out_670($0, $$0521, $$0520); //@line 6628
   _pad_676($0, 48, $2, $323, $4 ^ 65536); //@line 6630
   if ($296) {
    $$0496$$9 = $$9$ph >>> 0 > $$561 >>> 0 ? $$561 : $$9$ph; //@line 6633
    $326 = $8 + 9 | 0; //@line 6634
    $327 = $326; //@line 6635
    $328 = $8 + 8 | 0; //@line 6636
    $$5493600 = $$0496$$9; //@line 6637
    do {
     $330 = _fmt_u(HEAP32[$$5493600 >> 2] | 0, 0, $326) | 0; //@line 6640
     if (($$5493600 | 0) == ($$0496$$9 | 0)) {
      if (($330 | 0) == ($326 | 0)) {
       HEAP8[$328 >> 0] = 48; //@line 6645
       $$1465 = $328; //@line 6646
      } else {
       $$1465 = $330; //@line 6648
      }
     } else {
      if ($330 >>> 0 > $8 >>> 0) {
       _memset($8 | 0, 48, $330 - $9 | 0) | 0; //@line 6655
       $$0464597 = $330; //@line 6656
       while (1) {
        $335 = $$0464597 + -1 | 0; //@line 6658
        if ($335 >>> 0 > $8 >>> 0) {
         $$0464597 = $335; //@line 6661
        } else {
         $$1465 = $335; //@line 6663
         break;
        }
       }
      } else {
       $$1465 = $330; //@line 6668
      }
     }
     _out_670($0, $$1465, $327 - $$1465 | 0); //@line 6673
     $$5493600 = $$5493600 + 4 | 0; //@line 6674
    } while ($$5493600 >>> 0 <= $$561 >>> 0);
    if ($292 | 0) {
     _out_670($0, 1350, 1); //@line 6684
    }
    if ($$5493600 >>> 0 < $$7505 >>> 0 & ($$3477 | 0) > 0) {
     $$4478593 = $$3477; //@line 6690
     $$6494592 = $$5493600; //@line 6690
     while (1) {
      $347 = _fmt_u(HEAP32[$$6494592 >> 2] | 0, 0, $326) | 0; //@line 6693
      if ($347 >>> 0 > $8 >>> 0) {
       _memset($8 | 0, 48, $347 - $9 | 0) | 0; //@line 6698
       $$0463587 = $347; //@line 6699
       while (1) {
        $351 = $$0463587 + -1 | 0; //@line 6701
        if ($351 >>> 0 > $8 >>> 0) {
         $$0463587 = $351; //@line 6704
        } else {
         $$0463$lcssa = $351; //@line 6706
         break;
        }
       }
      } else {
       $$0463$lcssa = $347; //@line 6711
      }
      _out_670($0, $$0463$lcssa, ($$4478593 | 0) < 9 ? $$4478593 : 9); //@line 6715
      $$6494592 = $$6494592 + 4 | 0; //@line 6716
      $356 = $$4478593 + -9 | 0; //@line 6717
      if (!($$6494592 >>> 0 < $$7505 >>> 0 & ($$4478593 | 0) > 9)) {
       $$4478$lcssa = $356; //@line 6724
       break;
      } else {
       $$4478593 = $356; //@line 6722
      }
     }
    } else {
     $$4478$lcssa = $$3477; //@line 6729
    }
    _pad_676($0, 48, $$4478$lcssa + 9 | 0, 9, 0); //@line 6732
   } else {
    $$7505$ = $$lcssa675 ? $$7505 : $$9$ph + 4 | 0; //@line 6735
    if (($$3477 | 0) > -1) {
     $363 = $8 + 9 | 0; //@line 6738
     $364 = ($$pre$phi698Z2D | 0) == 0; //@line 6739
     $365 = $363; //@line 6740
     $366 = 0 - $9 | 0; //@line 6741
     $367 = $8 + 8 | 0; //@line 6742
     $$5605 = $$3477; //@line 6743
     $$7495604 = $$9$ph; //@line 6743
     while (1) {
      $369 = _fmt_u(HEAP32[$$7495604 >> 2] | 0, 0, $363) | 0; //@line 6746
      if (($369 | 0) == ($363 | 0)) {
       HEAP8[$367 >> 0] = 48; //@line 6749
       $$0 = $367; //@line 6750
      } else {
       $$0 = $369; //@line 6752
      }
      do {
       if (($$7495604 | 0) == ($$9$ph | 0)) {
        $375 = $$0 + 1 | 0; //@line 6757
        _out_670($0, $$0, 1); //@line 6758
        if ($364 & ($$5605 | 0) < 1) {
         $$2 = $375; //@line 6762
         break;
        }
        _out_670($0, 1350, 1); //@line 6765
        $$2 = $375; //@line 6766
       } else {
        if ($$0 >>> 0 <= $8 >>> 0) {
         $$2 = $$0; //@line 6770
         break;
        }
        _memset($8 | 0, 48, $$0 + $366 | 0) | 0; //@line 6775
        $$1601 = $$0; //@line 6776
        while (1) {
         $373 = $$1601 + -1 | 0; //@line 6778
         if ($373 >>> 0 > $8 >>> 0) {
          $$1601 = $373; //@line 6781
         } else {
          $$2 = $373; //@line 6783
          break;
         }
        }
       }
      } while (0);
      $378 = $365 - $$2 | 0; //@line 6790
      _out_670($0, $$2, ($$5605 | 0) > ($378 | 0) ? $378 : $$5605); //@line 6793
      $381 = $$5605 - $378 | 0; //@line 6794
      $$7495604 = $$7495604 + 4 | 0; //@line 6795
      if (!($$7495604 >>> 0 < $$7505$ >>> 0 & ($381 | 0) > -1)) {
       $$5$lcssa = $381; //@line 6802
       break;
      } else {
       $$5605 = $381; //@line 6800
      }
     }
    } else {
     $$5$lcssa = $$3477; //@line 6807
    }
    _pad_676($0, 48, $$5$lcssa + 18 | 0, 18, 0); //@line 6810
    _out_670($0, $$2513, $11 - $$2513 | 0); //@line 6814
   }
   _pad_676($0, 32, $2, $323, $4 ^ 8192); //@line 6817
   $$sink560 = $323; //@line 6818
  }
 } while (0);
 STACKTOP = sp; //@line 6823
 return (($$sink560 | 0) < ($2 | 0) ? $2 : $$sink560) | 0; //@line 6823
}
function _printf_core($0, $1, $2, $3, $4) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 var $$$5 = 0, $$0 = 0, $$0228 = 0, $$0229316 = 0, $$0232 = 0, $$0235 = 0, $$0237 = 0, $$0240$lcssa = 0, $$0240$lcssa356 = 0, $$0240315 = 0, $$0243 = 0, $$0247 = 0, $$0249$lcssa = 0, $$0249303 = 0, $$0252 = 0, $$0253 = 0, $$0254 = 0, $$0259 = 0, $$0262$lcssa = 0, $$0262309 = 0, $$0269 = 0, $$1 = 0, $$1230327 = 0, $$1233 = 0, $$1236 = 0, $$1238 = 0, $$1241326 = 0, $$1244314 = 0, $$1248 = 0, $$1255 = 0, $$1260 = 0, $$1263 = 0, $$1263$ = 0, $$1270 = 0, $$2 = 0, $$2234 = 0, $$2239 = 0, $$2242$lcssa = 0, $$2242302 = 0, $$2245 = 0, $$2251 = 0, $$2256 = 0, $$2261 = 0, $$2271 = 0, $$3265 = 0, $$3272 = 0, $$3300 = 0, $$4258354 = 0, $$4266 = 0, $$5 = 0, $$6268 = 0, $$lcssa291 = 0, $$lcssa292 = 0, $$pre342 = 0, $$pre345 = 0, $$pre348 = 0, $$sink = 0, $10 = 0, $105 = 0, $106 = 0, $109 = 0, $11 = 0, $112 = 0, $115 = 0, $12 = 0, $125 = 0, $129 = 0, $13 = 0, $14 = 0, $140 = 0, $144 = 0, $151 = 0, $152 = 0, $154 = 0, $156 = 0, $158 = 0, $167 = 0, $168 = 0, $173 = 0, $176 = 0, $181 = 0, $182 = 0, $187 = 0, $189 = 0, $196 = 0, $197 = 0, $20 = 0, $208 = 0, $21 = 0, $220 = 0, $227 = 0, $229 = 0, $23 = 0, $232 = 0, $234 = 0, $24 = 0, $242 = 0, $244 = 0, $247 = 0, $248 = 0, $25 = 0, $252 = 0, $256 = 0, $258 = 0, $261 = 0, $263 = 0, $264 = 0, $265 = 0, $27 = 0, $275 = 0, $276 = 0, $281 = 0, $283 = 0, $284 = 0, $290 = 0, $30 = 0, $302 = 0, $305 = 0, $306 = 0, $318 = 0, $320 = 0, $325 = 0, $329 = 0, $331 = 0, $343 = 0, $345 = 0, $352 = 0, $356 = 0, $36 = 0, $363 = 0, $364 = 0, $365 = 0, $43 = 0, $5 = 0, $51 = 0, $52 = 0, $54 = 0, $6 = 0, $60 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0, $68 = 0, $7 = 0, $79 = 0, $8 = 0, $83 = 0, $9 = 0, $or$cond = 0, $or$cond278 = 0, $storemerge274 = 0, label = 0, sp = 0, $158$looptemp = 0;
 sp = STACKTOP; //@line 4501
 STACKTOP = STACKTOP + 64 | 0; //@line 4502
 $5 = sp + 16 | 0; //@line 4503
 $6 = sp; //@line 4504
 $7 = sp + 24 | 0; //@line 4505
 $8 = sp + 8 | 0; //@line 4506
 $9 = sp + 20 | 0; //@line 4507
 HEAP32[$5 >> 2] = $1; //@line 4508
 $10 = ($0 | 0) != 0; //@line 4509
 $11 = $7 + 40 | 0; //@line 4510
 $12 = $11; //@line 4511
 $13 = $7 + 39 | 0; //@line 4512
 $14 = $8 + 4 | 0; //@line 4513
 $$0243 = 0; //@line 4514
 $$0247 = 0; //@line 4514
 $$0269 = 0; //@line 4514
 L1 : while (1) {
  do {
   if (($$0247 | 0) > -1) {
    if (($$0243 | 0) > (2147483647 - $$0247 | 0)) {
     HEAP32[(___errno_location() | 0) >> 2] = 75; //@line 4523
     $$1248 = -1; //@line 4524
     break;
    } else {
     $$1248 = $$0243 + $$0247 | 0; //@line 4528
     break;
    }
   } else {
    $$1248 = $$0247; //@line 4532
   }
  } while (0);
  $20 = HEAP32[$5 >> 2] | 0; //@line 4535
  $21 = HEAP8[$20 >> 0] | 0; //@line 4536
  if (!($21 << 24 >> 24)) {
   label = 88; //@line 4539
   break;
  } else {
   $23 = $21; //@line 4542
   $25 = $20; //@line 4542
  }
  L9 : while (1) {
   switch ($23 << 24 >> 24) {
   case 37:
    {
     $$0249303 = $25; //@line 4547
     $27 = $25; //@line 4547
     label = 9; //@line 4548
     break L9;
     break;
    }
   case 0:
    {
     $$0249$lcssa = $25; //@line 4553
     break L9;
     break;
    }
   default:
    {}
   }
   $24 = $25 + 1 | 0; //@line 4560
   HEAP32[$5 >> 2] = $24; //@line 4561
   $23 = HEAP8[$24 >> 0] | 0; //@line 4563
   $25 = $24; //@line 4563
  }
  L12 : do {
   if ((label | 0) == 9) {
    while (1) {
     label = 0; //@line 4568
     if ((HEAP8[$27 + 1 >> 0] | 0) != 37) {
      $$0249$lcssa = $$0249303; //@line 4573
      break L12;
     }
     $30 = $$0249303 + 1 | 0; //@line 4576
     $27 = $27 + 2 | 0; //@line 4577
     HEAP32[$5 >> 2] = $27; //@line 4578
     if ((HEAP8[$27 >> 0] | 0) != 37) {
      $$0249$lcssa = $30; //@line 4585
      break;
     } else {
      $$0249303 = $30; //@line 4582
      label = 9; //@line 4583
     }
    }
   }
  } while (0);
  $36 = $$0249$lcssa - $20 | 0; //@line 4593
  if ($10) {
   _out_670($0, $20, $36); //@line 4595
  }
  if ($36 | 0) {
   $$0243 = $36; //@line 4599
   $$0247 = $$1248; //@line 4599
   continue;
  }
  $43 = (_isdigit(HEAP8[(HEAP32[$5 >> 2] | 0) + 1 >> 0] | 0) | 0) == 0; //@line 4607
  $$pre342 = HEAP32[$5 >> 2] | 0; //@line 4608
  if ($43) {
   $$0253 = -1; //@line 4610
   $$1270 = $$0269; //@line 4610
   $$sink = 1; //@line 4610
  } else {
   if ((HEAP8[$$pre342 + 2 >> 0] | 0) == 36) {
    $$0253 = (HEAP8[$$pre342 + 1 >> 0] | 0) + -48 | 0; //@line 4620
    $$1270 = 1; //@line 4620
    $$sink = 3; //@line 4620
   } else {
    $$0253 = -1; //@line 4622
    $$1270 = $$0269; //@line 4622
    $$sink = 1; //@line 4622
   }
  }
  $51 = $$pre342 + $$sink | 0; //@line 4625
  HEAP32[$5 >> 2] = $51; //@line 4626
  $52 = HEAP8[$51 >> 0] | 0; //@line 4627
  $54 = ($52 << 24 >> 24) + -32 | 0; //@line 4629
  if ($54 >>> 0 > 31 | (1 << $54 & 75913 | 0) == 0) {
   $$0262$lcssa = 0; //@line 4636
   $$lcssa291 = $52; //@line 4636
   $$lcssa292 = $51; //@line 4636
  } else {
   $$0262309 = 0; //@line 4638
   $60 = $52; //@line 4638
   $65 = $51; //@line 4638
   while (1) {
    $63 = 1 << ($60 << 24 >> 24) + -32 | $$0262309; //@line 4643
    $64 = $65 + 1 | 0; //@line 4644
    HEAP32[$5 >> 2] = $64; //@line 4645
    $66 = HEAP8[$64 >> 0] | 0; //@line 4646
    $68 = ($66 << 24 >> 24) + -32 | 0; //@line 4648
    if ($68 >>> 0 > 31 | (1 << $68 & 75913 | 0) == 0) {
     $$0262$lcssa = $63; //@line 4655
     $$lcssa291 = $66; //@line 4655
     $$lcssa292 = $64; //@line 4655
     break;
    } else {
     $$0262309 = $63; //@line 4658
     $60 = $66; //@line 4658
     $65 = $64; //@line 4658
    }
   }
  }
  if ($$lcssa291 << 24 >> 24 == 42) {
   if (!(_isdigit(HEAP8[$$lcssa292 + 1 >> 0] | 0) | 0)) {
    label = 23; //@line 4670
   } else {
    $79 = HEAP32[$5 >> 2] | 0; //@line 4672
    if ((HEAP8[$79 + 2 >> 0] | 0) == 36) {
     $83 = $79 + 1 | 0; //@line 4677
     HEAP32[$4 + ((HEAP8[$83 >> 0] | 0) + -48 << 2) >> 2] = 10; //@line 4682
     $$0259 = HEAP32[$3 + ((HEAP8[$83 >> 0] | 0) + -48 << 3) >> 2] | 0; //@line 4694
     $$2271 = 1; //@line 4694
     $storemerge274 = $79 + 3 | 0; //@line 4694
    } else {
     label = 23; //@line 4696
    }
   }
   if ((label | 0) == 23) {
    label = 0; //@line 4700
    if ($$1270 | 0) {
     $$0 = -1; //@line 4703
     break;
    }
    if ($10) {
     $105 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 4718
     $106 = HEAP32[$105 >> 2] | 0; //@line 4719
     HEAP32[$2 >> 2] = $105 + 4; //@line 4721
     $363 = $106; //@line 4722
    } else {
     $363 = 0; //@line 4724
    }
    $$0259 = $363; //@line 4728
    $$2271 = 0; //@line 4728
    $storemerge274 = (HEAP32[$5 >> 2] | 0) + 1 | 0; //@line 4728
   }
   HEAP32[$5 >> 2] = $storemerge274; //@line 4730
   $109 = ($$0259 | 0) < 0; //@line 4731
   $$1260 = $109 ? 0 - $$0259 | 0 : $$0259; //@line 4736
   $$1263 = $109 ? $$0262$lcssa | 8192 : $$0262$lcssa; //@line 4736
   $$3272 = $$2271; //@line 4736
   $115 = $storemerge274; //@line 4736
  } else {
   $112 = _getint_671($5) | 0; //@line 4738
   if (($112 | 0) < 0) {
    $$0 = -1; //@line 4741
    break;
   }
   $$1260 = $112; //@line 4745
   $$1263 = $$0262$lcssa; //@line 4745
   $$3272 = $$1270; //@line 4745
   $115 = HEAP32[$5 >> 2] | 0; //@line 4745
  }
  do {
   if ((HEAP8[$115 >> 0] | 0) == 46) {
    if ((HEAP8[$115 + 1 >> 0] | 0) != 42) {
     HEAP32[$5 >> 2] = $115 + 1; //@line 4756
     $156 = _getint_671($5) | 0; //@line 4757
     $$0254 = $156; //@line 4759
     $$pre345 = HEAP32[$5 >> 2] | 0; //@line 4759
     break;
    }
    if (_isdigit(HEAP8[$115 + 2 >> 0] | 0) | 0) {
     $125 = HEAP32[$5 >> 2] | 0; //@line 4768
     if ((HEAP8[$125 + 3 >> 0] | 0) == 36) {
      $129 = $125 + 2 | 0; //@line 4773
      HEAP32[$4 + ((HEAP8[$129 >> 0] | 0) + -48 << 2) >> 2] = 10; //@line 4778
      $140 = HEAP32[$3 + ((HEAP8[$129 >> 0] | 0) + -48 << 3) >> 2] | 0; //@line 4785
      $144 = $125 + 4 | 0; //@line 4789
      HEAP32[$5 >> 2] = $144; //@line 4790
      $$0254 = $140; //@line 4791
      $$pre345 = $144; //@line 4791
      break;
     }
    }
    if ($$3272 | 0) {
     $$0 = -1; //@line 4797
     break L1;
    }
    if ($10) {
     $151 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 4812
     $152 = HEAP32[$151 >> 2] | 0; //@line 4813
     HEAP32[$2 >> 2] = $151 + 4; //@line 4815
     $364 = $152; //@line 4816
    } else {
     $364 = 0; //@line 4818
    }
    $154 = (HEAP32[$5 >> 2] | 0) + 2 | 0; //@line 4821
    HEAP32[$5 >> 2] = $154; //@line 4822
    $$0254 = $364; //@line 4823
    $$pre345 = $154; //@line 4823
   } else {
    $$0254 = -1; //@line 4825
    $$pre345 = $115; //@line 4825
   }
  } while (0);
  $$0252 = 0; //@line 4828
  $158 = $$pre345; //@line 4828
  while (1) {
   if (((HEAP8[$158 >> 0] | 0) + -65 | 0) >>> 0 > 57) {
    $$0 = -1; //@line 4835
    break L1;
   }
   $158$looptemp = $158;
   $158 = $158 + 1 | 0; //@line 4838
   HEAP32[$5 >> 2] = $158; //@line 4839
   $167 = HEAP8[(HEAP8[$158$looptemp >> 0] | 0) + -65 + (818 + ($$0252 * 58 | 0)) >> 0] | 0; //@line 4844
   $168 = $167 & 255; //@line 4845
   if (($168 + -1 | 0) >>> 0 >= 8) {
    break;
   } else {
    $$0252 = $168; //@line 4849
   }
  }
  if (!($167 << 24 >> 24)) {
   $$0 = -1; //@line 4856
   break;
  }
  $173 = ($$0253 | 0) > -1; //@line 4860
  do {
   if ($167 << 24 >> 24 == 19) {
    if ($173) {
     $$0 = -1; //@line 4864
     break L1;
    } else {
     label = 50; //@line 4867
    }
   } else {
    if ($173) {
     HEAP32[$4 + ($$0253 << 2) >> 2] = $168; //@line 4872
     $176 = $3 + ($$0253 << 3) | 0; //@line 4874
     $181 = HEAP32[$176 + 4 >> 2] | 0; //@line 4879
     $182 = $6; //@line 4880
     HEAP32[$182 >> 2] = HEAP32[$176 >> 2]; //@line 4882
     HEAP32[$182 + 4 >> 2] = $181; //@line 4885
     label = 50; //@line 4886
     break;
    }
    if (!$10) {
     $$0 = 0; //@line 4890
     break L1;
    }
    _pop_arg_673($6, $168, $2); //@line 4893
    $187 = HEAP32[$5 >> 2] | 0; //@line 4895
   }
  } while (0);
  if ((label | 0) == 50) {
   label = 0; //@line 4899
   if ($10) {
    $187 = $158; //@line 4901
   } else {
    $$0243 = 0; //@line 4903
    $$0247 = $$1248; //@line 4903
    $$0269 = $$3272; //@line 4903
    continue;
   }
  }
  $189 = HEAP8[$187 + -1 >> 0] | 0; //@line 4909
  $$0235 = ($$0252 | 0) != 0 & ($189 & 15 | 0) == 3 ? $189 & -33 : $189; //@line 4915
  $196 = $$1263 & -65537; //@line 4918
  $$1263$ = ($$1263 & 8192 | 0) == 0 ? $$1263 : $196; //@line 4919
  L73 : do {
   switch ($$0235 | 0) {
   case 110:
    {
     switch (($$0252 & 255) << 24 >> 24) {
     case 0:
      {
       HEAP32[HEAP32[$6 >> 2] >> 2] = $$1248; //@line 4927
       $$0243 = 0; //@line 4928
       $$0247 = $$1248; //@line 4928
       $$0269 = $$3272; //@line 4928
       continue L1;
       break;
      }
     case 1:
      {
       HEAP32[HEAP32[$6 >> 2] >> 2] = $$1248; //@line 4934
       $$0243 = 0; //@line 4935
       $$0247 = $$1248; //@line 4935
       $$0269 = $$3272; //@line 4935
       continue L1;
       break;
      }
     case 2:
      {
       $208 = HEAP32[$6 >> 2] | 0; //@line 4943
       HEAP32[$208 >> 2] = $$1248; //@line 4945
       HEAP32[$208 + 4 >> 2] = (($$1248 | 0) < 0) << 31 >> 31; //@line 4948
       $$0243 = 0; //@line 4949
       $$0247 = $$1248; //@line 4949
       $$0269 = $$3272; //@line 4949
       continue L1;
       break;
      }
     case 3:
      {
       HEAP16[HEAP32[$6 >> 2] >> 1] = $$1248; //@line 4956
       $$0243 = 0; //@line 4957
       $$0247 = $$1248; //@line 4957
       $$0269 = $$3272; //@line 4957
       continue L1;
       break;
      }
     case 4:
      {
       HEAP8[HEAP32[$6 >> 2] >> 0] = $$1248; //@line 4964
       $$0243 = 0; //@line 4965
       $$0247 = $$1248; //@line 4965
       $$0269 = $$3272; //@line 4965
       continue L1;
       break;
      }
     case 6:
      {
       HEAP32[HEAP32[$6 >> 2] >> 2] = $$1248; //@line 4971
       $$0243 = 0; //@line 4972
       $$0247 = $$1248; //@line 4972
       $$0269 = $$3272; //@line 4972
       continue L1;
       break;
      }
     case 7:
      {
       $220 = HEAP32[$6 >> 2] | 0; //@line 4980
       HEAP32[$220 >> 2] = $$1248; //@line 4982
       HEAP32[$220 + 4 >> 2] = (($$1248 | 0) < 0) << 31 >> 31; //@line 4985
       $$0243 = 0; //@line 4986
       $$0247 = $$1248; //@line 4986
       $$0269 = $$3272; //@line 4986
       continue L1;
       break;
      }
     default:
      {
       $$0243 = 0; //@line 4991
       $$0247 = $$1248; //@line 4991
       $$0269 = $$3272; //@line 4991
       continue L1;
      }
     }
     break;
    }
   case 112:
    {
     $$1236 = 120; //@line 5001
     $$1255 = $$0254 >>> 0 > 8 ? $$0254 : 8; //@line 5001
     $$3265 = $$1263$ | 8; //@line 5001
     label = 62; //@line 5002
     break;
    }
   case 88:
   case 120:
    {
     $$1236 = $$0235; //@line 5006
     $$1255 = $$0254; //@line 5006
     $$3265 = $$1263$; //@line 5006
     label = 62; //@line 5007
     break;
    }
   case 111:
    {
     $242 = $6; //@line 5011
     $244 = HEAP32[$242 >> 2] | 0; //@line 5013
     $247 = HEAP32[$242 + 4 >> 2] | 0; //@line 5016
     $248 = _fmt_o($244, $247, $11) | 0; //@line 5017
     $252 = $12 - $248 | 0; //@line 5021
     $$0228 = $248; //@line 5026
     $$1233 = 0; //@line 5026
     $$1238 = 1282; //@line 5026
     $$2256 = ($$1263$ & 8 | 0) == 0 | ($$0254 | 0) > ($252 | 0) ? $$0254 : $252 + 1 | 0; //@line 5026
     $$4266 = $$1263$; //@line 5026
     $281 = $244; //@line 5026
     $283 = $247; //@line 5026
     label = 68; //@line 5027
     break;
    }
   case 105:
   case 100:
    {
     $256 = $6; //@line 5031
     $258 = HEAP32[$256 >> 2] | 0; //@line 5033
     $261 = HEAP32[$256 + 4 >> 2] | 0; //@line 5036
     if (($261 | 0) < 0) {
      $263 = _i64Subtract(0, 0, $258 | 0, $261 | 0) | 0; //@line 5039
      $264 = tempRet0; //@line 5040
      $265 = $6; //@line 5041
      HEAP32[$265 >> 2] = $263; //@line 5043
      HEAP32[$265 + 4 >> 2] = $264; //@line 5046
      $$0232 = 1; //@line 5047
      $$0237 = 1282; //@line 5047
      $275 = $263; //@line 5047
      $276 = $264; //@line 5047
      label = 67; //@line 5048
      break L73;
     } else {
      $$0232 = ($$1263$ & 2049 | 0) != 0 & 1; //@line 5060
      $$0237 = ($$1263$ & 2048 | 0) == 0 ? ($$1263$ & 1 | 0) == 0 ? 1282 : 1284 : 1283; //@line 5060
      $275 = $258; //@line 5060
      $276 = $261; //@line 5060
      label = 67; //@line 5061
      break L73;
     }
     break;
    }
   case 117:
    {
     $197 = $6; //@line 5067
     $$0232 = 0; //@line 5073
     $$0237 = 1282; //@line 5073
     $275 = HEAP32[$197 >> 2] | 0; //@line 5073
     $276 = HEAP32[$197 + 4 >> 2] | 0; //@line 5073
     label = 67; //@line 5074
     break;
    }
   case 99:
    {
     HEAP8[$13 >> 0] = HEAP32[$6 >> 2]; //@line 5085
     $$2 = $13; //@line 5086
     $$2234 = 0; //@line 5086
     $$2239 = 1282; //@line 5086
     $$2251 = $11; //@line 5086
     $$5 = 1; //@line 5086
     $$6268 = $196; //@line 5086
     break;
    }
   case 109:
    {
     $$1 = _strerror(HEAP32[(___errno_location() | 0) >> 2] | 0) | 0; //@line 5093
     label = 72; //@line 5094
     break;
    }
   case 115:
    {
     $302 = HEAP32[$6 >> 2] | 0; //@line 5098
     $$1 = $302 | 0 ? $302 : 1292; //@line 5101
     label = 72; //@line 5102
     break;
    }
   case 67:
    {
     HEAP32[$8 >> 2] = HEAP32[$6 >> 2]; //@line 5112
     HEAP32[$14 >> 2] = 0; //@line 5113
     HEAP32[$6 >> 2] = $8; //@line 5114
     $$4258354 = -1; //@line 5115
     $365 = $8; //@line 5115
     label = 76; //@line 5116
     break;
    }
   case 83:
    {
     $$pre348 = HEAP32[$6 >> 2] | 0; //@line 5120
     if (!$$0254) {
      _pad_676($0, 32, $$1260, 0, $$1263$); //@line 5123
      $$0240$lcssa356 = 0; //@line 5124
      label = 85; //@line 5125
     } else {
      $$4258354 = $$0254; //@line 5127
      $365 = $$pre348; //@line 5127
      label = 76; //@line 5128
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
     $$0243 = _fmt_fp($0, +HEAPF64[$6 >> 3], $$1260, $$0254, $$1263$, $$0235) | 0; //@line 5135
     $$0247 = $$1248; //@line 5135
     $$0269 = $$3272; //@line 5135
     continue L1;
     break;
    }
   default:
    {
     $$2 = $20; //@line 5140
     $$2234 = 0; //@line 5140
     $$2239 = 1282; //@line 5140
     $$2251 = $11; //@line 5140
     $$5 = $$0254; //@line 5140
     $$6268 = $$1263$; //@line 5140
    }
   }
  } while (0);
  L97 : do {
   if ((label | 0) == 62) {
    label = 0; //@line 5146
    $227 = $6; //@line 5147
    $229 = HEAP32[$227 >> 2] | 0; //@line 5149
    $232 = HEAP32[$227 + 4 >> 2] | 0; //@line 5152
    $234 = _fmt_x($229, $232, $11, $$1236 & 32) | 0; //@line 5154
    $or$cond278 = ($$3265 & 8 | 0) == 0 | ($229 | 0) == 0 & ($232 | 0) == 0; //@line 5160
    $$0228 = $234; //@line 5165
    $$1233 = $or$cond278 ? 0 : 2; //@line 5165
    $$1238 = $or$cond278 ? 1282 : 1282 + ($$1236 >> 4) | 0; //@line 5165
    $$2256 = $$1255; //@line 5165
    $$4266 = $$3265; //@line 5165
    $281 = $229; //@line 5165
    $283 = $232; //@line 5165
    label = 68; //@line 5166
   } else if ((label | 0) == 67) {
    label = 0; //@line 5169
    $$0228 = _fmt_u($275, $276, $11) | 0; //@line 5171
    $$1233 = $$0232; //@line 5171
    $$1238 = $$0237; //@line 5171
    $$2256 = $$0254; //@line 5171
    $$4266 = $$1263$; //@line 5171
    $281 = $275; //@line 5171
    $283 = $276; //@line 5171
    label = 68; //@line 5172
   } else if ((label | 0) == 72) {
    label = 0; //@line 5175
    $305 = _memchr($$1, 0, $$0254) | 0; //@line 5176
    $306 = ($305 | 0) == 0; //@line 5177
    $$2 = $$1; //@line 5184
    $$2234 = 0; //@line 5184
    $$2239 = 1282; //@line 5184
    $$2251 = $306 ? $$1 + $$0254 | 0 : $305; //@line 5184
    $$5 = $306 ? $$0254 : $305 - $$1 | 0; //@line 5184
    $$6268 = $196; //@line 5184
   } else if ((label | 0) == 76) {
    label = 0; //@line 5187
    $$0229316 = $365; //@line 5188
    $$0240315 = 0; //@line 5188
    $$1244314 = 0; //@line 5188
    while (1) {
     $318 = HEAP32[$$0229316 >> 2] | 0; //@line 5190
     if (!$318) {
      $$0240$lcssa = $$0240315; //@line 5193
      $$2245 = $$1244314; //@line 5193
      break;
     }
     $320 = _wctomb($9, $318) | 0; //@line 5196
     if (($320 | 0) < 0 | $320 >>> 0 > ($$4258354 - $$0240315 | 0) >>> 0) {
      $$0240$lcssa = $$0240315; //@line 5202
      $$2245 = $320; //@line 5202
      break;
     }
     $325 = $320 + $$0240315 | 0; //@line 5206
     if ($$4258354 >>> 0 > $325 >>> 0) {
      $$0229316 = $$0229316 + 4 | 0; //@line 5209
      $$0240315 = $325; //@line 5209
      $$1244314 = $320; //@line 5209
     } else {
      $$0240$lcssa = $325; //@line 5211
      $$2245 = $320; //@line 5211
      break;
     }
    }
    if (($$2245 | 0) < 0) {
     $$0 = -1; //@line 5217
     break L1;
    }
    _pad_676($0, 32, $$1260, $$0240$lcssa, $$1263$); //@line 5220
    if (!$$0240$lcssa) {
     $$0240$lcssa356 = 0; //@line 5223
     label = 85; //@line 5224
    } else {
     $$1230327 = $365; //@line 5226
     $$1241326 = 0; //@line 5226
     while (1) {
      $329 = HEAP32[$$1230327 >> 2] | 0; //@line 5228
      if (!$329) {
       $$0240$lcssa356 = $$0240$lcssa; //@line 5231
       label = 85; //@line 5232
       break L97;
      }
      $331 = _wctomb($9, $329) | 0; //@line 5235
      $$1241326 = $331 + $$1241326 | 0; //@line 5236
      if (($$1241326 | 0) > ($$0240$lcssa | 0)) {
       $$0240$lcssa356 = $$0240$lcssa; //@line 5239
       label = 85; //@line 5240
       break L97;
      }
      _out_670($0, $9, $331); //@line 5244
      if ($$1241326 >>> 0 >= $$0240$lcssa >>> 0) {
       $$0240$lcssa356 = $$0240$lcssa; //@line 5249
       label = 85; //@line 5250
       break;
      } else {
       $$1230327 = $$1230327 + 4 | 0; //@line 5247
      }
     }
    }
   }
  } while (0);
  if ((label | 0) == 68) {
   label = 0; //@line 5258
   $284 = ($281 | 0) != 0 | ($283 | 0) != 0; //@line 5264
   $or$cond = ($$2256 | 0) != 0 | $284; //@line 5266
   $290 = $12 - $$0228 + (($284 ^ 1) & 1) | 0; //@line 5271
   $$2 = $or$cond ? $$0228 : $11; //@line 5276
   $$2234 = $$1233; //@line 5276
   $$2239 = $$1238; //@line 5276
   $$2251 = $11; //@line 5276
   $$5 = $or$cond ? ($$2256 | 0) > ($290 | 0) ? $$2256 : $290 : $$2256; //@line 5276
   $$6268 = ($$2256 | 0) > -1 ? $$4266 & -65537 : $$4266; //@line 5276
  } else if ((label | 0) == 85) {
   label = 0; //@line 5279
   _pad_676($0, 32, $$1260, $$0240$lcssa356, $$1263$ ^ 8192); //@line 5281
   $$0243 = ($$1260 | 0) > ($$0240$lcssa356 | 0) ? $$1260 : $$0240$lcssa356; //@line 5284
   $$0247 = $$1248; //@line 5284
   $$0269 = $$3272; //@line 5284
   continue;
  }
  $343 = $$2251 - $$2 | 0; //@line 5289
  $$$5 = ($$5 | 0) < ($343 | 0) ? $343 : $$5; //@line 5291
  $345 = $$$5 + $$2234 | 0; //@line 5292
  $$2261 = ($$1260 | 0) < ($345 | 0) ? $345 : $$1260; //@line 5294
  _pad_676($0, 32, $$2261, $345, $$6268); //@line 5295
  _out_670($0, $$2239, $$2234); //@line 5296
  _pad_676($0, 48, $$2261, $345, $$6268 ^ 65536); //@line 5298
  _pad_676($0, 48, $$$5, $343, 0); //@line 5299
  _out_670($0, $$2, $343); //@line 5300
  _pad_676($0, 32, $$2261, $345, $$6268 ^ 8192); //@line 5302
  $$0243 = $$2261; //@line 5303
  $$0247 = $$1248; //@line 5303
  $$0269 = $$3272; //@line 5303
 }
 L116 : do {
  if ((label | 0) == 88) {
   if (!$0) {
    if (!$$0269) {
     $$0 = 0; //@line 5311
    } else {
     $$2242302 = 1; //@line 5313
     while (1) {
      $352 = HEAP32[$4 + ($$2242302 << 2) >> 2] | 0; //@line 5316
      if (!$352) {
       $$2242$lcssa = $$2242302; //@line 5319
       break;
      }
      _pop_arg_673($3 + ($$2242302 << 3) | 0, $352, $2); //@line 5323
      $356 = $$2242302 + 1 | 0; //@line 5324
      if (($$2242302 | 0) < 9) {
       $$2242302 = $356; //@line 5327
      } else {
       $$2242$lcssa = $356; //@line 5329
       break;
      }
     }
     if (($$2242$lcssa | 0) < 10) {
      $$3300 = $$2242$lcssa; //@line 5335
      while (1) {
       if (HEAP32[$4 + ($$3300 << 2) >> 2] | 0) {
        $$0 = -1; //@line 5341
        break L116;
       }
       if (($$3300 | 0) < 9) {
        $$3300 = $$3300 + 1 | 0; //@line 5347
       } else {
        $$0 = 1; //@line 5349
        break;
       }
      }
     } else {
      $$0 = 1; //@line 5354
     }
    }
   } else {
    $$0 = $$1248; //@line 5358
   }
  }
 } while (0);
 STACKTOP = sp; //@line 5362
 return $$0 | 0; //@line 5362
}
function _free($0) {
 $0 = $0 | 0;
 var $$0212$i = 0, $$0212$in$i = 0, $$0383 = 0, $$0384 = 0, $$0396 = 0, $$0403 = 0, $$1 = 0, $$1382 = 0, $$1387 = 0, $$1390 = 0, $$1398 = 0, $$1402 = 0, $$2 = 0, $$3 = 0, $$3400 = 0, $$pre$phi442Z2D = 0, $$pre$phi444Z2D = 0, $$pre$phiZ2D = 0, $10 = 0, $105 = 0, $106 = 0, $114 = 0, $115 = 0, $116 = 0, $124 = 0, $13 = 0, $132 = 0, $137 = 0, $138 = 0, $141 = 0, $143 = 0, $145 = 0, $16 = 0, $160 = 0, $165 = 0, $167 = 0, $17 = 0, $170 = 0, $173 = 0, $176 = 0, $179 = 0, $180 = 0, $181 = 0, $183 = 0, $185 = 0, $186 = 0, $188 = 0, $189 = 0, $195 = 0, $196 = 0, $2 = 0, $21 = 0, $210 = 0, $213 = 0, $214 = 0, $220 = 0, $235 = 0, $238 = 0, $239 = 0, $24 = 0, $240 = 0, $244 = 0, $245 = 0, $251 = 0, $256 = 0, $257 = 0, $26 = 0, $260 = 0, $262 = 0, $265 = 0, $270 = 0, $276 = 0, $28 = 0, $280 = 0, $281 = 0, $299 = 0, $3 = 0, $301 = 0, $308 = 0, $309 = 0, $310 = 0, $319 = 0, $41 = 0, $46 = 0, $48 = 0, $51 = 0, $53 = 0, $56 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $63 = 0, $65 = 0, $66 = 0, $68 = 0, $69 = 0, $7 = 0, $74 = 0, $75 = 0, $89 = 0, $9 = 0, $92 = 0, $93 = 0, $99 = 0, label = 0;
 if (!$0) {
  return;
 }
 $2 = $0 + -8 | 0; //@line 2879
 $3 = HEAP32[868] | 0; //@line 2880
 if ($2 >>> 0 < $3 >>> 0) {
  _abort(); //@line 2883
 }
 $6 = HEAP32[$0 + -4 >> 2] | 0; //@line 2887
 $7 = $6 & 3; //@line 2888
 if (($7 | 0) == 1) {
  _abort(); //@line 2891
 }
 $9 = $6 & -8; //@line 2894
 $10 = $2 + $9 | 0; //@line 2895
 L10 : do {
  if (!($6 & 1)) {
   $13 = HEAP32[$2 >> 2] | 0; //@line 2900
   if (!$7) {
    return;
   }
   $16 = $2 + (0 - $13) | 0; //@line 2906
   $17 = $13 + $9 | 0; //@line 2907
   if ($16 >>> 0 < $3 >>> 0) {
    _abort(); //@line 2910
   }
   if ((HEAP32[869] | 0) == ($16 | 0)) {
    $105 = $10 + 4 | 0; //@line 2916
    $106 = HEAP32[$105 >> 2] | 0; //@line 2917
    if (($106 & 3 | 0) != 3) {
     $$1 = $16; //@line 2921
     $$1382 = $17; //@line 2921
     $114 = $16; //@line 2921
     break;
    }
    HEAP32[866] = $17; //@line 2924
    HEAP32[$105 >> 2] = $106 & -2; //@line 2926
    HEAP32[$16 + 4 >> 2] = $17 | 1; //@line 2929
    HEAP32[$16 + $17 >> 2] = $17; //@line 2931
    return;
   }
   $21 = $13 >>> 3; //@line 2934
   if ($13 >>> 0 < 256) {
    $24 = HEAP32[$16 + 8 >> 2] | 0; //@line 2938
    $26 = HEAP32[$16 + 12 >> 2] | 0; //@line 2940
    $28 = 3496 + ($21 << 1 << 2) | 0; //@line 2942
    if (($24 | 0) != ($28 | 0)) {
     if ($3 >>> 0 > $24 >>> 0) {
      _abort(); //@line 2947
     }
     if ((HEAP32[$24 + 12 >> 2] | 0) != ($16 | 0)) {
      _abort(); //@line 2954
     }
    }
    if (($26 | 0) == ($24 | 0)) {
     HEAP32[864] = HEAP32[864] & ~(1 << $21); //@line 2964
     $$1 = $16; //@line 2965
     $$1382 = $17; //@line 2965
     $114 = $16; //@line 2965
     break;
    }
    if (($26 | 0) == ($28 | 0)) {
     $$pre$phi444Z2D = $26 + 8 | 0; //@line 2971
    } else {
     if ($3 >>> 0 > $26 >>> 0) {
      _abort(); //@line 2975
     }
     $41 = $26 + 8 | 0; //@line 2978
     if ((HEAP32[$41 >> 2] | 0) == ($16 | 0)) {
      $$pre$phi444Z2D = $41; //@line 2982
     } else {
      _abort(); //@line 2984
     }
    }
    HEAP32[$24 + 12 >> 2] = $26; //@line 2989
    HEAP32[$$pre$phi444Z2D >> 2] = $24; //@line 2990
    $$1 = $16; //@line 2991
    $$1382 = $17; //@line 2991
    $114 = $16; //@line 2991
    break;
   }
   $46 = HEAP32[$16 + 24 >> 2] | 0; //@line 2995
   $48 = HEAP32[$16 + 12 >> 2] | 0; //@line 2997
   do {
    if (($48 | 0) == ($16 | 0)) {
     $59 = $16 + 16 | 0; //@line 3001
     $60 = $59 + 4 | 0; //@line 3002
     $61 = HEAP32[$60 >> 2] | 0; //@line 3003
     if (!$61) {
      $63 = HEAP32[$59 >> 2] | 0; //@line 3006
      if (!$63) {
       $$3 = 0; //@line 3009
       break;
      } else {
       $$1387 = $63; //@line 3012
       $$1390 = $59; //@line 3012
      }
     } else {
      $$1387 = $61; //@line 3015
      $$1390 = $60; //@line 3015
     }
     while (1) {
      $65 = $$1387 + 20 | 0; //@line 3018
      $66 = HEAP32[$65 >> 2] | 0; //@line 3019
      if ($66 | 0) {
       $$1387 = $66; //@line 3022
       $$1390 = $65; //@line 3022
       continue;
      }
      $68 = $$1387 + 16 | 0; //@line 3025
      $69 = HEAP32[$68 >> 2] | 0; //@line 3026
      if (!$69) {
       break;
      } else {
       $$1387 = $69; //@line 3031
       $$1390 = $68; //@line 3031
      }
     }
     if ($3 >>> 0 > $$1390 >>> 0) {
      _abort(); //@line 3036
     } else {
      HEAP32[$$1390 >> 2] = 0; //@line 3039
      $$3 = $$1387; //@line 3040
      break;
     }
    } else {
     $51 = HEAP32[$16 + 8 >> 2] | 0; //@line 3045
     if ($3 >>> 0 > $51 >>> 0) {
      _abort(); //@line 3048
     }
     $53 = $51 + 12 | 0; //@line 3051
     if ((HEAP32[$53 >> 2] | 0) != ($16 | 0)) {
      _abort(); //@line 3055
     }
     $56 = $48 + 8 | 0; //@line 3058
     if ((HEAP32[$56 >> 2] | 0) == ($16 | 0)) {
      HEAP32[$53 >> 2] = $48; //@line 3062
      HEAP32[$56 >> 2] = $51; //@line 3063
      $$3 = $48; //@line 3064
      break;
     } else {
      _abort(); //@line 3067
     }
    }
   } while (0);
   if (!$46) {
    $$1 = $16; //@line 3074
    $$1382 = $17; //@line 3074
    $114 = $16; //@line 3074
   } else {
    $74 = HEAP32[$16 + 28 >> 2] | 0; //@line 3077
    $75 = 3760 + ($74 << 2) | 0; //@line 3078
    do {
     if ((HEAP32[$75 >> 2] | 0) == ($16 | 0)) {
      HEAP32[$75 >> 2] = $$3; //@line 3083
      if (!$$3) {
       HEAP32[865] = HEAP32[865] & ~(1 << $74); //@line 3090
       $$1 = $16; //@line 3091
       $$1382 = $17; //@line 3091
       $114 = $16; //@line 3091
       break L10;
      }
     } else {
      if ((HEAP32[868] | 0) >>> 0 > $46 >>> 0) {
       _abort(); //@line 3098
      } else {
       HEAP32[$46 + 16 + (((HEAP32[$46 + 16 >> 2] | 0) != ($16 | 0) & 1) << 2) >> 2] = $$3; //@line 3106
       if (!$$3) {
        $$1 = $16; //@line 3109
        $$1382 = $17; //@line 3109
        $114 = $16; //@line 3109
        break L10;
       } else {
        break;
       }
      }
     }
    } while (0);
    $89 = HEAP32[868] | 0; //@line 3117
    if ($89 >>> 0 > $$3 >>> 0) {
     _abort(); //@line 3120
    }
    HEAP32[$$3 + 24 >> 2] = $46; //@line 3124
    $92 = $16 + 16 | 0; //@line 3125
    $93 = HEAP32[$92 >> 2] | 0; //@line 3126
    do {
     if ($93 | 0) {
      if ($89 >>> 0 > $93 >>> 0) {
       _abort(); //@line 3132
      } else {
       HEAP32[$$3 + 16 >> 2] = $93; //@line 3136
       HEAP32[$93 + 24 >> 2] = $$3; //@line 3138
       break;
      }
     }
    } while (0);
    $99 = HEAP32[$92 + 4 >> 2] | 0; //@line 3144
    if (!$99) {
     $$1 = $16; //@line 3147
     $$1382 = $17; //@line 3147
     $114 = $16; //@line 3147
    } else {
     if ((HEAP32[868] | 0) >>> 0 > $99 >>> 0) {
      _abort(); //@line 3152
     } else {
      HEAP32[$$3 + 20 >> 2] = $99; //@line 3156
      HEAP32[$99 + 24 >> 2] = $$3; //@line 3158
      $$1 = $16; //@line 3159
      $$1382 = $17; //@line 3159
      $114 = $16; //@line 3159
      break;
     }
    }
   }
  } else {
   $$1 = $2; //@line 3165
   $$1382 = $9; //@line 3165
   $114 = $2; //@line 3165
  }
 } while (0);
 if ($114 >>> 0 >= $10 >>> 0) {
  _abort(); //@line 3170
 }
 $115 = $10 + 4 | 0; //@line 3173
 $116 = HEAP32[$115 >> 2] | 0; //@line 3174
 if (!($116 & 1)) {
  _abort(); //@line 3178
 }
 if (!($116 & 2)) {
  if ((HEAP32[870] | 0) == ($10 | 0)) {
   $124 = (HEAP32[867] | 0) + $$1382 | 0; //@line 3188
   HEAP32[867] = $124; //@line 3189
   HEAP32[870] = $$1; //@line 3190
   HEAP32[$$1 + 4 >> 2] = $124 | 1; //@line 3193
   if (($$1 | 0) != (HEAP32[869] | 0)) {
    return;
   }
   HEAP32[869] = 0; //@line 3199
   HEAP32[866] = 0; //@line 3200
   return;
  }
  if ((HEAP32[869] | 0) == ($10 | 0)) {
   $132 = (HEAP32[866] | 0) + $$1382 | 0; //@line 3207
   HEAP32[866] = $132; //@line 3208
   HEAP32[869] = $114; //@line 3209
   HEAP32[$$1 + 4 >> 2] = $132 | 1; //@line 3212
   HEAP32[$114 + $132 >> 2] = $132; //@line 3214
   return;
  }
  $137 = ($116 & -8) + $$1382 | 0; //@line 3218
  $138 = $116 >>> 3; //@line 3219
  L108 : do {
   if ($116 >>> 0 < 256) {
    $141 = HEAP32[$10 + 8 >> 2] | 0; //@line 3224
    $143 = HEAP32[$10 + 12 >> 2] | 0; //@line 3226
    $145 = 3496 + ($138 << 1 << 2) | 0; //@line 3228
    if (($141 | 0) != ($145 | 0)) {
     if ((HEAP32[868] | 0) >>> 0 > $141 >>> 0) {
      _abort(); //@line 3234
     }
     if ((HEAP32[$141 + 12 >> 2] | 0) != ($10 | 0)) {
      _abort(); //@line 3241
     }
    }
    if (($143 | 0) == ($141 | 0)) {
     HEAP32[864] = HEAP32[864] & ~(1 << $138); //@line 3251
     break;
    }
    if (($143 | 0) == ($145 | 0)) {
     $$pre$phi442Z2D = $143 + 8 | 0; //@line 3257
    } else {
     if ((HEAP32[868] | 0) >>> 0 > $143 >>> 0) {
      _abort(); //@line 3262
     }
     $160 = $143 + 8 | 0; //@line 3265
     if ((HEAP32[$160 >> 2] | 0) == ($10 | 0)) {
      $$pre$phi442Z2D = $160; //@line 3269
     } else {
      _abort(); //@line 3271
     }
    }
    HEAP32[$141 + 12 >> 2] = $143; //@line 3276
    HEAP32[$$pre$phi442Z2D >> 2] = $141; //@line 3277
   } else {
    $165 = HEAP32[$10 + 24 >> 2] | 0; //@line 3280
    $167 = HEAP32[$10 + 12 >> 2] | 0; //@line 3282
    do {
     if (($167 | 0) == ($10 | 0)) {
      $179 = $10 + 16 | 0; //@line 3286
      $180 = $179 + 4 | 0; //@line 3287
      $181 = HEAP32[$180 >> 2] | 0; //@line 3288
      if (!$181) {
       $183 = HEAP32[$179 >> 2] | 0; //@line 3291
       if (!$183) {
        $$3400 = 0; //@line 3294
        break;
       } else {
        $$1398 = $183; //@line 3297
        $$1402 = $179; //@line 3297
       }
      } else {
       $$1398 = $181; //@line 3300
       $$1402 = $180; //@line 3300
      }
      while (1) {
       $185 = $$1398 + 20 | 0; //@line 3303
       $186 = HEAP32[$185 >> 2] | 0; //@line 3304
       if ($186 | 0) {
        $$1398 = $186; //@line 3307
        $$1402 = $185; //@line 3307
        continue;
       }
       $188 = $$1398 + 16 | 0; //@line 3310
       $189 = HEAP32[$188 >> 2] | 0; //@line 3311
       if (!$189) {
        break;
       } else {
        $$1398 = $189; //@line 3316
        $$1402 = $188; //@line 3316
       }
      }
      if ((HEAP32[868] | 0) >>> 0 > $$1402 >>> 0) {
       _abort(); //@line 3322
      } else {
       HEAP32[$$1402 >> 2] = 0; //@line 3325
       $$3400 = $$1398; //@line 3326
       break;
      }
     } else {
      $170 = HEAP32[$10 + 8 >> 2] | 0; //@line 3331
      if ((HEAP32[868] | 0) >>> 0 > $170 >>> 0) {
       _abort(); //@line 3335
      }
      $173 = $170 + 12 | 0; //@line 3338
      if ((HEAP32[$173 >> 2] | 0) != ($10 | 0)) {
       _abort(); //@line 3342
      }
      $176 = $167 + 8 | 0; //@line 3345
      if ((HEAP32[$176 >> 2] | 0) == ($10 | 0)) {
       HEAP32[$173 >> 2] = $167; //@line 3349
       HEAP32[$176 >> 2] = $170; //@line 3350
       $$3400 = $167; //@line 3351
       break;
      } else {
       _abort(); //@line 3354
      }
     }
    } while (0);
    if ($165 | 0) {
     $195 = HEAP32[$10 + 28 >> 2] | 0; //@line 3362
     $196 = 3760 + ($195 << 2) | 0; //@line 3363
     do {
      if ((HEAP32[$196 >> 2] | 0) == ($10 | 0)) {
       HEAP32[$196 >> 2] = $$3400; //@line 3368
       if (!$$3400) {
        HEAP32[865] = HEAP32[865] & ~(1 << $195); //@line 3375
        break L108;
       }
      } else {
       if ((HEAP32[868] | 0) >>> 0 > $165 >>> 0) {
        _abort(); //@line 3382
       } else {
        HEAP32[$165 + 16 + (((HEAP32[$165 + 16 >> 2] | 0) != ($10 | 0) & 1) << 2) >> 2] = $$3400; //@line 3390
        if (!$$3400) {
         break L108;
        } else {
         break;
        }
       }
      }
     } while (0);
     $210 = HEAP32[868] | 0; //@line 3400
     if ($210 >>> 0 > $$3400 >>> 0) {
      _abort(); //@line 3403
     }
     HEAP32[$$3400 + 24 >> 2] = $165; //@line 3407
     $213 = $10 + 16 | 0; //@line 3408
     $214 = HEAP32[$213 >> 2] | 0; //@line 3409
     do {
      if ($214 | 0) {
       if ($210 >>> 0 > $214 >>> 0) {
        _abort(); //@line 3415
       } else {
        HEAP32[$$3400 + 16 >> 2] = $214; //@line 3419
        HEAP32[$214 + 24 >> 2] = $$3400; //@line 3421
        break;
       }
      }
     } while (0);
     $220 = HEAP32[$213 + 4 >> 2] | 0; //@line 3427
     if ($220 | 0) {
      if ((HEAP32[868] | 0) >>> 0 > $220 >>> 0) {
       _abort(); //@line 3433
      } else {
       HEAP32[$$3400 + 20 >> 2] = $220; //@line 3437
       HEAP32[$220 + 24 >> 2] = $$3400; //@line 3439
       break;
      }
     }
    }
   }
  } while (0);
  HEAP32[$$1 + 4 >> 2] = $137 | 1; //@line 3448
  HEAP32[$114 + $137 >> 2] = $137; //@line 3450
  if (($$1 | 0) == (HEAP32[869] | 0)) {
   HEAP32[866] = $137; //@line 3454
   return;
  } else {
   $$2 = $137; //@line 3457
  }
 } else {
  HEAP32[$115 >> 2] = $116 & -2; //@line 3461
  HEAP32[$$1 + 4 >> 2] = $$1382 | 1; //@line 3464
  HEAP32[$114 + $$1382 >> 2] = $$1382; //@line 3466
  $$2 = $$1382; //@line 3467
 }
 $235 = $$2 >>> 3; //@line 3469
 if ($$2 >>> 0 < 256) {
  $238 = 3496 + ($235 << 1 << 2) | 0; //@line 3473
  $239 = HEAP32[864] | 0; //@line 3474
  $240 = 1 << $235; //@line 3475
  if (!($239 & $240)) {
   HEAP32[864] = $239 | $240; //@line 3480
   $$0403 = $238; //@line 3482
   $$pre$phiZ2D = $238 + 8 | 0; //@line 3482
  } else {
   $244 = $238 + 8 | 0; //@line 3484
   $245 = HEAP32[$244 >> 2] | 0; //@line 3485
   if ((HEAP32[868] | 0) >>> 0 > $245 >>> 0) {
    _abort(); //@line 3489
   } else {
    $$0403 = $245; //@line 3492
    $$pre$phiZ2D = $244; //@line 3492
   }
  }
  HEAP32[$$pre$phiZ2D >> 2] = $$1; //@line 3495
  HEAP32[$$0403 + 12 >> 2] = $$1; //@line 3497
  HEAP32[$$1 + 8 >> 2] = $$0403; //@line 3499
  HEAP32[$$1 + 12 >> 2] = $238; //@line 3501
  return;
 }
 $251 = $$2 >>> 8; //@line 3504
 if (!$251) {
  $$0396 = 0; //@line 3507
 } else {
  if ($$2 >>> 0 > 16777215) {
   $$0396 = 31; //@line 3511
  } else {
   $256 = ($251 + 1048320 | 0) >>> 16 & 8; //@line 3515
   $257 = $251 << $256; //@line 3516
   $260 = ($257 + 520192 | 0) >>> 16 & 4; //@line 3519
   $262 = $257 << $260; //@line 3521
   $265 = ($262 + 245760 | 0) >>> 16 & 2; //@line 3524
   $270 = 14 - ($260 | $256 | $265) + ($262 << $265 >>> 15) | 0; //@line 3529
   $$0396 = $$2 >>> ($270 + 7 | 0) & 1 | $270 << 1; //@line 3535
  }
 }
 $276 = 3760 + ($$0396 << 2) | 0; //@line 3538
 HEAP32[$$1 + 28 >> 2] = $$0396; //@line 3540
 HEAP32[$$1 + 20 >> 2] = 0; //@line 3543
 HEAP32[$$1 + 16 >> 2] = 0; //@line 3544
 $280 = HEAP32[865] | 0; //@line 3545
 $281 = 1 << $$0396; //@line 3546
 do {
  if (!($280 & $281)) {
   HEAP32[865] = $280 | $281; //@line 3552
   HEAP32[$276 >> 2] = $$1; //@line 3553
   HEAP32[$$1 + 24 >> 2] = $276; //@line 3555
   HEAP32[$$1 + 12 >> 2] = $$1; //@line 3557
   HEAP32[$$1 + 8 >> 2] = $$1; //@line 3559
  } else {
   $$0383 = $$2 << (($$0396 | 0) == 31 ? 0 : 25 - ($$0396 >>> 1) | 0); //@line 3567
   $$0384 = HEAP32[$276 >> 2] | 0; //@line 3567
   while (1) {
    if ((HEAP32[$$0384 + 4 >> 2] & -8 | 0) == ($$2 | 0)) {
     label = 124; //@line 3574
     break;
    }
    $299 = $$0384 + 16 + ($$0383 >>> 31 << 2) | 0; //@line 3578
    $301 = HEAP32[$299 >> 2] | 0; //@line 3580
    if (!$301) {
     label = 121; //@line 3583
     break;
    } else {
     $$0383 = $$0383 << 1; //@line 3586
     $$0384 = $301; //@line 3586
    }
   }
   if ((label | 0) == 121) {
    if ((HEAP32[868] | 0) >>> 0 > $299 >>> 0) {
     _abort(); //@line 3593
    } else {
     HEAP32[$299 >> 2] = $$1; //@line 3596
     HEAP32[$$1 + 24 >> 2] = $$0384; //@line 3598
     HEAP32[$$1 + 12 >> 2] = $$1; //@line 3600
     HEAP32[$$1 + 8 >> 2] = $$1; //@line 3602
     break;
    }
   } else if ((label | 0) == 124) {
    $308 = $$0384 + 8 | 0; //@line 3607
    $309 = HEAP32[$308 >> 2] | 0; //@line 3608
    $310 = HEAP32[868] | 0; //@line 3609
    if ($310 >>> 0 <= $309 >>> 0 & $310 >>> 0 <= $$0384 >>> 0) {
     HEAP32[$309 + 12 >> 2] = $$1; //@line 3615
     HEAP32[$308 >> 2] = $$1; //@line 3616
     HEAP32[$$1 + 8 >> 2] = $309; //@line 3618
     HEAP32[$$1 + 12 >> 2] = $$0384; //@line 3620
     HEAP32[$$1 + 24 >> 2] = 0; //@line 3622
     break;
    } else {
     _abort(); //@line 3625
    }
   }
  }
 } while (0);
 $319 = (HEAP32[872] | 0) + -1 | 0; //@line 3632
 HEAP32[872] = $319; //@line 3633
 if (!$319) {
  $$0212$in$i = 3912; //@line 3636
 } else {
  return;
 }
 while (1) {
  $$0212$i = HEAP32[$$0212$in$i >> 2] | 0; //@line 3641
  if (!$$0212$i) {
   break;
  } else {
   $$0212$in$i = $$0212$i + 8 | 0; //@line 3647
  }
 }
 HEAP32[872] = -1; //@line 3650
 return;
}
function ___udivmoddi4($a$0, $a$1, $b$0, $b$1, $rem) {
 $a$0 = $a$0 | 0;
 $a$1 = $a$1 | 0;
 $b$0 = $b$0 | 0;
 $b$1 = $b$1 | 0;
 $rem = $rem | 0;
 var $n_sroa_0_0_extract_trunc = 0, $n_sroa_1_4_extract_shift$0 = 0, $n_sroa_1_4_extract_trunc = 0, $d_sroa_0_0_extract_trunc = 0, $d_sroa_1_4_extract_shift$0 = 0, $d_sroa_1_4_extract_trunc = 0, $4 = 0, $17 = 0, $37 = 0, $51 = 0, $57 = 0, $58 = 0, $66 = 0, $78 = 0, $88 = 0, $89 = 0, $91 = 0, $92 = 0, $95 = 0, $105 = 0, $119 = 0, $125 = 0, $126 = 0, $130 = 0, $q_sroa_1_1_ph = 0, $q_sroa_0_1_ph = 0, $r_sroa_1_1_ph = 0, $r_sroa_0_1_ph = 0, $sr_1_ph = 0, $d_sroa_0_0_insert_insert99$0 = 0, $d_sroa_0_0_insert_insert99$1 = 0, $137$0 = 0, $137$1 = 0, $carry_0203 = 0, $sr_1202 = 0, $r_sroa_0_1201 = 0, $r_sroa_1_1200 = 0, $q_sroa_0_1199 = 0, $q_sroa_1_1198 = 0, $r_sroa_0_0_insert_insert42$0 = 0, $r_sroa_0_0_insert_insert42$1 = 0, $150$1 = 0, $151$0 = 0, $carry_0_lcssa$0 = 0, $carry_0_lcssa$1 = 0, $r_sroa_0_1_lcssa = 0, $r_sroa_1_1_lcssa = 0, $q_sroa_0_1_lcssa = 0, $q_sroa_1_1_lcssa = 0, $q_sroa_0_0_insert_ext75$0 = 0, $q_sroa_0_0_insert_ext75$1 = 0, $_0$0 = 0, $_0$1 = 0, $q_sroa_1_1198$looptemp = 0;
 $n_sroa_0_0_extract_trunc = $a$0; //@line 8737
 $n_sroa_1_4_extract_shift$0 = $a$1; //@line 8738
 $n_sroa_1_4_extract_trunc = $n_sroa_1_4_extract_shift$0; //@line 8739
 $d_sroa_0_0_extract_trunc = $b$0; //@line 8740
 $d_sroa_1_4_extract_shift$0 = $b$1; //@line 8741
 $d_sroa_1_4_extract_trunc = $d_sroa_1_4_extract_shift$0; //@line 8742
 if (!$n_sroa_1_4_extract_trunc) {
  $4 = ($rem | 0) != 0; //@line 8744
  if (!$d_sroa_1_4_extract_trunc) {
   if ($4) {
    HEAP32[$rem >> 2] = ($n_sroa_0_0_extract_trunc >>> 0) % ($d_sroa_0_0_extract_trunc >>> 0); //@line 8747
    HEAP32[$rem + 4 >> 2] = 0; //@line 8748
   }
   $_0$1 = 0; //@line 8750
   $_0$0 = ($n_sroa_0_0_extract_trunc >>> 0) / ($d_sroa_0_0_extract_trunc >>> 0) >>> 0; //@line 8751
   return (tempRet0 = $_0$1, $_0$0) | 0; //@line 8752
  } else {
   if (!$4) {
    $_0$1 = 0; //@line 8755
    $_0$0 = 0; //@line 8756
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 8757
   }
   HEAP32[$rem >> 2] = $a$0 | 0; //@line 8759
   HEAP32[$rem + 4 >> 2] = $a$1 & 0; //@line 8760
   $_0$1 = 0; //@line 8761
   $_0$0 = 0; //@line 8762
   return (tempRet0 = $_0$1, $_0$0) | 0; //@line 8763
  }
 }
 $17 = ($d_sroa_1_4_extract_trunc | 0) == 0; //@line 8766
 do {
  if (!$d_sroa_0_0_extract_trunc) {
   if ($17) {
    if ($rem | 0) {
     HEAP32[$rem >> 2] = ($n_sroa_1_4_extract_trunc >>> 0) % ($d_sroa_0_0_extract_trunc >>> 0); //@line 8771
     HEAP32[$rem + 4 >> 2] = 0; //@line 8772
    }
    $_0$1 = 0; //@line 8774
    $_0$0 = ($n_sroa_1_4_extract_trunc >>> 0) / ($d_sroa_0_0_extract_trunc >>> 0) >>> 0; //@line 8775
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 8776
   }
   if (!$n_sroa_0_0_extract_trunc) {
    if ($rem | 0) {
     HEAP32[$rem >> 2] = 0; //@line 8780
     HEAP32[$rem + 4 >> 2] = ($n_sroa_1_4_extract_trunc >>> 0) % ($d_sroa_1_4_extract_trunc >>> 0); //@line 8781
    }
    $_0$1 = 0; //@line 8783
    $_0$0 = ($n_sroa_1_4_extract_trunc >>> 0) / ($d_sroa_1_4_extract_trunc >>> 0) >>> 0; //@line 8784
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 8785
   }
   $37 = $d_sroa_1_4_extract_trunc - 1 | 0; //@line 8787
   if (!($37 & $d_sroa_1_4_extract_trunc)) {
    if ($rem | 0) {
     HEAP32[$rem >> 2] = $a$0 | 0; //@line 8790
     HEAP32[$rem + 4 >> 2] = $37 & $n_sroa_1_4_extract_trunc | $a$1 & 0; //@line 8791
    }
    $_0$1 = 0; //@line 8793
    $_0$0 = $n_sroa_1_4_extract_trunc >>> ((_llvm_cttz_i32($d_sroa_1_4_extract_trunc | 0) | 0) >>> 0); //@line 8794
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 8795
   }
   $51 = (Math_clz32($d_sroa_1_4_extract_trunc | 0) | 0) - (Math_clz32($n_sroa_1_4_extract_trunc | 0) | 0) | 0; //@line 8798
   if ($51 >>> 0 <= 30) {
    $57 = $51 + 1 | 0; //@line 8800
    $58 = 31 - $51 | 0; //@line 8801
    $sr_1_ph = $57; //@line 8802
    $r_sroa_0_1_ph = $n_sroa_1_4_extract_trunc << $58 | $n_sroa_0_0_extract_trunc >>> ($57 >>> 0); //@line 8803
    $r_sroa_1_1_ph = $n_sroa_1_4_extract_trunc >>> ($57 >>> 0); //@line 8804
    $q_sroa_0_1_ph = 0; //@line 8805
    $q_sroa_1_1_ph = $n_sroa_0_0_extract_trunc << $58; //@line 8806
    break;
   }
   if (!$rem) {
    $_0$1 = 0; //@line 8810
    $_0$0 = 0; //@line 8811
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 8812
   }
   HEAP32[$rem >> 2] = $a$0 | 0; //@line 8814
   HEAP32[$rem + 4 >> 2] = $n_sroa_1_4_extract_shift$0 | $a$1 & 0; //@line 8815
   $_0$1 = 0; //@line 8816
   $_0$0 = 0; //@line 8817
   return (tempRet0 = $_0$1, $_0$0) | 0; //@line 8818
  } else {
   if (!$17) {
    $119 = (Math_clz32($d_sroa_1_4_extract_trunc | 0) | 0) - (Math_clz32($n_sroa_1_4_extract_trunc | 0) | 0) | 0; //@line 8822
    if ($119 >>> 0 <= 31) {
     $125 = $119 + 1 | 0; //@line 8824
     $126 = 31 - $119 | 0; //@line 8825
     $130 = $119 - 31 >> 31; //@line 8826
     $sr_1_ph = $125; //@line 8827
     $r_sroa_0_1_ph = $n_sroa_0_0_extract_trunc >>> ($125 >>> 0) & $130 | $n_sroa_1_4_extract_trunc << $126; //@line 8828
     $r_sroa_1_1_ph = $n_sroa_1_4_extract_trunc >>> ($125 >>> 0) & $130; //@line 8829
     $q_sroa_0_1_ph = 0; //@line 8830
     $q_sroa_1_1_ph = $n_sroa_0_0_extract_trunc << $126; //@line 8831
     break;
    }
    if (!$rem) {
     $_0$1 = 0; //@line 8835
     $_0$0 = 0; //@line 8836
     return (tempRet0 = $_0$1, $_0$0) | 0; //@line 8837
    }
    HEAP32[$rem >> 2] = $a$0 | 0; //@line 8839
    HEAP32[$rem + 4 >> 2] = $n_sroa_1_4_extract_shift$0 | $a$1 & 0; //@line 8840
    $_0$1 = 0; //@line 8841
    $_0$0 = 0; //@line 8842
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 8843
   }
   $66 = $d_sroa_0_0_extract_trunc - 1 | 0; //@line 8845
   if ($66 & $d_sroa_0_0_extract_trunc | 0) {
    $88 = (Math_clz32($d_sroa_0_0_extract_trunc | 0) | 0) + 33 - (Math_clz32($n_sroa_1_4_extract_trunc | 0) | 0) | 0; //@line 8848
    $89 = 64 - $88 | 0; //@line 8849
    $91 = 32 - $88 | 0; //@line 8850
    $92 = $91 >> 31; //@line 8851
    $95 = $88 - 32 | 0; //@line 8852
    $105 = $95 >> 31; //@line 8853
    $sr_1_ph = $88; //@line 8854
    $r_sroa_0_1_ph = $91 - 1 >> 31 & $n_sroa_1_4_extract_trunc >>> ($95 >>> 0) | ($n_sroa_1_4_extract_trunc << $91 | $n_sroa_0_0_extract_trunc >>> ($88 >>> 0)) & $105; //@line 8855
    $r_sroa_1_1_ph = $105 & $n_sroa_1_4_extract_trunc >>> ($88 >>> 0); //@line 8856
    $q_sroa_0_1_ph = $n_sroa_0_0_extract_trunc << $89 & $92; //@line 8857
    $q_sroa_1_1_ph = ($n_sroa_1_4_extract_trunc << $89 | $n_sroa_0_0_extract_trunc >>> ($95 >>> 0)) & $92 | $n_sroa_0_0_extract_trunc << $91 & $88 - 33 >> 31; //@line 8858
    break;
   }
   if ($rem | 0) {
    HEAP32[$rem >> 2] = $66 & $n_sroa_0_0_extract_trunc; //@line 8862
    HEAP32[$rem + 4 >> 2] = 0; //@line 8863
   }
   if (($d_sroa_0_0_extract_trunc | 0) == 1) {
    $_0$1 = $n_sroa_1_4_extract_shift$0 | $a$1 & 0; //@line 8866
    $_0$0 = $a$0 | 0 | 0; //@line 8867
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 8868
   } else {
    $78 = _llvm_cttz_i32($d_sroa_0_0_extract_trunc | 0) | 0; //@line 8870
    $_0$1 = $n_sroa_1_4_extract_trunc >>> ($78 >>> 0) | 0; //@line 8871
    $_0$0 = $n_sroa_1_4_extract_trunc << 32 - $78 | $n_sroa_0_0_extract_trunc >>> ($78 >>> 0) | 0; //@line 8872
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 8873
   }
  }
 } while (0);
 if (!$sr_1_ph) {
  $q_sroa_1_1_lcssa = $q_sroa_1_1_ph; //@line 8878
  $q_sroa_0_1_lcssa = $q_sroa_0_1_ph; //@line 8879
  $r_sroa_1_1_lcssa = $r_sroa_1_1_ph; //@line 8880
  $r_sroa_0_1_lcssa = $r_sroa_0_1_ph; //@line 8881
  $carry_0_lcssa$1 = 0; //@line 8882
  $carry_0_lcssa$0 = 0; //@line 8883
 } else {
  $d_sroa_0_0_insert_insert99$0 = $b$0 | 0 | 0; //@line 8885
  $d_sroa_0_0_insert_insert99$1 = $d_sroa_1_4_extract_shift$0 | $b$1 & 0; //@line 8886
  $137$0 = _i64Add($d_sroa_0_0_insert_insert99$0 | 0, $d_sroa_0_0_insert_insert99$1 | 0, -1, -1) | 0; //@line 8887
  $137$1 = tempRet0; //@line 8888
  $q_sroa_1_1198 = $q_sroa_1_1_ph; //@line 8889
  $q_sroa_0_1199 = $q_sroa_0_1_ph; //@line 8890
  $r_sroa_1_1200 = $r_sroa_1_1_ph; //@line 8891
  $r_sroa_0_1201 = $r_sroa_0_1_ph; //@line 8892
  $sr_1202 = $sr_1_ph; //@line 8893
  $carry_0203 = 0; //@line 8894
  do {
   $q_sroa_1_1198$looptemp = $q_sroa_1_1198;
   $q_sroa_1_1198 = $q_sroa_0_1199 >>> 31 | $q_sroa_1_1198 << 1; //@line 8896
   $q_sroa_0_1199 = $carry_0203 | $q_sroa_0_1199 << 1; //@line 8897
   $r_sroa_0_0_insert_insert42$0 = $r_sroa_0_1201 << 1 | $q_sroa_1_1198$looptemp >>> 31 | 0; //@line 8898
   $r_sroa_0_0_insert_insert42$1 = $r_sroa_0_1201 >>> 31 | $r_sroa_1_1200 << 1 | 0; //@line 8899
   _i64Subtract($137$0 | 0, $137$1 | 0, $r_sroa_0_0_insert_insert42$0 | 0, $r_sroa_0_0_insert_insert42$1 | 0) | 0; //@line 8900
   $150$1 = tempRet0; //@line 8901
   $151$0 = $150$1 >> 31 | (($150$1 | 0) < 0 ? -1 : 0) << 1; //@line 8902
   $carry_0203 = $151$0 & 1; //@line 8903
   $r_sroa_0_1201 = _i64Subtract($r_sroa_0_0_insert_insert42$0 | 0, $r_sroa_0_0_insert_insert42$1 | 0, $151$0 & $d_sroa_0_0_insert_insert99$0 | 0, ((($150$1 | 0) < 0 ? -1 : 0) >> 31 | (($150$1 | 0) < 0 ? -1 : 0) << 1) & $d_sroa_0_0_insert_insert99$1 | 0) | 0; //@line 8905
   $r_sroa_1_1200 = tempRet0; //@line 8906
   $sr_1202 = $sr_1202 - 1 | 0; //@line 8907
  } while (($sr_1202 | 0) != 0);
  $q_sroa_1_1_lcssa = $q_sroa_1_1198; //@line 8919
  $q_sroa_0_1_lcssa = $q_sroa_0_1199; //@line 8920
  $r_sroa_1_1_lcssa = $r_sroa_1_1200; //@line 8921
  $r_sroa_0_1_lcssa = $r_sroa_0_1201; //@line 8922
  $carry_0_lcssa$1 = 0; //@line 8923
  $carry_0_lcssa$0 = $carry_0203; //@line 8924
 }
 $q_sroa_0_0_insert_ext75$0 = $q_sroa_0_1_lcssa; //@line 8926
 $q_sroa_0_0_insert_ext75$1 = 0; //@line 8927
 if ($rem | 0) {
  HEAP32[$rem >> 2] = $r_sroa_0_1_lcssa; //@line 8930
  HEAP32[$rem + 4 >> 2] = $r_sroa_1_1_lcssa; //@line 8931
 }
 $_0$1 = ($q_sroa_0_0_insert_ext75$0 | 0) >>> 31 | ($q_sroa_1_1_lcssa | $q_sroa_0_0_insert_ext75$1) << 1 | ($q_sroa_0_0_insert_ext75$1 << 1 | $q_sroa_0_0_insert_ext75$0 >>> 31) & 0 | $carry_0_lcssa$1; //@line 8933
 $_0$0 = ($q_sroa_0_0_insert_ext75$0 << 1 | 0 >>> 31) & -2 | $carry_0_lcssa$0; //@line 8934
 return (tempRet0 = $_0$1, $_0$0) | 0; //@line 8935
}
function _mbed_die() {
 var $0 = 0, $AsyncCtx = 0, $AsyncCtx11 = 0, $AsyncCtx15 = 0, $AsyncCtx19 = 0, $AsyncCtx23 = 0, $AsyncCtx27 = 0, $AsyncCtx3 = 0, $AsyncCtx31 = 0, $AsyncCtx35 = 0, $AsyncCtx39 = 0, $AsyncCtx43 = 0, $AsyncCtx47 = 0, $AsyncCtx51 = 0, $AsyncCtx55 = 0, $AsyncCtx59 = 0, $AsyncCtx7 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 76
 STACKTOP = STACKTOP + 32 | 0; //@line 77
 $0 = sp; //@line 78
 _gpio_init_out($0, 50); //@line 79
 while (1) {
  _emscripten_asm_const_iii(0, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 82
  $AsyncCtx59 = _emscripten_alloc_async_context(8, sp) | 0; //@line 83
  _wait_ms(150); //@line 84
  if (___async) {
   label = 3; //@line 87
   break;
  }
  _emscripten_free_async_context($AsyncCtx59 | 0); //@line 90
  _emscripten_asm_const_iii(0, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 92
  $AsyncCtx55 = _emscripten_alloc_async_context(8, sp) | 0; //@line 93
  _wait_ms(150); //@line 94
  if (___async) {
   label = 5; //@line 97
   break;
  }
  _emscripten_free_async_context($AsyncCtx55 | 0); //@line 100
  _emscripten_asm_const_iii(0, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 102
  $AsyncCtx51 = _emscripten_alloc_async_context(8, sp) | 0; //@line 103
  _wait_ms(150); //@line 104
  if (___async) {
   label = 7; //@line 107
   break;
  }
  _emscripten_free_async_context($AsyncCtx51 | 0); //@line 110
  _emscripten_asm_const_iii(0, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 112
  $AsyncCtx47 = _emscripten_alloc_async_context(8, sp) | 0; //@line 113
  _wait_ms(150); //@line 114
  if (___async) {
   label = 9; //@line 117
   break;
  }
  _emscripten_free_async_context($AsyncCtx47 | 0); //@line 120
  _emscripten_asm_const_iii(0, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 122
  $AsyncCtx43 = _emscripten_alloc_async_context(8, sp) | 0; //@line 123
  _wait_ms(150); //@line 124
  if (___async) {
   label = 11; //@line 127
   break;
  }
  _emscripten_free_async_context($AsyncCtx43 | 0); //@line 130
  _emscripten_asm_const_iii(0, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 132
  $AsyncCtx39 = _emscripten_alloc_async_context(8, sp) | 0; //@line 133
  _wait_ms(150); //@line 134
  if (___async) {
   label = 13; //@line 137
   break;
  }
  _emscripten_free_async_context($AsyncCtx39 | 0); //@line 140
  _emscripten_asm_const_iii(0, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 142
  $AsyncCtx35 = _emscripten_alloc_async_context(8, sp) | 0; //@line 143
  _wait_ms(150); //@line 144
  if (___async) {
   label = 15; //@line 147
   break;
  }
  _emscripten_free_async_context($AsyncCtx35 | 0); //@line 150
  _emscripten_asm_const_iii(0, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 152
  $AsyncCtx31 = _emscripten_alloc_async_context(8, sp) | 0; //@line 153
  _wait_ms(150); //@line 154
  if (___async) {
   label = 17; //@line 157
   break;
  }
  _emscripten_free_async_context($AsyncCtx31 | 0); //@line 160
  _emscripten_asm_const_iii(0, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 162
  $AsyncCtx27 = _emscripten_alloc_async_context(8, sp) | 0; //@line 163
  _wait_ms(400); //@line 164
  if (___async) {
   label = 19; //@line 167
   break;
  }
  _emscripten_free_async_context($AsyncCtx27 | 0); //@line 170
  _emscripten_asm_const_iii(0, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 172
  $AsyncCtx23 = _emscripten_alloc_async_context(8, sp) | 0; //@line 173
  _wait_ms(400); //@line 174
  if (___async) {
   label = 21; //@line 177
   break;
  }
  _emscripten_free_async_context($AsyncCtx23 | 0); //@line 180
  _emscripten_asm_const_iii(0, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 182
  $AsyncCtx19 = _emscripten_alloc_async_context(8, sp) | 0; //@line 183
  _wait_ms(400); //@line 184
  if (___async) {
   label = 23; //@line 187
   break;
  }
  _emscripten_free_async_context($AsyncCtx19 | 0); //@line 190
  _emscripten_asm_const_iii(0, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 192
  $AsyncCtx15 = _emscripten_alloc_async_context(8, sp) | 0; //@line 193
  _wait_ms(400); //@line 194
  if (___async) {
   label = 25; //@line 197
   break;
  }
  _emscripten_free_async_context($AsyncCtx15 | 0); //@line 200
  _emscripten_asm_const_iii(0, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 202
  $AsyncCtx11 = _emscripten_alloc_async_context(8, sp) | 0; //@line 203
  _wait_ms(400); //@line 204
  if (___async) {
   label = 27; //@line 207
   break;
  }
  _emscripten_free_async_context($AsyncCtx11 | 0); //@line 210
  _emscripten_asm_const_iii(0, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 212
  $AsyncCtx7 = _emscripten_alloc_async_context(8, sp) | 0; //@line 213
  _wait_ms(400); //@line 214
  if (___async) {
   label = 29; //@line 217
   break;
  }
  _emscripten_free_async_context($AsyncCtx7 | 0); //@line 220
  _emscripten_asm_const_iii(0, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 222
  $AsyncCtx3 = _emscripten_alloc_async_context(8, sp) | 0; //@line 223
  _wait_ms(400); //@line 224
  if (___async) {
   label = 31; //@line 227
   break;
  }
  _emscripten_free_async_context($AsyncCtx3 | 0); //@line 230
  _emscripten_asm_const_iii(0, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 232
  $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 233
  _wait_ms(400); //@line 234
  if (___async) {
   label = 33; //@line 237
   break;
  }
  _emscripten_free_async_context($AsyncCtx | 0); //@line 240
 }
 switch (label | 0) {
 case 3:
  {
   HEAP32[$AsyncCtx59 >> 2] = 7; //@line 244
   HEAP32[$AsyncCtx59 + 4 >> 2] = $0; //@line 246
   sp = STACKTOP; //@line 247
   STACKTOP = sp; //@line 248
   return;
  }
 case 5:
  {
   HEAP32[$AsyncCtx55 >> 2] = 8; //@line 252
   HEAP32[$AsyncCtx55 + 4 >> 2] = $0; //@line 254
   sp = STACKTOP; //@line 255
   STACKTOP = sp; //@line 256
   return;
  }
 case 7:
  {
   HEAP32[$AsyncCtx51 >> 2] = 9; //@line 260
   HEAP32[$AsyncCtx51 + 4 >> 2] = $0; //@line 262
   sp = STACKTOP; //@line 263
   STACKTOP = sp; //@line 264
   return;
  }
 case 9:
  {
   HEAP32[$AsyncCtx47 >> 2] = 10; //@line 268
   HEAP32[$AsyncCtx47 + 4 >> 2] = $0; //@line 270
   sp = STACKTOP; //@line 271
   STACKTOP = sp; //@line 272
   return;
  }
 case 11:
  {
   HEAP32[$AsyncCtx43 >> 2] = 11; //@line 276
   HEAP32[$AsyncCtx43 + 4 >> 2] = $0; //@line 278
   sp = STACKTOP; //@line 279
   STACKTOP = sp; //@line 280
   return;
  }
 case 13:
  {
   HEAP32[$AsyncCtx39 >> 2] = 12; //@line 284
   HEAP32[$AsyncCtx39 + 4 >> 2] = $0; //@line 286
   sp = STACKTOP; //@line 287
   STACKTOP = sp; //@line 288
   return;
  }
 case 15:
  {
   HEAP32[$AsyncCtx35 >> 2] = 13; //@line 292
   HEAP32[$AsyncCtx35 + 4 >> 2] = $0; //@line 294
   sp = STACKTOP; //@line 295
   STACKTOP = sp; //@line 296
   return;
  }
 case 17:
  {
   HEAP32[$AsyncCtx31 >> 2] = 14; //@line 300
   HEAP32[$AsyncCtx31 + 4 >> 2] = $0; //@line 302
   sp = STACKTOP; //@line 303
   STACKTOP = sp; //@line 304
   return;
  }
 case 19:
  {
   HEAP32[$AsyncCtx27 >> 2] = 15; //@line 308
   HEAP32[$AsyncCtx27 + 4 >> 2] = $0; //@line 310
   sp = STACKTOP; //@line 311
   STACKTOP = sp; //@line 312
   return;
  }
 case 21:
  {
   HEAP32[$AsyncCtx23 >> 2] = 16; //@line 316
   HEAP32[$AsyncCtx23 + 4 >> 2] = $0; //@line 318
   sp = STACKTOP; //@line 319
   STACKTOP = sp; //@line 320
   return;
  }
 case 23:
  {
   HEAP32[$AsyncCtx19 >> 2] = 17; //@line 324
   HEAP32[$AsyncCtx19 + 4 >> 2] = $0; //@line 326
   sp = STACKTOP; //@line 327
   STACKTOP = sp; //@line 328
   return;
  }
 case 25:
  {
   HEAP32[$AsyncCtx15 >> 2] = 18; //@line 332
   HEAP32[$AsyncCtx15 + 4 >> 2] = $0; //@line 334
   sp = STACKTOP; //@line 335
   STACKTOP = sp; //@line 336
   return;
  }
 case 27:
  {
   HEAP32[$AsyncCtx11 >> 2] = 19; //@line 340
   HEAP32[$AsyncCtx11 + 4 >> 2] = $0; //@line 342
   sp = STACKTOP; //@line 343
   STACKTOP = sp; //@line 344
   return;
  }
 case 29:
  {
   HEAP32[$AsyncCtx7 >> 2] = 20; //@line 348
   HEAP32[$AsyncCtx7 + 4 >> 2] = $0; //@line 350
   sp = STACKTOP; //@line 351
   STACKTOP = sp; //@line 352
   return;
  }
 case 31:
  {
   HEAP32[$AsyncCtx3 >> 2] = 21; //@line 356
   HEAP32[$AsyncCtx3 + 4 >> 2] = $0; //@line 358
   sp = STACKTOP; //@line 359
   STACKTOP = sp; //@line 360
   return;
  }
 case 33:
  {
   HEAP32[$AsyncCtx >> 2] = 22; //@line 364
   HEAP32[$AsyncCtx + 4 >> 2] = $0; //@line 366
   sp = STACKTOP; //@line 367
   STACKTOP = sp; //@line 368
   return;
  }
 }
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
      $9 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 5446
      $10 = HEAP32[$9 >> 2] | 0; //@line 5447
      HEAP32[$2 >> 2] = $9 + 4; //@line 5449
      HEAP32[$0 >> 2] = $10; //@line 5450
      break L1;
      break;
     }
    case 10:
     {
      $16 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 5466
      $17 = HEAP32[$16 >> 2] | 0; //@line 5467
      HEAP32[$2 >> 2] = $16 + 4; //@line 5469
      $20 = $0; //@line 5472
      HEAP32[$20 >> 2] = $17; //@line 5474
      HEAP32[$20 + 4 >> 2] = (($17 | 0) < 0) << 31 >> 31; //@line 5477
      break L1;
      break;
     }
    case 11:
     {
      $29 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 5493
      $30 = HEAP32[$29 >> 2] | 0; //@line 5494
      HEAP32[$2 >> 2] = $29 + 4; //@line 5496
      $31 = $0; //@line 5497
      HEAP32[$31 >> 2] = $30; //@line 5499
      HEAP32[$31 + 4 >> 2] = 0; //@line 5502
      break L1;
      break;
     }
    case 12:
     {
      $40 = (HEAP32[$2 >> 2] | 0) + (8 - 1) & ~(8 - 1); //@line 5518
      $41 = $40; //@line 5519
      $43 = HEAP32[$41 >> 2] | 0; //@line 5521
      $46 = HEAP32[$41 + 4 >> 2] | 0; //@line 5524
      HEAP32[$2 >> 2] = $40 + 8; //@line 5526
      $47 = $0; //@line 5527
      HEAP32[$47 >> 2] = $43; //@line 5529
      HEAP32[$47 + 4 >> 2] = $46; //@line 5532
      break L1;
      break;
     }
    case 13:
     {
      $56 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 5548
      $57 = HEAP32[$56 >> 2] | 0; //@line 5549
      HEAP32[$2 >> 2] = $56 + 4; //@line 5551
      $59 = ($57 & 65535) << 16 >> 16; //@line 5553
      $62 = $0; //@line 5556
      HEAP32[$62 >> 2] = $59; //@line 5558
      HEAP32[$62 + 4 >> 2] = (($59 | 0) < 0) << 31 >> 31; //@line 5561
      break L1;
      break;
     }
    case 14:
     {
      $71 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 5577
      $72 = HEAP32[$71 >> 2] | 0; //@line 5578
      HEAP32[$2 >> 2] = $71 + 4; //@line 5580
      $73 = $0; //@line 5582
      HEAP32[$73 >> 2] = $72 & 65535; //@line 5584
      HEAP32[$73 + 4 >> 2] = 0; //@line 5587
      break L1;
      break;
     }
    case 15:
     {
      $82 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 5603
      $83 = HEAP32[$82 >> 2] | 0; //@line 5604
      HEAP32[$2 >> 2] = $82 + 4; //@line 5606
      $85 = ($83 & 255) << 24 >> 24; //@line 5608
      $88 = $0; //@line 5611
      HEAP32[$88 >> 2] = $85; //@line 5613
      HEAP32[$88 + 4 >> 2] = (($85 | 0) < 0) << 31 >> 31; //@line 5616
      break L1;
      break;
     }
    case 16:
     {
      $97 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 5632
      $98 = HEAP32[$97 >> 2] | 0; //@line 5633
      HEAP32[$2 >> 2] = $97 + 4; //@line 5635
      $99 = $0; //@line 5637
      HEAP32[$99 >> 2] = $98 & 255; //@line 5639
      HEAP32[$99 + 4 >> 2] = 0; //@line 5642
      break L1;
      break;
     }
    case 17:
     {
      $108 = (HEAP32[$2 >> 2] | 0) + (8 - 1) & ~(8 - 1); //@line 5658
      $109 = +HEAPF64[$108 >> 3]; //@line 5659
      HEAP32[$2 >> 2] = $108 + 8; //@line 5661
      HEAPF64[$0 >> 3] = $109; //@line 5662
      break L1;
      break;
     }
    case 18:
     {
      $115 = (HEAP32[$2 >> 2] | 0) + (8 - 1) & ~(8 - 1); //@line 5678
      $116 = +HEAPF64[$115 >> 3]; //@line 5679
      HEAP32[$2 >> 2] = $115 + 8; //@line 5681
      HEAPF64[$0 >> 3] = $116; //@line 5682
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
 sp = STACKTOP; //@line 4346
 STACKTOP = STACKTOP + 224 | 0; //@line 4347
 $3 = sp + 120 | 0; //@line 4348
 $4 = sp + 80 | 0; //@line 4349
 $5 = sp; //@line 4350
 $6 = sp + 136 | 0; //@line 4351
 dest = $4; //@line 4352
 stop = dest + 40 | 0; //@line 4352
 do {
  HEAP32[dest >> 2] = 0; //@line 4352
  dest = dest + 4 | 0; //@line 4352
 } while ((dest | 0) < (stop | 0));
 HEAP32[$3 >> 2] = HEAP32[$2 >> 2]; //@line 4354
 if ((_printf_core(0, $1, $3, $5, $4) | 0) < 0) {
  $$0 = -1; //@line 4358
 } else {
  if ((HEAP32[$0 + 76 >> 2] | 0) > -1) {
   $43 = ___lockfile($0) | 0; //@line 4365
  } else {
   $43 = 0; //@line 4367
  }
  $13 = HEAP32[$0 >> 2] | 0; //@line 4369
  $14 = $13 & 32; //@line 4370
  if ((HEAP8[$0 + 74 >> 0] | 0) < 1) {
   HEAP32[$0 >> 2] = $13 & -33; //@line 4376
  }
  $19 = $0 + 48 | 0; //@line 4378
  do {
   if (!(HEAP32[$19 >> 2] | 0)) {
    $23 = $0 + 44 | 0; //@line 4383
    $24 = HEAP32[$23 >> 2] | 0; //@line 4384
    HEAP32[$23 >> 2] = $6; //@line 4385
    $25 = $0 + 28 | 0; //@line 4386
    HEAP32[$25 >> 2] = $6; //@line 4387
    $26 = $0 + 20 | 0; //@line 4388
    HEAP32[$26 >> 2] = $6; //@line 4389
    HEAP32[$19 >> 2] = 80; //@line 4390
    $28 = $0 + 16 | 0; //@line 4392
    HEAP32[$28 >> 2] = $6 + 80; //@line 4393
    $29 = _printf_core($0, $1, $3, $5, $4) | 0; //@line 4394
    if (!$24) {
     $$1 = $29; //@line 4397
    } else {
     $32 = HEAP32[$0 + 36 >> 2] | 0; //@line 4400
     $AsyncCtx = _emscripten_alloc_async_context(64, sp) | 0; //@line 4401
     FUNCTION_TABLE_iiii[$32 & 7]($0, 0, 0) | 0; //@line 4402
     if (___async) {
      HEAP32[$AsyncCtx >> 2] = 27; //@line 4405
      HEAP32[$AsyncCtx + 4 >> 2] = $26; //@line 4407
      HEAP32[$AsyncCtx + 8 >> 2] = $29; //@line 4409
      HEAP32[$AsyncCtx + 12 >> 2] = $24; //@line 4411
      HEAP32[$AsyncCtx + 16 >> 2] = $23; //@line 4413
      HEAP32[$AsyncCtx + 20 >> 2] = $19; //@line 4415
      HEAP32[$AsyncCtx + 24 >> 2] = $28; //@line 4417
      HEAP32[$AsyncCtx + 28 >> 2] = $25; //@line 4419
      HEAP32[$AsyncCtx + 32 >> 2] = $0; //@line 4421
      HEAP32[$AsyncCtx + 36 >> 2] = $14; //@line 4423
      HEAP32[$AsyncCtx + 40 >> 2] = $43; //@line 4425
      HEAP32[$AsyncCtx + 44 >> 2] = $0; //@line 4427
      HEAP32[$AsyncCtx + 48 >> 2] = $6; //@line 4429
      HEAP32[$AsyncCtx + 52 >> 2] = $5; //@line 4431
      HEAP32[$AsyncCtx + 56 >> 2] = $4; //@line 4433
      HEAP32[$AsyncCtx + 60 >> 2] = $3; //@line 4435
      sp = STACKTOP; //@line 4436
      STACKTOP = sp; //@line 4437
      return 0; //@line 4437
     } else {
      _emscripten_free_async_context($AsyncCtx | 0); //@line 4439
      $$ = (HEAP32[$26 >> 2] | 0) == 0 ? -1 : $29; //@line 4442
      HEAP32[$23 >> 2] = $24; //@line 4443
      HEAP32[$19 >> 2] = 0; //@line 4444
      HEAP32[$28 >> 2] = 0; //@line 4445
      HEAP32[$25 >> 2] = 0; //@line 4446
      HEAP32[$26 >> 2] = 0; //@line 4447
      $$1 = $$; //@line 4448
      break;
     }
    }
   } else {
    $$1 = _printf_core($0, $1, $3, $5, $4) | 0; //@line 4454
   }
  } while (0);
  $51 = HEAP32[$0 >> 2] | 0; //@line 4457
  HEAP32[$0 >> 2] = $51 | $14; //@line 4462
  if ($43 | 0) {
   ___unlockfile($0); //@line 4465
  }
  $$0 = ($51 & 32 | 0) == 0 ? $$1 : -1; //@line 4467
 }
 STACKTOP = sp; //@line 4469
 return $$0 | 0; //@line 4469
}
function ___dynamic_cast($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $$0 = 0, $10 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $24 = 0, $30 = 0, $33 = 0, $4 = 0, $5 = 0, $8 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, dest = 0, sp = 0, stop = 0;
 sp = STACKTOP; //@line 7464
 STACKTOP = STACKTOP + 64 | 0; //@line 7465
 $4 = sp; //@line 7466
 $5 = HEAP32[$0 >> 2] | 0; //@line 7467
 $8 = $0 + (HEAP32[$5 + -8 >> 2] | 0) | 0; //@line 7470
 $10 = HEAP32[$5 + -4 >> 2] | 0; //@line 7472
 HEAP32[$4 >> 2] = $2; //@line 7473
 HEAP32[$4 + 4 >> 2] = $0; //@line 7475
 HEAP32[$4 + 8 >> 2] = $1; //@line 7477
 HEAP32[$4 + 12 >> 2] = $3; //@line 7479
 $14 = $4 + 16 | 0; //@line 7480
 $15 = $4 + 20 | 0; //@line 7481
 $16 = $4 + 24 | 0; //@line 7482
 $17 = $4 + 28 | 0; //@line 7483
 $18 = $4 + 32 | 0; //@line 7484
 $19 = $4 + 40 | 0; //@line 7485
 dest = $14; //@line 7486
 stop = dest + 36 | 0; //@line 7486
 do {
  HEAP32[dest >> 2] = 0; //@line 7486
  dest = dest + 4 | 0; //@line 7486
 } while ((dest | 0) < (stop | 0));
 HEAP16[$14 + 36 >> 1] = 0; //@line 7486
 HEAP8[$14 + 38 >> 0] = 0; //@line 7486
 L1 : do {
  if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($10, $2, 0) | 0) {
   HEAP32[$4 + 48 >> 2] = 1; //@line 7491
   $24 = HEAP32[(HEAP32[$10 >> 2] | 0) + 20 >> 2] | 0; //@line 7494
   $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 7495
   FUNCTION_TABLE_viiiiii[$24 & 3]($10, $4, $8, $8, 1, 0); //@line 7496
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 31; //@line 7499
    HEAP32[$AsyncCtx + 4 >> 2] = $16; //@line 7501
    HEAP32[$AsyncCtx + 8 >> 2] = $8; //@line 7503
    HEAP32[$AsyncCtx + 12 >> 2] = $4; //@line 7505
    sp = STACKTOP; //@line 7506
    STACKTOP = sp; //@line 7507
    return 0; //@line 7507
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 7509
    $$0 = (HEAP32[$16 >> 2] | 0) == 1 ? $8 : 0; //@line 7513
    break;
   }
  } else {
   $30 = $4 + 36 | 0; //@line 7517
   $33 = HEAP32[(HEAP32[$10 >> 2] | 0) + 24 >> 2] | 0; //@line 7520
   $AsyncCtx3 = _emscripten_alloc_async_context(36, sp) | 0; //@line 7521
   FUNCTION_TABLE_viiiii[$33 & 3]($10, $4, $8, 1, 0); //@line 7522
   if (___async) {
    HEAP32[$AsyncCtx3 >> 2] = 32; //@line 7525
    HEAP32[$AsyncCtx3 + 4 >> 2] = $30; //@line 7527
    HEAP32[$AsyncCtx3 + 8 >> 2] = $4; //@line 7529
    HEAP32[$AsyncCtx3 + 12 >> 2] = $19; //@line 7531
    HEAP32[$AsyncCtx3 + 16 >> 2] = $17; //@line 7533
    HEAP32[$AsyncCtx3 + 20 >> 2] = $18; //@line 7535
    HEAP32[$AsyncCtx3 + 24 >> 2] = $15; //@line 7537
    HEAP32[$AsyncCtx3 + 28 >> 2] = $16; //@line 7539
    HEAP32[$AsyncCtx3 + 32 >> 2] = $14; //@line 7541
    sp = STACKTOP; //@line 7542
    STACKTOP = sp; //@line 7543
    return 0; //@line 7543
   }
   _emscripten_free_async_context($AsyncCtx3 | 0); //@line 7545
   switch (HEAP32[$30 >> 2] | 0) {
   case 0:
    {
     $$0 = (HEAP32[$19 >> 2] | 0) == 1 & (HEAP32[$17 >> 2] | 0) == 1 & (HEAP32[$18 >> 2] | 0) == 1 ? HEAP32[$15 >> 2] | 0 : 0; //@line 7559
     break L1;
     break;
    }
   case 1:
    {
     break;
    }
   default:
    {
     $$0 = 0; //@line 7567
     break L1;
    }
   }
   if ((HEAP32[$16 >> 2] | 0) != 1) {
    if (!((HEAP32[$19 >> 2] | 0) == 0 & (HEAP32[$17 >> 2] | 0) == 1 & (HEAP32[$18 >> 2] | 0) == 1)) {
     $$0 = 0; //@line 7583
     break;
    }
   }
   $$0 = HEAP32[$14 >> 2] | 0; //@line 7588
  }
 } while (0);
 STACKTOP = sp; //@line 7591
 return $$0 | 0; //@line 7591
}
function _memchr($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$0$lcssa = 0, $$035$lcssa = 0, $$035$lcssa65 = 0, $$03555 = 0, $$036$lcssa = 0, $$036$lcssa64 = 0, $$03654 = 0, $$046 = 0, $$137$lcssa = 0, $$13745 = 0, $$140 = 0, $$2 = 0, $$23839 = 0, $$3 = 0, $$lcssa = 0, $11 = 0, $12 = 0, $16 = 0, $18 = 0, $20 = 0, $23 = 0, $29 = 0, $3 = 0, $30 = 0, $35 = 0, $7 = 0, $8 = 0, label = 0;
 $3 = $1 & 255; //@line 4218
 $7 = ($2 | 0) != 0; //@line 4222
 L1 : do {
  if ($7 & ($0 & 3 | 0) != 0) {
   $8 = $1 & 255; //@line 4226
   $$03555 = $0; //@line 4227
   $$03654 = $2; //@line 4227
   while (1) {
    if ((HEAP8[$$03555 >> 0] | 0) == $8 << 24 >> 24) {
     $$035$lcssa65 = $$03555; //@line 4232
     $$036$lcssa64 = $$03654; //@line 4232
     label = 6; //@line 4233
     break L1;
    }
    $11 = $$03555 + 1 | 0; //@line 4236
    $12 = $$03654 + -1 | 0; //@line 4237
    $16 = ($12 | 0) != 0; //@line 4241
    if ($16 & ($11 & 3 | 0) != 0) {
     $$03555 = $11; //@line 4244
     $$03654 = $12; //@line 4244
    } else {
     $$035$lcssa = $11; //@line 4246
     $$036$lcssa = $12; //@line 4246
     $$lcssa = $16; //@line 4246
     label = 5; //@line 4247
     break;
    }
   }
  } else {
   $$035$lcssa = $0; //@line 4252
   $$036$lcssa = $2; //@line 4252
   $$lcssa = $7; //@line 4252
   label = 5; //@line 4253
  }
 } while (0);
 if ((label | 0) == 5) {
  if ($$lcssa) {
   $$035$lcssa65 = $$035$lcssa; //@line 4258
   $$036$lcssa64 = $$036$lcssa; //@line 4258
   label = 6; //@line 4259
  } else {
   $$2 = $$035$lcssa; //@line 4261
   $$3 = 0; //@line 4261
  }
 }
 L8 : do {
  if ((label | 0) == 6) {
   $18 = $1 & 255; //@line 4267
   if ((HEAP8[$$035$lcssa65 >> 0] | 0) == $18 << 24 >> 24) {
    $$2 = $$035$lcssa65; //@line 4270
    $$3 = $$036$lcssa64; //@line 4270
   } else {
    $20 = Math_imul($3, 16843009) | 0; //@line 4272
    L11 : do {
     if ($$036$lcssa64 >>> 0 > 3) {
      $$046 = $$035$lcssa65; //@line 4276
      $$13745 = $$036$lcssa64; //@line 4276
      while (1) {
       $23 = HEAP32[$$046 >> 2] ^ $20; //@line 4279
       if (($23 & -2139062144 ^ -2139062144) & $23 + -16843009 | 0) {
        break;
       }
       $29 = $$046 + 4 | 0; //@line 4288
       $30 = $$13745 + -4 | 0; //@line 4289
       if ($30 >>> 0 > 3) {
        $$046 = $29; //@line 4292
        $$13745 = $30; //@line 4292
       } else {
        $$0$lcssa = $29; //@line 4294
        $$137$lcssa = $30; //@line 4294
        label = 11; //@line 4295
        break L11;
       }
      }
      $$140 = $$046; //@line 4299
      $$23839 = $$13745; //@line 4299
     } else {
      $$0$lcssa = $$035$lcssa65; //@line 4301
      $$137$lcssa = $$036$lcssa64; //@line 4301
      label = 11; //@line 4302
     }
    } while (0);
    if ((label | 0) == 11) {
     if (!$$137$lcssa) {
      $$2 = $$0$lcssa; //@line 4308
      $$3 = 0; //@line 4308
      break;
     } else {
      $$140 = $$0$lcssa; //@line 4311
      $$23839 = $$137$lcssa; //@line 4311
     }
    }
    while (1) {
     if ((HEAP8[$$140 >> 0] | 0) == $18 << 24 >> 24) {
      $$2 = $$140; //@line 4318
      $$3 = $$23839; //@line 4318
      break L8;
     }
     $35 = $$140 + 1 | 0; //@line 4321
     $$23839 = $$23839 + -1 | 0; //@line 4322
     if (!$$23839) {
      $$2 = $35; //@line 4325
      $$3 = 0; //@line 4325
      break;
     } else {
      $$140 = $35; //@line 4328
     }
    }
   }
  }
 } while (0);
 return ($$3 | 0 ? $$2 : 0) | 0; //@line 4336
}
function __ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($0, $1, $2, $3, $4) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 var $$037$off038 = 0, $$037$off039 = 0, $13 = 0, $19 = 0, $22 = 0, $23 = 0, $25 = 0, $28 = 0, $39 = 0, $50 = 0, $53 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 7646
 do {
  if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, $4) | 0) {
   __ZNK10__cxxabiv117__class_type_info29process_static_type_below_dstEPNS_19__dynamic_cast_infoEPKvi(0, $1, $2, $3); //@line 7652
  } else {
   if (!(__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 >> 2] | 0, $4) | 0)) {
    $50 = HEAP32[$0 + 8 >> 2] | 0; //@line 7658
    $53 = HEAP32[(HEAP32[$50 >> 2] | 0) + 24 >> 2] | 0; //@line 7661
    $AsyncCtx3 = _emscripten_alloc_async_context(4, sp) | 0; //@line 7662
    FUNCTION_TABLE_viiiii[$53 & 3]($50, $1, $2, $3, $4); //@line 7663
    if (___async) {
     HEAP32[$AsyncCtx3 >> 2] = 35; //@line 7666
     sp = STACKTOP; //@line 7667
     return;
    } else {
     _emscripten_free_async_context($AsyncCtx3 | 0); //@line 7670
     break;
    }
   }
   if ((HEAP32[$1 + 16 >> 2] | 0) != ($2 | 0)) {
    $13 = $1 + 20 | 0; //@line 7678
    if ((HEAP32[$13 >> 2] | 0) != ($2 | 0)) {
     HEAP32[$1 + 32 >> 2] = $3; //@line 7683
     $19 = $1 + 44 | 0; //@line 7684
     if ((HEAP32[$19 >> 2] | 0) == 4) {
      break;
     }
     $22 = $1 + 52 | 0; //@line 7690
     HEAP8[$22 >> 0] = 0; //@line 7691
     $23 = $1 + 53 | 0; //@line 7692
     HEAP8[$23 >> 0] = 0; //@line 7693
     $25 = HEAP32[$0 + 8 >> 2] | 0; //@line 7695
     $28 = HEAP32[(HEAP32[$25 >> 2] | 0) + 20 >> 2] | 0; //@line 7698
     $AsyncCtx = _emscripten_alloc_async_context(28, sp) | 0; //@line 7699
     FUNCTION_TABLE_viiiiii[$28 & 3]($25, $1, $2, $2, 1, $4); //@line 7700
     if (___async) {
      HEAP32[$AsyncCtx >> 2] = 34; //@line 7703
      HEAP32[$AsyncCtx + 4 >> 2] = $23; //@line 7705
      HEAP32[$AsyncCtx + 8 >> 2] = $2; //@line 7707
      HEAP32[$AsyncCtx + 12 >> 2] = $13; //@line 7709
      HEAP32[$AsyncCtx + 16 >> 2] = $1; //@line 7711
      HEAP32[$AsyncCtx + 20 >> 2] = $22; //@line 7713
      HEAP32[$AsyncCtx + 24 >> 2] = $19; //@line 7715
      sp = STACKTOP; //@line 7716
      return;
     }
     _emscripten_free_async_context($AsyncCtx | 0); //@line 7719
     if (!(HEAP8[$23 >> 0] | 0)) {
      $$037$off038 = 4; //@line 7723
      label = 13; //@line 7724
     } else {
      if (!(HEAP8[$22 >> 0] | 0)) {
       $$037$off038 = 3; //@line 7729
       label = 13; //@line 7730
      } else {
       $$037$off039 = 3; //@line 7732
      }
     }
     if ((label | 0) == 13) {
      HEAP32[$13 >> 2] = $2; //@line 7736
      $39 = $1 + 40 | 0; //@line 7737
      HEAP32[$39 >> 2] = (HEAP32[$39 >> 2] | 0) + 1; //@line 7740
      if ((HEAP32[$1 + 36 >> 2] | 0) == 1) {
       if ((HEAP32[$1 + 24 >> 2] | 0) == 2) {
        HEAP8[$1 + 54 >> 0] = 1; //@line 7750
        $$037$off039 = $$037$off038; //@line 7751
       } else {
        $$037$off039 = $$037$off038; //@line 7753
       }
      } else {
       $$037$off039 = $$037$off038; //@line 7756
      }
     }
     HEAP32[$19 >> 2] = $$037$off039; //@line 7759
     break;
    }
   }
   if (($3 | 0) == 1) {
    HEAP32[$1 + 32 >> 2] = 1; //@line 7766
   }
  }
 } while (0);
 return;
}
function ___stdio_write($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$0 = 0, $$04756 = 0, $$04855 = 0, $$04954 = 0, $$051 = 0, $$1 = 0, $$150 = 0, $12 = 0, $13 = 0, $17 = 0, $20 = 0, $25 = 0, $27 = 0, $3 = 0, $37 = 0, $38 = 0, $4 = 0, $44 = 0, $5 = 0, $7 = 0, $9 = 0, $vararg_buffer = 0, $vararg_buffer3 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 3675
 STACKTOP = STACKTOP + 48 | 0; //@line 3676
 $vararg_buffer3 = sp + 16 | 0; //@line 3677
 $vararg_buffer = sp; //@line 3678
 $3 = sp + 32 | 0; //@line 3679
 $4 = $0 + 28 | 0; //@line 3680
 $5 = HEAP32[$4 >> 2] | 0; //@line 3681
 HEAP32[$3 >> 2] = $5; //@line 3682
 $7 = $0 + 20 | 0; //@line 3684
 $9 = (HEAP32[$7 >> 2] | 0) - $5 | 0; //@line 3686
 HEAP32[$3 + 4 >> 2] = $9; //@line 3687
 HEAP32[$3 + 8 >> 2] = $1; //@line 3689
 HEAP32[$3 + 12 >> 2] = $2; //@line 3691
 $12 = $9 + $2 | 0; //@line 3692
 $13 = $0 + 60 | 0; //@line 3693
 HEAP32[$vararg_buffer >> 2] = HEAP32[$13 >> 2]; //@line 3696
 HEAP32[$vararg_buffer + 4 >> 2] = $3; //@line 3698
 HEAP32[$vararg_buffer + 8 >> 2] = 2; //@line 3700
 $17 = ___syscall_ret(___syscall146(146, $vararg_buffer | 0) | 0) | 0; //@line 3702
 L1 : do {
  if (($12 | 0) == ($17 | 0)) {
   label = 3; //@line 3706
  } else {
   $$04756 = 2; //@line 3708
   $$04855 = $12; //@line 3708
   $$04954 = $3; //@line 3708
   $27 = $17; //@line 3708
   while (1) {
    if (($27 | 0) < 0) {
     break;
    }
    $$04855 = $$04855 - $27 | 0; //@line 3714
    $37 = HEAP32[$$04954 + 4 >> 2] | 0; //@line 3716
    $38 = $27 >>> 0 > $37 >>> 0; //@line 3717
    $$150 = $38 ? $$04954 + 8 | 0 : $$04954; //@line 3719
    $$1 = $$04756 + ($38 << 31 >> 31) | 0; //@line 3721
    $$0 = $27 - ($38 ? $37 : 0) | 0; //@line 3723
    HEAP32[$$150 >> 2] = (HEAP32[$$150 >> 2] | 0) + $$0; //@line 3726
    $44 = $$150 + 4 | 0; //@line 3727
    HEAP32[$44 >> 2] = (HEAP32[$44 >> 2] | 0) - $$0; //@line 3730
    HEAP32[$vararg_buffer3 >> 2] = HEAP32[$13 >> 2]; //@line 3733
    HEAP32[$vararg_buffer3 + 4 >> 2] = $$150; //@line 3735
    HEAP32[$vararg_buffer3 + 8 >> 2] = $$1; //@line 3737
    $27 = ___syscall_ret(___syscall146(146, $vararg_buffer3 | 0) | 0) | 0; //@line 3739
    if (($$04855 | 0) == ($27 | 0)) {
     label = 3; //@line 3742
     break L1;
    } else {
     $$04756 = $$1; //@line 3745
     $$04954 = $$150; //@line 3745
    }
   }
   HEAP32[$0 + 16 >> 2] = 0; //@line 3749
   HEAP32[$4 >> 2] = 0; //@line 3750
   HEAP32[$7 >> 2] = 0; //@line 3751
   HEAP32[$0 >> 2] = HEAP32[$0 >> 2] | 32; //@line 3754
   if (($$04756 | 0) == 2) {
    $$051 = 0; //@line 3757
   } else {
    $$051 = $2 - (HEAP32[$$04954 + 4 >> 2] | 0) | 0; //@line 3762
   }
  }
 } while (0);
 if ((label | 0) == 3) {
  $20 = HEAP32[$0 + 44 >> 2] | 0; //@line 3768
  HEAP32[$0 + 16 >> 2] = $20 + (HEAP32[$0 + 48 >> 2] | 0); //@line 3773
  $25 = $20; //@line 3774
  HEAP32[$4 >> 2] = $25; //@line 3775
  HEAP32[$7 >> 2] = $25; //@line 3776
  $$051 = $2; //@line 3777
 }
 STACKTOP = sp; //@line 3779
 return $$051 | 0; //@line 3779
}
function _memcpy(dest, src, num) {
 dest = dest | 0;
 src = src | 0;
 num = num | 0;
 var ret = 0, aligned_dest_end = 0, block_aligned_dest_end = 0, dest_end = 0;
 if ((num | 0) >= 8192) {
  return _emscripten_memcpy_big(dest | 0, src | 0, num | 0) | 0; //@line 9043
 }
 ret = dest | 0; //@line 9046
 dest_end = dest + num | 0; //@line 9047
 if ((dest & 3) == (src & 3)) {
  while (dest & 3) {
   if (!num) return ret | 0; //@line 9051
   HEAP8[dest >> 0] = HEAP8[src >> 0] | 0; //@line 9052
   dest = dest + 1 | 0; //@line 9053
   src = src + 1 | 0; //@line 9054
   num = num - 1 | 0; //@line 9055
  }
  aligned_dest_end = dest_end & -4 | 0; //@line 9057
  block_aligned_dest_end = aligned_dest_end - 64 | 0; //@line 9058
  while ((dest | 0) <= (block_aligned_dest_end | 0)) {
   HEAP32[dest >> 2] = HEAP32[src >> 2]; //@line 9060
   HEAP32[dest + 4 >> 2] = HEAP32[src + 4 >> 2]; //@line 9061
   HEAP32[dest + 8 >> 2] = HEAP32[src + 8 >> 2]; //@line 9062
   HEAP32[dest + 12 >> 2] = HEAP32[src + 12 >> 2]; //@line 9063
   HEAP32[dest + 16 >> 2] = HEAP32[src + 16 >> 2]; //@line 9064
   HEAP32[dest + 20 >> 2] = HEAP32[src + 20 >> 2]; //@line 9065
   HEAP32[dest + 24 >> 2] = HEAP32[src + 24 >> 2]; //@line 9066
   HEAP32[dest + 28 >> 2] = HEAP32[src + 28 >> 2]; //@line 9067
   HEAP32[dest + 32 >> 2] = HEAP32[src + 32 >> 2]; //@line 9068
   HEAP32[dest + 36 >> 2] = HEAP32[src + 36 >> 2]; //@line 9069
   HEAP32[dest + 40 >> 2] = HEAP32[src + 40 >> 2]; //@line 9070
   HEAP32[dest + 44 >> 2] = HEAP32[src + 44 >> 2]; //@line 9071
   HEAP32[dest + 48 >> 2] = HEAP32[src + 48 >> 2]; //@line 9072
   HEAP32[dest + 52 >> 2] = HEAP32[src + 52 >> 2]; //@line 9073
   HEAP32[dest + 56 >> 2] = HEAP32[src + 56 >> 2]; //@line 9074
   HEAP32[dest + 60 >> 2] = HEAP32[src + 60 >> 2]; //@line 9075
   dest = dest + 64 | 0; //@line 9076
   src = src + 64 | 0; //@line 9077
  }
  while ((dest | 0) < (aligned_dest_end | 0)) {
   HEAP32[dest >> 2] = HEAP32[src >> 2]; //@line 9080
   dest = dest + 4 | 0; //@line 9081
   src = src + 4 | 0; //@line 9082
  }
 } else {
  aligned_dest_end = dest_end - 4 | 0; //@line 9086
  while ((dest | 0) < (aligned_dest_end | 0)) {
   HEAP8[dest >> 0] = HEAP8[src >> 0] | 0; //@line 9088
   HEAP8[dest + 1 >> 0] = HEAP8[src + 1 >> 0] | 0; //@line 9089
   HEAP8[dest + 2 >> 0] = HEAP8[src + 2 >> 0] | 0; //@line 9090
   HEAP8[dest + 3 >> 0] = HEAP8[src + 3 >> 0] | 0; //@line 9091
   dest = dest + 4 | 0; //@line 9092
   src = src + 4 | 0; //@line 9093
  }
 }
 while ((dest | 0) < (dest_end | 0)) {
  HEAP8[dest >> 0] = HEAP8[src >> 0] | 0; //@line 9098
  dest = dest + 1 | 0; //@line 9099
  src = src + 1 | 0; //@line 9100
 }
 return ret | 0; //@line 9102
}
function __ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$0 = 0, $$2 = 0, $17 = 0, $18 = 0, $3 = 0, $6 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, dest = 0, sp = 0, stop = 0;
 sp = STACKTOP; //@line 7147
 STACKTOP = STACKTOP + 64 | 0; //@line 7148
 $3 = sp; //@line 7149
 if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, $1, 0) | 0) {
  $$2 = 1; //@line 7152
 } else {
  if (!$1) {
   $$2 = 0; //@line 7156
  } else {
   $AsyncCtx3 = _emscripten_alloc_async_context(16, sp) | 0; //@line 7158
   $6 = ___dynamic_cast($1, 24, 8, 0) | 0; //@line 7159
   if (___async) {
    HEAP32[$AsyncCtx3 >> 2] = 29; //@line 7162
    HEAP32[$AsyncCtx3 + 4 >> 2] = $3; //@line 7164
    HEAP32[$AsyncCtx3 + 8 >> 2] = $0; //@line 7166
    HEAP32[$AsyncCtx3 + 12 >> 2] = $2; //@line 7168
    sp = STACKTOP; //@line 7169
    STACKTOP = sp; //@line 7170
    return 0; //@line 7170
   }
   _emscripten_free_async_context($AsyncCtx3 | 0); //@line 7172
   if (!$6) {
    $$2 = 0; //@line 7175
   } else {
    dest = $3 + 4 | 0; //@line 7178
    stop = dest + 52 | 0; //@line 7178
    do {
     HEAP32[dest >> 2] = 0; //@line 7178
     dest = dest + 4 | 0; //@line 7178
    } while ((dest | 0) < (stop | 0));
    HEAP32[$3 >> 2] = $6; //@line 7179
    HEAP32[$3 + 8 >> 2] = $0; //@line 7181
    HEAP32[$3 + 12 >> 2] = -1; //@line 7183
    HEAP32[$3 + 48 >> 2] = 1; //@line 7185
    $17 = HEAP32[(HEAP32[$6 >> 2] | 0) + 28 >> 2] | 0; //@line 7188
    $18 = HEAP32[$2 >> 2] | 0; //@line 7189
    $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 7190
    FUNCTION_TABLE_viiii[$17 & 3]($6, $3, $18, 1); //@line 7191
    if (___async) {
     HEAP32[$AsyncCtx >> 2] = 30; //@line 7194
     HEAP32[$AsyncCtx + 4 >> 2] = $3; //@line 7196
     HEAP32[$AsyncCtx + 8 >> 2] = $2; //@line 7198
     HEAP32[$AsyncCtx + 12 >> 2] = $3; //@line 7200
     sp = STACKTOP; //@line 7201
     STACKTOP = sp; //@line 7202
     return 0; //@line 7202
    }
    _emscripten_free_async_context($AsyncCtx | 0); //@line 7204
    if ((HEAP32[$3 + 24 >> 2] | 0) == 1) {
     HEAP32[$2 >> 2] = HEAP32[$3 + 16 >> 2]; //@line 7211
     $$0 = 1; //@line 7212
    } else {
     $$0 = 0; //@line 7214
    }
    $$2 = $$0; //@line 7216
   }
  }
 }
 STACKTOP = sp; //@line 7220
 return $$2 | 0; //@line 7220
}
function ___mo_lookup($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$090 = 0, $$094 = 0, $$4 = 0, $10 = 0, $13 = 0, $17 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $31 = 0, $35 = 0, $4 = 0, $44 = 0, $46 = 0, $49 = 0, $53 = 0, $63 = 0, $7 = 0;
 $4 = (HEAP32[$0 >> 2] | 0) + 1794895138 | 0; //@line 4092
 $7 = _swapc(HEAP32[$0 + 8 >> 2] | 0, $4) | 0; //@line 4095
 $10 = _swapc(HEAP32[$0 + 12 >> 2] | 0, $4) | 0; //@line 4098
 $13 = _swapc(HEAP32[$0 + 16 >> 2] | 0, $4) | 0; //@line 4101
 L1 : do {
  if ($7 >>> 0 < $1 >>> 2 >>> 0) {
   $17 = $1 - ($7 << 2) | 0; //@line 4107
   if ($10 >>> 0 < $17 >>> 0 & $13 >>> 0 < $17 >>> 0) {
    if (!(($13 | $10) & 3)) {
     $23 = $10 >>> 2; //@line 4116
     $24 = $13 >>> 2; //@line 4117
     $$090 = 0; //@line 4118
     $$094 = $7; //@line 4118
     while (1) {
      $25 = $$094 >>> 1; //@line 4120
      $26 = $$090 + $25 | 0; //@line 4121
      $27 = $26 << 1; //@line 4122
      $28 = $27 + $23 | 0; //@line 4123
      $31 = _swapc(HEAP32[$0 + ($28 << 2) >> 2] | 0, $4) | 0; //@line 4126
      $35 = _swapc(HEAP32[$0 + ($28 + 1 << 2) >> 2] | 0, $4) | 0; //@line 4130
      if (!($35 >>> 0 < $1 >>> 0 & $31 >>> 0 < ($1 - $35 | 0) >>> 0)) {
       $$4 = 0; //@line 4136
       break L1;
      }
      if (HEAP8[$0 + ($35 + $31) >> 0] | 0) {
       $$4 = 0; //@line 4144
       break L1;
      }
      $44 = _strcmp($2, $0 + $35 | 0) | 0; //@line 4148
      if (!$44) {
       break;
      }
      $63 = ($44 | 0) < 0; //@line 4154
      if (($$094 | 0) == 1) {
       $$4 = 0; //@line 4159
       break L1;
      } else {
       $$090 = $63 ? $$090 : $26; //@line 4162
       $$094 = $63 ? $25 : $$094 - $25 | 0; //@line 4162
      }
     }
     $46 = $27 + $24 | 0; //@line 4165
     $49 = _swapc(HEAP32[$0 + ($46 << 2) >> 2] | 0, $4) | 0; //@line 4168
     $53 = _swapc(HEAP32[$0 + ($46 + 1 << 2) >> 2] | 0, $4) | 0; //@line 4172
     if ($53 >>> 0 < $1 >>> 0 & $49 >>> 0 < ($1 - $53 | 0) >>> 0) {
      $$4 = (HEAP8[$0 + ($53 + $49) >> 0] | 0) == 0 ? $0 + $53 | 0 : 0; //@line 4184
     } else {
      $$4 = 0; //@line 4186
     }
    } else {
     $$4 = 0; //@line 4189
    }
   } else {
    $$4 = 0; //@line 4192
   }
  } else {
   $$4 = 0; //@line 4195
  }
 } while (0);
 return $$4 | 0; //@line 4198
}
function ___fwritex($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$038 = 0, $$1 = 0, $$139 = 0, $$141 = 0, $$143 = 0, $10 = 0, $12 = 0, $14 = 0, $22 = 0, $28 = 0, $3 = 0, $31 = 0, $4 = 0, $9 = 0, label = 0;
 $3 = $2 + 16 | 0; //@line 3983
 $4 = HEAP32[$3 >> 2] | 0; //@line 3984
 if (!$4) {
  if (!(___towrite($2) | 0)) {
   $12 = HEAP32[$3 >> 2] | 0; //@line 3991
   label = 5; //@line 3992
  } else {
   $$1 = 0; //@line 3994
  }
 } else {
  $12 = $4; //@line 3998
  label = 5; //@line 3999
 }
 L5 : do {
  if ((label | 0) == 5) {
   $9 = $2 + 20 | 0; //@line 4003
   $10 = HEAP32[$9 >> 2] | 0; //@line 4004
   $14 = $10; //@line 4007
   if (($12 - $10 | 0) >>> 0 < $1 >>> 0) {
    $$1 = FUNCTION_TABLE_iiii[HEAP32[$2 + 36 >> 2] & 7]($2, $0, $1) | 0; //@line 4012
    break;
   }
   L10 : do {
    if ((HEAP8[$2 + 75 >> 0] | 0) > -1) {
     $$038 = $1; //@line 4020
     while (1) {
      if (!$$038) {
       $$139 = 0; //@line 4024
       $$141 = $0; //@line 4024
       $$143 = $1; //@line 4024
       $31 = $14; //@line 4024
       break L10;
      }
      $22 = $$038 + -1 | 0; //@line 4027
      if ((HEAP8[$0 + $22 >> 0] | 0) == 10) {
       break;
      } else {
       $$038 = $22; //@line 4034
      }
     }
     $28 = FUNCTION_TABLE_iiii[HEAP32[$2 + 36 >> 2] & 7]($2, $0, $$038) | 0; //@line 4039
     if ($28 >>> 0 < $$038 >>> 0) {
      $$1 = $28; //@line 4042
      break L5;
     }
     $$139 = $$038; //@line 4048
     $$141 = $0 + $$038 | 0; //@line 4048
     $$143 = $1 - $$038 | 0; //@line 4048
     $31 = HEAP32[$9 >> 2] | 0; //@line 4048
    } else {
     $$139 = 0; //@line 4050
     $$141 = $0; //@line 4050
     $$143 = $1; //@line 4050
     $31 = $14; //@line 4050
    }
   } while (0);
   _memcpy($31 | 0, $$141 | 0, $$143 | 0) | 0; //@line 4053
   HEAP32[$9 >> 2] = (HEAP32[$9 >> 2] | 0) + $$143; //@line 4056
   $$1 = $$139 + $$143 | 0; //@line 4058
  }
 } while (0);
 return $$1 | 0; //@line 4061
}
function _memset(ptr, value, num) {
 ptr = ptr | 0;
 value = value | 0;
 num = num | 0;
 var end = 0, aligned_end = 0, block_aligned_end = 0, value4 = 0;
 end = ptr + num | 0; //@line 9107
 value = value & 255; //@line 9109
 if ((num | 0) >= 67) {
  while (ptr & 3) {
   HEAP8[ptr >> 0] = value; //@line 9112
   ptr = ptr + 1 | 0; //@line 9113
  }
  aligned_end = end & -4 | 0; //@line 9116
  block_aligned_end = aligned_end - 64 | 0; //@line 9117
  value4 = value | value << 8 | value << 16 | value << 24; //@line 9118
  while ((ptr | 0) <= (block_aligned_end | 0)) {
   HEAP32[ptr >> 2] = value4; //@line 9121
   HEAP32[ptr + 4 >> 2] = value4; //@line 9122
   HEAP32[ptr + 8 >> 2] = value4; //@line 9123
   HEAP32[ptr + 12 >> 2] = value4; //@line 9124
   HEAP32[ptr + 16 >> 2] = value4; //@line 9125
   HEAP32[ptr + 20 >> 2] = value4; //@line 9126
   HEAP32[ptr + 24 >> 2] = value4; //@line 9127
   HEAP32[ptr + 28 >> 2] = value4; //@line 9128
   HEAP32[ptr + 32 >> 2] = value4; //@line 9129
   HEAP32[ptr + 36 >> 2] = value4; //@line 9130
   HEAP32[ptr + 40 >> 2] = value4; //@line 9131
   HEAP32[ptr + 44 >> 2] = value4; //@line 9132
   HEAP32[ptr + 48 >> 2] = value4; //@line 9133
   HEAP32[ptr + 52 >> 2] = value4; //@line 9134
   HEAP32[ptr + 56 >> 2] = value4; //@line 9135
   HEAP32[ptr + 60 >> 2] = value4; //@line 9136
   ptr = ptr + 64 | 0; //@line 9137
  }
  while ((ptr | 0) < (aligned_end | 0)) {
   HEAP32[ptr >> 2] = value4; //@line 9141
   ptr = ptr + 4 | 0; //@line 9142
  }
 }
 while ((ptr | 0) < (end | 0)) {
  HEAP8[ptr >> 0] = value; //@line 9147
  ptr = ptr + 1 | 0; //@line 9148
 }
 return end - num | 0; //@line 9150
}
function _wcrtomb($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$0 = 0;
 do {
  if (!$0) {
   $$0 = 1; //@line 6897
  } else {
   if ($1 >>> 0 < 128) {
    HEAP8[$0 >> 0] = $1; //@line 6902
    $$0 = 1; //@line 6903
    break;
   }
   if (!(HEAP32[HEAP32[(___pthread_self_910() | 0) + 188 >> 2] >> 2] | 0)) {
    if (($1 & -128 | 0) == 57216) {
     HEAP8[$0 >> 0] = $1; //@line 6916
     $$0 = 1; //@line 6917
     break;
    } else {
     HEAP32[(___errno_location() | 0) >> 2] = 84; //@line 6921
     $$0 = -1; //@line 6922
     break;
    }
   }
   if ($1 >>> 0 < 2048) {
    HEAP8[$0 >> 0] = $1 >>> 6 | 192; //@line 6932
    HEAP8[$0 + 1 >> 0] = $1 & 63 | 128; //@line 6936
    $$0 = 2; //@line 6937
    break;
   }
   if ($1 >>> 0 < 55296 | ($1 & -8192 | 0) == 57344) {
    HEAP8[$0 >> 0] = $1 >>> 12 | 224; //@line 6949
    HEAP8[$0 + 1 >> 0] = $1 >>> 6 & 63 | 128; //@line 6955
    HEAP8[$0 + 2 >> 0] = $1 & 63 | 128; //@line 6959
    $$0 = 3; //@line 6960
    break;
   }
   if (($1 + -65536 | 0) >>> 0 < 1048576) {
    HEAP8[$0 >> 0] = $1 >>> 18 | 240; //@line 6970
    HEAP8[$0 + 1 >> 0] = $1 >>> 12 & 63 | 128; //@line 6976
    HEAP8[$0 + 2 >> 0] = $1 >>> 6 & 63 | 128; //@line 6982
    HEAP8[$0 + 3 >> 0] = $1 & 63 | 128; //@line 6986
    $$0 = 4; //@line 6987
    break;
   } else {
    HEAP32[(___errno_location() | 0) >> 2] = 84; //@line 6991
    $$0 = -1; //@line 6992
    break;
   }
  }
 } while (0);
 return $$0 | 0; //@line 6997
}
function __ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv__async_cb_17($0) {
 $0 = $0 | 0;
 var $15 = 0, $16 = 0, $2 = 0, $4 = 0, $6 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx = 0, dest = 0, sp = 0, stop = 0;
 sp = STACKTOP; //@line 8461
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 8463
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 8465
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 8467
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 8469
 if (!$AsyncRetVal) {
  HEAP8[___async_retval >> 0] = 0; //@line 8474
  return;
 }
 dest = $2 + 4 | 0; //@line 8478
 stop = dest + 52 | 0; //@line 8478
 do {
  HEAP32[dest >> 2] = 0; //@line 8478
  dest = dest + 4 | 0; //@line 8478
 } while ((dest | 0) < (stop | 0));
 HEAP32[$2 >> 2] = $AsyncRetVal; //@line 8479
 HEAP32[$2 + 8 >> 2] = $4; //@line 8481
 HEAP32[$2 + 12 >> 2] = -1; //@line 8483
 HEAP32[$2 + 48 >> 2] = 1; //@line 8485
 $15 = HEAP32[(HEAP32[$AsyncRetVal >> 2] | 0) + 28 >> 2] | 0; //@line 8488
 $16 = HEAP32[$6 >> 2] | 0; //@line 8489
 $ReallocAsyncCtx = _emscripten_realloc_async_context(16) | 0; //@line 8490
 FUNCTION_TABLE_viiii[$15 & 3]($AsyncRetVal, $2, $16, 1); //@line 8491
 if (!___async) {
  ___async_unwind = 0; //@line 8494
 }
 HEAP32[$ReallocAsyncCtx >> 2] = 30; //@line 8496
 HEAP32[$ReallocAsyncCtx + 4 >> 2] = $2; //@line 8498
 HEAP32[$ReallocAsyncCtx + 8 >> 2] = $6; //@line 8500
 HEAP32[$ReallocAsyncCtx + 12 >> 2] = $2; //@line 8502
 sp = STACKTOP; //@line 8503
 return;
}
function _fmt_u($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$010$lcssa$off0 = 0, $$012 = 0, $$09$lcssa = 0, $$0914 = 0, $$1$lcssa = 0, $$111 = 0, $10 = 0, $26 = 0, $8 = 0, $9 = 0, $8$looptemp = 0;
 if ($1 >>> 0 > 0 | ($1 | 0) == 0 & $0 >>> 0 > 4294967295) {
  $$0914 = $2; //@line 5781
  $8 = $0; //@line 5781
  $9 = $1; //@line 5781
  while (1) {
   $10 = ___uremdi3($8 | 0, $9 | 0, 10, 0) | 0; //@line 5783
   $$0914 = $$0914 + -1 | 0; //@line 5787
   HEAP8[$$0914 >> 0] = $10 & 255 | 48; //@line 5788
   $8$looptemp = $8;
   $8 = ___udivdi3($8 | 0, $9 | 0, 10, 0) | 0; //@line 5789
   if (!($9 >>> 0 > 9 | ($9 | 0) == 9 & $8$looptemp >>> 0 > 4294967295)) {
    break;
   } else {
    $9 = tempRet0; //@line 5797
   }
  }
  $$010$lcssa$off0 = $8; //@line 5802
  $$09$lcssa = $$0914; //@line 5802
 } else {
  $$010$lcssa$off0 = $0; //@line 5804
  $$09$lcssa = $2; //@line 5804
 }
 if (!$$010$lcssa$off0) {
  $$1$lcssa = $$09$lcssa; //@line 5808
 } else {
  $$012 = $$010$lcssa$off0; //@line 5810
  $$111 = $$09$lcssa; //@line 5810
  while (1) {
   $26 = $$111 + -1 | 0; //@line 5815
   HEAP8[$26 >> 0] = ($$012 >>> 0) % 10 | 0 | 48; //@line 5816
   if ($$012 >>> 0 < 10) {
    $$1$lcssa = $26; //@line 5820
    break;
   } else {
    $$012 = ($$012 >>> 0) / 10 | 0; //@line 5823
    $$111 = $26; //@line 5823
   }
  }
 }
 return $$1$lcssa | 0; //@line 5827
}
function __ZNK10__cxxabiv117__class_type_info29process_static_type_above_dstEPNS_19__dynamic_cast_infoEPKvS4_i($0, $1, $2, $3, $4) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 var $10 = 0, $11 = 0, $21 = 0, $22 = 0, $28 = 0, $30 = 0;
 HEAP8[$1 + 53 >> 0] = 1; //@line 7394
 do {
  if ((HEAP32[$1 + 4 >> 2] | 0) == ($3 | 0)) {
   HEAP8[$1 + 52 >> 0] = 1; //@line 7401
   $10 = $1 + 16 | 0; //@line 7402
   $11 = HEAP32[$10 >> 2] | 0; //@line 7403
   if (!$11) {
    HEAP32[$10 >> 2] = $2; //@line 7406
    HEAP32[$1 + 24 >> 2] = $4; //@line 7408
    HEAP32[$1 + 36 >> 2] = 1; //@line 7410
    if (!(($4 | 0) == 1 ? (HEAP32[$1 + 48 >> 2] | 0) == 1 : 0)) {
     break;
    }
    HEAP8[$1 + 54 >> 0] = 1; //@line 7420
    break;
   }
   if (($11 | 0) != ($2 | 0)) {
    $30 = $1 + 36 | 0; //@line 7425
    HEAP32[$30 >> 2] = (HEAP32[$30 >> 2] | 0) + 1; //@line 7428
    HEAP8[$1 + 54 >> 0] = 1; //@line 7430
    break;
   }
   $21 = $1 + 24 | 0; //@line 7433
   $22 = HEAP32[$21 >> 2] | 0; //@line 7434
   if (($22 | 0) == 2) {
    HEAP32[$21 >> 2] = $4; //@line 7437
    $28 = $4; //@line 7438
   } else {
    $28 = $22; //@line 7440
   }
   if (($28 | 0) == 1 ? (HEAP32[$1 + 48 >> 2] | 0) == 1 : 0) {
    HEAP8[$1 + 54 >> 0] = 1; //@line 7449
   }
  }
 } while (0);
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
   __ZNK10__cxxabiv117__class_type_info29process_static_type_below_dstEPNS_19__dynamic_cast_infoEPKvi(0, $1, $2, $3); //@line 7253
  } else {
   if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 >> 2] | 0, $4) | 0) {
    if ((HEAP32[$1 + 16 >> 2] | 0) != ($2 | 0)) {
     $13 = $1 + 20 | 0; //@line 7262
     if ((HEAP32[$13 >> 2] | 0) != ($2 | 0)) {
      HEAP32[$1 + 32 >> 2] = $3; //@line 7267
      HEAP32[$13 >> 2] = $2; //@line 7268
      $19 = $1 + 40 | 0; //@line 7269
      HEAP32[$19 >> 2] = (HEAP32[$19 >> 2] | 0) + 1; //@line 7272
      if ((HEAP32[$1 + 36 >> 2] | 0) == 1) {
       if ((HEAP32[$1 + 24 >> 2] | 0) == 2) {
        HEAP8[$1 + 54 >> 0] = 1; //@line 7282
       }
      }
      HEAP32[$1 + 44 >> 2] = 4; //@line 7286
      break;
     }
    }
    if (($3 | 0) == 1) {
     HEAP32[$1 + 32 >> 2] = 1; //@line 7293
    }
   }
  }
 } while (0);
 return;
}
function __ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb($0) {
 $0 = $0 | 0;
 var $$037$off038 = 0, $$037$off039 = 0, $12 = 0, $17 = 0, $4 = 0, $6 = 0, $8 = 0, label = 0;
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 8316
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 8318
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 8320
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 8324
 if (!(HEAP8[HEAP32[$0 + 4 >> 2] >> 0] | 0)) {
  $$037$off038 = 4; //@line 8328
  label = 4; //@line 8329
 } else {
  if (!(HEAP8[HEAP32[$0 + 20 >> 2] >> 0] | 0)) {
   $$037$off038 = 3; //@line 8334
   label = 4; //@line 8335
  } else {
   $$037$off039 = 3; //@line 8337
  }
 }
 if ((label | 0) == 4) {
  HEAP32[$6 >> 2] = $4; //@line 8341
  $17 = $8 + 40 | 0; //@line 8342
  HEAP32[$17 >> 2] = (HEAP32[$17 >> 2] | 0) + 1; //@line 8345
  if ((HEAP32[$8 + 36 >> 2] | 0) == 1) {
   if ((HEAP32[$8 + 24 >> 2] | 0) == 2) {
    HEAP8[$8 + 54 >> 0] = 1; //@line 8355
    $$037$off039 = $$037$off038; //@line 8356
   } else {
    $$037$off039 = $$037$off038; //@line 8358
   }
  } else {
   $$037$off039 = $$037$off038; //@line 8361
  }
 }
 HEAP32[$12 >> 2] = $$037$off039; //@line 8364
 return;
}
function _main__async_cb($0) {
 $0 = $0 | 0;
 var $10 = 0, $11 = 0, $2 = 0, $4 = 0, $7 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 8661
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 8663
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 8665
 $7 = (_emscripten_asm_const_ii(2, HEAP32[858] | 0) | 0) == 0 & 1; //@line 8669
 _emscripten_asm_const_iii(0, HEAP32[858] | 0, $7 | 0) | 0; //@line 8671
 HEAP32[$2 >> 2] = _emscripten_asm_const_ii(2, HEAP32[858] | 0) | 0; //@line 8674
 _printf(796, $2) | 0; //@line 8675
 $ReallocAsyncCtx = _emscripten_realloc_async_context(12) | 0; //@line 8676
 _wait_ms(500); //@line 8677
 if (___async) {
  HEAP32[$ReallocAsyncCtx >> 2] = 26; //@line 8680
  $10 = $ReallocAsyncCtx + 4 | 0; //@line 8681
  HEAP32[$10 >> 2] = $2; //@line 8682
  $11 = $ReallocAsyncCtx + 8 | 0; //@line 8683
  HEAP32[$11 >> 2] = $4; //@line 8684
  sp = STACKTOP; //@line 8685
  return;
 }
 ___async_unwind = 0; //@line 8688
 HEAP32[$ReallocAsyncCtx >> 2] = 26; //@line 8689
 $10 = $ReallocAsyncCtx + 4 | 0; //@line 8690
 HEAP32[$10 >> 2] = $2; //@line 8691
 $11 = $ReallocAsyncCtx + 8 | 0; //@line 8692
 HEAP32[$11 >> 2] = $4; //@line 8693
 sp = STACKTOP; //@line 8694
 return;
}
function ___strerror_l($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$012$lcssa = 0, $$01214 = 0, $$016 = 0, $$113 = 0, $$115 = 0, $7 = 0, label = 0, $$113$looptemp = 0;
 $$016 = 0; //@line 7017
 while (1) {
  if ((HEAPU8[1352 + $$016 >> 0] | 0) == ($0 | 0)) {
   label = 2; //@line 7024
   break;
  }
  $7 = $$016 + 1 | 0; //@line 7027
  if (($7 | 0) == 87) {
   $$01214 = 1440; //@line 7030
   $$115 = 87; //@line 7030
   label = 5; //@line 7031
   break;
  } else {
   $$016 = $7; //@line 7034
  }
 }
 if ((label | 0) == 2) {
  if (!$$016) {
   $$012$lcssa = 1440; //@line 7040
  } else {
   $$01214 = 1440; //@line 7042
   $$115 = $$016; //@line 7042
   label = 5; //@line 7043
  }
 }
 if ((label | 0) == 5) {
  while (1) {
   label = 0; //@line 7048
   $$113 = $$01214; //@line 7049
   do {
    $$113$looptemp = $$113;
    $$113 = $$113 + 1 | 0; //@line 7053
   } while ((HEAP8[$$113$looptemp >> 0] | 0) != 0);
   $$115 = $$115 + -1 | 0; //@line 7060
   if (!$$115) {
    $$012$lcssa = $$113; //@line 7063
    break;
   } else {
    $$01214 = $$113; //@line 7066
    label = 5; //@line 7067
   }
  }
 }
 return ___lctrans($$012$lcssa, HEAP32[$1 + 20 >> 2] | 0) | 0; //@line 7074
}
function _invoke_ticker($0) {
 $0 = $0 | 0;
 var $2 = 0, $3 = 0, $7 = 0, $8 = 0, $AsyncCtx = 0, $AsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 405
 $2 = $0 + 12 | 0; //@line 407
 $3 = HEAP32[$2 >> 2] | 0; //@line 408
 do {
  if (!$3) {
   $AsyncCtx2 = _emscripten_alloc_async_context(12, sp) | 0; //@line 412
   _mbed_assert_internal(637, 642, 528); //@line 413
   if (___async) {
    HEAP32[$AsyncCtx2 >> 2] = 23; //@line 416
    HEAP32[$AsyncCtx2 + 4 >> 2] = $2; //@line 418
    HEAP32[$AsyncCtx2 + 8 >> 2] = $0; //@line 420
    sp = STACKTOP; //@line 421
    return;
   } else {
    _emscripten_free_async_context($AsyncCtx2 | 0); //@line 424
    $8 = HEAP32[$2 >> 2] | 0; //@line 426
    break;
   }
  } else {
   $8 = $3; //@line 430
  }
 } while (0);
 $7 = HEAP32[$8 >> 2] | 0; //@line 433
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 435
 FUNCTION_TABLE_vi[$7 & 63]($0); //@line 436
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 24; //@line 439
  sp = STACKTOP; //@line 440
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 443
  return;
 }
}
function _frexp($0, $1) {
 $0 = +$0;
 $1 = $1 | 0;
 var $$0 = 0.0, $$016 = 0.0, $2 = 0, $3 = 0, $4 = 0, $9 = 0.0, $storemerge = 0;
 HEAPF64[tempDoublePtr >> 3] = $0; //@line 6848
 $2 = HEAP32[tempDoublePtr >> 2] | 0; //@line 6848
 $3 = HEAP32[tempDoublePtr + 4 >> 2] | 0; //@line 6849
 $4 = _bitshift64Lshr($2 | 0, $3 | 0, 52) | 0; //@line 6850
 switch ($4 & 2047) {
 case 0:
  {
   if ($0 != 0.0) {
    $9 = +_frexp($0 * 18446744073709552000.0, $1); //@line 6859
    $$016 = $9; //@line 6862
    $storemerge = (HEAP32[$1 >> 2] | 0) + -64 | 0; //@line 6862
   } else {
    $$016 = $0; //@line 6864
    $storemerge = 0; //@line 6864
   }
   HEAP32[$1 >> 2] = $storemerge; //@line 6866
   $$0 = $$016; //@line 6867
   break;
  }
 case 2047:
  {
   $$0 = $0; //@line 6871
   break;
  }
 default:
  {
   HEAP32[$1 >> 2] = ($4 & 2047) + -1022; //@line 6877
   HEAP32[tempDoublePtr >> 2] = $2; //@line 6880
   HEAP32[tempDoublePtr + 4 >> 2] = $3 & -2146435073 | 1071644672; //@line 6880
   $$0 = +HEAPF64[tempDoublePtr >> 3]; //@line 6881
  }
 }
 return +$$0;
}
function _vfprintf__async_cb($0) {
 $0 = $0 | 0;
 var $$ = 0, $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $2 = 0, $20 = 0, $22 = 0, $33 = 0;
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 8380
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 8388
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 8390
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 8392
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 8394
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 8396
 $20 = HEAP32[$0 + 40 >> 2] | 0; //@line 8398
 $22 = HEAP32[$0 + 44 >> 2] | 0; //@line 8400
 $$ = (HEAP32[$2 >> 2] | 0) == 0 ? -1 : HEAP32[$0 + 8 >> 2] | 0; //@line 8411
 HEAP32[HEAP32[$0 + 16 >> 2] >> 2] = HEAP32[$0 + 12 >> 2]; //@line 8412
 HEAP32[$10 >> 2] = 0; //@line 8413
 HEAP32[$12 >> 2] = 0; //@line 8414
 HEAP32[$14 >> 2] = 0; //@line 8415
 HEAP32[$2 >> 2] = 0; //@line 8416
 $33 = HEAP32[$16 >> 2] | 0; //@line 8417
 HEAP32[$16 >> 2] = $33 | $18; //@line 8422
 if ($20 | 0) {
  ___unlockfile($22); //@line 8425
 }
 HEAP32[___async_retval >> 2] = ($33 & 32 | 0) == 0 ? $$ : -1; //@line 8428
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
 sp = STACKTOP; //@line 7609
 do {
  if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, $5) | 0) {
   __ZNK10__cxxabiv117__class_type_info29process_static_type_above_dstEPNS_19__dynamic_cast_infoEPKvS4_i(0, $1, $2, $3, $4); //@line 7615
  } else {
   $10 = HEAP32[$0 + 8 >> 2] | 0; //@line 7618
   $13 = HEAP32[(HEAP32[$10 >> 2] | 0) + 20 >> 2] | 0; //@line 7621
   $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 7622
   FUNCTION_TABLE_viiiiii[$13 & 3]($10, $1, $2, $3, $4, $5); //@line 7623
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 33; //@line 7626
    sp = STACKTOP; //@line 7627
    return;
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 7630
    break;
   }
  }
 } while (0);
 return;
}
function __ZNK10__cxxabiv120__si_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $11 = 0, $8 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 7778
 do {
  if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, 0) | 0) {
   __ZNK10__cxxabiv117__class_type_info24process_found_base_classEPNS_19__dynamic_cast_infoEPvi(0, $1, $2, $3); //@line 7784
  } else {
   $8 = HEAP32[$0 + 8 >> 2] | 0; //@line 7787
   $11 = HEAP32[(HEAP32[$8 >> 2] | 0) + 28 >> 2] | 0; //@line 7790
   $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 7791
   FUNCTION_TABLE_viiii[$11 & 3]($8, $1, $2, $3); //@line 7792
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 36; //@line 7795
    sp = STACKTOP; //@line 7796
    return;
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 7799
    break;
   }
  }
 } while (0);
 return;
}
function ___cxa_can_catch($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $3 = 0, $7 = 0, $8 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 7817
 STACKTOP = STACKTOP + 16 | 0; //@line 7818
 $3 = sp; //@line 7819
 HEAP32[$3 >> 2] = HEAP32[$2 >> 2]; //@line 7821
 $7 = HEAP32[(HEAP32[$0 >> 2] | 0) + 16 >> 2] | 0; //@line 7824
 $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 7825
 $8 = FUNCTION_TABLE_iiii[$7 & 7]($0, $1, $3) | 0; //@line 7826
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 37; //@line 7829
  HEAP32[$AsyncCtx + 4 >> 2] = $3; //@line 7831
  HEAP32[$AsyncCtx + 8 >> 2] = $2; //@line 7833
  HEAP32[$AsyncCtx + 12 >> 2] = $3; //@line 7835
  sp = STACKTOP; //@line 7836
  STACKTOP = sp; //@line 7837
  return 0; //@line 7837
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 7839
 if ($8) {
  HEAP32[$2 >> 2] = HEAP32[$3 >> 2]; //@line 7843
 }
 STACKTOP = sp; //@line 7845
 return $8 & 1 | 0; //@line 7845
}
function ___dynamic_cast__async_cb_19($0) {
 $0 = $0 | 0;
 var $$0 = 0, $10 = 0, $16 = 0, $6 = 0, $8 = 0;
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 8594
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 8596
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 8598
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 8604
 L2 : do {
  switch (HEAP32[HEAP32[$0 + 4 >> 2] >> 2] | 0) {
  case 0:
   {
    $$0 = (HEAP32[$6 >> 2] | 0) == 1 & (HEAP32[$8 >> 2] | 0) == 1 & (HEAP32[$10 >> 2] | 0) == 1 ? HEAP32[HEAP32[$0 + 24 >> 2] >> 2] | 0 : 0; //@line 8619
    break;
   }
  case 1:
   {
    if ((HEAP32[HEAP32[$0 + 28 >> 2] >> 2] | 0) != 1) {
     if (!((HEAP32[$6 >> 2] | 0) == 0 & (HEAP32[$8 >> 2] | 0) == 1 & (HEAP32[$10 >> 2] | 0) == 1)) {
      $$0 = 0; //@line 8635
      break L2;
     }
    }
    $$0 = HEAP32[$16 >> 2] | 0; //@line 8640
    break;
   }
  default:
   {
    $$0 = 0; //@line 8644
   }
  }
 } while (0);
 HEAP32[___async_retval >> 2] = $$0; //@line 8649
 return;
}
function _main() {
 var $2 = 0, $AsyncCtx = 0, $vararg_buffer = 0, sp = 0;
 sp = STACKTOP; //@line 477
 STACKTOP = STACKTOP + 16 | 0; //@line 478
 $vararg_buffer = sp; //@line 479
 while (1) {
  $2 = (_emscripten_asm_const_ii(2, HEAP32[858] | 0) | 0) == 0 & 1; //@line 484
  _emscripten_asm_const_iii(0, HEAP32[858] | 0, $2 | 0) | 0; //@line 486
  HEAP32[$vararg_buffer >> 2] = _emscripten_asm_const_ii(2, HEAP32[858] | 0) | 0; //@line 489
  _printf(796, $vararg_buffer) | 0; //@line 490
  $AsyncCtx = _emscripten_alloc_async_context(12, sp) | 0; //@line 491
  _wait_ms(500); //@line 492
  if (___async) {
   break;
  }
  _emscripten_free_async_context($AsyncCtx | 0); //@line 497
 }
 HEAP32[$AsyncCtx >> 2] = 26; //@line 499
 HEAP32[$AsyncCtx + 4 >> 2] = $vararg_buffer; //@line 501
 HEAP32[$AsyncCtx + 8 >> 2] = $vararg_buffer; //@line 503
 sp = STACKTOP; //@line 504
 STACKTOP = sp; //@line 505
 return 0; //@line 505
}
function _pad_676($0, $1, $2, $3, $4) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 var $$0$lcssa = 0, $$011 = 0, $14 = 0, $5 = 0, $9 = 0, sp = 0;
 sp = STACKTOP; //@line 5846
 STACKTOP = STACKTOP + 256 | 0; //@line 5847
 $5 = sp; //@line 5848
 if (($2 | 0) > ($3 | 0) & ($4 & 73728 | 0) == 0) {
  $9 = $2 - $3 | 0; //@line 5854
  _memset($5 | 0, $1 << 24 >> 24 | 0, ($9 >>> 0 < 256 ? $9 : 256) | 0) | 0; //@line 5858
  if ($9 >>> 0 > 255) {
   $14 = $2 - $3 | 0; //@line 5861
   $$011 = $9; //@line 5862
   do {
    _out_670($0, $5, 256); //@line 5864
    $$011 = $$011 + -256 | 0; //@line 5865
   } while ($$011 >>> 0 > 255);
   $$0$lcssa = $14 & 255; //@line 5874
  } else {
   $$0$lcssa = $9; //@line 5876
  }
  _out_670($0, $5, $$0$lcssa); //@line 5878
 }
 STACKTOP = sp; //@line 5880
 return;
}
function __ZNK10__cxxabiv117__class_type_info24process_found_base_classEPNS_19__dynamic_cast_infoEPvi($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $10 = 0, $13 = 0, $4 = 0, $5 = 0;
 $4 = $1 + 16 | 0; //@line 7331
 $5 = HEAP32[$4 >> 2] | 0; //@line 7332
 do {
  if (!$5) {
   HEAP32[$4 >> 2] = $2; //@line 7336
   HEAP32[$1 + 24 >> 2] = $3; //@line 7338
   HEAP32[$1 + 36 >> 2] = 1; //@line 7340
  } else {
   if (($5 | 0) != ($2 | 0)) {
    $13 = $1 + 36 | 0; //@line 7344
    HEAP32[$13 >> 2] = (HEAP32[$13 >> 2] | 0) + 1; //@line 7347
    HEAP32[$1 + 24 >> 2] = 2; //@line 7349
    HEAP8[$1 + 54 >> 0] = 1; //@line 7351
    break;
   }
   $10 = $1 + 24 | 0; //@line 7354
   if ((HEAP32[$10 >> 2] | 0) == 2) {
    HEAP32[$10 >> 2] = $3; //@line 7358
   }
  }
 } while (0);
 return;
}
function ___stdio_seek($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $10 = 0, $3 = 0, $vararg_buffer = 0, sp = 0;
 sp = STACKTOP; //@line 3786
 STACKTOP = STACKTOP + 32 | 0; //@line 3787
 $vararg_buffer = sp; //@line 3788
 $3 = sp + 20 | 0; //@line 3789
 HEAP32[$vararg_buffer >> 2] = HEAP32[$0 + 60 >> 2]; //@line 3793
 HEAP32[$vararg_buffer + 4 >> 2] = 0; //@line 3795
 HEAP32[$vararg_buffer + 8 >> 2] = $1; //@line 3797
 HEAP32[$vararg_buffer + 12 >> 2] = $3; //@line 3799
 HEAP32[$vararg_buffer + 16 >> 2] = $2; //@line 3801
 if ((___syscall_ret(___syscall140(140, $vararg_buffer | 0) | 0) | 0) < 0) {
  HEAP32[$3 >> 2] = -1; //@line 3806
  $10 = -1; //@line 3807
 } else {
  $10 = HEAP32[$3 >> 2] | 0; //@line 3810
 }
 STACKTOP = sp; //@line 3812
 return $10 | 0; //@line 3812
}
function _strcmp($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$011 = 0, $$0710 = 0, $$lcssa = 0, $$lcssa8 = 0, $2 = 0, $3 = 0, $8 = 0, $9 = 0;
 $2 = HEAP8[$0 >> 0] | 0; //@line 3893
 $3 = HEAP8[$1 >> 0] | 0; //@line 3894
 if ($2 << 24 >> 24 == 0 ? 1 : $2 << 24 >> 24 != $3 << 24 >> 24) {
  $$lcssa = $3; //@line 3899
  $$lcssa8 = $2; //@line 3899
 } else {
  $$011 = $1; //@line 3901
  $$0710 = $0; //@line 3901
  do {
   $$0710 = $$0710 + 1 | 0; //@line 3903
   $$011 = $$011 + 1 | 0; //@line 3904
   $8 = HEAP8[$$0710 >> 0] | 0; //@line 3905
   $9 = HEAP8[$$011 >> 0] | 0; //@line 3906
  } while (!($8 << 24 >> 24 == 0 ? 1 : $8 << 24 >> 24 != $9 << 24 >> 24));
  $$lcssa = $9; //@line 3911
  $$lcssa8 = $8; //@line 3911
 }
 return ($$lcssa8 & 255) - ($$lcssa & 255) | 0; //@line 3921
}
function _printf($0, $varargs) {
 $0 = $0 | 0;
 $varargs = $varargs | 0;
 var $1 = 0, $2 = 0, $3 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 7088
 STACKTOP = STACKTOP + 16 | 0; //@line 7089
 $1 = sp; //@line 7090
 HEAP32[$1 >> 2] = $varargs; //@line 7091
 $2 = HEAP32[24] | 0; //@line 7092
 $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 7093
 $3 = _vfprintf($2, $0, $1) | 0; //@line 7094
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 28; //@line 7097
  HEAP32[$AsyncCtx + 4 >> 2] = $1; //@line 7099
  sp = STACKTOP; //@line 7100
  STACKTOP = sp; //@line 7101
  return 0; //@line 7101
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 7103
  STACKTOP = sp; //@line 7104
  return $3 | 0; //@line 7104
 }
 return 0; //@line 7106
}
function _mbed_assert_internal($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $AsyncCtx = 0, $vararg_buffer = 0, sp = 0;
 sp = STACKTOP; //@line 49
 STACKTOP = STACKTOP + 16 | 0; //@line 50
 $vararg_buffer = sp; //@line 51
 HEAP32[$vararg_buffer >> 2] = $0; //@line 52
 HEAP32[$vararg_buffer + 4 >> 2] = $1; //@line 54
 HEAP32[$vararg_buffer + 8 >> 2] = $2; //@line 56
 _mbed_error_printf(548, $vararg_buffer); //@line 57
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 58
 _mbed_die(); //@line 59
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 6; //@line 62
  sp = STACKTOP; //@line 63
  STACKTOP = sp; //@line 64
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 66
  STACKTOP = sp; //@line 67
  return;
 }
}
function _mbed_die__async_cb_13($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx13 = 0, sp = 0;
 sp = STACKTOP; //@line 8208
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 8210
 _emscripten_asm_const_iii(0, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 8212
 $ReallocAsyncCtx13 = _emscripten_realloc_async_context(8) | 0; //@line 8213
 _wait_ms(150); //@line 8214
 if (___async) {
  HEAP32[$ReallocAsyncCtx13 >> 2] = 10; //@line 8217
  $4 = $ReallocAsyncCtx13 + 4 | 0; //@line 8218
  HEAP32[$4 >> 2] = $2; //@line 8219
  sp = STACKTOP; //@line 8220
  return;
 }
 ___async_unwind = 0; //@line 8223
 HEAP32[$ReallocAsyncCtx13 >> 2] = 10; //@line 8224
 $4 = $ReallocAsyncCtx13 + 4 | 0; //@line 8225
 HEAP32[$4 >> 2] = $2; //@line 8226
 sp = STACKTOP; //@line 8227
 return;
}
function _mbed_die__async_cb_12($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx12 = 0, sp = 0;
 sp = STACKTOP; //@line 8183
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 8185
 _emscripten_asm_const_iii(0, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 8187
 $ReallocAsyncCtx12 = _emscripten_realloc_async_context(8) | 0; //@line 8188
 _wait_ms(150); //@line 8189
 if (___async) {
  HEAP32[$ReallocAsyncCtx12 >> 2] = 11; //@line 8192
  $4 = $ReallocAsyncCtx12 + 4 | 0; //@line 8193
  HEAP32[$4 >> 2] = $2; //@line 8194
  sp = STACKTOP; //@line 8195
  return;
 }
 ___async_unwind = 0; //@line 8198
 HEAP32[$ReallocAsyncCtx12 >> 2] = 11; //@line 8199
 $4 = $ReallocAsyncCtx12 + 4 | 0; //@line 8200
 HEAP32[$4 >> 2] = $2; //@line 8201
 sp = STACKTOP; //@line 8202
 return;
}
function _mbed_die__async_cb_11($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx11 = 0, sp = 0;
 sp = STACKTOP; //@line 8158
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 8160
 _emscripten_asm_const_iii(0, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 8162
 $ReallocAsyncCtx11 = _emscripten_realloc_async_context(8) | 0; //@line 8163
 _wait_ms(150); //@line 8164
 if (___async) {
  HEAP32[$ReallocAsyncCtx11 >> 2] = 12; //@line 8167
  $4 = $ReallocAsyncCtx11 + 4 | 0; //@line 8168
  HEAP32[$4 >> 2] = $2; //@line 8169
  sp = STACKTOP; //@line 8170
  return;
 }
 ___async_unwind = 0; //@line 8173
 HEAP32[$ReallocAsyncCtx11 >> 2] = 12; //@line 8174
 $4 = $ReallocAsyncCtx11 + 4 | 0; //@line 8175
 HEAP32[$4 >> 2] = $2; //@line 8176
 sp = STACKTOP; //@line 8177
 return;
}
function _mbed_die__async_cb_10($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx10 = 0, sp = 0;
 sp = STACKTOP; //@line 8133
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 8135
 _emscripten_asm_const_iii(0, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 8137
 $ReallocAsyncCtx10 = _emscripten_realloc_async_context(8) | 0; //@line 8138
 _wait_ms(150); //@line 8139
 if (___async) {
  HEAP32[$ReallocAsyncCtx10 >> 2] = 13; //@line 8142
  $4 = $ReallocAsyncCtx10 + 4 | 0; //@line 8143
  HEAP32[$4 >> 2] = $2; //@line 8144
  sp = STACKTOP; //@line 8145
  return;
 }
 ___async_unwind = 0; //@line 8148
 HEAP32[$ReallocAsyncCtx10 >> 2] = 13; //@line 8149
 $4 = $ReallocAsyncCtx10 + 4 | 0; //@line 8150
 HEAP32[$4 >> 2] = $2; //@line 8151
 sp = STACKTOP; //@line 8152
 return;
}
function _mbed_die__async_cb_15($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx15 = 0, sp = 0;
 sp = STACKTOP; //@line 8258
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 8260
 _emscripten_asm_const_iii(0, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 8262
 $ReallocAsyncCtx15 = _emscripten_realloc_async_context(8) | 0; //@line 8263
 _wait_ms(150); //@line 8264
 if (___async) {
  HEAP32[$ReallocAsyncCtx15 >> 2] = 8; //@line 8267
  $4 = $ReallocAsyncCtx15 + 4 | 0; //@line 8268
  HEAP32[$4 >> 2] = $2; //@line 8269
  sp = STACKTOP; //@line 8270
  return;
 }
 ___async_unwind = 0; //@line 8273
 HEAP32[$ReallocAsyncCtx15 >> 2] = 8; //@line 8274
 $4 = $ReallocAsyncCtx15 + 4 | 0; //@line 8275
 HEAP32[$4 >> 2] = $2; //@line 8276
 sp = STACKTOP; //@line 8277
 return;
}
function _mbed_die__async_cb_14($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx14 = 0, sp = 0;
 sp = STACKTOP; //@line 8233
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 8235
 _emscripten_asm_const_iii(0, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 8237
 $ReallocAsyncCtx14 = _emscripten_realloc_async_context(8) | 0; //@line 8238
 _wait_ms(150); //@line 8239
 if (___async) {
  HEAP32[$ReallocAsyncCtx14 >> 2] = 9; //@line 8242
  $4 = $ReallocAsyncCtx14 + 4 | 0; //@line 8243
  HEAP32[$4 >> 2] = $2; //@line 8244
  sp = STACKTOP; //@line 8245
  return;
 }
 ___async_unwind = 0; //@line 8248
 HEAP32[$ReallocAsyncCtx14 >> 2] = 9; //@line 8249
 $4 = $ReallocAsyncCtx14 + 4 | 0; //@line 8250
 HEAP32[$4 >> 2] = $2; //@line 8251
 sp = STACKTOP; //@line 8252
 return;
}
function _mbed_die__async_cb($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx16 = 0, sp = 0;
 sp = STACKTOP; //@line 7883
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 7885
 _emscripten_asm_const_iii(0, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 7887
 $ReallocAsyncCtx16 = _emscripten_realloc_async_context(8) | 0; //@line 7888
 _wait_ms(150); //@line 7889
 if (___async) {
  HEAP32[$ReallocAsyncCtx16 >> 2] = 7; //@line 7892
  $4 = $ReallocAsyncCtx16 + 4 | 0; //@line 7893
  HEAP32[$4 >> 2] = $2; //@line 7894
  sp = STACKTOP; //@line 7895
  return;
 }
 ___async_unwind = 0; //@line 7898
 HEAP32[$ReallocAsyncCtx16 >> 2] = 7; //@line 7899
 $4 = $ReallocAsyncCtx16 + 4 | 0; //@line 7900
 HEAP32[$4 >> 2] = $2; //@line 7901
 sp = STACKTOP; //@line 7902
 return;
}
function _mbed_die__async_cb_9($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx9 = 0, sp = 0;
 sp = STACKTOP; //@line 8108
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 8110
 _emscripten_asm_const_iii(0, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 8112
 $ReallocAsyncCtx9 = _emscripten_realloc_async_context(8) | 0; //@line 8113
 _wait_ms(150); //@line 8114
 if (___async) {
  HEAP32[$ReallocAsyncCtx9 >> 2] = 14; //@line 8117
  $4 = $ReallocAsyncCtx9 + 4 | 0; //@line 8118
  HEAP32[$4 >> 2] = $2; //@line 8119
  sp = STACKTOP; //@line 8120
  return;
 }
 ___async_unwind = 0; //@line 8123
 HEAP32[$ReallocAsyncCtx9 >> 2] = 14; //@line 8124
 $4 = $ReallocAsyncCtx9 + 4 | 0; //@line 8125
 HEAP32[$4 >> 2] = $2; //@line 8126
 sp = STACKTOP; //@line 8127
 return;
}
function _mbed_die__async_cb_8($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx8 = 0, sp = 0;
 sp = STACKTOP; //@line 8083
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 8085
 _emscripten_asm_const_iii(0, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 8087
 $ReallocAsyncCtx8 = _emscripten_realloc_async_context(8) | 0; //@line 8088
 _wait_ms(400); //@line 8089
 if (___async) {
  HEAP32[$ReallocAsyncCtx8 >> 2] = 15; //@line 8092
  $4 = $ReallocAsyncCtx8 + 4 | 0; //@line 8093
  HEAP32[$4 >> 2] = $2; //@line 8094
  sp = STACKTOP; //@line 8095
  return;
 }
 ___async_unwind = 0; //@line 8098
 HEAP32[$ReallocAsyncCtx8 >> 2] = 15; //@line 8099
 $4 = $ReallocAsyncCtx8 + 4 | 0; //@line 8100
 HEAP32[$4 >> 2] = $2; //@line 8101
 sp = STACKTOP; //@line 8102
 return;
}
function _mbed_die__async_cb_7($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx7 = 0, sp = 0;
 sp = STACKTOP; //@line 8058
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 8060
 _emscripten_asm_const_iii(0, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 8062
 $ReallocAsyncCtx7 = _emscripten_realloc_async_context(8) | 0; //@line 8063
 _wait_ms(400); //@line 8064
 if (___async) {
  HEAP32[$ReallocAsyncCtx7 >> 2] = 16; //@line 8067
  $4 = $ReallocAsyncCtx7 + 4 | 0; //@line 8068
  HEAP32[$4 >> 2] = $2; //@line 8069
  sp = STACKTOP; //@line 8070
  return;
 }
 ___async_unwind = 0; //@line 8073
 HEAP32[$ReallocAsyncCtx7 >> 2] = 16; //@line 8074
 $4 = $ReallocAsyncCtx7 + 4 | 0; //@line 8075
 HEAP32[$4 >> 2] = $2; //@line 8076
 sp = STACKTOP; //@line 8077
 return;
}
function _mbed_die__async_cb_6($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx6 = 0, sp = 0;
 sp = STACKTOP; //@line 8033
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 8035
 _emscripten_asm_const_iii(0, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 8037
 $ReallocAsyncCtx6 = _emscripten_realloc_async_context(8) | 0; //@line 8038
 _wait_ms(400); //@line 8039
 if (___async) {
  HEAP32[$ReallocAsyncCtx6 >> 2] = 17; //@line 8042
  $4 = $ReallocAsyncCtx6 + 4 | 0; //@line 8043
  HEAP32[$4 >> 2] = $2; //@line 8044
  sp = STACKTOP; //@line 8045
  return;
 }
 ___async_unwind = 0; //@line 8048
 HEAP32[$ReallocAsyncCtx6 >> 2] = 17; //@line 8049
 $4 = $ReallocAsyncCtx6 + 4 | 0; //@line 8050
 HEAP32[$4 >> 2] = $2; //@line 8051
 sp = STACKTOP; //@line 8052
 return;
}
function _mbed_die__async_cb_5($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx5 = 0, sp = 0;
 sp = STACKTOP; //@line 8008
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 8010
 _emscripten_asm_const_iii(0, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 8012
 $ReallocAsyncCtx5 = _emscripten_realloc_async_context(8) | 0; //@line 8013
 _wait_ms(400); //@line 8014
 if (___async) {
  HEAP32[$ReallocAsyncCtx5 >> 2] = 18; //@line 8017
  $4 = $ReallocAsyncCtx5 + 4 | 0; //@line 8018
  HEAP32[$4 >> 2] = $2; //@line 8019
  sp = STACKTOP; //@line 8020
  return;
 }
 ___async_unwind = 0; //@line 8023
 HEAP32[$ReallocAsyncCtx5 >> 2] = 18; //@line 8024
 $4 = $ReallocAsyncCtx5 + 4 | 0; //@line 8025
 HEAP32[$4 >> 2] = $2; //@line 8026
 sp = STACKTOP; //@line 8027
 return;
}
function _mbed_die__async_cb_4($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx4 = 0, sp = 0;
 sp = STACKTOP; //@line 7983
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 7985
 _emscripten_asm_const_iii(0, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 7987
 $ReallocAsyncCtx4 = _emscripten_realloc_async_context(8) | 0; //@line 7988
 _wait_ms(400); //@line 7989
 if (___async) {
  HEAP32[$ReallocAsyncCtx4 >> 2] = 19; //@line 7992
  $4 = $ReallocAsyncCtx4 + 4 | 0; //@line 7993
  HEAP32[$4 >> 2] = $2; //@line 7994
  sp = STACKTOP; //@line 7995
  return;
 }
 ___async_unwind = 0; //@line 7998
 HEAP32[$ReallocAsyncCtx4 >> 2] = 19; //@line 7999
 $4 = $ReallocAsyncCtx4 + 4 | 0; //@line 8000
 HEAP32[$4 >> 2] = $2; //@line 8001
 sp = STACKTOP; //@line 8002
 return;
}
function _mbed_die__async_cb_3($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 7958
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 7960
 _emscripten_asm_const_iii(0, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 7962
 $ReallocAsyncCtx3 = _emscripten_realloc_async_context(8) | 0; //@line 7963
 _wait_ms(400); //@line 7964
 if (___async) {
  HEAP32[$ReallocAsyncCtx3 >> 2] = 20; //@line 7967
  $4 = $ReallocAsyncCtx3 + 4 | 0; //@line 7968
  HEAP32[$4 >> 2] = $2; //@line 7969
  sp = STACKTOP; //@line 7970
  return;
 }
 ___async_unwind = 0; //@line 7973
 HEAP32[$ReallocAsyncCtx3 >> 2] = 20; //@line 7974
 $4 = $ReallocAsyncCtx3 + 4 | 0; //@line 7975
 HEAP32[$4 >> 2] = $2; //@line 7976
 sp = STACKTOP; //@line 7977
 return;
}
function _mbed_die__async_cb_2($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 7933
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 7935
 _emscripten_asm_const_iii(0, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 7937
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(8) | 0; //@line 7938
 _wait_ms(400); //@line 7939
 if (___async) {
  HEAP32[$ReallocAsyncCtx2 >> 2] = 21; //@line 7942
  $4 = $ReallocAsyncCtx2 + 4 | 0; //@line 7943
  HEAP32[$4 >> 2] = $2; //@line 7944
  sp = STACKTOP; //@line 7945
  return;
 }
 ___async_unwind = 0; //@line 7948
 HEAP32[$ReallocAsyncCtx2 >> 2] = 21; //@line 7949
 $4 = $ReallocAsyncCtx2 + 4 | 0; //@line 7950
 HEAP32[$4 >> 2] = $2; //@line 7951
 sp = STACKTOP; //@line 7952
 return;
}
function _mbed_die__async_cb_1($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 7908
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 7910
 _emscripten_asm_const_iii(0, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 7912
 $ReallocAsyncCtx = _emscripten_realloc_async_context(8) | 0; //@line 7913
 _wait_ms(400); //@line 7914
 if (___async) {
  HEAP32[$ReallocAsyncCtx >> 2] = 22; //@line 7917
  $4 = $ReallocAsyncCtx + 4 | 0; //@line 7918
  HEAP32[$4 >> 2] = $2; //@line 7919
  sp = STACKTOP; //@line 7920
  return;
 }
 ___async_unwind = 0; //@line 7923
 HEAP32[$ReallocAsyncCtx >> 2] = 22; //@line 7924
 $4 = $ReallocAsyncCtx + 4 | 0; //@line 7925
 HEAP32[$4 >> 2] = $2; //@line 7926
 sp = STACKTOP; //@line 7927
 return;
}
function _sbrk(increment) {
 increment = increment | 0;
 var oldDynamicTop = 0, newDynamicTop = 0;
 oldDynamicTop = HEAP32[DYNAMICTOP_PTR >> 2] | 0; //@line 9158
 newDynamicTop = oldDynamicTop + increment | 0; //@line 9159
 if ((increment | 0) > 0 & (newDynamicTop | 0) < (oldDynamicTop | 0) | (newDynamicTop | 0) < 0) {
  abortOnCannotGrowMemory() | 0; //@line 9163
  ___setErrNo(12); //@line 9164
  return -1;
 }
 HEAP32[DYNAMICTOP_PTR >> 2] = newDynamicTop; //@line 9168
 if ((newDynamicTop | 0) > (getTotalMemory() | 0)) {
  if (!(enlargeMemory() | 0)) {
   HEAP32[DYNAMICTOP_PTR >> 2] = oldDynamicTop; //@line 9172
   ___setErrNo(12); //@line 9173
   return -1;
  }
 }
 return oldDynamicTop | 0; //@line 9177
}
function _fmt_x($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $$05$lcssa = 0, $$056 = 0, $14 = 0, $15 = 0, $8 = 0;
 if (($0 | 0) == 0 & ($1 | 0) == 0) {
  $$05$lcssa = $2; //@line 5707
 } else {
  $$056 = $2; //@line 5709
  $15 = $1; //@line 5709
  $8 = $0; //@line 5709
  while (1) {
   $14 = $$056 + -1 | 0; //@line 5717
   HEAP8[$14 >> 0] = HEAPU8[1334 + ($8 & 15) >> 0] | 0 | $3; //@line 5718
   $8 = _bitshift64Lshr($8 | 0, $15 | 0, 4) | 0; //@line 5719
   $15 = tempRet0; //@line 5720
   if (($8 | 0) == 0 & ($15 | 0) == 0) {
    $$05$lcssa = $14; //@line 5725
    break;
   } else {
    $$056 = $14; //@line 5728
   }
  }
 }
 return $$05$lcssa | 0; //@line 5732
}
function ___stdout_write($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $14 = 0, $vararg_buffer = 0, sp = 0;
 sp = STACKTOP; //@line 3845
 STACKTOP = STACKTOP + 32 | 0; //@line 3846
 $vararg_buffer = sp; //@line 3847
 HEAP32[$0 + 36 >> 2] = 4; //@line 3850
 if (!(HEAP32[$0 >> 2] & 64)) {
  HEAP32[$vararg_buffer >> 2] = HEAP32[$0 + 60 >> 2]; //@line 3858
  HEAP32[$vararg_buffer + 4 >> 2] = 21523; //@line 3860
  HEAP32[$vararg_buffer + 8 >> 2] = sp + 16; //@line 3862
  if (___syscall54(54, $vararg_buffer | 0) | 0) {
   HEAP8[$0 + 75 >> 0] = -1; //@line 3867
  }
 }
 $14 = ___stdio_write($0, $1, $2) | 0; //@line 3870
 STACKTOP = sp; //@line 3871
 return $14 | 0; //@line 3871
}
function ___towrite($0) {
 $0 = $0 | 0;
 var $$0 = 0, $1 = 0, $14 = 0, $3 = 0, $7 = 0;
 $1 = $0 + 74 | 0; //@line 3940
 $3 = HEAP8[$1 >> 0] | 0; //@line 3942
 HEAP8[$1 >> 0] = $3 + 255 | $3; //@line 3946
 $7 = HEAP32[$0 >> 2] | 0; //@line 3947
 if (!($7 & 8)) {
  HEAP32[$0 + 8 >> 2] = 0; //@line 3952
  HEAP32[$0 + 4 >> 2] = 0; //@line 3954
  $14 = HEAP32[$0 + 44 >> 2] | 0; //@line 3956
  HEAP32[$0 + 28 >> 2] = $14; //@line 3958
  HEAP32[$0 + 20 >> 2] = $14; //@line 3960
  HEAP32[$0 + 16 >> 2] = $14 + (HEAP32[$0 + 48 >> 2] | 0); //@line 3966
  $$0 = 0; //@line 3967
 } else {
  HEAP32[$0 >> 2] = $7 | 32; //@line 3970
  $$0 = -1; //@line 3971
 }
 return $$0 | 0; //@line 3973
}
function _fmt_o($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$0$lcssa = 0, $$06 = 0, $10 = 0, $11 = 0, $7 = 0;
 if (($0 | 0) == 0 & ($1 | 0) == 0) {
  $$0$lcssa = $2; //@line 5744
 } else {
  $$06 = $2; //@line 5746
  $11 = $1; //@line 5746
  $7 = $0; //@line 5746
  while (1) {
   $10 = $$06 + -1 | 0; //@line 5751
   HEAP8[$10 >> 0] = $7 & 7 | 48; //@line 5752
   $7 = _bitshift64Lshr($7 | 0, $11 | 0, 3) | 0; //@line 5753
   $11 = tempRet0; //@line 5754
   if (($7 | 0) == 0 & ($11 | 0) == 0) {
    $$0$lcssa = $10; //@line 5759
    break;
   } else {
    $$06 = $10; //@line 5762
   }
  }
 }
 return $$0$lcssa | 0; //@line 5766
}
function ___cxa_is_pointer_type($0) {
 $0 = $0 | 0;
 var $2 = 0, $3 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 7850
 do {
  if (!$0) {
   $3 = 0; //@line 7854
  } else {
   $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 7856
   $2 = ___dynamic_cast($0, 24, 80, 0) | 0; //@line 7857
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 38; //@line 7860
    sp = STACKTOP; //@line 7861
    return 0; //@line 7862
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 7864
    $3 = ($2 | 0) != 0 & 1; //@line 7867
    break;
   }
  }
 } while (0);
 return $3 | 0; //@line 7872
}
function _invoke_ticker__async_cb_18($0) {
 $0 = $0 | 0;
 var $5 = 0, $6 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 8515
 $5 = HEAP32[HEAP32[HEAP32[$0 + 4 >> 2] >> 2] >> 2] | 0; //@line 8521
 $6 = HEAP32[$0 + 8 >> 2] | 0; //@line 8522
 $ReallocAsyncCtx = _emscripten_realloc_async_context(4) | 0; //@line 8523
 FUNCTION_TABLE_vi[$5 & 63]($6); //@line 8524
 if (___async) {
  HEAP32[$ReallocAsyncCtx >> 2] = 24; //@line 8527
  sp = STACKTOP; //@line 8528
  return;
 }
 ___async_unwind = 0; //@line 8531
 HEAP32[$ReallocAsyncCtx >> 2] = 24; //@line 8532
 sp = STACKTOP; //@line 8533
 return;
}
function _getint_671($0) {
 $0 = $0 | 0;
 var $$0$lcssa = 0, $$04 = 0, $11 = 0, $12 = 0, $7 = 0;
 if (!(_isdigit(HEAP8[HEAP32[$0 >> 2] >> 0] | 0) | 0)) {
  $$0$lcssa = 0; //@line 5388
 } else {
  $$04 = 0; //@line 5390
  while (1) {
   $7 = HEAP32[$0 >> 2] | 0; //@line 5393
   $11 = ($$04 * 10 | 0) + -48 + (HEAP8[$7 >> 0] | 0) | 0; //@line 5397
   $12 = $7 + 1 | 0; //@line 5398
   HEAP32[$0 >> 2] = $12; //@line 5399
   if (!(_isdigit(HEAP8[$12 >> 0] | 0) | 0)) {
    $$0$lcssa = $11; //@line 5405
    break;
   } else {
    $$04 = $11; //@line 5408
   }
  }
 }
 return $$0$lcssa | 0; //@line 5412
}
function _emscripten_async_resume() {
 ___async = 0; //@line 9009
 ___async_unwind = 1; //@line 9010
 while (1) {
  if (!___async_cur_frame) return;
  dynCall_vi(HEAP32[___async_cur_frame + 8 >> 2] | 0, ___async_cur_frame + 8 | 0); //@line 9016
  if (___async) return;
  if (!___async_unwind) {
   ___async_unwind = 1; //@line 9020
   continue;
  }
  stackRestore(HEAP32[___async_cur_frame + 4 >> 2] | 0); //@line 9024
  ___async_cur_frame = HEAP32[___async_cur_frame >> 2] | 0; //@line 9026
 }
}
function ___uremdi3($a$0, $a$1, $b$0, $b$1) {
 $a$0 = $a$0 | 0;
 $a$1 = $a$1 | 0;
 $b$0 = $b$0 | 0;
 $b$1 = $b$1 | 0;
 var $rem = 0, __stackBase__ = 0;
 __stackBase__ = STACKTOP; //@line 8952
 STACKTOP = STACKTOP + 16 | 0; //@line 8953
 $rem = __stackBase__ | 0; //@line 8954
 ___udivmoddi4($a$0, $a$1, $b$0, $b$1, $rem) | 0; //@line 8955
 STACKTOP = __stackBase__; //@line 8956
 return (tempRet0 = HEAP32[$rem + 4 >> 2] | 0, HEAP32[$rem >> 2] | 0) | 0; //@line 8957
}
function _llvm_cttz_i32(x) {
 x = x | 0;
 var ret = 0;
 ret = HEAP8[cttz_i8 + (x & 255) >> 0] | 0; //@line 8722
 if ((ret | 0) < 8) return ret | 0; //@line 8723
 ret = HEAP8[cttz_i8 + (x >> 8 & 255) >> 0] | 0; //@line 8724
 if ((ret | 0) < 8) return ret + 8 | 0; //@line 8725
 ret = HEAP8[cttz_i8 + (x >> 16 & 255) >> 0] | 0; //@line 8726
 if ((ret | 0) < 8) return ret + 16 | 0; //@line 8727
 return (HEAP8[cttz_i8 + (x >>> 24) >> 0] | 0) + 24 | 0; //@line 8728
}
function __ZNK10__cxxabiv117__class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($0, $1, $2, $3, $4, $5) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 $5 = $5 | 0;
 if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, $5) | 0) {
  __ZNK10__cxxabiv117__class_type_info29process_static_type_above_dstEPNS_19__dynamic_cast_infoEPKvS4_i(0, $1, $2, $3, $4); //@line 7235
 }
 return;
}
function __ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv__async_cb($0) {
 $0 = $0 | 0;
 var $$0 = 0, $2 = 0;
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 8436
 if ((HEAP32[$2 + 24 >> 2] | 0) == 1) {
  HEAP32[HEAP32[$0 + 8 >> 2] >> 2] = HEAP32[$2 + 16 >> 2]; //@line 8447
  $$0 = 1; //@line 8448
 } else {
  $$0 = 0; //@line 8450
 }
 HEAP8[___async_retval >> 0] = $$0 & 1; //@line 8454
 return;
}
function ___stdio_close($0) {
 $0 = $0 | 0;
 var $5 = 0, $vararg_buffer = 0, sp = 0;
 sp = STACKTOP; //@line 3656
 STACKTOP = STACKTOP + 16 | 0; //@line 3657
 $vararg_buffer = sp; //@line 3658
 HEAP32[$vararg_buffer >> 2] = _dummy(HEAP32[$0 + 60 >> 2] | 0) | 0; //@line 3662
 $5 = ___syscall_ret(___syscall6(6, $vararg_buffer | 0) | 0) | 0; //@line 3664
 STACKTOP = sp; //@line 3665
 return $5 | 0; //@line 3665
}
function __ZNK10__cxxabiv117__class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, 0) | 0) {
  __ZNK10__cxxabiv117__class_type_info24process_found_base_classEPNS_19__dynamic_cast_infoEPvi(0, $1, $2, $3); //@line 7311
 }
 return;
}
function _wait_ms($0) {
 $0 = $0 | 0;
 var $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 455
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 456
 _emscripten_sleep($0 | 0); //@line 457
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 25; //@line 460
  sp = STACKTOP; //@line 461
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 464
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
  $7 = $1 + 28 | 0; //@line 7375
  if ((HEAP32[$7 >> 2] | 0) != 1) {
   HEAP32[$7 >> 2] = $3; //@line 7379
  }
 }
 return;
}
function _emscripten_alloc_async_context(len, sp) {
 len = len | 0;
 sp = sp | 0;
 var new_frame = 0;
 new_frame = stackAlloc(len + 8 | 0) | 0; //@line 8986
 HEAP32[new_frame + 4 >> 2] = sp; //@line 8988
 HEAP32[new_frame >> 2] = ___async_cur_frame; //@line 8990
 ___async_cur_frame = new_frame; //@line 8991
 return ___async_cur_frame + 8 | 0; //@line 8992
}
function ___cxa_can_catch__async_cb($0) {
 $0 = $0 | 0;
 var $AsyncRetVal = 0;
 $AsyncRetVal = HEAP8[___async_retval >> 0] & 1; //@line 8298
 if ($AsyncRetVal) {
  HEAP32[HEAP32[$0 + 8 >> 2] >> 2] = HEAP32[HEAP32[$0 + 4 >> 2] >> 2]; //@line 8302
 }
 HEAP32[___async_retval >> 2] = $AsyncRetVal & 1; //@line 8305
 return;
}
function _bitshift64Shl(low, high, bits) {
 low = low | 0;
 high = high | 0;
 bits = bits | 0;
 if ((bits | 0) < 32) {
  tempRet0 = high << bits | (low & (1 << bits) - 1 << 32 - bits) >>> 32 - bits; //@line 8975
  return low << bits; //@line 8976
 }
 tempRet0 = low << bits - 32; //@line 8978
 return 0; //@line 8979
}
function _bitshift64Lshr(low, high, bits) {
 low = low | 0;
 high = high | 0;
 bits = bits | 0;
 if ((bits | 0) < 32) {
  tempRet0 = high >>> bits; //@line 8964
  return low >>> bits | (high & (1 << bits) - 1) << 32 - bits; //@line 8965
 }
 tempRet0 = 0; //@line 8967
 return high >>> bits - 32 | 0; //@line 8968
}
function __GLOBAL__sub_I_main_cpp() {
 HEAP32[858] = 0; //@line 471
 HEAP32[859] = 0; //@line 471
 HEAP32[860] = 0; //@line 471
 HEAP32[861] = 0; //@line 471
 HEAP32[862] = 0; //@line 471
 HEAP32[863] = 0; //@line 471
 _gpio_init_out(3432, 50); //@line 472
 return;
}
function ___lctrans_impl($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0 = 0;
 if (!$1) {
  $$0 = 0; //@line 4070
 } else {
  $$0 = ___mo_lookup(HEAP32[$1 >> 2] | 0, HEAP32[$1 + 4 >> 2] | 0, $0) | 0; //@line 4076
 }
 return ($$0 | 0 ? $$0 : $0) | 0; //@line 4080
}
function dynCall_viiiiii(index, a1, a2, a3, a4, a5, a6) {
 index = index | 0;
 a1 = a1 | 0;
 a2 = a2 | 0;
 a3 = a3 | 0;
 a4 = a4 | 0;
 a5 = a5 | 0;
 a6 = a6 | 0;
 FUNCTION_TABLE_viiiiii[index & 3](a1 | 0, a2 | 0, a3 | 0, a4 | 0, a5 | 0, a6 | 0); //@line 9219
}
function ___DOUBLE_BITS_677($0) {
 $0 = +$0;
 var $1 = 0;
 HEAPF64[tempDoublePtr >> 3] = $0; //@line 6829
 $1 = HEAP32[tempDoublePtr >> 2] | 0; //@line 6829
 tempRet0 = HEAP32[tempDoublePtr + 4 >> 2] | 0; //@line 6831
 return $1 | 0; //@line 6832
}
function ___syscall_ret($0) {
 $0 = $0 | 0;
 var $$0 = 0;
 if ($0 >>> 0 > 4294963200) {
  HEAP32[(___errno_location() | 0) >> 2] = 0 - $0; //@line 3822
  $$0 = -1; //@line 3823
 } else {
  $$0 = $0; //@line 3825
 }
 return $$0 | 0; //@line 3827
}
function _gpio_init_out($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 HEAP32[$0 >> 2] = $1; //@line 385
 if (($1 | 0) == -1) {
  return;
 }
 HEAP32[$0 + 4 >> 2] = $1; //@line 391
 _emscripten_asm_const_iii(1, $0 | 0, $1 | 0) | 0; //@line 392
 return;
}
function _i64Subtract(a, b, c, d) {
 a = a | 0;
 b = b | 0;
 c = c | 0;
 d = d | 0;
 var h = 0;
 h = b - d >>> 0; //@line 8715
 h = b - d - (c >>> 0 > a >>> 0 | 0) >>> 0; //@line 8716
 return (tempRet0 = h, a - c >>> 0 | 0) | 0; //@line 8717
}
function runPostSets() {}
function _i64Add(a, b, c, d) {
 a = a | 0;
 b = b | 0;
 c = c | 0;
 d = d | 0;
 var l = 0;
 l = a + c >>> 0; //@line 8707
 return (tempRet0 = b + d + (l >>> 0 < a >>> 0 | 0) >>> 0, l | 0) | 0; //@line 8709
}
function dynCall_viiiii(index, a1, a2, a3, a4, a5) {
 index = index | 0;
 a1 = a1 | 0;
 a2 = a2 | 0;
 a3 = a3 | 0;
 a4 = a4 | 0;
 a5 = a5 | 0;
 FUNCTION_TABLE_viiiii[index & 3](a1 | 0, a2 | 0, a3 | 0, a4 | 0, a5 | 0); //@line 9212
}
function dynCall_viiii(index, a1, a2, a3, a4) {
 index = index | 0;
 a1 = a1 | 0;
 a2 = a2 | 0;
 a3 = a3 | 0;
 a4 = a4 | 0;
 FUNCTION_TABLE_viiii[index & 3](a1 | 0, a2 | 0, a3 | 0, a4 | 0); //@line 9205
}
function stackAlloc(size) {
 size = size | 0;
 var ret = 0;
 ret = STACKTOP; //@line 4
 STACKTOP = STACKTOP + size | 0; //@line 5
 STACKTOP = STACKTOP + 15 & -16; //@line 6
 return ret | 0; //@line 8
}
function _wctomb($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0 = 0;
 if (!$0) {
  $$0 = 0; //@line 5889
 } else {
  $$0 = _wcrtomb($0, $1, 0) | 0; //@line 5892
 }
 return $$0 | 0; //@line 5894
}
function _emscripten_free_async_context(ctx) {
 ctx = ctx | 0;
 stackRestore(___async_cur_frame | 0); //@line 8998
 ___async_cur_frame = HEAP32[___async_cur_frame >> 2] | 0; //@line 8999
}
function dynCall_iiii(index, a1, a2, a3) {
 index = index | 0;
 a1 = a1 | 0;
 a2 = a2 | 0;
 a3 = a3 | 0;
 return FUNCTION_TABLE_iiii[index & 7](a1 | 0, a2 | 0, a3 | 0) | 0; //@line 9191
}
function ___udivdi3($a$0, $a$1, $b$0, $b$1) {
 $a$0 = $a$0 | 0;
 $a$1 = $a$1 | 0;
 $b$0 = $b$0 | 0;
 $b$1 = $b$1 | 0;
 return ___udivmoddi4($a$0, $a$1, $b$0, $b$1, 0) | 0; //@line 8944
}
function ___dynamic_cast__async_cb($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = (HEAP32[HEAP32[$0 + 4 >> 2] >> 2] | 0) == 1 ? HEAP32[$0 + 8 >> 2] | 0 : 0; //@line 8580
 return;
}
function _emscripten_realloc_async_context(len) {
 len = len | 0;
 stackRestore(___async_cur_frame | 0); //@line 9004
 return (stackAlloc(len + 8 | 0) | 0) + 8 | 0; //@line 9005
}
function establishStackSpace(stackBase, stackMax) {
 stackBase = stackBase | 0;
 stackMax = stackMax | 0;
 STACKTOP = stackBase; //@line 20
 STACK_MAX = stackMax; //@line 21
}
function _swapc($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $3 = 0;
 $3 = _llvm_bswap_i32($0 | 0) | 0; //@line 4206
 return (($1 | 0) == 0 ? $0 : $3) | 0; //@line 4208
}
function __ZN10__cxxabiv120__si_class_type_infoD0Ev($0) {
 $0 = $0 | 0;
 __ZN10__cxxabiv116__shim_type_infoD2Ev($0); //@line 7597
 __ZdlPv($0); //@line 7598
 return;
}
function __ZN10__cxxabiv117__class_type_infoD0Ev($0) {
 $0 = $0 | 0;
 __ZN10__cxxabiv116__shim_type_infoD2Ev($0); //@line 7125
 __ZdlPv($0); //@line 7126
 return;
}
function setThrew(threw, value) {
 threw = threw | 0;
 value = value | 0;
 if (!__THREW__) {
  __THREW__ = threw; //@line 31
  threwValue = value; //@line 32
 }
}
function _out_670($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 if (!(HEAP32[$0 >> 2] & 32)) {
  ___fwritex($1, $2, $0) | 0; //@line 5374
 }
 return;
}
function ___cxa_is_pointer_type__async_cb($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = (HEAP32[___async_retval >> 2] | 0) != 0 & 1; //@line 8551
 return;
}
function __ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 return ($0 | 0) == ($1 | 0) | 0; //@line 7322
}
function __ZNK10__cxxabiv120__si_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function b5(p0, p1, p2, p3, p4, p5) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 p3 = p3 | 0;
 p4 = p4 | 0;
 p5 = p5 | 0;
 abort(5); //@line 9238
}
function _llvm_bswap_i32(x) {
 x = x | 0;
 return (x & 255) << 24 | (x >> 8 & 255) << 16 | (x >> 16 & 255) << 8 | x >>> 24 | 0; //@line 9031
}
function __ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_16($0) {
 $0 = $0 | 0;
 return;
}
function __ZNK10__cxxabiv120__si_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function _strerror($0) {
 $0 = $0 | 0;
 return ___strerror_l($0, HEAP32[(___pthread_self_85() | 0) + 188 >> 2] | 0) | 0; //@line 5837
}
function _printf__async_cb($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = HEAP32[___async_retval >> 2]; //@line 8563
 return;
}
function dynCall_ii(index, a1) {
 index = index | 0;
 a1 = a1 | 0;
 return FUNCTION_TABLE_ii[index & 1](a1 | 0) | 0; //@line 9184
}
function b4(p0, p1, p2, p3, p4) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 p3 = p3 | 0;
 p4 = p4 | 0;
 abort(4); //@line 9235
}
function dynCall_vi(index, a1) {
 index = index | 0;
 a1 = a1 | 0;
 FUNCTION_TABLE_vi[index & 63](a1 | 0); //@line 9198
}
function b1(p0, p1, p2) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 abort(1); //@line 9226
 return 0; //@line 9226
}
function b3(p0, p1, p2, p3) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 p3 = p3 | 0;
 abort(3); //@line 9232
}
function ___lctrans($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 return ___lctrans_impl($0, $1) | 0; //@line 7082
}
function _mbed_error_printf($0, $varargs) {
 $0 = $0 | 0;
 $varargs = $varargs | 0;
 return;
}
function _isdigit($0) {
 $0 = $0 | 0;
 return ($0 + -48 | 0) >>> 0 < 10 | 0; //@line 3880
}
function __ZNK10__cxxabiv116__shim_type_info5noop2Ev($0) {
 $0 = $0 | 0;
 return;
}
function __ZNK10__cxxabiv116__shim_type_info5noop1Ev($0) {
 $0 = $0 | 0;
 return;
}
function setTempRet0(value) {
 value = value | 0;
 tempRet0 = value; //@line 38
}
function b0(p0) {
 p0 = p0 | 0;
 abort(0); //@line 9223
 return 0; //@line 9223
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
 return _pthread_self() | 0; //@line 7003
}
function ___pthread_self_85() {
 return _pthread_self() | 0; //@line 7009
}
function stackRestore(top) {
 top = top | 0;
 STACKTOP = top; //@line 15
}
function __ZdlPv($0) {
 $0 = $0 | 0;
 _free($0); //@line 7112
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
function _dummy($0) {
 $0 = $0 | 0;
 return $0 | 0; //@line 3838
}
function ___lockfile($0) {
 $0 = $0 | 0;
 return 0; //@line 3933
}
function _invoke_ticker__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function __ZNSt9type_infoD2Ev($0) {
 $0 = $0 | 0;
 return;
}
function getTempRet0() {
 return tempRet0 | 0; //@line 41
}
function ___errno_location() {
 return 4016; //@line 3832
}
function _wait_ms__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function stackSave() {
 return STACKTOP | 0; //@line 11
}
function b2(p0) {
 p0 = p0 | 0;
 abort(2); //@line 9229
}
function _core_util_critical_section_enter() {
 return;
}
function _pthread_self() {
 return 224; //@line 3885
}
function ___unlockfile($0) {
 $0 = $0 | 0;
 return;
}
function setAsync() {
 ___async = 1; //@line 25
}

// EMSCRIPTEN_END_FUNCS
var FUNCTION_TABLE_ii = [b0,___stdio_close];
var FUNCTION_TABLE_iiii = [b1,___stdout_write,___stdio_seek,__ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv,___stdio_write,b1,b1,b1];
var FUNCTION_TABLE_vi = [b2,__ZN10__cxxabiv116__shim_type_infoD2Ev,__ZN10__cxxabiv117__class_type_infoD0Ev,__ZNK10__cxxabiv116__shim_type_info5noop1Ev,__ZNK10__cxxabiv116__shim_type_info5noop2Ev,__ZN10__cxxabiv120__si_class_type_infoD0Ev,_mbed_assert_internal__async_cb,_mbed_die__async_cb_15,_mbed_die__async_cb_14,_mbed_die__async_cb_13,_mbed_die__async_cb_12,_mbed_die__async_cb_11,_mbed_die__async_cb_10,_mbed_die__async_cb_9,_mbed_die__async_cb_8,_mbed_die__async_cb_7,_mbed_die__async_cb_6,_mbed_die__async_cb_5,_mbed_die__async_cb_4,_mbed_die__async_cb_3,_mbed_die__async_cb_2,_mbed_die__async_cb_1,_mbed_die__async_cb,_invoke_ticker__async_cb_18,_invoke_ticker__async_cb,_wait_ms__async_cb,_main__async_cb,_vfprintf__async_cb,_printf__async_cb
,__ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv__async_cb_17,__ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv__async_cb,___dynamic_cast__async_cb,___dynamic_cast__async_cb_19,__ZNK10__cxxabiv120__si_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb,__ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb,__ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_16,__ZNK10__cxxabiv120__si_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb,___cxa_can_catch__async_cb,___cxa_is_pointer_type__async_cb,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2
,b2,b2,b2,b2,b2];
var FUNCTION_TABLE_viiii = [b3,__ZNK10__cxxabiv117__class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi,__ZNK10__cxxabiv120__si_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi,b3];
var FUNCTION_TABLE_viiiii = [b4,__ZNK10__cxxabiv117__class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib,__ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib,b4];
var FUNCTION_TABLE_viiiiii = [b5,__ZNK10__cxxabiv117__class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib,__ZNK10__cxxabiv120__si_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib,b5];

  return { __GLOBAL__sub_I_main_cpp: __GLOBAL__sub_I_main_cpp, ___cxa_can_catch: ___cxa_can_catch, ___cxa_is_pointer_type: ___cxa_is_pointer_type, ___errno_location: ___errno_location, ___udivdi3: ___udivdi3, ___uremdi3: ___uremdi3, _bitshift64Lshr: _bitshift64Lshr, _bitshift64Shl: _bitshift64Shl, _emscripten_alloc_async_context: _emscripten_alloc_async_context, _emscripten_async_resume: _emscripten_async_resume, _emscripten_free_async_context: _emscripten_free_async_context, _emscripten_realloc_async_context: _emscripten_realloc_async_context, _free: _free, _handle_interrupt_in: _handle_interrupt_in, _i64Add: _i64Add, _i64Subtract: _i64Subtract, _invoke_ticker: _invoke_ticker, _llvm_bswap_i32: _llvm_bswap_i32, _main: _main, _malloc: _malloc, _memcpy: _memcpy, _memset: _memset, _sbrk: _sbrk, dynCall_ii: dynCall_ii, dynCall_iiii: dynCall_iiii, dynCall_vi: dynCall_vi, dynCall_viiii: dynCall_viiii, dynCall_viiiii: dynCall_viiiii, dynCall_viiiiii: dynCall_viiiiii, establishStackSpace: establishStackSpace, getTempRet0: getTempRet0, runPostSets: runPostSets, setAsync: setAsync, setTempRet0: setTempRet0, setThrew: setThrew, stackAlloc: stackAlloc, stackRestore: stackRestore, stackSave: stackSave };
})
// EMSCRIPTEN_END_ASM
(Module.asmGlobalArg, Module.asmLibraryArg, buffer);

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
var _free = Module["_free"] = asm["_free"];
var _handle_interrupt_in = Module["_handle_interrupt_in"] = asm["_handle_interrupt_in"];
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
var dynCall_ii = Module["dynCall_ii"] = asm["dynCall_ii"];
var dynCall_iiii = Module["dynCall_iiii"] = asm["dynCall_iiii"];
var dynCall_vi = Module["dynCall_vi"] = asm["dynCall_vi"];
var dynCall_viiii = Module["dynCall_viiii"] = asm["dynCall_viiii"];
var dynCall_viiiii = Module["dynCall_viiiii"] = asm["dynCall_viiiii"];
var dynCall_viiiiii = Module["dynCall_viiiiii"] = asm["dynCall_viiiiii"];
;



// === Auto-generated postamble setup entry stuff ===

Module['asm'] = asm;


































































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
}
Module['run'] = run;


function exit(status, implicit) {

  // if this is just main exit-ing implicitly, and the status is 0, then we
  // don't need to do anything here and can just leave. if the status is
  // non-zero, though, then we need to report it.
  // (we may have warned about this earlier, if a situation justifies doing so)
  if (implicit && Module['noExitRuntime'] && status === 0) {
    return;
  }

  if (Module['noExitRuntime']) {
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

  throw 'abort(' + what + '). Build with -s ASSERTIONS=1 for more info.';
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
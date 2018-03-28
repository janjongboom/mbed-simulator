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
 function($0, $1) { MbedJSHal.gpio.init_out($0, $1, 0); }];

function _emscripten_asm_const_iii(code, a0, a1) {
  return ASM_CONSTS[code](a0, a1);
}




STATIC_BASE = GLOBAL_BASE;

STATICTOP = STATIC_BASE + 1360;
/* global initializers */  __ATINIT__.push({ func: function() { __GLOBAL__sub_I_main_cpp() } });


memoryInitializer = "busout.js.mem";





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

Module.asmLibraryArg = { "abort": abort, "assert": assert, "enlargeMemory": enlargeMemory, "getTotalMemory": getTotalMemory, "abortOnCannotGrowMemory": abortOnCannotGrowMemory, "invoke_iiii": invoke_iiii, "invoke_v": invoke_v, "invoke_vi": invoke_vi, "invoke_viiii": invoke_viiii, "invoke_viiiii": invoke_viiiii, "invoke_viiiiii": invoke_viiiiii, "__ZSt18uncaught_exceptionv": __ZSt18uncaught_exceptionv, "___cxa_find_matching_catch": ___cxa_find_matching_catch, "___gxx_personality_v0": ___gxx_personality_v0, "___resumeException": ___resumeException, "___setErrNo": ___setErrNo, "_abort": _abort, "_emscripten_asm_const_iii": _emscripten_asm_const_iii, "_emscripten_get_now": _emscripten_get_now, "_emscripten_memcpy_big": _emscripten_memcpy_big, "_emscripten_set_main_loop": _emscripten_set_main_loop, "_emscripten_set_main_loop_timing": _emscripten_set_main_loop_timing, "_emscripten_sleep": _emscripten_sleep, "DYNAMICTOP_PTR": DYNAMICTOP_PTR, "tempDoublePtr": tempDoublePtr, "ABORT": ABORT, "STACKTOP": STACKTOP, "STACK_MAX": STACK_MAX, "___async": ___async, "___async_unwind": ___async_unwind, "___async_retval": ___async_retval, "___async_cur_frame": ___async_cur_frame };
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
  var invoke_iiii=env.invoke_iiii;
  var invoke_v=env.invoke_v;
  var invoke_vi=env.invoke_vi;
  var invoke_viiii=env.invoke_viiii;
  var invoke_viiiii=env.invoke_viiiii;
  var invoke_viiiiii=env.invoke_viiiiii;
  var __ZSt18uncaught_exceptionv=env.__ZSt18uncaught_exceptionv;
  var ___cxa_find_matching_catch=env.___cxa_find_matching_catch;
  var ___gxx_personality_v0=env.___gxx_personality_v0;
  var ___resumeException=env.___resumeException;
  var ___setErrNo=env.___setErrNo;
  var _abort=env._abort;
  var _emscripten_asm_const_iii=env._emscripten_asm_const_iii;
  var _emscripten_get_now=env._emscripten_get_now;
  var _emscripten_memcpy_big=env._emscripten_memcpy_big;
  var _emscripten_set_main_loop=env._emscripten_set_main_loop;
  var _emscripten_set_main_loop_timing=env._emscripten_set_main_loop_timing;
  var _emscripten_sleep=env._emscripten_sleep;
  var tempFloat = 0.0;

// EMSCRIPTEN_START_FUNCS
function _malloc($0) {
 $0 = $0 | 0;
 var $$$0192$i = 0, $$$0193$i = 0, $$$4351$i = 0, $$$i = 0, $$0 = 0, $$0$i$i = 0, $$0$i$i$i = 0, $$0$i17$i = 0, $$0189$i = 0, $$0192$lcssa$i = 0, $$01926$i = 0, $$0193$lcssa$i = 0, $$01935$i = 0, $$0197 = 0, $$0199 = 0, $$0206$i$i = 0, $$0207$i$i = 0, $$0211$i$i = 0, $$0212$i$i = 0, $$024367$i = 0, $$0287$i$i = 0, $$0288$i$i = 0, $$0289$i$i = 0, $$0295$i$i = 0, $$0296$i$i = 0, $$0342$i = 0, $$0344$i = 0, $$0345$i = 0, $$0347$i = 0, $$0353$i = 0, $$0358$i = 0, $$0359$i = 0, $$0361$i = 0, $$0362$i = 0, $$0368$i = 0, $$1196$i = 0, $$1198$i = 0, $$124466$i = 0, $$1291$i$i = 0, $$1293$i$i = 0, $$1343$i = 0, $$1348$i = 0, $$1363$i = 0, $$1370$i = 0, $$1374$i = 0, $$2234243136$i = 0, $$2247$ph$i = 0, $$2253$ph$i = 0, $$2355$i = 0, $$3$i = 0, $$3$i$i = 0, $$3$i203 = 0, $$3350$i = 0, $$3372$i = 0, $$4$lcssa$i = 0, $$4$ph$i = 0, $$414$i = 0, $$4236$i = 0, $$4351$lcssa$i = 0, $$435113$i = 0, $$4357$$4$i = 0, $$4357$ph$i = 0, $$435712$i = 0, $$723947$i = 0, $$748$i = 0, $$pre$phi$i$iZ2D = 0, $$pre$phi$i19$iZ2D = 0, $$pre$phi$i211Z2D = 0, $$pre$phi$iZ2D = 0, $$pre$phi11$i$iZ2D = 0, $$pre$phiZ2D = 0, $1 = 0, $1004 = 0, $101 = 0, $1010 = 0, $1013 = 0, $1014 = 0, $102 = 0, $1032 = 0, $1034 = 0, $1041 = 0, $1042 = 0, $1043 = 0, $1052 = 0, $1054 = 0, $1055 = 0, $1056 = 0, $108 = 0, $112 = 0, $114 = 0, $115 = 0, $117 = 0, $119 = 0, $121 = 0, $123 = 0, $125 = 0, $127 = 0, $129 = 0, $134 = 0, $138 = 0, $14 = 0, $143 = 0, $146 = 0, $149 = 0, $150 = 0, $157 = 0, $159 = 0, $16 = 0, $162 = 0, $164 = 0, $167 = 0, $169 = 0, $17 = 0, $172 = 0, $175 = 0, $176 = 0, $178 = 0, $179 = 0, $18 = 0, $181 = 0, $182 = 0, $184 = 0, $185 = 0, $19 = 0, $190 = 0, $191 = 0, $20 = 0, $204 = 0, $208 = 0, $214 = 0, $221 = 0, $225 = 0, $234 = 0, $235 = 0, $237 = 0, $238 = 0, $242 = 0, $243 = 0, $251 = 0, $252 = 0, $253 = 0, $255 = 0, $256 = 0, $261 = 0, $262 = 0, $265 = 0, $267 = 0, $27 = 0, $270 = 0, $275 = 0, $282 = 0, $292 = 0, $296 = 0, $30 = 0, $302 = 0, $306 = 0, $309 = 0, $313 = 0, $315 = 0, $316 = 0, $318 = 0, $320 = 0, $322 = 0, $324 = 0, $326 = 0, $328 = 0, $330 = 0, $34 = 0, $340 = 0, $341 = 0, $352 = 0, $354 = 0, $357 = 0, $359 = 0, $362 = 0, $364 = 0, $367 = 0, $37 = 0, $370 = 0, $371 = 0, $373 = 0, $374 = 0, $376 = 0, $377 = 0, $379 = 0, $380 = 0, $385 = 0, $386 = 0, $391 = 0, $399 = 0, $403 = 0, $409 = 0, $41 = 0, $416 = 0, $420 = 0, $428 = 0, $431 = 0, $432 = 0, $433 = 0, $437 = 0, $438 = 0, $44 = 0, $444 = 0, $449 = 0, $450 = 0, $453 = 0, $455 = 0, $458 = 0, $463 = 0, $469 = 0, $47 = 0, $471 = 0, $473 = 0, $475 = 0, $49 = 0, $492 = 0, $494 = 0, $50 = 0, $501 = 0, $502 = 0, $503 = 0, $512 = 0, $514 = 0, $515 = 0, $517 = 0, $52 = 0, $526 = 0, $530 = 0, $532 = 0, $533 = 0, $534 = 0, $54 = 0, $545 = 0, $546 = 0, $547 = 0, $548 = 0, $549 = 0, $550 = 0, $552 = 0, $554 = 0, $555 = 0, $56 = 0, $561 = 0, $563 = 0, $565 = 0, $570 = 0, $572 = 0, $574 = 0, $575 = 0, $576 = 0, $58 = 0, $584 = 0, $585 = 0, $588 = 0, $592 = 0, $595 = 0, $597 = 0, $6 = 0, $60 = 0, $603 = 0, $607 = 0, $611 = 0, $62 = 0, $620 = 0, $621 = 0, $627 = 0, $629 = 0, $633 = 0, $636 = 0, $638 = 0, $64 = 0, $642 = 0, $644 = 0, $649 = 0, $650 = 0, $651 = 0, $657 = 0, $658 = 0, $659 = 0, $663 = 0, $67 = 0, $673 = 0, $675 = 0, $680 = 0, $681 = 0, $682 = 0, $688 = 0, $69 = 0, $690 = 0, $694 = 0, $7 = 0, $70 = 0, $700 = 0, $704 = 0, $71 = 0, $710 = 0, $712 = 0, $718 = 0, $72 = 0, $722 = 0, $723 = 0, $728 = 0, $73 = 0, $734 = 0, $739 = 0, $742 = 0, $743 = 0, $746 = 0, $748 = 0, $750 = 0, $753 = 0, $764 = 0, $769 = 0, $77 = 0, $771 = 0, $774 = 0, $776 = 0, $779 = 0, $782 = 0, $783 = 0, $784 = 0, $786 = 0, $788 = 0, $789 = 0, $791 = 0, $792 = 0, $797 = 0, $798 = 0, $8 = 0, $80 = 0, $812 = 0, $815 = 0, $816 = 0, $822 = 0, $83 = 0, $830 = 0, $836 = 0, $839 = 0, $84 = 0, $840 = 0, $841 = 0, $845 = 0, $846 = 0, $852 = 0, $857 = 0, $858 = 0, $861 = 0, $863 = 0, $866 = 0, $87 = 0, $871 = 0, $877 = 0, $879 = 0, $881 = 0, $882 = 0, $9 = 0, $900 = 0, $902 = 0, $909 = 0, $910 = 0, $911 = 0, $919 = 0, $92 = 0, $923 = 0, $927 = 0, $929 = 0, $93 = 0, $935 = 0, $936 = 0, $938 = 0, $939 = 0, $940 = 0, $941 = 0, $943 = 0, $948 = 0, $949 = 0, $95 = 0, $950 = 0, $956 = 0, $958 = 0, $96 = 0, $964 = 0, $969 = 0, $972 = 0, $973 = 0, $974 = 0, $978 = 0, $979 = 0, $98 = 0, $985 = 0, $990 = 0, $991 = 0, $994 = 0, $996 = 0, $999 = 0, label = 0, sp = 0, $958$looptemp = 0;
 sp = STACKTOP; //@line 1471
 STACKTOP = STACKTOP + 16 | 0; //@line 1472
 $1 = sp; //@line 1473
 do {
  if ($0 >>> 0 < 245) {
   $6 = $0 >>> 0 < 11 ? 16 : $0 + 11 & -8; //@line 1480
   $7 = $6 >>> 3; //@line 1481
   $8 = HEAP32[213] | 0; //@line 1482
   $9 = $8 >>> $7; //@line 1483
   if ($9 & 3 | 0) {
    $14 = ($9 & 1 ^ 1) + $7 | 0; //@line 1489
    $16 = 892 + ($14 << 1 << 2) | 0; //@line 1491
    $17 = $16 + 8 | 0; //@line 1492
    $18 = HEAP32[$17 >> 2] | 0; //@line 1493
    $19 = $18 + 8 | 0; //@line 1494
    $20 = HEAP32[$19 >> 2] | 0; //@line 1495
    do {
     if (($20 | 0) == ($16 | 0)) {
      HEAP32[213] = $8 & ~(1 << $14); //@line 1502
     } else {
      if ((HEAP32[217] | 0) >>> 0 > $20 >>> 0) {
       _abort(); //@line 1507
      }
      $27 = $20 + 12 | 0; //@line 1510
      if ((HEAP32[$27 >> 2] | 0) == ($18 | 0)) {
       HEAP32[$27 >> 2] = $16; //@line 1514
       HEAP32[$17 >> 2] = $20; //@line 1515
       break;
      } else {
       _abort(); //@line 1518
      }
     }
    } while (0);
    $30 = $14 << 3; //@line 1523
    HEAP32[$18 + 4 >> 2] = $30 | 3; //@line 1526
    $34 = $18 + $30 + 4 | 0; //@line 1528
    HEAP32[$34 >> 2] = HEAP32[$34 >> 2] | 1; //@line 1531
    $$0 = $19; //@line 1532
    STACKTOP = sp; //@line 1533
    return $$0 | 0; //@line 1533
   }
   $37 = HEAP32[215] | 0; //@line 1535
   if ($6 >>> 0 > $37 >>> 0) {
    if ($9 | 0) {
     $41 = 2 << $7; //@line 1541
     $44 = $9 << $7 & ($41 | 0 - $41); //@line 1544
     $47 = ($44 & 0 - $44) + -1 | 0; //@line 1547
     $49 = $47 >>> 12 & 16; //@line 1549
     $50 = $47 >>> $49; //@line 1550
     $52 = $50 >>> 5 & 8; //@line 1552
     $54 = $50 >>> $52; //@line 1554
     $56 = $54 >>> 2 & 4; //@line 1556
     $58 = $54 >>> $56; //@line 1558
     $60 = $58 >>> 1 & 2; //@line 1560
     $62 = $58 >>> $60; //@line 1562
     $64 = $62 >>> 1 & 1; //@line 1564
     $67 = ($52 | $49 | $56 | $60 | $64) + ($62 >>> $64) | 0; //@line 1567
     $69 = 892 + ($67 << 1 << 2) | 0; //@line 1569
     $70 = $69 + 8 | 0; //@line 1570
     $71 = HEAP32[$70 >> 2] | 0; //@line 1571
     $72 = $71 + 8 | 0; //@line 1572
     $73 = HEAP32[$72 >> 2] | 0; //@line 1573
     do {
      if (($73 | 0) == ($69 | 0)) {
       $77 = $8 & ~(1 << $67); //@line 1579
       HEAP32[213] = $77; //@line 1580
       $98 = $77; //@line 1581
      } else {
       if ((HEAP32[217] | 0) >>> 0 > $73 >>> 0) {
        _abort(); //@line 1586
       }
       $80 = $73 + 12 | 0; //@line 1589
       if ((HEAP32[$80 >> 2] | 0) == ($71 | 0)) {
        HEAP32[$80 >> 2] = $69; //@line 1593
        HEAP32[$70 >> 2] = $73; //@line 1594
        $98 = $8; //@line 1595
        break;
       } else {
        _abort(); //@line 1598
       }
      }
     } while (0);
     $83 = $67 << 3; //@line 1603
     $84 = $83 - $6 | 0; //@line 1604
     HEAP32[$71 + 4 >> 2] = $6 | 3; //@line 1607
     $87 = $71 + $6 | 0; //@line 1608
     HEAP32[$87 + 4 >> 2] = $84 | 1; //@line 1611
     HEAP32[$71 + $83 >> 2] = $84; //@line 1613
     if ($37 | 0) {
      $92 = HEAP32[218] | 0; //@line 1616
      $93 = $37 >>> 3; //@line 1617
      $95 = 892 + ($93 << 1 << 2) | 0; //@line 1619
      $96 = 1 << $93; //@line 1620
      if (!($98 & $96)) {
       HEAP32[213] = $98 | $96; //@line 1625
       $$0199 = $95; //@line 1627
       $$pre$phiZ2D = $95 + 8 | 0; //@line 1627
      } else {
       $101 = $95 + 8 | 0; //@line 1629
       $102 = HEAP32[$101 >> 2] | 0; //@line 1630
       if ((HEAP32[217] | 0) >>> 0 > $102 >>> 0) {
        _abort(); //@line 1634
       } else {
        $$0199 = $102; //@line 1637
        $$pre$phiZ2D = $101; //@line 1637
       }
      }
      HEAP32[$$pre$phiZ2D >> 2] = $92; //@line 1640
      HEAP32[$$0199 + 12 >> 2] = $92; //@line 1642
      HEAP32[$92 + 8 >> 2] = $$0199; //@line 1644
      HEAP32[$92 + 12 >> 2] = $95; //@line 1646
     }
     HEAP32[215] = $84; //@line 1648
     HEAP32[218] = $87; //@line 1649
     $$0 = $72; //@line 1650
     STACKTOP = sp; //@line 1651
     return $$0 | 0; //@line 1651
    }
    $108 = HEAP32[214] | 0; //@line 1653
    if (!$108) {
     $$0197 = $6; //@line 1656
    } else {
     $112 = ($108 & 0 - $108) + -1 | 0; //@line 1660
     $114 = $112 >>> 12 & 16; //@line 1662
     $115 = $112 >>> $114; //@line 1663
     $117 = $115 >>> 5 & 8; //@line 1665
     $119 = $115 >>> $117; //@line 1667
     $121 = $119 >>> 2 & 4; //@line 1669
     $123 = $119 >>> $121; //@line 1671
     $125 = $123 >>> 1 & 2; //@line 1673
     $127 = $123 >>> $125; //@line 1675
     $129 = $127 >>> 1 & 1; //@line 1677
     $134 = HEAP32[1156 + (($117 | $114 | $121 | $125 | $129) + ($127 >>> $129) << 2) >> 2] | 0; //@line 1682
     $138 = (HEAP32[$134 + 4 >> 2] & -8) - $6 | 0; //@line 1686
     $143 = HEAP32[$134 + 16 + (((HEAP32[$134 + 16 >> 2] | 0) == 0 & 1) << 2) >> 2] | 0; //@line 1692
     if (!$143) {
      $$0192$lcssa$i = $134; //@line 1695
      $$0193$lcssa$i = $138; //@line 1695
     } else {
      $$01926$i = $134; //@line 1697
      $$01935$i = $138; //@line 1697
      $146 = $143; //@line 1697
      while (1) {
       $149 = (HEAP32[$146 + 4 >> 2] & -8) - $6 | 0; //@line 1702
       $150 = $149 >>> 0 < $$01935$i >>> 0; //@line 1703
       $$$0193$i = $150 ? $149 : $$01935$i; //@line 1704
       $$$0192$i = $150 ? $146 : $$01926$i; //@line 1705
       $146 = HEAP32[$146 + 16 + (((HEAP32[$146 + 16 >> 2] | 0) == 0 & 1) << 2) >> 2] | 0; //@line 1711
       if (!$146) {
        $$0192$lcssa$i = $$$0192$i; //@line 1714
        $$0193$lcssa$i = $$$0193$i; //@line 1714
        break;
       } else {
        $$01926$i = $$$0192$i; //@line 1717
        $$01935$i = $$$0193$i; //@line 1717
       }
      }
     }
     $157 = HEAP32[217] | 0; //@line 1721
     if ($157 >>> 0 > $$0192$lcssa$i >>> 0) {
      _abort(); //@line 1724
     }
     $159 = $$0192$lcssa$i + $6 | 0; //@line 1727
     if ($159 >>> 0 <= $$0192$lcssa$i >>> 0) {
      _abort(); //@line 1730
     }
     $162 = HEAP32[$$0192$lcssa$i + 24 >> 2] | 0; //@line 1734
     $164 = HEAP32[$$0192$lcssa$i + 12 >> 2] | 0; //@line 1736
     do {
      if (($164 | 0) == ($$0192$lcssa$i | 0)) {
       $175 = $$0192$lcssa$i + 20 | 0; //@line 1740
       $176 = HEAP32[$175 >> 2] | 0; //@line 1741
       if (!$176) {
        $178 = $$0192$lcssa$i + 16 | 0; //@line 1744
        $179 = HEAP32[$178 >> 2] | 0; //@line 1745
        if (!$179) {
         $$3$i = 0; //@line 1748
         break;
        } else {
         $$1196$i = $179; //@line 1751
         $$1198$i = $178; //@line 1751
        }
       } else {
        $$1196$i = $176; //@line 1754
        $$1198$i = $175; //@line 1754
       }
       while (1) {
        $181 = $$1196$i + 20 | 0; //@line 1757
        $182 = HEAP32[$181 >> 2] | 0; //@line 1758
        if ($182 | 0) {
         $$1196$i = $182; //@line 1761
         $$1198$i = $181; //@line 1761
         continue;
        }
        $184 = $$1196$i + 16 | 0; //@line 1764
        $185 = HEAP32[$184 >> 2] | 0; //@line 1765
        if (!$185) {
         break;
        } else {
         $$1196$i = $185; //@line 1770
         $$1198$i = $184; //@line 1770
        }
       }
       if ($157 >>> 0 > $$1198$i >>> 0) {
        _abort(); //@line 1775
       } else {
        HEAP32[$$1198$i >> 2] = 0; //@line 1778
        $$3$i = $$1196$i; //@line 1779
        break;
       }
      } else {
       $167 = HEAP32[$$0192$lcssa$i + 8 >> 2] | 0; //@line 1784
       if ($157 >>> 0 > $167 >>> 0) {
        _abort(); //@line 1787
       }
       $169 = $167 + 12 | 0; //@line 1790
       if ((HEAP32[$169 >> 2] | 0) != ($$0192$lcssa$i | 0)) {
        _abort(); //@line 1794
       }
       $172 = $164 + 8 | 0; //@line 1797
       if ((HEAP32[$172 >> 2] | 0) == ($$0192$lcssa$i | 0)) {
        HEAP32[$169 >> 2] = $164; //@line 1801
        HEAP32[$172 >> 2] = $167; //@line 1802
        $$3$i = $164; //@line 1803
        break;
       } else {
        _abort(); //@line 1806
       }
      }
     } while (0);
     L73 : do {
      if ($162 | 0) {
       $190 = HEAP32[$$0192$lcssa$i + 28 >> 2] | 0; //@line 1815
       $191 = 1156 + ($190 << 2) | 0; //@line 1816
       do {
        if (($$0192$lcssa$i | 0) == (HEAP32[$191 >> 2] | 0)) {
         HEAP32[$191 >> 2] = $$3$i; //@line 1821
         if (!$$3$i) {
          HEAP32[214] = $108 & ~(1 << $190); //@line 1827
          break L73;
         }
        } else {
         if ((HEAP32[217] | 0) >>> 0 > $162 >>> 0) {
          _abort(); //@line 1834
         } else {
          HEAP32[$162 + 16 + (((HEAP32[$162 + 16 >> 2] | 0) != ($$0192$lcssa$i | 0) & 1) << 2) >> 2] = $$3$i; //@line 1842
          if (!$$3$i) {
           break L73;
          } else {
           break;
          }
         }
        }
       } while (0);
       $204 = HEAP32[217] | 0; //@line 1852
       if ($204 >>> 0 > $$3$i >>> 0) {
        _abort(); //@line 1855
       }
       HEAP32[$$3$i + 24 >> 2] = $162; //@line 1859
       $208 = HEAP32[$$0192$lcssa$i + 16 >> 2] | 0; //@line 1861
       do {
        if ($208 | 0) {
         if ($204 >>> 0 > $208 >>> 0) {
          _abort(); //@line 1867
         } else {
          HEAP32[$$3$i + 16 >> 2] = $208; //@line 1871
          HEAP32[$208 + 24 >> 2] = $$3$i; //@line 1873
          break;
         }
        }
       } while (0);
       $214 = HEAP32[$$0192$lcssa$i + 20 >> 2] | 0; //@line 1879
       if ($214 | 0) {
        if ((HEAP32[217] | 0) >>> 0 > $214 >>> 0) {
         _abort(); //@line 1885
        } else {
         HEAP32[$$3$i + 20 >> 2] = $214; //@line 1889
         HEAP32[$214 + 24 >> 2] = $$3$i; //@line 1891
         break;
        }
       }
      }
     } while (0);
     if ($$0193$lcssa$i >>> 0 < 16) {
      $221 = $$0193$lcssa$i + $6 | 0; //@line 1899
      HEAP32[$$0192$lcssa$i + 4 >> 2] = $221 | 3; //@line 1902
      $225 = $$0192$lcssa$i + $221 + 4 | 0; //@line 1904
      HEAP32[$225 >> 2] = HEAP32[$225 >> 2] | 1; //@line 1907
     } else {
      HEAP32[$$0192$lcssa$i + 4 >> 2] = $6 | 3; //@line 1911
      HEAP32[$159 + 4 >> 2] = $$0193$lcssa$i | 1; //@line 1914
      HEAP32[$159 + $$0193$lcssa$i >> 2] = $$0193$lcssa$i; //@line 1916
      if ($37 | 0) {
       $234 = HEAP32[218] | 0; //@line 1919
       $235 = $37 >>> 3; //@line 1920
       $237 = 892 + ($235 << 1 << 2) | 0; //@line 1922
       $238 = 1 << $235; //@line 1923
       if (!($8 & $238)) {
        HEAP32[213] = $8 | $238; //@line 1928
        $$0189$i = $237; //@line 1930
        $$pre$phi$iZ2D = $237 + 8 | 0; //@line 1930
       } else {
        $242 = $237 + 8 | 0; //@line 1932
        $243 = HEAP32[$242 >> 2] | 0; //@line 1933
        if ((HEAP32[217] | 0) >>> 0 > $243 >>> 0) {
         _abort(); //@line 1937
        } else {
         $$0189$i = $243; //@line 1940
         $$pre$phi$iZ2D = $242; //@line 1940
        }
       }
       HEAP32[$$pre$phi$iZ2D >> 2] = $234; //@line 1943
       HEAP32[$$0189$i + 12 >> 2] = $234; //@line 1945
       HEAP32[$234 + 8 >> 2] = $$0189$i; //@line 1947
       HEAP32[$234 + 12 >> 2] = $237; //@line 1949
      }
      HEAP32[215] = $$0193$lcssa$i; //@line 1951
      HEAP32[218] = $159; //@line 1952
     }
     $$0 = $$0192$lcssa$i + 8 | 0; //@line 1955
     STACKTOP = sp; //@line 1956
     return $$0 | 0; //@line 1956
    }
   } else {
    $$0197 = $6; //@line 1959
   }
  } else {
   if ($0 >>> 0 > 4294967231) {
    $$0197 = -1; //@line 1964
   } else {
    $251 = $0 + 11 | 0; //@line 1966
    $252 = $251 & -8; //@line 1967
    $253 = HEAP32[214] | 0; //@line 1968
    if (!$253) {
     $$0197 = $252; //@line 1971
    } else {
     $255 = 0 - $252 | 0; //@line 1973
     $256 = $251 >>> 8; //@line 1974
     if (!$256) {
      $$0358$i = 0; //@line 1977
     } else {
      if ($252 >>> 0 > 16777215) {
       $$0358$i = 31; //@line 1981
      } else {
       $261 = ($256 + 1048320 | 0) >>> 16 & 8; //@line 1985
       $262 = $256 << $261; //@line 1986
       $265 = ($262 + 520192 | 0) >>> 16 & 4; //@line 1989
       $267 = $262 << $265; //@line 1991
       $270 = ($267 + 245760 | 0) >>> 16 & 2; //@line 1994
       $275 = 14 - ($265 | $261 | $270) + ($267 << $270 >>> 15) | 0; //@line 1999
       $$0358$i = $252 >>> ($275 + 7 | 0) & 1 | $275 << 1; //@line 2005
      }
     }
     $282 = HEAP32[1156 + ($$0358$i << 2) >> 2] | 0; //@line 2009
     L117 : do {
      if (!$282) {
       $$2355$i = 0; //@line 2013
       $$3$i203 = 0; //@line 2013
       $$3350$i = $255; //@line 2013
       label = 81; //@line 2014
      } else {
       $$0342$i = 0; //@line 2021
       $$0347$i = $255; //@line 2021
       $$0353$i = $282; //@line 2021
       $$0359$i = $252 << (($$0358$i | 0) == 31 ? 0 : 25 - ($$0358$i >>> 1) | 0); //@line 2021
       $$0362$i = 0; //@line 2021
       while (1) {
        $292 = (HEAP32[$$0353$i + 4 >> 2] & -8) - $252 | 0; //@line 2026
        if ($292 >>> 0 < $$0347$i >>> 0) {
         if (!$292) {
          $$414$i = $$0353$i; //@line 2031
          $$435113$i = 0; //@line 2031
          $$435712$i = $$0353$i; //@line 2031
          label = 85; //@line 2032
          break L117;
         } else {
          $$1343$i = $$0353$i; //@line 2035
          $$1348$i = $292; //@line 2035
         }
        } else {
         $$1343$i = $$0342$i; //@line 2038
         $$1348$i = $$0347$i; //@line 2038
        }
        $296 = HEAP32[$$0353$i + 20 >> 2] | 0; //@line 2041
        $$0353$i = HEAP32[$$0353$i + 16 + ($$0359$i >>> 31 << 2) >> 2] | 0; //@line 2044
        $$1363$i = ($296 | 0) == 0 | ($296 | 0) == ($$0353$i | 0) ? $$0362$i : $296; //@line 2048
        $302 = ($$0353$i | 0) == 0; //@line 2049
        if ($302) {
         $$2355$i = $$1363$i; //@line 2054
         $$3$i203 = $$1343$i; //@line 2054
         $$3350$i = $$1348$i; //@line 2054
         label = 81; //@line 2055
         break;
        } else {
         $$0342$i = $$1343$i; //@line 2058
         $$0347$i = $$1348$i; //@line 2058
         $$0359$i = $$0359$i << (($302 ^ 1) & 1); //@line 2058
         $$0362$i = $$1363$i; //@line 2058
        }
       }
      }
     } while (0);
     if ((label | 0) == 81) {
      if (($$2355$i | 0) == 0 & ($$3$i203 | 0) == 0) {
       $306 = 2 << $$0358$i; //@line 2068
       $309 = $253 & ($306 | 0 - $306); //@line 2071
       if (!$309) {
        $$0197 = $252; //@line 2074
        break;
       }
       $313 = ($309 & 0 - $309) + -1 | 0; //@line 2079
       $315 = $313 >>> 12 & 16; //@line 2081
       $316 = $313 >>> $315; //@line 2082
       $318 = $316 >>> 5 & 8; //@line 2084
       $320 = $316 >>> $318; //@line 2086
       $322 = $320 >>> 2 & 4; //@line 2088
       $324 = $320 >>> $322; //@line 2090
       $326 = $324 >>> 1 & 2; //@line 2092
       $328 = $324 >>> $326; //@line 2094
       $330 = $328 >>> 1 & 1; //@line 2096
       $$4$ph$i = 0; //@line 2102
       $$4357$ph$i = HEAP32[1156 + (($318 | $315 | $322 | $326 | $330) + ($328 >>> $330) << 2) >> 2] | 0; //@line 2102
      } else {
       $$4$ph$i = $$3$i203; //@line 2104
       $$4357$ph$i = $$2355$i; //@line 2104
      }
      if (!$$4357$ph$i) {
       $$4$lcssa$i = $$4$ph$i; //@line 2108
       $$4351$lcssa$i = $$3350$i; //@line 2108
      } else {
       $$414$i = $$4$ph$i; //@line 2110
       $$435113$i = $$3350$i; //@line 2110
       $$435712$i = $$4357$ph$i; //@line 2110
       label = 85; //@line 2111
      }
     }
     if ((label | 0) == 85) {
      while (1) {
       label = 0; //@line 2116
       $340 = (HEAP32[$$435712$i + 4 >> 2] & -8) - $252 | 0; //@line 2120
       $341 = $340 >>> 0 < $$435113$i >>> 0; //@line 2121
       $$$4351$i = $341 ? $340 : $$435113$i; //@line 2122
       $$4357$$4$i = $341 ? $$435712$i : $$414$i; //@line 2123
       $$435712$i = HEAP32[$$435712$i + 16 + (((HEAP32[$$435712$i + 16 >> 2] | 0) == 0 & 1) << 2) >> 2] | 0; //@line 2129
       if (!$$435712$i) {
        $$4$lcssa$i = $$4357$$4$i; //@line 2132
        $$4351$lcssa$i = $$$4351$i; //@line 2132
        break;
       } else {
        $$414$i = $$4357$$4$i; //@line 2135
        $$435113$i = $$$4351$i; //@line 2135
        label = 85; //@line 2136
       }
      }
     }
     if (!$$4$lcssa$i) {
      $$0197 = $252; //@line 2142
     } else {
      if ($$4351$lcssa$i >>> 0 < ((HEAP32[215] | 0) - $252 | 0) >>> 0) {
       $352 = HEAP32[217] | 0; //@line 2148
       if ($352 >>> 0 > $$4$lcssa$i >>> 0) {
        _abort(); //@line 2151
       }
       $354 = $$4$lcssa$i + $252 | 0; //@line 2154
       if ($354 >>> 0 <= $$4$lcssa$i >>> 0) {
        _abort(); //@line 2157
       }
       $357 = HEAP32[$$4$lcssa$i + 24 >> 2] | 0; //@line 2161
       $359 = HEAP32[$$4$lcssa$i + 12 >> 2] | 0; //@line 2163
       do {
        if (($359 | 0) == ($$4$lcssa$i | 0)) {
         $370 = $$4$lcssa$i + 20 | 0; //@line 2167
         $371 = HEAP32[$370 >> 2] | 0; //@line 2168
         if (!$371) {
          $373 = $$4$lcssa$i + 16 | 0; //@line 2171
          $374 = HEAP32[$373 >> 2] | 0; //@line 2172
          if (!$374) {
           $$3372$i = 0; //@line 2175
           break;
          } else {
           $$1370$i = $374; //@line 2178
           $$1374$i = $373; //@line 2178
          }
         } else {
          $$1370$i = $371; //@line 2181
          $$1374$i = $370; //@line 2181
         }
         while (1) {
          $376 = $$1370$i + 20 | 0; //@line 2184
          $377 = HEAP32[$376 >> 2] | 0; //@line 2185
          if ($377 | 0) {
           $$1370$i = $377; //@line 2188
           $$1374$i = $376; //@line 2188
           continue;
          }
          $379 = $$1370$i + 16 | 0; //@line 2191
          $380 = HEAP32[$379 >> 2] | 0; //@line 2192
          if (!$380) {
           break;
          } else {
           $$1370$i = $380; //@line 2197
           $$1374$i = $379; //@line 2197
          }
         }
         if ($352 >>> 0 > $$1374$i >>> 0) {
          _abort(); //@line 2202
         } else {
          HEAP32[$$1374$i >> 2] = 0; //@line 2205
          $$3372$i = $$1370$i; //@line 2206
          break;
         }
        } else {
         $362 = HEAP32[$$4$lcssa$i + 8 >> 2] | 0; //@line 2211
         if ($352 >>> 0 > $362 >>> 0) {
          _abort(); //@line 2214
         }
         $364 = $362 + 12 | 0; //@line 2217
         if ((HEAP32[$364 >> 2] | 0) != ($$4$lcssa$i | 0)) {
          _abort(); //@line 2221
         }
         $367 = $359 + 8 | 0; //@line 2224
         if ((HEAP32[$367 >> 2] | 0) == ($$4$lcssa$i | 0)) {
          HEAP32[$364 >> 2] = $359; //@line 2228
          HEAP32[$367 >> 2] = $362; //@line 2229
          $$3372$i = $359; //@line 2230
          break;
         } else {
          _abort(); //@line 2233
         }
        }
       } while (0);
       L164 : do {
        if (!$357) {
         $475 = $253; //@line 2241
        } else {
         $385 = HEAP32[$$4$lcssa$i + 28 >> 2] | 0; //@line 2244
         $386 = 1156 + ($385 << 2) | 0; //@line 2245
         do {
          if (($$4$lcssa$i | 0) == (HEAP32[$386 >> 2] | 0)) {
           HEAP32[$386 >> 2] = $$3372$i; //@line 2250
           if (!$$3372$i) {
            $391 = $253 & ~(1 << $385); //@line 2255
            HEAP32[214] = $391; //@line 2256
            $475 = $391; //@line 2257
            break L164;
           }
          } else {
           if ((HEAP32[217] | 0) >>> 0 > $357 >>> 0) {
            _abort(); //@line 2264
           } else {
            HEAP32[$357 + 16 + (((HEAP32[$357 + 16 >> 2] | 0) != ($$4$lcssa$i | 0) & 1) << 2) >> 2] = $$3372$i; //@line 2272
            if (!$$3372$i) {
             $475 = $253; //@line 2275
             break L164;
            } else {
             break;
            }
           }
          }
         } while (0);
         $399 = HEAP32[217] | 0; //@line 2283
         if ($399 >>> 0 > $$3372$i >>> 0) {
          _abort(); //@line 2286
         }
         HEAP32[$$3372$i + 24 >> 2] = $357; //@line 2290
         $403 = HEAP32[$$4$lcssa$i + 16 >> 2] | 0; //@line 2292
         do {
          if ($403 | 0) {
           if ($399 >>> 0 > $403 >>> 0) {
            _abort(); //@line 2298
           } else {
            HEAP32[$$3372$i + 16 >> 2] = $403; //@line 2302
            HEAP32[$403 + 24 >> 2] = $$3372$i; //@line 2304
            break;
           }
          }
         } while (0);
         $409 = HEAP32[$$4$lcssa$i + 20 >> 2] | 0; //@line 2310
         if (!$409) {
          $475 = $253; //@line 2313
         } else {
          if ((HEAP32[217] | 0) >>> 0 > $409 >>> 0) {
           _abort(); //@line 2318
          } else {
           HEAP32[$$3372$i + 20 >> 2] = $409; //@line 2322
           HEAP32[$409 + 24 >> 2] = $$3372$i; //@line 2324
           $475 = $253; //@line 2325
           break;
          }
         }
        }
       } while (0);
       do {
        if ($$4351$lcssa$i >>> 0 < 16) {
         $416 = $$4351$lcssa$i + $252 | 0; //@line 2334
         HEAP32[$$4$lcssa$i + 4 >> 2] = $416 | 3; //@line 2337
         $420 = $$4$lcssa$i + $416 + 4 | 0; //@line 2339
         HEAP32[$420 >> 2] = HEAP32[$420 >> 2] | 1; //@line 2342
        } else {
         HEAP32[$$4$lcssa$i + 4 >> 2] = $252 | 3; //@line 2346
         HEAP32[$354 + 4 >> 2] = $$4351$lcssa$i | 1; //@line 2349
         HEAP32[$354 + $$4351$lcssa$i >> 2] = $$4351$lcssa$i; //@line 2351
         $428 = $$4351$lcssa$i >>> 3; //@line 2352
         if ($$4351$lcssa$i >>> 0 < 256) {
          $431 = 892 + ($428 << 1 << 2) | 0; //@line 2356
          $432 = HEAP32[213] | 0; //@line 2357
          $433 = 1 << $428; //@line 2358
          if (!($432 & $433)) {
           HEAP32[213] = $432 | $433; //@line 2363
           $$0368$i = $431; //@line 2365
           $$pre$phi$i211Z2D = $431 + 8 | 0; //@line 2365
          } else {
           $437 = $431 + 8 | 0; //@line 2367
           $438 = HEAP32[$437 >> 2] | 0; //@line 2368
           if ((HEAP32[217] | 0) >>> 0 > $438 >>> 0) {
            _abort(); //@line 2372
           } else {
            $$0368$i = $438; //@line 2375
            $$pre$phi$i211Z2D = $437; //@line 2375
           }
          }
          HEAP32[$$pre$phi$i211Z2D >> 2] = $354; //@line 2378
          HEAP32[$$0368$i + 12 >> 2] = $354; //@line 2380
          HEAP32[$354 + 8 >> 2] = $$0368$i; //@line 2382
          HEAP32[$354 + 12 >> 2] = $431; //@line 2384
          break;
         }
         $444 = $$4351$lcssa$i >>> 8; //@line 2387
         if (!$444) {
          $$0361$i = 0; //@line 2390
         } else {
          if ($$4351$lcssa$i >>> 0 > 16777215) {
           $$0361$i = 31; //@line 2394
          } else {
           $449 = ($444 + 1048320 | 0) >>> 16 & 8; //@line 2398
           $450 = $444 << $449; //@line 2399
           $453 = ($450 + 520192 | 0) >>> 16 & 4; //@line 2402
           $455 = $450 << $453; //@line 2404
           $458 = ($455 + 245760 | 0) >>> 16 & 2; //@line 2407
           $463 = 14 - ($453 | $449 | $458) + ($455 << $458 >>> 15) | 0; //@line 2412
           $$0361$i = $$4351$lcssa$i >>> ($463 + 7 | 0) & 1 | $463 << 1; //@line 2418
          }
         }
         $469 = 1156 + ($$0361$i << 2) | 0; //@line 2421
         HEAP32[$354 + 28 >> 2] = $$0361$i; //@line 2423
         $471 = $354 + 16 | 0; //@line 2424
         HEAP32[$471 + 4 >> 2] = 0; //@line 2426
         HEAP32[$471 >> 2] = 0; //@line 2427
         $473 = 1 << $$0361$i; //@line 2428
         if (!($475 & $473)) {
          HEAP32[214] = $475 | $473; //@line 2433
          HEAP32[$469 >> 2] = $354; //@line 2434
          HEAP32[$354 + 24 >> 2] = $469; //@line 2436
          HEAP32[$354 + 12 >> 2] = $354; //@line 2438
          HEAP32[$354 + 8 >> 2] = $354; //@line 2440
          break;
         }
         $$0344$i = $$4351$lcssa$i << (($$0361$i | 0) == 31 ? 0 : 25 - ($$0361$i >>> 1) | 0); //@line 2449
         $$0345$i = HEAP32[$469 >> 2] | 0; //@line 2449
         while (1) {
          if ((HEAP32[$$0345$i + 4 >> 2] & -8 | 0) == ($$4351$lcssa$i | 0)) {
           label = 139; //@line 2456
           break;
          }
          $492 = $$0345$i + 16 + ($$0344$i >>> 31 << 2) | 0; //@line 2460
          $494 = HEAP32[$492 >> 2] | 0; //@line 2462
          if (!$494) {
           label = 136; //@line 2465
           break;
          } else {
           $$0344$i = $$0344$i << 1; //@line 2468
           $$0345$i = $494; //@line 2468
          }
         }
         if ((label | 0) == 136) {
          if ((HEAP32[217] | 0) >>> 0 > $492 >>> 0) {
           _abort(); //@line 2475
          } else {
           HEAP32[$492 >> 2] = $354; //@line 2478
           HEAP32[$354 + 24 >> 2] = $$0345$i; //@line 2480
           HEAP32[$354 + 12 >> 2] = $354; //@line 2482
           HEAP32[$354 + 8 >> 2] = $354; //@line 2484
           break;
          }
         } else if ((label | 0) == 139) {
          $501 = $$0345$i + 8 | 0; //@line 2489
          $502 = HEAP32[$501 >> 2] | 0; //@line 2490
          $503 = HEAP32[217] | 0; //@line 2491
          if ($503 >>> 0 <= $502 >>> 0 & $503 >>> 0 <= $$0345$i >>> 0) {
           HEAP32[$502 + 12 >> 2] = $354; //@line 2497
           HEAP32[$501 >> 2] = $354; //@line 2498
           HEAP32[$354 + 8 >> 2] = $502; //@line 2500
           HEAP32[$354 + 12 >> 2] = $$0345$i; //@line 2502
           HEAP32[$354 + 24 >> 2] = 0; //@line 2504
           break;
          } else {
           _abort(); //@line 2507
          }
         }
        }
       } while (0);
       $$0 = $$4$lcssa$i + 8 | 0; //@line 2514
       STACKTOP = sp; //@line 2515
       return $$0 | 0; //@line 2515
      } else {
       $$0197 = $252; //@line 2517
      }
     }
    }
   }
  }
 } while (0);
 $512 = HEAP32[215] | 0; //@line 2524
 if ($512 >>> 0 >= $$0197 >>> 0) {
  $514 = $512 - $$0197 | 0; //@line 2527
  $515 = HEAP32[218] | 0; //@line 2528
  if ($514 >>> 0 > 15) {
   $517 = $515 + $$0197 | 0; //@line 2531
   HEAP32[218] = $517; //@line 2532
   HEAP32[215] = $514; //@line 2533
   HEAP32[$517 + 4 >> 2] = $514 | 1; //@line 2536
   HEAP32[$515 + $512 >> 2] = $514; //@line 2538
   HEAP32[$515 + 4 >> 2] = $$0197 | 3; //@line 2541
  } else {
   HEAP32[215] = 0; //@line 2543
   HEAP32[218] = 0; //@line 2544
   HEAP32[$515 + 4 >> 2] = $512 | 3; //@line 2547
   $526 = $515 + $512 + 4 | 0; //@line 2549
   HEAP32[$526 >> 2] = HEAP32[$526 >> 2] | 1; //@line 2552
  }
  $$0 = $515 + 8 | 0; //@line 2555
  STACKTOP = sp; //@line 2556
  return $$0 | 0; //@line 2556
 }
 $530 = HEAP32[216] | 0; //@line 2558
 if ($530 >>> 0 > $$0197 >>> 0) {
  $532 = $530 - $$0197 | 0; //@line 2561
  HEAP32[216] = $532; //@line 2562
  $533 = HEAP32[219] | 0; //@line 2563
  $534 = $533 + $$0197 | 0; //@line 2564
  HEAP32[219] = $534; //@line 2565
  HEAP32[$534 + 4 >> 2] = $532 | 1; //@line 2568
  HEAP32[$533 + 4 >> 2] = $$0197 | 3; //@line 2571
  $$0 = $533 + 8 | 0; //@line 2573
  STACKTOP = sp; //@line 2574
  return $$0 | 0; //@line 2574
 }
 if (!(HEAP32[331] | 0)) {
  HEAP32[333] = 4096; //@line 2579
  HEAP32[332] = 4096; //@line 2580
  HEAP32[334] = -1; //@line 2581
  HEAP32[335] = -1; //@line 2582
  HEAP32[336] = 0; //@line 2583
  HEAP32[324] = 0; //@line 2584
  HEAP32[331] = $1 & -16 ^ 1431655768; //@line 2588
  $548 = 4096; //@line 2589
 } else {
  $548 = HEAP32[333] | 0; //@line 2592
 }
 $545 = $$0197 + 48 | 0; //@line 2594
 $546 = $$0197 + 47 | 0; //@line 2595
 $547 = $548 + $546 | 0; //@line 2596
 $549 = 0 - $548 | 0; //@line 2597
 $550 = $547 & $549; //@line 2598
 if ($550 >>> 0 <= $$0197 >>> 0) {
  $$0 = 0; //@line 2601
  STACKTOP = sp; //@line 2602
  return $$0 | 0; //@line 2602
 }
 $552 = HEAP32[323] | 0; //@line 2604
 if ($552 | 0) {
  $554 = HEAP32[321] | 0; //@line 2607
  $555 = $554 + $550 | 0; //@line 2608
  if ($555 >>> 0 <= $554 >>> 0 | $555 >>> 0 > $552 >>> 0) {
   $$0 = 0; //@line 2613
   STACKTOP = sp; //@line 2614
   return $$0 | 0; //@line 2614
  }
 }
 L244 : do {
  if (!(HEAP32[324] & 4)) {
   $561 = HEAP32[219] | 0; //@line 2622
   L246 : do {
    if (!$561) {
     label = 163; //@line 2626
    } else {
     $$0$i$i = 1300; //@line 2628
     while (1) {
      $563 = HEAP32[$$0$i$i >> 2] | 0; //@line 2630
      if ($563 >>> 0 <= $561 >>> 0) {
       $565 = $$0$i$i + 4 | 0; //@line 2633
       if (($563 + (HEAP32[$565 >> 2] | 0) | 0) >>> 0 > $561 >>> 0) {
        break;
       }
      }
      $570 = HEAP32[$$0$i$i + 8 >> 2] | 0; //@line 2642
      if (!$570) {
       label = 163; //@line 2645
       break L246;
      } else {
       $$0$i$i = $570; //@line 2648
      }
     }
     $595 = $547 - $530 & $549; //@line 2652
     if ($595 >>> 0 < 2147483647) {
      $597 = _sbrk($595 | 0) | 0; //@line 2655
      if (($597 | 0) == ((HEAP32[$$0$i$i >> 2] | 0) + (HEAP32[$565 >> 2] | 0) | 0)) {
       if (($597 | 0) == (-1 | 0)) {
        $$2234243136$i = $595; //@line 2663
       } else {
        $$723947$i = $595; //@line 2665
        $$748$i = $597; //@line 2665
        label = 180; //@line 2666
        break L244;
       }
      } else {
       $$2247$ph$i = $597; //@line 2670
       $$2253$ph$i = $595; //@line 2670
       label = 171; //@line 2671
      }
     } else {
      $$2234243136$i = 0; //@line 2674
     }
    }
   } while (0);
   do {
    if ((label | 0) == 163) {
     $572 = _sbrk(0) | 0; //@line 2680
     if (($572 | 0) == (-1 | 0)) {
      $$2234243136$i = 0; //@line 2683
     } else {
      $574 = $572; //@line 2685
      $575 = HEAP32[332] | 0; //@line 2686
      $576 = $575 + -1 | 0; //@line 2687
      $$$i = (($576 & $574 | 0) == 0 ? 0 : ($576 + $574 & 0 - $575) - $574 | 0) + $550 | 0; //@line 2695
      $584 = HEAP32[321] | 0; //@line 2696
      $585 = $$$i + $584 | 0; //@line 2697
      if ($$$i >>> 0 > $$0197 >>> 0 & $$$i >>> 0 < 2147483647) {
       $588 = HEAP32[323] | 0; //@line 2702
       if ($588 | 0) {
        if ($585 >>> 0 <= $584 >>> 0 | $585 >>> 0 > $588 >>> 0) {
         $$2234243136$i = 0; //@line 2709
         break;
        }
       }
       $592 = _sbrk($$$i | 0) | 0; //@line 2713
       if (($592 | 0) == ($572 | 0)) {
        $$723947$i = $$$i; //@line 2716
        $$748$i = $572; //@line 2716
        label = 180; //@line 2717
        break L244;
       } else {
        $$2247$ph$i = $592; //@line 2720
        $$2253$ph$i = $$$i; //@line 2720
        label = 171; //@line 2721
       }
      } else {
       $$2234243136$i = 0; //@line 2724
      }
     }
    }
   } while (0);
   do {
    if ((label | 0) == 171) {
     $603 = 0 - $$2253$ph$i | 0; //@line 2731
     if (!($545 >>> 0 > $$2253$ph$i >>> 0 & ($$2253$ph$i >>> 0 < 2147483647 & ($$2247$ph$i | 0) != (-1 | 0)))) {
      if (($$2247$ph$i | 0) == (-1 | 0)) {
       $$2234243136$i = 0; //@line 2740
       break;
      } else {
       $$723947$i = $$2253$ph$i; //@line 2743
       $$748$i = $$2247$ph$i; //@line 2743
       label = 180; //@line 2744
       break L244;
      }
     }
     $607 = HEAP32[333] | 0; //@line 2748
     $611 = $546 - $$2253$ph$i + $607 & 0 - $607; //@line 2752
     if ($611 >>> 0 >= 2147483647) {
      $$723947$i = $$2253$ph$i; //@line 2755
      $$748$i = $$2247$ph$i; //@line 2755
      label = 180; //@line 2756
      break L244;
     }
     if ((_sbrk($611 | 0) | 0) == (-1 | 0)) {
      _sbrk($603 | 0) | 0; //@line 2762
      $$2234243136$i = 0; //@line 2763
      break;
     } else {
      $$723947$i = $611 + $$2253$ph$i | 0; //@line 2767
      $$748$i = $$2247$ph$i; //@line 2767
      label = 180; //@line 2768
      break L244;
     }
    }
   } while (0);
   HEAP32[324] = HEAP32[324] | 4; //@line 2775
   $$4236$i = $$2234243136$i; //@line 2776
   label = 178; //@line 2777
  } else {
   $$4236$i = 0; //@line 2779
   label = 178; //@line 2780
  }
 } while (0);
 if ((label | 0) == 178) {
  if ($550 >>> 0 < 2147483647) {
   $620 = _sbrk($550 | 0) | 0; //@line 2786
   $621 = _sbrk(0) | 0; //@line 2787
   $627 = $621 - $620 | 0; //@line 2795
   $629 = $627 >>> 0 > ($$0197 + 40 | 0) >>> 0; //@line 2797
   if (!(($620 | 0) == (-1 | 0) | $629 ^ 1 | $620 >>> 0 < $621 >>> 0 & (($620 | 0) != (-1 | 0) & ($621 | 0) != (-1 | 0)) ^ 1)) {
    $$723947$i = $629 ? $627 : $$4236$i; //@line 2805
    $$748$i = $620; //@line 2805
    label = 180; //@line 2806
   }
  }
 }
 if ((label | 0) == 180) {
  $633 = (HEAP32[321] | 0) + $$723947$i | 0; //@line 2812
  HEAP32[321] = $633; //@line 2813
  if ($633 >>> 0 > (HEAP32[322] | 0) >>> 0) {
   HEAP32[322] = $633; //@line 2817
  }
  $636 = HEAP32[219] | 0; //@line 2819
  do {
   if (!$636) {
    $638 = HEAP32[217] | 0; //@line 2823
    if (($638 | 0) == 0 | $$748$i >>> 0 < $638 >>> 0) {
     HEAP32[217] = $$748$i; //@line 2828
    }
    HEAP32[325] = $$748$i; //@line 2830
    HEAP32[326] = $$723947$i; //@line 2831
    HEAP32[328] = 0; //@line 2832
    HEAP32[222] = HEAP32[331]; //@line 2834
    HEAP32[221] = -1; //@line 2835
    HEAP32[226] = 892; //@line 2836
    HEAP32[225] = 892; //@line 2837
    HEAP32[228] = 900; //@line 2838
    HEAP32[227] = 900; //@line 2839
    HEAP32[230] = 908; //@line 2840
    HEAP32[229] = 908; //@line 2841
    HEAP32[232] = 916; //@line 2842
    HEAP32[231] = 916; //@line 2843
    HEAP32[234] = 924; //@line 2844
    HEAP32[233] = 924; //@line 2845
    HEAP32[236] = 932; //@line 2846
    HEAP32[235] = 932; //@line 2847
    HEAP32[238] = 940; //@line 2848
    HEAP32[237] = 940; //@line 2849
    HEAP32[240] = 948; //@line 2850
    HEAP32[239] = 948; //@line 2851
    HEAP32[242] = 956; //@line 2852
    HEAP32[241] = 956; //@line 2853
    HEAP32[244] = 964; //@line 2854
    HEAP32[243] = 964; //@line 2855
    HEAP32[246] = 972; //@line 2856
    HEAP32[245] = 972; //@line 2857
    HEAP32[248] = 980; //@line 2858
    HEAP32[247] = 980; //@line 2859
    HEAP32[250] = 988; //@line 2860
    HEAP32[249] = 988; //@line 2861
    HEAP32[252] = 996; //@line 2862
    HEAP32[251] = 996; //@line 2863
    HEAP32[254] = 1004; //@line 2864
    HEAP32[253] = 1004; //@line 2865
    HEAP32[256] = 1012; //@line 2866
    HEAP32[255] = 1012; //@line 2867
    HEAP32[258] = 1020; //@line 2868
    HEAP32[257] = 1020; //@line 2869
    HEAP32[260] = 1028; //@line 2870
    HEAP32[259] = 1028; //@line 2871
    HEAP32[262] = 1036; //@line 2872
    HEAP32[261] = 1036; //@line 2873
    HEAP32[264] = 1044; //@line 2874
    HEAP32[263] = 1044; //@line 2875
    HEAP32[266] = 1052; //@line 2876
    HEAP32[265] = 1052; //@line 2877
    HEAP32[268] = 1060; //@line 2878
    HEAP32[267] = 1060; //@line 2879
    HEAP32[270] = 1068; //@line 2880
    HEAP32[269] = 1068; //@line 2881
    HEAP32[272] = 1076; //@line 2882
    HEAP32[271] = 1076; //@line 2883
    HEAP32[274] = 1084; //@line 2884
    HEAP32[273] = 1084; //@line 2885
    HEAP32[276] = 1092; //@line 2886
    HEAP32[275] = 1092; //@line 2887
    HEAP32[278] = 1100; //@line 2888
    HEAP32[277] = 1100; //@line 2889
    HEAP32[280] = 1108; //@line 2890
    HEAP32[279] = 1108; //@line 2891
    HEAP32[282] = 1116; //@line 2892
    HEAP32[281] = 1116; //@line 2893
    HEAP32[284] = 1124; //@line 2894
    HEAP32[283] = 1124; //@line 2895
    HEAP32[286] = 1132; //@line 2896
    HEAP32[285] = 1132; //@line 2897
    HEAP32[288] = 1140; //@line 2898
    HEAP32[287] = 1140; //@line 2899
    $642 = $$723947$i + -40 | 0; //@line 2900
    $644 = $$748$i + 8 | 0; //@line 2902
    $649 = ($644 & 7 | 0) == 0 ? 0 : 0 - $644 & 7; //@line 2907
    $650 = $$748$i + $649 | 0; //@line 2908
    $651 = $642 - $649 | 0; //@line 2909
    HEAP32[219] = $650; //@line 2910
    HEAP32[216] = $651; //@line 2911
    HEAP32[$650 + 4 >> 2] = $651 | 1; //@line 2914
    HEAP32[$$748$i + $642 + 4 >> 2] = 40; //@line 2917
    HEAP32[220] = HEAP32[335]; //@line 2919
   } else {
    $$024367$i = 1300; //@line 2921
    while (1) {
     $657 = HEAP32[$$024367$i >> 2] | 0; //@line 2923
     $658 = $$024367$i + 4 | 0; //@line 2924
     $659 = HEAP32[$658 >> 2] | 0; //@line 2925
     if (($$748$i | 0) == ($657 + $659 | 0)) {
      label = 188; //@line 2929
      break;
     }
     $663 = HEAP32[$$024367$i + 8 >> 2] | 0; //@line 2933
     if (!$663) {
      break;
     } else {
      $$024367$i = $663; //@line 2938
     }
    }
    if ((label | 0) == 188) {
     if (!(HEAP32[$$024367$i + 12 >> 2] & 8)) {
      if ($$748$i >>> 0 > $636 >>> 0 & $657 >>> 0 <= $636 >>> 0) {
       HEAP32[$658 >> 2] = $659 + $$723947$i; //@line 2952
       $673 = (HEAP32[216] | 0) + $$723947$i | 0; //@line 2954
       $675 = $636 + 8 | 0; //@line 2956
       $680 = ($675 & 7 | 0) == 0 ? 0 : 0 - $675 & 7; //@line 2961
       $681 = $636 + $680 | 0; //@line 2962
       $682 = $673 - $680 | 0; //@line 2963
       HEAP32[219] = $681; //@line 2964
       HEAP32[216] = $682; //@line 2965
       HEAP32[$681 + 4 >> 2] = $682 | 1; //@line 2968
       HEAP32[$636 + $673 + 4 >> 2] = 40; //@line 2971
       HEAP32[220] = HEAP32[335]; //@line 2973
       break;
      }
     }
    }
    $688 = HEAP32[217] | 0; //@line 2978
    if ($$748$i >>> 0 < $688 >>> 0) {
     HEAP32[217] = $$748$i; //@line 2981
     $753 = $$748$i; //@line 2982
    } else {
     $753 = $688; //@line 2984
    }
    $690 = $$748$i + $$723947$i | 0; //@line 2986
    $$124466$i = 1300; //@line 2987
    while (1) {
     if ((HEAP32[$$124466$i >> 2] | 0) == ($690 | 0)) {
      label = 196; //@line 2992
      break;
     }
     $694 = HEAP32[$$124466$i + 8 >> 2] | 0; //@line 2996
     if (!$694) {
      $$0$i$i$i = 1300; //@line 2999
      break;
     } else {
      $$124466$i = $694; //@line 3002
     }
    }
    if ((label | 0) == 196) {
     if (!(HEAP32[$$124466$i + 12 >> 2] & 8)) {
      HEAP32[$$124466$i >> 2] = $$748$i; //@line 3011
      $700 = $$124466$i + 4 | 0; //@line 3012
      HEAP32[$700 >> 2] = (HEAP32[$700 >> 2] | 0) + $$723947$i; //@line 3015
      $704 = $$748$i + 8 | 0; //@line 3017
      $710 = $$748$i + (($704 & 7 | 0) == 0 ? 0 : 0 - $704 & 7) | 0; //@line 3023
      $712 = $690 + 8 | 0; //@line 3025
      $718 = $690 + (($712 & 7 | 0) == 0 ? 0 : 0 - $712 & 7) | 0; //@line 3031
      $722 = $710 + $$0197 | 0; //@line 3035
      $723 = $718 - $710 - $$0197 | 0; //@line 3036
      HEAP32[$710 + 4 >> 2] = $$0197 | 3; //@line 3039
      do {
       if (($636 | 0) == ($718 | 0)) {
        $728 = (HEAP32[216] | 0) + $723 | 0; //@line 3044
        HEAP32[216] = $728; //@line 3045
        HEAP32[219] = $722; //@line 3046
        HEAP32[$722 + 4 >> 2] = $728 | 1; //@line 3049
       } else {
        if ((HEAP32[218] | 0) == ($718 | 0)) {
         $734 = (HEAP32[215] | 0) + $723 | 0; //@line 3055
         HEAP32[215] = $734; //@line 3056
         HEAP32[218] = $722; //@line 3057
         HEAP32[$722 + 4 >> 2] = $734 | 1; //@line 3060
         HEAP32[$722 + $734 >> 2] = $734; //@line 3062
         break;
        }
        $739 = HEAP32[$718 + 4 >> 2] | 0; //@line 3066
        if (($739 & 3 | 0) == 1) {
         $742 = $739 & -8; //@line 3070
         $743 = $739 >>> 3; //@line 3071
         L311 : do {
          if ($739 >>> 0 < 256) {
           $746 = HEAP32[$718 + 8 >> 2] | 0; //@line 3076
           $748 = HEAP32[$718 + 12 >> 2] | 0; //@line 3078
           $750 = 892 + ($743 << 1 << 2) | 0; //@line 3080
           do {
            if (($746 | 0) != ($750 | 0)) {
             if ($753 >>> 0 > $746 >>> 0) {
              _abort(); //@line 3086
             }
             if ((HEAP32[$746 + 12 >> 2] | 0) == ($718 | 0)) {
              break;
             }
             _abort(); //@line 3095
            }
           } while (0);
           if (($748 | 0) == ($746 | 0)) {
            HEAP32[213] = HEAP32[213] & ~(1 << $743); //@line 3105
            break;
           }
           do {
            if (($748 | 0) == ($750 | 0)) {
             $$pre$phi11$i$iZ2D = $748 + 8 | 0; //@line 3112
            } else {
             if ($753 >>> 0 > $748 >>> 0) {
              _abort(); //@line 3116
             }
             $764 = $748 + 8 | 0; //@line 3119
             if ((HEAP32[$764 >> 2] | 0) == ($718 | 0)) {
              $$pre$phi11$i$iZ2D = $764; //@line 3123
              break;
             }
             _abort(); //@line 3126
            }
           } while (0);
           HEAP32[$746 + 12 >> 2] = $748; //@line 3131
           HEAP32[$$pre$phi11$i$iZ2D >> 2] = $746; //@line 3132
          } else {
           $769 = HEAP32[$718 + 24 >> 2] | 0; //@line 3135
           $771 = HEAP32[$718 + 12 >> 2] | 0; //@line 3137
           do {
            if (($771 | 0) == ($718 | 0)) {
             $782 = $718 + 16 | 0; //@line 3141
             $783 = $782 + 4 | 0; //@line 3142
             $784 = HEAP32[$783 >> 2] | 0; //@line 3143
             if (!$784) {
              $786 = HEAP32[$782 >> 2] | 0; //@line 3146
              if (!$786) {
               $$3$i$i = 0; //@line 3149
               break;
              } else {
               $$1291$i$i = $786; //@line 3152
               $$1293$i$i = $782; //@line 3152
              }
             } else {
              $$1291$i$i = $784; //@line 3155
              $$1293$i$i = $783; //@line 3155
             }
             while (1) {
              $788 = $$1291$i$i + 20 | 0; //@line 3158
              $789 = HEAP32[$788 >> 2] | 0; //@line 3159
              if ($789 | 0) {
               $$1291$i$i = $789; //@line 3162
               $$1293$i$i = $788; //@line 3162
               continue;
              }
              $791 = $$1291$i$i + 16 | 0; //@line 3165
              $792 = HEAP32[$791 >> 2] | 0; //@line 3166
              if (!$792) {
               break;
              } else {
               $$1291$i$i = $792; //@line 3171
               $$1293$i$i = $791; //@line 3171
              }
             }
             if ($753 >>> 0 > $$1293$i$i >>> 0) {
              _abort(); //@line 3176
             } else {
              HEAP32[$$1293$i$i >> 2] = 0; //@line 3179
              $$3$i$i = $$1291$i$i; //@line 3180
              break;
             }
            } else {
             $774 = HEAP32[$718 + 8 >> 2] | 0; //@line 3185
             if ($753 >>> 0 > $774 >>> 0) {
              _abort(); //@line 3188
             }
             $776 = $774 + 12 | 0; //@line 3191
             if ((HEAP32[$776 >> 2] | 0) != ($718 | 0)) {
              _abort(); //@line 3195
             }
             $779 = $771 + 8 | 0; //@line 3198
             if ((HEAP32[$779 >> 2] | 0) == ($718 | 0)) {
              HEAP32[$776 >> 2] = $771; //@line 3202
              HEAP32[$779 >> 2] = $774; //@line 3203
              $$3$i$i = $771; //@line 3204
              break;
             } else {
              _abort(); //@line 3207
             }
            }
           } while (0);
           if (!$769) {
            break;
           }
           $797 = HEAP32[$718 + 28 >> 2] | 0; //@line 3217
           $798 = 1156 + ($797 << 2) | 0; //@line 3218
           do {
            if ((HEAP32[$798 >> 2] | 0) == ($718 | 0)) {
             HEAP32[$798 >> 2] = $$3$i$i; //@line 3223
             if ($$3$i$i | 0) {
              break;
             }
             HEAP32[214] = HEAP32[214] & ~(1 << $797); //@line 3232
             break L311;
            } else {
             if ((HEAP32[217] | 0) >>> 0 > $769 >>> 0) {
              _abort(); //@line 3238
             } else {
              HEAP32[$769 + 16 + (((HEAP32[$769 + 16 >> 2] | 0) != ($718 | 0) & 1) << 2) >> 2] = $$3$i$i; //@line 3246
              if (!$$3$i$i) {
               break L311;
              } else {
               break;
              }
             }
            }
           } while (0);
           $812 = HEAP32[217] | 0; //@line 3256
           if ($812 >>> 0 > $$3$i$i >>> 0) {
            _abort(); //@line 3259
           }
           HEAP32[$$3$i$i + 24 >> 2] = $769; //@line 3263
           $815 = $718 + 16 | 0; //@line 3264
           $816 = HEAP32[$815 >> 2] | 0; //@line 3265
           do {
            if ($816 | 0) {
             if ($812 >>> 0 > $816 >>> 0) {
              _abort(); //@line 3271
             } else {
              HEAP32[$$3$i$i + 16 >> 2] = $816; //@line 3275
              HEAP32[$816 + 24 >> 2] = $$3$i$i; //@line 3277
              break;
             }
            }
           } while (0);
           $822 = HEAP32[$815 + 4 >> 2] | 0; //@line 3283
           if (!$822) {
            break;
           }
           if ((HEAP32[217] | 0) >>> 0 > $822 >>> 0) {
            _abort(); //@line 3291
           } else {
            HEAP32[$$3$i$i + 20 >> 2] = $822; //@line 3295
            HEAP32[$822 + 24 >> 2] = $$3$i$i; //@line 3297
            break;
           }
          }
         } while (0);
         $$0$i17$i = $718 + $742 | 0; //@line 3304
         $$0287$i$i = $742 + $723 | 0; //@line 3304
        } else {
         $$0$i17$i = $718; //@line 3306
         $$0287$i$i = $723; //@line 3306
        }
        $830 = $$0$i17$i + 4 | 0; //@line 3308
        HEAP32[$830 >> 2] = HEAP32[$830 >> 2] & -2; //@line 3311
        HEAP32[$722 + 4 >> 2] = $$0287$i$i | 1; //@line 3314
        HEAP32[$722 + $$0287$i$i >> 2] = $$0287$i$i; //@line 3316
        $836 = $$0287$i$i >>> 3; //@line 3317
        if ($$0287$i$i >>> 0 < 256) {
         $839 = 892 + ($836 << 1 << 2) | 0; //@line 3321
         $840 = HEAP32[213] | 0; //@line 3322
         $841 = 1 << $836; //@line 3323
         do {
          if (!($840 & $841)) {
           HEAP32[213] = $840 | $841; //@line 3329
           $$0295$i$i = $839; //@line 3331
           $$pre$phi$i19$iZ2D = $839 + 8 | 0; //@line 3331
          } else {
           $845 = $839 + 8 | 0; //@line 3333
           $846 = HEAP32[$845 >> 2] | 0; //@line 3334
           if ((HEAP32[217] | 0) >>> 0 <= $846 >>> 0) {
            $$0295$i$i = $846; //@line 3338
            $$pre$phi$i19$iZ2D = $845; //@line 3338
            break;
           }
           _abort(); //@line 3341
          }
         } while (0);
         HEAP32[$$pre$phi$i19$iZ2D >> 2] = $722; //@line 3345
         HEAP32[$$0295$i$i + 12 >> 2] = $722; //@line 3347
         HEAP32[$722 + 8 >> 2] = $$0295$i$i; //@line 3349
         HEAP32[$722 + 12 >> 2] = $839; //@line 3351
         break;
        }
        $852 = $$0287$i$i >>> 8; //@line 3354
        do {
         if (!$852) {
          $$0296$i$i = 0; //@line 3358
         } else {
          if ($$0287$i$i >>> 0 > 16777215) {
           $$0296$i$i = 31; //@line 3362
           break;
          }
          $857 = ($852 + 1048320 | 0) >>> 16 & 8; //@line 3367
          $858 = $852 << $857; //@line 3368
          $861 = ($858 + 520192 | 0) >>> 16 & 4; //@line 3371
          $863 = $858 << $861; //@line 3373
          $866 = ($863 + 245760 | 0) >>> 16 & 2; //@line 3376
          $871 = 14 - ($861 | $857 | $866) + ($863 << $866 >>> 15) | 0; //@line 3381
          $$0296$i$i = $$0287$i$i >>> ($871 + 7 | 0) & 1 | $871 << 1; //@line 3387
         }
        } while (0);
        $877 = 1156 + ($$0296$i$i << 2) | 0; //@line 3390
        HEAP32[$722 + 28 >> 2] = $$0296$i$i; //@line 3392
        $879 = $722 + 16 | 0; //@line 3393
        HEAP32[$879 + 4 >> 2] = 0; //@line 3395
        HEAP32[$879 >> 2] = 0; //@line 3396
        $881 = HEAP32[214] | 0; //@line 3397
        $882 = 1 << $$0296$i$i; //@line 3398
        if (!($881 & $882)) {
         HEAP32[214] = $881 | $882; //@line 3403
         HEAP32[$877 >> 2] = $722; //@line 3404
         HEAP32[$722 + 24 >> 2] = $877; //@line 3406
         HEAP32[$722 + 12 >> 2] = $722; //@line 3408
         HEAP32[$722 + 8 >> 2] = $722; //@line 3410
         break;
        }
        $$0288$i$i = $$0287$i$i << (($$0296$i$i | 0) == 31 ? 0 : 25 - ($$0296$i$i >>> 1) | 0); //@line 3419
        $$0289$i$i = HEAP32[$877 >> 2] | 0; //@line 3419
        while (1) {
         if ((HEAP32[$$0289$i$i + 4 >> 2] & -8 | 0) == ($$0287$i$i | 0)) {
          label = 263; //@line 3426
          break;
         }
         $900 = $$0289$i$i + 16 + ($$0288$i$i >>> 31 << 2) | 0; //@line 3430
         $902 = HEAP32[$900 >> 2] | 0; //@line 3432
         if (!$902) {
          label = 260; //@line 3435
          break;
         } else {
          $$0288$i$i = $$0288$i$i << 1; //@line 3438
          $$0289$i$i = $902; //@line 3438
         }
        }
        if ((label | 0) == 260) {
         if ((HEAP32[217] | 0) >>> 0 > $900 >>> 0) {
          _abort(); //@line 3445
         } else {
          HEAP32[$900 >> 2] = $722; //@line 3448
          HEAP32[$722 + 24 >> 2] = $$0289$i$i; //@line 3450
          HEAP32[$722 + 12 >> 2] = $722; //@line 3452
          HEAP32[$722 + 8 >> 2] = $722; //@line 3454
          break;
         }
        } else if ((label | 0) == 263) {
         $909 = $$0289$i$i + 8 | 0; //@line 3459
         $910 = HEAP32[$909 >> 2] | 0; //@line 3460
         $911 = HEAP32[217] | 0; //@line 3461
         if ($911 >>> 0 <= $910 >>> 0 & $911 >>> 0 <= $$0289$i$i >>> 0) {
          HEAP32[$910 + 12 >> 2] = $722; //@line 3467
          HEAP32[$909 >> 2] = $722; //@line 3468
          HEAP32[$722 + 8 >> 2] = $910; //@line 3470
          HEAP32[$722 + 12 >> 2] = $$0289$i$i; //@line 3472
          HEAP32[$722 + 24 >> 2] = 0; //@line 3474
          break;
         } else {
          _abort(); //@line 3477
         }
        }
       }
      } while (0);
      $$0 = $710 + 8 | 0; //@line 3484
      STACKTOP = sp; //@line 3485
      return $$0 | 0; //@line 3485
     } else {
      $$0$i$i$i = 1300; //@line 3487
     }
    }
    while (1) {
     $919 = HEAP32[$$0$i$i$i >> 2] | 0; //@line 3491
     if ($919 >>> 0 <= $636 >>> 0) {
      $923 = $919 + (HEAP32[$$0$i$i$i + 4 >> 2] | 0) | 0; //@line 3496
      if ($923 >>> 0 > $636 >>> 0) {
       break;
      }
     }
     $$0$i$i$i = HEAP32[$$0$i$i$i + 8 >> 2] | 0; //@line 3504
    }
    $927 = $923 + -47 | 0; //@line 3506
    $929 = $927 + 8 | 0; //@line 3508
    $935 = $927 + (($929 & 7 | 0) == 0 ? 0 : 0 - $929 & 7) | 0; //@line 3514
    $936 = $636 + 16 | 0; //@line 3515
    $938 = $935 >>> 0 < $936 >>> 0 ? $636 : $935; //@line 3517
    $939 = $938 + 8 | 0; //@line 3518
    $940 = $938 + 24 | 0; //@line 3519
    $941 = $$723947$i + -40 | 0; //@line 3520
    $943 = $$748$i + 8 | 0; //@line 3522
    $948 = ($943 & 7 | 0) == 0 ? 0 : 0 - $943 & 7; //@line 3527
    $949 = $$748$i + $948 | 0; //@line 3528
    $950 = $941 - $948 | 0; //@line 3529
    HEAP32[219] = $949; //@line 3530
    HEAP32[216] = $950; //@line 3531
    HEAP32[$949 + 4 >> 2] = $950 | 1; //@line 3534
    HEAP32[$$748$i + $941 + 4 >> 2] = 40; //@line 3537
    HEAP32[220] = HEAP32[335]; //@line 3539
    $956 = $938 + 4 | 0; //@line 3540
    HEAP32[$956 >> 2] = 27; //@line 3541
    HEAP32[$939 >> 2] = HEAP32[325]; //@line 3542
    HEAP32[$939 + 4 >> 2] = HEAP32[326]; //@line 3542
    HEAP32[$939 + 8 >> 2] = HEAP32[327]; //@line 3542
    HEAP32[$939 + 12 >> 2] = HEAP32[328]; //@line 3542
    HEAP32[325] = $$748$i; //@line 3543
    HEAP32[326] = $$723947$i; //@line 3544
    HEAP32[328] = 0; //@line 3545
    HEAP32[327] = $939; //@line 3546
    $958 = $940; //@line 3547
    do {
     $958$looptemp = $958;
     $958 = $958 + 4 | 0; //@line 3549
     HEAP32[$958 >> 2] = 7; //@line 3550
    } while (($958$looptemp + 8 | 0) >>> 0 < $923 >>> 0);
    if (($938 | 0) != ($636 | 0)) {
     $964 = $938 - $636 | 0; //@line 3563
     HEAP32[$956 >> 2] = HEAP32[$956 >> 2] & -2; //@line 3566
     HEAP32[$636 + 4 >> 2] = $964 | 1; //@line 3569
     HEAP32[$938 >> 2] = $964; //@line 3570
     $969 = $964 >>> 3; //@line 3571
     if ($964 >>> 0 < 256) {
      $972 = 892 + ($969 << 1 << 2) | 0; //@line 3575
      $973 = HEAP32[213] | 0; //@line 3576
      $974 = 1 << $969; //@line 3577
      if (!($973 & $974)) {
       HEAP32[213] = $973 | $974; //@line 3582
       $$0211$i$i = $972; //@line 3584
       $$pre$phi$i$iZ2D = $972 + 8 | 0; //@line 3584
      } else {
       $978 = $972 + 8 | 0; //@line 3586
       $979 = HEAP32[$978 >> 2] | 0; //@line 3587
       if ((HEAP32[217] | 0) >>> 0 > $979 >>> 0) {
        _abort(); //@line 3591
       } else {
        $$0211$i$i = $979; //@line 3594
        $$pre$phi$i$iZ2D = $978; //@line 3594
       }
      }
      HEAP32[$$pre$phi$i$iZ2D >> 2] = $636; //@line 3597
      HEAP32[$$0211$i$i + 12 >> 2] = $636; //@line 3599
      HEAP32[$636 + 8 >> 2] = $$0211$i$i; //@line 3601
      HEAP32[$636 + 12 >> 2] = $972; //@line 3603
      break;
     }
     $985 = $964 >>> 8; //@line 3606
     if (!$985) {
      $$0212$i$i = 0; //@line 3609
     } else {
      if ($964 >>> 0 > 16777215) {
       $$0212$i$i = 31; //@line 3613
      } else {
       $990 = ($985 + 1048320 | 0) >>> 16 & 8; //@line 3617
       $991 = $985 << $990; //@line 3618
       $994 = ($991 + 520192 | 0) >>> 16 & 4; //@line 3621
       $996 = $991 << $994; //@line 3623
       $999 = ($996 + 245760 | 0) >>> 16 & 2; //@line 3626
       $1004 = 14 - ($994 | $990 | $999) + ($996 << $999 >>> 15) | 0; //@line 3631
       $$0212$i$i = $964 >>> ($1004 + 7 | 0) & 1 | $1004 << 1; //@line 3637
      }
     }
     $1010 = 1156 + ($$0212$i$i << 2) | 0; //@line 3640
     HEAP32[$636 + 28 >> 2] = $$0212$i$i; //@line 3642
     HEAP32[$636 + 20 >> 2] = 0; //@line 3644
     HEAP32[$936 >> 2] = 0; //@line 3645
     $1013 = HEAP32[214] | 0; //@line 3646
     $1014 = 1 << $$0212$i$i; //@line 3647
     if (!($1013 & $1014)) {
      HEAP32[214] = $1013 | $1014; //@line 3652
      HEAP32[$1010 >> 2] = $636; //@line 3653
      HEAP32[$636 + 24 >> 2] = $1010; //@line 3655
      HEAP32[$636 + 12 >> 2] = $636; //@line 3657
      HEAP32[$636 + 8 >> 2] = $636; //@line 3659
      break;
     }
     $$0206$i$i = $964 << (($$0212$i$i | 0) == 31 ? 0 : 25 - ($$0212$i$i >>> 1) | 0); //@line 3668
     $$0207$i$i = HEAP32[$1010 >> 2] | 0; //@line 3668
     while (1) {
      if ((HEAP32[$$0207$i$i + 4 >> 2] & -8 | 0) == ($964 | 0)) {
       label = 289; //@line 3675
       break;
      }
      $1032 = $$0207$i$i + 16 + ($$0206$i$i >>> 31 << 2) | 0; //@line 3679
      $1034 = HEAP32[$1032 >> 2] | 0; //@line 3681
      if (!$1034) {
       label = 286; //@line 3684
       break;
      } else {
       $$0206$i$i = $$0206$i$i << 1; //@line 3687
       $$0207$i$i = $1034; //@line 3687
      }
     }
     if ((label | 0) == 286) {
      if ((HEAP32[217] | 0) >>> 0 > $1032 >>> 0) {
       _abort(); //@line 3694
      } else {
       HEAP32[$1032 >> 2] = $636; //@line 3697
       HEAP32[$636 + 24 >> 2] = $$0207$i$i; //@line 3699
       HEAP32[$636 + 12 >> 2] = $636; //@line 3701
       HEAP32[$636 + 8 >> 2] = $636; //@line 3703
       break;
      }
     } else if ((label | 0) == 289) {
      $1041 = $$0207$i$i + 8 | 0; //@line 3708
      $1042 = HEAP32[$1041 >> 2] | 0; //@line 3709
      $1043 = HEAP32[217] | 0; //@line 3710
      if ($1043 >>> 0 <= $1042 >>> 0 & $1043 >>> 0 <= $$0207$i$i >>> 0) {
       HEAP32[$1042 + 12 >> 2] = $636; //@line 3716
       HEAP32[$1041 >> 2] = $636; //@line 3717
       HEAP32[$636 + 8 >> 2] = $1042; //@line 3719
       HEAP32[$636 + 12 >> 2] = $$0207$i$i; //@line 3721
       HEAP32[$636 + 24 >> 2] = 0; //@line 3723
       break;
      } else {
       _abort(); //@line 3726
      }
     }
    }
   }
  } while (0);
  $1052 = HEAP32[216] | 0; //@line 3733
  if ($1052 >>> 0 > $$0197 >>> 0) {
   $1054 = $1052 - $$0197 | 0; //@line 3736
   HEAP32[216] = $1054; //@line 3737
   $1055 = HEAP32[219] | 0; //@line 3738
   $1056 = $1055 + $$0197 | 0; //@line 3739
   HEAP32[219] = $1056; //@line 3740
   HEAP32[$1056 + 4 >> 2] = $1054 | 1; //@line 3743
   HEAP32[$1055 + 4 >> 2] = $$0197 | 3; //@line 3746
   $$0 = $1055 + 8 | 0; //@line 3748
   STACKTOP = sp; //@line 3749
   return $$0 | 0; //@line 3749
  }
 }
 HEAP32[(___errno_location() | 0) >> 2] = 12; //@line 3753
 $$0 = 0; //@line 3754
 STACKTOP = sp; //@line 3755
 return $$0 | 0; //@line 3755
}
function _free($0) {
 $0 = $0 | 0;
 var $$0212$i = 0, $$0212$in$i = 0, $$0383 = 0, $$0384 = 0, $$0396 = 0, $$0403 = 0, $$1 = 0, $$1382 = 0, $$1387 = 0, $$1390 = 0, $$1398 = 0, $$1402 = 0, $$2 = 0, $$3 = 0, $$3400 = 0, $$pre$phi442Z2D = 0, $$pre$phi444Z2D = 0, $$pre$phiZ2D = 0, $10 = 0, $105 = 0, $106 = 0, $114 = 0, $115 = 0, $116 = 0, $124 = 0, $13 = 0, $132 = 0, $137 = 0, $138 = 0, $141 = 0, $143 = 0, $145 = 0, $16 = 0, $160 = 0, $165 = 0, $167 = 0, $17 = 0, $170 = 0, $173 = 0, $176 = 0, $179 = 0, $180 = 0, $181 = 0, $183 = 0, $185 = 0, $186 = 0, $188 = 0, $189 = 0, $195 = 0, $196 = 0, $2 = 0, $21 = 0, $210 = 0, $213 = 0, $214 = 0, $220 = 0, $235 = 0, $238 = 0, $239 = 0, $24 = 0, $240 = 0, $244 = 0, $245 = 0, $251 = 0, $256 = 0, $257 = 0, $26 = 0, $260 = 0, $262 = 0, $265 = 0, $270 = 0, $276 = 0, $28 = 0, $280 = 0, $281 = 0, $299 = 0, $3 = 0, $301 = 0, $308 = 0, $309 = 0, $310 = 0, $319 = 0, $41 = 0, $46 = 0, $48 = 0, $51 = 0, $53 = 0, $56 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $63 = 0, $65 = 0, $66 = 0, $68 = 0, $69 = 0, $7 = 0, $74 = 0, $75 = 0, $89 = 0, $9 = 0, $92 = 0, $93 = 0, $99 = 0, label = 0;
 if (!$0) {
  return;
 }
 $2 = $0 + -8 | 0; //@line 3782
 $3 = HEAP32[217] | 0; //@line 3783
 if ($2 >>> 0 < $3 >>> 0) {
  _abort(); //@line 3786
 }
 $6 = HEAP32[$0 + -4 >> 2] | 0; //@line 3790
 $7 = $6 & 3; //@line 3791
 if (($7 | 0) == 1) {
  _abort(); //@line 3794
 }
 $9 = $6 & -8; //@line 3797
 $10 = $2 + $9 | 0; //@line 3798
 L10 : do {
  if (!($6 & 1)) {
   $13 = HEAP32[$2 >> 2] | 0; //@line 3803
   if (!$7) {
    return;
   }
   $16 = $2 + (0 - $13) | 0; //@line 3809
   $17 = $13 + $9 | 0; //@line 3810
   if ($16 >>> 0 < $3 >>> 0) {
    _abort(); //@line 3813
   }
   if ((HEAP32[218] | 0) == ($16 | 0)) {
    $105 = $10 + 4 | 0; //@line 3819
    $106 = HEAP32[$105 >> 2] | 0; //@line 3820
    if (($106 & 3 | 0) != 3) {
     $$1 = $16; //@line 3824
     $$1382 = $17; //@line 3824
     $114 = $16; //@line 3824
     break;
    }
    HEAP32[215] = $17; //@line 3827
    HEAP32[$105 >> 2] = $106 & -2; //@line 3829
    HEAP32[$16 + 4 >> 2] = $17 | 1; //@line 3832
    HEAP32[$16 + $17 >> 2] = $17; //@line 3834
    return;
   }
   $21 = $13 >>> 3; //@line 3837
   if ($13 >>> 0 < 256) {
    $24 = HEAP32[$16 + 8 >> 2] | 0; //@line 3841
    $26 = HEAP32[$16 + 12 >> 2] | 0; //@line 3843
    $28 = 892 + ($21 << 1 << 2) | 0; //@line 3845
    if (($24 | 0) != ($28 | 0)) {
     if ($3 >>> 0 > $24 >>> 0) {
      _abort(); //@line 3850
     }
     if ((HEAP32[$24 + 12 >> 2] | 0) != ($16 | 0)) {
      _abort(); //@line 3857
     }
    }
    if (($26 | 0) == ($24 | 0)) {
     HEAP32[213] = HEAP32[213] & ~(1 << $21); //@line 3867
     $$1 = $16; //@line 3868
     $$1382 = $17; //@line 3868
     $114 = $16; //@line 3868
     break;
    }
    if (($26 | 0) == ($28 | 0)) {
     $$pre$phi444Z2D = $26 + 8 | 0; //@line 3874
    } else {
     if ($3 >>> 0 > $26 >>> 0) {
      _abort(); //@line 3878
     }
     $41 = $26 + 8 | 0; //@line 3881
     if ((HEAP32[$41 >> 2] | 0) == ($16 | 0)) {
      $$pre$phi444Z2D = $41; //@line 3885
     } else {
      _abort(); //@line 3887
     }
    }
    HEAP32[$24 + 12 >> 2] = $26; //@line 3892
    HEAP32[$$pre$phi444Z2D >> 2] = $24; //@line 3893
    $$1 = $16; //@line 3894
    $$1382 = $17; //@line 3894
    $114 = $16; //@line 3894
    break;
   }
   $46 = HEAP32[$16 + 24 >> 2] | 0; //@line 3898
   $48 = HEAP32[$16 + 12 >> 2] | 0; //@line 3900
   do {
    if (($48 | 0) == ($16 | 0)) {
     $59 = $16 + 16 | 0; //@line 3904
     $60 = $59 + 4 | 0; //@line 3905
     $61 = HEAP32[$60 >> 2] | 0; //@line 3906
     if (!$61) {
      $63 = HEAP32[$59 >> 2] | 0; //@line 3909
      if (!$63) {
       $$3 = 0; //@line 3912
       break;
      } else {
       $$1387 = $63; //@line 3915
       $$1390 = $59; //@line 3915
      }
     } else {
      $$1387 = $61; //@line 3918
      $$1390 = $60; //@line 3918
     }
     while (1) {
      $65 = $$1387 + 20 | 0; //@line 3921
      $66 = HEAP32[$65 >> 2] | 0; //@line 3922
      if ($66 | 0) {
       $$1387 = $66; //@line 3925
       $$1390 = $65; //@line 3925
       continue;
      }
      $68 = $$1387 + 16 | 0; //@line 3928
      $69 = HEAP32[$68 >> 2] | 0; //@line 3929
      if (!$69) {
       break;
      } else {
       $$1387 = $69; //@line 3934
       $$1390 = $68; //@line 3934
      }
     }
     if ($3 >>> 0 > $$1390 >>> 0) {
      _abort(); //@line 3939
     } else {
      HEAP32[$$1390 >> 2] = 0; //@line 3942
      $$3 = $$1387; //@line 3943
      break;
     }
    } else {
     $51 = HEAP32[$16 + 8 >> 2] | 0; //@line 3948
     if ($3 >>> 0 > $51 >>> 0) {
      _abort(); //@line 3951
     }
     $53 = $51 + 12 | 0; //@line 3954
     if ((HEAP32[$53 >> 2] | 0) != ($16 | 0)) {
      _abort(); //@line 3958
     }
     $56 = $48 + 8 | 0; //@line 3961
     if ((HEAP32[$56 >> 2] | 0) == ($16 | 0)) {
      HEAP32[$53 >> 2] = $48; //@line 3965
      HEAP32[$56 >> 2] = $51; //@line 3966
      $$3 = $48; //@line 3967
      break;
     } else {
      _abort(); //@line 3970
     }
    }
   } while (0);
   if (!$46) {
    $$1 = $16; //@line 3977
    $$1382 = $17; //@line 3977
    $114 = $16; //@line 3977
   } else {
    $74 = HEAP32[$16 + 28 >> 2] | 0; //@line 3980
    $75 = 1156 + ($74 << 2) | 0; //@line 3981
    do {
     if ((HEAP32[$75 >> 2] | 0) == ($16 | 0)) {
      HEAP32[$75 >> 2] = $$3; //@line 3986
      if (!$$3) {
       HEAP32[214] = HEAP32[214] & ~(1 << $74); //@line 3993
       $$1 = $16; //@line 3994
       $$1382 = $17; //@line 3994
       $114 = $16; //@line 3994
       break L10;
      }
     } else {
      if ((HEAP32[217] | 0) >>> 0 > $46 >>> 0) {
       _abort(); //@line 4001
      } else {
       HEAP32[$46 + 16 + (((HEAP32[$46 + 16 >> 2] | 0) != ($16 | 0) & 1) << 2) >> 2] = $$3; //@line 4009
       if (!$$3) {
        $$1 = $16; //@line 4012
        $$1382 = $17; //@line 4012
        $114 = $16; //@line 4012
        break L10;
       } else {
        break;
       }
      }
     }
    } while (0);
    $89 = HEAP32[217] | 0; //@line 4020
    if ($89 >>> 0 > $$3 >>> 0) {
     _abort(); //@line 4023
    }
    HEAP32[$$3 + 24 >> 2] = $46; //@line 4027
    $92 = $16 + 16 | 0; //@line 4028
    $93 = HEAP32[$92 >> 2] | 0; //@line 4029
    do {
     if ($93 | 0) {
      if ($89 >>> 0 > $93 >>> 0) {
       _abort(); //@line 4035
      } else {
       HEAP32[$$3 + 16 >> 2] = $93; //@line 4039
       HEAP32[$93 + 24 >> 2] = $$3; //@line 4041
       break;
      }
     }
    } while (0);
    $99 = HEAP32[$92 + 4 >> 2] | 0; //@line 4047
    if (!$99) {
     $$1 = $16; //@line 4050
     $$1382 = $17; //@line 4050
     $114 = $16; //@line 4050
    } else {
     if ((HEAP32[217] | 0) >>> 0 > $99 >>> 0) {
      _abort(); //@line 4055
     } else {
      HEAP32[$$3 + 20 >> 2] = $99; //@line 4059
      HEAP32[$99 + 24 >> 2] = $$3; //@line 4061
      $$1 = $16; //@line 4062
      $$1382 = $17; //@line 4062
      $114 = $16; //@line 4062
      break;
     }
    }
   }
  } else {
   $$1 = $2; //@line 4068
   $$1382 = $9; //@line 4068
   $114 = $2; //@line 4068
  }
 } while (0);
 if ($114 >>> 0 >= $10 >>> 0) {
  _abort(); //@line 4073
 }
 $115 = $10 + 4 | 0; //@line 4076
 $116 = HEAP32[$115 >> 2] | 0; //@line 4077
 if (!($116 & 1)) {
  _abort(); //@line 4081
 }
 if (!($116 & 2)) {
  if ((HEAP32[219] | 0) == ($10 | 0)) {
   $124 = (HEAP32[216] | 0) + $$1382 | 0; //@line 4091
   HEAP32[216] = $124; //@line 4092
   HEAP32[219] = $$1; //@line 4093
   HEAP32[$$1 + 4 >> 2] = $124 | 1; //@line 4096
   if (($$1 | 0) != (HEAP32[218] | 0)) {
    return;
   }
   HEAP32[218] = 0; //@line 4102
   HEAP32[215] = 0; //@line 4103
   return;
  }
  if ((HEAP32[218] | 0) == ($10 | 0)) {
   $132 = (HEAP32[215] | 0) + $$1382 | 0; //@line 4110
   HEAP32[215] = $132; //@line 4111
   HEAP32[218] = $114; //@line 4112
   HEAP32[$$1 + 4 >> 2] = $132 | 1; //@line 4115
   HEAP32[$114 + $132 >> 2] = $132; //@line 4117
   return;
  }
  $137 = ($116 & -8) + $$1382 | 0; //@line 4121
  $138 = $116 >>> 3; //@line 4122
  L108 : do {
   if ($116 >>> 0 < 256) {
    $141 = HEAP32[$10 + 8 >> 2] | 0; //@line 4127
    $143 = HEAP32[$10 + 12 >> 2] | 0; //@line 4129
    $145 = 892 + ($138 << 1 << 2) | 0; //@line 4131
    if (($141 | 0) != ($145 | 0)) {
     if ((HEAP32[217] | 0) >>> 0 > $141 >>> 0) {
      _abort(); //@line 4137
     }
     if ((HEAP32[$141 + 12 >> 2] | 0) != ($10 | 0)) {
      _abort(); //@line 4144
     }
    }
    if (($143 | 0) == ($141 | 0)) {
     HEAP32[213] = HEAP32[213] & ~(1 << $138); //@line 4154
     break;
    }
    if (($143 | 0) == ($145 | 0)) {
     $$pre$phi442Z2D = $143 + 8 | 0; //@line 4160
    } else {
     if ((HEAP32[217] | 0) >>> 0 > $143 >>> 0) {
      _abort(); //@line 4165
     }
     $160 = $143 + 8 | 0; //@line 4168
     if ((HEAP32[$160 >> 2] | 0) == ($10 | 0)) {
      $$pre$phi442Z2D = $160; //@line 4172
     } else {
      _abort(); //@line 4174
     }
    }
    HEAP32[$141 + 12 >> 2] = $143; //@line 4179
    HEAP32[$$pre$phi442Z2D >> 2] = $141; //@line 4180
   } else {
    $165 = HEAP32[$10 + 24 >> 2] | 0; //@line 4183
    $167 = HEAP32[$10 + 12 >> 2] | 0; //@line 4185
    do {
     if (($167 | 0) == ($10 | 0)) {
      $179 = $10 + 16 | 0; //@line 4189
      $180 = $179 + 4 | 0; //@line 4190
      $181 = HEAP32[$180 >> 2] | 0; //@line 4191
      if (!$181) {
       $183 = HEAP32[$179 >> 2] | 0; //@line 4194
       if (!$183) {
        $$3400 = 0; //@line 4197
        break;
       } else {
        $$1398 = $183; //@line 4200
        $$1402 = $179; //@line 4200
       }
      } else {
       $$1398 = $181; //@line 4203
       $$1402 = $180; //@line 4203
      }
      while (1) {
       $185 = $$1398 + 20 | 0; //@line 4206
       $186 = HEAP32[$185 >> 2] | 0; //@line 4207
       if ($186 | 0) {
        $$1398 = $186; //@line 4210
        $$1402 = $185; //@line 4210
        continue;
       }
       $188 = $$1398 + 16 | 0; //@line 4213
       $189 = HEAP32[$188 >> 2] | 0; //@line 4214
       if (!$189) {
        break;
       } else {
        $$1398 = $189; //@line 4219
        $$1402 = $188; //@line 4219
       }
      }
      if ((HEAP32[217] | 0) >>> 0 > $$1402 >>> 0) {
       _abort(); //@line 4225
      } else {
       HEAP32[$$1402 >> 2] = 0; //@line 4228
       $$3400 = $$1398; //@line 4229
       break;
      }
     } else {
      $170 = HEAP32[$10 + 8 >> 2] | 0; //@line 4234
      if ((HEAP32[217] | 0) >>> 0 > $170 >>> 0) {
       _abort(); //@line 4238
      }
      $173 = $170 + 12 | 0; //@line 4241
      if ((HEAP32[$173 >> 2] | 0) != ($10 | 0)) {
       _abort(); //@line 4245
      }
      $176 = $167 + 8 | 0; //@line 4248
      if ((HEAP32[$176 >> 2] | 0) == ($10 | 0)) {
       HEAP32[$173 >> 2] = $167; //@line 4252
       HEAP32[$176 >> 2] = $170; //@line 4253
       $$3400 = $167; //@line 4254
       break;
      } else {
       _abort(); //@line 4257
      }
     }
    } while (0);
    if ($165 | 0) {
     $195 = HEAP32[$10 + 28 >> 2] | 0; //@line 4265
     $196 = 1156 + ($195 << 2) | 0; //@line 4266
     do {
      if ((HEAP32[$196 >> 2] | 0) == ($10 | 0)) {
       HEAP32[$196 >> 2] = $$3400; //@line 4271
       if (!$$3400) {
        HEAP32[214] = HEAP32[214] & ~(1 << $195); //@line 4278
        break L108;
       }
      } else {
       if ((HEAP32[217] | 0) >>> 0 > $165 >>> 0) {
        _abort(); //@line 4285
       } else {
        HEAP32[$165 + 16 + (((HEAP32[$165 + 16 >> 2] | 0) != ($10 | 0) & 1) << 2) >> 2] = $$3400; //@line 4293
        if (!$$3400) {
         break L108;
        } else {
         break;
        }
       }
      }
     } while (0);
     $210 = HEAP32[217] | 0; //@line 4303
     if ($210 >>> 0 > $$3400 >>> 0) {
      _abort(); //@line 4306
     }
     HEAP32[$$3400 + 24 >> 2] = $165; //@line 4310
     $213 = $10 + 16 | 0; //@line 4311
     $214 = HEAP32[$213 >> 2] | 0; //@line 4312
     do {
      if ($214 | 0) {
       if ($210 >>> 0 > $214 >>> 0) {
        _abort(); //@line 4318
       } else {
        HEAP32[$$3400 + 16 >> 2] = $214; //@line 4322
        HEAP32[$214 + 24 >> 2] = $$3400; //@line 4324
        break;
       }
      }
     } while (0);
     $220 = HEAP32[$213 + 4 >> 2] | 0; //@line 4330
     if ($220 | 0) {
      if ((HEAP32[217] | 0) >>> 0 > $220 >>> 0) {
       _abort(); //@line 4336
      } else {
       HEAP32[$$3400 + 20 >> 2] = $220; //@line 4340
       HEAP32[$220 + 24 >> 2] = $$3400; //@line 4342
       break;
      }
     }
    }
   }
  } while (0);
  HEAP32[$$1 + 4 >> 2] = $137 | 1; //@line 4351
  HEAP32[$114 + $137 >> 2] = $137; //@line 4353
  if (($$1 | 0) == (HEAP32[218] | 0)) {
   HEAP32[215] = $137; //@line 4357
   return;
  } else {
   $$2 = $137; //@line 4360
  }
 } else {
  HEAP32[$115 >> 2] = $116 & -2; //@line 4364
  HEAP32[$$1 + 4 >> 2] = $$1382 | 1; //@line 4367
  HEAP32[$114 + $$1382 >> 2] = $$1382; //@line 4369
  $$2 = $$1382; //@line 4370
 }
 $235 = $$2 >>> 3; //@line 4372
 if ($$2 >>> 0 < 256) {
  $238 = 892 + ($235 << 1 << 2) | 0; //@line 4376
  $239 = HEAP32[213] | 0; //@line 4377
  $240 = 1 << $235; //@line 4378
  if (!($239 & $240)) {
   HEAP32[213] = $239 | $240; //@line 4383
   $$0403 = $238; //@line 4385
   $$pre$phiZ2D = $238 + 8 | 0; //@line 4385
  } else {
   $244 = $238 + 8 | 0; //@line 4387
   $245 = HEAP32[$244 >> 2] | 0; //@line 4388
   if ((HEAP32[217] | 0) >>> 0 > $245 >>> 0) {
    _abort(); //@line 4392
   } else {
    $$0403 = $245; //@line 4395
    $$pre$phiZ2D = $244; //@line 4395
   }
  }
  HEAP32[$$pre$phiZ2D >> 2] = $$1; //@line 4398
  HEAP32[$$0403 + 12 >> 2] = $$1; //@line 4400
  HEAP32[$$1 + 8 >> 2] = $$0403; //@line 4402
  HEAP32[$$1 + 12 >> 2] = $238; //@line 4404
  return;
 }
 $251 = $$2 >>> 8; //@line 4407
 if (!$251) {
  $$0396 = 0; //@line 4410
 } else {
  if ($$2 >>> 0 > 16777215) {
   $$0396 = 31; //@line 4414
  } else {
   $256 = ($251 + 1048320 | 0) >>> 16 & 8; //@line 4418
   $257 = $251 << $256; //@line 4419
   $260 = ($257 + 520192 | 0) >>> 16 & 4; //@line 4422
   $262 = $257 << $260; //@line 4424
   $265 = ($262 + 245760 | 0) >>> 16 & 2; //@line 4427
   $270 = 14 - ($260 | $256 | $265) + ($262 << $265 >>> 15) | 0; //@line 4432
   $$0396 = $$2 >>> ($270 + 7 | 0) & 1 | $270 << 1; //@line 4438
  }
 }
 $276 = 1156 + ($$0396 << 2) | 0; //@line 4441
 HEAP32[$$1 + 28 >> 2] = $$0396; //@line 4443
 HEAP32[$$1 + 20 >> 2] = 0; //@line 4446
 HEAP32[$$1 + 16 >> 2] = 0; //@line 4447
 $280 = HEAP32[214] | 0; //@line 4448
 $281 = 1 << $$0396; //@line 4449
 do {
  if (!($280 & $281)) {
   HEAP32[214] = $280 | $281; //@line 4455
   HEAP32[$276 >> 2] = $$1; //@line 4456
   HEAP32[$$1 + 24 >> 2] = $276; //@line 4458
   HEAP32[$$1 + 12 >> 2] = $$1; //@line 4460
   HEAP32[$$1 + 8 >> 2] = $$1; //@line 4462
  } else {
   $$0383 = $$2 << (($$0396 | 0) == 31 ? 0 : 25 - ($$0396 >>> 1) | 0); //@line 4470
   $$0384 = HEAP32[$276 >> 2] | 0; //@line 4470
   while (1) {
    if ((HEAP32[$$0384 + 4 >> 2] & -8 | 0) == ($$2 | 0)) {
     label = 124; //@line 4477
     break;
    }
    $299 = $$0384 + 16 + ($$0383 >>> 31 << 2) | 0; //@line 4481
    $301 = HEAP32[$299 >> 2] | 0; //@line 4483
    if (!$301) {
     label = 121; //@line 4486
     break;
    } else {
     $$0383 = $$0383 << 1; //@line 4489
     $$0384 = $301; //@line 4489
    }
   }
   if ((label | 0) == 121) {
    if ((HEAP32[217] | 0) >>> 0 > $299 >>> 0) {
     _abort(); //@line 4496
    } else {
     HEAP32[$299 >> 2] = $$1; //@line 4499
     HEAP32[$$1 + 24 >> 2] = $$0384; //@line 4501
     HEAP32[$$1 + 12 >> 2] = $$1; //@line 4503
     HEAP32[$$1 + 8 >> 2] = $$1; //@line 4505
     break;
    }
   } else if ((label | 0) == 124) {
    $308 = $$0384 + 8 | 0; //@line 4510
    $309 = HEAP32[$308 >> 2] | 0; //@line 4511
    $310 = HEAP32[217] | 0; //@line 4512
    if ($310 >>> 0 <= $309 >>> 0 & $310 >>> 0 <= $$0384 >>> 0) {
     HEAP32[$309 + 12 >> 2] = $$1; //@line 4518
     HEAP32[$308 >> 2] = $$1; //@line 4519
     HEAP32[$$1 + 8 >> 2] = $309; //@line 4521
     HEAP32[$$1 + 12 >> 2] = $$0384; //@line 4523
     HEAP32[$$1 + 24 >> 2] = 0; //@line 4525
     break;
    } else {
     _abort(); //@line 4528
    }
   }
  }
 } while (0);
 $319 = (HEAP32[221] | 0) + -1 | 0; //@line 4535
 HEAP32[221] = $319; //@line 4536
 if (!$319) {
  $$0212$in$i = 1308; //@line 4539
 } else {
  return;
 }
 while (1) {
  $$0212$i = HEAP32[$$0212$in$i >> 2] | 0; //@line 4544
  if (!$$0212$i) {
   break;
  } else {
   $$0212$in$i = $$0212$i + 8 | 0; //@line 4550
  }
 }
 HEAP32[221] = -1; //@line 4553
 return;
}
function _main() {
 var $AsyncCtx = 0, $AsyncCtx101 = 0, $AsyncCtx104 = 0, $AsyncCtx107 = 0, $AsyncCtx11 = 0, $AsyncCtx15 = 0, $AsyncCtx19 = 0, $AsyncCtx23 = 0, $AsyncCtx27 = 0, $AsyncCtx3 = 0, $AsyncCtx31 = 0, $AsyncCtx35 = 0, $AsyncCtx39 = 0, $AsyncCtx43 = 0, $AsyncCtx47 = 0, $AsyncCtx51 = 0, $AsyncCtx55 = 0, $AsyncCtx59 = 0, $AsyncCtx62 = 0, $AsyncCtx65 = 0, $AsyncCtx68 = 0, $AsyncCtx7 = 0, $AsyncCtx71 = 0, $AsyncCtx74 = 0, $AsyncCtx77 = 0, $AsyncCtx80 = 0, $AsyncCtx83 = 0, $AsyncCtx86 = 0, $AsyncCtx89 = 0, $AsyncCtx92 = 0, $AsyncCtx95 = 0, $AsyncCtx98 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 955
 while (1) {
  $AsyncCtx59 = _emscripten_alloc_async_context(4, sp) | 0; //@line 957
  __ZN4mbed6BusOutaSEi(776, 0) | 0; //@line 958
  if (___async) {
   label = 3; //@line 961
   break;
  }
  _emscripten_free_async_context($AsyncCtx59 | 0); //@line 964
  $AsyncCtx107 = _emscripten_alloc_async_context(4, sp) | 0; //@line 965
  _wait(.25); //@line 966
  if (___async) {
   label = 5; //@line 969
   break;
  }
  _emscripten_free_async_context($AsyncCtx107 | 0); //@line 972
  $AsyncCtx55 = _emscripten_alloc_async_context(4, sp) | 0; //@line 973
  __ZN4mbed6BusOutaSEi(776, 1) | 0; //@line 974
  if (___async) {
   label = 7; //@line 977
   break;
  }
  _emscripten_free_async_context($AsyncCtx55 | 0); //@line 980
  $AsyncCtx104 = _emscripten_alloc_async_context(4, sp) | 0; //@line 981
  _wait(.25); //@line 982
  if (___async) {
   label = 9; //@line 985
   break;
  }
  _emscripten_free_async_context($AsyncCtx104 | 0); //@line 988
  $AsyncCtx51 = _emscripten_alloc_async_context(4, sp) | 0; //@line 989
  __ZN4mbed6BusOutaSEi(776, 2) | 0; //@line 990
  if (___async) {
   label = 11; //@line 993
   break;
  }
  _emscripten_free_async_context($AsyncCtx51 | 0); //@line 996
  $AsyncCtx101 = _emscripten_alloc_async_context(4, sp) | 0; //@line 997
  _wait(.25); //@line 998
  if (___async) {
   label = 13; //@line 1001
   break;
  }
  _emscripten_free_async_context($AsyncCtx101 | 0); //@line 1004
  $AsyncCtx47 = _emscripten_alloc_async_context(4, sp) | 0; //@line 1005
  __ZN4mbed6BusOutaSEi(776, 3) | 0; //@line 1006
  if (___async) {
   label = 15; //@line 1009
   break;
  }
  _emscripten_free_async_context($AsyncCtx47 | 0); //@line 1012
  $AsyncCtx98 = _emscripten_alloc_async_context(4, sp) | 0; //@line 1013
  _wait(.25); //@line 1014
  if (___async) {
   label = 17; //@line 1017
   break;
  }
  _emscripten_free_async_context($AsyncCtx98 | 0); //@line 1020
  $AsyncCtx43 = _emscripten_alloc_async_context(4, sp) | 0; //@line 1021
  __ZN4mbed6BusOutaSEi(776, 4) | 0; //@line 1022
  if (___async) {
   label = 19; //@line 1025
   break;
  }
  _emscripten_free_async_context($AsyncCtx43 | 0); //@line 1028
  $AsyncCtx95 = _emscripten_alloc_async_context(4, sp) | 0; //@line 1029
  _wait(.25); //@line 1030
  if (___async) {
   label = 21; //@line 1033
   break;
  }
  _emscripten_free_async_context($AsyncCtx95 | 0); //@line 1036
  $AsyncCtx39 = _emscripten_alloc_async_context(4, sp) | 0; //@line 1037
  __ZN4mbed6BusOutaSEi(776, 5) | 0; //@line 1038
  if (___async) {
   label = 23; //@line 1041
   break;
  }
  _emscripten_free_async_context($AsyncCtx39 | 0); //@line 1044
  $AsyncCtx92 = _emscripten_alloc_async_context(4, sp) | 0; //@line 1045
  _wait(.25); //@line 1046
  if (___async) {
   label = 25; //@line 1049
   break;
  }
  _emscripten_free_async_context($AsyncCtx92 | 0); //@line 1052
  $AsyncCtx35 = _emscripten_alloc_async_context(4, sp) | 0; //@line 1053
  __ZN4mbed6BusOutaSEi(776, 6) | 0; //@line 1054
  if (___async) {
   label = 27; //@line 1057
   break;
  }
  _emscripten_free_async_context($AsyncCtx35 | 0); //@line 1060
  $AsyncCtx89 = _emscripten_alloc_async_context(4, sp) | 0; //@line 1061
  _wait(.25); //@line 1062
  if (___async) {
   label = 29; //@line 1065
   break;
  }
  _emscripten_free_async_context($AsyncCtx89 | 0); //@line 1068
  $AsyncCtx31 = _emscripten_alloc_async_context(4, sp) | 0; //@line 1069
  __ZN4mbed6BusOutaSEi(776, 7) | 0; //@line 1070
  if (___async) {
   label = 31; //@line 1073
   break;
  }
  _emscripten_free_async_context($AsyncCtx31 | 0); //@line 1076
  $AsyncCtx86 = _emscripten_alloc_async_context(4, sp) | 0; //@line 1077
  _wait(.25); //@line 1078
  if (___async) {
   label = 33; //@line 1081
   break;
  }
  _emscripten_free_async_context($AsyncCtx86 | 0); //@line 1084
  $AsyncCtx27 = _emscripten_alloc_async_context(4, sp) | 0; //@line 1085
  __ZN4mbed6BusOutaSEi(776, 8) | 0; //@line 1086
  if (___async) {
   label = 35; //@line 1089
   break;
  }
  _emscripten_free_async_context($AsyncCtx27 | 0); //@line 1092
  $AsyncCtx83 = _emscripten_alloc_async_context(4, sp) | 0; //@line 1093
  _wait(.25); //@line 1094
  if (___async) {
   label = 37; //@line 1097
   break;
  }
  _emscripten_free_async_context($AsyncCtx83 | 0); //@line 1100
  $AsyncCtx23 = _emscripten_alloc_async_context(4, sp) | 0; //@line 1101
  __ZN4mbed6BusOutaSEi(776, 9) | 0; //@line 1102
  if (___async) {
   label = 39; //@line 1105
   break;
  }
  _emscripten_free_async_context($AsyncCtx23 | 0); //@line 1108
  $AsyncCtx80 = _emscripten_alloc_async_context(4, sp) | 0; //@line 1109
  _wait(.25); //@line 1110
  if (___async) {
   label = 41; //@line 1113
   break;
  }
  _emscripten_free_async_context($AsyncCtx80 | 0); //@line 1116
  $AsyncCtx19 = _emscripten_alloc_async_context(4, sp) | 0; //@line 1117
  __ZN4mbed6BusOutaSEi(776, 10) | 0; //@line 1118
  if (___async) {
   label = 43; //@line 1121
   break;
  }
  _emscripten_free_async_context($AsyncCtx19 | 0); //@line 1124
  $AsyncCtx77 = _emscripten_alloc_async_context(4, sp) | 0; //@line 1125
  _wait(.25); //@line 1126
  if (___async) {
   label = 45; //@line 1129
   break;
  }
  _emscripten_free_async_context($AsyncCtx77 | 0); //@line 1132
  $AsyncCtx15 = _emscripten_alloc_async_context(4, sp) | 0; //@line 1133
  __ZN4mbed6BusOutaSEi(776, 11) | 0; //@line 1134
  if (___async) {
   label = 47; //@line 1137
   break;
  }
  _emscripten_free_async_context($AsyncCtx15 | 0); //@line 1140
  $AsyncCtx74 = _emscripten_alloc_async_context(4, sp) | 0; //@line 1141
  _wait(.25); //@line 1142
  if (___async) {
   label = 49; //@line 1145
   break;
  }
  _emscripten_free_async_context($AsyncCtx74 | 0); //@line 1148
  $AsyncCtx11 = _emscripten_alloc_async_context(4, sp) | 0; //@line 1149
  __ZN4mbed6BusOutaSEi(776, 12) | 0; //@line 1150
  if (___async) {
   label = 51; //@line 1153
   break;
  }
  _emscripten_free_async_context($AsyncCtx11 | 0); //@line 1156
  $AsyncCtx71 = _emscripten_alloc_async_context(4, sp) | 0; //@line 1157
  _wait(.25); //@line 1158
  if (___async) {
   label = 53; //@line 1161
   break;
  }
  _emscripten_free_async_context($AsyncCtx71 | 0); //@line 1164
  $AsyncCtx7 = _emscripten_alloc_async_context(4, sp) | 0; //@line 1165
  __ZN4mbed6BusOutaSEi(776, 13) | 0; //@line 1166
  if (___async) {
   label = 55; //@line 1169
   break;
  }
  _emscripten_free_async_context($AsyncCtx7 | 0); //@line 1172
  $AsyncCtx68 = _emscripten_alloc_async_context(4, sp) | 0; //@line 1173
  _wait(.25); //@line 1174
  if (___async) {
   label = 57; //@line 1177
   break;
  }
  _emscripten_free_async_context($AsyncCtx68 | 0); //@line 1180
  $AsyncCtx3 = _emscripten_alloc_async_context(4, sp) | 0; //@line 1181
  __ZN4mbed6BusOutaSEi(776, 14) | 0; //@line 1182
  if (___async) {
   label = 59; //@line 1185
   break;
  }
  _emscripten_free_async_context($AsyncCtx3 | 0); //@line 1188
  $AsyncCtx65 = _emscripten_alloc_async_context(4, sp) | 0; //@line 1189
  _wait(.25); //@line 1190
  if (___async) {
   label = 61; //@line 1193
   break;
  }
  _emscripten_free_async_context($AsyncCtx65 | 0); //@line 1196
  $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 1197
  __ZN4mbed6BusOutaSEi(776, 15) | 0; //@line 1198
  if (___async) {
   label = 63; //@line 1201
   break;
  }
  _emscripten_free_async_context($AsyncCtx | 0); //@line 1204
  $AsyncCtx62 = _emscripten_alloc_async_context(4, sp) | 0; //@line 1205
  _wait(.25); //@line 1206
  if (___async) {
   label = 65; //@line 1209
   break;
  }
  _emscripten_free_async_context($AsyncCtx62 | 0); //@line 1212
 }
 switch (label | 0) {
 case 3:
  {
   HEAP32[$AsyncCtx59 >> 2] = 37; //@line 1216
   sp = STACKTOP; //@line 1217
   return 0; //@line 1218
  }
 case 5:
  {
   HEAP32[$AsyncCtx107 >> 2] = 38; //@line 1222
   sp = STACKTOP; //@line 1223
   return 0; //@line 1224
  }
 case 7:
  {
   HEAP32[$AsyncCtx55 >> 2] = 39; //@line 1228
   sp = STACKTOP; //@line 1229
   return 0; //@line 1230
  }
 case 9:
  {
   HEAP32[$AsyncCtx104 >> 2] = 40; //@line 1234
   sp = STACKTOP; //@line 1235
   return 0; //@line 1236
  }
 case 11:
  {
   HEAP32[$AsyncCtx51 >> 2] = 41; //@line 1240
   sp = STACKTOP; //@line 1241
   return 0; //@line 1242
  }
 case 13:
  {
   HEAP32[$AsyncCtx101 >> 2] = 42; //@line 1246
   sp = STACKTOP; //@line 1247
   return 0; //@line 1248
  }
 case 15:
  {
   HEAP32[$AsyncCtx47 >> 2] = 43; //@line 1252
   sp = STACKTOP; //@line 1253
   return 0; //@line 1254
  }
 case 17:
  {
   HEAP32[$AsyncCtx98 >> 2] = 44; //@line 1258
   sp = STACKTOP; //@line 1259
   return 0; //@line 1260
  }
 case 19:
  {
   HEAP32[$AsyncCtx43 >> 2] = 45; //@line 1264
   sp = STACKTOP; //@line 1265
   return 0; //@line 1266
  }
 case 21:
  {
   HEAP32[$AsyncCtx95 >> 2] = 46; //@line 1270
   sp = STACKTOP; //@line 1271
   return 0; //@line 1272
  }
 case 23:
  {
   HEAP32[$AsyncCtx39 >> 2] = 47; //@line 1276
   sp = STACKTOP; //@line 1277
   return 0; //@line 1278
  }
 case 25:
  {
   HEAP32[$AsyncCtx92 >> 2] = 48; //@line 1282
   sp = STACKTOP; //@line 1283
   return 0; //@line 1284
  }
 case 27:
  {
   HEAP32[$AsyncCtx35 >> 2] = 49; //@line 1288
   sp = STACKTOP; //@line 1289
   return 0; //@line 1290
  }
 case 29:
  {
   HEAP32[$AsyncCtx89 >> 2] = 50; //@line 1294
   sp = STACKTOP; //@line 1295
   return 0; //@line 1296
  }
 case 31:
  {
   HEAP32[$AsyncCtx31 >> 2] = 51; //@line 1300
   sp = STACKTOP; //@line 1301
   return 0; //@line 1302
  }
 case 33:
  {
   HEAP32[$AsyncCtx86 >> 2] = 52; //@line 1306
   sp = STACKTOP; //@line 1307
   return 0; //@line 1308
  }
 case 35:
  {
   HEAP32[$AsyncCtx27 >> 2] = 53; //@line 1312
   sp = STACKTOP; //@line 1313
   return 0; //@line 1314
  }
 case 37:
  {
   HEAP32[$AsyncCtx83 >> 2] = 54; //@line 1318
   sp = STACKTOP; //@line 1319
   return 0; //@line 1320
  }
 case 39:
  {
   HEAP32[$AsyncCtx23 >> 2] = 55; //@line 1324
   sp = STACKTOP; //@line 1325
   return 0; //@line 1326
  }
 case 41:
  {
   HEAP32[$AsyncCtx80 >> 2] = 56; //@line 1330
   sp = STACKTOP; //@line 1331
   return 0; //@line 1332
  }
 case 43:
  {
   HEAP32[$AsyncCtx19 >> 2] = 57; //@line 1336
   sp = STACKTOP; //@line 1337
   return 0; //@line 1338
  }
 case 45:
  {
   HEAP32[$AsyncCtx77 >> 2] = 58; //@line 1342
   sp = STACKTOP; //@line 1343
   return 0; //@line 1344
  }
 case 47:
  {
   HEAP32[$AsyncCtx15 >> 2] = 59; //@line 1348
   sp = STACKTOP; //@line 1349
   return 0; //@line 1350
  }
 case 49:
  {
   HEAP32[$AsyncCtx74 >> 2] = 60; //@line 1354
   sp = STACKTOP; //@line 1355
   return 0; //@line 1356
  }
 case 51:
  {
   HEAP32[$AsyncCtx11 >> 2] = 61; //@line 1360
   sp = STACKTOP; //@line 1361
   return 0; //@line 1362
  }
 case 53:
  {
   HEAP32[$AsyncCtx71 >> 2] = 62; //@line 1366
   sp = STACKTOP; //@line 1367
   return 0; //@line 1368
  }
 case 55:
  {
   HEAP32[$AsyncCtx7 >> 2] = 63; //@line 1372
   sp = STACKTOP; //@line 1373
   return 0; //@line 1374
  }
 case 57:
  {
   HEAP32[$AsyncCtx68 >> 2] = 64; //@line 1378
   sp = STACKTOP; //@line 1379
   return 0; //@line 1380
  }
 case 59:
  {
   HEAP32[$AsyncCtx3 >> 2] = 65; //@line 1384
   sp = STACKTOP; //@line 1385
   return 0; //@line 1386
  }
 case 61:
  {
   HEAP32[$AsyncCtx65 >> 2] = 66; //@line 1390
   sp = STACKTOP; //@line 1391
   return 0; //@line 1392
  }
 case 63:
  {
   HEAP32[$AsyncCtx >> 2] = 67; //@line 1396
   sp = STACKTOP; //@line 1397
   return 0; //@line 1398
  }
 case 65:
  {
   HEAP32[$AsyncCtx62 >> 2] = 68; //@line 1402
   sp = STACKTOP; //@line 1403
   return 0; //@line 1404
  }
 }
 return 0; //@line 1408
}
function __ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($0, $1, $2, $3, $4) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 var $$0 = 0, $$081$off0 = 0, $$084 = 0, $$085$off0 = 0, $$1 = 0, $$182$off0 = 0, $$186$off0 = 0, $$2 = 0, $$283$off0 = 0, $100 = 0, $104 = 0, $105 = 0, $106 = 0, $122 = 0, $13 = 0, $136 = 0, $19 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $30 = 0, $61 = 0, $69 = 0, $72 = 0, $73 = 0, $81 = 0, $84 = 0, $87 = 0, $90 = 0, $AsyncCtx = 0, $AsyncCtx11 = 0, $AsyncCtx15 = 0, $AsyncCtx3 = 0, $AsyncCtx7 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 5488
 L1 : do {
  if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, $4) | 0) {
   __ZNK10__cxxabiv117__class_type_info29process_static_type_below_dstEPNS_19__dynamic_cast_infoEPKvi(0, $1, $2, $3); //@line 5494
  } else {
   if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 >> 2] | 0, $4) | 0) {
    if ((HEAP32[$1 + 16 >> 2] | 0) != ($2 | 0)) {
     $13 = $1 + 20 | 0; //@line 5503
     if ((HEAP32[$13 >> 2] | 0) != ($2 | 0)) {
      HEAP32[$1 + 32 >> 2] = $3; //@line 5508
      $19 = $1 + 44 | 0; //@line 5509
      if ((HEAP32[$19 >> 2] | 0) == 4) {
       break;
      }
      $25 = $0 + 16 + (HEAP32[$0 + 12 >> 2] << 3) | 0; //@line 5518
      $26 = $1 + 52 | 0; //@line 5519
      $27 = $1 + 53 | 0; //@line 5520
      $28 = $1 + 54 | 0; //@line 5521
      $29 = $0 + 8 | 0; //@line 5522
      $30 = $1 + 24 | 0; //@line 5523
      $$081$off0 = 0; //@line 5524
      $$084 = $0 + 16 | 0; //@line 5524
      $$085$off0 = 0; //@line 5524
      L10 : while (1) {
       if ($$084 >>> 0 >= $25 >>> 0) {
        $$283$off0 = $$081$off0; //@line 5528
        label = 20; //@line 5529
        break;
       }
       HEAP8[$26 >> 0] = 0; //@line 5532
       HEAP8[$27 >> 0] = 0; //@line 5533
       $AsyncCtx15 = _emscripten_alloc_async_context(56, sp) | 0; //@line 5534
       __ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($$084, $1, $2, $2, 1, $4); //@line 5535
       if (___async) {
        label = 12; //@line 5538
        break;
       }
       _emscripten_free_async_context($AsyncCtx15 | 0); //@line 5541
       if (HEAP8[$28 >> 0] | 0) {
        $$283$off0 = $$081$off0; //@line 5545
        label = 20; //@line 5546
        break;
       }
       do {
        if (!(HEAP8[$27 >> 0] | 0)) {
         $$182$off0 = $$081$off0; //@line 5553
         $$186$off0 = $$085$off0; //@line 5553
        } else {
         if (!(HEAP8[$26 >> 0] | 0)) {
          if (!(HEAP32[$29 >> 2] & 1)) {
           $$283$off0 = 1; //@line 5562
           label = 20; //@line 5563
           break L10;
          } else {
           $$182$off0 = 1; //@line 5566
           $$186$off0 = $$085$off0; //@line 5566
           break;
          }
         }
         if ((HEAP32[$30 >> 2] | 0) == 1) {
          label = 25; //@line 5573
          break L10;
         }
         if (!(HEAP32[$29 >> 2] & 2)) {
          label = 25; //@line 5580
          break L10;
         } else {
          $$182$off0 = 1; //@line 5583
          $$186$off0 = 1; //@line 5583
         }
        }
       } while (0);
       $$081$off0 = $$182$off0; //@line 5588
       $$084 = $$084 + 8 | 0; //@line 5588
       $$085$off0 = $$186$off0; //@line 5588
      }
      if ((label | 0) == 12) {
       HEAP32[$AsyncCtx15 >> 2] = 80; //@line 5591
       HEAP32[$AsyncCtx15 + 4 >> 2] = $25; //@line 5593
       HEAP32[$AsyncCtx15 + 8 >> 2] = $26; //@line 5595
       HEAP32[$AsyncCtx15 + 12 >> 2] = $27; //@line 5597
       HEAP32[$AsyncCtx15 + 16 >> 2] = $1; //@line 5599
       HEAP32[$AsyncCtx15 + 20 >> 2] = $2; //@line 5601
       HEAP8[$AsyncCtx15 + 24 >> 0] = $4 & 1; //@line 5604
       HEAP32[$AsyncCtx15 + 28 >> 2] = $28; //@line 5606
       HEAP32[$AsyncCtx15 + 32 >> 2] = $19; //@line 5608
       HEAP32[$AsyncCtx15 + 36 >> 2] = $30; //@line 5610
       HEAP32[$AsyncCtx15 + 40 >> 2] = $29; //@line 5612
       HEAP8[$AsyncCtx15 + 44 >> 0] = $$085$off0 & 1; //@line 5615
       HEAP8[$AsyncCtx15 + 45 >> 0] = $$081$off0 & 1; //@line 5618
       HEAP32[$AsyncCtx15 + 48 >> 2] = $$084; //@line 5620
       HEAP32[$AsyncCtx15 + 52 >> 2] = $13; //@line 5622
       sp = STACKTOP; //@line 5623
       return;
      }
      do {
       if ((label | 0) == 20) {
        if (!$$085$off0) {
         HEAP32[$13 >> 2] = $2; //@line 5629
         $61 = $1 + 40 | 0; //@line 5630
         HEAP32[$61 >> 2] = (HEAP32[$61 >> 2] | 0) + 1; //@line 5633
         if ((HEAP32[$1 + 36 >> 2] | 0) == 1) {
          if ((HEAP32[$30 >> 2] | 0) == 2) {
           HEAP8[$28 >> 0] = 1; //@line 5641
           if ($$283$off0) {
            label = 25; //@line 5643
            break;
           } else {
            $69 = 4; //@line 5646
            break;
           }
          }
         }
        }
        if ($$283$off0) {
         label = 25; //@line 5653
        } else {
         $69 = 4; //@line 5655
        }
       }
      } while (0);
      if ((label | 0) == 25) {
       $69 = 3; //@line 5660
      }
      HEAP32[$19 >> 2] = $69; //@line 5662
      break;
     }
    }
    if (($3 | 0) != 1) {
     break;
    }
    HEAP32[$1 + 32 >> 2] = 1; //@line 5671
    break;
   }
   $72 = HEAP32[$0 + 12 >> 2] | 0; //@line 5676
   $73 = $0 + 16 + ($72 << 3) | 0; //@line 5677
   $AsyncCtx11 = _emscripten_alloc_async_context(32, sp) | 0; //@line 5678
   __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($0 + 16 | 0, $1, $2, $3, $4); //@line 5679
   if (___async) {
    HEAP32[$AsyncCtx11 >> 2] = 81; //@line 5682
    HEAP32[$AsyncCtx11 + 4 >> 2] = $1; //@line 5684
    HEAP32[$AsyncCtx11 + 8 >> 2] = $2; //@line 5686
    HEAP32[$AsyncCtx11 + 12 >> 2] = $3; //@line 5688
    HEAP8[$AsyncCtx11 + 16 >> 0] = $4 & 1; //@line 5691
    HEAP32[$AsyncCtx11 + 20 >> 2] = $73; //@line 5693
    HEAP32[$AsyncCtx11 + 24 >> 2] = $0; //@line 5695
    HEAP32[$AsyncCtx11 + 28 >> 2] = $72; //@line 5697
    sp = STACKTOP; //@line 5698
    return;
   }
   _emscripten_free_async_context($AsyncCtx11 | 0); //@line 5701
   $81 = $0 + 24 | 0; //@line 5702
   if (($72 | 0) > 1) {
    $84 = HEAP32[$0 + 8 >> 2] | 0; //@line 5706
    if (!($84 & 2)) {
     $87 = $1 + 36 | 0; //@line 5710
     if ((HEAP32[$87 >> 2] | 0) != 1) {
      if (!($84 & 1)) {
       $106 = $1 + 54 | 0; //@line 5717
       $$2 = $81; //@line 5718
       while (1) {
        if (HEAP8[$106 >> 0] | 0) {
         break L1;
        }
        if ((HEAP32[$87 >> 2] | 0) == 1) {
         break L1;
        }
        $AsyncCtx = _emscripten_alloc_async_context(36, sp) | 0; //@line 5730
        __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($$2, $1, $2, $3, $4); //@line 5731
        if (___async) {
         break;
        }
        _emscripten_free_async_context($AsyncCtx | 0); //@line 5736
        $136 = $$2 + 8 | 0; //@line 5737
        if ($136 >>> 0 < $73 >>> 0) {
         $$2 = $136; //@line 5740
        } else {
         break L1;
        }
       }
       HEAP32[$AsyncCtx >> 2] = 84; //@line 5745
       HEAP32[$AsyncCtx + 4 >> 2] = $$2; //@line 5747
       HEAP32[$AsyncCtx + 8 >> 2] = $73; //@line 5749
       HEAP32[$AsyncCtx + 12 >> 2] = $106; //@line 5751
       HEAP32[$AsyncCtx + 16 >> 2] = $87; //@line 5753
       HEAP32[$AsyncCtx + 20 >> 2] = $1; //@line 5755
       HEAP32[$AsyncCtx + 24 >> 2] = $2; //@line 5757
       HEAP32[$AsyncCtx + 28 >> 2] = $3; //@line 5759
       HEAP8[$AsyncCtx + 32 >> 0] = $4 & 1; //@line 5762
       sp = STACKTOP; //@line 5763
       return;
      }
      $104 = $1 + 24 | 0; //@line 5766
      $105 = $1 + 54 | 0; //@line 5767
      $$1 = $81; //@line 5768
      while (1) {
       if (HEAP8[$105 >> 0] | 0) {
        break L1;
       }
       if ((HEAP32[$87 >> 2] | 0) == 1) {
        if ((HEAP32[$104 >> 2] | 0) == 1) {
         break L1;
        }
       }
       $AsyncCtx3 = _emscripten_alloc_async_context(40, sp) | 0; //@line 5784
       __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($$1, $1, $2, $3, $4); //@line 5785
       if (___async) {
        break;
       }
       _emscripten_free_async_context($AsyncCtx3 | 0); //@line 5790
       $122 = $$1 + 8 | 0; //@line 5791
       if ($122 >>> 0 < $73 >>> 0) {
        $$1 = $122; //@line 5794
       } else {
        break L1;
       }
      }
      HEAP32[$AsyncCtx3 >> 2] = 83; //@line 5799
      HEAP32[$AsyncCtx3 + 4 >> 2] = $$1; //@line 5801
      HEAP32[$AsyncCtx3 + 8 >> 2] = $73; //@line 5803
      HEAP32[$AsyncCtx3 + 12 >> 2] = $105; //@line 5805
      HEAP32[$AsyncCtx3 + 16 >> 2] = $87; //@line 5807
      HEAP32[$AsyncCtx3 + 20 >> 2] = $104; //@line 5809
      HEAP32[$AsyncCtx3 + 24 >> 2] = $1; //@line 5811
      HEAP32[$AsyncCtx3 + 28 >> 2] = $2; //@line 5813
      HEAP32[$AsyncCtx3 + 32 >> 2] = $3; //@line 5815
      HEAP8[$AsyncCtx3 + 36 >> 0] = $4 & 1; //@line 5818
      sp = STACKTOP; //@line 5819
      return;
     }
    }
    $90 = $1 + 54 | 0; //@line 5823
    $$0 = $81; //@line 5824
    while (1) {
     if (HEAP8[$90 >> 0] | 0) {
      break L1;
     }
     $AsyncCtx7 = _emscripten_alloc_async_context(32, sp) | 0; //@line 5831
     __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($$0, $1, $2, $3, $4); //@line 5832
     if (___async) {
      break;
     }
     _emscripten_free_async_context($AsyncCtx7 | 0); //@line 5837
     $100 = $$0 + 8 | 0; //@line 5838
     if ($100 >>> 0 < $73 >>> 0) {
      $$0 = $100; //@line 5841
     } else {
      break L1;
     }
    }
    HEAP32[$AsyncCtx7 >> 2] = 82; //@line 5846
    HEAP32[$AsyncCtx7 + 4 >> 2] = $$0; //@line 5848
    HEAP32[$AsyncCtx7 + 8 >> 2] = $73; //@line 5850
    HEAP32[$AsyncCtx7 + 12 >> 2] = $90; //@line 5852
    HEAP32[$AsyncCtx7 + 16 >> 2] = $1; //@line 5854
    HEAP32[$AsyncCtx7 + 20 >> 2] = $2; //@line 5856
    HEAP32[$AsyncCtx7 + 24 >> 2] = $3; //@line 5858
    HEAP8[$AsyncCtx7 + 28 >> 0] = $4 & 1; //@line 5861
    sp = STACKTOP; //@line 5862
    return;
   }
  }
 } while (0);
 return;
}
function _mbed_die() {
 var $0 = 0, $AsyncCtx = 0, $AsyncCtx11 = 0, $AsyncCtx15 = 0, $AsyncCtx19 = 0, $AsyncCtx23 = 0, $AsyncCtx27 = 0, $AsyncCtx3 = 0, $AsyncCtx31 = 0, $AsyncCtx35 = 0, $AsyncCtx39 = 0, $AsyncCtx43 = 0, $AsyncCtx47 = 0, $AsyncCtx51 = 0, $AsyncCtx55 = 0, $AsyncCtx59 = 0, $AsyncCtx7 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 524
 STACKTOP = STACKTOP + 32 | 0; //@line 525
 $0 = sp; //@line 526
 _gpio_init_out($0, 50); //@line 527
 while (1) {
  _emscripten_asm_const_iii(0, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 530
  $AsyncCtx59 = _emscripten_alloc_async_context(8, sp) | 0; //@line 531
  _wait_ms(150); //@line 532
  if (___async) {
   label = 3; //@line 535
   break;
  }
  _emscripten_free_async_context($AsyncCtx59 | 0); //@line 538
  _emscripten_asm_const_iii(0, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 540
  $AsyncCtx55 = _emscripten_alloc_async_context(8, sp) | 0; //@line 541
  _wait_ms(150); //@line 542
  if (___async) {
   label = 5; //@line 545
   break;
  }
  _emscripten_free_async_context($AsyncCtx55 | 0); //@line 548
  _emscripten_asm_const_iii(0, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 550
  $AsyncCtx51 = _emscripten_alloc_async_context(8, sp) | 0; //@line 551
  _wait_ms(150); //@line 552
  if (___async) {
   label = 7; //@line 555
   break;
  }
  _emscripten_free_async_context($AsyncCtx51 | 0); //@line 558
  _emscripten_asm_const_iii(0, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 560
  $AsyncCtx47 = _emscripten_alloc_async_context(8, sp) | 0; //@line 561
  _wait_ms(150); //@line 562
  if (___async) {
   label = 9; //@line 565
   break;
  }
  _emscripten_free_async_context($AsyncCtx47 | 0); //@line 568
  _emscripten_asm_const_iii(0, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 570
  $AsyncCtx43 = _emscripten_alloc_async_context(8, sp) | 0; //@line 571
  _wait_ms(150); //@line 572
  if (___async) {
   label = 11; //@line 575
   break;
  }
  _emscripten_free_async_context($AsyncCtx43 | 0); //@line 578
  _emscripten_asm_const_iii(0, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 580
  $AsyncCtx39 = _emscripten_alloc_async_context(8, sp) | 0; //@line 581
  _wait_ms(150); //@line 582
  if (___async) {
   label = 13; //@line 585
   break;
  }
  _emscripten_free_async_context($AsyncCtx39 | 0); //@line 588
  _emscripten_asm_const_iii(0, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 590
  $AsyncCtx35 = _emscripten_alloc_async_context(8, sp) | 0; //@line 591
  _wait_ms(150); //@line 592
  if (___async) {
   label = 15; //@line 595
   break;
  }
  _emscripten_free_async_context($AsyncCtx35 | 0); //@line 598
  _emscripten_asm_const_iii(0, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 600
  $AsyncCtx31 = _emscripten_alloc_async_context(8, sp) | 0; //@line 601
  _wait_ms(150); //@line 602
  if (___async) {
   label = 17; //@line 605
   break;
  }
  _emscripten_free_async_context($AsyncCtx31 | 0); //@line 608
  _emscripten_asm_const_iii(0, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 610
  $AsyncCtx27 = _emscripten_alloc_async_context(8, sp) | 0; //@line 611
  _wait_ms(400); //@line 612
  if (___async) {
   label = 19; //@line 615
   break;
  }
  _emscripten_free_async_context($AsyncCtx27 | 0); //@line 618
  _emscripten_asm_const_iii(0, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 620
  $AsyncCtx23 = _emscripten_alloc_async_context(8, sp) | 0; //@line 621
  _wait_ms(400); //@line 622
  if (___async) {
   label = 21; //@line 625
   break;
  }
  _emscripten_free_async_context($AsyncCtx23 | 0); //@line 628
  _emscripten_asm_const_iii(0, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 630
  $AsyncCtx19 = _emscripten_alloc_async_context(8, sp) | 0; //@line 631
  _wait_ms(400); //@line 632
  if (___async) {
   label = 23; //@line 635
   break;
  }
  _emscripten_free_async_context($AsyncCtx19 | 0); //@line 638
  _emscripten_asm_const_iii(0, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 640
  $AsyncCtx15 = _emscripten_alloc_async_context(8, sp) | 0; //@line 641
  _wait_ms(400); //@line 642
  if (___async) {
   label = 25; //@line 645
   break;
  }
  _emscripten_free_async_context($AsyncCtx15 | 0); //@line 648
  _emscripten_asm_const_iii(0, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 650
  $AsyncCtx11 = _emscripten_alloc_async_context(8, sp) | 0; //@line 651
  _wait_ms(400); //@line 652
  if (___async) {
   label = 27; //@line 655
   break;
  }
  _emscripten_free_async_context($AsyncCtx11 | 0); //@line 658
  _emscripten_asm_const_iii(0, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 660
  $AsyncCtx7 = _emscripten_alloc_async_context(8, sp) | 0; //@line 661
  _wait_ms(400); //@line 662
  if (___async) {
   label = 29; //@line 665
   break;
  }
  _emscripten_free_async_context($AsyncCtx7 | 0); //@line 668
  _emscripten_asm_const_iii(0, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 670
  $AsyncCtx3 = _emscripten_alloc_async_context(8, sp) | 0; //@line 671
  _wait_ms(400); //@line 672
  if (___async) {
   label = 31; //@line 675
   break;
  }
  _emscripten_free_async_context($AsyncCtx3 | 0); //@line 678
  _emscripten_asm_const_iii(0, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 680
  $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 681
  _wait_ms(400); //@line 682
  if (___async) {
   label = 33; //@line 685
   break;
  }
  _emscripten_free_async_context($AsyncCtx | 0); //@line 688
 }
 switch (label | 0) {
 case 3:
  {
   HEAP32[$AsyncCtx59 >> 2] = 16; //@line 692
   HEAP32[$AsyncCtx59 + 4 >> 2] = $0; //@line 694
   sp = STACKTOP; //@line 695
   STACKTOP = sp; //@line 696
   return;
  }
 case 5:
  {
   HEAP32[$AsyncCtx55 >> 2] = 17; //@line 700
   HEAP32[$AsyncCtx55 + 4 >> 2] = $0; //@line 702
   sp = STACKTOP; //@line 703
   STACKTOP = sp; //@line 704
   return;
  }
 case 7:
  {
   HEAP32[$AsyncCtx51 >> 2] = 18; //@line 708
   HEAP32[$AsyncCtx51 + 4 >> 2] = $0; //@line 710
   sp = STACKTOP; //@line 711
   STACKTOP = sp; //@line 712
   return;
  }
 case 9:
  {
   HEAP32[$AsyncCtx47 >> 2] = 19; //@line 716
   HEAP32[$AsyncCtx47 + 4 >> 2] = $0; //@line 718
   sp = STACKTOP; //@line 719
   STACKTOP = sp; //@line 720
   return;
  }
 case 11:
  {
   HEAP32[$AsyncCtx43 >> 2] = 20; //@line 724
   HEAP32[$AsyncCtx43 + 4 >> 2] = $0; //@line 726
   sp = STACKTOP; //@line 727
   STACKTOP = sp; //@line 728
   return;
  }
 case 13:
  {
   HEAP32[$AsyncCtx39 >> 2] = 21; //@line 732
   HEAP32[$AsyncCtx39 + 4 >> 2] = $0; //@line 734
   sp = STACKTOP; //@line 735
   STACKTOP = sp; //@line 736
   return;
  }
 case 15:
  {
   HEAP32[$AsyncCtx35 >> 2] = 22; //@line 740
   HEAP32[$AsyncCtx35 + 4 >> 2] = $0; //@line 742
   sp = STACKTOP; //@line 743
   STACKTOP = sp; //@line 744
   return;
  }
 case 17:
  {
   HEAP32[$AsyncCtx31 >> 2] = 23; //@line 748
   HEAP32[$AsyncCtx31 + 4 >> 2] = $0; //@line 750
   sp = STACKTOP; //@line 751
   STACKTOP = sp; //@line 752
   return;
  }
 case 19:
  {
   HEAP32[$AsyncCtx27 >> 2] = 24; //@line 756
   HEAP32[$AsyncCtx27 + 4 >> 2] = $0; //@line 758
   sp = STACKTOP; //@line 759
   STACKTOP = sp; //@line 760
   return;
  }
 case 21:
  {
   HEAP32[$AsyncCtx23 >> 2] = 25; //@line 764
   HEAP32[$AsyncCtx23 + 4 >> 2] = $0; //@line 766
   sp = STACKTOP; //@line 767
   STACKTOP = sp; //@line 768
   return;
  }
 case 23:
  {
   HEAP32[$AsyncCtx19 >> 2] = 26; //@line 772
   HEAP32[$AsyncCtx19 + 4 >> 2] = $0; //@line 774
   sp = STACKTOP; //@line 775
   STACKTOP = sp; //@line 776
   return;
  }
 case 25:
  {
   HEAP32[$AsyncCtx15 >> 2] = 27; //@line 780
   HEAP32[$AsyncCtx15 + 4 >> 2] = $0; //@line 782
   sp = STACKTOP; //@line 783
   STACKTOP = sp; //@line 784
   return;
  }
 case 27:
  {
   HEAP32[$AsyncCtx11 >> 2] = 28; //@line 788
   HEAP32[$AsyncCtx11 + 4 >> 2] = $0; //@line 790
   sp = STACKTOP; //@line 791
   STACKTOP = sp; //@line 792
   return;
  }
 case 29:
  {
   HEAP32[$AsyncCtx7 >> 2] = 29; //@line 796
   HEAP32[$AsyncCtx7 + 4 >> 2] = $0; //@line 798
   sp = STACKTOP; //@line 799
   STACKTOP = sp; //@line 800
   return;
  }
 case 31:
  {
   HEAP32[$AsyncCtx3 >> 2] = 30; //@line 804
   HEAP32[$AsyncCtx3 + 4 >> 2] = $0; //@line 806
   sp = STACKTOP; //@line 807
   STACKTOP = sp; //@line 808
   return;
  }
 case 33:
  {
   HEAP32[$AsyncCtx >> 2] = 31; //@line 812
   HEAP32[$AsyncCtx + 4 >> 2] = $0; //@line 814
   sp = STACKTOP; //@line 815
   STACKTOP = sp; //@line 816
   return;
  }
 }
}
function __ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_6($0) {
 $0 = $0 | 0;
 var $$085$off0$reg2mem$0 = 0, $$182$off0 = 0, $$186$off0 = 0, $$283$off0 = 0, $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $2 = 0, $20 = 0, $22 = 0, $24 = 0, $26 = 0, $28 = 0, $30 = 0, $4 = 0, $59 = 0, $6 = 0, $67 = 0, $8 = 0, $ReallocAsyncCtx5 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 6948
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 6950
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 6952
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 6954
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 6956
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 6958
 $12 = HEAP8[$0 + 24 >> 0] & 1; //@line 6961
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 6963
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 6965
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 6967
 $20 = HEAP32[$0 + 40 >> 2] | 0; //@line 6969
 $22 = HEAP8[$0 + 44 >> 0] & 1; //@line 6972
 $24 = HEAP8[$0 + 45 >> 0] & 1; //@line 6975
 $26 = HEAP32[$0 + 48 >> 2] | 0; //@line 6977
 $28 = HEAP32[$0 + 52 >> 2] | 0; //@line 6979
 L2 : do {
  if (!(HEAP8[$14 >> 0] | 0)) {
   do {
    if (!(HEAP8[$6 >> 0] | 0)) {
     $$182$off0 = $24; //@line 6988
     $$186$off0 = $22; //@line 6988
    } else {
     if (!(HEAP8[$4 >> 0] | 0)) {
      if (!(HEAP32[$20 >> 2] & 1)) {
       $$085$off0$reg2mem$0 = $22; //@line 6997
       $$283$off0 = 1; //@line 6997
       label = 13; //@line 6998
       break L2;
      } else {
       $$182$off0 = 1; //@line 7001
       $$186$off0 = $22; //@line 7001
       break;
      }
     }
     if ((HEAP32[$18 >> 2] | 0) == 1) {
      label = 18; //@line 7008
      break L2;
     }
     if (!(HEAP32[$20 >> 2] & 2)) {
      label = 18; //@line 7015
      break L2;
     } else {
      $$182$off0 = 1; //@line 7018
      $$186$off0 = 1; //@line 7018
     }
    }
   } while (0);
   $30 = $26 + 8 | 0; //@line 7022
   if ($30 >>> 0 < $2 >>> 0) {
    HEAP8[$4 >> 0] = 0; //@line 7025
    HEAP8[$6 >> 0] = 0; //@line 7026
    $ReallocAsyncCtx5 = _emscripten_realloc_async_context(56) | 0; //@line 7027
    __ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($30, $8, $10, $10, 1, $12); //@line 7028
    if (!___async) {
     ___async_unwind = 0; //@line 7031
    }
    HEAP32[$ReallocAsyncCtx5 >> 2] = 80; //@line 7033
    HEAP32[$ReallocAsyncCtx5 + 4 >> 2] = $2; //@line 7035
    HEAP32[$ReallocAsyncCtx5 + 8 >> 2] = $4; //@line 7037
    HEAP32[$ReallocAsyncCtx5 + 12 >> 2] = $6; //@line 7039
    HEAP32[$ReallocAsyncCtx5 + 16 >> 2] = $8; //@line 7041
    HEAP32[$ReallocAsyncCtx5 + 20 >> 2] = $10; //@line 7043
    HEAP8[$ReallocAsyncCtx5 + 24 >> 0] = $12 & 1; //@line 7046
    HEAP32[$ReallocAsyncCtx5 + 28 >> 2] = $14; //@line 7048
    HEAP32[$ReallocAsyncCtx5 + 32 >> 2] = $16; //@line 7050
    HEAP32[$ReallocAsyncCtx5 + 36 >> 2] = $18; //@line 7052
    HEAP32[$ReallocAsyncCtx5 + 40 >> 2] = $20; //@line 7054
    HEAP8[$ReallocAsyncCtx5 + 44 >> 0] = $$186$off0 & 1; //@line 7057
    HEAP8[$ReallocAsyncCtx5 + 45 >> 0] = $$182$off0 & 1; //@line 7060
    HEAP32[$ReallocAsyncCtx5 + 48 >> 2] = $30; //@line 7062
    HEAP32[$ReallocAsyncCtx5 + 52 >> 2] = $28; //@line 7064
    sp = STACKTOP; //@line 7065
    return;
   } else {
    $$085$off0$reg2mem$0 = $$186$off0; //@line 7068
    $$283$off0 = $$182$off0; //@line 7068
    label = 13; //@line 7069
   }
  } else {
   $$085$off0$reg2mem$0 = $22; //@line 7072
   $$283$off0 = $24; //@line 7072
   label = 13; //@line 7073
  }
 } while (0);
 do {
  if ((label | 0) == 13) {
   if (!$$085$off0$reg2mem$0) {
    HEAP32[$28 >> 2] = $10; //@line 7079
    $59 = $8 + 40 | 0; //@line 7080
    HEAP32[$59 >> 2] = (HEAP32[$59 >> 2] | 0) + 1; //@line 7083
    if ((HEAP32[$8 + 36 >> 2] | 0) == 1) {
     if ((HEAP32[$18 >> 2] | 0) == 2) {
      HEAP8[$14 >> 0] = 1; //@line 7091
      if ($$283$off0) {
       label = 18; //@line 7093
       break;
      } else {
       $67 = 4; //@line 7096
       break;
      }
     }
    }
   }
   if ($$283$off0) {
    label = 18; //@line 7103
   } else {
    $67 = 4; //@line 7105
   }
  }
 } while (0);
 if ((label | 0) == 18) {
  $67 = 3; //@line 7110
 }
 HEAP32[$16 >> 2] = $67; //@line 7112
 return;
}
function __ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_5($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $15 = 0, $18 = 0, $2 = 0, $21 = 0, $24 = 0, $36 = 0, $37 = 0, $38 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx = 0, $ReallocAsyncCtx2 = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 6792
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 6794
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 6796
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 6798
 $8 = HEAP8[$0 + 16 >> 0] & 1; //@line 6801
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 6803
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 6805
 $15 = $12 + 24 | 0; //@line 6808
 do {
  if ((HEAP32[$0 + 28 >> 2] | 0) > 1) {
   $18 = HEAP32[$12 + 8 >> 2] | 0; //@line 6813
   if (!($18 & 2)) {
    $21 = $2 + 36 | 0; //@line 6817
    if ((HEAP32[$21 >> 2] | 0) != 1) {
     if (!($18 & 1)) {
      $38 = $2 + 54 | 0; //@line 6824
      if (HEAP8[$38 >> 0] | 0) {
       break;
      }
      if ((HEAP32[$21 >> 2] | 0) == 1) {
       break;
      }
      $ReallocAsyncCtx = _emscripten_realloc_async_context(36) | 0; //@line 6835
      __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($15, $2, $4, $6, $8); //@line 6836
      if (!___async) {
       ___async_unwind = 0; //@line 6839
      }
      HEAP32[$ReallocAsyncCtx >> 2] = 84; //@line 6841
      HEAP32[$ReallocAsyncCtx + 4 >> 2] = $15; //@line 6843
      HEAP32[$ReallocAsyncCtx + 8 >> 2] = $10; //@line 6845
      HEAP32[$ReallocAsyncCtx + 12 >> 2] = $38; //@line 6847
      HEAP32[$ReallocAsyncCtx + 16 >> 2] = $21; //@line 6849
      HEAP32[$ReallocAsyncCtx + 20 >> 2] = $2; //@line 6851
      HEAP32[$ReallocAsyncCtx + 24 >> 2] = $4; //@line 6853
      HEAP32[$ReallocAsyncCtx + 28 >> 2] = $6; //@line 6855
      HEAP8[$ReallocAsyncCtx + 32 >> 0] = $8 & 1; //@line 6858
      sp = STACKTOP; //@line 6859
      return;
     }
     $36 = $2 + 24 | 0; //@line 6862
     $37 = $2 + 54 | 0; //@line 6863
     if (HEAP8[$37 >> 0] | 0) {
      break;
     }
     if ((HEAP32[$21 >> 2] | 0) == 1) {
      if ((HEAP32[$36 >> 2] | 0) == 1) {
       break;
      }
     }
     $ReallocAsyncCtx2 = _emscripten_realloc_async_context(40) | 0; //@line 6878
     __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($15, $2, $4, $6, $8); //@line 6879
     if (!___async) {
      ___async_unwind = 0; //@line 6882
     }
     HEAP32[$ReallocAsyncCtx2 >> 2] = 83; //@line 6884
     HEAP32[$ReallocAsyncCtx2 + 4 >> 2] = $15; //@line 6886
     HEAP32[$ReallocAsyncCtx2 + 8 >> 2] = $10; //@line 6888
     HEAP32[$ReallocAsyncCtx2 + 12 >> 2] = $37; //@line 6890
     HEAP32[$ReallocAsyncCtx2 + 16 >> 2] = $21; //@line 6892
     HEAP32[$ReallocAsyncCtx2 + 20 >> 2] = $36; //@line 6894
     HEAP32[$ReallocAsyncCtx2 + 24 >> 2] = $2; //@line 6896
     HEAP32[$ReallocAsyncCtx2 + 28 >> 2] = $4; //@line 6898
     HEAP32[$ReallocAsyncCtx2 + 32 >> 2] = $6; //@line 6900
     HEAP8[$ReallocAsyncCtx2 + 36 >> 0] = $8 & 1; //@line 6903
     sp = STACKTOP; //@line 6904
     return;
    }
   }
   $24 = $2 + 54 | 0; //@line 6908
   if (!(HEAP8[$24 >> 0] | 0)) {
    $ReallocAsyncCtx3 = _emscripten_realloc_async_context(32) | 0; //@line 6912
    __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($15, $2, $4, $6, $8); //@line 6913
    if (!___async) {
     ___async_unwind = 0; //@line 6916
    }
    HEAP32[$ReallocAsyncCtx3 >> 2] = 82; //@line 6918
    HEAP32[$ReallocAsyncCtx3 + 4 >> 2] = $15; //@line 6920
    HEAP32[$ReallocAsyncCtx3 + 8 >> 2] = $10; //@line 6922
    HEAP32[$ReallocAsyncCtx3 + 12 >> 2] = $24; //@line 6924
    HEAP32[$ReallocAsyncCtx3 + 16 >> 2] = $2; //@line 6926
    HEAP32[$ReallocAsyncCtx3 + 20 >> 2] = $4; //@line 6928
    HEAP32[$ReallocAsyncCtx3 + 24 >> 2] = $6; //@line 6930
    HEAP8[$ReallocAsyncCtx3 + 28 >> 0] = $8 & 1; //@line 6933
    sp = STACKTOP; //@line 6934
    return;
   }
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
 sp = STACKTOP; //@line 5326
 if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, $5) | 0) {
  __ZNK10__cxxabiv117__class_type_info29process_static_type_above_dstEPNS_19__dynamic_cast_infoEPKvS4_i(0, $1, $2, $3, $4); //@line 5331
 } else {
  $9 = $1 + 52 | 0; //@line 5333
  $10 = HEAP8[$9 >> 0] | 0; //@line 5334
  $11 = $1 + 53 | 0; //@line 5335
  $12 = HEAP8[$11 >> 0] | 0; //@line 5336
  $15 = HEAP32[$0 + 12 >> 2] | 0; //@line 5339
  $16 = $0 + 16 + ($15 << 3) | 0; //@line 5340
  HEAP8[$9 >> 0] = 0; //@line 5341
  HEAP8[$11 >> 0] = 0; //@line 5342
  $AsyncCtx3 = _emscripten_alloc_async_context(52, sp) | 0; //@line 5343
  __ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($0 + 16 | 0, $1, $2, $3, $4, $5); //@line 5344
  if (___async) {
   HEAP32[$AsyncCtx3 >> 2] = 78; //@line 5347
   HEAP32[$AsyncCtx3 + 4 >> 2] = $15; //@line 5349
   HEAP32[$AsyncCtx3 + 8 >> 2] = $0; //@line 5351
   HEAP32[$AsyncCtx3 + 12 >> 2] = $1; //@line 5353
   HEAP8[$AsyncCtx3 + 16 >> 0] = $10; //@line 5355
   HEAP32[$AsyncCtx3 + 20 >> 2] = $9; //@line 5357
   HEAP8[$AsyncCtx3 + 24 >> 0] = $12; //@line 5359
   HEAP32[$AsyncCtx3 + 28 >> 2] = $11; //@line 5361
   HEAP32[$AsyncCtx3 + 32 >> 2] = $2; //@line 5363
   HEAP32[$AsyncCtx3 + 36 >> 2] = $3; //@line 5365
   HEAP32[$AsyncCtx3 + 40 >> 2] = $4; //@line 5367
   HEAP8[$AsyncCtx3 + 44 >> 0] = $5 & 1; //@line 5370
   HEAP32[$AsyncCtx3 + 48 >> 2] = $16; //@line 5372
   sp = STACKTOP; //@line 5373
   return;
  }
  _emscripten_free_async_context($AsyncCtx3 | 0); //@line 5376
  L7 : do {
   if (($15 | 0) > 1) {
    $31 = $1 + 24 | 0; //@line 5381
    $32 = $0 + 8 | 0; //@line 5382
    $33 = $1 + 54 | 0; //@line 5383
    $$0 = $0 + 24 | 0; //@line 5384
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
     HEAP8[$9 >> 0] = 0; //@line 5417
     HEAP8[$11 >> 0] = 0; //@line 5418
     $AsyncCtx = _emscripten_alloc_async_context(60, sp) | 0; //@line 5419
     __ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($$0, $1, $2, $3, $4, $5); //@line 5420
     if (___async) {
      break;
     }
     _emscripten_free_async_context($AsyncCtx | 0); //@line 5425
     $62 = $$0 + 8 | 0; //@line 5426
     if ($62 >>> 0 < $16 >>> 0) {
      $$0 = $62; //@line 5429
     } else {
      break L7;
     }
    }
    HEAP32[$AsyncCtx >> 2] = 79; //@line 5434
    HEAP32[$AsyncCtx + 4 >> 2] = $$0; //@line 5436
    HEAP32[$AsyncCtx + 8 >> 2] = $16; //@line 5438
    HEAP32[$AsyncCtx + 12 >> 2] = $33; //@line 5440
    HEAP8[$AsyncCtx + 16 >> 0] = $10; //@line 5442
    HEAP32[$AsyncCtx + 20 >> 2] = $9; //@line 5444
    HEAP8[$AsyncCtx + 24 >> 0] = $12; //@line 5446
    HEAP32[$AsyncCtx + 28 >> 2] = $11; //@line 5448
    HEAP32[$AsyncCtx + 32 >> 2] = $31; //@line 5450
    HEAP32[$AsyncCtx + 36 >> 2] = $32; //@line 5452
    HEAP32[$AsyncCtx + 40 >> 2] = $1; //@line 5454
    HEAP32[$AsyncCtx + 44 >> 2] = $2; //@line 5456
    HEAP32[$AsyncCtx + 48 >> 2] = $3; //@line 5458
    HEAP32[$AsyncCtx + 52 >> 2] = $4; //@line 5460
    HEAP8[$AsyncCtx + 56 >> 0] = $5 & 1; //@line 5463
    sp = STACKTOP; //@line 5464
    return;
   }
  } while (0);
  HEAP8[$9 >> 0] = $10; //@line 5468
  HEAP8[$11 >> 0] = $12; //@line 5469
 }
 return;
}
function __ZN4mbed6BusOut5writeEi($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $105 = 0, $14 = 0, $20 = 0, $26 = 0, $32 = 0, $38 = 0, $4 = 0, $44 = 0, $50 = 0, $56 = 0, $62 = 0, $68 = 0, $74 = 0, $80 = 0, $86 = 0, $9 = 0, $92 = 0, $98 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 295
 $4 = HEAP32[(HEAP32[$0 >> 2] | 0) + 8 >> 2] | 0; //@line 298
 $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 299
 FUNCTION_TABLE_vi[$4 & 127]($0); //@line 300
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 12; //@line 303
  HEAP32[$AsyncCtx + 4 >> 2] = $1; //@line 305
  HEAP32[$AsyncCtx + 8 >> 2] = $0; //@line 307
  HEAP32[$AsyncCtx + 12 >> 2] = $0; //@line 309
  sp = STACKTOP; //@line 310
  return;
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 313
 $9 = HEAP32[$0 + 4 >> 2] | 0; //@line 315
 if ($9 | 0) {
  _emscripten_asm_const_iii(0, HEAP32[$9 >> 2] | 0, $1 & 1 | 0) | 0; //@line 320
 }
 $14 = HEAP32[$0 + 8 >> 2] | 0; //@line 323
 if ($14 | 0) {
  _emscripten_asm_const_iii(0, HEAP32[$14 >> 2] | 0, $1 >>> 1 & 1 | 0) | 0; //@line 329
 }
 $20 = HEAP32[$0 + 12 >> 2] | 0; //@line 332
 if ($20 | 0) {
  _emscripten_asm_const_iii(0, HEAP32[$20 >> 2] | 0, $1 >>> 2 & 1 | 0) | 0; //@line 338
 }
 $26 = HEAP32[$0 + 16 >> 2] | 0; //@line 341
 if ($26 | 0) {
  _emscripten_asm_const_iii(0, HEAP32[$26 >> 2] | 0, $1 >>> 3 & 1 | 0) | 0; //@line 347
 }
 $32 = HEAP32[$0 + 20 >> 2] | 0; //@line 350
 if ($32 | 0) {
  _emscripten_asm_const_iii(0, HEAP32[$32 >> 2] | 0, $1 >>> 4 & 1 | 0) | 0; //@line 356
 }
 $38 = HEAP32[$0 + 24 >> 2] | 0; //@line 359
 if ($38 | 0) {
  _emscripten_asm_const_iii(0, HEAP32[$38 >> 2] | 0, $1 >>> 5 & 1 | 0) | 0; //@line 365
 }
 $44 = HEAP32[$0 + 28 >> 2] | 0; //@line 368
 if ($44 | 0) {
  _emscripten_asm_const_iii(0, HEAP32[$44 >> 2] | 0, $1 >>> 6 & 1 | 0) | 0; //@line 374
 }
 $50 = HEAP32[$0 + 32 >> 2] | 0; //@line 377
 if ($50 | 0) {
  _emscripten_asm_const_iii(0, HEAP32[$50 >> 2] | 0, $1 >>> 7 & 1 | 0) | 0; //@line 383
 }
 $56 = HEAP32[$0 + 36 >> 2] | 0; //@line 386
 if ($56 | 0) {
  _emscripten_asm_const_iii(0, HEAP32[$56 >> 2] | 0, $1 >>> 8 & 1 | 0) | 0; //@line 392
 }
 $62 = HEAP32[$0 + 40 >> 2] | 0; //@line 395
 if ($62 | 0) {
  _emscripten_asm_const_iii(0, HEAP32[$62 >> 2] | 0, $1 >>> 9 & 1 | 0) | 0; //@line 401
 }
 $68 = HEAP32[$0 + 44 >> 2] | 0; //@line 404
 if ($68 | 0) {
  _emscripten_asm_const_iii(0, HEAP32[$68 >> 2] | 0, $1 >>> 10 & 1 | 0) | 0; //@line 410
 }
 $74 = HEAP32[$0 + 48 >> 2] | 0; //@line 413
 if ($74 | 0) {
  _emscripten_asm_const_iii(0, HEAP32[$74 >> 2] | 0, $1 >>> 11 & 1 | 0) | 0; //@line 419
 }
 $80 = HEAP32[$0 + 52 >> 2] | 0; //@line 422
 if ($80 | 0) {
  _emscripten_asm_const_iii(0, HEAP32[$80 >> 2] | 0, $1 >>> 12 & 1 | 0) | 0; //@line 428
 }
 $86 = HEAP32[$0 + 56 >> 2] | 0; //@line 431
 if ($86 | 0) {
  _emscripten_asm_const_iii(0, HEAP32[$86 >> 2] | 0, $1 >>> 13 & 1 | 0) | 0; //@line 437
 }
 $92 = HEAP32[$0 + 60 >> 2] | 0; //@line 440
 if ($92 | 0) {
  _emscripten_asm_const_iii(0, HEAP32[$92 >> 2] | 0, $1 >>> 14 & 1 | 0) | 0; //@line 446
 }
 $98 = HEAP32[$0 + 64 >> 2] | 0; //@line 449
 if ($98 | 0) {
  _emscripten_asm_const_iii(0, HEAP32[$98 >> 2] | 0, $1 >>> 15 & 1 | 0) | 0; //@line 455
 }
 $105 = HEAP32[(HEAP32[$0 >> 2] | 0) + 12 >> 2] | 0; //@line 459
 $AsyncCtx3 = _emscripten_alloc_async_context(4, sp) | 0; //@line 460
 FUNCTION_TABLE_vi[$105 & 127]($0); //@line 461
 if (___async) {
  HEAP32[$AsyncCtx3 >> 2] = 13; //@line 464
  sp = STACKTOP; //@line 465
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx3 | 0); //@line 468
  return;
 }
}
function ___dynamic_cast($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $$0 = 0, $10 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $24 = 0, $30 = 0, $33 = 0, $4 = 0, $5 = 0, $8 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, dest = 0, sp = 0, stop = 0;
 sp = STACKTOP; //@line 4959
 STACKTOP = STACKTOP + 64 | 0; //@line 4960
 $4 = sp; //@line 4961
 $5 = HEAP32[$0 >> 2] | 0; //@line 4962
 $8 = $0 + (HEAP32[$5 + -8 >> 2] | 0) | 0; //@line 4965
 $10 = HEAP32[$5 + -4 >> 2] | 0; //@line 4967
 HEAP32[$4 >> 2] = $2; //@line 4968
 HEAP32[$4 + 4 >> 2] = $0; //@line 4970
 HEAP32[$4 + 8 >> 2] = $1; //@line 4972
 HEAP32[$4 + 12 >> 2] = $3; //@line 4974
 $14 = $4 + 16 | 0; //@line 4975
 $15 = $4 + 20 | 0; //@line 4976
 $16 = $4 + 24 | 0; //@line 4977
 $17 = $4 + 28 | 0; //@line 4978
 $18 = $4 + 32 | 0; //@line 4979
 $19 = $4 + 40 | 0; //@line 4980
 dest = $14; //@line 4981
 stop = dest + 36 | 0; //@line 4981
 do {
  HEAP32[dest >> 2] = 0; //@line 4981
  dest = dest + 4 | 0; //@line 4981
 } while ((dest | 0) < (stop | 0));
 HEAP16[$14 + 36 >> 1] = 0; //@line 4981
 HEAP8[$14 + 38 >> 0] = 0; //@line 4981
 L1 : do {
  if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($10, $2, 0) | 0) {
   HEAP32[$4 + 48 >> 2] = 1; //@line 4986
   $24 = HEAP32[(HEAP32[$10 >> 2] | 0) + 20 >> 2] | 0; //@line 4989
   $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 4990
   FUNCTION_TABLE_viiiiii[$24 & 3]($10, $4, $8, $8, 1, 0); //@line 4991
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 72; //@line 4994
    HEAP32[$AsyncCtx + 4 >> 2] = $16; //@line 4996
    HEAP32[$AsyncCtx + 8 >> 2] = $8; //@line 4998
    HEAP32[$AsyncCtx + 12 >> 2] = $4; //@line 5000
    sp = STACKTOP; //@line 5001
    STACKTOP = sp; //@line 5002
    return 0; //@line 5002
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 5004
    $$0 = (HEAP32[$16 >> 2] | 0) == 1 ? $8 : 0; //@line 5008
    break;
   }
  } else {
   $30 = $4 + 36 | 0; //@line 5012
   $33 = HEAP32[(HEAP32[$10 >> 2] | 0) + 24 >> 2] | 0; //@line 5015
   $AsyncCtx3 = _emscripten_alloc_async_context(36, sp) | 0; //@line 5016
   FUNCTION_TABLE_viiiii[$33 & 3]($10, $4, $8, 1, 0); //@line 5017
   if (___async) {
    HEAP32[$AsyncCtx3 >> 2] = 73; //@line 5020
    HEAP32[$AsyncCtx3 + 4 >> 2] = $30; //@line 5022
    HEAP32[$AsyncCtx3 + 8 >> 2] = $4; //@line 5024
    HEAP32[$AsyncCtx3 + 12 >> 2] = $19; //@line 5026
    HEAP32[$AsyncCtx3 + 16 >> 2] = $17; //@line 5028
    HEAP32[$AsyncCtx3 + 20 >> 2] = $18; //@line 5030
    HEAP32[$AsyncCtx3 + 24 >> 2] = $15; //@line 5032
    HEAP32[$AsyncCtx3 + 28 >> 2] = $16; //@line 5034
    HEAP32[$AsyncCtx3 + 32 >> 2] = $14; //@line 5036
    sp = STACKTOP; //@line 5037
    STACKTOP = sp; //@line 5038
    return 0; //@line 5038
   }
   _emscripten_free_async_context($AsyncCtx3 | 0); //@line 5040
   switch (HEAP32[$30 >> 2] | 0) {
   case 0:
    {
     $$0 = (HEAP32[$19 >> 2] | 0) == 1 & (HEAP32[$17 >> 2] | 0) == 1 & (HEAP32[$18 >> 2] | 0) == 1 ? HEAP32[$15 >> 2] | 0 : 0; //@line 5054
     break L1;
     break;
    }
   case 1:
    {
     break;
    }
   default:
    {
     $$0 = 0; //@line 5062
     break L1;
    }
   }
   if ((HEAP32[$16 >> 2] | 0) != 1) {
    if (!((HEAP32[$19 >> 2] | 0) == 0 & (HEAP32[$17 >> 2] | 0) == 1 & (HEAP32[$18 >> 2] | 0) == 1)) {
     $$0 = 0; //@line 5078
     break;
    }
   }
   $$0 = HEAP32[$14 >> 2] | 0; //@line 5083
  }
 } while (0);
 STACKTOP = sp; //@line 5086
 return $$0 | 0; //@line 5086
}
function __ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($0, $1, $2, $3, $4) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 var $$037$off038 = 0, $$037$off039 = 0, $13 = 0, $19 = 0, $22 = 0, $23 = 0, $25 = 0, $28 = 0, $39 = 0, $50 = 0, $53 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 5141
 do {
  if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, $4) | 0) {
   __ZNK10__cxxabiv117__class_type_info29process_static_type_below_dstEPNS_19__dynamic_cast_infoEPKvi(0, $1, $2, $3); //@line 5147
  } else {
   if (!(__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 >> 2] | 0, $4) | 0)) {
    $50 = HEAP32[$0 + 8 >> 2] | 0; //@line 5153
    $53 = HEAP32[(HEAP32[$50 >> 2] | 0) + 24 >> 2] | 0; //@line 5156
    $AsyncCtx3 = _emscripten_alloc_async_context(4, sp) | 0; //@line 5157
    FUNCTION_TABLE_viiiii[$53 & 3]($50, $1, $2, $3, $4); //@line 5158
    if (___async) {
     HEAP32[$AsyncCtx3 >> 2] = 76; //@line 5161
     sp = STACKTOP; //@line 5162
     return;
    } else {
     _emscripten_free_async_context($AsyncCtx3 | 0); //@line 5165
     break;
    }
   }
   if ((HEAP32[$1 + 16 >> 2] | 0) != ($2 | 0)) {
    $13 = $1 + 20 | 0; //@line 5173
    if ((HEAP32[$13 >> 2] | 0) != ($2 | 0)) {
     HEAP32[$1 + 32 >> 2] = $3; //@line 5178
     $19 = $1 + 44 | 0; //@line 5179
     if ((HEAP32[$19 >> 2] | 0) == 4) {
      break;
     }
     $22 = $1 + 52 | 0; //@line 5185
     HEAP8[$22 >> 0] = 0; //@line 5186
     $23 = $1 + 53 | 0; //@line 5187
     HEAP8[$23 >> 0] = 0; //@line 5188
     $25 = HEAP32[$0 + 8 >> 2] | 0; //@line 5190
     $28 = HEAP32[(HEAP32[$25 >> 2] | 0) + 20 >> 2] | 0; //@line 5193
     $AsyncCtx = _emscripten_alloc_async_context(28, sp) | 0; //@line 5194
     FUNCTION_TABLE_viiiiii[$28 & 3]($25, $1, $2, $2, 1, $4); //@line 5195
     if (___async) {
      HEAP32[$AsyncCtx >> 2] = 75; //@line 5198
      HEAP32[$AsyncCtx + 4 >> 2] = $23; //@line 5200
      HEAP32[$AsyncCtx + 8 >> 2] = $2; //@line 5202
      HEAP32[$AsyncCtx + 12 >> 2] = $13; //@line 5204
      HEAP32[$AsyncCtx + 16 >> 2] = $1; //@line 5206
      HEAP32[$AsyncCtx + 20 >> 2] = $22; //@line 5208
      HEAP32[$AsyncCtx + 24 >> 2] = $19; //@line 5210
      sp = STACKTOP; //@line 5211
      return;
     }
     _emscripten_free_async_context($AsyncCtx | 0); //@line 5214
     if (!(HEAP8[$23 >> 0] | 0)) {
      $$037$off038 = 4; //@line 5218
      label = 13; //@line 5219
     } else {
      if (!(HEAP8[$22 >> 0] | 0)) {
       $$037$off038 = 3; //@line 5224
       label = 13; //@line 5225
      } else {
       $$037$off039 = 3; //@line 5227
      }
     }
     if ((label | 0) == 13) {
      HEAP32[$13 >> 2] = $2; //@line 5231
      $39 = $1 + 40 | 0; //@line 5232
      HEAP32[$39 >> 2] = (HEAP32[$39 >> 2] | 0) + 1; //@line 5235
      if ((HEAP32[$1 + 36 >> 2] | 0) == 1) {
       if ((HEAP32[$1 + 24 >> 2] | 0) == 2) {
        HEAP8[$1 + 54 >> 0] = 1; //@line 5245
        $$037$off039 = $$037$off038; //@line 5246
       } else {
        $$037$off039 = $$037$off038; //@line 5248
       }
      } else {
       $$037$off039 = $$037$off038; //@line 5251
      }
     }
     HEAP32[$19 >> 2] = $$037$off039; //@line 5254
     break;
    }
   }
   if (($3 | 0) == 1) {
    HEAP32[$1 + 32 >> 2] = 1; //@line 5261
   }
  }
 } while (0);
 return;
}
function __ZN4mbed6BusOut5writeEi__async_cb($0) {
 $0 = $0 | 0;
 var $104 = 0, $13 = 0, $19 = 0, $2 = 0, $25 = 0, $31 = 0, $37 = 0, $4 = 0, $43 = 0, $49 = 0, $55 = 0, $6 = 0, $61 = 0, $67 = 0, $73 = 0, $79 = 0, $8 = 0, $85 = 0, $91 = 0, $97 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 8153
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 8155
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 8157
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 8159
 $8 = HEAP32[$4 + 4 >> 2] | 0; //@line 8161
 if ($8 | 0) {
  _emscripten_asm_const_iii(0, HEAP32[$8 >> 2] | 0, $2 & 1 | 0) | 0; //@line 8166
 }
 $13 = HEAP32[$4 + 8 >> 2] | 0; //@line 8169
 if ($13 | 0) {
  _emscripten_asm_const_iii(0, HEAP32[$13 >> 2] | 0, $2 >>> 1 & 1 | 0) | 0; //@line 8175
 }
 $19 = HEAP32[$4 + 12 >> 2] | 0; //@line 8178
 if ($19 | 0) {
  _emscripten_asm_const_iii(0, HEAP32[$19 >> 2] | 0, $2 >>> 2 & 1 | 0) | 0; //@line 8184
 }
 $25 = HEAP32[$4 + 16 >> 2] | 0; //@line 8187
 if ($25 | 0) {
  _emscripten_asm_const_iii(0, HEAP32[$25 >> 2] | 0, $2 >>> 3 & 1 | 0) | 0; //@line 8193
 }
 $31 = HEAP32[$4 + 20 >> 2] | 0; //@line 8196
 if ($31 | 0) {
  _emscripten_asm_const_iii(0, HEAP32[$31 >> 2] | 0, $2 >>> 4 & 1 | 0) | 0; //@line 8202
 }
 $37 = HEAP32[$4 + 24 >> 2] | 0; //@line 8205
 if ($37 | 0) {
  _emscripten_asm_const_iii(0, HEAP32[$37 >> 2] | 0, $2 >>> 5 & 1 | 0) | 0; //@line 8211
 }
 $43 = HEAP32[$4 + 28 >> 2] | 0; //@line 8214
 if ($43 | 0) {
  _emscripten_asm_const_iii(0, HEAP32[$43 >> 2] | 0, $2 >>> 6 & 1 | 0) | 0; //@line 8220
 }
 $49 = HEAP32[$4 + 32 >> 2] | 0; //@line 8223
 if ($49 | 0) {
  _emscripten_asm_const_iii(0, HEAP32[$49 >> 2] | 0, $2 >>> 7 & 1 | 0) | 0; //@line 8229
 }
 $55 = HEAP32[$4 + 36 >> 2] | 0; //@line 8232
 if ($55 | 0) {
  _emscripten_asm_const_iii(0, HEAP32[$55 >> 2] | 0, $2 >>> 8 & 1 | 0) | 0; //@line 8238
 }
 $61 = HEAP32[$4 + 40 >> 2] | 0; //@line 8241
 if ($61 | 0) {
  _emscripten_asm_const_iii(0, HEAP32[$61 >> 2] | 0, $2 >>> 9 & 1 | 0) | 0; //@line 8247
 }
 $67 = HEAP32[$4 + 44 >> 2] | 0; //@line 8250
 if ($67 | 0) {
  _emscripten_asm_const_iii(0, HEAP32[$67 >> 2] | 0, $2 >>> 10 & 1 | 0) | 0; //@line 8256
 }
 $73 = HEAP32[$4 + 48 >> 2] | 0; //@line 8259
 if ($73 | 0) {
  _emscripten_asm_const_iii(0, HEAP32[$73 >> 2] | 0, $2 >>> 11 & 1 | 0) | 0; //@line 8265
 }
 $79 = HEAP32[$4 + 52 >> 2] | 0; //@line 8268
 if ($79 | 0) {
  _emscripten_asm_const_iii(0, HEAP32[$79 >> 2] | 0, $2 >>> 12 & 1 | 0) | 0; //@line 8274
 }
 $85 = HEAP32[$4 + 56 >> 2] | 0; //@line 8277
 if ($85 | 0) {
  _emscripten_asm_const_iii(0, HEAP32[$85 >> 2] | 0, $2 >>> 13 & 1 | 0) | 0; //@line 8283
 }
 $91 = HEAP32[$4 + 60 >> 2] | 0; //@line 8286
 if ($91 | 0) {
  _emscripten_asm_const_iii(0, HEAP32[$91 >> 2] | 0, $2 >>> 14 & 1 | 0) | 0; //@line 8292
 }
 $97 = HEAP32[$4 + 64 >> 2] | 0; //@line 8295
 if ($97 | 0) {
  _emscripten_asm_const_iii(0, HEAP32[$97 >> 2] | 0, $2 >>> 15 & 1 | 0) | 0; //@line 8301
 }
 $104 = HEAP32[(HEAP32[$6 >> 2] | 0) + 12 >> 2] | 0; //@line 8305
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(4) | 0; //@line 8306
 FUNCTION_TABLE_vi[$104 & 127]($4); //@line 8307
 if (___async) {
  HEAP32[$ReallocAsyncCtx2 >> 2] = 13; //@line 8310
  sp = STACKTOP; //@line 8311
  return;
 }
 ___async_unwind = 0; //@line 8314
 HEAP32[$ReallocAsyncCtx2 >> 2] = 13; //@line 8315
 sp = STACKTOP; //@line 8316
 return;
}
function __ZN4mbed6BusOutC2E7PinNameS1_S1_S1_S1_S1_S1_S1_S1_S1_S1_S1_S1_S1_S1_S1___async_cb($0) {
 $0 = $0 | 0;
 var $$02932$reg2mem$0 = 0, $$pre = 0, $10 = 0, $12 = 0, $14 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $4 = 0, $6 = 0, $8 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 6387
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 6389
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 6391
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 6393
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 6395
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 6397
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 6399
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 6401
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 6403
 HEAP32[$AsyncRetVal >> 2] = 0; //@line 6404
 HEAP32[$AsyncRetVal + 4 >> 2] = 0; //@line 6404
 HEAP32[$AsyncRetVal + 8 >> 2] = 0; //@line 6404
 HEAP32[$AsyncRetVal + 12 >> 2] = 0; //@line 6404
 HEAP32[$AsyncRetVal + 16 >> 2] = 0; //@line 6404
 HEAP32[$AsyncRetVal + 20 >> 2] = 0; //@line 6404
 _gpio_init_out($AsyncRetVal, $2); //@line 6405
 HEAP32[$4 + 4 + ($6 << 2) >> 2] = $AsyncRetVal; //@line 6407
 HEAP32[$8 >> 2] = HEAP32[$8 >> 2] | 1 << $6; //@line 6411
 $$02932$reg2mem$0 = $6; //@line 6412
 while (1) {
  $18 = $$02932$reg2mem$0 + 1 | 0; //@line 6414
  if (($$02932$reg2mem$0 | 0) >= 15) {
   label = 2; //@line 6417
   break;
  }
  $$pre = HEAP32[$10 + ($18 << 2) >> 2] | 0; //@line 6421
  if (($$pre | 0) != -1) {
   break;
  }
  HEAP32[$4 + 4 + ($18 << 2) >> 2] = 0; //@line 6427
  $$02932$reg2mem$0 = $18; //@line 6428
 }
 if ((label | 0) == 2) {
  return;
 }
 $ReallocAsyncCtx = _emscripten_realloc_async_context(32) | 0; //@line 6433
 $19 = __Znwj(24) | 0; //@line 6434
 if (___async) {
  HEAP32[$ReallocAsyncCtx >> 2] = 11; //@line 6437
  $20 = $ReallocAsyncCtx + 4 | 0; //@line 6438
  HEAP32[$20 >> 2] = $$pre; //@line 6439
  $21 = $ReallocAsyncCtx + 8 | 0; //@line 6440
  HEAP32[$21 >> 2] = $4; //@line 6441
  $22 = $ReallocAsyncCtx + 12 | 0; //@line 6442
  HEAP32[$22 >> 2] = $18; //@line 6443
  $23 = $ReallocAsyncCtx + 16 | 0; //@line 6444
  HEAP32[$23 >> 2] = $8; //@line 6445
  $24 = $ReallocAsyncCtx + 20 | 0; //@line 6446
  HEAP32[$24 >> 2] = $10; //@line 6447
  $25 = $ReallocAsyncCtx + 24 | 0; //@line 6448
  HEAP32[$25 >> 2] = $12; //@line 6449
  $26 = $ReallocAsyncCtx + 28 | 0; //@line 6450
  HEAP32[$26 >> 2] = $14; //@line 6451
  sp = STACKTOP; //@line 6452
  return;
 }
 HEAP32[___async_retval >> 2] = $19; //@line 6456
 ___async_unwind = 0; //@line 6457
 HEAP32[$ReallocAsyncCtx >> 2] = 11; //@line 6458
 $20 = $ReallocAsyncCtx + 4 | 0; //@line 6459
 HEAP32[$20 >> 2] = $$pre; //@line 6460
 $21 = $ReallocAsyncCtx + 8 | 0; //@line 6461
 HEAP32[$21 >> 2] = $4; //@line 6462
 $22 = $ReallocAsyncCtx + 12 | 0; //@line 6463
 HEAP32[$22 >> 2] = $18; //@line 6464
 $23 = $ReallocAsyncCtx + 16 | 0; //@line 6465
 HEAP32[$23 >> 2] = $8; //@line 6466
 $24 = $ReallocAsyncCtx + 20 | 0; //@line 6467
 HEAP32[$24 >> 2] = $10; //@line 6468
 $25 = $ReallocAsyncCtx + 24 | 0; //@line 6469
 HEAP32[$25 >> 2] = $12; //@line 6470
 $26 = $ReallocAsyncCtx + 28 | 0; //@line 6471
 HEAP32[$26 >> 2] = $14; //@line 6472
 sp = STACKTOP; //@line 6473
 return;
}
function __ZN4mbed6BusOutC2E7PinNameS1_S1_S1_S1_S1_S1_S1_S1_S1_S1_S1_S1_S1_S1_S1_($0, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 $5 = $5 | 0;
 $6 = $6 | 0;
 $7 = $7 | 0;
 $8 = $8 | 0;
 $9 = $9 | 0;
 $10 = $10 | 0;
 $11 = $11 | 0;
 $12 = $12 | 0;
 $13 = $13 | 0;
 $14 = $14 | 0;
 $15 = $15 | 0;
 $16 = $16 | 0;
 var $$02932 = 0, $17 = 0, $33 = 0, $35 = 0, $37 = 0, $49 = 0, $AsyncCtx = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 191
 STACKTOP = STACKTOP + 64 | 0; //@line 192
 $17 = sp; //@line 193
 HEAP32[$0 >> 2] = 152; //@line 194
 HEAP32[$17 >> 2] = $1; //@line 195
 HEAP32[$17 + 4 >> 2] = $2; //@line 197
 HEAP32[$17 + 8 >> 2] = $3; //@line 199
 HEAP32[$17 + 12 >> 2] = $4; //@line 201
 HEAP32[$17 + 16 >> 2] = $5; //@line 203
 HEAP32[$17 + 20 >> 2] = $6; //@line 205
 HEAP32[$17 + 24 >> 2] = $7; //@line 207
 HEAP32[$17 + 28 >> 2] = $8; //@line 209
 HEAP32[$17 + 32 >> 2] = $9; //@line 211
 HEAP32[$17 + 36 >> 2] = $10; //@line 213
 HEAP32[$17 + 40 >> 2] = $11; //@line 215
 HEAP32[$17 + 44 >> 2] = $12; //@line 217
 HEAP32[$17 + 48 >> 2] = $13; //@line 219
 HEAP32[$17 + 52 >> 2] = $14; //@line 221
 HEAP32[$17 + 56 >> 2] = $15; //@line 223
 HEAP32[$17 + 60 >> 2] = $16; //@line 225
 $33 = $0 + 68 | 0; //@line 226
 HEAP32[$33 >> 2] = 0; //@line 227
 $$02932 = 0; //@line 228
 $35 = $1; //@line 228
 while (1) {
  if (($35 | 0) == -1) {
   HEAP32[$0 + 4 + ($$02932 << 2) >> 2] = 0; //@line 233
  } else {
   $AsyncCtx = _emscripten_alloc_async_context(32, sp) | 0; //@line 235
   $37 = __Znwj(24) | 0; //@line 236
   if (___async) {
    label = 6; //@line 239
    break;
   }
   _emscripten_free_async_context($AsyncCtx | 0); //@line 242
   HEAP32[$37 >> 2] = 0; //@line 243
   HEAP32[$37 + 4 >> 2] = 0; //@line 243
   HEAP32[$37 + 8 >> 2] = 0; //@line 243
   HEAP32[$37 + 12 >> 2] = 0; //@line 243
   HEAP32[$37 + 16 >> 2] = 0; //@line 243
   HEAP32[$37 + 20 >> 2] = 0; //@line 243
   _gpio_init_out($37, $35); //@line 244
   HEAP32[$0 + 4 + ($$02932 << 2) >> 2] = $37; //@line 246
   HEAP32[$33 >> 2] = HEAP32[$33 >> 2] | 1 << $$02932; //@line 250
  }
  $49 = $$02932 + 1 | 0; //@line 252
  if (($$02932 | 0) >= 15) {
   label = 2; //@line 255
   break;
  }
  $$02932 = $49; //@line 260
  $35 = HEAP32[$17 + ($49 << 2) >> 2] | 0; //@line 260
 }
 if ((label | 0) == 2) {
  STACKTOP = sp; //@line 263
  return;
 } else if ((label | 0) == 6) {
  HEAP32[$AsyncCtx >> 2] = 11; //@line 266
  HEAP32[$AsyncCtx + 4 >> 2] = $35; //@line 268
  HEAP32[$AsyncCtx + 8 >> 2] = $0; //@line 270
  HEAP32[$AsyncCtx + 12 >> 2] = $$02932; //@line 272
  HEAP32[$AsyncCtx + 16 >> 2] = $33; //@line 274
  HEAP32[$AsyncCtx + 20 >> 2] = $17; //@line 276
  HEAP32[$AsyncCtx + 24 >> 2] = $17; //@line 278
  HEAP32[$AsyncCtx + 28 >> 2] = $1; //@line 280
  sp = STACKTOP; //@line 281
  STACKTOP = sp; //@line 282
  return;
 }
}
function __ZNK10__cxxabiv121__vmi_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb_1($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $20 = 0, $22 = 0, $24 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 6274
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 6278
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 6280
 $8 = HEAP8[$0 + 16 >> 0] | 0; //@line 6282
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 6284
 $12 = HEAP8[$0 + 24 >> 0] | 0; //@line 6286
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 6288
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 6290
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 6292
 $20 = HEAP32[$0 + 40 >> 2] | 0; //@line 6294
 $22 = HEAP8[$0 + 44 >> 0] & 1; //@line 6297
 $24 = HEAP32[$0 + 48 >> 2] | 0; //@line 6299
 do {
  if ((HEAP32[$0 + 4 >> 2] | 0) > 1) {
   $26 = $4 + 24 | 0; //@line 6303
   $27 = $6 + 24 | 0; //@line 6304
   $28 = $4 + 8 | 0; //@line 6305
   $29 = $6 + 54 | 0; //@line 6306
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
    HEAP8[$10 >> 0] = 0; //@line 6336
    HEAP8[$14 >> 0] = 0; //@line 6337
    $ReallocAsyncCtx = _emscripten_realloc_async_context(60) | 0; //@line 6338
    __ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($26, $6, $16, $18, $20, $22); //@line 6339
    if (!___async) {
     ___async_unwind = 0; //@line 6342
    }
    HEAP32[$ReallocAsyncCtx >> 2] = 79; //@line 6344
    HEAP32[$ReallocAsyncCtx + 4 >> 2] = $26; //@line 6346
    HEAP32[$ReallocAsyncCtx + 8 >> 2] = $24; //@line 6348
    HEAP32[$ReallocAsyncCtx + 12 >> 2] = $29; //@line 6350
    HEAP8[$ReallocAsyncCtx + 16 >> 0] = $8; //@line 6352
    HEAP32[$ReallocAsyncCtx + 20 >> 2] = $10; //@line 6354
    HEAP8[$ReallocAsyncCtx + 24 >> 0] = $12; //@line 6356
    HEAP32[$ReallocAsyncCtx + 28 >> 2] = $14; //@line 6358
    HEAP32[$ReallocAsyncCtx + 32 >> 2] = $27; //@line 6360
    HEAP32[$ReallocAsyncCtx + 36 >> 2] = $28; //@line 6362
    HEAP32[$ReallocAsyncCtx + 40 >> 2] = $6; //@line 6364
    HEAP32[$ReallocAsyncCtx + 44 >> 2] = $16; //@line 6366
    HEAP32[$ReallocAsyncCtx + 48 >> 2] = $18; //@line 6368
    HEAP32[$ReallocAsyncCtx + 52 >> 2] = $20; //@line 6370
    HEAP8[$ReallocAsyncCtx + 56 >> 0] = $22 & 1; //@line 6373
    sp = STACKTOP; //@line 6374
    return;
   }
  }
 } while (0);
 HEAP8[$10 >> 0] = $8; //@line 6379
 HEAP8[$14 >> 0] = $12; //@line 6380
 return;
}
function __ZNK10__cxxabiv121__vmi_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $20 = 0, $22 = 0, $24 = 0, $26 = 0, $28 = 0, $4 = 0, $43 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 6158
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 6162
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 6164
 $8 = HEAP8[$0 + 16 >> 0] | 0; //@line 6166
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 6168
 $12 = HEAP8[$0 + 24 >> 0] | 0; //@line 6170
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 6172
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 6174
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 6176
 $20 = HEAP32[$0 + 40 >> 2] | 0; //@line 6178
 $22 = HEAP32[$0 + 44 >> 2] | 0; //@line 6180
 $24 = HEAP32[$0 + 48 >> 2] | 0; //@line 6182
 $26 = HEAP32[$0 + 52 >> 2] | 0; //@line 6184
 $28 = HEAP8[$0 + 56 >> 0] & 1; //@line 6187
 $43 = (HEAP32[$0 + 4 >> 2] | 0) + 8 | 0; //@line 6188
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
    HEAP8[$10 >> 0] = 0; //@line 6221
    HEAP8[$14 >> 0] = 0; //@line 6222
    $ReallocAsyncCtx = _emscripten_realloc_async_context(60) | 0; //@line 6223
    __ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($43, $20, $22, $24, $26, $28); //@line 6224
    if (!___async) {
     ___async_unwind = 0; //@line 6227
    }
    HEAP32[$ReallocAsyncCtx >> 2] = 79; //@line 6229
    HEAP32[$ReallocAsyncCtx + 4 >> 2] = $43; //@line 6231
    HEAP32[$ReallocAsyncCtx + 8 >> 2] = $4; //@line 6233
    HEAP32[$ReallocAsyncCtx + 12 >> 2] = $6; //@line 6235
    HEAP8[$ReallocAsyncCtx + 16 >> 0] = $8; //@line 6237
    HEAP32[$ReallocAsyncCtx + 20 >> 2] = $10; //@line 6239
    HEAP8[$ReallocAsyncCtx + 24 >> 0] = $12; //@line 6241
    HEAP32[$ReallocAsyncCtx + 28 >> 2] = $14; //@line 6243
    HEAP32[$ReallocAsyncCtx + 32 >> 2] = $16; //@line 6245
    HEAP32[$ReallocAsyncCtx + 36 >> 2] = $18; //@line 6247
    HEAP32[$ReallocAsyncCtx + 40 >> 2] = $20; //@line 6249
    HEAP32[$ReallocAsyncCtx + 44 >> 2] = $22; //@line 6251
    HEAP32[$ReallocAsyncCtx + 48 >> 2] = $24; //@line 6253
    HEAP32[$ReallocAsyncCtx + 52 >> 2] = $26; //@line 6255
    HEAP8[$ReallocAsyncCtx + 56 >> 0] = $28 & 1; //@line 6258
    sp = STACKTOP; //@line 6259
    return;
   }
  }
 } while (0);
 HEAP8[$10 >> 0] = $8; //@line 6264
 HEAP8[$14 >> 0] = $12; //@line 6265
 return;
}
function _memcpy(dest, src, num) {
 dest = dest | 0;
 src = src | 0;
 num = num | 0;
 var ret = 0, aligned_dest_end = 0, block_aligned_dest_end = 0, dest_end = 0;
 if ((num | 0) >= 8192) {
  return _emscripten_memcpy_big(dest | 0, src | 0, num | 0) | 0; //@line 8564
 }
 ret = dest | 0; //@line 8567
 dest_end = dest + num | 0; //@line 8568
 if ((dest & 3) == (src & 3)) {
  while (dest & 3) {
   if (!num) return ret | 0; //@line 8572
   HEAP8[dest >> 0] = HEAP8[src >> 0] | 0; //@line 8573
   dest = dest + 1 | 0; //@line 8574
   src = src + 1 | 0; //@line 8575
   num = num - 1 | 0; //@line 8576
  }
  aligned_dest_end = dest_end & -4 | 0; //@line 8578
  block_aligned_dest_end = aligned_dest_end - 64 | 0; //@line 8579
  while ((dest | 0) <= (block_aligned_dest_end | 0)) {
   HEAP32[dest >> 2] = HEAP32[src >> 2]; //@line 8581
   HEAP32[dest + 4 >> 2] = HEAP32[src + 4 >> 2]; //@line 8582
   HEAP32[dest + 8 >> 2] = HEAP32[src + 8 >> 2]; //@line 8583
   HEAP32[dest + 12 >> 2] = HEAP32[src + 12 >> 2]; //@line 8584
   HEAP32[dest + 16 >> 2] = HEAP32[src + 16 >> 2]; //@line 8585
   HEAP32[dest + 20 >> 2] = HEAP32[src + 20 >> 2]; //@line 8586
   HEAP32[dest + 24 >> 2] = HEAP32[src + 24 >> 2]; //@line 8587
   HEAP32[dest + 28 >> 2] = HEAP32[src + 28 >> 2]; //@line 8588
   HEAP32[dest + 32 >> 2] = HEAP32[src + 32 >> 2]; //@line 8589
   HEAP32[dest + 36 >> 2] = HEAP32[src + 36 >> 2]; //@line 8590
   HEAP32[dest + 40 >> 2] = HEAP32[src + 40 >> 2]; //@line 8591
   HEAP32[dest + 44 >> 2] = HEAP32[src + 44 >> 2]; //@line 8592
   HEAP32[dest + 48 >> 2] = HEAP32[src + 48 >> 2]; //@line 8593
   HEAP32[dest + 52 >> 2] = HEAP32[src + 52 >> 2]; //@line 8594
   HEAP32[dest + 56 >> 2] = HEAP32[src + 56 >> 2]; //@line 8595
   HEAP32[dest + 60 >> 2] = HEAP32[src + 60 >> 2]; //@line 8596
   dest = dest + 64 | 0; //@line 8597
   src = src + 64 | 0; //@line 8598
  }
  while ((dest | 0) < (aligned_dest_end | 0)) {
   HEAP32[dest >> 2] = HEAP32[src >> 2]; //@line 8601
   dest = dest + 4 | 0; //@line 8602
   src = src + 4 | 0; //@line 8603
  }
 } else {
  aligned_dest_end = dest_end - 4 | 0; //@line 8607
  while ((dest | 0) < (aligned_dest_end | 0)) {
   HEAP8[dest >> 0] = HEAP8[src >> 0] | 0; //@line 8609
   HEAP8[dest + 1 >> 0] = HEAP8[src + 1 >> 0] | 0; //@line 8610
   HEAP8[dest + 2 >> 0] = HEAP8[src + 2 >> 0] | 0; //@line 8611
   HEAP8[dest + 3 >> 0] = HEAP8[src + 3 >> 0] | 0; //@line 8612
   dest = dest + 4 | 0; //@line 8613
   src = src + 4 | 0; //@line 8614
  }
 }
 while ((dest | 0) < (dest_end | 0)) {
  HEAP8[dest >> 0] = HEAP8[src >> 0] | 0; //@line 8619
  dest = dest + 1 | 0; //@line 8620
  src = src + 1 | 0; //@line 8621
 }
 return ret | 0; //@line 8623
}
function __ZNK10__cxxabiv121__vmi_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $$0 = 0, $10 = 0, $19 = 0, $28 = 0, $9 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 5876
 L1 : do {
  if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, 0) | 0) {
   __ZNK10__cxxabiv117__class_type_info24process_found_base_classEPNS_19__dynamic_cast_infoEPvi(0, $1, $2, $3); //@line 5882
  } else {
   $9 = HEAP32[$0 + 12 >> 2] | 0; //@line 5886
   $10 = $0 + 16 + ($9 << 3) | 0; //@line 5887
   $AsyncCtx3 = _emscripten_alloc_async_context(28, sp) | 0; //@line 5888
   __ZNK10__cxxabiv122__base_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($0 + 16 | 0, $1, $2, $3); //@line 5889
   if (___async) {
    HEAP32[$AsyncCtx3 >> 2] = 85; //@line 5892
    HEAP32[$AsyncCtx3 + 4 >> 2] = $9; //@line 5894
    HEAP32[$AsyncCtx3 + 8 >> 2] = $0; //@line 5896
    HEAP32[$AsyncCtx3 + 12 >> 2] = $1; //@line 5898
    HEAP32[$AsyncCtx3 + 16 >> 2] = $2; //@line 5900
    HEAP32[$AsyncCtx3 + 20 >> 2] = $3; //@line 5902
    HEAP32[$AsyncCtx3 + 24 >> 2] = $10; //@line 5904
    sp = STACKTOP; //@line 5905
    return;
   }
   _emscripten_free_async_context($AsyncCtx3 | 0); //@line 5908
   if (($9 | 0) > 1) {
    $19 = $1 + 54 | 0; //@line 5912
    $$0 = $0 + 24 | 0; //@line 5913
    while (1) {
     $AsyncCtx = _emscripten_alloc_async_context(28, sp) | 0; //@line 5915
     __ZNK10__cxxabiv122__base_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($$0, $1, $2, $3); //@line 5916
     if (___async) {
      break;
     }
     _emscripten_free_async_context($AsyncCtx | 0); //@line 5921
     if (HEAP8[$19 >> 0] | 0) {
      break L1;
     }
     $28 = $$0 + 8 | 0; //@line 5927
     if ($28 >>> 0 < $10 >>> 0) {
      $$0 = $28; //@line 5930
     } else {
      break L1;
     }
    }
    HEAP32[$AsyncCtx >> 2] = 86; //@line 5935
    HEAP32[$AsyncCtx + 4 >> 2] = $19; //@line 5937
    HEAP32[$AsyncCtx + 8 >> 2] = $$0; //@line 5939
    HEAP32[$AsyncCtx + 12 >> 2] = $10; //@line 5941
    HEAP32[$AsyncCtx + 16 >> 2] = $1; //@line 5943
    HEAP32[$AsyncCtx + 20 >> 2] = $2; //@line 5945
    HEAP32[$AsyncCtx + 24 >> 2] = $3; //@line 5947
    sp = STACKTOP; //@line 5948
    return;
   }
  }
 } while (0);
 return;
}
function __ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$0 = 0, $$2 = 0, $17 = 0, $18 = 0, $3 = 0, $6 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, dest = 0, sp = 0, stop = 0;
 sp = STACKTOP; //@line 4642
 STACKTOP = STACKTOP + 64 | 0; //@line 4643
 $3 = sp; //@line 4644
 if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, $1, 0) | 0) {
  $$2 = 1; //@line 4647
 } else {
  if (!$1) {
   $$2 = 0; //@line 4651
  } else {
   $AsyncCtx3 = _emscripten_alloc_async_context(16, sp) | 0; //@line 4653
   $6 = ___dynamic_cast($1, 56, 40, 0) | 0; //@line 4654
   if (___async) {
    HEAP32[$AsyncCtx3 >> 2] = 70; //@line 4657
    HEAP32[$AsyncCtx3 + 4 >> 2] = $3; //@line 4659
    HEAP32[$AsyncCtx3 + 8 >> 2] = $0; //@line 4661
    HEAP32[$AsyncCtx3 + 12 >> 2] = $2; //@line 4663
    sp = STACKTOP; //@line 4664
    STACKTOP = sp; //@line 4665
    return 0; //@line 4665
   }
   _emscripten_free_async_context($AsyncCtx3 | 0); //@line 4667
   if (!$6) {
    $$2 = 0; //@line 4670
   } else {
    dest = $3 + 4 | 0; //@line 4673
    stop = dest + 52 | 0; //@line 4673
    do {
     HEAP32[dest >> 2] = 0; //@line 4673
     dest = dest + 4 | 0; //@line 4673
    } while ((dest | 0) < (stop | 0));
    HEAP32[$3 >> 2] = $6; //@line 4674
    HEAP32[$3 + 8 >> 2] = $0; //@line 4676
    HEAP32[$3 + 12 >> 2] = -1; //@line 4678
    HEAP32[$3 + 48 >> 2] = 1; //@line 4680
    $17 = HEAP32[(HEAP32[$6 >> 2] | 0) + 28 >> 2] | 0; //@line 4683
    $18 = HEAP32[$2 >> 2] | 0; //@line 4684
    $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 4685
    FUNCTION_TABLE_viiii[$17 & 3]($6, $3, $18, 1); //@line 4686
    if (___async) {
     HEAP32[$AsyncCtx >> 2] = 71; //@line 4689
     HEAP32[$AsyncCtx + 4 >> 2] = $3; //@line 4691
     HEAP32[$AsyncCtx + 8 >> 2] = $2; //@line 4693
     HEAP32[$AsyncCtx + 12 >> 2] = $3; //@line 4695
     sp = STACKTOP; //@line 4696
     STACKTOP = sp; //@line 4697
     return 0; //@line 4697
    }
    _emscripten_free_async_context($AsyncCtx | 0); //@line 4699
    if ((HEAP32[$3 + 24 >> 2] | 0) == 1) {
     HEAP32[$2 >> 2] = HEAP32[$3 + 16 >> 2]; //@line 4706
     $$0 = 1; //@line 4707
    } else {
     $$0 = 0; //@line 4709
    }
    $$2 = $$0; //@line 4711
   }
  }
 }
 STACKTOP = sp; //@line 4715
 return $$2 | 0; //@line 4715
}
function __ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_3($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $25 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 6663
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 6667
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 6669
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 6671
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 6673
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 6675
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 6677
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 6679
 $18 = HEAP8[$0 + 36 >> 0] & 1; //@line 6682
 $25 = (HEAP32[$0 + 4 >> 2] | 0) + 8 | 0; //@line 6683
 do {
  if ($25 >>> 0 < $4 >>> 0) {
   if (!(HEAP8[$6 >> 0] | 0)) {
    if ((HEAP32[$8 >> 2] | 0) == 1) {
     if ((HEAP32[$10 >> 2] | 0) == 1) {
      break;
     }
    }
    $ReallocAsyncCtx2 = _emscripten_realloc_async_context(40) | 0; //@line 6699
    __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($25, $12, $14, $16, $18); //@line 6700
    if (!___async) {
     ___async_unwind = 0; //@line 6703
    }
    HEAP32[$ReallocAsyncCtx2 >> 2] = 83; //@line 6705
    HEAP32[$ReallocAsyncCtx2 + 4 >> 2] = $25; //@line 6707
    HEAP32[$ReallocAsyncCtx2 + 8 >> 2] = $4; //@line 6709
    HEAP32[$ReallocAsyncCtx2 + 12 >> 2] = $6; //@line 6711
    HEAP32[$ReallocAsyncCtx2 + 16 >> 2] = $8; //@line 6713
    HEAP32[$ReallocAsyncCtx2 + 20 >> 2] = $10; //@line 6715
    HEAP32[$ReallocAsyncCtx2 + 24 >> 2] = $12; //@line 6717
    HEAP32[$ReallocAsyncCtx2 + 28 >> 2] = $14; //@line 6719
    HEAP32[$ReallocAsyncCtx2 + 32 >> 2] = $16; //@line 6721
    HEAP8[$ReallocAsyncCtx2 + 36 >> 0] = $18 & 1; //@line 6724
    sp = STACKTOP; //@line 6725
    return;
   }
  }
 } while (0);
 return;
}
function __ZN4mbed6BusOutD2Ev($0) {
 $0 = $0 | 0;
 var $11 = 0, $14 = 0, $17 = 0, $2 = 0, $20 = 0, $23 = 0, $26 = 0, $29 = 0, $32 = 0, $35 = 0, $38 = 0, $41 = 0, $44 = 0, $47 = 0, $5 = 0, $8 = 0;
 HEAP32[$0 >> 2] = 152; //@line 50
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 52
 if ($2 | 0) {
  __ZdlPv($2); //@line 55
 }
 $5 = HEAP32[$0 + 8 >> 2] | 0; //@line 58
 if ($5 | 0) {
  __ZdlPv($5); //@line 61
 }
 $8 = HEAP32[$0 + 12 >> 2] | 0; //@line 64
 if ($8 | 0) {
  __ZdlPv($8); //@line 67
 }
 $11 = HEAP32[$0 + 16 >> 2] | 0; //@line 70
 if ($11 | 0) {
  __ZdlPv($11); //@line 73
 }
 $14 = HEAP32[$0 + 20 >> 2] | 0; //@line 76
 if ($14 | 0) {
  __ZdlPv($14); //@line 79
 }
 $17 = HEAP32[$0 + 24 >> 2] | 0; //@line 82
 if ($17 | 0) {
  __ZdlPv($17); //@line 85
 }
 $20 = HEAP32[$0 + 28 >> 2] | 0; //@line 88
 if ($20 | 0) {
  __ZdlPv($20); //@line 91
 }
 $23 = HEAP32[$0 + 32 >> 2] | 0; //@line 94
 if ($23 | 0) {
  __ZdlPv($23); //@line 97
 }
 $26 = HEAP32[$0 + 36 >> 2] | 0; //@line 100
 if ($26 | 0) {
  __ZdlPv($26); //@line 103
 }
 $29 = HEAP32[$0 + 40 >> 2] | 0; //@line 106
 if ($29 | 0) {
  __ZdlPv($29); //@line 109
 }
 $32 = HEAP32[$0 + 44 >> 2] | 0; //@line 112
 if ($32 | 0) {
  __ZdlPv($32); //@line 115
 }
 $35 = HEAP32[$0 + 48 >> 2] | 0; //@line 118
 if ($35 | 0) {
  __ZdlPv($35); //@line 121
 }
 $38 = HEAP32[$0 + 52 >> 2] | 0; //@line 124
 if ($38 | 0) {
  __ZdlPv($38); //@line 127
 }
 $41 = HEAP32[$0 + 56 >> 2] | 0; //@line 130
 if ($41 | 0) {
  __ZdlPv($41); //@line 133
 }
 $44 = HEAP32[$0 + 60 >> 2] | 0; //@line 136
 if ($44 | 0) {
  __ZdlPv($44); //@line 139
 }
 $47 = HEAP32[$0 + 64 >> 2] | 0; //@line 142
 if (!$47) {
  return;
 }
 __ZdlPv($47); //@line 147
 return;
}
function _memset(ptr, value, num) {
 ptr = ptr | 0;
 value = value | 0;
 num = num | 0;
 var end = 0, aligned_end = 0, block_aligned_end = 0, value4 = 0;
 end = ptr + num | 0; //@line 8628
 value = value & 255; //@line 8630
 if ((num | 0) >= 67) {
  while (ptr & 3) {
   HEAP8[ptr >> 0] = value; //@line 8633
   ptr = ptr + 1 | 0; //@line 8634
  }
  aligned_end = end & -4 | 0; //@line 8637
  block_aligned_end = aligned_end - 64 | 0; //@line 8638
  value4 = value | value << 8 | value << 16 | value << 24; //@line 8639
  while ((ptr | 0) <= (block_aligned_end | 0)) {
   HEAP32[ptr >> 2] = value4; //@line 8642
   HEAP32[ptr + 4 >> 2] = value4; //@line 8643
   HEAP32[ptr + 8 >> 2] = value4; //@line 8644
   HEAP32[ptr + 12 >> 2] = value4; //@line 8645
   HEAP32[ptr + 16 >> 2] = value4; //@line 8646
   HEAP32[ptr + 20 >> 2] = value4; //@line 8647
   HEAP32[ptr + 24 >> 2] = value4; //@line 8648
   HEAP32[ptr + 28 >> 2] = value4; //@line 8649
   HEAP32[ptr + 32 >> 2] = value4; //@line 8650
   HEAP32[ptr + 36 >> 2] = value4; //@line 8651
   HEAP32[ptr + 40 >> 2] = value4; //@line 8652
   HEAP32[ptr + 44 >> 2] = value4; //@line 8653
   HEAP32[ptr + 48 >> 2] = value4; //@line 8654
   HEAP32[ptr + 52 >> 2] = value4; //@line 8655
   HEAP32[ptr + 56 >> 2] = value4; //@line 8656
   HEAP32[ptr + 60 >> 2] = value4; //@line 8657
   ptr = ptr + 64 | 0; //@line 8658
  }
  while ((ptr | 0) < (aligned_end | 0)) {
   HEAP32[ptr >> 2] = value4; //@line 8662
   ptr = ptr + 4 | 0; //@line 8663
  }
 }
 while ((ptr | 0) < (end | 0)) {
  HEAP8[ptr >> 0] = value; //@line 8668
  ptr = ptr + 1 | 0; //@line 8669
 }
 return end - num | 0; //@line 8671
}
function __ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $16 = 0, $21 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 6600
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 6604
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 6606
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 6608
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 6610
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 6612
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 6614
 $16 = HEAP8[$0 + 32 >> 0] & 1; //@line 6617
 $21 = (HEAP32[$0 + 4 >> 2] | 0) + 8 | 0; //@line 6618
 if ($21 >>> 0 < $4 >>> 0) {
  if (!(HEAP8[$6 >> 0] | 0)) {
   if ((HEAP32[$8 >> 2] | 0) != 1) {
    $ReallocAsyncCtx = _emscripten_realloc_async_context(36) | 0; //@line 6627
    __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($21, $10, $12, $14, $16); //@line 6628
    if (!___async) {
     ___async_unwind = 0; //@line 6631
    }
    HEAP32[$ReallocAsyncCtx >> 2] = 84; //@line 6633
    HEAP32[$ReallocAsyncCtx + 4 >> 2] = $21; //@line 6635
    HEAP32[$ReallocAsyncCtx + 8 >> 2] = $4; //@line 6637
    HEAP32[$ReallocAsyncCtx + 12 >> 2] = $6; //@line 6639
    HEAP32[$ReallocAsyncCtx + 16 >> 2] = $8; //@line 6641
    HEAP32[$ReallocAsyncCtx + 20 >> 2] = $10; //@line 6643
    HEAP32[$ReallocAsyncCtx + 24 >> 2] = $12; //@line 6645
    HEAP32[$ReallocAsyncCtx + 28 >> 2] = $14; //@line 6647
    HEAP8[$ReallocAsyncCtx + 32 >> 0] = $16 & 1; //@line 6650
    sp = STACKTOP; //@line 6651
    return;
   }
  }
 }
 return;
}
function __ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv__async_cb_57($0) {
 $0 = $0 | 0;
 var $15 = 0, $16 = 0, $2 = 0, $4 = 0, $6 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx = 0, dest = 0, sp = 0, stop = 0;
 sp = STACKTOP; //@line 8459
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 8461
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 8463
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 8465
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 8467
 if (!$AsyncRetVal) {
  HEAP8[___async_retval >> 0] = 0; //@line 8472
  return;
 }
 dest = $2 + 4 | 0; //@line 8476
 stop = dest + 52 | 0; //@line 8476
 do {
  HEAP32[dest >> 2] = 0; //@line 8476
  dest = dest + 4 | 0; //@line 8476
 } while ((dest | 0) < (stop | 0));
 HEAP32[$2 >> 2] = $AsyncRetVal; //@line 8477
 HEAP32[$2 + 8 >> 2] = $4; //@line 8479
 HEAP32[$2 + 12 >> 2] = -1; //@line 8481
 HEAP32[$2 + 48 >> 2] = 1; //@line 8483
 $15 = HEAP32[(HEAP32[$AsyncRetVal >> 2] | 0) + 28 >> 2] | 0; //@line 8486
 $16 = HEAP32[$6 >> 2] | 0; //@line 8487
 $ReallocAsyncCtx = _emscripten_realloc_async_context(16) | 0; //@line 8488
 FUNCTION_TABLE_viiii[$15 & 3]($AsyncRetVal, $2, $16, 1); //@line 8489
 if (!___async) {
  ___async_unwind = 0; //@line 8492
 }
 HEAP32[$ReallocAsyncCtx >> 2] = 71; //@line 8494
 HEAP32[$ReallocAsyncCtx + 4 >> 2] = $2; //@line 8496
 HEAP32[$ReallocAsyncCtx + 8 >> 2] = $6; //@line 8498
 HEAP32[$ReallocAsyncCtx + 12 >> 2] = $2; //@line 8500
 sp = STACKTOP; //@line 8501
 return;
}
function __ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_4($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $17 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 6736
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 6740
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 6742
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 6744
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 6746
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 6748
 $14 = HEAP8[$0 + 28 >> 0] & 1; //@line 6751
 $17 = (HEAP32[$0 + 4 >> 2] | 0) + 8 | 0; //@line 6752
 if ($17 >>> 0 < $4 >>> 0) {
  if (!(HEAP8[$6 >> 0] | 0)) {
   $ReallocAsyncCtx3 = _emscripten_realloc_async_context(32) | 0; //@line 6758
   __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($17, $8, $10, $12, $14); //@line 6759
   if (!___async) {
    ___async_unwind = 0; //@line 6762
   }
   HEAP32[$ReallocAsyncCtx3 >> 2] = 82; //@line 6764
   HEAP32[$ReallocAsyncCtx3 + 4 >> 2] = $17; //@line 6766
   HEAP32[$ReallocAsyncCtx3 + 8 >> 2] = $4; //@line 6768
   HEAP32[$ReallocAsyncCtx3 + 12 >> 2] = $6; //@line 6770
   HEAP32[$ReallocAsyncCtx3 + 16 >> 2] = $8; //@line 6772
   HEAP32[$ReallocAsyncCtx3 + 20 >> 2] = $10; //@line 6774
   HEAP32[$ReallocAsyncCtx3 + 24 >> 2] = $12; //@line 6776
   HEAP8[$ReallocAsyncCtx3 + 28 >> 0] = $14 & 1; //@line 6779
   sp = STACKTOP; //@line 6780
   return;
  }
 }
 return;
}
function __ZNK10__cxxabiv121__vmi_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $13 = 0, $2 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 7559
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 7561
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 7565
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 7567
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 7569
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 7571
 if (!(HEAP8[$2 >> 0] | 0)) {
  $13 = (HEAP32[$0 + 8 >> 2] | 0) + 8 | 0; //@line 7575
  if ($13 >>> 0 < $6 >>> 0) {
   $ReallocAsyncCtx = _emscripten_realloc_async_context(28) | 0; //@line 7578
   __ZNK10__cxxabiv122__base_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($13, $8, $10, $12); //@line 7579
   if (!___async) {
    ___async_unwind = 0; //@line 7582
   }
   HEAP32[$ReallocAsyncCtx >> 2] = 86; //@line 7584
   HEAP32[$ReallocAsyncCtx + 4 >> 2] = $2; //@line 7586
   HEAP32[$ReallocAsyncCtx + 8 >> 2] = $13; //@line 7588
   HEAP32[$ReallocAsyncCtx + 12 >> 2] = $6; //@line 7590
   HEAP32[$ReallocAsyncCtx + 16 >> 2] = $8; //@line 7592
   HEAP32[$ReallocAsyncCtx + 20 >> 2] = $10; //@line 7594
   HEAP32[$ReallocAsyncCtx + 24 >> 2] = $12; //@line 7596
   sp = STACKTOP; //@line 7597
   return;
  }
 }
 return;
}
function __ZNK10__cxxabiv117__class_type_info29process_static_type_above_dstEPNS_19__dynamic_cast_infoEPKvS4_i($0, $1, $2, $3, $4) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 var $10 = 0, $11 = 0, $21 = 0, $22 = 0, $28 = 0, $30 = 0;
 HEAP8[$1 + 53 >> 0] = 1; //@line 4889
 do {
  if ((HEAP32[$1 + 4 >> 2] | 0) == ($3 | 0)) {
   HEAP8[$1 + 52 >> 0] = 1; //@line 4896
   $10 = $1 + 16 | 0; //@line 4897
   $11 = HEAP32[$10 >> 2] | 0; //@line 4898
   if (!$11) {
    HEAP32[$10 >> 2] = $2; //@line 4901
    HEAP32[$1 + 24 >> 2] = $4; //@line 4903
    HEAP32[$1 + 36 >> 2] = 1; //@line 4905
    if (!(($4 | 0) == 1 ? (HEAP32[$1 + 48 >> 2] | 0) == 1 : 0)) {
     break;
    }
    HEAP8[$1 + 54 >> 0] = 1; //@line 4915
    break;
   }
   if (($11 | 0) != ($2 | 0)) {
    $30 = $1 + 36 | 0; //@line 4920
    HEAP32[$30 >> 2] = (HEAP32[$30 >> 2] | 0) + 1; //@line 4923
    HEAP8[$1 + 54 >> 0] = 1; //@line 4925
    break;
   }
   $21 = $1 + 24 | 0; //@line 4928
   $22 = HEAP32[$21 >> 2] | 0; //@line 4929
   if (($22 | 0) == 2) {
    HEAP32[$21 >> 2] = $4; //@line 4932
    $28 = $4; //@line 4933
   } else {
    $28 = $22; //@line 4935
   }
   if (($28 | 0) == 1 ? (HEAP32[$1 + 48 >> 2] | 0) == 1 : 0) {
    HEAP8[$1 + 54 >> 0] = 1; //@line 4944
   }
  }
 } while (0);
 return;
}
function __ZNK10__cxxabiv121__vmi_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb_22($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 7607
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 7613
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 7615
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 7617
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 7619
 if ((HEAP32[$0 + 4 >> 2] | 0) <= 1) {
  return;
 }
 $14 = (HEAP32[$0 + 8 >> 2] | 0) + 24 | 0; //@line 7624
 $ReallocAsyncCtx = _emscripten_realloc_async_context(28) | 0; //@line 7626
 __ZNK10__cxxabiv122__base_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($14, $6, $8, $10); //@line 7627
 if (!___async) {
  ___async_unwind = 0; //@line 7630
 }
 HEAP32[$ReallocAsyncCtx >> 2] = 86; //@line 7632
 HEAP32[$ReallocAsyncCtx + 4 >> 2] = $6 + 54; //@line 7634
 HEAP32[$ReallocAsyncCtx + 8 >> 2] = $14; //@line 7636
 HEAP32[$ReallocAsyncCtx + 12 >> 2] = $12; //@line 7638
 HEAP32[$ReallocAsyncCtx + 16 >> 2] = $6; //@line 7640
 HEAP32[$ReallocAsyncCtx + 20 >> 2] = $8; //@line 7642
 HEAP32[$ReallocAsyncCtx + 24 >> 2] = $10; //@line 7644
 sp = STACKTOP; //@line 7645
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
   __ZNK10__cxxabiv117__class_type_info29process_static_type_below_dstEPNS_19__dynamic_cast_infoEPKvi(0, $1, $2, $3); //@line 4748
  } else {
   if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 >> 2] | 0, $4) | 0) {
    if ((HEAP32[$1 + 16 >> 2] | 0) != ($2 | 0)) {
     $13 = $1 + 20 | 0; //@line 4757
     if ((HEAP32[$13 >> 2] | 0) != ($2 | 0)) {
      HEAP32[$1 + 32 >> 2] = $3; //@line 4762
      HEAP32[$13 >> 2] = $2; //@line 4763
      $19 = $1 + 40 | 0; //@line 4764
      HEAP32[$19 >> 2] = (HEAP32[$19 >> 2] | 0) + 1; //@line 4767
      if ((HEAP32[$1 + 36 >> 2] | 0) == 1) {
       if ((HEAP32[$1 + 24 >> 2] | 0) == 2) {
        HEAP8[$1 + 54 >> 0] = 1; //@line 4777
       }
      }
      HEAP32[$1 + 44 >> 2] = 4; //@line 4781
      break;
     }
    }
    if (($3 | 0) == 1) {
     HEAP32[$1 + 32 >> 2] = 1; //@line 4788
    }
   }
  }
 } while (0);
 return;
}
function __ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb($0) {
 $0 = $0 | 0;
 var $$037$off038 = 0, $$037$off039 = 0, $12 = 0, $17 = 0, $4 = 0, $6 = 0, $8 = 0, label = 0;
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 8366
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 8368
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 8370
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 8374
 if (!(HEAP8[HEAP32[$0 + 4 >> 2] >> 0] | 0)) {
  $$037$off038 = 4; //@line 8378
  label = 4; //@line 8379
 } else {
  if (!(HEAP8[HEAP32[$0 + 20 >> 2] >> 0] | 0)) {
   $$037$off038 = 3; //@line 8384
   label = 4; //@line 8385
  } else {
   $$037$off039 = 3; //@line 8387
  }
 }
 if ((label | 0) == 4) {
  HEAP32[$6 >> 2] = $4; //@line 8391
  $17 = $8 + 40 | 0; //@line 8392
  HEAP32[$17 >> 2] = (HEAP32[$17 >> 2] | 0) + 1; //@line 8395
  if ((HEAP32[$8 + 36 >> 2] | 0) == 1) {
   if ((HEAP32[$8 + 24 >> 2] | 0) == 2) {
    HEAP8[$8 + 54 >> 0] = 1; //@line 8405
    $$037$off039 = $$037$off038; //@line 8406
   } else {
    $$037$off039 = $$037$off038; //@line 8408
   }
  } else {
   $$037$off039 = $$037$off038; //@line 8411
  }
 }
 HEAP32[$12 >> 2] = $$037$off039; //@line 8414
 return;
}
function _invoke_ticker($0) {
 $0 = $0 | 0;
 var $2 = 0, $3 = 0, $7 = 0, $8 = 0, $AsyncCtx = 0, $AsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 853
 $2 = $0 + 12 | 0; //@line 855
 $3 = HEAP32[$2 >> 2] | 0; //@line 856
 do {
  if (!$3) {
   $AsyncCtx2 = _emscripten_alloc_async_context(12, sp) | 0; //@line 860
   _mbed_assert_internal(460, 465, 528); //@line 861
   if (___async) {
    HEAP32[$AsyncCtx2 >> 2] = 32; //@line 864
    HEAP32[$AsyncCtx2 + 4 >> 2] = $2; //@line 866
    HEAP32[$AsyncCtx2 + 8 >> 2] = $0; //@line 868
    sp = STACKTOP; //@line 869
    return;
   } else {
    _emscripten_free_async_context($AsyncCtx2 | 0); //@line 872
    $8 = HEAP32[$2 >> 2] | 0; //@line 874
    break;
   }
  } else {
   $8 = $3; //@line 878
  }
 } while (0);
 $7 = HEAP32[$8 >> 2] | 0; //@line 881
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 883
 FUNCTION_TABLE_vi[$7 & 127]($0); //@line 884
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 33; //@line 887
  sp = STACKTOP; //@line 888
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 891
  return;
 }
}
function __ZNK10__cxxabiv120__si_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($0, $1, $2, $3, $4, $5) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 $5 = $5 | 0;
 var $10 = 0, $13 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 5104
 do {
  if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, $5) | 0) {
   __ZNK10__cxxabiv117__class_type_info29process_static_type_above_dstEPNS_19__dynamic_cast_infoEPKvS4_i(0, $1, $2, $3, $4); //@line 5110
  } else {
   $10 = HEAP32[$0 + 8 >> 2] | 0; //@line 5113
   $13 = HEAP32[(HEAP32[$10 >> 2] | 0) + 20 >> 2] | 0; //@line 5116
   $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 5117
   FUNCTION_TABLE_viiiiii[$13 & 3]($10, $1, $2, $3, $4, $5); //@line 5118
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 74; //@line 5121
    sp = STACKTOP; //@line 5122
    return;
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 5125
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
 sp = STACKTOP; //@line 6005
 $7 = HEAP32[$0 + 4 >> 2] | 0; //@line 6007
 $8 = $7 >> 8; //@line 6008
 if (!($7 & 1)) {
  $$0 = $8; //@line 6012
 } else {
  $$0 = HEAP32[(HEAP32[$3 >> 2] | 0) + $8 >> 2] | 0; //@line 6017
 }
 $14 = HEAP32[$0 >> 2] | 0; //@line 6019
 $17 = HEAP32[(HEAP32[$14 >> 2] | 0) + 20 >> 2] | 0; //@line 6022
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 6027
 FUNCTION_TABLE_viiiiii[$17 & 3]($14, $1, $2, $3 + $$0 | 0, $7 & 2 | 0 ? $4 : 2, $5); //@line 6028
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 88; //@line 6031
  sp = STACKTOP; //@line 6032
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 6035
  return;
 }
}
function __ZNK10__cxxabiv120__si_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $11 = 0, $8 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 5273
 do {
  if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, 0) | 0) {
   __ZNK10__cxxabiv117__class_type_info24process_found_base_classEPNS_19__dynamic_cast_infoEPvi(0, $1, $2, $3); //@line 5279
  } else {
   $8 = HEAP32[$0 + 8 >> 2] | 0; //@line 5282
   $11 = HEAP32[(HEAP32[$8 >> 2] | 0) + 28 >> 2] | 0; //@line 5285
   $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 5286
   FUNCTION_TABLE_viiii[$11 & 3]($8, $1, $2, $3); //@line 5287
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 77; //@line 5290
    sp = STACKTOP; //@line 5291
    return;
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 5294
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
 sp = STACKTOP; //@line 6095
 STACKTOP = STACKTOP + 16 | 0; //@line 6096
 $3 = sp; //@line 6097
 HEAP32[$3 >> 2] = HEAP32[$2 >> 2]; //@line 6099
 $7 = HEAP32[(HEAP32[$0 >> 2] | 0) + 16 >> 2] | 0; //@line 6102
 $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 6103
 $8 = FUNCTION_TABLE_iiii[$7 & 1]($0, $1, $3) | 0; //@line 6104
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 90; //@line 6107
  HEAP32[$AsyncCtx + 4 >> 2] = $3; //@line 6109
  HEAP32[$AsyncCtx + 8 >> 2] = $2; //@line 6111
  HEAP32[$AsyncCtx + 12 >> 2] = $3; //@line 6113
  sp = STACKTOP; //@line 6114
  STACKTOP = sp; //@line 6115
  return 0; //@line 6115
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 6117
 if ($8) {
  HEAP32[$2 >> 2] = HEAP32[$3 >> 2]; //@line 6121
 }
 STACKTOP = sp; //@line 6123
 return $8 & 1 | 0; //@line 6123
}
function __Znwj($0) {
 $0 = $0 | 0;
 var $$ = 0, $$lcssa = 0, $2 = 0, $4 = 0, $AsyncCtx = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 4564
 $$ = ($0 | 0) == 0 ? 1 : $0; //@line 4566
 while (1) {
  $2 = _malloc($$) | 0; //@line 4568
  if ($2 | 0) {
   $$lcssa = $2; //@line 4571
   label = 7; //@line 4572
   break;
  }
  $4 = __ZSt15get_new_handlerv() | 0; //@line 4575
  if (!$4) {
   $$lcssa = 0; //@line 4578
   label = 7; //@line 4579
   break;
  }
  $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 4582
  FUNCTION_TABLE_v[$4 & 0](); //@line 4583
  if (___async) {
   label = 5; //@line 4586
   break;
  }
  _emscripten_free_async_context($AsyncCtx | 0); //@line 4589
 }
 if ((label | 0) == 5) {
  HEAP32[$AsyncCtx >> 2] = 69; //@line 4592
  HEAP32[$AsyncCtx + 4 >> 2] = $$; //@line 4594
  sp = STACKTOP; //@line 4595
  return 0; //@line 4596
 } else if ((label | 0) == 7) {
  return $$lcssa | 0; //@line 4599
 }
 return 0; //@line 4601
}
function ___dynamic_cast__async_cb_2($0) {
 $0 = $0 | 0;
 var $$0 = 0, $10 = 0, $16 = 0, $6 = 0, $8 = 0;
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 6532
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 6534
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 6536
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 6542
 L2 : do {
  switch (HEAP32[HEAP32[$0 + 4 >> 2] >> 2] | 0) {
  case 0:
   {
    $$0 = (HEAP32[$6 >> 2] | 0) == 1 & (HEAP32[$8 >> 2] | 0) == 1 & (HEAP32[$10 >> 2] | 0) == 1 ? HEAP32[HEAP32[$0 + 24 >> 2] >> 2] | 0 : 0; //@line 6557
    break;
   }
  case 1:
   {
    if ((HEAP32[HEAP32[$0 + 28 >> 2] >> 2] | 0) != 1) {
     if (!((HEAP32[$6 >> 2] | 0) == 0 & (HEAP32[$8 >> 2] | 0) == 1 & (HEAP32[$10 >> 2] | 0) == 1)) {
      $$0 = 0; //@line 6573
      break L2;
     }
    }
    $$0 = HEAP32[$16 >> 2] | 0; //@line 6578
    break;
   }
  default:
   {
    $$0 = 0; //@line 6582
   }
  }
 } while (0);
 HEAP32[___async_retval >> 2] = $$0; //@line 6587
 return;
}
function __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($0, $1, $2, $3, $4) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 var $$0 = 0, $13 = 0, $16 = 0, $6 = 0, $7 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 6047
 $6 = HEAP32[$0 + 4 >> 2] | 0; //@line 6049
 $7 = $6 >> 8; //@line 6050
 if (!($6 & 1)) {
  $$0 = $7; //@line 6054
 } else {
  $$0 = HEAP32[(HEAP32[$2 >> 2] | 0) + $7 >> 2] | 0; //@line 6059
 }
 $13 = HEAP32[$0 >> 2] | 0; //@line 6061
 $16 = HEAP32[(HEAP32[$13 >> 2] | 0) + 24 >> 2] | 0; //@line 6064
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 6069
 FUNCTION_TABLE_viiiii[$16 & 3]($13, $1, $2 + $$0 | 0, $6 & 2 | 0 ? $3 : 2, $4); //@line 6070
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 89; //@line 6073
  sp = STACKTOP; //@line 6074
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 6077
  return;
 }
}
function __ZNK10__cxxabiv122__base_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $$0 = 0, $12 = 0, $15 = 0, $5 = 0, $6 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 5962
 $5 = HEAP32[$0 + 4 >> 2] | 0; //@line 5964
 $6 = $5 >> 8; //@line 5965
 if (!($5 & 1)) {
  $$0 = $6; //@line 5969
 } else {
  $$0 = HEAP32[(HEAP32[$2 >> 2] | 0) + $6 >> 2] | 0; //@line 5974
 }
 $12 = HEAP32[$0 >> 2] | 0; //@line 5976
 $15 = HEAP32[(HEAP32[$12 >> 2] | 0) + 28 >> 2] | 0; //@line 5979
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 5984
 FUNCTION_TABLE_viiii[$15 & 3]($12, $1, $2 + $$0 | 0, $5 & 2 | 0 ? $3 : 2); //@line 5985
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 87; //@line 5988
  sp = STACKTOP; //@line 5989
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 5992
  return;
 }
}
function __ZNK10__cxxabiv117__class_type_info24process_found_base_classEPNS_19__dynamic_cast_infoEPvi($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $10 = 0, $13 = 0, $4 = 0, $5 = 0;
 $4 = $1 + 16 | 0; //@line 4826
 $5 = HEAP32[$4 >> 2] | 0; //@line 4827
 do {
  if (!$5) {
   HEAP32[$4 >> 2] = $2; //@line 4831
   HEAP32[$1 + 24 >> 2] = $3; //@line 4833
   HEAP32[$1 + 36 >> 2] = 1; //@line 4835
  } else {
   if (($5 | 0) != ($2 | 0)) {
    $13 = $1 + 36 | 0; //@line 4839
    HEAP32[$13 >> 2] = (HEAP32[$13 >> 2] | 0) + 1; //@line 4842
    HEAP32[$1 + 24 >> 2] = 2; //@line 4844
    HEAP8[$1 + 54 >> 0] = 1; //@line 4846
    break;
   }
   $10 = $1 + 24 | 0; //@line 4849
   if ((HEAP32[$10 >> 2] | 0) == 2) {
    HEAP32[$10 >> 2] = $3; //@line 4853
   }
  }
 } while (0);
 return;
}
function __Znwj__async_cb($0) {
 $0 = $0 | 0;
 var $$lcssa = 0, $2 = 0, $3 = 0, $5 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 8328
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 8330
 $3 = _malloc($2) | 0; //@line 8331
 if (!$3) {
  $5 = __ZSt15get_new_handlerv() | 0; //@line 8334
  if (!$5) {
   $$lcssa = 0; //@line 8337
  } else {
   $ReallocAsyncCtx = _emscripten_realloc_async_context(8) | 0; //@line 8339
   FUNCTION_TABLE_v[$5 & 0](); //@line 8340
   if (!___async) {
    ___async_unwind = 0; //@line 8343
   }
   HEAP32[$ReallocAsyncCtx >> 2] = 69; //@line 8345
   HEAP32[$ReallocAsyncCtx + 4 >> 2] = $2; //@line 8347
   sp = STACKTOP; //@line 8348
   return;
  }
 } else {
  $$lcssa = $3; //@line 8352
 }
 HEAP32[___async_retval >> 2] = $$lcssa; //@line 8355
 return;
}
function _mbed_assert_internal($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $AsyncCtx = 0, $vararg_buffer = 0, sp = 0;
 sp = STACKTOP; //@line 497
 STACKTOP = STACKTOP + 16 | 0; //@line 498
 $vararg_buffer = sp; //@line 499
 HEAP32[$vararg_buffer >> 2] = $0; //@line 500
 HEAP32[$vararg_buffer + 4 >> 2] = $1; //@line 502
 HEAP32[$vararg_buffer + 8 >> 2] = $2; //@line 504
 _mbed_error_printf(337, $vararg_buffer); //@line 505
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 506
 _mbed_die(); //@line 507
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 15; //@line 510
  sp = STACKTOP; //@line 511
  STACKTOP = sp; //@line 512
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 514
  STACKTOP = sp; //@line 515
  return;
 }
}
function _mbed_die__async_cb_21($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx15 = 0, sp = 0;
 sp = STACKTOP; //@line 7499
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 7501
 _emscripten_asm_const_iii(0, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 7503
 $ReallocAsyncCtx15 = _emscripten_realloc_async_context(8) | 0; //@line 7504
 _wait_ms(150); //@line 7505
 if (___async) {
  HEAP32[$ReallocAsyncCtx15 >> 2] = 17; //@line 7508
  $4 = $ReallocAsyncCtx15 + 4 | 0; //@line 7509
  HEAP32[$4 >> 2] = $2; //@line 7510
  sp = STACKTOP; //@line 7511
  return;
 }
 ___async_unwind = 0; //@line 7514
 HEAP32[$ReallocAsyncCtx15 >> 2] = 17; //@line 7515
 $4 = $ReallocAsyncCtx15 + 4 | 0; //@line 7516
 HEAP32[$4 >> 2] = $2; //@line 7517
 sp = STACKTOP; //@line 7518
 return;
}
function _mbed_die__async_cb_20($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx14 = 0, sp = 0;
 sp = STACKTOP; //@line 7474
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 7476
 _emscripten_asm_const_iii(0, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 7478
 $ReallocAsyncCtx14 = _emscripten_realloc_async_context(8) | 0; //@line 7479
 _wait_ms(150); //@line 7480
 if (___async) {
  HEAP32[$ReallocAsyncCtx14 >> 2] = 18; //@line 7483
  $4 = $ReallocAsyncCtx14 + 4 | 0; //@line 7484
  HEAP32[$4 >> 2] = $2; //@line 7485
  sp = STACKTOP; //@line 7486
  return;
 }
 ___async_unwind = 0; //@line 7489
 HEAP32[$ReallocAsyncCtx14 >> 2] = 18; //@line 7490
 $4 = $ReallocAsyncCtx14 + 4 | 0; //@line 7491
 HEAP32[$4 >> 2] = $2; //@line 7492
 sp = STACKTOP; //@line 7493
 return;
}
function _mbed_die__async_cb_19($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx13 = 0, sp = 0;
 sp = STACKTOP; //@line 7449
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 7451
 _emscripten_asm_const_iii(0, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 7453
 $ReallocAsyncCtx13 = _emscripten_realloc_async_context(8) | 0; //@line 7454
 _wait_ms(150); //@line 7455
 if (___async) {
  HEAP32[$ReallocAsyncCtx13 >> 2] = 19; //@line 7458
  $4 = $ReallocAsyncCtx13 + 4 | 0; //@line 7459
  HEAP32[$4 >> 2] = $2; //@line 7460
  sp = STACKTOP; //@line 7461
  return;
 }
 ___async_unwind = 0; //@line 7464
 HEAP32[$ReallocAsyncCtx13 >> 2] = 19; //@line 7465
 $4 = $ReallocAsyncCtx13 + 4 | 0; //@line 7466
 HEAP32[$4 >> 2] = $2; //@line 7467
 sp = STACKTOP; //@line 7468
 return;
}
function _mbed_die__async_cb_18($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx12 = 0, sp = 0;
 sp = STACKTOP; //@line 7424
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 7426
 _emscripten_asm_const_iii(0, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 7428
 $ReallocAsyncCtx12 = _emscripten_realloc_async_context(8) | 0; //@line 7429
 _wait_ms(150); //@line 7430
 if (___async) {
  HEAP32[$ReallocAsyncCtx12 >> 2] = 20; //@line 7433
  $4 = $ReallocAsyncCtx12 + 4 | 0; //@line 7434
  HEAP32[$4 >> 2] = $2; //@line 7435
  sp = STACKTOP; //@line 7436
  return;
 }
 ___async_unwind = 0; //@line 7439
 HEAP32[$ReallocAsyncCtx12 >> 2] = 20; //@line 7440
 $4 = $ReallocAsyncCtx12 + 4 | 0; //@line 7441
 HEAP32[$4 >> 2] = $2; //@line 7442
 sp = STACKTOP; //@line 7443
 return;
}
function _mbed_die__async_cb_17($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx11 = 0, sp = 0;
 sp = STACKTOP; //@line 7399
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 7401
 _emscripten_asm_const_iii(0, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 7403
 $ReallocAsyncCtx11 = _emscripten_realloc_async_context(8) | 0; //@line 7404
 _wait_ms(150); //@line 7405
 if (___async) {
  HEAP32[$ReallocAsyncCtx11 >> 2] = 21; //@line 7408
  $4 = $ReallocAsyncCtx11 + 4 | 0; //@line 7409
  HEAP32[$4 >> 2] = $2; //@line 7410
  sp = STACKTOP; //@line 7411
  return;
 }
 ___async_unwind = 0; //@line 7414
 HEAP32[$ReallocAsyncCtx11 >> 2] = 21; //@line 7415
 $4 = $ReallocAsyncCtx11 + 4 | 0; //@line 7416
 HEAP32[$4 >> 2] = $2; //@line 7417
 sp = STACKTOP; //@line 7418
 return;
}
function _mbed_die__async_cb_16($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx10 = 0, sp = 0;
 sp = STACKTOP; //@line 7374
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 7376
 _emscripten_asm_const_iii(0, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 7378
 $ReallocAsyncCtx10 = _emscripten_realloc_async_context(8) | 0; //@line 7379
 _wait_ms(150); //@line 7380
 if (___async) {
  HEAP32[$ReallocAsyncCtx10 >> 2] = 22; //@line 7383
  $4 = $ReallocAsyncCtx10 + 4 | 0; //@line 7384
  HEAP32[$4 >> 2] = $2; //@line 7385
  sp = STACKTOP; //@line 7386
  return;
 }
 ___async_unwind = 0; //@line 7389
 HEAP32[$ReallocAsyncCtx10 >> 2] = 22; //@line 7390
 $4 = $ReallocAsyncCtx10 + 4 | 0; //@line 7391
 HEAP32[$4 >> 2] = $2; //@line 7392
 sp = STACKTOP; //@line 7393
 return;
}
function _mbed_die__async_cb($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx16 = 0, sp = 0;
 sp = STACKTOP; //@line 7124
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 7126
 _emscripten_asm_const_iii(0, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 7128
 $ReallocAsyncCtx16 = _emscripten_realloc_async_context(8) | 0; //@line 7129
 _wait_ms(150); //@line 7130
 if (___async) {
  HEAP32[$ReallocAsyncCtx16 >> 2] = 16; //@line 7133
  $4 = $ReallocAsyncCtx16 + 4 | 0; //@line 7134
  HEAP32[$4 >> 2] = $2; //@line 7135
  sp = STACKTOP; //@line 7136
  return;
 }
 ___async_unwind = 0; //@line 7139
 HEAP32[$ReallocAsyncCtx16 >> 2] = 16; //@line 7140
 $4 = $ReallocAsyncCtx16 + 4 | 0; //@line 7141
 HEAP32[$4 >> 2] = $2; //@line 7142
 sp = STACKTOP; //@line 7143
 return;
}
function _mbed_die__async_cb_15($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx9 = 0, sp = 0;
 sp = STACKTOP; //@line 7349
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 7351
 _emscripten_asm_const_iii(0, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 7353
 $ReallocAsyncCtx9 = _emscripten_realloc_async_context(8) | 0; //@line 7354
 _wait_ms(150); //@line 7355
 if (___async) {
  HEAP32[$ReallocAsyncCtx9 >> 2] = 23; //@line 7358
  $4 = $ReallocAsyncCtx9 + 4 | 0; //@line 7359
  HEAP32[$4 >> 2] = $2; //@line 7360
  sp = STACKTOP; //@line 7361
  return;
 }
 ___async_unwind = 0; //@line 7364
 HEAP32[$ReallocAsyncCtx9 >> 2] = 23; //@line 7365
 $4 = $ReallocAsyncCtx9 + 4 | 0; //@line 7366
 HEAP32[$4 >> 2] = $2; //@line 7367
 sp = STACKTOP; //@line 7368
 return;
}
function _mbed_die__async_cb_14($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx8 = 0, sp = 0;
 sp = STACKTOP; //@line 7324
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 7326
 _emscripten_asm_const_iii(0, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 7328
 $ReallocAsyncCtx8 = _emscripten_realloc_async_context(8) | 0; //@line 7329
 _wait_ms(400); //@line 7330
 if (___async) {
  HEAP32[$ReallocAsyncCtx8 >> 2] = 24; //@line 7333
  $4 = $ReallocAsyncCtx8 + 4 | 0; //@line 7334
  HEAP32[$4 >> 2] = $2; //@line 7335
  sp = STACKTOP; //@line 7336
  return;
 }
 ___async_unwind = 0; //@line 7339
 HEAP32[$ReallocAsyncCtx8 >> 2] = 24; //@line 7340
 $4 = $ReallocAsyncCtx8 + 4 | 0; //@line 7341
 HEAP32[$4 >> 2] = $2; //@line 7342
 sp = STACKTOP; //@line 7343
 return;
}
function _mbed_die__async_cb_13($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx7 = 0, sp = 0;
 sp = STACKTOP; //@line 7299
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 7301
 _emscripten_asm_const_iii(0, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 7303
 $ReallocAsyncCtx7 = _emscripten_realloc_async_context(8) | 0; //@line 7304
 _wait_ms(400); //@line 7305
 if (___async) {
  HEAP32[$ReallocAsyncCtx7 >> 2] = 25; //@line 7308
  $4 = $ReallocAsyncCtx7 + 4 | 0; //@line 7309
  HEAP32[$4 >> 2] = $2; //@line 7310
  sp = STACKTOP; //@line 7311
  return;
 }
 ___async_unwind = 0; //@line 7314
 HEAP32[$ReallocAsyncCtx7 >> 2] = 25; //@line 7315
 $4 = $ReallocAsyncCtx7 + 4 | 0; //@line 7316
 HEAP32[$4 >> 2] = $2; //@line 7317
 sp = STACKTOP; //@line 7318
 return;
}
function _mbed_die__async_cb_12($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx6 = 0, sp = 0;
 sp = STACKTOP; //@line 7274
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 7276
 _emscripten_asm_const_iii(0, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 7278
 $ReallocAsyncCtx6 = _emscripten_realloc_async_context(8) | 0; //@line 7279
 _wait_ms(400); //@line 7280
 if (___async) {
  HEAP32[$ReallocAsyncCtx6 >> 2] = 26; //@line 7283
  $4 = $ReallocAsyncCtx6 + 4 | 0; //@line 7284
  HEAP32[$4 >> 2] = $2; //@line 7285
  sp = STACKTOP; //@line 7286
  return;
 }
 ___async_unwind = 0; //@line 7289
 HEAP32[$ReallocAsyncCtx6 >> 2] = 26; //@line 7290
 $4 = $ReallocAsyncCtx6 + 4 | 0; //@line 7291
 HEAP32[$4 >> 2] = $2; //@line 7292
 sp = STACKTOP; //@line 7293
 return;
}
function _mbed_die__async_cb_11($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx5 = 0, sp = 0;
 sp = STACKTOP; //@line 7249
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 7251
 _emscripten_asm_const_iii(0, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 7253
 $ReallocAsyncCtx5 = _emscripten_realloc_async_context(8) | 0; //@line 7254
 _wait_ms(400); //@line 7255
 if (___async) {
  HEAP32[$ReallocAsyncCtx5 >> 2] = 27; //@line 7258
  $4 = $ReallocAsyncCtx5 + 4 | 0; //@line 7259
  HEAP32[$4 >> 2] = $2; //@line 7260
  sp = STACKTOP; //@line 7261
  return;
 }
 ___async_unwind = 0; //@line 7264
 HEAP32[$ReallocAsyncCtx5 >> 2] = 27; //@line 7265
 $4 = $ReallocAsyncCtx5 + 4 | 0; //@line 7266
 HEAP32[$4 >> 2] = $2; //@line 7267
 sp = STACKTOP; //@line 7268
 return;
}
function _mbed_die__async_cb_10($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx4 = 0, sp = 0;
 sp = STACKTOP; //@line 7224
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 7226
 _emscripten_asm_const_iii(0, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 7228
 $ReallocAsyncCtx4 = _emscripten_realloc_async_context(8) | 0; //@line 7229
 _wait_ms(400); //@line 7230
 if (___async) {
  HEAP32[$ReallocAsyncCtx4 >> 2] = 28; //@line 7233
  $4 = $ReallocAsyncCtx4 + 4 | 0; //@line 7234
  HEAP32[$4 >> 2] = $2; //@line 7235
  sp = STACKTOP; //@line 7236
  return;
 }
 ___async_unwind = 0; //@line 7239
 HEAP32[$ReallocAsyncCtx4 >> 2] = 28; //@line 7240
 $4 = $ReallocAsyncCtx4 + 4 | 0; //@line 7241
 HEAP32[$4 >> 2] = $2; //@line 7242
 sp = STACKTOP; //@line 7243
 return;
}
function _mbed_die__async_cb_9($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 7199
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 7201
 _emscripten_asm_const_iii(0, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 7203
 $ReallocAsyncCtx3 = _emscripten_realloc_async_context(8) | 0; //@line 7204
 _wait_ms(400); //@line 7205
 if (___async) {
  HEAP32[$ReallocAsyncCtx3 >> 2] = 29; //@line 7208
  $4 = $ReallocAsyncCtx3 + 4 | 0; //@line 7209
  HEAP32[$4 >> 2] = $2; //@line 7210
  sp = STACKTOP; //@line 7211
  return;
 }
 ___async_unwind = 0; //@line 7214
 HEAP32[$ReallocAsyncCtx3 >> 2] = 29; //@line 7215
 $4 = $ReallocAsyncCtx3 + 4 | 0; //@line 7216
 HEAP32[$4 >> 2] = $2; //@line 7217
 sp = STACKTOP; //@line 7218
 return;
}
function _mbed_die__async_cb_8($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 7174
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 7176
 _emscripten_asm_const_iii(0, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 7178
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(8) | 0; //@line 7179
 _wait_ms(400); //@line 7180
 if (___async) {
  HEAP32[$ReallocAsyncCtx2 >> 2] = 30; //@line 7183
  $4 = $ReallocAsyncCtx2 + 4 | 0; //@line 7184
  HEAP32[$4 >> 2] = $2; //@line 7185
  sp = STACKTOP; //@line 7186
  return;
 }
 ___async_unwind = 0; //@line 7189
 HEAP32[$ReallocAsyncCtx2 >> 2] = 30; //@line 7190
 $4 = $ReallocAsyncCtx2 + 4 | 0; //@line 7191
 HEAP32[$4 >> 2] = $2; //@line 7192
 sp = STACKTOP; //@line 7193
 return;
}
function _mbed_die__async_cb_7($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 7149
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 7151
 _emscripten_asm_const_iii(0, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 7153
 $ReallocAsyncCtx = _emscripten_realloc_async_context(8) | 0; //@line 7154
 _wait_ms(400); //@line 7155
 if (___async) {
  HEAP32[$ReallocAsyncCtx >> 2] = 31; //@line 7158
  $4 = $ReallocAsyncCtx + 4 | 0; //@line 7159
  HEAP32[$4 >> 2] = $2; //@line 7160
  sp = STACKTOP; //@line 7161
  return;
 }
 ___async_unwind = 0; //@line 7164
 HEAP32[$ReallocAsyncCtx >> 2] = 31; //@line 7165
 $4 = $ReallocAsyncCtx + 4 | 0; //@line 7166
 HEAP32[$4 >> 2] = $2; //@line 7167
 sp = STACKTOP; //@line 7168
 return;
}
function _sbrk(increment) {
 increment = increment | 0;
 var oldDynamicTop = 0, newDynamicTop = 0;
 oldDynamicTop = HEAP32[DYNAMICTOP_PTR >> 2] | 0; //@line 8679
 newDynamicTop = oldDynamicTop + increment | 0; //@line 8680
 if ((increment | 0) > 0 & (newDynamicTop | 0) < (oldDynamicTop | 0) | (newDynamicTop | 0) < 0) {
  abortOnCannotGrowMemory() | 0; //@line 8684
  ___setErrNo(12); //@line 8685
  return -1;
 }
 HEAP32[DYNAMICTOP_PTR >> 2] = newDynamicTop; //@line 8689
 if ((newDynamicTop | 0) > (getTotalMemory() | 0)) {
  if (!(enlargeMemory() | 0)) {
   HEAP32[DYNAMICTOP_PTR >> 2] = oldDynamicTop; //@line 8693
   ___setErrNo(12); //@line 8694
   return -1;
  }
 }
 return oldDynamicTop | 0; //@line 8698
}
function ___cxa_is_pointer_type($0) {
 $0 = $0 | 0;
 var $2 = 0, $3 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 6128
 do {
  if (!$0) {
   $3 = 0; //@line 6132
  } else {
   $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 6134
   $2 = ___dynamic_cast($0, 56, 112, 0) | 0; //@line 6135
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 91; //@line 6138
    sp = STACKTOP; //@line 6139
    return 0; //@line 6140
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 6142
    $3 = ($2 | 0) != 0 & 1; //@line 6145
    break;
   }
  }
 } while (0);
 return $3 | 0; //@line 6150
}
function _invoke_ticker__async_cb_23($0) {
 $0 = $0 | 0;
 var $5 = 0, $6 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 7663
 $5 = HEAP32[HEAP32[HEAP32[$0 + 4 >> 2] >> 2] >> 2] | 0; //@line 7669
 $6 = HEAP32[$0 + 8 >> 2] | 0; //@line 7670
 $ReallocAsyncCtx = _emscripten_realloc_async_context(4) | 0; //@line 7671
 FUNCTION_TABLE_vi[$5 & 127]($6); //@line 7672
 if (___async) {
  HEAP32[$ReallocAsyncCtx >> 2] = 33; //@line 7675
  sp = STACKTOP; //@line 7676
  return;
 }
 ___async_unwind = 0; //@line 7679
 HEAP32[$ReallocAsyncCtx >> 2] = 33; //@line 7680
 sp = STACKTOP; //@line 7681
 return;
}
function __ZN4mbed6BusOutaSEi($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 476
 $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 477
 __ZN4mbed6BusOut5writeEi($0, $1); //@line 478
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 14; //@line 481
  HEAP32[$AsyncCtx + 4 >> 2] = $0; //@line 483
  sp = STACKTOP; //@line 484
  return 0; //@line 485
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 487
  return $0 | 0; //@line 488
 }
 return 0; //@line 490
}
function __GLOBAL__sub_I_main_cpp() {
 var $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 937
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 938
 __ZN4mbed6BusOutC2E7PinNameS1_S1_S1_S1_S1_S1_S1_S1_S1_S1_S1_S1_S1_S1_S1_(776, 50, 52, 53, 55, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1); //@line 939
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 36; //@line 942
  sp = STACKTOP; //@line 943
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 946
  return;
 }
}
function _emscripten_async_resume() {
 ___async = 0; //@line 8534
 ___async_unwind = 1; //@line 8535
 while (1) {
  if (!___async_cur_frame) return;
  dynCall_vi(HEAP32[___async_cur_frame + 8 >> 2] | 0, ___async_cur_frame + 8 | 0); //@line 8541
  if (___async) return;
  if (!___async_unwind) {
   ___async_unwind = 1; //@line 8545
   continue;
  }
  stackRestore(HEAP32[___async_cur_frame + 4 >> 2] | 0); //@line 8549
  ___async_cur_frame = HEAP32[___async_cur_frame >> 2] | 0; //@line 8551
 }
}
function __ZNK10__cxxabiv117__class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($0, $1, $2, $3, $4, $5) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 $5 = $5 | 0;
 if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, $5) | 0) {
  __ZNK10__cxxabiv117__class_type_info29process_static_type_above_dstEPNS_19__dynamic_cast_infoEPKvS4_i(0, $1, $2, $3, $4); //@line 4730
 }
 return;
}
function __ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv__async_cb($0) {
 $0 = $0 | 0;
 var $$0 = 0, $2 = 0;
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 8434
 if ((HEAP32[$2 + 24 >> 2] | 0) == 1) {
  HEAP32[HEAP32[$0 + 8 >> 2] >> 2] = HEAP32[$2 + 16 >> 2]; //@line 8445
  $$0 = 1; //@line 8446
 } else {
  $$0 = 0; //@line 8448
 }
 HEAP8[___async_retval >> 0] = $$0 & 1; //@line 8452
 return;
}
function _wait($0) {
 $0 = +$0;
 var $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 903
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 907
 _emscripten_sleep((~~($0 * 1.0e6) | 0) / 1e3 | 0 | 0); //@line 908
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 34; //@line 911
  sp = STACKTOP; //@line 912
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 915
  return;
 }
}
function __ZNK10__cxxabiv117__class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, 0) | 0) {
  __ZNK10__cxxabiv117__class_type_info24process_found_base_classEPNS_19__dynamic_cast_infoEPvi(0, $1, $2, $3); //@line 4806
 }
 return;
}
function _wait_ms($0) {
 $0 = $0 | 0;
 var $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 922
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 923
 _emscripten_sleep($0 | 0); //@line 924
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 35; //@line 927
  sp = STACKTOP; //@line 928
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 931
  return;
 }
}
function _main__async_cb_54($0) {
 $0 = $0 | 0;
 var $ReallocAsyncCtx15 = 0, sp = 0;
 sp = STACKTOP; //@line 8133
 $ReallocAsyncCtx15 = _emscripten_realloc_async_context(4) | 0; //@line 8134
 __ZN4mbed6BusOutaSEi(776, 1) | 0; //@line 8135
 if (!___async) {
  ___async_unwind = 0; //@line 8138
 }
 HEAP32[$ReallocAsyncCtx15 >> 2] = 39; //@line 8140
 sp = STACKTOP; //@line 8141
 return;
}
function _main__async_cb_53($0) {
 $0 = $0 | 0;
 var $ReallocAsyncCtx14 = 0, sp = 0;
 sp = STACKTOP; //@line 8119
 $ReallocAsyncCtx14 = _emscripten_realloc_async_context(4) | 0; //@line 8120
 __ZN4mbed6BusOutaSEi(776, 2) | 0; //@line 8121
 if (!___async) {
  ___async_unwind = 0; //@line 8124
 }
 HEAP32[$ReallocAsyncCtx14 >> 2] = 41; //@line 8126
 sp = STACKTOP; //@line 8127
 return;
}
function _main__async_cb_52($0) {
 $0 = $0 | 0;
 var $ReallocAsyncCtx13 = 0, sp = 0;
 sp = STACKTOP; //@line 8105
 $ReallocAsyncCtx13 = _emscripten_realloc_async_context(4) | 0; //@line 8106
 __ZN4mbed6BusOutaSEi(776, 3) | 0; //@line 8107
 if (!___async) {
  ___async_unwind = 0; //@line 8110
 }
 HEAP32[$ReallocAsyncCtx13 >> 2] = 43; //@line 8112
 sp = STACKTOP; //@line 8113
 return;
}
function _main__async_cb_51($0) {
 $0 = $0 | 0;
 var $ReallocAsyncCtx12 = 0, sp = 0;
 sp = STACKTOP; //@line 8091
 $ReallocAsyncCtx12 = _emscripten_realloc_async_context(4) | 0; //@line 8092
 __ZN4mbed6BusOutaSEi(776, 4) | 0; //@line 8093
 if (!___async) {
  ___async_unwind = 0; //@line 8096
 }
 HEAP32[$ReallocAsyncCtx12 >> 2] = 45; //@line 8098
 sp = STACKTOP; //@line 8099
 return;
}
function _main__async_cb_50($0) {
 $0 = $0 | 0;
 var $ReallocAsyncCtx11 = 0, sp = 0;
 sp = STACKTOP; //@line 8077
 $ReallocAsyncCtx11 = _emscripten_realloc_async_context(4) | 0; //@line 8078
 __ZN4mbed6BusOutaSEi(776, 5) | 0; //@line 8079
 if (!___async) {
  ___async_unwind = 0; //@line 8082
 }
 HEAP32[$ReallocAsyncCtx11 >> 2] = 47; //@line 8084
 sp = STACKTOP; //@line 8085
 return;
}
function _main__async_cb_49($0) {
 $0 = $0 | 0;
 var $ReallocAsyncCtx10 = 0, sp = 0;
 sp = STACKTOP; //@line 8063
 $ReallocAsyncCtx10 = _emscripten_realloc_async_context(4) | 0; //@line 8064
 __ZN4mbed6BusOutaSEi(776, 6) | 0; //@line 8065
 if (!___async) {
  ___async_unwind = 0; //@line 8068
 }
 HEAP32[$ReallocAsyncCtx10 >> 2] = 49; //@line 8070
 sp = STACKTOP; //@line 8071
 return;
}
function _main__async_cb_39($0) {
 $0 = $0 | 0;
 var $ReallocAsyncCtx16 = 0, sp = 0;
 sp = STACKTOP; //@line 7923
 $ReallocAsyncCtx16 = _emscripten_realloc_async_context(4) | 0; //@line 7924
 __ZN4mbed6BusOutaSEi(776, 0) | 0; //@line 7925
 if (!___async) {
  ___async_unwind = 0; //@line 7928
 }
 HEAP32[$ReallocAsyncCtx16 >> 2] = 37; //@line 7930
 sp = STACKTOP; //@line 7931
 return;
}
function runPostSets() {}
function _emscripten_alloc_async_context(len, sp) {
 len = len | 0;
 sp = sp | 0;
 var new_frame = 0;
 new_frame = stackAlloc(len + 8 | 0) | 0; //@line 8511
 HEAP32[new_frame + 4 >> 2] = sp; //@line 8513
 HEAP32[new_frame >> 2] = ___async_cur_frame; //@line 8515
 ___async_cur_frame = new_frame; //@line 8516
 return ___async_cur_frame + 8 | 0; //@line 8517
}
function _main__async_cb_45($0) {
 $0 = $0 | 0;
 var $ReallocAsyncCtx6 = 0, sp = 0;
 sp = STACKTOP; //@line 8007
 $ReallocAsyncCtx6 = _emscripten_realloc_async_context(4) | 0; //@line 8008
 __ZN4mbed6BusOutaSEi(776, 10) | 0; //@line 8009
 if (!___async) {
  ___async_unwind = 0; //@line 8012
 }
 HEAP32[$ReallocAsyncCtx6 >> 2] = 57; //@line 8014
 sp = STACKTOP; //@line 8015
 return;
}
function _main__async_cb_44($0) {
 $0 = $0 | 0;
 var $ReallocAsyncCtx5 = 0, sp = 0;
 sp = STACKTOP; //@line 7993
 $ReallocAsyncCtx5 = _emscripten_realloc_async_context(4) | 0; //@line 7994
 __ZN4mbed6BusOutaSEi(776, 11) | 0; //@line 7995
 if (!___async) {
  ___async_unwind = 0; //@line 7998
 }
 HEAP32[$ReallocAsyncCtx5 >> 2] = 59; //@line 8000
 sp = STACKTOP; //@line 8001
 return;
}
function _main__async_cb_43($0) {
 $0 = $0 | 0;
 var $ReallocAsyncCtx4 = 0, sp = 0;
 sp = STACKTOP; //@line 7979
 $ReallocAsyncCtx4 = _emscripten_realloc_async_context(4) | 0; //@line 7980
 __ZN4mbed6BusOutaSEi(776, 12) | 0; //@line 7981
 if (!___async) {
  ___async_unwind = 0; //@line 7984
 }
 HEAP32[$ReallocAsyncCtx4 >> 2] = 61; //@line 7986
 sp = STACKTOP; //@line 7987
 return;
}
function _main__async_cb_42($0) {
 $0 = $0 | 0;
 var $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 7965
 $ReallocAsyncCtx3 = _emscripten_realloc_async_context(4) | 0; //@line 7966
 __ZN4mbed6BusOutaSEi(776, 13) | 0; //@line 7967
 if (!___async) {
  ___async_unwind = 0; //@line 7970
 }
 HEAP32[$ReallocAsyncCtx3 >> 2] = 63; //@line 7972
 sp = STACKTOP; //@line 7973
 return;
}
function _main__async_cb_41($0) {
 $0 = $0 | 0;
 var $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 7951
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(4) | 0; //@line 7952
 __ZN4mbed6BusOutaSEi(776, 14) | 0; //@line 7953
 if (!___async) {
  ___async_unwind = 0; //@line 7956
 }
 HEAP32[$ReallocAsyncCtx2 >> 2] = 65; //@line 7958
 sp = STACKTOP; //@line 7959
 return;
}
function _main__async_cb_48($0) {
 $0 = $0 | 0;
 var $ReallocAsyncCtx9 = 0, sp = 0;
 sp = STACKTOP; //@line 8049
 $ReallocAsyncCtx9 = _emscripten_realloc_async_context(4) | 0; //@line 8050
 __ZN4mbed6BusOutaSEi(776, 7) | 0; //@line 8051
 if (!___async) {
  ___async_unwind = 0; //@line 8054
 }
 HEAP32[$ReallocAsyncCtx9 >> 2] = 51; //@line 8056
 sp = STACKTOP; //@line 8057
 return;
}
function _main__async_cb_47($0) {
 $0 = $0 | 0;
 var $ReallocAsyncCtx8 = 0, sp = 0;
 sp = STACKTOP; //@line 8035
 $ReallocAsyncCtx8 = _emscripten_realloc_async_context(4) | 0; //@line 8036
 __ZN4mbed6BusOutaSEi(776, 8) | 0; //@line 8037
 if (!___async) {
  ___async_unwind = 0; //@line 8040
 }
 HEAP32[$ReallocAsyncCtx8 >> 2] = 53; //@line 8042
 sp = STACKTOP; //@line 8043
 return;
}
function _main__async_cb_46($0) {
 $0 = $0 | 0;
 var $ReallocAsyncCtx7 = 0, sp = 0;
 sp = STACKTOP; //@line 8021
 $ReallocAsyncCtx7 = _emscripten_realloc_async_context(4) | 0; //@line 8022
 __ZN4mbed6BusOutaSEi(776, 9) | 0; //@line 8023
 if (!___async) {
  ___async_unwind = 0; //@line 8026
 }
 HEAP32[$ReallocAsyncCtx7 >> 2] = 55; //@line 8028
 sp = STACKTOP; //@line 8029
 return;
}
function _main__async_cb_40($0) {
 $0 = $0 | 0;
 var $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 7937
 $ReallocAsyncCtx = _emscripten_realloc_async_context(4) | 0; //@line 7938
 __ZN4mbed6BusOutaSEi(776, 15) | 0; //@line 7939
 if (!___async) {
  ___async_unwind = 0; //@line 7942
 }
 HEAP32[$ReallocAsyncCtx >> 2] = 67; //@line 7944
 sp = STACKTOP; //@line 7945
 return;
}
function _main__async_cb_38($0) {
 $0 = $0 | 0;
 var $ReallocAsyncCtx32 = 0, sp = 0;
 sp = STACKTOP; //@line 7909
 $ReallocAsyncCtx32 = _emscripten_realloc_async_context(4) | 0; //@line 7910
 _wait(.25); //@line 7911
 if (!___async) {
  ___async_unwind = 0; //@line 7914
 }
 HEAP32[$ReallocAsyncCtx32 >> 2] = 38; //@line 7916
 sp = STACKTOP; //@line 7917
 return;
}
function _main__async_cb_37($0) {
 $0 = $0 | 0;
 var $ReallocAsyncCtx31 = 0, sp = 0;
 sp = STACKTOP; //@line 7895
 $ReallocAsyncCtx31 = _emscripten_realloc_async_context(4) | 0; //@line 7896
 _wait(.25); //@line 7897
 if (!___async) {
  ___async_unwind = 0; //@line 7900
 }
 HEAP32[$ReallocAsyncCtx31 >> 2] = 40; //@line 7902
 sp = STACKTOP; //@line 7903
 return;
}
function _main__async_cb_36($0) {
 $0 = $0 | 0;
 var $ReallocAsyncCtx30 = 0, sp = 0;
 sp = STACKTOP; //@line 7881
 $ReallocAsyncCtx30 = _emscripten_realloc_async_context(4) | 0; //@line 7882
 _wait(.25); //@line 7883
 if (!___async) {
  ___async_unwind = 0; //@line 7886
 }
 HEAP32[$ReallocAsyncCtx30 >> 2] = 42; //@line 7888
 sp = STACKTOP; //@line 7889
 return;
}
function _main__async_cb_35($0) {
 $0 = $0 | 0;
 var $ReallocAsyncCtx29 = 0, sp = 0;
 sp = STACKTOP; //@line 7867
 $ReallocAsyncCtx29 = _emscripten_realloc_async_context(4) | 0; //@line 7868
 _wait(.25); //@line 7869
 if (!___async) {
  ___async_unwind = 0; //@line 7872
 }
 HEAP32[$ReallocAsyncCtx29 >> 2] = 44; //@line 7874
 sp = STACKTOP; //@line 7875
 return;
}
function _main__async_cb_34($0) {
 $0 = $0 | 0;
 var $ReallocAsyncCtx28 = 0, sp = 0;
 sp = STACKTOP; //@line 7853
 $ReallocAsyncCtx28 = _emscripten_realloc_async_context(4) | 0; //@line 7854
 _wait(.25); //@line 7855
 if (!___async) {
  ___async_unwind = 0; //@line 7858
 }
 HEAP32[$ReallocAsyncCtx28 >> 2] = 46; //@line 7860
 sp = STACKTOP; //@line 7861
 return;
}
function _main__async_cb_33($0) {
 $0 = $0 | 0;
 var $ReallocAsyncCtx27 = 0, sp = 0;
 sp = STACKTOP; //@line 7839
 $ReallocAsyncCtx27 = _emscripten_realloc_async_context(4) | 0; //@line 7840
 _wait(.25); //@line 7841
 if (!___async) {
  ___async_unwind = 0; //@line 7844
 }
 HEAP32[$ReallocAsyncCtx27 >> 2] = 48; //@line 7846
 sp = STACKTOP; //@line 7847
 return;
}
function _main__async_cb_32($0) {
 $0 = $0 | 0;
 var $ReallocAsyncCtx26 = 0, sp = 0;
 sp = STACKTOP; //@line 7825
 $ReallocAsyncCtx26 = _emscripten_realloc_async_context(4) | 0; //@line 7826
 _wait(.25); //@line 7827
 if (!___async) {
  ___async_unwind = 0; //@line 7830
 }
 HEAP32[$ReallocAsyncCtx26 >> 2] = 50; //@line 7832
 sp = STACKTOP; //@line 7833
 return;
}
function _main__async_cb_31($0) {
 $0 = $0 | 0;
 var $ReallocAsyncCtx25 = 0, sp = 0;
 sp = STACKTOP; //@line 7811
 $ReallocAsyncCtx25 = _emscripten_realloc_async_context(4) | 0; //@line 7812
 _wait(.25); //@line 7813
 if (!___async) {
  ___async_unwind = 0; //@line 7816
 }
 HEAP32[$ReallocAsyncCtx25 >> 2] = 52; //@line 7818
 sp = STACKTOP; //@line 7819
 return;
}
function _main__async_cb_30($0) {
 $0 = $0 | 0;
 var $ReallocAsyncCtx24 = 0, sp = 0;
 sp = STACKTOP; //@line 7797
 $ReallocAsyncCtx24 = _emscripten_realloc_async_context(4) | 0; //@line 7798
 _wait(.25); //@line 7799
 if (!___async) {
  ___async_unwind = 0; //@line 7802
 }
 HEAP32[$ReallocAsyncCtx24 >> 2] = 54; //@line 7804
 sp = STACKTOP; //@line 7805
 return;
}
function _main__async_cb_29($0) {
 $0 = $0 | 0;
 var $ReallocAsyncCtx23 = 0, sp = 0;
 sp = STACKTOP; //@line 7783
 $ReallocAsyncCtx23 = _emscripten_realloc_async_context(4) | 0; //@line 7784
 _wait(.25); //@line 7785
 if (!___async) {
  ___async_unwind = 0; //@line 7788
 }
 HEAP32[$ReallocAsyncCtx23 >> 2] = 56; //@line 7790
 sp = STACKTOP; //@line 7791
 return;
}
function _main__async_cb_28($0) {
 $0 = $0 | 0;
 var $ReallocAsyncCtx22 = 0, sp = 0;
 sp = STACKTOP; //@line 7769
 $ReallocAsyncCtx22 = _emscripten_realloc_async_context(4) | 0; //@line 7770
 _wait(.25); //@line 7771
 if (!___async) {
  ___async_unwind = 0; //@line 7774
 }
 HEAP32[$ReallocAsyncCtx22 >> 2] = 58; //@line 7776
 sp = STACKTOP; //@line 7777
 return;
}
function _main__async_cb_27($0) {
 $0 = $0 | 0;
 var $ReallocAsyncCtx21 = 0, sp = 0;
 sp = STACKTOP; //@line 7755
 $ReallocAsyncCtx21 = _emscripten_realloc_async_context(4) | 0; //@line 7756
 _wait(.25); //@line 7757
 if (!___async) {
  ___async_unwind = 0; //@line 7760
 }
 HEAP32[$ReallocAsyncCtx21 >> 2] = 60; //@line 7762
 sp = STACKTOP; //@line 7763
 return;
}
function _main__async_cb_26($0) {
 $0 = $0 | 0;
 var $ReallocAsyncCtx20 = 0, sp = 0;
 sp = STACKTOP; //@line 7741
 $ReallocAsyncCtx20 = _emscripten_realloc_async_context(4) | 0; //@line 7742
 _wait(.25); //@line 7743
 if (!___async) {
  ___async_unwind = 0; //@line 7746
 }
 HEAP32[$ReallocAsyncCtx20 >> 2] = 62; //@line 7748
 sp = STACKTOP; //@line 7749
 return;
}
function _main__async_cb_25($0) {
 $0 = $0 | 0;
 var $ReallocAsyncCtx19 = 0, sp = 0;
 sp = STACKTOP; //@line 7727
 $ReallocAsyncCtx19 = _emscripten_realloc_async_context(4) | 0; //@line 7728
 _wait(.25); //@line 7729
 if (!___async) {
  ___async_unwind = 0; //@line 7732
 }
 HEAP32[$ReallocAsyncCtx19 >> 2] = 64; //@line 7734
 sp = STACKTOP; //@line 7735
 return;
}
function _main__async_cb_24($0) {
 $0 = $0 | 0;
 var $ReallocAsyncCtx18 = 0, sp = 0;
 sp = STACKTOP; //@line 7713
 $ReallocAsyncCtx18 = _emscripten_realloc_async_context(4) | 0; //@line 7714
 _wait(.25); //@line 7715
 if (!___async) {
  ___async_unwind = 0; //@line 7718
 }
 HEAP32[$ReallocAsyncCtx18 >> 2] = 66; //@line 7720
 sp = STACKTOP; //@line 7721
 return;
}
function __ZNK10__cxxabiv117__class_type_info29process_static_type_below_dstEPNS_19__dynamic_cast_infoEPKvi($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $7 = 0;
 if ((HEAP32[$1 + 4 >> 2] | 0) == ($2 | 0)) {
  $7 = $1 + 28 | 0; //@line 4870
  if ((HEAP32[$7 >> 2] | 0) != 1) {
   HEAP32[$7 >> 2] = $3; //@line 4874
  }
 }
 return;
}
function _main__async_cb($0) {
 $0 = $0 | 0;
 var $ReallocAsyncCtx17 = 0, sp = 0;
 sp = STACKTOP; //@line 7699
 $ReallocAsyncCtx17 = _emscripten_realloc_async_context(4) | 0; //@line 7700
 _wait(.25); //@line 7701
 if (!___async) {
  ___async_unwind = 0; //@line 7704
 }
 HEAP32[$ReallocAsyncCtx17 >> 2] = 68; //@line 7706
 sp = STACKTOP; //@line 7707
 return;
}
function ___cxa_can_catch__async_cb($0) {
 $0 = $0 | 0;
 var $AsyncRetVal = 0;
 $AsyncRetVal = HEAP8[___async_retval >> 0] & 1; //@line 6488
 if ($AsyncRetVal) {
  HEAP32[HEAP32[$0 + 8 >> 2] >> 2] = HEAP32[HEAP32[$0 + 4 >> 2] >> 2]; //@line 6492
 }
 HEAP32[___async_retval >> 2] = $AsyncRetVal & 1; //@line 6495
 return;
}
function dynCall_viiiiii(index, a1, a2, a3, a4, a5, a6) {
 index = index | 0;
 a1 = a1 | 0;
 a2 = a2 | 0;
 a3 = a3 | 0;
 a4 = a4 | 0;
 a5 = a5 | 0;
 a6 = a6 | 0;
 FUNCTION_TABLE_viiiiii[index & 3](a1 | 0, a2 | 0, a3 | 0, a4 | 0, a5 | 0, a6 | 0); //@line 8740
}
function _gpio_init_out($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 HEAP32[$0 >> 2] = $1; //@line 833
 if (($1 | 0) == -1) {
  return;
 }
 HEAP32[$0 + 4 >> 2] = $1; //@line 839
 _emscripten_asm_const_iii(1, $0 | 0, $1 | 0) | 0; //@line 840
 return;
}
function dynCall_viiiii(index, a1, a2, a3, a4, a5) {
 index = index | 0;
 a1 = a1 | 0;
 a2 = a2 | 0;
 a3 = a3 | 0;
 a4 = a4 | 0;
 a5 = a5 | 0;
 FUNCTION_TABLE_viiiii[index & 3](a1 | 0, a2 | 0, a3 | 0, a4 | 0, a5 | 0); //@line 8733
}
function dynCall_viiii(index, a1, a2, a3, a4) {
 index = index | 0;
 a1 = a1 | 0;
 a2 = a2 | 0;
 a3 = a3 | 0;
 a4 = a4 | 0;
 FUNCTION_TABLE_viiii[index & 3](a1 | 0, a2 | 0, a3 | 0, a4 | 0); //@line 8726
}
function stackAlloc(size) {
 size = size | 0;
 var ret = 0;
 ret = STACKTOP; //@line 4
 STACKTOP = STACKTOP + size | 0; //@line 5
 STACKTOP = STACKTOP + 15 & -16; //@line 6
 return ret | 0; //@line 8
}
function _emscripten_free_async_context(ctx) {
 ctx = ctx | 0;
 stackRestore(___async_cur_frame | 0); //@line 8523
 ___async_cur_frame = HEAP32[___async_cur_frame >> 2] | 0; //@line 8524
}
function dynCall_iiii(index, a1, a2, a3) {
 index = index | 0;
 a1 = a1 | 0;
 a2 = a2 | 0;
 a3 = a3 | 0;
 return FUNCTION_TABLE_iiii[index & 1](a1 | 0, a2 | 0, a3 | 0) | 0; //@line 8705
}
function ___dynamic_cast__async_cb($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = (HEAP32[HEAP32[$0 + 4 >> 2] >> 2] | 0) == 1 ? HEAP32[$0 + 8 >> 2] | 0 : 0; //@line 6518
 return;
}
function _emscripten_realloc_async_context(len) {
 len = len | 0;
 stackRestore(___async_cur_frame | 0); //@line 8529
 return (stackAlloc(len + 8 | 0) | 0) + 8 | 0; //@line 8530
}
function establishStackSpace(stackBase, stackMax) {
 stackBase = stackBase | 0;
 stackMax = stackMax | 0;
 STACKTOP = stackBase; //@line 20
 STACK_MAX = stackMax; //@line 21
}
function __ZN10__cxxabiv121__vmi_class_type_infoD0Ev($0) {
 $0 = $0 | 0;
 __ZN10__cxxabiv116__shim_type_infoD2Ev($0); //@line 5311
 __ZdlPv($0); //@line 5312
 return;
}
function __ZN10__cxxabiv120__si_class_type_infoD0Ev($0) {
 $0 = $0 | 0;
 __ZN10__cxxabiv116__shim_type_infoD2Ev($0); //@line 5092
 __ZdlPv($0); //@line 5093
 return;
}
function __ZN10__cxxabiv117__class_type_infoD0Ev($0) {
 $0 = $0 | 0;
 __ZN10__cxxabiv116__shim_type_infoD2Ev($0); //@line 4620
 __ZdlPv($0); //@line 4621
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
function ___cxa_is_pointer_type__async_cb($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = (HEAP32[___async_retval >> 2] | 0) != 0 & 1; //@line 7530
 return;
}
function __ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 return ($0 | 0) == ($1 | 0) | 0; //@line 4817
}
function __ZSt15get_new_handlerv() {
 var $0 = 0;
 $0 = HEAP32[338] | 0; //@line 6084
 HEAP32[338] = $0 + 0; //@line 6086
 return $0 | 0; //@line 6088
}
function __ZNK10__cxxabiv122__base_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb($0) {
 $0 = $0 | 0;
 return;
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
 abort(5); //@line 8759
}
function __ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function __ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_56($0) {
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
function __ZN4mbed6BusOutaSEi__async_cb($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = HEAP32[$0 + 4 >> 2]; //@line 7552
 return;
}
function b4(p0, p1, p2, p3, p4) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 p3 = p3 | 0;
 p4 = p4 | 0;
 abort(4); //@line 8756
}
function __ZN4mbed6BusOutD0Ev($0) {
 $0 = $0 | 0;
 __ZN4mbed6BusOutD2Ev($0); //@line 154
 __ZdlPv($0); //@line 155
 return;
}
function dynCall_vi(index, a1) {
 index = index | 0;
 a1 = a1 | 0;
 FUNCTION_TABLE_vi[index & 127](a1 | 0); //@line 8719
}
function b0(p0, p1, p2) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 abort(0); //@line 8744
 return 0; //@line 8744
}
function b3(p0, p1, p2, p3) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 p3 = p3 | 0;
 abort(3); //@line 8753
}
function dynCall_v(index) {
 index = index | 0;
 FUNCTION_TABLE_v[index & 0](); //@line 8712
}
function _mbed_error_printf($0, $varargs) {
 $0 = $0 | 0;
 $varargs = $varargs | 0;
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
function setTempRet0(value) {
 value = value | 0;
 tempRet0 = value; //@line 38
}
function __ZN10__cxxabiv116__shim_type_infoD2Ev($0) {
 $0 = $0 | 0;
 return;
}
function __ZN4mbed6BusOut5writeEi__async_cb_55($0) {
 $0 = $0 | 0;
 return;
}
function stackRestore(top) {
 top = top | 0;
 STACKTOP = top; //@line 15
}
function __GLOBAL__sub_I_main_cpp__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function __ZdlPv($0) {
 $0 = $0 | 0;
 _free($0); //@line 4607
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
function __ZN4mbed6BusOut6unlockEv($0) {
 $0 = $0 | 0;
 return;
}
function _invoke_ticker__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function __ZN4mbed6BusOut4lockEv($0) {
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
 return 1348; //@line 4559
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
 abort(2); //@line 8750
}
function _core_util_critical_section_enter() {
 return;
}
function _wait__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function setAsync() {
 ___async = 1; //@line 25
}
function b1() {
 abort(1); //@line 8747
}

// EMSCRIPTEN_END_FUNCS
var FUNCTION_TABLE_iiii = [b0,__ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv];
var FUNCTION_TABLE_v = [b1];
var FUNCTION_TABLE_vi = [b2,__ZN4mbed6BusOutD2Ev,__ZN4mbed6BusOutD0Ev,__ZN4mbed6BusOut4lockEv,__ZN4mbed6BusOut6unlockEv,__ZN10__cxxabiv116__shim_type_infoD2Ev,__ZN10__cxxabiv117__class_type_infoD0Ev,__ZNK10__cxxabiv116__shim_type_info5noop1Ev,__ZNK10__cxxabiv116__shim_type_info5noop2Ev,__ZN10__cxxabiv120__si_class_type_infoD0Ev,__ZN10__cxxabiv121__vmi_class_type_infoD0Ev,__ZN4mbed6BusOutC2E7PinNameS1_S1_S1_S1_S1_S1_S1_S1_S1_S1_S1_S1_S1_S1_S1___async_cb,__ZN4mbed6BusOut5writeEi__async_cb,__ZN4mbed6BusOut5writeEi__async_cb_55,__ZN4mbed6BusOutaSEi__async_cb,_mbed_assert_internal__async_cb,_mbed_die__async_cb_21,_mbed_die__async_cb_20,_mbed_die__async_cb_19,_mbed_die__async_cb_18,_mbed_die__async_cb_17,_mbed_die__async_cb_16,_mbed_die__async_cb_15,_mbed_die__async_cb_14,_mbed_die__async_cb_13,_mbed_die__async_cb_12,_mbed_die__async_cb_11,_mbed_die__async_cb_10,_mbed_die__async_cb_9
,_mbed_die__async_cb_8,_mbed_die__async_cb_7,_mbed_die__async_cb,_invoke_ticker__async_cb_23,_invoke_ticker__async_cb,_wait__async_cb,_wait_ms__async_cb,__GLOBAL__sub_I_main_cpp__async_cb,_main__async_cb_38,_main__async_cb_54,_main__async_cb_37,_main__async_cb_53,_main__async_cb_36,_main__async_cb_52,_main__async_cb_35,_main__async_cb_51,_main__async_cb_34,_main__async_cb_50,_main__async_cb_33,_main__async_cb_49,_main__async_cb_32,_main__async_cb_48,_main__async_cb_31,_main__async_cb_47,_main__async_cb_30,_main__async_cb_46,_main__async_cb_29,_main__async_cb_45,_main__async_cb_28,_main__async_cb_44
,_main__async_cb_27,_main__async_cb_43,_main__async_cb_26,_main__async_cb_42,_main__async_cb_25,_main__async_cb_41,_main__async_cb_24,_main__async_cb_40,_main__async_cb,_main__async_cb_39,__Znwj__async_cb,__ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv__async_cb_57,__ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv__async_cb,___dynamic_cast__async_cb,___dynamic_cast__async_cb_2,__ZNK10__cxxabiv120__si_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb,__ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb,__ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_56,__ZNK10__cxxabiv120__si_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb,__ZNK10__cxxabiv121__vmi_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb_1,__ZNK10__cxxabiv121__vmi_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb,__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_6,__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_5,__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_4,__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_3,__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb,__ZNK10__cxxabiv121__vmi_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb_22,__ZNK10__cxxabiv121__vmi_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb,__ZNK10__cxxabiv122__base_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb,__ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb
,__ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb,___cxa_can_catch__async_cb,___cxa_is_pointer_type__async_cb,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2
,b2,b2,b2,b2,b2,b2,b2,b2,b2];
var FUNCTION_TABLE_viiii = [b3,__ZNK10__cxxabiv117__class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi,__ZNK10__cxxabiv120__si_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi,__ZNK10__cxxabiv121__vmi_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi];
var FUNCTION_TABLE_viiiii = [b4,__ZNK10__cxxabiv117__class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib,__ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib,__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib];
var FUNCTION_TABLE_viiiiii = [b5,__ZNK10__cxxabiv117__class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib,__ZNK10__cxxabiv120__si_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib,__ZNK10__cxxabiv121__vmi_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib];

  return { __GLOBAL__sub_I_main_cpp: __GLOBAL__sub_I_main_cpp, ___cxa_can_catch: ___cxa_can_catch, ___cxa_is_pointer_type: ___cxa_is_pointer_type, ___errno_location: ___errno_location, _emscripten_alloc_async_context: _emscripten_alloc_async_context, _emscripten_async_resume: _emscripten_async_resume, _emscripten_free_async_context: _emscripten_free_async_context, _emscripten_realloc_async_context: _emscripten_realloc_async_context, _free: _free, _handle_interrupt_in: _handle_interrupt_in, _invoke_ticker: _invoke_ticker, _main: _main, _malloc: _malloc, _memcpy: _memcpy, _memset: _memset, _sbrk: _sbrk, dynCall_iiii: dynCall_iiii, dynCall_v: dynCall_v, dynCall_vi: dynCall_vi, dynCall_viiii: dynCall_viiii, dynCall_viiiii: dynCall_viiiii, dynCall_viiiiii: dynCall_viiiiii, establishStackSpace: establishStackSpace, getTempRet0: getTempRet0, runPostSets: runPostSets, setAsync: setAsync, setTempRet0: setTempRet0, setThrew: setThrew, stackAlloc: stackAlloc, stackRestore: stackRestore, stackSave: stackSave };
})
// EMSCRIPTEN_END_ASM
(Module.asmGlobalArg, Module.asmLibraryArg, buffer);

var __GLOBAL__sub_I_main_cpp = Module["__GLOBAL__sub_I_main_cpp"] = asm["__GLOBAL__sub_I_main_cpp"];
var ___cxa_can_catch = Module["___cxa_can_catch"] = asm["___cxa_can_catch"];
var ___cxa_is_pointer_type = Module["___cxa_is_pointer_type"] = asm["___cxa_is_pointer_type"];
var ___errno_location = Module["___errno_location"] = asm["___errno_location"];
var _emscripten_alloc_async_context = Module["_emscripten_alloc_async_context"] = asm["_emscripten_alloc_async_context"];
var _emscripten_async_resume = Module["_emscripten_async_resume"] = asm["_emscripten_async_resume"];
var _emscripten_free_async_context = Module["_emscripten_free_async_context"] = asm["_emscripten_free_async_context"];
var _emscripten_realloc_async_context = Module["_emscripten_realloc_async_context"] = asm["_emscripten_realloc_async_context"];
var _free = Module["_free"] = asm["_free"];
var _handle_interrupt_in = Module["_handle_interrupt_in"] = asm["_handle_interrupt_in"];
var _invoke_ticker = Module["_invoke_ticker"] = asm["_invoke_ticker"];
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
var dynCall_iiii = Module["dynCall_iiii"] = asm["dynCall_iiii"];
var dynCall_v = Module["dynCall_v"] = asm["dynCall_v"];
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






//# sourceMappingURL=busout.js.map
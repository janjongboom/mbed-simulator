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
 function($0, $1) { MbedJSHal.gpio.init_in($0, $1, 3); },
 function($0, $1) { MbedJSHal.gpio.init_out($0, $1, 0); },
 function($0, $1) { MbedJSHal.gpio.irq_init($0, $1); },
 function($0) { MbedJSHal.gpio.irq_free($0); },
 function($0, $1, $2) { MbedJSHal.gpio.irq_set($0, $1, $2); },
 function($0) { return MbedJSHal.gpio.read($0); }];

function _emscripten_asm_const_iii(code, a0, a1) {
  return ASM_CONSTS[code](a0, a1);
}

function _emscripten_asm_const_ii(code, a0) {
  return ASM_CONSTS[code](a0);
}

function _emscripten_asm_const_iiii(code, a0, a1, a2) {
  return ASM_CONSTS[code](a0, a1, a2);
}




STATIC_BASE = GLOBAL_BASE;

STATICTOP = STATIC_BASE + 6320;
/* global initializers */  __ATINIT__.push({ func: function() { __GLOBAL__sub_I_main_cpp() } });


memoryInitializer = "events.js.mem";





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

Module.asmLibraryArg = { "abort": abort, "assert": assert, "enlargeMemory": enlargeMemory, "getTotalMemory": getTotalMemory, "abortOnCannotGrowMemory": abortOnCannotGrowMemory, "invoke_ii": invoke_ii, "invoke_iiii": invoke_iiii, "invoke_v": invoke_v, "invoke_vi": invoke_vi, "invoke_vii": invoke_vii, "invoke_viiii": invoke_viiii, "invoke_viiiii": invoke_viiiii, "invoke_viiiiii": invoke_viiiiii, "__ZSt18uncaught_exceptionv": __ZSt18uncaught_exceptionv, "___cxa_begin_catch": ___cxa_begin_catch, "___cxa_find_matching_catch": ___cxa_find_matching_catch, "___gxx_personality_v0": ___gxx_personality_v0, "___resumeException": ___resumeException, "___setErrNo": ___setErrNo, "___syscall140": ___syscall140, "___syscall146": ___syscall146, "___syscall54": ___syscall54, "___syscall6": ___syscall6, "_abort": _abort, "_emscripten_asm_const_ii": _emscripten_asm_const_ii, "_emscripten_asm_const_iii": _emscripten_asm_const_iii, "_emscripten_asm_const_iiii": _emscripten_asm_const_iiii, "_emscripten_get_now": _emscripten_get_now, "_emscripten_memcpy_big": _emscripten_memcpy_big, "_emscripten_set_main_loop": _emscripten_set_main_loop, "_emscripten_set_main_loop_timing": _emscripten_set_main_loop_timing, "_emscripten_sleep": _emscripten_sleep, "_gettimeofday": _gettimeofday, "_pthread_cond_init": _pthread_cond_init, "_pthread_cond_signal": _pthread_cond_signal, "_pthread_cond_timedwait": _pthread_cond_timedwait, "_pthread_cond_wait": _pthread_cond_wait, "_pthread_getspecific": _pthread_getspecific, "_pthread_key_create": _pthread_key_create, "_pthread_mutex_init": _pthread_mutex_init, "_pthread_once": _pthread_once, "_pthread_setspecific": _pthread_setspecific, "flush_NO_FILESYSTEM": flush_NO_FILESYSTEM, "DYNAMICTOP_PTR": DYNAMICTOP_PTR, "tempDoublePtr": tempDoublePtr, "ABORT": ABORT, "STACKTOP": STACKTOP, "STACK_MAX": STACK_MAX, "cttz_i8": cttz_i8, "___async": ___async, "___async_unwind": ___async_unwind, "___async_retval": ___async_retval, "___async_cur_frame": ___async_cur_frame };
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
  var ___resumeException=env.___resumeException;
  var ___setErrNo=env.___setErrNo;
  var ___syscall140=env.___syscall140;
  var ___syscall146=env.___syscall146;
  var ___syscall54=env.___syscall54;
  var ___syscall6=env.___syscall6;
  var _abort=env._abort;
  var _emscripten_asm_const_ii=env._emscripten_asm_const_ii;
  var _emscripten_asm_const_iii=env._emscripten_asm_const_iii;
  var _emscripten_asm_const_iiii=env._emscripten_asm_const_iiii;
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
 sp = STACKTOP; //@line 2617
 STACKTOP = STACKTOP + 16 | 0; //@line 2618
 $1 = sp; //@line 2619
 do {
  if ($0 >>> 0 < 245) {
   $6 = $0 >>> 0 < 11 ? 16 : $0 + 11 & -8; //@line 2626
   $7 = $6 >>> 3; //@line 2627
   $8 = HEAP32[1177] | 0; //@line 2628
   $9 = $8 >>> $7; //@line 2629
   if ($9 & 3 | 0) {
    $14 = ($9 & 1 ^ 1) + $7 | 0; //@line 2635
    $16 = 4748 + ($14 << 1 << 2) | 0; //@line 2637
    $17 = $16 + 8 | 0; //@line 2638
    $18 = HEAP32[$17 >> 2] | 0; //@line 2639
    $19 = $18 + 8 | 0; //@line 2640
    $20 = HEAP32[$19 >> 2] | 0; //@line 2641
    do {
     if (($20 | 0) == ($16 | 0)) {
      HEAP32[1177] = $8 & ~(1 << $14); //@line 2648
     } else {
      if ((HEAP32[1181] | 0) >>> 0 > $20 >>> 0) {
       _abort(); //@line 2653
      }
      $27 = $20 + 12 | 0; //@line 2656
      if ((HEAP32[$27 >> 2] | 0) == ($18 | 0)) {
       HEAP32[$27 >> 2] = $16; //@line 2660
       HEAP32[$17 >> 2] = $20; //@line 2661
       break;
      } else {
       _abort(); //@line 2664
      }
     }
    } while (0);
    $30 = $14 << 3; //@line 2669
    HEAP32[$18 + 4 >> 2] = $30 | 3; //@line 2672
    $34 = $18 + $30 + 4 | 0; //@line 2674
    HEAP32[$34 >> 2] = HEAP32[$34 >> 2] | 1; //@line 2677
    $$0 = $19; //@line 2678
    STACKTOP = sp; //@line 2679
    return $$0 | 0; //@line 2679
   }
   $37 = HEAP32[1179] | 0; //@line 2681
   if ($6 >>> 0 > $37 >>> 0) {
    if ($9 | 0) {
     $41 = 2 << $7; //@line 2687
     $44 = $9 << $7 & ($41 | 0 - $41); //@line 2690
     $47 = ($44 & 0 - $44) + -1 | 0; //@line 2693
     $49 = $47 >>> 12 & 16; //@line 2695
     $50 = $47 >>> $49; //@line 2696
     $52 = $50 >>> 5 & 8; //@line 2698
     $54 = $50 >>> $52; //@line 2700
     $56 = $54 >>> 2 & 4; //@line 2702
     $58 = $54 >>> $56; //@line 2704
     $60 = $58 >>> 1 & 2; //@line 2706
     $62 = $58 >>> $60; //@line 2708
     $64 = $62 >>> 1 & 1; //@line 2710
     $67 = ($52 | $49 | $56 | $60 | $64) + ($62 >>> $64) | 0; //@line 2713
     $69 = 4748 + ($67 << 1 << 2) | 0; //@line 2715
     $70 = $69 + 8 | 0; //@line 2716
     $71 = HEAP32[$70 >> 2] | 0; //@line 2717
     $72 = $71 + 8 | 0; //@line 2718
     $73 = HEAP32[$72 >> 2] | 0; //@line 2719
     do {
      if (($73 | 0) == ($69 | 0)) {
       $77 = $8 & ~(1 << $67); //@line 2725
       HEAP32[1177] = $77; //@line 2726
       $98 = $77; //@line 2727
      } else {
       if ((HEAP32[1181] | 0) >>> 0 > $73 >>> 0) {
        _abort(); //@line 2732
       }
       $80 = $73 + 12 | 0; //@line 2735
       if ((HEAP32[$80 >> 2] | 0) == ($71 | 0)) {
        HEAP32[$80 >> 2] = $69; //@line 2739
        HEAP32[$70 >> 2] = $73; //@line 2740
        $98 = $8; //@line 2741
        break;
       } else {
        _abort(); //@line 2744
       }
      }
     } while (0);
     $83 = $67 << 3; //@line 2749
     $84 = $83 - $6 | 0; //@line 2750
     HEAP32[$71 + 4 >> 2] = $6 | 3; //@line 2753
     $87 = $71 + $6 | 0; //@line 2754
     HEAP32[$87 + 4 >> 2] = $84 | 1; //@line 2757
     HEAP32[$71 + $83 >> 2] = $84; //@line 2759
     if ($37 | 0) {
      $92 = HEAP32[1182] | 0; //@line 2762
      $93 = $37 >>> 3; //@line 2763
      $95 = 4748 + ($93 << 1 << 2) | 0; //@line 2765
      $96 = 1 << $93; //@line 2766
      if (!($98 & $96)) {
       HEAP32[1177] = $98 | $96; //@line 2771
       $$0199 = $95; //@line 2773
       $$pre$phiZ2D = $95 + 8 | 0; //@line 2773
      } else {
       $101 = $95 + 8 | 0; //@line 2775
       $102 = HEAP32[$101 >> 2] | 0; //@line 2776
       if ((HEAP32[1181] | 0) >>> 0 > $102 >>> 0) {
        _abort(); //@line 2780
       } else {
        $$0199 = $102; //@line 2783
        $$pre$phiZ2D = $101; //@line 2783
       }
      }
      HEAP32[$$pre$phiZ2D >> 2] = $92; //@line 2786
      HEAP32[$$0199 + 12 >> 2] = $92; //@line 2788
      HEAP32[$92 + 8 >> 2] = $$0199; //@line 2790
      HEAP32[$92 + 12 >> 2] = $95; //@line 2792
     }
     HEAP32[1179] = $84; //@line 2794
     HEAP32[1182] = $87; //@line 2795
     $$0 = $72; //@line 2796
     STACKTOP = sp; //@line 2797
     return $$0 | 0; //@line 2797
    }
    $108 = HEAP32[1178] | 0; //@line 2799
    if (!$108) {
     $$0197 = $6; //@line 2802
    } else {
     $112 = ($108 & 0 - $108) + -1 | 0; //@line 2806
     $114 = $112 >>> 12 & 16; //@line 2808
     $115 = $112 >>> $114; //@line 2809
     $117 = $115 >>> 5 & 8; //@line 2811
     $119 = $115 >>> $117; //@line 2813
     $121 = $119 >>> 2 & 4; //@line 2815
     $123 = $119 >>> $121; //@line 2817
     $125 = $123 >>> 1 & 2; //@line 2819
     $127 = $123 >>> $125; //@line 2821
     $129 = $127 >>> 1 & 1; //@line 2823
     $134 = HEAP32[5012 + (($117 | $114 | $121 | $125 | $129) + ($127 >>> $129) << 2) >> 2] | 0; //@line 2828
     $138 = (HEAP32[$134 + 4 >> 2] & -8) - $6 | 0; //@line 2832
     $143 = HEAP32[$134 + 16 + (((HEAP32[$134 + 16 >> 2] | 0) == 0 & 1) << 2) >> 2] | 0; //@line 2838
     if (!$143) {
      $$0192$lcssa$i = $134; //@line 2841
      $$0193$lcssa$i = $138; //@line 2841
     } else {
      $$01926$i = $134; //@line 2843
      $$01935$i = $138; //@line 2843
      $146 = $143; //@line 2843
      while (1) {
       $149 = (HEAP32[$146 + 4 >> 2] & -8) - $6 | 0; //@line 2848
       $150 = $149 >>> 0 < $$01935$i >>> 0; //@line 2849
       $$$0193$i = $150 ? $149 : $$01935$i; //@line 2850
       $$$0192$i = $150 ? $146 : $$01926$i; //@line 2851
       $146 = HEAP32[$146 + 16 + (((HEAP32[$146 + 16 >> 2] | 0) == 0 & 1) << 2) >> 2] | 0; //@line 2857
       if (!$146) {
        $$0192$lcssa$i = $$$0192$i; //@line 2860
        $$0193$lcssa$i = $$$0193$i; //@line 2860
        break;
       } else {
        $$01926$i = $$$0192$i; //@line 2863
        $$01935$i = $$$0193$i; //@line 2863
       }
      }
     }
     $157 = HEAP32[1181] | 0; //@line 2867
     if ($157 >>> 0 > $$0192$lcssa$i >>> 0) {
      _abort(); //@line 2870
     }
     $159 = $$0192$lcssa$i + $6 | 0; //@line 2873
     if ($159 >>> 0 <= $$0192$lcssa$i >>> 0) {
      _abort(); //@line 2876
     }
     $162 = HEAP32[$$0192$lcssa$i + 24 >> 2] | 0; //@line 2880
     $164 = HEAP32[$$0192$lcssa$i + 12 >> 2] | 0; //@line 2882
     do {
      if (($164 | 0) == ($$0192$lcssa$i | 0)) {
       $175 = $$0192$lcssa$i + 20 | 0; //@line 2886
       $176 = HEAP32[$175 >> 2] | 0; //@line 2887
       if (!$176) {
        $178 = $$0192$lcssa$i + 16 | 0; //@line 2890
        $179 = HEAP32[$178 >> 2] | 0; //@line 2891
        if (!$179) {
         $$3$i = 0; //@line 2894
         break;
        } else {
         $$1196$i = $179; //@line 2897
         $$1198$i = $178; //@line 2897
        }
       } else {
        $$1196$i = $176; //@line 2900
        $$1198$i = $175; //@line 2900
       }
       while (1) {
        $181 = $$1196$i + 20 | 0; //@line 2903
        $182 = HEAP32[$181 >> 2] | 0; //@line 2904
        if ($182 | 0) {
         $$1196$i = $182; //@line 2907
         $$1198$i = $181; //@line 2907
         continue;
        }
        $184 = $$1196$i + 16 | 0; //@line 2910
        $185 = HEAP32[$184 >> 2] | 0; //@line 2911
        if (!$185) {
         break;
        } else {
         $$1196$i = $185; //@line 2916
         $$1198$i = $184; //@line 2916
        }
       }
       if ($157 >>> 0 > $$1198$i >>> 0) {
        _abort(); //@line 2921
       } else {
        HEAP32[$$1198$i >> 2] = 0; //@line 2924
        $$3$i = $$1196$i; //@line 2925
        break;
       }
      } else {
       $167 = HEAP32[$$0192$lcssa$i + 8 >> 2] | 0; //@line 2930
       if ($157 >>> 0 > $167 >>> 0) {
        _abort(); //@line 2933
       }
       $169 = $167 + 12 | 0; //@line 2936
       if ((HEAP32[$169 >> 2] | 0) != ($$0192$lcssa$i | 0)) {
        _abort(); //@line 2940
       }
       $172 = $164 + 8 | 0; //@line 2943
       if ((HEAP32[$172 >> 2] | 0) == ($$0192$lcssa$i | 0)) {
        HEAP32[$169 >> 2] = $164; //@line 2947
        HEAP32[$172 >> 2] = $167; //@line 2948
        $$3$i = $164; //@line 2949
        break;
       } else {
        _abort(); //@line 2952
       }
      }
     } while (0);
     L73 : do {
      if ($162 | 0) {
       $190 = HEAP32[$$0192$lcssa$i + 28 >> 2] | 0; //@line 2961
       $191 = 5012 + ($190 << 2) | 0; //@line 2962
       do {
        if (($$0192$lcssa$i | 0) == (HEAP32[$191 >> 2] | 0)) {
         HEAP32[$191 >> 2] = $$3$i; //@line 2967
         if (!$$3$i) {
          HEAP32[1178] = $108 & ~(1 << $190); //@line 2973
          break L73;
         }
        } else {
         if ((HEAP32[1181] | 0) >>> 0 > $162 >>> 0) {
          _abort(); //@line 2980
         } else {
          HEAP32[$162 + 16 + (((HEAP32[$162 + 16 >> 2] | 0) != ($$0192$lcssa$i | 0) & 1) << 2) >> 2] = $$3$i; //@line 2988
          if (!$$3$i) {
           break L73;
          } else {
           break;
          }
         }
        }
       } while (0);
       $204 = HEAP32[1181] | 0; //@line 2998
       if ($204 >>> 0 > $$3$i >>> 0) {
        _abort(); //@line 3001
       }
       HEAP32[$$3$i + 24 >> 2] = $162; //@line 3005
       $208 = HEAP32[$$0192$lcssa$i + 16 >> 2] | 0; //@line 3007
       do {
        if ($208 | 0) {
         if ($204 >>> 0 > $208 >>> 0) {
          _abort(); //@line 3013
         } else {
          HEAP32[$$3$i + 16 >> 2] = $208; //@line 3017
          HEAP32[$208 + 24 >> 2] = $$3$i; //@line 3019
          break;
         }
        }
       } while (0);
       $214 = HEAP32[$$0192$lcssa$i + 20 >> 2] | 0; //@line 3025
       if ($214 | 0) {
        if ((HEAP32[1181] | 0) >>> 0 > $214 >>> 0) {
         _abort(); //@line 3031
        } else {
         HEAP32[$$3$i + 20 >> 2] = $214; //@line 3035
         HEAP32[$214 + 24 >> 2] = $$3$i; //@line 3037
         break;
        }
       }
      }
     } while (0);
     if ($$0193$lcssa$i >>> 0 < 16) {
      $221 = $$0193$lcssa$i + $6 | 0; //@line 3045
      HEAP32[$$0192$lcssa$i + 4 >> 2] = $221 | 3; //@line 3048
      $225 = $$0192$lcssa$i + $221 + 4 | 0; //@line 3050
      HEAP32[$225 >> 2] = HEAP32[$225 >> 2] | 1; //@line 3053
     } else {
      HEAP32[$$0192$lcssa$i + 4 >> 2] = $6 | 3; //@line 3057
      HEAP32[$159 + 4 >> 2] = $$0193$lcssa$i | 1; //@line 3060
      HEAP32[$159 + $$0193$lcssa$i >> 2] = $$0193$lcssa$i; //@line 3062
      if ($37 | 0) {
       $234 = HEAP32[1182] | 0; //@line 3065
       $235 = $37 >>> 3; //@line 3066
       $237 = 4748 + ($235 << 1 << 2) | 0; //@line 3068
       $238 = 1 << $235; //@line 3069
       if (!($8 & $238)) {
        HEAP32[1177] = $8 | $238; //@line 3074
        $$0189$i = $237; //@line 3076
        $$pre$phi$iZ2D = $237 + 8 | 0; //@line 3076
       } else {
        $242 = $237 + 8 | 0; //@line 3078
        $243 = HEAP32[$242 >> 2] | 0; //@line 3079
        if ((HEAP32[1181] | 0) >>> 0 > $243 >>> 0) {
         _abort(); //@line 3083
        } else {
         $$0189$i = $243; //@line 3086
         $$pre$phi$iZ2D = $242; //@line 3086
        }
       }
       HEAP32[$$pre$phi$iZ2D >> 2] = $234; //@line 3089
       HEAP32[$$0189$i + 12 >> 2] = $234; //@line 3091
       HEAP32[$234 + 8 >> 2] = $$0189$i; //@line 3093
       HEAP32[$234 + 12 >> 2] = $237; //@line 3095
      }
      HEAP32[1179] = $$0193$lcssa$i; //@line 3097
      HEAP32[1182] = $159; //@line 3098
     }
     $$0 = $$0192$lcssa$i + 8 | 0; //@line 3101
     STACKTOP = sp; //@line 3102
     return $$0 | 0; //@line 3102
    }
   } else {
    $$0197 = $6; //@line 3105
   }
  } else {
   if ($0 >>> 0 > 4294967231) {
    $$0197 = -1; //@line 3110
   } else {
    $251 = $0 + 11 | 0; //@line 3112
    $252 = $251 & -8; //@line 3113
    $253 = HEAP32[1178] | 0; //@line 3114
    if (!$253) {
     $$0197 = $252; //@line 3117
    } else {
     $255 = 0 - $252 | 0; //@line 3119
     $256 = $251 >>> 8; //@line 3120
     if (!$256) {
      $$0358$i = 0; //@line 3123
     } else {
      if ($252 >>> 0 > 16777215) {
       $$0358$i = 31; //@line 3127
      } else {
       $261 = ($256 + 1048320 | 0) >>> 16 & 8; //@line 3131
       $262 = $256 << $261; //@line 3132
       $265 = ($262 + 520192 | 0) >>> 16 & 4; //@line 3135
       $267 = $262 << $265; //@line 3137
       $270 = ($267 + 245760 | 0) >>> 16 & 2; //@line 3140
       $275 = 14 - ($265 | $261 | $270) + ($267 << $270 >>> 15) | 0; //@line 3145
       $$0358$i = $252 >>> ($275 + 7 | 0) & 1 | $275 << 1; //@line 3151
      }
     }
     $282 = HEAP32[5012 + ($$0358$i << 2) >> 2] | 0; //@line 3155
     L117 : do {
      if (!$282) {
       $$2355$i = 0; //@line 3159
       $$3$i203 = 0; //@line 3159
       $$3350$i = $255; //@line 3159
       label = 81; //@line 3160
      } else {
       $$0342$i = 0; //@line 3167
       $$0347$i = $255; //@line 3167
       $$0353$i = $282; //@line 3167
       $$0359$i = $252 << (($$0358$i | 0) == 31 ? 0 : 25 - ($$0358$i >>> 1) | 0); //@line 3167
       $$0362$i = 0; //@line 3167
       while (1) {
        $292 = (HEAP32[$$0353$i + 4 >> 2] & -8) - $252 | 0; //@line 3172
        if ($292 >>> 0 < $$0347$i >>> 0) {
         if (!$292) {
          $$414$i = $$0353$i; //@line 3177
          $$435113$i = 0; //@line 3177
          $$435712$i = $$0353$i; //@line 3177
          label = 85; //@line 3178
          break L117;
         } else {
          $$1343$i = $$0353$i; //@line 3181
          $$1348$i = $292; //@line 3181
         }
        } else {
         $$1343$i = $$0342$i; //@line 3184
         $$1348$i = $$0347$i; //@line 3184
        }
        $296 = HEAP32[$$0353$i + 20 >> 2] | 0; //@line 3187
        $$0353$i = HEAP32[$$0353$i + 16 + ($$0359$i >>> 31 << 2) >> 2] | 0; //@line 3190
        $$1363$i = ($296 | 0) == 0 | ($296 | 0) == ($$0353$i | 0) ? $$0362$i : $296; //@line 3194
        $302 = ($$0353$i | 0) == 0; //@line 3195
        if ($302) {
         $$2355$i = $$1363$i; //@line 3200
         $$3$i203 = $$1343$i; //@line 3200
         $$3350$i = $$1348$i; //@line 3200
         label = 81; //@line 3201
         break;
        } else {
         $$0342$i = $$1343$i; //@line 3204
         $$0347$i = $$1348$i; //@line 3204
         $$0359$i = $$0359$i << (($302 ^ 1) & 1); //@line 3204
         $$0362$i = $$1363$i; //@line 3204
        }
       }
      }
     } while (0);
     if ((label | 0) == 81) {
      if (($$2355$i | 0) == 0 & ($$3$i203 | 0) == 0) {
       $306 = 2 << $$0358$i; //@line 3214
       $309 = $253 & ($306 | 0 - $306); //@line 3217
       if (!$309) {
        $$0197 = $252; //@line 3220
        break;
       }
       $313 = ($309 & 0 - $309) + -1 | 0; //@line 3225
       $315 = $313 >>> 12 & 16; //@line 3227
       $316 = $313 >>> $315; //@line 3228
       $318 = $316 >>> 5 & 8; //@line 3230
       $320 = $316 >>> $318; //@line 3232
       $322 = $320 >>> 2 & 4; //@line 3234
       $324 = $320 >>> $322; //@line 3236
       $326 = $324 >>> 1 & 2; //@line 3238
       $328 = $324 >>> $326; //@line 3240
       $330 = $328 >>> 1 & 1; //@line 3242
       $$4$ph$i = 0; //@line 3248
       $$4357$ph$i = HEAP32[5012 + (($318 | $315 | $322 | $326 | $330) + ($328 >>> $330) << 2) >> 2] | 0; //@line 3248
      } else {
       $$4$ph$i = $$3$i203; //@line 3250
       $$4357$ph$i = $$2355$i; //@line 3250
      }
      if (!$$4357$ph$i) {
       $$4$lcssa$i = $$4$ph$i; //@line 3254
       $$4351$lcssa$i = $$3350$i; //@line 3254
      } else {
       $$414$i = $$4$ph$i; //@line 3256
       $$435113$i = $$3350$i; //@line 3256
       $$435712$i = $$4357$ph$i; //@line 3256
       label = 85; //@line 3257
      }
     }
     if ((label | 0) == 85) {
      while (1) {
       label = 0; //@line 3262
       $340 = (HEAP32[$$435712$i + 4 >> 2] & -8) - $252 | 0; //@line 3266
       $341 = $340 >>> 0 < $$435113$i >>> 0; //@line 3267
       $$$4351$i = $341 ? $340 : $$435113$i; //@line 3268
       $$4357$$4$i = $341 ? $$435712$i : $$414$i; //@line 3269
       $$435712$i = HEAP32[$$435712$i + 16 + (((HEAP32[$$435712$i + 16 >> 2] | 0) == 0 & 1) << 2) >> 2] | 0; //@line 3275
       if (!$$435712$i) {
        $$4$lcssa$i = $$4357$$4$i; //@line 3278
        $$4351$lcssa$i = $$$4351$i; //@line 3278
        break;
       } else {
        $$414$i = $$4357$$4$i; //@line 3281
        $$435113$i = $$$4351$i; //@line 3281
        label = 85; //@line 3282
       }
      }
     }
     if (!$$4$lcssa$i) {
      $$0197 = $252; //@line 3288
     } else {
      if ($$4351$lcssa$i >>> 0 < ((HEAP32[1179] | 0) - $252 | 0) >>> 0) {
       $352 = HEAP32[1181] | 0; //@line 3294
       if ($352 >>> 0 > $$4$lcssa$i >>> 0) {
        _abort(); //@line 3297
       }
       $354 = $$4$lcssa$i + $252 | 0; //@line 3300
       if ($354 >>> 0 <= $$4$lcssa$i >>> 0) {
        _abort(); //@line 3303
       }
       $357 = HEAP32[$$4$lcssa$i + 24 >> 2] | 0; //@line 3307
       $359 = HEAP32[$$4$lcssa$i + 12 >> 2] | 0; //@line 3309
       do {
        if (($359 | 0) == ($$4$lcssa$i | 0)) {
         $370 = $$4$lcssa$i + 20 | 0; //@line 3313
         $371 = HEAP32[$370 >> 2] | 0; //@line 3314
         if (!$371) {
          $373 = $$4$lcssa$i + 16 | 0; //@line 3317
          $374 = HEAP32[$373 >> 2] | 0; //@line 3318
          if (!$374) {
           $$3372$i = 0; //@line 3321
           break;
          } else {
           $$1370$i = $374; //@line 3324
           $$1374$i = $373; //@line 3324
          }
         } else {
          $$1370$i = $371; //@line 3327
          $$1374$i = $370; //@line 3327
         }
         while (1) {
          $376 = $$1370$i + 20 | 0; //@line 3330
          $377 = HEAP32[$376 >> 2] | 0; //@line 3331
          if ($377 | 0) {
           $$1370$i = $377; //@line 3334
           $$1374$i = $376; //@line 3334
           continue;
          }
          $379 = $$1370$i + 16 | 0; //@line 3337
          $380 = HEAP32[$379 >> 2] | 0; //@line 3338
          if (!$380) {
           break;
          } else {
           $$1370$i = $380; //@line 3343
           $$1374$i = $379; //@line 3343
          }
         }
         if ($352 >>> 0 > $$1374$i >>> 0) {
          _abort(); //@line 3348
         } else {
          HEAP32[$$1374$i >> 2] = 0; //@line 3351
          $$3372$i = $$1370$i; //@line 3352
          break;
         }
        } else {
         $362 = HEAP32[$$4$lcssa$i + 8 >> 2] | 0; //@line 3357
         if ($352 >>> 0 > $362 >>> 0) {
          _abort(); //@line 3360
         }
         $364 = $362 + 12 | 0; //@line 3363
         if ((HEAP32[$364 >> 2] | 0) != ($$4$lcssa$i | 0)) {
          _abort(); //@line 3367
         }
         $367 = $359 + 8 | 0; //@line 3370
         if ((HEAP32[$367 >> 2] | 0) == ($$4$lcssa$i | 0)) {
          HEAP32[$364 >> 2] = $359; //@line 3374
          HEAP32[$367 >> 2] = $362; //@line 3375
          $$3372$i = $359; //@line 3376
          break;
         } else {
          _abort(); //@line 3379
         }
        }
       } while (0);
       L164 : do {
        if (!$357) {
         $475 = $253; //@line 3387
        } else {
         $385 = HEAP32[$$4$lcssa$i + 28 >> 2] | 0; //@line 3390
         $386 = 5012 + ($385 << 2) | 0; //@line 3391
         do {
          if (($$4$lcssa$i | 0) == (HEAP32[$386 >> 2] | 0)) {
           HEAP32[$386 >> 2] = $$3372$i; //@line 3396
           if (!$$3372$i) {
            $391 = $253 & ~(1 << $385); //@line 3401
            HEAP32[1178] = $391; //@line 3402
            $475 = $391; //@line 3403
            break L164;
           }
          } else {
           if ((HEAP32[1181] | 0) >>> 0 > $357 >>> 0) {
            _abort(); //@line 3410
           } else {
            HEAP32[$357 + 16 + (((HEAP32[$357 + 16 >> 2] | 0) != ($$4$lcssa$i | 0) & 1) << 2) >> 2] = $$3372$i; //@line 3418
            if (!$$3372$i) {
             $475 = $253; //@line 3421
             break L164;
            } else {
             break;
            }
           }
          }
         } while (0);
         $399 = HEAP32[1181] | 0; //@line 3429
         if ($399 >>> 0 > $$3372$i >>> 0) {
          _abort(); //@line 3432
         }
         HEAP32[$$3372$i + 24 >> 2] = $357; //@line 3436
         $403 = HEAP32[$$4$lcssa$i + 16 >> 2] | 0; //@line 3438
         do {
          if ($403 | 0) {
           if ($399 >>> 0 > $403 >>> 0) {
            _abort(); //@line 3444
           } else {
            HEAP32[$$3372$i + 16 >> 2] = $403; //@line 3448
            HEAP32[$403 + 24 >> 2] = $$3372$i; //@line 3450
            break;
           }
          }
         } while (0);
         $409 = HEAP32[$$4$lcssa$i + 20 >> 2] | 0; //@line 3456
         if (!$409) {
          $475 = $253; //@line 3459
         } else {
          if ((HEAP32[1181] | 0) >>> 0 > $409 >>> 0) {
           _abort(); //@line 3464
          } else {
           HEAP32[$$3372$i + 20 >> 2] = $409; //@line 3468
           HEAP32[$409 + 24 >> 2] = $$3372$i; //@line 3470
           $475 = $253; //@line 3471
           break;
          }
         }
        }
       } while (0);
       do {
        if ($$4351$lcssa$i >>> 0 < 16) {
         $416 = $$4351$lcssa$i + $252 | 0; //@line 3480
         HEAP32[$$4$lcssa$i + 4 >> 2] = $416 | 3; //@line 3483
         $420 = $$4$lcssa$i + $416 + 4 | 0; //@line 3485
         HEAP32[$420 >> 2] = HEAP32[$420 >> 2] | 1; //@line 3488
        } else {
         HEAP32[$$4$lcssa$i + 4 >> 2] = $252 | 3; //@line 3492
         HEAP32[$354 + 4 >> 2] = $$4351$lcssa$i | 1; //@line 3495
         HEAP32[$354 + $$4351$lcssa$i >> 2] = $$4351$lcssa$i; //@line 3497
         $428 = $$4351$lcssa$i >>> 3; //@line 3498
         if ($$4351$lcssa$i >>> 0 < 256) {
          $431 = 4748 + ($428 << 1 << 2) | 0; //@line 3502
          $432 = HEAP32[1177] | 0; //@line 3503
          $433 = 1 << $428; //@line 3504
          if (!($432 & $433)) {
           HEAP32[1177] = $432 | $433; //@line 3509
           $$0368$i = $431; //@line 3511
           $$pre$phi$i211Z2D = $431 + 8 | 0; //@line 3511
          } else {
           $437 = $431 + 8 | 0; //@line 3513
           $438 = HEAP32[$437 >> 2] | 0; //@line 3514
           if ((HEAP32[1181] | 0) >>> 0 > $438 >>> 0) {
            _abort(); //@line 3518
           } else {
            $$0368$i = $438; //@line 3521
            $$pre$phi$i211Z2D = $437; //@line 3521
           }
          }
          HEAP32[$$pre$phi$i211Z2D >> 2] = $354; //@line 3524
          HEAP32[$$0368$i + 12 >> 2] = $354; //@line 3526
          HEAP32[$354 + 8 >> 2] = $$0368$i; //@line 3528
          HEAP32[$354 + 12 >> 2] = $431; //@line 3530
          break;
         }
         $444 = $$4351$lcssa$i >>> 8; //@line 3533
         if (!$444) {
          $$0361$i = 0; //@line 3536
         } else {
          if ($$4351$lcssa$i >>> 0 > 16777215) {
           $$0361$i = 31; //@line 3540
          } else {
           $449 = ($444 + 1048320 | 0) >>> 16 & 8; //@line 3544
           $450 = $444 << $449; //@line 3545
           $453 = ($450 + 520192 | 0) >>> 16 & 4; //@line 3548
           $455 = $450 << $453; //@line 3550
           $458 = ($455 + 245760 | 0) >>> 16 & 2; //@line 3553
           $463 = 14 - ($453 | $449 | $458) + ($455 << $458 >>> 15) | 0; //@line 3558
           $$0361$i = $$4351$lcssa$i >>> ($463 + 7 | 0) & 1 | $463 << 1; //@line 3564
          }
         }
         $469 = 5012 + ($$0361$i << 2) | 0; //@line 3567
         HEAP32[$354 + 28 >> 2] = $$0361$i; //@line 3569
         $471 = $354 + 16 | 0; //@line 3570
         HEAP32[$471 + 4 >> 2] = 0; //@line 3572
         HEAP32[$471 >> 2] = 0; //@line 3573
         $473 = 1 << $$0361$i; //@line 3574
         if (!($475 & $473)) {
          HEAP32[1178] = $475 | $473; //@line 3579
          HEAP32[$469 >> 2] = $354; //@line 3580
          HEAP32[$354 + 24 >> 2] = $469; //@line 3582
          HEAP32[$354 + 12 >> 2] = $354; //@line 3584
          HEAP32[$354 + 8 >> 2] = $354; //@line 3586
          break;
         }
         $$0344$i = $$4351$lcssa$i << (($$0361$i | 0) == 31 ? 0 : 25 - ($$0361$i >>> 1) | 0); //@line 3595
         $$0345$i = HEAP32[$469 >> 2] | 0; //@line 3595
         while (1) {
          if ((HEAP32[$$0345$i + 4 >> 2] & -8 | 0) == ($$4351$lcssa$i | 0)) {
           label = 139; //@line 3602
           break;
          }
          $492 = $$0345$i + 16 + ($$0344$i >>> 31 << 2) | 0; //@line 3606
          $494 = HEAP32[$492 >> 2] | 0; //@line 3608
          if (!$494) {
           label = 136; //@line 3611
           break;
          } else {
           $$0344$i = $$0344$i << 1; //@line 3614
           $$0345$i = $494; //@line 3614
          }
         }
         if ((label | 0) == 136) {
          if ((HEAP32[1181] | 0) >>> 0 > $492 >>> 0) {
           _abort(); //@line 3621
          } else {
           HEAP32[$492 >> 2] = $354; //@line 3624
           HEAP32[$354 + 24 >> 2] = $$0345$i; //@line 3626
           HEAP32[$354 + 12 >> 2] = $354; //@line 3628
           HEAP32[$354 + 8 >> 2] = $354; //@line 3630
           break;
          }
         } else if ((label | 0) == 139) {
          $501 = $$0345$i + 8 | 0; //@line 3635
          $502 = HEAP32[$501 >> 2] | 0; //@line 3636
          $503 = HEAP32[1181] | 0; //@line 3637
          if ($503 >>> 0 <= $502 >>> 0 & $503 >>> 0 <= $$0345$i >>> 0) {
           HEAP32[$502 + 12 >> 2] = $354; //@line 3643
           HEAP32[$501 >> 2] = $354; //@line 3644
           HEAP32[$354 + 8 >> 2] = $502; //@line 3646
           HEAP32[$354 + 12 >> 2] = $$0345$i; //@line 3648
           HEAP32[$354 + 24 >> 2] = 0; //@line 3650
           break;
          } else {
           _abort(); //@line 3653
          }
         }
        }
       } while (0);
       $$0 = $$4$lcssa$i + 8 | 0; //@line 3660
       STACKTOP = sp; //@line 3661
       return $$0 | 0; //@line 3661
      } else {
       $$0197 = $252; //@line 3663
      }
     }
    }
   }
  }
 } while (0);
 $512 = HEAP32[1179] | 0; //@line 3670
 if ($512 >>> 0 >= $$0197 >>> 0) {
  $514 = $512 - $$0197 | 0; //@line 3673
  $515 = HEAP32[1182] | 0; //@line 3674
  if ($514 >>> 0 > 15) {
   $517 = $515 + $$0197 | 0; //@line 3677
   HEAP32[1182] = $517; //@line 3678
   HEAP32[1179] = $514; //@line 3679
   HEAP32[$517 + 4 >> 2] = $514 | 1; //@line 3682
   HEAP32[$515 + $512 >> 2] = $514; //@line 3684
   HEAP32[$515 + 4 >> 2] = $$0197 | 3; //@line 3687
  } else {
   HEAP32[1179] = 0; //@line 3689
   HEAP32[1182] = 0; //@line 3690
   HEAP32[$515 + 4 >> 2] = $512 | 3; //@line 3693
   $526 = $515 + $512 + 4 | 0; //@line 3695
   HEAP32[$526 >> 2] = HEAP32[$526 >> 2] | 1; //@line 3698
  }
  $$0 = $515 + 8 | 0; //@line 3701
  STACKTOP = sp; //@line 3702
  return $$0 | 0; //@line 3702
 }
 $530 = HEAP32[1180] | 0; //@line 3704
 if ($530 >>> 0 > $$0197 >>> 0) {
  $532 = $530 - $$0197 | 0; //@line 3707
  HEAP32[1180] = $532; //@line 3708
  $533 = HEAP32[1183] | 0; //@line 3709
  $534 = $533 + $$0197 | 0; //@line 3710
  HEAP32[1183] = $534; //@line 3711
  HEAP32[$534 + 4 >> 2] = $532 | 1; //@line 3714
  HEAP32[$533 + 4 >> 2] = $$0197 | 3; //@line 3717
  $$0 = $533 + 8 | 0; //@line 3719
  STACKTOP = sp; //@line 3720
  return $$0 | 0; //@line 3720
 }
 if (!(HEAP32[1295] | 0)) {
  HEAP32[1297] = 4096; //@line 3725
  HEAP32[1296] = 4096; //@line 3726
  HEAP32[1298] = -1; //@line 3727
  HEAP32[1299] = -1; //@line 3728
  HEAP32[1300] = 0; //@line 3729
  HEAP32[1288] = 0; //@line 3730
  HEAP32[1295] = $1 & -16 ^ 1431655768; //@line 3734
  $548 = 4096; //@line 3735
 } else {
  $548 = HEAP32[1297] | 0; //@line 3738
 }
 $545 = $$0197 + 48 | 0; //@line 3740
 $546 = $$0197 + 47 | 0; //@line 3741
 $547 = $548 + $546 | 0; //@line 3742
 $549 = 0 - $548 | 0; //@line 3743
 $550 = $547 & $549; //@line 3744
 if ($550 >>> 0 <= $$0197 >>> 0) {
  $$0 = 0; //@line 3747
  STACKTOP = sp; //@line 3748
  return $$0 | 0; //@line 3748
 }
 $552 = HEAP32[1287] | 0; //@line 3750
 if ($552 | 0) {
  $554 = HEAP32[1285] | 0; //@line 3753
  $555 = $554 + $550 | 0; //@line 3754
  if ($555 >>> 0 <= $554 >>> 0 | $555 >>> 0 > $552 >>> 0) {
   $$0 = 0; //@line 3759
   STACKTOP = sp; //@line 3760
   return $$0 | 0; //@line 3760
  }
 }
 L244 : do {
  if (!(HEAP32[1288] & 4)) {
   $561 = HEAP32[1183] | 0; //@line 3768
   L246 : do {
    if (!$561) {
     label = 163; //@line 3772
    } else {
     $$0$i$i = 5156; //@line 3774
     while (1) {
      $563 = HEAP32[$$0$i$i >> 2] | 0; //@line 3776
      if ($563 >>> 0 <= $561 >>> 0) {
       $565 = $$0$i$i + 4 | 0; //@line 3779
       if (($563 + (HEAP32[$565 >> 2] | 0) | 0) >>> 0 > $561 >>> 0) {
        break;
       }
      }
      $570 = HEAP32[$$0$i$i + 8 >> 2] | 0; //@line 3788
      if (!$570) {
       label = 163; //@line 3791
       break L246;
      } else {
       $$0$i$i = $570; //@line 3794
      }
     }
     $595 = $547 - $530 & $549; //@line 3798
     if ($595 >>> 0 < 2147483647) {
      $597 = _sbrk($595 | 0) | 0; //@line 3801
      if (($597 | 0) == ((HEAP32[$$0$i$i >> 2] | 0) + (HEAP32[$565 >> 2] | 0) | 0)) {
       if (($597 | 0) == (-1 | 0)) {
        $$2234243136$i = $595; //@line 3809
       } else {
        $$723947$i = $595; //@line 3811
        $$748$i = $597; //@line 3811
        label = 180; //@line 3812
        break L244;
       }
      } else {
       $$2247$ph$i = $597; //@line 3816
       $$2253$ph$i = $595; //@line 3816
       label = 171; //@line 3817
      }
     } else {
      $$2234243136$i = 0; //@line 3820
     }
    }
   } while (0);
   do {
    if ((label | 0) == 163) {
     $572 = _sbrk(0) | 0; //@line 3826
     if (($572 | 0) == (-1 | 0)) {
      $$2234243136$i = 0; //@line 3829
     } else {
      $574 = $572; //@line 3831
      $575 = HEAP32[1296] | 0; //@line 3832
      $576 = $575 + -1 | 0; //@line 3833
      $$$i = (($576 & $574 | 0) == 0 ? 0 : ($576 + $574 & 0 - $575) - $574 | 0) + $550 | 0; //@line 3841
      $584 = HEAP32[1285] | 0; //@line 3842
      $585 = $$$i + $584 | 0; //@line 3843
      if ($$$i >>> 0 > $$0197 >>> 0 & $$$i >>> 0 < 2147483647) {
       $588 = HEAP32[1287] | 0; //@line 3848
       if ($588 | 0) {
        if ($585 >>> 0 <= $584 >>> 0 | $585 >>> 0 > $588 >>> 0) {
         $$2234243136$i = 0; //@line 3855
         break;
        }
       }
       $592 = _sbrk($$$i | 0) | 0; //@line 3859
       if (($592 | 0) == ($572 | 0)) {
        $$723947$i = $$$i; //@line 3862
        $$748$i = $572; //@line 3862
        label = 180; //@line 3863
        break L244;
       } else {
        $$2247$ph$i = $592; //@line 3866
        $$2253$ph$i = $$$i; //@line 3866
        label = 171; //@line 3867
       }
      } else {
       $$2234243136$i = 0; //@line 3870
      }
     }
    }
   } while (0);
   do {
    if ((label | 0) == 171) {
     $603 = 0 - $$2253$ph$i | 0; //@line 3877
     if (!($545 >>> 0 > $$2253$ph$i >>> 0 & ($$2253$ph$i >>> 0 < 2147483647 & ($$2247$ph$i | 0) != (-1 | 0)))) {
      if (($$2247$ph$i | 0) == (-1 | 0)) {
       $$2234243136$i = 0; //@line 3886
       break;
      } else {
       $$723947$i = $$2253$ph$i; //@line 3889
       $$748$i = $$2247$ph$i; //@line 3889
       label = 180; //@line 3890
       break L244;
      }
     }
     $607 = HEAP32[1297] | 0; //@line 3894
     $611 = $546 - $$2253$ph$i + $607 & 0 - $607; //@line 3898
     if ($611 >>> 0 >= 2147483647) {
      $$723947$i = $$2253$ph$i; //@line 3901
      $$748$i = $$2247$ph$i; //@line 3901
      label = 180; //@line 3902
      break L244;
     }
     if ((_sbrk($611 | 0) | 0) == (-1 | 0)) {
      _sbrk($603 | 0) | 0; //@line 3908
      $$2234243136$i = 0; //@line 3909
      break;
     } else {
      $$723947$i = $611 + $$2253$ph$i | 0; //@line 3913
      $$748$i = $$2247$ph$i; //@line 3913
      label = 180; //@line 3914
      break L244;
     }
    }
   } while (0);
   HEAP32[1288] = HEAP32[1288] | 4; //@line 3921
   $$4236$i = $$2234243136$i; //@line 3922
   label = 178; //@line 3923
  } else {
   $$4236$i = 0; //@line 3925
   label = 178; //@line 3926
  }
 } while (0);
 if ((label | 0) == 178) {
  if ($550 >>> 0 < 2147483647) {
   $620 = _sbrk($550 | 0) | 0; //@line 3932
   $621 = _sbrk(0) | 0; //@line 3933
   $627 = $621 - $620 | 0; //@line 3941
   $629 = $627 >>> 0 > ($$0197 + 40 | 0) >>> 0; //@line 3943
   if (!(($620 | 0) == (-1 | 0) | $629 ^ 1 | $620 >>> 0 < $621 >>> 0 & (($620 | 0) != (-1 | 0) & ($621 | 0) != (-1 | 0)) ^ 1)) {
    $$723947$i = $629 ? $627 : $$4236$i; //@line 3951
    $$748$i = $620; //@line 3951
    label = 180; //@line 3952
   }
  }
 }
 if ((label | 0) == 180) {
  $633 = (HEAP32[1285] | 0) + $$723947$i | 0; //@line 3958
  HEAP32[1285] = $633; //@line 3959
  if ($633 >>> 0 > (HEAP32[1286] | 0) >>> 0) {
   HEAP32[1286] = $633; //@line 3963
  }
  $636 = HEAP32[1183] | 0; //@line 3965
  do {
   if (!$636) {
    $638 = HEAP32[1181] | 0; //@line 3969
    if (($638 | 0) == 0 | $$748$i >>> 0 < $638 >>> 0) {
     HEAP32[1181] = $$748$i; //@line 3974
    }
    HEAP32[1289] = $$748$i; //@line 3976
    HEAP32[1290] = $$723947$i; //@line 3977
    HEAP32[1292] = 0; //@line 3978
    HEAP32[1186] = HEAP32[1295]; //@line 3980
    HEAP32[1185] = -1; //@line 3981
    HEAP32[1190] = 4748; //@line 3982
    HEAP32[1189] = 4748; //@line 3983
    HEAP32[1192] = 4756; //@line 3984
    HEAP32[1191] = 4756; //@line 3985
    HEAP32[1194] = 4764; //@line 3986
    HEAP32[1193] = 4764; //@line 3987
    HEAP32[1196] = 4772; //@line 3988
    HEAP32[1195] = 4772; //@line 3989
    HEAP32[1198] = 4780; //@line 3990
    HEAP32[1197] = 4780; //@line 3991
    HEAP32[1200] = 4788; //@line 3992
    HEAP32[1199] = 4788; //@line 3993
    HEAP32[1202] = 4796; //@line 3994
    HEAP32[1201] = 4796; //@line 3995
    HEAP32[1204] = 4804; //@line 3996
    HEAP32[1203] = 4804; //@line 3997
    HEAP32[1206] = 4812; //@line 3998
    HEAP32[1205] = 4812; //@line 3999
    HEAP32[1208] = 4820; //@line 4000
    HEAP32[1207] = 4820; //@line 4001
    HEAP32[1210] = 4828; //@line 4002
    HEAP32[1209] = 4828; //@line 4003
    HEAP32[1212] = 4836; //@line 4004
    HEAP32[1211] = 4836; //@line 4005
    HEAP32[1214] = 4844; //@line 4006
    HEAP32[1213] = 4844; //@line 4007
    HEAP32[1216] = 4852; //@line 4008
    HEAP32[1215] = 4852; //@line 4009
    HEAP32[1218] = 4860; //@line 4010
    HEAP32[1217] = 4860; //@line 4011
    HEAP32[1220] = 4868; //@line 4012
    HEAP32[1219] = 4868; //@line 4013
    HEAP32[1222] = 4876; //@line 4014
    HEAP32[1221] = 4876; //@line 4015
    HEAP32[1224] = 4884; //@line 4016
    HEAP32[1223] = 4884; //@line 4017
    HEAP32[1226] = 4892; //@line 4018
    HEAP32[1225] = 4892; //@line 4019
    HEAP32[1228] = 4900; //@line 4020
    HEAP32[1227] = 4900; //@line 4021
    HEAP32[1230] = 4908; //@line 4022
    HEAP32[1229] = 4908; //@line 4023
    HEAP32[1232] = 4916; //@line 4024
    HEAP32[1231] = 4916; //@line 4025
    HEAP32[1234] = 4924; //@line 4026
    HEAP32[1233] = 4924; //@line 4027
    HEAP32[1236] = 4932; //@line 4028
    HEAP32[1235] = 4932; //@line 4029
    HEAP32[1238] = 4940; //@line 4030
    HEAP32[1237] = 4940; //@line 4031
    HEAP32[1240] = 4948; //@line 4032
    HEAP32[1239] = 4948; //@line 4033
    HEAP32[1242] = 4956; //@line 4034
    HEAP32[1241] = 4956; //@line 4035
    HEAP32[1244] = 4964; //@line 4036
    HEAP32[1243] = 4964; //@line 4037
    HEAP32[1246] = 4972; //@line 4038
    HEAP32[1245] = 4972; //@line 4039
    HEAP32[1248] = 4980; //@line 4040
    HEAP32[1247] = 4980; //@line 4041
    HEAP32[1250] = 4988; //@line 4042
    HEAP32[1249] = 4988; //@line 4043
    HEAP32[1252] = 4996; //@line 4044
    HEAP32[1251] = 4996; //@line 4045
    $642 = $$723947$i + -40 | 0; //@line 4046
    $644 = $$748$i + 8 | 0; //@line 4048
    $649 = ($644 & 7 | 0) == 0 ? 0 : 0 - $644 & 7; //@line 4053
    $650 = $$748$i + $649 | 0; //@line 4054
    $651 = $642 - $649 | 0; //@line 4055
    HEAP32[1183] = $650; //@line 4056
    HEAP32[1180] = $651; //@line 4057
    HEAP32[$650 + 4 >> 2] = $651 | 1; //@line 4060
    HEAP32[$$748$i + $642 + 4 >> 2] = 40; //@line 4063
    HEAP32[1184] = HEAP32[1299]; //@line 4065
   } else {
    $$024367$i = 5156; //@line 4067
    while (1) {
     $657 = HEAP32[$$024367$i >> 2] | 0; //@line 4069
     $658 = $$024367$i + 4 | 0; //@line 4070
     $659 = HEAP32[$658 >> 2] | 0; //@line 4071
     if (($$748$i | 0) == ($657 + $659 | 0)) {
      label = 188; //@line 4075
      break;
     }
     $663 = HEAP32[$$024367$i + 8 >> 2] | 0; //@line 4079
     if (!$663) {
      break;
     } else {
      $$024367$i = $663; //@line 4084
     }
    }
    if ((label | 0) == 188) {
     if (!(HEAP32[$$024367$i + 12 >> 2] & 8)) {
      if ($$748$i >>> 0 > $636 >>> 0 & $657 >>> 0 <= $636 >>> 0) {
       HEAP32[$658 >> 2] = $659 + $$723947$i; //@line 4098
       $673 = (HEAP32[1180] | 0) + $$723947$i | 0; //@line 4100
       $675 = $636 + 8 | 0; //@line 4102
       $680 = ($675 & 7 | 0) == 0 ? 0 : 0 - $675 & 7; //@line 4107
       $681 = $636 + $680 | 0; //@line 4108
       $682 = $673 - $680 | 0; //@line 4109
       HEAP32[1183] = $681; //@line 4110
       HEAP32[1180] = $682; //@line 4111
       HEAP32[$681 + 4 >> 2] = $682 | 1; //@line 4114
       HEAP32[$636 + $673 + 4 >> 2] = 40; //@line 4117
       HEAP32[1184] = HEAP32[1299]; //@line 4119
       break;
      }
     }
    }
    $688 = HEAP32[1181] | 0; //@line 4124
    if ($$748$i >>> 0 < $688 >>> 0) {
     HEAP32[1181] = $$748$i; //@line 4127
     $753 = $$748$i; //@line 4128
    } else {
     $753 = $688; //@line 4130
    }
    $690 = $$748$i + $$723947$i | 0; //@line 4132
    $$124466$i = 5156; //@line 4133
    while (1) {
     if ((HEAP32[$$124466$i >> 2] | 0) == ($690 | 0)) {
      label = 196; //@line 4138
      break;
     }
     $694 = HEAP32[$$124466$i + 8 >> 2] | 0; //@line 4142
     if (!$694) {
      $$0$i$i$i = 5156; //@line 4145
      break;
     } else {
      $$124466$i = $694; //@line 4148
     }
    }
    if ((label | 0) == 196) {
     if (!(HEAP32[$$124466$i + 12 >> 2] & 8)) {
      HEAP32[$$124466$i >> 2] = $$748$i; //@line 4157
      $700 = $$124466$i + 4 | 0; //@line 4158
      HEAP32[$700 >> 2] = (HEAP32[$700 >> 2] | 0) + $$723947$i; //@line 4161
      $704 = $$748$i + 8 | 0; //@line 4163
      $710 = $$748$i + (($704 & 7 | 0) == 0 ? 0 : 0 - $704 & 7) | 0; //@line 4169
      $712 = $690 + 8 | 0; //@line 4171
      $718 = $690 + (($712 & 7 | 0) == 0 ? 0 : 0 - $712 & 7) | 0; //@line 4177
      $722 = $710 + $$0197 | 0; //@line 4181
      $723 = $718 - $710 - $$0197 | 0; //@line 4182
      HEAP32[$710 + 4 >> 2] = $$0197 | 3; //@line 4185
      do {
       if (($636 | 0) == ($718 | 0)) {
        $728 = (HEAP32[1180] | 0) + $723 | 0; //@line 4190
        HEAP32[1180] = $728; //@line 4191
        HEAP32[1183] = $722; //@line 4192
        HEAP32[$722 + 4 >> 2] = $728 | 1; //@line 4195
       } else {
        if ((HEAP32[1182] | 0) == ($718 | 0)) {
         $734 = (HEAP32[1179] | 0) + $723 | 0; //@line 4201
         HEAP32[1179] = $734; //@line 4202
         HEAP32[1182] = $722; //@line 4203
         HEAP32[$722 + 4 >> 2] = $734 | 1; //@line 4206
         HEAP32[$722 + $734 >> 2] = $734; //@line 4208
         break;
        }
        $739 = HEAP32[$718 + 4 >> 2] | 0; //@line 4212
        if (($739 & 3 | 0) == 1) {
         $742 = $739 & -8; //@line 4216
         $743 = $739 >>> 3; //@line 4217
         L311 : do {
          if ($739 >>> 0 < 256) {
           $746 = HEAP32[$718 + 8 >> 2] | 0; //@line 4222
           $748 = HEAP32[$718 + 12 >> 2] | 0; //@line 4224
           $750 = 4748 + ($743 << 1 << 2) | 0; //@line 4226
           do {
            if (($746 | 0) != ($750 | 0)) {
             if ($753 >>> 0 > $746 >>> 0) {
              _abort(); //@line 4232
             }
             if ((HEAP32[$746 + 12 >> 2] | 0) == ($718 | 0)) {
              break;
             }
             _abort(); //@line 4241
            }
           } while (0);
           if (($748 | 0) == ($746 | 0)) {
            HEAP32[1177] = HEAP32[1177] & ~(1 << $743); //@line 4251
            break;
           }
           do {
            if (($748 | 0) == ($750 | 0)) {
             $$pre$phi11$i$iZ2D = $748 + 8 | 0; //@line 4258
            } else {
             if ($753 >>> 0 > $748 >>> 0) {
              _abort(); //@line 4262
             }
             $764 = $748 + 8 | 0; //@line 4265
             if ((HEAP32[$764 >> 2] | 0) == ($718 | 0)) {
              $$pre$phi11$i$iZ2D = $764; //@line 4269
              break;
             }
             _abort(); //@line 4272
            }
           } while (0);
           HEAP32[$746 + 12 >> 2] = $748; //@line 4277
           HEAP32[$$pre$phi11$i$iZ2D >> 2] = $746; //@line 4278
          } else {
           $769 = HEAP32[$718 + 24 >> 2] | 0; //@line 4281
           $771 = HEAP32[$718 + 12 >> 2] | 0; //@line 4283
           do {
            if (($771 | 0) == ($718 | 0)) {
             $782 = $718 + 16 | 0; //@line 4287
             $783 = $782 + 4 | 0; //@line 4288
             $784 = HEAP32[$783 >> 2] | 0; //@line 4289
             if (!$784) {
              $786 = HEAP32[$782 >> 2] | 0; //@line 4292
              if (!$786) {
               $$3$i$i = 0; //@line 4295
               break;
              } else {
               $$1291$i$i = $786; //@line 4298
               $$1293$i$i = $782; //@line 4298
              }
             } else {
              $$1291$i$i = $784; //@line 4301
              $$1293$i$i = $783; //@line 4301
             }
             while (1) {
              $788 = $$1291$i$i + 20 | 0; //@line 4304
              $789 = HEAP32[$788 >> 2] | 0; //@line 4305
              if ($789 | 0) {
               $$1291$i$i = $789; //@line 4308
               $$1293$i$i = $788; //@line 4308
               continue;
              }
              $791 = $$1291$i$i + 16 | 0; //@line 4311
              $792 = HEAP32[$791 >> 2] | 0; //@line 4312
              if (!$792) {
               break;
              } else {
               $$1291$i$i = $792; //@line 4317
               $$1293$i$i = $791; //@line 4317
              }
             }
             if ($753 >>> 0 > $$1293$i$i >>> 0) {
              _abort(); //@line 4322
             } else {
              HEAP32[$$1293$i$i >> 2] = 0; //@line 4325
              $$3$i$i = $$1291$i$i; //@line 4326
              break;
             }
            } else {
             $774 = HEAP32[$718 + 8 >> 2] | 0; //@line 4331
             if ($753 >>> 0 > $774 >>> 0) {
              _abort(); //@line 4334
             }
             $776 = $774 + 12 | 0; //@line 4337
             if ((HEAP32[$776 >> 2] | 0) != ($718 | 0)) {
              _abort(); //@line 4341
             }
             $779 = $771 + 8 | 0; //@line 4344
             if ((HEAP32[$779 >> 2] | 0) == ($718 | 0)) {
              HEAP32[$776 >> 2] = $771; //@line 4348
              HEAP32[$779 >> 2] = $774; //@line 4349
              $$3$i$i = $771; //@line 4350
              break;
             } else {
              _abort(); //@line 4353
             }
            }
           } while (0);
           if (!$769) {
            break;
           }
           $797 = HEAP32[$718 + 28 >> 2] | 0; //@line 4363
           $798 = 5012 + ($797 << 2) | 0; //@line 4364
           do {
            if ((HEAP32[$798 >> 2] | 0) == ($718 | 0)) {
             HEAP32[$798 >> 2] = $$3$i$i; //@line 4369
             if ($$3$i$i | 0) {
              break;
             }
             HEAP32[1178] = HEAP32[1178] & ~(1 << $797); //@line 4378
             break L311;
            } else {
             if ((HEAP32[1181] | 0) >>> 0 > $769 >>> 0) {
              _abort(); //@line 4384
             } else {
              HEAP32[$769 + 16 + (((HEAP32[$769 + 16 >> 2] | 0) != ($718 | 0) & 1) << 2) >> 2] = $$3$i$i; //@line 4392
              if (!$$3$i$i) {
               break L311;
              } else {
               break;
              }
             }
            }
           } while (0);
           $812 = HEAP32[1181] | 0; //@line 4402
           if ($812 >>> 0 > $$3$i$i >>> 0) {
            _abort(); //@line 4405
           }
           HEAP32[$$3$i$i + 24 >> 2] = $769; //@line 4409
           $815 = $718 + 16 | 0; //@line 4410
           $816 = HEAP32[$815 >> 2] | 0; //@line 4411
           do {
            if ($816 | 0) {
             if ($812 >>> 0 > $816 >>> 0) {
              _abort(); //@line 4417
             } else {
              HEAP32[$$3$i$i + 16 >> 2] = $816; //@line 4421
              HEAP32[$816 + 24 >> 2] = $$3$i$i; //@line 4423
              break;
             }
            }
           } while (0);
           $822 = HEAP32[$815 + 4 >> 2] | 0; //@line 4429
           if (!$822) {
            break;
           }
           if ((HEAP32[1181] | 0) >>> 0 > $822 >>> 0) {
            _abort(); //@line 4437
           } else {
            HEAP32[$$3$i$i + 20 >> 2] = $822; //@line 4441
            HEAP32[$822 + 24 >> 2] = $$3$i$i; //@line 4443
            break;
           }
          }
         } while (0);
         $$0$i17$i = $718 + $742 | 0; //@line 4450
         $$0287$i$i = $742 + $723 | 0; //@line 4450
        } else {
         $$0$i17$i = $718; //@line 4452
         $$0287$i$i = $723; //@line 4452
        }
        $830 = $$0$i17$i + 4 | 0; //@line 4454
        HEAP32[$830 >> 2] = HEAP32[$830 >> 2] & -2; //@line 4457
        HEAP32[$722 + 4 >> 2] = $$0287$i$i | 1; //@line 4460
        HEAP32[$722 + $$0287$i$i >> 2] = $$0287$i$i; //@line 4462
        $836 = $$0287$i$i >>> 3; //@line 4463
        if ($$0287$i$i >>> 0 < 256) {
         $839 = 4748 + ($836 << 1 << 2) | 0; //@line 4467
         $840 = HEAP32[1177] | 0; //@line 4468
         $841 = 1 << $836; //@line 4469
         do {
          if (!($840 & $841)) {
           HEAP32[1177] = $840 | $841; //@line 4475
           $$0295$i$i = $839; //@line 4477
           $$pre$phi$i19$iZ2D = $839 + 8 | 0; //@line 4477
          } else {
           $845 = $839 + 8 | 0; //@line 4479
           $846 = HEAP32[$845 >> 2] | 0; //@line 4480
           if ((HEAP32[1181] | 0) >>> 0 <= $846 >>> 0) {
            $$0295$i$i = $846; //@line 4484
            $$pre$phi$i19$iZ2D = $845; //@line 4484
            break;
           }
           _abort(); //@line 4487
          }
         } while (0);
         HEAP32[$$pre$phi$i19$iZ2D >> 2] = $722; //@line 4491
         HEAP32[$$0295$i$i + 12 >> 2] = $722; //@line 4493
         HEAP32[$722 + 8 >> 2] = $$0295$i$i; //@line 4495
         HEAP32[$722 + 12 >> 2] = $839; //@line 4497
         break;
        }
        $852 = $$0287$i$i >>> 8; //@line 4500
        do {
         if (!$852) {
          $$0296$i$i = 0; //@line 4504
         } else {
          if ($$0287$i$i >>> 0 > 16777215) {
           $$0296$i$i = 31; //@line 4508
           break;
          }
          $857 = ($852 + 1048320 | 0) >>> 16 & 8; //@line 4513
          $858 = $852 << $857; //@line 4514
          $861 = ($858 + 520192 | 0) >>> 16 & 4; //@line 4517
          $863 = $858 << $861; //@line 4519
          $866 = ($863 + 245760 | 0) >>> 16 & 2; //@line 4522
          $871 = 14 - ($861 | $857 | $866) + ($863 << $866 >>> 15) | 0; //@line 4527
          $$0296$i$i = $$0287$i$i >>> ($871 + 7 | 0) & 1 | $871 << 1; //@line 4533
         }
        } while (0);
        $877 = 5012 + ($$0296$i$i << 2) | 0; //@line 4536
        HEAP32[$722 + 28 >> 2] = $$0296$i$i; //@line 4538
        $879 = $722 + 16 | 0; //@line 4539
        HEAP32[$879 + 4 >> 2] = 0; //@line 4541
        HEAP32[$879 >> 2] = 0; //@line 4542
        $881 = HEAP32[1178] | 0; //@line 4543
        $882 = 1 << $$0296$i$i; //@line 4544
        if (!($881 & $882)) {
         HEAP32[1178] = $881 | $882; //@line 4549
         HEAP32[$877 >> 2] = $722; //@line 4550
         HEAP32[$722 + 24 >> 2] = $877; //@line 4552
         HEAP32[$722 + 12 >> 2] = $722; //@line 4554
         HEAP32[$722 + 8 >> 2] = $722; //@line 4556
         break;
        }
        $$0288$i$i = $$0287$i$i << (($$0296$i$i | 0) == 31 ? 0 : 25 - ($$0296$i$i >>> 1) | 0); //@line 4565
        $$0289$i$i = HEAP32[$877 >> 2] | 0; //@line 4565
        while (1) {
         if ((HEAP32[$$0289$i$i + 4 >> 2] & -8 | 0) == ($$0287$i$i | 0)) {
          label = 263; //@line 4572
          break;
         }
         $900 = $$0289$i$i + 16 + ($$0288$i$i >>> 31 << 2) | 0; //@line 4576
         $902 = HEAP32[$900 >> 2] | 0; //@line 4578
         if (!$902) {
          label = 260; //@line 4581
          break;
         } else {
          $$0288$i$i = $$0288$i$i << 1; //@line 4584
          $$0289$i$i = $902; //@line 4584
         }
        }
        if ((label | 0) == 260) {
         if ((HEAP32[1181] | 0) >>> 0 > $900 >>> 0) {
          _abort(); //@line 4591
         } else {
          HEAP32[$900 >> 2] = $722; //@line 4594
          HEAP32[$722 + 24 >> 2] = $$0289$i$i; //@line 4596
          HEAP32[$722 + 12 >> 2] = $722; //@line 4598
          HEAP32[$722 + 8 >> 2] = $722; //@line 4600
          break;
         }
        } else if ((label | 0) == 263) {
         $909 = $$0289$i$i + 8 | 0; //@line 4605
         $910 = HEAP32[$909 >> 2] | 0; //@line 4606
         $911 = HEAP32[1181] | 0; //@line 4607
         if ($911 >>> 0 <= $910 >>> 0 & $911 >>> 0 <= $$0289$i$i >>> 0) {
          HEAP32[$910 + 12 >> 2] = $722; //@line 4613
          HEAP32[$909 >> 2] = $722; //@line 4614
          HEAP32[$722 + 8 >> 2] = $910; //@line 4616
          HEAP32[$722 + 12 >> 2] = $$0289$i$i; //@line 4618
          HEAP32[$722 + 24 >> 2] = 0; //@line 4620
          break;
         } else {
          _abort(); //@line 4623
         }
        }
       }
      } while (0);
      $$0 = $710 + 8 | 0; //@line 4630
      STACKTOP = sp; //@line 4631
      return $$0 | 0; //@line 4631
     } else {
      $$0$i$i$i = 5156; //@line 4633
     }
    }
    while (1) {
     $919 = HEAP32[$$0$i$i$i >> 2] | 0; //@line 4637
     if ($919 >>> 0 <= $636 >>> 0) {
      $923 = $919 + (HEAP32[$$0$i$i$i + 4 >> 2] | 0) | 0; //@line 4642
      if ($923 >>> 0 > $636 >>> 0) {
       break;
      }
     }
     $$0$i$i$i = HEAP32[$$0$i$i$i + 8 >> 2] | 0; //@line 4650
    }
    $927 = $923 + -47 | 0; //@line 4652
    $929 = $927 + 8 | 0; //@line 4654
    $935 = $927 + (($929 & 7 | 0) == 0 ? 0 : 0 - $929 & 7) | 0; //@line 4660
    $936 = $636 + 16 | 0; //@line 4661
    $938 = $935 >>> 0 < $936 >>> 0 ? $636 : $935; //@line 4663
    $939 = $938 + 8 | 0; //@line 4664
    $940 = $938 + 24 | 0; //@line 4665
    $941 = $$723947$i + -40 | 0; //@line 4666
    $943 = $$748$i + 8 | 0; //@line 4668
    $948 = ($943 & 7 | 0) == 0 ? 0 : 0 - $943 & 7; //@line 4673
    $949 = $$748$i + $948 | 0; //@line 4674
    $950 = $941 - $948 | 0; //@line 4675
    HEAP32[1183] = $949; //@line 4676
    HEAP32[1180] = $950; //@line 4677
    HEAP32[$949 + 4 >> 2] = $950 | 1; //@line 4680
    HEAP32[$$748$i + $941 + 4 >> 2] = 40; //@line 4683
    HEAP32[1184] = HEAP32[1299]; //@line 4685
    $956 = $938 + 4 | 0; //@line 4686
    HEAP32[$956 >> 2] = 27; //@line 4687
    HEAP32[$939 >> 2] = HEAP32[1289]; //@line 4688
    HEAP32[$939 + 4 >> 2] = HEAP32[1290]; //@line 4688
    HEAP32[$939 + 8 >> 2] = HEAP32[1291]; //@line 4688
    HEAP32[$939 + 12 >> 2] = HEAP32[1292]; //@line 4688
    HEAP32[1289] = $$748$i; //@line 4689
    HEAP32[1290] = $$723947$i; //@line 4690
    HEAP32[1292] = 0; //@line 4691
    HEAP32[1291] = $939; //@line 4692
    $958 = $940; //@line 4693
    do {
     $958$looptemp = $958;
     $958 = $958 + 4 | 0; //@line 4695
     HEAP32[$958 >> 2] = 7; //@line 4696
    } while (($958$looptemp + 8 | 0) >>> 0 < $923 >>> 0);
    if (($938 | 0) != ($636 | 0)) {
     $964 = $938 - $636 | 0; //@line 4709
     HEAP32[$956 >> 2] = HEAP32[$956 >> 2] & -2; //@line 4712
     HEAP32[$636 + 4 >> 2] = $964 | 1; //@line 4715
     HEAP32[$938 >> 2] = $964; //@line 4716
     $969 = $964 >>> 3; //@line 4717
     if ($964 >>> 0 < 256) {
      $972 = 4748 + ($969 << 1 << 2) | 0; //@line 4721
      $973 = HEAP32[1177] | 0; //@line 4722
      $974 = 1 << $969; //@line 4723
      if (!($973 & $974)) {
       HEAP32[1177] = $973 | $974; //@line 4728
       $$0211$i$i = $972; //@line 4730
       $$pre$phi$i$iZ2D = $972 + 8 | 0; //@line 4730
      } else {
       $978 = $972 + 8 | 0; //@line 4732
       $979 = HEAP32[$978 >> 2] | 0; //@line 4733
       if ((HEAP32[1181] | 0) >>> 0 > $979 >>> 0) {
        _abort(); //@line 4737
       } else {
        $$0211$i$i = $979; //@line 4740
        $$pre$phi$i$iZ2D = $978; //@line 4740
       }
      }
      HEAP32[$$pre$phi$i$iZ2D >> 2] = $636; //@line 4743
      HEAP32[$$0211$i$i + 12 >> 2] = $636; //@line 4745
      HEAP32[$636 + 8 >> 2] = $$0211$i$i; //@line 4747
      HEAP32[$636 + 12 >> 2] = $972; //@line 4749
      break;
     }
     $985 = $964 >>> 8; //@line 4752
     if (!$985) {
      $$0212$i$i = 0; //@line 4755
     } else {
      if ($964 >>> 0 > 16777215) {
       $$0212$i$i = 31; //@line 4759
      } else {
       $990 = ($985 + 1048320 | 0) >>> 16 & 8; //@line 4763
       $991 = $985 << $990; //@line 4764
       $994 = ($991 + 520192 | 0) >>> 16 & 4; //@line 4767
       $996 = $991 << $994; //@line 4769
       $999 = ($996 + 245760 | 0) >>> 16 & 2; //@line 4772
       $1004 = 14 - ($994 | $990 | $999) + ($996 << $999 >>> 15) | 0; //@line 4777
       $$0212$i$i = $964 >>> ($1004 + 7 | 0) & 1 | $1004 << 1; //@line 4783
      }
     }
     $1010 = 5012 + ($$0212$i$i << 2) | 0; //@line 4786
     HEAP32[$636 + 28 >> 2] = $$0212$i$i; //@line 4788
     HEAP32[$636 + 20 >> 2] = 0; //@line 4790
     HEAP32[$936 >> 2] = 0; //@line 4791
     $1013 = HEAP32[1178] | 0; //@line 4792
     $1014 = 1 << $$0212$i$i; //@line 4793
     if (!($1013 & $1014)) {
      HEAP32[1178] = $1013 | $1014; //@line 4798
      HEAP32[$1010 >> 2] = $636; //@line 4799
      HEAP32[$636 + 24 >> 2] = $1010; //@line 4801
      HEAP32[$636 + 12 >> 2] = $636; //@line 4803
      HEAP32[$636 + 8 >> 2] = $636; //@line 4805
      break;
     }
     $$0206$i$i = $964 << (($$0212$i$i | 0) == 31 ? 0 : 25 - ($$0212$i$i >>> 1) | 0); //@line 4814
     $$0207$i$i = HEAP32[$1010 >> 2] | 0; //@line 4814
     while (1) {
      if ((HEAP32[$$0207$i$i + 4 >> 2] & -8 | 0) == ($964 | 0)) {
       label = 289; //@line 4821
       break;
      }
      $1032 = $$0207$i$i + 16 + ($$0206$i$i >>> 31 << 2) | 0; //@line 4825
      $1034 = HEAP32[$1032 >> 2] | 0; //@line 4827
      if (!$1034) {
       label = 286; //@line 4830
       break;
      } else {
       $$0206$i$i = $$0206$i$i << 1; //@line 4833
       $$0207$i$i = $1034; //@line 4833
      }
     }
     if ((label | 0) == 286) {
      if ((HEAP32[1181] | 0) >>> 0 > $1032 >>> 0) {
       _abort(); //@line 4840
      } else {
       HEAP32[$1032 >> 2] = $636; //@line 4843
       HEAP32[$636 + 24 >> 2] = $$0207$i$i; //@line 4845
       HEAP32[$636 + 12 >> 2] = $636; //@line 4847
       HEAP32[$636 + 8 >> 2] = $636; //@line 4849
       break;
      }
     } else if ((label | 0) == 289) {
      $1041 = $$0207$i$i + 8 | 0; //@line 4854
      $1042 = HEAP32[$1041 >> 2] | 0; //@line 4855
      $1043 = HEAP32[1181] | 0; //@line 4856
      if ($1043 >>> 0 <= $1042 >>> 0 & $1043 >>> 0 <= $$0207$i$i >>> 0) {
       HEAP32[$1042 + 12 >> 2] = $636; //@line 4862
       HEAP32[$1041 >> 2] = $636; //@line 4863
       HEAP32[$636 + 8 >> 2] = $1042; //@line 4865
       HEAP32[$636 + 12 >> 2] = $$0207$i$i; //@line 4867
       HEAP32[$636 + 24 >> 2] = 0; //@line 4869
       break;
      } else {
       _abort(); //@line 4872
      }
     }
    }
   }
  } while (0);
  $1052 = HEAP32[1180] | 0; //@line 4879
  if ($1052 >>> 0 > $$0197 >>> 0) {
   $1054 = $1052 - $$0197 | 0; //@line 4882
   HEAP32[1180] = $1054; //@line 4883
   $1055 = HEAP32[1183] | 0; //@line 4884
   $1056 = $1055 + $$0197 | 0; //@line 4885
   HEAP32[1183] = $1056; //@line 4886
   HEAP32[$1056 + 4 >> 2] = $1054 | 1; //@line 4889
   HEAP32[$1055 + 4 >> 2] = $$0197 | 3; //@line 4892
   $$0 = $1055 + 8 | 0; //@line 4894
   STACKTOP = sp; //@line 4895
   return $$0 | 0; //@line 4895
  }
 }
 HEAP32[(___errno_location() | 0) >> 2] = 12; //@line 4899
 $$0 = 0; //@line 4900
 STACKTOP = sp; //@line 4901
 return $$0 | 0; //@line 4901
}
function _equeue_dispatch__async_cb_27($0) {
 $0 = $0 | 0;
 var $$02329$i$i = 0, $$02330$i$i = 0, $$025$i$i = 0, $$03956$i = 0, $$03956$i$phi = 0, $$04055$i = 0, $$0405571$i = 0, $$04063$i = 0, $$04159$i = 0, $$04258$i = 0, $$057$i = 0, $$065 = 0, $$06790 = 0, $$2 = 0, $$expand_i1_val = 0, $$expand_i1_val11 = 0, $$expand_i1_val13 = 0, $$expand_i1_val9 = 0, $$sink$in$i$i = 0, $$sroa$0$i$0$$sroa$0$0$$sroa$0$0$$0$4353$pre$i73 = 0, $$sroa$0$i$0$$sroa$0$0$$sroa$0$0$$0$52$i72 = 0, $10 = 0, $100 = 0, $101 = 0, $102 = 0, $103 = 0, $104 = 0, $105 = 0, $106 = 0, $107 = 0, $108 = 0, $109 = 0, $110 = 0, $111 = 0, $112 = 0, $113 = 0, $114 = 0, $115 = 0, $116 = 0, $117 = 0, $118 = 0, $12 = 0, $127 = 0, $130 = 0, $131 = 0, $132 = 0, $133 = 0, $134 = 0, $135 = 0, $136 = 0, $137 = 0, $138 = 0, $139 = 0, $14 = 0, $140 = 0, $141 = 0, $142 = 0, $143 = 0, $144 = 0, $145 = 0, $146 = 0, $147 = 0, $148 = 0, $149 = 0, $150 = 0, $152 = 0, $153 = 0, $154 = 0, $156 = 0, $157 = 0, $16 = 0, $165 = 0, $166 = 0, $168 = 0, $171 = 0, $173 = 0, $176 = 0, $179 = 0, $18 = 0, $183 = 0, $184 = 0, $185 = 0, $186 = 0, $190 = 0, $193 = 0, $199 = 0, $2 = 0, $20 = 0, $200 = 0, $201 = 0, $202 = 0, $203 = 0, $204 = 0, $205 = 0, $206 = 0, $207 = 0, $208 = 0, $209 = 0, $210 = 0, $211 = 0, $212 = 0, $213 = 0, $214 = 0, $215 = 0, $216 = 0, $217 = 0, $22 = 0, $24 = 0, $26 = 0, $28 = 0, $30 = 0, $32 = 0, $34 = 0, $36 = 0, $4 = 0, $44 = 0, $45 = 0, $48 = 0, $54 = 0, $6 = 0, $63 = 0, $66 = 0, $67 = 0, $69 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $78 = 0, $79 = 0, $8 = 0, $80 = 0, $81 = 0, $82 = 0, $83 = 0, $84 = 0, $85 = 0, $86 = 0, $87 = 0, $88 = 0, $89 = 0, $90 = 0, $91 = 0, $93 = 0, $95 = 0, $98 = 0, $99 = 0, $ReallocAsyncCtx = 0, $ReallocAsyncCtx2 = 0, $ReallocAsyncCtx3 = 0, $ReallocAsyncCtx4 = 0, $ReallocAsyncCtx5 = 0, label = 0, sp = 0, $$04159$i$looptemp = 0, $$04258$i$looptemp = 0;
 sp = STACKTOP; //@line 632
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 634
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 636
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 638
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 640
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 642
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 644
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 646
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 648
 $18 = HEAP8[$0 + 36 >> 0] & 1; //@line 651
 $20 = HEAP32[$0 + 40 >> 2] | 0; //@line 653
 $22 = HEAP32[$0 + 44 >> 2] | 0; //@line 655
 $24 = HEAP32[$0 + 48 >> 2] | 0; //@line 657
 $26 = HEAP32[$0 + 52 >> 2] | 0; //@line 659
 $28 = HEAP32[$0 + 56 >> 2] | 0; //@line 661
 $30 = HEAP32[$0 + 60 >> 2] | 0; //@line 663
 $32 = HEAP32[$0 + 64 >> 2] | 0; //@line 665
 $34 = HEAP32[$0 + 68 >> 2] | 0; //@line 667
 $36 = HEAP32[$0 + 72 >> 2] | 0; //@line 669
 _equeue_mutex_lock($6); //@line 670
 HEAP8[$10 >> 0] = (HEAPU8[$10 >> 0] | 0) + 1; //@line 675
 if (((HEAP32[$12 >> 2] | 0) - $8 | 0) < 1) {
  HEAP32[$12 >> 2] = $8; //@line 680
 }
 $44 = HEAP32[$28 >> 2] | 0; //@line 682
 HEAP32[$30 >> 2] = $44; //@line 683
 $45 = $44; //@line 684
 L6 : do {
  if (!$44) {
   $$04055$i = $20; //@line 688
   $54 = $45; //@line 688
   label = 8; //@line 689
  } else {
   $$04063$i = $20; //@line 691
   $48 = $45; //@line 691
   do {
    if (((HEAP32[$48 + 20 >> 2] | 0) - $8 | 0) >= 1) {
     $$04055$i = $$04063$i; //@line 698
     $54 = $48; //@line 698
     label = 8; //@line 699
     break L6;
    }
    $$04063$i = $48 + 8 | 0; //@line 702
    $48 = HEAP32[$$04063$i >> 2] | 0; //@line 703
   } while (($48 | 0) != 0);
   HEAP32[$32 >> 2] = 0; //@line 711
   $$0405571$i = $$04063$i; //@line 712
  }
 } while (0);
 if ((label | 0) == 8) {
  HEAP32[$32 >> 2] = $54; //@line 716
  if (!$54) {
   $$0405571$i = $$04055$i; //@line 719
  } else {
   HEAP32[$54 + 16 >> 2] = $32; //@line 722
   $$0405571$i = $$04055$i; //@line 723
  }
 }
 HEAP32[$$0405571$i >> 2] = 0; //@line 726
 _equeue_mutex_unlock($6); //@line 727
 $$sroa$0$i$0$$sroa$0$0$$sroa$0$0$$0$52$i72 = HEAP32[$20 >> 2] | 0; //@line 728
 L15 : do {
  if (!$$sroa$0$i$0$$sroa$0$0$$sroa$0$0$$0$52$i72) {} else {
   $$04159$i = $$sroa$0$i$0$$sroa$0$0$$sroa$0$0$$0$52$i72; //@line 733
   $$04258$i = $20; //@line 733
   do {
    $$04258$i$looptemp = $$04258$i;
    $$04258$i = $$04159$i + 8 | 0; //@line 735
    $$04159$i$looptemp = $$04159$i;
    $$04159$i = HEAP32[$$04258$i >> 2] | 0; //@line 736
    $$03956$i = 0; //@line 737
    $$057$i = $$04159$i$looptemp; //@line 737
    while (1) {
     HEAP32[$$057$i + 8 >> 2] = $$03956$i; //@line 740
     $63 = HEAP32[$$057$i + 12 >> 2] | 0; //@line 742
     if (!$63) {
      break;
     } else {
      $$03956$i$phi = $$057$i; //@line 747
      $$057$i = $63; //@line 747
      $$03956$i = $$03956$i$phi; //@line 747
     }
    }
    HEAP32[$$04258$i$looptemp >> 2] = $$057$i; //@line 750
   } while (($$04159$i | 0) != 0);
   $$sroa$0$i$0$$sroa$0$0$$sroa$0$0$$0$4353$pre$i73 = HEAP32[$20 >> 2] | 0; //@line 758
   if ($$sroa$0$i$0$$sroa$0$0$$sroa$0$0$$0$4353$pre$i73 | 0) {
    $$06790 = $$sroa$0$i$0$$sroa$0$0$$sroa$0$0$$0$4353$pre$i73; //@line 761
    while (1) {
     $66 = $$06790 + 8 | 0; //@line 763
     $67 = HEAP32[$66 >> 2] | 0; //@line 764
     $69 = HEAP32[$$06790 + 32 >> 2] | 0; //@line 766
     if ($69 | 0) {
      label = 17; //@line 769
      break;
     }
     $93 = HEAP32[$$06790 + 24 >> 2] | 0; //@line 773
     if (($93 | 0) > -1) {
      label = 21; //@line 776
      break;
     }
     $117 = $$06790 + 4 | 0; //@line 780
     $118 = HEAP8[$117 >> 0] | 0; //@line 781
     HEAP8[$117 >> 0] = (($118 + 1 & 255) << HEAP32[$36 >> 2] | 0) == 0 ? 1 : ($118 & 255) + 1 & 255; //@line 790
     $127 = HEAP32[$$06790 + 28 >> 2] | 0; //@line 792
     if ($127 | 0) {
      label = 25; //@line 795
      break;
     }
     _equeue_mutex_lock($4); //@line 798
     $150 = HEAP32[$2 >> 2] | 0; //@line 799
     L28 : do {
      if (!$150) {
       $$02329$i$i = $2; //@line 803
       label = 34; //@line 804
      } else {
       $152 = HEAP32[$$06790 >> 2] | 0; //@line 806
       $$025$i$i = $2; //@line 807
       $154 = $150; //@line 807
       while (1) {
        $153 = HEAP32[$154 >> 2] | 0; //@line 809
        if ($153 >>> 0 >= $152 >>> 0) {
         break;
        }
        $156 = $154 + 8 | 0; //@line 814
        $157 = HEAP32[$156 >> 2] | 0; //@line 815
        if (!$157) {
         $$02329$i$i = $156; //@line 818
         label = 34; //@line 819
         break L28;
        } else {
         $$025$i$i = $156; //@line 822
         $154 = $157; //@line 822
        }
       }
       if (($153 | 0) == ($152 | 0)) {
        HEAP32[$$06790 + 12 >> 2] = $154; //@line 828
        $$02330$i$i = $$025$i$i; //@line 831
        $$sink$in$i$i = (HEAP32[$$025$i$i >> 2] | 0) + 8 | 0; //@line 831
       } else {
        $$02329$i$i = $$025$i$i; //@line 833
        label = 34; //@line 834
       }
      }
     } while (0);
     if ((label | 0) == 34) {
      label = 0; //@line 839
      HEAP32[$$06790 + 12 >> 2] = 0; //@line 841
      $$02330$i$i = $$02329$i$i; //@line 842
      $$sink$in$i$i = $$02329$i$i; //@line 842
     }
     HEAP32[$66 >> 2] = HEAP32[$$sink$in$i$i >> 2]; //@line 845
     HEAP32[$$02330$i$i >> 2] = $$06790; //@line 846
     _equeue_mutex_unlock($4); //@line 847
     if (!$67) {
      break L15;
     } else {
      $$06790 = $67; //@line 852
     }
    }
    if ((label | 0) == 17) {
     $ReallocAsyncCtx = _emscripten_realloc_async_context(84) | 0; //@line 857
     FUNCTION_TABLE_vi[$69 & 127]($$06790 + 36 | 0); //@line 858
     if (___async) {
      HEAP32[$ReallocAsyncCtx >> 2] = 27; //@line 861
      $72 = $ReallocAsyncCtx + 4 | 0; //@line 862
      HEAP32[$72 >> 2] = $2; //@line 863
      $73 = $ReallocAsyncCtx + 8 | 0; //@line 864
      HEAP32[$73 >> 2] = $$06790; //@line 865
      $74 = $ReallocAsyncCtx + 12 | 0; //@line 866
      HEAP32[$74 >> 2] = $67; //@line 867
      $75 = $ReallocAsyncCtx + 16 | 0; //@line 868
      HEAP32[$75 >> 2] = $66; //@line 869
      $76 = $ReallocAsyncCtx + 20 | 0; //@line 870
      HEAP32[$76 >> 2] = $4; //@line 871
      $77 = $ReallocAsyncCtx + 24 | 0; //@line 872
      HEAP32[$77 >> 2] = $6; //@line 873
      $78 = $ReallocAsyncCtx + 28 | 0; //@line 874
      HEAP32[$78 >> 2] = $10; //@line 875
      $79 = $ReallocAsyncCtx + 32 | 0; //@line 876
      HEAP32[$79 >> 2] = $12; //@line 877
      $80 = $ReallocAsyncCtx + 36 | 0; //@line 878
      HEAP32[$80 >> 2] = $14; //@line 879
      $81 = $ReallocAsyncCtx + 40 | 0; //@line 880
      HEAP32[$81 >> 2] = $16; //@line 881
      $82 = $ReallocAsyncCtx + 44 | 0; //@line 882
      $$expand_i1_val = $18 & 1; //@line 883
      HEAP8[$82 >> 0] = $$expand_i1_val; //@line 884
      $83 = $ReallocAsyncCtx + 48 | 0; //@line 885
      HEAP32[$83 >> 2] = $20; //@line 886
      $84 = $ReallocAsyncCtx + 52 | 0; //@line 887
      HEAP32[$84 >> 2] = $22; //@line 888
      $85 = $ReallocAsyncCtx + 56 | 0; //@line 889
      HEAP32[$85 >> 2] = $24; //@line 890
      $86 = $ReallocAsyncCtx + 60 | 0; //@line 891
      HEAP32[$86 >> 2] = $26; //@line 892
      $87 = $ReallocAsyncCtx + 64 | 0; //@line 893
      HEAP32[$87 >> 2] = $28; //@line 894
      $88 = $ReallocAsyncCtx + 68 | 0; //@line 895
      HEAP32[$88 >> 2] = $30; //@line 896
      $89 = $ReallocAsyncCtx + 72 | 0; //@line 897
      HEAP32[$89 >> 2] = $32; //@line 898
      $90 = $ReallocAsyncCtx + 76 | 0; //@line 899
      HEAP32[$90 >> 2] = $34; //@line 900
      $91 = $ReallocAsyncCtx + 80 | 0; //@line 901
      HEAP32[$91 >> 2] = $36; //@line 902
      sp = STACKTOP; //@line 903
      return;
     }
     ___async_unwind = 0; //@line 906
     HEAP32[$ReallocAsyncCtx >> 2] = 27; //@line 907
     $72 = $ReallocAsyncCtx + 4 | 0; //@line 908
     HEAP32[$72 >> 2] = $2; //@line 909
     $73 = $ReallocAsyncCtx + 8 | 0; //@line 910
     HEAP32[$73 >> 2] = $$06790; //@line 911
     $74 = $ReallocAsyncCtx + 12 | 0; //@line 912
     HEAP32[$74 >> 2] = $67; //@line 913
     $75 = $ReallocAsyncCtx + 16 | 0; //@line 914
     HEAP32[$75 >> 2] = $66; //@line 915
     $76 = $ReallocAsyncCtx + 20 | 0; //@line 916
     HEAP32[$76 >> 2] = $4; //@line 917
     $77 = $ReallocAsyncCtx + 24 | 0; //@line 918
     HEAP32[$77 >> 2] = $6; //@line 919
     $78 = $ReallocAsyncCtx + 28 | 0; //@line 920
     HEAP32[$78 >> 2] = $10; //@line 921
     $79 = $ReallocAsyncCtx + 32 | 0; //@line 922
     HEAP32[$79 >> 2] = $12; //@line 923
     $80 = $ReallocAsyncCtx + 36 | 0; //@line 924
     HEAP32[$80 >> 2] = $14; //@line 925
     $81 = $ReallocAsyncCtx + 40 | 0; //@line 926
     HEAP32[$81 >> 2] = $16; //@line 927
     $82 = $ReallocAsyncCtx + 44 | 0; //@line 928
     $$expand_i1_val = $18 & 1; //@line 929
     HEAP8[$82 >> 0] = $$expand_i1_val; //@line 930
     $83 = $ReallocAsyncCtx + 48 | 0; //@line 931
     HEAP32[$83 >> 2] = $20; //@line 932
     $84 = $ReallocAsyncCtx + 52 | 0; //@line 933
     HEAP32[$84 >> 2] = $22; //@line 934
     $85 = $ReallocAsyncCtx + 56 | 0; //@line 935
     HEAP32[$85 >> 2] = $24; //@line 936
     $86 = $ReallocAsyncCtx + 60 | 0; //@line 937
     HEAP32[$86 >> 2] = $26; //@line 938
     $87 = $ReallocAsyncCtx + 64 | 0; //@line 939
     HEAP32[$87 >> 2] = $28; //@line 940
     $88 = $ReallocAsyncCtx + 68 | 0; //@line 941
     HEAP32[$88 >> 2] = $30; //@line 942
     $89 = $ReallocAsyncCtx + 72 | 0; //@line 943
     HEAP32[$89 >> 2] = $32; //@line 944
     $90 = $ReallocAsyncCtx + 76 | 0; //@line 945
     HEAP32[$90 >> 2] = $34; //@line 946
     $91 = $ReallocAsyncCtx + 80 | 0; //@line 947
     HEAP32[$91 >> 2] = $36; //@line 948
     sp = STACKTOP; //@line 949
     return;
    } else if ((label | 0) == 21) {
     $95 = $$06790 + 20 | 0; //@line 953
     HEAP32[$95 >> 2] = (HEAP32[$95 >> 2] | 0) + $93; //@line 956
     $98 = _equeue_tick() | 0; //@line 957
     $ReallocAsyncCtx4 = _emscripten_realloc_async_context(76) | 0; //@line 958
     _equeue_enqueue($14, $$06790, $98) | 0; //@line 959
     if (___async) {
      HEAP32[$ReallocAsyncCtx4 >> 2] = 28; //@line 962
      $99 = $ReallocAsyncCtx4 + 4 | 0; //@line 963
      HEAP32[$99 >> 2] = $2; //@line 964
      $100 = $ReallocAsyncCtx4 + 8 | 0; //@line 965
      HEAP32[$100 >> 2] = $67; //@line 966
      $101 = $ReallocAsyncCtx4 + 12 | 0; //@line 967
      HEAP32[$101 >> 2] = $4; //@line 968
      $102 = $ReallocAsyncCtx4 + 16 | 0; //@line 969
      HEAP32[$102 >> 2] = $6; //@line 970
      $103 = $ReallocAsyncCtx4 + 20 | 0; //@line 971
      HEAP32[$103 >> 2] = $10; //@line 972
      $104 = $ReallocAsyncCtx4 + 24 | 0; //@line 973
      HEAP32[$104 >> 2] = $12; //@line 974
      $105 = $ReallocAsyncCtx4 + 28 | 0; //@line 975
      HEAP32[$105 >> 2] = $14; //@line 976
      $106 = $ReallocAsyncCtx4 + 32 | 0; //@line 977
      HEAP32[$106 >> 2] = $16; //@line 978
      $107 = $ReallocAsyncCtx4 + 36 | 0; //@line 979
      $$expand_i1_val9 = $18 & 1; //@line 980
      HEAP8[$107 >> 0] = $$expand_i1_val9; //@line 981
      $108 = $ReallocAsyncCtx4 + 40 | 0; //@line 982
      HEAP32[$108 >> 2] = $20; //@line 983
      $109 = $ReallocAsyncCtx4 + 44 | 0; //@line 984
      HEAP32[$109 >> 2] = $22; //@line 985
      $110 = $ReallocAsyncCtx4 + 48 | 0; //@line 986
      HEAP32[$110 >> 2] = $24; //@line 987
      $111 = $ReallocAsyncCtx4 + 52 | 0; //@line 988
      HEAP32[$111 >> 2] = $26; //@line 989
      $112 = $ReallocAsyncCtx4 + 56 | 0; //@line 990
      HEAP32[$112 >> 2] = $28; //@line 991
      $113 = $ReallocAsyncCtx4 + 60 | 0; //@line 992
      HEAP32[$113 >> 2] = $30; //@line 993
      $114 = $ReallocAsyncCtx4 + 64 | 0; //@line 994
      HEAP32[$114 >> 2] = $32; //@line 995
      $115 = $ReallocAsyncCtx4 + 68 | 0; //@line 996
      HEAP32[$115 >> 2] = $34; //@line 997
      $116 = $ReallocAsyncCtx4 + 72 | 0; //@line 998
      HEAP32[$116 >> 2] = $36; //@line 999
      sp = STACKTOP; //@line 1000
      return;
     }
     ___async_unwind = 0; //@line 1003
     HEAP32[$ReallocAsyncCtx4 >> 2] = 28; //@line 1004
     $99 = $ReallocAsyncCtx4 + 4 | 0; //@line 1005
     HEAP32[$99 >> 2] = $2; //@line 1006
     $100 = $ReallocAsyncCtx4 + 8 | 0; //@line 1007
     HEAP32[$100 >> 2] = $67; //@line 1008
     $101 = $ReallocAsyncCtx4 + 12 | 0; //@line 1009
     HEAP32[$101 >> 2] = $4; //@line 1010
     $102 = $ReallocAsyncCtx4 + 16 | 0; //@line 1011
     HEAP32[$102 >> 2] = $6; //@line 1012
     $103 = $ReallocAsyncCtx4 + 20 | 0; //@line 1013
     HEAP32[$103 >> 2] = $10; //@line 1014
     $104 = $ReallocAsyncCtx4 + 24 | 0; //@line 1015
     HEAP32[$104 >> 2] = $12; //@line 1016
     $105 = $ReallocAsyncCtx4 + 28 | 0; //@line 1017
     HEAP32[$105 >> 2] = $14; //@line 1018
     $106 = $ReallocAsyncCtx4 + 32 | 0; //@line 1019
     HEAP32[$106 >> 2] = $16; //@line 1020
     $107 = $ReallocAsyncCtx4 + 36 | 0; //@line 1021
     $$expand_i1_val9 = $18 & 1; //@line 1022
     HEAP8[$107 >> 0] = $$expand_i1_val9; //@line 1023
     $108 = $ReallocAsyncCtx4 + 40 | 0; //@line 1024
     HEAP32[$108 >> 2] = $20; //@line 1025
     $109 = $ReallocAsyncCtx4 + 44 | 0; //@line 1026
     HEAP32[$109 >> 2] = $22; //@line 1027
     $110 = $ReallocAsyncCtx4 + 48 | 0; //@line 1028
     HEAP32[$110 >> 2] = $24; //@line 1029
     $111 = $ReallocAsyncCtx4 + 52 | 0; //@line 1030
     HEAP32[$111 >> 2] = $26; //@line 1031
     $112 = $ReallocAsyncCtx4 + 56 | 0; //@line 1032
     HEAP32[$112 >> 2] = $28; //@line 1033
     $113 = $ReallocAsyncCtx4 + 60 | 0; //@line 1034
     HEAP32[$113 >> 2] = $30; //@line 1035
     $114 = $ReallocAsyncCtx4 + 64 | 0; //@line 1036
     HEAP32[$114 >> 2] = $32; //@line 1037
     $115 = $ReallocAsyncCtx4 + 68 | 0; //@line 1038
     HEAP32[$115 >> 2] = $34; //@line 1039
     $116 = $ReallocAsyncCtx4 + 72 | 0; //@line 1040
     HEAP32[$116 >> 2] = $36; //@line 1041
     sp = STACKTOP; //@line 1042
     return;
    } else if ((label | 0) == 25) {
     $ReallocAsyncCtx2 = _emscripten_realloc_async_context(84) | 0; //@line 1047
     FUNCTION_TABLE_vi[$127 & 127]($$06790 + 36 | 0); //@line 1048
     if (___async) {
      HEAP32[$ReallocAsyncCtx2 >> 2] = 29; //@line 1051
      $130 = $ReallocAsyncCtx2 + 4 | 0; //@line 1052
      HEAP32[$130 >> 2] = $2; //@line 1053
      $131 = $ReallocAsyncCtx2 + 8 | 0; //@line 1054
      HEAP32[$131 >> 2] = $$06790; //@line 1055
      $132 = $ReallocAsyncCtx2 + 12 | 0; //@line 1056
      HEAP32[$132 >> 2] = $67; //@line 1057
      $133 = $ReallocAsyncCtx2 + 16 | 0; //@line 1058
      HEAP32[$133 >> 2] = $66; //@line 1059
      $134 = $ReallocAsyncCtx2 + 20 | 0; //@line 1060
      HEAP32[$134 >> 2] = $4; //@line 1061
      $135 = $ReallocAsyncCtx2 + 24 | 0; //@line 1062
      HEAP32[$135 >> 2] = $6; //@line 1063
      $136 = $ReallocAsyncCtx2 + 28 | 0; //@line 1064
      HEAP32[$136 >> 2] = $10; //@line 1065
      $137 = $ReallocAsyncCtx2 + 32 | 0; //@line 1066
      HEAP32[$137 >> 2] = $12; //@line 1067
      $138 = $ReallocAsyncCtx2 + 36 | 0; //@line 1068
      HEAP32[$138 >> 2] = $14; //@line 1069
      $139 = $ReallocAsyncCtx2 + 40 | 0; //@line 1070
      HEAP32[$139 >> 2] = $16; //@line 1071
      $140 = $ReallocAsyncCtx2 + 44 | 0; //@line 1072
      $$expand_i1_val11 = $18 & 1; //@line 1073
      HEAP8[$140 >> 0] = $$expand_i1_val11; //@line 1074
      $141 = $ReallocAsyncCtx2 + 48 | 0; //@line 1075
      HEAP32[$141 >> 2] = $20; //@line 1076
      $142 = $ReallocAsyncCtx2 + 52 | 0; //@line 1077
      HEAP32[$142 >> 2] = $22; //@line 1078
      $143 = $ReallocAsyncCtx2 + 56 | 0; //@line 1079
      HEAP32[$143 >> 2] = $24; //@line 1080
      $144 = $ReallocAsyncCtx2 + 60 | 0; //@line 1081
      HEAP32[$144 >> 2] = $26; //@line 1082
      $145 = $ReallocAsyncCtx2 + 64 | 0; //@line 1083
      HEAP32[$145 >> 2] = $28; //@line 1084
      $146 = $ReallocAsyncCtx2 + 68 | 0; //@line 1085
      HEAP32[$146 >> 2] = $30; //@line 1086
      $147 = $ReallocAsyncCtx2 + 72 | 0; //@line 1087
      HEAP32[$147 >> 2] = $32; //@line 1088
      $148 = $ReallocAsyncCtx2 + 76 | 0; //@line 1089
      HEAP32[$148 >> 2] = $34; //@line 1090
      $149 = $ReallocAsyncCtx2 + 80 | 0; //@line 1091
      HEAP32[$149 >> 2] = $36; //@line 1092
      sp = STACKTOP; //@line 1093
      return;
     }
     ___async_unwind = 0; //@line 1096
     HEAP32[$ReallocAsyncCtx2 >> 2] = 29; //@line 1097
     $130 = $ReallocAsyncCtx2 + 4 | 0; //@line 1098
     HEAP32[$130 >> 2] = $2; //@line 1099
     $131 = $ReallocAsyncCtx2 + 8 | 0; //@line 1100
     HEAP32[$131 >> 2] = $$06790; //@line 1101
     $132 = $ReallocAsyncCtx2 + 12 | 0; //@line 1102
     HEAP32[$132 >> 2] = $67; //@line 1103
     $133 = $ReallocAsyncCtx2 + 16 | 0; //@line 1104
     HEAP32[$133 >> 2] = $66; //@line 1105
     $134 = $ReallocAsyncCtx2 + 20 | 0; //@line 1106
     HEAP32[$134 >> 2] = $4; //@line 1107
     $135 = $ReallocAsyncCtx2 + 24 | 0; //@line 1108
     HEAP32[$135 >> 2] = $6; //@line 1109
     $136 = $ReallocAsyncCtx2 + 28 | 0; //@line 1110
     HEAP32[$136 >> 2] = $10; //@line 1111
     $137 = $ReallocAsyncCtx2 + 32 | 0; //@line 1112
     HEAP32[$137 >> 2] = $12; //@line 1113
     $138 = $ReallocAsyncCtx2 + 36 | 0; //@line 1114
     HEAP32[$138 >> 2] = $14; //@line 1115
     $139 = $ReallocAsyncCtx2 + 40 | 0; //@line 1116
     HEAP32[$139 >> 2] = $16; //@line 1117
     $140 = $ReallocAsyncCtx2 + 44 | 0; //@line 1118
     $$expand_i1_val11 = $18 & 1; //@line 1119
     HEAP8[$140 >> 0] = $$expand_i1_val11; //@line 1120
     $141 = $ReallocAsyncCtx2 + 48 | 0; //@line 1121
     HEAP32[$141 >> 2] = $20; //@line 1122
     $142 = $ReallocAsyncCtx2 + 52 | 0; //@line 1123
     HEAP32[$142 >> 2] = $22; //@line 1124
     $143 = $ReallocAsyncCtx2 + 56 | 0; //@line 1125
     HEAP32[$143 >> 2] = $24; //@line 1126
     $144 = $ReallocAsyncCtx2 + 60 | 0; //@line 1127
     HEAP32[$144 >> 2] = $26; //@line 1128
     $145 = $ReallocAsyncCtx2 + 64 | 0; //@line 1129
     HEAP32[$145 >> 2] = $28; //@line 1130
     $146 = $ReallocAsyncCtx2 + 68 | 0; //@line 1131
     HEAP32[$146 >> 2] = $30; //@line 1132
     $147 = $ReallocAsyncCtx2 + 72 | 0; //@line 1133
     HEAP32[$147 >> 2] = $32; //@line 1134
     $148 = $ReallocAsyncCtx2 + 76 | 0; //@line 1135
     HEAP32[$148 >> 2] = $34; //@line 1136
     $149 = $ReallocAsyncCtx2 + 80 | 0; //@line 1137
     HEAP32[$149 >> 2] = $36; //@line 1138
     sp = STACKTOP; //@line 1139
     return;
    }
   }
  }
 } while (0);
 $165 = _equeue_tick() | 0; //@line 1145
 if ($18) {
  $166 = $16 - $165 | 0; //@line 1147
  if (($166 | 0) < 1) {
   $168 = $14 + 40 | 0; //@line 1150
   if (HEAP32[$168 >> 2] | 0) {
    _equeue_mutex_lock($6); //@line 1154
    $171 = HEAP32[$168 >> 2] | 0; //@line 1155
    if ($171 | 0) {
     $173 = HEAP32[$32 >> 2] | 0; //@line 1158
     if ($173 | 0) {
      $176 = HEAP32[$14 + 44 >> 2] | 0; //@line 1162
      $179 = (HEAP32[$173 + 20 >> 2] | 0) - $165 | 0; //@line 1165
      $ReallocAsyncCtx3 = _emscripten_realloc_async_context(16) | 0; //@line 1169
      FUNCTION_TABLE_vii[$171 & 3]($176, $179 & ~($179 >> 31)); //@line 1170
      if (___async) {
       HEAP32[$ReallocAsyncCtx3 >> 2] = 30; //@line 1173
       $183 = $ReallocAsyncCtx3 + 4 | 0; //@line 1174
       HEAP32[$183 >> 2] = $24; //@line 1175
       $184 = $ReallocAsyncCtx3 + 8 | 0; //@line 1176
       HEAP32[$184 >> 2] = $6; //@line 1177
       $185 = $ReallocAsyncCtx3 + 12 | 0; //@line 1178
       HEAP32[$185 >> 2] = $22; //@line 1179
       sp = STACKTOP; //@line 1180
       return;
      }
      ___async_unwind = 0; //@line 1183
      HEAP32[$ReallocAsyncCtx3 >> 2] = 30; //@line 1184
      $183 = $ReallocAsyncCtx3 + 4 | 0; //@line 1185
      HEAP32[$183 >> 2] = $24; //@line 1186
      $184 = $ReallocAsyncCtx3 + 8 | 0; //@line 1187
      HEAP32[$184 >> 2] = $6; //@line 1188
      $185 = $ReallocAsyncCtx3 + 12 | 0; //@line 1189
      HEAP32[$185 >> 2] = $22; //@line 1190
      sp = STACKTOP; //@line 1191
      return;
     }
    }
    HEAP8[$24 >> 0] = 1; //@line 1195
    _equeue_mutex_unlock($6); //@line 1196
   }
   HEAP8[$22 >> 0] = 0; //@line 1198
   return;
  } else {
   $$065 = $166; //@line 1201
  }
 } else {
  $$065 = -1; //@line 1204
 }
 _equeue_mutex_lock($6); //@line 1206
 $186 = HEAP32[$32 >> 2] | 0; //@line 1207
 if (!$186) {
  $$2 = $$065; //@line 1210
 } else {
  $190 = (HEAP32[$186 + 20 >> 2] | 0) - $165 | 0; //@line 1214
  $193 = $190 & ~($190 >> 31); //@line 1217
  $$2 = $193 >>> 0 < $$065 >>> 0 ? $193 : $$065; //@line 1220
 }
 _equeue_mutex_unlock($6); //@line 1222
 _equeue_sema_wait($34, $$2) | 0; //@line 1223
 do {
  if (HEAP8[$22 >> 0] | 0) {
   _equeue_mutex_lock($6); //@line 1228
   if (!(HEAP8[$22 >> 0] | 0)) {
    _equeue_mutex_unlock($6); //@line 1232
    break;
   }
   HEAP8[$22 >> 0] = 0; //@line 1235
   _equeue_mutex_unlock($6); //@line 1236
   return;
  }
 } while (0);
 $199 = _equeue_tick() | 0; //@line 1240
 $ReallocAsyncCtx5 = _emscripten_realloc_async_context(76) | 0; //@line 1241
 _wait_ms(20); //@line 1242
 if (___async) {
  HEAP32[$ReallocAsyncCtx5 >> 2] = 31; //@line 1245
  $200 = $ReallocAsyncCtx5 + 4 | 0; //@line 1246
  HEAP32[$200 >> 2] = $2; //@line 1247
  $201 = $ReallocAsyncCtx5 + 8 | 0; //@line 1248
  HEAP32[$201 >> 2] = $4; //@line 1249
  $202 = $ReallocAsyncCtx5 + 12 | 0; //@line 1250
  HEAP32[$202 >> 2] = $6; //@line 1251
  $203 = $ReallocAsyncCtx5 + 16 | 0; //@line 1252
  HEAP32[$203 >> 2] = $199; //@line 1253
  $204 = $ReallocAsyncCtx5 + 20 | 0; //@line 1254
  HEAP32[$204 >> 2] = $10; //@line 1255
  $205 = $ReallocAsyncCtx5 + 24 | 0; //@line 1256
  HEAP32[$205 >> 2] = $12; //@line 1257
  $206 = $ReallocAsyncCtx5 + 28 | 0; //@line 1258
  HEAP32[$206 >> 2] = $14; //@line 1259
  $207 = $ReallocAsyncCtx5 + 32 | 0; //@line 1260
  HEAP32[$207 >> 2] = $16; //@line 1261
  $208 = $ReallocAsyncCtx5 + 36 | 0; //@line 1262
  $$expand_i1_val13 = $18 & 1; //@line 1263
  HEAP8[$208 >> 0] = $$expand_i1_val13; //@line 1264
  $209 = $ReallocAsyncCtx5 + 40 | 0; //@line 1265
  HEAP32[$209 >> 2] = $20; //@line 1266
  $210 = $ReallocAsyncCtx5 + 44 | 0; //@line 1267
  HEAP32[$210 >> 2] = $22; //@line 1268
  $211 = $ReallocAsyncCtx5 + 48 | 0; //@line 1269
  HEAP32[$211 >> 2] = $24; //@line 1270
  $212 = $ReallocAsyncCtx5 + 52 | 0; //@line 1271
  HEAP32[$212 >> 2] = $26; //@line 1272
  $213 = $ReallocAsyncCtx5 + 56 | 0; //@line 1273
  HEAP32[$213 >> 2] = $28; //@line 1274
  $214 = $ReallocAsyncCtx5 + 60 | 0; //@line 1275
  HEAP32[$214 >> 2] = $30; //@line 1276
  $215 = $ReallocAsyncCtx5 + 64 | 0; //@line 1277
  HEAP32[$215 >> 2] = $32; //@line 1278
  $216 = $ReallocAsyncCtx5 + 68 | 0; //@line 1279
  HEAP32[$216 >> 2] = $34; //@line 1280
  $217 = $ReallocAsyncCtx5 + 72 | 0; //@line 1281
  HEAP32[$217 >> 2] = $36; //@line 1282
  sp = STACKTOP; //@line 1283
  return;
 }
 ___async_unwind = 0; //@line 1286
 HEAP32[$ReallocAsyncCtx5 >> 2] = 31; //@line 1287
 $200 = $ReallocAsyncCtx5 + 4 | 0; //@line 1288
 HEAP32[$200 >> 2] = $2; //@line 1289
 $201 = $ReallocAsyncCtx5 + 8 | 0; //@line 1290
 HEAP32[$201 >> 2] = $4; //@line 1291
 $202 = $ReallocAsyncCtx5 + 12 | 0; //@line 1292
 HEAP32[$202 >> 2] = $6; //@line 1293
 $203 = $ReallocAsyncCtx5 + 16 | 0; //@line 1294
 HEAP32[$203 >> 2] = $199; //@line 1295
 $204 = $ReallocAsyncCtx5 + 20 | 0; //@line 1296
 HEAP32[$204 >> 2] = $10; //@line 1297
 $205 = $ReallocAsyncCtx5 + 24 | 0; //@line 1298
 HEAP32[$205 >> 2] = $12; //@line 1299
 $206 = $ReallocAsyncCtx5 + 28 | 0; //@line 1300
 HEAP32[$206 >> 2] = $14; //@line 1301
 $207 = $ReallocAsyncCtx5 + 32 | 0; //@line 1302
 HEAP32[$207 >> 2] = $16; //@line 1303
 $208 = $ReallocAsyncCtx5 + 36 | 0; //@line 1304
 $$expand_i1_val13 = $18 & 1; //@line 1305
 HEAP8[$208 >> 0] = $$expand_i1_val13; //@line 1306
 $209 = $ReallocAsyncCtx5 + 40 | 0; //@line 1307
 HEAP32[$209 >> 2] = $20; //@line 1308
 $210 = $ReallocAsyncCtx5 + 44 | 0; //@line 1309
 HEAP32[$210 >> 2] = $22; //@line 1310
 $211 = $ReallocAsyncCtx5 + 48 | 0; //@line 1311
 HEAP32[$211 >> 2] = $24; //@line 1312
 $212 = $ReallocAsyncCtx5 + 52 | 0; //@line 1313
 HEAP32[$212 >> 2] = $26; //@line 1314
 $213 = $ReallocAsyncCtx5 + 56 | 0; //@line 1315
 HEAP32[$213 >> 2] = $28; //@line 1316
 $214 = $ReallocAsyncCtx5 + 60 | 0; //@line 1317
 HEAP32[$214 >> 2] = $30; //@line 1318
 $215 = $ReallocAsyncCtx5 + 64 | 0; //@line 1319
 HEAP32[$215 >> 2] = $32; //@line 1320
 $216 = $ReallocAsyncCtx5 + 68 | 0; //@line 1321
 HEAP32[$216 >> 2] = $34; //@line 1322
 $217 = $ReallocAsyncCtx5 + 72 | 0; //@line 1323
 HEAP32[$217 >> 2] = $36; //@line 1324
 sp = STACKTOP; //@line 1325
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
 sp = STACKTOP; //@line 8171
 STACKTOP = STACKTOP + 560 | 0; //@line 8172
 $6 = sp + 8 | 0; //@line 8173
 $7 = sp; //@line 8174
 $8 = sp + 524 | 0; //@line 8175
 $9 = $8; //@line 8176
 $10 = sp + 512 | 0; //@line 8177
 HEAP32[$7 >> 2] = 0; //@line 8178
 $11 = $10 + 12 | 0; //@line 8179
 ___DOUBLE_BITS_677($1) | 0; //@line 8180
 if ((tempRet0 | 0) < 0) {
  $$0471 = -$1; //@line 8185
  $$0520 = 1; //@line 8185
  $$0521 = 1860; //@line 8185
 } else {
  $$0471 = $1; //@line 8196
  $$0520 = ($4 & 2049 | 0) != 0 & 1; //@line 8196
  $$0521 = ($4 & 2048 | 0) == 0 ? ($4 & 1 | 0) == 0 ? 1861 : 1866 : 1863; //@line 8196
 }
 ___DOUBLE_BITS_677($$0471) | 0; //@line 8198
 do {
  if (0 == 0 & (tempRet0 & 2146435072 | 0) == 2146435072) {
   $27 = ($5 & 32 | 0) != 0; //@line 8207
   $31 = $$0520 + 3 | 0; //@line 8212
   _pad_676($0, 32, $2, $31, $4 & -65537); //@line 8214
   _out_670($0, $$0521, $$0520); //@line 8215
   _out_670($0, $$0471 != $$0471 | 0.0 != 0.0 ? $27 ? 1887 : 1891 : $27 ? 1879 : 1883, 3); //@line 8216
   _pad_676($0, 32, $2, $31, $4 ^ 8192); //@line 8218
   $$sink560 = $31; //@line 8219
  } else {
   $35 = +_frexpl($$0471, $7) * 2.0; //@line 8222
   $36 = $35 != 0.0; //@line 8223
   if ($36) {
    HEAP32[$7 >> 2] = (HEAP32[$7 >> 2] | 0) + -1; //@line 8227
   }
   $39 = $5 | 32; //@line 8229
   if (($39 | 0) == 97) {
    $41 = $5 & 32; //@line 8232
    $$0521$ = ($41 | 0) == 0 ? $$0521 : $$0521 + 9 | 0; //@line 8235
    $44 = $$0520 | 2; //@line 8236
    $46 = 12 - $3 | 0; //@line 8238
    do {
     if ($3 >>> 0 > 11 | ($46 | 0) == 0) {
      $$1472 = $35; //@line 8243
     } else {
      $$0509585 = 8.0; //@line 8245
      $$1508586 = $46; //@line 8245
      do {
       $$1508586 = $$1508586 + -1 | 0; //@line 8247
       $$0509585 = $$0509585 * 16.0; //@line 8248
      } while (($$1508586 | 0) != 0);
      if ((HEAP8[$$0521$ >> 0] | 0) == 45) {
       $$1472 = -($$0509585 + (-$35 - $$0509585)); //@line 8263
       break;
      } else {
       $$1472 = $35 + $$0509585 - $$0509585; //@line 8268
       break;
      }
     }
    } while (0);
    $60 = HEAP32[$7 >> 2] | 0; //@line 8273
    $63 = ($60 | 0) < 0 ? 0 - $60 | 0 : $60; //@line 8276
    $66 = _fmt_u($63, (($63 | 0) < 0) << 31 >> 31, $11) | 0; //@line 8279
    if (($66 | 0) == ($11 | 0)) {
     $68 = $10 + 11 | 0; //@line 8282
     HEAP8[$68 >> 0] = 48; //@line 8283
     $$0511 = $68; //@line 8284
    } else {
     $$0511 = $66; //@line 8286
    }
    HEAP8[$$0511 + -1 >> 0] = ($60 >> 31 & 2) + 43; //@line 8293
    $76 = $$0511 + -2 | 0; //@line 8296
    HEAP8[$76 >> 0] = $5 + 15; //@line 8297
    $77 = ($3 | 0) < 1; //@line 8298
    $79 = ($4 & 8 | 0) == 0; //@line 8300
    $$0523 = $8; //@line 8301
    $$2473 = $$1472; //@line 8301
    while (1) {
     $80 = ~~$$2473; //@line 8303
     $86 = $$0523 + 1 | 0; //@line 8309
     HEAP8[$$0523 >> 0] = $41 | HEAPU8[1895 + $80 >> 0]; //@line 8310
     $$2473 = ($$2473 - +($80 | 0)) * 16.0; //@line 8313
     if (($86 - $9 | 0) == 1) {
      if ($79 & ($77 & $$2473 == 0.0)) {
       $$1524 = $86; //@line 8322
      } else {
       HEAP8[$86 >> 0] = 46; //@line 8325
       $$1524 = $$0523 + 2 | 0; //@line 8326
      }
     } else {
      $$1524 = $86; //@line 8329
     }
     if (!($$2473 != 0.0)) {
      break;
     } else {
      $$0523 = $$1524; //@line 8333
     }
    }
    $$pre693 = $$1524; //@line 8339
    if (!$3) {
     label = 24; //@line 8341
    } else {
     if ((-2 - $9 + $$pre693 | 0) < ($3 | 0)) {
      $$pre$phi691Z2D = $$pre693 - $9 | 0; //@line 8349
      $$sink = $3 + 2 | 0; //@line 8349
     } else {
      label = 24; //@line 8351
     }
    }
    if ((label | 0) == 24) {
     $101 = $$pre693 - $9 | 0; //@line 8355
     $$pre$phi691Z2D = $101; //@line 8356
     $$sink = $101; //@line 8356
    }
    $104 = $11 - $76 | 0; //@line 8360
    $106 = $104 + $44 + $$sink | 0; //@line 8362
    _pad_676($0, 32, $2, $106, $4); //@line 8363
    _out_670($0, $$0521$, $44); //@line 8364
    _pad_676($0, 48, $2, $106, $4 ^ 65536); //@line 8366
    _out_670($0, $8, $$pre$phi691Z2D); //@line 8367
    _pad_676($0, 48, $$sink - $$pre$phi691Z2D | 0, 0, 0); //@line 8369
    _out_670($0, $76, $104); //@line 8370
    _pad_676($0, 32, $2, $106, $4 ^ 8192); //@line 8372
    $$sink560 = $106; //@line 8373
    break;
   }
   $$540 = ($3 | 0) < 0 ? 6 : $3; //@line 8377
   if ($36) {
    $113 = (HEAP32[$7 >> 2] | 0) + -28 | 0; //@line 8381
    HEAP32[$7 >> 2] = $113; //@line 8382
    $$3 = $35 * 268435456.0; //@line 8383
    $$pr = $113; //@line 8383
   } else {
    $$3 = $35; //@line 8386
    $$pr = HEAP32[$7 >> 2] | 0; //@line 8386
   }
   $$561 = ($$pr | 0) < 0 ? $6 : $6 + 288 | 0; //@line 8390
   $$0498 = $$561; //@line 8391
   $$4 = $$3; //@line 8391
   do {
    $116 = ~~$$4 >>> 0; //@line 8393
    HEAP32[$$0498 >> 2] = $116; //@line 8394
    $$0498 = $$0498 + 4 | 0; //@line 8395
    $$4 = ($$4 - +($116 >>> 0)) * 1.0e9; //@line 8398
   } while ($$4 != 0.0);
   if (($$pr | 0) > 0) {
    $$1482663 = $$561; //@line 8408
    $$1499662 = $$0498; //@line 8408
    $124 = $$pr; //@line 8408
    while (1) {
     $125 = ($124 | 0) < 29 ? $124 : 29; //@line 8411
     $$0488655 = $$1499662 + -4 | 0; //@line 8412
     if ($$0488655 >>> 0 < $$1482663 >>> 0) {
      $$2483$ph = $$1482663; //@line 8415
     } else {
      $$0488657 = $$0488655; //@line 8417
      $$0497656 = 0; //@line 8417
      do {
       $128 = _bitshift64Shl(HEAP32[$$0488657 >> 2] | 0, 0, $125 | 0) | 0; //@line 8420
       $130 = _i64Add($128 | 0, tempRet0 | 0, $$0497656 | 0, 0) | 0; //@line 8422
       $131 = tempRet0; //@line 8423
       $132 = ___uremdi3($130 | 0, $131 | 0, 1e9, 0) | 0; //@line 8424
       HEAP32[$$0488657 >> 2] = $132; //@line 8426
       $$0497656 = ___udivdi3($130 | 0, $131 | 0, 1e9, 0) | 0; //@line 8427
       $$0488657 = $$0488657 + -4 | 0; //@line 8429
      } while ($$0488657 >>> 0 >= $$1482663 >>> 0);
      if (!$$0497656) {
       $$2483$ph = $$1482663; //@line 8439
      } else {
       $138 = $$1482663 + -4 | 0; //@line 8441
       HEAP32[$138 >> 2] = $$0497656; //@line 8442
       $$2483$ph = $138; //@line 8443
      }
     }
     $$2500 = $$1499662; //@line 8446
     while (1) {
      if ($$2500 >>> 0 <= $$2483$ph >>> 0) {
       break;
      }
      $140 = $$2500 + -4 | 0; //@line 8452
      if (!(HEAP32[$140 >> 2] | 0)) {
       $$2500 = $140; //@line 8456
      } else {
       break;
      }
     }
     $144 = (HEAP32[$7 >> 2] | 0) - $125 | 0; //@line 8462
     HEAP32[$7 >> 2] = $144; //@line 8463
     if (($144 | 0) > 0) {
      $$1482663 = $$2483$ph; //@line 8466
      $$1499662 = $$2500; //@line 8466
      $124 = $144; //@line 8466
     } else {
      $$1482$lcssa = $$2483$ph; //@line 8468
      $$1499$lcssa = $$2500; //@line 8468
      $$pr566 = $144; //@line 8468
      break;
     }
    }
   } else {
    $$1482$lcssa = $$561; //@line 8473
    $$1499$lcssa = $$0498; //@line 8473
    $$pr566 = $$pr; //@line 8473
   }
   if (($$pr566 | 0) < 0) {
    $149 = (($$540 + 25 | 0) / 9 | 0) + 1 | 0; //@line 8479
    $150 = ($39 | 0) == 102; //@line 8480
    $$3484650 = $$1482$lcssa; //@line 8481
    $$3501649 = $$1499$lcssa; //@line 8481
    $152 = $$pr566; //@line 8481
    while (1) {
     $151 = 0 - $152 | 0; //@line 8483
     $154 = ($151 | 0) < 9 ? $151 : 9; //@line 8485
     if ($$3484650 >>> 0 < $$3501649 >>> 0) {
      $160 = (1 << $154) + -1 | 0; //@line 8489
      $161 = 1e9 >>> $154; //@line 8490
      $$0487644 = 0; //@line 8491
      $$1489643 = $$3484650; //@line 8491
      do {
       $162 = HEAP32[$$1489643 >> 2] | 0; //@line 8493
       HEAP32[$$1489643 >> 2] = ($162 >>> $154) + $$0487644; //@line 8497
       $$0487644 = Math_imul($162 & $160, $161) | 0; //@line 8498
       $$1489643 = $$1489643 + 4 | 0; //@line 8499
      } while ($$1489643 >>> 0 < $$3501649 >>> 0);
      $$$3484 = (HEAP32[$$3484650 >> 2] | 0) == 0 ? $$3484650 + 4 | 0 : $$3484650; //@line 8510
      if (!$$0487644) {
       $$$3484700 = $$$3484; //@line 8513
       $$4502 = $$3501649; //@line 8513
      } else {
       HEAP32[$$3501649 >> 2] = $$0487644; //@line 8516
       $$$3484700 = $$$3484; //@line 8517
       $$4502 = $$3501649 + 4 | 0; //@line 8517
      }
     } else {
      $$$3484700 = (HEAP32[$$3484650 >> 2] | 0) == 0 ? $$3484650 + 4 | 0 : $$3484650; //@line 8524
      $$4502 = $$3501649; //@line 8524
     }
     $174 = $150 ? $$561 : $$$3484700; //@line 8526
     $$$4502 = ($$4502 - $174 >> 2 | 0) > ($149 | 0) ? $174 + ($149 << 2) | 0 : $$4502; //@line 8533
     $152 = (HEAP32[$7 >> 2] | 0) + $154 | 0; //@line 8535
     HEAP32[$7 >> 2] = $152; //@line 8536
     if (($152 | 0) >= 0) {
      $$3484$lcssa = $$$3484700; //@line 8541
      $$3501$lcssa = $$$4502; //@line 8541
      break;
     } else {
      $$3484650 = $$$3484700; //@line 8539
      $$3501649 = $$$4502; //@line 8539
     }
    }
   } else {
    $$3484$lcssa = $$1482$lcssa; //@line 8546
    $$3501$lcssa = $$1499$lcssa; //@line 8546
   }
   $185 = $$561; //@line 8549
   if ($$3484$lcssa >>> 0 < $$3501$lcssa >>> 0) {
    $189 = ($185 - $$3484$lcssa >> 2) * 9 | 0; //@line 8554
    $190 = HEAP32[$$3484$lcssa >> 2] | 0; //@line 8555
    if ($190 >>> 0 < 10) {
     $$1515 = $189; //@line 8558
    } else {
     $$0514639 = $189; //@line 8560
     $$0530638 = 10; //@line 8560
     while (1) {
      $$0530638 = $$0530638 * 10 | 0; //@line 8562
      $193 = $$0514639 + 1 | 0; //@line 8563
      if ($190 >>> 0 < $$0530638 >>> 0) {
       $$1515 = $193; //@line 8566
       break;
      } else {
       $$0514639 = $193; //@line 8569
      }
     }
    }
   } else {
    $$1515 = 0; //@line 8574
   }
   $198 = ($39 | 0) == 103; //@line 8579
   $199 = ($$540 | 0) != 0; //@line 8580
   $201 = $$540 - (($39 | 0) != 102 ? $$1515 : 0) + (($199 & $198) << 31 >> 31) | 0; //@line 8583
   if (($201 | 0) < ((($$3501$lcssa - $185 >> 2) * 9 | 0) + -9 | 0)) {
    $209 = $201 + 9216 | 0; //@line 8592
    $212 = $$561 + 4 + ((($209 | 0) / 9 | 0) + -1024 << 2) | 0; //@line 8595
    $213 = ($209 | 0) % 9 | 0; //@line 8596
    if (($213 | 0) < 8) {
     $$0527$in633 = $213; //@line 8599
     $$1531632 = 10; //@line 8599
     while (1) {
      $215 = $$1531632 * 10 | 0; //@line 8602
      if (($$0527$in633 | 0) < 7) {
       $$0527$in633 = $$0527$in633 + 1 | 0; //@line 8605
       $$1531632 = $215; //@line 8605
      } else {
       $$1531$lcssa = $215; //@line 8607
       break;
      }
     }
    } else {
     $$1531$lcssa = 10; //@line 8612
    }
    $217 = HEAP32[$212 >> 2] | 0; //@line 8614
    $218 = ($217 >>> 0) % ($$1531$lcssa >>> 0) | 0; //@line 8615
    $221 = ($212 + 4 | 0) == ($$3501$lcssa | 0); //@line 8618
    if ($221 & ($218 | 0) == 0) {
     $$4492 = $212; //@line 8621
     $$4518 = $$1515; //@line 8621
     $$8 = $$3484$lcssa; //@line 8621
    } else {
     $$543 = ((($217 >>> 0) / ($$1531$lcssa >>> 0) | 0) & 1 | 0) == 0 ? 9007199254740992.0 : 9007199254740994.0; //@line 8626
     $225 = ($$1531$lcssa | 0) / 2 | 0; //@line 8627
     $$$564 = $218 >>> 0 < $225 >>> 0 ? .5 : $221 & ($218 | 0) == ($225 | 0) ? 1.0 : 1.5; //@line 8632
     if (!$$0520) {
      $$1467 = $$$564; //@line 8635
      $$1469 = $$543; //@line 8635
     } else {
      $230 = (HEAP8[$$0521 >> 0] | 0) == 45; //@line 8638
      $$1467 = $230 ? -$$$564 : $$$564; //@line 8643
      $$1469 = $230 ? -$$543 : $$543; //@line 8643
     }
     $233 = $217 - $218 | 0; //@line 8645
     HEAP32[$212 >> 2] = $233; //@line 8646
     if ($$1469 + $$1467 != $$1469) {
      $236 = $233 + $$1531$lcssa | 0; //@line 8650
      HEAP32[$212 >> 2] = $236; //@line 8651
      if ($236 >>> 0 > 999999999) {
       $$5486626 = $$3484$lcssa; //@line 8654
       $$sink547625 = $212; //@line 8654
       while (1) {
        $238 = $$sink547625 + -4 | 0; //@line 8656
        HEAP32[$$sink547625 >> 2] = 0; //@line 8657
        if ($238 >>> 0 < $$5486626 >>> 0) {
         $240 = $$5486626 + -4 | 0; //@line 8660
         HEAP32[$240 >> 2] = 0; //@line 8661
         $$6 = $240; //@line 8662
        } else {
         $$6 = $$5486626; //@line 8664
        }
        $242 = (HEAP32[$238 >> 2] | 0) + 1 | 0; //@line 8667
        HEAP32[$238 >> 2] = $242; //@line 8668
        if ($242 >>> 0 > 999999999) {
         $$5486626 = $$6; //@line 8671
         $$sink547625 = $238; //@line 8671
        } else {
         $$5486$lcssa = $$6; //@line 8673
         $$sink547$lcssa = $238; //@line 8673
         break;
        }
       }
      } else {
       $$5486$lcssa = $$3484$lcssa; //@line 8678
       $$sink547$lcssa = $212; //@line 8678
      }
      $247 = ($185 - $$5486$lcssa >> 2) * 9 | 0; //@line 8683
      $248 = HEAP32[$$5486$lcssa >> 2] | 0; //@line 8684
      if ($248 >>> 0 < 10) {
       $$4492 = $$sink547$lcssa; //@line 8687
       $$4518 = $247; //@line 8687
       $$8 = $$5486$lcssa; //@line 8687
      } else {
       $$2516621 = $247; //@line 8689
       $$2532620 = 10; //@line 8689
       while (1) {
        $$2532620 = $$2532620 * 10 | 0; //@line 8691
        $251 = $$2516621 + 1 | 0; //@line 8692
        if ($248 >>> 0 < $$2532620 >>> 0) {
         $$4492 = $$sink547$lcssa; //@line 8695
         $$4518 = $251; //@line 8695
         $$8 = $$5486$lcssa; //@line 8695
         break;
        } else {
         $$2516621 = $251; //@line 8698
        }
       }
      }
     } else {
      $$4492 = $212; //@line 8703
      $$4518 = $$1515; //@line 8703
      $$8 = $$3484$lcssa; //@line 8703
     }
    }
    $253 = $$4492 + 4 | 0; //@line 8706
    $$5519$ph = $$4518; //@line 8709
    $$7505$ph = $$3501$lcssa >>> 0 > $253 >>> 0 ? $253 : $$3501$lcssa; //@line 8709
    $$9$ph = $$8; //@line 8709
   } else {
    $$5519$ph = $$1515; //@line 8711
    $$7505$ph = $$3501$lcssa; //@line 8711
    $$9$ph = $$3484$lcssa; //@line 8711
   }
   $$7505 = $$7505$ph; //@line 8713
   while (1) {
    if ($$7505 >>> 0 <= $$9$ph >>> 0) {
     $$lcssa675 = 0; //@line 8717
     break;
    }
    $256 = $$7505 + -4 | 0; //@line 8720
    if (!(HEAP32[$256 >> 2] | 0)) {
     $$7505 = $256; //@line 8724
    } else {
     $$lcssa675 = 1; //@line 8726
     break;
    }
   }
   $259 = 0 - $$5519$ph | 0; //@line 8730
   do {
    if ($198) {
     $$540$ = $$540 + (($199 ^ 1) & 1) | 0; //@line 8735
     if (($$540$ | 0) > ($$5519$ph | 0) & ($$5519$ph | 0) > -5) {
      $$0479 = $5 + -1 | 0; //@line 8743
      $$2476 = $$540$ + -1 - $$5519$ph | 0; //@line 8743
     } else {
      $$0479 = $5 + -2 | 0; //@line 8747
      $$2476 = $$540$ + -1 | 0; //@line 8747
     }
     $267 = $4 & 8; //@line 8749
     if (!$267) {
      if ($$lcssa675) {
       $270 = HEAP32[$$7505 + -4 >> 2] | 0; //@line 8754
       if (!$270) {
        $$2529 = 9; //@line 8757
       } else {
        if (!(($270 >>> 0) % 10 | 0)) {
         $$1528617 = 0; //@line 8762
         $$3533616 = 10; //@line 8762
         while (1) {
          $$3533616 = $$3533616 * 10 | 0; //@line 8764
          $275 = $$1528617 + 1 | 0; //@line 8765
          if (($270 >>> 0) % ($$3533616 >>> 0) | 0 | 0) {
           $$2529 = $275; //@line 8771
           break;
          } else {
           $$1528617 = $275; //@line 8769
          }
         }
        } else {
         $$2529 = 0; //@line 8776
        }
       }
      } else {
       $$2529 = 9; //@line 8780
      }
      $284 = (($$7505 - $185 >> 2) * 9 | 0) + -9 | 0; //@line 8788
      if (($$0479 | 32 | 0) == 102) {
       $285 = $284 - $$2529 | 0; //@line 8790
       $$548 = ($285 | 0) > 0 ? $285 : 0; //@line 8792
       $$1480 = $$0479; //@line 8795
       $$3477 = ($$2476 | 0) < ($$548 | 0) ? $$2476 : $$548; //@line 8795
       $$pre$phi698Z2D = 0; //@line 8795
       break;
      } else {
       $289 = $284 + $$5519$ph - $$2529 | 0; //@line 8799
       $$550 = ($289 | 0) > 0 ? $289 : 0; //@line 8801
       $$1480 = $$0479; //@line 8804
       $$3477 = ($$2476 | 0) < ($$550 | 0) ? $$2476 : $$550; //@line 8804
       $$pre$phi698Z2D = 0; //@line 8804
       break;
      }
     } else {
      $$1480 = $$0479; //@line 8808
      $$3477 = $$2476; //@line 8808
      $$pre$phi698Z2D = $267; //@line 8808
     }
    } else {
     $$1480 = $5; //@line 8812
     $$3477 = $$540; //@line 8812
     $$pre$phi698Z2D = $4 & 8; //@line 8812
    }
   } while (0);
   $292 = $$3477 | $$pre$phi698Z2D; //@line 8815
   $294 = ($292 | 0) != 0 & 1; //@line 8817
   $296 = ($$1480 | 32 | 0) == 102; //@line 8819
   if ($296) {
    $$2513 = 0; //@line 8823
    $$pn = ($$5519$ph | 0) > 0 ? $$5519$ph : 0; //@line 8823
   } else {
    $300 = ($$5519$ph | 0) < 0 ? $259 : $$5519$ph; //@line 8826
    $303 = _fmt_u($300, (($300 | 0) < 0) << 31 >> 31, $11) | 0; //@line 8829
    $304 = $11; //@line 8830
    if (($304 - $303 | 0) < 2) {
     $$1512610 = $303; //@line 8835
     while (1) {
      $308 = $$1512610 + -1 | 0; //@line 8837
      HEAP8[$308 >> 0] = 48; //@line 8838
      if (($304 - $308 | 0) < 2) {
       $$1512610 = $308; //@line 8843
      } else {
       $$1512$lcssa = $308; //@line 8845
       break;
      }
     }
    } else {
     $$1512$lcssa = $303; //@line 8850
    }
    HEAP8[$$1512$lcssa + -1 >> 0] = ($$5519$ph >> 31 & 2) + 43; //@line 8857
    $318 = $$1512$lcssa + -2 | 0; //@line 8859
    HEAP8[$318 >> 0] = $$1480; //@line 8860
    $$2513 = $318; //@line 8863
    $$pn = $304 - $318 | 0; //@line 8863
   }
   $323 = $$0520 + 1 + $$3477 + $294 + $$pn | 0; //@line 8868
   _pad_676($0, 32, $2, $323, $4); //@line 8869
   _out_670($0, $$0521, $$0520); //@line 8870
   _pad_676($0, 48, $2, $323, $4 ^ 65536); //@line 8872
   if ($296) {
    $$0496$$9 = $$9$ph >>> 0 > $$561 >>> 0 ? $$561 : $$9$ph; //@line 8875
    $326 = $8 + 9 | 0; //@line 8876
    $327 = $326; //@line 8877
    $328 = $8 + 8 | 0; //@line 8878
    $$5493600 = $$0496$$9; //@line 8879
    do {
     $330 = _fmt_u(HEAP32[$$5493600 >> 2] | 0, 0, $326) | 0; //@line 8882
     if (($$5493600 | 0) == ($$0496$$9 | 0)) {
      if (($330 | 0) == ($326 | 0)) {
       HEAP8[$328 >> 0] = 48; //@line 8887
       $$1465 = $328; //@line 8888
      } else {
       $$1465 = $330; //@line 8890
      }
     } else {
      if ($330 >>> 0 > $8 >>> 0) {
       _memset($8 | 0, 48, $330 - $9 | 0) | 0; //@line 8897
       $$0464597 = $330; //@line 8898
       while (1) {
        $335 = $$0464597 + -1 | 0; //@line 8900
        if ($335 >>> 0 > $8 >>> 0) {
         $$0464597 = $335; //@line 8903
        } else {
         $$1465 = $335; //@line 8905
         break;
        }
       }
      } else {
       $$1465 = $330; //@line 8910
      }
     }
     _out_670($0, $$1465, $327 - $$1465 | 0); //@line 8915
     $$5493600 = $$5493600 + 4 | 0; //@line 8916
    } while ($$5493600 >>> 0 <= $$561 >>> 0);
    if ($292 | 0) {
     _out_670($0, 1911, 1); //@line 8926
    }
    if ($$5493600 >>> 0 < $$7505 >>> 0 & ($$3477 | 0) > 0) {
     $$4478593 = $$3477; //@line 8932
     $$6494592 = $$5493600; //@line 8932
     while (1) {
      $347 = _fmt_u(HEAP32[$$6494592 >> 2] | 0, 0, $326) | 0; //@line 8935
      if ($347 >>> 0 > $8 >>> 0) {
       _memset($8 | 0, 48, $347 - $9 | 0) | 0; //@line 8940
       $$0463587 = $347; //@line 8941
       while (1) {
        $351 = $$0463587 + -1 | 0; //@line 8943
        if ($351 >>> 0 > $8 >>> 0) {
         $$0463587 = $351; //@line 8946
        } else {
         $$0463$lcssa = $351; //@line 8948
         break;
        }
       }
      } else {
       $$0463$lcssa = $347; //@line 8953
      }
      _out_670($0, $$0463$lcssa, ($$4478593 | 0) < 9 ? $$4478593 : 9); //@line 8957
      $$6494592 = $$6494592 + 4 | 0; //@line 8958
      $356 = $$4478593 + -9 | 0; //@line 8959
      if (!($$6494592 >>> 0 < $$7505 >>> 0 & ($$4478593 | 0) > 9)) {
       $$4478$lcssa = $356; //@line 8966
       break;
      } else {
       $$4478593 = $356; //@line 8964
      }
     }
    } else {
     $$4478$lcssa = $$3477; //@line 8971
    }
    _pad_676($0, 48, $$4478$lcssa + 9 | 0, 9, 0); //@line 8974
   } else {
    $$7505$ = $$lcssa675 ? $$7505 : $$9$ph + 4 | 0; //@line 8977
    if (($$3477 | 0) > -1) {
     $363 = $8 + 9 | 0; //@line 8980
     $364 = ($$pre$phi698Z2D | 0) == 0; //@line 8981
     $365 = $363; //@line 8982
     $366 = 0 - $9 | 0; //@line 8983
     $367 = $8 + 8 | 0; //@line 8984
     $$5605 = $$3477; //@line 8985
     $$7495604 = $$9$ph; //@line 8985
     while (1) {
      $369 = _fmt_u(HEAP32[$$7495604 >> 2] | 0, 0, $363) | 0; //@line 8988
      if (($369 | 0) == ($363 | 0)) {
       HEAP8[$367 >> 0] = 48; //@line 8991
       $$0 = $367; //@line 8992
      } else {
       $$0 = $369; //@line 8994
      }
      do {
       if (($$7495604 | 0) == ($$9$ph | 0)) {
        $375 = $$0 + 1 | 0; //@line 8999
        _out_670($0, $$0, 1); //@line 9000
        if ($364 & ($$5605 | 0) < 1) {
         $$2 = $375; //@line 9004
         break;
        }
        _out_670($0, 1911, 1); //@line 9007
        $$2 = $375; //@line 9008
       } else {
        if ($$0 >>> 0 <= $8 >>> 0) {
         $$2 = $$0; //@line 9012
         break;
        }
        _memset($8 | 0, 48, $$0 + $366 | 0) | 0; //@line 9017
        $$1601 = $$0; //@line 9018
        while (1) {
         $373 = $$1601 + -1 | 0; //@line 9020
         if ($373 >>> 0 > $8 >>> 0) {
          $$1601 = $373; //@line 9023
         } else {
          $$2 = $373; //@line 9025
          break;
         }
        }
       }
      } while (0);
      $378 = $365 - $$2 | 0; //@line 9032
      _out_670($0, $$2, ($$5605 | 0) > ($378 | 0) ? $378 : $$5605); //@line 9035
      $381 = $$5605 - $378 | 0; //@line 9036
      $$7495604 = $$7495604 + 4 | 0; //@line 9037
      if (!($$7495604 >>> 0 < $$7505$ >>> 0 & ($381 | 0) > -1)) {
       $$5$lcssa = $381; //@line 9044
       break;
      } else {
       $$5605 = $381; //@line 9042
      }
     }
    } else {
     $$5$lcssa = $$3477; //@line 9049
    }
    _pad_676($0, 48, $$5$lcssa + 18 | 0, 18, 0); //@line 9052
    _out_670($0, $$2513, $11 - $$2513 | 0); //@line 9056
   }
   _pad_676($0, 32, $2, $323, $4 ^ 8192); //@line 9059
   $$sink560 = $323; //@line 9060
  }
 } while (0);
 STACKTOP = sp; //@line 9065
 return (($$sink560 | 0) < ($2 | 0) ? $2 : $$sink560) | 0; //@line 9065
}
function _equeue_dispatch__async_cb($0) {
 $0 = $0 | 0;
 var $$02329$i$i = 0, $$02330$i$i = 0, $$025$i$i = 0, $$065 = 0, $$06790$reg2mem$0 = 0, $$06790$reg2mem$0$phi = 0, $$2 = 0, $$expand_i1_val = 0, $$expand_i1_val31 = 0, $$expand_i1_val33 = 0, $$expand_i1_val35 = 0, $$reg2mem$0 = 0, $$reg2mem24$0 = 0, $$sink$in$i$i = 0, $10 = 0, $102 = 0, $105 = 0, $106 = 0, $107 = 0, $108 = 0, $109 = 0, $110 = 0, $111 = 0, $112 = 0, $113 = 0, $114 = 0, $115 = 0, $116 = 0, $117 = 0, $118 = 0, $119 = 0, $12 = 0, $120 = 0, $121 = 0, $122 = 0, $123 = 0, $124 = 0, $125 = 0, $127 = 0, $128 = 0, $129 = 0, $131 = 0, $132 = 0, $14 = 0, $140 = 0, $141 = 0, $143 = 0, $146 = 0, $148 = 0, $151 = 0, $154 = 0, $158 = 0, $159 = 0, $16 = 0, $160 = 0, $161 = 0, $165 = 0, $168 = 0, $174 = 0, $175 = 0, $176 = 0, $177 = 0, $178 = 0, $179 = 0, $18 = 0, $180 = 0, $181 = 0, $182 = 0, $183 = 0, $184 = 0, $185 = 0, $186 = 0, $187 = 0, $188 = 0, $189 = 0, $190 = 0, $191 = 0, $192 = 0, $2 = 0, $20 = 0, $22 = 0, $24 = 0, $26 = 0, $28 = 0, $30 = 0, $32 = 0, $34 = 0, $36 = 0, $38 = 0, $40 = 0, $41 = 0, $42 = 0, $44 = 0, $47 = 0, $48 = 0, $49 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0, $68 = 0, $70 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $78 = 0, $79 = 0, $80 = 0, $81 = 0, $82 = 0, $83 = 0, $84 = 0, $85 = 0, $86 = 0, $87 = 0, $88 = 0, $89 = 0, $90 = 0, $91 = 0, $92 = 0, $93 = 0, $ReallocAsyncCtx = 0, $ReallocAsyncCtx2 = 0, $ReallocAsyncCtx3 = 0, $ReallocAsyncCtx4 = 0, $ReallocAsyncCtx5 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 12470
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 12472
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 12480
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 12482
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 12484
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 12486
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 12488
 $20 = HEAP32[$0 + 40 >> 2] | 0; //@line 12490
 $22 = HEAP8[$0 + 44 >> 0] & 1; //@line 12493
 $24 = HEAP32[$0 + 48 >> 2] | 0; //@line 12495
 $26 = HEAP32[$0 + 52 >> 2] | 0; //@line 12497
 $28 = HEAP32[$0 + 56 >> 2] | 0; //@line 12499
 $30 = HEAP32[$0 + 60 >> 2] | 0; //@line 12501
 $32 = HEAP32[$0 + 64 >> 2] | 0; //@line 12503
 $34 = HEAP32[$0 + 68 >> 2] | 0; //@line 12505
 $36 = HEAP32[$0 + 72 >> 2] | 0; //@line 12507
 $38 = HEAP32[$0 + 76 >> 2] | 0; //@line 12509
 $40 = HEAP32[$0 + 80 >> 2] | 0; //@line 12511
 $$06790$reg2mem$0 = HEAP32[$0 + 8 >> 2] | 0; //@line 12512
 $$reg2mem$0 = HEAP32[$0 + 12 >> 2] | 0; //@line 12512
 $$reg2mem24$0 = HEAP32[$0 + 16 >> 2] | 0; //@line 12512
 while (1) {
  $68 = HEAP32[$$06790$reg2mem$0 + 24 >> 2] | 0; //@line 12515
  if (($68 | 0) > -1) {
   label = 8; //@line 12518
   break;
  }
  $92 = $$06790$reg2mem$0 + 4 | 0; //@line 12522
  $93 = HEAP8[$92 >> 0] | 0; //@line 12523
  HEAP8[$92 >> 0] = (($93 + 1 & 255) << HEAP32[$40 >> 2] | 0) == 0 ? 1 : ($93 & 255) + 1 & 255; //@line 12532
  $102 = HEAP32[$$06790$reg2mem$0 + 28 >> 2] | 0; //@line 12534
  if ($102 | 0) {
   label = 12; //@line 12537
   break;
  }
  _equeue_mutex_lock($10); //@line 12540
  $125 = HEAP32[$2 >> 2] | 0; //@line 12541
  L6 : do {
   if (!$125) {
    $$02329$i$i = $2; //@line 12545
    label = 21; //@line 12546
   } else {
    $127 = HEAP32[$$06790$reg2mem$0 >> 2] | 0; //@line 12548
    $$025$i$i = $2; //@line 12549
    $129 = $125; //@line 12549
    while (1) {
     $128 = HEAP32[$129 >> 2] | 0; //@line 12551
     if ($128 >>> 0 >= $127 >>> 0) {
      break;
     }
     $131 = $129 + 8 | 0; //@line 12556
     $132 = HEAP32[$131 >> 2] | 0; //@line 12557
     if (!$132) {
      $$02329$i$i = $131; //@line 12560
      label = 21; //@line 12561
      break L6;
     } else {
      $$025$i$i = $131; //@line 12564
      $129 = $132; //@line 12564
     }
    }
    if (($128 | 0) == ($127 | 0)) {
     HEAP32[$$06790$reg2mem$0 + 12 >> 2] = $129; //@line 12570
     $$02330$i$i = $$025$i$i; //@line 12573
     $$sink$in$i$i = (HEAP32[$$025$i$i >> 2] | 0) + 8 | 0; //@line 12573
    } else {
     $$02329$i$i = $$025$i$i; //@line 12575
     label = 21; //@line 12576
    }
   }
  } while (0);
  if ((label | 0) == 21) {
   label = 0; //@line 12581
   HEAP32[$$06790$reg2mem$0 + 12 >> 2] = 0; //@line 12583
   $$02330$i$i = $$02329$i$i; //@line 12584
   $$sink$in$i$i = $$02329$i$i; //@line 12584
  }
  HEAP32[$$reg2mem24$0 >> 2] = HEAP32[$$sink$in$i$i >> 2]; //@line 12587
  HEAP32[$$02330$i$i >> 2] = $$06790$reg2mem$0; //@line 12588
  _equeue_mutex_unlock($10); //@line 12589
  if (!$$reg2mem$0) {
   label = 24; //@line 12592
   break;
  }
  $41 = $$reg2mem$0 + 8 | 0; //@line 12595
  $42 = HEAP32[$41 >> 2] | 0; //@line 12596
  $44 = HEAP32[$$reg2mem$0 + 32 >> 2] | 0; //@line 12598
  if (!$44) {
   $$06790$reg2mem$0$phi = $$reg2mem$0; //@line 12601
   $$reg2mem$0 = $42; //@line 12601
   $$reg2mem24$0 = $41; //@line 12601
   $$06790$reg2mem$0 = $$06790$reg2mem$0$phi; //@line 12601
  } else {
   label = 3; //@line 12603
   break;
  }
 }
 if ((label | 0) == 3) {
  $ReallocAsyncCtx = _emscripten_realloc_async_context(84) | 0; //@line 12609
  FUNCTION_TABLE_vi[$44 & 127]($$reg2mem$0 + 36 | 0); //@line 12610
  if (___async) {
   HEAP32[$ReallocAsyncCtx >> 2] = 27; //@line 12613
   $47 = $ReallocAsyncCtx + 4 | 0; //@line 12614
   HEAP32[$47 >> 2] = $2; //@line 12615
   $48 = $ReallocAsyncCtx + 8 | 0; //@line 12616
   HEAP32[$48 >> 2] = $$reg2mem$0; //@line 12617
   $49 = $ReallocAsyncCtx + 12 | 0; //@line 12618
   HEAP32[$49 >> 2] = $42; //@line 12619
   $50 = $ReallocAsyncCtx + 16 | 0; //@line 12620
   HEAP32[$50 >> 2] = $41; //@line 12621
   $51 = $ReallocAsyncCtx + 20 | 0; //@line 12622
   HEAP32[$51 >> 2] = $10; //@line 12623
   $52 = $ReallocAsyncCtx + 24 | 0; //@line 12624
   HEAP32[$52 >> 2] = $12; //@line 12625
   $53 = $ReallocAsyncCtx + 28 | 0; //@line 12626
   HEAP32[$53 >> 2] = $14; //@line 12627
   $54 = $ReallocAsyncCtx + 32 | 0; //@line 12628
   HEAP32[$54 >> 2] = $16; //@line 12629
   $55 = $ReallocAsyncCtx + 36 | 0; //@line 12630
   HEAP32[$55 >> 2] = $18; //@line 12631
   $56 = $ReallocAsyncCtx + 40 | 0; //@line 12632
   HEAP32[$56 >> 2] = $20; //@line 12633
   $57 = $ReallocAsyncCtx + 44 | 0; //@line 12634
   $$expand_i1_val = $22 & 1; //@line 12635
   HEAP8[$57 >> 0] = $$expand_i1_val; //@line 12636
   $58 = $ReallocAsyncCtx + 48 | 0; //@line 12637
   HEAP32[$58 >> 2] = $24; //@line 12638
   $59 = $ReallocAsyncCtx + 52 | 0; //@line 12639
   HEAP32[$59 >> 2] = $26; //@line 12640
   $60 = $ReallocAsyncCtx + 56 | 0; //@line 12641
   HEAP32[$60 >> 2] = $28; //@line 12642
   $61 = $ReallocAsyncCtx + 60 | 0; //@line 12643
   HEAP32[$61 >> 2] = $30; //@line 12644
   $62 = $ReallocAsyncCtx + 64 | 0; //@line 12645
   HEAP32[$62 >> 2] = $32; //@line 12646
   $63 = $ReallocAsyncCtx + 68 | 0; //@line 12647
   HEAP32[$63 >> 2] = $34; //@line 12648
   $64 = $ReallocAsyncCtx + 72 | 0; //@line 12649
   HEAP32[$64 >> 2] = $36; //@line 12650
   $65 = $ReallocAsyncCtx + 76 | 0; //@line 12651
   HEAP32[$65 >> 2] = $38; //@line 12652
   $66 = $ReallocAsyncCtx + 80 | 0; //@line 12653
   HEAP32[$66 >> 2] = $40; //@line 12654
   sp = STACKTOP; //@line 12655
   return;
  }
  ___async_unwind = 0; //@line 12658
  HEAP32[$ReallocAsyncCtx >> 2] = 27; //@line 12659
  $47 = $ReallocAsyncCtx + 4 | 0; //@line 12660
  HEAP32[$47 >> 2] = $2; //@line 12661
  $48 = $ReallocAsyncCtx + 8 | 0; //@line 12662
  HEAP32[$48 >> 2] = $$reg2mem$0; //@line 12663
  $49 = $ReallocAsyncCtx + 12 | 0; //@line 12664
  HEAP32[$49 >> 2] = $42; //@line 12665
  $50 = $ReallocAsyncCtx + 16 | 0; //@line 12666
  HEAP32[$50 >> 2] = $41; //@line 12667
  $51 = $ReallocAsyncCtx + 20 | 0; //@line 12668
  HEAP32[$51 >> 2] = $10; //@line 12669
  $52 = $ReallocAsyncCtx + 24 | 0; //@line 12670
  HEAP32[$52 >> 2] = $12; //@line 12671
  $53 = $ReallocAsyncCtx + 28 | 0; //@line 12672
  HEAP32[$53 >> 2] = $14; //@line 12673
  $54 = $ReallocAsyncCtx + 32 | 0; //@line 12674
  HEAP32[$54 >> 2] = $16; //@line 12675
  $55 = $ReallocAsyncCtx + 36 | 0; //@line 12676
  HEAP32[$55 >> 2] = $18; //@line 12677
  $56 = $ReallocAsyncCtx + 40 | 0; //@line 12678
  HEAP32[$56 >> 2] = $20; //@line 12679
  $57 = $ReallocAsyncCtx + 44 | 0; //@line 12680
  $$expand_i1_val = $22 & 1; //@line 12681
  HEAP8[$57 >> 0] = $$expand_i1_val; //@line 12682
  $58 = $ReallocAsyncCtx + 48 | 0; //@line 12683
  HEAP32[$58 >> 2] = $24; //@line 12684
  $59 = $ReallocAsyncCtx + 52 | 0; //@line 12685
  HEAP32[$59 >> 2] = $26; //@line 12686
  $60 = $ReallocAsyncCtx + 56 | 0; //@line 12687
  HEAP32[$60 >> 2] = $28; //@line 12688
  $61 = $ReallocAsyncCtx + 60 | 0; //@line 12689
  HEAP32[$61 >> 2] = $30; //@line 12690
  $62 = $ReallocAsyncCtx + 64 | 0; //@line 12691
  HEAP32[$62 >> 2] = $32; //@line 12692
  $63 = $ReallocAsyncCtx + 68 | 0; //@line 12693
  HEAP32[$63 >> 2] = $34; //@line 12694
  $64 = $ReallocAsyncCtx + 72 | 0; //@line 12695
  HEAP32[$64 >> 2] = $36; //@line 12696
  $65 = $ReallocAsyncCtx + 76 | 0; //@line 12697
  HEAP32[$65 >> 2] = $38; //@line 12698
  $66 = $ReallocAsyncCtx + 80 | 0; //@line 12699
  HEAP32[$66 >> 2] = $40; //@line 12700
  sp = STACKTOP; //@line 12701
  return;
 } else if ((label | 0) == 8) {
  $70 = $$06790$reg2mem$0 + 20 | 0; //@line 12705
  HEAP32[$70 >> 2] = (HEAP32[$70 >> 2] | 0) + $68; //@line 12708
  $73 = _equeue_tick() | 0; //@line 12709
  $ReallocAsyncCtx4 = _emscripten_realloc_async_context(76) | 0; //@line 12710
  _equeue_enqueue($18, $$06790$reg2mem$0, $73) | 0; //@line 12711
  if (___async) {
   HEAP32[$ReallocAsyncCtx4 >> 2] = 28; //@line 12714
   $74 = $ReallocAsyncCtx4 + 4 | 0; //@line 12715
   HEAP32[$74 >> 2] = $2; //@line 12716
   $75 = $ReallocAsyncCtx4 + 8 | 0; //@line 12717
   HEAP32[$75 >> 2] = $$reg2mem$0; //@line 12718
   $76 = $ReallocAsyncCtx4 + 12 | 0; //@line 12719
   HEAP32[$76 >> 2] = $10; //@line 12720
   $77 = $ReallocAsyncCtx4 + 16 | 0; //@line 12721
   HEAP32[$77 >> 2] = $12; //@line 12722
   $78 = $ReallocAsyncCtx4 + 20 | 0; //@line 12723
   HEAP32[$78 >> 2] = $14; //@line 12724
   $79 = $ReallocAsyncCtx4 + 24 | 0; //@line 12725
   HEAP32[$79 >> 2] = $16; //@line 12726
   $80 = $ReallocAsyncCtx4 + 28 | 0; //@line 12727
   HEAP32[$80 >> 2] = $18; //@line 12728
   $81 = $ReallocAsyncCtx4 + 32 | 0; //@line 12729
   HEAP32[$81 >> 2] = $20; //@line 12730
   $82 = $ReallocAsyncCtx4 + 36 | 0; //@line 12731
   $$expand_i1_val31 = $22 & 1; //@line 12732
   HEAP8[$82 >> 0] = $$expand_i1_val31; //@line 12733
   $83 = $ReallocAsyncCtx4 + 40 | 0; //@line 12734
   HEAP32[$83 >> 2] = $24; //@line 12735
   $84 = $ReallocAsyncCtx4 + 44 | 0; //@line 12736
   HEAP32[$84 >> 2] = $26; //@line 12737
   $85 = $ReallocAsyncCtx4 + 48 | 0; //@line 12738
   HEAP32[$85 >> 2] = $28; //@line 12739
   $86 = $ReallocAsyncCtx4 + 52 | 0; //@line 12740
   HEAP32[$86 >> 2] = $30; //@line 12741
   $87 = $ReallocAsyncCtx4 + 56 | 0; //@line 12742
   HEAP32[$87 >> 2] = $32; //@line 12743
   $88 = $ReallocAsyncCtx4 + 60 | 0; //@line 12744
   HEAP32[$88 >> 2] = $34; //@line 12745
   $89 = $ReallocAsyncCtx4 + 64 | 0; //@line 12746
   HEAP32[$89 >> 2] = $36; //@line 12747
   $90 = $ReallocAsyncCtx4 + 68 | 0; //@line 12748
   HEAP32[$90 >> 2] = $38; //@line 12749
   $91 = $ReallocAsyncCtx4 + 72 | 0; //@line 12750
   HEAP32[$91 >> 2] = $40; //@line 12751
   sp = STACKTOP; //@line 12752
   return;
  }
  ___async_unwind = 0; //@line 12755
  HEAP32[$ReallocAsyncCtx4 >> 2] = 28; //@line 12756
  $74 = $ReallocAsyncCtx4 + 4 | 0; //@line 12757
  HEAP32[$74 >> 2] = $2; //@line 12758
  $75 = $ReallocAsyncCtx4 + 8 | 0; //@line 12759
  HEAP32[$75 >> 2] = $$reg2mem$0; //@line 12760
  $76 = $ReallocAsyncCtx4 + 12 | 0; //@line 12761
  HEAP32[$76 >> 2] = $10; //@line 12762
  $77 = $ReallocAsyncCtx4 + 16 | 0; //@line 12763
  HEAP32[$77 >> 2] = $12; //@line 12764
  $78 = $ReallocAsyncCtx4 + 20 | 0; //@line 12765
  HEAP32[$78 >> 2] = $14; //@line 12766
  $79 = $ReallocAsyncCtx4 + 24 | 0; //@line 12767
  HEAP32[$79 >> 2] = $16; //@line 12768
  $80 = $ReallocAsyncCtx4 + 28 | 0; //@line 12769
  HEAP32[$80 >> 2] = $18; //@line 12770
  $81 = $ReallocAsyncCtx4 + 32 | 0; //@line 12771
  HEAP32[$81 >> 2] = $20; //@line 12772
  $82 = $ReallocAsyncCtx4 + 36 | 0; //@line 12773
  $$expand_i1_val31 = $22 & 1; //@line 12774
  HEAP8[$82 >> 0] = $$expand_i1_val31; //@line 12775
  $83 = $ReallocAsyncCtx4 + 40 | 0; //@line 12776
  HEAP32[$83 >> 2] = $24; //@line 12777
  $84 = $ReallocAsyncCtx4 + 44 | 0; //@line 12778
  HEAP32[$84 >> 2] = $26; //@line 12779
  $85 = $ReallocAsyncCtx4 + 48 | 0; //@line 12780
  HEAP32[$85 >> 2] = $28; //@line 12781
  $86 = $ReallocAsyncCtx4 + 52 | 0; //@line 12782
  HEAP32[$86 >> 2] = $30; //@line 12783
  $87 = $ReallocAsyncCtx4 + 56 | 0; //@line 12784
  HEAP32[$87 >> 2] = $32; //@line 12785
  $88 = $ReallocAsyncCtx4 + 60 | 0; //@line 12786
  HEAP32[$88 >> 2] = $34; //@line 12787
  $89 = $ReallocAsyncCtx4 + 64 | 0; //@line 12788
  HEAP32[$89 >> 2] = $36; //@line 12789
  $90 = $ReallocAsyncCtx4 + 68 | 0; //@line 12790
  HEAP32[$90 >> 2] = $38; //@line 12791
  $91 = $ReallocAsyncCtx4 + 72 | 0; //@line 12792
  HEAP32[$91 >> 2] = $40; //@line 12793
  sp = STACKTOP; //@line 12794
  return;
 } else if ((label | 0) == 12) {
  $ReallocAsyncCtx2 = _emscripten_realloc_async_context(84) | 0; //@line 12799
  FUNCTION_TABLE_vi[$102 & 127]($$06790$reg2mem$0 + 36 | 0); //@line 12800
  if (___async) {
   HEAP32[$ReallocAsyncCtx2 >> 2] = 29; //@line 12803
   $105 = $ReallocAsyncCtx2 + 4 | 0; //@line 12804
   HEAP32[$105 >> 2] = $2; //@line 12805
   $106 = $ReallocAsyncCtx2 + 8 | 0; //@line 12806
   HEAP32[$106 >> 2] = $$06790$reg2mem$0; //@line 12807
   $107 = $ReallocAsyncCtx2 + 12 | 0; //@line 12808
   HEAP32[$107 >> 2] = $$reg2mem$0; //@line 12809
   $108 = $ReallocAsyncCtx2 + 16 | 0; //@line 12810
   HEAP32[$108 >> 2] = $$reg2mem24$0; //@line 12811
   $109 = $ReallocAsyncCtx2 + 20 | 0; //@line 12812
   HEAP32[$109 >> 2] = $10; //@line 12813
   $110 = $ReallocAsyncCtx2 + 24 | 0; //@line 12814
   HEAP32[$110 >> 2] = $12; //@line 12815
   $111 = $ReallocAsyncCtx2 + 28 | 0; //@line 12816
   HEAP32[$111 >> 2] = $14; //@line 12817
   $112 = $ReallocAsyncCtx2 + 32 | 0; //@line 12818
   HEAP32[$112 >> 2] = $16; //@line 12819
   $113 = $ReallocAsyncCtx2 + 36 | 0; //@line 12820
   HEAP32[$113 >> 2] = $18; //@line 12821
   $114 = $ReallocAsyncCtx2 + 40 | 0; //@line 12822
   HEAP32[$114 >> 2] = $20; //@line 12823
   $115 = $ReallocAsyncCtx2 + 44 | 0; //@line 12824
   $$expand_i1_val33 = $22 & 1; //@line 12825
   HEAP8[$115 >> 0] = $$expand_i1_val33; //@line 12826
   $116 = $ReallocAsyncCtx2 + 48 | 0; //@line 12827
   HEAP32[$116 >> 2] = $24; //@line 12828
   $117 = $ReallocAsyncCtx2 + 52 | 0; //@line 12829
   HEAP32[$117 >> 2] = $26; //@line 12830
   $118 = $ReallocAsyncCtx2 + 56 | 0; //@line 12831
   HEAP32[$118 >> 2] = $28; //@line 12832
   $119 = $ReallocAsyncCtx2 + 60 | 0; //@line 12833
   HEAP32[$119 >> 2] = $30; //@line 12834
   $120 = $ReallocAsyncCtx2 + 64 | 0; //@line 12835
   HEAP32[$120 >> 2] = $32; //@line 12836
   $121 = $ReallocAsyncCtx2 + 68 | 0; //@line 12837
   HEAP32[$121 >> 2] = $34; //@line 12838
   $122 = $ReallocAsyncCtx2 + 72 | 0; //@line 12839
   HEAP32[$122 >> 2] = $36; //@line 12840
   $123 = $ReallocAsyncCtx2 + 76 | 0; //@line 12841
   HEAP32[$123 >> 2] = $38; //@line 12842
   $124 = $ReallocAsyncCtx2 + 80 | 0; //@line 12843
   HEAP32[$124 >> 2] = $40; //@line 12844
   sp = STACKTOP; //@line 12845
   return;
  }
  ___async_unwind = 0; //@line 12848
  HEAP32[$ReallocAsyncCtx2 >> 2] = 29; //@line 12849
  $105 = $ReallocAsyncCtx2 + 4 | 0; //@line 12850
  HEAP32[$105 >> 2] = $2; //@line 12851
  $106 = $ReallocAsyncCtx2 + 8 | 0; //@line 12852
  HEAP32[$106 >> 2] = $$06790$reg2mem$0; //@line 12853
  $107 = $ReallocAsyncCtx2 + 12 | 0; //@line 12854
  HEAP32[$107 >> 2] = $$reg2mem$0; //@line 12855
  $108 = $ReallocAsyncCtx2 + 16 | 0; //@line 12856
  HEAP32[$108 >> 2] = $$reg2mem24$0; //@line 12857
  $109 = $ReallocAsyncCtx2 + 20 | 0; //@line 12858
  HEAP32[$109 >> 2] = $10; //@line 12859
  $110 = $ReallocAsyncCtx2 + 24 | 0; //@line 12860
  HEAP32[$110 >> 2] = $12; //@line 12861
  $111 = $ReallocAsyncCtx2 + 28 | 0; //@line 12862
  HEAP32[$111 >> 2] = $14; //@line 12863
  $112 = $ReallocAsyncCtx2 + 32 | 0; //@line 12864
  HEAP32[$112 >> 2] = $16; //@line 12865
  $113 = $ReallocAsyncCtx2 + 36 | 0; //@line 12866
  HEAP32[$113 >> 2] = $18; //@line 12867
  $114 = $ReallocAsyncCtx2 + 40 | 0; //@line 12868
  HEAP32[$114 >> 2] = $20; //@line 12869
  $115 = $ReallocAsyncCtx2 + 44 | 0; //@line 12870
  $$expand_i1_val33 = $22 & 1; //@line 12871
  HEAP8[$115 >> 0] = $$expand_i1_val33; //@line 12872
  $116 = $ReallocAsyncCtx2 + 48 | 0; //@line 12873
  HEAP32[$116 >> 2] = $24; //@line 12874
  $117 = $ReallocAsyncCtx2 + 52 | 0; //@line 12875
  HEAP32[$117 >> 2] = $26; //@line 12876
  $118 = $ReallocAsyncCtx2 + 56 | 0; //@line 12877
  HEAP32[$118 >> 2] = $28; //@line 12878
  $119 = $ReallocAsyncCtx2 + 60 | 0; //@line 12879
  HEAP32[$119 >> 2] = $30; //@line 12880
  $120 = $ReallocAsyncCtx2 + 64 | 0; //@line 12881
  HEAP32[$120 >> 2] = $32; //@line 12882
  $121 = $ReallocAsyncCtx2 + 68 | 0; //@line 12883
  HEAP32[$121 >> 2] = $34; //@line 12884
  $122 = $ReallocAsyncCtx2 + 72 | 0; //@line 12885
  HEAP32[$122 >> 2] = $36; //@line 12886
  $123 = $ReallocAsyncCtx2 + 76 | 0; //@line 12887
  HEAP32[$123 >> 2] = $38; //@line 12888
  $124 = $ReallocAsyncCtx2 + 80 | 0; //@line 12889
  HEAP32[$124 >> 2] = $40; //@line 12890
  sp = STACKTOP; //@line 12891
  return;
 } else if ((label | 0) == 24) {
  $140 = _equeue_tick() | 0; //@line 12895
  if ($22) {
   $141 = $20 - $140 | 0; //@line 12897
   if (($141 | 0) < 1) {
    $143 = $18 + 40 | 0; //@line 12900
    if (HEAP32[$143 >> 2] | 0) {
     _equeue_mutex_lock($12); //@line 12904
     $146 = HEAP32[$143 >> 2] | 0; //@line 12905
     if ($146 | 0) {
      $148 = HEAP32[$36 >> 2] | 0; //@line 12908
      if ($148 | 0) {
       $151 = HEAP32[$18 + 44 >> 2] | 0; //@line 12912
       $154 = (HEAP32[$148 + 20 >> 2] | 0) - $140 | 0; //@line 12915
       $ReallocAsyncCtx3 = _emscripten_realloc_async_context(16) | 0; //@line 12919
       FUNCTION_TABLE_vii[$146 & 3]($151, $154 & ~($154 >> 31)); //@line 12920
       if (___async) {
        HEAP32[$ReallocAsyncCtx3 >> 2] = 30; //@line 12923
        $158 = $ReallocAsyncCtx3 + 4 | 0; //@line 12924
        HEAP32[$158 >> 2] = $28; //@line 12925
        $159 = $ReallocAsyncCtx3 + 8 | 0; //@line 12926
        HEAP32[$159 >> 2] = $12; //@line 12927
        $160 = $ReallocAsyncCtx3 + 12 | 0; //@line 12928
        HEAP32[$160 >> 2] = $26; //@line 12929
        sp = STACKTOP; //@line 12930
        return;
       }
       ___async_unwind = 0; //@line 12933
       HEAP32[$ReallocAsyncCtx3 >> 2] = 30; //@line 12934
       $158 = $ReallocAsyncCtx3 + 4 | 0; //@line 12935
       HEAP32[$158 >> 2] = $28; //@line 12936
       $159 = $ReallocAsyncCtx3 + 8 | 0; //@line 12937
       HEAP32[$159 >> 2] = $12; //@line 12938
       $160 = $ReallocAsyncCtx3 + 12 | 0; //@line 12939
       HEAP32[$160 >> 2] = $26; //@line 12940
       sp = STACKTOP; //@line 12941
       return;
      }
     }
     HEAP8[$28 >> 0] = 1; //@line 12945
     _equeue_mutex_unlock($12); //@line 12946
    }
    HEAP8[$26 >> 0] = 0; //@line 12948
    return;
   } else {
    $$065 = $141; //@line 12951
   }
  } else {
   $$065 = -1; //@line 12954
  }
  _equeue_mutex_lock($12); //@line 12956
  $161 = HEAP32[$36 >> 2] | 0; //@line 12957
  if (!$161) {
   $$2 = $$065; //@line 12960
  } else {
   $165 = (HEAP32[$161 + 20 >> 2] | 0) - $140 | 0; //@line 12964
   $168 = $165 & ~($165 >> 31); //@line 12967
   $$2 = $168 >>> 0 < $$065 >>> 0 ? $168 : $$065; //@line 12970
  }
  _equeue_mutex_unlock($12); //@line 12972
  _equeue_sema_wait($38, $$2) | 0; //@line 12973
  do {
   if (HEAP8[$26 >> 0] | 0) {
    _equeue_mutex_lock($12); //@line 12978
    if (!(HEAP8[$26 >> 0] | 0)) {
     _equeue_mutex_unlock($12); //@line 12982
     break;
    }
    HEAP8[$26 >> 0] = 0; //@line 12985
    _equeue_mutex_unlock($12); //@line 12986
    return;
   }
  } while (0);
  $174 = _equeue_tick() | 0; //@line 12990
  $ReallocAsyncCtx5 = _emscripten_realloc_async_context(76) | 0; //@line 12991
  _wait_ms(20); //@line 12992
  if (___async) {
   HEAP32[$ReallocAsyncCtx5 >> 2] = 31; //@line 12995
   $175 = $ReallocAsyncCtx5 + 4 | 0; //@line 12996
   HEAP32[$175 >> 2] = $2; //@line 12997
   $176 = $ReallocAsyncCtx5 + 8 | 0; //@line 12998
   HEAP32[$176 >> 2] = $10; //@line 12999
   $177 = $ReallocAsyncCtx5 + 12 | 0; //@line 13000
   HEAP32[$177 >> 2] = $12; //@line 13001
   $178 = $ReallocAsyncCtx5 + 16 | 0; //@line 13002
   HEAP32[$178 >> 2] = $174; //@line 13003
   $179 = $ReallocAsyncCtx5 + 20 | 0; //@line 13004
   HEAP32[$179 >> 2] = $14; //@line 13005
   $180 = $ReallocAsyncCtx5 + 24 | 0; //@line 13006
   HEAP32[$180 >> 2] = $16; //@line 13007
   $181 = $ReallocAsyncCtx5 + 28 | 0; //@line 13008
   HEAP32[$181 >> 2] = $18; //@line 13009
   $182 = $ReallocAsyncCtx5 + 32 | 0; //@line 13010
   HEAP32[$182 >> 2] = $20; //@line 13011
   $183 = $ReallocAsyncCtx5 + 36 | 0; //@line 13012
   $$expand_i1_val35 = $22 & 1; //@line 13013
   HEAP8[$183 >> 0] = $$expand_i1_val35; //@line 13014
   $184 = $ReallocAsyncCtx5 + 40 | 0; //@line 13015
   HEAP32[$184 >> 2] = $24; //@line 13016
   $185 = $ReallocAsyncCtx5 + 44 | 0; //@line 13017
   HEAP32[$185 >> 2] = $26; //@line 13018
   $186 = $ReallocAsyncCtx5 + 48 | 0; //@line 13019
   HEAP32[$186 >> 2] = $28; //@line 13020
   $187 = $ReallocAsyncCtx5 + 52 | 0; //@line 13021
   HEAP32[$187 >> 2] = $30; //@line 13022
   $188 = $ReallocAsyncCtx5 + 56 | 0; //@line 13023
   HEAP32[$188 >> 2] = $32; //@line 13024
   $189 = $ReallocAsyncCtx5 + 60 | 0; //@line 13025
   HEAP32[$189 >> 2] = $34; //@line 13026
   $190 = $ReallocAsyncCtx5 + 64 | 0; //@line 13027
   HEAP32[$190 >> 2] = $36; //@line 13028
   $191 = $ReallocAsyncCtx5 + 68 | 0; //@line 13029
   HEAP32[$191 >> 2] = $38; //@line 13030
   $192 = $ReallocAsyncCtx5 + 72 | 0; //@line 13031
   HEAP32[$192 >> 2] = $40; //@line 13032
   sp = STACKTOP; //@line 13033
   return;
  }
  ___async_unwind = 0; //@line 13036
  HEAP32[$ReallocAsyncCtx5 >> 2] = 31; //@line 13037
  $175 = $ReallocAsyncCtx5 + 4 | 0; //@line 13038
  HEAP32[$175 >> 2] = $2; //@line 13039
  $176 = $ReallocAsyncCtx5 + 8 | 0; //@line 13040
  HEAP32[$176 >> 2] = $10; //@line 13041
  $177 = $ReallocAsyncCtx5 + 12 | 0; //@line 13042
  HEAP32[$177 >> 2] = $12; //@line 13043
  $178 = $ReallocAsyncCtx5 + 16 | 0; //@line 13044
  HEAP32[$178 >> 2] = $174; //@line 13045
  $179 = $ReallocAsyncCtx5 + 20 | 0; //@line 13046
  HEAP32[$179 >> 2] = $14; //@line 13047
  $180 = $ReallocAsyncCtx5 + 24 | 0; //@line 13048
  HEAP32[$180 >> 2] = $16; //@line 13049
  $181 = $ReallocAsyncCtx5 + 28 | 0; //@line 13050
  HEAP32[$181 >> 2] = $18; //@line 13051
  $182 = $ReallocAsyncCtx5 + 32 | 0; //@line 13052
  HEAP32[$182 >> 2] = $20; //@line 13053
  $183 = $ReallocAsyncCtx5 + 36 | 0; //@line 13054
  $$expand_i1_val35 = $22 & 1; //@line 13055
  HEAP8[$183 >> 0] = $$expand_i1_val35; //@line 13056
  $184 = $ReallocAsyncCtx5 + 40 | 0; //@line 13057
  HEAP32[$184 >> 2] = $24; //@line 13058
  $185 = $ReallocAsyncCtx5 + 44 | 0; //@line 13059
  HEAP32[$185 >> 2] = $26; //@line 13060
  $186 = $ReallocAsyncCtx5 + 48 | 0; //@line 13061
  HEAP32[$186 >> 2] = $28; //@line 13062
  $187 = $ReallocAsyncCtx5 + 52 | 0; //@line 13063
  HEAP32[$187 >> 2] = $30; //@line 13064
  $188 = $ReallocAsyncCtx5 + 56 | 0; //@line 13065
  HEAP32[$188 >> 2] = $32; //@line 13066
  $189 = $ReallocAsyncCtx5 + 60 | 0; //@line 13067
  HEAP32[$189 >> 2] = $34; //@line 13068
  $190 = $ReallocAsyncCtx5 + 64 | 0; //@line 13069
  HEAP32[$190 >> 2] = $36; //@line 13070
  $191 = $ReallocAsyncCtx5 + 68 | 0; //@line 13071
  HEAP32[$191 >> 2] = $38; //@line 13072
  $192 = $ReallocAsyncCtx5 + 72 | 0; //@line 13073
  HEAP32[$192 >> 2] = $40; //@line 13074
  sp = STACKTOP; //@line 13075
  return;
 }
}
function _equeue_dispatch__async_cb_24($0) {
 $0 = $0 | 0;
 var $$02329$i$i = 0, $$02330$i$i = 0, $$025$i$i = 0, $$065 = 0, $$06790$reg2mem$0 = 0, $$06790$reg2mem$0$phi = 0, $$2 = 0, $$expand_i1_val = 0, $$expand_i1_val31 = 0, $$expand_i1_val33 = 0, $$expand_i1_val35 = 0, $$reg2mem$0 = 0, $$reg2mem24$0 = 0, $$sink$in$i$i = 0, $10 = 0, $102 = 0, $105 = 0, $106 = 0, $107 = 0, $108 = 0, $109 = 0, $110 = 0, $111 = 0, $112 = 0, $113 = 0, $114 = 0, $115 = 0, $116 = 0, $117 = 0, $118 = 0, $119 = 0, $12 = 0, $120 = 0, $121 = 0, $122 = 0, $123 = 0, $124 = 0, $125 = 0, $127 = 0, $128 = 0, $129 = 0, $131 = 0, $132 = 0, $14 = 0, $140 = 0, $141 = 0, $143 = 0, $146 = 0, $148 = 0, $151 = 0, $154 = 0, $158 = 0, $159 = 0, $16 = 0, $160 = 0, $161 = 0, $165 = 0, $168 = 0, $174 = 0, $175 = 0, $176 = 0, $177 = 0, $178 = 0, $179 = 0, $18 = 0, $180 = 0, $181 = 0, $182 = 0, $183 = 0, $184 = 0, $185 = 0, $186 = 0, $187 = 0, $188 = 0, $189 = 0, $190 = 0, $191 = 0, $192 = 0, $2 = 0, $20 = 0, $22 = 0, $24 = 0, $26 = 0, $28 = 0, $30 = 0, $32 = 0, $34 = 0, $36 = 0, $38 = 0, $40 = 0, $42 = 0, $44 = 0, $47 = 0, $48 = 0, $49 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0, $68 = 0, $70 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $78 = 0, $79 = 0, $80 = 0, $81 = 0, $82 = 0, $83 = 0, $84 = 0, $85 = 0, $86 = 0, $87 = 0, $88 = 0, $89 = 0, $90 = 0, $91 = 0, $92 = 0, $93 = 0, $ReallocAsyncCtx = 0, $ReallocAsyncCtx2 = 0, $ReallocAsyncCtx3 = 0, $ReallocAsyncCtx4 = 0, $ReallocAsyncCtx5 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 13093
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 13095
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 13103
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 13105
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 13107
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 13109
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 13111
 $20 = HEAP32[$0 + 40 >> 2] | 0; //@line 13113
 $22 = HEAP8[$0 + 44 >> 0] & 1; //@line 13116
 $24 = HEAP32[$0 + 48 >> 2] | 0; //@line 13118
 $26 = HEAP32[$0 + 52 >> 2] | 0; //@line 13120
 $28 = HEAP32[$0 + 56 >> 2] | 0; //@line 13122
 $30 = HEAP32[$0 + 60 >> 2] | 0; //@line 13124
 $32 = HEAP32[$0 + 64 >> 2] | 0; //@line 13126
 $34 = HEAP32[$0 + 68 >> 2] | 0; //@line 13128
 $36 = HEAP32[$0 + 72 >> 2] | 0; //@line 13130
 $38 = HEAP32[$0 + 76 >> 2] | 0; //@line 13132
 $40 = HEAP32[$0 + 80 >> 2] | 0; //@line 13134
 $$06790$reg2mem$0 = HEAP32[$0 + 8 >> 2] | 0; //@line 13135
 $$reg2mem$0 = HEAP32[$0 + 12 >> 2] | 0; //@line 13135
 $$reg2mem24$0 = HEAP32[$0 + 16 >> 2] | 0; //@line 13135
 while (1) {
  _equeue_mutex_lock($10); //@line 13137
  $125 = HEAP32[$2 >> 2] | 0; //@line 13138
  L4 : do {
   if (!$125) {
    $$02329$i$i = $2; //@line 13142
    label = 21; //@line 13143
   } else {
    $127 = HEAP32[$$06790$reg2mem$0 >> 2] | 0; //@line 13145
    $$025$i$i = $2; //@line 13146
    $129 = $125; //@line 13146
    while (1) {
     $128 = HEAP32[$129 >> 2] | 0; //@line 13148
     if ($128 >>> 0 >= $127 >>> 0) {
      break;
     }
     $131 = $129 + 8 | 0; //@line 13153
     $132 = HEAP32[$131 >> 2] | 0; //@line 13154
     if (!$132) {
      $$02329$i$i = $131; //@line 13157
      label = 21; //@line 13158
      break L4;
     } else {
      $$025$i$i = $131; //@line 13161
      $129 = $132; //@line 13161
     }
    }
    if (($128 | 0) == ($127 | 0)) {
     HEAP32[$$06790$reg2mem$0 + 12 >> 2] = $129; //@line 13167
     $$02330$i$i = $$025$i$i; //@line 13170
     $$sink$in$i$i = (HEAP32[$$025$i$i >> 2] | 0) + 8 | 0; //@line 13170
    } else {
     $$02329$i$i = $$025$i$i; //@line 13172
     label = 21; //@line 13173
    }
   }
  } while (0);
  if ((label | 0) == 21) {
   label = 0; //@line 13178
   HEAP32[$$06790$reg2mem$0 + 12 >> 2] = 0; //@line 13180
   $$02330$i$i = $$02329$i$i; //@line 13181
   $$sink$in$i$i = $$02329$i$i; //@line 13181
  }
  HEAP32[$$reg2mem24$0 >> 2] = HEAP32[$$sink$in$i$i >> 2]; //@line 13184
  HEAP32[$$02330$i$i >> 2] = $$06790$reg2mem$0; //@line 13185
  _equeue_mutex_unlock($10); //@line 13186
  if (!$$reg2mem$0) {
   label = 24; //@line 13189
   break;
  }
  $$reg2mem24$0 = $$reg2mem$0 + 8 | 0; //@line 13192
  $42 = HEAP32[$$reg2mem24$0 >> 2] | 0; //@line 13193
  $44 = HEAP32[$$reg2mem$0 + 32 >> 2] | 0; //@line 13195
  if ($44 | 0) {
   label = 3; //@line 13198
   break;
  }
  $68 = HEAP32[$$reg2mem$0 + 24 >> 2] | 0; //@line 13202
  if (($68 | 0) > -1) {
   label = 7; //@line 13205
   break;
  }
  $92 = $$reg2mem$0 + 4 | 0; //@line 13209
  $93 = HEAP8[$92 >> 0] | 0; //@line 13210
  HEAP8[$92 >> 0] = (($93 + 1 & 255) << HEAP32[$40 >> 2] | 0) == 0 ? 1 : ($93 & 255) + 1 & 255; //@line 13219
  $102 = HEAP32[$$reg2mem$0 + 28 >> 2] | 0; //@line 13221
  if ($102 | 0) {
   label = 11; //@line 13226
   break;
  } else {
   $$06790$reg2mem$0$phi = $$reg2mem$0; //@line 13224
   $$reg2mem$0 = $42; //@line 13224
   $$06790$reg2mem$0 = $$06790$reg2mem$0$phi; //@line 13224
  }
 }
 if ((label | 0) == 3) {
  $ReallocAsyncCtx = _emscripten_realloc_async_context(84) | 0; //@line 13232
  FUNCTION_TABLE_vi[$44 & 127]($$reg2mem$0 + 36 | 0); //@line 13233
  if (___async) {
   HEAP32[$ReallocAsyncCtx >> 2] = 27; //@line 13236
   $47 = $ReallocAsyncCtx + 4 | 0; //@line 13237
   HEAP32[$47 >> 2] = $2; //@line 13238
   $48 = $ReallocAsyncCtx + 8 | 0; //@line 13239
   HEAP32[$48 >> 2] = $$reg2mem$0; //@line 13240
   $49 = $ReallocAsyncCtx + 12 | 0; //@line 13241
   HEAP32[$49 >> 2] = $42; //@line 13242
   $50 = $ReallocAsyncCtx + 16 | 0; //@line 13243
   HEAP32[$50 >> 2] = $$reg2mem24$0; //@line 13244
   $51 = $ReallocAsyncCtx + 20 | 0; //@line 13245
   HEAP32[$51 >> 2] = $10; //@line 13246
   $52 = $ReallocAsyncCtx + 24 | 0; //@line 13247
   HEAP32[$52 >> 2] = $12; //@line 13248
   $53 = $ReallocAsyncCtx + 28 | 0; //@line 13249
   HEAP32[$53 >> 2] = $14; //@line 13250
   $54 = $ReallocAsyncCtx + 32 | 0; //@line 13251
   HEAP32[$54 >> 2] = $16; //@line 13252
   $55 = $ReallocAsyncCtx + 36 | 0; //@line 13253
   HEAP32[$55 >> 2] = $18; //@line 13254
   $56 = $ReallocAsyncCtx + 40 | 0; //@line 13255
   HEAP32[$56 >> 2] = $20; //@line 13256
   $57 = $ReallocAsyncCtx + 44 | 0; //@line 13257
   $$expand_i1_val = $22 & 1; //@line 13258
   HEAP8[$57 >> 0] = $$expand_i1_val; //@line 13259
   $58 = $ReallocAsyncCtx + 48 | 0; //@line 13260
   HEAP32[$58 >> 2] = $24; //@line 13261
   $59 = $ReallocAsyncCtx + 52 | 0; //@line 13262
   HEAP32[$59 >> 2] = $26; //@line 13263
   $60 = $ReallocAsyncCtx + 56 | 0; //@line 13264
   HEAP32[$60 >> 2] = $28; //@line 13265
   $61 = $ReallocAsyncCtx + 60 | 0; //@line 13266
   HEAP32[$61 >> 2] = $30; //@line 13267
   $62 = $ReallocAsyncCtx + 64 | 0; //@line 13268
   HEAP32[$62 >> 2] = $32; //@line 13269
   $63 = $ReallocAsyncCtx + 68 | 0; //@line 13270
   HEAP32[$63 >> 2] = $34; //@line 13271
   $64 = $ReallocAsyncCtx + 72 | 0; //@line 13272
   HEAP32[$64 >> 2] = $36; //@line 13273
   $65 = $ReallocAsyncCtx + 76 | 0; //@line 13274
   HEAP32[$65 >> 2] = $38; //@line 13275
   $66 = $ReallocAsyncCtx + 80 | 0; //@line 13276
   HEAP32[$66 >> 2] = $40; //@line 13277
   sp = STACKTOP; //@line 13278
   return;
  }
  ___async_unwind = 0; //@line 13281
  HEAP32[$ReallocAsyncCtx >> 2] = 27; //@line 13282
  $47 = $ReallocAsyncCtx + 4 | 0; //@line 13283
  HEAP32[$47 >> 2] = $2; //@line 13284
  $48 = $ReallocAsyncCtx + 8 | 0; //@line 13285
  HEAP32[$48 >> 2] = $$reg2mem$0; //@line 13286
  $49 = $ReallocAsyncCtx + 12 | 0; //@line 13287
  HEAP32[$49 >> 2] = $42; //@line 13288
  $50 = $ReallocAsyncCtx + 16 | 0; //@line 13289
  HEAP32[$50 >> 2] = $$reg2mem24$0; //@line 13290
  $51 = $ReallocAsyncCtx + 20 | 0; //@line 13291
  HEAP32[$51 >> 2] = $10; //@line 13292
  $52 = $ReallocAsyncCtx + 24 | 0; //@line 13293
  HEAP32[$52 >> 2] = $12; //@line 13294
  $53 = $ReallocAsyncCtx + 28 | 0; //@line 13295
  HEAP32[$53 >> 2] = $14; //@line 13296
  $54 = $ReallocAsyncCtx + 32 | 0; //@line 13297
  HEAP32[$54 >> 2] = $16; //@line 13298
  $55 = $ReallocAsyncCtx + 36 | 0; //@line 13299
  HEAP32[$55 >> 2] = $18; //@line 13300
  $56 = $ReallocAsyncCtx + 40 | 0; //@line 13301
  HEAP32[$56 >> 2] = $20; //@line 13302
  $57 = $ReallocAsyncCtx + 44 | 0; //@line 13303
  $$expand_i1_val = $22 & 1; //@line 13304
  HEAP8[$57 >> 0] = $$expand_i1_val; //@line 13305
  $58 = $ReallocAsyncCtx + 48 | 0; //@line 13306
  HEAP32[$58 >> 2] = $24; //@line 13307
  $59 = $ReallocAsyncCtx + 52 | 0; //@line 13308
  HEAP32[$59 >> 2] = $26; //@line 13309
  $60 = $ReallocAsyncCtx + 56 | 0; //@line 13310
  HEAP32[$60 >> 2] = $28; //@line 13311
  $61 = $ReallocAsyncCtx + 60 | 0; //@line 13312
  HEAP32[$61 >> 2] = $30; //@line 13313
  $62 = $ReallocAsyncCtx + 64 | 0; //@line 13314
  HEAP32[$62 >> 2] = $32; //@line 13315
  $63 = $ReallocAsyncCtx + 68 | 0; //@line 13316
  HEAP32[$63 >> 2] = $34; //@line 13317
  $64 = $ReallocAsyncCtx + 72 | 0; //@line 13318
  HEAP32[$64 >> 2] = $36; //@line 13319
  $65 = $ReallocAsyncCtx + 76 | 0; //@line 13320
  HEAP32[$65 >> 2] = $38; //@line 13321
  $66 = $ReallocAsyncCtx + 80 | 0; //@line 13322
  HEAP32[$66 >> 2] = $40; //@line 13323
  sp = STACKTOP; //@line 13324
  return;
 } else if ((label | 0) == 7) {
  $70 = $$reg2mem$0 + 20 | 0; //@line 13328
  HEAP32[$70 >> 2] = (HEAP32[$70 >> 2] | 0) + $68; //@line 13331
  $73 = _equeue_tick() | 0; //@line 13332
  $ReallocAsyncCtx4 = _emscripten_realloc_async_context(76) | 0; //@line 13333
  _equeue_enqueue($18, $$reg2mem$0, $73) | 0; //@line 13334
  if (___async) {
   HEAP32[$ReallocAsyncCtx4 >> 2] = 28; //@line 13337
   $74 = $ReallocAsyncCtx4 + 4 | 0; //@line 13338
   HEAP32[$74 >> 2] = $2; //@line 13339
   $75 = $ReallocAsyncCtx4 + 8 | 0; //@line 13340
   HEAP32[$75 >> 2] = $42; //@line 13341
   $76 = $ReallocAsyncCtx4 + 12 | 0; //@line 13342
   HEAP32[$76 >> 2] = $10; //@line 13343
   $77 = $ReallocAsyncCtx4 + 16 | 0; //@line 13344
   HEAP32[$77 >> 2] = $12; //@line 13345
   $78 = $ReallocAsyncCtx4 + 20 | 0; //@line 13346
   HEAP32[$78 >> 2] = $14; //@line 13347
   $79 = $ReallocAsyncCtx4 + 24 | 0; //@line 13348
   HEAP32[$79 >> 2] = $16; //@line 13349
   $80 = $ReallocAsyncCtx4 + 28 | 0; //@line 13350
   HEAP32[$80 >> 2] = $18; //@line 13351
   $81 = $ReallocAsyncCtx4 + 32 | 0; //@line 13352
   HEAP32[$81 >> 2] = $20; //@line 13353
   $82 = $ReallocAsyncCtx4 + 36 | 0; //@line 13354
   $$expand_i1_val31 = $22 & 1; //@line 13355
   HEAP8[$82 >> 0] = $$expand_i1_val31; //@line 13356
   $83 = $ReallocAsyncCtx4 + 40 | 0; //@line 13357
   HEAP32[$83 >> 2] = $24; //@line 13358
   $84 = $ReallocAsyncCtx4 + 44 | 0; //@line 13359
   HEAP32[$84 >> 2] = $26; //@line 13360
   $85 = $ReallocAsyncCtx4 + 48 | 0; //@line 13361
   HEAP32[$85 >> 2] = $28; //@line 13362
   $86 = $ReallocAsyncCtx4 + 52 | 0; //@line 13363
   HEAP32[$86 >> 2] = $30; //@line 13364
   $87 = $ReallocAsyncCtx4 + 56 | 0; //@line 13365
   HEAP32[$87 >> 2] = $32; //@line 13366
   $88 = $ReallocAsyncCtx4 + 60 | 0; //@line 13367
   HEAP32[$88 >> 2] = $34; //@line 13368
   $89 = $ReallocAsyncCtx4 + 64 | 0; //@line 13369
   HEAP32[$89 >> 2] = $36; //@line 13370
   $90 = $ReallocAsyncCtx4 + 68 | 0; //@line 13371
   HEAP32[$90 >> 2] = $38; //@line 13372
   $91 = $ReallocAsyncCtx4 + 72 | 0; //@line 13373
   HEAP32[$91 >> 2] = $40; //@line 13374
   sp = STACKTOP; //@line 13375
   return;
  }
  ___async_unwind = 0; //@line 13378
  HEAP32[$ReallocAsyncCtx4 >> 2] = 28; //@line 13379
  $74 = $ReallocAsyncCtx4 + 4 | 0; //@line 13380
  HEAP32[$74 >> 2] = $2; //@line 13381
  $75 = $ReallocAsyncCtx4 + 8 | 0; //@line 13382
  HEAP32[$75 >> 2] = $42; //@line 13383
  $76 = $ReallocAsyncCtx4 + 12 | 0; //@line 13384
  HEAP32[$76 >> 2] = $10; //@line 13385
  $77 = $ReallocAsyncCtx4 + 16 | 0; //@line 13386
  HEAP32[$77 >> 2] = $12; //@line 13387
  $78 = $ReallocAsyncCtx4 + 20 | 0; //@line 13388
  HEAP32[$78 >> 2] = $14; //@line 13389
  $79 = $ReallocAsyncCtx4 + 24 | 0; //@line 13390
  HEAP32[$79 >> 2] = $16; //@line 13391
  $80 = $ReallocAsyncCtx4 + 28 | 0; //@line 13392
  HEAP32[$80 >> 2] = $18; //@line 13393
  $81 = $ReallocAsyncCtx4 + 32 | 0; //@line 13394
  HEAP32[$81 >> 2] = $20; //@line 13395
  $82 = $ReallocAsyncCtx4 + 36 | 0; //@line 13396
  $$expand_i1_val31 = $22 & 1; //@line 13397
  HEAP8[$82 >> 0] = $$expand_i1_val31; //@line 13398
  $83 = $ReallocAsyncCtx4 + 40 | 0; //@line 13399
  HEAP32[$83 >> 2] = $24; //@line 13400
  $84 = $ReallocAsyncCtx4 + 44 | 0; //@line 13401
  HEAP32[$84 >> 2] = $26; //@line 13402
  $85 = $ReallocAsyncCtx4 + 48 | 0; //@line 13403
  HEAP32[$85 >> 2] = $28; //@line 13404
  $86 = $ReallocAsyncCtx4 + 52 | 0; //@line 13405
  HEAP32[$86 >> 2] = $30; //@line 13406
  $87 = $ReallocAsyncCtx4 + 56 | 0; //@line 13407
  HEAP32[$87 >> 2] = $32; //@line 13408
  $88 = $ReallocAsyncCtx4 + 60 | 0; //@line 13409
  HEAP32[$88 >> 2] = $34; //@line 13410
  $89 = $ReallocAsyncCtx4 + 64 | 0; //@line 13411
  HEAP32[$89 >> 2] = $36; //@line 13412
  $90 = $ReallocAsyncCtx4 + 68 | 0; //@line 13413
  HEAP32[$90 >> 2] = $38; //@line 13414
  $91 = $ReallocAsyncCtx4 + 72 | 0; //@line 13415
  HEAP32[$91 >> 2] = $40; //@line 13416
  sp = STACKTOP; //@line 13417
  return;
 } else if ((label | 0) == 11) {
  $ReallocAsyncCtx2 = _emscripten_realloc_async_context(84) | 0; //@line 13422
  FUNCTION_TABLE_vi[$102 & 127]($$reg2mem$0 + 36 | 0); //@line 13423
  if (___async) {
   HEAP32[$ReallocAsyncCtx2 >> 2] = 29; //@line 13426
   $105 = $ReallocAsyncCtx2 + 4 | 0; //@line 13427
   HEAP32[$105 >> 2] = $2; //@line 13428
   $106 = $ReallocAsyncCtx2 + 8 | 0; //@line 13429
   HEAP32[$106 >> 2] = $$reg2mem$0; //@line 13430
   $107 = $ReallocAsyncCtx2 + 12 | 0; //@line 13431
   HEAP32[$107 >> 2] = $42; //@line 13432
   $108 = $ReallocAsyncCtx2 + 16 | 0; //@line 13433
   HEAP32[$108 >> 2] = $$reg2mem24$0; //@line 13434
   $109 = $ReallocAsyncCtx2 + 20 | 0; //@line 13435
   HEAP32[$109 >> 2] = $10; //@line 13436
   $110 = $ReallocAsyncCtx2 + 24 | 0; //@line 13437
   HEAP32[$110 >> 2] = $12; //@line 13438
   $111 = $ReallocAsyncCtx2 + 28 | 0; //@line 13439
   HEAP32[$111 >> 2] = $14; //@line 13440
   $112 = $ReallocAsyncCtx2 + 32 | 0; //@line 13441
   HEAP32[$112 >> 2] = $16; //@line 13442
   $113 = $ReallocAsyncCtx2 + 36 | 0; //@line 13443
   HEAP32[$113 >> 2] = $18; //@line 13444
   $114 = $ReallocAsyncCtx2 + 40 | 0; //@line 13445
   HEAP32[$114 >> 2] = $20; //@line 13446
   $115 = $ReallocAsyncCtx2 + 44 | 0; //@line 13447
   $$expand_i1_val33 = $22 & 1; //@line 13448
   HEAP8[$115 >> 0] = $$expand_i1_val33; //@line 13449
   $116 = $ReallocAsyncCtx2 + 48 | 0; //@line 13450
   HEAP32[$116 >> 2] = $24; //@line 13451
   $117 = $ReallocAsyncCtx2 + 52 | 0; //@line 13452
   HEAP32[$117 >> 2] = $26; //@line 13453
   $118 = $ReallocAsyncCtx2 + 56 | 0; //@line 13454
   HEAP32[$118 >> 2] = $28; //@line 13455
   $119 = $ReallocAsyncCtx2 + 60 | 0; //@line 13456
   HEAP32[$119 >> 2] = $30; //@line 13457
   $120 = $ReallocAsyncCtx2 + 64 | 0; //@line 13458
   HEAP32[$120 >> 2] = $32; //@line 13459
   $121 = $ReallocAsyncCtx2 + 68 | 0; //@line 13460
   HEAP32[$121 >> 2] = $34; //@line 13461
   $122 = $ReallocAsyncCtx2 + 72 | 0; //@line 13462
   HEAP32[$122 >> 2] = $36; //@line 13463
   $123 = $ReallocAsyncCtx2 + 76 | 0; //@line 13464
   HEAP32[$123 >> 2] = $38; //@line 13465
   $124 = $ReallocAsyncCtx2 + 80 | 0; //@line 13466
   HEAP32[$124 >> 2] = $40; //@line 13467
   sp = STACKTOP; //@line 13468
   return;
  }
  ___async_unwind = 0; //@line 13471
  HEAP32[$ReallocAsyncCtx2 >> 2] = 29; //@line 13472
  $105 = $ReallocAsyncCtx2 + 4 | 0; //@line 13473
  HEAP32[$105 >> 2] = $2; //@line 13474
  $106 = $ReallocAsyncCtx2 + 8 | 0; //@line 13475
  HEAP32[$106 >> 2] = $$reg2mem$0; //@line 13476
  $107 = $ReallocAsyncCtx2 + 12 | 0; //@line 13477
  HEAP32[$107 >> 2] = $42; //@line 13478
  $108 = $ReallocAsyncCtx2 + 16 | 0; //@line 13479
  HEAP32[$108 >> 2] = $$reg2mem24$0; //@line 13480
  $109 = $ReallocAsyncCtx2 + 20 | 0; //@line 13481
  HEAP32[$109 >> 2] = $10; //@line 13482
  $110 = $ReallocAsyncCtx2 + 24 | 0; //@line 13483
  HEAP32[$110 >> 2] = $12; //@line 13484
  $111 = $ReallocAsyncCtx2 + 28 | 0; //@line 13485
  HEAP32[$111 >> 2] = $14; //@line 13486
  $112 = $ReallocAsyncCtx2 + 32 | 0; //@line 13487
  HEAP32[$112 >> 2] = $16; //@line 13488
  $113 = $ReallocAsyncCtx2 + 36 | 0; //@line 13489
  HEAP32[$113 >> 2] = $18; //@line 13490
  $114 = $ReallocAsyncCtx2 + 40 | 0; //@line 13491
  HEAP32[$114 >> 2] = $20; //@line 13492
  $115 = $ReallocAsyncCtx2 + 44 | 0; //@line 13493
  $$expand_i1_val33 = $22 & 1; //@line 13494
  HEAP8[$115 >> 0] = $$expand_i1_val33; //@line 13495
  $116 = $ReallocAsyncCtx2 + 48 | 0; //@line 13496
  HEAP32[$116 >> 2] = $24; //@line 13497
  $117 = $ReallocAsyncCtx2 + 52 | 0; //@line 13498
  HEAP32[$117 >> 2] = $26; //@line 13499
  $118 = $ReallocAsyncCtx2 + 56 | 0; //@line 13500
  HEAP32[$118 >> 2] = $28; //@line 13501
  $119 = $ReallocAsyncCtx2 + 60 | 0; //@line 13502
  HEAP32[$119 >> 2] = $30; //@line 13503
  $120 = $ReallocAsyncCtx2 + 64 | 0; //@line 13504
  HEAP32[$120 >> 2] = $32; //@line 13505
  $121 = $ReallocAsyncCtx2 + 68 | 0; //@line 13506
  HEAP32[$121 >> 2] = $34; //@line 13507
  $122 = $ReallocAsyncCtx2 + 72 | 0; //@line 13508
  HEAP32[$122 >> 2] = $36; //@line 13509
  $123 = $ReallocAsyncCtx2 + 76 | 0; //@line 13510
  HEAP32[$123 >> 2] = $38; //@line 13511
  $124 = $ReallocAsyncCtx2 + 80 | 0; //@line 13512
  HEAP32[$124 >> 2] = $40; //@line 13513
  sp = STACKTOP; //@line 13514
  return;
 } else if ((label | 0) == 24) {
  $140 = _equeue_tick() | 0; //@line 13518
  if ($22) {
   $141 = $20 - $140 | 0; //@line 13520
   if (($141 | 0) < 1) {
    $143 = $18 + 40 | 0; //@line 13523
    if (HEAP32[$143 >> 2] | 0) {
     _equeue_mutex_lock($12); //@line 13527
     $146 = HEAP32[$143 >> 2] | 0; //@line 13528
     if ($146 | 0) {
      $148 = HEAP32[$36 >> 2] | 0; //@line 13531
      if ($148 | 0) {
       $151 = HEAP32[$18 + 44 >> 2] | 0; //@line 13535
       $154 = (HEAP32[$148 + 20 >> 2] | 0) - $140 | 0; //@line 13538
       $ReallocAsyncCtx3 = _emscripten_realloc_async_context(16) | 0; //@line 13542
       FUNCTION_TABLE_vii[$146 & 3]($151, $154 & ~($154 >> 31)); //@line 13543
       if (___async) {
        HEAP32[$ReallocAsyncCtx3 >> 2] = 30; //@line 13546
        $158 = $ReallocAsyncCtx3 + 4 | 0; //@line 13547
        HEAP32[$158 >> 2] = $28; //@line 13548
        $159 = $ReallocAsyncCtx3 + 8 | 0; //@line 13549
        HEAP32[$159 >> 2] = $12; //@line 13550
        $160 = $ReallocAsyncCtx3 + 12 | 0; //@line 13551
        HEAP32[$160 >> 2] = $26; //@line 13552
        sp = STACKTOP; //@line 13553
        return;
       }
       ___async_unwind = 0; //@line 13556
       HEAP32[$ReallocAsyncCtx3 >> 2] = 30; //@line 13557
       $158 = $ReallocAsyncCtx3 + 4 | 0; //@line 13558
       HEAP32[$158 >> 2] = $28; //@line 13559
       $159 = $ReallocAsyncCtx3 + 8 | 0; //@line 13560
       HEAP32[$159 >> 2] = $12; //@line 13561
       $160 = $ReallocAsyncCtx3 + 12 | 0; //@line 13562
       HEAP32[$160 >> 2] = $26; //@line 13563
       sp = STACKTOP; //@line 13564
       return;
      }
     }
     HEAP8[$28 >> 0] = 1; //@line 13568
     _equeue_mutex_unlock($12); //@line 13569
    }
    HEAP8[$26 >> 0] = 0; //@line 13571
    return;
   } else {
    $$065 = $141; //@line 13574
   }
  } else {
   $$065 = -1; //@line 13577
  }
  _equeue_mutex_lock($12); //@line 13579
  $161 = HEAP32[$36 >> 2] | 0; //@line 13580
  if (!$161) {
   $$2 = $$065; //@line 13583
  } else {
   $165 = (HEAP32[$161 + 20 >> 2] | 0) - $140 | 0; //@line 13587
   $168 = $165 & ~($165 >> 31); //@line 13590
   $$2 = $168 >>> 0 < $$065 >>> 0 ? $168 : $$065; //@line 13593
  }
  _equeue_mutex_unlock($12); //@line 13595
  _equeue_sema_wait($38, $$2) | 0; //@line 13596
  do {
   if (HEAP8[$26 >> 0] | 0) {
    _equeue_mutex_lock($12); //@line 13601
    if (!(HEAP8[$26 >> 0] | 0)) {
     _equeue_mutex_unlock($12); //@line 13605
     break;
    }
    HEAP8[$26 >> 0] = 0; //@line 13608
    _equeue_mutex_unlock($12); //@line 13609
    return;
   }
  } while (0);
  $174 = _equeue_tick() | 0; //@line 13613
  $ReallocAsyncCtx5 = _emscripten_realloc_async_context(76) | 0; //@line 13614
  _wait_ms(20); //@line 13615
  if (___async) {
   HEAP32[$ReallocAsyncCtx5 >> 2] = 31; //@line 13618
   $175 = $ReallocAsyncCtx5 + 4 | 0; //@line 13619
   HEAP32[$175 >> 2] = $2; //@line 13620
   $176 = $ReallocAsyncCtx5 + 8 | 0; //@line 13621
   HEAP32[$176 >> 2] = $10; //@line 13622
   $177 = $ReallocAsyncCtx5 + 12 | 0; //@line 13623
   HEAP32[$177 >> 2] = $12; //@line 13624
   $178 = $ReallocAsyncCtx5 + 16 | 0; //@line 13625
   HEAP32[$178 >> 2] = $174; //@line 13626
   $179 = $ReallocAsyncCtx5 + 20 | 0; //@line 13627
   HEAP32[$179 >> 2] = $14; //@line 13628
   $180 = $ReallocAsyncCtx5 + 24 | 0; //@line 13629
   HEAP32[$180 >> 2] = $16; //@line 13630
   $181 = $ReallocAsyncCtx5 + 28 | 0; //@line 13631
   HEAP32[$181 >> 2] = $18; //@line 13632
   $182 = $ReallocAsyncCtx5 + 32 | 0; //@line 13633
   HEAP32[$182 >> 2] = $20; //@line 13634
   $183 = $ReallocAsyncCtx5 + 36 | 0; //@line 13635
   $$expand_i1_val35 = $22 & 1; //@line 13636
   HEAP8[$183 >> 0] = $$expand_i1_val35; //@line 13637
   $184 = $ReallocAsyncCtx5 + 40 | 0; //@line 13638
   HEAP32[$184 >> 2] = $24; //@line 13639
   $185 = $ReallocAsyncCtx5 + 44 | 0; //@line 13640
   HEAP32[$185 >> 2] = $26; //@line 13641
   $186 = $ReallocAsyncCtx5 + 48 | 0; //@line 13642
   HEAP32[$186 >> 2] = $28; //@line 13643
   $187 = $ReallocAsyncCtx5 + 52 | 0; //@line 13644
   HEAP32[$187 >> 2] = $30; //@line 13645
   $188 = $ReallocAsyncCtx5 + 56 | 0; //@line 13646
   HEAP32[$188 >> 2] = $32; //@line 13647
   $189 = $ReallocAsyncCtx5 + 60 | 0; //@line 13648
   HEAP32[$189 >> 2] = $34; //@line 13649
   $190 = $ReallocAsyncCtx5 + 64 | 0; //@line 13650
   HEAP32[$190 >> 2] = $36; //@line 13651
   $191 = $ReallocAsyncCtx5 + 68 | 0; //@line 13652
   HEAP32[$191 >> 2] = $38; //@line 13653
   $192 = $ReallocAsyncCtx5 + 72 | 0; //@line 13654
   HEAP32[$192 >> 2] = $40; //@line 13655
   sp = STACKTOP; //@line 13656
   return;
  }
  ___async_unwind = 0; //@line 13659
  HEAP32[$ReallocAsyncCtx5 >> 2] = 31; //@line 13660
  $175 = $ReallocAsyncCtx5 + 4 | 0; //@line 13661
  HEAP32[$175 >> 2] = $2; //@line 13662
  $176 = $ReallocAsyncCtx5 + 8 | 0; //@line 13663
  HEAP32[$176 >> 2] = $10; //@line 13664
  $177 = $ReallocAsyncCtx5 + 12 | 0; //@line 13665
  HEAP32[$177 >> 2] = $12; //@line 13666
  $178 = $ReallocAsyncCtx5 + 16 | 0; //@line 13667
  HEAP32[$178 >> 2] = $174; //@line 13668
  $179 = $ReallocAsyncCtx5 + 20 | 0; //@line 13669
  HEAP32[$179 >> 2] = $14; //@line 13670
  $180 = $ReallocAsyncCtx5 + 24 | 0; //@line 13671
  HEAP32[$180 >> 2] = $16; //@line 13672
  $181 = $ReallocAsyncCtx5 + 28 | 0; //@line 13673
  HEAP32[$181 >> 2] = $18; //@line 13674
  $182 = $ReallocAsyncCtx5 + 32 | 0; //@line 13675
  HEAP32[$182 >> 2] = $20; //@line 13676
  $183 = $ReallocAsyncCtx5 + 36 | 0; //@line 13677
  $$expand_i1_val35 = $22 & 1; //@line 13678
  HEAP8[$183 >> 0] = $$expand_i1_val35; //@line 13679
  $184 = $ReallocAsyncCtx5 + 40 | 0; //@line 13680
  HEAP32[$184 >> 2] = $24; //@line 13681
  $185 = $ReallocAsyncCtx5 + 44 | 0; //@line 13682
  HEAP32[$185 >> 2] = $26; //@line 13683
  $186 = $ReallocAsyncCtx5 + 48 | 0; //@line 13684
  HEAP32[$186 >> 2] = $28; //@line 13685
  $187 = $ReallocAsyncCtx5 + 52 | 0; //@line 13686
  HEAP32[$187 >> 2] = $30; //@line 13687
  $188 = $ReallocAsyncCtx5 + 56 | 0; //@line 13688
  HEAP32[$188 >> 2] = $32; //@line 13689
  $189 = $ReallocAsyncCtx5 + 60 | 0; //@line 13690
  HEAP32[$189 >> 2] = $34; //@line 13691
  $190 = $ReallocAsyncCtx5 + 64 | 0; //@line 13692
  HEAP32[$190 >> 2] = $36; //@line 13693
  $191 = $ReallocAsyncCtx5 + 68 | 0; //@line 13694
  HEAP32[$191 >> 2] = $38; //@line 13695
  $192 = $ReallocAsyncCtx5 + 72 | 0; //@line 13696
  HEAP32[$192 >> 2] = $40; //@line 13697
  sp = STACKTOP; //@line 13698
  return;
 }
}
function _equeue_dispatch__async_cb_26($0) {
 $0 = $0 | 0;
 var $$02329$i$i = 0, $$02330$i$i = 0, $$025$i$i = 0, $$065 = 0, $$2 = 0, $$expand_i1_val = 0, $$expand_i1_val12 = 0, $$expand_i1_val14 = 0, $$expand_i1_val16 = 0, $$reg2mem$0 = 0, $$sink$in$i$i = 0, $10 = 0, $101 = 0, $102 = 0, $103 = 0, $104 = 0, $105 = 0, $106 = 0, $107 = 0, $108 = 0, $109 = 0, $110 = 0, $111 = 0, $112 = 0, $113 = 0, $114 = 0, $115 = 0, $116 = 0, $117 = 0, $118 = 0, $119 = 0, $12 = 0, $120 = 0, $121 = 0, $123 = 0, $124 = 0, $125 = 0, $127 = 0, $128 = 0, $136 = 0, $137 = 0, $139 = 0, $14 = 0, $142 = 0, $144 = 0, $147 = 0, $150 = 0, $154 = 0, $155 = 0, $156 = 0, $157 = 0, $16 = 0, $161 = 0, $164 = 0, $170 = 0, $171 = 0, $172 = 0, $173 = 0, $174 = 0, $175 = 0, $176 = 0, $177 = 0, $178 = 0, $179 = 0, $18 = 0, $180 = 0, $181 = 0, $182 = 0, $183 = 0, $184 = 0, $185 = 0, $186 = 0, $187 = 0, $188 = 0, $2 = 0, $20 = 0, $22 = 0, $24 = 0, $26 = 0, $28 = 0, $30 = 0, $32 = 0, $34 = 0, $36 = 0, $37 = 0, $38 = 0, $40 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0, $64 = 0, $66 = 0, $69 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $78 = 0, $79 = 0, $8 = 0, $80 = 0, $81 = 0, $82 = 0, $83 = 0, $84 = 0, $85 = 0, $86 = 0, $87 = 0, $88 = 0, $89 = 0, $98 = 0, $ReallocAsyncCtx = 0, $ReallocAsyncCtx2 = 0, $ReallocAsyncCtx3 = 0, $ReallocAsyncCtx4 = 0, $ReallocAsyncCtx5 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 13
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 15
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 19
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 21
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 23
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 25
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 27
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 29
 $18 = HEAP8[$0 + 36 >> 0] & 1; //@line 32
 $20 = HEAP32[$0 + 40 >> 2] | 0; //@line 34
 $22 = HEAP32[$0 + 44 >> 2] | 0; //@line 36
 $24 = HEAP32[$0 + 48 >> 2] | 0; //@line 38
 $26 = HEAP32[$0 + 52 >> 2] | 0; //@line 40
 $28 = HEAP32[$0 + 56 >> 2] | 0; //@line 42
 $30 = HEAP32[$0 + 60 >> 2] | 0; //@line 44
 $32 = HEAP32[$0 + 64 >> 2] | 0; //@line 46
 $34 = HEAP32[$0 + 68 >> 2] | 0; //@line 48
 $36 = HEAP32[$0 + 72 >> 2] | 0; //@line 50
 $$reg2mem$0 = HEAP32[$0 + 8 >> 2] | 0; //@line 51
 while (1) {
  if (!$$reg2mem$0) {
   label = 24; //@line 55
   break;
  }
  $37 = $$reg2mem$0 + 8 | 0; //@line 58
  $38 = HEAP32[$37 >> 2] | 0; //@line 59
  $40 = HEAP32[$$reg2mem$0 + 32 >> 2] | 0; //@line 61
  if ($40 | 0) {
   label = 3; //@line 64
   break;
  }
  $64 = HEAP32[$$reg2mem$0 + 24 >> 2] | 0; //@line 68
  if (($64 | 0) > -1) {
   label = 7; //@line 71
   break;
  }
  $88 = $$reg2mem$0 + 4 | 0; //@line 75
  $89 = HEAP8[$88 >> 0] | 0; //@line 76
  HEAP8[$88 >> 0] = (($89 + 1 & 255) << HEAP32[$36 >> 2] | 0) == 0 ? 1 : ($89 & 255) + 1 & 255; //@line 85
  $98 = HEAP32[$$reg2mem$0 + 28 >> 2] | 0; //@line 87
  if ($98 | 0) {
   label = 12; //@line 90
   break;
  }
  _equeue_mutex_lock($6); //@line 93
  $121 = HEAP32[$2 >> 2] | 0; //@line 94
  L8 : do {
   if (!$121) {
    $$02329$i$i = $2; //@line 98
    label = 21; //@line 99
   } else {
    $123 = HEAP32[$$reg2mem$0 >> 2] | 0; //@line 101
    $$025$i$i = $2; //@line 102
    $125 = $121; //@line 102
    while (1) {
     $124 = HEAP32[$125 >> 2] | 0; //@line 104
     if ($124 >>> 0 >= $123 >>> 0) {
      break;
     }
     $127 = $125 + 8 | 0; //@line 109
     $128 = HEAP32[$127 >> 2] | 0; //@line 110
     if (!$128) {
      $$02329$i$i = $127; //@line 113
      label = 21; //@line 114
      break L8;
     } else {
      $$025$i$i = $127; //@line 117
      $125 = $128; //@line 117
     }
    }
    if (($124 | 0) == ($123 | 0)) {
     HEAP32[$$reg2mem$0 + 12 >> 2] = $125; //@line 123
     $$02330$i$i = $$025$i$i; //@line 126
     $$sink$in$i$i = (HEAP32[$$025$i$i >> 2] | 0) + 8 | 0; //@line 126
    } else {
     $$02329$i$i = $$025$i$i; //@line 128
     label = 21; //@line 129
    }
   }
  } while (0);
  if ((label | 0) == 21) {
   label = 0; //@line 134
   HEAP32[$$reg2mem$0 + 12 >> 2] = 0; //@line 136
   $$02330$i$i = $$02329$i$i; //@line 137
   $$sink$in$i$i = $$02329$i$i; //@line 137
  }
  HEAP32[$37 >> 2] = HEAP32[$$sink$in$i$i >> 2]; //@line 140
  HEAP32[$$02330$i$i >> 2] = $$reg2mem$0; //@line 141
  _equeue_mutex_unlock($6); //@line 142
  $$reg2mem$0 = $38; //@line 143
 }
 if ((label | 0) == 3) {
  $ReallocAsyncCtx = _emscripten_realloc_async_context(84) | 0; //@line 147
  FUNCTION_TABLE_vi[$40 & 127]($$reg2mem$0 + 36 | 0); //@line 148
  if (___async) {
   HEAP32[$ReallocAsyncCtx >> 2] = 27; //@line 151
   $43 = $ReallocAsyncCtx + 4 | 0; //@line 152
   HEAP32[$43 >> 2] = $2; //@line 153
   $44 = $ReallocAsyncCtx + 8 | 0; //@line 154
   HEAP32[$44 >> 2] = $$reg2mem$0; //@line 155
   $45 = $ReallocAsyncCtx + 12 | 0; //@line 156
   HEAP32[$45 >> 2] = $38; //@line 157
   $46 = $ReallocAsyncCtx + 16 | 0; //@line 158
   HEAP32[$46 >> 2] = $37; //@line 159
   $47 = $ReallocAsyncCtx + 20 | 0; //@line 160
   HEAP32[$47 >> 2] = $6; //@line 161
   $48 = $ReallocAsyncCtx + 24 | 0; //@line 162
   HEAP32[$48 >> 2] = $8; //@line 163
   $49 = $ReallocAsyncCtx + 28 | 0; //@line 164
   HEAP32[$49 >> 2] = $10; //@line 165
   $50 = $ReallocAsyncCtx + 32 | 0; //@line 166
   HEAP32[$50 >> 2] = $12; //@line 167
   $51 = $ReallocAsyncCtx + 36 | 0; //@line 168
   HEAP32[$51 >> 2] = $14; //@line 169
   $52 = $ReallocAsyncCtx + 40 | 0; //@line 170
   HEAP32[$52 >> 2] = $16; //@line 171
   $53 = $ReallocAsyncCtx + 44 | 0; //@line 172
   $$expand_i1_val = $18 & 1; //@line 173
   HEAP8[$53 >> 0] = $$expand_i1_val; //@line 174
   $54 = $ReallocAsyncCtx + 48 | 0; //@line 175
   HEAP32[$54 >> 2] = $20; //@line 176
   $55 = $ReallocAsyncCtx + 52 | 0; //@line 177
   HEAP32[$55 >> 2] = $22; //@line 178
   $56 = $ReallocAsyncCtx + 56 | 0; //@line 179
   HEAP32[$56 >> 2] = $24; //@line 180
   $57 = $ReallocAsyncCtx + 60 | 0; //@line 181
   HEAP32[$57 >> 2] = $26; //@line 182
   $58 = $ReallocAsyncCtx + 64 | 0; //@line 183
   HEAP32[$58 >> 2] = $28; //@line 184
   $59 = $ReallocAsyncCtx + 68 | 0; //@line 185
   HEAP32[$59 >> 2] = $30; //@line 186
   $60 = $ReallocAsyncCtx + 72 | 0; //@line 187
   HEAP32[$60 >> 2] = $32; //@line 188
   $61 = $ReallocAsyncCtx + 76 | 0; //@line 189
   HEAP32[$61 >> 2] = $34; //@line 190
   $62 = $ReallocAsyncCtx + 80 | 0; //@line 191
   HEAP32[$62 >> 2] = $36; //@line 192
   sp = STACKTOP; //@line 193
   return;
  }
  ___async_unwind = 0; //@line 196
  HEAP32[$ReallocAsyncCtx >> 2] = 27; //@line 197
  $43 = $ReallocAsyncCtx + 4 | 0; //@line 198
  HEAP32[$43 >> 2] = $2; //@line 199
  $44 = $ReallocAsyncCtx + 8 | 0; //@line 200
  HEAP32[$44 >> 2] = $$reg2mem$0; //@line 201
  $45 = $ReallocAsyncCtx + 12 | 0; //@line 202
  HEAP32[$45 >> 2] = $38; //@line 203
  $46 = $ReallocAsyncCtx + 16 | 0; //@line 204
  HEAP32[$46 >> 2] = $37; //@line 205
  $47 = $ReallocAsyncCtx + 20 | 0; //@line 206
  HEAP32[$47 >> 2] = $6; //@line 207
  $48 = $ReallocAsyncCtx + 24 | 0; //@line 208
  HEAP32[$48 >> 2] = $8; //@line 209
  $49 = $ReallocAsyncCtx + 28 | 0; //@line 210
  HEAP32[$49 >> 2] = $10; //@line 211
  $50 = $ReallocAsyncCtx + 32 | 0; //@line 212
  HEAP32[$50 >> 2] = $12; //@line 213
  $51 = $ReallocAsyncCtx + 36 | 0; //@line 214
  HEAP32[$51 >> 2] = $14; //@line 215
  $52 = $ReallocAsyncCtx + 40 | 0; //@line 216
  HEAP32[$52 >> 2] = $16; //@line 217
  $53 = $ReallocAsyncCtx + 44 | 0; //@line 218
  $$expand_i1_val = $18 & 1; //@line 219
  HEAP8[$53 >> 0] = $$expand_i1_val; //@line 220
  $54 = $ReallocAsyncCtx + 48 | 0; //@line 221
  HEAP32[$54 >> 2] = $20; //@line 222
  $55 = $ReallocAsyncCtx + 52 | 0; //@line 223
  HEAP32[$55 >> 2] = $22; //@line 224
  $56 = $ReallocAsyncCtx + 56 | 0; //@line 225
  HEAP32[$56 >> 2] = $24; //@line 226
  $57 = $ReallocAsyncCtx + 60 | 0; //@line 227
  HEAP32[$57 >> 2] = $26; //@line 228
  $58 = $ReallocAsyncCtx + 64 | 0; //@line 229
  HEAP32[$58 >> 2] = $28; //@line 230
  $59 = $ReallocAsyncCtx + 68 | 0; //@line 231
  HEAP32[$59 >> 2] = $30; //@line 232
  $60 = $ReallocAsyncCtx + 72 | 0; //@line 233
  HEAP32[$60 >> 2] = $32; //@line 234
  $61 = $ReallocAsyncCtx + 76 | 0; //@line 235
  HEAP32[$61 >> 2] = $34; //@line 236
  $62 = $ReallocAsyncCtx + 80 | 0; //@line 237
  HEAP32[$62 >> 2] = $36; //@line 238
  sp = STACKTOP; //@line 239
  return;
 } else if ((label | 0) == 7) {
  $66 = $$reg2mem$0 + 20 | 0; //@line 243
  HEAP32[$66 >> 2] = (HEAP32[$66 >> 2] | 0) + $64; //@line 246
  $69 = _equeue_tick() | 0; //@line 247
  $ReallocAsyncCtx4 = _emscripten_realloc_async_context(76) | 0; //@line 248
  _equeue_enqueue($14, $$reg2mem$0, $69) | 0; //@line 249
  if (___async) {
   HEAP32[$ReallocAsyncCtx4 >> 2] = 28; //@line 252
   $70 = $ReallocAsyncCtx4 + 4 | 0; //@line 253
   HEAP32[$70 >> 2] = $2; //@line 254
   $71 = $ReallocAsyncCtx4 + 8 | 0; //@line 255
   HEAP32[$71 >> 2] = $38; //@line 256
   $72 = $ReallocAsyncCtx4 + 12 | 0; //@line 257
   HEAP32[$72 >> 2] = $6; //@line 258
   $73 = $ReallocAsyncCtx4 + 16 | 0; //@line 259
   HEAP32[$73 >> 2] = $8; //@line 260
   $74 = $ReallocAsyncCtx4 + 20 | 0; //@line 261
   HEAP32[$74 >> 2] = $10; //@line 262
   $75 = $ReallocAsyncCtx4 + 24 | 0; //@line 263
   HEAP32[$75 >> 2] = $12; //@line 264
   $76 = $ReallocAsyncCtx4 + 28 | 0; //@line 265
   HEAP32[$76 >> 2] = $14; //@line 266
   $77 = $ReallocAsyncCtx4 + 32 | 0; //@line 267
   HEAP32[$77 >> 2] = $16; //@line 268
   $78 = $ReallocAsyncCtx4 + 36 | 0; //@line 269
   $$expand_i1_val12 = $18 & 1; //@line 270
   HEAP8[$78 >> 0] = $$expand_i1_val12; //@line 271
   $79 = $ReallocAsyncCtx4 + 40 | 0; //@line 272
   HEAP32[$79 >> 2] = $20; //@line 273
   $80 = $ReallocAsyncCtx4 + 44 | 0; //@line 274
   HEAP32[$80 >> 2] = $22; //@line 275
   $81 = $ReallocAsyncCtx4 + 48 | 0; //@line 276
   HEAP32[$81 >> 2] = $24; //@line 277
   $82 = $ReallocAsyncCtx4 + 52 | 0; //@line 278
   HEAP32[$82 >> 2] = $26; //@line 279
   $83 = $ReallocAsyncCtx4 + 56 | 0; //@line 280
   HEAP32[$83 >> 2] = $28; //@line 281
   $84 = $ReallocAsyncCtx4 + 60 | 0; //@line 282
   HEAP32[$84 >> 2] = $30; //@line 283
   $85 = $ReallocAsyncCtx4 + 64 | 0; //@line 284
   HEAP32[$85 >> 2] = $32; //@line 285
   $86 = $ReallocAsyncCtx4 + 68 | 0; //@line 286
   HEAP32[$86 >> 2] = $34; //@line 287
   $87 = $ReallocAsyncCtx4 + 72 | 0; //@line 288
   HEAP32[$87 >> 2] = $36; //@line 289
   sp = STACKTOP; //@line 290
   return;
  }
  ___async_unwind = 0; //@line 293
  HEAP32[$ReallocAsyncCtx4 >> 2] = 28; //@line 294
  $70 = $ReallocAsyncCtx4 + 4 | 0; //@line 295
  HEAP32[$70 >> 2] = $2; //@line 296
  $71 = $ReallocAsyncCtx4 + 8 | 0; //@line 297
  HEAP32[$71 >> 2] = $38; //@line 298
  $72 = $ReallocAsyncCtx4 + 12 | 0; //@line 299
  HEAP32[$72 >> 2] = $6; //@line 300
  $73 = $ReallocAsyncCtx4 + 16 | 0; //@line 301
  HEAP32[$73 >> 2] = $8; //@line 302
  $74 = $ReallocAsyncCtx4 + 20 | 0; //@line 303
  HEAP32[$74 >> 2] = $10; //@line 304
  $75 = $ReallocAsyncCtx4 + 24 | 0; //@line 305
  HEAP32[$75 >> 2] = $12; //@line 306
  $76 = $ReallocAsyncCtx4 + 28 | 0; //@line 307
  HEAP32[$76 >> 2] = $14; //@line 308
  $77 = $ReallocAsyncCtx4 + 32 | 0; //@line 309
  HEAP32[$77 >> 2] = $16; //@line 310
  $78 = $ReallocAsyncCtx4 + 36 | 0; //@line 311
  $$expand_i1_val12 = $18 & 1; //@line 312
  HEAP8[$78 >> 0] = $$expand_i1_val12; //@line 313
  $79 = $ReallocAsyncCtx4 + 40 | 0; //@line 314
  HEAP32[$79 >> 2] = $20; //@line 315
  $80 = $ReallocAsyncCtx4 + 44 | 0; //@line 316
  HEAP32[$80 >> 2] = $22; //@line 317
  $81 = $ReallocAsyncCtx4 + 48 | 0; //@line 318
  HEAP32[$81 >> 2] = $24; //@line 319
  $82 = $ReallocAsyncCtx4 + 52 | 0; //@line 320
  HEAP32[$82 >> 2] = $26; //@line 321
  $83 = $ReallocAsyncCtx4 + 56 | 0; //@line 322
  HEAP32[$83 >> 2] = $28; //@line 323
  $84 = $ReallocAsyncCtx4 + 60 | 0; //@line 324
  HEAP32[$84 >> 2] = $30; //@line 325
  $85 = $ReallocAsyncCtx4 + 64 | 0; //@line 326
  HEAP32[$85 >> 2] = $32; //@line 327
  $86 = $ReallocAsyncCtx4 + 68 | 0; //@line 328
  HEAP32[$86 >> 2] = $34; //@line 329
  $87 = $ReallocAsyncCtx4 + 72 | 0; //@line 330
  HEAP32[$87 >> 2] = $36; //@line 331
  sp = STACKTOP; //@line 332
  return;
 } else if ((label | 0) == 12) {
  $ReallocAsyncCtx2 = _emscripten_realloc_async_context(84) | 0; //@line 337
  FUNCTION_TABLE_vi[$98 & 127]($$reg2mem$0 + 36 | 0); //@line 338
  if (___async) {
   HEAP32[$ReallocAsyncCtx2 >> 2] = 29; //@line 341
   $101 = $ReallocAsyncCtx2 + 4 | 0; //@line 342
   HEAP32[$101 >> 2] = $2; //@line 343
   $102 = $ReallocAsyncCtx2 + 8 | 0; //@line 344
   HEAP32[$102 >> 2] = $$reg2mem$0; //@line 345
   $103 = $ReallocAsyncCtx2 + 12 | 0; //@line 346
   HEAP32[$103 >> 2] = $38; //@line 347
   $104 = $ReallocAsyncCtx2 + 16 | 0; //@line 348
   HEAP32[$104 >> 2] = $37; //@line 349
   $105 = $ReallocAsyncCtx2 + 20 | 0; //@line 350
   HEAP32[$105 >> 2] = $6; //@line 351
   $106 = $ReallocAsyncCtx2 + 24 | 0; //@line 352
   HEAP32[$106 >> 2] = $8; //@line 353
   $107 = $ReallocAsyncCtx2 + 28 | 0; //@line 354
   HEAP32[$107 >> 2] = $10; //@line 355
   $108 = $ReallocAsyncCtx2 + 32 | 0; //@line 356
   HEAP32[$108 >> 2] = $12; //@line 357
   $109 = $ReallocAsyncCtx2 + 36 | 0; //@line 358
   HEAP32[$109 >> 2] = $14; //@line 359
   $110 = $ReallocAsyncCtx2 + 40 | 0; //@line 360
   HEAP32[$110 >> 2] = $16; //@line 361
   $111 = $ReallocAsyncCtx2 + 44 | 0; //@line 362
   $$expand_i1_val14 = $18 & 1; //@line 363
   HEAP8[$111 >> 0] = $$expand_i1_val14; //@line 364
   $112 = $ReallocAsyncCtx2 + 48 | 0; //@line 365
   HEAP32[$112 >> 2] = $20; //@line 366
   $113 = $ReallocAsyncCtx2 + 52 | 0; //@line 367
   HEAP32[$113 >> 2] = $22; //@line 368
   $114 = $ReallocAsyncCtx2 + 56 | 0; //@line 369
   HEAP32[$114 >> 2] = $24; //@line 370
   $115 = $ReallocAsyncCtx2 + 60 | 0; //@line 371
   HEAP32[$115 >> 2] = $26; //@line 372
   $116 = $ReallocAsyncCtx2 + 64 | 0; //@line 373
   HEAP32[$116 >> 2] = $28; //@line 374
   $117 = $ReallocAsyncCtx2 + 68 | 0; //@line 375
   HEAP32[$117 >> 2] = $30; //@line 376
   $118 = $ReallocAsyncCtx2 + 72 | 0; //@line 377
   HEAP32[$118 >> 2] = $32; //@line 378
   $119 = $ReallocAsyncCtx2 + 76 | 0; //@line 379
   HEAP32[$119 >> 2] = $34; //@line 380
   $120 = $ReallocAsyncCtx2 + 80 | 0; //@line 381
   HEAP32[$120 >> 2] = $36; //@line 382
   sp = STACKTOP; //@line 383
   return;
  }
  ___async_unwind = 0; //@line 386
  HEAP32[$ReallocAsyncCtx2 >> 2] = 29; //@line 387
  $101 = $ReallocAsyncCtx2 + 4 | 0; //@line 388
  HEAP32[$101 >> 2] = $2; //@line 389
  $102 = $ReallocAsyncCtx2 + 8 | 0; //@line 390
  HEAP32[$102 >> 2] = $$reg2mem$0; //@line 391
  $103 = $ReallocAsyncCtx2 + 12 | 0; //@line 392
  HEAP32[$103 >> 2] = $38; //@line 393
  $104 = $ReallocAsyncCtx2 + 16 | 0; //@line 394
  HEAP32[$104 >> 2] = $37; //@line 395
  $105 = $ReallocAsyncCtx2 + 20 | 0; //@line 396
  HEAP32[$105 >> 2] = $6; //@line 397
  $106 = $ReallocAsyncCtx2 + 24 | 0; //@line 398
  HEAP32[$106 >> 2] = $8; //@line 399
  $107 = $ReallocAsyncCtx2 + 28 | 0; //@line 400
  HEAP32[$107 >> 2] = $10; //@line 401
  $108 = $ReallocAsyncCtx2 + 32 | 0; //@line 402
  HEAP32[$108 >> 2] = $12; //@line 403
  $109 = $ReallocAsyncCtx2 + 36 | 0; //@line 404
  HEAP32[$109 >> 2] = $14; //@line 405
  $110 = $ReallocAsyncCtx2 + 40 | 0; //@line 406
  HEAP32[$110 >> 2] = $16; //@line 407
  $111 = $ReallocAsyncCtx2 + 44 | 0; //@line 408
  $$expand_i1_val14 = $18 & 1; //@line 409
  HEAP8[$111 >> 0] = $$expand_i1_val14; //@line 410
  $112 = $ReallocAsyncCtx2 + 48 | 0; //@line 411
  HEAP32[$112 >> 2] = $20; //@line 412
  $113 = $ReallocAsyncCtx2 + 52 | 0; //@line 413
  HEAP32[$113 >> 2] = $22; //@line 414
  $114 = $ReallocAsyncCtx2 + 56 | 0; //@line 415
  HEAP32[$114 >> 2] = $24; //@line 416
  $115 = $ReallocAsyncCtx2 + 60 | 0; //@line 417
  HEAP32[$115 >> 2] = $26; //@line 418
  $116 = $ReallocAsyncCtx2 + 64 | 0; //@line 419
  HEAP32[$116 >> 2] = $28; //@line 420
  $117 = $ReallocAsyncCtx2 + 68 | 0; //@line 421
  HEAP32[$117 >> 2] = $30; //@line 422
  $118 = $ReallocAsyncCtx2 + 72 | 0; //@line 423
  HEAP32[$118 >> 2] = $32; //@line 424
  $119 = $ReallocAsyncCtx2 + 76 | 0; //@line 425
  HEAP32[$119 >> 2] = $34; //@line 426
  $120 = $ReallocAsyncCtx2 + 80 | 0; //@line 427
  HEAP32[$120 >> 2] = $36; //@line 428
  sp = STACKTOP; //@line 429
  return;
 } else if ((label | 0) == 24) {
  $136 = _equeue_tick() | 0; //@line 433
  if ($18) {
   $137 = $16 - $136 | 0; //@line 435
   if (($137 | 0) < 1) {
    $139 = $14 + 40 | 0; //@line 438
    if (HEAP32[$139 >> 2] | 0) {
     _equeue_mutex_lock($8); //@line 442
     $142 = HEAP32[$139 >> 2] | 0; //@line 443
     if ($142 | 0) {
      $144 = HEAP32[$32 >> 2] | 0; //@line 446
      if ($144 | 0) {
       $147 = HEAP32[$14 + 44 >> 2] | 0; //@line 450
       $150 = (HEAP32[$144 + 20 >> 2] | 0) - $136 | 0; //@line 453
       $ReallocAsyncCtx3 = _emscripten_realloc_async_context(16) | 0; //@line 457
       FUNCTION_TABLE_vii[$142 & 3]($147, $150 & ~($150 >> 31)); //@line 458
       if (___async) {
        HEAP32[$ReallocAsyncCtx3 >> 2] = 30; //@line 461
        $154 = $ReallocAsyncCtx3 + 4 | 0; //@line 462
        HEAP32[$154 >> 2] = $24; //@line 463
        $155 = $ReallocAsyncCtx3 + 8 | 0; //@line 464
        HEAP32[$155 >> 2] = $8; //@line 465
        $156 = $ReallocAsyncCtx3 + 12 | 0; //@line 466
        HEAP32[$156 >> 2] = $22; //@line 467
        sp = STACKTOP; //@line 468
        return;
       }
       ___async_unwind = 0; //@line 471
       HEAP32[$ReallocAsyncCtx3 >> 2] = 30; //@line 472
       $154 = $ReallocAsyncCtx3 + 4 | 0; //@line 473
       HEAP32[$154 >> 2] = $24; //@line 474
       $155 = $ReallocAsyncCtx3 + 8 | 0; //@line 475
       HEAP32[$155 >> 2] = $8; //@line 476
       $156 = $ReallocAsyncCtx3 + 12 | 0; //@line 477
       HEAP32[$156 >> 2] = $22; //@line 478
       sp = STACKTOP; //@line 479
       return;
      }
     }
     HEAP8[$24 >> 0] = 1; //@line 483
     _equeue_mutex_unlock($8); //@line 484
    }
    HEAP8[$22 >> 0] = 0; //@line 486
    return;
   } else {
    $$065 = $137; //@line 489
   }
  } else {
   $$065 = -1; //@line 492
  }
  _equeue_mutex_lock($8); //@line 494
  $157 = HEAP32[$32 >> 2] | 0; //@line 495
  if (!$157) {
   $$2 = $$065; //@line 498
  } else {
   $161 = (HEAP32[$157 + 20 >> 2] | 0) - $136 | 0; //@line 502
   $164 = $161 & ~($161 >> 31); //@line 505
   $$2 = $164 >>> 0 < $$065 >>> 0 ? $164 : $$065; //@line 508
  }
  _equeue_mutex_unlock($8); //@line 510
  _equeue_sema_wait($34, $$2) | 0; //@line 511
  do {
   if (HEAP8[$22 >> 0] | 0) {
    _equeue_mutex_lock($8); //@line 516
    if (!(HEAP8[$22 >> 0] | 0)) {
     _equeue_mutex_unlock($8); //@line 520
     break;
    }
    HEAP8[$22 >> 0] = 0; //@line 523
    _equeue_mutex_unlock($8); //@line 524
    return;
   }
  } while (0);
  $170 = _equeue_tick() | 0; //@line 528
  $ReallocAsyncCtx5 = _emscripten_realloc_async_context(76) | 0; //@line 529
  _wait_ms(20); //@line 530
  if (___async) {
   HEAP32[$ReallocAsyncCtx5 >> 2] = 31; //@line 533
   $171 = $ReallocAsyncCtx5 + 4 | 0; //@line 534
   HEAP32[$171 >> 2] = $2; //@line 535
   $172 = $ReallocAsyncCtx5 + 8 | 0; //@line 536
   HEAP32[$172 >> 2] = $6; //@line 537
   $173 = $ReallocAsyncCtx5 + 12 | 0; //@line 538
   HEAP32[$173 >> 2] = $8; //@line 539
   $174 = $ReallocAsyncCtx5 + 16 | 0; //@line 540
   HEAP32[$174 >> 2] = $170; //@line 541
   $175 = $ReallocAsyncCtx5 + 20 | 0; //@line 542
   HEAP32[$175 >> 2] = $10; //@line 543
   $176 = $ReallocAsyncCtx5 + 24 | 0; //@line 544
   HEAP32[$176 >> 2] = $12; //@line 545
   $177 = $ReallocAsyncCtx5 + 28 | 0; //@line 546
   HEAP32[$177 >> 2] = $14; //@line 547
   $178 = $ReallocAsyncCtx5 + 32 | 0; //@line 548
   HEAP32[$178 >> 2] = $16; //@line 549
   $179 = $ReallocAsyncCtx5 + 36 | 0; //@line 550
   $$expand_i1_val16 = $18 & 1; //@line 551
   HEAP8[$179 >> 0] = $$expand_i1_val16; //@line 552
   $180 = $ReallocAsyncCtx5 + 40 | 0; //@line 553
   HEAP32[$180 >> 2] = $20; //@line 554
   $181 = $ReallocAsyncCtx5 + 44 | 0; //@line 555
   HEAP32[$181 >> 2] = $22; //@line 556
   $182 = $ReallocAsyncCtx5 + 48 | 0; //@line 557
   HEAP32[$182 >> 2] = $24; //@line 558
   $183 = $ReallocAsyncCtx5 + 52 | 0; //@line 559
   HEAP32[$183 >> 2] = $26; //@line 560
   $184 = $ReallocAsyncCtx5 + 56 | 0; //@line 561
   HEAP32[$184 >> 2] = $28; //@line 562
   $185 = $ReallocAsyncCtx5 + 60 | 0; //@line 563
   HEAP32[$185 >> 2] = $30; //@line 564
   $186 = $ReallocAsyncCtx5 + 64 | 0; //@line 565
   HEAP32[$186 >> 2] = $32; //@line 566
   $187 = $ReallocAsyncCtx5 + 68 | 0; //@line 567
   HEAP32[$187 >> 2] = $34; //@line 568
   $188 = $ReallocAsyncCtx5 + 72 | 0; //@line 569
   HEAP32[$188 >> 2] = $36; //@line 570
   sp = STACKTOP; //@line 571
   return;
  }
  ___async_unwind = 0; //@line 574
  HEAP32[$ReallocAsyncCtx5 >> 2] = 31; //@line 575
  $171 = $ReallocAsyncCtx5 + 4 | 0; //@line 576
  HEAP32[$171 >> 2] = $2; //@line 577
  $172 = $ReallocAsyncCtx5 + 8 | 0; //@line 578
  HEAP32[$172 >> 2] = $6; //@line 579
  $173 = $ReallocAsyncCtx5 + 12 | 0; //@line 580
  HEAP32[$173 >> 2] = $8; //@line 581
  $174 = $ReallocAsyncCtx5 + 16 | 0; //@line 582
  HEAP32[$174 >> 2] = $170; //@line 583
  $175 = $ReallocAsyncCtx5 + 20 | 0; //@line 584
  HEAP32[$175 >> 2] = $10; //@line 585
  $176 = $ReallocAsyncCtx5 + 24 | 0; //@line 586
  HEAP32[$176 >> 2] = $12; //@line 587
  $177 = $ReallocAsyncCtx5 + 28 | 0; //@line 588
  HEAP32[$177 >> 2] = $14; //@line 589
  $178 = $ReallocAsyncCtx5 + 32 | 0; //@line 590
  HEAP32[$178 >> 2] = $16; //@line 591
  $179 = $ReallocAsyncCtx5 + 36 | 0; //@line 592
  $$expand_i1_val16 = $18 & 1; //@line 593
  HEAP8[$179 >> 0] = $$expand_i1_val16; //@line 594
  $180 = $ReallocAsyncCtx5 + 40 | 0; //@line 595
  HEAP32[$180 >> 2] = $20; //@line 596
  $181 = $ReallocAsyncCtx5 + 44 | 0; //@line 597
  HEAP32[$181 >> 2] = $22; //@line 598
  $182 = $ReallocAsyncCtx5 + 48 | 0; //@line 599
  HEAP32[$182 >> 2] = $24; //@line 600
  $183 = $ReallocAsyncCtx5 + 52 | 0; //@line 601
  HEAP32[$183 >> 2] = $26; //@line 602
  $184 = $ReallocAsyncCtx5 + 56 | 0; //@line 603
  HEAP32[$184 >> 2] = $28; //@line 604
  $185 = $ReallocAsyncCtx5 + 60 | 0; //@line 605
  HEAP32[$185 >> 2] = $30; //@line 606
  $186 = $ReallocAsyncCtx5 + 64 | 0; //@line 607
  HEAP32[$186 >> 2] = $32; //@line 608
  $187 = $ReallocAsyncCtx5 + 68 | 0; //@line 609
  HEAP32[$187 >> 2] = $34; //@line 610
  $188 = $ReallocAsyncCtx5 + 72 | 0; //@line 611
  HEAP32[$188 >> 2] = $36; //@line 612
  sp = STACKTOP; //@line 613
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
 sp = STACKTOP; //@line 6743
 STACKTOP = STACKTOP + 64 | 0; //@line 6744
 $5 = sp + 16 | 0; //@line 6745
 $6 = sp; //@line 6746
 $7 = sp + 24 | 0; //@line 6747
 $8 = sp + 8 | 0; //@line 6748
 $9 = sp + 20 | 0; //@line 6749
 HEAP32[$5 >> 2] = $1; //@line 6750
 $10 = ($0 | 0) != 0; //@line 6751
 $11 = $7 + 40 | 0; //@line 6752
 $12 = $11; //@line 6753
 $13 = $7 + 39 | 0; //@line 6754
 $14 = $8 + 4 | 0; //@line 6755
 $$0243 = 0; //@line 6756
 $$0247 = 0; //@line 6756
 $$0269 = 0; //@line 6756
 L1 : while (1) {
  do {
   if (($$0247 | 0) > -1) {
    if (($$0243 | 0) > (2147483647 - $$0247 | 0)) {
     HEAP32[(___errno_location() | 0) >> 2] = 75; //@line 6765
     $$1248 = -1; //@line 6766
     break;
    } else {
     $$1248 = $$0243 + $$0247 | 0; //@line 6770
     break;
    }
   } else {
    $$1248 = $$0247; //@line 6774
   }
  } while (0);
  $20 = HEAP32[$5 >> 2] | 0; //@line 6777
  $21 = HEAP8[$20 >> 0] | 0; //@line 6778
  if (!($21 << 24 >> 24)) {
   label = 88; //@line 6781
   break;
  } else {
   $23 = $21; //@line 6784
   $25 = $20; //@line 6784
  }
  L9 : while (1) {
   switch ($23 << 24 >> 24) {
   case 37:
    {
     $$0249303 = $25; //@line 6789
     $27 = $25; //@line 6789
     label = 9; //@line 6790
     break L9;
     break;
    }
   case 0:
    {
     $$0249$lcssa = $25; //@line 6795
     break L9;
     break;
    }
   default:
    {}
   }
   $24 = $25 + 1 | 0; //@line 6802
   HEAP32[$5 >> 2] = $24; //@line 6803
   $23 = HEAP8[$24 >> 0] | 0; //@line 6805
   $25 = $24; //@line 6805
  }
  L12 : do {
   if ((label | 0) == 9) {
    while (1) {
     label = 0; //@line 6810
     if ((HEAP8[$27 + 1 >> 0] | 0) != 37) {
      $$0249$lcssa = $$0249303; //@line 6815
      break L12;
     }
     $30 = $$0249303 + 1 | 0; //@line 6818
     $27 = $27 + 2 | 0; //@line 6819
     HEAP32[$5 >> 2] = $27; //@line 6820
     if ((HEAP8[$27 >> 0] | 0) != 37) {
      $$0249$lcssa = $30; //@line 6827
      break;
     } else {
      $$0249303 = $30; //@line 6824
      label = 9; //@line 6825
     }
    }
   }
  } while (0);
  $36 = $$0249$lcssa - $20 | 0; //@line 6835
  if ($10) {
   _out_670($0, $20, $36); //@line 6837
  }
  if ($36 | 0) {
   $$0243 = $36; //@line 6841
   $$0247 = $$1248; //@line 6841
   continue;
  }
  $43 = (_isdigit(HEAP8[(HEAP32[$5 >> 2] | 0) + 1 >> 0] | 0) | 0) == 0; //@line 6849
  $$pre342 = HEAP32[$5 >> 2] | 0; //@line 6850
  if ($43) {
   $$0253 = -1; //@line 6852
   $$1270 = $$0269; //@line 6852
   $$sink = 1; //@line 6852
  } else {
   if ((HEAP8[$$pre342 + 2 >> 0] | 0) == 36) {
    $$0253 = (HEAP8[$$pre342 + 1 >> 0] | 0) + -48 | 0; //@line 6862
    $$1270 = 1; //@line 6862
    $$sink = 3; //@line 6862
   } else {
    $$0253 = -1; //@line 6864
    $$1270 = $$0269; //@line 6864
    $$sink = 1; //@line 6864
   }
  }
  $51 = $$pre342 + $$sink | 0; //@line 6867
  HEAP32[$5 >> 2] = $51; //@line 6868
  $52 = HEAP8[$51 >> 0] | 0; //@line 6869
  $54 = ($52 << 24 >> 24) + -32 | 0; //@line 6871
  if ($54 >>> 0 > 31 | (1 << $54 & 75913 | 0) == 0) {
   $$0262$lcssa = 0; //@line 6878
   $$lcssa291 = $52; //@line 6878
   $$lcssa292 = $51; //@line 6878
  } else {
   $$0262309 = 0; //@line 6880
   $60 = $52; //@line 6880
   $65 = $51; //@line 6880
   while (1) {
    $63 = 1 << ($60 << 24 >> 24) + -32 | $$0262309; //@line 6885
    $64 = $65 + 1 | 0; //@line 6886
    HEAP32[$5 >> 2] = $64; //@line 6887
    $66 = HEAP8[$64 >> 0] | 0; //@line 6888
    $68 = ($66 << 24 >> 24) + -32 | 0; //@line 6890
    if ($68 >>> 0 > 31 | (1 << $68 & 75913 | 0) == 0) {
     $$0262$lcssa = $63; //@line 6897
     $$lcssa291 = $66; //@line 6897
     $$lcssa292 = $64; //@line 6897
     break;
    } else {
     $$0262309 = $63; //@line 6900
     $60 = $66; //@line 6900
     $65 = $64; //@line 6900
    }
   }
  }
  if ($$lcssa291 << 24 >> 24 == 42) {
   if (!(_isdigit(HEAP8[$$lcssa292 + 1 >> 0] | 0) | 0)) {
    label = 23; //@line 6912
   } else {
    $79 = HEAP32[$5 >> 2] | 0; //@line 6914
    if ((HEAP8[$79 + 2 >> 0] | 0) == 36) {
     $83 = $79 + 1 | 0; //@line 6919
     HEAP32[$4 + ((HEAP8[$83 >> 0] | 0) + -48 << 2) >> 2] = 10; //@line 6924
     $$0259 = HEAP32[$3 + ((HEAP8[$83 >> 0] | 0) + -48 << 3) >> 2] | 0; //@line 6936
     $$2271 = 1; //@line 6936
     $storemerge274 = $79 + 3 | 0; //@line 6936
    } else {
     label = 23; //@line 6938
    }
   }
   if ((label | 0) == 23) {
    label = 0; //@line 6942
    if ($$1270 | 0) {
     $$0 = -1; //@line 6945
     break;
    }
    if ($10) {
     $105 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 6960
     $106 = HEAP32[$105 >> 2] | 0; //@line 6961
     HEAP32[$2 >> 2] = $105 + 4; //@line 6963
     $363 = $106; //@line 6964
    } else {
     $363 = 0; //@line 6966
    }
    $$0259 = $363; //@line 6970
    $$2271 = 0; //@line 6970
    $storemerge274 = (HEAP32[$5 >> 2] | 0) + 1 | 0; //@line 6970
   }
   HEAP32[$5 >> 2] = $storemerge274; //@line 6972
   $109 = ($$0259 | 0) < 0; //@line 6973
   $$1260 = $109 ? 0 - $$0259 | 0 : $$0259; //@line 6978
   $$1263 = $109 ? $$0262$lcssa | 8192 : $$0262$lcssa; //@line 6978
   $$3272 = $$2271; //@line 6978
   $115 = $storemerge274; //@line 6978
  } else {
   $112 = _getint_671($5) | 0; //@line 6980
   if (($112 | 0) < 0) {
    $$0 = -1; //@line 6983
    break;
   }
   $$1260 = $112; //@line 6987
   $$1263 = $$0262$lcssa; //@line 6987
   $$3272 = $$1270; //@line 6987
   $115 = HEAP32[$5 >> 2] | 0; //@line 6987
  }
  do {
   if ((HEAP8[$115 >> 0] | 0) == 46) {
    if ((HEAP8[$115 + 1 >> 0] | 0) != 42) {
     HEAP32[$5 >> 2] = $115 + 1; //@line 6998
     $156 = _getint_671($5) | 0; //@line 6999
     $$0254 = $156; //@line 7001
     $$pre345 = HEAP32[$5 >> 2] | 0; //@line 7001
     break;
    }
    if (_isdigit(HEAP8[$115 + 2 >> 0] | 0) | 0) {
     $125 = HEAP32[$5 >> 2] | 0; //@line 7010
     if ((HEAP8[$125 + 3 >> 0] | 0) == 36) {
      $129 = $125 + 2 | 0; //@line 7015
      HEAP32[$4 + ((HEAP8[$129 >> 0] | 0) + -48 << 2) >> 2] = 10; //@line 7020
      $140 = HEAP32[$3 + ((HEAP8[$129 >> 0] | 0) + -48 << 3) >> 2] | 0; //@line 7027
      $144 = $125 + 4 | 0; //@line 7031
      HEAP32[$5 >> 2] = $144; //@line 7032
      $$0254 = $140; //@line 7033
      $$pre345 = $144; //@line 7033
      break;
     }
    }
    if ($$3272 | 0) {
     $$0 = -1; //@line 7039
     break L1;
    }
    if ($10) {
     $151 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 7054
     $152 = HEAP32[$151 >> 2] | 0; //@line 7055
     HEAP32[$2 >> 2] = $151 + 4; //@line 7057
     $364 = $152; //@line 7058
    } else {
     $364 = 0; //@line 7060
    }
    $154 = (HEAP32[$5 >> 2] | 0) + 2 | 0; //@line 7063
    HEAP32[$5 >> 2] = $154; //@line 7064
    $$0254 = $364; //@line 7065
    $$pre345 = $154; //@line 7065
   } else {
    $$0254 = -1; //@line 7067
    $$pre345 = $115; //@line 7067
   }
  } while (0);
  $$0252 = 0; //@line 7070
  $158 = $$pre345; //@line 7070
  while (1) {
   if (((HEAP8[$158 >> 0] | 0) + -65 | 0) >>> 0 > 57) {
    $$0 = -1; //@line 7077
    break L1;
   }
   $158$looptemp = $158;
   $158 = $158 + 1 | 0; //@line 7080
   HEAP32[$5 >> 2] = $158; //@line 7081
   $167 = HEAP8[(HEAP8[$158$looptemp >> 0] | 0) + -65 + (1379 + ($$0252 * 58 | 0)) >> 0] | 0; //@line 7086
   $168 = $167 & 255; //@line 7087
   if (($168 + -1 | 0) >>> 0 >= 8) {
    break;
   } else {
    $$0252 = $168; //@line 7091
   }
  }
  if (!($167 << 24 >> 24)) {
   $$0 = -1; //@line 7098
   break;
  }
  $173 = ($$0253 | 0) > -1; //@line 7102
  do {
   if ($167 << 24 >> 24 == 19) {
    if ($173) {
     $$0 = -1; //@line 7106
     break L1;
    } else {
     label = 50; //@line 7109
    }
   } else {
    if ($173) {
     HEAP32[$4 + ($$0253 << 2) >> 2] = $168; //@line 7114
     $176 = $3 + ($$0253 << 3) | 0; //@line 7116
     $181 = HEAP32[$176 + 4 >> 2] | 0; //@line 7121
     $182 = $6; //@line 7122
     HEAP32[$182 >> 2] = HEAP32[$176 >> 2]; //@line 7124
     HEAP32[$182 + 4 >> 2] = $181; //@line 7127
     label = 50; //@line 7128
     break;
    }
    if (!$10) {
     $$0 = 0; //@line 7132
     break L1;
    }
    _pop_arg_673($6, $168, $2); //@line 7135
    $187 = HEAP32[$5 >> 2] | 0; //@line 7137
   }
  } while (0);
  if ((label | 0) == 50) {
   label = 0; //@line 7141
   if ($10) {
    $187 = $158; //@line 7143
   } else {
    $$0243 = 0; //@line 7145
    $$0247 = $$1248; //@line 7145
    $$0269 = $$3272; //@line 7145
    continue;
   }
  }
  $189 = HEAP8[$187 + -1 >> 0] | 0; //@line 7151
  $$0235 = ($$0252 | 0) != 0 & ($189 & 15 | 0) == 3 ? $189 & -33 : $189; //@line 7157
  $196 = $$1263 & -65537; //@line 7160
  $$1263$ = ($$1263 & 8192 | 0) == 0 ? $$1263 : $196; //@line 7161
  L73 : do {
   switch ($$0235 | 0) {
   case 110:
    {
     switch (($$0252 & 255) << 24 >> 24) {
     case 0:
      {
       HEAP32[HEAP32[$6 >> 2] >> 2] = $$1248; //@line 7169
       $$0243 = 0; //@line 7170
       $$0247 = $$1248; //@line 7170
       $$0269 = $$3272; //@line 7170
       continue L1;
       break;
      }
     case 1:
      {
       HEAP32[HEAP32[$6 >> 2] >> 2] = $$1248; //@line 7176
       $$0243 = 0; //@line 7177
       $$0247 = $$1248; //@line 7177
       $$0269 = $$3272; //@line 7177
       continue L1;
       break;
      }
     case 2:
      {
       $208 = HEAP32[$6 >> 2] | 0; //@line 7185
       HEAP32[$208 >> 2] = $$1248; //@line 7187
       HEAP32[$208 + 4 >> 2] = (($$1248 | 0) < 0) << 31 >> 31; //@line 7190
       $$0243 = 0; //@line 7191
       $$0247 = $$1248; //@line 7191
       $$0269 = $$3272; //@line 7191
       continue L1;
       break;
      }
     case 3:
      {
       HEAP16[HEAP32[$6 >> 2] >> 1] = $$1248; //@line 7198
       $$0243 = 0; //@line 7199
       $$0247 = $$1248; //@line 7199
       $$0269 = $$3272; //@line 7199
       continue L1;
       break;
      }
     case 4:
      {
       HEAP8[HEAP32[$6 >> 2] >> 0] = $$1248; //@line 7206
       $$0243 = 0; //@line 7207
       $$0247 = $$1248; //@line 7207
       $$0269 = $$3272; //@line 7207
       continue L1;
       break;
      }
     case 6:
      {
       HEAP32[HEAP32[$6 >> 2] >> 2] = $$1248; //@line 7213
       $$0243 = 0; //@line 7214
       $$0247 = $$1248; //@line 7214
       $$0269 = $$3272; //@line 7214
       continue L1;
       break;
      }
     case 7:
      {
       $220 = HEAP32[$6 >> 2] | 0; //@line 7222
       HEAP32[$220 >> 2] = $$1248; //@line 7224
       HEAP32[$220 + 4 >> 2] = (($$1248 | 0) < 0) << 31 >> 31; //@line 7227
       $$0243 = 0; //@line 7228
       $$0247 = $$1248; //@line 7228
       $$0269 = $$3272; //@line 7228
       continue L1;
       break;
      }
     default:
      {
       $$0243 = 0; //@line 7233
       $$0247 = $$1248; //@line 7233
       $$0269 = $$3272; //@line 7233
       continue L1;
      }
     }
     break;
    }
   case 112:
    {
     $$1236 = 120; //@line 7243
     $$1255 = $$0254 >>> 0 > 8 ? $$0254 : 8; //@line 7243
     $$3265 = $$1263$ | 8; //@line 7243
     label = 62; //@line 7244
     break;
    }
   case 88:
   case 120:
    {
     $$1236 = $$0235; //@line 7248
     $$1255 = $$0254; //@line 7248
     $$3265 = $$1263$; //@line 7248
     label = 62; //@line 7249
     break;
    }
   case 111:
    {
     $242 = $6; //@line 7253
     $244 = HEAP32[$242 >> 2] | 0; //@line 7255
     $247 = HEAP32[$242 + 4 >> 2] | 0; //@line 7258
     $248 = _fmt_o($244, $247, $11) | 0; //@line 7259
     $252 = $12 - $248 | 0; //@line 7263
     $$0228 = $248; //@line 7268
     $$1233 = 0; //@line 7268
     $$1238 = 1843; //@line 7268
     $$2256 = ($$1263$ & 8 | 0) == 0 | ($$0254 | 0) > ($252 | 0) ? $$0254 : $252 + 1 | 0; //@line 7268
     $$4266 = $$1263$; //@line 7268
     $281 = $244; //@line 7268
     $283 = $247; //@line 7268
     label = 68; //@line 7269
     break;
    }
   case 105:
   case 100:
    {
     $256 = $6; //@line 7273
     $258 = HEAP32[$256 >> 2] | 0; //@line 7275
     $261 = HEAP32[$256 + 4 >> 2] | 0; //@line 7278
     if (($261 | 0) < 0) {
      $263 = _i64Subtract(0, 0, $258 | 0, $261 | 0) | 0; //@line 7281
      $264 = tempRet0; //@line 7282
      $265 = $6; //@line 7283
      HEAP32[$265 >> 2] = $263; //@line 7285
      HEAP32[$265 + 4 >> 2] = $264; //@line 7288
      $$0232 = 1; //@line 7289
      $$0237 = 1843; //@line 7289
      $275 = $263; //@line 7289
      $276 = $264; //@line 7289
      label = 67; //@line 7290
      break L73;
     } else {
      $$0232 = ($$1263$ & 2049 | 0) != 0 & 1; //@line 7302
      $$0237 = ($$1263$ & 2048 | 0) == 0 ? ($$1263$ & 1 | 0) == 0 ? 1843 : 1845 : 1844; //@line 7302
      $275 = $258; //@line 7302
      $276 = $261; //@line 7302
      label = 67; //@line 7303
      break L73;
     }
     break;
    }
   case 117:
    {
     $197 = $6; //@line 7309
     $$0232 = 0; //@line 7315
     $$0237 = 1843; //@line 7315
     $275 = HEAP32[$197 >> 2] | 0; //@line 7315
     $276 = HEAP32[$197 + 4 >> 2] | 0; //@line 7315
     label = 67; //@line 7316
     break;
    }
   case 99:
    {
     HEAP8[$13 >> 0] = HEAP32[$6 >> 2]; //@line 7327
     $$2 = $13; //@line 7328
     $$2234 = 0; //@line 7328
     $$2239 = 1843; //@line 7328
     $$2251 = $11; //@line 7328
     $$5 = 1; //@line 7328
     $$6268 = $196; //@line 7328
     break;
    }
   case 109:
    {
     $$1 = _strerror(HEAP32[(___errno_location() | 0) >> 2] | 0) | 0; //@line 7335
     label = 72; //@line 7336
     break;
    }
   case 115:
    {
     $302 = HEAP32[$6 >> 2] | 0; //@line 7340
     $$1 = $302 | 0 ? $302 : 1853; //@line 7343
     label = 72; //@line 7344
     break;
    }
   case 67:
    {
     HEAP32[$8 >> 2] = HEAP32[$6 >> 2]; //@line 7354
     HEAP32[$14 >> 2] = 0; //@line 7355
     HEAP32[$6 >> 2] = $8; //@line 7356
     $$4258354 = -1; //@line 7357
     $365 = $8; //@line 7357
     label = 76; //@line 7358
     break;
    }
   case 83:
    {
     $$pre348 = HEAP32[$6 >> 2] | 0; //@line 7362
     if (!$$0254) {
      _pad_676($0, 32, $$1260, 0, $$1263$); //@line 7365
      $$0240$lcssa356 = 0; //@line 7366
      label = 85; //@line 7367
     } else {
      $$4258354 = $$0254; //@line 7369
      $365 = $$pre348; //@line 7369
      label = 76; //@line 7370
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
     $$0243 = _fmt_fp($0, +HEAPF64[$6 >> 3], $$1260, $$0254, $$1263$, $$0235) | 0; //@line 7377
     $$0247 = $$1248; //@line 7377
     $$0269 = $$3272; //@line 7377
     continue L1;
     break;
    }
   default:
    {
     $$2 = $20; //@line 7382
     $$2234 = 0; //@line 7382
     $$2239 = 1843; //@line 7382
     $$2251 = $11; //@line 7382
     $$5 = $$0254; //@line 7382
     $$6268 = $$1263$; //@line 7382
    }
   }
  } while (0);
  L97 : do {
   if ((label | 0) == 62) {
    label = 0; //@line 7388
    $227 = $6; //@line 7389
    $229 = HEAP32[$227 >> 2] | 0; //@line 7391
    $232 = HEAP32[$227 + 4 >> 2] | 0; //@line 7394
    $234 = _fmt_x($229, $232, $11, $$1236 & 32) | 0; //@line 7396
    $or$cond278 = ($$3265 & 8 | 0) == 0 | ($229 | 0) == 0 & ($232 | 0) == 0; //@line 7402
    $$0228 = $234; //@line 7407
    $$1233 = $or$cond278 ? 0 : 2; //@line 7407
    $$1238 = $or$cond278 ? 1843 : 1843 + ($$1236 >> 4) | 0; //@line 7407
    $$2256 = $$1255; //@line 7407
    $$4266 = $$3265; //@line 7407
    $281 = $229; //@line 7407
    $283 = $232; //@line 7407
    label = 68; //@line 7408
   } else if ((label | 0) == 67) {
    label = 0; //@line 7411
    $$0228 = _fmt_u($275, $276, $11) | 0; //@line 7413
    $$1233 = $$0232; //@line 7413
    $$1238 = $$0237; //@line 7413
    $$2256 = $$0254; //@line 7413
    $$4266 = $$1263$; //@line 7413
    $281 = $275; //@line 7413
    $283 = $276; //@line 7413
    label = 68; //@line 7414
   } else if ((label | 0) == 72) {
    label = 0; //@line 7417
    $305 = _memchr($$1, 0, $$0254) | 0; //@line 7418
    $306 = ($305 | 0) == 0; //@line 7419
    $$2 = $$1; //@line 7426
    $$2234 = 0; //@line 7426
    $$2239 = 1843; //@line 7426
    $$2251 = $306 ? $$1 + $$0254 | 0 : $305; //@line 7426
    $$5 = $306 ? $$0254 : $305 - $$1 | 0; //@line 7426
    $$6268 = $196; //@line 7426
   } else if ((label | 0) == 76) {
    label = 0; //@line 7429
    $$0229316 = $365; //@line 7430
    $$0240315 = 0; //@line 7430
    $$1244314 = 0; //@line 7430
    while (1) {
     $318 = HEAP32[$$0229316 >> 2] | 0; //@line 7432
     if (!$318) {
      $$0240$lcssa = $$0240315; //@line 7435
      $$2245 = $$1244314; //@line 7435
      break;
     }
     $320 = _wctomb($9, $318) | 0; //@line 7438
     if (($320 | 0) < 0 | $320 >>> 0 > ($$4258354 - $$0240315 | 0) >>> 0) {
      $$0240$lcssa = $$0240315; //@line 7444
      $$2245 = $320; //@line 7444
      break;
     }
     $325 = $320 + $$0240315 | 0; //@line 7448
     if ($$4258354 >>> 0 > $325 >>> 0) {
      $$0229316 = $$0229316 + 4 | 0; //@line 7451
      $$0240315 = $325; //@line 7451
      $$1244314 = $320; //@line 7451
     } else {
      $$0240$lcssa = $325; //@line 7453
      $$2245 = $320; //@line 7453
      break;
     }
    }
    if (($$2245 | 0) < 0) {
     $$0 = -1; //@line 7459
     break L1;
    }
    _pad_676($0, 32, $$1260, $$0240$lcssa, $$1263$); //@line 7462
    if (!$$0240$lcssa) {
     $$0240$lcssa356 = 0; //@line 7465
     label = 85; //@line 7466
    } else {
     $$1230327 = $365; //@line 7468
     $$1241326 = 0; //@line 7468
     while (1) {
      $329 = HEAP32[$$1230327 >> 2] | 0; //@line 7470
      if (!$329) {
       $$0240$lcssa356 = $$0240$lcssa; //@line 7473
       label = 85; //@line 7474
       break L97;
      }
      $331 = _wctomb($9, $329) | 0; //@line 7477
      $$1241326 = $331 + $$1241326 | 0; //@line 7478
      if (($$1241326 | 0) > ($$0240$lcssa | 0)) {
       $$0240$lcssa356 = $$0240$lcssa; //@line 7481
       label = 85; //@line 7482
       break L97;
      }
      _out_670($0, $9, $331); //@line 7486
      if ($$1241326 >>> 0 >= $$0240$lcssa >>> 0) {
       $$0240$lcssa356 = $$0240$lcssa; //@line 7491
       label = 85; //@line 7492
       break;
      } else {
       $$1230327 = $$1230327 + 4 | 0; //@line 7489
      }
     }
    }
   }
  } while (0);
  if ((label | 0) == 68) {
   label = 0; //@line 7500
   $284 = ($281 | 0) != 0 | ($283 | 0) != 0; //@line 7506
   $or$cond = ($$2256 | 0) != 0 | $284; //@line 7508
   $290 = $12 - $$0228 + (($284 ^ 1) & 1) | 0; //@line 7513
   $$2 = $or$cond ? $$0228 : $11; //@line 7518
   $$2234 = $$1233; //@line 7518
   $$2239 = $$1238; //@line 7518
   $$2251 = $11; //@line 7518
   $$5 = $or$cond ? ($$2256 | 0) > ($290 | 0) ? $$2256 : $290 : $$2256; //@line 7518
   $$6268 = ($$2256 | 0) > -1 ? $$4266 & -65537 : $$4266; //@line 7518
  } else if ((label | 0) == 85) {
   label = 0; //@line 7521
   _pad_676($0, 32, $$1260, $$0240$lcssa356, $$1263$ ^ 8192); //@line 7523
   $$0243 = ($$1260 | 0) > ($$0240$lcssa356 | 0) ? $$1260 : $$0240$lcssa356; //@line 7526
   $$0247 = $$1248; //@line 7526
   $$0269 = $$3272; //@line 7526
   continue;
  }
  $343 = $$2251 - $$2 | 0; //@line 7531
  $$$5 = ($$5 | 0) < ($343 | 0) ? $343 : $$5; //@line 7533
  $345 = $$$5 + $$2234 | 0; //@line 7534
  $$2261 = ($$1260 | 0) < ($345 | 0) ? $345 : $$1260; //@line 7536
  _pad_676($0, 32, $$2261, $345, $$6268); //@line 7537
  _out_670($0, $$2239, $$2234); //@line 7538
  _pad_676($0, 48, $$2261, $345, $$6268 ^ 65536); //@line 7540
  _pad_676($0, 48, $$$5, $343, 0); //@line 7541
  _out_670($0, $$2, $343); //@line 7542
  _pad_676($0, 32, $$2261, $345, $$6268 ^ 8192); //@line 7544
  $$0243 = $$2261; //@line 7545
  $$0247 = $$1248; //@line 7545
  $$0269 = $$3272; //@line 7545
 }
 L116 : do {
  if ((label | 0) == 88) {
   if (!$0) {
    if (!$$0269) {
     $$0 = 0; //@line 7553
    } else {
     $$2242302 = 1; //@line 7555
     while (1) {
      $352 = HEAP32[$4 + ($$2242302 << 2) >> 2] | 0; //@line 7558
      if (!$352) {
       $$2242$lcssa = $$2242302; //@line 7561
       break;
      }
      _pop_arg_673($3 + ($$2242302 << 3) | 0, $352, $2); //@line 7565
      $356 = $$2242302 + 1 | 0; //@line 7566
      if (($$2242302 | 0) < 9) {
       $$2242302 = $356; //@line 7569
      } else {
       $$2242$lcssa = $356; //@line 7571
       break;
      }
     }
     if (($$2242$lcssa | 0) < 10) {
      $$3300 = $$2242$lcssa; //@line 7577
      while (1) {
       if (HEAP32[$4 + ($$3300 << 2) >> 2] | 0) {
        $$0 = -1; //@line 7583
        break L116;
       }
       if (($$3300 | 0) < 9) {
        $$3300 = $$3300 + 1 | 0; //@line 7589
       } else {
        $$0 = 1; //@line 7591
        break;
       }
      }
     } else {
      $$0 = 1; //@line 7596
     }
    }
   } else {
    $$0 = $$1248; //@line 7600
   }
  }
 } while (0);
 STACKTOP = sp; //@line 7604
 return $$0 | 0; //@line 7604
}
function _free($0) {
 $0 = $0 | 0;
 var $$0212$i = 0, $$0212$in$i = 0, $$0383 = 0, $$0384 = 0, $$0396 = 0, $$0403 = 0, $$1 = 0, $$1382 = 0, $$1387 = 0, $$1390 = 0, $$1398 = 0, $$1402 = 0, $$2 = 0, $$3 = 0, $$3400 = 0, $$pre$phi442Z2D = 0, $$pre$phi444Z2D = 0, $$pre$phiZ2D = 0, $10 = 0, $105 = 0, $106 = 0, $114 = 0, $115 = 0, $116 = 0, $124 = 0, $13 = 0, $132 = 0, $137 = 0, $138 = 0, $141 = 0, $143 = 0, $145 = 0, $16 = 0, $160 = 0, $165 = 0, $167 = 0, $17 = 0, $170 = 0, $173 = 0, $176 = 0, $179 = 0, $180 = 0, $181 = 0, $183 = 0, $185 = 0, $186 = 0, $188 = 0, $189 = 0, $195 = 0, $196 = 0, $2 = 0, $21 = 0, $210 = 0, $213 = 0, $214 = 0, $220 = 0, $235 = 0, $238 = 0, $239 = 0, $24 = 0, $240 = 0, $244 = 0, $245 = 0, $251 = 0, $256 = 0, $257 = 0, $26 = 0, $260 = 0, $262 = 0, $265 = 0, $270 = 0, $276 = 0, $28 = 0, $280 = 0, $281 = 0, $299 = 0, $3 = 0, $301 = 0, $308 = 0, $309 = 0, $310 = 0, $319 = 0, $41 = 0, $46 = 0, $48 = 0, $51 = 0, $53 = 0, $56 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $63 = 0, $65 = 0, $66 = 0, $68 = 0, $69 = 0, $7 = 0, $74 = 0, $75 = 0, $89 = 0, $9 = 0, $92 = 0, $93 = 0, $99 = 0, label = 0;
 if (!$0) {
  return;
 }
 $2 = $0 + -8 | 0; //@line 4928
 $3 = HEAP32[1181] | 0; //@line 4929
 if ($2 >>> 0 < $3 >>> 0) {
  _abort(); //@line 4932
 }
 $6 = HEAP32[$0 + -4 >> 2] | 0; //@line 4936
 $7 = $6 & 3; //@line 4937
 if (($7 | 0) == 1) {
  _abort(); //@line 4940
 }
 $9 = $6 & -8; //@line 4943
 $10 = $2 + $9 | 0; //@line 4944
 L10 : do {
  if (!($6 & 1)) {
   $13 = HEAP32[$2 >> 2] | 0; //@line 4949
   if (!$7) {
    return;
   }
   $16 = $2 + (0 - $13) | 0; //@line 4955
   $17 = $13 + $9 | 0; //@line 4956
   if ($16 >>> 0 < $3 >>> 0) {
    _abort(); //@line 4959
   }
   if ((HEAP32[1182] | 0) == ($16 | 0)) {
    $105 = $10 + 4 | 0; //@line 4965
    $106 = HEAP32[$105 >> 2] | 0; //@line 4966
    if (($106 & 3 | 0) != 3) {
     $$1 = $16; //@line 4970
     $$1382 = $17; //@line 4970
     $114 = $16; //@line 4970
     break;
    }
    HEAP32[1179] = $17; //@line 4973
    HEAP32[$105 >> 2] = $106 & -2; //@line 4975
    HEAP32[$16 + 4 >> 2] = $17 | 1; //@line 4978
    HEAP32[$16 + $17 >> 2] = $17; //@line 4980
    return;
   }
   $21 = $13 >>> 3; //@line 4983
   if ($13 >>> 0 < 256) {
    $24 = HEAP32[$16 + 8 >> 2] | 0; //@line 4987
    $26 = HEAP32[$16 + 12 >> 2] | 0; //@line 4989
    $28 = 4748 + ($21 << 1 << 2) | 0; //@line 4991
    if (($24 | 0) != ($28 | 0)) {
     if ($3 >>> 0 > $24 >>> 0) {
      _abort(); //@line 4996
     }
     if ((HEAP32[$24 + 12 >> 2] | 0) != ($16 | 0)) {
      _abort(); //@line 5003
     }
    }
    if (($26 | 0) == ($24 | 0)) {
     HEAP32[1177] = HEAP32[1177] & ~(1 << $21); //@line 5013
     $$1 = $16; //@line 5014
     $$1382 = $17; //@line 5014
     $114 = $16; //@line 5014
     break;
    }
    if (($26 | 0) == ($28 | 0)) {
     $$pre$phi444Z2D = $26 + 8 | 0; //@line 5020
    } else {
     if ($3 >>> 0 > $26 >>> 0) {
      _abort(); //@line 5024
     }
     $41 = $26 + 8 | 0; //@line 5027
     if ((HEAP32[$41 >> 2] | 0) == ($16 | 0)) {
      $$pre$phi444Z2D = $41; //@line 5031
     } else {
      _abort(); //@line 5033
     }
    }
    HEAP32[$24 + 12 >> 2] = $26; //@line 5038
    HEAP32[$$pre$phi444Z2D >> 2] = $24; //@line 5039
    $$1 = $16; //@line 5040
    $$1382 = $17; //@line 5040
    $114 = $16; //@line 5040
    break;
   }
   $46 = HEAP32[$16 + 24 >> 2] | 0; //@line 5044
   $48 = HEAP32[$16 + 12 >> 2] | 0; //@line 5046
   do {
    if (($48 | 0) == ($16 | 0)) {
     $59 = $16 + 16 | 0; //@line 5050
     $60 = $59 + 4 | 0; //@line 5051
     $61 = HEAP32[$60 >> 2] | 0; //@line 5052
     if (!$61) {
      $63 = HEAP32[$59 >> 2] | 0; //@line 5055
      if (!$63) {
       $$3 = 0; //@line 5058
       break;
      } else {
       $$1387 = $63; //@line 5061
       $$1390 = $59; //@line 5061
      }
     } else {
      $$1387 = $61; //@line 5064
      $$1390 = $60; //@line 5064
     }
     while (1) {
      $65 = $$1387 + 20 | 0; //@line 5067
      $66 = HEAP32[$65 >> 2] | 0; //@line 5068
      if ($66 | 0) {
       $$1387 = $66; //@line 5071
       $$1390 = $65; //@line 5071
       continue;
      }
      $68 = $$1387 + 16 | 0; //@line 5074
      $69 = HEAP32[$68 >> 2] | 0; //@line 5075
      if (!$69) {
       break;
      } else {
       $$1387 = $69; //@line 5080
       $$1390 = $68; //@line 5080
      }
     }
     if ($3 >>> 0 > $$1390 >>> 0) {
      _abort(); //@line 5085
     } else {
      HEAP32[$$1390 >> 2] = 0; //@line 5088
      $$3 = $$1387; //@line 5089
      break;
     }
    } else {
     $51 = HEAP32[$16 + 8 >> 2] | 0; //@line 5094
     if ($3 >>> 0 > $51 >>> 0) {
      _abort(); //@line 5097
     }
     $53 = $51 + 12 | 0; //@line 5100
     if ((HEAP32[$53 >> 2] | 0) != ($16 | 0)) {
      _abort(); //@line 5104
     }
     $56 = $48 + 8 | 0; //@line 5107
     if ((HEAP32[$56 >> 2] | 0) == ($16 | 0)) {
      HEAP32[$53 >> 2] = $48; //@line 5111
      HEAP32[$56 >> 2] = $51; //@line 5112
      $$3 = $48; //@line 5113
      break;
     } else {
      _abort(); //@line 5116
     }
    }
   } while (0);
   if (!$46) {
    $$1 = $16; //@line 5123
    $$1382 = $17; //@line 5123
    $114 = $16; //@line 5123
   } else {
    $74 = HEAP32[$16 + 28 >> 2] | 0; //@line 5126
    $75 = 5012 + ($74 << 2) | 0; //@line 5127
    do {
     if ((HEAP32[$75 >> 2] | 0) == ($16 | 0)) {
      HEAP32[$75 >> 2] = $$3; //@line 5132
      if (!$$3) {
       HEAP32[1178] = HEAP32[1178] & ~(1 << $74); //@line 5139
       $$1 = $16; //@line 5140
       $$1382 = $17; //@line 5140
       $114 = $16; //@line 5140
       break L10;
      }
     } else {
      if ((HEAP32[1181] | 0) >>> 0 > $46 >>> 0) {
       _abort(); //@line 5147
      } else {
       HEAP32[$46 + 16 + (((HEAP32[$46 + 16 >> 2] | 0) != ($16 | 0) & 1) << 2) >> 2] = $$3; //@line 5155
       if (!$$3) {
        $$1 = $16; //@line 5158
        $$1382 = $17; //@line 5158
        $114 = $16; //@line 5158
        break L10;
       } else {
        break;
       }
      }
     }
    } while (0);
    $89 = HEAP32[1181] | 0; //@line 5166
    if ($89 >>> 0 > $$3 >>> 0) {
     _abort(); //@line 5169
    }
    HEAP32[$$3 + 24 >> 2] = $46; //@line 5173
    $92 = $16 + 16 | 0; //@line 5174
    $93 = HEAP32[$92 >> 2] | 0; //@line 5175
    do {
     if ($93 | 0) {
      if ($89 >>> 0 > $93 >>> 0) {
       _abort(); //@line 5181
      } else {
       HEAP32[$$3 + 16 >> 2] = $93; //@line 5185
       HEAP32[$93 + 24 >> 2] = $$3; //@line 5187
       break;
      }
     }
    } while (0);
    $99 = HEAP32[$92 + 4 >> 2] | 0; //@line 5193
    if (!$99) {
     $$1 = $16; //@line 5196
     $$1382 = $17; //@line 5196
     $114 = $16; //@line 5196
    } else {
     if ((HEAP32[1181] | 0) >>> 0 > $99 >>> 0) {
      _abort(); //@line 5201
     } else {
      HEAP32[$$3 + 20 >> 2] = $99; //@line 5205
      HEAP32[$99 + 24 >> 2] = $$3; //@line 5207
      $$1 = $16; //@line 5208
      $$1382 = $17; //@line 5208
      $114 = $16; //@line 5208
      break;
     }
    }
   }
  } else {
   $$1 = $2; //@line 5214
   $$1382 = $9; //@line 5214
   $114 = $2; //@line 5214
  }
 } while (0);
 if ($114 >>> 0 >= $10 >>> 0) {
  _abort(); //@line 5219
 }
 $115 = $10 + 4 | 0; //@line 5222
 $116 = HEAP32[$115 >> 2] | 0; //@line 5223
 if (!($116 & 1)) {
  _abort(); //@line 5227
 }
 if (!($116 & 2)) {
  if ((HEAP32[1183] | 0) == ($10 | 0)) {
   $124 = (HEAP32[1180] | 0) + $$1382 | 0; //@line 5237
   HEAP32[1180] = $124; //@line 5238
   HEAP32[1183] = $$1; //@line 5239
   HEAP32[$$1 + 4 >> 2] = $124 | 1; //@line 5242
   if (($$1 | 0) != (HEAP32[1182] | 0)) {
    return;
   }
   HEAP32[1182] = 0; //@line 5248
   HEAP32[1179] = 0; //@line 5249
   return;
  }
  if ((HEAP32[1182] | 0) == ($10 | 0)) {
   $132 = (HEAP32[1179] | 0) + $$1382 | 0; //@line 5256
   HEAP32[1179] = $132; //@line 5257
   HEAP32[1182] = $114; //@line 5258
   HEAP32[$$1 + 4 >> 2] = $132 | 1; //@line 5261
   HEAP32[$114 + $132 >> 2] = $132; //@line 5263
   return;
  }
  $137 = ($116 & -8) + $$1382 | 0; //@line 5267
  $138 = $116 >>> 3; //@line 5268
  L108 : do {
   if ($116 >>> 0 < 256) {
    $141 = HEAP32[$10 + 8 >> 2] | 0; //@line 5273
    $143 = HEAP32[$10 + 12 >> 2] | 0; //@line 5275
    $145 = 4748 + ($138 << 1 << 2) | 0; //@line 5277
    if (($141 | 0) != ($145 | 0)) {
     if ((HEAP32[1181] | 0) >>> 0 > $141 >>> 0) {
      _abort(); //@line 5283
     }
     if ((HEAP32[$141 + 12 >> 2] | 0) != ($10 | 0)) {
      _abort(); //@line 5290
     }
    }
    if (($143 | 0) == ($141 | 0)) {
     HEAP32[1177] = HEAP32[1177] & ~(1 << $138); //@line 5300
     break;
    }
    if (($143 | 0) == ($145 | 0)) {
     $$pre$phi442Z2D = $143 + 8 | 0; //@line 5306
    } else {
     if ((HEAP32[1181] | 0) >>> 0 > $143 >>> 0) {
      _abort(); //@line 5311
     }
     $160 = $143 + 8 | 0; //@line 5314
     if ((HEAP32[$160 >> 2] | 0) == ($10 | 0)) {
      $$pre$phi442Z2D = $160; //@line 5318
     } else {
      _abort(); //@line 5320
     }
    }
    HEAP32[$141 + 12 >> 2] = $143; //@line 5325
    HEAP32[$$pre$phi442Z2D >> 2] = $141; //@line 5326
   } else {
    $165 = HEAP32[$10 + 24 >> 2] | 0; //@line 5329
    $167 = HEAP32[$10 + 12 >> 2] | 0; //@line 5331
    do {
     if (($167 | 0) == ($10 | 0)) {
      $179 = $10 + 16 | 0; //@line 5335
      $180 = $179 + 4 | 0; //@line 5336
      $181 = HEAP32[$180 >> 2] | 0; //@line 5337
      if (!$181) {
       $183 = HEAP32[$179 >> 2] | 0; //@line 5340
       if (!$183) {
        $$3400 = 0; //@line 5343
        break;
       } else {
        $$1398 = $183; //@line 5346
        $$1402 = $179; //@line 5346
       }
      } else {
       $$1398 = $181; //@line 5349
       $$1402 = $180; //@line 5349
      }
      while (1) {
       $185 = $$1398 + 20 | 0; //@line 5352
       $186 = HEAP32[$185 >> 2] | 0; //@line 5353
       if ($186 | 0) {
        $$1398 = $186; //@line 5356
        $$1402 = $185; //@line 5356
        continue;
       }
       $188 = $$1398 + 16 | 0; //@line 5359
       $189 = HEAP32[$188 >> 2] | 0; //@line 5360
       if (!$189) {
        break;
       } else {
        $$1398 = $189; //@line 5365
        $$1402 = $188; //@line 5365
       }
      }
      if ((HEAP32[1181] | 0) >>> 0 > $$1402 >>> 0) {
       _abort(); //@line 5371
      } else {
       HEAP32[$$1402 >> 2] = 0; //@line 5374
       $$3400 = $$1398; //@line 5375
       break;
      }
     } else {
      $170 = HEAP32[$10 + 8 >> 2] | 0; //@line 5380
      if ((HEAP32[1181] | 0) >>> 0 > $170 >>> 0) {
       _abort(); //@line 5384
      }
      $173 = $170 + 12 | 0; //@line 5387
      if ((HEAP32[$173 >> 2] | 0) != ($10 | 0)) {
       _abort(); //@line 5391
      }
      $176 = $167 + 8 | 0; //@line 5394
      if ((HEAP32[$176 >> 2] | 0) == ($10 | 0)) {
       HEAP32[$173 >> 2] = $167; //@line 5398
       HEAP32[$176 >> 2] = $170; //@line 5399
       $$3400 = $167; //@line 5400
       break;
      } else {
       _abort(); //@line 5403
      }
     }
    } while (0);
    if ($165 | 0) {
     $195 = HEAP32[$10 + 28 >> 2] | 0; //@line 5411
     $196 = 5012 + ($195 << 2) | 0; //@line 5412
     do {
      if ((HEAP32[$196 >> 2] | 0) == ($10 | 0)) {
       HEAP32[$196 >> 2] = $$3400; //@line 5417
       if (!$$3400) {
        HEAP32[1178] = HEAP32[1178] & ~(1 << $195); //@line 5424
        break L108;
       }
      } else {
       if ((HEAP32[1181] | 0) >>> 0 > $165 >>> 0) {
        _abort(); //@line 5431
       } else {
        HEAP32[$165 + 16 + (((HEAP32[$165 + 16 >> 2] | 0) != ($10 | 0) & 1) << 2) >> 2] = $$3400; //@line 5439
        if (!$$3400) {
         break L108;
        } else {
         break;
        }
       }
      }
     } while (0);
     $210 = HEAP32[1181] | 0; //@line 5449
     if ($210 >>> 0 > $$3400 >>> 0) {
      _abort(); //@line 5452
     }
     HEAP32[$$3400 + 24 >> 2] = $165; //@line 5456
     $213 = $10 + 16 | 0; //@line 5457
     $214 = HEAP32[$213 >> 2] | 0; //@line 5458
     do {
      if ($214 | 0) {
       if ($210 >>> 0 > $214 >>> 0) {
        _abort(); //@line 5464
       } else {
        HEAP32[$$3400 + 16 >> 2] = $214; //@line 5468
        HEAP32[$214 + 24 >> 2] = $$3400; //@line 5470
        break;
       }
      }
     } while (0);
     $220 = HEAP32[$213 + 4 >> 2] | 0; //@line 5476
     if ($220 | 0) {
      if ((HEAP32[1181] | 0) >>> 0 > $220 >>> 0) {
       _abort(); //@line 5482
      } else {
       HEAP32[$$3400 + 20 >> 2] = $220; //@line 5486
       HEAP32[$220 + 24 >> 2] = $$3400; //@line 5488
       break;
      }
     }
    }
   }
  } while (0);
  HEAP32[$$1 + 4 >> 2] = $137 | 1; //@line 5497
  HEAP32[$114 + $137 >> 2] = $137; //@line 5499
  if (($$1 | 0) == (HEAP32[1182] | 0)) {
   HEAP32[1179] = $137; //@line 5503
   return;
  } else {
   $$2 = $137; //@line 5506
  }
 } else {
  HEAP32[$115 >> 2] = $116 & -2; //@line 5510
  HEAP32[$$1 + 4 >> 2] = $$1382 | 1; //@line 5513
  HEAP32[$114 + $$1382 >> 2] = $$1382; //@line 5515
  $$2 = $$1382; //@line 5516
 }
 $235 = $$2 >>> 3; //@line 5518
 if ($$2 >>> 0 < 256) {
  $238 = 4748 + ($235 << 1 << 2) | 0; //@line 5522
  $239 = HEAP32[1177] | 0; //@line 5523
  $240 = 1 << $235; //@line 5524
  if (!($239 & $240)) {
   HEAP32[1177] = $239 | $240; //@line 5529
   $$0403 = $238; //@line 5531
   $$pre$phiZ2D = $238 + 8 | 0; //@line 5531
  } else {
   $244 = $238 + 8 | 0; //@line 5533
   $245 = HEAP32[$244 >> 2] | 0; //@line 5534
   if ((HEAP32[1181] | 0) >>> 0 > $245 >>> 0) {
    _abort(); //@line 5538
   } else {
    $$0403 = $245; //@line 5541
    $$pre$phiZ2D = $244; //@line 5541
   }
  }
  HEAP32[$$pre$phiZ2D >> 2] = $$1; //@line 5544
  HEAP32[$$0403 + 12 >> 2] = $$1; //@line 5546
  HEAP32[$$1 + 8 >> 2] = $$0403; //@line 5548
  HEAP32[$$1 + 12 >> 2] = $238; //@line 5550
  return;
 }
 $251 = $$2 >>> 8; //@line 5553
 if (!$251) {
  $$0396 = 0; //@line 5556
 } else {
  if ($$2 >>> 0 > 16777215) {
   $$0396 = 31; //@line 5560
  } else {
   $256 = ($251 + 1048320 | 0) >>> 16 & 8; //@line 5564
   $257 = $251 << $256; //@line 5565
   $260 = ($257 + 520192 | 0) >>> 16 & 4; //@line 5568
   $262 = $257 << $260; //@line 5570
   $265 = ($262 + 245760 | 0) >>> 16 & 2; //@line 5573
   $270 = 14 - ($260 | $256 | $265) + ($262 << $265 >>> 15) | 0; //@line 5578
   $$0396 = $$2 >>> ($270 + 7 | 0) & 1 | $270 << 1; //@line 5584
  }
 }
 $276 = 5012 + ($$0396 << 2) | 0; //@line 5587
 HEAP32[$$1 + 28 >> 2] = $$0396; //@line 5589
 HEAP32[$$1 + 20 >> 2] = 0; //@line 5592
 HEAP32[$$1 + 16 >> 2] = 0; //@line 5593
 $280 = HEAP32[1178] | 0; //@line 5594
 $281 = 1 << $$0396; //@line 5595
 do {
  if (!($280 & $281)) {
   HEAP32[1178] = $280 | $281; //@line 5601
   HEAP32[$276 >> 2] = $$1; //@line 5602
   HEAP32[$$1 + 24 >> 2] = $276; //@line 5604
   HEAP32[$$1 + 12 >> 2] = $$1; //@line 5606
   HEAP32[$$1 + 8 >> 2] = $$1; //@line 5608
  } else {
   $$0383 = $$2 << (($$0396 | 0) == 31 ? 0 : 25 - ($$0396 >>> 1) | 0); //@line 5616
   $$0384 = HEAP32[$276 >> 2] | 0; //@line 5616
   while (1) {
    if ((HEAP32[$$0384 + 4 >> 2] & -8 | 0) == ($$2 | 0)) {
     label = 124; //@line 5623
     break;
    }
    $299 = $$0384 + 16 + ($$0383 >>> 31 << 2) | 0; //@line 5627
    $301 = HEAP32[$299 >> 2] | 0; //@line 5629
    if (!$301) {
     label = 121; //@line 5632
     break;
    } else {
     $$0383 = $$0383 << 1; //@line 5635
     $$0384 = $301; //@line 5635
    }
   }
   if ((label | 0) == 121) {
    if ((HEAP32[1181] | 0) >>> 0 > $299 >>> 0) {
     _abort(); //@line 5642
    } else {
     HEAP32[$299 >> 2] = $$1; //@line 5645
     HEAP32[$$1 + 24 >> 2] = $$0384; //@line 5647
     HEAP32[$$1 + 12 >> 2] = $$1; //@line 5649
     HEAP32[$$1 + 8 >> 2] = $$1; //@line 5651
     break;
    }
   } else if ((label | 0) == 124) {
    $308 = $$0384 + 8 | 0; //@line 5656
    $309 = HEAP32[$308 >> 2] | 0; //@line 5657
    $310 = HEAP32[1181] | 0; //@line 5658
    if ($310 >>> 0 <= $309 >>> 0 & $310 >>> 0 <= $$0384 >>> 0) {
     HEAP32[$309 + 12 >> 2] = $$1; //@line 5664
     HEAP32[$308 >> 2] = $$1; //@line 5665
     HEAP32[$$1 + 8 >> 2] = $309; //@line 5667
     HEAP32[$$1 + 12 >> 2] = $$0384; //@line 5669
     HEAP32[$$1 + 24 >> 2] = 0; //@line 5671
     break;
    } else {
     _abort(); //@line 5674
    }
   }
  }
 } while (0);
 $319 = (HEAP32[1185] | 0) + -1 | 0; //@line 5681
 HEAP32[1185] = $319; //@line 5682
 if (!$319) {
  $$0212$in$i = 5164; //@line 5685
 } else {
  return;
 }
 while (1) {
  $$0212$i = HEAP32[$$0212$in$i >> 2] | 0; //@line 5690
  if (!$$0212$i) {
   break;
  } else {
   $$0212$in$i = $$0212$i + 8 | 0; //@line 5696
  }
 }
 HEAP32[1185] = -1; //@line 5699
 return;
}
function _equeue_dispatch($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0 = 0, $$02329$i$i = 0, $$02330$i$i = 0, $$025$i$i = 0, $$03956$i = 0, $$03956$i$phi = 0, $$04055$i = 0, $$0405571$i = 0, $$04063$i = 0, $$04159$i = 0, $$04258$i = 0, $$057$i = 0, $$065 = 0, $$06790 = 0, $$2 = 0, $$idx = 0, $$sink$in$i$i = 0, $$sroa$0$i = 0, $$sroa$0$i$0$$sroa$0$0$$sroa$0$0$$0$4353$pre$i73 = 0, $$sroa$0$i$0$$sroa$0$0$$sroa$0$0$$0$52$i72 = 0, $10 = 0, $103 = 0, $11 = 0, $12 = 0, $126 = 0, $128 = 0, $129 = 0, $130 = 0, $132 = 0, $133 = 0, $141 = 0, $142 = 0, $144 = 0, $147 = 0, $149 = 0, $152 = 0, $155 = 0, $162 = 0, $166 = 0, $169 = 0, $175 = 0, $2 = 0, $20 = 0, $21 = 0, $24 = 0, $3 = 0, $30 = 0, $39 = 0, $4 = 0, $42 = 0, $43 = 0, $45 = 0, $5 = 0, $6 = 0, $69 = 0, $7 = 0, $71 = 0, $74 = 0, $8 = 0, $9 = 0, $93 = 0, $94 = 0, $AsyncCtx = 0, $AsyncCtx11 = 0, $AsyncCtx15 = 0, $AsyncCtx3 = 0, $AsyncCtx7 = 0, label = 0, sp = 0, $$04159$i$looptemp = 0, $$04258$i$looptemp = 0;
 sp = STACKTOP; //@line 977
 STACKTOP = STACKTOP + 16 | 0; //@line 978
 $$sroa$0$i = sp; //@line 979
 $2 = _equeue_tick() | 0; //@line 980
 $3 = $2 + $1 | 0; //@line 981
 $4 = $0 + 36 | 0; //@line 982
 HEAP8[$4 >> 0] = 0; //@line 983
 $5 = $0 + 128 | 0; //@line 984
 $6 = $0 + 9 | 0; //@line 985
 $7 = $0 + 4 | 0; //@line 986
 $8 = ($1 | 0) > -1; //@line 987
 $9 = $0 + 48 | 0; //@line 988
 $10 = $0 + 8 | 0; //@line 989
 $$idx = $0 + 16 | 0; //@line 990
 $11 = $0 + 156 | 0; //@line 991
 $12 = $0 + 24 | 0; //@line 992
 $$0 = $2; //@line 993
 L1 : while (1) {
  _equeue_mutex_lock($5); //@line 995
  HEAP8[$6 >> 0] = (HEAPU8[$6 >> 0] | 0) + 1; //@line 1000
  if (((HEAP32[$7 >> 2] | 0) - $$0 | 0) < 1) {
   HEAP32[$7 >> 2] = $$0; //@line 1005
  }
  $20 = HEAP32[$0 >> 2] | 0; //@line 1007
  HEAP32[$$sroa$0$i >> 2] = $20; //@line 1008
  $21 = $20; //@line 1009
  L6 : do {
   if (!$20) {
    $$04055$i = $$sroa$0$i; //@line 1013
    $30 = $21; //@line 1013
    label = 8; //@line 1014
   } else {
    $$04063$i = $$sroa$0$i; //@line 1016
    $24 = $21; //@line 1016
    do {
     if (((HEAP32[$24 + 20 >> 2] | 0) - $$0 | 0) >= 1) {
      $$04055$i = $$04063$i; //@line 1023
      $30 = $24; //@line 1023
      label = 8; //@line 1024
      break L6;
     }
     $$04063$i = $24 + 8 | 0; //@line 1027
     $24 = HEAP32[$$04063$i >> 2] | 0; //@line 1028
    } while (($24 | 0) != 0);
    HEAP32[$0 >> 2] = 0; //@line 1036
    $$0405571$i = $$04063$i; //@line 1037
   }
  } while (0);
  if ((label | 0) == 8) {
   label = 0; //@line 1041
   HEAP32[$0 >> 2] = $30; //@line 1042
   if (!$30) {
    $$0405571$i = $$04055$i; //@line 1045
   } else {
    HEAP32[$30 + 16 >> 2] = $0; //@line 1048
    $$0405571$i = $$04055$i; //@line 1049
   }
  }
  HEAP32[$$0405571$i >> 2] = 0; //@line 1052
  _equeue_mutex_unlock($5); //@line 1053
  $$sroa$0$i$0$$sroa$0$0$$sroa$0$0$$0$52$i72 = HEAP32[$$sroa$0$i >> 2] | 0; //@line 1054
  if (!$$sroa$0$i$0$$sroa$0$0$$sroa$0$0$$0$52$i72) {} else {
   $$04159$i = $$sroa$0$i$0$$sroa$0$0$$sroa$0$0$$0$52$i72; //@line 1058
   $$04258$i = $$sroa$0$i; //@line 1058
   do {
    $$04258$i$looptemp = $$04258$i;
    $$04258$i = $$04159$i + 8 | 0; //@line 1060
    $$04159$i$looptemp = $$04159$i;
    $$04159$i = HEAP32[$$04258$i >> 2] | 0; //@line 1061
    $$03956$i = 0; //@line 1062
    $$057$i = $$04159$i$looptemp; //@line 1062
    while (1) {
     HEAP32[$$057$i + 8 >> 2] = $$03956$i; //@line 1065
     $39 = HEAP32[$$057$i + 12 >> 2] | 0; //@line 1067
     if (!$39) {
      break;
     } else {
      $$03956$i$phi = $$057$i; //@line 1072
      $$057$i = $39; //@line 1072
      $$03956$i = $$03956$i$phi; //@line 1072
     }
    }
    HEAP32[$$04258$i$looptemp >> 2] = $$057$i; //@line 1075
   } while (($$04159$i | 0) != 0);
   $$sroa$0$i$0$$sroa$0$0$$sroa$0$0$$0$4353$pre$i73 = HEAP32[$$sroa$0$i >> 2] | 0; //@line 1083
   if ($$sroa$0$i$0$$sroa$0$0$$sroa$0$0$$0$4353$pre$i73 | 0) {
    $$06790 = $$sroa$0$i$0$$sroa$0$0$$sroa$0$0$$0$4353$pre$i73; //@line 1086
    while (1) {
     $42 = $$06790 + 8 | 0; //@line 1088
     $43 = HEAP32[$42 >> 2] | 0; //@line 1089
     $45 = HEAP32[$$06790 + 32 >> 2] | 0; //@line 1091
     if ($45 | 0) {
      $AsyncCtx = _emscripten_alloc_async_context(84, sp) | 0; //@line 1095
      FUNCTION_TABLE_vi[$45 & 127]($$06790 + 36 | 0); //@line 1096
      if (___async) {
       label = 18; //@line 1099
       break L1;
      }
      _emscripten_free_async_context($AsyncCtx | 0); //@line 1102
     }
     $69 = HEAP32[$$06790 + 24 >> 2] | 0; //@line 1105
     if (($69 | 0) > -1) {
      $71 = $$06790 + 20 | 0; //@line 1108
      HEAP32[$71 >> 2] = (HEAP32[$71 >> 2] | 0) + $69; //@line 1111
      $74 = _equeue_tick() | 0; //@line 1112
      $AsyncCtx11 = _emscripten_alloc_async_context(76, sp) | 0; //@line 1113
      _equeue_enqueue($0, $$06790, $74) | 0; //@line 1114
      if (___async) {
       label = 22; //@line 1117
       break L1;
      }
      _emscripten_free_async_context($AsyncCtx11 | 0); //@line 1120
     } else {
      $93 = $$06790 + 4 | 0; //@line 1123
      $94 = HEAP8[$93 >> 0] | 0; //@line 1124
      HEAP8[$93 >> 0] = (($94 + 1 & 255) << HEAP32[$$idx >> 2] | 0) == 0 ? 1 : ($94 & 255) + 1 & 255; //@line 1133
      $103 = HEAP32[$$06790 + 28 >> 2] | 0; //@line 1135
      if ($103 | 0) {
       $AsyncCtx3 = _emscripten_alloc_async_context(84, sp) | 0; //@line 1139
       FUNCTION_TABLE_vi[$103 & 127]($$06790 + 36 | 0); //@line 1140
       if (___async) {
        label = 26; //@line 1143
        break L1;
       }
       _emscripten_free_async_context($AsyncCtx3 | 0); //@line 1146
      }
      _equeue_mutex_lock($11); //@line 1148
      $126 = HEAP32[$12 >> 2] | 0; //@line 1149
      L37 : do {
       if (!$126) {
        $$02329$i$i = $12; //@line 1153
        label = 34; //@line 1154
       } else {
        $128 = HEAP32[$$06790 >> 2] | 0; //@line 1156
        $$025$i$i = $12; //@line 1157
        $130 = $126; //@line 1157
        while (1) {
         $129 = HEAP32[$130 >> 2] | 0; //@line 1159
         if ($129 >>> 0 >= $128 >>> 0) {
          break;
         }
         $132 = $130 + 8 | 0; //@line 1164
         $133 = HEAP32[$132 >> 2] | 0; //@line 1165
         if (!$133) {
          $$02329$i$i = $132; //@line 1168
          label = 34; //@line 1169
          break L37;
         } else {
          $$025$i$i = $132; //@line 1172
          $130 = $133; //@line 1172
         }
        }
        if (($129 | 0) == ($128 | 0)) {
         HEAP32[$$06790 + 12 >> 2] = $130; //@line 1178
         $$02330$i$i = $$025$i$i; //@line 1181
         $$sink$in$i$i = (HEAP32[$$025$i$i >> 2] | 0) + 8 | 0; //@line 1181
        } else {
         $$02329$i$i = $$025$i$i; //@line 1183
         label = 34; //@line 1184
        }
       }
      } while (0);
      if ((label | 0) == 34) {
       label = 0; //@line 1189
       HEAP32[$$06790 + 12 >> 2] = 0; //@line 1191
       $$02330$i$i = $$02329$i$i; //@line 1192
       $$sink$in$i$i = $$02329$i$i; //@line 1192
      }
      HEAP32[$42 >> 2] = HEAP32[$$sink$in$i$i >> 2]; //@line 1195
      HEAP32[$$02330$i$i >> 2] = $$06790; //@line 1196
      _equeue_mutex_unlock($11); //@line 1197
     }
     if (!$43) {
      break;
     } else {
      $$06790 = $43; //@line 1203
     }
    }
   }
  }
  $141 = _equeue_tick() | 0; //@line 1208
  if ($8) {
   $142 = $3 - $141 | 0; //@line 1210
   if (($142 | 0) < 1) {
    label = 39; //@line 1213
    break;
   } else {
    $$065 = $142; //@line 1216
   }
  } else {
   $$065 = -1; //@line 1219
  }
  _equeue_mutex_lock($5); //@line 1221
  $162 = HEAP32[$0 >> 2] | 0; //@line 1222
  if (!$162) {
   $$2 = $$065; //@line 1225
  } else {
   $166 = (HEAP32[$162 + 20 >> 2] | 0) - $141 | 0; //@line 1229
   $169 = $166 & ~($166 >> 31); //@line 1232
   $$2 = $169 >>> 0 < $$065 >>> 0 ? $169 : $$065; //@line 1235
  }
  _equeue_mutex_unlock($5); //@line 1237
  _equeue_sema_wait($9, $$2) | 0; //@line 1238
  if (HEAP8[$10 >> 0] | 0) {
   _equeue_mutex_lock($5); //@line 1242
   if (HEAP8[$10 >> 0] | 0) {
    label = 51; //@line 1246
    break;
   }
   _equeue_mutex_unlock($5); //@line 1249
  }
  $175 = _equeue_tick() | 0; //@line 1251
  $AsyncCtx15 = _emscripten_alloc_async_context(76, sp) | 0; //@line 1252
  _wait_ms(20); //@line 1253
  if (___async) {
   label = 54; //@line 1256
   break;
  }
  _emscripten_free_async_context($AsyncCtx15 | 0); //@line 1259
  $$0 = $175; //@line 1260
 }
 if ((label | 0) == 18) {
  HEAP32[$AsyncCtx >> 2] = 27; //@line 1263
  HEAP32[$AsyncCtx + 4 >> 2] = $12; //@line 1265
  HEAP32[$AsyncCtx + 8 >> 2] = $$06790; //@line 1267
  HEAP32[$AsyncCtx + 12 >> 2] = $43; //@line 1269
  HEAP32[$AsyncCtx + 16 >> 2] = $42; //@line 1271
  HEAP32[$AsyncCtx + 20 >> 2] = $11; //@line 1273
  HEAP32[$AsyncCtx + 24 >> 2] = $5; //@line 1275
  HEAP32[$AsyncCtx + 28 >> 2] = $6; //@line 1277
  HEAP32[$AsyncCtx + 32 >> 2] = $7; //@line 1279
  HEAP32[$AsyncCtx + 36 >> 2] = $0; //@line 1281
  HEAP32[$AsyncCtx + 40 >> 2] = $3; //@line 1283
  HEAP8[$AsyncCtx + 44 >> 0] = $8 & 1; //@line 1286
  HEAP32[$AsyncCtx + 48 >> 2] = $$sroa$0$i; //@line 1288
  HEAP32[$AsyncCtx + 52 >> 2] = $10; //@line 1290
  HEAP32[$AsyncCtx + 56 >> 2] = $4; //@line 1292
  HEAP32[$AsyncCtx + 60 >> 2] = $$sroa$0$i; //@line 1294
  HEAP32[$AsyncCtx + 64 >> 2] = $0; //@line 1296
  HEAP32[$AsyncCtx + 68 >> 2] = $$sroa$0$i; //@line 1298
  HEAP32[$AsyncCtx + 72 >> 2] = $0; //@line 1300
  HEAP32[$AsyncCtx + 76 >> 2] = $9; //@line 1302
  HEAP32[$AsyncCtx + 80 >> 2] = $$idx; //@line 1304
  sp = STACKTOP; //@line 1305
  STACKTOP = sp; //@line 1306
  return;
 } else if ((label | 0) == 22) {
  HEAP32[$AsyncCtx11 >> 2] = 28; //@line 1309
  HEAP32[$AsyncCtx11 + 4 >> 2] = $12; //@line 1311
  HEAP32[$AsyncCtx11 + 8 >> 2] = $43; //@line 1313
  HEAP32[$AsyncCtx11 + 12 >> 2] = $11; //@line 1315
  HEAP32[$AsyncCtx11 + 16 >> 2] = $5; //@line 1317
  HEAP32[$AsyncCtx11 + 20 >> 2] = $6; //@line 1319
  HEAP32[$AsyncCtx11 + 24 >> 2] = $7; //@line 1321
  HEAP32[$AsyncCtx11 + 28 >> 2] = $0; //@line 1323
  HEAP32[$AsyncCtx11 + 32 >> 2] = $3; //@line 1325
  HEAP8[$AsyncCtx11 + 36 >> 0] = $8 & 1; //@line 1328
  HEAP32[$AsyncCtx11 + 40 >> 2] = $$sroa$0$i; //@line 1330
  HEAP32[$AsyncCtx11 + 44 >> 2] = $10; //@line 1332
  HEAP32[$AsyncCtx11 + 48 >> 2] = $4; //@line 1334
  HEAP32[$AsyncCtx11 + 52 >> 2] = $$sroa$0$i; //@line 1336
  HEAP32[$AsyncCtx11 + 56 >> 2] = $0; //@line 1338
  HEAP32[$AsyncCtx11 + 60 >> 2] = $$sroa$0$i; //@line 1340
  HEAP32[$AsyncCtx11 + 64 >> 2] = $0; //@line 1342
  HEAP32[$AsyncCtx11 + 68 >> 2] = $9; //@line 1344
  HEAP32[$AsyncCtx11 + 72 >> 2] = $$idx; //@line 1346
  sp = STACKTOP; //@line 1347
  STACKTOP = sp; //@line 1348
  return;
 } else if ((label | 0) == 26) {
  HEAP32[$AsyncCtx3 >> 2] = 29; //@line 1351
  HEAP32[$AsyncCtx3 + 4 >> 2] = $12; //@line 1353
  HEAP32[$AsyncCtx3 + 8 >> 2] = $$06790; //@line 1355
  HEAP32[$AsyncCtx3 + 12 >> 2] = $43; //@line 1357
  HEAP32[$AsyncCtx3 + 16 >> 2] = $42; //@line 1359
  HEAP32[$AsyncCtx3 + 20 >> 2] = $11; //@line 1361
  HEAP32[$AsyncCtx3 + 24 >> 2] = $5; //@line 1363
  HEAP32[$AsyncCtx3 + 28 >> 2] = $6; //@line 1365
  HEAP32[$AsyncCtx3 + 32 >> 2] = $7; //@line 1367
  HEAP32[$AsyncCtx3 + 36 >> 2] = $0; //@line 1369
  HEAP32[$AsyncCtx3 + 40 >> 2] = $3; //@line 1371
  HEAP8[$AsyncCtx3 + 44 >> 0] = $8 & 1; //@line 1374
  HEAP32[$AsyncCtx3 + 48 >> 2] = $$sroa$0$i; //@line 1376
  HEAP32[$AsyncCtx3 + 52 >> 2] = $10; //@line 1378
  HEAP32[$AsyncCtx3 + 56 >> 2] = $4; //@line 1380
  HEAP32[$AsyncCtx3 + 60 >> 2] = $$sroa$0$i; //@line 1382
  HEAP32[$AsyncCtx3 + 64 >> 2] = $0; //@line 1384
  HEAP32[$AsyncCtx3 + 68 >> 2] = $$sroa$0$i; //@line 1386
  HEAP32[$AsyncCtx3 + 72 >> 2] = $0; //@line 1388
  HEAP32[$AsyncCtx3 + 76 >> 2] = $9; //@line 1390
  HEAP32[$AsyncCtx3 + 80 >> 2] = $$idx; //@line 1392
  sp = STACKTOP; //@line 1393
  STACKTOP = sp; //@line 1394
  return;
 } else if ((label | 0) == 39) {
  $144 = $0 + 40 | 0; //@line 1397
  if (HEAP32[$144 >> 2] | 0) {
   _equeue_mutex_lock($5); //@line 1401
   $147 = HEAP32[$144 >> 2] | 0; //@line 1402
   do {
    if ($147 | 0) {
     $149 = HEAP32[$0 >> 2] | 0; //@line 1406
     if ($149 | 0) {
      $152 = HEAP32[$0 + 44 >> 2] | 0; //@line 1410
      $155 = (HEAP32[$149 + 20 >> 2] | 0) - $141 | 0; //@line 1413
      $AsyncCtx7 = _emscripten_alloc_async_context(16, sp) | 0; //@line 1417
      FUNCTION_TABLE_vii[$147 & 3]($152, $155 & ~($155 >> 31)); //@line 1418
      if (___async) {
       HEAP32[$AsyncCtx7 >> 2] = 30; //@line 1421
       HEAP32[$AsyncCtx7 + 4 >> 2] = $4; //@line 1423
       HEAP32[$AsyncCtx7 + 8 >> 2] = $5; //@line 1425
       HEAP32[$AsyncCtx7 + 12 >> 2] = $10; //@line 1427
       sp = STACKTOP; //@line 1428
       STACKTOP = sp; //@line 1429
       return;
      } else {
       _emscripten_free_async_context($AsyncCtx7 | 0); //@line 1431
       break;
      }
     }
    }
   } while (0);
   HEAP8[$4 >> 0] = 1; //@line 1437
   _equeue_mutex_unlock($5); //@line 1438
  }
  HEAP8[$10 >> 0] = 0; //@line 1440
  STACKTOP = sp; //@line 1441
  return;
 } else if ((label | 0) == 51) {
  HEAP8[$10 >> 0] = 0; //@line 1444
  _equeue_mutex_unlock($5); //@line 1445
  STACKTOP = sp; //@line 1446
  return;
 } else if ((label | 0) == 54) {
  HEAP32[$AsyncCtx15 >> 2] = 31; //@line 1449
  HEAP32[$AsyncCtx15 + 4 >> 2] = $12; //@line 1451
  HEAP32[$AsyncCtx15 + 8 >> 2] = $11; //@line 1453
  HEAP32[$AsyncCtx15 + 12 >> 2] = $5; //@line 1455
  HEAP32[$AsyncCtx15 + 16 >> 2] = $175; //@line 1457
  HEAP32[$AsyncCtx15 + 20 >> 2] = $6; //@line 1459
  HEAP32[$AsyncCtx15 + 24 >> 2] = $7; //@line 1461
  HEAP32[$AsyncCtx15 + 28 >> 2] = $0; //@line 1463
  HEAP32[$AsyncCtx15 + 32 >> 2] = $3; //@line 1465
  HEAP8[$AsyncCtx15 + 36 >> 0] = $8 & 1; //@line 1468
  HEAP32[$AsyncCtx15 + 40 >> 2] = $$sroa$0$i; //@line 1470
  HEAP32[$AsyncCtx15 + 44 >> 2] = $10; //@line 1472
  HEAP32[$AsyncCtx15 + 48 >> 2] = $4; //@line 1474
  HEAP32[$AsyncCtx15 + 52 >> 2] = $$sroa$0$i; //@line 1476
  HEAP32[$AsyncCtx15 + 56 >> 2] = $0; //@line 1478
  HEAP32[$AsyncCtx15 + 60 >> 2] = $$sroa$0$i; //@line 1480
  HEAP32[$AsyncCtx15 + 64 >> 2] = $0; //@line 1482
  HEAP32[$AsyncCtx15 + 68 >> 2] = $9; //@line 1484
  HEAP32[$AsyncCtx15 + 72 >> 2] = $$idx; //@line 1486
  sp = STACKTOP; //@line 1487
  STACKTOP = sp; //@line 1488
  return;
 }
}
function __ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($0, $1, $2, $3, $4) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 var $$0 = 0, $$081$off0 = 0, $$084 = 0, $$085$off0 = 0, $$1 = 0, $$182$off0 = 0, $$186$off0 = 0, $$2 = 0, $$283$off0 = 0, $100 = 0, $104 = 0, $105 = 0, $106 = 0, $122 = 0, $13 = 0, $136 = 0, $19 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $30 = 0, $61 = 0, $69 = 0, $72 = 0, $73 = 0, $81 = 0, $84 = 0, $87 = 0, $90 = 0, $AsyncCtx = 0, $AsyncCtx11 = 0, $AsyncCtx15 = 0, $AsyncCtx3 = 0, $AsyncCtx7 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 10633
 L1 : do {
  if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, $4) | 0) {
   __ZNK10__cxxabiv117__class_type_info29process_static_type_below_dstEPNS_19__dynamic_cast_infoEPKvi(0, $1, $2, $3); //@line 10639
  } else {
   if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 >> 2] | 0, $4) | 0) {
    if ((HEAP32[$1 + 16 >> 2] | 0) != ($2 | 0)) {
     $13 = $1 + 20 | 0; //@line 10648
     if ((HEAP32[$13 >> 2] | 0) != ($2 | 0)) {
      HEAP32[$1 + 32 >> 2] = $3; //@line 10653
      $19 = $1 + 44 | 0; //@line 10654
      if ((HEAP32[$19 >> 2] | 0) == 4) {
       break;
      }
      $25 = $0 + 16 + (HEAP32[$0 + 12 >> 2] << 3) | 0; //@line 10663
      $26 = $1 + 52 | 0; //@line 10664
      $27 = $1 + 53 | 0; //@line 10665
      $28 = $1 + 54 | 0; //@line 10666
      $29 = $0 + 8 | 0; //@line 10667
      $30 = $1 + 24 | 0; //@line 10668
      $$081$off0 = 0; //@line 10669
      $$084 = $0 + 16 | 0; //@line 10669
      $$085$off0 = 0; //@line 10669
      L10 : while (1) {
       if ($$084 >>> 0 >= $25 >>> 0) {
        $$283$off0 = $$081$off0; //@line 10673
        label = 20; //@line 10674
        break;
       }
       HEAP8[$26 >> 0] = 0; //@line 10677
       HEAP8[$27 >> 0] = 0; //@line 10678
       $AsyncCtx15 = _emscripten_alloc_async_context(56, sp) | 0; //@line 10679
       __ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($$084, $1, $2, $2, 1, $4); //@line 10680
       if (___async) {
        label = 12; //@line 10683
        break;
       }
       _emscripten_free_async_context($AsyncCtx15 | 0); //@line 10686
       if (HEAP8[$28 >> 0] | 0) {
        $$283$off0 = $$081$off0; //@line 10690
        label = 20; //@line 10691
        break;
       }
       do {
        if (!(HEAP8[$27 >> 0] | 0)) {
         $$182$off0 = $$081$off0; //@line 10698
         $$186$off0 = $$085$off0; //@line 10698
        } else {
         if (!(HEAP8[$26 >> 0] | 0)) {
          if (!(HEAP32[$29 >> 2] & 1)) {
           $$283$off0 = 1; //@line 10707
           label = 20; //@line 10708
           break L10;
          } else {
           $$182$off0 = 1; //@line 10711
           $$186$off0 = $$085$off0; //@line 10711
           break;
          }
         }
         if ((HEAP32[$30 >> 2] | 0) == 1) {
          label = 25; //@line 10718
          break L10;
         }
         if (!(HEAP32[$29 >> 2] & 2)) {
          label = 25; //@line 10725
          break L10;
         } else {
          $$182$off0 = 1; //@line 10728
          $$186$off0 = 1; //@line 10728
         }
        }
       } while (0);
       $$081$off0 = $$182$off0; //@line 10733
       $$084 = $$084 + 8 | 0; //@line 10733
       $$085$off0 = $$186$off0; //@line 10733
      }
      if ((label | 0) == 12) {
       HEAP32[$AsyncCtx15 >> 2] = 97; //@line 10736
       HEAP32[$AsyncCtx15 + 4 >> 2] = $28; //@line 10738
       HEAP32[$AsyncCtx15 + 8 >> 2] = $30; //@line 10740
       HEAP32[$AsyncCtx15 + 12 >> 2] = $19; //@line 10742
       HEAP32[$AsyncCtx15 + 16 >> 2] = $26; //@line 10744
       HEAP32[$AsyncCtx15 + 20 >> 2] = $27; //@line 10746
       HEAP32[$AsyncCtx15 + 24 >> 2] = $1; //@line 10748
       HEAP32[$AsyncCtx15 + 28 >> 2] = $2; //@line 10750
       HEAP8[$AsyncCtx15 + 32 >> 0] = $4 & 1; //@line 10753
       HEAP32[$AsyncCtx15 + 36 >> 2] = $25; //@line 10755
       HEAP32[$AsyncCtx15 + 40 >> 2] = $29; //@line 10757
       HEAP32[$AsyncCtx15 + 44 >> 2] = $13; //@line 10759
       HEAP8[$AsyncCtx15 + 48 >> 0] = $$081$off0 & 1; //@line 10762
       HEAP8[$AsyncCtx15 + 49 >> 0] = $$085$off0 & 1; //@line 10765
       HEAP32[$AsyncCtx15 + 52 >> 2] = $$084; //@line 10767
       sp = STACKTOP; //@line 10768
       return;
      }
      do {
       if ((label | 0) == 20) {
        if (!$$085$off0) {
         HEAP32[$13 >> 2] = $2; //@line 10774
         $61 = $1 + 40 | 0; //@line 10775
         HEAP32[$61 >> 2] = (HEAP32[$61 >> 2] | 0) + 1; //@line 10778
         if ((HEAP32[$1 + 36 >> 2] | 0) == 1) {
          if ((HEAP32[$30 >> 2] | 0) == 2) {
           HEAP8[$28 >> 0] = 1; //@line 10786
           if ($$283$off0) {
            label = 25; //@line 10788
            break;
           } else {
            $69 = 4; //@line 10791
            break;
           }
          }
         }
        }
        if ($$283$off0) {
         label = 25; //@line 10798
        } else {
         $69 = 4; //@line 10800
        }
       }
      } while (0);
      if ((label | 0) == 25) {
       $69 = 3; //@line 10805
      }
      HEAP32[$19 >> 2] = $69; //@line 10807
      break;
     }
    }
    if (($3 | 0) != 1) {
     break;
    }
    HEAP32[$1 + 32 >> 2] = 1; //@line 10816
    break;
   }
   $72 = HEAP32[$0 + 12 >> 2] | 0; //@line 10821
   $73 = $0 + 16 + ($72 << 3) | 0; //@line 10822
   $AsyncCtx11 = _emscripten_alloc_async_context(32, sp) | 0; //@line 10823
   __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($0 + 16 | 0, $1, $2, $3, $4); //@line 10824
   if (___async) {
    HEAP32[$AsyncCtx11 >> 2] = 98; //@line 10827
    HEAP32[$AsyncCtx11 + 4 >> 2] = $1; //@line 10829
    HEAP32[$AsyncCtx11 + 8 >> 2] = $0; //@line 10831
    HEAP32[$AsyncCtx11 + 12 >> 2] = $73; //@line 10833
    HEAP32[$AsyncCtx11 + 16 >> 2] = $2; //@line 10835
    HEAP32[$AsyncCtx11 + 20 >> 2] = $3; //@line 10837
    HEAP8[$AsyncCtx11 + 24 >> 0] = $4 & 1; //@line 10840
    HEAP32[$AsyncCtx11 + 28 >> 2] = $72; //@line 10842
    sp = STACKTOP; //@line 10843
    return;
   }
   _emscripten_free_async_context($AsyncCtx11 | 0); //@line 10846
   $81 = $0 + 24 | 0; //@line 10847
   if (($72 | 0) > 1) {
    $84 = HEAP32[$0 + 8 >> 2] | 0; //@line 10851
    if (!($84 & 2)) {
     $87 = $1 + 36 | 0; //@line 10855
     if ((HEAP32[$87 >> 2] | 0) != 1) {
      if (!($84 & 1)) {
       $106 = $1 + 54 | 0; //@line 10862
       $$2 = $81; //@line 10863
       while (1) {
        if (HEAP8[$106 >> 0] | 0) {
         break L1;
        }
        if ((HEAP32[$87 >> 2] | 0) == 1) {
         break L1;
        }
        $AsyncCtx = _emscripten_alloc_async_context(36, sp) | 0; //@line 10875
        __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($$2, $1, $2, $3, $4); //@line 10876
        if (___async) {
         break;
        }
        _emscripten_free_async_context($AsyncCtx | 0); //@line 10881
        $136 = $$2 + 8 | 0; //@line 10882
        if ($136 >>> 0 < $73 >>> 0) {
         $$2 = $136; //@line 10885
        } else {
         break L1;
        }
       }
       HEAP32[$AsyncCtx >> 2] = 101; //@line 10890
       HEAP32[$AsyncCtx + 4 >> 2] = $$2; //@line 10892
       HEAP32[$AsyncCtx + 8 >> 2] = $73; //@line 10894
       HEAP32[$AsyncCtx + 12 >> 2] = $106; //@line 10896
       HEAP32[$AsyncCtx + 16 >> 2] = $87; //@line 10898
       HEAP32[$AsyncCtx + 20 >> 2] = $1; //@line 10900
       HEAP32[$AsyncCtx + 24 >> 2] = $2; //@line 10902
       HEAP32[$AsyncCtx + 28 >> 2] = $3; //@line 10904
       HEAP8[$AsyncCtx + 32 >> 0] = $4 & 1; //@line 10907
       sp = STACKTOP; //@line 10908
       return;
      }
      $104 = $1 + 24 | 0; //@line 10911
      $105 = $1 + 54 | 0; //@line 10912
      $$1 = $81; //@line 10913
      while (1) {
       if (HEAP8[$105 >> 0] | 0) {
        break L1;
       }
       if ((HEAP32[$87 >> 2] | 0) == 1) {
        if ((HEAP32[$104 >> 2] | 0) == 1) {
         break L1;
        }
       }
       $AsyncCtx3 = _emscripten_alloc_async_context(40, sp) | 0; //@line 10929
       __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($$1, $1, $2, $3, $4); //@line 10930
       if (___async) {
        break;
       }
       _emscripten_free_async_context($AsyncCtx3 | 0); //@line 10935
       $122 = $$1 + 8 | 0; //@line 10936
       if ($122 >>> 0 < $73 >>> 0) {
        $$1 = $122; //@line 10939
       } else {
        break L1;
       }
      }
      HEAP32[$AsyncCtx3 >> 2] = 100; //@line 10944
      HEAP32[$AsyncCtx3 + 4 >> 2] = $$1; //@line 10946
      HEAP32[$AsyncCtx3 + 8 >> 2] = $73; //@line 10948
      HEAP32[$AsyncCtx3 + 12 >> 2] = $105; //@line 10950
      HEAP32[$AsyncCtx3 + 16 >> 2] = $87; //@line 10952
      HEAP32[$AsyncCtx3 + 20 >> 2] = $104; //@line 10954
      HEAP32[$AsyncCtx3 + 24 >> 2] = $1; //@line 10956
      HEAP32[$AsyncCtx3 + 28 >> 2] = $2; //@line 10958
      HEAP32[$AsyncCtx3 + 32 >> 2] = $3; //@line 10960
      HEAP8[$AsyncCtx3 + 36 >> 0] = $4 & 1; //@line 10963
      sp = STACKTOP; //@line 10964
      return;
     }
    }
    $90 = $1 + 54 | 0; //@line 10968
    $$0 = $81; //@line 10969
    while (1) {
     if (HEAP8[$90 >> 0] | 0) {
      break L1;
     }
     $AsyncCtx7 = _emscripten_alloc_async_context(32, sp) | 0; //@line 10976
     __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($$0, $1, $2, $3, $4); //@line 10977
     if (___async) {
      break;
     }
     _emscripten_free_async_context($AsyncCtx7 | 0); //@line 10982
     $100 = $$0 + 8 | 0; //@line 10983
     if ($100 >>> 0 < $73 >>> 0) {
      $$0 = $100; //@line 10986
     } else {
      break L1;
     }
    }
    HEAP32[$AsyncCtx7 >> 2] = 99; //@line 10991
    HEAP32[$AsyncCtx7 + 4 >> 2] = $$0; //@line 10993
    HEAP32[$AsyncCtx7 + 8 >> 2] = $73; //@line 10995
    HEAP32[$AsyncCtx7 + 12 >> 2] = $90; //@line 10997
    HEAP32[$AsyncCtx7 + 16 >> 2] = $1; //@line 10999
    HEAP32[$AsyncCtx7 + 20 >> 2] = $2; //@line 11001
    HEAP32[$AsyncCtx7 + 24 >> 2] = $3; //@line 11003
    HEAP8[$AsyncCtx7 + 28 >> 0] = $4 & 1; //@line 11006
    sp = STACKTOP; //@line 11007
    return;
   }
  }
 } while (0);
 return;
}
function ___udivmoddi4($a$0, $a$1, $b$0, $b$1, $rem) {
 $a$0 = $a$0 | 0;
 $a$1 = $a$1 | 0;
 $b$0 = $b$0 | 0;
 $b$1 = $b$1 | 0;
 $rem = $rem | 0;
 var $n_sroa_0_0_extract_trunc = 0, $n_sroa_1_4_extract_shift$0 = 0, $n_sroa_1_4_extract_trunc = 0, $d_sroa_0_0_extract_trunc = 0, $d_sroa_1_4_extract_shift$0 = 0, $d_sroa_1_4_extract_trunc = 0, $4 = 0, $17 = 0, $37 = 0, $51 = 0, $57 = 0, $58 = 0, $66 = 0, $78 = 0, $88 = 0, $89 = 0, $91 = 0, $92 = 0, $95 = 0, $105 = 0, $119 = 0, $125 = 0, $126 = 0, $130 = 0, $q_sroa_1_1_ph = 0, $q_sroa_0_1_ph = 0, $r_sroa_1_1_ph = 0, $r_sroa_0_1_ph = 0, $sr_1_ph = 0, $d_sroa_0_0_insert_insert99$0 = 0, $d_sroa_0_0_insert_insert99$1 = 0, $137$0 = 0, $137$1 = 0, $carry_0203 = 0, $sr_1202 = 0, $r_sroa_0_1201 = 0, $r_sroa_1_1200 = 0, $q_sroa_0_1199 = 0, $q_sroa_1_1198 = 0, $r_sroa_0_0_insert_insert42$0 = 0, $r_sroa_0_0_insert_insert42$1 = 0, $150$1 = 0, $151$0 = 0, $carry_0_lcssa$0 = 0, $carry_0_lcssa$1 = 0, $r_sroa_0_1_lcssa = 0, $r_sroa_1_1_lcssa = 0, $q_sroa_0_1_lcssa = 0, $q_sroa_1_1_lcssa = 0, $q_sroa_0_0_insert_ext75$0 = 0, $q_sroa_0_0_insert_ext75$1 = 0, $_0$0 = 0, $_0$1 = 0, $q_sroa_1_1198$looptemp = 0;
 $n_sroa_0_0_extract_trunc = $a$0; //@line 2961
 $n_sroa_1_4_extract_shift$0 = $a$1; //@line 2962
 $n_sroa_1_4_extract_trunc = $n_sroa_1_4_extract_shift$0; //@line 2963
 $d_sroa_0_0_extract_trunc = $b$0; //@line 2964
 $d_sroa_1_4_extract_shift$0 = $b$1; //@line 2965
 $d_sroa_1_4_extract_trunc = $d_sroa_1_4_extract_shift$0; //@line 2966
 if (!$n_sroa_1_4_extract_trunc) {
  $4 = ($rem | 0) != 0; //@line 2968
  if (!$d_sroa_1_4_extract_trunc) {
   if ($4) {
    HEAP32[$rem >> 2] = ($n_sroa_0_0_extract_trunc >>> 0) % ($d_sroa_0_0_extract_trunc >>> 0); //@line 2971
    HEAP32[$rem + 4 >> 2] = 0; //@line 2972
   }
   $_0$1 = 0; //@line 2974
   $_0$0 = ($n_sroa_0_0_extract_trunc >>> 0) / ($d_sroa_0_0_extract_trunc >>> 0) >>> 0; //@line 2975
   return (tempRet0 = $_0$1, $_0$0) | 0; //@line 2976
  } else {
   if (!$4) {
    $_0$1 = 0; //@line 2979
    $_0$0 = 0; //@line 2980
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 2981
   }
   HEAP32[$rem >> 2] = $a$0 | 0; //@line 2983
   HEAP32[$rem + 4 >> 2] = $a$1 & 0; //@line 2984
   $_0$1 = 0; //@line 2985
   $_0$0 = 0; //@line 2986
   return (tempRet0 = $_0$1, $_0$0) | 0; //@line 2987
  }
 }
 $17 = ($d_sroa_1_4_extract_trunc | 0) == 0; //@line 2990
 do {
  if (!$d_sroa_0_0_extract_trunc) {
   if ($17) {
    if ($rem | 0) {
     HEAP32[$rem >> 2] = ($n_sroa_1_4_extract_trunc >>> 0) % ($d_sroa_0_0_extract_trunc >>> 0); //@line 2995
     HEAP32[$rem + 4 >> 2] = 0; //@line 2996
    }
    $_0$1 = 0; //@line 2998
    $_0$0 = ($n_sroa_1_4_extract_trunc >>> 0) / ($d_sroa_0_0_extract_trunc >>> 0) >>> 0; //@line 2999
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 3000
   }
   if (!$n_sroa_0_0_extract_trunc) {
    if ($rem | 0) {
     HEAP32[$rem >> 2] = 0; //@line 3004
     HEAP32[$rem + 4 >> 2] = ($n_sroa_1_4_extract_trunc >>> 0) % ($d_sroa_1_4_extract_trunc >>> 0); //@line 3005
    }
    $_0$1 = 0; //@line 3007
    $_0$0 = ($n_sroa_1_4_extract_trunc >>> 0) / ($d_sroa_1_4_extract_trunc >>> 0) >>> 0; //@line 3008
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 3009
   }
   $37 = $d_sroa_1_4_extract_trunc - 1 | 0; //@line 3011
   if (!($37 & $d_sroa_1_4_extract_trunc)) {
    if ($rem | 0) {
     HEAP32[$rem >> 2] = $a$0 | 0; //@line 3014
     HEAP32[$rem + 4 >> 2] = $37 & $n_sroa_1_4_extract_trunc | $a$1 & 0; //@line 3015
    }
    $_0$1 = 0; //@line 3017
    $_0$0 = $n_sroa_1_4_extract_trunc >>> ((_llvm_cttz_i32($d_sroa_1_4_extract_trunc | 0) | 0) >>> 0); //@line 3018
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 3019
   }
   $51 = (Math_clz32($d_sroa_1_4_extract_trunc | 0) | 0) - (Math_clz32($n_sroa_1_4_extract_trunc | 0) | 0) | 0; //@line 3022
   if ($51 >>> 0 <= 30) {
    $57 = $51 + 1 | 0; //@line 3024
    $58 = 31 - $51 | 0; //@line 3025
    $sr_1_ph = $57; //@line 3026
    $r_sroa_0_1_ph = $n_sroa_1_4_extract_trunc << $58 | $n_sroa_0_0_extract_trunc >>> ($57 >>> 0); //@line 3027
    $r_sroa_1_1_ph = $n_sroa_1_4_extract_trunc >>> ($57 >>> 0); //@line 3028
    $q_sroa_0_1_ph = 0; //@line 3029
    $q_sroa_1_1_ph = $n_sroa_0_0_extract_trunc << $58; //@line 3030
    break;
   }
   if (!$rem) {
    $_0$1 = 0; //@line 3034
    $_0$0 = 0; //@line 3035
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 3036
   }
   HEAP32[$rem >> 2] = $a$0 | 0; //@line 3038
   HEAP32[$rem + 4 >> 2] = $n_sroa_1_4_extract_shift$0 | $a$1 & 0; //@line 3039
   $_0$1 = 0; //@line 3040
   $_0$0 = 0; //@line 3041
   return (tempRet0 = $_0$1, $_0$0) | 0; //@line 3042
  } else {
   if (!$17) {
    $119 = (Math_clz32($d_sroa_1_4_extract_trunc | 0) | 0) - (Math_clz32($n_sroa_1_4_extract_trunc | 0) | 0) | 0; //@line 3046
    if ($119 >>> 0 <= 31) {
     $125 = $119 + 1 | 0; //@line 3048
     $126 = 31 - $119 | 0; //@line 3049
     $130 = $119 - 31 >> 31; //@line 3050
     $sr_1_ph = $125; //@line 3051
     $r_sroa_0_1_ph = $n_sroa_0_0_extract_trunc >>> ($125 >>> 0) & $130 | $n_sroa_1_4_extract_trunc << $126; //@line 3052
     $r_sroa_1_1_ph = $n_sroa_1_4_extract_trunc >>> ($125 >>> 0) & $130; //@line 3053
     $q_sroa_0_1_ph = 0; //@line 3054
     $q_sroa_1_1_ph = $n_sroa_0_0_extract_trunc << $126; //@line 3055
     break;
    }
    if (!$rem) {
     $_0$1 = 0; //@line 3059
     $_0$0 = 0; //@line 3060
     return (tempRet0 = $_0$1, $_0$0) | 0; //@line 3061
    }
    HEAP32[$rem >> 2] = $a$0 | 0; //@line 3063
    HEAP32[$rem + 4 >> 2] = $n_sroa_1_4_extract_shift$0 | $a$1 & 0; //@line 3064
    $_0$1 = 0; //@line 3065
    $_0$0 = 0; //@line 3066
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 3067
   }
   $66 = $d_sroa_0_0_extract_trunc - 1 | 0; //@line 3069
   if ($66 & $d_sroa_0_0_extract_trunc | 0) {
    $88 = (Math_clz32($d_sroa_0_0_extract_trunc | 0) | 0) + 33 - (Math_clz32($n_sroa_1_4_extract_trunc | 0) | 0) | 0; //@line 3072
    $89 = 64 - $88 | 0; //@line 3073
    $91 = 32 - $88 | 0; //@line 3074
    $92 = $91 >> 31; //@line 3075
    $95 = $88 - 32 | 0; //@line 3076
    $105 = $95 >> 31; //@line 3077
    $sr_1_ph = $88; //@line 3078
    $r_sroa_0_1_ph = $91 - 1 >> 31 & $n_sroa_1_4_extract_trunc >>> ($95 >>> 0) | ($n_sroa_1_4_extract_trunc << $91 | $n_sroa_0_0_extract_trunc >>> ($88 >>> 0)) & $105; //@line 3079
    $r_sroa_1_1_ph = $105 & $n_sroa_1_4_extract_trunc >>> ($88 >>> 0); //@line 3080
    $q_sroa_0_1_ph = $n_sroa_0_0_extract_trunc << $89 & $92; //@line 3081
    $q_sroa_1_1_ph = ($n_sroa_1_4_extract_trunc << $89 | $n_sroa_0_0_extract_trunc >>> ($95 >>> 0)) & $92 | $n_sroa_0_0_extract_trunc << $91 & $88 - 33 >> 31; //@line 3082
    break;
   }
   if ($rem | 0) {
    HEAP32[$rem >> 2] = $66 & $n_sroa_0_0_extract_trunc; //@line 3086
    HEAP32[$rem + 4 >> 2] = 0; //@line 3087
   }
   if (($d_sroa_0_0_extract_trunc | 0) == 1) {
    $_0$1 = $n_sroa_1_4_extract_shift$0 | $a$1 & 0; //@line 3090
    $_0$0 = $a$0 | 0 | 0; //@line 3091
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 3092
   } else {
    $78 = _llvm_cttz_i32($d_sroa_0_0_extract_trunc | 0) | 0; //@line 3094
    $_0$1 = $n_sroa_1_4_extract_trunc >>> ($78 >>> 0) | 0; //@line 3095
    $_0$0 = $n_sroa_1_4_extract_trunc << 32 - $78 | $n_sroa_0_0_extract_trunc >>> ($78 >>> 0) | 0; //@line 3096
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 3097
   }
  }
 } while (0);
 if (!$sr_1_ph) {
  $q_sroa_1_1_lcssa = $q_sroa_1_1_ph; //@line 3102
  $q_sroa_0_1_lcssa = $q_sroa_0_1_ph; //@line 3103
  $r_sroa_1_1_lcssa = $r_sroa_1_1_ph; //@line 3104
  $r_sroa_0_1_lcssa = $r_sroa_0_1_ph; //@line 3105
  $carry_0_lcssa$1 = 0; //@line 3106
  $carry_0_lcssa$0 = 0; //@line 3107
 } else {
  $d_sroa_0_0_insert_insert99$0 = $b$0 | 0 | 0; //@line 3109
  $d_sroa_0_0_insert_insert99$1 = $d_sroa_1_4_extract_shift$0 | $b$1 & 0; //@line 3110
  $137$0 = _i64Add($d_sroa_0_0_insert_insert99$0 | 0, $d_sroa_0_0_insert_insert99$1 | 0, -1, -1) | 0; //@line 3111
  $137$1 = tempRet0; //@line 3112
  $q_sroa_1_1198 = $q_sroa_1_1_ph; //@line 3113
  $q_sroa_0_1199 = $q_sroa_0_1_ph; //@line 3114
  $r_sroa_1_1200 = $r_sroa_1_1_ph; //@line 3115
  $r_sroa_0_1201 = $r_sroa_0_1_ph; //@line 3116
  $sr_1202 = $sr_1_ph; //@line 3117
  $carry_0203 = 0; //@line 3118
  do {
   $q_sroa_1_1198$looptemp = $q_sroa_1_1198;
   $q_sroa_1_1198 = $q_sroa_0_1199 >>> 31 | $q_sroa_1_1198 << 1; //@line 3120
   $q_sroa_0_1199 = $carry_0203 | $q_sroa_0_1199 << 1; //@line 3121
   $r_sroa_0_0_insert_insert42$0 = $r_sroa_0_1201 << 1 | $q_sroa_1_1198$looptemp >>> 31 | 0; //@line 3122
   $r_sroa_0_0_insert_insert42$1 = $r_sroa_0_1201 >>> 31 | $r_sroa_1_1200 << 1 | 0; //@line 3123
   _i64Subtract($137$0 | 0, $137$1 | 0, $r_sroa_0_0_insert_insert42$0 | 0, $r_sroa_0_0_insert_insert42$1 | 0) | 0; //@line 3124
   $150$1 = tempRet0; //@line 3125
   $151$0 = $150$1 >> 31 | (($150$1 | 0) < 0 ? -1 : 0) << 1; //@line 3126
   $carry_0203 = $151$0 & 1; //@line 3127
   $r_sroa_0_1201 = _i64Subtract($r_sroa_0_0_insert_insert42$0 | 0, $r_sroa_0_0_insert_insert42$1 | 0, $151$0 & $d_sroa_0_0_insert_insert99$0 | 0, ((($150$1 | 0) < 0 ? -1 : 0) >> 31 | (($150$1 | 0) < 0 ? -1 : 0) << 1) & $d_sroa_0_0_insert_insert99$1 | 0) | 0; //@line 3129
   $r_sroa_1_1200 = tempRet0; //@line 3130
   $sr_1202 = $sr_1202 - 1 | 0; //@line 3131
  } while (($sr_1202 | 0) != 0);
  $q_sroa_1_1_lcssa = $q_sroa_1_1198; //@line 3143
  $q_sroa_0_1_lcssa = $q_sroa_0_1199; //@line 3144
  $r_sroa_1_1_lcssa = $r_sroa_1_1200; //@line 3145
  $r_sroa_0_1_lcssa = $r_sroa_0_1201; //@line 3146
  $carry_0_lcssa$1 = 0; //@line 3147
  $carry_0_lcssa$0 = $carry_0203; //@line 3148
 }
 $q_sroa_0_0_insert_ext75$0 = $q_sroa_0_1_lcssa; //@line 3150
 $q_sroa_0_0_insert_ext75$1 = 0; //@line 3151
 if ($rem | 0) {
  HEAP32[$rem >> 2] = $r_sroa_0_1_lcssa; //@line 3154
  HEAP32[$rem + 4 >> 2] = $r_sroa_1_1_lcssa; //@line 3155
 }
 $_0$1 = ($q_sroa_0_0_insert_ext75$0 | 0) >>> 31 | ($q_sroa_1_1_lcssa | $q_sroa_0_0_insert_ext75$1) << 1 | ($q_sroa_0_0_insert_ext75$1 << 1 | $q_sroa_0_0_insert_ext75$0 >>> 31) & 0 | $carry_0_lcssa$1; //@line 3157
 $_0$0 = ($q_sroa_0_0_insert_ext75$0 << 1 | 0 >>> 31) & -2 | $carry_0_lcssa$0; //@line 3158
 return (tempRet0 = $_0$1, $_0$0) | 0; //@line 3159
}
function _mbed_die() {
 var $0 = 0, $AsyncCtx = 0, $AsyncCtx11 = 0, $AsyncCtx15 = 0, $AsyncCtx19 = 0, $AsyncCtx23 = 0, $AsyncCtx27 = 0, $AsyncCtx3 = 0, $AsyncCtx31 = 0, $AsyncCtx35 = 0, $AsyncCtx39 = 0, $AsyncCtx43 = 0, $AsyncCtx47 = 0, $AsyncCtx51 = 0, $AsyncCtx55 = 0, $AsyncCtx59 = 0, $AsyncCtx7 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 1664
 STACKTOP = STACKTOP + 32 | 0; //@line 1665
 $0 = sp; //@line 1666
 _gpio_init_out($0, 50); //@line 1667
 while (1) {
  _emscripten_asm_const_iii(0, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 1670
  $AsyncCtx59 = _emscripten_alloc_async_context(8, sp) | 0; //@line 1671
  _wait_ms(150); //@line 1672
  if (___async) {
   label = 3; //@line 1675
   break;
  }
  _emscripten_free_async_context($AsyncCtx59 | 0); //@line 1678
  _emscripten_asm_const_iii(0, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 1680
  $AsyncCtx55 = _emscripten_alloc_async_context(8, sp) | 0; //@line 1681
  _wait_ms(150); //@line 1682
  if (___async) {
   label = 5; //@line 1685
   break;
  }
  _emscripten_free_async_context($AsyncCtx55 | 0); //@line 1688
  _emscripten_asm_const_iii(0, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 1690
  $AsyncCtx51 = _emscripten_alloc_async_context(8, sp) | 0; //@line 1691
  _wait_ms(150); //@line 1692
  if (___async) {
   label = 7; //@line 1695
   break;
  }
  _emscripten_free_async_context($AsyncCtx51 | 0); //@line 1698
  _emscripten_asm_const_iii(0, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 1700
  $AsyncCtx47 = _emscripten_alloc_async_context(8, sp) | 0; //@line 1701
  _wait_ms(150); //@line 1702
  if (___async) {
   label = 9; //@line 1705
   break;
  }
  _emscripten_free_async_context($AsyncCtx47 | 0); //@line 1708
  _emscripten_asm_const_iii(0, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 1710
  $AsyncCtx43 = _emscripten_alloc_async_context(8, sp) | 0; //@line 1711
  _wait_ms(150); //@line 1712
  if (___async) {
   label = 11; //@line 1715
   break;
  }
  _emscripten_free_async_context($AsyncCtx43 | 0); //@line 1718
  _emscripten_asm_const_iii(0, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 1720
  $AsyncCtx39 = _emscripten_alloc_async_context(8, sp) | 0; //@line 1721
  _wait_ms(150); //@line 1722
  if (___async) {
   label = 13; //@line 1725
   break;
  }
  _emscripten_free_async_context($AsyncCtx39 | 0); //@line 1728
  _emscripten_asm_const_iii(0, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 1730
  $AsyncCtx35 = _emscripten_alloc_async_context(8, sp) | 0; //@line 1731
  _wait_ms(150); //@line 1732
  if (___async) {
   label = 15; //@line 1735
   break;
  }
  _emscripten_free_async_context($AsyncCtx35 | 0); //@line 1738
  _emscripten_asm_const_iii(0, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 1740
  $AsyncCtx31 = _emscripten_alloc_async_context(8, sp) | 0; //@line 1741
  _wait_ms(150); //@line 1742
  if (___async) {
   label = 17; //@line 1745
   break;
  }
  _emscripten_free_async_context($AsyncCtx31 | 0); //@line 1748
  _emscripten_asm_const_iii(0, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 1750
  $AsyncCtx27 = _emscripten_alloc_async_context(8, sp) | 0; //@line 1751
  _wait_ms(400); //@line 1752
  if (___async) {
   label = 19; //@line 1755
   break;
  }
  _emscripten_free_async_context($AsyncCtx27 | 0); //@line 1758
  _emscripten_asm_const_iii(0, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 1760
  $AsyncCtx23 = _emscripten_alloc_async_context(8, sp) | 0; //@line 1761
  _wait_ms(400); //@line 1762
  if (___async) {
   label = 21; //@line 1765
   break;
  }
  _emscripten_free_async_context($AsyncCtx23 | 0); //@line 1768
  _emscripten_asm_const_iii(0, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 1770
  $AsyncCtx19 = _emscripten_alloc_async_context(8, sp) | 0; //@line 1771
  _wait_ms(400); //@line 1772
  if (___async) {
   label = 23; //@line 1775
   break;
  }
  _emscripten_free_async_context($AsyncCtx19 | 0); //@line 1778
  _emscripten_asm_const_iii(0, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 1780
  $AsyncCtx15 = _emscripten_alloc_async_context(8, sp) | 0; //@line 1781
  _wait_ms(400); //@line 1782
  if (___async) {
   label = 25; //@line 1785
   break;
  }
  _emscripten_free_async_context($AsyncCtx15 | 0); //@line 1788
  _emscripten_asm_const_iii(0, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 1790
  $AsyncCtx11 = _emscripten_alloc_async_context(8, sp) | 0; //@line 1791
  _wait_ms(400); //@line 1792
  if (___async) {
   label = 27; //@line 1795
   break;
  }
  _emscripten_free_async_context($AsyncCtx11 | 0); //@line 1798
  _emscripten_asm_const_iii(0, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 1800
  $AsyncCtx7 = _emscripten_alloc_async_context(8, sp) | 0; //@line 1801
  _wait_ms(400); //@line 1802
  if (___async) {
   label = 29; //@line 1805
   break;
  }
  _emscripten_free_async_context($AsyncCtx7 | 0); //@line 1808
  _emscripten_asm_const_iii(0, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 1810
  $AsyncCtx3 = _emscripten_alloc_async_context(8, sp) | 0; //@line 1811
  _wait_ms(400); //@line 1812
  if (___async) {
   label = 31; //@line 1815
   break;
  }
  _emscripten_free_async_context($AsyncCtx3 | 0); //@line 1818
  _emscripten_asm_const_iii(0, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 1820
  $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 1821
  _wait_ms(400); //@line 1822
  if (___async) {
   label = 33; //@line 1825
   break;
  }
  _emscripten_free_async_context($AsyncCtx | 0); //@line 1828
 }
 switch (label | 0) {
 case 3:
  {
   HEAP32[$AsyncCtx59 >> 2] = 33; //@line 1832
   HEAP32[$AsyncCtx59 + 4 >> 2] = $0; //@line 1834
   sp = STACKTOP; //@line 1835
   STACKTOP = sp; //@line 1836
   return;
  }
 case 5:
  {
   HEAP32[$AsyncCtx55 >> 2] = 34; //@line 1840
   HEAP32[$AsyncCtx55 + 4 >> 2] = $0; //@line 1842
   sp = STACKTOP; //@line 1843
   STACKTOP = sp; //@line 1844
   return;
  }
 case 7:
  {
   HEAP32[$AsyncCtx51 >> 2] = 35; //@line 1848
   HEAP32[$AsyncCtx51 + 4 >> 2] = $0; //@line 1850
   sp = STACKTOP; //@line 1851
   STACKTOP = sp; //@line 1852
   return;
  }
 case 9:
  {
   HEAP32[$AsyncCtx47 >> 2] = 36; //@line 1856
   HEAP32[$AsyncCtx47 + 4 >> 2] = $0; //@line 1858
   sp = STACKTOP; //@line 1859
   STACKTOP = sp; //@line 1860
   return;
  }
 case 11:
  {
   HEAP32[$AsyncCtx43 >> 2] = 37; //@line 1864
   HEAP32[$AsyncCtx43 + 4 >> 2] = $0; //@line 1866
   sp = STACKTOP; //@line 1867
   STACKTOP = sp; //@line 1868
   return;
  }
 case 13:
  {
   HEAP32[$AsyncCtx39 >> 2] = 38; //@line 1872
   HEAP32[$AsyncCtx39 + 4 >> 2] = $0; //@line 1874
   sp = STACKTOP; //@line 1875
   STACKTOP = sp; //@line 1876
   return;
  }
 case 15:
  {
   HEAP32[$AsyncCtx35 >> 2] = 39; //@line 1880
   HEAP32[$AsyncCtx35 + 4 >> 2] = $0; //@line 1882
   sp = STACKTOP; //@line 1883
   STACKTOP = sp; //@line 1884
   return;
  }
 case 17:
  {
   HEAP32[$AsyncCtx31 >> 2] = 40; //@line 1888
   HEAP32[$AsyncCtx31 + 4 >> 2] = $0; //@line 1890
   sp = STACKTOP; //@line 1891
   STACKTOP = sp; //@line 1892
   return;
  }
 case 19:
  {
   HEAP32[$AsyncCtx27 >> 2] = 41; //@line 1896
   HEAP32[$AsyncCtx27 + 4 >> 2] = $0; //@line 1898
   sp = STACKTOP; //@line 1899
   STACKTOP = sp; //@line 1900
   return;
  }
 case 21:
  {
   HEAP32[$AsyncCtx23 >> 2] = 42; //@line 1904
   HEAP32[$AsyncCtx23 + 4 >> 2] = $0; //@line 1906
   sp = STACKTOP; //@line 1907
   STACKTOP = sp; //@line 1908
   return;
  }
 case 23:
  {
   HEAP32[$AsyncCtx19 >> 2] = 43; //@line 1912
   HEAP32[$AsyncCtx19 + 4 >> 2] = $0; //@line 1914
   sp = STACKTOP; //@line 1915
   STACKTOP = sp; //@line 1916
   return;
  }
 case 25:
  {
   HEAP32[$AsyncCtx15 >> 2] = 44; //@line 1920
   HEAP32[$AsyncCtx15 + 4 >> 2] = $0; //@line 1922
   sp = STACKTOP; //@line 1923
   STACKTOP = sp; //@line 1924
   return;
  }
 case 27:
  {
   HEAP32[$AsyncCtx11 >> 2] = 45; //@line 1928
   HEAP32[$AsyncCtx11 + 4 >> 2] = $0; //@line 1930
   sp = STACKTOP; //@line 1931
   STACKTOP = sp; //@line 1932
   return;
  }
 case 29:
  {
   HEAP32[$AsyncCtx7 >> 2] = 46; //@line 1936
   HEAP32[$AsyncCtx7 + 4 >> 2] = $0; //@line 1938
   sp = STACKTOP; //@line 1939
   STACKTOP = sp; //@line 1940
   return;
  }
 case 31:
  {
   HEAP32[$AsyncCtx3 >> 2] = 47; //@line 1944
   HEAP32[$AsyncCtx3 + 4 >> 2] = $0; //@line 1946
   sp = STACKTOP; //@line 1947
   STACKTOP = sp; //@line 1948
   return;
  }
 case 33:
  {
   HEAP32[$AsyncCtx >> 2] = 48; //@line 1952
   HEAP32[$AsyncCtx + 4 >> 2] = $0; //@line 1954
   sp = STACKTOP; //@line 1955
   STACKTOP = sp; //@line 1956
   return;
  }
 }
}
function _main() {
 var $0 = 0, $1 = 0, $15 = 0, $18 = 0, $21 = 0, $23 = 0, $26 = 0, $29 = 0, $34 = 0, $37 = 0, $40 = 0, $5 = 0, $AsyncCtx = 0, $AsyncCtx10 = 0, $AsyncCtx13 = 0, $AsyncCtx17 = 0, $AsyncCtx20 = 0, $AsyncCtx24 = 0, $AsyncCtx3 = 0, $AsyncCtx6 = 0, sp = 0;
 sp = STACKTOP; //@line 2185
 STACKTOP = STACKTOP + 16 | 0; //@line 2186
 $0 = sp; //@line 2187
 $AsyncCtx24 = _emscripten_alloc_async_context(8, sp) | 0; //@line 2188
 $1 = _equeue_alloc(4388, 4) | 0; //@line 2189
 if (___async) {
  HEAP32[$AsyncCtx24 >> 2] = 55; //@line 2192
  HEAP32[$AsyncCtx24 + 4 >> 2] = $0; //@line 2194
  sp = STACKTOP; //@line 2195
  STACKTOP = sp; //@line 2196
  return 0; //@line 2196
 }
 _emscripten_free_async_context($AsyncCtx24 | 0); //@line 2198
 do {
  if ($1 | 0) {
   HEAP32[$1 >> 2] = 2; //@line 2202
   _equeue_event_delay($1, 1e3); //@line 2203
   _equeue_event_period($1, 1e3); //@line 2204
   _equeue_event_dtor($1, 56); //@line 2205
   $AsyncCtx10 = _emscripten_alloc_async_context(8, sp) | 0; //@line 2206
   _equeue_post(4388, 57, $1) | 0; //@line 2207
   if (___async) {
    HEAP32[$AsyncCtx10 >> 2] = 58; //@line 2210
    HEAP32[$AsyncCtx10 + 4 >> 2] = $0; //@line 2212
    sp = STACKTOP; //@line 2213
    STACKTOP = sp; //@line 2214
    return 0; //@line 2214
   } else {
    _emscripten_free_async_context($AsyncCtx10 | 0); //@line 2216
    break;
   }
  }
 } while (0);
 $AsyncCtx20 = _emscripten_alloc_async_context(8, sp) | 0; //@line 2221
 $5 = _equeue_alloc(4388, 32) | 0; //@line 2222
 if (___async) {
  HEAP32[$AsyncCtx20 >> 2] = 59; //@line 2225
  HEAP32[$AsyncCtx20 + 4 >> 2] = $0; //@line 2227
  sp = STACKTOP; //@line 2228
  STACKTOP = sp; //@line 2229
  return 0; //@line 2229
 }
 _emscripten_free_async_context($AsyncCtx20 | 0); //@line 2231
 if (!$5) {
  HEAP32[$0 >> 2] = 0; //@line 2234
  HEAP32[$0 + 4 >> 2] = 0; //@line 2234
  HEAP32[$0 + 8 >> 2] = 0; //@line 2234
  HEAP32[$0 + 12 >> 2] = 0; //@line 2234
  $21 = 1; //@line 2235
  $23 = $0; //@line 2235
 } else {
  HEAP32[$5 + 4 >> 2] = 4388; //@line 2238
  HEAP32[$5 + 8 >> 2] = 0; //@line 2240
  HEAP32[$5 + 12 >> 2] = 0; //@line 2242
  HEAP32[$5 + 16 >> 2] = -1; //@line 2244
  HEAP32[$5 + 20 >> 2] = 2; //@line 2246
  HEAP32[$5 + 24 >> 2] = 60; //@line 2248
  HEAP32[$5 + 28 >> 2] = 3; //@line 2250
  HEAP32[$5 >> 2] = 1; //@line 2251
  $15 = $0 + 4 | 0; //@line 2252
  HEAP32[$15 >> 2] = 0; //@line 2253
  HEAP32[$15 + 4 >> 2] = 0; //@line 2253
  HEAP32[$15 + 8 >> 2] = 0; //@line 2253
  HEAP32[$0 >> 2] = $5; //@line 2254
  HEAP32[$5 >> 2] = (HEAP32[$5 >> 2] | 0) + 1; //@line 2257
  $21 = 0; //@line 2258
  $23 = $0; //@line 2258
 }
 $18 = $0 + 12 | 0; //@line 2260
 HEAP32[$18 >> 2] = 168; //@line 2261
 $AsyncCtx17 = _emscripten_alloc_async_context(24, sp) | 0; //@line 2262
 __ZN4mbed11InterruptIn4fallENS_8CallbackIFvvEEE(4636, $0); //@line 2263
 if (___async) {
  HEAP32[$AsyncCtx17 >> 2] = 61; //@line 2266
  HEAP32[$AsyncCtx17 + 4 >> 2] = $18; //@line 2268
  HEAP8[$AsyncCtx17 + 8 >> 0] = $21 & 1; //@line 2271
  HEAP32[$AsyncCtx17 + 12 >> 2] = $23; //@line 2273
  HEAP32[$AsyncCtx17 + 16 >> 2] = $5; //@line 2275
  HEAP32[$AsyncCtx17 + 20 >> 2] = $5; //@line 2277
  sp = STACKTOP; //@line 2278
  STACKTOP = sp; //@line 2279
  return 0; //@line 2279
 }
 _emscripten_free_async_context($AsyncCtx17 | 0); //@line 2281
 $26 = HEAP32[$18 >> 2] | 0; //@line 2282
 do {
  if ($26 | 0) {
   $29 = HEAP32[$26 + 8 >> 2] | 0; //@line 2287
   $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 2288
   FUNCTION_TABLE_vi[$29 & 127]($23); //@line 2289
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 62; //@line 2292
    HEAP8[$AsyncCtx + 4 >> 0] = $21 & 1; //@line 2295
    HEAP32[$AsyncCtx + 8 >> 2] = $5; //@line 2297
    HEAP32[$AsyncCtx + 12 >> 2] = $5; //@line 2299
    sp = STACKTOP; //@line 2300
    STACKTOP = sp; //@line 2301
    return 0; //@line 2301
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 2303
    break;
   }
  }
 } while (0);
 do {
  if (!$21) {
   $34 = (HEAP32[$5 >> 2] | 0) + -1 | 0; //@line 2311
   HEAP32[$5 >> 2] = $34; //@line 2312
   if (!$34) {
    $37 = HEAP32[$5 + 24 >> 2] | 0; //@line 2316
    $AsyncCtx3 = _emscripten_alloc_async_context(8, sp) | 0; //@line 2317
    FUNCTION_TABLE_vi[$37 & 127]($5); //@line 2318
    if (___async) {
     HEAP32[$AsyncCtx3 >> 2] = 63; //@line 2321
     HEAP32[$AsyncCtx3 + 4 >> 2] = $5; //@line 2323
     sp = STACKTOP; //@line 2324
     STACKTOP = sp; //@line 2325
     return 0; //@line 2325
    }
    _emscripten_free_async_context($AsyncCtx3 | 0); //@line 2327
    $40 = HEAP32[$5 + 4 >> 2] | 0; //@line 2329
    $AsyncCtx13 = _emscripten_alloc_async_context(4, sp) | 0; //@line 2330
    _equeue_dealloc($40, $5); //@line 2331
    if (___async) {
     HEAP32[$AsyncCtx13 >> 2] = 64; //@line 2334
     sp = STACKTOP; //@line 2335
     STACKTOP = sp; //@line 2336
     return 0; //@line 2336
    } else {
     _emscripten_free_async_context($AsyncCtx13 | 0); //@line 2338
     break;
    }
   }
  }
 } while (0);
 $AsyncCtx6 = _emscripten_alloc_async_context(4, sp) | 0; //@line 2344
 __ZN6events10EventQueue8dispatchEi(4388, -1); //@line 2345
 if (___async) {
  HEAP32[$AsyncCtx6 >> 2] = 65; //@line 2348
  sp = STACKTOP; //@line 2349
  STACKTOP = sp; //@line 2350
  return 0; //@line 2350
 } else {
  _emscripten_free_async_context($AsyncCtx6 | 0); //@line 2352
  STACKTOP = sp; //@line 2353
  return 0; //@line 2353
 }
 return 0; //@line 2355
}
function __ZN4mbed11InterruptIn4fallENS_8CallbackIFvvEEE($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$phi$trans$insert = 0, $$pre = 0, $$pre$i$i4 = 0, $$pre10 = 0, $12 = 0, $2 = 0, $20 = 0, $21 = 0, $25 = 0, $27 = 0, $29 = 0, $3 = 0, $30 = 0, $33 = 0, $4 = 0, $41 = 0, $49 = 0, $6 = 0, $8 = 0, $9 = 0, $AsyncCtx = 0, $AsyncCtx11 = 0, $AsyncCtx2 = 0, $AsyncCtx5 = 0, $AsyncCtx8 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 235
 STACKTOP = STACKTOP + 16 | 0; //@line 236
 $2 = sp; //@line 237
 $3 = $1 + 12 | 0; //@line 238
 $4 = HEAP32[$3 >> 2] | 0; //@line 239
 if ($4 | 0) {
  $6 = $0 + 56 | 0; //@line 242
  if (($6 | 0) != ($1 | 0)) {
   $8 = $0 + 68 | 0; //@line 245
   $9 = HEAP32[$8 >> 2] | 0; //@line 246
   do {
    if (!$9) {
     $20 = $4; //@line 250
     label = 7; //@line 251
    } else {
     $12 = HEAP32[$9 + 8 >> 2] | 0; //@line 254
     $AsyncCtx = _emscripten_alloc_async_context(24, sp) | 0; //@line 255
     FUNCTION_TABLE_vi[$12 & 127]($6); //@line 256
     if (___async) {
      HEAP32[$AsyncCtx >> 2] = 17; //@line 259
      HEAP32[$AsyncCtx + 4 >> 2] = $3; //@line 261
      HEAP32[$AsyncCtx + 8 >> 2] = $8; //@line 263
      HEAP32[$AsyncCtx + 12 >> 2] = $6; //@line 265
      HEAP32[$AsyncCtx + 16 >> 2] = $1; //@line 267
      HEAP32[$AsyncCtx + 20 >> 2] = $0; //@line 269
      sp = STACKTOP; //@line 270
      STACKTOP = sp; //@line 271
      return;
     } else {
      _emscripten_free_async_context($AsyncCtx | 0); //@line 273
      $$pre = HEAP32[$3 >> 2] | 0; //@line 274
      if (!$$pre) {
       $25 = 0; //@line 277
       break;
      } else {
       $20 = $$pre; //@line 280
       label = 7; //@line 281
       break;
      }
     }
    }
   } while (0);
   do {
    if ((label | 0) == 7) {
     $21 = HEAP32[$20 + 4 >> 2] | 0; //@line 290
     $AsyncCtx2 = _emscripten_alloc_async_context(16, sp) | 0; //@line 291
     FUNCTION_TABLE_vii[$21 & 3]($6, $1); //@line 292
     if (___async) {
      HEAP32[$AsyncCtx2 >> 2] = 18; //@line 295
      HEAP32[$AsyncCtx2 + 4 >> 2] = $3; //@line 297
      HEAP32[$AsyncCtx2 + 8 >> 2] = $8; //@line 299
      HEAP32[$AsyncCtx2 + 12 >> 2] = $0; //@line 301
      sp = STACKTOP; //@line 302
      STACKTOP = sp; //@line 303
      return;
     } else {
      _emscripten_free_async_context($AsyncCtx2 | 0); //@line 305
      $25 = HEAP32[$3 >> 2] | 0; //@line 307
      break;
     }
    }
   } while (0);
   HEAP32[$8 >> 2] = $25; //@line 312
  }
  _gpio_irq_set($0 + 28 | 0, 2, 1); //@line 315
  STACKTOP = sp; //@line 316
  return;
 }
 HEAP32[$2 >> 2] = 0; //@line 318
 HEAP32[$2 + 4 >> 2] = 0; //@line 318
 HEAP32[$2 + 8 >> 2] = 0; //@line 318
 HEAP32[$2 + 12 >> 2] = 0; //@line 318
 $27 = $0 + 56 | 0; //@line 319
 do {
  if (($27 | 0) != ($2 | 0)) {
   $29 = $0 + 68 | 0; //@line 323
   $30 = HEAP32[$29 >> 2] | 0; //@line 324
   if ($30 | 0) {
    $33 = HEAP32[$30 + 8 >> 2] | 0; //@line 328
    $AsyncCtx5 = _emscripten_alloc_async_context(24, sp) | 0; //@line 329
    FUNCTION_TABLE_vi[$33 & 127]($27); //@line 330
    if (___async) {
     HEAP32[$AsyncCtx5 >> 2] = 19; //@line 333
     HEAP32[$AsyncCtx5 + 4 >> 2] = $2; //@line 335
     HEAP32[$AsyncCtx5 + 8 >> 2] = $29; //@line 337
     HEAP32[$AsyncCtx5 + 12 >> 2] = $27; //@line 339
     HEAP32[$AsyncCtx5 + 16 >> 2] = $2; //@line 341
     HEAP32[$AsyncCtx5 + 20 >> 2] = $0; //@line 343
     sp = STACKTOP; //@line 344
     STACKTOP = sp; //@line 345
     return;
    }
    _emscripten_free_async_context($AsyncCtx5 | 0); //@line 347
    $$phi$trans$insert = $2 + 12 | 0; //@line 348
    $$pre10 = HEAP32[$$phi$trans$insert >> 2] | 0; //@line 349
    if ($$pre10 | 0) {
     $41 = HEAP32[$$pre10 + 4 >> 2] | 0; //@line 353
     $AsyncCtx8 = _emscripten_alloc_async_context(20, sp) | 0; //@line 354
     FUNCTION_TABLE_vii[$41 & 3]($27, $2); //@line 355
     if (___async) {
      HEAP32[$AsyncCtx8 >> 2] = 20; //@line 358
      HEAP32[$AsyncCtx8 + 4 >> 2] = $$phi$trans$insert; //@line 360
      HEAP32[$AsyncCtx8 + 8 >> 2] = $29; //@line 362
      HEAP32[$AsyncCtx8 + 12 >> 2] = $2; //@line 364
      HEAP32[$AsyncCtx8 + 16 >> 2] = $0; //@line 366
      sp = STACKTOP; //@line 367
      STACKTOP = sp; //@line 368
      return;
     }
     _emscripten_free_async_context($AsyncCtx8 | 0); //@line 370
     $$pre$i$i4 = HEAP32[$$phi$trans$insert >> 2] | 0; //@line 371
     HEAP32[$29 >> 2] = $$pre$i$i4; //@line 372
     if (!$$pre$i$i4) {
      break;
     }
     $49 = HEAP32[$$pre$i$i4 + 8 >> 2] | 0; //@line 379
     $AsyncCtx11 = _emscripten_alloc_async_context(12, sp) | 0; //@line 380
     FUNCTION_TABLE_vi[$49 & 127]($2); //@line 381
     if (___async) {
      HEAP32[$AsyncCtx11 >> 2] = 21; //@line 384
      HEAP32[$AsyncCtx11 + 4 >> 2] = $2; //@line 386
      HEAP32[$AsyncCtx11 + 8 >> 2] = $0; //@line 388
      sp = STACKTOP; //@line 389
      STACKTOP = sp; //@line 390
      return;
     } else {
      _emscripten_free_async_context($AsyncCtx11 | 0); //@line 392
      break;
     }
    }
   }
   HEAP32[$29 >> 2] = 0; //@line 397
  }
 } while (0);
 _gpio_irq_set($0 + 28 | 0, 2, 0); //@line 401
 STACKTOP = sp; //@line 402
 return;
}
function __ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_38($0) {
 $0 = $0 | 0;
 var $$085$off0$reg2mem$0 = 0, $$182$off0 = 0, $$186$off0 = 0, $$283$off0 = 0, $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $2 = 0, $20 = 0, $22 = 0, $24 = 0, $26 = 0, $28 = 0, $30 = 0, $4 = 0, $59 = 0, $6 = 0, $67 = 0, $8 = 0, $ReallocAsyncCtx5 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 2120
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 2122
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 2124
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 2126
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 2128
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 2130
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 2132
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 2134
 $16 = HEAP8[$0 + 32 >> 0] & 1; //@line 2137
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 2139
 $20 = HEAP32[$0 + 40 >> 2] | 0; //@line 2141
 $22 = HEAP32[$0 + 44 >> 2] | 0; //@line 2143
 $24 = HEAP8[$0 + 48 >> 0] & 1; //@line 2146
 $26 = HEAP8[$0 + 49 >> 0] & 1; //@line 2149
 $28 = HEAP32[$0 + 52 >> 2] | 0; //@line 2151
 L2 : do {
  if (!(HEAP8[$2 >> 0] | 0)) {
   do {
    if (!(HEAP8[$10 >> 0] | 0)) {
     $$182$off0 = $24; //@line 2160
     $$186$off0 = $26; //@line 2160
    } else {
     if (!(HEAP8[$8 >> 0] | 0)) {
      if (!(HEAP32[$20 >> 2] & 1)) {
       $$085$off0$reg2mem$0 = $26; //@line 2169
       $$283$off0 = 1; //@line 2169
       label = 13; //@line 2170
       break L2;
      } else {
       $$182$off0 = 1; //@line 2173
       $$186$off0 = $26; //@line 2173
       break;
      }
     }
     if ((HEAP32[$4 >> 2] | 0) == 1) {
      label = 18; //@line 2180
      break L2;
     }
     if (!(HEAP32[$20 >> 2] & 2)) {
      label = 18; //@line 2187
      break L2;
     } else {
      $$182$off0 = 1; //@line 2190
      $$186$off0 = 1; //@line 2190
     }
    }
   } while (0);
   $30 = $28 + 8 | 0; //@line 2194
   if ($30 >>> 0 < $18 >>> 0) {
    HEAP8[$8 >> 0] = 0; //@line 2197
    HEAP8[$10 >> 0] = 0; //@line 2198
    $ReallocAsyncCtx5 = _emscripten_realloc_async_context(56) | 0; //@line 2199
    __ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($30, $12, $14, $14, 1, $16); //@line 2200
    if (!___async) {
     ___async_unwind = 0; //@line 2203
    }
    HEAP32[$ReallocAsyncCtx5 >> 2] = 97; //@line 2205
    HEAP32[$ReallocAsyncCtx5 + 4 >> 2] = $2; //@line 2207
    HEAP32[$ReallocAsyncCtx5 + 8 >> 2] = $4; //@line 2209
    HEAP32[$ReallocAsyncCtx5 + 12 >> 2] = $6; //@line 2211
    HEAP32[$ReallocAsyncCtx5 + 16 >> 2] = $8; //@line 2213
    HEAP32[$ReallocAsyncCtx5 + 20 >> 2] = $10; //@line 2215
    HEAP32[$ReallocAsyncCtx5 + 24 >> 2] = $12; //@line 2217
    HEAP32[$ReallocAsyncCtx5 + 28 >> 2] = $14; //@line 2219
    HEAP8[$ReallocAsyncCtx5 + 32 >> 0] = $16 & 1; //@line 2222
    HEAP32[$ReallocAsyncCtx5 + 36 >> 2] = $18; //@line 2224
    HEAP32[$ReallocAsyncCtx5 + 40 >> 2] = $20; //@line 2226
    HEAP32[$ReallocAsyncCtx5 + 44 >> 2] = $22; //@line 2228
    HEAP8[$ReallocAsyncCtx5 + 48 >> 0] = $$182$off0 & 1; //@line 2231
    HEAP8[$ReallocAsyncCtx5 + 49 >> 0] = $$186$off0 & 1; //@line 2234
    HEAP32[$ReallocAsyncCtx5 + 52 >> 2] = $30; //@line 2236
    sp = STACKTOP; //@line 2237
    return;
   } else {
    $$085$off0$reg2mem$0 = $$186$off0; //@line 2240
    $$283$off0 = $$182$off0; //@line 2240
    label = 13; //@line 2241
   }
  } else {
   $$085$off0$reg2mem$0 = $26; //@line 2244
   $$283$off0 = $24; //@line 2244
   label = 13; //@line 2245
  }
 } while (0);
 do {
  if ((label | 0) == 13) {
   if (!$$085$off0$reg2mem$0) {
    HEAP32[$22 >> 2] = $14; //@line 2251
    $59 = $12 + 40 | 0; //@line 2252
    HEAP32[$59 >> 2] = (HEAP32[$59 >> 2] | 0) + 1; //@line 2255
    if ((HEAP32[$12 + 36 >> 2] | 0) == 1) {
     if ((HEAP32[$4 >> 2] | 0) == 2) {
      HEAP8[$2 >> 0] = 1; //@line 2263
      if ($$283$off0) {
       label = 18; //@line 2265
       break;
      } else {
       $67 = 4; //@line 2268
       break;
      }
     }
    }
   }
   if ($$283$off0) {
    label = 18; //@line 2275
   } else {
    $67 = 4; //@line 2277
   }
  }
 } while (0);
 if ((label | 0) == 18) {
  $67 = 3; //@line 2282
 }
 HEAP32[$6 >> 2] = $67; //@line 2284
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
 sp = STACKTOP; //@line 10471
 if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, $5) | 0) {
  __ZNK10__cxxabiv117__class_type_info29process_static_type_above_dstEPNS_19__dynamic_cast_infoEPKvS4_i(0, $1, $2, $3, $4); //@line 10476
 } else {
  $9 = $1 + 52 | 0; //@line 10478
  $10 = HEAP8[$9 >> 0] | 0; //@line 10479
  $11 = $1 + 53 | 0; //@line 10480
  $12 = HEAP8[$11 >> 0] | 0; //@line 10481
  $15 = HEAP32[$0 + 12 >> 2] | 0; //@line 10484
  $16 = $0 + 16 + ($15 << 3) | 0; //@line 10485
  HEAP8[$9 >> 0] = 0; //@line 10486
  HEAP8[$11 >> 0] = 0; //@line 10487
  $AsyncCtx3 = _emscripten_alloc_async_context(52, sp) | 0; //@line 10488
  __ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($0 + 16 | 0, $1, $2, $3, $4, $5); //@line 10489
  if (___async) {
   HEAP32[$AsyncCtx3 >> 2] = 95; //@line 10492
   HEAP32[$AsyncCtx3 + 4 >> 2] = $15; //@line 10494
   HEAP32[$AsyncCtx3 + 8 >> 2] = $0; //@line 10496
   HEAP32[$AsyncCtx3 + 12 >> 2] = $1; //@line 10498
   HEAP8[$AsyncCtx3 + 16 >> 0] = $10; //@line 10500
   HEAP32[$AsyncCtx3 + 20 >> 2] = $9; //@line 10502
   HEAP8[$AsyncCtx3 + 24 >> 0] = $12; //@line 10504
   HEAP32[$AsyncCtx3 + 28 >> 2] = $11; //@line 10506
   HEAP32[$AsyncCtx3 + 32 >> 2] = $2; //@line 10508
   HEAP32[$AsyncCtx3 + 36 >> 2] = $3; //@line 10510
   HEAP32[$AsyncCtx3 + 40 >> 2] = $4; //@line 10512
   HEAP8[$AsyncCtx3 + 44 >> 0] = $5 & 1; //@line 10515
   HEAP32[$AsyncCtx3 + 48 >> 2] = $16; //@line 10517
   sp = STACKTOP; //@line 10518
   return;
  }
  _emscripten_free_async_context($AsyncCtx3 | 0); //@line 10521
  L7 : do {
   if (($15 | 0) > 1) {
    $31 = $1 + 24 | 0; //@line 10526
    $32 = $0 + 8 | 0; //@line 10527
    $33 = $1 + 54 | 0; //@line 10528
    $$0 = $0 + 24 | 0; //@line 10529
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
     HEAP8[$9 >> 0] = 0; //@line 10562
     HEAP8[$11 >> 0] = 0; //@line 10563
     $AsyncCtx = _emscripten_alloc_async_context(60, sp) | 0; //@line 10564
     __ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($$0, $1, $2, $3, $4, $5); //@line 10565
     if (___async) {
      break;
     }
     _emscripten_free_async_context($AsyncCtx | 0); //@line 10570
     $62 = $$0 + 8 | 0; //@line 10571
     if ($62 >>> 0 < $16 >>> 0) {
      $$0 = $62; //@line 10574
     } else {
      break L7;
     }
    }
    HEAP32[$AsyncCtx >> 2] = 96; //@line 10579
    HEAP32[$AsyncCtx + 4 >> 2] = $$0; //@line 10581
    HEAP32[$AsyncCtx + 8 >> 2] = $16; //@line 10583
    HEAP32[$AsyncCtx + 12 >> 2] = $33; //@line 10585
    HEAP8[$AsyncCtx + 16 >> 0] = $10; //@line 10587
    HEAP32[$AsyncCtx + 20 >> 2] = $9; //@line 10589
    HEAP8[$AsyncCtx + 24 >> 0] = $12; //@line 10591
    HEAP32[$AsyncCtx + 28 >> 2] = $11; //@line 10593
    HEAP32[$AsyncCtx + 32 >> 2] = $31; //@line 10595
    HEAP32[$AsyncCtx + 36 >> 2] = $32; //@line 10597
    HEAP32[$AsyncCtx + 40 >> 2] = $1; //@line 10599
    HEAP32[$AsyncCtx + 44 >> 2] = $2; //@line 10601
    HEAP32[$AsyncCtx + 48 >> 2] = $3; //@line 10603
    HEAP32[$AsyncCtx + 52 >> 2] = $4; //@line 10605
    HEAP8[$AsyncCtx + 56 >> 0] = $5 & 1; //@line 10608
    sp = STACKTOP; //@line 10609
    return;
   }
  } while (0);
  HEAP8[$9 >> 0] = $10; //@line 10613
  HEAP8[$11 >> 0] = $12; //@line 10614
 }
 return;
}
function __ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_37($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $15 = 0, $18 = 0, $2 = 0, $21 = 0, $24 = 0, $36 = 0, $37 = 0, $38 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx = 0, $ReallocAsyncCtx2 = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 1964
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 1966
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 1968
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 1970
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 1972
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 1974
 $12 = HEAP8[$0 + 24 >> 0] & 1; //@line 1977
 $15 = $4 + 24 | 0; //@line 1980
 do {
  if ((HEAP32[$0 + 28 >> 2] | 0) > 1) {
   $18 = HEAP32[$4 + 8 >> 2] | 0; //@line 1985
   if (!($18 & 2)) {
    $21 = $2 + 36 | 0; //@line 1989
    if ((HEAP32[$21 >> 2] | 0) != 1) {
     if (!($18 & 1)) {
      $38 = $2 + 54 | 0; //@line 1996
      if (HEAP8[$38 >> 0] | 0) {
       break;
      }
      if ((HEAP32[$21 >> 2] | 0) == 1) {
       break;
      }
      $ReallocAsyncCtx = _emscripten_realloc_async_context(36) | 0; //@line 2007
      __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($15, $2, $8, $10, $12); //@line 2008
      if (!___async) {
       ___async_unwind = 0; //@line 2011
      }
      HEAP32[$ReallocAsyncCtx >> 2] = 101; //@line 2013
      HEAP32[$ReallocAsyncCtx + 4 >> 2] = $15; //@line 2015
      HEAP32[$ReallocAsyncCtx + 8 >> 2] = $6; //@line 2017
      HEAP32[$ReallocAsyncCtx + 12 >> 2] = $38; //@line 2019
      HEAP32[$ReallocAsyncCtx + 16 >> 2] = $21; //@line 2021
      HEAP32[$ReallocAsyncCtx + 20 >> 2] = $2; //@line 2023
      HEAP32[$ReallocAsyncCtx + 24 >> 2] = $8; //@line 2025
      HEAP32[$ReallocAsyncCtx + 28 >> 2] = $10; //@line 2027
      HEAP8[$ReallocAsyncCtx + 32 >> 0] = $12 & 1; //@line 2030
      sp = STACKTOP; //@line 2031
      return;
     }
     $36 = $2 + 24 | 0; //@line 2034
     $37 = $2 + 54 | 0; //@line 2035
     if (HEAP8[$37 >> 0] | 0) {
      break;
     }
     if ((HEAP32[$21 >> 2] | 0) == 1) {
      if ((HEAP32[$36 >> 2] | 0) == 1) {
       break;
      }
     }
     $ReallocAsyncCtx2 = _emscripten_realloc_async_context(40) | 0; //@line 2050
     __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($15, $2, $8, $10, $12); //@line 2051
     if (!___async) {
      ___async_unwind = 0; //@line 2054
     }
     HEAP32[$ReallocAsyncCtx2 >> 2] = 100; //@line 2056
     HEAP32[$ReallocAsyncCtx2 + 4 >> 2] = $15; //@line 2058
     HEAP32[$ReallocAsyncCtx2 + 8 >> 2] = $6; //@line 2060
     HEAP32[$ReallocAsyncCtx2 + 12 >> 2] = $37; //@line 2062
     HEAP32[$ReallocAsyncCtx2 + 16 >> 2] = $21; //@line 2064
     HEAP32[$ReallocAsyncCtx2 + 20 >> 2] = $36; //@line 2066
     HEAP32[$ReallocAsyncCtx2 + 24 >> 2] = $2; //@line 2068
     HEAP32[$ReallocAsyncCtx2 + 28 >> 2] = $8; //@line 2070
     HEAP32[$ReallocAsyncCtx2 + 32 >> 2] = $10; //@line 2072
     HEAP8[$ReallocAsyncCtx2 + 36 >> 0] = $12 & 1; //@line 2075
     sp = STACKTOP; //@line 2076
     return;
    }
   }
   $24 = $2 + 54 | 0; //@line 2080
   if (!(HEAP8[$24 >> 0] | 0)) {
    $ReallocAsyncCtx3 = _emscripten_realloc_async_context(32) | 0; //@line 2084
    __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($15, $2, $8, $10, $12); //@line 2085
    if (!___async) {
     ___async_unwind = 0; //@line 2088
    }
    HEAP32[$ReallocAsyncCtx3 >> 2] = 99; //@line 2090
    HEAP32[$ReallocAsyncCtx3 + 4 >> 2] = $15; //@line 2092
    HEAP32[$ReallocAsyncCtx3 + 8 >> 2] = $6; //@line 2094
    HEAP32[$ReallocAsyncCtx3 + 12 >> 2] = $24; //@line 2096
    HEAP32[$ReallocAsyncCtx3 + 16 >> 2] = $2; //@line 2098
    HEAP32[$ReallocAsyncCtx3 + 20 >> 2] = $8; //@line 2100
    HEAP32[$ReallocAsyncCtx3 + 24 >> 2] = $10; //@line 2102
    HEAP8[$ReallocAsyncCtx3 + 28 >> 0] = $12 & 1; //@line 2105
    sp = STACKTOP; //@line 2106
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
      $9 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 7688
      $10 = HEAP32[$9 >> 2] | 0; //@line 7689
      HEAP32[$2 >> 2] = $9 + 4; //@line 7691
      HEAP32[$0 >> 2] = $10; //@line 7692
      break L1;
      break;
     }
    case 10:
     {
      $16 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 7708
      $17 = HEAP32[$16 >> 2] | 0; //@line 7709
      HEAP32[$2 >> 2] = $16 + 4; //@line 7711
      $20 = $0; //@line 7714
      HEAP32[$20 >> 2] = $17; //@line 7716
      HEAP32[$20 + 4 >> 2] = (($17 | 0) < 0) << 31 >> 31; //@line 7719
      break L1;
      break;
     }
    case 11:
     {
      $29 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 7735
      $30 = HEAP32[$29 >> 2] | 0; //@line 7736
      HEAP32[$2 >> 2] = $29 + 4; //@line 7738
      $31 = $0; //@line 7739
      HEAP32[$31 >> 2] = $30; //@line 7741
      HEAP32[$31 + 4 >> 2] = 0; //@line 7744
      break L1;
      break;
     }
    case 12:
     {
      $40 = (HEAP32[$2 >> 2] | 0) + (8 - 1) & ~(8 - 1); //@line 7760
      $41 = $40; //@line 7761
      $43 = HEAP32[$41 >> 2] | 0; //@line 7763
      $46 = HEAP32[$41 + 4 >> 2] | 0; //@line 7766
      HEAP32[$2 >> 2] = $40 + 8; //@line 7768
      $47 = $0; //@line 7769
      HEAP32[$47 >> 2] = $43; //@line 7771
      HEAP32[$47 + 4 >> 2] = $46; //@line 7774
      break L1;
      break;
     }
    case 13:
     {
      $56 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 7790
      $57 = HEAP32[$56 >> 2] | 0; //@line 7791
      HEAP32[$2 >> 2] = $56 + 4; //@line 7793
      $59 = ($57 & 65535) << 16 >> 16; //@line 7795
      $62 = $0; //@line 7798
      HEAP32[$62 >> 2] = $59; //@line 7800
      HEAP32[$62 + 4 >> 2] = (($59 | 0) < 0) << 31 >> 31; //@line 7803
      break L1;
      break;
     }
    case 14:
     {
      $71 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 7819
      $72 = HEAP32[$71 >> 2] | 0; //@line 7820
      HEAP32[$2 >> 2] = $71 + 4; //@line 7822
      $73 = $0; //@line 7824
      HEAP32[$73 >> 2] = $72 & 65535; //@line 7826
      HEAP32[$73 + 4 >> 2] = 0; //@line 7829
      break L1;
      break;
     }
    case 15:
     {
      $82 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 7845
      $83 = HEAP32[$82 >> 2] | 0; //@line 7846
      HEAP32[$2 >> 2] = $82 + 4; //@line 7848
      $85 = ($83 & 255) << 24 >> 24; //@line 7850
      $88 = $0; //@line 7853
      HEAP32[$88 >> 2] = $85; //@line 7855
      HEAP32[$88 + 4 >> 2] = (($85 | 0) < 0) << 31 >> 31; //@line 7858
      break L1;
      break;
     }
    case 16:
     {
      $97 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 7874
      $98 = HEAP32[$97 >> 2] | 0; //@line 7875
      HEAP32[$2 >> 2] = $97 + 4; //@line 7877
      $99 = $0; //@line 7879
      HEAP32[$99 >> 2] = $98 & 255; //@line 7881
      HEAP32[$99 + 4 >> 2] = 0; //@line 7884
      break L1;
      break;
     }
    case 17:
     {
      $108 = (HEAP32[$2 >> 2] | 0) + (8 - 1) & ~(8 - 1); //@line 7900
      $109 = +HEAPF64[$108 >> 3]; //@line 7901
      HEAP32[$2 >> 2] = $108 + 8; //@line 7903
      HEAPF64[$0 >> 3] = $109; //@line 7904
      break L1;
      break;
     }
    case 18:
     {
      $115 = (HEAP32[$2 >> 2] | 0) + (8 - 1) & ~(8 - 1); //@line 7920
      $116 = +HEAPF64[$115 >> 3]; //@line 7921
      HEAP32[$2 >> 2] = $115 + 8; //@line 7923
      HEAPF64[$0 >> 3] = $116; //@line 7924
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
 sp = STACKTOP; //@line 6588
 STACKTOP = STACKTOP + 224 | 0; //@line 6589
 $3 = sp + 120 | 0; //@line 6590
 $4 = sp + 80 | 0; //@line 6591
 $5 = sp; //@line 6592
 $6 = sp + 136 | 0; //@line 6593
 dest = $4; //@line 6594
 stop = dest + 40 | 0; //@line 6594
 do {
  HEAP32[dest >> 2] = 0; //@line 6594
  dest = dest + 4 | 0; //@line 6594
 } while ((dest | 0) < (stop | 0));
 HEAP32[$3 >> 2] = HEAP32[$2 >> 2]; //@line 6596
 if ((_printf_core(0, $1, $3, $5, $4) | 0) < 0) {
  $$0 = -1; //@line 6600
 } else {
  if ((HEAP32[$0 + 76 >> 2] | 0) > -1) {
   $43 = ___lockfile($0) | 0; //@line 6607
  } else {
   $43 = 0; //@line 6609
  }
  $13 = HEAP32[$0 >> 2] | 0; //@line 6611
  $14 = $13 & 32; //@line 6612
  if ((HEAP8[$0 + 74 >> 0] | 0) < 1) {
   HEAP32[$0 >> 2] = $13 & -33; //@line 6618
  }
  $19 = $0 + 48 | 0; //@line 6620
  do {
   if (!(HEAP32[$19 >> 2] | 0)) {
    $23 = $0 + 44 | 0; //@line 6625
    $24 = HEAP32[$23 >> 2] | 0; //@line 6626
    HEAP32[$23 >> 2] = $6; //@line 6627
    $25 = $0 + 28 | 0; //@line 6628
    HEAP32[$25 >> 2] = $6; //@line 6629
    $26 = $0 + 20 | 0; //@line 6630
    HEAP32[$26 >> 2] = $6; //@line 6631
    HEAP32[$19 >> 2] = 80; //@line 6632
    $28 = $0 + 16 | 0; //@line 6634
    HEAP32[$28 >> 2] = $6 + 80; //@line 6635
    $29 = _printf_core($0, $1, $3, $5, $4) | 0; //@line 6636
    if (!$24) {
     $$1 = $29; //@line 6639
    } else {
     $32 = HEAP32[$0 + 36 >> 2] | 0; //@line 6642
     $AsyncCtx = _emscripten_alloc_async_context(64, sp) | 0; //@line 6643
     FUNCTION_TABLE_iiii[$32 & 7]($0, 0, 0) | 0; //@line 6644
     if (___async) {
      HEAP32[$AsyncCtx >> 2] = 77; //@line 6647
      HEAP32[$AsyncCtx + 4 >> 2] = $26; //@line 6649
      HEAP32[$AsyncCtx + 8 >> 2] = $29; //@line 6651
      HEAP32[$AsyncCtx + 12 >> 2] = $24; //@line 6653
      HEAP32[$AsyncCtx + 16 >> 2] = $23; //@line 6655
      HEAP32[$AsyncCtx + 20 >> 2] = $19; //@line 6657
      HEAP32[$AsyncCtx + 24 >> 2] = $28; //@line 6659
      HEAP32[$AsyncCtx + 28 >> 2] = $25; //@line 6661
      HEAP32[$AsyncCtx + 32 >> 2] = $0; //@line 6663
      HEAP32[$AsyncCtx + 36 >> 2] = $14; //@line 6665
      HEAP32[$AsyncCtx + 40 >> 2] = $43; //@line 6667
      HEAP32[$AsyncCtx + 44 >> 2] = $0; //@line 6669
      HEAP32[$AsyncCtx + 48 >> 2] = $6; //@line 6671
      HEAP32[$AsyncCtx + 52 >> 2] = $5; //@line 6673
      HEAP32[$AsyncCtx + 56 >> 2] = $4; //@line 6675
      HEAP32[$AsyncCtx + 60 >> 2] = $3; //@line 6677
      sp = STACKTOP; //@line 6678
      STACKTOP = sp; //@line 6679
      return 0; //@line 6679
     } else {
      _emscripten_free_async_context($AsyncCtx | 0); //@line 6681
      $$ = (HEAP32[$26 >> 2] | 0) == 0 ? -1 : $29; //@line 6684
      HEAP32[$23 >> 2] = $24; //@line 6685
      HEAP32[$19 >> 2] = 0; //@line 6686
      HEAP32[$28 >> 2] = 0; //@line 6687
      HEAP32[$25 >> 2] = 0; //@line 6688
      HEAP32[$26 >> 2] = 0; //@line 6689
      $$1 = $$; //@line 6690
      break;
     }
    }
   } else {
    $$1 = _printf_core($0, $1, $3, $5, $4) | 0; //@line 6696
   }
  } while (0);
  $51 = HEAP32[$0 >> 2] | 0; //@line 6699
  HEAP32[$0 >> 2] = $51 | $14; //@line 6704
  if ($43 | 0) {
   ___unlockfile($0); //@line 6707
  }
  $$0 = ($51 & 32 | 0) == 0 ? $$1 : -1; //@line 6709
 }
 STACKTOP = sp; //@line 6711
 return $$0 | 0; //@line 6711
}
function ___dynamic_cast($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $$0 = 0, $10 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $24 = 0, $30 = 0, $33 = 0, $4 = 0, $5 = 0, $8 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, dest = 0, sp = 0, stop = 0;
 sp = STACKTOP; //@line 10006
 STACKTOP = STACKTOP + 64 | 0; //@line 10007
 $4 = sp; //@line 10008
 $5 = HEAP32[$0 >> 2] | 0; //@line 10009
 $8 = $0 + (HEAP32[$5 + -8 >> 2] | 0) | 0; //@line 10012
 $10 = HEAP32[$5 + -4 >> 2] | 0; //@line 10014
 HEAP32[$4 >> 2] = $2; //@line 10015
 HEAP32[$4 + 4 >> 2] = $0; //@line 10017
 HEAP32[$4 + 8 >> 2] = $1; //@line 10019
 HEAP32[$4 + 12 >> 2] = $3; //@line 10021
 $14 = $4 + 16 | 0; //@line 10022
 $15 = $4 + 20 | 0; //@line 10023
 $16 = $4 + 24 | 0; //@line 10024
 $17 = $4 + 28 | 0; //@line 10025
 $18 = $4 + 32 | 0; //@line 10026
 $19 = $4 + 40 | 0; //@line 10027
 dest = $14; //@line 10028
 stop = dest + 36 | 0; //@line 10028
 do {
  HEAP32[dest >> 2] = 0; //@line 10028
  dest = dest + 4 | 0; //@line 10028
 } while ((dest | 0) < (stop | 0));
 HEAP16[$14 + 36 >> 1] = 0; //@line 10028
 HEAP8[$14 + 38 >> 0] = 0; //@line 10028
 L1 : do {
  if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($10, $2, 0) | 0) {
   HEAP32[$4 + 48 >> 2] = 1; //@line 10033
   $24 = HEAP32[(HEAP32[$10 >> 2] | 0) + 20 >> 2] | 0; //@line 10036
   $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 10037
   FUNCTION_TABLE_viiiiii[$24 & 3]($10, $4, $8, $8, 1, 0); //@line 10038
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 87; //@line 10041
    HEAP32[$AsyncCtx + 4 >> 2] = $16; //@line 10043
    HEAP32[$AsyncCtx + 8 >> 2] = $8; //@line 10045
    HEAP32[$AsyncCtx + 12 >> 2] = $4; //@line 10047
    sp = STACKTOP; //@line 10048
    STACKTOP = sp; //@line 10049
    return 0; //@line 10049
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 10051
    $$0 = (HEAP32[$16 >> 2] | 0) == 1 ? $8 : 0; //@line 10055
    break;
   }
  } else {
   $30 = $4 + 36 | 0; //@line 10059
   $33 = HEAP32[(HEAP32[$10 >> 2] | 0) + 24 >> 2] | 0; //@line 10062
   $AsyncCtx3 = _emscripten_alloc_async_context(36, sp) | 0; //@line 10063
   FUNCTION_TABLE_viiiii[$33 & 3]($10, $4, $8, 1, 0); //@line 10064
   if (___async) {
    HEAP32[$AsyncCtx3 >> 2] = 88; //@line 10067
    HEAP32[$AsyncCtx3 + 4 >> 2] = $30; //@line 10069
    HEAP32[$AsyncCtx3 + 8 >> 2] = $4; //@line 10071
    HEAP32[$AsyncCtx3 + 12 >> 2] = $19; //@line 10073
    HEAP32[$AsyncCtx3 + 16 >> 2] = $17; //@line 10075
    HEAP32[$AsyncCtx3 + 20 >> 2] = $18; //@line 10077
    HEAP32[$AsyncCtx3 + 24 >> 2] = $15; //@line 10079
    HEAP32[$AsyncCtx3 + 28 >> 2] = $16; //@line 10081
    HEAP32[$AsyncCtx3 + 32 >> 2] = $14; //@line 10083
    sp = STACKTOP; //@line 10084
    STACKTOP = sp; //@line 10085
    return 0; //@line 10085
   }
   _emscripten_free_async_context($AsyncCtx3 | 0); //@line 10087
   switch (HEAP32[$30 >> 2] | 0) {
   case 0:
    {
     $$0 = (HEAP32[$19 >> 2] | 0) == 1 & (HEAP32[$17 >> 2] | 0) == 1 & (HEAP32[$18 >> 2] | 0) == 1 ? HEAP32[$15 >> 2] | 0 : 0; //@line 10101
     break L1;
     break;
    }
   case 1:
    {
     break;
    }
   default:
    {
     $$0 = 0; //@line 10109
     break L1;
    }
   }
   if ((HEAP32[$16 >> 2] | 0) != 1) {
    if (!((HEAP32[$19 >> 2] | 0) == 0 & (HEAP32[$17 >> 2] | 0) == 1 & (HEAP32[$18 >> 2] | 0) == 1)) {
     $$0 = 0; //@line 10125
     break;
    }
   }
   $$0 = HEAP32[$14 >> 2] | 0; //@line 10130
  }
 } while (0);
 STACKTOP = sp; //@line 10133
 return $$0 | 0; //@line 10133
}
function _memchr($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$0$lcssa = 0, $$035$lcssa = 0, $$035$lcssa65 = 0, $$03555 = 0, $$036$lcssa = 0, $$036$lcssa64 = 0, $$03654 = 0, $$046 = 0, $$137$lcssa = 0, $$13745 = 0, $$140 = 0, $$2 = 0, $$23839 = 0, $$3 = 0, $$lcssa = 0, $11 = 0, $12 = 0, $16 = 0, $18 = 0, $20 = 0, $23 = 0, $29 = 0, $3 = 0, $30 = 0, $35 = 0, $7 = 0, $8 = 0, label = 0;
 $3 = $1 & 255; //@line 6460
 $7 = ($2 | 0) != 0; //@line 6464
 L1 : do {
  if ($7 & ($0 & 3 | 0) != 0) {
   $8 = $1 & 255; //@line 6468
   $$03555 = $0; //@line 6469
   $$03654 = $2; //@line 6469
   while (1) {
    if ((HEAP8[$$03555 >> 0] | 0) == $8 << 24 >> 24) {
     $$035$lcssa65 = $$03555; //@line 6474
     $$036$lcssa64 = $$03654; //@line 6474
     label = 6; //@line 6475
     break L1;
    }
    $11 = $$03555 + 1 | 0; //@line 6478
    $12 = $$03654 + -1 | 0; //@line 6479
    $16 = ($12 | 0) != 0; //@line 6483
    if ($16 & ($11 & 3 | 0) != 0) {
     $$03555 = $11; //@line 6486
     $$03654 = $12; //@line 6486
    } else {
     $$035$lcssa = $11; //@line 6488
     $$036$lcssa = $12; //@line 6488
     $$lcssa = $16; //@line 6488
     label = 5; //@line 6489
     break;
    }
   }
  } else {
   $$035$lcssa = $0; //@line 6494
   $$036$lcssa = $2; //@line 6494
   $$lcssa = $7; //@line 6494
   label = 5; //@line 6495
  }
 } while (0);
 if ((label | 0) == 5) {
  if ($$lcssa) {
   $$035$lcssa65 = $$035$lcssa; //@line 6500
   $$036$lcssa64 = $$036$lcssa; //@line 6500
   label = 6; //@line 6501
  } else {
   $$2 = $$035$lcssa; //@line 6503
   $$3 = 0; //@line 6503
  }
 }
 L8 : do {
  if ((label | 0) == 6) {
   $18 = $1 & 255; //@line 6509
   if ((HEAP8[$$035$lcssa65 >> 0] | 0) == $18 << 24 >> 24) {
    $$2 = $$035$lcssa65; //@line 6512
    $$3 = $$036$lcssa64; //@line 6512
   } else {
    $20 = Math_imul($3, 16843009) | 0; //@line 6514
    L11 : do {
     if ($$036$lcssa64 >>> 0 > 3) {
      $$046 = $$035$lcssa65; //@line 6518
      $$13745 = $$036$lcssa64; //@line 6518
      while (1) {
       $23 = HEAP32[$$046 >> 2] ^ $20; //@line 6521
       if (($23 & -2139062144 ^ -2139062144) & $23 + -16843009 | 0) {
        break;
       }
       $29 = $$046 + 4 | 0; //@line 6530
       $30 = $$13745 + -4 | 0; //@line 6531
       if ($30 >>> 0 > 3) {
        $$046 = $29; //@line 6534
        $$13745 = $30; //@line 6534
       } else {
        $$0$lcssa = $29; //@line 6536
        $$137$lcssa = $30; //@line 6536
        label = 11; //@line 6537
        break L11;
       }
      }
      $$140 = $$046; //@line 6541
      $$23839 = $$13745; //@line 6541
     } else {
      $$0$lcssa = $$035$lcssa65; //@line 6543
      $$137$lcssa = $$036$lcssa64; //@line 6543
      label = 11; //@line 6544
     }
    } while (0);
    if ((label | 0) == 11) {
     if (!$$137$lcssa) {
      $$2 = $$0$lcssa; //@line 6550
      $$3 = 0; //@line 6550
      break;
     } else {
      $$140 = $$0$lcssa; //@line 6553
      $$23839 = $$137$lcssa; //@line 6553
     }
    }
    while (1) {
     if ((HEAP8[$$140 >> 0] | 0) == $18 << 24 >> 24) {
      $$2 = $$140; //@line 6560
      $$3 = $$23839; //@line 6560
      break L8;
     }
     $35 = $$140 + 1 | 0; //@line 6563
     $$23839 = $$23839 + -1 | 0; //@line 6564
     if (!$$23839) {
      $$2 = $35; //@line 6567
      $$3 = 0; //@line 6567
      break;
     } else {
      $$140 = $35; //@line 6570
     }
    }
   }
  }
 } while (0);
 return ($$3 | 0 ? $$2 : 0) | 0; //@line 6578
}
function __ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($0, $1, $2, $3, $4) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 var $$037$off038 = 0, $$037$off039 = 0, $13 = 0, $19 = 0, $22 = 0, $23 = 0, $25 = 0, $28 = 0, $39 = 0, $50 = 0, $53 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 10188
 do {
  if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, $4) | 0) {
   __ZNK10__cxxabiv117__class_type_info29process_static_type_below_dstEPNS_19__dynamic_cast_infoEPKvi(0, $1, $2, $3); //@line 10194
  } else {
   if (!(__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 >> 2] | 0, $4) | 0)) {
    $50 = HEAP32[$0 + 8 >> 2] | 0; //@line 10200
    $53 = HEAP32[(HEAP32[$50 >> 2] | 0) + 24 >> 2] | 0; //@line 10203
    $AsyncCtx3 = _emscripten_alloc_async_context(4, sp) | 0; //@line 10204
    FUNCTION_TABLE_viiiii[$53 & 3]($50, $1, $2, $3, $4); //@line 10205
    if (___async) {
     HEAP32[$AsyncCtx3 >> 2] = 91; //@line 10208
     sp = STACKTOP; //@line 10209
     return;
    } else {
     _emscripten_free_async_context($AsyncCtx3 | 0); //@line 10212
     break;
    }
   }
   if ((HEAP32[$1 + 16 >> 2] | 0) != ($2 | 0)) {
    $13 = $1 + 20 | 0; //@line 10220
    if ((HEAP32[$13 >> 2] | 0) != ($2 | 0)) {
     HEAP32[$1 + 32 >> 2] = $3; //@line 10225
     $19 = $1 + 44 | 0; //@line 10226
     if ((HEAP32[$19 >> 2] | 0) == 4) {
      break;
     }
     $22 = $1 + 52 | 0; //@line 10232
     HEAP8[$22 >> 0] = 0; //@line 10233
     $23 = $1 + 53 | 0; //@line 10234
     HEAP8[$23 >> 0] = 0; //@line 10235
     $25 = HEAP32[$0 + 8 >> 2] | 0; //@line 10237
     $28 = HEAP32[(HEAP32[$25 >> 2] | 0) + 20 >> 2] | 0; //@line 10240
     $AsyncCtx = _emscripten_alloc_async_context(28, sp) | 0; //@line 10241
     FUNCTION_TABLE_viiiiii[$28 & 3]($25, $1, $2, $2, 1, $4); //@line 10242
     if (___async) {
      HEAP32[$AsyncCtx >> 2] = 90; //@line 10245
      HEAP32[$AsyncCtx + 4 >> 2] = $23; //@line 10247
      HEAP32[$AsyncCtx + 8 >> 2] = $2; //@line 10249
      HEAP32[$AsyncCtx + 12 >> 2] = $13; //@line 10251
      HEAP32[$AsyncCtx + 16 >> 2] = $1; //@line 10253
      HEAP32[$AsyncCtx + 20 >> 2] = $22; //@line 10255
      HEAP32[$AsyncCtx + 24 >> 2] = $19; //@line 10257
      sp = STACKTOP; //@line 10258
      return;
     }
     _emscripten_free_async_context($AsyncCtx | 0); //@line 10261
     if (!(HEAP8[$23 >> 0] | 0)) {
      $$037$off038 = 4; //@line 10265
      label = 13; //@line 10266
     } else {
      if (!(HEAP8[$22 >> 0] | 0)) {
       $$037$off038 = 3; //@line 10271
       label = 13; //@line 10272
      } else {
       $$037$off039 = 3; //@line 10274
      }
     }
     if ((label | 0) == 13) {
      HEAP32[$13 >> 2] = $2; //@line 10278
      $39 = $1 + 40 | 0; //@line 10279
      HEAP32[$39 >> 2] = (HEAP32[$39 >> 2] | 0) + 1; //@line 10282
      if ((HEAP32[$1 + 36 >> 2] | 0) == 1) {
       if ((HEAP32[$1 + 24 >> 2] | 0) == 2) {
        HEAP8[$1 + 54 >> 0] = 1; //@line 10292
        $$037$off039 = $$037$off038; //@line 10293
       } else {
        $$037$off039 = $$037$off038; //@line 10295
       }
      } else {
       $$037$off039 = $$037$off038; //@line 10298
      }
     }
     HEAP32[$19 >> 2] = $$037$off039; //@line 10301
     break;
    }
   }
   if (($3 | 0) == 1) {
    HEAP32[$1 + 32 >> 2] = 1; //@line 10308
   }
  }
 } while (0);
 return;
}
function _equeue_enqueue($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$051$ph = 0, $$05157 = 0, $$0515859 = 0, $$053 = 0, $13 = 0, $14 = 0, $16 = 0, $24 = 0, $25 = 0, $27 = 0, $29 = 0, $33 = 0, $34 = 0, $42 = 0, $43 = 0, $46 = 0, $47 = 0, $49 = 0, $54 = 0, $65 = 0, $67 = 0, $AsyncCtx = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 814
 $13 = $1 - (HEAP32[$0 + 12 >> 2] | 0) | HEAPU8[$1 + 4 >> 0] << HEAP32[$0 + 16 >> 2]; //@line 825
 $14 = $1 + 20 | 0; //@line 826
 $16 = (HEAP32[$14 >> 2] | 0) - $2 | 0; //@line 828
 HEAP32[$14 >> 2] = ($16 & ~($16 >> 31)) + $2; //@line 833
 HEAP8[$1 + 5 >> 0] = HEAP8[$0 + 9 >> 0] | 0; //@line 837
 $24 = $0 + 128 | 0; //@line 838
 _equeue_mutex_lock($24); //@line 839
 $25 = HEAP32[$0 >> 2] | 0; //@line 840
 L1 : do {
  if (!$25) {
   $$051$ph = $0; //@line 844
   label = 5; //@line 845
  } else {
   $27 = HEAP32[$14 >> 2] | 0; //@line 847
   $$053 = $0; //@line 848
   $29 = $25; //@line 848
   while (1) {
    if (((HEAP32[$29 + 20 >> 2] | 0) - $27 | 0) >= 0) {
     break;
    }
    $33 = $29 + 8 | 0; //@line 857
    $34 = HEAP32[$33 >> 2] | 0; //@line 858
    if (!$34) {
     $$051$ph = $33; //@line 861
     label = 5; //@line 862
     break L1;
    } else {
     $$053 = $33; //@line 865
     $29 = $34; //@line 865
    }
   }
   if ((HEAP32[$29 + 20 >> 2] | 0) != (HEAP32[$14 >> 2] | 0)) {
    $49 = $1 + 8 | 0; //@line 873
    HEAP32[$49 >> 2] = $29; //@line 874
    HEAP32[$29 + 16 >> 2] = $49; //@line 876
    $$0515859 = $$053; //@line 877
    label = 11; //@line 878
    break;
   }
   $42 = HEAP32[$29 + 8 >> 2] | 0; //@line 882
   $43 = $1 + 8 | 0; //@line 883
   HEAP32[$43 >> 2] = $42; //@line 884
   if ($42 | 0) {
    HEAP32[$42 + 16 >> 2] = $43; //@line 888
   }
   $46 = HEAP32[$$053 >> 2] | 0; //@line 890
   $47 = $1 + 12 | 0; //@line 891
   HEAP32[$47 >> 2] = $46; //@line 892
   HEAP32[$46 + 16 >> 2] = $47; //@line 894
   $$05157 = $$053; //@line 895
  }
 } while (0);
 if ((label | 0) == 5) {
  HEAP32[$1 + 8 >> 2] = 0; //@line 900
  $$0515859 = $$051$ph; //@line 901
  label = 11; //@line 902
 }
 if ((label | 0) == 11) {
  HEAP32[$1 + 12 >> 2] = 0; //@line 906
  $$05157 = $$0515859; //@line 907
 }
 HEAP32[$$05157 >> 2] = $1; //@line 909
 HEAP32[$1 + 16 >> 2] = $$05157; //@line 911
 $54 = HEAP32[$0 + 40 >> 2] | 0; //@line 913
 if (!$54) {
  _equeue_mutex_unlock($24); //@line 916
  return $13 | 0; //@line 917
 }
 if (!(HEAP8[$0 + 36 >> 0] | 0)) {
  _equeue_mutex_unlock($24); //@line 923
  return $13 | 0; //@line 924
 }
 if ((HEAP32[$0 >> 2] | 0) != ($1 | 0)) {
  _equeue_mutex_unlock($24); //@line 929
  return $13 | 0; //@line 930
 }
 if (HEAP32[$1 + 12 >> 2] | 0) {
  _equeue_mutex_unlock($24); //@line 936
  return $13 | 0; //@line 937
 }
 $65 = HEAP32[$0 + 44 >> 2] | 0; //@line 940
 $67 = (HEAP32[$14 >> 2] | 0) - $2 | 0; //@line 942
 $AsyncCtx = _emscripten_alloc_async_context(12, sp) | 0; //@line 946
 FUNCTION_TABLE_vii[$54 & 3]($65, $67 & ~($67 >> 31)); //@line 947
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 26; //@line 950
  HEAP32[$AsyncCtx + 4 >> 2] = $24; //@line 952
  HEAP32[$AsyncCtx + 8 >> 2] = $13; //@line 954
  sp = STACKTOP; //@line 955
  return 0; //@line 956
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 958
 _equeue_mutex_unlock($24); //@line 959
 return $13 | 0; //@line 960
}
function __ZL25default_terminate_handlerv() {
 var $0 = 0, $1 = 0, $12 = 0, $22 = 0, $23 = 0, $25 = 0, $28 = 0, $29 = 0, $3 = 0, $36 = 0, $39 = 0, $40 = 0, $7 = 0, $9 = 0, $AsyncCtx = 0, $AsyncCtx14 = 0, $vararg_buffer = 0, $vararg_buffer10 = 0, $vararg_buffer3 = 0, $vararg_buffer7 = 0, sp = 0;
 sp = STACKTOP; //@line 9500
 STACKTOP = STACKTOP + 48 | 0; //@line 9501
 $vararg_buffer10 = sp + 32 | 0; //@line 9502
 $vararg_buffer7 = sp + 24 | 0; //@line 9503
 $vararg_buffer3 = sp + 16 | 0; //@line 9504
 $vararg_buffer = sp; //@line 9505
 $0 = sp + 36 | 0; //@line 9506
 $1 = ___cxa_get_globals_fast() | 0; //@line 9507
 if ($1 | 0) {
  $3 = HEAP32[$1 >> 2] | 0; //@line 9510
  if ($3 | 0) {
   $7 = $3 + 48 | 0; //@line 9515
   $9 = HEAP32[$7 >> 2] | 0; //@line 9517
   $12 = HEAP32[$7 + 4 >> 2] | 0; //@line 9520
   if (!(($9 & -256 | 0) == 1126902528 & ($12 | 0) == 1129074247)) {
    HEAP32[$vararg_buffer7 >> 2] = 3941; //@line 9526
    _abort_message(3891, $vararg_buffer7); //@line 9527
   }
   if (($9 | 0) == 1126902529 & ($12 | 0) == 1129074247) {
    $22 = HEAP32[$3 + 44 >> 2] | 0; //@line 9536
   } else {
    $22 = $3 + 80 | 0; //@line 9538
   }
   HEAP32[$0 >> 2] = $22; //@line 9540
   $23 = HEAP32[$3 >> 2] | 0; //@line 9541
   $25 = HEAP32[$23 + 4 >> 2] | 0; //@line 9543
   $28 = HEAP32[(HEAP32[10] | 0) + 16 >> 2] | 0; //@line 9546
   $AsyncCtx = _emscripten_alloc_async_context(28, sp) | 0; //@line 9547
   $29 = FUNCTION_TABLE_iiii[$28 & 7](40, $23, $0) | 0; //@line 9548
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 81; //@line 9551
    HEAP32[$AsyncCtx + 4 >> 2] = $0; //@line 9553
    HEAP32[$AsyncCtx + 8 >> 2] = $vararg_buffer3; //@line 9555
    HEAP32[$AsyncCtx + 12 >> 2] = $25; //@line 9557
    HEAP32[$AsyncCtx + 16 >> 2] = $vararg_buffer3; //@line 9559
    HEAP32[$AsyncCtx + 20 >> 2] = $vararg_buffer; //@line 9561
    HEAP32[$AsyncCtx + 24 >> 2] = $vararg_buffer; //@line 9563
    sp = STACKTOP; //@line 9564
    STACKTOP = sp; //@line 9565
    return;
   }
   _emscripten_free_async_context($AsyncCtx | 0); //@line 9567
   if (!$29) {
    HEAP32[$vararg_buffer3 >> 2] = 3941; //@line 9569
    HEAP32[$vararg_buffer3 + 4 >> 2] = $25; //@line 9571
    _abort_message(3850, $vararg_buffer3); //@line 9572
   }
   $36 = HEAP32[$0 >> 2] | 0; //@line 9575
   $39 = HEAP32[(HEAP32[$36 >> 2] | 0) + 8 >> 2] | 0; //@line 9578
   $AsyncCtx14 = _emscripten_alloc_async_context(16, sp) | 0; //@line 9579
   $40 = FUNCTION_TABLE_ii[$39 & 3]($36) | 0; //@line 9580
   if (___async) {
    HEAP32[$AsyncCtx14 >> 2] = 82; //@line 9583
    HEAP32[$AsyncCtx14 + 4 >> 2] = $vararg_buffer; //@line 9585
    HEAP32[$AsyncCtx14 + 8 >> 2] = $25; //@line 9587
    HEAP32[$AsyncCtx14 + 12 >> 2] = $vararg_buffer; //@line 9589
    sp = STACKTOP; //@line 9590
    STACKTOP = sp; //@line 9591
    return;
   } else {
    _emscripten_free_async_context($AsyncCtx14 | 0); //@line 9593
    HEAP32[$vararg_buffer >> 2] = 3941; //@line 9594
    HEAP32[$vararg_buffer + 4 >> 2] = $25; //@line 9596
    HEAP32[$vararg_buffer + 8 >> 2] = $40; //@line 9598
    _abort_message(3805, $vararg_buffer); //@line 9599
   }
  }
 }
 _abort_message(3929, $vararg_buffer10); //@line 9604
}
function ___stdio_write($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$0 = 0, $$04756 = 0, $$04855 = 0, $$04954 = 0, $$051 = 0, $$1 = 0, $$150 = 0, $12 = 0, $13 = 0, $17 = 0, $20 = 0, $25 = 0, $27 = 0, $3 = 0, $37 = 0, $38 = 0, $4 = 0, $44 = 0, $5 = 0, $7 = 0, $9 = 0, $vararg_buffer = 0, $vararg_buffer3 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 5724
 STACKTOP = STACKTOP + 48 | 0; //@line 5725
 $vararg_buffer3 = sp + 16 | 0; //@line 5726
 $vararg_buffer = sp; //@line 5727
 $3 = sp + 32 | 0; //@line 5728
 $4 = $0 + 28 | 0; //@line 5729
 $5 = HEAP32[$4 >> 2] | 0; //@line 5730
 HEAP32[$3 >> 2] = $5; //@line 5731
 $7 = $0 + 20 | 0; //@line 5733
 $9 = (HEAP32[$7 >> 2] | 0) - $5 | 0; //@line 5735
 HEAP32[$3 + 4 >> 2] = $9; //@line 5736
 HEAP32[$3 + 8 >> 2] = $1; //@line 5738
 HEAP32[$3 + 12 >> 2] = $2; //@line 5740
 $12 = $9 + $2 | 0; //@line 5741
 $13 = $0 + 60 | 0; //@line 5742
 HEAP32[$vararg_buffer >> 2] = HEAP32[$13 >> 2]; //@line 5745
 HEAP32[$vararg_buffer + 4 >> 2] = $3; //@line 5747
 HEAP32[$vararg_buffer + 8 >> 2] = 2; //@line 5749
 $17 = ___syscall_ret(___syscall146(146, $vararg_buffer | 0) | 0) | 0; //@line 5751
 L1 : do {
  if (($12 | 0) == ($17 | 0)) {
   label = 3; //@line 5755
  } else {
   $$04756 = 2; //@line 5757
   $$04855 = $12; //@line 5757
   $$04954 = $3; //@line 5757
   $27 = $17; //@line 5757
   while (1) {
    if (($27 | 0) < 0) {
     break;
    }
    $$04855 = $$04855 - $27 | 0; //@line 5763
    $37 = HEAP32[$$04954 + 4 >> 2] | 0; //@line 5765
    $38 = $27 >>> 0 > $37 >>> 0; //@line 5766
    $$150 = $38 ? $$04954 + 8 | 0 : $$04954; //@line 5768
    $$1 = $$04756 + ($38 << 31 >> 31) | 0; //@line 5770
    $$0 = $27 - ($38 ? $37 : 0) | 0; //@line 5772
    HEAP32[$$150 >> 2] = (HEAP32[$$150 >> 2] | 0) + $$0; //@line 5775
    $44 = $$150 + 4 | 0; //@line 5776
    HEAP32[$44 >> 2] = (HEAP32[$44 >> 2] | 0) - $$0; //@line 5779
    HEAP32[$vararg_buffer3 >> 2] = HEAP32[$13 >> 2]; //@line 5782
    HEAP32[$vararg_buffer3 + 4 >> 2] = $$150; //@line 5784
    HEAP32[$vararg_buffer3 + 8 >> 2] = $$1; //@line 5786
    $27 = ___syscall_ret(___syscall146(146, $vararg_buffer3 | 0) | 0) | 0; //@line 5788
    if (($$04855 | 0) == ($27 | 0)) {
     label = 3; //@line 5791
     break L1;
    } else {
     $$04756 = $$1; //@line 5794
     $$04954 = $$150; //@line 5794
    }
   }
   HEAP32[$0 + 16 >> 2] = 0; //@line 5798
   HEAP32[$4 >> 2] = 0; //@line 5799
   HEAP32[$7 >> 2] = 0; //@line 5800
   HEAP32[$0 >> 2] = HEAP32[$0 >> 2] | 32; //@line 5803
   if (($$04756 | 0) == 2) {
    $$051 = 0; //@line 5806
   } else {
    $$051 = $2 - (HEAP32[$$04954 + 4 >> 2] | 0) | 0; //@line 5811
   }
  }
 } while (0);
 if ((label | 0) == 3) {
  $20 = HEAP32[$0 + 44 >> 2] | 0; //@line 5817
  HEAP32[$0 + 16 >> 2] = $20 + (HEAP32[$0 + 48 >> 2] | 0); //@line 5822
  $25 = $20; //@line 5823
  HEAP32[$4 >> 2] = $25; //@line 5824
  HEAP32[$7 >> 2] = $25; //@line 5825
  $$051 = $2; //@line 5826
 }
 STACKTOP = sp; //@line 5828
 return $$051 | 0; //@line 5828
}
function _main__async_cb_46($0) {
 $0 = $0 | 0;
 var $$expand_i1_val = 0, $12 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx6 = 0, sp = 0;
 sp = STACKTOP; //@line 2666
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 2668
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 2670
 if (!$AsyncRetVal) {
  HEAP32[$2 >> 2] = 0; //@line 2673
  HEAP32[$2 + 4 >> 2] = 0; //@line 2673
  HEAP32[$2 + 8 >> 2] = 0; //@line 2673
  HEAP32[$2 + 12 >> 2] = 0; //@line 2673
  $18 = 1; //@line 2674
  $20 = $2; //@line 2674
 } else {
  HEAP32[$AsyncRetVal + 4 >> 2] = 4388; //@line 2677
  HEAP32[$AsyncRetVal + 8 >> 2] = 0; //@line 2679
  HEAP32[$AsyncRetVal + 12 >> 2] = 0; //@line 2681
  HEAP32[$AsyncRetVal + 16 >> 2] = -1; //@line 2683
  HEAP32[$AsyncRetVal + 20 >> 2] = 2; //@line 2685
  HEAP32[$AsyncRetVal + 24 >> 2] = 60; //@line 2687
  HEAP32[$AsyncRetVal + 28 >> 2] = 3; //@line 2689
  HEAP32[$AsyncRetVal >> 2] = 1; //@line 2690
  $12 = $2 + 4 | 0; //@line 2691
  HEAP32[$12 >> 2] = 0; //@line 2692
  HEAP32[$12 + 4 >> 2] = 0; //@line 2692
  HEAP32[$12 + 8 >> 2] = 0; //@line 2692
  HEAP32[$2 >> 2] = $AsyncRetVal; //@line 2693
  HEAP32[$AsyncRetVal >> 2] = (HEAP32[$AsyncRetVal >> 2] | 0) + 1; //@line 2696
  $18 = 0; //@line 2697
  $20 = $2; //@line 2697
 }
 $15 = $2 + 12 | 0; //@line 2699
 HEAP32[$15 >> 2] = 168; //@line 2700
 $ReallocAsyncCtx6 = _emscripten_realloc_async_context(24) | 0; //@line 2701
 __ZN4mbed11InterruptIn4fallENS_8CallbackIFvvEEE(4636, $2); //@line 2702
 if (___async) {
  HEAP32[$ReallocAsyncCtx6 >> 2] = 61; //@line 2705
  $16 = $ReallocAsyncCtx6 + 4 | 0; //@line 2706
  HEAP32[$16 >> 2] = $15; //@line 2707
  $17 = $ReallocAsyncCtx6 + 8 | 0; //@line 2708
  $$expand_i1_val = $18 & 1; //@line 2709
  HEAP8[$17 >> 0] = $$expand_i1_val; //@line 2710
  $19 = $ReallocAsyncCtx6 + 12 | 0; //@line 2711
  HEAP32[$19 >> 2] = $20; //@line 2712
  $21 = $ReallocAsyncCtx6 + 16 | 0; //@line 2713
  HEAP32[$21 >> 2] = $AsyncRetVal; //@line 2714
  $22 = $ReallocAsyncCtx6 + 20 | 0; //@line 2715
  HEAP32[$22 >> 2] = $AsyncRetVal; //@line 2716
  sp = STACKTOP; //@line 2717
  return;
 }
 ___async_unwind = 0; //@line 2720
 HEAP32[$ReallocAsyncCtx6 >> 2] = 61; //@line 2721
 $16 = $ReallocAsyncCtx6 + 4 | 0; //@line 2722
 HEAP32[$16 >> 2] = $15; //@line 2723
 $17 = $ReallocAsyncCtx6 + 8 | 0; //@line 2724
 $$expand_i1_val = $18 & 1; //@line 2725
 HEAP8[$17 >> 0] = $$expand_i1_val; //@line 2726
 $19 = $ReallocAsyncCtx6 + 12 | 0; //@line 2727
 HEAP32[$19 >> 2] = $20; //@line 2728
 $21 = $ReallocAsyncCtx6 + 16 | 0; //@line 2729
 HEAP32[$21 >> 2] = $AsyncRetVal; //@line 2730
 $22 = $ReallocAsyncCtx6 + 20 | 0; //@line 2731
 HEAP32[$22 >> 2] = $AsyncRetVal; //@line 2732
 sp = STACKTOP; //@line 2733
 return;
}
function __ZNK10__cxxabiv121__vmi_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb_23($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $20 = 0, $22 = 0, $24 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 12283
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 12287
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 12289
 $8 = HEAP8[$0 + 16 >> 0] | 0; //@line 12291
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 12293
 $12 = HEAP8[$0 + 24 >> 0] | 0; //@line 12295
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 12297
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 12299
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 12301
 $20 = HEAP32[$0 + 40 >> 2] | 0; //@line 12303
 $22 = HEAP8[$0 + 44 >> 0] & 1; //@line 12306
 $24 = HEAP32[$0 + 48 >> 2] | 0; //@line 12308
 do {
  if ((HEAP32[$0 + 4 >> 2] | 0) > 1) {
   $26 = $4 + 24 | 0; //@line 12312
   $27 = $6 + 24 | 0; //@line 12313
   $28 = $4 + 8 | 0; //@line 12314
   $29 = $6 + 54 | 0; //@line 12315
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
    HEAP8[$10 >> 0] = 0; //@line 12345
    HEAP8[$14 >> 0] = 0; //@line 12346
    $ReallocAsyncCtx = _emscripten_realloc_async_context(60) | 0; //@line 12347
    __ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($26, $6, $16, $18, $20, $22); //@line 12348
    if (!___async) {
     ___async_unwind = 0; //@line 12351
    }
    HEAP32[$ReallocAsyncCtx >> 2] = 96; //@line 12353
    HEAP32[$ReallocAsyncCtx + 4 >> 2] = $26; //@line 12355
    HEAP32[$ReallocAsyncCtx + 8 >> 2] = $24; //@line 12357
    HEAP32[$ReallocAsyncCtx + 12 >> 2] = $29; //@line 12359
    HEAP8[$ReallocAsyncCtx + 16 >> 0] = $8; //@line 12361
    HEAP32[$ReallocAsyncCtx + 20 >> 2] = $10; //@line 12363
    HEAP8[$ReallocAsyncCtx + 24 >> 0] = $12; //@line 12365
    HEAP32[$ReallocAsyncCtx + 28 >> 2] = $14; //@line 12367
    HEAP32[$ReallocAsyncCtx + 32 >> 2] = $27; //@line 12369
    HEAP32[$ReallocAsyncCtx + 36 >> 2] = $28; //@line 12371
    HEAP32[$ReallocAsyncCtx + 40 >> 2] = $6; //@line 12373
    HEAP32[$ReallocAsyncCtx + 44 >> 2] = $16; //@line 12375
    HEAP32[$ReallocAsyncCtx + 48 >> 2] = $18; //@line 12377
    HEAP32[$ReallocAsyncCtx + 52 >> 2] = $20; //@line 12379
    HEAP8[$ReallocAsyncCtx + 56 >> 0] = $22 & 1; //@line 12382
    sp = STACKTOP; //@line 12383
    return;
   }
  }
 } while (0);
 HEAP8[$10 >> 0] = $8; //@line 12388
 HEAP8[$14 >> 0] = $12; //@line 12389
 return;
}
function __ZNK10__cxxabiv121__vmi_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $20 = 0, $22 = 0, $24 = 0, $26 = 0, $28 = 0, $4 = 0, $43 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 12167
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 12171
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 12173
 $8 = HEAP8[$0 + 16 >> 0] | 0; //@line 12175
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 12177
 $12 = HEAP8[$0 + 24 >> 0] | 0; //@line 12179
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 12181
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 12183
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 12185
 $20 = HEAP32[$0 + 40 >> 2] | 0; //@line 12187
 $22 = HEAP32[$0 + 44 >> 2] | 0; //@line 12189
 $24 = HEAP32[$0 + 48 >> 2] | 0; //@line 12191
 $26 = HEAP32[$0 + 52 >> 2] | 0; //@line 12193
 $28 = HEAP8[$0 + 56 >> 0] & 1; //@line 12196
 $43 = (HEAP32[$0 + 4 >> 2] | 0) + 8 | 0; //@line 12197
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
    HEAP8[$10 >> 0] = 0; //@line 12230
    HEAP8[$14 >> 0] = 0; //@line 12231
    $ReallocAsyncCtx = _emscripten_realloc_async_context(60) | 0; //@line 12232
    __ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($43, $20, $22, $24, $26, $28); //@line 12233
    if (!___async) {
     ___async_unwind = 0; //@line 12236
    }
    HEAP32[$ReallocAsyncCtx >> 2] = 96; //@line 12238
    HEAP32[$ReallocAsyncCtx + 4 >> 2] = $43; //@line 12240
    HEAP32[$ReallocAsyncCtx + 8 >> 2] = $4; //@line 12242
    HEAP32[$ReallocAsyncCtx + 12 >> 2] = $6; //@line 12244
    HEAP8[$ReallocAsyncCtx + 16 >> 0] = $8; //@line 12246
    HEAP32[$ReallocAsyncCtx + 20 >> 2] = $10; //@line 12248
    HEAP8[$ReallocAsyncCtx + 24 >> 0] = $12; //@line 12250
    HEAP32[$ReallocAsyncCtx + 28 >> 2] = $14; //@line 12252
    HEAP32[$ReallocAsyncCtx + 32 >> 2] = $16; //@line 12254
    HEAP32[$ReallocAsyncCtx + 36 >> 2] = $18; //@line 12256
    HEAP32[$ReallocAsyncCtx + 40 >> 2] = $20; //@line 12258
    HEAP32[$ReallocAsyncCtx + 44 >> 2] = $22; //@line 12260
    HEAP32[$ReallocAsyncCtx + 48 >> 2] = $24; //@line 12262
    HEAP32[$ReallocAsyncCtx + 52 >> 2] = $26; //@line 12264
    HEAP8[$ReallocAsyncCtx + 56 >> 0] = $28 & 1; //@line 12267
    sp = STACKTOP; //@line 12268
    return;
   }
  }
 } while (0);
 HEAP8[$10 >> 0] = $8; //@line 12273
 HEAP8[$14 >> 0] = $12; //@line 12274
 return;
}
function _main__async_cb_45($0) {
 $0 = $0 | 0;
 var $$expand_i1_val = 0, $10 = 0, $11 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $19 = 0, $22 = 0, $23 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx = 0, $ReallocAsyncCtx2 = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 2579
 $4 = HEAP8[$0 + 8 >> 0] & 1; //@line 2584
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 2586
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 2588
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 2590
 $11 = HEAP32[HEAP32[$0 + 4 >> 2] >> 2] | 0; //@line 2591
 if ($11 | 0) {
  $14 = HEAP32[$11 + 8 >> 2] | 0; //@line 2595
  $ReallocAsyncCtx = _emscripten_realloc_async_context(16) | 0; //@line 2596
  FUNCTION_TABLE_vi[$14 & 127]($6); //@line 2597
  if (___async) {
   HEAP32[$ReallocAsyncCtx >> 2] = 62; //@line 2600
   $15 = $ReallocAsyncCtx + 4 | 0; //@line 2601
   $$expand_i1_val = $4 & 1; //@line 2602
   HEAP8[$15 >> 0] = $$expand_i1_val; //@line 2603
   $16 = $ReallocAsyncCtx + 8 | 0; //@line 2604
   HEAP32[$16 >> 2] = $8; //@line 2605
   $17 = $ReallocAsyncCtx + 12 | 0; //@line 2606
   HEAP32[$17 >> 2] = $10; //@line 2607
   sp = STACKTOP; //@line 2608
   return;
  }
  ___async_unwind = 0; //@line 2611
  HEAP32[$ReallocAsyncCtx >> 2] = 62; //@line 2612
  $15 = $ReallocAsyncCtx + 4 | 0; //@line 2613
  $$expand_i1_val = $4 & 1; //@line 2614
  HEAP8[$15 >> 0] = $$expand_i1_val; //@line 2615
  $16 = $ReallocAsyncCtx + 8 | 0; //@line 2616
  HEAP32[$16 >> 2] = $8; //@line 2617
  $17 = $ReallocAsyncCtx + 12 | 0; //@line 2618
  HEAP32[$17 >> 2] = $10; //@line 2619
  sp = STACKTOP; //@line 2620
  return;
 }
 if (!$4) {
  $19 = (HEAP32[$8 >> 2] | 0) + -1 | 0; //@line 2625
  HEAP32[$8 >> 2] = $19; //@line 2626
  if (!$19) {
   $22 = HEAP32[$8 + 24 >> 2] | 0; //@line 2630
   $ReallocAsyncCtx2 = _emscripten_realloc_async_context(8) | 0; //@line 2631
   FUNCTION_TABLE_vi[$22 & 127]($10); //@line 2632
   if (___async) {
    HEAP32[$ReallocAsyncCtx2 >> 2] = 63; //@line 2635
    $23 = $ReallocAsyncCtx2 + 4 | 0; //@line 2636
    HEAP32[$23 >> 2] = $8; //@line 2637
    sp = STACKTOP; //@line 2638
    return;
   }
   ___async_unwind = 0; //@line 2641
   HEAP32[$ReallocAsyncCtx2 >> 2] = 63; //@line 2642
   $23 = $ReallocAsyncCtx2 + 4 | 0; //@line 2643
   HEAP32[$23 >> 2] = $8; //@line 2644
   sp = STACKTOP; //@line 2645
   return;
  }
 }
 $ReallocAsyncCtx3 = _emscripten_realloc_async_context(4) | 0; //@line 2649
 __ZN6events10EventQueue8dispatchEi(4388, -1); //@line 2650
 if (___async) {
  HEAP32[$ReallocAsyncCtx3 >> 2] = 65; //@line 2653
  sp = STACKTOP; //@line 2654
  return;
 }
 ___async_unwind = 0; //@line 2657
 HEAP32[$ReallocAsyncCtx3 >> 2] = 65; //@line 2658
 sp = STACKTOP; //@line 2659
 return;
}
function _memcpy(dest, src, num) {
 dest = dest | 0;
 src = src | 0;
 num = num | 0;
 var ret = 0, aligned_dest_end = 0, block_aligned_dest_end = 0, dest_end = 0;
 if ((num | 0) >= 8192) {
  return _emscripten_memcpy_big(dest | 0, src | 0, num | 0) | 0; //@line 3267
 }
 ret = dest | 0; //@line 3270
 dest_end = dest + num | 0; //@line 3271
 if ((dest & 3) == (src & 3)) {
  while (dest & 3) {
   if (!num) return ret | 0; //@line 3275
   HEAP8[dest >> 0] = HEAP8[src >> 0] | 0; //@line 3276
   dest = dest + 1 | 0; //@line 3277
   src = src + 1 | 0; //@line 3278
   num = num - 1 | 0; //@line 3279
  }
  aligned_dest_end = dest_end & -4 | 0; //@line 3281
  block_aligned_dest_end = aligned_dest_end - 64 | 0; //@line 3282
  while ((dest | 0) <= (block_aligned_dest_end | 0)) {
   HEAP32[dest >> 2] = HEAP32[src >> 2]; //@line 3284
   HEAP32[dest + 4 >> 2] = HEAP32[src + 4 >> 2]; //@line 3285
   HEAP32[dest + 8 >> 2] = HEAP32[src + 8 >> 2]; //@line 3286
   HEAP32[dest + 12 >> 2] = HEAP32[src + 12 >> 2]; //@line 3287
   HEAP32[dest + 16 >> 2] = HEAP32[src + 16 >> 2]; //@line 3288
   HEAP32[dest + 20 >> 2] = HEAP32[src + 20 >> 2]; //@line 3289
   HEAP32[dest + 24 >> 2] = HEAP32[src + 24 >> 2]; //@line 3290
   HEAP32[dest + 28 >> 2] = HEAP32[src + 28 >> 2]; //@line 3291
   HEAP32[dest + 32 >> 2] = HEAP32[src + 32 >> 2]; //@line 3292
   HEAP32[dest + 36 >> 2] = HEAP32[src + 36 >> 2]; //@line 3293
   HEAP32[dest + 40 >> 2] = HEAP32[src + 40 >> 2]; //@line 3294
   HEAP32[dest + 44 >> 2] = HEAP32[src + 44 >> 2]; //@line 3295
   HEAP32[dest + 48 >> 2] = HEAP32[src + 48 >> 2]; //@line 3296
   HEAP32[dest + 52 >> 2] = HEAP32[src + 52 >> 2]; //@line 3297
   HEAP32[dest + 56 >> 2] = HEAP32[src + 56 >> 2]; //@line 3298
   HEAP32[dest + 60 >> 2] = HEAP32[src + 60 >> 2]; //@line 3299
   dest = dest + 64 | 0; //@line 3300
   src = src + 64 | 0; //@line 3301
  }
  while ((dest | 0) < (aligned_dest_end | 0)) {
   HEAP32[dest >> 2] = HEAP32[src >> 2]; //@line 3304
   dest = dest + 4 | 0; //@line 3305
   src = src + 4 | 0; //@line 3306
  }
 } else {
  aligned_dest_end = dest_end - 4 | 0; //@line 3310
  while ((dest | 0) < (aligned_dest_end | 0)) {
   HEAP8[dest >> 0] = HEAP8[src >> 0] | 0; //@line 3312
   HEAP8[dest + 1 >> 0] = HEAP8[src + 1 >> 0] | 0; //@line 3313
   HEAP8[dest + 2 >> 0] = HEAP8[src + 2 >> 0] | 0; //@line 3314
   HEAP8[dest + 3 >> 0] = HEAP8[src + 3 >> 0] | 0; //@line 3315
   dest = dest + 4 | 0; //@line 3316
   src = src + 4 | 0; //@line 3317
  }
 }
 while ((dest | 0) < (dest_end | 0)) {
  HEAP8[dest >> 0] = HEAP8[src >> 0] | 0; //@line 3322
  dest = dest + 1 | 0; //@line 3323
  src = src + 1 | 0; //@line 3324
 }
 return ret | 0; //@line 3326
}
function _equeue_alloc($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0 = 0, $$037$sink$i = 0, $$03741$i = 0, $$1$i9 = 0, $11 = 0, $14 = 0, $17 = 0, $18 = 0, $20 = 0, $21 = 0, $23 = 0, $24 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $AsyncCtx = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 589
 $AsyncCtx = _emscripten_alloc_async_context(12, sp) | 0; //@line 590
 _wait_ms(10); //@line 591
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 23; //@line 594
  HEAP32[$AsyncCtx + 4 >> 2] = $1; //@line 596
  HEAP32[$AsyncCtx + 8 >> 2] = $0; //@line 598
  sp = STACKTOP; //@line 599
  return 0; //@line 600
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 602
 $5 = $1 + 39 & -4; //@line 604
 $6 = $0 + 156 | 0; //@line 605
 _equeue_mutex_lock($6); //@line 606
 $7 = $0 + 24 | 0; //@line 607
 $8 = HEAP32[$7 >> 2] | 0; //@line 608
 L4 : do {
  if (!$8) {
   label = 9; //@line 612
  } else {
   $$03741$i = $7; //@line 614
   $11 = $8; //@line 614
   while (1) {
    if ((HEAP32[$11 >> 2] | 0) >>> 0 >= $5 >>> 0) {
     break;
    }
    $17 = $11 + 8 | 0; //@line 621
    $18 = HEAP32[$17 >> 2] | 0; //@line 622
    if (!$18) {
     label = 9; //@line 625
     break L4;
    } else {
     $$03741$i = $17; //@line 628
     $11 = $18; //@line 628
    }
   }
   $14 = HEAP32[$11 + 12 >> 2] | 0; //@line 632
   if (!$14) {
    $$037$sink$i = $$03741$i; //@line 635
   } else {
    HEAP32[$$03741$i >> 2] = $14; //@line 637
    $$037$sink$i = $14 + 8 | 0; //@line 639
   }
   HEAP32[$$037$sink$i >> 2] = HEAP32[$11 + 8 >> 2]; //@line 643
   _equeue_mutex_unlock($6); //@line 644
   $$1$i9 = $11; //@line 645
  }
 } while (0);
 do {
  if ((label | 0) == 9) {
   $20 = $0 + 28 | 0; //@line 650
   $21 = HEAP32[$20 >> 2] | 0; //@line 651
   if ($21 >>> 0 < $5 >>> 0) {
    _equeue_mutex_unlock($6); //@line 654
    $$0 = 0; //@line 655
    return $$0 | 0; //@line 656
   } else {
    $23 = $0 + 32 | 0; //@line 658
    $24 = HEAP32[$23 >> 2] | 0; //@line 659
    HEAP32[$23 >> 2] = $24 + $5; //@line 661
    HEAP32[$20 >> 2] = $21 - $5; //@line 663
    HEAP32[$24 >> 2] = $5; //@line 664
    HEAP8[$24 + 4 >> 0] = 1; //@line 666
    _equeue_mutex_unlock($6); //@line 667
    if (!$24) {
     $$0 = 0; //@line 670
    } else {
     $$1$i9 = $24; //@line 672
     break;
    }
    return $$0 | 0; //@line 675
   }
  }
 } while (0);
 HEAP32[$$1$i9 + 20 >> 2] = 0; //@line 680
 HEAP32[$$1$i9 + 24 >> 2] = -1; //@line 682
 HEAP32[$$1$i9 + 28 >> 2] = 0; //@line 684
 $$0 = $$1$i9 + 36 | 0; //@line 686
 return $$0 | 0; //@line 687
}
function __ZNK10__cxxabiv121__vmi_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $$0 = 0, $10 = 0, $19 = 0, $28 = 0, $9 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 11021
 L1 : do {
  if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, 0) | 0) {
   __ZNK10__cxxabiv117__class_type_info24process_found_base_classEPNS_19__dynamic_cast_infoEPvi(0, $1, $2, $3); //@line 11027
  } else {
   $9 = HEAP32[$0 + 12 >> 2] | 0; //@line 11031
   $10 = $0 + 16 + ($9 << 3) | 0; //@line 11032
   $AsyncCtx3 = _emscripten_alloc_async_context(28, sp) | 0; //@line 11033
   __ZNK10__cxxabiv122__base_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($0 + 16 | 0, $1, $2, $3); //@line 11034
   if (___async) {
    HEAP32[$AsyncCtx3 >> 2] = 102; //@line 11037
    HEAP32[$AsyncCtx3 + 4 >> 2] = $9; //@line 11039
    HEAP32[$AsyncCtx3 + 8 >> 2] = $0; //@line 11041
    HEAP32[$AsyncCtx3 + 12 >> 2] = $1; //@line 11043
    HEAP32[$AsyncCtx3 + 16 >> 2] = $2; //@line 11045
    HEAP32[$AsyncCtx3 + 20 >> 2] = $3; //@line 11047
    HEAP32[$AsyncCtx3 + 24 >> 2] = $10; //@line 11049
    sp = STACKTOP; //@line 11050
    return;
   }
   _emscripten_free_async_context($AsyncCtx3 | 0); //@line 11053
   if (($9 | 0) > 1) {
    $19 = $1 + 54 | 0; //@line 11057
    $$0 = $0 + 24 | 0; //@line 11058
    while (1) {
     $AsyncCtx = _emscripten_alloc_async_context(28, sp) | 0; //@line 11060
     __ZNK10__cxxabiv122__base_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($$0, $1, $2, $3); //@line 11061
     if (___async) {
      break;
     }
     _emscripten_free_async_context($AsyncCtx | 0); //@line 11066
     if (HEAP8[$19 >> 0] | 0) {
      break L1;
     }
     $28 = $$0 + 8 | 0; //@line 11072
     if ($28 >>> 0 < $10 >>> 0) {
      $$0 = $28; //@line 11075
     } else {
      break L1;
     }
    }
    HEAP32[$AsyncCtx >> 2] = 103; //@line 11080
    HEAP32[$AsyncCtx + 4 >> 2] = $19; //@line 11082
    HEAP32[$AsyncCtx + 8 >> 2] = $$0; //@line 11084
    HEAP32[$AsyncCtx + 12 >> 2] = $10; //@line 11086
    HEAP32[$AsyncCtx + 16 >> 2] = $1; //@line 11088
    HEAP32[$AsyncCtx + 20 >> 2] = $2; //@line 11090
    HEAP32[$AsyncCtx + 24 >> 2] = $3; //@line 11092
    sp = STACKTOP; //@line 11093
    return;
   }
  }
 } while (0);
 return;
}
function _equeue_alloc__async_cb($0) {
 $0 = $0 | 0;
 var $$0 = 0, $$037$sink$i = 0, $$03741$i = 0, $$1$i9 = 0, $12 = 0, $15 = 0, $18 = 0, $19 = 0, $21 = 0, $22 = 0, $24 = 0, $25 = 0, $34 = 0, $4 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0;
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 1552
 $6 = (HEAP32[$0 + 4 >> 2] | 0) + 39 & -4; //@line 1554
 $7 = $4 + 156 | 0; //@line 1555
 _equeue_mutex_lock($7); //@line 1556
 $8 = $4 + 24 | 0; //@line 1557
 $9 = HEAP32[$8 >> 2] | 0; //@line 1558
 L2 : do {
  if (!$9) {
   label = 8; //@line 1562
  } else {
   $$03741$i = $8; //@line 1564
   $12 = $9; //@line 1564
   while (1) {
    if ((HEAP32[$12 >> 2] | 0) >>> 0 >= $6 >>> 0) {
     break;
    }
    $18 = $12 + 8 | 0; //@line 1571
    $19 = HEAP32[$18 >> 2] | 0; //@line 1572
    if (!$19) {
     label = 8; //@line 1575
     break L2;
    } else {
     $$03741$i = $18; //@line 1578
     $12 = $19; //@line 1578
    }
   }
   $15 = HEAP32[$12 + 12 >> 2] | 0; //@line 1582
   if (!$15) {
    $$037$sink$i = $$03741$i; //@line 1585
   } else {
    HEAP32[$$03741$i >> 2] = $15; //@line 1587
    $$037$sink$i = $15 + 8 | 0; //@line 1589
   }
   HEAP32[$$037$sink$i >> 2] = HEAP32[$12 + 8 >> 2]; //@line 1593
   _equeue_mutex_unlock($7); //@line 1594
   $$1$i9 = $12; //@line 1595
  }
 } while (0);
 do {
  if ((label | 0) == 8) {
   $21 = $4 + 28 | 0; //@line 1600
   $22 = HEAP32[$21 >> 2] | 0; //@line 1601
   if ($22 >>> 0 < $6 >>> 0) {
    _equeue_mutex_unlock($7); //@line 1604
    $$0 = 0; //@line 1605
    $34 = ___async_retval; //@line 1606
    HEAP32[$34 >> 2] = $$0; //@line 1607
    return;
   } else {
    $24 = $4 + 32 | 0; //@line 1610
    $25 = HEAP32[$24 >> 2] | 0; //@line 1611
    HEAP32[$24 >> 2] = $25 + $6; //@line 1613
    HEAP32[$21 >> 2] = $22 - $6; //@line 1615
    HEAP32[$25 >> 2] = $6; //@line 1616
    HEAP8[$25 + 4 >> 0] = 1; //@line 1618
    _equeue_mutex_unlock($7); //@line 1619
    if (!$25) {
     $$0 = 0; //@line 1622
    } else {
     $$1$i9 = $25; //@line 1624
     break;
    }
    $34 = ___async_retval; //@line 1627
    HEAP32[$34 >> 2] = $$0; //@line 1628
    return;
   }
  }
 } while (0);
 HEAP32[$$1$i9 + 20 >> 2] = 0; //@line 1634
 HEAP32[$$1$i9 + 24 >> 2] = -1; //@line 1636
 HEAP32[$$1$i9 + 28 >> 2] = 0; //@line 1638
 $$0 = $$1$i9 + 36 | 0; //@line 1640
 $34 = ___async_retval; //@line 1641
 HEAP32[$34 >> 2] = $$0; //@line 1642
 return;
}
function _equeue_dealloc($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$02329$i = 0, $$02330$i = 0, $$025$i = 0, $$sink$in$i = 0, $$sink21$i = 0, $10 = 0, $11 = 0, $13 = 0, $14 = 0, $15 = 0, $17 = 0, $18 = 0, $2 = 0, $25 = 0, $4 = 0, $9 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 694
 $2 = $1 + -36 | 0; //@line 695
 $4 = HEAP32[$1 + -8 >> 2] | 0; //@line 697
 do {
  if ($4 | 0) {
   $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 701
   FUNCTION_TABLE_vi[$4 & 127]($1); //@line 702
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 24; //@line 705
    HEAP32[$AsyncCtx + 4 >> 2] = $0; //@line 707
    HEAP32[$AsyncCtx + 8 >> 2] = $1; //@line 709
    HEAP32[$AsyncCtx + 12 >> 2] = $2; //@line 711
    sp = STACKTOP; //@line 712
    return;
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 715
    break;
   }
  }
 } while (0);
 $9 = $0 + 156 | 0; //@line 720
 _equeue_mutex_lock($9); //@line 721
 $10 = $0 + 24 | 0; //@line 722
 $11 = HEAP32[$10 >> 2] | 0; //@line 723
 L7 : do {
  if (!$11) {
   $$02329$i = $10; //@line 727
  } else {
   $13 = HEAP32[$2 >> 2] | 0; //@line 729
   $$025$i = $10; //@line 730
   $15 = $11; //@line 730
   while (1) {
    $14 = HEAP32[$15 >> 2] | 0; //@line 732
    if ($14 >>> 0 >= $13 >>> 0) {
     break;
    }
    $17 = $15 + 8 | 0; //@line 737
    $18 = HEAP32[$17 >> 2] | 0; //@line 738
    if (!$18) {
     $$02329$i = $17; //@line 741
     break L7;
    } else {
     $$025$i = $17; //@line 744
     $15 = $18; //@line 744
    }
   }
   if (($14 | 0) == ($13 | 0)) {
    HEAP32[$1 + -24 >> 2] = $15; //@line 750
    $$02330$i = $$025$i; //@line 753
    $$sink$in$i = (HEAP32[$$025$i >> 2] | 0) + 8 | 0; //@line 753
    $$sink21$i = HEAP32[$$sink$in$i >> 2] | 0; //@line 754
    $25 = $1 + -28 | 0; //@line 755
    HEAP32[$25 >> 2] = $$sink21$i; //@line 756
    HEAP32[$$02330$i >> 2] = $2; //@line 757
    _equeue_mutex_unlock($9); //@line 758
    return;
   } else {
    $$02329$i = $$025$i; //@line 761
   }
  }
 } while (0);
 HEAP32[$1 + -24 >> 2] = 0; //@line 766
 $$02330$i = $$02329$i; //@line 767
 $$sink$in$i = $$02329$i; //@line 767
 $$sink21$i = HEAP32[$$sink$in$i >> 2] | 0; //@line 768
 $25 = $1 + -28 | 0; //@line 769
 HEAP32[$25 >> 2] = $$sink21$i; //@line 770
 HEAP32[$$02330$i >> 2] = $2; //@line 771
 _equeue_mutex_unlock($9); //@line 772
 return;
}
function __ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$0 = 0, $$2 = 0, $17 = 0, $18 = 0, $3 = 0, $6 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, dest = 0, sp = 0, stop = 0;
 sp = STACKTOP; //@line 9689
 STACKTOP = STACKTOP + 64 | 0; //@line 9690
 $3 = sp; //@line 9691
 if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, $1, 0) | 0) {
  $$2 = 1; //@line 9694
 } else {
  if (!$1) {
   $$2 = 0; //@line 9698
  } else {
   $AsyncCtx3 = _emscripten_alloc_async_context(16, sp) | 0; //@line 9700
   $6 = ___dynamic_cast($1, 64, 48, 0) | 0; //@line 9701
   if (___async) {
    HEAP32[$AsyncCtx3 >> 2] = 85; //@line 9704
    HEAP32[$AsyncCtx3 + 4 >> 2] = $3; //@line 9706
    HEAP32[$AsyncCtx3 + 8 >> 2] = $0; //@line 9708
    HEAP32[$AsyncCtx3 + 12 >> 2] = $2; //@line 9710
    sp = STACKTOP; //@line 9711
    STACKTOP = sp; //@line 9712
    return 0; //@line 9712
   }
   _emscripten_free_async_context($AsyncCtx3 | 0); //@line 9714
   if (!$6) {
    $$2 = 0; //@line 9717
   } else {
    dest = $3 + 4 | 0; //@line 9720
    stop = dest + 52 | 0; //@line 9720
    do {
     HEAP32[dest >> 2] = 0; //@line 9720
     dest = dest + 4 | 0; //@line 9720
    } while ((dest | 0) < (stop | 0));
    HEAP32[$3 >> 2] = $6; //@line 9721
    HEAP32[$3 + 8 >> 2] = $0; //@line 9723
    HEAP32[$3 + 12 >> 2] = -1; //@line 9725
    HEAP32[$3 + 48 >> 2] = 1; //@line 9727
    $17 = HEAP32[(HEAP32[$6 >> 2] | 0) + 28 >> 2] | 0; //@line 9730
    $18 = HEAP32[$2 >> 2] | 0; //@line 9731
    $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 9732
    FUNCTION_TABLE_viiii[$17 & 3]($6, $3, $18, 1); //@line 9733
    if (___async) {
     HEAP32[$AsyncCtx >> 2] = 86; //@line 9736
     HEAP32[$AsyncCtx + 4 >> 2] = $3; //@line 9738
     HEAP32[$AsyncCtx + 8 >> 2] = $2; //@line 9740
     HEAP32[$AsyncCtx + 12 >> 2] = $3; //@line 9742
     sp = STACKTOP; //@line 9743
     STACKTOP = sp; //@line 9744
     return 0; //@line 9744
    }
    _emscripten_free_async_context($AsyncCtx | 0); //@line 9746
    if ((HEAP32[$3 + 24 >> 2] | 0) == 1) {
     HEAP32[$2 >> 2] = HEAP32[$3 + 16 >> 2]; //@line 9753
     $$0 = 1; //@line 9754
    } else {
     $$0 = 0; //@line 9756
    }
    $$2 = $$0; //@line 9758
   }
  }
 }
 STACKTOP = sp; //@line 9762
 return $$2 | 0; //@line 9762
}
function ___mo_lookup($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$090 = 0, $$094 = 0, $$4 = 0, $10 = 0, $13 = 0, $17 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $31 = 0, $35 = 0, $4 = 0, $44 = 0, $46 = 0, $49 = 0, $53 = 0, $63 = 0, $7 = 0;
 $4 = (HEAP32[$0 >> 2] | 0) + 1794895138 | 0; //@line 6334
 $7 = _swapc(HEAP32[$0 + 8 >> 2] | 0, $4) | 0; //@line 6337
 $10 = _swapc(HEAP32[$0 + 12 >> 2] | 0, $4) | 0; //@line 6340
 $13 = _swapc(HEAP32[$0 + 16 >> 2] | 0, $4) | 0; //@line 6343
 L1 : do {
  if ($7 >>> 0 < $1 >>> 2 >>> 0) {
   $17 = $1 - ($7 << 2) | 0; //@line 6349
   if ($10 >>> 0 < $17 >>> 0 & $13 >>> 0 < $17 >>> 0) {
    if (!(($13 | $10) & 3)) {
     $23 = $10 >>> 2; //@line 6358
     $24 = $13 >>> 2; //@line 6359
     $$090 = 0; //@line 6360
     $$094 = $7; //@line 6360
     while (1) {
      $25 = $$094 >>> 1; //@line 6362
      $26 = $$090 + $25 | 0; //@line 6363
      $27 = $26 << 1; //@line 6364
      $28 = $27 + $23 | 0; //@line 6365
      $31 = _swapc(HEAP32[$0 + ($28 << 2) >> 2] | 0, $4) | 0; //@line 6368
      $35 = _swapc(HEAP32[$0 + ($28 + 1 << 2) >> 2] | 0, $4) | 0; //@line 6372
      if (!($35 >>> 0 < $1 >>> 0 & $31 >>> 0 < ($1 - $35 | 0) >>> 0)) {
       $$4 = 0; //@line 6378
       break L1;
      }
      if (HEAP8[$0 + ($35 + $31) >> 0] | 0) {
       $$4 = 0; //@line 6386
       break L1;
      }
      $44 = _strcmp($2, $0 + $35 | 0) | 0; //@line 6390
      if (!$44) {
       break;
      }
      $63 = ($44 | 0) < 0; //@line 6396
      if (($$094 | 0) == 1) {
       $$4 = 0; //@line 6401
       break L1;
      } else {
       $$090 = $63 ? $$090 : $26; //@line 6404
       $$094 = $63 ? $25 : $$094 - $25 | 0; //@line 6404
      }
     }
     $46 = $27 + $24 | 0; //@line 6407
     $49 = _swapc(HEAP32[$0 + ($46 << 2) >> 2] | 0, $4) | 0; //@line 6410
     $53 = _swapc(HEAP32[$0 + ($46 + 1 << 2) >> 2] | 0, $4) | 0; //@line 6414
     if ($53 >>> 0 < $1 >>> 0 & $49 >>> 0 < ($1 - $53 | 0) >>> 0) {
      $$4 = (HEAP8[$0 + ($53 + $49) >> 0] | 0) == 0 ? $0 + $53 | 0 : 0; //@line 6426
     } else {
      $$4 = 0; //@line 6428
     }
    } else {
     $$4 = 0; //@line 6431
    }
   } else {
    $$4 = 0; //@line 6434
   }
  } else {
   $$4 = 0; //@line 6437
  }
 } while (0);
 return $$4 | 0; //@line 6440
}
function _fputc($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0 = 0, $13 = 0, $14 = 0, $19 = 0, $20 = 0, $21 = 0, $26 = 0, $27 = 0, $32 = 0, $34 = 0, $7 = 0, $8 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 9331
 if ((HEAP32[$1 + 76 >> 2] | 0) < 0) {
  label = 3; //@line 9336
 } else {
  if (!(___lockfile($1) | 0)) {
   label = 3; //@line 9341
  } else {
   $20 = $0 & 255; //@line 9343
   $21 = $0 & 255; //@line 9344
   if (($21 | 0) == (HEAP8[$1 + 75 >> 0] | 0)) {
    label = 12; //@line 9350
   } else {
    $26 = $1 + 20 | 0; //@line 9352
    $27 = HEAP32[$26 >> 2] | 0; //@line 9353
    if ($27 >>> 0 < (HEAP32[$1 + 16 >> 2] | 0) >>> 0) {
     HEAP32[$26 >> 2] = $27 + 1; //@line 9359
     HEAP8[$27 >> 0] = $20; //@line 9360
     $34 = $21; //@line 9361
    } else {
     label = 12; //@line 9363
    }
   }
   do {
    if ((label | 0) == 12) {
     $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 9368
     $32 = ___overflow($1, $0) | 0; //@line 9369
     if (___async) {
      HEAP32[$AsyncCtx >> 2] = 79; //@line 9372
      HEAP32[$AsyncCtx + 4 >> 2] = $1; //@line 9374
      sp = STACKTOP; //@line 9375
      return 0; //@line 9376
     } else {
      _emscripten_free_async_context($AsyncCtx | 0); //@line 9378
      $34 = $32; //@line 9379
      break;
     }
    }
   } while (0);
   ___unlockfile($1); //@line 9384
   $$0 = $34; //@line 9385
  }
 }
 do {
  if ((label | 0) == 3) {
   $7 = $0 & 255; //@line 9390
   $8 = $0 & 255; //@line 9391
   if (($8 | 0) != (HEAP8[$1 + 75 >> 0] | 0)) {
    $13 = $1 + 20 | 0; //@line 9397
    $14 = HEAP32[$13 >> 2] | 0; //@line 9398
    if ($14 >>> 0 < (HEAP32[$1 + 16 >> 2] | 0) >>> 0) {
     HEAP32[$13 >> 2] = $14 + 1; //@line 9404
     HEAP8[$14 >> 0] = $7; //@line 9405
     $$0 = $8; //@line 9406
     break;
    }
   }
   $AsyncCtx3 = _emscripten_alloc_async_context(4, sp) | 0; //@line 9410
   $19 = ___overflow($1, $0) | 0; //@line 9411
   if (___async) {
    HEAP32[$AsyncCtx3 >> 2] = 78; //@line 9414
    sp = STACKTOP; //@line 9415
    return 0; //@line 9416
   } else {
    _emscripten_free_async_context($AsyncCtx3 | 0); //@line 9418
    $$0 = $19; //@line 9419
    break;
   }
  }
 } while (0);
 return $$0 | 0; //@line 9424
}
function ___fwritex($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$038 = 0, $$1 = 0, $$139 = 0, $$141 = 0, $$143 = 0, $10 = 0, $12 = 0, $14 = 0, $22 = 0, $28 = 0, $3 = 0, $31 = 0, $4 = 0, $9 = 0, label = 0;
 $3 = $2 + 16 | 0; //@line 6225
 $4 = HEAP32[$3 >> 2] | 0; //@line 6226
 if (!$4) {
  if (!(___towrite($2) | 0)) {
   $12 = HEAP32[$3 >> 2] | 0; //@line 6233
   label = 5; //@line 6234
  } else {
   $$1 = 0; //@line 6236
  }
 } else {
  $12 = $4; //@line 6240
  label = 5; //@line 6241
 }
 L5 : do {
  if ((label | 0) == 5) {
   $9 = $2 + 20 | 0; //@line 6245
   $10 = HEAP32[$9 >> 2] | 0; //@line 6246
   $14 = $10; //@line 6249
   if (($12 - $10 | 0) >>> 0 < $1 >>> 0) {
    $$1 = FUNCTION_TABLE_iiii[HEAP32[$2 + 36 >> 2] & 7]($2, $0, $1) | 0; //@line 6254
    break;
   }
   L10 : do {
    if ((HEAP8[$2 + 75 >> 0] | 0) > -1) {
     $$038 = $1; //@line 6262
     while (1) {
      if (!$$038) {
       $$139 = 0; //@line 6266
       $$141 = $0; //@line 6266
       $$143 = $1; //@line 6266
       $31 = $14; //@line 6266
       break L10;
      }
      $22 = $$038 + -1 | 0; //@line 6269
      if ((HEAP8[$0 + $22 >> 0] | 0) == 10) {
       break;
      } else {
       $$038 = $22; //@line 6276
      }
     }
     $28 = FUNCTION_TABLE_iiii[HEAP32[$2 + 36 >> 2] & 7]($2, $0, $$038) | 0; //@line 6281
     if ($28 >>> 0 < $$038 >>> 0) {
      $$1 = $28; //@line 6284
      break L5;
     }
     $$139 = $$038; //@line 6290
     $$141 = $0 + $$038 | 0; //@line 6290
     $$143 = $1 - $$038 | 0; //@line 6290
     $31 = HEAP32[$9 >> 2] | 0; //@line 6290
    } else {
     $$139 = 0; //@line 6292
     $$141 = $0; //@line 6292
     $$143 = $1; //@line 6292
     $31 = $14; //@line 6292
    }
   } while (0);
   _memcpy($31 | 0, $$141 | 0, $$143 | 0) | 0; //@line 6295
   HEAP32[$9 >> 2] = (HEAP32[$9 >> 2] | 0) + $$143; //@line 6298
   $$1 = $$139 + $$143 | 0; //@line 6300
  }
 } while (0);
 return $$1 | 0; //@line 6303
}
function _equeue_dealloc__async_cb($0) {
 $0 = $0 | 0;
 var $$02329$i = 0, $$02330$i = 0, $$025$i = 0, $$sink$in$i = 0, $$sink21$i = 0, $11 = 0, $12 = 0, $13 = 0, $15 = 0, $16 = 0, $2 = 0, $23 = 0, $4 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0;
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 11401
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 11403
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 11405
 $7 = $2 + 156 | 0; //@line 11406
 _equeue_mutex_lock($7); //@line 11407
 $8 = $2 + 24 | 0; //@line 11408
 $9 = HEAP32[$8 >> 2] | 0; //@line 11409
 L3 : do {
  if (!$9) {
   $$02329$i = $8; //@line 11413
  } else {
   $11 = HEAP32[$6 >> 2] | 0; //@line 11415
   $$025$i = $8; //@line 11416
   $13 = $9; //@line 11416
   while (1) {
    $12 = HEAP32[$13 >> 2] | 0; //@line 11418
    if ($12 >>> 0 >= $11 >>> 0) {
     break;
    }
    $15 = $13 + 8 | 0; //@line 11423
    $16 = HEAP32[$15 >> 2] | 0; //@line 11424
    if (!$16) {
     $$02329$i = $15; //@line 11427
     break L3;
    } else {
     $$025$i = $15; //@line 11430
     $13 = $16; //@line 11430
    }
   }
   if (($12 | 0) == ($11 | 0)) {
    HEAP32[$4 + -24 >> 2] = $13; //@line 11436
    $$02330$i = $$025$i; //@line 11439
    $$sink$in$i = (HEAP32[$$025$i >> 2] | 0) + 8 | 0; //@line 11439
    $$sink21$i = HEAP32[$$sink$in$i >> 2] | 0; //@line 11440
    $23 = $4 + -28 | 0; //@line 11441
    HEAP32[$23 >> 2] = $$sink21$i; //@line 11442
    HEAP32[$$02330$i >> 2] = $6; //@line 11443
    _equeue_mutex_unlock($7); //@line 11444
    return;
   } else {
    $$02329$i = $$025$i; //@line 11447
   }
  }
 } while (0);
 HEAP32[$4 + -24 >> 2] = 0; //@line 11452
 $$02330$i = $$02329$i; //@line 11453
 $$sink$in$i = $$02329$i; //@line 11453
 $$sink21$i = HEAP32[$$sink$in$i >> 2] | 0; //@line 11454
 $23 = $4 + -28 | 0; //@line 11455
 HEAP32[$23 >> 2] = $$sink21$i; //@line 11456
 HEAP32[$$02330$i >> 2] = $6; //@line 11457
 _equeue_mutex_unlock($7); //@line 11458
 return;
}
function __ZN4mbed11InterruptIn4fallENS_8CallbackIFvvEEE__async_cb_29($0) {
 $0 = $0 | 0;
 var $$phi$trans$insert = 0, $$pre10 = 0, $10 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx4 = 0, sp = 0;
 sp = STACKTOP; //@line 1398
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 1402
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 1404
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 1406
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 1408
 $$phi$trans$insert = (HEAP32[$0 + 4 >> 2] | 0) + 12 | 0; //@line 1409
 $$pre10 = HEAP32[$$phi$trans$insert >> 2] | 0; //@line 1410
 if (!$$pre10) {
  HEAP32[$4 >> 2] = 0; //@line 1413
  _gpio_irq_set($10 + 28 | 0, 2, 0); //@line 1415
  return;
 }
 $13 = HEAP32[$$pre10 + 4 >> 2] | 0; //@line 1419
 $ReallocAsyncCtx4 = _emscripten_realloc_async_context(20) | 0; //@line 1420
 FUNCTION_TABLE_vii[$13 & 3]($6, $8); //@line 1421
 if (___async) {
  HEAP32[$ReallocAsyncCtx4 >> 2] = 20; //@line 1424
  $14 = $ReallocAsyncCtx4 + 4 | 0; //@line 1425
  HEAP32[$14 >> 2] = $$phi$trans$insert; //@line 1426
  $15 = $ReallocAsyncCtx4 + 8 | 0; //@line 1427
  HEAP32[$15 >> 2] = $4; //@line 1428
  $16 = $ReallocAsyncCtx4 + 12 | 0; //@line 1429
  HEAP32[$16 >> 2] = $8; //@line 1430
  $17 = $ReallocAsyncCtx4 + 16 | 0; //@line 1431
  HEAP32[$17 >> 2] = $10; //@line 1432
  sp = STACKTOP; //@line 1433
  return;
 }
 ___async_unwind = 0; //@line 1436
 HEAP32[$ReallocAsyncCtx4 >> 2] = 20; //@line 1437
 $14 = $ReallocAsyncCtx4 + 4 | 0; //@line 1438
 HEAP32[$14 >> 2] = $$phi$trans$insert; //@line 1439
 $15 = $ReallocAsyncCtx4 + 8 | 0; //@line 1440
 HEAP32[$15 >> 2] = $4; //@line 1441
 $16 = $ReallocAsyncCtx4 + 12 | 0; //@line 1442
 HEAP32[$16 >> 2] = $8; //@line 1443
 $17 = $ReallocAsyncCtx4 + 16 | 0; //@line 1444
 HEAP32[$17 >> 2] = $10; //@line 1445
 sp = STACKTOP; //@line 1446
 return;
}
function __ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_35($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $25 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 1835
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 1839
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 1841
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 1843
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 1845
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 1847
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 1849
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 1851
 $18 = HEAP8[$0 + 36 >> 0] & 1; //@line 1854
 $25 = (HEAP32[$0 + 4 >> 2] | 0) + 8 | 0; //@line 1855
 do {
  if ($25 >>> 0 < $4 >>> 0) {
   if (!(HEAP8[$6 >> 0] | 0)) {
    if ((HEAP32[$8 >> 2] | 0) == 1) {
     if ((HEAP32[$10 >> 2] | 0) == 1) {
      break;
     }
    }
    $ReallocAsyncCtx2 = _emscripten_realloc_async_context(40) | 0; //@line 1871
    __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($25, $12, $14, $16, $18); //@line 1872
    if (!___async) {
     ___async_unwind = 0; //@line 1875
    }
    HEAP32[$ReallocAsyncCtx2 >> 2] = 100; //@line 1877
    HEAP32[$ReallocAsyncCtx2 + 4 >> 2] = $25; //@line 1879
    HEAP32[$ReallocAsyncCtx2 + 8 >> 2] = $4; //@line 1881
    HEAP32[$ReallocAsyncCtx2 + 12 >> 2] = $6; //@line 1883
    HEAP32[$ReallocAsyncCtx2 + 16 >> 2] = $8; //@line 1885
    HEAP32[$ReallocAsyncCtx2 + 20 >> 2] = $10; //@line 1887
    HEAP32[$ReallocAsyncCtx2 + 24 >> 2] = $12; //@line 1889
    HEAP32[$ReallocAsyncCtx2 + 28 >> 2] = $14; //@line 1891
    HEAP32[$ReallocAsyncCtx2 + 32 >> 2] = $16; //@line 1893
    HEAP8[$ReallocAsyncCtx2 + 36 >> 0] = $18 & 1; //@line 1896
    sp = STACKTOP; //@line 1897
    return;
   }
  }
 } while (0);
 return;
}
function _main__async_cb_47($0) {
 $0 = $0 | 0;
 var $2 = 0, $5 = 0, $6 = 0, $7 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx4 = 0, $ReallocAsyncCtx7 = 0, sp = 0;
 sp = STACKTOP; //@line 2739
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 2741
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 2743
 if (!$AsyncRetVal) {
  $ReallocAsyncCtx7 = _emscripten_realloc_async_context(8) | 0; //@line 2746
  $6 = _equeue_alloc(4388, 32) | 0; //@line 2747
  if (___async) {
   HEAP32[$ReallocAsyncCtx7 >> 2] = 59; //@line 2750
   $7 = $ReallocAsyncCtx7 + 4 | 0; //@line 2751
   HEAP32[$7 >> 2] = $2; //@line 2752
   sp = STACKTOP; //@line 2753
   return;
  }
  HEAP32[___async_retval >> 2] = $6; //@line 2757
  ___async_unwind = 0; //@line 2758
  HEAP32[$ReallocAsyncCtx7 >> 2] = 59; //@line 2759
  $7 = $ReallocAsyncCtx7 + 4 | 0; //@line 2760
  HEAP32[$7 >> 2] = $2; //@line 2761
  sp = STACKTOP; //@line 2762
  return;
 } else {
  HEAP32[$AsyncRetVal >> 2] = 2; //@line 2765
  _equeue_event_delay($AsyncRetVal, 1e3); //@line 2766
  _equeue_event_period($AsyncRetVal, 1e3); //@line 2767
  _equeue_event_dtor($AsyncRetVal, 56); //@line 2768
  $ReallocAsyncCtx4 = _emscripten_realloc_async_context(8) | 0; //@line 2769
  _equeue_post(4388, 57, $AsyncRetVal) | 0; //@line 2770
  if (___async) {
   HEAP32[$ReallocAsyncCtx4 >> 2] = 58; //@line 2773
   $5 = $ReallocAsyncCtx4 + 4 | 0; //@line 2774
   HEAP32[$5 >> 2] = $2; //@line 2775
   sp = STACKTOP; //@line 2776
   return;
  }
  ___async_unwind = 0; //@line 2779
  HEAP32[$ReallocAsyncCtx4 >> 2] = 58; //@line 2780
  $5 = $ReallocAsyncCtx4 + 4 | 0; //@line 2781
  HEAP32[$5 >> 2] = $2; //@line 2782
  sp = STACKTOP; //@line 2783
  return;
 }
}
function ___overflow($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0 = 0, $10 = 0, $12 = 0, $13 = 0, $2 = 0, $20 = 0, $21 = 0, $3 = 0, $4 = 0, $5 = 0, $9 = 0, $AsyncCtx = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 6111
 STACKTOP = STACKTOP + 16 | 0; //@line 6112
 $2 = sp; //@line 6113
 $3 = $1 & 255; //@line 6114
 HEAP8[$2 >> 0] = $3; //@line 6115
 $4 = $0 + 16 | 0; //@line 6116
 $5 = HEAP32[$4 >> 2] | 0; //@line 6117
 if (!$5) {
  if (!(___towrite($0) | 0)) {
   $12 = HEAP32[$4 >> 2] | 0; //@line 6124
   label = 4; //@line 6125
  } else {
   $$0 = -1; //@line 6127
  }
 } else {
  $12 = $5; //@line 6130
  label = 4; //@line 6131
 }
 do {
  if ((label | 0) == 4) {
   $9 = $0 + 20 | 0; //@line 6135
   $10 = HEAP32[$9 >> 2] | 0; //@line 6136
   if ($10 >>> 0 < $12 >>> 0) {
    $13 = $1 & 255; //@line 6139
    if (($13 | 0) != (HEAP8[$0 + 75 >> 0] | 0)) {
     HEAP32[$9 >> 2] = $10 + 1; //@line 6146
     HEAP8[$10 >> 0] = $3; //@line 6147
     $$0 = $13; //@line 6148
     break;
    }
   }
   $20 = HEAP32[$0 + 36 >> 2] | 0; //@line 6153
   $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 6154
   $21 = FUNCTION_TABLE_iiii[$20 & 7]($0, $2, 1) | 0; //@line 6155
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 76; //@line 6158
    HEAP32[$AsyncCtx + 4 >> 2] = $2; //@line 6160
    sp = STACKTOP; //@line 6161
    STACKTOP = sp; //@line 6162
    return 0; //@line 6162
   }
   _emscripten_free_async_context($AsyncCtx | 0); //@line 6164
   if (($21 | 0) == 1) {
    $$0 = HEAPU8[$2 >> 0] | 0; //@line 6169
   } else {
    $$0 = -1; //@line 6171
   }
  }
 } while (0);
 STACKTOP = sp; //@line 6175
 return $$0 | 0; //@line 6175
}
function _memset(ptr, value, num) {
 ptr = ptr | 0;
 value = value | 0;
 num = num | 0;
 var end = 0, aligned_end = 0, block_aligned_end = 0, value4 = 0;
 end = ptr + num | 0; //@line 3331
 value = value & 255; //@line 3333
 if ((num | 0) >= 67) {
  while (ptr & 3) {
   HEAP8[ptr >> 0] = value; //@line 3336
   ptr = ptr + 1 | 0; //@line 3337
  }
  aligned_end = end & -4 | 0; //@line 3340
  block_aligned_end = aligned_end - 64 | 0; //@line 3341
  value4 = value | value << 8 | value << 16 | value << 24; //@line 3342
  while ((ptr | 0) <= (block_aligned_end | 0)) {
   HEAP32[ptr >> 2] = value4; //@line 3345
   HEAP32[ptr + 4 >> 2] = value4; //@line 3346
   HEAP32[ptr + 8 >> 2] = value4; //@line 3347
   HEAP32[ptr + 12 >> 2] = value4; //@line 3348
   HEAP32[ptr + 16 >> 2] = value4; //@line 3349
   HEAP32[ptr + 20 >> 2] = value4; //@line 3350
   HEAP32[ptr + 24 >> 2] = value4; //@line 3351
   HEAP32[ptr + 28 >> 2] = value4; //@line 3352
   HEAP32[ptr + 32 >> 2] = value4; //@line 3353
   HEAP32[ptr + 36 >> 2] = value4; //@line 3354
   HEAP32[ptr + 40 >> 2] = value4; //@line 3355
   HEAP32[ptr + 44 >> 2] = value4; //@line 3356
   HEAP32[ptr + 48 >> 2] = value4; //@line 3357
   HEAP32[ptr + 52 >> 2] = value4; //@line 3358
   HEAP32[ptr + 56 >> 2] = value4; //@line 3359
   HEAP32[ptr + 60 >> 2] = value4; //@line 3360
   ptr = ptr + 64 | 0; //@line 3361
  }
  while ((ptr | 0) < (aligned_end | 0)) {
   HEAP32[ptr >> 2] = value4; //@line 3365
   ptr = ptr + 4 | 0; //@line 3366
  }
 }
 while ((ptr | 0) < (end | 0)) {
  HEAP8[ptr >> 0] = value; //@line 3371
  ptr = ptr + 1 | 0; //@line 3372
 }
 return end - num | 0; //@line 3374
}
function __ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $16 = 0, $21 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 1772
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 1776
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 1778
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 1780
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 1782
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 1784
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 1786
 $16 = HEAP8[$0 + 32 >> 0] & 1; //@line 1789
 $21 = (HEAP32[$0 + 4 >> 2] | 0) + 8 | 0; //@line 1790
 if ($21 >>> 0 < $4 >>> 0) {
  if (!(HEAP8[$6 >> 0] | 0)) {
   if ((HEAP32[$8 >> 2] | 0) != 1) {
    $ReallocAsyncCtx = _emscripten_realloc_async_context(36) | 0; //@line 1799
    __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($21, $10, $12, $14, $16); //@line 1800
    if (!___async) {
     ___async_unwind = 0; //@line 1803
    }
    HEAP32[$ReallocAsyncCtx >> 2] = 101; //@line 1805
    HEAP32[$ReallocAsyncCtx + 4 >> 2] = $21; //@line 1807
    HEAP32[$ReallocAsyncCtx + 8 >> 2] = $4; //@line 1809
    HEAP32[$ReallocAsyncCtx + 12 >> 2] = $6; //@line 1811
    HEAP32[$ReallocAsyncCtx + 16 >> 2] = $8; //@line 1813
    HEAP32[$ReallocAsyncCtx + 20 >> 2] = $10; //@line 1815
    HEAP32[$ReallocAsyncCtx + 24 >> 2] = $12; //@line 1817
    HEAP32[$ReallocAsyncCtx + 28 >> 2] = $14; //@line 1819
    HEAP8[$ReallocAsyncCtx + 32 >> 0] = $16 & 1; //@line 1822
    sp = STACKTOP; //@line 1823
    return;
   }
  }
 }
 return;
}
function __ZN4mbed11InterruptIn4fallENS_8CallbackIFvvEEE__async_cb($0) {
 $0 = $0 | 0;
 var $$pre = 0, $10 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $2 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 1332
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 1334
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 1336
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 1338
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 1340
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 1342
 $$pre = HEAP32[$2 >> 2] | 0; //@line 1343
 if (!$$pre) {
  HEAP32[$4 >> 2] = 0; //@line 1346
  _gpio_irq_set($10 + 28 | 0, 2, 1); //@line 1348
  return;
 }
 $13 = HEAP32[$$pre + 4 >> 2] | 0; //@line 1352
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(16) | 0; //@line 1353
 FUNCTION_TABLE_vii[$13 & 3]($6, $8); //@line 1354
 if (___async) {
  HEAP32[$ReallocAsyncCtx2 >> 2] = 18; //@line 1357
  $14 = $ReallocAsyncCtx2 + 4 | 0; //@line 1358
  HEAP32[$14 >> 2] = $2; //@line 1359
  $15 = $ReallocAsyncCtx2 + 8 | 0; //@line 1360
  HEAP32[$15 >> 2] = $4; //@line 1361
  $16 = $ReallocAsyncCtx2 + 12 | 0; //@line 1362
  HEAP32[$16 >> 2] = $10; //@line 1363
  sp = STACKTOP; //@line 1364
  return;
 }
 ___async_unwind = 0; //@line 1367
 HEAP32[$ReallocAsyncCtx2 >> 2] = 18; //@line 1368
 $14 = $ReallocAsyncCtx2 + 4 | 0; //@line 1369
 HEAP32[$14 >> 2] = $2; //@line 1370
 $15 = $ReallocAsyncCtx2 + 8 | 0; //@line 1371
 HEAP32[$15 >> 2] = $4; //@line 1372
 $16 = $ReallocAsyncCtx2 + 12 | 0; //@line 1373
 HEAP32[$16 >> 2] = $10; //@line 1374
 sp = STACKTOP; //@line 1375
 return;
}
function _equeue_create($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0 = 0, $$032$i = 0, $$033$i = 0, $2 = 0, $20 = 0, $22 = 0, $26 = 0, $29 = 0, $5 = 0, $6 = 0;
 $2 = _malloc($1) | 0; //@line 444
 if (!$2) {
  $$0 = -1; //@line 447
  return $$0 | 0; //@line 448
 }
 HEAP32[$0 + 12 >> 2] = $2; //@line 451
 $5 = $0 + 20 | 0; //@line 452
 HEAP32[$5 >> 2] = 0; //@line 453
 $6 = $0 + 16 | 0; //@line 454
 HEAP32[$6 >> 2] = 0; //@line 455
 if ($1 | 0) {
  $$033$i = $1; //@line 458
  $22 = 0; //@line 458
  do {
   $22 = $22 + 1 | 0; //@line 460
   $$033$i = $$033$i >>> 1; //@line 461
  } while (($$033$i | 0) != 0);
  HEAP32[$6 >> 2] = $22; //@line 469
 }
 HEAP32[$0 + 24 >> 2] = 0; //@line 472
 HEAP32[$0 + 28 >> 2] = $1; //@line 474
 HEAP32[$0 + 32 >> 2] = $2; //@line 476
 HEAP32[$0 >> 2] = 0; //@line 477
 HEAP32[$0 + 4 >> 2] = _equeue_tick() | 0; //@line 480
 HEAP8[$0 + 9 >> 0] = 0; //@line 482
 HEAP8[$0 + 8 >> 0] = 0; //@line 484
 HEAP8[$0 + 36 >> 0] = 0; //@line 486
 HEAP32[$0 + 40 >> 2] = 0; //@line 488
 HEAP32[$0 + 44 >> 2] = 0; //@line 490
 $20 = _equeue_sema_create($0 + 48 | 0) | 0; //@line 492
 if (($20 | 0) < 0) {
  $$032$i = $20; //@line 495
 } else {
  $26 = _equeue_mutex_create($0 + 128 | 0) | 0; //@line 498
  if (($26 | 0) < 0) {
   $$032$i = $26; //@line 501
  } else {
   $29 = _equeue_mutex_create($0 + 156 | 0) | 0; //@line 504
   $$032$i = ($29 | 0) < 0 ? $29 : 0; //@line 507
  }
 }
 HEAP32[$5 >> 2] = $2; //@line 510
 $$0 = $$032$i; //@line 511
 return $$0 | 0; //@line 512
}
function _wcrtomb($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$0 = 0;
 do {
  if (!$0) {
   $$0 = 1; //@line 9139
  } else {
   if ($1 >>> 0 < 128) {
    HEAP8[$0 >> 0] = $1; //@line 9144
    $$0 = 1; //@line 9145
    break;
   }
   if (!(HEAP32[HEAP32[(___pthread_self_910() | 0) + 188 >> 2] >> 2] | 0)) {
    if (($1 & -128 | 0) == 57216) {
     HEAP8[$0 >> 0] = $1; //@line 9158
     $$0 = 1; //@line 9159
     break;
    } else {
     HEAP32[(___errno_location() | 0) >> 2] = 84; //@line 9163
     $$0 = -1; //@line 9164
     break;
    }
   }
   if ($1 >>> 0 < 2048) {
    HEAP8[$0 >> 0] = $1 >>> 6 | 192; //@line 9174
    HEAP8[$0 + 1 >> 0] = $1 & 63 | 128; //@line 9178
    $$0 = 2; //@line 9179
    break;
   }
   if ($1 >>> 0 < 55296 | ($1 & -8192 | 0) == 57344) {
    HEAP8[$0 >> 0] = $1 >>> 12 | 224; //@line 9191
    HEAP8[$0 + 1 >> 0] = $1 >>> 6 & 63 | 128; //@line 9197
    HEAP8[$0 + 2 >> 0] = $1 & 63 | 128; //@line 9201
    $$0 = 3; //@line 9202
    break;
   }
   if (($1 + -65536 | 0) >>> 0 < 1048576) {
    HEAP8[$0 >> 0] = $1 >>> 18 | 240; //@line 9212
    HEAP8[$0 + 1 >> 0] = $1 >>> 12 & 63 | 128; //@line 9218
    HEAP8[$0 + 2 >> 0] = $1 >>> 6 & 63 | 128; //@line 9224
    HEAP8[$0 + 3 >> 0] = $1 & 63 | 128; //@line 9228
    $$0 = 4; //@line 9229
    break;
   } else {
    HEAP32[(___errno_location() | 0) >> 2] = 84; //@line 9233
    $$0 = -1; //@line 9234
    break;
   }
  }
 } while (0);
 return $$0 | 0; //@line 9239
}
function __ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv__async_cb_50($0) {
 $0 = $0 | 0;
 var $15 = 0, $16 = 0, $2 = 0, $4 = 0, $6 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx = 0, dest = 0, sp = 0, stop = 0;
 sp = STACKTOP; //@line 2876
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 2878
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 2880
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 2882
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 2884
 if (!$AsyncRetVal) {
  HEAP8[___async_retval >> 0] = 0; //@line 2889
  return;
 }
 dest = $2 + 4 | 0; //@line 2893
 stop = dest + 52 | 0; //@line 2893
 do {
  HEAP32[dest >> 2] = 0; //@line 2893
  dest = dest + 4 | 0; //@line 2893
 } while ((dest | 0) < (stop | 0));
 HEAP32[$2 >> 2] = $AsyncRetVal; //@line 2894
 HEAP32[$2 + 8 >> 2] = $4; //@line 2896
 HEAP32[$2 + 12 >> 2] = -1; //@line 2898
 HEAP32[$2 + 48 >> 2] = 1; //@line 2900
 $15 = HEAP32[(HEAP32[$AsyncRetVal >> 2] | 0) + 28 >> 2] | 0; //@line 2903
 $16 = HEAP32[$6 >> 2] | 0; //@line 2904
 $ReallocAsyncCtx = _emscripten_realloc_async_context(16) | 0; //@line 2905
 FUNCTION_TABLE_viiii[$15 & 3]($AsyncRetVal, $2, $16, 1); //@line 2906
 if (!___async) {
  ___async_unwind = 0; //@line 2909
 }
 HEAP32[$ReallocAsyncCtx >> 2] = 86; //@line 2911
 HEAP32[$ReallocAsyncCtx + 4 >> 2] = $2; //@line 2913
 HEAP32[$ReallocAsyncCtx + 8 >> 2] = $6; //@line 2915
 HEAP32[$ReallocAsyncCtx + 12 >> 2] = $2; //@line 2917
 sp = STACKTOP; //@line 2918
 return;
}
function __ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_36($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $17 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 1908
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 1912
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 1914
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 1916
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 1918
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 1920
 $14 = HEAP8[$0 + 28 >> 0] & 1; //@line 1923
 $17 = (HEAP32[$0 + 4 >> 2] | 0) + 8 | 0; //@line 1924
 if ($17 >>> 0 < $4 >>> 0) {
  if (!(HEAP8[$6 >> 0] | 0)) {
   $ReallocAsyncCtx3 = _emscripten_realloc_async_context(32) | 0; //@line 1930
   __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($17, $8, $10, $12, $14); //@line 1931
   if (!___async) {
    ___async_unwind = 0; //@line 1934
   }
   HEAP32[$ReallocAsyncCtx3 >> 2] = 99; //@line 1936
   HEAP32[$ReallocAsyncCtx3 + 4 >> 2] = $17; //@line 1938
   HEAP32[$ReallocAsyncCtx3 + 8 >> 2] = $4; //@line 1940
   HEAP32[$ReallocAsyncCtx3 + 12 >> 2] = $6; //@line 1942
   HEAP32[$ReallocAsyncCtx3 + 16 >> 2] = $8; //@line 1944
   HEAP32[$ReallocAsyncCtx3 + 20 >> 2] = $10; //@line 1946
   HEAP32[$ReallocAsyncCtx3 + 24 >> 2] = $12; //@line 1948
   HEAP8[$ReallocAsyncCtx3 + 28 >> 0] = $14 & 1; //@line 1951
   sp = STACKTOP; //@line 1952
   return;
  }
 }
 return;
}
function _main__async_cb($0) {
 $0 = $0 | 0;
 var $11 = 0, $12 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx2 = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 2462
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 2467
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 2469
 if (!(HEAP8[$0 + 4 >> 0] & 1)) {
  $8 = (HEAP32[$4 >> 2] | 0) + -1 | 0; //@line 2472
  HEAP32[$4 >> 2] = $8; //@line 2473
  if (!$8) {
   $11 = HEAP32[$4 + 24 >> 2] | 0; //@line 2477
   $ReallocAsyncCtx2 = _emscripten_realloc_async_context(8) | 0; //@line 2478
   FUNCTION_TABLE_vi[$11 & 127]($6); //@line 2479
   if (___async) {
    HEAP32[$ReallocAsyncCtx2 >> 2] = 63; //@line 2482
    $12 = $ReallocAsyncCtx2 + 4 | 0; //@line 2483
    HEAP32[$12 >> 2] = $4; //@line 2484
    sp = STACKTOP; //@line 2485
    return;
   }
   ___async_unwind = 0; //@line 2488
   HEAP32[$ReallocAsyncCtx2 >> 2] = 63; //@line 2489
   $12 = $ReallocAsyncCtx2 + 4 | 0; //@line 2490
   HEAP32[$12 >> 2] = $4; //@line 2491
   sp = STACKTOP; //@line 2492
   return;
  }
 }
 $ReallocAsyncCtx3 = _emscripten_realloc_async_context(4) | 0; //@line 2496
 __ZN6events10EventQueue8dispatchEi(4388, -1); //@line 2497
 if (___async) {
  HEAP32[$ReallocAsyncCtx3 >> 2] = 65; //@line 2500
  sp = STACKTOP; //@line 2501
  return;
 }
 ___async_unwind = 0; //@line 2504
 HEAP32[$ReallocAsyncCtx3 >> 2] = 65; //@line 2505
 sp = STACKTOP; //@line 2506
 return;
}
function _fmt_u($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$010$lcssa$off0 = 0, $$012 = 0, $$09$lcssa = 0, $$0914 = 0, $$1$lcssa = 0, $$111 = 0, $10 = 0, $26 = 0, $8 = 0, $9 = 0, $8$looptemp = 0;
 if ($1 >>> 0 > 0 | ($1 | 0) == 0 & $0 >>> 0 > 4294967295) {
  $$0914 = $2; //@line 8023
  $8 = $0; //@line 8023
  $9 = $1; //@line 8023
  while (1) {
   $10 = ___uremdi3($8 | 0, $9 | 0, 10, 0) | 0; //@line 8025
   $$0914 = $$0914 + -1 | 0; //@line 8029
   HEAP8[$$0914 >> 0] = $10 & 255 | 48; //@line 8030
   $8$looptemp = $8;
   $8 = ___udivdi3($8 | 0, $9 | 0, 10, 0) | 0; //@line 8031
   if (!($9 >>> 0 > 9 | ($9 | 0) == 9 & $8$looptemp >>> 0 > 4294967295)) {
    break;
   } else {
    $9 = tempRet0; //@line 8039
   }
  }
  $$010$lcssa$off0 = $8; //@line 8044
  $$09$lcssa = $$0914; //@line 8044
 } else {
  $$010$lcssa$off0 = $0; //@line 8046
  $$09$lcssa = $2; //@line 8046
 }
 if (!$$010$lcssa$off0) {
  $$1$lcssa = $$09$lcssa; //@line 8050
 } else {
  $$012 = $$010$lcssa$off0; //@line 8052
  $$111 = $$09$lcssa; //@line 8052
  while (1) {
   $26 = $$111 + -1 | 0; //@line 8057
   HEAP8[$26 >> 0] = ($$012 >>> 0) % 10 | 0 | 48; //@line 8058
   if ($$012 >>> 0 < 10) {
    $$1$lcssa = $26; //@line 8062
    break;
   } else {
    $$012 = ($$012 >>> 0) / 10 | 0; //@line 8065
    $$111 = $26; //@line 8065
   }
  }
 }
 return $$1$lcssa | 0; //@line 8069
}
function __ZN6events5EventIFvvEE10event_postIPS1_EEiPNS2_5eventE($0) {
 $0 = $0 | 0;
 var $$0 = 0, $1 = 0, $13 = 0, $14 = 0, $2 = 0, $3 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 2384
 $1 = $0 + 4 | 0; //@line 2385
 $2 = HEAP32[$1 >> 2] | 0; //@line 2386
 $AsyncCtx3 = _emscripten_alloc_async_context(12, sp) | 0; //@line 2387
 $3 = _equeue_alloc($2, 4) | 0; //@line 2388
 if (___async) {
  HEAP32[$AsyncCtx3 >> 2] = 67; //@line 2391
  HEAP32[$AsyncCtx3 + 4 >> 2] = $0; //@line 2393
  HEAP32[$AsyncCtx3 + 8 >> 2] = $1; //@line 2395
  sp = STACKTOP; //@line 2396
  return 0; //@line 2397
 }
 _emscripten_free_async_context($AsyncCtx3 | 0); //@line 2399
 if (!$3) {
  $$0 = 0; //@line 2402
  return $$0 | 0; //@line 2403
 }
 HEAP32[$3 >> 2] = HEAP32[$0 + 28 >> 2]; //@line 2407
 _equeue_event_delay($3, HEAP32[$0 + 12 >> 2] | 0); //@line 2410
 _equeue_event_period($3, HEAP32[$0 + 16 >> 2] | 0); //@line 2413
 _equeue_event_dtor($3, 68); //@line 2414
 $13 = HEAP32[$1 >> 2] | 0; //@line 2415
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 2416
 $14 = _equeue_post($13, 69, $3) | 0; //@line 2417
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 70; //@line 2420
  sp = STACKTOP; //@line 2421
  return 0; //@line 2422
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 2424
 $$0 = $14; //@line 2425
 return $$0 | 0; //@line 2426
}
function __ZNK10__cxxabiv121__vmi_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $13 = 0, $2 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 11465
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 11467
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 11471
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 11473
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 11475
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 11477
 if (!(HEAP8[$2 >> 0] | 0)) {
  $13 = (HEAP32[$0 + 8 >> 2] | 0) + 8 | 0; //@line 11481
  if ($13 >>> 0 < $6 >>> 0) {
   $ReallocAsyncCtx = _emscripten_realloc_async_context(28) | 0; //@line 11484
   __ZNK10__cxxabiv122__base_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($13, $8, $10, $12); //@line 11485
   if (!___async) {
    ___async_unwind = 0; //@line 11488
   }
   HEAP32[$ReallocAsyncCtx >> 2] = 103; //@line 11490
   HEAP32[$ReallocAsyncCtx + 4 >> 2] = $2; //@line 11492
   HEAP32[$ReallocAsyncCtx + 8 >> 2] = $13; //@line 11494
   HEAP32[$ReallocAsyncCtx + 12 >> 2] = $6; //@line 11496
   HEAP32[$ReallocAsyncCtx + 16 >> 2] = $8; //@line 11498
   HEAP32[$ReallocAsyncCtx + 20 >> 2] = $10; //@line 11500
   HEAP32[$ReallocAsyncCtx + 24 >> 2] = $12; //@line 11502
   sp = STACKTOP; //@line 11503
   return;
  }
 }
 return;
}
function _equeue_create_inplace($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$032 = 0, $$033 = 0, $19 = 0, $21 = 0, $25 = 0, $28 = 0, $5 = 0;
 HEAP32[$0 + 12 >> 2] = $2; //@line 522
 HEAP32[$0 + 20 >> 2] = 0; //@line 524
 $5 = $0 + 16 | 0; //@line 525
 HEAP32[$5 >> 2] = 0; //@line 526
 if ($1 | 0) {
  $$033 = $1; //@line 529
  $21 = 0; //@line 529
  do {
   $21 = $21 + 1 | 0; //@line 531
   $$033 = $$033 >>> 1; //@line 532
  } while (($$033 | 0) != 0);
  HEAP32[$5 >> 2] = $21; //@line 540
 }
 HEAP32[$0 + 24 >> 2] = 0; //@line 543
 HEAP32[$0 + 28 >> 2] = $1; //@line 545
 HEAP32[$0 + 32 >> 2] = $2; //@line 547
 HEAP32[$0 >> 2] = 0; //@line 548
 HEAP32[$0 + 4 >> 2] = _equeue_tick() | 0; //@line 551
 HEAP8[$0 + 9 >> 0] = 0; //@line 553
 HEAP8[$0 + 8 >> 0] = 0; //@line 555
 HEAP8[$0 + 36 >> 0] = 0; //@line 557
 HEAP32[$0 + 40 >> 2] = 0; //@line 559
 HEAP32[$0 + 44 >> 2] = 0; //@line 561
 $19 = _equeue_sema_create($0 + 48 | 0) | 0; //@line 563
 if (($19 | 0) < 0) {
  $$032 = $19; //@line 566
  return $$032 | 0; //@line 567
 }
 $25 = _equeue_mutex_create($0 + 128 | 0) | 0; //@line 570
 if (($25 | 0) < 0) {
  $$032 = $25; //@line 573
  return $$032 | 0; //@line 574
 }
 $28 = _equeue_mutex_create($0 + 156 | 0) | 0; //@line 577
 $$032 = ($28 | 0) < 0 ? $28 : 0; //@line 580
 return $$032 | 0; //@line 581
}
function _strlen($0) {
 $0 = $0 | 0;
 var $$0 = 0, $$015$lcssa = 0, $$01519 = 0, $$1$lcssa = 0, $$pn = 0, $$sink = 0, $1 = 0, $10 = 0, $19 = 0, $23 = 0, $6 = 0, label = 0;
 $1 = $0; //@line 5977
 L1 : do {
  if (!($1 & 3)) {
   $$015$lcssa = $0; //@line 5982
   label = 4; //@line 5983
  } else {
   $$01519 = $0; //@line 5985
   $23 = $1; //@line 5985
   while (1) {
    if (!(HEAP8[$$01519 >> 0] | 0)) {
     $$sink = $23; //@line 5990
     break L1;
    }
    $6 = $$01519 + 1 | 0; //@line 5993
    $23 = $6; //@line 5994
    if (!($23 & 3)) {
     $$015$lcssa = $6; //@line 5998
     label = 4; //@line 5999
     break;
    } else {
     $$01519 = $6; //@line 6002
    }
   }
  }
 } while (0);
 if ((label | 0) == 4) {
  $$0 = $$015$lcssa; //@line 6008
  while (1) {
   $10 = HEAP32[$$0 >> 2] | 0; //@line 6010
   if (!(($10 & -2139062144 ^ -2139062144) & $10 + -16843009)) {
    $$0 = $$0 + 4 | 0; //@line 6018
   } else {
    break;
   }
  }
  if (!(($10 & 255) << 24 >> 24)) {
   $$1$lcssa = $$0; //@line 6026
  } else {
   $$pn = $$0; //@line 6028
   while (1) {
    $19 = $$pn + 1 | 0; //@line 6030
    if (!(HEAP8[$19 >> 0] | 0)) {
     $$1$lcssa = $19; //@line 6034
     break;
    } else {
     $$pn = $19; //@line 6037
    }
   }
  }
  $$sink = $$1$lcssa; //@line 6042
 }
 return $$sink - $1 | 0; //@line 6045
}
function __ZN4mbed11InterruptIn12_irq_handlerEj14gpio_irq_event($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $12 = 0, $2 = 0, $4 = 0, $7 = 0, $9 = 0, $AsyncCtx = 0, $AsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 176
 $2 = $0; //@line 177
 L1 : do {
  switch ($1 | 0) {
  case 1:
   {
    $4 = HEAP32[$2 + 52 >> 2] | 0; //@line 182
    if ($4 | 0) {
     $7 = HEAP32[$4 >> 2] | 0; //@line 186
     $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 187
     FUNCTION_TABLE_vi[$7 & 127]($2 + 40 | 0); //@line 188
     if (___async) {
      HEAP32[$AsyncCtx >> 2] = 15; //@line 191
      sp = STACKTOP; //@line 192
      return;
     } else {
      _emscripten_free_async_context($AsyncCtx | 0); //@line 195
      break L1;
     }
    }
    break;
   }
  case 2:
   {
    $9 = HEAP32[$2 + 68 >> 2] | 0; //@line 203
    if ($9 | 0) {
     $12 = HEAP32[$9 >> 2] | 0; //@line 207
     $AsyncCtx2 = _emscripten_alloc_async_context(4, sp) | 0; //@line 208
     FUNCTION_TABLE_vi[$12 & 127]($2 + 56 | 0); //@line 209
     if (___async) {
      HEAP32[$AsyncCtx2 >> 2] = 16; //@line 212
      sp = STACKTOP; //@line 213
      return;
     } else {
      _emscripten_free_async_context($AsyncCtx2 | 0); //@line 216
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
function __ZNK10__cxxabiv117__class_type_info29process_static_type_above_dstEPNS_19__dynamic_cast_infoEPKvS4_i($0, $1, $2, $3, $4) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 var $10 = 0, $11 = 0, $21 = 0, $22 = 0, $28 = 0, $30 = 0;
 HEAP8[$1 + 53 >> 0] = 1; //@line 9936
 do {
  if ((HEAP32[$1 + 4 >> 2] | 0) == ($3 | 0)) {
   HEAP8[$1 + 52 >> 0] = 1; //@line 9943
   $10 = $1 + 16 | 0; //@line 9944
   $11 = HEAP32[$10 >> 2] | 0; //@line 9945
   if (!$11) {
    HEAP32[$10 >> 2] = $2; //@line 9948
    HEAP32[$1 + 24 >> 2] = $4; //@line 9950
    HEAP32[$1 + 36 >> 2] = 1; //@line 9952
    if (!(($4 | 0) == 1 ? (HEAP32[$1 + 48 >> 2] | 0) == 1 : 0)) {
     break;
    }
    HEAP8[$1 + 54 >> 0] = 1; //@line 9962
    break;
   }
   if (($11 | 0) != ($2 | 0)) {
    $30 = $1 + 36 | 0; //@line 9967
    HEAP32[$30 >> 2] = (HEAP32[$30 >> 2] | 0) + 1; //@line 9970
    HEAP8[$1 + 54 >> 0] = 1; //@line 9972
    break;
   }
   $21 = $1 + 24 | 0; //@line 9975
   $22 = HEAP32[$21 >> 2] | 0; //@line 9976
   if (($22 | 0) == 2) {
    HEAP32[$21 >> 2] = $4; //@line 9979
    $28 = $4; //@line 9980
   } else {
    $28 = $22; //@line 9982
   }
   if (($28 | 0) == 1 ? (HEAP32[$1 + 48 >> 2] | 0) == 1 : 0) {
    HEAP8[$1 + 54 >> 0] = 1; //@line 9991
   }
  }
 } while (0);
 return;
}
function __ZN4mbed11InterruptIn4fallENS_8CallbackIFvvEEE__async_cb_30($0) {
 $0 = $0 | 0;
 var $$pre$i$i4 = 0, $12 = 0, $13 = 0, $14 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx5 = 0, sp = 0;
 sp = STACKTOP; //@line 1452
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 1458
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 1460
 $$pre$i$i4 = HEAP32[HEAP32[$0 + 4 >> 2] >> 2] | 0; //@line 1461
 HEAP32[HEAP32[$0 + 8 >> 2] >> 2] = $$pre$i$i4; //@line 1462
 if (!$$pre$i$i4) {
  _gpio_irq_set($8 + 28 | 0, 2, 0); //@line 1466
  return;
 }
 $12 = HEAP32[$$pre$i$i4 + 8 >> 2] | 0; //@line 1471
 $ReallocAsyncCtx5 = _emscripten_realloc_async_context(12) | 0; //@line 1472
 FUNCTION_TABLE_vi[$12 & 127]($6); //@line 1473
 if (___async) {
  HEAP32[$ReallocAsyncCtx5 >> 2] = 21; //@line 1476
  $13 = $ReallocAsyncCtx5 + 4 | 0; //@line 1477
  HEAP32[$13 >> 2] = $6; //@line 1478
  $14 = $ReallocAsyncCtx5 + 8 | 0; //@line 1479
  HEAP32[$14 >> 2] = $8; //@line 1480
  sp = STACKTOP; //@line 1481
  return;
 }
 ___async_unwind = 0; //@line 1484
 HEAP32[$ReallocAsyncCtx5 >> 2] = 21; //@line 1485
 $13 = $ReallocAsyncCtx5 + 4 | 0; //@line 1486
 HEAP32[$13 >> 2] = $6; //@line 1487
 $14 = $ReallocAsyncCtx5 + 8 | 0; //@line 1488
 HEAP32[$14 >> 2] = $8; //@line 1489
 sp = STACKTOP; //@line 1490
 return;
}
function _puts($0) {
 $0 = $0 | 0;
 var $1 = 0, $11 = 0, $12 = 0, $17 = 0, $19 = 0, $22 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 9430
 $1 = HEAP32[77] | 0; //@line 9431
 if ((HEAP32[$1 + 76 >> 2] | 0) > -1) {
  $19 = ___lockfile($1) | 0; //@line 9437
 } else {
  $19 = 0; //@line 9439
 }
 do {
  if ((_fputs($0, $1) | 0) < 0) {
   $22 = -1; //@line 9445
  } else {
   if ((HEAP8[$1 + 75 >> 0] | 0) != 10) {
    $11 = $1 + 20 | 0; //@line 9451
    $12 = HEAP32[$11 >> 2] | 0; //@line 9452
    if ($12 >>> 0 < (HEAP32[$1 + 16 >> 2] | 0) >>> 0) {
     HEAP32[$11 >> 2] = $12 + 1; //@line 9458
     HEAP8[$12 >> 0] = 10; //@line 9459
     $22 = 0; //@line 9460
     break;
    }
   }
   $AsyncCtx = _emscripten_alloc_async_context(12, sp) | 0; //@line 9464
   $17 = ___overflow($1, 10) | 0; //@line 9465
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 80; //@line 9468
    HEAP32[$AsyncCtx + 4 >> 2] = $19; //@line 9470
    HEAP32[$AsyncCtx + 8 >> 2] = $1; //@line 9472
    sp = STACKTOP; //@line 9473
    return 0; //@line 9474
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 9476
    $22 = $17 >> 31; //@line 9478
    break;
   }
  }
 } while (0);
 if ($19 | 0) {
  ___unlockfile($1); //@line 9485
 }
 return $22 | 0; //@line 9487
}
function __ZN4mbed11InterruptInD0Ev($0) {
 $0 = $0 | 0;
 var $10 = 0, $14 = 0, $3 = 0, $7 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 107
 HEAP32[$0 >> 2] = 160; //@line 108
 _gpio_irq_free($0 + 28 | 0); //@line 110
 $3 = HEAP32[$0 + 68 >> 2] | 0; //@line 112
 do {
  if ($3 | 0) {
   $7 = HEAP32[$3 + 8 >> 2] | 0; //@line 118
   $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 119
   FUNCTION_TABLE_vi[$7 & 127]($0 + 56 | 0); //@line 120
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 13; //@line 123
    HEAP32[$AsyncCtx + 4 >> 2] = $0; //@line 125
    sp = STACKTOP; //@line 126
    return;
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 129
    break;
   }
  }
 } while (0);
 $10 = HEAP32[$0 + 52 >> 2] | 0; //@line 135
 if (!$10) {
  __ZdlPv($0); //@line 138
  return;
 }
 $14 = HEAP32[$10 + 8 >> 2] | 0; //@line 143
 $AsyncCtx3 = _emscripten_alloc_async_context(8, sp) | 0; //@line 144
 FUNCTION_TABLE_vi[$14 & 127]($0 + 40 | 0); //@line 145
 if (___async) {
  HEAP32[$AsyncCtx3 >> 2] = 14; //@line 148
  HEAP32[$AsyncCtx3 + 4 >> 2] = $0; //@line 150
  sp = STACKTOP; //@line 151
  return;
 }
 _emscripten_free_async_context($AsyncCtx3 | 0); //@line 154
 __ZdlPv($0); //@line 155
 return;
}
function __ZNK10__cxxabiv121__vmi_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb_2($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 11513
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 11519
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 11521
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 11523
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 11525
 if ((HEAP32[$0 + 4 >> 2] | 0) <= 1) {
  return;
 }
 $14 = (HEAP32[$0 + 8 >> 2] | 0) + 24 | 0; //@line 11530
 $ReallocAsyncCtx = _emscripten_realloc_async_context(28) | 0; //@line 11532
 __ZNK10__cxxabiv122__base_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($14, $6, $8, $10); //@line 11533
 if (!___async) {
  ___async_unwind = 0; //@line 11536
 }
 HEAP32[$ReallocAsyncCtx >> 2] = 103; //@line 11538
 HEAP32[$ReallocAsyncCtx + 4 >> 2] = $6 + 54; //@line 11540
 HEAP32[$ReallocAsyncCtx + 8 >> 2] = $14; //@line 11542
 HEAP32[$ReallocAsyncCtx + 12 >> 2] = $12; //@line 11544
 HEAP32[$ReallocAsyncCtx + 16 >> 2] = $6; //@line 11546
 HEAP32[$ReallocAsyncCtx + 20 >> 2] = $8; //@line 11548
 HEAP32[$ReallocAsyncCtx + 24 >> 2] = $10; //@line 11550
 sp = STACKTOP; //@line 11551
 return;
}
function __ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb($0) {
 $0 = $0 | 0;
 var $$037$off038 = 0, $$037$off039 = 0, $12 = 0, $17 = 0, $4 = 0, $6 = 0, $8 = 0, label = 0;
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 11296
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 11298
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 11300
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 11304
 if (!(HEAP8[HEAP32[$0 + 4 >> 2] >> 0] | 0)) {
  $$037$off038 = 4; //@line 11308
  label = 4; //@line 11309
 } else {
  if (!(HEAP8[HEAP32[$0 + 20 >> 2] >> 0] | 0)) {
   $$037$off038 = 3; //@line 11314
   label = 4; //@line 11315
  } else {
   $$037$off039 = 3; //@line 11317
  }
 }
 if ((label | 0) == 4) {
  HEAP32[$6 >> 2] = $4; //@line 11321
  $17 = $8 + 40 | 0; //@line 11322
  HEAP32[$17 >> 2] = (HEAP32[$17 >> 2] | 0) + 1; //@line 11325
  if ((HEAP32[$8 + 36 >> 2] | 0) == 1) {
   if ((HEAP32[$8 + 24 >> 2] | 0) == 2) {
    HEAP8[$8 + 54 >> 0] = 1; //@line 11335
    $$037$off039 = $$037$off038; //@line 11336
   } else {
    $$037$off039 = $$037$off038; //@line 11338
   }
  } else {
   $$037$off039 = $$037$off038; //@line 11341
  }
 }
 HEAP32[$12 >> 2] = $$037$off039; //@line 11344
 return;
}
function __ZL25default_terminate_handlerv__async_cb($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $15 = 0, $16 = 0, $2 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 1707
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 1709
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 1711
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 1713
 $8 = HEAP32[$0 + 20 >> 2] | 0; //@line 1715
 $10 = HEAP32[$0 + 24 >> 2] | 0; //@line 1717
 if (!(HEAP8[___async_retval >> 0] & 1)) {
  HEAP32[$4 >> 2] = 3941; //@line 1722
  HEAP32[$4 + 4 >> 2] = $6; //@line 1724
  _abort_message(3850, $4); //@line 1725
 }
 $12 = HEAP32[$2 >> 2] | 0; //@line 1728
 $15 = HEAP32[(HEAP32[$12 >> 2] | 0) + 8 >> 2] | 0; //@line 1731
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(16) | 0; //@line 1732
 $16 = FUNCTION_TABLE_ii[$15 & 3]($12) | 0; //@line 1733
 if (!___async) {
  HEAP32[___async_retval >> 2] = $16; //@line 1737
  ___async_unwind = 0; //@line 1738
 }
 HEAP32[$ReallocAsyncCtx2 >> 2] = 82; //@line 1740
 HEAP32[$ReallocAsyncCtx2 + 4 >> 2] = $8; //@line 1742
 HEAP32[$ReallocAsyncCtx2 + 8 >> 2] = $6; //@line 1744
 HEAP32[$ReallocAsyncCtx2 + 12 >> 2] = $10; //@line 1746
 sp = STACKTOP; //@line 1747
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
   __ZNK10__cxxabiv117__class_type_info29process_static_type_below_dstEPNS_19__dynamic_cast_infoEPKvi(0, $1, $2, $3); //@line 9795
  } else {
   if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 >> 2] | 0, $4) | 0) {
    if ((HEAP32[$1 + 16 >> 2] | 0) != ($2 | 0)) {
     $13 = $1 + 20 | 0; //@line 9804
     if ((HEAP32[$13 >> 2] | 0) != ($2 | 0)) {
      HEAP32[$1 + 32 >> 2] = $3; //@line 9809
      HEAP32[$13 >> 2] = $2; //@line 9810
      $19 = $1 + 40 | 0; //@line 9811
      HEAP32[$19 >> 2] = (HEAP32[$19 >> 2] | 0) + 1; //@line 9814
      if ((HEAP32[$1 + 36 >> 2] | 0) == 1) {
       if ((HEAP32[$1 + 24 >> 2] | 0) == 2) {
        HEAP8[$1 + 54 >> 0] = 1; //@line 9824
       }
      }
      HEAP32[$1 + 44 >> 2] = 4; //@line 9828
      break;
     }
    }
    if (($3 | 0) == 1) {
     HEAP32[$1 + 32 >> 2] = 1; //@line 9835
    }
   }
  }
 } while (0);
 return;
}
function __ZN6events5EventIFvvEE10event_postIPS1_EEiPNS2_5eventE__async_cb_22($0) {
 $0 = $0 | 0;
 var $13 = 0, $14 = 0, $2 = 0, $4 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 12122
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 12124
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 12126
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 12128
 if (!$AsyncRetVal) {
  HEAP32[___async_retval >> 2] = 0; //@line 12132
  return;
 }
 HEAP32[$AsyncRetVal >> 2] = HEAP32[$2 + 28 >> 2]; //@line 12137
 _equeue_event_delay($AsyncRetVal, HEAP32[$2 + 12 >> 2] | 0); //@line 12140
 _equeue_event_period($AsyncRetVal, HEAP32[$2 + 16 >> 2] | 0); //@line 12143
 _equeue_event_dtor($AsyncRetVal, 68); //@line 12144
 $13 = HEAP32[$4 >> 2] | 0; //@line 12145
 $ReallocAsyncCtx = _emscripten_realloc_async_context(4) | 0; //@line 12146
 $14 = _equeue_post($13, 69, $AsyncRetVal) | 0; //@line 12147
 if (___async) {
  HEAP32[$ReallocAsyncCtx >> 2] = 70; //@line 12150
  sp = STACKTOP; //@line 12151
  return;
 }
 HEAP32[___async_retval >> 2] = $14; //@line 12155
 ___async_unwind = 0; //@line 12156
 HEAP32[$ReallocAsyncCtx >> 2] = 70; //@line 12157
 sp = STACKTOP; //@line 12158
 return;
}
function ___strerror_l($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$012$lcssa = 0, $$01214 = 0, $$016 = 0, $$113 = 0, $$115 = 0, $7 = 0, label = 0, $$113$looptemp = 0;
 $$016 = 0; //@line 9259
 while (1) {
  if ((HEAPU8[1913 + $$016 >> 0] | 0) == ($0 | 0)) {
   label = 2; //@line 9266
   break;
  }
  $7 = $$016 + 1 | 0; //@line 9269
  if (($7 | 0) == 87) {
   $$01214 = 2001; //@line 9272
   $$115 = 87; //@line 9272
   label = 5; //@line 9273
   break;
  } else {
   $$016 = $7; //@line 9276
  }
 }
 if ((label | 0) == 2) {
  if (!$$016) {
   $$012$lcssa = 2001; //@line 9282
  } else {
   $$01214 = 2001; //@line 9284
   $$115 = $$016; //@line 9284
   label = 5; //@line 9285
  }
 }
 if ((label | 0) == 5) {
  while (1) {
   label = 0; //@line 9290
   $$113 = $$01214; //@line 9291
   do {
    $$113$looptemp = $$113;
    $$113 = $$113 + 1 | 0; //@line 9295
   } while ((HEAP8[$$113$looptemp >> 0] | 0) != 0);
   $$115 = $$115 + -1 | 0; //@line 9302
   if (!$$115) {
    $$012$lcssa = $$113; //@line 9305
    break;
   } else {
    $$01214 = $$113; //@line 9308
    label = 5; //@line 9309
   }
  }
 }
 return ___lctrans($$012$lcssa, HEAP32[$1 + 20 >> 2] | 0) | 0; //@line 9316
}
function __ZN4mbed11InterruptInD2Ev($0) {
 $0 = $0 | 0;
 var $10 = 0, $14 = 0, $3 = 0, $7 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 56
 HEAP32[$0 >> 2] = 160; //@line 57
 _gpio_irq_free($0 + 28 | 0); //@line 59
 $3 = HEAP32[$0 + 68 >> 2] | 0; //@line 61
 do {
  if ($3 | 0) {
   $7 = HEAP32[$3 + 8 >> 2] | 0; //@line 67
   $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 68
   FUNCTION_TABLE_vi[$7 & 127]($0 + 56 | 0); //@line 69
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 11; //@line 72
    HEAP32[$AsyncCtx + 4 >> 2] = $0; //@line 74
    sp = STACKTOP; //@line 75
    return;
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 78
    break;
   }
  }
 } while (0);
 $10 = HEAP32[$0 + 52 >> 2] | 0; //@line 84
 if (!$10) {
  return;
 }
 $14 = HEAP32[$10 + 8 >> 2] | 0; //@line 91
 $AsyncCtx3 = _emscripten_alloc_async_context(4, sp) | 0; //@line 92
 FUNCTION_TABLE_vi[$14 & 127]($0 + 40 | 0); //@line 93
 if (___async) {
  HEAP32[$AsyncCtx3 >> 2] = 12; //@line 96
  sp = STACKTOP; //@line 97
  return;
 }
 _emscripten_free_async_context($AsyncCtx3 | 0); //@line 100
 return;
}
function __ZN4mbed8CallbackIFvvEE13function_dtorIN6events5EventIS1_EEEEvPv($0) {
 $0 = $0 | 0;
 var $1 = 0, $11 = 0, $4 = 0, $7 = 0, $9 = 0, $AsyncCtx = 0, $AsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 2493
 $1 = HEAP32[$0 >> 2] | 0; //@line 2494
 if (!$1) {
  return;
 }
 $4 = (HEAP32[$1 >> 2] | 0) + -1 | 0; //@line 2500
 HEAP32[$1 >> 2] = $4; //@line 2501
 if ($4 | 0) {
  return;
 }
 $7 = HEAP32[$1 + 24 >> 2] | 0; //@line 2507
 $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 2508
 FUNCTION_TABLE_vi[$7 & 127]($1); //@line 2509
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 73; //@line 2512
  HEAP32[$AsyncCtx + 4 >> 2] = $0; //@line 2514
  sp = STACKTOP; //@line 2515
  return;
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 2518
 $9 = HEAP32[$0 >> 2] | 0; //@line 2519
 $11 = HEAP32[$9 + 4 >> 2] | 0; //@line 2521
 $AsyncCtx2 = _emscripten_alloc_async_context(4, sp) | 0; //@line 2522
 _equeue_dealloc($11, $9); //@line 2523
 if (___async) {
  HEAP32[$AsyncCtx2 >> 2] = 74; //@line 2526
  sp = STACKTOP; //@line 2527
  return;
 }
 _emscripten_free_async_context($AsyncCtx2 | 0); //@line 2530
 return;
}
function _invoke_ticker($0) {
 $0 = $0 | 0;
 var $2 = 0, $3 = 0, $7 = 0, $8 = 0, $AsyncCtx = 0, $AsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 2059
 $2 = $0 + 12 | 0; //@line 2061
 $3 = HEAP32[$2 >> 2] | 0; //@line 2062
 do {
  if (!$3) {
   $AsyncCtx2 = _emscripten_alloc_async_context(12, sp) | 0; //@line 2066
   _mbed_assert_internal(1103, 1108, 528); //@line 2067
   if (___async) {
    HEAP32[$AsyncCtx2 >> 2] = 50; //@line 2070
    HEAP32[$AsyncCtx2 + 4 >> 2] = $2; //@line 2072
    HEAP32[$AsyncCtx2 + 8 >> 2] = $0; //@line 2074
    sp = STACKTOP; //@line 2075
    return;
   } else {
    _emscripten_free_async_context($AsyncCtx2 | 0); //@line 2078
    $8 = HEAP32[$2 >> 2] | 0; //@line 2080
    break;
   }
  } else {
   $8 = $3; //@line 2084
  }
 } while (0);
 $7 = HEAP32[$8 >> 2] | 0; //@line 2087
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 2089
 FUNCTION_TABLE_vi[$7 & 127]($0); //@line 2090
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 51; //@line 2093
  sp = STACKTOP; //@line 2094
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 2097
  return;
 }
}
function _frexp($0, $1) {
 $0 = +$0;
 $1 = $1 | 0;
 var $$0 = 0.0, $$016 = 0.0, $2 = 0, $3 = 0, $4 = 0, $9 = 0.0, $storemerge = 0;
 HEAPF64[tempDoublePtr >> 3] = $0; //@line 9090
 $2 = HEAP32[tempDoublePtr >> 2] | 0; //@line 9090
 $3 = HEAP32[tempDoublePtr + 4 >> 2] | 0; //@line 9091
 $4 = _bitshift64Lshr($2 | 0, $3 | 0, 52) | 0; //@line 9092
 switch ($4 & 2047) {
 case 0:
  {
   if ($0 != 0.0) {
    $9 = +_frexp($0 * 18446744073709552000.0, $1); //@line 9101
    $$016 = $9; //@line 9104
    $storemerge = (HEAP32[$1 >> 2] | 0) + -64 | 0; //@line 9104
   } else {
    $$016 = $0; //@line 9106
    $storemerge = 0; //@line 9106
   }
   HEAP32[$1 >> 2] = $storemerge; //@line 9108
   $$0 = $$016; //@line 9109
   break;
  }
 case 2047:
  {
   $$0 = $0; //@line 9113
   break;
  }
 default:
  {
   HEAP32[$1 >> 2] = ($4 & 2047) + -1022; //@line 9119
   HEAP32[tempDoublePtr >> 2] = $2; //@line 9122
   HEAP32[tempDoublePtr + 4 >> 2] = $3 & -2146435073 | 1071644672; //@line 9122
   $$0 = +HEAPF64[tempDoublePtr >> 3]; //@line 9123
  }
 }
 return +$$0;
}
function _vfprintf__async_cb($0) {
 $0 = $0 | 0;
 var $$ = 0, $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $2 = 0, $20 = 0, $22 = 0, $33 = 0;
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 12399
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 12407
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 12409
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 12411
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 12413
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 12415
 $20 = HEAP32[$0 + 40 >> 2] | 0; //@line 12417
 $22 = HEAP32[$0 + 44 >> 2] | 0; //@line 12419
 $$ = (HEAP32[$2 >> 2] | 0) == 0 ? -1 : HEAP32[$0 + 8 >> 2] | 0; //@line 12430
 HEAP32[HEAP32[$0 + 16 >> 2] >> 2] = HEAP32[$0 + 12 >> 2]; //@line 12431
 HEAP32[$10 >> 2] = 0; //@line 12432
 HEAP32[$12 >> 2] = 0; //@line 12433
 HEAP32[$14 >> 2] = 0; //@line 12434
 HEAP32[$2 >> 2] = 0; //@line 12435
 $33 = HEAP32[$16 >> 2] | 0; //@line 12436
 HEAP32[$16 >> 2] = $33 | $18; //@line 12441
 if ($20 | 0) {
  ___unlockfile($22); //@line 12444
 }
 HEAP32[___async_retval >> 2] = ($33 & 32 | 0) == 0 ? $$ : -1; //@line 12447
 return;
}
function __ZN4mbed8CallbackIFvvEE13function_callIN6events5EventIS1_EEEEvPKv($0) {
 $0 = $0 | 0;
 var $1 = 0, $4 = 0, $5 = 0, $AsyncCtx = 0, $AsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 2437
 $1 = HEAP32[$0 >> 2] | 0; //@line 2438
 if ($1 | 0) {
  $4 = HEAP32[$1 + 20 >> 2] | 0; //@line 2442
  $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 2443
  $5 = FUNCTION_TABLE_ii[$4 & 3]($1) | 0; //@line 2444
  if (___async) {
   HEAP32[$AsyncCtx >> 2] = 71; //@line 2447
   HEAP32[$AsyncCtx + 4 >> 2] = $0; //@line 2449
   sp = STACKTOP; //@line 2450
   return;
  }
  _emscripten_free_async_context($AsyncCtx | 0); //@line 2453
  HEAP32[(HEAP32[$0 >> 2] | 0) + 8 >> 2] = $5; //@line 2456
  if ($5 | 0) {
   return;
  }
 }
 $AsyncCtx2 = _emscripten_alloc_async_context(4, sp) | 0; //@line 2462
 _mbed_assert_internal(1297, 1300, 149); //@line 2463
 if (___async) {
  HEAP32[$AsyncCtx2 >> 2] = 72; //@line 2466
  sp = STACKTOP; //@line 2467
  return;
 }
 _emscripten_free_async_context($AsyncCtx2 | 0); //@line 2470
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
 sp = STACKTOP; //@line 10151
 do {
  if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, $5) | 0) {
   __ZNK10__cxxabiv117__class_type_info29process_static_type_above_dstEPNS_19__dynamic_cast_infoEPKvS4_i(0, $1, $2, $3, $4); //@line 10157
  } else {
   $10 = HEAP32[$0 + 8 >> 2] | 0; //@line 10160
   $13 = HEAP32[(HEAP32[$10 >> 2] | 0) + 20 >> 2] | 0; //@line 10163
   $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 10164
   FUNCTION_TABLE_viiiiii[$13 & 3]($10, $1, $2, $3, $4, $5); //@line 10165
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 89; //@line 10168
    sp = STACKTOP; //@line 10169
    return;
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 10172
    break;
   }
  }
 } while (0);
 return;
}
function _abort_message($0, $varargs) {
 $0 = $0 | 0;
 $varargs = $varargs | 0;
 var $1 = 0, $2 = 0, $AsyncCtx = 0, $AsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 9628
 STACKTOP = STACKTOP + 16 | 0; //@line 9629
 $1 = sp; //@line 9630
 HEAP32[$1 >> 2] = $varargs; //@line 9631
 $2 = HEAP32[45] | 0; //@line 9632
 $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 9633
 _vfprintf($2, $0, $1) | 0; //@line 9634
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 83; //@line 9637
  HEAP32[$AsyncCtx + 4 >> 2] = $2; //@line 9639
  sp = STACKTOP; //@line 9640
  STACKTOP = sp; //@line 9641
  return;
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 9643
 $AsyncCtx2 = _emscripten_alloc_async_context(4, sp) | 0; //@line 9644
 _fputc(10, $2) | 0; //@line 9645
 if (___async) {
  HEAP32[$AsyncCtx2 >> 2] = 84; //@line 9648
  sp = STACKTOP; //@line 9649
  STACKTOP = sp; //@line 9650
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx2 | 0); //@line 9652
  _abort(); //@line 9653
 }
}
function _equeue_sema_wait($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $2 = 0, $20 = 0, $3 = 0, $4 = 0, sp = 0;
 sp = STACKTOP; //@line 1592
 STACKTOP = STACKTOP + 16 | 0; //@line 1593
 $2 = sp + 8 | 0; //@line 1594
 $3 = sp; //@line 1595
 _pthread_mutex_lock($0 | 0) | 0; //@line 1596
 $4 = $0 + 76 | 0; //@line 1597
 do {
  if (!(HEAP8[$4 >> 0] | 0)) {
   if (($1 | 0) < 0) {
    _pthread_cond_wait($0 + 28 | 0, $0 | 0) | 0; //@line 1605
    break;
   } else {
    _gettimeofday($2 | 0, 0) | 0; //@line 1608
    HEAP32[$3 >> 2] = (HEAP32[$2 >> 2] | 0) + (($1 >>> 0) / 1e3 | 0); //@line 1612
    HEAP32[$3 + 4 >> 2] = ((HEAP32[$2 + 4 >> 2] | 0) * 1e3 | 0) + ($1 * 1e6 | 0); //@line 1619
    _pthread_cond_timedwait($0 + 28 | 0, $0 | 0, $3 | 0) | 0; //@line 1621
    break;
   }
  }
 } while (0);
 $20 = (HEAP8[$4 >> 0] | 0) != 0; //@line 1627
 HEAP8[$4 >> 0] = 0; //@line 1628
 _pthread_mutex_unlock($0 | 0) | 0; //@line 1629
 STACKTOP = sp; //@line 1630
 return $20 | 0; //@line 1630
}
function __ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($0, $1, $2, $3, $4, $5) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 $5 = $5 | 0;
 var $$0 = 0, $14 = 0, $17 = 0, $7 = 0, $8 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 11150
 $7 = HEAP32[$0 + 4 >> 2] | 0; //@line 11152
 $8 = $7 >> 8; //@line 11153
 if (!($7 & 1)) {
  $$0 = $8; //@line 11157
 } else {
  $$0 = HEAP32[(HEAP32[$3 >> 2] | 0) + $8 >> 2] | 0; //@line 11162
 }
 $14 = HEAP32[$0 >> 2] | 0; //@line 11164
 $17 = HEAP32[(HEAP32[$14 >> 2] | 0) + 20 >> 2] | 0; //@line 11167
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 11172
 FUNCTION_TABLE_viiiiii[$17 & 3]($14, $1, $2, $3 + $$0 | 0, $7 & 2 | 0 ? $4 : 2, $5); //@line 11173
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 105; //@line 11176
  sp = STACKTOP; //@line 11177
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 11180
  return;
 }
}
function ___cxa_can_catch($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $3 = 0, $7 = 0, $8 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 11231
 STACKTOP = STACKTOP + 16 | 0; //@line 11232
 $3 = sp; //@line 11233
 HEAP32[$3 >> 2] = HEAP32[$2 >> 2]; //@line 11235
 $7 = HEAP32[(HEAP32[$0 >> 2] | 0) + 16 >> 2] | 0; //@line 11238
 $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 11239
 $8 = FUNCTION_TABLE_iiii[$7 & 7]($0, $1, $3) | 0; //@line 11240
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 107; //@line 11243
  HEAP32[$AsyncCtx + 4 >> 2] = $3; //@line 11245
  HEAP32[$AsyncCtx + 8 >> 2] = $2; //@line 11247
  HEAP32[$AsyncCtx + 12 >> 2] = $3; //@line 11249
  sp = STACKTOP; //@line 11250
  STACKTOP = sp; //@line 11251
  return 0; //@line 11251
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 11253
 if ($8) {
  HEAP32[$2 >> 2] = HEAP32[$3 >> 2]; //@line 11257
 }
 STACKTOP = sp; //@line 11259
 return $8 & 1 | 0; //@line 11259
}
function __ZNK10__cxxabiv120__si_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $11 = 0, $8 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 10320
 do {
  if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, 0) | 0) {
   __ZNK10__cxxabiv117__class_type_info24process_found_base_classEPNS_19__dynamic_cast_infoEPvi(0, $1, $2, $3); //@line 10326
  } else {
   $8 = HEAP32[$0 + 8 >> 2] | 0; //@line 10329
   $11 = HEAP32[(HEAP32[$8 >> 2] | 0) + 28 >> 2] | 0; //@line 10332
   $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 10333
   FUNCTION_TABLE_viiii[$11 & 3]($8, $1, $2, $3); //@line 10334
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 92; //@line 10337
    sp = STACKTOP; //@line 10338
    return;
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 10341
    break;
   }
  }
 } while (0);
 return;
}
function __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($0, $1, $2, $3, $4) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 var $$0 = 0, $13 = 0, $16 = 0, $6 = 0, $7 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 11192
 $6 = HEAP32[$0 + 4 >> 2] | 0; //@line 11194
 $7 = $6 >> 8; //@line 11195
 if (!($6 & 1)) {
  $$0 = $7; //@line 11199
 } else {
  $$0 = HEAP32[(HEAP32[$2 >> 2] | 0) + $7 >> 2] | 0; //@line 11204
 }
 $13 = HEAP32[$0 >> 2] | 0; //@line 11206
 $16 = HEAP32[(HEAP32[$13 >> 2] | 0) + 24 >> 2] | 0; //@line 11209
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 11214
 FUNCTION_TABLE_viiiii[$16 & 3]($13, $1, $2 + $$0 | 0, $6 & 2 | 0 ? $3 : 2, $4); //@line 11215
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 106; //@line 11218
  sp = STACKTOP; //@line 11219
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 11222
  return;
 }
}
function ___dynamic_cast__async_cb_39($0) {
 $0 = $0 | 0;
 var $$0 = 0, $10 = 0, $16 = 0, $6 = 0, $8 = 0;
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 2315
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 2317
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 2319
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 2325
 L2 : do {
  switch (HEAP32[HEAP32[$0 + 4 >> 2] >> 2] | 0) {
  case 0:
   {
    $$0 = (HEAP32[$6 >> 2] | 0) == 1 & (HEAP32[$8 >> 2] | 0) == 1 & (HEAP32[$10 >> 2] | 0) == 1 ? HEAP32[HEAP32[$0 + 24 >> 2] >> 2] | 0 : 0; //@line 2340
    break;
   }
  case 1:
   {
    if ((HEAP32[HEAP32[$0 + 28 >> 2] >> 2] | 0) != 1) {
     if (!((HEAP32[$6 >> 2] | 0) == 0 & (HEAP32[$8 >> 2] | 0) == 1 & (HEAP32[$10 >> 2] | 0) == 1)) {
      $$0 = 0; //@line 2356
      break L2;
     }
    }
    $$0 = HEAP32[$16 >> 2] | 0; //@line 2361
    break;
   }
  default:
   {
    $$0 = 0; //@line 2365
   }
  }
 } while (0);
 HEAP32[___async_retval >> 2] = $$0; //@line 2370
 return;
}
function __ZNK10__cxxabiv122__base_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $$0 = 0, $12 = 0, $15 = 0, $5 = 0, $6 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 11107
 $5 = HEAP32[$0 + 4 >> 2] | 0; //@line 11109
 $6 = $5 >> 8; //@line 11110
 if (!($5 & 1)) {
  $$0 = $6; //@line 11114
 } else {
  $$0 = HEAP32[(HEAP32[$2 >> 2] | 0) + $6 >> 2] | 0; //@line 11119
 }
 $12 = HEAP32[$0 >> 2] | 0; //@line 11121
 $15 = HEAP32[(HEAP32[$12 >> 2] | 0) + 28 >> 2] | 0; //@line 11124
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 11129
 FUNCTION_TABLE_viiii[$15 & 3]($12, $1, $2 + $$0 | 0, $5 & 2 | 0 ? $3 : 2); //@line 11130
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 104; //@line 11133
  sp = STACKTOP; //@line 11134
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 11137
  return;
 }
}
function __ZN4mbed11InterruptInD0Ev__async_cb($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $8 = 0, $9 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 12069
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 12071
 $4 = HEAP32[$2 + 52 >> 2] | 0; //@line 12073
 if (!$4) {
  __ZdlPv($2); //@line 12076
  return;
 }
 $8 = HEAP32[$4 + 8 >> 2] | 0; //@line 12081
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(8) | 0; //@line 12082
 FUNCTION_TABLE_vi[$8 & 127]($2 + 40 | 0); //@line 12083
 if (___async) {
  HEAP32[$ReallocAsyncCtx2 >> 2] = 14; //@line 12086
  $9 = $ReallocAsyncCtx2 + 4 | 0; //@line 12087
  HEAP32[$9 >> 2] = $2; //@line 12088
  sp = STACKTOP; //@line 12089
  return;
 }
 ___async_unwind = 0; //@line 12092
 HEAP32[$ReallocAsyncCtx2 >> 2] = 14; //@line 12093
 $9 = $ReallocAsyncCtx2 + 4 | 0; //@line 12094
 HEAP32[$9 >> 2] = $2; //@line 12095
 sp = STACKTOP; //@line 12096
 return;
}
function _pad_676($0, $1, $2, $3, $4) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 var $$0$lcssa = 0, $$011 = 0, $14 = 0, $5 = 0, $9 = 0, sp = 0;
 sp = STACKTOP; //@line 8088
 STACKTOP = STACKTOP + 256 | 0; //@line 8089
 $5 = sp; //@line 8090
 if (($2 | 0) > ($3 | 0) & ($4 & 73728 | 0) == 0) {
  $9 = $2 - $3 | 0; //@line 8096
  _memset($5 | 0, $1 << 24 >> 24 | 0, ($9 >>> 0 < 256 ? $9 : 256) | 0) | 0; //@line 8100
  if ($9 >>> 0 > 255) {
   $14 = $2 - $3 | 0; //@line 8103
   $$011 = $9; //@line 8104
   do {
    _out_670($0, $5, 256); //@line 8106
    $$011 = $$011 + -256 | 0; //@line 8107
   } while ($$011 >>> 0 > 255);
   $$0$lcssa = $14 & 255; //@line 8116
  } else {
   $$0$lcssa = $9; //@line 8118
  }
  _out_670($0, $5, $$0$lcssa); //@line 8120
 }
 STACKTOP = sp; //@line 8122
 return;
}
function __ZNK10__cxxabiv117__class_type_info24process_found_base_classEPNS_19__dynamic_cast_infoEPvi($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $10 = 0, $13 = 0, $4 = 0, $5 = 0;
 $4 = $1 + 16 | 0; //@line 9873
 $5 = HEAP32[$4 >> 2] | 0; //@line 9874
 do {
  if (!$5) {
   HEAP32[$4 >> 2] = $2; //@line 9878
   HEAP32[$1 + 24 >> 2] = $3; //@line 9880
   HEAP32[$1 + 36 >> 2] = 1; //@line 9882
  } else {
   if (($5 | 0) != ($2 | 0)) {
    $13 = $1 + 36 | 0; //@line 9886
    HEAP32[$13 >> 2] = (HEAP32[$13 >> 2] | 0) + 1; //@line 9889
    HEAP32[$1 + 24 >> 2] = 2; //@line 9891
    HEAP8[$1 + 54 >> 0] = 1; //@line 9893
    break;
   }
   $10 = $1 + 24 | 0; //@line 9896
   if ((HEAP32[$10 >> 2] | 0) == 2) {
    HEAP32[$10 >> 2] = $3; //@line 9900
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
 sp = STACKTOP; //@line 5835
 STACKTOP = STACKTOP + 32 | 0; //@line 5836
 $vararg_buffer = sp; //@line 5837
 $3 = sp + 20 | 0; //@line 5838
 HEAP32[$vararg_buffer >> 2] = HEAP32[$0 + 60 >> 2]; //@line 5842
 HEAP32[$vararg_buffer + 4 >> 2] = 0; //@line 5844
 HEAP32[$vararg_buffer + 8 >> 2] = $1; //@line 5846
 HEAP32[$vararg_buffer + 12 >> 2] = $3; //@line 5848
 HEAP32[$vararg_buffer + 16 >> 2] = $2; //@line 5850
 if ((___syscall_ret(___syscall140(140, $vararg_buffer | 0) | 0) | 0) < 0) {
  HEAP32[$3 >> 2] = -1; //@line 5855
  $10 = -1; //@line 5856
 } else {
  $10 = HEAP32[$3 >> 2] | 0; //@line 5859
 }
 STACKTOP = sp; //@line 5861
 return $10 | 0; //@line 5861
}
function _mbed_assert_internal($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $AsyncCtx = 0, $vararg_buffer = 0, sp = 0;
 sp = STACKTOP; //@line 1637
 STACKTOP = STACKTOP + 16 | 0; //@line 1638
 $vararg_buffer = sp; //@line 1639
 HEAP32[$vararg_buffer >> 2] = $0; //@line 1640
 HEAP32[$vararg_buffer + 4 >> 2] = $1; //@line 1642
 HEAP32[$vararg_buffer + 8 >> 2] = $2; //@line 1644
 _mbed_error_printf(865, $vararg_buffer); //@line 1645
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 1646
 _mbed_die(); //@line 1647
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 32; //@line 1650
  sp = STACKTOP; //@line 1651
  STACKTOP = sp; //@line 1652
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 1654
  STACKTOP = sp; //@line 1655
  return;
 }
}
function _equeue_post($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $4 = 0, $6 = 0, $9 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 780
 $4 = _equeue_tick() | 0; //@line 782
 HEAP32[$2 + -4 >> 2] = $1; //@line 784
 $6 = $2 + -16 | 0; //@line 785
 HEAP32[$6 >> 2] = (HEAP32[$6 >> 2] | 0) + $4; //@line 788
 $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 789
 $9 = _equeue_enqueue($0, $2 + -36 | 0, $4) | 0; //@line 790
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 25; //@line 793
  HEAP32[$AsyncCtx + 4 >> 2] = $0; //@line 795
  sp = STACKTOP; //@line 796
  return 0; //@line 797
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 799
  _equeue_sema_signal($0 + 48 | 0); //@line 801
  return $9 | 0; //@line 802
 }
 return 0; //@line 804
}
function _strcmp($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$011 = 0, $$0710 = 0, $$lcssa = 0, $$lcssa8 = 0, $2 = 0, $3 = 0, $8 = 0, $9 = 0;
 $2 = HEAP8[$0 >> 0] | 0; //@line 5942
 $3 = HEAP8[$1 >> 0] | 0; //@line 5943
 if ($2 << 24 >> 24 == 0 ? 1 : $2 << 24 >> 24 != $3 << 24 >> 24) {
  $$lcssa = $3; //@line 5948
  $$lcssa8 = $2; //@line 5948
 } else {
  $$011 = $1; //@line 5950
  $$0710 = $0; //@line 5950
  do {
   $$0710 = $$0710 + 1 | 0; //@line 5952
   $$011 = $$011 + 1 | 0; //@line 5953
   $8 = HEAP8[$$0710 >> 0] | 0; //@line 5954
   $9 = HEAP8[$$011 >> 0] | 0; //@line 5955
  } while (!($8 << 24 >> 24 == 0 ? 1 : $8 << 24 >> 24 != $9 << 24 >> 24));
  $$lcssa = $9; //@line 5960
  $$lcssa8 = $8; //@line 5960
 }
 return ($$lcssa8 & 255) - ($$lcssa & 255) | 0; //@line 5970
}
function _mbed_die__async_cb_20($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx15 = 0, sp = 0;
 sp = STACKTOP; //@line 12032
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 12034
 _emscripten_asm_const_iii(0, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 12036
 $ReallocAsyncCtx15 = _emscripten_realloc_async_context(8) | 0; //@line 12037
 _wait_ms(150); //@line 12038
 if (___async) {
  HEAP32[$ReallocAsyncCtx15 >> 2] = 34; //@line 12041
  $4 = $ReallocAsyncCtx15 + 4 | 0; //@line 12042
  HEAP32[$4 >> 2] = $2; //@line 12043
  sp = STACKTOP; //@line 12044
  return;
 }
 ___async_unwind = 0; //@line 12047
 HEAP32[$ReallocAsyncCtx15 >> 2] = 34; //@line 12048
 $4 = $ReallocAsyncCtx15 + 4 | 0; //@line 12049
 HEAP32[$4 >> 2] = $2; //@line 12050
 sp = STACKTOP; //@line 12051
 return;
}
function _mbed_die__async_cb_19($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx14 = 0, sp = 0;
 sp = STACKTOP; //@line 12007
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 12009
 _emscripten_asm_const_iii(0, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 12011
 $ReallocAsyncCtx14 = _emscripten_realloc_async_context(8) | 0; //@line 12012
 _wait_ms(150); //@line 12013
 if (___async) {
  HEAP32[$ReallocAsyncCtx14 >> 2] = 35; //@line 12016
  $4 = $ReallocAsyncCtx14 + 4 | 0; //@line 12017
  HEAP32[$4 >> 2] = $2; //@line 12018
  sp = STACKTOP; //@line 12019
  return;
 }
 ___async_unwind = 0; //@line 12022
 HEAP32[$ReallocAsyncCtx14 >> 2] = 35; //@line 12023
 $4 = $ReallocAsyncCtx14 + 4 | 0; //@line 12024
 HEAP32[$4 >> 2] = $2; //@line 12025
 sp = STACKTOP; //@line 12026
 return;
}
function _mbed_die__async_cb_18($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx13 = 0, sp = 0;
 sp = STACKTOP; //@line 11982
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 11984
 _emscripten_asm_const_iii(0, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 11986
 $ReallocAsyncCtx13 = _emscripten_realloc_async_context(8) | 0; //@line 11987
 _wait_ms(150); //@line 11988
 if (___async) {
  HEAP32[$ReallocAsyncCtx13 >> 2] = 36; //@line 11991
  $4 = $ReallocAsyncCtx13 + 4 | 0; //@line 11992
  HEAP32[$4 >> 2] = $2; //@line 11993
  sp = STACKTOP; //@line 11994
  return;
 }
 ___async_unwind = 0; //@line 11997
 HEAP32[$ReallocAsyncCtx13 >> 2] = 36; //@line 11998
 $4 = $ReallocAsyncCtx13 + 4 | 0; //@line 11999
 HEAP32[$4 >> 2] = $2; //@line 12000
 sp = STACKTOP; //@line 12001
 return;
}
function _mbed_die__async_cb_17($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx12 = 0, sp = 0;
 sp = STACKTOP; //@line 11957
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 11959
 _emscripten_asm_const_iii(0, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 11961
 $ReallocAsyncCtx12 = _emscripten_realloc_async_context(8) | 0; //@line 11962
 _wait_ms(150); //@line 11963
 if (___async) {
  HEAP32[$ReallocAsyncCtx12 >> 2] = 37; //@line 11966
  $4 = $ReallocAsyncCtx12 + 4 | 0; //@line 11967
  HEAP32[$4 >> 2] = $2; //@line 11968
  sp = STACKTOP; //@line 11969
  return;
 }
 ___async_unwind = 0; //@line 11972
 HEAP32[$ReallocAsyncCtx12 >> 2] = 37; //@line 11973
 $4 = $ReallocAsyncCtx12 + 4 | 0; //@line 11974
 HEAP32[$4 >> 2] = $2; //@line 11975
 sp = STACKTOP; //@line 11976
 return;
}
function _mbed_die__async_cb_16($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx11 = 0, sp = 0;
 sp = STACKTOP; //@line 11932
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 11934
 _emscripten_asm_const_iii(0, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 11936
 $ReallocAsyncCtx11 = _emscripten_realloc_async_context(8) | 0; //@line 11937
 _wait_ms(150); //@line 11938
 if (___async) {
  HEAP32[$ReallocAsyncCtx11 >> 2] = 38; //@line 11941
  $4 = $ReallocAsyncCtx11 + 4 | 0; //@line 11942
  HEAP32[$4 >> 2] = $2; //@line 11943
  sp = STACKTOP; //@line 11944
  return;
 }
 ___async_unwind = 0; //@line 11947
 HEAP32[$ReallocAsyncCtx11 >> 2] = 38; //@line 11948
 $4 = $ReallocAsyncCtx11 + 4 | 0; //@line 11949
 HEAP32[$4 >> 2] = $2; //@line 11950
 sp = STACKTOP; //@line 11951
 return;
}
function _mbed_die__async_cb_15($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx10 = 0, sp = 0;
 sp = STACKTOP; //@line 11907
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 11909
 _emscripten_asm_const_iii(0, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 11911
 $ReallocAsyncCtx10 = _emscripten_realloc_async_context(8) | 0; //@line 11912
 _wait_ms(150); //@line 11913
 if (___async) {
  HEAP32[$ReallocAsyncCtx10 >> 2] = 39; //@line 11916
  $4 = $ReallocAsyncCtx10 + 4 | 0; //@line 11917
  HEAP32[$4 >> 2] = $2; //@line 11918
  sp = STACKTOP; //@line 11919
  return;
 }
 ___async_unwind = 0; //@line 11922
 HEAP32[$ReallocAsyncCtx10 >> 2] = 39; //@line 11923
 $4 = $ReallocAsyncCtx10 + 4 | 0; //@line 11924
 HEAP32[$4 >> 2] = $2; //@line 11925
 sp = STACKTOP; //@line 11926
 return;
}
function _mbed_die__async_cb($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx16 = 0, sp = 0;
 sp = STACKTOP; //@line 11657
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 11659
 _emscripten_asm_const_iii(0, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 11661
 $ReallocAsyncCtx16 = _emscripten_realloc_async_context(8) | 0; //@line 11662
 _wait_ms(150); //@line 11663
 if (___async) {
  HEAP32[$ReallocAsyncCtx16 >> 2] = 33; //@line 11666
  $4 = $ReallocAsyncCtx16 + 4 | 0; //@line 11667
  HEAP32[$4 >> 2] = $2; //@line 11668
  sp = STACKTOP; //@line 11669
  return;
 }
 ___async_unwind = 0; //@line 11672
 HEAP32[$ReallocAsyncCtx16 >> 2] = 33; //@line 11673
 $4 = $ReallocAsyncCtx16 + 4 | 0; //@line 11674
 HEAP32[$4 >> 2] = $2; //@line 11675
 sp = STACKTOP; //@line 11676
 return;
}
function _mbed_die__async_cb_14($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx9 = 0, sp = 0;
 sp = STACKTOP; //@line 11882
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 11884
 _emscripten_asm_const_iii(0, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 11886
 $ReallocAsyncCtx9 = _emscripten_realloc_async_context(8) | 0; //@line 11887
 _wait_ms(150); //@line 11888
 if (___async) {
  HEAP32[$ReallocAsyncCtx9 >> 2] = 40; //@line 11891
  $4 = $ReallocAsyncCtx9 + 4 | 0; //@line 11892
  HEAP32[$4 >> 2] = $2; //@line 11893
  sp = STACKTOP; //@line 11894
  return;
 }
 ___async_unwind = 0; //@line 11897
 HEAP32[$ReallocAsyncCtx9 >> 2] = 40; //@line 11898
 $4 = $ReallocAsyncCtx9 + 4 | 0; //@line 11899
 HEAP32[$4 >> 2] = $2; //@line 11900
 sp = STACKTOP; //@line 11901
 return;
}
function _mbed_die__async_cb_13($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx8 = 0, sp = 0;
 sp = STACKTOP; //@line 11857
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 11859
 _emscripten_asm_const_iii(0, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 11861
 $ReallocAsyncCtx8 = _emscripten_realloc_async_context(8) | 0; //@line 11862
 _wait_ms(400); //@line 11863
 if (___async) {
  HEAP32[$ReallocAsyncCtx8 >> 2] = 41; //@line 11866
  $4 = $ReallocAsyncCtx8 + 4 | 0; //@line 11867
  HEAP32[$4 >> 2] = $2; //@line 11868
  sp = STACKTOP; //@line 11869
  return;
 }
 ___async_unwind = 0; //@line 11872
 HEAP32[$ReallocAsyncCtx8 >> 2] = 41; //@line 11873
 $4 = $ReallocAsyncCtx8 + 4 | 0; //@line 11874
 HEAP32[$4 >> 2] = $2; //@line 11875
 sp = STACKTOP; //@line 11876
 return;
}
function _mbed_die__async_cb_12($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx7 = 0, sp = 0;
 sp = STACKTOP; //@line 11832
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 11834
 _emscripten_asm_const_iii(0, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 11836
 $ReallocAsyncCtx7 = _emscripten_realloc_async_context(8) | 0; //@line 11837
 _wait_ms(400); //@line 11838
 if (___async) {
  HEAP32[$ReallocAsyncCtx7 >> 2] = 42; //@line 11841
  $4 = $ReallocAsyncCtx7 + 4 | 0; //@line 11842
  HEAP32[$4 >> 2] = $2; //@line 11843
  sp = STACKTOP; //@line 11844
  return;
 }
 ___async_unwind = 0; //@line 11847
 HEAP32[$ReallocAsyncCtx7 >> 2] = 42; //@line 11848
 $4 = $ReallocAsyncCtx7 + 4 | 0; //@line 11849
 HEAP32[$4 >> 2] = $2; //@line 11850
 sp = STACKTOP; //@line 11851
 return;
}
function _mbed_die__async_cb_11($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx6 = 0, sp = 0;
 sp = STACKTOP; //@line 11807
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 11809
 _emscripten_asm_const_iii(0, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 11811
 $ReallocAsyncCtx6 = _emscripten_realloc_async_context(8) | 0; //@line 11812
 _wait_ms(400); //@line 11813
 if (___async) {
  HEAP32[$ReallocAsyncCtx6 >> 2] = 43; //@line 11816
  $4 = $ReallocAsyncCtx6 + 4 | 0; //@line 11817
  HEAP32[$4 >> 2] = $2; //@line 11818
  sp = STACKTOP; //@line 11819
  return;
 }
 ___async_unwind = 0; //@line 11822
 HEAP32[$ReallocAsyncCtx6 >> 2] = 43; //@line 11823
 $4 = $ReallocAsyncCtx6 + 4 | 0; //@line 11824
 HEAP32[$4 >> 2] = $2; //@line 11825
 sp = STACKTOP; //@line 11826
 return;
}
function _mbed_die__async_cb_10($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx5 = 0, sp = 0;
 sp = STACKTOP; //@line 11782
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 11784
 _emscripten_asm_const_iii(0, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 11786
 $ReallocAsyncCtx5 = _emscripten_realloc_async_context(8) | 0; //@line 11787
 _wait_ms(400); //@line 11788
 if (___async) {
  HEAP32[$ReallocAsyncCtx5 >> 2] = 44; //@line 11791
  $4 = $ReallocAsyncCtx5 + 4 | 0; //@line 11792
  HEAP32[$4 >> 2] = $2; //@line 11793
  sp = STACKTOP; //@line 11794
  return;
 }
 ___async_unwind = 0; //@line 11797
 HEAP32[$ReallocAsyncCtx5 >> 2] = 44; //@line 11798
 $4 = $ReallocAsyncCtx5 + 4 | 0; //@line 11799
 HEAP32[$4 >> 2] = $2; //@line 11800
 sp = STACKTOP; //@line 11801
 return;
}
function _mbed_die__async_cb_9($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx4 = 0, sp = 0;
 sp = STACKTOP; //@line 11757
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 11759
 _emscripten_asm_const_iii(0, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 11761
 $ReallocAsyncCtx4 = _emscripten_realloc_async_context(8) | 0; //@line 11762
 _wait_ms(400); //@line 11763
 if (___async) {
  HEAP32[$ReallocAsyncCtx4 >> 2] = 45; //@line 11766
  $4 = $ReallocAsyncCtx4 + 4 | 0; //@line 11767
  HEAP32[$4 >> 2] = $2; //@line 11768
  sp = STACKTOP; //@line 11769
  return;
 }
 ___async_unwind = 0; //@line 11772
 HEAP32[$ReallocAsyncCtx4 >> 2] = 45; //@line 11773
 $4 = $ReallocAsyncCtx4 + 4 | 0; //@line 11774
 HEAP32[$4 >> 2] = $2; //@line 11775
 sp = STACKTOP; //@line 11776
 return;
}
function _mbed_die__async_cb_8($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 11732
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 11734
 _emscripten_asm_const_iii(0, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 11736
 $ReallocAsyncCtx3 = _emscripten_realloc_async_context(8) | 0; //@line 11737
 _wait_ms(400); //@line 11738
 if (___async) {
  HEAP32[$ReallocAsyncCtx3 >> 2] = 46; //@line 11741
  $4 = $ReallocAsyncCtx3 + 4 | 0; //@line 11742
  HEAP32[$4 >> 2] = $2; //@line 11743
  sp = STACKTOP; //@line 11744
  return;
 }
 ___async_unwind = 0; //@line 11747
 HEAP32[$ReallocAsyncCtx3 >> 2] = 46; //@line 11748
 $4 = $ReallocAsyncCtx3 + 4 | 0; //@line 11749
 HEAP32[$4 >> 2] = $2; //@line 11750
 sp = STACKTOP; //@line 11751
 return;
}
function _mbed_die__async_cb_7($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 11707
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 11709
 _emscripten_asm_const_iii(0, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 11711
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(8) | 0; //@line 11712
 _wait_ms(400); //@line 11713
 if (___async) {
  HEAP32[$ReallocAsyncCtx2 >> 2] = 47; //@line 11716
  $4 = $ReallocAsyncCtx2 + 4 | 0; //@line 11717
  HEAP32[$4 >> 2] = $2; //@line 11718
  sp = STACKTOP; //@line 11719
  return;
 }
 ___async_unwind = 0; //@line 11722
 HEAP32[$ReallocAsyncCtx2 >> 2] = 47; //@line 11723
 $4 = $ReallocAsyncCtx2 + 4 | 0; //@line 11724
 HEAP32[$4 >> 2] = $2; //@line 11725
 sp = STACKTOP; //@line 11726
 return;
}
function _mbed_die__async_cb_6($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 11682
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 11684
 _emscripten_asm_const_iii(0, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 11686
 $ReallocAsyncCtx = _emscripten_realloc_async_context(8) | 0; //@line 11687
 _wait_ms(400); //@line 11688
 if (___async) {
  HEAP32[$ReallocAsyncCtx >> 2] = 48; //@line 11691
  $4 = $ReallocAsyncCtx + 4 | 0; //@line 11692
  HEAP32[$4 >> 2] = $2; //@line 11693
  sp = STACKTOP; //@line 11694
  return;
 }
 ___async_unwind = 0; //@line 11697
 HEAP32[$ReallocAsyncCtx >> 2] = 48; //@line 11698
 $4 = $ReallocAsyncCtx + 4 | 0; //@line 11699
 HEAP32[$4 >> 2] = $2; //@line 11700
 sp = STACKTOP; //@line 11701
 return;
}
function __ZN4mbed8CallbackIFvvEE13function_callIN6events5EventIS1_EEEEvPKv__async_cb($0) {
 $0 = $0 | 0;
 var $AsyncRetVal = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 2403
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 2407
 HEAP32[(HEAP32[HEAP32[$0 + 4 >> 2] >> 2] | 0) + 8 >> 2] = $AsyncRetVal; //@line 2410
 if ($AsyncRetVal | 0) {
  return;
 }
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(4) | 0; //@line 2415
 _mbed_assert_internal(1297, 1300, 149); //@line 2416
 if (___async) {
  HEAP32[$ReallocAsyncCtx2 >> 2] = 72; //@line 2419
  sp = STACKTOP; //@line 2420
  return;
 }
 ___async_unwind = 0; //@line 2423
 HEAP32[$ReallocAsyncCtx2 >> 2] = 72; //@line 2424
 sp = STACKTOP; //@line 2425
 return;
}
function _sbrk(increment) {
 increment = increment | 0;
 var oldDynamicTop = 0, newDynamicTop = 0;
 oldDynamicTop = HEAP32[DYNAMICTOP_PTR >> 2] | 0; //@line 3390
 newDynamicTop = oldDynamicTop + increment | 0; //@line 3391
 if ((increment | 0) > 0 & (newDynamicTop | 0) < (oldDynamicTop | 0) | (newDynamicTop | 0) < 0) {
  abortOnCannotGrowMemory() | 0; //@line 3395
  ___setErrNo(12); //@line 3396
  return -1;
 }
 HEAP32[DYNAMICTOP_PTR >> 2] = newDynamicTop; //@line 3400
 if ((newDynamicTop | 0) > (getTotalMemory() | 0)) {
  if (!(enlargeMemory() | 0)) {
   HEAP32[DYNAMICTOP_PTR >> 2] = oldDynamicTop; //@line 3404
   ___setErrNo(12); //@line 3405
   return -1;
  }
 }
 return oldDynamicTop | 0; //@line 3409
}
function __ZSt11__terminatePFvvE($0) {
 $0 = $0 | 0;
 var $AsyncCtx = 0, $vararg_buffer = 0, sp = 0;
 sp = STACKTOP; //@line 10423
 STACKTOP = STACKTOP + 16 | 0; //@line 10424
 $vararg_buffer = sp; //@line 10425
 $AsyncCtx = _emscripten_alloc_async_context(12, sp) | 0; //@line 10426
 FUNCTION_TABLE_v[$0 & 7](); //@line 10427
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 94; //@line 10430
  HEAP32[$AsyncCtx + 4 >> 2] = $vararg_buffer; //@line 10432
  HEAP32[$AsyncCtx + 8 >> 2] = $vararg_buffer; //@line 10434
  sp = STACKTOP; //@line 10435
  STACKTOP = sp; //@line 10436
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 10438
  _abort_message(4232, $vararg_buffer); //@line 10439
 }
}
function _fwrite($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $$ = 0, $11 = 0, $13 = 0, $15 = 0, $4 = 0, $phitmp = 0;
 $4 = Math_imul($2, $1) | 0; //@line 6065
 $$ = ($1 | 0) == 0 ? 0 : $2; //@line 6067
 if ((HEAP32[$3 + 76 >> 2] | 0) > -1) {
  $phitmp = (___lockfile($3) | 0) == 0; //@line 6073
  $11 = ___fwritex($0, $4, $3) | 0; //@line 6074
  if ($phitmp) {
   $13 = $11; //@line 6076
  } else {
   ___unlockfile($3); //@line 6078
   $13 = $11; //@line 6079
  }
 } else {
  $13 = ___fwritex($0, $4, $3) | 0; //@line 6083
 }
 if (($13 | 0) == ($4 | 0)) {
  $15 = $$; //@line 6087
 } else {
  $15 = ($13 >>> 0) / ($1 >>> 0) | 0; //@line 6090
 }
 return $15 | 0; //@line 6092
}
function _fmt_x($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $$05$lcssa = 0, $$056 = 0, $14 = 0, $15 = 0, $8 = 0;
 if (($0 | 0) == 0 & ($1 | 0) == 0) {
  $$05$lcssa = $2; //@line 7949
 } else {
  $$056 = $2; //@line 7951
  $15 = $1; //@line 7951
  $8 = $0; //@line 7951
  while (1) {
   $14 = $$056 + -1 | 0; //@line 7959
   HEAP8[$14 >> 0] = HEAPU8[1895 + ($8 & 15) >> 0] | 0 | $3; //@line 7960
   $8 = _bitshift64Lshr($8 | 0, $15 | 0, 4) | 0; //@line 7961
   $15 = tempRet0; //@line 7962
   if (($8 | 0) == 0 & ($15 | 0) == 0) {
    $$05$lcssa = $14; //@line 7967
    break;
   } else {
    $$056 = $14; //@line 7970
   }
  }
 }
 return $$05$lcssa | 0; //@line 7974
}
function __ZSt9terminatev() {
 var $0 = 0, $16 = 0, $17 = 0, $2 = 0, $5 = 0, sp = 0;
 sp = STACKTOP; //@line 10388
 $0 = ___cxa_get_globals_fast() | 0; //@line 10389
 if ($0 | 0) {
  $2 = HEAP32[$0 >> 2] | 0; //@line 10392
  if ($2 | 0) {
   $5 = $2 + 48 | 0; //@line 10396
   if ((HEAP32[$5 >> 2] & -256 | 0) == 1126902528 ? (HEAP32[$5 + 4 >> 2] | 0) == 1129074247 : 0) {
    $16 = HEAP32[$2 + 12 >> 2] | 0; //@line 10408
    _emscripten_alloc_async_context(4, sp) | 0; //@line 10409
    __ZSt11__terminatePFvvE($16); //@line 10410
   }
  }
 }
 $17 = __ZSt13get_terminatev() | 0; //@line 10415
 _emscripten_alloc_async_context(4, sp) | 0; //@line 10416
 __ZSt11__terminatePFvvE($17); //@line 10417
}
function ___stdout_write($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $14 = 0, $vararg_buffer = 0, sp = 0;
 sp = STACKTOP; //@line 5894
 STACKTOP = STACKTOP + 32 | 0; //@line 5895
 $vararg_buffer = sp; //@line 5896
 HEAP32[$0 + 36 >> 2] = 1; //@line 5899
 if (!(HEAP32[$0 >> 2] & 64)) {
  HEAP32[$vararg_buffer >> 2] = HEAP32[$0 + 60 >> 2]; //@line 5907
  HEAP32[$vararg_buffer + 4 >> 2] = 21523; //@line 5909
  HEAP32[$vararg_buffer + 8 >> 2] = sp + 16; //@line 5911
  if (___syscall54(54, $vararg_buffer | 0) | 0) {
   HEAP8[$0 + 75 >> 0] = -1; //@line 5916
  }
 }
 $14 = ___stdio_write($0, $1, $2) | 0; //@line 5919
 STACKTOP = sp; //@line 5920
 return $14 | 0; //@line 5920
}
function ___towrite($0) {
 $0 = $0 | 0;
 var $$0 = 0, $1 = 0, $14 = 0, $3 = 0, $7 = 0;
 $1 = $0 + 74 | 0; //@line 6182
 $3 = HEAP8[$1 >> 0] | 0; //@line 6184
 HEAP8[$1 >> 0] = $3 + 255 | $3; //@line 6188
 $7 = HEAP32[$0 >> 2] | 0; //@line 6189
 if (!($7 & 8)) {
  HEAP32[$0 + 8 >> 2] = 0; //@line 6194
  HEAP32[$0 + 4 >> 2] = 0; //@line 6196
  $14 = HEAP32[$0 + 44 >> 2] | 0; //@line 6198
  HEAP32[$0 + 28 >> 2] = $14; //@line 6200
  HEAP32[$0 + 20 >> 2] = $14; //@line 6202
  HEAP32[$0 + 16 >> 2] = $14 + (HEAP32[$0 + 48 >> 2] | 0); //@line 6208
  $$0 = 0; //@line 6209
 } else {
  HEAP32[$0 >> 2] = $7 | 32; //@line 6212
  $$0 = -1; //@line 6213
 }
 return $$0 | 0; //@line 6215
}
function __ZN4mbed11InterruptInD2Ev__async_cb($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $8 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 1660
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 1662
 $4 = HEAP32[$2 + 52 >> 2] | 0; //@line 1664
 if (!$4) {
  return;
 }
 $8 = HEAP32[$4 + 8 >> 2] | 0; //@line 1671
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(4) | 0; //@line 1672
 FUNCTION_TABLE_vi[$8 & 127]($2 + 40 | 0); //@line 1673
 if (___async) {
  HEAP32[$ReallocAsyncCtx2 >> 2] = 12; //@line 1676
  sp = STACKTOP; //@line 1677
  return;
 }
 ___async_unwind = 0; //@line 1680
 HEAP32[$ReallocAsyncCtx2 >> 2] = 12; //@line 1681
 sp = STACKTOP; //@line 1682
 return;
}
function _fmt_o($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$0$lcssa = 0, $$06 = 0, $10 = 0, $11 = 0, $7 = 0;
 if (($0 | 0) == 0 & ($1 | 0) == 0) {
  $$0$lcssa = $2; //@line 7986
 } else {
  $$06 = $2; //@line 7988
  $11 = $1; //@line 7988
  $7 = $0; //@line 7988
  while (1) {
   $10 = $$06 + -1 | 0; //@line 7993
   HEAP8[$10 >> 0] = $7 & 7 | 48; //@line 7994
   $7 = _bitshift64Lshr($7 | 0, $11 | 0, 3) | 0; //@line 7995
   $11 = tempRet0; //@line 7996
   if (($7 | 0) == 0 & ($11 | 0) == 0) {
    $$0$lcssa = $10; //@line 8001
    break;
   } else {
    $$06 = $10; //@line 8004
   }
  }
 }
 return $$0$lcssa | 0; //@line 8008
}
function __ZN4mbed8CallbackIFvvEE13function_dtorIN6events5EventIS1_EEEEvPv__async_cb($0) {
 $0 = $0 | 0;
 var $3 = 0, $5 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 11592
 $3 = HEAP32[HEAP32[$0 + 4 >> 2] >> 2] | 0; //@line 11595
 $5 = HEAP32[$3 + 4 >> 2] | 0; //@line 11597
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(4) | 0; //@line 11598
 _equeue_dealloc($5, $3); //@line 11599
 if (___async) {
  HEAP32[$ReallocAsyncCtx2 >> 2] = 74; //@line 11602
  sp = STACKTOP; //@line 11603
  return;
 }
 ___async_unwind = 0; //@line 11606
 HEAP32[$ReallocAsyncCtx2 >> 2] = 74; //@line 11607
 sp = STACKTOP; //@line 11608
 return;
}
function __GLOBAL__sub_I_main_cpp() {
 __ZN6events10EventQueueC2EjPh(4388, 1664, 0); //@line 2130
 HEAP32[1147] = 0; //@line 2131
 HEAP32[1148] = 0; //@line 2131
 HEAP32[1149] = 0; //@line 2131
 HEAP32[1150] = 0; //@line 2131
 HEAP32[1151] = 0; //@line 2131
 HEAP32[1152] = 0; //@line 2131
 _gpio_init_out(4588, 50); //@line 2132
 HEAP32[1153] = 0; //@line 2133
 HEAP32[1154] = 0; //@line 2133
 HEAP32[1155] = 0; //@line 2133
 HEAP32[1156] = 0; //@line 2133
 HEAP32[1157] = 0; //@line 2133
 HEAP32[1158] = 0; //@line 2133
 _gpio_init_out(4612, 52); //@line 2134
 __ZN4mbed11InterruptInC2E7PinName(4636, 1337); //@line 2135
 return;
}
function ___cxa_is_pointer_type($0) {
 $0 = $0 | 0;
 var $2 = 0, $3 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 11264
 do {
  if (!$0) {
   $3 = 0; //@line 11268
  } else {
   $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 11270
   $2 = ___dynamic_cast($0, 64, 120, 0) | 0; //@line 11271
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 108; //@line 11274
    sp = STACKTOP; //@line 11275
    return 0; //@line 11276
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 11278
    $3 = ($2 | 0) != 0 & 1; //@line 11281
    break;
   }
  }
 } while (0);
 return $3 | 0; //@line 11286
}
function _invoke_ticker__async_cb_49($0) {
 $0 = $0 | 0;
 var $5 = 0, $6 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 2825
 $5 = HEAP32[HEAP32[HEAP32[$0 + 4 >> 2] >> 2] >> 2] | 0; //@line 2831
 $6 = HEAP32[$0 + 8 >> 2] | 0; //@line 2832
 $ReallocAsyncCtx = _emscripten_realloc_async_context(4) | 0; //@line 2833
 FUNCTION_TABLE_vi[$5 & 127]($6); //@line 2834
 if (___async) {
  HEAP32[$ReallocAsyncCtx >> 2] = 51; //@line 2837
  sp = STACKTOP; //@line 2838
  return;
 }
 ___async_unwind = 0; //@line 2841
 HEAP32[$ReallocAsyncCtx >> 2] = 51; //@line 2842
 sp = STACKTOP; //@line 2843
 return;
}
function _getint_671($0) {
 $0 = $0 | 0;
 var $$0$lcssa = 0, $$04 = 0, $11 = 0, $12 = 0, $7 = 0;
 if (!(_isdigit(HEAP8[HEAP32[$0 >> 2] >> 0] | 0) | 0)) {
  $$0$lcssa = 0; //@line 7630
 } else {
  $$04 = 0; //@line 7632
  while (1) {
   $7 = HEAP32[$0 >> 2] | 0; //@line 7635
   $11 = ($$04 * 10 | 0) + -48 + (HEAP8[$7 >> 0] | 0) | 0; //@line 7639
   $12 = $7 + 1 | 0; //@line 7640
   HEAP32[$0 >> 2] = $12; //@line 7641
   if (!(_isdigit(HEAP8[$12 >> 0] | 0) | 0)) {
    $$0$lcssa = $11; //@line 7647
    break;
   } else {
    $$04 = $11; //@line 7650
   }
  }
 }
 return $$0$lcssa | 0; //@line 7654
}
function _main__async_cb_41($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx5 = 0, sp = 0;
 sp = STACKTOP; //@line 2512
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 2514
 $4 = HEAP32[$2 + 4 >> 2] | 0; //@line 2516
 $ReallocAsyncCtx5 = _emscripten_realloc_async_context(4) | 0; //@line 2517
 _equeue_dealloc($4, $2); //@line 2518
 if (___async) {
  HEAP32[$ReallocAsyncCtx5 >> 2] = 64; //@line 2521
  sp = STACKTOP; //@line 2522
  return;
 }
 ___async_unwind = 0; //@line 2525
 HEAP32[$ReallocAsyncCtx5 >> 2] = 64; //@line 2526
 sp = STACKTOP; //@line 2527
 return;
}
function _main__async_cb_43($0) {
 $0 = $0 | 0;
 var $2 = 0, $3 = 0, $ReallocAsyncCtx7 = 0, sp = 0;
 sp = STACKTOP; //@line 2541
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 2543
 $ReallocAsyncCtx7 = _emscripten_realloc_async_context(8) | 0; //@line 2544
 $3 = _equeue_alloc(4388, 32) | 0; //@line 2545
 if (!___async) {
  HEAP32[___async_retval >> 2] = $3; //@line 2549
  ___async_unwind = 0; //@line 2550
 }
 HEAP32[$ReallocAsyncCtx7 >> 2] = 59; //@line 2552
 HEAP32[$ReallocAsyncCtx7 + 4 >> 2] = $2; //@line 2554
 sp = STACKTOP; //@line 2555
 return;
}
function __Z9blink_ledv() {
 var $2 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 2140
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 2141
 _puts(1192) | 0; //@line 2142
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 53; //@line 2145
  sp = STACKTOP; //@line 2146
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 2149
  $2 = (_emscripten_asm_const_ii(6, HEAP32[1147] | 0) | 0) == 0 & 1; //@line 2153
  _emscripten_asm_const_iii(0, HEAP32[1147] | 0, $2 | 0) | 0; //@line 2155
  return;
 }
}
function __Z8btn_fallv() {
 var $2 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 2161
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 2162
 _puts(1280) | 0; //@line 2163
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 54; //@line 2166
  sp = STACKTOP; //@line 2167
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 2170
  $2 = (_emscripten_asm_const_ii(6, HEAP32[1153] | 0) | 0) == 0 & 1; //@line 2174
  _emscripten_asm_const_iii(0, HEAP32[1153] | 0, $2 | 0) | 0; //@line 2176
  return;
 }
}
function __ZN4mbed11InterruptInC2E7PinName($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $2 = 0, $3 = 0, $4 = 0, dest = 0, stop = 0;
 HEAP32[$0 >> 2] = 160; //@line 163
 $2 = $0 + 4 | 0; //@line 164
 $3 = $0 + 28 | 0; //@line 165
 $4 = $0; //@line 166
 dest = $2; //@line 167
 stop = dest + 68 | 0; //@line 167
 do {
  HEAP32[dest >> 2] = 0; //@line 167
  dest = dest + 4 | 0; //@line 167
 } while ((dest | 0) < (stop | 0));
 _gpio_irq_init($3, $1, 2, $4) | 0; //@line 168
 _gpio_init_in($2, $1); //@line 169
 return;
}
function __ZN6events10EventQueue13function_callINS0_9context00IPFvvEEEEEvPv($0) {
 $0 = $0 | 0;
 var $1 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 2542
 $1 = HEAP32[$0 >> 2] | 0; //@line 2543
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 2544
 FUNCTION_TABLE_v[$1 & 7](); //@line 2545
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 75; //@line 2548
  sp = STACKTOP; //@line 2549
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 2552
  return;
 }
}
function _emscripten_async_resume() {
 ___async = 0; //@line 3233
 ___async_unwind = 1; //@line 3234
 while (1) {
  if (!___async_cur_frame) return;
  dynCall_vi(HEAP32[___async_cur_frame + 8 >> 2] | 0, ___async_cur_frame + 8 | 0); //@line 3240
  if (___async) return;
  if (!___async_unwind) {
   ___async_unwind = 1; //@line 3244
   continue;
  }
  stackRestore(HEAP32[___async_cur_frame + 4 >> 2] | 0); //@line 3248
  ___async_cur_frame = HEAP32[___async_cur_frame >> 2] | 0; //@line 3250
 }
}
function _main__async_cb_44($0) {
 $0 = $0 | 0;
 var $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 2561
 $ReallocAsyncCtx3 = _emscripten_realloc_async_context(4) | 0; //@line 2562
 __ZN6events10EventQueue8dispatchEi(4388, -1); //@line 2563
 if (___async) {
  HEAP32[$ReallocAsyncCtx3 >> 2] = 65; //@line 2566
  sp = STACKTOP; //@line 2567
  return;
 }
 ___async_unwind = 0; //@line 2570
 HEAP32[$ReallocAsyncCtx3 >> 2] = 65; //@line 2571
 sp = STACKTOP; //@line 2572
 return;
}
function __ZN6events10EventQueue13function_callIPFvvEEEvPv($0) {
 $0 = $0 | 0;
 var $1 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 2366
 $1 = HEAP32[$0 >> 2] | 0; //@line 2367
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 2368
 FUNCTION_TABLE_v[$1 & 7](); //@line 2369
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 66; //@line 2372
  sp = STACKTOP; //@line 2373
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 2376
  return;
 }
}
function _handle_interrupt_in($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $2 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 2002
 $2 = HEAP32[1096] | 0; //@line 2003
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 2004
 FUNCTION_TABLE_vii[$2 & 3]($0, $1); //@line 2005
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 49; //@line 2008
  sp = STACKTOP; //@line 2009
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 2012
  return;
 }
}
function ___uremdi3($a$0, $a$1, $b$0, $b$1) {
 $a$0 = $a$0 | 0;
 $a$1 = $a$1 | 0;
 $b$0 = $b$0 | 0;
 $b$1 = $b$1 | 0;
 var $rem = 0, __stackBase__ = 0;
 __stackBase__ = STACKTOP; //@line 3176
 STACKTOP = STACKTOP + 16 | 0; //@line 3177
 $rem = __stackBase__ | 0; //@line 3178
 ___udivmoddi4($a$0, $a$1, $b$0, $b$1, $rem) | 0; //@line 3179
 STACKTOP = __stackBase__; //@line 3180
 return (tempRet0 = HEAP32[$rem + 4 >> 2] | 0, HEAP32[$rem >> 2] | 0) | 0; //@line 3181
}
function _llvm_cttz_i32(x) {
 x = x | 0;
 var ret = 0;
 ret = HEAP8[cttz_i8 + (x & 255) >> 0] | 0; //@line 2946
 if ((ret | 0) < 8) return ret | 0; //@line 2947
 ret = HEAP8[cttz_i8 + (x >> 8 & 255) >> 0] | 0; //@line 2948
 if ((ret | 0) < 8) return ret + 8 | 0; //@line 2949
 ret = HEAP8[cttz_i8 + (x >> 16 & 255) >> 0] | 0; //@line 2950
 if ((ret | 0) < 8) return ret + 16 | 0; //@line 2951
 return (HEAP8[cttz_i8 + (x >>> 24) >> 0] | 0) + 24 | 0; //@line 2952
}
function __ZNK10__cxxabiv117__class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($0, $1, $2, $3, $4, $5) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 $5 = $5 | 0;
 if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, $5) | 0) {
  __ZNK10__cxxabiv117__class_type_info29process_static_type_above_dstEPNS_19__dynamic_cast_infoEPKvS4_i(0, $1, $2, $3, $4); //@line 9777
 }
 return;
}
function __ZL25default_terminate_handlerv__async_cb_34($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $AsyncRetVal = 0;
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 1755
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 1757
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 1759
 HEAP32[$2 >> 2] = 3941; //@line 1760
 HEAP32[$2 + 4 >> 2] = $4; //@line 1762
 HEAP32[$2 + 8 >> 2] = $AsyncRetVal; //@line 1764
 _abort_message(3805, $2); //@line 1765
}
function __ZN6events10EventQueueC2EjPh($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $3 = 0;
 $3 = $0 + 184 | 0; //@line 410
 HEAP32[$3 >> 2] = 0; //@line 411
 HEAP32[$3 + 4 >> 2] = 0; //@line 411
 HEAP32[$3 + 8 >> 2] = 0; //@line 411
 HEAP32[$3 + 12 >> 2] = 0; //@line 411
 if (!$2) {
  _equeue_create($0, $1) | 0; //@line 414
  return;
 } else {
  _equeue_create_inplace($0, $1, $2) | 0; //@line 417
  return;
 }
}
function __ZN6events10EventQueue8dispatchEi($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 425
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 426
 _equeue_dispatch($0, $1); //@line 427
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 22; //@line 430
  sp = STACKTOP; //@line 431
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 434
  return;
 }
}
function _abort_message__async_cb($0) {
 $0 = $0 | 0;
 var $2 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 2790
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 2792
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(4) | 0; //@line 2793
 _fputc(10, $2) | 0; //@line 2794
 if (!___async) {
  ___async_unwind = 0; //@line 2797
 }
 HEAP32[$ReallocAsyncCtx2 >> 2] = 84; //@line 2799
 sp = STACKTOP; //@line 2800
 return;
}
function _gpio_irq_init($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $$0 = 0;
 if (($1 | 0) == -1) {
  $$0 = -1; //@line 2025
  return $$0 | 0; //@line 2026
 }
 HEAP32[1096] = $2; //@line 2028
 HEAP32[$0 >> 2] = $1; //@line 2029
 HEAP32[$0 + 4 >> 2] = $1; //@line 2031
 _emscripten_asm_const_iii(3, $3 | 0, $1 | 0) | 0; //@line 2032
 $$0 = 0; //@line 2033
 return $$0 | 0; //@line 2034
}
function __ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv__async_cb($0) {
 $0 = $0 | 0;
 var $$0 = 0, $2 = 0;
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 2851
 if ((HEAP32[$2 + 24 >> 2] | 0) == 1) {
  HEAP32[HEAP32[$0 + 8 >> 2] >> 2] = HEAP32[$2 + 16 >> 2]; //@line 2862
  $$0 = 1; //@line 2863
 } else {
  $$0 = 0; //@line 2865
 }
 HEAP8[___async_retval >> 0] = $$0 & 1; //@line 2869
 return;
}
function ___stdio_close($0) {
 $0 = $0 | 0;
 var $5 = 0, $vararg_buffer = 0, sp = 0;
 sp = STACKTOP; //@line 5705
 STACKTOP = STACKTOP + 16 | 0; //@line 5706
 $vararg_buffer = sp; //@line 5707
 HEAP32[$vararg_buffer >> 2] = _dummy(HEAP32[$0 + 60 >> 2] | 0) | 0; //@line 5711
 $5 = ___syscall_ret(___syscall6(6, $vararg_buffer | 0) | 0) | 0; //@line 5713
 STACKTOP = sp; //@line 5714
 return $5 | 0; //@line 5714
}
function __ZNK10__cxxabiv117__class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, 0) | 0) {
  __ZNK10__cxxabiv117__class_type_info24process_found_base_classEPNS_19__dynamic_cast_infoEPvi(0, $1, $2, $3); //@line 9853
 }
 return;
}
function _equeue_sema_create($0) {
 $0 = $0 | 0;
 var $$0 = 0, $1 = 0, $4 = 0;
 $1 = _pthread_mutex_init($0 | 0, 0) | 0; //@line 1557
 if (!$1) {
  $4 = _pthread_cond_init($0 + 28 | 0, 0) | 0; //@line 1561
  if (!$4) {
   HEAP8[$0 + 76 >> 0] = 0; //@line 1565
   $$0 = 0; //@line 1566
  } else {
   $$0 = $4; //@line 1568
  }
 } else {
  $$0 = $1; //@line 1571
 }
 return $$0 | 0; //@line 1573
}
function _wait_ms($0) {
 $0 = $0 | 0;
 var $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 2114
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 2115
 _emscripten_sleep($0 | 0); //@line 2116
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 52; //@line 2119
  sp = STACKTOP; //@line 2120
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 2123
  return;
 }
}
function ___cxa_get_globals_fast() {
 var $3 = 0, sp = 0;
 sp = STACKTOP; //@line 9609
 STACKTOP = STACKTOP + 16 | 0; //@line 9610
 if (!(_pthread_once(5272, 4) | 0)) {
  $3 = _pthread_getspecific(HEAP32[1319] | 0) | 0; //@line 9616
  STACKTOP = sp; //@line 9617
  return $3 | 0; //@line 9617
 } else {
  _abort_message(4080, sp); //@line 9619
 }
 return 0; //@line 9622
}
function __ZNK10__cxxabiv117__class_type_info29process_static_type_below_dstEPNS_19__dynamic_cast_infoEPKvi($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $7 = 0;
 if ((HEAP32[$1 + 4 >> 2] | 0) == ($2 | 0)) {
  $7 = $1 + 28 | 0; //@line 9917
  if ((HEAP32[$7 >> 2] | 0) != 1) {
   HEAP32[$7 >> 2] = $3; //@line 9921
  }
 }
 return;
}
function _emscripten_alloc_async_context(len, sp) {
 len = len | 0;
 sp = sp | 0;
 var new_frame = 0;
 new_frame = stackAlloc(len + 8 | 0) | 0; //@line 3210
 HEAP32[new_frame + 4 >> 2] = sp; //@line 3212
 HEAP32[new_frame >> 2] = ___async_cur_frame; //@line 3214
 ___async_cur_frame = new_frame; //@line 3215
 return ___async_cur_frame + 8 | 0; //@line 3216
}
function __ZN10__cxxabiv112_GLOBAL__N_19destruct_EPv($0) {
 $0 = $0 | 0;
 var sp = 0;
 sp = STACKTOP; //@line 10371
 STACKTOP = STACKTOP + 16 | 0; //@line 10372
 _free($0); //@line 10374
 if (!(_pthread_setspecific(HEAP32[1319] | 0, 0) | 0)) {
  STACKTOP = sp; //@line 10379
  return;
 } else {
  _abort_message(4179, sp); //@line 10381
 }
}
function __ZN4mbed8CallbackIFvvEE13function_moveIN6events5EventIS1_EEEEvPvPKv($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $2 = 0;
 HEAP32[$0 >> 2] = 0; //@line 2478
 $2 = HEAP32[$1 >> 2] | 0; //@line 2479
 if (!$2) {
  return;
 }
 HEAP32[$0 >> 2] = $2; //@line 2484
 HEAP32[$2 >> 2] = (HEAP32[$2 >> 2] | 0) + 1; //@line 2487
 return;
}
function ___cxa_can_catch__async_cb($0) {
 $0 = $0 | 0;
 var $AsyncRetVal = 0;
 $AsyncRetVal = HEAP8[___async_retval >> 0] & 1; //@line 11365
 if ($AsyncRetVal) {
  HEAP32[HEAP32[$0 + 8 >> 2] >> 2] = HEAP32[HEAP32[$0 + 4 >> 2] >> 2]; //@line 11369
 }
 HEAP32[___async_retval >> 2] = $AsyncRetVal & 1; //@line 11372
 return;
}
function _bitshift64Shl(low, high, bits) {
 low = low | 0;
 high = high | 0;
 bits = bits | 0;
 if ((bits | 0) < 32) {
  tempRet0 = high << bits | (low & (1 << bits) - 1 << 32 - bits) >>> 32 - bits; //@line 3199
  return low << bits; //@line 3200
 }
 tempRet0 = low << bits - 32; //@line 3202
 return 0; //@line 3203
}
function _equeue_tick() {
 var $0 = 0, sp = 0;
 sp = STACKTOP; //@line 1520
 STACKTOP = STACKTOP + 16 | 0; //@line 1521
 $0 = sp; //@line 1522
 _gettimeofday($0 | 0, 0) | 0; //@line 1523
 STACKTOP = sp; //@line 1530
 return ((HEAP32[$0 + 4 >> 2] | 0) / 1e3 | 0) + ((HEAP32[$0 >> 2] | 0) * 1e3 | 0) | 0; //@line 1530
}
function _bitshift64Lshr(low, high, bits) {
 low = low | 0;
 high = high | 0;
 bits = bits | 0;
 if ((bits | 0) < 32) {
  tempRet0 = high >>> bits; //@line 3188
  return low >>> bits | (high & (1 << bits) - 1) << 32 - bits; //@line 3189
 }
 tempRet0 = 0; //@line 3191
 return high >>> bits - 32 | 0; //@line 3192
}
function _equeue_dispatch__async_cb_25($0) {
 $0 = $0 | 0;
 var $4 = 0, $6 = 0;
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 13709
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 13711
 HEAP8[HEAP32[$0 + 4 >> 2] >> 0] = 1; //@line 13712
 _equeue_mutex_unlock($4); //@line 13713
 HEAP8[$6 >> 0] = 0; //@line 13714
 return;
}
function __ZN4mbed11InterruptIn4fallENS_8CallbackIFvvEEE__async_cb_28($0) {
 $0 = $0 | 0;
 var $6 = 0;
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 1387
 HEAP32[HEAP32[$0 + 8 >> 2] >> 2] = HEAP32[HEAP32[$0 + 4 >> 2] >> 2]; //@line 1389
 _gpio_irq_set($6 + 28 | 0, 2, 1); //@line 1391
 return;
}
function __ZN10__cxxabiv112_GLOBAL__N_110construct_Ev() {
 var sp = 0;
 sp = STACKTOP; //@line 10356
 STACKTOP = STACKTOP + 16 | 0; //@line 10357
 if (!(_pthread_key_create(5276, 93) | 0)) {
  STACKTOP = sp; //@line 10362
  return;
 } else {
  _abort_message(4129, sp); //@line 10364
 }
}
function _equeue_post__async_cb($0) {
 $0 = $0 | 0;
 var $AsyncRetVal = 0;
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 11388
 _equeue_sema_signal((HEAP32[$0 + 4 >> 2] | 0) + 48 | 0); //@line 11390
 HEAP32[___async_retval >> 2] = $AsyncRetVal; //@line 11392
 return;
}
function _puts__async_cb($0) {
 $0 = $0 | 0;
 var $$lobit = 0;
 $$lobit = HEAP32[___async_retval >> 2] >> 31; //@line 2444
 if (HEAP32[$0 + 4 >> 2] | 0) {
  ___unlockfile(HEAP32[$0 + 8 >> 2] | 0); //@line 2447
 }
 HEAP32[___async_retval >> 2] = $$lobit; //@line 2450
 return;
}
function ___overflow__async_cb($0) {
 $0 = $0 | 0;
 var $$0 = 0;
 if ((HEAP32[___async_retval >> 2] | 0) == 1) {
  $$0 = HEAPU8[HEAP32[$0 + 4 >> 2] >> 0] | 0; //@line 1535
 } else {
  $$0 = -1; //@line 1537
 }
 HEAP32[___async_retval >> 2] = $$0; //@line 1540
 return;
}
function ___lctrans_impl($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0 = 0;
 if (!$1) {
  $$0 = 0; //@line 6312
 } else {
  $$0 = ___mo_lookup(HEAP32[$1 >> 2] | 0, HEAP32[$1 + 4 >> 2] | 0, $0) | 0; //@line 6318
 }
 return ($$0 | 0 ? $$0 : $0) | 0; //@line 6322
}
function dynCall_viiiiii(index, a1, a2, a3, a4, a5, a6) {
 index = index | 0;
 a1 = a1 | 0;
 a2 = a2 | 0;
 a3 = a3 | 0;
 a4 = a4 | 0;
 a5 = a5 | 0;
 a6 = a6 | 0;
 FUNCTION_TABLE_viiiiii[index & 3](a1 | 0, a2 | 0, a3 | 0, a4 | 0, a5 | 0, a6 | 0); //@line 3465
}
function _fputc__async_cb($0) {
 $0 = $0 | 0;
 var $AsyncRetVal = 0;
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 11573
 ___unlockfile(HEAP32[$0 + 4 >> 2] | 0); //@line 11574
 HEAP32[___async_retval >> 2] = $AsyncRetVal; //@line 11576
 return;
}
function _gpio_init_out($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 HEAP32[$0 >> 2] = $1; //@line 1988
 if (($1 | 0) == -1) {
  return;
 }
 HEAP32[$0 + 4 >> 2] = $1; //@line 1994
 _emscripten_asm_const_iii(2, $0 | 0, $1 | 0) | 0; //@line 1995
 return;
}
function ___DOUBLE_BITS_677($0) {
 $0 = +$0;
 var $1 = 0;
 HEAPF64[tempDoublePtr >> 3] = $0; //@line 9071
 $1 = HEAP32[tempDoublePtr >> 2] | 0; //@line 9071
 tempRet0 = HEAP32[tempDoublePtr + 4 >> 2] | 0; //@line 9073
 return $1 | 0; //@line 9074
}
function _gpio_init_in($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 HEAP32[$0 >> 2] = $1; //@line 1973
 if (($1 | 0) == -1) {
  return;
 }
 HEAP32[$0 + 4 >> 2] = $1; //@line 1979
 _emscripten_asm_const_iii(1, $0 | 0, $1 | 0) | 0; //@line 1980
 return;
}
function _equeue_sema_signal($0) {
 $0 = $0 | 0;
 _pthread_mutex_lock($0 | 0) | 0; //@line 1579
 HEAP8[$0 + 76 >> 0] = 1; //@line 1581
 _pthread_cond_signal($0 + 28 | 0) | 0; //@line 1583
 _pthread_mutex_unlock($0 | 0) | 0; //@line 1584
 return;
}
function ___syscall_ret($0) {
 $0 = $0 | 0;
 var $$0 = 0;
 if ($0 >>> 0 > 4294963200) {
  HEAP32[(___errno_location() | 0) >> 2] = 0 - $0; //@line 5871
  $$0 = -1; //@line 5872
 } else {
  $$0 = $0; //@line 5874
 }
 return $$0 | 0; //@line 5876
}
function _i64Subtract(a, b, c, d) {
 a = a | 0;
 b = b | 0;
 c = c | 0;
 d = d | 0;
 var h = 0;
 h = b - d >>> 0; //@line 2939
 h = b - d - (c >>> 0 > a >>> 0 | 0) >>> 0; //@line 2940
 return (tempRet0 = h, a - c >>> 0 | 0) | 0; //@line 2941
}
function _equeue_enqueue__async_cb($0) {
 $0 = $0 | 0;
 var $4 = 0;
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 11636
 _equeue_mutex_unlock(HEAP32[$0 + 4 >> 2] | 0); //@line 11637
 HEAP32[___async_retval >> 2] = $4; //@line 11639
 return;
}
function runPostSets() {}
function _i64Add(a, b, c, d) {
 a = a | 0;
 b = b | 0;
 c = c | 0;
 d = d | 0;
 var l = 0;
 l = a + c >>> 0; //@line 2931
 return (tempRet0 = b + d + (l >>> 0 < a >>> 0 | 0) >>> 0, l | 0) | 0; //@line 2933
}
function __Z8btn_fallv__async_cb($0) {
 $0 = $0 | 0;
 var $3 = 0;
 $3 = (_emscripten_asm_const_ii(6, HEAP32[1153] | 0) | 0) == 0 & 1; //@line 11624
 _emscripten_asm_const_iii(0, HEAP32[1153] | 0, $3 | 0) | 0; //@line 11626
 return;
}
function dynCall_viiiii(index, a1, a2, a3, a4, a5) {
 index = index | 0;
 a1 = a1 | 0;
 a2 = a2 | 0;
 a3 = a3 | 0;
 a4 = a4 | 0;
 a5 = a5 | 0;
 FUNCTION_TABLE_viiiii[index & 3](a1 | 0, a2 | 0, a3 | 0, a4 | 0, a5 | 0); //@line 3458
}
function __Z9blink_ledv__async_cb($0) {
 $0 = $0 | 0;
 var $3 = 0;
 $3 = (_emscripten_asm_const_ii(6, HEAP32[1147] | 0) | 0) == 0 & 1; //@line 1512
 _emscripten_asm_const_iii(0, HEAP32[1147] | 0, $3 | 0) | 0; //@line 1514
 return;
}
function ___clang_call_terminate($0) {
 $0 = $0 | 0;
 var sp = 0;
 sp = STACKTOP; //@line 47
 ___cxa_begin_catch($0 | 0) | 0; //@line 48
 _emscripten_alloc_async_context(4, sp) | 0; //@line 49
 __ZSt9terminatev(); //@line 50
}
function dynCall_viiii(index, a1, a2, a3, a4) {
 index = index | 0;
 a1 = a1 | 0;
 a2 = a2 | 0;
 a3 = a3 | 0;
 a4 = a4 | 0;
 FUNCTION_TABLE_viiii[index & 3](a1 | 0, a2 | 0, a3 | 0, a4 | 0); //@line 3451
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
  $$0 = 0; //@line 8131
 } else {
  $$0 = _wcrtomb($0, $1, 0) | 0; //@line 8134
 }
 return $$0 | 0; //@line 8136
}
function _emscripten_free_async_context(ctx) {
 ctx = ctx | 0;
 stackRestore(___async_cur_frame | 0); //@line 3222
 ___async_cur_frame = HEAP32[___async_cur_frame >> 2] | 0; //@line 3223
}
function dynCall_iiii(index, a1, a2, a3) {
 index = index | 0;
 a1 = a1 | 0;
 a2 = a2 | 0;
 a3 = a3 | 0;
 return FUNCTION_TABLE_iiii[index & 7](a1 | 0, a2 | 0, a3 | 0) | 0; //@line 3423
}
function ___udivdi3($a$0, $a$1, $b$0, $b$1) {
 $a$0 = $a$0 | 0;
 $a$1 = $a$1 | 0;
 $b$0 = $b$0 | 0;
 $b$1 = $b$1 | 0;
 return ___udivmoddi4($a$0, $a$1, $b$0, $b$1, 0) | 0; //@line 3168
}
function _fputs($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $2 = 0;
 $2 = _strlen($0) | 0; //@line 6052
 return ((_fwrite($0, 1, $2, $1) | 0) != ($2 | 0)) << 31 >> 31 | 0; //@line 6056
}
function ___dynamic_cast__async_cb($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = (HEAP32[HEAP32[$0 + 4 >> 2] >> 2] | 0) == 1 ? HEAP32[$0 + 8 >> 2] | 0 : 0; //@line 2301
 return;
}
function __ZN6events5EventIFvvEE10event_postIPS1_EEiPNS2_5eventE__async_cb($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = HEAP32[___async_retval >> 2]; //@line 12115
 return;
}
function _gpio_irq_set($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 _emscripten_asm_const_iiii(5, HEAP32[$0 + 4 >> 2] | 0, $1 | 0, $2 | 0) | 0; //@line 2053
 return;
}
function _emscripten_realloc_async_context(len) {
 len = len | 0;
 stackRestore(___async_cur_frame | 0); //@line 3228
 return (stackAlloc(len + 8 | 0) | 0) + 8 | 0; //@line 3229
}
function establishStackSpace(stackBase, stackMax) {
 stackBase = stackBase | 0;
 stackMax = stackMax | 0;
 STACKTOP = stackBase; //@line 20
 STACK_MAX = stackMax; //@line 21
}
function __ZN4mbed11InterruptIn4fallENS_8CallbackIFvvEEE__async_cb_31($0) {
 $0 = $0 | 0;
 _gpio_irq_set((HEAP32[$0 + 8 >> 2] | 0) + 28 | 0, 2, 0); //@line 1502
 return;
}
function __ZN10__cxxabiv121__vmi_class_type_infoD0Ev($0) {
 $0 = $0 | 0;
 __ZN10__cxxabiv116__shim_type_infoD2Ev($0); //@line 10456
 __ZdlPv($0); //@line 10457
 return;
}
function __ZN10__cxxabiv120__si_class_type_infoD0Ev($0) {
 $0 = $0 | 0;
 __ZN10__cxxabiv116__shim_type_infoD2Ev($0); //@line 10139
 __ZdlPv($0); //@line 10140
 return;
}
function _swapc($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $3 = 0;
 $3 = _llvm_bswap_i32($0 | 0) | 0; //@line 6448
 return (($1 | 0) == 0 ? $0 : $3) | 0; //@line 6450
}
function __ZN10__cxxabiv117__class_type_infoD0Ev($0) {
 $0 = $0 | 0;
 __ZN10__cxxabiv116__shim_type_infoD2Ev($0); //@line 9667
 __ZdlPv($0); //@line 9668
 return;
}
function ___cxa_is_pointer_type__async_cb($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = (HEAP32[___async_retval >> 2] | 0) != 0 & 1; //@line 12063
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
  ___fwritex($1, $2, $0) | 0; //@line 7616
 }
 return;
}
function __ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 return ($0 | 0) == ($1 | 0) | 0; //@line 9864
}
function __ZSt13get_terminatev() {
 var $0 = 0;
 $0 = HEAP32[170] | 0; //@line 10446
 HEAP32[170] = $0 + 0; //@line 10448
 return $0 | 0; //@line 10450
}
function __ZNK10__cxxabiv122__base_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function dynCall_vii(index, a1, a2) {
 index = index | 0;
 a1 = a1 | 0;
 a2 = a2 | 0;
 FUNCTION_TABLE_vii[index & 3](a1 | 0, a2 | 0); //@line 3444
}
function __ZNK10__cxxabiv120__si_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function b7(p0, p1, p2, p3, p4, p5) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 p3 = p3 | 0;
 p4 = p4 | 0;
 p5 = p5 | 0;
 abort(7); //@line 3490
}
function __ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function _llvm_bswap_i32(x) {
 x = x | 0;
 return (x & 255) << 24 | (x >> 8 & 255) << 16 | (x >> 16 & 255) << 8 | x >>> 24 | 0; //@line 3255
}
function __ZNK10__cxxabiv120__si_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function __ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_1($0) {
 $0 = $0 | 0;
 return;
}
function _strerror($0) {
 $0 = $0 | 0;
 return ___strerror_l($0, HEAP32[(___pthread_self_85() | 0) + 188 >> 2] | 0) | 0; //@line 8079
}
function _fputc__async_cb_4($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = HEAP32[___async_retval >> 2]; //@line 11586
 return;
}
function dynCall_ii(index, a1) {
 index = index | 0;
 a1 = a1 | 0;
 return FUNCTION_TABLE_ii[index & 3](a1 | 0) | 0; //@line 3416
}
function b6(p0, p1, p2, p3, p4) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 p3 = p3 | 0;
 p4 = p4 | 0;
 abort(6); //@line 3487
}
function __ZN4mbed11InterruptInD0Ev__async_cb_21($0) {
 $0 = $0 | 0;
 __ZdlPv(HEAP32[$0 + 4 >> 2] | 0); //@line 12105
 return;
}
function _gpio_irq_free($0) {
 $0 = $0 | 0;
 _emscripten_asm_const_ii(4, HEAP32[$0 + 4 >> 2] | 0) | 0; //@line 2042
 return;
}
function __ZSt11__terminatePFvvE__async_cb($0) {
 $0 = $0 | 0;
 _abort_message(4232, HEAP32[$0 + 4 >> 2] | 0); //@line 2391
}
function dynCall_vi(index, a1) {
 index = index | 0;
 a1 = a1 | 0;
 FUNCTION_TABLE_vi[index & 127](a1 | 0); //@line 3437
}
function _equeue_event_period($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 HEAP32[$0 + -12 >> 2] = $1; //@line 1506
 return;
}
function _equeue_event_delay($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 HEAP32[$0 + -16 >> 2] = $1; //@line 1497
 return;
}
function __ZN4mbed8CallbackIFvvEE13function_callIN6events5EventIS1_EEEEvPKv__async_cb_40($0) {
 $0 = $0 | 0;
 return;
}
function b1(p0, p1, p2) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 abort(1); //@line 3472
 return 0; //@line 3472
}
function _equeue_event_dtor($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 HEAP32[$0 + -8 >> 2] = $1; //@line 1515
 return;
}
function __ZN4mbed8CallbackIFvvEE13function_dtorIN6events5EventIS1_EEEEvPv__async_cb_5($0) {
 $0 = $0 | 0;
 return;
}
function __ZN6events10EventQueue13function_callINS0_9context00IPFvvEEEEEvPv__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function b5(p0, p1, p2, p3) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 p3 = p3 | 0;
 abort(5); //@line 3484
}
function _equeue_mutex_unlock($0) {
 $0 = $0 | 0;
 _pthread_mutex_unlock($0 | 0) | 0; //@line 1550
 return;
}
function ___lctrans($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 return ___lctrans_impl($0, $1) | 0; //@line 9324
}
function _equeue_mutex_create($0) {
 $0 = $0 | 0;
 return _pthread_mutex_init($0 | 0, 0) | 0; //@line 1537
}
function __ZN4mbed11InterruptIn12_irq_handlerEj14gpio_irq_event__async_cb_32($0) {
 $0 = $0 | 0;
 return;
}
function _main__async_cb_42($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = 0; //@line 2535
 return;
}
function __ZN6events10EventQueue13function_dtorINS0_9context00IPFvvEEEEEvPv($0) {
 $0 = $0 | 0;
 return;
}
function _equeue_mutex_lock($0) {
 $0 = $0 | 0;
 _pthread_mutex_lock($0 | 0) | 0; //@line 1543
 return;
}
function __ZN4mbed11InterruptIn12_irq_handlerEj14gpio_irq_event__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function __ZN6events10EventQueue13function_callIPFvvEEEvPv__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function __ZN6events5EventIFvvEE10event_dtorIPS1_EEvPNS2_5eventE($0) {
 $0 = $0 | 0;
 return;
}
function dynCall_v(index) {
 index = index | 0;
 FUNCTION_TABLE_v[index & 7](); //@line 3430
}
function _mbed_error_printf($0, $varargs) {
 $0 = $0 | 0;
 $varargs = $varargs | 0;
 return;
}
function _isdigit($0) {
 $0 = $0 | 0;
 return ($0 + -48 | 0) >>> 0 < 10 | 0; //@line 5929
}
function __ZN6events10EventQueue13function_dtorIPFvvEEEvPv($0) {
 $0 = $0 | 0;
 return;
}
function __ZN6events10EventQueue8dispatchEi__async_cb($0) {
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
function _abort_message__async_cb_48($0) {
 $0 = $0 | 0;
 _abort(); //@line 2807
}
function setTempRet0(value) {
 value = value | 0;
 tempRet0 = value; //@line 38
}
function b0(p0) {
 p0 = p0 | 0;
 abort(0); //@line 3469
 return 0; //@line 3469
}
function _frexpl($0, $1) {
 $0 = +$0;
 $1 = $1 | 0;
 return +(+_frexp($0, $1));
}
function __ZN4mbed11InterruptInD2Ev__async_cb_33($0) {
 $0 = $0 | 0;
 return;
}
function __ZN10__cxxabiv116__shim_type_infoD2Ev($0) {
 $0 = $0 | 0;
 return;
}
function ___pthread_self_910() {
 return _pthread_self() | 0; //@line 9245
}
function b4(p0, p1) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 abort(4); //@line 3481
}
function ___pthread_self_85() {
 return _pthread_self() | 0; //@line 9251
}
function stackRestore(top) {
 top = top | 0;
 STACKTOP = top; //@line 15
}
function _pthread_mutex_unlock(x) {
 x = x | 0;
 return 0; //@line 3382
}
function __ZdlPv($0) {
 $0 = $0 | 0;
 _free($0); //@line 9493
 return;
}
function _pthread_mutex_lock(x) {
 x = x | 0;
 return 0; //@line 3378
}
function _mbed_assert_internal__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function _handle_interrupt_in__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function _dummy($0) {
 $0 = $0 | 0;
 return $0 | 0; //@line 5887
}
function ___lockfile($0) {
 $0 = $0 | 0;
 return 0; //@line 6104
}
function _invoke_ticker__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function ___clang_call_terminate__async_cb($0) {
 $0 = $0 | 0;
}
function __ZNSt9type_infoD2Ev($0) {
 $0 = $0 | 0;
 return;
}
function getTempRet0() {
 return tempRet0 | 0; //@line 41
}
function ___errno_location() {
 return 5268; //@line 5881
}
function __ZSt9terminatev__async_cb_3($0) {
 $0 = $0 | 0;
}
function _wait_ms__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function stackSave() {
 return STACKTOP | 0; //@line 11
}
function b3(p0) {
 p0 = p0 | 0;
 abort(3); //@line 3478
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
 return 436; //@line 5934
}
function ___unlockfile($0) {
 $0 = $0 | 0;
 return;
}
function setAsync() {
 ___async = 1; //@line 25
}
function b2() {
 abort(2); //@line 3475
}

// EMSCRIPTEN_END_FUNCS
var FUNCTION_TABLE_ii = [b0,___stdio_close,__ZN6events5EventIFvvEE10event_postIPS1_EEiPNS2_5eventE,b0];
var FUNCTION_TABLE_iiii = [b1,___stdio_write,___stdio_seek,___stdout_write,__ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv,b1,b1,b1];
var FUNCTION_TABLE_v = [b2,__ZL25default_terminate_handlerv,__Z9blink_ledv,__Z8btn_fallv,__ZN10__cxxabiv112_GLOBAL__N_110construct_Ev,b2,b2,b2];
var FUNCTION_TABLE_vi = [b3,__ZN4mbed11InterruptInD2Ev,__ZN4mbed11InterruptInD0Ev,__ZN4mbed8CallbackIFvvEE13function_callIN6events5EventIS1_EEEEvPKv,__ZN4mbed8CallbackIFvvEE13function_dtorIN6events5EventIS1_EEEEvPv,__ZN10__cxxabiv116__shim_type_infoD2Ev,__ZN10__cxxabiv117__class_type_infoD0Ev,__ZNK10__cxxabiv116__shim_type_info5noop1Ev,__ZNK10__cxxabiv116__shim_type_info5noop2Ev,__ZN10__cxxabiv120__si_class_type_infoD0Ev,__ZN10__cxxabiv121__vmi_class_type_infoD0Ev,__ZN4mbed11InterruptInD2Ev__async_cb,__ZN4mbed11InterruptInD2Ev__async_cb_33,__ZN4mbed11InterruptInD0Ev__async_cb,__ZN4mbed11InterruptInD0Ev__async_cb_21,__ZN4mbed11InterruptIn12_irq_handlerEj14gpio_irq_event__async_cb,__ZN4mbed11InterruptIn12_irq_handlerEj14gpio_irq_event__async_cb_32,__ZN4mbed11InterruptIn4fallENS_8CallbackIFvvEEE__async_cb,__ZN4mbed11InterruptIn4fallENS_8CallbackIFvvEEE__async_cb_28,__ZN4mbed11InterruptIn4fallENS_8CallbackIFvvEEE__async_cb_29,__ZN4mbed11InterruptIn4fallENS_8CallbackIFvvEEE__async_cb_30,__ZN4mbed11InterruptIn4fallENS_8CallbackIFvvEEE__async_cb_31,__ZN6events10EventQueue8dispatchEi__async_cb,_equeue_alloc__async_cb,_equeue_dealloc__async_cb,_equeue_post__async_cb,_equeue_enqueue__async_cb,_equeue_dispatch__async_cb,_equeue_dispatch__async_cb_26
,_equeue_dispatch__async_cb_24,_equeue_dispatch__async_cb_25,_equeue_dispatch__async_cb_27,_mbed_assert_internal__async_cb,_mbed_die__async_cb_20,_mbed_die__async_cb_19,_mbed_die__async_cb_18,_mbed_die__async_cb_17,_mbed_die__async_cb_16,_mbed_die__async_cb_15,_mbed_die__async_cb_14,_mbed_die__async_cb_13,_mbed_die__async_cb_12,_mbed_die__async_cb_11,_mbed_die__async_cb_10,_mbed_die__async_cb_9,_mbed_die__async_cb_8,_mbed_die__async_cb_7,_mbed_die__async_cb_6,_mbed_die__async_cb,_handle_interrupt_in__async_cb,_invoke_ticker__async_cb_49,_invoke_ticker__async_cb,_wait_ms__async_cb,__Z9blink_ledv__async_cb,__Z8btn_fallv__async_cb,_main__async_cb_47,__ZN6events10EventQueue13function_dtorIPFvvEEEvPv,__ZN6events10EventQueue13function_callIPFvvEEEvPv,_main__async_cb_43
,_main__async_cb_46,__ZN6events5EventIFvvEE10event_dtorIPS1_EEvPNS2_5eventE,_main__async_cb_45,_main__async_cb,_main__async_cb_41,_main__async_cb_44,_main__async_cb_42,__ZN6events10EventQueue13function_callIPFvvEEEvPv__async_cb,__ZN6events5EventIFvvEE10event_postIPS1_EEiPNS2_5eventE__async_cb_22,__ZN6events10EventQueue13function_dtorINS0_9context00IPFvvEEEEEvPv,__ZN6events10EventQueue13function_callINS0_9context00IPFvvEEEEEvPv,__ZN6events5EventIFvvEE10event_postIPS1_EEiPNS2_5eventE__async_cb,__ZN4mbed8CallbackIFvvEE13function_callIN6events5EventIS1_EEEEvPKv__async_cb,__ZN4mbed8CallbackIFvvEE13function_callIN6events5EventIS1_EEEEvPKv__async_cb_40,__ZN4mbed8CallbackIFvvEE13function_dtorIN6events5EventIS1_EEEEvPv__async_cb,__ZN4mbed8CallbackIFvvEE13function_dtorIN6events5EventIS1_EEEEvPv__async_cb_5,__ZN6events10EventQueue13function_callINS0_9context00IPFvvEEEEEvPv__async_cb,___overflow__async_cb,_vfprintf__async_cb,_fputc__async_cb_4,_fputc__async_cb,_puts__async_cb,__ZL25default_terminate_handlerv__async_cb,__ZL25default_terminate_handlerv__async_cb_34,_abort_message__async_cb,_abort_message__async_cb_48,__ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv__async_cb_50,__ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv__async_cb,___dynamic_cast__async_cb,___dynamic_cast__async_cb_39
,__ZNK10__cxxabiv120__si_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb,__ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb,__ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_1,__ZNK10__cxxabiv120__si_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb,__ZN10__cxxabiv112_GLOBAL__N_19destruct_EPv,__ZSt11__terminatePFvvE__async_cb,__ZNK10__cxxabiv121__vmi_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb_23,__ZNK10__cxxabiv121__vmi_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb,__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_38,__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_37,__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_36,__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_35,__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb,__ZNK10__cxxabiv121__vmi_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb_2,__ZNK10__cxxabiv121__vmi_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb,__ZNK10__cxxabiv122__base_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb,__ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb,__ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb,___cxa_can_catch__async_cb,___cxa_is_pointer_type__async_cb,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3
,b3,b3,b3,b3,b3,b3,b3,b3,b3];
var FUNCTION_TABLE_vii = [b4,__ZN4mbed8CallbackIFvvEE13function_moveIN6events5EventIS1_EEEEvPvPKv,__ZN4mbed11InterruptIn12_irq_handlerEj14gpio_irq_event,b4];
var FUNCTION_TABLE_viiii = [b5,__ZNK10__cxxabiv117__class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi,__ZNK10__cxxabiv120__si_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi,__ZNK10__cxxabiv121__vmi_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi];
var FUNCTION_TABLE_viiiii = [b6,__ZNK10__cxxabiv117__class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib,__ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib,__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib];
var FUNCTION_TABLE_viiiiii = [b7,__ZNK10__cxxabiv117__class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib,__ZNK10__cxxabiv120__si_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib,__ZNK10__cxxabiv121__vmi_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib];

  return { __GLOBAL__sub_I_main_cpp: __GLOBAL__sub_I_main_cpp, ___cxa_can_catch: ___cxa_can_catch, ___cxa_is_pointer_type: ___cxa_is_pointer_type, ___errno_location: ___errno_location, ___udivdi3: ___udivdi3, ___uremdi3: ___uremdi3, _bitshift64Lshr: _bitshift64Lshr, _bitshift64Shl: _bitshift64Shl, _emscripten_alloc_async_context: _emscripten_alloc_async_context, _emscripten_async_resume: _emscripten_async_resume, _emscripten_free_async_context: _emscripten_free_async_context, _emscripten_realloc_async_context: _emscripten_realloc_async_context, _free: _free, _handle_interrupt_in: _handle_interrupt_in, _i64Add: _i64Add, _i64Subtract: _i64Subtract, _invoke_ticker: _invoke_ticker, _llvm_bswap_i32: _llvm_bswap_i32, _main: _main, _malloc: _malloc, _memcpy: _memcpy, _memset: _memset, _pthread_mutex_lock: _pthread_mutex_lock, _pthread_mutex_unlock: _pthread_mutex_unlock, _sbrk: _sbrk, dynCall_ii: dynCall_ii, dynCall_iiii: dynCall_iiii, dynCall_v: dynCall_v, dynCall_vi: dynCall_vi, dynCall_vii: dynCall_vii, dynCall_viiii: dynCall_viiii, dynCall_viiiii: dynCall_viiiii, dynCall_viiiiii: dynCall_viiiiii, establishStackSpace: establishStackSpace, getTempRet0: getTempRet0, runPostSets: runPostSets, setAsync: setAsync, setTempRet0: setTempRet0, setThrew: setThrew, stackAlloc: stackAlloc, stackRestore: stackRestore, stackSave: stackSave };
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
var dynCall_ii = Module["dynCall_ii"] = asm["dynCall_ii"];
var dynCall_iiii = Module["dynCall_iiii"] = asm["dynCall_iiii"];
var dynCall_v = Module["dynCall_v"] = asm["dynCall_v"];
var dynCall_vi = Module["dynCall_vi"] = asm["dynCall_vi"];
var dynCall_vii = Module["dynCall_vii"] = asm["dynCall_vii"];
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






//# sourceMappingURL=events.js.map
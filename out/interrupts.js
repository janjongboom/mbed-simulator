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
 function($0) { window.MbedJSHal.timers.ticker_detach($0); },
 function($0, $1) { window.MbedJSHal.timers.ticker_setup($0, $1); },
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

STATICTOP = STATIC_BASE + 6976;
/* global initializers */  __ATINIT__.push({ func: function() { __GLOBAL__sub_I_main_cpp() } });


memoryInitializer = "interrupts.js.mem";





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

  function ___cxa_pure_virtual() {
      ABORT = true;
      throw 'Pure virtual function called!';
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



   

  function _llvm_trap() {
      abort('trap!');
    }

  
  function _emscripten_memcpy_big(dest, src, num) {
      HEAPU8.set(HEAPU8.subarray(src, src+num), dest);
      return dest;
    } 

   

  
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

Module.asmLibraryArg = { "abort": abort, "assert": assert, "enlargeMemory": enlargeMemory, "getTotalMemory": getTotalMemory, "abortOnCannotGrowMemory": abortOnCannotGrowMemory, "invoke_i": invoke_i, "invoke_ii": invoke_ii, "invoke_iiii": invoke_iiii, "invoke_v": invoke_v, "invoke_vi": invoke_vi, "invoke_vii": invoke_vii, "invoke_viiii": invoke_viiii, "invoke_viiiii": invoke_viiiii, "invoke_viiiiii": invoke_viiiiii, "__ZSt18uncaught_exceptionv": __ZSt18uncaught_exceptionv, "___cxa_begin_catch": ___cxa_begin_catch, "___cxa_find_matching_catch": ___cxa_find_matching_catch, "___cxa_pure_virtual": ___cxa_pure_virtual, "___gxx_personality_v0": ___gxx_personality_v0, "___resumeException": ___resumeException, "___setErrNo": ___setErrNo, "___syscall140": ___syscall140, "___syscall146": ___syscall146, "___syscall54": ___syscall54, "___syscall6": ___syscall6, "_abort": _abort, "_emscripten_asm_const_ii": _emscripten_asm_const_ii, "_emscripten_asm_const_iii": _emscripten_asm_const_iii, "_emscripten_asm_const_iiii": _emscripten_asm_const_iiii, "_emscripten_get_now": _emscripten_get_now, "_emscripten_memcpy_big": _emscripten_memcpy_big, "_emscripten_set_main_loop": _emscripten_set_main_loop, "_emscripten_set_main_loop_timing": _emscripten_set_main_loop_timing, "_emscripten_sleep": _emscripten_sleep, "_llvm_trap": _llvm_trap, "_pthread_getspecific": _pthread_getspecific, "_pthread_key_create": _pthread_key_create, "_pthread_once": _pthread_once, "_pthread_setspecific": _pthread_setspecific, "flush_NO_FILESYSTEM": flush_NO_FILESYSTEM, "DYNAMICTOP_PTR": DYNAMICTOP_PTR, "tempDoublePtr": tempDoublePtr, "ABORT": ABORT, "STACKTOP": STACKTOP, "STACK_MAX": STACK_MAX, "cttz_i8": cttz_i8, "___async": ___async, "___async_unwind": ___async_unwind, "___async_retval": ___async_retval, "___async_cur_frame": ___async_cur_frame };
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
  var invoke_i=env.invoke_i;
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
  var ___cxa_pure_virtual=env.___cxa_pure_virtual;
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
  var _llvm_trap=env._llvm_trap;
  var _pthread_getspecific=env._pthread_getspecific;
  var _pthread_key_create=env._pthread_key_create;
  var _pthread_once=env._pthread_once;
  var _pthread_setspecific=env._pthread_setspecific;
  var flush_NO_FILESYSTEM=env.flush_NO_FILESYSTEM;
  var tempFloat = 0.0;

// EMSCRIPTEN_START_FUNCS
function _malloc($0) {
 $0 = $0 | 0;
 var $$$0192$i = 0, $$$0193$i = 0, $$$4351$i = 0, $$$i = 0, $$0 = 0, $$0$i$i = 0, $$0$i$i$i = 0, $$0$i17$i = 0, $$0189$i = 0, $$0192$lcssa$i = 0, $$01926$i = 0, $$0193$lcssa$i = 0, $$01935$i = 0, $$0197 = 0, $$0199 = 0, $$0206$i$i = 0, $$0207$i$i = 0, $$0211$i$i = 0, $$0212$i$i = 0, $$024367$i = 0, $$0287$i$i = 0, $$0288$i$i = 0, $$0289$i$i = 0, $$0295$i$i = 0, $$0296$i$i = 0, $$0342$i = 0, $$0344$i = 0, $$0345$i = 0, $$0347$i = 0, $$0353$i = 0, $$0358$i = 0, $$0359$i = 0, $$0361$i = 0, $$0362$i = 0, $$0368$i = 0, $$1196$i = 0, $$1198$i = 0, $$124466$i = 0, $$1291$i$i = 0, $$1293$i$i = 0, $$1343$i = 0, $$1348$i = 0, $$1363$i = 0, $$1370$i = 0, $$1374$i = 0, $$2234243136$i = 0, $$2247$ph$i = 0, $$2253$ph$i = 0, $$2355$i = 0, $$3$i = 0, $$3$i$i = 0, $$3$i203 = 0, $$3350$i = 0, $$3372$i = 0, $$4$lcssa$i = 0, $$4$ph$i = 0, $$414$i = 0, $$4236$i = 0, $$4351$lcssa$i = 0, $$435113$i = 0, $$4357$$4$i = 0, $$4357$ph$i = 0, $$435712$i = 0, $$723947$i = 0, $$748$i = 0, $$pre$phi$i$iZ2D = 0, $$pre$phi$i19$iZ2D = 0, $$pre$phi$i211Z2D = 0, $$pre$phi$iZ2D = 0, $$pre$phi11$i$iZ2D = 0, $$pre$phiZ2D = 0, $1 = 0, $1004 = 0, $101 = 0, $1010 = 0, $1013 = 0, $1014 = 0, $102 = 0, $1032 = 0, $1034 = 0, $1041 = 0, $1042 = 0, $1043 = 0, $1052 = 0, $1054 = 0, $1055 = 0, $1056 = 0, $108 = 0, $112 = 0, $114 = 0, $115 = 0, $117 = 0, $119 = 0, $121 = 0, $123 = 0, $125 = 0, $127 = 0, $129 = 0, $134 = 0, $138 = 0, $14 = 0, $143 = 0, $146 = 0, $149 = 0, $150 = 0, $157 = 0, $159 = 0, $16 = 0, $162 = 0, $164 = 0, $167 = 0, $169 = 0, $17 = 0, $172 = 0, $175 = 0, $176 = 0, $178 = 0, $179 = 0, $18 = 0, $181 = 0, $182 = 0, $184 = 0, $185 = 0, $19 = 0, $190 = 0, $191 = 0, $20 = 0, $204 = 0, $208 = 0, $214 = 0, $221 = 0, $225 = 0, $234 = 0, $235 = 0, $237 = 0, $238 = 0, $242 = 0, $243 = 0, $251 = 0, $252 = 0, $253 = 0, $255 = 0, $256 = 0, $261 = 0, $262 = 0, $265 = 0, $267 = 0, $27 = 0, $270 = 0, $275 = 0, $282 = 0, $292 = 0, $296 = 0, $30 = 0, $302 = 0, $306 = 0, $309 = 0, $313 = 0, $315 = 0, $316 = 0, $318 = 0, $320 = 0, $322 = 0, $324 = 0, $326 = 0, $328 = 0, $330 = 0, $34 = 0, $340 = 0, $341 = 0, $352 = 0, $354 = 0, $357 = 0, $359 = 0, $362 = 0, $364 = 0, $367 = 0, $37 = 0, $370 = 0, $371 = 0, $373 = 0, $374 = 0, $376 = 0, $377 = 0, $379 = 0, $380 = 0, $385 = 0, $386 = 0, $391 = 0, $399 = 0, $403 = 0, $409 = 0, $41 = 0, $416 = 0, $420 = 0, $428 = 0, $431 = 0, $432 = 0, $433 = 0, $437 = 0, $438 = 0, $44 = 0, $444 = 0, $449 = 0, $450 = 0, $453 = 0, $455 = 0, $458 = 0, $463 = 0, $469 = 0, $47 = 0, $471 = 0, $473 = 0, $475 = 0, $49 = 0, $492 = 0, $494 = 0, $50 = 0, $501 = 0, $502 = 0, $503 = 0, $512 = 0, $514 = 0, $515 = 0, $517 = 0, $52 = 0, $526 = 0, $530 = 0, $532 = 0, $533 = 0, $534 = 0, $54 = 0, $545 = 0, $546 = 0, $547 = 0, $548 = 0, $549 = 0, $550 = 0, $552 = 0, $554 = 0, $555 = 0, $56 = 0, $561 = 0, $563 = 0, $565 = 0, $570 = 0, $572 = 0, $574 = 0, $575 = 0, $576 = 0, $58 = 0, $584 = 0, $585 = 0, $588 = 0, $592 = 0, $595 = 0, $597 = 0, $6 = 0, $60 = 0, $603 = 0, $607 = 0, $611 = 0, $62 = 0, $620 = 0, $621 = 0, $627 = 0, $629 = 0, $633 = 0, $636 = 0, $638 = 0, $64 = 0, $642 = 0, $644 = 0, $649 = 0, $650 = 0, $651 = 0, $657 = 0, $658 = 0, $659 = 0, $663 = 0, $67 = 0, $673 = 0, $675 = 0, $680 = 0, $681 = 0, $682 = 0, $688 = 0, $69 = 0, $690 = 0, $694 = 0, $7 = 0, $70 = 0, $700 = 0, $704 = 0, $71 = 0, $710 = 0, $712 = 0, $718 = 0, $72 = 0, $722 = 0, $723 = 0, $728 = 0, $73 = 0, $734 = 0, $739 = 0, $742 = 0, $743 = 0, $746 = 0, $748 = 0, $750 = 0, $753 = 0, $764 = 0, $769 = 0, $77 = 0, $771 = 0, $774 = 0, $776 = 0, $779 = 0, $782 = 0, $783 = 0, $784 = 0, $786 = 0, $788 = 0, $789 = 0, $791 = 0, $792 = 0, $797 = 0, $798 = 0, $8 = 0, $80 = 0, $812 = 0, $815 = 0, $816 = 0, $822 = 0, $83 = 0, $830 = 0, $836 = 0, $839 = 0, $84 = 0, $840 = 0, $841 = 0, $845 = 0, $846 = 0, $852 = 0, $857 = 0, $858 = 0, $861 = 0, $863 = 0, $866 = 0, $87 = 0, $871 = 0, $877 = 0, $879 = 0, $881 = 0, $882 = 0, $9 = 0, $900 = 0, $902 = 0, $909 = 0, $910 = 0, $911 = 0, $919 = 0, $92 = 0, $923 = 0, $927 = 0, $929 = 0, $93 = 0, $935 = 0, $936 = 0, $938 = 0, $939 = 0, $940 = 0, $941 = 0, $943 = 0, $948 = 0, $949 = 0, $95 = 0, $950 = 0, $956 = 0, $958 = 0, $96 = 0, $964 = 0, $969 = 0, $972 = 0, $973 = 0, $974 = 0, $978 = 0, $979 = 0, $98 = 0, $985 = 0, $990 = 0, $991 = 0, $994 = 0, $996 = 0, $999 = 0, label = 0, sp = 0, $958$looptemp = 0;
 sp = STACKTOP; //@line 2642
 STACKTOP = STACKTOP + 16 | 0; //@line 2643
 $1 = sp; //@line 2644
 do {
  if ($0 >>> 0 < 245) {
   $6 = $0 >>> 0 < 11 ? 16 : $0 + 11 & -8; //@line 2651
   $7 = $6 >>> 3; //@line 2652
   $8 = HEAP32[1341] | 0; //@line 2653
   $9 = $8 >>> $7; //@line 2654
   if ($9 & 3 | 0) {
    $14 = ($9 & 1 ^ 1) + $7 | 0; //@line 2660
    $16 = 5404 + ($14 << 1 << 2) | 0; //@line 2662
    $17 = $16 + 8 | 0; //@line 2663
    $18 = HEAP32[$17 >> 2] | 0; //@line 2664
    $19 = $18 + 8 | 0; //@line 2665
    $20 = HEAP32[$19 >> 2] | 0; //@line 2666
    do {
     if (($20 | 0) == ($16 | 0)) {
      HEAP32[1341] = $8 & ~(1 << $14); //@line 2673
     } else {
      if ((HEAP32[1345] | 0) >>> 0 > $20 >>> 0) {
       _abort(); //@line 2678
      }
      $27 = $20 + 12 | 0; //@line 2681
      if ((HEAP32[$27 >> 2] | 0) == ($18 | 0)) {
       HEAP32[$27 >> 2] = $16; //@line 2685
       HEAP32[$17 >> 2] = $20; //@line 2686
       break;
      } else {
       _abort(); //@line 2689
      }
     }
    } while (0);
    $30 = $14 << 3; //@line 2694
    HEAP32[$18 + 4 >> 2] = $30 | 3; //@line 2697
    $34 = $18 + $30 + 4 | 0; //@line 2699
    HEAP32[$34 >> 2] = HEAP32[$34 >> 2] | 1; //@line 2702
    $$0 = $19; //@line 2703
    STACKTOP = sp; //@line 2704
    return $$0 | 0; //@line 2704
   }
   $37 = HEAP32[1343] | 0; //@line 2706
   if ($6 >>> 0 > $37 >>> 0) {
    if ($9 | 0) {
     $41 = 2 << $7; //@line 2712
     $44 = $9 << $7 & ($41 | 0 - $41); //@line 2715
     $47 = ($44 & 0 - $44) + -1 | 0; //@line 2718
     $49 = $47 >>> 12 & 16; //@line 2720
     $50 = $47 >>> $49; //@line 2721
     $52 = $50 >>> 5 & 8; //@line 2723
     $54 = $50 >>> $52; //@line 2725
     $56 = $54 >>> 2 & 4; //@line 2727
     $58 = $54 >>> $56; //@line 2729
     $60 = $58 >>> 1 & 2; //@line 2731
     $62 = $58 >>> $60; //@line 2733
     $64 = $62 >>> 1 & 1; //@line 2735
     $67 = ($52 | $49 | $56 | $60 | $64) + ($62 >>> $64) | 0; //@line 2738
     $69 = 5404 + ($67 << 1 << 2) | 0; //@line 2740
     $70 = $69 + 8 | 0; //@line 2741
     $71 = HEAP32[$70 >> 2] | 0; //@line 2742
     $72 = $71 + 8 | 0; //@line 2743
     $73 = HEAP32[$72 >> 2] | 0; //@line 2744
     do {
      if (($73 | 0) == ($69 | 0)) {
       $77 = $8 & ~(1 << $67); //@line 2750
       HEAP32[1341] = $77; //@line 2751
       $98 = $77; //@line 2752
      } else {
       if ((HEAP32[1345] | 0) >>> 0 > $73 >>> 0) {
        _abort(); //@line 2757
       }
       $80 = $73 + 12 | 0; //@line 2760
       if ((HEAP32[$80 >> 2] | 0) == ($71 | 0)) {
        HEAP32[$80 >> 2] = $69; //@line 2764
        HEAP32[$70 >> 2] = $73; //@line 2765
        $98 = $8; //@line 2766
        break;
       } else {
        _abort(); //@line 2769
       }
      }
     } while (0);
     $83 = $67 << 3; //@line 2774
     $84 = $83 - $6 | 0; //@line 2775
     HEAP32[$71 + 4 >> 2] = $6 | 3; //@line 2778
     $87 = $71 + $6 | 0; //@line 2779
     HEAP32[$87 + 4 >> 2] = $84 | 1; //@line 2782
     HEAP32[$71 + $83 >> 2] = $84; //@line 2784
     if ($37 | 0) {
      $92 = HEAP32[1346] | 0; //@line 2787
      $93 = $37 >>> 3; //@line 2788
      $95 = 5404 + ($93 << 1 << 2) | 0; //@line 2790
      $96 = 1 << $93; //@line 2791
      if (!($98 & $96)) {
       HEAP32[1341] = $98 | $96; //@line 2796
       $$0199 = $95; //@line 2798
       $$pre$phiZ2D = $95 + 8 | 0; //@line 2798
      } else {
       $101 = $95 + 8 | 0; //@line 2800
       $102 = HEAP32[$101 >> 2] | 0; //@line 2801
       if ((HEAP32[1345] | 0) >>> 0 > $102 >>> 0) {
        _abort(); //@line 2805
       } else {
        $$0199 = $102; //@line 2808
        $$pre$phiZ2D = $101; //@line 2808
       }
      }
      HEAP32[$$pre$phiZ2D >> 2] = $92; //@line 2811
      HEAP32[$$0199 + 12 >> 2] = $92; //@line 2813
      HEAP32[$92 + 8 >> 2] = $$0199; //@line 2815
      HEAP32[$92 + 12 >> 2] = $95; //@line 2817
     }
     HEAP32[1343] = $84; //@line 2819
     HEAP32[1346] = $87; //@line 2820
     $$0 = $72; //@line 2821
     STACKTOP = sp; //@line 2822
     return $$0 | 0; //@line 2822
    }
    $108 = HEAP32[1342] | 0; //@line 2824
    if (!$108) {
     $$0197 = $6; //@line 2827
    } else {
     $112 = ($108 & 0 - $108) + -1 | 0; //@line 2831
     $114 = $112 >>> 12 & 16; //@line 2833
     $115 = $112 >>> $114; //@line 2834
     $117 = $115 >>> 5 & 8; //@line 2836
     $119 = $115 >>> $117; //@line 2838
     $121 = $119 >>> 2 & 4; //@line 2840
     $123 = $119 >>> $121; //@line 2842
     $125 = $123 >>> 1 & 2; //@line 2844
     $127 = $123 >>> $125; //@line 2846
     $129 = $127 >>> 1 & 1; //@line 2848
     $134 = HEAP32[5668 + (($117 | $114 | $121 | $125 | $129) + ($127 >>> $129) << 2) >> 2] | 0; //@line 2853
     $138 = (HEAP32[$134 + 4 >> 2] & -8) - $6 | 0; //@line 2857
     $143 = HEAP32[$134 + 16 + (((HEAP32[$134 + 16 >> 2] | 0) == 0 & 1) << 2) >> 2] | 0; //@line 2863
     if (!$143) {
      $$0192$lcssa$i = $134; //@line 2866
      $$0193$lcssa$i = $138; //@line 2866
     } else {
      $$01926$i = $134; //@line 2868
      $$01935$i = $138; //@line 2868
      $146 = $143; //@line 2868
      while (1) {
       $149 = (HEAP32[$146 + 4 >> 2] & -8) - $6 | 0; //@line 2873
       $150 = $149 >>> 0 < $$01935$i >>> 0; //@line 2874
       $$$0193$i = $150 ? $149 : $$01935$i; //@line 2875
       $$$0192$i = $150 ? $146 : $$01926$i; //@line 2876
       $146 = HEAP32[$146 + 16 + (((HEAP32[$146 + 16 >> 2] | 0) == 0 & 1) << 2) >> 2] | 0; //@line 2882
       if (!$146) {
        $$0192$lcssa$i = $$$0192$i; //@line 2885
        $$0193$lcssa$i = $$$0193$i; //@line 2885
        break;
       } else {
        $$01926$i = $$$0192$i; //@line 2888
        $$01935$i = $$$0193$i; //@line 2888
       }
      }
     }
     $157 = HEAP32[1345] | 0; //@line 2892
     if ($157 >>> 0 > $$0192$lcssa$i >>> 0) {
      _abort(); //@line 2895
     }
     $159 = $$0192$lcssa$i + $6 | 0; //@line 2898
     if ($159 >>> 0 <= $$0192$lcssa$i >>> 0) {
      _abort(); //@line 2901
     }
     $162 = HEAP32[$$0192$lcssa$i + 24 >> 2] | 0; //@line 2905
     $164 = HEAP32[$$0192$lcssa$i + 12 >> 2] | 0; //@line 2907
     do {
      if (($164 | 0) == ($$0192$lcssa$i | 0)) {
       $175 = $$0192$lcssa$i + 20 | 0; //@line 2911
       $176 = HEAP32[$175 >> 2] | 0; //@line 2912
       if (!$176) {
        $178 = $$0192$lcssa$i + 16 | 0; //@line 2915
        $179 = HEAP32[$178 >> 2] | 0; //@line 2916
        if (!$179) {
         $$3$i = 0; //@line 2919
         break;
        } else {
         $$1196$i = $179; //@line 2922
         $$1198$i = $178; //@line 2922
        }
       } else {
        $$1196$i = $176; //@line 2925
        $$1198$i = $175; //@line 2925
       }
       while (1) {
        $181 = $$1196$i + 20 | 0; //@line 2928
        $182 = HEAP32[$181 >> 2] | 0; //@line 2929
        if ($182 | 0) {
         $$1196$i = $182; //@line 2932
         $$1198$i = $181; //@line 2932
         continue;
        }
        $184 = $$1196$i + 16 | 0; //@line 2935
        $185 = HEAP32[$184 >> 2] | 0; //@line 2936
        if (!$185) {
         break;
        } else {
         $$1196$i = $185; //@line 2941
         $$1198$i = $184; //@line 2941
        }
       }
       if ($157 >>> 0 > $$1198$i >>> 0) {
        _abort(); //@line 2946
       } else {
        HEAP32[$$1198$i >> 2] = 0; //@line 2949
        $$3$i = $$1196$i; //@line 2950
        break;
       }
      } else {
       $167 = HEAP32[$$0192$lcssa$i + 8 >> 2] | 0; //@line 2955
       if ($157 >>> 0 > $167 >>> 0) {
        _abort(); //@line 2958
       }
       $169 = $167 + 12 | 0; //@line 2961
       if ((HEAP32[$169 >> 2] | 0) != ($$0192$lcssa$i | 0)) {
        _abort(); //@line 2965
       }
       $172 = $164 + 8 | 0; //@line 2968
       if ((HEAP32[$172 >> 2] | 0) == ($$0192$lcssa$i | 0)) {
        HEAP32[$169 >> 2] = $164; //@line 2972
        HEAP32[$172 >> 2] = $167; //@line 2973
        $$3$i = $164; //@line 2974
        break;
       } else {
        _abort(); //@line 2977
       }
      }
     } while (0);
     L73 : do {
      if ($162 | 0) {
       $190 = HEAP32[$$0192$lcssa$i + 28 >> 2] | 0; //@line 2986
       $191 = 5668 + ($190 << 2) | 0; //@line 2987
       do {
        if (($$0192$lcssa$i | 0) == (HEAP32[$191 >> 2] | 0)) {
         HEAP32[$191 >> 2] = $$3$i; //@line 2992
         if (!$$3$i) {
          HEAP32[1342] = $108 & ~(1 << $190); //@line 2998
          break L73;
         }
        } else {
         if ((HEAP32[1345] | 0) >>> 0 > $162 >>> 0) {
          _abort(); //@line 3005
         } else {
          HEAP32[$162 + 16 + (((HEAP32[$162 + 16 >> 2] | 0) != ($$0192$lcssa$i | 0) & 1) << 2) >> 2] = $$3$i; //@line 3013
          if (!$$3$i) {
           break L73;
          } else {
           break;
          }
         }
        }
       } while (0);
       $204 = HEAP32[1345] | 0; //@line 3023
       if ($204 >>> 0 > $$3$i >>> 0) {
        _abort(); //@line 3026
       }
       HEAP32[$$3$i + 24 >> 2] = $162; //@line 3030
       $208 = HEAP32[$$0192$lcssa$i + 16 >> 2] | 0; //@line 3032
       do {
        if ($208 | 0) {
         if ($204 >>> 0 > $208 >>> 0) {
          _abort(); //@line 3038
         } else {
          HEAP32[$$3$i + 16 >> 2] = $208; //@line 3042
          HEAP32[$208 + 24 >> 2] = $$3$i; //@line 3044
          break;
         }
        }
       } while (0);
       $214 = HEAP32[$$0192$lcssa$i + 20 >> 2] | 0; //@line 3050
       if ($214 | 0) {
        if ((HEAP32[1345] | 0) >>> 0 > $214 >>> 0) {
         _abort(); //@line 3056
        } else {
         HEAP32[$$3$i + 20 >> 2] = $214; //@line 3060
         HEAP32[$214 + 24 >> 2] = $$3$i; //@line 3062
         break;
        }
       }
      }
     } while (0);
     if ($$0193$lcssa$i >>> 0 < 16) {
      $221 = $$0193$lcssa$i + $6 | 0; //@line 3070
      HEAP32[$$0192$lcssa$i + 4 >> 2] = $221 | 3; //@line 3073
      $225 = $$0192$lcssa$i + $221 + 4 | 0; //@line 3075
      HEAP32[$225 >> 2] = HEAP32[$225 >> 2] | 1; //@line 3078
     } else {
      HEAP32[$$0192$lcssa$i + 4 >> 2] = $6 | 3; //@line 3082
      HEAP32[$159 + 4 >> 2] = $$0193$lcssa$i | 1; //@line 3085
      HEAP32[$159 + $$0193$lcssa$i >> 2] = $$0193$lcssa$i; //@line 3087
      if ($37 | 0) {
       $234 = HEAP32[1346] | 0; //@line 3090
       $235 = $37 >>> 3; //@line 3091
       $237 = 5404 + ($235 << 1 << 2) | 0; //@line 3093
       $238 = 1 << $235; //@line 3094
       if (!($8 & $238)) {
        HEAP32[1341] = $8 | $238; //@line 3099
        $$0189$i = $237; //@line 3101
        $$pre$phi$iZ2D = $237 + 8 | 0; //@line 3101
       } else {
        $242 = $237 + 8 | 0; //@line 3103
        $243 = HEAP32[$242 >> 2] | 0; //@line 3104
        if ((HEAP32[1345] | 0) >>> 0 > $243 >>> 0) {
         _abort(); //@line 3108
        } else {
         $$0189$i = $243; //@line 3111
         $$pre$phi$iZ2D = $242; //@line 3111
        }
       }
       HEAP32[$$pre$phi$iZ2D >> 2] = $234; //@line 3114
       HEAP32[$$0189$i + 12 >> 2] = $234; //@line 3116
       HEAP32[$234 + 8 >> 2] = $$0189$i; //@line 3118
       HEAP32[$234 + 12 >> 2] = $237; //@line 3120
      }
      HEAP32[1343] = $$0193$lcssa$i; //@line 3122
      HEAP32[1346] = $159; //@line 3123
     }
     $$0 = $$0192$lcssa$i + 8 | 0; //@line 3126
     STACKTOP = sp; //@line 3127
     return $$0 | 0; //@line 3127
    }
   } else {
    $$0197 = $6; //@line 3130
   }
  } else {
   if ($0 >>> 0 > 4294967231) {
    $$0197 = -1; //@line 3135
   } else {
    $251 = $0 + 11 | 0; //@line 3137
    $252 = $251 & -8; //@line 3138
    $253 = HEAP32[1342] | 0; //@line 3139
    if (!$253) {
     $$0197 = $252; //@line 3142
    } else {
     $255 = 0 - $252 | 0; //@line 3144
     $256 = $251 >>> 8; //@line 3145
     if (!$256) {
      $$0358$i = 0; //@line 3148
     } else {
      if ($252 >>> 0 > 16777215) {
       $$0358$i = 31; //@line 3152
      } else {
       $261 = ($256 + 1048320 | 0) >>> 16 & 8; //@line 3156
       $262 = $256 << $261; //@line 3157
       $265 = ($262 + 520192 | 0) >>> 16 & 4; //@line 3160
       $267 = $262 << $265; //@line 3162
       $270 = ($267 + 245760 | 0) >>> 16 & 2; //@line 3165
       $275 = 14 - ($265 | $261 | $270) + ($267 << $270 >>> 15) | 0; //@line 3170
       $$0358$i = $252 >>> ($275 + 7 | 0) & 1 | $275 << 1; //@line 3176
      }
     }
     $282 = HEAP32[5668 + ($$0358$i << 2) >> 2] | 0; //@line 3180
     L117 : do {
      if (!$282) {
       $$2355$i = 0; //@line 3184
       $$3$i203 = 0; //@line 3184
       $$3350$i = $255; //@line 3184
       label = 81; //@line 3185
      } else {
       $$0342$i = 0; //@line 3192
       $$0347$i = $255; //@line 3192
       $$0353$i = $282; //@line 3192
       $$0359$i = $252 << (($$0358$i | 0) == 31 ? 0 : 25 - ($$0358$i >>> 1) | 0); //@line 3192
       $$0362$i = 0; //@line 3192
       while (1) {
        $292 = (HEAP32[$$0353$i + 4 >> 2] & -8) - $252 | 0; //@line 3197
        if ($292 >>> 0 < $$0347$i >>> 0) {
         if (!$292) {
          $$414$i = $$0353$i; //@line 3202
          $$435113$i = 0; //@line 3202
          $$435712$i = $$0353$i; //@line 3202
          label = 85; //@line 3203
          break L117;
         } else {
          $$1343$i = $$0353$i; //@line 3206
          $$1348$i = $292; //@line 3206
         }
        } else {
         $$1343$i = $$0342$i; //@line 3209
         $$1348$i = $$0347$i; //@line 3209
        }
        $296 = HEAP32[$$0353$i + 20 >> 2] | 0; //@line 3212
        $$0353$i = HEAP32[$$0353$i + 16 + ($$0359$i >>> 31 << 2) >> 2] | 0; //@line 3215
        $$1363$i = ($296 | 0) == 0 | ($296 | 0) == ($$0353$i | 0) ? $$0362$i : $296; //@line 3219
        $302 = ($$0353$i | 0) == 0; //@line 3220
        if ($302) {
         $$2355$i = $$1363$i; //@line 3225
         $$3$i203 = $$1343$i; //@line 3225
         $$3350$i = $$1348$i; //@line 3225
         label = 81; //@line 3226
         break;
        } else {
         $$0342$i = $$1343$i; //@line 3229
         $$0347$i = $$1348$i; //@line 3229
         $$0359$i = $$0359$i << (($302 ^ 1) & 1); //@line 3229
         $$0362$i = $$1363$i; //@line 3229
        }
       }
      }
     } while (0);
     if ((label | 0) == 81) {
      if (($$2355$i | 0) == 0 & ($$3$i203 | 0) == 0) {
       $306 = 2 << $$0358$i; //@line 3239
       $309 = $253 & ($306 | 0 - $306); //@line 3242
       if (!$309) {
        $$0197 = $252; //@line 3245
        break;
       }
       $313 = ($309 & 0 - $309) + -1 | 0; //@line 3250
       $315 = $313 >>> 12 & 16; //@line 3252
       $316 = $313 >>> $315; //@line 3253
       $318 = $316 >>> 5 & 8; //@line 3255
       $320 = $316 >>> $318; //@line 3257
       $322 = $320 >>> 2 & 4; //@line 3259
       $324 = $320 >>> $322; //@line 3261
       $326 = $324 >>> 1 & 2; //@line 3263
       $328 = $324 >>> $326; //@line 3265
       $330 = $328 >>> 1 & 1; //@line 3267
       $$4$ph$i = 0; //@line 3273
       $$4357$ph$i = HEAP32[5668 + (($318 | $315 | $322 | $326 | $330) + ($328 >>> $330) << 2) >> 2] | 0; //@line 3273
      } else {
       $$4$ph$i = $$3$i203; //@line 3275
       $$4357$ph$i = $$2355$i; //@line 3275
      }
      if (!$$4357$ph$i) {
       $$4$lcssa$i = $$4$ph$i; //@line 3279
       $$4351$lcssa$i = $$3350$i; //@line 3279
      } else {
       $$414$i = $$4$ph$i; //@line 3281
       $$435113$i = $$3350$i; //@line 3281
       $$435712$i = $$4357$ph$i; //@line 3281
       label = 85; //@line 3282
      }
     }
     if ((label | 0) == 85) {
      while (1) {
       label = 0; //@line 3287
       $340 = (HEAP32[$$435712$i + 4 >> 2] & -8) - $252 | 0; //@line 3291
       $341 = $340 >>> 0 < $$435113$i >>> 0; //@line 3292
       $$$4351$i = $341 ? $340 : $$435113$i; //@line 3293
       $$4357$$4$i = $341 ? $$435712$i : $$414$i; //@line 3294
       $$435712$i = HEAP32[$$435712$i + 16 + (((HEAP32[$$435712$i + 16 >> 2] | 0) == 0 & 1) << 2) >> 2] | 0; //@line 3300
       if (!$$435712$i) {
        $$4$lcssa$i = $$4357$$4$i; //@line 3303
        $$4351$lcssa$i = $$$4351$i; //@line 3303
        break;
       } else {
        $$414$i = $$4357$$4$i; //@line 3306
        $$435113$i = $$$4351$i; //@line 3306
        label = 85; //@line 3307
       }
      }
     }
     if (!$$4$lcssa$i) {
      $$0197 = $252; //@line 3313
     } else {
      if ($$4351$lcssa$i >>> 0 < ((HEAP32[1343] | 0) - $252 | 0) >>> 0) {
       $352 = HEAP32[1345] | 0; //@line 3319
       if ($352 >>> 0 > $$4$lcssa$i >>> 0) {
        _abort(); //@line 3322
       }
       $354 = $$4$lcssa$i + $252 | 0; //@line 3325
       if ($354 >>> 0 <= $$4$lcssa$i >>> 0) {
        _abort(); //@line 3328
       }
       $357 = HEAP32[$$4$lcssa$i + 24 >> 2] | 0; //@line 3332
       $359 = HEAP32[$$4$lcssa$i + 12 >> 2] | 0; //@line 3334
       do {
        if (($359 | 0) == ($$4$lcssa$i | 0)) {
         $370 = $$4$lcssa$i + 20 | 0; //@line 3338
         $371 = HEAP32[$370 >> 2] | 0; //@line 3339
         if (!$371) {
          $373 = $$4$lcssa$i + 16 | 0; //@line 3342
          $374 = HEAP32[$373 >> 2] | 0; //@line 3343
          if (!$374) {
           $$3372$i = 0; //@line 3346
           break;
          } else {
           $$1370$i = $374; //@line 3349
           $$1374$i = $373; //@line 3349
          }
         } else {
          $$1370$i = $371; //@line 3352
          $$1374$i = $370; //@line 3352
         }
         while (1) {
          $376 = $$1370$i + 20 | 0; //@line 3355
          $377 = HEAP32[$376 >> 2] | 0; //@line 3356
          if ($377 | 0) {
           $$1370$i = $377; //@line 3359
           $$1374$i = $376; //@line 3359
           continue;
          }
          $379 = $$1370$i + 16 | 0; //@line 3362
          $380 = HEAP32[$379 >> 2] | 0; //@line 3363
          if (!$380) {
           break;
          } else {
           $$1370$i = $380; //@line 3368
           $$1374$i = $379; //@line 3368
          }
         }
         if ($352 >>> 0 > $$1374$i >>> 0) {
          _abort(); //@line 3373
         } else {
          HEAP32[$$1374$i >> 2] = 0; //@line 3376
          $$3372$i = $$1370$i; //@line 3377
          break;
         }
        } else {
         $362 = HEAP32[$$4$lcssa$i + 8 >> 2] | 0; //@line 3382
         if ($352 >>> 0 > $362 >>> 0) {
          _abort(); //@line 3385
         }
         $364 = $362 + 12 | 0; //@line 3388
         if ((HEAP32[$364 >> 2] | 0) != ($$4$lcssa$i | 0)) {
          _abort(); //@line 3392
         }
         $367 = $359 + 8 | 0; //@line 3395
         if ((HEAP32[$367 >> 2] | 0) == ($$4$lcssa$i | 0)) {
          HEAP32[$364 >> 2] = $359; //@line 3399
          HEAP32[$367 >> 2] = $362; //@line 3400
          $$3372$i = $359; //@line 3401
          break;
         } else {
          _abort(); //@line 3404
         }
        }
       } while (0);
       L164 : do {
        if (!$357) {
         $475 = $253; //@line 3412
        } else {
         $385 = HEAP32[$$4$lcssa$i + 28 >> 2] | 0; //@line 3415
         $386 = 5668 + ($385 << 2) | 0; //@line 3416
         do {
          if (($$4$lcssa$i | 0) == (HEAP32[$386 >> 2] | 0)) {
           HEAP32[$386 >> 2] = $$3372$i; //@line 3421
           if (!$$3372$i) {
            $391 = $253 & ~(1 << $385); //@line 3426
            HEAP32[1342] = $391; //@line 3427
            $475 = $391; //@line 3428
            break L164;
           }
          } else {
           if ((HEAP32[1345] | 0) >>> 0 > $357 >>> 0) {
            _abort(); //@line 3435
           } else {
            HEAP32[$357 + 16 + (((HEAP32[$357 + 16 >> 2] | 0) != ($$4$lcssa$i | 0) & 1) << 2) >> 2] = $$3372$i; //@line 3443
            if (!$$3372$i) {
             $475 = $253; //@line 3446
             break L164;
            } else {
             break;
            }
           }
          }
         } while (0);
         $399 = HEAP32[1345] | 0; //@line 3454
         if ($399 >>> 0 > $$3372$i >>> 0) {
          _abort(); //@line 3457
         }
         HEAP32[$$3372$i + 24 >> 2] = $357; //@line 3461
         $403 = HEAP32[$$4$lcssa$i + 16 >> 2] | 0; //@line 3463
         do {
          if ($403 | 0) {
           if ($399 >>> 0 > $403 >>> 0) {
            _abort(); //@line 3469
           } else {
            HEAP32[$$3372$i + 16 >> 2] = $403; //@line 3473
            HEAP32[$403 + 24 >> 2] = $$3372$i; //@line 3475
            break;
           }
          }
         } while (0);
         $409 = HEAP32[$$4$lcssa$i + 20 >> 2] | 0; //@line 3481
         if (!$409) {
          $475 = $253; //@line 3484
         } else {
          if ((HEAP32[1345] | 0) >>> 0 > $409 >>> 0) {
           _abort(); //@line 3489
          } else {
           HEAP32[$$3372$i + 20 >> 2] = $409; //@line 3493
           HEAP32[$409 + 24 >> 2] = $$3372$i; //@line 3495
           $475 = $253; //@line 3496
           break;
          }
         }
        }
       } while (0);
       do {
        if ($$4351$lcssa$i >>> 0 < 16) {
         $416 = $$4351$lcssa$i + $252 | 0; //@line 3505
         HEAP32[$$4$lcssa$i + 4 >> 2] = $416 | 3; //@line 3508
         $420 = $$4$lcssa$i + $416 + 4 | 0; //@line 3510
         HEAP32[$420 >> 2] = HEAP32[$420 >> 2] | 1; //@line 3513
        } else {
         HEAP32[$$4$lcssa$i + 4 >> 2] = $252 | 3; //@line 3517
         HEAP32[$354 + 4 >> 2] = $$4351$lcssa$i | 1; //@line 3520
         HEAP32[$354 + $$4351$lcssa$i >> 2] = $$4351$lcssa$i; //@line 3522
         $428 = $$4351$lcssa$i >>> 3; //@line 3523
         if ($$4351$lcssa$i >>> 0 < 256) {
          $431 = 5404 + ($428 << 1 << 2) | 0; //@line 3527
          $432 = HEAP32[1341] | 0; //@line 3528
          $433 = 1 << $428; //@line 3529
          if (!($432 & $433)) {
           HEAP32[1341] = $432 | $433; //@line 3534
           $$0368$i = $431; //@line 3536
           $$pre$phi$i211Z2D = $431 + 8 | 0; //@line 3536
          } else {
           $437 = $431 + 8 | 0; //@line 3538
           $438 = HEAP32[$437 >> 2] | 0; //@line 3539
           if ((HEAP32[1345] | 0) >>> 0 > $438 >>> 0) {
            _abort(); //@line 3543
           } else {
            $$0368$i = $438; //@line 3546
            $$pre$phi$i211Z2D = $437; //@line 3546
           }
          }
          HEAP32[$$pre$phi$i211Z2D >> 2] = $354; //@line 3549
          HEAP32[$$0368$i + 12 >> 2] = $354; //@line 3551
          HEAP32[$354 + 8 >> 2] = $$0368$i; //@line 3553
          HEAP32[$354 + 12 >> 2] = $431; //@line 3555
          break;
         }
         $444 = $$4351$lcssa$i >>> 8; //@line 3558
         if (!$444) {
          $$0361$i = 0; //@line 3561
         } else {
          if ($$4351$lcssa$i >>> 0 > 16777215) {
           $$0361$i = 31; //@line 3565
          } else {
           $449 = ($444 + 1048320 | 0) >>> 16 & 8; //@line 3569
           $450 = $444 << $449; //@line 3570
           $453 = ($450 + 520192 | 0) >>> 16 & 4; //@line 3573
           $455 = $450 << $453; //@line 3575
           $458 = ($455 + 245760 | 0) >>> 16 & 2; //@line 3578
           $463 = 14 - ($453 | $449 | $458) + ($455 << $458 >>> 15) | 0; //@line 3583
           $$0361$i = $$4351$lcssa$i >>> ($463 + 7 | 0) & 1 | $463 << 1; //@line 3589
          }
         }
         $469 = 5668 + ($$0361$i << 2) | 0; //@line 3592
         HEAP32[$354 + 28 >> 2] = $$0361$i; //@line 3594
         $471 = $354 + 16 | 0; //@line 3595
         HEAP32[$471 + 4 >> 2] = 0; //@line 3597
         HEAP32[$471 >> 2] = 0; //@line 3598
         $473 = 1 << $$0361$i; //@line 3599
         if (!($475 & $473)) {
          HEAP32[1342] = $475 | $473; //@line 3604
          HEAP32[$469 >> 2] = $354; //@line 3605
          HEAP32[$354 + 24 >> 2] = $469; //@line 3607
          HEAP32[$354 + 12 >> 2] = $354; //@line 3609
          HEAP32[$354 + 8 >> 2] = $354; //@line 3611
          break;
         }
         $$0344$i = $$4351$lcssa$i << (($$0361$i | 0) == 31 ? 0 : 25 - ($$0361$i >>> 1) | 0); //@line 3620
         $$0345$i = HEAP32[$469 >> 2] | 0; //@line 3620
         while (1) {
          if ((HEAP32[$$0345$i + 4 >> 2] & -8 | 0) == ($$4351$lcssa$i | 0)) {
           label = 139; //@line 3627
           break;
          }
          $492 = $$0345$i + 16 + ($$0344$i >>> 31 << 2) | 0; //@line 3631
          $494 = HEAP32[$492 >> 2] | 0; //@line 3633
          if (!$494) {
           label = 136; //@line 3636
           break;
          } else {
           $$0344$i = $$0344$i << 1; //@line 3639
           $$0345$i = $494; //@line 3639
          }
         }
         if ((label | 0) == 136) {
          if ((HEAP32[1345] | 0) >>> 0 > $492 >>> 0) {
           _abort(); //@line 3646
          } else {
           HEAP32[$492 >> 2] = $354; //@line 3649
           HEAP32[$354 + 24 >> 2] = $$0345$i; //@line 3651
           HEAP32[$354 + 12 >> 2] = $354; //@line 3653
           HEAP32[$354 + 8 >> 2] = $354; //@line 3655
           break;
          }
         } else if ((label | 0) == 139) {
          $501 = $$0345$i + 8 | 0; //@line 3660
          $502 = HEAP32[$501 >> 2] | 0; //@line 3661
          $503 = HEAP32[1345] | 0; //@line 3662
          if ($503 >>> 0 <= $502 >>> 0 & $503 >>> 0 <= $$0345$i >>> 0) {
           HEAP32[$502 + 12 >> 2] = $354; //@line 3668
           HEAP32[$501 >> 2] = $354; //@line 3669
           HEAP32[$354 + 8 >> 2] = $502; //@line 3671
           HEAP32[$354 + 12 >> 2] = $$0345$i; //@line 3673
           HEAP32[$354 + 24 >> 2] = 0; //@line 3675
           break;
          } else {
           _abort(); //@line 3678
          }
         }
        }
       } while (0);
       $$0 = $$4$lcssa$i + 8 | 0; //@line 3685
       STACKTOP = sp; //@line 3686
       return $$0 | 0; //@line 3686
      } else {
       $$0197 = $252; //@line 3688
      }
     }
    }
   }
  }
 } while (0);
 $512 = HEAP32[1343] | 0; //@line 3695
 if ($512 >>> 0 >= $$0197 >>> 0) {
  $514 = $512 - $$0197 | 0; //@line 3698
  $515 = HEAP32[1346] | 0; //@line 3699
  if ($514 >>> 0 > 15) {
   $517 = $515 + $$0197 | 0; //@line 3702
   HEAP32[1346] = $517; //@line 3703
   HEAP32[1343] = $514; //@line 3704
   HEAP32[$517 + 4 >> 2] = $514 | 1; //@line 3707
   HEAP32[$515 + $512 >> 2] = $514; //@line 3709
   HEAP32[$515 + 4 >> 2] = $$0197 | 3; //@line 3712
  } else {
   HEAP32[1343] = 0; //@line 3714
   HEAP32[1346] = 0; //@line 3715
   HEAP32[$515 + 4 >> 2] = $512 | 3; //@line 3718
   $526 = $515 + $512 + 4 | 0; //@line 3720
   HEAP32[$526 >> 2] = HEAP32[$526 >> 2] | 1; //@line 3723
  }
  $$0 = $515 + 8 | 0; //@line 3726
  STACKTOP = sp; //@line 3727
  return $$0 | 0; //@line 3727
 }
 $530 = HEAP32[1344] | 0; //@line 3729
 if ($530 >>> 0 > $$0197 >>> 0) {
  $532 = $530 - $$0197 | 0; //@line 3732
  HEAP32[1344] = $532; //@line 3733
  $533 = HEAP32[1347] | 0; //@line 3734
  $534 = $533 + $$0197 | 0; //@line 3735
  HEAP32[1347] = $534; //@line 3736
  HEAP32[$534 + 4 >> 2] = $532 | 1; //@line 3739
  HEAP32[$533 + 4 >> 2] = $$0197 | 3; //@line 3742
  $$0 = $533 + 8 | 0; //@line 3744
  STACKTOP = sp; //@line 3745
  return $$0 | 0; //@line 3745
 }
 if (!(HEAP32[1459] | 0)) {
  HEAP32[1461] = 4096; //@line 3750
  HEAP32[1460] = 4096; //@line 3751
  HEAP32[1462] = -1; //@line 3752
  HEAP32[1463] = -1; //@line 3753
  HEAP32[1464] = 0; //@line 3754
  HEAP32[1452] = 0; //@line 3755
  HEAP32[1459] = $1 & -16 ^ 1431655768; //@line 3759
  $548 = 4096; //@line 3760
 } else {
  $548 = HEAP32[1461] | 0; //@line 3763
 }
 $545 = $$0197 + 48 | 0; //@line 3765
 $546 = $$0197 + 47 | 0; //@line 3766
 $547 = $548 + $546 | 0; //@line 3767
 $549 = 0 - $548 | 0; //@line 3768
 $550 = $547 & $549; //@line 3769
 if ($550 >>> 0 <= $$0197 >>> 0) {
  $$0 = 0; //@line 3772
  STACKTOP = sp; //@line 3773
  return $$0 | 0; //@line 3773
 }
 $552 = HEAP32[1451] | 0; //@line 3775
 if ($552 | 0) {
  $554 = HEAP32[1449] | 0; //@line 3778
  $555 = $554 + $550 | 0; //@line 3779
  if ($555 >>> 0 <= $554 >>> 0 | $555 >>> 0 > $552 >>> 0) {
   $$0 = 0; //@line 3784
   STACKTOP = sp; //@line 3785
   return $$0 | 0; //@line 3785
  }
 }
 L244 : do {
  if (!(HEAP32[1452] & 4)) {
   $561 = HEAP32[1347] | 0; //@line 3793
   L246 : do {
    if (!$561) {
     label = 163; //@line 3797
    } else {
     $$0$i$i = 5812; //@line 3799
     while (1) {
      $563 = HEAP32[$$0$i$i >> 2] | 0; //@line 3801
      if ($563 >>> 0 <= $561 >>> 0) {
       $565 = $$0$i$i + 4 | 0; //@line 3804
       if (($563 + (HEAP32[$565 >> 2] | 0) | 0) >>> 0 > $561 >>> 0) {
        break;
       }
      }
      $570 = HEAP32[$$0$i$i + 8 >> 2] | 0; //@line 3813
      if (!$570) {
       label = 163; //@line 3816
       break L246;
      } else {
       $$0$i$i = $570; //@line 3819
      }
     }
     $595 = $547 - $530 & $549; //@line 3823
     if ($595 >>> 0 < 2147483647) {
      $597 = _sbrk($595 | 0) | 0; //@line 3826
      if (($597 | 0) == ((HEAP32[$$0$i$i >> 2] | 0) + (HEAP32[$565 >> 2] | 0) | 0)) {
       if (($597 | 0) == (-1 | 0)) {
        $$2234243136$i = $595; //@line 3834
       } else {
        $$723947$i = $595; //@line 3836
        $$748$i = $597; //@line 3836
        label = 180; //@line 3837
        break L244;
       }
      } else {
       $$2247$ph$i = $597; //@line 3841
       $$2253$ph$i = $595; //@line 3841
       label = 171; //@line 3842
      }
     } else {
      $$2234243136$i = 0; //@line 3845
     }
    }
   } while (0);
   do {
    if ((label | 0) == 163) {
     $572 = _sbrk(0) | 0; //@line 3851
     if (($572 | 0) == (-1 | 0)) {
      $$2234243136$i = 0; //@line 3854
     } else {
      $574 = $572; //@line 3856
      $575 = HEAP32[1460] | 0; //@line 3857
      $576 = $575 + -1 | 0; //@line 3858
      $$$i = (($576 & $574 | 0) == 0 ? 0 : ($576 + $574 & 0 - $575) - $574 | 0) + $550 | 0; //@line 3866
      $584 = HEAP32[1449] | 0; //@line 3867
      $585 = $$$i + $584 | 0; //@line 3868
      if ($$$i >>> 0 > $$0197 >>> 0 & $$$i >>> 0 < 2147483647) {
       $588 = HEAP32[1451] | 0; //@line 3873
       if ($588 | 0) {
        if ($585 >>> 0 <= $584 >>> 0 | $585 >>> 0 > $588 >>> 0) {
         $$2234243136$i = 0; //@line 3880
         break;
        }
       }
       $592 = _sbrk($$$i | 0) | 0; //@line 3884
       if (($592 | 0) == ($572 | 0)) {
        $$723947$i = $$$i; //@line 3887
        $$748$i = $572; //@line 3887
        label = 180; //@line 3888
        break L244;
       } else {
        $$2247$ph$i = $592; //@line 3891
        $$2253$ph$i = $$$i; //@line 3891
        label = 171; //@line 3892
       }
      } else {
       $$2234243136$i = 0; //@line 3895
      }
     }
    }
   } while (0);
   do {
    if ((label | 0) == 171) {
     $603 = 0 - $$2253$ph$i | 0; //@line 3902
     if (!($545 >>> 0 > $$2253$ph$i >>> 0 & ($$2253$ph$i >>> 0 < 2147483647 & ($$2247$ph$i | 0) != (-1 | 0)))) {
      if (($$2247$ph$i | 0) == (-1 | 0)) {
       $$2234243136$i = 0; //@line 3911
       break;
      } else {
       $$723947$i = $$2253$ph$i; //@line 3914
       $$748$i = $$2247$ph$i; //@line 3914
       label = 180; //@line 3915
       break L244;
      }
     }
     $607 = HEAP32[1461] | 0; //@line 3919
     $611 = $546 - $$2253$ph$i + $607 & 0 - $607; //@line 3923
     if ($611 >>> 0 >= 2147483647) {
      $$723947$i = $$2253$ph$i; //@line 3926
      $$748$i = $$2247$ph$i; //@line 3926
      label = 180; //@line 3927
      break L244;
     }
     if ((_sbrk($611 | 0) | 0) == (-1 | 0)) {
      _sbrk($603 | 0) | 0; //@line 3933
      $$2234243136$i = 0; //@line 3934
      break;
     } else {
      $$723947$i = $611 + $$2253$ph$i | 0; //@line 3938
      $$748$i = $$2247$ph$i; //@line 3938
      label = 180; //@line 3939
      break L244;
     }
    }
   } while (0);
   HEAP32[1452] = HEAP32[1452] | 4; //@line 3946
   $$4236$i = $$2234243136$i; //@line 3947
   label = 178; //@line 3948
  } else {
   $$4236$i = 0; //@line 3950
   label = 178; //@line 3951
  }
 } while (0);
 if ((label | 0) == 178) {
  if ($550 >>> 0 < 2147483647) {
   $620 = _sbrk($550 | 0) | 0; //@line 3957
   $621 = _sbrk(0) | 0; //@line 3958
   $627 = $621 - $620 | 0; //@line 3966
   $629 = $627 >>> 0 > ($$0197 + 40 | 0) >>> 0; //@line 3968
   if (!(($620 | 0) == (-1 | 0) | $629 ^ 1 | $620 >>> 0 < $621 >>> 0 & (($620 | 0) != (-1 | 0) & ($621 | 0) != (-1 | 0)) ^ 1)) {
    $$723947$i = $629 ? $627 : $$4236$i; //@line 3976
    $$748$i = $620; //@line 3976
    label = 180; //@line 3977
   }
  }
 }
 if ((label | 0) == 180) {
  $633 = (HEAP32[1449] | 0) + $$723947$i | 0; //@line 3983
  HEAP32[1449] = $633; //@line 3984
  if ($633 >>> 0 > (HEAP32[1450] | 0) >>> 0) {
   HEAP32[1450] = $633; //@line 3988
  }
  $636 = HEAP32[1347] | 0; //@line 3990
  do {
   if (!$636) {
    $638 = HEAP32[1345] | 0; //@line 3994
    if (($638 | 0) == 0 | $$748$i >>> 0 < $638 >>> 0) {
     HEAP32[1345] = $$748$i; //@line 3999
    }
    HEAP32[1453] = $$748$i; //@line 4001
    HEAP32[1454] = $$723947$i; //@line 4002
    HEAP32[1456] = 0; //@line 4003
    HEAP32[1350] = HEAP32[1459]; //@line 4005
    HEAP32[1349] = -1; //@line 4006
    HEAP32[1354] = 5404; //@line 4007
    HEAP32[1353] = 5404; //@line 4008
    HEAP32[1356] = 5412; //@line 4009
    HEAP32[1355] = 5412; //@line 4010
    HEAP32[1358] = 5420; //@line 4011
    HEAP32[1357] = 5420; //@line 4012
    HEAP32[1360] = 5428; //@line 4013
    HEAP32[1359] = 5428; //@line 4014
    HEAP32[1362] = 5436; //@line 4015
    HEAP32[1361] = 5436; //@line 4016
    HEAP32[1364] = 5444; //@line 4017
    HEAP32[1363] = 5444; //@line 4018
    HEAP32[1366] = 5452; //@line 4019
    HEAP32[1365] = 5452; //@line 4020
    HEAP32[1368] = 5460; //@line 4021
    HEAP32[1367] = 5460; //@line 4022
    HEAP32[1370] = 5468; //@line 4023
    HEAP32[1369] = 5468; //@line 4024
    HEAP32[1372] = 5476; //@line 4025
    HEAP32[1371] = 5476; //@line 4026
    HEAP32[1374] = 5484; //@line 4027
    HEAP32[1373] = 5484; //@line 4028
    HEAP32[1376] = 5492; //@line 4029
    HEAP32[1375] = 5492; //@line 4030
    HEAP32[1378] = 5500; //@line 4031
    HEAP32[1377] = 5500; //@line 4032
    HEAP32[1380] = 5508; //@line 4033
    HEAP32[1379] = 5508; //@line 4034
    HEAP32[1382] = 5516; //@line 4035
    HEAP32[1381] = 5516; //@line 4036
    HEAP32[1384] = 5524; //@line 4037
    HEAP32[1383] = 5524; //@line 4038
    HEAP32[1386] = 5532; //@line 4039
    HEAP32[1385] = 5532; //@line 4040
    HEAP32[1388] = 5540; //@line 4041
    HEAP32[1387] = 5540; //@line 4042
    HEAP32[1390] = 5548; //@line 4043
    HEAP32[1389] = 5548; //@line 4044
    HEAP32[1392] = 5556; //@line 4045
    HEAP32[1391] = 5556; //@line 4046
    HEAP32[1394] = 5564; //@line 4047
    HEAP32[1393] = 5564; //@line 4048
    HEAP32[1396] = 5572; //@line 4049
    HEAP32[1395] = 5572; //@line 4050
    HEAP32[1398] = 5580; //@line 4051
    HEAP32[1397] = 5580; //@line 4052
    HEAP32[1400] = 5588; //@line 4053
    HEAP32[1399] = 5588; //@line 4054
    HEAP32[1402] = 5596; //@line 4055
    HEAP32[1401] = 5596; //@line 4056
    HEAP32[1404] = 5604; //@line 4057
    HEAP32[1403] = 5604; //@line 4058
    HEAP32[1406] = 5612; //@line 4059
    HEAP32[1405] = 5612; //@line 4060
    HEAP32[1408] = 5620; //@line 4061
    HEAP32[1407] = 5620; //@line 4062
    HEAP32[1410] = 5628; //@line 4063
    HEAP32[1409] = 5628; //@line 4064
    HEAP32[1412] = 5636; //@line 4065
    HEAP32[1411] = 5636; //@line 4066
    HEAP32[1414] = 5644; //@line 4067
    HEAP32[1413] = 5644; //@line 4068
    HEAP32[1416] = 5652; //@line 4069
    HEAP32[1415] = 5652; //@line 4070
    $642 = $$723947$i + -40 | 0; //@line 4071
    $644 = $$748$i + 8 | 0; //@line 4073
    $649 = ($644 & 7 | 0) == 0 ? 0 : 0 - $644 & 7; //@line 4078
    $650 = $$748$i + $649 | 0; //@line 4079
    $651 = $642 - $649 | 0; //@line 4080
    HEAP32[1347] = $650; //@line 4081
    HEAP32[1344] = $651; //@line 4082
    HEAP32[$650 + 4 >> 2] = $651 | 1; //@line 4085
    HEAP32[$$748$i + $642 + 4 >> 2] = 40; //@line 4088
    HEAP32[1348] = HEAP32[1463]; //@line 4090
   } else {
    $$024367$i = 5812; //@line 4092
    while (1) {
     $657 = HEAP32[$$024367$i >> 2] | 0; //@line 4094
     $658 = $$024367$i + 4 | 0; //@line 4095
     $659 = HEAP32[$658 >> 2] | 0; //@line 4096
     if (($$748$i | 0) == ($657 + $659 | 0)) {
      label = 188; //@line 4100
      break;
     }
     $663 = HEAP32[$$024367$i + 8 >> 2] | 0; //@line 4104
     if (!$663) {
      break;
     } else {
      $$024367$i = $663; //@line 4109
     }
    }
    if ((label | 0) == 188) {
     if (!(HEAP32[$$024367$i + 12 >> 2] & 8)) {
      if ($$748$i >>> 0 > $636 >>> 0 & $657 >>> 0 <= $636 >>> 0) {
       HEAP32[$658 >> 2] = $659 + $$723947$i; //@line 4123
       $673 = (HEAP32[1344] | 0) + $$723947$i | 0; //@line 4125
       $675 = $636 + 8 | 0; //@line 4127
       $680 = ($675 & 7 | 0) == 0 ? 0 : 0 - $675 & 7; //@line 4132
       $681 = $636 + $680 | 0; //@line 4133
       $682 = $673 - $680 | 0; //@line 4134
       HEAP32[1347] = $681; //@line 4135
       HEAP32[1344] = $682; //@line 4136
       HEAP32[$681 + 4 >> 2] = $682 | 1; //@line 4139
       HEAP32[$636 + $673 + 4 >> 2] = 40; //@line 4142
       HEAP32[1348] = HEAP32[1463]; //@line 4144
       break;
      }
     }
    }
    $688 = HEAP32[1345] | 0; //@line 4149
    if ($$748$i >>> 0 < $688 >>> 0) {
     HEAP32[1345] = $$748$i; //@line 4152
     $753 = $$748$i; //@line 4153
    } else {
     $753 = $688; //@line 4155
    }
    $690 = $$748$i + $$723947$i | 0; //@line 4157
    $$124466$i = 5812; //@line 4158
    while (1) {
     if ((HEAP32[$$124466$i >> 2] | 0) == ($690 | 0)) {
      label = 196; //@line 4163
      break;
     }
     $694 = HEAP32[$$124466$i + 8 >> 2] | 0; //@line 4167
     if (!$694) {
      $$0$i$i$i = 5812; //@line 4170
      break;
     } else {
      $$124466$i = $694; //@line 4173
     }
    }
    if ((label | 0) == 196) {
     if (!(HEAP32[$$124466$i + 12 >> 2] & 8)) {
      HEAP32[$$124466$i >> 2] = $$748$i; //@line 4182
      $700 = $$124466$i + 4 | 0; //@line 4183
      HEAP32[$700 >> 2] = (HEAP32[$700 >> 2] | 0) + $$723947$i; //@line 4186
      $704 = $$748$i + 8 | 0; //@line 4188
      $710 = $$748$i + (($704 & 7 | 0) == 0 ? 0 : 0 - $704 & 7) | 0; //@line 4194
      $712 = $690 + 8 | 0; //@line 4196
      $718 = $690 + (($712 & 7 | 0) == 0 ? 0 : 0 - $712 & 7) | 0; //@line 4202
      $722 = $710 + $$0197 | 0; //@line 4206
      $723 = $718 - $710 - $$0197 | 0; //@line 4207
      HEAP32[$710 + 4 >> 2] = $$0197 | 3; //@line 4210
      do {
       if (($636 | 0) == ($718 | 0)) {
        $728 = (HEAP32[1344] | 0) + $723 | 0; //@line 4215
        HEAP32[1344] = $728; //@line 4216
        HEAP32[1347] = $722; //@line 4217
        HEAP32[$722 + 4 >> 2] = $728 | 1; //@line 4220
       } else {
        if ((HEAP32[1346] | 0) == ($718 | 0)) {
         $734 = (HEAP32[1343] | 0) + $723 | 0; //@line 4226
         HEAP32[1343] = $734; //@line 4227
         HEAP32[1346] = $722; //@line 4228
         HEAP32[$722 + 4 >> 2] = $734 | 1; //@line 4231
         HEAP32[$722 + $734 >> 2] = $734; //@line 4233
         break;
        }
        $739 = HEAP32[$718 + 4 >> 2] | 0; //@line 4237
        if (($739 & 3 | 0) == 1) {
         $742 = $739 & -8; //@line 4241
         $743 = $739 >>> 3; //@line 4242
         L311 : do {
          if ($739 >>> 0 < 256) {
           $746 = HEAP32[$718 + 8 >> 2] | 0; //@line 4247
           $748 = HEAP32[$718 + 12 >> 2] | 0; //@line 4249
           $750 = 5404 + ($743 << 1 << 2) | 0; //@line 4251
           do {
            if (($746 | 0) != ($750 | 0)) {
             if ($753 >>> 0 > $746 >>> 0) {
              _abort(); //@line 4257
             }
             if ((HEAP32[$746 + 12 >> 2] | 0) == ($718 | 0)) {
              break;
             }
             _abort(); //@line 4266
            }
           } while (0);
           if (($748 | 0) == ($746 | 0)) {
            HEAP32[1341] = HEAP32[1341] & ~(1 << $743); //@line 4276
            break;
           }
           do {
            if (($748 | 0) == ($750 | 0)) {
             $$pre$phi11$i$iZ2D = $748 + 8 | 0; //@line 4283
            } else {
             if ($753 >>> 0 > $748 >>> 0) {
              _abort(); //@line 4287
             }
             $764 = $748 + 8 | 0; //@line 4290
             if ((HEAP32[$764 >> 2] | 0) == ($718 | 0)) {
              $$pre$phi11$i$iZ2D = $764; //@line 4294
              break;
             }
             _abort(); //@line 4297
            }
           } while (0);
           HEAP32[$746 + 12 >> 2] = $748; //@line 4302
           HEAP32[$$pre$phi11$i$iZ2D >> 2] = $746; //@line 4303
          } else {
           $769 = HEAP32[$718 + 24 >> 2] | 0; //@line 4306
           $771 = HEAP32[$718 + 12 >> 2] | 0; //@line 4308
           do {
            if (($771 | 0) == ($718 | 0)) {
             $782 = $718 + 16 | 0; //@line 4312
             $783 = $782 + 4 | 0; //@line 4313
             $784 = HEAP32[$783 >> 2] | 0; //@line 4314
             if (!$784) {
              $786 = HEAP32[$782 >> 2] | 0; //@line 4317
              if (!$786) {
               $$3$i$i = 0; //@line 4320
               break;
              } else {
               $$1291$i$i = $786; //@line 4323
               $$1293$i$i = $782; //@line 4323
              }
             } else {
              $$1291$i$i = $784; //@line 4326
              $$1293$i$i = $783; //@line 4326
             }
             while (1) {
              $788 = $$1291$i$i + 20 | 0; //@line 4329
              $789 = HEAP32[$788 >> 2] | 0; //@line 4330
              if ($789 | 0) {
               $$1291$i$i = $789; //@line 4333
               $$1293$i$i = $788; //@line 4333
               continue;
              }
              $791 = $$1291$i$i + 16 | 0; //@line 4336
              $792 = HEAP32[$791 >> 2] | 0; //@line 4337
              if (!$792) {
               break;
              } else {
               $$1291$i$i = $792; //@line 4342
               $$1293$i$i = $791; //@line 4342
              }
             }
             if ($753 >>> 0 > $$1293$i$i >>> 0) {
              _abort(); //@line 4347
             } else {
              HEAP32[$$1293$i$i >> 2] = 0; //@line 4350
              $$3$i$i = $$1291$i$i; //@line 4351
              break;
             }
            } else {
             $774 = HEAP32[$718 + 8 >> 2] | 0; //@line 4356
             if ($753 >>> 0 > $774 >>> 0) {
              _abort(); //@line 4359
             }
             $776 = $774 + 12 | 0; //@line 4362
             if ((HEAP32[$776 >> 2] | 0) != ($718 | 0)) {
              _abort(); //@line 4366
             }
             $779 = $771 + 8 | 0; //@line 4369
             if ((HEAP32[$779 >> 2] | 0) == ($718 | 0)) {
              HEAP32[$776 >> 2] = $771; //@line 4373
              HEAP32[$779 >> 2] = $774; //@line 4374
              $$3$i$i = $771; //@line 4375
              break;
             } else {
              _abort(); //@line 4378
             }
            }
           } while (0);
           if (!$769) {
            break;
           }
           $797 = HEAP32[$718 + 28 >> 2] | 0; //@line 4388
           $798 = 5668 + ($797 << 2) | 0; //@line 4389
           do {
            if ((HEAP32[$798 >> 2] | 0) == ($718 | 0)) {
             HEAP32[$798 >> 2] = $$3$i$i; //@line 4394
             if ($$3$i$i | 0) {
              break;
             }
             HEAP32[1342] = HEAP32[1342] & ~(1 << $797); //@line 4403
             break L311;
            } else {
             if ((HEAP32[1345] | 0) >>> 0 > $769 >>> 0) {
              _abort(); //@line 4409
             } else {
              HEAP32[$769 + 16 + (((HEAP32[$769 + 16 >> 2] | 0) != ($718 | 0) & 1) << 2) >> 2] = $$3$i$i; //@line 4417
              if (!$$3$i$i) {
               break L311;
              } else {
               break;
              }
             }
            }
           } while (0);
           $812 = HEAP32[1345] | 0; //@line 4427
           if ($812 >>> 0 > $$3$i$i >>> 0) {
            _abort(); //@line 4430
           }
           HEAP32[$$3$i$i + 24 >> 2] = $769; //@line 4434
           $815 = $718 + 16 | 0; //@line 4435
           $816 = HEAP32[$815 >> 2] | 0; //@line 4436
           do {
            if ($816 | 0) {
             if ($812 >>> 0 > $816 >>> 0) {
              _abort(); //@line 4442
             } else {
              HEAP32[$$3$i$i + 16 >> 2] = $816; //@line 4446
              HEAP32[$816 + 24 >> 2] = $$3$i$i; //@line 4448
              break;
             }
            }
           } while (0);
           $822 = HEAP32[$815 + 4 >> 2] | 0; //@line 4454
           if (!$822) {
            break;
           }
           if ((HEAP32[1345] | 0) >>> 0 > $822 >>> 0) {
            _abort(); //@line 4462
           } else {
            HEAP32[$$3$i$i + 20 >> 2] = $822; //@line 4466
            HEAP32[$822 + 24 >> 2] = $$3$i$i; //@line 4468
            break;
           }
          }
         } while (0);
         $$0$i17$i = $718 + $742 | 0; //@line 4475
         $$0287$i$i = $742 + $723 | 0; //@line 4475
        } else {
         $$0$i17$i = $718; //@line 4477
         $$0287$i$i = $723; //@line 4477
        }
        $830 = $$0$i17$i + 4 | 0; //@line 4479
        HEAP32[$830 >> 2] = HEAP32[$830 >> 2] & -2; //@line 4482
        HEAP32[$722 + 4 >> 2] = $$0287$i$i | 1; //@line 4485
        HEAP32[$722 + $$0287$i$i >> 2] = $$0287$i$i; //@line 4487
        $836 = $$0287$i$i >>> 3; //@line 4488
        if ($$0287$i$i >>> 0 < 256) {
         $839 = 5404 + ($836 << 1 << 2) | 0; //@line 4492
         $840 = HEAP32[1341] | 0; //@line 4493
         $841 = 1 << $836; //@line 4494
         do {
          if (!($840 & $841)) {
           HEAP32[1341] = $840 | $841; //@line 4500
           $$0295$i$i = $839; //@line 4502
           $$pre$phi$i19$iZ2D = $839 + 8 | 0; //@line 4502
          } else {
           $845 = $839 + 8 | 0; //@line 4504
           $846 = HEAP32[$845 >> 2] | 0; //@line 4505
           if ((HEAP32[1345] | 0) >>> 0 <= $846 >>> 0) {
            $$0295$i$i = $846; //@line 4509
            $$pre$phi$i19$iZ2D = $845; //@line 4509
            break;
           }
           _abort(); //@line 4512
          }
         } while (0);
         HEAP32[$$pre$phi$i19$iZ2D >> 2] = $722; //@line 4516
         HEAP32[$$0295$i$i + 12 >> 2] = $722; //@line 4518
         HEAP32[$722 + 8 >> 2] = $$0295$i$i; //@line 4520
         HEAP32[$722 + 12 >> 2] = $839; //@line 4522
         break;
        }
        $852 = $$0287$i$i >>> 8; //@line 4525
        do {
         if (!$852) {
          $$0296$i$i = 0; //@line 4529
         } else {
          if ($$0287$i$i >>> 0 > 16777215) {
           $$0296$i$i = 31; //@line 4533
           break;
          }
          $857 = ($852 + 1048320 | 0) >>> 16 & 8; //@line 4538
          $858 = $852 << $857; //@line 4539
          $861 = ($858 + 520192 | 0) >>> 16 & 4; //@line 4542
          $863 = $858 << $861; //@line 4544
          $866 = ($863 + 245760 | 0) >>> 16 & 2; //@line 4547
          $871 = 14 - ($861 | $857 | $866) + ($863 << $866 >>> 15) | 0; //@line 4552
          $$0296$i$i = $$0287$i$i >>> ($871 + 7 | 0) & 1 | $871 << 1; //@line 4558
         }
        } while (0);
        $877 = 5668 + ($$0296$i$i << 2) | 0; //@line 4561
        HEAP32[$722 + 28 >> 2] = $$0296$i$i; //@line 4563
        $879 = $722 + 16 | 0; //@line 4564
        HEAP32[$879 + 4 >> 2] = 0; //@line 4566
        HEAP32[$879 >> 2] = 0; //@line 4567
        $881 = HEAP32[1342] | 0; //@line 4568
        $882 = 1 << $$0296$i$i; //@line 4569
        if (!($881 & $882)) {
         HEAP32[1342] = $881 | $882; //@line 4574
         HEAP32[$877 >> 2] = $722; //@line 4575
         HEAP32[$722 + 24 >> 2] = $877; //@line 4577
         HEAP32[$722 + 12 >> 2] = $722; //@line 4579
         HEAP32[$722 + 8 >> 2] = $722; //@line 4581
         break;
        }
        $$0288$i$i = $$0287$i$i << (($$0296$i$i | 0) == 31 ? 0 : 25 - ($$0296$i$i >>> 1) | 0); //@line 4590
        $$0289$i$i = HEAP32[$877 >> 2] | 0; //@line 4590
        while (1) {
         if ((HEAP32[$$0289$i$i + 4 >> 2] & -8 | 0) == ($$0287$i$i | 0)) {
          label = 263; //@line 4597
          break;
         }
         $900 = $$0289$i$i + 16 + ($$0288$i$i >>> 31 << 2) | 0; //@line 4601
         $902 = HEAP32[$900 >> 2] | 0; //@line 4603
         if (!$902) {
          label = 260; //@line 4606
          break;
         } else {
          $$0288$i$i = $$0288$i$i << 1; //@line 4609
          $$0289$i$i = $902; //@line 4609
         }
        }
        if ((label | 0) == 260) {
         if ((HEAP32[1345] | 0) >>> 0 > $900 >>> 0) {
          _abort(); //@line 4616
         } else {
          HEAP32[$900 >> 2] = $722; //@line 4619
          HEAP32[$722 + 24 >> 2] = $$0289$i$i; //@line 4621
          HEAP32[$722 + 12 >> 2] = $722; //@line 4623
          HEAP32[$722 + 8 >> 2] = $722; //@line 4625
          break;
         }
        } else if ((label | 0) == 263) {
         $909 = $$0289$i$i + 8 | 0; //@line 4630
         $910 = HEAP32[$909 >> 2] | 0; //@line 4631
         $911 = HEAP32[1345] | 0; //@line 4632
         if ($911 >>> 0 <= $910 >>> 0 & $911 >>> 0 <= $$0289$i$i >>> 0) {
          HEAP32[$910 + 12 >> 2] = $722; //@line 4638
          HEAP32[$909 >> 2] = $722; //@line 4639
          HEAP32[$722 + 8 >> 2] = $910; //@line 4641
          HEAP32[$722 + 12 >> 2] = $$0289$i$i; //@line 4643
          HEAP32[$722 + 24 >> 2] = 0; //@line 4645
          break;
         } else {
          _abort(); //@line 4648
         }
        }
       }
      } while (0);
      $$0 = $710 + 8 | 0; //@line 4655
      STACKTOP = sp; //@line 4656
      return $$0 | 0; //@line 4656
     } else {
      $$0$i$i$i = 5812; //@line 4658
     }
    }
    while (1) {
     $919 = HEAP32[$$0$i$i$i >> 2] | 0; //@line 4662
     if ($919 >>> 0 <= $636 >>> 0) {
      $923 = $919 + (HEAP32[$$0$i$i$i + 4 >> 2] | 0) | 0; //@line 4667
      if ($923 >>> 0 > $636 >>> 0) {
       break;
      }
     }
     $$0$i$i$i = HEAP32[$$0$i$i$i + 8 >> 2] | 0; //@line 4675
    }
    $927 = $923 + -47 | 0; //@line 4677
    $929 = $927 + 8 | 0; //@line 4679
    $935 = $927 + (($929 & 7 | 0) == 0 ? 0 : 0 - $929 & 7) | 0; //@line 4685
    $936 = $636 + 16 | 0; //@line 4686
    $938 = $935 >>> 0 < $936 >>> 0 ? $636 : $935; //@line 4688
    $939 = $938 + 8 | 0; //@line 4689
    $940 = $938 + 24 | 0; //@line 4690
    $941 = $$723947$i + -40 | 0; //@line 4691
    $943 = $$748$i + 8 | 0; //@line 4693
    $948 = ($943 & 7 | 0) == 0 ? 0 : 0 - $943 & 7; //@line 4698
    $949 = $$748$i + $948 | 0; //@line 4699
    $950 = $941 - $948 | 0; //@line 4700
    HEAP32[1347] = $949; //@line 4701
    HEAP32[1344] = $950; //@line 4702
    HEAP32[$949 + 4 >> 2] = $950 | 1; //@line 4705
    HEAP32[$$748$i + $941 + 4 >> 2] = 40; //@line 4708
    HEAP32[1348] = HEAP32[1463]; //@line 4710
    $956 = $938 + 4 | 0; //@line 4711
    HEAP32[$956 >> 2] = 27; //@line 4712
    HEAP32[$939 >> 2] = HEAP32[1453]; //@line 4713
    HEAP32[$939 + 4 >> 2] = HEAP32[1454]; //@line 4713
    HEAP32[$939 + 8 >> 2] = HEAP32[1455]; //@line 4713
    HEAP32[$939 + 12 >> 2] = HEAP32[1456]; //@line 4713
    HEAP32[1453] = $$748$i; //@line 4714
    HEAP32[1454] = $$723947$i; //@line 4715
    HEAP32[1456] = 0; //@line 4716
    HEAP32[1455] = $939; //@line 4717
    $958 = $940; //@line 4718
    do {
     $958$looptemp = $958;
     $958 = $958 + 4 | 0; //@line 4720
     HEAP32[$958 >> 2] = 7; //@line 4721
    } while (($958$looptemp + 8 | 0) >>> 0 < $923 >>> 0);
    if (($938 | 0) != ($636 | 0)) {
     $964 = $938 - $636 | 0; //@line 4734
     HEAP32[$956 >> 2] = HEAP32[$956 >> 2] & -2; //@line 4737
     HEAP32[$636 + 4 >> 2] = $964 | 1; //@line 4740
     HEAP32[$938 >> 2] = $964; //@line 4741
     $969 = $964 >>> 3; //@line 4742
     if ($964 >>> 0 < 256) {
      $972 = 5404 + ($969 << 1 << 2) | 0; //@line 4746
      $973 = HEAP32[1341] | 0; //@line 4747
      $974 = 1 << $969; //@line 4748
      if (!($973 & $974)) {
       HEAP32[1341] = $973 | $974; //@line 4753
       $$0211$i$i = $972; //@line 4755
       $$pre$phi$i$iZ2D = $972 + 8 | 0; //@line 4755
      } else {
       $978 = $972 + 8 | 0; //@line 4757
       $979 = HEAP32[$978 >> 2] | 0; //@line 4758
       if ((HEAP32[1345] | 0) >>> 0 > $979 >>> 0) {
        _abort(); //@line 4762
       } else {
        $$0211$i$i = $979; //@line 4765
        $$pre$phi$i$iZ2D = $978; //@line 4765
       }
      }
      HEAP32[$$pre$phi$i$iZ2D >> 2] = $636; //@line 4768
      HEAP32[$$0211$i$i + 12 >> 2] = $636; //@line 4770
      HEAP32[$636 + 8 >> 2] = $$0211$i$i; //@line 4772
      HEAP32[$636 + 12 >> 2] = $972; //@line 4774
      break;
     }
     $985 = $964 >>> 8; //@line 4777
     if (!$985) {
      $$0212$i$i = 0; //@line 4780
     } else {
      if ($964 >>> 0 > 16777215) {
       $$0212$i$i = 31; //@line 4784
      } else {
       $990 = ($985 + 1048320 | 0) >>> 16 & 8; //@line 4788
       $991 = $985 << $990; //@line 4789
       $994 = ($991 + 520192 | 0) >>> 16 & 4; //@line 4792
       $996 = $991 << $994; //@line 4794
       $999 = ($996 + 245760 | 0) >>> 16 & 2; //@line 4797
       $1004 = 14 - ($994 | $990 | $999) + ($996 << $999 >>> 15) | 0; //@line 4802
       $$0212$i$i = $964 >>> ($1004 + 7 | 0) & 1 | $1004 << 1; //@line 4808
      }
     }
     $1010 = 5668 + ($$0212$i$i << 2) | 0; //@line 4811
     HEAP32[$636 + 28 >> 2] = $$0212$i$i; //@line 4813
     HEAP32[$636 + 20 >> 2] = 0; //@line 4815
     HEAP32[$936 >> 2] = 0; //@line 4816
     $1013 = HEAP32[1342] | 0; //@line 4817
     $1014 = 1 << $$0212$i$i; //@line 4818
     if (!($1013 & $1014)) {
      HEAP32[1342] = $1013 | $1014; //@line 4823
      HEAP32[$1010 >> 2] = $636; //@line 4824
      HEAP32[$636 + 24 >> 2] = $1010; //@line 4826
      HEAP32[$636 + 12 >> 2] = $636; //@line 4828
      HEAP32[$636 + 8 >> 2] = $636; //@line 4830
      break;
     }
     $$0206$i$i = $964 << (($$0212$i$i | 0) == 31 ? 0 : 25 - ($$0212$i$i >>> 1) | 0); //@line 4839
     $$0207$i$i = HEAP32[$1010 >> 2] | 0; //@line 4839
     while (1) {
      if ((HEAP32[$$0207$i$i + 4 >> 2] & -8 | 0) == ($964 | 0)) {
       label = 289; //@line 4846
       break;
      }
      $1032 = $$0207$i$i + 16 + ($$0206$i$i >>> 31 << 2) | 0; //@line 4850
      $1034 = HEAP32[$1032 >> 2] | 0; //@line 4852
      if (!$1034) {
       label = 286; //@line 4855
       break;
      } else {
       $$0206$i$i = $$0206$i$i << 1; //@line 4858
       $$0207$i$i = $1034; //@line 4858
      }
     }
     if ((label | 0) == 286) {
      if ((HEAP32[1345] | 0) >>> 0 > $1032 >>> 0) {
       _abort(); //@line 4865
      } else {
       HEAP32[$1032 >> 2] = $636; //@line 4868
       HEAP32[$636 + 24 >> 2] = $$0207$i$i; //@line 4870
       HEAP32[$636 + 12 >> 2] = $636; //@line 4872
       HEAP32[$636 + 8 >> 2] = $636; //@line 4874
       break;
      }
     } else if ((label | 0) == 289) {
      $1041 = $$0207$i$i + 8 | 0; //@line 4879
      $1042 = HEAP32[$1041 >> 2] | 0; //@line 4880
      $1043 = HEAP32[1345] | 0; //@line 4881
      if ($1043 >>> 0 <= $1042 >>> 0 & $1043 >>> 0 <= $$0207$i$i >>> 0) {
       HEAP32[$1042 + 12 >> 2] = $636; //@line 4887
       HEAP32[$1041 >> 2] = $636; //@line 4888
       HEAP32[$636 + 8 >> 2] = $1042; //@line 4890
       HEAP32[$636 + 12 >> 2] = $$0207$i$i; //@line 4892
       HEAP32[$636 + 24 >> 2] = 0; //@line 4894
       break;
      } else {
       _abort(); //@line 4897
      }
     }
    }
   }
  } while (0);
  $1052 = HEAP32[1344] | 0; //@line 4904
  if ($1052 >>> 0 > $$0197 >>> 0) {
   $1054 = $1052 - $$0197 | 0; //@line 4907
   HEAP32[1344] = $1054; //@line 4908
   $1055 = HEAP32[1347] | 0; //@line 4909
   $1056 = $1055 + $$0197 | 0; //@line 4910
   HEAP32[1347] = $1056; //@line 4911
   HEAP32[$1056 + 4 >> 2] = $1054 | 1; //@line 4914
   HEAP32[$1055 + 4 >> 2] = $$0197 | 3; //@line 4917
   $$0 = $1055 + 8 | 0; //@line 4919
   STACKTOP = sp; //@line 4920
   return $$0 | 0; //@line 4920
  }
 }
 HEAP32[(___errno_location() | 0) >> 2] = 12; //@line 4924
 $$0 = 0; //@line 4925
 STACKTOP = sp; //@line 4926
 return $$0 | 0; //@line 4926
}
function _fmt_fp($0, $1, $2, $3, $4, $5) {
 $0 = $0 | 0;
 $1 = +$1;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 $5 = $5 | 0;
 var $$$3484 = 0, $$$3484700 = 0, $$$4502 = 0, $$$564 = 0.0, $$0 = 0, $$0463$lcssa = 0, $$0463587 = 0, $$0464597 = 0, $$0471 = 0.0, $$0479 = 0, $$0487644 = 0, $$0488655 = 0, $$0488657 = 0, $$0496$$9 = 0, $$0497656 = 0, $$0498 = 0, $$0509585 = 0.0, $$0511 = 0, $$0514639 = 0, $$0520 = 0, $$0521 = 0, $$0521$ = 0, $$0523 = 0, $$0527$in633 = 0, $$0530638 = 0, $$1465 = 0, $$1467 = 0.0, $$1469 = 0.0, $$1472 = 0.0, $$1480 = 0, $$1482$lcssa = 0, $$1482663 = 0, $$1489643 = 0, $$1499$lcssa = 0, $$1499662 = 0, $$1508586 = 0, $$1512$lcssa = 0, $$1512610 = 0, $$1515 = 0, $$1524 = 0, $$1528617 = 0, $$1531$lcssa = 0, $$1531632 = 0, $$1601 = 0, $$2 = 0, $$2473 = 0.0, $$2476 = 0, $$2483$ph = 0, $$2500 = 0, $$2513 = 0, $$2516621 = 0, $$2529 = 0, $$2532620 = 0, $$3 = 0.0, $$3477 = 0, $$3484$lcssa = 0, $$3484650 = 0, $$3501$lcssa = 0, $$3501649 = 0, $$3533616 = 0, $$4 = 0.0, $$4478$lcssa = 0, $$4478593 = 0, $$4492 = 0, $$4502 = 0, $$4518 = 0, $$5$lcssa = 0, $$540 = 0, $$540$ = 0, $$543 = 0.0, $$548 = 0, $$5486$lcssa = 0, $$5486626 = 0, $$5493600 = 0, $$550 = 0, $$5519$ph = 0, $$5605 = 0, $$561 = 0, $$6 = 0, $$6494592 = 0, $$7495604 = 0, $$7505 = 0, $$7505$ = 0, $$7505$ph = 0, $$8 = 0, $$9$ph = 0, $$lcssa675 = 0, $$pn = 0, $$pr = 0, $$pr566 = 0, $$pre$phi691Z2D = 0, $$pre$phi698Z2D = 0, $$pre693 = 0, $$sink = 0, $$sink547$lcssa = 0, $$sink547625 = 0, $$sink560 = 0, $10 = 0, $101 = 0, $104 = 0, $106 = 0, $11 = 0, $113 = 0, $116 = 0, $124 = 0, $125 = 0, $128 = 0, $130 = 0, $131 = 0, $132 = 0, $138 = 0, $140 = 0, $144 = 0, $149 = 0, $150 = 0, $151 = 0, $152 = 0, $154 = 0, $160 = 0, $161 = 0, $162 = 0, $174 = 0, $185 = 0, $189 = 0, $190 = 0, $193 = 0, $198 = 0, $199 = 0, $201 = 0, $209 = 0, $212 = 0, $213 = 0, $215 = 0, $217 = 0, $218 = 0, $221 = 0, $225 = 0, $230 = 0, $233 = 0, $236 = 0, $238 = 0, $240 = 0, $242 = 0, $247 = 0, $248 = 0, $251 = 0, $253 = 0, $256 = 0, $259 = 0, $267 = 0, $27 = 0, $270 = 0, $275 = 0, $284 = 0, $285 = 0, $289 = 0, $292 = 0, $294 = 0, $296 = 0, $300 = 0, $303 = 0, $304 = 0, $308 = 0, $31 = 0, $318 = 0, $323 = 0, $326 = 0, $327 = 0, $328 = 0, $330 = 0, $335 = 0, $347 = 0, $35 = 0.0, $351 = 0, $356 = 0, $36 = 0, $363 = 0, $364 = 0, $365 = 0, $366 = 0, $367 = 0, $369 = 0, $373 = 0, $375 = 0, $378 = 0, $381 = 0, $39 = 0, $41 = 0, $44 = 0, $46 = 0, $6 = 0, $60 = 0, $63 = 0, $66 = 0, $68 = 0, $7 = 0, $76 = 0, $77 = 0, $79 = 0, $8 = 0, $80 = 0, $86 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 8196
 STACKTOP = STACKTOP + 560 | 0; //@line 8197
 $6 = sp + 8 | 0; //@line 8198
 $7 = sp; //@line 8199
 $8 = sp + 524 | 0; //@line 8200
 $9 = $8; //@line 8201
 $10 = sp + 512 | 0; //@line 8202
 HEAP32[$7 >> 2] = 0; //@line 8203
 $11 = $10 + 12 | 0; //@line 8204
 ___DOUBLE_BITS_677($1) | 0; //@line 8205
 if ((tempRet0 | 0) < 0) {
  $$0471 = -$1; //@line 8210
  $$0520 = 1; //@line 8210
  $$0521 = 2568; //@line 8210
 } else {
  $$0471 = $1; //@line 8221
  $$0520 = ($4 & 2049 | 0) != 0 & 1; //@line 8221
  $$0521 = ($4 & 2048 | 0) == 0 ? ($4 & 1 | 0) == 0 ? 2569 : 2574 : 2571; //@line 8221
 }
 ___DOUBLE_BITS_677($$0471) | 0; //@line 8223
 do {
  if (0 == 0 & (tempRet0 & 2146435072 | 0) == 2146435072) {
   $27 = ($5 & 32 | 0) != 0; //@line 8232
   $31 = $$0520 + 3 | 0; //@line 8237
   _pad_676($0, 32, $2, $31, $4 & -65537); //@line 8239
   _out_670($0, $$0521, $$0520); //@line 8240
   _out_670($0, $$0471 != $$0471 | 0.0 != 0.0 ? $27 ? 2595 : 2599 : $27 ? 2587 : 2591, 3); //@line 8241
   _pad_676($0, 32, $2, $31, $4 ^ 8192); //@line 8243
   $$sink560 = $31; //@line 8244
  } else {
   $35 = +_frexpl($$0471, $7) * 2.0; //@line 8247
   $36 = $35 != 0.0; //@line 8248
   if ($36) {
    HEAP32[$7 >> 2] = (HEAP32[$7 >> 2] | 0) + -1; //@line 8252
   }
   $39 = $5 | 32; //@line 8254
   if (($39 | 0) == 97) {
    $41 = $5 & 32; //@line 8257
    $$0521$ = ($41 | 0) == 0 ? $$0521 : $$0521 + 9 | 0; //@line 8260
    $44 = $$0520 | 2; //@line 8261
    $46 = 12 - $3 | 0; //@line 8263
    do {
     if ($3 >>> 0 > 11 | ($46 | 0) == 0) {
      $$1472 = $35; //@line 8268
     } else {
      $$0509585 = 8.0; //@line 8270
      $$1508586 = $46; //@line 8270
      do {
       $$1508586 = $$1508586 + -1 | 0; //@line 8272
       $$0509585 = $$0509585 * 16.0; //@line 8273
      } while (($$1508586 | 0) != 0);
      if ((HEAP8[$$0521$ >> 0] | 0) == 45) {
       $$1472 = -($$0509585 + (-$35 - $$0509585)); //@line 8288
       break;
      } else {
       $$1472 = $35 + $$0509585 - $$0509585; //@line 8293
       break;
      }
     }
    } while (0);
    $60 = HEAP32[$7 >> 2] | 0; //@line 8298
    $63 = ($60 | 0) < 0 ? 0 - $60 | 0 : $60; //@line 8301
    $66 = _fmt_u($63, (($63 | 0) < 0) << 31 >> 31, $11) | 0; //@line 8304
    if (($66 | 0) == ($11 | 0)) {
     $68 = $10 + 11 | 0; //@line 8307
     HEAP8[$68 >> 0] = 48; //@line 8308
     $$0511 = $68; //@line 8309
    } else {
     $$0511 = $66; //@line 8311
    }
    HEAP8[$$0511 + -1 >> 0] = ($60 >> 31 & 2) + 43; //@line 8318
    $76 = $$0511 + -2 | 0; //@line 8321
    HEAP8[$76 >> 0] = $5 + 15; //@line 8322
    $77 = ($3 | 0) < 1; //@line 8323
    $79 = ($4 & 8 | 0) == 0; //@line 8325
    $$0523 = $8; //@line 8326
    $$2473 = $$1472; //@line 8326
    while (1) {
     $80 = ~~$$2473; //@line 8328
     $86 = $$0523 + 1 | 0; //@line 8334
     HEAP8[$$0523 >> 0] = $41 | HEAPU8[2603 + $80 >> 0]; //@line 8335
     $$2473 = ($$2473 - +($80 | 0)) * 16.0; //@line 8338
     if (($86 - $9 | 0) == 1) {
      if ($79 & ($77 & $$2473 == 0.0)) {
       $$1524 = $86; //@line 8347
      } else {
       HEAP8[$86 >> 0] = 46; //@line 8350
       $$1524 = $$0523 + 2 | 0; //@line 8351
      }
     } else {
      $$1524 = $86; //@line 8354
     }
     if (!($$2473 != 0.0)) {
      break;
     } else {
      $$0523 = $$1524; //@line 8358
     }
    }
    $$pre693 = $$1524; //@line 8364
    if (!$3) {
     label = 24; //@line 8366
    } else {
     if ((-2 - $9 + $$pre693 | 0) < ($3 | 0)) {
      $$pre$phi691Z2D = $$pre693 - $9 | 0; //@line 8374
      $$sink = $3 + 2 | 0; //@line 8374
     } else {
      label = 24; //@line 8376
     }
    }
    if ((label | 0) == 24) {
     $101 = $$pre693 - $9 | 0; //@line 8380
     $$pre$phi691Z2D = $101; //@line 8381
     $$sink = $101; //@line 8381
    }
    $104 = $11 - $76 | 0; //@line 8385
    $106 = $104 + $44 + $$sink | 0; //@line 8387
    _pad_676($0, 32, $2, $106, $4); //@line 8388
    _out_670($0, $$0521$, $44); //@line 8389
    _pad_676($0, 48, $2, $106, $4 ^ 65536); //@line 8391
    _out_670($0, $8, $$pre$phi691Z2D); //@line 8392
    _pad_676($0, 48, $$sink - $$pre$phi691Z2D | 0, 0, 0); //@line 8394
    _out_670($0, $76, $104); //@line 8395
    _pad_676($0, 32, $2, $106, $4 ^ 8192); //@line 8397
    $$sink560 = $106; //@line 8398
    break;
   }
   $$540 = ($3 | 0) < 0 ? 6 : $3; //@line 8402
   if ($36) {
    $113 = (HEAP32[$7 >> 2] | 0) + -28 | 0; //@line 8406
    HEAP32[$7 >> 2] = $113; //@line 8407
    $$3 = $35 * 268435456.0; //@line 8408
    $$pr = $113; //@line 8408
   } else {
    $$3 = $35; //@line 8411
    $$pr = HEAP32[$7 >> 2] | 0; //@line 8411
   }
   $$561 = ($$pr | 0) < 0 ? $6 : $6 + 288 | 0; //@line 8415
   $$0498 = $$561; //@line 8416
   $$4 = $$3; //@line 8416
   do {
    $116 = ~~$$4 >>> 0; //@line 8418
    HEAP32[$$0498 >> 2] = $116; //@line 8419
    $$0498 = $$0498 + 4 | 0; //@line 8420
    $$4 = ($$4 - +($116 >>> 0)) * 1.0e9; //@line 8423
   } while ($$4 != 0.0);
   if (($$pr | 0) > 0) {
    $$1482663 = $$561; //@line 8433
    $$1499662 = $$0498; //@line 8433
    $124 = $$pr; //@line 8433
    while (1) {
     $125 = ($124 | 0) < 29 ? $124 : 29; //@line 8436
     $$0488655 = $$1499662 + -4 | 0; //@line 8437
     if ($$0488655 >>> 0 < $$1482663 >>> 0) {
      $$2483$ph = $$1482663; //@line 8440
     } else {
      $$0488657 = $$0488655; //@line 8442
      $$0497656 = 0; //@line 8442
      do {
       $128 = _bitshift64Shl(HEAP32[$$0488657 >> 2] | 0, 0, $125 | 0) | 0; //@line 8445
       $130 = _i64Add($128 | 0, tempRet0 | 0, $$0497656 | 0, 0) | 0; //@line 8447
       $131 = tempRet0; //@line 8448
       $132 = ___uremdi3($130 | 0, $131 | 0, 1e9, 0) | 0; //@line 8449
       HEAP32[$$0488657 >> 2] = $132; //@line 8451
       $$0497656 = ___udivdi3($130 | 0, $131 | 0, 1e9, 0) | 0; //@line 8452
       $$0488657 = $$0488657 + -4 | 0; //@line 8454
      } while ($$0488657 >>> 0 >= $$1482663 >>> 0);
      if (!$$0497656) {
       $$2483$ph = $$1482663; //@line 8464
      } else {
       $138 = $$1482663 + -4 | 0; //@line 8466
       HEAP32[$138 >> 2] = $$0497656; //@line 8467
       $$2483$ph = $138; //@line 8468
      }
     }
     $$2500 = $$1499662; //@line 8471
     while (1) {
      if ($$2500 >>> 0 <= $$2483$ph >>> 0) {
       break;
      }
      $140 = $$2500 + -4 | 0; //@line 8477
      if (!(HEAP32[$140 >> 2] | 0)) {
       $$2500 = $140; //@line 8481
      } else {
       break;
      }
     }
     $144 = (HEAP32[$7 >> 2] | 0) - $125 | 0; //@line 8487
     HEAP32[$7 >> 2] = $144; //@line 8488
     if (($144 | 0) > 0) {
      $$1482663 = $$2483$ph; //@line 8491
      $$1499662 = $$2500; //@line 8491
      $124 = $144; //@line 8491
     } else {
      $$1482$lcssa = $$2483$ph; //@line 8493
      $$1499$lcssa = $$2500; //@line 8493
      $$pr566 = $144; //@line 8493
      break;
     }
    }
   } else {
    $$1482$lcssa = $$561; //@line 8498
    $$1499$lcssa = $$0498; //@line 8498
    $$pr566 = $$pr; //@line 8498
   }
   if (($$pr566 | 0) < 0) {
    $149 = (($$540 + 25 | 0) / 9 | 0) + 1 | 0; //@line 8504
    $150 = ($39 | 0) == 102; //@line 8505
    $$3484650 = $$1482$lcssa; //@line 8506
    $$3501649 = $$1499$lcssa; //@line 8506
    $152 = $$pr566; //@line 8506
    while (1) {
     $151 = 0 - $152 | 0; //@line 8508
     $154 = ($151 | 0) < 9 ? $151 : 9; //@line 8510
     if ($$3484650 >>> 0 < $$3501649 >>> 0) {
      $160 = (1 << $154) + -1 | 0; //@line 8514
      $161 = 1e9 >>> $154; //@line 8515
      $$0487644 = 0; //@line 8516
      $$1489643 = $$3484650; //@line 8516
      do {
       $162 = HEAP32[$$1489643 >> 2] | 0; //@line 8518
       HEAP32[$$1489643 >> 2] = ($162 >>> $154) + $$0487644; //@line 8522
       $$0487644 = Math_imul($162 & $160, $161) | 0; //@line 8523
       $$1489643 = $$1489643 + 4 | 0; //@line 8524
      } while ($$1489643 >>> 0 < $$3501649 >>> 0);
      $$$3484 = (HEAP32[$$3484650 >> 2] | 0) == 0 ? $$3484650 + 4 | 0 : $$3484650; //@line 8535
      if (!$$0487644) {
       $$$3484700 = $$$3484; //@line 8538
       $$4502 = $$3501649; //@line 8538
      } else {
       HEAP32[$$3501649 >> 2] = $$0487644; //@line 8541
       $$$3484700 = $$$3484; //@line 8542
       $$4502 = $$3501649 + 4 | 0; //@line 8542
      }
     } else {
      $$$3484700 = (HEAP32[$$3484650 >> 2] | 0) == 0 ? $$3484650 + 4 | 0 : $$3484650; //@line 8549
      $$4502 = $$3501649; //@line 8549
     }
     $174 = $150 ? $$561 : $$$3484700; //@line 8551
     $$$4502 = ($$4502 - $174 >> 2 | 0) > ($149 | 0) ? $174 + ($149 << 2) | 0 : $$4502; //@line 8558
     $152 = (HEAP32[$7 >> 2] | 0) + $154 | 0; //@line 8560
     HEAP32[$7 >> 2] = $152; //@line 8561
     if (($152 | 0) >= 0) {
      $$3484$lcssa = $$$3484700; //@line 8566
      $$3501$lcssa = $$$4502; //@line 8566
      break;
     } else {
      $$3484650 = $$$3484700; //@line 8564
      $$3501649 = $$$4502; //@line 8564
     }
    }
   } else {
    $$3484$lcssa = $$1482$lcssa; //@line 8571
    $$3501$lcssa = $$1499$lcssa; //@line 8571
   }
   $185 = $$561; //@line 8574
   if ($$3484$lcssa >>> 0 < $$3501$lcssa >>> 0) {
    $189 = ($185 - $$3484$lcssa >> 2) * 9 | 0; //@line 8579
    $190 = HEAP32[$$3484$lcssa >> 2] | 0; //@line 8580
    if ($190 >>> 0 < 10) {
     $$1515 = $189; //@line 8583
    } else {
     $$0514639 = $189; //@line 8585
     $$0530638 = 10; //@line 8585
     while (1) {
      $$0530638 = $$0530638 * 10 | 0; //@line 8587
      $193 = $$0514639 + 1 | 0; //@line 8588
      if ($190 >>> 0 < $$0530638 >>> 0) {
       $$1515 = $193; //@line 8591
       break;
      } else {
       $$0514639 = $193; //@line 8594
      }
     }
    }
   } else {
    $$1515 = 0; //@line 8599
   }
   $198 = ($39 | 0) == 103; //@line 8604
   $199 = ($$540 | 0) != 0; //@line 8605
   $201 = $$540 - (($39 | 0) != 102 ? $$1515 : 0) + (($199 & $198) << 31 >> 31) | 0; //@line 8608
   if (($201 | 0) < ((($$3501$lcssa - $185 >> 2) * 9 | 0) + -9 | 0)) {
    $209 = $201 + 9216 | 0; //@line 8617
    $212 = $$561 + 4 + ((($209 | 0) / 9 | 0) + -1024 << 2) | 0; //@line 8620
    $213 = ($209 | 0) % 9 | 0; //@line 8621
    if (($213 | 0) < 8) {
     $$0527$in633 = $213; //@line 8624
     $$1531632 = 10; //@line 8624
     while (1) {
      $215 = $$1531632 * 10 | 0; //@line 8627
      if (($$0527$in633 | 0) < 7) {
       $$0527$in633 = $$0527$in633 + 1 | 0; //@line 8630
       $$1531632 = $215; //@line 8630
      } else {
       $$1531$lcssa = $215; //@line 8632
       break;
      }
     }
    } else {
     $$1531$lcssa = 10; //@line 8637
    }
    $217 = HEAP32[$212 >> 2] | 0; //@line 8639
    $218 = ($217 >>> 0) % ($$1531$lcssa >>> 0) | 0; //@line 8640
    $221 = ($212 + 4 | 0) == ($$3501$lcssa | 0); //@line 8643
    if ($221 & ($218 | 0) == 0) {
     $$4492 = $212; //@line 8646
     $$4518 = $$1515; //@line 8646
     $$8 = $$3484$lcssa; //@line 8646
    } else {
     $$543 = ((($217 >>> 0) / ($$1531$lcssa >>> 0) | 0) & 1 | 0) == 0 ? 9007199254740992.0 : 9007199254740994.0; //@line 8651
     $225 = ($$1531$lcssa | 0) / 2 | 0; //@line 8652
     $$$564 = $218 >>> 0 < $225 >>> 0 ? .5 : $221 & ($218 | 0) == ($225 | 0) ? 1.0 : 1.5; //@line 8657
     if (!$$0520) {
      $$1467 = $$$564; //@line 8660
      $$1469 = $$543; //@line 8660
     } else {
      $230 = (HEAP8[$$0521 >> 0] | 0) == 45; //@line 8663
      $$1467 = $230 ? -$$$564 : $$$564; //@line 8668
      $$1469 = $230 ? -$$543 : $$543; //@line 8668
     }
     $233 = $217 - $218 | 0; //@line 8670
     HEAP32[$212 >> 2] = $233; //@line 8671
     if ($$1469 + $$1467 != $$1469) {
      $236 = $233 + $$1531$lcssa | 0; //@line 8675
      HEAP32[$212 >> 2] = $236; //@line 8676
      if ($236 >>> 0 > 999999999) {
       $$5486626 = $$3484$lcssa; //@line 8679
       $$sink547625 = $212; //@line 8679
       while (1) {
        $238 = $$sink547625 + -4 | 0; //@line 8681
        HEAP32[$$sink547625 >> 2] = 0; //@line 8682
        if ($238 >>> 0 < $$5486626 >>> 0) {
         $240 = $$5486626 + -4 | 0; //@line 8685
         HEAP32[$240 >> 2] = 0; //@line 8686
         $$6 = $240; //@line 8687
        } else {
         $$6 = $$5486626; //@line 8689
        }
        $242 = (HEAP32[$238 >> 2] | 0) + 1 | 0; //@line 8692
        HEAP32[$238 >> 2] = $242; //@line 8693
        if ($242 >>> 0 > 999999999) {
         $$5486626 = $$6; //@line 8696
         $$sink547625 = $238; //@line 8696
        } else {
         $$5486$lcssa = $$6; //@line 8698
         $$sink547$lcssa = $238; //@line 8698
         break;
        }
       }
      } else {
       $$5486$lcssa = $$3484$lcssa; //@line 8703
       $$sink547$lcssa = $212; //@line 8703
      }
      $247 = ($185 - $$5486$lcssa >> 2) * 9 | 0; //@line 8708
      $248 = HEAP32[$$5486$lcssa >> 2] | 0; //@line 8709
      if ($248 >>> 0 < 10) {
       $$4492 = $$sink547$lcssa; //@line 8712
       $$4518 = $247; //@line 8712
       $$8 = $$5486$lcssa; //@line 8712
      } else {
       $$2516621 = $247; //@line 8714
       $$2532620 = 10; //@line 8714
       while (1) {
        $$2532620 = $$2532620 * 10 | 0; //@line 8716
        $251 = $$2516621 + 1 | 0; //@line 8717
        if ($248 >>> 0 < $$2532620 >>> 0) {
         $$4492 = $$sink547$lcssa; //@line 8720
         $$4518 = $251; //@line 8720
         $$8 = $$5486$lcssa; //@line 8720
         break;
        } else {
         $$2516621 = $251; //@line 8723
        }
       }
      }
     } else {
      $$4492 = $212; //@line 8728
      $$4518 = $$1515; //@line 8728
      $$8 = $$3484$lcssa; //@line 8728
     }
    }
    $253 = $$4492 + 4 | 0; //@line 8731
    $$5519$ph = $$4518; //@line 8734
    $$7505$ph = $$3501$lcssa >>> 0 > $253 >>> 0 ? $253 : $$3501$lcssa; //@line 8734
    $$9$ph = $$8; //@line 8734
   } else {
    $$5519$ph = $$1515; //@line 8736
    $$7505$ph = $$3501$lcssa; //@line 8736
    $$9$ph = $$3484$lcssa; //@line 8736
   }
   $$7505 = $$7505$ph; //@line 8738
   while (1) {
    if ($$7505 >>> 0 <= $$9$ph >>> 0) {
     $$lcssa675 = 0; //@line 8742
     break;
    }
    $256 = $$7505 + -4 | 0; //@line 8745
    if (!(HEAP32[$256 >> 2] | 0)) {
     $$7505 = $256; //@line 8749
    } else {
     $$lcssa675 = 1; //@line 8751
     break;
    }
   }
   $259 = 0 - $$5519$ph | 0; //@line 8755
   do {
    if ($198) {
     $$540$ = $$540 + (($199 ^ 1) & 1) | 0; //@line 8760
     if (($$540$ | 0) > ($$5519$ph | 0) & ($$5519$ph | 0) > -5) {
      $$0479 = $5 + -1 | 0; //@line 8768
      $$2476 = $$540$ + -1 - $$5519$ph | 0; //@line 8768
     } else {
      $$0479 = $5 + -2 | 0; //@line 8772
      $$2476 = $$540$ + -1 | 0; //@line 8772
     }
     $267 = $4 & 8; //@line 8774
     if (!$267) {
      if ($$lcssa675) {
       $270 = HEAP32[$$7505 + -4 >> 2] | 0; //@line 8779
       if (!$270) {
        $$2529 = 9; //@line 8782
       } else {
        if (!(($270 >>> 0) % 10 | 0)) {
         $$1528617 = 0; //@line 8787
         $$3533616 = 10; //@line 8787
         while (1) {
          $$3533616 = $$3533616 * 10 | 0; //@line 8789
          $275 = $$1528617 + 1 | 0; //@line 8790
          if (($270 >>> 0) % ($$3533616 >>> 0) | 0 | 0) {
           $$2529 = $275; //@line 8796
           break;
          } else {
           $$1528617 = $275; //@line 8794
          }
         }
        } else {
         $$2529 = 0; //@line 8801
        }
       }
      } else {
       $$2529 = 9; //@line 8805
      }
      $284 = (($$7505 - $185 >> 2) * 9 | 0) + -9 | 0; //@line 8813
      if (($$0479 | 32 | 0) == 102) {
       $285 = $284 - $$2529 | 0; //@line 8815
       $$548 = ($285 | 0) > 0 ? $285 : 0; //@line 8817
       $$1480 = $$0479; //@line 8820
       $$3477 = ($$2476 | 0) < ($$548 | 0) ? $$2476 : $$548; //@line 8820
       $$pre$phi698Z2D = 0; //@line 8820
       break;
      } else {
       $289 = $284 + $$5519$ph - $$2529 | 0; //@line 8824
       $$550 = ($289 | 0) > 0 ? $289 : 0; //@line 8826
       $$1480 = $$0479; //@line 8829
       $$3477 = ($$2476 | 0) < ($$550 | 0) ? $$2476 : $$550; //@line 8829
       $$pre$phi698Z2D = 0; //@line 8829
       break;
      }
     } else {
      $$1480 = $$0479; //@line 8833
      $$3477 = $$2476; //@line 8833
      $$pre$phi698Z2D = $267; //@line 8833
     }
    } else {
     $$1480 = $5; //@line 8837
     $$3477 = $$540; //@line 8837
     $$pre$phi698Z2D = $4 & 8; //@line 8837
    }
   } while (0);
   $292 = $$3477 | $$pre$phi698Z2D; //@line 8840
   $294 = ($292 | 0) != 0 & 1; //@line 8842
   $296 = ($$1480 | 32 | 0) == 102; //@line 8844
   if ($296) {
    $$2513 = 0; //@line 8848
    $$pn = ($$5519$ph | 0) > 0 ? $$5519$ph : 0; //@line 8848
   } else {
    $300 = ($$5519$ph | 0) < 0 ? $259 : $$5519$ph; //@line 8851
    $303 = _fmt_u($300, (($300 | 0) < 0) << 31 >> 31, $11) | 0; //@line 8854
    $304 = $11; //@line 8855
    if (($304 - $303 | 0) < 2) {
     $$1512610 = $303; //@line 8860
     while (1) {
      $308 = $$1512610 + -1 | 0; //@line 8862
      HEAP8[$308 >> 0] = 48; //@line 8863
      if (($304 - $308 | 0) < 2) {
       $$1512610 = $308; //@line 8868
      } else {
       $$1512$lcssa = $308; //@line 8870
       break;
      }
     }
    } else {
     $$1512$lcssa = $303; //@line 8875
    }
    HEAP8[$$1512$lcssa + -1 >> 0] = ($$5519$ph >> 31 & 2) + 43; //@line 8882
    $318 = $$1512$lcssa + -2 | 0; //@line 8884
    HEAP8[$318 >> 0] = $$1480; //@line 8885
    $$2513 = $318; //@line 8888
    $$pn = $304 - $318 | 0; //@line 8888
   }
   $323 = $$0520 + 1 + $$3477 + $294 + $$pn | 0; //@line 8893
   _pad_676($0, 32, $2, $323, $4); //@line 8894
   _out_670($0, $$0521, $$0520); //@line 8895
   _pad_676($0, 48, $2, $323, $4 ^ 65536); //@line 8897
   if ($296) {
    $$0496$$9 = $$9$ph >>> 0 > $$561 >>> 0 ? $$561 : $$9$ph; //@line 8900
    $326 = $8 + 9 | 0; //@line 8901
    $327 = $326; //@line 8902
    $328 = $8 + 8 | 0; //@line 8903
    $$5493600 = $$0496$$9; //@line 8904
    do {
     $330 = _fmt_u(HEAP32[$$5493600 >> 2] | 0, 0, $326) | 0; //@line 8907
     if (($$5493600 | 0) == ($$0496$$9 | 0)) {
      if (($330 | 0) == ($326 | 0)) {
       HEAP8[$328 >> 0] = 48; //@line 8912
       $$1465 = $328; //@line 8913
      } else {
       $$1465 = $330; //@line 8915
      }
     } else {
      if ($330 >>> 0 > $8 >>> 0) {
       _memset($8 | 0, 48, $330 - $9 | 0) | 0; //@line 8922
       $$0464597 = $330; //@line 8923
       while (1) {
        $335 = $$0464597 + -1 | 0; //@line 8925
        if ($335 >>> 0 > $8 >>> 0) {
         $$0464597 = $335; //@line 8928
        } else {
         $$1465 = $335; //@line 8930
         break;
        }
       }
      } else {
       $$1465 = $330; //@line 8935
      }
     }
     _out_670($0, $$1465, $327 - $$1465 | 0); //@line 8940
     $$5493600 = $$5493600 + 4 | 0; //@line 8941
    } while ($$5493600 >>> 0 <= $$561 >>> 0);
    if ($292 | 0) {
     _out_670($0, 2619, 1); //@line 8951
    }
    if ($$5493600 >>> 0 < $$7505 >>> 0 & ($$3477 | 0) > 0) {
     $$4478593 = $$3477; //@line 8957
     $$6494592 = $$5493600; //@line 8957
     while (1) {
      $347 = _fmt_u(HEAP32[$$6494592 >> 2] | 0, 0, $326) | 0; //@line 8960
      if ($347 >>> 0 > $8 >>> 0) {
       _memset($8 | 0, 48, $347 - $9 | 0) | 0; //@line 8965
       $$0463587 = $347; //@line 8966
       while (1) {
        $351 = $$0463587 + -1 | 0; //@line 8968
        if ($351 >>> 0 > $8 >>> 0) {
         $$0463587 = $351; //@line 8971
        } else {
         $$0463$lcssa = $351; //@line 8973
         break;
        }
       }
      } else {
       $$0463$lcssa = $347; //@line 8978
      }
      _out_670($0, $$0463$lcssa, ($$4478593 | 0) < 9 ? $$4478593 : 9); //@line 8982
      $$6494592 = $$6494592 + 4 | 0; //@line 8983
      $356 = $$4478593 + -9 | 0; //@line 8984
      if (!($$6494592 >>> 0 < $$7505 >>> 0 & ($$4478593 | 0) > 9)) {
       $$4478$lcssa = $356; //@line 8991
       break;
      } else {
       $$4478593 = $356; //@line 8989
      }
     }
    } else {
     $$4478$lcssa = $$3477; //@line 8996
    }
    _pad_676($0, 48, $$4478$lcssa + 9 | 0, 9, 0); //@line 8999
   } else {
    $$7505$ = $$lcssa675 ? $$7505 : $$9$ph + 4 | 0; //@line 9002
    if (($$3477 | 0) > -1) {
     $363 = $8 + 9 | 0; //@line 9005
     $364 = ($$pre$phi698Z2D | 0) == 0; //@line 9006
     $365 = $363; //@line 9007
     $366 = 0 - $9 | 0; //@line 9008
     $367 = $8 + 8 | 0; //@line 9009
     $$5605 = $$3477; //@line 9010
     $$7495604 = $$9$ph; //@line 9010
     while (1) {
      $369 = _fmt_u(HEAP32[$$7495604 >> 2] | 0, 0, $363) | 0; //@line 9013
      if (($369 | 0) == ($363 | 0)) {
       HEAP8[$367 >> 0] = 48; //@line 9016
       $$0 = $367; //@line 9017
      } else {
       $$0 = $369; //@line 9019
      }
      do {
       if (($$7495604 | 0) == ($$9$ph | 0)) {
        $375 = $$0 + 1 | 0; //@line 9024
        _out_670($0, $$0, 1); //@line 9025
        if ($364 & ($$5605 | 0) < 1) {
         $$2 = $375; //@line 9029
         break;
        }
        _out_670($0, 2619, 1); //@line 9032
        $$2 = $375; //@line 9033
       } else {
        if ($$0 >>> 0 <= $8 >>> 0) {
         $$2 = $$0; //@line 9037
         break;
        }
        _memset($8 | 0, 48, $$0 + $366 | 0) | 0; //@line 9042
        $$1601 = $$0; //@line 9043
        while (1) {
         $373 = $$1601 + -1 | 0; //@line 9045
         if ($373 >>> 0 > $8 >>> 0) {
          $$1601 = $373; //@line 9048
         } else {
          $$2 = $373; //@line 9050
          break;
         }
        }
       }
      } while (0);
      $378 = $365 - $$2 | 0; //@line 9057
      _out_670($0, $$2, ($$5605 | 0) > ($378 | 0) ? $378 : $$5605); //@line 9060
      $381 = $$5605 - $378 | 0; //@line 9061
      $$7495604 = $$7495604 + 4 | 0; //@line 9062
      if (!($$7495604 >>> 0 < $$7505$ >>> 0 & ($381 | 0) > -1)) {
       $$5$lcssa = $381; //@line 9069
       break;
      } else {
       $$5605 = $381; //@line 9067
      }
     }
    } else {
     $$5$lcssa = $$3477; //@line 9074
    }
    _pad_676($0, 48, $$5$lcssa + 18 | 0, 18, 0); //@line 9077
    _out_670($0, $$2513, $11 - $$2513 | 0); //@line 9081
   }
   _pad_676($0, 32, $2, $323, $4 ^ 8192); //@line 9084
   $$sink560 = $323; //@line 9085
  }
 } while (0);
 STACKTOP = sp; //@line 9090
 return (($$sink560 | 0) < ($2 | 0) ? $2 : $$sink560) | 0; //@line 9090
}
function _printf_core($0, $1, $2, $3, $4) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 var $$$5 = 0, $$0 = 0, $$0228 = 0, $$0229316 = 0, $$0232 = 0, $$0235 = 0, $$0237 = 0, $$0240$lcssa = 0, $$0240$lcssa356 = 0, $$0240315 = 0, $$0243 = 0, $$0247 = 0, $$0249$lcssa = 0, $$0249303 = 0, $$0252 = 0, $$0253 = 0, $$0254 = 0, $$0259 = 0, $$0262$lcssa = 0, $$0262309 = 0, $$0269 = 0, $$1 = 0, $$1230327 = 0, $$1233 = 0, $$1236 = 0, $$1238 = 0, $$1241326 = 0, $$1244314 = 0, $$1248 = 0, $$1255 = 0, $$1260 = 0, $$1263 = 0, $$1263$ = 0, $$1270 = 0, $$2 = 0, $$2234 = 0, $$2239 = 0, $$2242$lcssa = 0, $$2242302 = 0, $$2245 = 0, $$2251 = 0, $$2256 = 0, $$2261 = 0, $$2271 = 0, $$3265 = 0, $$3272 = 0, $$3300 = 0, $$4258354 = 0, $$4266 = 0, $$5 = 0, $$6268 = 0, $$lcssa291 = 0, $$lcssa292 = 0, $$pre342 = 0, $$pre345 = 0, $$pre348 = 0, $$sink = 0, $10 = 0, $105 = 0, $106 = 0, $109 = 0, $11 = 0, $112 = 0, $115 = 0, $12 = 0, $125 = 0, $129 = 0, $13 = 0, $14 = 0, $140 = 0, $144 = 0, $151 = 0, $152 = 0, $154 = 0, $156 = 0, $158 = 0, $167 = 0, $168 = 0, $173 = 0, $176 = 0, $181 = 0, $182 = 0, $187 = 0, $189 = 0, $196 = 0, $197 = 0, $20 = 0, $208 = 0, $21 = 0, $220 = 0, $227 = 0, $229 = 0, $23 = 0, $232 = 0, $234 = 0, $24 = 0, $242 = 0, $244 = 0, $247 = 0, $248 = 0, $25 = 0, $252 = 0, $256 = 0, $258 = 0, $261 = 0, $263 = 0, $264 = 0, $265 = 0, $27 = 0, $275 = 0, $276 = 0, $281 = 0, $283 = 0, $284 = 0, $290 = 0, $30 = 0, $302 = 0, $305 = 0, $306 = 0, $318 = 0, $320 = 0, $325 = 0, $329 = 0, $331 = 0, $343 = 0, $345 = 0, $352 = 0, $356 = 0, $36 = 0, $363 = 0, $364 = 0, $365 = 0, $43 = 0, $5 = 0, $51 = 0, $52 = 0, $54 = 0, $6 = 0, $60 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0, $68 = 0, $7 = 0, $79 = 0, $8 = 0, $83 = 0, $9 = 0, $or$cond = 0, $or$cond278 = 0, $storemerge274 = 0, label = 0, sp = 0, $158$looptemp = 0;
 sp = STACKTOP; //@line 6768
 STACKTOP = STACKTOP + 64 | 0; //@line 6769
 $5 = sp + 16 | 0; //@line 6770
 $6 = sp; //@line 6771
 $7 = sp + 24 | 0; //@line 6772
 $8 = sp + 8 | 0; //@line 6773
 $9 = sp + 20 | 0; //@line 6774
 HEAP32[$5 >> 2] = $1; //@line 6775
 $10 = ($0 | 0) != 0; //@line 6776
 $11 = $7 + 40 | 0; //@line 6777
 $12 = $11; //@line 6778
 $13 = $7 + 39 | 0; //@line 6779
 $14 = $8 + 4 | 0; //@line 6780
 $$0243 = 0; //@line 6781
 $$0247 = 0; //@line 6781
 $$0269 = 0; //@line 6781
 L1 : while (1) {
  do {
   if (($$0247 | 0) > -1) {
    if (($$0243 | 0) > (2147483647 - $$0247 | 0)) {
     HEAP32[(___errno_location() | 0) >> 2] = 75; //@line 6790
     $$1248 = -1; //@line 6791
     break;
    } else {
     $$1248 = $$0243 + $$0247 | 0; //@line 6795
     break;
    }
   } else {
    $$1248 = $$0247; //@line 6799
   }
  } while (0);
  $20 = HEAP32[$5 >> 2] | 0; //@line 6802
  $21 = HEAP8[$20 >> 0] | 0; //@line 6803
  if (!($21 << 24 >> 24)) {
   label = 88; //@line 6806
   break;
  } else {
   $23 = $21; //@line 6809
   $25 = $20; //@line 6809
  }
  L9 : while (1) {
   switch ($23 << 24 >> 24) {
   case 37:
    {
     $$0249303 = $25; //@line 6814
     $27 = $25; //@line 6814
     label = 9; //@line 6815
     break L9;
     break;
    }
   case 0:
    {
     $$0249$lcssa = $25; //@line 6820
     break L9;
     break;
    }
   default:
    {}
   }
   $24 = $25 + 1 | 0; //@line 6827
   HEAP32[$5 >> 2] = $24; //@line 6828
   $23 = HEAP8[$24 >> 0] | 0; //@line 6830
   $25 = $24; //@line 6830
  }
  L12 : do {
   if ((label | 0) == 9) {
    while (1) {
     label = 0; //@line 6835
     if ((HEAP8[$27 + 1 >> 0] | 0) != 37) {
      $$0249$lcssa = $$0249303; //@line 6840
      break L12;
     }
     $30 = $$0249303 + 1 | 0; //@line 6843
     $27 = $27 + 2 | 0; //@line 6844
     HEAP32[$5 >> 2] = $27; //@line 6845
     if ((HEAP8[$27 >> 0] | 0) != 37) {
      $$0249$lcssa = $30; //@line 6852
      break;
     } else {
      $$0249303 = $30; //@line 6849
      label = 9; //@line 6850
     }
    }
   }
  } while (0);
  $36 = $$0249$lcssa - $20 | 0; //@line 6860
  if ($10) {
   _out_670($0, $20, $36); //@line 6862
  }
  if ($36 | 0) {
   $$0243 = $36; //@line 6866
   $$0247 = $$1248; //@line 6866
   continue;
  }
  $43 = (_isdigit(HEAP8[(HEAP32[$5 >> 2] | 0) + 1 >> 0] | 0) | 0) == 0; //@line 6874
  $$pre342 = HEAP32[$5 >> 2] | 0; //@line 6875
  if ($43) {
   $$0253 = -1; //@line 6877
   $$1270 = $$0269; //@line 6877
   $$sink = 1; //@line 6877
  } else {
   if ((HEAP8[$$pre342 + 2 >> 0] | 0) == 36) {
    $$0253 = (HEAP8[$$pre342 + 1 >> 0] | 0) + -48 | 0; //@line 6887
    $$1270 = 1; //@line 6887
    $$sink = 3; //@line 6887
   } else {
    $$0253 = -1; //@line 6889
    $$1270 = $$0269; //@line 6889
    $$sink = 1; //@line 6889
   }
  }
  $51 = $$pre342 + $$sink | 0; //@line 6892
  HEAP32[$5 >> 2] = $51; //@line 6893
  $52 = HEAP8[$51 >> 0] | 0; //@line 6894
  $54 = ($52 << 24 >> 24) + -32 | 0; //@line 6896
  if ($54 >>> 0 > 31 | (1 << $54 & 75913 | 0) == 0) {
   $$0262$lcssa = 0; //@line 6903
   $$lcssa291 = $52; //@line 6903
   $$lcssa292 = $51; //@line 6903
  } else {
   $$0262309 = 0; //@line 6905
   $60 = $52; //@line 6905
   $65 = $51; //@line 6905
   while (1) {
    $63 = 1 << ($60 << 24 >> 24) + -32 | $$0262309; //@line 6910
    $64 = $65 + 1 | 0; //@line 6911
    HEAP32[$5 >> 2] = $64; //@line 6912
    $66 = HEAP8[$64 >> 0] | 0; //@line 6913
    $68 = ($66 << 24 >> 24) + -32 | 0; //@line 6915
    if ($68 >>> 0 > 31 | (1 << $68 & 75913 | 0) == 0) {
     $$0262$lcssa = $63; //@line 6922
     $$lcssa291 = $66; //@line 6922
     $$lcssa292 = $64; //@line 6922
     break;
    } else {
     $$0262309 = $63; //@line 6925
     $60 = $66; //@line 6925
     $65 = $64; //@line 6925
    }
   }
  }
  if ($$lcssa291 << 24 >> 24 == 42) {
   if (!(_isdigit(HEAP8[$$lcssa292 + 1 >> 0] | 0) | 0)) {
    label = 23; //@line 6937
   } else {
    $79 = HEAP32[$5 >> 2] | 0; //@line 6939
    if ((HEAP8[$79 + 2 >> 0] | 0) == 36) {
     $83 = $79 + 1 | 0; //@line 6944
     HEAP32[$4 + ((HEAP8[$83 >> 0] | 0) + -48 << 2) >> 2] = 10; //@line 6949
     $$0259 = HEAP32[$3 + ((HEAP8[$83 >> 0] | 0) + -48 << 3) >> 2] | 0; //@line 6961
     $$2271 = 1; //@line 6961
     $storemerge274 = $79 + 3 | 0; //@line 6961
    } else {
     label = 23; //@line 6963
    }
   }
   if ((label | 0) == 23) {
    label = 0; //@line 6967
    if ($$1270 | 0) {
     $$0 = -1; //@line 6970
     break;
    }
    if ($10) {
     $105 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 6985
     $106 = HEAP32[$105 >> 2] | 0; //@line 6986
     HEAP32[$2 >> 2] = $105 + 4; //@line 6988
     $363 = $106; //@line 6989
    } else {
     $363 = 0; //@line 6991
    }
    $$0259 = $363; //@line 6995
    $$2271 = 0; //@line 6995
    $storemerge274 = (HEAP32[$5 >> 2] | 0) + 1 | 0; //@line 6995
   }
   HEAP32[$5 >> 2] = $storemerge274; //@line 6997
   $109 = ($$0259 | 0) < 0; //@line 6998
   $$1260 = $109 ? 0 - $$0259 | 0 : $$0259; //@line 7003
   $$1263 = $109 ? $$0262$lcssa | 8192 : $$0262$lcssa; //@line 7003
   $$3272 = $$2271; //@line 7003
   $115 = $storemerge274; //@line 7003
  } else {
   $112 = _getint_671($5) | 0; //@line 7005
   if (($112 | 0) < 0) {
    $$0 = -1; //@line 7008
    break;
   }
   $$1260 = $112; //@line 7012
   $$1263 = $$0262$lcssa; //@line 7012
   $$3272 = $$1270; //@line 7012
   $115 = HEAP32[$5 >> 2] | 0; //@line 7012
  }
  do {
   if ((HEAP8[$115 >> 0] | 0) == 46) {
    if ((HEAP8[$115 + 1 >> 0] | 0) != 42) {
     HEAP32[$5 >> 2] = $115 + 1; //@line 7023
     $156 = _getint_671($5) | 0; //@line 7024
     $$0254 = $156; //@line 7026
     $$pre345 = HEAP32[$5 >> 2] | 0; //@line 7026
     break;
    }
    if (_isdigit(HEAP8[$115 + 2 >> 0] | 0) | 0) {
     $125 = HEAP32[$5 >> 2] | 0; //@line 7035
     if ((HEAP8[$125 + 3 >> 0] | 0) == 36) {
      $129 = $125 + 2 | 0; //@line 7040
      HEAP32[$4 + ((HEAP8[$129 >> 0] | 0) + -48 << 2) >> 2] = 10; //@line 7045
      $140 = HEAP32[$3 + ((HEAP8[$129 >> 0] | 0) + -48 << 3) >> 2] | 0; //@line 7052
      $144 = $125 + 4 | 0; //@line 7056
      HEAP32[$5 >> 2] = $144; //@line 7057
      $$0254 = $140; //@line 7058
      $$pre345 = $144; //@line 7058
      break;
     }
    }
    if ($$3272 | 0) {
     $$0 = -1; //@line 7064
     break L1;
    }
    if ($10) {
     $151 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 7079
     $152 = HEAP32[$151 >> 2] | 0; //@line 7080
     HEAP32[$2 >> 2] = $151 + 4; //@line 7082
     $364 = $152; //@line 7083
    } else {
     $364 = 0; //@line 7085
    }
    $154 = (HEAP32[$5 >> 2] | 0) + 2 | 0; //@line 7088
    HEAP32[$5 >> 2] = $154; //@line 7089
    $$0254 = $364; //@line 7090
    $$pre345 = $154; //@line 7090
   } else {
    $$0254 = -1; //@line 7092
    $$pre345 = $115; //@line 7092
   }
  } while (0);
  $$0252 = 0; //@line 7095
  $158 = $$pre345; //@line 7095
  while (1) {
   if (((HEAP8[$158 >> 0] | 0) + -65 | 0) >>> 0 > 57) {
    $$0 = -1; //@line 7102
    break L1;
   }
   $158$looptemp = $158;
   $158 = $158 + 1 | 0; //@line 7105
   HEAP32[$5 >> 2] = $158; //@line 7106
   $167 = HEAP8[(HEAP8[$158$looptemp >> 0] | 0) + -65 + (2087 + ($$0252 * 58 | 0)) >> 0] | 0; //@line 7111
   $168 = $167 & 255; //@line 7112
   if (($168 + -1 | 0) >>> 0 >= 8) {
    break;
   } else {
    $$0252 = $168; //@line 7116
   }
  }
  if (!($167 << 24 >> 24)) {
   $$0 = -1; //@line 7123
   break;
  }
  $173 = ($$0253 | 0) > -1; //@line 7127
  do {
   if ($167 << 24 >> 24 == 19) {
    if ($173) {
     $$0 = -1; //@line 7131
     break L1;
    } else {
     label = 50; //@line 7134
    }
   } else {
    if ($173) {
     HEAP32[$4 + ($$0253 << 2) >> 2] = $168; //@line 7139
     $176 = $3 + ($$0253 << 3) | 0; //@line 7141
     $181 = HEAP32[$176 + 4 >> 2] | 0; //@line 7146
     $182 = $6; //@line 7147
     HEAP32[$182 >> 2] = HEAP32[$176 >> 2]; //@line 7149
     HEAP32[$182 + 4 >> 2] = $181; //@line 7152
     label = 50; //@line 7153
     break;
    }
    if (!$10) {
     $$0 = 0; //@line 7157
     break L1;
    }
    _pop_arg_673($6, $168, $2); //@line 7160
    $187 = HEAP32[$5 >> 2] | 0; //@line 7162
   }
  } while (0);
  if ((label | 0) == 50) {
   label = 0; //@line 7166
   if ($10) {
    $187 = $158; //@line 7168
   } else {
    $$0243 = 0; //@line 7170
    $$0247 = $$1248; //@line 7170
    $$0269 = $$3272; //@line 7170
    continue;
   }
  }
  $189 = HEAP8[$187 + -1 >> 0] | 0; //@line 7176
  $$0235 = ($$0252 | 0) != 0 & ($189 & 15 | 0) == 3 ? $189 & -33 : $189; //@line 7182
  $196 = $$1263 & -65537; //@line 7185
  $$1263$ = ($$1263 & 8192 | 0) == 0 ? $$1263 : $196; //@line 7186
  L73 : do {
   switch ($$0235 | 0) {
   case 110:
    {
     switch (($$0252 & 255) << 24 >> 24) {
     case 0:
      {
       HEAP32[HEAP32[$6 >> 2] >> 2] = $$1248; //@line 7194
       $$0243 = 0; //@line 7195
       $$0247 = $$1248; //@line 7195
       $$0269 = $$3272; //@line 7195
       continue L1;
       break;
      }
     case 1:
      {
       HEAP32[HEAP32[$6 >> 2] >> 2] = $$1248; //@line 7201
       $$0243 = 0; //@line 7202
       $$0247 = $$1248; //@line 7202
       $$0269 = $$3272; //@line 7202
       continue L1;
       break;
      }
     case 2:
      {
       $208 = HEAP32[$6 >> 2] | 0; //@line 7210
       HEAP32[$208 >> 2] = $$1248; //@line 7212
       HEAP32[$208 + 4 >> 2] = (($$1248 | 0) < 0) << 31 >> 31; //@line 7215
       $$0243 = 0; //@line 7216
       $$0247 = $$1248; //@line 7216
       $$0269 = $$3272; //@line 7216
       continue L1;
       break;
      }
     case 3:
      {
       HEAP16[HEAP32[$6 >> 2] >> 1] = $$1248; //@line 7223
       $$0243 = 0; //@line 7224
       $$0247 = $$1248; //@line 7224
       $$0269 = $$3272; //@line 7224
       continue L1;
       break;
      }
     case 4:
      {
       HEAP8[HEAP32[$6 >> 2] >> 0] = $$1248; //@line 7231
       $$0243 = 0; //@line 7232
       $$0247 = $$1248; //@line 7232
       $$0269 = $$3272; //@line 7232
       continue L1;
       break;
      }
     case 6:
      {
       HEAP32[HEAP32[$6 >> 2] >> 2] = $$1248; //@line 7238
       $$0243 = 0; //@line 7239
       $$0247 = $$1248; //@line 7239
       $$0269 = $$3272; //@line 7239
       continue L1;
       break;
      }
     case 7:
      {
       $220 = HEAP32[$6 >> 2] | 0; //@line 7247
       HEAP32[$220 >> 2] = $$1248; //@line 7249
       HEAP32[$220 + 4 >> 2] = (($$1248 | 0) < 0) << 31 >> 31; //@line 7252
       $$0243 = 0; //@line 7253
       $$0247 = $$1248; //@line 7253
       $$0269 = $$3272; //@line 7253
       continue L1;
       break;
      }
     default:
      {
       $$0243 = 0; //@line 7258
       $$0247 = $$1248; //@line 7258
       $$0269 = $$3272; //@line 7258
       continue L1;
      }
     }
     break;
    }
   case 112:
    {
     $$1236 = 120; //@line 7268
     $$1255 = $$0254 >>> 0 > 8 ? $$0254 : 8; //@line 7268
     $$3265 = $$1263$ | 8; //@line 7268
     label = 62; //@line 7269
     break;
    }
   case 88:
   case 120:
    {
     $$1236 = $$0235; //@line 7273
     $$1255 = $$0254; //@line 7273
     $$3265 = $$1263$; //@line 7273
     label = 62; //@line 7274
     break;
    }
   case 111:
    {
     $242 = $6; //@line 7278
     $244 = HEAP32[$242 >> 2] | 0; //@line 7280
     $247 = HEAP32[$242 + 4 >> 2] | 0; //@line 7283
     $248 = _fmt_o($244, $247, $11) | 0; //@line 7284
     $252 = $12 - $248 | 0; //@line 7288
     $$0228 = $248; //@line 7293
     $$1233 = 0; //@line 7293
     $$1238 = 2551; //@line 7293
     $$2256 = ($$1263$ & 8 | 0) == 0 | ($$0254 | 0) > ($252 | 0) ? $$0254 : $252 + 1 | 0; //@line 7293
     $$4266 = $$1263$; //@line 7293
     $281 = $244; //@line 7293
     $283 = $247; //@line 7293
     label = 68; //@line 7294
     break;
    }
   case 105:
   case 100:
    {
     $256 = $6; //@line 7298
     $258 = HEAP32[$256 >> 2] | 0; //@line 7300
     $261 = HEAP32[$256 + 4 >> 2] | 0; //@line 7303
     if (($261 | 0) < 0) {
      $263 = _i64Subtract(0, 0, $258 | 0, $261 | 0) | 0; //@line 7306
      $264 = tempRet0; //@line 7307
      $265 = $6; //@line 7308
      HEAP32[$265 >> 2] = $263; //@line 7310
      HEAP32[$265 + 4 >> 2] = $264; //@line 7313
      $$0232 = 1; //@line 7314
      $$0237 = 2551; //@line 7314
      $275 = $263; //@line 7314
      $276 = $264; //@line 7314
      label = 67; //@line 7315
      break L73;
     } else {
      $$0232 = ($$1263$ & 2049 | 0) != 0 & 1; //@line 7327
      $$0237 = ($$1263$ & 2048 | 0) == 0 ? ($$1263$ & 1 | 0) == 0 ? 2551 : 2553 : 2552; //@line 7327
      $275 = $258; //@line 7327
      $276 = $261; //@line 7327
      label = 67; //@line 7328
      break L73;
     }
     break;
    }
   case 117:
    {
     $197 = $6; //@line 7334
     $$0232 = 0; //@line 7340
     $$0237 = 2551; //@line 7340
     $275 = HEAP32[$197 >> 2] | 0; //@line 7340
     $276 = HEAP32[$197 + 4 >> 2] | 0; //@line 7340
     label = 67; //@line 7341
     break;
    }
   case 99:
    {
     HEAP8[$13 >> 0] = HEAP32[$6 >> 2]; //@line 7352
     $$2 = $13; //@line 7353
     $$2234 = 0; //@line 7353
     $$2239 = 2551; //@line 7353
     $$2251 = $11; //@line 7353
     $$5 = 1; //@line 7353
     $$6268 = $196; //@line 7353
     break;
    }
   case 109:
    {
     $$1 = _strerror(HEAP32[(___errno_location() | 0) >> 2] | 0) | 0; //@line 7360
     label = 72; //@line 7361
     break;
    }
   case 115:
    {
     $302 = HEAP32[$6 >> 2] | 0; //@line 7365
     $$1 = $302 | 0 ? $302 : 2561; //@line 7368
     label = 72; //@line 7369
     break;
    }
   case 67:
    {
     HEAP32[$8 >> 2] = HEAP32[$6 >> 2]; //@line 7379
     HEAP32[$14 >> 2] = 0; //@line 7380
     HEAP32[$6 >> 2] = $8; //@line 7381
     $$4258354 = -1; //@line 7382
     $365 = $8; //@line 7382
     label = 76; //@line 7383
     break;
    }
   case 83:
    {
     $$pre348 = HEAP32[$6 >> 2] | 0; //@line 7387
     if (!$$0254) {
      _pad_676($0, 32, $$1260, 0, $$1263$); //@line 7390
      $$0240$lcssa356 = 0; //@line 7391
      label = 85; //@line 7392
     } else {
      $$4258354 = $$0254; //@line 7394
      $365 = $$pre348; //@line 7394
      label = 76; //@line 7395
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
     $$0243 = _fmt_fp($0, +HEAPF64[$6 >> 3], $$1260, $$0254, $$1263$, $$0235) | 0; //@line 7402
     $$0247 = $$1248; //@line 7402
     $$0269 = $$3272; //@line 7402
     continue L1;
     break;
    }
   default:
    {
     $$2 = $20; //@line 7407
     $$2234 = 0; //@line 7407
     $$2239 = 2551; //@line 7407
     $$2251 = $11; //@line 7407
     $$5 = $$0254; //@line 7407
     $$6268 = $$1263$; //@line 7407
    }
   }
  } while (0);
  L97 : do {
   if ((label | 0) == 62) {
    label = 0; //@line 7413
    $227 = $6; //@line 7414
    $229 = HEAP32[$227 >> 2] | 0; //@line 7416
    $232 = HEAP32[$227 + 4 >> 2] | 0; //@line 7419
    $234 = _fmt_x($229, $232, $11, $$1236 & 32) | 0; //@line 7421
    $or$cond278 = ($$3265 & 8 | 0) == 0 | ($229 | 0) == 0 & ($232 | 0) == 0; //@line 7427
    $$0228 = $234; //@line 7432
    $$1233 = $or$cond278 ? 0 : 2; //@line 7432
    $$1238 = $or$cond278 ? 2551 : 2551 + ($$1236 >> 4) | 0; //@line 7432
    $$2256 = $$1255; //@line 7432
    $$4266 = $$3265; //@line 7432
    $281 = $229; //@line 7432
    $283 = $232; //@line 7432
    label = 68; //@line 7433
   } else if ((label | 0) == 67) {
    label = 0; //@line 7436
    $$0228 = _fmt_u($275, $276, $11) | 0; //@line 7438
    $$1233 = $$0232; //@line 7438
    $$1238 = $$0237; //@line 7438
    $$2256 = $$0254; //@line 7438
    $$4266 = $$1263$; //@line 7438
    $281 = $275; //@line 7438
    $283 = $276; //@line 7438
    label = 68; //@line 7439
   } else if ((label | 0) == 72) {
    label = 0; //@line 7442
    $305 = _memchr($$1, 0, $$0254) | 0; //@line 7443
    $306 = ($305 | 0) == 0; //@line 7444
    $$2 = $$1; //@line 7451
    $$2234 = 0; //@line 7451
    $$2239 = 2551; //@line 7451
    $$2251 = $306 ? $$1 + $$0254 | 0 : $305; //@line 7451
    $$5 = $306 ? $$0254 : $305 - $$1 | 0; //@line 7451
    $$6268 = $196; //@line 7451
   } else if ((label | 0) == 76) {
    label = 0; //@line 7454
    $$0229316 = $365; //@line 7455
    $$0240315 = 0; //@line 7455
    $$1244314 = 0; //@line 7455
    while (1) {
     $318 = HEAP32[$$0229316 >> 2] | 0; //@line 7457
     if (!$318) {
      $$0240$lcssa = $$0240315; //@line 7460
      $$2245 = $$1244314; //@line 7460
      break;
     }
     $320 = _wctomb($9, $318) | 0; //@line 7463
     if (($320 | 0) < 0 | $320 >>> 0 > ($$4258354 - $$0240315 | 0) >>> 0) {
      $$0240$lcssa = $$0240315; //@line 7469
      $$2245 = $320; //@line 7469
      break;
     }
     $325 = $320 + $$0240315 | 0; //@line 7473
     if ($$4258354 >>> 0 > $325 >>> 0) {
      $$0229316 = $$0229316 + 4 | 0; //@line 7476
      $$0240315 = $325; //@line 7476
      $$1244314 = $320; //@line 7476
     } else {
      $$0240$lcssa = $325; //@line 7478
      $$2245 = $320; //@line 7478
      break;
     }
    }
    if (($$2245 | 0) < 0) {
     $$0 = -1; //@line 7484
     break L1;
    }
    _pad_676($0, 32, $$1260, $$0240$lcssa, $$1263$); //@line 7487
    if (!$$0240$lcssa) {
     $$0240$lcssa356 = 0; //@line 7490
     label = 85; //@line 7491
    } else {
     $$1230327 = $365; //@line 7493
     $$1241326 = 0; //@line 7493
     while (1) {
      $329 = HEAP32[$$1230327 >> 2] | 0; //@line 7495
      if (!$329) {
       $$0240$lcssa356 = $$0240$lcssa; //@line 7498
       label = 85; //@line 7499
       break L97;
      }
      $331 = _wctomb($9, $329) | 0; //@line 7502
      $$1241326 = $331 + $$1241326 | 0; //@line 7503
      if (($$1241326 | 0) > ($$0240$lcssa | 0)) {
       $$0240$lcssa356 = $$0240$lcssa; //@line 7506
       label = 85; //@line 7507
       break L97;
      }
      _out_670($0, $9, $331); //@line 7511
      if ($$1241326 >>> 0 >= $$0240$lcssa >>> 0) {
       $$0240$lcssa356 = $$0240$lcssa; //@line 7516
       label = 85; //@line 7517
       break;
      } else {
       $$1230327 = $$1230327 + 4 | 0; //@line 7514
      }
     }
    }
   }
  } while (0);
  if ((label | 0) == 68) {
   label = 0; //@line 7525
   $284 = ($281 | 0) != 0 | ($283 | 0) != 0; //@line 7531
   $or$cond = ($$2256 | 0) != 0 | $284; //@line 7533
   $290 = $12 - $$0228 + (($284 ^ 1) & 1) | 0; //@line 7538
   $$2 = $or$cond ? $$0228 : $11; //@line 7543
   $$2234 = $$1233; //@line 7543
   $$2239 = $$1238; //@line 7543
   $$2251 = $11; //@line 7543
   $$5 = $or$cond ? ($$2256 | 0) > ($290 | 0) ? $$2256 : $290 : $$2256; //@line 7543
   $$6268 = ($$2256 | 0) > -1 ? $$4266 & -65537 : $$4266; //@line 7543
  } else if ((label | 0) == 85) {
   label = 0; //@line 7546
   _pad_676($0, 32, $$1260, $$0240$lcssa356, $$1263$ ^ 8192); //@line 7548
   $$0243 = ($$1260 | 0) > ($$0240$lcssa356 | 0) ? $$1260 : $$0240$lcssa356; //@line 7551
   $$0247 = $$1248; //@line 7551
   $$0269 = $$3272; //@line 7551
   continue;
  }
  $343 = $$2251 - $$2 | 0; //@line 7556
  $$$5 = ($$5 | 0) < ($343 | 0) ? $343 : $$5; //@line 7558
  $345 = $$$5 + $$2234 | 0; //@line 7559
  $$2261 = ($$1260 | 0) < ($345 | 0) ? $345 : $$1260; //@line 7561
  _pad_676($0, 32, $$2261, $345, $$6268); //@line 7562
  _out_670($0, $$2239, $$2234); //@line 7563
  _pad_676($0, 48, $$2261, $345, $$6268 ^ 65536); //@line 7565
  _pad_676($0, 48, $$$5, $343, 0); //@line 7566
  _out_670($0, $$2, $343); //@line 7567
  _pad_676($0, 32, $$2261, $345, $$6268 ^ 8192); //@line 7569
  $$0243 = $$2261; //@line 7570
  $$0247 = $$1248; //@line 7570
  $$0269 = $$3272; //@line 7570
 }
 L116 : do {
  if ((label | 0) == 88) {
   if (!$0) {
    if (!$$0269) {
     $$0 = 0; //@line 7578
    } else {
     $$2242302 = 1; //@line 7580
     while (1) {
      $352 = HEAP32[$4 + ($$2242302 << 2) >> 2] | 0; //@line 7583
      if (!$352) {
       $$2242$lcssa = $$2242302; //@line 7586
       break;
      }
      _pop_arg_673($3 + ($$2242302 << 3) | 0, $352, $2); //@line 7590
      $356 = $$2242302 + 1 | 0; //@line 7591
      if (($$2242302 | 0) < 9) {
       $$2242302 = $356; //@line 7594
      } else {
       $$2242$lcssa = $356; //@line 7596
       break;
      }
     }
     if (($$2242$lcssa | 0) < 10) {
      $$3300 = $$2242$lcssa; //@line 7602
      while (1) {
       if (HEAP32[$4 + ($$3300 << 2) >> 2] | 0) {
        $$0 = -1; //@line 7608
        break L116;
       }
       if (($$3300 | 0) < 9) {
        $$3300 = $$3300 + 1 | 0; //@line 7614
       } else {
        $$0 = 1; //@line 7616
        break;
       }
      }
     } else {
      $$0 = 1; //@line 7621
     }
    }
   } else {
    $$0 = $$1248; //@line 7625
   }
  }
 } while (0);
 STACKTOP = sp; //@line 7629
 return $$0 | 0; //@line 7629
}
function _free($0) {
 $0 = $0 | 0;
 var $$0212$i = 0, $$0212$in$i = 0, $$0383 = 0, $$0384 = 0, $$0396 = 0, $$0403 = 0, $$1 = 0, $$1382 = 0, $$1387 = 0, $$1390 = 0, $$1398 = 0, $$1402 = 0, $$2 = 0, $$3 = 0, $$3400 = 0, $$pre$phi442Z2D = 0, $$pre$phi444Z2D = 0, $$pre$phiZ2D = 0, $10 = 0, $105 = 0, $106 = 0, $114 = 0, $115 = 0, $116 = 0, $124 = 0, $13 = 0, $132 = 0, $137 = 0, $138 = 0, $141 = 0, $143 = 0, $145 = 0, $16 = 0, $160 = 0, $165 = 0, $167 = 0, $17 = 0, $170 = 0, $173 = 0, $176 = 0, $179 = 0, $180 = 0, $181 = 0, $183 = 0, $185 = 0, $186 = 0, $188 = 0, $189 = 0, $195 = 0, $196 = 0, $2 = 0, $21 = 0, $210 = 0, $213 = 0, $214 = 0, $220 = 0, $235 = 0, $238 = 0, $239 = 0, $24 = 0, $240 = 0, $244 = 0, $245 = 0, $251 = 0, $256 = 0, $257 = 0, $26 = 0, $260 = 0, $262 = 0, $265 = 0, $270 = 0, $276 = 0, $28 = 0, $280 = 0, $281 = 0, $299 = 0, $3 = 0, $301 = 0, $308 = 0, $309 = 0, $310 = 0, $319 = 0, $41 = 0, $46 = 0, $48 = 0, $51 = 0, $53 = 0, $56 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $63 = 0, $65 = 0, $66 = 0, $68 = 0, $69 = 0, $7 = 0, $74 = 0, $75 = 0, $89 = 0, $9 = 0, $92 = 0, $93 = 0, $99 = 0, label = 0;
 if (!$0) {
  return;
 }
 $2 = $0 + -8 | 0; //@line 4953
 $3 = HEAP32[1345] | 0; //@line 4954
 if ($2 >>> 0 < $3 >>> 0) {
  _abort(); //@line 4957
 }
 $6 = HEAP32[$0 + -4 >> 2] | 0; //@line 4961
 $7 = $6 & 3; //@line 4962
 if (($7 | 0) == 1) {
  _abort(); //@line 4965
 }
 $9 = $6 & -8; //@line 4968
 $10 = $2 + $9 | 0; //@line 4969
 L10 : do {
  if (!($6 & 1)) {
   $13 = HEAP32[$2 >> 2] | 0; //@line 4974
   if (!$7) {
    return;
   }
   $16 = $2 + (0 - $13) | 0; //@line 4980
   $17 = $13 + $9 | 0; //@line 4981
   if ($16 >>> 0 < $3 >>> 0) {
    _abort(); //@line 4984
   }
   if ((HEAP32[1346] | 0) == ($16 | 0)) {
    $105 = $10 + 4 | 0; //@line 4990
    $106 = HEAP32[$105 >> 2] | 0; //@line 4991
    if (($106 & 3 | 0) != 3) {
     $$1 = $16; //@line 4995
     $$1382 = $17; //@line 4995
     $114 = $16; //@line 4995
     break;
    }
    HEAP32[1343] = $17; //@line 4998
    HEAP32[$105 >> 2] = $106 & -2; //@line 5000
    HEAP32[$16 + 4 >> 2] = $17 | 1; //@line 5003
    HEAP32[$16 + $17 >> 2] = $17; //@line 5005
    return;
   }
   $21 = $13 >>> 3; //@line 5008
   if ($13 >>> 0 < 256) {
    $24 = HEAP32[$16 + 8 >> 2] | 0; //@line 5012
    $26 = HEAP32[$16 + 12 >> 2] | 0; //@line 5014
    $28 = 5404 + ($21 << 1 << 2) | 0; //@line 5016
    if (($24 | 0) != ($28 | 0)) {
     if ($3 >>> 0 > $24 >>> 0) {
      _abort(); //@line 5021
     }
     if ((HEAP32[$24 + 12 >> 2] | 0) != ($16 | 0)) {
      _abort(); //@line 5028
     }
    }
    if (($26 | 0) == ($24 | 0)) {
     HEAP32[1341] = HEAP32[1341] & ~(1 << $21); //@line 5038
     $$1 = $16; //@line 5039
     $$1382 = $17; //@line 5039
     $114 = $16; //@line 5039
     break;
    }
    if (($26 | 0) == ($28 | 0)) {
     $$pre$phi444Z2D = $26 + 8 | 0; //@line 5045
    } else {
     if ($3 >>> 0 > $26 >>> 0) {
      _abort(); //@line 5049
     }
     $41 = $26 + 8 | 0; //@line 5052
     if ((HEAP32[$41 >> 2] | 0) == ($16 | 0)) {
      $$pre$phi444Z2D = $41; //@line 5056
     } else {
      _abort(); //@line 5058
     }
    }
    HEAP32[$24 + 12 >> 2] = $26; //@line 5063
    HEAP32[$$pre$phi444Z2D >> 2] = $24; //@line 5064
    $$1 = $16; //@line 5065
    $$1382 = $17; //@line 5065
    $114 = $16; //@line 5065
    break;
   }
   $46 = HEAP32[$16 + 24 >> 2] | 0; //@line 5069
   $48 = HEAP32[$16 + 12 >> 2] | 0; //@line 5071
   do {
    if (($48 | 0) == ($16 | 0)) {
     $59 = $16 + 16 | 0; //@line 5075
     $60 = $59 + 4 | 0; //@line 5076
     $61 = HEAP32[$60 >> 2] | 0; //@line 5077
     if (!$61) {
      $63 = HEAP32[$59 >> 2] | 0; //@line 5080
      if (!$63) {
       $$3 = 0; //@line 5083
       break;
      } else {
       $$1387 = $63; //@line 5086
       $$1390 = $59; //@line 5086
      }
     } else {
      $$1387 = $61; //@line 5089
      $$1390 = $60; //@line 5089
     }
     while (1) {
      $65 = $$1387 + 20 | 0; //@line 5092
      $66 = HEAP32[$65 >> 2] | 0; //@line 5093
      if ($66 | 0) {
       $$1387 = $66; //@line 5096
       $$1390 = $65; //@line 5096
       continue;
      }
      $68 = $$1387 + 16 | 0; //@line 5099
      $69 = HEAP32[$68 >> 2] | 0; //@line 5100
      if (!$69) {
       break;
      } else {
       $$1387 = $69; //@line 5105
       $$1390 = $68; //@line 5105
      }
     }
     if ($3 >>> 0 > $$1390 >>> 0) {
      _abort(); //@line 5110
     } else {
      HEAP32[$$1390 >> 2] = 0; //@line 5113
      $$3 = $$1387; //@line 5114
      break;
     }
    } else {
     $51 = HEAP32[$16 + 8 >> 2] | 0; //@line 5119
     if ($3 >>> 0 > $51 >>> 0) {
      _abort(); //@line 5122
     }
     $53 = $51 + 12 | 0; //@line 5125
     if ((HEAP32[$53 >> 2] | 0) != ($16 | 0)) {
      _abort(); //@line 5129
     }
     $56 = $48 + 8 | 0; //@line 5132
     if ((HEAP32[$56 >> 2] | 0) == ($16 | 0)) {
      HEAP32[$53 >> 2] = $48; //@line 5136
      HEAP32[$56 >> 2] = $51; //@line 5137
      $$3 = $48; //@line 5138
      break;
     } else {
      _abort(); //@line 5141
     }
    }
   } while (0);
   if (!$46) {
    $$1 = $16; //@line 5148
    $$1382 = $17; //@line 5148
    $114 = $16; //@line 5148
   } else {
    $74 = HEAP32[$16 + 28 >> 2] | 0; //@line 5151
    $75 = 5668 + ($74 << 2) | 0; //@line 5152
    do {
     if ((HEAP32[$75 >> 2] | 0) == ($16 | 0)) {
      HEAP32[$75 >> 2] = $$3; //@line 5157
      if (!$$3) {
       HEAP32[1342] = HEAP32[1342] & ~(1 << $74); //@line 5164
       $$1 = $16; //@line 5165
       $$1382 = $17; //@line 5165
       $114 = $16; //@line 5165
       break L10;
      }
     } else {
      if ((HEAP32[1345] | 0) >>> 0 > $46 >>> 0) {
       _abort(); //@line 5172
      } else {
       HEAP32[$46 + 16 + (((HEAP32[$46 + 16 >> 2] | 0) != ($16 | 0) & 1) << 2) >> 2] = $$3; //@line 5180
       if (!$$3) {
        $$1 = $16; //@line 5183
        $$1382 = $17; //@line 5183
        $114 = $16; //@line 5183
        break L10;
       } else {
        break;
       }
      }
     }
    } while (0);
    $89 = HEAP32[1345] | 0; //@line 5191
    if ($89 >>> 0 > $$3 >>> 0) {
     _abort(); //@line 5194
    }
    HEAP32[$$3 + 24 >> 2] = $46; //@line 5198
    $92 = $16 + 16 | 0; //@line 5199
    $93 = HEAP32[$92 >> 2] | 0; //@line 5200
    do {
     if ($93 | 0) {
      if ($89 >>> 0 > $93 >>> 0) {
       _abort(); //@line 5206
      } else {
       HEAP32[$$3 + 16 >> 2] = $93; //@line 5210
       HEAP32[$93 + 24 >> 2] = $$3; //@line 5212
       break;
      }
     }
    } while (0);
    $99 = HEAP32[$92 + 4 >> 2] | 0; //@line 5218
    if (!$99) {
     $$1 = $16; //@line 5221
     $$1382 = $17; //@line 5221
     $114 = $16; //@line 5221
    } else {
     if ((HEAP32[1345] | 0) >>> 0 > $99 >>> 0) {
      _abort(); //@line 5226
     } else {
      HEAP32[$$3 + 20 >> 2] = $99; //@line 5230
      HEAP32[$99 + 24 >> 2] = $$3; //@line 5232
      $$1 = $16; //@line 5233
      $$1382 = $17; //@line 5233
      $114 = $16; //@line 5233
      break;
     }
    }
   }
  } else {
   $$1 = $2; //@line 5239
   $$1382 = $9; //@line 5239
   $114 = $2; //@line 5239
  }
 } while (0);
 if ($114 >>> 0 >= $10 >>> 0) {
  _abort(); //@line 5244
 }
 $115 = $10 + 4 | 0; //@line 5247
 $116 = HEAP32[$115 >> 2] | 0; //@line 5248
 if (!($116 & 1)) {
  _abort(); //@line 5252
 }
 if (!($116 & 2)) {
  if ((HEAP32[1347] | 0) == ($10 | 0)) {
   $124 = (HEAP32[1344] | 0) + $$1382 | 0; //@line 5262
   HEAP32[1344] = $124; //@line 5263
   HEAP32[1347] = $$1; //@line 5264
   HEAP32[$$1 + 4 >> 2] = $124 | 1; //@line 5267
   if (($$1 | 0) != (HEAP32[1346] | 0)) {
    return;
   }
   HEAP32[1346] = 0; //@line 5273
   HEAP32[1343] = 0; //@line 5274
   return;
  }
  if ((HEAP32[1346] | 0) == ($10 | 0)) {
   $132 = (HEAP32[1343] | 0) + $$1382 | 0; //@line 5281
   HEAP32[1343] = $132; //@line 5282
   HEAP32[1346] = $114; //@line 5283
   HEAP32[$$1 + 4 >> 2] = $132 | 1; //@line 5286
   HEAP32[$114 + $132 >> 2] = $132; //@line 5288
   return;
  }
  $137 = ($116 & -8) + $$1382 | 0; //@line 5292
  $138 = $116 >>> 3; //@line 5293
  L108 : do {
   if ($116 >>> 0 < 256) {
    $141 = HEAP32[$10 + 8 >> 2] | 0; //@line 5298
    $143 = HEAP32[$10 + 12 >> 2] | 0; //@line 5300
    $145 = 5404 + ($138 << 1 << 2) | 0; //@line 5302
    if (($141 | 0) != ($145 | 0)) {
     if ((HEAP32[1345] | 0) >>> 0 > $141 >>> 0) {
      _abort(); //@line 5308
     }
     if ((HEAP32[$141 + 12 >> 2] | 0) != ($10 | 0)) {
      _abort(); //@line 5315
     }
    }
    if (($143 | 0) == ($141 | 0)) {
     HEAP32[1341] = HEAP32[1341] & ~(1 << $138); //@line 5325
     break;
    }
    if (($143 | 0) == ($145 | 0)) {
     $$pre$phi442Z2D = $143 + 8 | 0; //@line 5331
    } else {
     if ((HEAP32[1345] | 0) >>> 0 > $143 >>> 0) {
      _abort(); //@line 5336
     }
     $160 = $143 + 8 | 0; //@line 5339
     if ((HEAP32[$160 >> 2] | 0) == ($10 | 0)) {
      $$pre$phi442Z2D = $160; //@line 5343
     } else {
      _abort(); //@line 5345
     }
    }
    HEAP32[$141 + 12 >> 2] = $143; //@line 5350
    HEAP32[$$pre$phi442Z2D >> 2] = $141; //@line 5351
   } else {
    $165 = HEAP32[$10 + 24 >> 2] | 0; //@line 5354
    $167 = HEAP32[$10 + 12 >> 2] | 0; //@line 5356
    do {
     if (($167 | 0) == ($10 | 0)) {
      $179 = $10 + 16 | 0; //@line 5360
      $180 = $179 + 4 | 0; //@line 5361
      $181 = HEAP32[$180 >> 2] | 0; //@line 5362
      if (!$181) {
       $183 = HEAP32[$179 >> 2] | 0; //@line 5365
       if (!$183) {
        $$3400 = 0; //@line 5368
        break;
       } else {
        $$1398 = $183; //@line 5371
        $$1402 = $179; //@line 5371
       }
      } else {
       $$1398 = $181; //@line 5374
       $$1402 = $180; //@line 5374
      }
      while (1) {
       $185 = $$1398 + 20 | 0; //@line 5377
       $186 = HEAP32[$185 >> 2] | 0; //@line 5378
       if ($186 | 0) {
        $$1398 = $186; //@line 5381
        $$1402 = $185; //@line 5381
        continue;
       }
       $188 = $$1398 + 16 | 0; //@line 5384
       $189 = HEAP32[$188 >> 2] | 0; //@line 5385
       if (!$189) {
        break;
       } else {
        $$1398 = $189; //@line 5390
        $$1402 = $188; //@line 5390
       }
      }
      if ((HEAP32[1345] | 0) >>> 0 > $$1402 >>> 0) {
       _abort(); //@line 5396
      } else {
       HEAP32[$$1402 >> 2] = 0; //@line 5399
       $$3400 = $$1398; //@line 5400
       break;
      }
     } else {
      $170 = HEAP32[$10 + 8 >> 2] | 0; //@line 5405
      if ((HEAP32[1345] | 0) >>> 0 > $170 >>> 0) {
       _abort(); //@line 5409
      }
      $173 = $170 + 12 | 0; //@line 5412
      if ((HEAP32[$173 >> 2] | 0) != ($10 | 0)) {
       _abort(); //@line 5416
      }
      $176 = $167 + 8 | 0; //@line 5419
      if ((HEAP32[$176 >> 2] | 0) == ($10 | 0)) {
       HEAP32[$173 >> 2] = $167; //@line 5423
       HEAP32[$176 >> 2] = $170; //@line 5424
       $$3400 = $167; //@line 5425
       break;
      } else {
       _abort(); //@line 5428
      }
     }
    } while (0);
    if ($165 | 0) {
     $195 = HEAP32[$10 + 28 >> 2] | 0; //@line 5436
     $196 = 5668 + ($195 << 2) | 0; //@line 5437
     do {
      if ((HEAP32[$196 >> 2] | 0) == ($10 | 0)) {
       HEAP32[$196 >> 2] = $$3400; //@line 5442
       if (!$$3400) {
        HEAP32[1342] = HEAP32[1342] & ~(1 << $195); //@line 5449
        break L108;
       }
      } else {
       if ((HEAP32[1345] | 0) >>> 0 > $165 >>> 0) {
        _abort(); //@line 5456
       } else {
        HEAP32[$165 + 16 + (((HEAP32[$165 + 16 >> 2] | 0) != ($10 | 0) & 1) << 2) >> 2] = $$3400; //@line 5464
        if (!$$3400) {
         break L108;
        } else {
         break;
        }
       }
      }
     } while (0);
     $210 = HEAP32[1345] | 0; //@line 5474
     if ($210 >>> 0 > $$3400 >>> 0) {
      _abort(); //@line 5477
     }
     HEAP32[$$3400 + 24 >> 2] = $165; //@line 5481
     $213 = $10 + 16 | 0; //@line 5482
     $214 = HEAP32[$213 >> 2] | 0; //@line 5483
     do {
      if ($214 | 0) {
       if ($210 >>> 0 > $214 >>> 0) {
        _abort(); //@line 5489
       } else {
        HEAP32[$$3400 + 16 >> 2] = $214; //@line 5493
        HEAP32[$214 + 24 >> 2] = $$3400; //@line 5495
        break;
       }
      }
     } while (0);
     $220 = HEAP32[$213 + 4 >> 2] | 0; //@line 5501
     if ($220 | 0) {
      if ((HEAP32[1345] | 0) >>> 0 > $220 >>> 0) {
       _abort(); //@line 5507
      } else {
       HEAP32[$$3400 + 20 >> 2] = $220; //@line 5511
       HEAP32[$220 + 24 >> 2] = $$3400; //@line 5513
       break;
      }
     }
    }
   }
  } while (0);
  HEAP32[$$1 + 4 >> 2] = $137 | 1; //@line 5522
  HEAP32[$114 + $137 >> 2] = $137; //@line 5524
  if (($$1 | 0) == (HEAP32[1346] | 0)) {
   HEAP32[1343] = $137; //@line 5528
   return;
  } else {
   $$2 = $137; //@line 5531
  }
 } else {
  HEAP32[$115 >> 2] = $116 & -2; //@line 5535
  HEAP32[$$1 + 4 >> 2] = $$1382 | 1; //@line 5538
  HEAP32[$114 + $$1382 >> 2] = $$1382; //@line 5540
  $$2 = $$1382; //@line 5541
 }
 $235 = $$2 >>> 3; //@line 5543
 if ($$2 >>> 0 < 256) {
  $238 = 5404 + ($235 << 1 << 2) | 0; //@line 5547
  $239 = HEAP32[1341] | 0; //@line 5548
  $240 = 1 << $235; //@line 5549
  if (!($239 & $240)) {
   HEAP32[1341] = $239 | $240; //@line 5554
   $$0403 = $238; //@line 5556
   $$pre$phiZ2D = $238 + 8 | 0; //@line 5556
  } else {
   $244 = $238 + 8 | 0; //@line 5558
   $245 = HEAP32[$244 >> 2] | 0; //@line 5559
   if ((HEAP32[1345] | 0) >>> 0 > $245 >>> 0) {
    _abort(); //@line 5563
   } else {
    $$0403 = $245; //@line 5566
    $$pre$phiZ2D = $244; //@line 5566
   }
  }
  HEAP32[$$pre$phiZ2D >> 2] = $$1; //@line 5569
  HEAP32[$$0403 + 12 >> 2] = $$1; //@line 5571
  HEAP32[$$1 + 8 >> 2] = $$0403; //@line 5573
  HEAP32[$$1 + 12 >> 2] = $238; //@line 5575
  return;
 }
 $251 = $$2 >>> 8; //@line 5578
 if (!$251) {
  $$0396 = 0; //@line 5581
 } else {
  if ($$2 >>> 0 > 16777215) {
   $$0396 = 31; //@line 5585
  } else {
   $256 = ($251 + 1048320 | 0) >>> 16 & 8; //@line 5589
   $257 = $251 << $256; //@line 5590
   $260 = ($257 + 520192 | 0) >>> 16 & 4; //@line 5593
   $262 = $257 << $260; //@line 5595
   $265 = ($262 + 245760 | 0) >>> 16 & 2; //@line 5598
   $270 = 14 - ($260 | $256 | $265) + ($262 << $265 >>> 15) | 0; //@line 5603
   $$0396 = $$2 >>> ($270 + 7 | 0) & 1 | $270 << 1; //@line 5609
  }
 }
 $276 = 5668 + ($$0396 << 2) | 0; //@line 5612
 HEAP32[$$1 + 28 >> 2] = $$0396; //@line 5614
 HEAP32[$$1 + 20 >> 2] = 0; //@line 5617
 HEAP32[$$1 + 16 >> 2] = 0; //@line 5618
 $280 = HEAP32[1342] | 0; //@line 5619
 $281 = 1 << $$0396; //@line 5620
 do {
  if (!($280 & $281)) {
   HEAP32[1342] = $280 | $281; //@line 5626
   HEAP32[$276 >> 2] = $$1; //@line 5627
   HEAP32[$$1 + 24 >> 2] = $276; //@line 5629
   HEAP32[$$1 + 12 >> 2] = $$1; //@line 5631
   HEAP32[$$1 + 8 >> 2] = $$1; //@line 5633
  } else {
   $$0383 = $$2 << (($$0396 | 0) == 31 ? 0 : 25 - ($$0396 >>> 1) | 0); //@line 5641
   $$0384 = HEAP32[$276 >> 2] | 0; //@line 5641
   while (1) {
    if ((HEAP32[$$0384 + 4 >> 2] & -8 | 0) == ($$2 | 0)) {
     label = 124; //@line 5648
     break;
    }
    $299 = $$0384 + 16 + ($$0383 >>> 31 << 2) | 0; //@line 5652
    $301 = HEAP32[$299 >> 2] | 0; //@line 5654
    if (!$301) {
     label = 121; //@line 5657
     break;
    } else {
     $$0383 = $$0383 << 1; //@line 5660
     $$0384 = $301; //@line 5660
    }
   }
   if ((label | 0) == 121) {
    if ((HEAP32[1345] | 0) >>> 0 > $299 >>> 0) {
     _abort(); //@line 5667
    } else {
     HEAP32[$299 >> 2] = $$1; //@line 5670
     HEAP32[$$1 + 24 >> 2] = $$0384; //@line 5672
     HEAP32[$$1 + 12 >> 2] = $$1; //@line 5674
     HEAP32[$$1 + 8 >> 2] = $$1; //@line 5676
     break;
    }
   } else if ((label | 0) == 124) {
    $308 = $$0384 + 8 | 0; //@line 5681
    $309 = HEAP32[$308 >> 2] | 0; //@line 5682
    $310 = HEAP32[1345] | 0; //@line 5683
    if ($310 >>> 0 <= $309 >>> 0 & $310 >>> 0 <= $$0384 >>> 0) {
     HEAP32[$309 + 12 >> 2] = $$1; //@line 5689
     HEAP32[$308 >> 2] = $$1; //@line 5690
     HEAP32[$$1 + 8 >> 2] = $309; //@line 5692
     HEAP32[$$1 + 12 >> 2] = $$0384; //@line 5694
     HEAP32[$$1 + 24 >> 2] = 0; //@line 5696
     break;
    } else {
     _abort(); //@line 5699
    }
   }
  }
 } while (0);
 $319 = (HEAP32[1349] | 0) + -1 | 0; //@line 5706
 HEAP32[1349] = $319; //@line 5707
 if (!$319) {
  $$0212$in$i = 5820; //@line 5710
 } else {
  return;
 }
 while (1) {
  $$0212$i = HEAP32[$$0212$in$i >> 2] | 0; //@line 5715
  if (!$$0212$i) {
   break;
  } else {
   $$0212$in$i = $$0212$i + 8 | 0; //@line 5721
  }
 }
 HEAP32[1349] = -1; //@line 5724
 return;
}
function __ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($0, $1, $2, $3, $4) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 var $$0 = 0, $$081$off0 = 0, $$084 = 0, $$085$off0 = 0, $$1 = 0, $$182$off0 = 0, $$186$off0 = 0, $$2 = 0, $$283$off0 = 0, $100 = 0, $104 = 0, $105 = 0, $106 = 0, $122 = 0, $13 = 0, $136 = 0, $19 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $30 = 0, $61 = 0, $69 = 0, $72 = 0, $73 = 0, $81 = 0, $84 = 0, $87 = 0, $90 = 0, $AsyncCtx = 0, $AsyncCtx11 = 0, $AsyncCtx15 = 0, $AsyncCtx3 = 0, $AsyncCtx7 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 10658
 L1 : do {
  if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, $4) | 0) {
   __ZNK10__cxxabiv117__class_type_info29process_static_type_below_dstEPNS_19__dynamic_cast_infoEPKvi(0, $1, $2, $3); //@line 10664
  } else {
   if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 >> 2] | 0, $4) | 0) {
    if ((HEAP32[$1 + 16 >> 2] | 0) != ($2 | 0)) {
     $13 = $1 + 20 | 0; //@line 10673
     if ((HEAP32[$13 >> 2] | 0) != ($2 | 0)) {
      HEAP32[$1 + 32 >> 2] = $3; //@line 10678
      $19 = $1 + 44 | 0; //@line 10679
      if ((HEAP32[$19 >> 2] | 0) == 4) {
       break;
      }
      $25 = $0 + 16 + (HEAP32[$0 + 12 >> 2] << 3) | 0; //@line 10688
      $26 = $1 + 52 | 0; //@line 10689
      $27 = $1 + 53 | 0; //@line 10690
      $28 = $1 + 54 | 0; //@line 10691
      $29 = $0 + 8 | 0; //@line 10692
      $30 = $1 + 24 | 0; //@line 10693
      $$081$off0 = 0; //@line 10694
      $$084 = $0 + 16 | 0; //@line 10694
      $$085$off0 = 0; //@line 10694
      L10 : while (1) {
       if ($$084 >>> 0 >= $25 >>> 0) {
        $$283$off0 = $$081$off0; //@line 10698
        label = 20; //@line 10699
        break;
       }
       HEAP8[$26 >> 0] = 0; //@line 10702
       HEAP8[$27 >> 0] = 0; //@line 10703
       $AsyncCtx15 = _emscripten_alloc_async_context(56, sp) | 0; //@line 10704
       __ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($$084, $1, $2, $2, 1, $4); //@line 10705
       if (___async) {
        label = 12; //@line 10708
        break;
       }
       _emscripten_free_async_context($AsyncCtx15 | 0); //@line 10711
       if (HEAP8[$28 >> 0] | 0) {
        $$283$off0 = $$081$off0; //@line 10715
        label = 20; //@line 10716
        break;
       }
       do {
        if (!(HEAP8[$27 >> 0] | 0)) {
         $$182$off0 = $$081$off0; //@line 10723
         $$186$off0 = $$085$off0; //@line 10723
        } else {
         if (!(HEAP8[$26 >> 0] | 0)) {
          if (!(HEAP32[$29 >> 2] & 1)) {
           $$283$off0 = 1; //@line 10732
           label = 20; //@line 10733
           break L10;
          } else {
           $$182$off0 = 1; //@line 10736
           $$186$off0 = $$085$off0; //@line 10736
           break;
          }
         }
         if ((HEAP32[$30 >> 2] | 0) == 1) {
          label = 25; //@line 10743
          break L10;
         }
         if (!(HEAP32[$29 >> 2] & 2)) {
          label = 25; //@line 10750
          break L10;
         } else {
          $$182$off0 = 1; //@line 10753
          $$186$off0 = 1; //@line 10753
         }
        }
       } while (0);
       $$081$off0 = $$182$off0; //@line 10758
       $$084 = $$084 + 8 | 0; //@line 10758
       $$085$off0 = $$186$off0; //@line 10758
      }
      if ((label | 0) == 12) {
       HEAP32[$AsyncCtx15 >> 2] = 124; //@line 10761
       HEAP32[$AsyncCtx15 + 4 >> 2] = $25; //@line 10763
       HEAP32[$AsyncCtx15 + 8 >> 2] = $26; //@line 10765
       HEAP32[$AsyncCtx15 + 12 >> 2] = $27; //@line 10767
       HEAP32[$AsyncCtx15 + 16 >> 2] = $1; //@line 10769
       HEAP32[$AsyncCtx15 + 20 >> 2] = $2; //@line 10771
       HEAP8[$AsyncCtx15 + 24 >> 0] = $4 & 1; //@line 10774
       HEAP32[$AsyncCtx15 + 28 >> 2] = $30; //@line 10776
       HEAP32[$AsyncCtx15 + 32 >> 2] = $29; //@line 10778
       HEAP8[$AsyncCtx15 + 36 >> 0] = $$085$off0 & 1; //@line 10781
       HEAP8[$AsyncCtx15 + 37 >> 0] = $$081$off0 & 1; //@line 10784
       HEAP32[$AsyncCtx15 + 40 >> 2] = $$084; //@line 10786
       HEAP32[$AsyncCtx15 + 44 >> 2] = $13; //@line 10788
       HEAP32[$AsyncCtx15 + 48 >> 2] = $28; //@line 10790
       HEAP32[$AsyncCtx15 + 52 >> 2] = $19; //@line 10792
       sp = STACKTOP; //@line 10793
       return;
      }
      do {
       if ((label | 0) == 20) {
        if (!$$085$off0) {
         HEAP32[$13 >> 2] = $2; //@line 10799
         $61 = $1 + 40 | 0; //@line 10800
         HEAP32[$61 >> 2] = (HEAP32[$61 >> 2] | 0) + 1; //@line 10803
         if ((HEAP32[$1 + 36 >> 2] | 0) == 1) {
          if ((HEAP32[$30 >> 2] | 0) == 2) {
           HEAP8[$28 >> 0] = 1; //@line 10811
           if ($$283$off0) {
            label = 25; //@line 10813
            break;
           } else {
            $69 = 4; //@line 10816
            break;
           }
          }
         }
        }
        if ($$283$off0) {
         label = 25; //@line 10823
        } else {
         $69 = 4; //@line 10825
        }
       }
      } while (0);
      if ((label | 0) == 25) {
       $69 = 3; //@line 10830
      }
      HEAP32[$19 >> 2] = $69; //@line 10832
      break;
     }
    }
    if (($3 | 0) != 1) {
     break;
    }
    HEAP32[$1 + 32 >> 2] = 1; //@line 10841
    break;
   }
   $72 = HEAP32[$0 + 12 >> 2] | 0; //@line 10846
   $73 = $0 + 16 + ($72 << 3) | 0; //@line 10847
   $AsyncCtx11 = _emscripten_alloc_async_context(32, sp) | 0; //@line 10848
   __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($0 + 16 | 0, $1, $2, $3, $4); //@line 10849
   if (___async) {
    HEAP32[$AsyncCtx11 >> 2] = 125; //@line 10852
    HEAP32[$AsyncCtx11 + 4 >> 2] = $1; //@line 10854
    HEAP32[$AsyncCtx11 + 8 >> 2] = $2; //@line 10856
    HEAP32[$AsyncCtx11 + 12 >> 2] = $3; //@line 10858
    HEAP8[$AsyncCtx11 + 16 >> 0] = $4 & 1; //@line 10861
    HEAP32[$AsyncCtx11 + 20 >> 2] = $73; //@line 10863
    HEAP32[$AsyncCtx11 + 24 >> 2] = $0; //@line 10865
    HEAP32[$AsyncCtx11 + 28 >> 2] = $72; //@line 10867
    sp = STACKTOP; //@line 10868
    return;
   }
   _emscripten_free_async_context($AsyncCtx11 | 0); //@line 10871
   $81 = $0 + 24 | 0; //@line 10872
   if (($72 | 0) > 1) {
    $84 = HEAP32[$0 + 8 >> 2] | 0; //@line 10876
    if (!($84 & 2)) {
     $87 = $1 + 36 | 0; //@line 10880
     if ((HEAP32[$87 >> 2] | 0) != 1) {
      if (!($84 & 1)) {
       $106 = $1 + 54 | 0; //@line 10887
       $$2 = $81; //@line 10888
       while (1) {
        if (HEAP8[$106 >> 0] | 0) {
         break L1;
        }
        if ((HEAP32[$87 >> 2] | 0) == 1) {
         break L1;
        }
        $AsyncCtx = _emscripten_alloc_async_context(36, sp) | 0; //@line 10900
        __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($$2, $1, $2, $3, $4); //@line 10901
        if (___async) {
         break;
        }
        _emscripten_free_async_context($AsyncCtx | 0); //@line 10906
        $136 = $$2 + 8 | 0; //@line 10907
        if ($136 >>> 0 < $73 >>> 0) {
         $$2 = $136; //@line 10910
        } else {
         break L1;
        }
       }
       HEAP32[$AsyncCtx >> 2] = 128; //@line 10915
       HEAP32[$AsyncCtx + 4 >> 2] = $$2; //@line 10917
       HEAP32[$AsyncCtx + 8 >> 2] = $73; //@line 10919
       HEAP32[$AsyncCtx + 12 >> 2] = $106; //@line 10921
       HEAP32[$AsyncCtx + 16 >> 2] = $87; //@line 10923
       HEAP32[$AsyncCtx + 20 >> 2] = $1; //@line 10925
       HEAP32[$AsyncCtx + 24 >> 2] = $2; //@line 10927
       HEAP32[$AsyncCtx + 28 >> 2] = $3; //@line 10929
       HEAP8[$AsyncCtx + 32 >> 0] = $4 & 1; //@line 10932
       sp = STACKTOP; //@line 10933
       return;
      }
      $104 = $1 + 24 | 0; //@line 10936
      $105 = $1 + 54 | 0; //@line 10937
      $$1 = $81; //@line 10938
      while (1) {
       if (HEAP8[$105 >> 0] | 0) {
        break L1;
       }
       if ((HEAP32[$87 >> 2] | 0) == 1) {
        if ((HEAP32[$104 >> 2] | 0) == 1) {
         break L1;
        }
       }
       $AsyncCtx3 = _emscripten_alloc_async_context(40, sp) | 0; //@line 10954
       __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($$1, $1, $2, $3, $4); //@line 10955
       if (___async) {
        break;
       }
       _emscripten_free_async_context($AsyncCtx3 | 0); //@line 10960
       $122 = $$1 + 8 | 0; //@line 10961
       if ($122 >>> 0 < $73 >>> 0) {
        $$1 = $122; //@line 10964
       } else {
        break L1;
       }
      }
      HEAP32[$AsyncCtx3 >> 2] = 127; //@line 10969
      HEAP32[$AsyncCtx3 + 4 >> 2] = $$1; //@line 10971
      HEAP32[$AsyncCtx3 + 8 >> 2] = $73; //@line 10973
      HEAP32[$AsyncCtx3 + 12 >> 2] = $105; //@line 10975
      HEAP32[$AsyncCtx3 + 16 >> 2] = $87; //@line 10977
      HEAP32[$AsyncCtx3 + 20 >> 2] = $104; //@line 10979
      HEAP32[$AsyncCtx3 + 24 >> 2] = $1; //@line 10981
      HEAP32[$AsyncCtx3 + 28 >> 2] = $2; //@line 10983
      HEAP32[$AsyncCtx3 + 32 >> 2] = $3; //@line 10985
      HEAP8[$AsyncCtx3 + 36 >> 0] = $4 & 1; //@line 10988
      sp = STACKTOP; //@line 10989
      return;
     }
    }
    $90 = $1 + 54 | 0; //@line 10993
    $$0 = $81; //@line 10994
    while (1) {
     if (HEAP8[$90 >> 0] | 0) {
      break L1;
     }
     $AsyncCtx7 = _emscripten_alloc_async_context(32, sp) | 0; //@line 11001
     __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($$0, $1, $2, $3, $4); //@line 11002
     if (___async) {
      break;
     }
     _emscripten_free_async_context($AsyncCtx7 | 0); //@line 11007
     $100 = $$0 + 8 | 0; //@line 11008
     if ($100 >>> 0 < $73 >>> 0) {
      $$0 = $100; //@line 11011
     } else {
      break L1;
     }
    }
    HEAP32[$AsyncCtx7 >> 2] = 126; //@line 11016
    HEAP32[$AsyncCtx7 + 4 >> 2] = $$0; //@line 11018
    HEAP32[$AsyncCtx7 + 8 >> 2] = $73; //@line 11020
    HEAP32[$AsyncCtx7 + 12 >> 2] = $90; //@line 11022
    HEAP32[$AsyncCtx7 + 16 >> 2] = $1; //@line 11024
    HEAP32[$AsyncCtx7 + 20 >> 2] = $2; //@line 11026
    HEAP32[$AsyncCtx7 + 24 >> 2] = $3; //@line 11028
    HEAP8[$AsyncCtx7 + 28 >> 0] = $4 & 1; //@line 11031
    sp = STACKTOP; //@line 11032
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
 $n_sroa_0_0_extract_trunc = $a$0; //@line 1370
 $n_sroa_1_4_extract_shift$0 = $a$1; //@line 1371
 $n_sroa_1_4_extract_trunc = $n_sroa_1_4_extract_shift$0; //@line 1372
 $d_sroa_0_0_extract_trunc = $b$0; //@line 1373
 $d_sroa_1_4_extract_shift$0 = $b$1; //@line 1374
 $d_sroa_1_4_extract_trunc = $d_sroa_1_4_extract_shift$0; //@line 1375
 if (!$n_sroa_1_4_extract_trunc) {
  $4 = ($rem | 0) != 0; //@line 1377
  if (!$d_sroa_1_4_extract_trunc) {
   if ($4) {
    HEAP32[$rem >> 2] = ($n_sroa_0_0_extract_trunc >>> 0) % ($d_sroa_0_0_extract_trunc >>> 0); //@line 1380
    HEAP32[$rem + 4 >> 2] = 0; //@line 1381
   }
   $_0$1 = 0; //@line 1383
   $_0$0 = ($n_sroa_0_0_extract_trunc >>> 0) / ($d_sroa_0_0_extract_trunc >>> 0) >>> 0; //@line 1384
   return (tempRet0 = $_0$1, $_0$0) | 0; //@line 1385
  } else {
   if (!$4) {
    $_0$1 = 0; //@line 1388
    $_0$0 = 0; //@line 1389
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 1390
   }
   HEAP32[$rem >> 2] = $a$0 | 0; //@line 1392
   HEAP32[$rem + 4 >> 2] = $a$1 & 0; //@line 1393
   $_0$1 = 0; //@line 1394
   $_0$0 = 0; //@line 1395
   return (tempRet0 = $_0$1, $_0$0) | 0; //@line 1396
  }
 }
 $17 = ($d_sroa_1_4_extract_trunc | 0) == 0; //@line 1399
 do {
  if (!$d_sroa_0_0_extract_trunc) {
   if ($17) {
    if ($rem | 0) {
     HEAP32[$rem >> 2] = ($n_sroa_1_4_extract_trunc >>> 0) % ($d_sroa_0_0_extract_trunc >>> 0); //@line 1404
     HEAP32[$rem + 4 >> 2] = 0; //@line 1405
    }
    $_0$1 = 0; //@line 1407
    $_0$0 = ($n_sroa_1_4_extract_trunc >>> 0) / ($d_sroa_0_0_extract_trunc >>> 0) >>> 0; //@line 1408
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 1409
   }
   if (!$n_sroa_0_0_extract_trunc) {
    if ($rem | 0) {
     HEAP32[$rem >> 2] = 0; //@line 1413
     HEAP32[$rem + 4 >> 2] = ($n_sroa_1_4_extract_trunc >>> 0) % ($d_sroa_1_4_extract_trunc >>> 0); //@line 1414
    }
    $_0$1 = 0; //@line 1416
    $_0$0 = ($n_sroa_1_4_extract_trunc >>> 0) / ($d_sroa_1_4_extract_trunc >>> 0) >>> 0; //@line 1417
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 1418
   }
   $37 = $d_sroa_1_4_extract_trunc - 1 | 0; //@line 1420
   if (!($37 & $d_sroa_1_4_extract_trunc)) {
    if ($rem | 0) {
     HEAP32[$rem >> 2] = $a$0 | 0; //@line 1423
     HEAP32[$rem + 4 >> 2] = $37 & $n_sroa_1_4_extract_trunc | $a$1 & 0; //@line 1424
    }
    $_0$1 = 0; //@line 1426
    $_0$0 = $n_sroa_1_4_extract_trunc >>> ((_llvm_cttz_i32($d_sroa_1_4_extract_trunc | 0) | 0) >>> 0); //@line 1427
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 1428
   }
   $51 = (Math_clz32($d_sroa_1_4_extract_trunc | 0) | 0) - (Math_clz32($n_sroa_1_4_extract_trunc | 0) | 0) | 0; //@line 1431
   if ($51 >>> 0 <= 30) {
    $57 = $51 + 1 | 0; //@line 1433
    $58 = 31 - $51 | 0; //@line 1434
    $sr_1_ph = $57; //@line 1435
    $r_sroa_0_1_ph = $n_sroa_1_4_extract_trunc << $58 | $n_sroa_0_0_extract_trunc >>> ($57 >>> 0); //@line 1436
    $r_sroa_1_1_ph = $n_sroa_1_4_extract_trunc >>> ($57 >>> 0); //@line 1437
    $q_sroa_0_1_ph = 0; //@line 1438
    $q_sroa_1_1_ph = $n_sroa_0_0_extract_trunc << $58; //@line 1439
    break;
   }
   if (!$rem) {
    $_0$1 = 0; //@line 1443
    $_0$0 = 0; //@line 1444
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 1445
   }
   HEAP32[$rem >> 2] = $a$0 | 0; //@line 1447
   HEAP32[$rem + 4 >> 2] = $n_sroa_1_4_extract_shift$0 | $a$1 & 0; //@line 1448
   $_0$1 = 0; //@line 1449
   $_0$0 = 0; //@line 1450
   return (tempRet0 = $_0$1, $_0$0) | 0; //@line 1451
  } else {
   if (!$17) {
    $119 = (Math_clz32($d_sroa_1_4_extract_trunc | 0) | 0) - (Math_clz32($n_sroa_1_4_extract_trunc | 0) | 0) | 0; //@line 1455
    if ($119 >>> 0 <= 31) {
     $125 = $119 + 1 | 0; //@line 1457
     $126 = 31 - $119 | 0; //@line 1458
     $130 = $119 - 31 >> 31; //@line 1459
     $sr_1_ph = $125; //@line 1460
     $r_sroa_0_1_ph = $n_sroa_0_0_extract_trunc >>> ($125 >>> 0) & $130 | $n_sroa_1_4_extract_trunc << $126; //@line 1461
     $r_sroa_1_1_ph = $n_sroa_1_4_extract_trunc >>> ($125 >>> 0) & $130; //@line 1462
     $q_sroa_0_1_ph = 0; //@line 1463
     $q_sroa_1_1_ph = $n_sroa_0_0_extract_trunc << $126; //@line 1464
     break;
    }
    if (!$rem) {
     $_0$1 = 0; //@line 1468
     $_0$0 = 0; //@line 1469
     return (tempRet0 = $_0$1, $_0$0) | 0; //@line 1470
    }
    HEAP32[$rem >> 2] = $a$0 | 0; //@line 1472
    HEAP32[$rem + 4 >> 2] = $n_sroa_1_4_extract_shift$0 | $a$1 & 0; //@line 1473
    $_0$1 = 0; //@line 1474
    $_0$0 = 0; //@line 1475
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 1476
   }
   $66 = $d_sroa_0_0_extract_trunc - 1 | 0; //@line 1478
   if ($66 & $d_sroa_0_0_extract_trunc | 0) {
    $88 = (Math_clz32($d_sroa_0_0_extract_trunc | 0) | 0) + 33 - (Math_clz32($n_sroa_1_4_extract_trunc | 0) | 0) | 0; //@line 1481
    $89 = 64 - $88 | 0; //@line 1482
    $91 = 32 - $88 | 0; //@line 1483
    $92 = $91 >> 31; //@line 1484
    $95 = $88 - 32 | 0; //@line 1485
    $105 = $95 >> 31; //@line 1486
    $sr_1_ph = $88; //@line 1487
    $r_sroa_0_1_ph = $91 - 1 >> 31 & $n_sroa_1_4_extract_trunc >>> ($95 >>> 0) | ($n_sroa_1_4_extract_trunc << $91 | $n_sroa_0_0_extract_trunc >>> ($88 >>> 0)) & $105; //@line 1488
    $r_sroa_1_1_ph = $105 & $n_sroa_1_4_extract_trunc >>> ($88 >>> 0); //@line 1489
    $q_sroa_0_1_ph = $n_sroa_0_0_extract_trunc << $89 & $92; //@line 1490
    $q_sroa_1_1_ph = ($n_sroa_1_4_extract_trunc << $89 | $n_sroa_0_0_extract_trunc >>> ($95 >>> 0)) & $92 | $n_sroa_0_0_extract_trunc << $91 & $88 - 33 >> 31; //@line 1491
    break;
   }
   if ($rem | 0) {
    HEAP32[$rem >> 2] = $66 & $n_sroa_0_0_extract_trunc; //@line 1495
    HEAP32[$rem + 4 >> 2] = 0; //@line 1496
   }
   if (($d_sroa_0_0_extract_trunc | 0) == 1) {
    $_0$1 = $n_sroa_1_4_extract_shift$0 | $a$1 & 0; //@line 1499
    $_0$0 = $a$0 | 0 | 0; //@line 1500
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 1501
   } else {
    $78 = _llvm_cttz_i32($d_sroa_0_0_extract_trunc | 0) | 0; //@line 1503
    $_0$1 = $n_sroa_1_4_extract_trunc >>> ($78 >>> 0) | 0; //@line 1504
    $_0$0 = $n_sroa_1_4_extract_trunc << 32 - $78 | $n_sroa_0_0_extract_trunc >>> ($78 >>> 0) | 0; //@line 1505
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 1506
   }
  }
 } while (0);
 if (!$sr_1_ph) {
  $q_sroa_1_1_lcssa = $q_sroa_1_1_ph; //@line 1511
  $q_sroa_0_1_lcssa = $q_sroa_0_1_ph; //@line 1512
  $r_sroa_1_1_lcssa = $r_sroa_1_1_ph; //@line 1513
  $r_sroa_0_1_lcssa = $r_sroa_0_1_ph; //@line 1514
  $carry_0_lcssa$1 = 0; //@line 1515
  $carry_0_lcssa$0 = 0; //@line 1516
 } else {
  $d_sroa_0_0_insert_insert99$0 = $b$0 | 0 | 0; //@line 1518
  $d_sroa_0_0_insert_insert99$1 = $d_sroa_1_4_extract_shift$0 | $b$1 & 0; //@line 1519
  $137$0 = _i64Add($d_sroa_0_0_insert_insert99$0 | 0, $d_sroa_0_0_insert_insert99$1 | 0, -1, -1) | 0; //@line 1520
  $137$1 = tempRet0; //@line 1521
  $q_sroa_1_1198 = $q_sroa_1_1_ph; //@line 1522
  $q_sroa_0_1199 = $q_sroa_0_1_ph; //@line 1523
  $r_sroa_1_1200 = $r_sroa_1_1_ph; //@line 1524
  $r_sroa_0_1201 = $r_sroa_0_1_ph; //@line 1525
  $sr_1202 = $sr_1_ph; //@line 1526
  $carry_0203 = 0; //@line 1527
  do {
   $q_sroa_1_1198$looptemp = $q_sroa_1_1198;
   $q_sroa_1_1198 = $q_sroa_0_1199 >>> 31 | $q_sroa_1_1198 << 1; //@line 1529
   $q_sroa_0_1199 = $carry_0203 | $q_sroa_0_1199 << 1; //@line 1530
   $r_sroa_0_0_insert_insert42$0 = $r_sroa_0_1201 << 1 | $q_sroa_1_1198$looptemp >>> 31 | 0; //@line 1531
   $r_sroa_0_0_insert_insert42$1 = $r_sroa_0_1201 >>> 31 | $r_sroa_1_1200 << 1 | 0; //@line 1532
   _i64Subtract($137$0 | 0, $137$1 | 0, $r_sroa_0_0_insert_insert42$0 | 0, $r_sroa_0_0_insert_insert42$1 | 0) | 0; //@line 1533
   $150$1 = tempRet0; //@line 1534
   $151$0 = $150$1 >> 31 | (($150$1 | 0) < 0 ? -1 : 0) << 1; //@line 1535
   $carry_0203 = $151$0 & 1; //@line 1536
   $r_sroa_0_1201 = _i64Subtract($r_sroa_0_0_insert_insert42$0 | 0, $r_sroa_0_0_insert_insert42$1 | 0, $151$0 & $d_sroa_0_0_insert_insert99$0 | 0, ((($150$1 | 0) < 0 ? -1 : 0) >> 31 | (($150$1 | 0) < 0 ? -1 : 0) << 1) & $d_sroa_0_0_insert_insert99$1 | 0) | 0; //@line 1538
   $r_sroa_1_1200 = tempRet0; //@line 1539
   $sr_1202 = $sr_1202 - 1 | 0; //@line 1540
  } while (($sr_1202 | 0) != 0);
  $q_sroa_1_1_lcssa = $q_sroa_1_1198; //@line 1552
  $q_sroa_0_1_lcssa = $q_sroa_0_1199; //@line 1553
  $r_sroa_1_1_lcssa = $r_sroa_1_1200; //@line 1554
  $r_sroa_0_1_lcssa = $r_sroa_0_1201; //@line 1555
  $carry_0_lcssa$1 = 0; //@line 1556
  $carry_0_lcssa$0 = $carry_0203; //@line 1557
 }
 $q_sroa_0_0_insert_ext75$0 = $q_sroa_0_1_lcssa; //@line 1559
 $q_sroa_0_0_insert_ext75$1 = 0; //@line 1560
 if ($rem | 0) {
  HEAP32[$rem >> 2] = $r_sroa_0_1_lcssa; //@line 1563
  HEAP32[$rem + 4 >> 2] = $r_sroa_1_1_lcssa; //@line 1564
 }
 $_0$1 = ($q_sroa_0_0_insert_ext75$0 | 0) >>> 31 | ($q_sroa_1_1_lcssa | $q_sroa_0_0_insert_ext75$1) << 1 | ($q_sroa_0_0_insert_ext75$1 << 1 | $q_sroa_0_0_insert_ext75$0 >>> 31) & 0 | $carry_0_lcssa$1; //@line 1566
 $_0$0 = ($q_sroa_0_0_insert_ext75$0 << 1 | 0 >>> 31) & -2 | $carry_0_lcssa$0; //@line 1567
 return (tempRet0 = $_0$1, $_0$0) | 0; //@line 1568
}
function _schedule_interrupt($0) {
 $0 = $0 | 0;
 var $$0$i = 0, $1 = 0, $10 = 0, $104 = 0, $107 = 0, $109 = 0, $11 = 0, $112 = 0, $113 = 0, $115 = 0, $118 = 0, $126 = 0, $127 = 0, $128 = 0, $130 = 0, $132 = 0, $137 = 0, $14 = 0, $144 = 0, $146 = 0, $148 = 0, $151 = 0, $153 = 0, $160 = 0, $161 = 0, $164 = 0, $166 = 0, $168 = 0, $174 = 0, $175 = 0, $179 = 0, $187 = 0, $19 = 0, $195 = 0, $198 = 0, $2 = 0, $21 = 0, $22 = 0, $24 = 0, $25 = 0, $28 = 0, $29 = 0, $35 = 0, $36 = 0, $37 = 0, $46 = 0, $47 = 0, $48 = 0, $5 = 0, $50 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $6 = 0, $60 = 0, $62 = 0, $63 = 0, $69 = 0, $70 = 0, $71 = 0, $80 = 0, $81 = 0, $82 = 0, $84 = 0, $88 = 0, $89 = 0, $95 = 0, $96 = 0, $97 = 0, $99 = 0, $AsyncCtx = 0, $AsyncCtx11 = 0, $AsyncCtx14 = 0, $AsyncCtx18 = 0, $AsyncCtx22 = 0, $AsyncCtx3 = 0, $AsyncCtx7 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 1007
 $1 = $0 + 4 | 0; //@line 1008
 $2 = HEAP32[$1 >> 2] | 0; //@line 1009
 $5 = HEAP32[(HEAP32[$0 >> 2] | 0) + 4 >> 2] | 0; //@line 1012
 $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 1013
 $6 = FUNCTION_TABLE_i[$5 & 3]() | 0; //@line 1014
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 49; //@line 1017
  HEAP32[$AsyncCtx + 4 >> 2] = $2; //@line 1019
  HEAP32[$AsyncCtx + 8 >> 2] = $0; //@line 1021
  HEAP32[$AsyncCtx + 12 >> 2] = $1; //@line 1023
  sp = STACKTOP; //@line 1024
  return;
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 1027
 $10 = HEAP32[$1 >> 2] | 0; //@line 1028
 $11 = $10 + 32 | 0; //@line 1029
 if (($6 | 0) != (HEAP32[$11 >> 2] | 0)) {
  $14 = $2 + 32 | 0; //@line 1033
  $19 = $6 - (HEAP32[$14 >> 2] | 0) & HEAP32[$2 + 12 >> 2]; //@line 1038
  HEAP32[$14 >> 2] = $6; //@line 1039
  $21 = HEAP32[$2 + 8 >> 2] | 0; //@line 1041
  L6 : do {
   if (($21 | 0) < 1e6) {
    switch ($21 | 0) {
    case 32768:
     {
      break;
     }
    default:
     {
      label = 7; //@line 1050
      break L6;
     }
    }
    $22 = ___muldi3($19 | 0, 0, 1e6, 0) | 0; //@line 1054
    $24 = _bitshift64Lshr($22 | 0, tempRet0 | 0, 15) | 0; //@line 1056
    $25 = tempRet0; //@line 1057
    $28 = $2 + 40 | 0; //@line 1060
    $29 = $28; //@line 1061
    $35 = _i64Add(HEAP32[$29 >> 2] | 0, HEAP32[$29 + 4 >> 2] | 0, $19 * 1e6 & 32704 | 0, 0) | 0; //@line 1067
    $36 = tempRet0; //@line 1068
    $37 = $28; //@line 1069
    HEAP32[$37 >> 2] = $35; //@line 1071
    HEAP32[$37 + 4 >> 2] = $36; //@line 1074
    if ($36 >>> 0 < 0 | ($36 | 0) == 0 & $35 >>> 0 < 32768) {
     $95 = $24; //@line 1081
     $96 = $25; //@line 1081
    } else {
     $46 = _i64Add($24 | 0, $25 | 0, 1, 0) | 0; //@line 1083
     $47 = tempRet0; //@line 1084
     $48 = _i64Add($35 | 0, $36 | 0, -32768, -1) | 0; //@line 1085
     $50 = $28; //@line 1087
     HEAP32[$50 >> 2] = $48; //@line 1089
     HEAP32[$50 + 4 >> 2] = tempRet0; //@line 1092
     $95 = $46; //@line 1093
     $96 = $47; //@line 1093
    }
   } else {
    switch ($21 | 0) {
    case 1e6:
     {
      $95 = $19; //@line 1098
      $96 = 0; //@line 1098
      break;
     }
    default:
     {
      label = 7; //@line 1102
     }
    }
   }
  } while (0);
  if ((label | 0) == 7) {
   $54 = ___muldi3($19 | 0, 0, 1e6, 0) | 0; //@line 1108
   $55 = tempRet0; //@line 1109
   $56 = ___udivdi3($54 | 0, $55 | 0, $21 | 0, 0) | 0; //@line 1110
   $57 = tempRet0; //@line 1111
   $58 = ___muldi3($56 | 0, $57 | 0, $21 | 0, 0) | 0; //@line 1112
   $60 = _i64Subtract($54 | 0, $55 | 0, $58 | 0, tempRet0 | 0) | 0; //@line 1114
   $62 = $2 + 40 | 0; //@line 1116
   $63 = $62; //@line 1117
   $69 = _i64Add($60 | 0, tempRet0 | 0, HEAP32[$63 >> 2] | 0, HEAP32[$63 + 4 >> 2] | 0) | 0; //@line 1123
   $70 = tempRet0; //@line 1124
   $71 = $62; //@line 1125
   HEAP32[$71 >> 2] = $69; //@line 1127
   HEAP32[$71 + 4 >> 2] = $70; //@line 1130
   if ($70 >>> 0 < 0 | ($70 | 0) == 0 & $69 >>> 0 < $21 >>> 0) {
    $95 = $56; //@line 1137
    $96 = $57; //@line 1137
   } else {
    $80 = _i64Add($56 | 0, $57 | 0, 1, 0) | 0; //@line 1139
    $81 = tempRet0; //@line 1140
    $82 = _i64Subtract($69 | 0, $70 | 0, $21 | 0, 0) | 0; //@line 1141
    $84 = $62; //@line 1143
    HEAP32[$84 >> 2] = $82; //@line 1145
    HEAP32[$84 + 4 >> 2] = tempRet0; //@line 1148
    $95 = $80; //@line 1149
    $96 = $81; //@line 1149
   }
  }
  $88 = $2 + 48 | 0; //@line 1152
  $89 = $88; //@line 1153
  $97 = _i64Add(HEAP32[$89 >> 2] | 0, HEAP32[$89 + 4 >> 2] | 0, $95 | 0, $96 | 0) | 0; //@line 1159
  $99 = $88; //@line 1161
  HEAP32[$99 >> 2] = $97; //@line 1163
  HEAP32[$99 + 4 >> 2] = tempRet0; //@line 1166
 }
 $104 = HEAP32[$10 + 4 >> 2] | 0; //@line 1169
 if (!$104) {
  $195 = (HEAP32[$2 + 16 >> 2] | 0) + (HEAP32[$2 + 32 >> 2] | 0) & HEAP32[$2 + 12 >> 2]; //@line 1179
  $198 = HEAP32[(HEAP32[$0 >> 2] | 0) + 16 >> 2] | 0; //@line 1182
  $AsyncCtx22 = _emscripten_alloc_async_context(4, sp) | 0; //@line 1183
  FUNCTION_TABLE_vi[$198 & 255]($195); //@line 1184
  if (___async) {
   HEAP32[$AsyncCtx22 >> 2] = 55; //@line 1187
   sp = STACKTOP; //@line 1188
   return;
  } else {
   _emscripten_free_async_context($AsyncCtx22 | 0); //@line 1191
   return;
  }
 }
 $107 = $10 + 48 | 0; //@line 1196
 $109 = HEAP32[$107 >> 2] | 0; //@line 1198
 $112 = HEAP32[$107 + 4 >> 2] | 0; //@line 1201
 $113 = $104; //@line 1202
 $115 = HEAP32[$113 >> 2] | 0; //@line 1204
 $118 = HEAP32[$113 + 4 >> 2] | 0; //@line 1207
 if (!($118 >>> 0 > $112 >>> 0 | ($118 | 0) == ($112 | 0) & $115 >>> 0 > $109 >>> 0)) {
  $126 = HEAP32[(HEAP32[$0 >> 2] | 0) + 20 >> 2] | 0; //@line 1216
  $AsyncCtx3 = _emscripten_alloc_async_context(4, sp) | 0; //@line 1217
  FUNCTION_TABLE_v[$126 & 15](); //@line 1218
  if (___async) {
   HEAP32[$AsyncCtx3 >> 2] = 50; //@line 1221
   sp = STACKTOP; //@line 1222
   return;
  }
  _emscripten_free_async_context($AsyncCtx3 | 0); //@line 1225
  return;
 }
 $127 = _i64Subtract($115 | 0, $118 | 0, $109 | 0, $112 | 0) | 0; //@line 1228
 $128 = tempRet0; //@line 1229
 $130 = HEAP32[$10 + 16 >> 2] | 0; //@line 1231
 $132 = $10 + 24 | 0; //@line 1233
 $137 = HEAP32[$132 + 4 >> 2] | 0; //@line 1238
 L29 : do {
  if ($128 >>> 0 > $137 >>> 0 | (($128 | 0) == ($137 | 0) ? $127 >>> 0 > (HEAP32[$132 >> 2] | 0) >>> 0 : 0)) {
   $$0$i = $130; //@line 1246
  } else {
   $144 = HEAP32[$10 + 8 >> 2] | 0; //@line 1249
   L31 : do {
    if (($144 | 0) < 1e6) {
     switch ($144 | 0) {
     case 32768:
      {
       break;
      }
     default:
      {
       break L31;
      }
     }
     $146 = _bitshift64Shl($127 | 0, $128 | 0, 15) | 0; //@line 1261
     $148 = ___udivdi3($146 | 0, tempRet0 | 0, 1e6, 0) | 0; //@line 1263
     $$0$i = $130 >>> 0 < $148 >>> 0 ? $130 : $148; //@line 1267
     break L29;
    } else {
     switch ($144 | 0) {
     case 1e6:
      {
       break;
      }
     default:
      {
       break L31;
      }
     }
     $$0$i = $130 >>> 0 < $127 >>> 0 ? $130 : $127; //@line 1280
     break L29;
    }
   } while (0);
   $151 = ___muldi3($127 | 0, $128 | 0, $144 | 0, 0) | 0; //@line 1284
   $153 = ___udivdi3($151 | 0, tempRet0 | 0, 1e6, 0) | 0; //@line 1286
   $$0$i = $130 >>> 0 < $153 >>> 0 ? $130 : $153; //@line 1290
  }
 } while (0);
 $160 = (HEAP32[$11 >> 2] | 0) + $$0$i & HEAP32[$10 + 12 >> 2]; //@line 1297
 $161 = $2 + 32 | 0; //@line 1298
 $164 = HEAP32[$0 >> 2] | 0; //@line 1301
 if (($160 | 0) == (HEAP32[$161 >> 2] | 0)) {
  $166 = HEAP32[$164 + 20 >> 2] | 0; //@line 1304
  $AsyncCtx7 = _emscripten_alloc_async_context(4, sp) | 0; //@line 1305
  FUNCTION_TABLE_v[$166 & 15](); //@line 1306
  if (___async) {
   HEAP32[$AsyncCtx7 >> 2] = 51; //@line 1309
   sp = STACKTOP; //@line 1310
   return;
  }
  _emscripten_free_async_context($AsyncCtx7 | 0); //@line 1313
  return;
 }
 $168 = HEAP32[$164 + 16 >> 2] | 0; //@line 1317
 $AsyncCtx11 = _emscripten_alloc_async_context(16, sp) | 0; //@line 1318
 FUNCTION_TABLE_vi[$168 & 255]($160); //@line 1319
 if (___async) {
  HEAP32[$AsyncCtx11 >> 2] = 52; //@line 1322
  HEAP32[$AsyncCtx11 + 4 >> 2] = $0; //@line 1324
  HEAP32[$AsyncCtx11 + 8 >> 2] = $161; //@line 1326
  HEAP32[$AsyncCtx11 + 12 >> 2] = $160; //@line 1328
  sp = STACKTOP; //@line 1329
  return;
 }
 _emscripten_free_async_context($AsyncCtx11 | 0); //@line 1332
 $174 = HEAP32[(HEAP32[$0 >> 2] | 0) + 4 >> 2] | 0; //@line 1335
 $AsyncCtx14 = _emscripten_alloc_async_context(16, sp) | 0; //@line 1336
 $175 = FUNCTION_TABLE_i[$174 & 3]() | 0; //@line 1337
 if (___async) {
  HEAP32[$AsyncCtx14 >> 2] = 53; //@line 1340
  HEAP32[$AsyncCtx14 + 4 >> 2] = $161; //@line 1342
  HEAP32[$AsyncCtx14 + 8 >> 2] = $160; //@line 1344
  HEAP32[$AsyncCtx14 + 12 >> 2] = $0; //@line 1346
  sp = STACKTOP; //@line 1347
  return;
 }
 _emscripten_free_async_context($AsyncCtx14 | 0); //@line 1350
 $179 = HEAP32[$161 >> 2] | 0; //@line 1351
 if ($160 >>> 0 > $179 >>> 0) {
  if (!($175 >>> 0 >= $160 >>> 0 | $175 >>> 0 < $179 >>> 0)) {
   return;
  }
 } else {
  if (!($175 >>> 0 >= $160 >>> 0 & $175 >>> 0 < $179 >>> 0)) {
   return;
  }
 }
 $187 = HEAP32[(HEAP32[$0 >> 2] | 0) + 20 >> 2] | 0; //@line 1370
 $AsyncCtx18 = _emscripten_alloc_async_context(4, sp) | 0; //@line 1371
 FUNCTION_TABLE_v[$187 & 15](); //@line 1372
 if (___async) {
  HEAP32[$AsyncCtx18 >> 2] = 54; //@line 1375
  sp = STACKTOP; //@line 1376
  return;
 }
 _emscripten_free_async_context($AsyncCtx18 | 0); //@line 1379
 return;
}
function _initialize($0) {
 $0 = $0 | 0;
 var $$0 = 0, $$037 = 0, $1 = 0, $101 = 0, $102 = 0, $103 = 0, $105 = 0, $106 = 0, $109 = 0, $115 = 0, $116 = 0, $117 = 0, $126 = 0, $127 = 0, $128 = 0, $13 = 0, $130 = 0, $134 = 0, $135 = 0, $136 = 0, $137 = 0, $138 = 0, $14 = 0, $140 = 0, $142 = 0, $148 = 0, $149 = 0, $150 = 0, $159 = 0, $160 = 0, $161 = 0, $163 = 0, $167 = 0, $173 = 0, $174 = 0, $175 = 0, $177 = 0, $18 = 0, $25 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $37 = 0, $39 = 0, $40 = 0, $41 = 0, $45 = 0, $46 = 0, $52 = 0, $58 = 0, $59 = 0, $60 = 0, $61 = 0, $65 = 0, $66 = 0, $68 = 0, $7 = 0, $70 = 0, $73 = 0, $77 = 0, $78 = 0, $85 = 0, $86 = 0, $AsyncCtx = 0, $AsyncCtx12 = 0, $AsyncCtx16 = 0, $AsyncCtx2 = 0, $AsyncCtx20 = 0, $AsyncCtx6 = 0, $AsyncCtx9 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 639
 $1 = $0 + 4 | 0; //@line 640
 if (HEAP8[(HEAP32[$1 >> 2] | 0) + 56 >> 0] | 0) {
  return;
 }
 $7 = HEAP32[HEAP32[$0 >> 2] >> 2] | 0; //@line 649
 $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 650
 FUNCTION_TABLE_v[$7 & 15](); //@line 651
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 42; //@line 654
  HEAP32[$AsyncCtx + 4 >> 2] = $0; //@line 656
  HEAP32[$AsyncCtx + 8 >> 2] = $1; //@line 658
  HEAP32[$AsyncCtx + 12 >> 2] = $0; //@line 660
  sp = STACKTOP; //@line 661
  return;
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 664
 $13 = HEAP32[(HEAP32[$0 >> 2] | 0) + 24 >> 2] | 0; //@line 667
 $AsyncCtx2 = _emscripten_alloc_async_context(16, sp) | 0; //@line 668
 $14 = FUNCTION_TABLE_i[$13 & 3]() | 0; //@line 669
 if (___async) {
  HEAP32[$AsyncCtx2 >> 2] = 43; //@line 672
  HEAP32[$AsyncCtx2 + 4 >> 2] = $0; //@line 674
  HEAP32[$AsyncCtx2 + 8 >> 2] = $1; //@line 676
  HEAP32[$AsyncCtx2 + 12 >> 2] = $0; //@line 678
  sp = STACKTOP; //@line 679
  return;
 }
 _emscripten_free_async_context($AsyncCtx2 | 0); //@line 682
 $18 = HEAP32[$14 >> 2] | 0; //@line 683
 do {
  if (!$18) {
   $AsyncCtx20 = _emscripten_alloc_async_context(20, sp) | 0; //@line 687
   _mbed_assert_internal(1255, 1257, 41); //@line 688
   if (___async) {
    HEAP32[$AsyncCtx20 >> 2] = 44; //@line 691
    HEAP32[$AsyncCtx20 + 4 >> 2] = $1; //@line 693
    HEAP32[$AsyncCtx20 + 8 >> 2] = $0; //@line 695
    HEAP32[$AsyncCtx20 + 12 >> 2] = $0; //@line 697
    HEAP32[$AsyncCtx20 + 16 >> 2] = $14; //@line 699
    sp = STACKTOP; //@line 700
    return;
   } else {
    _emscripten_free_async_context($AsyncCtx20 | 0); //@line 703
    $$0 = 1e6; //@line 704
    break;
   }
  } else {
   $$0 = $18; //@line 708
  }
 } while (0);
 $25 = HEAP32[$14 + 4 >> 2] | 0; //@line 712
 do {
  if (($25 + -4 | 0) >>> 0 > 28) {
   $AsyncCtx16 = _emscripten_alloc_async_context(20, sp) | 0; //@line 717
   _mbed_assert_internal(1255, 1257, 47); //@line 718
   if (___async) {
    HEAP32[$AsyncCtx16 >> 2] = 45; //@line 721
    HEAP32[$AsyncCtx16 + 4 >> 2] = $$0; //@line 723
    HEAP32[$AsyncCtx16 + 8 >> 2] = $1; //@line 725
    HEAP32[$AsyncCtx16 + 12 >> 2] = $0; //@line 727
    HEAP32[$AsyncCtx16 + 16 >> 2] = $0; //@line 729
    sp = STACKTOP; //@line 730
    return;
   } else {
    _emscripten_free_async_context($AsyncCtx16 | 0); //@line 733
    $$037 = 32; //@line 734
    break;
   }
  } else {
   $$037 = $25; //@line 738
  }
 } while (0);
 $32 = 7 << $$037 + -4; //@line 742
 $33 = ___muldi3($32 | 0, 0, 1e6, 0) | 0; //@line 743
 $34 = tempRet0; //@line 744
 $35 = _i64Add($$0 | 0, 0, -1, -1) | 0; //@line 745
 $37 = _i64Add($35 | 0, tempRet0 | 0, $33 | 0, $34 | 0) | 0; //@line 747
 $39 = ___udivdi3($37 | 0, tempRet0 | 0, $$0 | 0, 0) | 0; //@line 749
 $40 = tempRet0; //@line 750
 $41 = HEAP32[$1 >> 2] | 0; //@line 751
 HEAP32[$41 >> 2] = 0; //@line 752
 HEAP32[$41 + 4 >> 2] = 0; //@line 754
 $45 = HEAP32[(HEAP32[$0 >> 2] | 0) + 4 >> 2] | 0; //@line 757
 $AsyncCtx6 = _emscripten_alloc_async_context(40, sp) | 0; //@line 758
 $46 = FUNCTION_TABLE_i[$45 & 3]() | 0; //@line 759
 if (___async) {
  HEAP32[$AsyncCtx6 >> 2] = 46; //@line 762
  HEAP32[$AsyncCtx6 + 4 >> 2] = $1; //@line 764
  HEAP32[$AsyncCtx6 + 8 >> 2] = $$0; //@line 766
  HEAP32[$AsyncCtx6 + 12 >> 2] = $$037; //@line 768
  HEAP32[$AsyncCtx6 + 16 >> 2] = $32; //@line 770
  $52 = $AsyncCtx6 + 24 | 0; //@line 772
  HEAP32[$52 >> 2] = $39; //@line 774
  HEAP32[$52 + 4 >> 2] = $40; //@line 777
  HEAP32[$AsyncCtx6 + 32 >> 2] = $0; //@line 779
  HEAP32[$AsyncCtx6 + 36 >> 2] = $0; //@line 781
  sp = STACKTOP; //@line 782
  return;
 }
 _emscripten_free_async_context($AsyncCtx6 | 0); //@line 785
 $58 = HEAP32[$1 >> 2] | 0; //@line 786
 $59 = $58 + 32 | 0; //@line 787
 HEAP32[$59 >> 2] = $46; //@line 788
 $60 = $58 + 40 | 0; //@line 789
 $61 = $60; //@line 790
 HEAP32[$61 >> 2] = 0; //@line 792
 HEAP32[$61 + 4 >> 2] = 0; //@line 795
 $65 = $58 + 8 | 0; //@line 796
 HEAP32[$65 >> 2] = $$0; //@line 797
 $66 = _bitshift64Shl(1, 0, $$037 | 0) | 0; //@line 798
 $68 = _i64Add($66 | 0, tempRet0 | 0, -1, 0) | 0; //@line 800
 $70 = $58 + 12 | 0; //@line 802
 HEAP32[$70 >> 2] = $68; //@line 803
 HEAP32[$58 + 16 >> 2] = $32; //@line 805
 $73 = $58 + 24 | 0; //@line 807
 HEAP32[$73 >> 2] = $39; //@line 809
 HEAP32[$73 + 4 >> 2] = $40; //@line 812
 $77 = $58 + 48 | 0; //@line 813
 $78 = $77; //@line 814
 HEAP32[$78 >> 2] = 0; //@line 816
 HEAP32[$78 + 4 >> 2] = 0; //@line 819
 HEAP8[$58 + 56 >> 0] = 1; //@line 821
 $85 = HEAP32[(HEAP32[$0 >> 2] | 0) + 4 >> 2] | 0; //@line 824
 $AsyncCtx9 = _emscripten_alloc_async_context(32, sp) | 0; //@line 825
 $86 = FUNCTION_TABLE_i[$85 & 3]() | 0; //@line 826
 if (___async) {
  HEAP32[$AsyncCtx9 >> 2] = 47; //@line 829
  HEAP32[$AsyncCtx9 + 4 >> 2] = $1; //@line 831
  HEAP32[$AsyncCtx9 + 8 >> 2] = $0; //@line 833
  HEAP32[$AsyncCtx9 + 12 >> 2] = $59; //@line 835
  HEAP32[$AsyncCtx9 + 16 >> 2] = $70; //@line 837
  HEAP32[$AsyncCtx9 + 20 >> 2] = $65; //@line 839
  HEAP32[$AsyncCtx9 + 24 >> 2] = $60; //@line 841
  HEAP32[$AsyncCtx9 + 28 >> 2] = $77; //@line 843
  sp = STACKTOP; //@line 844
  return;
 }
 _emscripten_free_async_context($AsyncCtx9 | 0); //@line 847
 if (($86 | 0) != (HEAP32[(HEAP32[$1 >> 2] | 0) + 32 >> 2] | 0)) {
  $101 = $86 - (HEAP32[$59 >> 2] | 0) & HEAP32[$70 >> 2]; //@line 856
  HEAP32[$59 >> 2] = $86; //@line 857
  $102 = HEAP32[$65 >> 2] | 0; //@line 858
  L30 : do {
   if (($102 | 0) < 1e6) {
    switch ($102 | 0) {
    case 32768:
     {
      break;
     }
    default:
     {
      label = 22; //@line 867
      break L30;
     }
    }
    $103 = ___muldi3($101 | 0, 0, 1e6, 0) | 0; //@line 871
    $105 = _bitshift64Lshr($103 | 0, tempRet0 | 0, 15) | 0; //@line 873
    $106 = tempRet0; //@line 874
    $109 = $60; //@line 877
    $115 = _i64Add(HEAP32[$109 >> 2] | 0, HEAP32[$109 + 4 >> 2] | 0, $101 * 1e6 & 32704 | 0, 0) | 0; //@line 883
    $116 = tempRet0; //@line 884
    $117 = $60; //@line 885
    HEAP32[$117 >> 2] = $115; //@line 887
    HEAP32[$117 + 4 >> 2] = $116; //@line 890
    if ($116 >>> 0 < 0 | ($116 | 0) == 0 & $115 >>> 0 < 32768) {
     $173 = $105; //@line 897
     $174 = $106; //@line 897
    } else {
     $126 = _i64Add($105 | 0, $106 | 0, 1, 0) | 0; //@line 899
     $127 = tempRet0; //@line 900
     $128 = _i64Add($115 | 0, $116 | 0, -32768, -1) | 0; //@line 901
     $130 = $60; //@line 903
     HEAP32[$130 >> 2] = $128; //@line 905
     HEAP32[$130 + 4 >> 2] = tempRet0; //@line 908
     $173 = $126; //@line 909
     $174 = $127; //@line 909
    }
   } else {
    switch ($102 | 0) {
    case 1e6:
     {
      $173 = $101; //@line 914
      $174 = 0; //@line 914
      break;
     }
    default:
     {
      label = 22; //@line 918
     }
    }
   }
  } while (0);
  if ((label | 0) == 22) {
   $134 = ___muldi3($101 | 0, 0, 1e6, 0) | 0; //@line 924
   $135 = tempRet0; //@line 925
   $136 = ___udivdi3($134 | 0, $135 | 0, $102 | 0, 0) | 0; //@line 926
   $137 = tempRet0; //@line 927
   $138 = ___muldi3($136 | 0, $137 | 0, $102 | 0, 0) | 0; //@line 928
   $140 = _i64Subtract($134 | 0, $135 | 0, $138 | 0, tempRet0 | 0) | 0; //@line 930
   $142 = $60; //@line 932
   $148 = _i64Add($140 | 0, tempRet0 | 0, HEAP32[$142 >> 2] | 0, HEAP32[$142 + 4 >> 2] | 0) | 0; //@line 938
   $149 = tempRet0; //@line 939
   $150 = $60; //@line 940
   HEAP32[$150 >> 2] = $148; //@line 942
   HEAP32[$150 + 4 >> 2] = $149; //@line 945
   if ($149 >>> 0 < 0 | ($149 | 0) == 0 & $148 >>> 0 < $102 >>> 0) {
    $173 = $136; //@line 952
    $174 = $137; //@line 952
   } else {
    $159 = _i64Add($136 | 0, $137 | 0, 1, 0) | 0; //@line 954
    $160 = tempRet0; //@line 955
    $161 = _i64Subtract($148 | 0, $149 | 0, $102 | 0, 0) | 0; //@line 956
    $163 = $60; //@line 958
    HEAP32[$163 >> 2] = $161; //@line 960
    HEAP32[$163 + 4 >> 2] = tempRet0; //@line 963
    $173 = $159; //@line 964
    $174 = $160; //@line 964
   }
  }
  $167 = $77; //@line 967
  $175 = _i64Add(HEAP32[$167 >> 2] | 0, HEAP32[$167 + 4 >> 2] | 0, $173 | 0, $174 | 0) | 0; //@line 973
  $177 = $77; //@line 975
  HEAP32[$177 >> 2] = $175; //@line 977
  HEAP32[$177 + 4 >> 2] = tempRet0; //@line 980
 }
 $AsyncCtx12 = _emscripten_alloc_async_context(4, sp) | 0; //@line 982
 _schedule_interrupt($0); //@line 983
 if (___async) {
  HEAP32[$AsyncCtx12 >> 2] = 48; //@line 986
  sp = STACKTOP; //@line 987
  return;
 }
 _emscripten_free_async_context($AsyncCtx12 | 0); //@line 990
 return;
}
function _schedule_interrupt__async_cb($0) {
 $0 = $0 | 0;
 var $$0$i = 0, $102 = 0, $105 = 0, $107 = 0, $110 = 0, $111 = 0, $113 = 0, $116 = 0, $12 = 0, $124 = 0, $125 = 0, $126 = 0, $128 = 0, $130 = 0, $135 = 0, $142 = 0, $144 = 0, $146 = 0, $149 = 0, $151 = 0, $158 = 0, $159 = 0, $162 = 0, $164 = 0, $166 = 0, $167 = 0, $168 = 0, $169 = 0, $17 = 0, $177 = 0, $180 = 0, $19 = 0, $2 = 0, $20 = 0, $22 = 0, $23 = 0, $26 = 0, $27 = 0, $33 = 0, $34 = 0, $35 = 0, $4 = 0, $44 = 0, $45 = 0, $46 = 0, $48 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $58 = 0, $60 = 0, $61 = 0, $67 = 0, $68 = 0, $69 = 0, $78 = 0, $79 = 0, $8 = 0, $80 = 0, $82 = 0, $86 = 0, $87 = 0, $9 = 0, $93 = 0, $94 = 0, $95 = 0, $97 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx2 = 0, $ReallocAsyncCtx3 = 0, $ReallocAsyncCtx4 = 0, $ReallocAsyncCtx7 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 11728
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 11730
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 11732
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 11736
 $8 = HEAP32[HEAP32[$0 + 12 >> 2] >> 2] | 0; //@line 11737
 $9 = $8 + 32 | 0; //@line 11738
 if (($AsyncRetVal | 0) != (HEAP32[$9 >> 2] | 0)) {
  $12 = $2 + 32 | 0; //@line 11742
  $17 = $AsyncRetVal - (HEAP32[$12 >> 2] | 0) & HEAP32[$2 + 12 >> 2]; //@line 11747
  HEAP32[$12 >> 2] = $AsyncRetVal; //@line 11748
  $19 = HEAP32[$2 + 8 >> 2] | 0; //@line 11750
  L4 : do {
   if (($19 | 0) < 1e6) {
    switch ($19 | 0) {
    case 32768:
     {
      break;
     }
    default:
     {
      label = 6; //@line 11759
      break L4;
     }
    }
    $20 = ___muldi3($17 | 0, 0, 1e6, 0) | 0; //@line 11763
    $22 = _bitshift64Lshr($20 | 0, tempRet0 | 0, 15) | 0; //@line 11765
    $23 = tempRet0; //@line 11766
    $26 = $2 + 40 | 0; //@line 11769
    $27 = $26; //@line 11770
    $33 = _i64Add(HEAP32[$27 >> 2] | 0, HEAP32[$27 + 4 >> 2] | 0, $17 * 1e6 & 32704 | 0, 0) | 0; //@line 11776
    $34 = tempRet0; //@line 11777
    $35 = $26; //@line 11778
    HEAP32[$35 >> 2] = $33; //@line 11780
    HEAP32[$35 + 4 >> 2] = $34; //@line 11783
    if ($34 >>> 0 < 0 | ($34 | 0) == 0 & $33 >>> 0 < 32768) {
     $93 = $22; //@line 11790
     $94 = $23; //@line 11790
    } else {
     $44 = _i64Add($22 | 0, $23 | 0, 1, 0) | 0; //@line 11792
     $45 = tempRet0; //@line 11793
     $46 = _i64Add($33 | 0, $34 | 0, -32768, -1) | 0; //@line 11794
     $48 = $26; //@line 11796
     HEAP32[$48 >> 2] = $46; //@line 11798
     HEAP32[$48 + 4 >> 2] = tempRet0; //@line 11801
     $93 = $44; //@line 11802
     $94 = $45; //@line 11802
    }
   } else {
    switch ($19 | 0) {
    case 1e6:
     {
      $93 = $17; //@line 11807
      $94 = 0; //@line 11807
      break;
     }
    default:
     {
      label = 6; //@line 11811
     }
    }
   }
  } while (0);
  if ((label | 0) == 6) {
   $52 = ___muldi3($17 | 0, 0, 1e6, 0) | 0; //@line 11817
   $53 = tempRet0; //@line 11818
   $54 = ___udivdi3($52 | 0, $53 | 0, $19 | 0, 0) | 0; //@line 11819
   $55 = tempRet0; //@line 11820
   $56 = ___muldi3($54 | 0, $55 | 0, $19 | 0, 0) | 0; //@line 11821
   $58 = _i64Subtract($52 | 0, $53 | 0, $56 | 0, tempRet0 | 0) | 0; //@line 11823
   $60 = $2 + 40 | 0; //@line 11825
   $61 = $60; //@line 11826
   $67 = _i64Add($58 | 0, tempRet0 | 0, HEAP32[$61 >> 2] | 0, HEAP32[$61 + 4 >> 2] | 0) | 0; //@line 11832
   $68 = tempRet0; //@line 11833
   $69 = $60; //@line 11834
   HEAP32[$69 >> 2] = $67; //@line 11836
   HEAP32[$69 + 4 >> 2] = $68; //@line 11839
   if ($68 >>> 0 < 0 | ($68 | 0) == 0 & $67 >>> 0 < $19 >>> 0) {
    $93 = $54; //@line 11846
    $94 = $55; //@line 11846
   } else {
    $78 = _i64Add($54 | 0, $55 | 0, 1, 0) | 0; //@line 11848
    $79 = tempRet0; //@line 11849
    $80 = _i64Subtract($67 | 0, $68 | 0, $19 | 0, 0) | 0; //@line 11850
    $82 = $60; //@line 11852
    HEAP32[$82 >> 2] = $80; //@line 11854
    HEAP32[$82 + 4 >> 2] = tempRet0; //@line 11857
    $93 = $78; //@line 11858
    $94 = $79; //@line 11858
   }
  }
  $86 = $2 + 48 | 0; //@line 11861
  $87 = $86; //@line 11862
  $95 = _i64Add(HEAP32[$87 >> 2] | 0, HEAP32[$87 + 4 >> 2] | 0, $93 | 0, $94 | 0) | 0; //@line 11868
  $97 = $86; //@line 11870
  HEAP32[$97 >> 2] = $95; //@line 11872
  HEAP32[$97 + 4 >> 2] = tempRet0; //@line 11875
 }
 $102 = HEAP32[$8 + 4 >> 2] | 0; //@line 11878
 if (!$102) {
  $177 = (HEAP32[$2 + 16 >> 2] | 0) + (HEAP32[$2 + 32 >> 2] | 0) & HEAP32[$2 + 12 >> 2]; //@line 11888
  $180 = HEAP32[(HEAP32[$4 >> 2] | 0) + 16 >> 2] | 0; //@line 11891
  $ReallocAsyncCtx7 = _emscripten_realloc_async_context(4) | 0; //@line 11892
  FUNCTION_TABLE_vi[$180 & 255]($177); //@line 11893
  if (___async) {
   HEAP32[$ReallocAsyncCtx7 >> 2] = 55; //@line 11896
   sp = STACKTOP; //@line 11897
   return;
  }
  ___async_unwind = 0; //@line 11900
  HEAP32[$ReallocAsyncCtx7 >> 2] = 55; //@line 11901
  sp = STACKTOP; //@line 11902
  return;
 }
 $105 = $8 + 48 | 0; //@line 11906
 $107 = HEAP32[$105 >> 2] | 0; //@line 11908
 $110 = HEAP32[$105 + 4 >> 2] | 0; //@line 11911
 $111 = $102; //@line 11912
 $113 = HEAP32[$111 >> 2] | 0; //@line 11914
 $116 = HEAP32[$111 + 4 >> 2] | 0; //@line 11917
 if (!($116 >>> 0 > $110 >>> 0 | ($116 | 0) == ($110 | 0) & $113 >>> 0 > $107 >>> 0)) {
  $124 = HEAP32[(HEAP32[$4 >> 2] | 0) + 20 >> 2] | 0; //@line 11926
  $ReallocAsyncCtx2 = _emscripten_realloc_async_context(4) | 0; //@line 11927
  FUNCTION_TABLE_v[$124 & 15](); //@line 11928
  if (___async) {
   HEAP32[$ReallocAsyncCtx2 >> 2] = 50; //@line 11931
   sp = STACKTOP; //@line 11932
   return;
  }
  ___async_unwind = 0; //@line 11935
  HEAP32[$ReallocAsyncCtx2 >> 2] = 50; //@line 11936
  sp = STACKTOP; //@line 11937
  return;
 }
 $125 = _i64Subtract($113 | 0, $116 | 0, $107 | 0, $110 | 0) | 0; //@line 11940
 $126 = tempRet0; //@line 11941
 $128 = HEAP32[$8 + 16 >> 2] | 0; //@line 11943
 $130 = $8 + 24 | 0; //@line 11945
 $135 = HEAP32[$130 + 4 >> 2] | 0; //@line 11950
 L28 : do {
  if ($126 >>> 0 > $135 >>> 0 | (($126 | 0) == ($135 | 0) ? $125 >>> 0 > (HEAP32[$130 >> 2] | 0) >>> 0 : 0)) {
   $$0$i = $128; //@line 11958
  } else {
   $142 = HEAP32[$8 + 8 >> 2] | 0; //@line 11961
   L30 : do {
    if (($142 | 0) < 1e6) {
     switch ($142 | 0) {
     case 32768:
      {
       break;
      }
     default:
      {
       break L30;
      }
     }
     $144 = _bitshift64Shl($125 | 0, $126 | 0, 15) | 0; //@line 11973
     $146 = ___udivdi3($144 | 0, tempRet0 | 0, 1e6, 0) | 0; //@line 11975
     $$0$i = $128 >>> 0 < $146 >>> 0 ? $128 : $146; //@line 11979
     break L28;
    } else {
     switch ($142 | 0) {
     case 1e6:
      {
       break;
      }
     default:
      {
       break L30;
      }
     }
     $$0$i = $128 >>> 0 < $125 >>> 0 ? $128 : $125; //@line 11992
     break L28;
    }
   } while (0);
   $149 = ___muldi3($125 | 0, $126 | 0, $142 | 0, 0) | 0; //@line 11996
   $151 = ___udivdi3($149 | 0, tempRet0 | 0, 1e6, 0) | 0; //@line 11998
   $$0$i = $128 >>> 0 < $151 >>> 0 ? $128 : $151; //@line 12002
  }
 } while (0);
 $158 = (HEAP32[$9 >> 2] | 0) + $$0$i & HEAP32[$8 + 12 >> 2]; //@line 12009
 $159 = $2 + 32 | 0; //@line 12010
 $162 = HEAP32[$4 >> 2] | 0; //@line 12013
 if (($158 | 0) == (HEAP32[$159 >> 2] | 0)) {
  $164 = HEAP32[$162 + 20 >> 2] | 0; //@line 12016
  $ReallocAsyncCtx3 = _emscripten_realloc_async_context(4) | 0; //@line 12017
  FUNCTION_TABLE_v[$164 & 15](); //@line 12018
  if (___async) {
   HEAP32[$ReallocAsyncCtx3 >> 2] = 51; //@line 12021
   sp = STACKTOP; //@line 12022
   return;
  }
  ___async_unwind = 0; //@line 12025
  HEAP32[$ReallocAsyncCtx3 >> 2] = 51; //@line 12026
  sp = STACKTOP; //@line 12027
  return;
 } else {
  $166 = HEAP32[$162 + 16 >> 2] | 0; //@line 12031
  $ReallocAsyncCtx4 = _emscripten_realloc_async_context(16) | 0; //@line 12032
  FUNCTION_TABLE_vi[$166 & 255]($158); //@line 12033
  if (___async) {
   HEAP32[$ReallocAsyncCtx4 >> 2] = 52; //@line 12036
   $167 = $ReallocAsyncCtx4 + 4 | 0; //@line 12037
   HEAP32[$167 >> 2] = $4; //@line 12038
   $168 = $ReallocAsyncCtx4 + 8 | 0; //@line 12039
   HEAP32[$168 >> 2] = $159; //@line 12040
   $169 = $ReallocAsyncCtx4 + 12 | 0; //@line 12041
   HEAP32[$169 >> 2] = $158; //@line 12042
   sp = STACKTOP; //@line 12043
   return;
  }
  ___async_unwind = 0; //@line 12046
  HEAP32[$ReallocAsyncCtx4 >> 2] = 52; //@line 12047
  $167 = $ReallocAsyncCtx4 + 4 | 0; //@line 12048
  HEAP32[$167 >> 2] = $4; //@line 12049
  $168 = $ReallocAsyncCtx4 + 8 | 0; //@line 12050
  HEAP32[$168 >> 2] = $159; //@line 12051
  $169 = $ReallocAsyncCtx4 + 12 | 0; //@line 12052
  HEAP32[$169 >> 2] = $158; //@line 12053
  sp = STACKTOP; //@line 12054
  return;
 }
}
function _mbed_die() {
 var $0 = 0, $AsyncCtx = 0, $AsyncCtx11 = 0, $AsyncCtx15 = 0, $AsyncCtx19 = 0, $AsyncCtx23 = 0, $AsyncCtx27 = 0, $AsyncCtx3 = 0, $AsyncCtx31 = 0, $AsyncCtx35 = 0, $AsyncCtx39 = 0, $AsyncCtx43 = 0, $AsyncCtx47 = 0, $AsyncCtx51 = 0, $AsyncCtx55 = 0, $AsyncCtx59 = 0, $AsyncCtx7 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 1469
 STACKTOP = STACKTOP + 32 | 0; //@line 1470
 $0 = sp; //@line 1471
 _gpio_init_out($0, 50); //@line 1472
 while (1) {
  _emscripten_asm_const_iii(0, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 1475
  $AsyncCtx59 = _emscripten_alloc_async_context(8, sp) | 0; //@line 1476
  _wait_ms(150); //@line 1477
  if (___async) {
   label = 3; //@line 1480
   break;
  }
  _emscripten_free_async_context($AsyncCtx59 | 0); //@line 1483
  _emscripten_asm_const_iii(0, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 1485
  $AsyncCtx55 = _emscripten_alloc_async_context(8, sp) | 0; //@line 1486
  _wait_ms(150); //@line 1487
  if (___async) {
   label = 5; //@line 1490
   break;
  }
  _emscripten_free_async_context($AsyncCtx55 | 0); //@line 1493
  _emscripten_asm_const_iii(0, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 1495
  $AsyncCtx51 = _emscripten_alloc_async_context(8, sp) | 0; //@line 1496
  _wait_ms(150); //@line 1497
  if (___async) {
   label = 7; //@line 1500
   break;
  }
  _emscripten_free_async_context($AsyncCtx51 | 0); //@line 1503
  _emscripten_asm_const_iii(0, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 1505
  $AsyncCtx47 = _emscripten_alloc_async_context(8, sp) | 0; //@line 1506
  _wait_ms(150); //@line 1507
  if (___async) {
   label = 9; //@line 1510
   break;
  }
  _emscripten_free_async_context($AsyncCtx47 | 0); //@line 1513
  _emscripten_asm_const_iii(0, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 1515
  $AsyncCtx43 = _emscripten_alloc_async_context(8, sp) | 0; //@line 1516
  _wait_ms(150); //@line 1517
  if (___async) {
   label = 11; //@line 1520
   break;
  }
  _emscripten_free_async_context($AsyncCtx43 | 0); //@line 1523
  _emscripten_asm_const_iii(0, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 1525
  $AsyncCtx39 = _emscripten_alloc_async_context(8, sp) | 0; //@line 1526
  _wait_ms(150); //@line 1527
  if (___async) {
   label = 13; //@line 1530
   break;
  }
  _emscripten_free_async_context($AsyncCtx39 | 0); //@line 1533
  _emscripten_asm_const_iii(0, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 1535
  $AsyncCtx35 = _emscripten_alloc_async_context(8, sp) | 0; //@line 1536
  _wait_ms(150); //@line 1537
  if (___async) {
   label = 15; //@line 1540
   break;
  }
  _emscripten_free_async_context($AsyncCtx35 | 0); //@line 1543
  _emscripten_asm_const_iii(0, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 1545
  $AsyncCtx31 = _emscripten_alloc_async_context(8, sp) | 0; //@line 1546
  _wait_ms(150); //@line 1547
  if (___async) {
   label = 17; //@line 1550
   break;
  }
  _emscripten_free_async_context($AsyncCtx31 | 0); //@line 1553
  _emscripten_asm_const_iii(0, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 1555
  $AsyncCtx27 = _emscripten_alloc_async_context(8, sp) | 0; //@line 1556
  _wait_ms(400); //@line 1557
  if (___async) {
   label = 19; //@line 1560
   break;
  }
  _emscripten_free_async_context($AsyncCtx27 | 0); //@line 1563
  _emscripten_asm_const_iii(0, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 1565
  $AsyncCtx23 = _emscripten_alloc_async_context(8, sp) | 0; //@line 1566
  _wait_ms(400); //@line 1567
  if (___async) {
   label = 21; //@line 1570
   break;
  }
  _emscripten_free_async_context($AsyncCtx23 | 0); //@line 1573
  _emscripten_asm_const_iii(0, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 1575
  $AsyncCtx19 = _emscripten_alloc_async_context(8, sp) | 0; //@line 1576
  _wait_ms(400); //@line 1577
  if (___async) {
   label = 23; //@line 1580
   break;
  }
  _emscripten_free_async_context($AsyncCtx19 | 0); //@line 1583
  _emscripten_asm_const_iii(0, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 1585
  $AsyncCtx15 = _emscripten_alloc_async_context(8, sp) | 0; //@line 1586
  _wait_ms(400); //@line 1587
  if (___async) {
   label = 25; //@line 1590
   break;
  }
  _emscripten_free_async_context($AsyncCtx15 | 0); //@line 1593
  _emscripten_asm_const_iii(0, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 1595
  $AsyncCtx11 = _emscripten_alloc_async_context(8, sp) | 0; //@line 1596
  _wait_ms(400); //@line 1597
  if (___async) {
   label = 27; //@line 1600
   break;
  }
  _emscripten_free_async_context($AsyncCtx11 | 0); //@line 1603
  _emscripten_asm_const_iii(0, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 1605
  $AsyncCtx7 = _emscripten_alloc_async_context(8, sp) | 0; //@line 1606
  _wait_ms(400); //@line 1607
  if (___async) {
   label = 29; //@line 1610
   break;
  }
  _emscripten_free_async_context($AsyncCtx7 | 0); //@line 1613
  _emscripten_asm_const_iii(0, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 1615
  $AsyncCtx3 = _emscripten_alloc_async_context(8, sp) | 0; //@line 1616
  _wait_ms(400); //@line 1617
  if (___async) {
   label = 31; //@line 1620
   break;
  }
  _emscripten_free_async_context($AsyncCtx3 | 0); //@line 1623
  _emscripten_asm_const_iii(0, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 1625
  $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 1626
  _wait_ms(400); //@line 1627
  if (___async) {
   label = 33; //@line 1630
   break;
  }
  _emscripten_free_async_context($AsyncCtx | 0); //@line 1633
 }
 switch (label | 0) {
 case 3:
  {
   HEAP32[$AsyncCtx59 >> 2] = 58; //@line 1637
   HEAP32[$AsyncCtx59 + 4 >> 2] = $0; //@line 1639
   sp = STACKTOP; //@line 1640
   STACKTOP = sp; //@line 1641
   return;
  }
 case 5:
  {
   HEAP32[$AsyncCtx55 >> 2] = 59; //@line 1645
   HEAP32[$AsyncCtx55 + 4 >> 2] = $0; //@line 1647
   sp = STACKTOP; //@line 1648
   STACKTOP = sp; //@line 1649
   return;
  }
 case 7:
  {
   HEAP32[$AsyncCtx51 >> 2] = 60; //@line 1653
   HEAP32[$AsyncCtx51 + 4 >> 2] = $0; //@line 1655
   sp = STACKTOP; //@line 1656
   STACKTOP = sp; //@line 1657
   return;
  }
 case 9:
  {
   HEAP32[$AsyncCtx47 >> 2] = 61; //@line 1661
   HEAP32[$AsyncCtx47 + 4 >> 2] = $0; //@line 1663
   sp = STACKTOP; //@line 1664
   STACKTOP = sp; //@line 1665
   return;
  }
 case 11:
  {
   HEAP32[$AsyncCtx43 >> 2] = 62; //@line 1669
   HEAP32[$AsyncCtx43 + 4 >> 2] = $0; //@line 1671
   sp = STACKTOP; //@line 1672
   STACKTOP = sp; //@line 1673
   return;
  }
 case 13:
  {
   HEAP32[$AsyncCtx39 >> 2] = 63; //@line 1677
   HEAP32[$AsyncCtx39 + 4 >> 2] = $0; //@line 1679
   sp = STACKTOP; //@line 1680
   STACKTOP = sp; //@line 1681
   return;
  }
 case 15:
  {
   HEAP32[$AsyncCtx35 >> 2] = 64; //@line 1685
   HEAP32[$AsyncCtx35 + 4 >> 2] = $0; //@line 1687
   sp = STACKTOP; //@line 1688
   STACKTOP = sp; //@line 1689
   return;
  }
 case 17:
  {
   HEAP32[$AsyncCtx31 >> 2] = 65; //@line 1693
   HEAP32[$AsyncCtx31 + 4 >> 2] = $0; //@line 1695
   sp = STACKTOP; //@line 1696
   STACKTOP = sp; //@line 1697
   return;
  }
 case 19:
  {
   HEAP32[$AsyncCtx27 >> 2] = 66; //@line 1701
   HEAP32[$AsyncCtx27 + 4 >> 2] = $0; //@line 1703
   sp = STACKTOP; //@line 1704
   STACKTOP = sp; //@line 1705
   return;
  }
 case 21:
  {
   HEAP32[$AsyncCtx23 >> 2] = 67; //@line 1709
   HEAP32[$AsyncCtx23 + 4 >> 2] = $0; //@line 1711
   sp = STACKTOP; //@line 1712
   STACKTOP = sp; //@line 1713
   return;
  }
 case 23:
  {
   HEAP32[$AsyncCtx19 >> 2] = 68; //@line 1717
   HEAP32[$AsyncCtx19 + 4 >> 2] = $0; //@line 1719
   sp = STACKTOP; //@line 1720
   STACKTOP = sp; //@line 1721
   return;
  }
 case 25:
  {
   HEAP32[$AsyncCtx15 >> 2] = 69; //@line 1725
   HEAP32[$AsyncCtx15 + 4 >> 2] = $0; //@line 1727
   sp = STACKTOP; //@line 1728
   STACKTOP = sp; //@line 1729
   return;
  }
 case 27:
  {
   HEAP32[$AsyncCtx11 >> 2] = 70; //@line 1733
   HEAP32[$AsyncCtx11 + 4 >> 2] = $0; //@line 1735
   sp = STACKTOP; //@line 1736
   STACKTOP = sp; //@line 1737
   return;
  }
 case 29:
  {
   HEAP32[$AsyncCtx7 >> 2] = 71; //@line 1741
   HEAP32[$AsyncCtx7 + 4 >> 2] = $0; //@line 1743
   sp = STACKTOP; //@line 1744
   STACKTOP = sp; //@line 1745
   return;
  }
 case 31:
  {
   HEAP32[$AsyncCtx3 >> 2] = 72; //@line 1749
   HEAP32[$AsyncCtx3 + 4 >> 2] = $0; //@line 1751
   sp = STACKTOP; //@line 1752
   STACKTOP = sp; //@line 1753
   return;
  }
 case 33:
  {
   HEAP32[$AsyncCtx >> 2] = 73; //@line 1757
   HEAP32[$AsyncCtx + 4 >> 2] = $0; //@line 1759
   sp = STACKTOP; //@line 1760
   STACKTOP = sp; //@line 1761
   return;
  }
 }
}
function _main() {
 var $0 = 0, $1 = 0, $13 = 0, $17 = 0, $2 = 0, $22 = 0, $25 = 0, $29 = 0, $33 = 0, $37 = 0, $40 = 0, $43 = 0, $47 = 0, $50 = 0, $53 = 0, $AsyncCtx = 0, $AsyncCtx11 = 0, $AsyncCtx15 = 0, $AsyncCtx19 = 0, $AsyncCtx22 = 0, $AsyncCtx25 = 0, $AsyncCtx28 = 0, $AsyncCtx3 = 0, $AsyncCtx31 = 0, $AsyncCtx7 = 0, sp = 0;
 sp = STACKTOP; //@line 2229
 STACKTOP = STACKTOP + 48 | 0; //@line 2230
 $0 = sp + 32 | 0; //@line 2231
 $1 = sp + 16 | 0; //@line 2232
 $2 = sp; //@line 2233
 $AsyncCtx19 = _emscripten_alloc_async_context(16, sp) | 0; //@line 2234
 _puts(1934) | 0; //@line 2235
 if (___async) {
  HEAP32[$AsyncCtx19 >> 2] = 89; //@line 2238
  HEAP32[$AsyncCtx19 + 4 >> 2] = $0; //@line 2240
  HEAP32[$AsyncCtx19 + 8 >> 2] = $2; //@line 2242
  HEAP32[$AsyncCtx19 + 12 >> 2] = $1; //@line 2244
  sp = STACKTOP; //@line 2245
  STACKTOP = sp; //@line 2246
  return 0; //@line 2246
 }
 _emscripten_free_async_context($AsyncCtx19 | 0); //@line 2248
 $AsyncCtx15 = _emscripten_alloc_async_context(16, sp) | 0; //@line 2249
 _puts(1947) | 0; //@line 2250
 if (___async) {
  HEAP32[$AsyncCtx15 >> 2] = 90; //@line 2253
  HEAP32[$AsyncCtx15 + 4 >> 2] = $0; //@line 2255
  HEAP32[$AsyncCtx15 + 8 >> 2] = $2; //@line 2257
  HEAP32[$AsyncCtx15 + 12 >> 2] = $1; //@line 2259
  sp = STACKTOP; //@line 2260
  STACKTOP = sp; //@line 2261
  return 0; //@line 2261
 }
 _emscripten_free_async_context($AsyncCtx15 | 0); //@line 2263
 $AsyncCtx11 = _emscripten_alloc_async_context(16, sp) | 0; //@line 2264
 _puts(2050) | 0; //@line 2265
 if (___async) {
  HEAP32[$AsyncCtx11 >> 2] = 91; //@line 2268
  HEAP32[$AsyncCtx11 + 4 >> 2] = $0; //@line 2270
  HEAP32[$AsyncCtx11 + 8 >> 2] = $2; //@line 2272
  HEAP32[$AsyncCtx11 + 12 >> 2] = $1; //@line 2274
  sp = STACKTOP; //@line 2275
  STACKTOP = sp; //@line 2276
  return 0; //@line 2276
 }
 _emscripten_free_async_context($AsyncCtx11 | 0); //@line 2278
 $13 = $0 + 4 | 0; //@line 2280
 HEAP32[$13 >> 2] = 0; //@line 2282
 HEAP32[$13 + 4 >> 2] = 0; //@line 2285
 HEAP32[$0 >> 2] = 7; //@line 2286
 $17 = $0 + 12 | 0; //@line 2287
 HEAP32[$17 >> 2] = 440; //@line 2288
 $AsyncCtx25 = _emscripten_alloc_async_context(20, sp) | 0; //@line 2289
 __ZN4mbed6Ticker6attachENS_8CallbackIFvvEEEf(5088, $0, 1.0); //@line 2290
 if (___async) {
  HEAP32[$AsyncCtx25 >> 2] = 92; //@line 2293
  HEAP32[$AsyncCtx25 + 4 >> 2] = $0; //@line 2295
  HEAP32[$AsyncCtx25 + 8 >> 2] = $17; //@line 2297
  HEAP32[$AsyncCtx25 + 12 >> 2] = $2; //@line 2299
  HEAP32[$AsyncCtx25 + 16 >> 2] = $1; //@line 2301
  sp = STACKTOP; //@line 2302
  STACKTOP = sp; //@line 2303
  return 0; //@line 2303
 }
 _emscripten_free_async_context($AsyncCtx25 | 0); //@line 2305
 $22 = HEAP32[$17 >> 2] | 0; //@line 2306
 do {
  if ($22 | 0) {
   $25 = HEAP32[$22 + 8 >> 2] | 0; //@line 2311
   $AsyncCtx = _emscripten_alloc_async_context(12, sp) | 0; //@line 2312
   FUNCTION_TABLE_vi[$25 & 255]($0); //@line 2313
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 93; //@line 2316
    HEAP32[$AsyncCtx + 4 >> 2] = $1; //@line 2318
    HEAP32[$AsyncCtx + 8 >> 2] = $2; //@line 2320
    sp = STACKTOP; //@line 2321
    STACKTOP = sp; //@line 2322
    return 0; //@line 2322
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 2324
    break;
   }
  }
 } while (0);
 $29 = $1 + 4 | 0; //@line 2330
 HEAP32[$29 >> 2] = 0; //@line 2332
 HEAP32[$29 + 4 >> 2] = 0; //@line 2335
 HEAP32[$1 >> 2] = 8; //@line 2336
 $33 = $1 + 12 | 0; //@line 2337
 HEAP32[$33 >> 2] = 440; //@line 2338
 $AsyncCtx22 = _emscripten_alloc_async_context(16, sp) | 0; //@line 2339
 __ZN4mbed6Ticker6attachENS_8CallbackIFvvEEEf(5152, $1, 2.5); //@line 2340
 if (___async) {
  HEAP32[$AsyncCtx22 >> 2] = 94; //@line 2343
  HEAP32[$AsyncCtx22 + 4 >> 2] = $33; //@line 2345
  HEAP32[$AsyncCtx22 + 8 >> 2] = $2; //@line 2347
  HEAP32[$AsyncCtx22 + 12 >> 2] = $1; //@line 2349
  sp = STACKTOP; //@line 2350
  STACKTOP = sp; //@line 2351
  return 0; //@line 2351
 }
 _emscripten_free_async_context($AsyncCtx22 | 0); //@line 2353
 $37 = HEAP32[$33 >> 2] | 0; //@line 2354
 do {
  if ($37 | 0) {
   $40 = HEAP32[$37 + 8 >> 2] | 0; //@line 2359
   $AsyncCtx3 = _emscripten_alloc_async_context(8, sp) | 0; //@line 2360
   FUNCTION_TABLE_vi[$40 & 255]($1); //@line 2361
   if (___async) {
    HEAP32[$AsyncCtx3 >> 2] = 95; //@line 2364
    HEAP32[$AsyncCtx3 + 4 >> 2] = $2; //@line 2366
    sp = STACKTOP; //@line 2367
    STACKTOP = sp; //@line 2368
    return 0; //@line 2368
   } else {
    _emscripten_free_async_context($AsyncCtx3 | 0); //@line 2370
    break;
   }
  }
 } while (0);
 $43 = $2 + 4 | 0; //@line 2376
 HEAP32[$43 >> 2] = 0; //@line 2378
 HEAP32[$43 + 4 >> 2] = 0; //@line 2381
 HEAP32[$2 >> 2] = 9; //@line 2382
 $47 = $2 + 12 | 0; //@line 2383
 HEAP32[$47 >> 2] = 440; //@line 2384
 $AsyncCtx28 = _emscripten_alloc_async_context(12, sp) | 0; //@line 2385
 __ZN4mbed11InterruptIn4fallENS_8CallbackIFvvEEE(5292, $2); //@line 2386
 if (___async) {
  HEAP32[$AsyncCtx28 >> 2] = 96; //@line 2389
  HEAP32[$AsyncCtx28 + 4 >> 2] = $47; //@line 2391
  HEAP32[$AsyncCtx28 + 8 >> 2] = $2; //@line 2393
  sp = STACKTOP; //@line 2394
  STACKTOP = sp; //@line 2395
  return 0; //@line 2395
 }
 _emscripten_free_async_context($AsyncCtx28 | 0); //@line 2397
 $50 = HEAP32[$47 >> 2] | 0; //@line 2398
 do {
  if ($50 | 0) {
   $53 = HEAP32[$50 + 8 >> 2] | 0; //@line 2403
   $AsyncCtx7 = _emscripten_alloc_async_context(4, sp) | 0; //@line 2404
   FUNCTION_TABLE_vi[$53 & 255]($2); //@line 2405
   if (___async) {
    HEAP32[$AsyncCtx7 >> 2] = 97; //@line 2408
    sp = STACKTOP; //@line 2409
    STACKTOP = sp; //@line 2410
    return 0; //@line 2410
   } else {
    _emscripten_free_async_context($AsyncCtx7 | 0); //@line 2412
    break;
   }
  }
 } while (0);
 $AsyncCtx31 = _emscripten_alloc_async_context(4, sp) | 0; //@line 2417
 _wait_ms(-1); //@line 2418
 if (___async) {
  HEAP32[$AsyncCtx31 >> 2] = 98; //@line 2421
  sp = STACKTOP; //@line 2422
  STACKTOP = sp; //@line 2423
  return 0; //@line 2423
 } else {
  _emscripten_free_async_context($AsyncCtx31 | 0); //@line 2425
  STACKTOP = sp; //@line 2426
  return 0; //@line 2426
 }
 return 0; //@line 2428
}
function __ZN4mbed6Ticker6attachENS_8CallbackIFvvEEEf__async_cb($0) {
 $0 = $0 | 0;
 var $10 = 0.0, $11 = 0, $12 = 0, $13 = 0, $15 = 0, $16 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $30 = 0, $31 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $48 = 0, $6 = 0.0, $8 = 0, $9 = 0, $ReallocAsyncCtx2 = 0, $ReallocAsyncCtx3 = 0, $ReallocAsyncCtx4 = 0, sp = 0;
 sp = STACKTOP; //@line 11382
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 11386
 $6 = +HEAPF32[$0 + 12 >> 2]; //@line 11388
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 11390
 $9 = $4 + 12 | 0; //@line 11392
 HEAP32[$9 >> 2] = HEAP32[HEAP32[$0 + 4 >> 2] >> 2]; //@line 11393
 $10 = $6 * 1.0e6; //@line 11394
 $11 = ~~$10 >>> 0; //@line 11395
 $12 = +Math_abs($10) >= 1.0 ? $10 > 0.0 ? ~~+Math_min(+Math_floor($10 / 4294967296.0), 4294967295.0) >>> 0 : ~~+Math_ceil(($10 - +(~~$10 >>> 0)) / 4294967296.0) >>> 0 : 0; //@line 11396
 $13 = $8 + 40 | 0; //@line 11397
 do {
  if (($13 | 0) != ($4 | 0)) {
   $15 = $8 + 52 | 0; //@line 11401
   $16 = HEAP32[$15 >> 2] | 0; //@line 11402
   if ($16 | 0) {
    $19 = HEAP32[$16 + 8 >> 2] | 0; //@line 11406
    $ReallocAsyncCtx2 = _emscripten_realloc_async_context(40) | 0; //@line 11407
    FUNCTION_TABLE_vi[$19 & 255]($13); //@line 11408
    if (___async) {
     HEAP32[$ReallocAsyncCtx2 >> 2] = 100; //@line 11411
     $20 = $ReallocAsyncCtx2 + 4 | 0; //@line 11412
     HEAP32[$20 >> 2] = $9; //@line 11413
     $21 = $ReallocAsyncCtx2 + 8 | 0; //@line 11414
     HEAP32[$21 >> 2] = $15; //@line 11415
     $22 = $ReallocAsyncCtx2 + 12 | 0; //@line 11416
     HEAP32[$22 >> 2] = $13; //@line 11417
     $23 = $ReallocAsyncCtx2 + 16 | 0; //@line 11418
     HEAP32[$23 >> 2] = $4; //@line 11419
     $24 = $ReallocAsyncCtx2 + 20 | 0; //@line 11420
     HEAP32[$24 >> 2] = $9; //@line 11421
     $25 = $ReallocAsyncCtx2 + 24 | 0; //@line 11422
     HEAP32[$25 >> 2] = $8; //@line 11423
     $26 = $ReallocAsyncCtx2 + 32 | 0; //@line 11424
     $27 = $26; //@line 11425
     $28 = $27; //@line 11426
     HEAP32[$28 >> 2] = $11; //@line 11427
     $29 = $27 + 4 | 0; //@line 11428
     $30 = $29; //@line 11429
     HEAP32[$30 >> 2] = $12; //@line 11430
     sp = STACKTOP; //@line 11431
     return;
    }
    ___async_unwind = 0; //@line 11434
    HEAP32[$ReallocAsyncCtx2 >> 2] = 100; //@line 11435
    $20 = $ReallocAsyncCtx2 + 4 | 0; //@line 11436
    HEAP32[$20 >> 2] = $9; //@line 11437
    $21 = $ReallocAsyncCtx2 + 8 | 0; //@line 11438
    HEAP32[$21 >> 2] = $15; //@line 11439
    $22 = $ReallocAsyncCtx2 + 12 | 0; //@line 11440
    HEAP32[$22 >> 2] = $13; //@line 11441
    $23 = $ReallocAsyncCtx2 + 16 | 0; //@line 11442
    HEAP32[$23 >> 2] = $4; //@line 11443
    $24 = $ReallocAsyncCtx2 + 20 | 0; //@line 11444
    HEAP32[$24 >> 2] = $9; //@line 11445
    $25 = $ReallocAsyncCtx2 + 24 | 0; //@line 11446
    HEAP32[$25 >> 2] = $8; //@line 11447
    $26 = $ReallocAsyncCtx2 + 32 | 0; //@line 11448
    $27 = $26; //@line 11449
    $28 = $27; //@line 11450
    HEAP32[$28 >> 2] = $11; //@line 11451
    $29 = $27 + 4 | 0; //@line 11452
    $30 = $29; //@line 11453
    HEAP32[$30 >> 2] = $12; //@line 11454
    sp = STACKTOP; //@line 11455
    return;
   }
   $31 = HEAP32[$9 >> 2] | 0; //@line 11458
   if (!$31) {
    HEAP32[$15 >> 2] = 0; //@line 11461
    break;
   }
   $34 = HEAP32[$31 + 4 >> 2] | 0; //@line 11465
   $ReallocAsyncCtx3 = _emscripten_realloc_async_context(32) | 0; //@line 11466
   FUNCTION_TABLE_vii[$34 & 3]($13, $4); //@line 11467
   if (___async) {
    HEAP32[$ReallocAsyncCtx3 >> 2] = 101; //@line 11470
    $35 = $ReallocAsyncCtx3 + 4 | 0; //@line 11471
    HEAP32[$35 >> 2] = $9; //@line 11472
    $36 = $ReallocAsyncCtx3 + 8 | 0; //@line 11473
    HEAP32[$36 >> 2] = $15; //@line 11474
    $37 = $ReallocAsyncCtx3 + 12 | 0; //@line 11475
    HEAP32[$37 >> 2] = $8; //@line 11476
    $38 = $ReallocAsyncCtx3 + 16 | 0; //@line 11477
    $39 = $38; //@line 11478
    $40 = $39; //@line 11479
    HEAP32[$40 >> 2] = $11; //@line 11480
    $41 = $39 + 4 | 0; //@line 11481
    $42 = $41; //@line 11482
    HEAP32[$42 >> 2] = $12; //@line 11483
    $43 = $ReallocAsyncCtx3 + 24 | 0; //@line 11484
    HEAP32[$43 >> 2] = $9; //@line 11485
    $44 = $ReallocAsyncCtx3 + 28 | 0; //@line 11486
    HEAP32[$44 >> 2] = $4; //@line 11487
    sp = STACKTOP; //@line 11488
    return;
   }
   ___async_unwind = 0; //@line 11491
   HEAP32[$ReallocAsyncCtx3 >> 2] = 101; //@line 11492
   $35 = $ReallocAsyncCtx3 + 4 | 0; //@line 11493
   HEAP32[$35 >> 2] = $9; //@line 11494
   $36 = $ReallocAsyncCtx3 + 8 | 0; //@line 11495
   HEAP32[$36 >> 2] = $15; //@line 11496
   $37 = $ReallocAsyncCtx3 + 12 | 0; //@line 11497
   HEAP32[$37 >> 2] = $8; //@line 11498
   $38 = $ReallocAsyncCtx3 + 16 | 0; //@line 11499
   $39 = $38; //@line 11500
   $40 = $39; //@line 11501
   HEAP32[$40 >> 2] = $11; //@line 11502
   $41 = $39 + 4 | 0; //@line 11503
   $42 = $41; //@line 11504
   HEAP32[$42 >> 2] = $12; //@line 11505
   $43 = $ReallocAsyncCtx3 + 24 | 0; //@line 11506
   HEAP32[$43 >> 2] = $9; //@line 11507
   $44 = $ReallocAsyncCtx3 + 28 | 0; //@line 11508
   HEAP32[$44 >> 2] = $4; //@line 11509
   sp = STACKTOP; //@line 11510
   return;
  }
 } while (0);
 __ZN4mbed6Ticker5setupEy($8, $11, $12); //@line 11514
 $45 = HEAP32[$9 >> 2] | 0; //@line 11515
 if (!$45) {
  return;
 }
 $48 = HEAP32[$45 + 8 >> 2] | 0; //@line 11521
 $ReallocAsyncCtx4 = _emscripten_realloc_async_context(4) | 0; //@line 11522
 FUNCTION_TABLE_vi[$48 & 255]($4); //@line 11523
 if (___async) {
  HEAP32[$ReallocAsyncCtx4 >> 2] = 102; //@line 11526
  sp = STACKTOP; //@line 11527
  return;
 }
 ___async_unwind = 0; //@line 11530
 HEAP32[$ReallocAsyncCtx4 >> 2] = 102; //@line 11531
 sp = STACKTOP; //@line 11532
 return;
}
function _initialize__async_cb_53($0) {
 $0 = $0 | 0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $15 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $27 = 0, $29 = 0, $30 = 0, $31 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $6 = 0, $8 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx3 = 0, $ReallocAsyncCtx6 = 0, $ReallocAsyncCtx7 = 0, sp = 0;
 sp = STACKTOP; //@line 5
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 7
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 9
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 11
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 13
 $8 = HEAP32[$AsyncRetVal >> 2] | 0; //@line 14
 if (!$8) {
  $ReallocAsyncCtx7 = _emscripten_realloc_async_context(20) | 0; //@line 17
  _mbed_assert_internal(1255, 1257, 41); //@line 18
  if (___async) {
   HEAP32[$ReallocAsyncCtx7 >> 2] = 44; //@line 21
   $10 = $ReallocAsyncCtx7 + 4 | 0; //@line 22
   HEAP32[$10 >> 2] = $4; //@line 23
   $11 = $ReallocAsyncCtx7 + 8 | 0; //@line 24
   HEAP32[$11 >> 2] = $2; //@line 25
   $12 = $ReallocAsyncCtx7 + 12 | 0; //@line 26
   HEAP32[$12 >> 2] = $6; //@line 27
   $13 = $ReallocAsyncCtx7 + 16 | 0; //@line 28
   HEAP32[$13 >> 2] = $AsyncRetVal; //@line 29
   sp = STACKTOP; //@line 30
   return;
  }
  ___async_unwind = 0; //@line 33
  HEAP32[$ReallocAsyncCtx7 >> 2] = 44; //@line 34
  $10 = $ReallocAsyncCtx7 + 4 | 0; //@line 35
  HEAP32[$10 >> 2] = $4; //@line 36
  $11 = $ReallocAsyncCtx7 + 8 | 0; //@line 37
  HEAP32[$11 >> 2] = $2; //@line 38
  $12 = $ReallocAsyncCtx7 + 12 | 0; //@line 39
  HEAP32[$12 >> 2] = $6; //@line 40
  $13 = $ReallocAsyncCtx7 + 16 | 0; //@line 41
  HEAP32[$13 >> 2] = $AsyncRetVal; //@line 42
  sp = STACKTOP; //@line 43
  return;
 }
 $15 = HEAP32[$AsyncRetVal + 4 >> 2] | 0; //@line 47
 if (($15 + -4 | 0) >>> 0 > 28) {
  $ReallocAsyncCtx6 = _emscripten_realloc_async_context(20) | 0; //@line 51
  _mbed_assert_internal(1255, 1257, 47); //@line 52
  if (___async) {
   HEAP32[$ReallocAsyncCtx6 >> 2] = 45; //@line 55
   $17 = $ReallocAsyncCtx6 + 4 | 0; //@line 56
   HEAP32[$17 >> 2] = $8; //@line 57
   $18 = $ReallocAsyncCtx6 + 8 | 0; //@line 58
   HEAP32[$18 >> 2] = $4; //@line 59
   $19 = $ReallocAsyncCtx6 + 12 | 0; //@line 60
   HEAP32[$19 >> 2] = $6; //@line 61
   $20 = $ReallocAsyncCtx6 + 16 | 0; //@line 62
   HEAP32[$20 >> 2] = $2; //@line 63
   sp = STACKTOP; //@line 64
   return;
  }
  ___async_unwind = 0; //@line 67
  HEAP32[$ReallocAsyncCtx6 >> 2] = 45; //@line 68
  $17 = $ReallocAsyncCtx6 + 4 | 0; //@line 69
  HEAP32[$17 >> 2] = $8; //@line 70
  $18 = $ReallocAsyncCtx6 + 8 | 0; //@line 71
  HEAP32[$18 >> 2] = $4; //@line 72
  $19 = $ReallocAsyncCtx6 + 12 | 0; //@line 73
  HEAP32[$19 >> 2] = $6; //@line 74
  $20 = $ReallocAsyncCtx6 + 16 | 0; //@line 75
  HEAP32[$20 >> 2] = $2; //@line 76
  sp = STACKTOP; //@line 77
  return;
 } else {
  $22 = 7 << $15 + -4; //@line 81
  $23 = ___muldi3($22 | 0, 0, 1e6, 0) | 0; //@line 82
  $24 = tempRet0; //@line 83
  $25 = _i64Add($8 | 0, 0, -1, -1) | 0; //@line 84
  $27 = _i64Add($25 | 0, tempRet0 | 0, $23 | 0, $24 | 0) | 0; //@line 86
  $29 = ___udivdi3($27 | 0, tempRet0 | 0, $8 | 0, 0) | 0; //@line 88
  $30 = tempRet0; //@line 89
  $31 = HEAP32[$4 >> 2] | 0; //@line 90
  HEAP32[$31 >> 2] = 0; //@line 91
  HEAP32[$31 + 4 >> 2] = 0; //@line 93
  $35 = HEAP32[(HEAP32[$6 >> 2] | 0) + 4 >> 2] | 0; //@line 96
  $ReallocAsyncCtx3 = _emscripten_realloc_async_context(40) | 0; //@line 97
  $36 = FUNCTION_TABLE_i[$35 & 3]() | 0; //@line 98
  if (___async) {
   HEAP32[$ReallocAsyncCtx3 >> 2] = 46; //@line 101
   $37 = $ReallocAsyncCtx3 + 4 | 0; //@line 102
   HEAP32[$37 >> 2] = $4; //@line 103
   $38 = $ReallocAsyncCtx3 + 8 | 0; //@line 104
   HEAP32[$38 >> 2] = $8; //@line 105
   $39 = $ReallocAsyncCtx3 + 12 | 0; //@line 106
   HEAP32[$39 >> 2] = $15; //@line 107
   $40 = $ReallocAsyncCtx3 + 16 | 0; //@line 108
   HEAP32[$40 >> 2] = $22; //@line 109
   $41 = $ReallocAsyncCtx3 + 24 | 0; //@line 110
   $42 = $41; //@line 111
   $43 = $42; //@line 112
   HEAP32[$43 >> 2] = $29; //@line 113
   $44 = $42 + 4 | 0; //@line 114
   $45 = $44; //@line 115
   HEAP32[$45 >> 2] = $30; //@line 116
   $46 = $ReallocAsyncCtx3 + 32 | 0; //@line 117
   HEAP32[$46 >> 2] = $6; //@line 118
   $47 = $ReallocAsyncCtx3 + 36 | 0; //@line 119
   HEAP32[$47 >> 2] = $2; //@line 120
   sp = STACKTOP; //@line 121
   return;
  }
  HEAP32[___async_retval >> 2] = $36; //@line 125
  ___async_unwind = 0; //@line 126
  HEAP32[$ReallocAsyncCtx3 >> 2] = 46; //@line 127
  $37 = $ReallocAsyncCtx3 + 4 | 0; //@line 128
  HEAP32[$37 >> 2] = $4; //@line 129
  $38 = $ReallocAsyncCtx3 + 8 | 0; //@line 130
  HEAP32[$38 >> 2] = $8; //@line 131
  $39 = $ReallocAsyncCtx3 + 12 | 0; //@line 132
  HEAP32[$39 >> 2] = $15; //@line 133
  $40 = $ReallocAsyncCtx3 + 16 | 0; //@line 134
  HEAP32[$40 >> 2] = $22; //@line 135
  $41 = $ReallocAsyncCtx3 + 24 | 0; //@line 136
  $42 = $41; //@line 137
  $43 = $42; //@line 138
  HEAP32[$43 >> 2] = $29; //@line 139
  $44 = $42 + 4 | 0; //@line 140
  $45 = $44; //@line 141
  HEAP32[$45 >> 2] = $30; //@line 142
  $46 = $ReallocAsyncCtx3 + 32 | 0; //@line 143
  HEAP32[$46 >> 2] = $6; //@line 144
  $47 = $ReallocAsyncCtx3 + 36 | 0; //@line 145
  HEAP32[$47 >> 2] = $2; //@line 146
  sp = STACKTOP; //@line 147
  return;
 }
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
     FUNCTION_TABLE_vi[$12 & 255]($6); //@line 256
     if (___async) {
      HEAP32[$AsyncCtx >> 2] = 27; //@line 259
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
      HEAP32[$AsyncCtx2 >> 2] = 28; //@line 295
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
    FUNCTION_TABLE_vi[$33 & 255]($27); //@line 330
    if (___async) {
     HEAP32[$AsyncCtx5 >> 2] = 29; //@line 333
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
      HEAP32[$AsyncCtx8 >> 2] = 30; //@line 358
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
     FUNCTION_TABLE_vi[$49 & 255]($2); //@line 381
     if (___async) {
      HEAP32[$AsyncCtx11 >> 2] = 31; //@line 384
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
function __ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_52($0) {
 $0 = $0 | 0;
 var $$085$off0$reg2mem$0 = 0, $$182$off0 = 0, $$186$off0 = 0, $$283$off0 = 0, $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $2 = 0, $20 = 0, $22 = 0, $24 = 0, $26 = 0, $28 = 0, $30 = 0, $4 = 0, $59 = 0, $6 = 0, $67 = 0, $8 = 0, $ReallocAsyncCtx5 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 13916
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 13918
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 13920
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 13922
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 13924
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 13926
 $12 = HEAP8[$0 + 24 >> 0] & 1; //@line 13929
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 13931
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 13933
 $18 = HEAP8[$0 + 36 >> 0] & 1; //@line 13936
 $20 = HEAP8[$0 + 37 >> 0] & 1; //@line 13939
 $22 = HEAP32[$0 + 40 >> 2] | 0; //@line 13941
 $24 = HEAP32[$0 + 44 >> 2] | 0; //@line 13943
 $26 = HEAP32[$0 + 48 >> 2] | 0; //@line 13945
 $28 = HEAP32[$0 + 52 >> 2] | 0; //@line 13947
 L2 : do {
  if (!(HEAP8[$26 >> 0] | 0)) {
   do {
    if (!(HEAP8[$6 >> 0] | 0)) {
     $$182$off0 = $20; //@line 13956
     $$186$off0 = $18; //@line 13956
    } else {
     if (!(HEAP8[$4 >> 0] | 0)) {
      if (!(HEAP32[$16 >> 2] & 1)) {
       $$085$off0$reg2mem$0 = $18; //@line 13965
       $$283$off0 = 1; //@line 13965
       label = 13; //@line 13966
       break L2;
      } else {
       $$182$off0 = 1; //@line 13969
       $$186$off0 = $18; //@line 13969
       break;
      }
     }
     if ((HEAP32[$14 >> 2] | 0) == 1) {
      label = 18; //@line 13976
      break L2;
     }
     if (!(HEAP32[$16 >> 2] & 2)) {
      label = 18; //@line 13983
      break L2;
     } else {
      $$182$off0 = 1; //@line 13986
      $$186$off0 = 1; //@line 13986
     }
    }
   } while (0);
   $30 = $22 + 8 | 0; //@line 13990
   if ($30 >>> 0 < $2 >>> 0) {
    HEAP8[$4 >> 0] = 0; //@line 13993
    HEAP8[$6 >> 0] = 0; //@line 13994
    $ReallocAsyncCtx5 = _emscripten_realloc_async_context(56) | 0; //@line 13995
    __ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($30, $8, $10, $10, 1, $12); //@line 13996
    if (!___async) {
     ___async_unwind = 0; //@line 13999
    }
    HEAP32[$ReallocAsyncCtx5 >> 2] = 124; //@line 14001
    HEAP32[$ReallocAsyncCtx5 + 4 >> 2] = $2; //@line 14003
    HEAP32[$ReallocAsyncCtx5 + 8 >> 2] = $4; //@line 14005
    HEAP32[$ReallocAsyncCtx5 + 12 >> 2] = $6; //@line 14007
    HEAP32[$ReallocAsyncCtx5 + 16 >> 2] = $8; //@line 14009
    HEAP32[$ReallocAsyncCtx5 + 20 >> 2] = $10; //@line 14011
    HEAP8[$ReallocAsyncCtx5 + 24 >> 0] = $12 & 1; //@line 14014
    HEAP32[$ReallocAsyncCtx5 + 28 >> 2] = $14; //@line 14016
    HEAP32[$ReallocAsyncCtx5 + 32 >> 2] = $16; //@line 14018
    HEAP8[$ReallocAsyncCtx5 + 36 >> 0] = $$186$off0 & 1; //@line 14021
    HEAP8[$ReallocAsyncCtx5 + 37 >> 0] = $$182$off0 & 1; //@line 14024
    HEAP32[$ReallocAsyncCtx5 + 40 >> 2] = $30; //@line 14026
    HEAP32[$ReallocAsyncCtx5 + 44 >> 2] = $24; //@line 14028
    HEAP32[$ReallocAsyncCtx5 + 48 >> 2] = $26; //@line 14030
    HEAP32[$ReallocAsyncCtx5 + 52 >> 2] = $28; //@line 14032
    sp = STACKTOP; //@line 14033
    return;
   } else {
    $$085$off0$reg2mem$0 = $$186$off0; //@line 14036
    $$283$off0 = $$182$off0; //@line 14036
    label = 13; //@line 14037
   }
  } else {
   $$085$off0$reg2mem$0 = $18; //@line 14040
   $$283$off0 = $20; //@line 14040
   label = 13; //@line 14041
  }
 } while (0);
 do {
  if ((label | 0) == 13) {
   if (!$$085$off0$reg2mem$0) {
    HEAP32[$24 >> 2] = $10; //@line 14047
    $59 = $8 + 40 | 0; //@line 14048
    HEAP32[$59 >> 2] = (HEAP32[$59 >> 2] | 0) + 1; //@line 14051
    if ((HEAP32[$8 + 36 >> 2] | 0) == 1) {
     if ((HEAP32[$14 >> 2] | 0) == 2) {
      HEAP8[$26 >> 0] = 1; //@line 14059
      if ($$283$off0) {
       label = 18; //@line 14061
       break;
      } else {
       $67 = 4; //@line 14064
       break;
      }
     }
    }
   }
   if ($$283$off0) {
    label = 18; //@line 14071
   } else {
    $67 = 4; //@line 14073
   }
  }
 } while (0);
 if ((label | 0) == 18) {
  $67 = 3; //@line 14078
 }
 HEAP32[$28 >> 2] = $67; //@line 14080
 return;
}
function __ZN4mbed6Ticker6attachENS_8CallbackIFvvEEEf($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = +$2;
 var $13 = 0, $14 = 0, $15 = 0.0, $16 = 0, $17 = 0, $18 = 0, $20 = 0, $21 = 0, $24 = 0, $3 = 0, $32 = 0, $36 = 0, $39 = 0, $4 = 0, $44 = 0, $5 = 0, $50 = 0, $51 = 0, $54 = 0, $8 = 0, $AsyncCtx = 0, $AsyncCtx10 = 0, $AsyncCtx3 = 0, $AsyncCtx6 = 0, sp = 0;
 sp = STACKTOP; //@line 2438
 STACKTOP = STACKTOP + 16 | 0; //@line 2439
 $3 = sp; //@line 2440
 $4 = $1 + 12 | 0; //@line 2441
 $5 = HEAP32[$4 >> 2] | 0; //@line 2442
 do {
  if (!$5) {
   $14 = 0; //@line 2446
  } else {
   $8 = HEAP32[$5 + 4 >> 2] | 0; //@line 2449
   $AsyncCtx = _emscripten_alloc_async_context(20, sp) | 0; //@line 2450
   FUNCTION_TABLE_vii[$8 & 3]($3, $1); //@line 2451
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 99; //@line 2454
    HEAP32[$AsyncCtx + 4 >> 2] = $4; //@line 2456
    HEAP32[$AsyncCtx + 8 >> 2] = $3; //@line 2458
    HEAPF32[$AsyncCtx + 12 >> 2] = $2; //@line 2460
    HEAP32[$AsyncCtx + 16 >> 2] = $0; //@line 2462
    sp = STACKTOP; //@line 2463
    STACKTOP = sp; //@line 2464
    return;
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 2466
    $14 = HEAP32[$4 >> 2] | 0; //@line 2468
    break;
   }
  }
 } while (0);
 $13 = $3 + 12 | 0; //@line 2473
 HEAP32[$13 >> 2] = $14; //@line 2474
 $15 = $2 * 1.0e6; //@line 2475
 $16 = ~~$15 >>> 0; //@line 2476
 $17 = +Math_abs($15) >= 1.0 ? $15 > 0.0 ? ~~+Math_min(+Math_floor($15 / 4294967296.0), 4294967295.0) >>> 0 : ~~+Math_ceil(($15 - +(~~$15 >>> 0)) / 4294967296.0) >>> 0 : 0; //@line 2477
 $18 = $0 + 40 | 0; //@line 2478
 if (($18 | 0) != ($3 | 0)) {
  $20 = $0 + 52 | 0; //@line 2481
  $21 = HEAP32[$20 >> 2] | 0; //@line 2482
  do {
   if ($21 | 0) {
    $24 = HEAP32[$21 + 8 >> 2] | 0; //@line 2487
    $AsyncCtx3 = _emscripten_alloc_async_context(40, sp) | 0; //@line 2488
    FUNCTION_TABLE_vi[$24 & 255]($18); //@line 2489
    if (___async) {
     HEAP32[$AsyncCtx3 >> 2] = 100; //@line 2492
     HEAP32[$AsyncCtx3 + 4 >> 2] = $13; //@line 2494
     HEAP32[$AsyncCtx3 + 8 >> 2] = $20; //@line 2496
     HEAP32[$AsyncCtx3 + 12 >> 2] = $18; //@line 2498
     HEAP32[$AsyncCtx3 + 16 >> 2] = $3; //@line 2500
     HEAP32[$AsyncCtx3 + 20 >> 2] = $13; //@line 2502
     HEAP32[$AsyncCtx3 + 24 >> 2] = $0; //@line 2504
     $32 = $AsyncCtx3 + 32 | 0; //@line 2506
     HEAP32[$32 >> 2] = $16; //@line 2508
     HEAP32[$32 + 4 >> 2] = $17; //@line 2511
     sp = STACKTOP; //@line 2512
     STACKTOP = sp; //@line 2513
     return;
    } else {
     _emscripten_free_async_context($AsyncCtx3 | 0); //@line 2515
     break;
    }
   }
  } while (0);
  $36 = HEAP32[$13 >> 2] | 0; //@line 2520
  do {
   if (!$36) {
    $50 = 0; //@line 2524
   } else {
    $39 = HEAP32[$36 + 4 >> 2] | 0; //@line 2527
    $AsyncCtx6 = _emscripten_alloc_async_context(32, sp) | 0; //@line 2528
    FUNCTION_TABLE_vii[$39 & 3]($18, $3); //@line 2529
    if (___async) {
     HEAP32[$AsyncCtx6 >> 2] = 101; //@line 2532
     HEAP32[$AsyncCtx6 + 4 >> 2] = $13; //@line 2534
     HEAP32[$AsyncCtx6 + 8 >> 2] = $20; //@line 2536
     HEAP32[$AsyncCtx6 + 12 >> 2] = $0; //@line 2538
     $44 = $AsyncCtx6 + 16 | 0; //@line 2540
     HEAP32[$44 >> 2] = $16; //@line 2542
     HEAP32[$44 + 4 >> 2] = $17; //@line 2545
     HEAP32[$AsyncCtx6 + 24 >> 2] = $13; //@line 2547
     HEAP32[$AsyncCtx6 + 28 >> 2] = $3; //@line 2549
     sp = STACKTOP; //@line 2550
     STACKTOP = sp; //@line 2551
     return;
    } else {
     _emscripten_free_async_context($AsyncCtx6 | 0); //@line 2553
     $50 = HEAP32[$13 >> 2] | 0; //@line 2555
     break;
    }
   }
  } while (0);
  HEAP32[$20 >> 2] = $50; //@line 2560
 }
 __ZN4mbed6Ticker5setupEy($0, $16, $17); //@line 2562
 $51 = HEAP32[$13 >> 2] | 0; //@line 2563
 if (!$51) {
  STACKTOP = sp; //@line 2566
  return;
 }
 $54 = HEAP32[$51 + 8 >> 2] | 0; //@line 2569
 $AsyncCtx10 = _emscripten_alloc_async_context(4, sp) | 0; //@line 2570
 FUNCTION_TABLE_vi[$54 & 255]($3); //@line 2571
 if (___async) {
  HEAP32[$AsyncCtx10 >> 2] = 102; //@line 2574
  sp = STACKTOP; //@line 2575
  STACKTOP = sp; //@line 2576
  return;
 }
 _emscripten_free_async_context($AsyncCtx10 | 0); //@line 2578
 STACKTOP = sp; //@line 2579
 return;
}
function _initialize__async_cb_58($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $22 = 0, $24 = 0, $25 = 0, $26 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $6 = 0, $ReallocAsyncCtx3 = 0, $ReallocAsyncCtx6 = 0, sp = 0;
 sp = STACKTOP; //@line 527
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 529
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 531
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 533
 $10 = HEAP32[(HEAP32[$0 + 16 >> 2] | 0) + 4 >> 2] | 0; //@line 537
 if (($10 + -4 | 0) >>> 0 > 28) {
  $ReallocAsyncCtx6 = _emscripten_realloc_async_context(20) | 0; //@line 541
  _mbed_assert_internal(1255, 1257, 47); //@line 542
  if (___async) {
   HEAP32[$ReallocAsyncCtx6 >> 2] = 45; //@line 545
   $12 = $ReallocAsyncCtx6 + 4 | 0; //@line 546
   HEAP32[$12 >> 2] = 1e6; //@line 547
   $13 = $ReallocAsyncCtx6 + 8 | 0; //@line 548
   HEAP32[$13 >> 2] = $2; //@line 549
   $14 = $ReallocAsyncCtx6 + 12 | 0; //@line 550
   HEAP32[$14 >> 2] = $6; //@line 551
   $15 = $ReallocAsyncCtx6 + 16 | 0; //@line 552
   HEAP32[$15 >> 2] = $4; //@line 553
   sp = STACKTOP; //@line 554
   return;
  }
  ___async_unwind = 0; //@line 557
  HEAP32[$ReallocAsyncCtx6 >> 2] = 45; //@line 558
  $12 = $ReallocAsyncCtx6 + 4 | 0; //@line 559
  HEAP32[$12 >> 2] = 1e6; //@line 560
  $13 = $ReallocAsyncCtx6 + 8 | 0; //@line 561
  HEAP32[$13 >> 2] = $2; //@line 562
  $14 = $ReallocAsyncCtx6 + 12 | 0; //@line 563
  HEAP32[$14 >> 2] = $6; //@line 564
  $15 = $ReallocAsyncCtx6 + 16 | 0; //@line 565
  HEAP32[$15 >> 2] = $4; //@line 566
  sp = STACKTOP; //@line 567
  return;
 } else {
  $17 = 7 << $10 + -4; //@line 571
  $18 = ___muldi3($17 | 0, 0, 1e6, 0) | 0; //@line 572
  $19 = tempRet0; //@line 573
  $20 = _i64Add(1e6, 0, -1, -1) | 0; //@line 574
  $22 = _i64Add($20 | 0, tempRet0 | 0, $18 | 0, $19 | 0) | 0; //@line 576
  $24 = ___udivdi3($22 | 0, tempRet0 | 0, 1e6, 0) | 0; //@line 578
  $25 = tempRet0; //@line 579
  $26 = HEAP32[$2 >> 2] | 0; //@line 580
  HEAP32[$26 >> 2] = 0; //@line 581
  HEAP32[$26 + 4 >> 2] = 0; //@line 583
  $30 = HEAP32[(HEAP32[$6 >> 2] | 0) + 4 >> 2] | 0; //@line 586
  $ReallocAsyncCtx3 = _emscripten_realloc_async_context(40) | 0; //@line 587
  $31 = FUNCTION_TABLE_i[$30 & 3]() | 0; //@line 588
  if (___async) {
   HEAP32[$ReallocAsyncCtx3 >> 2] = 46; //@line 591
   $32 = $ReallocAsyncCtx3 + 4 | 0; //@line 592
   HEAP32[$32 >> 2] = $2; //@line 593
   $33 = $ReallocAsyncCtx3 + 8 | 0; //@line 594
   HEAP32[$33 >> 2] = 1e6; //@line 595
   $34 = $ReallocAsyncCtx3 + 12 | 0; //@line 596
   HEAP32[$34 >> 2] = $10; //@line 597
   $35 = $ReallocAsyncCtx3 + 16 | 0; //@line 598
   HEAP32[$35 >> 2] = $17; //@line 599
   $36 = $ReallocAsyncCtx3 + 24 | 0; //@line 600
   $37 = $36; //@line 601
   $38 = $37; //@line 602
   HEAP32[$38 >> 2] = $24; //@line 603
   $39 = $37 + 4 | 0; //@line 604
   $40 = $39; //@line 605
   HEAP32[$40 >> 2] = $25; //@line 606
   $41 = $ReallocAsyncCtx3 + 32 | 0; //@line 607
   HEAP32[$41 >> 2] = $6; //@line 608
   $42 = $ReallocAsyncCtx3 + 36 | 0; //@line 609
   HEAP32[$42 >> 2] = $4; //@line 610
   sp = STACKTOP; //@line 611
   return;
  }
  HEAP32[___async_retval >> 2] = $31; //@line 615
  ___async_unwind = 0; //@line 616
  HEAP32[$ReallocAsyncCtx3 >> 2] = 46; //@line 617
  $32 = $ReallocAsyncCtx3 + 4 | 0; //@line 618
  HEAP32[$32 >> 2] = $2; //@line 619
  $33 = $ReallocAsyncCtx3 + 8 | 0; //@line 620
  HEAP32[$33 >> 2] = 1e6; //@line 621
  $34 = $ReallocAsyncCtx3 + 12 | 0; //@line 622
  HEAP32[$34 >> 2] = $10; //@line 623
  $35 = $ReallocAsyncCtx3 + 16 | 0; //@line 624
  HEAP32[$35 >> 2] = $17; //@line 625
  $36 = $ReallocAsyncCtx3 + 24 | 0; //@line 626
  $37 = $36; //@line 627
  $38 = $37; //@line 628
  HEAP32[$38 >> 2] = $24; //@line 629
  $39 = $37 + 4 | 0; //@line 630
  $40 = $39; //@line 631
  HEAP32[$40 >> 2] = $25; //@line 632
  $41 = $ReallocAsyncCtx3 + 32 | 0; //@line 633
  HEAP32[$41 >> 2] = $6; //@line 634
  $42 = $ReallocAsyncCtx3 + 36 | 0; //@line 635
  HEAP32[$42 >> 2] = $4; //@line 636
  sp = STACKTOP; //@line 637
  return;
 }
}
function __ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_51($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $15 = 0, $18 = 0, $2 = 0, $21 = 0, $24 = 0, $36 = 0, $37 = 0, $38 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx = 0, $ReallocAsyncCtx2 = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 13760
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 13762
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 13764
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 13766
 $8 = HEAP8[$0 + 16 >> 0] & 1; //@line 13769
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 13771
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 13773
 $15 = $12 + 24 | 0; //@line 13776
 do {
  if ((HEAP32[$0 + 28 >> 2] | 0) > 1) {
   $18 = HEAP32[$12 + 8 >> 2] | 0; //@line 13781
   if (!($18 & 2)) {
    $21 = $2 + 36 | 0; //@line 13785
    if ((HEAP32[$21 >> 2] | 0) != 1) {
     if (!($18 & 1)) {
      $38 = $2 + 54 | 0; //@line 13792
      if (HEAP8[$38 >> 0] | 0) {
       break;
      }
      if ((HEAP32[$21 >> 2] | 0) == 1) {
       break;
      }
      $ReallocAsyncCtx = _emscripten_realloc_async_context(36) | 0; //@line 13803
      __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($15, $2, $4, $6, $8); //@line 13804
      if (!___async) {
       ___async_unwind = 0; //@line 13807
      }
      HEAP32[$ReallocAsyncCtx >> 2] = 128; //@line 13809
      HEAP32[$ReallocAsyncCtx + 4 >> 2] = $15; //@line 13811
      HEAP32[$ReallocAsyncCtx + 8 >> 2] = $10; //@line 13813
      HEAP32[$ReallocAsyncCtx + 12 >> 2] = $38; //@line 13815
      HEAP32[$ReallocAsyncCtx + 16 >> 2] = $21; //@line 13817
      HEAP32[$ReallocAsyncCtx + 20 >> 2] = $2; //@line 13819
      HEAP32[$ReallocAsyncCtx + 24 >> 2] = $4; //@line 13821
      HEAP32[$ReallocAsyncCtx + 28 >> 2] = $6; //@line 13823
      HEAP8[$ReallocAsyncCtx + 32 >> 0] = $8 & 1; //@line 13826
      sp = STACKTOP; //@line 13827
      return;
     }
     $36 = $2 + 24 | 0; //@line 13830
     $37 = $2 + 54 | 0; //@line 13831
     if (HEAP8[$37 >> 0] | 0) {
      break;
     }
     if ((HEAP32[$21 >> 2] | 0) == 1) {
      if ((HEAP32[$36 >> 2] | 0) == 1) {
       break;
      }
     }
     $ReallocAsyncCtx2 = _emscripten_realloc_async_context(40) | 0; //@line 13846
     __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($15, $2, $4, $6, $8); //@line 13847
     if (!___async) {
      ___async_unwind = 0; //@line 13850
     }
     HEAP32[$ReallocAsyncCtx2 >> 2] = 127; //@line 13852
     HEAP32[$ReallocAsyncCtx2 + 4 >> 2] = $15; //@line 13854
     HEAP32[$ReallocAsyncCtx2 + 8 >> 2] = $10; //@line 13856
     HEAP32[$ReallocAsyncCtx2 + 12 >> 2] = $37; //@line 13858
     HEAP32[$ReallocAsyncCtx2 + 16 >> 2] = $21; //@line 13860
     HEAP32[$ReallocAsyncCtx2 + 20 >> 2] = $36; //@line 13862
     HEAP32[$ReallocAsyncCtx2 + 24 >> 2] = $2; //@line 13864
     HEAP32[$ReallocAsyncCtx2 + 28 >> 2] = $4; //@line 13866
     HEAP32[$ReallocAsyncCtx2 + 32 >> 2] = $6; //@line 13868
     HEAP8[$ReallocAsyncCtx2 + 36 >> 0] = $8 & 1; //@line 13871
     sp = STACKTOP; //@line 13872
     return;
    }
   }
   $24 = $2 + 54 | 0; //@line 13876
   if (!(HEAP8[$24 >> 0] | 0)) {
    $ReallocAsyncCtx3 = _emscripten_realloc_async_context(32) | 0; //@line 13880
    __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($15, $2, $4, $6, $8); //@line 13881
    if (!___async) {
     ___async_unwind = 0; //@line 13884
    }
    HEAP32[$ReallocAsyncCtx3 >> 2] = 126; //@line 13886
    HEAP32[$ReallocAsyncCtx3 + 4 >> 2] = $15; //@line 13888
    HEAP32[$ReallocAsyncCtx3 + 8 >> 2] = $10; //@line 13890
    HEAP32[$ReallocAsyncCtx3 + 12 >> 2] = $24; //@line 13892
    HEAP32[$ReallocAsyncCtx3 + 16 >> 2] = $2; //@line 13894
    HEAP32[$ReallocAsyncCtx3 + 20 >> 2] = $4; //@line 13896
    HEAP32[$ReallocAsyncCtx3 + 24 >> 2] = $6; //@line 13898
    HEAP8[$ReallocAsyncCtx3 + 28 >> 0] = $8 & 1; //@line 13901
    sp = STACKTOP; //@line 13902
    return;
   }
  }
 } while (0);
 return;
}
function _initialize__async_cb_55($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $23 = 0, $24 = 0, $25 = 0, $27 = 0, $28 = 0, $31 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $48 = 0, $49 = 0, $50 = 0, $52 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $62 = 0, $64 = 0, $70 = 0, $71 = 0, $72 = 0, $81 = 0, $82 = 0, $83 = 0, $85 = 0, $89 = 0, $95 = 0, $96 = 0, $97 = 0, $99 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx5 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 269
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 273
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 275
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 279
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 281
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 283
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 285
 if (($AsyncRetVal | 0) != (HEAP32[(HEAP32[HEAP32[$0 + 4 >> 2] >> 2] | 0) + 32 >> 2] | 0)) {
  $23 = $AsyncRetVal - (HEAP32[$6 >> 2] | 0) & HEAP32[HEAP32[$0 + 16 >> 2] >> 2]; //@line 294
  HEAP32[$6 >> 2] = $AsyncRetVal; //@line 295
  $24 = HEAP32[$10 >> 2] | 0; //@line 296
  L4 : do {
   if (($24 | 0) < 1e6) {
    switch ($24 | 0) {
    case 32768:
     {
      break;
     }
    default:
     {
      label = 6; //@line 305
      break L4;
     }
    }
    $25 = ___muldi3($23 | 0, 0, 1e6, 0) | 0; //@line 309
    $27 = _bitshift64Lshr($25 | 0, tempRet0 | 0, 15) | 0; //@line 311
    $28 = tempRet0; //@line 312
    $31 = $12; //@line 315
    $37 = _i64Add(HEAP32[$31 >> 2] | 0, HEAP32[$31 + 4 >> 2] | 0, $23 * 1e6 & 32704 | 0, 0) | 0; //@line 321
    $38 = tempRet0; //@line 322
    $39 = $12; //@line 323
    HEAP32[$39 >> 2] = $37; //@line 325
    HEAP32[$39 + 4 >> 2] = $38; //@line 328
    if ($38 >>> 0 < 0 | ($38 | 0) == 0 & $37 >>> 0 < 32768) {
     $95 = $27; //@line 335
     $96 = $28; //@line 335
    } else {
     $48 = _i64Add($27 | 0, $28 | 0, 1, 0) | 0; //@line 337
     $49 = tempRet0; //@line 338
     $50 = _i64Add($37 | 0, $38 | 0, -32768, -1) | 0; //@line 339
     $52 = $12; //@line 341
     HEAP32[$52 >> 2] = $50; //@line 343
     HEAP32[$52 + 4 >> 2] = tempRet0; //@line 346
     $95 = $48; //@line 347
     $96 = $49; //@line 347
    }
   } else {
    switch ($24 | 0) {
    case 1e6:
     {
      $95 = $23; //@line 352
      $96 = 0; //@line 352
      break;
     }
    default:
     {
      label = 6; //@line 356
     }
    }
   }
  } while (0);
  if ((label | 0) == 6) {
   $56 = ___muldi3($23 | 0, 0, 1e6, 0) | 0; //@line 362
   $57 = tempRet0; //@line 363
   $58 = ___udivdi3($56 | 0, $57 | 0, $24 | 0, 0) | 0; //@line 364
   $59 = tempRet0; //@line 365
   $60 = ___muldi3($58 | 0, $59 | 0, $24 | 0, 0) | 0; //@line 366
   $62 = _i64Subtract($56 | 0, $57 | 0, $60 | 0, tempRet0 | 0) | 0; //@line 368
   $64 = $12; //@line 370
   $70 = _i64Add($62 | 0, tempRet0 | 0, HEAP32[$64 >> 2] | 0, HEAP32[$64 + 4 >> 2] | 0) | 0; //@line 376
   $71 = tempRet0; //@line 377
   $72 = $12; //@line 378
   HEAP32[$72 >> 2] = $70; //@line 380
   HEAP32[$72 + 4 >> 2] = $71; //@line 383
   if ($71 >>> 0 < 0 | ($71 | 0) == 0 & $70 >>> 0 < $24 >>> 0) {
    $95 = $58; //@line 390
    $96 = $59; //@line 390
   } else {
    $81 = _i64Add($58 | 0, $59 | 0, 1, 0) | 0; //@line 392
    $82 = tempRet0; //@line 393
    $83 = _i64Subtract($70 | 0, $71 | 0, $24 | 0, 0) | 0; //@line 394
    $85 = $12; //@line 396
    HEAP32[$85 >> 2] = $83; //@line 398
    HEAP32[$85 + 4 >> 2] = tempRet0; //@line 401
    $95 = $81; //@line 402
    $96 = $82; //@line 402
   }
  }
  $89 = $14; //@line 405
  $97 = _i64Add(HEAP32[$89 >> 2] | 0, HEAP32[$89 + 4 >> 2] | 0, $95 | 0, $96 | 0) | 0; //@line 411
  $99 = $14; //@line 413
  HEAP32[$99 >> 2] = $97; //@line 415
  HEAP32[$99 + 4 >> 2] = tempRet0; //@line 418
 }
 $ReallocAsyncCtx5 = _emscripten_realloc_async_context(4) | 0; //@line 420
 _schedule_interrupt($4); //@line 421
 if (___async) {
  HEAP32[$ReallocAsyncCtx5 >> 2] = 48; //@line 424
  sp = STACKTOP; //@line 425
  return;
 }
 ___async_unwind = 0; //@line 428
 HEAP32[$ReallocAsyncCtx5 >> 2] = 48; //@line 429
 sp = STACKTOP; //@line 430
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
 sp = STACKTOP; //@line 10496
 if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, $5) | 0) {
  __ZNK10__cxxabiv117__class_type_info29process_static_type_above_dstEPNS_19__dynamic_cast_infoEPKvS4_i(0, $1, $2, $3, $4); //@line 10501
 } else {
  $9 = $1 + 52 | 0; //@line 10503
  $10 = HEAP8[$9 >> 0] | 0; //@line 10504
  $11 = $1 + 53 | 0; //@line 10505
  $12 = HEAP8[$11 >> 0] | 0; //@line 10506
  $15 = HEAP32[$0 + 12 >> 2] | 0; //@line 10509
  $16 = $0 + 16 + ($15 << 3) | 0; //@line 10510
  HEAP8[$9 >> 0] = 0; //@line 10511
  HEAP8[$11 >> 0] = 0; //@line 10512
  $AsyncCtx3 = _emscripten_alloc_async_context(52, sp) | 0; //@line 10513
  __ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($0 + 16 | 0, $1, $2, $3, $4, $5); //@line 10514
  if (___async) {
   HEAP32[$AsyncCtx3 >> 2] = 122; //@line 10517
   HEAP32[$AsyncCtx3 + 4 >> 2] = $15; //@line 10519
   HEAP32[$AsyncCtx3 + 8 >> 2] = $0; //@line 10521
   HEAP32[$AsyncCtx3 + 12 >> 2] = $1; //@line 10523
   HEAP8[$AsyncCtx3 + 16 >> 0] = $10; //@line 10525
   HEAP32[$AsyncCtx3 + 20 >> 2] = $9; //@line 10527
   HEAP8[$AsyncCtx3 + 24 >> 0] = $12; //@line 10529
   HEAP32[$AsyncCtx3 + 28 >> 2] = $11; //@line 10531
   HEAP32[$AsyncCtx3 + 32 >> 2] = $2; //@line 10533
   HEAP32[$AsyncCtx3 + 36 >> 2] = $3; //@line 10535
   HEAP32[$AsyncCtx3 + 40 >> 2] = $4; //@line 10537
   HEAP8[$AsyncCtx3 + 44 >> 0] = $5 & 1; //@line 10540
   HEAP32[$AsyncCtx3 + 48 >> 2] = $16; //@line 10542
   sp = STACKTOP; //@line 10543
   return;
  }
  _emscripten_free_async_context($AsyncCtx3 | 0); //@line 10546
  L7 : do {
   if (($15 | 0) > 1) {
    $31 = $1 + 24 | 0; //@line 10551
    $32 = $0 + 8 | 0; //@line 10552
    $33 = $1 + 54 | 0; //@line 10553
    $$0 = $0 + 24 | 0; //@line 10554
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
     HEAP8[$9 >> 0] = 0; //@line 10587
     HEAP8[$11 >> 0] = 0; //@line 10588
     $AsyncCtx = _emscripten_alloc_async_context(60, sp) | 0; //@line 10589
     __ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($$0, $1, $2, $3, $4, $5); //@line 10590
     if (___async) {
      break;
     }
     _emscripten_free_async_context($AsyncCtx | 0); //@line 10595
     $62 = $$0 + 8 | 0; //@line 10596
     if ($62 >>> 0 < $16 >>> 0) {
      $$0 = $62; //@line 10599
     } else {
      break L7;
     }
    }
    HEAP32[$AsyncCtx >> 2] = 123; //@line 10604
    HEAP32[$AsyncCtx + 4 >> 2] = $$0; //@line 10606
    HEAP32[$AsyncCtx + 8 >> 2] = $16; //@line 10608
    HEAP32[$AsyncCtx + 12 >> 2] = $33; //@line 10610
    HEAP8[$AsyncCtx + 16 >> 0] = $10; //@line 10612
    HEAP32[$AsyncCtx + 20 >> 2] = $9; //@line 10614
    HEAP8[$AsyncCtx + 24 >> 0] = $12; //@line 10616
    HEAP32[$AsyncCtx + 28 >> 2] = $11; //@line 10618
    HEAP32[$AsyncCtx + 32 >> 2] = $31; //@line 10620
    HEAP32[$AsyncCtx + 36 >> 2] = $32; //@line 10622
    HEAP32[$AsyncCtx + 40 >> 2] = $1; //@line 10624
    HEAP32[$AsyncCtx + 44 >> 2] = $2; //@line 10626
    HEAP32[$AsyncCtx + 48 >> 2] = $3; //@line 10628
    HEAP32[$AsyncCtx + 52 >> 2] = $4; //@line 10630
    HEAP8[$AsyncCtx + 56 >> 0] = $5 & 1; //@line 10633
    sp = STACKTOP; //@line 10634
    return;
   }
  } while (0);
  HEAP8[$9 >> 0] = $10; //@line 10638
  HEAP8[$11 >> 0] = $12; //@line 10639
 }
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
      $9 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 7713
      $10 = HEAP32[$9 >> 2] | 0; //@line 7714
      HEAP32[$2 >> 2] = $9 + 4; //@line 7716
      HEAP32[$0 >> 2] = $10; //@line 7717
      break L1;
      break;
     }
    case 10:
     {
      $16 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 7733
      $17 = HEAP32[$16 >> 2] | 0; //@line 7734
      HEAP32[$2 >> 2] = $16 + 4; //@line 7736
      $20 = $0; //@line 7739
      HEAP32[$20 >> 2] = $17; //@line 7741
      HEAP32[$20 + 4 >> 2] = (($17 | 0) < 0) << 31 >> 31; //@line 7744
      break L1;
      break;
     }
    case 11:
     {
      $29 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 7760
      $30 = HEAP32[$29 >> 2] | 0; //@line 7761
      HEAP32[$2 >> 2] = $29 + 4; //@line 7763
      $31 = $0; //@line 7764
      HEAP32[$31 >> 2] = $30; //@line 7766
      HEAP32[$31 + 4 >> 2] = 0; //@line 7769
      break L1;
      break;
     }
    case 12:
     {
      $40 = (HEAP32[$2 >> 2] | 0) + (8 - 1) & ~(8 - 1); //@line 7785
      $41 = $40; //@line 7786
      $43 = HEAP32[$41 >> 2] | 0; //@line 7788
      $46 = HEAP32[$41 + 4 >> 2] | 0; //@line 7791
      HEAP32[$2 >> 2] = $40 + 8; //@line 7793
      $47 = $0; //@line 7794
      HEAP32[$47 >> 2] = $43; //@line 7796
      HEAP32[$47 + 4 >> 2] = $46; //@line 7799
      break L1;
      break;
     }
    case 13:
     {
      $56 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 7815
      $57 = HEAP32[$56 >> 2] | 0; //@line 7816
      HEAP32[$2 >> 2] = $56 + 4; //@line 7818
      $59 = ($57 & 65535) << 16 >> 16; //@line 7820
      $62 = $0; //@line 7823
      HEAP32[$62 >> 2] = $59; //@line 7825
      HEAP32[$62 + 4 >> 2] = (($59 | 0) < 0) << 31 >> 31; //@line 7828
      break L1;
      break;
     }
    case 14:
     {
      $71 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 7844
      $72 = HEAP32[$71 >> 2] | 0; //@line 7845
      HEAP32[$2 >> 2] = $71 + 4; //@line 7847
      $73 = $0; //@line 7849
      HEAP32[$73 >> 2] = $72 & 65535; //@line 7851
      HEAP32[$73 + 4 >> 2] = 0; //@line 7854
      break L1;
      break;
     }
    case 15:
     {
      $82 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 7870
      $83 = HEAP32[$82 >> 2] | 0; //@line 7871
      HEAP32[$2 >> 2] = $82 + 4; //@line 7873
      $85 = ($83 & 255) << 24 >> 24; //@line 7875
      $88 = $0; //@line 7878
      HEAP32[$88 >> 2] = $85; //@line 7880
      HEAP32[$88 + 4 >> 2] = (($85 | 0) < 0) << 31 >> 31; //@line 7883
      break L1;
      break;
     }
    case 16:
     {
      $97 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 7899
      $98 = HEAP32[$97 >> 2] | 0; //@line 7900
      HEAP32[$2 >> 2] = $97 + 4; //@line 7902
      $99 = $0; //@line 7904
      HEAP32[$99 >> 2] = $98 & 255; //@line 7906
      HEAP32[$99 + 4 >> 2] = 0; //@line 7909
      break L1;
      break;
     }
    case 17:
     {
      $108 = (HEAP32[$2 >> 2] | 0) + (8 - 1) & ~(8 - 1); //@line 7925
      $109 = +HEAPF64[$108 >> 3]; //@line 7926
      HEAP32[$2 >> 2] = $108 + 8; //@line 7928
      HEAPF64[$0 >> 3] = $109; //@line 7929
      break L1;
      break;
     }
    case 18:
     {
      $115 = (HEAP32[$2 >> 2] | 0) + (8 - 1) & ~(8 - 1); //@line 7945
      $116 = +HEAPF64[$115 >> 3]; //@line 7946
      HEAP32[$2 >> 2] = $115 + 8; //@line 7948
      HEAPF64[$0 >> 3] = $116; //@line 7949
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
 sp = STACKTOP; //@line 6613
 STACKTOP = STACKTOP + 224 | 0; //@line 6614
 $3 = sp + 120 | 0; //@line 6615
 $4 = sp + 80 | 0; //@line 6616
 $5 = sp; //@line 6617
 $6 = sp + 136 | 0; //@line 6618
 dest = $4; //@line 6619
 stop = dest + 40 | 0; //@line 6619
 do {
  HEAP32[dest >> 2] = 0; //@line 6619
  dest = dest + 4 | 0; //@line 6619
 } while ((dest | 0) < (stop | 0));
 HEAP32[$3 >> 2] = HEAP32[$2 >> 2]; //@line 6621
 if ((_printf_core(0, $1, $3, $5, $4) | 0) < 0) {
  $$0 = -1; //@line 6625
 } else {
  if ((HEAP32[$0 + 76 >> 2] | 0) > -1) {
   $43 = ___lockfile($0) | 0; //@line 6632
  } else {
   $43 = 0; //@line 6634
  }
  $13 = HEAP32[$0 >> 2] | 0; //@line 6636
  $14 = $13 & 32; //@line 6637
  if ((HEAP8[$0 + 74 >> 0] | 0) < 1) {
   HEAP32[$0 >> 2] = $13 & -33; //@line 6643
  }
  $19 = $0 + 48 | 0; //@line 6645
  do {
   if (!(HEAP32[$19 >> 2] | 0)) {
    $23 = $0 + 44 | 0; //@line 6650
    $24 = HEAP32[$23 >> 2] | 0; //@line 6651
    HEAP32[$23 >> 2] = $6; //@line 6652
    $25 = $0 + 28 | 0; //@line 6653
    HEAP32[$25 >> 2] = $6; //@line 6654
    $26 = $0 + 20 | 0; //@line 6655
    HEAP32[$26 >> 2] = $6; //@line 6656
    HEAP32[$19 >> 2] = 80; //@line 6657
    $28 = $0 + 16 | 0; //@line 6659
    HEAP32[$28 >> 2] = $6 + 80; //@line 6660
    $29 = _printf_core($0, $1, $3, $5, $4) | 0; //@line 6661
    if (!$24) {
     $$1 = $29; //@line 6664
    } else {
     $32 = HEAP32[$0 + 36 >> 2] | 0; //@line 6667
     $AsyncCtx = _emscripten_alloc_async_context(64, sp) | 0; //@line 6668
     FUNCTION_TABLE_iiii[$32 & 7]($0, 0, 0) | 0; //@line 6669
     if (___async) {
      HEAP32[$AsyncCtx >> 2] = 104; //@line 6672
      HEAP32[$AsyncCtx + 4 >> 2] = $26; //@line 6674
      HEAP32[$AsyncCtx + 8 >> 2] = $29; //@line 6676
      HEAP32[$AsyncCtx + 12 >> 2] = $24; //@line 6678
      HEAP32[$AsyncCtx + 16 >> 2] = $23; //@line 6680
      HEAP32[$AsyncCtx + 20 >> 2] = $19; //@line 6682
      HEAP32[$AsyncCtx + 24 >> 2] = $28; //@line 6684
      HEAP32[$AsyncCtx + 28 >> 2] = $25; //@line 6686
      HEAP32[$AsyncCtx + 32 >> 2] = $0; //@line 6688
      HEAP32[$AsyncCtx + 36 >> 2] = $14; //@line 6690
      HEAP32[$AsyncCtx + 40 >> 2] = $43; //@line 6692
      HEAP32[$AsyncCtx + 44 >> 2] = $0; //@line 6694
      HEAP32[$AsyncCtx + 48 >> 2] = $6; //@line 6696
      HEAP32[$AsyncCtx + 52 >> 2] = $5; //@line 6698
      HEAP32[$AsyncCtx + 56 >> 2] = $4; //@line 6700
      HEAP32[$AsyncCtx + 60 >> 2] = $3; //@line 6702
      sp = STACKTOP; //@line 6703
      STACKTOP = sp; //@line 6704
      return 0; //@line 6704
     } else {
      _emscripten_free_async_context($AsyncCtx | 0); //@line 6706
      $$ = (HEAP32[$26 >> 2] | 0) == 0 ? -1 : $29; //@line 6709
      HEAP32[$23 >> 2] = $24; //@line 6710
      HEAP32[$19 >> 2] = 0; //@line 6711
      HEAP32[$28 >> 2] = 0; //@line 6712
      HEAP32[$25 >> 2] = 0; //@line 6713
      HEAP32[$26 >> 2] = 0; //@line 6714
      $$1 = $$; //@line 6715
      break;
     }
    }
   } else {
    $$1 = _printf_core($0, $1, $3, $5, $4) | 0; //@line 6721
   }
  } while (0);
  $51 = HEAP32[$0 >> 2] | 0; //@line 6724
  HEAP32[$0 >> 2] = $51 | $14; //@line 6729
  if ($43 | 0) {
   ___unlockfile($0); //@line 6732
  }
  $$0 = ($51 & 32 | 0) == 0 ? $$1 : -1; //@line 6734
 }
 STACKTOP = sp; //@line 6736
 return $$0 | 0; //@line 6736
}
function ___dynamic_cast($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $$0 = 0, $10 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $24 = 0, $30 = 0, $33 = 0, $4 = 0, $5 = 0, $8 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, dest = 0, sp = 0, stop = 0;
 sp = STACKTOP; //@line 10031
 STACKTOP = STACKTOP + 64 | 0; //@line 10032
 $4 = sp; //@line 10033
 $5 = HEAP32[$0 >> 2] | 0; //@line 10034
 $8 = $0 + (HEAP32[$5 + -8 >> 2] | 0) | 0; //@line 10037
 $10 = HEAP32[$5 + -4 >> 2] | 0; //@line 10039
 HEAP32[$4 >> 2] = $2; //@line 10040
 HEAP32[$4 + 4 >> 2] = $0; //@line 10042
 HEAP32[$4 + 8 >> 2] = $1; //@line 10044
 HEAP32[$4 + 12 >> 2] = $3; //@line 10046
 $14 = $4 + 16 | 0; //@line 10047
 $15 = $4 + 20 | 0; //@line 10048
 $16 = $4 + 24 | 0; //@line 10049
 $17 = $4 + 28 | 0; //@line 10050
 $18 = $4 + 32 | 0; //@line 10051
 $19 = $4 + 40 | 0; //@line 10052
 dest = $14; //@line 10053
 stop = dest + 36 | 0; //@line 10053
 do {
  HEAP32[dest >> 2] = 0; //@line 10053
  dest = dest + 4 | 0; //@line 10053
 } while ((dest | 0) < (stop | 0));
 HEAP16[$14 + 36 >> 1] = 0; //@line 10053
 HEAP8[$14 + 38 >> 0] = 0; //@line 10053
 L1 : do {
  if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($10, $2, 0) | 0) {
   HEAP32[$4 + 48 >> 2] = 1; //@line 10058
   $24 = HEAP32[(HEAP32[$10 >> 2] | 0) + 20 >> 2] | 0; //@line 10061
   $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 10062
   FUNCTION_TABLE_viiiiii[$24 & 3]($10, $4, $8, $8, 1, 0); //@line 10063
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 114; //@line 10066
    HEAP32[$AsyncCtx + 4 >> 2] = $16; //@line 10068
    HEAP32[$AsyncCtx + 8 >> 2] = $8; //@line 10070
    HEAP32[$AsyncCtx + 12 >> 2] = $4; //@line 10072
    sp = STACKTOP; //@line 10073
    STACKTOP = sp; //@line 10074
    return 0; //@line 10074
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 10076
    $$0 = (HEAP32[$16 >> 2] | 0) == 1 ? $8 : 0; //@line 10080
    break;
   }
  } else {
   $30 = $4 + 36 | 0; //@line 10084
   $33 = HEAP32[(HEAP32[$10 >> 2] | 0) + 24 >> 2] | 0; //@line 10087
   $AsyncCtx3 = _emscripten_alloc_async_context(36, sp) | 0; //@line 10088
   FUNCTION_TABLE_viiiii[$33 & 3]($10, $4, $8, 1, 0); //@line 10089
   if (___async) {
    HEAP32[$AsyncCtx3 >> 2] = 115; //@line 10092
    HEAP32[$AsyncCtx3 + 4 >> 2] = $30; //@line 10094
    HEAP32[$AsyncCtx3 + 8 >> 2] = $4; //@line 10096
    HEAP32[$AsyncCtx3 + 12 >> 2] = $19; //@line 10098
    HEAP32[$AsyncCtx3 + 16 >> 2] = $17; //@line 10100
    HEAP32[$AsyncCtx3 + 20 >> 2] = $18; //@line 10102
    HEAP32[$AsyncCtx3 + 24 >> 2] = $15; //@line 10104
    HEAP32[$AsyncCtx3 + 28 >> 2] = $16; //@line 10106
    HEAP32[$AsyncCtx3 + 32 >> 2] = $14; //@line 10108
    sp = STACKTOP; //@line 10109
    STACKTOP = sp; //@line 10110
    return 0; //@line 10110
   }
   _emscripten_free_async_context($AsyncCtx3 | 0); //@line 10112
   switch (HEAP32[$30 >> 2] | 0) {
   case 0:
    {
     $$0 = (HEAP32[$19 >> 2] | 0) == 1 & (HEAP32[$17 >> 2] | 0) == 1 & (HEAP32[$18 >> 2] | 0) == 1 ? HEAP32[$15 >> 2] | 0 : 0; //@line 10126
     break L1;
     break;
    }
   case 1:
    {
     break;
    }
   default:
    {
     $$0 = 0; //@line 10134
     break L1;
    }
   }
   if ((HEAP32[$16 >> 2] | 0) != 1) {
    if (!((HEAP32[$19 >> 2] | 0) == 0 & (HEAP32[$17 >> 2] | 0) == 1 & (HEAP32[$18 >> 2] | 0) == 1)) {
     $$0 = 0; //@line 10150
     break;
    }
   }
   $$0 = HEAP32[$14 >> 2] | 0; //@line 10155
  }
 } while (0);
 STACKTOP = sp; //@line 10158
 return $$0 | 0; //@line 10158
}
function _memchr($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$0$lcssa = 0, $$035$lcssa = 0, $$035$lcssa65 = 0, $$03555 = 0, $$036$lcssa = 0, $$036$lcssa64 = 0, $$03654 = 0, $$046 = 0, $$137$lcssa = 0, $$13745 = 0, $$140 = 0, $$2 = 0, $$23839 = 0, $$3 = 0, $$lcssa = 0, $11 = 0, $12 = 0, $16 = 0, $18 = 0, $20 = 0, $23 = 0, $29 = 0, $3 = 0, $30 = 0, $35 = 0, $7 = 0, $8 = 0, label = 0;
 $3 = $1 & 255; //@line 6485
 $7 = ($2 | 0) != 0; //@line 6489
 L1 : do {
  if ($7 & ($0 & 3 | 0) != 0) {
   $8 = $1 & 255; //@line 6493
   $$03555 = $0; //@line 6494
   $$03654 = $2; //@line 6494
   while (1) {
    if ((HEAP8[$$03555 >> 0] | 0) == $8 << 24 >> 24) {
     $$035$lcssa65 = $$03555; //@line 6499
     $$036$lcssa64 = $$03654; //@line 6499
     label = 6; //@line 6500
     break L1;
    }
    $11 = $$03555 + 1 | 0; //@line 6503
    $12 = $$03654 + -1 | 0; //@line 6504
    $16 = ($12 | 0) != 0; //@line 6508
    if ($16 & ($11 & 3 | 0) != 0) {
     $$03555 = $11; //@line 6511
     $$03654 = $12; //@line 6511
    } else {
     $$035$lcssa = $11; //@line 6513
     $$036$lcssa = $12; //@line 6513
     $$lcssa = $16; //@line 6513
     label = 5; //@line 6514
     break;
    }
   }
  } else {
   $$035$lcssa = $0; //@line 6519
   $$036$lcssa = $2; //@line 6519
   $$lcssa = $7; //@line 6519
   label = 5; //@line 6520
  }
 } while (0);
 if ((label | 0) == 5) {
  if ($$lcssa) {
   $$035$lcssa65 = $$035$lcssa; //@line 6525
   $$036$lcssa64 = $$036$lcssa; //@line 6525
   label = 6; //@line 6526
  } else {
   $$2 = $$035$lcssa; //@line 6528
   $$3 = 0; //@line 6528
  }
 }
 L8 : do {
  if ((label | 0) == 6) {
   $18 = $1 & 255; //@line 6534
   if ((HEAP8[$$035$lcssa65 >> 0] | 0) == $18 << 24 >> 24) {
    $$2 = $$035$lcssa65; //@line 6537
    $$3 = $$036$lcssa64; //@line 6537
   } else {
    $20 = Math_imul($3, 16843009) | 0; //@line 6539
    L11 : do {
     if ($$036$lcssa64 >>> 0 > 3) {
      $$046 = $$035$lcssa65; //@line 6543
      $$13745 = $$036$lcssa64; //@line 6543
      while (1) {
       $23 = HEAP32[$$046 >> 2] ^ $20; //@line 6546
       if (($23 & -2139062144 ^ -2139062144) & $23 + -16843009 | 0) {
        break;
       }
       $29 = $$046 + 4 | 0; //@line 6555
       $30 = $$13745 + -4 | 0; //@line 6556
       if ($30 >>> 0 > 3) {
        $$046 = $29; //@line 6559
        $$13745 = $30; //@line 6559
       } else {
        $$0$lcssa = $29; //@line 6561
        $$137$lcssa = $30; //@line 6561
        label = 11; //@line 6562
        break L11;
       }
      }
      $$140 = $$046; //@line 6566
      $$23839 = $$13745; //@line 6566
     } else {
      $$0$lcssa = $$035$lcssa65; //@line 6568
      $$137$lcssa = $$036$lcssa64; //@line 6568
      label = 11; //@line 6569
     }
    } while (0);
    if ((label | 0) == 11) {
     if (!$$137$lcssa) {
      $$2 = $$0$lcssa; //@line 6575
      $$3 = 0; //@line 6575
      break;
     } else {
      $$140 = $$0$lcssa; //@line 6578
      $$23839 = $$137$lcssa; //@line 6578
     }
    }
    while (1) {
     if ((HEAP8[$$140 >> 0] | 0) == $18 << 24 >> 24) {
      $$2 = $$140; //@line 6585
      $$3 = $$23839; //@line 6585
      break L8;
     }
     $35 = $$140 + 1 | 0; //@line 6588
     $$23839 = $$23839 + -1 | 0; //@line 6589
     if (!$$23839) {
      $$2 = $35; //@line 6592
      $$3 = 0; //@line 6592
      break;
     } else {
      $$140 = $35; //@line 6595
     }
    }
   }
  }
 } while (0);
 return ($$3 | 0 ? $$2 : 0) | 0; //@line 6603
}
function __ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($0, $1, $2, $3, $4) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 var $$037$off038 = 0, $$037$off039 = 0, $13 = 0, $19 = 0, $22 = 0, $23 = 0, $25 = 0, $28 = 0, $39 = 0, $50 = 0, $53 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 10213
 do {
  if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, $4) | 0) {
   __ZNK10__cxxabiv117__class_type_info29process_static_type_below_dstEPNS_19__dynamic_cast_infoEPKvi(0, $1, $2, $3); //@line 10219
  } else {
   if (!(__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 >> 2] | 0, $4) | 0)) {
    $50 = HEAP32[$0 + 8 >> 2] | 0; //@line 10225
    $53 = HEAP32[(HEAP32[$50 >> 2] | 0) + 24 >> 2] | 0; //@line 10228
    $AsyncCtx3 = _emscripten_alloc_async_context(4, sp) | 0; //@line 10229
    FUNCTION_TABLE_viiiii[$53 & 3]($50, $1, $2, $3, $4); //@line 10230
    if (___async) {
     HEAP32[$AsyncCtx3 >> 2] = 118; //@line 10233
     sp = STACKTOP; //@line 10234
     return;
    } else {
     _emscripten_free_async_context($AsyncCtx3 | 0); //@line 10237
     break;
    }
   }
   if ((HEAP32[$1 + 16 >> 2] | 0) != ($2 | 0)) {
    $13 = $1 + 20 | 0; //@line 10245
    if ((HEAP32[$13 >> 2] | 0) != ($2 | 0)) {
     HEAP32[$1 + 32 >> 2] = $3; //@line 10250
     $19 = $1 + 44 | 0; //@line 10251
     if ((HEAP32[$19 >> 2] | 0) == 4) {
      break;
     }
     $22 = $1 + 52 | 0; //@line 10257
     HEAP8[$22 >> 0] = 0; //@line 10258
     $23 = $1 + 53 | 0; //@line 10259
     HEAP8[$23 >> 0] = 0; //@line 10260
     $25 = HEAP32[$0 + 8 >> 2] | 0; //@line 10262
     $28 = HEAP32[(HEAP32[$25 >> 2] | 0) + 20 >> 2] | 0; //@line 10265
     $AsyncCtx = _emscripten_alloc_async_context(28, sp) | 0; //@line 10266
     FUNCTION_TABLE_viiiiii[$28 & 3]($25, $1, $2, $2, 1, $4); //@line 10267
     if (___async) {
      HEAP32[$AsyncCtx >> 2] = 117; //@line 10270
      HEAP32[$AsyncCtx + 4 >> 2] = $23; //@line 10272
      HEAP32[$AsyncCtx + 8 >> 2] = $2; //@line 10274
      HEAP32[$AsyncCtx + 12 >> 2] = $13; //@line 10276
      HEAP32[$AsyncCtx + 16 >> 2] = $1; //@line 10278
      HEAP32[$AsyncCtx + 20 >> 2] = $22; //@line 10280
      HEAP32[$AsyncCtx + 24 >> 2] = $19; //@line 10282
      sp = STACKTOP; //@line 10283
      return;
     }
     _emscripten_free_async_context($AsyncCtx | 0); //@line 10286
     if (!(HEAP8[$23 >> 0] | 0)) {
      $$037$off038 = 4; //@line 10290
      label = 13; //@line 10291
     } else {
      if (!(HEAP8[$22 >> 0] | 0)) {
       $$037$off038 = 3; //@line 10296
       label = 13; //@line 10297
      } else {
       $$037$off039 = 3; //@line 10299
      }
     }
     if ((label | 0) == 13) {
      HEAP32[$13 >> 2] = $2; //@line 10303
      $39 = $1 + 40 | 0; //@line 10304
      HEAP32[$39 >> 2] = (HEAP32[$39 >> 2] | 0) + 1; //@line 10307
      if ((HEAP32[$1 + 36 >> 2] | 0) == 1) {
       if ((HEAP32[$1 + 24 >> 2] | 0) == 2) {
        HEAP8[$1 + 54 >> 0] = 1; //@line 10317
        $$037$off039 = $$037$off038; //@line 10318
       } else {
        $$037$off039 = $$037$off038; //@line 10320
       }
      } else {
       $$037$off039 = $$037$off038; //@line 10323
      }
     }
     HEAP32[$19 >> 2] = $$037$off039; //@line 10326
     break;
    }
   }
   if (($3 | 0) == 1) {
    HEAP32[$1 + 32 >> 2] = 1; //@line 10333
   }
  }
 } while (0);
 return;
}
function _initialize__async_cb_54($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $15 = 0, $17 = 0, $19 = 0, $2 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $28 = 0, $29 = 0, $31 = 0, $33 = 0, $36 = 0, $4 = 0, $40 = 0, $41 = 0, $48 = 0, $49 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx4 = 0, sp = 0;
 sp = STACKTOP; //@line 157
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 159
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 161
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 163
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 165
 $10 = $0 + 24 | 0; //@line 167
 $12 = HEAP32[$10 >> 2] | 0; //@line 169
 $15 = HEAP32[$10 + 4 >> 2] | 0; //@line 172
 $17 = HEAP32[$0 + 32 >> 2] | 0; //@line 174
 $19 = HEAP32[$0 + 36 >> 2] | 0; //@line 176
 $21 = HEAP32[$2 >> 2] | 0; //@line 179
 $22 = $21 + 32 | 0; //@line 180
 HEAP32[$22 >> 2] = HEAP32[___async_retval >> 2]; //@line 181
 $23 = $21 + 40 | 0; //@line 182
 $24 = $23; //@line 183
 HEAP32[$24 >> 2] = 0; //@line 185
 HEAP32[$24 + 4 >> 2] = 0; //@line 188
 $28 = $21 + 8 | 0; //@line 189
 HEAP32[$28 >> 2] = $4; //@line 190
 $29 = _bitshift64Shl(1, 0, $6 | 0) | 0; //@line 191
 $31 = _i64Add($29 | 0, tempRet0 | 0, -1, 0) | 0; //@line 193
 $33 = $21 + 12 | 0; //@line 195
 HEAP32[$33 >> 2] = $31; //@line 196
 HEAP32[$21 + 16 >> 2] = $8; //@line 198
 $36 = $21 + 24 | 0; //@line 200
 HEAP32[$36 >> 2] = $12; //@line 202
 HEAP32[$36 + 4 >> 2] = $15; //@line 205
 $40 = $21 + 48 | 0; //@line 206
 $41 = $40; //@line 207
 HEAP32[$41 >> 2] = 0; //@line 209
 HEAP32[$41 + 4 >> 2] = 0; //@line 212
 HEAP8[$21 + 56 >> 0] = 1; //@line 214
 $48 = HEAP32[(HEAP32[$17 >> 2] | 0) + 4 >> 2] | 0; //@line 217
 $ReallocAsyncCtx4 = _emscripten_realloc_async_context(32) | 0; //@line 218
 $49 = FUNCTION_TABLE_i[$48 & 3]() | 0; //@line 219
 if (___async) {
  HEAP32[$ReallocAsyncCtx4 >> 2] = 47; //@line 222
  $50 = $ReallocAsyncCtx4 + 4 | 0; //@line 223
  HEAP32[$50 >> 2] = $2; //@line 224
  $51 = $ReallocAsyncCtx4 + 8 | 0; //@line 225
  HEAP32[$51 >> 2] = $19; //@line 226
  $52 = $ReallocAsyncCtx4 + 12 | 0; //@line 227
  HEAP32[$52 >> 2] = $22; //@line 228
  $53 = $ReallocAsyncCtx4 + 16 | 0; //@line 229
  HEAP32[$53 >> 2] = $33; //@line 230
  $54 = $ReallocAsyncCtx4 + 20 | 0; //@line 231
  HEAP32[$54 >> 2] = $28; //@line 232
  $55 = $ReallocAsyncCtx4 + 24 | 0; //@line 233
  HEAP32[$55 >> 2] = $23; //@line 234
  $56 = $ReallocAsyncCtx4 + 28 | 0; //@line 235
  HEAP32[$56 >> 2] = $40; //@line 236
  sp = STACKTOP; //@line 237
  return;
 }
 HEAP32[___async_retval >> 2] = $49; //@line 241
 ___async_unwind = 0; //@line 242
 HEAP32[$ReallocAsyncCtx4 >> 2] = 47; //@line 243
 $50 = $ReallocAsyncCtx4 + 4 | 0; //@line 244
 HEAP32[$50 >> 2] = $2; //@line 245
 $51 = $ReallocAsyncCtx4 + 8 | 0; //@line 246
 HEAP32[$51 >> 2] = $19; //@line 247
 $52 = $ReallocAsyncCtx4 + 12 | 0; //@line 248
 HEAP32[$52 >> 2] = $22; //@line 249
 $53 = $ReallocAsyncCtx4 + 16 | 0; //@line 250
 HEAP32[$53 >> 2] = $33; //@line 251
 $54 = $ReallocAsyncCtx4 + 20 | 0; //@line 252
 HEAP32[$54 >> 2] = $28; //@line 253
 $55 = $ReallocAsyncCtx4 + 24 | 0; //@line 254
 HEAP32[$55 >> 2] = $23; //@line 255
 $56 = $ReallocAsyncCtx4 + 28 | 0; //@line 256
 HEAP32[$56 >> 2] = $40; //@line 257
 sp = STACKTOP; //@line 258
 return;
}
function __ZN4mbed6Ticker6attachENS_8CallbackIFvvEEEf__async_cb_3($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $16 = 0, $19 = 0, $2 = 0, $20 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $37 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx3 = 0, $ReallocAsyncCtx4 = 0, sp = 0;
 sp = STACKTOP; //@line 11540
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 11542
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 11544
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 11546
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 11548
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 11550
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 11552
 $14 = $0 + 32 | 0; //@line 11554
 $16 = HEAP32[$14 >> 2] | 0; //@line 11556
 $19 = HEAP32[$14 + 4 >> 2] | 0; //@line 11559
 $20 = HEAP32[$2 >> 2] | 0; //@line 11560
 if ($20 | 0) {
  $23 = HEAP32[$20 + 4 >> 2] | 0; //@line 11564
  $ReallocAsyncCtx3 = _emscripten_realloc_async_context(32) | 0; //@line 11565
  FUNCTION_TABLE_vii[$23 & 3]($6, $8); //@line 11566
  if (___async) {
   HEAP32[$ReallocAsyncCtx3 >> 2] = 101; //@line 11569
   $24 = $ReallocAsyncCtx3 + 4 | 0; //@line 11570
   HEAP32[$24 >> 2] = $10; //@line 11571
   $25 = $ReallocAsyncCtx3 + 8 | 0; //@line 11572
   HEAP32[$25 >> 2] = $4; //@line 11573
   $26 = $ReallocAsyncCtx3 + 12 | 0; //@line 11574
   HEAP32[$26 >> 2] = $12; //@line 11575
   $27 = $ReallocAsyncCtx3 + 16 | 0; //@line 11576
   $28 = $27; //@line 11577
   $29 = $28; //@line 11578
   HEAP32[$29 >> 2] = $16; //@line 11579
   $30 = $28 + 4 | 0; //@line 11580
   $31 = $30; //@line 11581
   HEAP32[$31 >> 2] = $19; //@line 11582
   $32 = $ReallocAsyncCtx3 + 24 | 0; //@line 11583
   HEAP32[$32 >> 2] = $2; //@line 11584
   $33 = $ReallocAsyncCtx3 + 28 | 0; //@line 11585
   HEAP32[$33 >> 2] = $8; //@line 11586
   sp = STACKTOP; //@line 11587
   return;
  }
  ___async_unwind = 0; //@line 11590
  HEAP32[$ReallocAsyncCtx3 >> 2] = 101; //@line 11591
  $24 = $ReallocAsyncCtx3 + 4 | 0; //@line 11592
  HEAP32[$24 >> 2] = $10; //@line 11593
  $25 = $ReallocAsyncCtx3 + 8 | 0; //@line 11594
  HEAP32[$25 >> 2] = $4; //@line 11595
  $26 = $ReallocAsyncCtx3 + 12 | 0; //@line 11596
  HEAP32[$26 >> 2] = $12; //@line 11597
  $27 = $ReallocAsyncCtx3 + 16 | 0; //@line 11598
  $28 = $27; //@line 11599
  $29 = $28; //@line 11600
  HEAP32[$29 >> 2] = $16; //@line 11601
  $30 = $28 + 4 | 0; //@line 11602
  $31 = $30; //@line 11603
  HEAP32[$31 >> 2] = $19; //@line 11604
  $32 = $ReallocAsyncCtx3 + 24 | 0; //@line 11605
  HEAP32[$32 >> 2] = $2; //@line 11606
  $33 = $ReallocAsyncCtx3 + 28 | 0; //@line 11607
  HEAP32[$33 >> 2] = $8; //@line 11608
  sp = STACKTOP; //@line 11609
  return;
 }
 HEAP32[$4 >> 2] = 0; //@line 11612
 __ZN4mbed6Ticker5setupEy($12, $16, $19); //@line 11613
 $34 = HEAP32[$2 >> 2] | 0; //@line 11614
 if (!$34) {
  return;
 }
 $37 = HEAP32[$34 + 8 >> 2] | 0; //@line 11620
 $ReallocAsyncCtx4 = _emscripten_realloc_async_context(4) | 0; //@line 11621
 FUNCTION_TABLE_vi[$37 & 255]($8); //@line 11622
 if (___async) {
  HEAP32[$ReallocAsyncCtx4 >> 2] = 102; //@line 11625
  sp = STACKTOP; //@line 11626
  return;
 }
 ___async_unwind = 0; //@line 11629
 HEAP32[$ReallocAsyncCtx4 >> 2] = 102; //@line 11630
 sp = STACKTOP; //@line 11631
 return;
}
function __ZL25default_terminate_handlerv() {
 var $0 = 0, $1 = 0, $12 = 0, $22 = 0, $23 = 0, $25 = 0, $28 = 0, $29 = 0, $3 = 0, $36 = 0, $39 = 0, $40 = 0, $7 = 0, $9 = 0, $AsyncCtx = 0, $AsyncCtx14 = 0, $vararg_buffer = 0, $vararg_buffer10 = 0, $vararg_buffer3 = 0, $vararg_buffer7 = 0, sp = 0;
 sp = STACKTOP; //@line 9525
 STACKTOP = STACKTOP + 48 | 0; //@line 9526
 $vararg_buffer10 = sp + 32 | 0; //@line 9527
 $vararg_buffer7 = sp + 24 | 0; //@line 9528
 $vararg_buffer3 = sp + 16 | 0; //@line 9529
 $vararg_buffer = sp; //@line 9530
 $0 = sp + 36 | 0; //@line 9531
 $1 = ___cxa_get_globals_fast() | 0; //@line 9532
 if ($1 | 0) {
  $3 = HEAP32[$1 >> 2] | 0; //@line 9535
  if ($3 | 0) {
   $7 = $3 + 48 | 0; //@line 9540
   $9 = HEAP32[$7 >> 2] | 0; //@line 9542
   $12 = HEAP32[$7 + 4 >> 2] | 0; //@line 9545
   if (!(($9 & -256 | 0) == 1126902528 & ($12 | 0) == 1129074247)) {
    HEAP32[$vararg_buffer7 >> 2] = 4649; //@line 9551
    _abort_message(4599, $vararg_buffer7); //@line 9552
   }
   if (($9 | 0) == 1126902529 & ($12 | 0) == 1129074247) {
    $22 = HEAP32[$3 + 44 >> 2] | 0; //@line 9561
   } else {
    $22 = $3 + 80 | 0; //@line 9563
   }
   HEAP32[$0 >> 2] = $22; //@line 9565
   $23 = HEAP32[$3 >> 2] | 0; //@line 9566
   $25 = HEAP32[$23 + 4 >> 2] | 0; //@line 9568
   $28 = HEAP32[(HEAP32[54] | 0) + 16 >> 2] | 0; //@line 9571
   $AsyncCtx = _emscripten_alloc_async_context(28, sp) | 0; //@line 9572
   $29 = FUNCTION_TABLE_iiii[$28 & 7](216, $23, $0) | 0; //@line 9573
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 108; //@line 9576
    HEAP32[$AsyncCtx + 4 >> 2] = $0; //@line 9578
    HEAP32[$AsyncCtx + 8 >> 2] = $vararg_buffer3; //@line 9580
    HEAP32[$AsyncCtx + 12 >> 2] = $25; //@line 9582
    HEAP32[$AsyncCtx + 16 >> 2] = $vararg_buffer3; //@line 9584
    HEAP32[$AsyncCtx + 20 >> 2] = $vararg_buffer; //@line 9586
    HEAP32[$AsyncCtx + 24 >> 2] = $vararg_buffer; //@line 9588
    sp = STACKTOP; //@line 9589
    STACKTOP = sp; //@line 9590
    return;
   }
   _emscripten_free_async_context($AsyncCtx | 0); //@line 9592
   if (!$29) {
    HEAP32[$vararg_buffer3 >> 2] = 4649; //@line 9594
    HEAP32[$vararg_buffer3 + 4 >> 2] = $25; //@line 9596
    _abort_message(4558, $vararg_buffer3); //@line 9597
   }
   $36 = HEAP32[$0 >> 2] | 0; //@line 9600
   $39 = HEAP32[(HEAP32[$36 >> 2] | 0) + 8 >> 2] | 0; //@line 9603
   $AsyncCtx14 = _emscripten_alloc_async_context(16, sp) | 0; //@line 9604
   $40 = FUNCTION_TABLE_ii[$39 & 1]($36) | 0; //@line 9605
   if (___async) {
    HEAP32[$AsyncCtx14 >> 2] = 109; //@line 9608
    HEAP32[$AsyncCtx14 + 4 >> 2] = $vararg_buffer; //@line 9610
    HEAP32[$AsyncCtx14 + 8 >> 2] = $25; //@line 9612
    HEAP32[$AsyncCtx14 + 12 >> 2] = $vararg_buffer; //@line 9614
    sp = STACKTOP; //@line 9615
    STACKTOP = sp; //@line 9616
    return;
   } else {
    _emscripten_free_async_context($AsyncCtx14 | 0); //@line 9618
    HEAP32[$vararg_buffer >> 2] = 4649; //@line 9619
    HEAP32[$vararg_buffer + 4 >> 2] = $25; //@line 9621
    HEAP32[$vararg_buffer + 8 >> 2] = $40; //@line 9623
    _abort_message(4513, $vararg_buffer); //@line 9624
   }
  }
 }
 _abort_message(4637, $vararg_buffer10); //@line 9629
}
function ___stdio_write($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$0 = 0, $$04756 = 0, $$04855 = 0, $$04954 = 0, $$051 = 0, $$1 = 0, $$150 = 0, $12 = 0, $13 = 0, $17 = 0, $20 = 0, $25 = 0, $27 = 0, $3 = 0, $37 = 0, $38 = 0, $4 = 0, $44 = 0, $5 = 0, $7 = 0, $9 = 0, $vararg_buffer = 0, $vararg_buffer3 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 5749
 STACKTOP = STACKTOP + 48 | 0; //@line 5750
 $vararg_buffer3 = sp + 16 | 0; //@line 5751
 $vararg_buffer = sp; //@line 5752
 $3 = sp + 32 | 0; //@line 5753
 $4 = $0 + 28 | 0; //@line 5754
 $5 = HEAP32[$4 >> 2] | 0; //@line 5755
 HEAP32[$3 >> 2] = $5; //@line 5756
 $7 = $0 + 20 | 0; //@line 5758
 $9 = (HEAP32[$7 >> 2] | 0) - $5 | 0; //@line 5760
 HEAP32[$3 + 4 >> 2] = $9; //@line 5761
 HEAP32[$3 + 8 >> 2] = $1; //@line 5763
 HEAP32[$3 + 12 >> 2] = $2; //@line 5765
 $12 = $9 + $2 | 0; //@line 5766
 $13 = $0 + 60 | 0; //@line 5767
 HEAP32[$vararg_buffer >> 2] = HEAP32[$13 >> 2]; //@line 5770
 HEAP32[$vararg_buffer + 4 >> 2] = $3; //@line 5772
 HEAP32[$vararg_buffer + 8 >> 2] = 2; //@line 5774
 $17 = ___syscall_ret(___syscall146(146, $vararg_buffer | 0) | 0) | 0; //@line 5776
 L1 : do {
  if (($12 | 0) == ($17 | 0)) {
   label = 3; //@line 5780
  } else {
   $$04756 = 2; //@line 5782
   $$04855 = $12; //@line 5782
   $$04954 = $3; //@line 5782
   $27 = $17; //@line 5782
   while (1) {
    if (($27 | 0) < 0) {
     break;
    }
    $$04855 = $$04855 - $27 | 0; //@line 5788
    $37 = HEAP32[$$04954 + 4 >> 2] | 0; //@line 5790
    $38 = $27 >>> 0 > $37 >>> 0; //@line 5791
    $$150 = $38 ? $$04954 + 8 | 0 : $$04954; //@line 5793
    $$1 = $$04756 + ($38 << 31 >> 31) | 0; //@line 5795
    $$0 = $27 - ($38 ? $37 : 0) | 0; //@line 5797
    HEAP32[$$150 >> 2] = (HEAP32[$$150 >> 2] | 0) + $$0; //@line 5800
    $44 = $$150 + 4 | 0; //@line 5801
    HEAP32[$44 >> 2] = (HEAP32[$44 >> 2] | 0) - $$0; //@line 5804
    HEAP32[$vararg_buffer3 >> 2] = HEAP32[$13 >> 2]; //@line 5807
    HEAP32[$vararg_buffer3 + 4 >> 2] = $$150; //@line 5809
    HEAP32[$vararg_buffer3 + 8 >> 2] = $$1; //@line 5811
    $27 = ___syscall_ret(___syscall146(146, $vararg_buffer3 | 0) | 0) | 0; //@line 5813
    if (($$04855 | 0) == ($27 | 0)) {
     label = 3; //@line 5816
     break L1;
    } else {
     $$04756 = $$1; //@line 5819
     $$04954 = $$150; //@line 5819
    }
   }
   HEAP32[$0 + 16 >> 2] = 0; //@line 5823
   HEAP32[$4 >> 2] = 0; //@line 5824
   HEAP32[$7 >> 2] = 0; //@line 5825
   HEAP32[$0 >> 2] = HEAP32[$0 >> 2] | 32; //@line 5828
   if (($$04756 | 0) == 2) {
    $$051 = 0; //@line 5831
   } else {
    $$051 = $2 - (HEAP32[$$04954 + 4 >> 2] | 0) | 0; //@line 5836
   }
  }
 } while (0);
 if ((label | 0) == 3) {
  $20 = HEAP32[$0 + 44 >> 2] | 0; //@line 5842
  HEAP32[$0 + 16 >> 2] = $20 + (HEAP32[$0 + 48 >> 2] | 0); //@line 5847
  $25 = $20; //@line 5848
  HEAP32[$4 >> 2] = $25; //@line 5849
  HEAP32[$7 >> 2] = $25; //@line 5850
  $$051 = $2; //@line 5851
 }
 STACKTOP = sp; //@line 5853
 return $$051 | 0; //@line 5853
}
function _initialize__async_cb_57($0) {
 $0 = $0 | 0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $15 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 443
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 445
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 447
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 449
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 451
 $10 = 7 << 32 + -4; //@line 453
 $11 = ___muldi3($10 | 0, 0, 1e6, 0) | 0; //@line 454
 $12 = tempRet0; //@line 455
 $13 = _i64Add($2 | 0, 0, -1, -1) | 0; //@line 456
 $15 = _i64Add($13 | 0, tempRet0 | 0, $11 | 0, $12 | 0) | 0; //@line 458
 $17 = ___udivdi3($15 | 0, tempRet0 | 0, $2 | 0, 0) | 0; //@line 460
 $18 = tempRet0; //@line 461
 $19 = HEAP32[$4 >> 2] | 0; //@line 462
 HEAP32[$19 >> 2] = 0; //@line 463
 HEAP32[$19 + 4 >> 2] = 0; //@line 465
 $23 = HEAP32[(HEAP32[$6 >> 2] | 0) + 4 >> 2] | 0; //@line 468
 $ReallocAsyncCtx3 = _emscripten_realloc_async_context(40) | 0; //@line 469
 $24 = FUNCTION_TABLE_i[$23 & 3]() | 0; //@line 470
 if (___async) {
  HEAP32[$ReallocAsyncCtx3 >> 2] = 46; //@line 473
  $25 = $ReallocAsyncCtx3 + 4 | 0; //@line 474
  HEAP32[$25 >> 2] = $4; //@line 475
  $26 = $ReallocAsyncCtx3 + 8 | 0; //@line 476
  HEAP32[$26 >> 2] = $2; //@line 477
  $27 = $ReallocAsyncCtx3 + 12 | 0; //@line 478
  HEAP32[$27 >> 2] = 32; //@line 479
  $28 = $ReallocAsyncCtx3 + 16 | 0; //@line 480
  HEAP32[$28 >> 2] = $10; //@line 481
  $29 = $ReallocAsyncCtx3 + 24 | 0; //@line 482
  $30 = $29; //@line 483
  $31 = $30; //@line 484
  HEAP32[$31 >> 2] = $17; //@line 485
  $32 = $30 + 4 | 0; //@line 486
  $33 = $32; //@line 487
  HEAP32[$33 >> 2] = $18; //@line 488
  $34 = $ReallocAsyncCtx3 + 32 | 0; //@line 489
  HEAP32[$34 >> 2] = $6; //@line 490
  $35 = $ReallocAsyncCtx3 + 36 | 0; //@line 491
  HEAP32[$35 >> 2] = $8; //@line 492
  sp = STACKTOP; //@line 493
  return;
 }
 HEAP32[___async_retval >> 2] = $24; //@line 497
 ___async_unwind = 0; //@line 498
 HEAP32[$ReallocAsyncCtx3 >> 2] = 46; //@line 499
 $25 = $ReallocAsyncCtx3 + 4 | 0; //@line 500
 HEAP32[$25 >> 2] = $4; //@line 501
 $26 = $ReallocAsyncCtx3 + 8 | 0; //@line 502
 HEAP32[$26 >> 2] = $2; //@line 503
 $27 = $ReallocAsyncCtx3 + 12 | 0; //@line 504
 HEAP32[$27 >> 2] = 32; //@line 505
 $28 = $ReallocAsyncCtx3 + 16 | 0; //@line 506
 HEAP32[$28 >> 2] = $10; //@line 507
 $29 = $ReallocAsyncCtx3 + 24 | 0; //@line 508
 $30 = $29; //@line 509
 $31 = $30; //@line 510
 HEAP32[$31 >> 2] = $17; //@line 511
 $32 = $30 + 4 | 0; //@line 512
 $33 = $32; //@line 513
 HEAP32[$33 >> 2] = $18; //@line 514
 $34 = $ReallocAsyncCtx3 + 32 | 0; //@line 515
 HEAP32[$34 >> 2] = $6; //@line 516
 $35 = $ReallocAsyncCtx3 + 36 | 0; //@line 517
 HEAP32[$35 >> 2] = $8; //@line 518
 sp = STACKTOP; //@line 519
 return;
}
function _memcpy(dest, src, num) {
 dest = dest | 0;
 src = src | 0;
 num = num | 0;
 var ret = 0, aligned_dest_end = 0, block_aligned_dest_end = 0, dest_end = 0;
 if ((num | 0) >= 8192) {
  return _emscripten_memcpy_big(dest | 0, src | 0, num | 0) | 0; //@line 1676
 }
 ret = dest | 0; //@line 1679
 dest_end = dest + num | 0; //@line 1680
 if ((dest & 3) == (src & 3)) {
  while (dest & 3) {
   if (!num) return ret | 0; //@line 1684
   HEAP8[dest >> 0] = HEAP8[src >> 0] | 0; //@line 1685
   dest = dest + 1 | 0; //@line 1686
   src = src + 1 | 0; //@line 1687
   num = num - 1 | 0; //@line 1688
  }
  aligned_dest_end = dest_end & -4 | 0; //@line 1690
  block_aligned_dest_end = aligned_dest_end - 64 | 0; //@line 1691
  while ((dest | 0) <= (block_aligned_dest_end | 0)) {
   HEAP32[dest >> 2] = HEAP32[src >> 2]; //@line 1693
   HEAP32[dest + 4 >> 2] = HEAP32[src + 4 >> 2]; //@line 1694
   HEAP32[dest + 8 >> 2] = HEAP32[src + 8 >> 2]; //@line 1695
   HEAP32[dest + 12 >> 2] = HEAP32[src + 12 >> 2]; //@line 1696
   HEAP32[dest + 16 >> 2] = HEAP32[src + 16 >> 2]; //@line 1697
   HEAP32[dest + 20 >> 2] = HEAP32[src + 20 >> 2]; //@line 1698
   HEAP32[dest + 24 >> 2] = HEAP32[src + 24 >> 2]; //@line 1699
   HEAP32[dest + 28 >> 2] = HEAP32[src + 28 >> 2]; //@line 1700
   HEAP32[dest + 32 >> 2] = HEAP32[src + 32 >> 2]; //@line 1701
   HEAP32[dest + 36 >> 2] = HEAP32[src + 36 >> 2]; //@line 1702
   HEAP32[dest + 40 >> 2] = HEAP32[src + 40 >> 2]; //@line 1703
   HEAP32[dest + 44 >> 2] = HEAP32[src + 44 >> 2]; //@line 1704
   HEAP32[dest + 48 >> 2] = HEAP32[src + 48 >> 2]; //@line 1705
   HEAP32[dest + 52 >> 2] = HEAP32[src + 52 >> 2]; //@line 1706
   HEAP32[dest + 56 >> 2] = HEAP32[src + 56 >> 2]; //@line 1707
   HEAP32[dest + 60 >> 2] = HEAP32[src + 60 >> 2]; //@line 1708
   dest = dest + 64 | 0; //@line 1709
   src = src + 64 | 0; //@line 1710
  }
  while ((dest | 0) < (aligned_dest_end | 0)) {
   HEAP32[dest >> 2] = HEAP32[src >> 2]; //@line 1713
   dest = dest + 4 | 0; //@line 1714
   src = src + 4 | 0; //@line 1715
  }
 } else {
  aligned_dest_end = dest_end - 4 | 0; //@line 1719
  while ((dest | 0) < (aligned_dest_end | 0)) {
   HEAP8[dest >> 0] = HEAP8[src >> 0] | 0; //@line 1721
   HEAP8[dest + 1 >> 0] = HEAP8[src + 1 >> 0] | 0; //@line 1722
   HEAP8[dest + 2 >> 0] = HEAP8[src + 2 >> 0] | 0; //@line 1723
   HEAP8[dest + 3 >> 0] = HEAP8[src + 3 >> 0] | 0; //@line 1724
   dest = dest + 4 | 0; //@line 1725
   src = src + 4 | 0; //@line 1726
  }
 }
 while ((dest | 0) < (dest_end | 0)) {
  HEAP8[dest >> 0] = HEAP8[src >> 0] | 0; //@line 1731
  dest = dest + 1 | 0; //@line 1732
  src = src + 1 | 0; //@line 1733
 }
 return ret | 0; //@line 1735
}
function __ZNK10__cxxabiv121__vmi_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb_60($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $20 = 0, $22 = 0, $24 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 805
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 809
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 811
 $8 = HEAP8[$0 + 16 >> 0] | 0; //@line 813
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 815
 $12 = HEAP8[$0 + 24 >> 0] | 0; //@line 817
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 819
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 821
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 823
 $20 = HEAP32[$0 + 40 >> 2] | 0; //@line 825
 $22 = HEAP8[$0 + 44 >> 0] & 1; //@line 828
 $24 = HEAP32[$0 + 48 >> 2] | 0; //@line 830
 do {
  if ((HEAP32[$0 + 4 >> 2] | 0) > 1) {
   $26 = $4 + 24 | 0; //@line 834
   $27 = $6 + 24 | 0; //@line 835
   $28 = $4 + 8 | 0; //@line 836
   $29 = $6 + 54 | 0; //@line 837
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
    HEAP8[$10 >> 0] = 0; //@line 867
    HEAP8[$14 >> 0] = 0; //@line 868
    $ReallocAsyncCtx = _emscripten_realloc_async_context(60) | 0; //@line 869
    __ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($26, $6, $16, $18, $20, $22); //@line 870
    if (!___async) {
     ___async_unwind = 0; //@line 873
    }
    HEAP32[$ReallocAsyncCtx >> 2] = 123; //@line 875
    HEAP32[$ReallocAsyncCtx + 4 >> 2] = $26; //@line 877
    HEAP32[$ReallocAsyncCtx + 8 >> 2] = $24; //@line 879
    HEAP32[$ReallocAsyncCtx + 12 >> 2] = $29; //@line 881
    HEAP8[$ReallocAsyncCtx + 16 >> 0] = $8; //@line 883
    HEAP32[$ReallocAsyncCtx + 20 >> 2] = $10; //@line 885
    HEAP8[$ReallocAsyncCtx + 24 >> 0] = $12; //@line 887
    HEAP32[$ReallocAsyncCtx + 28 >> 2] = $14; //@line 889
    HEAP32[$ReallocAsyncCtx + 32 >> 2] = $27; //@line 891
    HEAP32[$ReallocAsyncCtx + 36 >> 2] = $28; //@line 893
    HEAP32[$ReallocAsyncCtx + 40 >> 2] = $6; //@line 895
    HEAP32[$ReallocAsyncCtx + 44 >> 2] = $16; //@line 897
    HEAP32[$ReallocAsyncCtx + 48 >> 2] = $18; //@line 899
    HEAP32[$ReallocAsyncCtx + 52 >> 2] = $20; //@line 901
    HEAP8[$ReallocAsyncCtx + 56 >> 0] = $22 & 1; //@line 904
    sp = STACKTOP; //@line 905
    return;
   }
  }
 } while (0);
 HEAP8[$10 >> 0] = $8; //@line 910
 HEAP8[$14 >> 0] = $12; //@line 911
 return;
}
function __ZNK10__cxxabiv121__vmi_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $20 = 0, $22 = 0, $24 = 0, $26 = 0, $28 = 0, $4 = 0, $43 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 689
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 693
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 695
 $8 = HEAP8[$0 + 16 >> 0] | 0; //@line 697
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 699
 $12 = HEAP8[$0 + 24 >> 0] | 0; //@line 701
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 703
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 705
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 707
 $20 = HEAP32[$0 + 40 >> 2] | 0; //@line 709
 $22 = HEAP32[$0 + 44 >> 2] | 0; //@line 711
 $24 = HEAP32[$0 + 48 >> 2] | 0; //@line 713
 $26 = HEAP32[$0 + 52 >> 2] | 0; //@line 715
 $28 = HEAP8[$0 + 56 >> 0] & 1; //@line 718
 $43 = (HEAP32[$0 + 4 >> 2] | 0) + 8 | 0; //@line 719
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
    HEAP8[$10 >> 0] = 0; //@line 752
    HEAP8[$14 >> 0] = 0; //@line 753
    $ReallocAsyncCtx = _emscripten_realloc_async_context(60) | 0; //@line 754
    __ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($43, $20, $22, $24, $26, $28); //@line 755
    if (!___async) {
     ___async_unwind = 0; //@line 758
    }
    HEAP32[$ReallocAsyncCtx >> 2] = 123; //@line 760
    HEAP32[$ReallocAsyncCtx + 4 >> 2] = $43; //@line 762
    HEAP32[$ReallocAsyncCtx + 8 >> 2] = $4; //@line 764
    HEAP32[$ReallocAsyncCtx + 12 >> 2] = $6; //@line 766
    HEAP8[$ReallocAsyncCtx + 16 >> 0] = $8; //@line 768
    HEAP32[$ReallocAsyncCtx + 20 >> 2] = $10; //@line 770
    HEAP8[$ReallocAsyncCtx + 24 >> 0] = $12; //@line 772
    HEAP32[$ReallocAsyncCtx + 28 >> 2] = $14; //@line 774
    HEAP32[$ReallocAsyncCtx + 32 >> 2] = $16; //@line 776
    HEAP32[$ReallocAsyncCtx + 36 >> 2] = $18; //@line 778
    HEAP32[$ReallocAsyncCtx + 40 >> 2] = $20; //@line 780
    HEAP32[$ReallocAsyncCtx + 44 >> 2] = $22; //@line 782
    HEAP32[$ReallocAsyncCtx + 48 >> 2] = $24; //@line 784
    HEAP32[$ReallocAsyncCtx + 52 >> 2] = $26; //@line 786
    HEAP8[$ReallocAsyncCtx + 56 >> 0] = $28 & 1; //@line 789
    sp = STACKTOP; //@line 790
    return;
   }
  }
 } while (0);
 HEAP8[$10 >> 0] = $8; //@line 795
 HEAP8[$14 >> 0] = $12; //@line 796
 return;
}
function __ZNK10__cxxabiv121__vmi_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $$0 = 0, $10 = 0, $19 = 0, $28 = 0, $9 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 11046
 L1 : do {
  if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, 0) | 0) {
   __ZNK10__cxxabiv117__class_type_info24process_found_base_classEPNS_19__dynamic_cast_infoEPvi(0, $1, $2, $3); //@line 11052
  } else {
   $9 = HEAP32[$0 + 12 >> 2] | 0; //@line 11056
   $10 = $0 + 16 + ($9 << 3) | 0; //@line 11057
   $AsyncCtx3 = _emscripten_alloc_async_context(28, sp) | 0; //@line 11058
   __ZNK10__cxxabiv122__base_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($0 + 16 | 0, $1, $2, $3); //@line 11059
   if (___async) {
    HEAP32[$AsyncCtx3 >> 2] = 129; //@line 11062
    HEAP32[$AsyncCtx3 + 4 >> 2] = $9; //@line 11064
    HEAP32[$AsyncCtx3 + 8 >> 2] = $0; //@line 11066
    HEAP32[$AsyncCtx3 + 12 >> 2] = $1; //@line 11068
    HEAP32[$AsyncCtx3 + 16 >> 2] = $2; //@line 11070
    HEAP32[$AsyncCtx3 + 20 >> 2] = $3; //@line 11072
    HEAP32[$AsyncCtx3 + 24 >> 2] = $10; //@line 11074
    sp = STACKTOP; //@line 11075
    return;
   }
   _emscripten_free_async_context($AsyncCtx3 | 0); //@line 11078
   if (($9 | 0) > 1) {
    $19 = $1 + 54 | 0; //@line 11082
    $$0 = $0 + 24 | 0; //@line 11083
    while (1) {
     $AsyncCtx = _emscripten_alloc_async_context(28, sp) | 0; //@line 11085
     __ZNK10__cxxabiv122__base_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($$0, $1, $2, $3); //@line 11086
     if (___async) {
      break;
     }
     _emscripten_free_async_context($AsyncCtx | 0); //@line 11091
     if (HEAP8[$19 >> 0] | 0) {
      break L1;
     }
     $28 = $$0 + 8 | 0; //@line 11097
     if ($28 >>> 0 < $10 >>> 0) {
      $$0 = $28; //@line 11100
     } else {
      break L1;
     }
    }
    HEAP32[$AsyncCtx >> 2] = 130; //@line 11105
    HEAP32[$AsyncCtx + 4 >> 2] = $19; //@line 11107
    HEAP32[$AsyncCtx + 8 >> 2] = $$0; //@line 11109
    HEAP32[$AsyncCtx + 12 >> 2] = $10; //@line 11111
    HEAP32[$AsyncCtx + 16 >> 2] = $1; //@line 11113
    HEAP32[$AsyncCtx + 20 >> 2] = $2; //@line 11115
    HEAP32[$AsyncCtx + 24 >> 2] = $3; //@line 11117
    sp = STACKTOP; //@line 11118
    return;
   }
  }
 } while (0);
 return;
}
function _main__async_cb_24($0) {
 $0 = $0 | 0;
 var $12 = 0, $13 = 0, $14 = 0, $16 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $6 = 0, $8 = 0, $9 = 0, $ReallocAsyncCtx = 0, $ReallocAsyncCtx7 = 0, sp = 0;
 sp = STACKTOP; //@line 12635
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 12637
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 12641
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 12643
 $9 = HEAP32[HEAP32[$0 + 8 >> 2] >> 2] | 0; //@line 12644
 if (!$9) {
  $16 = $8 + 4 | 0; //@line 12648
  HEAP32[$16 >> 2] = 0; //@line 12650
  HEAP32[$16 + 4 >> 2] = 0; //@line 12653
  HEAP32[$8 >> 2] = 8; //@line 12654
  $20 = $8 + 12 | 0; //@line 12655
  HEAP32[$20 >> 2] = 440; //@line 12656
  $ReallocAsyncCtx7 = _emscripten_realloc_async_context(16) | 0; //@line 12657
  __ZN4mbed6Ticker6attachENS_8CallbackIFvvEEEf(5152, $8, 2.5); //@line 12658
  if (___async) {
   HEAP32[$ReallocAsyncCtx7 >> 2] = 94; //@line 12661
   $21 = $ReallocAsyncCtx7 + 4 | 0; //@line 12662
   HEAP32[$21 >> 2] = $20; //@line 12663
   $22 = $ReallocAsyncCtx7 + 8 | 0; //@line 12664
   HEAP32[$22 >> 2] = $6; //@line 12665
   $23 = $ReallocAsyncCtx7 + 12 | 0; //@line 12666
   HEAP32[$23 >> 2] = $8; //@line 12667
   sp = STACKTOP; //@line 12668
   return;
  }
  ___async_unwind = 0; //@line 12671
  HEAP32[$ReallocAsyncCtx7 >> 2] = 94; //@line 12672
  $21 = $ReallocAsyncCtx7 + 4 | 0; //@line 12673
  HEAP32[$21 >> 2] = $20; //@line 12674
  $22 = $ReallocAsyncCtx7 + 8 | 0; //@line 12675
  HEAP32[$22 >> 2] = $6; //@line 12676
  $23 = $ReallocAsyncCtx7 + 12 | 0; //@line 12677
  HEAP32[$23 >> 2] = $8; //@line 12678
  sp = STACKTOP; //@line 12679
  return;
 } else {
  $12 = HEAP32[$9 + 8 >> 2] | 0; //@line 12683
  $ReallocAsyncCtx = _emscripten_realloc_async_context(12) | 0; //@line 12684
  FUNCTION_TABLE_vi[$12 & 255]($2); //@line 12685
  if (___async) {
   HEAP32[$ReallocAsyncCtx >> 2] = 93; //@line 12688
   $13 = $ReallocAsyncCtx + 4 | 0; //@line 12689
   HEAP32[$13 >> 2] = $8; //@line 12690
   $14 = $ReallocAsyncCtx + 8 | 0; //@line 12691
   HEAP32[$14 >> 2] = $6; //@line 12692
   sp = STACKTOP; //@line 12693
   return;
  }
  ___async_unwind = 0; //@line 12696
  HEAP32[$ReallocAsyncCtx >> 2] = 93; //@line 12697
  $13 = $ReallocAsyncCtx + 4 | 0; //@line 12698
  HEAP32[$13 >> 2] = $8; //@line 12699
  $14 = $ReallocAsyncCtx + 8 | 0; //@line 12700
  HEAP32[$14 >> 2] = $6; //@line 12701
  sp = STACKTOP; //@line 12702
  return;
 }
}
function __ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$0 = 0, $$2 = 0, $17 = 0, $18 = 0, $3 = 0, $6 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, dest = 0, sp = 0, stop = 0;
 sp = STACKTOP; //@line 9714
 STACKTOP = STACKTOP + 64 | 0; //@line 9715
 $3 = sp; //@line 9716
 if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, $1, 0) | 0) {
  $$2 = 1; //@line 9719
 } else {
  if (!$1) {
   $$2 = 0; //@line 9723
  } else {
   $AsyncCtx3 = _emscripten_alloc_async_context(16, sp) | 0; //@line 9725
   $6 = ___dynamic_cast($1, 240, 224, 0) | 0; //@line 9726
   if (___async) {
    HEAP32[$AsyncCtx3 >> 2] = 112; //@line 9729
    HEAP32[$AsyncCtx3 + 4 >> 2] = $3; //@line 9731
    HEAP32[$AsyncCtx3 + 8 >> 2] = $0; //@line 9733
    HEAP32[$AsyncCtx3 + 12 >> 2] = $2; //@line 9735
    sp = STACKTOP; //@line 9736
    STACKTOP = sp; //@line 9737
    return 0; //@line 9737
   }
   _emscripten_free_async_context($AsyncCtx3 | 0); //@line 9739
   if (!$6) {
    $$2 = 0; //@line 9742
   } else {
    dest = $3 + 4 | 0; //@line 9745
    stop = dest + 52 | 0; //@line 9745
    do {
     HEAP32[dest >> 2] = 0; //@line 9745
     dest = dest + 4 | 0; //@line 9745
    } while ((dest | 0) < (stop | 0));
    HEAP32[$3 >> 2] = $6; //@line 9746
    HEAP32[$3 + 8 >> 2] = $0; //@line 9748
    HEAP32[$3 + 12 >> 2] = -1; //@line 9750
    HEAP32[$3 + 48 >> 2] = 1; //@line 9752
    $17 = HEAP32[(HEAP32[$6 >> 2] | 0) + 28 >> 2] | 0; //@line 9755
    $18 = HEAP32[$2 >> 2] | 0; //@line 9756
    $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 9757
    FUNCTION_TABLE_viiii[$17 & 3]($6, $3, $18, 1); //@line 9758
    if (___async) {
     HEAP32[$AsyncCtx >> 2] = 113; //@line 9761
     HEAP32[$AsyncCtx + 4 >> 2] = $3; //@line 9763
     HEAP32[$AsyncCtx + 8 >> 2] = $2; //@line 9765
     HEAP32[$AsyncCtx + 12 >> 2] = $3; //@line 9767
     sp = STACKTOP; //@line 9768
     STACKTOP = sp; //@line 9769
     return 0; //@line 9769
    }
    _emscripten_free_async_context($AsyncCtx | 0); //@line 9771
    if ((HEAP32[$3 + 24 >> 2] | 0) == 1) {
     HEAP32[$2 >> 2] = HEAP32[$3 + 16 >> 2]; //@line 9778
     $$0 = 1; //@line 9779
    } else {
     $$0 = 0; //@line 9781
    }
    $$2 = $$0; //@line 9783
   }
  }
 }
 STACKTOP = sp; //@line 9787
 return $$2 | 0; //@line 9787
}
function ___mo_lookup($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$090 = 0, $$094 = 0, $$4 = 0, $10 = 0, $13 = 0, $17 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $31 = 0, $35 = 0, $4 = 0, $44 = 0, $46 = 0, $49 = 0, $53 = 0, $63 = 0, $7 = 0;
 $4 = (HEAP32[$0 >> 2] | 0) + 1794895138 | 0; //@line 6359
 $7 = _swapc(HEAP32[$0 + 8 >> 2] | 0, $4) | 0; //@line 6362
 $10 = _swapc(HEAP32[$0 + 12 >> 2] | 0, $4) | 0; //@line 6365
 $13 = _swapc(HEAP32[$0 + 16 >> 2] | 0, $4) | 0; //@line 6368
 L1 : do {
  if ($7 >>> 0 < $1 >>> 2 >>> 0) {
   $17 = $1 - ($7 << 2) | 0; //@line 6374
   if ($10 >>> 0 < $17 >>> 0 & $13 >>> 0 < $17 >>> 0) {
    if (!(($13 | $10) & 3)) {
     $23 = $10 >>> 2; //@line 6383
     $24 = $13 >>> 2; //@line 6384
     $$090 = 0; //@line 6385
     $$094 = $7; //@line 6385
     while (1) {
      $25 = $$094 >>> 1; //@line 6387
      $26 = $$090 + $25 | 0; //@line 6388
      $27 = $26 << 1; //@line 6389
      $28 = $27 + $23 | 0; //@line 6390
      $31 = _swapc(HEAP32[$0 + ($28 << 2) >> 2] | 0, $4) | 0; //@line 6393
      $35 = _swapc(HEAP32[$0 + ($28 + 1 << 2) >> 2] | 0, $4) | 0; //@line 6397
      if (!($35 >>> 0 < $1 >>> 0 & $31 >>> 0 < ($1 - $35 | 0) >>> 0)) {
       $$4 = 0; //@line 6403
       break L1;
      }
      if (HEAP8[$0 + ($35 + $31) >> 0] | 0) {
       $$4 = 0; //@line 6411
       break L1;
      }
      $44 = _strcmp($2, $0 + $35 | 0) | 0; //@line 6415
      if (!$44) {
       break;
      }
      $63 = ($44 | 0) < 0; //@line 6421
      if (($$094 | 0) == 1) {
       $$4 = 0; //@line 6426
       break L1;
      } else {
       $$090 = $63 ? $$090 : $26; //@line 6429
       $$094 = $63 ? $25 : $$094 - $25 | 0; //@line 6429
      }
     }
     $46 = $27 + $24 | 0; //@line 6432
     $49 = _swapc(HEAP32[$0 + ($46 << 2) >> 2] | 0, $4) | 0; //@line 6435
     $53 = _swapc(HEAP32[$0 + ($46 + 1 << 2) >> 2] | 0, $4) | 0; //@line 6439
     if ($53 >>> 0 < $1 >>> 0 & $49 >>> 0 < ($1 - $53 | 0) >>> 0) {
      $$4 = (HEAP8[$0 + ($53 + $49) >> 0] | 0) == 0 ? $0 + $53 | 0 : 0; //@line 6451
     } else {
      $$4 = 0; //@line 6453
     }
    } else {
     $$4 = 0; //@line 6456
    }
   } else {
    $$4 = 0; //@line 6459
   }
  } else {
   $$4 = 0; //@line 6462
  }
 } while (0);
 return $$4 | 0; //@line 6465
}
function _fputc($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0 = 0, $13 = 0, $14 = 0, $19 = 0, $20 = 0, $21 = 0, $26 = 0, $27 = 0, $32 = 0, $34 = 0, $7 = 0, $8 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 9356
 if ((HEAP32[$1 + 76 >> 2] | 0) < 0) {
  label = 3; //@line 9361
 } else {
  if (!(___lockfile($1) | 0)) {
   label = 3; //@line 9366
  } else {
   $20 = $0 & 255; //@line 9368
   $21 = $0 & 255; //@line 9369
   if (($21 | 0) == (HEAP8[$1 + 75 >> 0] | 0)) {
    label = 12; //@line 9375
   } else {
    $26 = $1 + 20 | 0; //@line 9377
    $27 = HEAP32[$26 >> 2] | 0; //@line 9378
    if ($27 >>> 0 < (HEAP32[$1 + 16 >> 2] | 0) >>> 0) {
     HEAP32[$26 >> 2] = $27 + 1; //@line 9384
     HEAP8[$27 >> 0] = $20; //@line 9385
     $34 = $21; //@line 9386
    } else {
     label = 12; //@line 9388
    }
   }
   do {
    if ((label | 0) == 12) {
     $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 9393
     $32 = ___overflow($1, $0) | 0; //@line 9394
     if (___async) {
      HEAP32[$AsyncCtx >> 2] = 106; //@line 9397
      HEAP32[$AsyncCtx + 4 >> 2] = $1; //@line 9399
      sp = STACKTOP; //@line 9400
      return 0; //@line 9401
     } else {
      _emscripten_free_async_context($AsyncCtx | 0); //@line 9403
      $34 = $32; //@line 9404
      break;
     }
    }
   } while (0);
   ___unlockfile($1); //@line 9409
   $$0 = $34; //@line 9410
  }
 }
 do {
  if ((label | 0) == 3) {
   $7 = $0 & 255; //@line 9415
   $8 = $0 & 255; //@line 9416
   if (($8 | 0) != (HEAP8[$1 + 75 >> 0] | 0)) {
    $13 = $1 + 20 | 0; //@line 9422
    $14 = HEAP32[$13 >> 2] | 0; //@line 9423
    if ($14 >>> 0 < (HEAP32[$1 + 16 >> 2] | 0) >>> 0) {
     HEAP32[$13 >> 2] = $14 + 1; //@line 9429
     HEAP8[$14 >> 0] = $7; //@line 9430
     $$0 = $8; //@line 9431
     break;
    }
   }
   $AsyncCtx3 = _emscripten_alloc_async_context(4, sp) | 0; //@line 9435
   $19 = ___overflow($1, $0) | 0; //@line 9436
   if (___async) {
    HEAP32[$AsyncCtx3 >> 2] = 105; //@line 9439
    sp = STACKTOP; //@line 9440
    return 0; //@line 9441
   } else {
    _emscripten_free_async_context($AsyncCtx3 | 0); //@line 9443
    $$0 = $19; //@line 9444
    break;
   }
  }
 } while (0);
 return $$0 | 0; //@line 9449
}
function _main__async_cb_23($0) {
 $0 = $0 | 0;
 var $10 = 0, $11 = 0, $13 = 0, $17 = 0, $18 = 0, $19 = 0, $4 = 0, $6 = 0, $7 = 0, $ReallocAsyncCtx2 = 0, $ReallocAsyncCtx9 = 0, sp = 0;
 sp = STACKTOP; //@line 12570
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 12574
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 12576
 $7 = HEAP32[HEAP32[$0 + 4 >> 2] >> 2] | 0; //@line 12577
 if (!$7) {
  $13 = $4 + 4 | 0; //@line 12581
  HEAP32[$13 >> 2] = 0; //@line 12583
  HEAP32[$13 + 4 >> 2] = 0; //@line 12586
  HEAP32[$4 >> 2] = 9; //@line 12587
  $17 = $4 + 12 | 0; //@line 12588
  HEAP32[$17 >> 2] = 440; //@line 12589
  $ReallocAsyncCtx9 = _emscripten_realloc_async_context(12) | 0; //@line 12590
  __ZN4mbed11InterruptIn4fallENS_8CallbackIFvvEEE(5292, $4); //@line 12591
  if (___async) {
   HEAP32[$ReallocAsyncCtx9 >> 2] = 96; //@line 12594
   $18 = $ReallocAsyncCtx9 + 4 | 0; //@line 12595
   HEAP32[$18 >> 2] = $17; //@line 12596
   $19 = $ReallocAsyncCtx9 + 8 | 0; //@line 12597
   HEAP32[$19 >> 2] = $4; //@line 12598
   sp = STACKTOP; //@line 12599
   return;
  }
  ___async_unwind = 0; //@line 12602
  HEAP32[$ReallocAsyncCtx9 >> 2] = 96; //@line 12603
  $18 = $ReallocAsyncCtx9 + 4 | 0; //@line 12604
  HEAP32[$18 >> 2] = $17; //@line 12605
  $19 = $ReallocAsyncCtx9 + 8 | 0; //@line 12606
  HEAP32[$19 >> 2] = $4; //@line 12607
  sp = STACKTOP; //@line 12608
  return;
 } else {
  $10 = HEAP32[$7 + 8 >> 2] | 0; //@line 12612
  $ReallocAsyncCtx2 = _emscripten_realloc_async_context(8) | 0; //@line 12613
  FUNCTION_TABLE_vi[$10 & 255]($6); //@line 12614
  if (___async) {
   HEAP32[$ReallocAsyncCtx2 >> 2] = 95; //@line 12617
   $11 = $ReallocAsyncCtx2 + 4 | 0; //@line 12618
   HEAP32[$11 >> 2] = $4; //@line 12619
   sp = STACKTOP; //@line 12620
   return;
  }
  ___async_unwind = 0; //@line 12623
  HEAP32[$ReallocAsyncCtx2 >> 2] = 95; //@line 12624
  $11 = $ReallocAsyncCtx2 + 4 | 0; //@line 12625
  HEAP32[$11 >> 2] = $4; //@line 12626
  sp = STACKTOP; //@line 12627
  return;
 }
}
function ___fwritex($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$038 = 0, $$1 = 0, $$139 = 0, $$141 = 0, $$143 = 0, $10 = 0, $12 = 0, $14 = 0, $22 = 0, $28 = 0, $3 = 0, $31 = 0, $4 = 0, $9 = 0, label = 0;
 $3 = $2 + 16 | 0; //@line 6250
 $4 = HEAP32[$3 >> 2] | 0; //@line 6251
 if (!$4) {
  if (!(___towrite($2) | 0)) {
   $12 = HEAP32[$3 >> 2] | 0; //@line 6258
   label = 5; //@line 6259
  } else {
   $$1 = 0; //@line 6261
  }
 } else {
  $12 = $4; //@line 6265
  label = 5; //@line 6266
 }
 L5 : do {
  if ((label | 0) == 5) {
   $9 = $2 + 20 | 0; //@line 6270
   $10 = HEAP32[$9 >> 2] | 0; //@line 6271
   $14 = $10; //@line 6274
   if (($12 - $10 | 0) >>> 0 < $1 >>> 0) {
    $$1 = FUNCTION_TABLE_iiii[HEAP32[$2 + 36 >> 2] & 7]($2, $0, $1) | 0; //@line 6279
    break;
   }
   L10 : do {
    if ((HEAP8[$2 + 75 >> 0] | 0) > -1) {
     $$038 = $1; //@line 6287
     while (1) {
      if (!$$038) {
       $$139 = 0; //@line 6291
       $$141 = $0; //@line 6291
       $$143 = $1; //@line 6291
       $31 = $14; //@line 6291
       break L10;
      }
      $22 = $$038 + -1 | 0; //@line 6294
      if ((HEAP8[$0 + $22 >> 0] | 0) == 10) {
       break;
      } else {
       $$038 = $22; //@line 6301
      }
     }
     $28 = FUNCTION_TABLE_iiii[HEAP32[$2 + 36 >> 2] & 7]($2, $0, $$038) | 0; //@line 6306
     if ($28 >>> 0 < $$038 >>> 0) {
      $$1 = $28; //@line 6309
      break L5;
     }
     $$139 = $$038; //@line 6315
     $$141 = $0 + $$038 | 0; //@line 6315
     $$143 = $1 - $$038 | 0; //@line 6315
     $31 = HEAP32[$9 >> 2] | 0; //@line 6315
    } else {
     $$139 = 0; //@line 6317
     $$141 = $0; //@line 6317
     $$143 = $1; //@line 6317
     $31 = $14; //@line 6317
    }
   } while (0);
   _memcpy($31 | 0, $$141 | 0, $$143 | 0) | 0; //@line 6320
   HEAP32[$9 >> 2] = (HEAP32[$9 >> 2] | 0) + $$143; //@line 6323
   $$1 = $$139 + $$143 | 0; //@line 6325
  }
 } while (0);
 return $$1 | 0; //@line 6328
}
function __ZN4mbed11InterruptIn4fallENS_8CallbackIFvvEEE__async_cb_15($0) {
 $0 = $0 | 0;
 var $$phi$trans$insert = 0, $$pre10 = 0, $10 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx4 = 0, sp = 0;
 sp = STACKTOP; //@line 12264
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 12268
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 12270
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 12272
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 12274
 $$phi$trans$insert = (HEAP32[$0 + 4 >> 2] | 0) + 12 | 0; //@line 12275
 $$pre10 = HEAP32[$$phi$trans$insert >> 2] | 0; //@line 12276
 if (!$$pre10) {
  HEAP32[$4 >> 2] = 0; //@line 12279
  _gpio_irq_set($10 + 28 | 0, 2, 0); //@line 12281
  return;
 }
 $13 = HEAP32[$$pre10 + 4 >> 2] | 0; //@line 12285
 $ReallocAsyncCtx4 = _emscripten_realloc_async_context(20) | 0; //@line 12286
 FUNCTION_TABLE_vii[$13 & 3]($6, $8); //@line 12287
 if (___async) {
  HEAP32[$ReallocAsyncCtx4 >> 2] = 30; //@line 12290
  $14 = $ReallocAsyncCtx4 + 4 | 0; //@line 12291
  HEAP32[$14 >> 2] = $$phi$trans$insert; //@line 12292
  $15 = $ReallocAsyncCtx4 + 8 | 0; //@line 12293
  HEAP32[$15 >> 2] = $4; //@line 12294
  $16 = $ReallocAsyncCtx4 + 12 | 0; //@line 12295
  HEAP32[$16 >> 2] = $8; //@line 12296
  $17 = $ReallocAsyncCtx4 + 16 | 0; //@line 12297
  HEAP32[$17 >> 2] = $10; //@line 12298
  sp = STACKTOP; //@line 12299
  return;
 }
 ___async_unwind = 0; //@line 12302
 HEAP32[$ReallocAsyncCtx4 >> 2] = 30; //@line 12303
 $14 = $ReallocAsyncCtx4 + 4 | 0; //@line 12304
 HEAP32[$14 >> 2] = $$phi$trans$insert; //@line 12305
 $15 = $ReallocAsyncCtx4 + 8 | 0; //@line 12306
 HEAP32[$15 >> 2] = $4; //@line 12307
 $16 = $ReallocAsyncCtx4 + 12 | 0; //@line 12308
 HEAP32[$16 >> 2] = $8; //@line 12309
 $17 = $ReallocAsyncCtx4 + 16 | 0; //@line 12310
 HEAP32[$17 >> 2] = $10; //@line 12311
 sp = STACKTOP; //@line 12312
 return;
}
function __GLOBAL__sub_I_main_cpp() {
 var $AsyncCtx = 0, $AsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 2130
 HEAP32[1305] = 0; //@line 2131
 HEAP32[1306] = 0; //@line 2131
 HEAP32[1307] = 0; //@line 2131
 HEAP32[1308] = 0; //@line 2131
 HEAP32[1309] = 0; //@line 2131
 HEAP32[1310] = 0; //@line 2131
 _gpio_init_out(5220, 50); //@line 2132
 HEAP32[1311] = 0; //@line 2133
 HEAP32[1312] = 0; //@line 2133
 HEAP32[1313] = 0; //@line 2133
 HEAP32[1314] = 0; //@line 2133
 HEAP32[1315] = 0; //@line 2133
 HEAP32[1316] = 0; //@line 2133
 _gpio_init_out(5244, 52); //@line 2134
 HEAP32[1317] = 0; //@line 2135
 HEAP32[1318] = 0; //@line 2135
 HEAP32[1319] = 0; //@line 2135
 HEAP32[1320] = 0; //@line 2135
 HEAP32[1321] = 0; //@line 2135
 HEAP32[1322] = 0; //@line 2135
 _gpio_init_out(5268, 53); //@line 2136
 $AsyncCtx3 = _emscripten_alloc_async_context(4, sp) | 0; //@line 2137
 __ZN4mbed10TimerEventC2Ev(5088); //@line 2138
 if (___async) {
  HEAP32[$AsyncCtx3 >> 2] = 84; //@line 2141
  sp = STACKTOP; //@line 2142
  return;
 }
 _emscripten_free_async_context($AsyncCtx3 | 0); //@line 2145
 HEAP32[1272] = 428; //@line 2146
 HEAP32[1282] = 0; //@line 2147
 HEAP32[1283] = 0; //@line 2147
 HEAP32[1284] = 0; //@line 2147
 HEAP32[1285] = 0; //@line 2147
 HEAP8[5144] = 1; //@line 2148
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 2149
 __ZN4mbed10TimerEventC2Ev(5152); //@line 2150
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 85; //@line 2153
  sp = STACKTOP; //@line 2154
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 2157
  HEAP32[1298] = 0; //@line 2158
  HEAP32[1299] = 0; //@line 2158
  HEAP32[1300] = 0; //@line 2158
  HEAP32[1301] = 0; //@line 2158
  HEAP8[5208] = 1; //@line 2159
  HEAP32[1288] = 352; //@line 2160
  __ZN4mbed11InterruptInC2E7PinName(5292, 1337); //@line 2161
  return;
 }
}
function __ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_49($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $25 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 13631
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 13635
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 13637
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 13639
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 13641
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 13643
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 13645
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 13647
 $18 = HEAP8[$0 + 36 >> 0] & 1; //@line 13650
 $25 = (HEAP32[$0 + 4 >> 2] | 0) + 8 | 0; //@line 13651
 do {
  if ($25 >>> 0 < $4 >>> 0) {
   if (!(HEAP8[$6 >> 0] | 0)) {
    if ((HEAP32[$8 >> 2] | 0) == 1) {
     if ((HEAP32[$10 >> 2] | 0) == 1) {
      break;
     }
    }
    $ReallocAsyncCtx2 = _emscripten_realloc_async_context(40) | 0; //@line 13667
    __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($25, $12, $14, $16, $18); //@line 13668
    if (!___async) {
     ___async_unwind = 0; //@line 13671
    }
    HEAP32[$ReallocAsyncCtx2 >> 2] = 127; //@line 13673
    HEAP32[$ReallocAsyncCtx2 + 4 >> 2] = $25; //@line 13675
    HEAP32[$ReallocAsyncCtx2 + 8 >> 2] = $4; //@line 13677
    HEAP32[$ReallocAsyncCtx2 + 12 >> 2] = $6; //@line 13679
    HEAP32[$ReallocAsyncCtx2 + 16 >> 2] = $8; //@line 13681
    HEAP32[$ReallocAsyncCtx2 + 20 >> 2] = $10; //@line 13683
    HEAP32[$ReallocAsyncCtx2 + 24 >> 2] = $12; //@line 13685
    HEAP32[$ReallocAsyncCtx2 + 28 >> 2] = $14; //@line 13687
    HEAP32[$ReallocAsyncCtx2 + 32 >> 2] = $16; //@line 13689
    HEAP8[$ReallocAsyncCtx2 + 36 >> 0] = $18 & 1; //@line 13692
    sp = STACKTOP; //@line 13693
    return;
   }
  }
 } while (0);
 return;
}
function ___overflow($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0 = 0, $10 = 0, $12 = 0, $13 = 0, $2 = 0, $20 = 0, $21 = 0, $3 = 0, $4 = 0, $5 = 0, $9 = 0, $AsyncCtx = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 6136
 STACKTOP = STACKTOP + 16 | 0; //@line 6137
 $2 = sp; //@line 6138
 $3 = $1 & 255; //@line 6139
 HEAP8[$2 >> 0] = $3; //@line 6140
 $4 = $0 + 16 | 0; //@line 6141
 $5 = HEAP32[$4 >> 2] | 0; //@line 6142
 if (!$5) {
  if (!(___towrite($0) | 0)) {
   $12 = HEAP32[$4 >> 2] | 0; //@line 6149
   label = 4; //@line 6150
  } else {
   $$0 = -1; //@line 6152
  }
 } else {
  $12 = $5; //@line 6155
  label = 4; //@line 6156
 }
 do {
  if ((label | 0) == 4) {
   $9 = $0 + 20 | 0; //@line 6160
   $10 = HEAP32[$9 >> 2] | 0; //@line 6161
   if ($10 >>> 0 < $12 >>> 0) {
    $13 = $1 & 255; //@line 6164
    if (($13 | 0) != (HEAP8[$0 + 75 >> 0] | 0)) {
     HEAP32[$9 >> 2] = $10 + 1; //@line 6171
     HEAP8[$10 >> 0] = $3; //@line 6172
     $$0 = $13; //@line 6173
     break;
    }
   }
   $20 = HEAP32[$0 + 36 >> 2] | 0; //@line 6178
   $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 6179
   $21 = FUNCTION_TABLE_iiii[$20 & 7]($0, $2, 1) | 0; //@line 6180
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 103; //@line 6183
    HEAP32[$AsyncCtx + 4 >> 2] = $2; //@line 6185
    sp = STACKTOP; //@line 6186
    STACKTOP = sp; //@line 6187
    return 0; //@line 6187
   }
   _emscripten_free_async_context($AsyncCtx | 0); //@line 6189
   if (($21 | 0) == 1) {
    $$0 = HEAPU8[$2 >> 0] | 0; //@line 6194
   } else {
    $$0 = -1; //@line 6196
   }
  }
 } while (0);
 STACKTOP = sp; //@line 6200
 return $$0 | 0; //@line 6200
}
function _memset(ptr, value, num) {
 ptr = ptr | 0;
 value = value | 0;
 num = num | 0;
 var end = 0, aligned_end = 0, block_aligned_end = 0, value4 = 0;
 end = ptr + num | 0; //@line 1740
 value = value & 255; //@line 1742
 if ((num | 0) >= 67) {
  while (ptr & 3) {
   HEAP8[ptr >> 0] = value; //@line 1745
   ptr = ptr + 1 | 0; //@line 1746
  }
  aligned_end = end & -4 | 0; //@line 1749
  block_aligned_end = aligned_end - 64 | 0; //@line 1750
  value4 = value | value << 8 | value << 16 | value << 24; //@line 1751
  while ((ptr | 0) <= (block_aligned_end | 0)) {
   HEAP32[ptr >> 2] = value4; //@line 1754
   HEAP32[ptr + 4 >> 2] = value4; //@line 1755
   HEAP32[ptr + 8 >> 2] = value4; //@line 1756
   HEAP32[ptr + 12 >> 2] = value4; //@line 1757
   HEAP32[ptr + 16 >> 2] = value4; //@line 1758
   HEAP32[ptr + 20 >> 2] = value4; //@line 1759
   HEAP32[ptr + 24 >> 2] = value4; //@line 1760
   HEAP32[ptr + 28 >> 2] = value4; //@line 1761
   HEAP32[ptr + 32 >> 2] = value4; //@line 1762
   HEAP32[ptr + 36 >> 2] = value4; //@line 1763
   HEAP32[ptr + 40 >> 2] = value4; //@line 1764
   HEAP32[ptr + 44 >> 2] = value4; //@line 1765
   HEAP32[ptr + 48 >> 2] = value4; //@line 1766
   HEAP32[ptr + 52 >> 2] = value4; //@line 1767
   HEAP32[ptr + 56 >> 2] = value4; //@line 1768
   HEAP32[ptr + 60 >> 2] = value4; //@line 1769
   ptr = ptr + 64 | 0; //@line 1770
  }
  while ((ptr | 0) < (aligned_end | 0)) {
   HEAP32[ptr >> 2] = value4; //@line 1774
   ptr = ptr + 4 | 0; //@line 1775
  }
 }
 while ((ptr | 0) < (end | 0)) {
  HEAP8[ptr >> 0] = value; //@line 1780
  ptr = ptr + 1 | 0; //@line 1781
 }
 return end - num | 0; //@line 1783
}
function _main__async_cb_20($0) {
 $0 = $0 | 0;
 var $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $2 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx8 = 0, sp = 0;
 sp = STACKTOP; //@line 12468
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 12470
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 12472
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 12474
 $8 = $2 + 4 | 0; //@line 12476
 HEAP32[$8 >> 2] = 0; //@line 12478
 HEAP32[$8 + 4 >> 2] = 0; //@line 12481
 HEAP32[$2 >> 2] = 7; //@line 12482
 $12 = $2 + 12 | 0; //@line 12483
 HEAP32[$12 >> 2] = 440; //@line 12484
 $ReallocAsyncCtx8 = _emscripten_realloc_async_context(20) | 0; //@line 12485
 __ZN4mbed6Ticker6attachENS_8CallbackIFvvEEEf(5088, $2, 1.0); //@line 12486
 if (___async) {
  HEAP32[$ReallocAsyncCtx8 >> 2] = 92; //@line 12489
  $13 = $ReallocAsyncCtx8 + 4 | 0; //@line 12490
  HEAP32[$13 >> 2] = $2; //@line 12491
  $14 = $ReallocAsyncCtx8 + 8 | 0; //@line 12492
  HEAP32[$14 >> 2] = $12; //@line 12493
  $15 = $ReallocAsyncCtx8 + 12 | 0; //@line 12494
  HEAP32[$15 >> 2] = $4; //@line 12495
  $16 = $ReallocAsyncCtx8 + 16 | 0; //@line 12496
  HEAP32[$16 >> 2] = $6; //@line 12497
  sp = STACKTOP; //@line 12498
  return;
 }
 ___async_unwind = 0; //@line 12501
 HEAP32[$ReallocAsyncCtx8 >> 2] = 92; //@line 12502
 $13 = $ReallocAsyncCtx8 + 4 | 0; //@line 12503
 HEAP32[$13 >> 2] = $2; //@line 12504
 $14 = $ReallocAsyncCtx8 + 8 | 0; //@line 12505
 HEAP32[$14 >> 2] = $12; //@line 12506
 $15 = $ReallocAsyncCtx8 + 12 | 0; //@line 12507
 HEAP32[$15 >> 2] = $4; //@line 12508
 $16 = $ReallocAsyncCtx8 + 16 | 0; //@line 12509
 HEAP32[$16 >> 2] = $6; //@line 12510
 sp = STACKTOP; //@line 12511
 return;
}
function __ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $16 = 0, $21 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 13568
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 13572
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 13574
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 13576
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 13578
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 13580
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 13582
 $16 = HEAP8[$0 + 32 >> 0] & 1; //@line 13585
 $21 = (HEAP32[$0 + 4 >> 2] | 0) + 8 | 0; //@line 13586
 if ($21 >>> 0 < $4 >>> 0) {
  if (!(HEAP8[$6 >> 0] | 0)) {
   if ((HEAP32[$8 >> 2] | 0) != 1) {
    $ReallocAsyncCtx = _emscripten_realloc_async_context(36) | 0; //@line 13595
    __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($21, $10, $12, $14, $16); //@line 13596
    if (!___async) {
     ___async_unwind = 0; //@line 13599
    }
    HEAP32[$ReallocAsyncCtx >> 2] = 128; //@line 13601
    HEAP32[$ReallocAsyncCtx + 4 >> 2] = $21; //@line 13603
    HEAP32[$ReallocAsyncCtx + 8 >> 2] = $4; //@line 13605
    HEAP32[$ReallocAsyncCtx + 12 >> 2] = $6; //@line 13607
    HEAP32[$ReallocAsyncCtx + 16 >> 2] = $8; //@line 13609
    HEAP32[$ReallocAsyncCtx + 20 >> 2] = $10; //@line 13611
    HEAP32[$ReallocAsyncCtx + 24 >> 2] = $12; //@line 13613
    HEAP32[$ReallocAsyncCtx + 28 >> 2] = $14; //@line 13615
    HEAP8[$ReallocAsyncCtx + 32 >> 0] = $16 & 1; //@line 13618
    sp = STACKTOP; //@line 13619
    return;
   }
  }
 }
 return;
}
function __ZN4mbed11InterruptIn4fallENS_8CallbackIFvvEEE__async_cb($0) {
 $0 = $0 | 0;
 var $$pre = 0, $10 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $2 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 12198
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 12200
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 12202
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 12204
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 12206
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 12208
 $$pre = HEAP32[$2 >> 2] | 0; //@line 12209
 if (!$$pre) {
  HEAP32[$4 >> 2] = 0; //@line 12212
  _gpio_irq_set($10 + 28 | 0, 2, 1); //@line 12214
  return;
 }
 $13 = HEAP32[$$pre + 4 >> 2] | 0; //@line 12218
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(16) | 0; //@line 12219
 FUNCTION_TABLE_vii[$13 & 3]($6, $8); //@line 12220
 if (___async) {
  HEAP32[$ReallocAsyncCtx2 >> 2] = 28; //@line 12223
  $14 = $ReallocAsyncCtx2 + 4 | 0; //@line 12224
  HEAP32[$14 >> 2] = $2; //@line 12225
  $15 = $ReallocAsyncCtx2 + 8 | 0; //@line 12226
  HEAP32[$15 >> 2] = $4; //@line 12227
  $16 = $ReallocAsyncCtx2 + 12 | 0; //@line 12228
  HEAP32[$16 >> 2] = $10; //@line 12229
  sp = STACKTOP; //@line 12230
  return;
 }
 ___async_unwind = 0; //@line 12233
 HEAP32[$ReallocAsyncCtx2 >> 2] = 28; //@line 12234
 $14 = $ReallocAsyncCtx2 + 4 | 0; //@line 12235
 HEAP32[$14 >> 2] = $2; //@line 12236
 $15 = $ReallocAsyncCtx2 + 8 | 0; //@line 12237
 HEAP32[$15 >> 2] = $4; //@line 12238
 $16 = $ReallocAsyncCtx2 + 12 | 0; //@line 12239
 HEAP32[$16 >> 2] = $10; //@line 12240
 sp = STACKTOP; //@line 12241
 return;
}
function _wcrtomb($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$0 = 0;
 do {
  if (!$0) {
   $$0 = 1; //@line 9164
  } else {
   if ($1 >>> 0 < 128) {
    HEAP8[$0 >> 0] = $1; //@line 9169
    $$0 = 1; //@line 9170
    break;
   }
   if (!(HEAP32[HEAP32[(___pthread_self_910() | 0) + 188 >> 2] >> 2] | 0)) {
    if (($1 & -128 | 0) == 57216) {
     HEAP8[$0 >> 0] = $1; //@line 9183
     $$0 = 1; //@line 9184
     break;
    } else {
     HEAP32[(___errno_location() | 0) >> 2] = 84; //@line 9188
     $$0 = -1; //@line 9189
     break;
    }
   }
   if ($1 >>> 0 < 2048) {
    HEAP8[$0 >> 0] = $1 >>> 6 | 192; //@line 9199
    HEAP8[$0 + 1 >> 0] = $1 & 63 | 128; //@line 9203
    $$0 = 2; //@line 9204
    break;
   }
   if ($1 >>> 0 < 55296 | ($1 & -8192 | 0) == 57344) {
    HEAP8[$0 >> 0] = $1 >>> 12 | 224; //@line 9216
    HEAP8[$0 + 1 >> 0] = $1 >>> 6 & 63 | 128; //@line 9222
    HEAP8[$0 + 2 >> 0] = $1 & 63 | 128; //@line 9226
    $$0 = 3; //@line 9227
    break;
   }
   if (($1 + -65536 | 0) >>> 0 < 1048576) {
    HEAP8[$0 >> 0] = $1 >>> 18 | 240; //@line 9237
    HEAP8[$0 + 1 >> 0] = $1 >>> 12 & 63 | 128; //@line 9243
    HEAP8[$0 + 2 >> 0] = $1 >>> 6 & 63 | 128; //@line 9249
    HEAP8[$0 + 3 >> 0] = $1 & 63 | 128; //@line 9253
    $$0 = 4; //@line 9254
    break;
   } else {
    HEAP32[(___errno_location() | 0) >> 2] = 84; //@line 9258
    $$0 = -1; //@line 9259
    break;
   }
  }
 } while (0);
 return $$0 | 0; //@line 9264
}
function __ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_50($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $17 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 13704
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 13708
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 13710
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 13712
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 13714
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 13716
 $14 = HEAP8[$0 + 28 >> 0] & 1; //@line 13719
 $17 = (HEAP32[$0 + 4 >> 2] | 0) + 8 | 0; //@line 13720
 if ($17 >>> 0 < $4 >>> 0) {
  if (!(HEAP8[$6 >> 0] | 0)) {
   $ReallocAsyncCtx3 = _emscripten_realloc_async_context(32) | 0; //@line 13726
   __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($17, $8, $10, $12, $14); //@line 13727
   if (!___async) {
    ___async_unwind = 0; //@line 13730
   }
   HEAP32[$ReallocAsyncCtx3 >> 2] = 126; //@line 13732
   HEAP32[$ReallocAsyncCtx3 + 4 >> 2] = $17; //@line 13734
   HEAP32[$ReallocAsyncCtx3 + 8 >> 2] = $4; //@line 13736
   HEAP32[$ReallocAsyncCtx3 + 12 >> 2] = $6; //@line 13738
   HEAP32[$ReallocAsyncCtx3 + 16 >> 2] = $8; //@line 13740
   HEAP32[$ReallocAsyncCtx3 + 20 >> 2] = $10; //@line 13742
   HEAP32[$ReallocAsyncCtx3 + 24 >> 2] = $12; //@line 13744
   HEAP8[$ReallocAsyncCtx3 + 28 >> 0] = $14 & 1; //@line 13747
   sp = STACKTOP; //@line 13748
   return;
  }
 }
 return;
}
function __ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv__async_cb_62($0) {
 $0 = $0 | 0;
 var $15 = 0, $16 = 0, $2 = 0, $4 = 0, $6 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx = 0, dest = 0, sp = 0, stop = 0;
 sp = STACKTOP; //@line 980
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 982
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 984
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 986
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 988
 if (!$AsyncRetVal) {
  HEAP8[___async_retval >> 0] = 0; //@line 993
  return;
 }
 dest = $2 + 4 | 0; //@line 997
 stop = dest + 52 | 0; //@line 997
 do {
  HEAP32[dest >> 2] = 0; //@line 997
  dest = dest + 4 | 0; //@line 997
 } while ((dest | 0) < (stop | 0));
 HEAP32[$2 >> 2] = $AsyncRetVal; //@line 998
 HEAP32[$2 + 8 >> 2] = $4; //@line 1000
 HEAP32[$2 + 12 >> 2] = -1; //@line 1002
 HEAP32[$2 + 48 >> 2] = 1; //@line 1004
 $15 = HEAP32[(HEAP32[$AsyncRetVal >> 2] | 0) + 28 >> 2] | 0; //@line 1007
 $16 = HEAP32[$6 >> 2] | 0; //@line 1008
 $ReallocAsyncCtx = _emscripten_realloc_async_context(16) | 0; //@line 1009
 FUNCTION_TABLE_viiii[$15 & 3]($AsyncRetVal, $2, $16, 1); //@line 1010
 if (!___async) {
  ___async_unwind = 0; //@line 1013
 }
 HEAP32[$ReallocAsyncCtx >> 2] = 113; //@line 1015
 HEAP32[$ReallocAsyncCtx + 4 >> 2] = $2; //@line 1017
 HEAP32[$ReallocAsyncCtx + 8 >> 2] = $6; //@line 1019
 HEAP32[$ReallocAsyncCtx + 12 >> 2] = $2; //@line 1021
 sp = STACKTOP; //@line 1022
 return;
}
function _main__async_cb($0) {
 $0 = $0 | 0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $2 = 0, $4 = 0, $6 = 0, $ReallocAsyncCtx7 = 0, sp = 0;
 sp = STACKTOP; //@line 12374
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 12376
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 12378
 $6 = $2 + 4 | 0; //@line 12380
 HEAP32[$6 >> 2] = 0; //@line 12382
 HEAP32[$6 + 4 >> 2] = 0; //@line 12385
 HEAP32[$2 >> 2] = 8; //@line 12386
 $10 = $2 + 12 | 0; //@line 12387
 HEAP32[$10 >> 2] = 440; //@line 12388
 $ReallocAsyncCtx7 = _emscripten_realloc_async_context(16) | 0; //@line 12389
 __ZN4mbed6Ticker6attachENS_8CallbackIFvvEEEf(5152, $2, 2.5); //@line 12390
 if (___async) {
  HEAP32[$ReallocAsyncCtx7 >> 2] = 94; //@line 12393
  $11 = $ReallocAsyncCtx7 + 4 | 0; //@line 12394
  HEAP32[$11 >> 2] = $10; //@line 12395
  $12 = $ReallocAsyncCtx7 + 8 | 0; //@line 12396
  HEAP32[$12 >> 2] = $4; //@line 12397
  $13 = $ReallocAsyncCtx7 + 12 | 0; //@line 12398
  HEAP32[$13 >> 2] = $2; //@line 12399
  sp = STACKTOP; //@line 12400
  return;
 }
 ___async_unwind = 0; //@line 12403
 HEAP32[$ReallocAsyncCtx7 >> 2] = 94; //@line 12404
 $11 = $ReallocAsyncCtx7 + 4 | 0; //@line 12405
 HEAP32[$11 >> 2] = $10; //@line 12406
 $12 = $ReallocAsyncCtx7 + 8 | 0; //@line 12407
 HEAP32[$12 >> 2] = $4; //@line 12408
 $13 = $ReallocAsyncCtx7 + 12 | 0; //@line 12409
 HEAP32[$13 >> 2] = $2; //@line 12410
 sp = STACKTOP; //@line 12411
 return;
}
function _fmt_u($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$010$lcssa$off0 = 0, $$012 = 0, $$09$lcssa = 0, $$0914 = 0, $$1$lcssa = 0, $$111 = 0, $10 = 0, $26 = 0, $8 = 0, $9 = 0, $8$looptemp = 0;
 if ($1 >>> 0 > 0 | ($1 | 0) == 0 & $0 >>> 0 > 4294967295) {
  $$0914 = $2; //@line 8048
  $8 = $0; //@line 8048
  $9 = $1; //@line 8048
  while (1) {
   $10 = ___uremdi3($8 | 0, $9 | 0, 10, 0) | 0; //@line 8050
   $$0914 = $$0914 + -1 | 0; //@line 8054
   HEAP8[$$0914 >> 0] = $10 & 255 | 48; //@line 8055
   $8$looptemp = $8;
   $8 = ___udivdi3($8 | 0, $9 | 0, 10, 0) | 0; //@line 8056
   if (!($9 >>> 0 > 9 | ($9 | 0) == 9 & $8$looptemp >>> 0 > 4294967295)) {
    break;
   } else {
    $9 = tempRet0; //@line 8064
   }
  }
  $$010$lcssa$off0 = $8; //@line 8069
  $$09$lcssa = $$0914; //@line 8069
 } else {
  $$010$lcssa$off0 = $0; //@line 8071
  $$09$lcssa = $2; //@line 8071
 }
 if (!$$010$lcssa$off0) {
  $$1$lcssa = $$09$lcssa; //@line 8075
 } else {
  $$012 = $$010$lcssa$off0; //@line 8077
  $$111 = $$09$lcssa; //@line 8077
  while (1) {
   $26 = $$111 + -1 | 0; //@line 8082
   HEAP8[$26 >> 0] = ($$012 >>> 0) % 10 | 0 | 48; //@line 8083
   if ($$012 >>> 0 < 10) {
    $$1$lcssa = $26; //@line 8087
    break;
   } else {
    $$012 = ($$012 >>> 0) / 10 | 0; //@line 8090
    $$111 = $26; //@line 8090
   }
  }
 }
 return $$1$lcssa | 0; //@line 8094
}
function __ZNK10__cxxabiv121__vmi_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $13 = 0, $2 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 12914
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 12916
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 12920
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 12922
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 12924
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 12926
 if (!(HEAP8[$2 >> 0] | 0)) {
  $13 = (HEAP32[$0 + 8 >> 2] | 0) + 8 | 0; //@line 12930
  if ($13 >>> 0 < $6 >>> 0) {
   $ReallocAsyncCtx = _emscripten_realloc_async_context(28) | 0; //@line 12933
   __ZNK10__cxxabiv122__base_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($13, $8, $10, $12); //@line 12934
   if (!___async) {
    ___async_unwind = 0; //@line 12937
   }
   HEAP32[$ReallocAsyncCtx >> 2] = 130; //@line 12939
   HEAP32[$ReallocAsyncCtx + 4 >> 2] = $2; //@line 12941
   HEAP32[$ReallocAsyncCtx + 8 >> 2] = $13; //@line 12943
   HEAP32[$ReallocAsyncCtx + 12 >> 2] = $6; //@line 12945
   HEAP32[$ReallocAsyncCtx + 16 >> 2] = $8; //@line 12947
   HEAP32[$ReallocAsyncCtx + 20 >> 2] = $10; //@line 12949
   HEAP32[$ReallocAsyncCtx + 24 >> 2] = $12; //@line 12951
   sp = STACKTOP; //@line 12952
   return;
  }
 }
 return;
}
function _strlen($0) {
 $0 = $0 | 0;
 var $$0 = 0, $$015$lcssa = 0, $$01519 = 0, $$1$lcssa = 0, $$pn = 0, $$sink = 0, $1 = 0, $10 = 0, $19 = 0, $23 = 0, $6 = 0, label = 0;
 $1 = $0; //@line 6002
 L1 : do {
  if (!($1 & 3)) {
   $$015$lcssa = $0; //@line 6007
   label = 4; //@line 6008
  } else {
   $$01519 = $0; //@line 6010
   $23 = $1; //@line 6010
   while (1) {
    if (!(HEAP8[$$01519 >> 0] | 0)) {
     $$sink = $23; //@line 6015
     break L1;
    }
    $6 = $$01519 + 1 | 0; //@line 6018
    $23 = $6; //@line 6019
    if (!($23 & 3)) {
     $$015$lcssa = $6; //@line 6023
     label = 4; //@line 6024
     break;
    } else {
     $$01519 = $6; //@line 6027
    }
   }
  }
 } while (0);
 if ((label | 0) == 4) {
  $$0 = $$015$lcssa; //@line 6033
  while (1) {
   $10 = HEAP32[$$0 >> 2] | 0; //@line 6035
   if (!(($10 & -2139062144 ^ -2139062144) & $10 + -16843009)) {
    $$0 = $$0 + 4 | 0; //@line 6043
   } else {
    break;
   }
  }
  if (!(($10 & 255) << 24 >> 24)) {
   $$1$lcssa = $$0; //@line 6051
  } else {
   $$pn = $$0; //@line 6053
   while (1) {
    $19 = $$pn + 1 | 0; //@line 6055
    if (!(HEAP8[$19 >> 0] | 0)) {
     $$1$lcssa = $19; //@line 6059
     break;
    } else {
     $$pn = $19; //@line 6062
    }
   }
  }
  $$sink = $$1$lcssa; //@line 6067
 }
 return $$sink - $1 | 0; //@line 6070
}
function __ZNK10__cxxabiv117__class_type_info29process_static_type_above_dstEPNS_19__dynamic_cast_infoEPKvS4_i($0, $1, $2, $3, $4) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 var $10 = 0, $11 = 0, $21 = 0, $22 = 0, $28 = 0, $30 = 0;
 HEAP8[$1 + 53 >> 0] = 1; //@line 9961
 do {
  if ((HEAP32[$1 + 4 >> 2] | 0) == ($3 | 0)) {
   HEAP8[$1 + 52 >> 0] = 1; //@line 9968
   $10 = $1 + 16 | 0; //@line 9969
   $11 = HEAP32[$10 >> 2] | 0; //@line 9970
   if (!$11) {
    HEAP32[$10 >> 2] = $2; //@line 9973
    HEAP32[$1 + 24 >> 2] = $4; //@line 9975
    HEAP32[$1 + 36 >> 2] = 1; //@line 9977
    if (!(($4 | 0) == 1 ? (HEAP32[$1 + 48 >> 2] | 0) == 1 : 0)) {
     break;
    }
    HEAP8[$1 + 54 >> 0] = 1; //@line 9987
    break;
   }
   if (($11 | 0) != ($2 | 0)) {
    $30 = $1 + 36 | 0; //@line 9992
    HEAP32[$30 >> 2] = (HEAP32[$30 >> 2] | 0) + 1; //@line 9995
    HEAP8[$1 + 54 >> 0] = 1; //@line 9997
    break;
   }
   $21 = $1 + 24 | 0; //@line 10000
   $22 = HEAP32[$21 >> 2] | 0; //@line 10001
   if (($22 | 0) == 2) {
    HEAP32[$21 >> 2] = $4; //@line 10004
    $28 = $4; //@line 10005
   } else {
    $28 = $22; //@line 10007
   }
   if (($28 | 0) == 1 ? (HEAP32[$1 + 48 >> 2] | 0) == 1 : 0) {
    HEAP8[$1 + 54 >> 0] = 1; //@line 10016
   }
  }
 } while (0);
 return;
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
     FUNCTION_TABLE_vi[$7 & 255]($2 + 40 | 0); //@line 188
     if (___async) {
      HEAP32[$AsyncCtx >> 2] = 25; //@line 191
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
     FUNCTION_TABLE_vi[$12 & 255]($2 + 56 | 0); //@line 209
     if (___async) {
      HEAP32[$AsyncCtx2 >> 2] = 26; //@line 212
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
function __ZN4mbed11InterruptIn4fallENS_8CallbackIFvvEEE__async_cb_16($0) {
 $0 = $0 | 0;
 var $$pre$i$i4 = 0, $12 = 0, $13 = 0, $14 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx5 = 0, sp = 0;
 sp = STACKTOP; //@line 12318
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 12324
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 12326
 $$pre$i$i4 = HEAP32[HEAP32[$0 + 4 >> 2] >> 2] | 0; //@line 12327
 HEAP32[HEAP32[$0 + 8 >> 2] >> 2] = $$pre$i$i4; //@line 12328
 if (!$$pre$i$i4) {
  _gpio_irq_set($8 + 28 | 0, 2, 0); //@line 12332
  return;
 }
 $12 = HEAP32[$$pre$i$i4 + 8 >> 2] | 0; //@line 12337
 $ReallocAsyncCtx5 = _emscripten_realloc_async_context(12) | 0; //@line 12338
 FUNCTION_TABLE_vi[$12 & 255]($6); //@line 12339
 if (___async) {
  HEAP32[$ReallocAsyncCtx5 >> 2] = 31; //@line 12342
  $13 = $ReallocAsyncCtx5 + 4 | 0; //@line 12343
  HEAP32[$13 >> 2] = $6; //@line 12344
  $14 = $ReallocAsyncCtx5 + 8 | 0; //@line 12345
  HEAP32[$14 >> 2] = $8; //@line 12346
  sp = STACKTOP; //@line 12347
  return;
 }
 ___async_unwind = 0; //@line 12350
 HEAP32[$ReallocAsyncCtx5 >> 2] = 31; //@line 12351
 $13 = $ReallocAsyncCtx5 + 4 | 0; //@line 12352
 HEAP32[$13 >> 2] = $6; //@line 12353
 $14 = $ReallocAsyncCtx5 + 8 | 0; //@line 12354
 HEAP32[$14 >> 2] = $8; //@line 12355
 sp = STACKTOP; //@line 12356
 return;
}
function _puts($0) {
 $0 = $0 | 0;
 var $1 = 0, $11 = 0, $12 = 0, $17 = 0, $19 = 0, $22 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 9455
 $1 = HEAP32[147] | 0; //@line 9456
 if ((HEAP32[$1 + 76 >> 2] | 0) > -1) {
  $19 = ___lockfile($1) | 0; //@line 9462
 } else {
  $19 = 0; //@line 9464
 }
 do {
  if ((_fputs($0, $1) | 0) < 0) {
   $22 = -1; //@line 9470
  } else {
   if ((HEAP8[$1 + 75 >> 0] | 0) != 10) {
    $11 = $1 + 20 | 0; //@line 9476
    $12 = HEAP32[$11 >> 2] | 0; //@line 9477
    if ($12 >>> 0 < (HEAP32[$1 + 16 >> 2] | 0) >>> 0) {
     HEAP32[$11 >> 2] = $12 + 1; //@line 9483
     HEAP8[$12 >> 0] = 10; //@line 9484
     $22 = 0; //@line 9485
     break;
    }
   }
   $AsyncCtx = _emscripten_alloc_async_context(12, sp) | 0; //@line 9489
   $17 = ___overflow($1, 10) | 0; //@line 9490
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 107; //@line 9493
    HEAP32[$AsyncCtx + 4 >> 2] = $19; //@line 9495
    HEAP32[$AsyncCtx + 8 >> 2] = $1; //@line 9497
    sp = STACKTOP; //@line 9498
    return 0; //@line 9499
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 9501
    $22 = $17 >> 31; //@line 9503
    break;
   }
  }
 } while (0);
 if ($19 | 0) {
  ___unlockfile($1); //@line 9510
 }
 return $22 | 0; //@line 9512
}
function __ZN4mbed11InterruptInD0Ev($0) {
 $0 = $0 | 0;
 var $10 = 0, $14 = 0, $3 = 0, $7 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 107
 HEAP32[$0 >> 2] = 336; //@line 108
 _gpio_irq_free($0 + 28 | 0); //@line 110
 $3 = HEAP32[$0 + 68 >> 2] | 0; //@line 112
 do {
  if ($3 | 0) {
   $7 = HEAP32[$3 + 8 >> 2] | 0; //@line 118
   $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 119
   FUNCTION_TABLE_vi[$7 & 255]($0 + 56 | 0); //@line 120
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 23; //@line 123
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
 FUNCTION_TABLE_vi[$14 & 255]($0 + 40 | 0); //@line 145
 if (___async) {
  HEAP32[$AsyncCtx3 >> 2] = 24; //@line 148
  HEAP32[$AsyncCtx3 + 4 >> 2] = $0; //@line 150
  sp = STACKTOP; //@line 151
  return;
 }
 _emscripten_free_async_context($AsyncCtx3 | 0); //@line 154
 __ZdlPv($0); //@line 155
 return;
}
function __ZNK10__cxxabiv121__vmi_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb_30($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 12962
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 12968
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 12970
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 12972
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 12974
 if ((HEAP32[$0 + 4 >> 2] | 0) <= 1) {
  return;
 }
 $14 = (HEAP32[$0 + 8 >> 2] | 0) + 24 | 0; //@line 12979
 $ReallocAsyncCtx = _emscripten_realloc_async_context(28) | 0; //@line 12981
 __ZNK10__cxxabiv122__base_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($14, $6, $8, $10); //@line 12982
 if (!___async) {
  ___async_unwind = 0; //@line 12985
 }
 HEAP32[$ReallocAsyncCtx >> 2] = 130; //@line 12987
 HEAP32[$ReallocAsyncCtx + 4 >> 2] = $6 + 54; //@line 12989
 HEAP32[$ReallocAsyncCtx + 8 >> 2] = $14; //@line 12991
 HEAP32[$ReallocAsyncCtx + 12 >> 2] = $12; //@line 12993
 HEAP32[$ReallocAsyncCtx + 16 >> 2] = $6; //@line 12995
 HEAP32[$ReallocAsyncCtx + 20 >> 2] = $8; //@line 12997
 HEAP32[$ReallocAsyncCtx + 24 >> 2] = $10; //@line 12999
 sp = STACKTOP; //@line 13000
 return;
}
function __ZL25default_terminate_handlerv__async_cb($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $15 = 0, $16 = 0, $2 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 13503
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 13505
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 13507
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 13509
 $8 = HEAP32[$0 + 20 >> 2] | 0; //@line 13511
 $10 = HEAP32[$0 + 24 >> 2] | 0; //@line 13513
 if (!(HEAP8[___async_retval >> 0] & 1)) {
  HEAP32[$4 >> 2] = 4649; //@line 13518
  HEAP32[$4 + 4 >> 2] = $6; //@line 13520
  _abort_message(4558, $4); //@line 13521
 }
 $12 = HEAP32[$2 >> 2] | 0; //@line 13524
 $15 = HEAP32[(HEAP32[$12 >> 2] | 0) + 8 >> 2] | 0; //@line 13527
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(16) | 0; //@line 13528
 $16 = FUNCTION_TABLE_ii[$15 & 1]($12) | 0; //@line 13529
 if (!___async) {
  HEAP32[___async_retval >> 2] = $16; //@line 13533
  ___async_unwind = 0; //@line 13534
 }
 HEAP32[$ReallocAsyncCtx2 >> 2] = 109; //@line 13536
 HEAP32[$ReallocAsyncCtx2 + 4 >> 2] = $8; //@line 13538
 HEAP32[$ReallocAsyncCtx2 + 8 >> 2] = $6; //@line 13540
 HEAP32[$ReallocAsyncCtx2 + 12 >> 2] = $10; //@line 13542
 sp = STACKTOP; //@line 13543
 return;
}
function __ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb($0) {
 $0 = $0 | 0;
 var $$037$off038 = 0, $$037$off039 = 0, $12 = 0, $17 = 0, $4 = 0, $6 = 0, $8 = 0, label = 0;
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 13430
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 13432
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 13434
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 13438
 if (!(HEAP8[HEAP32[$0 + 4 >> 2] >> 0] | 0)) {
  $$037$off038 = 4; //@line 13442
  label = 4; //@line 13443
 } else {
  if (!(HEAP8[HEAP32[$0 + 20 >> 2] >> 0] | 0)) {
   $$037$off038 = 3; //@line 13448
   label = 4; //@line 13449
  } else {
   $$037$off039 = 3; //@line 13451
  }
 }
 if ((label | 0) == 4) {
  HEAP32[$6 >> 2] = $4; //@line 13455
  $17 = $8 + 40 | 0; //@line 13456
  HEAP32[$17 >> 2] = (HEAP32[$17 >> 2] | 0) + 1; //@line 13459
  if ((HEAP32[$8 + 36 >> 2] | 0) == 1) {
   if ((HEAP32[$8 + 24 >> 2] | 0) == 2) {
    HEAP8[$8 + 54 >> 0] = 1; //@line 13469
    $$037$off039 = $$037$off038; //@line 13470
   } else {
    $$037$off039 = $$037$off038; //@line 13472
   }
  } else {
   $$037$off039 = $$037$off038; //@line 13475
  }
 }
 HEAP32[$12 >> 2] = $$037$off039; //@line 13478
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
   __ZNK10__cxxabiv117__class_type_info29process_static_type_below_dstEPNS_19__dynamic_cast_infoEPKvi(0, $1, $2, $3); //@line 9820
  } else {
   if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 >> 2] | 0, $4) | 0) {
    if ((HEAP32[$1 + 16 >> 2] | 0) != ($2 | 0)) {
     $13 = $1 + 20 | 0; //@line 9829
     if ((HEAP32[$13 >> 2] | 0) != ($2 | 0)) {
      HEAP32[$1 + 32 >> 2] = $3; //@line 9834
      HEAP32[$13 >> 2] = $2; //@line 9835
      $19 = $1 + 40 | 0; //@line 9836
      HEAP32[$19 >> 2] = (HEAP32[$19 >> 2] | 0) + 1; //@line 9839
      if ((HEAP32[$1 + 36 >> 2] | 0) == 1) {
       if ((HEAP32[$1 + 24 >> 2] | 0) == 2) {
        HEAP8[$1 + 54 >> 0] = 1; //@line 9849
       }
      }
      HEAP32[$1 + 44 >> 2] = 4; //@line 9853
      break;
     }
    }
    if (($3 | 0) == 1) {
     HEAP32[$1 + 32 >> 2] = 1; //@line 9860
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
 $$016 = 0; //@line 9284
 while (1) {
  if ((HEAPU8[2621 + $$016 >> 0] | 0) == ($0 | 0)) {
   label = 2; //@line 9291
   break;
  }
  $7 = $$016 + 1 | 0; //@line 9294
  if (($7 | 0) == 87) {
   $$01214 = 2709; //@line 9297
   $$115 = 87; //@line 9297
   label = 5; //@line 9298
   break;
  } else {
   $$016 = $7; //@line 9301
  }
 }
 if ((label | 0) == 2) {
  if (!$$016) {
   $$012$lcssa = 2709; //@line 9307
  } else {
   $$01214 = 2709; //@line 9309
   $$115 = $$016; //@line 9309
   label = 5; //@line 9310
  }
 }
 if ((label | 0) == 5) {
  while (1) {
   label = 0; //@line 9315
   $$113 = $$01214; //@line 9316
   do {
    $$113$looptemp = $$113;
    $$113 = $$113 + 1 | 0; //@line 9320
   } while ((HEAP8[$$113$looptemp >> 0] | 0) != 0);
   $$115 = $$115 + -1 | 0; //@line 9327
   if (!$$115) {
    $$012$lcssa = $$113; //@line 9330
    break;
   } else {
    $$01214 = $$113; //@line 9333
    label = 5; //@line 9334
   }
  }
 }
 return ___lctrans($$012$lcssa, HEAP32[$1 + 20 >> 2] | 0) | 0; //@line 9341
}
function __ZN4mbed6TickerD0Ev($0) {
 $0 = $0 | 0;
 var $1 = 0, $4 = 0, $7 = 0, $AsyncCtx = 0, $AsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 1936
 HEAP32[$0 >> 2] = 428; //@line 1937
 $1 = $0 + 40 | 0; //@line 1938
 _emscripten_asm_const_ii(6, $1 | 0) | 0; //@line 1939
 $4 = HEAP32[$0 + 52 >> 2] | 0; //@line 1941
 do {
  if ($4 | 0) {
   $7 = HEAP32[$4 + 8 >> 2] | 0; //@line 1946
   $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 1947
   FUNCTION_TABLE_vi[$7 & 255]($1); //@line 1948
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 77; //@line 1951
    HEAP32[$AsyncCtx + 4 >> 2] = $0; //@line 1953
    sp = STACKTOP; //@line 1954
    return;
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 1957
    break;
   }
  }
 } while (0);
 $AsyncCtx2 = _emscripten_alloc_async_context(8, sp) | 0; //@line 1962
 __ZN4mbed10TimerEventD2Ev($0); //@line 1963
 if (___async) {
  HEAP32[$AsyncCtx2 >> 2] = 78; //@line 1966
  HEAP32[$AsyncCtx2 + 4 >> 2] = $0; //@line 1968
  sp = STACKTOP; //@line 1969
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx2 | 0); //@line 1972
  __ZdlPv($0); //@line 1973
  return;
 }
}
function _main__async_cb_18($0) {
 $0 = $0 | 0;
 var $10 = 0, $2 = 0, $4 = 0, $8 = 0, $9 = 0, $ReallocAsyncCtx9 = 0, sp = 0;
 sp = STACKTOP; //@line 12417
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 12419
 $4 = $2 + 4 | 0; //@line 12421
 HEAP32[$4 >> 2] = 0; //@line 12423
 HEAP32[$4 + 4 >> 2] = 0; //@line 12426
 HEAP32[$2 >> 2] = 9; //@line 12427
 $8 = $2 + 12 | 0; //@line 12428
 HEAP32[$8 >> 2] = 440; //@line 12429
 $ReallocAsyncCtx9 = _emscripten_realloc_async_context(12) | 0; //@line 12430
 __ZN4mbed11InterruptIn4fallENS_8CallbackIFvvEEE(5292, $2); //@line 12431
 if (___async) {
  HEAP32[$ReallocAsyncCtx9 >> 2] = 96; //@line 12434
  $9 = $ReallocAsyncCtx9 + 4 | 0; //@line 12435
  HEAP32[$9 >> 2] = $8; //@line 12436
  $10 = $ReallocAsyncCtx9 + 8 | 0; //@line 12437
  HEAP32[$10 >> 2] = $2; //@line 12438
  sp = STACKTOP; //@line 12439
  return;
 }
 ___async_unwind = 0; //@line 12442
 HEAP32[$ReallocAsyncCtx9 >> 2] = 96; //@line 12443
 $9 = $ReallocAsyncCtx9 + 4 | 0; //@line 12444
 HEAP32[$9 >> 2] = $8; //@line 12445
 $10 = $ReallocAsyncCtx9 + 8 | 0; //@line 12446
 HEAP32[$10 >> 2] = $2; //@line 12447
 sp = STACKTOP; //@line 12448
 return;
}
function __ZN4mbed7Timeout7handlerEv($0) {
 $0 = $0 | 0;
 var $1 = 0, $2 = 0, $3 = 0, $7 = 0, $8 = 0, $AsyncCtx = 0, $AsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 492
 $1 = $0 + 40 | 0; //@line 493
 $2 = $0 + 52 | 0; //@line 494
 $3 = HEAP32[$2 >> 2] | 0; //@line 495
 do {
  if (!$3) {
   $AsyncCtx2 = _emscripten_alloc_async_context(12, sp) | 0; //@line 499
   _mbed_assert_internal(1677, 1682, 528); //@line 500
   if (___async) {
    HEAP32[$AsyncCtx2 >> 2] = 36; //@line 503
    HEAP32[$AsyncCtx2 + 4 >> 2] = $2; //@line 505
    HEAP32[$AsyncCtx2 + 8 >> 2] = $1; //@line 507
    sp = STACKTOP; //@line 508
    return;
   } else {
    _emscripten_free_async_context($AsyncCtx2 | 0); //@line 511
    $8 = HEAP32[$2 >> 2] | 0; //@line 513
    break;
   }
  } else {
   $8 = $3; //@line 517
  }
 } while (0);
 $7 = HEAP32[$8 >> 2] | 0; //@line 520
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 521
 FUNCTION_TABLE_vi[$7 & 255]($1); //@line 522
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 37; //@line 525
  sp = STACKTOP; //@line 526
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 529
  return;
 }
}
function __ZN4mbed11InterruptInD2Ev($0) {
 $0 = $0 | 0;
 var $10 = 0, $14 = 0, $3 = 0, $7 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 56
 HEAP32[$0 >> 2] = 336; //@line 57
 _gpio_irq_free($0 + 28 | 0); //@line 59
 $3 = HEAP32[$0 + 68 >> 2] | 0; //@line 61
 do {
  if ($3 | 0) {
   $7 = HEAP32[$3 + 8 >> 2] | 0; //@line 67
   $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 68
   FUNCTION_TABLE_vi[$7 & 255]($0 + 56 | 0); //@line 69
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 21; //@line 72
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
 FUNCTION_TABLE_vi[$14 & 255]($0 + 40 | 0); //@line 93
 if (___async) {
  HEAP32[$AsyncCtx3 >> 2] = 22; //@line 96
  sp = STACKTOP; //@line 97
  return;
 }
 _emscripten_free_async_context($AsyncCtx3 | 0); //@line 100
 return;
}
function _invoke_ticker($0) {
 $0 = $0 | 0;
 var $2 = 0, $3 = 0, $7 = 0, $8 = 0, $AsyncCtx = 0, $AsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 2003
 $2 = $0 + 12 | 0; //@line 2005
 $3 = HEAP32[$2 >> 2] | 0; //@line 2006
 do {
  if (!$3) {
   $AsyncCtx2 = _emscripten_alloc_async_context(12, sp) | 0; //@line 2010
   _mbed_assert_internal(1677, 1682, 528); //@line 2011
   if (___async) {
    HEAP32[$AsyncCtx2 >> 2] = 80; //@line 2014
    HEAP32[$AsyncCtx2 + 4 >> 2] = $2; //@line 2016
    HEAP32[$AsyncCtx2 + 8 >> 2] = $0; //@line 2018
    sp = STACKTOP; //@line 2019
    return;
   } else {
    _emscripten_free_async_context($AsyncCtx2 | 0); //@line 2022
    $8 = HEAP32[$2 >> 2] | 0; //@line 2024
    break;
   }
  } else {
   $8 = $3; //@line 2028
  }
 } while (0);
 $7 = HEAP32[$8 >> 2] | 0; //@line 2031
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 2033
 FUNCTION_TABLE_vi[$7 & 255]($0); //@line 2034
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 81; //@line 2037
  sp = STACKTOP; //@line 2038
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 2041
  return;
 }
}
function __ZN4mbed6Ticker6attachENS_8CallbackIFvvEEEf__async_cb_4($0) {
 $0 = $0 | 0;
 var $10 = 0, $13 = 0, $15 = 0, $17 = 0, $18 = 0, $21 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx4 = 0, sp = 0;
 sp = STACKTOP; //@line 11638
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 11644
 $8 = $0 + 16 | 0; //@line 11646
 $10 = HEAP32[$8 >> 2] | 0; //@line 11648
 $13 = HEAP32[$8 + 4 >> 2] | 0; //@line 11651
 $15 = HEAP32[$0 + 24 >> 2] | 0; //@line 11653
 $17 = HEAP32[$0 + 28 >> 2] | 0; //@line 11655
 HEAP32[HEAP32[$0 + 8 >> 2] >> 2] = HEAP32[HEAP32[$0 + 4 >> 2] >> 2]; //@line 11657
 __ZN4mbed6Ticker5setupEy($6, $10, $13); //@line 11658
 $18 = HEAP32[$15 >> 2] | 0; //@line 11659
 if (!$18) {
  return;
 }
 $21 = HEAP32[$18 + 8 >> 2] | 0; //@line 11665
 $ReallocAsyncCtx4 = _emscripten_realloc_async_context(4) | 0; //@line 11666
 FUNCTION_TABLE_vi[$21 & 255]($17); //@line 11667
 if (___async) {
  HEAP32[$ReallocAsyncCtx4 >> 2] = 102; //@line 11670
  sp = STACKTOP; //@line 11671
  return;
 }
 ___async_unwind = 0; //@line 11674
 HEAP32[$ReallocAsyncCtx4 >> 2] = 102; //@line 11675
 sp = STACKTOP; //@line 11676
 return;
}
function __ZN4mbed7TimeoutD0Ev($0) {
 $0 = $0 | 0;
 var $2 = 0, $6 = 0, $AsyncCtx = 0, $AsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 448
 HEAP32[$0 >> 2] = 428; //@line 449
 __ZN4mbed6Ticker6detachEv($0); //@line 450
 $2 = HEAP32[$0 + 52 >> 2] | 0; //@line 452
 do {
  if ($2 | 0) {
   $6 = HEAP32[$2 + 8 >> 2] | 0; //@line 458
   $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 459
   FUNCTION_TABLE_vi[$6 & 255]($0 + 40 | 0); //@line 460
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 34; //@line 463
    HEAP32[$AsyncCtx + 4 >> 2] = $0; //@line 465
    sp = STACKTOP; //@line 466
    return;
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 469
    break;
   }
  }
 } while (0);
 $AsyncCtx2 = _emscripten_alloc_async_context(8, sp) | 0; //@line 474
 __ZN4mbed10TimerEventD2Ev($0); //@line 475
 if (___async) {
  HEAP32[$AsyncCtx2 >> 2] = 35; //@line 478
  HEAP32[$AsyncCtx2 + 4 >> 2] = $0; //@line 480
  sp = STACKTOP; //@line 481
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx2 | 0); //@line 484
  __ZdlPv($0); //@line 485
  return;
 }
}
function __ZN4mbed6TickerD2Ev($0) {
 $0 = $0 | 0;
 var $1 = 0, $4 = 0, $7 = 0, $AsyncCtx = 0, $AsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 1895
 HEAP32[$0 >> 2] = 428; //@line 1896
 $1 = $0 + 40 | 0; //@line 1897
 _emscripten_asm_const_ii(6, $1 | 0) | 0; //@line 1898
 $4 = HEAP32[$0 + 52 >> 2] | 0; //@line 1900
 do {
  if ($4 | 0) {
   $7 = HEAP32[$4 + 8 >> 2] | 0; //@line 1905
   $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 1906
   FUNCTION_TABLE_vi[$7 & 255]($1); //@line 1907
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 75; //@line 1910
    HEAP32[$AsyncCtx + 4 >> 2] = $0; //@line 1912
    sp = STACKTOP; //@line 1913
    return;
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 1916
    break;
   }
  }
 } while (0);
 $AsyncCtx2 = _emscripten_alloc_async_context(4, sp) | 0; //@line 1921
 __ZN4mbed10TimerEventD2Ev($0); //@line 1922
 if (___async) {
  HEAP32[$AsyncCtx2 >> 2] = 76; //@line 1925
  sp = STACKTOP; //@line 1926
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx2 | 0); //@line 1929
  return;
 }
}
function _main__async_cb_25($0) {
 $0 = $0 | 0;
 var $4 = 0, $5 = 0, $8 = 0, $ReallocAsyncCtx10 = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 12709
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 12713
 $5 = HEAP32[HEAP32[$0 + 4 >> 2] >> 2] | 0; //@line 12714
 if (!$5) {
  $ReallocAsyncCtx10 = _emscripten_realloc_async_context(4) | 0; //@line 12717
  _wait_ms(-1); //@line 12718
  if (___async) {
   HEAP32[$ReallocAsyncCtx10 >> 2] = 98; //@line 12721
   sp = STACKTOP; //@line 12722
   return;
  }
  ___async_unwind = 0; //@line 12725
  HEAP32[$ReallocAsyncCtx10 >> 2] = 98; //@line 12726
  sp = STACKTOP; //@line 12727
  return;
 } else {
  $8 = HEAP32[$5 + 8 >> 2] | 0; //@line 12731
  $ReallocAsyncCtx3 = _emscripten_realloc_async_context(4) | 0; //@line 12732
  FUNCTION_TABLE_vi[$8 & 255]($4); //@line 12733
  if (___async) {
   HEAP32[$ReallocAsyncCtx3 >> 2] = 97; //@line 12736
   sp = STACKTOP; //@line 12737
   return;
  }
  ___async_unwind = 0; //@line 12740
  HEAP32[$ReallocAsyncCtx3 >> 2] = 97; //@line 12741
  sp = STACKTOP; //@line 12742
  return;
 }
}
function _frexp($0, $1) {
 $0 = +$0;
 $1 = $1 | 0;
 var $$0 = 0.0, $$016 = 0.0, $2 = 0, $3 = 0, $4 = 0, $9 = 0.0, $storemerge = 0;
 HEAPF64[tempDoublePtr >> 3] = $0; //@line 9115
 $2 = HEAP32[tempDoublePtr >> 2] | 0; //@line 9115
 $3 = HEAP32[tempDoublePtr + 4 >> 2] | 0; //@line 9116
 $4 = _bitshift64Lshr($2 | 0, $3 | 0, 52) | 0; //@line 9117
 switch ($4 & 2047) {
 case 0:
  {
   if ($0 != 0.0) {
    $9 = +_frexp($0 * 18446744073709552000.0, $1); //@line 9126
    $$016 = $9; //@line 9129
    $storemerge = (HEAP32[$1 >> 2] | 0) + -64 | 0; //@line 9129
   } else {
    $$016 = $0; //@line 9131
    $storemerge = 0; //@line 9131
   }
   HEAP32[$1 >> 2] = $storemerge; //@line 9133
   $$0 = $$016; //@line 9134
   break;
  }
 case 2047:
  {
   $$0 = $0; //@line 9138
   break;
  }
 default:
  {
   HEAP32[$1 >> 2] = ($4 & 2047) + -1022; //@line 9144
   HEAP32[tempDoublePtr >> 2] = $2; //@line 9147
   HEAP32[tempDoublePtr + 4 >> 2] = $3 & -2146435073 | 1071644672; //@line 9147
   $$0 = +HEAPF64[tempDoublePtr >> 3]; //@line 9148
  }
 }
 return +$$0;
}
function _vfprintf__async_cb($0) {
 $0 = $0 | 0;
 var $$ = 0, $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $2 = 0, $20 = 0, $22 = 0, $33 = 0;
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 12818
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 12826
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 12828
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 12830
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 12832
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 12834
 $20 = HEAP32[$0 + 40 >> 2] | 0; //@line 12836
 $22 = HEAP32[$0 + 44 >> 2] | 0; //@line 12838
 $$ = (HEAP32[$2 >> 2] | 0) == 0 ? -1 : HEAP32[$0 + 8 >> 2] | 0; //@line 12849
 HEAP32[HEAP32[$0 + 16 >> 2] >> 2] = HEAP32[$0 + 12 >> 2]; //@line 12850
 HEAP32[$10 >> 2] = 0; //@line 12851
 HEAP32[$12 >> 2] = 0; //@line 12852
 HEAP32[$14 >> 2] = 0; //@line 12853
 HEAP32[$2 >> 2] = 0; //@line 12854
 $33 = HEAP32[$16 >> 2] | 0; //@line 12855
 HEAP32[$16 >> 2] = $33 | $18; //@line 12860
 if ($20 | 0) {
  ___unlockfile($22); //@line 12863
 }
 HEAP32[___async_retval >> 2] = ($33 & 32 | 0) == 0 ? $$ : -1; //@line 12866
 return;
}
function _schedule_interrupt__async_cb_10($0) {
 $0 = $0 | 0;
 var $16 = 0, $4 = 0, $6 = 0, $8 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx6 = 0, sp = 0;
 sp = STACKTOP; //@line 12105
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 12109
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 12111
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 12113
 $8 = HEAP32[HEAP32[$0 + 4 >> 2] >> 2] | 0; //@line 12114
 if ($4 >>> 0 > $8 >>> 0) {
  if (!($AsyncRetVal >>> 0 >= $4 >>> 0 | $AsyncRetVal >>> 0 < $8 >>> 0)) {
   return;
  }
 } else {
  if (!($AsyncRetVal >>> 0 >= $4 >>> 0 & $AsyncRetVal >>> 0 < $8 >>> 0)) {
   return;
  }
 }
 $16 = HEAP32[(HEAP32[$6 >> 2] | 0) + 20 >> 2] | 0; //@line 12133
 $ReallocAsyncCtx6 = _emscripten_realloc_async_context(4) | 0; //@line 12134
 FUNCTION_TABLE_v[$16 & 15](); //@line 12135
 if (___async) {
  HEAP32[$ReallocAsyncCtx6 >> 2] = 54; //@line 12138
  sp = STACKTOP; //@line 12139
  return;
 }
 ___async_unwind = 0; //@line 12142
 HEAP32[$ReallocAsyncCtx6 >> 2] = 54; //@line 12143
 sp = STACKTOP; //@line 12144
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
 sp = STACKTOP; //@line 10176
 do {
  if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, $5) | 0) {
   __ZNK10__cxxabiv117__class_type_info29process_static_type_above_dstEPNS_19__dynamic_cast_infoEPKvS4_i(0, $1, $2, $3, $4); //@line 10182
  } else {
   $10 = HEAP32[$0 + 8 >> 2] | 0; //@line 10185
   $13 = HEAP32[(HEAP32[$10 >> 2] | 0) + 20 >> 2] | 0; //@line 10188
   $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 10189
   FUNCTION_TABLE_viiiiii[$13 & 3]($10, $1, $2, $3, $4, $5); //@line 10190
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 116; //@line 10193
    sp = STACKTOP; //@line 10194
    return;
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 10197
    break;
   }
  }
 } while (0);
 return;
}
function __ZN4mbed7TimeoutD2Ev($0) {
 $0 = $0 | 0;
 var $2 = 0, $6 = 0, $AsyncCtx = 0, $AsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 407
 HEAP32[$0 >> 2] = 428; //@line 408
 __ZN4mbed6Ticker6detachEv($0); //@line 409
 $2 = HEAP32[$0 + 52 >> 2] | 0; //@line 411
 do {
  if ($2 | 0) {
   $6 = HEAP32[$2 + 8 >> 2] | 0; //@line 417
   $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 418
   FUNCTION_TABLE_vi[$6 & 255]($0 + 40 | 0); //@line 419
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 32; //@line 422
    HEAP32[$AsyncCtx + 4 >> 2] = $0; //@line 424
    sp = STACKTOP; //@line 425
    return;
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 428
    break;
   }
  }
 } while (0);
 $AsyncCtx2 = _emscripten_alloc_async_context(4, sp) | 0; //@line 433
 __ZN4mbed10TimerEventD2Ev($0); //@line 434
 if (___async) {
  HEAP32[$AsyncCtx2 >> 2] = 33; //@line 437
  sp = STACKTOP; //@line 438
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx2 | 0); //@line 441
  return;
 }
}
function _abort_message($0, $varargs) {
 $0 = $0 | 0;
 $varargs = $varargs | 0;
 var $1 = 0, $2 = 0, $AsyncCtx = 0, $AsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 9653
 STACKTOP = STACKTOP + 16 | 0; //@line 9654
 $1 = sp; //@line 9655
 HEAP32[$1 >> 2] = $varargs; //@line 9656
 $2 = HEAP32[115] | 0; //@line 9657
 $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 9658
 _vfprintf($2, $0, $1) | 0; //@line 9659
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 110; //@line 9662
  HEAP32[$AsyncCtx + 4 >> 2] = $2; //@line 9664
  sp = STACKTOP; //@line 9665
  STACKTOP = sp; //@line 9666
  return;
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 9668
 $AsyncCtx2 = _emscripten_alloc_async_context(4, sp) | 0; //@line 9669
 _fputc(10, $2) | 0; //@line 9670
 if (___async) {
  HEAP32[$AsyncCtx2 >> 2] = 111; //@line 9673
  sp = STACKTOP; //@line 9674
  STACKTOP = sp; //@line 9675
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx2 | 0); //@line 9677
  _abort(); //@line 9678
 }
}
function __ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($0, $1, $2, $3, $4, $5) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 $5 = $5 | 0;
 var $$0 = 0, $14 = 0, $17 = 0, $7 = 0, $8 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 11175
 $7 = HEAP32[$0 + 4 >> 2] | 0; //@line 11177
 $8 = $7 >> 8; //@line 11178
 if (!($7 & 1)) {
  $$0 = $8; //@line 11182
 } else {
  $$0 = HEAP32[(HEAP32[$3 >> 2] | 0) + $8 >> 2] | 0; //@line 11187
 }
 $14 = HEAP32[$0 >> 2] | 0; //@line 11189
 $17 = HEAP32[(HEAP32[$14 >> 2] | 0) + 20 >> 2] | 0; //@line 11192
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 11197
 FUNCTION_TABLE_viiiiii[$17 & 3]($14, $1, $2, $3 + $$0 | 0, $7 & 2 | 0 ? $4 : 2, $5); //@line 11198
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 132; //@line 11201
  sp = STACKTOP; //@line 11202
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 11205
  return;
 }
}
function ___cxa_can_catch($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $3 = 0, $7 = 0, $8 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 11256
 STACKTOP = STACKTOP + 16 | 0; //@line 11257
 $3 = sp; //@line 11258
 HEAP32[$3 >> 2] = HEAP32[$2 >> 2]; //@line 11260
 $7 = HEAP32[(HEAP32[$0 >> 2] | 0) + 16 >> 2] | 0; //@line 11263
 $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 11264
 $8 = FUNCTION_TABLE_iiii[$7 & 7]($0, $1, $3) | 0; //@line 11265
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 134; //@line 11268
  HEAP32[$AsyncCtx + 4 >> 2] = $3; //@line 11270
  HEAP32[$AsyncCtx + 8 >> 2] = $2; //@line 11272
  HEAP32[$AsyncCtx + 12 >> 2] = $3; //@line 11274
  sp = STACKTOP; //@line 11275
  STACKTOP = sp; //@line 11276
  return 0; //@line 11276
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 11278
 if ($8) {
  HEAP32[$2 >> 2] = HEAP32[$3 >> 2]; //@line 11282
 }
 STACKTOP = sp; //@line 11284
 return $8 & 1 | 0; //@line 11284
}
function __ZNK10__cxxabiv120__si_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $11 = 0, $8 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 10345
 do {
  if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, 0) | 0) {
   __ZNK10__cxxabiv117__class_type_info24process_found_base_classEPNS_19__dynamic_cast_infoEPvi(0, $1, $2, $3); //@line 10351
  } else {
   $8 = HEAP32[$0 + 8 >> 2] | 0; //@line 10354
   $11 = HEAP32[(HEAP32[$8 >> 2] | 0) + 28 >> 2] | 0; //@line 10357
   $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 10358
   FUNCTION_TABLE_viiii[$11 & 3]($8, $1, $2, $3); //@line 10359
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 119; //@line 10362
    sp = STACKTOP; //@line 10363
    return;
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 10366
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
 sp = STACKTOP; //@line 11217
 $6 = HEAP32[$0 + 4 >> 2] | 0; //@line 11219
 $7 = $6 >> 8; //@line 11220
 if (!($6 & 1)) {
  $$0 = $7; //@line 11224
 } else {
  $$0 = HEAP32[(HEAP32[$2 >> 2] | 0) + $7 >> 2] | 0; //@line 11229
 }
 $13 = HEAP32[$0 >> 2] | 0; //@line 11231
 $16 = HEAP32[(HEAP32[$13 >> 2] | 0) + 24 >> 2] | 0; //@line 11234
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 11239
 FUNCTION_TABLE_viiiii[$16 & 3]($13, $1, $2 + $$0 | 0, $6 & 2 | 0 ? $3 : 2, $4); //@line 11240
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 133; //@line 11243
  sp = STACKTOP; //@line 11244
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 11247
  return;
 }
}
function _ticker_remove_event($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0 = 0, $10 = 0, $4 = 0, $5 = 0, $AsyncCtx = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 1386
 $4 = (HEAP32[$0 + 4 >> 2] | 0) + 4 | 0; //@line 1389
 $5 = HEAP32[$4 >> 2] | 0; //@line 1390
 if (($5 | 0) == ($1 | 0)) {
  HEAP32[$4 >> 2] = HEAP32[$1 + 12 >> 2]; //@line 1395
  $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 1396
  _schedule_interrupt($0); //@line 1397
  if (___async) {
   HEAP32[$AsyncCtx >> 2] = 56; //@line 1400
   sp = STACKTOP; //@line 1401
   return;
  }
  _emscripten_free_async_context($AsyncCtx | 0); //@line 1404
  return;
 } else {
  $$0 = $5; //@line 1407
 }
 do {
  if (!$$0) {
   label = 8; //@line 1412
   break;
  }
  $10 = $$0 + 12 | 0; //@line 1415
  $$0 = HEAP32[$10 >> 2] | 0; //@line 1416
 } while (($$0 | 0) != ($1 | 0));
 if ((label | 0) == 8) {
  return;
 }
 HEAP32[$10 >> 2] = HEAP32[$1 + 12 >> 2]; //@line 1429
 return;
}
function ___dynamic_cast__async_cb_66($0) {
 $0 = $0 | 0;
 var $$0 = 0, $10 = 0, $16 = 0, $6 = 0, $8 = 0;
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 1228
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 1230
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 1232
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 1238
 L2 : do {
  switch (HEAP32[HEAP32[$0 + 4 >> 2] >> 2] | 0) {
  case 0:
   {
    $$0 = (HEAP32[$6 >> 2] | 0) == 1 & (HEAP32[$8 >> 2] | 0) == 1 & (HEAP32[$10 >> 2] | 0) == 1 ? HEAP32[HEAP32[$0 + 24 >> 2] >> 2] | 0 : 0; //@line 1253
    break;
   }
  case 1:
   {
    if ((HEAP32[HEAP32[$0 + 28 >> 2] >> 2] | 0) != 1) {
     if (!((HEAP32[$6 >> 2] | 0) == 0 & (HEAP32[$8 >> 2] | 0) == 1 & (HEAP32[$10 >> 2] | 0) == 1)) {
      $$0 = 0; //@line 1269
      break L2;
     }
    }
    $$0 = HEAP32[$16 >> 2] | 0; //@line 1274
    break;
   }
  default:
   {
    $$0 = 0; //@line 1278
   }
  }
 } while (0);
 HEAP32[___async_retval >> 2] = $$0; //@line 1283
 return;
}
function __ZNK10__cxxabiv122__base_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $$0 = 0, $12 = 0, $15 = 0, $5 = 0, $6 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 11132
 $5 = HEAP32[$0 + 4 >> 2] | 0; //@line 11134
 $6 = $5 >> 8; //@line 11135
 if (!($5 & 1)) {
  $$0 = $6; //@line 11139
 } else {
  $$0 = HEAP32[(HEAP32[$2 >> 2] | 0) + $6 >> 2] | 0; //@line 11144
 }
 $12 = HEAP32[$0 >> 2] | 0; //@line 11146
 $15 = HEAP32[(HEAP32[$12 >> 2] | 0) + 28 >> 2] | 0; //@line 11149
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 11154
 FUNCTION_TABLE_viiii[$15 & 3]($12, $1, $2 + $$0 | 0, $5 & 2 | 0 ? $3 : 2); //@line 11155
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 131; //@line 11158
  sp = STACKTOP; //@line 11159
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 11162
  return;
 }
}
function _schedule_interrupt__async_cb_9($0) {
 $0 = $0 | 0;
 var $10 = 0, $2 = 0, $4 = 0, $6 = 0, $9 = 0, $ReallocAsyncCtx5 = 0, sp = 0;
 sp = STACKTOP; //@line 12073
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 12075
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 12077
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 12079
 $9 = HEAP32[(HEAP32[$2 >> 2] | 0) + 4 >> 2] | 0; //@line 12082
 $ReallocAsyncCtx5 = _emscripten_realloc_async_context(16) | 0; //@line 12083
 $10 = FUNCTION_TABLE_i[$9 & 3]() | 0; //@line 12084
 if (!___async) {
  HEAP32[___async_retval >> 2] = $10; //@line 12088
  ___async_unwind = 0; //@line 12089
 }
 HEAP32[$ReallocAsyncCtx5 >> 2] = 53; //@line 12091
 HEAP32[$ReallocAsyncCtx5 + 4 >> 2] = $4; //@line 12093
 HEAP32[$ReallocAsyncCtx5 + 8 >> 2] = $6; //@line 12095
 HEAP32[$ReallocAsyncCtx5 + 12 >> 2] = $2; //@line 12097
 sp = STACKTOP; //@line 12098
 return;
}
function __ZN4mbed11InterruptInD0Ev__async_cb($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $8 = 0, $9 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 644
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 646
 $4 = HEAP32[$2 + 52 >> 2] | 0; //@line 648
 if (!$4) {
  __ZdlPv($2); //@line 651
  return;
 }
 $8 = HEAP32[$4 + 8 >> 2] | 0; //@line 656
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(8) | 0; //@line 657
 FUNCTION_TABLE_vi[$8 & 255]($2 + 40 | 0); //@line 658
 if (___async) {
  HEAP32[$ReallocAsyncCtx2 >> 2] = 24; //@line 661
  $9 = $ReallocAsyncCtx2 + 4 | 0; //@line 662
  HEAP32[$9 >> 2] = $2; //@line 663
  sp = STACKTOP; //@line 664
  return;
 }
 ___async_unwind = 0; //@line 667
 HEAP32[$ReallocAsyncCtx2 >> 2] = 24; //@line 668
 $9 = $ReallocAsyncCtx2 + 4 | 0; //@line 669
 HEAP32[$9 >> 2] = $2; //@line 670
 sp = STACKTOP; //@line 671
 return;
}
function _initialize__async_cb($0) {
 $0 = $0 | 0;
 var $10 = 0, $2 = 0, $4 = 0, $6 = 0, $9 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 14112
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 14114
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 14116
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 14118
 $9 = HEAP32[(HEAP32[$6 >> 2] | 0) + 24 >> 2] | 0; //@line 14121
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(16) | 0; //@line 14122
 $10 = FUNCTION_TABLE_i[$9 & 3]() | 0; //@line 14123
 if (!___async) {
  HEAP32[___async_retval >> 2] = $10; //@line 14127
  ___async_unwind = 0; //@line 14128
 }
 HEAP32[$ReallocAsyncCtx2 >> 2] = 43; //@line 14130
 HEAP32[$ReallocAsyncCtx2 + 4 >> 2] = $2; //@line 14132
 HEAP32[$ReallocAsyncCtx2 + 8 >> 2] = $4; //@line 14134
 HEAP32[$ReallocAsyncCtx2 + 12 >> 2] = $6; //@line 14136
 sp = STACKTOP; //@line 14137
 return;
}
function _pad_676($0, $1, $2, $3, $4) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 var $$0$lcssa = 0, $$011 = 0, $14 = 0, $5 = 0, $9 = 0, sp = 0;
 sp = STACKTOP; //@line 8113
 STACKTOP = STACKTOP + 256 | 0; //@line 8114
 $5 = sp; //@line 8115
 if (($2 | 0) > ($3 | 0) & ($4 & 73728 | 0) == 0) {
  $9 = $2 - $3 | 0; //@line 8121
  _memset($5 | 0, $1 << 24 >> 24 | 0, ($9 >>> 0 < 256 ? $9 : 256) | 0) | 0; //@line 8125
  if ($9 >>> 0 > 255) {
   $14 = $2 - $3 | 0; //@line 8128
   $$011 = $9; //@line 8129
   do {
    _out_670($0, $5, 256); //@line 8131
    $$011 = $$011 + -256 | 0; //@line 8132
   } while ($$011 >>> 0 > 255);
   $$0$lcssa = $14 & 255; //@line 8141
  } else {
   $$0$lcssa = $9; //@line 8143
  }
  _out_670($0, $5, $$0$lcssa); //@line 8145
 }
 STACKTOP = sp; //@line 8147
 return;
}
function __ZNK10__cxxabiv117__class_type_info24process_found_base_classEPNS_19__dynamic_cast_infoEPvi($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $10 = 0, $13 = 0, $4 = 0, $5 = 0;
 $4 = $1 + 16 | 0; //@line 9898
 $5 = HEAP32[$4 >> 2] | 0; //@line 9899
 do {
  if (!$5) {
   HEAP32[$4 >> 2] = $2; //@line 9903
   HEAP32[$1 + 24 >> 2] = $3; //@line 9905
   HEAP32[$1 + 36 >> 2] = 1; //@line 9907
  } else {
   if (($5 | 0) != ($2 | 0)) {
    $13 = $1 + 36 | 0; //@line 9911
    HEAP32[$13 >> 2] = (HEAP32[$13 >> 2] | 0) + 1; //@line 9914
    HEAP32[$1 + 24 >> 2] = 2; //@line 9916
    HEAP8[$1 + 54 >> 0] = 1; //@line 9918
    break;
   }
   $10 = $1 + 24 | 0; //@line 9921
   if ((HEAP32[$10 >> 2] | 0) == 2) {
    HEAP32[$10 >> 2] = $3; //@line 9925
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
 sp = STACKTOP; //@line 5860
 STACKTOP = STACKTOP + 32 | 0; //@line 5861
 $vararg_buffer = sp; //@line 5862
 $3 = sp + 20 | 0; //@line 5863
 HEAP32[$vararg_buffer >> 2] = HEAP32[$0 + 60 >> 2]; //@line 5867
 HEAP32[$vararg_buffer + 4 >> 2] = 0; //@line 5869
 HEAP32[$vararg_buffer + 8 >> 2] = $1; //@line 5871
 HEAP32[$vararg_buffer + 12 >> 2] = $3; //@line 5873
 HEAP32[$vararg_buffer + 16 >> 2] = $2; //@line 5875
 if ((___syscall_ret(___syscall140(140, $vararg_buffer | 0) | 0) | 0) < 0) {
  HEAP32[$3 >> 2] = -1; //@line 5880
  $10 = -1; //@line 5881
 } else {
  $10 = HEAP32[$3 >> 2] | 0; //@line 5884
 }
 STACKTOP = sp; //@line 5886
 return $10 | 0; //@line 5886
}
function _mbed_assert_internal($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $AsyncCtx = 0, $vararg_buffer = 0, sp = 0;
 sp = STACKTOP; //@line 1442
 STACKTOP = STACKTOP + 16 | 0; //@line 1443
 $vararg_buffer = sp; //@line 1444
 HEAP32[$vararg_buffer >> 2] = $0; //@line 1445
 HEAP32[$vararg_buffer + 4 >> 2] = $1; //@line 1447
 HEAP32[$vararg_buffer + 8 >> 2] = $2; //@line 1449
 _mbed_error_printf(1343, $vararg_buffer); //@line 1450
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 1451
 _mbed_die(); //@line 1452
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 57; //@line 1455
  sp = STACKTOP; //@line 1456
  STACKTOP = sp; //@line 1457
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 1459
  STACKTOP = sp; //@line 1460
  return;
 }
}
function _strcmp($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$011 = 0, $$0710 = 0, $$lcssa = 0, $$lcssa8 = 0, $2 = 0, $3 = 0, $8 = 0, $9 = 0;
 $2 = HEAP8[$0 >> 0] | 0; //@line 5967
 $3 = HEAP8[$1 >> 0] | 0; //@line 5968
 if ($2 << 24 >> 24 == 0 ? 1 : $2 << 24 >> 24 != $3 << 24 >> 24) {
  $$lcssa = $3; //@line 5973
  $$lcssa8 = $2; //@line 5973
 } else {
  $$011 = $1; //@line 5975
  $$0710 = $0; //@line 5975
  do {
   $$0710 = $$0710 + 1 | 0; //@line 5977
   $$011 = $$011 + 1 | 0; //@line 5978
   $8 = HEAP8[$$0710 >> 0] | 0; //@line 5979
   $9 = HEAP8[$$011 >> 0] | 0; //@line 5980
  } while (!($8 << 24 >> 24 == 0 ? 1 : $8 << 24 >> 24 != $9 << 24 >> 24));
  $$lcssa = $9; //@line 5985
  $$lcssa8 = $8; //@line 5985
 }
 return ($$lcssa8 & 255) - ($$lcssa & 255) | 0; //@line 5995
}
function _mbed_die__async_cb_45($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx15 = 0, sp = 0;
 sp = STACKTOP; //@line 13387
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 13389
 _emscripten_asm_const_iii(0, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 13391
 $ReallocAsyncCtx15 = _emscripten_realloc_async_context(8) | 0; //@line 13392
 _wait_ms(150); //@line 13393
 if (___async) {
  HEAP32[$ReallocAsyncCtx15 >> 2] = 59; //@line 13396
  $4 = $ReallocAsyncCtx15 + 4 | 0; //@line 13397
  HEAP32[$4 >> 2] = $2; //@line 13398
  sp = STACKTOP; //@line 13399
  return;
 }
 ___async_unwind = 0; //@line 13402
 HEAP32[$ReallocAsyncCtx15 >> 2] = 59; //@line 13403
 $4 = $ReallocAsyncCtx15 + 4 | 0; //@line 13404
 HEAP32[$4 >> 2] = $2; //@line 13405
 sp = STACKTOP; //@line 13406
 return;
}
function _mbed_die__async_cb_44($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx14 = 0, sp = 0;
 sp = STACKTOP; //@line 13362
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 13364
 _emscripten_asm_const_iii(0, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 13366
 $ReallocAsyncCtx14 = _emscripten_realloc_async_context(8) | 0; //@line 13367
 _wait_ms(150); //@line 13368
 if (___async) {
  HEAP32[$ReallocAsyncCtx14 >> 2] = 60; //@line 13371
  $4 = $ReallocAsyncCtx14 + 4 | 0; //@line 13372
  HEAP32[$4 >> 2] = $2; //@line 13373
  sp = STACKTOP; //@line 13374
  return;
 }
 ___async_unwind = 0; //@line 13377
 HEAP32[$ReallocAsyncCtx14 >> 2] = 60; //@line 13378
 $4 = $ReallocAsyncCtx14 + 4 | 0; //@line 13379
 HEAP32[$4 >> 2] = $2; //@line 13380
 sp = STACKTOP; //@line 13381
 return;
}
function _mbed_die__async_cb_43($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx13 = 0, sp = 0;
 sp = STACKTOP; //@line 13337
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 13339
 _emscripten_asm_const_iii(0, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 13341
 $ReallocAsyncCtx13 = _emscripten_realloc_async_context(8) | 0; //@line 13342
 _wait_ms(150); //@line 13343
 if (___async) {
  HEAP32[$ReallocAsyncCtx13 >> 2] = 61; //@line 13346
  $4 = $ReallocAsyncCtx13 + 4 | 0; //@line 13347
  HEAP32[$4 >> 2] = $2; //@line 13348
  sp = STACKTOP; //@line 13349
  return;
 }
 ___async_unwind = 0; //@line 13352
 HEAP32[$ReallocAsyncCtx13 >> 2] = 61; //@line 13353
 $4 = $ReallocAsyncCtx13 + 4 | 0; //@line 13354
 HEAP32[$4 >> 2] = $2; //@line 13355
 sp = STACKTOP; //@line 13356
 return;
}
function _mbed_die__async_cb_42($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx12 = 0, sp = 0;
 sp = STACKTOP; //@line 13312
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 13314
 _emscripten_asm_const_iii(0, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 13316
 $ReallocAsyncCtx12 = _emscripten_realloc_async_context(8) | 0; //@line 13317
 _wait_ms(150); //@line 13318
 if (___async) {
  HEAP32[$ReallocAsyncCtx12 >> 2] = 62; //@line 13321
  $4 = $ReallocAsyncCtx12 + 4 | 0; //@line 13322
  HEAP32[$4 >> 2] = $2; //@line 13323
  sp = STACKTOP; //@line 13324
  return;
 }
 ___async_unwind = 0; //@line 13327
 HEAP32[$ReallocAsyncCtx12 >> 2] = 62; //@line 13328
 $4 = $ReallocAsyncCtx12 + 4 | 0; //@line 13329
 HEAP32[$4 >> 2] = $2; //@line 13330
 sp = STACKTOP; //@line 13331
 return;
}
function _mbed_die__async_cb_41($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx11 = 0, sp = 0;
 sp = STACKTOP; //@line 13287
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 13289
 _emscripten_asm_const_iii(0, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 13291
 $ReallocAsyncCtx11 = _emscripten_realloc_async_context(8) | 0; //@line 13292
 _wait_ms(150); //@line 13293
 if (___async) {
  HEAP32[$ReallocAsyncCtx11 >> 2] = 63; //@line 13296
  $4 = $ReallocAsyncCtx11 + 4 | 0; //@line 13297
  HEAP32[$4 >> 2] = $2; //@line 13298
  sp = STACKTOP; //@line 13299
  return;
 }
 ___async_unwind = 0; //@line 13302
 HEAP32[$ReallocAsyncCtx11 >> 2] = 63; //@line 13303
 $4 = $ReallocAsyncCtx11 + 4 | 0; //@line 13304
 HEAP32[$4 >> 2] = $2; //@line 13305
 sp = STACKTOP; //@line 13306
 return;
}
function _mbed_die__async_cb_40($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx10 = 0, sp = 0;
 sp = STACKTOP; //@line 13262
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 13264
 _emscripten_asm_const_iii(0, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 13266
 $ReallocAsyncCtx10 = _emscripten_realloc_async_context(8) | 0; //@line 13267
 _wait_ms(150); //@line 13268
 if (___async) {
  HEAP32[$ReallocAsyncCtx10 >> 2] = 64; //@line 13271
  $4 = $ReallocAsyncCtx10 + 4 | 0; //@line 13272
  HEAP32[$4 >> 2] = $2; //@line 13273
  sp = STACKTOP; //@line 13274
  return;
 }
 ___async_unwind = 0; //@line 13277
 HEAP32[$ReallocAsyncCtx10 >> 2] = 64; //@line 13278
 $4 = $ReallocAsyncCtx10 + 4 | 0; //@line 13279
 HEAP32[$4 >> 2] = $2; //@line 13280
 sp = STACKTOP; //@line 13281
 return;
}
function _mbed_die__async_cb($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx16 = 0, sp = 0;
 sp = STACKTOP; //@line 13012
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 13014
 _emscripten_asm_const_iii(0, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 13016
 $ReallocAsyncCtx16 = _emscripten_realloc_async_context(8) | 0; //@line 13017
 _wait_ms(150); //@line 13018
 if (___async) {
  HEAP32[$ReallocAsyncCtx16 >> 2] = 58; //@line 13021
  $4 = $ReallocAsyncCtx16 + 4 | 0; //@line 13022
  HEAP32[$4 >> 2] = $2; //@line 13023
  sp = STACKTOP; //@line 13024
  return;
 }
 ___async_unwind = 0; //@line 13027
 HEAP32[$ReallocAsyncCtx16 >> 2] = 58; //@line 13028
 $4 = $ReallocAsyncCtx16 + 4 | 0; //@line 13029
 HEAP32[$4 >> 2] = $2; //@line 13030
 sp = STACKTOP; //@line 13031
 return;
}
function _mbed_die__async_cb_39($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx9 = 0, sp = 0;
 sp = STACKTOP; //@line 13237
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 13239
 _emscripten_asm_const_iii(0, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 13241
 $ReallocAsyncCtx9 = _emscripten_realloc_async_context(8) | 0; //@line 13242
 _wait_ms(150); //@line 13243
 if (___async) {
  HEAP32[$ReallocAsyncCtx9 >> 2] = 65; //@line 13246
  $4 = $ReallocAsyncCtx9 + 4 | 0; //@line 13247
  HEAP32[$4 >> 2] = $2; //@line 13248
  sp = STACKTOP; //@line 13249
  return;
 }
 ___async_unwind = 0; //@line 13252
 HEAP32[$ReallocAsyncCtx9 >> 2] = 65; //@line 13253
 $4 = $ReallocAsyncCtx9 + 4 | 0; //@line 13254
 HEAP32[$4 >> 2] = $2; //@line 13255
 sp = STACKTOP; //@line 13256
 return;
}
function _mbed_die__async_cb_38($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx8 = 0, sp = 0;
 sp = STACKTOP; //@line 13212
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 13214
 _emscripten_asm_const_iii(0, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 13216
 $ReallocAsyncCtx8 = _emscripten_realloc_async_context(8) | 0; //@line 13217
 _wait_ms(400); //@line 13218
 if (___async) {
  HEAP32[$ReallocAsyncCtx8 >> 2] = 66; //@line 13221
  $4 = $ReallocAsyncCtx8 + 4 | 0; //@line 13222
  HEAP32[$4 >> 2] = $2; //@line 13223
  sp = STACKTOP; //@line 13224
  return;
 }
 ___async_unwind = 0; //@line 13227
 HEAP32[$ReallocAsyncCtx8 >> 2] = 66; //@line 13228
 $4 = $ReallocAsyncCtx8 + 4 | 0; //@line 13229
 HEAP32[$4 >> 2] = $2; //@line 13230
 sp = STACKTOP; //@line 13231
 return;
}
function _mbed_die__async_cb_37($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx7 = 0, sp = 0;
 sp = STACKTOP; //@line 13187
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 13189
 _emscripten_asm_const_iii(0, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 13191
 $ReallocAsyncCtx7 = _emscripten_realloc_async_context(8) | 0; //@line 13192
 _wait_ms(400); //@line 13193
 if (___async) {
  HEAP32[$ReallocAsyncCtx7 >> 2] = 67; //@line 13196
  $4 = $ReallocAsyncCtx7 + 4 | 0; //@line 13197
  HEAP32[$4 >> 2] = $2; //@line 13198
  sp = STACKTOP; //@line 13199
  return;
 }
 ___async_unwind = 0; //@line 13202
 HEAP32[$ReallocAsyncCtx7 >> 2] = 67; //@line 13203
 $4 = $ReallocAsyncCtx7 + 4 | 0; //@line 13204
 HEAP32[$4 >> 2] = $2; //@line 13205
 sp = STACKTOP; //@line 13206
 return;
}
function _mbed_die__async_cb_36($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx6 = 0, sp = 0;
 sp = STACKTOP; //@line 13162
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 13164
 _emscripten_asm_const_iii(0, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 13166
 $ReallocAsyncCtx6 = _emscripten_realloc_async_context(8) | 0; //@line 13167
 _wait_ms(400); //@line 13168
 if (___async) {
  HEAP32[$ReallocAsyncCtx6 >> 2] = 68; //@line 13171
  $4 = $ReallocAsyncCtx6 + 4 | 0; //@line 13172
  HEAP32[$4 >> 2] = $2; //@line 13173
  sp = STACKTOP; //@line 13174
  return;
 }
 ___async_unwind = 0; //@line 13177
 HEAP32[$ReallocAsyncCtx6 >> 2] = 68; //@line 13178
 $4 = $ReallocAsyncCtx6 + 4 | 0; //@line 13179
 HEAP32[$4 >> 2] = $2; //@line 13180
 sp = STACKTOP; //@line 13181
 return;
}
function _mbed_die__async_cb_35($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx5 = 0, sp = 0;
 sp = STACKTOP; //@line 13137
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 13139
 _emscripten_asm_const_iii(0, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 13141
 $ReallocAsyncCtx5 = _emscripten_realloc_async_context(8) | 0; //@line 13142
 _wait_ms(400); //@line 13143
 if (___async) {
  HEAP32[$ReallocAsyncCtx5 >> 2] = 69; //@line 13146
  $4 = $ReallocAsyncCtx5 + 4 | 0; //@line 13147
  HEAP32[$4 >> 2] = $2; //@line 13148
  sp = STACKTOP; //@line 13149
  return;
 }
 ___async_unwind = 0; //@line 13152
 HEAP32[$ReallocAsyncCtx5 >> 2] = 69; //@line 13153
 $4 = $ReallocAsyncCtx5 + 4 | 0; //@line 13154
 HEAP32[$4 >> 2] = $2; //@line 13155
 sp = STACKTOP; //@line 13156
 return;
}
function _mbed_die__async_cb_34($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx4 = 0, sp = 0;
 sp = STACKTOP; //@line 13112
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 13114
 _emscripten_asm_const_iii(0, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 13116
 $ReallocAsyncCtx4 = _emscripten_realloc_async_context(8) | 0; //@line 13117
 _wait_ms(400); //@line 13118
 if (___async) {
  HEAP32[$ReallocAsyncCtx4 >> 2] = 70; //@line 13121
  $4 = $ReallocAsyncCtx4 + 4 | 0; //@line 13122
  HEAP32[$4 >> 2] = $2; //@line 13123
  sp = STACKTOP; //@line 13124
  return;
 }
 ___async_unwind = 0; //@line 13127
 HEAP32[$ReallocAsyncCtx4 >> 2] = 70; //@line 13128
 $4 = $ReallocAsyncCtx4 + 4 | 0; //@line 13129
 HEAP32[$4 >> 2] = $2; //@line 13130
 sp = STACKTOP; //@line 13131
 return;
}
function _mbed_die__async_cb_33($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 13087
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 13089
 _emscripten_asm_const_iii(0, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 13091
 $ReallocAsyncCtx3 = _emscripten_realloc_async_context(8) | 0; //@line 13092
 _wait_ms(400); //@line 13093
 if (___async) {
  HEAP32[$ReallocAsyncCtx3 >> 2] = 71; //@line 13096
  $4 = $ReallocAsyncCtx3 + 4 | 0; //@line 13097
  HEAP32[$4 >> 2] = $2; //@line 13098
  sp = STACKTOP; //@line 13099
  return;
 }
 ___async_unwind = 0; //@line 13102
 HEAP32[$ReallocAsyncCtx3 >> 2] = 71; //@line 13103
 $4 = $ReallocAsyncCtx3 + 4 | 0; //@line 13104
 HEAP32[$4 >> 2] = $2; //@line 13105
 sp = STACKTOP; //@line 13106
 return;
}
function _mbed_die__async_cb_32($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 13062
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 13064
 _emscripten_asm_const_iii(0, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 13066
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(8) | 0; //@line 13067
 _wait_ms(400); //@line 13068
 if (___async) {
  HEAP32[$ReallocAsyncCtx2 >> 2] = 72; //@line 13071
  $4 = $ReallocAsyncCtx2 + 4 | 0; //@line 13072
  HEAP32[$4 >> 2] = $2; //@line 13073
  sp = STACKTOP; //@line 13074
  return;
 }
 ___async_unwind = 0; //@line 13077
 HEAP32[$ReallocAsyncCtx2 >> 2] = 72; //@line 13078
 $4 = $ReallocAsyncCtx2 + 4 | 0; //@line 13079
 HEAP32[$4 >> 2] = $2; //@line 13080
 sp = STACKTOP; //@line 13081
 return;
}
function _mbed_die__async_cb_31($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 13037
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 13039
 _emscripten_asm_const_iii(0, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 13041
 $ReallocAsyncCtx = _emscripten_realloc_async_context(8) | 0; //@line 13042
 _wait_ms(400); //@line 13043
 if (___async) {
  HEAP32[$ReallocAsyncCtx >> 2] = 73; //@line 13046
  $4 = $ReallocAsyncCtx + 4 | 0; //@line 13047
  HEAP32[$4 >> 2] = $2; //@line 13048
  sp = STACKTOP; //@line 13049
  return;
 }
 ___async_unwind = 0; //@line 13052
 HEAP32[$ReallocAsyncCtx >> 2] = 73; //@line 13053
 $4 = $ReallocAsyncCtx + 4 | 0; //@line 13054
 HEAP32[$4 >> 2] = $2; //@line 13055
 sp = STACKTOP; //@line 13056
 return;
}
function __ZN4mbed10TimerEventC2Ev($0) {
 $0 = $0 | 0;
 var $1 = 0, $2 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 563
 HEAP32[$0 >> 2] = 372; //@line 564
 $1 = $0 + 8 | 0; //@line 565
 HEAP32[$1 >> 2] = 0; //@line 566
 HEAP32[$1 + 4 >> 2] = 0; //@line 566
 HEAP32[$1 + 8 >> 2] = 0; //@line 566
 HEAP32[$1 + 12 >> 2] = 0; //@line 566
 $2 = _get_us_ticker_data() | 0; //@line 567
 HEAP32[$0 + 24 >> 2] = $2; //@line 569
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 570
 _ticker_set_handler($2, 9); //@line 571
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 39; //@line 574
  sp = STACKTOP; //@line 575
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 578
  return;
 }
}
function __ZSt11__terminatePFvvE($0) {
 $0 = $0 | 0;
 var $AsyncCtx = 0, $vararg_buffer = 0, sp = 0;
 sp = STACKTOP; //@line 10448
 STACKTOP = STACKTOP + 16 | 0; //@line 10449
 $vararg_buffer = sp; //@line 10450
 $AsyncCtx = _emscripten_alloc_async_context(12, sp) | 0; //@line 10451
 FUNCTION_TABLE_v[$0 & 15](); //@line 10452
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 121; //@line 10455
  HEAP32[$AsyncCtx + 4 >> 2] = $vararg_buffer; //@line 10457
  HEAP32[$AsyncCtx + 8 >> 2] = $vararg_buffer; //@line 10459
  sp = STACKTOP; //@line 10460
  STACKTOP = sp; //@line 10461
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 10463
  _abort_message(4940, $vararg_buffer); //@line 10464
 }
}
function _sbrk(increment) {
 increment = increment | 0;
 var oldDynamicTop = 0, newDynamicTop = 0;
 oldDynamicTop = HEAP32[DYNAMICTOP_PTR >> 2] | 0; //@line 1791
 newDynamicTop = oldDynamicTop + increment | 0; //@line 1792
 if ((increment | 0) > 0 & (newDynamicTop | 0) < (oldDynamicTop | 0) | (newDynamicTop | 0) < 0) {
  abortOnCannotGrowMemory() | 0; //@line 1796
  ___setErrNo(12); //@line 1797
  return -1;
 }
 HEAP32[DYNAMICTOP_PTR >> 2] = newDynamicTop; //@line 1801
 if ((newDynamicTop | 0) > (getTotalMemory() | 0)) {
  if (!(enlargeMemory() | 0)) {
   HEAP32[DYNAMICTOP_PTR >> 2] = oldDynamicTop; //@line 1805
   ___setErrNo(12); //@line 1806
   return -1;
  }
 }
 return oldDynamicTop | 0; //@line 1810
}
function _fwrite($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $$ = 0, $11 = 0, $13 = 0, $15 = 0, $4 = 0, $phitmp = 0;
 $4 = Math_imul($2, $1) | 0; //@line 6090
 $$ = ($1 | 0) == 0 ? 0 : $2; //@line 6092
 if ((HEAP32[$3 + 76 >> 2] | 0) > -1) {
  $phitmp = (___lockfile($3) | 0) == 0; //@line 6098
  $11 = ___fwritex($0, $4, $3) | 0; //@line 6099
  if ($phitmp) {
   $13 = $11; //@line 6101
  } else {
   ___unlockfile($3); //@line 6103
   $13 = $11; //@line 6104
  }
 } else {
  $13 = ___fwritex($0, $4, $3) | 0; //@line 6108
 }
 if (($13 | 0) == ($4 | 0)) {
  $15 = $$; //@line 6112
 } else {
  $15 = ($13 >>> 0) / ($1 >>> 0) | 0; //@line 6115
 }
 return $15 | 0; //@line 6117
}
function _main__async_cb_22($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $6 = 0, $ReallocAsyncCtx5 = 0, sp = 0;
 sp = STACKTOP; //@line 12543
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 12545
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 12547
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 12549
 $ReallocAsyncCtx5 = _emscripten_realloc_async_context(16) | 0; //@line 12550
 _puts(1947) | 0; //@line 12551
 if (!___async) {
  ___async_unwind = 0; //@line 12554
 }
 HEAP32[$ReallocAsyncCtx5 >> 2] = 90; //@line 12556
 HEAP32[$ReallocAsyncCtx5 + 4 >> 2] = $2; //@line 12558
 HEAP32[$ReallocAsyncCtx5 + 8 >> 2] = $4; //@line 12560
 HEAP32[$ReallocAsyncCtx5 + 12 >> 2] = $6; //@line 12562
 sp = STACKTOP; //@line 12563
 return;
}
function _main__async_cb_21($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $6 = 0, $ReallocAsyncCtx4 = 0, sp = 0;
 sp = STACKTOP; //@line 12517
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 12519
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 12521
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 12523
 $ReallocAsyncCtx4 = _emscripten_realloc_async_context(16) | 0; //@line 12524
 _puts(2050) | 0; //@line 12525
 if (!___async) {
  ___async_unwind = 0; //@line 12528
 }
 HEAP32[$ReallocAsyncCtx4 >> 2] = 91; //@line 12530
 HEAP32[$ReallocAsyncCtx4 + 4 >> 2] = $2; //@line 12532
 HEAP32[$ReallocAsyncCtx4 + 8 >> 2] = $4; //@line 12534
 HEAP32[$ReallocAsyncCtx4 + 12 >> 2] = $6; //@line 12536
 sp = STACKTOP; //@line 12537
 return;
}
function _fmt_x($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $$05$lcssa = 0, $$056 = 0, $14 = 0, $15 = 0, $8 = 0;
 if (($0 | 0) == 0 & ($1 | 0) == 0) {
  $$05$lcssa = $2; //@line 7974
 } else {
  $$056 = $2; //@line 7976
  $15 = $1; //@line 7976
  $8 = $0; //@line 7976
  while (1) {
   $14 = $$056 + -1 | 0; //@line 7984
   HEAP8[$14 >> 0] = HEAPU8[2603 + ($8 & 15) >> 0] | 0 | $3; //@line 7985
   $8 = _bitshift64Lshr($8 | 0, $15 | 0, 4) | 0; //@line 7986
   $15 = tempRet0; //@line 7987
   if (($8 | 0) == 0 & ($15 | 0) == 0) {
    $$05$lcssa = $14; //@line 7992
    break;
   } else {
    $$056 = $14; //@line 7995
   }
  }
 }
 return $$05$lcssa | 0; //@line 7999
}
function __ZSt9terminatev() {
 var $0 = 0, $16 = 0, $17 = 0, $2 = 0, $5 = 0, sp = 0;
 sp = STACKTOP; //@line 10413
 $0 = ___cxa_get_globals_fast() | 0; //@line 10414
 if ($0 | 0) {
  $2 = HEAP32[$0 >> 2] | 0; //@line 10417
  if ($2 | 0) {
   $5 = $2 + 48 | 0; //@line 10421
   if ((HEAP32[$5 >> 2] & -256 | 0) == 1126902528 ? (HEAP32[$5 + 4 >> 2] | 0) == 1129074247 : 0) {
    $16 = HEAP32[$2 + 12 >> 2] | 0; //@line 10433
    _emscripten_alloc_async_context(4, sp) | 0; //@line 10434
    __ZSt11__terminatePFvvE($16); //@line 10435
   }
  }
 }
 $17 = __ZSt13get_terminatev() | 0; //@line 10440
 _emscripten_alloc_async_context(4, sp) | 0; //@line 10441
 __ZSt11__terminatePFvvE($17); //@line 10442
}
function ___stdout_write($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $14 = 0, $vararg_buffer = 0, sp = 0;
 sp = STACKTOP; //@line 5919
 STACKTOP = STACKTOP + 32 | 0; //@line 5920
 $vararg_buffer = sp; //@line 5921
 HEAP32[$0 + 36 >> 2] = 1; //@line 5924
 if (!(HEAP32[$0 >> 2] & 64)) {
  HEAP32[$vararg_buffer >> 2] = HEAP32[$0 + 60 >> 2]; //@line 5932
  HEAP32[$vararg_buffer + 4 >> 2] = 21523; //@line 5934
  HEAP32[$vararg_buffer + 8 >> 2] = sp + 16; //@line 5936
  if (___syscall54(54, $vararg_buffer | 0) | 0) {
   HEAP8[$0 + 75 >> 0] = -1; //@line 5941
  }
 }
 $14 = ___stdio_write($0, $1, $2) | 0; //@line 5944
 STACKTOP = sp; //@line 5945
 return $14 | 0; //@line 5945
}
function ___towrite($0) {
 $0 = $0 | 0;
 var $$0 = 0, $1 = 0, $14 = 0, $3 = 0, $7 = 0;
 $1 = $0 + 74 | 0; //@line 6207
 $3 = HEAP8[$1 >> 0] | 0; //@line 6209
 HEAP8[$1 >> 0] = $3 + 255 | $3; //@line 6213
 $7 = HEAP32[$0 >> 2] | 0; //@line 6214
 if (!($7 & 8)) {
  HEAP32[$0 + 8 >> 2] = 0; //@line 6219
  HEAP32[$0 + 4 >> 2] = 0; //@line 6221
  $14 = HEAP32[$0 + 44 >> 2] | 0; //@line 6223
  HEAP32[$0 + 28 >> 2] = $14; //@line 6225
  HEAP32[$0 + 20 >> 2] = $14; //@line 6227
  HEAP32[$0 + 16 >> 2] = $14 + (HEAP32[$0 + 48 >> 2] | 0); //@line 6233
  $$0 = 0; //@line 6234
 } else {
  HEAP32[$0 >> 2] = $7 | 32; //@line 6237
  $$0 = -1; //@line 6238
 }
 return $$0 | 0; //@line 6240
}
function __ZN4mbed11InterruptInD2Ev__async_cb($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $8 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 1028
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 1030
 $4 = HEAP32[$2 + 52 >> 2] | 0; //@line 1032
 if (!$4) {
  return;
 }
 $8 = HEAP32[$4 + 8 >> 2] | 0; //@line 1039
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(4) | 0; //@line 1040
 FUNCTION_TABLE_vi[$8 & 255]($2 + 40 | 0); //@line 1041
 if (___async) {
  HEAP32[$ReallocAsyncCtx2 >> 2] = 22; //@line 1044
  sp = STACKTOP; //@line 1045
  return;
 }
 ___async_unwind = 0; //@line 1048
 HEAP32[$ReallocAsyncCtx2 >> 2] = 22; //@line 1049
 sp = STACKTOP; //@line 1050
 return;
}
function __GLOBAL__sub_I_main_cpp__async_cb_61($0) {
 $0 = $0 | 0;
 var $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 927
 HEAP32[1272] = 428; //@line 928
 HEAP32[1282] = 0; //@line 929
 HEAP32[1283] = 0; //@line 929
 HEAP32[1284] = 0; //@line 929
 HEAP32[1285] = 0; //@line 929
 HEAP8[5144] = 1; //@line 930
 $ReallocAsyncCtx = _emscripten_realloc_async_context(4) | 0; //@line 931
 __ZN4mbed10TimerEventC2Ev(5152); //@line 932
 if (___async) {
  HEAP32[$ReallocAsyncCtx >> 2] = 85; //@line 935
  sp = STACKTOP; //@line 936
  return;
 }
 ___async_unwind = 0; //@line 939
 HEAP32[$ReallocAsyncCtx >> 2] = 85; //@line 940
 sp = STACKTOP; //@line 941
 return;
}
function _fmt_o($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$0$lcssa = 0, $$06 = 0, $10 = 0, $11 = 0, $7 = 0;
 if (($0 | 0) == 0 & ($1 | 0) == 0) {
  $$0$lcssa = $2; //@line 8011
 } else {
  $$06 = $2; //@line 8013
  $11 = $1; //@line 8013
  $7 = $0; //@line 8013
  while (1) {
   $10 = $$06 + -1 | 0; //@line 8018
   HEAP8[$10 >> 0] = $7 & 7 | 48; //@line 8019
   $7 = _bitshift64Lshr($7 | 0, $11 | 0, 3) | 0; //@line 8020
   $11 = tempRet0; //@line 8021
   if (($7 | 0) == 0 & ($11 | 0) == 0) {
    $$0$lcssa = $10; //@line 8026
    break;
   } else {
    $$06 = $10; //@line 8029
   }
  }
 }
 return $$0$lcssa | 0; //@line 8033
}
function ___cxa_is_pointer_type($0) {
 $0 = $0 | 0;
 var $2 = 0, $3 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 11289
 do {
  if (!$0) {
   $3 = 0; //@line 11293
  } else {
   $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 11295
   $2 = ___dynamic_cast($0, 240, 296, 0) | 0; //@line 11296
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 135; //@line 11299
    sp = STACKTOP; //@line 11300
    return 0; //@line 11301
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 11303
    $3 = ($2 | 0) != 0 & 1; //@line 11306
    break;
   }
  }
 } while (0);
 return $3 | 0; //@line 11311
}
function __ZN4mbed7Timeout7handlerEv__async_cb_64($0) {
 $0 = $0 | 0;
 var $4 = 0, $5 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 1068
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 1072
 $5 = HEAP32[HEAP32[HEAP32[$0 + 4 >> 2] >> 2] >> 2] | 0; //@line 1074
 $ReallocAsyncCtx = _emscripten_realloc_async_context(4) | 0; //@line 1075
 FUNCTION_TABLE_vi[$5 & 255]($4); //@line 1076
 if (___async) {
  HEAP32[$ReallocAsyncCtx >> 2] = 37; //@line 1079
  sp = STACKTOP; //@line 1080
  return;
 }
 ___async_unwind = 0; //@line 1083
 HEAP32[$ReallocAsyncCtx >> 2] = 37; //@line 1084
 sp = STACKTOP; //@line 1085
 return;
}
function _invoke_ticker__async_cb_28($0) {
 $0 = $0 | 0;
 var $5 = 0, $6 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 12784
 $5 = HEAP32[HEAP32[HEAP32[$0 + 4 >> 2] >> 2] >> 2] | 0; //@line 12790
 $6 = HEAP32[$0 + 8 >> 2] | 0; //@line 12791
 $ReallocAsyncCtx = _emscripten_realloc_async_context(4) | 0; //@line 12792
 FUNCTION_TABLE_vi[$5 & 255]($6); //@line 12793
 if (___async) {
  HEAP32[$ReallocAsyncCtx >> 2] = 81; //@line 12796
  sp = STACKTOP; //@line 12797
  return;
 }
 ___async_unwind = 0; //@line 12800
 HEAP32[$ReallocAsyncCtx >> 2] = 81; //@line 12801
 sp = STACKTOP; //@line 12802
 return;
}
function _getint_671($0) {
 $0 = $0 | 0;
 var $$0$lcssa = 0, $$04 = 0, $11 = 0, $12 = 0, $7 = 0;
 if (!(_isdigit(HEAP8[HEAP32[$0 >> 2] >> 0] | 0) | 0)) {
  $$0$lcssa = 0; //@line 7655
 } else {
  $$04 = 0; //@line 7657
  while (1) {
   $7 = HEAP32[$0 >> 2] | 0; //@line 7660
   $11 = ($$04 * 10 | 0) + -48 + (HEAP8[$7 >> 0] | 0) | 0; //@line 7664
   $12 = $7 + 1 | 0; //@line 7665
   HEAP32[$0 >> 2] = $12; //@line 7666
   if (!(_isdigit(HEAP8[$12 >> 0] | 0) | 0)) {
    $$0$lcssa = $11; //@line 7672
    break;
   } else {
    $$04 = $11; //@line 7675
   }
  }
 }
 return $$0$lcssa | 0; //@line 7679
}
function ___muldi3($a$0, $a$1, $b$0, $b$1) {
 $a$0 = $a$0 | 0;
 $a$1 = $a$1 | 0;
 $b$0 = $b$0 | 0;
 $b$1 = $b$1 | 0;
 var $x_sroa_0_0_extract_trunc = 0, $y_sroa_0_0_extract_trunc = 0, $1$0 = 0, $1$1 = 0;
 $x_sroa_0_0_extract_trunc = $a$0; //@line 1325
 $y_sroa_0_0_extract_trunc = $b$0; //@line 1326
 $1$0 = ___muldsi3($x_sroa_0_0_extract_trunc, $y_sroa_0_0_extract_trunc) | 0; //@line 1327
 $1$1 = tempRet0; //@line 1328
 return (tempRet0 = (Math_imul($a$1, $y_sroa_0_0_extract_trunc) | 0) + (Math_imul($b$1, $x_sroa_0_0_extract_trunc) | 0) + $1$1 | $1$1 & 0, $1$0 | 0 | 0) | 0; //@line 1330
}
function runPostSets() {}
function ___muldsi3($a, $b) {
 $a = $a | 0;
 $b = $b | 0;
 var $1 = 0, $2 = 0, $3 = 0, $6 = 0, $8 = 0, $11 = 0, $12 = 0;
 $1 = $a & 65535; //@line 1310
 $2 = $b & 65535; //@line 1311
 $3 = Math_imul($2, $1) | 0; //@line 1312
 $6 = $a >>> 16; //@line 1313
 $8 = ($3 >>> 16) + (Math_imul($2, $6) | 0) | 0; //@line 1314
 $11 = $b >>> 16; //@line 1315
 $12 = Math_imul($11, $1) | 0; //@line 1316
 return (tempRet0 = ($8 >>> 16) + (Math_imul($11, $6) | 0) + ((($8 & 65535) + $12 | 0) >>> 16) | 0, $8 + $12 << 16 | $3 & 65535 | 0) | 0; //@line 1317
}
function _ticker_set_handler($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 607
 $AsyncCtx = _emscripten_alloc_async_context(12, sp) | 0; //@line 608
 _initialize($0); //@line 609
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 41; //@line 612
  HEAP32[$AsyncCtx + 4 >> 2] = $0; //@line 614
  HEAP32[$AsyncCtx + 8 >> 2] = $1; //@line 616
  sp = STACKTOP; //@line 617
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 620
  HEAP32[HEAP32[$0 + 4 >> 2] >> 2] = $1; //@line 623
  return;
 }
}
function __ZN4mbed7TimeoutD2Ev__async_cb($0) {
 $0 = $0 | 0;
 var $2 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 11688
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 11690
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(4) | 0; //@line 11691
 __ZN4mbed10TimerEventD2Ev($2); //@line 11692
 if (___async) {
  HEAP32[$ReallocAsyncCtx2 >> 2] = 33; //@line 11695
  sp = STACKTOP; //@line 11696
  return;
 }
 ___async_unwind = 0; //@line 11699
 HEAP32[$ReallocAsyncCtx2 >> 2] = 33; //@line 11700
 sp = STACKTOP; //@line 11701
 return;
}
function __ZN4mbed6TickerD2Ev__async_cb($0) {
 $0 = $0 | 0;
 var $2 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 11355
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 11357
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(4) | 0; //@line 11358
 __ZN4mbed10TimerEventD2Ev($2); //@line 11359
 if (___async) {
  HEAP32[$ReallocAsyncCtx2 >> 2] = 76; //@line 11362
  sp = STACKTOP; //@line 11363
  return;
 }
 ___async_unwind = 0; //@line 11366
 HEAP32[$ReallocAsyncCtx2 >> 2] = 76; //@line 11367
 sp = STACKTOP; //@line 11368
 return;
}
function __Z11toggle_led2v() {
 var $2 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 2188
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 2189
 _puts(1899) | 0; //@line 2190
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 87; //@line 2193
  sp = STACKTOP; //@line 2194
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 2197
  $2 = (_emscripten_asm_const_ii(8, HEAP32[1311] | 0) | 0) == 0 & 1; //@line 2201
  _emscripten_asm_const_iii(0, HEAP32[1311] | 0, $2 | 0) | 0; //@line 2203
  return;
 }
}
function __ZN4mbed6Ticker7handlerEv($0) {
 $0 = $0 | 0;
 var $2 = 0, $5 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 1980
 $2 = HEAP32[$0 + 52 >> 2] | 0; //@line 1982
 if (!$2) {
  return;
 }
 $5 = HEAP32[$2 >> 2] | 0; //@line 1988
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 1989
 FUNCTION_TABLE_vi[$5 & 255]($0 + 40 | 0); //@line 1990
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 79; //@line 1993
  sp = STACKTOP; //@line 1994
  return;
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 1997
 return;
}
function __Z10blink_led1v() {
 var $2 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 2167
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 2168
 _puts(1816) | 0; //@line 2169
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 86; //@line 2172
  sp = STACKTOP; //@line 2173
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 2176
  $2 = (_emscripten_asm_const_ii(8, HEAP32[1305] | 0) | 0) == 0 & 1; //@line 2180
  _emscripten_asm_const_iii(0, HEAP32[1305] | 0, $2 | 0) | 0; //@line 2182
  return;
 }
}
function __ZN4mbed11InterruptInC2E7PinName($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $2 = 0, $3 = 0, $4 = 0, dest = 0, stop = 0;
 HEAP32[$0 >> 2] = 336; //@line 163
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
function __ZN4mbed6TickerD0Ev__async_cb($0) {
 $0 = $0 | 0;
 var $2 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 11328
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 11330
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(8) | 0; //@line 11331
 __ZN4mbed10TimerEventD2Ev($2); //@line 11332
 if (!___async) {
  ___async_unwind = 0; //@line 11335
 }
 HEAP32[$ReallocAsyncCtx2 >> 2] = 78; //@line 11337
 HEAP32[$ReallocAsyncCtx2 + 4 >> 2] = $2; //@line 11339
 sp = STACKTOP; //@line 11340
 return;
}
function __ZN4mbed10TimerEventD2Ev($0) {
 $0 = $0 | 0;
 var $2 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 536
 HEAP32[$0 >> 2] = 372; //@line 537
 $2 = HEAP32[$0 + 24 >> 2] | 0; //@line 539
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 541
 _ticker_remove_event($2, $0 + 8 | 0); //@line 542
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 38; //@line 545
  sp = STACKTOP; //@line 546
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 549
  return;
 }
}
function __ZN4mbed7TimeoutD0Ev__async_cb($0) {
 $0 = $0 | 0;
 var $2 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 1109
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 1111
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(8) | 0; //@line 1112
 __ZN4mbed10TimerEventD2Ev($2); //@line 1113
 if (!___async) {
  ___async_unwind = 0; //@line 1116
 }
 HEAP32[$ReallocAsyncCtx2 >> 2] = 35; //@line 1118
 HEAP32[$ReallocAsyncCtx2 + 4 >> 2] = $2; //@line 1120
 sp = STACKTOP; //@line 1121
 return;
}
function _emscripten_async_resume() {
 ___async = 0; //@line 1642
 ___async_unwind = 1; //@line 1643
 while (1) {
  if (!___async_cur_frame) return;
  dynCall_vi(HEAP32[___async_cur_frame + 8 >> 2] | 0, ___async_cur_frame + 8 | 0); //@line 1649
  if (___async) return;
  if (!___async_unwind) {
   ___async_unwind = 1; //@line 1653
   continue;
  }
  stackRestore(HEAP32[___async_cur_frame + 4 >> 2] | 0); //@line 1657
  ___async_cur_frame = HEAP32[___async_cur_frame >> 2] | 0; //@line 1659
 }
}
function __ZN4mbed8CallbackIFvvEE13function_callIPS1_EEvPKv($0) {
 $0 = $0 | 0;
 var $1 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 2068
 $1 = HEAP32[$0 >> 2] | 0; //@line 2069
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 2070
 FUNCTION_TABLE_v[$1 & 15](); //@line 2071
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 82; //@line 2074
  sp = STACKTOP; //@line 2075
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 2078
  return;
 }
}
function __ZN4mbed10TimerEvent3irqEj($0) {
 $0 = $0 | 0;
 var $5 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 585
 $5 = HEAP32[(HEAP32[$0 >> 2] | 0) + 8 >> 2] | 0; //@line 590
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 591
 FUNCTION_TABLE_vi[$5 & 255]($0); //@line 592
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 40; //@line 595
  sp = STACKTOP; //@line 596
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 599
  return;
 }
}
function _handle_interrupt_in($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $2 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 1807
 $2 = HEAP32[1304] | 0; //@line 1808
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 1809
 FUNCTION_TABLE_vii[$2 & 3]($0, $1); //@line 1810
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 74; //@line 1813
  sp = STACKTOP; //@line 1814
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 1817
  return;
 }
}
function ___uremdi3($a$0, $a$1, $b$0, $b$1) {
 $a$0 = $a$0 | 0;
 $a$1 = $a$1 | 0;
 $b$0 = $b$0 | 0;
 $b$1 = $b$1 | 0;
 var $rem = 0, __stackBase__ = 0;
 __stackBase__ = STACKTOP; //@line 1585
 STACKTOP = STACKTOP + 16 | 0; //@line 1586
 $rem = __stackBase__ | 0; //@line 1587
 ___udivmoddi4($a$0, $a$1, $b$0, $b$1, $rem) | 0; //@line 1588
 STACKTOP = __stackBase__; //@line 1589
 return (tempRet0 = HEAP32[$rem + 4 >> 2] | 0, HEAP32[$rem >> 2] | 0) | 0; //@line 1590
}
function _llvm_cttz_i32(x) {
 x = x | 0;
 var ret = 0;
 ret = HEAP8[cttz_i8 + (x & 255) >> 0] | 0; //@line 1355
 if ((ret | 0) < 8) return ret | 0; //@line 1356
 ret = HEAP8[cttz_i8 + (x >> 8 & 255) >> 0] | 0; //@line 1357
 if ((ret | 0) < 8) return ret + 8 | 0; //@line 1358
 ret = HEAP8[cttz_i8 + (x >> 16 & 255) >> 0] | 0; //@line 1359
 if ((ret | 0) < 8) return ret + 16 | 0; //@line 1360
 return (HEAP8[cttz_i8 + (x >>> 24) >> 0] | 0) + 24 | 0; //@line 1361
}
function __ZNK10__cxxabiv117__class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($0, $1, $2, $3, $4, $5) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 $5 = $5 | 0;
 if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, $5) | 0) {
  __ZNK10__cxxabiv117__class_type_info29process_static_type_above_dstEPNS_19__dynamic_cast_infoEPKvS4_i(0, $1, $2, $3, $4); //@line 9802
 }
 return;
}
function __Z12turn_led3_onv() {
 var $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 2209
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 2210
 _puts(1920) | 0; //@line 2211
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 88; //@line 2214
  sp = STACKTOP; //@line 2215
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 2218
  _emscripten_asm_const_iii(0, HEAP32[1317] | 0, 1) | 0; //@line 2220
  return;
 }
}
function __ZL25default_terminate_handlerv__async_cb_48($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $AsyncRetVal = 0;
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 13551
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 13553
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 13555
 HEAP32[$2 >> 2] = 4649; //@line 13556
 HEAP32[$2 + 4 >> 2] = $4; //@line 13558
 HEAP32[$2 + 8 >> 2] = $AsyncRetVal; //@line 13560
 _abort_message(4513, $2); //@line 13561
}
function _abort_message__async_cb($0) {
 $0 = $0 | 0;
 var $2 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 12890
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 12892
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(4) | 0; //@line 12893
 _fputc(10, $2) | 0; //@line 12894
 if (!___async) {
  ___async_unwind = 0; //@line 12897
 }
 HEAP32[$ReallocAsyncCtx2 >> 2] = 111; //@line 12899
 sp = STACKTOP; //@line 12900
 return;
}
function _gpio_irq_init($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $$0 = 0;
 if (($1 | 0) == -1) {
  $$0 = -1; //@line 1830
  return $$0 | 0; //@line 1831
 }
 HEAP32[1304] = $2; //@line 1833
 HEAP32[$0 >> 2] = $1; //@line 1834
 HEAP32[$0 + 4 >> 2] = $1; //@line 1836
 _emscripten_asm_const_iii(3, $3 | 0, $1 | 0) | 0; //@line 1837
 $$0 = 0; //@line 1838
 return $$0 | 0; //@line 1839
}
function ___stdio_close($0) {
 $0 = $0 | 0;
 var $5 = 0, $vararg_buffer = 0, sp = 0;
 sp = STACKTOP; //@line 5730
 STACKTOP = STACKTOP + 16 | 0; //@line 5731
 $vararg_buffer = sp; //@line 5732
 HEAP32[$vararg_buffer >> 2] = _dummy(HEAP32[$0 + 60 >> 2] | 0) | 0; //@line 5736
 $5 = ___syscall_ret(___syscall6(6, $vararg_buffer | 0) | 0) | 0; //@line 5738
 STACKTOP = sp; //@line 5739
 return $5 | 0; //@line 5739
}
function __ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv__async_cb($0) {
 $0 = $0 | 0;
 var $$0 = 0, $2 = 0;
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 955
 if ((HEAP32[$2 + 24 >> 2] | 0) == 1) {
  HEAP32[HEAP32[$0 + 8 >> 2] >> 2] = HEAP32[$2 + 16 >> 2]; //@line 966
  $$0 = 1; //@line 967
 } else {
  $$0 = 0; //@line 969
 }
 HEAP8[___async_retval >> 0] = $$0 & 1; //@line 973
 return;
}
function __ZNK10__cxxabiv117__class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, 0) | 0) {
  __ZNK10__cxxabiv117__class_type_info24process_found_base_classEPNS_19__dynamic_cast_infoEPvi(0, $1, $2, $3); //@line 9878
 }
 return;
}
function _wait_ms($0) {
 $0 = $0 | 0;
 var $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 2115
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 2116
 _emscripten_sleep($0 | 0); //@line 2117
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 83; //@line 2120
  sp = STACKTOP; //@line 2121
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 2124
  return;
 }
}
function _main__async_cb_19($0) {
 $0 = $0 | 0;
 var $ReallocAsyncCtx10 = 0, sp = 0;
 sp = STACKTOP; //@line 12454
 $ReallocAsyncCtx10 = _emscripten_realloc_async_context(4) | 0; //@line 12455
 _wait_ms(-1); //@line 12456
 if (!___async) {
  ___async_unwind = 0; //@line 12459
 }
 HEAP32[$ReallocAsyncCtx10 >> 2] = 98; //@line 12461
 sp = STACKTOP; //@line 12462
 return;
}
function ___cxa_get_globals_fast() {
 var $3 = 0, sp = 0;
 sp = STACKTOP; //@line 9634
 STACKTOP = STACKTOP + 16 | 0; //@line 9635
 if (!(_pthread_once(5928, 10) | 0)) {
  $3 = _pthread_getspecific(HEAP32[1483] | 0) | 0; //@line 9641
  STACKTOP = sp; //@line 9642
  return $3 | 0; //@line 9642
 } else {
  _abort_message(4788, sp); //@line 9644
 }
 return 0; //@line 9647
}
function __ZNK10__cxxabiv117__class_type_info29process_static_type_below_dstEPNS_19__dynamic_cast_infoEPKvi($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $7 = 0;
 if ((HEAP32[$1 + 4 >> 2] | 0) == ($2 | 0)) {
  $7 = $1 + 28 | 0; //@line 9942
  if ((HEAP32[$7 >> 2] | 0) != 1) {
   HEAP32[$7 >> 2] = $3; //@line 9946
  }
 }
 return;
}
function _emscripten_alloc_async_context(len, sp) {
 len = len | 0;
 sp = sp | 0;
 var new_frame = 0;
 new_frame = stackAlloc(len + 8 | 0) | 0; //@line 1619
 HEAP32[new_frame + 4 >> 2] = sp; //@line 1621
 HEAP32[new_frame >> 2] = ___async_cur_frame; //@line 1623
 ___async_cur_frame = new_frame; //@line 1624
 return ___async_cur_frame + 8 | 0; //@line 1625
}
function __ZN10__cxxabiv112_GLOBAL__N_19destruct_EPv($0) {
 $0 = $0 | 0;
 var sp = 0;
 sp = STACKTOP; //@line 10396
 STACKTOP = STACKTOP + 16 | 0; //@line 10397
 _free($0); //@line 10399
 if (!(_pthread_setspecific(HEAP32[1483] | 0, 0) | 0)) {
  STACKTOP = sp; //@line 10404
  return;
 } else {
  _abort_message(4887, sp); //@line 10406
 }
}
function ___cxa_can_catch__async_cb($0) {
 $0 = $0 | 0;
 var $AsyncRetVal = 0;
 $AsyncRetVal = HEAP8[___async_retval >> 0] & 1; //@line 1145
 if ($AsyncRetVal) {
  HEAP32[HEAP32[$0 + 8 >> 2] >> 2] = HEAP32[HEAP32[$0 + 4 >> 2] >> 2]; //@line 1149
 }
 HEAP32[___async_retval >> 2] = $AsyncRetVal & 1; //@line 1152
 return;
}
function __GLOBAL__sub_I_main_cpp__async_cb($0) {
 $0 = $0 | 0;
 HEAP32[1298] = 0; //@line 918
 HEAP32[1299] = 0; //@line 918
 HEAP32[1300] = 0; //@line 918
 HEAP32[1301] = 0; //@line 918
 HEAP8[5208] = 1; //@line 919
 HEAP32[1288] = 352; //@line 920
 __ZN4mbed11InterruptInC2E7PinName(5292, 1337); //@line 921
 return;
}
function _bitshift64Shl(low, high, bits) {
 low = low | 0;
 high = high | 0;
 bits = bits | 0;
 if ((bits | 0) < 32) {
  tempRet0 = high << bits | (low & (1 << bits) - 1 << 32 - bits) >>> 32 - bits; //@line 1608
  return low << bits; //@line 1609
 }
 tempRet0 = low << bits - 32; //@line 1611
 return 0; //@line 1612
}
function _bitshift64Lshr(low, high, bits) {
 low = low | 0;
 high = high | 0;
 bits = bits | 0;
 if ((bits | 0) < 32) {
  tempRet0 = high >>> bits; //@line 1597
  return low >>> bits | (high & (1 << bits) - 1) << 32 - bits; //@line 1598
 }
 tempRet0 = 0; //@line 1600
 return high >>> bits - 32 | 0; //@line 1601
}
function __ZN4mbed11InterruptIn4fallENS_8CallbackIFvvEEE__async_cb_14($0) {
 $0 = $0 | 0;
 var $6 = 0;
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 12253
 HEAP32[HEAP32[$0 + 8 >> 2] >> 2] = HEAP32[HEAP32[$0 + 4 >> 2] >> 2]; //@line 12255
 _gpio_irq_set($6 + 28 | 0, 2, 1); //@line 12257
 return;
}
function __ZN10__cxxabiv112_GLOBAL__N_110construct_Ev() {
 var sp = 0;
 sp = STACKTOP; //@line 10381
 STACKTOP = STACKTOP + 16 | 0; //@line 10382
 if (!(_pthread_key_create(5932, 120) | 0)) {
  STACKTOP = sp; //@line 10387
  return;
 } else {
  _abort_message(4837, sp); //@line 10389
 }
}
function _puts__async_cb($0) {
 $0 = $0 | 0;
 var $$lobit = 0;
 $$lobit = HEAP32[___async_retval >> 2] >> 31; //@line 1165
 if (HEAP32[$0 + 4 >> 2] | 0) {
  ___unlockfile(HEAP32[$0 + 8 >> 2] | 0); //@line 1168
 }
 HEAP32[___async_retval >> 2] = $$lobit; //@line 1171
 return;
}
function ___overflow__async_cb($0) {
 $0 = $0 | 0;
 var $$0 = 0;
 if ((HEAP32[___async_retval >> 2] | 0) == 1) {
  $$0 = HEAPU8[HEAP32[$0 + 4 >> 2] >> 0] | 0; //@line 14101
 } else {
  $$0 = -1; //@line 14103
 }
 HEAP32[___async_retval >> 2] = $$0; //@line 14106
 return;
}
function ___lctrans_impl($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0 = 0;
 if (!$1) {
  $$0 = 0; //@line 6337
 } else {
  $$0 = ___mo_lookup(HEAP32[$1 >> 2] | 0, HEAP32[$1 + 4 >> 2] | 0, $0) | 0; //@line 6343
 }
 return ($$0 | 0 ? $$0 : $0) | 0; //@line 6347
}
function dynCall_viiiiii(index, a1, a2, a3, a4, a5, a6) {
 index = index | 0;
 a1 = a1 | 0;
 a2 = a2 | 0;
 a3 = a3 | 0;
 a4 = a4 | 0;
 a5 = a5 | 0;
 a6 = a6 | 0;
 FUNCTION_TABLE_viiiiii[index & 3](a1 | 0, a2 | 0, a3 | 0, a4 | 0, a5 | 0, a6 | 0); //@line 1873
}
function _fputc__async_cb($0) {
 $0 = $0 | 0;
 var $AsyncRetVal = 0;
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 12178
 ___unlockfile(HEAP32[$0 + 4 >> 2] | 0); //@line 12179
 HEAP32[___async_retval >> 2] = $AsyncRetVal; //@line 12181
 return;
}
function _gpio_init_out($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 HEAP32[$0 >> 2] = $1; //@line 1793
 if (($1 | 0) == -1) {
  return;
 }
 HEAP32[$0 + 4 >> 2] = $1; //@line 1799
 _emscripten_asm_const_iii(2, $0 | 0, $1 | 0) | 0; //@line 1800
 return;
}
function ___DOUBLE_BITS_677($0) {
 $0 = +$0;
 var $1 = 0;
 HEAPF64[tempDoublePtr >> 3] = $0; //@line 9096
 $1 = HEAP32[tempDoublePtr >> 2] | 0; //@line 9096
 tempRet0 = HEAP32[tempDoublePtr + 4 >> 2] | 0; //@line 9098
 return $1 | 0; //@line 9099
}
function _gpio_init_in($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 HEAP32[$0 >> 2] = $1; //@line 1778
 if (($1 | 0) == -1) {
  return;
 }
 HEAP32[$0 + 4 >> 2] = $1; //@line 1784
 _emscripten_asm_const_iii(1, $0 | 0, $1 | 0) | 0; //@line 1785
 return;
}
function ___syscall_ret($0) {
 $0 = $0 | 0;
 var $$0 = 0;
 if ($0 >>> 0 > 4294963200) {
  HEAP32[(___errno_location() | 0) >> 2] = 0 - $0; //@line 5896
  $$0 = -1; //@line 5897
 } else {
  $$0 = $0; //@line 5899
 }
 return $$0 | 0; //@line 5901
}
function _i64Subtract(a, b, c, d) {
 a = a | 0;
 b = b | 0;
 c = c | 0;
 d = d | 0;
 var h = 0;
 h = b - d >>> 0; //@line 1348
 h = b - d - (c >>> 0 > a >>> 0 | 0) >>> 0; //@line 1349
 return (tempRet0 = h, a - c >>> 0 | 0) | 0; //@line 1350
}
function __ZN4mbed6Ticker5setupEy($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $4 = 0;
 $4 = ___udivdi3($1 | 0, $2 | 0, 1e3, 0) | 0; //@line 2052
 _emscripten_asm_const_iii(7, $0 + 40 | 0, $4 | 0) | 0; //@line 2054
 return;
}
function __Z11toggle_led2v__async_cb($0) {
 $0 = $0 | 0;
 var $3 = 0;
 $3 = (_emscripten_asm_const_ii(8, HEAP32[1311] | 0) | 0) == 0 & 1; //@line 1299
 _emscripten_asm_const_iii(0, HEAP32[1311] | 0, $3 | 0) | 0; //@line 1301
 return;
}
function __Z10blink_led1v__async_cb($0) {
 $0 = $0 | 0;
 var $3 = 0;
 $3 = (_emscripten_asm_const_ii(8, HEAP32[1305] | 0) | 0) == 0 & 1; //@line 1181
 _emscripten_asm_const_iii(0, HEAP32[1305] | 0, $3 | 0) | 0; //@line 1183
 return;
}
function dynCall_viiiii(index, a1, a2, a3, a4, a5) {
 index = index | 0;
 a1 = a1 | 0;
 a2 = a2 | 0;
 a3 = a3 | 0;
 a4 = a4 | 0;
 a5 = a5 | 0;
 FUNCTION_TABLE_viiiii[index & 3](a1 | 0, a2 | 0, a3 | 0, a4 | 0, a5 | 0); //@line 1866
}
function ___clang_call_terminate($0) {
 $0 = $0 | 0;
 var sp = 0;
 sp = STACKTOP; //@line 47
 ___cxa_begin_catch($0 | 0) | 0; //@line 48
 _emscripten_alloc_async_context(4, sp) | 0; //@line 49
 __ZSt9terminatev(); //@line 50
}
function _i64Add(a, b, c, d) {
 a = a | 0;
 b = b | 0;
 c = c | 0;
 d = d | 0;
 var l = 0;
 l = a + c >>> 0; //@line 1340
 return (tempRet0 = b + d + (l >>> 0 < a >>> 0 | 0) >>> 0, l | 0) | 0; //@line 1342
}
function dynCall_viiii(index, a1, a2, a3, a4) {
 index = index | 0;
 a1 = a1 | 0;
 a2 = a2 | 0;
 a3 = a3 | 0;
 a4 = a4 | 0;
 FUNCTION_TABLE_viiii[index & 3](a1 | 0, a2 | 0, a3 | 0, a4 | 0); //@line 1859
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
  $$0 = 0; //@line 8156
 } else {
  $$0 = _wcrtomb($0, $1, 0) | 0; //@line 8159
 }
 return $$0 | 0; //@line 8161
}
function _emscripten_free_async_context(ctx) {
 ctx = ctx | 0;
 stackRestore(___async_cur_frame | 0); //@line 1631
 ___async_cur_frame = HEAP32[___async_cur_frame >> 2] | 0; //@line 1632
}
function dynCall_iiii(index, a1, a2, a3) {
 index = index | 0;
 a1 = a1 | 0;
 a2 = a2 | 0;
 a3 = a3 | 0;
 return FUNCTION_TABLE_iiii[index & 7](a1 | 0, a2 | 0, a3 | 0) | 0; //@line 1831
}
function ___udivdi3($a$0, $a$1, $b$0, $b$1) {
 $a$0 = $a$0 | 0;
 $a$1 = $a$1 | 0;
 $b$0 = $b$0 | 0;
 $b$1 = $b$1 | 0;
 return ___udivmoddi4($a$0, $a$1, $b$0, $b$1, 0) | 0; //@line 1577
}
function _fputs($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $2 = 0;
 $2 = _strlen($0) | 0; //@line 6077
 return ((_fwrite($0, 1, $2, $1) | 0) != ($2 | 0)) << 31 >> 31 | 0; //@line 6081
}
function ___dynamic_cast__async_cb($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = (HEAP32[HEAP32[$0 + 4 >> 2] >> 2] | 0) == 1 ? HEAP32[$0 + 8 >> 2] | 0 : 0; //@line 1214
 return;
}
function _gpio_irq_set($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 _emscripten_asm_const_iiii(5, HEAP32[$0 + 4 >> 2] | 0, $1 | 0, $2 | 0) | 0; //@line 1858
 return;
}
function _emscripten_realloc_async_context(len) {
 len = len | 0;
 stackRestore(___async_cur_frame | 0); //@line 1637
 return (stackAlloc(len + 8 | 0) | 0) + 8 | 0; //@line 1638
}
function establishStackSpace(stackBase, stackMax) {
 stackBase = stackBase | 0;
 stackMax = stackMax | 0;
 STACKTOP = stackBase; //@line 20
 STACK_MAX = stackMax; //@line 21
}
function __ZN4mbed11InterruptIn4fallENS_8CallbackIFvvEEE__async_cb_17($0) {
 $0 = $0 | 0;
 _gpio_irq_set((HEAP32[$0 + 8 >> 2] | 0) + 28 | 0, 2, 0); //@line 12368
 return;
}
function __ZN10__cxxabiv121__vmi_class_type_infoD0Ev($0) {
 $0 = $0 | 0;
 __ZN10__cxxabiv116__shim_type_infoD2Ev($0); //@line 10481
 __ZdlPv($0); //@line 10482
 return;
}
function __ZN10__cxxabiv120__si_class_type_infoD0Ev($0) {
 $0 = $0 | 0;
 __ZN10__cxxabiv116__shim_type_infoD2Ev($0); //@line 10164
 __ZdlPv($0); //@line 10165
 return;
}
function _swapc($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $3 = 0;
 $3 = _llvm_bswap_i32($0 | 0) | 0; //@line 6473
 return (($1 | 0) == 0 ? $0 : $3) | 0; //@line 6475
}
function __ZN10__cxxabiv117__class_type_infoD0Ev($0) {
 $0 = $0 | 0;
 __ZN10__cxxabiv116__shim_type_infoD2Ev($0); //@line 9692
 __ZdlPv($0); //@line 9693
 return;
}
function _ticker_set_handler__async_cb($0) {
 $0 = $0 | 0;
 HEAP32[HEAP32[(HEAP32[$0 + 4 >> 2] | 0) + 4 >> 2] >> 2] = HEAP32[$0 + 8 >> 2]; //@line 13419
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
  ___fwritex($1, $2, $0) | 0; //@line 7641
 }
 return;
}
function ___cxa_is_pointer_type__async_cb($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = (HEAP32[___async_retval >> 2] | 0) != 0 & 1; //@line 1103
 return;
}
function __ZN4mbed8CallbackIFvvEE13function_moveIPS1_EEvPvPKv($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 HEAP32[$0 >> 2] = HEAP32[$1 >> 2]; //@line 2088
 return;
}
function __ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 return ($0 | 0) == ($1 | 0) | 0; //@line 9889
}
function __ZSt13get_terminatev() {
 var $0 = 0;
 $0 = HEAP32[240] | 0; //@line 10471
 HEAP32[240] = $0 + 0; //@line 10473
 return $0 | 0; //@line 10475
}
function __ZNK10__cxxabiv122__base_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function dynCall_vii(index, a1, a2) {
 index = index | 0;
 a1 = a1 | 0;
 a2 = a2 | 0;
 FUNCTION_TABLE_vii[index & 3](a1 | 0, a2 | 0); //@line 1852
}
function __ZNK10__cxxabiv120__si_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function b8(p0, p1, p2, p3, p4, p5) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 p3 = p3 | 0;
 p4 = p4 | 0;
 p5 = p5 | 0;
 abort(8); //@line 1904
}
function __ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function _llvm_bswap_i32(x) {
 x = x | 0;
 return (x & 255) << 24 | (x >> 8 & 255) << 16 | (x >> 16 & 255) << 8 | x >>> 24 | 0; //@line 1664
}
function __ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_46($0) {
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
function __Z12turn_led3_onv__async_cb($0) {
 $0 = $0 | 0;
 _emscripten_asm_const_iii(0, HEAP32[1317] | 0, 1) | 0; //@line 1197
 return;
}
function _strerror($0) {
 $0 = $0 | 0;
 return ___strerror_l($0, HEAP32[(___pthread_self_85() | 0) + 188 >> 2] | 0) | 0; //@line 8104
}
function _fputc__async_cb_13($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = HEAP32[___async_retval >> 2]; //@line 12191
 return;
}
function dynCall_ii(index, a1) {
 index = index | 0;
 a1 = a1 | 0;
 return FUNCTION_TABLE_ii[index & 1](a1 | 0) | 0; //@line 1824
}
function b7(p0, p1, p2, p3, p4) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 p3 = p3 | 0;
 p4 = p4 | 0;
 abort(7); //@line 1901
}
function _gpio_irq_free($0) {
 $0 = $0 | 0;
 _emscripten_asm_const_ii(4, HEAP32[$0 + 4 >> 2] | 0) | 0; //@line 1847
 return;
}
function __ZSt11__terminatePFvvE__async_cb($0) {
 $0 = $0 | 0;
 _abort_message(4940, HEAP32[$0 + 4 >> 2] | 0); //@line 12772
}
function __ZN4mbed11InterruptInD0Ev__async_cb_59($0) {
 $0 = $0 | 0;
 __ZdlPv(HEAP32[$0 + 4 >> 2] | 0); //@line 680
 return;
}
function __ZN4mbed6Ticker6detachEv($0) {
 $0 = $0 | 0;
 _emscripten_asm_const_ii(6, $0 + 40 | 0) | 0; //@line 2062
 return;
}
function dynCall_vi(index, a1) {
 index = index | 0;
 a1 = a1 | 0;
 FUNCTION_TABLE_vi[index & 255](a1 | 0); //@line 1845
}
function __ZN4mbed7TimeoutD0Ev__async_cb_65($0) {
 $0 = $0 | 0;
 __ZdlPv(HEAP32[$0 + 4 >> 2] | 0); //@line 1130
 return;
}
function __ZN4mbed6TickerD0Ev__async_cb_1($0) {
 $0 = $0 | 0;
 __ZdlPv(HEAP32[$0 + 4 >> 2] | 0); //@line 11349
 return;
}
function b2(p0, p1, p2) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 abort(2); //@line 1883
 return 0; //@line 1883
}
function b6(p0, p1, p2, p3) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 p3 = p3 | 0;
 abort(6); //@line 1898
}
function ___lctrans($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 return ___lctrans_impl($0, $1) | 0; //@line 9349
}
function _main__async_cb_26($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = 0; //@line 12751
 return;
}
function __ZN4mbed11InterruptIn12_irq_handlerEj14gpio_irq_event__async_cb_27($0) {
 $0 = $0 | 0;
 return;
}
function dynCall_i(index) {
 index = index | 0;
 return FUNCTION_TABLE_i[index & 3]() | 0; //@line 1817
}
function __ZN4mbed11InterruptIn12_irq_handlerEj14gpio_irq_event__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function __ZN4mbed8CallbackIFvvEE13function_callIPS1_EEvPKv__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function __ZN4mbed6Ticker6attachENS_8CallbackIFvvEEEf__async_cb_5($0) {
 $0 = $0 | 0;
 return;
}
function dynCall_v(index) {
 index = index | 0;
 FUNCTION_TABLE_v[index & 15](); //@line 1838
}
function _mbed_error_printf($0, $varargs) {
 $0 = $0 | 0;
 $varargs = $varargs | 0;
 return;
}
function _isdigit($0) {
 $0 = $0 | 0;
 return ($0 + -48 | 0) >>> 0 < 10 | 0; //@line 5954
}
function __ZN4mbed8CallbackIFvvEE13function_dtorIPS1_EEvPv($0) {
 $0 = $0 | 0;
 return;
}
function _abort_message__async_cb_29($0) {
 $0 = $0 | 0;
 _abort(); //@line 12907
}
function __ZNK10__cxxabiv116__shim_type_info5noop2Ev($0) {
 $0 = $0 | 0;
 return;
}
function __ZNK10__cxxabiv116__shim_type_info5noop1Ev($0) {
 $0 = $0 | 0;
 return;
}
function __ZN4mbed10TimerEventD0Ev($0) {
 $0 = $0 | 0;
 _llvm_trap(); //@line 557
}
function setTempRet0(value) {
 value = value | 0;
 tempRet0 = value; //@line 38
}
function b1(p0) {
 p0 = p0 | 0;
 abort(1); //@line 1880
 return 0; //@line 1880
}
function _frexpl($0, $1) {
 $0 = +$0;
 $1 = $1 | 0;
 return +(+_frexp($0, $1));
}
function ___cxa_pure_virtual__wrapper() {
 ___cxa_pure_virtual(); //@line 1889
}
function __ZN4mbed11InterruptInD2Ev__async_cb_63($0) {
 $0 = $0 | 0;
 return;
}
function __ZN10__cxxabiv116__shim_type_infoD2Ev($0) {
 $0 = $0 | 0;
 return;
}
function __ZN4mbed7Timeout7handlerEv__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function __ZN4mbed10TimerEvent3irqEj__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function ___pthread_self_910() {
 return _pthread_self() | 0; //@line 9270
}
function __ZN4mbed6Ticker7handlerEv__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function b5(p0, p1) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 abort(5); //@line 1895
}
function ___pthread_self_85() {
 return _pthread_self() | 0; //@line 9276
}
function __ZN4mbed10TimerEventD2Ev__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function __ZN4mbed10TimerEventC2Ev__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function stackRestore(top) {
 top = top | 0;
 STACKTOP = top; //@line 15
}
function __ZN4mbed7TimeoutD2Ev__async_cb_6($0) {
 $0 = $0 | 0;
 return;
}
function _schedule_interrupt__async_cb_12($0) {
 $0 = $0 | 0;
 return;
}
function _schedule_interrupt__async_cb_11($0) {
 $0 = $0 | 0;
 return;
}
function __ZdlPv($0) {
 $0 = $0 | 0;
 _free($0); //@line 9518
 return;
}
function __ZN4mbed6TickerD2Ev__async_cb_2($0) {
 $0 = $0 | 0;
 return;
}
function _schedule_interrupt__async_cb_8($0) {
 $0 = $0 | 0;
 return;
}
function _schedule_interrupt__async_cb_7($0) {
 $0 = $0 | 0;
 return;
}
function _mbed_assert_internal__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function _ticker_remove_event__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function _handle_interrupt_in__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function _dummy($0) {
 $0 = $0 | 0;
 return $0 | 0; //@line 5912
}
function ___lockfile($0) {
 $0 = $0 | 0;
 return 0; //@line 6129
}
function b0() {
 abort(0); //@line 1877
 return 0; //@line 1877
}
function _us_ticker_set_interrupt($0) {
 $0 = $0 | 0;
 return;
}
function _invoke_ticker__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function _initialize__async_cb_56($0) {
 $0 = $0 | 0;
 return;
}
function ___clang_call_terminate__async_cb($0) {
 $0 = $0 | 0;
}
function _us_ticker_get_info() {
 return 452; //@line 2110
}
function _get_us_ticker_data() {
 return 384; //@line 1435
}
function __ZSt9terminatev__async_cb_47($0) {
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
 return 5924; //@line 5906
}
function _wait_ms__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function stackSave() {
 return STACKTOP | 0; //@line 11
}
function b4(p0) {
 p0 = p0 | 0;
 abort(4); //@line 1892
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
function _us_ticker_read() {
 return 0; //@line 1869
}
function _pthread_self() {
 return 716; //@line 5959
}
function ___unlockfile($0) {
 $0 = $0 | 0;
 return;
}
function _us_ticker_disable_interrupt() {
 return;
}
function _us_ticker_clear_interrupt() {
 return;
}
function setAsync() {
 ___async = 1; //@line 25
}
function _us_ticker_fire_interrupt() {
 return;
}
function b3() {
 abort(3); //@line 1886
}
function _us_ticker_init() {
 return;
}

// EMSCRIPTEN_END_FUNCS
var FUNCTION_TABLE_i = [b0,_us_ticker_read,_us_ticker_get_info,b0];
var FUNCTION_TABLE_ii = [b1,___stdio_close];
var FUNCTION_TABLE_iiii = [b2,___stdio_write,___stdio_seek,___stdout_write,__ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv,b2,b2,b2];
var FUNCTION_TABLE_v = [b3,___cxa_pure_virtual__wrapper,_us_ticker_init,_us_ticker_disable_interrupt,_us_ticker_clear_interrupt,_us_ticker_fire_interrupt,__ZL25default_terminate_handlerv,__Z10blink_led1v,__Z12turn_led3_onv,__Z11toggle_led2v,__ZN10__cxxabiv112_GLOBAL__N_110construct_Ev,b3,b3,b3,b3,b3];
var FUNCTION_TABLE_vi = [b4,__ZN4mbed11InterruptInD2Ev,__ZN4mbed11InterruptInD0Ev,__ZN4mbed7TimeoutD2Ev,__ZN4mbed7TimeoutD0Ev,__ZN4mbed7Timeout7handlerEv,__ZN4mbed10TimerEventD2Ev,__ZN4mbed10TimerEventD0Ev,_us_ticker_set_interrupt,__ZN4mbed10TimerEvent3irqEj,__ZN4mbed6TickerD2Ev,__ZN4mbed6TickerD0Ev,__ZN4mbed6Ticker7handlerEv,__ZN4mbed8CallbackIFvvEE13function_callIPS1_EEvPKv,__ZN4mbed8CallbackIFvvEE13function_dtorIPS1_EEvPv,__ZN10__cxxabiv116__shim_type_infoD2Ev,__ZN10__cxxabiv117__class_type_infoD0Ev,__ZNK10__cxxabiv116__shim_type_info5noop1Ev,__ZNK10__cxxabiv116__shim_type_info5noop2Ev,__ZN10__cxxabiv120__si_class_type_infoD0Ev,__ZN10__cxxabiv121__vmi_class_type_infoD0Ev,__ZN4mbed11InterruptInD2Ev__async_cb,__ZN4mbed11InterruptInD2Ev__async_cb_63,__ZN4mbed11InterruptInD0Ev__async_cb,__ZN4mbed11InterruptInD0Ev__async_cb_59,__ZN4mbed11InterruptIn12_irq_handlerEj14gpio_irq_event__async_cb,__ZN4mbed11InterruptIn12_irq_handlerEj14gpio_irq_event__async_cb_27,__ZN4mbed11InterruptIn4fallENS_8CallbackIFvvEEE__async_cb,__ZN4mbed11InterruptIn4fallENS_8CallbackIFvvEEE__async_cb_14
,__ZN4mbed11InterruptIn4fallENS_8CallbackIFvvEEE__async_cb_15,__ZN4mbed11InterruptIn4fallENS_8CallbackIFvvEEE__async_cb_16,__ZN4mbed11InterruptIn4fallENS_8CallbackIFvvEEE__async_cb_17,__ZN4mbed7TimeoutD2Ev__async_cb,__ZN4mbed7TimeoutD2Ev__async_cb_6,__ZN4mbed7TimeoutD0Ev__async_cb,__ZN4mbed7TimeoutD0Ev__async_cb_65,__ZN4mbed7Timeout7handlerEv__async_cb_64,__ZN4mbed7Timeout7handlerEv__async_cb,__ZN4mbed10TimerEventD2Ev__async_cb,__ZN4mbed10TimerEventC2Ev__async_cb,__ZN4mbed10TimerEvent3irqEj__async_cb,_ticker_set_handler__async_cb,_initialize__async_cb,_initialize__async_cb_53,_initialize__async_cb_58,_initialize__async_cb_57,_initialize__async_cb_54,_initialize__async_cb_55,_initialize__async_cb_56,_schedule_interrupt__async_cb,_schedule_interrupt__async_cb_7,_schedule_interrupt__async_cb_8,_schedule_interrupt__async_cb_9,_schedule_interrupt__async_cb_10,_schedule_interrupt__async_cb_11,_schedule_interrupt__async_cb_12,_ticker_remove_event__async_cb,_mbed_assert_internal__async_cb,_mbed_die__async_cb_45
,_mbed_die__async_cb_44,_mbed_die__async_cb_43,_mbed_die__async_cb_42,_mbed_die__async_cb_41,_mbed_die__async_cb_40,_mbed_die__async_cb_39,_mbed_die__async_cb_38,_mbed_die__async_cb_37,_mbed_die__async_cb_36,_mbed_die__async_cb_35,_mbed_die__async_cb_34,_mbed_die__async_cb_33,_mbed_die__async_cb_32,_mbed_die__async_cb_31,_mbed_die__async_cb,_handle_interrupt_in__async_cb,__ZN4mbed6TickerD2Ev__async_cb,__ZN4mbed6TickerD2Ev__async_cb_2,__ZN4mbed6TickerD0Ev__async_cb,__ZN4mbed6TickerD0Ev__async_cb_1,__ZN4mbed6Ticker7handlerEv__async_cb,_invoke_ticker__async_cb_28,_invoke_ticker__async_cb,__ZN4mbed8CallbackIFvvEE13function_callIPS1_EEvPKv__async_cb,_wait_ms__async_cb,__GLOBAL__sub_I_main_cpp__async_cb_61,__GLOBAL__sub_I_main_cpp__async_cb,__Z10blink_led1v__async_cb,__Z11toggle_led2v__async_cb,__Z12turn_led3_onv__async_cb
,_main__async_cb_22,_main__async_cb_21,_main__async_cb_20,_main__async_cb_24,_main__async_cb,_main__async_cb_23,_main__async_cb_18,_main__async_cb_25,_main__async_cb_19,_main__async_cb_26,__ZN4mbed6Ticker6attachENS_8CallbackIFvvEEEf__async_cb,__ZN4mbed6Ticker6attachENS_8CallbackIFvvEEEf__async_cb_3,__ZN4mbed6Ticker6attachENS_8CallbackIFvvEEEf__async_cb_4,__ZN4mbed6Ticker6attachENS_8CallbackIFvvEEEf__async_cb_5,___overflow__async_cb,_vfprintf__async_cb,_fputc__async_cb_13,_fputc__async_cb,_puts__async_cb,__ZL25default_terminate_handlerv__async_cb,__ZL25default_terminate_handlerv__async_cb_48,_abort_message__async_cb,_abort_message__async_cb_29,__ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv__async_cb_62,__ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv__async_cb,___dynamic_cast__async_cb,___dynamic_cast__async_cb_66,__ZNK10__cxxabiv120__si_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb,__ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb,__ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_46
,__ZNK10__cxxabiv120__si_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb,__ZN10__cxxabiv112_GLOBAL__N_19destruct_EPv,__ZSt11__terminatePFvvE__async_cb,__ZNK10__cxxabiv121__vmi_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb_60,__ZNK10__cxxabiv121__vmi_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb,__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_52,__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_51,__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_50,__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_49,__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb,__ZNK10__cxxabiv121__vmi_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb_30,__ZNK10__cxxabiv121__vmi_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb,__ZNK10__cxxabiv122__base_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb,__ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb,__ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb,___cxa_can_catch__async_cb,___cxa_is_pointer_type__async_cb,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4
,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4
,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4
,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4
,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4];
var FUNCTION_TABLE_vii = [b5,__ZN4mbed8CallbackIFvvEE13function_moveIPS1_EEvPvPKv,__ZN4mbed11InterruptIn12_irq_handlerEj14gpio_irq_event,b5];
var FUNCTION_TABLE_viiii = [b6,__ZNK10__cxxabiv117__class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi,__ZNK10__cxxabiv120__si_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi,__ZNK10__cxxabiv121__vmi_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi];
var FUNCTION_TABLE_viiiii = [b7,__ZNK10__cxxabiv117__class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib,__ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib,__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib];
var FUNCTION_TABLE_viiiiii = [b8,__ZNK10__cxxabiv117__class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib,__ZNK10__cxxabiv120__si_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib,__ZNK10__cxxabiv121__vmi_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib];

  return { __GLOBAL__sub_I_main_cpp: __GLOBAL__sub_I_main_cpp, ___cxa_can_catch: ___cxa_can_catch, ___cxa_is_pointer_type: ___cxa_is_pointer_type, ___errno_location: ___errno_location, ___muldi3: ___muldi3, ___udivdi3: ___udivdi3, ___uremdi3: ___uremdi3, _bitshift64Lshr: _bitshift64Lshr, _bitshift64Shl: _bitshift64Shl, _emscripten_alloc_async_context: _emscripten_alloc_async_context, _emscripten_async_resume: _emscripten_async_resume, _emscripten_free_async_context: _emscripten_free_async_context, _emscripten_realloc_async_context: _emscripten_realloc_async_context, _free: _free, _handle_interrupt_in: _handle_interrupt_in, _i64Add: _i64Add, _i64Subtract: _i64Subtract, _invoke_ticker: _invoke_ticker, _llvm_bswap_i32: _llvm_bswap_i32, _main: _main, _malloc: _malloc, _memcpy: _memcpy, _memset: _memset, _sbrk: _sbrk, dynCall_i: dynCall_i, dynCall_ii: dynCall_ii, dynCall_iiii: dynCall_iiii, dynCall_v: dynCall_v, dynCall_vi: dynCall_vi, dynCall_vii: dynCall_vii, dynCall_viiii: dynCall_viiii, dynCall_viiiii: dynCall_viiiii, dynCall_viiiiii: dynCall_viiiiii, establishStackSpace: establishStackSpace, getTempRet0: getTempRet0, runPostSets: runPostSets, setAsync: setAsync, setTempRet0: setTempRet0, setThrew: setThrew, stackAlloc: stackAlloc, stackRestore: stackRestore, stackSave: stackSave };
})
// EMSCRIPTEN_END_ASM
(Module.asmGlobalArg, Module.asmLibraryArg, buffer);

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
var dynCall_i = Module["dynCall_i"] = asm["dynCall_i"];
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






//# sourceMappingURL=interrupts.js.map
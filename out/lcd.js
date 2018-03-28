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

var ASM_CONSTS = [function($0, $1, $2, $3) { window.MbedJSHal.C12832.update_display($0, $1, $2, new Uint8Array(Module.HEAPU8.buffer, $3, 4096)); },
 function($0, $1, $2) { window.MbedJSHal.C12832.init($0, $1, $2); },
 function($0) { console.log("TextDisplay putc", $0); },
 function($0, $1) { MbedJSHal.gpio.write($0, $1); },
 function($0, $1) { MbedJSHal.gpio.init_out($0, $1, 0); }];

function _emscripten_asm_const_iii(code, a0, a1) {
  return ASM_CONSTS[code](a0, a1);
}

function _emscripten_asm_const_ii(code, a0) {
  return ASM_CONSTS[code](a0);
}

function _emscripten_asm_const_iiii(code, a0, a1, a2) {
  return ASM_CONSTS[code](a0, a1, a2);
}

function _emscripten_asm_const_iiiii(code, a0, a1, a2, a3) {
  return ASM_CONSTS[code](a0, a1, a2, a3);
}




STATIC_BASE = GLOBAL_BASE;

STATICTOP = STATIC_BASE + 14688;
/* global initializers */  __ATINIT__.push({ func: function() { __GLOBAL__sub_I_main_cpp() } });


memoryInitializer = "lcd.js.mem";





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

  function ___lock() {}

  
  
  
  var ERRNO_CODES={EPERM:1,ENOENT:2,ESRCH:3,EINTR:4,EIO:5,ENXIO:6,E2BIG:7,ENOEXEC:8,EBADF:9,ECHILD:10,EAGAIN:11,EWOULDBLOCK:11,ENOMEM:12,EACCES:13,EFAULT:14,ENOTBLK:15,EBUSY:16,EEXIST:17,EXDEV:18,ENODEV:19,ENOTDIR:20,EISDIR:21,EINVAL:22,ENFILE:23,EMFILE:24,ENOTTY:25,ETXTBSY:26,EFBIG:27,ENOSPC:28,ESPIPE:29,EROFS:30,EMLINK:31,EPIPE:32,EDOM:33,ERANGE:34,ENOMSG:42,EIDRM:43,ECHRNG:44,EL2NSYNC:45,EL3HLT:46,EL3RST:47,ELNRNG:48,EUNATCH:49,ENOCSI:50,EL2HLT:51,EDEADLK:35,ENOLCK:37,EBADE:52,EBADR:53,EXFULL:54,ENOANO:55,EBADRQC:56,EBADSLT:57,EDEADLOCK:35,EBFONT:59,ENOSTR:60,ENODATA:61,ETIME:62,ENOSR:63,ENONET:64,ENOPKG:65,EREMOTE:66,ENOLINK:67,EADV:68,ESRMNT:69,ECOMM:70,EPROTO:71,EMULTIHOP:72,EDOTDOT:73,EBADMSG:74,ENOTUNIQ:76,EBADFD:77,EREMCHG:78,ELIBACC:79,ELIBBAD:80,ELIBSCN:81,ELIBMAX:82,ELIBEXEC:83,ENOSYS:38,ENOTEMPTY:39,ENAMETOOLONG:36,ELOOP:40,EOPNOTSUPP:95,EPFNOSUPPORT:96,ECONNRESET:104,ENOBUFS:105,EAFNOSUPPORT:97,EPROTOTYPE:91,ENOTSOCK:88,ENOPROTOOPT:92,ESHUTDOWN:108,ECONNREFUSED:111,EADDRINUSE:98,ECONNABORTED:103,ENETUNREACH:101,ENETDOWN:100,ETIMEDOUT:110,EHOSTDOWN:112,EHOSTUNREACH:113,EINPROGRESS:115,EALREADY:114,EDESTADDRREQ:89,EMSGSIZE:90,EPROTONOSUPPORT:93,ESOCKTNOSUPPORT:94,EADDRNOTAVAIL:99,ENETRESET:102,EISCONN:106,ENOTCONN:107,ETOOMANYREFS:109,EUSERS:87,EDQUOT:122,ESTALE:116,ENOTSUP:95,ENOMEDIUM:123,EILSEQ:84,EOVERFLOW:75,ECANCELED:125,ENOTRECOVERABLE:131,EOWNERDEAD:130,ESTRPIPE:86};
  
  var ERRNO_MESSAGES={0:"Success",1:"Not super-user",2:"No such file or directory",3:"No such process",4:"Interrupted system call",5:"I/O error",6:"No such device or address",7:"Arg list too long",8:"Exec format error",9:"Bad file number",10:"No children",11:"No more processes",12:"Not enough core",13:"Permission denied",14:"Bad address",15:"Block device required",16:"Mount device busy",17:"File exists",18:"Cross-device link",19:"No such device",20:"Not a directory",21:"Is a directory",22:"Invalid argument",23:"Too many open files in system",24:"Too many open files",25:"Not a typewriter",26:"Text file busy",27:"File too large",28:"No space left on device",29:"Illegal seek",30:"Read only file system",31:"Too many links",32:"Broken pipe",33:"Math arg out of domain of func",34:"Math result not representable",35:"File locking deadlock error",36:"File or path name too long",37:"No record locks available",38:"Function not implemented",39:"Directory not empty",40:"Too many symbolic links",42:"No message of desired type",43:"Identifier removed",44:"Channel number out of range",45:"Level 2 not synchronized",46:"Level 3 halted",47:"Level 3 reset",48:"Link number out of range",49:"Protocol driver not attached",50:"No CSI structure available",51:"Level 2 halted",52:"Invalid exchange",53:"Invalid request descriptor",54:"Exchange full",55:"No anode",56:"Invalid request code",57:"Invalid slot",59:"Bad font file fmt",60:"Device not a stream",61:"No data (for no delay io)",62:"Timer expired",63:"Out of streams resources",64:"Machine is not on the network",65:"Package not installed",66:"The object is remote",67:"The link has been severed",68:"Advertise error",69:"Srmount error",70:"Communication error on send",71:"Protocol error",72:"Multihop attempted",73:"Cross mount point (not really error)",74:"Trying to read unreadable message",75:"Value too large for defined data type",76:"Given log. name not unique",77:"f.d. invalid for this operation",78:"Remote address changed",79:"Can   access a needed shared lib",80:"Accessing a corrupted shared lib",81:".lib section in a.out corrupted",82:"Attempting to link in too many libs",83:"Attempting to exec a shared library",84:"Illegal byte sequence",86:"Streams pipe error",87:"Too many users",88:"Socket operation on non-socket",89:"Destination address required",90:"Message too long",91:"Protocol wrong type for socket",92:"Protocol not available",93:"Unknown protocol",94:"Socket type not supported",95:"Not supported",96:"Protocol family not supported",97:"Address family not supported by protocol family",98:"Address already in use",99:"Address not available",100:"Network interface is not configured",101:"Network is unreachable",102:"Connection reset by network",103:"Connection aborted",104:"Connection reset by peer",105:"No buffer space available",106:"Socket is already connected",107:"Socket is not connected",108:"Can't send after socket shutdown",109:"Too many references",110:"Connection timed out",111:"Connection refused",112:"Host is down",113:"Host is unreachable",114:"Socket already connected",115:"Connection already in progress",116:"Stale file handle",122:"Quota exceeded",123:"No medium (in tape drive)",125:"Operation canceled",130:"Previous owner died",131:"State not recoverable"};
  
  function ___setErrNo(value) {
      if (Module['___errno_location']) HEAP32[((Module['___errno_location']())>>2)]=value;
      return value;
    }
  
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
  
          try {
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
          } catch (e) {
            return callback(e);
          }
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
            FS.writeFile(path, entry.contents, { canOwn: true });
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
        var flags = process["binding"]("constants");
        // Node.js 4 compatibility: it has no namespaces for constants
        if (flags["fs"]) {
          flags = flags["fs"];
        }
        NODEFS.flagsForNodeMap = {
          "1024": flags["O_APPEND"],
          "64": flags["O_CREAT"],
          "128": flags["O_EXCL"],
          "0": flags["O_RDONLY"],
          "2": flags["O_RDWR"],
          "4096": flags["O_SYNC"],
          "512": flags["O_TRUNC"],
          "1": flags["O_WRONLY"]
        };
      },bufferFrom:function (arrayBuffer) {
        // Node.js < 4.5 compatibility: Buffer.from does not support ArrayBuffer
        // Buffer.from before 4.5 was just a method inherited from Uint8Array
        // Buffer.alloc has been added with Buffer.from together, so check it instead
        return Buffer.alloc ? Buffer.from(arrayBuffer) : new Buffer(arrayBuffer);
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
            // Node.js on Windows never represents permission bit 'x', so
            // propagate read bits to execute bits
            stat.mode = stat.mode | ((stat.mode & 292) >> 2);
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
      },flagsForNode:function (flags) {
        flags &= ~0x200000 /*O_PATH*/; // Ignore this flag from musl, otherwise node.js fails to open the file.
        flags &= ~0x800 /*O_NONBLOCK*/; // Ignore this flag from musl, otherwise node.js fails to open the file.
        flags &= ~0x8000 /*O_LARGEFILE*/; // Ignore this flag from musl, otherwise node.js fails to open the file.
        flags &= ~0x80000 /*O_CLOEXEC*/; // Some applications may pass it; it makes no sense for a single process.
        var newFlags = 0;
        for (var k in NODEFS.flagsForNodeMap) {
          if (flags & k) {
            newFlags |= NODEFS.flagsForNodeMap[k];
            flags ^= k;
          }
        }
  
        if (!flags) {
          return newFlags;
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
              stream.nfd = fs.openSync(path, NODEFS.flagsForNode(stream.flags));
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
          // Node.js < 6 compatibility: node errors on 0 length reads
          if (length === 0) return 0;
          try {
            return fs.readSync(stream.nfd, NODEFS.bufferFrom(buffer.buffer), offset, length, position);
          } catch (e) {
            throw new FS.ErrnoError(ERRNO_CODES[e.code]);
          }
        },write:function (stream, buffer, offset, length, position) {
          try {
            return fs.writeSync(stream.nfd, NODEFS.bufferFrom(buffer.buffer), offset, length, position);
          } catch (e) {
            throw new FS.ErrnoError(ERRNO_CODES[e.code]);
          }
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
  
  var _stderr=STATICTOP; STATICTOP += 16;;var FS={root:null,mounts:[],devices:{},streams:[],nextInode:1,nameTable:null,currentPath:"/",initialized:false,ignorePermissions:true,trackingDelegate:{},tracking:{openFlags:{READ:1,WRITE:2}},ErrnoError:null,genericErrors:{},filesystems:null,syncFSRequests:0,handleFSError:function (e) {
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
        var seeking = typeof position !== 'undefined';
        if (!seeking) {
          position = stream.position;
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
        var seeking = typeof position !== 'undefined';
        if (!seeking) {
          position = stream.position;
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
        var stream = FS.open(path, opts.flags, opts.mode);
        if (typeof data === 'string') {
          var buf = new Uint8Array(lengthBytesUTF8(data)+1);
          var actualNumBytes = stringToUTF8Array(data, buf, 0, buf.length);
          FS.write(stream, buf, 0, actualNumBytes, undefined, opts.canOwn);
        } else if (ArrayBuffer.isView(data)) {
          FS.write(stream, data, 0, data.byteLength, undefined, opts.canOwn);
        } else {
          throw new Error('Unsupported data type');
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
          random_device = function() { return require('crypto')['randomBytes'](1)[0]; };
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
          // Node.js compatibility: assigning on this.stack fails on Node 4 (but fixed on Node 8)
          if (this.stack) Object.defineProperty(this, "stack", { value: (new Error).stack, writable: true });
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

  function ___syscall54(which, varargs) {SYSCALLS.varargs = varargs;
  try {
   // ioctl
      var stream = SYSCALLS.getStreamFromFD(), op = SYSCALLS.get();
      switch (op) {
        case 21509:
        case 21505: {
          if (!stream.tty) return -ERRNO_CODES.ENOTTY;
          return 0;
        }
        case 21510:
        case 21511:
        case 21512:
        case 21506:
        case 21507:
        case 21508: {
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

  function ___syscall63(which, varargs) {SYSCALLS.varargs = varargs;
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

   
FS.staticInit();__ATINIT__.unshift(function() { if (!Module["noFSInit"] && !FS.init.initialized) FS.init() });__ATMAIN__.push(function() { FS.ignorePermissions = false });__ATEXIT__.push(function() { FS.quit() });;
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

function invoke_iii(index,a1,a2) {
  try {
    return Module["dynCall_iii"](index,a1,a2);
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

function invoke_viii(index,a1,a2,a3) {
  try {
    Module["dynCall_viii"](index,a1,a2,a3);
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

Module.asmLibraryArg = { "abort": abort, "assert": assert, "enlargeMemory": enlargeMemory, "getTotalMemory": getTotalMemory, "abortOnCannotGrowMemory": abortOnCannotGrowMemory, "invoke_ii": invoke_ii, "invoke_iii": invoke_iii, "invoke_iiii": invoke_iiii, "invoke_v": invoke_v, "invoke_vi": invoke_vi, "invoke_vii": invoke_vii, "invoke_viii": invoke_viii, "invoke_viiii": invoke_viiii, "invoke_viiiii": invoke_viiiii, "invoke_viiiiii": invoke_viiiiii, "__ZSt18uncaught_exceptionv": __ZSt18uncaught_exceptionv, "___cxa_begin_catch": ___cxa_begin_catch, "___cxa_find_matching_catch": ___cxa_find_matching_catch, "___cxa_pure_virtual": ___cxa_pure_virtual, "___gxx_personality_v0": ___gxx_personality_v0, "___lock": ___lock, "___resumeException": ___resumeException, "___setErrNo": ___setErrNo, "___syscall140": ___syscall140, "___syscall145": ___syscall145, "___syscall146": ___syscall146, "___syscall221": ___syscall221, "___syscall330": ___syscall330, "___syscall5": ___syscall5, "___syscall54": ___syscall54, "___syscall6": ___syscall6, "___syscall63": ___syscall63, "___unlock": ___unlock, "_abort": _abort, "_emscripten_asm_const_ii": _emscripten_asm_const_ii, "_emscripten_asm_const_iii": _emscripten_asm_const_iii, "_emscripten_asm_const_iiii": _emscripten_asm_const_iiii, "_emscripten_asm_const_iiiii": _emscripten_asm_const_iiiii, "_emscripten_get_now": _emscripten_get_now, "_emscripten_memcpy_big": _emscripten_memcpy_big, "_emscripten_set_main_loop": _emscripten_set_main_loop, "_emscripten_set_main_loop_timing": _emscripten_set_main_loop_timing, "_emscripten_sleep": _emscripten_sleep, "_llvm_trap": _llvm_trap, "_pthread_getspecific": _pthread_getspecific, "_pthread_key_create": _pthread_key_create, "_pthread_once": _pthread_once, "_pthread_setspecific": _pthread_setspecific, "DYNAMICTOP_PTR": DYNAMICTOP_PTR, "tempDoublePtr": tempDoublePtr, "ABORT": ABORT, "STACKTOP": STACKTOP, "STACK_MAX": STACK_MAX, "cttz_i8": cttz_i8, "___async": ___async, "___async_unwind": ___async_unwind, "___async_retval": ___async_retval, "___async_cur_frame": ___async_cur_frame };
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
  var invoke_iii=env.invoke_iii;
  var invoke_iiii=env.invoke_iiii;
  var invoke_v=env.invoke_v;
  var invoke_vi=env.invoke_vi;
  var invoke_vii=env.invoke_vii;
  var invoke_viii=env.invoke_viii;
  var invoke_viiii=env.invoke_viiii;
  var invoke_viiiii=env.invoke_viiiii;
  var invoke_viiiiii=env.invoke_viiiiii;
  var __ZSt18uncaught_exceptionv=env.__ZSt18uncaught_exceptionv;
  var ___cxa_begin_catch=env.___cxa_begin_catch;
  var ___cxa_find_matching_catch=env.___cxa_find_matching_catch;
  var ___cxa_pure_virtual=env.___cxa_pure_virtual;
  var ___gxx_personality_v0=env.___gxx_personality_v0;
  var ___lock=env.___lock;
  var ___resumeException=env.___resumeException;
  var ___setErrNo=env.___setErrNo;
  var ___syscall140=env.___syscall140;
  var ___syscall145=env.___syscall145;
  var ___syscall146=env.___syscall146;
  var ___syscall221=env.___syscall221;
  var ___syscall330=env.___syscall330;
  var ___syscall5=env.___syscall5;
  var ___syscall54=env.___syscall54;
  var ___syscall6=env.___syscall6;
  var ___syscall63=env.___syscall63;
  var ___unlock=env.___unlock;
  var _abort=env._abort;
  var _emscripten_asm_const_ii=env._emscripten_asm_const_ii;
  var _emscripten_asm_const_iii=env._emscripten_asm_const_iii;
  var _emscripten_asm_const_iiii=env._emscripten_asm_const_iiii;
  var _emscripten_asm_const_iiiii=env._emscripten_asm_const_iiiii;
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
  var tempFloat = 0.0;

// EMSCRIPTEN_START_FUNCS
function _malloc($0) {
 $0 = $0 | 0;
 var $$$0192$i = 0, $$$0193$i = 0, $$$4351$i = 0, $$$i = 0, $$0 = 0, $$0$i$i = 0, $$0$i$i$i = 0, $$0$i17$i = 0, $$0189$i = 0, $$0192$lcssa$i = 0, $$01926$i = 0, $$0193$lcssa$i = 0, $$01935$i = 0, $$0197 = 0, $$0199 = 0, $$0206$i$i = 0, $$0207$i$i = 0, $$0211$i$i = 0, $$0212$i$i = 0, $$024367$i = 0, $$0287$i$i = 0, $$0288$i$i = 0, $$0289$i$i = 0, $$0295$i$i = 0, $$0296$i$i = 0, $$0342$i = 0, $$0344$i = 0, $$0345$i = 0, $$0347$i = 0, $$0353$i = 0, $$0358$i = 0, $$0359$i = 0, $$0361$i = 0, $$0362$i = 0, $$0368$i = 0, $$1196$i = 0, $$1198$i = 0, $$124466$i = 0, $$1291$i$i = 0, $$1293$i$i = 0, $$1343$i = 0, $$1348$i = 0, $$1363$i = 0, $$1370$i = 0, $$1374$i = 0, $$2234243136$i = 0, $$2247$ph$i = 0, $$2253$ph$i = 0, $$2355$i = 0, $$3$i = 0, $$3$i$i = 0, $$3$i203 = 0, $$3350$i = 0, $$3372$i = 0, $$4$lcssa$i = 0, $$4$ph$i = 0, $$414$i = 0, $$4236$i = 0, $$4351$lcssa$i = 0, $$435113$i = 0, $$4357$$4$i = 0, $$4357$ph$i = 0, $$435712$i = 0, $$723947$i = 0, $$748$i = 0, $$pre$phi$i$iZ2D = 0, $$pre$phi$i19$iZ2D = 0, $$pre$phi$i211Z2D = 0, $$pre$phi$iZ2D = 0, $$pre$phi11$i$iZ2D = 0, $$pre$phiZ2D = 0, $1 = 0, $1004 = 0, $101 = 0, $1010 = 0, $1013 = 0, $1014 = 0, $102 = 0, $1032 = 0, $1034 = 0, $1041 = 0, $1042 = 0, $1043 = 0, $1052 = 0, $1054 = 0, $1055 = 0, $1056 = 0, $108 = 0, $112 = 0, $114 = 0, $115 = 0, $117 = 0, $119 = 0, $121 = 0, $123 = 0, $125 = 0, $127 = 0, $129 = 0, $134 = 0, $138 = 0, $14 = 0, $143 = 0, $146 = 0, $149 = 0, $150 = 0, $157 = 0, $159 = 0, $16 = 0, $162 = 0, $164 = 0, $167 = 0, $169 = 0, $17 = 0, $172 = 0, $175 = 0, $176 = 0, $178 = 0, $179 = 0, $18 = 0, $181 = 0, $182 = 0, $184 = 0, $185 = 0, $19 = 0, $190 = 0, $191 = 0, $20 = 0, $204 = 0, $208 = 0, $214 = 0, $221 = 0, $225 = 0, $234 = 0, $235 = 0, $237 = 0, $238 = 0, $242 = 0, $243 = 0, $251 = 0, $252 = 0, $253 = 0, $255 = 0, $256 = 0, $261 = 0, $262 = 0, $265 = 0, $267 = 0, $27 = 0, $270 = 0, $275 = 0, $282 = 0, $292 = 0, $296 = 0, $30 = 0, $302 = 0, $306 = 0, $309 = 0, $313 = 0, $315 = 0, $316 = 0, $318 = 0, $320 = 0, $322 = 0, $324 = 0, $326 = 0, $328 = 0, $330 = 0, $34 = 0, $340 = 0, $341 = 0, $352 = 0, $354 = 0, $357 = 0, $359 = 0, $362 = 0, $364 = 0, $367 = 0, $37 = 0, $370 = 0, $371 = 0, $373 = 0, $374 = 0, $376 = 0, $377 = 0, $379 = 0, $380 = 0, $385 = 0, $386 = 0, $391 = 0, $399 = 0, $403 = 0, $409 = 0, $41 = 0, $416 = 0, $420 = 0, $428 = 0, $431 = 0, $432 = 0, $433 = 0, $437 = 0, $438 = 0, $44 = 0, $444 = 0, $449 = 0, $450 = 0, $453 = 0, $455 = 0, $458 = 0, $463 = 0, $469 = 0, $47 = 0, $471 = 0, $473 = 0, $475 = 0, $49 = 0, $492 = 0, $494 = 0, $50 = 0, $501 = 0, $502 = 0, $503 = 0, $512 = 0, $514 = 0, $515 = 0, $517 = 0, $52 = 0, $526 = 0, $530 = 0, $532 = 0, $533 = 0, $534 = 0, $54 = 0, $545 = 0, $546 = 0, $547 = 0, $548 = 0, $549 = 0, $550 = 0, $552 = 0, $554 = 0, $555 = 0, $56 = 0, $561 = 0, $563 = 0, $565 = 0, $570 = 0, $572 = 0, $574 = 0, $575 = 0, $576 = 0, $58 = 0, $584 = 0, $585 = 0, $588 = 0, $592 = 0, $595 = 0, $597 = 0, $6 = 0, $60 = 0, $603 = 0, $607 = 0, $611 = 0, $62 = 0, $620 = 0, $621 = 0, $627 = 0, $629 = 0, $633 = 0, $636 = 0, $638 = 0, $64 = 0, $642 = 0, $644 = 0, $649 = 0, $650 = 0, $651 = 0, $657 = 0, $658 = 0, $659 = 0, $663 = 0, $67 = 0, $673 = 0, $675 = 0, $680 = 0, $681 = 0, $682 = 0, $688 = 0, $69 = 0, $690 = 0, $694 = 0, $7 = 0, $70 = 0, $700 = 0, $704 = 0, $71 = 0, $710 = 0, $712 = 0, $718 = 0, $72 = 0, $722 = 0, $723 = 0, $728 = 0, $73 = 0, $734 = 0, $739 = 0, $742 = 0, $743 = 0, $746 = 0, $748 = 0, $750 = 0, $753 = 0, $764 = 0, $769 = 0, $77 = 0, $771 = 0, $774 = 0, $776 = 0, $779 = 0, $782 = 0, $783 = 0, $784 = 0, $786 = 0, $788 = 0, $789 = 0, $791 = 0, $792 = 0, $797 = 0, $798 = 0, $8 = 0, $80 = 0, $812 = 0, $815 = 0, $816 = 0, $822 = 0, $83 = 0, $830 = 0, $836 = 0, $839 = 0, $84 = 0, $840 = 0, $841 = 0, $845 = 0, $846 = 0, $852 = 0, $857 = 0, $858 = 0, $861 = 0, $863 = 0, $866 = 0, $87 = 0, $871 = 0, $877 = 0, $879 = 0, $881 = 0, $882 = 0, $9 = 0, $900 = 0, $902 = 0, $909 = 0, $910 = 0, $911 = 0, $919 = 0, $92 = 0, $923 = 0, $927 = 0, $929 = 0, $93 = 0, $935 = 0, $936 = 0, $938 = 0, $939 = 0, $940 = 0, $941 = 0, $943 = 0, $948 = 0, $949 = 0, $95 = 0, $950 = 0, $956 = 0, $958 = 0, $96 = 0, $964 = 0, $969 = 0, $972 = 0, $973 = 0, $974 = 0, $978 = 0, $979 = 0, $98 = 0, $985 = 0, $990 = 0, $991 = 0, $994 = 0, $996 = 0, $999 = 0, label = 0, sp = 0, $958$looptemp = 0;
 sp = STACKTOP; //@line 4201
 STACKTOP = STACKTOP + 16 | 0; //@line 4202
 $1 = sp; //@line 4203
 do {
  if ($0 >>> 0 < 245) {
   $6 = $0 >>> 0 < 11 ? 16 : $0 + 11 & -8; //@line 4210
   $7 = $6 >>> 3; //@line 4211
   $8 = HEAP32[3261] | 0; //@line 4212
   $9 = $8 >>> $7; //@line 4213
   if ($9 & 3 | 0) {
    $14 = ($9 & 1 ^ 1) + $7 | 0; //@line 4219
    $16 = 13084 + ($14 << 1 << 2) | 0; //@line 4221
    $17 = $16 + 8 | 0; //@line 4222
    $18 = HEAP32[$17 >> 2] | 0; //@line 4223
    $19 = $18 + 8 | 0; //@line 4224
    $20 = HEAP32[$19 >> 2] | 0; //@line 4225
    do {
     if (($20 | 0) == ($16 | 0)) {
      HEAP32[3261] = $8 & ~(1 << $14); //@line 4232
     } else {
      if ((HEAP32[3265] | 0) >>> 0 > $20 >>> 0) {
       _abort(); //@line 4237
      }
      $27 = $20 + 12 | 0; //@line 4240
      if ((HEAP32[$27 >> 2] | 0) == ($18 | 0)) {
       HEAP32[$27 >> 2] = $16; //@line 4244
       HEAP32[$17 >> 2] = $20; //@line 4245
       break;
      } else {
       _abort(); //@line 4248
      }
     }
    } while (0);
    $30 = $14 << 3; //@line 4253
    HEAP32[$18 + 4 >> 2] = $30 | 3; //@line 4256
    $34 = $18 + $30 + 4 | 0; //@line 4258
    HEAP32[$34 >> 2] = HEAP32[$34 >> 2] | 1; //@line 4261
    $$0 = $19; //@line 4262
    STACKTOP = sp; //@line 4263
    return $$0 | 0; //@line 4263
   }
   $37 = HEAP32[3263] | 0; //@line 4265
   if ($6 >>> 0 > $37 >>> 0) {
    if ($9 | 0) {
     $41 = 2 << $7; //@line 4271
     $44 = $9 << $7 & ($41 | 0 - $41); //@line 4274
     $47 = ($44 & 0 - $44) + -1 | 0; //@line 4277
     $49 = $47 >>> 12 & 16; //@line 4279
     $50 = $47 >>> $49; //@line 4280
     $52 = $50 >>> 5 & 8; //@line 4282
     $54 = $50 >>> $52; //@line 4284
     $56 = $54 >>> 2 & 4; //@line 4286
     $58 = $54 >>> $56; //@line 4288
     $60 = $58 >>> 1 & 2; //@line 4290
     $62 = $58 >>> $60; //@line 4292
     $64 = $62 >>> 1 & 1; //@line 4294
     $67 = ($52 | $49 | $56 | $60 | $64) + ($62 >>> $64) | 0; //@line 4297
     $69 = 13084 + ($67 << 1 << 2) | 0; //@line 4299
     $70 = $69 + 8 | 0; //@line 4300
     $71 = HEAP32[$70 >> 2] | 0; //@line 4301
     $72 = $71 + 8 | 0; //@line 4302
     $73 = HEAP32[$72 >> 2] | 0; //@line 4303
     do {
      if (($73 | 0) == ($69 | 0)) {
       $77 = $8 & ~(1 << $67); //@line 4309
       HEAP32[3261] = $77; //@line 4310
       $98 = $77; //@line 4311
      } else {
       if ((HEAP32[3265] | 0) >>> 0 > $73 >>> 0) {
        _abort(); //@line 4316
       }
       $80 = $73 + 12 | 0; //@line 4319
       if ((HEAP32[$80 >> 2] | 0) == ($71 | 0)) {
        HEAP32[$80 >> 2] = $69; //@line 4323
        HEAP32[$70 >> 2] = $73; //@line 4324
        $98 = $8; //@line 4325
        break;
       } else {
        _abort(); //@line 4328
       }
      }
     } while (0);
     $83 = $67 << 3; //@line 4333
     $84 = $83 - $6 | 0; //@line 4334
     HEAP32[$71 + 4 >> 2] = $6 | 3; //@line 4337
     $87 = $71 + $6 | 0; //@line 4338
     HEAP32[$87 + 4 >> 2] = $84 | 1; //@line 4341
     HEAP32[$71 + $83 >> 2] = $84; //@line 4343
     if ($37 | 0) {
      $92 = HEAP32[3266] | 0; //@line 4346
      $93 = $37 >>> 3; //@line 4347
      $95 = 13084 + ($93 << 1 << 2) | 0; //@line 4349
      $96 = 1 << $93; //@line 4350
      if (!($98 & $96)) {
       HEAP32[3261] = $98 | $96; //@line 4355
       $$0199 = $95; //@line 4357
       $$pre$phiZ2D = $95 + 8 | 0; //@line 4357
      } else {
       $101 = $95 + 8 | 0; //@line 4359
       $102 = HEAP32[$101 >> 2] | 0; //@line 4360
       if ((HEAP32[3265] | 0) >>> 0 > $102 >>> 0) {
        _abort(); //@line 4364
       } else {
        $$0199 = $102; //@line 4367
        $$pre$phiZ2D = $101; //@line 4367
       }
      }
      HEAP32[$$pre$phiZ2D >> 2] = $92; //@line 4370
      HEAP32[$$0199 + 12 >> 2] = $92; //@line 4372
      HEAP32[$92 + 8 >> 2] = $$0199; //@line 4374
      HEAP32[$92 + 12 >> 2] = $95; //@line 4376
     }
     HEAP32[3263] = $84; //@line 4378
     HEAP32[3266] = $87; //@line 4379
     $$0 = $72; //@line 4380
     STACKTOP = sp; //@line 4381
     return $$0 | 0; //@line 4381
    }
    $108 = HEAP32[3262] | 0; //@line 4383
    if (!$108) {
     $$0197 = $6; //@line 4386
    } else {
     $112 = ($108 & 0 - $108) + -1 | 0; //@line 4390
     $114 = $112 >>> 12 & 16; //@line 4392
     $115 = $112 >>> $114; //@line 4393
     $117 = $115 >>> 5 & 8; //@line 4395
     $119 = $115 >>> $117; //@line 4397
     $121 = $119 >>> 2 & 4; //@line 4399
     $123 = $119 >>> $121; //@line 4401
     $125 = $123 >>> 1 & 2; //@line 4403
     $127 = $123 >>> $125; //@line 4405
     $129 = $127 >>> 1 & 1; //@line 4407
     $134 = HEAP32[13348 + (($117 | $114 | $121 | $125 | $129) + ($127 >>> $129) << 2) >> 2] | 0; //@line 4412
     $138 = (HEAP32[$134 + 4 >> 2] & -8) - $6 | 0; //@line 4416
     $143 = HEAP32[$134 + 16 + (((HEAP32[$134 + 16 >> 2] | 0) == 0 & 1) << 2) >> 2] | 0; //@line 4422
     if (!$143) {
      $$0192$lcssa$i = $134; //@line 4425
      $$0193$lcssa$i = $138; //@line 4425
     } else {
      $$01926$i = $134; //@line 4427
      $$01935$i = $138; //@line 4427
      $146 = $143; //@line 4427
      while (1) {
       $149 = (HEAP32[$146 + 4 >> 2] & -8) - $6 | 0; //@line 4432
       $150 = $149 >>> 0 < $$01935$i >>> 0; //@line 4433
       $$$0193$i = $150 ? $149 : $$01935$i; //@line 4434
       $$$0192$i = $150 ? $146 : $$01926$i; //@line 4435
       $146 = HEAP32[$146 + 16 + (((HEAP32[$146 + 16 >> 2] | 0) == 0 & 1) << 2) >> 2] | 0; //@line 4441
       if (!$146) {
        $$0192$lcssa$i = $$$0192$i; //@line 4444
        $$0193$lcssa$i = $$$0193$i; //@line 4444
        break;
       } else {
        $$01926$i = $$$0192$i; //@line 4447
        $$01935$i = $$$0193$i; //@line 4447
       }
      }
     }
     $157 = HEAP32[3265] | 0; //@line 4451
     if ($157 >>> 0 > $$0192$lcssa$i >>> 0) {
      _abort(); //@line 4454
     }
     $159 = $$0192$lcssa$i + $6 | 0; //@line 4457
     if ($159 >>> 0 <= $$0192$lcssa$i >>> 0) {
      _abort(); //@line 4460
     }
     $162 = HEAP32[$$0192$lcssa$i + 24 >> 2] | 0; //@line 4464
     $164 = HEAP32[$$0192$lcssa$i + 12 >> 2] | 0; //@line 4466
     do {
      if (($164 | 0) == ($$0192$lcssa$i | 0)) {
       $175 = $$0192$lcssa$i + 20 | 0; //@line 4470
       $176 = HEAP32[$175 >> 2] | 0; //@line 4471
       if (!$176) {
        $178 = $$0192$lcssa$i + 16 | 0; //@line 4474
        $179 = HEAP32[$178 >> 2] | 0; //@line 4475
        if (!$179) {
         $$3$i = 0; //@line 4478
         break;
        } else {
         $$1196$i = $179; //@line 4481
         $$1198$i = $178; //@line 4481
        }
       } else {
        $$1196$i = $176; //@line 4484
        $$1198$i = $175; //@line 4484
       }
       while (1) {
        $181 = $$1196$i + 20 | 0; //@line 4487
        $182 = HEAP32[$181 >> 2] | 0; //@line 4488
        if ($182 | 0) {
         $$1196$i = $182; //@line 4491
         $$1198$i = $181; //@line 4491
         continue;
        }
        $184 = $$1196$i + 16 | 0; //@line 4494
        $185 = HEAP32[$184 >> 2] | 0; //@line 4495
        if (!$185) {
         break;
        } else {
         $$1196$i = $185; //@line 4500
         $$1198$i = $184; //@line 4500
        }
       }
       if ($157 >>> 0 > $$1198$i >>> 0) {
        _abort(); //@line 4505
       } else {
        HEAP32[$$1198$i >> 2] = 0; //@line 4508
        $$3$i = $$1196$i; //@line 4509
        break;
       }
      } else {
       $167 = HEAP32[$$0192$lcssa$i + 8 >> 2] | 0; //@line 4514
       if ($157 >>> 0 > $167 >>> 0) {
        _abort(); //@line 4517
       }
       $169 = $167 + 12 | 0; //@line 4520
       if ((HEAP32[$169 >> 2] | 0) != ($$0192$lcssa$i | 0)) {
        _abort(); //@line 4524
       }
       $172 = $164 + 8 | 0; //@line 4527
       if ((HEAP32[$172 >> 2] | 0) == ($$0192$lcssa$i | 0)) {
        HEAP32[$169 >> 2] = $164; //@line 4531
        HEAP32[$172 >> 2] = $167; //@line 4532
        $$3$i = $164; //@line 4533
        break;
       } else {
        _abort(); //@line 4536
       }
      }
     } while (0);
     L73 : do {
      if ($162 | 0) {
       $190 = HEAP32[$$0192$lcssa$i + 28 >> 2] | 0; //@line 4545
       $191 = 13348 + ($190 << 2) | 0; //@line 4546
       do {
        if (($$0192$lcssa$i | 0) == (HEAP32[$191 >> 2] | 0)) {
         HEAP32[$191 >> 2] = $$3$i; //@line 4551
         if (!$$3$i) {
          HEAP32[3262] = $108 & ~(1 << $190); //@line 4557
          break L73;
         }
        } else {
         if ((HEAP32[3265] | 0) >>> 0 > $162 >>> 0) {
          _abort(); //@line 4564
         } else {
          HEAP32[$162 + 16 + (((HEAP32[$162 + 16 >> 2] | 0) != ($$0192$lcssa$i | 0) & 1) << 2) >> 2] = $$3$i; //@line 4572
          if (!$$3$i) {
           break L73;
          } else {
           break;
          }
         }
        }
       } while (0);
       $204 = HEAP32[3265] | 0; //@line 4582
       if ($204 >>> 0 > $$3$i >>> 0) {
        _abort(); //@line 4585
       }
       HEAP32[$$3$i + 24 >> 2] = $162; //@line 4589
       $208 = HEAP32[$$0192$lcssa$i + 16 >> 2] | 0; //@line 4591
       do {
        if ($208 | 0) {
         if ($204 >>> 0 > $208 >>> 0) {
          _abort(); //@line 4597
         } else {
          HEAP32[$$3$i + 16 >> 2] = $208; //@line 4601
          HEAP32[$208 + 24 >> 2] = $$3$i; //@line 4603
          break;
         }
        }
       } while (0);
       $214 = HEAP32[$$0192$lcssa$i + 20 >> 2] | 0; //@line 4609
       if ($214 | 0) {
        if ((HEAP32[3265] | 0) >>> 0 > $214 >>> 0) {
         _abort(); //@line 4615
        } else {
         HEAP32[$$3$i + 20 >> 2] = $214; //@line 4619
         HEAP32[$214 + 24 >> 2] = $$3$i; //@line 4621
         break;
        }
       }
      }
     } while (0);
     if ($$0193$lcssa$i >>> 0 < 16) {
      $221 = $$0193$lcssa$i + $6 | 0; //@line 4629
      HEAP32[$$0192$lcssa$i + 4 >> 2] = $221 | 3; //@line 4632
      $225 = $$0192$lcssa$i + $221 + 4 | 0; //@line 4634
      HEAP32[$225 >> 2] = HEAP32[$225 >> 2] | 1; //@line 4637
     } else {
      HEAP32[$$0192$lcssa$i + 4 >> 2] = $6 | 3; //@line 4641
      HEAP32[$159 + 4 >> 2] = $$0193$lcssa$i | 1; //@line 4644
      HEAP32[$159 + $$0193$lcssa$i >> 2] = $$0193$lcssa$i; //@line 4646
      if ($37 | 0) {
       $234 = HEAP32[3266] | 0; //@line 4649
       $235 = $37 >>> 3; //@line 4650
       $237 = 13084 + ($235 << 1 << 2) | 0; //@line 4652
       $238 = 1 << $235; //@line 4653
       if (!($8 & $238)) {
        HEAP32[3261] = $8 | $238; //@line 4658
        $$0189$i = $237; //@line 4660
        $$pre$phi$iZ2D = $237 + 8 | 0; //@line 4660
       } else {
        $242 = $237 + 8 | 0; //@line 4662
        $243 = HEAP32[$242 >> 2] | 0; //@line 4663
        if ((HEAP32[3265] | 0) >>> 0 > $243 >>> 0) {
         _abort(); //@line 4667
        } else {
         $$0189$i = $243; //@line 4670
         $$pre$phi$iZ2D = $242; //@line 4670
        }
       }
       HEAP32[$$pre$phi$iZ2D >> 2] = $234; //@line 4673
       HEAP32[$$0189$i + 12 >> 2] = $234; //@line 4675
       HEAP32[$234 + 8 >> 2] = $$0189$i; //@line 4677
       HEAP32[$234 + 12 >> 2] = $237; //@line 4679
      }
      HEAP32[3263] = $$0193$lcssa$i; //@line 4681
      HEAP32[3266] = $159; //@line 4682
     }
     $$0 = $$0192$lcssa$i + 8 | 0; //@line 4685
     STACKTOP = sp; //@line 4686
     return $$0 | 0; //@line 4686
    }
   } else {
    $$0197 = $6; //@line 4689
   }
  } else {
   if ($0 >>> 0 > 4294967231) {
    $$0197 = -1; //@line 4694
   } else {
    $251 = $0 + 11 | 0; //@line 4696
    $252 = $251 & -8; //@line 4697
    $253 = HEAP32[3262] | 0; //@line 4698
    if (!$253) {
     $$0197 = $252; //@line 4701
    } else {
     $255 = 0 - $252 | 0; //@line 4703
     $256 = $251 >>> 8; //@line 4704
     if (!$256) {
      $$0358$i = 0; //@line 4707
     } else {
      if ($252 >>> 0 > 16777215) {
       $$0358$i = 31; //@line 4711
      } else {
       $261 = ($256 + 1048320 | 0) >>> 16 & 8; //@line 4715
       $262 = $256 << $261; //@line 4716
       $265 = ($262 + 520192 | 0) >>> 16 & 4; //@line 4719
       $267 = $262 << $265; //@line 4721
       $270 = ($267 + 245760 | 0) >>> 16 & 2; //@line 4724
       $275 = 14 - ($265 | $261 | $270) + ($267 << $270 >>> 15) | 0; //@line 4729
       $$0358$i = $252 >>> ($275 + 7 | 0) & 1 | $275 << 1; //@line 4735
      }
     }
     $282 = HEAP32[13348 + ($$0358$i << 2) >> 2] | 0; //@line 4739
     L117 : do {
      if (!$282) {
       $$2355$i = 0; //@line 4743
       $$3$i203 = 0; //@line 4743
       $$3350$i = $255; //@line 4743
       label = 81; //@line 4744
      } else {
       $$0342$i = 0; //@line 4751
       $$0347$i = $255; //@line 4751
       $$0353$i = $282; //@line 4751
       $$0359$i = $252 << (($$0358$i | 0) == 31 ? 0 : 25 - ($$0358$i >>> 1) | 0); //@line 4751
       $$0362$i = 0; //@line 4751
       while (1) {
        $292 = (HEAP32[$$0353$i + 4 >> 2] & -8) - $252 | 0; //@line 4756
        if ($292 >>> 0 < $$0347$i >>> 0) {
         if (!$292) {
          $$414$i = $$0353$i; //@line 4761
          $$435113$i = 0; //@line 4761
          $$435712$i = $$0353$i; //@line 4761
          label = 85; //@line 4762
          break L117;
         } else {
          $$1343$i = $$0353$i; //@line 4765
          $$1348$i = $292; //@line 4765
         }
        } else {
         $$1343$i = $$0342$i; //@line 4768
         $$1348$i = $$0347$i; //@line 4768
        }
        $296 = HEAP32[$$0353$i + 20 >> 2] | 0; //@line 4771
        $$0353$i = HEAP32[$$0353$i + 16 + ($$0359$i >>> 31 << 2) >> 2] | 0; //@line 4774
        $$1363$i = ($296 | 0) == 0 | ($296 | 0) == ($$0353$i | 0) ? $$0362$i : $296; //@line 4778
        $302 = ($$0353$i | 0) == 0; //@line 4779
        if ($302) {
         $$2355$i = $$1363$i; //@line 4784
         $$3$i203 = $$1343$i; //@line 4784
         $$3350$i = $$1348$i; //@line 4784
         label = 81; //@line 4785
         break;
        } else {
         $$0342$i = $$1343$i; //@line 4788
         $$0347$i = $$1348$i; //@line 4788
         $$0359$i = $$0359$i << (($302 ^ 1) & 1); //@line 4788
         $$0362$i = $$1363$i; //@line 4788
        }
       }
      }
     } while (0);
     if ((label | 0) == 81) {
      if (($$2355$i | 0) == 0 & ($$3$i203 | 0) == 0) {
       $306 = 2 << $$0358$i; //@line 4798
       $309 = $253 & ($306 | 0 - $306); //@line 4801
       if (!$309) {
        $$0197 = $252; //@line 4804
        break;
       }
       $313 = ($309 & 0 - $309) + -1 | 0; //@line 4809
       $315 = $313 >>> 12 & 16; //@line 4811
       $316 = $313 >>> $315; //@line 4812
       $318 = $316 >>> 5 & 8; //@line 4814
       $320 = $316 >>> $318; //@line 4816
       $322 = $320 >>> 2 & 4; //@line 4818
       $324 = $320 >>> $322; //@line 4820
       $326 = $324 >>> 1 & 2; //@line 4822
       $328 = $324 >>> $326; //@line 4824
       $330 = $328 >>> 1 & 1; //@line 4826
       $$4$ph$i = 0; //@line 4832
       $$4357$ph$i = HEAP32[13348 + (($318 | $315 | $322 | $326 | $330) + ($328 >>> $330) << 2) >> 2] | 0; //@line 4832
      } else {
       $$4$ph$i = $$3$i203; //@line 4834
       $$4357$ph$i = $$2355$i; //@line 4834
      }
      if (!$$4357$ph$i) {
       $$4$lcssa$i = $$4$ph$i; //@line 4838
       $$4351$lcssa$i = $$3350$i; //@line 4838
      } else {
       $$414$i = $$4$ph$i; //@line 4840
       $$435113$i = $$3350$i; //@line 4840
       $$435712$i = $$4357$ph$i; //@line 4840
       label = 85; //@line 4841
      }
     }
     if ((label | 0) == 85) {
      while (1) {
       label = 0; //@line 4846
       $340 = (HEAP32[$$435712$i + 4 >> 2] & -8) - $252 | 0; //@line 4850
       $341 = $340 >>> 0 < $$435113$i >>> 0; //@line 4851
       $$$4351$i = $341 ? $340 : $$435113$i; //@line 4852
       $$4357$$4$i = $341 ? $$435712$i : $$414$i; //@line 4853
       $$435712$i = HEAP32[$$435712$i + 16 + (((HEAP32[$$435712$i + 16 >> 2] | 0) == 0 & 1) << 2) >> 2] | 0; //@line 4859
       if (!$$435712$i) {
        $$4$lcssa$i = $$4357$$4$i; //@line 4862
        $$4351$lcssa$i = $$$4351$i; //@line 4862
        break;
       } else {
        $$414$i = $$4357$$4$i; //@line 4865
        $$435113$i = $$$4351$i; //@line 4865
        label = 85; //@line 4866
       }
      }
     }
     if (!$$4$lcssa$i) {
      $$0197 = $252; //@line 4872
     } else {
      if ($$4351$lcssa$i >>> 0 < ((HEAP32[3263] | 0) - $252 | 0) >>> 0) {
       $352 = HEAP32[3265] | 0; //@line 4878
       if ($352 >>> 0 > $$4$lcssa$i >>> 0) {
        _abort(); //@line 4881
       }
       $354 = $$4$lcssa$i + $252 | 0; //@line 4884
       if ($354 >>> 0 <= $$4$lcssa$i >>> 0) {
        _abort(); //@line 4887
       }
       $357 = HEAP32[$$4$lcssa$i + 24 >> 2] | 0; //@line 4891
       $359 = HEAP32[$$4$lcssa$i + 12 >> 2] | 0; //@line 4893
       do {
        if (($359 | 0) == ($$4$lcssa$i | 0)) {
         $370 = $$4$lcssa$i + 20 | 0; //@line 4897
         $371 = HEAP32[$370 >> 2] | 0; //@line 4898
         if (!$371) {
          $373 = $$4$lcssa$i + 16 | 0; //@line 4901
          $374 = HEAP32[$373 >> 2] | 0; //@line 4902
          if (!$374) {
           $$3372$i = 0; //@line 4905
           break;
          } else {
           $$1370$i = $374; //@line 4908
           $$1374$i = $373; //@line 4908
          }
         } else {
          $$1370$i = $371; //@line 4911
          $$1374$i = $370; //@line 4911
         }
         while (1) {
          $376 = $$1370$i + 20 | 0; //@line 4914
          $377 = HEAP32[$376 >> 2] | 0; //@line 4915
          if ($377 | 0) {
           $$1370$i = $377; //@line 4918
           $$1374$i = $376; //@line 4918
           continue;
          }
          $379 = $$1370$i + 16 | 0; //@line 4921
          $380 = HEAP32[$379 >> 2] | 0; //@line 4922
          if (!$380) {
           break;
          } else {
           $$1370$i = $380; //@line 4927
           $$1374$i = $379; //@line 4927
          }
         }
         if ($352 >>> 0 > $$1374$i >>> 0) {
          _abort(); //@line 4932
         } else {
          HEAP32[$$1374$i >> 2] = 0; //@line 4935
          $$3372$i = $$1370$i; //@line 4936
          break;
         }
        } else {
         $362 = HEAP32[$$4$lcssa$i + 8 >> 2] | 0; //@line 4941
         if ($352 >>> 0 > $362 >>> 0) {
          _abort(); //@line 4944
         }
         $364 = $362 + 12 | 0; //@line 4947
         if ((HEAP32[$364 >> 2] | 0) != ($$4$lcssa$i | 0)) {
          _abort(); //@line 4951
         }
         $367 = $359 + 8 | 0; //@line 4954
         if ((HEAP32[$367 >> 2] | 0) == ($$4$lcssa$i | 0)) {
          HEAP32[$364 >> 2] = $359; //@line 4958
          HEAP32[$367 >> 2] = $362; //@line 4959
          $$3372$i = $359; //@line 4960
          break;
         } else {
          _abort(); //@line 4963
         }
        }
       } while (0);
       L164 : do {
        if (!$357) {
         $475 = $253; //@line 4971
        } else {
         $385 = HEAP32[$$4$lcssa$i + 28 >> 2] | 0; //@line 4974
         $386 = 13348 + ($385 << 2) | 0; //@line 4975
         do {
          if (($$4$lcssa$i | 0) == (HEAP32[$386 >> 2] | 0)) {
           HEAP32[$386 >> 2] = $$3372$i; //@line 4980
           if (!$$3372$i) {
            $391 = $253 & ~(1 << $385); //@line 4985
            HEAP32[3262] = $391; //@line 4986
            $475 = $391; //@line 4987
            break L164;
           }
          } else {
           if ((HEAP32[3265] | 0) >>> 0 > $357 >>> 0) {
            _abort(); //@line 4994
           } else {
            HEAP32[$357 + 16 + (((HEAP32[$357 + 16 >> 2] | 0) != ($$4$lcssa$i | 0) & 1) << 2) >> 2] = $$3372$i; //@line 5002
            if (!$$3372$i) {
             $475 = $253; //@line 5005
             break L164;
            } else {
             break;
            }
           }
          }
         } while (0);
         $399 = HEAP32[3265] | 0; //@line 5013
         if ($399 >>> 0 > $$3372$i >>> 0) {
          _abort(); //@line 5016
         }
         HEAP32[$$3372$i + 24 >> 2] = $357; //@line 5020
         $403 = HEAP32[$$4$lcssa$i + 16 >> 2] | 0; //@line 5022
         do {
          if ($403 | 0) {
           if ($399 >>> 0 > $403 >>> 0) {
            _abort(); //@line 5028
           } else {
            HEAP32[$$3372$i + 16 >> 2] = $403; //@line 5032
            HEAP32[$403 + 24 >> 2] = $$3372$i; //@line 5034
            break;
           }
          }
         } while (0);
         $409 = HEAP32[$$4$lcssa$i + 20 >> 2] | 0; //@line 5040
         if (!$409) {
          $475 = $253; //@line 5043
         } else {
          if ((HEAP32[3265] | 0) >>> 0 > $409 >>> 0) {
           _abort(); //@line 5048
          } else {
           HEAP32[$$3372$i + 20 >> 2] = $409; //@line 5052
           HEAP32[$409 + 24 >> 2] = $$3372$i; //@line 5054
           $475 = $253; //@line 5055
           break;
          }
         }
        }
       } while (0);
       do {
        if ($$4351$lcssa$i >>> 0 < 16) {
         $416 = $$4351$lcssa$i + $252 | 0; //@line 5064
         HEAP32[$$4$lcssa$i + 4 >> 2] = $416 | 3; //@line 5067
         $420 = $$4$lcssa$i + $416 + 4 | 0; //@line 5069
         HEAP32[$420 >> 2] = HEAP32[$420 >> 2] | 1; //@line 5072
        } else {
         HEAP32[$$4$lcssa$i + 4 >> 2] = $252 | 3; //@line 5076
         HEAP32[$354 + 4 >> 2] = $$4351$lcssa$i | 1; //@line 5079
         HEAP32[$354 + $$4351$lcssa$i >> 2] = $$4351$lcssa$i; //@line 5081
         $428 = $$4351$lcssa$i >>> 3; //@line 5082
         if ($$4351$lcssa$i >>> 0 < 256) {
          $431 = 13084 + ($428 << 1 << 2) | 0; //@line 5086
          $432 = HEAP32[3261] | 0; //@line 5087
          $433 = 1 << $428; //@line 5088
          if (!($432 & $433)) {
           HEAP32[3261] = $432 | $433; //@line 5093
           $$0368$i = $431; //@line 5095
           $$pre$phi$i211Z2D = $431 + 8 | 0; //@line 5095
          } else {
           $437 = $431 + 8 | 0; //@line 5097
           $438 = HEAP32[$437 >> 2] | 0; //@line 5098
           if ((HEAP32[3265] | 0) >>> 0 > $438 >>> 0) {
            _abort(); //@line 5102
           } else {
            $$0368$i = $438; //@line 5105
            $$pre$phi$i211Z2D = $437; //@line 5105
           }
          }
          HEAP32[$$pre$phi$i211Z2D >> 2] = $354; //@line 5108
          HEAP32[$$0368$i + 12 >> 2] = $354; //@line 5110
          HEAP32[$354 + 8 >> 2] = $$0368$i; //@line 5112
          HEAP32[$354 + 12 >> 2] = $431; //@line 5114
          break;
         }
         $444 = $$4351$lcssa$i >>> 8; //@line 5117
         if (!$444) {
          $$0361$i = 0; //@line 5120
         } else {
          if ($$4351$lcssa$i >>> 0 > 16777215) {
           $$0361$i = 31; //@line 5124
          } else {
           $449 = ($444 + 1048320 | 0) >>> 16 & 8; //@line 5128
           $450 = $444 << $449; //@line 5129
           $453 = ($450 + 520192 | 0) >>> 16 & 4; //@line 5132
           $455 = $450 << $453; //@line 5134
           $458 = ($455 + 245760 | 0) >>> 16 & 2; //@line 5137
           $463 = 14 - ($453 | $449 | $458) + ($455 << $458 >>> 15) | 0; //@line 5142
           $$0361$i = $$4351$lcssa$i >>> ($463 + 7 | 0) & 1 | $463 << 1; //@line 5148
          }
         }
         $469 = 13348 + ($$0361$i << 2) | 0; //@line 5151
         HEAP32[$354 + 28 >> 2] = $$0361$i; //@line 5153
         $471 = $354 + 16 | 0; //@line 5154
         HEAP32[$471 + 4 >> 2] = 0; //@line 5156
         HEAP32[$471 >> 2] = 0; //@line 5157
         $473 = 1 << $$0361$i; //@line 5158
         if (!($475 & $473)) {
          HEAP32[3262] = $475 | $473; //@line 5163
          HEAP32[$469 >> 2] = $354; //@line 5164
          HEAP32[$354 + 24 >> 2] = $469; //@line 5166
          HEAP32[$354 + 12 >> 2] = $354; //@line 5168
          HEAP32[$354 + 8 >> 2] = $354; //@line 5170
          break;
         }
         $$0344$i = $$4351$lcssa$i << (($$0361$i | 0) == 31 ? 0 : 25 - ($$0361$i >>> 1) | 0); //@line 5179
         $$0345$i = HEAP32[$469 >> 2] | 0; //@line 5179
         while (1) {
          if ((HEAP32[$$0345$i + 4 >> 2] & -8 | 0) == ($$4351$lcssa$i | 0)) {
           label = 139; //@line 5186
           break;
          }
          $492 = $$0345$i + 16 + ($$0344$i >>> 31 << 2) | 0; //@line 5190
          $494 = HEAP32[$492 >> 2] | 0; //@line 5192
          if (!$494) {
           label = 136; //@line 5195
           break;
          } else {
           $$0344$i = $$0344$i << 1; //@line 5198
           $$0345$i = $494; //@line 5198
          }
         }
         if ((label | 0) == 136) {
          if ((HEAP32[3265] | 0) >>> 0 > $492 >>> 0) {
           _abort(); //@line 5205
          } else {
           HEAP32[$492 >> 2] = $354; //@line 5208
           HEAP32[$354 + 24 >> 2] = $$0345$i; //@line 5210
           HEAP32[$354 + 12 >> 2] = $354; //@line 5212
           HEAP32[$354 + 8 >> 2] = $354; //@line 5214
           break;
          }
         } else if ((label | 0) == 139) {
          $501 = $$0345$i + 8 | 0; //@line 5219
          $502 = HEAP32[$501 >> 2] | 0; //@line 5220
          $503 = HEAP32[3265] | 0; //@line 5221
          if ($503 >>> 0 <= $502 >>> 0 & $503 >>> 0 <= $$0345$i >>> 0) {
           HEAP32[$502 + 12 >> 2] = $354; //@line 5227
           HEAP32[$501 >> 2] = $354; //@line 5228
           HEAP32[$354 + 8 >> 2] = $502; //@line 5230
           HEAP32[$354 + 12 >> 2] = $$0345$i; //@line 5232
           HEAP32[$354 + 24 >> 2] = 0; //@line 5234
           break;
          } else {
           _abort(); //@line 5237
          }
         }
        }
       } while (0);
       $$0 = $$4$lcssa$i + 8 | 0; //@line 5244
       STACKTOP = sp; //@line 5245
       return $$0 | 0; //@line 5245
      } else {
       $$0197 = $252; //@line 5247
      }
     }
    }
   }
  }
 } while (0);
 $512 = HEAP32[3263] | 0; //@line 5254
 if ($512 >>> 0 >= $$0197 >>> 0) {
  $514 = $512 - $$0197 | 0; //@line 5257
  $515 = HEAP32[3266] | 0; //@line 5258
  if ($514 >>> 0 > 15) {
   $517 = $515 + $$0197 | 0; //@line 5261
   HEAP32[3266] = $517; //@line 5262
   HEAP32[3263] = $514; //@line 5263
   HEAP32[$517 + 4 >> 2] = $514 | 1; //@line 5266
   HEAP32[$515 + $512 >> 2] = $514; //@line 5268
   HEAP32[$515 + 4 >> 2] = $$0197 | 3; //@line 5271
  } else {
   HEAP32[3263] = 0; //@line 5273
   HEAP32[3266] = 0; //@line 5274
   HEAP32[$515 + 4 >> 2] = $512 | 3; //@line 5277
   $526 = $515 + $512 + 4 | 0; //@line 5279
   HEAP32[$526 >> 2] = HEAP32[$526 >> 2] | 1; //@line 5282
  }
  $$0 = $515 + 8 | 0; //@line 5285
  STACKTOP = sp; //@line 5286
  return $$0 | 0; //@line 5286
 }
 $530 = HEAP32[3264] | 0; //@line 5288
 if ($530 >>> 0 > $$0197 >>> 0) {
  $532 = $530 - $$0197 | 0; //@line 5291
  HEAP32[3264] = $532; //@line 5292
  $533 = HEAP32[3267] | 0; //@line 5293
  $534 = $533 + $$0197 | 0; //@line 5294
  HEAP32[3267] = $534; //@line 5295
  HEAP32[$534 + 4 >> 2] = $532 | 1; //@line 5298
  HEAP32[$533 + 4 >> 2] = $$0197 | 3; //@line 5301
  $$0 = $533 + 8 | 0; //@line 5303
  STACKTOP = sp; //@line 5304
  return $$0 | 0; //@line 5304
 }
 if (!(HEAP32[3379] | 0)) {
  HEAP32[3381] = 4096; //@line 5309
  HEAP32[3380] = 4096; //@line 5310
  HEAP32[3382] = -1; //@line 5311
  HEAP32[3383] = -1; //@line 5312
  HEAP32[3384] = 0; //@line 5313
  HEAP32[3372] = 0; //@line 5314
  HEAP32[3379] = $1 & -16 ^ 1431655768; //@line 5318
  $548 = 4096; //@line 5319
 } else {
  $548 = HEAP32[3381] | 0; //@line 5322
 }
 $545 = $$0197 + 48 | 0; //@line 5324
 $546 = $$0197 + 47 | 0; //@line 5325
 $547 = $548 + $546 | 0; //@line 5326
 $549 = 0 - $548 | 0; //@line 5327
 $550 = $547 & $549; //@line 5328
 if ($550 >>> 0 <= $$0197 >>> 0) {
  $$0 = 0; //@line 5331
  STACKTOP = sp; //@line 5332
  return $$0 | 0; //@line 5332
 }
 $552 = HEAP32[3371] | 0; //@line 5334
 if ($552 | 0) {
  $554 = HEAP32[3369] | 0; //@line 5337
  $555 = $554 + $550 | 0; //@line 5338
  if ($555 >>> 0 <= $554 >>> 0 | $555 >>> 0 > $552 >>> 0) {
   $$0 = 0; //@line 5343
   STACKTOP = sp; //@line 5344
   return $$0 | 0; //@line 5344
  }
 }
 L244 : do {
  if (!(HEAP32[3372] & 4)) {
   $561 = HEAP32[3267] | 0; //@line 5352
   L246 : do {
    if (!$561) {
     label = 163; //@line 5356
    } else {
     $$0$i$i = 13492; //@line 5358
     while (1) {
      $563 = HEAP32[$$0$i$i >> 2] | 0; //@line 5360
      if ($563 >>> 0 <= $561 >>> 0) {
       $565 = $$0$i$i + 4 | 0; //@line 5363
       if (($563 + (HEAP32[$565 >> 2] | 0) | 0) >>> 0 > $561 >>> 0) {
        break;
       }
      }
      $570 = HEAP32[$$0$i$i + 8 >> 2] | 0; //@line 5372
      if (!$570) {
       label = 163; //@line 5375
       break L246;
      } else {
       $$0$i$i = $570; //@line 5378
      }
     }
     $595 = $547 - $530 & $549; //@line 5382
     if ($595 >>> 0 < 2147483647) {
      $597 = _sbrk($595 | 0) | 0; //@line 5385
      if (($597 | 0) == ((HEAP32[$$0$i$i >> 2] | 0) + (HEAP32[$565 >> 2] | 0) | 0)) {
       if (($597 | 0) == (-1 | 0)) {
        $$2234243136$i = $595; //@line 5393
       } else {
        $$723947$i = $595; //@line 5395
        $$748$i = $597; //@line 5395
        label = 180; //@line 5396
        break L244;
       }
      } else {
       $$2247$ph$i = $597; //@line 5400
       $$2253$ph$i = $595; //@line 5400
       label = 171; //@line 5401
      }
     } else {
      $$2234243136$i = 0; //@line 5404
     }
    }
   } while (0);
   do {
    if ((label | 0) == 163) {
     $572 = _sbrk(0) | 0; //@line 5410
     if (($572 | 0) == (-1 | 0)) {
      $$2234243136$i = 0; //@line 5413
     } else {
      $574 = $572; //@line 5415
      $575 = HEAP32[3380] | 0; //@line 5416
      $576 = $575 + -1 | 0; //@line 5417
      $$$i = (($576 & $574 | 0) == 0 ? 0 : ($576 + $574 & 0 - $575) - $574 | 0) + $550 | 0; //@line 5425
      $584 = HEAP32[3369] | 0; //@line 5426
      $585 = $$$i + $584 | 0; //@line 5427
      if ($$$i >>> 0 > $$0197 >>> 0 & $$$i >>> 0 < 2147483647) {
       $588 = HEAP32[3371] | 0; //@line 5432
       if ($588 | 0) {
        if ($585 >>> 0 <= $584 >>> 0 | $585 >>> 0 > $588 >>> 0) {
         $$2234243136$i = 0; //@line 5439
         break;
        }
       }
       $592 = _sbrk($$$i | 0) | 0; //@line 5443
       if (($592 | 0) == ($572 | 0)) {
        $$723947$i = $$$i; //@line 5446
        $$748$i = $572; //@line 5446
        label = 180; //@line 5447
        break L244;
       } else {
        $$2247$ph$i = $592; //@line 5450
        $$2253$ph$i = $$$i; //@line 5450
        label = 171; //@line 5451
       }
      } else {
       $$2234243136$i = 0; //@line 5454
      }
     }
    }
   } while (0);
   do {
    if ((label | 0) == 171) {
     $603 = 0 - $$2253$ph$i | 0; //@line 5461
     if (!($545 >>> 0 > $$2253$ph$i >>> 0 & ($$2253$ph$i >>> 0 < 2147483647 & ($$2247$ph$i | 0) != (-1 | 0)))) {
      if (($$2247$ph$i | 0) == (-1 | 0)) {
       $$2234243136$i = 0; //@line 5470
       break;
      } else {
       $$723947$i = $$2253$ph$i; //@line 5473
       $$748$i = $$2247$ph$i; //@line 5473
       label = 180; //@line 5474
       break L244;
      }
     }
     $607 = HEAP32[3381] | 0; //@line 5478
     $611 = $546 - $$2253$ph$i + $607 & 0 - $607; //@line 5482
     if ($611 >>> 0 >= 2147483647) {
      $$723947$i = $$2253$ph$i; //@line 5485
      $$748$i = $$2247$ph$i; //@line 5485
      label = 180; //@line 5486
      break L244;
     }
     if ((_sbrk($611 | 0) | 0) == (-1 | 0)) {
      _sbrk($603 | 0) | 0; //@line 5492
      $$2234243136$i = 0; //@line 5493
      break;
     } else {
      $$723947$i = $611 + $$2253$ph$i | 0; //@line 5497
      $$748$i = $$2247$ph$i; //@line 5497
      label = 180; //@line 5498
      break L244;
     }
    }
   } while (0);
   HEAP32[3372] = HEAP32[3372] | 4; //@line 5505
   $$4236$i = $$2234243136$i; //@line 5506
   label = 178; //@line 5507
  } else {
   $$4236$i = 0; //@line 5509
   label = 178; //@line 5510
  }
 } while (0);
 if ((label | 0) == 178) {
  if ($550 >>> 0 < 2147483647) {
   $620 = _sbrk($550 | 0) | 0; //@line 5516
   $621 = _sbrk(0) | 0; //@line 5517
   $627 = $621 - $620 | 0; //@line 5525
   $629 = $627 >>> 0 > ($$0197 + 40 | 0) >>> 0; //@line 5527
   if (!(($620 | 0) == (-1 | 0) | $629 ^ 1 | $620 >>> 0 < $621 >>> 0 & (($620 | 0) != (-1 | 0) & ($621 | 0) != (-1 | 0)) ^ 1)) {
    $$723947$i = $629 ? $627 : $$4236$i; //@line 5535
    $$748$i = $620; //@line 5535
    label = 180; //@line 5536
   }
  }
 }
 if ((label | 0) == 180) {
  $633 = (HEAP32[3369] | 0) + $$723947$i | 0; //@line 5542
  HEAP32[3369] = $633; //@line 5543
  if ($633 >>> 0 > (HEAP32[3370] | 0) >>> 0) {
   HEAP32[3370] = $633; //@line 5547
  }
  $636 = HEAP32[3267] | 0; //@line 5549
  do {
   if (!$636) {
    $638 = HEAP32[3265] | 0; //@line 5553
    if (($638 | 0) == 0 | $$748$i >>> 0 < $638 >>> 0) {
     HEAP32[3265] = $$748$i; //@line 5558
    }
    HEAP32[3373] = $$748$i; //@line 5560
    HEAP32[3374] = $$723947$i; //@line 5561
    HEAP32[3376] = 0; //@line 5562
    HEAP32[3270] = HEAP32[3379]; //@line 5564
    HEAP32[3269] = -1; //@line 5565
    HEAP32[3274] = 13084; //@line 5566
    HEAP32[3273] = 13084; //@line 5567
    HEAP32[3276] = 13092; //@line 5568
    HEAP32[3275] = 13092; //@line 5569
    HEAP32[3278] = 13100; //@line 5570
    HEAP32[3277] = 13100; //@line 5571
    HEAP32[3280] = 13108; //@line 5572
    HEAP32[3279] = 13108; //@line 5573
    HEAP32[3282] = 13116; //@line 5574
    HEAP32[3281] = 13116; //@line 5575
    HEAP32[3284] = 13124; //@line 5576
    HEAP32[3283] = 13124; //@line 5577
    HEAP32[3286] = 13132; //@line 5578
    HEAP32[3285] = 13132; //@line 5579
    HEAP32[3288] = 13140; //@line 5580
    HEAP32[3287] = 13140; //@line 5581
    HEAP32[3290] = 13148; //@line 5582
    HEAP32[3289] = 13148; //@line 5583
    HEAP32[3292] = 13156; //@line 5584
    HEAP32[3291] = 13156; //@line 5585
    HEAP32[3294] = 13164; //@line 5586
    HEAP32[3293] = 13164; //@line 5587
    HEAP32[3296] = 13172; //@line 5588
    HEAP32[3295] = 13172; //@line 5589
    HEAP32[3298] = 13180; //@line 5590
    HEAP32[3297] = 13180; //@line 5591
    HEAP32[3300] = 13188; //@line 5592
    HEAP32[3299] = 13188; //@line 5593
    HEAP32[3302] = 13196; //@line 5594
    HEAP32[3301] = 13196; //@line 5595
    HEAP32[3304] = 13204; //@line 5596
    HEAP32[3303] = 13204; //@line 5597
    HEAP32[3306] = 13212; //@line 5598
    HEAP32[3305] = 13212; //@line 5599
    HEAP32[3308] = 13220; //@line 5600
    HEAP32[3307] = 13220; //@line 5601
    HEAP32[3310] = 13228; //@line 5602
    HEAP32[3309] = 13228; //@line 5603
    HEAP32[3312] = 13236; //@line 5604
    HEAP32[3311] = 13236; //@line 5605
    HEAP32[3314] = 13244; //@line 5606
    HEAP32[3313] = 13244; //@line 5607
    HEAP32[3316] = 13252; //@line 5608
    HEAP32[3315] = 13252; //@line 5609
    HEAP32[3318] = 13260; //@line 5610
    HEAP32[3317] = 13260; //@line 5611
    HEAP32[3320] = 13268; //@line 5612
    HEAP32[3319] = 13268; //@line 5613
    HEAP32[3322] = 13276; //@line 5614
    HEAP32[3321] = 13276; //@line 5615
    HEAP32[3324] = 13284; //@line 5616
    HEAP32[3323] = 13284; //@line 5617
    HEAP32[3326] = 13292; //@line 5618
    HEAP32[3325] = 13292; //@line 5619
    HEAP32[3328] = 13300; //@line 5620
    HEAP32[3327] = 13300; //@line 5621
    HEAP32[3330] = 13308; //@line 5622
    HEAP32[3329] = 13308; //@line 5623
    HEAP32[3332] = 13316; //@line 5624
    HEAP32[3331] = 13316; //@line 5625
    HEAP32[3334] = 13324; //@line 5626
    HEAP32[3333] = 13324; //@line 5627
    HEAP32[3336] = 13332; //@line 5628
    HEAP32[3335] = 13332; //@line 5629
    $642 = $$723947$i + -40 | 0; //@line 5630
    $644 = $$748$i + 8 | 0; //@line 5632
    $649 = ($644 & 7 | 0) == 0 ? 0 : 0 - $644 & 7; //@line 5637
    $650 = $$748$i + $649 | 0; //@line 5638
    $651 = $642 - $649 | 0; //@line 5639
    HEAP32[3267] = $650; //@line 5640
    HEAP32[3264] = $651; //@line 5641
    HEAP32[$650 + 4 >> 2] = $651 | 1; //@line 5644
    HEAP32[$$748$i + $642 + 4 >> 2] = 40; //@line 5647
    HEAP32[3268] = HEAP32[3383]; //@line 5649
   } else {
    $$024367$i = 13492; //@line 5651
    while (1) {
     $657 = HEAP32[$$024367$i >> 2] | 0; //@line 5653
     $658 = $$024367$i + 4 | 0; //@line 5654
     $659 = HEAP32[$658 >> 2] | 0; //@line 5655
     if (($$748$i | 0) == ($657 + $659 | 0)) {
      label = 188; //@line 5659
      break;
     }
     $663 = HEAP32[$$024367$i + 8 >> 2] | 0; //@line 5663
     if (!$663) {
      break;
     } else {
      $$024367$i = $663; //@line 5668
     }
    }
    if ((label | 0) == 188) {
     if (!(HEAP32[$$024367$i + 12 >> 2] & 8)) {
      if ($$748$i >>> 0 > $636 >>> 0 & $657 >>> 0 <= $636 >>> 0) {
       HEAP32[$658 >> 2] = $659 + $$723947$i; //@line 5682
       $673 = (HEAP32[3264] | 0) + $$723947$i | 0; //@line 5684
       $675 = $636 + 8 | 0; //@line 5686
       $680 = ($675 & 7 | 0) == 0 ? 0 : 0 - $675 & 7; //@line 5691
       $681 = $636 + $680 | 0; //@line 5692
       $682 = $673 - $680 | 0; //@line 5693
       HEAP32[3267] = $681; //@line 5694
       HEAP32[3264] = $682; //@line 5695
       HEAP32[$681 + 4 >> 2] = $682 | 1; //@line 5698
       HEAP32[$636 + $673 + 4 >> 2] = 40; //@line 5701
       HEAP32[3268] = HEAP32[3383]; //@line 5703
       break;
      }
     }
    }
    $688 = HEAP32[3265] | 0; //@line 5708
    if ($$748$i >>> 0 < $688 >>> 0) {
     HEAP32[3265] = $$748$i; //@line 5711
     $753 = $$748$i; //@line 5712
    } else {
     $753 = $688; //@line 5714
    }
    $690 = $$748$i + $$723947$i | 0; //@line 5716
    $$124466$i = 13492; //@line 5717
    while (1) {
     if ((HEAP32[$$124466$i >> 2] | 0) == ($690 | 0)) {
      label = 196; //@line 5722
      break;
     }
     $694 = HEAP32[$$124466$i + 8 >> 2] | 0; //@line 5726
     if (!$694) {
      $$0$i$i$i = 13492; //@line 5729
      break;
     } else {
      $$124466$i = $694; //@line 5732
     }
    }
    if ((label | 0) == 196) {
     if (!(HEAP32[$$124466$i + 12 >> 2] & 8)) {
      HEAP32[$$124466$i >> 2] = $$748$i; //@line 5741
      $700 = $$124466$i + 4 | 0; //@line 5742
      HEAP32[$700 >> 2] = (HEAP32[$700 >> 2] | 0) + $$723947$i; //@line 5745
      $704 = $$748$i + 8 | 0; //@line 5747
      $710 = $$748$i + (($704 & 7 | 0) == 0 ? 0 : 0 - $704 & 7) | 0; //@line 5753
      $712 = $690 + 8 | 0; //@line 5755
      $718 = $690 + (($712 & 7 | 0) == 0 ? 0 : 0 - $712 & 7) | 0; //@line 5761
      $722 = $710 + $$0197 | 0; //@line 5765
      $723 = $718 - $710 - $$0197 | 0; //@line 5766
      HEAP32[$710 + 4 >> 2] = $$0197 | 3; //@line 5769
      do {
       if (($636 | 0) == ($718 | 0)) {
        $728 = (HEAP32[3264] | 0) + $723 | 0; //@line 5774
        HEAP32[3264] = $728; //@line 5775
        HEAP32[3267] = $722; //@line 5776
        HEAP32[$722 + 4 >> 2] = $728 | 1; //@line 5779
       } else {
        if ((HEAP32[3266] | 0) == ($718 | 0)) {
         $734 = (HEAP32[3263] | 0) + $723 | 0; //@line 5785
         HEAP32[3263] = $734; //@line 5786
         HEAP32[3266] = $722; //@line 5787
         HEAP32[$722 + 4 >> 2] = $734 | 1; //@line 5790
         HEAP32[$722 + $734 >> 2] = $734; //@line 5792
         break;
        }
        $739 = HEAP32[$718 + 4 >> 2] | 0; //@line 5796
        if (($739 & 3 | 0) == 1) {
         $742 = $739 & -8; //@line 5800
         $743 = $739 >>> 3; //@line 5801
         L311 : do {
          if ($739 >>> 0 < 256) {
           $746 = HEAP32[$718 + 8 >> 2] | 0; //@line 5806
           $748 = HEAP32[$718 + 12 >> 2] | 0; //@line 5808
           $750 = 13084 + ($743 << 1 << 2) | 0; //@line 5810
           do {
            if (($746 | 0) != ($750 | 0)) {
             if ($753 >>> 0 > $746 >>> 0) {
              _abort(); //@line 5816
             }
             if ((HEAP32[$746 + 12 >> 2] | 0) == ($718 | 0)) {
              break;
             }
             _abort(); //@line 5825
            }
           } while (0);
           if (($748 | 0) == ($746 | 0)) {
            HEAP32[3261] = HEAP32[3261] & ~(1 << $743); //@line 5835
            break;
           }
           do {
            if (($748 | 0) == ($750 | 0)) {
             $$pre$phi11$i$iZ2D = $748 + 8 | 0; //@line 5842
            } else {
             if ($753 >>> 0 > $748 >>> 0) {
              _abort(); //@line 5846
             }
             $764 = $748 + 8 | 0; //@line 5849
             if ((HEAP32[$764 >> 2] | 0) == ($718 | 0)) {
              $$pre$phi11$i$iZ2D = $764; //@line 5853
              break;
             }
             _abort(); //@line 5856
            }
           } while (0);
           HEAP32[$746 + 12 >> 2] = $748; //@line 5861
           HEAP32[$$pre$phi11$i$iZ2D >> 2] = $746; //@line 5862
          } else {
           $769 = HEAP32[$718 + 24 >> 2] | 0; //@line 5865
           $771 = HEAP32[$718 + 12 >> 2] | 0; //@line 5867
           do {
            if (($771 | 0) == ($718 | 0)) {
             $782 = $718 + 16 | 0; //@line 5871
             $783 = $782 + 4 | 0; //@line 5872
             $784 = HEAP32[$783 >> 2] | 0; //@line 5873
             if (!$784) {
              $786 = HEAP32[$782 >> 2] | 0; //@line 5876
              if (!$786) {
               $$3$i$i = 0; //@line 5879
               break;
              } else {
               $$1291$i$i = $786; //@line 5882
               $$1293$i$i = $782; //@line 5882
              }
             } else {
              $$1291$i$i = $784; //@line 5885
              $$1293$i$i = $783; //@line 5885
             }
             while (1) {
              $788 = $$1291$i$i + 20 | 0; //@line 5888
              $789 = HEAP32[$788 >> 2] | 0; //@line 5889
              if ($789 | 0) {
               $$1291$i$i = $789; //@line 5892
               $$1293$i$i = $788; //@line 5892
               continue;
              }
              $791 = $$1291$i$i + 16 | 0; //@line 5895
              $792 = HEAP32[$791 >> 2] | 0; //@line 5896
              if (!$792) {
               break;
              } else {
               $$1291$i$i = $792; //@line 5901
               $$1293$i$i = $791; //@line 5901
              }
             }
             if ($753 >>> 0 > $$1293$i$i >>> 0) {
              _abort(); //@line 5906
             } else {
              HEAP32[$$1293$i$i >> 2] = 0; //@line 5909
              $$3$i$i = $$1291$i$i; //@line 5910
              break;
             }
            } else {
             $774 = HEAP32[$718 + 8 >> 2] | 0; //@line 5915
             if ($753 >>> 0 > $774 >>> 0) {
              _abort(); //@line 5918
             }
             $776 = $774 + 12 | 0; //@line 5921
             if ((HEAP32[$776 >> 2] | 0) != ($718 | 0)) {
              _abort(); //@line 5925
             }
             $779 = $771 + 8 | 0; //@line 5928
             if ((HEAP32[$779 >> 2] | 0) == ($718 | 0)) {
              HEAP32[$776 >> 2] = $771; //@line 5932
              HEAP32[$779 >> 2] = $774; //@line 5933
              $$3$i$i = $771; //@line 5934
              break;
             } else {
              _abort(); //@line 5937
             }
            }
           } while (0);
           if (!$769) {
            break;
           }
           $797 = HEAP32[$718 + 28 >> 2] | 0; //@line 5947
           $798 = 13348 + ($797 << 2) | 0; //@line 5948
           do {
            if ((HEAP32[$798 >> 2] | 0) == ($718 | 0)) {
             HEAP32[$798 >> 2] = $$3$i$i; //@line 5953
             if ($$3$i$i | 0) {
              break;
             }
             HEAP32[3262] = HEAP32[3262] & ~(1 << $797); //@line 5962
             break L311;
            } else {
             if ((HEAP32[3265] | 0) >>> 0 > $769 >>> 0) {
              _abort(); //@line 5968
             } else {
              HEAP32[$769 + 16 + (((HEAP32[$769 + 16 >> 2] | 0) != ($718 | 0) & 1) << 2) >> 2] = $$3$i$i; //@line 5976
              if (!$$3$i$i) {
               break L311;
              } else {
               break;
              }
             }
            }
           } while (0);
           $812 = HEAP32[3265] | 0; //@line 5986
           if ($812 >>> 0 > $$3$i$i >>> 0) {
            _abort(); //@line 5989
           }
           HEAP32[$$3$i$i + 24 >> 2] = $769; //@line 5993
           $815 = $718 + 16 | 0; //@line 5994
           $816 = HEAP32[$815 >> 2] | 0; //@line 5995
           do {
            if ($816 | 0) {
             if ($812 >>> 0 > $816 >>> 0) {
              _abort(); //@line 6001
             } else {
              HEAP32[$$3$i$i + 16 >> 2] = $816; //@line 6005
              HEAP32[$816 + 24 >> 2] = $$3$i$i; //@line 6007
              break;
             }
            }
           } while (0);
           $822 = HEAP32[$815 + 4 >> 2] | 0; //@line 6013
           if (!$822) {
            break;
           }
           if ((HEAP32[3265] | 0) >>> 0 > $822 >>> 0) {
            _abort(); //@line 6021
           } else {
            HEAP32[$$3$i$i + 20 >> 2] = $822; //@line 6025
            HEAP32[$822 + 24 >> 2] = $$3$i$i; //@line 6027
            break;
           }
          }
         } while (0);
         $$0$i17$i = $718 + $742 | 0; //@line 6034
         $$0287$i$i = $742 + $723 | 0; //@line 6034
        } else {
         $$0$i17$i = $718; //@line 6036
         $$0287$i$i = $723; //@line 6036
        }
        $830 = $$0$i17$i + 4 | 0; //@line 6038
        HEAP32[$830 >> 2] = HEAP32[$830 >> 2] & -2; //@line 6041
        HEAP32[$722 + 4 >> 2] = $$0287$i$i | 1; //@line 6044
        HEAP32[$722 + $$0287$i$i >> 2] = $$0287$i$i; //@line 6046
        $836 = $$0287$i$i >>> 3; //@line 6047
        if ($$0287$i$i >>> 0 < 256) {
         $839 = 13084 + ($836 << 1 << 2) | 0; //@line 6051
         $840 = HEAP32[3261] | 0; //@line 6052
         $841 = 1 << $836; //@line 6053
         do {
          if (!($840 & $841)) {
           HEAP32[3261] = $840 | $841; //@line 6059
           $$0295$i$i = $839; //@line 6061
           $$pre$phi$i19$iZ2D = $839 + 8 | 0; //@line 6061
          } else {
           $845 = $839 + 8 | 0; //@line 6063
           $846 = HEAP32[$845 >> 2] | 0; //@line 6064
           if ((HEAP32[3265] | 0) >>> 0 <= $846 >>> 0) {
            $$0295$i$i = $846; //@line 6068
            $$pre$phi$i19$iZ2D = $845; //@line 6068
            break;
           }
           _abort(); //@line 6071
          }
         } while (0);
         HEAP32[$$pre$phi$i19$iZ2D >> 2] = $722; //@line 6075
         HEAP32[$$0295$i$i + 12 >> 2] = $722; //@line 6077
         HEAP32[$722 + 8 >> 2] = $$0295$i$i; //@line 6079
         HEAP32[$722 + 12 >> 2] = $839; //@line 6081
         break;
        }
        $852 = $$0287$i$i >>> 8; //@line 6084
        do {
         if (!$852) {
          $$0296$i$i = 0; //@line 6088
         } else {
          if ($$0287$i$i >>> 0 > 16777215) {
           $$0296$i$i = 31; //@line 6092
           break;
          }
          $857 = ($852 + 1048320 | 0) >>> 16 & 8; //@line 6097
          $858 = $852 << $857; //@line 6098
          $861 = ($858 + 520192 | 0) >>> 16 & 4; //@line 6101
          $863 = $858 << $861; //@line 6103
          $866 = ($863 + 245760 | 0) >>> 16 & 2; //@line 6106
          $871 = 14 - ($861 | $857 | $866) + ($863 << $866 >>> 15) | 0; //@line 6111
          $$0296$i$i = $$0287$i$i >>> ($871 + 7 | 0) & 1 | $871 << 1; //@line 6117
         }
        } while (0);
        $877 = 13348 + ($$0296$i$i << 2) | 0; //@line 6120
        HEAP32[$722 + 28 >> 2] = $$0296$i$i; //@line 6122
        $879 = $722 + 16 | 0; //@line 6123
        HEAP32[$879 + 4 >> 2] = 0; //@line 6125
        HEAP32[$879 >> 2] = 0; //@line 6126
        $881 = HEAP32[3262] | 0; //@line 6127
        $882 = 1 << $$0296$i$i; //@line 6128
        if (!($881 & $882)) {
         HEAP32[3262] = $881 | $882; //@line 6133
         HEAP32[$877 >> 2] = $722; //@line 6134
         HEAP32[$722 + 24 >> 2] = $877; //@line 6136
         HEAP32[$722 + 12 >> 2] = $722; //@line 6138
         HEAP32[$722 + 8 >> 2] = $722; //@line 6140
         break;
        }
        $$0288$i$i = $$0287$i$i << (($$0296$i$i | 0) == 31 ? 0 : 25 - ($$0296$i$i >>> 1) | 0); //@line 6149
        $$0289$i$i = HEAP32[$877 >> 2] | 0; //@line 6149
        while (1) {
         if ((HEAP32[$$0289$i$i + 4 >> 2] & -8 | 0) == ($$0287$i$i | 0)) {
          label = 263; //@line 6156
          break;
         }
         $900 = $$0289$i$i + 16 + ($$0288$i$i >>> 31 << 2) | 0; //@line 6160
         $902 = HEAP32[$900 >> 2] | 0; //@line 6162
         if (!$902) {
          label = 260; //@line 6165
          break;
         } else {
          $$0288$i$i = $$0288$i$i << 1; //@line 6168
          $$0289$i$i = $902; //@line 6168
         }
        }
        if ((label | 0) == 260) {
         if ((HEAP32[3265] | 0) >>> 0 > $900 >>> 0) {
          _abort(); //@line 6175
         } else {
          HEAP32[$900 >> 2] = $722; //@line 6178
          HEAP32[$722 + 24 >> 2] = $$0289$i$i; //@line 6180
          HEAP32[$722 + 12 >> 2] = $722; //@line 6182
          HEAP32[$722 + 8 >> 2] = $722; //@line 6184
          break;
         }
        } else if ((label | 0) == 263) {
         $909 = $$0289$i$i + 8 | 0; //@line 6189
         $910 = HEAP32[$909 >> 2] | 0; //@line 6190
         $911 = HEAP32[3265] | 0; //@line 6191
         if ($911 >>> 0 <= $910 >>> 0 & $911 >>> 0 <= $$0289$i$i >>> 0) {
          HEAP32[$910 + 12 >> 2] = $722; //@line 6197
          HEAP32[$909 >> 2] = $722; //@line 6198
          HEAP32[$722 + 8 >> 2] = $910; //@line 6200
          HEAP32[$722 + 12 >> 2] = $$0289$i$i; //@line 6202
          HEAP32[$722 + 24 >> 2] = 0; //@line 6204
          break;
         } else {
          _abort(); //@line 6207
         }
        }
       }
      } while (0);
      $$0 = $710 + 8 | 0; //@line 6214
      STACKTOP = sp; //@line 6215
      return $$0 | 0; //@line 6215
     } else {
      $$0$i$i$i = 13492; //@line 6217
     }
    }
    while (1) {
     $919 = HEAP32[$$0$i$i$i >> 2] | 0; //@line 6221
     if ($919 >>> 0 <= $636 >>> 0) {
      $923 = $919 + (HEAP32[$$0$i$i$i + 4 >> 2] | 0) | 0; //@line 6226
      if ($923 >>> 0 > $636 >>> 0) {
       break;
      }
     }
     $$0$i$i$i = HEAP32[$$0$i$i$i + 8 >> 2] | 0; //@line 6234
    }
    $927 = $923 + -47 | 0; //@line 6236
    $929 = $927 + 8 | 0; //@line 6238
    $935 = $927 + (($929 & 7 | 0) == 0 ? 0 : 0 - $929 & 7) | 0; //@line 6244
    $936 = $636 + 16 | 0; //@line 6245
    $938 = $935 >>> 0 < $936 >>> 0 ? $636 : $935; //@line 6247
    $939 = $938 + 8 | 0; //@line 6248
    $940 = $938 + 24 | 0; //@line 6249
    $941 = $$723947$i + -40 | 0; //@line 6250
    $943 = $$748$i + 8 | 0; //@line 6252
    $948 = ($943 & 7 | 0) == 0 ? 0 : 0 - $943 & 7; //@line 6257
    $949 = $$748$i + $948 | 0; //@line 6258
    $950 = $941 - $948 | 0; //@line 6259
    HEAP32[3267] = $949; //@line 6260
    HEAP32[3264] = $950; //@line 6261
    HEAP32[$949 + 4 >> 2] = $950 | 1; //@line 6264
    HEAP32[$$748$i + $941 + 4 >> 2] = 40; //@line 6267
    HEAP32[3268] = HEAP32[3383]; //@line 6269
    $956 = $938 + 4 | 0; //@line 6270
    HEAP32[$956 >> 2] = 27; //@line 6271
    HEAP32[$939 >> 2] = HEAP32[3373]; //@line 6272
    HEAP32[$939 + 4 >> 2] = HEAP32[3374]; //@line 6272
    HEAP32[$939 + 8 >> 2] = HEAP32[3375]; //@line 6272
    HEAP32[$939 + 12 >> 2] = HEAP32[3376]; //@line 6272
    HEAP32[3373] = $$748$i; //@line 6273
    HEAP32[3374] = $$723947$i; //@line 6274
    HEAP32[3376] = 0; //@line 6275
    HEAP32[3375] = $939; //@line 6276
    $958 = $940; //@line 6277
    do {
     $958$looptemp = $958;
     $958 = $958 + 4 | 0; //@line 6279
     HEAP32[$958 >> 2] = 7; //@line 6280
    } while (($958$looptemp + 8 | 0) >>> 0 < $923 >>> 0);
    if (($938 | 0) != ($636 | 0)) {
     $964 = $938 - $636 | 0; //@line 6293
     HEAP32[$956 >> 2] = HEAP32[$956 >> 2] & -2; //@line 6296
     HEAP32[$636 + 4 >> 2] = $964 | 1; //@line 6299
     HEAP32[$938 >> 2] = $964; //@line 6300
     $969 = $964 >>> 3; //@line 6301
     if ($964 >>> 0 < 256) {
      $972 = 13084 + ($969 << 1 << 2) | 0; //@line 6305
      $973 = HEAP32[3261] | 0; //@line 6306
      $974 = 1 << $969; //@line 6307
      if (!($973 & $974)) {
       HEAP32[3261] = $973 | $974; //@line 6312
       $$0211$i$i = $972; //@line 6314
       $$pre$phi$i$iZ2D = $972 + 8 | 0; //@line 6314
      } else {
       $978 = $972 + 8 | 0; //@line 6316
       $979 = HEAP32[$978 >> 2] | 0; //@line 6317
       if ((HEAP32[3265] | 0) >>> 0 > $979 >>> 0) {
        _abort(); //@line 6321
       } else {
        $$0211$i$i = $979; //@line 6324
        $$pre$phi$i$iZ2D = $978; //@line 6324
       }
      }
      HEAP32[$$pre$phi$i$iZ2D >> 2] = $636; //@line 6327
      HEAP32[$$0211$i$i + 12 >> 2] = $636; //@line 6329
      HEAP32[$636 + 8 >> 2] = $$0211$i$i; //@line 6331
      HEAP32[$636 + 12 >> 2] = $972; //@line 6333
      break;
     }
     $985 = $964 >>> 8; //@line 6336
     if (!$985) {
      $$0212$i$i = 0; //@line 6339
     } else {
      if ($964 >>> 0 > 16777215) {
       $$0212$i$i = 31; //@line 6343
      } else {
       $990 = ($985 + 1048320 | 0) >>> 16 & 8; //@line 6347
       $991 = $985 << $990; //@line 6348
       $994 = ($991 + 520192 | 0) >>> 16 & 4; //@line 6351
       $996 = $991 << $994; //@line 6353
       $999 = ($996 + 245760 | 0) >>> 16 & 2; //@line 6356
       $1004 = 14 - ($994 | $990 | $999) + ($996 << $999 >>> 15) | 0; //@line 6361
       $$0212$i$i = $964 >>> ($1004 + 7 | 0) & 1 | $1004 << 1; //@line 6367
      }
     }
     $1010 = 13348 + ($$0212$i$i << 2) | 0; //@line 6370
     HEAP32[$636 + 28 >> 2] = $$0212$i$i; //@line 6372
     HEAP32[$636 + 20 >> 2] = 0; //@line 6374
     HEAP32[$936 >> 2] = 0; //@line 6375
     $1013 = HEAP32[3262] | 0; //@line 6376
     $1014 = 1 << $$0212$i$i; //@line 6377
     if (!($1013 & $1014)) {
      HEAP32[3262] = $1013 | $1014; //@line 6382
      HEAP32[$1010 >> 2] = $636; //@line 6383
      HEAP32[$636 + 24 >> 2] = $1010; //@line 6385
      HEAP32[$636 + 12 >> 2] = $636; //@line 6387
      HEAP32[$636 + 8 >> 2] = $636; //@line 6389
      break;
     }
     $$0206$i$i = $964 << (($$0212$i$i | 0) == 31 ? 0 : 25 - ($$0212$i$i >>> 1) | 0); //@line 6398
     $$0207$i$i = HEAP32[$1010 >> 2] | 0; //@line 6398
     while (1) {
      if ((HEAP32[$$0207$i$i + 4 >> 2] & -8 | 0) == ($964 | 0)) {
       label = 289; //@line 6405
       break;
      }
      $1032 = $$0207$i$i + 16 + ($$0206$i$i >>> 31 << 2) | 0; //@line 6409
      $1034 = HEAP32[$1032 >> 2] | 0; //@line 6411
      if (!$1034) {
       label = 286; //@line 6414
       break;
      } else {
       $$0206$i$i = $$0206$i$i << 1; //@line 6417
       $$0207$i$i = $1034; //@line 6417
      }
     }
     if ((label | 0) == 286) {
      if ((HEAP32[3265] | 0) >>> 0 > $1032 >>> 0) {
       _abort(); //@line 6424
      } else {
       HEAP32[$1032 >> 2] = $636; //@line 6427
       HEAP32[$636 + 24 >> 2] = $$0207$i$i; //@line 6429
       HEAP32[$636 + 12 >> 2] = $636; //@line 6431
       HEAP32[$636 + 8 >> 2] = $636; //@line 6433
       break;
      }
     } else if ((label | 0) == 289) {
      $1041 = $$0207$i$i + 8 | 0; //@line 6438
      $1042 = HEAP32[$1041 >> 2] | 0; //@line 6439
      $1043 = HEAP32[3265] | 0; //@line 6440
      if ($1043 >>> 0 <= $1042 >>> 0 & $1043 >>> 0 <= $$0207$i$i >>> 0) {
       HEAP32[$1042 + 12 >> 2] = $636; //@line 6446
       HEAP32[$1041 >> 2] = $636; //@line 6447
       HEAP32[$636 + 8 >> 2] = $1042; //@line 6449
       HEAP32[$636 + 12 >> 2] = $$0207$i$i; //@line 6451
       HEAP32[$636 + 24 >> 2] = 0; //@line 6453
       break;
      } else {
       _abort(); //@line 6456
      }
     }
    }
   }
  } while (0);
  $1052 = HEAP32[3264] | 0; //@line 6463
  if ($1052 >>> 0 > $$0197 >>> 0) {
   $1054 = $1052 - $$0197 | 0; //@line 6466
   HEAP32[3264] = $1054; //@line 6467
   $1055 = HEAP32[3267] | 0; //@line 6468
   $1056 = $1055 + $$0197 | 0; //@line 6469
   HEAP32[3267] = $1056; //@line 6470
   HEAP32[$1056 + 4 >> 2] = $1054 | 1; //@line 6473
   HEAP32[$1055 + 4 >> 2] = $$0197 | 3; //@line 6476
   $$0 = $1055 + 8 | 0; //@line 6478
   STACKTOP = sp; //@line 6479
   return $$0 | 0; //@line 6479
  }
 }
 HEAP32[(___errno_location() | 0) >> 2] = 12; //@line 6483
 $$0 = 0; //@line 6484
 STACKTOP = sp; //@line 6485
 return $$0 | 0; //@line 6485
}
function _fmt_fp($0, $1, $2, $3, $4, $5) {
 $0 = $0 | 0;
 $1 = +$1;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 $5 = $5 | 0;
 var $$$3484 = 0, $$$3484700 = 0, $$$4502 = 0, $$$564 = 0.0, $$0 = 0, $$0463$lcssa = 0, $$0463587 = 0, $$0464597 = 0, $$0471 = 0.0, $$0479 = 0, $$0487644 = 0, $$0488655 = 0, $$0488657 = 0, $$0496$$9 = 0, $$0497656 = 0, $$0498 = 0, $$0509585 = 0.0, $$0511 = 0, $$0514639 = 0, $$0520 = 0, $$0521 = 0, $$0521$ = 0, $$0523 = 0, $$0527$in633 = 0, $$0530638 = 0, $$1465 = 0, $$1467 = 0.0, $$1469 = 0.0, $$1472 = 0.0, $$1480 = 0, $$1482$lcssa = 0, $$1482663 = 0, $$1489643 = 0, $$1499$lcssa = 0, $$1499662 = 0, $$1508586 = 0, $$1512$lcssa = 0, $$1512610 = 0, $$1515 = 0, $$1524 = 0, $$1528617 = 0, $$1531$lcssa = 0, $$1531632 = 0, $$1601 = 0, $$2 = 0, $$2473 = 0.0, $$2476 = 0, $$2483$ph = 0, $$2500 = 0, $$2513 = 0, $$2516621 = 0, $$2529 = 0, $$2532620 = 0, $$3 = 0.0, $$3477 = 0, $$3484$lcssa = 0, $$3484650 = 0, $$3501$lcssa = 0, $$3501649 = 0, $$3533616 = 0, $$4 = 0.0, $$4478$lcssa = 0, $$4478593 = 0, $$4492 = 0, $$4502 = 0, $$4518 = 0, $$5$lcssa = 0, $$540 = 0, $$540$ = 0, $$543 = 0.0, $$548 = 0, $$5486$lcssa = 0, $$5486626 = 0, $$5493600 = 0, $$550 = 0, $$5519$ph = 0, $$5605 = 0, $$561 = 0, $$6 = 0, $$6494592 = 0, $$7495604 = 0, $$7505 = 0, $$7505$ = 0, $$7505$ph = 0, $$8 = 0, $$9$ph = 0, $$lcssa675 = 0, $$pn = 0, $$pr = 0, $$pr566 = 0, $$pre$phi691Z2D = 0, $$pre$phi698Z2D = 0, $$pre693 = 0, $$sink = 0, $$sink547$lcssa = 0, $$sink547625 = 0, $$sink560 = 0, $10 = 0, $101 = 0, $104 = 0, $106 = 0, $11 = 0, $113 = 0, $116 = 0, $124 = 0, $125 = 0, $128 = 0, $130 = 0, $131 = 0, $132 = 0, $138 = 0, $140 = 0, $144 = 0, $149 = 0, $150 = 0, $151 = 0, $152 = 0, $154 = 0, $160 = 0, $161 = 0, $162 = 0, $174 = 0, $185 = 0, $189 = 0, $190 = 0, $193 = 0, $198 = 0, $199 = 0, $201 = 0, $209 = 0, $212 = 0, $213 = 0, $215 = 0, $217 = 0, $218 = 0, $221 = 0, $225 = 0, $230 = 0, $233 = 0, $236 = 0, $238 = 0, $240 = 0, $242 = 0, $247 = 0, $248 = 0, $251 = 0, $253 = 0, $256 = 0, $259 = 0, $267 = 0, $27 = 0, $270 = 0, $275 = 0, $284 = 0, $285 = 0, $289 = 0, $292 = 0, $294 = 0, $296 = 0, $300 = 0, $303 = 0, $304 = 0, $308 = 0, $31 = 0, $318 = 0, $323 = 0, $326 = 0, $327 = 0, $328 = 0, $330 = 0, $335 = 0, $347 = 0, $35 = 0.0, $351 = 0, $356 = 0, $36 = 0, $363 = 0, $364 = 0, $365 = 0, $366 = 0, $367 = 0, $369 = 0, $373 = 0, $375 = 0, $378 = 0, $381 = 0, $39 = 0, $41 = 0, $44 = 0, $46 = 0, $6 = 0, $60 = 0, $63 = 0, $66 = 0, $68 = 0, $7 = 0, $76 = 0, $77 = 0, $79 = 0, $8 = 0, $80 = 0, $86 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 10537
 STACKTOP = STACKTOP + 560 | 0; //@line 10538
 $6 = sp + 8 | 0; //@line 10539
 $7 = sp; //@line 10540
 $8 = sp + 524 | 0; //@line 10541
 $9 = $8; //@line 10542
 $10 = sp + 512 | 0; //@line 10543
 HEAP32[$7 >> 2] = 0; //@line 10544
 $11 = $10 + 12 | 0; //@line 10545
 ___DOUBLE_BITS_677($1) | 0; //@line 10546
 if ((tempRet0 | 0) < 0) {
  $$0471 = -$1; //@line 10551
  $$0520 = 1; //@line 10551
  $$0521 = 6316; //@line 10551
 } else {
  $$0471 = $1; //@line 10562
  $$0520 = ($4 & 2049 | 0) != 0 & 1; //@line 10562
  $$0521 = ($4 & 2048 | 0) == 0 ? ($4 & 1 | 0) == 0 ? 6317 : 6322 : 6319; //@line 10562
 }
 ___DOUBLE_BITS_677($$0471) | 0; //@line 10564
 do {
  if (0 == 0 & (tempRet0 & 2146435072 | 0) == 2146435072) {
   $27 = ($5 & 32 | 0) != 0; //@line 10573
   $31 = $$0520 + 3 | 0; //@line 10578
   _pad_676($0, 32, $2, $31, $4 & -65537); //@line 10580
   _out_670($0, $$0521, $$0520); //@line 10581
   _out_670($0, $$0471 != $$0471 | 0.0 != 0.0 ? $27 ? 6343 : 6347 : $27 ? 6335 : 6339, 3); //@line 10582
   _pad_676($0, 32, $2, $31, $4 ^ 8192); //@line 10584
   $$sink560 = $31; //@line 10585
  } else {
   $35 = +_frexpl($$0471, $7) * 2.0; //@line 10588
   $36 = $35 != 0.0; //@line 10589
   if ($36) {
    HEAP32[$7 >> 2] = (HEAP32[$7 >> 2] | 0) + -1; //@line 10593
   }
   $39 = $5 | 32; //@line 10595
   if (($39 | 0) == 97) {
    $41 = $5 & 32; //@line 10598
    $$0521$ = ($41 | 0) == 0 ? $$0521 : $$0521 + 9 | 0; //@line 10601
    $44 = $$0520 | 2; //@line 10602
    $46 = 12 - $3 | 0; //@line 10604
    do {
     if ($3 >>> 0 > 11 | ($46 | 0) == 0) {
      $$1472 = $35; //@line 10609
     } else {
      $$0509585 = 8.0; //@line 10611
      $$1508586 = $46; //@line 10611
      do {
       $$1508586 = $$1508586 + -1 | 0; //@line 10613
       $$0509585 = $$0509585 * 16.0; //@line 10614
      } while (($$1508586 | 0) != 0);
      if ((HEAP8[$$0521$ >> 0] | 0) == 45) {
       $$1472 = -($$0509585 + (-$35 - $$0509585)); //@line 10629
       break;
      } else {
       $$1472 = $35 + $$0509585 - $$0509585; //@line 10634
       break;
      }
     }
    } while (0);
    $60 = HEAP32[$7 >> 2] | 0; //@line 10639
    $63 = ($60 | 0) < 0 ? 0 - $60 | 0 : $60; //@line 10642
    $66 = _fmt_u($63, (($63 | 0) < 0) << 31 >> 31, $11) | 0; //@line 10645
    if (($66 | 0) == ($11 | 0)) {
     $68 = $10 + 11 | 0; //@line 10648
     HEAP8[$68 >> 0] = 48; //@line 10649
     $$0511 = $68; //@line 10650
    } else {
     $$0511 = $66; //@line 10652
    }
    HEAP8[$$0511 + -1 >> 0] = ($60 >> 31 & 2) + 43; //@line 10659
    $76 = $$0511 + -2 | 0; //@line 10662
    HEAP8[$76 >> 0] = $5 + 15; //@line 10663
    $77 = ($3 | 0) < 1; //@line 10664
    $79 = ($4 & 8 | 0) == 0; //@line 10666
    $$0523 = $8; //@line 10667
    $$2473 = $$1472; //@line 10667
    while (1) {
     $80 = ~~$$2473; //@line 10669
     $86 = $$0523 + 1 | 0; //@line 10675
     HEAP8[$$0523 >> 0] = $41 | HEAPU8[6351 + $80 >> 0]; //@line 10676
     $$2473 = ($$2473 - +($80 | 0)) * 16.0; //@line 10679
     if (($86 - $9 | 0) == 1) {
      if ($79 & ($77 & $$2473 == 0.0)) {
       $$1524 = $86; //@line 10688
      } else {
       HEAP8[$86 >> 0] = 46; //@line 10691
       $$1524 = $$0523 + 2 | 0; //@line 10692
      }
     } else {
      $$1524 = $86; //@line 10695
     }
     if (!($$2473 != 0.0)) {
      break;
     } else {
      $$0523 = $$1524; //@line 10699
     }
    }
    $$pre693 = $$1524; //@line 10705
    if (!$3) {
     label = 24; //@line 10707
    } else {
     if ((-2 - $9 + $$pre693 | 0) < ($3 | 0)) {
      $$pre$phi691Z2D = $$pre693 - $9 | 0; //@line 10715
      $$sink = $3 + 2 | 0; //@line 10715
     } else {
      label = 24; //@line 10717
     }
    }
    if ((label | 0) == 24) {
     $101 = $$pre693 - $9 | 0; //@line 10721
     $$pre$phi691Z2D = $101; //@line 10722
     $$sink = $101; //@line 10722
    }
    $104 = $11 - $76 | 0; //@line 10726
    $106 = $104 + $44 + $$sink | 0; //@line 10728
    _pad_676($0, 32, $2, $106, $4); //@line 10729
    _out_670($0, $$0521$, $44); //@line 10730
    _pad_676($0, 48, $2, $106, $4 ^ 65536); //@line 10732
    _out_670($0, $8, $$pre$phi691Z2D); //@line 10733
    _pad_676($0, 48, $$sink - $$pre$phi691Z2D | 0, 0, 0); //@line 10735
    _out_670($0, $76, $104); //@line 10736
    _pad_676($0, 32, $2, $106, $4 ^ 8192); //@line 10738
    $$sink560 = $106; //@line 10739
    break;
   }
   $$540 = ($3 | 0) < 0 ? 6 : $3; //@line 10743
   if ($36) {
    $113 = (HEAP32[$7 >> 2] | 0) + -28 | 0; //@line 10747
    HEAP32[$7 >> 2] = $113; //@line 10748
    $$3 = $35 * 268435456.0; //@line 10749
    $$pr = $113; //@line 10749
   } else {
    $$3 = $35; //@line 10752
    $$pr = HEAP32[$7 >> 2] | 0; //@line 10752
   }
   $$561 = ($$pr | 0) < 0 ? $6 : $6 + 288 | 0; //@line 10756
   $$0498 = $$561; //@line 10757
   $$4 = $$3; //@line 10757
   do {
    $116 = ~~$$4 >>> 0; //@line 10759
    HEAP32[$$0498 >> 2] = $116; //@line 10760
    $$0498 = $$0498 + 4 | 0; //@line 10761
    $$4 = ($$4 - +($116 >>> 0)) * 1.0e9; //@line 10764
   } while ($$4 != 0.0);
   if (($$pr | 0) > 0) {
    $$1482663 = $$561; //@line 10774
    $$1499662 = $$0498; //@line 10774
    $124 = $$pr; //@line 10774
    while (1) {
     $125 = ($124 | 0) < 29 ? $124 : 29; //@line 10777
     $$0488655 = $$1499662 + -4 | 0; //@line 10778
     if ($$0488655 >>> 0 < $$1482663 >>> 0) {
      $$2483$ph = $$1482663; //@line 10781
     } else {
      $$0488657 = $$0488655; //@line 10783
      $$0497656 = 0; //@line 10783
      do {
       $128 = _bitshift64Shl(HEAP32[$$0488657 >> 2] | 0, 0, $125 | 0) | 0; //@line 10786
       $130 = _i64Add($128 | 0, tempRet0 | 0, $$0497656 | 0, 0) | 0; //@line 10788
       $131 = tempRet0; //@line 10789
       $132 = ___uremdi3($130 | 0, $131 | 0, 1e9, 0) | 0; //@line 10790
       HEAP32[$$0488657 >> 2] = $132; //@line 10792
       $$0497656 = ___udivdi3($130 | 0, $131 | 0, 1e9, 0) | 0; //@line 10793
       $$0488657 = $$0488657 + -4 | 0; //@line 10795
      } while ($$0488657 >>> 0 >= $$1482663 >>> 0);
      if (!$$0497656) {
       $$2483$ph = $$1482663; //@line 10805
      } else {
       $138 = $$1482663 + -4 | 0; //@line 10807
       HEAP32[$138 >> 2] = $$0497656; //@line 10808
       $$2483$ph = $138; //@line 10809
      }
     }
     $$2500 = $$1499662; //@line 10812
     while (1) {
      if ($$2500 >>> 0 <= $$2483$ph >>> 0) {
       break;
      }
      $140 = $$2500 + -4 | 0; //@line 10818
      if (!(HEAP32[$140 >> 2] | 0)) {
       $$2500 = $140; //@line 10822
      } else {
       break;
      }
     }
     $144 = (HEAP32[$7 >> 2] | 0) - $125 | 0; //@line 10828
     HEAP32[$7 >> 2] = $144; //@line 10829
     if (($144 | 0) > 0) {
      $$1482663 = $$2483$ph; //@line 10832
      $$1499662 = $$2500; //@line 10832
      $124 = $144; //@line 10832
     } else {
      $$1482$lcssa = $$2483$ph; //@line 10834
      $$1499$lcssa = $$2500; //@line 10834
      $$pr566 = $144; //@line 10834
      break;
     }
    }
   } else {
    $$1482$lcssa = $$561; //@line 10839
    $$1499$lcssa = $$0498; //@line 10839
    $$pr566 = $$pr; //@line 10839
   }
   if (($$pr566 | 0) < 0) {
    $149 = (($$540 + 25 | 0) / 9 | 0) + 1 | 0; //@line 10845
    $150 = ($39 | 0) == 102; //@line 10846
    $$3484650 = $$1482$lcssa; //@line 10847
    $$3501649 = $$1499$lcssa; //@line 10847
    $152 = $$pr566; //@line 10847
    while (1) {
     $151 = 0 - $152 | 0; //@line 10849
     $154 = ($151 | 0) < 9 ? $151 : 9; //@line 10851
     if ($$3484650 >>> 0 < $$3501649 >>> 0) {
      $160 = (1 << $154) + -1 | 0; //@line 10855
      $161 = 1e9 >>> $154; //@line 10856
      $$0487644 = 0; //@line 10857
      $$1489643 = $$3484650; //@line 10857
      do {
       $162 = HEAP32[$$1489643 >> 2] | 0; //@line 10859
       HEAP32[$$1489643 >> 2] = ($162 >>> $154) + $$0487644; //@line 10863
       $$0487644 = Math_imul($162 & $160, $161) | 0; //@line 10864
       $$1489643 = $$1489643 + 4 | 0; //@line 10865
      } while ($$1489643 >>> 0 < $$3501649 >>> 0);
      $$$3484 = (HEAP32[$$3484650 >> 2] | 0) == 0 ? $$3484650 + 4 | 0 : $$3484650; //@line 10876
      if (!$$0487644) {
       $$$3484700 = $$$3484; //@line 10879
       $$4502 = $$3501649; //@line 10879
      } else {
       HEAP32[$$3501649 >> 2] = $$0487644; //@line 10882
       $$$3484700 = $$$3484; //@line 10883
       $$4502 = $$3501649 + 4 | 0; //@line 10883
      }
     } else {
      $$$3484700 = (HEAP32[$$3484650 >> 2] | 0) == 0 ? $$3484650 + 4 | 0 : $$3484650; //@line 10890
      $$4502 = $$3501649; //@line 10890
     }
     $174 = $150 ? $$561 : $$$3484700; //@line 10892
     $$$4502 = ($$4502 - $174 >> 2 | 0) > ($149 | 0) ? $174 + ($149 << 2) | 0 : $$4502; //@line 10899
     $152 = (HEAP32[$7 >> 2] | 0) + $154 | 0; //@line 10901
     HEAP32[$7 >> 2] = $152; //@line 10902
     if (($152 | 0) >= 0) {
      $$3484$lcssa = $$$3484700; //@line 10907
      $$3501$lcssa = $$$4502; //@line 10907
      break;
     } else {
      $$3484650 = $$$3484700; //@line 10905
      $$3501649 = $$$4502; //@line 10905
     }
    }
   } else {
    $$3484$lcssa = $$1482$lcssa; //@line 10912
    $$3501$lcssa = $$1499$lcssa; //@line 10912
   }
   $185 = $$561; //@line 10915
   if ($$3484$lcssa >>> 0 < $$3501$lcssa >>> 0) {
    $189 = ($185 - $$3484$lcssa >> 2) * 9 | 0; //@line 10920
    $190 = HEAP32[$$3484$lcssa >> 2] | 0; //@line 10921
    if ($190 >>> 0 < 10) {
     $$1515 = $189; //@line 10924
    } else {
     $$0514639 = $189; //@line 10926
     $$0530638 = 10; //@line 10926
     while (1) {
      $$0530638 = $$0530638 * 10 | 0; //@line 10928
      $193 = $$0514639 + 1 | 0; //@line 10929
      if ($190 >>> 0 < $$0530638 >>> 0) {
       $$1515 = $193; //@line 10932
       break;
      } else {
       $$0514639 = $193; //@line 10935
      }
     }
    }
   } else {
    $$1515 = 0; //@line 10940
   }
   $198 = ($39 | 0) == 103; //@line 10945
   $199 = ($$540 | 0) != 0; //@line 10946
   $201 = $$540 - (($39 | 0) != 102 ? $$1515 : 0) + (($199 & $198) << 31 >> 31) | 0; //@line 10949
   if (($201 | 0) < ((($$3501$lcssa - $185 >> 2) * 9 | 0) + -9 | 0)) {
    $209 = $201 + 9216 | 0; //@line 10958
    $212 = $$561 + 4 + ((($209 | 0) / 9 | 0) + -1024 << 2) | 0; //@line 10961
    $213 = ($209 | 0) % 9 | 0; //@line 10962
    if (($213 | 0) < 8) {
     $$0527$in633 = $213; //@line 10965
     $$1531632 = 10; //@line 10965
     while (1) {
      $215 = $$1531632 * 10 | 0; //@line 10968
      if (($$0527$in633 | 0) < 7) {
       $$0527$in633 = $$0527$in633 + 1 | 0; //@line 10971
       $$1531632 = $215; //@line 10971
      } else {
       $$1531$lcssa = $215; //@line 10973
       break;
      }
     }
    } else {
     $$1531$lcssa = 10; //@line 10978
    }
    $217 = HEAP32[$212 >> 2] | 0; //@line 10980
    $218 = ($217 >>> 0) % ($$1531$lcssa >>> 0) | 0; //@line 10981
    $221 = ($212 + 4 | 0) == ($$3501$lcssa | 0); //@line 10984
    if ($221 & ($218 | 0) == 0) {
     $$4492 = $212; //@line 10987
     $$4518 = $$1515; //@line 10987
     $$8 = $$3484$lcssa; //@line 10987
    } else {
     $$543 = ((($217 >>> 0) / ($$1531$lcssa >>> 0) | 0) & 1 | 0) == 0 ? 9007199254740992.0 : 9007199254740994.0; //@line 10992
     $225 = ($$1531$lcssa | 0) / 2 | 0; //@line 10993
     $$$564 = $218 >>> 0 < $225 >>> 0 ? .5 : $221 & ($218 | 0) == ($225 | 0) ? 1.0 : 1.5; //@line 10998
     if (!$$0520) {
      $$1467 = $$$564; //@line 11001
      $$1469 = $$543; //@line 11001
     } else {
      $230 = (HEAP8[$$0521 >> 0] | 0) == 45; //@line 11004
      $$1467 = $230 ? -$$$564 : $$$564; //@line 11009
      $$1469 = $230 ? -$$543 : $$543; //@line 11009
     }
     $233 = $217 - $218 | 0; //@line 11011
     HEAP32[$212 >> 2] = $233; //@line 11012
     if ($$1469 + $$1467 != $$1469) {
      $236 = $233 + $$1531$lcssa | 0; //@line 11016
      HEAP32[$212 >> 2] = $236; //@line 11017
      if ($236 >>> 0 > 999999999) {
       $$5486626 = $$3484$lcssa; //@line 11020
       $$sink547625 = $212; //@line 11020
       while (1) {
        $238 = $$sink547625 + -4 | 0; //@line 11022
        HEAP32[$$sink547625 >> 2] = 0; //@line 11023
        if ($238 >>> 0 < $$5486626 >>> 0) {
         $240 = $$5486626 + -4 | 0; //@line 11026
         HEAP32[$240 >> 2] = 0; //@line 11027
         $$6 = $240; //@line 11028
        } else {
         $$6 = $$5486626; //@line 11030
        }
        $242 = (HEAP32[$238 >> 2] | 0) + 1 | 0; //@line 11033
        HEAP32[$238 >> 2] = $242; //@line 11034
        if ($242 >>> 0 > 999999999) {
         $$5486626 = $$6; //@line 11037
         $$sink547625 = $238; //@line 11037
        } else {
         $$5486$lcssa = $$6; //@line 11039
         $$sink547$lcssa = $238; //@line 11039
         break;
        }
       }
      } else {
       $$5486$lcssa = $$3484$lcssa; //@line 11044
       $$sink547$lcssa = $212; //@line 11044
      }
      $247 = ($185 - $$5486$lcssa >> 2) * 9 | 0; //@line 11049
      $248 = HEAP32[$$5486$lcssa >> 2] | 0; //@line 11050
      if ($248 >>> 0 < 10) {
       $$4492 = $$sink547$lcssa; //@line 11053
       $$4518 = $247; //@line 11053
       $$8 = $$5486$lcssa; //@line 11053
      } else {
       $$2516621 = $247; //@line 11055
       $$2532620 = 10; //@line 11055
       while (1) {
        $$2532620 = $$2532620 * 10 | 0; //@line 11057
        $251 = $$2516621 + 1 | 0; //@line 11058
        if ($248 >>> 0 < $$2532620 >>> 0) {
         $$4492 = $$sink547$lcssa; //@line 11061
         $$4518 = $251; //@line 11061
         $$8 = $$5486$lcssa; //@line 11061
         break;
        } else {
         $$2516621 = $251; //@line 11064
        }
       }
      }
     } else {
      $$4492 = $212; //@line 11069
      $$4518 = $$1515; //@line 11069
      $$8 = $$3484$lcssa; //@line 11069
     }
    }
    $253 = $$4492 + 4 | 0; //@line 11072
    $$5519$ph = $$4518; //@line 11075
    $$7505$ph = $$3501$lcssa >>> 0 > $253 >>> 0 ? $253 : $$3501$lcssa; //@line 11075
    $$9$ph = $$8; //@line 11075
   } else {
    $$5519$ph = $$1515; //@line 11077
    $$7505$ph = $$3501$lcssa; //@line 11077
    $$9$ph = $$3484$lcssa; //@line 11077
   }
   $$7505 = $$7505$ph; //@line 11079
   while (1) {
    if ($$7505 >>> 0 <= $$9$ph >>> 0) {
     $$lcssa675 = 0; //@line 11083
     break;
    }
    $256 = $$7505 + -4 | 0; //@line 11086
    if (!(HEAP32[$256 >> 2] | 0)) {
     $$7505 = $256; //@line 11090
    } else {
     $$lcssa675 = 1; //@line 11092
     break;
    }
   }
   $259 = 0 - $$5519$ph | 0; //@line 11096
   do {
    if ($198) {
     $$540$ = $$540 + (($199 ^ 1) & 1) | 0; //@line 11101
     if (($$540$ | 0) > ($$5519$ph | 0) & ($$5519$ph | 0) > -5) {
      $$0479 = $5 + -1 | 0; //@line 11109
      $$2476 = $$540$ + -1 - $$5519$ph | 0; //@line 11109
     } else {
      $$0479 = $5 + -2 | 0; //@line 11113
      $$2476 = $$540$ + -1 | 0; //@line 11113
     }
     $267 = $4 & 8; //@line 11115
     if (!$267) {
      if ($$lcssa675) {
       $270 = HEAP32[$$7505 + -4 >> 2] | 0; //@line 11120
       if (!$270) {
        $$2529 = 9; //@line 11123
       } else {
        if (!(($270 >>> 0) % 10 | 0)) {
         $$1528617 = 0; //@line 11128
         $$3533616 = 10; //@line 11128
         while (1) {
          $$3533616 = $$3533616 * 10 | 0; //@line 11130
          $275 = $$1528617 + 1 | 0; //@line 11131
          if (($270 >>> 0) % ($$3533616 >>> 0) | 0 | 0) {
           $$2529 = $275; //@line 11137
           break;
          } else {
           $$1528617 = $275; //@line 11135
          }
         }
        } else {
         $$2529 = 0; //@line 11142
        }
       }
      } else {
       $$2529 = 9; //@line 11146
      }
      $284 = (($$7505 - $185 >> 2) * 9 | 0) + -9 | 0; //@line 11154
      if (($$0479 | 32 | 0) == 102) {
       $285 = $284 - $$2529 | 0; //@line 11156
       $$548 = ($285 | 0) > 0 ? $285 : 0; //@line 11158
       $$1480 = $$0479; //@line 11161
       $$3477 = ($$2476 | 0) < ($$548 | 0) ? $$2476 : $$548; //@line 11161
       $$pre$phi698Z2D = 0; //@line 11161
       break;
      } else {
       $289 = $284 + $$5519$ph - $$2529 | 0; //@line 11165
       $$550 = ($289 | 0) > 0 ? $289 : 0; //@line 11167
       $$1480 = $$0479; //@line 11170
       $$3477 = ($$2476 | 0) < ($$550 | 0) ? $$2476 : $$550; //@line 11170
       $$pre$phi698Z2D = 0; //@line 11170
       break;
      }
     } else {
      $$1480 = $$0479; //@line 11174
      $$3477 = $$2476; //@line 11174
      $$pre$phi698Z2D = $267; //@line 11174
     }
    } else {
     $$1480 = $5; //@line 11178
     $$3477 = $$540; //@line 11178
     $$pre$phi698Z2D = $4 & 8; //@line 11178
    }
   } while (0);
   $292 = $$3477 | $$pre$phi698Z2D; //@line 11181
   $294 = ($292 | 0) != 0 & 1; //@line 11183
   $296 = ($$1480 | 32 | 0) == 102; //@line 11185
   if ($296) {
    $$2513 = 0; //@line 11189
    $$pn = ($$5519$ph | 0) > 0 ? $$5519$ph : 0; //@line 11189
   } else {
    $300 = ($$5519$ph | 0) < 0 ? $259 : $$5519$ph; //@line 11192
    $303 = _fmt_u($300, (($300 | 0) < 0) << 31 >> 31, $11) | 0; //@line 11195
    $304 = $11; //@line 11196
    if (($304 - $303 | 0) < 2) {
     $$1512610 = $303; //@line 11201
     while (1) {
      $308 = $$1512610 + -1 | 0; //@line 11203
      HEAP8[$308 >> 0] = 48; //@line 11204
      if (($304 - $308 | 0) < 2) {
       $$1512610 = $308; //@line 11209
      } else {
       $$1512$lcssa = $308; //@line 11211
       break;
      }
     }
    } else {
     $$1512$lcssa = $303; //@line 11216
    }
    HEAP8[$$1512$lcssa + -1 >> 0] = ($$5519$ph >> 31 & 2) + 43; //@line 11223
    $318 = $$1512$lcssa + -2 | 0; //@line 11225
    HEAP8[$318 >> 0] = $$1480; //@line 11226
    $$2513 = $318; //@line 11229
    $$pn = $304 - $318 | 0; //@line 11229
   }
   $323 = $$0520 + 1 + $$3477 + $294 + $$pn | 0; //@line 11234
   _pad_676($0, 32, $2, $323, $4); //@line 11235
   _out_670($0, $$0521, $$0520); //@line 11236
   _pad_676($0, 48, $2, $323, $4 ^ 65536); //@line 11238
   if ($296) {
    $$0496$$9 = $$9$ph >>> 0 > $$561 >>> 0 ? $$561 : $$9$ph; //@line 11241
    $326 = $8 + 9 | 0; //@line 11242
    $327 = $326; //@line 11243
    $328 = $8 + 8 | 0; //@line 11244
    $$5493600 = $$0496$$9; //@line 11245
    do {
     $330 = _fmt_u(HEAP32[$$5493600 >> 2] | 0, 0, $326) | 0; //@line 11248
     if (($$5493600 | 0) == ($$0496$$9 | 0)) {
      if (($330 | 0) == ($326 | 0)) {
       HEAP8[$328 >> 0] = 48; //@line 11253
       $$1465 = $328; //@line 11254
      } else {
       $$1465 = $330; //@line 11256
      }
     } else {
      if ($330 >>> 0 > $8 >>> 0) {
       _memset($8 | 0, 48, $330 - $9 | 0) | 0; //@line 11263
       $$0464597 = $330; //@line 11264
       while (1) {
        $335 = $$0464597 + -1 | 0; //@line 11266
        if ($335 >>> 0 > $8 >>> 0) {
         $$0464597 = $335; //@line 11269
        } else {
         $$1465 = $335; //@line 11271
         break;
        }
       }
      } else {
       $$1465 = $330; //@line 11276
      }
     }
     _out_670($0, $$1465, $327 - $$1465 | 0); //@line 11281
     $$5493600 = $$5493600 + 4 | 0; //@line 11282
    } while ($$5493600 >>> 0 <= $$561 >>> 0);
    if ($292 | 0) {
     _out_670($0, 6367, 1); //@line 11292
    }
    if ($$5493600 >>> 0 < $$7505 >>> 0 & ($$3477 | 0) > 0) {
     $$4478593 = $$3477; //@line 11298
     $$6494592 = $$5493600; //@line 11298
     while (1) {
      $347 = _fmt_u(HEAP32[$$6494592 >> 2] | 0, 0, $326) | 0; //@line 11301
      if ($347 >>> 0 > $8 >>> 0) {
       _memset($8 | 0, 48, $347 - $9 | 0) | 0; //@line 11306
       $$0463587 = $347; //@line 11307
       while (1) {
        $351 = $$0463587 + -1 | 0; //@line 11309
        if ($351 >>> 0 > $8 >>> 0) {
         $$0463587 = $351; //@line 11312
        } else {
         $$0463$lcssa = $351; //@line 11314
         break;
        }
       }
      } else {
       $$0463$lcssa = $347; //@line 11319
      }
      _out_670($0, $$0463$lcssa, ($$4478593 | 0) < 9 ? $$4478593 : 9); //@line 11323
      $$6494592 = $$6494592 + 4 | 0; //@line 11324
      $356 = $$4478593 + -9 | 0; //@line 11325
      if (!($$6494592 >>> 0 < $$7505 >>> 0 & ($$4478593 | 0) > 9)) {
       $$4478$lcssa = $356; //@line 11332
       break;
      } else {
       $$4478593 = $356; //@line 11330
      }
     }
    } else {
     $$4478$lcssa = $$3477; //@line 11337
    }
    _pad_676($0, 48, $$4478$lcssa + 9 | 0, 9, 0); //@line 11340
   } else {
    $$7505$ = $$lcssa675 ? $$7505 : $$9$ph + 4 | 0; //@line 11343
    if (($$3477 | 0) > -1) {
     $363 = $8 + 9 | 0; //@line 11346
     $364 = ($$pre$phi698Z2D | 0) == 0; //@line 11347
     $365 = $363; //@line 11348
     $366 = 0 - $9 | 0; //@line 11349
     $367 = $8 + 8 | 0; //@line 11350
     $$5605 = $$3477; //@line 11351
     $$7495604 = $$9$ph; //@line 11351
     while (1) {
      $369 = _fmt_u(HEAP32[$$7495604 >> 2] | 0, 0, $363) | 0; //@line 11354
      if (($369 | 0) == ($363 | 0)) {
       HEAP8[$367 >> 0] = 48; //@line 11357
       $$0 = $367; //@line 11358
      } else {
       $$0 = $369; //@line 11360
      }
      do {
       if (($$7495604 | 0) == ($$9$ph | 0)) {
        $375 = $$0 + 1 | 0; //@line 11365
        _out_670($0, $$0, 1); //@line 11366
        if ($364 & ($$5605 | 0) < 1) {
         $$2 = $375; //@line 11370
         break;
        }
        _out_670($0, 6367, 1); //@line 11373
        $$2 = $375; //@line 11374
       } else {
        if ($$0 >>> 0 <= $8 >>> 0) {
         $$2 = $$0; //@line 11378
         break;
        }
        _memset($8 | 0, 48, $$0 + $366 | 0) | 0; //@line 11383
        $$1601 = $$0; //@line 11384
        while (1) {
         $373 = $$1601 + -1 | 0; //@line 11386
         if ($373 >>> 0 > $8 >>> 0) {
          $$1601 = $373; //@line 11389
         } else {
          $$2 = $373; //@line 11391
          break;
         }
        }
       }
      } while (0);
      $378 = $365 - $$2 | 0; //@line 11398
      _out_670($0, $$2, ($$5605 | 0) > ($378 | 0) ? $378 : $$5605); //@line 11401
      $381 = $$5605 - $378 | 0; //@line 11402
      $$7495604 = $$7495604 + 4 | 0; //@line 11403
      if (!($$7495604 >>> 0 < $$7505$ >>> 0 & ($381 | 0) > -1)) {
       $$5$lcssa = $381; //@line 11410
       break;
      } else {
       $$5605 = $381; //@line 11408
      }
     }
    } else {
     $$5$lcssa = $$3477; //@line 11415
    }
    _pad_676($0, 48, $$5$lcssa + 18 | 0, 18, 0); //@line 11418
    _out_670($0, $$2513, $11 - $$2513 | 0); //@line 11422
   }
   _pad_676($0, 32, $2, $323, $4 ^ 8192); //@line 11425
   $$sink560 = $323; //@line 11426
  }
 } while (0);
 STACKTOP = sp; //@line 11431
 return (($$sink560 | 0) < ($2 | 0) ? $2 : $$sink560) | 0; //@line 11431
}
function _printf_core($0, $1, $2, $3, $4) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 var $$$5 = 0, $$0 = 0, $$0228 = 0, $$0229316 = 0, $$0232 = 0, $$0235 = 0, $$0237 = 0, $$0240$lcssa = 0, $$0240$lcssa356 = 0, $$0240315 = 0, $$0243 = 0, $$0247 = 0, $$0249$lcssa = 0, $$0249303 = 0, $$0252 = 0, $$0253 = 0, $$0254 = 0, $$0259 = 0, $$0262$lcssa = 0, $$0262309 = 0, $$0269 = 0, $$1 = 0, $$1230327 = 0, $$1233 = 0, $$1236 = 0, $$1238 = 0, $$1241326 = 0, $$1244314 = 0, $$1248 = 0, $$1255 = 0, $$1260 = 0, $$1263 = 0, $$1263$ = 0, $$1270 = 0, $$2 = 0, $$2234 = 0, $$2239 = 0, $$2242$lcssa = 0, $$2242302 = 0, $$2245 = 0, $$2251 = 0, $$2256 = 0, $$2261 = 0, $$2271 = 0, $$3265 = 0, $$3272 = 0, $$3300 = 0, $$4258354 = 0, $$4266 = 0, $$5 = 0, $$6268 = 0, $$lcssa291 = 0, $$lcssa292 = 0, $$pre342 = 0, $$pre345 = 0, $$pre348 = 0, $$sink = 0, $10 = 0, $105 = 0, $106 = 0, $109 = 0, $11 = 0, $112 = 0, $115 = 0, $12 = 0, $125 = 0, $129 = 0, $13 = 0, $14 = 0, $140 = 0, $144 = 0, $151 = 0, $152 = 0, $154 = 0, $156 = 0, $158 = 0, $167 = 0, $168 = 0, $173 = 0, $176 = 0, $181 = 0, $182 = 0, $187 = 0, $189 = 0, $196 = 0, $197 = 0, $20 = 0, $208 = 0, $21 = 0, $220 = 0, $227 = 0, $229 = 0, $23 = 0, $232 = 0, $234 = 0, $24 = 0, $242 = 0, $244 = 0, $247 = 0, $248 = 0, $25 = 0, $252 = 0, $256 = 0, $258 = 0, $261 = 0, $263 = 0, $264 = 0, $265 = 0, $27 = 0, $275 = 0, $276 = 0, $281 = 0, $283 = 0, $284 = 0, $290 = 0, $30 = 0, $302 = 0, $305 = 0, $306 = 0, $318 = 0, $320 = 0, $325 = 0, $329 = 0, $331 = 0, $343 = 0, $345 = 0, $352 = 0, $356 = 0, $36 = 0, $363 = 0, $364 = 0, $365 = 0, $43 = 0, $5 = 0, $51 = 0, $52 = 0, $54 = 0, $6 = 0, $60 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0, $68 = 0, $7 = 0, $79 = 0, $8 = 0, $83 = 0, $9 = 0, $or$cond = 0, $or$cond278 = 0, $storemerge274 = 0, label = 0, sp = 0, $158$looptemp = 0;
 sp = STACKTOP; //@line 9109
 STACKTOP = STACKTOP + 64 | 0; //@line 9110
 $5 = sp + 16 | 0; //@line 9111
 $6 = sp; //@line 9112
 $7 = sp + 24 | 0; //@line 9113
 $8 = sp + 8 | 0; //@line 9114
 $9 = sp + 20 | 0; //@line 9115
 HEAP32[$5 >> 2] = $1; //@line 9116
 $10 = ($0 | 0) != 0; //@line 9117
 $11 = $7 + 40 | 0; //@line 9118
 $12 = $11; //@line 9119
 $13 = $7 + 39 | 0; //@line 9120
 $14 = $8 + 4 | 0; //@line 9121
 $$0243 = 0; //@line 9122
 $$0247 = 0; //@line 9122
 $$0269 = 0; //@line 9122
 L1 : while (1) {
  do {
   if (($$0247 | 0) > -1) {
    if (($$0243 | 0) > (2147483647 - $$0247 | 0)) {
     HEAP32[(___errno_location() | 0) >> 2] = 75; //@line 9131
     $$1248 = -1; //@line 9132
     break;
    } else {
     $$1248 = $$0243 + $$0247 | 0; //@line 9136
     break;
    }
   } else {
    $$1248 = $$0247; //@line 9140
   }
  } while (0);
  $20 = HEAP32[$5 >> 2] | 0; //@line 9143
  $21 = HEAP8[$20 >> 0] | 0; //@line 9144
  if (!($21 << 24 >> 24)) {
   label = 88; //@line 9147
   break;
  } else {
   $23 = $21; //@line 9150
   $25 = $20; //@line 9150
  }
  L9 : while (1) {
   switch ($23 << 24 >> 24) {
   case 37:
    {
     $$0249303 = $25; //@line 9155
     $27 = $25; //@line 9155
     label = 9; //@line 9156
     break L9;
     break;
    }
   case 0:
    {
     $$0249$lcssa = $25; //@line 9161
     break L9;
     break;
    }
   default:
    {}
   }
   $24 = $25 + 1 | 0; //@line 9168
   HEAP32[$5 >> 2] = $24; //@line 9169
   $23 = HEAP8[$24 >> 0] | 0; //@line 9171
   $25 = $24; //@line 9171
  }
  L12 : do {
   if ((label | 0) == 9) {
    while (1) {
     label = 0; //@line 9176
     if ((HEAP8[$27 + 1 >> 0] | 0) != 37) {
      $$0249$lcssa = $$0249303; //@line 9181
      break L12;
     }
     $30 = $$0249303 + 1 | 0; //@line 9184
     $27 = $27 + 2 | 0; //@line 9185
     HEAP32[$5 >> 2] = $27; //@line 9186
     if ((HEAP8[$27 >> 0] | 0) != 37) {
      $$0249$lcssa = $30; //@line 9193
      break;
     } else {
      $$0249303 = $30; //@line 9190
      label = 9; //@line 9191
     }
    }
   }
  } while (0);
  $36 = $$0249$lcssa - $20 | 0; //@line 9201
  if ($10) {
   _out_670($0, $20, $36); //@line 9203
  }
  if ($36 | 0) {
   $$0243 = $36; //@line 9207
   $$0247 = $$1248; //@line 9207
   continue;
  }
  $43 = (_isdigit(HEAP8[(HEAP32[$5 >> 2] | 0) + 1 >> 0] | 0) | 0) == 0; //@line 9215
  $$pre342 = HEAP32[$5 >> 2] | 0; //@line 9216
  if ($43) {
   $$0253 = -1; //@line 9218
   $$1270 = $$0269; //@line 9218
   $$sink = 1; //@line 9218
  } else {
   if ((HEAP8[$$pre342 + 2 >> 0] | 0) == 36) {
    $$0253 = (HEAP8[$$pre342 + 1 >> 0] | 0) + -48 | 0; //@line 9228
    $$1270 = 1; //@line 9228
    $$sink = 3; //@line 9228
   } else {
    $$0253 = -1; //@line 9230
    $$1270 = $$0269; //@line 9230
    $$sink = 1; //@line 9230
   }
  }
  $51 = $$pre342 + $$sink | 0; //@line 9233
  HEAP32[$5 >> 2] = $51; //@line 9234
  $52 = HEAP8[$51 >> 0] | 0; //@line 9235
  $54 = ($52 << 24 >> 24) + -32 | 0; //@line 9237
  if ($54 >>> 0 > 31 | (1 << $54 & 75913 | 0) == 0) {
   $$0262$lcssa = 0; //@line 9244
   $$lcssa291 = $52; //@line 9244
   $$lcssa292 = $51; //@line 9244
  } else {
   $$0262309 = 0; //@line 9246
   $60 = $52; //@line 9246
   $65 = $51; //@line 9246
   while (1) {
    $63 = 1 << ($60 << 24 >> 24) + -32 | $$0262309; //@line 9251
    $64 = $65 + 1 | 0; //@line 9252
    HEAP32[$5 >> 2] = $64; //@line 9253
    $66 = HEAP8[$64 >> 0] | 0; //@line 9254
    $68 = ($66 << 24 >> 24) + -32 | 0; //@line 9256
    if ($68 >>> 0 > 31 | (1 << $68 & 75913 | 0) == 0) {
     $$0262$lcssa = $63; //@line 9263
     $$lcssa291 = $66; //@line 9263
     $$lcssa292 = $64; //@line 9263
     break;
    } else {
     $$0262309 = $63; //@line 9266
     $60 = $66; //@line 9266
     $65 = $64; //@line 9266
    }
   }
  }
  if ($$lcssa291 << 24 >> 24 == 42) {
   if (!(_isdigit(HEAP8[$$lcssa292 + 1 >> 0] | 0) | 0)) {
    label = 23; //@line 9278
   } else {
    $79 = HEAP32[$5 >> 2] | 0; //@line 9280
    if ((HEAP8[$79 + 2 >> 0] | 0) == 36) {
     $83 = $79 + 1 | 0; //@line 9285
     HEAP32[$4 + ((HEAP8[$83 >> 0] | 0) + -48 << 2) >> 2] = 10; //@line 9290
     $$0259 = HEAP32[$3 + ((HEAP8[$83 >> 0] | 0) + -48 << 3) >> 2] | 0; //@line 9302
     $$2271 = 1; //@line 9302
     $storemerge274 = $79 + 3 | 0; //@line 9302
    } else {
     label = 23; //@line 9304
    }
   }
   if ((label | 0) == 23) {
    label = 0; //@line 9308
    if ($$1270 | 0) {
     $$0 = -1; //@line 9311
     break;
    }
    if ($10) {
     $105 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 9326
     $106 = HEAP32[$105 >> 2] | 0; //@line 9327
     HEAP32[$2 >> 2] = $105 + 4; //@line 9329
     $363 = $106; //@line 9330
    } else {
     $363 = 0; //@line 9332
    }
    $$0259 = $363; //@line 9336
    $$2271 = 0; //@line 9336
    $storemerge274 = (HEAP32[$5 >> 2] | 0) + 1 | 0; //@line 9336
   }
   HEAP32[$5 >> 2] = $storemerge274; //@line 9338
   $109 = ($$0259 | 0) < 0; //@line 9339
   $$1260 = $109 ? 0 - $$0259 | 0 : $$0259; //@line 9344
   $$1263 = $109 ? $$0262$lcssa | 8192 : $$0262$lcssa; //@line 9344
   $$3272 = $$2271; //@line 9344
   $115 = $storemerge274; //@line 9344
  } else {
   $112 = _getint_671($5) | 0; //@line 9346
   if (($112 | 0) < 0) {
    $$0 = -1; //@line 9349
    break;
   }
   $$1260 = $112; //@line 9353
   $$1263 = $$0262$lcssa; //@line 9353
   $$3272 = $$1270; //@line 9353
   $115 = HEAP32[$5 >> 2] | 0; //@line 9353
  }
  do {
   if ((HEAP8[$115 >> 0] | 0) == 46) {
    if ((HEAP8[$115 + 1 >> 0] | 0) != 42) {
     HEAP32[$5 >> 2] = $115 + 1; //@line 9364
     $156 = _getint_671($5) | 0; //@line 9365
     $$0254 = $156; //@line 9367
     $$pre345 = HEAP32[$5 >> 2] | 0; //@line 9367
     break;
    }
    if (_isdigit(HEAP8[$115 + 2 >> 0] | 0) | 0) {
     $125 = HEAP32[$5 >> 2] | 0; //@line 9376
     if ((HEAP8[$125 + 3 >> 0] | 0) == 36) {
      $129 = $125 + 2 | 0; //@line 9381
      HEAP32[$4 + ((HEAP8[$129 >> 0] | 0) + -48 << 2) >> 2] = 10; //@line 9386
      $140 = HEAP32[$3 + ((HEAP8[$129 >> 0] | 0) + -48 << 3) >> 2] | 0; //@line 9393
      $144 = $125 + 4 | 0; //@line 9397
      HEAP32[$5 >> 2] = $144; //@line 9398
      $$0254 = $140; //@line 9399
      $$pre345 = $144; //@line 9399
      break;
     }
    }
    if ($$3272 | 0) {
     $$0 = -1; //@line 9405
     break L1;
    }
    if ($10) {
     $151 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 9420
     $152 = HEAP32[$151 >> 2] | 0; //@line 9421
     HEAP32[$2 >> 2] = $151 + 4; //@line 9423
     $364 = $152; //@line 9424
    } else {
     $364 = 0; //@line 9426
    }
    $154 = (HEAP32[$5 >> 2] | 0) + 2 | 0; //@line 9429
    HEAP32[$5 >> 2] = $154; //@line 9430
    $$0254 = $364; //@line 9431
    $$pre345 = $154; //@line 9431
   } else {
    $$0254 = -1; //@line 9433
    $$pre345 = $115; //@line 9433
   }
  } while (0);
  $$0252 = 0; //@line 9436
  $158 = $$pre345; //@line 9436
  while (1) {
   if (((HEAP8[$158 >> 0] | 0) + -65 | 0) >>> 0 > 57) {
    $$0 = -1; //@line 9443
    break L1;
   }
   $158$looptemp = $158;
   $158 = $158 + 1 | 0; //@line 9446
   HEAP32[$5 >> 2] = $158; //@line 9447
   $167 = HEAP8[(HEAP8[$158$looptemp >> 0] | 0) + -65 + (5835 + ($$0252 * 58 | 0)) >> 0] | 0; //@line 9452
   $168 = $167 & 255; //@line 9453
   if (($168 + -1 | 0) >>> 0 >= 8) {
    break;
   } else {
    $$0252 = $168; //@line 9457
   }
  }
  if (!($167 << 24 >> 24)) {
   $$0 = -1; //@line 9464
   break;
  }
  $173 = ($$0253 | 0) > -1; //@line 9468
  do {
   if ($167 << 24 >> 24 == 19) {
    if ($173) {
     $$0 = -1; //@line 9472
     break L1;
    } else {
     label = 50; //@line 9475
    }
   } else {
    if ($173) {
     HEAP32[$4 + ($$0253 << 2) >> 2] = $168; //@line 9480
     $176 = $3 + ($$0253 << 3) | 0; //@line 9482
     $181 = HEAP32[$176 + 4 >> 2] | 0; //@line 9487
     $182 = $6; //@line 9488
     HEAP32[$182 >> 2] = HEAP32[$176 >> 2]; //@line 9490
     HEAP32[$182 + 4 >> 2] = $181; //@line 9493
     label = 50; //@line 9494
     break;
    }
    if (!$10) {
     $$0 = 0; //@line 9498
     break L1;
    }
    _pop_arg_673($6, $168, $2); //@line 9501
    $187 = HEAP32[$5 >> 2] | 0; //@line 9503
   }
  } while (0);
  if ((label | 0) == 50) {
   label = 0; //@line 9507
   if ($10) {
    $187 = $158; //@line 9509
   } else {
    $$0243 = 0; //@line 9511
    $$0247 = $$1248; //@line 9511
    $$0269 = $$3272; //@line 9511
    continue;
   }
  }
  $189 = HEAP8[$187 + -1 >> 0] | 0; //@line 9517
  $$0235 = ($$0252 | 0) != 0 & ($189 & 15 | 0) == 3 ? $189 & -33 : $189; //@line 9523
  $196 = $$1263 & -65537; //@line 9526
  $$1263$ = ($$1263 & 8192 | 0) == 0 ? $$1263 : $196; //@line 9527
  L73 : do {
   switch ($$0235 | 0) {
   case 110:
    {
     switch (($$0252 & 255) << 24 >> 24) {
     case 0:
      {
       HEAP32[HEAP32[$6 >> 2] >> 2] = $$1248; //@line 9535
       $$0243 = 0; //@line 9536
       $$0247 = $$1248; //@line 9536
       $$0269 = $$3272; //@line 9536
       continue L1;
       break;
      }
     case 1:
      {
       HEAP32[HEAP32[$6 >> 2] >> 2] = $$1248; //@line 9542
       $$0243 = 0; //@line 9543
       $$0247 = $$1248; //@line 9543
       $$0269 = $$3272; //@line 9543
       continue L1;
       break;
      }
     case 2:
      {
       $208 = HEAP32[$6 >> 2] | 0; //@line 9551
       HEAP32[$208 >> 2] = $$1248; //@line 9553
       HEAP32[$208 + 4 >> 2] = (($$1248 | 0) < 0) << 31 >> 31; //@line 9556
       $$0243 = 0; //@line 9557
       $$0247 = $$1248; //@line 9557
       $$0269 = $$3272; //@line 9557
       continue L1;
       break;
      }
     case 3:
      {
       HEAP16[HEAP32[$6 >> 2] >> 1] = $$1248; //@line 9564
       $$0243 = 0; //@line 9565
       $$0247 = $$1248; //@line 9565
       $$0269 = $$3272; //@line 9565
       continue L1;
       break;
      }
     case 4:
      {
       HEAP8[HEAP32[$6 >> 2] >> 0] = $$1248; //@line 9572
       $$0243 = 0; //@line 9573
       $$0247 = $$1248; //@line 9573
       $$0269 = $$3272; //@line 9573
       continue L1;
       break;
      }
     case 6:
      {
       HEAP32[HEAP32[$6 >> 2] >> 2] = $$1248; //@line 9579
       $$0243 = 0; //@line 9580
       $$0247 = $$1248; //@line 9580
       $$0269 = $$3272; //@line 9580
       continue L1;
       break;
      }
     case 7:
      {
       $220 = HEAP32[$6 >> 2] | 0; //@line 9588
       HEAP32[$220 >> 2] = $$1248; //@line 9590
       HEAP32[$220 + 4 >> 2] = (($$1248 | 0) < 0) << 31 >> 31; //@line 9593
       $$0243 = 0; //@line 9594
       $$0247 = $$1248; //@line 9594
       $$0269 = $$3272; //@line 9594
       continue L1;
       break;
      }
     default:
      {
       $$0243 = 0; //@line 9599
       $$0247 = $$1248; //@line 9599
       $$0269 = $$3272; //@line 9599
       continue L1;
      }
     }
     break;
    }
   case 112:
    {
     $$1236 = 120; //@line 9609
     $$1255 = $$0254 >>> 0 > 8 ? $$0254 : 8; //@line 9609
     $$3265 = $$1263$ | 8; //@line 9609
     label = 62; //@line 9610
     break;
    }
   case 88:
   case 120:
    {
     $$1236 = $$0235; //@line 9614
     $$1255 = $$0254; //@line 9614
     $$3265 = $$1263$; //@line 9614
     label = 62; //@line 9615
     break;
    }
   case 111:
    {
     $242 = $6; //@line 9619
     $244 = HEAP32[$242 >> 2] | 0; //@line 9621
     $247 = HEAP32[$242 + 4 >> 2] | 0; //@line 9624
     $248 = _fmt_o($244, $247, $11) | 0; //@line 9625
     $252 = $12 - $248 | 0; //@line 9629
     $$0228 = $248; //@line 9634
     $$1233 = 0; //@line 9634
     $$1238 = 6299; //@line 9634
     $$2256 = ($$1263$ & 8 | 0) == 0 | ($$0254 | 0) > ($252 | 0) ? $$0254 : $252 + 1 | 0; //@line 9634
     $$4266 = $$1263$; //@line 9634
     $281 = $244; //@line 9634
     $283 = $247; //@line 9634
     label = 68; //@line 9635
     break;
    }
   case 105:
   case 100:
    {
     $256 = $6; //@line 9639
     $258 = HEAP32[$256 >> 2] | 0; //@line 9641
     $261 = HEAP32[$256 + 4 >> 2] | 0; //@line 9644
     if (($261 | 0) < 0) {
      $263 = _i64Subtract(0, 0, $258 | 0, $261 | 0) | 0; //@line 9647
      $264 = tempRet0; //@line 9648
      $265 = $6; //@line 9649
      HEAP32[$265 >> 2] = $263; //@line 9651
      HEAP32[$265 + 4 >> 2] = $264; //@line 9654
      $$0232 = 1; //@line 9655
      $$0237 = 6299; //@line 9655
      $275 = $263; //@line 9655
      $276 = $264; //@line 9655
      label = 67; //@line 9656
      break L73;
     } else {
      $$0232 = ($$1263$ & 2049 | 0) != 0 & 1; //@line 9668
      $$0237 = ($$1263$ & 2048 | 0) == 0 ? ($$1263$ & 1 | 0) == 0 ? 6299 : 6301 : 6300; //@line 9668
      $275 = $258; //@line 9668
      $276 = $261; //@line 9668
      label = 67; //@line 9669
      break L73;
     }
     break;
    }
   case 117:
    {
     $197 = $6; //@line 9675
     $$0232 = 0; //@line 9681
     $$0237 = 6299; //@line 9681
     $275 = HEAP32[$197 >> 2] | 0; //@line 9681
     $276 = HEAP32[$197 + 4 >> 2] | 0; //@line 9681
     label = 67; //@line 9682
     break;
    }
   case 99:
    {
     HEAP8[$13 >> 0] = HEAP32[$6 >> 2]; //@line 9693
     $$2 = $13; //@line 9694
     $$2234 = 0; //@line 9694
     $$2239 = 6299; //@line 9694
     $$2251 = $11; //@line 9694
     $$5 = 1; //@line 9694
     $$6268 = $196; //@line 9694
     break;
    }
   case 109:
    {
     $$1 = _strerror(HEAP32[(___errno_location() | 0) >> 2] | 0) | 0; //@line 9701
     label = 72; //@line 9702
     break;
    }
   case 115:
    {
     $302 = HEAP32[$6 >> 2] | 0; //@line 9706
     $$1 = $302 | 0 ? $302 : 6309; //@line 9709
     label = 72; //@line 9710
     break;
    }
   case 67:
    {
     HEAP32[$8 >> 2] = HEAP32[$6 >> 2]; //@line 9720
     HEAP32[$14 >> 2] = 0; //@line 9721
     HEAP32[$6 >> 2] = $8; //@line 9722
     $$4258354 = -1; //@line 9723
     $365 = $8; //@line 9723
     label = 76; //@line 9724
     break;
    }
   case 83:
    {
     $$pre348 = HEAP32[$6 >> 2] | 0; //@line 9728
     if (!$$0254) {
      _pad_676($0, 32, $$1260, 0, $$1263$); //@line 9731
      $$0240$lcssa356 = 0; //@line 9732
      label = 85; //@line 9733
     } else {
      $$4258354 = $$0254; //@line 9735
      $365 = $$pre348; //@line 9735
      label = 76; //@line 9736
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
     $$0243 = _fmt_fp($0, +HEAPF64[$6 >> 3], $$1260, $$0254, $$1263$, $$0235) | 0; //@line 9743
     $$0247 = $$1248; //@line 9743
     $$0269 = $$3272; //@line 9743
     continue L1;
     break;
    }
   default:
    {
     $$2 = $20; //@line 9748
     $$2234 = 0; //@line 9748
     $$2239 = 6299; //@line 9748
     $$2251 = $11; //@line 9748
     $$5 = $$0254; //@line 9748
     $$6268 = $$1263$; //@line 9748
    }
   }
  } while (0);
  L97 : do {
   if ((label | 0) == 62) {
    label = 0; //@line 9754
    $227 = $6; //@line 9755
    $229 = HEAP32[$227 >> 2] | 0; //@line 9757
    $232 = HEAP32[$227 + 4 >> 2] | 0; //@line 9760
    $234 = _fmt_x($229, $232, $11, $$1236 & 32) | 0; //@line 9762
    $or$cond278 = ($$3265 & 8 | 0) == 0 | ($229 | 0) == 0 & ($232 | 0) == 0; //@line 9768
    $$0228 = $234; //@line 9773
    $$1233 = $or$cond278 ? 0 : 2; //@line 9773
    $$1238 = $or$cond278 ? 6299 : 6299 + ($$1236 >> 4) | 0; //@line 9773
    $$2256 = $$1255; //@line 9773
    $$4266 = $$3265; //@line 9773
    $281 = $229; //@line 9773
    $283 = $232; //@line 9773
    label = 68; //@line 9774
   } else if ((label | 0) == 67) {
    label = 0; //@line 9777
    $$0228 = _fmt_u($275, $276, $11) | 0; //@line 9779
    $$1233 = $$0232; //@line 9779
    $$1238 = $$0237; //@line 9779
    $$2256 = $$0254; //@line 9779
    $$4266 = $$1263$; //@line 9779
    $281 = $275; //@line 9779
    $283 = $276; //@line 9779
    label = 68; //@line 9780
   } else if ((label | 0) == 72) {
    label = 0; //@line 9783
    $305 = _memchr($$1, 0, $$0254) | 0; //@line 9784
    $306 = ($305 | 0) == 0; //@line 9785
    $$2 = $$1; //@line 9792
    $$2234 = 0; //@line 9792
    $$2239 = 6299; //@line 9792
    $$2251 = $306 ? $$1 + $$0254 | 0 : $305; //@line 9792
    $$5 = $306 ? $$0254 : $305 - $$1 | 0; //@line 9792
    $$6268 = $196; //@line 9792
   } else if ((label | 0) == 76) {
    label = 0; //@line 9795
    $$0229316 = $365; //@line 9796
    $$0240315 = 0; //@line 9796
    $$1244314 = 0; //@line 9796
    while (1) {
     $318 = HEAP32[$$0229316 >> 2] | 0; //@line 9798
     if (!$318) {
      $$0240$lcssa = $$0240315; //@line 9801
      $$2245 = $$1244314; //@line 9801
      break;
     }
     $320 = _wctomb($9, $318) | 0; //@line 9804
     if (($320 | 0) < 0 | $320 >>> 0 > ($$4258354 - $$0240315 | 0) >>> 0) {
      $$0240$lcssa = $$0240315; //@line 9810
      $$2245 = $320; //@line 9810
      break;
     }
     $325 = $320 + $$0240315 | 0; //@line 9814
     if ($$4258354 >>> 0 > $325 >>> 0) {
      $$0229316 = $$0229316 + 4 | 0; //@line 9817
      $$0240315 = $325; //@line 9817
      $$1244314 = $320; //@line 9817
     } else {
      $$0240$lcssa = $325; //@line 9819
      $$2245 = $320; //@line 9819
      break;
     }
    }
    if (($$2245 | 0) < 0) {
     $$0 = -1; //@line 9825
     break L1;
    }
    _pad_676($0, 32, $$1260, $$0240$lcssa, $$1263$); //@line 9828
    if (!$$0240$lcssa) {
     $$0240$lcssa356 = 0; //@line 9831
     label = 85; //@line 9832
    } else {
     $$1230327 = $365; //@line 9834
     $$1241326 = 0; //@line 9834
     while (1) {
      $329 = HEAP32[$$1230327 >> 2] | 0; //@line 9836
      if (!$329) {
       $$0240$lcssa356 = $$0240$lcssa; //@line 9839
       label = 85; //@line 9840
       break L97;
      }
      $331 = _wctomb($9, $329) | 0; //@line 9843
      $$1241326 = $331 + $$1241326 | 0; //@line 9844
      if (($$1241326 | 0) > ($$0240$lcssa | 0)) {
       $$0240$lcssa356 = $$0240$lcssa; //@line 9847
       label = 85; //@line 9848
       break L97;
      }
      _out_670($0, $9, $331); //@line 9852
      if ($$1241326 >>> 0 >= $$0240$lcssa >>> 0) {
       $$0240$lcssa356 = $$0240$lcssa; //@line 9857
       label = 85; //@line 9858
       break;
      } else {
       $$1230327 = $$1230327 + 4 | 0; //@line 9855
      }
     }
    }
   }
  } while (0);
  if ((label | 0) == 68) {
   label = 0; //@line 9866
   $284 = ($281 | 0) != 0 | ($283 | 0) != 0; //@line 9872
   $or$cond = ($$2256 | 0) != 0 | $284; //@line 9874
   $290 = $12 - $$0228 + (($284 ^ 1) & 1) | 0; //@line 9879
   $$2 = $or$cond ? $$0228 : $11; //@line 9884
   $$2234 = $$1233; //@line 9884
   $$2239 = $$1238; //@line 9884
   $$2251 = $11; //@line 9884
   $$5 = $or$cond ? ($$2256 | 0) > ($290 | 0) ? $$2256 : $290 : $$2256; //@line 9884
   $$6268 = ($$2256 | 0) > -1 ? $$4266 & -65537 : $$4266; //@line 9884
  } else if ((label | 0) == 85) {
   label = 0; //@line 9887
   _pad_676($0, 32, $$1260, $$0240$lcssa356, $$1263$ ^ 8192); //@line 9889
   $$0243 = ($$1260 | 0) > ($$0240$lcssa356 | 0) ? $$1260 : $$0240$lcssa356; //@line 9892
   $$0247 = $$1248; //@line 9892
   $$0269 = $$3272; //@line 9892
   continue;
  }
  $343 = $$2251 - $$2 | 0; //@line 9897
  $$$5 = ($$5 | 0) < ($343 | 0) ? $343 : $$5; //@line 9899
  $345 = $$$5 + $$2234 | 0; //@line 9900
  $$2261 = ($$1260 | 0) < ($345 | 0) ? $345 : $$1260; //@line 9902
  _pad_676($0, 32, $$2261, $345, $$6268); //@line 9903
  _out_670($0, $$2239, $$2234); //@line 9904
  _pad_676($0, 48, $$2261, $345, $$6268 ^ 65536); //@line 9906
  _pad_676($0, 48, $$$5, $343, 0); //@line 9907
  _out_670($0, $$2, $343); //@line 9908
  _pad_676($0, 32, $$2261, $345, $$6268 ^ 8192); //@line 9910
  $$0243 = $$2261; //@line 9911
  $$0247 = $$1248; //@line 9911
  $$0269 = $$3272; //@line 9911
 }
 L116 : do {
  if ((label | 0) == 88) {
   if (!$0) {
    if (!$$0269) {
     $$0 = 0; //@line 9919
    } else {
     $$2242302 = 1; //@line 9921
     while (1) {
      $352 = HEAP32[$4 + ($$2242302 << 2) >> 2] | 0; //@line 9924
      if (!$352) {
       $$2242$lcssa = $$2242302; //@line 9927
       break;
      }
      _pop_arg_673($3 + ($$2242302 << 3) | 0, $352, $2); //@line 9931
      $356 = $$2242302 + 1 | 0; //@line 9932
      if (($$2242302 | 0) < 9) {
       $$2242302 = $356; //@line 9935
      } else {
       $$2242$lcssa = $356; //@line 9937
       break;
      }
     }
     if (($$2242$lcssa | 0) < 10) {
      $$3300 = $$2242$lcssa; //@line 9943
      while (1) {
       if (HEAP32[$4 + ($$3300 << 2) >> 2] | 0) {
        $$0 = -1; //@line 9949
        break L116;
       }
       if (($$3300 | 0) < 9) {
        $$3300 = $$3300 + 1 | 0; //@line 9955
       } else {
        $$0 = 1; //@line 9957
        break;
       }
      }
     } else {
      $$0 = 1; //@line 9962
     }
    }
   } else {
    $$0 = $$1248; //@line 9966
   }
  }
 } while (0);
 STACKTOP = sp; //@line 9970
 return $$0 | 0; //@line 9970
}
function _main() {
 var $$027 = 0, $$1 = 0, $122 = 0, $51 = 0, $81 = 0, $AsyncCtx = 0, $AsyncCtx13 = 0, $AsyncCtx17 = 0, $AsyncCtx21 = 0, $AsyncCtx25 = 0, $AsyncCtx29 = 0, $AsyncCtx33 = 0, $AsyncCtx37 = 0, $AsyncCtx41 = 0, $AsyncCtx44 = 0, $AsyncCtx48 = 0, $AsyncCtx51 = 0, $AsyncCtx54 = 0, $AsyncCtx57 = 0, $AsyncCtx9 = 0, $bitmSan3$byval_copy76 = 0, $vararg_buffer = 0, $vararg_buffer1 = 0, $vararg_buffer3 = 0, $vararg_buffer5 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 3638
 STACKTOP = STACKTOP + 48 | 0; //@line 3639
 $bitmSan3$byval_copy76 = sp + 32 | 0; //@line 3640
 $vararg_buffer5 = sp + 24 | 0; //@line 3641
 $vararg_buffer3 = sp + 16 | 0; //@line 3642
 $vararg_buffer1 = sp + 8 | 0; //@line 3643
 $vararg_buffer = sp; //@line 3644
 $AsyncCtx13 = _emscripten_alloc_async_context(36, sp) | 0; //@line 3645
 _puts(5733) | 0; //@line 3646
 if (___async) {
  HEAP32[$AsyncCtx13 >> 2] = 141; //@line 3649
  HEAP32[$AsyncCtx13 + 4 >> 2] = $vararg_buffer; //@line 3651
  HEAP32[$AsyncCtx13 + 8 >> 2] = $vararg_buffer; //@line 3653
  HEAP32[$AsyncCtx13 + 12 >> 2] = $vararg_buffer1; //@line 3655
  HEAP32[$AsyncCtx13 + 16 >> 2] = $vararg_buffer1; //@line 3657
  HEAP32[$AsyncCtx13 + 20 >> 2] = $vararg_buffer3; //@line 3659
  HEAP32[$AsyncCtx13 + 24 >> 2] = $vararg_buffer3; //@line 3661
  HEAP32[$AsyncCtx13 + 28 >> 2] = $vararg_buffer5; //@line 3663
  HEAP32[$AsyncCtx13 + 32 >> 2] = $vararg_buffer5; //@line 3665
  sp = STACKTOP; //@line 3666
  STACKTOP = sp; //@line 3667
  return 0; //@line 3667
 }
 _emscripten_free_async_context($AsyncCtx13 | 0); //@line 3669
 $AsyncCtx9 = _emscripten_alloc_async_context(36, sp) | 0; //@line 3670
 _puts(5755) | 0; //@line 3671
 if (___async) {
  HEAP32[$AsyncCtx9 >> 2] = 142; //@line 3674
  HEAP32[$AsyncCtx9 + 4 >> 2] = $vararg_buffer; //@line 3676
  HEAP32[$AsyncCtx9 + 8 >> 2] = $vararg_buffer; //@line 3678
  HEAP32[$AsyncCtx9 + 12 >> 2] = $vararg_buffer1; //@line 3680
  HEAP32[$AsyncCtx9 + 16 >> 2] = $vararg_buffer1; //@line 3682
  HEAP32[$AsyncCtx9 + 20 >> 2] = $vararg_buffer3; //@line 3684
  HEAP32[$AsyncCtx9 + 24 >> 2] = $vararg_buffer3; //@line 3686
  HEAP32[$AsyncCtx9 + 28 >> 2] = $vararg_buffer5; //@line 3688
  HEAP32[$AsyncCtx9 + 32 >> 2] = $vararg_buffer5; //@line 3690
  sp = STACKTOP; //@line 3691
  STACKTOP = sp; //@line 3692
  return 0; //@line 3692
 }
 _emscripten_free_async_context($AsyncCtx9 | 0); //@line 3694
 __ZN6C128323clsEv(8860); //@line 3695
 $AsyncCtx44 = _emscripten_alloc_async_context(36, sp) | 0; //@line 3696
 HEAP32[$bitmSan3$byval_copy76 >> 2] = HEAP32[255]; //@line 3697
 HEAP32[$bitmSan3$byval_copy76 + 4 >> 2] = HEAP32[256]; //@line 3697
 HEAP32[$bitmSan3$byval_copy76 + 8 >> 2] = HEAP32[257]; //@line 3697
 HEAP32[$bitmSan3$byval_copy76 + 12 >> 2] = HEAP32[258]; //@line 3697
 __ZN6C128328print_bmE6Bitmapii(8860, $bitmSan3$byval_copy76, 95, 0); //@line 3698
 if (___async) {
  HEAP32[$AsyncCtx44 >> 2] = 143; //@line 3701
  HEAP32[$AsyncCtx44 + 4 >> 2] = $vararg_buffer; //@line 3703
  HEAP32[$AsyncCtx44 + 8 >> 2] = $vararg_buffer; //@line 3705
  HEAP32[$AsyncCtx44 + 12 >> 2] = $vararg_buffer1; //@line 3707
  HEAP32[$AsyncCtx44 + 16 >> 2] = $vararg_buffer1; //@line 3709
  HEAP32[$AsyncCtx44 + 20 >> 2] = $vararg_buffer3; //@line 3711
  HEAP32[$AsyncCtx44 + 24 >> 2] = $vararg_buffer3; //@line 3713
  HEAP32[$AsyncCtx44 + 28 >> 2] = $vararg_buffer5; //@line 3715
  HEAP32[$AsyncCtx44 + 32 >> 2] = $vararg_buffer5; //@line 3717
  sp = STACKTOP; //@line 3718
  STACKTOP = sp; //@line 3719
  return 0; //@line 3719
 }
 _emscripten_free_async_context($AsyncCtx44 | 0); //@line 3721
 __ZN6C1283211copy_to_lcdEv(8860); //@line 3722
 __ZN6C128327setmodeEi(8860, 1); //@line 3723
 $$027 = -15; //@line 3724
 while (1) {
  $AsyncCtx41 = _emscripten_alloc_async_context(40, sp) | 0; //@line 3726
  HEAP32[$bitmSan3$byval_copy76 >> 2] = HEAP32[259]; //@line 3727
  HEAP32[$bitmSan3$byval_copy76 + 4 >> 2] = HEAP32[260]; //@line 3727
  HEAP32[$bitmSan3$byval_copy76 + 8 >> 2] = HEAP32[261]; //@line 3727
  HEAP32[$bitmSan3$byval_copy76 + 12 >> 2] = HEAP32[262]; //@line 3727
  __ZN6C128328print_bmE6Bitmapii(8860, $bitmSan3$byval_copy76, $$027, 2); //@line 3728
  if (___async) {
   label = 9; //@line 3731
   break;
  }
  _emscripten_free_async_context($AsyncCtx41 | 0); //@line 3734
  $AsyncCtx57 = _emscripten_alloc_async_context(40, sp) | 0; //@line 3735
  _wait(.20000000298023224); //@line 3736
  if (___async) {
   label = 11; //@line 3739
   break;
  }
  _emscripten_free_async_context($AsyncCtx57 | 0); //@line 3742
  __ZN6C1283211copy_to_lcdEv(8860); //@line 3743
  $AsyncCtx37 = _emscripten_alloc_async_context(40, sp) | 0; //@line 3744
  HEAP32[$bitmSan3$byval_copy76 >> 2] = HEAP32[259]; //@line 3745
  HEAP32[$bitmSan3$byval_copy76 + 4 >> 2] = HEAP32[260]; //@line 3745
  HEAP32[$bitmSan3$byval_copy76 + 8 >> 2] = HEAP32[261]; //@line 3745
  HEAP32[$bitmSan3$byval_copy76 + 12 >> 2] = HEAP32[262]; //@line 3745
  __ZN6C128328print_bmE6Bitmapii(8860, $bitmSan3$byval_copy76, $$027, 2); //@line 3746
  if (___async) {
   label = 13; //@line 3749
   break;
  }
  _emscripten_free_async_context($AsyncCtx37 | 0); //@line 3752
  $51 = $$027 + 3 | 0; //@line 3753
  $AsyncCtx33 = _emscripten_alloc_async_context(44, sp) | 0; //@line 3754
  HEAP32[$bitmSan3$byval_copy76 >> 2] = HEAP32[263]; //@line 3755
  HEAP32[$bitmSan3$byval_copy76 + 4 >> 2] = HEAP32[264]; //@line 3755
  HEAP32[$bitmSan3$byval_copy76 + 8 >> 2] = HEAP32[265]; //@line 3755
  HEAP32[$bitmSan3$byval_copy76 + 12 >> 2] = HEAP32[266]; //@line 3755
  __ZN6C128328print_bmE6Bitmapii(8860, $bitmSan3$byval_copy76, $51, 2); //@line 3756
  if (___async) {
   label = 15; //@line 3759
   break;
  }
  _emscripten_free_async_context($AsyncCtx33 | 0); //@line 3762
  $AsyncCtx54 = _emscripten_alloc_async_context(44, sp) | 0; //@line 3763
  _wait(.20000000298023224); //@line 3764
  if (___async) {
   label = 17; //@line 3767
   break;
  }
  _emscripten_free_async_context($AsyncCtx54 | 0); //@line 3770
  __ZN6C1283211copy_to_lcdEv(8860); //@line 3771
  $AsyncCtx29 = _emscripten_alloc_async_context(40, sp) | 0; //@line 3772
  HEAP32[$bitmSan3$byval_copy76 >> 2] = HEAP32[263]; //@line 3773
  HEAP32[$bitmSan3$byval_copy76 + 4 >> 2] = HEAP32[264]; //@line 3773
  HEAP32[$bitmSan3$byval_copy76 + 8 >> 2] = HEAP32[265]; //@line 3773
  HEAP32[$bitmSan3$byval_copy76 + 12 >> 2] = HEAP32[266]; //@line 3773
  __ZN6C128328print_bmE6Bitmapii(8860, $bitmSan3$byval_copy76, $51, 2); //@line 3774
  if (___async) {
   label = 19; //@line 3777
   break;
  }
  _emscripten_free_async_context($AsyncCtx29 | 0); //@line 3780
  $81 = $$027 + 6 | 0; //@line 3781
  $AsyncCtx25 = _emscripten_alloc_async_context(44, sp) | 0; //@line 3782
  HEAP32[$bitmSan3$byval_copy76 >> 2] = HEAP32[267]; //@line 3783
  HEAP32[$bitmSan3$byval_copy76 + 4 >> 2] = HEAP32[268]; //@line 3783
  HEAP32[$bitmSan3$byval_copy76 + 8 >> 2] = HEAP32[269]; //@line 3783
  HEAP32[$bitmSan3$byval_copy76 + 12 >> 2] = HEAP32[270]; //@line 3783
  __ZN6C128328print_bmE6Bitmapii(8860, $bitmSan3$byval_copy76, $81, 2); //@line 3784
  if (___async) {
   label = 21; //@line 3787
   break;
  }
  _emscripten_free_async_context($AsyncCtx25 | 0); //@line 3790
  $AsyncCtx51 = _emscripten_alloc_async_context(44, sp) | 0; //@line 3791
  _wait(.20000000298023224); //@line 3792
  if (___async) {
   label = 23; //@line 3795
   break;
  }
  _emscripten_free_async_context($AsyncCtx51 | 0); //@line 3798
  __ZN6C1283211copy_to_lcdEv(8860); //@line 3799
  $AsyncCtx21 = _emscripten_alloc_async_context(40, sp) | 0; //@line 3800
  HEAP32[$bitmSan3$byval_copy76 >> 2] = HEAP32[267]; //@line 3801
  HEAP32[$bitmSan3$byval_copy76 + 4 >> 2] = HEAP32[268]; //@line 3801
  HEAP32[$bitmSan3$byval_copy76 + 8 >> 2] = HEAP32[269]; //@line 3801
  HEAP32[$bitmSan3$byval_copy76 + 12 >> 2] = HEAP32[270]; //@line 3801
  __ZN6C128328print_bmE6Bitmapii(8860, $bitmSan3$byval_copy76, $81, 2); //@line 3802
  if (___async) {
   label = 25; //@line 3805
   break;
  }
  _emscripten_free_async_context($AsyncCtx21 | 0); //@line 3808
  if (($$027 | 0) < 66) {
   $$027 = $$027 + 9 | 0; //@line 3812
  } else {
   label = 27; //@line 3814
   break;
  }
 }
 switch (label | 0) {
 case 9:
  {
   HEAP32[$AsyncCtx41 >> 2] = 144; //@line 3820
   HEAP32[$AsyncCtx41 + 4 >> 2] = $vararg_buffer; //@line 3822
   HEAP32[$AsyncCtx41 + 8 >> 2] = $vararg_buffer; //@line 3824
   HEAP32[$AsyncCtx41 + 12 >> 2] = $vararg_buffer1; //@line 3826
   HEAP32[$AsyncCtx41 + 16 >> 2] = $vararg_buffer1; //@line 3828
   HEAP32[$AsyncCtx41 + 20 >> 2] = $vararg_buffer3; //@line 3830
   HEAP32[$AsyncCtx41 + 24 >> 2] = $vararg_buffer3; //@line 3832
   HEAP32[$AsyncCtx41 + 28 >> 2] = $vararg_buffer5; //@line 3834
   HEAP32[$AsyncCtx41 + 32 >> 2] = $vararg_buffer5; //@line 3836
   HEAP32[$AsyncCtx41 + 36 >> 2] = $$027; //@line 3838
   sp = STACKTOP; //@line 3839
   STACKTOP = sp; //@line 3840
   return 0; //@line 3840
  }
 case 11:
  {
   HEAP32[$AsyncCtx57 >> 2] = 145; //@line 3844
   HEAP32[$AsyncCtx57 + 4 >> 2] = $vararg_buffer; //@line 3846
   HEAP32[$AsyncCtx57 + 8 >> 2] = $vararg_buffer; //@line 3848
   HEAP32[$AsyncCtx57 + 12 >> 2] = $vararg_buffer1; //@line 3850
   HEAP32[$AsyncCtx57 + 16 >> 2] = $vararg_buffer1; //@line 3852
   HEAP32[$AsyncCtx57 + 20 >> 2] = $vararg_buffer3; //@line 3854
   HEAP32[$AsyncCtx57 + 24 >> 2] = $vararg_buffer3; //@line 3856
   HEAP32[$AsyncCtx57 + 28 >> 2] = $vararg_buffer5; //@line 3858
   HEAP32[$AsyncCtx57 + 32 >> 2] = $vararg_buffer5; //@line 3860
   HEAP32[$AsyncCtx57 + 36 >> 2] = $$027; //@line 3862
   sp = STACKTOP; //@line 3863
   STACKTOP = sp; //@line 3864
   return 0; //@line 3864
  }
 case 13:
  {
   HEAP32[$AsyncCtx37 >> 2] = 146; //@line 3868
   HEAP32[$AsyncCtx37 + 4 >> 2] = $vararg_buffer; //@line 3870
   HEAP32[$AsyncCtx37 + 8 >> 2] = $vararg_buffer; //@line 3872
   HEAP32[$AsyncCtx37 + 12 >> 2] = $vararg_buffer1; //@line 3874
   HEAP32[$AsyncCtx37 + 16 >> 2] = $vararg_buffer1; //@line 3876
   HEAP32[$AsyncCtx37 + 20 >> 2] = $vararg_buffer3; //@line 3878
   HEAP32[$AsyncCtx37 + 24 >> 2] = $vararg_buffer3; //@line 3880
   HEAP32[$AsyncCtx37 + 28 >> 2] = $vararg_buffer5; //@line 3882
   HEAP32[$AsyncCtx37 + 32 >> 2] = $vararg_buffer5; //@line 3884
   HEAP32[$AsyncCtx37 + 36 >> 2] = $$027; //@line 3886
   sp = STACKTOP; //@line 3887
   STACKTOP = sp; //@line 3888
   return 0; //@line 3888
  }
 case 15:
  {
   HEAP32[$AsyncCtx33 >> 2] = 147; //@line 3892
   HEAP32[$AsyncCtx33 + 4 >> 2] = $vararg_buffer; //@line 3894
   HEAP32[$AsyncCtx33 + 8 >> 2] = $vararg_buffer; //@line 3896
   HEAP32[$AsyncCtx33 + 12 >> 2] = $vararg_buffer1; //@line 3898
   HEAP32[$AsyncCtx33 + 16 >> 2] = $vararg_buffer1; //@line 3900
   HEAP32[$AsyncCtx33 + 20 >> 2] = $vararg_buffer3; //@line 3902
   HEAP32[$AsyncCtx33 + 24 >> 2] = $vararg_buffer3; //@line 3904
   HEAP32[$AsyncCtx33 + 28 >> 2] = $vararg_buffer5; //@line 3906
   HEAP32[$AsyncCtx33 + 32 >> 2] = $vararg_buffer5; //@line 3908
   HEAP32[$AsyncCtx33 + 36 >> 2] = $$027; //@line 3910
   HEAP32[$AsyncCtx33 + 40 >> 2] = $51; //@line 3912
   sp = STACKTOP; //@line 3913
   STACKTOP = sp; //@line 3914
   return 0; //@line 3914
  }
 case 17:
  {
   HEAP32[$AsyncCtx54 >> 2] = 148; //@line 3918
   HEAP32[$AsyncCtx54 + 4 >> 2] = $vararg_buffer; //@line 3920
   HEAP32[$AsyncCtx54 + 8 >> 2] = $vararg_buffer; //@line 3922
   HEAP32[$AsyncCtx54 + 12 >> 2] = $vararg_buffer1; //@line 3924
   HEAP32[$AsyncCtx54 + 16 >> 2] = $vararg_buffer1; //@line 3926
   HEAP32[$AsyncCtx54 + 20 >> 2] = $vararg_buffer3; //@line 3928
   HEAP32[$AsyncCtx54 + 24 >> 2] = $vararg_buffer3; //@line 3930
   HEAP32[$AsyncCtx54 + 28 >> 2] = $vararg_buffer5; //@line 3932
   HEAP32[$AsyncCtx54 + 32 >> 2] = $vararg_buffer5; //@line 3934
   HEAP32[$AsyncCtx54 + 36 >> 2] = $$027; //@line 3936
   HEAP32[$AsyncCtx54 + 40 >> 2] = $51; //@line 3938
   sp = STACKTOP; //@line 3939
   STACKTOP = sp; //@line 3940
   return 0; //@line 3940
  }
 case 19:
  {
   HEAP32[$AsyncCtx29 >> 2] = 149; //@line 3944
   HEAP32[$AsyncCtx29 + 4 >> 2] = $vararg_buffer; //@line 3946
   HEAP32[$AsyncCtx29 + 8 >> 2] = $vararg_buffer; //@line 3948
   HEAP32[$AsyncCtx29 + 12 >> 2] = $vararg_buffer1; //@line 3950
   HEAP32[$AsyncCtx29 + 16 >> 2] = $vararg_buffer1; //@line 3952
   HEAP32[$AsyncCtx29 + 20 >> 2] = $vararg_buffer3; //@line 3954
   HEAP32[$AsyncCtx29 + 24 >> 2] = $vararg_buffer3; //@line 3956
   HEAP32[$AsyncCtx29 + 28 >> 2] = $vararg_buffer5; //@line 3958
   HEAP32[$AsyncCtx29 + 32 >> 2] = $vararg_buffer5; //@line 3960
   HEAP32[$AsyncCtx29 + 36 >> 2] = $$027; //@line 3962
   sp = STACKTOP; //@line 3963
   STACKTOP = sp; //@line 3964
   return 0; //@line 3964
  }
 case 21:
  {
   HEAP32[$AsyncCtx25 >> 2] = 150; //@line 3968
   HEAP32[$AsyncCtx25 + 4 >> 2] = $vararg_buffer; //@line 3970
   HEAP32[$AsyncCtx25 + 8 >> 2] = $vararg_buffer; //@line 3972
   HEAP32[$AsyncCtx25 + 12 >> 2] = $vararg_buffer1; //@line 3974
   HEAP32[$AsyncCtx25 + 16 >> 2] = $vararg_buffer1; //@line 3976
   HEAP32[$AsyncCtx25 + 20 >> 2] = $81; //@line 3978
   HEAP32[$AsyncCtx25 + 24 >> 2] = $vararg_buffer3; //@line 3980
   HEAP32[$AsyncCtx25 + 28 >> 2] = $vararg_buffer3; //@line 3982
   HEAP32[$AsyncCtx25 + 32 >> 2] = $vararg_buffer5; //@line 3984
   HEAP32[$AsyncCtx25 + 36 >> 2] = $vararg_buffer5; //@line 3986
   HEAP32[$AsyncCtx25 + 40 >> 2] = $$027; //@line 3988
   sp = STACKTOP; //@line 3989
   STACKTOP = sp; //@line 3990
   return 0; //@line 3990
  }
 case 23:
  {
   HEAP32[$AsyncCtx51 >> 2] = 151; //@line 3994
   HEAP32[$AsyncCtx51 + 4 >> 2] = $vararg_buffer; //@line 3996
   HEAP32[$AsyncCtx51 + 8 >> 2] = $vararg_buffer; //@line 3998
   HEAP32[$AsyncCtx51 + 12 >> 2] = $vararg_buffer1; //@line 4000
   HEAP32[$AsyncCtx51 + 16 >> 2] = $vararg_buffer1; //@line 4002
   HEAP32[$AsyncCtx51 + 20 >> 2] = $81; //@line 4004
   HEAP32[$AsyncCtx51 + 24 >> 2] = $vararg_buffer3; //@line 4006
   HEAP32[$AsyncCtx51 + 28 >> 2] = $vararg_buffer3; //@line 4008
   HEAP32[$AsyncCtx51 + 32 >> 2] = $vararg_buffer5; //@line 4010
   HEAP32[$AsyncCtx51 + 36 >> 2] = $vararg_buffer5; //@line 4012
   HEAP32[$AsyncCtx51 + 40 >> 2] = $$027; //@line 4014
   sp = STACKTOP; //@line 4015
   STACKTOP = sp; //@line 4016
   return 0; //@line 4016
  }
 case 25:
  {
   HEAP32[$AsyncCtx21 >> 2] = 152; //@line 4020
   HEAP32[$AsyncCtx21 + 4 >> 2] = $vararg_buffer; //@line 4022
   HEAP32[$AsyncCtx21 + 8 >> 2] = $vararg_buffer; //@line 4024
   HEAP32[$AsyncCtx21 + 12 >> 2] = $vararg_buffer1; //@line 4026
   HEAP32[$AsyncCtx21 + 16 >> 2] = $vararg_buffer1; //@line 4028
   HEAP32[$AsyncCtx21 + 20 >> 2] = $vararg_buffer3; //@line 4030
   HEAP32[$AsyncCtx21 + 24 >> 2] = $vararg_buffer3; //@line 4032
   HEAP32[$AsyncCtx21 + 28 >> 2] = $vararg_buffer5; //@line 4034
   HEAP32[$AsyncCtx21 + 32 >> 2] = $vararg_buffer5; //@line 4036
   HEAP32[$AsyncCtx21 + 36 >> 2] = $$027; //@line 4038
   sp = STACKTOP; //@line 4039
   STACKTOP = sp; //@line 4040
   return 0; //@line 4040
  }
 case 27:
  {
   $AsyncCtx17 = _emscripten_alloc_async_context(36, sp) | 0; //@line 4044
   HEAP32[$bitmSan3$byval_copy76 >> 2] = HEAP32[267]; //@line 4045
   HEAP32[$bitmSan3$byval_copy76 + 4 >> 2] = HEAP32[268]; //@line 4045
   HEAP32[$bitmSan3$byval_copy76 + 8 >> 2] = HEAP32[269]; //@line 4045
   HEAP32[$bitmSan3$byval_copy76 + 12 >> 2] = HEAP32[270]; //@line 4045
   __ZN6C128328print_bmE6Bitmapii(8860, $bitmSan3$byval_copy76, 75, 2); //@line 4046
   if (___async) {
    HEAP32[$AsyncCtx17 >> 2] = 153; //@line 4049
    HEAP32[$AsyncCtx17 + 4 >> 2] = $vararg_buffer; //@line 4051
    HEAP32[$AsyncCtx17 + 8 >> 2] = $vararg_buffer; //@line 4053
    HEAP32[$AsyncCtx17 + 12 >> 2] = $vararg_buffer1; //@line 4055
    HEAP32[$AsyncCtx17 + 16 >> 2] = $vararg_buffer1; //@line 4057
    HEAP32[$AsyncCtx17 + 20 >> 2] = $vararg_buffer3; //@line 4059
    HEAP32[$AsyncCtx17 + 24 >> 2] = $vararg_buffer3; //@line 4061
    HEAP32[$AsyncCtx17 + 28 >> 2] = $vararg_buffer5; //@line 4063
    HEAP32[$AsyncCtx17 + 32 >> 2] = $vararg_buffer5; //@line 4065
    sp = STACKTOP; //@line 4066
    STACKTOP = sp; //@line 4067
    return 0; //@line 4067
   }
   _emscripten_free_async_context($AsyncCtx17 | 0); //@line 4069
   __ZN6C1283211set_auto_upEj(8860, 0); //@line 4070
   $$1 = -20; //@line 4071
   while (1) {
    __ZN6C128326locateEii(8860, 5, $$1); //@line 4074
    __ZN4mbed6Stream6printfEPKcz(8860, 5809, $vararg_buffer) | 0; //@line 4075
    $122 = $$1 + 12 | 0; //@line 4076
    __ZN6C128326locateEii(8860, 5, $122); //@line 4077
    __ZN4mbed6Stream6printfEPKcz(8860, 5815, $vararg_buffer1) | 0; //@line 4078
    __ZN6C1283211copy_to_lcdEv(8860); //@line 4079
    if (($$1 | 0) >= 5) {
     break;
    }
    __ZN6C128326locateEii(8860, 5, $$1); //@line 4083
    $AsyncCtx48 = _emscripten_alloc_async_context(44, sp) | 0; //@line 4084
    _wait(.20000000298023224); //@line 4085
    if (___async) {
     label = 32; //@line 4088
     break;
    }
    _emscripten_free_async_context($AsyncCtx48 | 0); //@line 4091
    __ZN4mbed6Stream6printfEPKcz(8860, 5809, $vararg_buffer3) | 0; //@line 4092
    __ZN6C128326locateEii(8860, 5, $122); //@line 4093
    __ZN4mbed6Stream6printfEPKcz(8860, 5815, $vararg_buffer5) | 0; //@line 4094
    __ZN6C1283211copy_to_lcdEv(8860); //@line 4095
    $$1 = $$1 + 2 | 0; //@line 4097
   }
   if ((label | 0) == 32) {
    HEAP32[$AsyncCtx48 >> 2] = 154; //@line 4100
    HEAP32[$AsyncCtx48 + 4 >> 2] = $vararg_buffer3; //@line 4102
    HEAP32[$AsyncCtx48 + 8 >> 2] = $vararg_buffer3; //@line 4104
    HEAP32[$AsyncCtx48 + 12 >> 2] = $122; //@line 4106
    HEAP32[$AsyncCtx48 + 16 >> 2] = $vararg_buffer5; //@line 4108
    HEAP32[$AsyncCtx48 + 20 >> 2] = $vararg_buffer5; //@line 4110
    HEAP32[$AsyncCtx48 + 24 >> 2] = $$1; //@line 4112
    HEAP32[$AsyncCtx48 + 28 >> 2] = $vararg_buffer; //@line 4114
    HEAP32[$AsyncCtx48 + 32 >> 2] = $vararg_buffer; //@line 4116
    HEAP32[$AsyncCtx48 + 36 >> 2] = $vararg_buffer1; //@line 4118
    HEAP32[$AsyncCtx48 + 40 >> 2] = $vararg_buffer1; //@line 4120
    sp = STACKTOP; //@line 4121
    STACKTOP = sp; //@line 4122
    return 0; //@line 4122
   }
   $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 4124
   _puts(5825) | 0; //@line 4125
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 155; //@line 4128
    sp = STACKTOP; //@line 4129
    STACKTOP = sp; //@line 4130
    return 0; //@line 4130
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 4132
    STACKTOP = sp; //@line 4133
    return 0; //@line 4133
   }
   break;
  }
 }
 return 0; //@line 4138
}
function _free($0) {
 $0 = $0 | 0;
 var $$0212$i = 0, $$0212$in$i = 0, $$0383 = 0, $$0384 = 0, $$0396 = 0, $$0403 = 0, $$1 = 0, $$1382 = 0, $$1387 = 0, $$1390 = 0, $$1398 = 0, $$1402 = 0, $$2 = 0, $$3 = 0, $$3400 = 0, $$pre$phi442Z2D = 0, $$pre$phi444Z2D = 0, $$pre$phiZ2D = 0, $10 = 0, $105 = 0, $106 = 0, $114 = 0, $115 = 0, $116 = 0, $124 = 0, $13 = 0, $132 = 0, $137 = 0, $138 = 0, $141 = 0, $143 = 0, $145 = 0, $16 = 0, $160 = 0, $165 = 0, $167 = 0, $17 = 0, $170 = 0, $173 = 0, $176 = 0, $179 = 0, $180 = 0, $181 = 0, $183 = 0, $185 = 0, $186 = 0, $188 = 0, $189 = 0, $195 = 0, $196 = 0, $2 = 0, $21 = 0, $210 = 0, $213 = 0, $214 = 0, $220 = 0, $235 = 0, $238 = 0, $239 = 0, $24 = 0, $240 = 0, $244 = 0, $245 = 0, $251 = 0, $256 = 0, $257 = 0, $26 = 0, $260 = 0, $262 = 0, $265 = 0, $270 = 0, $276 = 0, $28 = 0, $280 = 0, $281 = 0, $299 = 0, $3 = 0, $301 = 0, $308 = 0, $309 = 0, $310 = 0, $319 = 0, $41 = 0, $46 = 0, $48 = 0, $51 = 0, $53 = 0, $56 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $63 = 0, $65 = 0, $66 = 0, $68 = 0, $69 = 0, $7 = 0, $74 = 0, $75 = 0, $89 = 0, $9 = 0, $92 = 0, $93 = 0, $99 = 0, label = 0;
 if (!$0) {
  return;
 }
 $2 = $0 + -8 | 0; //@line 6512
 $3 = HEAP32[3265] | 0; //@line 6513
 if ($2 >>> 0 < $3 >>> 0) {
  _abort(); //@line 6516
 }
 $6 = HEAP32[$0 + -4 >> 2] | 0; //@line 6520
 $7 = $6 & 3; //@line 6521
 if (($7 | 0) == 1) {
  _abort(); //@line 6524
 }
 $9 = $6 & -8; //@line 6527
 $10 = $2 + $9 | 0; //@line 6528
 L10 : do {
  if (!($6 & 1)) {
   $13 = HEAP32[$2 >> 2] | 0; //@line 6533
   if (!$7) {
    return;
   }
   $16 = $2 + (0 - $13) | 0; //@line 6539
   $17 = $13 + $9 | 0; //@line 6540
   if ($16 >>> 0 < $3 >>> 0) {
    _abort(); //@line 6543
   }
   if ((HEAP32[3266] | 0) == ($16 | 0)) {
    $105 = $10 + 4 | 0; //@line 6549
    $106 = HEAP32[$105 >> 2] | 0; //@line 6550
    if (($106 & 3 | 0) != 3) {
     $$1 = $16; //@line 6554
     $$1382 = $17; //@line 6554
     $114 = $16; //@line 6554
     break;
    }
    HEAP32[3263] = $17; //@line 6557
    HEAP32[$105 >> 2] = $106 & -2; //@line 6559
    HEAP32[$16 + 4 >> 2] = $17 | 1; //@line 6562
    HEAP32[$16 + $17 >> 2] = $17; //@line 6564
    return;
   }
   $21 = $13 >>> 3; //@line 6567
   if ($13 >>> 0 < 256) {
    $24 = HEAP32[$16 + 8 >> 2] | 0; //@line 6571
    $26 = HEAP32[$16 + 12 >> 2] | 0; //@line 6573
    $28 = 13084 + ($21 << 1 << 2) | 0; //@line 6575
    if (($24 | 0) != ($28 | 0)) {
     if ($3 >>> 0 > $24 >>> 0) {
      _abort(); //@line 6580
     }
     if ((HEAP32[$24 + 12 >> 2] | 0) != ($16 | 0)) {
      _abort(); //@line 6587
     }
    }
    if (($26 | 0) == ($24 | 0)) {
     HEAP32[3261] = HEAP32[3261] & ~(1 << $21); //@line 6597
     $$1 = $16; //@line 6598
     $$1382 = $17; //@line 6598
     $114 = $16; //@line 6598
     break;
    }
    if (($26 | 0) == ($28 | 0)) {
     $$pre$phi444Z2D = $26 + 8 | 0; //@line 6604
    } else {
     if ($3 >>> 0 > $26 >>> 0) {
      _abort(); //@line 6608
     }
     $41 = $26 + 8 | 0; //@line 6611
     if ((HEAP32[$41 >> 2] | 0) == ($16 | 0)) {
      $$pre$phi444Z2D = $41; //@line 6615
     } else {
      _abort(); //@line 6617
     }
    }
    HEAP32[$24 + 12 >> 2] = $26; //@line 6622
    HEAP32[$$pre$phi444Z2D >> 2] = $24; //@line 6623
    $$1 = $16; //@line 6624
    $$1382 = $17; //@line 6624
    $114 = $16; //@line 6624
    break;
   }
   $46 = HEAP32[$16 + 24 >> 2] | 0; //@line 6628
   $48 = HEAP32[$16 + 12 >> 2] | 0; //@line 6630
   do {
    if (($48 | 0) == ($16 | 0)) {
     $59 = $16 + 16 | 0; //@line 6634
     $60 = $59 + 4 | 0; //@line 6635
     $61 = HEAP32[$60 >> 2] | 0; //@line 6636
     if (!$61) {
      $63 = HEAP32[$59 >> 2] | 0; //@line 6639
      if (!$63) {
       $$3 = 0; //@line 6642
       break;
      } else {
       $$1387 = $63; //@line 6645
       $$1390 = $59; //@line 6645
      }
     } else {
      $$1387 = $61; //@line 6648
      $$1390 = $60; //@line 6648
     }
     while (1) {
      $65 = $$1387 + 20 | 0; //@line 6651
      $66 = HEAP32[$65 >> 2] | 0; //@line 6652
      if ($66 | 0) {
       $$1387 = $66; //@line 6655
       $$1390 = $65; //@line 6655
       continue;
      }
      $68 = $$1387 + 16 | 0; //@line 6658
      $69 = HEAP32[$68 >> 2] | 0; //@line 6659
      if (!$69) {
       break;
      } else {
       $$1387 = $69; //@line 6664
       $$1390 = $68; //@line 6664
      }
     }
     if ($3 >>> 0 > $$1390 >>> 0) {
      _abort(); //@line 6669
     } else {
      HEAP32[$$1390 >> 2] = 0; //@line 6672
      $$3 = $$1387; //@line 6673
      break;
     }
    } else {
     $51 = HEAP32[$16 + 8 >> 2] | 0; //@line 6678
     if ($3 >>> 0 > $51 >>> 0) {
      _abort(); //@line 6681
     }
     $53 = $51 + 12 | 0; //@line 6684
     if ((HEAP32[$53 >> 2] | 0) != ($16 | 0)) {
      _abort(); //@line 6688
     }
     $56 = $48 + 8 | 0; //@line 6691
     if ((HEAP32[$56 >> 2] | 0) == ($16 | 0)) {
      HEAP32[$53 >> 2] = $48; //@line 6695
      HEAP32[$56 >> 2] = $51; //@line 6696
      $$3 = $48; //@line 6697
      break;
     } else {
      _abort(); //@line 6700
     }
    }
   } while (0);
   if (!$46) {
    $$1 = $16; //@line 6707
    $$1382 = $17; //@line 6707
    $114 = $16; //@line 6707
   } else {
    $74 = HEAP32[$16 + 28 >> 2] | 0; //@line 6710
    $75 = 13348 + ($74 << 2) | 0; //@line 6711
    do {
     if ((HEAP32[$75 >> 2] | 0) == ($16 | 0)) {
      HEAP32[$75 >> 2] = $$3; //@line 6716
      if (!$$3) {
       HEAP32[3262] = HEAP32[3262] & ~(1 << $74); //@line 6723
       $$1 = $16; //@line 6724
       $$1382 = $17; //@line 6724
       $114 = $16; //@line 6724
       break L10;
      }
     } else {
      if ((HEAP32[3265] | 0) >>> 0 > $46 >>> 0) {
       _abort(); //@line 6731
      } else {
       HEAP32[$46 + 16 + (((HEAP32[$46 + 16 >> 2] | 0) != ($16 | 0) & 1) << 2) >> 2] = $$3; //@line 6739
       if (!$$3) {
        $$1 = $16; //@line 6742
        $$1382 = $17; //@line 6742
        $114 = $16; //@line 6742
        break L10;
       } else {
        break;
       }
      }
     }
    } while (0);
    $89 = HEAP32[3265] | 0; //@line 6750
    if ($89 >>> 0 > $$3 >>> 0) {
     _abort(); //@line 6753
    }
    HEAP32[$$3 + 24 >> 2] = $46; //@line 6757
    $92 = $16 + 16 | 0; //@line 6758
    $93 = HEAP32[$92 >> 2] | 0; //@line 6759
    do {
     if ($93 | 0) {
      if ($89 >>> 0 > $93 >>> 0) {
       _abort(); //@line 6765
      } else {
       HEAP32[$$3 + 16 >> 2] = $93; //@line 6769
       HEAP32[$93 + 24 >> 2] = $$3; //@line 6771
       break;
      }
     }
    } while (0);
    $99 = HEAP32[$92 + 4 >> 2] | 0; //@line 6777
    if (!$99) {
     $$1 = $16; //@line 6780
     $$1382 = $17; //@line 6780
     $114 = $16; //@line 6780
    } else {
     if ((HEAP32[3265] | 0) >>> 0 > $99 >>> 0) {
      _abort(); //@line 6785
     } else {
      HEAP32[$$3 + 20 >> 2] = $99; //@line 6789
      HEAP32[$99 + 24 >> 2] = $$3; //@line 6791
      $$1 = $16; //@line 6792
      $$1382 = $17; //@line 6792
      $114 = $16; //@line 6792
      break;
     }
    }
   }
  } else {
   $$1 = $2; //@line 6798
   $$1382 = $9; //@line 6798
   $114 = $2; //@line 6798
  }
 } while (0);
 if ($114 >>> 0 >= $10 >>> 0) {
  _abort(); //@line 6803
 }
 $115 = $10 + 4 | 0; //@line 6806
 $116 = HEAP32[$115 >> 2] | 0; //@line 6807
 if (!($116 & 1)) {
  _abort(); //@line 6811
 }
 if (!($116 & 2)) {
  if ((HEAP32[3267] | 0) == ($10 | 0)) {
   $124 = (HEAP32[3264] | 0) + $$1382 | 0; //@line 6821
   HEAP32[3264] = $124; //@line 6822
   HEAP32[3267] = $$1; //@line 6823
   HEAP32[$$1 + 4 >> 2] = $124 | 1; //@line 6826
   if (($$1 | 0) != (HEAP32[3266] | 0)) {
    return;
   }
   HEAP32[3266] = 0; //@line 6832
   HEAP32[3263] = 0; //@line 6833
   return;
  }
  if ((HEAP32[3266] | 0) == ($10 | 0)) {
   $132 = (HEAP32[3263] | 0) + $$1382 | 0; //@line 6840
   HEAP32[3263] = $132; //@line 6841
   HEAP32[3266] = $114; //@line 6842
   HEAP32[$$1 + 4 >> 2] = $132 | 1; //@line 6845
   HEAP32[$114 + $132 >> 2] = $132; //@line 6847
   return;
  }
  $137 = ($116 & -8) + $$1382 | 0; //@line 6851
  $138 = $116 >>> 3; //@line 6852
  L108 : do {
   if ($116 >>> 0 < 256) {
    $141 = HEAP32[$10 + 8 >> 2] | 0; //@line 6857
    $143 = HEAP32[$10 + 12 >> 2] | 0; //@line 6859
    $145 = 13084 + ($138 << 1 << 2) | 0; //@line 6861
    if (($141 | 0) != ($145 | 0)) {
     if ((HEAP32[3265] | 0) >>> 0 > $141 >>> 0) {
      _abort(); //@line 6867
     }
     if ((HEAP32[$141 + 12 >> 2] | 0) != ($10 | 0)) {
      _abort(); //@line 6874
     }
    }
    if (($143 | 0) == ($141 | 0)) {
     HEAP32[3261] = HEAP32[3261] & ~(1 << $138); //@line 6884
     break;
    }
    if (($143 | 0) == ($145 | 0)) {
     $$pre$phi442Z2D = $143 + 8 | 0; //@line 6890
    } else {
     if ((HEAP32[3265] | 0) >>> 0 > $143 >>> 0) {
      _abort(); //@line 6895
     }
     $160 = $143 + 8 | 0; //@line 6898
     if ((HEAP32[$160 >> 2] | 0) == ($10 | 0)) {
      $$pre$phi442Z2D = $160; //@line 6902
     } else {
      _abort(); //@line 6904
     }
    }
    HEAP32[$141 + 12 >> 2] = $143; //@line 6909
    HEAP32[$$pre$phi442Z2D >> 2] = $141; //@line 6910
   } else {
    $165 = HEAP32[$10 + 24 >> 2] | 0; //@line 6913
    $167 = HEAP32[$10 + 12 >> 2] | 0; //@line 6915
    do {
     if (($167 | 0) == ($10 | 0)) {
      $179 = $10 + 16 | 0; //@line 6919
      $180 = $179 + 4 | 0; //@line 6920
      $181 = HEAP32[$180 >> 2] | 0; //@line 6921
      if (!$181) {
       $183 = HEAP32[$179 >> 2] | 0; //@line 6924
       if (!$183) {
        $$3400 = 0; //@line 6927
        break;
       } else {
        $$1398 = $183; //@line 6930
        $$1402 = $179; //@line 6930
       }
      } else {
       $$1398 = $181; //@line 6933
       $$1402 = $180; //@line 6933
      }
      while (1) {
       $185 = $$1398 + 20 | 0; //@line 6936
       $186 = HEAP32[$185 >> 2] | 0; //@line 6937
       if ($186 | 0) {
        $$1398 = $186; //@line 6940
        $$1402 = $185; //@line 6940
        continue;
       }
       $188 = $$1398 + 16 | 0; //@line 6943
       $189 = HEAP32[$188 >> 2] | 0; //@line 6944
       if (!$189) {
        break;
       } else {
        $$1398 = $189; //@line 6949
        $$1402 = $188; //@line 6949
       }
      }
      if ((HEAP32[3265] | 0) >>> 0 > $$1402 >>> 0) {
       _abort(); //@line 6955
      } else {
       HEAP32[$$1402 >> 2] = 0; //@line 6958
       $$3400 = $$1398; //@line 6959
       break;
      }
     } else {
      $170 = HEAP32[$10 + 8 >> 2] | 0; //@line 6964
      if ((HEAP32[3265] | 0) >>> 0 > $170 >>> 0) {
       _abort(); //@line 6968
      }
      $173 = $170 + 12 | 0; //@line 6971
      if ((HEAP32[$173 >> 2] | 0) != ($10 | 0)) {
       _abort(); //@line 6975
      }
      $176 = $167 + 8 | 0; //@line 6978
      if ((HEAP32[$176 >> 2] | 0) == ($10 | 0)) {
       HEAP32[$173 >> 2] = $167; //@line 6982
       HEAP32[$176 >> 2] = $170; //@line 6983
       $$3400 = $167; //@line 6984
       break;
      } else {
       _abort(); //@line 6987
      }
     }
    } while (0);
    if ($165 | 0) {
     $195 = HEAP32[$10 + 28 >> 2] | 0; //@line 6995
     $196 = 13348 + ($195 << 2) | 0; //@line 6996
     do {
      if ((HEAP32[$196 >> 2] | 0) == ($10 | 0)) {
       HEAP32[$196 >> 2] = $$3400; //@line 7001
       if (!$$3400) {
        HEAP32[3262] = HEAP32[3262] & ~(1 << $195); //@line 7008
        break L108;
       }
      } else {
       if ((HEAP32[3265] | 0) >>> 0 > $165 >>> 0) {
        _abort(); //@line 7015
       } else {
        HEAP32[$165 + 16 + (((HEAP32[$165 + 16 >> 2] | 0) != ($10 | 0) & 1) << 2) >> 2] = $$3400; //@line 7023
        if (!$$3400) {
         break L108;
        } else {
         break;
        }
       }
      }
     } while (0);
     $210 = HEAP32[3265] | 0; //@line 7033
     if ($210 >>> 0 > $$3400 >>> 0) {
      _abort(); //@line 7036
     }
     HEAP32[$$3400 + 24 >> 2] = $165; //@line 7040
     $213 = $10 + 16 | 0; //@line 7041
     $214 = HEAP32[$213 >> 2] | 0; //@line 7042
     do {
      if ($214 | 0) {
       if ($210 >>> 0 > $214 >>> 0) {
        _abort(); //@line 7048
       } else {
        HEAP32[$$3400 + 16 >> 2] = $214; //@line 7052
        HEAP32[$214 + 24 >> 2] = $$3400; //@line 7054
        break;
       }
      }
     } while (0);
     $220 = HEAP32[$213 + 4 >> 2] | 0; //@line 7060
     if ($220 | 0) {
      if ((HEAP32[3265] | 0) >>> 0 > $220 >>> 0) {
       _abort(); //@line 7066
      } else {
       HEAP32[$$3400 + 20 >> 2] = $220; //@line 7070
       HEAP32[$220 + 24 >> 2] = $$3400; //@line 7072
       break;
      }
     }
    }
   }
  } while (0);
  HEAP32[$$1 + 4 >> 2] = $137 | 1; //@line 7081
  HEAP32[$114 + $137 >> 2] = $137; //@line 7083
  if (($$1 | 0) == (HEAP32[3266] | 0)) {
   HEAP32[3263] = $137; //@line 7087
   return;
  } else {
   $$2 = $137; //@line 7090
  }
 } else {
  HEAP32[$115 >> 2] = $116 & -2; //@line 7094
  HEAP32[$$1 + 4 >> 2] = $$1382 | 1; //@line 7097
  HEAP32[$114 + $$1382 >> 2] = $$1382; //@line 7099
  $$2 = $$1382; //@line 7100
 }
 $235 = $$2 >>> 3; //@line 7102
 if ($$2 >>> 0 < 256) {
  $238 = 13084 + ($235 << 1 << 2) | 0; //@line 7106
  $239 = HEAP32[3261] | 0; //@line 7107
  $240 = 1 << $235; //@line 7108
  if (!($239 & $240)) {
   HEAP32[3261] = $239 | $240; //@line 7113
   $$0403 = $238; //@line 7115
   $$pre$phiZ2D = $238 + 8 | 0; //@line 7115
  } else {
   $244 = $238 + 8 | 0; //@line 7117
   $245 = HEAP32[$244 >> 2] | 0; //@line 7118
   if ((HEAP32[3265] | 0) >>> 0 > $245 >>> 0) {
    _abort(); //@line 7122
   } else {
    $$0403 = $245; //@line 7125
    $$pre$phiZ2D = $244; //@line 7125
   }
  }
  HEAP32[$$pre$phiZ2D >> 2] = $$1; //@line 7128
  HEAP32[$$0403 + 12 >> 2] = $$1; //@line 7130
  HEAP32[$$1 + 8 >> 2] = $$0403; //@line 7132
  HEAP32[$$1 + 12 >> 2] = $238; //@line 7134
  return;
 }
 $251 = $$2 >>> 8; //@line 7137
 if (!$251) {
  $$0396 = 0; //@line 7140
 } else {
  if ($$2 >>> 0 > 16777215) {
   $$0396 = 31; //@line 7144
  } else {
   $256 = ($251 + 1048320 | 0) >>> 16 & 8; //@line 7148
   $257 = $251 << $256; //@line 7149
   $260 = ($257 + 520192 | 0) >>> 16 & 4; //@line 7152
   $262 = $257 << $260; //@line 7154
   $265 = ($262 + 245760 | 0) >>> 16 & 2; //@line 7157
   $270 = 14 - ($260 | $256 | $265) + ($262 << $265 >>> 15) | 0; //@line 7162
   $$0396 = $$2 >>> ($270 + 7 | 0) & 1 | $270 << 1; //@line 7168
  }
 }
 $276 = 13348 + ($$0396 << 2) | 0; //@line 7171
 HEAP32[$$1 + 28 >> 2] = $$0396; //@line 7173
 HEAP32[$$1 + 20 >> 2] = 0; //@line 7176
 HEAP32[$$1 + 16 >> 2] = 0; //@line 7177
 $280 = HEAP32[3262] | 0; //@line 7178
 $281 = 1 << $$0396; //@line 7179
 do {
  if (!($280 & $281)) {
   HEAP32[3262] = $280 | $281; //@line 7185
   HEAP32[$276 >> 2] = $$1; //@line 7186
   HEAP32[$$1 + 24 >> 2] = $276; //@line 7188
   HEAP32[$$1 + 12 >> 2] = $$1; //@line 7190
   HEAP32[$$1 + 8 >> 2] = $$1; //@line 7192
  } else {
   $$0383 = $$2 << (($$0396 | 0) == 31 ? 0 : 25 - ($$0396 >>> 1) | 0); //@line 7200
   $$0384 = HEAP32[$276 >> 2] | 0; //@line 7200
   while (1) {
    if ((HEAP32[$$0384 + 4 >> 2] & -8 | 0) == ($$2 | 0)) {
     label = 124; //@line 7207
     break;
    }
    $299 = $$0384 + 16 + ($$0383 >>> 31 << 2) | 0; //@line 7211
    $301 = HEAP32[$299 >> 2] | 0; //@line 7213
    if (!$301) {
     label = 121; //@line 7216
     break;
    } else {
     $$0383 = $$0383 << 1; //@line 7219
     $$0384 = $301; //@line 7219
    }
   }
   if ((label | 0) == 121) {
    if ((HEAP32[3265] | 0) >>> 0 > $299 >>> 0) {
     _abort(); //@line 7226
    } else {
     HEAP32[$299 >> 2] = $$1; //@line 7229
     HEAP32[$$1 + 24 >> 2] = $$0384; //@line 7231
     HEAP32[$$1 + 12 >> 2] = $$1; //@line 7233
     HEAP32[$$1 + 8 >> 2] = $$1; //@line 7235
     break;
    }
   } else if ((label | 0) == 124) {
    $308 = $$0384 + 8 | 0; //@line 7240
    $309 = HEAP32[$308 >> 2] | 0; //@line 7241
    $310 = HEAP32[3265] | 0; //@line 7242
    if ($310 >>> 0 <= $309 >>> 0 & $310 >>> 0 <= $$0384 >>> 0) {
     HEAP32[$309 + 12 >> 2] = $$1; //@line 7248
     HEAP32[$308 >> 2] = $$1; //@line 7249
     HEAP32[$$1 + 8 >> 2] = $309; //@line 7251
     HEAP32[$$1 + 12 >> 2] = $$0384; //@line 7253
     HEAP32[$$1 + 24 >> 2] = 0; //@line 7255
     break;
    } else {
     _abort(); //@line 7258
    }
   }
  }
 } while (0);
 $319 = (HEAP32[3269] | 0) + -1 | 0; //@line 7265
 HEAP32[3269] = $319; //@line 7266
 if (!$319) {
  $$0212$in$i = 13500; //@line 7269
 } else {
  return;
 }
 while (1) {
  $$0212$i = HEAP32[$$0212$in$i >> 2] | 0; //@line 7274
  if (!$$0212$i) {
   break;
  } else {
   $$0212$in$i = $$0212$i + 8 | 0; //@line 7280
  }
 }
 HEAP32[3269] = -1; //@line 7283
 return;
}
function __ZN6C128329characterEiii__async_cb($0) {
 $0 = $0 | 0;
 var $10 = 0, $100 = 0, $101 = 0, $102 = 0, $103 = 0, $104 = 0, $105 = 0, $106 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $2 = 0, $20 = 0, $22 = 0, $24 = 0, $28 = 0, $31 = 0, $33 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $50 = 0, $51 = 0, $56 = 0, $57 = 0, $6 = 0, $62 = 0, $64 = 0, $65 = 0, $75 = 0, $76 = 0, $77 = 0, $78 = 0, $79 = 0, $8 = 0, $80 = 0, $81 = 0, $82 = 0, $83 = 0, $84 = 0, $85 = 0, $86 = 0, $87 = 0, $88 = 0, $89 = 0, $90 = 0, $91 = 0, $92 = 0, $93 = 0, $94 = 0, $95 = 0, $96 = 0, $97 = 0, $98 = 0, $99 = 0, $ReallocAsyncCtx2 = 0, $ReallocAsyncCtx3 = 0, $ReallocAsyncCtx4 = 0, sp = 0;
 sp = STACKTOP; //@line 1139
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 1141
 $4 = HEAP8[$0 + 8 >> 0] | 0; //@line 1143
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 1145
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 1147
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 1149
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 1151
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 1153
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 1155
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 1157
 $20 = HEAP32[$0 + 40 >> 2] | 0; //@line 1159
 $22 = HEAP32[$0 + 44 >> 2] | 0; //@line 1161
 $24 = HEAP8[$0 + 48 >> 0] | 0; //@line 1163
 $28 = HEAP32[$0 + 56 >> 2] | 0; //@line 1167
 if ((HEAP32[$0 + 52 >> 2] | 0) >>> 0 > (HEAP32[___async_retval >> 2] | 0) >>> 0) {
  HEAP32[$12 >> 2] = 0; //@line 1172
  $31 = $6 + 64 | 0; //@line 1173
  $33 = (HEAP32[$31 >> 2] | 0) + $14 | 0; //@line 1175
  HEAP32[$31 >> 2] = $33; //@line 1176
  $36 = HEAP32[(HEAP32[$16 >> 2] | 0) + 128 >> 2] | 0; //@line 1179
  $ReallocAsyncCtx2 = _emscripten_realloc_async_context(60) | 0; //@line 1180
  $37 = FUNCTION_TABLE_ii[$36 & 31]($6) | 0; //@line 1181
  if (___async) {
   HEAP32[$ReallocAsyncCtx2 >> 2] = 39; //@line 1184
   $38 = $ReallocAsyncCtx2 + 4 | 0; //@line 1185
   HEAP32[$38 >> 2] = $18; //@line 1186
   $39 = $ReallocAsyncCtx2 + 8 | 0; //@line 1187
   HEAP32[$39 >> 2] = $33; //@line 1188
   $40 = $ReallocAsyncCtx2 + 12 | 0; //@line 1189
   HEAP32[$40 >> 2] = $20; //@line 1190
   $41 = $ReallocAsyncCtx2 + 16 | 0; //@line 1191
   HEAP32[$41 >> 2] = $22; //@line 1192
   $42 = $ReallocAsyncCtx2 + 20 | 0; //@line 1193
   HEAP8[$42 >> 0] = $24; //@line 1194
   $43 = $ReallocAsyncCtx2 + 24 | 0; //@line 1195
   HEAP32[$43 >> 2] = $31; //@line 1196
   $44 = $ReallocAsyncCtx2 + 28 | 0; //@line 1197
   HEAP32[$44 >> 2] = $12; //@line 1198
   $45 = $ReallocAsyncCtx2 + 32 | 0; //@line 1199
   HEAP8[$45 >> 0] = $4; //@line 1200
   $46 = $ReallocAsyncCtx2 + 36 | 0; //@line 1201
   HEAP32[$46 >> 2] = $6; //@line 1202
   $47 = $ReallocAsyncCtx2 + 40 | 0; //@line 1203
   HEAP32[$47 >> 2] = $2; //@line 1204
   $48 = $ReallocAsyncCtx2 + 44 | 0; //@line 1205
   HEAP32[$48 >> 2] = $8; //@line 1206
   $49 = $ReallocAsyncCtx2 + 48 | 0; //@line 1207
   HEAP32[$49 >> 2] = $10; //@line 1208
   $50 = $ReallocAsyncCtx2 + 52 | 0; //@line 1209
   HEAP32[$50 >> 2] = $28; //@line 1210
   $51 = $ReallocAsyncCtx2 + 56 | 0; //@line 1211
   HEAP32[$51 >> 2] = $14; //@line 1212
   sp = STACKTOP; //@line 1213
   return;
  }
  HEAP32[___async_retval >> 2] = $37; //@line 1217
  ___async_unwind = 0; //@line 1218
  HEAP32[$ReallocAsyncCtx2 >> 2] = 39; //@line 1219
  $38 = $ReallocAsyncCtx2 + 4 | 0; //@line 1220
  HEAP32[$38 >> 2] = $18; //@line 1221
  $39 = $ReallocAsyncCtx2 + 8 | 0; //@line 1222
  HEAP32[$39 >> 2] = $33; //@line 1223
  $40 = $ReallocAsyncCtx2 + 12 | 0; //@line 1224
  HEAP32[$40 >> 2] = $20; //@line 1225
  $41 = $ReallocAsyncCtx2 + 16 | 0; //@line 1226
  HEAP32[$41 >> 2] = $22; //@line 1227
  $42 = $ReallocAsyncCtx2 + 20 | 0; //@line 1228
  HEAP8[$42 >> 0] = $24; //@line 1229
  $43 = $ReallocAsyncCtx2 + 24 | 0; //@line 1230
  HEAP32[$43 >> 2] = $31; //@line 1231
  $44 = $ReallocAsyncCtx2 + 28 | 0; //@line 1232
  HEAP32[$44 >> 2] = $12; //@line 1233
  $45 = $ReallocAsyncCtx2 + 32 | 0; //@line 1234
  HEAP8[$45 >> 0] = $4; //@line 1235
  $46 = $ReallocAsyncCtx2 + 36 | 0; //@line 1236
  HEAP32[$46 >> 2] = $6; //@line 1237
  $47 = $ReallocAsyncCtx2 + 40 | 0; //@line 1238
  HEAP32[$47 >> 2] = $2; //@line 1239
  $48 = $ReallocAsyncCtx2 + 44 | 0; //@line 1240
  HEAP32[$48 >> 2] = $8; //@line 1241
  $49 = $ReallocAsyncCtx2 + 48 | 0; //@line 1242
  HEAP32[$49 >> 2] = $10; //@line 1243
  $50 = $ReallocAsyncCtx2 + 52 | 0; //@line 1244
  HEAP32[$50 >> 2] = $28; //@line 1245
  $51 = $ReallocAsyncCtx2 + 56 | 0; //@line 1246
  HEAP32[$51 >> 2] = $14; //@line 1247
  sp = STACKTOP; //@line 1248
  return;
 }
 $56 = (HEAP32[$18 >> 2] | 0) + ((Math_imul($20 + -32 | 0, $22) | 0) + 4) | 0; //@line 1255
 $57 = HEAP8[$56 >> 0] | 0; //@line 1256
 if ($24 << 24 >> 24) {
  if ($4 << 24 >> 24) {
   $62 = (0 >>> 3 & 31) + 1 | 0; //@line 1263
   $64 = 1 << 0; //@line 1265
   $65 = 0 + $2 | 0; //@line 1266
   $75 = HEAP32[(HEAP32[$6 >> 2] | 0) + 120 >> 2] | 0; //@line 1276
   $76 = 0 + $10 | 0; //@line 1277
   if (!($64 & (HEAPU8[$56 + ($62 + 0) >> 0] | 0))) {
    $ReallocAsyncCtx4 = _emscripten_realloc_async_context(64) | 0; //@line 1279
    FUNCTION_TABLE_viiii[$75 & 7]($6, $76, $65, 0); //@line 1280
    if (___async) {
     HEAP32[$ReallocAsyncCtx4 >> 2] = 41; //@line 1283
     $92 = $ReallocAsyncCtx4 + 4 | 0; //@line 1284
     HEAP32[$92 >> 2] = 0; //@line 1285
     $93 = $ReallocAsyncCtx4 + 8 | 0; //@line 1286
     HEAP32[$93 >> 2] = $28; //@line 1287
     $94 = $ReallocAsyncCtx4 + 12 | 0; //@line 1288
     HEAP32[$94 >> 2] = 0; //@line 1289
     $95 = $ReallocAsyncCtx4 + 16 | 0; //@line 1290
     HEAP32[$95 >> 2] = $14; //@line 1291
     $96 = $ReallocAsyncCtx4 + 20 | 0; //@line 1292
     HEAP32[$96 >> 2] = $8; //@line 1293
     $97 = $ReallocAsyncCtx4 + 24 | 0; //@line 1294
     HEAP32[$97 >> 2] = $62; //@line 1295
     $98 = $ReallocAsyncCtx4 + 28 | 0; //@line 1296
     HEAP32[$98 >> 2] = $56; //@line 1297
     $99 = $ReallocAsyncCtx4 + 32 | 0; //@line 1298
     HEAP32[$99 >> 2] = $64; //@line 1299
     $100 = $ReallocAsyncCtx4 + 36 | 0; //@line 1300
     HEAP32[$100 >> 2] = $6; //@line 1301
     $101 = $ReallocAsyncCtx4 + 40 | 0; //@line 1302
     HEAP32[$101 >> 2] = $10; //@line 1303
     $102 = $ReallocAsyncCtx4 + 44 | 0; //@line 1304
     HEAP32[$102 >> 2] = $6; //@line 1305
     $103 = $ReallocAsyncCtx4 + 48 | 0; //@line 1306
     HEAP32[$103 >> 2] = $65; //@line 1307
     $104 = $ReallocAsyncCtx4 + 52 | 0; //@line 1308
     HEAP8[$104 >> 0] = $57; //@line 1309
     $105 = $ReallocAsyncCtx4 + 56 | 0; //@line 1310
     HEAP32[$105 >> 2] = $12; //@line 1311
     $106 = $ReallocAsyncCtx4 + 60 | 0; //@line 1312
     HEAP32[$106 >> 2] = $2; //@line 1313
     sp = STACKTOP; //@line 1314
     return;
    }
    ___async_unwind = 0; //@line 1317
    HEAP32[$ReallocAsyncCtx4 >> 2] = 41; //@line 1318
    $92 = $ReallocAsyncCtx4 + 4 | 0; //@line 1319
    HEAP32[$92 >> 2] = 0; //@line 1320
    $93 = $ReallocAsyncCtx4 + 8 | 0; //@line 1321
    HEAP32[$93 >> 2] = $28; //@line 1322
    $94 = $ReallocAsyncCtx4 + 12 | 0; //@line 1323
    HEAP32[$94 >> 2] = 0; //@line 1324
    $95 = $ReallocAsyncCtx4 + 16 | 0; //@line 1325
    HEAP32[$95 >> 2] = $14; //@line 1326
    $96 = $ReallocAsyncCtx4 + 20 | 0; //@line 1327
    HEAP32[$96 >> 2] = $8; //@line 1328
    $97 = $ReallocAsyncCtx4 + 24 | 0; //@line 1329
    HEAP32[$97 >> 2] = $62; //@line 1330
    $98 = $ReallocAsyncCtx4 + 28 | 0; //@line 1331
    HEAP32[$98 >> 2] = $56; //@line 1332
    $99 = $ReallocAsyncCtx4 + 32 | 0; //@line 1333
    HEAP32[$99 >> 2] = $64; //@line 1334
    $100 = $ReallocAsyncCtx4 + 36 | 0; //@line 1335
    HEAP32[$100 >> 2] = $6; //@line 1336
    $101 = $ReallocAsyncCtx4 + 40 | 0; //@line 1337
    HEAP32[$101 >> 2] = $10; //@line 1338
    $102 = $ReallocAsyncCtx4 + 44 | 0; //@line 1339
    HEAP32[$102 >> 2] = $6; //@line 1340
    $103 = $ReallocAsyncCtx4 + 48 | 0; //@line 1341
    HEAP32[$103 >> 2] = $65; //@line 1342
    $104 = $ReallocAsyncCtx4 + 52 | 0; //@line 1343
    HEAP8[$104 >> 0] = $57; //@line 1344
    $105 = $ReallocAsyncCtx4 + 56 | 0; //@line 1345
    HEAP32[$105 >> 2] = $12; //@line 1346
    $106 = $ReallocAsyncCtx4 + 60 | 0; //@line 1347
    HEAP32[$106 >> 2] = $2; //@line 1348
    sp = STACKTOP; //@line 1349
    return;
   } else {
    $ReallocAsyncCtx3 = _emscripten_realloc_async_context(64) | 0; //@line 1352
    FUNCTION_TABLE_viiii[$75 & 7]($6, $76, $65, 1); //@line 1353
    if (___async) {
     HEAP32[$ReallocAsyncCtx3 >> 2] = 40; //@line 1356
     $77 = $ReallocAsyncCtx3 + 4 | 0; //@line 1357
     HEAP32[$77 >> 2] = 0; //@line 1358
     $78 = $ReallocAsyncCtx3 + 8 | 0; //@line 1359
     HEAP32[$78 >> 2] = $28; //@line 1360
     $79 = $ReallocAsyncCtx3 + 12 | 0; //@line 1361
     HEAP32[$79 >> 2] = 0; //@line 1362
     $80 = $ReallocAsyncCtx3 + 16 | 0; //@line 1363
     HEAP32[$80 >> 2] = $14; //@line 1364
     $81 = $ReallocAsyncCtx3 + 20 | 0; //@line 1365
     HEAP32[$81 >> 2] = $8; //@line 1366
     $82 = $ReallocAsyncCtx3 + 24 | 0; //@line 1367
     HEAP32[$82 >> 2] = $62; //@line 1368
     $83 = $ReallocAsyncCtx3 + 28 | 0; //@line 1369
     HEAP32[$83 >> 2] = $56; //@line 1370
     $84 = $ReallocAsyncCtx3 + 32 | 0; //@line 1371
     HEAP32[$84 >> 2] = $64; //@line 1372
     $85 = $ReallocAsyncCtx3 + 36 | 0; //@line 1373
     HEAP32[$85 >> 2] = $6; //@line 1374
     $86 = $ReallocAsyncCtx3 + 40 | 0; //@line 1375
     HEAP32[$86 >> 2] = $10; //@line 1376
     $87 = $ReallocAsyncCtx3 + 44 | 0; //@line 1377
     HEAP32[$87 >> 2] = $6; //@line 1378
     $88 = $ReallocAsyncCtx3 + 48 | 0; //@line 1379
     HEAP32[$88 >> 2] = $65; //@line 1380
     $89 = $ReallocAsyncCtx3 + 52 | 0; //@line 1381
     HEAP8[$89 >> 0] = $57; //@line 1382
     $90 = $ReallocAsyncCtx3 + 56 | 0; //@line 1383
     HEAP32[$90 >> 2] = $12; //@line 1384
     $91 = $ReallocAsyncCtx3 + 60 | 0; //@line 1385
     HEAP32[$91 >> 2] = $2; //@line 1386
     sp = STACKTOP; //@line 1387
     return;
    }
    ___async_unwind = 0; //@line 1390
    HEAP32[$ReallocAsyncCtx3 >> 2] = 40; //@line 1391
    $77 = $ReallocAsyncCtx3 + 4 | 0; //@line 1392
    HEAP32[$77 >> 2] = 0; //@line 1393
    $78 = $ReallocAsyncCtx3 + 8 | 0; //@line 1394
    HEAP32[$78 >> 2] = $28; //@line 1395
    $79 = $ReallocAsyncCtx3 + 12 | 0; //@line 1396
    HEAP32[$79 >> 2] = 0; //@line 1397
    $80 = $ReallocAsyncCtx3 + 16 | 0; //@line 1398
    HEAP32[$80 >> 2] = $14; //@line 1399
    $81 = $ReallocAsyncCtx3 + 20 | 0; //@line 1400
    HEAP32[$81 >> 2] = $8; //@line 1401
    $82 = $ReallocAsyncCtx3 + 24 | 0; //@line 1402
    HEAP32[$82 >> 2] = $62; //@line 1403
    $83 = $ReallocAsyncCtx3 + 28 | 0; //@line 1404
    HEAP32[$83 >> 2] = $56; //@line 1405
    $84 = $ReallocAsyncCtx3 + 32 | 0; //@line 1406
    HEAP32[$84 >> 2] = $64; //@line 1407
    $85 = $ReallocAsyncCtx3 + 36 | 0; //@line 1408
    HEAP32[$85 >> 2] = $6; //@line 1409
    $86 = $ReallocAsyncCtx3 + 40 | 0; //@line 1410
    HEAP32[$86 >> 2] = $10; //@line 1411
    $87 = $ReallocAsyncCtx3 + 44 | 0; //@line 1412
    HEAP32[$87 >> 2] = $6; //@line 1413
    $88 = $ReallocAsyncCtx3 + 48 | 0; //@line 1414
    HEAP32[$88 >> 2] = $65; //@line 1415
    $89 = $ReallocAsyncCtx3 + 52 | 0; //@line 1416
    HEAP8[$89 >> 0] = $57; //@line 1417
    $90 = $ReallocAsyncCtx3 + 56 | 0; //@line 1418
    HEAP32[$90 >> 2] = $12; //@line 1419
    $91 = $ReallocAsyncCtx3 + 60 | 0; //@line 1420
    HEAP32[$91 >> 2] = $2; //@line 1421
    sp = STACKTOP; //@line 1422
    return;
   }
  }
 }
 HEAP32[$12 >> 2] = (HEAP32[$12 >> 2] | 0) + ($57 & 255); //@line 1430
 return;
}
function __ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($0, $1, $2, $3, $4) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 var $$0 = 0, $$081$off0 = 0, $$084 = 0, $$085$off0 = 0, $$1 = 0, $$182$off0 = 0, $$186$off0 = 0, $$2 = 0, $$283$off0 = 0, $100 = 0, $104 = 0, $105 = 0, $106 = 0, $122 = 0, $13 = 0, $136 = 0, $19 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $30 = 0, $61 = 0, $69 = 0, $72 = 0, $73 = 0, $81 = 0, $84 = 0, $87 = 0, $90 = 0, $AsyncCtx = 0, $AsyncCtx11 = 0, $AsyncCtx15 = 0, $AsyncCtx3 = 0, $AsyncCtx7 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 13486
 L1 : do {
  if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, $4) | 0) {
   __ZNK10__cxxabiv117__class_type_info29process_static_type_below_dstEPNS_19__dynamic_cast_infoEPKvi(0, $1, $2, $3); //@line 13492
  } else {
   if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 >> 2] | 0, $4) | 0) {
    if ((HEAP32[$1 + 16 >> 2] | 0) != ($2 | 0)) {
     $13 = $1 + 20 | 0; //@line 13501
     if ((HEAP32[$13 >> 2] | 0) != ($2 | 0)) {
      HEAP32[$1 + 32 >> 2] = $3; //@line 13506
      $19 = $1 + 44 | 0; //@line 13507
      if ((HEAP32[$19 >> 2] | 0) == 4) {
       break;
      }
      $25 = $0 + 16 + (HEAP32[$0 + 12 >> 2] << 3) | 0; //@line 13516
      $26 = $1 + 52 | 0; //@line 13517
      $27 = $1 + 53 | 0; //@line 13518
      $28 = $1 + 54 | 0; //@line 13519
      $29 = $0 + 8 | 0; //@line 13520
      $30 = $1 + 24 | 0; //@line 13521
      $$081$off0 = 0; //@line 13522
      $$084 = $0 + 16 | 0; //@line 13522
      $$085$off0 = 0; //@line 13522
      L10 : while (1) {
       if ($$084 >>> 0 >= $25 >>> 0) {
        $$283$off0 = $$081$off0; //@line 13526
        label = 20; //@line 13527
        break;
       }
       HEAP8[$26 >> 0] = 0; //@line 13530
       HEAP8[$27 >> 0] = 0; //@line 13531
       $AsyncCtx15 = _emscripten_alloc_async_context(56, sp) | 0; //@line 13532
       __ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($$084, $1, $2, $2, 1, $4); //@line 13533
       if (___async) {
        label = 12; //@line 13536
        break;
       }
       _emscripten_free_async_context($AsyncCtx15 | 0); //@line 13539
       if (HEAP8[$28 >> 0] | 0) {
        $$283$off0 = $$081$off0; //@line 13543
        label = 20; //@line 13544
        break;
       }
       do {
        if (!(HEAP8[$27 >> 0] | 0)) {
         $$182$off0 = $$081$off0; //@line 13551
         $$186$off0 = $$085$off0; //@line 13551
        } else {
         if (!(HEAP8[$26 >> 0] | 0)) {
          if (!(HEAP32[$29 >> 2] & 1)) {
           $$283$off0 = 1; //@line 13560
           label = 20; //@line 13561
           break L10;
          } else {
           $$182$off0 = 1; //@line 13564
           $$186$off0 = $$085$off0; //@line 13564
           break;
          }
         }
         if ((HEAP32[$30 >> 2] | 0) == 1) {
          label = 25; //@line 13571
          break L10;
         }
         if (!(HEAP32[$29 >> 2] & 2)) {
          label = 25; //@line 13578
          break L10;
         } else {
          $$182$off0 = 1; //@line 13581
          $$186$off0 = 1; //@line 13581
         }
        }
       } while (0);
       $$081$off0 = $$182$off0; //@line 13586
       $$084 = $$084 + 8 | 0; //@line 13586
       $$085$off0 = $$186$off0; //@line 13586
      }
      if ((label | 0) == 12) {
       HEAP32[$AsyncCtx15 >> 2] = 194; //@line 13589
       HEAP32[$AsyncCtx15 + 4 >> 2] = $28; //@line 13591
       HEAP32[$AsyncCtx15 + 8 >> 2] = $25; //@line 13593
       HEAP32[$AsyncCtx15 + 12 >> 2] = $26; //@line 13595
       HEAP32[$AsyncCtx15 + 16 >> 2] = $27; //@line 13597
       HEAP32[$AsyncCtx15 + 20 >> 2] = $1; //@line 13599
       HEAP32[$AsyncCtx15 + 24 >> 2] = $2; //@line 13601
       HEAP8[$AsyncCtx15 + 28 >> 0] = $4 & 1; //@line 13604
       HEAP32[$AsyncCtx15 + 32 >> 2] = $30; //@line 13606
       HEAP32[$AsyncCtx15 + 36 >> 2] = $29; //@line 13608
       HEAP8[$AsyncCtx15 + 40 >> 0] = $$085$off0 & 1; //@line 13611
       HEAP8[$AsyncCtx15 + 41 >> 0] = $$081$off0 & 1; //@line 13614
       HEAP32[$AsyncCtx15 + 44 >> 2] = $$084; //@line 13616
       HEAP32[$AsyncCtx15 + 48 >> 2] = $13; //@line 13618
       HEAP32[$AsyncCtx15 + 52 >> 2] = $19; //@line 13620
       sp = STACKTOP; //@line 13621
       return;
      }
      do {
       if ((label | 0) == 20) {
        if (!$$085$off0) {
         HEAP32[$13 >> 2] = $2; //@line 13627
         $61 = $1 + 40 | 0; //@line 13628
         HEAP32[$61 >> 2] = (HEAP32[$61 >> 2] | 0) + 1; //@line 13631
         if ((HEAP32[$1 + 36 >> 2] | 0) == 1) {
          if ((HEAP32[$30 >> 2] | 0) == 2) {
           HEAP8[$28 >> 0] = 1; //@line 13639
           if ($$283$off0) {
            label = 25; //@line 13641
            break;
           } else {
            $69 = 4; //@line 13644
            break;
           }
          }
         }
        }
        if ($$283$off0) {
         label = 25; //@line 13651
        } else {
         $69 = 4; //@line 13653
        }
       }
      } while (0);
      if ((label | 0) == 25) {
       $69 = 3; //@line 13658
      }
      HEAP32[$19 >> 2] = $69; //@line 13660
      break;
     }
    }
    if (($3 | 0) != 1) {
     break;
    }
    HEAP32[$1 + 32 >> 2] = 1; //@line 13669
    break;
   }
   $72 = HEAP32[$0 + 12 >> 2] | 0; //@line 13674
   $73 = $0 + 16 + ($72 << 3) | 0; //@line 13675
   $AsyncCtx11 = _emscripten_alloc_async_context(32, sp) | 0; //@line 13676
   __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($0 + 16 | 0, $1, $2, $3, $4); //@line 13677
   if (___async) {
    HEAP32[$AsyncCtx11 >> 2] = 195; //@line 13680
    HEAP32[$AsyncCtx11 + 4 >> 2] = $73; //@line 13682
    HEAP32[$AsyncCtx11 + 8 >> 2] = $1; //@line 13684
    HEAP32[$AsyncCtx11 + 12 >> 2] = $2; //@line 13686
    HEAP32[$AsyncCtx11 + 16 >> 2] = $3; //@line 13688
    HEAP8[$AsyncCtx11 + 20 >> 0] = $4 & 1; //@line 13691
    HEAP32[$AsyncCtx11 + 24 >> 2] = $0; //@line 13693
    HEAP32[$AsyncCtx11 + 28 >> 2] = $72; //@line 13695
    sp = STACKTOP; //@line 13696
    return;
   }
   _emscripten_free_async_context($AsyncCtx11 | 0); //@line 13699
   $81 = $0 + 24 | 0; //@line 13700
   if (($72 | 0) > 1) {
    $84 = HEAP32[$0 + 8 >> 2] | 0; //@line 13704
    if (!($84 & 2)) {
     $87 = $1 + 36 | 0; //@line 13708
     if ((HEAP32[$87 >> 2] | 0) != 1) {
      if (!($84 & 1)) {
       $106 = $1 + 54 | 0; //@line 13715
       $$2 = $81; //@line 13716
       while (1) {
        if (HEAP8[$106 >> 0] | 0) {
         break L1;
        }
        if ((HEAP32[$87 >> 2] | 0) == 1) {
         break L1;
        }
        $AsyncCtx = _emscripten_alloc_async_context(36, sp) | 0; //@line 13728
        __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($$2, $1, $2, $3, $4); //@line 13729
        if (___async) {
         break;
        }
        _emscripten_free_async_context($AsyncCtx | 0); //@line 13734
        $136 = $$2 + 8 | 0; //@line 13735
        if ($136 >>> 0 < $73 >>> 0) {
         $$2 = $136; //@line 13738
        } else {
         break L1;
        }
       }
       HEAP32[$AsyncCtx >> 2] = 198; //@line 13743
       HEAP32[$AsyncCtx + 4 >> 2] = $$2; //@line 13745
       HEAP32[$AsyncCtx + 8 >> 2] = $73; //@line 13747
       HEAP32[$AsyncCtx + 12 >> 2] = $106; //@line 13749
       HEAP32[$AsyncCtx + 16 >> 2] = $87; //@line 13751
       HEAP32[$AsyncCtx + 20 >> 2] = $1; //@line 13753
       HEAP32[$AsyncCtx + 24 >> 2] = $2; //@line 13755
       HEAP32[$AsyncCtx + 28 >> 2] = $3; //@line 13757
       HEAP8[$AsyncCtx + 32 >> 0] = $4 & 1; //@line 13760
       sp = STACKTOP; //@line 13761
       return;
      }
      $104 = $1 + 24 | 0; //@line 13764
      $105 = $1 + 54 | 0; //@line 13765
      $$1 = $81; //@line 13766
      while (1) {
       if (HEAP8[$105 >> 0] | 0) {
        break L1;
       }
       if ((HEAP32[$87 >> 2] | 0) == 1) {
        if ((HEAP32[$104 >> 2] | 0) == 1) {
         break L1;
        }
       }
       $AsyncCtx3 = _emscripten_alloc_async_context(40, sp) | 0; //@line 13782
       __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($$1, $1, $2, $3, $4); //@line 13783
       if (___async) {
        break;
       }
       _emscripten_free_async_context($AsyncCtx3 | 0); //@line 13788
       $122 = $$1 + 8 | 0; //@line 13789
       if ($122 >>> 0 < $73 >>> 0) {
        $$1 = $122; //@line 13792
       } else {
        break L1;
       }
      }
      HEAP32[$AsyncCtx3 >> 2] = 197; //@line 13797
      HEAP32[$AsyncCtx3 + 4 >> 2] = $$1; //@line 13799
      HEAP32[$AsyncCtx3 + 8 >> 2] = $73; //@line 13801
      HEAP32[$AsyncCtx3 + 12 >> 2] = $105; //@line 13803
      HEAP32[$AsyncCtx3 + 16 >> 2] = $87; //@line 13805
      HEAP32[$AsyncCtx3 + 20 >> 2] = $104; //@line 13807
      HEAP32[$AsyncCtx3 + 24 >> 2] = $1; //@line 13809
      HEAP32[$AsyncCtx3 + 28 >> 2] = $2; //@line 13811
      HEAP32[$AsyncCtx3 + 32 >> 2] = $3; //@line 13813
      HEAP8[$AsyncCtx3 + 36 >> 0] = $4 & 1; //@line 13816
      sp = STACKTOP; //@line 13817
      return;
     }
    }
    $90 = $1 + 54 | 0; //@line 13821
    $$0 = $81; //@line 13822
    while (1) {
     if (HEAP8[$90 >> 0] | 0) {
      break L1;
     }
     $AsyncCtx7 = _emscripten_alloc_async_context(32, sp) | 0; //@line 13829
     __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($$0, $1, $2, $3, $4); //@line 13830
     if (___async) {
      break;
     }
     _emscripten_free_async_context($AsyncCtx7 | 0); //@line 13835
     $100 = $$0 + 8 | 0; //@line 13836
     if ($100 >>> 0 < $73 >>> 0) {
      $$0 = $100; //@line 13839
     } else {
      break L1;
     }
    }
    HEAP32[$AsyncCtx7 >> 2] = 196; //@line 13844
    HEAP32[$AsyncCtx7 + 4 >> 2] = $$0; //@line 13846
    HEAP32[$AsyncCtx7 + 8 >> 2] = $73; //@line 13848
    HEAP32[$AsyncCtx7 + 12 >> 2] = $90; //@line 13850
    HEAP32[$AsyncCtx7 + 16 >> 2] = $1; //@line 13852
    HEAP32[$AsyncCtx7 + 20 >> 2] = $2; //@line 13854
    HEAP32[$AsyncCtx7 + 24 >> 2] = $3; //@line 13856
    HEAP8[$AsyncCtx7 + 28 >> 0] = $4 & 1; //@line 13859
    sp = STACKTOP; //@line 13860
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
 $n_sroa_0_0_extract_trunc = $a$0; //@line 6672
 $n_sroa_1_4_extract_shift$0 = $a$1; //@line 6673
 $n_sroa_1_4_extract_trunc = $n_sroa_1_4_extract_shift$0; //@line 6674
 $d_sroa_0_0_extract_trunc = $b$0; //@line 6675
 $d_sroa_1_4_extract_shift$0 = $b$1; //@line 6676
 $d_sroa_1_4_extract_trunc = $d_sroa_1_4_extract_shift$0; //@line 6677
 if (!$n_sroa_1_4_extract_trunc) {
  $4 = ($rem | 0) != 0; //@line 6679
  if (!$d_sroa_1_4_extract_trunc) {
   if ($4) {
    HEAP32[$rem >> 2] = ($n_sroa_0_0_extract_trunc >>> 0) % ($d_sroa_0_0_extract_trunc >>> 0); //@line 6682
    HEAP32[$rem + 4 >> 2] = 0; //@line 6683
   }
   $_0$1 = 0; //@line 6685
   $_0$0 = ($n_sroa_0_0_extract_trunc >>> 0) / ($d_sroa_0_0_extract_trunc >>> 0) >>> 0; //@line 6686
   return (tempRet0 = $_0$1, $_0$0) | 0; //@line 6687
  } else {
   if (!$4) {
    $_0$1 = 0; //@line 6690
    $_0$0 = 0; //@line 6691
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 6692
   }
   HEAP32[$rem >> 2] = $a$0 | 0; //@line 6694
   HEAP32[$rem + 4 >> 2] = $a$1 & 0; //@line 6695
   $_0$1 = 0; //@line 6696
   $_0$0 = 0; //@line 6697
   return (tempRet0 = $_0$1, $_0$0) | 0; //@line 6698
  }
 }
 $17 = ($d_sroa_1_4_extract_trunc | 0) == 0; //@line 6701
 do {
  if (!$d_sroa_0_0_extract_trunc) {
   if ($17) {
    if ($rem | 0) {
     HEAP32[$rem >> 2] = ($n_sroa_1_4_extract_trunc >>> 0) % ($d_sroa_0_0_extract_trunc >>> 0); //@line 6706
     HEAP32[$rem + 4 >> 2] = 0; //@line 6707
    }
    $_0$1 = 0; //@line 6709
    $_0$0 = ($n_sroa_1_4_extract_trunc >>> 0) / ($d_sroa_0_0_extract_trunc >>> 0) >>> 0; //@line 6710
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 6711
   }
   if (!$n_sroa_0_0_extract_trunc) {
    if ($rem | 0) {
     HEAP32[$rem >> 2] = 0; //@line 6715
     HEAP32[$rem + 4 >> 2] = ($n_sroa_1_4_extract_trunc >>> 0) % ($d_sroa_1_4_extract_trunc >>> 0); //@line 6716
    }
    $_0$1 = 0; //@line 6718
    $_0$0 = ($n_sroa_1_4_extract_trunc >>> 0) / ($d_sroa_1_4_extract_trunc >>> 0) >>> 0; //@line 6719
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 6720
   }
   $37 = $d_sroa_1_4_extract_trunc - 1 | 0; //@line 6722
   if (!($37 & $d_sroa_1_4_extract_trunc)) {
    if ($rem | 0) {
     HEAP32[$rem >> 2] = $a$0 | 0; //@line 6725
     HEAP32[$rem + 4 >> 2] = $37 & $n_sroa_1_4_extract_trunc | $a$1 & 0; //@line 6726
    }
    $_0$1 = 0; //@line 6728
    $_0$0 = $n_sroa_1_4_extract_trunc >>> ((_llvm_cttz_i32($d_sroa_1_4_extract_trunc | 0) | 0) >>> 0); //@line 6729
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 6730
   }
   $51 = (Math_clz32($d_sroa_1_4_extract_trunc | 0) | 0) - (Math_clz32($n_sroa_1_4_extract_trunc | 0) | 0) | 0; //@line 6733
   if ($51 >>> 0 <= 30) {
    $57 = $51 + 1 | 0; //@line 6735
    $58 = 31 - $51 | 0; //@line 6736
    $sr_1_ph = $57; //@line 6737
    $r_sroa_0_1_ph = $n_sroa_1_4_extract_trunc << $58 | $n_sroa_0_0_extract_trunc >>> ($57 >>> 0); //@line 6738
    $r_sroa_1_1_ph = $n_sroa_1_4_extract_trunc >>> ($57 >>> 0); //@line 6739
    $q_sroa_0_1_ph = 0; //@line 6740
    $q_sroa_1_1_ph = $n_sroa_0_0_extract_trunc << $58; //@line 6741
    break;
   }
   if (!$rem) {
    $_0$1 = 0; //@line 6745
    $_0$0 = 0; //@line 6746
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 6747
   }
   HEAP32[$rem >> 2] = $a$0 | 0; //@line 6749
   HEAP32[$rem + 4 >> 2] = $n_sroa_1_4_extract_shift$0 | $a$1 & 0; //@line 6750
   $_0$1 = 0; //@line 6751
   $_0$0 = 0; //@line 6752
   return (tempRet0 = $_0$1, $_0$0) | 0; //@line 6753
  } else {
   if (!$17) {
    $119 = (Math_clz32($d_sroa_1_4_extract_trunc | 0) | 0) - (Math_clz32($n_sroa_1_4_extract_trunc | 0) | 0) | 0; //@line 6757
    if ($119 >>> 0 <= 31) {
     $125 = $119 + 1 | 0; //@line 6759
     $126 = 31 - $119 | 0; //@line 6760
     $130 = $119 - 31 >> 31; //@line 6761
     $sr_1_ph = $125; //@line 6762
     $r_sroa_0_1_ph = $n_sroa_0_0_extract_trunc >>> ($125 >>> 0) & $130 | $n_sroa_1_4_extract_trunc << $126; //@line 6763
     $r_sroa_1_1_ph = $n_sroa_1_4_extract_trunc >>> ($125 >>> 0) & $130; //@line 6764
     $q_sroa_0_1_ph = 0; //@line 6765
     $q_sroa_1_1_ph = $n_sroa_0_0_extract_trunc << $126; //@line 6766
     break;
    }
    if (!$rem) {
     $_0$1 = 0; //@line 6770
     $_0$0 = 0; //@line 6771
     return (tempRet0 = $_0$1, $_0$0) | 0; //@line 6772
    }
    HEAP32[$rem >> 2] = $a$0 | 0; //@line 6774
    HEAP32[$rem + 4 >> 2] = $n_sroa_1_4_extract_shift$0 | $a$1 & 0; //@line 6775
    $_0$1 = 0; //@line 6776
    $_0$0 = 0; //@line 6777
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 6778
   }
   $66 = $d_sroa_0_0_extract_trunc - 1 | 0; //@line 6780
   if ($66 & $d_sroa_0_0_extract_trunc | 0) {
    $88 = (Math_clz32($d_sroa_0_0_extract_trunc | 0) | 0) + 33 - (Math_clz32($n_sroa_1_4_extract_trunc | 0) | 0) | 0; //@line 6783
    $89 = 64 - $88 | 0; //@line 6784
    $91 = 32 - $88 | 0; //@line 6785
    $92 = $91 >> 31; //@line 6786
    $95 = $88 - 32 | 0; //@line 6787
    $105 = $95 >> 31; //@line 6788
    $sr_1_ph = $88; //@line 6789
    $r_sroa_0_1_ph = $91 - 1 >> 31 & $n_sroa_1_4_extract_trunc >>> ($95 >>> 0) | ($n_sroa_1_4_extract_trunc << $91 | $n_sroa_0_0_extract_trunc >>> ($88 >>> 0)) & $105; //@line 6790
    $r_sroa_1_1_ph = $105 & $n_sroa_1_4_extract_trunc >>> ($88 >>> 0); //@line 6791
    $q_sroa_0_1_ph = $n_sroa_0_0_extract_trunc << $89 & $92; //@line 6792
    $q_sroa_1_1_ph = ($n_sroa_1_4_extract_trunc << $89 | $n_sroa_0_0_extract_trunc >>> ($95 >>> 0)) & $92 | $n_sroa_0_0_extract_trunc << $91 & $88 - 33 >> 31; //@line 6793
    break;
   }
   if ($rem | 0) {
    HEAP32[$rem >> 2] = $66 & $n_sroa_0_0_extract_trunc; //@line 6797
    HEAP32[$rem + 4 >> 2] = 0; //@line 6798
   }
   if (($d_sroa_0_0_extract_trunc | 0) == 1) {
    $_0$1 = $n_sroa_1_4_extract_shift$0 | $a$1 & 0; //@line 6801
    $_0$0 = $a$0 | 0 | 0; //@line 6802
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 6803
   } else {
    $78 = _llvm_cttz_i32($d_sroa_0_0_extract_trunc | 0) | 0; //@line 6805
    $_0$1 = $n_sroa_1_4_extract_trunc >>> ($78 >>> 0) | 0; //@line 6806
    $_0$0 = $n_sroa_1_4_extract_trunc << 32 - $78 | $n_sroa_0_0_extract_trunc >>> ($78 >>> 0) | 0; //@line 6807
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 6808
   }
  }
 } while (0);
 if (!$sr_1_ph) {
  $q_sroa_1_1_lcssa = $q_sroa_1_1_ph; //@line 6813
  $q_sroa_0_1_lcssa = $q_sroa_0_1_ph; //@line 6814
  $r_sroa_1_1_lcssa = $r_sroa_1_1_ph; //@line 6815
  $r_sroa_0_1_lcssa = $r_sroa_0_1_ph; //@line 6816
  $carry_0_lcssa$1 = 0; //@line 6817
  $carry_0_lcssa$0 = 0; //@line 6818
 } else {
  $d_sroa_0_0_insert_insert99$0 = $b$0 | 0 | 0; //@line 6820
  $d_sroa_0_0_insert_insert99$1 = $d_sroa_1_4_extract_shift$0 | $b$1 & 0; //@line 6821
  $137$0 = _i64Add($d_sroa_0_0_insert_insert99$0 | 0, $d_sroa_0_0_insert_insert99$1 | 0, -1, -1) | 0; //@line 6822
  $137$1 = tempRet0; //@line 6823
  $q_sroa_1_1198 = $q_sroa_1_1_ph; //@line 6824
  $q_sroa_0_1199 = $q_sroa_0_1_ph; //@line 6825
  $r_sroa_1_1200 = $r_sroa_1_1_ph; //@line 6826
  $r_sroa_0_1201 = $r_sroa_0_1_ph; //@line 6827
  $sr_1202 = $sr_1_ph; //@line 6828
  $carry_0203 = 0; //@line 6829
  do {
   $q_sroa_1_1198$looptemp = $q_sroa_1_1198;
   $q_sroa_1_1198 = $q_sroa_0_1199 >>> 31 | $q_sroa_1_1198 << 1; //@line 6831
   $q_sroa_0_1199 = $carry_0203 | $q_sroa_0_1199 << 1; //@line 6832
   $r_sroa_0_0_insert_insert42$0 = $r_sroa_0_1201 << 1 | $q_sroa_1_1198$looptemp >>> 31 | 0; //@line 6833
   $r_sroa_0_0_insert_insert42$1 = $r_sroa_0_1201 >>> 31 | $r_sroa_1_1200 << 1 | 0; //@line 6834
   _i64Subtract($137$0 | 0, $137$1 | 0, $r_sroa_0_0_insert_insert42$0 | 0, $r_sroa_0_0_insert_insert42$1 | 0) | 0; //@line 6835
   $150$1 = tempRet0; //@line 6836
   $151$0 = $150$1 >> 31 | (($150$1 | 0) < 0 ? -1 : 0) << 1; //@line 6837
   $carry_0203 = $151$0 & 1; //@line 6838
   $r_sroa_0_1201 = _i64Subtract($r_sroa_0_0_insert_insert42$0 | 0, $r_sroa_0_0_insert_insert42$1 | 0, $151$0 & $d_sroa_0_0_insert_insert99$0 | 0, ((($150$1 | 0) < 0 ? -1 : 0) >> 31 | (($150$1 | 0) < 0 ? -1 : 0) << 1) & $d_sroa_0_0_insert_insert99$1 | 0) | 0; //@line 6840
   $r_sroa_1_1200 = tempRet0; //@line 6841
   $sr_1202 = $sr_1202 - 1 | 0; //@line 6842
  } while (($sr_1202 | 0) != 0);
  $q_sroa_1_1_lcssa = $q_sroa_1_1198; //@line 6854
  $q_sroa_0_1_lcssa = $q_sroa_0_1199; //@line 6855
  $r_sroa_1_1_lcssa = $r_sroa_1_1200; //@line 6856
  $r_sroa_0_1_lcssa = $r_sroa_0_1201; //@line 6857
  $carry_0_lcssa$1 = 0; //@line 6858
  $carry_0_lcssa$0 = $carry_0203; //@line 6859
 }
 $q_sroa_0_0_insert_ext75$0 = $q_sroa_0_1_lcssa; //@line 6861
 $q_sroa_0_0_insert_ext75$1 = 0; //@line 6862
 if ($rem | 0) {
  HEAP32[$rem >> 2] = $r_sroa_0_1_lcssa; //@line 6865
  HEAP32[$rem + 4 >> 2] = $r_sroa_1_1_lcssa; //@line 6866
 }
 $_0$1 = ($q_sroa_0_0_insert_ext75$0 | 0) >>> 31 | ($q_sroa_1_1_lcssa | $q_sroa_0_0_insert_ext75$1) << 1 | ($q_sroa_0_0_insert_ext75$1 << 1 | $q_sroa_0_0_insert_ext75$0 >>> 31) & 0 | $carry_0_lcssa$1; //@line 6868
 $_0$0 = ($q_sroa_0_0_insert_ext75$0 << 1 | 0 >>> 31) & -2 | $carry_0_lcssa$0; //@line 6869
 return (tempRet0 = $_0$1, $_0$0) | 0; //@line 6870
}
function __ZN6C128329characterEiii__async_cb_21($0) {
 $0 = $0 | 0;
 var $$04142$us = 0, $$043$us$reg2mem$0 = 0, $$reg2mem$0 = 0, $$reg2mem17$0 = 0, $$reg2mem21$0 = 0, $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $20 = 0, $22 = 0, $24 = 0, $26 = 0, $28 = 0, $30 = 0, $32 = 0, $4 = 0, $44 = 0, $47 = 0, $48 = 0, $49 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0, $67 = 0, $68 = 0, $69 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $78 = 0, $79 = 0, $8 = 0, $ReallocAsyncCtx3 = 0, $ReallocAsyncCtx4 = 0, sp = 0;
 sp = STACKTOP; //@line 1890
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 1894
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 1896
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 1898
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 1900
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 1902
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 1904
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 1906
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 1908
 $20 = HEAP32[$0 + 40 >> 2] | 0; //@line 1910
 $22 = HEAP32[$0 + 44 >> 2] | 0; //@line 1912
 $24 = HEAP32[$0 + 48 >> 2] | 0; //@line 1914
 $26 = HEAP8[$0 + 52 >> 0] | 0; //@line 1916
 $28 = HEAP32[$0 + 56 >> 2] | 0; //@line 1918
 $30 = HEAP32[$0 + 60 >> 2] | 0; //@line 1920
 $79 = (HEAP32[$0 + 4 >> 2] | 0) + 1 | 0; //@line 1921
 do {
  if (($79 | 0) == ($4 | 0)) {
   $32 = $6 + 1 | 0; //@line 1925
   if (($32 | 0) != ($8 | 0)) {
    $$04142$us = 0; //@line 1934
    $$043$us$reg2mem$0 = $32; //@line 1934
    $$reg2mem$0 = ($32 >>> 3 & 31) + 1 | 0; //@line 1934
    $$reg2mem17$0 = 1 << ($32 & 7); //@line 1934
    $$reg2mem21$0 = $32 + $30 | 0; //@line 1934
    break;
   }
   HEAP32[$28 >> 2] = (HEAP32[$28 >> 2] | 0) + ($26 & 255); //@line 1940
   return;
  } else {
   $$04142$us = $79; //@line 1943
   $$043$us$reg2mem$0 = $6; //@line 1943
   $$reg2mem$0 = $12; //@line 1943
   $$reg2mem17$0 = $16; //@line 1943
   $$reg2mem21$0 = $24; //@line 1943
  }
 } while (0);
 $44 = ($$reg2mem17$0 & (HEAPU8[$14 + ($$reg2mem$0 + (Math_imul($$04142$us, $10) | 0)) >> 0] | 0) | 0) == 0; //@line 1952
 $47 = HEAP32[(HEAP32[$18 >> 2] | 0) + 120 >> 2] | 0; //@line 1955
 $48 = $$04142$us + $20 | 0; //@line 1956
 if ($44) {
  $ReallocAsyncCtx4 = _emscripten_realloc_async_context(64) | 0; //@line 1958
  FUNCTION_TABLE_viiii[$47 & 7]($22, $48, $$reg2mem21$0, 0); //@line 1959
  if (___async) {
   HEAP32[$ReallocAsyncCtx4 >> 2] = 41; //@line 1962
   $64 = $ReallocAsyncCtx4 + 4 | 0; //@line 1963
   HEAP32[$64 >> 2] = $$04142$us; //@line 1964
   $65 = $ReallocAsyncCtx4 + 8 | 0; //@line 1965
   HEAP32[$65 >> 2] = $4; //@line 1966
   $66 = $ReallocAsyncCtx4 + 12 | 0; //@line 1967
   HEAP32[$66 >> 2] = $$043$us$reg2mem$0; //@line 1968
   $67 = $ReallocAsyncCtx4 + 16 | 0; //@line 1969
   HEAP32[$67 >> 2] = $8; //@line 1970
   $68 = $ReallocAsyncCtx4 + 20 | 0; //@line 1971
   HEAP32[$68 >> 2] = $10; //@line 1972
   $69 = $ReallocAsyncCtx4 + 24 | 0; //@line 1973
   HEAP32[$69 >> 2] = $$reg2mem$0; //@line 1974
   $70 = $ReallocAsyncCtx4 + 28 | 0; //@line 1975
   HEAP32[$70 >> 2] = $14; //@line 1976
   $71 = $ReallocAsyncCtx4 + 32 | 0; //@line 1977
   HEAP32[$71 >> 2] = $$reg2mem17$0; //@line 1978
   $72 = $ReallocAsyncCtx4 + 36 | 0; //@line 1979
   HEAP32[$72 >> 2] = $18; //@line 1980
   $73 = $ReallocAsyncCtx4 + 40 | 0; //@line 1981
   HEAP32[$73 >> 2] = $20; //@line 1982
   $74 = $ReallocAsyncCtx4 + 44 | 0; //@line 1983
   HEAP32[$74 >> 2] = $22; //@line 1984
   $75 = $ReallocAsyncCtx4 + 48 | 0; //@line 1985
   HEAP32[$75 >> 2] = $$reg2mem21$0; //@line 1986
   $76 = $ReallocAsyncCtx4 + 52 | 0; //@line 1987
   HEAP8[$76 >> 0] = $26; //@line 1988
   $77 = $ReallocAsyncCtx4 + 56 | 0; //@line 1989
   HEAP32[$77 >> 2] = $28; //@line 1990
   $78 = $ReallocAsyncCtx4 + 60 | 0; //@line 1991
   HEAP32[$78 >> 2] = $30; //@line 1992
   sp = STACKTOP; //@line 1993
   return;
  }
  ___async_unwind = 0; //@line 1996
  HEAP32[$ReallocAsyncCtx4 >> 2] = 41; //@line 1997
  $64 = $ReallocAsyncCtx4 + 4 | 0; //@line 1998
  HEAP32[$64 >> 2] = $$04142$us; //@line 1999
  $65 = $ReallocAsyncCtx4 + 8 | 0; //@line 2000
  HEAP32[$65 >> 2] = $4; //@line 2001
  $66 = $ReallocAsyncCtx4 + 12 | 0; //@line 2002
  HEAP32[$66 >> 2] = $$043$us$reg2mem$0; //@line 2003
  $67 = $ReallocAsyncCtx4 + 16 | 0; //@line 2004
  HEAP32[$67 >> 2] = $8; //@line 2005
  $68 = $ReallocAsyncCtx4 + 20 | 0; //@line 2006
  HEAP32[$68 >> 2] = $10; //@line 2007
  $69 = $ReallocAsyncCtx4 + 24 | 0; //@line 2008
  HEAP32[$69 >> 2] = $$reg2mem$0; //@line 2009
  $70 = $ReallocAsyncCtx4 + 28 | 0; //@line 2010
  HEAP32[$70 >> 2] = $14; //@line 2011
  $71 = $ReallocAsyncCtx4 + 32 | 0; //@line 2012
  HEAP32[$71 >> 2] = $$reg2mem17$0; //@line 2013
  $72 = $ReallocAsyncCtx4 + 36 | 0; //@line 2014
  HEAP32[$72 >> 2] = $18; //@line 2015
  $73 = $ReallocAsyncCtx4 + 40 | 0; //@line 2016
  HEAP32[$73 >> 2] = $20; //@line 2017
  $74 = $ReallocAsyncCtx4 + 44 | 0; //@line 2018
  HEAP32[$74 >> 2] = $22; //@line 2019
  $75 = $ReallocAsyncCtx4 + 48 | 0; //@line 2020
  HEAP32[$75 >> 2] = $$reg2mem21$0; //@line 2021
  $76 = $ReallocAsyncCtx4 + 52 | 0; //@line 2022
  HEAP8[$76 >> 0] = $26; //@line 2023
  $77 = $ReallocAsyncCtx4 + 56 | 0; //@line 2024
  HEAP32[$77 >> 2] = $28; //@line 2025
  $78 = $ReallocAsyncCtx4 + 60 | 0; //@line 2026
  HEAP32[$78 >> 2] = $30; //@line 2027
  sp = STACKTOP; //@line 2028
  return;
 } else {
  $ReallocAsyncCtx3 = _emscripten_realloc_async_context(64) | 0; //@line 2031
  FUNCTION_TABLE_viiii[$47 & 7]($22, $48, $$reg2mem21$0, 1); //@line 2032
  if (___async) {
   HEAP32[$ReallocAsyncCtx3 >> 2] = 40; //@line 2035
   $49 = $ReallocAsyncCtx3 + 4 | 0; //@line 2036
   HEAP32[$49 >> 2] = $$04142$us; //@line 2037
   $50 = $ReallocAsyncCtx3 + 8 | 0; //@line 2038
   HEAP32[$50 >> 2] = $4; //@line 2039
   $51 = $ReallocAsyncCtx3 + 12 | 0; //@line 2040
   HEAP32[$51 >> 2] = $$043$us$reg2mem$0; //@line 2041
   $52 = $ReallocAsyncCtx3 + 16 | 0; //@line 2042
   HEAP32[$52 >> 2] = $8; //@line 2043
   $53 = $ReallocAsyncCtx3 + 20 | 0; //@line 2044
   HEAP32[$53 >> 2] = $10; //@line 2045
   $54 = $ReallocAsyncCtx3 + 24 | 0; //@line 2046
   HEAP32[$54 >> 2] = $$reg2mem$0; //@line 2047
   $55 = $ReallocAsyncCtx3 + 28 | 0; //@line 2048
   HEAP32[$55 >> 2] = $14; //@line 2049
   $56 = $ReallocAsyncCtx3 + 32 | 0; //@line 2050
   HEAP32[$56 >> 2] = $$reg2mem17$0; //@line 2051
   $57 = $ReallocAsyncCtx3 + 36 | 0; //@line 2052
   HEAP32[$57 >> 2] = $18; //@line 2053
   $58 = $ReallocAsyncCtx3 + 40 | 0; //@line 2054
   HEAP32[$58 >> 2] = $20; //@line 2055
   $59 = $ReallocAsyncCtx3 + 44 | 0; //@line 2056
   HEAP32[$59 >> 2] = $22; //@line 2057
   $60 = $ReallocAsyncCtx3 + 48 | 0; //@line 2058
   HEAP32[$60 >> 2] = $$reg2mem21$0; //@line 2059
   $61 = $ReallocAsyncCtx3 + 52 | 0; //@line 2060
   HEAP8[$61 >> 0] = $26; //@line 2061
   $62 = $ReallocAsyncCtx3 + 56 | 0; //@line 2062
   HEAP32[$62 >> 2] = $28; //@line 2063
   $63 = $ReallocAsyncCtx3 + 60 | 0; //@line 2064
   HEAP32[$63 >> 2] = $30; //@line 2065
   sp = STACKTOP; //@line 2066
   return;
  }
  ___async_unwind = 0; //@line 2069
  HEAP32[$ReallocAsyncCtx3 >> 2] = 40; //@line 2070
  $49 = $ReallocAsyncCtx3 + 4 | 0; //@line 2071
  HEAP32[$49 >> 2] = $$04142$us; //@line 2072
  $50 = $ReallocAsyncCtx3 + 8 | 0; //@line 2073
  HEAP32[$50 >> 2] = $4; //@line 2074
  $51 = $ReallocAsyncCtx3 + 12 | 0; //@line 2075
  HEAP32[$51 >> 2] = $$043$us$reg2mem$0; //@line 2076
  $52 = $ReallocAsyncCtx3 + 16 | 0; //@line 2077
  HEAP32[$52 >> 2] = $8; //@line 2078
  $53 = $ReallocAsyncCtx3 + 20 | 0; //@line 2079
  HEAP32[$53 >> 2] = $10; //@line 2080
  $54 = $ReallocAsyncCtx3 + 24 | 0; //@line 2081
  HEAP32[$54 >> 2] = $$reg2mem$0; //@line 2082
  $55 = $ReallocAsyncCtx3 + 28 | 0; //@line 2083
  HEAP32[$55 >> 2] = $14; //@line 2084
  $56 = $ReallocAsyncCtx3 + 32 | 0; //@line 2085
  HEAP32[$56 >> 2] = $$reg2mem17$0; //@line 2086
  $57 = $ReallocAsyncCtx3 + 36 | 0; //@line 2087
  HEAP32[$57 >> 2] = $18; //@line 2088
  $58 = $ReallocAsyncCtx3 + 40 | 0; //@line 2089
  HEAP32[$58 >> 2] = $20; //@line 2090
  $59 = $ReallocAsyncCtx3 + 44 | 0; //@line 2091
  HEAP32[$59 >> 2] = $22; //@line 2092
  $60 = $ReallocAsyncCtx3 + 48 | 0; //@line 2093
  HEAP32[$60 >> 2] = $$reg2mem21$0; //@line 2094
  $61 = $ReallocAsyncCtx3 + 52 | 0; //@line 2095
  HEAP8[$61 >> 0] = $26; //@line 2096
  $62 = $ReallocAsyncCtx3 + 56 | 0; //@line 2097
  HEAP32[$62 >> 2] = $28; //@line 2098
  $63 = $ReallocAsyncCtx3 + 60 | 0; //@line 2099
  HEAP32[$63 >> 2] = $30; //@line 2100
  sp = STACKTOP; //@line 2101
  return;
 }
}
function __ZN6C128329characterEiii__async_cb_20($0) {
 $0 = $0 | 0;
 var $$04142$us = 0, $$043$us$reg2mem$0 = 0, $$reg2mem$0 = 0, $$reg2mem17$0 = 0, $$reg2mem21$0 = 0, $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $20 = 0, $22 = 0, $24 = 0, $26 = 0, $28 = 0, $30 = 0, $32 = 0, $4 = 0, $44 = 0, $47 = 0, $48 = 0, $49 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0, $67 = 0, $68 = 0, $69 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $78 = 0, $79 = 0, $8 = 0, $ReallocAsyncCtx3 = 0, $ReallocAsyncCtx4 = 0, sp = 0;
 sp = STACKTOP; //@line 1668
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 1672
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 1674
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 1676
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 1678
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 1680
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 1682
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 1684
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 1686
 $20 = HEAP32[$0 + 40 >> 2] | 0; //@line 1688
 $22 = HEAP32[$0 + 44 >> 2] | 0; //@line 1690
 $24 = HEAP32[$0 + 48 >> 2] | 0; //@line 1692
 $26 = HEAP8[$0 + 52 >> 0] | 0; //@line 1694
 $28 = HEAP32[$0 + 56 >> 2] | 0; //@line 1696
 $30 = HEAP32[$0 + 60 >> 2] | 0; //@line 1698
 $79 = (HEAP32[$0 + 4 >> 2] | 0) + 1 | 0; //@line 1699
 do {
  if (($79 | 0) == ($4 | 0)) {
   $32 = $6 + 1 | 0; //@line 1703
   if (($32 | 0) != ($8 | 0)) {
    $$04142$us = 0; //@line 1712
    $$043$us$reg2mem$0 = $32; //@line 1712
    $$reg2mem$0 = ($32 >>> 3 & 31) + 1 | 0; //@line 1712
    $$reg2mem17$0 = 1 << ($32 & 7); //@line 1712
    $$reg2mem21$0 = $32 + $30 | 0; //@line 1712
    break;
   }
   HEAP32[$28 >> 2] = (HEAP32[$28 >> 2] | 0) + ($26 & 255); //@line 1718
   return;
  } else {
   $$04142$us = $79; //@line 1721
   $$043$us$reg2mem$0 = $6; //@line 1721
   $$reg2mem$0 = $12; //@line 1721
   $$reg2mem17$0 = $16; //@line 1721
   $$reg2mem21$0 = $24; //@line 1721
  }
 } while (0);
 $44 = ($$reg2mem17$0 & (HEAPU8[$14 + ($$reg2mem$0 + (Math_imul($$04142$us, $10) | 0)) >> 0] | 0) | 0) == 0; //@line 1730
 $47 = HEAP32[(HEAP32[$18 >> 2] | 0) + 120 >> 2] | 0; //@line 1733
 $48 = $$04142$us + $20 | 0; //@line 1734
 if ($44) {
  $ReallocAsyncCtx4 = _emscripten_realloc_async_context(64) | 0; //@line 1736
  FUNCTION_TABLE_viiii[$47 & 7]($22, $48, $$reg2mem21$0, 0); //@line 1737
  if (___async) {
   HEAP32[$ReallocAsyncCtx4 >> 2] = 41; //@line 1740
   $64 = $ReallocAsyncCtx4 + 4 | 0; //@line 1741
   HEAP32[$64 >> 2] = $$04142$us; //@line 1742
   $65 = $ReallocAsyncCtx4 + 8 | 0; //@line 1743
   HEAP32[$65 >> 2] = $4; //@line 1744
   $66 = $ReallocAsyncCtx4 + 12 | 0; //@line 1745
   HEAP32[$66 >> 2] = $$043$us$reg2mem$0; //@line 1746
   $67 = $ReallocAsyncCtx4 + 16 | 0; //@line 1747
   HEAP32[$67 >> 2] = $8; //@line 1748
   $68 = $ReallocAsyncCtx4 + 20 | 0; //@line 1749
   HEAP32[$68 >> 2] = $10; //@line 1750
   $69 = $ReallocAsyncCtx4 + 24 | 0; //@line 1751
   HEAP32[$69 >> 2] = $$reg2mem$0; //@line 1752
   $70 = $ReallocAsyncCtx4 + 28 | 0; //@line 1753
   HEAP32[$70 >> 2] = $14; //@line 1754
   $71 = $ReallocAsyncCtx4 + 32 | 0; //@line 1755
   HEAP32[$71 >> 2] = $$reg2mem17$0; //@line 1756
   $72 = $ReallocAsyncCtx4 + 36 | 0; //@line 1757
   HEAP32[$72 >> 2] = $18; //@line 1758
   $73 = $ReallocAsyncCtx4 + 40 | 0; //@line 1759
   HEAP32[$73 >> 2] = $20; //@line 1760
   $74 = $ReallocAsyncCtx4 + 44 | 0; //@line 1761
   HEAP32[$74 >> 2] = $22; //@line 1762
   $75 = $ReallocAsyncCtx4 + 48 | 0; //@line 1763
   HEAP32[$75 >> 2] = $$reg2mem21$0; //@line 1764
   $76 = $ReallocAsyncCtx4 + 52 | 0; //@line 1765
   HEAP8[$76 >> 0] = $26; //@line 1766
   $77 = $ReallocAsyncCtx4 + 56 | 0; //@line 1767
   HEAP32[$77 >> 2] = $28; //@line 1768
   $78 = $ReallocAsyncCtx4 + 60 | 0; //@line 1769
   HEAP32[$78 >> 2] = $30; //@line 1770
   sp = STACKTOP; //@line 1771
   return;
  }
  ___async_unwind = 0; //@line 1774
  HEAP32[$ReallocAsyncCtx4 >> 2] = 41; //@line 1775
  $64 = $ReallocAsyncCtx4 + 4 | 0; //@line 1776
  HEAP32[$64 >> 2] = $$04142$us; //@line 1777
  $65 = $ReallocAsyncCtx4 + 8 | 0; //@line 1778
  HEAP32[$65 >> 2] = $4; //@line 1779
  $66 = $ReallocAsyncCtx4 + 12 | 0; //@line 1780
  HEAP32[$66 >> 2] = $$043$us$reg2mem$0; //@line 1781
  $67 = $ReallocAsyncCtx4 + 16 | 0; //@line 1782
  HEAP32[$67 >> 2] = $8; //@line 1783
  $68 = $ReallocAsyncCtx4 + 20 | 0; //@line 1784
  HEAP32[$68 >> 2] = $10; //@line 1785
  $69 = $ReallocAsyncCtx4 + 24 | 0; //@line 1786
  HEAP32[$69 >> 2] = $$reg2mem$0; //@line 1787
  $70 = $ReallocAsyncCtx4 + 28 | 0; //@line 1788
  HEAP32[$70 >> 2] = $14; //@line 1789
  $71 = $ReallocAsyncCtx4 + 32 | 0; //@line 1790
  HEAP32[$71 >> 2] = $$reg2mem17$0; //@line 1791
  $72 = $ReallocAsyncCtx4 + 36 | 0; //@line 1792
  HEAP32[$72 >> 2] = $18; //@line 1793
  $73 = $ReallocAsyncCtx4 + 40 | 0; //@line 1794
  HEAP32[$73 >> 2] = $20; //@line 1795
  $74 = $ReallocAsyncCtx4 + 44 | 0; //@line 1796
  HEAP32[$74 >> 2] = $22; //@line 1797
  $75 = $ReallocAsyncCtx4 + 48 | 0; //@line 1798
  HEAP32[$75 >> 2] = $$reg2mem21$0; //@line 1799
  $76 = $ReallocAsyncCtx4 + 52 | 0; //@line 1800
  HEAP8[$76 >> 0] = $26; //@line 1801
  $77 = $ReallocAsyncCtx4 + 56 | 0; //@line 1802
  HEAP32[$77 >> 2] = $28; //@line 1803
  $78 = $ReallocAsyncCtx4 + 60 | 0; //@line 1804
  HEAP32[$78 >> 2] = $30; //@line 1805
  sp = STACKTOP; //@line 1806
  return;
 } else {
  $ReallocAsyncCtx3 = _emscripten_realloc_async_context(64) | 0; //@line 1809
  FUNCTION_TABLE_viiii[$47 & 7]($22, $48, $$reg2mem21$0, 1); //@line 1810
  if (___async) {
   HEAP32[$ReallocAsyncCtx3 >> 2] = 40; //@line 1813
   $49 = $ReallocAsyncCtx3 + 4 | 0; //@line 1814
   HEAP32[$49 >> 2] = $$04142$us; //@line 1815
   $50 = $ReallocAsyncCtx3 + 8 | 0; //@line 1816
   HEAP32[$50 >> 2] = $4; //@line 1817
   $51 = $ReallocAsyncCtx3 + 12 | 0; //@line 1818
   HEAP32[$51 >> 2] = $$043$us$reg2mem$0; //@line 1819
   $52 = $ReallocAsyncCtx3 + 16 | 0; //@line 1820
   HEAP32[$52 >> 2] = $8; //@line 1821
   $53 = $ReallocAsyncCtx3 + 20 | 0; //@line 1822
   HEAP32[$53 >> 2] = $10; //@line 1823
   $54 = $ReallocAsyncCtx3 + 24 | 0; //@line 1824
   HEAP32[$54 >> 2] = $$reg2mem$0; //@line 1825
   $55 = $ReallocAsyncCtx3 + 28 | 0; //@line 1826
   HEAP32[$55 >> 2] = $14; //@line 1827
   $56 = $ReallocAsyncCtx3 + 32 | 0; //@line 1828
   HEAP32[$56 >> 2] = $$reg2mem17$0; //@line 1829
   $57 = $ReallocAsyncCtx3 + 36 | 0; //@line 1830
   HEAP32[$57 >> 2] = $18; //@line 1831
   $58 = $ReallocAsyncCtx3 + 40 | 0; //@line 1832
   HEAP32[$58 >> 2] = $20; //@line 1833
   $59 = $ReallocAsyncCtx3 + 44 | 0; //@line 1834
   HEAP32[$59 >> 2] = $22; //@line 1835
   $60 = $ReallocAsyncCtx3 + 48 | 0; //@line 1836
   HEAP32[$60 >> 2] = $$reg2mem21$0; //@line 1837
   $61 = $ReallocAsyncCtx3 + 52 | 0; //@line 1838
   HEAP8[$61 >> 0] = $26; //@line 1839
   $62 = $ReallocAsyncCtx3 + 56 | 0; //@line 1840
   HEAP32[$62 >> 2] = $28; //@line 1841
   $63 = $ReallocAsyncCtx3 + 60 | 0; //@line 1842
   HEAP32[$63 >> 2] = $30; //@line 1843
   sp = STACKTOP; //@line 1844
   return;
  }
  ___async_unwind = 0; //@line 1847
  HEAP32[$ReallocAsyncCtx3 >> 2] = 40; //@line 1848
  $49 = $ReallocAsyncCtx3 + 4 | 0; //@line 1849
  HEAP32[$49 >> 2] = $$04142$us; //@line 1850
  $50 = $ReallocAsyncCtx3 + 8 | 0; //@line 1851
  HEAP32[$50 >> 2] = $4; //@line 1852
  $51 = $ReallocAsyncCtx3 + 12 | 0; //@line 1853
  HEAP32[$51 >> 2] = $$043$us$reg2mem$0; //@line 1854
  $52 = $ReallocAsyncCtx3 + 16 | 0; //@line 1855
  HEAP32[$52 >> 2] = $8; //@line 1856
  $53 = $ReallocAsyncCtx3 + 20 | 0; //@line 1857
  HEAP32[$53 >> 2] = $10; //@line 1858
  $54 = $ReallocAsyncCtx3 + 24 | 0; //@line 1859
  HEAP32[$54 >> 2] = $$reg2mem$0; //@line 1860
  $55 = $ReallocAsyncCtx3 + 28 | 0; //@line 1861
  HEAP32[$55 >> 2] = $14; //@line 1862
  $56 = $ReallocAsyncCtx3 + 32 | 0; //@line 1863
  HEAP32[$56 >> 2] = $$reg2mem17$0; //@line 1864
  $57 = $ReallocAsyncCtx3 + 36 | 0; //@line 1865
  HEAP32[$57 >> 2] = $18; //@line 1866
  $58 = $ReallocAsyncCtx3 + 40 | 0; //@line 1867
  HEAP32[$58 >> 2] = $20; //@line 1868
  $59 = $ReallocAsyncCtx3 + 44 | 0; //@line 1869
  HEAP32[$59 >> 2] = $22; //@line 1870
  $60 = $ReallocAsyncCtx3 + 48 | 0; //@line 1871
  HEAP32[$60 >> 2] = $$reg2mem21$0; //@line 1872
  $61 = $ReallocAsyncCtx3 + 52 | 0; //@line 1873
  HEAP8[$61 >> 0] = $26; //@line 1874
  $62 = $ReallocAsyncCtx3 + 56 | 0; //@line 1875
  HEAP32[$62 >> 2] = $28; //@line 1876
  $63 = $ReallocAsyncCtx3 + 60 | 0; //@line 1877
  HEAP32[$63 >> 2] = $30; //@line 1878
  sp = STACKTOP; //@line 1879
  return;
 }
}
function _mbed_die() {
 var $0 = 0, $AsyncCtx = 0, $AsyncCtx11 = 0, $AsyncCtx15 = 0, $AsyncCtx19 = 0, $AsyncCtx23 = 0, $AsyncCtx27 = 0, $AsyncCtx3 = 0, $AsyncCtx31 = 0, $AsyncCtx35 = 0, $AsyncCtx39 = 0, $AsyncCtx43 = 0, $AsyncCtx47 = 0, $AsyncCtx51 = 0, $AsyncCtx55 = 0, $AsyncCtx59 = 0, $AsyncCtx7 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 3044
 STACKTOP = STACKTOP + 32 | 0; //@line 3045
 $0 = sp; //@line 3046
 _gpio_init_out($0, 50); //@line 3047
 while (1) {
  _emscripten_asm_const_iii(3, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 3050
  $AsyncCtx59 = _emscripten_alloc_async_context(8, sp) | 0; //@line 3051
  _wait_ms(150); //@line 3052
  if (___async) {
   label = 3; //@line 3055
   break;
  }
  _emscripten_free_async_context($AsyncCtx59 | 0); //@line 3058
  _emscripten_asm_const_iii(3, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 3060
  $AsyncCtx55 = _emscripten_alloc_async_context(8, sp) | 0; //@line 3061
  _wait_ms(150); //@line 3062
  if (___async) {
   label = 5; //@line 3065
   break;
  }
  _emscripten_free_async_context($AsyncCtx55 | 0); //@line 3068
  _emscripten_asm_const_iii(3, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 3070
  $AsyncCtx51 = _emscripten_alloc_async_context(8, sp) | 0; //@line 3071
  _wait_ms(150); //@line 3072
  if (___async) {
   label = 7; //@line 3075
   break;
  }
  _emscripten_free_async_context($AsyncCtx51 | 0); //@line 3078
  _emscripten_asm_const_iii(3, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 3080
  $AsyncCtx47 = _emscripten_alloc_async_context(8, sp) | 0; //@line 3081
  _wait_ms(150); //@line 3082
  if (___async) {
   label = 9; //@line 3085
   break;
  }
  _emscripten_free_async_context($AsyncCtx47 | 0); //@line 3088
  _emscripten_asm_const_iii(3, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 3090
  $AsyncCtx43 = _emscripten_alloc_async_context(8, sp) | 0; //@line 3091
  _wait_ms(150); //@line 3092
  if (___async) {
   label = 11; //@line 3095
   break;
  }
  _emscripten_free_async_context($AsyncCtx43 | 0); //@line 3098
  _emscripten_asm_const_iii(3, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 3100
  $AsyncCtx39 = _emscripten_alloc_async_context(8, sp) | 0; //@line 3101
  _wait_ms(150); //@line 3102
  if (___async) {
   label = 13; //@line 3105
   break;
  }
  _emscripten_free_async_context($AsyncCtx39 | 0); //@line 3108
  _emscripten_asm_const_iii(3, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 3110
  $AsyncCtx35 = _emscripten_alloc_async_context(8, sp) | 0; //@line 3111
  _wait_ms(150); //@line 3112
  if (___async) {
   label = 15; //@line 3115
   break;
  }
  _emscripten_free_async_context($AsyncCtx35 | 0); //@line 3118
  _emscripten_asm_const_iii(3, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 3120
  $AsyncCtx31 = _emscripten_alloc_async_context(8, sp) | 0; //@line 3121
  _wait_ms(150); //@line 3122
  if (___async) {
   label = 17; //@line 3125
   break;
  }
  _emscripten_free_async_context($AsyncCtx31 | 0); //@line 3128
  _emscripten_asm_const_iii(3, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 3130
  $AsyncCtx27 = _emscripten_alloc_async_context(8, sp) | 0; //@line 3131
  _wait_ms(400); //@line 3132
  if (___async) {
   label = 19; //@line 3135
   break;
  }
  _emscripten_free_async_context($AsyncCtx27 | 0); //@line 3138
  _emscripten_asm_const_iii(3, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 3140
  $AsyncCtx23 = _emscripten_alloc_async_context(8, sp) | 0; //@line 3141
  _wait_ms(400); //@line 3142
  if (___async) {
   label = 21; //@line 3145
   break;
  }
  _emscripten_free_async_context($AsyncCtx23 | 0); //@line 3148
  _emscripten_asm_const_iii(3, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 3150
  $AsyncCtx19 = _emscripten_alloc_async_context(8, sp) | 0; //@line 3151
  _wait_ms(400); //@line 3152
  if (___async) {
   label = 23; //@line 3155
   break;
  }
  _emscripten_free_async_context($AsyncCtx19 | 0); //@line 3158
  _emscripten_asm_const_iii(3, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 3160
  $AsyncCtx15 = _emscripten_alloc_async_context(8, sp) | 0; //@line 3161
  _wait_ms(400); //@line 3162
  if (___async) {
   label = 25; //@line 3165
   break;
  }
  _emscripten_free_async_context($AsyncCtx15 | 0); //@line 3168
  _emscripten_asm_const_iii(3, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 3170
  $AsyncCtx11 = _emscripten_alloc_async_context(8, sp) | 0; //@line 3171
  _wait_ms(400); //@line 3172
  if (___async) {
   label = 27; //@line 3175
   break;
  }
  _emscripten_free_async_context($AsyncCtx11 | 0); //@line 3178
  _emscripten_asm_const_iii(3, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 3180
  $AsyncCtx7 = _emscripten_alloc_async_context(8, sp) | 0; //@line 3181
  _wait_ms(400); //@line 3182
  if (___async) {
   label = 29; //@line 3185
   break;
  }
  _emscripten_free_async_context($AsyncCtx7 | 0); //@line 3188
  _emscripten_asm_const_iii(3, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 3190
  $AsyncCtx3 = _emscripten_alloc_async_context(8, sp) | 0; //@line 3191
  _wait_ms(400); //@line 3192
  if (___async) {
   label = 31; //@line 3195
   break;
  }
  _emscripten_free_async_context($AsyncCtx3 | 0); //@line 3198
  _emscripten_asm_const_iii(3, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 3200
  $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 3201
  _wait_ms(400); //@line 3202
  if (___async) {
   label = 33; //@line 3205
   break;
  }
  _emscripten_free_async_context($AsyncCtx | 0); //@line 3208
 }
 switch (label | 0) {
 case 3:
  {
   HEAP32[$AsyncCtx59 >> 2] = 116; //@line 3212
   HEAP32[$AsyncCtx59 + 4 >> 2] = $0; //@line 3214
   sp = STACKTOP; //@line 3215
   STACKTOP = sp; //@line 3216
   return;
  }
 case 5:
  {
   HEAP32[$AsyncCtx55 >> 2] = 117; //@line 3220
   HEAP32[$AsyncCtx55 + 4 >> 2] = $0; //@line 3222
   sp = STACKTOP; //@line 3223
   STACKTOP = sp; //@line 3224
   return;
  }
 case 7:
  {
   HEAP32[$AsyncCtx51 >> 2] = 118; //@line 3228
   HEAP32[$AsyncCtx51 + 4 >> 2] = $0; //@line 3230
   sp = STACKTOP; //@line 3231
   STACKTOP = sp; //@line 3232
   return;
  }
 case 9:
  {
   HEAP32[$AsyncCtx47 >> 2] = 119; //@line 3236
   HEAP32[$AsyncCtx47 + 4 >> 2] = $0; //@line 3238
   sp = STACKTOP; //@line 3239
   STACKTOP = sp; //@line 3240
   return;
  }
 case 11:
  {
   HEAP32[$AsyncCtx43 >> 2] = 120; //@line 3244
   HEAP32[$AsyncCtx43 + 4 >> 2] = $0; //@line 3246
   sp = STACKTOP; //@line 3247
   STACKTOP = sp; //@line 3248
   return;
  }
 case 13:
  {
   HEAP32[$AsyncCtx39 >> 2] = 121; //@line 3252
   HEAP32[$AsyncCtx39 + 4 >> 2] = $0; //@line 3254
   sp = STACKTOP; //@line 3255
   STACKTOP = sp; //@line 3256
   return;
  }
 case 15:
  {
   HEAP32[$AsyncCtx35 >> 2] = 122; //@line 3260
   HEAP32[$AsyncCtx35 + 4 >> 2] = $0; //@line 3262
   sp = STACKTOP; //@line 3263
   STACKTOP = sp; //@line 3264
   return;
  }
 case 17:
  {
   HEAP32[$AsyncCtx31 >> 2] = 123; //@line 3268
   HEAP32[$AsyncCtx31 + 4 >> 2] = $0; //@line 3270
   sp = STACKTOP; //@line 3271
   STACKTOP = sp; //@line 3272
   return;
  }
 case 19:
  {
   HEAP32[$AsyncCtx27 >> 2] = 124; //@line 3276
   HEAP32[$AsyncCtx27 + 4 >> 2] = $0; //@line 3278
   sp = STACKTOP; //@line 3279
   STACKTOP = sp; //@line 3280
   return;
  }
 case 21:
  {
   HEAP32[$AsyncCtx23 >> 2] = 125; //@line 3284
   HEAP32[$AsyncCtx23 + 4 >> 2] = $0; //@line 3286
   sp = STACKTOP; //@line 3287
   STACKTOP = sp; //@line 3288
   return;
  }
 case 23:
  {
   HEAP32[$AsyncCtx19 >> 2] = 126; //@line 3292
   HEAP32[$AsyncCtx19 + 4 >> 2] = $0; //@line 3294
   sp = STACKTOP; //@line 3295
   STACKTOP = sp; //@line 3296
   return;
  }
 case 25:
  {
   HEAP32[$AsyncCtx15 >> 2] = 127; //@line 3300
   HEAP32[$AsyncCtx15 + 4 >> 2] = $0; //@line 3302
   sp = STACKTOP; //@line 3303
   STACKTOP = sp; //@line 3304
   return;
  }
 case 27:
  {
   HEAP32[$AsyncCtx11 >> 2] = 128; //@line 3308
   HEAP32[$AsyncCtx11 + 4 >> 2] = $0; //@line 3310
   sp = STACKTOP; //@line 3311
   STACKTOP = sp; //@line 3312
   return;
  }
 case 29:
  {
   HEAP32[$AsyncCtx7 >> 2] = 129; //@line 3316
   HEAP32[$AsyncCtx7 + 4 >> 2] = $0; //@line 3318
   sp = STACKTOP; //@line 3319
   STACKTOP = sp; //@line 3320
   return;
  }
 case 31:
  {
   HEAP32[$AsyncCtx3 >> 2] = 130; //@line 3324
   HEAP32[$AsyncCtx3 + 4 >> 2] = $0; //@line 3326
   sp = STACKTOP; //@line 3327
   STACKTOP = sp; //@line 3328
   return;
  }
 case 33:
  {
   HEAP32[$AsyncCtx >> 2] = 131; //@line 3332
   HEAP32[$AsyncCtx + 4 >> 2] = $0; //@line 3334
   sp = STACKTOP; //@line 3335
   STACKTOP = sp; //@line 3336
   return;
  }
 }
}
function __ZN6C128329characterEiii__async_cb_19($0) {
 $0 = $0 | 0;
 var $10 = 0, $14 = 0, $16 = 0, $18 = 0, $20 = 0, $22 = 0, $24 = 0, $26 = 0, $28 = 0, $30 = 0, $39 = 0, $40 = 0, $45 = 0, $47 = 0, $48 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0, $67 = 0, $68 = 0, $69 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $78 = 0, $79 = 0, $8 = 0, $80 = 0, $81 = 0, $82 = 0, $83 = 0, $84 = 0, $85 = 0, $86 = 0, $87 = 0, $88 = 0, $89 = 0, $ReallocAsyncCtx3 = 0, $ReallocAsyncCtx4 = 0, sp = 0;
 sp = STACKTOP; //@line 1440
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 1446
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 1448
 $10 = HEAP8[$0 + 20 >> 0] | 0; //@line 1450
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 1454
 $16 = HEAP8[$0 + 32 >> 0] | 0; //@line 1456
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 1458
 $20 = HEAP32[$0 + 40 >> 2] | 0; //@line 1460
 $22 = HEAP32[$0 + 44 >> 2] | 0; //@line 1462
 $24 = HEAP32[$0 + 48 >> 2] | 0; //@line 1464
 $26 = HEAP32[$0 + 52 >> 2] | 0; //@line 1466
 $28 = HEAP32[$0 + 56 >> 2] | 0; //@line 1468
 $30 = HEAP32[HEAP32[$0 + 4 >> 2] >> 2] | 0; //@line 1471
 if ((HEAP32[$0 + 8 >> 2] | 0) >>> 0 >= ((HEAP32[___async_retval >> 2] | 0) - (HEAPU8[$30 + 2 >> 0] | 0) | 0) >>> 0) {
  HEAP32[HEAP32[$0 + 24 >> 2] >> 2] = 0; //@line 1478
 }
 $39 = $30 + ((Math_imul($6 + -32 | 0, $8) | 0) + 4) | 0; //@line 1483
 $40 = HEAP8[$39 >> 0] | 0; //@line 1484
 if ($10 << 24 >> 24) {
  if ($16 << 24 >> 24) {
   $45 = (0 >>> 3 & 31) + 1 | 0; //@line 1491
   $47 = 1 << 0; //@line 1493
   $48 = 0 + $20 | 0; //@line 1494
   $58 = HEAP32[(HEAP32[$18 >> 2] | 0) + 120 >> 2] | 0; //@line 1504
   $59 = 0 + $24 | 0; //@line 1505
   if (!($47 & (HEAPU8[$39 + ($45 + 0) >> 0] | 0))) {
    $ReallocAsyncCtx4 = _emscripten_realloc_async_context(64) | 0; //@line 1507
    FUNCTION_TABLE_viiii[$58 & 7]($18, $59, $48, 0); //@line 1508
    if (___async) {
     HEAP32[$ReallocAsyncCtx4 >> 2] = 41; //@line 1511
     $75 = $ReallocAsyncCtx4 + 4 | 0; //@line 1512
     HEAP32[$75 >> 2] = 0; //@line 1513
     $76 = $ReallocAsyncCtx4 + 8 | 0; //@line 1514
     HEAP32[$76 >> 2] = $26; //@line 1515
     $77 = $ReallocAsyncCtx4 + 12 | 0; //@line 1516
     HEAP32[$77 >> 2] = 0; //@line 1517
     $78 = $ReallocAsyncCtx4 + 16 | 0; //@line 1518
     HEAP32[$78 >> 2] = $28; //@line 1519
     $79 = $ReallocAsyncCtx4 + 20 | 0; //@line 1520
     HEAP32[$79 >> 2] = $22; //@line 1521
     $80 = $ReallocAsyncCtx4 + 24 | 0; //@line 1522
     HEAP32[$80 >> 2] = $45; //@line 1523
     $81 = $ReallocAsyncCtx4 + 28 | 0; //@line 1524
     HEAP32[$81 >> 2] = $39; //@line 1525
     $82 = $ReallocAsyncCtx4 + 32 | 0; //@line 1526
     HEAP32[$82 >> 2] = $47; //@line 1527
     $83 = $ReallocAsyncCtx4 + 36 | 0; //@line 1528
     HEAP32[$83 >> 2] = $18; //@line 1529
     $84 = $ReallocAsyncCtx4 + 40 | 0; //@line 1530
     HEAP32[$84 >> 2] = $24; //@line 1531
     $85 = $ReallocAsyncCtx4 + 44 | 0; //@line 1532
     HEAP32[$85 >> 2] = $18; //@line 1533
     $86 = $ReallocAsyncCtx4 + 48 | 0; //@line 1534
     HEAP32[$86 >> 2] = $48; //@line 1535
     $87 = $ReallocAsyncCtx4 + 52 | 0; //@line 1536
     HEAP8[$87 >> 0] = $40; //@line 1537
     $88 = $ReallocAsyncCtx4 + 56 | 0; //@line 1538
     HEAP32[$88 >> 2] = $14; //@line 1539
     $89 = $ReallocAsyncCtx4 + 60 | 0; //@line 1540
     HEAP32[$89 >> 2] = $20; //@line 1541
     sp = STACKTOP; //@line 1542
     return;
    }
    ___async_unwind = 0; //@line 1545
    HEAP32[$ReallocAsyncCtx4 >> 2] = 41; //@line 1546
    $75 = $ReallocAsyncCtx4 + 4 | 0; //@line 1547
    HEAP32[$75 >> 2] = 0; //@line 1548
    $76 = $ReallocAsyncCtx4 + 8 | 0; //@line 1549
    HEAP32[$76 >> 2] = $26; //@line 1550
    $77 = $ReallocAsyncCtx4 + 12 | 0; //@line 1551
    HEAP32[$77 >> 2] = 0; //@line 1552
    $78 = $ReallocAsyncCtx4 + 16 | 0; //@line 1553
    HEAP32[$78 >> 2] = $28; //@line 1554
    $79 = $ReallocAsyncCtx4 + 20 | 0; //@line 1555
    HEAP32[$79 >> 2] = $22; //@line 1556
    $80 = $ReallocAsyncCtx4 + 24 | 0; //@line 1557
    HEAP32[$80 >> 2] = $45; //@line 1558
    $81 = $ReallocAsyncCtx4 + 28 | 0; //@line 1559
    HEAP32[$81 >> 2] = $39; //@line 1560
    $82 = $ReallocAsyncCtx4 + 32 | 0; //@line 1561
    HEAP32[$82 >> 2] = $47; //@line 1562
    $83 = $ReallocAsyncCtx4 + 36 | 0; //@line 1563
    HEAP32[$83 >> 2] = $18; //@line 1564
    $84 = $ReallocAsyncCtx4 + 40 | 0; //@line 1565
    HEAP32[$84 >> 2] = $24; //@line 1566
    $85 = $ReallocAsyncCtx4 + 44 | 0; //@line 1567
    HEAP32[$85 >> 2] = $18; //@line 1568
    $86 = $ReallocAsyncCtx4 + 48 | 0; //@line 1569
    HEAP32[$86 >> 2] = $48; //@line 1570
    $87 = $ReallocAsyncCtx4 + 52 | 0; //@line 1571
    HEAP8[$87 >> 0] = $40; //@line 1572
    $88 = $ReallocAsyncCtx4 + 56 | 0; //@line 1573
    HEAP32[$88 >> 2] = $14; //@line 1574
    $89 = $ReallocAsyncCtx4 + 60 | 0; //@line 1575
    HEAP32[$89 >> 2] = $20; //@line 1576
    sp = STACKTOP; //@line 1577
    return;
   } else {
    $ReallocAsyncCtx3 = _emscripten_realloc_async_context(64) | 0; //@line 1580
    FUNCTION_TABLE_viiii[$58 & 7]($18, $59, $48, 1); //@line 1581
    if (___async) {
     HEAP32[$ReallocAsyncCtx3 >> 2] = 40; //@line 1584
     $60 = $ReallocAsyncCtx3 + 4 | 0; //@line 1585
     HEAP32[$60 >> 2] = 0; //@line 1586
     $61 = $ReallocAsyncCtx3 + 8 | 0; //@line 1587
     HEAP32[$61 >> 2] = $26; //@line 1588
     $62 = $ReallocAsyncCtx3 + 12 | 0; //@line 1589
     HEAP32[$62 >> 2] = 0; //@line 1590
     $63 = $ReallocAsyncCtx3 + 16 | 0; //@line 1591
     HEAP32[$63 >> 2] = $28; //@line 1592
     $64 = $ReallocAsyncCtx3 + 20 | 0; //@line 1593
     HEAP32[$64 >> 2] = $22; //@line 1594
     $65 = $ReallocAsyncCtx3 + 24 | 0; //@line 1595
     HEAP32[$65 >> 2] = $45; //@line 1596
     $66 = $ReallocAsyncCtx3 + 28 | 0; //@line 1597
     HEAP32[$66 >> 2] = $39; //@line 1598
     $67 = $ReallocAsyncCtx3 + 32 | 0; //@line 1599
     HEAP32[$67 >> 2] = $47; //@line 1600
     $68 = $ReallocAsyncCtx3 + 36 | 0; //@line 1601
     HEAP32[$68 >> 2] = $18; //@line 1602
     $69 = $ReallocAsyncCtx3 + 40 | 0; //@line 1603
     HEAP32[$69 >> 2] = $24; //@line 1604
     $70 = $ReallocAsyncCtx3 + 44 | 0; //@line 1605
     HEAP32[$70 >> 2] = $18; //@line 1606
     $71 = $ReallocAsyncCtx3 + 48 | 0; //@line 1607
     HEAP32[$71 >> 2] = $48; //@line 1608
     $72 = $ReallocAsyncCtx3 + 52 | 0; //@line 1609
     HEAP8[$72 >> 0] = $40; //@line 1610
     $73 = $ReallocAsyncCtx3 + 56 | 0; //@line 1611
     HEAP32[$73 >> 2] = $14; //@line 1612
     $74 = $ReallocAsyncCtx3 + 60 | 0; //@line 1613
     HEAP32[$74 >> 2] = $20; //@line 1614
     sp = STACKTOP; //@line 1615
     return;
    }
    ___async_unwind = 0; //@line 1618
    HEAP32[$ReallocAsyncCtx3 >> 2] = 40; //@line 1619
    $60 = $ReallocAsyncCtx3 + 4 | 0; //@line 1620
    HEAP32[$60 >> 2] = 0; //@line 1621
    $61 = $ReallocAsyncCtx3 + 8 | 0; //@line 1622
    HEAP32[$61 >> 2] = $26; //@line 1623
    $62 = $ReallocAsyncCtx3 + 12 | 0; //@line 1624
    HEAP32[$62 >> 2] = 0; //@line 1625
    $63 = $ReallocAsyncCtx3 + 16 | 0; //@line 1626
    HEAP32[$63 >> 2] = $28; //@line 1627
    $64 = $ReallocAsyncCtx3 + 20 | 0; //@line 1628
    HEAP32[$64 >> 2] = $22; //@line 1629
    $65 = $ReallocAsyncCtx3 + 24 | 0; //@line 1630
    HEAP32[$65 >> 2] = $45; //@line 1631
    $66 = $ReallocAsyncCtx3 + 28 | 0; //@line 1632
    HEAP32[$66 >> 2] = $39; //@line 1633
    $67 = $ReallocAsyncCtx3 + 32 | 0; //@line 1634
    HEAP32[$67 >> 2] = $47; //@line 1635
    $68 = $ReallocAsyncCtx3 + 36 | 0; //@line 1636
    HEAP32[$68 >> 2] = $18; //@line 1637
    $69 = $ReallocAsyncCtx3 + 40 | 0; //@line 1638
    HEAP32[$69 >> 2] = $24; //@line 1639
    $70 = $ReallocAsyncCtx3 + 44 | 0; //@line 1640
    HEAP32[$70 >> 2] = $18; //@line 1641
    $71 = $ReallocAsyncCtx3 + 48 | 0; //@line 1642
    HEAP32[$71 >> 2] = $48; //@line 1643
    $72 = $ReallocAsyncCtx3 + 52 | 0; //@line 1644
    HEAP8[$72 >> 0] = $40; //@line 1645
    $73 = $ReallocAsyncCtx3 + 56 | 0; //@line 1646
    HEAP32[$73 >> 2] = $14; //@line 1647
    $74 = $ReallocAsyncCtx3 + 60 | 0; //@line 1648
    HEAP32[$74 >> 2] = $20; //@line 1649
    sp = STACKTOP; //@line 1650
    return;
   }
  }
 }
 HEAP32[$14 >> 2] = (HEAP32[$14 >> 2] | 0) + ($40 & 255); //@line 1658
 return;
}
function __ZN6C128329characterEiii($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $$04142$us = 0, $$043$us = 0, $10 = 0, $11 = 0, $122 = 0, $123 = 0, $13 = 0, $14 = 0, $17 = 0, $18 = 0, $20 = 0, $23 = 0, $24 = 0, $40 = 0, $42 = 0, $45 = 0, $46 = 0, $5 = 0, $6 = 0, $61 = 0, $70 = 0, $71 = 0, $72 = 0, $77 = 0, $79 = 0, $8 = 0, $80 = 0, $87 = 0, $90 = 0, $91 = 0, $AsyncCtx = 0, $AsyncCtx11 = 0, $AsyncCtx3 = 0, $AsyncCtx7 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 274
 if (($3 + -31 | 0) >>> 0 > 96) {
  return;
 }
 $5 = $0 + 48 | 0; //@line 280
 $6 = HEAP32[$5 >> 2] | 0; //@line 281
 $8 = HEAPU8[$6 >> 0] | 0; //@line 283
 $10 = HEAP8[$6 + 1 >> 0] | 0; //@line 285
 $11 = $10 & 255; //@line 286
 $13 = HEAP8[$6 + 2 >> 0] | 0; //@line 288
 $14 = $13 & 255; //@line 289
 $17 = HEAPU8[$6 + 3 >> 0] | 0; //@line 292
 $18 = $0 + 60 | 0; //@line 293
 $20 = (HEAP32[$18 >> 2] | 0) + $11 | 0; //@line 295
 $23 = HEAP32[(HEAP32[$0 >> 2] | 0) + 124 >> 2] | 0; //@line 298
 $AsyncCtx = _emscripten_alloc_async_context(60, sp) | 0; //@line 299
 $24 = FUNCTION_TABLE_ii[$23 & 31]($0) | 0; //@line 300
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 38; //@line 303
  HEAP32[$AsyncCtx + 4 >> 2] = $2; //@line 305
  HEAP8[$AsyncCtx + 8 >> 0] = $10; //@line 307
  HEAP32[$AsyncCtx + 12 >> 2] = $0; //@line 309
  HEAP32[$AsyncCtx + 16 >> 2] = $17; //@line 311
  HEAP32[$AsyncCtx + 20 >> 2] = $1; //@line 313
  HEAP32[$AsyncCtx + 24 >> 2] = $18; //@line 315
  HEAP32[$AsyncCtx + 28 >> 2] = $14; //@line 317
  HEAP32[$AsyncCtx + 32 >> 2] = $0; //@line 319
  HEAP32[$AsyncCtx + 36 >> 2] = $5; //@line 321
  HEAP32[$AsyncCtx + 40 >> 2] = $3; //@line 323
  HEAP32[$AsyncCtx + 44 >> 2] = $8; //@line 325
  HEAP8[$AsyncCtx + 48 >> 0] = $13; //@line 327
  HEAP32[$AsyncCtx + 52 >> 2] = $20; //@line 329
  HEAP32[$AsyncCtx + 56 >> 2] = $11; //@line 331
  sp = STACKTOP; //@line 332
  return;
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 335
 if ($20 >>> 0 > $24 >>> 0) {
  HEAP32[$18 >> 2] = 0; //@line 338
  $40 = $0 + 64 | 0; //@line 339
  $42 = (HEAP32[$40 >> 2] | 0) + $14 | 0; //@line 341
  HEAP32[$40 >> 2] = $42; //@line 342
  $45 = HEAP32[(HEAP32[$0 >> 2] | 0) + 128 >> 2] | 0; //@line 345
  $AsyncCtx3 = _emscripten_alloc_async_context(60, sp) | 0; //@line 346
  $46 = FUNCTION_TABLE_ii[$45 & 31]($0) | 0; //@line 347
  if (___async) {
   HEAP32[$AsyncCtx3 >> 2] = 39; //@line 350
   HEAP32[$AsyncCtx3 + 4 >> 2] = $5; //@line 352
   HEAP32[$AsyncCtx3 + 8 >> 2] = $42; //@line 354
   HEAP32[$AsyncCtx3 + 12 >> 2] = $3; //@line 356
   HEAP32[$AsyncCtx3 + 16 >> 2] = $8; //@line 358
   HEAP8[$AsyncCtx3 + 20 >> 0] = $13; //@line 360
   HEAP32[$AsyncCtx3 + 24 >> 2] = $40; //@line 362
   HEAP32[$AsyncCtx3 + 28 >> 2] = $18; //@line 364
   HEAP8[$AsyncCtx3 + 32 >> 0] = $10; //@line 366
   HEAP32[$AsyncCtx3 + 36 >> 2] = $0; //@line 368
   HEAP32[$AsyncCtx3 + 40 >> 2] = $2; //@line 370
   HEAP32[$AsyncCtx3 + 44 >> 2] = $17; //@line 372
   HEAP32[$AsyncCtx3 + 48 >> 2] = $1; //@line 374
   HEAP32[$AsyncCtx3 + 52 >> 2] = $11; //@line 376
   HEAP32[$AsyncCtx3 + 56 >> 2] = $14; //@line 378
   sp = STACKTOP; //@line 379
   return;
  }
  _emscripten_free_async_context($AsyncCtx3 | 0); //@line 382
  $61 = HEAP32[$5 >> 2] | 0; //@line 383
  if ($42 >>> 0 < ($46 - (HEAPU8[$61 + 2 >> 0] | 0) | 0) >>> 0) {
   $71 = $61; //@line 390
  } else {
   HEAP32[$40 >> 2] = 0; //@line 392
   $71 = $61; //@line 393
  }
 } else {
  $71 = HEAP32[$5 >> 2] | 0; //@line 397
 }
 $70 = $71 + ((Math_imul($3 + -32 | 0, $8) | 0) + 4) | 0; //@line 402
 $72 = HEAP8[$70 >> 0] | 0; //@line 403
 L15 : do {
  if ($13 << 24 >> 24) {
   if ($10 << 24 >> 24) {
    $$043$us = 0; //@line 409
    L17 : while (1) {
     $77 = ($$043$us >>> 3 & 31) + 1 | 0; //@line 413
     $79 = 1 << ($$043$us & 7); //@line 415
     $80 = $$043$us + $2 | 0; //@line 416
     $$04142$us = 0; //@line 417
     while (1) {
      $87 = ($79 & (HEAPU8[$70 + ($77 + (Math_imul($$04142$us, $17) | 0)) >> 0] | 0) | 0) == 0; //@line 425
      $90 = HEAP32[(HEAP32[$0 >> 2] | 0) + 120 >> 2] | 0; //@line 428
      $91 = $$04142$us + $1 | 0; //@line 429
      if ($87) {
       $AsyncCtx11 = _emscripten_alloc_async_context(64, sp) | 0; //@line 431
       FUNCTION_TABLE_viiii[$90 & 7]($0, $91, $80, 0); //@line 432
       if (___async) {
        label = 18; //@line 435
        break L17;
       }
       _emscripten_free_async_context($AsyncCtx11 | 0); //@line 438
      } else {
       $AsyncCtx7 = _emscripten_alloc_async_context(64, sp) | 0; //@line 440
       FUNCTION_TABLE_viiii[$90 & 7]($0, $91, $80, 1); //@line 441
       if (___async) {
        label = 15; //@line 444
        break L17;
       }
       _emscripten_free_async_context($AsyncCtx7 | 0); //@line 447
      }
      $122 = $$04142$us + 1 | 0; //@line 449
      if (($122 | 0) == ($11 | 0)) {
       break;
      } else {
       $$04142$us = $122; //@line 454
      }
     }
     $123 = $$043$us + 1 | 0; //@line 457
     if (($123 | 0) == ($14 | 0)) {
      break L15;
     } else {
      $$043$us = $123; //@line 462
     }
    }
    if ((label | 0) == 15) {
     HEAP32[$AsyncCtx7 >> 2] = 40; //@line 466
     HEAP32[$AsyncCtx7 + 4 >> 2] = $$04142$us; //@line 468
     HEAP32[$AsyncCtx7 + 8 >> 2] = $11; //@line 470
     HEAP32[$AsyncCtx7 + 12 >> 2] = $$043$us; //@line 472
     HEAP32[$AsyncCtx7 + 16 >> 2] = $14; //@line 474
     HEAP32[$AsyncCtx7 + 20 >> 2] = $17; //@line 476
     HEAP32[$AsyncCtx7 + 24 >> 2] = $77; //@line 478
     HEAP32[$AsyncCtx7 + 28 >> 2] = $70; //@line 480
     HEAP32[$AsyncCtx7 + 32 >> 2] = $79; //@line 482
     HEAP32[$AsyncCtx7 + 36 >> 2] = $0; //@line 484
     HEAP32[$AsyncCtx7 + 40 >> 2] = $1; //@line 486
     HEAP32[$AsyncCtx7 + 44 >> 2] = $0; //@line 488
     HEAP32[$AsyncCtx7 + 48 >> 2] = $80; //@line 490
     HEAP8[$AsyncCtx7 + 52 >> 0] = $72; //@line 492
     HEAP32[$AsyncCtx7 + 56 >> 2] = $18; //@line 494
     HEAP32[$AsyncCtx7 + 60 >> 2] = $2; //@line 496
     sp = STACKTOP; //@line 497
     return;
    } else if ((label | 0) == 18) {
     HEAP32[$AsyncCtx11 >> 2] = 41; //@line 501
     HEAP32[$AsyncCtx11 + 4 >> 2] = $$04142$us; //@line 503
     HEAP32[$AsyncCtx11 + 8 >> 2] = $11; //@line 505
     HEAP32[$AsyncCtx11 + 12 >> 2] = $$043$us; //@line 507
     HEAP32[$AsyncCtx11 + 16 >> 2] = $14; //@line 509
     HEAP32[$AsyncCtx11 + 20 >> 2] = $17; //@line 511
     HEAP32[$AsyncCtx11 + 24 >> 2] = $77; //@line 513
     HEAP32[$AsyncCtx11 + 28 >> 2] = $70; //@line 515
     HEAP32[$AsyncCtx11 + 32 >> 2] = $79; //@line 517
     HEAP32[$AsyncCtx11 + 36 >> 2] = $0; //@line 519
     HEAP32[$AsyncCtx11 + 40 >> 2] = $1; //@line 521
     HEAP32[$AsyncCtx11 + 44 >> 2] = $0; //@line 523
     HEAP32[$AsyncCtx11 + 48 >> 2] = $80; //@line 525
     HEAP8[$AsyncCtx11 + 52 >> 0] = $72; //@line 527
     HEAP32[$AsyncCtx11 + 56 >> 2] = $18; //@line 529
     HEAP32[$AsyncCtx11 + 60 >> 2] = $2; //@line 531
     sp = STACKTOP; //@line 532
     return;
    }
   }
  }
 } while (0);
 HEAP32[$18 >> 2] = (HEAP32[$18 >> 2] | 0) + ($72 & 255); //@line 541
 return;
}
function __ZN6C128328print_bmE6Bitmapii__async_cb_18($0) {
 $0 = $0 | 0;
 var $$02225$us$reg2mem$0 = 0, $$02225$us$reg2mem$1 = 0, $$023$us30 = 0, $$reg2mem$0 = 0, $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $20 = 0, $23 = 0, $24 = 0, $26 = 0, $4 = 0, $40 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0, $8 = 0, $ReallocAsyncCtx = 0, $ReallocAsyncCtx2 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 920
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 924
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 926
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 928
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 930
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 932
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 934
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 936
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 938
 $20 = HEAP32[$0 + 40 >> 2] | 0; //@line 940
 $66 = (HEAP32[$0 + 4 >> 2] | 0) + 1 | 0; //@line 943
 if (($66 | 0) < ($4 | 0)) {
  $$02225$us$reg2mem$0 = $8; //@line 946
  $$023$us30 = $66; //@line 946
  $$reg2mem$0 = HEAP32[$0 + 44 >> 2] | 0; //@line 946
  label = 3; //@line 947
 } else {
  $$02225$us$reg2mem$1 = $8; //@line 949
 }
 while (1) {
  if ((label | 0) == 3) {
   label = 0; //@line 953
   $26 = $$023$us30 + $6 | 0; //@line 954
   if (($26 | 0) > 127) {
    $$02225$us$reg2mem$1 = $$02225$us$reg2mem$0; //@line 957
   } else {
    break;
   }
  }
  $24 = $$02225$us$reg2mem$1 + 1 | 0; //@line 962
  if (($24 | 0) >= ($10 | 0)) {
   label = 14; //@line 965
   break;
  }
  $23 = $24 + $12 | 0; //@line 968
  if (($23 | 0) > 31) {
   $$02225$us$reg2mem$1 = $24; //@line 971
  } else {
   $$02225$us$reg2mem$0 = $24; //@line 973
   $$023$us30 = 0; //@line 973
   $$reg2mem$0 = $23; //@line 973
   label = 3; //@line 974
  }
 }
 if ((label | 0) == 14) {
  return;
 }
 $40 = (128 >>> ($$023$us30 & 7) & HEAP8[(HEAP32[$14 >> 2] | 0) + ((Math_imul(HEAP32[$16 >> 2] | 0, $$02225$us$reg2mem$0) | 0) + ($$023$us30 >>> 3 & 31)) >> 0] | 0) == 0; //@line 992
 $43 = HEAP32[(HEAP32[$18 >> 2] | 0) + 120 >> 2] | 0; //@line 995
 if ($40) {
  $ReallocAsyncCtx2 = _emscripten_realloc_async_context(48) | 0; //@line 997
  FUNCTION_TABLE_viiii[$43 & 7]($20, $26, $$reg2mem$0, 0); //@line 998
  if (___async) {
   HEAP32[$ReallocAsyncCtx2 >> 2] = 49; //@line 1001
   $55 = $ReallocAsyncCtx2 + 4 | 0; //@line 1002
   HEAP32[$55 >> 2] = $$023$us30; //@line 1003
   $56 = $ReallocAsyncCtx2 + 8 | 0; //@line 1004
   HEAP32[$56 >> 2] = $4; //@line 1005
   $57 = $ReallocAsyncCtx2 + 12 | 0; //@line 1006
   HEAP32[$57 >> 2] = $6; //@line 1007
   $58 = $ReallocAsyncCtx2 + 16 | 0; //@line 1008
   HEAP32[$58 >> 2] = $$02225$us$reg2mem$0; //@line 1009
   $59 = $ReallocAsyncCtx2 + 20 | 0; //@line 1010
   HEAP32[$59 >> 2] = $10; //@line 1011
   $60 = $ReallocAsyncCtx2 + 24 | 0; //@line 1012
   HEAP32[$60 >> 2] = $12; //@line 1013
   $61 = $ReallocAsyncCtx2 + 28 | 0; //@line 1014
   HEAP32[$61 >> 2] = $14; //@line 1015
   $62 = $ReallocAsyncCtx2 + 32 | 0; //@line 1016
   HEAP32[$62 >> 2] = $16; //@line 1017
   $63 = $ReallocAsyncCtx2 + 36 | 0; //@line 1018
   HEAP32[$63 >> 2] = $18; //@line 1019
   $64 = $ReallocAsyncCtx2 + 40 | 0; //@line 1020
   HEAP32[$64 >> 2] = $20; //@line 1021
   $65 = $ReallocAsyncCtx2 + 44 | 0; //@line 1022
   HEAP32[$65 >> 2] = $$reg2mem$0; //@line 1023
   sp = STACKTOP; //@line 1024
   return;
  }
  ___async_unwind = 0; //@line 1027
  HEAP32[$ReallocAsyncCtx2 >> 2] = 49; //@line 1028
  $55 = $ReallocAsyncCtx2 + 4 | 0; //@line 1029
  HEAP32[$55 >> 2] = $$023$us30; //@line 1030
  $56 = $ReallocAsyncCtx2 + 8 | 0; //@line 1031
  HEAP32[$56 >> 2] = $4; //@line 1032
  $57 = $ReallocAsyncCtx2 + 12 | 0; //@line 1033
  HEAP32[$57 >> 2] = $6; //@line 1034
  $58 = $ReallocAsyncCtx2 + 16 | 0; //@line 1035
  HEAP32[$58 >> 2] = $$02225$us$reg2mem$0; //@line 1036
  $59 = $ReallocAsyncCtx2 + 20 | 0; //@line 1037
  HEAP32[$59 >> 2] = $10; //@line 1038
  $60 = $ReallocAsyncCtx2 + 24 | 0; //@line 1039
  HEAP32[$60 >> 2] = $12; //@line 1040
  $61 = $ReallocAsyncCtx2 + 28 | 0; //@line 1041
  HEAP32[$61 >> 2] = $14; //@line 1042
  $62 = $ReallocAsyncCtx2 + 32 | 0; //@line 1043
  HEAP32[$62 >> 2] = $16; //@line 1044
  $63 = $ReallocAsyncCtx2 + 36 | 0; //@line 1045
  HEAP32[$63 >> 2] = $18; //@line 1046
  $64 = $ReallocAsyncCtx2 + 40 | 0; //@line 1047
  HEAP32[$64 >> 2] = $20; //@line 1048
  $65 = $ReallocAsyncCtx2 + 44 | 0; //@line 1049
  HEAP32[$65 >> 2] = $$reg2mem$0; //@line 1050
  sp = STACKTOP; //@line 1051
  return;
 } else {
  $ReallocAsyncCtx = _emscripten_realloc_async_context(48) | 0; //@line 1054
  FUNCTION_TABLE_viiii[$43 & 7]($20, $26, $$reg2mem$0, 1); //@line 1055
  if (___async) {
   HEAP32[$ReallocAsyncCtx >> 2] = 48; //@line 1058
   $44 = $ReallocAsyncCtx + 4 | 0; //@line 1059
   HEAP32[$44 >> 2] = $$023$us30; //@line 1060
   $45 = $ReallocAsyncCtx + 8 | 0; //@line 1061
   HEAP32[$45 >> 2] = $4; //@line 1062
   $46 = $ReallocAsyncCtx + 12 | 0; //@line 1063
   HEAP32[$46 >> 2] = $6; //@line 1064
   $47 = $ReallocAsyncCtx + 16 | 0; //@line 1065
   HEAP32[$47 >> 2] = $$02225$us$reg2mem$0; //@line 1066
   $48 = $ReallocAsyncCtx + 20 | 0; //@line 1067
   HEAP32[$48 >> 2] = $10; //@line 1068
   $49 = $ReallocAsyncCtx + 24 | 0; //@line 1069
   HEAP32[$49 >> 2] = $12; //@line 1070
   $50 = $ReallocAsyncCtx + 28 | 0; //@line 1071
   HEAP32[$50 >> 2] = $14; //@line 1072
   $51 = $ReallocAsyncCtx + 32 | 0; //@line 1073
   HEAP32[$51 >> 2] = $16; //@line 1074
   $52 = $ReallocAsyncCtx + 36 | 0; //@line 1075
   HEAP32[$52 >> 2] = $18; //@line 1076
   $53 = $ReallocAsyncCtx + 40 | 0; //@line 1077
   HEAP32[$53 >> 2] = $20; //@line 1078
   $54 = $ReallocAsyncCtx + 44 | 0; //@line 1079
   HEAP32[$54 >> 2] = $$reg2mem$0; //@line 1080
   sp = STACKTOP; //@line 1081
   return;
  }
  ___async_unwind = 0; //@line 1084
  HEAP32[$ReallocAsyncCtx >> 2] = 48; //@line 1085
  $44 = $ReallocAsyncCtx + 4 | 0; //@line 1086
  HEAP32[$44 >> 2] = $$023$us30; //@line 1087
  $45 = $ReallocAsyncCtx + 8 | 0; //@line 1088
  HEAP32[$45 >> 2] = $4; //@line 1089
  $46 = $ReallocAsyncCtx + 12 | 0; //@line 1090
  HEAP32[$46 >> 2] = $6; //@line 1091
  $47 = $ReallocAsyncCtx + 16 | 0; //@line 1092
  HEAP32[$47 >> 2] = $$02225$us$reg2mem$0; //@line 1093
  $48 = $ReallocAsyncCtx + 20 | 0; //@line 1094
  HEAP32[$48 >> 2] = $10; //@line 1095
  $49 = $ReallocAsyncCtx + 24 | 0; //@line 1096
  HEAP32[$49 >> 2] = $12; //@line 1097
  $50 = $ReallocAsyncCtx + 28 | 0; //@line 1098
  HEAP32[$50 >> 2] = $14; //@line 1099
  $51 = $ReallocAsyncCtx + 32 | 0; //@line 1100
  HEAP32[$51 >> 2] = $16; //@line 1101
  $52 = $ReallocAsyncCtx + 36 | 0; //@line 1102
  HEAP32[$52 >> 2] = $18; //@line 1103
  $53 = $ReallocAsyncCtx + 40 | 0; //@line 1104
  HEAP32[$53 >> 2] = $20; //@line 1105
  $54 = $ReallocAsyncCtx + 44 | 0; //@line 1106
  HEAP32[$54 >> 2] = $$reg2mem$0; //@line 1107
  sp = STACKTOP; //@line 1108
  return;
 }
}
function __ZN6C128328print_bmE6Bitmapii__async_cb($0) {
 $0 = $0 | 0;
 var $$02225$us$reg2mem$0 = 0, $$02225$us$reg2mem$1 = 0, $$023$us30 = 0, $$reg2mem$0 = 0, $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $20 = 0, $23 = 0, $24 = 0, $26 = 0, $4 = 0, $40 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0, $8 = 0, $ReallocAsyncCtx = 0, $ReallocAsyncCtx2 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 722
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 726
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 728
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 730
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 732
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 734
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 736
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 738
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 740
 $20 = HEAP32[$0 + 40 >> 2] | 0; //@line 742
 $66 = (HEAP32[$0 + 4 >> 2] | 0) + 1 | 0; //@line 745
 if (($66 | 0) < ($4 | 0)) {
  $$02225$us$reg2mem$0 = $8; //@line 748
  $$023$us30 = $66; //@line 748
  $$reg2mem$0 = HEAP32[$0 + 44 >> 2] | 0; //@line 748
  label = 3; //@line 749
 } else {
  $$02225$us$reg2mem$1 = $8; //@line 751
 }
 while (1) {
  if ((label | 0) == 3) {
   label = 0; //@line 755
   $26 = $$023$us30 + $6 | 0; //@line 756
   if (($26 | 0) > 127) {
    $$02225$us$reg2mem$1 = $$02225$us$reg2mem$0; //@line 759
   } else {
    break;
   }
  }
  $24 = $$02225$us$reg2mem$1 + 1 | 0; //@line 764
  if (($24 | 0) >= ($10 | 0)) {
   label = 14; //@line 767
   break;
  }
  $23 = $24 + $12 | 0; //@line 770
  if (($23 | 0) > 31) {
   $$02225$us$reg2mem$1 = $24; //@line 773
  } else {
   $$02225$us$reg2mem$0 = $24; //@line 775
   $$023$us30 = 0; //@line 775
   $$reg2mem$0 = $23; //@line 775
   label = 3; //@line 776
  }
 }
 if ((label | 0) == 14) {
  return;
 }
 $40 = (128 >>> ($$023$us30 & 7) & HEAP8[(HEAP32[$14 >> 2] | 0) + ((Math_imul(HEAP32[$16 >> 2] | 0, $$02225$us$reg2mem$0) | 0) + ($$023$us30 >>> 3 & 31)) >> 0] | 0) == 0; //@line 794
 $43 = HEAP32[(HEAP32[$18 >> 2] | 0) + 120 >> 2] | 0; //@line 797
 if ($40) {
  $ReallocAsyncCtx2 = _emscripten_realloc_async_context(48) | 0; //@line 799
  FUNCTION_TABLE_viiii[$43 & 7]($20, $26, $$reg2mem$0, 0); //@line 800
  if (___async) {
   HEAP32[$ReallocAsyncCtx2 >> 2] = 49; //@line 803
   $55 = $ReallocAsyncCtx2 + 4 | 0; //@line 804
   HEAP32[$55 >> 2] = $$023$us30; //@line 805
   $56 = $ReallocAsyncCtx2 + 8 | 0; //@line 806
   HEAP32[$56 >> 2] = $4; //@line 807
   $57 = $ReallocAsyncCtx2 + 12 | 0; //@line 808
   HEAP32[$57 >> 2] = $6; //@line 809
   $58 = $ReallocAsyncCtx2 + 16 | 0; //@line 810
   HEAP32[$58 >> 2] = $$02225$us$reg2mem$0; //@line 811
   $59 = $ReallocAsyncCtx2 + 20 | 0; //@line 812
   HEAP32[$59 >> 2] = $10; //@line 813
   $60 = $ReallocAsyncCtx2 + 24 | 0; //@line 814
   HEAP32[$60 >> 2] = $12; //@line 815
   $61 = $ReallocAsyncCtx2 + 28 | 0; //@line 816
   HEAP32[$61 >> 2] = $14; //@line 817
   $62 = $ReallocAsyncCtx2 + 32 | 0; //@line 818
   HEAP32[$62 >> 2] = $16; //@line 819
   $63 = $ReallocAsyncCtx2 + 36 | 0; //@line 820
   HEAP32[$63 >> 2] = $18; //@line 821
   $64 = $ReallocAsyncCtx2 + 40 | 0; //@line 822
   HEAP32[$64 >> 2] = $20; //@line 823
   $65 = $ReallocAsyncCtx2 + 44 | 0; //@line 824
   HEAP32[$65 >> 2] = $$reg2mem$0; //@line 825
   sp = STACKTOP; //@line 826
   return;
  }
  ___async_unwind = 0; //@line 829
  HEAP32[$ReallocAsyncCtx2 >> 2] = 49; //@line 830
  $55 = $ReallocAsyncCtx2 + 4 | 0; //@line 831
  HEAP32[$55 >> 2] = $$023$us30; //@line 832
  $56 = $ReallocAsyncCtx2 + 8 | 0; //@line 833
  HEAP32[$56 >> 2] = $4; //@line 834
  $57 = $ReallocAsyncCtx2 + 12 | 0; //@line 835
  HEAP32[$57 >> 2] = $6; //@line 836
  $58 = $ReallocAsyncCtx2 + 16 | 0; //@line 837
  HEAP32[$58 >> 2] = $$02225$us$reg2mem$0; //@line 838
  $59 = $ReallocAsyncCtx2 + 20 | 0; //@line 839
  HEAP32[$59 >> 2] = $10; //@line 840
  $60 = $ReallocAsyncCtx2 + 24 | 0; //@line 841
  HEAP32[$60 >> 2] = $12; //@line 842
  $61 = $ReallocAsyncCtx2 + 28 | 0; //@line 843
  HEAP32[$61 >> 2] = $14; //@line 844
  $62 = $ReallocAsyncCtx2 + 32 | 0; //@line 845
  HEAP32[$62 >> 2] = $16; //@line 846
  $63 = $ReallocAsyncCtx2 + 36 | 0; //@line 847
  HEAP32[$63 >> 2] = $18; //@line 848
  $64 = $ReallocAsyncCtx2 + 40 | 0; //@line 849
  HEAP32[$64 >> 2] = $20; //@line 850
  $65 = $ReallocAsyncCtx2 + 44 | 0; //@line 851
  HEAP32[$65 >> 2] = $$reg2mem$0; //@line 852
  sp = STACKTOP; //@line 853
  return;
 } else {
  $ReallocAsyncCtx = _emscripten_realloc_async_context(48) | 0; //@line 856
  FUNCTION_TABLE_viiii[$43 & 7]($20, $26, $$reg2mem$0, 1); //@line 857
  if (___async) {
   HEAP32[$ReallocAsyncCtx >> 2] = 48; //@line 860
   $44 = $ReallocAsyncCtx + 4 | 0; //@line 861
   HEAP32[$44 >> 2] = $$023$us30; //@line 862
   $45 = $ReallocAsyncCtx + 8 | 0; //@line 863
   HEAP32[$45 >> 2] = $4; //@line 864
   $46 = $ReallocAsyncCtx + 12 | 0; //@line 865
   HEAP32[$46 >> 2] = $6; //@line 866
   $47 = $ReallocAsyncCtx + 16 | 0; //@line 867
   HEAP32[$47 >> 2] = $$02225$us$reg2mem$0; //@line 868
   $48 = $ReallocAsyncCtx + 20 | 0; //@line 869
   HEAP32[$48 >> 2] = $10; //@line 870
   $49 = $ReallocAsyncCtx + 24 | 0; //@line 871
   HEAP32[$49 >> 2] = $12; //@line 872
   $50 = $ReallocAsyncCtx + 28 | 0; //@line 873
   HEAP32[$50 >> 2] = $14; //@line 874
   $51 = $ReallocAsyncCtx + 32 | 0; //@line 875
   HEAP32[$51 >> 2] = $16; //@line 876
   $52 = $ReallocAsyncCtx + 36 | 0; //@line 877
   HEAP32[$52 >> 2] = $18; //@line 878
   $53 = $ReallocAsyncCtx + 40 | 0; //@line 879
   HEAP32[$53 >> 2] = $20; //@line 880
   $54 = $ReallocAsyncCtx + 44 | 0; //@line 881
   HEAP32[$54 >> 2] = $$reg2mem$0; //@line 882
   sp = STACKTOP; //@line 883
   return;
  }
  ___async_unwind = 0; //@line 886
  HEAP32[$ReallocAsyncCtx >> 2] = 48; //@line 887
  $44 = $ReallocAsyncCtx + 4 | 0; //@line 888
  HEAP32[$44 >> 2] = $$023$us30; //@line 889
  $45 = $ReallocAsyncCtx + 8 | 0; //@line 890
  HEAP32[$45 >> 2] = $4; //@line 891
  $46 = $ReallocAsyncCtx + 12 | 0; //@line 892
  HEAP32[$46 >> 2] = $6; //@line 893
  $47 = $ReallocAsyncCtx + 16 | 0; //@line 894
  HEAP32[$47 >> 2] = $$02225$us$reg2mem$0; //@line 895
  $48 = $ReallocAsyncCtx + 20 | 0; //@line 896
  HEAP32[$48 >> 2] = $10; //@line 897
  $49 = $ReallocAsyncCtx + 24 | 0; //@line 898
  HEAP32[$49 >> 2] = $12; //@line 899
  $50 = $ReallocAsyncCtx + 28 | 0; //@line 900
  HEAP32[$50 >> 2] = $14; //@line 901
  $51 = $ReallocAsyncCtx + 32 | 0; //@line 902
  HEAP32[$51 >> 2] = $16; //@line 903
  $52 = $ReallocAsyncCtx + 36 | 0; //@line 904
  HEAP32[$52 >> 2] = $18; //@line 905
  $53 = $ReallocAsyncCtx + 40 | 0; //@line 906
  HEAP32[$53 >> 2] = $20; //@line 907
  $54 = $ReallocAsyncCtx + 44 | 0; //@line 908
  HEAP32[$54 >> 2] = $$reg2mem$0; //@line 909
  sp = STACKTOP; //@line 910
  return;
 }
}
function _freopen($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$0 = 0, $$pre = 0, $17 = 0, $27 = 0, $29 = 0, $3 = 0, $30 = 0, $32 = 0, $AsyncCtx = 0, $AsyncCtx10 = 0, $AsyncCtx14 = 0, $AsyncCtx18 = 0, $vararg_buffer = 0, $vararg_buffer3 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 11909
 STACKTOP = STACKTOP + 32 | 0; //@line 11910
 $vararg_buffer3 = sp + 16 | 0; //@line 11911
 $vararg_buffer = sp; //@line 11912
 $3 = ___fmodeflags($1) | 0; //@line 11913
 if ((HEAP32[$2 + 76 >> 2] | 0) > -1) {
  $17 = ___lockfile($2) | 0; //@line 11919
 } else {
  $17 = 0; //@line 11921
 }
 $AsyncCtx = _emscripten_alloc_async_context(40, sp) | 0; //@line 11923
 _fflush($2) | 0; //@line 11924
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 169; //@line 11927
  HEAP32[$AsyncCtx + 4 >> 2] = $3; //@line 11929
  HEAP32[$AsyncCtx + 8 >> 2] = $2; //@line 11931
  HEAP32[$AsyncCtx + 12 >> 2] = $vararg_buffer; //@line 11933
  HEAP32[$AsyncCtx + 16 >> 2] = $vararg_buffer; //@line 11935
  HEAP32[$AsyncCtx + 20 >> 2] = $vararg_buffer3; //@line 11937
  HEAP32[$AsyncCtx + 24 >> 2] = $vararg_buffer3; //@line 11939
  HEAP32[$AsyncCtx + 28 >> 2] = $0; //@line 11941
  HEAP32[$AsyncCtx + 32 >> 2] = $1; //@line 11943
  HEAP32[$AsyncCtx + 36 >> 2] = $17; //@line 11945
  sp = STACKTOP; //@line 11946
  STACKTOP = sp; //@line 11947
  return 0; //@line 11947
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 11949
 do {
  if (!$0) {
   $$pre = $2 + 60 | 0; //@line 11955
   if ($3 & 524288 | 0) {
    HEAP32[$vararg_buffer >> 2] = HEAP32[$$pre >> 2]; //@line 11958
    HEAP32[$vararg_buffer + 4 >> 2] = 2; //@line 11960
    HEAP32[$vararg_buffer + 8 >> 2] = 1; //@line 11962
    ___syscall221(221, $vararg_buffer | 0) | 0; //@line 11963
   }
   HEAP32[$vararg_buffer3 >> 2] = HEAP32[$$pre >> 2]; //@line 11967
   HEAP32[$vararg_buffer3 + 4 >> 2] = 4; //@line 11969
   HEAP32[$vararg_buffer3 + 8 >> 2] = $3 & -524481; //@line 11971
   if ((___syscall_ret(___syscall221(221, $vararg_buffer3 | 0) | 0) | 0) < 0) {
    label = 21; //@line 11976
   } else {
    label = 16; //@line 11978
   }
  } else {
   $27 = _fopen($0, $1) | 0; //@line 11981
   if (!$27) {
    label = 21; //@line 11984
   } else {
    $29 = $27 + 60 | 0; //@line 11986
    $30 = HEAP32[$29 >> 2] | 0; //@line 11987
    $32 = HEAP32[$2 + 60 >> 2] | 0; //@line 11989
    if (($30 | 0) == ($32 | 0)) {
     HEAP32[$29 >> 2] = -1; //@line 11992
    } else {
     if ((___dup3($30, $32, $3 & 524288) | 0) < 0) {
      $AsyncCtx14 = _emscripten_alloc_async_context(8, sp) | 0; //@line 11998
      _fclose($27) | 0; //@line 11999
      if (___async) {
       HEAP32[$AsyncCtx14 >> 2] = 171; //@line 12002
       HEAP32[$AsyncCtx14 + 4 >> 2] = $2; //@line 12004
       sp = STACKTOP; //@line 12005
       STACKTOP = sp; //@line 12006
       return 0; //@line 12006
      } else {
       _emscripten_free_async_context($AsyncCtx14 | 0); //@line 12008
       label = 21; //@line 12009
       break;
      }
     }
    }
    HEAP32[$2 >> 2] = HEAP32[$2 >> 2] & 1 | HEAP32[$27 >> 2]; //@line 12018
    HEAP32[$2 + 32 >> 2] = HEAP32[$27 + 32 >> 2]; //@line 12022
    HEAP32[$2 + 36 >> 2] = HEAP32[$27 + 36 >> 2]; //@line 12026
    HEAP32[$2 + 40 >> 2] = HEAP32[$27 + 40 >> 2]; //@line 12030
    HEAP32[$2 + 12 >> 2] = HEAP32[$27 + 12 >> 2]; //@line 12034
    $AsyncCtx18 = _emscripten_alloc_async_context(12, sp) | 0; //@line 12035
    _fclose($27) | 0; //@line 12036
    if (___async) {
     HEAP32[$AsyncCtx18 >> 2] = 170; //@line 12039
     HEAP32[$AsyncCtx18 + 4 >> 2] = $17; //@line 12041
     HEAP32[$AsyncCtx18 + 8 >> 2] = $2; //@line 12043
     sp = STACKTOP; //@line 12044
     STACKTOP = sp; //@line 12045
     return 0; //@line 12045
    } else {
     _emscripten_free_async_context($AsyncCtx18 | 0); //@line 12047
     label = 16; //@line 12048
     break;
    }
   }
  }
 } while (0);
 do {
  if ((label | 0) == 16) {
   if (!$17) {
    $$0 = $2; //@line 12058
   } else {
    ___unlockfile($2); //@line 12060
    $$0 = $2; //@line 12061
   }
  } else if ((label | 0) == 21) {
   $AsyncCtx10 = _emscripten_alloc_async_context(8, sp) | 0; //@line 12065
   _fclose($2) | 0; //@line 12066
   if (___async) {
    HEAP32[$AsyncCtx10 >> 2] = 172; //@line 12069
    HEAP32[$AsyncCtx10 + 4 >> 2] = $2; //@line 12071
    sp = STACKTOP; //@line 12072
    STACKTOP = sp; //@line 12073
    return 0; //@line 12073
   } else {
    _emscripten_free_async_context($AsyncCtx10 | 0); //@line 12075
    $$0 = 0; //@line 12076
    break;
   }
  }
 } while (0);
 STACKTOP = sp; //@line 12081
 return $$0 | 0; //@line 12081
}
function __ZN4mbed6Stream6printfEPKcz($0, $1, $varargs) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $varargs = $varargs | 0;
 var $$09 = 0, $13 = 0, $2 = 0, $22 = 0, $3 = 0, $30 = 0, $36 = 0, $39 = 0, $48 = 0, $6 = 0, $AsyncCtx = 0, $AsyncCtx12 = 0, $AsyncCtx2 = 0, $AsyncCtx5 = 0, $AsyncCtx9 = 0, sp = 0;
 sp = STACKTOP; //@line 2872
 STACKTOP = STACKTOP + 4112 | 0; //@line 2873
 $2 = sp; //@line 2874
 $3 = sp + 16 | 0; //@line 2875
 $6 = HEAP32[(HEAP32[$0 >> 2] | 0) + 80 >> 2] | 0; //@line 2878
 $AsyncCtx = _emscripten_alloc_async_context(28, sp) | 0; //@line 2879
 FUNCTION_TABLE_vi[$6 & 255]($0); //@line 2880
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 110; //@line 2883
  HEAP32[$AsyncCtx + 4 >> 2] = $2; //@line 2885
  HEAP32[$AsyncCtx + 8 >> 2] = $varargs; //@line 2887
  HEAP32[$AsyncCtx + 12 >> 2] = $3; //@line 2889
  HEAP32[$AsyncCtx + 16 >> 2] = $1; //@line 2891
  HEAP32[$AsyncCtx + 20 >> 2] = $0; //@line 2893
  HEAP32[$AsyncCtx + 24 >> 2] = $0; //@line 2895
  sp = STACKTOP; //@line 2896
  STACKTOP = sp; //@line 2897
  return 0; //@line 2897
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 2899
 HEAP32[$2 >> 2] = $varargs; //@line 2900
 _memset($3 | 0, 0, 4096) | 0; //@line 2901
 $AsyncCtx12 = _emscripten_alloc_async_context(24, sp) | 0; //@line 2902
 $13 = _vsprintf($3, $1, $2) | 0; //@line 2903
 if (___async) {
  HEAP32[$AsyncCtx12 >> 2] = 111; //@line 2906
  HEAP32[$AsyncCtx12 + 4 >> 2] = $0; //@line 2908
  HEAP32[$AsyncCtx12 + 8 >> 2] = $0; //@line 2910
  HEAP32[$AsyncCtx12 + 12 >> 2] = $3; //@line 2912
  HEAP32[$AsyncCtx12 + 16 >> 2] = $2; //@line 2914
  HEAP32[$AsyncCtx12 + 20 >> 2] = $3; //@line 2916
  sp = STACKTOP; //@line 2917
  STACKTOP = sp; //@line 2918
  return 0; //@line 2918
 }
 _emscripten_free_async_context($AsyncCtx12 | 0); //@line 2920
 L7 : do {
  if (($13 | 0) > 0) {
   $$09 = 0; //@line 2924
   while (1) {
    $36 = HEAP32[(HEAP32[$0 >> 2] | 0) + 68 >> 2] | 0; //@line 2928
    $39 = HEAP8[$3 + $$09 >> 0] | 0; //@line 2931
    $AsyncCtx9 = _emscripten_alloc_async_context(36, sp) | 0; //@line 2932
    FUNCTION_TABLE_iii[$36 & 7]($0, $39) | 0; //@line 2933
    if (___async) {
     break;
    }
    _emscripten_free_async_context($AsyncCtx9 | 0); //@line 2938
    $48 = $$09 + 1 | 0; //@line 2939
    if (($48 | 0) == ($13 | 0)) {
     break L7;
    } else {
     $$09 = $48; //@line 2944
    }
   }
   HEAP32[$AsyncCtx9 >> 2] = 114; //@line 2947
   HEAP32[$AsyncCtx9 + 4 >> 2] = $$09; //@line 2949
   HEAP32[$AsyncCtx9 + 8 >> 2] = $13; //@line 2951
   HEAP32[$AsyncCtx9 + 12 >> 2] = $0; //@line 2953
   HEAP32[$AsyncCtx9 + 16 >> 2] = $0; //@line 2955
   HEAP32[$AsyncCtx9 + 20 >> 2] = $0; //@line 2957
   HEAP32[$AsyncCtx9 + 24 >> 2] = $3; //@line 2959
   HEAP32[$AsyncCtx9 + 28 >> 2] = $3; //@line 2961
   HEAP32[$AsyncCtx9 + 32 >> 2] = $2; //@line 2963
   sp = STACKTOP; //@line 2964
   STACKTOP = sp; //@line 2965
   return 0; //@line 2965
  }
 } while (0);
 $22 = HEAP32[(HEAP32[$0 >> 2] | 0) + 76 >> 2] | 0; //@line 2970
 $AsyncCtx2 = _emscripten_alloc_async_context(24, sp) | 0; //@line 2971
 FUNCTION_TABLE_vi[$22 & 255]($0); //@line 2972
 if (___async) {
  HEAP32[$AsyncCtx2 >> 2] = 112; //@line 2975
  HEAP32[$AsyncCtx2 + 4 >> 2] = $0; //@line 2977
  HEAP32[$AsyncCtx2 + 8 >> 2] = $0; //@line 2979
  HEAP32[$AsyncCtx2 + 12 >> 2] = $3; //@line 2981
  HEAP32[$AsyncCtx2 + 16 >> 2] = $2; //@line 2983
  HEAP32[$AsyncCtx2 + 20 >> 2] = $13; //@line 2985
  sp = STACKTOP; //@line 2986
  STACKTOP = sp; //@line 2987
  return 0; //@line 2987
 }
 _emscripten_free_async_context($AsyncCtx2 | 0); //@line 2989
 $30 = HEAP32[(HEAP32[$0 >> 2] | 0) + 84 >> 2] | 0; //@line 2992
 $AsyncCtx5 = _emscripten_alloc_async_context(16, sp) | 0; //@line 2993
 FUNCTION_TABLE_vi[$30 & 255]($0); //@line 2994
 if (___async) {
  HEAP32[$AsyncCtx5 >> 2] = 113; //@line 2997
  HEAP32[$AsyncCtx5 + 4 >> 2] = $3; //@line 2999
  HEAP32[$AsyncCtx5 + 8 >> 2] = $2; //@line 3001
  HEAP32[$AsyncCtx5 + 12 >> 2] = $13; //@line 3003
  sp = STACKTOP; //@line 3004
  STACKTOP = sp; //@line 3005
  return 0; //@line 3005
 } else {
  _emscripten_free_async_context($AsyncCtx5 | 0); //@line 3007
  STACKTOP = sp; //@line 3008
  return $13 | 0; //@line 3008
 }
 return 0; //@line 3010
}
function __ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_11($0) {
 $0 = $0 | 0;
 var $$085$off0$reg2mem$0 = 0, $$182$off0 = 0, $$186$off0 = 0, $$283$off0 = 0, $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $2 = 0, $20 = 0, $22 = 0, $24 = 0, $26 = 0, $28 = 0, $30 = 0, $4 = 0, $59 = 0, $6 = 0, $67 = 0, $8 = 0, $ReallocAsyncCtx5 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 162
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 164
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 166
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 168
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 170
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 172
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 174
 $14 = HEAP8[$0 + 28 >> 0] & 1; //@line 177
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 179
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 181
 $20 = HEAP8[$0 + 40 >> 0] & 1; //@line 184
 $22 = HEAP8[$0 + 41 >> 0] & 1; //@line 187
 $24 = HEAP32[$0 + 44 >> 2] | 0; //@line 189
 $26 = HEAP32[$0 + 48 >> 2] | 0; //@line 191
 $28 = HEAP32[$0 + 52 >> 2] | 0; //@line 193
 L2 : do {
  if (!(HEAP8[$2 >> 0] | 0)) {
   do {
    if (!(HEAP8[$8 >> 0] | 0)) {
     $$182$off0 = $22; //@line 202
     $$186$off0 = $20; //@line 202
    } else {
     if (!(HEAP8[$6 >> 0] | 0)) {
      if (!(HEAP32[$18 >> 2] & 1)) {
       $$085$off0$reg2mem$0 = $20; //@line 211
       $$283$off0 = 1; //@line 211
       label = 13; //@line 212
       break L2;
      } else {
       $$182$off0 = 1; //@line 215
       $$186$off0 = $20; //@line 215
       break;
      }
     }
     if ((HEAP32[$16 >> 2] | 0) == 1) {
      label = 18; //@line 222
      break L2;
     }
     if (!(HEAP32[$18 >> 2] & 2)) {
      label = 18; //@line 229
      break L2;
     } else {
      $$182$off0 = 1; //@line 232
      $$186$off0 = 1; //@line 232
     }
    }
   } while (0);
   $30 = $24 + 8 | 0; //@line 236
   if ($30 >>> 0 < $4 >>> 0) {
    HEAP8[$6 >> 0] = 0; //@line 239
    HEAP8[$8 >> 0] = 0; //@line 240
    $ReallocAsyncCtx5 = _emscripten_realloc_async_context(56) | 0; //@line 241
    __ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($30, $10, $12, $12, 1, $14); //@line 242
    if (!___async) {
     ___async_unwind = 0; //@line 245
    }
    HEAP32[$ReallocAsyncCtx5 >> 2] = 194; //@line 247
    HEAP32[$ReallocAsyncCtx5 + 4 >> 2] = $2; //@line 249
    HEAP32[$ReallocAsyncCtx5 + 8 >> 2] = $4; //@line 251
    HEAP32[$ReallocAsyncCtx5 + 12 >> 2] = $6; //@line 253
    HEAP32[$ReallocAsyncCtx5 + 16 >> 2] = $8; //@line 255
    HEAP32[$ReallocAsyncCtx5 + 20 >> 2] = $10; //@line 257
    HEAP32[$ReallocAsyncCtx5 + 24 >> 2] = $12; //@line 259
    HEAP8[$ReallocAsyncCtx5 + 28 >> 0] = $14 & 1; //@line 262
    HEAP32[$ReallocAsyncCtx5 + 32 >> 2] = $16; //@line 264
    HEAP32[$ReallocAsyncCtx5 + 36 >> 2] = $18; //@line 266
    HEAP8[$ReallocAsyncCtx5 + 40 >> 0] = $$186$off0 & 1; //@line 269
    HEAP8[$ReallocAsyncCtx5 + 41 >> 0] = $$182$off0 & 1; //@line 272
    HEAP32[$ReallocAsyncCtx5 + 44 >> 2] = $30; //@line 274
    HEAP32[$ReallocAsyncCtx5 + 48 >> 2] = $26; //@line 276
    HEAP32[$ReallocAsyncCtx5 + 52 >> 2] = $28; //@line 278
    sp = STACKTOP; //@line 279
    return;
   } else {
    $$085$off0$reg2mem$0 = $$186$off0; //@line 282
    $$283$off0 = $$182$off0; //@line 282
    label = 13; //@line 283
   }
  } else {
   $$085$off0$reg2mem$0 = $20; //@line 286
   $$283$off0 = $22; //@line 286
   label = 13; //@line 287
  }
 } while (0);
 do {
  if ((label | 0) == 13) {
   if (!$$085$off0$reg2mem$0) {
    HEAP32[$26 >> 2] = $12; //@line 293
    $59 = $10 + 40 | 0; //@line 294
    HEAP32[$59 >> 2] = (HEAP32[$59 >> 2] | 0) + 1; //@line 297
    if ((HEAP32[$10 + 36 >> 2] | 0) == 1) {
     if ((HEAP32[$16 >> 2] | 0) == 2) {
      HEAP8[$2 >> 0] = 1; //@line 305
      if ($$283$off0) {
       label = 18; //@line 307
       break;
      } else {
       $67 = 4; //@line 310
       break;
      }
     }
    }
   }
   if ($$283$off0) {
    label = 18; //@line 317
   } else {
    $67 = 4; //@line 319
   }
  }
 } while (0);
 if ((label | 0) == 18) {
  $67 = 3; //@line 324
 }
 HEAP32[$28 >> 2] = $67; //@line 326
 return;
}
function __ZN4mbed6Stream6printfEPKcz__async_cb_35($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $16 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $27 = 0, $29 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx2 = 0, $ReallocAsyncCtx4 = 0, sp = 0;
 sp = STACKTOP; //@line 3291
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 3295
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 3297
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 3299
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 3301
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 3303
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 3305
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 3307
 $29 = (HEAP32[$0 + 4 >> 2] | 0) + 1 | 0; //@line 3308
 if (($29 | 0) == ($4 | 0)) {
  $19 = HEAP32[(HEAP32[$6 >> 2] | 0) + 76 >> 2] | 0; //@line 3313
  $ReallocAsyncCtx2 = _emscripten_realloc_async_context(24) | 0; //@line 3314
  FUNCTION_TABLE_vi[$19 & 255]($8); //@line 3315
  if (___async) {
   HEAP32[$ReallocAsyncCtx2 >> 2] = 112; //@line 3318
   $20 = $ReallocAsyncCtx2 + 4 | 0; //@line 3319
   HEAP32[$20 >> 2] = $6; //@line 3320
   $21 = $ReallocAsyncCtx2 + 8 | 0; //@line 3321
   HEAP32[$21 >> 2] = $8; //@line 3322
   $22 = $ReallocAsyncCtx2 + 12 | 0; //@line 3323
   HEAP32[$22 >> 2] = $14; //@line 3324
   $23 = $ReallocAsyncCtx2 + 16 | 0; //@line 3325
   HEAP32[$23 >> 2] = $16; //@line 3326
   $24 = $ReallocAsyncCtx2 + 20 | 0; //@line 3327
   HEAP32[$24 >> 2] = $4; //@line 3328
   sp = STACKTOP; //@line 3329
   return;
  }
  ___async_unwind = 0; //@line 3332
  HEAP32[$ReallocAsyncCtx2 >> 2] = 112; //@line 3333
  $20 = $ReallocAsyncCtx2 + 4 | 0; //@line 3334
  HEAP32[$20 >> 2] = $6; //@line 3335
  $21 = $ReallocAsyncCtx2 + 8 | 0; //@line 3336
  HEAP32[$21 >> 2] = $8; //@line 3337
  $22 = $ReallocAsyncCtx2 + 12 | 0; //@line 3338
  HEAP32[$22 >> 2] = $14; //@line 3339
  $23 = $ReallocAsyncCtx2 + 16 | 0; //@line 3340
  HEAP32[$23 >> 2] = $16; //@line 3341
  $24 = $ReallocAsyncCtx2 + 20 | 0; //@line 3342
  HEAP32[$24 >> 2] = $4; //@line 3343
  sp = STACKTOP; //@line 3344
  return;
 } else {
  $27 = HEAP32[(HEAP32[$10 >> 2] | 0) + 68 >> 2] | 0; //@line 3349
  $31 = HEAP8[$12 + $29 >> 0] | 0; //@line 3352
  $ReallocAsyncCtx4 = _emscripten_realloc_async_context(36) | 0; //@line 3353
  FUNCTION_TABLE_iii[$27 & 7]($8, $31) | 0; //@line 3354
  if (___async) {
   HEAP32[$ReallocAsyncCtx4 >> 2] = 114; //@line 3357
   $32 = $ReallocAsyncCtx4 + 4 | 0; //@line 3358
   HEAP32[$32 >> 2] = $29; //@line 3359
   $33 = $ReallocAsyncCtx4 + 8 | 0; //@line 3360
   HEAP32[$33 >> 2] = $4; //@line 3361
   $34 = $ReallocAsyncCtx4 + 12 | 0; //@line 3362
   HEAP32[$34 >> 2] = $6; //@line 3363
   $35 = $ReallocAsyncCtx4 + 16 | 0; //@line 3364
   HEAP32[$35 >> 2] = $8; //@line 3365
   $36 = $ReallocAsyncCtx4 + 20 | 0; //@line 3366
   HEAP32[$36 >> 2] = $10; //@line 3367
   $37 = $ReallocAsyncCtx4 + 24 | 0; //@line 3368
   HEAP32[$37 >> 2] = $12; //@line 3369
   $38 = $ReallocAsyncCtx4 + 28 | 0; //@line 3370
   HEAP32[$38 >> 2] = $14; //@line 3371
   $39 = $ReallocAsyncCtx4 + 32 | 0; //@line 3372
   HEAP32[$39 >> 2] = $16; //@line 3373
   sp = STACKTOP; //@line 3374
   return;
  }
  ___async_unwind = 0; //@line 3377
  HEAP32[$ReallocAsyncCtx4 >> 2] = 114; //@line 3378
  $32 = $ReallocAsyncCtx4 + 4 | 0; //@line 3379
  HEAP32[$32 >> 2] = $29; //@line 3380
  $33 = $ReallocAsyncCtx4 + 8 | 0; //@line 3381
  HEAP32[$33 >> 2] = $4; //@line 3382
  $34 = $ReallocAsyncCtx4 + 12 | 0; //@line 3383
  HEAP32[$34 >> 2] = $6; //@line 3384
  $35 = $ReallocAsyncCtx4 + 16 | 0; //@line 3385
  HEAP32[$35 >> 2] = $8; //@line 3386
  $36 = $ReallocAsyncCtx4 + 20 | 0; //@line 3387
  HEAP32[$36 >> 2] = $10; //@line 3388
  $37 = $ReallocAsyncCtx4 + 24 | 0; //@line 3389
  HEAP32[$37 >> 2] = $12; //@line 3390
  $38 = $ReallocAsyncCtx4 + 28 | 0; //@line 3391
  HEAP32[$38 >> 2] = $14; //@line 3392
  $39 = $ReallocAsyncCtx4 + 32 | 0; //@line 3393
  HEAP32[$39 >> 2] = $16; //@line 3394
  sp = STACKTOP; //@line 3395
  return;
 }
}
function __ZNK10__cxxabiv121__vmi_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($0, $1, $2, $3, $4, $5) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 $5 = $5 | 0;
 var $$0 = 0, $10 = 0, $11 = 0, $12 = 0, $15 = 0, $16 = 0, $31 = 0, $32 = 0, $33 = 0, $62 = 0, $9 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 13324
 if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, $5) | 0) {
  __ZNK10__cxxabiv117__class_type_info29process_static_type_above_dstEPNS_19__dynamic_cast_infoEPKvS4_i(0, $1, $2, $3, $4); //@line 13329
 } else {
  $9 = $1 + 52 | 0; //@line 13331
  $10 = HEAP8[$9 >> 0] | 0; //@line 13332
  $11 = $1 + 53 | 0; //@line 13333
  $12 = HEAP8[$11 >> 0] | 0; //@line 13334
  $15 = HEAP32[$0 + 12 >> 2] | 0; //@line 13337
  $16 = $0 + 16 + ($15 << 3) | 0; //@line 13338
  HEAP8[$9 >> 0] = 0; //@line 13339
  HEAP8[$11 >> 0] = 0; //@line 13340
  $AsyncCtx3 = _emscripten_alloc_async_context(52, sp) | 0; //@line 13341
  __ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($0 + 16 | 0, $1, $2, $3, $4, $5); //@line 13342
  if (___async) {
   HEAP32[$AsyncCtx3 >> 2] = 192; //@line 13345
   HEAP32[$AsyncCtx3 + 4 >> 2] = $15; //@line 13347
   HEAP32[$AsyncCtx3 + 8 >> 2] = $0; //@line 13349
   HEAP32[$AsyncCtx3 + 12 >> 2] = $1; //@line 13351
   HEAP8[$AsyncCtx3 + 16 >> 0] = $10; //@line 13353
   HEAP32[$AsyncCtx3 + 20 >> 2] = $9; //@line 13355
   HEAP8[$AsyncCtx3 + 24 >> 0] = $12; //@line 13357
   HEAP32[$AsyncCtx3 + 28 >> 2] = $11; //@line 13359
   HEAP32[$AsyncCtx3 + 32 >> 2] = $2; //@line 13361
   HEAP32[$AsyncCtx3 + 36 >> 2] = $3; //@line 13363
   HEAP32[$AsyncCtx3 + 40 >> 2] = $4; //@line 13365
   HEAP8[$AsyncCtx3 + 44 >> 0] = $5 & 1; //@line 13368
   HEAP32[$AsyncCtx3 + 48 >> 2] = $16; //@line 13370
   sp = STACKTOP; //@line 13371
   return;
  }
  _emscripten_free_async_context($AsyncCtx3 | 0); //@line 13374
  L7 : do {
   if (($15 | 0) > 1) {
    $31 = $1 + 24 | 0; //@line 13379
    $32 = $0 + 8 | 0; //@line 13380
    $33 = $1 + 54 | 0; //@line 13381
    $$0 = $0 + 24 | 0; //@line 13382
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
     HEAP8[$9 >> 0] = 0; //@line 13415
     HEAP8[$11 >> 0] = 0; //@line 13416
     $AsyncCtx = _emscripten_alloc_async_context(60, sp) | 0; //@line 13417
     __ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($$0, $1, $2, $3, $4, $5); //@line 13418
     if (___async) {
      break;
     }
     _emscripten_free_async_context($AsyncCtx | 0); //@line 13423
     $62 = $$0 + 8 | 0; //@line 13424
     if ($62 >>> 0 < $16 >>> 0) {
      $$0 = $62; //@line 13427
     } else {
      break L7;
     }
    }
    HEAP32[$AsyncCtx >> 2] = 193; //@line 13432
    HEAP32[$AsyncCtx + 4 >> 2] = $$0; //@line 13434
    HEAP32[$AsyncCtx + 8 >> 2] = $16; //@line 13436
    HEAP32[$AsyncCtx + 12 >> 2] = $33; //@line 13438
    HEAP8[$AsyncCtx + 16 >> 0] = $10; //@line 13440
    HEAP32[$AsyncCtx + 20 >> 2] = $9; //@line 13442
    HEAP8[$AsyncCtx + 24 >> 0] = $12; //@line 13444
    HEAP32[$AsyncCtx + 28 >> 2] = $11; //@line 13446
    HEAP32[$AsyncCtx + 32 >> 2] = $31; //@line 13448
    HEAP32[$AsyncCtx + 36 >> 2] = $32; //@line 13450
    HEAP32[$AsyncCtx + 40 >> 2] = $1; //@line 13452
    HEAP32[$AsyncCtx + 44 >> 2] = $2; //@line 13454
    HEAP32[$AsyncCtx + 48 >> 2] = $3; //@line 13456
    HEAP32[$AsyncCtx + 52 >> 2] = $4; //@line 13458
    HEAP8[$AsyncCtx + 56 >> 0] = $5 & 1; //@line 13461
    sp = STACKTOP; //@line 13462
    return;
   }
  } while (0);
  HEAP8[$9 >> 0] = $10; //@line 13466
  HEAP8[$11 >> 0] = $12; //@line 13467
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
      $9 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 10054
      $10 = HEAP32[$9 >> 2] | 0; //@line 10055
      HEAP32[$2 >> 2] = $9 + 4; //@line 10057
      HEAP32[$0 >> 2] = $10; //@line 10058
      break L1;
      break;
     }
    case 10:
     {
      $16 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 10074
      $17 = HEAP32[$16 >> 2] | 0; //@line 10075
      HEAP32[$2 >> 2] = $16 + 4; //@line 10077
      $20 = $0; //@line 10080
      HEAP32[$20 >> 2] = $17; //@line 10082
      HEAP32[$20 + 4 >> 2] = (($17 | 0) < 0) << 31 >> 31; //@line 10085
      break L1;
      break;
     }
    case 11:
     {
      $29 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 10101
      $30 = HEAP32[$29 >> 2] | 0; //@line 10102
      HEAP32[$2 >> 2] = $29 + 4; //@line 10104
      $31 = $0; //@line 10105
      HEAP32[$31 >> 2] = $30; //@line 10107
      HEAP32[$31 + 4 >> 2] = 0; //@line 10110
      break L1;
      break;
     }
    case 12:
     {
      $40 = (HEAP32[$2 >> 2] | 0) + (8 - 1) & ~(8 - 1); //@line 10126
      $41 = $40; //@line 10127
      $43 = HEAP32[$41 >> 2] | 0; //@line 10129
      $46 = HEAP32[$41 + 4 >> 2] | 0; //@line 10132
      HEAP32[$2 >> 2] = $40 + 8; //@line 10134
      $47 = $0; //@line 10135
      HEAP32[$47 >> 2] = $43; //@line 10137
      HEAP32[$47 + 4 >> 2] = $46; //@line 10140
      break L1;
      break;
     }
    case 13:
     {
      $56 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 10156
      $57 = HEAP32[$56 >> 2] | 0; //@line 10157
      HEAP32[$2 >> 2] = $56 + 4; //@line 10159
      $59 = ($57 & 65535) << 16 >> 16; //@line 10161
      $62 = $0; //@line 10164
      HEAP32[$62 >> 2] = $59; //@line 10166
      HEAP32[$62 + 4 >> 2] = (($59 | 0) < 0) << 31 >> 31; //@line 10169
      break L1;
      break;
     }
    case 14:
     {
      $71 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 10185
      $72 = HEAP32[$71 >> 2] | 0; //@line 10186
      HEAP32[$2 >> 2] = $71 + 4; //@line 10188
      $73 = $0; //@line 10190
      HEAP32[$73 >> 2] = $72 & 65535; //@line 10192
      HEAP32[$73 + 4 >> 2] = 0; //@line 10195
      break L1;
      break;
     }
    case 15:
     {
      $82 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 10211
      $83 = HEAP32[$82 >> 2] | 0; //@line 10212
      HEAP32[$2 >> 2] = $82 + 4; //@line 10214
      $85 = ($83 & 255) << 24 >> 24; //@line 10216
      $88 = $0; //@line 10219
      HEAP32[$88 >> 2] = $85; //@line 10221
      HEAP32[$88 + 4 >> 2] = (($85 | 0) < 0) << 31 >> 31; //@line 10224
      break L1;
      break;
     }
    case 16:
     {
      $97 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 10240
      $98 = HEAP32[$97 >> 2] | 0; //@line 10241
      HEAP32[$2 >> 2] = $97 + 4; //@line 10243
      $99 = $0; //@line 10245
      HEAP32[$99 >> 2] = $98 & 255; //@line 10247
      HEAP32[$99 + 4 >> 2] = 0; //@line 10250
      break L1;
      break;
     }
    case 17:
     {
      $108 = (HEAP32[$2 >> 2] | 0) + (8 - 1) & ~(8 - 1); //@line 10266
      $109 = +HEAPF64[$108 >> 3]; //@line 10267
      HEAP32[$2 >> 2] = $108 + 8; //@line 10269
      HEAPF64[$0 >> 3] = $109; //@line 10270
      break L1;
      break;
     }
    case 18:
     {
      $115 = (HEAP32[$2 >> 2] | 0) + (8 - 1) & ~(8 - 1); //@line 10286
      $116 = +HEAPF64[$115 >> 3]; //@line 10287
      HEAP32[$2 >> 2] = $115 + 8; //@line 10289
      HEAPF64[$0 >> 3] = $116; //@line 10290
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
function __ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_10($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $15 = 0, $18 = 0, $2 = 0, $21 = 0, $24 = 0, $36 = 0, $37 = 0, $38 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx = 0, $ReallocAsyncCtx2 = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 6
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 8
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 10
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 12
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 14
 $10 = HEAP8[$0 + 20 >> 0] & 1; //@line 17
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 19
 $15 = $12 + 24 | 0; //@line 22
 do {
  if ((HEAP32[$0 + 28 >> 2] | 0) > 1) {
   $18 = HEAP32[$12 + 8 >> 2] | 0; //@line 27
   if (!($18 & 2)) {
    $21 = $4 + 36 | 0; //@line 31
    if ((HEAP32[$21 >> 2] | 0) != 1) {
     if (!($18 & 1)) {
      $38 = $4 + 54 | 0; //@line 38
      if (HEAP8[$38 >> 0] | 0) {
       break;
      }
      if ((HEAP32[$21 >> 2] | 0) == 1) {
       break;
      }
      $ReallocAsyncCtx = _emscripten_realloc_async_context(36) | 0; //@line 49
      __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($15, $4, $6, $8, $10); //@line 50
      if (!___async) {
       ___async_unwind = 0; //@line 53
      }
      HEAP32[$ReallocAsyncCtx >> 2] = 198; //@line 55
      HEAP32[$ReallocAsyncCtx + 4 >> 2] = $15; //@line 57
      HEAP32[$ReallocAsyncCtx + 8 >> 2] = $2; //@line 59
      HEAP32[$ReallocAsyncCtx + 12 >> 2] = $38; //@line 61
      HEAP32[$ReallocAsyncCtx + 16 >> 2] = $21; //@line 63
      HEAP32[$ReallocAsyncCtx + 20 >> 2] = $4; //@line 65
      HEAP32[$ReallocAsyncCtx + 24 >> 2] = $6; //@line 67
      HEAP32[$ReallocAsyncCtx + 28 >> 2] = $8; //@line 69
      HEAP8[$ReallocAsyncCtx + 32 >> 0] = $10 & 1; //@line 72
      sp = STACKTOP; //@line 73
      return;
     }
     $36 = $4 + 24 | 0; //@line 76
     $37 = $4 + 54 | 0; //@line 77
     if (HEAP8[$37 >> 0] | 0) {
      break;
     }
     if ((HEAP32[$21 >> 2] | 0) == 1) {
      if ((HEAP32[$36 >> 2] | 0) == 1) {
       break;
      }
     }
     $ReallocAsyncCtx2 = _emscripten_realloc_async_context(40) | 0; //@line 92
     __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($15, $4, $6, $8, $10); //@line 93
     if (!___async) {
      ___async_unwind = 0; //@line 96
     }
     HEAP32[$ReallocAsyncCtx2 >> 2] = 197; //@line 98
     HEAP32[$ReallocAsyncCtx2 + 4 >> 2] = $15; //@line 100
     HEAP32[$ReallocAsyncCtx2 + 8 >> 2] = $2; //@line 102
     HEAP32[$ReallocAsyncCtx2 + 12 >> 2] = $37; //@line 104
     HEAP32[$ReallocAsyncCtx2 + 16 >> 2] = $21; //@line 106
     HEAP32[$ReallocAsyncCtx2 + 20 >> 2] = $36; //@line 108
     HEAP32[$ReallocAsyncCtx2 + 24 >> 2] = $4; //@line 110
     HEAP32[$ReallocAsyncCtx2 + 28 >> 2] = $6; //@line 112
     HEAP32[$ReallocAsyncCtx2 + 32 >> 2] = $8; //@line 114
     HEAP8[$ReallocAsyncCtx2 + 36 >> 0] = $10 & 1; //@line 117
     sp = STACKTOP; //@line 118
     return;
    }
   }
   $24 = $4 + 54 | 0; //@line 122
   if (!(HEAP8[$24 >> 0] | 0)) {
    $ReallocAsyncCtx3 = _emscripten_realloc_async_context(32) | 0; //@line 126
    __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($15, $4, $6, $8, $10); //@line 127
    if (!___async) {
     ___async_unwind = 0; //@line 130
    }
    HEAP32[$ReallocAsyncCtx3 >> 2] = 196; //@line 132
    HEAP32[$ReallocAsyncCtx3 + 4 >> 2] = $15; //@line 134
    HEAP32[$ReallocAsyncCtx3 + 8 >> 2] = $2; //@line 136
    HEAP32[$ReallocAsyncCtx3 + 12 >> 2] = $24; //@line 138
    HEAP32[$ReallocAsyncCtx3 + 16 >> 2] = $4; //@line 140
    HEAP32[$ReallocAsyncCtx3 + 20 >> 2] = $6; //@line 142
    HEAP32[$ReallocAsyncCtx3 + 24 >> 2] = $8; //@line 144
    HEAP8[$ReallocAsyncCtx3 + 28 >> 0] = $10 & 1; //@line 147
    sp = STACKTOP; //@line 148
    return;
   }
  }
 } while (0);
 return;
}
function __ZN4mbed6Stream6printfEPKcz__async_cb_36($0) {
 $0 = $0 | 0;
 var $10 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $23 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $4 = 0, $6 = 0, $8 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx2 = 0, $ReallocAsyncCtx4 = 0, sp = 0;
 sp = STACKTOP; //@line 3403
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 3405
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 3407
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 3409
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 3411
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 3413
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 3415
 if (($AsyncRetVal | 0) <= 0) {
  $15 = HEAP32[(HEAP32[$4 >> 2] | 0) + 76 >> 2] | 0; //@line 3420
  $ReallocAsyncCtx2 = _emscripten_realloc_async_context(24) | 0; //@line 3421
  FUNCTION_TABLE_vi[$15 & 255]($2); //@line 3422
  if (___async) {
   HEAP32[$ReallocAsyncCtx2 >> 2] = 112; //@line 3425
   $16 = $ReallocAsyncCtx2 + 4 | 0; //@line 3426
   HEAP32[$16 >> 2] = $4; //@line 3427
   $17 = $ReallocAsyncCtx2 + 8 | 0; //@line 3428
   HEAP32[$17 >> 2] = $2; //@line 3429
   $18 = $ReallocAsyncCtx2 + 12 | 0; //@line 3430
   HEAP32[$18 >> 2] = $6; //@line 3431
   $19 = $ReallocAsyncCtx2 + 16 | 0; //@line 3432
   HEAP32[$19 >> 2] = $8; //@line 3433
   $20 = $ReallocAsyncCtx2 + 20 | 0; //@line 3434
   HEAP32[$20 >> 2] = $AsyncRetVal; //@line 3435
   sp = STACKTOP; //@line 3436
   return;
  }
  ___async_unwind = 0; //@line 3439
  HEAP32[$ReallocAsyncCtx2 >> 2] = 112; //@line 3440
  $16 = $ReallocAsyncCtx2 + 4 | 0; //@line 3441
  HEAP32[$16 >> 2] = $4; //@line 3442
  $17 = $ReallocAsyncCtx2 + 8 | 0; //@line 3443
  HEAP32[$17 >> 2] = $2; //@line 3444
  $18 = $ReallocAsyncCtx2 + 12 | 0; //@line 3445
  HEAP32[$18 >> 2] = $6; //@line 3446
  $19 = $ReallocAsyncCtx2 + 16 | 0; //@line 3447
  HEAP32[$19 >> 2] = $8; //@line 3448
  $20 = $ReallocAsyncCtx2 + 20 | 0; //@line 3449
  HEAP32[$20 >> 2] = $AsyncRetVal; //@line 3450
  sp = STACKTOP; //@line 3451
  return;
 }
 $23 = HEAP32[(HEAP32[$2 >> 2] | 0) + 68 >> 2] | 0; //@line 3456
 $25 = HEAP8[$10 >> 0] | 0; //@line 3458
 $ReallocAsyncCtx4 = _emscripten_realloc_async_context(36) | 0; //@line 3459
 FUNCTION_TABLE_iii[$23 & 7]($2, $25) | 0; //@line 3460
 if (___async) {
  HEAP32[$ReallocAsyncCtx4 >> 2] = 114; //@line 3463
  $26 = $ReallocAsyncCtx4 + 4 | 0; //@line 3464
  HEAP32[$26 >> 2] = 0; //@line 3465
  $27 = $ReallocAsyncCtx4 + 8 | 0; //@line 3466
  HEAP32[$27 >> 2] = $AsyncRetVal; //@line 3467
  $28 = $ReallocAsyncCtx4 + 12 | 0; //@line 3468
  HEAP32[$28 >> 2] = $4; //@line 3469
  $29 = $ReallocAsyncCtx4 + 16 | 0; //@line 3470
  HEAP32[$29 >> 2] = $2; //@line 3471
  $30 = $ReallocAsyncCtx4 + 20 | 0; //@line 3472
  HEAP32[$30 >> 2] = $2; //@line 3473
  $31 = $ReallocAsyncCtx4 + 24 | 0; //@line 3474
  HEAP32[$31 >> 2] = $10; //@line 3475
  $32 = $ReallocAsyncCtx4 + 28 | 0; //@line 3476
  HEAP32[$32 >> 2] = $6; //@line 3477
  $33 = $ReallocAsyncCtx4 + 32 | 0; //@line 3478
  HEAP32[$33 >> 2] = $8; //@line 3479
  sp = STACKTOP; //@line 3480
  return;
 }
 ___async_unwind = 0; //@line 3483
 HEAP32[$ReallocAsyncCtx4 >> 2] = 114; //@line 3484
 $26 = $ReallocAsyncCtx4 + 4 | 0; //@line 3485
 HEAP32[$26 >> 2] = 0; //@line 3486
 $27 = $ReallocAsyncCtx4 + 8 | 0; //@line 3487
 HEAP32[$27 >> 2] = $AsyncRetVal; //@line 3488
 $28 = $ReallocAsyncCtx4 + 12 | 0; //@line 3489
 HEAP32[$28 >> 2] = $4; //@line 3490
 $29 = $ReallocAsyncCtx4 + 16 | 0; //@line 3491
 HEAP32[$29 >> 2] = $2; //@line 3492
 $30 = $ReallocAsyncCtx4 + 20 | 0; //@line 3493
 HEAP32[$30 >> 2] = $2; //@line 3494
 $31 = $ReallocAsyncCtx4 + 24 | 0; //@line 3495
 HEAP32[$31 >> 2] = $10; //@line 3496
 $32 = $ReallocAsyncCtx4 + 28 | 0; //@line 3497
 HEAP32[$32 >> 2] = $6; //@line 3498
 $33 = $ReallocAsyncCtx4 + 32 | 0; //@line 3499
 HEAP32[$33 >> 2] = $8; //@line 3500
 sp = STACKTOP; //@line 3501
 return;
}
function __ZN11TextDisplay3clsEv($0) {
 $0 = $0 | 0;
 var $$03 = 0, $13 = 0, $14 = 0, $24 = 0, $27 = 0, $28 = 0, $3 = 0, $35 = 0, $36 = 0, $7 = 0, $8 = 0, $AsyncCtx = 0, $AsyncCtx12 = 0, $AsyncCtx16 = 0, $AsyncCtx2 = 0, $AsyncCtx5 = 0, $AsyncCtx9 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 1740
 $3 = HEAP32[(HEAP32[$0 >> 2] | 0) + 108 >> 2] | 0; //@line 1743
 $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 1744
 FUNCTION_TABLE_viii[$3 & 3]($0, 0, 0); //@line 1745
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 72; //@line 1748
  HEAP32[$AsyncCtx + 4 >> 2] = $0; //@line 1750
  sp = STACKTOP; //@line 1751
  return;
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 1754
 $7 = HEAP32[(HEAP32[$0 >> 2] | 0) + 96 >> 2] | 0; //@line 1757
 $AsyncCtx2 = _emscripten_alloc_async_context(12, sp) | 0; //@line 1758
 $8 = FUNCTION_TABLE_ii[$7 & 31]($0) | 0; //@line 1759
 if (___async) {
  HEAP32[$AsyncCtx2 >> 2] = 73; //@line 1762
  HEAP32[$AsyncCtx2 + 4 >> 2] = $0; //@line 1764
  HEAP32[$AsyncCtx2 + 8 >> 2] = $0; //@line 1766
  sp = STACKTOP; //@line 1767
  return;
 }
 _emscripten_free_async_context($AsyncCtx2 | 0); //@line 1770
 $13 = HEAP32[(HEAP32[$0 >> 2] | 0) + 92 >> 2] | 0; //@line 1773
 $AsyncCtx5 = _emscripten_alloc_async_context(16, sp) | 0; //@line 1774
 $14 = FUNCTION_TABLE_ii[$13 & 31]($0) | 0; //@line 1775
 if (___async) {
  HEAP32[$AsyncCtx5 >> 2] = 74; //@line 1778
  HEAP32[$AsyncCtx5 + 4 >> 2] = $8; //@line 1780
  HEAP32[$AsyncCtx5 + 8 >> 2] = $0; //@line 1782
  HEAP32[$AsyncCtx5 + 12 >> 2] = $0; //@line 1784
  sp = STACKTOP; //@line 1785
  return;
 }
 _emscripten_free_async_context($AsyncCtx5 | 0); //@line 1788
 if ((Math_imul($14, $8) | 0) <= 0) {
  return;
 }
 $$03 = 0; //@line 1794
 while (1) {
  $AsyncCtx16 = _emscripten_alloc_async_context(20, sp) | 0; //@line 1796
  __ZN4mbed6Stream4putcEi($0, 32) | 0; //@line 1797
  if (___async) {
   label = 11; //@line 1800
   break;
  }
  _emscripten_free_async_context($AsyncCtx16 | 0); //@line 1803
  $24 = $$03 + 1 | 0; //@line 1804
  $27 = HEAP32[(HEAP32[$0 >> 2] | 0) + 96 >> 2] | 0; //@line 1807
  $AsyncCtx9 = _emscripten_alloc_async_context(20, sp) | 0; //@line 1808
  $28 = FUNCTION_TABLE_ii[$27 & 31]($0) | 0; //@line 1809
  if (___async) {
   label = 13; //@line 1812
   break;
  }
  _emscripten_free_async_context($AsyncCtx9 | 0); //@line 1815
  $35 = HEAP32[(HEAP32[$0 >> 2] | 0) + 92 >> 2] | 0; //@line 1818
  $AsyncCtx12 = _emscripten_alloc_async_context(24, sp) | 0; //@line 1819
  $36 = FUNCTION_TABLE_ii[$35 & 31]($0) | 0; //@line 1820
  if (___async) {
   label = 15; //@line 1823
   break;
  }
  _emscripten_free_async_context($AsyncCtx12 | 0); //@line 1826
  if (($24 | 0) < (Math_imul($36, $28) | 0)) {
   $$03 = $24; //@line 1830
  } else {
   label = 9; //@line 1832
   break;
  }
 }
 if ((label | 0) == 9) {
  return;
 } else if ((label | 0) == 11) {
  HEAP32[$AsyncCtx16 >> 2] = 75; //@line 1840
  HEAP32[$AsyncCtx16 + 4 >> 2] = $$03; //@line 1842
  HEAP32[$AsyncCtx16 + 8 >> 2] = $0; //@line 1844
  HEAP32[$AsyncCtx16 + 12 >> 2] = $0; //@line 1846
  HEAP32[$AsyncCtx16 + 16 >> 2] = $0; //@line 1848
  sp = STACKTOP; //@line 1849
  return;
 } else if ((label | 0) == 13) {
  HEAP32[$AsyncCtx9 >> 2] = 76; //@line 1853
  HEAP32[$AsyncCtx9 + 4 >> 2] = $0; //@line 1855
  HEAP32[$AsyncCtx9 + 8 >> 2] = $0; //@line 1857
  HEAP32[$AsyncCtx9 + 12 >> 2] = $24; //@line 1859
  HEAP32[$AsyncCtx9 + 16 >> 2] = $0; //@line 1861
  sp = STACKTOP; //@line 1862
  return;
 } else if ((label | 0) == 15) {
  HEAP32[$AsyncCtx12 >> 2] = 77; //@line 1866
  HEAP32[$AsyncCtx12 + 4 >> 2] = $28; //@line 1868
  HEAP32[$AsyncCtx12 + 8 >> 2] = $24; //@line 1870
  HEAP32[$AsyncCtx12 + 12 >> 2] = $0; //@line 1872
  HEAP32[$AsyncCtx12 + 16 >> 2] = $0; //@line 1874
  HEAP32[$AsyncCtx12 + 20 >> 2] = $0; //@line 1876
  sp = STACKTOP; //@line 1877
  return;
 }
}
function __ZN11TextDisplay5_putcEi($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $11 = 0, $12 = 0, $19 = 0, $20 = 0, $22 = 0, $23 = 0, $25 = 0, $31 = 0, $32 = 0, $35 = 0, $36 = 0, $45 = 0, $46 = 0, $49 = 0, $5 = 0, $50 = 0, $7 = 0, $8 = 0, $AsyncCtx = 0, $AsyncCtx10 = 0, $AsyncCtx3 = 0, $AsyncCtx6 = 0, sp = 0;
 sp = STACKTOP; //@line 1556
 _emscripten_asm_const_ii(2, $1 | 0) | 0; //@line 1557
 if (($1 | 0) == 10) {
  HEAP16[$0 + 24 >> 1] = 0; //@line 1561
  $5 = $0 + 26 | 0; //@line 1562
  $7 = (HEAP16[$5 >> 1] | 0) + 1 << 16 >> 16; //@line 1564
  HEAP16[$5 >> 1] = $7; //@line 1565
  $8 = $7 & 65535; //@line 1566
  $11 = HEAP32[(HEAP32[$0 >> 2] | 0) + 92 >> 2] | 0; //@line 1569
  $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 1570
  $12 = FUNCTION_TABLE_ii[$11 & 31]($0) | 0; //@line 1571
  if (___async) {
   HEAP32[$AsyncCtx >> 2] = 66; //@line 1574
   HEAP32[$AsyncCtx + 4 >> 2] = $8; //@line 1576
   HEAP32[$AsyncCtx + 8 >> 2] = $1; //@line 1578
   HEAP32[$AsyncCtx + 12 >> 2] = $5; //@line 1580
   sp = STACKTOP; //@line 1581
   return 0; //@line 1582
  }
  _emscripten_free_async_context($AsyncCtx | 0); //@line 1584
  if (($12 | 0) > ($8 | 0)) {
   return $1 | 0; //@line 1587
  }
  HEAP16[$5 >> 1] = 0; //@line 1589
  return $1 | 0; //@line 1590
 }
 $19 = HEAP32[(HEAP32[$0 >> 2] | 0) + 88 >> 2] | 0; //@line 1594
 $20 = $0 + 24 | 0; //@line 1595
 $22 = HEAPU16[$20 >> 1] | 0; //@line 1597
 $23 = $0 + 26 | 0; //@line 1598
 $25 = HEAPU16[$23 >> 1] | 0; //@line 1600
 $AsyncCtx3 = _emscripten_alloc_async_context(20, sp) | 0; //@line 1601
 FUNCTION_TABLE_viiii[$19 & 7]($0, $22, $25, $1); //@line 1602
 if (___async) {
  HEAP32[$AsyncCtx3 >> 2] = 67; //@line 1605
  HEAP32[$AsyncCtx3 + 4 >> 2] = $20; //@line 1607
  HEAP32[$AsyncCtx3 + 8 >> 2] = $0; //@line 1609
  HEAP32[$AsyncCtx3 + 12 >> 2] = $1; //@line 1611
  HEAP32[$AsyncCtx3 + 16 >> 2] = $23; //@line 1613
  sp = STACKTOP; //@line 1614
  return 0; //@line 1615
 }
 _emscripten_free_async_context($AsyncCtx3 | 0); //@line 1617
 $31 = (HEAP16[$20 >> 1] | 0) + 1 << 16 >> 16; //@line 1619
 HEAP16[$20 >> 1] = $31; //@line 1620
 $32 = $31 & 65535; //@line 1621
 $35 = HEAP32[(HEAP32[$0 >> 2] | 0) + 96 >> 2] | 0; //@line 1624
 $AsyncCtx6 = _emscripten_alloc_async_context(28, sp) | 0; //@line 1625
 $36 = FUNCTION_TABLE_ii[$35 & 31]($0) | 0; //@line 1626
 if (___async) {
  HEAP32[$AsyncCtx6 >> 2] = 68; //@line 1629
  HEAP32[$AsyncCtx6 + 4 >> 2] = $32; //@line 1631
  HEAP32[$AsyncCtx6 + 8 >> 2] = $1; //@line 1633
  HEAP32[$AsyncCtx6 + 12 >> 2] = $20; //@line 1635
  HEAP32[$AsyncCtx6 + 16 >> 2] = $23; //@line 1637
  HEAP32[$AsyncCtx6 + 20 >> 2] = $0; //@line 1639
  HEAP32[$AsyncCtx6 + 24 >> 2] = $0; //@line 1641
  sp = STACKTOP; //@line 1642
  return 0; //@line 1643
 }
 _emscripten_free_async_context($AsyncCtx6 | 0); //@line 1645
 if (($36 | 0) > ($32 | 0)) {
  return $1 | 0; //@line 1648
 }
 HEAP16[$20 >> 1] = 0; //@line 1650
 $45 = (HEAP16[$23 >> 1] | 0) + 1 << 16 >> 16; //@line 1652
 HEAP16[$23 >> 1] = $45; //@line 1653
 $46 = $45 & 65535; //@line 1654
 $49 = HEAP32[(HEAP32[$0 >> 2] | 0) + 92 >> 2] | 0; //@line 1657
 $AsyncCtx10 = _emscripten_alloc_async_context(16, sp) | 0; //@line 1658
 $50 = FUNCTION_TABLE_ii[$49 & 31]($0) | 0; //@line 1659
 if (___async) {
  HEAP32[$AsyncCtx10 >> 2] = 69; //@line 1662
  HEAP32[$AsyncCtx10 + 4 >> 2] = $46; //@line 1664
  HEAP32[$AsyncCtx10 + 8 >> 2] = $1; //@line 1666
  HEAP32[$AsyncCtx10 + 12 >> 2] = $23; //@line 1668
  sp = STACKTOP; //@line 1669
  return 0; //@line 1670
 }
 _emscripten_free_async_context($AsyncCtx10 | 0); //@line 1672
 if (($50 | 0) > ($46 | 0)) {
  return $1 | 0; //@line 1675
 }
 HEAP16[$23 >> 1] = 0; //@line 1677
 return $1 | 0; //@line 1678
}
function _vfprintf($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$ = 0, $$0 = 0, $$1 = 0, $13 = 0, $14 = 0, $19 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $28 = 0, $29 = 0, $3 = 0, $32 = 0, $4 = 0, $43 = 0, $5 = 0, $51 = 0, $6 = 0, $AsyncCtx = 0, dest = 0, sp = 0, stop = 0;
 sp = STACKTOP; //@line 8954
 STACKTOP = STACKTOP + 224 | 0; //@line 8955
 $3 = sp + 120 | 0; //@line 8956
 $4 = sp + 80 | 0; //@line 8957
 $5 = sp; //@line 8958
 $6 = sp + 136 | 0; //@line 8959
 dest = $4; //@line 8960
 stop = dest + 40 | 0; //@line 8960
 do {
  HEAP32[dest >> 2] = 0; //@line 8960
  dest = dest + 4 | 0; //@line 8960
 } while ((dest | 0) < (stop | 0));
 HEAP32[$3 >> 2] = HEAP32[$2 >> 2]; //@line 8962
 if ((_printf_core(0, $1, $3, $5, $4) | 0) < 0) {
  $$0 = -1; //@line 8966
 } else {
  if ((HEAP32[$0 + 76 >> 2] | 0) > -1) {
   $43 = ___lockfile($0) | 0; //@line 8973
  } else {
   $43 = 0; //@line 8975
  }
  $13 = HEAP32[$0 >> 2] | 0; //@line 8977
  $14 = $13 & 32; //@line 8978
  if ((HEAP8[$0 + 74 >> 0] | 0) < 1) {
   HEAP32[$0 >> 2] = $13 & -33; //@line 8984
  }
  $19 = $0 + 48 | 0; //@line 8986
  do {
   if (!(HEAP32[$19 >> 2] | 0)) {
    $23 = $0 + 44 | 0; //@line 8991
    $24 = HEAP32[$23 >> 2] | 0; //@line 8992
    HEAP32[$23 >> 2] = $6; //@line 8993
    $25 = $0 + 28 | 0; //@line 8994
    HEAP32[$25 >> 2] = $6; //@line 8995
    $26 = $0 + 20 | 0; //@line 8996
    HEAP32[$26 >> 2] = $6; //@line 8997
    HEAP32[$19 >> 2] = 80; //@line 8998
    $28 = $0 + 16 | 0; //@line 9000
    HEAP32[$28 >> 2] = $6 + 80; //@line 9001
    $29 = _printf_core($0, $1, $3, $5, $4) | 0; //@line 9002
    if (!$24) {
     $$1 = $29; //@line 9005
    } else {
     $32 = HEAP32[$0 + 36 >> 2] | 0; //@line 9008
     $AsyncCtx = _emscripten_alloc_async_context(64, sp) | 0; //@line 9009
     FUNCTION_TABLE_iiii[$32 & 15]($0, 0, 0) | 0; //@line 9010
     if (___async) {
      HEAP32[$AsyncCtx >> 2] = 165; //@line 9013
      HEAP32[$AsyncCtx + 4 >> 2] = $26; //@line 9015
      HEAP32[$AsyncCtx + 8 >> 2] = $29; //@line 9017
      HEAP32[$AsyncCtx + 12 >> 2] = $24; //@line 9019
      HEAP32[$AsyncCtx + 16 >> 2] = $23; //@line 9021
      HEAP32[$AsyncCtx + 20 >> 2] = $19; //@line 9023
      HEAP32[$AsyncCtx + 24 >> 2] = $28; //@line 9025
      HEAP32[$AsyncCtx + 28 >> 2] = $25; //@line 9027
      HEAP32[$AsyncCtx + 32 >> 2] = $0; //@line 9029
      HEAP32[$AsyncCtx + 36 >> 2] = $14; //@line 9031
      HEAP32[$AsyncCtx + 40 >> 2] = $43; //@line 9033
      HEAP32[$AsyncCtx + 44 >> 2] = $0; //@line 9035
      HEAP32[$AsyncCtx + 48 >> 2] = $6; //@line 9037
      HEAP32[$AsyncCtx + 52 >> 2] = $5; //@line 9039
      HEAP32[$AsyncCtx + 56 >> 2] = $4; //@line 9041
      HEAP32[$AsyncCtx + 60 >> 2] = $3; //@line 9043
      sp = STACKTOP; //@line 9044
      STACKTOP = sp; //@line 9045
      return 0; //@line 9045
     } else {
      _emscripten_free_async_context($AsyncCtx | 0); //@line 9047
      $$ = (HEAP32[$26 >> 2] | 0) == 0 ? -1 : $29; //@line 9050
      HEAP32[$23 >> 2] = $24; //@line 9051
      HEAP32[$19 >> 2] = 0; //@line 9052
      HEAP32[$28 >> 2] = 0; //@line 9053
      HEAP32[$25 >> 2] = 0; //@line 9054
      HEAP32[$26 >> 2] = 0; //@line 9055
      $$1 = $$; //@line 9056
      break;
     }
    }
   } else {
    $$1 = _printf_core($0, $1, $3, $5, $4) | 0; //@line 9062
   }
  } while (0);
  $51 = HEAP32[$0 >> 2] | 0; //@line 9065
  HEAP32[$0 >> 2] = $51 | $14; //@line 9070
  if ($43 | 0) {
   ___unlockfile($0); //@line 9073
  }
  $$0 = ($51 & 32 | 0) == 0 ? $$1 : -1; //@line 9075
 }
 STACKTOP = sp; //@line 9077
 return $$0 | 0; //@line 9077
}
function ___dynamic_cast($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $$0 = 0, $10 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $24 = 0, $30 = 0, $33 = 0, $4 = 0, $5 = 0, $8 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, dest = 0, sp = 0, stop = 0;
 sp = STACKTOP; //@line 12859
 STACKTOP = STACKTOP + 64 | 0; //@line 12860
 $4 = sp; //@line 12861
 $5 = HEAP32[$0 >> 2] | 0; //@line 12862
 $8 = $0 + (HEAP32[$5 + -8 >> 2] | 0) | 0; //@line 12865
 $10 = HEAP32[$5 + -4 >> 2] | 0; //@line 12867
 HEAP32[$4 >> 2] = $2; //@line 12868
 HEAP32[$4 + 4 >> 2] = $0; //@line 12870
 HEAP32[$4 + 8 >> 2] = $1; //@line 12872
 HEAP32[$4 + 12 >> 2] = $3; //@line 12874
 $14 = $4 + 16 | 0; //@line 12875
 $15 = $4 + 20 | 0; //@line 12876
 $16 = $4 + 24 | 0; //@line 12877
 $17 = $4 + 28 | 0; //@line 12878
 $18 = $4 + 32 | 0; //@line 12879
 $19 = $4 + 40 | 0; //@line 12880
 dest = $14; //@line 12881
 stop = dest + 36 | 0; //@line 12881
 do {
  HEAP32[dest >> 2] = 0; //@line 12881
  dest = dest + 4 | 0; //@line 12881
 } while ((dest | 0) < (stop | 0));
 HEAP16[$14 + 36 >> 1] = 0; //@line 12881
 HEAP8[$14 + 38 >> 0] = 0; //@line 12881
 L1 : do {
  if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($10, $2, 0) | 0) {
   HEAP32[$4 + 48 >> 2] = 1; //@line 12886
   $24 = HEAP32[(HEAP32[$10 >> 2] | 0) + 20 >> 2] | 0; //@line 12889
   $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 12890
   FUNCTION_TABLE_viiiiii[$24 & 7]($10, $4, $8, $8, 1, 0); //@line 12891
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 184; //@line 12894
    HEAP32[$AsyncCtx + 4 >> 2] = $16; //@line 12896
    HEAP32[$AsyncCtx + 8 >> 2] = $8; //@line 12898
    HEAP32[$AsyncCtx + 12 >> 2] = $4; //@line 12900
    sp = STACKTOP; //@line 12901
    STACKTOP = sp; //@line 12902
    return 0; //@line 12902
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 12904
    $$0 = (HEAP32[$16 >> 2] | 0) == 1 ? $8 : 0; //@line 12908
    break;
   }
  } else {
   $30 = $4 + 36 | 0; //@line 12912
   $33 = HEAP32[(HEAP32[$10 >> 2] | 0) + 24 >> 2] | 0; //@line 12915
   $AsyncCtx3 = _emscripten_alloc_async_context(36, sp) | 0; //@line 12916
   FUNCTION_TABLE_viiiii[$33 & 7]($10, $4, $8, 1, 0); //@line 12917
   if (___async) {
    HEAP32[$AsyncCtx3 >> 2] = 185; //@line 12920
    HEAP32[$AsyncCtx3 + 4 >> 2] = $30; //@line 12922
    HEAP32[$AsyncCtx3 + 8 >> 2] = $4; //@line 12924
    HEAP32[$AsyncCtx3 + 12 >> 2] = $19; //@line 12926
    HEAP32[$AsyncCtx3 + 16 >> 2] = $17; //@line 12928
    HEAP32[$AsyncCtx3 + 20 >> 2] = $18; //@line 12930
    HEAP32[$AsyncCtx3 + 24 >> 2] = $15; //@line 12932
    HEAP32[$AsyncCtx3 + 28 >> 2] = $16; //@line 12934
    HEAP32[$AsyncCtx3 + 32 >> 2] = $14; //@line 12936
    sp = STACKTOP; //@line 12937
    STACKTOP = sp; //@line 12938
    return 0; //@line 12938
   }
   _emscripten_free_async_context($AsyncCtx3 | 0); //@line 12940
   switch (HEAP32[$30 >> 2] | 0) {
   case 0:
    {
     $$0 = (HEAP32[$19 >> 2] | 0) == 1 & (HEAP32[$17 >> 2] | 0) == 1 & (HEAP32[$18 >> 2] | 0) == 1 ? HEAP32[$15 >> 2] | 0 : 0; //@line 12954
     break L1;
     break;
    }
   case 1:
    {
     break;
    }
   default:
    {
     $$0 = 0; //@line 12962
     break L1;
    }
   }
   if ((HEAP32[$16 >> 2] | 0) != 1) {
    if (!((HEAP32[$19 >> 2] | 0) == 0 & (HEAP32[$17 >> 2] | 0) == 1 & (HEAP32[$18 >> 2] | 0) == 1)) {
     $$0 = 0; //@line 12978
     break;
    }
   }
   $$0 = HEAP32[$14 >> 2] | 0; //@line 12983
  }
 } while (0);
 STACKTOP = sp; //@line 12986
 return $$0 | 0; //@line 12986
}
function __ZN6C128328print_bmE6Bitmapii($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $$02225 = 0, $$02225$us = 0, $$023$us30 = 0, $10 = 0, $11 = 0, $13 = 0, $27 = 0, $30 = 0, $5 = 0, $53 = 0, $55 = 0, $7 = 0, $9 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 864
 $5 = HEAP32[$1 + 4 >> 2] | 0; //@line 866
 if (($5 | 0) <= 0) {
  return;
 }
 $7 = HEAP32[$1 >> 2] | 0; //@line 871
 $9 = $1 + 12 | 0; //@line 873
 $10 = $1 + 8 | 0; //@line 874
 if (($7 | 0) > 0) {
  $$02225$us = 0; //@line 876
 } else {
  $$02225 = 0; //@line 878
  do {
   $$02225 = $$02225 + 1 | 0; //@line 880
  } while (($$02225 | 0) < ($5 | 0));
  return;
 }
 L8 : while (1) {
  $11 = $$02225$us + $3 | 0; //@line 891
  L10 : do {
   if (($11 | 0) <= 31) {
    $$023$us30 = 0; //@line 895
    while (1) {
     $13 = $$023$us30 + $2 | 0; //@line 897
     if (($13 | 0) > 127) {
      break L10;
     }
     $27 = (128 >>> ($$023$us30 & 7) & HEAP8[(HEAP32[$9 >> 2] | 0) + ((Math_imul(HEAP32[$10 >> 2] | 0, $$02225$us) | 0) + ($$023$us30 >>> 3 & 31)) >> 0] | 0) == 0; //@line 914
     $30 = HEAP32[(HEAP32[$0 >> 2] | 0) + 120 >> 2] | 0; //@line 917
     if ($27) {
      $AsyncCtx3 = _emscripten_alloc_async_context(48, sp) | 0; //@line 919
      FUNCTION_TABLE_viiii[$30 & 7]($0, $13, $11, 0); //@line 920
      if (___async) {
       label = 10; //@line 923
       break L8;
      }
      _emscripten_free_async_context($AsyncCtx3 | 0); //@line 926
     } else {
      $AsyncCtx = _emscripten_alloc_async_context(48, sp) | 0; //@line 928
      FUNCTION_TABLE_viiii[$30 & 7]($0, $13, $11, 1); //@line 929
      if (___async) {
       label = 7; //@line 932
       break L8;
      }
      _emscripten_free_async_context($AsyncCtx | 0); //@line 935
     }
     $53 = $$023$us30 + 1 | 0; //@line 937
     if (($53 | 0) < ($7 | 0)) {
      $$023$us30 = $53; //@line 940
     } else {
      break;
     }
    }
   }
  } while (0);
  $55 = $$02225$us + 1 | 0; //@line 947
  if (($55 | 0) < ($5 | 0)) {
   $$02225$us = $55; //@line 950
  } else {
   label = 15; //@line 952
   break;
  }
 }
 if ((label | 0) == 7) {
  HEAP32[$AsyncCtx >> 2] = 48; //@line 957
  HEAP32[$AsyncCtx + 4 >> 2] = $$023$us30; //@line 959
  HEAP32[$AsyncCtx + 8 >> 2] = $7; //@line 961
  HEAP32[$AsyncCtx + 12 >> 2] = $2; //@line 963
  HEAP32[$AsyncCtx + 16 >> 2] = $$02225$us; //@line 965
  HEAP32[$AsyncCtx + 20 >> 2] = $5; //@line 967
  HEAP32[$AsyncCtx + 24 >> 2] = $3; //@line 969
  HEAP32[$AsyncCtx + 28 >> 2] = $9; //@line 971
  HEAP32[$AsyncCtx + 32 >> 2] = $10; //@line 973
  HEAP32[$AsyncCtx + 36 >> 2] = $0; //@line 975
  HEAP32[$AsyncCtx + 40 >> 2] = $0; //@line 977
  HEAP32[$AsyncCtx + 44 >> 2] = $11; //@line 979
  sp = STACKTOP; //@line 980
  return;
 } else if ((label | 0) == 10) {
  HEAP32[$AsyncCtx3 >> 2] = 49; //@line 984
  HEAP32[$AsyncCtx3 + 4 >> 2] = $$023$us30; //@line 986
  HEAP32[$AsyncCtx3 + 8 >> 2] = $7; //@line 988
  HEAP32[$AsyncCtx3 + 12 >> 2] = $2; //@line 990
  HEAP32[$AsyncCtx3 + 16 >> 2] = $$02225$us; //@line 992
  HEAP32[$AsyncCtx3 + 20 >> 2] = $5; //@line 994
  HEAP32[$AsyncCtx3 + 24 >> 2] = $3; //@line 996
  HEAP32[$AsyncCtx3 + 28 >> 2] = $9; //@line 998
  HEAP32[$AsyncCtx3 + 32 >> 2] = $10; //@line 1000
  HEAP32[$AsyncCtx3 + 36 >> 2] = $0; //@line 1002
  HEAP32[$AsyncCtx3 + 40 >> 2] = $0; //@line 1004
  HEAP32[$AsyncCtx3 + 44 >> 2] = $11; //@line 1006
  sp = STACKTOP; //@line 1007
  return;
 } else if ((label | 0) == 15) {
  return;
 }
}
function _memchr($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$0$lcssa = 0, $$035$lcssa = 0, $$035$lcssa65 = 0, $$03555 = 0, $$036$lcssa = 0, $$036$lcssa64 = 0, $$03654 = 0, $$046 = 0, $$137$lcssa = 0, $$13745 = 0, $$140 = 0, $$2 = 0, $$23839 = 0, $$3 = 0, $$lcssa = 0, $11 = 0, $12 = 0, $16 = 0, $18 = 0, $20 = 0, $23 = 0, $29 = 0, $3 = 0, $30 = 0, $35 = 0, $7 = 0, $8 = 0, label = 0;
 $3 = $1 & 255; //@line 8826
 $7 = ($2 | 0) != 0; //@line 8830
 L1 : do {
  if ($7 & ($0 & 3 | 0) != 0) {
   $8 = $1 & 255; //@line 8834
   $$03555 = $0; //@line 8835
   $$03654 = $2; //@line 8835
   while (1) {
    if ((HEAP8[$$03555 >> 0] | 0) == $8 << 24 >> 24) {
     $$035$lcssa65 = $$03555; //@line 8840
     $$036$lcssa64 = $$03654; //@line 8840
     label = 6; //@line 8841
     break L1;
    }
    $11 = $$03555 + 1 | 0; //@line 8844
    $12 = $$03654 + -1 | 0; //@line 8845
    $16 = ($12 | 0) != 0; //@line 8849
    if ($16 & ($11 & 3 | 0) != 0) {
     $$03555 = $11; //@line 8852
     $$03654 = $12; //@line 8852
    } else {
     $$035$lcssa = $11; //@line 8854
     $$036$lcssa = $12; //@line 8854
     $$lcssa = $16; //@line 8854
     label = 5; //@line 8855
     break;
    }
   }
  } else {
   $$035$lcssa = $0; //@line 8860
   $$036$lcssa = $2; //@line 8860
   $$lcssa = $7; //@line 8860
   label = 5; //@line 8861
  }
 } while (0);
 if ((label | 0) == 5) {
  if ($$lcssa) {
   $$035$lcssa65 = $$035$lcssa; //@line 8866
   $$036$lcssa64 = $$036$lcssa; //@line 8866
   label = 6; //@line 8867
  } else {
   $$2 = $$035$lcssa; //@line 8869
   $$3 = 0; //@line 8869
  }
 }
 L8 : do {
  if ((label | 0) == 6) {
   $18 = $1 & 255; //@line 8875
   if ((HEAP8[$$035$lcssa65 >> 0] | 0) == $18 << 24 >> 24) {
    $$2 = $$035$lcssa65; //@line 8878
    $$3 = $$036$lcssa64; //@line 8878
   } else {
    $20 = Math_imul($3, 16843009) | 0; //@line 8880
    L11 : do {
     if ($$036$lcssa64 >>> 0 > 3) {
      $$046 = $$035$lcssa65; //@line 8884
      $$13745 = $$036$lcssa64; //@line 8884
      while (1) {
       $23 = HEAP32[$$046 >> 2] ^ $20; //@line 8887
       if (($23 & -2139062144 ^ -2139062144) & $23 + -16843009 | 0) {
        break;
       }
       $29 = $$046 + 4 | 0; //@line 8896
       $30 = $$13745 + -4 | 0; //@line 8897
       if ($30 >>> 0 > 3) {
        $$046 = $29; //@line 8900
        $$13745 = $30; //@line 8900
       } else {
        $$0$lcssa = $29; //@line 8902
        $$137$lcssa = $30; //@line 8902
        label = 11; //@line 8903
        break L11;
       }
      }
      $$140 = $$046; //@line 8907
      $$23839 = $$13745; //@line 8907
     } else {
      $$0$lcssa = $$035$lcssa65; //@line 8909
      $$137$lcssa = $$036$lcssa64; //@line 8909
      label = 11; //@line 8910
     }
    } while (0);
    if ((label | 0) == 11) {
     if (!$$137$lcssa) {
      $$2 = $$0$lcssa; //@line 8916
      $$3 = 0; //@line 8916
      break;
     } else {
      $$140 = $$0$lcssa; //@line 8919
      $$23839 = $$137$lcssa; //@line 8919
     }
    }
    while (1) {
     if ((HEAP8[$$140 >> 0] | 0) == $18 << 24 >> 24) {
      $$2 = $$140; //@line 8926
      $$3 = $$23839; //@line 8926
      break L8;
     }
     $35 = $$140 + 1 | 0; //@line 8929
     $$23839 = $$23839 + -1 | 0; //@line 8930
     if (!$$23839) {
      $$2 = $35; //@line 8933
      $$3 = 0; //@line 8933
      break;
     } else {
      $$140 = $35; //@line 8936
     }
    }
   }
  }
 } while (0);
 return ($$3 | 0 ? $$2 : 0) | 0; //@line 8944
}
function _fflush($0) {
 $0 = $0 | 0;
 var $$0 = 0, $$023 = 0, $$02325 = 0, $$02327 = 0, $$024$lcssa = 0, $$02426 = 0, $$1 = 0, $12 = 0, $13 = 0, $25 = 0, $28 = 0, $34 = 0, $5 = 0, $7 = 0, $AsyncCtx = 0, $AsyncCtx10 = 0, $AsyncCtx3 = 0, $AsyncCtx6 = 0, $phitmp = 0, sp = 0;
 sp = STACKTOP; //@line 8597
 do {
  if (!$0) {
   do {
    if (!(HEAP32[335] | 0)) {
     $34 = 0; //@line 8605
    } else {
     $12 = HEAP32[335] | 0; //@line 8607
     $AsyncCtx10 = _emscripten_alloc_async_context(4, sp) | 0; //@line 8608
     $13 = _fflush($12) | 0; //@line 8609
     if (___async) {
      HEAP32[$AsyncCtx10 >> 2] = 161; //@line 8612
      sp = STACKTOP; //@line 8613
      return 0; //@line 8614
     } else {
      _emscripten_free_async_context($AsyncCtx10 | 0); //@line 8616
      $34 = $13; //@line 8617
      break;
     }
    }
   } while (0);
   $$02325 = HEAP32[(___ofl_lock() | 0) >> 2] | 0; //@line 8623
   L9 : do {
    if (!$$02325) {
     $$024$lcssa = $34; //@line 8627
    } else {
     $$02327 = $$02325; //@line 8629
     $$02426 = $34; //@line 8629
     while (1) {
      if ((HEAP32[$$02327 + 76 >> 2] | 0) > -1) {
       $28 = ___lockfile($$02327) | 0; //@line 8636
      } else {
       $28 = 0; //@line 8638
      }
      if ((HEAP32[$$02327 + 20 >> 2] | 0) >>> 0 > (HEAP32[$$02327 + 28 >> 2] | 0) >>> 0) {
       $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 8646
       $25 = ___fflush_unlocked($$02327) | 0; //@line 8647
       if (___async) {
        break;
       }
       _emscripten_free_async_context($AsyncCtx | 0); //@line 8652
       $$1 = $25 | $$02426; //@line 8654
      } else {
       $$1 = $$02426; //@line 8656
      }
      if ($28 | 0) {
       ___unlockfile($$02327); //@line 8660
      }
      $$023 = HEAP32[$$02327 + 56 >> 2] | 0; //@line 8663
      if (!$$023) {
       $$024$lcssa = $$1; //@line 8666
       break L9;
      } else {
       $$02327 = $$023; //@line 8669
       $$02426 = $$1; //@line 8669
      }
     }
     HEAP32[$AsyncCtx >> 2] = 162; //@line 8672
     HEAP32[$AsyncCtx + 4 >> 2] = $$02426; //@line 8674
     HEAP32[$AsyncCtx + 8 >> 2] = $28; //@line 8676
     HEAP32[$AsyncCtx + 12 >> 2] = $$02327; //@line 8678
     sp = STACKTOP; //@line 8679
     return 0; //@line 8680
    }
   } while (0);
   ___ofl_unlock(); //@line 8683
   $$0 = $$024$lcssa; //@line 8684
  } else {
   if ((HEAP32[$0 + 76 >> 2] | 0) <= -1) {
    $AsyncCtx6 = _emscripten_alloc_async_context(4, sp) | 0; //@line 8690
    $5 = ___fflush_unlocked($0) | 0; //@line 8691
    if (___async) {
     HEAP32[$AsyncCtx6 >> 2] = 159; //@line 8694
     sp = STACKTOP; //@line 8695
     return 0; //@line 8696
    } else {
     _emscripten_free_async_context($AsyncCtx6 | 0); //@line 8698
     $$0 = $5; //@line 8699
     break;
    }
   }
   $phitmp = (___lockfile($0) | 0) == 0; //@line 8704
   $AsyncCtx3 = _emscripten_alloc_async_context(12, sp) | 0; //@line 8705
   $7 = ___fflush_unlocked($0) | 0; //@line 8706
   if (___async) {
    HEAP32[$AsyncCtx3 >> 2] = 160; //@line 8709
    HEAP8[$AsyncCtx3 + 4 >> 0] = $phitmp & 1; //@line 8712
    HEAP32[$AsyncCtx3 + 8 >> 2] = $0; //@line 8714
    sp = STACKTOP; //@line 8715
    return 0; //@line 8716
   }
   _emscripten_free_async_context($AsyncCtx3 | 0); //@line 8718
   if ($phitmp) {
    $$0 = $7; //@line 8720
   } else {
    ___unlockfile($0); //@line 8722
    $$0 = $7; //@line 8723
   }
  }
 } while (0);
 return $$0 | 0; //@line 8727
}
function __ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($0, $1, $2, $3, $4) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 var $$037$off038 = 0, $$037$off039 = 0, $13 = 0, $19 = 0, $22 = 0, $23 = 0, $25 = 0, $28 = 0, $39 = 0, $50 = 0, $53 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 13041
 do {
  if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, $4) | 0) {
   __ZNK10__cxxabiv117__class_type_info29process_static_type_below_dstEPNS_19__dynamic_cast_infoEPKvi(0, $1, $2, $3); //@line 13047
  } else {
   if (!(__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 >> 2] | 0, $4) | 0)) {
    $50 = HEAP32[$0 + 8 >> 2] | 0; //@line 13053
    $53 = HEAP32[(HEAP32[$50 >> 2] | 0) + 24 >> 2] | 0; //@line 13056
    $AsyncCtx3 = _emscripten_alloc_async_context(4, sp) | 0; //@line 13057
    FUNCTION_TABLE_viiiii[$53 & 7]($50, $1, $2, $3, $4); //@line 13058
    if (___async) {
     HEAP32[$AsyncCtx3 >> 2] = 188; //@line 13061
     sp = STACKTOP; //@line 13062
     return;
    } else {
     _emscripten_free_async_context($AsyncCtx3 | 0); //@line 13065
     break;
    }
   }
   if ((HEAP32[$1 + 16 >> 2] | 0) != ($2 | 0)) {
    $13 = $1 + 20 | 0; //@line 13073
    if ((HEAP32[$13 >> 2] | 0) != ($2 | 0)) {
     HEAP32[$1 + 32 >> 2] = $3; //@line 13078
     $19 = $1 + 44 | 0; //@line 13079
     if ((HEAP32[$19 >> 2] | 0) == 4) {
      break;
     }
     $22 = $1 + 52 | 0; //@line 13085
     HEAP8[$22 >> 0] = 0; //@line 13086
     $23 = $1 + 53 | 0; //@line 13087
     HEAP8[$23 >> 0] = 0; //@line 13088
     $25 = HEAP32[$0 + 8 >> 2] | 0; //@line 13090
     $28 = HEAP32[(HEAP32[$25 >> 2] | 0) + 20 >> 2] | 0; //@line 13093
     $AsyncCtx = _emscripten_alloc_async_context(28, sp) | 0; //@line 13094
     FUNCTION_TABLE_viiiiii[$28 & 7]($25, $1, $2, $2, 1, $4); //@line 13095
     if (___async) {
      HEAP32[$AsyncCtx >> 2] = 187; //@line 13098
      HEAP32[$AsyncCtx + 4 >> 2] = $23; //@line 13100
      HEAP32[$AsyncCtx + 8 >> 2] = $2; //@line 13102
      HEAP32[$AsyncCtx + 12 >> 2] = $13; //@line 13104
      HEAP32[$AsyncCtx + 16 >> 2] = $1; //@line 13106
      HEAP32[$AsyncCtx + 20 >> 2] = $22; //@line 13108
      HEAP32[$AsyncCtx + 24 >> 2] = $19; //@line 13110
      sp = STACKTOP; //@line 13111
      return;
     }
     _emscripten_free_async_context($AsyncCtx | 0); //@line 13114
     if (!(HEAP8[$23 >> 0] | 0)) {
      $$037$off038 = 4; //@line 13118
      label = 13; //@line 13119
     } else {
      if (!(HEAP8[$22 >> 0] | 0)) {
       $$037$off038 = 3; //@line 13124
       label = 13; //@line 13125
      } else {
       $$037$off039 = 3; //@line 13127
      }
     }
     if ((label | 0) == 13) {
      HEAP32[$13 >> 2] = $2; //@line 13131
      $39 = $1 + 40 | 0; //@line 13132
      HEAP32[$39 >> 2] = (HEAP32[$39 >> 2] | 0) + 1; //@line 13135
      if ((HEAP32[$1 + 36 >> 2] | 0) == 1) {
       if ((HEAP32[$1 + 24 >> 2] | 0) == 2) {
        HEAP8[$1 + 54 >> 0] = 1; //@line 13145
        $$037$off039 = $$037$off038; //@line 13146
       } else {
        $$037$off039 = $$037$off038; //@line 13148
       }
      } else {
       $$037$off039 = $$037$off038; //@line 13151
      }
     }
     HEAP32[$19 >> 2] = $$037$off039; //@line 13154
     break;
    }
   }
   if (($3 | 0) == 1) {
    HEAP32[$1 + 32 >> 2] = 1; //@line 13161
   }
  }
 } while (0);
 return;
}
function __ZN4mbed6Stream4readEPvj__async_cb_31($0) {
 $0 = $0 | 0;
 var $$016$lcssa = 0, $10 = 0, $12 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $31 = 0, $32 = 0, $33 = 0, $4 = 0, $6 = 0, $8 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx2 = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 3072
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 3074
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 3076
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 3078
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 3080
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 3082
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 3084
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 3086
 if (($AsyncRetVal | 0) == -1) {
  $$016$lcssa = $4; //@line 3089
 } else {
  $20 = $4 + 1 | 0; //@line 3092
  HEAP8[$4 >> 0] = $AsyncRetVal; //@line 3093
  if (($20 | 0) == ($6 | 0)) {
   $$016$lcssa = $6; //@line 3096
  } else {
   $16 = HEAP32[(HEAP32[$12 >> 2] | 0) + 72 >> 2] | 0; //@line 3100
   $ReallocAsyncCtx2 = _emscripten_realloc_async_context(28) | 0; //@line 3101
   $17 = FUNCTION_TABLE_ii[$16 & 31]($10) | 0; //@line 3102
   if (___async) {
    HEAP32[$ReallocAsyncCtx2 >> 2] = 97; //@line 3105
    $18 = $ReallocAsyncCtx2 + 4 | 0; //@line 3106
    HEAP32[$18 >> 2] = $2; //@line 3107
    $19 = $ReallocAsyncCtx2 + 8 | 0; //@line 3108
    HEAP32[$19 >> 2] = $20; //@line 3109
    $21 = $ReallocAsyncCtx2 + 12 | 0; //@line 3110
    HEAP32[$21 >> 2] = $6; //@line 3111
    $22 = $ReallocAsyncCtx2 + 16 | 0; //@line 3112
    HEAP32[$22 >> 2] = $8; //@line 3113
    $23 = $ReallocAsyncCtx2 + 20 | 0; //@line 3114
    HEAP32[$23 >> 2] = $10; //@line 3115
    $24 = $ReallocAsyncCtx2 + 24 | 0; //@line 3116
    HEAP32[$24 >> 2] = $12; //@line 3117
    sp = STACKTOP; //@line 3118
    return;
   }
   HEAP32[___async_retval >> 2] = $17; //@line 3122
   ___async_unwind = 0; //@line 3123
   HEAP32[$ReallocAsyncCtx2 >> 2] = 97; //@line 3124
   $18 = $ReallocAsyncCtx2 + 4 | 0; //@line 3125
   HEAP32[$18 >> 2] = $2; //@line 3126
   $19 = $ReallocAsyncCtx2 + 8 | 0; //@line 3127
   HEAP32[$19 >> 2] = $20; //@line 3128
   $21 = $ReallocAsyncCtx2 + 12 | 0; //@line 3129
   HEAP32[$21 >> 2] = $6; //@line 3130
   $22 = $ReallocAsyncCtx2 + 16 | 0; //@line 3131
   HEAP32[$22 >> 2] = $8; //@line 3132
   $23 = $ReallocAsyncCtx2 + 20 | 0; //@line 3133
   HEAP32[$23 >> 2] = $10; //@line 3134
   $24 = $ReallocAsyncCtx2 + 24 | 0; //@line 3135
   HEAP32[$24 >> 2] = $12; //@line 3136
   sp = STACKTOP; //@line 3137
   return;
  }
 }
 $31 = HEAP32[(HEAP32[$8 >> 2] | 0) + 84 >> 2] | 0; //@line 3143
 $ReallocAsyncCtx3 = _emscripten_realloc_async_context(12) | 0; //@line 3144
 FUNCTION_TABLE_vi[$31 & 255]($10); //@line 3145
 if (___async) {
  HEAP32[$ReallocAsyncCtx3 >> 2] = 98; //@line 3148
  $32 = $ReallocAsyncCtx3 + 4 | 0; //@line 3149
  HEAP32[$32 >> 2] = $$016$lcssa; //@line 3150
  $33 = $ReallocAsyncCtx3 + 8 | 0; //@line 3151
  HEAP32[$33 >> 2] = $2; //@line 3152
  sp = STACKTOP; //@line 3153
  return;
 }
 ___async_unwind = 0; //@line 3156
 HEAP32[$ReallocAsyncCtx3 >> 2] = 98; //@line 3157
 $32 = $ReallocAsyncCtx3 + 4 | 0; //@line 3158
 HEAP32[$32 >> 2] = $$016$lcssa; //@line 3159
 $33 = $ReallocAsyncCtx3 + 8 | 0; //@line 3160
 HEAP32[$33 >> 2] = $2; //@line 3161
 sp = STACKTOP; //@line 3162
 return;
}
function __ZL25default_terminate_handlerv() {
 var $0 = 0, $1 = 0, $12 = 0, $22 = 0, $23 = 0, $25 = 0, $28 = 0, $29 = 0, $3 = 0, $36 = 0, $39 = 0, $40 = 0, $7 = 0, $9 = 0, $AsyncCtx = 0, $AsyncCtx14 = 0, $vararg_buffer = 0, $vararg_buffer10 = 0, $vararg_buffer3 = 0, $vararg_buffer7 = 0, sp = 0;
 sp = STACKTOP; //@line 12353
 STACKTOP = STACKTOP + 48 | 0; //@line 12354
 $vararg_buffer10 = sp + 32 | 0; //@line 12355
 $vararg_buffer7 = sp + 24 | 0; //@line 12356
 $vararg_buffer3 = sp + 16 | 0; //@line 12357
 $vararg_buffer = sp; //@line 12358
 $0 = sp + 36 | 0; //@line 12359
 $1 = ___cxa_get_globals_fast() | 0; //@line 12360
 if ($1 | 0) {
  $3 = HEAP32[$1 >> 2] | 0; //@line 12363
  if ($3 | 0) {
   $7 = $3 + 48 | 0; //@line 12368
   $9 = HEAP32[$7 >> 2] | 0; //@line 12370
   $12 = HEAP32[$7 + 4 >> 2] | 0; //@line 12373
   if (!(($9 & -256 | 0) == 1126902528 & ($12 | 0) == 1129074247)) {
    HEAP32[$vararg_buffer7 >> 2] = 8397; //@line 12379
    _abort_message(8347, $vararg_buffer7); //@line 12380
   }
   if (($9 | 0) == 1126902529 & ($12 | 0) == 1129074247) {
    $22 = HEAP32[$3 + 44 >> 2] | 0; //@line 12389
   } else {
    $22 = $3 + 80 | 0; //@line 12391
   }
   HEAP32[$0 >> 2] = $22; //@line 12393
   $23 = HEAP32[$3 >> 2] | 0; //@line 12394
   $25 = HEAP32[$23 + 4 >> 2] | 0; //@line 12396
   $28 = HEAP32[(HEAP32[52] | 0) + 16 >> 2] | 0; //@line 12399
   $AsyncCtx = _emscripten_alloc_async_context(28, sp) | 0; //@line 12400
   $29 = FUNCTION_TABLE_iiii[$28 & 15](208, $23, $0) | 0; //@line 12401
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 178; //@line 12404
    HEAP32[$AsyncCtx + 4 >> 2] = $0; //@line 12406
    HEAP32[$AsyncCtx + 8 >> 2] = $vararg_buffer3; //@line 12408
    HEAP32[$AsyncCtx + 12 >> 2] = $25; //@line 12410
    HEAP32[$AsyncCtx + 16 >> 2] = $vararg_buffer3; //@line 12412
    HEAP32[$AsyncCtx + 20 >> 2] = $vararg_buffer; //@line 12414
    HEAP32[$AsyncCtx + 24 >> 2] = $vararg_buffer; //@line 12416
    sp = STACKTOP; //@line 12417
    STACKTOP = sp; //@line 12418
    return;
   }
   _emscripten_free_async_context($AsyncCtx | 0); //@line 12420
   if (!$29) {
    HEAP32[$vararg_buffer3 >> 2] = 8397; //@line 12422
    HEAP32[$vararg_buffer3 + 4 >> 2] = $25; //@line 12424
    _abort_message(8306, $vararg_buffer3); //@line 12425
   }
   $36 = HEAP32[$0 >> 2] | 0; //@line 12428
   $39 = HEAP32[(HEAP32[$36 >> 2] | 0) + 8 >> 2] | 0; //@line 12431
   $AsyncCtx14 = _emscripten_alloc_async_context(16, sp) | 0; //@line 12432
   $40 = FUNCTION_TABLE_ii[$39 & 31]($36) | 0; //@line 12433
   if (___async) {
    HEAP32[$AsyncCtx14 >> 2] = 179; //@line 12436
    HEAP32[$AsyncCtx14 + 4 >> 2] = $vararg_buffer; //@line 12438
    HEAP32[$AsyncCtx14 + 8 >> 2] = $25; //@line 12440
    HEAP32[$AsyncCtx14 + 12 >> 2] = $vararg_buffer; //@line 12442
    sp = STACKTOP; //@line 12443
    STACKTOP = sp; //@line 12444
    return;
   } else {
    _emscripten_free_async_context($AsyncCtx14 | 0); //@line 12446
    HEAP32[$vararg_buffer >> 2] = 8397; //@line 12447
    HEAP32[$vararg_buffer + 4 >> 2] = $25; //@line 12449
    HEAP32[$vararg_buffer + 8 >> 2] = $40; //@line 12451
    _abort_message(8261, $vararg_buffer); //@line 12452
   }
  }
 }
 _abort_message(8385, $vararg_buffer10); //@line 12457
}
function __ZN4mbed6Stream5writeEPKvj__async_cb_23($0) {
 $0 = $0 | 0;
 var $$1 = 0, $10 = 0, $12 = 0, $17 = 0, $18 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $32 = 0, $33 = 0, $34 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx2 = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 2477
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 2479
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 2481
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 2483
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 2485
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 2487
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 2489
 if ((HEAP32[___async_retval >> 2] | 0) == -1) {
  $$1 = $2; //@line 2494
 } else {
  if (($2 | 0) == ($4 | 0)) {
   $$1 = $4; //@line 2498
  } else {
   $17 = HEAP32[(HEAP32[$12 >> 2] | 0) + 68 >> 2] | 0; //@line 2502
   $18 = $2 + 1 | 0; //@line 2503
   $20 = HEAP8[$2 >> 0] | 0; //@line 2505
   $ReallocAsyncCtx2 = _emscripten_realloc_async_context(28) | 0; //@line 2506
   $21 = FUNCTION_TABLE_iii[$17 & 7]($8, $20) | 0; //@line 2507
   if (___async) {
    HEAP32[$ReallocAsyncCtx2 >> 2] = 100; //@line 2510
    $22 = $ReallocAsyncCtx2 + 4 | 0; //@line 2511
    HEAP32[$22 >> 2] = $18; //@line 2512
    $23 = $ReallocAsyncCtx2 + 8 | 0; //@line 2513
    HEAP32[$23 >> 2] = $4; //@line 2514
    $24 = $ReallocAsyncCtx2 + 12 | 0; //@line 2515
    HEAP32[$24 >> 2] = $6; //@line 2516
    $25 = $ReallocAsyncCtx2 + 16 | 0; //@line 2517
    HEAP32[$25 >> 2] = $8; //@line 2518
    $26 = $ReallocAsyncCtx2 + 20 | 0; //@line 2519
    HEAP32[$26 >> 2] = $10; //@line 2520
    $27 = $ReallocAsyncCtx2 + 24 | 0; //@line 2521
    HEAP32[$27 >> 2] = $12; //@line 2522
    sp = STACKTOP; //@line 2523
    return;
   }
   HEAP32[___async_retval >> 2] = $21; //@line 2527
   ___async_unwind = 0; //@line 2528
   HEAP32[$ReallocAsyncCtx2 >> 2] = 100; //@line 2529
   $22 = $ReallocAsyncCtx2 + 4 | 0; //@line 2530
   HEAP32[$22 >> 2] = $18; //@line 2531
   $23 = $ReallocAsyncCtx2 + 8 | 0; //@line 2532
   HEAP32[$23 >> 2] = $4; //@line 2533
   $24 = $ReallocAsyncCtx2 + 12 | 0; //@line 2534
   HEAP32[$24 >> 2] = $6; //@line 2535
   $25 = $ReallocAsyncCtx2 + 16 | 0; //@line 2536
   HEAP32[$25 >> 2] = $8; //@line 2537
   $26 = $ReallocAsyncCtx2 + 20 | 0; //@line 2538
   HEAP32[$26 >> 2] = $10; //@line 2539
   $27 = $ReallocAsyncCtx2 + 24 | 0; //@line 2540
   HEAP32[$27 >> 2] = $12; //@line 2541
   sp = STACKTOP; //@line 2542
   return;
  }
 }
 $32 = HEAP32[(HEAP32[$6 >> 2] | 0) + 84 >> 2] | 0; //@line 2548
 $ReallocAsyncCtx3 = _emscripten_realloc_async_context(12) | 0; //@line 2549
 FUNCTION_TABLE_vi[$32 & 255]($8); //@line 2550
 if (___async) {
  HEAP32[$ReallocAsyncCtx3 >> 2] = 101; //@line 2553
  $33 = $ReallocAsyncCtx3 + 4 | 0; //@line 2554
  HEAP32[$33 >> 2] = $$1; //@line 2555
  $34 = $ReallocAsyncCtx3 + 8 | 0; //@line 2556
  HEAP32[$34 >> 2] = $10; //@line 2557
  sp = STACKTOP; //@line 2558
  return;
 }
 ___async_unwind = 0; //@line 2561
 HEAP32[$ReallocAsyncCtx3 >> 2] = 101; //@line 2562
 $33 = $ReallocAsyncCtx3 + 4 | 0; //@line 2563
 HEAP32[$33 >> 2] = $$1; //@line 2564
 $34 = $ReallocAsyncCtx3 + 8 | 0; //@line 2565
 HEAP32[$34 >> 2] = $10; //@line 2566
 sp = STACKTOP; //@line 2567
 return;
}
function _main__async_cb_41($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $19 = 0, $2 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx10 = 0, $ReallocAsyncCtx4 = 0, $bitmSan3$byval_copy = 0, sp = 0;
 sp = STACKTOP; //@line 3742
 STACKTOP = STACKTOP + 16 | 0; //@line 3743
 $bitmSan3$byval_copy = sp; //@line 3744
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 3746
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 3748
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 3750
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 3752
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 3754
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 3756
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 3758
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 3760
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 3762
 $19 = $18 + 9 | 0; //@line 3763
 if (($18 | 0) < 66) {
  $ReallocAsyncCtx10 = _emscripten_realloc_async_context(40) | 0; //@line 3766
  HEAP32[$bitmSan3$byval_copy >> 2] = HEAP32[259]; //@line 3767
  HEAP32[$bitmSan3$byval_copy + 4 >> 2] = HEAP32[260]; //@line 3767
  HEAP32[$bitmSan3$byval_copy + 8 >> 2] = HEAP32[261]; //@line 3767
  HEAP32[$bitmSan3$byval_copy + 12 >> 2] = HEAP32[262]; //@line 3767
  __ZN6C128328print_bmE6Bitmapii(8860, $bitmSan3$byval_copy, $19, 2); //@line 3768
  if (!___async) {
   ___async_unwind = 0; //@line 3771
  }
  HEAP32[$ReallocAsyncCtx10 >> 2] = 144; //@line 3773
  HEAP32[$ReallocAsyncCtx10 + 4 >> 2] = $2; //@line 3775
  HEAP32[$ReallocAsyncCtx10 + 8 >> 2] = $4; //@line 3777
  HEAP32[$ReallocAsyncCtx10 + 12 >> 2] = $6; //@line 3779
  HEAP32[$ReallocAsyncCtx10 + 16 >> 2] = $8; //@line 3781
  HEAP32[$ReallocAsyncCtx10 + 20 >> 2] = $10; //@line 3783
  HEAP32[$ReallocAsyncCtx10 + 24 >> 2] = $12; //@line 3785
  HEAP32[$ReallocAsyncCtx10 + 28 >> 2] = $14; //@line 3787
  HEAP32[$ReallocAsyncCtx10 + 32 >> 2] = $16; //@line 3789
  HEAP32[$ReallocAsyncCtx10 + 36 >> 2] = $19; //@line 3791
  sp = STACKTOP; //@line 3792
  STACKTOP = sp; //@line 3793
  return;
 } else {
  $ReallocAsyncCtx4 = _emscripten_realloc_async_context(36) | 0; //@line 3795
  HEAP32[$bitmSan3$byval_copy >> 2] = HEAP32[267]; //@line 3796
  HEAP32[$bitmSan3$byval_copy + 4 >> 2] = HEAP32[268]; //@line 3796
  HEAP32[$bitmSan3$byval_copy + 8 >> 2] = HEAP32[269]; //@line 3796
  HEAP32[$bitmSan3$byval_copy + 12 >> 2] = HEAP32[270]; //@line 3796
  __ZN6C128328print_bmE6Bitmapii(8860, $bitmSan3$byval_copy, 75, 2); //@line 3797
  if (!___async) {
   ___async_unwind = 0; //@line 3800
  }
  HEAP32[$ReallocAsyncCtx4 >> 2] = 153; //@line 3802
  HEAP32[$ReallocAsyncCtx4 + 4 >> 2] = $2; //@line 3804
  HEAP32[$ReallocAsyncCtx4 + 8 >> 2] = $4; //@line 3806
  HEAP32[$ReallocAsyncCtx4 + 12 >> 2] = $6; //@line 3808
  HEAP32[$ReallocAsyncCtx4 + 16 >> 2] = $8; //@line 3810
  HEAP32[$ReallocAsyncCtx4 + 20 >> 2] = $10; //@line 3812
  HEAP32[$ReallocAsyncCtx4 + 24 >> 2] = $12; //@line 3814
  HEAP32[$ReallocAsyncCtx4 + 28 >> 2] = $14; //@line 3816
  HEAP32[$ReallocAsyncCtx4 + 32 >> 2] = $16; //@line 3818
  sp = STACKTOP; //@line 3819
  STACKTOP = sp; //@line 3820
  return;
 }
}
function ___stdio_write($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$0 = 0, $$04756 = 0, $$04855 = 0, $$04954 = 0, $$051 = 0, $$1 = 0, $$150 = 0, $12 = 0, $13 = 0, $17 = 0, $20 = 0, $25 = 0, $27 = 0, $3 = 0, $37 = 0, $38 = 0, $4 = 0, $44 = 0, $5 = 0, $7 = 0, $9 = 0, $vararg_buffer = 0, $vararg_buffer3 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 7308
 STACKTOP = STACKTOP + 48 | 0; //@line 7309
 $vararg_buffer3 = sp + 16 | 0; //@line 7310
 $vararg_buffer = sp; //@line 7311
 $3 = sp + 32 | 0; //@line 7312
 $4 = $0 + 28 | 0; //@line 7313
 $5 = HEAP32[$4 >> 2] | 0; //@line 7314
 HEAP32[$3 >> 2] = $5; //@line 7315
 $7 = $0 + 20 | 0; //@line 7317
 $9 = (HEAP32[$7 >> 2] | 0) - $5 | 0; //@line 7319
 HEAP32[$3 + 4 >> 2] = $9; //@line 7320
 HEAP32[$3 + 8 >> 2] = $1; //@line 7322
 HEAP32[$3 + 12 >> 2] = $2; //@line 7324
 $12 = $9 + $2 | 0; //@line 7325
 $13 = $0 + 60 | 0; //@line 7326
 HEAP32[$vararg_buffer >> 2] = HEAP32[$13 >> 2]; //@line 7329
 HEAP32[$vararg_buffer + 4 >> 2] = $3; //@line 7331
 HEAP32[$vararg_buffer + 8 >> 2] = 2; //@line 7333
 $17 = ___syscall_ret(___syscall146(146, $vararg_buffer | 0) | 0) | 0; //@line 7335
 L1 : do {
  if (($12 | 0) == ($17 | 0)) {
   label = 3; //@line 7339
  } else {
   $$04756 = 2; //@line 7341
   $$04855 = $12; //@line 7341
   $$04954 = $3; //@line 7341
   $27 = $17; //@line 7341
   while (1) {
    if (($27 | 0) < 0) {
     break;
    }
    $$04855 = $$04855 - $27 | 0; //@line 7347
    $37 = HEAP32[$$04954 + 4 >> 2] | 0; //@line 7349
    $38 = $27 >>> 0 > $37 >>> 0; //@line 7350
    $$150 = $38 ? $$04954 + 8 | 0 : $$04954; //@line 7352
    $$1 = $$04756 + ($38 << 31 >> 31) | 0; //@line 7354
    $$0 = $27 - ($38 ? $37 : 0) | 0; //@line 7356
    HEAP32[$$150 >> 2] = (HEAP32[$$150 >> 2] | 0) + $$0; //@line 7359
    $44 = $$150 + 4 | 0; //@line 7360
    HEAP32[$44 >> 2] = (HEAP32[$44 >> 2] | 0) - $$0; //@line 7363
    HEAP32[$vararg_buffer3 >> 2] = HEAP32[$13 >> 2]; //@line 7366
    HEAP32[$vararg_buffer3 + 4 >> 2] = $$150; //@line 7368
    HEAP32[$vararg_buffer3 + 8 >> 2] = $$1; //@line 7370
    $27 = ___syscall_ret(___syscall146(146, $vararg_buffer3 | 0) | 0) | 0; //@line 7372
    if (($$04855 | 0) == ($27 | 0)) {
     label = 3; //@line 7375
     break L1;
    } else {
     $$04756 = $$1; //@line 7378
     $$04954 = $$150; //@line 7378
    }
   }
   HEAP32[$0 + 16 >> 2] = 0; //@line 7382
   HEAP32[$4 >> 2] = 0; //@line 7383
   HEAP32[$7 >> 2] = 0; //@line 7384
   HEAP32[$0 >> 2] = HEAP32[$0 >> 2] | 32; //@line 7387
   if (($$04756 | 0) == 2) {
    $$051 = 0; //@line 7390
   } else {
    $$051 = $2 - (HEAP32[$$04954 + 4 >> 2] | 0) | 0; //@line 7395
   }
  }
 } while (0);
 if ((label | 0) == 3) {
  $20 = HEAP32[$0 + 44 >> 2] | 0; //@line 7401
  HEAP32[$0 + 16 >> 2] = $20 + (HEAP32[$0 + 48 >> 2] | 0); //@line 7406
  $25 = $20; //@line 7407
  HEAP32[$4 >> 2] = $25; //@line 7408
  HEAP32[$7 >> 2] = $25; //@line 7409
  $$051 = $2; //@line 7410
 }
 STACKTOP = sp; //@line 7412
 return $$051 | 0; //@line 7412
}
function __ZN4mbed6Stream5writeEPKvj__async_cb($0) {
 $0 = $0 | 0;
 var $12 = 0, $13 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $26 = 0, $27 = 0, $28 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx2 = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 2391
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 2393
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 2395
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 2397
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 2399
 if (($4 | 0) == ($6 | 0)) {
  $26 = HEAP32[(HEAP32[$8 >> 2] | 0) + 84 >> 2] | 0; //@line 2404
  $ReallocAsyncCtx3 = _emscripten_realloc_async_context(12) | 0; //@line 2405
  FUNCTION_TABLE_vi[$26 & 255]($2); //@line 2406
  if (___async) {
   HEAP32[$ReallocAsyncCtx3 >> 2] = 101; //@line 2409
   $27 = $ReallocAsyncCtx3 + 4 | 0; //@line 2410
   HEAP32[$27 >> 2] = $6; //@line 2411
   $28 = $ReallocAsyncCtx3 + 8 | 0; //@line 2412
   HEAP32[$28 >> 2] = $4; //@line 2413
   sp = STACKTOP; //@line 2414
   return;
  }
  ___async_unwind = 0; //@line 2417
  HEAP32[$ReallocAsyncCtx3 >> 2] = 101; //@line 2418
  $27 = $ReallocAsyncCtx3 + 4 | 0; //@line 2419
  HEAP32[$27 >> 2] = $6; //@line 2420
  $28 = $ReallocAsyncCtx3 + 8 | 0; //@line 2421
  HEAP32[$28 >> 2] = $4; //@line 2422
  sp = STACKTOP; //@line 2423
  return;
 } else {
  $12 = HEAP32[(HEAP32[$2 >> 2] | 0) + 68 >> 2] | 0; //@line 2428
  $13 = $4 + 1 | 0; //@line 2429
  $15 = HEAP8[$4 >> 0] | 0; //@line 2431
  $ReallocAsyncCtx2 = _emscripten_realloc_async_context(28) | 0; //@line 2432
  $16 = FUNCTION_TABLE_iii[$12 & 7]($2, $15) | 0; //@line 2433
  if (___async) {
   HEAP32[$ReallocAsyncCtx2 >> 2] = 100; //@line 2436
   $17 = $ReallocAsyncCtx2 + 4 | 0; //@line 2437
   HEAP32[$17 >> 2] = $13; //@line 2438
   $18 = $ReallocAsyncCtx2 + 8 | 0; //@line 2439
   HEAP32[$18 >> 2] = $6; //@line 2440
   $19 = $ReallocAsyncCtx2 + 12 | 0; //@line 2441
   HEAP32[$19 >> 2] = $8; //@line 2442
   $20 = $ReallocAsyncCtx2 + 16 | 0; //@line 2443
   HEAP32[$20 >> 2] = $2; //@line 2444
   $21 = $ReallocAsyncCtx2 + 20 | 0; //@line 2445
   HEAP32[$21 >> 2] = $4; //@line 2446
   $22 = $ReallocAsyncCtx2 + 24 | 0; //@line 2447
   HEAP32[$22 >> 2] = $2; //@line 2448
   sp = STACKTOP; //@line 2449
   return;
  }
  HEAP32[___async_retval >> 2] = $16; //@line 2453
  ___async_unwind = 0; //@line 2454
  HEAP32[$ReallocAsyncCtx2 >> 2] = 100; //@line 2455
  $17 = $ReallocAsyncCtx2 + 4 | 0; //@line 2456
  HEAP32[$17 >> 2] = $13; //@line 2457
  $18 = $ReallocAsyncCtx2 + 8 | 0; //@line 2458
  HEAP32[$18 >> 2] = $6; //@line 2459
  $19 = $ReallocAsyncCtx2 + 12 | 0; //@line 2460
  HEAP32[$19 >> 2] = $8; //@line 2461
  $20 = $ReallocAsyncCtx2 + 16 | 0; //@line 2462
  HEAP32[$20 >> 2] = $2; //@line 2463
  $21 = $ReallocAsyncCtx2 + 20 | 0; //@line 2464
  HEAP32[$21 >> 2] = $4; //@line 2465
  $22 = $ReallocAsyncCtx2 + 24 | 0; //@line 2466
  HEAP32[$22 >> 2] = $2; //@line 2467
  sp = STACKTOP; //@line 2468
  return;
 }
}
function _freopen__async_cb($0) {
 $0 = $0 | 0;
 var $$pre = 0, $10 = 0, $14 = 0, $16 = 0, $18 = 0, $2 = 0, $28 = 0, $30 = 0, $31 = 0, $33 = 0, $4 = 0, $6 = 0, $ReallocAsyncCtx2 = 0, $ReallocAsyncCtx3 = 0, $ReallocAsyncCtx4 = 0, sp = 0;
 sp = STACKTOP; //@line 6217
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 6219
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 6221
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 6223
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 6227
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 6231
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 6233
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 6235
 if (!$14) {
  $$pre = $4 + 60 | 0; //@line 6240
  if ($2 & 524288 | 0) {
   HEAP32[$6 >> 2] = HEAP32[$$pre >> 2]; //@line 6243
   HEAP32[$6 + 4 >> 2] = 2; //@line 6245
   HEAP32[$6 + 8 >> 2] = 1; //@line 6247
   ___syscall221(221, $6 | 0) | 0; //@line 6248
  }
  HEAP32[$10 >> 2] = HEAP32[$$pre >> 2]; //@line 6252
  HEAP32[$10 + 4 >> 2] = 4; //@line 6254
  HEAP32[$10 + 8 >> 2] = $2 & -524481; //@line 6256
  if ((___syscall_ret(___syscall221(221, $10 | 0) | 0) | 0) >= 0) {
   if ($18 | 0) {
    ___unlockfile($4); //@line 6263
   }
   HEAP32[___async_retval >> 2] = $4; //@line 6266
   return;
  }
 } else {
  $28 = _fopen($14, $16) | 0; //@line 6270
  if ($28 | 0) {
   $30 = $28 + 60 | 0; //@line 6273
   $31 = HEAP32[$30 >> 2] | 0; //@line 6274
   $33 = HEAP32[$4 + 60 >> 2] | 0; //@line 6276
   if (($31 | 0) == ($33 | 0)) {
    HEAP32[$30 >> 2] = -1; //@line 6279
   } else {
    if ((___dup3($31, $33, $2 & 524288) | 0) < 0) {
     $ReallocAsyncCtx3 = _emscripten_realloc_async_context(8) | 0; //@line 6285
     _fclose($28) | 0; //@line 6286
     if (!___async) {
      ___async_unwind = 0; //@line 6289
     }
     HEAP32[$ReallocAsyncCtx3 >> 2] = 171; //@line 6291
     HEAP32[$ReallocAsyncCtx3 + 4 >> 2] = $4; //@line 6293
     sp = STACKTOP; //@line 6294
     return;
    }
   }
   HEAP32[$4 >> 2] = HEAP32[$4 >> 2] & 1 | HEAP32[$28 >> 2]; //@line 6302
   HEAP32[$4 + 32 >> 2] = HEAP32[$28 + 32 >> 2]; //@line 6306
   HEAP32[$4 + 36 >> 2] = HEAP32[$28 + 36 >> 2]; //@line 6310
   HEAP32[$4 + 40 >> 2] = HEAP32[$28 + 40 >> 2]; //@line 6314
   HEAP32[$4 + 12 >> 2] = HEAP32[$28 + 12 >> 2]; //@line 6318
   $ReallocAsyncCtx4 = _emscripten_realloc_async_context(12) | 0; //@line 6319
   _fclose($28) | 0; //@line 6320
   if (!___async) {
    ___async_unwind = 0; //@line 6323
   }
   HEAP32[$ReallocAsyncCtx4 >> 2] = 170; //@line 6325
   HEAP32[$ReallocAsyncCtx4 + 4 >> 2] = $18; //@line 6327
   HEAP32[$ReallocAsyncCtx4 + 8 >> 2] = $4; //@line 6329
   sp = STACKTOP; //@line 6330
   return;
  }
 }
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(8) | 0; //@line 6334
 _fclose($4) | 0; //@line 6335
 if (!___async) {
  ___async_unwind = 0; //@line 6338
 }
 HEAP32[$ReallocAsyncCtx2 >> 2] = 172; //@line 6340
 HEAP32[$ReallocAsyncCtx2 + 4 >> 2] = $4; //@line 6342
 sp = STACKTOP; //@line 6343
 return;
}
function __ZN4mbed6Stream4readEPvj__async_cb($0) {
 $0 = $0 | 0;
 var $10 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $25 = 0, $26 = 0, $27 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx2 = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 2987
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 2989
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 2993
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 2995
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 2997
 if (!(HEAP32[$0 + 8 >> 2] | 0)) {
  $25 = HEAP32[(HEAP32[$10 >> 2] | 0) + 84 >> 2] | 0; //@line 3002
  $ReallocAsyncCtx3 = _emscripten_realloc_async_context(12) | 0; //@line 3003
  FUNCTION_TABLE_vi[$25 & 255]($2); //@line 3004
  if (___async) {
   HEAP32[$ReallocAsyncCtx3 >> 2] = 98; //@line 3007
   $26 = $ReallocAsyncCtx3 + 4 | 0; //@line 3008
   HEAP32[$26 >> 2] = $6; //@line 3009
   $27 = $ReallocAsyncCtx3 + 8 | 0; //@line 3010
   HEAP32[$27 >> 2] = $6; //@line 3011
   sp = STACKTOP; //@line 3012
   return;
  }
  ___async_unwind = 0; //@line 3015
  HEAP32[$ReallocAsyncCtx3 >> 2] = 98; //@line 3016
  $26 = $ReallocAsyncCtx3 + 4 | 0; //@line 3017
  HEAP32[$26 >> 2] = $6; //@line 3018
  $27 = $ReallocAsyncCtx3 + 8 | 0; //@line 3019
  HEAP32[$27 >> 2] = $6; //@line 3020
  sp = STACKTOP; //@line 3021
  return;
 } else {
  $14 = HEAP32[(HEAP32[$2 >> 2] | 0) + 72 >> 2] | 0; //@line 3026
  $ReallocAsyncCtx2 = _emscripten_realloc_async_context(28) | 0; //@line 3027
  $15 = FUNCTION_TABLE_ii[$14 & 31]($2) | 0; //@line 3028
  if (___async) {
   HEAP32[$ReallocAsyncCtx2 >> 2] = 97; //@line 3031
   $16 = $ReallocAsyncCtx2 + 4 | 0; //@line 3032
   HEAP32[$16 >> 2] = $6; //@line 3033
   $17 = $ReallocAsyncCtx2 + 8 | 0; //@line 3034
   HEAP32[$17 >> 2] = $6; //@line 3035
   $18 = $ReallocAsyncCtx2 + 12 | 0; //@line 3036
   HEAP32[$18 >> 2] = $8; //@line 3037
   $19 = $ReallocAsyncCtx2 + 16 | 0; //@line 3038
   HEAP32[$19 >> 2] = $10; //@line 3039
   $20 = $ReallocAsyncCtx2 + 20 | 0; //@line 3040
   HEAP32[$20 >> 2] = $2; //@line 3041
   $21 = $ReallocAsyncCtx2 + 24 | 0; //@line 3042
   HEAP32[$21 >> 2] = $2; //@line 3043
   sp = STACKTOP; //@line 3044
   return;
  }
  HEAP32[___async_retval >> 2] = $15; //@line 3048
  ___async_unwind = 0; //@line 3049
  HEAP32[$ReallocAsyncCtx2 >> 2] = 97; //@line 3050
  $16 = $ReallocAsyncCtx2 + 4 | 0; //@line 3051
  HEAP32[$16 >> 2] = $6; //@line 3052
  $17 = $ReallocAsyncCtx2 + 8 | 0; //@line 3053
  HEAP32[$17 >> 2] = $6; //@line 3054
  $18 = $ReallocAsyncCtx2 + 12 | 0; //@line 3055
  HEAP32[$18 >> 2] = $8; //@line 3056
  $19 = $ReallocAsyncCtx2 + 16 | 0; //@line 3057
  HEAP32[$19 >> 2] = $10; //@line 3058
  $20 = $ReallocAsyncCtx2 + 20 | 0; //@line 3059
  HEAP32[$20 >> 2] = $2; //@line 3060
  $21 = $ReallocAsyncCtx2 + 24 | 0; //@line 3061
  HEAP32[$21 >> 2] = $2; //@line 3062
  sp = STACKTOP; //@line 3063
  return;
 }
}
function __ZNK10__cxxabiv121__vmi_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb_22($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $20 = 0, $22 = 0, $24 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 2248
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 2252
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 2254
 $8 = HEAP8[$0 + 16 >> 0] | 0; //@line 2256
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 2258
 $12 = HEAP8[$0 + 24 >> 0] | 0; //@line 2260
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 2262
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 2264
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 2266
 $20 = HEAP32[$0 + 40 >> 2] | 0; //@line 2268
 $22 = HEAP8[$0 + 44 >> 0] & 1; //@line 2271
 $24 = HEAP32[$0 + 48 >> 2] | 0; //@line 2273
 do {
  if ((HEAP32[$0 + 4 >> 2] | 0) > 1) {
   $26 = $4 + 24 | 0; //@line 2277
   $27 = $6 + 24 | 0; //@line 2278
   $28 = $4 + 8 | 0; //@line 2279
   $29 = $6 + 54 | 0; //@line 2280
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
    HEAP8[$10 >> 0] = 0; //@line 2310
    HEAP8[$14 >> 0] = 0; //@line 2311
    $ReallocAsyncCtx = _emscripten_realloc_async_context(60) | 0; //@line 2312
    __ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($26, $6, $16, $18, $20, $22); //@line 2313
    if (!___async) {
     ___async_unwind = 0; //@line 2316
    }
    HEAP32[$ReallocAsyncCtx >> 2] = 193; //@line 2318
    HEAP32[$ReallocAsyncCtx + 4 >> 2] = $26; //@line 2320
    HEAP32[$ReallocAsyncCtx + 8 >> 2] = $24; //@line 2322
    HEAP32[$ReallocAsyncCtx + 12 >> 2] = $29; //@line 2324
    HEAP8[$ReallocAsyncCtx + 16 >> 0] = $8; //@line 2326
    HEAP32[$ReallocAsyncCtx + 20 >> 2] = $10; //@line 2328
    HEAP8[$ReallocAsyncCtx + 24 >> 0] = $12; //@line 2330
    HEAP32[$ReallocAsyncCtx + 28 >> 2] = $14; //@line 2332
    HEAP32[$ReallocAsyncCtx + 32 >> 2] = $27; //@line 2334
    HEAP32[$ReallocAsyncCtx + 36 >> 2] = $28; //@line 2336
    HEAP32[$ReallocAsyncCtx + 40 >> 2] = $6; //@line 2338
    HEAP32[$ReallocAsyncCtx + 44 >> 2] = $16; //@line 2340
    HEAP32[$ReallocAsyncCtx + 48 >> 2] = $18; //@line 2342
    HEAP32[$ReallocAsyncCtx + 52 >> 2] = $20; //@line 2344
    HEAP8[$ReallocAsyncCtx + 56 >> 0] = $22 & 1; //@line 2347
    sp = STACKTOP; //@line 2348
    return;
   }
  }
 } while (0);
 HEAP8[$10 >> 0] = $8; //@line 2353
 HEAP8[$14 >> 0] = $12; //@line 2354
 return;
}
function __ZNK10__cxxabiv121__vmi_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $20 = 0, $22 = 0, $24 = 0, $26 = 0, $28 = 0, $4 = 0, $43 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 2132
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 2136
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 2138
 $8 = HEAP8[$0 + 16 >> 0] | 0; //@line 2140
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 2142
 $12 = HEAP8[$0 + 24 >> 0] | 0; //@line 2144
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 2146
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 2148
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 2150
 $20 = HEAP32[$0 + 40 >> 2] | 0; //@line 2152
 $22 = HEAP32[$0 + 44 >> 2] | 0; //@line 2154
 $24 = HEAP32[$0 + 48 >> 2] | 0; //@line 2156
 $26 = HEAP32[$0 + 52 >> 2] | 0; //@line 2158
 $28 = HEAP8[$0 + 56 >> 0] & 1; //@line 2161
 $43 = (HEAP32[$0 + 4 >> 2] | 0) + 8 | 0; //@line 2162
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
    HEAP8[$10 >> 0] = 0; //@line 2195
    HEAP8[$14 >> 0] = 0; //@line 2196
    $ReallocAsyncCtx = _emscripten_realloc_async_context(60) | 0; //@line 2197
    __ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($43, $20, $22, $24, $26, $28); //@line 2198
    if (!___async) {
     ___async_unwind = 0; //@line 2201
    }
    HEAP32[$ReallocAsyncCtx >> 2] = 193; //@line 2203
    HEAP32[$ReallocAsyncCtx + 4 >> 2] = $43; //@line 2205
    HEAP32[$ReallocAsyncCtx + 8 >> 2] = $4; //@line 2207
    HEAP32[$ReallocAsyncCtx + 12 >> 2] = $6; //@line 2209
    HEAP8[$ReallocAsyncCtx + 16 >> 0] = $8; //@line 2211
    HEAP32[$ReallocAsyncCtx + 20 >> 2] = $10; //@line 2213
    HEAP8[$ReallocAsyncCtx + 24 >> 0] = $12; //@line 2215
    HEAP32[$ReallocAsyncCtx + 28 >> 2] = $14; //@line 2217
    HEAP32[$ReallocAsyncCtx + 32 >> 2] = $16; //@line 2219
    HEAP32[$ReallocAsyncCtx + 36 >> 2] = $18; //@line 2221
    HEAP32[$ReallocAsyncCtx + 40 >> 2] = $20; //@line 2223
    HEAP32[$ReallocAsyncCtx + 44 >> 2] = $22; //@line 2225
    HEAP32[$ReallocAsyncCtx + 48 >> 2] = $24; //@line 2227
    HEAP32[$ReallocAsyncCtx + 52 >> 2] = $26; //@line 2229
    HEAP8[$ReallocAsyncCtx + 56 >> 0] = $28 & 1; //@line 2232
    sp = STACKTOP; //@line 2233
    return;
   }
  }
 } while (0);
 HEAP8[$10 >> 0] = $8; //@line 2238
 HEAP8[$14 >> 0] = $12; //@line 2239
 return;
}
function _memcpy(dest, src, num) {
 dest = dest | 0;
 src = src | 0;
 num = num | 0;
 var ret = 0, aligned_dest_end = 0, block_aligned_dest_end = 0, dest_end = 0;
 if ((num | 0) >= 8192) {
  return _emscripten_memcpy_big(dest | 0, src | 0, num | 0) | 0; //@line 6978
 }
 ret = dest | 0; //@line 6981
 dest_end = dest + num | 0; //@line 6982
 if ((dest & 3) == (src & 3)) {
  while (dest & 3) {
   if (!num) return ret | 0; //@line 6986
   HEAP8[dest >> 0] = HEAP8[src >> 0] | 0; //@line 6987
   dest = dest + 1 | 0; //@line 6988
   src = src + 1 | 0; //@line 6989
   num = num - 1 | 0; //@line 6990
  }
  aligned_dest_end = dest_end & -4 | 0; //@line 6992
  block_aligned_dest_end = aligned_dest_end - 64 | 0; //@line 6993
  while ((dest | 0) <= (block_aligned_dest_end | 0)) {
   HEAP32[dest >> 2] = HEAP32[src >> 2]; //@line 6995
   HEAP32[dest + 4 >> 2] = HEAP32[src + 4 >> 2]; //@line 6996
   HEAP32[dest + 8 >> 2] = HEAP32[src + 8 >> 2]; //@line 6997
   HEAP32[dest + 12 >> 2] = HEAP32[src + 12 >> 2]; //@line 6998
   HEAP32[dest + 16 >> 2] = HEAP32[src + 16 >> 2]; //@line 6999
   HEAP32[dest + 20 >> 2] = HEAP32[src + 20 >> 2]; //@line 7000
   HEAP32[dest + 24 >> 2] = HEAP32[src + 24 >> 2]; //@line 7001
   HEAP32[dest + 28 >> 2] = HEAP32[src + 28 >> 2]; //@line 7002
   HEAP32[dest + 32 >> 2] = HEAP32[src + 32 >> 2]; //@line 7003
   HEAP32[dest + 36 >> 2] = HEAP32[src + 36 >> 2]; //@line 7004
   HEAP32[dest + 40 >> 2] = HEAP32[src + 40 >> 2]; //@line 7005
   HEAP32[dest + 44 >> 2] = HEAP32[src + 44 >> 2]; //@line 7006
   HEAP32[dest + 48 >> 2] = HEAP32[src + 48 >> 2]; //@line 7007
   HEAP32[dest + 52 >> 2] = HEAP32[src + 52 >> 2]; //@line 7008
   HEAP32[dest + 56 >> 2] = HEAP32[src + 56 >> 2]; //@line 7009
   HEAP32[dest + 60 >> 2] = HEAP32[src + 60 >> 2]; //@line 7010
   dest = dest + 64 | 0; //@line 7011
   src = src + 64 | 0; //@line 7012
  }
  while ((dest | 0) < (aligned_dest_end | 0)) {
   HEAP32[dest >> 2] = HEAP32[src >> 2]; //@line 7015
   dest = dest + 4 | 0; //@line 7016
   src = src + 4 | 0; //@line 7017
  }
 } else {
  aligned_dest_end = dest_end - 4 | 0; //@line 7021
  while ((dest | 0) < (aligned_dest_end | 0)) {
   HEAP8[dest >> 0] = HEAP8[src >> 0] | 0; //@line 7023
   HEAP8[dest + 1 >> 0] = HEAP8[src + 1 >> 0] | 0; //@line 7024
   HEAP8[dest + 2 >> 0] = HEAP8[src + 2 >> 0] | 0; //@line 7025
   HEAP8[dest + 3 >> 0] = HEAP8[src + 3 >> 0] | 0; //@line 7026
   dest = dest + 4 | 0; //@line 7027
   src = src + 4 | 0; //@line 7028
  }
 }
 while ((dest | 0) < (dest_end | 0)) {
  HEAP8[dest >> 0] = HEAP8[src >> 0] | 0; //@line 7033
  dest = dest + 1 | 0; //@line 7034
  src = src + 1 | 0; //@line 7035
 }
 return ret | 0; //@line 7037
}
function ___fdopen($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0 = 0, $19 = 0, $2 = 0, $24 = 0, $29 = 0, $31 = 0, $8 = 0, $vararg_buffer = 0, $vararg_buffer12 = 0, $vararg_buffer3 = 0, $vararg_buffer7 = 0, sp = 0;
 sp = STACKTOP; //@line 8252
 STACKTOP = STACKTOP + 64 | 0; //@line 8253
 $vararg_buffer12 = sp + 40 | 0; //@line 8254
 $vararg_buffer7 = sp + 24 | 0; //@line 8255
 $vararg_buffer3 = sp + 16 | 0; //@line 8256
 $vararg_buffer = sp; //@line 8257
 $2 = sp + 56 | 0; //@line 8258
 if (!(_strchr(5831, HEAP8[$1 >> 0] | 0) | 0)) {
  HEAP32[(___errno_location() | 0) >> 2] = 22; //@line 8265
  $$0 = 0; //@line 8266
 } else {
  $8 = _malloc(1156) | 0; //@line 8268
  if (!$8) {
   $$0 = 0; //@line 8271
  } else {
   _memset($8 | 0, 0, 124) | 0; //@line 8273
   if (!(_strchr($1, 43) | 0)) {
    HEAP32[$8 >> 2] = (HEAP8[$1 >> 0] | 0) == 114 ? 8 : 4; //@line 8280
   }
   if (_strchr($1, 101) | 0) {
    HEAP32[$vararg_buffer >> 2] = $0; //@line 8285
    HEAP32[$vararg_buffer + 4 >> 2] = 2; //@line 8287
    HEAP32[$vararg_buffer + 8 >> 2] = 1; //@line 8289
    ___syscall221(221, $vararg_buffer | 0) | 0; //@line 8290
   }
   if ((HEAP8[$1 >> 0] | 0) == 97) {
    HEAP32[$vararg_buffer3 >> 2] = $0; //@line 8295
    HEAP32[$vararg_buffer3 + 4 >> 2] = 3; //@line 8297
    $19 = ___syscall221(221, $vararg_buffer3 | 0) | 0; //@line 8298
    if (!($19 & 1024)) {
     HEAP32[$vararg_buffer7 >> 2] = $0; //@line 8303
     HEAP32[$vararg_buffer7 + 4 >> 2] = 4; //@line 8305
     HEAP32[$vararg_buffer7 + 8 >> 2] = $19 | 1024; //@line 8307
     ___syscall221(221, $vararg_buffer7 | 0) | 0; //@line 8308
    }
    $24 = HEAP32[$8 >> 2] | 128; //@line 8311
    HEAP32[$8 >> 2] = $24; //@line 8312
    $31 = $24; //@line 8313
   } else {
    $31 = HEAP32[$8 >> 2] | 0; //@line 8316
   }
   HEAP32[$8 + 60 >> 2] = $0; //@line 8319
   HEAP32[$8 + 44 >> 2] = $8 + 132; //@line 8322
   HEAP32[$8 + 48 >> 2] = 1024; //@line 8324
   $29 = $8 + 75 | 0; //@line 8325
   HEAP8[$29 >> 0] = -1; //@line 8326
   if (!($31 & 8)) {
    HEAP32[$vararg_buffer12 >> 2] = $0; //@line 8331
    HEAP32[$vararg_buffer12 + 4 >> 2] = 21523; //@line 8333
    HEAP32[$vararg_buffer12 + 8 >> 2] = $2; //@line 8335
    if (!(___syscall54(54, $vararg_buffer12 | 0) | 0)) {
     HEAP8[$29 >> 0] = 10; //@line 8339
    }
   }
   HEAP32[$8 + 32 >> 2] = 10; //@line 8343
   HEAP32[$8 + 36 >> 2] = 5; //@line 8345
   HEAP32[$8 + 40 >> 2] = 6; //@line 8347
   HEAP32[$8 + 12 >> 2] = 19; //@line 8349
   if (!(HEAP32[3386] | 0)) {
    HEAP32[$8 + 76 >> 2] = -1; //@line 8354
   }
   ___ofl_add($8) | 0; //@line 8356
   $$0 = $8; //@line 8357
  }
 }
 STACKTOP = sp; //@line 8360
 return $$0 | 0; //@line 8360
}
function __ZN4mbed6Stream4readEPvj($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$016$lcssa = 0, $$01617 = 0, $15 = 0, $16 = 0, $25 = 0, $29 = 0, $3 = 0, $6 = 0, $AsyncCtx = 0, $AsyncCtx2 = 0, $AsyncCtx5 = 0, sp = 0;
 sp = STACKTOP; //@line 2450
 $3 = $1 + $2 | 0; //@line 2451
 $6 = HEAP32[(HEAP32[$0 >> 2] | 0) + 80 >> 2] | 0; //@line 2454
 $AsyncCtx = _emscripten_alloc_async_context(24, sp) | 0; //@line 2455
 FUNCTION_TABLE_vi[$6 & 255]($0); //@line 2456
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 96; //@line 2459
  HEAP32[$AsyncCtx + 4 >> 2] = $0; //@line 2461
  HEAP32[$AsyncCtx + 8 >> 2] = $2; //@line 2463
  HEAP32[$AsyncCtx + 12 >> 2] = $1; //@line 2465
  HEAP32[$AsyncCtx + 16 >> 2] = $3; //@line 2467
  HEAP32[$AsyncCtx + 20 >> 2] = $0; //@line 2469
  sp = STACKTOP; //@line 2470
  return 0; //@line 2471
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 2473
 L4 : do {
  if (!$2) {
   $$016$lcssa = $1; //@line 2477
  } else {
   $$01617 = $1; //@line 2479
   while (1) {
    $15 = HEAP32[(HEAP32[$0 >> 2] | 0) + 72 >> 2] | 0; //@line 2483
    $AsyncCtx2 = _emscripten_alloc_async_context(28, sp) | 0; //@line 2484
    $16 = FUNCTION_TABLE_ii[$15 & 31]($0) | 0; //@line 2485
    if (___async) {
     break;
    }
    _emscripten_free_async_context($AsyncCtx2 | 0); //@line 2490
    if (($16 | 0) == -1) {
     $$016$lcssa = $$01617; //@line 2493
     break L4;
    }
    $25 = $$01617 + 1 | 0; //@line 2497
    HEAP8[$$01617 >> 0] = $16; //@line 2498
    if (($25 | 0) == ($3 | 0)) {
     $$016$lcssa = $3; //@line 2501
     break L4;
    } else {
     $$01617 = $25; //@line 2504
    }
   }
   HEAP32[$AsyncCtx2 >> 2] = 97; //@line 2507
   HEAP32[$AsyncCtx2 + 4 >> 2] = $1; //@line 2509
   HEAP32[$AsyncCtx2 + 8 >> 2] = $$01617; //@line 2511
   HEAP32[$AsyncCtx2 + 12 >> 2] = $3; //@line 2513
   HEAP32[$AsyncCtx2 + 16 >> 2] = $0; //@line 2515
   HEAP32[$AsyncCtx2 + 20 >> 2] = $0; //@line 2517
   HEAP32[$AsyncCtx2 + 24 >> 2] = $0; //@line 2519
   sp = STACKTOP; //@line 2520
   return 0; //@line 2521
  }
 } while (0);
 $29 = HEAP32[(HEAP32[$0 >> 2] | 0) + 84 >> 2] | 0; //@line 2526
 $AsyncCtx5 = _emscripten_alloc_async_context(12, sp) | 0; //@line 2527
 FUNCTION_TABLE_vi[$29 & 255]($0); //@line 2528
 if (___async) {
  HEAP32[$AsyncCtx5 >> 2] = 98; //@line 2531
  HEAP32[$AsyncCtx5 + 4 >> 2] = $$016$lcssa; //@line 2533
  HEAP32[$AsyncCtx5 + 8 >> 2] = $1; //@line 2535
  sp = STACKTOP; //@line 2536
  return 0; //@line 2537
 } else {
  _emscripten_free_async_context($AsyncCtx5 | 0); //@line 2539
  return $$016$lcssa - $1 | 0; //@line 2543
 }
 return 0; //@line 2545
}
function _main__async_cb_48($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $2 = 0, $20 = 0, $22 = 0, $23 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx = 0, $ReallocAsyncCtx12 = 0, sp = 0;
 sp = STACKTOP; //@line 4156
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 4158
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 4160
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 4162
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 4164
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 4166
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 4168
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 4170
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 4172
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 4174
 $20 = HEAP32[$0 + 40 >> 2] | 0; //@line 4176
 __ZN4mbed6Stream6printfEPKcz(8860, 5809, $2) | 0; //@line 4177
 __ZN6C128326locateEii(8860, 5, $6); //@line 4178
 __ZN4mbed6Stream6printfEPKcz(8860, 5815, $8) | 0; //@line 4179
 __ZN6C1283211copy_to_lcdEv(8860); //@line 4180
 $22 = $12 + 2 | 0; //@line 4181
 __ZN6C128326locateEii(8860, 5, $22); //@line 4183
 __ZN4mbed6Stream6printfEPKcz(8860, 5809, $14) | 0; //@line 4184
 $23 = $22 + 12 | 0; //@line 4185
 __ZN6C128326locateEii(8860, 5, $23); //@line 4186
 __ZN4mbed6Stream6printfEPKcz(8860, 5815, $18) | 0; //@line 4187
 __ZN6C1283211copy_to_lcdEv(8860); //@line 4188
 if (($22 | 0) < 5) {
  __ZN6C128326locateEii(8860, 5, $22); //@line 4190
  $ReallocAsyncCtx12 = _emscripten_realloc_async_context(44) | 0; //@line 4191
  _wait(.20000000298023224); //@line 4192
  if (!___async) {
   ___async_unwind = 0; //@line 4195
  }
  HEAP32[$ReallocAsyncCtx12 >> 2] = 154; //@line 4197
  HEAP32[$ReallocAsyncCtx12 + 4 >> 2] = $2; //@line 4199
  HEAP32[$ReallocAsyncCtx12 + 8 >> 2] = $4; //@line 4201
  HEAP32[$ReallocAsyncCtx12 + 12 >> 2] = $23; //@line 4203
  HEAP32[$ReallocAsyncCtx12 + 16 >> 2] = $8; //@line 4205
  HEAP32[$ReallocAsyncCtx12 + 20 >> 2] = $10; //@line 4207
  HEAP32[$ReallocAsyncCtx12 + 24 >> 2] = $22; //@line 4209
  HEAP32[$ReallocAsyncCtx12 + 28 >> 2] = $14; //@line 4211
  HEAP32[$ReallocAsyncCtx12 + 32 >> 2] = $16; //@line 4213
  HEAP32[$ReallocAsyncCtx12 + 36 >> 2] = $18; //@line 4215
  HEAP32[$ReallocAsyncCtx12 + 40 >> 2] = $20; //@line 4217
  sp = STACKTOP; //@line 4218
  return;
 }
 $ReallocAsyncCtx = _emscripten_realloc_async_context(4) | 0; //@line 4221
 _puts(5825) | 0; //@line 4222
 if (___async) {
  HEAP32[$ReallocAsyncCtx >> 2] = 155; //@line 4225
  sp = STACKTOP; //@line 4226
  return;
 }
 ___async_unwind = 0; //@line 4229
 HEAP32[$ReallocAsyncCtx >> 2] = 155; //@line 4230
 sp = STACKTOP; //@line 4231
 return;
}
function __ZN15GraphicsDisplay7blitbitEiiiiPKc__async_cb_1($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $16 = 0, $25 = 0, $28 = 0, $29 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 14230
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 14234
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 14236
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 14238
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 14240
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 14242
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 14244
 $16 = (HEAP32[$0 + 4 >> 2] | 0) + 1 | 0; //@line 14245
 if (($16 | 0) == ($4 | 0)) {
  return;
 }
 $25 = HEAPU16[((128 >>> ($16 & 7) & HEAP8[$6 + ($16 >> 3) >> 0] | 0) == 0 ? $8 : $10) >> 1] | 0; //@line 14260
 $28 = HEAP32[(HEAP32[$12 >> 2] | 0) + 136 >> 2] | 0; //@line 14263
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(32) | 0; //@line 14264
 FUNCTION_TABLE_vii[$28 & 7]($14, $25); //@line 14265
 if (___async) {
  HEAP32[$ReallocAsyncCtx2 >> 2] = 62; //@line 14268
  $29 = $ReallocAsyncCtx2 + 4 | 0; //@line 14269
  HEAP32[$29 >> 2] = $16; //@line 14270
  $30 = $ReallocAsyncCtx2 + 8 | 0; //@line 14271
  HEAP32[$30 >> 2] = $4; //@line 14272
  $31 = $ReallocAsyncCtx2 + 12 | 0; //@line 14273
  HEAP32[$31 >> 2] = $6; //@line 14274
  $32 = $ReallocAsyncCtx2 + 16 | 0; //@line 14275
  HEAP32[$32 >> 2] = $8; //@line 14276
  $33 = $ReallocAsyncCtx2 + 20 | 0; //@line 14277
  HEAP32[$33 >> 2] = $10; //@line 14278
  $34 = $ReallocAsyncCtx2 + 24 | 0; //@line 14279
  HEAP32[$34 >> 2] = $12; //@line 14280
  $35 = $ReallocAsyncCtx2 + 28 | 0; //@line 14281
  HEAP32[$35 >> 2] = $14; //@line 14282
  sp = STACKTOP; //@line 14283
  return;
 }
 ___async_unwind = 0; //@line 14286
 HEAP32[$ReallocAsyncCtx2 >> 2] = 62; //@line 14287
 $29 = $ReallocAsyncCtx2 + 4 | 0; //@line 14288
 HEAP32[$29 >> 2] = $16; //@line 14289
 $30 = $ReallocAsyncCtx2 + 8 | 0; //@line 14290
 HEAP32[$30 >> 2] = $4; //@line 14291
 $31 = $ReallocAsyncCtx2 + 12 | 0; //@line 14292
 HEAP32[$31 >> 2] = $6; //@line 14293
 $32 = $ReallocAsyncCtx2 + 16 | 0; //@line 14294
 HEAP32[$32 >> 2] = $8; //@line 14295
 $33 = $ReallocAsyncCtx2 + 20 | 0; //@line 14296
 HEAP32[$33 >> 2] = $10; //@line 14297
 $34 = $ReallocAsyncCtx2 + 24 | 0; //@line 14298
 HEAP32[$34 >> 2] = $12; //@line 14299
 $35 = $ReallocAsyncCtx2 + 28 | 0; //@line 14300
 HEAP32[$35 >> 2] = $14; //@line 14301
 sp = STACKTOP; //@line 14302
 return;
}
function __ZN4mbed6Stream5writeEPKvj($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$0 = 0, $$1 = 0, $14 = 0, $15 = 0, $17 = 0, $18 = 0, $28 = 0, $3 = 0, $6 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, $AsyncCtx7 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 2554
 $3 = $1 + $2 | 0; //@line 2555
 $6 = HEAP32[(HEAP32[$0 >> 2] | 0) + 80 >> 2] | 0; //@line 2558
 $AsyncCtx = _emscripten_alloc_async_context(20, sp) | 0; //@line 2559
 FUNCTION_TABLE_vi[$6 & 255]($0); //@line 2560
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 99; //@line 2563
  HEAP32[$AsyncCtx + 4 >> 2] = $0; //@line 2565
  HEAP32[$AsyncCtx + 8 >> 2] = $1; //@line 2567
  HEAP32[$AsyncCtx + 12 >> 2] = $3; //@line 2569
  HEAP32[$AsyncCtx + 16 >> 2] = $0; //@line 2571
  sp = STACKTOP; //@line 2572
  return 0; //@line 2573
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 2575
 $$0 = $1; //@line 2576
 while (1) {
  if (($$0 | 0) == ($3 | 0)) {
   $$1 = $3; //@line 2580
   break;
  }
  $14 = HEAP32[(HEAP32[$0 >> 2] | 0) + 68 >> 2] | 0; //@line 2585
  $15 = $$0 + 1 | 0; //@line 2586
  $17 = HEAP8[$$0 >> 0] | 0; //@line 2588
  $AsyncCtx3 = _emscripten_alloc_async_context(28, sp) | 0; //@line 2589
  $18 = FUNCTION_TABLE_iii[$14 & 7]($0, $17) | 0; //@line 2590
  if (___async) {
   label = 6; //@line 2593
   break;
  }
  _emscripten_free_async_context($AsyncCtx3 | 0); //@line 2596
  if (($18 | 0) == -1) {
   $$1 = $15; //@line 2599
   break;
  } else {
   $$0 = $15; //@line 2602
  }
 }
 if ((label | 0) == 6) {
  HEAP32[$AsyncCtx3 >> 2] = 100; //@line 2606
  HEAP32[$AsyncCtx3 + 4 >> 2] = $15; //@line 2608
  HEAP32[$AsyncCtx3 + 8 >> 2] = $3; //@line 2610
  HEAP32[$AsyncCtx3 + 12 >> 2] = $0; //@line 2612
  HEAP32[$AsyncCtx3 + 16 >> 2] = $0; //@line 2614
  HEAP32[$AsyncCtx3 + 20 >> 2] = $1; //@line 2616
  HEAP32[$AsyncCtx3 + 24 >> 2] = $0; //@line 2618
  sp = STACKTOP; //@line 2619
  return 0; //@line 2620
 }
 $28 = HEAP32[(HEAP32[$0 >> 2] | 0) + 84 >> 2] | 0; //@line 2624
 $AsyncCtx7 = _emscripten_alloc_async_context(12, sp) | 0; //@line 2625
 FUNCTION_TABLE_vi[$28 & 255]($0); //@line 2626
 if (___async) {
  HEAP32[$AsyncCtx7 >> 2] = 101; //@line 2629
  HEAP32[$AsyncCtx7 + 4 >> 2] = $$1; //@line 2631
  HEAP32[$AsyncCtx7 + 8 >> 2] = $1; //@line 2633
  sp = STACKTOP; //@line 2634
  return 0; //@line 2635
 } else {
  _emscripten_free_async_context($AsyncCtx7 | 0); //@line 2637
  return $$1 - $1 | 0; //@line 2641
 }
 return 0; //@line 2643
}
function __ZNK10__cxxabiv121__vmi_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $$0 = 0, $10 = 0, $19 = 0, $28 = 0, $9 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 13874
 L1 : do {
  if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, 0) | 0) {
   __ZNK10__cxxabiv117__class_type_info24process_found_base_classEPNS_19__dynamic_cast_infoEPvi(0, $1, $2, $3); //@line 13880
  } else {
   $9 = HEAP32[$0 + 12 >> 2] | 0; //@line 13884
   $10 = $0 + 16 + ($9 << 3) | 0; //@line 13885
   $AsyncCtx3 = _emscripten_alloc_async_context(28, sp) | 0; //@line 13886
   __ZNK10__cxxabiv122__base_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($0 + 16 | 0, $1, $2, $3); //@line 13887
   if (___async) {
    HEAP32[$AsyncCtx3 >> 2] = 199; //@line 13890
    HEAP32[$AsyncCtx3 + 4 >> 2] = $9; //@line 13892
    HEAP32[$AsyncCtx3 + 8 >> 2] = $0; //@line 13894
    HEAP32[$AsyncCtx3 + 12 >> 2] = $1; //@line 13896
    HEAP32[$AsyncCtx3 + 16 >> 2] = $2; //@line 13898
    HEAP32[$AsyncCtx3 + 20 >> 2] = $3; //@line 13900
    HEAP32[$AsyncCtx3 + 24 >> 2] = $10; //@line 13902
    sp = STACKTOP; //@line 13903
    return;
   }
   _emscripten_free_async_context($AsyncCtx3 | 0); //@line 13906
   if (($9 | 0) > 1) {
    $19 = $1 + 54 | 0; //@line 13910
    $$0 = $0 + 24 | 0; //@line 13911
    while (1) {
     $AsyncCtx = _emscripten_alloc_async_context(28, sp) | 0; //@line 13913
     __ZNK10__cxxabiv122__base_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($$0, $1, $2, $3); //@line 13914
     if (___async) {
      break;
     }
     _emscripten_free_async_context($AsyncCtx | 0); //@line 13919
     if (HEAP8[$19 >> 0] | 0) {
      break L1;
     }
     $28 = $$0 + 8 | 0; //@line 13925
     if ($28 >>> 0 < $10 >>> 0) {
      $$0 = $28; //@line 13928
     } else {
      break L1;
     }
    }
    HEAP32[$AsyncCtx >> 2] = 200; //@line 13933
    HEAP32[$AsyncCtx + 4 >> 2] = $19; //@line 13935
    HEAP32[$AsyncCtx + 8 >> 2] = $$0; //@line 13937
    HEAP32[$AsyncCtx + 12 >> 2] = $10; //@line 13939
    HEAP32[$AsyncCtx + 16 >> 2] = $1; //@line 13941
    HEAP32[$AsyncCtx + 20 >> 2] = $2; //@line 13943
    HEAP32[$AsyncCtx + 24 >> 2] = $3; //@line 13945
    sp = STACKTOP; //@line 13946
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
 sp = STACKTOP; //@line 12542
 STACKTOP = STACKTOP + 64 | 0; //@line 12543
 $3 = sp; //@line 12544
 if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, $1, 0) | 0) {
  $$2 = 1; //@line 12547
 } else {
  if (!$1) {
   $$2 = 0; //@line 12551
  } else {
   $AsyncCtx3 = _emscripten_alloc_async_context(16, sp) | 0; //@line 12553
   $6 = ___dynamic_cast($1, 232, 216, 0) | 0; //@line 12554
   if (___async) {
    HEAP32[$AsyncCtx3 >> 2] = 182; //@line 12557
    HEAP32[$AsyncCtx3 + 4 >> 2] = $3; //@line 12559
    HEAP32[$AsyncCtx3 + 8 >> 2] = $0; //@line 12561
    HEAP32[$AsyncCtx3 + 12 >> 2] = $2; //@line 12563
    sp = STACKTOP; //@line 12564
    STACKTOP = sp; //@line 12565
    return 0; //@line 12565
   }
   _emscripten_free_async_context($AsyncCtx3 | 0); //@line 12567
   if (!$6) {
    $$2 = 0; //@line 12570
   } else {
    dest = $3 + 4 | 0; //@line 12573
    stop = dest + 52 | 0; //@line 12573
    do {
     HEAP32[dest >> 2] = 0; //@line 12573
     dest = dest + 4 | 0; //@line 12573
    } while ((dest | 0) < (stop | 0));
    HEAP32[$3 >> 2] = $6; //@line 12574
    HEAP32[$3 + 8 >> 2] = $0; //@line 12576
    HEAP32[$3 + 12 >> 2] = -1; //@line 12578
    HEAP32[$3 + 48 >> 2] = 1; //@line 12580
    $17 = HEAP32[(HEAP32[$6 >> 2] | 0) + 28 >> 2] | 0; //@line 12583
    $18 = HEAP32[$2 >> 2] | 0; //@line 12584
    $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 12585
    FUNCTION_TABLE_viiii[$17 & 7]($6, $3, $18, 1); //@line 12586
    if (___async) {
     HEAP32[$AsyncCtx >> 2] = 183; //@line 12589
     HEAP32[$AsyncCtx + 4 >> 2] = $3; //@line 12591
     HEAP32[$AsyncCtx + 8 >> 2] = $2; //@line 12593
     HEAP32[$AsyncCtx + 12 >> 2] = $3; //@line 12595
     sp = STACKTOP; //@line 12596
     STACKTOP = sp; //@line 12597
     return 0; //@line 12597
    }
    _emscripten_free_async_context($AsyncCtx | 0); //@line 12599
    if ((HEAP32[$3 + 24 >> 2] | 0) == 1) {
     HEAP32[$2 >> 2] = HEAP32[$3 + 16 >> 2]; //@line 12606
     $$0 = 1; //@line 12607
    } else {
     $$0 = 0; //@line 12609
    }
    $$2 = $$0; //@line 12611
   }
  }
 }
 STACKTOP = sp; //@line 12615
 return $$2 | 0; //@line 12615
}
function _vsnprintf($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $$$015 = 0, $$0 = 0, $$014 = 0, $$015 = 0, $11 = 0, $14 = 0, $16 = 0, $17 = 0, $19 = 0, $26 = 0, $4 = 0, $5 = 0, $AsyncCtx = 0, dest = 0, label = 0, sp = 0, src = 0, stop = 0;
 sp = STACKTOP; //@line 11699
 STACKTOP = STACKTOP + 128 | 0; //@line 11700
 $4 = sp + 124 | 0; //@line 11701
 $5 = sp; //@line 11702
 dest = $5; //@line 11703
 src = 1588; //@line 11703
 stop = dest + 124 | 0; //@line 11703
 do {
  HEAP32[dest >> 2] = HEAP32[src >> 2]; //@line 11703
  dest = dest + 4 | 0; //@line 11703
  src = src + 4 | 0; //@line 11703
 } while ((dest | 0) < (stop | 0));
 if (($1 + -1 | 0) >>> 0 > 2147483646) {
  if (!$1) {
   $$014 = $4; //@line 11709
   $$015 = 1; //@line 11709
   label = 4; //@line 11710
  } else {
   HEAP32[(___errno_location() | 0) >> 2] = 75; //@line 11713
   $$0 = -1; //@line 11714
  }
 } else {
  $$014 = $0; //@line 11717
  $$015 = $1; //@line 11717
  label = 4; //@line 11718
 }
 if ((label | 0) == 4) {
  $11 = -2 - $$014 | 0; //@line 11722
  $$$015 = $$015 >>> 0 > $11 >>> 0 ? $11 : $$015; //@line 11724
  HEAP32[$5 + 48 >> 2] = $$$015; //@line 11726
  $14 = $5 + 20 | 0; //@line 11727
  HEAP32[$14 >> 2] = $$014; //@line 11728
  HEAP32[$5 + 44 >> 2] = $$014; //@line 11730
  $16 = $$014 + $$$015 | 0; //@line 11731
  $17 = $5 + 16 | 0; //@line 11732
  HEAP32[$17 >> 2] = $16; //@line 11733
  HEAP32[$5 + 28 >> 2] = $16; //@line 11735
  $AsyncCtx = _emscripten_alloc_async_context(24, sp) | 0; //@line 11736
  $19 = _vfprintf($5, $2, $3) | 0; //@line 11737
  if (___async) {
   HEAP32[$AsyncCtx >> 2] = 166; //@line 11740
   HEAP32[$AsyncCtx + 4 >> 2] = $$$015; //@line 11742
   HEAP32[$AsyncCtx + 8 >> 2] = $5; //@line 11744
   HEAP32[$AsyncCtx + 12 >> 2] = $4; //@line 11746
   HEAP32[$AsyncCtx + 16 >> 2] = $14; //@line 11748
   HEAP32[$AsyncCtx + 20 >> 2] = $17; //@line 11750
   sp = STACKTOP; //@line 11751
   STACKTOP = sp; //@line 11752
   return 0; //@line 11752
  }
  _emscripten_free_async_context($AsyncCtx | 0); //@line 11754
  if (!$$$015) {
   $$0 = $19; //@line 11757
  } else {
   $26 = HEAP32[$14 >> 2] | 0; //@line 11759
   HEAP8[$26 + ((($26 | 0) == (HEAP32[$17 >> 2] | 0)) << 31 >> 31) >> 0] = 0; //@line 11764
   $$0 = $19; //@line 11765
  }
 }
 STACKTOP = sp; //@line 11768
 return $$0 | 0; //@line 11768
}
function __ZN15GraphicsDisplay7blitbitEiiiiPKc__async_cb($0) {
 $0 = $0 | 0;
 var $11 = 0, $12 = 0, $22 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $30 = 0, $31 = 0, $32 = 0, $6 = 0, $8 = 0, $9 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 14154
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 14160
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 14162
 $9 = Math_imul(HEAP32[$0 + 4 >> 2] | 0, HEAP32[$0 + 8 >> 2] | 0) | 0; //@line 14163
 if (($9 | 0) <= 0) {
  return;
 }
 $11 = $6 + 28 | 0; //@line 14168
 $12 = $6 + 30 | 0; //@line 14169
 $22 = HEAPU16[((128 >>> 0 & HEAP8[$8 + 0 >> 0] | 0) == 0 ? $12 : $11) >> 1] | 0; //@line 14180
 $25 = HEAP32[(HEAP32[$6 >> 2] | 0) + 136 >> 2] | 0; //@line 14183
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(32) | 0; //@line 14184
 FUNCTION_TABLE_vii[$25 & 7]($6, $22); //@line 14185
 if (___async) {
  HEAP32[$ReallocAsyncCtx2 >> 2] = 62; //@line 14188
  $26 = $ReallocAsyncCtx2 + 4 | 0; //@line 14189
  HEAP32[$26 >> 2] = 0; //@line 14190
  $27 = $ReallocAsyncCtx2 + 8 | 0; //@line 14191
  HEAP32[$27 >> 2] = $9; //@line 14192
  $28 = $ReallocAsyncCtx2 + 12 | 0; //@line 14193
  HEAP32[$28 >> 2] = $8; //@line 14194
  $29 = $ReallocAsyncCtx2 + 16 | 0; //@line 14195
  HEAP32[$29 >> 2] = $12; //@line 14196
  $30 = $ReallocAsyncCtx2 + 20 | 0; //@line 14197
  HEAP32[$30 >> 2] = $11; //@line 14198
  $31 = $ReallocAsyncCtx2 + 24 | 0; //@line 14199
  HEAP32[$31 >> 2] = $6; //@line 14200
  $32 = $ReallocAsyncCtx2 + 28 | 0; //@line 14201
  HEAP32[$32 >> 2] = $6; //@line 14202
  sp = STACKTOP; //@line 14203
  return;
 }
 ___async_unwind = 0; //@line 14206
 HEAP32[$ReallocAsyncCtx2 >> 2] = 62; //@line 14207
 $26 = $ReallocAsyncCtx2 + 4 | 0; //@line 14208
 HEAP32[$26 >> 2] = 0; //@line 14209
 $27 = $ReallocAsyncCtx2 + 8 | 0; //@line 14210
 HEAP32[$27 >> 2] = $9; //@line 14211
 $28 = $ReallocAsyncCtx2 + 12 | 0; //@line 14212
 HEAP32[$28 >> 2] = $8; //@line 14213
 $29 = $ReallocAsyncCtx2 + 16 | 0; //@line 14214
 HEAP32[$29 >> 2] = $12; //@line 14215
 $30 = $ReallocAsyncCtx2 + 20 | 0; //@line 14216
 HEAP32[$30 >> 2] = $11; //@line 14217
 $31 = $ReallocAsyncCtx2 + 24 | 0; //@line 14218
 HEAP32[$31 >> 2] = $6; //@line 14219
 $32 = $ReallocAsyncCtx2 + 28 | 0; //@line 14220
 HEAP32[$32 >> 2] = $6; //@line 14221
 sp = STACKTOP; //@line 14222
 return;
}
function __ZN6C12832C2E7PinNameS0_S0_S0_S0_PKc__async_cb_57($0) {
 $0 = $0 | 0;
 var $10 = 0, $11 = 0, $12 = 0, $17 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 4743
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 4745
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 4747
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 4749
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 4751
 HEAP32[$2 >> 2] = 328; //@line 4752
 HEAP32[$2 + 4 >> 2] = 488; //@line 4754
 $10 = $2 + 4172 | 0; //@line 4755
 HEAP32[$10 >> 2] = $4; //@line 4756
 $11 = $2 + 4176 | 0; //@line 4757
 HEAP32[$11 >> 2] = $6; //@line 4758
 $12 = $2 + 4180 | 0; //@line 4759
 HEAP32[$12 >> 2] = $8; //@line 4760
 _emscripten_asm_const_iiii(1, $4 | 0, $6 | 0, $8 | 0) | 0; //@line 4761
 HEAP32[$2 + 56 >> 2] = 1; //@line 4763
 HEAP32[$2 + 52 >> 2] = 0; //@line 4765
 HEAP32[$2 + 60 >> 2] = 0; //@line 4767
 $17 = $2 + 68 | 0; //@line 4768
 _memset($17 | 0, 0, 4096) | 0; //@line 4769
 $20 = HEAP32[(HEAP32[$2 >> 2] | 0) + 108 >> 2] | 0; //@line 4772
 $ReallocAsyncCtx = _emscripten_realloc_async_context(24) | 0; //@line 4773
 FUNCTION_TABLE_viii[$20 & 3]($2, 0, 0); //@line 4774
 if (___async) {
  HEAP32[$ReallocAsyncCtx >> 2] = 47; //@line 4777
  $21 = $ReallocAsyncCtx + 4 | 0; //@line 4778
  HEAP32[$21 >> 2] = $2; //@line 4779
  $22 = $ReallocAsyncCtx + 8 | 0; //@line 4780
  HEAP32[$22 >> 2] = $10; //@line 4781
  $23 = $ReallocAsyncCtx + 12 | 0; //@line 4782
  HEAP32[$23 >> 2] = $11; //@line 4783
  $24 = $ReallocAsyncCtx + 16 | 0; //@line 4784
  HEAP32[$24 >> 2] = $12; //@line 4785
  $25 = $ReallocAsyncCtx + 20 | 0; //@line 4786
  HEAP32[$25 >> 2] = $17; //@line 4787
  sp = STACKTOP; //@line 4788
  return;
 }
 ___async_unwind = 0; //@line 4791
 HEAP32[$ReallocAsyncCtx >> 2] = 47; //@line 4792
 $21 = $ReallocAsyncCtx + 4 | 0; //@line 4793
 HEAP32[$21 >> 2] = $2; //@line 4794
 $22 = $ReallocAsyncCtx + 8 | 0; //@line 4795
 HEAP32[$22 >> 2] = $10; //@line 4796
 $23 = $ReallocAsyncCtx + 12 | 0; //@line 4797
 HEAP32[$23 >> 2] = $11; //@line 4798
 $24 = $ReallocAsyncCtx + 16 | 0; //@line 4799
 HEAP32[$24 >> 2] = $12; //@line 4800
 $25 = $ReallocAsyncCtx + 20 | 0; //@line 4801
 HEAP32[$25 >> 2] = $17; //@line 4802
 sp = STACKTOP; //@line 4803
 return;
}
function _fputc($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0 = 0, $13 = 0, $14 = 0, $19 = 0, $20 = 0, $21 = 0, $26 = 0, $27 = 0, $32 = 0, $34 = 0, $7 = 0, $8 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 12125
 if ((HEAP32[$1 + 76 >> 2] | 0) < 0) {
  label = 3; //@line 12130
 } else {
  if (!(___lockfile($1) | 0)) {
   label = 3; //@line 12135
  } else {
   $20 = $0 & 255; //@line 12137
   $21 = $0 & 255; //@line 12138
   if (($21 | 0) == (HEAP8[$1 + 75 >> 0] | 0)) {
    label = 12; //@line 12144
   } else {
    $26 = $1 + 20 | 0; //@line 12146
    $27 = HEAP32[$26 >> 2] | 0; //@line 12147
    if ($27 >>> 0 < (HEAP32[$1 + 16 >> 2] | 0) >>> 0) {
     HEAP32[$26 >> 2] = $27 + 1; //@line 12153
     HEAP8[$27 >> 0] = $20; //@line 12154
     $34 = $21; //@line 12155
    } else {
     label = 12; //@line 12157
    }
   }
   do {
    if ((label | 0) == 12) {
     $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 12162
     $32 = ___overflow($1, $0) | 0; //@line 12163
     if (___async) {
      HEAP32[$AsyncCtx >> 2] = 174; //@line 12166
      HEAP32[$AsyncCtx + 4 >> 2] = $1; //@line 12168
      sp = STACKTOP; //@line 12169
      return 0; //@line 12170
     } else {
      _emscripten_free_async_context($AsyncCtx | 0); //@line 12172
      $34 = $32; //@line 12173
      break;
     }
    }
   } while (0);
   ___unlockfile($1); //@line 12178
   $$0 = $34; //@line 12179
  }
 }
 do {
  if ((label | 0) == 3) {
   $7 = $0 & 255; //@line 12184
   $8 = $0 & 255; //@line 12185
   if (($8 | 0) != (HEAP8[$1 + 75 >> 0] | 0)) {
    $13 = $1 + 20 | 0; //@line 12191
    $14 = HEAP32[$13 >> 2] | 0; //@line 12192
    if ($14 >>> 0 < (HEAP32[$1 + 16 >> 2] | 0) >>> 0) {
     HEAP32[$13 >> 2] = $14 + 1; //@line 12198
     HEAP8[$14 >> 0] = $7; //@line 12199
     $$0 = $8; //@line 12200
     break;
    }
   }
   $AsyncCtx3 = _emscripten_alloc_async_context(4, sp) | 0; //@line 12204
   $19 = ___overflow($1, $0) | 0; //@line 12205
   if (___async) {
    HEAP32[$AsyncCtx3 >> 2] = 173; //@line 12208
    sp = STACKTOP; //@line 12209
    return 0; //@line 12210
   } else {
    _emscripten_free_async_context($AsyncCtx3 | 0); //@line 12212
    $$0 = $19; //@line 12213
    break;
   }
  }
 } while (0);
 return $$0 | 0; //@line 12218
}
function ___mo_lookup($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$090 = 0, $$094 = 0, $$4 = 0, $10 = 0, $13 = 0, $17 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $31 = 0, $35 = 0, $4 = 0, $44 = 0, $46 = 0, $49 = 0, $53 = 0, $63 = 0, $7 = 0;
 $4 = (HEAP32[$0 >> 2] | 0) + 1794895138 | 0; //@line 8030
 $7 = _swapc(HEAP32[$0 + 8 >> 2] | 0, $4) | 0; //@line 8033
 $10 = _swapc(HEAP32[$0 + 12 >> 2] | 0, $4) | 0; //@line 8036
 $13 = _swapc(HEAP32[$0 + 16 >> 2] | 0, $4) | 0; //@line 8039
 L1 : do {
  if ($7 >>> 0 < $1 >>> 2 >>> 0) {
   $17 = $1 - ($7 << 2) | 0; //@line 8045
   if ($10 >>> 0 < $17 >>> 0 & $13 >>> 0 < $17 >>> 0) {
    if (!(($13 | $10) & 3)) {
     $23 = $10 >>> 2; //@line 8054
     $24 = $13 >>> 2; //@line 8055
     $$090 = 0; //@line 8056
     $$094 = $7; //@line 8056
     while (1) {
      $25 = $$094 >>> 1; //@line 8058
      $26 = $$090 + $25 | 0; //@line 8059
      $27 = $26 << 1; //@line 8060
      $28 = $27 + $23 | 0; //@line 8061
      $31 = _swapc(HEAP32[$0 + ($28 << 2) >> 2] | 0, $4) | 0; //@line 8064
      $35 = _swapc(HEAP32[$0 + ($28 + 1 << 2) >> 2] | 0, $4) | 0; //@line 8068
      if (!($35 >>> 0 < $1 >>> 0 & $31 >>> 0 < ($1 - $35 | 0) >>> 0)) {
       $$4 = 0; //@line 8074
       break L1;
      }
      if (HEAP8[$0 + ($35 + $31) >> 0] | 0) {
       $$4 = 0; //@line 8082
       break L1;
      }
      $44 = _strcmp($2, $0 + $35 | 0) | 0; //@line 8086
      if (!$44) {
       break;
      }
      $63 = ($44 | 0) < 0; //@line 8092
      if (($$094 | 0) == 1) {
       $$4 = 0; //@line 8097
       break L1;
      } else {
       $$090 = $63 ? $$090 : $26; //@line 8100
       $$094 = $63 ? $25 : $$094 - $25 | 0; //@line 8100
      }
     }
     $46 = $27 + $24 | 0; //@line 8103
     $49 = _swapc(HEAP32[$0 + ($46 << 2) >> 2] | 0, $4) | 0; //@line 8106
     $53 = _swapc(HEAP32[$0 + ($46 + 1 << 2) >> 2] | 0, $4) | 0; //@line 8110
     if ($53 >>> 0 < $1 >>> 0 & $49 >>> 0 < ($1 - $53 | 0) >>> 0) {
      $$4 = (HEAP8[$0 + ($53 + $49) >> 0] | 0) == 0 ? $0 + $53 | 0 : 0; //@line 8122
     } else {
      $$4 = 0; //@line 8124
     }
    } else {
     $$4 = 0; //@line 8127
    }
   } else {
    $$4 = 0; //@line 8130
   }
  } else {
   $$4 = 0; //@line 8133
  }
 } while (0);
 return $$4 | 0; //@line 8136
}
function ___fflush_unlocked($0) {
 $0 = $0 | 0;
 var $$0 = 0, $1 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $22 = 0, $3 = 0, $7 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 8733
 $1 = $0 + 20 | 0; //@line 8734
 $3 = $0 + 28 | 0; //@line 8736
 do {
  if ((HEAP32[$1 >> 2] | 0) >>> 0 > (HEAP32[$3 >> 2] | 0) >>> 0) {
   $7 = HEAP32[$0 + 36 >> 2] | 0; //@line 8742
   $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 8743
   FUNCTION_TABLE_iiii[$7 & 15]($0, 0, 0) | 0; //@line 8744
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 163; //@line 8747
    HEAP32[$AsyncCtx + 4 >> 2] = $1; //@line 8749
    HEAP32[$AsyncCtx + 8 >> 2] = $0; //@line 8751
    HEAP32[$AsyncCtx + 12 >> 2] = $3; //@line 8753
    sp = STACKTOP; //@line 8754
    return 0; //@line 8755
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 8757
    if (!(HEAP32[$1 >> 2] | 0)) {
     $$0 = -1; //@line 8761
     break;
    } else {
     label = 5; //@line 8764
     break;
    }
   }
  } else {
   label = 5; //@line 8769
  }
 } while (0);
 if ((label | 0) == 5) {
  $13 = $0 + 4 | 0; //@line 8773
  $14 = HEAP32[$13 >> 2] | 0; //@line 8774
  $15 = $0 + 8 | 0; //@line 8775
  $16 = HEAP32[$15 >> 2] | 0; //@line 8776
  do {
   if ($14 >>> 0 < $16 >>> 0) {
    $22 = HEAP32[$0 + 40 >> 2] | 0; //@line 8784
    $AsyncCtx3 = _emscripten_alloc_async_context(24, sp) | 0; //@line 8785
    FUNCTION_TABLE_iiii[$22 & 15]($0, $14 - $16 | 0, 1) | 0; //@line 8786
    if (___async) {
     HEAP32[$AsyncCtx3 >> 2] = 164; //@line 8789
     HEAP32[$AsyncCtx3 + 4 >> 2] = $0; //@line 8791
     HEAP32[$AsyncCtx3 + 8 >> 2] = $3; //@line 8793
     HEAP32[$AsyncCtx3 + 12 >> 2] = $1; //@line 8795
     HEAP32[$AsyncCtx3 + 16 >> 2] = $15; //@line 8797
     HEAP32[$AsyncCtx3 + 20 >> 2] = $13; //@line 8799
     sp = STACKTOP; //@line 8800
     return 0; //@line 8801
    } else {
     _emscripten_free_async_context($AsyncCtx3 | 0); //@line 8803
     break;
    }
   }
  } while (0);
  HEAP32[$0 + 16 >> 2] = 0; //@line 8809
  HEAP32[$3 >> 2] = 0; //@line 8810
  HEAP32[$1 >> 2] = 0; //@line 8811
  HEAP32[$15 >> 2] = 0; //@line 8812
  HEAP32[$13 >> 2] = 0; //@line 8813
  $$0 = 0; //@line 8814
 }
 return $$0 | 0; //@line 8816
}
function __ZN4mbed8FileBaseD0Ev($0) {
 $0 = $0 | 0;
 var $$0$i = 0, $1 = 0, $12 = 0, $17 = 0, $8 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, $AsyncCtx7 = 0, sp = 0;
 sp = STACKTOP; //@line 2106
 HEAP32[$0 >> 2] = 824; //@line 2107
 $1 = HEAP32[2211] | 0; //@line 2108
 do {
  if (!$1) {
   HEAP32[2211] = 8848; //@line 2112
  } else {
   if (($1 | 0) != 8848) {
    $AsyncCtx3 = _emscripten_alloc_async_context(8, sp) | 0; //@line 2116
    _mbed_assert_internal(5235, 5255, 93); //@line 2117
    if (___async) {
     HEAP32[$AsyncCtx3 >> 2] = 84; //@line 2120
     HEAP32[$AsyncCtx3 + 4 >> 2] = $0; //@line 2122
     sp = STACKTOP; //@line 2123
     return;
    } else {
     _emscripten_free_async_context($AsyncCtx3 | 0); //@line 2126
     break;
    }
   }
  }
 } while (0);
 do {
  if (HEAP32[$0 + 8 >> 2] | 0) {
   $8 = HEAP32[2210] | 0; //@line 2137
   if (($8 | 0) == ($0 | 0)) {
    HEAP32[2210] = HEAP32[$0 + 4 >> 2]; //@line 2142
    break;
   } else {
    $$0$i = $8; //@line 2145
   }
   do {
    $12 = $$0$i + 4 | 0; //@line 2148
    $$0$i = HEAP32[$12 >> 2] | 0; //@line 2149
   } while (($$0$i | 0) != ($0 | 0));
   HEAP32[$12 >> 2] = HEAP32[$0 + 4 >> 2]; //@line 2159
  }
 } while (0);
 $17 = HEAP32[2211] | 0; //@line 2162
 do {
  if (!$17) {
   HEAP32[2211] = 8848; //@line 2166
  } else {
   if (($17 | 0) != 8848) {
    $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 2170
    _mbed_assert_internal(5235, 5255, 93); //@line 2171
    if (___async) {
     HEAP32[$AsyncCtx >> 2] = 85; //@line 2174
     HEAP32[$AsyncCtx + 4 >> 2] = $0; //@line 2176
     sp = STACKTOP; //@line 2177
     return;
    } else {
     _emscripten_free_async_context($AsyncCtx | 0); //@line 2180
     break;
    }
   }
  }
 } while (0);
 if (HEAP32[$0 + 12 >> 2] | 0) {
  __ZdlPv($0); //@line 2190
  return;
 }
 $AsyncCtx7 = _emscripten_alloc_async_context(8, sp) | 0; //@line 2194
 __ZN4mbed17remove_filehandleEPNS_10FileHandleE($0 + -4 | 0); //@line 2195
 if (___async) {
  HEAP32[$AsyncCtx7 >> 2] = 86; //@line 2198
  HEAP32[$AsyncCtx7 + 4 >> 2] = $0; //@line 2200
  sp = STACKTOP; //@line 2201
  return;
 }
 _emscripten_free_async_context($AsyncCtx7 | 0); //@line 2204
 __ZdlPv($0); //@line 2205
 return;
}
function _main__async_cb_40($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $2 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx = 0, $ReallocAsyncCtx12 = 0, sp = 0;
 sp = STACKTOP; //@line 3667
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 3669
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 3671
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 3673
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 3675
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 3677
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 3679
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 3681
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 3683
 __ZN6C1283211set_auto_upEj(8860, 0); //@line 3684
 __ZN6C128326locateEii(8860, 5, -20); //@line 3686
 __ZN4mbed6Stream6printfEPKcz(8860, 5809, $2) | 0; //@line 3687
 $18 = -20 + 12 | 0; //@line 3688
 __ZN6C128326locateEii(8860, 5, $18); //@line 3689
 __ZN4mbed6Stream6printfEPKcz(8860, 5815, $6) | 0; //@line 3690
 __ZN6C1283211copy_to_lcdEv(8860); //@line 3691
 if (-20 < 5) {
  __ZN6C128326locateEii(8860, 5, -20); //@line 3693
  $ReallocAsyncCtx12 = _emscripten_realloc_async_context(44) | 0; //@line 3694
  _wait(.20000000298023224); //@line 3695
  if (!___async) {
   ___async_unwind = 0; //@line 3698
  }
  HEAP32[$ReallocAsyncCtx12 >> 2] = 154; //@line 3700
  HEAP32[$ReallocAsyncCtx12 + 4 >> 2] = $10; //@line 3702
  HEAP32[$ReallocAsyncCtx12 + 8 >> 2] = $12; //@line 3704
  HEAP32[$ReallocAsyncCtx12 + 12 >> 2] = $18; //@line 3706
  HEAP32[$ReallocAsyncCtx12 + 16 >> 2] = $14; //@line 3708
  HEAP32[$ReallocAsyncCtx12 + 20 >> 2] = $16; //@line 3710
  HEAP32[$ReallocAsyncCtx12 + 24 >> 2] = -20; //@line 3712
  HEAP32[$ReallocAsyncCtx12 + 28 >> 2] = $2; //@line 3714
  HEAP32[$ReallocAsyncCtx12 + 32 >> 2] = $4; //@line 3716
  HEAP32[$ReallocAsyncCtx12 + 36 >> 2] = $6; //@line 3718
  HEAP32[$ReallocAsyncCtx12 + 40 >> 2] = $8; //@line 3720
  sp = STACKTOP; //@line 3721
  return;
 }
 $ReallocAsyncCtx = _emscripten_realloc_async_context(4) | 0; //@line 3724
 _puts(5825) | 0; //@line 3725
 if (___async) {
  HEAP32[$ReallocAsyncCtx >> 2] = 155; //@line 3728
  sp = STACKTOP; //@line 3729
  return;
 }
 ___async_unwind = 0; //@line 3732
 HEAP32[$ReallocAsyncCtx >> 2] = 155; //@line 3733
 sp = STACKTOP; //@line 3734
 return;
}
function __ZN4mbed6Stream4putcEi($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $15 = 0, $16 = 0, $21 = 0, $4 = 0, $9 = 0, $AsyncCtx = 0, $AsyncCtx2 = 0, $AsyncCtx5 = 0, $AsyncCtx9 = 0, sp = 0;
 sp = STACKTOP; //@line 2794
 $4 = HEAP32[(HEAP32[$0 >> 2] | 0) + 80 >> 2] | 0; //@line 2797
 $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 2798
 FUNCTION_TABLE_vi[$4 & 255]($0); //@line 2799
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 106; //@line 2802
  HEAP32[$AsyncCtx + 4 >> 2] = $0; //@line 2804
  HEAP32[$AsyncCtx + 8 >> 2] = $1; //@line 2806
  HEAP32[$AsyncCtx + 12 >> 2] = $0; //@line 2808
  sp = STACKTOP; //@line 2809
  return 0; //@line 2810
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 2812
 $9 = HEAP32[$0 + 20 >> 2] | 0; //@line 2814
 $AsyncCtx9 = _emscripten_alloc_async_context(16, sp) | 0; //@line 2815
 _fflush($9) | 0; //@line 2816
 if (___async) {
  HEAP32[$AsyncCtx9 >> 2] = 107; //@line 2819
  HEAP32[$AsyncCtx9 + 4 >> 2] = $0; //@line 2821
  HEAP32[$AsyncCtx9 + 8 >> 2] = $1; //@line 2823
  HEAP32[$AsyncCtx9 + 12 >> 2] = $0; //@line 2825
  sp = STACKTOP; //@line 2826
  return 0; //@line 2827
 }
 _emscripten_free_async_context($AsyncCtx9 | 0); //@line 2829
 $15 = HEAP32[(HEAP32[$0 >> 2] | 0) + 68 >> 2] | 0; //@line 2832
 $AsyncCtx2 = _emscripten_alloc_async_context(12, sp) | 0; //@line 2833
 $16 = FUNCTION_TABLE_iii[$15 & 7]($0, $1) | 0; //@line 2834
 if (___async) {
  HEAP32[$AsyncCtx2 >> 2] = 108; //@line 2837
  HEAP32[$AsyncCtx2 + 4 >> 2] = $0; //@line 2839
  HEAP32[$AsyncCtx2 + 8 >> 2] = $0; //@line 2841
  sp = STACKTOP; //@line 2842
  return 0; //@line 2843
 }
 _emscripten_free_async_context($AsyncCtx2 | 0); //@line 2845
 $21 = HEAP32[(HEAP32[$0 >> 2] | 0) + 84 >> 2] | 0; //@line 2848
 $AsyncCtx5 = _emscripten_alloc_async_context(8, sp) | 0; //@line 2849
 FUNCTION_TABLE_vi[$21 & 255]($0); //@line 2850
 if (___async) {
  HEAP32[$AsyncCtx5 >> 2] = 109; //@line 2853
  HEAP32[$AsyncCtx5 + 4 >> 2] = $16; //@line 2855
  sp = STACKTOP; //@line 2856
  return 0; //@line 2857
 } else {
  _emscripten_free_async_context($AsyncCtx5 | 0); //@line 2859
  return $16 | 0; //@line 2860
 }
 return 0; //@line 2862
}
function __ZN15GraphicsDisplay7blitbitEiiiiPKc($0, $1, $2, $3, $4, $5) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 $5 = $5 | 0;
 var $$019 = 0, $13 = 0, $15 = 0, $16 = 0, $26 = 0, $29 = 0, $37 = 0, $8 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 1397
 $8 = HEAP32[(HEAP32[$0 >> 2] | 0) + 132 >> 2] | 0; //@line 1400
 $AsyncCtx = _emscripten_alloc_async_context(20, sp) | 0; //@line 1401
 FUNCTION_TABLE_viiiii[$8 & 7]($0, $1, $2, $3, $4); //@line 1402
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 61; //@line 1405
  HEAP32[$AsyncCtx + 4 >> 2] = $4; //@line 1407
  HEAP32[$AsyncCtx + 8 >> 2] = $3; //@line 1409
  HEAP32[$AsyncCtx + 12 >> 2] = $0; //@line 1411
  HEAP32[$AsyncCtx + 16 >> 2] = $5; //@line 1413
  sp = STACKTOP; //@line 1414
  return;
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 1417
 $13 = Math_imul($4, $3) | 0; //@line 1418
 if (($13 | 0) <= 0) {
  return;
 }
 $15 = $0 + 28 | 0; //@line 1423
 $16 = $0 + 30 | 0; //@line 1424
 $$019 = 0; //@line 1425
 while (1) {
  $26 = HEAPU16[((128 >>> ($$019 & 7) & HEAP8[$5 + ($$019 >> 3) >> 0] | 0) == 0 ? $16 : $15) >> 1] | 0; //@line 1437
  $29 = HEAP32[(HEAP32[$0 >> 2] | 0) + 136 >> 2] | 0; //@line 1440
  $AsyncCtx3 = _emscripten_alloc_async_context(32, sp) | 0; //@line 1441
  FUNCTION_TABLE_vii[$29 & 7]($0, $26); //@line 1442
  if (___async) {
   label = 7; //@line 1445
   break;
  }
  _emscripten_free_async_context($AsyncCtx3 | 0); //@line 1448
  $37 = $$019 + 1 | 0; //@line 1449
  if (($37 | 0) == ($13 | 0)) {
   label = 5; //@line 1452
   break;
  } else {
   $$019 = $37; //@line 1455
  }
 }
 if ((label | 0) == 5) {
  return;
 } else if ((label | 0) == 7) {
  HEAP32[$AsyncCtx3 >> 2] = 62; //@line 1462
  HEAP32[$AsyncCtx3 + 4 >> 2] = $$019; //@line 1464
  HEAP32[$AsyncCtx3 + 8 >> 2] = $13; //@line 1466
  HEAP32[$AsyncCtx3 + 12 >> 2] = $5; //@line 1468
  HEAP32[$AsyncCtx3 + 16 >> 2] = $16; //@line 1470
  HEAP32[$AsyncCtx3 + 20 >> 2] = $15; //@line 1472
  HEAP32[$AsyncCtx3 + 24 >> 2] = $0; //@line 1474
  HEAP32[$AsyncCtx3 + 28 >> 2] = $0; //@line 1476
  sp = STACKTOP; //@line 1477
  return;
 }
}
function _fclose($0) {
 $0 = $0 | 0;
 var $$pre = 0, $10 = 0, $15 = 0, $21 = 0, $25 = 0, $27 = 0, $28 = 0, $33 = 0, $35 = 0, $7 = 0, $8 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 8499
 if ((HEAP32[$0 + 76 >> 2] | 0) > -1) {
  $25 = ___lockfile($0) | 0; //@line 8505
 } else {
  $25 = 0; //@line 8507
 }
 ___unlist_locked_file($0); //@line 8509
 $7 = (HEAP32[$0 >> 2] & 1 | 0) != 0; //@line 8512
 if (!$7) {
  $8 = ___ofl_lock() | 0; //@line 8514
  $10 = HEAP32[$0 + 52 >> 2] | 0; //@line 8516
  $$pre = $0 + 56 | 0; //@line 8519
  if ($10 | 0) {
   HEAP32[$10 + 56 >> 2] = HEAP32[$$pre >> 2]; //@line 8523
  }
  $15 = HEAP32[$$pre >> 2] | 0; //@line 8525
  if ($15 | 0) {
   HEAP32[$15 + 52 >> 2] = $10; //@line 8530
  }
  if ((HEAP32[$8 >> 2] | 0) == ($0 | 0)) {
   HEAP32[$8 >> 2] = $15; //@line 8535
  }
  ___ofl_unlock(); //@line 8537
 }
 $AsyncCtx3 = _emscripten_alloc_async_context(16, sp) | 0; //@line 8539
 $21 = _fflush($0) | 0; //@line 8540
 if (___async) {
  HEAP32[$AsyncCtx3 >> 2] = 157; //@line 8543
  HEAP32[$AsyncCtx3 + 4 >> 2] = $0; //@line 8545
  HEAP8[$AsyncCtx3 + 8 >> 0] = $7 & 1; //@line 8548
  HEAP32[$AsyncCtx3 + 12 >> 2] = $25; //@line 8550
  sp = STACKTOP; //@line 8551
  return 0; //@line 8552
 }
 _emscripten_free_async_context($AsyncCtx3 | 0); //@line 8554
 $27 = HEAP32[$0 + 12 >> 2] | 0; //@line 8556
 $AsyncCtx = _emscripten_alloc_async_context(20, sp) | 0; //@line 8557
 $28 = FUNCTION_TABLE_ii[$27 & 31]($0) | 0; //@line 8558
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 158; //@line 8561
  HEAP32[$AsyncCtx + 4 >> 2] = $21; //@line 8563
  HEAP32[$AsyncCtx + 8 >> 2] = $0; //@line 8565
  HEAP8[$AsyncCtx + 12 >> 0] = $7 & 1; //@line 8568
  HEAP32[$AsyncCtx + 16 >> 2] = $25; //@line 8570
  sp = STACKTOP; //@line 8571
  return 0; //@line 8572
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 8574
 $33 = $28 | $21; //@line 8575
 $35 = HEAP32[$0 + 92 >> 2] | 0; //@line 8577
 if ($35 | 0) {
  _free($35); //@line 8580
 }
 if ($7) {
  if ($25 | 0) {
   ___unlockfile($0); //@line 8585
  }
 } else {
  _free($0); //@line 8588
 }
 return $33 | 0; //@line 8590
}
function __ZN6C12832C2E7PinNameS0_S0_S0_S0_PKc($0, $1, $2, $3, $4, $5, $6) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 $5 = $5 | 0;
 $6 = $6 | 0;
 var $12 = 0, $13 = 0, $14 = 0, $19 = 0, $22 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 745
 $AsyncCtx3 = _emscripten_alloc_async_context(20, sp) | 0; //@line 746
 __ZN15GraphicsDisplayC2EPKc($0, $6); //@line 747
 if (___async) {
  HEAP32[$AsyncCtx3 >> 2] = 46; //@line 750
  HEAP32[$AsyncCtx3 + 4 >> 2] = $0; //@line 752
  HEAP32[$AsyncCtx3 + 8 >> 2] = $1; //@line 754
  HEAP32[$AsyncCtx3 + 12 >> 2] = $3; //@line 756
  HEAP32[$AsyncCtx3 + 16 >> 2] = $2; //@line 758
  sp = STACKTOP; //@line 759
  return;
 }
 _emscripten_free_async_context($AsyncCtx3 | 0); //@line 762
 HEAP32[$0 >> 2] = 328; //@line 763
 HEAP32[$0 + 4 >> 2] = 488; //@line 765
 $12 = $0 + 4172 | 0; //@line 766
 HEAP32[$12 >> 2] = $1; //@line 767
 $13 = $0 + 4176 | 0; //@line 768
 HEAP32[$13 >> 2] = $3; //@line 769
 $14 = $0 + 4180 | 0; //@line 770
 HEAP32[$14 >> 2] = $2; //@line 771
 _emscripten_asm_const_iiii(1, $1 | 0, $3 | 0, $2 | 0) | 0; //@line 772
 HEAP32[$0 + 56 >> 2] = 1; //@line 774
 HEAP32[$0 + 52 >> 2] = 0; //@line 776
 HEAP32[$0 + 60 >> 2] = 0; //@line 778
 $19 = $0 + 68 | 0; //@line 779
 _memset($19 | 0, 0, 4096) | 0; //@line 780
 $22 = HEAP32[(HEAP32[$0 >> 2] | 0) + 108 >> 2] | 0; //@line 783
 $AsyncCtx = _emscripten_alloc_async_context(24, sp) | 0; //@line 784
 FUNCTION_TABLE_viii[$22 & 3]($0, 0, 0); //@line 785
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 47; //@line 788
  HEAP32[$AsyncCtx + 4 >> 2] = $0; //@line 790
  HEAP32[$AsyncCtx + 8 >> 2] = $12; //@line 792
  HEAP32[$AsyncCtx + 12 >> 2] = $13; //@line 794
  HEAP32[$AsyncCtx + 16 >> 2] = $14; //@line 796
  HEAP32[$AsyncCtx + 20 >> 2] = $19; //@line 798
  sp = STACKTOP; //@line 799
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 802
  HEAP32[$0 + 48 >> 2] = 2006; //@line 804
  _emscripten_asm_const_iiiii(0, HEAP32[$12 >> 2] | 0, HEAP32[$13 >> 2] | 0, HEAP32[$14 >> 2] | 0, $19 | 0) | 0; //@line 808
  return;
 }
}
function __ZN4mbed8FileBaseD2Ev($0) {
 $0 = $0 | 0;
 var $$0 = 0, $1 = 0, $12 = 0, $17 = 0, $8 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, $AsyncCtx7 = 0, sp = 0;
 sp = STACKTOP; //@line 2004
 HEAP32[$0 >> 2] = 824; //@line 2005
 $1 = HEAP32[2211] | 0; //@line 2006
 do {
  if (!$1) {
   HEAP32[2211] = 8848; //@line 2010
  } else {
   if (($1 | 0) != 8848) {
    $AsyncCtx3 = _emscripten_alloc_async_context(8, sp) | 0; //@line 2014
    _mbed_assert_internal(5235, 5255, 93); //@line 2015
    if (___async) {
     HEAP32[$AsyncCtx3 >> 2] = 81; //@line 2018
     HEAP32[$AsyncCtx3 + 4 >> 2] = $0; //@line 2020
     sp = STACKTOP; //@line 2021
     return;
    } else {
     _emscripten_free_async_context($AsyncCtx3 | 0); //@line 2024
     break;
    }
   }
  }
 } while (0);
 do {
  if (HEAP32[$0 + 8 >> 2] | 0) {
   $8 = HEAP32[2210] | 0; //@line 2035
   if (($8 | 0) == ($0 | 0)) {
    HEAP32[2210] = HEAP32[$0 + 4 >> 2]; //@line 2040
    break;
   } else {
    $$0 = $8; //@line 2043
   }
   do {
    $12 = $$0 + 4 | 0; //@line 2046
    $$0 = HEAP32[$12 >> 2] | 0; //@line 2047
   } while (($$0 | 0) != ($0 | 0));
   HEAP32[$12 >> 2] = HEAP32[$0 + 4 >> 2]; //@line 2057
  }
 } while (0);
 $17 = HEAP32[2211] | 0; //@line 2060
 do {
  if (!$17) {
   HEAP32[2211] = 8848; //@line 2064
  } else {
   if (($17 | 0) != 8848) {
    $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 2068
    _mbed_assert_internal(5235, 5255, 93); //@line 2069
    if (___async) {
     HEAP32[$AsyncCtx >> 2] = 82; //@line 2072
     HEAP32[$AsyncCtx + 4 >> 2] = $0; //@line 2074
     sp = STACKTOP; //@line 2075
     return;
    } else {
     _emscripten_free_async_context($AsyncCtx | 0); //@line 2078
     break;
    }
   }
  }
 } while (0);
 if (HEAP32[$0 + 12 >> 2] | 0) {
  return;
 }
 $AsyncCtx7 = _emscripten_alloc_async_context(4, sp) | 0; //@line 2091
 __ZN4mbed17remove_filehandleEPNS_10FileHandleE($0 + -4 | 0); //@line 2092
 if (___async) {
  HEAP32[$AsyncCtx7 >> 2] = 83; //@line 2095
  sp = STACKTOP; //@line 2096
  return;
 }
 _emscripten_free_async_context($AsyncCtx7 | 0); //@line 2099
 return;
}
function __ZN6C128325_putcEi($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $11 = 0, $14 = 0, $15 = 0, $28 = 0, $30 = 0, $32 = 0, $4 = 0, $6 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 152
 if (($1 | 0) == 10) {
  HEAP32[$0 + 60 >> 2] = 0; //@line 156
  $4 = $0 + 64 | 0; //@line 157
  $6 = $0 + 48 | 0; //@line 159
  $11 = (HEAP32[$4 >> 2] | 0) + (HEAPU8[(HEAP32[$6 >> 2] | 0) + 2 >> 0] | 0) | 0; //@line 164
  HEAP32[$4 >> 2] = $11; //@line 165
  $14 = HEAP32[(HEAP32[$0 >> 2] | 0) + 128 >> 2] | 0; //@line 168
  $AsyncCtx = _emscripten_alloc_async_context(20, sp) | 0; //@line 169
  $15 = FUNCTION_TABLE_ii[$14 & 31]($0) | 0; //@line 170
  if (___async) {
   HEAP32[$AsyncCtx >> 2] = 36; //@line 173
   HEAP32[$AsyncCtx + 4 >> 2] = $6; //@line 175
   HEAP32[$AsyncCtx + 8 >> 2] = $11; //@line 177
   HEAP32[$AsyncCtx + 12 >> 2] = $1; //@line 179
   HEAP32[$AsyncCtx + 16 >> 2] = $4; //@line 181
   sp = STACKTOP; //@line 182
   return 0; //@line 183
  }
  _emscripten_free_async_context($AsyncCtx | 0); //@line 185
  if ($11 >>> 0 < ($15 - (HEAPU8[(HEAP32[$6 >> 2] | 0) + 2 >> 0] | 0) | 0) >>> 0) {
   return $1 | 0; //@line 193
  }
  HEAP32[$4 >> 2] = 0; //@line 195
  return $1 | 0; //@line 196
 } else {
  $28 = HEAP32[(HEAP32[$0 >> 2] | 0) + 88 >> 2] | 0; //@line 200
  $30 = HEAP32[$0 + 60 >> 2] | 0; //@line 202
  $32 = HEAP32[$0 + 64 >> 2] | 0; //@line 204
  $AsyncCtx3 = _emscripten_alloc_async_context(12, sp) | 0; //@line 205
  FUNCTION_TABLE_viiii[$28 & 7]($0, $30, $32, $1); //@line 206
  if (___async) {
   HEAP32[$AsyncCtx3 >> 2] = 37; //@line 209
   HEAP32[$AsyncCtx3 + 4 >> 2] = $0; //@line 211
   HEAP32[$AsyncCtx3 + 8 >> 2] = $1; //@line 213
   sp = STACKTOP; //@line 214
   return 0; //@line 215
  }
  _emscripten_free_async_context($AsyncCtx3 | 0); //@line 217
  if (!(HEAP32[$0 + 4168 >> 2] | 0)) {
   return $1 | 0; //@line 222
  }
  _emscripten_asm_const_iiiii(0, HEAP32[$0 + 4172 >> 2] | 0, HEAP32[$0 + 4176 >> 2] | 0, HEAP32[$0 + 4180 >> 2] | 0, $0 + 68 | 0) | 0; //@line 231
  return $1 | 0; //@line 232
 }
 return 0; //@line 234
}
function ___strchrnul($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0 = 0, $$029$lcssa = 0, $$02936 = 0, $$030$lcssa = 0, $$03039 = 0, $$1 = 0, $10 = 0, $13 = 0, $17 = 0, $18 = 0, $2 = 0, $24 = 0, $25 = 0, $31 = 0, $38 = 0, $39 = 0, $7 = 0;
 $2 = $1 & 255; //@line 8399
 L1 : do {
  if (!$2) {
   $$0 = $0 + (_strlen($0) | 0) | 0; //@line 8405
  } else {
   if (!($0 & 3)) {
    $$030$lcssa = $0; //@line 8411
   } else {
    $7 = $1 & 255; //@line 8413
    $$03039 = $0; //@line 8414
    while (1) {
     $10 = HEAP8[$$03039 >> 0] | 0; //@line 8416
     if ($10 << 24 >> 24 == 0 ? 1 : $10 << 24 >> 24 == $7 << 24 >> 24) {
      $$0 = $$03039; //@line 8421
      break L1;
     }
     $13 = $$03039 + 1 | 0; //@line 8424
     if (!($13 & 3)) {
      $$030$lcssa = $13; //@line 8429
      break;
     } else {
      $$03039 = $13; //@line 8432
     }
    }
   }
   $17 = Math_imul($2, 16843009) | 0; //@line 8436
   $18 = HEAP32[$$030$lcssa >> 2] | 0; //@line 8437
   L10 : do {
    if (!(($18 & -2139062144 ^ -2139062144) & $18 + -16843009)) {
     $$02936 = $$030$lcssa; //@line 8445
     $25 = $18; //@line 8445
     while (1) {
      $24 = $25 ^ $17; //@line 8447
      if (($24 & -2139062144 ^ -2139062144) & $24 + -16843009 | 0) {
       $$029$lcssa = $$02936; //@line 8454
       break L10;
      }
      $31 = $$02936 + 4 | 0; //@line 8457
      $25 = HEAP32[$31 >> 2] | 0; //@line 8458
      if (($25 & -2139062144 ^ -2139062144) & $25 + -16843009 | 0) {
       $$029$lcssa = $31; //@line 8467
       break;
      } else {
       $$02936 = $31; //@line 8465
      }
     }
    } else {
     $$029$lcssa = $$030$lcssa; //@line 8472
    }
   } while (0);
   $38 = $1 & 255; //@line 8475
   $$1 = $$029$lcssa; //@line 8476
   while (1) {
    $39 = HEAP8[$$1 >> 0] | 0; //@line 8478
    if ($39 << 24 >> 24 == 0 ? 1 : $39 << 24 >> 24 == $38 << 24 >> 24) {
     $$0 = $$1; //@line 8484
     break;
    } else {
     $$1 = $$1 + 1 | 0; //@line 8487
    }
   }
  }
 } while (0);
 return $$0 | 0; //@line 8492
}
function __ZN4mbed8FileBaseD0Ev__async_cb_63($0) {
 $0 = $0 | 0;
 var $$0$i = 0, $10 = 0, $15 = 0, $18 = 0, $2 = 0, $23 = 0, $6 = 0, $ReallocAsyncCtx = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 5185
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 5187
 do {
  if (HEAP32[$2 + 8 >> 2] | 0) {
   $6 = HEAP32[2210] | 0; //@line 5193
   if (($6 | 0) == ($2 | 0)) {
    HEAP32[2210] = HEAP32[$2 + 4 >> 2]; //@line 5198
    break;
   } else {
    $$0$i = $6; //@line 5201
   }
   do {
    $10 = $$0$i + 4 | 0; //@line 5204
    $$0$i = HEAP32[$10 >> 2] | 0; //@line 5205
   } while (($$0$i | 0) != ($2 | 0));
   HEAP32[$10 >> 2] = HEAP32[$2 + 4 >> 2]; //@line 5215
  }
 } while (0);
 $15 = HEAP32[2211] | 0; //@line 5218
 if (!$15) {
  HEAP32[2211] = 8848; //@line 5221
 } else {
  if (($15 | 0) != 8848) {
   $ReallocAsyncCtx = _emscripten_realloc_async_context(8) | 0; //@line 5225
   _mbed_assert_internal(5235, 5255, 93); //@line 5226
   if (___async) {
    HEAP32[$ReallocAsyncCtx >> 2] = 85; //@line 5229
    $18 = $ReallocAsyncCtx + 4 | 0; //@line 5230
    HEAP32[$18 >> 2] = $2; //@line 5231
    sp = STACKTOP; //@line 5232
    return;
   }
   ___async_unwind = 0; //@line 5235
   HEAP32[$ReallocAsyncCtx >> 2] = 85; //@line 5236
   $18 = $ReallocAsyncCtx + 4 | 0; //@line 5237
   HEAP32[$18 >> 2] = $2; //@line 5238
   sp = STACKTOP; //@line 5239
   return;
  }
 }
 if (HEAP32[$2 + 12 >> 2] | 0) {
  __ZdlPv($2); //@line 5247
  return;
 }
 $ReallocAsyncCtx3 = _emscripten_realloc_async_context(8) | 0; //@line 5251
 __ZN4mbed17remove_filehandleEPNS_10FileHandleE($2 + -4 | 0); //@line 5252
 if (___async) {
  HEAP32[$ReallocAsyncCtx3 >> 2] = 86; //@line 5255
  $23 = $ReallocAsyncCtx3 + 4 | 0; //@line 5256
  HEAP32[$23 >> 2] = $2; //@line 5257
  sp = STACKTOP; //@line 5258
  return;
 }
 ___async_unwind = 0; //@line 5261
 HEAP32[$ReallocAsyncCtx3 >> 2] = 86; //@line 5262
 $23 = $ReallocAsyncCtx3 + 4 | 0; //@line 5263
 HEAP32[$23 >> 2] = $2; //@line 5264
 sp = STACKTOP; //@line 5265
 return;
}
function ___fwritex($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$038 = 0, $$1 = 0, $$139 = 0, $$141 = 0, $$143 = 0, $10 = 0, $12 = 0, $14 = 0, $22 = 0, $28 = 0, $3 = 0, $31 = 0, $4 = 0, $9 = 0, label = 0;
 $3 = $2 + 16 | 0; //@line 7921
 $4 = HEAP32[$3 >> 2] | 0; //@line 7922
 if (!$4) {
  if (!(___towrite($2) | 0)) {
   $12 = HEAP32[$3 >> 2] | 0; //@line 7929
   label = 5; //@line 7930
  } else {
   $$1 = 0; //@line 7932
  }
 } else {
  $12 = $4; //@line 7936
  label = 5; //@line 7937
 }
 L5 : do {
  if ((label | 0) == 5) {
   $9 = $2 + 20 | 0; //@line 7941
   $10 = HEAP32[$9 >> 2] | 0; //@line 7942
   $14 = $10; //@line 7945
   if (($12 - $10 | 0) >>> 0 < $1 >>> 0) {
    $$1 = FUNCTION_TABLE_iiii[HEAP32[$2 + 36 >> 2] & 15]($2, $0, $1) | 0; //@line 7950
    break;
   }
   L10 : do {
    if ((HEAP8[$2 + 75 >> 0] | 0) > -1) {
     $$038 = $1; //@line 7958
     while (1) {
      if (!$$038) {
       $$139 = 0; //@line 7962
       $$141 = $0; //@line 7962
       $$143 = $1; //@line 7962
       $31 = $14; //@line 7962
       break L10;
      }
      $22 = $$038 + -1 | 0; //@line 7965
      if ((HEAP8[$0 + $22 >> 0] | 0) == 10) {
       break;
      } else {
       $$038 = $22; //@line 7972
      }
     }
     $28 = FUNCTION_TABLE_iiii[HEAP32[$2 + 36 >> 2] & 15]($2, $0, $$038) | 0; //@line 7977
     if ($28 >>> 0 < $$038 >>> 0) {
      $$1 = $28; //@line 7980
      break L5;
     }
     $$139 = $$038; //@line 7986
     $$141 = $0 + $$038 | 0; //@line 7986
     $$143 = $1 - $$038 | 0; //@line 7986
     $31 = HEAP32[$9 >> 2] | 0; //@line 7986
    } else {
     $$139 = 0; //@line 7988
     $$141 = $0; //@line 7988
     $$143 = $1; //@line 7988
     $31 = $14; //@line 7988
    }
   } while (0);
   _memcpy($31 | 0, $$141 | 0, $$143 | 0) | 0; //@line 7991
   HEAP32[$9 >> 2] = (HEAP32[$9 >> 2] | 0) + $$143; //@line 7994
   $$1 = $$139 + $$143 | 0; //@line 7996
  }
 } while (0);
 return $$1 | 0; //@line 7999
}
function _main__async_cb_50($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $2 = 0, $20 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx7 = 0, $bitmSan2$byval_copy = 0, sp = 0;
 sp = STACKTOP; //@line 4295
 STACKTOP = STACKTOP + 16 | 0; //@line 4296
 $bitmSan2$byval_copy = sp; //@line 4297
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 4299
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 4301
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 4303
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 4305
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 4307
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 4309
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 4311
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 4313
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 4315
 $20 = HEAP32[$0 + 40 >> 2] | 0; //@line 4317
 __ZN6C1283211copy_to_lcdEv(8860); //@line 4318
 $ReallocAsyncCtx7 = _emscripten_realloc_async_context(40) | 0; //@line 4319
 HEAP32[$bitmSan2$byval_copy >> 2] = HEAP32[263]; //@line 4320
 HEAP32[$bitmSan2$byval_copy + 4 >> 2] = HEAP32[264]; //@line 4320
 HEAP32[$bitmSan2$byval_copy + 8 >> 2] = HEAP32[265]; //@line 4320
 HEAP32[$bitmSan2$byval_copy + 12 >> 2] = HEAP32[266]; //@line 4320
 __ZN6C128328print_bmE6Bitmapii(8860, $bitmSan2$byval_copy, $20, 2); //@line 4321
 if (!___async) {
  ___async_unwind = 0; //@line 4324
 }
 HEAP32[$ReallocAsyncCtx7 >> 2] = 149; //@line 4326
 HEAP32[$ReallocAsyncCtx7 + 4 >> 2] = $2; //@line 4328
 HEAP32[$ReallocAsyncCtx7 + 8 >> 2] = $4; //@line 4330
 HEAP32[$ReallocAsyncCtx7 + 12 >> 2] = $6; //@line 4332
 HEAP32[$ReallocAsyncCtx7 + 16 >> 2] = $8; //@line 4334
 HEAP32[$ReallocAsyncCtx7 + 20 >> 2] = $10; //@line 4336
 HEAP32[$ReallocAsyncCtx7 + 24 >> 2] = $12; //@line 4338
 HEAP32[$ReallocAsyncCtx7 + 28 >> 2] = $14; //@line 4340
 HEAP32[$ReallocAsyncCtx7 + 32 >> 2] = $16; //@line 4342
 HEAP32[$ReallocAsyncCtx7 + 36 >> 2] = $18; //@line 4344
 sp = STACKTOP; //@line 4345
 STACKTOP = sp; //@line 4346
 return;
}
function _main__async_cb_49($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $2 = 0, $20 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx5 = 0, $bitmSan3$byval_copy = 0, sp = 0;
 sp = STACKTOP; //@line 4238
 STACKTOP = STACKTOP + 16 | 0; //@line 4239
 $bitmSan3$byval_copy = sp; //@line 4240
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 4242
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 4244
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 4246
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 4248
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 4250
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 4252
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 4254
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 4256
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 4258
 $20 = HEAP32[$0 + 40 >> 2] | 0; //@line 4260
 __ZN6C1283211copy_to_lcdEv(8860); //@line 4261
 $ReallocAsyncCtx5 = _emscripten_realloc_async_context(40) | 0; //@line 4262
 HEAP32[$bitmSan3$byval_copy >> 2] = HEAP32[267]; //@line 4263
 HEAP32[$bitmSan3$byval_copy + 4 >> 2] = HEAP32[268]; //@line 4263
 HEAP32[$bitmSan3$byval_copy + 8 >> 2] = HEAP32[269]; //@line 4263
 HEAP32[$bitmSan3$byval_copy + 12 >> 2] = HEAP32[270]; //@line 4263
 __ZN6C128328print_bmE6Bitmapii(8860, $bitmSan3$byval_copy, $10, 2); //@line 4264
 if (!___async) {
  ___async_unwind = 0; //@line 4267
 }
 HEAP32[$ReallocAsyncCtx5 >> 2] = 152; //@line 4269
 HEAP32[$ReallocAsyncCtx5 + 4 >> 2] = $2; //@line 4271
 HEAP32[$ReallocAsyncCtx5 + 8 >> 2] = $4; //@line 4273
 HEAP32[$ReallocAsyncCtx5 + 12 >> 2] = $6; //@line 4275
 HEAP32[$ReallocAsyncCtx5 + 16 >> 2] = $8; //@line 4277
 HEAP32[$ReallocAsyncCtx5 + 20 >> 2] = $12; //@line 4279
 HEAP32[$ReallocAsyncCtx5 + 24 >> 2] = $14; //@line 4281
 HEAP32[$ReallocAsyncCtx5 + 28 >> 2] = $16; //@line 4283
 HEAP32[$ReallocAsyncCtx5 + 32 >> 2] = $18; //@line 4285
 HEAP32[$ReallocAsyncCtx5 + 36 >> 2] = $20; //@line 4287
 sp = STACKTOP; //@line 4288
 STACKTOP = sp; //@line 4289
 return;
}
function _main__async_cb_45($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $19 = 0, $2 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx8 = 0, $bitmSan2$byval_copy = 0, sp = 0;
 sp = STACKTOP; //@line 3994
 STACKTOP = STACKTOP + 16 | 0; //@line 3995
 $bitmSan2$byval_copy = sp; //@line 3996
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 3998
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 4000
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 4002
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 4004
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 4006
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 4008
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 4010
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 4012
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 4014
 $19 = $18 + 3 | 0; //@line 4015
 $ReallocAsyncCtx8 = _emscripten_realloc_async_context(44) | 0; //@line 4016
 HEAP32[$bitmSan2$byval_copy >> 2] = HEAP32[263]; //@line 4017
 HEAP32[$bitmSan2$byval_copy + 4 >> 2] = HEAP32[264]; //@line 4017
 HEAP32[$bitmSan2$byval_copy + 8 >> 2] = HEAP32[265]; //@line 4017
 HEAP32[$bitmSan2$byval_copy + 12 >> 2] = HEAP32[266]; //@line 4017
 __ZN6C128328print_bmE6Bitmapii(8860, $bitmSan2$byval_copy, $19, 2); //@line 4018
 if (!___async) {
  ___async_unwind = 0; //@line 4021
 }
 HEAP32[$ReallocAsyncCtx8 >> 2] = 147; //@line 4023
 HEAP32[$ReallocAsyncCtx8 + 4 >> 2] = $2; //@line 4025
 HEAP32[$ReallocAsyncCtx8 + 8 >> 2] = $4; //@line 4027
 HEAP32[$ReallocAsyncCtx8 + 12 >> 2] = $6; //@line 4029
 HEAP32[$ReallocAsyncCtx8 + 16 >> 2] = $8; //@line 4031
 HEAP32[$ReallocAsyncCtx8 + 20 >> 2] = $10; //@line 4033
 HEAP32[$ReallocAsyncCtx8 + 24 >> 2] = $12; //@line 4035
 HEAP32[$ReallocAsyncCtx8 + 28 >> 2] = $14; //@line 4037
 HEAP32[$ReallocAsyncCtx8 + 32 >> 2] = $16; //@line 4039
 HEAP32[$ReallocAsyncCtx8 + 36 >> 2] = $18; //@line 4041
 HEAP32[$ReallocAsyncCtx8 + 40 >> 2] = $19; //@line 4043
 sp = STACKTOP; //@line 4044
 STACKTOP = sp; //@line 4045
 return;
}
function _main__async_cb_43($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $19 = 0, $2 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx6 = 0, $bitmSan3$byval_copy = 0, sp = 0;
 sp = STACKTOP; //@line 3882
 STACKTOP = STACKTOP + 16 | 0; //@line 3883
 $bitmSan3$byval_copy = sp; //@line 3884
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 3886
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 3888
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 3890
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 3892
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 3894
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 3896
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 3898
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 3900
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 3902
 $19 = $18 + 6 | 0; //@line 3903
 $ReallocAsyncCtx6 = _emscripten_realloc_async_context(44) | 0; //@line 3904
 HEAP32[$bitmSan3$byval_copy >> 2] = HEAP32[267]; //@line 3905
 HEAP32[$bitmSan3$byval_copy + 4 >> 2] = HEAP32[268]; //@line 3905
 HEAP32[$bitmSan3$byval_copy + 8 >> 2] = HEAP32[269]; //@line 3905
 HEAP32[$bitmSan3$byval_copy + 12 >> 2] = HEAP32[270]; //@line 3905
 __ZN6C128328print_bmE6Bitmapii(8860, $bitmSan3$byval_copy, $19, 2); //@line 3906
 if (!___async) {
  ___async_unwind = 0; //@line 3909
 }
 HEAP32[$ReallocAsyncCtx6 >> 2] = 150; //@line 3911
 HEAP32[$ReallocAsyncCtx6 + 4 >> 2] = $2; //@line 3913
 HEAP32[$ReallocAsyncCtx6 + 8 >> 2] = $4; //@line 3915
 HEAP32[$ReallocAsyncCtx6 + 12 >> 2] = $6; //@line 3917
 HEAP32[$ReallocAsyncCtx6 + 16 >> 2] = $8; //@line 3919
 HEAP32[$ReallocAsyncCtx6 + 20 >> 2] = $19; //@line 3921
 HEAP32[$ReallocAsyncCtx6 + 24 >> 2] = $10; //@line 3923
 HEAP32[$ReallocAsyncCtx6 + 28 >> 2] = $12; //@line 3925
 HEAP32[$ReallocAsyncCtx6 + 32 >> 2] = $14; //@line 3927
 HEAP32[$ReallocAsyncCtx6 + 36 >> 2] = $16; //@line 3929
 HEAP32[$ReallocAsyncCtx6 + 40 >> 2] = $18; //@line 3931
 sp = STACKTOP; //@line 3932
 STACKTOP = sp; //@line 3933
 return;
}
function __ZN15GraphicsDisplay4blitEiiiiPKi($0, $1, $2, $3, $4, $5) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 $5 = $5 | 0;
 var $$011 = 0, $13 = 0, $17 = 0, $19 = 0, $25 = 0, $8 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 1318
 $8 = HEAP32[(HEAP32[$0 >> 2] | 0) + 132 >> 2] | 0; //@line 1321
 $AsyncCtx = _emscripten_alloc_async_context(20, sp) | 0; //@line 1322
 FUNCTION_TABLE_viiiii[$8 & 7]($0, $1, $2, $3, $4); //@line 1323
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 59; //@line 1326
  HEAP32[$AsyncCtx + 4 >> 2] = $4; //@line 1328
  HEAP32[$AsyncCtx + 8 >> 2] = $3; //@line 1330
  HEAP32[$AsyncCtx + 12 >> 2] = $0; //@line 1332
  HEAP32[$AsyncCtx + 16 >> 2] = $5; //@line 1334
  sp = STACKTOP; //@line 1335
  return;
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 1338
 $13 = Math_imul($4, $3) | 0; //@line 1339
 if (($13 | 0) <= 0) {
  return;
 }
 $$011 = 0; //@line 1344
 while (1) {
  $17 = HEAP32[(HEAP32[$0 >> 2] | 0) + 136 >> 2] | 0; //@line 1348
  $19 = HEAP32[$5 + ($$011 << 2) >> 2] | 0; //@line 1350
  $AsyncCtx3 = _emscripten_alloc_async_context(24, sp) | 0; //@line 1351
  FUNCTION_TABLE_vii[$17 & 7]($0, $19); //@line 1352
  if (___async) {
   label = 7; //@line 1355
   break;
  }
  _emscripten_free_async_context($AsyncCtx3 | 0); //@line 1358
  $25 = $$011 + 1 | 0; //@line 1359
  if (($25 | 0) == ($13 | 0)) {
   label = 5; //@line 1362
   break;
  } else {
   $$011 = $25; //@line 1365
  }
 }
 if ((label | 0) == 5) {
  return;
 } else if ((label | 0) == 7) {
  HEAP32[$AsyncCtx3 >> 2] = 60; //@line 1372
  HEAP32[$AsyncCtx3 + 4 >> 2] = $$011; //@line 1374
  HEAP32[$AsyncCtx3 + 8 >> 2] = $13; //@line 1376
  HEAP32[$AsyncCtx3 + 12 >> 2] = $0; //@line 1378
  HEAP32[$AsyncCtx3 + 16 >> 2] = $5; //@line 1380
  HEAP32[$AsyncCtx3 + 20 >> 2] = $0; //@line 1382
  sp = STACKTOP; //@line 1383
  return;
 }
}
function __ZN15GraphicsDisplay4blitEiiiiPKi__async_cb_58($0) {
 $0 = $0 | 0;
 var $10 = 0, $13 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 4852
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 4856
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 4858
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 4860
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 4862
 $15 = (HEAP32[$0 + 4 >> 2] | 0) + 1 | 0; //@line 4863
 if (($15 | 0) == ($4 | 0)) {
  return;
 }
 $13 = HEAP32[(HEAP32[$6 >> 2] | 0) + 136 >> 2] | 0; //@line 4870
 $16 = HEAP32[$8 + ($15 << 2) >> 2] | 0; //@line 4872
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(24) | 0; //@line 4873
 FUNCTION_TABLE_vii[$13 & 7]($10, $16); //@line 4874
 if (___async) {
  HEAP32[$ReallocAsyncCtx2 >> 2] = 60; //@line 4877
  $17 = $ReallocAsyncCtx2 + 4 | 0; //@line 4878
  HEAP32[$17 >> 2] = $15; //@line 4879
  $18 = $ReallocAsyncCtx2 + 8 | 0; //@line 4880
  HEAP32[$18 >> 2] = $4; //@line 4881
  $19 = $ReallocAsyncCtx2 + 12 | 0; //@line 4882
  HEAP32[$19 >> 2] = $6; //@line 4883
  $20 = $ReallocAsyncCtx2 + 16 | 0; //@line 4884
  HEAP32[$20 >> 2] = $8; //@line 4885
  $21 = $ReallocAsyncCtx2 + 20 | 0; //@line 4886
  HEAP32[$21 >> 2] = $10; //@line 4887
  sp = STACKTOP; //@line 4888
  return;
 }
 ___async_unwind = 0; //@line 4891
 HEAP32[$ReallocAsyncCtx2 >> 2] = 60; //@line 4892
 $17 = $ReallocAsyncCtx2 + 4 | 0; //@line 4893
 HEAP32[$17 >> 2] = $15; //@line 4894
 $18 = $ReallocAsyncCtx2 + 8 | 0; //@line 4895
 HEAP32[$18 >> 2] = $4; //@line 4896
 $19 = $ReallocAsyncCtx2 + 12 | 0; //@line 4897
 HEAP32[$19 >> 2] = $6; //@line 4898
 $20 = $ReallocAsyncCtx2 + 16 | 0; //@line 4899
 HEAP32[$20 >> 2] = $8; //@line 4900
 $21 = $ReallocAsyncCtx2 + 20 | 0; //@line 4901
 HEAP32[$21 >> 2] = $10; //@line 4902
 sp = STACKTOP; //@line 4903
 return;
}
function _main__async_cb_47($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $16 = 0, $2 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx10 = 0, $bitmSan1$byval_copy = 0, sp = 0;
 sp = STACKTOP; //@line 4102
 STACKTOP = STACKTOP + 16 | 0; //@line 4103
 $bitmSan1$byval_copy = sp; //@line 4104
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 4106
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 4108
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 4110
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 4112
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 4114
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 4116
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 4118
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 4120
 __ZN6C1283211copy_to_lcdEv(8860); //@line 4121
 __ZN6C128327setmodeEi(8860, 1); //@line 4122
 $ReallocAsyncCtx10 = _emscripten_realloc_async_context(40) | 0; //@line 4123
 HEAP32[$bitmSan1$byval_copy >> 2] = HEAP32[259]; //@line 4124
 HEAP32[$bitmSan1$byval_copy + 4 >> 2] = HEAP32[260]; //@line 4124
 HEAP32[$bitmSan1$byval_copy + 8 >> 2] = HEAP32[261]; //@line 4124
 HEAP32[$bitmSan1$byval_copy + 12 >> 2] = HEAP32[262]; //@line 4124
 __ZN6C128328print_bmE6Bitmapii(8860, $bitmSan1$byval_copy, -15, 2); //@line 4125
 if (!___async) {
  ___async_unwind = 0; //@line 4128
 }
 HEAP32[$ReallocAsyncCtx10 >> 2] = 144; //@line 4130
 HEAP32[$ReallocAsyncCtx10 + 4 >> 2] = $2; //@line 4132
 HEAP32[$ReallocAsyncCtx10 + 8 >> 2] = $4; //@line 4134
 HEAP32[$ReallocAsyncCtx10 + 12 >> 2] = $6; //@line 4136
 HEAP32[$ReallocAsyncCtx10 + 16 >> 2] = $8; //@line 4138
 HEAP32[$ReallocAsyncCtx10 + 20 >> 2] = $10; //@line 4140
 HEAP32[$ReallocAsyncCtx10 + 24 >> 2] = $12; //@line 4142
 HEAP32[$ReallocAsyncCtx10 + 28 >> 2] = $14; //@line 4144
 HEAP32[$ReallocAsyncCtx10 + 32 >> 2] = $16; //@line 4146
 HEAP32[$ReallocAsyncCtx10 + 36 >> 2] = -15; //@line 4148
 sp = STACKTOP; //@line 4149
 STACKTOP = sp; //@line 4150
 return;
}
function _main__async_cb_51($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $2 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx9 = 0, $bitmSan1$byval_copy = 0, sp = 0;
 sp = STACKTOP; //@line 4352
 STACKTOP = STACKTOP + 16 | 0; //@line 4353
 $bitmSan1$byval_copy = sp; //@line 4354
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 4356
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 4358
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 4360
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 4362
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 4364
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 4366
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 4368
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 4370
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 4372
 __ZN6C1283211copy_to_lcdEv(8860); //@line 4373
 $ReallocAsyncCtx9 = _emscripten_realloc_async_context(40) | 0; //@line 4374
 HEAP32[$bitmSan1$byval_copy >> 2] = HEAP32[259]; //@line 4375
 HEAP32[$bitmSan1$byval_copy + 4 >> 2] = HEAP32[260]; //@line 4375
 HEAP32[$bitmSan1$byval_copy + 8 >> 2] = HEAP32[261]; //@line 4375
 HEAP32[$bitmSan1$byval_copy + 12 >> 2] = HEAP32[262]; //@line 4375
 __ZN6C128328print_bmE6Bitmapii(8860, $bitmSan1$byval_copy, $18, 2); //@line 4376
 if (!___async) {
  ___async_unwind = 0; //@line 4379
 }
 HEAP32[$ReallocAsyncCtx9 >> 2] = 146; //@line 4381
 HEAP32[$ReallocAsyncCtx9 + 4 >> 2] = $2; //@line 4383
 HEAP32[$ReallocAsyncCtx9 + 8 >> 2] = $4; //@line 4385
 HEAP32[$ReallocAsyncCtx9 + 12 >> 2] = $6; //@line 4387
 HEAP32[$ReallocAsyncCtx9 + 16 >> 2] = $8; //@line 4389
 HEAP32[$ReallocAsyncCtx9 + 20 >> 2] = $10; //@line 4391
 HEAP32[$ReallocAsyncCtx9 + 24 >> 2] = $12; //@line 4393
 HEAP32[$ReallocAsyncCtx9 + 28 >> 2] = $14; //@line 4395
 HEAP32[$ReallocAsyncCtx9 + 32 >> 2] = $16; //@line 4397
 HEAP32[$ReallocAsyncCtx9 + 36 >> 2] = $18; //@line 4399
 sp = STACKTOP; //@line 4400
 STACKTOP = sp; //@line 4401
 return;
}
function __ZN4mbed6StreamC2EPKc($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $8 = 0, $9 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, $vararg_buffer = 0, sp = 0;
 sp = STACKTOP; //@line 2734
 STACKTOP = STACKTOP + 16 | 0; //@line 2735
 $vararg_buffer = sp; //@line 2736
 HEAP32[$0 >> 2] = 840; //@line 2737
 $AsyncCtx3 = _emscripten_alloc_async_context(20, sp) | 0; //@line 2739
 __ZN4mbed8FileBaseC2EPKcNS_8PathTypeE($0 + 4 | 0, $1, 0); //@line 2740
 if (___async) {
  HEAP32[$AsyncCtx3 >> 2] = 104; //@line 2743
  HEAP32[$AsyncCtx3 + 4 >> 2] = $0; //@line 2745
  HEAP32[$AsyncCtx3 + 8 >> 2] = $0; //@line 2747
  HEAP32[$AsyncCtx3 + 12 >> 2] = $vararg_buffer; //@line 2749
  HEAP32[$AsyncCtx3 + 16 >> 2] = $vararg_buffer; //@line 2751
  sp = STACKTOP; //@line 2752
  STACKTOP = sp; //@line 2753
  return;
 }
 _emscripten_free_async_context($AsyncCtx3 | 0); //@line 2755
 HEAP32[$0 >> 2] = 916; //@line 2756
 HEAP32[$0 + 4 >> 2] = 1012; //@line 2758
 $8 = $0 + 20 | 0; //@line 2759
 HEAP32[$8 >> 2] = 0; //@line 2760
 $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 2761
 $9 = __ZN4mbed6fdopenEPNS_10FileHandleEPKc($0, 4989) | 0; //@line 2762
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 105; //@line 2765
  HEAP32[$AsyncCtx + 4 >> 2] = $8; //@line 2767
  HEAP32[$AsyncCtx + 8 >> 2] = $vararg_buffer; //@line 2769
  HEAP32[$AsyncCtx + 12 >> 2] = $vararg_buffer; //@line 2771
  sp = STACKTOP; //@line 2772
  STACKTOP = sp; //@line 2773
  return;
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 2775
 HEAP32[$8 >> 2] = $9; //@line 2776
 if (!$9) {
  HEAP32[$vararg_buffer >> 2] = HEAP32[(___errno_location() | 0) >> 2]; //@line 2781
  _error(4992, $vararg_buffer); //@line 2782
  STACKTOP = sp; //@line 2783
  return;
 } else {
  __ZN4mbed26mbed_set_unbuffered_streamEP8_IO_FILE($9); //@line 2785
  STACKTOP = sp; //@line 2786
  return;
 }
}
function __ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_8($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $25 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 14664
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 14668
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 14670
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 14672
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 14674
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 14676
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 14678
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 14680
 $18 = HEAP8[$0 + 36 >> 0] & 1; //@line 14683
 $25 = (HEAP32[$0 + 4 >> 2] | 0) + 8 | 0; //@line 14684
 do {
  if ($25 >>> 0 < $4 >>> 0) {
   if (!(HEAP8[$6 >> 0] | 0)) {
    if ((HEAP32[$8 >> 2] | 0) == 1) {
     if ((HEAP32[$10 >> 2] | 0) == 1) {
      break;
     }
    }
    $ReallocAsyncCtx2 = _emscripten_realloc_async_context(40) | 0; //@line 14700
    __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($25, $12, $14, $16, $18); //@line 14701
    if (!___async) {
     ___async_unwind = 0; //@line 14704
    }
    HEAP32[$ReallocAsyncCtx2 >> 2] = 197; //@line 14706
    HEAP32[$ReallocAsyncCtx2 + 4 >> 2] = $25; //@line 14708
    HEAP32[$ReallocAsyncCtx2 + 8 >> 2] = $4; //@line 14710
    HEAP32[$ReallocAsyncCtx2 + 12 >> 2] = $6; //@line 14712
    HEAP32[$ReallocAsyncCtx2 + 16 >> 2] = $8; //@line 14714
    HEAP32[$ReallocAsyncCtx2 + 20 >> 2] = $10; //@line 14716
    HEAP32[$ReallocAsyncCtx2 + 24 >> 2] = $12; //@line 14718
    HEAP32[$ReallocAsyncCtx2 + 28 >> 2] = $14; //@line 14720
    HEAP32[$ReallocAsyncCtx2 + 32 >> 2] = $16; //@line 14722
    HEAP8[$ReallocAsyncCtx2 + 36 >> 0] = $18 & 1; //@line 14725
    sp = STACKTOP; //@line 14726
    return;
   }
  }
 } while (0);
 return;
}
function __ZN15GraphicsDisplay4fillEiiiii($0, $1, $2, $3, $4, $5) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 $5 = $5 | 0;
 var $$010 = 0, $13 = 0, $17 = 0, $23 = 0, $8 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 1242
 $8 = HEAP32[(HEAP32[$0 >> 2] | 0) + 132 >> 2] | 0; //@line 1245
 $AsyncCtx = _emscripten_alloc_async_context(20, sp) | 0; //@line 1246
 FUNCTION_TABLE_viiiii[$8 & 7]($0, $1, $2, $3, $4); //@line 1247
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 57; //@line 1250
  HEAP32[$AsyncCtx + 4 >> 2] = $4; //@line 1252
  HEAP32[$AsyncCtx + 8 >> 2] = $3; //@line 1254
  HEAP32[$AsyncCtx + 12 >> 2] = $0; //@line 1256
  HEAP32[$AsyncCtx + 16 >> 2] = $5; //@line 1258
  sp = STACKTOP; //@line 1259
  return;
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 1262
 $13 = Math_imul($4, $3) | 0; //@line 1263
 if (($13 | 0) <= 0) {
  return;
 }
 $$010 = 0; //@line 1268
 while (1) {
  $17 = HEAP32[(HEAP32[$0 >> 2] | 0) + 136 >> 2] | 0; //@line 1272
  $AsyncCtx3 = _emscripten_alloc_async_context(24, sp) | 0; //@line 1273
  FUNCTION_TABLE_vii[$17 & 7]($0, $5); //@line 1274
  if (___async) {
   label = 7; //@line 1277
   break;
  }
  _emscripten_free_async_context($AsyncCtx3 | 0); //@line 1280
  $23 = $$010 + 1 | 0; //@line 1281
  if (($23 | 0) == ($13 | 0)) {
   label = 5; //@line 1284
   break;
  } else {
   $$010 = $23; //@line 1287
  }
 }
 if ((label | 0) == 5) {
  return;
 } else if ((label | 0) == 7) {
  HEAP32[$AsyncCtx3 >> 2] = 58; //@line 1294
  HEAP32[$AsyncCtx3 + 4 >> 2] = $$010; //@line 1296
  HEAP32[$AsyncCtx3 + 8 >> 2] = $13; //@line 1298
  HEAP32[$AsyncCtx3 + 12 >> 2] = $0; //@line 1300
  HEAP32[$AsyncCtx3 + 16 >> 2] = $0; //@line 1302
  HEAP32[$AsyncCtx3 + 20 >> 2] = $5; //@line 1304
  sp = STACKTOP; //@line 1305
  return;
 }
}
function __ZN11TextDisplayC2EPKc($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $12 = 0, $13 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, $vararg_buffer = 0, sp = 0;
 sp = STACKTOP; //@line 1942
 STACKTOP = STACKTOP + 16 | 0; //@line 1943
 $vararg_buffer = sp; //@line 1944
 $AsyncCtx3 = _emscripten_alloc_async_context(20, sp) | 0; //@line 1945
 __ZN4mbed6StreamC2EPKc($0, $1); //@line 1946
 if (___async) {
  HEAP32[$AsyncCtx3 >> 2] = 79; //@line 1949
  HEAP32[$AsyncCtx3 + 4 >> 2] = $0; //@line 1951
  HEAP32[$AsyncCtx3 + 8 >> 2] = $1; //@line 1953
  HEAP32[$AsyncCtx3 + 12 >> 2] = $vararg_buffer; //@line 1955
  HEAP32[$AsyncCtx3 + 16 >> 2] = $vararg_buffer; //@line 1957
  sp = STACKTOP; //@line 1958
  STACKTOP = sp; //@line 1959
  return;
 }
 _emscripten_free_async_context($AsyncCtx3 | 0); //@line 1961
 HEAP32[$0 >> 2] = 680; //@line 1962
 HEAP32[$0 + 4 >> 2] = 808; //@line 1964
 HEAP16[$0 + 26 >> 1] = 0; //@line 1966
 HEAP16[$0 + 24 >> 1] = 0; //@line 1968
 if (!$1) {
  HEAP32[$0 + 32 >> 2] = 0; //@line 1972
  STACKTOP = sp; //@line 1973
  return;
 }
 $12 = (_strlen($1) | 0) + 2 | 0; //@line 1976
 $AsyncCtx = _emscripten_alloc_async_context(20, sp) | 0; //@line 1977
 $13 = __Znaj($12) | 0; //@line 1978
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 80; //@line 1981
  HEAP32[$AsyncCtx + 4 >> 2] = $0; //@line 1983
  HEAP32[$AsyncCtx + 8 >> 2] = $vararg_buffer; //@line 1985
  HEAP32[$AsyncCtx + 12 >> 2] = $1; //@line 1987
  HEAP32[$AsyncCtx + 16 >> 2] = $vararg_buffer; //@line 1989
  sp = STACKTOP; //@line 1990
  STACKTOP = sp; //@line 1991
  return;
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 1993
 HEAP32[$0 + 32 >> 2] = $13; //@line 1995
 HEAP32[$vararg_buffer >> 2] = $1; //@line 1996
 _sprintf($13, 4771, $vararg_buffer) | 0; //@line 1997
 STACKTOP = sp; //@line 1998
 return;
}
function __ZN4mbed8FileBaseD2Ev__async_cb_53($0) {
 $0 = $0 | 0;
 var $$0 = 0, $10 = 0, $15 = 0, $18 = 0, $2 = 0, $6 = 0, $ReallocAsyncCtx = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 4489
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 4491
 do {
  if (HEAP32[$2 + 8 >> 2] | 0) {
   $6 = HEAP32[2210] | 0; //@line 4497
   if (($6 | 0) == ($2 | 0)) {
    HEAP32[2210] = HEAP32[$2 + 4 >> 2]; //@line 4502
    break;
   } else {
    $$0 = $6; //@line 4505
   }
   do {
    $10 = $$0 + 4 | 0; //@line 4508
    $$0 = HEAP32[$10 >> 2] | 0; //@line 4509
   } while (($$0 | 0) != ($2 | 0));
   HEAP32[$10 >> 2] = HEAP32[$2 + 4 >> 2]; //@line 4519
  }
 } while (0);
 $15 = HEAP32[2211] | 0; //@line 4522
 if (!$15) {
  HEAP32[2211] = 8848; //@line 4525
 } else {
  if (($15 | 0) != 8848) {
   $ReallocAsyncCtx = _emscripten_realloc_async_context(8) | 0; //@line 4529
   _mbed_assert_internal(5235, 5255, 93); //@line 4530
   if (___async) {
    HEAP32[$ReallocAsyncCtx >> 2] = 82; //@line 4533
    $18 = $ReallocAsyncCtx + 4 | 0; //@line 4534
    HEAP32[$18 >> 2] = $2; //@line 4535
    sp = STACKTOP; //@line 4536
    return;
   }
   ___async_unwind = 0; //@line 4539
   HEAP32[$ReallocAsyncCtx >> 2] = 82; //@line 4540
   $18 = $ReallocAsyncCtx + 4 | 0; //@line 4541
   HEAP32[$18 >> 2] = $2; //@line 4542
   sp = STACKTOP; //@line 4543
   return;
  }
 }
 if (HEAP32[$2 + 12 >> 2] | 0) {
  return;
 }
 $ReallocAsyncCtx3 = _emscripten_realloc_async_context(4) | 0; //@line 4554
 __ZN4mbed17remove_filehandleEPNS_10FileHandleE($2 + -4 | 0); //@line 4555
 if (___async) {
  HEAP32[$ReallocAsyncCtx3 >> 2] = 83; //@line 4558
  sp = STACKTOP; //@line 4559
  return;
 }
 ___async_unwind = 0; //@line 4562
 HEAP32[$ReallocAsyncCtx3 >> 2] = 83; //@line 4563
 sp = STACKTOP; //@line 4564
 return;
}
function __ZN4mbed10FileHandle4sizeEv($0) {
 $0 = $0 | 0;
 var $$0 = 0, $10 = 0, $11 = 0, $17 = 0, $3 = 0, $4 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, $AsyncCtx6 = 0, sp = 0;
 sp = STACKTOP; //@line 2346
 $3 = HEAP32[(HEAP32[$0 >> 2] | 0) + 16 >> 2] | 0; //@line 2349
 $AsyncCtx = _emscripten_alloc_async_context(12, sp) | 0; //@line 2350
 $4 = FUNCTION_TABLE_iiii[$3 & 15]($0, 0, 1) | 0; //@line 2351
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 91; //@line 2354
  HEAP32[$AsyncCtx + 4 >> 2] = $0; //@line 2356
  HEAP32[$AsyncCtx + 8 >> 2] = $0; //@line 2358
  sp = STACKTOP; //@line 2359
  return 0; //@line 2360
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 2362
 if (($4 | 0) < 0) {
  $$0 = $4; //@line 2365
  return $$0 | 0; //@line 2366
 }
 $10 = HEAP32[(HEAP32[$0 >> 2] | 0) + 16 >> 2] | 0; //@line 2370
 $AsyncCtx3 = _emscripten_alloc_async_context(16, sp) | 0; //@line 2371
 $11 = FUNCTION_TABLE_iiii[$10 & 15]($0, 0, 2) | 0; //@line 2372
 if (___async) {
  HEAP32[$AsyncCtx3 >> 2] = 92; //@line 2375
  HEAP32[$AsyncCtx3 + 4 >> 2] = $0; //@line 2377
  HEAP32[$AsyncCtx3 + 8 >> 2] = $0; //@line 2379
  HEAP32[$AsyncCtx3 + 12 >> 2] = $4; //@line 2381
  sp = STACKTOP; //@line 2382
  return 0; //@line 2383
 }
 _emscripten_free_async_context($AsyncCtx3 | 0); //@line 2385
 $17 = HEAP32[(HEAP32[$0 >> 2] | 0) + 16 >> 2] | 0; //@line 2388
 $AsyncCtx6 = _emscripten_alloc_async_context(8, sp) | 0; //@line 2389
 FUNCTION_TABLE_iiii[$17 & 15]($0, $4, 0) | 0; //@line 2390
 if (___async) {
  HEAP32[$AsyncCtx6 >> 2] = 93; //@line 2393
  HEAP32[$AsyncCtx6 + 4 >> 2] = $11; //@line 2395
  sp = STACKTOP; //@line 2396
  return 0; //@line 2397
 }
 _emscripten_free_async_context($AsyncCtx6 | 0); //@line 2399
 $$0 = $11; //@line 2400
 return $$0 | 0; //@line 2401
}
function __ZN11TextDisplay5_putcEi__async_cb_26($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $16 = 0, $17 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx4 = 0, sp = 0;
 sp = STACKTOP; //@line 2669
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 2673
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 2675
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 2677
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 2679
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 2681
 if ((HEAP32[___async_retval >> 2] | 0) > (HEAP32[$0 + 4 >> 2] | 0)) {
  HEAP32[___async_retval >> 2] = $4; //@line 2687
  return;
 }
 HEAP16[$6 >> 1] = 0; //@line 2690
 $16 = (HEAP16[$8 >> 1] | 0) + 1 << 16 >> 16; //@line 2692
 HEAP16[$8 >> 1] = $16; //@line 2693
 $17 = $16 & 65535; //@line 2694
 $20 = HEAP32[(HEAP32[$10 >> 2] | 0) + 92 >> 2] | 0; //@line 2697
 $ReallocAsyncCtx4 = _emscripten_realloc_async_context(16) | 0; //@line 2698
 $21 = FUNCTION_TABLE_ii[$20 & 31]($12) | 0; //@line 2699
 if (___async) {
  HEAP32[$ReallocAsyncCtx4 >> 2] = 69; //@line 2702
  $22 = $ReallocAsyncCtx4 + 4 | 0; //@line 2703
  HEAP32[$22 >> 2] = $17; //@line 2704
  $23 = $ReallocAsyncCtx4 + 8 | 0; //@line 2705
  HEAP32[$23 >> 2] = $4; //@line 2706
  $24 = $ReallocAsyncCtx4 + 12 | 0; //@line 2707
  HEAP32[$24 >> 2] = $8; //@line 2708
  sp = STACKTOP; //@line 2709
  return;
 }
 HEAP32[___async_retval >> 2] = $21; //@line 2713
 ___async_unwind = 0; //@line 2714
 HEAP32[$ReallocAsyncCtx4 >> 2] = 69; //@line 2715
 $22 = $ReallocAsyncCtx4 + 4 | 0; //@line 2716
 HEAP32[$22 >> 2] = $17; //@line 2717
 $23 = $ReallocAsyncCtx4 + 8 | 0; //@line 2718
 HEAP32[$23 >> 2] = $4; //@line 2719
 $24 = $ReallocAsyncCtx4 + 12 | 0; //@line 2720
 HEAP32[$24 >> 2] = $8; //@line 2721
 sp = STACKTOP; //@line 2722
 return;
}
function _main__async_cb_38($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $16 = 0, $2 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx11 = 0, $bitmTree$byval_copy = 0, sp = 0;
 sp = STACKTOP; //@line 3569
 STACKTOP = STACKTOP + 16 | 0; //@line 3570
 $bitmTree$byval_copy = sp; //@line 3571
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 3573
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 3575
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 3577
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 3579
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 3581
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 3583
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 3585
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 3587
 __ZN6C128323clsEv(8860); //@line 3588
 $ReallocAsyncCtx11 = _emscripten_realloc_async_context(36) | 0; //@line 3589
 HEAP32[$bitmTree$byval_copy >> 2] = HEAP32[255]; //@line 3590
 HEAP32[$bitmTree$byval_copy + 4 >> 2] = HEAP32[256]; //@line 3590
 HEAP32[$bitmTree$byval_copy + 8 >> 2] = HEAP32[257]; //@line 3590
 HEAP32[$bitmTree$byval_copy + 12 >> 2] = HEAP32[258]; //@line 3590
 __ZN6C128328print_bmE6Bitmapii(8860, $bitmTree$byval_copy, 95, 0); //@line 3591
 if (!___async) {
  ___async_unwind = 0; //@line 3594
 }
 HEAP32[$ReallocAsyncCtx11 >> 2] = 143; //@line 3596
 HEAP32[$ReallocAsyncCtx11 + 4 >> 2] = $2; //@line 3598
 HEAP32[$ReallocAsyncCtx11 + 8 >> 2] = $4; //@line 3600
 HEAP32[$ReallocAsyncCtx11 + 12 >> 2] = $6; //@line 3602
 HEAP32[$ReallocAsyncCtx11 + 16 >> 2] = $8; //@line 3604
 HEAP32[$ReallocAsyncCtx11 + 20 >> 2] = $10; //@line 3606
 HEAP32[$ReallocAsyncCtx11 + 24 >> 2] = $12; //@line 3608
 HEAP32[$ReallocAsyncCtx11 + 28 >> 2] = $14; //@line 3610
 HEAP32[$ReallocAsyncCtx11 + 32 >> 2] = $16; //@line 3612
 sp = STACKTOP; //@line 3613
 STACKTOP = sp; //@line 3614
 return;
}
function ___dup3($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$sink = 0, $5 = 0, $6 = 0, $7 = 0, $9 = 0, $vararg_buffer = 0, $vararg_buffer3 = 0, $vararg_buffer7 = 0, sp = 0;
 sp = STACKTOP; //@line 11838
 STACKTOP = STACKTOP + 48 | 0; //@line 11839
 $vararg_buffer7 = sp + 24 | 0; //@line 11840
 $vararg_buffer3 = sp + 16 | 0; //@line 11841
 $vararg_buffer = sp; //@line 11842
 L1 : do {
  if (($0 | 0) == ($1 | 0)) {
   $$sink = -22; //@line 11846
  } else {
   $5 = ($2 & 524288 | 0) != 0; //@line 11849
   L3 : do {
    if ($5) {
     while (1) {
      HEAP32[$vararg_buffer >> 2] = $0; //@line 11853
      HEAP32[$vararg_buffer + 4 >> 2] = $1; //@line 11855
      HEAP32[$vararg_buffer + 8 >> 2] = $2; //@line 11857
      $6 = ___syscall330(330, $vararg_buffer | 0) | 0; //@line 11858
      switch ($6 | 0) {
      case -38:
       {
        break L3;
        break;
       }
      case -16:
       {
        break;
       }
      default:
       {
        $$sink = $6; //@line 11868
        break L1;
       }
      }
     }
    }
   } while (0);
   do {
    HEAP32[$vararg_buffer3 >> 2] = $0; //@line 11876
    HEAP32[$vararg_buffer3 + 4 >> 2] = $1; //@line 11878
    $7 = ___syscall63(63, $vararg_buffer3 | 0) | 0; //@line 11879
   } while (($7 | 0) == -16);
   if ($5) {
    HEAP32[$vararg_buffer7 >> 2] = $1; //@line 11886
    HEAP32[$vararg_buffer7 + 4 >> 2] = 2; //@line 11888
    HEAP32[$vararg_buffer7 + 8 >> 2] = 1; //@line 11890
    ___syscall221(221, $vararg_buffer7 | 0) | 0; //@line 11891
    $$sink = $7; //@line 11892
   } else {
    $$sink = $7; //@line 11894
   }
  }
 } while (0);
 $9 = ___syscall_ret($$sink) | 0; //@line 11898
 STACKTOP = sp; //@line 11899
 return $9 | 0; //@line 11899
}
function __ZN11TextDisplayC2EPKc__async_cb_15($0) {
 $0 = $0 | 0;
 var $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 495
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 497
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 499
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 501
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 503
 HEAP32[$2 >> 2] = 680; //@line 504
 HEAP32[$2 + 4 >> 2] = 808; //@line 506
 HEAP16[$2 + 26 >> 1] = 0; //@line 508
 HEAP16[$2 + 24 >> 1] = 0; //@line 510
 if (!$4) {
  HEAP32[$2 + 32 >> 2] = 0; //@line 514
  return;
 }
 $15 = (_strlen($4) | 0) + 2 | 0; //@line 518
 $ReallocAsyncCtx = _emscripten_realloc_async_context(20) | 0; //@line 519
 $16 = __Znaj($15) | 0; //@line 520
 if (___async) {
  HEAP32[$ReallocAsyncCtx >> 2] = 80; //@line 523
  $17 = $ReallocAsyncCtx + 4 | 0; //@line 524
  HEAP32[$17 >> 2] = $2; //@line 525
  $18 = $ReallocAsyncCtx + 8 | 0; //@line 526
  HEAP32[$18 >> 2] = $6; //@line 527
  $19 = $ReallocAsyncCtx + 12 | 0; //@line 528
  HEAP32[$19 >> 2] = $4; //@line 529
  $20 = $ReallocAsyncCtx + 16 | 0; //@line 530
  HEAP32[$20 >> 2] = $8; //@line 531
  sp = STACKTOP; //@line 532
  return;
 }
 HEAP32[___async_retval >> 2] = $16; //@line 536
 ___async_unwind = 0; //@line 537
 HEAP32[$ReallocAsyncCtx >> 2] = 80; //@line 538
 $17 = $ReallocAsyncCtx + 4 | 0; //@line 539
 HEAP32[$17 >> 2] = $2; //@line 540
 $18 = $ReallocAsyncCtx + 8 | 0; //@line 541
 HEAP32[$18 >> 2] = $6; //@line 542
 $19 = $ReallocAsyncCtx + 12 | 0; //@line 543
 HEAP32[$19 >> 2] = $4; //@line 544
 $20 = $ReallocAsyncCtx + 16 | 0; //@line 545
 HEAP32[$20 >> 2] = $8; //@line 546
 sp = STACKTOP; //@line 547
 return;
}
function _fflush__async_cb_61($0) {
 $0 = $0 | 0;
 var $$023 = 0, $$02325 = 0, $$02327 = 0, $$024$lcssa = 0, $$02426 = 0, $13 = 0, $16 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 5009
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 5011
 $$02325 = HEAP32[(___ofl_lock() | 0) >> 2] | 0; //@line 5013
 L3 : do {
  if (!$$02325) {
   $$024$lcssa = $AsyncRetVal; //@line 5017
  } else {
   $$02327 = $$02325; //@line 5019
   $$02426 = $AsyncRetVal; //@line 5019
   while (1) {
    if ((HEAP32[$$02327 + 76 >> 2] | 0) > -1) {
     $16 = ___lockfile($$02327) | 0; //@line 5026
    } else {
     $16 = 0; //@line 5028
    }
    if ((HEAP32[$$02327 + 20 >> 2] | 0) >>> 0 > (HEAP32[$$02327 + 28 >> 2] | 0) >>> 0) {
     break;
    }
    if ($16 | 0) {
     ___unlockfile($$02327); //@line 5040
    }
    $$023 = HEAP32[$$02327 + 56 >> 2] | 0; //@line 5043
    if (!$$023) {
     $$024$lcssa = $$02426; //@line 5046
     break L3;
    } else {
     $$02327 = $$023; //@line 5049
    }
   }
   $ReallocAsyncCtx = _emscripten_realloc_async_context(16) | 0; //@line 5052
   $13 = ___fflush_unlocked($$02327) | 0; //@line 5053
   if (!___async) {
    HEAP32[___async_retval >> 2] = $13; //@line 5057
    ___async_unwind = 0; //@line 5058
   }
   HEAP32[$ReallocAsyncCtx >> 2] = 162; //@line 5060
   HEAP32[$ReallocAsyncCtx + 4 >> 2] = $$02426; //@line 5062
   HEAP32[$ReallocAsyncCtx + 8 >> 2] = $16; //@line 5064
   HEAP32[$ReallocAsyncCtx + 12 >> 2] = $$02327; //@line 5066
   sp = STACKTOP; //@line 5067
   return;
  }
 } while (0);
 ___ofl_unlock(); //@line 5071
 HEAP32[___async_retval >> 2] = $$024$lcssa; //@line 5073
 return;
}
function ___stdio_read($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$0 = 0, $$cast = 0, $11 = 0, $18 = 0, $24 = 0, $27 = 0, $28 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $vararg_buffer = 0, sp = 0;
 sp = STACKTOP; //@line 7480
 STACKTOP = STACKTOP + 32 | 0; //@line 7481
 $vararg_buffer = sp; //@line 7482
 $3 = sp + 16 | 0; //@line 7483
 HEAP32[$3 >> 2] = $1; //@line 7484
 $4 = $3 + 4 | 0; //@line 7485
 $5 = $0 + 48 | 0; //@line 7486
 $6 = HEAP32[$5 >> 2] | 0; //@line 7487
 HEAP32[$4 >> 2] = $2 - (($6 | 0) != 0 & 1); //@line 7491
 $11 = $0 + 44 | 0; //@line 7493
 HEAP32[$3 + 8 >> 2] = HEAP32[$11 >> 2]; //@line 7495
 HEAP32[$3 + 12 >> 2] = $6; //@line 7497
 HEAP32[$vararg_buffer >> 2] = HEAP32[$0 + 60 >> 2]; //@line 7501
 HEAP32[$vararg_buffer + 4 >> 2] = $3; //@line 7503
 HEAP32[$vararg_buffer + 8 >> 2] = 2; //@line 7505
 $18 = ___syscall_ret(___syscall145(145, $vararg_buffer | 0) | 0) | 0; //@line 7507
 if (($18 | 0) < 1) {
  HEAP32[$0 >> 2] = HEAP32[$0 >> 2] | $18 & 48 ^ 16; //@line 7514
  $$0 = $18; //@line 7515
 } else {
  $24 = HEAP32[$4 >> 2] | 0; //@line 7517
  if ($18 >>> 0 > $24 >>> 0) {
   $27 = HEAP32[$11 >> 2] | 0; //@line 7521
   $28 = $0 + 4 | 0; //@line 7522
   HEAP32[$28 >> 2] = $27; //@line 7523
   $$cast = $27; //@line 7524
   HEAP32[$0 + 8 >> 2] = $$cast + ($18 - $24); //@line 7527
   if (!(HEAP32[$5 >> 2] | 0)) {
    $$0 = $2; //@line 7531
   } else {
    HEAP32[$28 >> 2] = $$cast + 1; //@line 7534
    HEAP8[$1 + ($2 + -1) >> 0] = HEAP8[$$cast >> 0] | 0; //@line 7538
    $$0 = $2; //@line 7539
   }
  } else {
   $$0 = $18; //@line 7542
  }
 }
 STACKTOP = sp; //@line 7545
 return $$0 | 0; //@line 7545
}
function __ZN15GraphicsDisplay3clsEv($0) {
 $0 = $0 | 0;
 var $1 = 0, $12 = 0, $13 = 0, $19 = 0, $3 = 0, $5 = 0, $6 = 0, $AsyncCtx = 0, $AsyncCtx2 = 0, $AsyncCtx5 = 0, sp = 0;
 sp = STACKTOP; //@line 1093
 $1 = HEAP32[$0 >> 2] | 0; //@line 1094
 $3 = HEAP32[$1 + 140 >> 2] | 0; //@line 1096
 $5 = HEAP32[$1 + 124 >> 2] | 0; //@line 1098
 $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 1099
 $6 = FUNCTION_TABLE_ii[$5 & 31]($0) | 0; //@line 1100
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 53; //@line 1103
  HEAP32[$AsyncCtx + 4 >> 2] = $0; //@line 1105
  HEAP32[$AsyncCtx + 8 >> 2] = $0; //@line 1107
  HEAP32[$AsyncCtx + 12 >> 2] = $3; //@line 1109
  sp = STACKTOP; //@line 1110
  return;
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 1113
 $12 = HEAP32[(HEAP32[$0 >> 2] | 0) + 128 >> 2] | 0; //@line 1116
 $AsyncCtx2 = _emscripten_alloc_async_context(16, sp) | 0; //@line 1117
 $13 = FUNCTION_TABLE_ii[$12 & 31]($0) | 0; //@line 1118
 if (___async) {
  HEAP32[$AsyncCtx2 >> 2] = 54; //@line 1121
  HEAP32[$AsyncCtx2 + 4 >> 2] = $0; //@line 1123
  HEAP32[$AsyncCtx2 + 8 >> 2] = $6; //@line 1125
  HEAP32[$AsyncCtx2 + 12 >> 2] = $3; //@line 1127
  sp = STACKTOP; //@line 1128
  return;
 }
 _emscripten_free_async_context($AsyncCtx2 | 0); //@line 1131
 $19 = HEAPU16[$0 + 30 >> 1] | 0; //@line 1134
 $AsyncCtx5 = _emscripten_alloc_async_context(4, sp) | 0; //@line 1135
 FUNCTION_TABLE_viiiiii[$3 & 7]($0, 0, 0, $6, $13, $19); //@line 1136
 if (___async) {
  HEAP32[$AsyncCtx5 >> 2] = 55; //@line 1139
  sp = STACKTOP; //@line 1140
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx5 | 0); //@line 1143
  return;
 }
}
function ___overflow($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0 = 0, $10 = 0, $12 = 0, $13 = 0, $2 = 0, $20 = 0, $21 = 0, $3 = 0, $4 = 0, $5 = 0, $9 = 0, $AsyncCtx = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 7807
 STACKTOP = STACKTOP + 16 | 0; //@line 7808
 $2 = sp; //@line 7809
 $3 = $1 & 255; //@line 7810
 HEAP8[$2 >> 0] = $3; //@line 7811
 $4 = $0 + 16 | 0; //@line 7812
 $5 = HEAP32[$4 >> 2] | 0; //@line 7813
 if (!$5) {
  if (!(___towrite($0) | 0)) {
   $12 = HEAP32[$4 >> 2] | 0; //@line 7820
   label = 4; //@line 7821
  } else {
   $$0 = -1; //@line 7823
  }
 } else {
  $12 = $5; //@line 7826
  label = 4; //@line 7827
 }
 do {
  if ((label | 0) == 4) {
   $9 = $0 + 20 | 0; //@line 7831
   $10 = HEAP32[$9 >> 2] | 0; //@line 7832
   if ($10 >>> 0 < $12 >>> 0) {
    $13 = $1 & 255; //@line 7835
    if (($13 | 0) != (HEAP8[$0 + 75 >> 0] | 0)) {
     HEAP32[$9 >> 2] = $10 + 1; //@line 7842
     HEAP8[$10 >> 0] = $3; //@line 7843
     $$0 = $13; //@line 7844
     break;
    }
   }
   $20 = HEAP32[$0 + 36 >> 2] | 0; //@line 7849
   $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 7850
   $21 = FUNCTION_TABLE_iiii[$20 & 15]($0, $2, 1) | 0; //@line 7851
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 156; //@line 7854
    HEAP32[$AsyncCtx + 4 >> 2] = $2; //@line 7856
    sp = STACKTOP; //@line 7857
    STACKTOP = sp; //@line 7858
    return 0; //@line 7858
   }
   _emscripten_free_async_context($AsyncCtx | 0); //@line 7860
   if (($21 | 0) == 1) {
    $$0 = HEAPU8[$2 >> 0] | 0; //@line 7865
   } else {
    $$0 = -1; //@line 7867
   }
  }
 } while (0);
 STACKTOP = sp; //@line 7871
 return $$0 | 0; //@line 7871
}
function _memset(ptr, value, num) {
 ptr = ptr | 0;
 value = value | 0;
 num = num | 0;
 var end = 0, aligned_end = 0, block_aligned_end = 0, value4 = 0;
 end = ptr + num | 0; //@line 7042
 value = value & 255; //@line 7044
 if ((num | 0) >= 67) {
  while (ptr & 3) {
   HEAP8[ptr >> 0] = value; //@line 7047
   ptr = ptr + 1 | 0; //@line 7048
  }
  aligned_end = end & -4 | 0; //@line 7051
  block_aligned_end = aligned_end - 64 | 0; //@line 7052
  value4 = value | value << 8 | value << 16 | value << 24; //@line 7053
  while ((ptr | 0) <= (block_aligned_end | 0)) {
   HEAP32[ptr >> 2] = value4; //@line 7056
   HEAP32[ptr + 4 >> 2] = value4; //@line 7057
   HEAP32[ptr + 8 >> 2] = value4; //@line 7058
   HEAP32[ptr + 12 >> 2] = value4; //@line 7059
   HEAP32[ptr + 16 >> 2] = value4; //@line 7060
   HEAP32[ptr + 20 >> 2] = value4; //@line 7061
   HEAP32[ptr + 24 >> 2] = value4; //@line 7062
   HEAP32[ptr + 28 >> 2] = value4; //@line 7063
   HEAP32[ptr + 32 >> 2] = value4; //@line 7064
   HEAP32[ptr + 36 >> 2] = value4; //@line 7065
   HEAP32[ptr + 40 >> 2] = value4; //@line 7066
   HEAP32[ptr + 44 >> 2] = value4; //@line 7067
   HEAP32[ptr + 48 >> 2] = value4; //@line 7068
   HEAP32[ptr + 52 >> 2] = value4; //@line 7069
   HEAP32[ptr + 56 >> 2] = value4; //@line 7070
   HEAP32[ptr + 60 >> 2] = value4; //@line 7071
   ptr = ptr + 64 | 0; //@line 7072
  }
  while ((ptr | 0) < (aligned_end | 0)) {
   HEAP32[ptr >> 2] = value4; //@line 7076
   ptr = ptr + 4 | 0; //@line 7077
  }
 }
 while ((ptr | 0) < (end | 0)) {
  HEAP8[ptr >> 0] = value; //@line 7082
  ptr = ptr + 1 | 0; //@line 7083
 }
 return end - num | 0; //@line 7085
}
function __ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $16 = 0, $21 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 14601
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 14605
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 14607
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 14609
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 14611
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 14613
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 14615
 $16 = HEAP8[$0 + 32 >> 0] & 1; //@line 14618
 $21 = (HEAP32[$0 + 4 >> 2] | 0) + 8 | 0; //@line 14619
 if ($21 >>> 0 < $4 >>> 0) {
  if (!(HEAP8[$6 >> 0] | 0)) {
   if ((HEAP32[$8 >> 2] | 0) != 1) {
    $ReallocAsyncCtx = _emscripten_realloc_async_context(36) | 0; //@line 14628
    __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($21, $10, $12, $14, $16); //@line 14629
    if (!___async) {
     ___async_unwind = 0; //@line 14632
    }
    HEAP32[$ReallocAsyncCtx >> 2] = 198; //@line 14634
    HEAP32[$ReallocAsyncCtx + 4 >> 2] = $21; //@line 14636
    HEAP32[$ReallocAsyncCtx + 8 >> 2] = $4; //@line 14638
    HEAP32[$ReallocAsyncCtx + 12 >> 2] = $6; //@line 14640
    HEAP32[$ReallocAsyncCtx + 16 >> 2] = $8; //@line 14642
    HEAP32[$ReallocAsyncCtx + 20 >> 2] = $10; //@line 14644
    HEAP32[$ReallocAsyncCtx + 24 >> 2] = $12; //@line 14646
    HEAP32[$ReallocAsyncCtx + 28 >> 2] = $14; //@line 14648
    HEAP8[$ReallocAsyncCtx + 32 >> 0] = $16 & 1; //@line 14651
    sp = STACKTOP; //@line 14652
    return;
   }
  }
 }
 return;
}
function __ZN4mbed8FileBaseC2EPKcNS_8PathTypeE($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $14 = 0, $3 = 0, $6 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 2213
 HEAP32[$0 >> 2] = 824; //@line 2214
 $3 = $0 + 4 | 0; //@line 2215
 HEAP32[$3 >> 2] = 0; //@line 2216
 HEAP32[$0 + 8 >> 2] = $1; //@line 2218
 HEAP32[$0 + 12 >> 2] = $2; //@line 2220
 $6 = HEAP32[2211] | 0; //@line 2221
 do {
  if (!$6) {
   HEAP32[2211] = 8848; //@line 2225
  } else {
   if (($6 | 0) != 8848) {
    $AsyncCtx3 = _emscripten_alloc_async_context(16, sp) | 0; //@line 2229
    _mbed_assert_internal(5235, 5255, 93); //@line 2230
    if (___async) {
     HEAP32[$AsyncCtx3 >> 2] = 87; //@line 2233
     HEAP32[$AsyncCtx3 + 4 >> 2] = $1; //@line 2235
     HEAP32[$AsyncCtx3 + 8 >> 2] = $3; //@line 2237
     HEAP32[$AsyncCtx3 + 12 >> 2] = $0; //@line 2239
     sp = STACKTOP; //@line 2240
     return;
    } else {
     _emscripten_free_async_context($AsyncCtx3 | 0); //@line 2243
     break;
    }
   }
  }
 } while (0);
 if (!$1) {
  HEAP32[$3 >> 2] = 0; //@line 2251
 } else {
  HEAP32[$3 >> 2] = HEAP32[2210]; //@line 2254
  HEAP32[2210] = $0; //@line 2255
 }
 $14 = HEAP32[2211] | 0; //@line 2257
 if (!$14) {
  HEAP32[2211] = 8848; //@line 2260
  return;
 }
 if (($14 | 0) == 8848) {
  return;
 }
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 2267
 _mbed_assert_internal(5235, 5255, 93); //@line 2268
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 88; //@line 2271
  sp = STACKTOP; //@line 2272
  return;
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 2275
 return;
}
function _fflush__async_cb($0) {
 $0 = $0 | 0;
 var $$02327$reg2mem$0 = 0, $$1 = 0, $$reg2mem$0 = 0, $17 = 0, $20 = 0, $ReallocAsyncCtx = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 4910
 $$02327$reg2mem$0 = HEAP32[$0 + 12 >> 2] | 0; //@line 4920
 $$1 = HEAP32[___async_retval >> 2] | HEAP32[$0 + 4 >> 2]; //@line 4920
 $$reg2mem$0 = HEAP32[$0 + 8 >> 2] | 0; //@line 4920
 while (1) {
  if ($$reg2mem$0 | 0) {
   ___unlockfile($$02327$reg2mem$0); //@line 4924
  }
  $$02327$reg2mem$0 = HEAP32[$$02327$reg2mem$0 + 56 >> 2] | 0; //@line 4927
  if (!$$02327$reg2mem$0) {
   label = 12; //@line 4930
   break;
  }
  if ((HEAP32[$$02327$reg2mem$0 + 76 >> 2] | 0) > -1) {
   $20 = ___lockfile($$02327$reg2mem$0) | 0; //@line 4938
  } else {
   $20 = 0; //@line 4940
  }
  if ((HEAP32[$$02327$reg2mem$0 + 20 >> 2] | 0) >>> 0 > (HEAP32[$$02327$reg2mem$0 + 28 >> 2] | 0) >>> 0) {
   break;
  } else {
   $$reg2mem$0 = $20; //@line 4950
  }
 }
 if ((label | 0) == 12) {
  ___ofl_unlock(); //@line 4954
  HEAP32[___async_retval >> 2] = $$1; //@line 4956
  return;
 }
 $ReallocAsyncCtx = _emscripten_realloc_async_context(16) | 0; //@line 4959
 $17 = ___fflush_unlocked($$02327$reg2mem$0) | 0; //@line 4960
 if (!___async) {
  HEAP32[___async_retval >> 2] = $17; //@line 4964
  ___async_unwind = 0; //@line 4965
 }
 HEAP32[$ReallocAsyncCtx >> 2] = 162; //@line 4967
 HEAP32[$ReallocAsyncCtx + 4 >> 2] = $$1; //@line 4969
 HEAP32[$ReallocAsyncCtx + 8 >> 2] = $20; //@line 4971
 HEAP32[$ReallocAsyncCtx + 12 >> 2] = $$02327$reg2mem$0; //@line 4973
 sp = STACKTOP; //@line 4974
 return;
}
function ___fflush_unlocked__async_cb($0) {
 $0 = $0 | 0;
 var $$0 = 0, $10 = 0, $11 = 0, $12 = 0, $18 = 0, $2 = 0, $4 = 0, $6 = 0, $9 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 4635
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 4637
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 4639
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 4641
 do {
  if (!(HEAP32[$2 >> 2] | 0)) {
   $$0 = -1; //@line 4646
  } else {
   $9 = $4 + 4 | 0; //@line 4648
   $10 = HEAP32[$9 >> 2] | 0; //@line 4649
   $11 = $4 + 8 | 0; //@line 4650
   $12 = HEAP32[$11 >> 2] | 0; //@line 4651
   if ($10 >>> 0 >= $12 >>> 0) {
    HEAP32[$4 + 16 >> 2] = 0; //@line 4655
    HEAP32[$6 >> 2] = 0; //@line 4656
    HEAP32[$2 >> 2] = 0; //@line 4657
    HEAP32[$11 >> 2] = 0; //@line 4658
    HEAP32[$9 >> 2] = 0; //@line 4659
    $$0 = 0; //@line 4660
    break;
   }
   $18 = HEAP32[$4 + 40 >> 2] | 0; //@line 4667
   $ReallocAsyncCtx2 = _emscripten_realloc_async_context(24) | 0; //@line 4668
   FUNCTION_TABLE_iiii[$18 & 15]($4, $10 - $12 | 0, 1) | 0; //@line 4669
   if (!___async) {
    ___async_unwind = 0; //@line 4672
   }
   HEAP32[$ReallocAsyncCtx2 >> 2] = 164; //@line 4674
   HEAP32[$ReallocAsyncCtx2 + 4 >> 2] = $4; //@line 4676
   HEAP32[$ReallocAsyncCtx2 + 8 >> 2] = $6; //@line 4678
   HEAP32[$ReallocAsyncCtx2 + 12 >> 2] = $2; //@line 4680
   HEAP32[$ReallocAsyncCtx2 + 16 >> 2] = $11; //@line 4682
   HEAP32[$ReallocAsyncCtx2 + 20 >> 2] = $9; //@line 4684
   sp = STACKTOP; //@line 4685
   return;
  }
 } while (0);
 HEAP32[___async_retval >> 2] = $$0; //@line 4690
 return;
}
function _main__async_cb_44($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $2 = 0, $20 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx14 = 0, sp = 0;
 sp = STACKTOP; //@line 3939
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 3941
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 3943
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 3945
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 3947
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 3949
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 3951
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 3953
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 3955
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 3957
 $20 = HEAP32[$0 + 40 >> 2] | 0; //@line 3959
 $ReallocAsyncCtx14 = _emscripten_realloc_async_context(44) | 0; //@line 3960
 _wait(.20000000298023224); //@line 3961
 if (!___async) {
  ___async_unwind = 0; //@line 3964
 }
 HEAP32[$ReallocAsyncCtx14 >> 2] = 148; //@line 3966
 HEAP32[$ReallocAsyncCtx14 + 4 >> 2] = $2; //@line 3968
 HEAP32[$ReallocAsyncCtx14 + 8 >> 2] = $4; //@line 3970
 HEAP32[$ReallocAsyncCtx14 + 12 >> 2] = $6; //@line 3972
 HEAP32[$ReallocAsyncCtx14 + 16 >> 2] = $8; //@line 3974
 HEAP32[$ReallocAsyncCtx14 + 20 >> 2] = $10; //@line 3976
 HEAP32[$ReallocAsyncCtx14 + 24 >> 2] = $12; //@line 3978
 HEAP32[$ReallocAsyncCtx14 + 28 >> 2] = $14; //@line 3980
 HEAP32[$ReallocAsyncCtx14 + 32 >> 2] = $16; //@line 3982
 HEAP32[$ReallocAsyncCtx14 + 36 >> 2] = $18; //@line 3984
 HEAP32[$ReallocAsyncCtx14 + 40 >> 2] = $20; //@line 3986
 sp = STACKTOP; //@line 3987
 return;
}
function _main__async_cb_42($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $2 = 0, $20 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx13 = 0, sp = 0;
 sp = STACKTOP; //@line 3827
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 3829
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 3831
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 3833
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 3835
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 3837
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 3839
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 3841
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 3843
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 3845
 $20 = HEAP32[$0 + 40 >> 2] | 0; //@line 3847
 $ReallocAsyncCtx13 = _emscripten_realloc_async_context(44) | 0; //@line 3848
 _wait(.20000000298023224); //@line 3849
 if (!___async) {
  ___async_unwind = 0; //@line 3852
 }
 HEAP32[$ReallocAsyncCtx13 >> 2] = 151; //@line 3854
 HEAP32[$ReallocAsyncCtx13 + 4 >> 2] = $2; //@line 3856
 HEAP32[$ReallocAsyncCtx13 + 8 >> 2] = $4; //@line 3858
 HEAP32[$ReallocAsyncCtx13 + 12 >> 2] = $6; //@line 3860
 HEAP32[$ReallocAsyncCtx13 + 16 >> 2] = $8; //@line 3862
 HEAP32[$ReallocAsyncCtx13 + 20 >> 2] = $10; //@line 3864
 HEAP32[$ReallocAsyncCtx13 + 24 >> 2] = $12; //@line 3866
 HEAP32[$ReallocAsyncCtx13 + 28 >> 2] = $14; //@line 3868
 HEAP32[$ReallocAsyncCtx13 + 32 >> 2] = $16; //@line 3870
 HEAP32[$ReallocAsyncCtx13 + 36 >> 2] = $18; //@line 3872
 HEAP32[$ReallocAsyncCtx13 + 40 >> 2] = $20; //@line 3874
 sp = STACKTOP; //@line 3875
 return;
}
function __ZN4mbed10FileHandle4sizeEv__async_cb($0) {
 $0 = $0 | 0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $2 = 0, $4 = 0, $9 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 6033
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 6035
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 6037
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 6039
 if (($AsyncRetVal | 0) < 0) {
  HEAP32[___async_retval >> 2] = $AsyncRetVal; //@line 6043
  return;
 }
 $9 = HEAP32[(HEAP32[$2 >> 2] | 0) + 16 >> 2] | 0; //@line 6048
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(16) | 0; //@line 6049
 $10 = FUNCTION_TABLE_iiii[$9 & 15]($4, 0, 2) | 0; //@line 6050
 if (___async) {
  HEAP32[$ReallocAsyncCtx2 >> 2] = 92; //@line 6053
  $11 = $ReallocAsyncCtx2 + 4 | 0; //@line 6054
  HEAP32[$11 >> 2] = $2; //@line 6055
  $12 = $ReallocAsyncCtx2 + 8 | 0; //@line 6056
  HEAP32[$12 >> 2] = $4; //@line 6057
  $13 = $ReallocAsyncCtx2 + 12 | 0; //@line 6058
  HEAP32[$13 >> 2] = $AsyncRetVal; //@line 6059
  sp = STACKTOP; //@line 6060
  return;
 }
 HEAP32[___async_retval >> 2] = $10; //@line 6064
 ___async_unwind = 0; //@line 6065
 HEAP32[$ReallocAsyncCtx2 >> 2] = 92; //@line 6066
 $11 = $ReallocAsyncCtx2 + 4 | 0; //@line 6067
 HEAP32[$11 >> 2] = $2; //@line 6068
 $12 = $ReallocAsyncCtx2 + 8 | 0; //@line 6069
 HEAP32[$12 >> 2] = $4; //@line 6070
 $13 = $ReallocAsyncCtx2 + 12 | 0; //@line 6071
 HEAP32[$13 >> 2] = $AsyncRetVal; //@line 6072
 sp = STACKTOP; //@line 6073
 return;
}
function _wcrtomb($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$0 = 0;
 do {
  if (!$0) {
   $$0 = 1; //@line 11505
  } else {
   if ($1 >>> 0 < 128) {
    HEAP8[$0 >> 0] = $1; //@line 11510
    $$0 = 1; //@line 11511
    break;
   }
   if (!(HEAP32[HEAP32[(___pthread_self_910() | 0) + 188 >> 2] >> 2] | 0)) {
    if (($1 & -128 | 0) == 57216) {
     HEAP8[$0 >> 0] = $1; //@line 11524
     $$0 = 1; //@line 11525
     break;
    } else {
     HEAP32[(___errno_location() | 0) >> 2] = 84; //@line 11529
     $$0 = -1; //@line 11530
     break;
    }
   }
   if ($1 >>> 0 < 2048) {
    HEAP8[$0 >> 0] = $1 >>> 6 | 192; //@line 11540
    HEAP8[$0 + 1 >> 0] = $1 & 63 | 128; //@line 11544
    $$0 = 2; //@line 11545
    break;
   }
   if ($1 >>> 0 < 55296 | ($1 & -8192 | 0) == 57344) {
    HEAP8[$0 >> 0] = $1 >>> 12 | 224; //@line 11557
    HEAP8[$0 + 1 >> 0] = $1 >>> 6 & 63 | 128; //@line 11563
    HEAP8[$0 + 2 >> 0] = $1 & 63 | 128; //@line 11567
    $$0 = 3; //@line 11568
    break;
   }
   if (($1 + -65536 | 0) >>> 0 < 1048576) {
    HEAP8[$0 >> 0] = $1 >>> 18 | 240; //@line 11578
    HEAP8[$0 + 1 >> 0] = $1 >>> 12 & 63 | 128; //@line 11584
    HEAP8[$0 + 2 >> 0] = $1 >>> 6 & 63 | 128; //@line 11590
    HEAP8[$0 + 3 >> 0] = $1 & 63 | 128; //@line 11594
    $$0 = 4; //@line 11595
    break;
   } else {
    HEAP32[(___errno_location() | 0) >> 2] = 84; //@line 11599
    $$0 = -1; //@line 11600
    break;
   }
  }
 } while (0);
 return $$0 | 0; //@line 11605
}
function __ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv__async_cb_30($0) {
 $0 = $0 | 0;
 var $15 = 0, $16 = 0, $2 = 0, $4 = 0, $6 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx = 0, dest = 0, sp = 0, stop = 0;
 sp = STACKTOP; //@line 2928
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 2930
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 2932
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 2934
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 2936
 if (!$AsyncRetVal) {
  HEAP8[___async_retval >> 0] = 0; //@line 2941
  return;
 }
 dest = $2 + 4 | 0; //@line 2945
 stop = dest + 52 | 0; //@line 2945
 do {
  HEAP32[dest >> 2] = 0; //@line 2945
  dest = dest + 4 | 0; //@line 2945
 } while ((dest | 0) < (stop | 0));
 HEAP32[$2 >> 2] = $AsyncRetVal; //@line 2946
 HEAP32[$2 + 8 >> 2] = $4; //@line 2948
 HEAP32[$2 + 12 >> 2] = -1; //@line 2950
 HEAP32[$2 + 48 >> 2] = 1; //@line 2952
 $15 = HEAP32[(HEAP32[$AsyncRetVal >> 2] | 0) + 28 >> 2] | 0; //@line 2955
 $16 = HEAP32[$6 >> 2] | 0; //@line 2956
 $ReallocAsyncCtx = _emscripten_realloc_async_context(16) | 0; //@line 2957
 FUNCTION_TABLE_viiii[$15 & 7]($AsyncRetVal, $2, $16, 1); //@line 2958
 if (!___async) {
  ___async_unwind = 0; //@line 2961
 }
 HEAP32[$ReallocAsyncCtx >> 2] = 183; //@line 2963
 HEAP32[$ReallocAsyncCtx + 4 >> 2] = $2; //@line 2965
 HEAP32[$ReallocAsyncCtx + 8 >> 2] = $6; //@line 2967
 HEAP32[$ReallocAsyncCtx + 12 >> 2] = $2; //@line 2969
 sp = STACKTOP; //@line 2970
 return;
}
function __ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_9($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $17 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 14737
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 14741
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 14743
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 14745
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 14747
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 14749
 $14 = HEAP8[$0 + 28 >> 0] & 1; //@line 14752
 $17 = (HEAP32[$0 + 4 >> 2] | 0) + 8 | 0; //@line 14753
 if ($17 >>> 0 < $4 >>> 0) {
  if (!(HEAP8[$6 >> 0] | 0)) {
   $ReallocAsyncCtx3 = _emscripten_realloc_async_context(32) | 0; //@line 14759
   __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($17, $8, $10, $12, $14); //@line 14760
   if (!___async) {
    ___async_unwind = 0; //@line 14763
   }
   HEAP32[$ReallocAsyncCtx3 >> 2] = 196; //@line 14765
   HEAP32[$ReallocAsyncCtx3 + 4 >> 2] = $17; //@line 14767
   HEAP32[$ReallocAsyncCtx3 + 8 >> 2] = $4; //@line 14769
   HEAP32[$ReallocAsyncCtx3 + 12 >> 2] = $6; //@line 14771
   HEAP32[$ReallocAsyncCtx3 + 16 >> 2] = $8; //@line 14773
   HEAP32[$ReallocAsyncCtx3 + 20 >> 2] = $10; //@line 14775
   HEAP32[$ReallocAsyncCtx3 + 24 >> 2] = $12; //@line 14777
   HEAP8[$ReallocAsyncCtx3 + 28 >> 0] = $14 & 1; //@line 14780
   sp = STACKTOP; //@line 14781
   return;
  }
 }
 return;
}
function _fopen($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0 = 0, $11 = 0, $15 = 0, $7 = 0, $vararg_buffer = 0, $vararg_buffer3 = 0, $vararg_buffer8 = 0, sp = 0;
 sp = STACKTOP; //@line 8153
 STACKTOP = STACKTOP + 48 | 0; //@line 8154
 $vararg_buffer8 = sp + 32 | 0; //@line 8155
 $vararg_buffer3 = sp + 16 | 0; //@line 8156
 $vararg_buffer = sp; //@line 8157
 if (!(_strchr(5831, HEAP8[$1 >> 0] | 0) | 0)) {
  HEAP32[(___errno_location() | 0) >> 2] = 22; //@line 8164
  $$0 = 0; //@line 8165
 } else {
  $7 = ___fmodeflags($1) | 0; //@line 8167
  HEAP32[$vararg_buffer >> 2] = $0; //@line 8170
  HEAP32[$vararg_buffer + 4 >> 2] = $7 | 32768; //@line 8172
  HEAP32[$vararg_buffer + 8 >> 2] = 438; //@line 8174
  $11 = ___syscall_ret(___syscall5(5, $vararg_buffer | 0) | 0) | 0; //@line 8176
  if (($11 | 0) < 0) {
   $$0 = 0; //@line 8179
  } else {
   if ($7 & 524288 | 0) {
    HEAP32[$vararg_buffer3 >> 2] = $11; //@line 8184
    HEAP32[$vararg_buffer3 + 4 >> 2] = 2; //@line 8186
    HEAP32[$vararg_buffer3 + 8 >> 2] = 1; //@line 8188
    ___syscall221(221, $vararg_buffer3 | 0) | 0; //@line 8189
   }
   $15 = ___fdopen($11, $1) | 0; //@line 8191
   if (!$15) {
    HEAP32[$vararg_buffer8 >> 2] = $11; //@line 8194
    ___syscall6(6, $vararg_buffer8 | 0) | 0; //@line 8195
    $$0 = 0; //@line 8196
   } else {
    $$0 = $15; //@line 8198
   }
  }
 }
 STACKTOP = sp; //@line 8202
 return $$0 | 0; //@line 8202
}
function __ZN4mbed6StreamC2EPKc__async_cb_16($0) {
 $0 = $0 | 0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 578
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 582
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 584
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 586
 HEAP32[HEAP32[$0 + 4 >> 2] >> 2] = 916; //@line 587
 HEAP32[$4 + 4 >> 2] = 1012; //@line 589
 $10 = $4 + 20 | 0; //@line 590
 HEAP32[$10 >> 2] = 0; //@line 591
 $ReallocAsyncCtx = _emscripten_realloc_async_context(16) | 0; //@line 592
 $11 = __ZN4mbed6fdopenEPNS_10FileHandleEPKc($4, 4989) | 0; //@line 593
 if (___async) {
  HEAP32[$ReallocAsyncCtx >> 2] = 105; //@line 596
  $12 = $ReallocAsyncCtx + 4 | 0; //@line 597
  HEAP32[$12 >> 2] = $10; //@line 598
  $13 = $ReallocAsyncCtx + 8 | 0; //@line 599
  HEAP32[$13 >> 2] = $6; //@line 600
  $14 = $ReallocAsyncCtx + 12 | 0; //@line 601
  HEAP32[$14 >> 2] = $8; //@line 602
  sp = STACKTOP; //@line 603
  return;
 }
 HEAP32[___async_retval >> 2] = $11; //@line 607
 ___async_unwind = 0; //@line 608
 HEAP32[$ReallocAsyncCtx >> 2] = 105; //@line 609
 $12 = $ReallocAsyncCtx + 4 | 0; //@line 610
 HEAP32[$12 >> 2] = $10; //@line 611
 $13 = $ReallocAsyncCtx + 8 | 0; //@line 612
 HEAP32[$13 >> 2] = $6; //@line 613
 $14 = $ReallocAsyncCtx + 12 | 0; //@line 614
 HEAP32[$14 >> 2] = $8; //@line 615
 sp = STACKTOP; //@line 616
 return;
}
function _fmt_u($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$010$lcssa$off0 = 0, $$012 = 0, $$09$lcssa = 0, $$0914 = 0, $$1$lcssa = 0, $$111 = 0, $10 = 0, $26 = 0, $8 = 0, $9 = 0, $8$looptemp = 0;
 if ($1 >>> 0 > 0 | ($1 | 0) == 0 & $0 >>> 0 > 4294967295) {
  $$0914 = $2; //@line 10389
  $8 = $0; //@line 10389
  $9 = $1; //@line 10389
  while (1) {
   $10 = ___uremdi3($8 | 0, $9 | 0, 10, 0) | 0; //@line 10391
   $$0914 = $$0914 + -1 | 0; //@line 10395
   HEAP8[$$0914 >> 0] = $10 & 255 | 48; //@line 10396
   $8$looptemp = $8;
   $8 = ___udivdi3($8 | 0, $9 | 0, 10, 0) | 0; //@line 10397
   if (!($9 >>> 0 > 9 | ($9 | 0) == 9 & $8$looptemp >>> 0 > 4294967295)) {
    break;
   } else {
    $9 = tempRet0; //@line 10405
   }
  }
  $$010$lcssa$off0 = $8; //@line 10410
  $$09$lcssa = $$0914; //@line 10410
 } else {
  $$010$lcssa$off0 = $0; //@line 10412
  $$09$lcssa = $2; //@line 10412
 }
 if (!$$010$lcssa$off0) {
  $$1$lcssa = $$09$lcssa; //@line 10416
 } else {
  $$012 = $$010$lcssa$off0; //@line 10418
  $$111 = $$09$lcssa; //@line 10418
  while (1) {
   $26 = $$111 + -1 | 0; //@line 10423
   HEAP8[$26 >> 0] = ($$012 >>> 0) % 10 | 0 | 48; //@line 10424
   if ($$012 >>> 0 < 10) {
    $$1$lcssa = $26; //@line 10428
    break;
   } else {
    $$012 = ($$012 >>> 0) / 10 | 0; //@line 10431
    $$111 = $26; //@line 10431
   }
  }
 }
 return $$1$lcssa | 0; //@line 10435
}
function _main__async_cb_46($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $2 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx15 = 0, sp = 0;
 sp = STACKTOP; //@line 4051
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 4053
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 4055
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 4057
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 4059
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 4061
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 4063
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 4065
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 4067
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 4069
 $ReallocAsyncCtx15 = _emscripten_realloc_async_context(40) | 0; //@line 4070
 _wait(.20000000298023224); //@line 4071
 if (!___async) {
  ___async_unwind = 0; //@line 4074
 }
 HEAP32[$ReallocAsyncCtx15 >> 2] = 145; //@line 4076
 HEAP32[$ReallocAsyncCtx15 + 4 >> 2] = $2; //@line 4078
 HEAP32[$ReallocAsyncCtx15 + 8 >> 2] = $4; //@line 4080
 HEAP32[$ReallocAsyncCtx15 + 12 >> 2] = $6; //@line 4082
 HEAP32[$ReallocAsyncCtx15 + 16 >> 2] = $8; //@line 4084
 HEAP32[$ReallocAsyncCtx15 + 20 >> 2] = $10; //@line 4086
 HEAP32[$ReallocAsyncCtx15 + 24 >> 2] = $12; //@line 4088
 HEAP32[$ReallocAsyncCtx15 + 28 >> 2] = $14; //@line 4090
 HEAP32[$ReallocAsyncCtx15 + 32 >> 2] = $16; //@line 4092
 HEAP32[$ReallocAsyncCtx15 + 36 >> 2] = $18; //@line 4094
 sp = STACKTOP; //@line 4095
 return;
}
function __ZN4mbed17remove_filehandleEPNS_10FileHandleE($0) {
 $0 = $0 | 0;
 var $1 = 0, $8 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 3449
 $1 = HEAP32[2213] | 0; //@line 3450
 do {
  if (!$1) {
   HEAP32[2213] = 8856; //@line 3454
  } else {
   if (($1 | 0) != 8856) {
    $AsyncCtx3 = _emscripten_alloc_async_context(8, sp) | 0; //@line 3458
    _mbed_assert_internal(5235, 5255, 93); //@line 3459
    if (___async) {
     HEAP32[$AsyncCtx3 >> 2] = 134; //@line 3462
     HEAP32[$AsyncCtx3 + 4 >> 2] = $0; //@line 3464
     sp = STACKTOP; //@line 3465
     return;
    } else {
     _emscripten_free_async_context($AsyncCtx3 | 0); //@line 3468
     break;
    }
   }
  }
 } while (0);
 if ((HEAP32[459] | 0) == ($0 | 0)) {
  HEAP32[459] = 0; //@line 3477
 }
 if ((HEAP32[460] | 0) == ($0 | 0)) {
  HEAP32[460] = 0; //@line 3482
 }
 if ((HEAP32[461] | 0) == ($0 | 0)) {
  HEAP32[461] = 0; //@line 3487
 }
 $8 = HEAP32[2213] | 0; //@line 3489
 if (!$8) {
  HEAP32[2213] = 8856; //@line 3492
  return;
 }
 if (($8 | 0) == 8856) {
  return;
 }
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 3499
 _mbed_assert_internal(5235, 5255, 93); //@line 3500
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 135; //@line 3503
  sp = STACKTOP; //@line 3504
  return;
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 3507
 return;
}
function __ZN11TextDisplay5claimEP8_IO_FILE($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0 = 0, $12 = 0, $13 = 0, $3 = 0, $6 = 0, $9 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 1690
 $3 = HEAP32[$0 + 32 >> 2] | 0; //@line 1692
 if (!$3) {
  _fwrite(4628, 85, 1, HEAP32[271] | 0) | 0; //@line 1696
  $$0 = 0; //@line 1697
  return $$0 | 0; //@line 1698
 }
 $AsyncCtx3 = _emscripten_alloc_async_context(8, sp) | 0; //@line 1700
 $6 = _freopen($3, 4714, $1) | 0; //@line 1701
 if (___async) {
  HEAP32[$AsyncCtx3 >> 2] = 70; //@line 1704
  HEAP32[$AsyncCtx3 + 4 >> 2] = $0; //@line 1706
  sp = STACKTOP; //@line 1707
  return 0; //@line 1708
 }
 _emscripten_free_async_context($AsyncCtx3 | 0); //@line 1710
 if (!$6) {
  $$0 = 0; //@line 1713
  return $$0 | 0; //@line 1714
 }
 $9 = HEAP32[303] | 0; //@line 1716
 $12 = HEAP32[(HEAP32[$0 >> 2] | 0) + 96 >> 2] | 0; //@line 1719
 $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 1720
 $13 = FUNCTION_TABLE_ii[$12 & 31]($0) | 0; //@line 1721
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 71; //@line 1724
  HEAP32[$AsyncCtx + 4 >> 2] = $9; //@line 1726
  sp = STACKTOP; //@line 1727
  return 0; //@line 1728
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 1730
 _setvbuf($9, 0, 1, $13) | 0; //@line 1731
 $$0 = 1; //@line 1732
 return $$0 | 0; //@line 1733
}
function __ZNK10__cxxabiv121__vmi_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $13 = 0, $2 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 6122
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 6124
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 6128
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 6130
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 6132
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 6134
 if (!(HEAP8[$2 >> 0] | 0)) {
  $13 = (HEAP32[$0 + 8 >> 2] | 0) + 8 | 0; //@line 6138
  if ($13 >>> 0 < $6 >>> 0) {
   $ReallocAsyncCtx = _emscripten_realloc_async_context(28) | 0; //@line 6141
   __ZNK10__cxxabiv122__base_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($13, $8, $10, $12); //@line 6142
   if (!___async) {
    ___async_unwind = 0; //@line 6145
   }
   HEAP32[$ReallocAsyncCtx >> 2] = 200; //@line 6147
   HEAP32[$ReallocAsyncCtx + 4 >> 2] = $2; //@line 6149
   HEAP32[$ReallocAsyncCtx + 8 >> 2] = $13; //@line 6151
   HEAP32[$ReallocAsyncCtx + 12 >> 2] = $6; //@line 6153
   HEAP32[$ReallocAsyncCtx + 16 >> 2] = $8; //@line 6155
   HEAP32[$ReallocAsyncCtx + 20 >> 2] = $10; //@line 6157
   HEAP32[$ReallocAsyncCtx + 24 >> 2] = $12; //@line 6159
   sp = STACKTOP; //@line 6160
   return;
  }
 }
 return;
}
function __ZN4mbed6fdopenEPNS_10FileHandleEPKc($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0$$sroa_idx = 0, $2 = 0, $3 = 0, $7 = 0, $8 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 3544
 STACKTOP = STACKTOP + 16 | 0; //@line 3545
 $2 = sp; //@line 3546
 HEAP8[$2 >> 0] = 58; //@line 3547
 $$0$$sroa_idx = $2 + 1 | 0; //@line 3548
 HEAP8[$$0$$sroa_idx >> 0] = $0; //@line 3549
 HEAP8[$$0$$sroa_idx + 1 >> 0] = $0 >> 8; //@line 3549
 HEAP8[$$0$$sroa_idx + 2 >> 0] = $0 >> 16; //@line 3549
 HEAP8[$$0$$sroa_idx + 3 >> 0] = $0 >> 24; //@line 3549
 $3 = _fopen($2, $1) | 0; //@line 3550
 if (!$3) {
  STACKTOP = sp; //@line 3553
  return $3 | 0; //@line 3553
 }
 $7 = HEAP32[(HEAP32[$0 >> 2] | 0) + 28 >> 2] | 0; //@line 3557
 $AsyncCtx = _emscripten_alloc_async_context(12, sp) | 0; //@line 3558
 $8 = FUNCTION_TABLE_ii[$7 & 31]($0) | 0; //@line 3559
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 137; //@line 3562
  HEAP32[$AsyncCtx + 4 >> 2] = $2; //@line 3564
  HEAP32[$AsyncCtx + 8 >> 2] = $3; //@line 3566
  sp = STACKTOP; //@line 3567
  STACKTOP = sp; //@line 3568
  return 0; //@line 3568
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 3570
 if (!$8) {
  STACKTOP = sp; //@line 3573
  return $3 | 0; //@line 3573
 }
 _setbuf($3, 0); //@line 3575
 STACKTOP = sp; //@line 3576
 return $3 | 0; //@line 3576
}
function _strlen($0) {
 $0 = $0 | 0;
 var $$0 = 0, $$015$lcssa = 0, $$01519 = 0, $$1$lcssa = 0, $$pn = 0, $$sink = 0, $1 = 0, $10 = 0, $19 = 0, $23 = 0, $6 = 0, label = 0;
 $1 = $0; //@line 7635
 L1 : do {
  if (!($1 & 3)) {
   $$015$lcssa = $0; //@line 7640
   label = 4; //@line 7641
  } else {
   $$01519 = $0; //@line 7643
   $23 = $1; //@line 7643
   while (1) {
    if (!(HEAP8[$$01519 >> 0] | 0)) {
     $$sink = $23; //@line 7648
     break L1;
    }
    $6 = $$01519 + 1 | 0; //@line 7651
    $23 = $6; //@line 7652
    if (!($23 & 3)) {
     $$015$lcssa = $6; //@line 7656
     label = 4; //@line 7657
     break;
    } else {
     $$01519 = $6; //@line 7660
    }
   }
  }
 } while (0);
 if ((label | 0) == 4) {
  $$0 = $$015$lcssa; //@line 7666
  while (1) {
   $10 = HEAP32[$$0 >> 2] | 0; //@line 7668
   if (!(($10 & -2139062144 ^ -2139062144) & $10 + -16843009)) {
    $$0 = $$0 + 4 | 0; //@line 7676
   } else {
    break;
   }
  }
  if (!(($10 & 255) << 24 >> 24)) {
   $$1$lcssa = $$0; //@line 7684
  } else {
   $$pn = $$0; //@line 7686
   while (1) {
    $19 = $$pn + 1 | 0; //@line 7688
    if (!(HEAP8[$19 >> 0] | 0)) {
     $$1$lcssa = $19; //@line 7692
     break;
    } else {
     $$pn = $19; //@line 7695
    }
   }
  }
  $$sink = $$1$lcssa; //@line 7700
 }
 return $$sink - $1 | 0; //@line 7703
}
function __ZNK10__cxxabiv117__class_type_info29process_static_type_above_dstEPNS_19__dynamic_cast_infoEPKvS4_i($0, $1, $2, $3, $4) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 var $10 = 0, $11 = 0, $21 = 0, $22 = 0, $28 = 0, $30 = 0;
 HEAP8[$1 + 53 >> 0] = 1; //@line 12789
 do {
  if ((HEAP32[$1 + 4 >> 2] | 0) == ($3 | 0)) {
   HEAP8[$1 + 52 >> 0] = 1; //@line 12796
   $10 = $1 + 16 | 0; //@line 12797
   $11 = HEAP32[$10 >> 2] | 0; //@line 12798
   if (!$11) {
    HEAP32[$10 >> 2] = $2; //@line 12801
    HEAP32[$1 + 24 >> 2] = $4; //@line 12803
    HEAP32[$1 + 36 >> 2] = 1; //@line 12805
    if (!(($4 | 0) == 1 ? (HEAP32[$1 + 48 >> 2] | 0) == 1 : 0)) {
     break;
    }
    HEAP8[$1 + 54 >> 0] = 1; //@line 12815
    break;
   }
   if (($11 | 0) != ($2 | 0)) {
    $30 = $1 + 36 | 0; //@line 12820
    HEAP32[$30 >> 2] = (HEAP32[$30 >> 2] | 0) + 1; //@line 12823
    HEAP8[$1 + 54 >> 0] = 1; //@line 12825
    break;
   }
   $21 = $1 + 24 | 0; //@line 12828
   $22 = HEAP32[$21 >> 2] | 0; //@line 12829
   if (($22 | 0) == 2) {
    HEAP32[$21 >> 2] = $4; //@line 12832
    $28 = $4; //@line 12833
   } else {
    $28 = $22; //@line 12835
   }
   if (($28 | 0) == 1 ? (HEAP32[$1 + 48 >> 2] | 0) == 1 : 0) {
    HEAP8[$1 + 54 >> 0] = 1; //@line 12844
   }
  }
 } while (0);
 return;
}
function __ZN15GraphicsDisplay4putpEi($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $10 = 0, $15 = 0, $22 = 0, $4 = 0, $5 = 0, $7 = 0, $8 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 1182
 $4 = HEAP32[(HEAP32[$0 >> 2] | 0) + 120 >> 2] | 0; //@line 1185
 $5 = $0 + 36 | 0; //@line 1186
 $7 = HEAP16[$5 >> 1] | 0; //@line 1188
 $8 = $0 + 38 | 0; //@line 1189
 $10 = HEAP16[$8 >> 1] | 0; //@line 1191
 $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 1192
 FUNCTION_TABLE_viiii[$4 & 7]($0, $7, $10, $1); //@line 1193
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 56; //@line 1196
  HEAP32[$AsyncCtx + 4 >> 2] = $5; //@line 1198
  HEAP32[$AsyncCtx + 8 >> 2] = $0; //@line 1200
  HEAP32[$AsyncCtx + 12 >> 2] = $8; //@line 1202
  sp = STACKTOP; //@line 1203
  return;
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 1206
 $15 = (HEAP16[$5 >> 1] | 0) + 1 << 16 >> 16; //@line 1208
 HEAP16[$5 >> 1] = $15; //@line 1209
 if ($15 << 16 >> 16 <= (HEAP16[$0 + 42 >> 1] | 0)) {
  return;
 }
 HEAP16[$5 >> 1] = HEAP16[$0 + 40 >> 1] | 0; //@line 1218
 $22 = (HEAP16[$8 >> 1] | 0) + 1 << 16 >> 16; //@line 1220
 HEAP16[$8 >> 1] = $22; //@line 1221
 if ($22 << 16 >> 16 <= (HEAP16[$0 + 46 >> 1] | 0)) {
  return;
 }
 HEAP16[$8 >> 1] = HEAP16[$0 + 44 >> 1] | 0; //@line 1230
 return;
}
function _puts($0) {
 $0 = $0 | 0;
 var $1 = 0, $11 = 0, $12 = 0, $17 = 0, $19 = 0, $22 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 12224
 $1 = HEAP32[303] | 0; //@line 12225
 if ((HEAP32[$1 + 76 >> 2] | 0) > -1) {
  $19 = ___lockfile($1) | 0; //@line 12231
 } else {
  $19 = 0; //@line 12233
 }
 do {
  if ((_fputs($0, $1) | 0) < 0) {
   $22 = -1; //@line 12239
  } else {
   if ((HEAP8[$1 + 75 >> 0] | 0) != 10) {
    $11 = $1 + 20 | 0; //@line 12245
    $12 = HEAP32[$11 >> 2] | 0; //@line 12246
    if ($12 >>> 0 < (HEAP32[$1 + 16 >> 2] | 0) >>> 0) {
     HEAP32[$11 >> 2] = $12 + 1; //@line 12252
     HEAP8[$12 >> 0] = 10; //@line 12253
     $22 = 0; //@line 12254
     break;
    }
   }
   $AsyncCtx = _emscripten_alloc_async_context(12, sp) | 0; //@line 12258
   $17 = ___overflow($1, 10) | 0; //@line 12259
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 175; //@line 12262
    HEAP32[$AsyncCtx + 4 >> 2] = $19; //@line 12264
    HEAP32[$AsyncCtx + 8 >> 2] = $1; //@line 12266
    sp = STACKTOP; //@line 12267
    return 0; //@line 12268
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 12270
    $22 = $17 >> 31; //@line 12272
    break;
   }
  }
 } while (0);
 if ($19 | 0) {
  ___unlockfile($1); //@line 12279
 }
 return $22 | 0; //@line 12281
}
function _main__async_cb_39($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $16 = 0, $2 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 3620
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 3622
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 3624
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 3626
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 3628
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 3630
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 3632
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 3634
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 3636
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(36) | 0; //@line 3637
 _puts(5755) | 0; //@line 3638
 if (!___async) {
  ___async_unwind = 0; //@line 3641
 }
 HEAP32[$ReallocAsyncCtx2 >> 2] = 142; //@line 3643
 HEAP32[$ReallocAsyncCtx2 + 4 >> 2] = $2; //@line 3645
 HEAP32[$ReallocAsyncCtx2 + 8 >> 2] = $4; //@line 3647
 HEAP32[$ReallocAsyncCtx2 + 12 >> 2] = $6; //@line 3649
 HEAP32[$ReallocAsyncCtx2 + 16 >> 2] = $8; //@line 3651
 HEAP32[$ReallocAsyncCtx2 + 20 >> 2] = $10; //@line 3653
 HEAP32[$ReallocAsyncCtx2 + 24 >> 2] = $12; //@line 3655
 HEAP32[$ReallocAsyncCtx2 + 28 >> 2] = $14; //@line 3657
 HEAP32[$ReallocAsyncCtx2 + 32 >> 2] = $16; //@line 3659
 sp = STACKTOP; //@line 3660
 return;
}
function __ZNK10__cxxabiv121__vmi_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb_87($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 6170
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 6176
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 6178
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 6180
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 6182
 if ((HEAP32[$0 + 4 >> 2] | 0) <= 1) {
  return;
 }
 $14 = (HEAP32[$0 + 8 >> 2] | 0) + 24 | 0; //@line 6187
 $ReallocAsyncCtx = _emscripten_realloc_async_context(28) | 0; //@line 6189
 __ZNK10__cxxabiv122__base_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($14, $6, $8, $10); //@line 6190
 if (!___async) {
  ___async_unwind = 0; //@line 6193
 }
 HEAP32[$ReallocAsyncCtx >> 2] = 200; //@line 6195
 HEAP32[$ReallocAsyncCtx + 4 >> 2] = $6 + 54; //@line 6197
 HEAP32[$ReallocAsyncCtx + 8 >> 2] = $14; //@line 6199
 HEAP32[$ReallocAsyncCtx + 12 >> 2] = $12; //@line 6201
 HEAP32[$ReallocAsyncCtx + 16 >> 2] = $6; //@line 6203
 HEAP32[$ReallocAsyncCtx + 20 >> 2] = $8; //@line 6205
 HEAP32[$ReallocAsyncCtx + 24 >> 2] = $10; //@line 6207
 sp = STACKTOP; //@line 6208
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
   __ZNK10__cxxabiv117__class_type_info29process_static_type_below_dstEPNS_19__dynamic_cast_infoEPKvi(0, $1, $2, $3); //@line 12648
  } else {
   if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 >> 2] | 0, $4) | 0) {
    if ((HEAP32[$1 + 16 >> 2] | 0) != ($2 | 0)) {
     $13 = $1 + 20 | 0; //@line 12657
     if ((HEAP32[$13 >> 2] | 0) != ($2 | 0)) {
      HEAP32[$1 + 32 >> 2] = $3; //@line 12662
      HEAP32[$13 >> 2] = $2; //@line 12663
      $19 = $1 + 40 | 0; //@line 12664
      HEAP32[$19 >> 2] = (HEAP32[$19 >> 2] | 0) + 1; //@line 12667
      if ((HEAP32[$1 + 36 >> 2] | 0) == 1) {
       if ((HEAP32[$1 + 24 >> 2] | 0) == 2) {
        HEAP8[$1 + 54 >> 0] = 1; //@line 12677
       }
      }
      HEAP32[$1 + 44 >> 2] = 4; //@line 12681
      break;
     }
    }
    if (($3 | 0) == 1) {
     HEAP32[$1 + 32 >> 2] = 1; //@line 12688
    }
   }
  }
 } while (0);
 return;
}
function __ZN11TextDisplay5_putcEi__async_cb_25($0) {
 $0 = $0 | 0;
 var $10 = 0, $14 = 0, $15 = 0, $2 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 2625
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 2627
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 2629
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 2631
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 2633
 $10 = (HEAP16[$2 >> 1] | 0) + 1 << 16 >> 16; //@line 2635
 HEAP16[$2 >> 1] = $10; //@line 2636
 $14 = HEAP32[(HEAP32[$4 >> 2] | 0) + 96 >> 2] | 0; //@line 2640
 $ReallocAsyncCtx3 = _emscripten_realloc_async_context(28) | 0; //@line 2641
 $15 = FUNCTION_TABLE_ii[$14 & 31]($4) | 0; //@line 2642
 if (!___async) {
  HEAP32[___async_retval >> 2] = $15; //@line 2646
  ___async_unwind = 0; //@line 2647
 }
 HEAP32[$ReallocAsyncCtx3 >> 2] = 68; //@line 2649
 HEAP32[$ReallocAsyncCtx3 + 4 >> 2] = $10 & 65535; //@line 2651
 HEAP32[$ReallocAsyncCtx3 + 8 >> 2] = $6; //@line 2653
 HEAP32[$ReallocAsyncCtx3 + 12 >> 2] = $2; //@line 2655
 HEAP32[$ReallocAsyncCtx3 + 16 >> 2] = $8; //@line 2657
 HEAP32[$ReallocAsyncCtx3 + 20 >> 2] = $4; //@line 2659
 HEAP32[$ReallocAsyncCtx3 + 24 >> 2] = $4; //@line 2661
 sp = STACKTOP; //@line 2662
 return;
}
function ___strerror_l($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$012$lcssa = 0, $$01214 = 0, $$016 = 0, $$113 = 0, $$115 = 0, $7 = 0, label = 0, $$113$looptemp = 0;
 $$016 = 0; //@line 11625
 while (1) {
  if ((HEAPU8[6369 + $$016 >> 0] | 0) == ($0 | 0)) {
   label = 2; //@line 11632
   break;
  }
  $7 = $$016 + 1 | 0; //@line 11635
  if (($7 | 0) == 87) {
   $$01214 = 6457; //@line 11638
   $$115 = 87; //@line 11638
   label = 5; //@line 11639
   break;
  } else {
   $$016 = $7; //@line 11642
  }
 }
 if ((label | 0) == 2) {
  if (!$$016) {
   $$012$lcssa = 6457; //@line 11648
  } else {
   $$01214 = 6457; //@line 11650
   $$115 = $$016; //@line 11650
   label = 5; //@line 11651
  }
 }
 if ((label | 0) == 5) {
  while (1) {
   label = 0; //@line 11656
   $$113 = $$01214; //@line 11657
   do {
    $$113$looptemp = $$113;
    $$113 = $$113 + 1 | 0; //@line 11661
   } while ((HEAP8[$$113$looptemp >> 0] | 0) != 0);
   $$115 = $$115 + -1 | 0; //@line 11668
   if (!$$115) {
    $$012$lcssa = $$113; //@line 11671
    break;
   } else {
    $$01214 = $$113; //@line 11674
    label = 5; //@line 11675
   }
  }
 }
 return ___lctrans($$012$lcssa, HEAP32[$1 + 20 >> 2] | 0) | 0; //@line 11682
}
function __ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb($0) {
 $0 = $0 | 0;
 var $$037$off038 = 0, $$037$off039 = 0, $12 = 0, $17 = 0, $4 = 0, $6 = 0, $8 = 0, label = 0;
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 5957
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 5959
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 5961
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 5965
 if (!(HEAP8[HEAP32[$0 + 4 >> 2] >> 0] | 0)) {
  $$037$off038 = 4; //@line 5969
  label = 4; //@line 5970
 } else {
  if (!(HEAP8[HEAP32[$0 + 20 >> 2] >> 0] | 0)) {
   $$037$off038 = 3; //@line 5975
   label = 4; //@line 5976
  } else {
   $$037$off039 = 3; //@line 5978
  }
 }
 if ((label | 0) == 4) {
  HEAP32[$6 >> 2] = $4; //@line 5982
  $17 = $8 + 40 | 0; //@line 5983
  HEAP32[$17 >> 2] = (HEAP32[$17 >> 2] | 0) + 1; //@line 5986
  if ((HEAP32[$8 + 36 >> 2] | 0) == 1) {
   if ((HEAP32[$8 + 24 >> 2] | 0) == 2) {
    HEAP8[$8 + 54 >> 0] = 1; //@line 5996
    $$037$off039 = $$037$off038; //@line 5997
   } else {
    $$037$off039 = $$037$off038; //@line 5999
   }
  } else {
   $$037$off039 = $$037$off038; //@line 6002
  }
 }
 HEAP32[$12 >> 2] = $$037$off039; //@line 6005
 return;
}
function __ZL25default_terminate_handlerv__async_cb($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $15 = 0, $16 = 0, $2 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 633
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 635
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 637
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 639
 $8 = HEAP32[$0 + 20 >> 2] | 0; //@line 641
 $10 = HEAP32[$0 + 24 >> 2] | 0; //@line 643
 if (!(HEAP8[___async_retval >> 0] & 1)) {
  HEAP32[$4 >> 2] = 8397; //@line 648
  HEAP32[$4 + 4 >> 2] = $6; //@line 650
  _abort_message(8306, $4); //@line 651
 }
 $12 = HEAP32[$2 >> 2] | 0; //@line 654
 $15 = HEAP32[(HEAP32[$12 >> 2] | 0) + 8 >> 2] | 0; //@line 657
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(16) | 0; //@line 658
 $16 = FUNCTION_TABLE_ii[$15 & 31]($12) | 0; //@line 659
 if (!___async) {
  HEAP32[___async_retval >> 2] = $16; //@line 663
  ___async_unwind = 0; //@line 664
 }
 HEAP32[$ReallocAsyncCtx2 >> 2] = 179; //@line 666
 HEAP32[$ReallocAsyncCtx2 + 4 >> 2] = $8; //@line 668
 HEAP32[$ReallocAsyncCtx2 + 8 >> 2] = $6; //@line 670
 HEAP32[$ReallocAsyncCtx2 + 12 >> 2] = $10; //@line 672
 sp = STACKTOP; //@line 673
 return;
}
function __ZN4mbed6Stream4putcEi__async_cb_6($0) {
 $0 = $0 | 0;
 var $10 = 0, $11 = 0, $12 = 0, $2 = 0, $4 = 0, $6 = 0, $9 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 14506
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 14508
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 14510
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 14512
 $9 = HEAP32[(HEAP32[$2 >> 2] | 0) + 68 >> 2] | 0; //@line 14515
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(12) | 0; //@line 14516
 $10 = FUNCTION_TABLE_iii[$9 & 7]($2, $4) | 0; //@line 14517
 if (___async) {
  HEAP32[$ReallocAsyncCtx2 >> 2] = 108; //@line 14520
  $11 = $ReallocAsyncCtx2 + 4 | 0; //@line 14521
  HEAP32[$11 >> 2] = $6; //@line 14522
  $12 = $ReallocAsyncCtx2 + 8 | 0; //@line 14523
  HEAP32[$12 >> 2] = $2; //@line 14524
  sp = STACKTOP; //@line 14525
  return;
 }
 HEAP32[___async_retval >> 2] = $10; //@line 14529
 ___async_unwind = 0; //@line 14530
 HEAP32[$ReallocAsyncCtx2 >> 2] = 108; //@line 14531
 $11 = $ReallocAsyncCtx2 + 4 | 0; //@line 14532
 HEAP32[$11 >> 2] = $6; //@line 14533
 $12 = $ReallocAsyncCtx2 + 8 | 0; //@line 14534
 HEAP32[$12 >> 2] = $2; //@line 14535
 sp = STACKTOP; //@line 14536
 return;
}
function __ZN11TextDisplay3clsEv__async_cb_93($0) {
 $0 = $0 | 0;
 var $12 = 0, $13 = 0, $2 = 0, $4 = 0, $6 = 0, $8 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx5 = 0, sp = 0;
 sp = STACKTOP; //@line 6513
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 6515
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 6517
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 6519
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 6521
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 6523
 $12 = HEAP32[(HEAP32[$2 >> 2] | 0) + 92 >> 2] | 0; //@line 6526
 $ReallocAsyncCtx5 = _emscripten_realloc_async_context(24) | 0; //@line 6527
 $13 = FUNCTION_TABLE_ii[$12 & 31]($4) | 0; //@line 6528
 if (!___async) {
  HEAP32[___async_retval >> 2] = $13; //@line 6532
  ___async_unwind = 0; //@line 6533
 }
 HEAP32[$ReallocAsyncCtx5 >> 2] = 77; //@line 6535
 HEAP32[$ReallocAsyncCtx5 + 4 >> 2] = $AsyncRetVal; //@line 6537
 HEAP32[$ReallocAsyncCtx5 + 8 >> 2] = $6; //@line 6539
 HEAP32[$ReallocAsyncCtx5 + 12 >> 2] = $8; //@line 6541
 HEAP32[$ReallocAsyncCtx5 + 16 >> 2] = $2; //@line 6543
 HEAP32[$ReallocAsyncCtx5 + 20 >> 2] = $4; //@line 6545
 sp = STACKTOP; //@line 6546
 return;
}
function _invoke_ticker($0) {
 $0 = $0 | 0;
 var $2 = 0, $3 = 0, $7 = 0, $8 = 0, $AsyncCtx = 0, $AsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 3399
 $2 = $0 + 12 | 0; //@line 3401
 $3 = HEAP32[$2 >> 2] | 0; //@line 3402
 do {
  if (!$3) {
   $AsyncCtx2 = _emscripten_alloc_async_context(12, sp) | 0; //@line 3406
   _mbed_assert_internal(5146, 5151, 528); //@line 3407
   if (___async) {
    HEAP32[$AsyncCtx2 >> 2] = 132; //@line 3410
    HEAP32[$AsyncCtx2 + 4 >> 2] = $2; //@line 3412
    HEAP32[$AsyncCtx2 + 8 >> 2] = $0; //@line 3414
    sp = STACKTOP; //@line 3415
    return;
   } else {
    _emscripten_free_async_context($AsyncCtx2 | 0); //@line 3418
    $8 = HEAP32[$2 >> 2] | 0; //@line 3420
    break;
   }
  } else {
   $8 = $3; //@line 3424
  }
 } while (0);
 $7 = HEAP32[$8 >> 2] | 0; //@line 3427
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 3429
 FUNCTION_TABLE_vi[$7 & 255]($0); //@line 3430
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 133; //@line 3433
  sp = STACKTOP; //@line 3434
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 3437
  return;
 }
}
function __ZN4mbed6Stream6printfEPKcz__async_cb($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $13 = 0, $2 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx5 = 0, sp = 0;
 sp = STACKTOP; //@line 3202
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 3204
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 3208
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 3210
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 3212
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 3214
 HEAP32[$2 >> 2] = HEAP32[$0 + 8 >> 2]; //@line 3215
 _memset($6 | 0, 0, 4096) | 0; //@line 3216
 $ReallocAsyncCtx5 = _emscripten_realloc_async_context(24) | 0; //@line 3217
 $13 = _vsprintf($6, $8, $2) | 0; //@line 3218
 if (!___async) {
  HEAP32[___async_retval >> 2] = $13; //@line 3222
  ___async_unwind = 0; //@line 3223
 }
 HEAP32[$ReallocAsyncCtx5 >> 2] = 111; //@line 3225
 HEAP32[$ReallocAsyncCtx5 + 4 >> 2] = $10; //@line 3227
 HEAP32[$ReallocAsyncCtx5 + 8 >> 2] = $12; //@line 3229
 HEAP32[$ReallocAsyncCtx5 + 12 >> 2] = $6; //@line 3231
 HEAP32[$ReallocAsyncCtx5 + 16 >> 2] = $2; //@line 3233
 HEAP32[$ReallocAsyncCtx5 + 20 >> 2] = $6; //@line 3235
 sp = STACKTOP; //@line 3236
 return;
}
function __ZN15GraphicsDisplay4fillEiiiii__async_cb_81($0) {
 $0 = $0 | 0;
 var $10 = 0, $13 = 0, $15 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 5730
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 5734
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 5736
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 5738
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 5740
 $15 = (HEAP32[$0 + 4 >> 2] | 0) + 1 | 0; //@line 5741
 if (($15 | 0) == ($4 | 0)) {
  return;
 }
 $13 = HEAP32[(HEAP32[$6 >> 2] | 0) + 136 >> 2] | 0; //@line 5748
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(24) | 0; //@line 5749
 FUNCTION_TABLE_vii[$13 & 7]($8, $10); //@line 5750
 if (!___async) {
  ___async_unwind = 0; //@line 5753
 }
 HEAP32[$ReallocAsyncCtx2 >> 2] = 58; //@line 5755
 HEAP32[$ReallocAsyncCtx2 + 4 >> 2] = $15; //@line 5757
 HEAP32[$ReallocAsyncCtx2 + 8 >> 2] = $4; //@line 5759
 HEAP32[$ReallocAsyncCtx2 + 12 >> 2] = $6; //@line 5761
 HEAP32[$ReallocAsyncCtx2 + 16 >> 2] = $8; //@line 5763
 HEAP32[$ReallocAsyncCtx2 + 20 >> 2] = $10; //@line 5765
 sp = STACKTOP; //@line 5766
 return;
}
function _frexp($0, $1) {
 $0 = +$0;
 $1 = $1 | 0;
 var $$0 = 0.0, $$016 = 0.0, $2 = 0, $3 = 0, $4 = 0, $9 = 0.0, $storemerge = 0;
 HEAPF64[tempDoublePtr >> 3] = $0; //@line 11456
 $2 = HEAP32[tempDoublePtr >> 2] | 0; //@line 11456
 $3 = HEAP32[tempDoublePtr + 4 >> 2] | 0; //@line 11457
 $4 = _bitshift64Lshr($2 | 0, $3 | 0, 52) | 0; //@line 11458
 switch ($4 & 2047) {
 case 0:
  {
   if ($0 != 0.0) {
    $9 = +_frexp($0 * 18446744073709552000.0, $1); //@line 11467
    $$016 = $9; //@line 11470
    $storemerge = (HEAP32[$1 >> 2] | 0) + -64 | 0; //@line 11470
   } else {
    $$016 = $0; //@line 11472
    $storemerge = 0; //@line 11472
   }
   HEAP32[$1 >> 2] = $storemerge; //@line 11474
   $$0 = $$016; //@line 11475
   break;
  }
 case 2047:
  {
   $$0 = $0; //@line 11479
   break;
  }
 default:
  {
   HEAP32[$1 >> 2] = ($4 & 2047) + -1022; //@line 11485
   HEAP32[tempDoublePtr >> 2] = $2; //@line 11488
   HEAP32[tempDoublePtr + 4 >> 2] = $3 & -2146435073 | 1071644672; //@line 11488
   $$0 = +HEAPF64[tempDoublePtr >> 3]; //@line 11489
  }
 }
 return +$$0;
}
function __ZN15GraphicsDisplay4blitEiiiiPKi__async_cb($0) {
 $0 = $0 | 0;
 var $13 = 0, $14 = 0, $6 = 0, $8 = 0, $9 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 4810
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 4816
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 4818
 $9 = Math_imul(HEAP32[$0 + 4 >> 2] | 0, HEAP32[$0 + 8 >> 2] | 0) | 0; //@line 4819
 if (($9 | 0) <= 0) {
  return;
 }
 $13 = HEAP32[(HEAP32[$6 >> 2] | 0) + 136 >> 2] | 0; //@line 4826
 $14 = HEAP32[$8 >> 2] | 0; //@line 4827
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(24) | 0; //@line 4828
 FUNCTION_TABLE_vii[$13 & 7]($6, $14); //@line 4829
 if (!___async) {
  ___async_unwind = 0; //@line 4832
 }
 HEAP32[$ReallocAsyncCtx2 >> 2] = 60; //@line 4834
 HEAP32[$ReallocAsyncCtx2 + 4 >> 2] = 0; //@line 4836
 HEAP32[$ReallocAsyncCtx2 + 8 >> 2] = $9; //@line 4838
 HEAP32[$ReallocAsyncCtx2 + 12 >> 2] = $6; //@line 4840
 HEAP32[$ReallocAsyncCtx2 + 16 >> 2] = $8; //@line 4842
 HEAP32[$ReallocAsyncCtx2 + 20 >> 2] = $6; //@line 4844
 sp = STACKTOP; //@line 4845
 return;
}
function __ZN15GraphicsDisplayC2EPKc($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $7 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 1509
 $AsyncCtx3 = _emscripten_alloc_async_context(12, sp) | 0; //@line 1510
 __ZN11TextDisplayC2EPKc($0, $1); //@line 1511
 if (___async) {
  HEAP32[$AsyncCtx3 >> 2] = 64; //@line 1514
  HEAP32[$AsyncCtx3 + 4 >> 2] = $0; //@line 1516
  HEAP32[$AsyncCtx3 + 8 >> 2] = $0; //@line 1518
  sp = STACKTOP; //@line 1519
  return;
 }
 _emscripten_free_async_context($AsyncCtx3 | 0); //@line 1522
 HEAP32[$0 >> 2] = 504; //@line 1523
 HEAP32[$0 + 4 >> 2] = 664; //@line 1525
 __ZN11TextDisplay10foregroundEt($0, -1); //@line 1526
 $7 = HEAP32[(HEAP32[$0 >> 2] | 0) + 116 >> 2] | 0; //@line 1529
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 1530
 FUNCTION_TABLE_vii[$7 & 7]($0, 0); //@line 1531
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 65; //@line 1534
  sp = STACKTOP; //@line 1535
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 1538
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
 sp = STACKTOP; //@line 13004
 do {
  if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, $5) | 0) {
   __ZNK10__cxxabiv117__class_type_info29process_static_type_above_dstEPNS_19__dynamic_cast_infoEPKvS4_i(0, $1, $2, $3, $4); //@line 13010
  } else {
   $10 = HEAP32[$0 + 8 >> 2] | 0; //@line 13013
   $13 = HEAP32[(HEAP32[$10 >> 2] | 0) + 20 >> 2] | 0; //@line 13016
   $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 13017
   FUNCTION_TABLE_viiiiii[$13 & 7]($10, $1, $2, $3, $4, $5); //@line 13018
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 186; //@line 13021
    sp = STACKTOP; //@line 13022
    return;
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 13025
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
 sp = STACKTOP; //@line 12481
 STACKTOP = STACKTOP + 16 | 0; //@line 12482
 $1 = sp; //@line 12483
 HEAP32[$1 >> 2] = $varargs; //@line 12484
 $2 = HEAP32[271] | 0; //@line 12485
 $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 12486
 _vfprintf($2, $0, $1) | 0; //@line 12487
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 180; //@line 12490
  HEAP32[$AsyncCtx + 4 >> 2] = $2; //@line 12492
  sp = STACKTOP; //@line 12493
  STACKTOP = sp; //@line 12494
  return;
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 12496
 $AsyncCtx2 = _emscripten_alloc_async_context(4, sp) | 0; //@line 12497
 _fputc(10, $2) | 0; //@line 12498
 if (___async) {
  HEAP32[$AsyncCtx2 >> 2] = 181; //@line 12501
  sp = STACKTOP; //@line 12502
  STACKTOP = sp; //@line 12503
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx2 | 0); //@line 12505
  _abort(); //@line 12506
 }
}
function _vfprintf__async_cb($0) {
 $0 = $0 | 0;
 var $$ = 0, $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $2 = 0, $20 = 0, $22 = 0, $33 = 0;
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 5887
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 5895
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 5897
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 5899
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 5901
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 5903
 $20 = HEAP32[$0 + 40 >> 2] | 0; //@line 5905
 $22 = HEAP32[$0 + 44 >> 2] | 0; //@line 5907
 $$ = (HEAP32[$2 >> 2] | 0) == 0 ? -1 : HEAP32[$0 + 8 >> 2] | 0; //@line 5918
 HEAP32[HEAP32[$0 + 16 >> 2] >> 2] = HEAP32[$0 + 12 >> 2]; //@line 5919
 HEAP32[$10 >> 2] = 0; //@line 5920
 HEAP32[$12 >> 2] = 0; //@line 5921
 HEAP32[$14 >> 2] = 0; //@line 5922
 HEAP32[$2 >> 2] = 0; //@line 5923
 $33 = HEAP32[$16 >> 2] | 0; //@line 5924
 HEAP32[$16 >> 2] = $33 | $18; //@line 5929
 if ($20 | 0) {
  ___unlockfile($22); //@line 5932
 }
 HEAP32[___async_retval >> 2] = ($33 & 32 | 0) == 0 ? $$ : -1; //@line 5935
 return;
}
function __ZN11TextDisplay3clsEv__async_cb($0) {
 $0 = $0 | 0;
 var $2 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 6414
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 6416
 $5 = HEAP32[(HEAP32[$2 >> 2] | 0) + 96 >> 2] | 0; //@line 6419
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(12) | 0; //@line 6420
 $6 = FUNCTION_TABLE_ii[$5 & 31]($2) | 0; //@line 6421
 if (___async) {
  HEAP32[$ReallocAsyncCtx2 >> 2] = 73; //@line 6424
  $7 = $ReallocAsyncCtx2 + 4 | 0; //@line 6425
  HEAP32[$7 >> 2] = $2; //@line 6426
  $8 = $ReallocAsyncCtx2 + 8 | 0; //@line 6427
  HEAP32[$8 >> 2] = $2; //@line 6428
  sp = STACKTOP; //@line 6429
  return;
 }
 HEAP32[___async_retval >> 2] = $6; //@line 6433
 ___async_unwind = 0; //@line 6434
 HEAP32[$ReallocAsyncCtx2 >> 2] = 73; //@line 6435
 $7 = $ReallocAsyncCtx2 + 4 | 0; //@line 6436
 HEAP32[$7 >> 2] = $2; //@line 6437
 $8 = $ReallocAsyncCtx2 + 8 | 0; //@line 6438
 HEAP32[$8 >> 2] = $2; //@line 6439
 sp = STACKTOP; //@line 6440
 return;
}
function __ZN11TextDisplay5claimEP8_IO_FILE__async_cb_55($0) {
 $0 = $0 | 0;
 var $10 = 0, $2 = 0, $5 = 0, $8 = 0, $9 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 4596
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 4598
 if (!(HEAP32[___async_retval >> 2] | 0)) {
  HEAP8[___async_retval >> 0] = 0; //@line 4605
  return;
 }
 $5 = HEAP32[303] | 0; //@line 4608
 $8 = HEAP32[(HEAP32[$2 >> 2] | 0) + 96 >> 2] | 0; //@line 4611
 $ReallocAsyncCtx = _emscripten_realloc_async_context(8) | 0; //@line 4612
 $9 = FUNCTION_TABLE_ii[$8 & 31]($2) | 0; //@line 4613
 if (___async) {
  HEAP32[$ReallocAsyncCtx >> 2] = 71; //@line 4616
  $10 = $ReallocAsyncCtx + 4 | 0; //@line 4617
  HEAP32[$10 >> 2] = $5; //@line 4618
  sp = STACKTOP; //@line 4619
  return;
 }
 HEAP32[___async_retval >> 2] = $9; //@line 4623
 ___async_unwind = 0; //@line 4624
 HEAP32[$ReallocAsyncCtx >> 2] = 71; //@line 4625
 $10 = $ReallocAsyncCtx + 4 | 0; //@line 4626
 HEAP32[$10 >> 2] = $5; //@line 4627
 sp = STACKTOP; //@line 4628
 return;
}
function __ZN15GraphicsDisplay4fillEiiiii__async_cb($0) {
 $0 = $0 | 0;
 var $13 = 0, $6 = 0, $8 = 0, $9 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 5689
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 5695
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 5697
 $9 = Math_imul(HEAP32[$0 + 4 >> 2] | 0, HEAP32[$0 + 8 >> 2] | 0) | 0; //@line 5698
 if (($9 | 0) <= 0) {
  return;
 }
 $13 = HEAP32[(HEAP32[$6 >> 2] | 0) + 136 >> 2] | 0; //@line 5705
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(24) | 0; //@line 5706
 FUNCTION_TABLE_vii[$13 & 7]($6, $8); //@line 5707
 if (!___async) {
  ___async_unwind = 0; //@line 5710
 }
 HEAP32[$ReallocAsyncCtx2 >> 2] = 58; //@line 5712
 HEAP32[$ReallocAsyncCtx2 + 4 >> 2] = 0; //@line 5714
 HEAP32[$ReallocAsyncCtx2 + 8 >> 2] = $9; //@line 5716
 HEAP32[$ReallocAsyncCtx2 + 12 >> 2] = $6; //@line 5718
 HEAP32[$ReallocAsyncCtx2 + 16 >> 2] = $6; //@line 5720
 HEAP32[$ReallocAsyncCtx2 + 20 >> 2] = $8; //@line 5722
 sp = STACKTOP; //@line 5723
 return;
}
function __ZN11TextDisplay3clsEv__async_cb_95($0) {
 $0 = $0 | 0;
 var $12 = 0, $13 = 0, $4 = 0, $6 = 0, $8 = 0, $9 = 0, $ReallocAsyncCtx4 = 0, sp = 0;
 sp = STACKTOP; //@line 6593
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 6597
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 6599
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 6601
 $9 = (HEAP32[$0 + 4 >> 2] | 0) + 1 | 0; //@line 6602
 $12 = HEAP32[(HEAP32[$4 >> 2] | 0) + 96 >> 2] | 0; //@line 6605
 $ReallocAsyncCtx4 = _emscripten_realloc_async_context(20) | 0; //@line 6606
 $13 = FUNCTION_TABLE_ii[$12 & 31]($6) | 0; //@line 6607
 if (!___async) {
  HEAP32[___async_retval >> 2] = $13; //@line 6611
  ___async_unwind = 0; //@line 6612
 }
 HEAP32[$ReallocAsyncCtx4 >> 2] = 76; //@line 6614
 HEAP32[$ReallocAsyncCtx4 + 4 >> 2] = $4; //@line 6616
 HEAP32[$ReallocAsyncCtx4 + 8 >> 2] = $6; //@line 6618
 HEAP32[$ReallocAsyncCtx4 + 12 >> 2] = $9; //@line 6620
 HEAP32[$ReallocAsyncCtx4 + 16 >> 2] = $8; //@line 6622
 sp = STACKTOP; //@line 6623
 return;
}
function __ZN4mbed10FileHandle4sizeEv__async_cb_85($0) {
 $0 = $0 | 0;
 var $10 = 0, $11 = 0, $4 = 0, $6 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 6079
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 6083
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 6085
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 6087
 $10 = HEAP32[(HEAP32[HEAP32[$0 + 4 >> 2] >> 2] | 0) + 16 >> 2] | 0; //@line 6090
 $ReallocAsyncCtx3 = _emscripten_realloc_async_context(8) | 0; //@line 6091
 FUNCTION_TABLE_iiii[$10 & 15]($4, $6, 0) | 0; //@line 6092
 if (___async) {
  HEAP32[$ReallocAsyncCtx3 >> 2] = 93; //@line 6095
  $11 = $ReallocAsyncCtx3 + 4 | 0; //@line 6096
  HEAP32[$11 >> 2] = $AsyncRetVal; //@line 6097
  sp = STACKTOP; //@line 6098
  return;
 }
 ___async_unwind = 0; //@line 6101
 HEAP32[$ReallocAsyncCtx3 >> 2] = 93; //@line 6102
 $11 = $ReallocAsyncCtx3 + 4 | 0; //@line 6103
 HEAP32[$11 >> 2] = $AsyncRetVal; //@line 6104
 sp = STACKTOP; //@line 6105
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
 sp = STACKTOP; //@line 14003
 $7 = HEAP32[$0 + 4 >> 2] | 0; //@line 14005
 $8 = $7 >> 8; //@line 14006
 if (!($7 & 1)) {
  $$0 = $8; //@line 14010
 } else {
  $$0 = HEAP32[(HEAP32[$3 >> 2] | 0) + $8 >> 2] | 0; //@line 14015
 }
 $14 = HEAP32[$0 >> 2] | 0; //@line 14017
 $17 = HEAP32[(HEAP32[$14 >> 2] | 0) + 20 >> 2] | 0; //@line 14020
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 14025
 FUNCTION_TABLE_viiiiii[$17 & 7]($14, $1, $2, $3 + $$0 | 0, $7 & 2 | 0 ? $4 : 2, $5); //@line 14026
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 202; //@line 14029
  sp = STACKTOP; //@line 14030
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 14033
  return;
 }
}
function ___cxa_can_catch($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $3 = 0, $7 = 0, $8 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 14093
 STACKTOP = STACKTOP + 16 | 0; //@line 14094
 $3 = sp; //@line 14095
 HEAP32[$3 >> 2] = HEAP32[$2 >> 2]; //@line 14097
 $7 = HEAP32[(HEAP32[$0 >> 2] | 0) + 16 >> 2] | 0; //@line 14100
 $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 14101
 $8 = FUNCTION_TABLE_iiii[$7 & 15]($0, $1, $3) | 0; //@line 14102
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 204; //@line 14105
  HEAP32[$AsyncCtx + 4 >> 2] = $3; //@line 14107
  HEAP32[$AsyncCtx + 8 >> 2] = $2; //@line 14109
  HEAP32[$AsyncCtx + 12 >> 2] = $3; //@line 14111
  sp = STACKTOP; //@line 14112
  STACKTOP = sp; //@line 14113
  return 0; //@line 14113
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 14115
 if ($8) {
  HEAP32[$2 >> 2] = HEAP32[$3 >> 2]; //@line 14119
 }
 STACKTOP = sp; //@line 14121
 return $8 & 1 | 0; //@line 14121
}
function __Znwj($0) {
 $0 = $0 | 0;
 var $$ = 0, $$lcssa = 0, $2 = 0, $4 = 0, $AsyncCtx = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 12286
 $$ = ($0 | 0) == 0 ? 1 : $0; //@line 12288
 while (1) {
  $2 = _malloc($$) | 0; //@line 12290
  if ($2 | 0) {
   $$lcssa = $2; //@line 12293
   label = 7; //@line 12294
   break;
  }
  $4 = __ZSt15get_new_handlerv() | 0; //@line 12297
  if (!$4) {
   $$lcssa = 0; //@line 12300
   label = 7; //@line 12301
   break;
  }
  $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 12304
  FUNCTION_TABLE_v[$4 & 3](); //@line 12305
  if (___async) {
   label = 5; //@line 12308
   break;
  }
  _emscripten_free_async_context($AsyncCtx | 0); //@line 12311
 }
 if ((label | 0) == 5) {
  HEAP32[$AsyncCtx >> 2] = 176; //@line 12314
  HEAP32[$AsyncCtx + 4 >> 2] = $$; //@line 12316
  sp = STACKTOP; //@line 12317
  return 0; //@line 12318
 } else if ((label | 0) == 7) {
  return $$lcssa | 0; //@line 12321
 }
 return 0; //@line 12323
}
function __ZNK10__cxxabiv120__si_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $11 = 0, $8 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 13173
 do {
  if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, 0) | 0) {
   __ZNK10__cxxabiv117__class_type_info24process_found_base_classEPNS_19__dynamic_cast_infoEPvi(0, $1, $2, $3); //@line 13179
  } else {
   $8 = HEAP32[$0 + 8 >> 2] | 0; //@line 13182
   $11 = HEAP32[(HEAP32[$8 >> 2] | 0) + 28 >> 2] | 0; //@line 13185
   $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 13186
   FUNCTION_TABLE_viiii[$11 & 7]($8, $1, $2, $3); //@line 13187
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 189; //@line 13190
    sp = STACKTOP; //@line 13191
    return;
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 13194
    break;
   }
  }
 } while (0);
 return;
}
function _fclose__async_cb_28($0) {
 $0 = $0 | 0;
 var $10 = 0, $2 = 0, $4 = 0, $6 = 0, $9 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 2783
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 2785
 $4 = HEAP8[$0 + 8 >> 0] & 1; //@line 2788
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 2790
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 2792
 $9 = HEAP32[$2 + 12 >> 2] | 0; //@line 2794
 $ReallocAsyncCtx = _emscripten_realloc_async_context(20) | 0; //@line 2795
 $10 = FUNCTION_TABLE_ii[$9 & 31]($2) | 0; //@line 2796
 if (!___async) {
  HEAP32[___async_retval >> 2] = $10; //@line 2800
  ___async_unwind = 0; //@line 2801
 }
 HEAP32[$ReallocAsyncCtx >> 2] = 158; //@line 2803
 HEAP32[$ReallocAsyncCtx + 4 >> 2] = $AsyncRetVal; //@line 2805
 HEAP32[$ReallocAsyncCtx + 8 >> 2] = $2; //@line 2807
 HEAP8[$ReallocAsyncCtx + 12 >> 0] = $4 & 1; //@line 2810
 HEAP32[$ReallocAsyncCtx + 16 >> 2] = $6; //@line 2812
 sp = STACKTOP; //@line 2813
 return;
}
function __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($0, $1, $2, $3, $4) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 var $$0 = 0, $13 = 0, $16 = 0, $6 = 0, $7 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 14045
 $6 = HEAP32[$0 + 4 >> 2] | 0; //@line 14047
 $7 = $6 >> 8; //@line 14048
 if (!($6 & 1)) {
  $$0 = $7; //@line 14052
 } else {
  $$0 = HEAP32[(HEAP32[$2 >> 2] | 0) + $7 >> 2] | 0; //@line 14057
 }
 $13 = HEAP32[$0 >> 2] | 0; //@line 14059
 $16 = HEAP32[(HEAP32[$13 >> 2] | 0) + 24 >> 2] | 0; //@line 14062
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 14067
 FUNCTION_TABLE_viiiii[$16 & 7]($13, $1, $2 + $$0 | 0, $6 & 2 | 0 ? $3 : 2, $4); //@line 14068
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 203; //@line 14071
  sp = STACKTOP; //@line 14072
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 14075
  return;
 }
}
function ___dynamic_cast__async_cb_2($0) {
 $0 = $0 | 0;
 var $$0 = 0, $10 = 0, $16 = 0, $6 = 0, $8 = 0;
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 14333
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 14335
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 14337
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 14343
 L2 : do {
  switch (HEAP32[HEAP32[$0 + 4 >> 2] >> 2] | 0) {
  case 0:
   {
    $$0 = (HEAP32[$6 >> 2] | 0) == 1 & (HEAP32[$8 >> 2] | 0) == 1 & (HEAP32[$10 >> 2] | 0) == 1 ? HEAP32[HEAP32[$0 + 24 >> 2] >> 2] | 0 : 0; //@line 14358
    break;
   }
  case 1:
   {
    if ((HEAP32[HEAP32[$0 + 28 >> 2] >> 2] | 0) != 1) {
     if (!((HEAP32[$6 >> 2] | 0) == 0 & (HEAP32[$8 >> 2] | 0) == 1 & (HEAP32[$10 >> 2] | 0) == 1)) {
      $$0 = 0; //@line 14374
      break L2;
     }
    }
    $$0 = HEAP32[$16 >> 2] | 0; //@line 14379
    break;
   }
  default:
   {
    $$0 = 0; //@line 14383
   }
  }
 } while (0);
 HEAP32[___async_retval >> 2] = $$0; //@line 14388
 return;
}
function __ZThn4_N4mbed6StreamD1Ev($0) {
 $0 = $0 | 0;
 var $1 = 0, $2 = 0, $4 = 0, $AsyncCtx = 0, $AsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 2692
 $1 = $0 + -4 | 0; //@line 2693
 HEAP32[$1 >> 2] = 916; //@line 2694
 $2 = $1 + 4 | 0; //@line 2695
 HEAP32[$2 >> 2] = 1012; //@line 2696
 $4 = HEAP32[$1 + 20 >> 2] | 0; //@line 2698
 $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 2699
 _fclose($4) | 0; //@line 2700
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 102; //@line 2703
  HEAP32[$AsyncCtx + 4 >> 2] = $2; //@line 2705
  sp = STACKTOP; //@line 2706
  return;
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 2709
 $AsyncCtx2 = _emscripten_alloc_async_context(4, sp) | 0; //@line 2710
 __ZN4mbed8FileBaseD2Ev($2); //@line 2711
 if (___async) {
  HEAP32[$AsyncCtx2 >> 2] = 103; //@line 2714
  sp = STACKTOP; //@line 2715
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx2 | 0); //@line 2718
  return;
 }
}
function __ZN11TextDisplay3clsEv__async_cb_94($0) {
 $0 = $0 | 0;
 var $10 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx6 = 0, sp = 0;
 sp = STACKTOP; //@line 6553
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 6557
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 6559
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 6561
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 6563
 if (($4 | 0) >= (Math_imul(HEAP32[___async_retval >> 2] | 0, HEAP32[$0 + 4 >> 2] | 0) | 0)) {
  return;
 }
 $ReallocAsyncCtx6 = _emscripten_realloc_async_context(20) | 0; //@line 6571
 __ZN4mbed6Stream4putcEi($6, 32) | 0; //@line 6572
 if (!___async) {
  ___async_unwind = 0; //@line 6575
 }
 HEAP32[$ReallocAsyncCtx6 >> 2] = 75; //@line 6577
 HEAP32[$ReallocAsyncCtx6 + 4 >> 2] = $4; //@line 6579
 HEAP32[$ReallocAsyncCtx6 + 8 >> 2] = $8; //@line 6581
 HEAP32[$ReallocAsyncCtx6 + 12 >> 2] = $10; //@line 6583
 HEAP32[$ReallocAsyncCtx6 + 16 >> 2] = $6; //@line 6585
 sp = STACKTOP; //@line 6586
 return;
}
function __ZNK10__cxxabiv122__base_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $$0 = 0, $12 = 0, $15 = 0, $5 = 0, $6 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 13960
 $5 = HEAP32[$0 + 4 >> 2] | 0; //@line 13962
 $6 = $5 >> 8; //@line 13963
 if (!($5 & 1)) {
  $$0 = $6; //@line 13967
 } else {
  $$0 = HEAP32[(HEAP32[$2 >> 2] | 0) + $6 >> 2] | 0; //@line 13972
 }
 $12 = HEAP32[$0 >> 2] | 0; //@line 13974
 $15 = HEAP32[(HEAP32[$12 >> 2] | 0) + 28 >> 2] | 0; //@line 13977
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 13982
 FUNCTION_TABLE_viiii[$15 & 7]($12, $1, $2 + $$0 | 0, $5 & 2 | 0 ? $3 : 2); //@line 13983
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 201; //@line 13986
  sp = STACKTOP; //@line 13987
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 13990
  return;
 }
}
function __ZN4mbed17remove_filehandleEPNS_10FileHandleE__async_cb_52($0) {
 $0 = $0 | 0;
 var $2 = 0, $6 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 4412
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 4414
 if ((HEAP32[459] | 0) == ($2 | 0)) {
  HEAP32[459] = 0; //@line 4418
 }
 if ((HEAP32[460] | 0) == ($2 | 0)) {
  HEAP32[460] = 0; //@line 4423
 }
 if ((HEAP32[461] | 0) == ($2 | 0)) {
  HEAP32[461] = 0; //@line 4428
 }
 $6 = HEAP32[2213] | 0; //@line 4430
 if (!$6) {
  HEAP32[2213] = 8856; //@line 4433
  return;
 }
 if (($6 | 0) == 8856) {
  return;
 }
 $ReallocAsyncCtx = _emscripten_realloc_async_context(4) | 0; //@line 4440
 _mbed_assert_internal(5235, 5255, 93); //@line 4441
 if (___async) {
  HEAP32[$ReallocAsyncCtx >> 2] = 135; //@line 4444
  sp = STACKTOP; //@line 4445
  return;
 }
 ___async_unwind = 0; //@line 4448
 HEAP32[$ReallocAsyncCtx >> 2] = 135; //@line 4449
 sp = STACKTOP; //@line 4450
 return;
}
function __ZN4mbed6Stream4putcEi__async_cb_4($0) {
 $0 = $0 | 0;
 var $4 = 0, $8 = 0, $9 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 14466
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 14470
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 14472
 $8 = HEAP32[(HEAP32[HEAP32[$0 + 4 >> 2] >> 2] | 0) + 84 >> 2] | 0; //@line 14475
 $ReallocAsyncCtx3 = _emscripten_realloc_async_context(8) | 0; //@line 14476
 FUNCTION_TABLE_vi[$8 & 255]($4); //@line 14477
 if (___async) {
  HEAP32[$ReallocAsyncCtx3 >> 2] = 109; //@line 14480
  $9 = $ReallocAsyncCtx3 + 4 | 0; //@line 14481
  HEAP32[$9 >> 2] = $AsyncRetVal; //@line 14482
  sp = STACKTOP; //@line 14483
  return;
 }
 ___async_unwind = 0; //@line 14486
 HEAP32[$ReallocAsyncCtx3 >> 2] = 109; //@line 14487
 $9 = $ReallocAsyncCtx3 + 4 | 0; //@line 14488
 HEAP32[$9 >> 2] = $AsyncRetVal; //@line 14489
 sp = STACKTOP; //@line 14490
 return;
}
function __ZN4mbed8FileBaseC2EPKcNS_8PathTypeE__async_cb_62($0) {
 $0 = $0 | 0;
 var $4 = 0, $6 = 0, $9 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 5085
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 5089
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 5091
 if (!(HEAP32[$0 + 4 >> 2] | 0)) {
  HEAP32[$4 >> 2] = 0; //@line 5094
 } else {
  HEAP32[$4 >> 2] = HEAP32[2210]; //@line 5097
  HEAP32[2210] = $6; //@line 5098
 }
 $9 = HEAP32[2211] | 0; //@line 5100
 if (!$9) {
  HEAP32[2211] = 8848; //@line 5103
  return;
 }
 if (($9 | 0) == 8848) {
  return;
 }
 $ReallocAsyncCtx = _emscripten_realloc_async_context(4) | 0; //@line 5110
 _mbed_assert_internal(5235, 5255, 93); //@line 5111
 if (___async) {
  HEAP32[$ReallocAsyncCtx >> 2] = 88; //@line 5114
  sp = STACKTOP; //@line 5115
  return;
 }
 ___async_unwind = 0; //@line 5118
 HEAP32[$ReallocAsyncCtx >> 2] = 88; //@line 5119
 sp = STACKTOP; //@line 5120
 return;
}
function __ZN15GraphicsDisplay3clsEv__async_cb($0) {
 $0 = $0 | 0;
 var $10 = 0, $11 = 0, $4 = 0, $6 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 370
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 374
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 376
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 378
 $10 = HEAP32[(HEAP32[HEAP32[$0 + 4 >> 2] >> 2] | 0) + 128 >> 2] | 0; //@line 381
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(16) | 0; //@line 382
 $11 = FUNCTION_TABLE_ii[$10 & 31]($4) | 0; //@line 383
 if (!___async) {
  HEAP32[___async_retval >> 2] = $11; //@line 387
  ___async_unwind = 0; //@line 388
 }
 HEAP32[$ReallocAsyncCtx2 >> 2] = 54; //@line 390
 HEAP32[$ReallocAsyncCtx2 + 4 >> 2] = $4; //@line 392
 HEAP32[$ReallocAsyncCtx2 + 8 >> 2] = $AsyncRetVal; //@line 394
 HEAP32[$ReallocAsyncCtx2 + 12 >> 2] = $6; //@line 396
 sp = STACKTOP; //@line 397
 return;
}
function __ZN11TextDisplay3clsEv__async_cb_91($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $8 = 0, $9 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 6446
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 6448
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 6450
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 6452
 $8 = HEAP32[(HEAP32[$2 >> 2] | 0) + 92 >> 2] | 0; //@line 6455
 $ReallocAsyncCtx3 = _emscripten_realloc_async_context(16) | 0; //@line 6456
 $9 = FUNCTION_TABLE_ii[$8 & 31]($4) | 0; //@line 6457
 if (!___async) {
  HEAP32[___async_retval >> 2] = $9; //@line 6461
  ___async_unwind = 0; //@line 6462
 }
 HEAP32[$ReallocAsyncCtx3 >> 2] = 74; //@line 6464
 HEAP32[$ReallocAsyncCtx3 + 4 >> 2] = $AsyncRetVal; //@line 6466
 HEAP32[$ReallocAsyncCtx3 + 8 >> 2] = $4; //@line 6468
 HEAP32[$ReallocAsyncCtx3 + 12 >> 2] = $2; //@line 6470
 sp = STACKTOP; //@line 6471
 return;
}
function __ZN4mbed6Stream6printfEPKcz__async_cb_33($0) {
 $0 = $0 | 0;
 var $10 = 0, $13 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 3242
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 3246
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 3248
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 3250
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 3252
 $13 = HEAP32[(HEAP32[HEAP32[$0 + 4 >> 2] >> 2] | 0) + 84 >> 2] | 0; //@line 3255
 $ReallocAsyncCtx3 = _emscripten_realloc_async_context(16) | 0; //@line 3256
 FUNCTION_TABLE_vi[$13 & 255]($4); //@line 3257
 if (!___async) {
  ___async_unwind = 0; //@line 3260
 }
 HEAP32[$ReallocAsyncCtx3 >> 2] = 113; //@line 3262
 HEAP32[$ReallocAsyncCtx3 + 4 >> 2] = $6; //@line 3264
 HEAP32[$ReallocAsyncCtx3 + 8 >> 2] = $8; //@line 3266
 HEAP32[$ReallocAsyncCtx3 + 12 >> 2] = $10; //@line 3268
 sp = STACKTOP; //@line 3269
 return;
}
function __ZN4mbed6StreamD2Ev($0) {
 $0 = $0 | 0;
 var $3 = 0, $AsyncCtx = 0, $AsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 2406
 HEAP32[$0 >> 2] = 916; //@line 2407
 HEAP32[$0 + 4 >> 2] = 1012; //@line 2409
 $3 = HEAP32[$0 + 20 >> 2] | 0; //@line 2411
 $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 2412
 _fclose($3) | 0; //@line 2413
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 94; //@line 2416
  HEAP32[$AsyncCtx + 4 >> 2] = $0; //@line 2418
  sp = STACKTOP; //@line 2419
  return;
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 2422
 $AsyncCtx2 = _emscripten_alloc_async_context(4, sp) | 0; //@line 2424
 __ZN4mbed8FileBaseD2Ev($0 + 4 | 0); //@line 2425
 if (___async) {
  HEAP32[$AsyncCtx2 >> 2] = 95; //@line 2428
  sp = STACKTOP; //@line 2429
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx2 | 0); //@line 2432
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
 sp = STACKTOP; //@line 10454
 STACKTOP = STACKTOP + 256 | 0; //@line 10455
 $5 = sp; //@line 10456
 if (($2 | 0) > ($3 | 0) & ($4 & 73728 | 0) == 0) {
  $9 = $2 - $3 | 0; //@line 10462
  _memset($5 | 0, $1 << 24 >> 24 | 0, ($9 >>> 0 < 256 ? $9 : 256) | 0) | 0; //@line 10466
  if ($9 >>> 0 > 255) {
   $14 = $2 - $3 | 0; //@line 10469
   $$011 = $9; //@line 10470
   do {
    _out_670($0, $5, 256); //@line 10472
    $$011 = $$011 + -256 | 0; //@line 10473
   } while ($$011 >>> 0 > 255);
   $$0$lcssa = $14 & 255; //@line 10482
  } else {
   $$0$lcssa = $9; //@line 10484
  }
  _out_670($0, $5, $$0$lcssa); //@line 10486
 }
 STACKTOP = sp; //@line 10488
 return;
}
function __ZN11TextDisplay3clsEv__async_cb_92($0) {
 $0 = $0 | 0;
 var $4 = 0, $6 = 0, $ReallocAsyncCtx6 = 0, sp = 0;
 sp = STACKTOP; //@line 6477
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 6481
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 6483
 if ((Math_imul(HEAP32[___async_retval >> 2] | 0, HEAP32[$0 + 4 >> 2] | 0) | 0) <= 0) {
  return;
 }
 $ReallocAsyncCtx6 = _emscripten_realloc_async_context(20) | 0; //@line 6491
 __ZN4mbed6Stream4putcEi($4, 32) | 0; //@line 6492
 if (!___async) {
  ___async_unwind = 0; //@line 6495
 }
 HEAP32[$ReallocAsyncCtx6 >> 2] = 75; //@line 6497
 HEAP32[$ReallocAsyncCtx6 + 4 >> 2] = 0; //@line 6499
 HEAP32[$ReallocAsyncCtx6 + 8 >> 2] = $6; //@line 6501
 HEAP32[$ReallocAsyncCtx6 + 12 >> 2] = $4; //@line 6503
 HEAP32[$ReallocAsyncCtx6 + 16 >> 2] = $4; //@line 6505
 sp = STACKTOP; //@line 6506
 return;
}
function __ZNK10__cxxabiv117__class_type_info24process_found_base_classEPNS_19__dynamic_cast_infoEPvi($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $10 = 0, $13 = 0, $4 = 0, $5 = 0;
 $4 = $1 + 16 | 0; //@line 12726
 $5 = HEAP32[$4 >> 2] | 0; //@line 12727
 do {
  if (!$5) {
   HEAP32[$4 >> 2] = $2; //@line 12731
   HEAP32[$1 + 24 >> 2] = $3; //@line 12733
   HEAP32[$1 + 36 >> 2] = 1; //@line 12735
  } else {
   if (($5 | 0) != ($2 | 0)) {
    $13 = $1 + 36 | 0; //@line 12739
    HEAP32[$13 >> 2] = (HEAP32[$13 >> 2] | 0) + 1; //@line 12742
    HEAP32[$1 + 24 >> 2] = 2; //@line 12744
    HEAP8[$1 + 54 >> 0] = 1; //@line 12746
    break;
   }
   $10 = $1 + 24 | 0; //@line 12749
   if ((HEAP32[$10 >> 2] | 0) == 2) {
    HEAP32[$10 >> 2] = $3; //@line 12753
   }
  }
 } while (0);
 return;
}
function __ZN15GraphicsDisplayC2EPKc__async_cb_3($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $8 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 14400
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 14402
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 14404
 HEAP32[$2 >> 2] = 504; //@line 14405
 HEAP32[$2 + 4 >> 2] = 664; //@line 14407
 __ZN11TextDisplay10foregroundEt($4, -1); //@line 14408
 $8 = HEAP32[(HEAP32[$2 >> 2] | 0) + 116 >> 2] | 0; //@line 14411
 $ReallocAsyncCtx = _emscripten_realloc_async_context(4) | 0; //@line 14412
 FUNCTION_TABLE_vii[$8 & 7]($4, 0); //@line 14413
 if (___async) {
  HEAP32[$ReallocAsyncCtx >> 2] = 65; //@line 14416
  sp = STACKTOP; //@line 14417
  return;
 }
 ___async_unwind = 0; //@line 14420
 HEAP32[$ReallocAsyncCtx >> 2] = 65; //@line 14421
 sp = STACKTOP; //@line 14422
 return;
}
function __ZN4mbed8FileBaseD0Ev__async_cb($0) {
 $0 = $0 | 0;
 var $2 = 0, $7 = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 5153
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 5155
 if (HEAP32[$2 + 12 >> 2] | 0) {
  __ZdlPv($2); //@line 5160
  return;
 }
 $ReallocAsyncCtx3 = _emscripten_realloc_async_context(8) | 0; //@line 5164
 __ZN4mbed17remove_filehandleEPNS_10FileHandleE($2 + -4 | 0); //@line 5165
 if (___async) {
  HEAP32[$ReallocAsyncCtx3 >> 2] = 86; //@line 5168
  $7 = $ReallocAsyncCtx3 + 4 | 0; //@line 5169
  HEAP32[$7 >> 2] = $2; //@line 5170
  sp = STACKTOP; //@line 5171
  return;
 }
 ___async_unwind = 0; //@line 5174
 HEAP32[$ReallocAsyncCtx3 >> 2] = 86; //@line 5175
 $7 = $ReallocAsyncCtx3 + 4 | 0; //@line 5176
 HEAP32[$7 >> 2] = $2; //@line 5177
 sp = STACKTOP; //@line 5178
 return;
}
function __ZN15GraphicsDisplay3clsEv__async_cb_13($0) {
 $0 = $0 | 0;
 var $10 = 0, $2 = 0, $4 = 0, $6 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 403
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 405
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 407
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 409
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 411
 $10 = HEAPU16[$2 + 30 >> 1] | 0; //@line 414
 $ReallocAsyncCtx3 = _emscripten_realloc_async_context(4) | 0; //@line 415
 FUNCTION_TABLE_viiiiii[$6 & 7]($2, 0, 0, $4, $AsyncRetVal, $10); //@line 416
 if (___async) {
  HEAP32[$ReallocAsyncCtx3 >> 2] = 55; //@line 419
  sp = STACKTOP; //@line 420
  return;
 }
 ___async_unwind = 0; //@line 423
 HEAP32[$ReallocAsyncCtx3 >> 2] = 55; //@line 424
 sp = STACKTOP; //@line 425
 return;
}
function ___stdio_seek($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $10 = 0, $3 = 0, $vararg_buffer = 0, sp = 0;
 sp = STACKTOP; //@line 7419
 STACKTOP = STACKTOP + 32 | 0; //@line 7420
 $vararg_buffer = sp; //@line 7421
 $3 = sp + 20 | 0; //@line 7422
 HEAP32[$vararg_buffer >> 2] = HEAP32[$0 + 60 >> 2]; //@line 7426
 HEAP32[$vararg_buffer + 4 >> 2] = 0; //@line 7428
 HEAP32[$vararg_buffer + 8 >> 2] = $1; //@line 7430
 HEAP32[$vararg_buffer + 12 >> 2] = $3; //@line 7432
 HEAP32[$vararg_buffer + 16 >> 2] = $2; //@line 7434
 if ((___syscall_ret(___syscall140(140, $vararg_buffer | 0) | 0) | 0) < 0) {
  HEAP32[$3 >> 2] = -1; //@line 7439
  $10 = -1; //@line 7440
 } else {
  $10 = HEAP32[$3 >> 2] | 0; //@line 7443
 }
 STACKTOP = sp; //@line 7445
 return $10 | 0; //@line 7445
}
function _mbed_assert_internal($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $AsyncCtx = 0, $vararg_buffer = 0, sp = 0;
 sp = STACKTOP; //@line 3017
 STACKTOP = STACKTOP + 16 | 0; //@line 3018
 $vararg_buffer = sp; //@line 3019
 HEAP32[$vararg_buffer >> 2] = $0; //@line 3020
 HEAP32[$vararg_buffer + 4 >> 2] = $1; //@line 3022
 HEAP32[$vararg_buffer + 8 >> 2] = $2; //@line 3024
 _mbed_error_printf(5023, $vararg_buffer); //@line 3025
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 3026
 _mbed_die(); //@line 3027
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 115; //@line 3030
  sp = STACKTOP; //@line 3031
  STACKTOP = sp; //@line 3032
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 3034
  STACKTOP = sp; //@line 3035
  return;
 }
}
function __Znwj__async_cb($0) {
 $0 = $0 | 0;
 var $$lcssa = 0, $2 = 0, $3 = 0, $5 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 2868
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 2870
 $3 = _malloc($2) | 0; //@line 2871
 if (!$3) {
  $5 = __ZSt15get_new_handlerv() | 0; //@line 2874
  if (!$5) {
   $$lcssa = 0; //@line 2877
  } else {
   $ReallocAsyncCtx = _emscripten_realloc_async_context(8) | 0; //@line 2879
   FUNCTION_TABLE_v[$5 & 3](); //@line 2880
   if (!___async) {
    ___async_unwind = 0; //@line 2883
   }
   HEAP32[$ReallocAsyncCtx >> 2] = 176; //@line 2885
   HEAP32[$ReallocAsyncCtx + 4 >> 2] = $2; //@line 2887
   sp = STACKTOP; //@line 2888
   return;
  }
 } else {
  $$lcssa = $3; //@line 2892
 }
 HEAP32[___async_retval >> 2] = $$lcssa; //@line 2895
 return;
}
function _strcmp($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$011 = 0, $$0710 = 0, $$lcssa = 0, $$lcssa8 = 0, $2 = 0, $3 = 0, $8 = 0, $9 = 0;
 $2 = HEAP8[$0 >> 0] | 0; //@line 7600
 $3 = HEAP8[$1 >> 0] | 0; //@line 7601
 if ($2 << 24 >> 24 == 0 ? 1 : $2 << 24 >> 24 != $3 << 24 >> 24) {
  $$lcssa = $3; //@line 7606
  $$lcssa8 = $2; //@line 7606
 } else {
  $$011 = $1; //@line 7608
  $$0710 = $0; //@line 7608
  do {
   $$0710 = $$0710 + 1 | 0; //@line 7610
   $$011 = $$011 + 1 | 0; //@line 7611
   $8 = HEAP8[$$0710 >> 0] | 0; //@line 7612
   $9 = HEAP8[$$011 >> 0] | 0; //@line 7613
  } while (!($8 << 24 >> 24 == 0 ? 1 : $8 << 24 >> 24 != $9 << 24 >> 24));
  $$lcssa = $9; //@line 7618
  $$lcssa8 = $8; //@line 7618
 }
 return ($$lcssa8 & 255) - ($$lcssa & 255) | 0; //@line 7628
}
function __ZN4mbed6Stream4putcEi__async_cb($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx4 = 0, sp = 0;
 sp = STACKTOP; //@line 14438
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 14440
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 14442
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 14444
 $8 = HEAP32[$2 + 20 >> 2] | 0; //@line 14446
 $ReallocAsyncCtx4 = _emscripten_realloc_async_context(16) | 0; //@line 14447
 _fflush($8) | 0; //@line 14448
 if (!___async) {
  ___async_unwind = 0; //@line 14451
 }
 HEAP32[$ReallocAsyncCtx4 >> 2] = 107; //@line 14453
 HEAP32[$ReallocAsyncCtx4 + 4 >> 2] = $2; //@line 14455
 HEAP32[$ReallocAsyncCtx4 + 8 >> 2] = $4; //@line 14457
 HEAP32[$ReallocAsyncCtx4 + 12 >> 2] = $6; //@line 14459
 sp = STACKTOP; //@line 14460
 return;
}
function _mbed_die__async_cb_79($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx14 = 0, sp = 0;
 sp = STACKTOP; //@line 5637
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 5639
 _emscripten_asm_const_iii(3, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 5641
 $ReallocAsyncCtx14 = _emscripten_realloc_async_context(8) | 0; //@line 5642
 _wait_ms(150); //@line 5643
 if (___async) {
  HEAP32[$ReallocAsyncCtx14 >> 2] = 118; //@line 5646
  $4 = $ReallocAsyncCtx14 + 4 | 0; //@line 5647
  HEAP32[$4 >> 2] = $2; //@line 5648
  sp = STACKTOP; //@line 5649
  return;
 }
 ___async_unwind = 0; //@line 5652
 HEAP32[$ReallocAsyncCtx14 >> 2] = 118; //@line 5653
 $4 = $ReallocAsyncCtx14 + 4 | 0; //@line 5654
 HEAP32[$4 >> 2] = $2; //@line 5655
 sp = STACKTOP; //@line 5656
 return;
}
function _mbed_die__async_cb_78($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx13 = 0, sp = 0;
 sp = STACKTOP; //@line 5612
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 5614
 _emscripten_asm_const_iii(3, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 5616
 $ReallocAsyncCtx13 = _emscripten_realloc_async_context(8) | 0; //@line 5617
 _wait_ms(150); //@line 5618
 if (___async) {
  HEAP32[$ReallocAsyncCtx13 >> 2] = 119; //@line 5621
  $4 = $ReallocAsyncCtx13 + 4 | 0; //@line 5622
  HEAP32[$4 >> 2] = $2; //@line 5623
  sp = STACKTOP; //@line 5624
  return;
 }
 ___async_unwind = 0; //@line 5627
 HEAP32[$ReallocAsyncCtx13 >> 2] = 119; //@line 5628
 $4 = $ReallocAsyncCtx13 + 4 | 0; //@line 5629
 HEAP32[$4 >> 2] = $2; //@line 5630
 sp = STACKTOP; //@line 5631
 return;
}
function _mbed_die__async_cb_77($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx12 = 0, sp = 0;
 sp = STACKTOP; //@line 5587
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 5589
 _emscripten_asm_const_iii(3, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 5591
 $ReallocAsyncCtx12 = _emscripten_realloc_async_context(8) | 0; //@line 5592
 _wait_ms(150); //@line 5593
 if (___async) {
  HEAP32[$ReallocAsyncCtx12 >> 2] = 120; //@line 5596
  $4 = $ReallocAsyncCtx12 + 4 | 0; //@line 5597
  HEAP32[$4 >> 2] = $2; //@line 5598
  sp = STACKTOP; //@line 5599
  return;
 }
 ___async_unwind = 0; //@line 5602
 HEAP32[$ReallocAsyncCtx12 >> 2] = 120; //@line 5603
 $4 = $ReallocAsyncCtx12 + 4 | 0; //@line 5604
 HEAP32[$4 >> 2] = $2; //@line 5605
 sp = STACKTOP; //@line 5606
 return;
}
function _mbed_die__async_cb_76($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx11 = 0, sp = 0;
 sp = STACKTOP; //@line 5562
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 5564
 _emscripten_asm_const_iii(3, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 5566
 $ReallocAsyncCtx11 = _emscripten_realloc_async_context(8) | 0; //@line 5567
 _wait_ms(150); //@line 5568
 if (___async) {
  HEAP32[$ReallocAsyncCtx11 >> 2] = 121; //@line 5571
  $4 = $ReallocAsyncCtx11 + 4 | 0; //@line 5572
  HEAP32[$4 >> 2] = $2; //@line 5573
  sp = STACKTOP; //@line 5574
  return;
 }
 ___async_unwind = 0; //@line 5577
 HEAP32[$ReallocAsyncCtx11 >> 2] = 121; //@line 5578
 $4 = $ReallocAsyncCtx11 + 4 | 0; //@line 5579
 HEAP32[$4 >> 2] = $2; //@line 5580
 sp = STACKTOP; //@line 5581
 return;
}
function _mbed_die__async_cb_75($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx10 = 0, sp = 0;
 sp = STACKTOP; //@line 5537
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 5539
 _emscripten_asm_const_iii(3, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 5541
 $ReallocAsyncCtx10 = _emscripten_realloc_async_context(8) | 0; //@line 5542
 _wait_ms(150); //@line 5543
 if (___async) {
  HEAP32[$ReallocAsyncCtx10 >> 2] = 122; //@line 5546
  $4 = $ReallocAsyncCtx10 + 4 | 0; //@line 5547
  HEAP32[$4 >> 2] = $2; //@line 5548
  sp = STACKTOP; //@line 5549
  return;
 }
 ___async_unwind = 0; //@line 5552
 HEAP32[$ReallocAsyncCtx10 >> 2] = 122; //@line 5553
 $4 = $ReallocAsyncCtx10 + 4 | 0; //@line 5554
 HEAP32[$4 >> 2] = $2; //@line 5555
 sp = STACKTOP; //@line 5556
 return;
}
function _sprintf($0, $1, $varargs) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $varargs = $varargs | 0;
 var $2 = 0, $3 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 11795
 STACKTOP = STACKTOP + 16 | 0; //@line 11796
 $2 = sp; //@line 11797
 HEAP32[$2 >> 2] = $varargs; //@line 11798
 $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 11799
 $3 = _vsprintf($0, $1, $2) | 0; //@line 11800
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 167; //@line 11803
  HEAP32[$AsyncCtx + 4 >> 2] = $2; //@line 11805
  sp = STACKTOP; //@line 11806
  STACKTOP = sp; //@line 11807
  return 0; //@line 11807
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 11809
  STACKTOP = sp; //@line 11810
  return $3 | 0; //@line 11810
 }
 return 0; //@line 11812
}
function _mbed_die__async_cb_74($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx9 = 0, sp = 0;
 sp = STACKTOP; //@line 5512
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 5514
 _emscripten_asm_const_iii(3, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 5516
 $ReallocAsyncCtx9 = _emscripten_realloc_async_context(8) | 0; //@line 5517
 _wait_ms(150); //@line 5518
 if (___async) {
  HEAP32[$ReallocAsyncCtx9 >> 2] = 123; //@line 5521
  $4 = $ReallocAsyncCtx9 + 4 | 0; //@line 5522
  HEAP32[$4 >> 2] = $2; //@line 5523
  sp = STACKTOP; //@line 5524
  return;
 }
 ___async_unwind = 0; //@line 5527
 HEAP32[$ReallocAsyncCtx9 >> 2] = 123; //@line 5528
 $4 = $ReallocAsyncCtx9 + 4 | 0; //@line 5529
 HEAP32[$4 >> 2] = $2; //@line 5530
 sp = STACKTOP; //@line 5531
 return;
}
function _mbed_die__async_cb_73($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx8 = 0, sp = 0;
 sp = STACKTOP; //@line 5487
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 5489
 _emscripten_asm_const_iii(3, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 5491
 $ReallocAsyncCtx8 = _emscripten_realloc_async_context(8) | 0; //@line 5492
 _wait_ms(400); //@line 5493
 if (___async) {
  HEAP32[$ReallocAsyncCtx8 >> 2] = 124; //@line 5496
  $4 = $ReallocAsyncCtx8 + 4 | 0; //@line 5497
  HEAP32[$4 >> 2] = $2; //@line 5498
  sp = STACKTOP; //@line 5499
  return;
 }
 ___async_unwind = 0; //@line 5502
 HEAP32[$ReallocAsyncCtx8 >> 2] = 124; //@line 5503
 $4 = $ReallocAsyncCtx8 + 4 | 0; //@line 5504
 HEAP32[$4 >> 2] = $2; //@line 5505
 sp = STACKTOP; //@line 5506
 return;
}
function _mbed_die__async_cb_72($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx7 = 0, sp = 0;
 sp = STACKTOP; //@line 5462
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 5464
 _emscripten_asm_const_iii(3, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 5466
 $ReallocAsyncCtx7 = _emscripten_realloc_async_context(8) | 0; //@line 5467
 _wait_ms(400); //@line 5468
 if (___async) {
  HEAP32[$ReallocAsyncCtx7 >> 2] = 125; //@line 5471
  $4 = $ReallocAsyncCtx7 + 4 | 0; //@line 5472
  HEAP32[$4 >> 2] = $2; //@line 5473
  sp = STACKTOP; //@line 5474
  return;
 }
 ___async_unwind = 0; //@line 5477
 HEAP32[$ReallocAsyncCtx7 >> 2] = 125; //@line 5478
 $4 = $ReallocAsyncCtx7 + 4 | 0; //@line 5479
 HEAP32[$4 >> 2] = $2; //@line 5480
 sp = STACKTOP; //@line 5481
 return;
}
function _mbed_die__async_cb_71($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx6 = 0, sp = 0;
 sp = STACKTOP; //@line 5437
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 5439
 _emscripten_asm_const_iii(3, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 5441
 $ReallocAsyncCtx6 = _emscripten_realloc_async_context(8) | 0; //@line 5442
 _wait_ms(400); //@line 5443
 if (___async) {
  HEAP32[$ReallocAsyncCtx6 >> 2] = 126; //@line 5446
  $4 = $ReallocAsyncCtx6 + 4 | 0; //@line 5447
  HEAP32[$4 >> 2] = $2; //@line 5448
  sp = STACKTOP; //@line 5449
  return;
 }
 ___async_unwind = 0; //@line 5452
 HEAP32[$ReallocAsyncCtx6 >> 2] = 126; //@line 5453
 $4 = $ReallocAsyncCtx6 + 4 | 0; //@line 5454
 HEAP32[$4 >> 2] = $2; //@line 5455
 sp = STACKTOP; //@line 5456
 return;
}
function _mbed_die__async_cb_70($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx5 = 0, sp = 0;
 sp = STACKTOP; //@line 5412
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 5414
 _emscripten_asm_const_iii(3, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 5416
 $ReallocAsyncCtx5 = _emscripten_realloc_async_context(8) | 0; //@line 5417
 _wait_ms(400); //@line 5418
 if (___async) {
  HEAP32[$ReallocAsyncCtx5 >> 2] = 127; //@line 5421
  $4 = $ReallocAsyncCtx5 + 4 | 0; //@line 5422
  HEAP32[$4 >> 2] = $2; //@line 5423
  sp = STACKTOP; //@line 5424
  return;
 }
 ___async_unwind = 0; //@line 5427
 HEAP32[$ReallocAsyncCtx5 >> 2] = 127; //@line 5428
 $4 = $ReallocAsyncCtx5 + 4 | 0; //@line 5429
 HEAP32[$4 >> 2] = $2; //@line 5430
 sp = STACKTOP; //@line 5431
 return;
}
function _mbed_die__async_cb_69($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx4 = 0, sp = 0;
 sp = STACKTOP; //@line 5387
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 5389
 _emscripten_asm_const_iii(3, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 5391
 $ReallocAsyncCtx4 = _emscripten_realloc_async_context(8) | 0; //@line 5392
 _wait_ms(400); //@line 5393
 if (___async) {
  HEAP32[$ReallocAsyncCtx4 >> 2] = 128; //@line 5396
  $4 = $ReallocAsyncCtx4 + 4 | 0; //@line 5397
  HEAP32[$4 >> 2] = $2; //@line 5398
  sp = STACKTOP; //@line 5399
  return;
 }
 ___async_unwind = 0; //@line 5402
 HEAP32[$ReallocAsyncCtx4 >> 2] = 128; //@line 5403
 $4 = $ReallocAsyncCtx4 + 4 | 0; //@line 5404
 HEAP32[$4 >> 2] = $2; //@line 5405
 sp = STACKTOP; //@line 5406
 return;
}
function _mbed_die__async_cb_68($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 5362
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 5364
 _emscripten_asm_const_iii(3, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 5366
 $ReallocAsyncCtx3 = _emscripten_realloc_async_context(8) | 0; //@line 5367
 _wait_ms(400); //@line 5368
 if (___async) {
  HEAP32[$ReallocAsyncCtx3 >> 2] = 129; //@line 5371
  $4 = $ReallocAsyncCtx3 + 4 | 0; //@line 5372
  HEAP32[$4 >> 2] = $2; //@line 5373
  sp = STACKTOP; //@line 5374
  return;
 }
 ___async_unwind = 0; //@line 5377
 HEAP32[$ReallocAsyncCtx3 >> 2] = 129; //@line 5378
 $4 = $ReallocAsyncCtx3 + 4 | 0; //@line 5379
 HEAP32[$4 >> 2] = $2; //@line 5380
 sp = STACKTOP; //@line 5381
 return;
}
function _mbed_die__async_cb_67($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 5337
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 5339
 _emscripten_asm_const_iii(3, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 5341
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(8) | 0; //@line 5342
 _wait_ms(400); //@line 5343
 if (___async) {
  HEAP32[$ReallocAsyncCtx2 >> 2] = 130; //@line 5346
  $4 = $ReallocAsyncCtx2 + 4 | 0; //@line 5347
  HEAP32[$4 >> 2] = $2; //@line 5348
  sp = STACKTOP; //@line 5349
  return;
 }
 ___async_unwind = 0; //@line 5352
 HEAP32[$ReallocAsyncCtx2 >> 2] = 130; //@line 5353
 $4 = $ReallocAsyncCtx2 + 4 | 0; //@line 5354
 HEAP32[$4 >> 2] = $2; //@line 5355
 sp = STACKTOP; //@line 5356
 return;
}
function _mbed_die__async_cb_66($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 5312
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 5314
 _emscripten_asm_const_iii(3, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 5316
 $ReallocAsyncCtx = _emscripten_realloc_async_context(8) | 0; //@line 5317
 _wait_ms(400); //@line 5318
 if (___async) {
  HEAP32[$ReallocAsyncCtx >> 2] = 131; //@line 5321
  $4 = $ReallocAsyncCtx + 4 | 0; //@line 5322
  HEAP32[$4 >> 2] = $2; //@line 5323
  sp = STACKTOP; //@line 5324
  return;
 }
 ___async_unwind = 0; //@line 5327
 HEAP32[$ReallocAsyncCtx >> 2] = 131; //@line 5328
 $4 = $ReallocAsyncCtx + 4 | 0; //@line 5329
 HEAP32[$4 >> 2] = $2; //@line 5330
 sp = STACKTOP; //@line 5331
 return;
}
function _sbrk(increment) {
 increment = increment | 0;
 var oldDynamicTop = 0, newDynamicTop = 0;
 oldDynamicTop = HEAP32[DYNAMICTOP_PTR >> 2] | 0; //@line 7093
 newDynamicTop = oldDynamicTop + increment | 0; //@line 7094
 if ((increment | 0) > 0 & (newDynamicTop | 0) < (oldDynamicTop | 0) | (newDynamicTop | 0) < 0) {
  abortOnCannotGrowMemory() | 0; //@line 7098
  ___setErrNo(12); //@line 7099
  return -1;
 }
 HEAP32[DYNAMICTOP_PTR >> 2] = newDynamicTop; //@line 7103
 if ((newDynamicTop | 0) > (getTotalMemory() | 0)) {
  if (!(enlargeMemory() | 0)) {
   HEAP32[DYNAMICTOP_PTR >> 2] = oldDynamicTop; //@line 7107
   ___setErrNo(12); //@line 7108
   return -1;
  }
 }
 return oldDynamicTop | 0; //@line 7112
}
function __ZSt11__terminatePFvvE($0) {
 $0 = $0 | 0;
 var $AsyncCtx = 0, $vararg_buffer = 0, sp = 0;
 sp = STACKTOP; //@line 13276
 STACKTOP = STACKTOP + 16 | 0; //@line 13277
 $vararg_buffer = sp; //@line 13278
 $AsyncCtx = _emscripten_alloc_async_context(12, sp) | 0; //@line 13279
 FUNCTION_TABLE_v[$0 & 3](); //@line 13280
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 191; //@line 13283
  HEAP32[$AsyncCtx + 4 >> 2] = $vararg_buffer; //@line 13285
  HEAP32[$AsyncCtx + 8 >> 2] = $vararg_buffer; //@line 13287
  sp = STACKTOP; //@line 13288
  STACKTOP = sp; //@line 13289
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 13291
  _abort_message(8688, $vararg_buffer); //@line 13292
 }
}
function _fmt_x($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $$05$lcssa = 0, $$056 = 0, $14 = 0, $15 = 0, $8 = 0;
 if (($0 | 0) == 0 & ($1 | 0) == 0) {
  $$05$lcssa = $2; //@line 10315
 } else {
  $$056 = $2; //@line 10317
  $15 = $1; //@line 10317
  $8 = $0; //@line 10317
  while (1) {
   $14 = $$056 + -1 | 0; //@line 10325
   HEAP8[$14 >> 0] = HEAPU8[6351 + ($8 & 15) >> 0] | 0 | $3; //@line 10326
   $8 = _bitshift64Lshr($8 | 0, $15 | 0, 4) | 0; //@line 10327
   $15 = tempRet0; //@line 10328
   if (($8 | 0) == 0 & ($15 | 0) == 0) {
    $$05$lcssa = $14; //@line 10333
    break;
   } else {
    $$056 = $14; //@line 10336
   }
  }
 }
 return $$05$lcssa | 0; //@line 10340
}
function _fwrite($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $$ = 0, $11 = 0, $13 = 0, $15 = 0, $4 = 0, $phitmp = 0;
 $4 = Math_imul($2, $1) | 0; //@line 7723
 $$ = ($1 | 0) == 0 ? 0 : $2; //@line 7725
 if ((HEAP32[$3 + 76 >> 2] | 0) > -1) {
  $phitmp = (___lockfile($3) | 0) == 0; //@line 7731
  $11 = ___fwritex($0, $4, $3) | 0; //@line 7732
  if ($phitmp) {
   $13 = $11; //@line 7734
  } else {
   ___unlockfile($3); //@line 7736
   $13 = $11; //@line 7737
  }
 } else {
  $13 = ___fwritex($0, $4, $3) | 0; //@line 7741
 }
 if (($13 | 0) == ($4 | 0)) {
  $15 = $$; //@line 7745
 } else {
  $15 = ($13 >>> 0) / ($1 >>> 0) | 0; //@line 7748
 }
 return $15 | 0; //@line 7750
}
function __ZSt9terminatev() {
 var $0 = 0, $16 = 0, $17 = 0, $2 = 0, $5 = 0, sp = 0;
 sp = STACKTOP; //@line 13241
 $0 = ___cxa_get_globals_fast() | 0; //@line 13242
 if ($0 | 0) {
  $2 = HEAP32[$0 >> 2] | 0; //@line 13245
  if ($2 | 0) {
   $5 = $2 + 48 | 0; //@line 13249
   if ((HEAP32[$5 >> 2] & -256 | 0) == 1126902528 ? (HEAP32[$5 + 4 >> 2] | 0) == 1129074247 : 0) {
    $16 = HEAP32[$2 + 12 >> 2] | 0; //@line 13261
    _emscripten_alloc_async_context(4, sp) | 0; //@line 13262
    __ZSt11__terminatePFvvE($16); //@line 13263
   }
  }
 }
 $17 = __ZSt13get_terminatev() | 0; //@line 13268
 _emscripten_alloc_async_context(4, sp) | 0; //@line 13269
 __ZSt11__terminatePFvvE($17); //@line 13270
}
function ___stdout_write($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $14 = 0, $vararg_buffer = 0, sp = 0;
 sp = STACKTOP; //@line 7552
 STACKTOP = STACKTOP + 32 | 0; //@line 7553
 $vararg_buffer = sp; //@line 7554
 HEAP32[$0 + 36 >> 2] = 5; //@line 7557
 if (!(HEAP32[$0 >> 2] & 64)) {
  HEAP32[$vararg_buffer >> 2] = HEAP32[$0 + 60 >> 2]; //@line 7565
  HEAP32[$vararg_buffer + 4 >> 2] = 21523; //@line 7567
  HEAP32[$vararg_buffer + 8 >> 2] = sp + 16; //@line 7569
  if (___syscall54(54, $vararg_buffer | 0) | 0) {
   HEAP8[$0 + 75 >> 0] = -1; //@line 7574
  }
 }
 $14 = ___stdio_write($0, $1, $2) | 0; //@line 7577
 STACKTOP = sp; //@line 7578
 return $14 | 0; //@line 7578
}
function __ZN15GraphicsDisplay4putpEi__async_cb($0) {
 $0 = $0 | 0;
 var $15 = 0, $2 = 0, $4 = 0, $6 = 0, $8 = 0;
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 440
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 442
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 444
 $8 = (HEAP16[$2 >> 1] | 0) + 1 << 16 >> 16; //@line 446
 HEAP16[$2 >> 1] = $8; //@line 447
 if ($8 << 16 >> 16 <= (HEAP16[$4 + 42 >> 1] | 0)) {
  return;
 }
 HEAP16[$2 >> 1] = HEAP16[$4 + 40 >> 1] | 0; //@line 456
 $15 = (HEAP16[$6 >> 1] | 0) + 1 << 16 >> 16; //@line 458
 HEAP16[$6 >> 1] = $15; //@line 459
 if ($15 << 16 >> 16 <= (HEAP16[$4 + 46 >> 1] | 0)) {
  return;
 }
 HEAP16[$6 >> 1] = HEAP16[$4 + 44 >> 1] | 0; //@line 468
 return;
}
function ___towrite($0) {
 $0 = $0 | 0;
 var $$0 = 0, $1 = 0, $14 = 0, $3 = 0, $7 = 0;
 $1 = $0 + 74 | 0; //@line 7878
 $3 = HEAP8[$1 >> 0] | 0; //@line 7880
 HEAP8[$1 >> 0] = $3 + 255 | $3; //@line 7884
 $7 = HEAP32[$0 >> 2] | 0; //@line 7885
 if (!($7 & 8)) {
  HEAP32[$0 + 8 >> 2] = 0; //@line 7890
  HEAP32[$0 + 4 >> 2] = 0; //@line 7892
  $14 = HEAP32[$0 + 44 >> 2] | 0; //@line 7894
  HEAP32[$0 + 28 >> 2] = $14; //@line 7896
  HEAP32[$0 + 20 >> 2] = $14; //@line 7898
  HEAP32[$0 + 16 >> 2] = $14 + (HEAP32[$0 + 48 >> 2] | 0); //@line 7904
  $$0 = 0; //@line 7905
 } else {
  HEAP32[$0 >> 2] = $7 | 32; //@line 7908
  $$0 = -1; //@line 7909
 }
 return $$0 | 0; //@line 7911
}
function __ZN6C128327columnsEv($0) {
 $0 = $0 | 0;
 var $3 = 0, $4 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 575
 $3 = HEAP32[(HEAP32[$0 >> 2] | 0) + 124 >> 2] | 0; //@line 578
 $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 579
 $4 = FUNCTION_TABLE_ii[$3 & 31]($0) | 0; //@line 580
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 43; //@line 583
  HEAP32[$AsyncCtx + 4 >> 2] = $0; //@line 585
  sp = STACKTOP; //@line 586
  return 0; //@line 587
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 589
  return ($4 | 0) / (HEAPU8[(HEAP32[$0 + 48 >> 2] | 0) + 1 >> 0] | 0 | 0) | 0 | 0; //@line 596
 }
 return 0; //@line 598
}
function _fmt_o($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$0$lcssa = 0, $$06 = 0, $10 = 0, $11 = 0, $7 = 0;
 if (($0 | 0) == 0 & ($1 | 0) == 0) {
  $$0$lcssa = $2; //@line 10352
 } else {
  $$06 = $2; //@line 10354
  $11 = $1; //@line 10354
  $7 = $0; //@line 10354
  while (1) {
   $10 = $$06 + -1 | 0; //@line 10359
   HEAP8[$10 >> 0] = $7 & 7 | 48; //@line 10360
   $7 = _bitshift64Lshr($7 | 0, $11 | 0, 3) | 0; //@line 10361
   $11 = tempRet0; //@line 10362
   if (($7 | 0) == 0 & ($11 | 0) == 0) {
    $$0$lcssa = $10; //@line 10367
    break;
   } else {
    $$06 = $10; //@line 10370
   }
  }
 }
 return $$0$lcssa | 0; //@line 10374
}
function __ZN6C128324rowsEv($0) {
 $0 = $0 | 0;
 var $3 = 0, $4 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 547
 $3 = HEAP32[(HEAP32[$0 >> 2] | 0) + 128 >> 2] | 0; //@line 550
 $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 551
 $4 = FUNCTION_TABLE_ii[$3 & 31]($0) | 0; //@line 552
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 42; //@line 555
  HEAP32[$AsyncCtx + 4 >> 2] = $0; //@line 557
  sp = STACKTOP; //@line 558
  return 0; //@line 559
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 561
  return ($4 | 0) / (HEAPU8[(HEAP32[$0 + 48 >> 2] | 0) + 2 >> 0] | 0 | 0) | 0 | 0; //@line 568
 }
 return 0; //@line 570
}
function ___fmodeflags($0) {
 $0 = $0 | 0;
 var $$0 = 0, $$0$ = 0, $$2 = 0, $$2$ = 0, $$4 = 0, $2 = 0, $3 = 0, $6 = 0, $9 = 0;
 $2 = (_strchr($0, 43) | 0) == 0; //@line 8222
 $3 = HEAP8[$0 >> 0] | 0; //@line 8223
 $$0 = $2 ? $3 << 24 >> 24 != 114 & 1 : 2; //@line 8226
 $6 = (_strchr($0, 120) | 0) == 0; //@line 8228
 $$0$ = $6 ? $$0 : $$0 | 128; //@line 8230
 $9 = (_strchr($0, 101) | 0) == 0; //@line 8232
 $$2 = $9 ? $$0$ : $$0$ | 524288; //@line 8234
 $$2$ = $3 << 24 >> 24 == 114 ? $$2 : $$2 | 64; //@line 8237
 $$4 = $3 << 24 >> 24 == 119 ? $$2$ | 512 : $$2$; //@line 8240
 return ($3 << 24 >> 24 == 97 ? $$4 | 1024 : $$4) | 0; //@line 8244
}
function ___cxa_is_pointer_type($0) {
 $0 = $0 | 0;
 var $2 = 0, $3 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 14126
 do {
  if (!$0) {
   $3 = 0; //@line 14130
  } else {
   $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 14132
   $2 = ___dynamic_cast($0, 232, 288, 0) | 0; //@line 14133
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 205; //@line 14136
    sp = STACKTOP; //@line 14137
    return 0; //@line 14138
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 14140
    $3 = ($2 | 0) != 0 & 1; //@line 14143
    break;
   }
  }
 } while (0);
 return $3 | 0; //@line 14148
}
function _invoke_ticker__async_cb_7($0) {
 $0 = $0 | 0;
 var $5 = 0, $6 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 14570
 $5 = HEAP32[HEAP32[HEAP32[$0 + 4 >> 2] >> 2] >> 2] | 0; //@line 14576
 $6 = HEAP32[$0 + 8 >> 2] | 0; //@line 14577
 $ReallocAsyncCtx = _emscripten_realloc_async_context(4) | 0; //@line 14578
 FUNCTION_TABLE_vi[$5 & 255]($6); //@line 14579
 if (___async) {
  HEAP32[$ReallocAsyncCtx >> 2] = 133; //@line 14582
  sp = STACKTOP; //@line 14583
  return;
 }
 ___async_unwind = 0; //@line 14586
 HEAP32[$ReallocAsyncCtx >> 2] = 133; //@line 14587
 sp = STACKTOP; //@line 14588
 return;
}
function __ZN4mbed8FileBaseD2Ev__async_cb($0) {
 $0 = $0 | 0;
 var $2 = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 4462
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 4464
 if (HEAP32[$2 + 12 >> 2] | 0) {
  return;
 }
 $ReallocAsyncCtx3 = _emscripten_realloc_async_context(4) | 0; //@line 4472
 __ZN4mbed17remove_filehandleEPNS_10FileHandleE($2 + -4 | 0); //@line 4473
 if (___async) {
  HEAP32[$ReallocAsyncCtx3 >> 2] = 83; //@line 4476
  sp = STACKTOP; //@line 4477
  return;
 }
 ___async_unwind = 0; //@line 4480
 HEAP32[$ReallocAsyncCtx3 >> 2] = 83; //@line 4481
 sp = STACKTOP; //@line 4482
 return;
}
function _getint_671($0) {
 $0 = $0 | 0;
 var $$0$lcssa = 0, $$04 = 0, $11 = 0, $12 = 0, $7 = 0;
 if (!(_isdigit(HEAP8[HEAP32[$0 >> 2] >> 0] | 0) | 0)) {
  $$0$lcssa = 0; //@line 9996
 } else {
  $$04 = 0; //@line 9998
  while (1) {
   $7 = HEAP32[$0 >> 2] | 0; //@line 10001
   $11 = ($$04 * 10 | 0) + -48 + (HEAP8[$7 >> 0] | 0) | 0; //@line 10005
   $12 = $7 + 1 | 0; //@line 10006
   HEAP32[$0 >> 2] = $12; //@line 10007
   if (!(_isdigit(HEAP8[$12 >> 0] | 0) | 0)) {
    $$0$lcssa = $11; //@line 10013
    break;
   } else {
    $$04 = $11; //@line 10016
   }
  }
 }
 return $$0$lcssa | 0; //@line 10020
}
function __ZN15GraphicsDisplay9characterEiii($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $6 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 1027
 $6 = HEAP32[(HEAP32[$0 >> 2] | 0) + 148 >> 2] | 0; //@line 1030
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 1035
 FUNCTION_TABLE_viiiiii[$6 & 7]($0, $1 << 3, $2 << 3, 8, 8, 3834 + ($3 + -31 << 3) | 0); //@line 1036
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 50; //@line 1039
  sp = STACKTOP; //@line 1040
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 1043
  return;
 }
}
function __ZN4mbed10FileHandle5lseekEii($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $5 = 0, $6 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 68
 $5 = HEAP32[(HEAP32[$0 >> 2] | 0) + 16 >> 2] | 0; //@line 71
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 72
 $6 = FUNCTION_TABLE_iiii[$5 & 15]($0, $1, $2) | 0; //@line 73
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 33; //@line 76
  sp = STACKTOP; //@line 77
  return 0; //@line 78
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 80
  return $6 | 0; //@line 81
 }
 return 0; //@line 83
}
function __ZN15GraphicsDisplay7columnsEv($0) {
 $0 = $0 | 0;
 var $3 = 0, $4 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 1071
 $3 = HEAP32[(HEAP32[$0 >> 2] | 0) + 124 >> 2] | 0; //@line 1074
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 1075
 $4 = FUNCTION_TABLE_ii[$3 & 31]($0) | 0; //@line 1076
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 52; //@line 1079
  sp = STACKTOP; //@line 1080
  return 0; //@line 1081
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 1083
  return ($4 | 0) / 8 | 0 | 0; //@line 1085
 }
 return 0; //@line 1087
}
function __ZN15GraphicsDisplay4rowsEv($0) {
 $0 = $0 | 0;
 var $3 = 0, $4 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 1050
 $3 = HEAP32[(HEAP32[$0 >> 2] | 0) + 128 >> 2] | 0; //@line 1053
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 1054
 $4 = FUNCTION_TABLE_ii[$3 & 31]($0) | 0; //@line 1055
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 51; //@line 1058
  sp = STACKTOP; //@line 1059
  return 0; //@line 1060
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 1062
  return ($4 | 0) / 8 | 0 | 0; //@line 1064
 }
 return 0; //@line 1066
}
function __ZN4mbed10FileHandle4tellEv($0) {
 $0 = $0 | 0;
 var $3 = 0, $4 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 2306
 $3 = HEAP32[(HEAP32[$0 >> 2] | 0) + 16 >> 2] | 0; //@line 2309
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 2310
 $4 = FUNCTION_TABLE_iiii[$3 & 15]($0, 0, 1) | 0; //@line 2311
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 89; //@line 2314
  sp = STACKTOP; //@line 2315
  return 0; //@line 2316
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 2318
  return $4 | 0; //@line 2319
 }
 return 0; //@line 2321
}
function _fclose__async_cb($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $4 = 0, $6 = 0, $8 = 0;
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 2752
 $6 = HEAP8[$0 + 12 >> 0] & 1; //@line 2755
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 2757
 $10 = HEAP32[___async_retval >> 2] | HEAP32[$0 + 4 >> 2]; //@line 2760
 $12 = HEAP32[$4 + 92 >> 2] | 0; //@line 2762
 if ($12 | 0) {
  _free($12); //@line 2765
 }
 if ($6) {
  if ($8 | 0) {
   ___unlockfile($4); //@line 2770
  }
 } else {
  _free($4); //@line 2773
 }
 HEAP32[___async_retval >> 2] = $10; //@line 2776
 return;
}
function __ZN4mbed10FileHandle4flenEv($0) {
 $0 = $0 | 0;
 var $3 = 0, $4 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 108
 $3 = HEAP32[(HEAP32[$0 >> 2] | 0) + 40 >> 2] | 0; //@line 111
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 112
 $4 = FUNCTION_TABLE_ii[$3 & 31]($0) | 0; //@line 113
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 35; //@line 116
  sp = STACKTOP; //@line 117
  return 0; //@line 118
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 120
  return $4 | 0; //@line 121
 }
 return 0; //@line 123
}
function _mbed_die__async_cb_80($0) {
 $0 = $0 | 0;
 var $2 = 0, $ReallocAsyncCtx15 = 0, sp = 0;
 sp = STACKTOP; //@line 5662
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 5664
 _emscripten_asm_const_iii(3, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 5666
 $ReallocAsyncCtx15 = _emscripten_realloc_async_context(8) | 0; //@line 5667
 _wait_ms(150); //@line 5668
 if (!___async) {
  ___async_unwind = 0; //@line 5671
 }
 HEAP32[$ReallocAsyncCtx15 >> 2] = 117; //@line 5673
 HEAP32[$ReallocAsyncCtx15 + 4 >> 2] = $2; //@line 5675
 sp = STACKTOP; //@line 5676
 return;
}
function _mbed_die__async_cb($0) {
 $0 = $0 | 0;
 var $2 = 0, $ReallocAsyncCtx16 = 0, sp = 0;
 sp = STACKTOP; //@line 5292
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 5294
 _emscripten_asm_const_iii(3, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 5296
 $ReallocAsyncCtx16 = _emscripten_realloc_async_context(8) | 0; //@line 5297
 _wait_ms(150); //@line 5298
 if (!___async) {
  ___async_unwind = 0; //@line 5301
 }
 HEAP32[$ReallocAsyncCtx16 >> 2] = 116; //@line 5303
 HEAP32[$ReallocAsyncCtx16 + 4 >> 2] = $2; //@line 5305
 sp = STACKTOP; //@line 5306
 return;
}
function __ZN4mbed10FileHandle5fsyncEv($0) {
 $0 = $0 | 0;
 var $3 = 0, $4 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 88
 $3 = HEAP32[(HEAP32[$0 >> 2] | 0) + 24 >> 2] | 0; //@line 91
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 92
 $4 = FUNCTION_TABLE_ii[$3 & 31]($0) | 0; //@line 93
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 34; //@line 96
  sp = STACKTOP; //@line 97
  return 0; //@line 98
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 100
  return $4 | 0; //@line 101
 }
 return 0; //@line 103
}
function __ZN4mbed6StreamD2Ev__async_cb($0) {
 $0 = $0 | 0;
 var $3 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 3507
 $3 = (HEAP32[$0 + 4 >> 2] | 0) + 4 | 0; //@line 3510
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(4) | 0; //@line 3511
 __ZN4mbed8FileBaseD2Ev($3); //@line 3512
 if (___async) {
  HEAP32[$ReallocAsyncCtx2 >> 2] = 95; //@line 3515
  sp = STACKTOP; //@line 3516
  return;
 }
 ___async_unwind = 0; //@line 3519
 HEAP32[$ReallocAsyncCtx2 >> 2] = 95; //@line 3520
 sp = STACKTOP; //@line 3521
 return;
}
function ___fflush_unlocked__async_cb_56($0) {
 $0 = $0 | 0;
 var $10 = 0, $4 = 0, $6 = 0, $8 = 0;
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 4700
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 4702
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 4704
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 4706
 HEAP32[(HEAP32[$0 + 4 >> 2] | 0) + 16 >> 2] = 0; //@line 4708
 HEAP32[$4 >> 2] = 0; //@line 4709
 HEAP32[$6 >> 2] = 0; //@line 4710
 HEAP32[$8 >> 2] = 0; //@line 4711
 HEAP32[$10 >> 2] = 0; //@line 4712
 HEAP32[___async_retval >> 2] = 0; //@line 4714
 return;
}
function __ZN6C128325_putcEi__async_cb($0) {
 $0 = $0 | 0;
 var $16 = 0, $6 = 0, $8 = 0;
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 5801
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 5803
 if ((HEAP32[$0 + 8 >> 2] | 0) >>> 0 < ((HEAP32[___async_retval >> 2] | 0) - (HEAPU8[(HEAP32[HEAP32[$0 + 4 >> 2] >> 2] | 0) + 2 >> 0] | 0) | 0) >>> 0) {
  $16 = ___async_retval; //@line 5813
  HEAP32[$16 >> 2] = $6; //@line 5814
  return;
 }
 HEAP32[$8 >> 2] = 0; //@line 5817
 $16 = ___async_retval; //@line 5818
 HEAP32[$16 >> 2] = $6; //@line 5819
 return;
}
function __ZThn4_N4mbed6StreamD1Ev__async_cb($0) {
 $0 = $0 | 0;
 var $2 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 2843
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 2845
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(4) | 0; //@line 2846
 __ZN4mbed8FileBaseD2Ev($2); //@line 2847
 if (___async) {
  HEAP32[$ReallocAsyncCtx2 >> 2] = 103; //@line 2850
  sp = STACKTOP; //@line 2851
  return;
 }
 ___async_unwind = 0; //@line 2854
 HEAP32[$ReallocAsyncCtx2 >> 2] = 103; //@line 2855
 sp = STACKTOP; //@line 2856
 return;
}
function __ZN6C128325_putcEi__async_cb_83($0) {
 $0 = $0 | 0;
 var $16 = 0, $2 = 0, $4 = 0;
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 5827
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 5829
 if (!(HEAP32[$2 + 4168 >> 2] | 0)) {
  $16 = ___async_retval; //@line 5834
  HEAP32[$16 >> 2] = $4; //@line 5835
  return;
 }
 _emscripten_asm_const_iiiii(0, HEAP32[$2 + 4172 >> 2] | 0, HEAP32[$2 + 4176 >> 2] | 0, HEAP32[$2 + 4180 >> 2] | 0, $2 + 68 | 0) | 0; //@line 5845
 $16 = ___async_retval; //@line 5846
 HEAP32[$16 >> 2] = $4; //@line 5847
 return;
}
function _vsprintf($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $3 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 11819
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 11820
 $3 = _vsnprintf($0, 2147483647, $1, $2) | 0; //@line 11821
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 168; //@line 11824
  sp = STACKTOP; //@line 11825
  return 0; //@line 11826
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 11828
  return $3 | 0; //@line 11829
 }
 return 0; //@line 11831
}
function ___unlist_locked_file($0) {
 $0 = $0 | 0;
 var $$pre = 0, $$sink = 0, $10 = 0, $5 = 0;
 if (HEAP32[$0 + 68 >> 2] | 0) {
  $5 = HEAP32[$0 + 116 >> 2] | 0; //@line 7761
  $$pre = $0 + 112 | 0; //@line 7764
  if ($5 | 0) {
   HEAP32[$5 + 112 >> 2] = HEAP32[$$pre >> 2]; //@line 7768
  }
  $10 = HEAP32[$$pre >> 2] | 0; //@line 7770
  if (!$10) {
   $$sink = (___pthread_self_699() | 0) + 232 | 0; //@line 7775
  } else {
   $$sink = $10 + 116 | 0; //@line 7778
  }
  HEAP32[$$sink >> 2] = $5; //@line 7780
 }
 return;
}
function __ZThn4_N6C12832D0Ev($0) {
 $0 = $0 | 0;
 var $1 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 718
 $1 = $0 + -4 | 0; //@line 719
 $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 720
 __ZN4mbed6StreamD2Ev($1); //@line 721
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 45; //@line 724
  HEAP32[$AsyncCtx + 4 >> 2] = $1; //@line 726
  sp = STACKTOP; //@line 727
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 730
  __ZdlPv($1); //@line 731
  return;
 }
}
function __ZN4mbed10FileHandle6rewindEv($0) {
 $0 = $0 | 0;
 var $3 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 2326
 $3 = HEAP32[(HEAP32[$0 >> 2] | 0) + 16 >> 2] | 0; //@line 2329
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 2330
 FUNCTION_TABLE_iiii[$3 & 15]($0, 0, 0) | 0; //@line 2331
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 90; //@line 2334
  sp = STACKTOP; //@line 2335
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 2338
  return;
 }
}
function __ZN15GraphicsDisplay6windowEiiii($0, $1, $2, $3, $4) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 var $5 = 0, $7 = 0;
 $5 = $1 & 65535; //@line 1155
 HEAP16[$0 + 36 >> 1] = $5; //@line 1157
 $7 = $2 & 65535; //@line 1158
 HEAP16[$0 + 38 >> 1] = $7; //@line 1160
 HEAP16[$0 + 40 >> 1] = $5; //@line 1162
 HEAP16[$0 + 42 >> 1] = $1 + 65535 + $3; //@line 1167
 HEAP16[$0 + 44 >> 1] = $7; //@line 1169
 HEAP16[$0 + 46 >> 1] = $2 + 65535 + $4; //@line 1174
 return;
}
function __ZN4mbed6StreamC2EPKc__async_cb($0) {
 $0 = $0 | 0;
 var $4 = 0, $AsyncRetVal = 0;
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 557
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 561
 HEAP32[HEAP32[$0 + 4 >> 2] >> 2] = $AsyncRetVal; //@line 562
 if (!$AsyncRetVal) {
  HEAP32[$4 >> 2] = HEAP32[(___errno_location() | 0) >> 2]; //@line 567
  _error(4992, $4); //@line 568
  return;
 } else {
  __ZN4mbed26mbed_set_unbuffered_streamEP8_IO_FILE($AsyncRetVal); //@line 571
  return;
 }
}
function _emscripten_async_resume() {
 ___async = 0; //@line 6944
 ___async_unwind = 1; //@line 6945
 while (1) {
  if (!___async_cur_frame) return;
  dynCall_vi(HEAP32[___async_cur_frame + 8 >> 2] | 0, ___async_cur_frame + 8 | 0); //@line 6951
  if (___async) return;
  if (!___async_unwind) {
   ___async_unwind = 1; //@line 6955
   continue;
  }
  stackRestore(HEAP32[___async_cur_frame + 4 >> 2] | 0); //@line 6959
  ___async_cur_frame = HEAP32[___async_cur_frame >> 2] | 0; //@line 6961
 }
}
function __ZN6C12832C2E7PinNameS0_S0_S0_S0_PKc__async_cb($0) {
 $0 = $0 | 0;
 var $10 = 0, $4 = 0, $6 = 0, $8 = 0;
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 4724
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 4726
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 4728
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 4730
 HEAP32[(HEAP32[$0 + 4 >> 2] | 0) + 48 >> 2] = 2006; //@line 4732
 _emscripten_asm_const_iiiii(0, HEAP32[$4 >> 2] | 0, HEAP32[$6 >> 2] | 0, HEAP32[$8 >> 2] | 0, $10 | 0) | 0; //@line 4736
 return;
}
function _freopen__async_cb_89($0) {
 $0 = $0 | 0;
 var $2 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 6357
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 6359
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(8) | 0; //@line 6360
 _fclose($2) | 0; //@line 6361
 if (!___async) {
  ___async_unwind = 0; //@line 6364
 }
 HEAP32[$ReallocAsyncCtx2 >> 2] = 172; //@line 6366
 HEAP32[$ReallocAsyncCtx2 + 4 >> 2] = $2; //@line 6368
 sp = STACKTOP; //@line 6369
 return;
}
function ___uremdi3($a$0, $a$1, $b$0, $b$1) {
 $a$0 = $a$0 | 0;
 $a$1 = $a$1 | 0;
 $b$0 = $b$0 | 0;
 $b$1 = $b$1 | 0;
 var $rem = 0, __stackBase__ = 0;
 __stackBase__ = STACKTOP; //@line 6887
 STACKTOP = STACKTOP + 16 | 0; //@line 6888
 $rem = __stackBase__ | 0; //@line 6889
 ___udivmoddi4($a$0, $a$1, $b$0, $b$1, $rem) | 0; //@line 6890
 STACKTOP = __stackBase__; //@line 6891
 return (tempRet0 = HEAP32[$rem + 4 >> 2] | 0, HEAP32[$rem >> 2] | 0) | 0; //@line 6892
}
function _llvm_cttz_i32(x) {
 x = x | 0;
 var ret = 0;
 ret = HEAP8[cttz_i8 + (x & 255) >> 0] | 0; //@line 6657
 if ((ret | 0) < 8) return ret | 0; //@line 6658
 ret = HEAP8[cttz_i8 + (x >> 8 & 255) >> 0] | 0; //@line 6659
 if ((ret | 0) < 8) return ret + 8 | 0; //@line 6660
 ret = HEAP8[cttz_i8 + (x >> 16 & 255) >> 0] | 0; //@line 6661
 if ((ret | 0) < 8) return ret + 16 | 0; //@line 6662
 return (HEAP8[cttz_i8 + (x >>> 24) >> 0] | 0) + 24 | 0; //@line 6663
}
function __Znaj($0) {
 $0 = $0 | 0;
 var $1 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 12328
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 12329
 $1 = __Znwj($0) | 0; //@line 12330
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 177; //@line 12333
  sp = STACKTOP; //@line 12334
  return 0; //@line 12335
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 12337
  return $1 | 0; //@line 12338
 }
 return 0; //@line 12340
}
function __ZN6C12832D0Ev($0) {
 $0 = $0 | 0;
 var $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 47
 $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 48
 __ZN4mbed6StreamD2Ev($0); //@line 49
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 32; //@line 52
  HEAP32[$AsyncCtx + 4 >> 2] = $0; //@line 54
  sp = STACKTOP; //@line 55
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 58
  __ZdlPv($0); //@line 59
  return;
 }
}
function _exit($0) {
 $0 = $0 | 0;
 var $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 3513
 do {
  if ($0 | 0) {
   $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 3517
   _mbed_die(); //@line 3518
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 136; //@line 3521
    sp = STACKTOP; //@line 3522
    return;
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 3525
    break;
   }
  }
 } while (0);
 while (1) {}
}
function __ZNK10__cxxabiv117__class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($0, $1, $2, $3, $4, $5) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 $5 = $5 | 0;
 if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, $5) | 0) {
  __ZNK10__cxxabiv117__class_type_info29process_static_type_above_dstEPNS_19__dynamic_cast_infoEPKvS4_i(0, $1, $2, $3, $4); //@line 12630
 }
 return;
}
function __ZN6C128325pixelEiii($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $17 = 0;
 if ($1 >>> 0 > 128 | $2 >>> 0 > 32) {
  return;
 }
 if (!(HEAP32[$0 + 52 >> 2] | 0)) {
  HEAP8[($2 << 7) + $1 + ($0 + 68) >> 0] = ($3 | 0) != 0 & 1; //@line 649
  return;
 }
 $17 = ($2 << 7) + $1 + ($0 + 68) | 0; //@line 655
 if (($3 | 0) != 1) {
  return;
 }
 HEAP8[$17 >> 0] = HEAP8[$17 >> 0] ^ 1; //@line 661
 return;
}
function _sn_write($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$ = 0, $5 = 0, $6 = 0, $7 = 0;
 $5 = $0 + 20 | 0; //@line 11778
 $6 = HEAP32[$5 >> 2] | 0; //@line 11779
 $7 = (HEAP32[$0 + 16 >> 2] | 0) - $6 | 0; //@line 11780
 $$ = $7 >>> 0 > $2 >>> 0 ? $2 : $7; //@line 11782
 _memcpy($6 | 0, $1 | 0, $$ | 0) | 0; //@line 11784
 HEAP32[$5 >> 2] = (HEAP32[$5 >> 2] | 0) + $$; //@line 11787
 return $2 | 0; //@line 11788
}
function __GLOBAL__sub_I_main_cpp() {
 var $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 3615
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 3616
 __ZN6C12832C2E7PinNameS0_S0_S0_S0_PKc(8860, 9, 7, 8, 6, 18, 5729); //@line 3617
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 140; //@line 3620
  sp = STACKTOP; //@line 3621
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 3624
  return;
 }
}
function _setvbuf($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $4 = 0;
 $4 = $0 + 75 | 0; //@line 12100
 HEAP8[$4 >> 0] = -1; //@line 12101
 switch ($2 | 0) {
 case 2:
  {
   HEAP32[$0 + 48 >> 2] = 0; //@line 12105
   break;
  }
 case 1:
  {
   HEAP8[$4 >> 0] = 10; //@line 12109
   break;
  }
 default:
  {}
 }
 HEAP32[$0 >> 2] = HEAP32[$0 >> 2] | 64; //@line 12117
 return 0; //@line 12118
}
function __ZL25default_terminate_handlerv__async_cb_17($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $AsyncRetVal = 0;
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 681
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 683
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 685
 HEAP32[$2 >> 2] = 8397; //@line 686
 HEAP32[$2 + 4 >> 2] = $4; //@line 688
 HEAP32[$2 + 8 >> 2] = $AsyncRetVal; //@line 690
 _abort_message(8261, $2); //@line 691
}
function __ZThn4_N15GraphicsDisplayD1Ev($0) {
 $0 = $0 | 0;
 var $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 1484
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 1486
 __ZN4mbed6StreamD2Ev($0 + -4 | 0); //@line 1487
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 63; //@line 1490
  sp = STACKTOP; //@line 1491
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 1494
  return;
 }
}
function _abort_message__async_cb($0) {
 $0 = $0 | 0;
 var $2 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 332
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 334
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(4) | 0; //@line 335
 _fputc(10, $2) | 0; //@line 336
 if (!___async) {
  ___async_unwind = 0; //@line 339
 }
 HEAP32[$ReallocAsyncCtx2 >> 2] = 181; //@line 341
 sp = STACKTOP; //@line 342
 return;
}
function __ZN11TextDisplayC2EPKc__async_cb($0) {
 $0 = $0 | 0;
 var $4 = 0, $6 = 0, $AsyncRetVal = 0;
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 478
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 480
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 484
 HEAP32[(HEAP32[$0 + 4 >> 2] | 0) + 32 >> 2] = $AsyncRetVal; //@line 486
 HEAP32[$4 >> 2] = $6; //@line 487
 _sprintf($AsyncRetVal, 4771, $4) | 0; //@line 488
 return;
}
function __ZThn4_N11TextDisplayD1Ev($0) {
 $0 = $0 | 0;
 var $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 1916
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 1918
 __ZN4mbed6StreamD2Ev($0 + -4 | 0); //@line 1919
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 78; //@line 1922
  sp = STACKTOP; //@line 1923
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 1926
  return;
 }
}
function _wait($0) {
 $0 = +$0;
 var $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 3581
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 3585
 _emscripten_sleep((~~($0 * 1.0e6) | 0) / 1e3 | 0 | 0); //@line 3586
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 138; //@line 3589
  sp = STACKTOP; //@line 3590
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 3593
  return;
 }
}
function _vsnprintf__async_cb($0) {
 $0 = $0 | 0;
 var $13 = 0, $AsyncRetVal = 0;
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 2373
 if (HEAP32[$0 + 4 >> 2] | 0) {
  $13 = HEAP32[HEAP32[$0 + 16 >> 2] >> 2] | 0; //@line 2376
  HEAP8[$13 + ((($13 | 0) == (HEAP32[HEAP32[$0 + 20 >> 2] >> 2] | 0)) << 31 >> 31) >> 0] = 0; //@line 2381
 }
 HEAP32[___async_retval >> 2] = $AsyncRetVal; //@line 2384
 return;
}
function __ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv__async_cb($0) {
 $0 = $0 | 0;
 var $$0 = 0, $2 = 0;
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 2903
 if ((HEAP32[$2 + 24 >> 2] | 0) == 1) {
  HEAP32[HEAP32[$0 + 8 >> 2] >> 2] = HEAP32[$2 + 16 >> 2]; //@line 2914
  $$0 = 1; //@line 2915
 } else {
  $$0 = 0; //@line 2917
 }
 HEAP8[___async_retval >> 0] = $$0 & 1; //@line 2921
 return;
}
function ___stdio_close($0) {
 $0 = $0 | 0;
 var $5 = 0, $vararg_buffer = 0, sp = 0;
 sp = STACKTOP; //@line 7289
 STACKTOP = STACKTOP + 16 | 0; //@line 7290
 $vararg_buffer = sp; //@line 7291
 HEAP32[$vararg_buffer >> 2] = _dummy(HEAP32[$0 + 60 >> 2] | 0) | 0; //@line 7295
 $5 = ___syscall_ret(___syscall6(6, $vararg_buffer | 0) | 0) | 0; //@line 7297
 STACKTOP = sp; //@line 7298
 return $5 | 0; //@line 7298
}
function __ZThn4_N6C12832D1Ev($0) {
 $0 = $0 | 0;
 var $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 701
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 703
 __ZN4mbed6StreamD2Ev($0 + -4 | 0); //@line 704
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 44; //@line 707
  sp = STACKTOP; //@line 708
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 711
  return;
 }
}
function __ZNK10__cxxabiv117__class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, 0) | 0) {
  __ZNK10__cxxabiv117__class_type_info24process_found_base_classEPNS_19__dynamic_cast_infoEPvi(0, $1, $2, $3); //@line 12706
 }
 return;
}
function _error($0, $varargs) {
 $0 = $0 | 0;
 $varargs = $varargs | 0;
 var sp = 0;
 sp = STACKTOP; //@line 3359
 STACKTOP = STACKTOP + 16 | 0; //@line 3360
 if (!(HEAP8[13632] | 0)) {
  HEAP8[13632] = 1; //@line 3365
  HEAP32[sp >> 2] = $varargs; //@line 3366
  _emscripten_alloc_async_context(4, sp) | 0; //@line 3367
  _exit(1); //@line 3368
 } else {
  STACKTOP = sp; //@line 3371
  return;
 }
}
function _wait_ms($0) {
 $0 = $0 | 0;
 var $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 3600
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 3601
 _emscripten_sleep($0 | 0); //@line 3602
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 139; //@line 3605
  sp = STACKTOP; //@line 3606
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 3609
  return;
 }
}
function ___cxa_get_globals_fast() {
 var $3 = 0, sp = 0;
 sp = STACKTOP; //@line 12462
 STACKTOP = STACKTOP + 16 | 0; //@line 12463
 if (!(_pthread_once(13620, 3) | 0)) {
  $3 = _pthread_getspecific(HEAP32[3406] | 0) | 0; //@line 12469
  STACKTOP = sp; //@line 12470
  return $3 | 0; //@line 12470
 } else {
  _abort_message(8536, sp); //@line 12472
 }
 return 0; //@line 12475
}
function __ZNK10__cxxabiv117__class_type_info29process_static_type_below_dstEPNS_19__dynamic_cast_infoEPKvi($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $7 = 0;
 if ((HEAP32[$1 + 4 >> 2] | 0) == ($2 | 0)) {
  $7 = $1 + 28 | 0; //@line 12770
  if ((HEAP32[$7 >> 2] | 0) != 1) {
   HEAP32[$7 >> 2] = $3; //@line 12774
  }
 }
 return;
}
function _emscripten_alloc_async_context(len, sp) {
 len = len | 0;
 sp = sp | 0;
 var new_frame = 0;
 new_frame = stackAlloc(len + 8 | 0) | 0; //@line 6921
 HEAP32[new_frame + 4 >> 2] = sp; //@line 6923
 HEAP32[new_frame >> 2] = ___async_cur_frame; //@line 6925
 ___async_cur_frame = new_frame; //@line 6926
 return ___async_cur_frame + 8 | 0; //@line 6927
}
function ___ofl_add($0) {
 $0 = $0 | 0;
 var $1 = 0, $4 = 0;
 $1 = ___ofl_lock() | 0; //@line 8366
 HEAP32[$0 + 56 >> 2] = HEAP32[$1 >> 2]; //@line 8369
 $4 = HEAP32[$1 >> 2] | 0; //@line 8370
 if ($4 | 0) {
  HEAP32[$4 + 52 >> 2] = $0; //@line 8374
 }
 HEAP32[$1 >> 2] = $0; //@line 8376
 ___ofl_unlock(); //@line 8377
 return $0 | 0; //@line 8378
}
function __ZN10__cxxabiv112_GLOBAL__N_19destruct_EPv($0) {
 $0 = $0 | 0;
 var sp = 0;
 sp = STACKTOP; //@line 13224
 STACKTOP = STACKTOP + 16 | 0; //@line 13225
 _free($0); //@line 13227
 if (!(_pthread_setspecific(HEAP32[3406] | 0, 0) | 0)) {
  STACKTOP = sp; //@line 13232
  return;
 } else {
  _abort_message(8635, sp); //@line 13234
 }
}
function ___cxa_can_catch__async_cb($0) {
 $0 = $0 | 0;
 var $AsyncRetVal = 0;
 $AsyncRetVal = HEAP8[___async_retval >> 0] & 1; //@line 706
 if ($AsyncRetVal) {
  HEAP32[HEAP32[$0 + 8 >> 2] >> 2] = HEAP32[HEAP32[$0 + 4 >> 2] >> 2]; //@line 710
 }
 HEAP32[___async_retval >> 2] = $AsyncRetVal & 1; //@line 713
 return;
}
function _bitshift64Shl(low, high, bits) {
 low = low | 0;
 high = high | 0;
 bits = bits | 0;
 if ((bits | 0) < 32) {
  tempRet0 = high << bits | (low & (1 << bits) - 1 << 32 - bits) >>> 32 - bits; //@line 6910
  return low << bits; //@line 6911
 }
 tempRet0 = low << bits - 32; //@line 6913
 return 0; //@line 6914
}
function _bitshift64Lshr(low, high, bits) {
 low = low | 0;
 high = high | 0;
 bits = bits | 0;
 if ((bits | 0) < 32) {
  tempRet0 = high >>> bits; //@line 6899
  return low >>> bits | (high & (1 << bits) - 1) << 32 - bits; //@line 6900
 }
 tempRet0 = 0; //@line 6902
 return high >>> bits - 32 | 0; //@line 6903
}
function __ZN11TextDisplay5_putcEi__async_cb_27($0) {
 $0 = $0 | 0;
 var $4 = 0;
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 2732
 if ((HEAP32[___async_retval >> 2] | 0) <= (HEAP32[$0 + 4 >> 2] | 0)) {
  HEAP16[HEAP32[$0 + 12 >> 2] >> 1] = 0; //@line 2739
 }
 HEAP32[___async_retval >> 2] = $4; //@line 2742
 return;
}
function __ZN11TextDisplay5_putcEi__async_cb($0) {
 $0 = $0 | 0;
 var $4 = 0;
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 2608
 if ((HEAP32[___async_retval >> 2] | 0) <= (HEAP32[$0 + 4 >> 2] | 0)) {
  HEAP16[HEAP32[$0 + 12 >> 2] >> 1] = 0; //@line 2615
 }
 HEAP32[___async_retval >> 2] = $4; //@line 2618
 return;
}
function _fflush__async_cb_59($0) {
 $0 = $0 | 0;
 var $AsyncRetVal = 0;
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 4987
 if (!(HEAP8[$0 + 4 >> 0] & 1)) {
  ___unlockfile(HEAP32[$0 + 8 >> 2] | 0); //@line 4989
 }
 HEAP32[___async_retval >> 2] = $AsyncRetVal; //@line 4992
 return;
}
function __ZN10__cxxabiv112_GLOBAL__N_110construct_Ev() {
 var sp = 0;
 sp = STACKTOP; //@line 13209
 STACKTOP = STACKTOP + 16 | 0; //@line 13210
 if (!(_pthread_key_create(13624, 190) | 0)) {
  STACKTOP = sp; //@line 13215
  return;
 } else {
  _abort_message(8585, sp); //@line 13217
 }
}
function __ZN6C128323clsEv($0) {
 $0 = $0 | 0;
 var $1 = 0;
 $1 = $0 + 68 | 0; //@line 604
 _memset($1 | 0, 0, 4096) | 0; //@line 605
 _emscripten_asm_const_iiiii(0, HEAP32[$0 + 4172 >> 2] | 0, HEAP32[$0 + 4176 >> 2] | 0, HEAP32[$0 + 4180 >> 2] | 0, $1 | 0) | 0; //@line 612
 return;
}
function _puts__async_cb($0) {
 $0 = $0 | 0;
 var $$lobit = 0;
 $$lobit = HEAP32[___async_retval >> 2] >> 31; //@line 1122
 if (HEAP32[$0 + 4 >> 2] | 0) {
  ___unlockfile(HEAP32[$0 + 8 >> 2] | 0); //@line 1125
 }
 HEAP32[___async_retval >> 2] = $$lobit; //@line 1128
 return;
}
function ___overflow__async_cb($0) {
 $0 = $0 | 0;
 var $$0 = 0;
 if ((HEAP32[___async_retval >> 2] | 0) == 1) {
  $$0 = HEAPU8[HEAP32[$0 + 4 >> 2] >> 0] | 0; //@line 5142
 } else {
  $$0 = -1; //@line 5144
 }
 HEAP32[___async_retval >> 2] = $$0; //@line 5147
 return;
}
function __ZN4mbed6fdopenEPNS_10FileHandleEPKc__async_cb($0) {
 $0 = $0 | 0;
 var $4 = 0;
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 5869
 if (HEAP32[___async_retval >> 2] | 0) {
  _setbuf($4, 0); //@line 5874
 }
 HEAP32[___async_retval >> 2] = $4; //@line 5877
 return;
}
function ___lctrans_impl($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0 = 0;
 if (!$1) {
  $$0 = 0; //@line 8008
 } else {
  $$0 = ___mo_lookup(HEAP32[$1 >> 2] | 0, HEAP32[$1 + 4 >> 2] | 0, $0) | 0; //@line 8014
 }
 return ($$0 | 0 ? $$0 : $0) | 0; //@line 8018
}
function dynCall_viiiiii(index, a1, a2, a3, a4, a5, a6) {
 index = index | 0;
 a1 = a1 | 0;
 a2 = a2 | 0;
 a3 = a3 | 0;
 a4 = a4 | 0;
 a5 = a5 | 0;
 a6 = a6 | 0;
 FUNCTION_TABLE_viiiiii[index & 7](a1 | 0, a2 | 0, a3 | 0, a4 | 0, a5 | 0, a6 | 0); //@line 7182
}
function _fputc__async_cb($0) {
 $0 = $0 | 0;
 var $AsyncRetVal = 0;
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 5776
 ___unlockfile(HEAP32[$0 + 4 >> 2] | 0); //@line 5777
 HEAP32[___async_retval >> 2] = $AsyncRetVal; //@line 5779
 return;
}
function ___DOUBLE_BITS_677($0) {
 $0 = +$0;
 var $1 = 0;
 HEAPF64[tempDoublePtr >> 3] = $0; //@line 11437
 $1 = HEAP32[tempDoublePtr >> 2] | 0; //@line 11437
 tempRet0 = HEAP32[tempDoublePtr + 4 >> 2] | 0; //@line 11439
 return $1 | 0; //@line 11440
}
function _gpio_init_out($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 HEAP32[$0 >> 2] = $1; //@line 3379
 if (($1 | 0) == -1) {
  return;
 }
 HEAP32[$0 + 4 >> 2] = $1; //@line 3385
 _emscripten_asm_const_iii(4, $0 | 0, $1 | 0) | 0; //@line 3386
 return;
}
function ___syscall_ret($0) {
 $0 = $0 | 0;
 var $$0 = 0;
 if ($0 >>> 0 > 4294963200) {
  HEAP32[(___errno_location() | 0) >> 2] = 0 - $0; //@line 7455
  $$0 = -1; //@line 7456
 } else {
  $$0 = $0; //@line 7458
 }
 return $$0 | 0; //@line 7460
}
function _i64Subtract(a, b, c, d) {
 a = a | 0;
 b = b | 0;
 c = c | 0;
 d = d | 0;
 var h = 0;
 h = b - d >>> 0; //@line 6650
 h = b - d - (c >>> 0 > a >>> 0 | 0) >>> 0; //@line 6651
 return (tempRet0 = h, a - c >>> 0 | 0) | 0; //@line 6652
}
function __ZN6C128326heightEv($0) {
 $0 = $0 | 0;
 var $$0 = 0;
 switch (HEAP32[$0 + 56 >> 2] | 0) {
 case 2:
 case 0:
  {
   $$0 = 128; //@line 689
   break;
  }
 default:
  {
   $$0 = 32; //@line 693
  }
 }
 return $$0 | 0; //@line 696
}
function __ZN6C128325widthEv($0) {
 $0 = $0 | 0;
 var $$0 = 0;
 switch (HEAP32[$0 + 56 >> 2] | 0) {
 case 2:
 case 0:
  {
   $$0 = 32; //@line 672
   break;
  }
 default:
  {
   $$0 = 128; //@line 676
  }
 }
 return $$0 | 0; //@line 679
}
function _freopen__async_cb_90($0) {
 $0 = $0 | 0;
 var $4 = 0;
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 6379
 if (HEAP32[$0 + 4 >> 2] | 0) {
  ___unlockfile($4); //@line 6382
 }
 HEAP32[___async_retval >> 2] = $4; //@line 6385
 return;
}
function __ZN6C128327columnsEv__async_cb($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = (HEAP32[___async_retval >> 2] | 0) / (HEAPU8[(HEAP32[(HEAP32[$0 + 4 >> 2] | 0) + 48 >> 2] | 0) + 1 >> 0] | 0 | 0) | 0; //@line 3545
 return;
}
function runPostSets() {}
function _i64Add(a, b, c, d) {
 a = a | 0;
 b = b | 0;
 c = c | 0;
 d = d | 0;
 var l = 0;
 l = a + c >>> 0; //@line 6642
 return (tempRet0 = b + d + (l >>> 0 < a >>> 0 | 0) >>> 0, l | 0) | 0; //@line 6644
}
function dynCall_viiiii(index, a1, a2, a3, a4, a5) {
 index = index | 0;
 a1 = a1 | 0;
 a2 = a2 | 0;
 a3 = a3 | 0;
 a4 = a4 | 0;
 a5 = a5 | 0;
 FUNCTION_TABLE_viiiii[index & 7](a1 | 0, a2 | 0, a3 | 0, a4 | 0, a5 | 0); //@line 7175
}
function __ZN6C128324rowsEv__async_cb($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = (HEAP32[___async_retval >> 2] | 0) / (HEAPU8[(HEAP32[(HEAP32[$0 + 4 >> 2] | 0) + 48 >> 2] | 0) + 2 >> 0] | 0 | 0) | 0; //@line 2837
 return;
}
function ___clang_call_terminate($0) {
 $0 = $0 | 0;
 var sp = 0;
 sp = STACKTOP; //@line 815
 ___cxa_begin_catch($0 | 0) | 0; //@line 816
 _emscripten_alloc_async_context(4, sp) | 0; //@line 817
 __ZSt9terminatev(); //@line 818
}
function __ZN11TextDisplay5claimEP8_IO_FILE__async_cb($0) {
 $0 = $0 | 0;
 _setvbuf(HEAP32[$0 + 4 >> 2] | 0, 0, 1, HEAP32[___async_retval >> 2] | 0) | 0; //@line 4587
 HEAP8[___async_retval >> 0] = 1; //@line 4590
 return;
}
function __ZN6C1283211copy_to_lcdEv($0) {
 $0 = $0 | 0;
 _emscripten_asm_const_iiiii(0, HEAP32[$0 + 4172 >> 2] | 0, HEAP32[$0 + 4176 >> 2] | 0, HEAP32[$0 + 4180 >> 2] | 0, $0 + 68 | 0) | 0; //@line 832
 return;
}
function __ZN6C128326_flushEv($0) {
 $0 = $0 | 0;
 _emscripten_asm_const_iiiii(0, HEAP32[$0 + 4172 >> 2] | 0, HEAP32[$0 + 4176 >> 2] | 0, HEAP32[$0 + 4180 >> 2] | 0, $0 + 68 | 0) | 0; //@line 247
 return;
}
function dynCall_viiii(index, a1, a2, a3, a4) {
 index = index | 0;
 a1 = a1 | 0;
 a2 = a2 | 0;
 a3 = a3 | 0;
 a4 = a4 | 0;
 FUNCTION_TABLE_viiii[index & 7](a1 | 0, a2 | 0, a3 | 0, a4 | 0); //@line 7168
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
  $$0 = 0; //@line 10497
 } else {
  $$0 = _wcrtomb($0, $1, 0) | 0; //@line 10500
 }
 return $$0 | 0; //@line 10502
}
function _strchr($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $2 = 0;
 $2 = ___strchrnul($0, $1) | 0; //@line 8209
 return ((HEAP8[$2 >> 0] | 0) == ($1 & 255) << 24 >> 24 ? $2 : 0) | 0; //@line 8214
}
function dynCall_iiii(index, a1, a2, a3) {
 index = index | 0;
 a1 = a1 | 0;
 a2 = a2 | 0;
 a3 = a3 | 0;
 return FUNCTION_TABLE_iiii[index & 15](a1 | 0, a2 | 0, a3 | 0) | 0; //@line 7133
}
function _emscripten_free_async_context(ctx) {
 ctx = ctx | 0;
 stackRestore(___async_cur_frame | 0); //@line 6933
 ___async_cur_frame = HEAP32[___async_cur_frame >> 2] | 0; //@line 6934
}
function ___udivdi3($a$0, $a$1, $b$0, $b$1) {
 $a$0 = $a$0 | 0;
 $a$1 = $a$1 | 0;
 $b$0 = $b$0 | 0;
 $b$1 = $b$1 | 0;
 return ___udivmoddi4($a$0, $a$1, $b$0, $b$1, 0) | 0; //@line 6879
}
function ___dynamic_cast__async_cb($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = (HEAP32[HEAP32[$0 + 4 >> 2] >> 2] | 0) == 1 ? HEAP32[$0 + 8 >> 2] | 0 : 0; //@line 14319
 return;
}
function _fputs($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $2 = 0;
 $2 = _strlen($0) | 0; //@line 7710
 return ((_fwrite($0, 1, $2, $1) | 0) != ($2 | 0)) << 31 >> 31 | 0; //@line 7714
}
function __ZN11TextDisplay6locateEii($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 HEAP16[$0 + 24 >> 1] = $1; //@line 1889
 HEAP16[$0 + 26 >> 1] = $2; //@line 1892
 return;
}
function __ZN4mbed6Stream5writeEPKvj__async_cb_24($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = (HEAP32[$0 + 4 >> 2] | 0) - (HEAP32[$0 + 8 >> 2] | 0); //@line 2582
 return;
}
function _emscripten_realloc_async_context(len) {
 len = len | 0;
 stackRestore(___async_cur_frame | 0); //@line 6939
 return (stackAlloc(len + 8 | 0) | 0) + 8 | 0; //@line 6940
}
function __ZN4mbed6Stream4readEPvj__async_cb_32($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = (HEAP32[$0 + 4 >> 2] | 0) - (HEAP32[$0 + 8 >> 2] | 0); //@line 3177
 return;
}
function __ZN6C128326locateEii($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 HEAP32[$0 + 60 >> 2] = $1; //@line 622
 HEAP32[$0 + 64 >> 2] = $2; //@line 624
 return;
}
function dynCall_viii(index, a1, a2, a3) {
 index = index | 0;
 a1 = a1 | 0;
 a2 = a2 | 0;
 a3 = a3 | 0;
 FUNCTION_TABLE_viii[index & 3](a1 | 0, a2 | 0, a3 | 0); //@line 7161
}
function establishStackSpace(stackBase, stackMax) {
 stackBase = stackBase | 0;
 stackMax = stackMax | 0;
 STACKTOP = stackBase; //@line 20
 STACK_MAX = stackMax; //@line 21
}
function __ZN15GraphicsDisplay7columnsEv__async_cb($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = (HEAP32[___async_retval >> 2] | 0) / 8 | 0; //@line 5946
 return;
}
function __ZN10__cxxabiv121__vmi_class_type_infoD0Ev($0) {
 $0 = $0 | 0;
 __ZN10__cxxabiv116__shim_type_infoD2Ev($0); //@line 13309
 __ZdlPv($0); //@line 13310
 return;
}
function __ZN10__cxxabiv120__si_class_type_infoD0Ev($0) {
 $0 = $0 | 0;
 __ZN10__cxxabiv116__shim_type_infoD2Ev($0); //@line 12992
 __ZdlPv($0); //@line 12993
 return;
}
function _swapc($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $3 = 0;
 $3 = _llvm_bswap_i32($0 | 0) | 0; //@line 8144
 return (($1 | 0) == 0 ? $0 : $3) | 0; //@line 8146
}
function __ZN15GraphicsDisplay4rowsEv__async_cb($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = (HEAP32[___async_retval >> 2] | 0) / 8 | 0; //@line 6396
 return;
}
function __ZN10__cxxabiv117__class_type_infoD0Ev($0) {
 $0 = $0 | 0;
 __ZN10__cxxabiv116__shim_type_infoD2Ev($0); //@line 12520
 __ZdlPv($0); //@line 12521
 return;
}
function ___cxa_is_pointer_type__async_cb($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = (HEAP32[___async_retval >> 2] | 0) != 0 & 1; //@line 14558
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
  ___fwritex($1, $2, $0) | 0; //@line 9982
 }
 return;
}
function dynCall_iii(index, a1, a2) {
 index = index | 0;
 a1 = a1 | 0;
 a2 = a2 | 0;
 return FUNCTION_TABLE_iii[index & 7](a1 | 0, a2 | 0) | 0; //@line 7126
}
function __ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 return ($0 | 0) == ($1 | 0) | 0; //@line 12717
}
function __ZSt15get_new_handlerv() {
 var $0 = 0;
 $0 = HEAP32[3407] | 0; //@line 14082
 HEAP32[3407] = $0 + 0; //@line 14084
 return $0 | 0; //@line 14086
}
function __ZN4mbed10FileHandle5lseekEii__async_cb($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = HEAP32[___async_retval >> 2]; //@line 626
 return;
}
function __ZN4mbed10FileHandle5fsyncEv__async_cb($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = HEAP32[___async_retval >> 2]; //@line 2592
 return;
}
function __ZSt13get_terminatev() {
 var $0 = 0;
 $0 = HEAP32[428] | 0; //@line 13299
 HEAP32[428] = $0 + 0; //@line 13301
 return $0 | 0; //@line 13303
}
function __ZN4mbed10FileHandle4tellEv__async_cb($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = HEAP32[___async_retval >> 2]; //@line 6021
 return;
}
function __ZN4mbed10FileHandle4flenEv__async_cb($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = HEAP32[___async_retval >> 2]; //@line 2980
 return;
}
function __ZNK10__cxxabiv122__base_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function dynCall_vii(index, a1, a2) {
 index = index | 0;
 a1 = a1 | 0;
 a2 = a2 | 0;
 FUNCTION_TABLE_vii[index & 7](a1 | 0, a2 | 0); //@line 7154
}
function __ZNK10__cxxabiv120__si_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function __ZN4mbed6Stream6printfEPKcz__async_cb_34($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = HEAP32[$0 + 12 >> 2]; //@line 3283
 return;
}
function b9(p0, p1, p2, p3, p4, p5) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 p3 = p3 | 0;
 p4 = p4 | 0;
 p5 = p5 | 0;
 abort(9); //@line 7216
}
function __ZN4mbed10FileHandle4sizeEv__async_cb_86($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = HEAP32[$0 + 4 >> 2]; //@line 6115
 return;
}
function __ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function _llvm_bswap_i32(x) {
 x = x | 0;
 return (x & 255) << 24 | (x >> 8 & 255) << 16 | (x >> 16 & 255) << 8 | x >>> 24 | 0; //@line 6966
}
function __ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_84($0) {
 $0 = $0 | 0;
 return;
}
function __ZNK10__cxxabiv120__si_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function __ZN4mbed6Stream4putcEi__async_cb_5($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = HEAP32[$0 + 4 >> 2]; //@line 14500
 return;
}
function __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function __ZN6C1283211set_auto_upEj($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 HEAP32[$0 + 4168 >> 2] = ($1 | 0) != 0 & 1; //@line 852
 return;
}
function _strerror($0) {
 $0 = $0 | 0;
 return ___strerror_l($0, HEAP32[(___pthread_self_85() | 0) + 188 >> 2] | 0) | 0; //@line 10445
}
function _vsprintf__async_cb($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = HEAP32[___async_retval >> 2]; //@line 14546
 return;
}
function _fflush__async_cb_60($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = HEAP32[___async_retval >> 2]; //@line 5002
 return;
}
function _fputc__async_cb_82($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = HEAP32[___async_retval >> 2]; //@line 5789
 return;
}
function _sprintf__async_cb($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = HEAP32[___async_retval >> 2]; //@line 2114
 return;
}
function dynCall_ii(index, a1) {
 index = index | 0;
 a1 = a1 | 0;
 return FUNCTION_TABLE_ii[index & 31](a1 | 0) | 0; //@line 7119
}
function __Znaj__async_cb($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = HEAP32[___async_retval >> 2]; //@line 14432
 return;
}
function __ZN11TextDisplay10foregroundEt($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 HEAP16[$0 + 28 >> 1] = $1; //@line 1901
 return;
}
function __ZN11TextDisplay10backgroundEt($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 HEAP16[$0 + 30 >> 1] = $1; //@line 1910
 return;
}
function b8(p0, p1, p2, p3, p4) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 p3 = p3 | 0;
 p4 = p4 | 0;
 abort(8); //@line 7213
}
function __ZSt11__terminatePFvvE__async_cb($0) {
 $0 = $0 | 0;
 _abort_message(8688, HEAP32[$0 + 4 >> 2] | 0); //@line 3554
}
function _setbuf($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 _setvbuf($0, $1, $1 | 0 ? 0 : 2, 1024) | 0; //@line 12090
 return;
}
function __ZN4mbed8FileBaseD0Ev__async_cb_64($0) {
 $0 = $0 | 0;
 __ZdlPv(HEAP32[$0 + 4 >> 2] | 0); //@line 5274
 return;
}
function dynCall_vi(index, a1) {
 index = index | 0;
 a1 = a1 | 0;
 FUNCTION_TABLE_vi[index & 255](a1 | 0); //@line 7147
}
function __ZN6C128327setmodeEi($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 HEAP32[$0 + 52 >> 2] = $1; //@line 841
 return;
}
function __ZThn4_N6C12832D0Ev__async_cb($0) {
 $0 = $0 | 0;
 __ZdlPv(HEAP32[$0 + 4 >> 2] | 0); //@line 2123
 return;
}
function __ZN4mbed26mbed_set_unbuffered_streamEP8_IO_FILE($0) {
 $0 = $0 | 0;
 _setbuf($0, 0); //@line 3537
 return;
}
function b2(p0, p1, p2) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 abort(2); //@line 7192
 return 0; //@line 7192
}
function __ZN4mbed6Stream4seekEii($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 return 0; //@line 2651
}
function __ZN6C12832D0Ev__async_cb($0) {
 $0 = $0 | 0;
 __ZdlPv(HEAP32[$0 + 4 >> 2] | 0); //@line 358
 return;
}
function b7(p0, p1, p2, p3) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 p3 = p3 | 0;
 abort(7); //@line 7210
}
function ___lctrans($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 return ___lctrans_impl($0, $1) | 0; //@line 11690
}
function _freopen__async_cb_88($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = 0; //@line 6351
 return;
}
function __ZN4mbed10FileHandle5sigioENS_8CallbackIFvvEEE($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 return;
}
function _main__async_cb($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = 0; //@line 3562
 return;
}
function __ZNK4mbed10FileHandle4pollEs($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 return 17; //@line 137
}
function b1(p0, p1) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 abort(1); //@line 7189
 return 0; //@line 7189
}
function __ZN4mbed10FileHandle12set_blockingEb($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 return -1;
}
function __ZN4mbed17remove_filehandleEPNS_10FileHandleE__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function dynCall_v(index) {
 index = index | 0;
 FUNCTION_TABLE_v[index & 3](); //@line 7140
}
function _mbed_error_printf($0, $varargs) {
 $0 = $0 | 0;
 $varargs = $varargs | 0;
 return;
}
function b6(p0, p1, p2) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 abort(6); //@line 7207
}
function _isdigit($0) {
 $0 = $0 | 0;
 return ($0 + -48 | 0) >>> 0 < 10 | 0; //@line 7587
}
function __ZThn4_N15GraphicsDisplayD0Ev($0) {
 $0 = $0 | 0;
 _llvm_trap(); //@line 1502
}
function __ZN4mbed8FileBaseC2EPKcNS_8PathTypeE__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function __ZThn4_N11TextDisplayD0Ev($0) {
 $0 = $0 | 0;
 _llvm_trap(); //@line 1934
}
function __ZN4mbed10FileHandle6isattyEv($0) {
 $0 = $0 | 0;
 return 0; //@line 2301
}
function __ZN15GraphicsDisplay9characterEiii__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function ___ofl_lock() {
 ___lock(13608); //@line 8383
 return 13616; //@line 8384
}
function __ZThn4_N4mbed6StreamD0Ev($0) {
 $0 = $0 | 0;
 _llvm_trap(); //@line 2726
}
function __ZN4mbed11NonCopyableINS_10FileHandleEED2Ev($0) {
 $0 = $0 | 0;
 return;
}
function __ZN4mbed10FileHandleD0Ev($0) {
 $0 = $0 | 0;
 _llvm_trap(); //@line 2288
}
function __ZN15GraphicsDisplayD0Ev($0) {
 $0 = $0 | 0;
 _llvm_trap(); //@line 1018
}
function __ZNK10__cxxabiv116__shim_type_info5noop2Ev($0) {
 $0 = $0 | 0;
 return;
}
function __ZNK10__cxxabiv116__shim_type_info5noop1Ev($0) {
 $0 = $0 | 0;
 return;
}
function __ZN4mbed10FileHandle4syncEv($0) {
 $0 = $0 | 0;
 return 0; //@line 2295
}
function setTempRet0(value) {
 value = value | 0;
 tempRet0 = value; //@line 38
}
function b0(p0) {
 p0 = p0 | 0;
 abort(0); //@line 7186
 return 0; //@line 7186
}
function _frexpl($0, $1) {
 $0 = +$0;
 $1 = $1 | 0;
 return +(+_frexp($0, $1));
}
function _abort_message__async_cb_12($0) {
 $0 = $0 | 0;
 _abort(); //@line 349
}
function ___cxa_pure_virtual__wrapper() {
 ___cxa_pure_virtual(); //@line 7198
}
function __ZThn4_N15GraphicsDisplayD1Ev__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function __ZN4mbed6Stream6isattyEv($0) {
 $0 = $0 | 0;
 return 0; //@line 2669
}
function __ZN4mbed10FileHandle6rewindEv__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function __ZN15GraphicsDisplay3clsEv__async_cb_14($0) {
 $0 = $0 | 0;
 return;
}
function __ZN11TextDisplayD0Ev($0) {
 $0 = $0 | 0;
 _llvm_trap(); //@line 1546
}
function __ZN4mbed6StreamD0Ev($0) {
 $0 = $0 | 0;
 _llvm_trap(); //@line 2440
}
function __ZN4mbed6Stream5closeEv($0) {
 $0 = $0 | 0;
 return 0; //@line 2657
}
function _mbed_error_vfprintf($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 return;
}
function __ZThn4_N4mbed6StreamD1Ev__async_cb_29($0) {
 $0 = $0 | 0;
 return;
}
function __ZN4mbed6Stream4tellEv($0) {
 $0 = $0 | 0;
 return 0; //@line 2675
}
function __ZN4mbed6Stream4syncEv($0) {
 $0 = $0 | 0;
 return 0; //@line 2663
}
function __ZN4mbed6Stream4sizeEv($0) {
 $0 = $0 | 0;
 return 0; //@line 2687
}
function __ZN10__cxxabiv116__shim_type_infoD2Ev($0) {
 $0 = $0 | 0;
 return;
}
function ___pthread_self_910() {
 return _pthread_self() | 0; //@line 11611
}
function __ZN15GraphicsDisplayC2EPKc__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function ___pthread_self_85() {
 return _pthread_self() | 0; //@line 11617
}
function ___pthread_self_699() {
 return _pthread_self() | 0; //@line 7794
}
function __ZThn4_N11TextDisplayD1Ev__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function b5(p0, p1) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 abort(5); //@line 7204
}
function __ZN4mbed8FileBaseD2Ev__async_cb_54($0) {
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
 _free($0); //@line 12346
 return;
}
function __ZN4mbed6StreamD2Ev__async_cb_37($0) {
 $0 = $0 | 0;
 return;
}
function _mbed_assert_internal__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function __ZThn4_N6C12832D1Ev__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function _handle_interrupt_in($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
}
function ___ofl_unlock() {
 ___unlock(13608); //@line 8389
 return;
}
function __ZN11TextDisplay5_getcEv($0) {
 $0 = $0 | 0;
 return -1;
}
function _dummy($0) {
 $0 = $0 | 0;
 return $0 | 0; //@line 7471
}
function ___lockfile($0) {
 $0 = $0 | 0;
 return 0; //@line 7800
}
function __ZN4mbed6Stream6unlockEv($0) {
 $0 = $0 | 0;
 return;
}
function __ZN4mbed6Stream6rewindEv($0) {
 $0 = $0 | 0;
 return;
}
function _invoke_ticker__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function ___clang_call_terminate__async_cb($0) {
 $0 = $0 | 0;
}
function __ZN4mbed6Stream4lockEv($0) {
 $0 = $0 | 0;
 return;
}
function _exit__async_cb($0) {
 $0 = $0 | 0;
 while (1) {}
}
function ___errno_location() {
 return 13604; //@line 7465
}
function __ZSt9terminatev__async_cb_65($0) {
 $0 = $0 | 0;
}
function __ZNSt9type_infoD2Ev($0) {
 $0 = $0 | 0;
 return;
}
function getTempRet0() {
 return tempRet0 | 0; //@line 41
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
 abort(4); //@line 7201
}
function _core_util_critical_section_enter() {
 return;
}
function __ZSt9terminatev__async_cb($0) {
 $0 = $0 | 0;
}
function _wait__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function _pthread_self() {
 return 1344; //@line 7592
}
function ___unlockfile($0) {
 $0 = $0 | 0;
 return;
}
function setAsync() {
 ___async = 1; //@line 25
}
function _error__async_cb($0) {
 $0 = $0 | 0;
}
function b3() {
 abort(3); //@line 7195
}

// EMSCRIPTEN_END_FUNCS
var FUNCTION_TABLE_ii = [b0,__ZN4mbed6Stream5closeEv,__ZN4mbed6Stream4syncEv,__ZN4mbed6Stream6isattyEv,__ZN4mbed6Stream4tellEv,__ZN4mbed6Stream4sizeEv,__ZN4mbed10FileHandle5fsyncEv,__ZN4mbed10FileHandle4flenEv,__ZN11TextDisplay5_getcEv,__ZN6C128324rowsEv,__ZN6C128327columnsEv,__ZN6C128325widthEv,__ZN6C128326heightEv,__ZN15GraphicsDisplay4rowsEv,__ZN15GraphicsDisplay7columnsEv,__ZN4mbed10FileHandle4syncEv,__ZN4mbed10FileHandle6isattyEv,__ZN4mbed10FileHandle4tellEv,__ZN4mbed10FileHandle4sizeEv,___stdio_close,b0,b0,b0,b0,b0,b0,b0,b0,b0
,b0,b0,b0];
var FUNCTION_TABLE_iii = [b1,__ZN4mbed10FileHandle12set_blockingEb,__ZNK4mbed10FileHandle4pollEs,__ZN6C128325_putcEi,__ZN11TextDisplay5claimEP8_IO_FILE,__ZN11TextDisplay5_putcEi,b1,b1];
var FUNCTION_TABLE_iiii = [b2,__ZN4mbed6Stream4readEPvj,__ZN4mbed6Stream5writeEPKvj,__ZN4mbed6Stream4seekEii,__ZN4mbed10FileHandle5lseekEii,___stdio_write,___stdio_seek,___stdout_write,_sn_write,__ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv,___stdio_read,b2,b2,b2,b2,b2];
var FUNCTION_TABLE_v = [b3,___cxa_pure_virtual__wrapper,__ZL25default_terminate_handlerv,__ZN10__cxxabiv112_GLOBAL__N_110construct_Ev];
var FUNCTION_TABLE_vi = [b4,__ZN4mbed6StreamD2Ev,__ZN6C12832D0Ev,__ZN4mbed6Stream6rewindEv,__ZN6C128326_flushEv,__ZN4mbed6Stream4lockEv,__ZN4mbed6Stream6unlockEv,__ZN6C128323clsEv,__ZThn4_N6C12832D1Ev,__ZThn4_N6C12832D0Ev,__ZN15GraphicsDisplayD0Ev,__ZN15GraphicsDisplay3clsEv,__ZThn4_N15GraphicsDisplayD1Ev,__ZThn4_N15GraphicsDisplayD0Ev,__ZN11TextDisplayD0Ev,__ZN11TextDisplay3clsEv,__ZThn4_N11TextDisplayD1Ev,__ZThn4_N11TextDisplayD0Ev,__ZN4mbed8FileBaseD2Ev,__ZN4mbed8FileBaseD0Ev,__ZN4mbed11NonCopyableINS_10FileHandleEED2Ev,__ZN4mbed10FileHandleD0Ev,__ZN4mbed10FileHandle6rewindEv,__ZN4mbed6StreamD0Ev,__ZThn4_N4mbed6StreamD1Ev,__ZThn4_N4mbed6StreamD0Ev,__ZN10__cxxabiv116__shim_type_infoD2Ev,__ZN10__cxxabiv117__class_type_infoD0Ev,__ZNK10__cxxabiv116__shim_type_info5noop1Ev
,__ZNK10__cxxabiv116__shim_type_info5noop2Ev,__ZN10__cxxabiv120__si_class_type_infoD0Ev,__ZN10__cxxabiv121__vmi_class_type_infoD0Ev,__ZN6C12832D0Ev__async_cb,__ZN4mbed10FileHandle5lseekEii__async_cb,__ZN4mbed10FileHandle5fsyncEv__async_cb,__ZN4mbed10FileHandle4flenEv__async_cb,__ZN6C128325_putcEi__async_cb,__ZN6C128325_putcEi__async_cb_83,__ZN6C128329characterEiii__async_cb,__ZN6C128329characterEiii__async_cb_19,__ZN6C128329characterEiii__async_cb_20,__ZN6C128329characterEiii__async_cb_21,__ZN6C128324rowsEv__async_cb,__ZN6C128327columnsEv__async_cb,__ZThn4_N6C12832D1Ev__async_cb,__ZThn4_N6C12832D0Ev__async_cb,__ZN6C12832C2E7PinNameS0_S0_S0_S0_PKc__async_cb_57,__ZN6C12832C2E7PinNameS0_S0_S0_S0_PKc__async_cb,__ZN6C128328print_bmE6Bitmapii__async_cb,__ZN6C128328print_bmE6Bitmapii__async_cb_18,__ZN15GraphicsDisplay9characterEiii__async_cb,__ZN15GraphicsDisplay4rowsEv__async_cb,__ZN15GraphicsDisplay7columnsEv__async_cb,__ZN15GraphicsDisplay3clsEv__async_cb,__ZN15GraphicsDisplay3clsEv__async_cb_13,__ZN15GraphicsDisplay3clsEv__async_cb_14,__ZN15GraphicsDisplay4putpEi__async_cb,__ZN15GraphicsDisplay4fillEiiiii__async_cb,__ZN15GraphicsDisplay4fillEiiiii__async_cb_81
,__ZN15GraphicsDisplay4blitEiiiiPKi__async_cb,__ZN15GraphicsDisplay4blitEiiiiPKi__async_cb_58,__ZN15GraphicsDisplay7blitbitEiiiiPKc__async_cb,__ZN15GraphicsDisplay7blitbitEiiiiPKc__async_cb_1,__ZThn4_N15GraphicsDisplayD1Ev__async_cb,__ZN15GraphicsDisplayC2EPKc__async_cb_3,__ZN15GraphicsDisplayC2EPKc__async_cb,__ZN11TextDisplay5_putcEi__async_cb,__ZN11TextDisplay5_putcEi__async_cb_25,__ZN11TextDisplay5_putcEi__async_cb_26,__ZN11TextDisplay5_putcEi__async_cb_27,__ZN11TextDisplay5claimEP8_IO_FILE__async_cb_55,__ZN11TextDisplay5claimEP8_IO_FILE__async_cb,__ZN11TextDisplay3clsEv__async_cb,__ZN11TextDisplay3clsEv__async_cb_91,__ZN11TextDisplay3clsEv__async_cb_92,__ZN11TextDisplay3clsEv__async_cb_95,__ZN11TextDisplay3clsEv__async_cb_93,__ZN11TextDisplay3clsEv__async_cb_94,__ZThn4_N11TextDisplayD1Ev__async_cb,__ZN11TextDisplayC2EPKc__async_cb_15,__ZN11TextDisplayC2EPKc__async_cb,__ZN4mbed8FileBaseD2Ev__async_cb_53,__ZN4mbed8FileBaseD2Ev__async_cb,__ZN4mbed8FileBaseD2Ev__async_cb_54,__ZN4mbed8FileBaseD0Ev__async_cb_63,__ZN4mbed8FileBaseD0Ev__async_cb,__ZN4mbed8FileBaseD0Ev__async_cb_64,__ZN4mbed8FileBaseC2EPKcNS_8PathTypeE__async_cb_62,__ZN4mbed8FileBaseC2EPKcNS_8PathTypeE__async_cb
,__ZN4mbed10FileHandle4tellEv__async_cb,__ZN4mbed10FileHandle6rewindEv__async_cb,__ZN4mbed10FileHandle4sizeEv__async_cb,__ZN4mbed10FileHandle4sizeEv__async_cb_85,__ZN4mbed10FileHandle4sizeEv__async_cb_86,__ZN4mbed6StreamD2Ev__async_cb,__ZN4mbed6StreamD2Ev__async_cb_37,__ZN4mbed6Stream4readEPvj__async_cb,__ZN4mbed6Stream4readEPvj__async_cb_31,__ZN4mbed6Stream4readEPvj__async_cb_32,__ZN4mbed6Stream5writeEPKvj__async_cb,__ZN4mbed6Stream5writeEPKvj__async_cb_23,__ZN4mbed6Stream5writeEPKvj__async_cb_24,__ZThn4_N4mbed6StreamD1Ev__async_cb,__ZThn4_N4mbed6StreamD1Ev__async_cb_29,__ZN4mbed6StreamC2EPKc__async_cb_16,__ZN4mbed6StreamC2EPKc__async_cb,__ZN4mbed6Stream4putcEi__async_cb,__ZN4mbed6Stream4putcEi__async_cb_6,__ZN4mbed6Stream4putcEi__async_cb_4,__ZN4mbed6Stream4putcEi__async_cb_5,__ZN4mbed6Stream6printfEPKcz__async_cb,__ZN4mbed6Stream6printfEPKcz__async_cb_36,__ZN4mbed6Stream6printfEPKcz__async_cb_33,__ZN4mbed6Stream6printfEPKcz__async_cb_34,__ZN4mbed6Stream6printfEPKcz__async_cb_35,_mbed_assert_internal__async_cb,_mbed_die__async_cb_80,_mbed_die__async_cb_79,_mbed_die__async_cb_78
,_mbed_die__async_cb_77,_mbed_die__async_cb_76,_mbed_die__async_cb_75,_mbed_die__async_cb_74,_mbed_die__async_cb_73,_mbed_die__async_cb_72,_mbed_die__async_cb_71,_mbed_die__async_cb_70,_mbed_die__async_cb_69,_mbed_die__async_cb_68,_mbed_die__async_cb_67,_mbed_die__async_cb_66,_mbed_die__async_cb,_invoke_ticker__async_cb_7,_invoke_ticker__async_cb,__ZN4mbed17remove_filehandleEPNS_10FileHandleE__async_cb_52,__ZN4mbed17remove_filehandleEPNS_10FileHandleE__async_cb,_exit__async_cb,__ZN4mbed6fdopenEPNS_10FileHandleEPKc__async_cb,_wait__async_cb,_wait_ms__async_cb,__GLOBAL__sub_I_main_cpp__async_cb,_main__async_cb_39,_main__async_cb_38,_main__async_cb_47,_main__async_cb_46,_main__async_cb_51,_main__async_cb_45,_main__async_cb_44,_main__async_cb_50
,_main__async_cb_43,_main__async_cb_42,_main__async_cb_49,_main__async_cb_41,_main__async_cb_40,_main__async_cb_48,_main__async_cb,___overflow__async_cb,_fclose__async_cb_28,_fclose__async_cb,_fflush__async_cb_60,_fflush__async_cb_59,_fflush__async_cb_61,_fflush__async_cb,___fflush_unlocked__async_cb,___fflush_unlocked__async_cb_56,_vfprintf__async_cb,_vsnprintf__async_cb,_sprintf__async_cb,_vsprintf__async_cb,_freopen__async_cb,_freopen__async_cb_90,_freopen__async_cb_89,_freopen__async_cb_88,_fputc__async_cb_82,_fputc__async_cb,_puts__async_cb,__Znwj__async_cb,__Znaj__async_cb,__ZL25default_terminate_handlerv__async_cb
,__ZL25default_terminate_handlerv__async_cb_17,_abort_message__async_cb,_abort_message__async_cb_12,__ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv__async_cb_30,__ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv__async_cb,___dynamic_cast__async_cb,___dynamic_cast__async_cb_2,__ZNK10__cxxabiv120__si_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb,__ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb,__ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_84,__ZNK10__cxxabiv120__si_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb,__ZN10__cxxabiv112_GLOBAL__N_19destruct_EPv,__ZSt11__terminatePFvvE__async_cb,__ZNK10__cxxabiv121__vmi_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb_22,__ZNK10__cxxabiv121__vmi_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb,__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_11,__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_10,__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_9,__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_8,__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb,__ZNK10__cxxabiv121__vmi_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb_87,__ZNK10__cxxabiv121__vmi_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb,__ZNK10__cxxabiv122__base_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb,__ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb,__ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb,___cxa_can_catch__async_cb,___cxa_is_pointer_type__async_cb,b4,b4,b4
,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4
,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4];
var FUNCTION_TABLE_vii = [b5,__ZN4mbed10FileHandle5sigioENS_8CallbackIFvvEEE,__ZN11TextDisplay10foregroundEt,__ZN11TextDisplay10backgroundEt,__ZN15GraphicsDisplay4putpEi,b5,b5,b5];
var FUNCTION_TABLE_viii = [b6,__ZN6C128326locateEii,__ZN11TextDisplay6locateEii,b6];
var FUNCTION_TABLE_viiii = [b7,__ZN6C128329characterEiii,__ZN6C128325pixelEiii,__ZN15GraphicsDisplay9characterEiii,__ZNK10__cxxabiv117__class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi,__ZNK10__cxxabiv120__si_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi,__ZNK10__cxxabiv121__vmi_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi,b7];
var FUNCTION_TABLE_viiiii = [b8,__ZN15GraphicsDisplay6windowEiiii,__ZNK10__cxxabiv117__class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib,__ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib,__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib,b8,b8,b8];
var FUNCTION_TABLE_viiiiii = [b9,__ZN15GraphicsDisplay4fillEiiiii,__ZN15GraphicsDisplay4blitEiiiiPKi,__ZN15GraphicsDisplay7blitbitEiiiiPKc,__ZNK10__cxxabiv117__class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib,__ZNK10__cxxabiv120__si_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib,__ZNK10__cxxabiv121__vmi_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib,b9];

  return { __GLOBAL__sub_I_main_cpp: __GLOBAL__sub_I_main_cpp, ___cxa_can_catch: ___cxa_can_catch, ___cxa_is_pointer_type: ___cxa_is_pointer_type, ___errno_location: ___errno_location, ___udivdi3: ___udivdi3, ___uremdi3: ___uremdi3, _bitshift64Lshr: _bitshift64Lshr, _bitshift64Shl: _bitshift64Shl, _emscripten_alloc_async_context: _emscripten_alloc_async_context, _emscripten_async_resume: _emscripten_async_resume, _emscripten_free_async_context: _emscripten_free_async_context, _emscripten_realloc_async_context: _emscripten_realloc_async_context, _free: _free, _handle_interrupt_in: _handle_interrupt_in, _i64Add: _i64Add, _i64Subtract: _i64Subtract, _invoke_ticker: _invoke_ticker, _llvm_bswap_i32: _llvm_bswap_i32, _main: _main, _malloc: _malloc, _memcpy: _memcpy, _memset: _memset, _sbrk: _sbrk, dynCall_ii: dynCall_ii, dynCall_iii: dynCall_iii, dynCall_iiii: dynCall_iiii, dynCall_v: dynCall_v, dynCall_vi: dynCall_vi, dynCall_vii: dynCall_vii, dynCall_viii: dynCall_viii, dynCall_viiii: dynCall_viiii, dynCall_viiiii: dynCall_viiiii, dynCall_viiiiii: dynCall_viiiiii, establishStackSpace: establishStackSpace, getTempRet0: getTempRet0, runPostSets: runPostSets, setAsync: setAsync, setTempRet0: setTempRet0, setThrew: setThrew, stackAlloc: stackAlloc, stackRestore: stackRestore, stackSave: stackSave };
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
var dynCall_iii = Module["dynCall_iii"] = asm["dynCall_iii"];
var dynCall_iiii = Module["dynCall_iiii"] = asm["dynCall_iiii"];
var dynCall_v = Module["dynCall_v"] = asm["dynCall_v"];
var dynCall_vi = Module["dynCall_vi"] = asm["dynCall_vi"];
var dynCall_vii = Module["dynCall_vii"] = asm["dynCall_vii"];
var dynCall_viii = Module["dynCall_viii"] = asm["dynCall_viii"];
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






//# sourceMappingURL=lcd.js.map
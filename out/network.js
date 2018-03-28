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

var ASM_CONSTS = [function($0) { return window.MbedJSHal.network.get_mac_address(); },
 function($0) { return window.MbedJSHal.network.get_ip_address(); },
 function($0) { return window.MbedJSHal.network.get_netmask(); },
 function($0) { return window.MbedJSHal.network.socket_open($0); },
 function($0) { return window.MbedJSHal.network.socket_close($0); },
 function($0, $1, $2) { return window.MbedJSHal.network.socket_connect($0, $1, $2); },
 function($0, $1, $2) { return window.MbedJSHal.network.socket_send($0, $1, $2); },
 function($0, $1, $2) { return window.MbedJSHal.network.socket_recv($0, $1, $2); },
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




STATIC_BASE = GLOBAL_BASE;

STATICTOP = STATIC_BASE + 8656;
/* global initializers */  __ATINIT__.push();


memoryInitializer = "network.js.mem";





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

function invoke_iiiii(index,a1,a2,a3,a4) {
  try {
    return Module["dynCall_iiiii"](index,a1,a2,a3,a4);
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

Module.asmLibraryArg = { "abort": abort, "assert": assert, "enlargeMemory": enlargeMemory, "getTotalMemory": getTotalMemory, "abortOnCannotGrowMemory": abortOnCannotGrowMemory, "invoke_ii": invoke_ii, "invoke_iii": invoke_iii, "invoke_iiii": invoke_iiii, "invoke_iiiii": invoke_iiiii, "invoke_iiiiii": invoke_iiiiii, "invoke_iiiiiii": invoke_iiiiiii, "invoke_v": invoke_v, "invoke_vi": invoke_vi, "invoke_vii": invoke_vii, "invoke_viiii": invoke_viiii, "invoke_viiiii": invoke_viiiii, "invoke_viiiiii": invoke_viiiiii, "__ZSt18uncaught_exceptionv": __ZSt18uncaught_exceptionv, "___cxa_begin_catch": ___cxa_begin_catch, "___cxa_find_matching_catch": ___cxa_find_matching_catch, "___cxa_pure_virtual": ___cxa_pure_virtual, "___gxx_personality_v0": ___gxx_personality_v0, "___resumeException": ___resumeException, "___setErrNo": ___setErrNo, "___syscall140": ___syscall140, "___syscall146": ___syscall146, "___syscall54": ___syscall54, "___syscall6": ___syscall6, "_abort": _abort, "_emscripten_asm_const_ii": _emscripten_asm_const_ii, "_emscripten_asm_const_iii": _emscripten_asm_const_iii, "_emscripten_asm_const_iiii": _emscripten_asm_const_iiii, "_emscripten_get_now": _emscripten_get_now, "_emscripten_memcpy_big": _emscripten_memcpy_big, "_emscripten_set_main_loop": _emscripten_set_main_loop, "_emscripten_set_main_loop_timing": _emscripten_set_main_loop_timing, "_emscripten_sleep": _emscripten_sleep, "_llvm_trap": _llvm_trap, "_pthread_getspecific": _pthread_getspecific, "_pthread_key_create": _pthread_key_create, "_pthread_once": _pthread_once, "_pthread_setspecific": _pthread_setspecific, "flush_NO_FILESYSTEM": flush_NO_FILESYSTEM, "DYNAMICTOP_PTR": DYNAMICTOP_PTR, "tempDoublePtr": tempDoublePtr, "ABORT": ABORT, "STACKTOP": STACKTOP, "STACK_MAX": STACK_MAX, "cttz_i8": cttz_i8, "___async": ___async, "___async_unwind": ___async_unwind, "___async_retval": ___async_retval, "___async_cur_frame": ___async_cur_frame };
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
  var invoke_iiiii=env.invoke_iiiii;
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
 sp = STACKTOP; //@line 5592
 STACKTOP = STACKTOP + 16 | 0; //@line 5593
 $1 = sp; //@line 5594
 do {
  if ($0 >>> 0 < 245) {
   $6 = $0 >>> 0 < 11 ? 16 : $0 + 11 & -8; //@line 5601
   $7 = $6 >>> 3; //@line 5602
   $8 = HEAP32[1758] | 0; //@line 5603
   $9 = $8 >>> $7; //@line 5604
   if ($9 & 3 | 0) {
    $14 = ($9 & 1 ^ 1) + $7 | 0; //@line 5610
    $16 = 7072 + ($14 << 1 << 2) | 0; //@line 5612
    $17 = $16 + 8 | 0; //@line 5613
    $18 = HEAP32[$17 >> 2] | 0; //@line 5614
    $19 = $18 + 8 | 0; //@line 5615
    $20 = HEAP32[$19 >> 2] | 0; //@line 5616
    do {
     if (($20 | 0) == ($16 | 0)) {
      HEAP32[1758] = $8 & ~(1 << $14); //@line 5623
     } else {
      if ((HEAP32[1762] | 0) >>> 0 > $20 >>> 0) {
       _abort(); //@line 5628
      }
      $27 = $20 + 12 | 0; //@line 5631
      if ((HEAP32[$27 >> 2] | 0) == ($18 | 0)) {
       HEAP32[$27 >> 2] = $16; //@line 5635
       HEAP32[$17 >> 2] = $20; //@line 5636
       break;
      } else {
       _abort(); //@line 5639
      }
     }
    } while (0);
    $30 = $14 << 3; //@line 5644
    HEAP32[$18 + 4 >> 2] = $30 | 3; //@line 5647
    $34 = $18 + $30 + 4 | 0; //@line 5649
    HEAP32[$34 >> 2] = HEAP32[$34 >> 2] | 1; //@line 5652
    $$0 = $19; //@line 5653
    STACKTOP = sp; //@line 5654
    return $$0 | 0; //@line 5654
   }
   $37 = HEAP32[1760] | 0; //@line 5656
   if ($6 >>> 0 > $37 >>> 0) {
    if ($9 | 0) {
     $41 = 2 << $7; //@line 5662
     $44 = $9 << $7 & ($41 | 0 - $41); //@line 5665
     $47 = ($44 & 0 - $44) + -1 | 0; //@line 5668
     $49 = $47 >>> 12 & 16; //@line 5670
     $50 = $47 >>> $49; //@line 5671
     $52 = $50 >>> 5 & 8; //@line 5673
     $54 = $50 >>> $52; //@line 5675
     $56 = $54 >>> 2 & 4; //@line 5677
     $58 = $54 >>> $56; //@line 5679
     $60 = $58 >>> 1 & 2; //@line 5681
     $62 = $58 >>> $60; //@line 5683
     $64 = $62 >>> 1 & 1; //@line 5685
     $67 = ($52 | $49 | $56 | $60 | $64) + ($62 >>> $64) | 0; //@line 5688
     $69 = 7072 + ($67 << 1 << 2) | 0; //@line 5690
     $70 = $69 + 8 | 0; //@line 5691
     $71 = HEAP32[$70 >> 2] | 0; //@line 5692
     $72 = $71 + 8 | 0; //@line 5693
     $73 = HEAP32[$72 >> 2] | 0; //@line 5694
     do {
      if (($73 | 0) == ($69 | 0)) {
       $77 = $8 & ~(1 << $67); //@line 5700
       HEAP32[1758] = $77; //@line 5701
       $98 = $77; //@line 5702
      } else {
       if ((HEAP32[1762] | 0) >>> 0 > $73 >>> 0) {
        _abort(); //@line 5707
       }
       $80 = $73 + 12 | 0; //@line 5710
       if ((HEAP32[$80 >> 2] | 0) == ($71 | 0)) {
        HEAP32[$80 >> 2] = $69; //@line 5714
        HEAP32[$70 >> 2] = $73; //@line 5715
        $98 = $8; //@line 5716
        break;
       } else {
        _abort(); //@line 5719
       }
      }
     } while (0);
     $83 = $67 << 3; //@line 5724
     $84 = $83 - $6 | 0; //@line 5725
     HEAP32[$71 + 4 >> 2] = $6 | 3; //@line 5728
     $87 = $71 + $6 | 0; //@line 5729
     HEAP32[$87 + 4 >> 2] = $84 | 1; //@line 5732
     HEAP32[$71 + $83 >> 2] = $84; //@line 5734
     if ($37 | 0) {
      $92 = HEAP32[1763] | 0; //@line 5737
      $93 = $37 >>> 3; //@line 5738
      $95 = 7072 + ($93 << 1 << 2) | 0; //@line 5740
      $96 = 1 << $93; //@line 5741
      if (!($98 & $96)) {
       HEAP32[1758] = $98 | $96; //@line 5746
       $$0199 = $95; //@line 5748
       $$pre$phiZ2D = $95 + 8 | 0; //@line 5748
      } else {
       $101 = $95 + 8 | 0; //@line 5750
       $102 = HEAP32[$101 >> 2] | 0; //@line 5751
       if ((HEAP32[1762] | 0) >>> 0 > $102 >>> 0) {
        _abort(); //@line 5755
       } else {
        $$0199 = $102; //@line 5758
        $$pre$phiZ2D = $101; //@line 5758
       }
      }
      HEAP32[$$pre$phiZ2D >> 2] = $92; //@line 5761
      HEAP32[$$0199 + 12 >> 2] = $92; //@line 5763
      HEAP32[$92 + 8 >> 2] = $$0199; //@line 5765
      HEAP32[$92 + 12 >> 2] = $95; //@line 5767
     }
     HEAP32[1760] = $84; //@line 5769
     HEAP32[1763] = $87; //@line 5770
     $$0 = $72; //@line 5771
     STACKTOP = sp; //@line 5772
     return $$0 | 0; //@line 5772
    }
    $108 = HEAP32[1759] | 0; //@line 5774
    if (!$108) {
     $$0197 = $6; //@line 5777
    } else {
     $112 = ($108 & 0 - $108) + -1 | 0; //@line 5781
     $114 = $112 >>> 12 & 16; //@line 5783
     $115 = $112 >>> $114; //@line 5784
     $117 = $115 >>> 5 & 8; //@line 5786
     $119 = $115 >>> $117; //@line 5788
     $121 = $119 >>> 2 & 4; //@line 5790
     $123 = $119 >>> $121; //@line 5792
     $125 = $123 >>> 1 & 2; //@line 5794
     $127 = $123 >>> $125; //@line 5796
     $129 = $127 >>> 1 & 1; //@line 5798
     $134 = HEAP32[7336 + (($117 | $114 | $121 | $125 | $129) + ($127 >>> $129) << 2) >> 2] | 0; //@line 5803
     $138 = (HEAP32[$134 + 4 >> 2] & -8) - $6 | 0; //@line 5807
     $143 = HEAP32[$134 + 16 + (((HEAP32[$134 + 16 >> 2] | 0) == 0 & 1) << 2) >> 2] | 0; //@line 5813
     if (!$143) {
      $$0192$lcssa$i = $134; //@line 5816
      $$0193$lcssa$i = $138; //@line 5816
     } else {
      $$01926$i = $134; //@line 5818
      $$01935$i = $138; //@line 5818
      $146 = $143; //@line 5818
      while (1) {
       $149 = (HEAP32[$146 + 4 >> 2] & -8) - $6 | 0; //@line 5823
       $150 = $149 >>> 0 < $$01935$i >>> 0; //@line 5824
       $$$0193$i = $150 ? $149 : $$01935$i; //@line 5825
       $$$0192$i = $150 ? $146 : $$01926$i; //@line 5826
       $146 = HEAP32[$146 + 16 + (((HEAP32[$146 + 16 >> 2] | 0) == 0 & 1) << 2) >> 2] | 0; //@line 5832
       if (!$146) {
        $$0192$lcssa$i = $$$0192$i; //@line 5835
        $$0193$lcssa$i = $$$0193$i; //@line 5835
        break;
       } else {
        $$01926$i = $$$0192$i; //@line 5838
        $$01935$i = $$$0193$i; //@line 5838
       }
      }
     }
     $157 = HEAP32[1762] | 0; //@line 5842
     if ($157 >>> 0 > $$0192$lcssa$i >>> 0) {
      _abort(); //@line 5845
     }
     $159 = $$0192$lcssa$i + $6 | 0; //@line 5848
     if ($159 >>> 0 <= $$0192$lcssa$i >>> 0) {
      _abort(); //@line 5851
     }
     $162 = HEAP32[$$0192$lcssa$i + 24 >> 2] | 0; //@line 5855
     $164 = HEAP32[$$0192$lcssa$i + 12 >> 2] | 0; //@line 5857
     do {
      if (($164 | 0) == ($$0192$lcssa$i | 0)) {
       $175 = $$0192$lcssa$i + 20 | 0; //@line 5861
       $176 = HEAP32[$175 >> 2] | 0; //@line 5862
       if (!$176) {
        $178 = $$0192$lcssa$i + 16 | 0; //@line 5865
        $179 = HEAP32[$178 >> 2] | 0; //@line 5866
        if (!$179) {
         $$3$i = 0; //@line 5869
         break;
        } else {
         $$1196$i = $179; //@line 5872
         $$1198$i = $178; //@line 5872
        }
       } else {
        $$1196$i = $176; //@line 5875
        $$1198$i = $175; //@line 5875
       }
       while (1) {
        $181 = $$1196$i + 20 | 0; //@line 5878
        $182 = HEAP32[$181 >> 2] | 0; //@line 5879
        if ($182 | 0) {
         $$1196$i = $182; //@line 5882
         $$1198$i = $181; //@line 5882
         continue;
        }
        $184 = $$1196$i + 16 | 0; //@line 5885
        $185 = HEAP32[$184 >> 2] | 0; //@line 5886
        if (!$185) {
         break;
        } else {
         $$1196$i = $185; //@line 5891
         $$1198$i = $184; //@line 5891
        }
       }
       if ($157 >>> 0 > $$1198$i >>> 0) {
        _abort(); //@line 5896
       } else {
        HEAP32[$$1198$i >> 2] = 0; //@line 5899
        $$3$i = $$1196$i; //@line 5900
        break;
       }
      } else {
       $167 = HEAP32[$$0192$lcssa$i + 8 >> 2] | 0; //@line 5905
       if ($157 >>> 0 > $167 >>> 0) {
        _abort(); //@line 5908
       }
       $169 = $167 + 12 | 0; //@line 5911
       if ((HEAP32[$169 >> 2] | 0) != ($$0192$lcssa$i | 0)) {
        _abort(); //@line 5915
       }
       $172 = $164 + 8 | 0; //@line 5918
       if ((HEAP32[$172 >> 2] | 0) == ($$0192$lcssa$i | 0)) {
        HEAP32[$169 >> 2] = $164; //@line 5922
        HEAP32[$172 >> 2] = $167; //@line 5923
        $$3$i = $164; //@line 5924
        break;
       } else {
        _abort(); //@line 5927
       }
      }
     } while (0);
     L73 : do {
      if ($162 | 0) {
       $190 = HEAP32[$$0192$lcssa$i + 28 >> 2] | 0; //@line 5936
       $191 = 7336 + ($190 << 2) | 0; //@line 5937
       do {
        if (($$0192$lcssa$i | 0) == (HEAP32[$191 >> 2] | 0)) {
         HEAP32[$191 >> 2] = $$3$i; //@line 5942
         if (!$$3$i) {
          HEAP32[1759] = $108 & ~(1 << $190); //@line 5948
          break L73;
         }
        } else {
         if ((HEAP32[1762] | 0) >>> 0 > $162 >>> 0) {
          _abort(); //@line 5955
         } else {
          HEAP32[$162 + 16 + (((HEAP32[$162 + 16 >> 2] | 0) != ($$0192$lcssa$i | 0) & 1) << 2) >> 2] = $$3$i; //@line 5963
          if (!$$3$i) {
           break L73;
          } else {
           break;
          }
         }
        }
       } while (0);
       $204 = HEAP32[1762] | 0; //@line 5973
       if ($204 >>> 0 > $$3$i >>> 0) {
        _abort(); //@line 5976
       }
       HEAP32[$$3$i + 24 >> 2] = $162; //@line 5980
       $208 = HEAP32[$$0192$lcssa$i + 16 >> 2] | 0; //@line 5982
       do {
        if ($208 | 0) {
         if ($204 >>> 0 > $208 >>> 0) {
          _abort(); //@line 5988
         } else {
          HEAP32[$$3$i + 16 >> 2] = $208; //@line 5992
          HEAP32[$208 + 24 >> 2] = $$3$i; //@line 5994
          break;
         }
        }
       } while (0);
       $214 = HEAP32[$$0192$lcssa$i + 20 >> 2] | 0; //@line 6000
       if ($214 | 0) {
        if ((HEAP32[1762] | 0) >>> 0 > $214 >>> 0) {
         _abort(); //@line 6006
        } else {
         HEAP32[$$3$i + 20 >> 2] = $214; //@line 6010
         HEAP32[$214 + 24 >> 2] = $$3$i; //@line 6012
         break;
        }
       }
      }
     } while (0);
     if ($$0193$lcssa$i >>> 0 < 16) {
      $221 = $$0193$lcssa$i + $6 | 0; //@line 6020
      HEAP32[$$0192$lcssa$i + 4 >> 2] = $221 | 3; //@line 6023
      $225 = $$0192$lcssa$i + $221 + 4 | 0; //@line 6025
      HEAP32[$225 >> 2] = HEAP32[$225 >> 2] | 1; //@line 6028
     } else {
      HEAP32[$$0192$lcssa$i + 4 >> 2] = $6 | 3; //@line 6032
      HEAP32[$159 + 4 >> 2] = $$0193$lcssa$i | 1; //@line 6035
      HEAP32[$159 + $$0193$lcssa$i >> 2] = $$0193$lcssa$i; //@line 6037
      if ($37 | 0) {
       $234 = HEAP32[1763] | 0; //@line 6040
       $235 = $37 >>> 3; //@line 6041
       $237 = 7072 + ($235 << 1 << 2) | 0; //@line 6043
       $238 = 1 << $235; //@line 6044
       if (!($8 & $238)) {
        HEAP32[1758] = $8 | $238; //@line 6049
        $$0189$i = $237; //@line 6051
        $$pre$phi$iZ2D = $237 + 8 | 0; //@line 6051
       } else {
        $242 = $237 + 8 | 0; //@line 6053
        $243 = HEAP32[$242 >> 2] | 0; //@line 6054
        if ((HEAP32[1762] | 0) >>> 0 > $243 >>> 0) {
         _abort(); //@line 6058
        } else {
         $$0189$i = $243; //@line 6061
         $$pre$phi$iZ2D = $242; //@line 6061
        }
       }
       HEAP32[$$pre$phi$iZ2D >> 2] = $234; //@line 6064
       HEAP32[$$0189$i + 12 >> 2] = $234; //@line 6066
       HEAP32[$234 + 8 >> 2] = $$0189$i; //@line 6068
       HEAP32[$234 + 12 >> 2] = $237; //@line 6070
      }
      HEAP32[1760] = $$0193$lcssa$i; //@line 6072
      HEAP32[1763] = $159; //@line 6073
     }
     $$0 = $$0192$lcssa$i + 8 | 0; //@line 6076
     STACKTOP = sp; //@line 6077
     return $$0 | 0; //@line 6077
    }
   } else {
    $$0197 = $6; //@line 6080
   }
  } else {
   if ($0 >>> 0 > 4294967231) {
    $$0197 = -1; //@line 6085
   } else {
    $251 = $0 + 11 | 0; //@line 6087
    $252 = $251 & -8; //@line 6088
    $253 = HEAP32[1759] | 0; //@line 6089
    if (!$253) {
     $$0197 = $252; //@line 6092
    } else {
     $255 = 0 - $252 | 0; //@line 6094
     $256 = $251 >>> 8; //@line 6095
     if (!$256) {
      $$0358$i = 0; //@line 6098
     } else {
      if ($252 >>> 0 > 16777215) {
       $$0358$i = 31; //@line 6102
      } else {
       $261 = ($256 + 1048320 | 0) >>> 16 & 8; //@line 6106
       $262 = $256 << $261; //@line 6107
       $265 = ($262 + 520192 | 0) >>> 16 & 4; //@line 6110
       $267 = $262 << $265; //@line 6112
       $270 = ($267 + 245760 | 0) >>> 16 & 2; //@line 6115
       $275 = 14 - ($265 | $261 | $270) + ($267 << $270 >>> 15) | 0; //@line 6120
       $$0358$i = $252 >>> ($275 + 7 | 0) & 1 | $275 << 1; //@line 6126
      }
     }
     $282 = HEAP32[7336 + ($$0358$i << 2) >> 2] | 0; //@line 6130
     L117 : do {
      if (!$282) {
       $$2355$i = 0; //@line 6134
       $$3$i203 = 0; //@line 6134
       $$3350$i = $255; //@line 6134
       label = 81; //@line 6135
      } else {
       $$0342$i = 0; //@line 6142
       $$0347$i = $255; //@line 6142
       $$0353$i = $282; //@line 6142
       $$0359$i = $252 << (($$0358$i | 0) == 31 ? 0 : 25 - ($$0358$i >>> 1) | 0); //@line 6142
       $$0362$i = 0; //@line 6142
       while (1) {
        $292 = (HEAP32[$$0353$i + 4 >> 2] & -8) - $252 | 0; //@line 6147
        if ($292 >>> 0 < $$0347$i >>> 0) {
         if (!$292) {
          $$414$i = $$0353$i; //@line 6152
          $$435113$i = 0; //@line 6152
          $$435712$i = $$0353$i; //@line 6152
          label = 85; //@line 6153
          break L117;
         } else {
          $$1343$i = $$0353$i; //@line 6156
          $$1348$i = $292; //@line 6156
         }
        } else {
         $$1343$i = $$0342$i; //@line 6159
         $$1348$i = $$0347$i; //@line 6159
        }
        $296 = HEAP32[$$0353$i + 20 >> 2] | 0; //@line 6162
        $$0353$i = HEAP32[$$0353$i + 16 + ($$0359$i >>> 31 << 2) >> 2] | 0; //@line 6165
        $$1363$i = ($296 | 0) == 0 | ($296 | 0) == ($$0353$i | 0) ? $$0362$i : $296; //@line 6169
        $302 = ($$0353$i | 0) == 0; //@line 6170
        if ($302) {
         $$2355$i = $$1363$i; //@line 6175
         $$3$i203 = $$1343$i; //@line 6175
         $$3350$i = $$1348$i; //@line 6175
         label = 81; //@line 6176
         break;
        } else {
         $$0342$i = $$1343$i; //@line 6179
         $$0347$i = $$1348$i; //@line 6179
         $$0359$i = $$0359$i << (($302 ^ 1) & 1); //@line 6179
         $$0362$i = $$1363$i; //@line 6179
        }
       }
      }
     } while (0);
     if ((label | 0) == 81) {
      if (($$2355$i | 0) == 0 & ($$3$i203 | 0) == 0) {
       $306 = 2 << $$0358$i; //@line 6189
       $309 = $253 & ($306 | 0 - $306); //@line 6192
       if (!$309) {
        $$0197 = $252; //@line 6195
        break;
       }
       $313 = ($309 & 0 - $309) + -1 | 0; //@line 6200
       $315 = $313 >>> 12 & 16; //@line 6202
       $316 = $313 >>> $315; //@line 6203
       $318 = $316 >>> 5 & 8; //@line 6205
       $320 = $316 >>> $318; //@line 6207
       $322 = $320 >>> 2 & 4; //@line 6209
       $324 = $320 >>> $322; //@line 6211
       $326 = $324 >>> 1 & 2; //@line 6213
       $328 = $324 >>> $326; //@line 6215
       $330 = $328 >>> 1 & 1; //@line 6217
       $$4$ph$i = 0; //@line 6223
       $$4357$ph$i = HEAP32[7336 + (($318 | $315 | $322 | $326 | $330) + ($328 >>> $330) << 2) >> 2] | 0; //@line 6223
      } else {
       $$4$ph$i = $$3$i203; //@line 6225
       $$4357$ph$i = $$2355$i; //@line 6225
      }
      if (!$$4357$ph$i) {
       $$4$lcssa$i = $$4$ph$i; //@line 6229
       $$4351$lcssa$i = $$3350$i; //@line 6229
      } else {
       $$414$i = $$4$ph$i; //@line 6231
       $$435113$i = $$3350$i; //@line 6231
       $$435712$i = $$4357$ph$i; //@line 6231
       label = 85; //@line 6232
      }
     }
     if ((label | 0) == 85) {
      while (1) {
       label = 0; //@line 6237
       $340 = (HEAP32[$$435712$i + 4 >> 2] & -8) - $252 | 0; //@line 6241
       $341 = $340 >>> 0 < $$435113$i >>> 0; //@line 6242
       $$$4351$i = $341 ? $340 : $$435113$i; //@line 6243
       $$4357$$4$i = $341 ? $$435712$i : $$414$i; //@line 6244
       $$435712$i = HEAP32[$$435712$i + 16 + (((HEAP32[$$435712$i + 16 >> 2] | 0) == 0 & 1) << 2) >> 2] | 0; //@line 6250
       if (!$$435712$i) {
        $$4$lcssa$i = $$4357$$4$i; //@line 6253
        $$4351$lcssa$i = $$$4351$i; //@line 6253
        break;
       } else {
        $$414$i = $$4357$$4$i; //@line 6256
        $$435113$i = $$$4351$i; //@line 6256
        label = 85; //@line 6257
       }
      }
     }
     if (!$$4$lcssa$i) {
      $$0197 = $252; //@line 6263
     } else {
      if ($$4351$lcssa$i >>> 0 < ((HEAP32[1760] | 0) - $252 | 0) >>> 0) {
       $352 = HEAP32[1762] | 0; //@line 6269
       if ($352 >>> 0 > $$4$lcssa$i >>> 0) {
        _abort(); //@line 6272
       }
       $354 = $$4$lcssa$i + $252 | 0; //@line 6275
       if ($354 >>> 0 <= $$4$lcssa$i >>> 0) {
        _abort(); //@line 6278
       }
       $357 = HEAP32[$$4$lcssa$i + 24 >> 2] | 0; //@line 6282
       $359 = HEAP32[$$4$lcssa$i + 12 >> 2] | 0; //@line 6284
       do {
        if (($359 | 0) == ($$4$lcssa$i | 0)) {
         $370 = $$4$lcssa$i + 20 | 0; //@line 6288
         $371 = HEAP32[$370 >> 2] | 0; //@line 6289
         if (!$371) {
          $373 = $$4$lcssa$i + 16 | 0; //@line 6292
          $374 = HEAP32[$373 >> 2] | 0; //@line 6293
          if (!$374) {
           $$3372$i = 0; //@line 6296
           break;
          } else {
           $$1370$i = $374; //@line 6299
           $$1374$i = $373; //@line 6299
          }
         } else {
          $$1370$i = $371; //@line 6302
          $$1374$i = $370; //@line 6302
         }
         while (1) {
          $376 = $$1370$i + 20 | 0; //@line 6305
          $377 = HEAP32[$376 >> 2] | 0; //@line 6306
          if ($377 | 0) {
           $$1370$i = $377; //@line 6309
           $$1374$i = $376; //@line 6309
           continue;
          }
          $379 = $$1370$i + 16 | 0; //@line 6312
          $380 = HEAP32[$379 >> 2] | 0; //@line 6313
          if (!$380) {
           break;
          } else {
           $$1370$i = $380; //@line 6318
           $$1374$i = $379; //@line 6318
          }
         }
         if ($352 >>> 0 > $$1374$i >>> 0) {
          _abort(); //@line 6323
         } else {
          HEAP32[$$1374$i >> 2] = 0; //@line 6326
          $$3372$i = $$1370$i; //@line 6327
          break;
         }
        } else {
         $362 = HEAP32[$$4$lcssa$i + 8 >> 2] | 0; //@line 6332
         if ($352 >>> 0 > $362 >>> 0) {
          _abort(); //@line 6335
         }
         $364 = $362 + 12 | 0; //@line 6338
         if ((HEAP32[$364 >> 2] | 0) != ($$4$lcssa$i | 0)) {
          _abort(); //@line 6342
         }
         $367 = $359 + 8 | 0; //@line 6345
         if ((HEAP32[$367 >> 2] | 0) == ($$4$lcssa$i | 0)) {
          HEAP32[$364 >> 2] = $359; //@line 6349
          HEAP32[$367 >> 2] = $362; //@line 6350
          $$3372$i = $359; //@line 6351
          break;
         } else {
          _abort(); //@line 6354
         }
        }
       } while (0);
       L164 : do {
        if (!$357) {
         $475 = $253; //@line 6362
        } else {
         $385 = HEAP32[$$4$lcssa$i + 28 >> 2] | 0; //@line 6365
         $386 = 7336 + ($385 << 2) | 0; //@line 6366
         do {
          if (($$4$lcssa$i | 0) == (HEAP32[$386 >> 2] | 0)) {
           HEAP32[$386 >> 2] = $$3372$i; //@line 6371
           if (!$$3372$i) {
            $391 = $253 & ~(1 << $385); //@line 6376
            HEAP32[1759] = $391; //@line 6377
            $475 = $391; //@line 6378
            break L164;
           }
          } else {
           if ((HEAP32[1762] | 0) >>> 0 > $357 >>> 0) {
            _abort(); //@line 6385
           } else {
            HEAP32[$357 + 16 + (((HEAP32[$357 + 16 >> 2] | 0) != ($$4$lcssa$i | 0) & 1) << 2) >> 2] = $$3372$i; //@line 6393
            if (!$$3372$i) {
             $475 = $253; //@line 6396
             break L164;
            } else {
             break;
            }
           }
          }
         } while (0);
         $399 = HEAP32[1762] | 0; //@line 6404
         if ($399 >>> 0 > $$3372$i >>> 0) {
          _abort(); //@line 6407
         }
         HEAP32[$$3372$i + 24 >> 2] = $357; //@line 6411
         $403 = HEAP32[$$4$lcssa$i + 16 >> 2] | 0; //@line 6413
         do {
          if ($403 | 0) {
           if ($399 >>> 0 > $403 >>> 0) {
            _abort(); //@line 6419
           } else {
            HEAP32[$$3372$i + 16 >> 2] = $403; //@line 6423
            HEAP32[$403 + 24 >> 2] = $$3372$i; //@line 6425
            break;
           }
          }
         } while (0);
         $409 = HEAP32[$$4$lcssa$i + 20 >> 2] | 0; //@line 6431
         if (!$409) {
          $475 = $253; //@line 6434
         } else {
          if ((HEAP32[1762] | 0) >>> 0 > $409 >>> 0) {
           _abort(); //@line 6439
          } else {
           HEAP32[$$3372$i + 20 >> 2] = $409; //@line 6443
           HEAP32[$409 + 24 >> 2] = $$3372$i; //@line 6445
           $475 = $253; //@line 6446
           break;
          }
         }
        }
       } while (0);
       do {
        if ($$4351$lcssa$i >>> 0 < 16) {
         $416 = $$4351$lcssa$i + $252 | 0; //@line 6455
         HEAP32[$$4$lcssa$i + 4 >> 2] = $416 | 3; //@line 6458
         $420 = $$4$lcssa$i + $416 + 4 | 0; //@line 6460
         HEAP32[$420 >> 2] = HEAP32[$420 >> 2] | 1; //@line 6463
        } else {
         HEAP32[$$4$lcssa$i + 4 >> 2] = $252 | 3; //@line 6467
         HEAP32[$354 + 4 >> 2] = $$4351$lcssa$i | 1; //@line 6470
         HEAP32[$354 + $$4351$lcssa$i >> 2] = $$4351$lcssa$i; //@line 6472
         $428 = $$4351$lcssa$i >>> 3; //@line 6473
         if ($$4351$lcssa$i >>> 0 < 256) {
          $431 = 7072 + ($428 << 1 << 2) | 0; //@line 6477
          $432 = HEAP32[1758] | 0; //@line 6478
          $433 = 1 << $428; //@line 6479
          if (!($432 & $433)) {
           HEAP32[1758] = $432 | $433; //@line 6484
           $$0368$i = $431; //@line 6486
           $$pre$phi$i211Z2D = $431 + 8 | 0; //@line 6486
          } else {
           $437 = $431 + 8 | 0; //@line 6488
           $438 = HEAP32[$437 >> 2] | 0; //@line 6489
           if ((HEAP32[1762] | 0) >>> 0 > $438 >>> 0) {
            _abort(); //@line 6493
           } else {
            $$0368$i = $438; //@line 6496
            $$pre$phi$i211Z2D = $437; //@line 6496
           }
          }
          HEAP32[$$pre$phi$i211Z2D >> 2] = $354; //@line 6499
          HEAP32[$$0368$i + 12 >> 2] = $354; //@line 6501
          HEAP32[$354 + 8 >> 2] = $$0368$i; //@line 6503
          HEAP32[$354 + 12 >> 2] = $431; //@line 6505
          break;
         }
         $444 = $$4351$lcssa$i >>> 8; //@line 6508
         if (!$444) {
          $$0361$i = 0; //@line 6511
         } else {
          if ($$4351$lcssa$i >>> 0 > 16777215) {
           $$0361$i = 31; //@line 6515
          } else {
           $449 = ($444 + 1048320 | 0) >>> 16 & 8; //@line 6519
           $450 = $444 << $449; //@line 6520
           $453 = ($450 + 520192 | 0) >>> 16 & 4; //@line 6523
           $455 = $450 << $453; //@line 6525
           $458 = ($455 + 245760 | 0) >>> 16 & 2; //@line 6528
           $463 = 14 - ($453 | $449 | $458) + ($455 << $458 >>> 15) | 0; //@line 6533
           $$0361$i = $$4351$lcssa$i >>> ($463 + 7 | 0) & 1 | $463 << 1; //@line 6539
          }
         }
         $469 = 7336 + ($$0361$i << 2) | 0; //@line 6542
         HEAP32[$354 + 28 >> 2] = $$0361$i; //@line 6544
         $471 = $354 + 16 | 0; //@line 6545
         HEAP32[$471 + 4 >> 2] = 0; //@line 6547
         HEAP32[$471 >> 2] = 0; //@line 6548
         $473 = 1 << $$0361$i; //@line 6549
         if (!($475 & $473)) {
          HEAP32[1759] = $475 | $473; //@line 6554
          HEAP32[$469 >> 2] = $354; //@line 6555
          HEAP32[$354 + 24 >> 2] = $469; //@line 6557
          HEAP32[$354 + 12 >> 2] = $354; //@line 6559
          HEAP32[$354 + 8 >> 2] = $354; //@line 6561
          break;
         }
         $$0344$i = $$4351$lcssa$i << (($$0361$i | 0) == 31 ? 0 : 25 - ($$0361$i >>> 1) | 0); //@line 6570
         $$0345$i = HEAP32[$469 >> 2] | 0; //@line 6570
         while (1) {
          if ((HEAP32[$$0345$i + 4 >> 2] & -8 | 0) == ($$4351$lcssa$i | 0)) {
           label = 139; //@line 6577
           break;
          }
          $492 = $$0345$i + 16 + ($$0344$i >>> 31 << 2) | 0; //@line 6581
          $494 = HEAP32[$492 >> 2] | 0; //@line 6583
          if (!$494) {
           label = 136; //@line 6586
           break;
          } else {
           $$0344$i = $$0344$i << 1; //@line 6589
           $$0345$i = $494; //@line 6589
          }
         }
         if ((label | 0) == 136) {
          if ((HEAP32[1762] | 0) >>> 0 > $492 >>> 0) {
           _abort(); //@line 6596
          } else {
           HEAP32[$492 >> 2] = $354; //@line 6599
           HEAP32[$354 + 24 >> 2] = $$0345$i; //@line 6601
           HEAP32[$354 + 12 >> 2] = $354; //@line 6603
           HEAP32[$354 + 8 >> 2] = $354; //@line 6605
           break;
          }
         } else if ((label | 0) == 139) {
          $501 = $$0345$i + 8 | 0; //@line 6610
          $502 = HEAP32[$501 >> 2] | 0; //@line 6611
          $503 = HEAP32[1762] | 0; //@line 6612
          if ($503 >>> 0 <= $502 >>> 0 & $503 >>> 0 <= $$0345$i >>> 0) {
           HEAP32[$502 + 12 >> 2] = $354; //@line 6618
           HEAP32[$501 >> 2] = $354; //@line 6619
           HEAP32[$354 + 8 >> 2] = $502; //@line 6621
           HEAP32[$354 + 12 >> 2] = $$0345$i; //@line 6623
           HEAP32[$354 + 24 >> 2] = 0; //@line 6625
           break;
          } else {
           _abort(); //@line 6628
          }
         }
        }
       } while (0);
       $$0 = $$4$lcssa$i + 8 | 0; //@line 6635
       STACKTOP = sp; //@line 6636
       return $$0 | 0; //@line 6636
      } else {
       $$0197 = $252; //@line 6638
      }
     }
    }
   }
  }
 } while (0);
 $512 = HEAP32[1760] | 0; //@line 6645
 if ($512 >>> 0 >= $$0197 >>> 0) {
  $514 = $512 - $$0197 | 0; //@line 6648
  $515 = HEAP32[1763] | 0; //@line 6649
  if ($514 >>> 0 > 15) {
   $517 = $515 + $$0197 | 0; //@line 6652
   HEAP32[1763] = $517; //@line 6653
   HEAP32[1760] = $514; //@line 6654
   HEAP32[$517 + 4 >> 2] = $514 | 1; //@line 6657
   HEAP32[$515 + $512 >> 2] = $514; //@line 6659
   HEAP32[$515 + 4 >> 2] = $$0197 | 3; //@line 6662
  } else {
   HEAP32[1760] = 0; //@line 6664
   HEAP32[1763] = 0; //@line 6665
   HEAP32[$515 + 4 >> 2] = $512 | 3; //@line 6668
   $526 = $515 + $512 + 4 | 0; //@line 6670
   HEAP32[$526 >> 2] = HEAP32[$526 >> 2] | 1; //@line 6673
  }
  $$0 = $515 + 8 | 0; //@line 6676
  STACKTOP = sp; //@line 6677
  return $$0 | 0; //@line 6677
 }
 $530 = HEAP32[1761] | 0; //@line 6679
 if ($530 >>> 0 > $$0197 >>> 0) {
  $532 = $530 - $$0197 | 0; //@line 6682
  HEAP32[1761] = $532; //@line 6683
  $533 = HEAP32[1764] | 0; //@line 6684
  $534 = $533 + $$0197 | 0; //@line 6685
  HEAP32[1764] = $534; //@line 6686
  HEAP32[$534 + 4 >> 2] = $532 | 1; //@line 6689
  HEAP32[$533 + 4 >> 2] = $$0197 | 3; //@line 6692
  $$0 = $533 + 8 | 0; //@line 6694
  STACKTOP = sp; //@line 6695
  return $$0 | 0; //@line 6695
 }
 if (!(HEAP32[1876] | 0)) {
  HEAP32[1878] = 4096; //@line 6700
  HEAP32[1877] = 4096; //@line 6701
  HEAP32[1879] = -1; //@line 6702
  HEAP32[1880] = -1; //@line 6703
  HEAP32[1881] = 0; //@line 6704
  HEAP32[1869] = 0; //@line 6705
  HEAP32[1876] = $1 & -16 ^ 1431655768; //@line 6709
  $548 = 4096; //@line 6710
 } else {
  $548 = HEAP32[1878] | 0; //@line 6713
 }
 $545 = $$0197 + 48 | 0; //@line 6715
 $546 = $$0197 + 47 | 0; //@line 6716
 $547 = $548 + $546 | 0; //@line 6717
 $549 = 0 - $548 | 0; //@line 6718
 $550 = $547 & $549; //@line 6719
 if ($550 >>> 0 <= $$0197 >>> 0) {
  $$0 = 0; //@line 6722
  STACKTOP = sp; //@line 6723
  return $$0 | 0; //@line 6723
 }
 $552 = HEAP32[1868] | 0; //@line 6725
 if ($552 | 0) {
  $554 = HEAP32[1866] | 0; //@line 6728
  $555 = $554 + $550 | 0; //@line 6729
  if ($555 >>> 0 <= $554 >>> 0 | $555 >>> 0 > $552 >>> 0) {
   $$0 = 0; //@line 6734
   STACKTOP = sp; //@line 6735
   return $$0 | 0; //@line 6735
  }
 }
 L244 : do {
  if (!(HEAP32[1869] & 4)) {
   $561 = HEAP32[1764] | 0; //@line 6743
   L246 : do {
    if (!$561) {
     label = 163; //@line 6747
    } else {
     $$0$i$i = 7480; //@line 6749
     while (1) {
      $563 = HEAP32[$$0$i$i >> 2] | 0; //@line 6751
      if ($563 >>> 0 <= $561 >>> 0) {
       $565 = $$0$i$i + 4 | 0; //@line 6754
       if (($563 + (HEAP32[$565 >> 2] | 0) | 0) >>> 0 > $561 >>> 0) {
        break;
       }
      }
      $570 = HEAP32[$$0$i$i + 8 >> 2] | 0; //@line 6763
      if (!$570) {
       label = 163; //@line 6766
       break L246;
      } else {
       $$0$i$i = $570; //@line 6769
      }
     }
     $595 = $547 - $530 & $549; //@line 6773
     if ($595 >>> 0 < 2147483647) {
      $597 = _sbrk($595 | 0) | 0; //@line 6776
      if (($597 | 0) == ((HEAP32[$$0$i$i >> 2] | 0) + (HEAP32[$565 >> 2] | 0) | 0)) {
       if (($597 | 0) == (-1 | 0)) {
        $$2234243136$i = $595; //@line 6784
       } else {
        $$723947$i = $595; //@line 6786
        $$748$i = $597; //@line 6786
        label = 180; //@line 6787
        break L244;
       }
      } else {
       $$2247$ph$i = $597; //@line 6791
       $$2253$ph$i = $595; //@line 6791
       label = 171; //@line 6792
      }
     } else {
      $$2234243136$i = 0; //@line 6795
     }
    }
   } while (0);
   do {
    if ((label | 0) == 163) {
     $572 = _sbrk(0) | 0; //@line 6801
     if (($572 | 0) == (-1 | 0)) {
      $$2234243136$i = 0; //@line 6804
     } else {
      $574 = $572; //@line 6806
      $575 = HEAP32[1877] | 0; //@line 6807
      $576 = $575 + -1 | 0; //@line 6808
      $$$i = (($576 & $574 | 0) == 0 ? 0 : ($576 + $574 & 0 - $575) - $574 | 0) + $550 | 0; //@line 6816
      $584 = HEAP32[1866] | 0; //@line 6817
      $585 = $$$i + $584 | 0; //@line 6818
      if ($$$i >>> 0 > $$0197 >>> 0 & $$$i >>> 0 < 2147483647) {
       $588 = HEAP32[1868] | 0; //@line 6823
       if ($588 | 0) {
        if ($585 >>> 0 <= $584 >>> 0 | $585 >>> 0 > $588 >>> 0) {
         $$2234243136$i = 0; //@line 6830
         break;
        }
       }
       $592 = _sbrk($$$i | 0) | 0; //@line 6834
       if (($592 | 0) == ($572 | 0)) {
        $$723947$i = $$$i; //@line 6837
        $$748$i = $572; //@line 6837
        label = 180; //@line 6838
        break L244;
       } else {
        $$2247$ph$i = $592; //@line 6841
        $$2253$ph$i = $$$i; //@line 6841
        label = 171; //@line 6842
       }
      } else {
       $$2234243136$i = 0; //@line 6845
      }
     }
    }
   } while (0);
   do {
    if ((label | 0) == 171) {
     $603 = 0 - $$2253$ph$i | 0; //@line 6852
     if (!($545 >>> 0 > $$2253$ph$i >>> 0 & ($$2253$ph$i >>> 0 < 2147483647 & ($$2247$ph$i | 0) != (-1 | 0)))) {
      if (($$2247$ph$i | 0) == (-1 | 0)) {
       $$2234243136$i = 0; //@line 6861
       break;
      } else {
       $$723947$i = $$2253$ph$i; //@line 6864
       $$748$i = $$2247$ph$i; //@line 6864
       label = 180; //@line 6865
       break L244;
      }
     }
     $607 = HEAP32[1878] | 0; //@line 6869
     $611 = $546 - $$2253$ph$i + $607 & 0 - $607; //@line 6873
     if ($611 >>> 0 >= 2147483647) {
      $$723947$i = $$2253$ph$i; //@line 6876
      $$748$i = $$2247$ph$i; //@line 6876
      label = 180; //@line 6877
      break L244;
     }
     if ((_sbrk($611 | 0) | 0) == (-1 | 0)) {
      _sbrk($603 | 0) | 0; //@line 6883
      $$2234243136$i = 0; //@line 6884
      break;
     } else {
      $$723947$i = $611 + $$2253$ph$i | 0; //@line 6888
      $$748$i = $$2247$ph$i; //@line 6888
      label = 180; //@line 6889
      break L244;
     }
    }
   } while (0);
   HEAP32[1869] = HEAP32[1869] | 4; //@line 6896
   $$4236$i = $$2234243136$i; //@line 6897
   label = 178; //@line 6898
  } else {
   $$4236$i = 0; //@line 6900
   label = 178; //@line 6901
  }
 } while (0);
 if ((label | 0) == 178) {
  if ($550 >>> 0 < 2147483647) {
   $620 = _sbrk($550 | 0) | 0; //@line 6907
   $621 = _sbrk(0) | 0; //@line 6908
   $627 = $621 - $620 | 0; //@line 6916
   $629 = $627 >>> 0 > ($$0197 + 40 | 0) >>> 0; //@line 6918
   if (!(($620 | 0) == (-1 | 0) | $629 ^ 1 | $620 >>> 0 < $621 >>> 0 & (($620 | 0) != (-1 | 0) & ($621 | 0) != (-1 | 0)) ^ 1)) {
    $$723947$i = $629 ? $627 : $$4236$i; //@line 6926
    $$748$i = $620; //@line 6926
    label = 180; //@line 6927
   }
  }
 }
 if ((label | 0) == 180) {
  $633 = (HEAP32[1866] | 0) + $$723947$i | 0; //@line 6933
  HEAP32[1866] = $633; //@line 6934
  if ($633 >>> 0 > (HEAP32[1867] | 0) >>> 0) {
   HEAP32[1867] = $633; //@line 6938
  }
  $636 = HEAP32[1764] | 0; //@line 6940
  do {
   if (!$636) {
    $638 = HEAP32[1762] | 0; //@line 6944
    if (($638 | 0) == 0 | $$748$i >>> 0 < $638 >>> 0) {
     HEAP32[1762] = $$748$i; //@line 6949
    }
    HEAP32[1870] = $$748$i; //@line 6951
    HEAP32[1871] = $$723947$i; //@line 6952
    HEAP32[1873] = 0; //@line 6953
    HEAP32[1767] = HEAP32[1876]; //@line 6955
    HEAP32[1766] = -1; //@line 6956
    HEAP32[1771] = 7072; //@line 6957
    HEAP32[1770] = 7072; //@line 6958
    HEAP32[1773] = 7080; //@line 6959
    HEAP32[1772] = 7080; //@line 6960
    HEAP32[1775] = 7088; //@line 6961
    HEAP32[1774] = 7088; //@line 6962
    HEAP32[1777] = 7096; //@line 6963
    HEAP32[1776] = 7096; //@line 6964
    HEAP32[1779] = 7104; //@line 6965
    HEAP32[1778] = 7104; //@line 6966
    HEAP32[1781] = 7112; //@line 6967
    HEAP32[1780] = 7112; //@line 6968
    HEAP32[1783] = 7120; //@line 6969
    HEAP32[1782] = 7120; //@line 6970
    HEAP32[1785] = 7128; //@line 6971
    HEAP32[1784] = 7128; //@line 6972
    HEAP32[1787] = 7136; //@line 6973
    HEAP32[1786] = 7136; //@line 6974
    HEAP32[1789] = 7144; //@line 6975
    HEAP32[1788] = 7144; //@line 6976
    HEAP32[1791] = 7152; //@line 6977
    HEAP32[1790] = 7152; //@line 6978
    HEAP32[1793] = 7160; //@line 6979
    HEAP32[1792] = 7160; //@line 6980
    HEAP32[1795] = 7168; //@line 6981
    HEAP32[1794] = 7168; //@line 6982
    HEAP32[1797] = 7176; //@line 6983
    HEAP32[1796] = 7176; //@line 6984
    HEAP32[1799] = 7184; //@line 6985
    HEAP32[1798] = 7184; //@line 6986
    HEAP32[1801] = 7192; //@line 6987
    HEAP32[1800] = 7192; //@line 6988
    HEAP32[1803] = 7200; //@line 6989
    HEAP32[1802] = 7200; //@line 6990
    HEAP32[1805] = 7208; //@line 6991
    HEAP32[1804] = 7208; //@line 6992
    HEAP32[1807] = 7216; //@line 6993
    HEAP32[1806] = 7216; //@line 6994
    HEAP32[1809] = 7224; //@line 6995
    HEAP32[1808] = 7224; //@line 6996
    HEAP32[1811] = 7232; //@line 6997
    HEAP32[1810] = 7232; //@line 6998
    HEAP32[1813] = 7240; //@line 6999
    HEAP32[1812] = 7240; //@line 7000
    HEAP32[1815] = 7248; //@line 7001
    HEAP32[1814] = 7248; //@line 7002
    HEAP32[1817] = 7256; //@line 7003
    HEAP32[1816] = 7256; //@line 7004
    HEAP32[1819] = 7264; //@line 7005
    HEAP32[1818] = 7264; //@line 7006
    HEAP32[1821] = 7272; //@line 7007
    HEAP32[1820] = 7272; //@line 7008
    HEAP32[1823] = 7280; //@line 7009
    HEAP32[1822] = 7280; //@line 7010
    HEAP32[1825] = 7288; //@line 7011
    HEAP32[1824] = 7288; //@line 7012
    HEAP32[1827] = 7296; //@line 7013
    HEAP32[1826] = 7296; //@line 7014
    HEAP32[1829] = 7304; //@line 7015
    HEAP32[1828] = 7304; //@line 7016
    HEAP32[1831] = 7312; //@line 7017
    HEAP32[1830] = 7312; //@line 7018
    HEAP32[1833] = 7320; //@line 7019
    HEAP32[1832] = 7320; //@line 7020
    $642 = $$723947$i + -40 | 0; //@line 7021
    $644 = $$748$i + 8 | 0; //@line 7023
    $649 = ($644 & 7 | 0) == 0 ? 0 : 0 - $644 & 7; //@line 7028
    $650 = $$748$i + $649 | 0; //@line 7029
    $651 = $642 - $649 | 0; //@line 7030
    HEAP32[1764] = $650; //@line 7031
    HEAP32[1761] = $651; //@line 7032
    HEAP32[$650 + 4 >> 2] = $651 | 1; //@line 7035
    HEAP32[$$748$i + $642 + 4 >> 2] = 40; //@line 7038
    HEAP32[1765] = HEAP32[1880]; //@line 7040
   } else {
    $$024367$i = 7480; //@line 7042
    while (1) {
     $657 = HEAP32[$$024367$i >> 2] | 0; //@line 7044
     $658 = $$024367$i + 4 | 0; //@line 7045
     $659 = HEAP32[$658 >> 2] | 0; //@line 7046
     if (($$748$i | 0) == ($657 + $659 | 0)) {
      label = 188; //@line 7050
      break;
     }
     $663 = HEAP32[$$024367$i + 8 >> 2] | 0; //@line 7054
     if (!$663) {
      break;
     } else {
      $$024367$i = $663; //@line 7059
     }
    }
    if ((label | 0) == 188) {
     if (!(HEAP32[$$024367$i + 12 >> 2] & 8)) {
      if ($$748$i >>> 0 > $636 >>> 0 & $657 >>> 0 <= $636 >>> 0) {
       HEAP32[$658 >> 2] = $659 + $$723947$i; //@line 7073
       $673 = (HEAP32[1761] | 0) + $$723947$i | 0; //@line 7075
       $675 = $636 + 8 | 0; //@line 7077
       $680 = ($675 & 7 | 0) == 0 ? 0 : 0 - $675 & 7; //@line 7082
       $681 = $636 + $680 | 0; //@line 7083
       $682 = $673 - $680 | 0; //@line 7084
       HEAP32[1764] = $681; //@line 7085
       HEAP32[1761] = $682; //@line 7086
       HEAP32[$681 + 4 >> 2] = $682 | 1; //@line 7089
       HEAP32[$636 + $673 + 4 >> 2] = 40; //@line 7092
       HEAP32[1765] = HEAP32[1880]; //@line 7094
       break;
      }
     }
    }
    $688 = HEAP32[1762] | 0; //@line 7099
    if ($$748$i >>> 0 < $688 >>> 0) {
     HEAP32[1762] = $$748$i; //@line 7102
     $753 = $$748$i; //@line 7103
    } else {
     $753 = $688; //@line 7105
    }
    $690 = $$748$i + $$723947$i | 0; //@line 7107
    $$124466$i = 7480; //@line 7108
    while (1) {
     if ((HEAP32[$$124466$i >> 2] | 0) == ($690 | 0)) {
      label = 196; //@line 7113
      break;
     }
     $694 = HEAP32[$$124466$i + 8 >> 2] | 0; //@line 7117
     if (!$694) {
      $$0$i$i$i = 7480; //@line 7120
      break;
     } else {
      $$124466$i = $694; //@line 7123
     }
    }
    if ((label | 0) == 196) {
     if (!(HEAP32[$$124466$i + 12 >> 2] & 8)) {
      HEAP32[$$124466$i >> 2] = $$748$i; //@line 7132
      $700 = $$124466$i + 4 | 0; //@line 7133
      HEAP32[$700 >> 2] = (HEAP32[$700 >> 2] | 0) + $$723947$i; //@line 7136
      $704 = $$748$i + 8 | 0; //@line 7138
      $710 = $$748$i + (($704 & 7 | 0) == 0 ? 0 : 0 - $704 & 7) | 0; //@line 7144
      $712 = $690 + 8 | 0; //@line 7146
      $718 = $690 + (($712 & 7 | 0) == 0 ? 0 : 0 - $712 & 7) | 0; //@line 7152
      $722 = $710 + $$0197 | 0; //@line 7156
      $723 = $718 - $710 - $$0197 | 0; //@line 7157
      HEAP32[$710 + 4 >> 2] = $$0197 | 3; //@line 7160
      do {
       if (($636 | 0) == ($718 | 0)) {
        $728 = (HEAP32[1761] | 0) + $723 | 0; //@line 7165
        HEAP32[1761] = $728; //@line 7166
        HEAP32[1764] = $722; //@line 7167
        HEAP32[$722 + 4 >> 2] = $728 | 1; //@line 7170
       } else {
        if ((HEAP32[1763] | 0) == ($718 | 0)) {
         $734 = (HEAP32[1760] | 0) + $723 | 0; //@line 7176
         HEAP32[1760] = $734; //@line 7177
         HEAP32[1763] = $722; //@line 7178
         HEAP32[$722 + 4 >> 2] = $734 | 1; //@line 7181
         HEAP32[$722 + $734 >> 2] = $734; //@line 7183
         break;
        }
        $739 = HEAP32[$718 + 4 >> 2] | 0; //@line 7187
        if (($739 & 3 | 0) == 1) {
         $742 = $739 & -8; //@line 7191
         $743 = $739 >>> 3; //@line 7192
         L311 : do {
          if ($739 >>> 0 < 256) {
           $746 = HEAP32[$718 + 8 >> 2] | 0; //@line 7197
           $748 = HEAP32[$718 + 12 >> 2] | 0; //@line 7199
           $750 = 7072 + ($743 << 1 << 2) | 0; //@line 7201
           do {
            if (($746 | 0) != ($750 | 0)) {
             if ($753 >>> 0 > $746 >>> 0) {
              _abort(); //@line 7207
             }
             if ((HEAP32[$746 + 12 >> 2] | 0) == ($718 | 0)) {
              break;
             }
             _abort(); //@line 7216
            }
           } while (0);
           if (($748 | 0) == ($746 | 0)) {
            HEAP32[1758] = HEAP32[1758] & ~(1 << $743); //@line 7226
            break;
           }
           do {
            if (($748 | 0) == ($750 | 0)) {
             $$pre$phi11$i$iZ2D = $748 + 8 | 0; //@line 7233
            } else {
             if ($753 >>> 0 > $748 >>> 0) {
              _abort(); //@line 7237
             }
             $764 = $748 + 8 | 0; //@line 7240
             if ((HEAP32[$764 >> 2] | 0) == ($718 | 0)) {
              $$pre$phi11$i$iZ2D = $764; //@line 7244
              break;
             }
             _abort(); //@line 7247
            }
           } while (0);
           HEAP32[$746 + 12 >> 2] = $748; //@line 7252
           HEAP32[$$pre$phi11$i$iZ2D >> 2] = $746; //@line 7253
          } else {
           $769 = HEAP32[$718 + 24 >> 2] | 0; //@line 7256
           $771 = HEAP32[$718 + 12 >> 2] | 0; //@line 7258
           do {
            if (($771 | 0) == ($718 | 0)) {
             $782 = $718 + 16 | 0; //@line 7262
             $783 = $782 + 4 | 0; //@line 7263
             $784 = HEAP32[$783 >> 2] | 0; //@line 7264
             if (!$784) {
              $786 = HEAP32[$782 >> 2] | 0; //@line 7267
              if (!$786) {
               $$3$i$i = 0; //@line 7270
               break;
              } else {
               $$1291$i$i = $786; //@line 7273
               $$1293$i$i = $782; //@line 7273
              }
             } else {
              $$1291$i$i = $784; //@line 7276
              $$1293$i$i = $783; //@line 7276
             }
             while (1) {
              $788 = $$1291$i$i + 20 | 0; //@line 7279
              $789 = HEAP32[$788 >> 2] | 0; //@line 7280
              if ($789 | 0) {
               $$1291$i$i = $789; //@line 7283
               $$1293$i$i = $788; //@line 7283
               continue;
              }
              $791 = $$1291$i$i + 16 | 0; //@line 7286
              $792 = HEAP32[$791 >> 2] | 0; //@line 7287
              if (!$792) {
               break;
              } else {
               $$1291$i$i = $792; //@line 7292
               $$1293$i$i = $791; //@line 7292
              }
             }
             if ($753 >>> 0 > $$1293$i$i >>> 0) {
              _abort(); //@line 7297
             } else {
              HEAP32[$$1293$i$i >> 2] = 0; //@line 7300
              $$3$i$i = $$1291$i$i; //@line 7301
              break;
             }
            } else {
             $774 = HEAP32[$718 + 8 >> 2] | 0; //@line 7306
             if ($753 >>> 0 > $774 >>> 0) {
              _abort(); //@line 7309
             }
             $776 = $774 + 12 | 0; //@line 7312
             if ((HEAP32[$776 >> 2] | 0) != ($718 | 0)) {
              _abort(); //@line 7316
             }
             $779 = $771 + 8 | 0; //@line 7319
             if ((HEAP32[$779 >> 2] | 0) == ($718 | 0)) {
              HEAP32[$776 >> 2] = $771; //@line 7323
              HEAP32[$779 >> 2] = $774; //@line 7324
              $$3$i$i = $771; //@line 7325
              break;
             } else {
              _abort(); //@line 7328
             }
            }
           } while (0);
           if (!$769) {
            break;
           }
           $797 = HEAP32[$718 + 28 >> 2] | 0; //@line 7338
           $798 = 7336 + ($797 << 2) | 0; //@line 7339
           do {
            if ((HEAP32[$798 >> 2] | 0) == ($718 | 0)) {
             HEAP32[$798 >> 2] = $$3$i$i; //@line 7344
             if ($$3$i$i | 0) {
              break;
             }
             HEAP32[1759] = HEAP32[1759] & ~(1 << $797); //@line 7353
             break L311;
            } else {
             if ((HEAP32[1762] | 0) >>> 0 > $769 >>> 0) {
              _abort(); //@line 7359
             } else {
              HEAP32[$769 + 16 + (((HEAP32[$769 + 16 >> 2] | 0) != ($718 | 0) & 1) << 2) >> 2] = $$3$i$i; //@line 7367
              if (!$$3$i$i) {
               break L311;
              } else {
               break;
              }
             }
            }
           } while (0);
           $812 = HEAP32[1762] | 0; //@line 7377
           if ($812 >>> 0 > $$3$i$i >>> 0) {
            _abort(); //@line 7380
           }
           HEAP32[$$3$i$i + 24 >> 2] = $769; //@line 7384
           $815 = $718 + 16 | 0; //@line 7385
           $816 = HEAP32[$815 >> 2] | 0; //@line 7386
           do {
            if ($816 | 0) {
             if ($812 >>> 0 > $816 >>> 0) {
              _abort(); //@line 7392
             } else {
              HEAP32[$$3$i$i + 16 >> 2] = $816; //@line 7396
              HEAP32[$816 + 24 >> 2] = $$3$i$i; //@line 7398
              break;
             }
            }
           } while (0);
           $822 = HEAP32[$815 + 4 >> 2] | 0; //@line 7404
           if (!$822) {
            break;
           }
           if ((HEAP32[1762] | 0) >>> 0 > $822 >>> 0) {
            _abort(); //@line 7412
           } else {
            HEAP32[$$3$i$i + 20 >> 2] = $822; //@line 7416
            HEAP32[$822 + 24 >> 2] = $$3$i$i; //@line 7418
            break;
           }
          }
         } while (0);
         $$0$i17$i = $718 + $742 | 0; //@line 7425
         $$0287$i$i = $742 + $723 | 0; //@line 7425
        } else {
         $$0$i17$i = $718; //@line 7427
         $$0287$i$i = $723; //@line 7427
        }
        $830 = $$0$i17$i + 4 | 0; //@line 7429
        HEAP32[$830 >> 2] = HEAP32[$830 >> 2] & -2; //@line 7432
        HEAP32[$722 + 4 >> 2] = $$0287$i$i | 1; //@line 7435
        HEAP32[$722 + $$0287$i$i >> 2] = $$0287$i$i; //@line 7437
        $836 = $$0287$i$i >>> 3; //@line 7438
        if ($$0287$i$i >>> 0 < 256) {
         $839 = 7072 + ($836 << 1 << 2) | 0; //@line 7442
         $840 = HEAP32[1758] | 0; //@line 7443
         $841 = 1 << $836; //@line 7444
         do {
          if (!($840 & $841)) {
           HEAP32[1758] = $840 | $841; //@line 7450
           $$0295$i$i = $839; //@line 7452
           $$pre$phi$i19$iZ2D = $839 + 8 | 0; //@line 7452
          } else {
           $845 = $839 + 8 | 0; //@line 7454
           $846 = HEAP32[$845 >> 2] | 0; //@line 7455
           if ((HEAP32[1762] | 0) >>> 0 <= $846 >>> 0) {
            $$0295$i$i = $846; //@line 7459
            $$pre$phi$i19$iZ2D = $845; //@line 7459
            break;
           }
           _abort(); //@line 7462
          }
         } while (0);
         HEAP32[$$pre$phi$i19$iZ2D >> 2] = $722; //@line 7466
         HEAP32[$$0295$i$i + 12 >> 2] = $722; //@line 7468
         HEAP32[$722 + 8 >> 2] = $$0295$i$i; //@line 7470
         HEAP32[$722 + 12 >> 2] = $839; //@line 7472
         break;
        }
        $852 = $$0287$i$i >>> 8; //@line 7475
        do {
         if (!$852) {
          $$0296$i$i = 0; //@line 7479
         } else {
          if ($$0287$i$i >>> 0 > 16777215) {
           $$0296$i$i = 31; //@line 7483
           break;
          }
          $857 = ($852 + 1048320 | 0) >>> 16 & 8; //@line 7488
          $858 = $852 << $857; //@line 7489
          $861 = ($858 + 520192 | 0) >>> 16 & 4; //@line 7492
          $863 = $858 << $861; //@line 7494
          $866 = ($863 + 245760 | 0) >>> 16 & 2; //@line 7497
          $871 = 14 - ($861 | $857 | $866) + ($863 << $866 >>> 15) | 0; //@line 7502
          $$0296$i$i = $$0287$i$i >>> ($871 + 7 | 0) & 1 | $871 << 1; //@line 7508
         }
        } while (0);
        $877 = 7336 + ($$0296$i$i << 2) | 0; //@line 7511
        HEAP32[$722 + 28 >> 2] = $$0296$i$i; //@line 7513
        $879 = $722 + 16 | 0; //@line 7514
        HEAP32[$879 + 4 >> 2] = 0; //@line 7516
        HEAP32[$879 >> 2] = 0; //@line 7517
        $881 = HEAP32[1759] | 0; //@line 7518
        $882 = 1 << $$0296$i$i; //@line 7519
        if (!($881 & $882)) {
         HEAP32[1759] = $881 | $882; //@line 7524
         HEAP32[$877 >> 2] = $722; //@line 7525
         HEAP32[$722 + 24 >> 2] = $877; //@line 7527
         HEAP32[$722 + 12 >> 2] = $722; //@line 7529
         HEAP32[$722 + 8 >> 2] = $722; //@line 7531
         break;
        }
        $$0288$i$i = $$0287$i$i << (($$0296$i$i | 0) == 31 ? 0 : 25 - ($$0296$i$i >>> 1) | 0); //@line 7540
        $$0289$i$i = HEAP32[$877 >> 2] | 0; //@line 7540
        while (1) {
         if ((HEAP32[$$0289$i$i + 4 >> 2] & -8 | 0) == ($$0287$i$i | 0)) {
          label = 263; //@line 7547
          break;
         }
         $900 = $$0289$i$i + 16 + ($$0288$i$i >>> 31 << 2) | 0; //@line 7551
         $902 = HEAP32[$900 >> 2] | 0; //@line 7553
         if (!$902) {
          label = 260; //@line 7556
          break;
         } else {
          $$0288$i$i = $$0288$i$i << 1; //@line 7559
          $$0289$i$i = $902; //@line 7559
         }
        }
        if ((label | 0) == 260) {
         if ((HEAP32[1762] | 0) >>> 0 > $900 >>> 0) {
          _abort(); //@line 7566
         } else {
          HEAP32[$900 >> 2] = $722; //@line 7569
          HEAP32[$722 + 24 >> 2] = $$0289$i$i; //@line 7571
          HEAP32[$722 + 12 >> 2] = $722; //@line 7573
          HEAP32[$722 + 8 >> 2] = $722; //@line 7575
          break;
         }
        } else if ((label | 0) == 263) {
         $909 = $$0289$i$i + 8 | 0; //@line 7580
         $910 = HEAP32[$909 >> 2] | 0; //@line 7581
         $911 = HEAP32[1762] | 0; //@line 7582
         if ($911 >>> 0 <= $910 >>> 0 & $911 >>> 0 <= $$0289$i$i >>> 0) {
          HEAP32[$910 + 12 >> 2] = $722; //@line 7588
          HEAP32[$909 >> 2] = $722; //@line 7589
          HEAP32[$722 + 8 >> 2] = $910; //@line 7591
          HEAP32[$722 + 12 >> 2] = $$0289$i$i; //@line 7593
          HEAP32[$722 + 24 >> 2] = 0; //@line 7595
          break;
         } else {
          _abort(); //@line 7598
         }
        }
       }
      } while (0);
      $$0 = $710 + 8 | 0; //@line 7605
      STACKTOP = sp; //@line 7606
      return $$0 | 0; //@line 7606
     } else {
      $$0$i$i$i = 7480; //@line 7608
     }
    }
    while (1) {
     $919 = HEAP32[$$0$i$i$i >> 2] | 0; //@line 7612
     if ($919 >>> 0 <= $636 >>> 0) {
      $923 = $919 + (HEAP32[$$0$i$i$i + 4 >> 2] | 0) | 0; //@line 7617
      if ($923 >>> 0 > $636 >>> 0) {
       break;
      }
     }
     $$0$i$i$i = HEAP32[$$0$i$i$i + 8 >> 2] | 0; //@line 7625
    }
    $927 = $923 + -47 | 0; //@line 7627
    $929 = $927 + 8 | 0; //@line 7629
    $935 = $927 + (($929 & 7 | 0) == 0 ? 0 : 0 - $929 & 7) | 0; //@line 7635
    $936 = $636 + 16 | 0; //@line 7636
    $938 = $935 >>> 0 < $936 >>> 0 ? $636 : $935; //@line 7638
    $939 = $938 + 8 | 0; //@line 7639
    $940 = $938 + 24 | 0; //@line 7640
    $941 = $$723947$i + -40 | 0; //@line 7641
    $943 = $$748$i + 8 | 0; //@line 7643
    $948 = ($943 & 7 | 0) == 0 ? 0 : 0 - $943 & 7; //@line 7648
    $949 = $$748$i + $948 | 0; //@line 7649
    $950 = $941 - $948 | 0; //@line 7650
    HEAP32[1764] = $949; //@line 7651
    HEAP32[1761] = $950; //@line 7652
    HEAP32[$949 + 4 >> 2] = $950 | 1; //@line 7655
    HEAP32[$$748$i + $941 + 4 >> 2] = 40; //@line 7658
    HEAP32[1765] = HEAP32[1880]; //@line 7660
    $956 = $938 + 4 | 0; //@line 7661
    HEAP32[$956 >> 2] = 27; //@line 7662
    HEAP32[$939 >> 2] = HEAP32[1870]; //@line 7663
    HEAP32[$939 + 4 >> 2] = HEAP32[1871]; //@line 7663
    HEAP32[$939 + 8 >> 2] = HEAP32[1872]; //@line 7663
    HEAP32[$939 + 12 >> 2] = HEAP32[1873]; //@line 7663
    HEAP32[1870] = $$748$i; //@line 7664
    HEAP32[1871] = $$723947$i; //@line 7665
    HEAP32[1873] = 0; //@line 7666
    HEAP32[1872] = $939; //@line 7667
    $958 = $940; //@line 7668
    do {
     $958$looptemp = $958;
     $958 = $958 + 4 | 0; //@line 7670
     HEAP32[$958 >> 2] = 7; //@line 7671
    } while (($958$looptemp + 8 | 0) >>> 0 < $923 >>> 0);
    if (($938 | 0) != ($636 | 0)) {
     $964 = $938 - $636 | 0; //@line 7684
     HEAP32[$956 >> 2] = HEAP32[$956 >> 2] & -2; //@line 7687
     HEAP32[$636 + 4 >> 2] = $964 | 1; //@line 7690
     HEAP32[$938 >> 2] = $964; //@line 7691
     $969 = $964 >>> 3; //@line 7692
     if ($964 >>> 0 < 256) {
      $972 = 7072 + ($969 << 1 << 2) | 0; //@line 7696
      $973 = HEAP32[1758] | 0; //@line 7697
      $974 = 1 << $969; //@line 7698
      if (!($973 & $974)) {
       HEAP32[1758] = $973 | $974; //@line 7703
       $$0211$i$i = $972; //@line 7705
       $$pre$phi$i$iZ2D = $972 + 8 | 0; //@line 7705
      } else {
       $978 = $972 + 8 | 0; //@line 7707
       $979 = HEAP32[$978 >> 2] | 0; //@line 7708
       if ((HEAP32[1762] | 0) >>> 0 > $979 >>> 0) {
        _abort(); //@line 7712
       } else {
        $$0211$i$i = $979; //@line 7715
        $$pre$phi$i$iZ2D = $978; //@line 7715
       }
      }
      HEAP32[$$pre$phi$i$iZ2D >> 2] = $636; //@line 7718
      HEAP32[$$0211$i$i + 12 >> 2] = $636; //@line 7720
      HEAP32[$636 + 8 >> 2] = $$0211$i$i; //@line 7722
      HEAP32[$636 + 12 >> 2] = $972; //@line 7724
      break;
     }
     $985 = $964 >>> 8; //@line 7727
     if (!$985) {
      $$0212$i$i = 0; //@line 7730
     } else {
      if ($964 >>> 0 > 16777215) {
       $$0212$i$i = 31; //@line 7734
      } else {
       $990 = ($985 + 1048320 | 0) >>> 16 & 8; //@line 7738
       $991 = $985 << $990; //@line 7739
       $994 = ($991 + 520192 | 0) >>> 16 & 4; //@line 7742
       $996 = $991 << $994; //@line 7744
       $999 = ($996 + 245760 | 0) >>> 16 & 2; //@line 7747
       $1004 = 14 - ($994 | $990 | $999) + ($996 << $999 >>> 15) | 0; //@line 7752
       $$0212$i$i = $964 >>> ($1004 + 7 | 0) & 1 | $1004 << 1; //@line 7758
      }
     }
     $1010 = 7336 + ($$0212$i$i << 2) | 0; //@line 7761
     HEAP32[$636 + 28 >> 2] = $$0212$i$i; //@line 7763
     HEAP32[$636 + 20 >> 2] = 0; //@line 7765
     HEAP32[$936 >> 2] = 0; //@line 7766
     $1013 = HEAP32[1759] | 0; //@line 7767
     $1014 = 1 << $$0212$i$i; //@line 7768
     if (!($1013 & $1014)) {
      HEAP32[1759] = $1013 | $1014; //@line 7773
      HEAP32[$1010 >> 2] = $636; //@line 7774
      HEAP32[$636 + 24 >> 2] = $1010; //@line 7776
      HEAP32[$636 + 12 >> 2] = $636; //@line 7778
      HEAP32[$636 + 8 >> 2] = $636; //@line 7780
      break;
     }
     $$0206$i$i = $964 << (($$0212$i$i | 0) == 31 ? 0 : 25 - ($$0212$i$i >>> 1) | 0); //@line 7789
     $$0207$i$i = HEAP32[$1010 >> 2] | 0; //@line 7789
     while (1) {
      if ((HEAP32[$$0207$i$i + 4 >> 2] & -8 | 0) == ($964 | 0)) {
       label = 289; //@line 7796
       break;
      }
      $1032 = $$0207$i$i + 16 + ($$0206$i$i >>> 31 << 2) | 0; //@line 7800
      $1034 = HEAP32[$1032 >> 2] | 0; //@line 7802
      if (!$1034) {
       label = 286; //@line 7805
       break;
      } else {
       $$0206$i$i = $$0206$i$i << 1; //@line 7808
       $$0207$i$i = $1034; //@line 7808
      }
     }
     if ((label | 0) == 286) {
      if ((HEAP32[1762] | 0) >>> 0 > $1032 >>> 0) {
       _abort(); //@line 7815
      } else {
       HEAP32[$1032 >> 2] = $636; //@line 7818
       HEAP32[$636 + 24 >> 2] = $$0207$i$i; //@line 7820
       HEAP32[$636 + 12 >> 2] = $636; //@line 7822
       HEAP32[$636 + 8 >> 2] = $636; //@line 7824
       break;
      }
     } else if ((label | 0) == 289) {
      $1041 = $$0207$i$i + 8 | 0; //@line 7829
      $1042 = HEAP32[$1041 >> 2] | 0; //@line 7830
      $1043 = HEAP32[1762] | 0; //@line 7831
      if ($1043 >>> 0 <= $1042 >>> 0 & $1043 >>> 0 <= $$0207$i$i >>> 0) {
       HEAP32[$1042 + 12 >> 2] = $636; //@line 7837
       HEAP32[$1041 >> 2] = $636; //@line 7838
       HEAP32[$636 + 8 >> 2] = $1042; //@line 7840
       HEAP32[$636 + 12 >> 2] = $$0207$i$i; //@line 7842
       HEAP32[$636 + 24 >> 2] = 0; //@line 7844
       break;
      } else {
       _abort(); //@line 7847
      }
     }
    }
   }
  } while (0);
  $1052 = HEAP32[1761] | 0; //@line 7854
  if ($1052 >>> 0 > $$0197 >>> 0) {
   $1054 = $1052 - $$0197 | 0; //@line 7857
   HEAP32[1761] = $1054; //@line 7858
   $1055 = HEAP32[1764] | 0; //@line 7859
   $1056 = $1055 + $$0197 | 0; //@line 7860
   HEAP32[1764] = $1056; //@line 7861
   HEAP32[$1056 + 4 >> 2] = $1054 | 1; //@line 7864
   HEAP32[$1055 + 4 >> 2] = $$0197 | 3; //@line 7867
   $$0 = $1055 + 8 | 0; //@line 7869
   STACKTOP = sp; //@line 7870
   return $$0 | 0; //@line 7870
  }
 }
 HEAP32[(___errno_location() | 0) >> 2] = 12; //@line 7874
 $$0 = 0; //@line 7875
 STACKTOP = sp; //@line 7876
 return $$0 | 0; //@line 7876
}
function __ZL24nsapi_dns_query_multipleP12NetworkStackPKcP10nsapi_addrj13nsapi_version($0, $1, $2, $3, $4) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 var $$0 = 0, $$019$i = 0, $$019$i$1 = 0, $$019$i$2 = 0, $$019$i$3 = 0, $$019$i$4 = 0, $$089$i = 0, $$090117$i = 0, $$093119$i = 0, $$094116$i = 0, $$095115$i = 0, $$1$i = 0, $$196$i = 0, $$2 = 0, $$3 = 0, $$355 = 0, $$byval_copy58 = 0, $$lcssa$i = 0, $$lcssa127 = 0, $$sink$i = 0, $11 = 0, $114 = 0, $120 = 0, $127 = 0, $128 = 0, $133 = 0, $135 = 0, $136 = 0, $139 = 0, $143 = 0, $144 = 0, $148 = 0, $151 = 0, $153 = 0, $154 = 0, $159 = 0, $167 = 0, $178 = 0, $183 = 0, $184 = 0, $186 = 0, $21 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $261 = 0, $268 = 0, $27 = 0, $270 = 0, $271 = 0, $272 = 0, $273 = 0, $28 = 0, $283 = 0, $29 = 0, $290 = 0, $30 = 0, $31 = 0, $311 = 0, $334 = 0, $336 = 0, $337 = 0, $338 = 0, $339 = 0, $349 = 0, $35 = 0, $356 = 0, $37 = 0, $377 = 0, $38 = 0, $39 = 0, $40 = 0, $400 = 0, $402 = 0, $403 = 0, $404 = 0, $405 = 0, $415 = 0, $422 = 0, $443 = 0, $466 = 0, $468 = 0, $469 = 0, $470 = 0, $471 = 0, $481 = 0, $488 = 0, $5 = 0, $50 = 0, $505 = 0, $521 = 0, $57 = 0, $6 = 0, $78 = 0, $8 = 0, $AsyncCtx = 0, $AsyncCtx11 = 0, $AsyncCtx15 = 0, $AsyncCtx18 = 0, $AsyncCtx21 = 0, $AsyncCtx24 = 0, $AsyncCtx27 = 0, $AsyncCtx3 = 0, $AsyncCtx30 = 0, $AsyncCtx34 = 0, $AsyncCtx37 = 0, $AsyncCtx41 = 0, $AsyncCtx7 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 3527
 STACKTOP = STACKTOP + 144 | 0; //@line 3528
 $$byval_copy58 = sp + 120 | 0; //@line 3529
 $5 = sp + 64 | 0; //@line 3530
 $6 = sp; //@line 3531
 if (!$1) {
  $$3 = -3003; //@line 3534
  STACKTOP = sp; //@line 3535
  return $$3 | 0; //@line 3535
 }
 $8 = _strlen($1) | 0; //@line 3537
 if (($8 | 0) > 128 | ($8 | 0) == 0) {
  $$3 = -3003; //@line 3542
  STACKTOP = sp; //@line 3543
  return $$3 | 0; //@line 3543
 }
 __ZN9UDPSocketC2Ev($5); //@line 3545
 $AsyncCtx41 = _emscripten_alloc_async_context(36, sp) | 0; //@line 3546
 $11 = __ZN6Socket4openEP12NetworkStack($5, $0) | 0; //@line 3547
 if (___async) {
  HEAP32[$AsyncCtx41 >> 2] = 91; //@line 3550
  HEAP32[$AsyncCtx41 + 4 >> 2] = $3; //@line 3552
  HEAP32[$AsyncCtx41 + 8 >> 2] = $2; //@line 3554
  HEAP32[$AsyncCtx41 + 12 >> 2] = $5; //@line 3556
  HEAP32[$AsyncCtx41 + 16 >> 2] = $5; //@line 3558
  HEAP32[$AsyncCtx41 + 20 >> 2] = $5; //@line 3560
  HEAP32[$AsyncCtx41 + 24 >> 2] = $6; //@line 3562
  HEAP32[$AsyncCtx41 + 28 >> 2] = $1; //@line 3564
  HEAP32[$AsyncCtx41 + 32 >> 2] = $4; //@line 3566
  sp = STACKTOP; //@line 3567
  STACKTOP = sp; //@line 3568
  return 0; //@line 3568
 }
 _emscripten_free_async_context($AsyncCtx41 | 0); //@line 3570
 do {
  if (!$11) {
   __ZN6Socket11set_timeoutEi($5, 5e3); //@line 3574
   $21 = _malloc(512) | 0; //@line 3575
   if (!$21) {
    $$2 = -3007; //@line 3578
   } else {
    $23 = $21; //@line 3580
    $24 = $21 + 1 | 0; //@line 3581
    $25 = $21 + 2 | 0; //@line 3582
    $26 = $21 + 3 | 0; //@line 3583
    $27 = $21 + 4 | 0; //@line 3584
    $28 = $21 + 5 | 0; //@line 3585
    $29 = $21 + 6 | 0; //@line 3586
    $30 = $21 + 7 | 0; //@line 3587
    $31 = $21 + 12 | 0; //@line 3588
    $$sink$i = ($4 | 0) == 2 ? 28 : 1; //@line 3590
    HEAP8[$21 >> 0] = 0; //@line 3591
    HEAP8[$24 >> 0] = 1; //@line 3592
    HEAP8[$25 >> 0] = 1; //@line 3593
    HEAP8[$26 >> 0] = 0; //@line 3594
    HEAP8[$27 >> 0] = 0; //@line 3595
    HEAP8[$28 >> 0] = 1; //@line 3596
    HEAP8[$29 >> 0] = 0; //@line 3597
    HEAP8[$29 + 1 >> 0] = 0; //@line 3597
    HEAP8[$29 + 2 >> 0] = 0; //@line 3597
    HEAP8[$29 + 3 >> 0] = 0; //@line 3597
    HEAP8[$29 + 4 >> 0] = 0; //@line 3597
    HEAP8[$29 + 5 >> 0] = 0; //@line 3597
    if (!(HEAP8[$1 >> 0] | 0)) {
     $50 = $31; //@line 3601
    } else {
     $$019$i = $1; //@line 3603
     $38 = $31; //@line 3603
     while (1) {
      $35 = _strcspn($$019$i, 4557) | 0; //@line 3605
      $37 = $38 + 1 | 0; //@line 3607
      HEAP8[$38 >> 0] = $35; //@line 3608
      $39 = $35 & 255; //@line 3609
      _memcpy($37 | 0, $$019$i | 0, $39 | 0) | 0; //@line 3610
      $40 = $37 + $39 | 0; //@line 3611
      $$019$i = $$019$i + ($35 + ((HEAP8[$$019$i + $35 >> 0] | 0) == 46 & 1)) | 0; //@line 3617
      if (!(HEAP8[$$019$i >> 0] | 0)) {
       $50 = $40; //@line 3621
       break;
      } else {
       $38 = $40; //@line 3624
      }
     }
    }
    HEAP8[$50 >> 0] = 0; //@line 3629
    HEAP8[$50 + 1 >> 0] = 0; //@line 3631
    HEAP8[$50 + 2 >> 0] = $$sink$i; //@line 3633
    HEAP8[$50 + 3 >> 0] = 0; //@line 3635
    HEAP8[$50 + 4 >> 0] = 1; //@line 3636
    HEAP32[$$byval_copy58 >> 2] = HEAP32[124]; //@line 3637
    HEAP32[$$byval_copy58 + 4 >> 2] = HEAP32[125]; //@line 3637
    HEAP32[$$byval_copy58 + 8 >> 2] = HEAP32[126]; //@line 3637
    HEAP32[$$byval_copy58 + 12 >> 2] = HEAP32[127]; //@line 3637
    HEAP32[$$byval_copy58 + 16 >> 2] = HEAP32[128]; //@line 3637
    __ZN13SocketAddressC2E10nsapi_addrt($6, $$byval_copy58, 53); //@line 3638
    $AsyncCtx30 = _emscripten_alloc_async_context(80, sp) | 0; //@line 3642
    $57 = __ZN9UDPSocket6sendtoERK13SocketAddressPKvj($5, $6, $21, $50 + 5 - $23 | 0) | 0; //@line 3643
    if (___async) {
     HEAP32[$AsyncCtx30 >> 2] = 92; //@line 3646
     HEAP32[$AsyncCtx30 + 4 >> 2] = $31; //@line 3648
     HEAP32[$AsyncCtx30 + 8 >> 2] = $3; //@line 3650
     HEAP32[$AsyncCtx30 + 12 >> 2] = $6; //@line 3652
     HEAP32[$AsyncCtx30 + 16 >> 2] = $2; //@line 3654
     HEAP32[$AsyncCtx30 + 20 >> 2] = $21; //@line 3656
     HEAP32[$AsyncCtx30 + 24 >> 2] = $24; //@line 3658
     HEAP32[$AsyncCtx30 + 28 >> 2] = $25; //@line 3660
     HEAP32[$AsyncCtx30 + 32 >> 2] = $26; //@line 3662
     HEAP32[$AsyncCtx30 + 36 >> 2] = $27; //@line 3664
     HEAP32[$AsyncCtx30 + 40 >> 2] = $28; //@line 3666
     HEAP32[$AsyncCtx30 + 44 >> 2] = $29; //@line 3668
     HEAP32[$AsyncCtx30 + 48 >> 2] = $30; //@line 3670
     HEAP32[$AsyncCtx30 + 52 >> 2] = $5; //@line 3672
     HEAP32[$AsyncCtx30 + 56 >> 2] = $5; //@line 3674
     HEAP32[$AsyncCtx30 + 60 >> 2] = $5; //@line 3676
     HEAP8[$AsyncCtx30 + 64 >> 0] = $$sink$i; //@line 3678
     HEAP32[$AsyncCtx30 + 68 >> 2] = $6; //@line 3680
     HEAP32[$AsyncCtx30 + 72 >> 2] = $23; //@line 3682
     HEAP32[$AsyncCtx30 + 76 >> 2] = $1; //@line 3684
     sp = STACKTOP; //@line 3685
     STACKTOP = sp; //@line 3686
     return 0; //@line 3686
    }
    _emscripten_free_async_context($AsyncCtx30 | 0); //@line 3688
    do {
     if (($57 | 0) < 0) {
      label = 35; //@line 3692
     } else {
      $AsyncCtx15 = _emscripten_alloc_async_context(80, sp) | 0; //@line 3694
      $78 = __ZN9UDPSocket8recvfromEP13SocketAddressPvj($5, 0, $21, 512) | 0; //@line 3695
      if (___async) {
       HEAP32[$AsyncCtx15 >> 2] = 93; //@line 3698
       HEAP32[$AsyncCtx15 + 4 >> 2] = $31; //@line 3700
       HEAP32[$AsyncCtx15 + 8 >> 2] = $3; //@line 3702
       HEAP32[$AsyncCtx15 + 12 >> 2] = $6; //@line 3704
       HEAP32[$AsyncCtx15 + 16 >> 2] = $2; //@line 3706
       HEAP32[$AsyncCtx15 + 20 >> 2] = $21; //@line 3708
       HEAP32[$AsyncCtx15 + 24 >> 2] = $24; //@line 3710
       HEAP32[$AsyncCtx15 + 28 >> 2] = $25; //@line 3712
       HEAP32[$AsyncCtx15 + 32 >> 2] = $26; //@line 3714
       HEAP32[$AsyncCtx15 + 36 >> 2] = $27; //@line 3716
       HEAP32[$AsyncCtx15 + 40 >> 2] = $28; //@line 3718
       HEAP32[$AsyncCtx15 + 44 >> 2] = $29; //@line 3720
       HEAP32[$AsyncCtx15 + 48 >> 2] = $30; //@line 3722
       HEAP32[$AsyncCtx15 + 52 >> 2] = $5; //@line 3724
       HEAP32[$AsyncCtx15 + 56 >> 2] = $5; //@line 3726
       HEAP32[$AsyncCtx15 + 60 >> 2] = $5; //@line 3728
       HEAP8[$AsyncCtx15 + 64 >> 0] = $$sink$i; //@line 3730
       HEAP32[$AsyncCtx15 + 68 >> 2] = $6; //@line 3732
       HEAP32[$AsyncCtx15 + 72 >> 2] = $23; //@line 3734
       HEAP32[$AsyncCtx15 + 76 >> 2] = $1; //@line 3736
       sp = STACKTOP; //@line 3737
       STACKTOP = sp; //@line 3738
       return 0; //@line 3738
      } else {
       _emscripten_free_async_context($AsyncCtx15 | 0); //@line 3740
       if (($78 | 0) == -3001) {
        label = 35; //@line 3743
        break;
       } else {
        $$lcssa127 = $78; //@line 3746
        label = 15; //@line 3747
        break;
       }
      }
     }
    } while (0);
    L25 : do {
     if ((label | 0) == 35) {
      HEAP8[$21 >> 0] = 0; //@line 3755
      HEAP8[$24 >> 0] = 1; //@line 3756
      HEAP8[$25 >> 0] = 1; //@line 3757
      HEAP8[$26 >> 0] = 0; //@line 3758
      HEAP8[$27 >> 0] = 0; //@line 3759
      HEAP8[$28 >> 0] = 1; //@line 3760
      HEAP8[$29 >> 0] = 0; //@line 3761
      HEAP8[$29 + 1 >> 0] = 0; //@line 3761
      HEAP8[$29 + 2 >> 0] = 0; //@line 3761
      HEAP8[$29 + 3 >> 0] = 0; //@line 3761
      HEAP8[$29 + 4 >> 0] = 0; //@line 3761
      HEAP8[$29 + 5 >> 0] = 0; //@line 3761
      if (!(HEAP8[$1 >> 0] | 0)) {
       $283 = $31; //@line 3765
      } else {
       $$019$i$1 = $1; //@line 3767
       $271 = $31; //@line 3767
       while (1) {
        $268 = _strcspn($$019$i$1, 4557) | 0; //@line 3769
        $270 = $271 + 1 | 0; //@line 3771
        HEAP8[$271 >> 0] = $268; //@line 3772
        $272 = $268 & 255; //@line 3773
        _memcpy($270 | 0, $$019$i$1 | 0, $272 | 0) | 0; //@line 3774
        $273 = $270 + $272 | 0; //@line 3775
        $$019$i$1 = $$019$i$1 + ($268 + ((HEAP8[$$019$i$1 + $268 >> 0] | 0) == 46 & 1)) | 0; //@line 3781
        if (!(HEAP8[$$019$i$1 >> 0] | 0)) {
         $283 = $273; //@line 3785
         break;
        } else {
         $271 = $273; //@line 3788
        }
       }
      }
      HEAP8[$283 >> 0] = 0; //@line 3793
      HEAP8[$283 + 1 >> 0] = 0; //@line 3795
      HEAP8[$283 + 2 >> 0] = $$sink$i; //@line 3797
      HEAP8[$283 + 3 >> 0] = 0; //@line 3799
      HEAP8[$283 + 4 >> 0] = 1; //@line 3800
      HEAP32[$$byval_copy58 >> 2] = HEAP32[129]; //@line 3801
      HEAP32[$$byval_copy58 + 4 >> 2] = HEAP32[130]; //@line 3801
      HEAP32[$$byval_copy58 + 8 >> 2] = HEAP32[131]; //@line 3801
      HEAP32[$$byval_copy58 + 12 >> 2] = HEAP32[132]; //@line 3801
      HEAP32[$$byval_copy58 + 16 >> 2] = HEAP32[133]; //@line 3801
      __ZN13SocketAddressC2E10nsapi_addrt($6, $$byval_copy58, 53); //@line 3802
      $AsyncCtx27 = _emscripten_alloc_async_context(80, sp) | 0; //@line 3806
      $290 = __ZN9UDPSocket6sendtoERK13SocketAddressPKvj($5, $6, $21, $283 + 5 - $23 | 0) | 0; //@line 3807
      if (___async) {
       HEAP32[$AsyncCtx27 >> 2] = 96; //@line 3810
       HEAP32[$AsyncCtx27 + 4 >> 2] = $31; //@line 3812
       HEAP32[$AsyncCtx27 + 8 >> 2] = $3; //@line 3814
       HEAP32[$AsyncCtx27 + 12 >> 2] = $6; //@line 3816
       HEAP32[$AsyncCtx27 + 16 >> 2] = $2; //@line 3818
       HEAP32[$AsyncCtx27 + 20 >> 2] = $21; //@line 3820
       HEAP32[$AsyncCtx27 + 24 >> 2] = $24; //@line 3822
       HEAP32[$AsyncCtx27 + 28 >> 2] = $25; //@line 3824
       HEAP32[$AsyncCtx27 + 32 >> 2] = $26; //@line 3826
       HEAP32[$AsyncCtx27 + 36 >> 2] = $27; //@line 3828
       HEAP32[$AsyncCtx27 + 40 >> 2] = $28; //@line 3830
       HEAP32[$AsyncCtx27 + 44 >> 2] = $29; //@line 3832
       HEAP32[$AsyncCtx27 + 48 >> 2] = $30; //@line 3834
       HEAP32[$AsyncCtx27 + 52 >> 2] = $5; //@line 3836
       HEAP32[$AsyncCtx27 + 56 >> 2] = $5; //@line 3838
       HEAP32[$AsyncCtx27 + 60 >> 2] = $5; //@line 3840
       HEAP8[$AsyncCtx27 + 64 >> 0] = $$sink$i; //@line 3842
       HEAP32[$AsyncCtx27 + 68 >> 2] = $6; //@line 3844
       HEAP32[$AsyncCtx27 + 72 >> 2] = $23; //@line 3846
       HEAP32[$AsyncCtx27 + 76 >> 2] = $1; //@line 3848
       sp = STACKTOP; //@line 3849
       STACKTOP = sp; //@line 3850
       return 0; //@line 3850
      }
      _emscripten_free_async_context($AsyncCtx27 | 0); //@line 3852
      do {
       if (($290 | 0) >= 0) {
        $AsyncCtx11 = _emscripten_alloc_async_context(80, sp) | 0; //@line 3856
        $311 = __ZN9UDPSocket8recvfromEP13SocketAddressPvj($5, 0, $21, 512) | 0; //@line 3857
        if (___async) {
         HEAP32[$AsyncCtx11 >> 2] = 97; //@line 3860
         HEAP32[$AsyncCtx11 + 4 >> 2] = $31; //@line 3862
         HEAP32[$AsyncCtx11 + 8 >> 2] = $3; //@line 3864
         HEAP32[$AsyncCtx11 + 12 >> 2] = $6; //@line 3866
         HEAP32[$AsyncCtx11 + 16 >> 2] = $2; //@line 3868
         HEAP32[$AsyncCtx11 + 20 >> 2] = $21; //@line 3870
         HEAP32[$AsyncCtx11 + 24 >> 2] = $24; //@line 3872
         HEAP32[$AsyncCtx11 + 28 >> 2] = $25; //@line 3874
         HEAP32[$AsyncCtx11 + 32 >> 2] = $26; //@line 3876
         HEAP32[$AsyncCtx11 + 36 >> 2] = $27; //@line 3878
         HEAP32[$AsyncCtx11 + 40 >> 2] = $28; //@line 3880
         HEAP32[$AsyncCtx11 + 44 >> 2] = $29; //@line 3882
         HEAP32[$AsyncCtx11 + 48 >> 2] = $30; //@line 3884
         HEAP32[$AsyncCtx11 + 52 >> 2] = $5; //@line 3886
         HEAP32[$AsyncCtx11 + 56 >> 2] = $5; //@line 3888
         HEAP32[$AsyncCtx11 + 60 >> 2] = $5; //@line 3890
         HEAP8[$AsyncCtx11 + 64 >> 0] = $$sink$i; //@line 3892
         HEAP32[$AsyncCtx11 + 68 >> 2] = $6; //@line 3894
         HEAP32[$AsyncCtx11 + 72 >> 2] = $23; //@line 3896
         HEAP32[$AsyncCtx11 + 76 >> 2] = $1; //@line 3898
         sp = STACKTOP; //@line 3899
         STACKTOP = sp; //@line 3900
         return 0; //@line 3900
        } else {
         _emscripten_free_async_context($AsyncCtx11 | 0); //@line 3902
         if (($311 | 0) == -3001) {
          break;
         } else {
          $$lcssa127 = $311; //@line 3907
          label = 15; //@line 3908
          break L25;
         }
        }
       }
      } while (0);
      HEAP8[$21 >> 0] = 0; //@line 3914
      HEAP8[$24 >> 0] = 1; //@line 3915
      HEAP8[$25 >> 0] = 1; //@line 3916
      HEAP8[$26 >> 0] = 0; //@line 3917
      HEAP8[$27 >> 0] = 0; //@line 3918
      HEAP8[$28 >> 0] = 1; //@line 3919
      HEAP8[$29 >> 0] = 0; //@line 3920
      HEAP8[$29 + 1 >> 0] = 0; //@line 3920
      HEAP8[$29 + 2 >> 0] = 0; //@line 3920
      HEAP8[$29 + 3 >> 0] = 0; //@line 3920
      HEAP8[$29 + 4 >> 0] = 0; //@line 3920
      HEAP8[$29 + 5 >> 0] = 0; //@line 3920
      if (!(HEAP8[$1 >> 0] | 0)) {
       $349 = $31; //@line 3924
      } else {
       $$019$i$2 = $1; //@line 3926
       $337 = $31; //@line 3926
       while (1) {
        $334 = _strcspn($$019$i$2, 4557) | 0; //@line 3928
        $336 = $337 + 1 | 0; //@line 3930
        HEAP8[$337 >> 0] = $334; //@line 3931
        $338 = $334 & 255; //@line 3932
        _memcpy($336 | 0, $$019$i$2 | 0, $338 | 0) | 0; //@line 3933
        $339 = $336 + $338 | 0; //@line 3934
        $$019$i$2 = $$019$i$2 + ($334 + ((HEAP8[$$019$i$2 + $334 >> 0] | 0) == 46 & 1)) | 0; //@line 3940
        if (!(HEAP8[$$019$i$2 >> 0] | 0)) {
         $349 = $339; //@line 3944
         break;
        } else {
         $337 = $339; //@line 3947
        }
       }
      }
      HEAP8[$349 >> 0] = 0; //@line 3952
      HEAP8[$349 + 1 >> 0] = 0; //@line 3954
      HEAP8[$349 + 2 >> 0] = $$sink$i; //@line 3956
      HEAP8[$349 + 3 >> 0] = 0; //@line 3958
      HEAP8[$349 + 4 >> 0] = 1; //@line 3959
      HEAP32[$$byval_copy58 >> 2] = HEAP32[134]; //@line 3960
      HEAP32[$$byval_copy58 + 4 >> 2] = HEAP32[135]; //@line 3960
      HEAP32[$$byval_copy58 + 8 >> 2] = HEAP32[136]; //@line 3960
      HEAP32[$$byval_copy58 + 12 >> 2] = HEAP32[137]; //@line 3960
      HEAP32[$$byval_copy58 + 16 >> 2] = HEAP32[138]; //@line 3960
      __ZN13SocketAddressC2E10nsapi_addrt($6, $$byval_copy58, 53); //@line 3961
      $AsyncCtx24 = _emscripten_alloc_async_context(80, sp) | 0; //@line 3965
      $356 = __ZN9UDPSocket6sendtoERK13SocketAddressPKvj($5, $6, $21, $349 + 5 - $23 | 0) | 0; //@line 3966
      if (___async) {
       HEAP32[$AsyncCtx24 >> 2] = 98; //@line 3969
       HEAP32[$AsyncCtx24 + 4 >> 2] = $31; //@line 3971
       HEAP32[$AsyncCtx24 + 8 >> 2] = $3; //@line 3973
       HEAP32[$AsyncCtx24 + 12 >> 2] = $6; //@line 3975
       HEAP32[$AsyncCtx24 + 16 >> 2] = $2; //@line 3977
       HEAP32[$AsyncCtx24 + 20 >> 2] = $21; //@line 3979
       HEAP32[$AsyncCtx24 + 24 >> 2] = $24; //@line 3981
       HEAP32[$AsyncCtx24 + 28 >> 2] = $25; //@line 3983
       HEAP32[$AsyncCtx24 + 32 >> 2] = $26; //@line 3985
       HEAP32[$AsyncCtx24 + 36 >> 2] = $27; //@line 3987
       HEAP32[$AsyncCtx24 + 40 >> 2] = $28; //@line 3989
       HEAP32[$AsyncCtx24 + 44 >> 2] = $29; //@line 3991
       HEAP32[$AsyncCtx24 + 48 >> 2] = $30; //@line 3993
       HEAP32[$AsyncCtx24 + 52 >> 2] = $5; //@line 3995
       HEAP32[$AsyncCtx24 + 56 >> 2] = $5; //@line 3997
       HEAP32[$AsyncCtx24 + 60 >> 2] = $5; //@line 3999
       HEAP8[$AsyncCtx24 + 64 >> 0] = $$sink$i; //@line 4001
       HEAP32[$AsyncCtx24 + 68 >> 2] = $6; //@line 4003
       HEAP32[$AsyncCtx24 + 72 >> 2] = $23; //@line 4005
       HEAP32[$AsyncCtx24 + 76 >> 2] = $1; //@line 4007
       sp = STACKTOP; //@line 4008
       STACKTOP = sp; //@line 4009
       return 0; //@line 4009
      }
      _emscripten_free_async_context($AsyncCtx24 | 0); //@line 4011
      do {
       if (($356 | 0) >= 0) {
        $AsyncCtx7 = _emscripten_alloc_async_context(80, sp) | 0; //@line 4015
        $377 = __ZN9UDPSocket8recvfromEP13SocketAddressPvj($5, 0, $21, 512) | 0; //@line 4016
        if (___async) {
         HEAP32[$AsyncCtx7 >> 2] = 99; //@line 4019
         HEAP32[$AsyncCtx7 + 4 >> 2] = $31; //@line 4021
         HEAP32[$AsyncCtx7 + 8 >> 2] = $3; //@line 4023
         HEAP32[$AsyncCtx7 + 12 >> 2] = $6; //@line 4025
         HEAP32[$AsyncCtx7 + 16 >> 2] = $2; //@line 4027
         HEAP32[$AsyncCtx7 + 20 >> 2] = $21; //@line 4029
         HEAP32[$AsyncCtx7 + 24 >> 2] = $24; //@line 4031
         HEAP32[$AsyncCtx7 + 28 >> 2] = $25; //@line 4033
         HEAP32[$AsyncCtx7 + 32 >> 2] = $26; //@line 4035
         HEAP32[$AsyncCtx7 + 36 >> 2] = $27; //@line 4037
         HEAP32[$AsyncCtx7 + 40 >> 2] = $28; //@line 4039
         HEAP32[$AsyncCtx7 + 44 >> 2] = $29; //@line 4041
         HEAP32[$AsyncCtx7 + 48 >> 2] = $30; //@line 4043
         HEAP32[$AsyncCtx7 + 52 >> 2] = $5; //@line 4045
         HEAP32[$AsyncCtx7 + 56 >> 2] = $5; //@line 4047
         HEAP32[$AsyncCtx7 + 60 >> 2] = $5; //@line 4049
         HEAP8[$AsyncCtx7 + 64 >> 0] = $$sink$i; //@line 4051
         HEAP32[$AsyncCtx7 + 68 >> 2] = $6; //@line 4053
         HEAP32[$AsyncCtx7 + 72 >> 2] = $23; //@line 4055
         HEAP32[$AsyncCtx7 + 76 >> 2] = $1; //@line 4057
         sp = STACKTOP; //@line 4058
         STACKTOP = sp; //@line 4059
         return 0; //@line 4059
        } else {
         _emscripten_free_async_context($AsyncCtx7 | 0); //@line 4061
         if (($377 | 0) == -3001) {
          break;
         } else {
          $$lcssa127 = $377; //@line 4066
          label = 15; //@line 4067
          break L25;
         }
        }
       }
      } while (0);
      HEAP8[$21 >> 0] = 0; //@line 4073
      HEAP8[$24 >> 0] = 1; //@line 4074
      HEAP8[$25 >> 0] = 1; //@line 4075
      HEAP8[$26 >> 0] = 0; //@line 4076
      HEAP8[$27 >> 0] = 0; //@line 4077
      HEAP8[$28 >> 0] = 1; //@line 4078
      HEAP8[$29 >> 0] = 0; //@line 4079
      HEAP8[$29 + 1 >> 0] = 0; //@line 4079
      HEAP8[$29 + 2 >> 0] = 0; //@line 4079
      HEAP8[$29 + 3 >> 0] = 0; //@line 4079
      HEAP8[$29 + 4 >> 0] = 0; //@line 4079
      HEAP8[$29 + 5 >> 0] = 0; //@line 4079
      if (!(HEAP8[$1 >> 0] | 0)) {
       $415 = $31; //@line 4083
      } else {
       $$019$i$3 = $1; //@line 4085
       $403 = $31; //@line 4085
       while (1) {
        $400 = _strcspn($$019$i$3, 4557) | 0; //@line 4087
        $402 = $403 + 1 | 0; //@line 4089
        HEAP8[$403 >> 0] = $400; //@line 4090
        $404 = $400 & 255; //@line 4091
        _memcpy($402 | 0, $$019$i$3 | 0, $404 | 0) | 0; //@line 4092
        $405 = $402 + $404 | 0; //@line 4093
        $$019$i$3 = $$019$i$3 + ($400 + ((HEAP8[$$019$i$3 + $400 >> 0] | 0) == 46 & 1)) | 0; //@line 4099
        if (!(HEAP8[$$019$i$3 >> 0] | 0)) {
         $415 = $405; //@line 4103
         break;
        } else {
         $403 = $405; //@line 4106
        }
       }
      }
      HEAP8[$415 >> 0] = 0; //@line 4111
      HEAP8[$415 + 1 >> 0] = 0; //@line 4113
      HEAP8[$415 + 2 >> 0] = $$sink$i; //@line 4115
      HEAP8[$415 + 3 >> 0] = 0; //@line 4117
      HEAP8[$415 + 4 >> 0] = 1; //@line 4118
      HEAP32[$$byval_copy58 >> 2] = HEAP32[139]; //@line 4119
      HEAP32[$$byval_copy58 + 4 >> 2] = HEAP32[140]; //@line 4119
      HEAP32[$$byval_copy58 + 8 >> 2] = HEAP32[141]; //@line 4119
      HEAP32[$$byval_copy58 + 12 >> 2] = HEAP32[142]; //@line 4119
      HEAP32[$$byval_copy58 + 16 >> 2] = HEAP32[143]; //@line 4119
      __ZN13SocketAddressC2E10nsapi_addrt($6, $$byval_copy58, 53); //@line 4120
      $AsyncCtx21 = _emscripten_alloc_async_context(80, sp) | 0; //@line 4124
      $422 = __ZN9UDPSocket6sendtoERK13SocketAddressPKvj($5, $6, $21, $415 + 5 - $23 | 0) | 0; //@line 4125
      if (___async) {
       HEAP32[$AsyncCtx21 >> 2] = 100; //@line 4128
       HEAP32[$AsyncCtx21 + 4 >> 2] = $31; //@line 4130
       HEAP32[$AsyncCtx21 + 8 >> 2] = $3; //@line 4132
       HEAP32[$AsyncCtx21 + 12 >> 2] = $6; //@line 4134
       HEAP32[$AsyncCtx21 + 16 >> 2] = $2; //@line 4136
       HEAP32[$AsyncCtx21 + 20 >> 2] = $21; //@line 4138
       HEAP32[$AsyncCtx21 + 24 >> 2] = $24; //@line 4140
       HEAP32[$AsyncCtx21 + 28 >> 2] = $25; //@line 4142
       HEAP32[$AsyncCtx21 + 32 >> 2] = $26; //@line 4144
       HEAP32[$AsyncCtx21 + 36 >> 2] = $27; //@line 4146
       HEAP32[$AsyncCtx21 + 40 >> 2] = $28; //@line 4148
       HEAP32[$AsyncCtx21 + 44 >> 2] = $29; //@line 4150
       HEAP32[$AsyncCtx21 + 48 >> 2] = $30; //@line 4152
       HEAP32[$AsyncCtx21 + 52 >> 2] = $5; //@line 4154
       HEAP32[$AsyncCtx21 + 56 >> 2] = $5; //@line 4156
       HEAP32[$AsyncCtx21 + 60 >> 2] = $5; //@line 4158
       HEAP8[$AsyncCtx21 + 64 >> 0] = $$sink$i; //@line 4160
       HEAP32[$AsyncCtx21 + 68 >> 2] = $6; //@line 4162
       HEAP32[$AsyncCtx21 + 72 >> 2] = $23; //@line 4164
       HEAP32[$AsyncCtx21 + 76 >> 2] = $1; //@line 4166
       sp = STACKTOP; //@line 4167
       STACKTOP = sp; //@line 4168
       return 0; //@line 4168
      }
      _emscripten_free_async_context($AsyncCtx21 | 0); //@line 4170
      do {
       if (($422 | 0) >= 0) {
        $AsyncCtx3 = _emscripten_alloc_async_context(80, sp) | 0; //@line 4174
        $443 = __ZN9UDPSocket8recvfromEP13SocketAddressPvj($5, 0, $21, 512) | 0; //@line 4175
        if (___async) {
         HEAP32[$AsyncCtx3 >> 2] = 101; //@line 4178
         HEAP32[$AsyncCtx3 + 4 >> 2] = $31; //@line 4180
         HEAP32[$AsyncCtx3 + 8 >> 2] = $3; //@line 4182
         HEAP32[$AsyncCtx3 + 12 >> 2] = $6; //@line 4184
         HEAP32[$AsyncCtx3 + 16 >> 2] = $2; //@line 4186
         HEAP32[$AsyncCtx3 + 20 >> 2] = $21; //@line 4188
         HEAP32[$AsyncCtx3 + 24 >> 2] = $24; //@line 4190
         HEAP32[$AsyncCtx3 + 28 >> 2] = $25; //@line 4192
         HEAP32[$AsyncCtx3 + 32 >> 2] = $26; //@line 4194
         HEAP32[$AsyncCtx3 + 36 >> 2] = $27; //@line 4196
         HEAP32[$AsyncCtx3 + 40 >> 2] = $28; //@line 4198
         HEAP32[$AsyncCtx3 + 44 >> 2] = $29; //@line 4200
         HEAP32[$AsyncCtx3 + 48 >> 2] = $30; //@line 4202
         HEAP32[$AsyncCtx3 + 52 >> 2] = $5; //@line 4204
         HEAP32[$AsyncCtx3 + 56 >> 2] = $5; //@line 4206
         HEAP32[$AsyncCtx3 + 60 >> 2] = $5; //@line 4208
         HEAP8[$AsyncCtx3 + 64 >> 0] = $$sink$i; //@line 4210
         HEAP32[$AsyncCtx3 + 68 >> 2] = $6; //@line 4212
         HEAP32[$AsyncCtx3 + 72 >> 2] = $23; //@line 4214
         HEAP32[$AsyncCtx3 + 76 >> 2] = $1; //@line 4216
         sp = STACKTOP; //@line 4217
         STACKTOP = sp; //@line 4218
         return 0; //@line 4218
        } else {
         _emscripten_free_async_context($AsyncCtx3 | 0); //@line 4220
         if (($443 | 0) == -3001) {
          break;
         } else {
          $$lcssa127 = $443; //@line 4225
          label = 15; //@line 4226
          break L25;
         }
        }
       }
      } while (0);
      HEAP8[$21 >> 0] = 0; //@line 4232
      HEAP8[$24 >> 0] = 1; //@line 4233
      HEAP8[$25 >> 0] = 1; //@line 4234
      HEAP8[$26 >> 0] = 0; //@line 4235
      HEAP8[$27 >> 0] = 0; //@line 4236
      HEAP8[$28 >> 0] = 1; //@line 4237
      HEAP8[$29 >> 0] = 0; //@line 4238
      HEAP8[$29 + 1 >> 0] = 0; //@line 4238
      HEAP8[$29 + 2 >> 0] = 0; //@line 4238
      HEAP8[$29 + 3 >> 0] = 0; //@line 4238
      HEAP8[$29 + 4 >> 0] = 0; //@line 4238
      HEAP8[$29 + 5 >> 0] = 0; //@line 4238
      if (!(HEAP8[$1 >> 0] | 0)) {
       $481 = $31; //@line 4242
      } else {
       $$019$i$4 = $1; //@line 4244
       $469 = $31; //@line 4244
       while (1) {
        $466 = _strcspn($$019$i$4, 4557) | 0; //@line 4246
        $468 = $469 + 1 | 0; //@line 4248
        HEAP8[$469 >> 0] = $466; //@line 4249
        $470 = $466 & 255; //@line 4250
        _memcpy($468 | 0, $$019$i$4 | 0, $470 | 0) | 0; //@line 4251
        $471 = $468 + $470 | 0; //@line 4252
        $$019$i$4 = $$019$i$4 + ($466 + ((HEAP8[$$019$i$4 + $466 >> 0] | 0) == 46 & 1)) | 0; //@line 4258
        if (!(HEAP8[$$019$i$4 >> 0] | 0)) {
         $481 = $471; //@line 4262
         break;
        } else {
         $469 = $471; //@line 4265
        }
       }
      }
      HEAP8[$481 >> 0] = 0; //@line 4270
      HEAP8[$481 + 1 >> 0] = 0; //@line 4272
      HEAP8[$481 + 2 >> 0] = $$sink$i; //@line 4274
      HEAP8[$481 + 3 >> 0] = 0; //@line 4276
      HEAP8[$481 + 4 >> 0] = 1; //@line 4277
      HEAP32[$$byval_copy58 >> 2] = HEAP32[144]; //@line 4278
      HEAP32[$$byval_copy58 + 4 >> 2] = HEAP32[145]; //@line 4278
      HEAP32[$$byval_copy58 + 8 >> 2] = HEAP32[146]; //@line 4278
      HEAP32[$$byval_copy58 + 12 >> 2] = HEAP32[147]; //@line 4278
      HEAP32[$$byval_copy58 + 16 >> 2] = HEAP32[148]; //@line 4278
      __ZN13SocketAddressC2E10nsapi_addrt($6, $$byval_copy58, 53); //@line 4279
      $AsyncCtx18 = _emscripten_alloc_async_context(64, sp) | 0; //@line 4283
      $488 = __ZN9UDPSocket6sendtoERK13SocketAddressPKvj($5, $6, $21, $481 + 5 - $23 | 0) | 0; //@line 4284
      if (___async) {
       HEAP32[$AsyncCtx18 >> 2] = 102; //@line 4287
       HEAP32[$AsyncCtx18 + 4 >> 2] = $6; //@line 4289
       HEAP32[$AsyncCtx18 + 8 >> 2] = $31; //@line 4291
       HEAP32[$AsyncCtx18 + 12 >> 2] = $3; //@line 4293
       HEAP32[$AsyncCtx18 + 16 >> 2] = $2; //@line 4295
       HEAP32[$AsyncCtx18 + 20 >> 2] = $21; //@line 4297
       HEAP32[$AsyncCtx18 + 24 >> 2] = $24; //@line 4299
       HEAP32[$AsyncCtx18 + 28 >> 2] = $25; //@line 4301
       HEAP32[$AsyncCtx18 + 32 >> 2] = $26; //@line 4303
       HEAP32[$AsyncCtx18 + 36 >> 2] = $27; //@line 4305
       HEAP32[$AsyncCtx18 + 40 >> 2] = $28; //@line 4307
       HEAP32[$AsyncCtx18 + 44 >> 2] = $29; //@line 4309
       HEAP32[$AsyncCtx18 + 48 >> 2] = $30; //@line 4311
       HEAP32[$AsyncCtx18 + 52 >> 2] = $5; //@line 4313
       HEAP32[$AsyncCtx18 + 56 >> 2] = $5; //@line 4315
       HEAP32[$AsyncCtx18 + 60 >> 2] = $5; //@line 4317
       sp = STACKTOP; //@line 4318
       STACKTOP = sp; //@line 4319
       return 0; //@line 4319
      }
      _emscripten_free_async_context($AsyncCtx18 | 0); //@line 4321
      if (($488 | 0) < 0) {
       $$355 = -3009; //@line 4324
       break;
      }
      $AsyncCtx = _emscripten_alloc_async_context(60, sp) | 0; //@line 4327
      $505 = __ZN9UDPSocket8recvfromEP13SocketAddressPvj($5, 0, $21, 512) | 0; //@line 4328
      if (___async) {
       HEAP32[$AsyncCtx >> 2] = 103; //@line 4331
       HEAP32[$AsyncCtx + 4 >> 2] = $31; //@line 4333
       HEAP32[$AsyncCtx + 8 >> 2] = $3; //@line 4335
       HEAP32[$AsyncCtx + 12 >> 2] = $2; //@line 4337
       HEAP32[$AsyncCtx + 16 >> 2] = $21; //@line 4339
       HEAP32[$AsyncCtx + 20 >> 2] = $24; //@line 4341
       HEAP32[$AsyncCtx + 24 >> 2] = $25; //@line 4343
       HEAP32[$AsyncCtx + 28 >> 2] = $26; //@line 4345
       HEAP32[$AsyncCtx + 32 >> 2] = $27; //@line 4347
       HEAP32[$AsyncCtx + 36 >> 2] = $28; //@line 4349
       HEAP32[$AsyncCtx + 40 >> 2] = $29; //@line 4351
       HEAP32[$AsyncCtx + 44 >> 2] = $30; //@line 4353
       HEAP32[$AsyncCtx + 48 >> 2] = $5; //@line 4355
       HEAP32[$AsyncCtx + 52 >> 2] = $5; //@line 4357
       HEAP32[$AsyncCtx + 56 >> 2] = $5; //@line 4359
       sp = STACKTOP; //@line 4360
       STACKTOP = sp; //@line 4361
       return 0; //@line 4361
      } else {
       _emscripten_free_async_context($AsyncCtx | 0); //@line 4363
       if (($505 | 0) == -3001) {
        $$355 = -3009; //@line 4366
        break;
       } else {
        $$lcssa127 = $505; //@line 4369
        label = 15; //@line 4370
        break;
       }
      }
     }
    } while (0);
    if ((label | 0) == 15) {
     if (($$lcssa127 | 0) < 0) {
      $$355 = $$lcssa127; //@line 4379
     } else {
      $114 = HEAPU8[$27 >> 0] << 8 | HEAPU8[$28 >> 0]; //@line 4395
      $120 = HEAPU8[$29 >> 0] << 8 | HEAPU8[$30 >> 0]; //@line 4401
      if (((HEAP8[$25 >> 0] & -8) << 24 >> 24 == -128 ? (HEAPU8[$21 >> 0] << 8 | HEAPU8[$24 >> 0] | 0) == 1 : 0) & (HEAP8[$26 >> 0] & 15) == 0) {
       if (!$114) {
        $521 = $31; //@line 4411
       } else {
        $$093119$i = 0; //@line 4413
        $128 = $31; //@line 4413
        while (1) {
         $127 = HEAP8[$128 >> 0] | 0; //@line 4415
         if (!($127 << 24 >> 24)) {
          $$lcssa$i = $128; //@line 4418
         } else {
          $133 = $128; //@line 4420
          $135 = $127; //@line 4420
          while (1) {
           $136 = $133 + 1 + ($135 & 255) | 0; //@line 4424
           $135 = HEAP8[$136 >> 0] | 0; //@line 4425
           if (!($135 << 24 >> 24)) {
            $$lcssa$i = $136; //@line 4428
            break;
           } else {
            $133 = $136; //@line 4431
           }
          }
         }
         $139 = $$lcssa$i + 5 | 0; //@line 4435
         $$093119$i = $$093119$i + 1 | 0; //@line 4436
         if (($$093119$i | 0) >= ($114 | 0)) {
          $521 = $139; //@line 4441
          break;
         } else {
          $128 = $139; //@line 4439
         }
        }
       }
       if (($3 | 0) != 0 & ($120 | 0) != 0) {
        $$090117$i = $2; //@line 4450
        $$094116$i = 0; //@line 4450
        $$095115$i = 0; //@line 4450
        $143 = $521; //@line 4450
        while (1) {
         $144 = HEAP8[$143 >> 0] | 0; //@line 4453
         do {
          if (!($144 << 24 >> 24)) {
           $159 = $143 + 1 | 0; //@line 4457
          } else {
           $148 = $144 & 255; //@line 4460
           $151 = $143; //@line 4460
           while (1) {
            if ($148 & 192 | 0) {
             label = 25; //@line 4465
             break;
            }
            $153 = $151 + 1 + $148 | 0; //@line 4469
            $154 = HEAP8[$153 >> 0] | 0; //@line 4470
            if (!($154 << 24 >> 24)) {
             label = 27; //@line 4474
             break;
            } else {
             $148 = $154 & 255; //@line 4477
             $151 = $153; //@line 4477
            }
           }
           if ((label | 0) == 25) {
            label = 0; //@line 4481
            $159 = $151 + 2 | 0; //@line 4483
            break;
           } else if ((label | 0) == 27) {
            label = 0; //@line 4487
            $159 = $153 + 1 | 0; //@line 4489
            break;
           }
          }
         } while (0);
         $167 = (HEAPU8[$159 >> 0] << 8 | HEAPU8[$159 + 1 >> 0]) & 65535; //@line 4502
         $178 = $159 + 10 | 0; //@line 4513
         $183 = HEAPU8[$159 + 8 >> 0] << 8 | HEAPU8[$159 + 9 >> 0]; //@line 4518
         $184 = $183 & 65535; //@line 4519
         $186 = (HEAPU8[$159 + 2 >> 0] << 8 | HEAPU8[$159 + 3 >> 0] | 0) == 1; //@line 4521
         do {
          if ($167 << 16 >> 16 == 1 & $186 & $184 << 16 >> 16 == 4) {
           HEAP32[$$090117$i >> 2] = 1; //@line 4527
           HEAP8[$$090117$i + 4 >> 0] = HEAP8[$178 >> 0] | 0; //@line 4531
           HEAP8[$$090117$i + 5 >> 0] = HEAP8[$159 + 11 >> 0] | 0; //@line 4535
           HEAP8[$$090117$i + 6 >> 0] = HEAP8[$159 + 12 >> 0] | 0; //@line 4539
           HEAP8[$$090117$i + 7 >> 0] = HEAP8[$159 + 13 >> 0] | 0; //@line 4543
           $$0 = $159 + 14 | 0; //@line 4546
           $$1$i = $$090117$i + 20 | 0; //@line 4546
           $$196$i = $$095115$i + 1 | 0; //@line 4546
          } else {
           if ($167 << 16 >> 16 == 28 & $186 & $184 << 16 >> 16 == 16) {
            HEAP32[$$090117$i >> 2] = 2; //@line 4553
            HEAP8[$$090117$i + 4 >> 0] = HEAP8[$178 >> 0] | 0; //@line 4557
            HEAP8[$$090117$i + 5 >> 0] = HEAP8[$159 + 11 >> 0] | 0; //@line 4561
            HEAP8[$$090117$i + 6 >> 0] = HEAP8[$159 + 12 >> 0] | 0; //@line 4565
            HEAP8[$$090117$i + 7 >> 0] = HEAP8[$159 + 13 >> 0] | 0; //@line 4569
            HEAP8[$$090117$i + 8 >> 0] = HEAP8[$159 + 14 >> 0] | 0; //@line 4573
            HEAP8[$$090117$i + 9 >> 0] = HEAP8[$159 + 15 >> 0] | 0; //@line 4577
            HEAP8[$$090117$i + 10 >> 0] = HEAP8[$159 + 16 >> 0] | 0; //@line 4581
            HEAP8[$$090117$i + 11 >> 0] = HEAP8[$159 + 17 >> 0] | 0; //@line 4585
            HEAP8[$$090117$i + 12 >> 0] = HEAP8[$159 + 18 >> 0] | 0; //@line 4589
            HEAP8[$$090117$i + 13 >> 0] = HEAP8[$159 + 19 >> 0] | 0; //@line 4593
            HEAP8[$$090117$i + 14 >> 0] = HEAP8[$159 + 20 >> 0] | 0; //@line 4597
            HEAP8[$$090117$i + 15 >> 0] = HEAP8[$159 + 21 >> 0] | 0; //@line 4601
            HEAP8[$$090117$i + 16 >> 0] = HEAP8[$159 + 22 >> 0] | 0; //@line 4605
            HEAP8[$$090117$i + 17 >> 0] = HEAP8[$159 + 23 >> 0] | 0; //@line 4609
            HEAP8[$$090117$i + 18 >> 0] = HEAP8[$159 + 24 >> 0] | 0; //@line 4613
            HEAP8[$$090117$i + 19 >> 0] = HEAP8[$159 + 25 >> 0] | 0; //@line 4617
            $$0 = $159 + 26 | 0; //@line 4620
            $$1$i = $$090117$i + 20 | 0; //@line 4620
            $$196$i = $$095115$i + 1 | 0; //@line 4620
            break;
           } else {
            $$0 = $178 + $183 | 0; //@line 4624
            $$1$i = $$090117$i; //@line 4624
            $$196$i = $$095115$i; //@line 4624
            break;
           }
          }
         } while (0);
         $$094116$i = $$094116$i + 1 | 0; //@line 4629
         if (!(($$094116$i | 0) < ($120 | 0) & $$196$i >>> 0 < $3 >>> 0)) {
          $$089$i = $$196$i; //@line 4636
          break;
         } else {
          $$090117$i = $$1$i; //@line 4634
          $$095115$i = $$196$i; //@line 4634
          $143 = $$0; //@line 4634
         }
        }
       } else {
        $$089$i = 0; //@line 4641
       }
      } else {
       $$089$i = 0; //@line 4644
      }
      $$355 = ($$089$i | 0) > 0 ? $$089$i : -3009; //@line 4648
     }
    }
    _free($21); //@line 4651
    $AsyncCtx37 = _emscripten_alloc_async_context(16, sp) | 0; //@line 4652
    $261 = __ZN6Socket5closeEv($5) | 0; //@line 4653
    if (___async) {
     HEAP32[$AsyncCtx37 >> 2] = 94; //@line 4656
     HEAP32[$AsyncCtx37 + 4 >> 2] = $$355; //@line 4658
     HEAP32[$AsyncCtx37 + 8 >> 2] = $5; //@line 4660
     HEAP32[$AsyncCtx37 + 12 >> 2] = $5; //@line 4662
     sp = STACKTOP; //@line 4663
     STACKTOP = sp; //@line 4664
     return 0; //@line 4664
    } else {
     _emscripten_free_async_context($AsyncCtx37 | 0); //@line 4666
     $$2 = ($261 | 0) == 0 ? $$355 : $261; //@line 4669
     break;
    }
   }
  } else {
   $$2 = $11; //@line 4674
  }
 } while (0);
 $AsyncCtx34 = _emscripten_alloc_async_context(12, sp) | 0; //@line 4677
 __ZN9UDPSocketD2Ev($5); //@line 4678
 if (___async) {
  HEAP32[$AsyncCtx34 >> 2] = 95; //@line 4681
  HEAP32[$AsyncCtx34 + 4 >> 2] = $5; //@line 4683
  HEAP32[$AsyncCtx34 + 8 >> 2] = $$2; //@line 4685
  sp = STACKTOP; //@line 4686
  STACKTOP = sp; //@line 4687
  return 0; //@line 4687
 }
 _emscripten_free_async_context($AsyncCtx34 | 0); //@line 4689
 $$3 = $$2; //@line 4690
 STACKTOP = sp; //@line 4691
 return $$3 | 0; //@line 4691
}
function _vfscanf($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$ = 0, $$$0268 = 0, $$0266$lcssa = 0, $$0266397 = 0, $$0268 = 0, $$0270 = 0, $$0272 = 0, $$0273408 = 0, $$0276$ph = 0, $$0278$ph = 0, $$0278$ph$phi = 0, $$0278$ph336 = 0, $$0283407 = 0, $$0286399 = 0, $$0288404 = 0, $$0292 = 0, $$0293 = 0, $$0305402 = 0, $$10 = 0, $$11 = 0, $$1267 = 0, $$1271 = 0, $$1274 = 0, $$1277$ph = 0, $$1279 = 0, $$1284 = 0, $$1289 = 0, $$1306 = 0, $$2 = 0, $$2275 = 0, $$2280 = 0, $$2280$ph = 0, $$2280$ph$phi = 0, $$2285 = 0, $$2290 = 0, $$2307$ph = 0, $$3$lcssa = 0, $$3281 = 0, $$3291 = 0, $$3396 = 0, $$4 = 0, $$4282 = 0, $$4309 = 0, $$5 = 0, $$5299 = 0, $$5310 = 0, $$6 = 0, $$6$pn = 0, $$6311 = 0, $$7 = 0, $$7$ph = 0, $$7312 = 0, $$8 = 0, $$8313 = 0, $$9 = 0, $$9314 = 0, $$ph = 0, $$sink330 = 0, $$sroa$2$0$$sroa_idx13 = 0, $100 = 0, $101 = 0, $106 = 0, $108 = 0, $11 = 0, $111 = 0, $112 = 0, $114 = 0, $117 = 0, $120 = 0, $122 = 0, $127 = 0, $13 = 0, $134 = 0, $14 = 0, $140 = 0, $146 = 0, $148 = 0, $149 = 0, $15 = 0, $155 = 0, $158 = 0, $16 = 0, $162 = 0, $164 = 0, $166 = 0, $168 = 0, $169 = 0, $17 = 0, $170 = 0, $172 = 0, $176 = 0, $179 = 0, $18 = 0, $183 = 0, $186 = 0, $187 = 0, $188 = 0, $190 = 0, $192 = 0, $193 = 0, $20 = 0, $201 = 0, $211 = 0, $213 = 0, $217 = 0, $219 = 0, $227 = 0, $23 = 0, $235 = 0, $236 = 0, $239 = 0, $247 = 0, $254 = 0, $262 = 0, $269 = 0, $274 = 0, $275 = 0, $28 = 0, $282 = 0, $292 = 0.0, $3 = 0, $312 = 0, $314 = 0, $315 = 0, $316 = 0, $317 = 0, $318 = 0, $319 = 0, $320 = 0, $321 = 0, $322 = 0, $35 = 0, $4 = 0, $41 = 0, $47 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $54 = 0, $55 = 0, $6 = 0, $65 = 0, $90 = 0, $91 = 0, $trunc = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 10838
 STACKTOP = STACKTOP + 288 | 0; //@line 10839
 $3 = sp + 8 | 0; //@line 10840
 $4 = sp + 17 | 0; //@line 10841
 $5 = sp; //@line 10842
 $6 = sp + 16 | 0; //@line 10843
 if ((HEAP32[$0 + 76 >> 2] | 0) > -1) {
  $314 = ___lockfile($0) | 0; //@line 10849
 } else {
  $314 = 0; //@line 10851
 }
 $11 = HEAP8[$1 >> 0] | 0; //@line 10853
 L4 : do {
  if (!($11 << 24 >> 24)) {
   $$3291 = 0; //@line 10857
  } else {
   $13 = $0 + 4 | 0; //@line 10859
   $14 = $0 + 100 | 0; //@line 10860
   $15 = $0 + 108 | 0; //@line 10861
   $16 = $0 + 8 | 0; //@line 10862
   $17 = $4 + 10 | 0; //@line 10863
   $18 = $4 + 33 | 0; //@line 10864
   $$sroa$2$0$$sroa_idx13 = $3 + 4 | 0; //@line 10865
   $$0273408 = $1; //@line 10866
   $$0283407 = 0; //@line 10866
   $$0288404 = 0; //@line 10866
   $$0305402 = 0; //@line 10866
   $20 = $11; //@line 10866
   $315 = 0; //@line 10866
   L6 : while (1) {
    L8 : do {
     if (!(_isspace($20 & 255) | 0)) {
      $50 = (HEAP8[$$0273408 >> 0] | 0) == 37; //@line 10874
      L10 : do {
       if ($50) {
        $51 = $$0273408 + 1 | 0; //@line 10877
        $52 = HEAP8[$51 >> 0] | 0; //@line 10878
        L12 : do {
         switch ($52 << 24 >> 24) {
         case 37:
          {
           break L10;
           break;
          }
         case 42:
          {
           $$0293 = 0; //@line 10887
           $$2275 = $$0273408 + 2 | 0; //@line 10887
           break;
          }
         default:
          {
           if (_isdigit($52 & 255) | 0) {
            if ((HEAP8[$$0273408 + 2 >> 0] | 0) == 36) {
             $$0293 = _arg_n_727($2, (HEAPU8[$51 >> 0] | 0) + -48 | 0) | 0; //@line 10904
             $$2275 = $$0273408 + 3 | 0; //@line 10904
             break L12;
            }
           }
           $90 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 10919
           $91 = HEAP32[$90 >> 2] | 0; //@line 10920
           HEAP32[$2 >> 2] = $90 + 4; //@line 10922
           $$0293 = $91; //@line 10923
           $$2275 = $51; //@line 10923
          }
         }
        } while (0);
        if (!(_isdigit(HEAPU8[$$2275 >> 0] | 0) | 0)) {
         $$0266$lcssa = 0; //@line 10932
         $$3$lcssa = $$2275; //@line 10932
        } else {
         $$0266397 = 0; //@line 10934
         $$3396 = $$2275; //@line 10934
         while (1) {
          $100 = ($$0266397 * 10 | 0) + -48 + (HEAPU8[$$3396 >> 0] | 0) | 0; //@line 10940
          $101 = $$3396 + 1 | 0; //@line 10941
          if (!(_isdigit(HEAPU8[$101 >> 0] | 0) | 0)) {
           $$0266$lcssa = $100; //@line 10947
           $$3$lcssa = $101; //@line 10947
           break;
          } else {
           $$0266397 = $100; //@line 10950
           $$3396 = $101; //@line 10950
          }
         }
        }
        $106 = HEAP8[$$3$lcssa >> 0] | 0; //@line 10954
        $108 = $$3$lcssa + 1 | 0; //@line 10956
        if ($106 << 24 >> 24 == 109) {
         $$0270 = ($$0293 | 0) != 0 & 1; //@line 10961
         $$1306 = 0; //@line 10961
         $$4 = $108; //@line 10961
         $112 = HEAP8[$108 >> 0] | 0; //@line 10961
         $318 = 0; //@line 10961
        } else {
         $$0270 = 0; //@line 10963
         $$1306 = $$0305402; //@line 10963
         $$4 = $$3$lcssa; //@line 10963
         $112 = $106; //@line 10963
         $318 = $315; //@line 10963
        }
        $111 = $$4 + 1 | 0; //@line 10965
        switch ($112 << 24 >> 24) {
        case 104:
         {
          $114 = (HEAP8[$111 >> 0] | 0) == 104; //@line 10969
          $$0268 = $114 ? -2 : -1; //@line 10973
          $$5 = $114 ? $$4 + 2 | 0 : $111; //@line 10973
          break;
         }
        case 108:
         {
          $117 = (HEAP8[$111 >> 0] | 0) == 108; //@line 10978
          $$0268 = $117 ? 3 : 1; //@line 10982
          $$5 = $117 ? $$4 + 2 | 0 : $111; //@line 10982
          break;
         }
        case 106:
         {
          $$0268 = 3; //@line 10986
          $$5 = $111; //@line 10986
          break;
         }
        case 116:
        case 122:
         {
          $$0268 = 1; //@line 10990
          $$5 = $111; //@line 10990
          break;
         }
        case 76:
         {
          $$0268 = 2; //@line 10994
          $$5 = $111; //@line 10994
          break;
         }
        case 110:
        case 112:
        case 67:
        case 83:
        case 91:
        case 99:
        case 115:
        case 88:
        case 71:
        case 70:
        case 69:
        case 65:
        case 103:
        case 102:
        case 101:
        case 97:
        case 120:
        case 117:
        case 111:
        case 105:
        case 100:
         {
          $$0268 = 0; //@line 10998
          $$5 = $$4; //@line 10998
          break;
         }
        default:
         {
          $$7312 = $$1306; //@line 11002
          $319 = $318; //@line 11002
          label = 136; //@line 11003
          break L6;
         }
        }
        $120 = HEAPU8[$$5 >> 0] | 0; //@line 11008
        $122 = ($120 & 47 | 0) == 3; //@line 11010
        $$ = $122 ? $120 | 32 : $120; //@line 11012
        $$$0268 = $122 ? 1 : $$0268; //@line 11013
        $trunc = $$ & 255; //@line 11014
        switch ($trunc << 24 >> 24) {
        case 99:
         {
          $$1267 = ($$0266$lcssa | 0) > 1 ? $$0266$lcssa : 1; //@line 11019
          $$1284 = $$0283407; //@line 11019
          break;
         }
        case 91:
         {
          $$1267 = $$0266$lcssa; //@line 11023
          $$1284 = $$0283407; //@line 11023
          break;
         }
        case 110:
         {
          _store_int_728($$0293, $$$0268, $$0283407, (($$0283407 | 0) < 0) << 31 >> 31); //@line 11029
          $$11 = $$5; //@line 11030
          $$1289 = $$0288404; //@line 11030
          $$2285 = $$0283407; //@line 11030
          $$6311 = $$1306; //@line 11030
          $316 = $318; //@line 11030
          break L8;
          break;
         }
        default:
         {
          ___shlim($0, 0); //@line 11035
          do {
           $127 = HEAP32[$13 >> 2] | 0; //@line 11037
           if ($127 >>> 0 < (HEAP32[$14 >> 2] | 0) >>> 0) {
            HEAP32[$13 >> 2] = $127 + 1; //@line 11042
            $134 = HEAPU8[$127 >> 0] | 0; //@line 11045
           } else {
            $134 = ___shgetc($0) | 0; //@line 11048
           }
          } while ((_isspace($134) | 0) != 0);
          if (!(HEAP32[$14 >> 2] | 0)) {
           $146 = HEAP32[$13 >> 2] | 0; //@line 11060
          } else {
           $140 = (HEAP32[$13 >> 2] | 0) + -1 | 0; //@line 11063
           HEAP32[$13 >> 2] = $140; //@line 11064
           $146 = $140; //@line 11066
          }
          $$1267 = $$0266$lcssa; //@line 11073
          $$1284 = (HEAP32[$15 >> 2] | 0) + $$0283407 + $146 - (HEAP32[$16 >> 2] | 0) | 0; //@line 11073
         }
        }
        ___shlim($0, $$1267); //@line 11076
        $148 = HEAP32[$13 >> 2] | 0; //@line 11077
        $149 = HEAP32[$14 >> 2] | 0; //@line 11078
        if ($148 >>> 0 < $149 >>> 0) {
         HEAP32[$13 >> 2] = $148 + 1; //@line 11082
         $155 = $149; //@line 11083
        } else {
         if ((___shgetc($0) | 0) < 0) {
          $$7312 = $$1306; //@line 11088
          $319 = $318; //@line 11088
          label = 136; //@line 11089
          break L6;
         }
         $155 = HEAP32[$14 >> 2] | 0; //@line 11093
        }
        if ($155 | 0) {
         HEAP32[$13 >> 2] = (HEAP32[$13 >> 2] | 0) + -1; //@line 11099
        }
        L58 : do {
         switch ($trunc << 24 >> 24) {
         case 91:
         case 99:
         case 115:
          {
           $158 = ($$ | 0) == 99; //@line 11104
           L60 : do {
            if (($$ | 16 | 0) == 115) {
             _memset($4 | 0, -1, 257) | 0; //@line 11110
             HEAP8[$4 >> 0] = 0; //@line 11111
             if (($$ | 0) == 115) {
              HEAP8[$18 >> 0] = 0; //@line 11113
              HEAP8[$17 >> 0] = 0; //@line 11114
              HEAP8[$17 + 1 >> 0] = 0; //@line 11114
              HEAP8[$17 + 2 >> 0] = 0; //@line 11114
              HEAP8[$17 + 3 >> 0] = 0; //@line 11114
              HEAP8[$17 + 4 >> 0] = 0; //@line 11114
              $$9 = $$5; //@line 11115
             } else {
              $$9 = $$5; //@line 11117
             }
            } else {
             $162 = $$5 + 1 | 0; //@line 11120
             $164 = (HEAP8[$162 >> 0] | 0) == 94; //@line 11122
             $$0292 = $164 & 1; //@line 11124
             $$6 = $164 ? $$5 + 2 | 0 : $162; //@line 11125
             _memset($4 | 0, $$0292 | 0, 257) | 0; //@line 11126
             HEAP8[$4 >> 0] = 0; //@line 11127
             $166 = HEAP8[$$6 >> 0] | 0; //@line 11128
             switch ($166 << 24 >> 24) {
             case 45:
              {
               $$6$pn = $$6; //@line 11131
               $$sink330 = 46; //@line 11131
               label = 65; //@line 11132
               break;
              }
             case 93:
              {
               $$6$pn = $$6; //@line 11136
               $$sink330 = 94; //@line 11136
               label = 65; //@line 11137
               break;
              }
             default:
              {
               $$7 = $$6; //@line 11141
               $168 = $166; //@line 11141
              }
             }
             while (1) {
              if ((label | 0) == 65) {
               label = 0; //@line 11146
               HEAP8[$4 + $$sink330 >> 0] = $$0292 ^ 1; //@line 11150
               $$7$ph = $$6$pn + 1 | 0; //@line 11151
               $$7 = $$7$ph; //@line 11153
               $168 = HEAP8[$$7$ph >> 0] | 0; //@line 11153
              }
              L70 : do {
               switch ($168 << 24 >> 24) {
               case 0:
                {
                 $$7312 = $$1306; //@line 11158
                 $319 = $318; //@line 11158
                 label = 136; //@line 11159
                 break L6;
                 break;
                }
               case 93:
                {
                 $$9 = $$7; //@line 11164
                 break L60;
                 break;
                }
               case 45:
                {
                 $169 = $$7 + 1 | 0; //@line 11169
                 $170 = HEAP8[$169 >> 0] | 0; //@line 11170
                 switch ($170 << 24 >> 24) {
                 case 93:
                 case 0:
                  {
                   $$8 = $$7; //@line 11173
                   $183 = 45; //@line 11173
                   break L70;
                   break;
                  }
                 default:
                  {}
                 }
                 $172 = HEAP8[$$7 + -1 >> 0] | 0; //@line 11181
                 if (($172 & 255) < ($170 & 255)) {
                  $176 = ($$0292 ^ 1) & 255; //@line 11186
                  $$0286399 = $172 & 255; //@line 11187
                  do {
                   $$0286399 = $$0286399 + 1 | 0; //@line 11189
                   HEAP8[$4 + $$0286399 >> 0] = $176; //@line 11191
                   $179 = HEAP8[$169 >> 0] | 0; //@line 11192
                  } while (($$0286399 | 0) < ($179 & 255 | 0));
                  $$8 = $169; //@line 11198
                  $183 = $179; //@line 11198
                 } else {
                  $$8 = $169; //@line 11203
                  $183 = $170; //@line 11203
                 }
                 break;
                }
               default:
                {
                 $$8 = $$7; //@line 11208
                 $183 = $168; //@line 11208
                }
               }
              } while (0);
              $$6$pn = $$8; //@line 11214
              $$sink330 = ($183 & 255) + 1 | 0; //@line 11214
              label = 65; //@line 11215
             }
            }
           } while (0);
           $186 = $158 ? $$1267 + 1 | 0 : 31; //@line 11220
           $187 = ($$$0268 | 0) == 1; //@line 11221
           $188 = ($$0270 | 0) != 0; //@line 11222
           L78 : do {
            if ($187) {
             if ($188) {
              $190 = _malloc($186 << 2) | 0; //@line 11227
              if (!$190) {
               $$7312 = 0; //@line 11230
               $319 = 0; //@line 11230
               label = 136; //@line 11231
               break L6;
              } else {
               $321 = $190; //@line 11234
              }
             } else {
              $321 = $$0293; //@line 11237
             }
             HEAP32[$3 >> 2] = 0; //@line 11239
             HEAP32[$$sroa$2$0$$sroa_idx13 >> 2] = 0; //@line 11240
             $$0276$ph = $186; //@line 11241
             $$0278$ph = 0; //@line 11241
             $$ph = $321; //@line 11241
             L83 : while (1) {
              $192 = ($$ph | 0) == 0; //@line 11243
              $$0278$ph336 = $$0278$ph; //@line 11244
              while (1) {
               L87 : while (1) {
                $193 = HEAP32[$13 >> 2] | 0; //@line 11247
                if ($193 >>> 0 < (HEAP32[$14 >> 2] | 0) >>> 0) {
                 HEAP32[$13 >> 2] = $193 + 1; //@line 11252
                 $201 = HEAPU8[$193 >> 0] | 0; //@line 11255
                } else {
                 $201 = ___shgetc($0) | 0; //@line 11258
                }
                if (!(HEAP8[$4 + ($201 + 1) >> 0] | 0)) {
                 break L83;
                }
                HEAP8[$6 >> 0] = $201; //@line 11268
                switch (_mbrtowc($5, $6, 1, $3) | 0) {
                case -1:
                 {
                  $$7312 = 0; //@line 11272
                  $319 = $$ph; //@line 11272
                  label = 136; //@line 11273
                  break L6;
                  break;
                 }
                case -2:
                 {
                  break;
                 }
                default:
                 {
                  break L87;
                 }
                }
               }
               if ($192) {
                $$1279 = $$0278$ph336; //@line 11286
               } else {
                HEAP32[$$ph + ($$0278$ph336 << 2) >> 2] = HEAP32[$5 >> 2]; //@line 11291
                $$1279 = $$0278$ph336 + 1 | 0; //@line 11292
               }
               if ($188 & ($$1279 | 0) == ($$0276$ph | 0)) {
                break;
               } else {
                $$0278$ph336 = $$1279; //@line 11299
               }
              }
              $211 = $$0276$ph << 1 | 1; //@line 11303
              $213 = _realloc($$ph, $211 << 2) | 0; //@line 11305
              if (!$213) {
               $$7312 = 0; //@line 11308
               $319 = $$ph; //@line 11308
               label = 136; //@line 11309
               break L6;
              } else {
               $$0278$ph$phi = $$0276$ph; //@line 11312
               $$0276$ph = $211; //@line 11312
               $$ph = $213; //@line 11312
               $$0278$ph = $$0278$ph$phi; //@line 11312
              }
             }
             if (!(_mbsinit($3) | 0)) {
              $$7312 = 0; //@line 11318
              $319 = $$ph; //@line 11318
              label = 136; //@line 11319
              break L6;
             } else {
              $$4282 = $$0278$ph336; //@line 11322
              $$4309 = 0; //@line 11322
              $$5299 = $$ph; //@line 11322
              $322 = $$ph; //@line 11322
             }
            } else {
             if ($188) {
              $217 = _malloc($186) | 0; //@line 11326
              if (!$217) {
               $$7312 = 0; //@line 11329
               $319 = 0; //@line 11329
               label = 136; //@line 11330
               break L6;
              } else {
               $$1277$ph = $186; //@line 11333
               $$2280$ph = 0; //@line 11333
               $$2307$ph = $217; //@line 11333
              }
              while (1) {
               $$2280 = $$2280$ph; //@line 11336
               do {
                $219 = HEAP32[$13 >> 2] | 0; //@line 11338
                if ($219 >>> 0 < (HEAP32[$14 >> 2] | 0) >>> 0) {
                 HEAP32[$13 >> 2] = $219 + 1; //@line 11343
                 $227 = HEAPU8[$219 >> 0] | 0; //@line 11346
                } else {
                 $227 = ___shgetc($0) | 0; //@line 11349
                }
                if (!(HEAP8[$4 + ($227 + 1) >> 0] | 0)) {
                 $$4282 = $$2280; //@line 11356
                 $$4309 = $$2307$ph; //@line 11356
                 $$5299 = 0; //@line 11356
                 $322 = 0; //@line 11356
                 break L78;
                }
                HEAP8[$$2307$ph + $$2280 >> 0] = $227; //@line 11362
                $$2280 = $$2280 + 1 | 0; //@line 11360
               } while (($$2280 | 0) != ($$1277$ph | 0));
               $235 = $$1277$ph << 1 | 1; //@line 11371
               $236 = _realloc($$2307$ph, $235) | 0; //@line 11372
               if (!$236) {
                $$7312 = $$2307$ph; //@line 11375
                $319 = 0; //@line 11375
                label = 136; //@line 11376
                break L6;
               } else {
                $$2280$ph$phi = $$1277$ph; //@line 11379
                $$1277$ph = $235; //@line 11379
                $$2307$ph = $236; //@line 11379
                $$2280$ph = $$2280$ph$phi; //@line 11379
               }
              }
             }
             if (!$$0293) {
              while (1) {
               $254 = HEAP32[$13 >> 2] | 0; //@line 11386
               if ($254 >>> 0 < (HEAP32[$14 >> 2] | 0) >>> 0) {
                HEAP32[$13 >> 2] = $254 + 1; //@line 11391
                $262 = HEAPU8[$254 >> 0] | 0; //@line 11394
               } else {
                $262 = ___shgetc($0) | 0; //@line 11397
               }
               if (!(HEAP8[$4 + ($262 + 1) >> 0] | 0)) {
                $$4282 = 0; //@line 11404
                $$4309 = 0; //@line 11404
                $$5299 = 0; //@line 11404
                $322 = 0; //@line 11404
                break L78;
               }
              }
             } else {
              $$3281 = 0; //@line 11409
             }
             while (1) {
              $239 = HEAP32[$13 >> 2] | 0; //@line 11412
              if ($239 >>> 0 < (HEAP32[$14 >> 2] | 0) >>> 0) {
               HEAP32[$13 >> 2] = $239 + 1; //@line 11417
               $247 = HEAPU8[$239 >> 0] | 0; //@line 11420
              } else {
               $247 = ___shgetc($0) | 0; //@line 11423
              }
              if (!(HEAP8[$4 + ($247 + 1) >> 0] | 0)) {
               $$4282 = $$3281; //@line 11430
               $$4309 = $$0293; //@line 11430
               $$5299 = 0; //@line 11430
               $322 = 0; //@line 11430
               break L78;
              }
              HEAP8[$$0293 + $$3281 >> 0] = $247; //@line 11436
              $$3281 = $$3281 + 1 | 0; //@line 11437
             }
            }
           } while (0);
           if (!(HEAP32[$14 >> 2] | 0)) {
            $274 = HEAP32[$13 >> 2] | 0; //@line 11445
           } else {
            $269 = (HEAP32[$13 >> 2] | 0) + -1 | 0; //@line 11448
            HEAP32[$13 >> 2] = $269; //@line 11449
            $274 = $269; //@line 11451
           }
           $275 = $274 - (HEAP32[$16 >> 2] | 0) + (HEAP32[$15 >> 2] | 0) | 0; //@line 11456
           if (!$275) {
            $$2 = $$0270; //@line 11459
            $$2290 = $$0288404; //@line 11459
            $$9314 = $$4309; //@line 11459
            $312 = $322; //@line 11459
            break L6;
           }
           if (!(($275 | 0) == ($$1267 | 0) | $158 ^ 1)) {
            $$2 = $$0270; //@line 11466
            $$2290 = $$0288404; //@line 11466
            $$9314 = $$4309; //@line 11466
            $312 = $322; //@line 11466
            break L6;
           }
           do {
            if ($188) {
             if ($187) {
              HEAP32[$$0293 >> 2] = $$5299; //@line 11472
              break;
             } else {
              HEAP32[$$0293 >> 2] = $$4309; //@line 11475
              break;
             }
            }
           } while (0);
           if ($158) {
            $$10 = $$9; //@line 11481
            $$5310 = $$4309; //@line 11481
            $320 = $322; //@line 11481
           } else {
            if ($$5299 | 0) {
             HEAP32[$$5299 + ($$4282 << 2) >> 2] = 0; //@line 11486
            }
            if (!$$4309) {
             $$10 = $$9; //@line 11490
             $$5310 = 0; //@line 11490
             $320 = $322; //@line 11490
             break L58;
            }
            HEAP8[$$4309 + $$4282 >> 0] = 0; //@line 11494
            $$10 = $$9; //@line 11495
            $$5310 = $$4309; //@line 11495
            $320 = $322; //@line 11495
           }
           break;
          }
         case 120:
         case 88:
         case 112:
          {
           $$0272 = 16; //@line 11500
           label = 124; //@line 11501
           break;
          }
         case 111:
          {
           $$0272 = 8; //@line 11505
           label = 124; //@line 11506
           break;
          }
         case 117:
         case 100:
          {
           $$0272 = 10; //@line 11510
           label = 124; //@line 11511
           break;
          }
         case 105:
          {
           $$0272 = 0; //@line 11515
           label = 124; //@line 11516
           break;
          }
         case 71:
         case 103:
         case 70:
         case 102:
         case 69:
         case 101:
         case 65:
         case 97:
          {
           $292 = +___floatscan($0, $$$0268, 0); //@line 11520
           if ((HEAP32[$15 >> 2] | 0) == ((HEAP32[$16 >> 2] | 0) - (HEAP32[$13 >> 2] | 0) | 0)) {
            $$2 = $$0270; //@line 11527
            $$2290 = $$0288404; //@line 11527
            $$9314 = $$1306; //@line 11527
            $312 = $318; //@line 11527
            break L6;
           }
           if (!$$0293) {
            $$10 = $$5; //@line 11532
            $$5310 = $$1306; //@line 11532
            $320 = $318; //@line 11532
           } else {
            switch ($$$0268 | 0) {
            case 0:
             {
              HEAPF32[$$0293 >> 2] = $292; //@line 11537
              $$10 = $$5; //@line 11538
              $$5310 = $$1306; //@line 11538
              $320 = $318; //@line 11538
              break L58;
              break;
             }
            case 1:
             {
              HEAPF64[$$0293 >> 3] = $292; //@line 11543
              $$10 = $$5; //@line 11544
              $$5310 = $$1306; //@line 11544
              $320 = $318; //@line 11544
              break L58;
              break;
             }
            case 2:
             {
              HEAPF64[$$0293 >> 3] = $292; //@line 11549
              $$10 = $$5; //@line 11550
              $$5310 = $$1306; //@line 11550
              $320 = $318; //@line 11550
              break L58;
              break;
             }
            default:
             {
              $$10 = $$5; //@line 11555
              $$5310 = $$1306; //@line 11555
              $320 = $318; //@line 11555
              break L58;
             }
            }
           }
           break;
          }
         default:
          {
           $$10 = $$5; //@line 11563
           $$5310 = $$1306; //@line 11563
           $320 = $318; //@line 11563
          }
         }
        } while (0);
        do {
         if ((label | 0) == 124) {
          label = 0; //@line 11569
          $282 = ___intscan($0, $$0272, 0, -1, -1) | 0; //@line 11570
          if ((HEAP32[$15 >> 2] | 0) == ((HEAP32[$16 >> 2] | 0) - (HEAP32[$13 >> 2] | 0) | 0)) {
           $$2 = $$0270; //@line 11578
           $$2290 = $$0288404; //@line 11578
           $$9314 = $$1306; //@line 11578
           $312 = $318; //@line 11578
           break L6;
          }
          if (($$0293 | 0) != 0 & ($$ | 0) == 112) {
           HEAP32[$$0293 >> 2] = $282; //@line 11586
           $$10 = $$5; //@line 11587
           $$5310 = $$1306; //@line 11587
           $320 = $318; //@line 11587
           break;
          } else {
           _store_int_728($$0293, $$$0268, $282, tempRet0); //@line 11590
           $$10 = $$5; //@line 11591
           $$5310 = $$1306; //@line 11591
           $320 = $318; //@line 11591
           break;
          }
         }
        } while (0);
        $$11 = $$10; //@line 11605
        $$1289 = $$0288404 + (($$0293 | 0) != 0 & 1) | 0; //@line 11605
        $$2285 = (HEAP32[$15 >> 2] | 0) + $$1284 + (HEAP32[$13 >> 2] | 0) - (HEAP32[$16 >> 2] | 0) | 0; //@line 11605
        $$6311 = $$5310; //@line 11605
        $316 = $320; //@line 11605
        break L8;
       }
      } while (0);
      $54 = $$0273408 + ($50 & 1) | 0; //@line 11610
      ___shlim($0, 0); //@line 11611
      $55 = HEAP32[$13 >> 2] | 0; //@line 11612
      if ($55 >>> 0 < (HEAP32[$14 >> 2] | 0) >>> 0) {
       HEAP32[$13 >> 2] = $55 + 1; //@line 11617
       $65 = HEAPU8[$55 >> 0] | 0; //@line 11620
      } else {
       $65 = ___shgetc($0) | 0; //@line 11623
      }
      if (($65 | 0) != (HEAPU8[$54 >> 0] | 0)) {
       label = 22; //@line 11629
       break L6;
      }
      $$11 = $54; //@line 11633
      $$1289 = $$0288404; //@line 11633
      $$2285 = $$0283407 + 1 | 0; //@line 11633
      $$6311 = $$0305402; //@line 11633
      $316 = $315; //@line 11633
     } else {
      $$1274 = $$0273408; //@line 11635
      while (1) {
       $23 = $$1274 + 1 | 0; //@line 11637
       if (!(_isspace(HEAPU8[$23 >> 0] | 0) | 0)) {
        break;
       } else {
        $$1274 = $23; //@line 11645
       }
      }
      ___shlim($0, 0); //@line 11648
      do {
       $28 = HEAP32[$13 >> 2] | 0; //@line 11650
       if ($28 >>> 0 < (HEAP32[$14 >> 2] | 0) >>> 0) {
        HEAP32[$13 >> 2] = $28 + 1; //@line 11655
        $35 = HEAPU8[$28 >> 0] | 0; //@line 11658
       } else {
        $35 = ___shgetc($0) | 0; //@line 11661
       }
      } while ((_isspace($35) | 0) != 0);
      if (!(HEAP32[$14 >> 2] | 0)) {
       $47 = HEAP32[$13 >> 2] | 0; //@line 11673
      } else {
       $41 = (HEAP32[$13 >> 2] | 0) + -1 | 0; //@line 11676
       HEAP32[$13 >> 2] = $41; //@line 11677
       $47 = $41; //@line 11679
      }
      $$11 = $$1274; //@line 11686
      $$1289 = $$0288404; //@line 11686
      $$2285 = (HEAP32[$15 >> 2] | 0) + $$0283407 + $47 - (HEAP32[$16 >> 2] | 0) | 0; //@line 11686
      $$6311 = $$0305402; //@line 11686
      $316 = $315; //@line 11686
     }
    } while (0);
    $$0273408 = $$11 + 1 | 0; //@line 11689
    $20 = HEAP8[$$0273408 >> 0] | 0; //@line 11690
    if (!($20 << 24 >> 24)) {
     $$3291 = $$1289; //@line 11693
     break L4;
    } else {
     $$0283407 = $$2285; //@line 11696
     $$0288404 = $$1289; //@line 11696
     $$0305402 = $$6311; //@line 11696
     $315 = $316; //@line 11696
    }
   }
   if ((label | 0) == 22) {
    if (HEAP32[$14 >> 2] | 0) {
     HEAP32[$13 >> 2] = (HEAP32[$13 >> 2] | 0) + -1; //@line 11705
    }
    if (($$0288404 | 0) != 0 | ($65 | 0) > -1) {
     $$3291 = $$0288404; //@line 11711
     break;
    } else {
     $$1271 = 0; //@line 11714
     $$8313 = $$0305402; //@line 11714
     $317 = $315; //@line 11714
     label = 137; //@line 11715
    }
   } else if ((label | 0) == 136) {
    if (!$$0288404) {
     $$1271 = $$0270; //@line 11721
     $$8313 = $$7312; //@line 11721
     $317 = $319; //@line 11721
     label = 137; //@line 11722
    } else {
     $$2 = $$0270; //@line 11724
     $$2290 = $$0288404; //@line 11724
     $$9314 = $$7312; //@line 11724
     $312 = $319; //@line 11724
    }
   }
   if ((label | 0) == 137) {
    $$2 = $$1271; //@line 11728
    $$2290 = -1; //@line 11728
    $$9314 = $$8313; //@line 11728
    $312 = $317; //@line 11728
   }
   if (!$$2) {
    $$3291 = $$2290; //@line 11732
   } else {
    _free($$9314); //@line 11734
    _free($312); //@line 11735
    $$3291 = $$2290; //@line 11736
   }
  }
 } while (0);
 if ($314 | 0) {
  ___unlockfile($0); //@line 11742
 }
 STACKTOP = sp; //@line 11744
 return $$3291 | 0; //@line 11744
}
function _decfloat($0, $1, $2, $3, $4, $5) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 $5 = $5 | 0;
 var $$0329 = 0, $$0332488 = 0, $$0333 = 0, $$0334 = 0, $$0336484 = 0, $$0340494 = 0, $$0341$lcssa = 0, $$0341461 = 0, $$0341462 = 0, $$0341463 = 0, $$0341511 = 0, $$0345$lcssa = 0, $$0345465 = 0, $$0345466 = 0, $$0345467 = 0, $$0345510 = 0, $$0350$lcssa553 = 0, $$0350492 = 0, $$0360 = 0.0, $$0361 = 0.0, $$0365482 = 0.0, $$0372 = 0, $$0380 = 0, $$0380$ph = 0, $$0385$lcssa552 = 0, $$0385491 = 0, $$0393 = 0, $$0396 = 0, $$0401$lcssa = 0, $$0401471 = 0, $$0401472 = 0, $$0401473 = 0, $$0401507 = 0, $$1 = 0.0, $$10 = 0, $$1330$be = 0, $$1330$ph = 0, $$1335 = 0, $$1337 = 0, $$1362 = 0.0, $$1366 = 0.0, $$1373 = 0, $$1373$ph446 = 0, $$1381 = 0, $$1381$ph = 0, $$1381$ph557 = 0, $$1394$lcssa = 0, $$1394509 = 0, $$2 = 0, $$2343 = 0, $$2347 = 0, $$2352$ph447 = 0, $$2367 = 0.0, $$2374 = 0, $$2387$ph445 = 0, $$2395 = 0, $$2398 = 0, $$2403 = 0, $$3$be = 0, $$3$lcssa = 0, $$3344501 = 0, $$3348 = 0, $$3364 = 0.0, $$3368 = 0.0, $$3383 = 0, $$3399$lcssa = 0, $$3399508 = 0, $$3512 = 0, $$423 = 0, $$4349493 = 0, $$4354 = 0, $$4354$ph = 0, $$4354$ph558 = 0, $$4376 = 0, $$4384 = 0, $$4389$ph = 0, $$4389$ph443 = 0, $$4400 = 0, $$4483 = 0, $$5 = 0, $$5$in = 0, $$5355486 = 0, $$5390485 = 0, $$6378$ph = 0, $$6487 = 0, $$9481 = 0, $$pre = 0, $$pre551 = 0, $$sink = 0, $$sink419$off0 = 0, $10 = 0, $100 = 0, $105 = 0, $106 = 0, $108 = 0, $109 = 0, $122 = 0, $124 = 0, $134 = 0, $136 = 0, $148 = 0, $150 = 0, $17 = 0, $172 = 0, $184 = 0, $188 = 0, $191 = 0, $193 = 0, $194 = 0, $195 = 0, $198 = 0, $212 = 0, $213 = 0, $214 = 0, $218 = 0, $220 = 0, $222 = 0, $223 = 0, $229 = 0, $231 = 0, $236 = 0, $243 = 0, $246 = 0, $249 = 0, $25 = 0, $256 = 0, $259 = 0, $26 = 0, $261 = 0, $264 = 0, $267 = 0, $268 = 0, $27 = 0, $271 = 0, $272 = 0, $273 = 0, $274 = 0, $277 = 0, $28 = 0, $289 = 0, $29 = 0, $294 = 0, $299 = 0, $302 = 0, $311 = 0.0, $312 = 0.0, $313 = 0, $314 = 0, $315 = 0, $320 = 0.0, $323 = 0.0, $327 = 0, $330 = 0, $354 = 0.0, $359 = 0, $368 = 0, $369 = 0, $37 = 0, $370 = 0, $371 = 0, $372 = 0, $373 = 0, $374 = 0, $375 = 0, $376 = 0, $377 = 0, $378 = 0, $379 = 0, $380 = 0, $381 = 0, $382 = 0, $383 = 0, $384 = 0, $385 = 0, $386 = 0, $387 = 0, $39 = 0, $41 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0, $54 = 0, $55 = 0, $59 = 0, $6 = 0, $7 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $8 = 0, $80 = 0, $81 = 0, $9 = 0, $90 = 0, $91 = 0, $92 = 0, $or$cond418 = 0, $or$cond424 = 0, $sum = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 1611
 STACKTOP = STACKTOP + 512 | 0; //@line 1612
 $6 = sp; //@line 1613
 $sum = $3 + $2 | 0; //@line 1614
 $7 = 0 - $sum | 0; //@line 1615
 $8 = $0 + 4 | 0; //@line 1616
 $9 = $0 + 100 | 0; //@line 1617
 $$0329 = $1; //@line 1618
 $$0396 = 0; //@line 1618
 L1 : while (1) {
  switch ($$0329 | 0) {
  case 46:
   {
    label = 6; //@line 1622
    break L1;
    break;
   }
  case 48:
   {
    break;
   }
  default:
   {
    $$0393 = 0; //@line 1630
    $$2 = $$0329; //@line 1630
    $$2398 = $$0396; //@line 1630
    $368 = 0; //@line 1630
    $369 = 0; //@line 1630
    break L1;
   }
  }
  $10 = HEAP32[$8 >> 2] | 0; //@line 1634
  if ($10 >>> 0 < (HEAP32[$9 >> 2] | 0) >>> 0) {
   HEAP32[$8 >> 2] = $10 + 1; //@line 1639
   $$0329 = HEAPU8[$10 >> 0] | 0; //@line 1642
   $$0396 = 1; //@line 1642
   continue;
  } else {
   $$0329 = ___shgetc($0) | 0; //@line 1646
   $$0396 = 1; //@line 1646
   continue;
  }
 }
 if ((label | 0) == 6) {
  $17 = HEAP32[$8 >> 2] | 0; //@line 1651
  if ($17 >>> 0 < (HEAP32[$9 >> 2] | 0) >>> 0) {
   HEAP32[$8 >> 2] = $17 + 1; //@line 1656
   $$1330$ph = HEAPU8[$17 >> 0] | 0; //@line 1659
  } else {
   $$1330$ph = ___shgetc($0) | 0; //@line 1662
  }
  if (($$1330$ph | 0) == 48) {
   $25 = 0; //@line 1666
   $26 = 0; //@line 1666
   while (1) {
    $27 = _i64Add($25 | 0, $26 | 0, -1, -1) | 0; //@line 1668
    $28 = tempRet0; //@line 1669
    $29 = HEAP32[$8 >> 2] | 0; //@line 1670
    if ($29 >>> 0 < (HEAP32[$9 >> 2] | 0) >>> 0) {
     HEAP32[$8 >> 2] = $29 + 1; //@line 1675
     $$1330$be = HEAPU8[$29 >> 0] | 0; //@line 1678
    } else {
     $$1330$be = ___shgetc($0) | 0; //@line 1681
    }
    if (($$1330$be | 0) == 48) {
     $25 = $27; //@line 1685
     $26 = $28; //@line 1685
    } else {
     $$0393 = 1; //@line 1687
     $$2 = $$1330$be; //@line 1687
     $$2398 = 1; //@line 1687
     $368 = $27; //@line 1687
     $369 = $28; //@line 1687
     break;
    }
   }
  } else {
   $$0393 = 1; //@line 1692
   $$2 = $$1330$ph; //@line 1692
   $$2398 = $$0396; //@line 1692
   $368 = 0; //@line 1692
   $369 = 0; //@line 1692
  }
 }
 HEAP32[$6 >> 2] = 0; //@line 1695
 $37 = $$2 + -48 | 0; //@line 1696
 $39 = ($$2 | 0) == 46; //@line 1698
 L20 : do {
  if ($39 | $37 >>> 0 < 10) {
   $41 = $6 + 496 | 0; //@line 1702
   $$0341511 = 0; //@line 1703
   $$0345510 = 0; //@line 1703
   $$0401507 = 0; //@line 1703
   $$1394509 = $$0393; //@line 1703
   $$3399508 = $$2398; //@line 1703
   $$3512 = $$2; //@line 1703
   $370 = $39; //@line 1703
   $371 = $37; //@line 1703
   $372 = $368; //@line 1703
   $373 = $369; //@line 1703
   $44 = 0; //@line 1703
   $45 = 0; //@line 1703
   L22 : while (1) {
    do {
     if ($370) {
      if (!$$1394509) {
       $$2343 = $$0341511; //@line 1709
       $$2347 = $$0345510; //@line 1709
       $$2395 = 1; //@line 1709
       $$2403 = $$0401507; //@line 1709
       $$4400 = $$3399508; //@line 1709
       $374 = $44; //@line 1709
       $375 = $45; //@line 1709
       $376 = $44; //@line 1709
       $377 = $45; //@line 1709
      } else {
       break L22;
      }
     } else {
      $46 = _i64Add($44 | 0, $45 | 0, 1, 0) | 0; //@line 1715
      $47 = tempRet0; //@line 1716
      $48 = ($$3512 | 0) != 48; //@line 1717
      if (($$0345510 | 0) >= 125) {
       if (!$48) {
        $$2343 = $$0341511; //@line 1720
        $$2347 = $$0345510; //@line 1720
        $$2395 = $$1394509; //@line 1720
        $$2403 = $$0401507; //@line 1720
        $$4400 = $$3399508; //@line 1720
        $374 = $372; //@line 1720
        $375 = $373; //@line 1720
        $376 = $46; //@line 1720
        $377 = $47; //@line 1720
        break;
       }
       HEAP32[$41 >> 2] = HEAP32[$41 >> 2] | 1; //@line 1725
       $$2343 = $$0341511; //@line 1726
       $$2347 = $$0345510; //@line 1726
       $$2395 = $$1394509; //@line 1726
       $$2403 = $$0401507; //@line 1726
       $$4400 = $$3399508; //@line 1726
       $374 = $372; //@line 1726
       $375 = $373; //@line 1726
       $376 = $46; //@line 1726
       $377 = $47; //@line 1726
       break;
      }
      $$pre551 = $6 + ($$0345510 << 2) | 0; //@line 1731
      if (!$$0341511) {
       $$sink = $371; //@line 1733
      } else {
       $$sink = $$3512 + -48 + ((HEAP32[$$pre551 >> 2] | 0) * 10 | 0) | 0; //@line 1739
      }
      HEAP32[$$pre551 >> 2] = $$sink; //@line 1741
      $54 = $$0341511 + 1 | 0; //@line 1742
      $55 = ($54 | 0) == 9; //@line 1743
      $$2343 = $55 ? 0 : $54; //@line 1747
      $$2347 = $$0345510 + ($55 & 1) | 0; //@line 1747
      $$2395 = $$1394509; //@line 1747
      $$2403 = $48 ? $46 : $$0401507; //@line 1747
      $$4400 = 1; //@line 1747
      $374 = $372; //@line 1747
      $375 = $373; //@line 1747
      $376 = $46; //@line 1747
      $377 = $47; //@line 1747
     }
    } while (0);
    $59 = HEAP32[$8 >> 2] | 0; //@line 1750
    if ($59 >>> 0 < (HEAP32[$9 >> 2] | 0) >>> 0) {
     HEAP32[$8 >> 2] = $59 + 1; //@line 1755
     $$3$be = HEAPU8[$59 >> 0] | 0; //@line 1758
    } else {
     $$3$be = ___shgetc($0) | 0; //@line 1761
    }
    $371 = $$3$be + -48 | 0; //@line 1763
    $370 = ($$3$be | 0) == 46; //@line 1765
    if (!($370 | $371 >>> 0 < 10)) {
     $$0341$lcssa = $$2343; //@line 1770
     $$0345$lcssa = $$2347; //@line 1770
     $$0401$lcssa = $$2403; //@line 1770
     $$1394$lcssa = $$2395; //@line 1770
     $$3$lcssa = $$3$be; //@line 1770
     $$3399$lcssa = $$4400; //@line 1770
     $72 = $376; //@line 1770
     $73 = $374; //@line 1770
     $75 = $377; //@line 1770
     $76 = $375; //@line 1770
     label = 29; //@line 1771
     break L20;
    } else {
     $$0341511 = $$2343; //@line 1768
     $$0345510 = $$2347; //@line 1768
     $$0401507 = $$2403; //@line 1768
     $$1394509 = $$2395; //@line 1768
     $$3399508 = $$4400; //@line 1768
     $$3512 = $$3$be; //@line 1768
     $372 = $374; //@line 1768
     $373 = $375; //@line 1768
     $44 = $376; //@line 1768
     $45 = $377; //@line 1768
    }
   }
   $$0341463 = $$0341511; //@line 1776
   $$0345467 = $$0345510; //@line 1776
   $$0401473 = $$0401507; //@line 1776
   $378 = $44; //@line 1776
   $379 = $45; //@line 1776
   $380 = $372; //@line 1776
   $381 = $373; //@line 1776
   $382 = ($$3399508 | 0) != 0; //@line 1776
   label = 37; //@line 1777
  } else {
   $$0341$lcssa = 0; //@line 1779
   $$0345$lcssa = 0; //@line 1779
   $$0401$lcssa = 0; //@line 1779
   $$1394$lcssa = $$0393; //@line 1779
   $$3$lcssa = $$2; //@line 1779
   $$3399$lcssa = $$2398; //@line 1779
   $72 = 0; //@line 1779
   $73 = $368; //@line 1779
   $75 = 0; //@line 1779
   $76 = $369; //@line 1779
   label = 29; //@line 1780
  }
 } while (0);
 do {
  if ((label | 0) == 29) {
   $70 = ($$1394$lcssa | 0) == 0; //@line 1785
   $71 = $70 ? $72 : $73; //@line 1786
   $74 = $70 ? $75 : $76; //@line 1787
   $77 = ($$3399$lcssa | 0) != 0; //@line 1788
   if (!($77 & ($$3$lcssa | 32 | 0) == 101)) {
    if (($$3$lcssa | 0) > -1) {
     $$0341463 = $$0341$lcssa; //@line 1795
     $$0345467 = $$0345$lcssa; //@line 1795
     $$0401473 = $$0401$lcssa; //@line 1795
     $378 = $72; //@line 1795
     $379 = $75; //@line 1795
     $380 = $71; //@line 1795
     $381 = $74; //@line 1795
     $382 = $77; //@line 1795
     label = 37; //@line 1796
     break;
    } else {
     $$0341462 = $$0341$lcssa; //@line 1799
     $$0345466 = $$0345$lcssa; //@line 1799
     $$0401472 = $$0401$lcssa; //@line 1799
     $383 = $72; //@line 1799
     $384 = $75; //@line 1799
     $385 = $77; //@line 1799
     $386 = $71; //@line 1799
     $387 = $74; //@line 1799
     label = 39; //@line 1800
     break;
    }
   }
   $80 = _scanexp($0, $5) | 0; //@line 1804
   $81 = tempRet0; //@line 1805
   if (($80 | 0) == 0 & ($81 | 0) == -2147483648) {
    if (!$5) {
     ___shlim($0, 0); //@line 1812
     $$1 = 0.0; //@line 1813
     break;
    }
    if (!(HEAP32[$9 >> 2] | 0)) {
     $90 = 0; //@line 1819
     $91 = 0; //@line 1819
    } else {
     HEAP32[$8 >> 2] = (HEAP32[$8 >> 2] | 0) + -1; //@line 1823
     $90 = 0; //@line 1824
     $91 = 0; //@line 1824
    }
   } else {
    $90 = $80; //@line 1827
    $91 = $81; //@line 1827
   }
   $92 = _i64Add($90 | 0, $91 | 0, $71 | 0, $74 | 0) | 0; //@line 1829
   $$0341461 = $$0341$lcssa; //@line 1831
   $$0345465 = $$0345$lcssa; //@line 1831
   $$0401471 = $$0401$lcssa; //@line 1831
   $105 = $92; //@line 1831
   $106 = $72; //@line 1831
   $108 = tempRet0; //@line 1831
   $109 = $75; //@line 1831
   label = 41; //@line 1832
  }
 } while (0);
 if ((label | 0) == 37) {
  if (!(HEAP32[$9 >> 2] | 0)) {
   $$0341462 = $$0341463; //@line 1839
   $$0345466 = $$0345467; //@line 1839
   $$0401472 = $$0401473; //@line 1839
   $383 = $378; //@line 1839
   $384 = $379; //@line 1839
   $385 = $382; //@line 1839
   $386 = $380; //@line 1839
   $387 = $381; //@line 1839
   label = 39; //@line 1840
  } else {
   HEAP32[$8 >> 2] = (HEAP32[$8 >> 2] | 0) + -1; //@line 1844
   if ($382) {
    $$0341461 = $$0341463; //@line 1846
    $$0345465 = $$0345467; //@line 1846
    $$0401471 = $$0401473; //@line 1846
    $105 = $380; //@line 1846
    $106 = $378; //@line 1846
    $108 = $381; //@line 1846
    $109 = $379; //@line 1846
    label = 41; //@line 1847
   } else {
    label = 40; //@line 1849
   }
  }
 }
 if ((label | 0) == 39) {
  if ($385) {
   $$0341461 = $$0341462; //@line 1855
   $$0345465 = $$0345466; //@line 1855
   $$0401471 = $$0401472; //@line 1855
   $105 = $386; //@line 1855
   $106 = $383; //@line 1855
   $108 = $387; //@line 1855
   $109 = $384; //@line 1855
   label = 41; //@line 1856
  } else {
   label = 40; //@line 1858
  }
 }
 do {
  if ((label | 0) == 40) {
   HEAP32[(___errno_location() | 0) >> 2] = 22; //@line 1864
   ___shlim($0, 0); //@line 1865
   $$1 = 0.0; //@line 1866
  } else if ((label | 0) == 41) {
   $100 = HEAP32[$6 >> 2] | 0; //@line 1869
   if (!$100) {
    $$1 = +($4 | 0) * 0.0; //@line 1874
    break;
   }
   if ((($109 | 0) < 0 | ($109 | 0) == 0 & $106 >>> 0 < 10) & (($105 | 0) == ($106 | 0) & ($108 | 0) == ($109 | 0))) {
    if (($2 | 0) > 30 | ($100 >>> $2 | 0) == 0) {
     $$1 = +($4 | 0) * +($100 >>> 0); //@line 1895
     break;
    }
   }
   $122 = ($3 | 0) / -2 | 0; //@line 1899
   $124 = (($122 | 0) < 0) << 31 >> 31; //@line 1901
   if (($108 | 0) > ($124 | 0) | ($108 | 0) == ($124 | 0) & $105 >>> 0 > $122 >>> 0) {
    HEAP32[(___errno_location() | 0) >> 2] = 34; //@line 1909
    $$1 = +($4 | 0) * 1.7976931348623157e+308 * 1.7976931348623157e+308; //@line 1913
    break;
   }
   $134 = $3 + -106 | 0; //@line 1916
   $136 = (($134 | 0) < 0) << 31 >> 31; //@line 1918
   if (($108 | 0) < ($136 | 0) | ($108 | 0) == ($136 | 0) & $105 >>> 0 < $134 >>> 0) {
    HEAP32[(___errno_location() | 0) >> 2] = 34; //@line 1926
    $$1 = +($4 | 0) * 2.2250738585072014e-308 * 2.2250738585072014e-308; //@line 1930
    break;
   }
   if (!$$0341461) {
    $$3348 = $$0345465; //@line 1935
   } else {
    if (($$0341461 | 0) < 9) {
     $148 = $6 + ($$0345465 << 2) | 0; //@line 1939
     $$3344501 = $$0341461; //@line 1941
     $150 = HEAP32[$148 >> 2] | 0; //@line 1941
     while (1) {
      $150 = $150 * 10 | 0; //@line 1943
      if (($$3344501 | 0) >= 8) {
       break;
      } else {
       $$3344501 = $$3344501 + 1 | 0; //@line 1947
      }
     }
     HEAP32[$148 >> 2] = $150; //@line 1952
    }
    $$3348 = $$0345465 + 1 | 0; //@line 1955
   }
   if (($$0401471 | 0) < 9) {
    if (($$0401471 | 0) <= ($105 | 0) & ($105 | 0) < 18) {
     if (($105 | 0) == 9) {
      $$1 = +($4 | 0) * +((HEAP32[$6 >> 2] | 0) >>> 0); //@line 1969
      break;
     }
     if (($105 | 0) < 9) {
      $$1 = +($4 | 0) * +((HEAP32[$6 >> 2] | 0) >>> 0) / +(HEAP32[2160 + (8 - $105 << 2) >> 2] | 0); //@line 1983
      break;
     }
     $172 = $2 + 27 + (Math_imul($105, -3) | 0) | 0; //@line 1988
     $$pre = HEAP32[$6 >> 2] | 0; //@line 1990
     if (($172 | 0) > 30 | ($$pre >>> $172 | 0) == 0) {
      $$1 = +($4 | 0) * +($$pre >>> 0) * +(HEAP32[2160 + ($105 + -10 << 2) >> 2] | 0); //@line 2003
      break;
     }
    }
   }
   $184 = ($105 | 0) % 9 | 0; //@line 2008
   if (!$184) {
    $$0380$ph = 0; //@line 2011
    $$1373$ph446 = $$3348; //@line 2011
    $$2352$ph447 = 0; //@line 2011
    $$2387$ph445 = $105; //@line 2011
   } else {
    $188 = ($105 | 0) > -1 ? $184 : $184 + 9 | 0; //@line 2015
    $191 = HEAP32[2160 + (8 - $188 << 2) >> 2] | 0; //@line 2018
    if (!$$3348) {
     $$0350$lcssa553 = 0; //@line 2021
     $$0372 = 0; //@line 2021
     $$0385$lcssa552 = $105; //@line 2021
    } else {
     $193 = 1e9 / ($191 | 0) | 0; //@line 2023
     $$0340494 = 0; //@line 2024
     $$0350492 = 0; //@line 2024
     $$0385491 = $105; //@line 2024
     $$4349493 = 0; //@line 2024
     do {
      $194 = $6 + ($$4349493 << 2) | 0; //@line 2026
      $195 = HEAP32[$194 >> 2] | 0; //@line 2027
      $198 = (($195 >>> 0) / ($191 >>> 0) | 0) + $$0340494 | 0; //@line 2030
      HEAP32[$194 >> 2] = $198; //@line 2031
      $$0340494 = Math_imul($193, ($195 >>> 0) % ($191 >>> 0) | 0) | 0; //@line 2032
      $or$cond418 = ($$4349493 | 0) == ($$0350492 | 0) & ($198 | 0) == 0; //@line 2035
      $$0385491 = $or$cond418 ? $$0385491 + -9 | 0 : $$0385491; //@line 2039
      $$0350492 = $or$cond418 ? $$0350492 + 1 & 127 : $$0350492; //@line 2040
      $$4349493 = $$4349493 + 1 | 0; //@line 2041
     } while (($$4349493 | 0) != ($$3348 | 0));
     if (!$$0340494) {
      $$0350$lcssa553 = $$0350492; //@line 2051
      $$0372 = $$3348; //@line 2051
      $$0385$lcssa552 = $$0385491; //@line 2051
     } else {
      HEAP32[$6 + ($$3348 << 2) >> 2] = $$0340494; //@line 2055
      $$0350$lcssa553 = $$0350492; //@line 2056
      $$0372 = $$3348 + 1 | 0; //@line 2056
      $$0385$lcssa552 = $$0385491; //@line 2056
     }
    }
    $$0380$ph = 0; //@line 2061
    $$1373$ph446 = $$0372; //@line 2061
    $$2352$ph447 = $$0350$lcssa553; //@line 2061
    $$2387$ph445 = 9 - $188 + $$0385$lcssa552 | 0; //@line 2061
   }
   L101 : while (1) {
    $212 = ($$2387$ph445 | 0) < 18; //@line 2064
    $213 = ($$2387$ph445 | 0) == 18; //@line 2065
    $214 = $6 + ($$2352$ph447 << 2) | 0; //@line 2066
    $$0380 = $$0380$ph; //@line 2067
    $$1373 = $$1373$ph446; //@line 2067
    while (1) {
     if (!$212) {
      if (!$213) {
       $$1381$ph = $$0380; //@line 2071
       $$4354$ph = $$2352$ph447; //@line 2071
       $$4389$ph443 = $$2387$ph445; //@line 2071
       $$6378$ph = $$1373; //@line 2071
       break L101;
      }
      if ((HEAP32[$214 >> 2] | 0) >>> 0 >= 9007199) {
       $$1381$ph = $$0380; //@line 2077
       $$4354$ph = $$2352$ph447; //@line 2077
       $$4389$ph443 = 18; //@line 2077
       $$6378$ph = $$1373; //@line 2077
       break L101;
      }
     }
     $$0334 = 0; //@line 2082
     $$2374 = $$1373; //@line 2082
     $$5$in = $$1373 + 127 | 0; //@line 2082
     while (1) {
      $$5 = $$5$in & 127; //@line 2084
      $218 = $6 + ($$5 << 2) | 0; //@line 2085
      $220 = _bitshift64Shl(HEAP32[$218 >> 2] | 0, 0, 29) | 0; //@line 2087
      $222 = _i64Add($220 | 0, tempRet0 | 0, $$0334 | 0, 0) | 0; //@line 2089
      $223 = tempRet0; //@line 2090
      if ($223 >>> 0 > 0 | ($223 | 0) == 0 & $222 >>> 0 > 1e9) {
       $229 = ___udivdi3($222 | 0, $223 | 0, 1e9, 0) | 0; //@line 2097
       $231 = ___uremdi3($222 | 0, $223 | 0, 1e9, 0) | 0; //@line 2099
       $$1335 = $229; //@line 2101
       $$sink419$off0 = $231; //@line 2101
      } else {
       $$1335 = 0; //@line 2103
       $$sink419$off0 = $222; //@line 2103
      }
      HEAP32[$218 >> 2] = $$sink419$off0; //@line 2105
      $236 = ($$5 | 0) == ($$2352$ph447 | 0); //@line 2109
      $$2374 = ($$sink419$off0 | 0) == 0 & ((($$5 | 0) != ($$2374 + 127 & 127 | 0) | $236) ^ 1) ? $$5 : $$2374; //@line 2114
      if ($236) {
       break;
      } else {
       $$0334 = $$1335; //@line 2119
       $$5$in = $$5 + -1 | 0; //@line 2119
      }
     }
     $$0380 = $$0380 + -29 | 0; //@line 2122
     if ($$1335 | 0) {
      break;
     } else {
      $$1373 = $$2374; //@line 2125
     }
    }
    $243 = $$2352$ph447 + 127 & 127; //@line 2132
    $246 = $$2374 + 127 & 127; //@line 2135
    $249 = $6 + (($$2374 + 126 & 127) << 2) | 0; //@line 2138
    if (($243 | 0) == ($$2374 | 0)) {
     HEAP32[$249 >> 2] = HEAP32[$249 >> 2] | HEAP32[$6 + ($246 << 2) >> 2]; //@line 2144
     $$4376 = $246; //@line 2145
    } else {
     $$4376 = $$2374; //@line 2147
    }
    HEAP32[$6 + ($243 << 2) >> 2] = $$1335; //@line 2150
    $$0380$ph = $$0380; //@line 2151
    $$1373$ph446 = $$4376; //@line 2151
    $$2352$ph447 = $243; //@line 2151
    $$2387$ph445 = $$2387$ph445 + 9 | 0; //@line 2151
   }
   L119 : while (1) {
    $289 = $$6378$ph + 1 & 127; //@line 2155
    $294 = $6 + (($$6378$ph + 127 & 127) << 2) | 0; //@line 2158
    $$1381$ph557 = $$1381$ph; //@line 2159
    $$4354$ph558 = $$4354$ph; //@line 2159
    $$4389$ph = $$4389$ph443; //@line 2159
    while (1) {
     $267 = ($$4389$ph | 0) == 18; //@line 2161
     $$423 = ($$4389$ph | 0) > 27 ? 9 : 1; //@line 2163
     $$1381 = $$1381$ph557; //@line 2164
     $$4354 = $$4354$ph558; //@line 2164
     while (1) {
      $$0336484 = 0; //@line 2166
      while (1) {
       $256 = $$0336484 + $$4354 & 127; //@line 2169
       if (($256 | 0) == ($$6378$ph | 0)) {
        $$1337 = 2; //@line 2172
        label = 88; //@line 2173
        break;
       }
       $259 = HEAP32[$6 + ($256 << 2) >> 2] | 0; //@line 2177
       $261 = HEAP32[2192 + ($$0336484 << 2) >> 2] | 0; //@line 2179
       if ($259 >>> 0 < $261 >>> 0) {
        $$1337 = 2; //@line 2182
        label = 88; //@line 2183
        break;
       }
       if ($259 >>> 0 > $261 >>> 0) {
        break;
       }
       $264 = $$0336484 + 1 | 0; //@line 2190
       if (($$0336484 | 0) < 1) {
        $$0336484 = $264; //@line 2193
       } else {
        $$1337 = $264; //@line 2195
        label = 88; //@line 2196
        break;
       }
      }
      if ((label | 0) == 88) {
       label = 0; //@line 2201
       if ($267 & ($$1337 | 0) == 2) {
        $$0365482 = 0.0; //@line 2205
        $$4483 = 0; //@line 2205
        $$9481 = $$6378$ph; //@line 2205
        break L119;
       }
      }
      $268 = $$423 + $$1381 | 0; //@line 2209
      if (($$4354 | 0) == ($$6378$ph | 0)) {
       $$1381 = $268; //@line 2212
       $$4354 = $$6378$ph; //@line 2212
      } else {
       break;
      }
     }
     $271 = (1 << $$423) + -1 | 0; //@line 2218
     $272 = 1e9 >>> $$423; //@line 2219
     $$0332488 = 0; //@line 2220
     $$5355486 = $$4354; //@line 2220
     $$5390485 = $$4389$ph; //@line 2220
     $$6487 = $$4354; //@line 2220
     do {
      $273 = $6 + ($$6487 << 2) | 0; //@line 2222
      $274 = HEAP32[$273 >> 2] | 0; //@line 2223
      $277 = ($274 >>> $$423) + $$0332488 | 0; //@line 2226
      HEAP32[$273 >> 2] = $277; //@line 2227
      $$0332488 = Math_imul($274 & $271, $272) | 0; //@line 2228
      $or$cond424 = ($$6487 | 0) == ($$5355486 | 0) & ($277 | 0) == 0; //@line 2231
      $$5390485 = $or$cond424 ? $$5390485 + -9 | 0 : $$5390485; //@line 2235
      $$5355486 = $or$cond424 ? $$5355486 + 1 & 127 : $$5355486; //@line 2236
      $$6487 = $$6487 + 1 & 127; //@line 2238
     } while (($$6487 | 0) != ($$6378$ph | 0));
     if (!$$0332488) {
      $$1381$ph557 = $268; //@line 2248
      $$4354$ph558 = $$5355486; //@line 2248
      $$4389$ph = $$5390485; //@line 2248
      continue;
     }
     if (($289 | 0) != ($$5355486 | 0)) {
      break;
     }
     HEAP32[$294 >> 2] = HEAP32[$294 >> 2] | 1; //@line 2257
     $$1381$ph557 = $268; //@line 2258
     $$4354$ph558 = $$5355486; //@line 2258
     $$4389$ph = $$5390485; //@line 2258
    }
    HEAP32[$6 + ($$6378$ph << 2) >> 2] = $$0332488; //@line 2261
    $$1381$ph = $268; //@line 2262
    $$4354$ph = $$5355486; //@line 2262
    $$4389$ph443 = $$5390485; //@line 2262
    $$6378$ph = $289; //@line 2262
   }
   while (1) {
    $299 = $$4483 + $$4354 & 127; //@line 2266
    $302 = $$9481 + 1 & 127; //@line 2269
    if (($299 | 0) == ($$9481 | 0)) {
     HEAP32[$6 + ($302 + -1 << 2) >> 2] = 0; //@line 2273
     $$10 = $302; //@line 2274
    } else {
     $$10 = $$9481; //@line 2276
    }
    $$0365482 = $$0365482 * 1.0e9 + +((HEAP32[$6 + ($299 << 2) >> 2] | 0) >>> 0); //@line 2282
    $$4483 = $$4483 + 1 | 0; //@line 2283
    if (($$4483 | 0) == 2) {
     break;
    } else {
     $$9481 = $$10; //@line 2288
    }
   }
   $311 = +($4 | 0); //@line 2291
   $312 = $$0365482 * $311; //@line 2292
   $313 = $$1381 + 53 | 0; //@line 2293
   $314 = $313 - $3 | 0; //@line 2294
   $315 = ($314 | 0) < ($2 | 0); //@line 2295
   $$0333 = $315 ? ($314 | 0) > 0 ? $314 : 0 : $2; //@line 2298
   if (($$0333 | 0) < 53) {
    $320 = +_copysignl(+_scalbn(1.0, 105 - $$0333 | 0), $312); //@line 2303
    $323 = +_fmodl($312, +_scalbn(1.0, 53 - $$0333 | 0)); //@line 2306
    $$0360 = $320; //@line 2309
    $$0361 = $323; //@line 2309
    $$1366 = $320 + ($312 - $323); //@line 2309
   } else {
    $$0360 = 0.0; //@line 2311
    $$0361 = 0.0; //@line 2311
    $$1366 = $312; //@line 2311
   }
   $327 = $$4354 + 2 & 127; //@line 2314
   if (($327 | 0) == ($$10 | 0)) {
    $$3364 = $$0361; //@line 2317
   } else {
    $330 = HEAP32[$6 + ($327 << 2) >> 2] | 0; //@line 2320
    do {
     if ($330 >>> 0 < 5e8) {
      if (!$330) {
       if (($$4354 + 3 & 127 | 0) == ($$10 | 0)) {
        $$1362 = $$0361; //@line 2330
        break;
       }
      }
      $$1362 = $311 * .25 + $$0361; //@line 2336
     } else {
      if (($330 | 0) != 5e8) {
       $$1362 = $311 * .75 + $$0361; //@line 2342
       break;
      }
      if (($$4354 + 3 & 127 | 0) == ($$10 | 0)) {
       $$1362 = $311 * .5 + $$0361; //@line 2351
       break;
      } else {
       $$1362 = $311 * .75 + $$0361; //@line 2356
       break;
      }
     }
    } while (0);
    if ((53 - $$0333 | 0) > 1) {
     if (+_fmodl($$1362, 1.0) != 0.0) {
      $$3364 = $$1362; //@line 2367
     } else {
      $$3364 = $$1362 + 1.0; //@line 2370
     }
    } else {
     $$3364 = $$1362; //@line 2373
    }
   }
   $354 = $$1366 + $$3364 - $$0360; //@line 2377
   do {
    if (($313 & 2147483647 | 0) > (-2 - $sum | 0)) {
     $359 = !(+Math_abs(+$354) >= 9007199254740992.0); //@line 2384
     $$3383 = $$1381 + (($359 ^ 1) & 1) | 0; //@line 2388
     $$2367 = $359 ? $354 : $354 * .5; //@line 2389
     if (($$3383 + 50 | 0) <= ($7 | 0)) {
      if (!($$3364 != 0.0 & ($315 & (($$0333 | 0) != ($314 | 0) | $359)))) {
       $$3368 = $$2367; //@line 2399
       $$4384 = $$3383; //@line 2399
       break;
      }
     }
     HEAP32[(___errno_location() | 0) >> 2] = 34; //@line 2404
     $$3368 = $$2367; //@line 2405
     $$4384 = $$3383; //@line 2405
    } else {
     $$3368 = $354; //@line 2407
     $$4384 = $$1381; //@line 2407
    }
   } while (0);
   $$1 = +_scalbnl($$3368, $$4384); //@line 2411
  }
 } while (0);
 STACKTOP = sp; //@line 2414
 return +$$1;
}
function _fmt_fp($0, $1, $2, $3, $4, $5) {
 $0 = $0 | 0;
 $1 = +$1;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 $5 = $5 | 0;
 var $$$3484 = 0, $$$3484700 = 0, $$$4502 = 0, $$$564 = 0.0, $$0 = 0, $$0463$lcssa = 0, $$0463587 = 0, $$0464597 = 0, $$0471 = 0.0, $$0479 = 0, $$0487644 = 0, $$0488655 = 0, $$0488657 = 0, $$0496$$9 = 0, $$0497656 = 0, $$0498 = 0, $$0509585 = 0.0, $$0511 = 0, $$0514639 = 0, $$0520 = 0, $$0521 = 0, $$0521$ = 0, $$0523 = 0, $$0527$in633 = 0, $$0530638 = 0, $$1465 = 0, $$1467 = 0.0, $$1469 = 0.0, $$1472 = 0.0, $$1480 = 0, $$1482$lcssa = 0, $$1482663 = 0, $$1489643 = 0, $$1499$lcssa = 0, $$1499662 = 0, $$1508586 = 0, $$1512$lcssa = 0, $$1512610 = 0, $$1515 = 0, $$1524 = 0, $$1528617 = 0, $$1531$lcssa = 0, $$1531632 = 0, $$1601 = 0, $$2 = 0, $$2473 = 0.0, $$2476 = 0, $$2483$ph = 0, $$2500 = 0, $$2513 = 0, $$2516621 = 0, $$2529 = 0, $$2532620 = 0, $$3 = 0.0, $$3477 = 0, $$3484$lcssa = 0, $$3484650 = 0, $$3501$lcssa = 0, $$3501649 = 0, $$3533616 = 0, $$4 = 0.0, $$4478$lcssa = 0, $$4478593 = 0, $$4492 = 0, $$4502 = 0, $$4518 = 0, $$5$lcssa = 0, $$540 = 0, $$540$ = 0, $$543 = 0.0, $$548 = 0, $$5486$lcssa = 0, $$5486626 = 0, $$5493600 = 0, $$550 = 0, $$5519$ph = 0, $$5605 = 0, $$561 = 0, $$6 = 0, $$6494592 = 0, $$7495604 = 0, $$7505 = 0, $$7505$ = 0, $$7505$ph = 0, $$8 = 0, $$9$ph = 0, $$lcssa675 = 0, $$pn = 0, $$pr = 0, $$pr566 = 0, $$pre$phi691Z2D = 0, $$pre$phi698Z2D = 0, $$pre693 = 0, $$sink = 0, $$sink547$lcssa = 0, $$sink547625 = 0, $$sink560 = 0, $10 = 0, $101 = 0, $104 = 0, $106 = 0, $11 = 0, $113 = 0, $116 = 0, $124 = 0, $125 = 0, $128 = 0, $130 = 0, $131 = 0, $132 = 0, $138 = 0, $140 = 0, $144 = 0, $149 = 0, $150 = 0, $151 = 0, $152 = 0, $154 = 0, $160 = 0, $161 = 0, $162 = 0, $174 = 0, $185 = 0, $189 = 0, $190 = 0, $193 = 0, $198 = 0, $199 = 0, $201 = 0, $209 = 0, $212 = 0, $213 = 0, $215 = 0, $217 = 0, $218 = 0, $221 = 0, $225 = 0, $230 = 0, $233 = 0, $236 = 0, $238 = 0, $240 = 0, $242 = 0, $247 = 0, $248 = 0, $251 = 0, $253 = 0, $256 = 0, $259 = 0, $267 = 0, $27 = 0, $270 = 0, $275 = 0, $284 = 0, $285 = 0, $289 = 0, $292 = 0, $294 = 0, $296 = 0, $300 = 0, $303 = 0, $304 = 0, $308 = 0, $31 = 0, $318 = 0, $323 = 0, $326 = 0, $327 = 0, $328 = 0, $330 = 0, $335 = 0, $347 = 0, $35 = 0.0, $351 = 0, $356 = 0, $36 = 0, $363 = 0, $364 = 0, $365 = 0, $366 = 0, $367 = 0, $369 = 0, $373 = 0, $375 = 0, $378 = 0, $381 = 0, $39 = 0, $41 = 0, $44 = 0, $46 = 0, $6 = 0, $60 = 0, $63 = 0, $66 = 0, $68 = 0, $7 = 0, $76 = 0, $77 = 0, $79 = 0, $8 = 0, $80 = 0, $86 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 4783
 STACKTOP = STACKTOP + 560 | 0; //@line 4784
 $6 = sp + 8 | 0; //@line 4785
 $7 = sp; //@line 4786
 $8 = sp + 524 | 0; //@line 4787
 $9 = $8; //@line 4788
 $10 = sp + 512 | 0; //@line 4789
 HEAP32[$7 >> 2] = 0; //@line 4790
 $11 = $10 + 12 | 0; //@line 4791
 ___DOUBLE_BITS_677($1) | 0; //@line 4792
 if ((tempRet0 | 0) < 0) {
  $$0471 = -$1; //@line 4797
  $$0520 = 1; //@line 4797
  $$0521 = 4506; //@line 4797
 } else {
  $$0471 = $1; //@line 4808
  $$0520 = ($4 & 2049 | 0) != 0 & 1; //@line 4808
  $$0521 = ($4 & 2048 | 0) == 0 ? ($4 & 1 | 0) == 0 ? 4507 : 4512 : 4509; //@line 4808
 }
 ___DOUBLE_BITS_677($$0471) | 0; //@line 4810
 do {
  if (0 == 0 & (tempRet0 & 2146435072 | 0) == 2146435072) {
   $27 = ($5 & 32 | 0) != 0; //@line 4819
   $31 = $$0520 + 3 | 0; //@line 4824
   _pad_676($0, 32, $2, $31, $4 & -65537); //@line 4826
   _out_670($0, $$0521, $$0520); //@line 4827
   _out_670($0, $$0471 != $$0471 | 0.0 != 0.0 ? $27 ? 4533 : 4537 : $27 ? 4525 : 4529, 3); //@line 4828
   _pad_676($0, 32, $2, $31, $4 ^ 8192); //@line 4830
   $$sink560 = $31; //@line 4831
  } else {
   $35 = +_frexpl($$0471, $7) * 2.0; //@line 4834
   $36 = $35 != 0.0; //@line 4835
   if ($36) {
    HEAP32[$7 >> 2] = (HEAP32[$7 >> 2] | 0) + -1; //@line 4839
   }
   $39 = $5 | 32; //@line 4841
   if (($39 | 0) == 97) {
    $41 = $5 & 32; //@line 4844
    $$0521$ = ($41 | 0) == 0 ? $$0521 : $$0521 + 9 | 0; //@line 4847
    $44 = $$0520 | 2; //@line 4848
    $46 = 12 - $3 | 0; //@line 4850
    do {
     if ($3 >>> 0 > 11 | ($46 | 0) == 0) {
      $$1472 = $35; //@line 4855
     } else {
      $$0509585 = 8.0; //@line 4857
      $$1508586 = $46; //@line 4857
      do {
       $$1508586 = $$1508586 + -1 | 0; //@line 4859
       $$0509585 = $$0509585 * 16.0; //@line 4860
      } while (($$1508586 | 0) != 0);
      if ((HEAP8[$$0521$ >> 0] | 0) == 45) {
       $$1472 = -($$0509585 + (-$35 - $$0509585)); //@line 4875
       break;
      } else {
       $$1472 = $35 + $$0509585 - $$0509585; //@line 4880
       break;
      }
     }
    } while (0);
    $60 = HEAP32[$7 >> 2] | 0; //@line 4885
    $63 = ($60 | 0) < 0 ? 0 - $60 | 0 : $60; //@line 4888
    $66 = _fmt_u($63, (($63 | 0) < 0) << 31 >> 31, $11) | 0; //@line 4891
    if (($66 | 0) == ($11 | 0)) {
     $68 = $10 + 11 | 0; //@line 4894
     HEAP8[$68 >> 0] = 48; //@line 4895
     $$0511 = $68; //@line 4896
    } else {
     $$0511 = $66; //@line 4898
    }
    HEAP8[$$0511 + -1 >> 0] = ($60 >> 31 & 2) + 43; //@line 4905
    $76 = $$0511 + -2 | 0; //@line 4908
    HEAP8[$76 >> 0] = $5 + 15; //@line 4909
    $77 = ($3 | 0) < 1; //@line 4910
    $79 = ($4 & 8 | 0) == 0; //@line 4912
    $$0523 = $8; //@line 4913
    $$2473 = $$1472; //@line 4913
    while (1) {
     $80 = ~~$$2473; //@line 4915
     $86 = $$0523 + 1 | 0; //@line 4921
     HEAP8[$$0523 >> 0] = $41 | HEAPU8[4541 + $80 >> 0]; //@line 4922
     $$2473 = ($$2473 - +($80 | 0)) * 16.0; //@line 4925
     if (($86 - $9 | 0) == 1) {
      if ($79 & ($77 & $$2473 == 0.0)) {
       $$1524 = $86; //@line 4934
      } else {
       HEAP8[$86 >> 0] = 46; //@line 4937
       $$1524 = $$0523 + 2 | 0; //@line 4938
      }
     } else {
      $$1524 = $86; //@line 4941
     }
     if (!($$2473 != 0.0)) {
      break;
     } else {
      $$0523 = $$1524; //@line 4945
     }
    }
    $$pre693 = $$1524; //@line 4951
    if (!$3) {
     label = 24; //@line 4953
    } else {
     if ((-2 - $9 + $$pre693 | 0) < ($3 | 0)) {
      $$pre$phi691Z2D = $$pre693 - $9 | 0; //@line 4961
      $$sink = $3 + 2 | 0; //@line 4961
     } else {
      label = 24; //@line 4963
     }
    }
    if ((label | 0) == 24) {
     $101 = $$pre693 - $9 | 0; //@line 4967
     $$pre$phi691Z2D = $101; //@line 4968
     $$sink = $101; //@line 4968
    }
    $104 = $11 - $76 | 0; //@line 4972
    $106 = $104 + $44 + $$sink | 0; //@line 4974
    _pad_676($0, 32, $2, $106, $4); //@line 4975
    _out_670($0, $$0521$, $44); //@line 4976
    _pad_676($0, 48, $2, $106, $4 ^ 65536); //@line 4978
    _out_670($0, $8, $$pre$phi691Z2D); //@line 4979
    _pad_676($0, 48, $$sink - $$pre$phi691Z2D | 0, 0, 0); //@line 4981
    _out_670($0, $76, $104); //@line 4982
    _pad_676($0, 32, $2, $106, $4 ^ 8192); //@line 4984
    $$sink560 = $106; //@line 4985
    break;
   }
   $$540 = ($3 | 0) < 0 ? 6 : $3; //@line 4989
   if ($36) {
    $113 = (HEAP32[$7 >> 2] | 0) + -28 | 0; //@line 4993
    HEAP32[$7 >> 2] = $113; //@line 4994
    $$3 = $35 * 268435456.0; //@line 4995
    $$pr = $113; //@line 4995
   } else {
    $$3 = $35; //@line 4998
    $$pr = HEAP32[$7 >> 2] | 0; //@line 4998
   }
   $$561 = ($$pr | 0) < 0 ? $6 : $6 + 288 | 0; //@line 5002
   $$0498 = $$561; //@line 5003
   $$4 = $$3; //@line 5003
   do {
    $116 = ~~$$4 >>> 0; //@line 5005
    HEAP32[$$0498 >> 2] = $116; //@line 5006
    $$0498 = $$0498 + 4 | 0; //@line 5007
    $$4 = ($$4 - +($116 >>> 0)) * 1.0e9; //@line 5010
   } while ($$4 != 0.0);
   if (($$pr | 0) > 0) {
    $$1482663 = $$561; //@line 5020
    $$1499662 = $$0498; //@line 5020
    $124 = $$pr; //@line 5020
    while (1) {
     $125 = ($124 | 0) < 29 ? $124 : 29; //@line 5023
     $$0488655 = $$1499662 + -4 | 0; //@line 5024
     if ($$0488655 >>> 0 < $$1482663 >>> 0) {
      $$2483$ph = $$1482663; //@line 5027
     } else {
      $$0488657 = $$0488655; //@line 5029
      $$0497656 = 0; //@line 5029
      do {
       $128 = _bitshift64Shl(HEAP32[$$0488657 >> 2] | 0, 0, $125 | 0) | 0; //@line 5032
       $130 = _i64Add($128 | 0, tempRet0 | 0, $$0497656 | 0, 0) | 0; //@line 5034
       $131 = tempRet0; //@line 5035
       $132 = ___uremdi3($130 | 0, $131 | 0, 1e9, 0) | 0; //@line 5036
       HEAP32[$$0488657 >> 2] = $132; //@line 5038
       $$0497656 = ___udivdi3($130 | 0, $131 | 0, 1e9, 0) | 0; //@line 5039
       $$0488657 = $$0488657 + -4 | 0; //@line 5041
      } while ($$0488657 >>> 0 >= $$1482663 >>> 0);
      if (!$$0497656) {
       $$2483$ph = $$1482663; //@line 5051
      } else {
       $138 = $$1482663 + -4 | 0; //@line 5053
       HEAP32[$138 >> 2] = $$0497656; //@line 5054
       $$2483$ph = $138; //@line 5055
      }
     }
     $$2500 = $$1499662; //@line 5058
     while (1) {
      if ($$2500 >>> 0 <= $$2483$ph >>> 0) {
       break;
      }
      $140 = $$2500 + -4 | 0; //@line 5064
      if (!(HEAP32[$140 >> 2] | 0)) {
       $$2500 = $140; //@line 5068
      } else {
       break;
      }
     }
     $144 = (HEAP32[$7 >> 2] | 0) - $125 | 0; //@line 5074
     HEAP32[$7 >> 2] = $144; //@line 5075
     if (($144 | 0) > 0) {
      $$1482663 = $$2483$ph; //@line 5078
      $$1499662 = $$2500; //@line 5078
      $124 = $144; //@line 5078
     } else {
      $$1482$lcssa = $$2483$ph; //@line 5080
      $$1499$lcssa = $$2500; //@line 5080
      $$pr566 = $144; //@line 5080
      break;
     }
    }
   } else {
    $$1482$lcssa = $$561; //@line 5085
    $$1499$lcssa = $$0498; //@line 5085
    $$pr566 = $$pr; //@line 5085
   }
   if (($$pr566 | 0) < 0) {
    $149 = (($$540 + 25 | 0) / 9 | 0) + 1 | 0; //@line 5091
    $150 = ($39 | 0) == 102; //@line 5092
    $$3484650 = $$1482$lcssa; //@line 5093
    $$3501649 = $$1499$lcssa; //@line 5093
    $152 = $$pr566; //@line 5093
    while (1) {
     $151 = 0 - $152 | 0; //@line 5095
     $154 = ($151 | 0) < 9 ? $151 : 9; //@line 5097
     if ($$3484650 >>> 0 < $$3501649 >>> 0) {
      $160 = (1 << $154) + -1 | 0; //@line 5101
      $161 = 1e9 >>> $154; //@line 5102
      $$0487644 = 0; //@line 5103
      $$1489643 = $$3484650; //@line 5103
      do {
       $162 = HEAP32[$$1489643 >> 2] | 0; //@line 5105
       HEAP32[$$1489643 >> 2] = ($162 >>> $154) + $$0487644; //@line 5109
       $$0487644 = Math_imul($162 & $160, $161) | 0; //@line 5110
       $$1489643 = $$1489643 + 4 | 0; //@line 5111
      } while ($$1489643 >>> 0 < $$3501649 >>> 0);
      $$$3484 = (HEAP32[$$3484650 >> 2] | 0) == 0 ? $$3484650 + 4 | 0 : $$3484650; //@line 5122
      if (!$$0487644) {
       $$$3484700 = $$$3484; //@line 5125
       $$4502 = $$3501649; //@line 5125
      } else {
       HEAP32[$$3501649 >> 2] = $$0487644; //@line 5128
       $$$3484700 = $$$3484; //@line 5129
       $$4502 = $$3501649 + 4 | 0; //@line 5129
      }
     } else {
      $$$3484700 = (HEAP32[$$3484650 >> 2] | 0) == 0 ? $$3484650 + 4 | 0 : $$3484650; //@line 5136
      $$4502 = $$3501649; //@line 5136
     }
     $174 = $150 ? $$561 : $$$3484700; //@line 5138
     $$$4502 = ($$4502 - $174 >> 2 | 0) > ($149 | 0) ? $174 + ($149 << 2) | 0 : $$4502; //@line 5145
     $152 = (HEAP32[$7 >> 2] | 0) + $154 | 0; //@line 5147
     HEAP32[$7 >> 2] = $152; //@line 5148
     if (($152 | 0) >= 0) {
      $$3484$lcssa = $$$3484700; //@line 5153
      $$3501$lcssa = $$$4502; //@line 5153
      break;
     } else {
      $$3484650 = $$$3484700; //@line 5151
      $$3501649 = $$$4502; //@line 5151
     }
    }
   } else {
    $$3484$lcssa = $$1482$lcssa; //@line 5158
    $$3501$lcssa = $$1499$lcssa; //@line 5158
   }
   $185 = $$561; //@line 5161
   if ($$3484$lcssa >>> 0 < $$3501$lcssa >>> 0) {
    $189 = ($185 - $$3484$lcssa >> 2) * 9 | 0; //@line 5166
    $190 = HEAP32[$$3484$lcssa >> 2] | 0; //@line 5167
    if ($190 >>> 0 < 10) {
     $$1515 = $189; //@line 5170
    } else {
     $$0514639 = $189; //@line 5172
     $$0530638 = 10; //@line 5172
     while (1) {
      $$0530638 = $$0530638 * 10 | 0; //@line 5174
      $193 = $$0514639 + 1 | 0; //@line 5175
      if ($190 >>> 0 < $$0530638 >>> 0) {
       $$1515 = $193; //@line 5178
       break;
      } else {
       $$0514639 = $193; //@line 5181
      }
     }
    }
   } else {
    $$1515 = 0; //@line 5186
   }
   $198 = ($39 | 0) == 103; //@line 5191
   $199 = ($$540 | 0) != 0; //@line 5192
   $201 = $$540 - (($39 | 0) != 102 ? $$1515 : 0) + (($199 & $198) << 31 >> 31) | 0; //@line 5195
   if (($201 | 0) < ((($$3501$lcssa - $185 >> 2) * 9 | 0) + -9 | 0)) {
    $209 = $201 + 9216 | 0; //@line 5204
    $212 = $$561 + 4 + ((($209 | 0) / 9 | 0) + -1024 << 2) | 0; //@line 5207
    $213 = ($209 | 0) % 9 | 0; //@line 5208
    if (($213 | 0) < 8) {
     $$0527$in633 = $213; //@line 5211
     $$1531632 = 10; //@line 5211
     while (1) {
      $215 = $$1531632 * 10 | 0; //@line 5214
      if (($$0527$in633 | 0) < 7) {
       $$0527$in633 = $$0527$in633 + 1 | 0; //@line 5217
       $$1531632 = $215; //@line 5217
      } else {
       $$1531$lcssa = $215; //@line 5219
       break;
      }
     }
    } else {
     $$1531$lcssa = 10; //@line 5224
    }
    $217 = HEAP32[$212 >> 2] | 0; //@line 5226
    $218 = ($217 >>> 0) % ($$1531$lcssa >>> 0) | 0; //@line 5227
    $221 = ($212 + 4 | 0) == ($$3501$lcssa | 0); //@line 5230
    if ($221 & ($218 | 0) == 0) {
     $$4492 = $212; //@line 5233
     $$4518 = $$1515; //@line 5233
     $$8 = $$3484$lcssa; //@line 5233
    } else {
     $$543 = ((($217 >>> 0) / ($$1531$lcssa >>> 0) | 0) & 1 | 0) == 0 ? 9007199254740992.0 : 9007199254740994.0; //@line 5238
     $225 = ($$1531$lcssa | 0) / 2 | 0; //@line 5239
     $$$564 = $218 >>> 0 < $225 >>> 0 ? .5 : $221 & ($218 | 0) == ($225 | 0) ? 1.0 : 1.5; //@line 5244
     if (!$$0520) {
      $$1467 = $$$564; //@line 5247
      $$1469 = $$543; //@line 5247
     } else {
      $230 = (HEAP8[$$0521 >> 0] | 0) == 45; //@line 5250
      $$1467 = $230 ? -$$$564 : $$$564; //@line 5255
      $$1469 = $230 ? -$$543 : $$543; //@line 5255
     }
     $233 = $217 - $218 | 0; //@line 5257
     HEAP32[$212 >> 2] = $233; //@line 5258
     if ($$1469 + $$1467 != $$1469) {
      $236 = $233 + $$1531$lcssa | 0; //@line 5262
      HEAP32[$212 >> 2] = $236; //@line 5263
      if ($236 >>> 0 > 999999999) {
       $$5486626 = $$3484$lcssa; //@line 5266
       $$sink547625 = $212; //@line 5266
       while (1) {
        $238 = $$sink547625 + -4 | 0; //@line 5268
        HEAP32[$$sink547625 >> 2] = 0; //@line 5269
        if ($238 >>> 0 < $$5486626 >>> 0) {
         $240 = $$5486626 + -4 | 0; //@line 5272
         HEAP32[$240 >> 2] = 0; //@line 5273
         $$6 = $240; //@line 5274
        } else {
         $$6 = $$5486626; //@line 5276
        }
        $242 = (HEAP32[$238 >> 2] | 0) + 1 | 0; //@line 5279
        HEAP32[$238 >> 2] = $242; //@line 5280
        if ($242 >>> 0 > 999999999) {
         $$5486626 = $$6; //@line 5283
         $$sink547625 = $238; //@line 5283
        } else {
         $$5486$lcssa = $$6; //@line 5285
         $$sink547$lcssa = $238; //@line 5285
         break;
        }
       }
      } else {
       $$5486$lcssa = $$3484$lcssa; //@line 5290
       $$sink547$lcssa = $212; //@line 5290
      }
      $247 = ($185 - $$5486$lcssa >> 2) * 9 | 0; //@line 5295
      $248 = HEAP32[$$5486$lcssa >> 2] | 0; //@line 5296
      if ($248 >>> 0 < 10) {
       $$4492 = $$sink547$lcssa; //@line 5299
       $$4518 = $247; //@line 5299
       $$8 = $$5486$lcssa; //@line 5299
      } else {
       $$2516621 = $247; //@line 5301
       $$2532620 = 10; //@line 5301
       while (1) {
        $$2532620 = $$2532620 * 10 | 0; //@line 5303
        $251 = $$2516621 + 1 | 0; //@line 5304
        if ($248 >>> 0 < $$2532620 >>> 0) {
         $$4492 = $$sink547$lcssa; //@line 5307
         $$4518 = $251; //@line 5307
         $$8 = $$5486$lcssa; //@line 5307
         break;
        } else {
         $$2516621 = $251; //@line 5310
        }
       }
      }
     } else {
      $$4492 = $212; //@line 5315
      $$4518 = $$1515; //@line 5315
      $$8 = $$3484$lcssa; //@line 5315
     }
    }
    $253 = $$4492 + 4 | 0; //@line 5318
    $$5519$ph = $$4518; //@line 5321
    $$7505$ph = $$3501$lcssa >>> 0 > $253 >>> 0 ? $253 : $$3501$lcssa; //@line 5321
    $$9$ph = $$8; //@line 5321
   } else {
    $$5519$ph = $$1515; //@line 5323
    $$7505$ph = $$3501$lcssa; //@line 5323
    $$9$ph = $$3484$lcssa; //@line 5323
   }
   $$7505 = $$7505$ph; //@line 5325
   while (1) {
    if ($$7505 >>> 0 <= $$9$ph >>> 0) {
     $$lcssa675 = 0; //@line 5329
     break;
    }
    $256 = $$7505 + -4 | 0; //@line 5332
    if (!(HEAP32[$256 >> 2] | 0)) {
     $$7505 = $256; //@line 5336
    } else {
     $$lcssa675 = 1; //@line 5338
     break;
    }
   }
   $259 = 0 - $$5519$ph | 0; //@line 5342
   do {
    if ($198) {
     $$540$ = $$540 + (($199 ^ 1) & 1) | 0; //@line 5347
     if (($$540$ | 0) > ($$5519$ph | 0) & ($$5519$ph | 0) > -5) {
      $$0479 = $5 + -1 | 0; //@line 5355
      $$2476 = $$540$ + -1 - $$5519$ph | 0; //@line 5355
     } else {
      $$0479 = $5 + -2 | 0; //@line 5359
      $$2476 = $$540$ + -1 | 0; //@line 5359
     }
     $267 = $4 & 8; //@line 5361
     if (!$267) {
      if ($$lcssa675) {
       $270 = HEAP32[$$7505 + -4 >> 2] | 0; //@line 5366
       if (!$270) {
        $$2529 = 9; //@line 5369
       } else {
        if (!(($270 >>> 0) % 10 | 0)) {
         $$1528617 = 0; //@line 5374
         $$3533616 = 10; //@line 5374
         while (1) {
          $$3533616 = $$3533616 * 10 | 0; //@line 5376
          $275 = $$1528617 + 1 | 0; //@line 5377
          if (($270 >>> 0) % ($$3533616 >>> 0) | 0 | 0) {
           $$2529 = $275; //@line 5383
           break;
          } else {
           $$1528617 = $275; //@line 5381
          }
         }
        } else {
         $$2529 = 0; //@line 5388
        }
       }
      } else {
       $$2529 = 9; //@line 5392
      }
      $284 = (($$7505 - $185 >> 2) * 9 | 0) + -9 | 0; //@line 5400
      if (($$0479 | 32 | 0) == 102) {
       $285 = $284 - $$2529 | 0; //@line 5402
       $$548 = ($285 | 0) > 0 ? $285 : 0; //@line 5404
       $$1480 = $$0479; //@line 5407
       $$3477 = ($$2476 | 0) < ($$548 | 0) ? $$2476 : $$548; //@line 5407
       $$pre$phi698Z2D = 0; //@line 5407
       break;
      } else {
       $289 = $284 + $$5519$ph - $$2529 | 0; //@line 5411
       $$550 = ($289 | 0) > 0 ? $289 : 0; //@line 5413
       $$1480 = $$0479; //@line 5416
       $$3477 = ($$2476 | 0) < ($$550 | 0) ? $$2476 : $$550; //@line 5416
       $$pre$phi698Z2D = 0; //@line 5416
       break;
      }
     } else {
      $$1480 = $$0479; //@line 5420
      $$3477 = $$2476; //@line 5420
      $$pre$phi698Z2D = $267; //@line 5420
     }
    } else {
     $$1480 = $5; //@line 5424
     $$3477 = $$540; //@line 5424
     $$pre$phi698Z2D = $4 & 8; //@line 5424
    }
   } while (0);
   $292 = $$3477 | $$pre$phi698Z2D; //@line 5427
   $294 = ($292 | 0) != 0 & 1; //@line 5429
   $296 = ($$1480 | 32 | 0) == 102; //@line 5431
   if ($296) {
    $$2513 = 0; //@line 5435
    $$pn = ($$5519$ph | 0) > 0 ? $$5519$ph : 0; //@line 5435
   } else {
    $300 = ($$5519$ph | 0) < 0 ? $259 : $$5519$ph; //@line 5438
    $303 = _fmt_u($300, (($300 | 0) < 0) << 31 >> 31, $11) | 0; //@line 5441
    $304 = $11; //@line 5442
    if (($304 - $303 | 0) < 2) {
     $$1512610 = $303; //@line 5447
     while (1) {
      $308 = $$1512610 + -1 | 0; //@line 5449
      HEAP8[$308 >> 0] = 48; //@line 5450
      if (($304 - $308 | 0) < 2) {
       $$1512610 = $308; //@line 5455
      } else {
       $$1512$lcssa = $308; //@line 5457
       break;
      }
     }
    } else {
     $$1512$lcssa = $303; //@line 5462
    }
    HEAP8[$$1512$lcssa + -1 >> 0] = ($$5519$ph >> 31 & 2) + 43; //@line 5469
    $318 = $$1512$lcssa + -2 | 0; //@line 5471
    HEAP8[$318 >> 0] = $$1480; //@line 5472
    $$2513 = $318; //@line 5475
    $$pn = $304 - $318 | 0; //@line 5475
   }
   $323 = $$0520 + 1 + $$3477 + $294 + $$pn | 0; //@line 5480
   _pad_676($0, 32, $2, $323, $4); //@line 5481
   _out_670($0, $$0521, $$0520); //@line 5482
   _pad_676($0, 48, $2, $323, $4 ^ 65536); //@line 5484
   if ($296) {
    $$0496$$9 = $$9$ph >>> 0 > $$561 >>> 0 ? $$561 : $$9$ph; //@line 5487
    $326 = $8 + 9 | 0; //@line 5488
    $327 = $326; //@line 5489
    $328 = $8 + 8 | 0; //@line 5490
    $$5493600 = $$0496$$9; //@line 5491
    do {
     $330 = _fmt_u(HEAP32[$$5493600 >> 2] | 0, 0, $326) | 0; //@line 5494
     if (($$5493600 | 0) == ($$0496$$9 | 0)) {
      if (($330 | 0) == ($326 | 0)) {
       HEAP8[$328 >> 0] = 48; //@line 5499
       $$1465 = $328; //@line 5500
      } else {
       $$1465 = $330; //@line 5502
      }
     } else {
      if ($330 >>> 0 > $8 >>> 0) {
       _memset($8 | 0, 48, $330 - $9 | 0) | 0; //@line 5509
       $$0464597 = $330; //@line 5510
       while (1) {
        $335 = $$0464597 + -1 | 0; //@line 5512
        if ($335 >>> 0 > $8 >>> 0) {
         $$0464597 = $335; //@line 5515
        } else {
         $$1465 = $335; //@line 5517
         break;
        }
       }
      } else {
       $$1465 = $330; //@line 5522
      }
     }
     _out_670($0, $$1465, $327 - $$1465 | 0); //@line 5527
     $$5493600 = $$5493600 + 4 | 0; //@line 5528
    } while ($$5493600 >>> 0 <= $$561 >>> 0);
    if ($292 | 0) {
     _out_670($0, 4557, 1); //@line 5538
    }
    if ($$5493600 >>> 0 < $$7505 >>> 0 & ($$3477 | 0) > 0) {
     $$4478593 = $$3477; //@line 5544
     $$6494592 = $$5493600; //@line 5544
     while (1) {
      $347 = _fmt_u(HEAP32[$$6494592 >> 2] | 0, 0, $326) | 0; //@line 5547
      if ($347 >>> 0 > $8 >>> 0) {
       _memset($8 | 0, 48, $347 - $9 | 0) | 0; //@line 5552
       $$0463587 = $347; //@line 5553
       while (1) {
        $351 = $$0463587 + -1 | 0; //@line 5555
        if ($351 >>> 0 > $8 >>> 0) {
         $$0463587 = $351; //@line 5558
        } else {
         $$0463$lcssa = $351; //@line 5560
         break;
        }
       }
      } else {
       $$0463$lcssa = $347; //@line 5565
      }
      _out_670($0, $$0463$lcssa, ($$4478593 | 0) < 9 ? $$4478593 : 9); //@line 5569
      $$6494592 = $$6494592 + 4 | 0; //@line 5570
      $356 = $$4478593 + -9 | 0; //@line 5571
      if (!($$6494592 >>> 0 < $$7505 >>> 0 & ($$4478593 | 0) > 9)) {
       $$4478$lcssa = $356; //@line 5578
       break;
      } else {
       $$4478593 = $356; //@line 5576
      }
     }
    } else {
     $$4478$lcssa = $$3477; //@line 5583
    }
    _pad_676($0, 48, $$4478$lcssa + 9 | 0, 9, 0); //@line 5586
   } else {
    $$7505$ = $$lcssa675 ? $$7505 : $$9$ph + 4 | 0; //@line 5589
    if (($$3477 | 0) > -1) {
     $363 = $8 + 9 | 0; //@line 5592
     $364 = ($$pre$phi698Z2D | 0) == 0; //@line 5593
     $365 = $363; //@line 5594
     $366 = 0 - $9 | 0; //@line 5595
     $367 = $8 + 8 | 0; //@line 5596
     $$5605 = $$3477; //@line 5597
     $$7495604 = $$9$ph; //@line 5597
     while (1) {
      $369 = _fmt_u(HEAP32[$$7495604 >> 2] | 0, 0, $363) | 0; //@line 5600
      if (($369 | 0) == ($363 | 0)) {
       HEAP8[$367 >> 0] = 48; //@line 5603
       $$0 = $367; //@line 5604
      } else {
       $$0 = $369; //@line 5606
      }
      do {
       if (($$7495604 | 0) == ($$9$ph | 0)) {
        $375 = $$0 + 1 | 0; //@line 5611
        _out_670($0, $$0, 1); //@line 5612
        if ($364 & ($$5605 | 0) < 1) {
         $$2 = $375; //@line 5616
         break;
        }
        _out_670($0, 4557, 1); //@line 5619
        $$2 = $375; //@line 5620
       } else {
        if ($$0 >>> 0 <= $8 >>> 0) {
         $$2 = $$0; //@line 5624
         break;
        }
        _memset($8 | 0, 48, $$0 + $366 | 0) | 0; //@line 5629
        $$1601 = $$0; //@line 5630
        while (1) {
         $373 = $$1601 + -1 | 0; //@line 5632
         if ($373 >>> 0 > $8 >>> 0) {
          $$1601 = $373; //@line 5635
         } else {
          $$2 = $373; //@line 5637
          break;
         }
        }
       }
      } while (0);
      $378 = $365 - $$2 | 0; //@line 5644
      _out_670($0, $$2, ($$5605 | 0) > ($378 | 0) ? $378 : $$5605); //@line 5647
      $381 = $$5605 - $378 | 0; //@line 5648
      $$7495604 = $$7495604 + 4 | 0; //@line 5649
      if (!($$7495604 >>> 0 < $$7505$ >>> 0 & ($381 | 0) > -1)) {
       $$5$lcssa = $381; //@line 5656
       break;
      } else {
       $$5605 = $381; //@line 5654
      }
     }
    } else {
     $$5$lcssa = $$3477; //@line 5661
    }
    _pad_676($0, 48, $$5$lcssa + 18 | 0, 18, 0); //@line 5664
    _out_670($0, $$2513, $11 - $$2513 | 0); //@line 5668
   }
   _pad_676($0, 32, $2, $323, $4 ^ 8192); //@line 5671
   $$sink560 = $323; //@line 5672
  }
 } while (0);
 STACKTOP = sp; //@line 5677
 return (($$sink560 | 0) < ($2 | 0) ? $2 : $$sink560) | 0; //@line 5677
}
function _printf_core($0, $1, $2, $3, $4) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 var $$$5 = 0, $$0 = 0, $$0228 = 0, $$0229316 = 0, $$0232 = 0, $$0235 = 0, $$0237 = 0, $$0240$lcssa = 0, $$0240$lcssa356 = 0, $$0240315 = 0, $$0243 = 0, $$0247 = 0, $$0249$lcssa = 0, $$0249303 = 0, $$0252 = 0, $$0253 = 0, $$0254 = 0, $$0259 = 0, $$0262$lcssa = 0, $$0262309 = 0, $$0269 = 0, $$1 = 0, $$1230327 = 0, $$1233 = 0, $$1236 = 0, $$1238 = 0, $$1241326 = 0, $$1244314 = 0, $$1248 = 0, $$1255 = 0, $$1260 = 0, $$1263 = 0, $$1263$ = 0, $$1270 = 0, $$2 = 0, $$2234 = 0, $$2239 = 0, $$2242$lcssa = 0, $$2242302 = 0, $$2245 = 0, $$2251 = 0, $$2256 = 0, $$2261 = 0, $$2271 = 0, $$3265 = 0, $$3272 = 0, $$3300 = 0, $$4258354 = 0, $$4266 = 0, $$5 = 0, $$6268 = 0, $$lcssa291 = 0, $$lcssa292 = 0, $$pre342 = 0, $$pre345 = 0, $$pre348 = 0, $$sink = 0, $10 = 0, $105 = 0, $106 = 0, $109 = 0, $11 = 0, $112 = 0, $115 = 0, $12 = 0, $125 = 0, $129 = 0, $13 = 0, $14 = 0, $140 = 0, $144 = 0, $151 = 0, $152 = 0, $154 = 0, $156 = 0, $158 = 0, $167 = 0, $168 = 0, $173 = 0, $176 = 0, $181 = 0, $182 = 0, $187 = 0, $189 = 0, $196 = 0, $197 = 0, $20 = 0, $208 = 0, $21 = 0, $220 = 0, $227 = 0, $229 = 0, $23 = 0, $232 = 0, $234 = 0, $24 = 0, $242 = 0, $244 = 0, $247 = 0, $248 = 0, $25 = 0, $252 = 0, $256 = 0, $258 = 0, $261 = 0, $263 = 0, $264 = 0, $265 = 0, $27 = 0, $275 = 0, $276 = 0, $281 = 0, $283 = 0, $284 = 0, $290 = 0, $30 = 0, $302 = 0, $305 = 0, $306 = 0, $318 = 0, $320 = 0, $325 = 0, $329 = 0, $331 = 0, $343 = 0, $345 = 0, $352 = 0, $356 = 0, $36 = 0, $363 = 0, $364 = 0, $365 = 0, $43 = 0, $5 = 0, $51 = 0, $52 = 0, $54 = 0, $6 = 0, $60 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0, $68 = 0, $7 = 0, $79 = 0, $8 = 0, $83 = 0, $9 = 0, $or$cond = 0, $or$cond278 = 0, $storemerge274 = 0, label = 0, sp = 0, $158$looptemp = 0;
 sp = STACKTOP; //@line 3355
 STACKTOP = STACKTOP + 64 | 0; //@line 3356
 $5 = sp + 16 | 0; //@line 3357
 $6 = sp; //@line 3358
 $7 = sp + 24 | 0; //@line 3359
 $8 = sp + 8 | 0; //@line 3360
 $9 = sp + 20 | 0; //@line 3361
 HEAP32[$5 >> 2] = $1; //@line 3362
 $10 = ($0 | 0) != 0; //@line 3363
 $11 = $7 + 40 | 0; //@line 3364
 $12 = $11; //@line 3365
 $13 = $7 + 39 | 0; //@line 3366
 $14 = $8 + 4 | 0; //@line 3367
 $$0243 = 0; //@line 3368
 $$0247 = 0; //@line 3368
 $$0269 = 0; //@line 3368
 L1 : while (1) {
  do {
   if (($$0247 | 0) > -1) {
    if (($$0243 | 0) > (2147483647 - $$0247 | 0)) {
     HEAP32[(___errno_location() | 0) >> 2] = 75; //@line 3377
     $$1248 = -1; //@line 3378
     break;
    } else {
     $$1248 = $$0243 + $$0247 | 0; //@line 3382
     break;
    }
   } else {
    $$1248 = $$0247; //@line 3386
   }
  } while (0);
  $20 = HEAP32[$5 >> 2] | 0; //@line 3389
  $21 = HEAP8[$20 >> 0] | 0; //@line 3390
  if (!($21 << 24 >> 24)) {
   label = 88; //@line 3393
   break;
  } else {
   $23 = $21; //@line 3396
   $25 = $20; //@line 3396
  }
  L9 : while (1) {
   switch ($23 << 24 >> 24) {
   case 37:
    {
     $$0249303 = $25; //@line 3401
     $27 = $25; //@line 3401
     label = 9; //@line 3402
     break L9;
     break;
    }
   case 0:
    {
     $$0249$lcssa = $25; //@line 3407
     break L9;
     break;
    }
   default:
    {}
   }
   $24 = $25 + 1 | 0; //@line 3414
   HEAP32[$5 >> 2] = $24; //@line 3415
   $23 = HEAP8[$24 >> 0] | 0; //@line 3417
   $25 = $24; //@line 3417
  }
  L12 : do {
   if ((label | 0) == 9) {
    while (1) {
     label = 0; //@line 3422
     if ((HEAP8[$27 + 1 >> 0] | 0) != 37) {
      $$0249$lcssa = $$0249303; //@line 3427
      break L12;
     }
     $30 = $$0249303 + 1 | 0; //@line 3430
     $27 = $27 + 2 | 0; //@line 3431
     HEAP32[$5 >> 2] = $27; //@line 3432
     if ((HEAP8[$27 >> 0] | 0) != 37) {
      $$0249$lcssa = $30; //@line 3439
      break;
     } else {
      $$0249303 = $30; //@line 3436
      label = 9; //@line 3437
     }
    }
   }
  } while (0);
  $36 = $$0249$lcssa - $20 | 0; //@line 3447
  if ($10) {
   _out_670($0, $20, $36); //@line 3449
  }
  if ($36 | 0) {
   $$0243 = $36; //@line 3453
   $$0247 = $$1248; //@line 3453
   continue;
  }
  $43 = (_isdigit(HEAP8[(HEAP32[$5 >> 2] | 0) + 1 >> 0] | 0) | 0) == 0; //@line 3461
  $$pre342 = HEAP32[$5 >> 2] | 0; //@line 3462
  if ($43) {
   $$0253 = -1; //@line 3464
   $$1270 = $$0269; //@line 3464
   $$sink = 1; //@line 3464
  } else {
   if ((HEAP8[$$pre342 + 2 >> 0] | 0) == 36) {
    $$0253 = (HEAP8[$$pre342 + 1 >> 0] | 0) + -48 | 0; //@line 3474
    $$1270 = 1; //@line 3474
    $$sink = 3; //@line 3474
   } else {
    $$0253 = -1; //@line 3476
    $$1270 = $$0269; //@line 3476
    $$sink = 1; //@line 3476
   }
  }
  $51 = $$pre342 + $$sink | 0; //@line 3479
  HEAP32[$5 >> 2] = $51; //@line 3480
  $52 = HEAP8[$51 >> 0] | 0; //@line 3481
  $54 = ($52 << 24 >> 24) + -32 | 0; //@line 3483
  if ($54 >>> 0 > 31 | (1 << $54 & 75913 | 0) == 0) {
   $$0262$lcssa = 0; //@line 3490
   $$lcssa291 = $52; //@line 3490
   $$lcssa292 = $51; //@line 3490
  } else {
   $$0262309 = 0; //@line 3492
   $60 = $52; //@line 3492
   $65 = $51; //@line 3492
   while (1) {
    $63 = 1 << ($60 << 24 >> 24) + -32 | $$0262309; //@line 3497
    $64 = $65 + 1 | 0; //@line 3498
    HEAP32[$5 >> 2] = $64; //@line 3499
    $66 = HEAP8[$64 >> 0] | 0; //@line 3500
    $68 = ($66 << 24 >> 24) + -32 | 0; //@line 3502
    if ($68 >>> 0 > 31 | (1 << $68 & 75913 | 0) == 0) {
     $$0262$lcssa = $63; //@line 3509
     $$lcssa291 = $66; //@line 3509
     $$lcssa292 = $64; //@line 3509
     break;
    } else {
     $$0262309 = $63; //@line 3512
     $60 = $66; //@line 3512
     $65 = $64; //@line 3512
    }
   }
  }
  if ($$lcssa291 << 24 >> 24 == 42) {
   if (!(_isdigit(HEAP8[$$lcssa292 + 1 >> 0] | 0) | 0)) {
    label = 23; //@line 3524
   } else {
    $79 = HEAP32[$5 >> 2] | 0; //@line 3526
    if ((HEAP8[$79 + 2 >> 0] | 0) == 36) {
     $83 = $79 + 1 | 0; //@line 3531
     HEAP32[$4 + ((HEAP8[$83 >> 0] | 0) + -48 << 2) >> 2] = 10; //@line 3536
     $$0259 = HEAP32[$3 + ((HEAP8[$83 >> 0] | 0) + -48 << 3) >> 2] | 0; //@line 3548
     $$2271 = 1; //@line 3548
     $storemerge274 = $79 + 3 | 0; //@line 3548
    } else {
     label = 23; //@line 3550
    }
   }
   if ((label | 0) == 23) {
    label = 0; //@line 3554
    if ($$1270 | 0) {
     $$0 = -1; //@line 3557
     break;
    }
    if ($10) {
     $105 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 3572
     $106 = HEAP32[$105 >> 2] | 0; //@line 3573
     HEAP32[$2 >> 2] = $105 + 4; //@line 3575
     $363 = $106; //@line 3576
    } else {
     $363 = 0; //@line 3578
    }
    $$0259 = $363; //@line 3582
    $$2271 = 0; //@line 3582
    $storemerge274 = (HEAP32[$5 >> 2] | 0) + 1 | 0; //@line 3582
   }
   HEAP32[$5 >> 2] = $storemerge274; //@line 3584
   $109 = ($$0259 | 0) < 0; //@line 3585
   $$1260 = $109 ? 0 - $$0259 | 0 : $$0259; //@line 3590
   $$1263 = $109 ? $$0262$lcssa | 8192 : $$0262$lcssa; //@line 3590
   $$3272 = $$2271; //@line 3590
   $115 = $storemerge274; //@line 3590
  } else {
   $112 = _getint_671($5) | 0; //@line 3592
   if (($112 | 0) < 0) {
    $$0 = -1; //@line 3595
    break;
   }
   $$1260 = $112; //@line 3599
   $$1263 = $$0262$lcssa; //@line 3599
   $$3272 = $$1270; //@line 3599
   $115 = HEAP32[$5 >> 2] | 0; //@line 3599
  }
  do {
   if ((HEAP8[$115 >> 0] | 0) == 46) {
    if ((HEAP8[$115 + 1 >> 0] | 0) != 42) {
     HEAP32[$5 >> 2] = $115 + 1; //@line 3610
     $156 = _getint_671($5) | 0; //@line 3611
     $$0254 = $156; //@line 3613
     $$pre345 = HEAP32[$5 >> 2] | 0; //@line 3613
     break;
    }
    if (_isdigit(HEAP8[$115 + 2 >> 0] | 0) | 0) {
     $125 = HEAP32[$5 >> 2] | 0; //@line 3622
     if ((HEAP8[$125 + 3 >> 0] | 0) == 36) {
      $129 = $125 + 2 | 0; //@line 3627
      HEAP32[$4 + ((HEAP8[$129 >> 0] | 0) + -48 << 2) >> 2] = 10; //@line 3632
      $140 = HEAP32[$3 + ((HEAP8[$129 >> 0] | 0) + -48 << 3) >> 2] | 0; //@line 3639
      $144 = $125 + 4 | 0; //@line 3643
      HEAP32[$5 >> 2] = $144; //@line 3644
      $$0254 = $140; //@line 3645
      $$pre345 = $144; //@line 3645
      break;
     }
    }
    if ($$3272 | 0) {
     $$0 = -1; //@line 3651
     break L1;
    }
    if ($10) {
     $151 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 3666
     $152 = HEAP32[$151 >> 2] | 0; //@line 3667
     HEAP32[$2 >> 2] = $151 + 4; //@line 3669
     $364 = $152; //@line 3670
    } else {
     $364 = 0; //@line 3672
    }
    $154 = (HEAP32[$5 >> 2] | 0) + 2 | 0; //@line 3675
    HEAP32[$5 >> 2] = $154; //@line 3676
    $$0254 = $364; //@line 3677
    $$pre345 = $154; //@line 3677
   } else {
    $$0254 = -1; //@line 3679
    $$pre345 = $115; //@line 3679
   }
  } while (0);
  $$0252 = 0; //@line 3682
  $158 = $$pre345; //@line 3682
  while (1) {
   if (((HEAP8[$158 >> 0] | 0) + -65 | 0) >>> 0 > 57) {
    $$0 = -1; //@line 3689
    break L1;
   }
   $158$looptemp = $158;
   $158 = $158 + 1 | 0; //@line 3692
   HEAP32[$5 >> 2] = $158; //@line 3693
   $167 = HEAP8[(HEAP8[$158$looptemp >> 0] | 0) + -65 + (4025 + ($$0252 * 58 | 0)) >> 0] | 0; //@line 3698
   $168 = $167 & 255; //@line 3699
   if (($168 + -1 | 0) >>> 0 >= 8) {
    break;
   } else {
    $$0252 = $168; //@line 3703
   }
  }
  if (!($167 << 24 >> 24)) {
   $$0 = -1; //@line 3710
   break;
  }
  $173 = ($$0253 | 0) > -1; //@line 3714
  do {
   if ($167 << 24 >> 24 == 19) {
    if ($173) {
     $$0 = -1; //@line 3718
     break L1;
    } else {
     label = 50; //@line 3721
    }
   } else {
    if ($173) {
     HEAP32[$4 + ($$0253 << 2) >> 2] = $168; //@line 3726
     $176 = $3 + ($$0253 << 3) | 0; //@line 3728
     $181 = HEAP32[$176 + 4 >> 2] | 0; //@line 3733
     $182 = $6; //@line 3734
     HEAP32[$182 >> 2] = HEAP32[$176 >> 2]; //@line 3736
     HEAP32[$182 + 4 >> 2] = $181; //@line 3739
     label = 50; //@line 3740
     break;
    }
    if (!$10) {
     $$0 = 0; //@line 3744
     break L1;
    }
    _pop_arg_673($6, $168, $2); //@line 3747
    $187 = HEAP32[$5 >> 2] | 0; //@line 3749
   }
  } while (0);
  if ((label | 0) == 50) {
   label = 0; //@line 3753
   if ($10) {
    $187 = $158; //@line 3755
   } else {
    $$0243 = 0; //@line 3757
    $$0247 = $$1248; //@line 3757
    $$0269 = $$3272; //@line 3757
    continue;
   }
  }
  $189 = HEAP8[$187 + -1 >> 0] | 0; //@line 3763
  $$0235 = ($$0252 | 0) != 0 & ($189 & 15 | 0) == 3 ? $189 & -33 : $189; //@line 3769
  $196 = $$1263 & -65537; //@line 3772
  $$1263$ = ($$1263 & 8192 | 0) == 0 ? $$1263 : $196; //@line 3773
  L73 : do {
   switch ($$0235 | 0) {
   case 110:
    {
     switch (($$0252 & 255) << 24 >> 24) {
     case 0:
      {
       HEAP32[HEAP32[$6 >> 2] >> 2] = $$1248; //@line 3781
       $$0243 = 0; //@line 3782
       $$0247 = $$1248; //@line 3782
       $$0269 = $$3272; //@line 3782
       continue L1;
       break;
      }
     case 1:
      {
       HEAP32[HEAP32[$6 >> 2] >> 2] = $$1248; //@line 3788
       $$0243 = 0; //@line 3789
       $$0247 = $$1248; //@line 3789
       $$0269 = $$3272; //@line 3789
       continue L1;
       break;
      }
     case 2:
      {
       $208 = HEAP32[$6 >> 2] | 0; //@line 3797
       HEAP32[$208 >> 2] = $$1248; //@line 3799
       HEAP32[$208 + 4 >> 2] = (($$1248 | 0) < 0) << 31 >> 31; //@line 3802
       $$0243 = 0; //@line 3803
       $$0247 = $$1248; //@line 3803
       $$0269 = $$3272; //@line 3803
       continue L1;
       break;
      }
     case 3:
      {
       HEAP16[HEAP32[$6 >> 2] >> 1] = $$1248; //@line 3810
       $$0243 = 0; //@line 3811
       $$0247 = $$1248; //@line 3811
       $$0269 = $$3272; //@line 3811
       continue L1;
       break;
      }
     case 4:
      {
       HEAP8[HEAP32[$6 >> 2] >> 0] = $$1248; //@line 3818
       $$0243 = 0; //@line 3819
       $$0247 = $$1248; //@line 3819
       $$0269 = $$3272; //@line 3819
       continue L1;
       break;
      }
     case 6:
      {
       HEAP32[HEAP32[$6 >> 2] >> 2] = $$1248; //@line 3825
       $$0243 = 0; //@line 3826
       $$0247 = $$1248; //@line 3826
       $$0269 = $$3272; //@line 3826
       continue L1;
       break;
      }
     case 7:
      {
       $220 = HEAP32[$6 >> 2] | 0; //@line 3834
       HEAP32[$220 >> 2] = $$1248; //@line 3836
       HEAP32[$220 + 4 >> 2] = (($$1248 | 0) < 0) << 31 >> 31; //@line 3839
       $$0243 = 0; //@line 3840
       $$0247 = $$1248; //@line 3840
       $$0269 = $$3272; //@line 3840
       continue L1;
       break;
      }
     default:
      {
       $$0243 = 0; //@line 3845
       $$0247 = $$1248; //@line 3845
       $$0269 = $$3272; //@line 3845
       continue L1;
      }
     }
     break;
    }
   case 112:
    {
     $$1236 = 120; //@line 3855
     $$1255 = $$0254 >>> 0 > 8 ? $$0254 : 8; //@line 3855
     $$3265 = $$1263$ | 8; //@line 3855
     label = 62; //@line 3856
     break;
    }
   case 88:
   case 120:
    {
     $$1236 = $$0235; //@line 3860
     $$1255 = $$0254; //@line 3860
     $$3265 = $$1263$; //@line 3860
     label = 62; //@line 3861
     break;
    }
   case 111:
    {
     $242 = $6; //@line 3865
     $244 = HEAP32[$242 >> 2] | 0; //@line 3867
     $247 = HEAP32[$242 + 4 >> 2] | 0; //@line 3870
     $248 = _fmt_o($244, $247, $11) | 0; //@line 3871
     $252 = $12 - $248 | 0; //@line 3875
     $$0228 = $248; //@line 3880
     $$1233 = 0; //@line 3880
     $$1238 = 4489; //@line 3880
     $$2256 = ($$1263$ & 8 | 0) == 0 | ($$0254 | 0) > ($252 | 0) ? $$0254 : $252 + 1 | 0; //@line 3880
     $$4266 = $$1263$; //@line 3880
     $281 = $244; //@line 3880
     $283 = $247; //@line 3880
     label = 68; //@line 3881
     break;
    }
   case 105:
   case 100:
    {
     $256 = $6; //@line 3885
     $258 = HEAP32[$256 >> 2] | 0; //@line 3887
     $261 = HEAP32[$256 + 4 >> 2] | 0; //@line 3890
     if (($261 | 0) < 0) {
      $263 = _i64Subtract(0, 0, $258 | 0, $261 | 0) | 0; //@line 3893
      $264 = tempRet0; //@line 3894
      $265 = $6; //@line 3895
      HEAP32[$265 >> 2] = $263; //@line 3897
      HEAP32[$265 + 4 >> 2] = $264; //@line 3900
      $$0232 = 1; //@line 3901
      $$0237 = 4489; //@line 3901
      $275 = $263; //@line 3901
      $276 = $264; //@line 3901
      label = 67; //@line 3902
      break L73;
     } else {
      $$0232 = ($$1263$ & 2049 | 0) != 0 & 1; //@line 3914
      $$0237 = ($$1263$ & 2048 | 0) == 0 ? ($$1263$ & 1 | 0) == 0 ? 4489 : 4491 : 4490; //@line 3914
      $275 = $258; //@line 3914
      $276 = $261; //@line 3914
      label = 67; //@line 3915
      break L73;
     }
     break;
    }
   case 117:
    {
     $197 = $6; //@line 3921
     $$0232 = 0; //@line 3927
     $$0237 = 4489; //@line 3927
     $275 = HEAP32[$197 >> 2] | 0; //@line 3927
     $276 = HEAP32[$197 + 4 >> 2] | 0; //@line 3927
     label = 67; //@line 3928
     break;
    }
   case 99:
    {
     HEAP8[$13 >> 0] = HEAP32[$6 >> 2]; //@line 3939
     $$2 = $13; //@line 3940
     $$2234 = 0; //@line 3940
     $$2239 = 4489; //@line 3940
     $$2251 = $11; //@line 3940
     $$5 = 1; //@line 3940
     $$6268 = $196; //@line 3940
     break;
    }
   case 109:
    {
     $$1 = _strerror(HEAP32[(___errno_location() | 0) >> 2] | 0) | 0; //@line 3947
     label = 72; //@line 3948
     break;
    }
   case 115:
    {
     $302 = HEAP32[$6 >> 2] | 0; //@line 3952
     $$1 = $302 | 0 ? $302 : 4499; //@line 3955
     label = 72; //@line 3956
     break;
    }
   case 67:
    {
     HEAP32[$8 >> 2] = HEAP32[$6 >> 2]; //@line 3966
     HEAP32[$14 >> 2] = 0; //@line 3967
     HEAP32[$6 >> 2] = $8; //@line 3968
     $$4258354 = -1; //@line 3969
     $365 = $8; //@line 3969
     label = 76; //@line 3970
     break;
    }
   case 83:
    {
     $$pre348 = HEAP32[$6 >> 2] | 0; //@line 3974
     if (!$$0254) {
      _pad_676($0, 32, $$1260, 0, $$1263$); //@line 3977
      $$0240$lcssa356 = 0; //@line 3978
      label = 85; //@line 3979
     } else {
      $$4258354 = $$0254; //@line 3981
      $365 = $$pre348; //@line 3981
      label = 76; //@line 3982
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
     $$0243 = _fmt_fp($0, +HEAPF64[$6 >> 3], $$1260, $$0254, $$1263$, $$0235) | 0; //@line 3989
     $$0247 = $$1248; //@line 3989
     $$0269 = $$3272; //@line 3989
     continue L1;
     break;
    }
   default:
    {
     $$2 = $20; //@line 3994
     $$2234 = 0; //@line 3994
     $$2239 = 4489; //@line 3994
     $$2251 = $11; //@line 3994
     $$5 = $$0254; //@line 3994
     $$6268 = $$1263$; //@line 3994
    }
   }
  } while (0);
  L97 : do {
   if ((label | 0) == 62) {
    label = 0; //@line 4000
    $227 = $6; //@line 4001
    $229 = HEAP32[$227 >> 2] | 0; //@line 4003
    $232 = HEAP32[$227 + 4 >> 2] | 0; //@line 4006
    $234 = _fmt_x($229, $232, $11, $$1236 & 32) | 0; //@line 4008
    $or$cond278 = ($$3265 & 8 | 0) == 0 | ($229 | 0) == 0 & ($232 | 0) == 0; //@line 4014
    $$0228 = $234; //@line 4019
    $$1233 = $or$cond278 ? 0 : 2; //@line 4019
    $$1238 = $or$cond278 ? 4489 : 4489 + ($$1236 >> 4) | 0; //@line 4019
    $$2256 = $$1255; //@line 4019
    $$4266 = $$3265; //@line 4019
    $281 = $229; //@line 4019
    $283 = $232; //@line 4019
    label = 68; //@line 4020
   } else if ((label | 0) == 67) {
    label = 0; //@line 4023
    $$0228 = _fmt_u($275, $276, $11) | 0; //@line 4025
    $$1233 = $$0232; //@line 4025
    $$1238 = $$0237; //@line 4025
    $$2256 = $$0254; //@line 4025
    $$4266 = $$1263$; //@line 4025
    $281 = $275; //@line 4025
    $283 = $276; //@line 4025
    label = 68; //@line 4026
   } else if ((label | 0) == 72) {
    label = 0; //@line 4029
    $305 = _memchr($$1, 0, $$0254) | 0; //@line 4030
    $306 = ($305 | 0) == 0; //@line 4031
    $$2 = $$1; //@line 4038
    $$2234 = 0; //@line 4038
    $$2239 = 4489; //@line 4038
    $$2251 = $306 ? $$1 + $$0254 | 0 : $305; //@line 4038
    $$5 = $306 ? $$0254 : $305 - $$1 | 0; //@line 4038
    $$6268 = $196; //@line 4038
   } else if ((label | 0) == 76) {
    label = 0; //@line 4041
    $$0229316 = $365; //@line 4042
    $$0240315 = 0; //@line 4042
    $$1244314 = 0; //@line 4042
    while (1) {
     $318 = HEAP32[$$0229316 >> 2] | 0; //@line 4044
     if (!$318) {
      $$0240$lcssa = $$0240315; //@line 4047
      $$2245 = $$1244314; //@line 4047
      break;
     }
     $320 = _wctomb($9, $318) | 0; //@line 4050
     if (($320 | 0) < 0 | $320 >>> 0 > ($$4258354 - $$0240315 | 0) >>> 0) {
      $$0240$lcssa = $$0240315; //@line 4056
      $$2245 = $320; //@line 4056
      break;
     }
     $325 = $320 + $$0240315 | 0; //@line 4060
     if ($$4258354 >>> 0 > $325 >>> 0) {
      $$0229316 = $$0229316 + 4 | 0; //@line 4063
      $$0240315 = $325; //@line 4063
      $$1244314 = $320; //@line 4063
     } else {
      $$0240$lcssa = $325; //@line 4065
      $$2245 = $320; //@line 4065
      break;
     }
    }
    if (($$2245 | 0) < 0) {
     $$0 = -1; //@line 4071
     break L1;
    }
    _pad_676($0, 32, $$1260, $$0240$lcssa, $$1263$); //@line 4074
    if (!$$0240$lcssa) {
     $$0240$lcssa356 = 0; //@line 4077
     label = 85; //@line 4078
    } else {
     $$1230327 = $365; //@line 4080
     $$1241326 = 0; //@line 4080
     while (1) {
      $329 = HEAP32[$$1230327 >> 2] | 0; //@line 4082
      if (!$329) {
       $$0240$lcssa356 = $$0240$lcssa; //@line 4085
       label = 85; //@line 4086
       break L97;
      }
      $331 = _wctomb($9, $329) | 0; //@line 4089
      $$1241326 = $331 + $$1241326 | 0; //@line 4090
      if (($$1241326 | 0) > ($$0240$lcssa | 0)) {
       $$0240$lcssa356 = $$0240$lcssa; //@line 4093
       label = 85; //@line 4094
       break L97;
      }
      _out_670($0, $9, $331); //@line 4098
      if ($$1241326 >>> 0 >= $$0240$lcssa >>> 0) {
       $$0240$lcssa356 = $$0240$lcssa; //@line 4103
       label = 85; //@line 4104
       break;
      } else {
       $$1230327 = $$1230327 + 4 | 0; //@line 4101
      }
     }
    }
   }
  } while (0);
  if ((label | 0) == 68) {
   label = 0; //@line 4112
   $284 = ($281 | 0) != 0 | ($283 | 0) != 0; //@line 4118
   $or$cond = ($$2256 | 0) != 0 | $284; //@line 4120
   $290 = $12 - $$0228 + (($284 ^ 1) & 1) | 0; //@line 4125
   $$2 = $or$cond ? $$0228 : $11; //@line 4130
   $$2234 = $$1233; //@line 4130
   $$2239 = $$1238; //@line 4130
   $$2251 = $11; //@line 4130
   $$5 = $or$cond ? ($$2256 | 0) > ($290 | 0) ? $$2256 : $290 : $$2256; //@line 4130
   $$6268 = ($$2256 | 0) > -1 ? $$4266 & -65537 : $$4266; //@line 4130
  } else if ((label | 0) == 85) {
   label = 0; //@line 4133
   _pad_676($0, 32, $$1260, $$0240$lcssa356, $$1263$ ^ 8192); //@line 4135
   $$0243 = ($$1260 | 0) > ($$0240$lcssa356 | 0) ? $$1260 : $$0240$lcssa356; //@line 4138
   $$0247 = $$1248; //@line 4138
   $$0269 = $$3272; //@line 4138
   continue;
  }
  $343 = $$2251 - $$2 | 0; //@line 4143
  $$$5 = ($$5 | 0) < ($343 | 0) ? $343 : $$5; //@line 4145
  $345 = $$$5 + $$2234 | 0; //@line 4146
  $$2261 = ($$1260 | 0) < ($345 | 0) ? $345 : $$1260; //@line 4148
  _pad_676($0, 32, $$2261, $345, $$6268); //@line 4149
  _out_670($0, $$2239, $$2234); //@line 4150
  _pad_676($0, 48, $$2261, $345, $$6268 ^ 65536); //@line 4152
  _pad_676($0, 48, $$$5, $343, 0); //@line 4153
  _out_670($0, $$2, $343); //@line 4154
  _pad_676($0, 32, $$2261, $345, $$6268 ^ 8192); //@line 4156
  $$0243 = $$2261; //@line 4157
  $$0247 = $$1248; //@line 4157
  $$0269 = $$3272; //@line 4157
 }
 L116 : do {
  if ((label | 0) == 88) {
   if (!$0) {
    if (!$$0269) {
     $$0 = 0; //@line 4165
    } else {
     $$2242302 = 1; //@line 4167
     while (1) {
      $352 = HEAP32[$4 + ($$2242302 << 2) >> 2] | 0; //@line 4170
      if (!$352) {
       $$2242$lcssa = $$2242302; //@line 4173
       break;
      }
      _pop_arg_673($3 + ($$2242302 << 3) | 0, $352, $2); //@line 4177
      $356 = $$2242302 + 1 | 0; //@line 4178
      if (($$2242302 | 0) < 9) {
       $$2242302 = $356; //@line 4181
      } else {
       $$2242$lcssa = $356; //@line 4183
       break;
      }
     }
     if (($$2242$lcssa | 0) < 10) {
      $$3300 = $$2242$lcssa; //@line 4189
      while (1) {
       if (HEAP32[$4 + ($$3300 << 2) >> 2] | 0) {
        $$0 = -1; //@line 4195
        break L116;
       }
       if (($$3300 | 0) < 9) {
        $$3300 = $$3300 + 1 | 0; //@line 4201
       } else {
        $$0 = 1; //@line 4203
        break;
       }
      }
     } else {
      $$0 = 1; //@line 4208
     }
    }
   } else {
    $$0 = $$1248; //@line 4212
   }
  }
 } while (0);
 STACKTOP = sp; //@line 4216
 return $$0 | 0; //@line 4216
}
function _free($0) {
 $0 = $0 | 0;
 var $$0212$i = 0, $$0212$in$i = 0, $$0383 = 0, $$0384 = 0, $$0396 = 0, $$0403 = 0, $$1 = 0, $$1382 = 0, $$1387 = 0, $$1390 = 0, $$1398 = 0, $$1402 = 0, $$2 = 0, $$3 = 0, $$3400 = 0, $$pre$phi442Z2D = 0, $$pre$phi444Z2D = 0, $$pre$phiZ2D = 0, $10 = 0, $105 = 0, $106 = 0, $114 = 0, $115 = 0, $116 = 0, $124 = 0, $13 = 0, $132 = 0, $137 = 0, $138 = 0, $141 = 0, $143 = 0, $145 = 0, $16 = 0, $160 = 0, $165 = 0, $167 = 0, $17 = 0, $170 = 0, $173 = 0, $176 = 0, $179 = 0, $180 = 0, $181 = 0, $183 = 0, $185 = 0, $186 = 0, $188 = 0, $189 = 0, $195 = 0, $196 = 0, $2 = 0, $21 = 0, $210 = 0, $213 = 0, $214 = 0, $220 = 0, $235 = 0, $238 = 0, $239 = 0, $24 = 0, $240 = 0, $244 = 0, $245 = 0, $251 = 0, $256 = 0, $257 = 0, $26 = 0, $260 = 0, $262 = 0, $265 = 0, $270 = 0, $276 = 0, $28 = 0, $280 = 0, $281 = 0, $299 = 0, $3 = 0, $301 = 0, $308 = 0, $309 = 0, $310 = 0, $319 = 0, $41 = 0, $46 = 0, $48 = 0, $51 = 0, $53 = 0, $56 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $63 = 0, $65 = 0, $66 = 0, $68 = 0, $69 = 0, $7 = 0, $74 = 0, $75 = 0, $89 = 0, $9 = 0, $92 = 0, $93 = 0, $99 = 0, label = 0;
 if (!$0) {
  return;
 }
 $2 = $0 + -8 | 0; //@line 7903
 $3 = HEAP32[1762] | 0; //@line 7904
 if ($2 >>> 0 < $3 >>> 0) {
  _abort(); //@line 7907
 }
 $6 = HEAP32[$0 + -4 >> 2] | 0; //@line 7911
 $7 = $6 & 3; //@line 7912
 if (($7 | 0) == 1) {
  _abort(); //@line 7915
 }
 $9 = $6 & -8; //@line 7918
 $10 = $2 + $9 | 0; //@line 7919
 L10 : do {
  if (!($6 & 1)) {
   $13 = HEAP32[$2 >> 2] | 0; //@line 7924
   if (!$7) {
    return;
   }
   $16 = $2 + (0 - $13) | 0; //@line 7930
   $17 = $13 + $9 | 0; //@line 7931
   if ($16 >>> 0 < $3 >>> 0) {
    _abort(); //@line 7934
   }
   if ((HEAP32[1763] | 0) == ($16 | 0)) {
    $105 = $10 + 4 | 0; //@line 7940
    $106 = HEAP32[$105 >> 2] | 0; //@line 7941
    if (($106 & 3 | 0) != 3) {
     $$1 = $16; //@line 7945
     $$1382 = $17; //@line 7945
     $114 = $16; //@line 7945
     break;
    }
    HEAP32[1760] = $17; //@line 7948
    HEAP32[$105 >> 2] = $106 & -2; //@line 7950
    HEAP32[$16 + 4 >> 2] = $17 | 1; //@line 7953
    HEAP32[$16 + $17 >> 2] = $17; //@line 7955
    return;
   }
   $21 = $13 >>> 3; //@line 7958
   if ($13 >>> 0 < 256) {
    $24 = HEAP32[$16 + 8 >> 2] | 0; //@line 7962
    $26 = HEAP32[$16 + 12 >> 2] | 0; //@line 7964
    $28 = 7072 + ($21 << 1 << 2) | 0; //@line 7966
    if (($24 | 0) != ($28 | 0)) {
     if ($3 >>> 0 > $24 >>> 0) {
      _abort(); //@line 7971
     }
     if ((HEAP32[$24 + 12 >> 2] | 0) != ($16 | 0)) {
      _abort(); //@line 7978
     }
    }
    if (($26 | 0) == ($24 | 0)) {
     HEAP32[1758] = HEAP32[1758] & ~(1 << $21); //@line 7988
     $$1 = $16; //@line 7989
     $$1382 = $17; //@line 7989
     $114 = $16; //@line 7989
     break;
    }
    if (($26 | 0) == ($28 | 0)) {
     $$pre$phi444Z2D = $26 + 8 | 0; //@line 7995
    } else {
     if ($3 >>> 0 > $26 >>> 0) {
      _abort(); //@line 7999
     }
     $41 = $26 + 8 | 0; //@line 8002
     if ((HEAP32[$41 >> 2] | 0) == ($16 | 0)) {
      $$pre$phi444Z2D = $41; //@line 8006
     } else {
      _abort(); //@line 8008
     }
    }
    HEAP32[$24 + 12 >> 2] = $26; //@line 8013
    HEAP32[$$pre$phi444Z2D >> 2] = $24; //@line 8014
    $$1 = $16; //@line 8015
    $$1382 = $17; //@line 8015
    $114 = $16; //@line 8015
    break;
   }
   $46 = HEAP32[$16 + 24 >> 2] | 0; //@line 8019
   $48 = HEAP32[$16 + 12 >> 2] | 0; //@line 8021
   do {
    if (($48 | 0) == ($16 | 0)) {
     $59 = $16 + 16 | 0; //@line 8025
     $60 = $59 + 4 | 0; //@line 8026
     $61 = HEAP32[$60 >> 2] | 0; //@line 8027
     if (!$61) {
      $63 = HEAP32[$59 >> 2] | 0; //@line 8030
      if (!$63) {
       $$3 = 0; //@line 8033
       break;
      } else {
       $$1387 = $63; //@line 8036
       $$1390 = $59; //@line 8036
      }
     } else {
      $$1387 = $61; //@line 8039
      $$1390 = $60; //@line 8039
     }
     while (1) {
      $65 = $$1387 + 20 | 0; //@line 8042
      $66 = HEAP32[$65 >> 2] | 0; //@line 8043
      if ($66 | 0) {
       $$1387 = $66; //@line 8046
       $$1390 = $65; //@line 8046
       continue;
      }
      $68 = $$1387 + 16 | 0; //@line 8049
      $69 = HEAP32[$68 >> 2] | 0; //@line 8050
      if (!$69) {
       break;
      } else {
       $$1387 = $69; //@line 8055
       $$1390 = $68; //@line 8055
      }
     }
     if ($3 >>> 0 > $$1390 >>> 0) {
      _abort(); //@line 8060
     } else {
      HEAP32[$$1390 >> 2] = 0; //@line 8063
      $$3 = $$1387; //@line 8064
      break;
     }
    } else {
     $51 = HEAP32[$16 + 8 >> 2] | 0; //@line 8069
     if ($3 >>> 0 > $51 >>> 0) {
      _abort(); //@line 8072
     }
     $53 = $51 + 12 | 0; //@line 8075
     if ((HEAP32[$53 >> 2] | 0) != ($16 | 0)) {
      _abort(); //@line 8079
     }
     $56 = $48 + 8 | 0; //@line 8082
     if ((HEAP32[$56 >> 2] | 0) == ($16 | 0)) {
      HEAP32[$53 >> 2] = $48; //@line 8086
      HEAP32[$56 >> 2] = $51; //@line 8087
      $$3 = $48; //@line 8088
      break;
     } else {
      _abort(); //@line 8091
     }
    }
   } while (0);
   if (!$46) {
    $$1 = $16; //@line 8098
    $$1382 = $17; //@line 8098
    $114 = $16; //@line 8098
   } else {
    $74 = HEAP32[$16 + 28 >> 2] | 0; //@line 8101
    $75 = 7336 + ($74 << 2) | 0; //@line 8102
    do {
     if ((HEAP32[$75 >> 2] | 0) == ($16 | 0)) {
      HEAP32[$75 >> 2] = $$3; //@line 8107
      if (!$$3) {
       HEAP32[1759] = HEAP32[1759] & ~(1 << $74); //@line 8114
       $$1 = $16; //@line 8115
       $$1382 = $17; //@line 8115
       $114 = $16; //@line 8115
       break L10;
      }
     } else {
      if ((HEAP32[1762] | 0) >>> 0 > $46 >>> 0) {
       _abort(); //@line 8122
      } else {
       HEAP32[$46 + 16 + (((HEAP32[$46 + 16 >> 2] | 0) != ($16 | 0) & 1) << 2) >> 2] = $$3; //@line 8130
       if (!$$3) {
        $$1 = $16; //@line 8133
        $$1382 = $17; //@line 8133
        $114 = $16; //@line 8133
        break L10;
       } else {
        break;
       }
      }
     }
    } while (0);
    $89 = HEAP32[1762] | 0; //@line 8141
    if ($89 >>> 0 > $$3 >>> 0) {
     _abort(); //@line 8144
    }
    HEAP32[$$3 + 24 >> 2] = $46; //@line 8148
    $92 = $16 + 16 | 0; //@line 8149
    $93 = HEAP32[$92 >> 2] | 0; //@line 8150
    do {
     if ($93 | 0) {
      if ($89 >>> 0 > $93 >>> 0) {
       _abort(); //@line 8156
      } else {
       HEAP32[$$3 + 16 >> 2] = $93; //@line 8160
       HEAP32[$93 + 24 >> 2] = $$3; //@line 8162
       break;
      }
     }
    } while (0);
    $99 = HEAP32[$92 + 4 >> 2] | 0; //@line 8168
    if (!$99) {
     $$1 = $16; //@line 8171
     $$1382 = $17; //@line 8171
     $114 = $16; //@line 8171
    } else {
     if ((HEAP32[1762] | 0) >>> 0 > $99 >>> 0) {
      _abort(); //@line 8176
     } else {
      HEAP32[$$3 + 20 >> 2] = $99; //@line 8180
      HEAP32[$99 + 24 >> 2] = $$3; //@line 8182
      $$1 = $16; //@line 8183
      $$1382 = $17; //@line 8183
      $114 = $16; //@line 8183
      break;
     }
    }
   }
  } else {
   $$1 = $2; //@line 8189
   $$1382 = $9; //@line 8189
   $114 = $2; //@line 8189
  }
 } while (0);
 if ($114 >>> 0 >= $10 >>> 0) {
  _abort(); //@line 8194
 }
 $115 = $10 + 4 | 0; //@line 8197
 $116 = HEAP32[$115 >> 2] | 0; //@line 8198
 if (!($116 & 1)) {
  _abort(); //@line 8202
 }
 if (!($116 & 2)) {
  if ((HEAP32[1764] | 0) == ($10 | 0)) {
   $124 = (HEAP32[1761] | 0) + $$1382 | 0; //@line 8212
   HEAP32[1761] = $124; //@line 8213
   HEAP32[1764] = $$1; //@line 8214
   HEAP32[$$1 + 4 >> 2] = $124 | 1; //@line 8217
   if (($$1 | 0) != (HEAP32[1763] | 0)) {
    return;
   }
   HEAP32[1763] = 0; //@line 8223
   HEAP32[1760] = 0; //@line 8224
   return;
  }
  if ((HEAP32[1763] | 0) == ($10 | 0)) {
   $132 = (HEAP32[1760] | 0) + $$1382 | 0; //@line 8231
   HEAP32[1760] = $132; //@line 8232
   HEAP32[1763] = $114; //@line 8233
   HEAP32[$$1 + 4 >> 2] = $132 | 1; //@line 8236
   HEAP32[$114 + $132 >> 2] = $132; //@line 8238
   return;
  }
  $137 = ($116 & -8) + $$1382 | 0; //@line 8242
  $138 = $116 >>> 3; //@line 8243
  L108 : do {
   if ($116 >>> 0 < 256) {
    $141 = HEAP32[$10 + 8 >> 2] | 0; //@line 8248
    $143 = HEAP32[$10 + 12 >> 2] | 0; //@line 8250
    $145 = 7072 + ($138 << 1 << 2) | 0; //@line 8252
    if (($141 | 0) != ($145 | 0)) {
     if ((HEAP32[1762] | 0) >>> 0 > $141 >>> 0) {
      _abort(); //@line 8258
     }
     if ((HEAP32[$141 + 12 >> 2] | 0) != ($10 | 0)) {
      _abort(); //@line 8265
     }
    }
    if (($143 | 0) == ($141 | 0)) {
     HEAP32[1758] = HEAP32[1758] & ~(1 << $138); //@line 8275
     break;
    }
    if (($143 | 0) == ($145 | 0)) {
     $$pre$phi442Z2D = $143 + 8 | 0; //@line 8281
    } else {
     if ((HEAP32[1762] | 0) >>> 0 > $143 >>> 0) {
      _abort(); //@line 8286
     }
     $160 = $143 + 8 | 0; //@line 8289
     if ((HEAP32[$160 >> 2] | 0) == ($10 | 0)) {
      $$pre$phi442Z2D = $160; //@line 8293
     } else {
      _abort(); //@line 8295
     }
    }
    HEAP32[$141 + 12 >> 2] = $143; //@line 8300
    HEAP32[$$pre$phi442Z2D >> 2] = $141; //@line 8301
   } else {
    $165 = HEAP32[$10 + 24 >> 2] | 0; //@line 8304
    $167 = HEAP32[$10 + 12 >> 2] | 0; //@line 8306
    do {
     if (($167 | 0) == ($10 | 0)) {
      $179 = $10 + 16 | 0; //@line 8310
      $180 = $179 + 4 | 0; //@line 8311
      $181 = HEAP32[$180 >> 2] | 0; //@line 8312
      if (!$181) {
       $183 = HEAP32[$179 >> 2] | 0; //@line 8315
       if (!$183) {
        $$3400 = 0; //@line 8318
        break;
       } else {
        $$1398 = $183; //@line 8321
        $$1402 = $179; //@line 8321
       }
      } else {
       $$1398 = $181; //@line 8324
       $$1402 = $180; //@line 8324
      }
      while (1) {
       $185 = $$1398 + 20 | 0; //@line 8327
       $186 = HEAP32[$185 >> 2] | 0; //@line 8328
       if ($186 | 0) {
        $$1398 = $186; //@line 8331
        $$1402 = $185; //@line 8331
        continue;
       }
       $188 = $$1398 + 16 | 0; //@line 8334
       $189 = HEAP32[$188 >> 2] | 0; //@line 8335
       if (!$189) {
        break;
       } else {
        $$1398 = $189; //@line 8340
        $$1402 = $188; //@line 8340
       }
      }
      if ((HEAP32[1762] | 0) >>> 0 > $$1402 >>> 0) {
       _abort(); //@line 8346
      } else {
       HEAP32[$$1402 >> 2] = 0; //@line 8349
       $$3400 = $$1398; //@line 8350
       break;
      }
     } else {
      $170 = HEAP32[$10 + 8 >> 2] | 0; //@line 8355
      if ((HEAP32[1762] | 0) >>> 0 > $170 >>> 0) {
       _abort(); //@line 8359
      }
      $173 = $170 + 12 | 0; //@line 8362
      if ((HEAP32[$173 >> 2] | 0) != ($10 | 0)) {
       _abort(); //@line 8366
      }
      $176 = $167 + 8 | 0; //@line 8369
      if ((HEAP32[$176 >> 2] | 0) == ($10 | 0)) {
       HEAP32[$173 >> 2] = $167; //@line 8373
       HEAP32[$176 >> 2] = $170; //@line 8374
       $$3400 = $167; //@line 8375
       break;
      } else {
       _abort(); //@line 8378
      }
     }
    } while (0);
    if ($165 | 0) {
     $195 = HEAP32[$10 + 28 >> 2] | 0; //@line 8386
     $196 = 7336 + ($195 << 2) | 0; //@line 8387
     do {
      if ((HEAP32[$196 >> 2] | 0) == ($10 | 0)) {
       HEAP32[$196 >> 2] = $$3400; //@line 8392
       if (!$$3400) {
        HEAP32[1759] = HEAP32[1759] & ~(1 << $195); //@line 8399
        break L108;
       }
      } else {
       if ((HEAP32[1762] | 0) >>> 0 > $165 >>> 0) {
        _abort(); //@line 8406
       } else {
        HEAP32[$165 + 16 + (((HEAP32[$165 + 16 >> 2] | 0) != ($10 | 0) & 1) << 2) >> 2] = $$3400; //@line 8414
        if (!$$3400) {
         break L108;
        } else {
         break;
        }
       }
      }
     } while (0);
     $210 = HEAP32[1762] | 0; //@line 8424
     if ($210 >>> 0 > $$3400 >>> 0) {
      _abort(); //@line 8427
     }
     HEAP32[$$3400 + 24 >> 2] = $165; //@line 8431
     $213 = $10 + 16 | 0; //@line 8432
     $214 = HEAP32[$213 >> 2] | 0; //@line 8433
     do {
      if ($214 | 0) {
       if ($210 >>> 0 > $214 >>> 0) {
        _abort(); //@line 8439
       } else {
        HEAP32[$$3400 + 16 >> 2] = $214; //@line 8443
        HEAP32[$214 + 24 >> 2] = $$3400; //@line 8445
        break;
       }
      }
     } while (0);
     $220 = HEAP32[$213 + 4 >> 2] | 0; //@line 8451
     if ($220 | 0) {
      if ((HEAP32[1762] | 0) >>> 0 > $220 >>> 0) {
       _abort(); //@line 8457
      } else {
       HEAP32[$$3400 + 20 >> 2] = $220; //@line 8461
       HEAP32[$220 + 24 >> 2] = $$3400; //@line 8463
       break;
      }
     }
    }
   }
  } while (0);
  HEAP32[$$1 + 4 >> 2] = $137 | 1; //@line 8472
  HEAP32[$114 + $137 >> 2] = $137; //@line 8474
  if (($$1 | 0) == (HEAP32[1763] | 0)) {
   HEAP32[1760] = $137; //@line 8478
   return;
  } else {
   $$2 = $137; //@line 8481
  }
 } else {
  HEAP32[$115 >> 2] = $116 & -2; //@line 8485
  HEAP32[$$1 + 4 >> 2] = $$1382 | 1; //@line 8488
  HEAP32[$114 + $$1382 >> 2] = $$1382; //@line 8490
  $$2 = $$1382; //@line 8491
 }
 $235 = $$2 >>> 3; //@line 8493
 if ($$2 >>> 0 < 256) {
  $238 = 7072 + ($235 << 1 << 2) | 0; //@line 8497
  $239 = HEAP32[1758] | 0; //@line 8498
  $240 = 1 << $235; //@line 8499
  if (!($239 & $240)) {
   HEAP32[1758] = $239 | $240; //@line 8504
   $$0403 = $238; //@line 8506
   $$pre$phiZ2D = $238 + 8 | 0; //@line 8506
  } else {
   $244 = $238 + 8 | 0; //@line 8508
   $245 = HEAP32[$244 >> 2] | 0; //@line 8509
   if ((HEAP32[1762] | 0) >>> 0 > $245 >>> 0) {
    _abort(); //@line 8513
   } else {
    $$0403 = $245; //@line 8516
    $$pre$phiZ2D = $244; //@line 8516
   }
  }
  HEAP32[$$pre$phiZ2D >> 2] = $$1; //@line 8519
  HEAP32[$$0403 + 12 >> 2] = $$1; //@line 8521
  HEAP32[$$1 + 8 >> 2] = $$0403; //@line 8523
  HEAP32[$$1 + 12 >> 2] = $238; //@line 8525
  return;
 }
 $251 = $$2 >>> 8; //@line 8528
 if (!$251) {
  $$0396 = 0; //@line 8531
 } else {
  if ($$2 >>> 0 > 16777215) {
   $$0396 = 31; //@line 8535
  } else {
   $256 = ($251 + 1048320 | 0) >>> 16 & 8; //@line 8539
   $257 = $251 << $256; //@line 8540
   $260 = ($257 + 520192 | 0) >>> 16 & 4; //@line 8543
   $262 = $257 << $260; //@line 8545
   $265 = ($262 + 245760 | 0) >>> 16 & 2; //@line 8548
   $270 = 14 - ($260 | $256 | $265) + ($262 << $265 >>> 15) | 0; //@line 8553
   $$0396 = $$2 >>> ($270 + 7 | 0) & 1 | $270 << 1; //@line 8559
  }
 }
 $276 = 7336 + ($$0396 << 2) | 0; //@line 8562
 HEAP32[$$1 + 28 >> 2] = $$0396; //@line 8564
 HEAP32[$$1 + 20 >> 2] = 0; //@line 8567
 HEAP32[$$1 + 16 >> 2] = 0; //@line 8568
 $280 = HEAP32[1759] | 0; //@line 8569
 $281 = 1 << $$0396; //@line 8570
 do {
  if (!($280 & $281)) {
   HEAP32[1759] = $280 | $281; //@line 8576
   HEAP32[$276 >> 2] = $$1; //@line 8577
   HEAP32[$$1 + 24 >> 2] = $276; //@line 8579
   HEAP32[$$1 + 12 >> 2] = $$1; //@line 8581
   HEAP32[$$1 + 8 >> 2] = $$1; //@line 8583
  } else {
   $$0383 = $$2 << (($$0396 | 0) == 31 ? 0 : 25 - ($$0396 >>> 1) | 0); //@line 8591
   $$0384 = HEAP32[$276 >> 2] | 0; //@line 8591
   while (1) {
    if ((HEAP32[$$0384 + 4 >> 2] & -8 | 0) == ($$2 | 0)) {
     label = 124; //@line 8598
     break;
    }
    $299 = $$0384 + 16 + ($$0383 >>> 31 << 2) | 0; //@line 8602
    $301 = HEAP32[$299 >> 2] | 0; //@line 8604
    if (!$301) {
     label = 121; //@line 8607
     break;
    } else {
     $$0383 = $$0383 << 1; //@line 8610
     $$0384 = $301; //@line 8610
    }
   }
   if ((label | 0) == 121) {
    if ((HEAP32[1762] | 0) >>> 0 > $299 >>> 0) {
     _abort(); //@line 8617
    } else {
     HEAP32[$299 >> 2] = $$1; //@line 8620
     HEAP32[$$1 + 24 >> 2] = $$0384; //@line 8622
     HEAP32[$$1 + 12 >> 2] = $$1; //@line 8624
     HEAP32[$$1 + 8 >> 2] = $$1; //@line 8626
     break;
    }
   } else if ((label | 0) == 124) {
    $308 = $$0384 + 8 | 0; //@line 8631
    $309 = HEAP32[$308 >> 2] | 0; //@line 8632
    $310 = HEAP32[1762] | 0; //@line 8633
    if ($310 >>> 0 <= $309 >>> 0 & $310 >>> 0 <= $$0384 >>> 0) {
     HEAP32[$309 + 12 >> 2] = $$1; //@line 8639
     HEAP32[$308 >> 2] = $$1; //@line 8640
     HEAP32[$$1 + 8 >> 2] = $309; //@line 8642
     HEAP32[$$1 + 12 >> 2] = $$0384; //@line 8644
     HEAP32[$$1 + 24 >> 2] = 0; //@line 8646
     break;
    } else {
     _abort(); //@line 8649
    }
   }
  }
 } while (0);
 $319 = (HEAP32[1766] | 0) + -1 | 0; //@line 8656
 HEAP32[1766] = $319; //@line 8657
 if (!$319) {
  $$0212$in$i = 7488; //@line 8660
 } else {
  return;
 }
 while (1) {
  $$0212$i = HEAP32[$$0212$in$i >> 2] | 0; //@line 8665
  if (!$$0212$i) {
   break;
  } else {
   $$0212$in$i = $$0212$i + 8 | 0; //@line 8671
  }
 }
 HEAP32[1766] = -1; //@line 8674
 return;
}
function _dispose_chunk($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0419 = 0, $$0420 = 0, $$0431 = 0, $$0438 = 0, $$1 = 0, $$1418 = 0, $$1426 = 0, $$1429 = 0, $$1433 = 0, $$1437 = 0, $$2 = 0, $$3 = 0, $$3435 = 0, $$pre$phi23Z2D = 0, $$pre$phi25Z2D = 0, $$pre$phiZ2D = 0, $101 = 0, $102 = 0, $108 = 0, $11 = 0, $110 = 0, $111 = 0, $117 = 0, $12 = 0, $125 = 0, $13 = 0, $130 = 0, $131 = 0, $134 = 0, $136 = 0, $138 = 0, $151 = 0, $156 = 0, $158 = 0, $161 = 0, $163 = 0, $166 = 0, $169 = 0, $17 = 0, $170 = 0, $171 = 0, $173 = 0, $175 = 0, $176 = 0, $178 = 0, $179 = 0, $184 = 0, $185 = 0, $199 = 0, $2 = 0, $20 = 0, $202 = 0, $203 = 0, $209 = 0, $22 = 0, $224 = 0, $227 = 0, $228 = 0, $229 = 0, $233 = 0, $234 = 0, $24 = 0, $240 = 0, $245 = 0, $246 = 0, $249 = 0, $251 = 0, $254 = 0, $259 = 0, $265 = 0, $269 = 0, $270 = 0, $288 = 0, $290 = 0, $297 = 0, $298 = 0, $299 = 0, $37 = 0, $4 = 0, $42 = 0, $44 = 0, $47 = 0, $49 = 0, $52 = 0, $55 = 0, $56 = 0, $57 = 0, $59 = 0, $61 = 0, $62 = 0, $64 = 0, $65 = 0, $7 = 0, $70 = 0, $71 = 0, $85 = 0, $88 = 0, $89 = 0, $95 = 0, label = 0;
 $2 = $0 + $1 | 0; //@line 9170
 $4 = HEAP32[$0 + 4 >> 2] | 0; //@line 9172
 L1 : do {
  if (!($4 & 1)) {
   $7 = HEAP32[$0 >> 2] | 0; //@line 9177
   if (!($4 & 3)) {
    return;
   }
   $11 = $0 + (0 - $7) | 0; //@line 9184
   $12 = $7 + $1 | 0; //@line 9185
   $13 = HEAP32[1762] | 0; //@line 9186
   if ($11 >>> 0 < $13 >>> 0) {
    _abort(); //@line 9189
   }
   if ((HEAP32[1763] | 0) == ($11 | 0)) {
    $101 = $2 + 4 | 0; //@line 9195
    $102 = HEAP32[$101 >> 2] | 0; //@line 9196
    if (($102 & 3 | 0) != 3) {
     $$1 = $11; //@line 9200
     $$1418 = $12; //@line 9200
     break;
    }
    HEAP32[1760] = $12; //@line 9203
    HEAP32[$101 >> 2] = $102 & -2; //@line 9205
    HEAP32[$11 + 4 >> 2] = $12 | 1; //@line 9208
    HEAP32[$2 >> 2] = $12; //@line 9209
    return;
   }
   $17 = $7 >>> 3; //@line 9212
   if ($7 >>> 0 < 256) {
    $20 = HEAP32[$11 + 8 >> 2] | 0; //@line 9216
    $22 = HEAP32[$11 + 12 >> 2] | 0; //@line 9218
    $24 = 7072 + ($17 << 1 << 2) | 0; //@line 9220
    if (($20 | 0) != ($24 | 0)) {
     if ($13 >>> 0 > $20 >>> 0) {
      _abort(); //@line 9225
     }
     if ((HEAP32[$20 + 12 >> 2] | 0) != ($11 | 0)) {
      _abort(); //@line 9232
     }
    }
    if (($22 | 0) == ($20 | 0)) {
     HEAP32[1758] = HEAP32[1758] & ~(1 << $17); //@line 9242
     $$1 = $11; //@line 9243
     $$1418 = $12; //@line 9243
     break;
    }
    if (($22 | 0) == ($24 | 0)) {
     $$pre$phi25Z2D = $22 + 8 | 0; //@line 9249
    } else {
     if ($13 >>> 0 > $22 >>> 0) {
      _abort(); //@line 9253
     }
     $37 = $22 + 8 | 0; //@line 9256
     if ((HEAP32[$37 >> 2] | 0) == ($11 | 0)) {
      $$pre$phi25Z2D = $37; //@line 9260
     } else {
      _abort(); //@line 9262
     }
    }
    HEAP32[$20 + 12 >> 2] = $22; //@line 9267
    HEAP32[$$pre$phi25Z2D >> 2] = $20; //@line 9268
    $$1 = $11; //@line 9269
    $$1418 = $12; //@line 9269
    break;
   }
   $42 = HEAP32[$11 + 24 >> 2] | 0; //@line 9273
   $44 = HEAP32[$11 + 12 >> 2] | 0; //@line 9275
   do {
    if (($44 | 0) == ($11 | 0)) {
     $55 = $11 + 16 | 0; //@line 9279
     $56 = $55 + 4 | 0; //@line 9280
     $57 = HEAP32[$56 >> 2] | 0; //@line 9281
     if (!$57) {
      $59 = HEAP32[$55 >> 2] | 0; //@line 9284
      if (!$59) {
       $$3 = 0; //@line 9287
       break;
      } else {
       $$1426 = $59; //@line 9290
       $$1429 = $55; //@line 9290
      }
     } else {
      $$1426 = $57; //@line 9293
      $$1429 = $56; //@line 9293
     }
     while (1) {
      $61 = $$1426 + 20 | 0; //@line 9296
      $62 = HEAP32[$61 >> 2] | 0; //@line 9297
      if ($62 | 0) {
       $$1426 = $62; //@line 9300
       $$1429 = $61; //@line 9300
       continue;
      }
      $64 = $$1426 + 16 | 0; //@line 9303
      $65 = HEAP32[$64 >> 2] | 0; //@line 9304
      if (!$65) {
       break;
      } else {
       $$1426 = $65; //@line 9309
       $$1429 = $64; //@line 9309
      }
     }
     if ($13 >>> 0 > $$1429 >>> 0) {
      _abort(); //@line 9314
     } else {
      HEAP32[$$1429 >> 2] = 0; //@line 9317
      $$3 = $$1426; //@line 9318
      break;
     }
    } else {
     $47 = HEAP32[$11 + 8 >> 2] | 0; //@line 9323
     if ($13 >>> 0 > $47 >>> 0) {
      _abort(); //@line 9326
     }
     $49 = $47 + 12 | 0; //@line 9329
     if ((HEAP32[$49 >> 2] | 0) != ($11 | 0)) {
      _abort(); //@line 9333
     }
     $52 = $44 + 8 | 0; //@line 9336
     if ((HEAP32[$52 >> 2] | 0) == ($11 | 0)) {
      HEAP32[$49 >> 2] = $44; //@line 9340
      HEAP32[$52 >> 2] = $47; //@line 9341
      $$3 = $44; //@line 9342
      break;
     } else {
      _abort(); //@line 9345
     }
    }
   } while (0);
   if (!$42) {
    $$1 = $11; //@line 9352
    $$1418 = $12; //@line 9352
   } else {
    $70 = HEAP32[$11 + 28 >> 2] | 0; //@line 9355
    $71 = 7336 + ($70 << 2) | 0; //@line 9356
    do {
     if ((HEAP32[$71 >> 2] | 0) == ($11 | 0)) {
      HEAP32[$71 >> 2] = $$3; //@line 9361
      if (!$$3) {
       HEAP32[1759] = HEAP32[1759] & ~(1 << $70); //@line 9368
       $$1 = $11; //@line 9369
       $$1418 = $12; //@line 9369
       break L1;
      }
     } else {
      if ((HEAP32[1762] | 0) >>> 0 > $42 >>> 0) {
       _abort(); //@line 9376
      } else {
       HEAP32[$42 + 16 + (((HEAP32[$42 + 16 >> 2] | 0) != ($11 | 0) & 1) << 2) >> 2] = $$3; //@line 9384
       if (!$$3) {
        $$1 = $11; //@line 9387
        $$1418 = $12; //@line 9387
        break L1;
       } else {
        break;
       }
      }
     }
    } while (0);
    $85 = HEAP32[1762] | 0; //@line 9395
    if ($85 >>> 0 > $$3 >>> 0) {
     _abort(); //@line 9398
    }
    HEAP32[$$3 + 24 >> 2] = $42; //@line 9402
    $88 = $11 + 16 | 0; //@line 9403
    $89 = HEAP32[$88 >> 2] | 0; //@line 9404
    do {
     if ($89 | 0) {
      if ($85 >>> 0 > $89 >>> 0) {
       _abort(); //@line 9410
      } else {
       HEAP32[$$3 + 16 >> 2] = $89; //@line 9414
       HEAP32[$89 + 24 >> 2] = $$3; //@line 9416
       break;
      }
     }
    } while (0);
    $95 = HEAP32[$88 + 4 >> 2] | 0; //@line 9422
    if (!$95) {
     $$1 = $11; //@line 9425
     $$1418 = $12; //@line 9425
    } else {
     if ((HEAP32[1762] | 0) >>> 0 > $95 >>> 0) {
      _abort(); //@line 9430
     } else {
      HEAP32[$$3 + 20 >> 2] = $95; //@line 9434
      HEAP32[$95 + 24 >> 2] = $$3; //@line 9436
      $$1 = $11; //@line 9437
      $$1418 = $12; //@line 9437
      break;
     }
    }
   }
  } else {
   $$1 = $0; //@line 9443
   $$1418 = $1; //@line 9443
  }
 } while (0);
 $108 = HEAP32[1762] | 0; //@line 9446
 if ($2 >>> 0 < $108 >>> 0) {
  _abort(); //@line 9449
 }
 $110 = $2 + 4 | 0; //@line 9452
 $111 = HEAP32[$110 >> 2] | 0; //@line 9453
 if (!($111 & 2)) {
  if ((HEAP32[1764] | 0) == ($2 | 0)) {
   $117 = (HEAP32[1761] | 0) + $$1418 | 0; //@line 9461
   HEAP32[1761] = $117; //@line 9462
   HEAP32[1764] = $$1; //@line 9463
   HEAP32[$$1 + 4 >> 2] = $117 | 1; //@line 9466
   if (($$1 | 0) != (HEAP32[1763] | 0)) {
    return;
   }
   HEAP32[1763] = 0; //@line 9472
   HEAP32[1760] = 0; //@line 9473
   return;
  }
  if ((HEAP32[1763] | 0) == ($2 | 0)) {
   $125 = (HEAP32[1760] | 0) + $$1418 | 0; //@line 9480
   HEAP32[1760] = $125; //@line 9481
   HEAP32[1763] = $$1; //@line 9482
   HEAP32[$$1 + 4 >> 2] = $125 | 1; //@line 9485
   HEAP32[$$1 + $125 >> 2] = $125; //@line 9487
   return;
  }
  $130 = ($111 & -8) + $$1418 | 0; //@line 9491
  $131 = $111 >>> 3; //@line 9492
  L96 : do {
   if ($111 >>> 0 < 256) {
    $134 = HEAP32[$2 + 8 >> 2] | 0; //@line 9497
    $136 = HEAP32[$2 + 12 >> 2] | 0; //@line 9499
    $138 = 7072 + ($131 << 1 << 2) | 0; //@line 9501
    if (($134 | 0) != ($138 | 0)) {
     if ($108 >>> 0 > $134 >>> 0) {
      _abort(); //@line 9506
     }
     if ((HEAP32[$134 + 12 >> 2] | 0) != ($2 | 0)) {
      _abort(); //@line 9513
     }
    }
    if (($136 | 0) == ($134 | 0)) {
     HEAP32[1758] = HEAP32[1758] & ~(1 << $131); //@line 9523
     break;
    }
    if (($136 | 0) == ($138 | 0)) {
     $$pre$phi23Z2D = $136 + 8 | 0; //@line 9529
    } else {
     if ($108 >>> 0 > $136 >>> 0) {
      _abort(); //@line 9533
     }
     $151 = $136 + 8 | 0; //@line 9536
     if ((HEAP32[$151 >> 2] | 0) == ($2 | 0)) {
      $$pre$phi23Z2D = $151; //@line 9540
     } else {
      _abort(); //@line 9542
     }
    }
    HEAP32[$134 + 12 >> 2] = $136; //@line 9547
    HEAP32[$$pre$phi23Z2D >> 2] = $134; //@line 9548
   } else {
    $156 = HEAP32[$2 + 24 >> 2] | 0; //@line 9551
    $158 = HEAP32[$2 + 12 >> 2] | 0; //@line 9553
    do {
     if (($158 | 0) == ($2 | 0)) {
      $169 = $2 + 16 | 0; //@line 9557
      $170 = $169 + 4 | 0; //@line 9558
      $171 = HEAP32[$170 >> 2] | 0; //@line 9559
      if (!$171) {
       $173 = HEAP32[$169 >> 2] | 0; //@line 9562
       if (!$173) {
        $$3435 = 0; //@line 9565
        break;
       } else {
        $$1433 = $173; //@line 9568
        $$1437 = $169; //@line 9568
       }
      } else {
       $$1433 = $171; //@line 9571
       $$1437 = $170; //@line 9571
      }
      while (1) {
       $175 = $$1433 + 20 | 0; //@line 9574
       $176 = HEAP32[$175 >> 2] | 0; //@line 9575
       if ($176 | 0) {
        $$1433 = $176; //@line 9578
        $$1437 = $175; //@line 9578
        continue;
       }
       $178 = $$1433 + 16 | 0; //@line 9581
       $179 = HEAP32[$178 >> 2] | 0; //@line 9582
       if (!$179) {
        break;
       } else {
        $$1433 = $179; //@line 9587
        $$1437 = $178; //@line 9587
       }
      }
      if ($108 >>> 0 > $$1437 >>> 0) {
       _abort(); //@line 9592
      } else {
       HEAP32[$$1437 >> 2] = 0; //@line 9595
       $$3435 = $$1433; //@line 9596
       break;
      }
     } else {
      $161 = HEAP32[$2 + 8 >> 2] | 0; //@line 9601
      if ($108 >>> 0 > $161 >>> 0) {
       _abort(); //@line 9604
      }
      $163 = $161 + 12 | 0; //@line 9607
      if ((HEAP32[$163 >> 2] | 0) != ($2 | 0)) {
       _abort(); //@line 9611
      }
      $166 = $158 + 8 | 0; //@line 9614
      if ((HEAP32[$166 >> 2] | 0) == ($2 | 0)) {
       HEAP32[$163 >> 2] = $158; //@line 9618
       HEAP32[$166 >> 2] = $161; //@line 9619
       $$3435 = $158; //@line 9620
       break;
      } else {
       _abort(); //@line 9623
      }
     }
    } while (0);
    if ($156 | 0) {
     $184 = HEAP32[$2 + 28 >> 2] | 0; //@line 9631
     $185 = 7336 + ($184 << 2) | 0; //@line 9632
     do {
      if ((HEAP32[$185 >> 2] | 0) == ($2 | 0)) {
       HEAP32[$185 >> 2] = $$3435; //@line 9637
       if (!$$3435) {
        HEAP32[1759] = HEAP32[1759] & ~(1 << $184); //@line 9644
        break L96;
       }
      } else {
       if ((HEAP32[1762] | 0) >>> 0 > $156 >>> 0) {
        _abort(); //@line 9651
       } else {
        HEAP32[$156 + 16 + (((HEAP32[$156 + 16 >> 2] | 0) != ($2 | 0) & 1) << 2) >> 2] = $$3435; //@line 9659
        if (!$$3435) {
         break L96;
        } else {
         break;
        }
       }
      }
     } while (0);
     $199 = HEAP32[1762] | 0; //@line 9669
     if ($199 >>> 0 > $$3435 >>> 0) {
      _abort(); //@line 9672
     }
     HEAP32[$$3435 + 24 >> 2] = $156; //@line 9676
     $202 = $2 + 16 | 0; //@line 9677
     $203 = HEAP32[$202 >> 2] | 0; //@line 9678
     do {
      if ($203 | 0) {
       if ($199 >>> 0 > $203 >>> 0) {
        _abort(); //@line 9684
       } else {
        HEAP32[$$3435 + 16 >> 2] = $203; //@line 9688
        HEAP32[$203 + 24 >> 2] = $$3435; //@line 9690
        break;
       }
      }
     } while (0);
     $209 = HEAP32[$202 + 4 >> 2] | 0; //@line 9696
     if ($209 | 0) {
      if ((HEAP32[1762] | 0) >>> 0 > $209 >>> 0) {
       _abort(); //@line 9702
      } else {
       HEAP32[$$3435 + 20 >> 2] = $209; //@line 9706
       HEAP32[$209 + 24 >> 2] = $$3435; //@line 9708
       break;
      }
     }
    }
   }
  } while (0);
  HEAP32[$$1 + 4 >> 2] = $130 | 1; //@line 9717
  HEAP32[$$1 + $130 >> 2] = $130; //@line 9719
  if (($$1 | 0) == (HEAP32[1763] | 0)) {
   HEAP32[1760] = $130; //@line 9723
   return;
  } else {
   $$2 = $130; //@line 9726
  }
 } else {
  HEAP32[$110 >> 2] = $111 & -2; //@line 9730
  HEAP32[$$1 + 4 >> 2] = $$1418 | 1; //@line 9733
  HEAP32[$$1 + $$1418 >> 2] = $$1418; //@line 9735
  $$2 = $$1418; //@line 9736
 }
 $224 = $$2 >>> 3; //@line 9738
 if ($$2 >>> 0 < 256) {
  $227 = 7072 + ($224 << 1 << 2) | 0; //@line 9742
  $228 = HEAP32[1758] | 0; //@line 9743
  $229 = 1 << $224; //@line 9744
  if (!($228 & $229)) {
   HEAP32[1758] = $228 | $229; //@line 9749
   $$0438 = $227; //@line 9751
   $$pre$phiZ2D = $227 + 8 | 0; //@line 9751
  } else {
   $233 = $227 + 8 | 0; //@line 9753
   $234 = HEAP32[$233 >> 2] | 0; //@line 9754
   if ((HEAP32[1762] | 0) >>> 0 > $234 >>> 0) {
    _abort(); //@line 9758
   } else {
    $$0438 = $234; //@line 9761
    $$pre$phiZ2D = $233; //@line 9761
   }
  }
  HEAP32[$$pre$phiZ2D >> 2] = $$1; //@line 9764
  HEAP32[$$0438 + 12 >> 2] = $$1; //@line 9766
  HEAP32[$$1 + 8 >> 2] = $$0438; //@line 9768
  HEAP32[$$1 + 12 >> 2] = $227; //@line 9770
  return;
 }
 $240 = $$2 >>> 8; //@line 9773
 if (!$240) {
  $$0431 = 0; //@line 9776
 } else {
  if ($$2 >>> 0 > 16777215) {
   $$0431 = 31; //@line 9780
  } else {
   $245 = ($240 + 1048320 | 0) >>> 16 & 8; //@line 9784
   $246 = $240 << $245; //@line 9785
   $249 = ($246 + 520192 | 0) >>> 16 & 4; //@line 9788
   $251 = $246 << $249; //@line 9790
   $254 = ($251 + 245760 | 0) >>> 16 & 2; //@line 9793
   $259 = 14 - ($249 | $245 | $254) + ($251 << $254 >>> 15) | 0; //@line 9798
   $$0431 = $$2 >>> ($259 + 7 | 0) & 1 | $259 << 1; //@line 9804
  }
 }
 $265 = 7336 + ($$0431 << 2) | 0; //@line 9807
 HEAP32[$$1 + 28 >> 2] = $$0431; //@line 9809
 HEAP32[$$1 + 20 >> 2] = 0; //@line 9812
 HEAP32[$$1 + 16 >> 2] = 0; //@line 9813
 $269 = HEAP32[1759] | 0; //@line 9814
 $270 = 1 << $$0431; //@line 9815
 if (!($269 & $270)) {
  HEAP32[1759] = $269 | $270; //@line 9820
  HEAP32[$265 >> 2] = $$1; //@line 9821
  HEAP32[$$1 + 24 >> 2] = $265; //@line 9823
  HEAP32[$$1 + 12 >> 2] = $$1; //@line 9825
  HEAP32[$$1 + 8 >> 2] = $$1; //@line 9827
  return;
 }
 $$0419 = $$2 << (($$0431 | 0) == 31 ? 0 : 25 - ($$0431 >>> 1) | 0); //@line 9836
 $$0420 = HEAP32[$265 >> 2] | 0; //@line 9836
 while (1) {
  if ((HEAP32[$$0420 + 4 >> 2] & -8 | 0) == ($$2 | 0)) {
   label = 121; //@line 9843
   break;
  }
  $288 = $$0420 + 16 + ($$0419 >>> 31 << 2) | 0; //@line 9847
  $290 = HEAP32[$288 >> 2] | 0; //@line 9849
  if (!$290) {
   label = 118; //@line 9852
   break;
  } else {
   $$0419 = $$0419 << 1; //@line 9855
   $$0420 = $290; //@line 9855
  }
 }
 if ((label | 0) == 118) {
  if ((HEAP32[1762] | 0) >>> 0 > $288 >>> 0) {
   _abort(); //@line 9862
  }
  HEAP32[$288 >> 2] = $$1; //@line 9865
  HEAP32[$$1 + 24 >> 2] = $$0420; //@line 9867
  HEAP32[$$1 + 12 >> 2] = $$1; //@line 9869
  HEAP32[$$1 + 8 >> 2] = $$1; //@line 9871
  return;
 } else if ((label | 0) == 121) {
  $297 = $$0420 + 8 | 0; //@line 9875
  $298 = HEAP32[$297 >> 2] | 0; //@line 9876
  $299 = HEAP32[1762] | 0; //@line 9877
  if (!($299 >>> 0 <= $298 >>> 0 & $299 >>> 0 <= $$0420 >>> 0)) {
   _abort(); //@line 9882
  }
  HEAP32[$298 + 12 >> 2] = $$1; //@line 9886
  HEAP32[$297 >> 2] = $$1; //@line 9887
  HEAP32[$$1 + 8 >> 2] = $298; //@line 9889
  HEAP32[$$1 + 12 >> 2] = $$0420; //@line 9891
  HEAP32[$$1 + 24 >> 2] = 0; //@line 9893
  return;
 }
}
function ___intscan($0, $1, $2, $3, $4) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 var $$0154222 = 0, $$0157 = 0, $$0159 = 0, $$1155192 = 0, $$1158 = 0, $$1160 = 0, $$1160169 = 0, $$1165 = 0, $$1165167 = 0, $$1165168 = 0, $$166 = 0, $$2156210 = 0, $$2161$be = 0, $$2161$lcssa = 0, $$3162$be = 0, $$3162215 = 0, $$4163$be = 0, $$4163$lcssa = 0, $$5$be = 0, $$6$be = 0, $$6$lcssa = 0, $$7$be = 0, $$7198 = 0, $$8 = 0, $$9$be = 0, $104 = 0, $123 = 0, $124 = 0, $131 = 0, $133 = 0, $134 = 0, $138 = 0, $139 = 0, $147 = 0, $152 = 0, $153 = 0, $155 = 0, $158 = 0, $16 = 0, $160 = 0, $164 = 0, $165 = 0, $166 = 0, $167 = 0, $169 = 0, $170 = 0, $171 = 0, $189 = 0, $190 = 0, $198 = 0, $20 = 0, $204 = 0, $206 = 0, $207 = 0, $209 = 0, $21 = 0, $211 = 0, $215 = 0, $216 = 0, $217 = 0, $218 = 0, $225 = 0, $226 = 0, $227 = 0, $242 = 0, $263 = 0, $265 = 0, $275 = 0, $28 = 0, $284 = 0, $287 = 0, $289 = 0, $290 = 0, $291 = 0, $292 = 0, $293 = 0, $294 = 0, $295 = 0, $296 = 0, $32 = 0, $40 = 0, $42 = 0, $50 = 0, $54 = 0, $6 = 0, $7 = 0, $70 = 0, $74 = 0, $75 = 0, $86 = 0, $88 = 0, $89 = 0, $9 = 0, $90 = 0, $91 = 0, $93 = 0, $94 = 0, $96 = 0, label = 0;
 L1 : do {
  if ($1 >>> 0 > 36) {
   HEAP32[(___errno_location() | 0) >> 2] = 22; //@line 183
   $289 = 0; //@line 184
   $290 = 0; //@line 184
  } else {
   $6 = $0 + 4 | 0; //@line 186
   $7 = $0 + 100 | 0; //@line 187
   do {
    $9 = HEAP32[$6 >> 2] | 0; //@line 189
    if ($9 >>> 0 < (HEAP32[$7 >> 2] | 0) >>> 0) {
     HEAP32[$6 >> 2] = $9 + 1; //@line 194
     $16 = HEAPU8[$9 >> 0] | 0; //@line 197
    } else {
     $16 = ___shgetc($0) | 0; //@line 200
    }
   } while ((_isspace($16) | 0) != 0);
   L11 : do {
    switch ($16 | 0) {
    case 43:
    case 45:
     {
      $20 = (($16 | 0) == 45) << 31 >> 31; //@line 212
      $21 = HEAP32[$6 >> 2] | 0; //@line 213
      if ($21 >>> 0 < (HEAP32[$7 >> 2] | 0) >>> 0) {
       HEAP32[$6 >> 2] = $21 + 1; //@line 218
       $$0157 = $20; //@line 221
       $$0159 = HEAPU8[$21 >> 0] | 0; //@line 221
       break L11;
      } else {
       $$0157 = $20; //@line 225
       $$0159 = ___shgetc($0) | 0; //@line 225
       break L11;
      }
      break;
     }
    default:
     {
      $$0157 = 0; //@line 231
      $$0159 = $16; //@line 231
     }
    }
   } while (0);
   $28 = ($1 | 0) == 0; //@line 235
   do {
    if (($1 | 16 | 0) == 16 & ($$0159 | 0) == 48) {
     $32 = HEAP32[$6 >> 2] | 0; //@line 242
     if ($32 >>> 0 < (HEAP32[$7 >> 2] | 0) >>> 0) {
      HEAP32[$6 >> 2] = $32 + 1; //@line 247
      $40 = HEAPU8[$32 >> 0] | 0; //@line 250
     } else {
      $40 = ___shgetc($0) | 0; //@line 253
     }
     if (($40 | 32 | 0) != 120) {
      if ($28) {
       $$1160169 = $40; //@line 259
       $$1165167 = 8; //@line 259
       label = 46; //@line 260
       break;
      } else {
       $$1160 = $40; //@line 263
       $$1165 = $1; //@line 263
       label = 32; //@line 264
       break;
      }
     }
     $42 = HEAP32[$6 >> 2] | 0; //@line 268
     if ($42 >>> 0 < (HEAP32[$7 >> 2] | 0) >>> 0) {
      HEAP32[$6 >> 2] = $42 + 1; //@line 273
      $50 = HEAPU8[$42 >> 0] | 0; //@line 276
     } else {
      $50 = ___shgetc($0) | 0; //@line 279
     }
     if ((HEAPU8[3760 + $50 >> 0] | 0) > 15) {
      $54 = (HEAP32[$7 >> 2] | 0) == 0; //@line 286
      if (!$54) {
       HEAP32[$6 >> 2] = (HEAP32[$6 >> 2] | 0) + -1; //@line 290
      }
      if (!$2) {
       ___shlim($0, 0); //@line 294
       $289 = 0; //@line 295
       $290 = 0; //@line 295
       break L1;
      }
      if ($54) {
       $289 = 0; //@line 299
       $290 = 0; //@line 299
       break L1;
      }
      HEAP32[$6 >> 2] = (HEAP32[$6 >> 2] | 0) + -1; //@line 304
      $289 = 0; //@line 305
      $290 = 0; //@line 305
      break L1;
     } else {
      $$1160169 = $50; //@line 308
      $$1165167 = 16; //@line 308
      label = 46; //@line 309
     }
    } else {
     $$166 = $28 ? 10 : $1; //@line 312
     if ($$166 >>> 0 > (HEAPU8[3760 + $$0159 >> 0] | 0) >>> 0) {
      $$1160 = $$0159; //@line 318
      $$1165 = $$166; //@line 318
      label = 32; //@line 319
     } else {
      if (HEAP32[$7 >> 2] | 0) {
       HEAP32[$6 >> 2] = (HEAP32[$6 >> 2] | 0) + -1; //@line 326
      }
      ___shlim($0, 0); //@line 328
      HEAP32[(___errno_location() | 0) >> 2] = 22; //@line 330
      $289 = 0; //@line 331
      $290 = 0; //@line 331
      break L1;
     }
    }
   } while (0);
   L43 : do {
    if ((label | 0) == 32) {
     if (($$1165 | 0) == 10) {
      $70 = $$1160 + -48 | 0; //@line 340
      if ($70 >>> 0 < 10) {
       $$0154222 = 0; //@line 343
       $74 = $70; //@line 343
       do {
        $$0154222 = ($$0154222 * 10 | 0) + $74 | 0; //@line 346
        $75 = HEAP32[$6 >> 2] | 0; //@line 347
        if ($75 >>> 0 < (HEAP32[$7 >> 2] | 0) >>> 0) {
         HEAP32[$6 >> 2] = $75 + 1; //@line 352
         $$2161$be = HEAPU8[$75 >> 0] | 0; //@line 355
        } else {
         $$2161$be = ___shgetc($0) | 0; //@line 358
        }
        $74 = $$2161$be + -48 | 0; //@line 360
       } while ($74 >>> 0 < 10 & $$0154222 >>> 0 < 429496729);
       $$2161$lcssa = $$2161$be; //@line 370
       $291 = $$0154222; //@line 370
       $292 = 0; //@line 370
      } else {
       $$2161$lcssa = $$1160; //@line 372
       $291 = 0; //@line 372
       $292 = 0; //@line 372
      }
      $86 = $$2161$lcssa + -48 | 0; //@line 374
      if ($86 >>> 0 < 10) {
       $$3162215 = $$2161$lcssa; //@line 377
       $88 = $291; //@line 377
       $89 = $292; //@line 377
       $93 = $86; //@line 377
       while (1) {
        $90 = ___muldi3($88 | 0, $89 | 0, 10, 0) | 0; //@line 379
        $91 = tempRet0; //@line 380
        $94 = (($93 | 0) < 0) << 31 >> 31; //@line 382
        $96 = ~$94; //@line 384
        if ($91 >>> 0 > $96 >>> 0 | ($91 | 0) == ($96 | 0) & $90 >>> 0 > ~$93 >>> 0) {
         $$1165168 = 10; //@line 391
         $$8 = $$3162215; //@line 391
         $293 = $88; //@line 391
         $294 = $89; //@line 391
         label = 72; //@line 392
         break L43;
        }
        $88 = _i64Add($90 | 0, $91 | 0, $93 | 0, $94 | 0) | 0; //@line 395
        $89 = tempRet0; //@line 396
        $104 = HEAP32[$6 >> 2] | 0; //@line 397
        if ($104 >>> 0 < (HEAP32[$7 >> 2] | 0) >>> 0) {
         HEAP32[$6 >> 2] = $104 + 1; //@line 402
         $$3162$be = HEAPU8[$104 >> 0] | 0; //@line 405
        } else {
         $$3162$be = ___shgetc($0) | 0; //@line 408
        }
        $93 = $$3162$be + -48 | 0; //@line 410
        if (!($93 >>> 0 < 10 & ($89 >>> 0 < 429496729 | ($89 | 0) == 429496729 & $88 >>> 0 < 2576980378))) {
         break;
        } else {
         $$3162215 = $$3162$be; //@line 419
        }
       }
       if ($93 >>> 0 > 9) {
        $$1158 = $$0157; //@line 426
        $263 = $89; //@line 426
        $265 = $88; //@line 426
       } else {
        $$1165168 = 10; //@line 428
        $$8 = $$3162$be; //@line 428
        $293 = $88; //@line 428
        $294 = $89; //@line 428
        label = 72; //@line 429
       }
      } else {
       $$1158 = $$0157; //@line 432
       $263 = $292; //@line 432
       $265 = $291; //@line 432
      }
     } else {
      $$1160169 = $$1160; //@line 435
      $$1165167 = $$1165; //@line 435
      label = 46; //@line 436
     }
    }
   } while (0);
   L63 : do {
    if ((label | 0) == 46) {
     if (!($$1165167 + -1 & $$1165167)) {
      $131 = HEAP8[4016 + (($$1165167 * 23 | 0) >>> 5 & 7) >> 0] | 0; //@line 451
      $133 = HEAP8[3760 + $$1160169 >> 0] | 0; //@line 453
      $134 = $133 & 255; //@line 454
      if ($$1165167 >>> 0 > $134 >>> 0) {
       $$1155192 = 0; //@line 457
       $138 = $134; //@line 457
       do {
        $$1155192 = $138 | $$1155192 << $131; //@line 460
        $139 = HEAP32[$6 >> 2] | 0; //@line 461
        if ($139 >>> 0 < (HEAP32[$7 >> 2] | 0) >>> 0) {
         HEAP32[$6 >> 2] = $139 + 1; //@line 466
         $$4163$be = HEAPU8[$139 >> 0] | 0; //@line 469
        } else {
         $$4163$be = ___shgetc($0) | 0; //@line 472
        }
        $147 = HEAP8[3760 + $$4163$be >> 0] | 0; //@line 475
        $138 = $147 & 255; //@line 476
       } while ($$1155192 >>> 0 < 134217728 & $$1165167 >>> 0 > $138 >>> 0);
       $$4163$lcssa = $$4163$be; //@line 486
       $155 = $147; //@line 486
       $158 = 0; //@line 486
       $160 = $$1155192; //@line 486
      } else {
       $$4163$lcssa = $$1160169; //@line 488
       $155 = $133; //@line 488
       $158 = 0; //@line 488
       $160 = 0; //@line 488
      }
      $152 = _bitshift64Lshr(-1, -1, $131 | 0) | 0; //@line 490
      $153 = tempRet0; //@line 491
      if ($$1165167 >>> 0 <= ($155 & 255) >>> 0 | ($153 >>> 0 < $158 >>> 0 | ($153 | 0) == ($158 | 0) & $152 >>> 0 < $160 >>> 0)) {
       $$1165168 = $$1165167; //@line 501
       $$8 = $$4163$lcssa; //@line 501
       $293 = $160; //@line 501
       $294 = $158; //@line 501
       label = 72; //@line 502
       break;
      } else {
       $164 = $160; //@line 505
       $165 = $158; //@line 505
       $169 = $155; //@line 505
      }
      while (1) {
       $166 = _bitshift64Shl($164 | 0, $165 | 0, $131 | 0) | 0; //@line 508
       $167 = tempRet0; //@line 509
       $170 = $166 | $169 & 255; //@line 511
       $171 = HEAP32[$6 >> 2] | 0; //@line 512
       if ($171 >>> 0 < (HEAP32[$7 >> 2] | 0) >>> 0) {
        HEAP32[$6 >> 2] = $171 + 1; //@line 517
        $$5$be = HEAPU8[$171 >> 0] | 0; //@line 520
       } else {
        $$5$be = ___shgetc($0) | 0; //@line 523
       }
       $169 = HEAP8[3760 + $$5$be >> 0] | 0; //@line 526
       if ($$1165167 >>> 0 <= ($169 & 255) >>> 0 | ($167 >>> 0 > $153 >>> 0 | ($167 | 0) == ($153 | 0) & $170 >>> 0 > $152 >>> 0)) {
        $$1165168 = $$1165167; //@line 536
        $$8 = $$5$be; //@line 536
        $293 = $170; //@line 536
        $294 = $167; //@line 536
        label = 72; //@line 537
        break L63;
       } else {
        $164 = $170; //@line 540
        $165 = $167; //@line 540
       }
      }
     }
     $123 = HEAP8[3760 + $$1160169 >> 0] | 0; //@line 545
     $124 = $123 & 255; //@line 546
     if ($$1165167 >>> 0 > $124 >>> 0) {
      $$2156210 = 0; //@line 549
      $189 = $124; //@line 549
      do {
       $$2156210 = $189 + (Math_imul($$2156210, $$1165167) | 0) | 0; //@line 552
       $190 = HEAP32[$6 >> 2] | 0; //@line 553
       if ($190 >>> 0 < (HEAP32[$7 >> 2] | 0) >>> 0) {
        HEAP32[$6 >> 2] = $190 + 1; //@line 558
        $$6$be = HEAPU8[$190 >> 0] | 0; //@line 561
       } else {
        $$6$be = ___shgetc($0) | 0; //@line 564
       }
       $198 = HEAP8[3760 + $$6$be >> 0] | 0; //@line 567
       $189 = $198 & 255; //@line 568
      } while ($$2156210 >>> 0 < 119304647 & $$1165167 >>> 0 > $189 >>> 0);
      $$6$lcssa = $$6$be; //@line 578
      $204 = $198; //@line 578
      $295 = $$2156210; //@line 578
      $296 = 0; //@line 578
     } else {
      $$6$lcssa = $$1160169; //@line 580
      $204 = $123; //@line 580
      $295 = 0; //@line 580
      $296 = 0; //@line 580
     }
     if ($$1165167 >>> 0 > ($204 & 255) >>> 0) {
      $206 = ___udivdi3(-1, -1, $$1165167 | 0, 0) | 0; //@line 585
      $207 = tempRet0; //@line 586
      $$7198 = $$6$lcssa; //@line 587
      $209 = $296; //@line 587
      $211 = $295; //@line 587
      $218 = $204; //@line 587
      while (1) {
       if ($209 >>> 0 > $207 >>> 0 | ($209 | 0) == ($207 | 0) & $211 >>> 0 > $206 >>> 0) {
        $$1165168 = $$1165167; //@line 595
        $$8 = $$7198; //@line 595
        $293 = $211; //@line 595
        $294 = $209; //@line 595
        label = 72; //@line 596
        break L63;
       }
       $215 = ___muldi3($211 | 0, $209 | 0, $$1165167 | 0, 0) | 0; //@line 599
       $216 = tempRet0; //@line 600
       $217 = $218 & 255; //@line 601
       if ($216 >>> 0 > 4294967295 | ($216 | 0) == -1 & $215 >>> 0 > ~$217 >>> 0) {
        $$1165168 = $$1165167; //@line 609
        $$8 = $$7198; //@line 609
        $293 = $211; //@line 609
        $294 = $209; //@line 609
        label = 72; //@line 610
        break L63;
       }
       $225 = _i64Add($215 | 0, $216 | 0, $217 | 0, 0) | 0; //@line 613
       $226 = tempRet0; //@line 614
       $227 = HEAP32[$6 >> 2] | 0; //@line 615
       if ($227 >>> 0 < (HEAP32[$7 >> 2] | 0) >>> 0) {
        HEAP32[$6 >> 2] = $227 + 1; //@line 620
        $$7$be = HEAPU8[$227 >> 0] | 0; //@line 623
       } else {
        $$7$be = ___shgetc($0) | 0; //@line 626
       }
       $218 = HEAP8[3760 + $$7$be >> 0] | 0; //@line 629
       if ($$1165167 >>> 0 <= ($218 & 255) >>> 0) {
        $$1165168 = $$1165167; //@line 635
        $$8 = $$7$be; //@line 635
        $293 = $225; //@line 635
        $294 = $226; //@line 635
        label = 72; //@line 636
        break;
       } else {
        $$7198 = $$7$be; //@line 633
        $209 = $226; //@line 633
        $211 = $225; //@line 633
       }
      }
     } else {
      $$1165168 = $$1165167; //@line 641
      $$8 = $$6$lcssa; //@line 641
      $293 = $295; //@line 641
      $294 = $296; //@line 641
      label = 72; //@line 642
     }
    }
   } while (0);
   if ((label | 0) == 72) {
    if ($$1165168 >>> 0 > (HEAPU8[3760 + $$8 >> 0] | 0) >>> 0) {
     do {
      $242 = HEAP32[$6 >> 2] | 0; //@line 653
      if ($242 >>> 0 < (HEAP32[$7 >> 2] | 0) >>> 0) {
       HEAP32[$6 >> 2] = $242 + 1; //@line 658
       $$9$be = HEAPU8[$242 >> 0] | 0; //@line 661
      } else {
       $$9$be = ___shgetc($0) | 0; //@line 664
      }
     } while ($$1165168 >>> 0 > (HEAPU8[3760 + $$9$be >> 0] | 0) >>> 0);
     HEAP32[(___errno_location() | 0) >> 2] = 34; //@line 675
     $$1158 = ($3 & 1 | 0) == 0 & 0 == 0 ? $$0157 : 0; //@line 681
     $263 = $4; //@line 681
     $265 = $3; //@line 681
    } else {
     $$1158 = $$0157; //@line 683
     $263 = $294; //@line 683
     $265 = $293; //@line 683
    }
   }
   if (HEAP32[$7 >> 2] | 0) {
    HEAP32[$6 >> 2] = (HEAP32[$6 >> 2] | 0) + -1; //@line 691
   }
   if (!($263 >>> 0 < $4 >>> 0 | ($263 | 0) == ($4 | 0) & $265 >>> 0 < $3 >>> 0)) {
    if (!(($3 & 1 | 0) != 0 | 0 != 0 | ($$1158 | 0) != 0)) {
     HEAP32[(___errno_location() | 0) >> 2] = 34; //@line 707
     $275 = _i64Add($3 | 0, $4 | 0, -1, -1) | 0; //@line 708
     $289 = tempRet0; //@line 710
     $290 = $275; //@line 710
     break;
    }
    if ($263 >>> 0 > $4 >>> 0 | ($263 | 0) == ($4 | 0) & $265 >>> 0 > $3 >>> 0) {
     HEAP32[(___errno_location() | 0) >> 2] = 34; //@line 720
     $289 = $4; //@line 721
     $290 = $3; //@line 721
     break;
    }
   }
   $284 = (($$1158 | 0) < 0) << 31 >> 31; //@line 726
   $287 = _i64Subtract($265 ^ $$1158 | 0, $263 ^ $284 | 0, $$1158 | 0, $284 | 0) | 0; //@line 729
   $289 = tempRet0; //@line 731
   $290 = $287; //@line 731
  }
 } while (0);
 tempRet0 = $289; //@line 734
 return $290 | 0; //@line 735
}
function __ZL24nsapi_dns_query_multipleP12NetworkStackPKcP10nsapi_addrj13nsapi_version__async_cb_71($0) {
 $0 = $0 | 0;
 var $$0 = 0, $$019$i$1 = 0, $$089$i = 0, $$090117$i = 0, $$093119$i = 0, $$094116$i = 0, $$095115$i = 0, $$1$i = 0, $$196$i = 0, $$355 = 0, $$byval_copy = 0, $$lcssa$i = 0, $10 = 0, $101 = 0, $109 = 0, $12 = 0, $120 = 0, $125 = 0, $126 = 0, $128 = 0, $14 = 0, $16 = 0, $18 = 0, $2 = 0, $20 = 0, $203 = 0, $204 = 0, $205 = 0, $206 = 0, $208 = 0, $210 = 0, $211 = 0, $212 = 0, $213 = 0, $22 = 0, $223 = 0, $230 = 0, $231 = 0, $232 = 0, $233 = 0, $234 = 0, $235 = 0, $236 = 0, $237 = 0, $238 = 0, $239 = 0, $24 = 0, $240 = 0, $241 = 0, $242 = 0, $243 = 0, $244 = 0, $245 = 0, $246 = 0, $247 = 0, $248 = 0, $249 = 0, $251 = 0, $26 = 0, $28 = 0, $30 = 0, $32 = 0, $34 = 0, $36 = 0, $38 = 0, $4 = 0, $56 = 0, $6 = 0, $62 = 0, $69 = 0, $70 = 0, $75 = 0, $77 = 0, $78 = 0, $8 = 0, $81 = 0, $85 = 0, $86 = 0, $90 = 0, $93 = 0, $95 = 0, $96 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx12 = 0, $ReallocAsyncCtx9 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 1024
 STACKTOP = STACKTOP + 32 | 0; //@line 1025
 $$byval_copy = sp; //@line 1026
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 1028
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 1030
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 1032
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 1034
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 1036
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 1038
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 1040
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 1042
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 1044
 $20 = HEAP32[$0 + 40 >> 2] | 0; //@line 1046
 $22 = HEAP32[$0 + 44 >> 2] | 0; //@line 1048
 $24 = HEAP32[$0 + 48 >> 2] | 0; //@line 1050
 $26 = HEAP32[$0 + 52 >> 2] | 0; //@line 1052
 $28 = HEAP32[$0 + 56 >> 2] | 0; //@line 1054
 $30 = HEAP32[$0 + 60 >> 2] | 0; //@line 1056
 $32 = HEAP8[$0 + 64 >> 0] | 0; //@line 1058
 $34 = HEAP32[$0 + 68 >> 2] | 0; //@line 1060
 $36 = HEAP32[$0 + 72 >> 2] | 0; //@line 1062
 $38 = HEAP32[$0 + 76 >> 2] | 0; //@line 1064
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 1066
 if (($AsyncRetVal | 0) == -3001) {
  HEAP8[$10 >> 0] = 0; //@line 1069
  HEAP8[$12 >> 0] = 1; //@line 1070
  HEAP8[$14 >> 0] = 1; //@line 1071
  HEAP8[$16 >> 0] = 0; //@line 1072
  HEAP8[$18 >> 0] = 0; //@line 1073
  HEAP8[$20 >> 0] = 1; //@line 1074
  HEAP8[$22 >> 0] = 0; //@line 1075
  HEAP8[$22 + 1 >> 0] = 0; //@line 1075
  HEAP8[$22 + 2 >> 0] = 0; //@line 1075
  HEAP8[$22 + 3 >> 0] = 0; //@line 1075
  HEAP8[$22 + 4 >> 0] = 0; //@line 1075
  HEAP8[$22 + 5 >> 0] = 0; //@line 1075
  if (!(HEAP8[$38 >> 0] | 0)) {
   $223 = $2; //@line 1079
  } else {
   $$019$i$1 = $38; //@line 1081
   $211 = $2; //@line 1081
   while (1) {
    $208 = _strcspn($$019$i$1, 4557) | 0; //@line 1083
    $210 = $211 + 1 | 0; //@line 1085
    HEAP8[$211 >> 0] = $208; //@line 1086
    $212 = $208 & 255; //@line 1087
    _memcpy($210 | 0, $$019$i$1 | 0, $212 | 0) | 0; //@line 1088
    $213 = $210 + $212 | 0; //@line 1089
    $$019$i$1 = $$019$i$1 + ($208 + ((HEAP8[$$019$i$1 + $208 >> 0] | 0) == 46 & 1)) | 0; //@line 1095
    if (!(HEAP8[$$019$i$1 >> 0] | 0)) {
     $223 = $213; //@line 1099
     break;
    } else {
     $211 = $213; //@line 1102
    }
   }
  }
  HEAP8[$223 >> 0] = 0; //@line 1107
  HEAP8[$223 + 1 >> 0] = 0; //@line 1109
  HEAP8[$223 + 2 >> 0] = $32; //@line 1111
  HEAP8[$223 + 3 >> 0] = 0; //@line 1113
  HEAP8[$223 + 4 >> 0] = 1; //@line 1114
  HEAP32[$$byval_copy >> 2] = HEAP32[129]; //@line 1115
  HEAP32[$$byval_copy + 4 >> 2] = HEAP32[130]; //@line 1115
  HEAP32[$$byval_copy + 8 >> 2] = HEAP32[131]; //@line 1115
  HEAP32[$$byval_copy + 12 >> 2] = HEAP32[132]; //@line 1115
  HEAP32[$$byval_copy + 16 >> 2] = HEAP32[133]; //@line 1115
  __ZN13SocketAddressC2E10nsapi_addrt($34, $$byval_copy, 53); //@line 1116
  $ReallocAsyncCtx9 = _emscripten_realloc_async_context(80) | 0; //@line 1120
  $230 = __ZN9UDPSocket6sendtoERK13SocketAddressPKvj($28, $34, $10, $223 + 5 - $36 | 0) | 0; //@line 1121
  if (___async) {
   HEAP32[$ReallocAsyncCtx9 >> 2] = 96; //@line 1124
   $231 = $ReallocAsyncCtx9 + 4 | 0; //@line 1125
   HEAP32[$231 >> 2] = $2; //@line 1126
   $232 = $ReallocAsyncCtx9 + 8 | 0; //@line 1127
   HEAP32[$232 >> 2] = $4; //@line 1128
   $233 = $ReallocAsyncCtx9 + 12 | 0; //@line 1129
   HEAP32[$233 >> 2] = $6; //@line 1130
   $234 = $ReallocAsyncCtx9 + 16 | 0; //@line 1131
   HEAP32[$234 >> 2] = $8; //@line 1132
   $235 = $ReallocAsyncCtx9 + 20 | 0; //@line 1133
   HEAP32[$235 >> 2] = $10; //@line 1134
   $236 = $ReallocAsyncCtx9 + 24 | 0; //@line 1135
   HEAP32[$236 >> 2] = $12; //@line 1136
   $237 = $ReallocAsyncCtx9 + 28 | 0; //@line 1137
   HEAP32[$237 >> 2] = $14; //@line 1138
   $238 = $ReallocAsyncCtx9 + 32 | 0; //@line 1139
   HEAP32[$238 >> 2] = $16; //@line 1140
   $239 = $ReallocAsyncCtx9 + 36 | 0; //@line 1141
   HEAP32[$239 >> 2] = $18; //@line 1142
   $240 = $ReallocAsyncCtx9 + 40 | 0; //@line 1143
   HEAP32[$240 >> 2] = $20; //@line 1144
   $241 = $ReallocAsyncCtx9 + 44 | 0; //@line 1145
   HEAP32[$241 >> 2] = $22; //@line 1146
   $242 = $ReallocAsyncCtx9 + 48 | 0; //@line 1147
   HEAP32[$242 >> 2] = $24; //@line 1148
   $243 = $ReallocAsyncCtx9 + 52 | 0; //@line 1149
   HEAP32[$243 >> 2] = $26; //@line 1150
   $244 = $ReallocAsyncCtx9 + 56 | 0; //@line 1151
   HEAP32[$244 >> 2] = $28; //@line 1152
   $245 = $ReallocAsyncCtx9 + 60 | 0; //@line 1153
   HEAP32[$245 >> 2] = $30; //@line 1154
   $246 = $ReallocAsyncCtx9 + 64 | 0; //@line 1155
   HEAP8[$246 >> 0] = $32; //@line 1156
   $247 = $ReallocAsyncCtx9 + 68 | 0; //@line 1157
   HEAP32[$247 >> 2] = $34; //@line 1158
   $248 = $ReallocAsyncCtx9 + 72 | 0; //@line 1159
   HEAP32[$248 >> 2] = $36; //@line 1160
   $249 = $ReallocAsyncCtx9 + 76 | 0; //@line 1161
   HEAP32[$249 >> 2] = $38; //@line 1162
   sp = STACKTOP; //@line 1163
   STACKTOP = sp; //@line 1164
   return;
  }
  HEAP32[___async_retval >> 2] = $230; //@line 1167
  ___async_unwind = 0; //@line 1168
  HEAP32[$ReallocAsyncCtx9 >> 2] = 96; //@line 1169
  $231 = $ReallocAsyncCtx9 + 4 | 0; //@line 1170
  HEAP32[$231 >> 2] = $2; //@line 1171
  $232 = $ReallocAsyncCtx9 + 8 | 0; //@line 1172
  HEAP32[$232 >> 2] = $4; //@line 1173
  $233 = $ReallocAsyncCtx9 + 12 | 0; //@line 1174
  HEAP32[$233 >> 2] = $6; //@line 1175
  $234 = $ReallocAsyncCtx9 + 16 | 0; //@line 1176
  HEAP32[$234 >> 2] = $8; //@line 1177
  $235 = $ReallocAsyncCtx9 + 20 | 0; //@line 1178
  HEAP32[$235 >> 2] = $10; //@line 1179
  $236 = $ReallocAsyncCtx9 + 24 | 0; //@line 1180
  HEAP32[$236 >> 2] = $12; //@line 1181
  $237 = $ReallocAsyncCtx9 + 28 | 0; //@line 1182
  HEAP32[$237 >> 2] = $14; //@line 1183
  $238 = $ReallocAsyncCtx9 + 32 | 0; //@line 1184
  HEAP32[$238 >> 2] = $16; //@line 1185
  $239 = $ReallocAsyncCtx9 + 36 | 0; //@line 1186
  HEAP32[$239 >> 2] = $18; //@line 1187
  $240 = $ReallocAsyncCtx9 + 40 | 0; //@line 1188
  HEAP32[$240 >> 2] = $20; //@line 1189
  $241 = $ReallocAsyncCtx9 + 44 | 0; //@line 1190
  HEAP32[$241 >> 2] = $22; //@line 1191
  $242 = $ReallocAsyncCtx9 + 48 | 0; //@line 1192
  HEAP32[$242 >> 2] = $24; //@line 1193
  $243 = $ReallocAsyncCtx9 + 52 | 0; //@line 1194
  HEAP32[$243 >> 2] = $26; //@line 1195
  $244 = $ReallocAsyncCtx9 + 56 | 0; //@line 1196
  HEAP32[$244 >> 2] = $28; //@line 1197
  $245 = $ReallocAsyncCtx9 + 60 | 0; //@line 1198
  HEAP32[$245 >> 2] = $30; //@line 1199
  $246 = $ReallocAsyncCtx9 + 64 | 0; //@line 1200
  HEAP8[$246 >> 0] = $32; //@line 1201
  $247 = $ReallocAsyncCtx9 + 68 | 0; //@line 1202
  HEAP32[$247 >> 2] = $34; //@line 1203
  $248 = $ReallocAsyncCtx9 + 72 | 0; //@line 1204
  HEAP32[$248 >> 2] = $36; //@line 1205
  $249 = $ReallocAsyncCtx9 + 76 | 0; //@line 1206
  HEAP32[$249 >> 2] = $38; //@line 1207
  sp = STACKTOP; //@line 1208
  STACKTOP = sp; //@line 1209
  return;
 }
 if (($AsyncRetVal | 0) < 0) {
  $$355 = $AsyncRetVal; //@line 1213
 } else {
  $56 = HEAPU8[$18 >> 0] << 8 | HEAPU8[$20 >> 0]; //@line 1229
  $62 = HEAPU8[$22 >> 0] << 8 | HEAPU8[$24 >> 0]; //@line 1235
  if (((HEAP8[$14 >> 0] & -8) << 24 >> 24 == -128 ? (HEAPU8[$10 >> 0] << 8 | HEAPU8[$12 >> 0] | 0) == 1 : 0) & (HEAP8[$16 >> 0] & 15) == 0) {
   if (!$56) {
    $251 = $2; //@line 1245
   } else {
    $$093119$i = 0; //@line 1247
    $70 = $2; //@line 1247
    while (1) {
     $69 = HEAP8[$70 >> 0] | 0; //@line 1249
     if (!($69 << 24 >> 24)) {
      $$lcssa$i = $70; //@line 1252
     } else {
      $75 = $70; //@line 1254
      $77 = $69; //@line 1254
      while (1) {
       $78 = $75 + 1 + ($77 & 255) | 0; //@line 1258
       $77 = HEAP8[$78 >> 0] | 0; //@line 1259
       if (!($77 << 24 >> 24)) {
        $$lcssa$i = $78; //@line 1262
        break;
       } else {
        $75 = $78; //@line 1265
       }
      }
     }
     $81 = $$lcssa$i + 5 | 0; //@line 1269
     $$093119$i = $$093119$i + 1 | 0; //@line 1270
     if (($$093119$i | 0) >= ($56 | 0)) {
      $251 = $81; //@line 1275
      break;
     } else {
      $70 = $81; //@line 1273
     }
    }
   }
   if (($4 | 0) != 0 & ($62 | 0) != 0) {
    $$090117$i = $8; //@line 1284
    $$094116$i = 0; //@line 1284
    $$095115$i = 0; //@line 1284
    $85 = $251; //@line 1284
    while (1) {
     $86 = HEAP8[$85 >> 0] | 0; //@line 1287
     do {
      if (!($86 << 24 >> 24)) {
       $101 = $85 + 1 | 0; //@line 1291
      } else {
       $90 = $86 & 255; //@line 1294
       $93 = $85; //@line 1294
       while (1) {
        if ($90 & 192 | 0) {
         label = 13; //@line 1299
         break;
        }
        $95 = $93 + 1 + $90 | 0; //@line 1303
        $96 = HEAP8[$95 >> 0] | 0; //@line 1304
        if (!($96 << 24 >> 24)) {
         label = 15; //@line 1308
         break;
        } else {
         $90 = $96 & 255; //@line 1311
         $93 = $95; //@line 1311
        }
       }
       if ((label | 0) == 13) {
        label = 0; //@line 1315
        $101 = $93 + 2 | 0; //@line 1317
        break;
       } else if ((label | 0) == 15) {
        label = 0; //@line 1321
        $101 = $95 + 1 | 0; //@line 1323
        break;
       }
      }
     } while (0);
     $109 = (HEAPU8[$101 >> 0] << 8 | HEAPU8[$101 + 1 >> 0]) & 65535; //@line 1336
     $120 = $101 + 10 | 0; //@line 1347
     $125 = HEAPU8[$101 + 8 >> 0] << 8 | HEAPU8[$101 + 9 >> 0]; //@line 1352
     $126 = $125 & 65535; //@line 1353
     $128 = (HEAPU8[$101 + 2 >> 0] << 8 | HEAPU8[$101 + 3 >> 0] | 0) == 1; //@line 1355
     do {
      if ($109 << 16 >> 16 == 1 & $128 & $126 << 16 >> 16 == 4) {
       HEAP32[$$090117$i >> 2] = 1; //@line 1361
       HEAP8[$$090117$i + 4 >> 0] = HEAP8[$120 >> 0] | 0; //@line 1365
       HEAP8[$$090117$i + 5 >> 0] = HEAP8[$101 + 11 >> 0] | 0; //@line 1369
       HEAP8[$$090117$i + 6 >> 0] = HEAP8[$101 + 12 >> 0] | 0; //@line 1373
       HEAP8[$$090117$i + 7 >> 0] = HEAP8[$101 + 13 >> 0] | 0; //@line 1377
       $$0 = $101 + 14 | 0; //@line 1380
       $$1$i = $$090117$i + 20 | 0; //@line 1380
       $$196$i = $$095115$i + 1 | 0; //@line 1380
      } else {
       if ($109 << 16 >> 16 == 28 & $128 & $126 << 16 >> 16 == 16) {
        HEAP32[$$090117$i >> 2] = 2; //@line 1387
        HEAP8[$$090117$i + 4 >> 0] = HEAP8[$120 >> 0] | 0; //@line 1391
        HEAP8[$$090117$i + 5 >> 0] = HEAP8[$101 + 11 >> 0] | 0; //@line 1395
        HEAP8[$$090117$i + 6 >> 0] = HEAP8[$101 + 12 >> 0] | 0; //@line 1399
        HEAP8[$$090117$i + 7 >> 0] = HEAP8[$101 + 13 >> 0] | 0; //@line 1403
        HEAP8[$$090117$i + 8 >> 0] = HEAP8[$101 + 14 >> 0] | 0; //@line 1407
        HEAP8[$$090117$i + 9 >> 0] = HEAP8[$101 + 15 >> 0] | 0; //@line 1411
        HEAP8[$$090117$i + 10 >> 0] = HEAP8[$101 + 16 >> 0] | 0; //@line 1415
        HEAP8[$$090117$i + 11 >> 0] = HEAP8[$101 + 17 >> 0] | 0; //@line 1419
        HEAP8[$$090117$i + 12 >> 0] = HEAP8[$101 + 18 >> 0] | 0; //@line 1423
        HEAP8[$$090117$i + 13 >> 0] = HEAP8[$101 + 19 >> 0] | 0; //@line 1427
        HEAP8[$$090117$i + 14 >> 0] = HEAP8[$101 + 20 >> 0] | 0; //@line 1431
        HEAP8[$$090117$i + 15 >> 0] = HEAP8[$101 + 21 >> 0] | 0; //@line 1435
        HEAP8[$$090117$i + 16 >> 0] = HEAP8[$101 + 22 >> 0] | 0; //@line 1439
        HEAP8[$$090117$i + 17 >> 0] = HEAP8[$101 + 23 >> 0] | 0; //@line 1443
        HEAP8[$$090117$i + 18 >> 0] = HEAP8[$101 + 24 >> 0] | 0; //@line 1447
        HEAP8[$$090117$i + 19 >> 0] = HEAP8[$101 + 25 >> 0] | 0; //@line 1451
        $$0 = $101 + 26 | 0; //@line 1454
        $$1$i = $$090117$i + 20 | 0; //@line 1454
        $$196$i = $$095115$i + 1 | 0; //@line 1454
        break;
       } else {
        $$0 = $120 + $125 | 0; //@line 1458
        $$1$i = $$090117$i; //@line 1458
        $$196$i = $$095115$i; //@line 1458
        break;
       }
      }
     } while (0);
     $$094116$i = $$094116$i + 1 | 0; //@line 1463
     if (!(($$094116$i | 0) < ($62 | 0) & $$196$i >>> 0 < $4 >>> 0)) {
      $$089$i = $$196$i; //@line 1470
      break;
     } else {
      $$090117$i = $$1$i; //@line 1468
      $$095115$i = $$196$i; //@line 1468
      $85 = $$0; //@line 1468
     }
    }
   } else {
    $$089$i = 0; //@line 1475
   }
  } else {
   $$089$i = 0; //@line 1478
  }
  $$355 = ($$089$i | 0) > 0 ? $$089$i : -3009; //@line 1482
 }
 _free($10); //@line 1484
 $ReallocAsyncCtx12 = _emscripten_realloc_async_context(16) | 0; //@line 1485
 $203 = __ZN6Socket5closeEv($30) | 0; //@line 1486
 if (___async) {
  HEAP32[$ReallocAsyncCtx12 >> 2] = 94; //@line 1489
  $204 = $ReallocAsyncCtx12 + 4 | 0; //@line 1490
  HEAP32[$204 >> 2] = $$355; //@line 1491
  $205 = $ReallocAsyncCtx12 + 8 | 0; //@line 1492
  HEAP32[$205 >> 2] = $28; //@line 1493
  $206 = $ReallocAsyncCtx12 + 12 | 0; //@line 1494
  HEAP32[$206 >> 2] = $26; //@line 1495
  sp = STACKTOP; //@line 1496
  STACKTOP = sp; //@line 1497
  return;
 }
 HEAP32[___async_retval >> 2] = $203; //@line 1500
 ___async_unwind = 0; //@line 1501
 HEAP32[$ReallocAsyncCtx12 >> 2] = 94; //@line 1502
 $204 = $ReallocAsyncCtx12 + 4 | 0; //@line 1503
 HEAP32[$204 >> 2] = $$355; //@line 1504
 $205 = $ReallocAsyncCtx12 + 8 | 0; //@line 1505
 HEAP32[$205 >> 2] = $28; //@line 1506
 $206 = $ReallocAsyncCtx12 + 12 | 0; //@line 1507
 HEAP32[$206 >> 2] = $26; //@line 1508
 sp = STACKTOP; //@line 1509
 STACKTOP = sp; //@line 1510
 return;
}
function __ZL24nsapi_dns_query_multipleP12NetworkStackPKcP10nsapi_addrj13nsapi_version__async_cb_70($0) {
 $0 = $0 | 0;
 var $$0 = 0, $$019$i$2 = 0, $$089$i = 0, $$090117$i = 0, $$093119$i = 0, $$094116$i = 0, $$095115$i = 0, $$1$i = 0, $$196$i = 0, $$355 = 0, $$byval_copy = 0, $$lcssa$i = 0, $10 = 0, $100 = 0, $108 = 0, $119 = 0, $12 = 0, $124 = 0, $125 = 0, $127 = 0, $14 = 0, $16 = 0, $18 = 0, $2 = 0, $20 = 0, $200 = 0, $201 = 0, $202 = 0, $203 = 0, $208 = 0, $210 = 0, $211 = 0, $212 = 0, $213 = 0, $22 = 0, $223 = 0, $230 = 0, $231 = 0, $232 = 0, $233 = 0, $234 = 0, $235 = 0, $236 = 0, $237 = 0, $238 = 0, $239 = 0, $24 = 0, $240 = 0, $241 = 0, $242 = 0, $243 = 0, $244 = 0, $245 = 0, $246 = 0, $247 = 0, $248 = 0, $249 = 0, $251 = 0, $26 = 0, $28 = 0, $30 = 0, $32 = 0, $34 = 0, $36 = 0, $38 = 0, $4 = 0, $55 = 0, $6 = 0, $61 = 0, $68 = 0, $69 = 0, $74 = 0, $76 = 0, $77 = 0, $8 = 0, $80 = 0, $84 = 0, $85 = 0, $89 = 0, $92 = 0, $94 = 0, $95 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx12 = 0, $ReallocAsyncCtx8 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 520
 STACKTOP = STACKTOP + 32 | 0; //@line 521
 $$byval_copy = sp; //@line 522
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 524
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 526
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 528
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 530
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 532
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 534
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 536
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 538
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 540
 $20 = HEAP32[$0 + 40 >> 2] | 0; //@line 542
 $22 = HEAP32[$0 + 44 >> 2] | 0; //@line 544
 $24 = HEAP32[$0 + 48 >> 2] | 0; //@line 546
 $26 = HEAP32[$0 + 52 >> 2] | 0; //@line 548
 $28 = HEAP32[$0 + 56 >> 2] | 0; //@line 550
 $30 = HEAP32[$0 + 60 >> 2] | 0; //@line 552
 $32 = HEAP8[$0 + 64 >> 0] | 0; //@line 554
 $34 = HEAP32[$0 + 68 >> 2] | 0; //@line 556
 $36 = HEAP32[$0 + 72 >> 2] | 0; //@line 558
 $38 = HEAP32[$0 + 76 >> 2] | 0; //@line 560
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 562
 if (($AsyncRetVal | 0) == -3001) {
  HEAP8[$10 >> 0] = 0; //@line 565
  HEAP8[$12 >> 0] = 1; //@line 566
  HEAP8[$14 >> 0] = 1; //@line 567
  HEAP8[$16 >> 0] = 0; //@line 568
  HEAP8[$18 >> 0] = 0; //@line 569
  HEAP8[$20 >> 0] = 1; //@line 570
  HEAP8[$22 >> 0] = 0; //@line 571
  HEAP8[$22 + 1 >> 0] = 0; //@line 571
  HEAP8[$22 + 2 >> 0] = 0; //@line 571
  HEAP8[$22 + 3 >> 0] = 0; //@line 571
  HEAP8[$22 + 4 >> 0] = 0; //@line 571
  HEAP8[$22 + 5 >> 0] = 0; //@line 571
  if (!(HEAP8[$38 >> 0] | 0)) {
   $223 = $2; //@line 575
  } else {
   $$019$i$2 = $38; //@line 577
   $211 = $2; //@line 577
   while (1) {
    $208 = _strcspn($$019$i$2, 4557) | 0; //@line 579
    $210 = $211 + 1 | 0; //@line 581
    HEAP8[$211 >> 0] = $208; //@line 582
    $212 = $208 & 255; //@line 583
    _memcpy($210 | 0, $$019$i$2 | 0, $212 | 0) | 0; //@line 584
    $213 = $210 + $212 | 0; //@line 585
    $$019$i$2 = $$019$i$2 + ($208 + ((HEAP8[$$019$i$2 + $208 >> 0] | 0) == 46 & 1)) | 0; //@line 591
    if (!(HEAP8[$$019$i$2 >> 0] | 0)) {
     $223 = $213; //@line 595
     break;
    } else {
     $211 = $213; //@line 598
    }
   }
  }
  HEAP8[$223 >> 0] = 0; //@line 603
  HEAP8[$223 + 1 >> 0] = 0; //@line 605
  HEAP8[$223 + 2 >> 0] = $32; //@line 607
  HEAP8[$223 + 3 >> 0] = 0; //@line 609
  HEAP8[$223 + 4 >> 0] = 1; //@line 610
  HEAP32[$$byval_copy >> 2] = HEAP32[134]; //@line 611
  HEAP32[$$byval_copy + 4 >> 2] = HEAP32[135]; //@line 611
  HEAP32[$$byval_copy + 8 >> 2] = HEAP32[136]; //@line 611
  HEAP32[$$byval_copy + 12 >> 2] = HEAP32[137]; //@line 611
  HEAP32[$$byval_copy + 16 >> 2] = HEAP32[138]; //@line 611
  __ZN13SocketAddressC2E10nsapi_addrt($34, $$byval_copy, 53); //@line 612
  $ReallocAsyncCtx8 = _emscripten_realloc_async_context(80) | 0; //@line 616
  $230 = __ZN9UDPSocket6sendtoERK13SocketAddressPKvj($28, $34, $10, $223 + 5 - $36 | 0) | 0; //@line 617
  if (___async) {
   HEAP32[$ReallocAsyncCtx8 >> 2] = 98; //@line 620
   $231 = $ReallocAsyncCtx8 + 4 | 0; //@line 621
   HEAP32[$231 >> 2] = $2; //@line 622
   $232 = $ReallocAsyncCtx8 + 8 | 0; //@line 623
   HEAP32[$232 >> 2] = $4; //@line 624
   $233 = $ReallocAsyncCtx8 + 12 | 0; //@line 625
   HEAP32[$233 >> 2] = $6; //@line 626
   $234 = $ReallocAsyncCtx8 + 16 | 0; //@line 627
   HEAP32[$234 >> 2] = $8; //@line 628
   $235 = $ReallocAsyncCtx8 + 20 | 0; //@line 629
   HEAP32[$235 >> 2] = $10; //@line 630
   $236 = $ReallocAsyncCtx8 + 24 | 0; //@line 631
   HEAP32[$236 >> 2] = $12; //@line 632
   $237 = $ReallocAsyncCtx8 + 28 | 0; //@line 633
   HEAP32[$237 >> 2] = $14; //@line 634
   $238 = $ReallocAsyncCtx8 + 32 | 0; //@line 635
   HEAP32[$238 >> 2] = $16; //@line 636
   $239 = $ReallocAsyncCtx8 + 36 | 0; //@line 637
   HEAP32[$239 >> 2] = $18; //@line 638
   $240 = $ReallocAsyncCtx8 + 40 | 0; //@line 639
   HEAP32[$240 >> 2] = $20; //@line 640
   $241 = $ReallocAsyncCtx8 + 44 | 0; //@line 641
   HEAP32[$241 >> 2] = $22; //@line 642
   $242 = $ReallocAsyncCtx8 + 48 | 0; //@line 643
   HEAP32[$242 >> 2] = $24; //@line 644
   $243 = $ReallocAsyncCtx8 + 52 | 0; //@line 645
   HEAP32[$243 >> 2] = $26; //@line 646
   $244 = $ReallocAsyncCtx8 + 56 | 0; //@line 647
   HEAP32[$244 >> 2] = $28; //@line 648
   $245 = $ReallocAsyncCtx8 + 60 | 0; //@line 649
   HEAP32[$245 >> 2] = $30; //@line 650
   $246 = $ReallocAsyncCtx8 + 64 | 0; //@line 651
   HEAP8[$246 >> 0] = $32; //@line 652
   $247 = $ReallocAsyncCtx8 + 68 | 0; //@line 653
   HEAP32[$247 >> 2] = $34; //@line 654
   $248 = $ReallocAsyncCtx8 + 72 | 0; //@line 655
   HEAP32[$248 >> 2] = $36; //@line 656
   $249 = $ReallocAsyncCtx8 + 76 | 0; //@line 657
   HEAP32[$249 >> 2] = $38; //@line 658
   sp = STACKTOP; //@line 659
   STACKTOP = sp; //@line 660
   return;
  }
  HEAP32[___async_retval >> 2] = $230; //@line 663
  ___async_unwind = 0; //@line 664
  HEAP32[$ReallocAsyncCtx8 >> 2] = 98; //@line 665
  $231 = $ReallocAsyncCtx8 + 4 | 0; //@line 666
  HEAP32[$231 >> 2] = $2; //@line 667
  $232 = $ReallocAsyncCtx8 + 8 | 0; //@line 668
  HEAP32[$232 >> 2] = $4; //@line 669
  $233 = $ReallocAsyncCtx8 + 12 | 0; //@line 670
  HEAP32[$233 >> 2] = $6; //@line 671
  $234 = $ReallocAsyncCtx8 + 16 | 0; //@line 672
  HEAP32[$234 >> 2] = $8; //@line 673
  $235 = $ReallocAsyncCtx8 + 20 | 0; //@line 674
  HEAP32[$235 >> 2] = $10; //@line 675
  $236 = $ReallocAsyncCtx8 + 24 | 0; //@line 676
  HEAP32[$236 >> 2] = $12; //@line 677
  $237 = $ReallocAsyncCtx8 + 28 | 0; //@line 678
  HEAP32[$237 >> 2] = $14; //@line 679
  $238 = $ReallocAsyncCtx8 + 32 | 0; //@line 680
  HEAP32[$238 >> 2] = $16; //@line 681
  $239 = $ReallocAsyncCtx8 + 36 | 0; //@line 682
  HEAP32[$239 >> 2] = $18; //@line 683
  $240 = $ReallocAsyncCtx8 + 40 | 0; //@line 684
  HEAP32[$240 >> 2] = $20; //@line 685
  $241 = $ReallocAsyncCtx8 + 44 | 0; //@line 686
  HEAP32[$241 >> 2] = $22; //@line 687
  $242 = $ReallocAsyncCtx8 + 48 | 0; //@line 688
  HEAP32[$242 >> 2] = $24; //@line 689
  $243 = $ReallocAsyncCtx8 + 52 | 0; //@line 690
  HEAP32[$243 >> 2] = $26; //@line 691
  $244 = $ReallocAsyncCtx8 + 56 | 0; //@line 692
  HEAP32[$244 >> 2] = $28; //@line 693
  $245 = $ReallocAsyncCtx8 + 60 | 0; //@line 694
  HEAP32[$245 >> 2] = $30; //@line 695
  $246 = $ReallocAsyncCtx8 + 64 | 0; //@line 696
  HEAP8[$246 >> 0] = $32; //@line 697
  $247 = $ReallocAsyncCtx8 + 68 | 0; //@line 698
  HEAP32[$247 >> 2] = $34; //@line 699
  $248 = $ReallocAsyncCtx8 + 72 | 0; //@line 700
  HEAP32[$248 >> 2] = $36; //@line 701
  $249 = $ReallocAsyncCtx8 + 76 | 0; //@line 702
  HEAP32[$249 >> 2] = $38; //@line 703
  sp = STACKTOP; //@line 704
  STACKTOP = sp; //@line 705
  return;
 }
 if (($AsyncRetVal | 0) < 0) {
  $$355 = $AsyncRetVal; //@line 709
 } else {
  $55 = HEAPU8[$18 >> 0] << 8 | HEAPU8[$20 >> 0]; //@line 725
  $61 = HEAPU8[$22 >> 0] << 8 | HEAPU8[$24 >> 0]; //@line 731
  if (((HEAP8[$14 >> 0] & -8) << 24 >> 24 == -128 ? (HEAPU8[$10 >> 0] << 8 | HEAPU8[$12 >> 0] | 0) == 1 : 0) & (HEAP8[$16 >> 0] & 15) == 0) {
   if (!$55) {
    $251 = $2; //@line 741
   } else {
    $$093119$i = 0; //@line 743
    $69 = $2; //@line 743
    while (1) {
     $68 = HEAP8[$69 >> 0] | 0; //@line 745
     if (!($68 << 24 >> 24)) {
      $$lcssa$i = $69; //@line 748
     } else {
      $74 = $69; //@line 750
      $76 = $68; //@line 750
      while (1) {
       $77 = $74 + 1 + ($76 & 255) | 0; //@line 754
       $76 = HEAP8[$77 >> 0] | 0; //@line 755
       if (!($76 << 24 >> 24)) {
        $$lcssa$i = $77; //@line 758
        break;
       } else {
        $74 = $77; //@line 761
       }
      }
     }
     $80 = $$lcssa$i + 5 | 0; //@line 765
     $$093119$i = $$093119$i + 1 | 0; //@line 766
     if (($$093119$i | 0) >= ($55 | 0)) {
      $251 = $80; //@line 771
      break;
     } else {
      $69 = $80; //@line 769
     }
    }
   }
   if (($4 | 0) != 0 & ($61 | 0) != 0) {
    $$090117$i = $8; //@line 780
    $$094116$i = 0; //@line 780
    $$095115$i = 0; //@line 780
    $84 = $251; //@line 780
    while (1) {
     $85 = HEAP8[$84 >> 0] | 0; //@line 783
     do {
      if (!($85 << 24 >> 24)) {
       $100 = $84 + 1 | 0; //@line 787
      } else {
       $89 = $85 & 255; //@line 790
       $92 = $84; //@line 790
       while (1) {
        if ($89 & 192 | 0) {
         label = 12; //@line 795
         break;
        }
        $94 = $92 + 1 + $89 | 0; //@line 799
        $95 = HEAP8[$94 >> 0] | 0; //@line 800
        if (!($95 << 24 >> 24)) {
         label = 14; //@line 804
         break;
        } else {
         $89 = $95 & 255; //@line 807
         $92 = $94; //@line 807
        }
       }
       if ((label | 0) == 12) {
        label = 0; //@line 811
        $100 = $92 + 2 | 0; //@line 813
        break;
       } else if ((label | 0) == 14) {
        label = 0; //@line 817
        $100 = $94 + 1 | 0; //@line 819
        break;
       }
      }
     } while (0);
     $108 = (HEAPU8[$100 >> 0] << 8 | HEAPU8[$100 + 1 >> 0]) & 65535; //@line 832
     $119 = $100 + 10 | 0; //@line 843
     $124 = HEAPU8[$100 + 8 >> 0] << 8 | HEAPU8[$100 + 9 >> 0]; //@line 848
     $125 = $124 & 65535; //@line 849
     $127 = (HEAPU8[$100 + 2 >> 0] << 8 | HEAPU8[$100 + 3 >> 0] | 0) == 1; //@line 851
     do {
      if ($108 << 16 >> 16 == 1 & $127 & $125 << 16 >> 16 == 4) {
       HEAP32[$$090117$i >> 2] = 1; //@line 857
       HEAP8[$$090117$i + 4 >> 0] = HEAP8[$119 >> 0] | 0; //@line 861
       HEAP8[$$090117$i + 5 >> 0] = HEAP8[$100 + 11 >> 0] | 0; //@line 865
       HEAP8[$$090117$i + 6 >> 0] = HEAP8[$100 + 12 >> 0] | 0; //@line 869
       HEAP8[$$090117$i + 7 >> 0] = HEAP8[$100 + 13 >> 0] | 0; //@line 873
       $$0 = $100 + 14 | 0; //@line 876
       $$1$i = $$090117$i + 20 | 0; //@line 876
       $$196$i = $$095115$i + 1 | 0; //@line 876
      } else {
       if ($108 << 16 >> 16 == 28 & $127 & $125 << 16 >> 16 == 16) {
        HEAP32[$$090117$i >> 2] = 2; //@line 883
        HEAP8[$$090117$i + 4 >> 0] = HEAP8[$119 >> 0] | 0; //@line 887
        HEAP8[$$090117$i + 5 >> 0] = HEAP8[$100 + 11 >> 0] | 0; //@line 891
        HEAP8[$$090117$i + 6 >> 0] = HEAP8[$100 + 12 >> 0] | 0; //@line 895
        HEAP8[$$090117$i + 7 >> 0] = HEAP8[$100 + 13 >> 0] | 0; //@line 899
        HEAP8[$$090117$i + 8 >> 0] = HEAP8[$100 + 14 >> 0] | 0; //@line 903
        HEAP8[$$090117$i + 9 >> 0] = HEAP8[$100 + 15 >> 0] | 0; //@line 907
        HEAP8[$$090117$i + 10 >> 0] = HEAP8[$100 + 16 >> 0] | 0; //@line 911
        HEAP8[$$090117$i + 11 >> 0] = HEAP8[$100 + 17 >> 0] | 0; //@line 915
        HEAP8[$$090117$i + 12 >> 0] = HEAP8[$100 + 18 >> 0] | 0; //@line 919
        HEAP8[$$090117$i + 13 >> 0] = HEAP8[$100 + 19 >> 0] | 0; //@line 923
        HEAP8[$$090117$i + 14 >> 0] = HEAP8[$100 + 20 >> 0] | 0; //@line 927
        HEAP8[$$090117$i + 15 >> 0] = HEAP8[$100 + 21 >> 0] | 0; //@line 931
        HEAP8[$$090117$i + 16 >> 0] = HEAP8[$100 + 22 >> 0] | 0; //@line 935
        HEAP8[$$090117$i + 17 >> 0] = HEAP8[$100 + 23 >> 0] | 0; //@line 939
        HEAP8[$$090117$i + 18 >> 0] = HEAP8[$100 + 24 >> 0] | 0; //@line 943
        HEAP8[$$090117$i + 19 >> 0] = HEAP8[$100 + 25 >> 0] | 0; //@line 947
        $$0 = $100 + 26 | 0; //@line 950
        $$1$i = $$090117$i + 20 | 0; //@line 950
        $$196$i = $$095115$i + 1 | 0; //@line 950
        break;
       } else {
        $$0 = $119 + $124 | 0; //@line 954
        $$1$i = $$090117$i; //@line 954
        $$196$i = $$095115$i; //@line 954
        break;
       }
      }
     } while (0);
     $$094116$i = $$094116$i + 1 | 0; //@line 959
     if (!(($$094116$i | 0) < ($61 | 0) & $$196$i >>> 0 < $4 >>> 0)) {
      $$089$i = $$196$i; //@line 966
      break;
     } else {
      $$090117$i = $$1$i; //@line 964
      $$095115$i = $$196$i; //@line 964
      $84 = $$0; //@line 964
     }
    }
   } else {
    $$089$i = 0; //@line 971
   }
  } else {
   $$089$i = 0; //@line 974
  }
  $$355 = ($$089$i | 0) > 0 ? $$089$i : -3009; //@line 978
 }
 _free($10); //@line 980
 $ReallocAsyncCtx12 = _emscripten_realloc_async_context(16) | 0; //@line 981
 $200 = __ZN6Socket5closeEv($30) | 0; //@line 982
 if (___async) {
  HEAP32[$ReallocAsyncCtx12 >> 2] = 94; //@line 985
  $201 = $ReallocAsyncCtx12 + 4 | 0; //@line 986
  HEAP32[$201 >> 2] = $$355; //@line 987
  $202 = $ReallocAsyncCtx12 + 8 | 0; //@line 988
  HEAP32[$202 >> 2] = $28; //@line 989
  $203 = $ReallocAsyncCtx12 + 12 | 0; //@line 990
  HEAP32[$203 >> 2] = $26; //@line 991
  sp = STACKTOP; //@line 992
  STACKTOP = sp; //@line 993
  return;
 }
 HEAP32[___async_retval >> 2] = $200; //@line 996
 ___async_unwind = 0; //@line 997
 HEAP32[$ReallocAsyncCtx12 >> 2] = 94; //@line 998
 $201 = $ReallocAsyncCtx12 + 4 | 0; //@line 999
 HEAP32[$201 >> 2] = $$355; //@line 1000
 $202 = $ReallocAsyncCtx12 + 8 | 0; //@line 1001
 HEAP32[$202 >> 2] = $28; //@line 1002
 $203 = $ReallocAsyncCtx12 + 12 | 0; //@line 1003
 HEAP32[$203 >> 2] = $26; //@line 1004
 sp = STACKTOP; //@line 1005
 STACKTOP = sp; //@line 1006
 return;
}
function __ZL24nsapi_dns_query_multipleP12NetworkStackPKcP10nsapi_addrj13nsapi_version__async_cb_69($0) {
 $0 = $0 | 0;
 var $$0 = 0, $$019$i$3 = 0, $$089$i = 0, $$090117$i = 0, $$093119$i = 0, $$094116$i = 0, $$095115$i = 0, $$1$i = 0, $$196$i = 0, $$355 = 0, $$byval_copy = 0, $$lcssa$i = 0, $10 = 0, $100 = 0, $108 = 0, $119 = 0, $12 = 0, $124 = 0, $125 = 0, $127 = 0, $14 = 0, $16 = 0, $18 = 0, $2 = 0, $20 = 0, $200 = 0, $201 = 0, $202 = 0, $203 = 0, $208 = 0, $210 = 0, $211 = 0, $212 = 0, $213 = 0, $22 = 0, $223 = 0, $230 = 0, $231 = 0, $232 = 0, $233 = 0, $234 = 0, $235 = 0, $236 = 0, $237 = 0, $238 = 0, $239 = 0, $24 = 0, $240 = 0, $241 = 0, $242 = 0, $243 = 0, $244 = 0, $245 = 0, $246 = 0, $247 = 0, $248 = 0, $249 = 0, $251 = 0, $26 = 0, $28 = 0, $30 = 0, $32 = 0, $34 = 0, $36 = 0, $38 = 0, $4 = 0, $55 = 0, $6 = 0, $61 = 0, $68 = 0, $69 = 0, $74 = 0, $76 = 0, $77 = 0, $8 = 0, $80 = 0, $84 = 0, $85 = 0, $89 = 0, $92 = 0, $94 = 0, $95 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx12 = 0, $ReallocAsyncCtx7 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 16
 STACKTOP = STACKTOP + 32 | 0; //@line 17
 $$byval_copy = sp; //@line 18
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 20
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 22
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 24
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 26
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 28
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 30
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 32
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 34
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 36
 $20 = HEAP32[$0 + 40 >> 2] | 0; //@line 38
 $22 = HEAP32[$0 + 44 >> 2] | 0; //@line 40
 $24 = HEAP32[$0 + 48 >> 2] | 0; //@line 42
 $26 = HEAP32[$0 + 52 >> 2] | 0; //@line 44
 $28 = HEAP32[$0 + 56 >> 2] | 0; //@line 46
 $30 = HEAP32[$0 + 60 >> 2] | 0; //@line 48
 $32 = HEAP8[$0 + 64 >> 0] | 0; //@line 50
 $34 = HEAP32[$0 + 68 >> 2] | 0; //@line 52
 $36 = HEAP32[$0 + 72 >> 2] | 0; //@line 54
 $38 = HEAP32[$0 + 76 >> 2] | 0; //@line 56
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 58
 if (($AsyncRetVal | 0) == -3001) {
  HEAP8[$10 >> 0] = 0; //@line 61
  HEAP8[$12 >> 0] = 1; //@line 62
  HEAP8[$14 >> 0] = 1; //@line 63
  HEAP8[$16 >> 0] = 0; //@line 64
  HEAP8[$18 >> 0] = 0; //@line 65
  HEAP8[$20 >> 0] = 1; //@line 66
  HEAP8[$22 >> 0] = 0; //@line 67
  HEAP8[$22 + 1 >> 0] = 0; //@line 67
  HEAP8[$22 + 2 >> 0] = 0; //@line 67
  HEAP8[$22 + 3 >> 0] = 0; //@line 67
  HEAP8[$22 + 4 >> 0] = 0; //@line 67
  HEAP8[$22 + 5 >> 0] = 0; //@line 67
  if (!(HEAP8[$38 >> 0] | 0)) {
   $223 = $2; //@line 71
  } else {
   $$019$i$3 = $38; //@line 73
   $211 = $2; //@line 73
   while (1) {
    $208 = _strcspn($$019$i$3, 4557) | 0; //@line 75
    $210 = $211 + 1 | 0; //@line 77
    HEAP8[$211 >> 0] = $208; //@line 78
    $212 = $208 & 255; //@line 79
    _memcpy($210 | 0, $$019$i$3 | 0, $212 | 0) | 0; //@line 80
    $213 = $210 + $212 | 0; //@line 81
    $$019$i$3 = $$019$i$3 + ($208 + ((HEAP8[$$019$i$3 + $208 >> 0] | 0) == 46 & 1)) | 0; //@line 87
    if (!(HEAP8[$$019$i$3 >> 0] | 0)) {
     $223 = $213; //@line 91
     break;
    } else {
     $211 = $213; //@line 94
    }
   }
  }
  HEAP8[$223 >> 0] = 0; //@line 99
  HEAP8[$223 + 1 >> 0] = 0; //@line 101
  HEAP8[$223 + 2 >> 0] = $32; //@line 103
  HEAP8[$223 + 3 >> 0] = 0; //@line 105
  HEAP8[$223 + 4 >> 0] = 1; //@line 106
  HEAP32[$$byval_copy >> 2] = HEAP32[139]; //@line 107
  HEAP32[$$byval_copy + 4 >> 2] = HEAP32[140]; //@line 107
  HEAP32[$$byval_copy + 8 >> 2] = HEAP32[141]; //@line 107
  HEAP32[$$byval_copy + 12 >> 2] = HEAP32[142]; //@line 107
  HEAP32[$$byval_copy + 16 >> 2] = HEAP32[143]; //@line 107
  __ZN13SocketAddressC2E10nsapi_addrt($34, $$byval_copy, 53); //@line 108
  $ReallocAsyncCtx7 = _emscripten_realloc_async_context(80) | 0; //@line 112
  $230 = __ZN9UDPSocket6sendtoERK13SocketAddressPKvj($28, $34, $10, $223 + 5 - $36 | 0) | 0; //@line 113
  if (___async) {
   HEAP32[$ReallocAsyncCtx7 >> 2] = 100; //@line 116
   $231 = $ReallocAsyncCtx7 + 4 | 0; //@line 117
   HEAP32[$231 >> 2] = $2; //@line 118
   $232 = $ReallocAsyncCtx7 + 8 | 0; //@line 119
   HEAP32[$232 >> 2] = $4; //@line 120
   $233 = $ReallocAsyncCtx7 + 12 | 0; //@line 121
   HEAP32[$233 >> 2] = $6; //@line 122
   $234 = $ReallocAsyncCtx7 + 16 | 0; //@line 123
   HEAP32[$234 >> 2] = $8; //@line 124
   $235 = $ReallocAsyncCtx7 + 20 | 0; //@line 125
   HEAP32[$235 >> 2] = $10; //@line 126
   $236 = $ReallocAsyncCtx7 + 24 | 0; //@line 127
   HEAP32[$236 >> 2] = $12; //@line 128
   $237 = $ReallocAsyncCtx7 + 28 | 0; //@line 129
   HEAP32[$237 >> 2] = $14; //@line 130
   $238 = $ReallocAsyncCtx7 + 32 | 0; //@line 131
   HEAP32[$238 >> 2] = $16; //@line 132
   $239 = $ReallocAsyncCtx7 + 36 | 0; //@line 133
   HEAP32[$239 >> 2] = $18; //@line 134
   $240 = $ReallocAsyncCtx7 + 40 | 0; //@line 135
   HEAP32[$240 >> 2] = $20; //@line 136
   $241 = $ReallocAsyncCtx7 + 44 | 0; //@line 137
   HEAP32[$241 >> 2] = $22; //@line 138
   $242 = $ReallocAsyncCtx7 + 48 | 0; //@line 139
   HEAP32[$242 >> 2] = $24; //@line 140
   $243 = $ReallocAsyncCtx7 + 52 | 0; //@line 141
   HEAP32[$243 >> 2] = $26; //@line 142
   $244 = $ReallocAsyncCtx7 + 56 | 0; //@line 143
   HEAP32[$244 >> 2] = $28; //@line 144
   $245 = $ReallocAsyncCtx7 + 60 | 0; //@line 145
   HEAP32[$245 >> 2] = $30; //@line 146
   $246 = $ReallocAsyncCtx7 + 64 | 0; //@line 147
   HEAP8[$246 >> 0] = $32; //@line 148
   $247 = $ReallocAsyncCtx7 + 68 | 0; //@line 149
   HEAP32[$247 >> 2] = $34; //@line 150
   $248 = $ReallocAsyncCtx7 + 72 | 0; //@line 151
   HEAP32[$248 >> 2] = $36; //@line 152
   $249 = $ReallocAsyncCtx7 + 76 | 0; //@line 153
   HEAP32[$249 >> 2] = $38; //@line 154
   sp = STACKTOP; //@line 155
   STACKTOP = sp; //@line 156
   return;
  }
  HEAP32[___async_retval >> 2] = $230; //@line 159
  ___async_unwind = 0; //@line 160
  HEAP32[$ReallocAsyncCtx7 >> 2] = 100; //@line 161
  $231 = $ReallocAsyncCtx7 + 4 | 0; //@line 162
  HEAP32[$231 >> 2] = $2; //@line 163
  $232 = $ReallocAsyncCtx7 + 8 | 0; //@line 164
  HEAP32[$232 >> 2] = $4; //@line 165
  $233 = $ReallocAsyncCtx7 + 12 | 0; //@line 166
  HEAP32[$233 >> 2] = $6; //@line 167
  $234 = $ReallocAsyncCtx7 + 16 | 0; //@line 168
  HEAP32[$234 >> 2] = $8; //@line 169
  $235 = $ReallocAsyncCtx7 + 20 | 0; //@line 170
  HEAP32[$235 >> 2] = $10; //@line 171
  $236 = $ReallocAsyncCtx7 + 24 | 0; //@line 172
  HEAP32[$236 >> 2] = $12; //@line 173
  $237 = $ReallocAsyncCtx7 + 28 | 0; //@line 174
  HEAP32[$237 >> 2] = $14; //@line 175
  $238 = $ReallocAsyncCtx7 + 32 | 0; //@line 176
  HEAP32[$238 >> 2] = $16; //@line 177
  $239 = $ReallocAsyncCtx7 + 36 | 0; //@line 178
  HEAP32[$239 >> 2] = $18; //@line 179
  $240 = $ReallocAsyncCtx7 + 40 | 0; //@line 180
  HEAP32[$240 >> 2] = $20; //@line 181
  $241 = $ReallocAsyncCtx7 + 44 | 0; //@line 182
  HEAP32[$241 >> 2] = $22; //@line 183
  $242 = $ReallocAsyncCtx7 + 48 | 0; //@line 184
  HEAP32[$242 >> 2] = $24; //@line 185
  $243 = $ReallocAsyncCtx7 + 52 | 0; //@line 186
  HEAP32[$243 >> 2] = $26; //@line 187
  $244 = $ReallocAsyncCtx7 + 56 | 0; //@line 188
  HEAP32[$244 >> 2] = $28; //@line 189
  $245 = $ReallocAsyncCtx7 + 60 | 0; //@line 190
  HEAP32[$245 >> 2] = $30; //@line 191
  $246 = $ReallocAsyncCtx7 + 64 | 0; //@line 192
  HEAP8[$246 >> 0] = $32; //@line 193
  $247 = $ReallocAsyncCtx7 + 68 | 0; //@line 194
  HEAP32[$247 >> 2] = $34; //@line 195
  $248 = $ReallocAsyncCtx7 + 72 | 0; //@line 196
  HEAP32[$248 >> 2] = $36; //@line 197
  $249 = $ReallocAsyncCtx7 + 76 | 0; //@line 198
  HEAP32[$249 >> 2] = $38; //@line 199
  sp = STACKTOP; //@line 200
  STACKTOP = sp; //@line 201
  return;
 }
 if (($AsyncRetVal | 0) < 0) {
  $$355 = $AsyncRetVal; //@line 205
 } else {
  $55 = HEAPU8[$18 >> 0] << 8 | HEAPU8[$20 >> 0]; //@line 221
  $61 = HEAPU8[$22 >> 0] << 8 | HEAPU8[$24 >> 0]; //@line 227
  if (((HEAP8[$14 >> 0] & -8) << 24 >> 24 == -128 ? (HEAPU8[$10 >> 0] << 8 | HEAPU8[$12 >> 0] | 0) == 1 : 0) & (HEAP8[$16 >> 0] & 15) == 0) {
   if (!$55) {
    $251 = $2; //@line 237
   } else {
    $$093119$i = 0; //@line 239
    $69 = $2; //@line 239
    while (1) {
     $68 = HEAP8[$69 >> 0] | 0; //@line 241
     if (!($68 << 24 >> 24)) {
      $$lcssa$i = $69; //@line 244
     } else {
      $74 = $69; //@line 246
      $76 = $68; //@line 246
      while (1) {
       $77 = $74 + 1 + ($76 & 255) | 0; //@line 250
       $76 = HEAP8[$77 >> 0] | 0; //@line 251
       if (!($76 << 24 >> 24)) {
        $$lcssa$i = $77; //@line 254
        break;
       } else {
        $74 = $77; //@line 257
       }
      }
     }
     $80 = $$lcssa$i + 5 | 0; //@line 261
     $$093119$i = $$093119$i + 1 | 0; //@line 262
     if (($$093119$i | 0) >= ($55 | 0)) {
      $251 = $80; //@line 267
      break;
     } else {
      $69 = $80; //@line 265
     }
    }
   }
   if (($4 | 0) != 0 & ($61 | 0) != 0) {
    $$090117$i = $8; //@line 276
    $$094116$i = 0; //@line 276
    $$095115$i = 0; //@line 276
    $84 = $251; //@line 276
    while (1) {
     $85 = HEAP8[$84 >> 0] | 0; //@line 279
     do {
      if (!($85 << 24 >> 24)) {
       $100 = $84 + 1 | 0; //@line 283
      } else {
       $89 = $85 & 255; //@line 286
       $92 = $84; //@line 286
       while (1) {
        if ($89 & 192 | 0) {
         label = 12; //@line 291
         break;
        }
        $94 = $92 + 1 + $89 | 0; //@line 295
        $95 = HEAP8[$94 >> 0] | 0; //@line 296
        if (!($95 << 24 >> 24)) {
         label = 14; //@line 300
         break;
        } else {
         $89 = $95 & 255; //@line 303
         $92 = $94; //@line 303
        }
       }
       if ((label | 0) == 12) {
        label = 0; //@line 307
        $100 = $92 + 2 | 0; //@line 309
        break;
       } else if ((label | 0) == 14) {
        label = 0; //@line 313
        $100 = $94 + 1 | 0; //@line 315
        break;
       }
      }
     } while (0);
     $108 = (HEAPU8[$100 >> 0] << 8 | HEAPU8[$100 + 1 >> 0]) & 65535; //@line 328
     $119 = $100 + 10 | 0; //@line 339
     $124 = HEAPU8[$100 + 8 >> 0] << 8 | HEAPU8[$100 + 9 >> 0]; //@line 344
     $125 = $124 & 65535; //@line 345
     $127 = (HEAPU8[$100 + 2 >> 0] << 8 | HEAPU8[$100 + 3 >> 0] | 0) == 1; //@line 347
     do {
      if ($108 << 16 >> 16 == 1 & $127 & $125 << 16 >> 16 == 4) {
       HEAP32[$$090117$i >> 2] = 1; //@line 353
       HEAP8[$$090117$i + 4 >> 0] = HEAP8[$119 >> 0] | 0; //@line 357
       HEAP8[$$090117$i + 5 >> 0] = HEAP8[$100 + 11 >> 0] | 0; //@line 361
       HEAP8[$$090117$i + 6 >> 0] = HEAP8[$100 + 12 >> 0] | 0; //@line 365
       HEAP8[$$090117$i + 7 >> 0] = HEAP8[$100 + 13 >> 0] | 0; //@line 369
       $$0 = $100 + 14 | 0; //@line 372
       $$1$i = $$090117$i + 20 | 0; //@line 372
       $$196$i = $$095115$i + 1 | 0; //@line 372
      } else {
       if ($108 << 16 >> 16 == 28 & $127 & $125 << 16 >> 16 == 16) {
        HEAP32[$$090117$i >> 2] = 2; //@line 379
        HEAP8[$$090117$i + 4 >> 0] = HEAP8[$119 >> 0] | 0; //@line 383
        HEAP8[$$090117$i + 5 >> 0] = HEAP8[$100 + 11 >> 0] | 0; //@line 387
        HEAP8[$$090117$i + 6 >> 0] = HEAP8[$100 + 12 >> 0] | 0; //@line 391
        HEAP8[$$090117$i + 7 >> 0] = HEAP8[$100 + 13 >> 0] | 0; //@line 395
        HEAP8[$$090117$i + 8 >> 0] = HEAP8[$100 + 14 >> 0] | 0; //@line 399
        HEAP8[$$090117$i + 9 >> 0] = HEAP8[$100 + 15 >> 0] | 0; //@line 403
        HEAP8[$$090117$i + 10 >> 0] = HEAP8[$100 + 16 >> 0] | 0; //@line 407
        HEAP8[$$090117$i + 11 >> 0] = HEAP8[$100 + 17 >> 0] | 0; //@line 411
        HEAP8[$$090117$i + 12 >> 0] = HEAP8[$100 + 18 >> 0] | 0; //@line 415
        HEAP8[$$090117$i + 13 >> 0] = HEAP8[$100 + 19 >> 0] | 0; //@line 419
        HEAP8[$$090117$i + 14 >> 0] = HEAP8[$100 + 20 >> 0] | 0; //@line 423
        HEAP8[$$090117$i + 15 >> 0] = HEAP8[$100 + 21 >> 0] | 0; //@line 427
        HEAP8[$$090117$i + 16 >> 0] = HEAP8[$100 + 22 >> 0] | 0; //@line 431
        HEAP8[$$090117$i + 17 >> 0] = HEAP8[$100 + 23 >> 0] | 0; //@line 435
        HEAP8[$$090117$i + 18 >> 0] = HEAP8[$100 + 24 >> 0] | 0; //@line 439
        HEAP8[$$090117$i + 19 >> 0] = HEAP8[$100 + 25 >> 0] | 0; //@line 443
        $$0 = $100 + 26 | 0; //@line 446
        $$1$i = $$090117$i + 20 | 0; //@line 446
        $$196$i = $$095115$i + 1 | 0; //@line 446
        break;
       } else {
        $$0 = $119 + $124 | 0; //@line 450
        $$1$i = $$090117$i; //@line 450
        $$196$i = $$095115$i; //@line 450
        break;
       }
      }
     } while (0);
     $$094116$i = $$094116$i + 1 | 0; //@line 455
     if (!(($$094116$i | 0) < ($61 | 0) & $$196$i >>> 0 < $4 >>> 0)) {
      $$089$i = $$196$i; //@line 462
      break;
     } else {
      $$090117$i = $$1$i; //@line 460
      $$095115$i = $$196$i; //@line 460
      $84 = $$0; //@line 460
     }
    }
   } else {
    $$089$i = 0; //@line 467
   }
  } else {
   $$089$i = 0; //@line 470
  }
  $$355 = ($$089$i | 0) > 0 ? $$089$i : -3009; //@line 474
 }
 _free($10); //@line 476
 $ReallocAsyncCtx12 = _emscripten_realloc_async_context(16) | 0; //@line 477
 $200 = __ZN6Socket5closeEv($30) | 0; //@line 478
 if (___async) {
  HEAP32[$ReallocAsyncCtx12 >> 2] = 94; //@line 481
  $201 = $ReallocAsyncCtx12 + 4 | 0; //@line 482
  HEAP32[$201 >> 2] = $$355; //@line 483
  $202 = $ReallocAsyncCtx12 + 8 | 0; //@line 484
  HEAP32[$202 >> 2] = $28; //@line 485
  $203 = $ReallocAsyncCtx12 + 12 | 0; //@line 486
  HEAP32[$203 >> 2] = $26; //@line 487
  sp = STACKTOP; //@line 488
  STACKTOP = sp; //@line 489
  return;
 }
 HEAP32[___async_retval >> 2] = $200; //@line 492
 ___async_unwind = 0; //@line 493
 HEAP32[$ReallocAsyncCtx12 >> 2] = 94; //@line 494
 $201 = $ReallocAsyncCtx12 + 4 | 0; //@line 495
 HEAP32[$201 >> 2] = $$355; //@line 496
 $202 = $ReallocAsyncCtx12 + 8 | 0; //@line 497
 HEAP32[$202 >> 2] = $28; //@line 498
 $203 = $ReallocAsyncCtx12 + 12 | 0; //@line 499
 HEAP32[$203 >> 2] = $26; //@line 500
 sp = STACKTOP; //@line 501
 STACKTOP = sp; //@line 502
 return;
}
function __ZL24nsapi_dns_query_multipleP12NetworkStackPKcP10nsapi_addrj13nsapi_version__async_cb_68($0) {
 $0 = $0 | 0;
 var $$0 = 0, $$019$i$4 = 0, $$089$i = 0, $$090117$i = 0, $$093119$i = 0, $$094116$i = 0, $$095115$i = 0, $$1$i = 0, $$196$i = 0, $$355 = 0, $$byval_copy = 0, $$lcssa$i = 0, $10 = 0, $100 = 0, $108 = 0, $119 = 0, $12 = 0, $124 = 0, $125 = 0, $127 = 0, $14 = 0, $16 = 0, $18 = 0, $2 = 0, $20 = 0, $200 = 0, $201 = 0, $202 = 0, $203 = 0, $208 = 0, $210 = 0, $211 = 0, $212 = 0, $213 = 0, $22 = 0, $223 = 0, $230 = 0, $231 = 0, $232 = 0, $233 = 0, $234 = 0, $235 = 0, $236 = 0, $237 = 0, $238 = 0, $239 = 0, $24 = 0, $240 = 0, $241 = 0, $242 = 0, $243 = 0, $244 = 0, $245 = 0, $247 = 0, $26 = 0, $28 = 0, $30 = 0, $32 = 0, $34 = 0, $36 = 0, $38 = 0, $4 = 0, $55 = 0, $6 = 0, $61 = 0, $68 = 0, $69 = 0, $74 = 0, $76 = 0, $77 = 0, $8 = 0, $80 = 0, $84 = 0, $85 = 0, $89 = 0, $92 = 0, $94 = 0, $95 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx12 = 0, $ReallocAsyncCtx6 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 14019
 STACKTOP = STACKTOP + 32 | 0; //@line 14020
 $$byval_copy = sp; //@line 14021
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 14023
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 14025
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 14027
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 14029
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 14031
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 14033
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 14035
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 14037
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 14039
 $20 = HEAP32[$0 + 40 >> 2] | 0; //@line 14041
 $22 = HEAP32[$0 + 44 >> 2] | 0; //@line 14043
 $24 = HEAP32[$0 + 48 >> 2] | 0; //@line 14045
 $26 = HEAP32[$0 + 52 >> 2] | 0; //@line 14047
 $28 = HEAP32[$0 + 56 >> 2] | 0; //@line 14049
 $30 = HEAP32[$0 + 60 >> 2] | 0; //@line 14051
 $32 = HEAP8[$0 + 64 >> 0] | 0; //@line 14053
 $34 = HEAP32[$0 + 68 >> 2] | 0; //@line 14055
 $36 = HEAP32[$0 + 72 >> 2] | 0; //@line 14057
 $38 = HEAP32[$0 + 76 >> 2] | 0; //@line 14059
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 14061
 if (($AsyncRetVal | 0) == -3001) {
  HEAP8[$10 >> 0] = 0; //@line 14064
  HEAP8[$12 >> 0] = 1; //@line 14065
  HEAP8[$14 >> 0] = 1; //@line 14066
  HEAP8[$16 >> 0] = 0; //@line 14067
  HEAP8[$18 >> 0] = 0; //@line 14068
  HEAP8[$20 >> 0] = 1; //@line 14069
  HEAP8[$22 >> 0] = 0; //@line 14070
  HEAP8[$22 + 1 >> 0] = 0; //@line 14070
  HEAP8[$22 + 2 >> 0] = 0; //@line 14070
  HEAP8[$22 + 3 >> 0] = 0; //@line 14070
  HEAP8[$22 + 4 >> 0] = 0; //@line 14070
  HEAP8[$22 + 5 >> 0] = 0; //@line 14070
  if (!(HEAP8[$38 >> 0] | 0)) {
   $223 = $2; //@line 14074
  } else {
   $$019$i$4 = $38; //@line 14076
   $211 = $2; //@line 14076
   while (1) {
    $208 = _strcspn($$019$i$4, 4557) | 0; //@line 14078
    $210 = $211 + 1 | 0; //@line 14080
    HEAP8[$211 >> 0] = $208; //@line 14081
    $212 = $208 & 255; //@line 14082
    _memcpy($210 | 0, $$019$i$4 | 0, $212 | 0) | 0; //@line 14083
    $213 = $210 + $212 | 0; //@line 14084
    $$019$i$4 = $$019$i$4 + ($208 + ((HEAP8[$$019$i$4 + $208 >> 0] | 0) == 46 & 1)) | 0; //@line 14090
    if (!(HEAP8[$$019$i$4 >> 0] | 0)) {
     $223 = $213; //@line 14094
     break;
    } else {
     $211 = $213; //@line 14097
    }
   }
  }
  HEAP8[$223 >> 0] = 0; //@line 14102
  HEAP8[$223 + 1 >> 0] = 0; //@line 14104
  HEAP8[$223 + 2 >> 0] = $32; //@line 14106
  HEAP8[$223 + 3 >> 0] = 0; //@line 14108
  HEAP8[$223 + 4 >> 0] = 1; //@line 14109
  HEAP32[$$byval_copy >> 2] = HEAP32[144]; //@line 14110
  HEAP32[$$byval_copy + 4 >> 2] = HEAP32[145]; //@line 14110
  HEAP32[$$byval_copy + 8 >> 2] = HEAP32[146]; //@line 14110
  HEAP32[$$byval_copy + 12 >> 2] = HEAP32[147]; //@line 14110
  HEAP32[$$byval_copy + 16 >> 2] = HEAP32[148]; //@line 14110
  __ZN13SocketAddressC2E10nsapi_addrt($34, $$byval_copy, 53); //@line 14111
  $ReallocAsyncCtx6 = _emscripten_realloc_async_context(64) | 0; //@line 14115
  $230 = __ZN9UDPSocket6sendtoERK13SocketAddressPKvj($28, $34, $10, $223 + 5 - $36 | 0) | 0; //@line 14116
  if (___async) {
   HEAP32[$ReallocAsyncCtx6 >> 2] = 102; //@line 14119
   $231 = $ReallocAsyncCtx6 + 4 | 0; //@line 14120
   HEAP32[$231 >> 2] = $6; //@line 14121
   $232 = $ReallocAsyncCtx6 + 8 | 0; //@line 14122
   HEAP32[$232 >> 2] = $2; //@line 14123
   $233 = $ReallocAsyncCtx6 + 12 | 0; //@line 14124
   HEAP32[$233 >> 2] = $4; //@line 14125
   $234 = $ReallocAsyncCtx6 + 16 | 0; //@line 14126
   HEAP32[$234 >> 2] = $8; //@line 14127
   $235 = $ReallocAsyncCtx6 + 20 | 0; //@line 14128
   HEAP32[$235 >> 2] = $10; //@line 14129
   $236 = $ReallocAsyncCtx6 + 24 | 0; //@line 14130
   HEAP32[$236 >> 2] = $12; //@line 14131
   $237 = $ReallocAsyncCtx6 + 28 | 0; //@line 14132
   HEAP32[$237 >> 2] = $14; //@line 14133
   $238 = $ReallocAsyncCtx6 + 32 | 0; //@line 14134
   HEAP32[$238 >> 2] = $16; //@line 14135
   $239 = $ReallocAsyncCtx6 + 36 | 0; //@line 14136
   HEAP32[$239 >> 2] = $18; //@line 14137
   $240 = $ReallocAsyncCtx6 + 40 | 0; //@line 14138
   HEAP32[$240 >> 2] = $20; //@line 14139
   $241 = $ReallocAsyncCtx6 + 44 | 0; //@line 14140
   HEAP32[$241 >> 2] = $22; //@line 14141
   $242 = $ReallocAsyncCtx6 + 48 | 0; //@line 14142
   HEAP32[$242 >> 2] = $24; //@line 14143
   $243 = $ReallocAsyncCtx6 + 52 | 0; //@line 14144
   HEAP32[$243 >> 2] = $26; //@line 14145
   $244 = $ReallocAsyncCtx6 + 56 | 0; //@line 14146
   HEAP32[$244 >> 2] = $28; //@line 14147
   $245 = $ReallocAsyncCtx6 + 60 | 0; //@line 14148
   HEAP32[$245 >> 2] = $30; //@line 14149
   sp = STACKTOP; //@line 14150
   STACKTOP = sp; //@line 14151
   return;
  }
  HEAP32[___async_retval >> 2] = $230; //@line 14154
  ___async_unwind = 0; //@line 14155
  HEAP32[$ReallocAsyncCtx6 >> 2] = 102; //@line 14156
  $231 = $ReallocAsyncCtx6 + 4 | 0; //@line 14157
  HEAP32[$231 >> 2] = $6; //@line 14158
  $232 = $ReallocAsyncCtx6 + 8 | 0; //@line 14159
  HEAP32[$232 >> 2] = $2; //@line 14160
  $233 = $ReallocAsyncCtx6 + 12 | 0; //@line 14161
  HEAP32[$233 >> 2] = $4; //@line 14162
  $234 = $ReallocAsyncCtx6 + 16 | 0; //@line 14163
  HEAP32[$234 >> 2] = $8; //@line 14164
  $235 = $ReallocAsyncCtx6 + 20 | 0; //@line 14165
  HEAP32[$235 >> 2] = $10; //@line 14166
  $236 = $ReallocAsyncCtx6 + 24 | 0; //@line 14167
  HEAP32[$236 >> 2] = $12; //@line 14168
  $237 = $ReallocAsyncCtx6 + 28 | 0; //@line 14169
  HEAP32[$237 >> 2] = $14; //@line 14170
  $238 = $ReallocAsyncCtx6 + 32 | 0; //@line 14171
  HEAP32[$238 >> 2] = $16; //@line 14172
  $239 = $ReallocAsyncCtx6 + 36 | 0; //@line 14173
  HEAP32[$239 >> 2] = $18; //@line 14174
  $240 = $ReallocAsyncCtx6 + 40 | 0; //@line 14175
  HEAP32[$240 >> 2] = $20; //@line 14176
  $241 = $ReallocAsyncCtx6 + 44 | 0; //@line 14177
  HEAP32[$241 >> 2] = $22; //@line 14178
  $242 = $ReallocAsyncCtx6 + 48 | 0; //@line 14179
  HEAP32[$242 >> 2] = $24; //@line 14180
  $243 = $ReallocAsyncCtx6 + 52 | 0; //@line 14181
  HEAP32[$243 >> 2] = $26; //@line 14182
  $244 = $ReallocAsyncCtx6 + 56 | 0; //@line 14183
  HEAP32[$244 >> 2] = $28; //@line 14184
  $245 = $ReallocAsyncCtx6 + 60 | 0; //@line 14185
  HEAP32[$245 >> 2] = $30; //@line 14186
  sp = STACKTOP; //@line 14187
  STACKTOP = sp; //@line 14188
  return;
 }
 if (($AsyncRetVal | 0) < 0) {
  $$355 = $AsyncRetVal; //@line 14192
 } else {
  $55 = HEAPU8[$18 >> 0] << 8 | HEAPU8[$20 >> 0]; //@line 14208
  $61 = HEAPU8[$22 >> 0] << 8 | HEAPU8[$24 >> 0]; //@line 14214
  if (((HEAP8[$14 >> 0] & -8) << 24 >> 24 == -128 ? (HEAPU8[$10 >> 0] << 8 | HEAPU8[$12 >> 0] | 0) == 1 : 0) & (HEAP8[$16 >> 0] & 15) == 0) {
   if (!$55) {
    $247 = $2; //@line 14224
   } else {
    $$093119$i = 0; //@line 14226
    $69 = $2; //@line 14226
    while (1) {
     $68 = HEAP8[$69 >> 0] | 0; //@line 14228
     if (!($68 << 24 >> 24)) {
      $$lcssa$i = $69; //@line 14231
     } else {
      $74 = $69; //@line 14233
      $76 = $68; //@line 14233
      while (1) {
       $77 = $74 + 1 + ($76 & 255) | 0; //@line 14237
       $76 = HEAP8[$77 >> 0] | 0; //@line 14238
       if (!($76 << 24 >> 24)) {
        $$lcssa$i = $77; //@line 14241
        break;
       } else {
        $74 = $77; //@line 14244
       }
      }
     }
     $80 = $$lcssa$i + 5 | 0; //@line 14248
     $$093119$i = $$093119$i + 1 | 0; //@line 14249
     if (($$093119$i | 0) >= ($55 | 0)) {
      $247 = $80; //@line 14254
      break;
     } else {
      $69 = $80; //@line 14252
     }
    }
   }
   if (($4 | 0) != 0 & ($61 | 0) != 0) {
    $$090117$i = $8; //@line 14263
    $$094116$i = 0; //@line 14263
    $$095115$i = 0; //@line 14263
    $84 = $247; //@line 14263
    while (1) {
     $85 = HEAP8[$84 >> 0] | 0; //@line 14266
     do {
      if (!($85 << 24 >> 24)) {
       $100 = $84 + 1 | 0; //@line 14270
      } else {
       $89 = $85 & 255; //@line 14273
       $92 = $84; //@line 14273
       while (1) {
        if ($89 & 192 | 0) {
         label = 12; //@line 14278
         break;
        }
        $94 = $92 + 1 + $89 | 0; //@line 14282
        $95 = HEAP8[$94 >> 0] | 0; //@line 14283
        if (!($95 << 24 >> 24)) {
         label = 14; //@line 14287
         break;
        } else {
         $89 = $95 & 255; //@line 14290
         $92 = $94; //@line 14290
        }
       }
       if ((label | 0) == 12) {
        label = 0; //@line 14294
        $100 = $92 + 2 | 0; //@line 14296
        break;
       } else if ((label | 0) == 14) {
        label = 0; //@line 14300
        $100 = $94 + 1 | 0; //@line 14302
        break;
       }
      }
     } while (0);
     $108 = (HEAPU8[$100 >> 0] << 8 | HEAPU8[$100 + 1 >> 0]) & 65535; //@line 14315
     $119 = $100 + 10 | 0; //@line 14326
     $124 = HEAPU8[$100 + 8 >> 0] << 8 | HEAPU8[$100 + 9 >> 0]; //@line 14331
     $125 = $124 & 65535; //@line 14332
     $127 = (HEAPU8[$100 + 2 >> 0] << 8 | HEAPU8[$100 + 3 >> 0] | 0) == 1; //@line 14334
     do {
      if ($108 << 16 >> 16 == 1 & $127 & $125 << 16 >> 16 == 4) {
       HEAP32[$$090117$i >> 2] = 1; //@line 14340
       HEAP8[$$090117$i + 4 >> 0] = HEAP8[$119 >> 0] | 0; //@line 14344
       HEAP8[$$090117$i + 5 >> 0] = HEAP8[$100 + 11 >> 0] | 0; //@line 14348
       HEAP8[$$090117$i + 6 >> 0] = HEAP8[$100 + 12 >> 0] | 0; //@line 14352
       HEAP8[$$090117$i + 7 >> 0] = HEAP8[$100 + 13 >> 0] | 0; //@line 14356
       $$0 = $100 + 14 | 0; //@line 14359
       $$1$i = $$090117$i + 20 | 0; //@line 14359
       $$196$i = $$095115$i + 1 | 0; //@line 14359
      } else {
       if ($108 << 16 >> 16 == 28 & $127 & $125 << 16 >> 16 == 16) {
        HEAP32[$$090117$i >> 2] = 2; //@line 14366
        HEAP8[$$090117$i + 4 >> 0] = HEAP8[$119 >> 0] | 0; //@line 14370
        HEAP8[$$090117$i + 5 >> 0] = HEAP8[$100 + 11 >> 0] | 0; //@line 14374
        HEAP8[$$090117$i + 6 >> 0] = HEAP8[$100 + 12 >> 0] | 0; //@line 14378
        HEAP8[$$090117$i + 7 >> 0] = HEAP8[$100 + 13 >> 0] | 0; //@line 14382
        HEAP8[$$090117$i + 8 >> 0] = HEAP8[$100 + 14 >> 0] | 0; //@line 14386
        HEAP8[$$090117$i + 9 >> 0] = HEAP8[$100 + 15 >> 0] | 0; //@line 14390
        HEAP8[$$090117$i + 10 >> 0] = HEAP8[$100 + 16 >> 0] | 0; //@line 14394
        HEAP8[$$090117$i + 11 >> 0] = HEAP8[$100 + 17 >> 0] | 0; //@line 14398
        HEAP8[$$090117$i + 12 >> 0] = HEAP8[$100 + 18 >> 0] | 0; //@line 14402
        HEAP8[$$090117$i + 13 >> 0] = HEAP8[$100 + 19 >> 0] | 0; //@line 14406
        HEAP8[$$090117$i + 14 >> 0] = HEAP8[$100 + 20 >> 0] | 0; //@line 14410
        HEAP8[$$090117$i + 15 >> 0] = HEAP8[$100 + 21 >> 0] | 0; //@line 14414
        HEAP8[$$090117$i + 16 >> 0] = HEAP8[$100 + 22 >> 0] | 0; //@line 14418
        HEAP8[$$090117$i + 17 >> 0] = HEAP8[$100 + 23 >> 0] | 0; //@line 14422
        HEAP8[$$090117$i + 18 >> 0] = HEAP8[$100 + 24 >> 0] | 0; //@line 14426
        HEAP8[$$090117$i + 19 >> 0] = HEAP8[$100 + 25 >> 0] | 0; //@line 14430
        $$0 = $100 + 26 | 0; //@line 14433
        $$1$i = $$090117$i + 20 | 0; //@line 14433
        $$196$i = $$095115$i + 1 | 0; //@line 14433
        break;
       } else {
        $$0 = $119 + $124 | 0; //@line 14437
        $$1$i = $$090117$i; //@line 14437
        $$196$i = $$095115$i; //@line 14437
        break;
       }
      }
     } while (0);
     $$094116$i = $$094116$i + 1 | 0; //@line 14442
     if (!(($$094116$i | 0) < ($61 | 0) & $$196$i >>> 0 < $4 >>> 0)) {
      $$089$i = $$196$i; //@line 14449
      break;
     } else {
      $$090117$i = $$1$i; //@line 14447
      $$095115$i = $$196$i; //@line 14447
      $84 = $$0; //@line 14447
     }
    }
   } else {
    $$089$i = 0; //@line 14454
   }
  } else {
   $$089$i = 0; //@line 14457
  }
  $$355 = ($$089$i | 0) > 0 ? $$089$i : -3009; //@line 14461
 }
 _free($10); //@line 14463
 $ReallocAsyncCtx12 = _emscripten_realloc_async_context(16) | 0; //@line 14464
 $200 = __ZN6Socket5closeEv($30) | 0; //@line 14465
 if (___async) {
  HEAP32[$ReallocAsyncCtx12 >> 2] = 94; //@line 14468
  $201 = $ReallocAsyncCtx12 + 4 | 0; //@line 14469
  HEAP32[$201 >> 2] = $$355; //@line 14470
  $202 = $ReallocAsyncCtx12 + 8 | 0; //@line 14471
  HEAP32[$202 >> 2] = $28; //@line 14472
  $203 = $ReallocAsyncCtx12 + 12 | 0; //@line 14473
  HEAP32[$203 >> 2] = $26; //@line 14474
  sp = STACKTOP; //@line 14475
  STACKTOP = sp; //@line 14476
  return;
 }
 HEAP32[___async_retval >> 2] = $200; //@line 14479
 ___async_unwind = 0; //@line 14480
 HEAP32[$ReallocAsyncCtx12 >> 2] = 94; //@line 14481
 $201 = $ReallocAsyncCtx12 + 4 | 0; //@line 14482
 HEAP32[$201 >> 2] = $$355; //@line 14483
 $202 = $ReallocAsyncCtx12 + 8 | 0; //@line 14484
 HEAP32[$202 >> 2] = $28; //@line 14485
 $203 = $ReallocAsyncCtx12 + 12 | 0; //@line 14486
 HEAP32[$203 >> 2] = $26; //@line 14487
 sp = STACKTOP; //@line 14488
 STACKTOP = sp; //@line 14489
 return;
}
function _main() {
 var $105 = 0, $106 = 0, $107 = 0, $119 = 0, $121 = 0, $13 = 0, $27 = 0, $42 = 0, $51 = 0, $52 = 0, $62 = 0, $81 = 0, $91 = 0, $92 = 0, $AsyncCtx = 0, $AsyncCtx22 = 0, $AsyncCtx25 = 0, $AsyncCtx29 = 0, $AsyncCtx33 = 0, $AsyncCtx37 = 0, $AsyncCtx41 = 0, $AsyncCtx44 = 0, $AsyncCtx47 = 0, $AsyncCtx51 = 0, $AsyncCtx54 = 0, $AsyncCtx58 = 0, $vararg_buffer = 0, $vararg_buffer1 = 0, $vararg_buffer12 = 0, $vararg_buffer17 = 0, $vararg_buffer4 = 0, $vararg_buffer7 = 0, dest = 0, sp = 0, src = 0, stop = 0;
 sp = STACKTOP; //@line 5160
 STACKTOP = STACKTOP + 128 | 0; //@line 5161
 $vararg_buffer17 = sp + 112 | 0; //@line 5162
 $vararg_buffer12 = sp + 96 | 0; //@line 5163
 $vararg_buffer7 = sp + 80 | 0; //@line 5164
 $vararg_buffer4 = sp + 16 | 0; //@line 5165
 $vararg_buffer1 = sp + 8 | 0; //@line 5166
 $vararg_buffer = sp; //@line 5167
 $AsyncCtx29 = _emscripten_alloc_async_context(56, sp) | 0; //@line 5168
 _puts(3549) | 0; //@line 5169
 if (___async) {
  HEAP32[$AsyncCtx29 >> 2] = 125; //@line 5172
  HEAP32[$AsyncCtx29 + 4 >> 2] = $vararg_buffer; //@line 5174
  HEAP32[$AsyncCtx29 + 8 >> 2] = $vararg_buffer; //@line 5176
  HEAP32[$AsyncCtx29 + 12 >> 2] = $vararg_buffer1; //@line 5178
  HEAP32[$AsyncCtx29 + 16 >> 2] = $vararg_buffer1; //@line 5180
  HEAP32[$AsyncCtx29 + 20 >> 2] = $vararg_buffer4; //@line 5182
  HEAP32[$AsyncCtx29 + 24 >> 2] = $vararg_buffer4; //@line 5184
  HEAP32[$AsyncCtx29 + 28 >> 2] = $vararg_buffer4; //@line 5186
  HEAP32[$AsyncCtx29 + 32 >> 2] = $vararg_buffer7; //@line 5188
  HEAP32[$AsyncCtx29 + 36 >> 2] = $vararg_buffer7; //@line 5190
  HEAP32[$AsyncCtx29 + 40 >> 2] = $vararg_buffer12; //@line 5192
  HEAP32[$AsyncCtx29 + 44 >> 2] = $vararg_buffer12; //@line 5194
  HEAP32[$AsyncCtx29 + 48 >> 2] = $vararg_buffer17; //@line 5196
  HEAP32[$AsyncCtx29 + 52 >> 2] = $vararg_buffer17; //@line 5198
  sp = STACKTOP; //@line 5199
  STACKTOP = sp; //@line 5200
  return 0; //@line 5200
 }
 _emscripten_free_async_context($AsyncCtx29 | 0); //@line 5202
 $AsyncCtx58 = _emscripten_alloc_async_context(56, sp) | 0; //@line 5203
 $13 = __ZN17EthernetInterface14get_ip_addressEv(596) | 0; //@line 5204
 if (___async) {
  HEAP32[$AsyncCtx58 >> 2] = 126; //@line 5207
  HEAP32[$AsyncCtx58 + 4 >> 2] = $vararg_buffer7; //@line 5209
  HEAP32[$AsyncCtx58 + 8 >> 2] = $vararg_buffer7; //@line 5211
  HEAP32[$AsyncCtx58 + 12 >> 2] = $vararg_buffer4; //@line 5213
  HEAP32[$AsyncCtx58 + 16 >> 2] = $vararg_buffer12; //@line 5215
  HEAP32[$AsyncCtx58 + 20 >> 2] = $vararg_buffer12; //@line 5217
  HEAP32[$AsyncCtx58 + 24 >> 2] = $vararg_buffer17; //@line 5219
  HEAP32[$AsyncCtx58 + 28 >> 2] = $vararg_buffer17; //@line 5221
  HEAP32[$AsyncCtx58 + 32 >> 2] = $vararg_buffer; //@line 5223
  HEAP32[$AsyncCtx58 + 36 >> 2] = $vararg_buffer; //@line 5225
  HEAP32[$AsyncCtx58 + 40 >> 2] = $vararg_buffer1; //@line 5227
  HEAP32[$AsyncCtx58 + 44 >> 2] = $vararg_buffer1; //@line 5229
  HEAP32[$AsyncCtx58 + 48 >> 2] = $vararg_buffer4; //@line 5231
  HEAP32[$AsyncCtx58 + 52 >> 2] = $vararg_buffer4; //@line 5233
  sp = STACKTOP; //@line 5234
  STACKTOP = sp; //@line 5235
  return 0; //@line 5235
 }
 _emscripten_free_async_context($AsyncCtx58 | 0); //@line 5237
 $AsyncCtx54 = _emscripten_alloc_async_context(60, sp) | 0; //@line 5238
 $27 = __ZN17EthernetInterface15get_mac_addressEv(596) | 0; //@line 5239
 if (___async) {
  HEAP32[$AsyncCtx54 >> 2] = 127; //@line 5242
  HEAP32[$AsyncCtx54 + 4 >> 2] = $vararg_buffer7; //@line 5244
  HEAP32[$AsyncCtx54 + 8 >> 2] = $vararg_buffer7; //@line 5246
  HEAP32[$AsyncCtx54 + 12 >> 2] = $vararg_buffer4; //@line 5248
  HEAP32[$AsyncCtx54 + 16 >> 2] = $vararg_buffer12; //@line 5250
  HEAP32[$AsyncCtx54 + 20 >> 2] = $vararg_buffer12; //@line 5252
  HEAP32[$AsyncCtx54 + 24 >> 2] = $vararg_buffer17; //@line 5254
  HEAP32[$AsyncCtx54 + 28 >> 2] = $vararg_buffer17; //@line 5256
  HEAP32[$AsyncCtx54 + 32 >> 2] = $13; //@line 5258
  HEAP32[$AsyncCtx54 + 36 >> 2] = $vararg_buffer; //@line 5260
  HEAP32[$AsyncCtx54 + 40 >> 2] = $vararg_buffer; //@line 5262
  HEAP32[$AsyncCtx54 + 44 >> 2] = $vararg_buffer1; //@line 5264
  HEAP32[$AsyncCtx54 + 48 >> 2] = $vararg_buffer1; //@line 5266
  HEAP32[$AsyncCtx54 + 52 >> 2] = $vararg_buffer4; //@line 5268
  HEAP32[$AsyncCtx54 + 56 >> 2] = $vararg_buffer4; //@line 5270
  sp = STACKTOP; //@line 5271
  STACKTOP = sp; //@line 5272
  return 0; //@line 5272
 }
 _emscripten_free_async_context($AsyncCtx54 | 0); //@line 5274
 $42 = __ZN17EthernetInterface11get_gatewayEv(596) | 0; //@line 5275
 HEAP32[$vararg_buffer >> 2] = $13 | 0 ? $13 : 3573; //@line 5278
 _printf(3578, $vararg_buffer) | 0; //@line 5279
 HEAP32[$vararg_buffer1 >> 2] = $27 | 0 ? $27 : 3573; //@line 5282
 _printf(3594, $vararg_buffer1) | 0; //@line 5283
 HEAP32[$vararg_buffer4 >> 2] = $42 | 0 ? $42 : 3573; //@line 5286
 _printf(3611, $vararg_buffer4) | 0; //@line 5287
 __ZN9TCPSocketC2Ev($vararg_buffer4); //@line 5288
 $51 = HEAP32[(HEAP32[149] | 0) + 60 >> 2] | 0; //@line 5291
 $AsyncCtx = _emscripten_alloc_async_context(40, sp) | 0; //@line 5292
 $52 = FUNCTION_TABLE_ii[$51 & 15](596) | 0; //@line 5293
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 128; //@line 5296
  HEAP32[$AsyncCtx + 4 >> 2] = $vararg_buffer4; //@line 5298
  HEAP32[$AsyncCtx + 8 >> 2] = $vararg_buffer7; //@line 5300
  HEAP32[$AsyncCtx + 12 >> 2] = $vararg_buffer7; //@line 5302
  HEAP32[$AsyncCtx + 16 >> 2] = $vararg_buffer4; //@line 5304
  HEAP32[$AsyncCtx + 20 >> 2] = $vararg_buffer4; //@line 5306
  HEAP32[$AsyncCtx + 24 >> 2] = $vararg_buffer12; //@line 5308
  HEAP32[$AsyncCtx + 28 >> 2] = $vararg_buffer12; //@line 5310
  HEAP32[$AsyncCtx + 32 >> 2] = $vararg_buffer17; //@line 5312
  HEAP32[$AsyncCtx + 36 >> 2] = $vararg_buffer17; //@line 5314
  sp = STACKTOP; //@line 5315
  STACKTOP = sp; //@line 5316
  return 0; //@line 5316
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 5318
 $62 = __Z18nsapi_create_stackP12NetworkStack($52) | 0; //@line 5319
 $AsyncCtx51 = _emscripten_alloc_async_context(40, sp) | 0; //@line 5320
 __ZN6Socket4openEP12NetworkStack($vararg_buffer4, $62) | 0; //@line 5321
 if (___async) {
  HEAP32[$AsyncCtx51 >> 2] = 129; //@line 5324
  HEAP32[$AsyncCtx51 + 4 >> 2] = $vararg_buffer4; //@line 5326
  HEAP32[$AsyncCtx51 + 8 >> 2] = $vararg_buffer7; //@line 5328
  HEAP32[$AsyncCtx51 + 12 >> 2] = $vararg_buffer7; //@line 5330
  HEAP32[$AsyncCtx51 + 16 >> 2] = $vararg_buffer12; //@line 5332
  HEAP32[$AsyncCtx51 + 20 >> 2] = $vararg_buffer12; //@line 5334
  HEAP32[$AsyncCtx51 + 24 >> 2] = $vararg_buffer17; //@line 5336
  HEAP32[$AsyncCtx51 + 28 >> 2] = $vararg_buffer17; //@line 5338
  HEAP32[$AsyncCtx51 + 32 >> 2] = $vararg_buffer4; //@line 5340
  HEAP32[$AsyncCtx51 + 36 >> 2] = $vararg_buffer4; //@line 5342
  sp = STACKTOP; //@line 5343
  STACKTOP = sp; //@line 5344
  return 0; //@line 5344
 }
 _emscripten_free_async_context($AsyncCtx51 | 0); //@line 5346
 $AsyncCtx41 = _emscripten_alloc_async_context(40, sp) | 0; //@line 5347
 __ZN9TCPSocket7connectEPKct($vararg_buffer4, 3624, 80) | 0; //@line 5348
 if (___async) {
  HEAP32[$AsyncCtx41 >> 2] = 130; //@line 5351
  HEAP32[$AsyncCtx41 + 4 >> 2] = $vararg_buffer4; //@line 5353
  HEAP32[$AsyncCtx41 + 8 >> 2] = $vararg_buffer7; //@line 5355
  HEAP32[$AsyncCtx41 + 12 >> 2] = $vararg_buffer7; //@line 5357
  HEAP32[$AsyncCtx41 + 16 >> 2] = $vararg_buffer12; //@line 5359
  HEAP32[$AsyncCtx41 + 20 >> 2] = $vararg_buffer12; //@line 5361
  HEAP32[$AsyncCtx41 + 24 >> 2] = $vararg_buffer17; //@line 5363
  HEAP32[$AsyncCtx41 + 28 >> 2] = $vararg_buffer17; //@line 5365
  HEAP32[$AsyncCtx41 + 32 >> 2] = $vararg_buffer4; //@line 5367
  HEAP32[$AsyncCtx41 + 36 >> 2] = $vararg_buffer4; //@line 5369
  sp = STACKTOP; //@line 5370
  STACKTOP = sp; //@line 5371
  return 0; //@line 5371
 }
 _emscripten_free_async_context($AsyncCtx41 | 0); //@line 5373
 $AsyncCtx22 = _emscripten_alloc_async_context(40, sp) | 0; //@line 5374
 $81 = __Znaj(256) | 0; //@line 5375
 if (___async) {
  HEAP32[$AsyncCtx22 >> 2] = 131; //@line 5378
  HEAP32[$AsyncCtx22 + 4 >> 2] = $vararg_buffer4; //@line 5380
  HEAP32[$AsyncCtx22 + 8 >> 2] = $vararg_buffer7; //@line 5382
  HEAP32[$AsyncCtx22 + 12 >> 2] = $vararg_buffer7; //@line 5384
  HEAP32[$AsyncCtx22 + 16 >> 2] = $vararg_buffer12; //@line 5386
  HEAP32[$AsyncCtx22 + 20 >> 2] = $vararg_buffer12; //@line 5388
  HEAP32[$AsyncCtx22 + 24 >> 2] = $vararg_buffer17; //@line 5390
  HEAP32[$AsyncCtx22 + 28 >> 2] = $vararg_buffer17; //@line 5392
  HEAP32[$AsyncCtx22 + 32 >> 2] = $vararg_buffer4; //@line 5394
  HEAP32[$AsyncCtx22 + 36 >> 2] = $vararg_buffer4; //@line 5396
  sp = STACKTOP; //@line 5397
  STACKTOP = sp; //@line 5398
  return 0; //@line 5398
 }
 _emscripten_free_async_context($AsyncCtx22 | 0); //@line 5400
 dest = $81; //@line 5401
 src = 3638; //@line 5401
 stop = dest + 40 | 0; //@line 5401
 do {
  HEAP8[dest >> 0] = HEAP8[src >> 0] | 0; //@line 5401
  dest = dest + 1 | 0; //@line 5401
  src = src + 1 | 0; //@line 5401
 } while ((dest | 0) < (stop | 0));
 $91 = _strlen($81) | 0; //@line 5402
 $AsyncCtx37 = _emscripten_alloc_async_context(44, sp) | 0; //@line 5403
 $92 = __ZN9TCPSocket4sendEPKvj($vararg_buffer4, $81, $91) | 0; //@line 5404
 if (___async) {
  HEAP32[$AsyncCtx37 >> 2] = 132; //@line 5407
  HEAP32[$AsyncCtx37 + 4 >> 2] = $81; //@line 5409
  HEAP32[$AsyncCtx37 + 8 >> 2] = $vararg_buffer7; //@line 5411
  HEAP32[$AsyncCtx37 + 12 >> 2] = $vararg_buffer7; //@line 5413
  HEAP32[$AsyncCtx37 + 16 >> 2] = $vararg_buffer4; //@line 5415
  HEAP32[$AsyncCtx37 + 20 >> 2] = $vararg_buffer12; //@line 5417
  HEAP32[$AsyncCtx37 + 24 >> 2] = $vararg_buffer12; //@line 5419
  HEAP32[$AsyncCtx37 + 28 >> 2] = $vararg_buffer17; //@line 5421
  HEAP32[$AsyncCtx37 + 32 >> 2] = $vararg_buffer17; //@line 5423
  HEAP32[$AsyncCtx37 + 36 >> 2] = $vararg_buffer4; //@line 5425
  HEAP32[$AsyncCtx37 + 40 >> 2] = $vararg_buffer4; //@line 5427
  sp = STACKTOP; //@line 5428
  STACKTOP = sp; //@line 5429
  return 0; //@line 5429
 }
 _emscripten_free_async_context($AsyncCtx37 | 0); //@line 5431
 $105 = $81; //@line 5434
 $106 = (_strstr($81, 3678) | 0) - $105 | 0; //@line 5435
 HEAP32[$vararg_buffer7 >> 2] = $92; //@line 5436
 HEAP32[$vararg_buffer7 + 4 >> 2] = $106; //@line 5438
 HEAP32[$vararg_buffer7 + 8 >> 2] = $81; //@line 5440
 _printf(3681, $vararg_buffer7) | 0; //@line 5441
 $AsyncCtx33 = _emscripten_alloc_async_context(40, sp) | 0; //@line 5442
 $107 = __ZN9TCPSocket4recvEPvj($vararg_buffer4, $81, 256) | 0; //@line 5443
 if (___async) {
  HEAP32[$AsyncCtx33 >> 2] = 133; //@line 5446
  HEAP32[$AsyncCtx33 + 4 >> 2] = $81; //@line 5448
  HEAP32[$AsyncCtx33 + 8 >> 2] = $105; //@line 5450
  HEAP32[$AsyncCtx33 + 12 >> 2] = $vararg_buffer12; //@line 5452
  HEAP32[$AsyncCtx33 + 16 >> 2] = $vararg_buffer12; //@line 5454
  HEAP32[$AsyncCtx33 + 20 >> 2] = $vararg_buffer17; //@line 5456
  HEAP32[$AsyncCtx33 + 24 >> 2] = $vararg_buffer17; //@line 5458
  HEAP32[$AsyncCtx33 + 28 >> 2] = $vararg_buffer4; //@line 5460
  HEAP32[$AsyncCtx33 + 32 >> 2] = $vararg_buffer4; //@line 5462
  HEAP32[$AsyncCtx33 + 36 >> 2] = $vararg_buffer4; //@line 5464
  sp = STACKTOP; //@line 5465
  STACKTOP = sp; //@line 5466
  return 0; //@line 5466
 }
 _emscripten_free_async_context($AsyncCtx33 | 0); //@line 5468
 $119 = (_strstr($81, 3678) | 0) - $105 | 0; //@line 5471
 HEAP32[$vararg_buffer12 >> 2] = $107; //@line 5472
 HEAP32[$vararg_buffer12 + 4 >> 2] = $119; //@line 5474
 HEAP32[$vararg_buffer12 + 8 >> 2] = $81; //@line 5476
 _printf(3697, $vararg_buffer12) | 0; //@line 5477
 $121 = (_strstr($81, 3713) | 0) + 4 | 0; //@line 5479
 HEAP32[$vararg_buffer17 >> 2] = $107 + $105 - $121; //@line 5483
 HEAP32[$vararg_buffer17 + 4 >> 2] = $121; //@line 5485
 _printf(3718, $vararg_buffer17) | 0; //@line 5486
 $AsyncCtx47 = _emscripten_alloc_async_context(16, sp) | 0; //@line 5487
 __ZN6Socket5closeEv($vararg_buffer4) | 0; //@line 5488
 if (___async) {
  HEAP32[$AsyncCtx47 >> 2] = 134; //@line 5491
  HEAP32[$AsyncCtx47 + 4 >> 2] = $81; //@line 5493
  HEAP32[$AsyncCtx47 + 8 >> 2] = $vararg_buffer4; //@line 5495
  HEAP32[$AsyncCtx47 + 12 >> 2] = $vararg_buffer4; //@line 5497
  sp = STACKTOP; //@line 5498
  STACKTOP = sp; //@line 5499
  return 0; //@line 5499
 }
 _emscripten_free_async_context($AsyncCtx47 | 0); //@line 5501
 __ZdaPv($81); //@line 5502
 $AsyncCtx25 = _emscripten_alloc_async_context(12, sp) | 0; //@line 5503
 _puts(3745) | 0; //@line 5504
 if (___async) {
  HEAP32[$AsyncCtx25 >> 2] = 135; //@line 5507
  HEAP32[$AsyncCtx25 + 4 >> 2] = $vararg_buffer4; //@line 5509
  HEAP32[$AsyncCtx25 + 8 >> 2] = $vararg_buffer4; //@line 5511
  sp = STACKTOP; //@line 5512
  STACKTOP = sp; //@line 5513
  return 0; //@line 5513
 }
 _emscripten_free_async_context($AsyncCtx25 | 0); //@line 5515
 $AsyncCtx44 = _emscripten_alloc_async_context(8, sp) | 0; //@line 5516
 __ZN9TCPSocketD2Ev($vararg_buffer4); //@line 5517
 if (___async) {
  HEAP32[$AsyncCtx44 >> 2] = 136; //@line 5520
  HEAP32[$AsyncCtx44 + 4 >> 2] = $vararg_buffer4; //@line 5522
  sp = STACKTOP; //@line 5523
  STACKTOP = sp; //@line 5524
  return 0; //@line 5524
 } else {
  _emscripten_free_async_context($AsyncCtx44 | 0); //@line 5526
  STACKTOP = sp; //@line 5527
  return 0; //@line 5527
 }
 return 0; //@line 5529
}
function _hexfloat($0, $1, $2, $3, $4) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 var $$0 = 0, $$0133 = 0, $$0142 = 0, $$0146 = 0, $$0148 = 0, $$0151 = 0.0, $$0152 = 0.0, $$0155 = 0.0, $$0159 = 0, $$0165 = 0.0, $$0166 = 0, $$0166169 = 0, $$0166170 = 0, $$1$ph = 0, $$1147 = 0, $$1149 = 0, $$1153 = 0.0, $$1156 = 0.0, $$1160 = 0, $$2 = 0, $$2$lcssa = 0, $$2144 = 0, $$2150 = 0, $$2154 = 0.0, $$2157 = 0.0, $$2161 = 0, $$3145 = 0, $$3158$lcssa = 0.0, $$3158179 = 0.0, $$3162$lcssa = 0, $$3162183 = 0, $$4 = 0.0, $$4163$lcssa = 0, $$4163178 = 0, $$5164 = 0, $$pre = 0, $$pre$phi201Z2D = 0.0, $104 = 0, $105 = 0, $106 = 0, $116 = 0, $117 = 0, $130 = 0, $132 = 0, $134 = 0, $135 = 0, $136 = 0, $137 = 0, $14 = 0, $141 = 0, $143 = 0, $153 = 0, $155 = 0, $166 = 0, $170 = 0, $171 = 0, $172 = 0, $173 = 0, $176 = 0, $179 = 0, $181 = 0, $182 = 0, $183 = 0, $184 = 0, $193 = 0.0, $194 = 0, $207 = 0.0, $21 = 0, $211 = 0, $212 = 0, $213 = 0, $214 = 0, $29 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $41 = 0, $42 = 0, $46 = 0, $5 = 0, $51 = 0, $53 = 0, $6 = 0, $65 = 0.0, $7 = 0, $72 = 0, $74 = 0, $83 = 0, $94 = 0, $95 = 0, $96 = 0, $97 = 0, $98 = 0, $or$cond = 0, $or$cond168 = 0, label = 0, $105$looptemp = 0;
 $5 = $0 + 4 | 0; //@line 1158
 $6 = HEAP32[$5 >> 2] | 0; //@line 1159
 $7 = $0 + 100 | 0; //@line 1160
 if ($6 >>> 0 < (HEAP32[$7 >> 2] | 0) >>> 0) {
  HEAP32[$5 >> 2] = $6 + 1; //@line 1165
  $$0 = HEAPU8[$6 >> 0] | 0; //@line 1168
  $$0142 = 0; //@line 1168
 } else {
  $$0 = ___shgetc($0) | 0; //@line 1171
  $$0142 = 0; //@line 1171
 }
 L4 : while (1) {
  switch ($$0 | 0) {
  case 46:
   {
    label = 8; //@line 1176
    break L4;
    break;
   }
  case 48:
   {
    break;
   }
  default:
   {
    $$0146 = 0; //@line 1184
    $$0148 = 0; //@line 1184
    $$0152 = 1.0; //@line 1184
    $$0155 = 0.0; //@line 1184
    $$0159 = 0; //@line 1184
    $$2 = $$0; //@line 1184
    $$2144 = $$0142; //@line 1184
    $51 = 0; //@line 1184
    $53 = 0; //@line 1184
    $96 = 0; //@line 1184
    $98 = 0; //@line 1184
    break L4;
   }
  }
  $14 = HEAP32[$5 >> 2] | 0; //@line 1188
  if ($14 >>> 0 < (HEAP32[$7 >> 2] | 0) >>> 0) {
   HEAP32[$5 >> 2] = $14 + 1; //@line 1193
   $$0 = HEAPU8[$14 >> 0] | 0; //@line 1196
   $$0142 = 1; //@line 1196
   continue;
  } else {
   $$0 = ___shgetc($0) | 0; //@line 1200
   $$0142 = 1; //@line 1200
   continue;
  }
 }
 if ((label | 0) == 8) {
  $21 = HEAP32[$5 >> 2] | 0; //@line 1205
  if ($21 >>> 0 < (HEAP32[$7 >> 2] | 0) >>> 0) {
   HEAP32[$5 >> 2] = $21 + 1; //@line 1210
   $$1$ph = HEAPU8[$21 >> 0] | 0; //@line 1213
  } else {
   $$1$ph = ___shgetc($0) | 0; //@line 1216
  }
  if (($$1$ph | 0) == 48) {
   $36 = 0; //@line 1220
   $37 = 0; //@line 1220
   while (1) {
    $29 = HEAP32[$5 >> 2] | 0; //@line 1222
    if ($29 >>> 0 < (HEAP32[$7 >> 2] | 0) >>> 0) {
     HEAP32[$5 >> 2] = $29 + 1; //@line 1227
     $41 = HEAPU8[$29 >> 0] | 0; //@line 1230
    } else {
     $41 = ___shgetc($0) | 0; //@line 1233
    }
    $38 = _i64Add($36 | 0, $37 | 0, -1, -1) | 0; //@line 1235
    $39 = tempRet0; //@line 1236
    if (($41 | 0) == 48) {
     $36 = $38; //@line 1239
     $37 = $39; //@line 1239
    } else {
     $$0146 = 1; //@line 1241
     $$0148 = 0; //@line 1241
     $$0152 = 1.0; //@line 1241
     $$0155 = 0.0; //@line 1241
     $$0159 = 0; //@line 1241
     $$2 = $41; //@line 1241
     $$2144 = 1; //@line 1241
     $51 = 0; //@line 1241
     $53 = 0; //@line 1241
     $96 = $38; //@line 1241
     $98 = $39; //@line 1241
     break;
    }
   }
  } else {
   $$0146 = 1; //@line 1246
   $$0148 = 0; //@line 1246
   $$0152 = 1.0; //@line 1246
   $$0155 = 0.0; //@line 1246
   $$0159 = 0; //@line 1246
   $$2 = $$1$ph; //@line 1246
   $$2144 = $$0142; //@line 1246
   $51 = 0; //@line 1246
   $53 = 0; //@line 1246
   $96 = 0; //@line 1246
   $98 = 0; //@line 1246
  }
 }
 while (1) {
  $42 = $$2 + -48 | 0; //@line 1250
  $$pre = $$2 | 32; //@line 1252
  if ($42 >>> 0 < 10) {
   label = 20; //@line 1254
  } else {
   $46 = ($$2 | 0) == 46; //@line 1258
   if (!($46 | ($$pre + -97 | 0) >>> 0 < 6)) {
    $$2$lcssa = $$2; //@line 1261
    break;
   }
   if ($46) {
    if (!$$0146) {
     $$1147 = 1; //@line 1267
     $$2150 = $$0148; //@line 1267
     $$2154 = $$0152; //@line 1267
     $$2157 = $$0155; //@line 1267
     $$2161 = $$0159; //@line 1267
     $$3145 = $$2144; //@line 1267
     $211 = $53; //@line 1267
     $212 = $51; //@line 1267
     $213 = $53; //@line 1267
     $214 = $51; //@line 1267
    } else {
     $$2$lcssa = 46; //@line 1269
     break;
    }
   } else {
    label = 20; //@line 1273
   }
  }
  if ((label | 0) == 20) {
   label = 0; //@line 1277
   $$0133 = ($$2 | 0) > 57 ? $$pre + -87 | 0 : $42; //@line 1280
   do {
    if (($51 | 0) < 0 | ($51 | 0) == 0 & $53 >>> 0 < 8) {
     $$1149 = $$0148; //@line 1290
     $$1153 = $$0152; //@line 1290
     $$1156 = $$0155; //@line 1290
     $$1160 = $$0133 + ($$0159 << 4) | 0; //@line 1290
    } else {
     if (($51 | 0) < 0 | ($51 | 0) == 0 & $53 >>> 0 < 14) {
      $65 = $$0152 * .0625; //@line 1299
      $$1149 = $$0148; //@line 1302
      $$1153 = $65; //@line 1302
      $$1156 = $$0155 + $65 * +($$0133 | 0); //@line 1302
      $$1160 = $$0159; //@line 1302
      break;
     } else {
      $or$cond = ($$0148 | 0) != 0 | ($$0133 | 0) == 0; //@line 1307
      $$1149 = $or$cond ? $$0148 : 1; //@line 1312
      $$1153 = $$0152; //@line 1312
      $$1156 = $or$cond ? $$0155 : $$0155 + $$0152 * .5; //@line 1312
      $$1160 = $$0159; //@line 1312
      break;
     }
    }
   } while (0);
   $72 = _i64Add($53 | 0, $51 | 0, 1, 0) | 0; //@line 1317
   $$1147 = $$0146; //@line 1319
   $$2150 = $$1149; //@line 1319
   $$2154 = $$1153; //@line 1319
   $$2157 = $$1156; //@line 1319
   $$2161 = $$1160; //@line 1319
   $$3145 = 1; //@line 1319
   $211 = $96; //@line 1319
   $212 = $98; //@line 1319
   $213 = $72; //@line 1319
   $214 = tempRet0; //@line 1319
  }
  $74 = HEAP32[$5 >> 2] | 0; //@line 1321
  if ($74 >>> 0 < (HEAP32[$7 >> 2] | 0) >>> 0) {
   HEAP32[$5 >> 2] = $74 + 1; //@line 1326
   $$0146 = $$1147; //@line 1329
   $$0148 = $$2150; //@line 1329
   $$0152 = $$2154; //@line 1329
   $$0155 = $$2157; //@line 1329
   $$0159 = $$2161; //@line 1329
   $$2 = HEAPU8[$74 >> 0] | 0; //@line 1329
   $$2144 = $$3145; //@line 1329
   $51 = $214; //@line 1329
   $53 = $213; //@line 1329
   $96 = $211; //@line 1329
   $98 = $212; //@line 1329
   continue;
  } else {
   $$0146 = $$1147; //@line 1333
   $$0148 = $$2150; //@line 1333
   $$0152 = $$2154; //@line 1333
   $$0155 = $$2157; //@line 1333
   $$0159 = $$2161; //@line 1333
   $$2 = ___shgetc($0) | 0; //@line 1333
   $$2144 = $$3145; //@line 1333
   $51 = $214; //@line 1333
   $53 = $213; //@line 1333
   $96 = $211; //@line 1333
   $98 = $212; //@line 1333
   continue;
  }
 }
 do {
  if (!$$2144) {
   $83 = (HEAP32[$7 >> 2] | 0) == 0; //@line 1341
   if (!$83) {
    HEAP32[$5 >> 2] = (HEAP32[$5 >> 2] | 0) + -1; //@line 1345
   }
   if (!$4) {
    ___shlim($0, 0); //@line 1349
   } else {
    if (!$83) {
     HEAP32[$5 >> 2] = (HEAP32[$5 >> 2] | 0) + -1; //@line 1354
    }
    if (!(($$0146 | 0) == 0 | $83)) {
     HEAP32[$5 >> 2] = (HEAP32[$5 >> 2] | 0) + -1; //@line 1361
    }
   }
   $$0165 = +($3 | 0) * 0.0; //@line 1366
  } else {
   $94 = ($$0146 | 0) == 0; //@line 1368
   $95 = $94 ? $53 : $96; //@line 1369
   $97 = $94 ? $51 : $98; //@line 1370
   if (($51 | 0) < 0 | ($51 | 0) == 0 & $53 >>> 0 < 8) {
    $$3162183 = $$0159; //@line 1377
    $105 = $53; //@line 1377
    $106 = $51; //@line 1377
    while (1) {
     $104 = $$3162183 << 4; //@line 1379
     $105$looptemp = $105;
     $105 = _i64Add($105 | 0, $106 | 0, 1, 0) | 0; //@line 1380
     if (!(($106 | 0) < 0 | ($106 | 0) == 0 & $105$looptemp >>> 0 < 7)) {
      $$3162$lcssa = $104; //@line 1390
      break;
     } else {
      $$3162183 = $104; //@line 1388
      $106 = tempRet0; //@line 1388
     }
    }
   } else {
    $$3162$lcssa = $$0159; //@line 1395
   }
   if (($$2$lcssa | 32 | 0) == 112) {
    $116 = _scanexp($0, $4) | 0; //@line 1400
    $117 = tempRet0; //@line 1401
    if (($116 | 0) == 0 & ($117 | 0) == -2147483648) {
     if (!$4) {
      ___shlim($0, 0); //@line 1408
      $$0165 = 0.0; //@line 1409
      break;
     }
     if (!(HEAP32[$7 >> 2] | 0)) {
      $134 = 0; //@line 1415
      $135 = 0; //@line 1415
     } else {
      HEAP32[$5 >> 2] = (HEAP32[$5 >> 2] | 0) + -1; //@line 1419
      $134 = 0; //@line 1420
      $135 = 0; //@line 1420
     }
    } else {
     $134 = $116; //@line 1423
     $135 = $117; //@line 1423
    }
   } else {
    if (!(HEAP32[$7 >> 2] | 0)) {
     $134 = 0; //@line 1429
     $135 = 0; //@line 1429
    } else {
     HEAP32[$5 >> 2] = (HEAP32[$5 >> 2] | 0) + -1; //@line 1433
     $134 = 0; //@line 1434
     $135 = 0; //@line 1434
    }
   }
   $130 = _bitshift64Shl($95 | 0, $97 | 0, 2) | 0; //@line 1437
   $132 = _i64Add($130 | 0, tempRet0 | 0, -32, -1) | 0; //@line 1439
   $136 = _i64Add($132 | 0, tempRet0 | 0, $134 | 0, $135 | 0) | 0; //@line 1441
   $137 = tempRet0; //@line 1442
   if (!$$3162$lcssa) {
    $$0165 = +($3 | 0) * 0.0; //@line 1447
    break;
   }
   $141 = 0 - $2 | 0; //@line 1450
   $143 = (($141 | 0) < 0) << 31 >> 31; //@line 1452
   if (($137 | 0) > ($143 | 0) | ($137 | 0) == ($143 | 0) & $136 >>> 0 > $141 >>> 0) {
    HEAP32[(___errno_location() | 0) >> 2] = 34; //@line 1460
    $$0165 = +($3 | 0) * 1.7976931348623157e+308 * 1.7976931348623157e+308; //@line 1464
    break;
   }
   $153 = $2 + -106 | 0; //@line 1467
   $155 = (($153 | 0) < 0) << 31 >> 31; //@line 1469
   if (($137 | 0) < ($155 | 0) | ($137 | 0) == ($155 | 0) & $136 >>> 0 < $153 >>> 0) {
    HEAP32[(___errno_location() | 0) >> 2] = 34; //@line 1477
    $$0165 = +($3 | 0) * 2.2250738585072014e-308 * 2.2250738585072014e-308; //@line 1481
    break;
   }
   if (($$3162$lcssa | 0) > -1) {
    $$3158179 = $$0155; //@line 1486
    $$4163178 = $$3162$lcssa; //@line 1486
    $170 = $136; //@line 1486
    $171 = $137; //@line 1486
    while (1) {
     $166 = !($$3158179 >= .5); //@line 1488
     $$5164 = $$4163178 << 1 | ($166 ^ 1) & 1; //@line 1493
     $$4 = $$3158179 + ($166 ? $$3158179 : $$3158179 + -1.0); //@line 1495
     $172 = _i64Add($170 | 0, $171 | 0, -1, -1) | 0; //@line 1496
     $173 = tempRet0; //@line 1497
     if (($$5164 | 0) > -1) {
      $$3158179 = $$4; //@line 1500
      $$4163178 = $$5164; //@line 1500
      $170 = $172; //@line 1500
      $171 = $173; //@line 1500
     } else {
      $$3158$lcssa = $$4; //@line 1502
      $$4163$lcssa = $$5164; //@line 1502
      $181 = $172; //@line 1502
      $182 = $173; //@line 1502
      break;
     }
    }
   } else {
    $$3158$lcssa = $$0155; //@line 1507
    $$4163$lcssa = $$3162$lcssa; //@line 1507
    $181 = $136; //@line 1507
    $182 = $137; //@line 1507
   }
   $176 = (($1 | 0) < 0) << 31 >> 31; //@line 1510
   $179 = _i64Subtract(32, 0, $2 | 0, (($2 | 0) < 0) << 31 >> 31 | 0) | 0; //@line 1513
   $183 = _i64Add($179 | 0, tempRet0 | 0, $181 | 0, $182 | 0) | 0; //@line 1515
   $184 = tempRet0; //@line 1516
   if (($184 | 0) < ($176 | 0) | ($184 | 0) == ($176 | 0) & $183 >>> 0 < $1 >>> 0) {
    if (($183 | 0) > 0) {
     $$0166 = $183; //@line 1525
     label = 59; //@line 1526
    } else {
     $$0166170 = 0; //@line 1528
     $194 = 84; //@line 1528
     label = 61; //@line 1529
    }
   } else {
    $$0166 = $1; //@line 1532
    label = 59; //@line 1533
   }
   if ((label | 0) == 59) {
    if (($$0166 | 0) < 53) {
     $$0166170 = $$0166; //@line 1539
     $194 = 84 - $$0166 | 0; //@line 1539
     label = 61; //@line 1540
    } else {
     $$0151 = 0.0; //@line 1543
     $$0166169 = $$0166; //@line 1543
     $$pre$phi201Z2D = +($3 | 0); //@line 1543
    }
   }
   if ((label | 0) == 61) {
    $193 = +($3 | 0); //@line 1547
    $$0151 = +_copysignl(+_scalbn(1.0, $194), $193); //@line 1550
    $$0166169 = $$0166170; //@line 1550
    $$pre$phi201Z2D = $193; //@line 1550
   }
   $or$cond168 = ($$4163$lcssa & 1 | 0) == 0 & ($$3158$lcssa != 0.0 & ($$0166169 | 0) < 32); //@line 1557
   $207 = ($or$cond168 ? 0.0 : $$3158$lcssa) * $$pre$phi201Z2D + ($$0151 + $$pre$phi201Z2D * +(($$4163$lcssa + ($or$cond168 & 1) | 0) >>> 0)) - $$0151; //@line 1566
   if (!($207 != 0.0)) {
    HEAP32[(___errno_location() | 0) >> 2] = 34; //@line 1570
   }
   $$0165 = +_scalbnl($207, $181); //@line 1573
  }
 } while (0);
 return +$$0165;
}
function _twoway_strstr($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0166 = 0, $$0168 = 0, $$0169 = 0, $$0169$be = 0, $$0170 = 0, $$0175$ph$ph$lcssa216 = 0, $$0175$ph$ph$lcssa216328 = 0, $$0175$ph$ph254 = 0, $$0179242 = 0, $$0183$ph197$ph253 = 0, $$0183$ph197248 = 0, $$0183$ph260 = 0, $$0185$ph$lcssa = 0, $$0185$ph$lcssa327 = 0, $$0185$ph259 = 0, $$0187219$ph325326 = 0, $$0187263 = 0, $$1176$$0175 = 0, $$1176$ph$ph$lcssa208 = 0, $$1176$ph$ph233 = 0, $$1180222 = 0, $$1184$ph193$ph232 = 0, $$1184$ph193227 = 0, $$1184$ph239 = 0, $$1186$$0185 = 0, $$1186$ph$lcssa = 0, $$1186$ph238 = 0, $$2181$sink = 0, $$3 = 0, $$3173 = 0, $$3178 = 0, $$3182221 = 0, $$4 = 0, $$pr = 0, $10 = 0, $105 = 0, $111 = 0, $113 = 0, $118 = 0, $130 = 0, $131 = 0, $132 = 0, $133 = 0, $134 = 0, $135 = 0, $14 = 0, $2 = 0, $23 = 0, $25 = 0, $27 = 0, $3 = 0, $32 = 0, $34 = 0, $37 = 0, $4 = 0, $41 = 0, $45 = 0, $50 = 0, $52 = 0, $53 = 0, $56 = 0, $60 = 0, $68 = 0, $70 = 0, $74 = 0, $78 = 0, $79 = 0, $80 = 0, $81 = 0, $83 = 0, $86 = 0, $93 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 6199
 STACKTOP = STACKTOP + 1056 | 0; //@line 6200
 $2 = sp + 1024 | 0; //@line 6201
 $3 = sp; //@line 6202
 HEAP32[$2 >> 2] = 0; //@line 6203
 HEAP32[$2 + 4 >> 2] = 0; //@line 6203
 HEAP32[$2 + 8 >> 2] = 0; //@line 6203
 HEAP32[$2 + 12 >> 2] = 0; //@line 6203
 HEAP32[$2 + 16 >> 2] = 0; //@line 6203
 HEAP32[$2 + 20 >> 2] = 0; //@line 6203
 HEAP32[$2 + 24 >> 2] = 0; //@line 6203
 HEAP32[$2 + 28 >> 2] = 0; //@line 6203
 $4 = HEAP8[$1 >> 0] | 0; //@line 6204
 L1 : do {
  if (!($4 << 24 >> 24)) {
   $$0175$ph$ph$lcssa216328 = 1; //@line 6208
   $$0185$ph$lcssa327 = -1; //@line 6208
   $$0187219$ph325326 = 0; //@line 6208
   $$1176$ph$ph$lcssa208 = 1; //@line 6208
   $$1186$ph$lcssa = -1; //@line 6208
   label = 26; //@line 6209
  } else {
   $$0187263 = 0; //@line 6211
   $10 = $4; //@line 6211
   do {
    if (!(HEAP8[$0 + $$0187263 >> 0] | 0)) {
     $$3 = 0; //@line 6217
     break L1;
    }
    $14 = $2 + ((($10 & 255) >>> 5 & 255) << 2) | 0; //@line 6225
    HEAP32[$14 >> 2] = HEAP32[$14 >> 2] | 1 << ($10 & 31); //@line 6228
    $$0187263 = $$0187263 + 1 | 0; //@line 6229
    HEAP32[$3 + (($10 & 255) << 2) >> 2] = $$0187263; //@line 6232
    $10 = HEAP8[$1 + $$0187263 >> 0] | 0; //@line 6234
   } while ($10 << 24 >> 24 != 0);
   $23 = $$0187263 >>> 0 > 1; //@line 6242
   if ($23) {
    $$0183$ph260 = 0; //@line 6244
    $$0185$ph259 = -1; //@line 6244
    $130 = 1; //@line 6244
    L6 : while (1) {
     $$0175$ph$ph254 = 1; //@line 6246
     $$0183$ph197$ph253 = $$0183$ph260; //@line 6246
     $131 = $130; //@line 6246
     while (1) {
      $$0183$ph197248 = $$0183$ph197$ph253; //@line 6248
      $132 = $131; //@line 6248
      L10 : while (1) {
       $$0179242 = 1; //@line 6250
       $25 = $132; //@line 6250
       while (1) {
        $32 = HEAP8[$1 + ($$0179242 + $$0185$ph259) >> 0] | 0; //@line 6254
        $34 = HEAP8[$1 + $25 >> 0] | 0; //@line 6256
        if ($32 << 24 >> 24 != $34 << 24 >> 24) {
         break L10;
        }
        if (($$0179242 | 0) == ($$0175$ph$ph254 | 0)) {
         break;
        }
        $$0179242 = $$0179242 + 1 | 0; //@line 6262
        $27 = $$0179242 + $$0183$ph197248 | 0; //@line 6266
        if ($27 >>> 0 >= $$0187263 >>> 0) {
         $$0175$ph$ph$lcssa216 = $$0175$ph$ph254; //@line 6271
         $$0185$ph$lcssa = $$0185$ph259; //@line 6271
         break L6;
        } else {
         $25 = $27; //@line 6269
        }
       }
       $37 = $$0175$ph$ph254 + $$0183$ph197248 | 0; //@line 6275
       $132 = $37 + 1 | 0; //@line 6276
       if ($132 >>> 0 >= $$0187263 >>> 0) {
        $$0175$ph$ph$lcssa216 = $$0175$ph$ph254; //@line 6281
        $$0185$ph$lcssa = $$0185$ph259; //@line 6281
        break L6;
       } else {
        $$0183$ph197248 = $37; //@line 6279
       }
      }
      $41 = $25 - $$0185$ph259 | 0; //@line 6286
      if (($32 & 255) <= ($34 & 255)) {
       break;
      }
      $131 = $25 + 1 | 0; //@line 6290
      if ($131 >>> 0 >= $$0187263 >>> 0) {
       $$0175$ph$ph$lcssa216 = $41; //@line 6295
       $$0185$ph$lcssa = $$0185$ph259; //@line 6295
       break L6;
      } else {
       $$0175$ph$ph254 = $41; //@line 6293
       $$0183$ph197$ph253 = $25; //@line 6293
      }
     }
     $130 = $$0183$ph197248 + 2 | 0; //@line 6300
     if ($130 >>> 0 >= $$0187263 >>> 0) {
      $$0175$ph$ph$lcssa216 = 1; //@line 6305
      $$0185$ph$lcssa = $$0183$ph197248; //@line 6305
      break;
     } else {
      $$0183$ph260 = $$0183$ph197248 + 1 | 0; //@line 6303
      $$0185$ph259 = $$0183$ph197248; //@line 6303
     }
    }
    if ($23) {
     $$1184$ph239 = 0; //@line 6310
     $$1186$ph238 = -1; //@line 6310
     $133 = 1; //@line 6310
     while (1) {
      $$1176$ph$ph233 = 1; //@line 6312
      $$1184$ph193$ph232 = $$1184$ph239; //@line 6312
      $135 = $133; //@line 6312
      while (1) {
       $$1184$ph193227 = $$1184$ph193$ph232; //@line 6314
       $134 = $135; //@line 6314
       L25 : while (1) {
        $$1180222 = 1; //@line 6316
        $52 = $134; //@line 6316
        while (1) {
         $50 = HEAP8[$1 + ($$1180222 + $$1186$ph238) >> 0] | 0; //@line 6320
         $53 = HEAP8[$1 + $52 >> 0] | 0; //@line 6322
         if ($50 << 24 >> 24 != $53 << 24 >> 24) {
          break L25;
         }
         if (($$1180222 | 0) == ($$1176$ph$ph233 | 0)) {
          break;
         }
         $$1180222 = $$1180222 + 1 | 0; //@line 6328
         $45 = $$1180222 + $$1184$ph193227 | 0; //@line 6332
         if ($45 >>> 0 >= $$0187263 >>> 0) {
          $$0175$ph$ph$lcssa216328 = $$0175$ph$ph$lcssa216; //@line 6337
          $$0185$ph$lcssa327 = $$0185$ph$lcssa; //@line 6337
          $$0187219$ph325326 = $$0187263; //@line 6337
          $$1176$ph$ph$lcssa208 = $$1176$ph$ph233; //@line 6337
          $$1186$ph$lcssa = $$1186$ph238; //@line 6337
          label = 26; //@line 6338
          break L1;
         } else {
          $52 = $45; //@line 6335
         }
        }
        $56 = $$1176$ph$ph233 + $$1184$ph193227 | 0; //@line 6342
        $134 = $56 + 1 | 0; //@line 6343
        if ($134 >>> 0 >= $$0187263 >>> 0) {
         $$0175$ph$ph$lcssa216328 = $$0175$ph$ph$lcssa216; //@line 6348
         $$0185$ph$lcssa327 = $$0185$ph$lcssa; //@line 6348
         $$0187219$ph325326 = $$0187263; //@line 6348
         $$1176$ph$ph$lcssa208 = $$1176$ph$ph233; //@line 6348
         $$1186$ph$lcssa = $$1186$ph238; //@line 6348
         label = 26; //@line 6349
         break L1;
        } else {
         $$1184$ph193227 = $56; //@line 6346
        }
       }
       $60 = $52 - $$1186$ph238 | 0; //@line 6354
       if (($50 & 255) >= ($53 & 255)) {
        break;
       }
       $135 = $52 + 1 | 0; //@line 6358
       if ($135 >>> 0 >= $$0187263 >>> 0) {
        $$0175$ph$ph$lcssa216328 = $$0175$ph$ph$lcssa216; //@line 6363
        $$0185$ph$lcssa327 = $$0185$ph$lcssa; //@line 6363
        $$0187219$ph325326 = $$0187263; //@line 6363
        $$1176$ph$ph$lcssa208 = $60; //@line 6363
        $$1186$ph$lcssa = $$1186$ph238; //@line 6363
        label = 26; //@line 6364
        break L1;
       } else {
        $$1176$ph$ph233 = $60; //@line 6361
        $$1184$ph193$ph232 = $52; //@line 6361
       }
      }
      $133 = $$1184$ph193227 + 2 | 0; //@line 6369
      if ($133 >>> 0 >= $$0187263 >>> 0) {
       $$0175$ph$ph$lcssa216328 = $$0175$ph$ph$lcssa216; //@line 6374
       $$0185$ph$lcssa327 = $$0185$ph$lcssa; //@line 6374
       $$0187219$ph325326 = $$0187263; //@line 6374
       $$1176$ph$ph$lcssa208 = 1; //@line 6374
       $$1186$ph$lcssa = $$1184$ph193227; //@line 6374
       label = 26; //@line 6375
       break;
      } else {
       $$1184$ph239 = $$1184$ph193227 + 1 | 0; //@line 6372
       $$1186$ph238 = $$1184$ph193227; //@line 6372
      }
     }
    } else {
     $$0175$ph$ph$lcssa216328 = $$0175$ph$ph$lcssa216; //@line 6380
     $$0185$ph$lcssa327 = $$0185$ph$lcssa; //@line 6380
     $$0187219$ph325326 = $$0187263; //@line 6380
     $$1176$ph$ph$lcssa208 = 1; //@line 6380
     $$1186$ph$lcssa = -1; //@line 6380
     label = 26; //@line 6381
    }
   } else {
    $$0175$ph$ph$lcssa216328 = 1; //@line 6384
    $$0185$ph$lcssa327 = -1; //@line 6384
    $$0187219$ph325326 = $$0187263; //@line 6384
    $$1176$ph$ph$lcssa208 = 1; //@line 6384
    $$1186$ph$lcssa = -1; //@line 6384
    label = 26; //@line 6385
   }
  }
 } while (0);
 L35 : do {
  if ((label | 0) == 26) {
   $68 = ($$1186$ph$lcssa + 1 | 0) >>> 0 > ($$0185$ph$lcssa327 + 1 | 0) >>> 0; //@line 6393
   $$1176$$0175 = $68 ? $$1176$ph$ph$lcssa208 : $$0175$ph$ph$lcssa216328; //@line 6394
   $$1186$$0185 = $68 ? $$1186$ph$lcssa : $$0185$ph$lcssa327; //@line 6395
   $70 = $$1186$$0185 + 1 | 0; //@line 6397
   if (!(_memcmp($1, $1 + $$1176$$0175 | 0, $70) | 0)) {
    $$0168 = $$0187219$ph325326 - $$1176$$0175 | 0; //@line 6402
    $$3178 = $$1176$$0175; //@line 6402
   } else {
    $74 = $$0187219$ph325326 - $$1186$$0185 + -1 | 0; //@line 6405
    $$0168 = 0; //@line 6409
    $$3178 = ($$1186$$0185 >>> 0 > $74 >>> 0 ? $$1186$$0185 : $74) + 1 | 0; //@line 6409
   }
   $78 = $$0187219$ph325326 | 63; //@line 6411
   $79 = $$0187219$ph325326 + -1 | 0; //@line 6412
   $80 = ($$0168 | 0) != 0; //@line 6413
   $81 = $$0187219$ph325326 - $$3178 | 0; //@line 6414
   $$0166 = $0; //@line 6415
   $$0169 = 0; //@line 6415
   $$0170 = $0; //@line 6415
   while (1) {
    $83 = $$0166; //@line 6418
    do {
     if (($$0170 - $83 | 0) >>> 0 < $$0187219$ph325326 >>> 0) {
      $86 = _memchr($$0170, 0, $78) | 0; //@line 6423
      if (!$86) {
       $$3173 = $$0170 + $78 | 0; //@line 6427
       break;
      } else {
       if (($86 - $83 | 0) >>> 0 < $$0187219$ph325326 >>> 0) {
        $$3 = 0; //@line 6434
        break L35;
       } else {
        $$3173 = $86; //@line 6437
        break;
       }
      }
     } else {
      $$3173 = $$0170; //@line 6442
     }
    } while (0);
    $93 = HEAP8[$$0166 + $79 >> 0] | 0; //@line 6446
    L49 : do {
     if (!(1 << ($93 & 31) & HEAP32[$2 + ((($93 & 255) >>> 5 & 255) << 2) >> 2])) {
      $$0169$be = 0; //@line 6458
      $$2181$sink = $$0187219$ph325326; //@line 6458
     } else {
      $105 = $$0187219$ph325326 - (HEAP32[$3 + (($93 & 255) << 2) >> 2] | 0) | 0; //@line 6463
      if ($105 | 0) {
       $$0169$be = 0; //@line 6471
       $$2181$sink = $80 & ($$0169 | 0) != 0 & $105 >>> 0 < $$3178 >>> 0 ? $81 : $105; //@line 6471
       break;
      }
      $111 = $70 >>> 0 > $$0169 >>> 0 ? $70 : $$0169; //@line 6475
      $113 = HEAP8[$1 + $111 >> 0] | 0; //@line 6477
      L54 : do {
       if (!($113 << 24 >> 24)) {
        $$4 = $70; //@line 6481
       } else {
        $$3182221 = $111; //@line 6483
        $$pr = $113; //@line 6483
        while (1) {
         if ($$pr << 24 >> 24 != (HEAP8[$$0166 + $$3182221 >> 0] | 0)) {
          break;
         }
         $118 = $$3182221 + 1 | 0; //@line 6491
         $$pr = HEAP8[$1 + $118 >> 0] | 0; //@line 6493
         if (!($$pr << 24 >> 24)) {
          $$4 = $70; //@line 6496
          break L54;
         } else {
          $$3182221 = $118; //@line 6499
         }
        }
        $$0169$be = 0; //@line 6503
        $$2181$sink = $$3182221 - $$1186$$0185 | 0; //@line 6503
        break L49;
       }
      } while (0);
      while (1) {
       if ($$4 >>> 0 <= $$0169 >>> 0) {
        $$3 = $$0166; //@line 6510
        break L35;
       }
       $$4 = $$4 + -1 | 0; //@line 6513
       if ((HEAP8[$1 + $$4 >> 0] | 0) != (HEAP8[$$0166 + $$4 >> 0] | 0)) {
        $$0169$be = $$0168; //@line 6522
        $$2181$sink = $$3178; //@line 6522
        break;
       }
      }
     }
    } while (0);
    $$0166 = $$0166 + $$2181$sink | 0; //@line 6529
    $$0169 = $$0169$be; //@line 6529
    $$0170 = $$3173; //@line 6529
   }
  }
 } while (0);
 STACKTOP = sp; //@line 6533
 return $$3 | 0; //@line 6533
}
function __ZL24nsapi_dns_query_multipleP12NetworkStackPKcP10nsapi_addrj13nsapi_version__async_cb_74($0) {
 $0 = $0 | 0;
 var $$019$i$3 = 0, $$byval_copy = 0, $10 = 0, $100 = 0, $101 = 0, $102 = 0, $103 = 0, $104 = 0, $105 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $2 = 0, $20 = 0, $22 = 0, $24 = 0, $26 = 0, $28 = 0, $30 = 0, $32 = 0, $34 = 0, $36 = 0, $38 = 0, $4 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $64 = 0, $66 = 0, $67 = 0, $68 = 0, $69 = 0, $79 = 0, $8 = 0, $86 = 0, $87 = 0, $88 = 0, $89 = 0, $90 = 0, $91 = 0, $92 = 0, $93 = 0, $94 = 0, $95 = 0, $96 = 0, $97 = 0, $98 = 0, $99 = 0, $ReallocAsyncCtx3 = 0, $ReallocAsyncCtx7 = 0, sp = 0;
 sp = STACKTOP; //@line 1898
 STACKTOP = STACKTOP + 32 | 0; //@line 1899
 $$byval_copy = sp; //@line 1900
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 1902
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 1904
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 1906
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 1908
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 1910
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 1912
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 1914
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 1916
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 1918
 $20 = HEAP32[$0 + 40 >> 2] | 0; //@line 1920
 $22 = HEAP32[$0 + 44 >> 2] | 0; //@line 1922
 $24 = HEAP32[$0 + 48 >> 2] | 0; //@line 1924
 $26 = HEAP32[$0 + 52 >> 2] | 0; //@line 1926
 $28 = HEAP32[$0 + 56 >> 2] | 0; //@line 1928
 $30 = HEAP32[$0 + 60 >> 2] | 0; //@line 1930
 $32 = HEAP8[$0 + 64 >> 0] | 0; //@line 1932
 $34 = HEAP32[$0 + 68 >> 2] | 0; //@line 1934
 $36 = HEAP32[$0 + 72 >> 2] | 0; //@line 1936
 $38 = HEAP32[$0 + 76 >> 2] | 0; //@line 1938
 if ((HEAP32[___async_retval >> 2] | 0) >= 0) {
  $ReallocAsyncCtx3 = _emscripten_realloc_async_context(80) | 0; //@line 1943
  $41 = __ZN9UDPSocket8recvfromEP13SocketAddressPvj($28, 0, $10, 512) | 0; //@line 1944
  if (___async) {
   HEAP32[$ReallocAsyncCtx3 >> 2] = 99; //@line 1947
   $42 = $ReallocAsyncCtx3 + 4 | 0; //@line 1948
   HEAP32[$42 >> 2] = $2; //@line 1949
   $43 = $ReallocAsyncCtx3 + 8 | 0; //@line 1950
   HEAP32[$43 >> 2] = $4; //@line 1951
   $44 = $ReallocAsyncCtx3 + 12 | 0; //@line 1952
   HEAP32[$44 >> 2] = $6; //@line 1953
   $45 = $ReallocAsyncCtx3 + 16 | 0; //@line 1954
   HEAP32[$45 >> 2] = $8; //@line 1955
   $46 = $ReallocAsyncCtx3 + 20 | 0; //@line 1956
   HEAP32[$46 >> 2] = $10; //@line 1957
   $47 = $ReallocAsyncCtx3 + 24 | 0; //@line 1958
   HEAP32[$47 >> 2] = $12; //@line 1959
   $48 = $ReallocAsyncCtx3 + 28 | 0; //@line 1960
   HEAP32[$48 >> 2] = $14; //@line 1961
   $49 = $ReallocAsyncCtx3 + 32 | 0; //@line 1962
   HEAP32[$49 >> 2] = $16; //@line 1963
   $50 = $ReallocAsyncCtx3 + 36 | 0; //@line 1964
   HEAP32[$50 >> 2] = $18; //@line 1965
   $51 = $ReallocAsyncCtx3 + 40 | 0; //@line 1966
   HEAP32[$51 >> 2] = $20; //@line 1967
   $52 = $ReallocAsyncCtx3 + 44 | 0; //@line 1968
   HEAP32[$52 >> 2] = $22; //@line 1969
   $53 = $ReallocAsyncCtx3 + 48 | 0; //@line 1970
   HEAP32[$53 >> 2] = $24; //@line 1971
   $54 = $ReallocAsyncCtx3 + 52 | 0; //@line 1972
   HEAP32[$54 >> 2] = $26; //@line 1973
   $55 = $ReallocAsyncCtx3 + 56 | 0; //@line 1974
   HEAP32[$55 >> 2] = $28; //@line 1975
   $56 = $ReallocAsyncCtx3 + 60 | 0; //@line 1976
   HEAP32[$56 >> 2] = $30; //@line 1977
   $57 = $ReallocAsyncCtx3 + 64 | 0; //@line 1978
   HEAP8[$57 >> 0] = $32; //@line 1979
   $58 = $ReallocAsyncCtx3 + 68 | 0; //@line 1980
   HEAP32[$58 >> 2] = $34; //@line 1981
   $59 = $ReallocAsyncCtx3 + 72 | 0; //@line 1982
   HEAP32[$59 >> 2] = $36; //@line 1983
   $60 = $ReallocAsyncCtx3 + 76 | 0; //@line 1984
   HEAP32[$60 >> 2] = $38; //@line 1985
   sp = STACKTOP; //@line 1986
   STACKTOP = sp; //@line 1987
   return;
  }
  HEAP32[___async_retval >> 2] = $41; //@line 1990
  ___async_unwind = 0; //@line 1991
  HEAP32[$ReallocAsyncCtx3 >> 2] = 99; //@line 1992
  $42 = $ReallocAsyncCtx3 + 4 | 0; //@line 1993
  HEAP32[$42 >> 2] = $2; //@line 1994
  $43 = $ReallocAsyncCtx3 + 8 | 0; //@line 1995
  HEAP32[$43 >> 2] = $4; //@line 1996
  $44 = $ReallocAsyncCtx3 + 12 | 0; //@line 1997
  HEAP32[$44 >> 2] = $6; //@line 1998
  $45 = $ReallocAsyncCtx3 + 16 | 0; //@line 1999
  HEAP32[$45 >> 2] = $8; //@line 2000
  $46 = $ReallocAsyncCtx3 + 20 | 0; //@line 2001
  HEAP32[$46 >> 2] = $10; //@line 2002
  $47 = $ReallocAsyncCtx3 + 24 | 0; //@line 2003
  HEAP32[$47 >> 2] = $12; //@line 2004
  $48 = $ReallocAsyncCtx3 + 28 | 0; //@line 2005
  HEAP32[$48 >> 2] = $14; //@line 2006
  $49 = $ReallocAsyncCtx3 + 32 | 0; //@line 2007
  HEAP32[$49 >> 2] = $16; //@line 2008
  $50 = $ReallocAsyncCtx3 + 36 | 0; //@line 2009
  HEAP32[$50 >> 2] = $18; //@line 2010
  $51 = $ReallocAsyncCtx3 + 40 | 0; //@line 2011
  HEAP32[$51 >> 2] = $20; //@line 2012
  $52 = $ReallocAsyncCtx3 + 44 | 0; //@line 2013
  HEAP32[$52 >> 2] = $22; //@line 2014
  $53 = $ReallocAsyncCtx3 + 48 | 0; //@line 2015
  HEAP32[$53 >> 2] = $24; //@line 2016
  $54 = $ReallocAsyncCtx3 + 52 | 0; //@line 2017
  HEAP32[$54 >> 2] = $26; //@line 2018
  $55 = $ReallocAsyncCtx3 + 56 | 0; //@line 2019
  HEAP32[$55 >> 2] = $28; //@line 2020
  $56 = $ReallocAsyncCtx3 + 60 | 0; //@line 2021
  HEAP32[$56 >> 2] = $30; //@line 2022
  $57 = $ReallocAsyncCtx3 + 64 | 0; //@line 2023
  HEAP8[$57 >> 0] = $32; //@line 2024
  $58 = $ReallocAsyncCtx3 + 68 | 0; //@line 2025
  HEAP32[$58 >> 2] = $34; //@line 2026
  $59 = $ReallocAsyncCtx3 + 72 | 0; //@line 2027
  HEAP32[$59 >> 2] = $36; //@line 2028
  $60 = $ReallocAsyncCtx3 + 76 | 0; //@line 2029
  HEAP32[$60 >> 2] = $38; //@line 2030
  sp = STACKTOP; //@line 2031
  STACKTOP = sp; //@line 2032
  return;
 }
 HEAP8[$10 >> 0] = 0; //@line 2034
 HEAP8[$12 >> 0] = 1; //@line 2035
 HEAP8[$14 >> 0] = 1; //@line 2036
 HEAP8[$16 >> 0] = 0; //@line 2037
 HEAP8[$18 >> 0] = 0; //@line 2038
 HEAP8[$20 >> 0] = 1; //@line 2039
 HEAP8[$22 >> 0] = 0; //@line 2040
 HEAP8[$22 + 1 >> 0] = 0; //@line 2040
 HEAP8[$22 + 2 >> 0] = 0; //@line 2040
 HEAP8[$22 + 3 >> 0] = 0; //@line 2040
 HEAP8[$22 + 4 >> 0] = 0; //@line 2040
 HEAP8[$22 + 5 >> 0] = 0; //@line 2040
 if (!(HEAP8[$38 >> 0] | 0)) {
  $79 = $2; //@line 2044
 } else {
  $$019$i$3 = $38; //@line 2046
  $67 = $2; //@line 2046
  while (1) {
   $64 = _strcspn($$019$i$3, 4557) | 0; //@line 2048
   $66 = $67 + 1 | 0; //@line 2050
   HEAP8[$67 >> 0] = $64; //@line 2051
   $68 = $64 & 255; //@line 2052
   _memcpy($66 | 0, $$019$i$3 | 0, $68 | 0) | 0; //@line 2053
   $69 = $66 + $68 | 0; //@line 2054
   $$019$i$3 = $$019$i$3 + ($64 + ((HEAP8[$$019$i$3 + $64 >> 0] | 0) == 46 & 1)) | 0; //@line 2060
   if (!(HEAP8[$$019$i$3 >> 0] | 0)) {
    $79 = $69; //@line 2064
    break;
   } else {
    $67 = $69; //@line 2067
   }
  }
 }
 HEAP8[$79 >> 0] = 0; //@line 2072
 HEAP8[$79 + 1 >> 0] = 0; //@line 2074
 HEAP8[$79 + 2 >> 0] = $32; //@line 2076
 HEAP8[$79 + 3 >> 0] = 0; //@line 2078
 HEAP8[$79 + 4 >> 0] = 1; //@line 2079
 HEAP32[$$byval_copy >> 2] = HEAP32[139]; //@line 2080
 HEAP32[$$byval_copy + 4 >> 2] = HEAP32[140]; //@line 2080
 HEAP32[$$byval_copy + 8 >> 2] = HEAP32[141]; //@line 2080
 HEAP32[$$byval_copy + 12 >> 2] = HEAP32[142]; //@line 2080
 HEAP32[$$byval_copy + 16 >> 2] = HEAP32[143]; //@line 2080
 __ZN13SocketAddressC2E10nsapi_addrt($34, $$byval_copy, 53); //@line 2081
 $ReallocAsyncCtx7 = _emscripten_realloc_async_context(80) | 0; //@line 2085
 $86 = __ZN9UDPSocket6sendtoERK13SocketAddressPKvj($28, $34, $10, $79 + 5 - $36 | 0) | 0; //@line 2086
 if (___async) {
  HEAP32[$ReallocAsyncCtx7 >> 2] = 100; //@line 2089
  $87 = $ReallocAsyncCtx7 + 4 | 0; //@line 2090
  HEAP32[$87 >> 2] = $2; //@line 2091
  $88 = $ReallocAsyncCtx7 + 8 | 0; //@line 2092
  HEAP32[$88 >> 2] = $4; //@line 2093
  $89 = $ReallocAsyncCtx7 + 12 | 0; //@line 2094
  HEAP32[$89 >> 2] = $6; //@line 2095
  $90 = $ReallocAsyncCtx7 + 16 | 0; //@line 2096
  HEAP32[$90 >> 2] = $8; //@line 2097
  $91 = $ReallocAsyncCtx7 + 20 | 0; //@line 2098
  HEAP32[$91 >> 2] = $10; //@line 2099
  $92 = $ReallocAsyncCtx7 + 24 | 0; //@line 2100
  HEAP32[$92 >> 2] = $12; //@line 2101
  $93 = $ReallocAsyncCtx7 + 28 | 0; //@line 2102
  HEAP32[$93 >> 2] = $14; //@line 2103
  $94 = $ReallocAsyncCtx7 + 32 | 0; //@line 2104
  HEAP32[$94 >> 2] = $16; //@line 2105
  $95 = $ReallocAsyncCtx7 + 36 | 0; //@line 2106
  HEAP32[$95 >> 2] = $18; //@line 2107
  $96 = $ReallocAsyncCtx7 + 40 | 0; //@line 2108
  HEAP32[$96 >> 2] = $20; //@line 2109
  $97 = $ReallocAsyncCtx7 + 44 | 0; //@line 2110
  HEAP32[$97 >> 2] = $22; //@line 2111
  $98 = $ReallocAsyncCtx7 + 48 | 0; //@line 2112
  HEAP32[$98 >> 2] = $24; //@line 2113
  $99 = $ReallocAsyncCtx7 + 52 | 0; //@line 2114
  HEAP32[$99 >> 2] = $26; //@line 2115
  $100 = $ReallocAsyncCtx7 + 56 | 0; //@line 2116
  HEAP32[$100 >> 2] = $28; //@line 2117
  $101 = $ReallocAsyncCtx7 + 60 | 0; //@line 2118
  HEAP32[$101 >> 2] = $30; //@line 2119
  $102 = $ReallocAsyncCtx7 + 64 | 0; //@line 2120
  HEAP8[$102 >> 0] = $32; //@line 2121
  $103 = $ReallocAsyncCtx7 + 68 | 0; //@line 2122
  HEAP32[$103 >> 2] = $34; //@line 2123
  $104 = $ReallocAsyncCtx7 + 72 | 0; //@line 2124
  HEAP32[$104 >> 2] = $36; //@line 2125
  $105 = $ReallocAsyncCtx7 + 76 | 0; //@line 2126
  HEAP32[$105 >> 2] = $38; //@line 2127
  sp = STACKTOP; //@line 2128
  STACKTOP = sp; //@line 2129
  return;
 }
 HEAP32[___async_retval >> 2] = $86; //@line 2132
 ___async_unwind = 0; //@line 2133
 HEAP32[$ReallocAsyncCtx7 >> 2] = 100; //@line 2134
 $87 = $ReallocAsyncCtx7 + 4 | 0; //@line 2135
 HEAP32[$87 >> 2] = $2; //@line 2136
 $88 = $ReallocAsyncCtx7 + 8 | 0; //@line 2137
 HEAP32[$88 >> 2] = $4; //@line 2138
 $89 = $ReallocAsyncCtx7 + 12 | 0; //@line 2139
 HEAP32[$89 >> 2] = $6; //@line 2140
 $90 = $ReallocAsyncCtx7 + 16 | 0; //@line 2141
 HEAP32[$90 >> 2] = $8; //@line 2142
 $91 = $ReallocAsyncCtx7 + 20 | 0; //@line 2143
 HEAP32[$91 >> 2] = $10; //@line 2144
 $92 = $ReallocAsyncCtx7 + 24 | 0; //@line 2145
 HEAP32[$92 >> 2] = $12; //@line 2146
 $93 = $ReallocAsyncCtx7 + 28 | 0; //@line 2147
 HEAP32[$93 >> 2] = $14; //@line 2148
 $94 = $ReallocAsyncCtx7 + 32 | 0; //@line 2149
 HEAP32[$94 >> 2] = $16; //@line 2150
 $95 = $ReallocAsyncCtx7 + 36 | 0; //@line 2151
 HEAP32[$95 >> 2] = $18; //@line 2152
 $96 = $ReallocAsyncCtx7 + 40 | 0; //@line 2153
 HEAP32[$96 >> 2] = $20; //@line 2154
 $97 = $ReallocAsyncCtx7 + 44 | 0; //@line 2155
 HEAP32[$97 >> 2] = $22; //@line 2156
 $98 = $ReallocAsyncCtx7 + 48 | 0; //@line 2157
 HEAP32[$98 >> 2] = $24; //@line 2158
 $99 = $ReallocAsyncCtx7 + 52 | 0; //@line 2159
 HEAP32[$99 >> 2] = $26; //@line 2160
 $100 = $ReallocAsyncCtx7 + 56 | 0; //@line 2161
 HEAP32[$100 >> 2] = $28; //@line 2162
 $101 = $ReallocAsyncCtx7 + 60 | 0; //@line 2163
 HEAP32[$101 >> 2] = $30; //@line 2164
 $102 = $ReallocAsyncCtx7 + 64 | 0; //@line 2165
 HEAP8[$102 >> 0] = $32; //@line 2166
 $103 = $ReallocAsyncCtx7 + 68 | 0; //@line 2167
 HEAP32[$103 >> 2] = $34; //@line 2168
 $104 = $ReallocAsyncCtx7 + 72 | 0; //@line 2169
 HEAP32[$104 >> 2] = $36; //@line 2170
 $105 = $ReallocAsyncCtx7 + 76 | 0; //@line 2171
 HEAP32[$105 >> 2] = $38; //@line 2172
 sp = STACKTOP; //@line 2173
 STACKTOP = sp; //@line 2174
 return;
}
function __ZL24nsapi_dns_query_multipleP12NetworkStackPKcP10nsapi_addrj13nsapi_version__async_cb_76($0) {
 $0 = $0 | 0;
 var $$019$i$1 = 0, $$byval_copy = 0, $10 = 0, $100 = 0, $101 = 0, $102 = 0, $103 = 0, $104 = 0, $105 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $2 = 0, $20 = 0, $22 = 0, $24 = 0, $26 = 0, $28 = 0, $30 = 0, $32 = 0, $34 = 0, $36 = 0, $38 = 0, $4 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $64 = 0, $66 = 0, $67 = 0, $68 = 0, $69 = 0, $79 = 0, $8 = 0, $86 = 0, $87 = 0, $88 = 0, $89 = 0, $90 = 0, $91 = 0, $92 = 0, $93 = 0, $94 = 0, $95 = 0, $96 = 0, $97 = 0, $98 = 0, $99 = 0, $ReallocAsyncCtx5 = 0, $ReallocAsyncCtx9 = 0, sp = 0;
 sp = STACKTOP; //@line 2470
 STACKTOP = STACKTOP + 32 | 0; //@line 2471
 $$byval_copy = sp; //@line 2472
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 2474
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 2476
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 2478
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 2480
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 2482
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 2484
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 2486
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 2488
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 2490
 $20 = HEAP32[$0 + 40 >> 2] | 0; //@line 2492
 $22 = HEAP32[$0 + 44 >> 2] | 0; //@line 2494
 $24 = HEAP32[$0 + 48 >> 2] | 0; //@line 2496
 $26 = HEAP32[$0 + 52 >> 2] | 0; //@line 2498
 $28 = HEAP32[$0 + 56 >> 2] | 0; //@line 2500
 $30 = HEAP32[$0 + 60 >> 2] | 0; //@line 2502
 $32 = HEAP8[$0 + 64 >> 0] | 0; //@line 2504
 $34 = HEAP32[$0 + 68 >> 2] | 0; //@line 2506
 $36 = HEAP32[$0 + 72 >> 2] | 0; //@line 2508
 $38 = HEAP32[$0 + 76 >> 2] | 0; //@line 2510
 if ((HEAP32[___async_retval >> 2] | 0) >= 0) {
  $ReallocAsyncCtx5 = _emscripten_realloc_async_context(80) | 0; //@line 2515
  $41 = __ZN9UDPSocket8recvfromEP13SocketAddressPvj($28, 0, $10, 512) | 0; //@line 2516
  if (___async) {
   HEAP32[$ReallocAsyncCtx5 >> 2] = 93; //@line 2519
   $42 = $ReallocAsyncCtx5 + 4 | 0; //@line 2520
   HEAP32[$42 >> 2] = $2; //@line 2521
   $43 = $ReallocAsyncCtx5 + 8 | 0; //@line 2522
   HEAP32[$43 >> 2] = $4; //@line 2523
   $44 = $ReallocAsyncCtx5 + 12 | 0; //@line 2524
   HEAP32[$44 >> 2] = $6; //@line 2525
   $45 = $ReallocAsyncCtx5 + 16 | 0; //@line 2526
   HEAP32[$45 >> 2] = $8; //@line 2527
   $46 = $ReallocAsyncCtx5 + 20 | 0; //@line 2528
   HEAP32[$46 >> 2] = $10; //@line 2529
   $47 = $ReallocAsyncCtx5 + 24 | 0; //@line 2530
   HEAP32[$47 >> 2] = $12; //@line 2531
   $48 = $ReallocAsyncCtx5 + 28 | 0; //@line 2532
   HEAP32[$48 >> 2] = $14; //@line 2533
   $49 = $ReallocAsyncCtx5 + 32 | 0; //@line 2534
   HEAP32[$49 >> 2] = $16; //@line 2535
   $50 = $ReallocAsyncCtx5 + 36 | 0; //@line 2536
   HEAP32[$50 >> 2] = $18; //@line 2537
   $51 = $ReallocAsyncCtx5 + 40 | 0; //@line 2538
   HEAP32[$51 >> 2] = $20; //@line 2539
   $52 = $ReallocAsyncCtx5 + 44 | 0; //@line 2540
   HEAP32[$52 >> 2] = $22; //@line 2541
   $53 = $ReallocAsyncCtx5 + 48 | 0; //@line 2542
   HEAP32[$53 >> 2] = $24; //@line 2543
   $54 = $ReallocAsyncCtx5 + 52 | 0; //@line 2544
   HEAP32[$54 >> 2] = $26; //@line 2545
   $55 = $ReallocAsyncCtx5 + 56 | 0; //@line 2546
   HEAP32[$55 >> 2] = $28; //@line 2547
   $56 = $ReallocAsyncCtx5 + 60 | 0; //@line 2548
   HEAP32[$56 >> 2] = $30; //@line 2549
   $57 = $ReallocAsyncCtx5 + 64 | 0; //@line 2550
   HEAP8[$57 >> 0] = $32; //@line 2551
   $58 = $ReallocAsyncCtx5 + 68 | 0; //@line 2552
   HEAP32[$58 >> 2] = $34; //@line 2553
   $59 = $ReallocAsyncCtx5 + 72 | 0; //@line 2554
   HEAP32[$59 >> 2] = $36; //@line 2555
   $60 = $ReallocAsyncCtx5 + 76 | 0; //@line 2556
   HEAP32[$60 >> 2] = $38; //@line 2557
   sp = STACKTOP; //@line 2558
   STACKTOP = sp; //@line 2559
   return;
  }
  HEAP32[___async_retval >> 2] = $41; //@line 2562
  ___async_unwind = 0; //@line 2563
  HEAP32[$ReallocAsyncCtx5 >> 2] = 93; //@line 2564
  $42 = $ReallocAsyncCtx5 + 4 | 0; //@line 2565
  HEAP32[$42 >> 2] = $2; //@line 2566
  $43 = $ReallocAsyncCtx5 + 8 | 0; //@line 2567
  HEAP32[$43 >> 2] = $4; //@line 2568
  $44 = $ReallocAsyncCtx5 + 12 | 0; //@line 2569
  HEAP32[$44 >> 2] = $6; //@line 2570
  $45 = $ReallocAsyncCtx5 + 16 | 0; //@line 2571
  HEAP32[$45 >> 2] = $8; //@line 2572
  $46 = $ReallocAsyncCtx5 + 20 | 0; //@line 2573
  HEAP32[$46 >> 2] = $10; //@line 2574
  $47 = $ReallocAsyncCtx5 + 24 | 0; //@line 2575
  HEAP32[$47 >> 2] = $12; //@line 2576
  $48 = $ReallocAsyncCtx5 + 28 | 0; //@line 2577
  HEAP32[$48 >> 2] = $14; //@line 2578
  $49 = $ReallocAsyncCtx5 + 32 | 0; //@line 2579
  HEAP32[$49 >> 2] = $16; //@line 2580
  $50 = $ReallocAsyncCtx5 + 36 | 0; //@line 2581
  HEAP32[$50 >> 2] = $18; //@line 2582
  $51 = $ReallocAsyncCtx5 + 40 | 0; //@line 2583
  HEAP32[$51 >> 2] = $20; //@line 2584
  $52 = $ReallocAsyncCtx5 + 44 | 0; //@line 2585
  HEAP32[$52 >> 2] = $22; //@line 2586
  $53 = $ReallocAsyncCtx5 + 48 | 0; //@line 2587
  HEAP32[$53 >> 2] = $24; //@line 2588
  $54 = $ReallocAsyncCtx5 + 52 | 0; //@line 2589
  HEAP32[$54 >> 2] = $26; //@line 2590
  $55 = $ReallocAsyncCtx5 + 56 | 0; //@line 2591
  HEAP32[$55 >> 2] = $28; //@line 2592
  $56 = $ReallocAsyncCtx5 + 60 | 0; //@line 2593
  HEAP32[$56 >> 2] = $30; //@line 2594
  $57 = $ReallocAsyncCtx5 + 64 | 0; //@line 2595
  HEAP8[$57 >> 0] = $32; //@line 2596
  $58 = $ReallocAsyncCtx5 + 68 | 0; //@line 2597
  HEAP32[$58 >> 2] = $34; //@line 2598
  $59 = $ReallocAsyncCtx5 + 72 | 0; //@line 2599
  HEAP32[$59 >> 2] = $36; //@line 2600
  $60 = $ReallocAsyncCtx5 + 76 | 0; //@line 2601
  HEAP32[$60 >> 2] = $38; //@line 2602
  sp = STACKTOP; //@line 2603
  STACKTOP = sp; //@line 2604
  return;
 }
 HEAP8[$10 >> 0] = 0; //@line 2606
 HEAP8[$12 >> 0] = 1; //@line 2607
 HEAP8[$14 >> 0] = 1; //@line 2608
 HEAP8[$16 >> 0] = 0; //@line 2609
 HEAP8[$18 >> 0] = 0; //@line 2610
 HEAP8[$20 >> 0] = 1; //@line 2611
 HEAP8[$22 >> 0] = 0; //@line 2612
 HEAP8[$22 + 1 >> 0] = 0; //@line 2612
 HEAP8[$22 + 2 >> 0] = 0; //@line 2612
 HEAP8[$22 + 3 >> 0] = 0; //@line 2612
 HEAP8[$22 + 4 >> 0] = 0; //@line 2612
 HEAP8[$22 + 5 >> 0] = 0; //@line 2612
 if (!(HEAP8[$38 >> 0] | 0)) {
  $79 = $2; //@line 2616
 } else {
  $$019$i$1 = $38; //@line 2618
  $67 = $2; //@line 2618
  while (1) {
   $64 = _strcspn($$019$i$1, 4557) | 0; //@line 2620
   $66 = $67 + 1 | 0; //@line 2622
   HEAP8[$67 >> 0] = $64; //@line 2623
   $68 = $64 & 255; //@line 2624
   _memcpy($66 | 0, $$019$i$1 | 0, $68 | 0) | 0; //@line 2625
   $69 = $66 + $68 | 0; //@line 2626
   $$019$i$1 = $$019$i$1 + ($64 + ((HEAP8[$$019$i$1 + $64 >> 0] | 0) == 46 & 1)) | 0; //@line 2632
   if (!(HEAP8[$$019$i$1 >> 0] | 0)) {
    $79 = $69; //@line 2636
    break;
   } else {
    $67 = $69; //@line 2639
   }
  }
 }
 HEAP8[$79 >> 0] = 0; //@line 2644
 HEAP8[$79 + 1 >> 0] = 0; //@line 2646
 HEAP8[$79 + 2 >> 0] = $32; //@line 2648
 HEAP8[$79 + 3 >> 0] = 0; //@line 2650
 HEAP8[$79 + 4 >> 0] = 1; //@line 2651
 HEAP32[$$byval_copy >> 2] = HEAP32[129]; //@line 2652
 HEAP32[$$byval_copy + 4 >> 2] = HEAP32[130]; //@line 2652
 HEAP32[$$byval_copy + 8 >> 2] = HEAP32[131]; //@line 2652
 HEAP32[$$byval_copy + 12 >> 2] = HEAP32[132]; //@line 2652
 HEAP32[$$byval_copy + 16 >> 2] = HEAP32[133]; //@line 2652
 __ZN13SocketAddressC2E10nsapi_addrt($34, $$byval_copy, 53); //@line 2653
 $ReallocAsyncCtx9 = _emscripten_realloc_async_context(80) | 0; //@line 2657
 $86 = __ZN9UDPSocket6sendtoERK13SocketAddressPKvj($28, $34, $10, $79 + 5 - $36 | 0) | 0; //@line 2658
 if (___async) {
  HEAP32[$ReallocAsyncCtx9 >> 2] = 96; //@line 2661
  $87 = $ReallocAsyncCtx9 + 4 | 0; //@line 2662
  HEAP32[$87 >> 2] = $2; //@line 2663
  $88 = $ReallocAsyncCtx9 + 8 | 0; //@line 2664
  HEAP32[$88 >> 2] = $4; //@line 2665
  $89 = $ReallocAsyncCtx9 + 12 | 0; //@line 2666
  HEAP32[$89 >> 2] = $6; //@line 2667
  $90 = $ReallocAsyncCtx9 + 16 | 0; //@line 2668
  HEAP32[$90 >> 2] = $8; //@line 2669
  $91 = $ReallocAsyncCtx9 + 20 | 0; //@line 2670
  HEAP32[$91 >> 2] = $10; //@line 2671
  $92 = $ReallocAsyncCtx9 + 24 | 0; //@line 2672
  HEAP32[$92 >> 2] = $12; //@line 2673
  $93 = $ReallocAsyncCtx9 + 28 | 0; //@line 2674
  HEAP32[$93 >> 2] = $14; //@line 2675
  $94 = $ReallocAsyncCtx9 + 32 | 0; //@line 2676
  HEAP32[$94 >> 2] = $16; //@line 2677
  $95 = $ReallocAsyncCtx9 + 36 | 0; //@line 2678
  HEAP32[$95 >> 2] = $18; //@line 2679
  $96 = $ReallocAsyncCtx9 + 40 | 0; //@line 2680
  HEAP32[$96 >> 2] = $20; //@line 2681
  $97 = $ReallocAsyncCtx9 + 44 | 0; //@line 2682
  HEAP32[$97 >> 2] = $22; //@line 2683
  $98 = $ReallocAsyncCtx9 + 48 | 0; //@line 2684
  HEAP32[$98 >> 2] = $24; //@line 2685
  $99 = $ReallocAsyncCtx9 + 52 | 0; //@line 2686
  HEAP32[$99 >> 2] = $26; //@line 2687
  $100 = $ReallocAsyncCtx9 + 56 | 0; //@line 2688
  HEAP32[$100 >> 2] = $28; //@line 2689
  $101 = $ReallocAsyncCtx9 + 60 | 0; //@line 2690
  HEAP32[$101 >> 2] = $30; //@line 2691
  $102 = $ReallocAsyncCtx9 + 64 | 0; //@line 2692
  HEAP8[$102 >> 0] = $32; //@line 2693
  $103 = $ReallocAsyncCtx9 + 68 | 0; //@line 2694
  HEAP32[$103 >> 2] = $34; //@line 2695
  $104 = $ReallocAsyncCtx9 + 72 | 0; //@line 2696
  HEAP32[$104 >> 2] = $36; //@line 2697
  $105 = $ReallocAsyncCtx9 + 76 | 0; //@line 2698
  HEAP32[$105 >> 2] = $38; //@line 2699
  sp = STACKTOP; //@line 2700
  STACKTOP = sp; //@line 2701
  return;
 }
 HEAP32[___async_retval >> 2] = $86; //@line 2704
 ___async_unwind = 0; //@line 2705
 HEAP32[$ReallocAsyncCtx9 >> 2] = 96; //@line 2706
 $87 = $ReallocAsyncCtx9 + 4 | 0; //@line 2707
 HEAP32[$87 >> 2] = $2; //@line 2708
 $88 = $ReallocAsyncCtx9 + 8 | 0; //@line 2709
 HEAP32[$88 >> 2] = $4; //@line 2710
 $89 = $ReallocAsyncCtx9 + 12 | 0; //@line 2711
 HEAP32[$89 >> 2] = $6; //@line 2712
 $90 = $ReallocAsyncCtx9 + 16 | 0; //@line 2713
 HEAP32[$90 >> 2] = $8; //@line 2714
 $91 = $ReallocAsyncCtx9 + 20 | 0; //@line 2715
 HEAP32[$91 >> 2] = $10; //@line 2716
 $92 = $ReallocAsyncCtx9 + 24 | 0; //@line 2717
 HEAP32[$92 >> 2] = $12; //@line 2718
 $93 = $ReallocAsyncCtx9 + 28 | 0; //@line 2719
 HEAP32[$93 >> 2] = $14; //@line 2720
 $94 = $ReallocAsyncCtx9 + 32 | 0; //@line 2721
 HEAP32[$94 >> 2] = $16; //@line 2722
 $95 = $ReallocAsyncCtx9 + 36 | 0; //@line 2723
 HEAP32[$95 >> 2] = $18; //@line 2724
 $96 = $ReallocAsyncCtx9 + 40 | 0; //@line 2725
 HEAP32[$96 >> 2] = $20; //@line 2726
 $97 = $ReallocAsyncCtx9 + 44 | 0; //@line 2727
 HEAP32[$97 >> 2] = $22; //@line 2728
 $98 = $ReallocAsyncCtx9 + 48 | 0; //@line 2729
 HEAP32[$98 >> 2] = $24; //@line 2730
 $99 = $ReallocAsyncCtx9 + 52 | 0; //@line 2731
 HEAP32[$99 >> 2] = $26; //@line 2732
 $100 = $ReallocAsyncCtx9 + 56 | 0; //@line 2733
 HEAP32[$100 >> 2] = $28; //@line 2734
 $101 = $ReallocAsyncCtx9 + 60 | 0; //@line 2735
 HEAP32[$101 >> 2] = $30; //@line 2736
 $102 = $ReallocAsyncCtx9 + 64 | 0; //@line 2737
 HEAP8[$102 >> 0] = $32; //@line 2738
 $103 = $ReallocAsyncCtx9 + 68 | 0; //@line 2739
 HEAP32[$103 >> 2] = $34; //@line 2740
 $104 = $ReallocAsyncCtx9 + 72 | 0; //@line 2741
 HEAP32[$104 >> 2] = $36; //@line 2742
 $105 = $ReallocAsyncCtx9 + 76 | 0; //@line 2743
 HEAP32[$105 >> 2] = $38; //@line 2744
 sp = STACKTOP; //@line 2745
 STACKTOP = sp; //@line 2746
 return;
}
function __ZL24nsapi_dns_query_multipleP12NetworkStackPKcP10nsapi_addrj13nsapi_version__async_cb_75($0) {
 $0 = $0 | 0;
 var $$019$i$2 = 0, $$byval_copy = 0, $10 = 0, $100 = 0, $101 = 0, $102 = 0, $103 = 0, $104 = 0, $105 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $2 = 0, $20 = 0, $22 = 0, $24 = 0, $26 = 0, $28 = 0, $30 = 0, $32 = 0, $34 = 0, $36 = 0, $38 = 0, $4 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $64 = 0, $66 = 0, $67 = 0, $68 = 0, $69 = 0, $79 = 0, $8 = 0, $86 = 0, $87 = 0, $88 = 0, $89 = 0, $90 = 0, $91 = 0, $92 = 0, $93 = 0, $94 = 0, $95 = 0, $96 = 0, $97 = 0, $98 = 0, $99 = 0, $ReallocAsyncCtx4 = 0, $ReallocAsyncCtx8 = 0, sp = 0;
 sp = STACKTOP; //@line 2184
 STACKTOP = STACKTOP + 32 | 0; //@line 2185
 $$byval_copy = sp; //@line 2186
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 2188
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 2190
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 2192
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 2194
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 2196
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 2198
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 2200
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 2202
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 2204
 $20 = HEAP32[$0 + 40 >> 2] | 0; //@line 2206
 $22 = HEAP32[$0 + 44 >> 2] | 0; //@line 2208
 $24 = HEAP32[$0 + 48 >> 2] | 0; //@line 2210
 $26 = HEAP32[$0 + 52 >> 2] | 0; //@line 2212
 $28 = HEAP32[$0 + 56 >> 2] | 0; //@line 2214
 $30 = HEAP32[$0 + 60 >> 2] | 0; //@line 2216
 $32 = HEAP8[$0 + 64 >> 0] | 0; //@line 2218
 $34 = HEAP32[$0 + 68 >> 2] | 0; //@line 2220
 $36 = HEAP32[$0 + 72 >> 2] | 0; //@line 2222
 $38 = HEAP32[$0 + 76 >> 2] | 0; //@line 2224
 if ((HEAP32[___async_retval >> 2] | 0) >= 0) {
  $ReallocAsyncCtx4 = _emscripten_realloc_async_context(80) | 0; //@line 2229
  $41 = __ZN9UDPSocket8recvfromEP13SocketAddressPvj($28, 0, $10, 512) | 0; //@line 2230
  if (___async) {
   HEAP32[$ReallocAsyncCtx4 >> 2] = 97; //@line 2233
   $42 = $ReallocAsyncCtx4 + 4 | 0; //@line 2234
   HEAP32[$42 >> 2] = $2; //@line 2235
   $43 = $ReallocAsyncCtx4 + 8 | 0; //@line 2236
   HEAP32[$43 >> 2] = $4; //@line 2237
   $44 = $ReallocAsyncCtx4 + 12 | 0; //@line 2238
   HEAP32[$44 >> 2] = $6; //@line 2239
   $45 = $ReallocAsyncCtx4 + 16 | 0; //@line 2240
   HEAP32[$45 >> 2] = $8; //@line 2241
   $46 = $ReallocAsyncCtx4 + 20 | 0; //@line 2242
   HEAP32[$46 >> 2] = $10; //@line 2243
   $47 = $ReallocAsyncCtx4 + 24 | 0; //@line 2244
   HEAP32[$47 >> 2] = $12; //@line 2245
   $48 = $ReallocAsyncCtx4 + 28 | 0; //@line 2246
   HEAP32[$48 >> 2] = $14; //@line 2247
   $49 = $ReallocAsyncCtx4 + 32 | 0; //@line 2248
   HEAP32[$49 >> 2] = $16; //@line 2249
   $50 = $ReallocAsyncCtx4 + 36 | 0; //@line 2250
   HEAP32[$50 >> 2] = $18; //@line 2251
   $51 = $ReallocAsyncCtx4 + 40 | 0; //@line 2252
   HEAP32[$51 >> 2] = $20; //@line 2253
   $52 = $ReallocAsyncCtx4 + 44 | 0; //@line 2254
   HEAP32[$52 >> 2] = $22; //@line 2255
   $53 = $ReallocAsyncCtx4 + 48 | 0; //@line 2256
   HEAP32[$53 >> 2] = $24; //@line 2257
   $54 = $ReallocAsyncCtx4 + 52 | 0; //@line 2258
   HEAP32[$54 >> 2] = $26; //@line 2259
   $55 = $ReallocAsyncCtx4 + 56 | 0; //@line 2260
   HEAP32[$55 >> 2] = $28; //@line 2261
   $56 = $ReallocAsyncCtx4 + 60 | 0; //@line 2262
   HEAP32[$56 >> 2] = $30; //@line 2263
   $57 = $ReallocAsyncCtx4 + 64 | 0; //@line 2264
   HEAP8[$57 >> 0] = $32; //@line 2265
   $58 = $ReallocAsyncCtx4 + 68 | 0; //@line 2266
   HEAP32[$58 >> 2] = $34; //@line 2267
   $59 = $ReallocAsyncCtx4 + 72 | 0; //@line 2268
   HEAP32[$59 >> 2] = $36; //@line 2269
   $60 = $ReallocAsyncCtx4 + 76 | 0; //@line 2270
   HEAP32[$60 >> 2] = $38; //@line 2271
   sp = STACKTOP; //@line 2272
   STACKTOP = sp; //@line 2273
   return;
  }
  HEAP32[___async_retval >> 2] = $41; //@line 2276
  ___async_unwind = 0; //@line 2277
  HEAP32[$ReallocAsyncCtx4 >> 2] = 97; //@line 2278
  $42 = $ReallocAsyncCtx4 + 4 | 0; //@line 2279
  HEAP32[$42 >> 2] = $2; //@line 2280
  $43 = $ReallocAsyncCtx4 + 8 | 0; //@line 2281
  HEAP32[$43 >> 2] = $4; //@line 2282
  $44 = $ReallocAsyncCtx4 + 12 | 0; //@line 2283
  HEAP32[$44 >> 2] = $6; //@line 2284
  $45 = $ReallocAsyncCtx4 + 16 | 0; //@line 2285
  HEAP32[$45 >> 2] = $8; //@line 2286
  $46 = $ReallocAsyncCtx4 + 20 | 0; //@line 2287
  HEAP32[$46 >> 2] = $10; //@line 2288
  $47 = $ReallocAsyncCtx4 + 24 | 0; //@line 2289
  HEAP32[$47 >> 2] = $12; //@line 2290
  $48 = $ReallocAsyncCtx4 + 28 | 0; //@line 2291
  HEAP32[$48 >> 2] = $14; //@line 2292
  $49 = $ReallocAsyncCtx4 + 32 | 0; //@line 2293
  HEAP32[$49 >> 2] = $16; //@line 2294
  $50 = $ReallocAsyncCtx4 + 36 | 0; //@line 2295
  HEAP32[$50 >> 2] = $18; //@line 2296
  $51 = $ReallocAsyncCtx4 + 40 | 0; //@line 2297
  HEAP32[$51 >> 2] = $20; //@line 2298
  $52 = $ReallocAsyncCtx4 + 44 | 0; //@line 2299
  HEAP32[$52 >> 2] = $22; //@line 2300
  $53 = $ReallocAsyncCtx4 + 48 | 0; //@line 2301
  HEAP32[$53 >> 2] = $24; //@line 2302
  $54 = $ReallocAsyncCtx4 + 52 | 0; //@line 2303
  HEAP32[$54 >> 2] = $26; //@line 2304
  $55 = $ReallocAsyncCtx4 + 56 | 0; //@line 2305
  HEAP32[$55 >> 2] = $28; //@line 2306
  $56 = $ReallocAsyncCtx4 + 60 | 0; //@line 2307
  HEAP32[$56 >> 2] = $30; //@line 2308
  $57 = $ReallocAsyncCtx4 + 64 | 0; //@line 2309
  HEAP8[$57 >> 0] = $32; //@line 2310
  $58 = $ReallocAsyncCtx4 + 68 | 0; //@line 2311
  HEAP32[$58 >> 2] = $34; //@line 2312
  $59 = $ReallocAsyncCtx4 + 72 | 0; //@line 2313
  HEAP32[$59 >> 2] = $36; //@line 2314
  $60 = $ReallocAsyncCtx4 + 76 | 0; //@line 2315
  HEAP32[$60 >> 2] = $38; //@line 2316
  sp = STACKTOP; //@line 2317
  STACKTOP = sp; //@line 2318
  return;
 }
 HEAP8[$10 >> 0] = 0; //@line 2320
 HEAP8[$12 >> 0] = 1; //@line 2321
 HEAP8[$14 >> 0] = 1; //@line 2322
 HEAP8[$16 >> 0] = 0; //@line 2323
 HEAP8[$18 >> 0] = 0; //@line 2324
 HEAP8[$20 >> 0] = 1; //@line 2325
 HEAP8[$22 >> 0] = 0; //@line 2326
 HEAP8[$22 + 1 >> 0] = 0; //@line 2326
 HEAP8[$22 + 2 >> 0] = 0; //@line 2326
 HEAP8[$22 + 3 >> 0] = 0; //@line 2326
 HEAP8[$22 + 4 >> 0] = 0; //@line 2326
 HEAP8[$22 + 5 >> 0] = 0; //@line 2326
 if (!(HEAP8[$38 >> 0] | 0)) {
  $79 = $2; //@line 2330
 } else {
  $$019$i$2 = $38; //@line 2332
  $67 = $2; //@line 2332
  while (1) {
   $64 = _strcspn($$019$i$2, 4557) | 0; //@line 2334
   $66 = $67 + 1 | 0; //@line 2336
   HEAP8[$67 >> 0] = $64; //@line 2337
   $68 = $64 & 255; //@line 2338
   _memcpy($66 | 0, $$019$i$2 | 0, $68 | 0) | 0; //@line 2339
   $69 = $66 + $68 | 0; //@line 2340
   $$019$i$2 = $$019$i$2 + ($64 + ((HEAP8[$$019$i$2 + $64 >> 0] | 0) == 46 & 1)) | 0; //@line 2346
   if (!(HEAP8[$$019$i$2 >> 0] | 0)) {
    $79 = $69; //@line 2350
    break;
   } else {
    $67 = $69; //@line 2353
   }
  }
 }
 HEAP8[$79 >> 0] = 0; //@line 2358
 HEAP8[$79 + 1 >> 0] = 0; //@line 2360
 HEAP8[$79 + 2 >> 0] = $32; //@line 2362
 HEAP8[$79 + 3 >> 0] = 0; //@line 2364
 HEAP8[$79 + 4 >> 0] = 1; //@line 2365
 HEAP32[$$byval_copy >> 2] = HEAP32[134]; //@line 2366
 HEAP32[$$byval_copy + 4 >> 2] = HEAP32[135]; //@line 2366
 HEAP32[$$byval_copy + 8 >> 2] = HEAP32[136]; //@line 2366
 HEAP32[$$byval_copy + 12 >> 2] = HEAP32[137]; //@line 2366
 HEAP32[$$byval_copy + 16 >> 2] = HEAP32[138]; //@line 2366
 __ZN13SocketAddressC2E10nsapi_addrt($34, $$byval_copy, 53); //@line 2367
 $ReallocAsyncCtx8 = _emscripten_realloc_async_context(80) | 0; //@line 2371
 $86 = __ZN9UDPSocket6sendtoERK13SocketAddressPKvj($28, $34, $10, $79 + 5 - $36 | 0) | 0; //@line 2372
 if (___async) {
  HEAP32[$ReallocAsyncCtx8 >> 2] = 98; //@line 2375
  $87 = $ReallocAsyncCtx8 + 4 | 0; //@line 2376
  HEAP32[$87 >> 2] = $2; //@line 2377
  $88 = $ReallocAsyncCtx8 + 8 | 0; //@line 2378
  HEAP32[$88 >> 2] = $4; //@line 2379
  $89 = $ReallocAsyncCtx8 + 12 | 0; //@line 2380
  HEAP32[$89 >> 2] = $6; //@line 2381
  $90 = $ReallocAsyncCtx8 + 16 | 0; //@line 2382
  HEAP32[$90 >> 2] = $8; //@line 2383
  $91 = $ReallocAsyncCtx8 + 20 | 0; //@line 2384
  HEAP32[$91 >> 2] = $10; //@line 2385
  $92 = $ReallocAsyncCtx8 + 24 | 0; //@line 2386
  HEAP32[$92 >> 2] = $12; //@line 2387
  $93 = $ReallocAsyncCtx8 + 28 | 0; //@line 2388
  HEAP32[$93 >> 2] = $14; //@line 2389
  $94 = $ReallocAsyncCtx8 + 32 | 0; //@line 2390
  HEAP32[$94 >> 2] = $16; //@line 2391
  $95 = $ReallocAsyncCtx8 + 36 | 0; //@line 2392
  HEAP32[$95 >> 2] = $18; //@line 2393
  $96 = $ReallocAsyncCtx8 + 40 | 0; //@line 2394
  HEAP32[$96 >> 2] = $20; //@line 2395
  $97 = $ReallocAsyncCtx8 + 44 | 0; //@line 2396
  HEAP32[$97 >> 2] = $22; //@line 2397
  $98 = $ReallocAsyncCtx8 + 48 | 0; //@line 2398
  HEAP32[$98 >> 2] = $24; //@line 2399
  $99 = $ReallocAsyncCtx8 + 52 | 0; //@line 2400
  HEAP32[$99 >> 2] = $26; //@line 2401
  $100 = $ReallocAsyncCtx8 + 56 | 0; //@line 2402
  HEAP32[$100 >> 2] = $28; //@line 2403
  $101 = $ReallocAsyncCtx8 + 60 | 0; //@line 2404
  HEAP32[$101 >> 2] = $30; //@line 2405
  $102 = $ReallocAsyncCtx8 + 64 | 0; //@line 2406
  HEAP8[$102 >> 0] = $32; //@line 2407
  $103 = $ReallocAsyncCtx8 + 68 | 0; //@line 2408
  HEAP32[$103 >> 2] = $34; //@line 2409
  $104 = $ReallocAsyncCtx8 + 72 | 0; //@line 2410
  HEAP32[$104 >> 2] = $36; //@line 2411
  $105 = $ReallocAsyncCtx8 + 76 | 0; //@line 2412
  HEAP32[$105 >> 2] = $38; //@line 2413
  sp = STACKTOP; //@line 2414
  STACKTOP = sp; //@line 2415
  return;
 }
 HEAP32[___async_retval >> 2] = $86; //@line 2418
 ___async_unwind = 0; //@line 2419
 HEAP32[$ReallocAsyncCtx8 >> 2] = 98; //@line 2420
 $87 = $ReallocAsyncCtx8 + 4 | 0; //@line 2421
 HEAP32[$87 >> 2] = $2; //@line 2422
 $88 = $ReallocAsyncCtx8 + 8 | 0; //@line 2423
 HEAP32[$88 >> 2] = $4; //@line 2424
 $89 = $ReallocAsyncCtx8 + 12 | 0; //@line 2425
 HEAP32[$89 >> 2] = $6; //@line 2426
 $90 = $ReallocAsyncCtx8 + 16 | 0; //@line 2427
 HEAP32[$90 >> 2] = $8; //@line 2428
 $91 = $ReallocAsyncCtx8 + 20 | 0; //@line 2429
 HEAP32[$91 >> 2] = $10; //@line 2430
 $92 = $ReallocAsyncCtx8 + 24 | 0; //@line 2431
 HEAP32[$92 >> 2] = $12; //@line 2432
 $93 = $ReallocAsyncCtx8 + 28 | 0; //@line 2433
 HEAP32[$93 >> 2] = $14; //@line 2434
 $94 = $ReallocAsyncCtx8 + 32 | 0; //@line 2435
 HEAP32[$94 >> 2] = $16; //@line 2436
 $95 = $ReallocAsyncCtx8 + 36 | 0; //@line 2437
 HEAP32[$95 >> 2] = $18; //@line 2438
 $96 = $ReallocAsyncCtx8 + 40 | 0; //@line 2439
 HEAP32[$96 >> 2] = $20; //@line 2440
 $97 = $ReallocAsyncCtx8 + 44 | 0; //@line 2441
 HEAP32[$97 >> 2] = $22; //@line 2442
 $98 = $ReallocAsyncCtx8 + 48 | 0; //@line 2443
 HEAP32[$98 >> 2] = $24; //@line 2444
 $99 = $ReallocAsyncCtx8 + 52 | 0; //@line 2445
 HEAP32[$99 >> 2] = $26; //@line 2446
 $100 = $ReallocAsyncCtx8 + 56 | 0; //@line 2447
 HEAP32[$100 >> 2] = $28; //@line 2448
 $101 = $ReallocAsyncCtx8 + 60 | 0; //@line 2449
 HEAP32[$101 >> 2] = $30; //@line 2450
 $102 = $ReallocAsyncCtx8 + 64 | 0; //@line 2451
 HEAP8[$102 >> 0] = $32; //@line 2452
 $103 = $ReallocAsyncCtx8 + 68 | 0; //@line 2453
 HEAP32[$103 >> 2] = $34; //@line 2454
 $104 = $ReallocAsyncCtx8 + 72 | 0; //@line 2455
 HEAP32[$104 >> 2] = $36; //@line 2456
 $105 = $ReallocAsyncCtx8 + 76 | 0; //@line 2457
 HEAP32[$105 >> 2] = $38; //@line 2458
 sp = STACKTOP; //@line 2459
 STACKTOP = sp; //@line 2460
 return;
}
function __ZL24nsapi_dns_query_multipleP12NetworkStackPKcP10nsapi_addrj13nsapi_version__async_cb_73($0) {
 $0 = $0 | 0;
 var $$019$i$4 = 0, $$byval_copy = 0, $10 = 0, $100 = 0, $101 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $2 = 0, $20 = 0, $22 = 0, $24 = 0, $26 = 0, $28 = 0, $30 = 0, $32 = 0, $34 = 0, $36 = 0, $38 = 0, $4 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $64 = 0, $66 = 0, $67 = 0, $68 = 0, $69 = 0, $79 = 0, $8 = 0, $86 = 0, $87 = 0, $88 = 0, $89 = 0, $90 = 0, $91 = 0, $92 = 0, $93 = 0, $94 = 0, $95 = 0, $96 = 0, $97 = 0, $98 = 0, $99 = 0, $ReallocAsyncCtx2 = 0, $ReallocAsyncCtx6 = 0, sp = 0;
 sp = STACKTOP; //@line 1628
 STACKTOP = STACKTOP + 32 | 0; //@line 1629
 $$byval_copy = sp; //@line 1630
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 1632
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 1634
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 1636
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 1638
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 1640
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 1642
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 1644
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 1646
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 1648
 $20 = HEAP32[$0 + 40 >> 2] | 0; //@line 1650
 $22 = HEAP32[$0 + 44 >> 2] | 0; //@line 1652
 $24 = HEAP32[$0 + 48 >> 2] | 0; //@line 1654
 $26 = HEAP32[$0 + 52 >> 2] | 0; //@line 1656
 $28 = HEAP32[$0 + 56 >> 2] | 0; //@line 1658
 $30 = HEAP32[$0 + 60 >> 2] | 0; //@line 1660
 $32 = HEAP8[$0 + 64 >> 0] | 0; //@line 1662
 $34 = HEAP32[$0 + 68 >> 2] | 0; //@line 1664
 $36 = HEAP32[$0 + 72 >> 2] | 0; //@line 1666
 $38 = HEAP32[$0 + 76 >> 2] | 0; //@line 1668
 if ((HEAP32[___async_retval >> 2] | 0) >= 0) {
  $ReallocAsyncCtx2 = _emscripten_realloc_async_context(80) | 0; //@line 1673
  $41 = __ZN9UDPSocket8recvfromEP13SocketAddressPvj($28, 0, $10, 512) | 0; //@line 1674
  if (___async) {
   HEAP32[$ReallocAsyncCtx2 >> 2] = 101; //@line 1677
   $42 = $ReallocAsyncCtx2 + 4 | 0; //@line 1678
   HEAP32[$42 >> 2] = $2; //@line 1679
   $43 = $ReallocAsyncCtx2 + 8 | 0; //@line 1680
   HEAP32[$43 >> 2] = $4; //@line 1681
   $44 = $ReallocAsyncCtx2 + 12 | 0; //@line 1682
   HEAP32[$44 >> 2] = $6; //@line 1683
   $45 = $ReallocAsyncCtx2 + 16 | 0; //@line 1684
   HEAP32[$45 >> 2] = $8; //@line 1685
   $46 = $ReallocAsyncCtx2 + 20 | 0; //@line 1686
   HEAP32[$46 >> 2] = $10; //@line 1687
   $47 = $ReallocAsyncCtx2 + 24 | 0; //@line 1688
   HEAP32[$47 >> 2] = $12; //@line 1689
   $48 = $ReallocAsyncCtx2 + 28 | 0; //@line 1690
   HEAP32[$48 >> 2] = $14; //@line 1691
   $49 = $ReallocAsyncCtx2 + 32 | 0; //@line 1692
   HEAP32[$49 >> 2] = $16; //@line 1693
   $50 = $ReallocAsyncCtx2 + 36 | 0; //@line 1694
   HEAP32[$50 >> 2] = $18; //@line 1695
   $51 = $ReallocAsyncCtx2 + 40 | 0; //@line 1696
   HEAP32[$51 >> 2] = $20; //@line 1697
   $52 = $ReallocAsyncCtx2 + 44 | 0; //@line 1698
   HEAP32[$52 >> 2] = $22; //@line 1699
   $53 = $ReallocAsyncCtx2 + 48 | 0; //@line 1700
   HEAP32[$53 >> 2] = $24; //@line 1701
   $54 = $ReallocAsyncCtx2 + 52 | 0; //@line 1702
   HEAP32[$54 >> 2] = $26; //@line 1703
   $55 = $ReallocAsyncCtx2 + 56 | 0; //@line 1704
   HEAP32[$55 >> 2] = $28; //@line 1705
   $56 = $ReallocAsyncCtx2 + 60 | 0; //@line 1706
   HEAP32[$56 >> 2] = $30; //@line 1707
   $57 = $ReallocAsyncCtx2 + 64 | 0; //@line 1708
   HEAP8[$57 >> 0] = $32; //@line 1709
   $58 = $ReallocAsyncCtx2 + 68 | 0; //@line 1710
   HEAP32[$58 >> 2] = $34; //@line 1711
   $59 = $ReallocAsyncCtx2 + 72 | 0; //@line 1712
   HEAP32[$59 >> 2] = $36; //@line 1713
   $60 = $ReallocAsyncCtx2 + 76 | 0; //@line 1714
   HEAP32[$60 >> 2] = $38; //@line 1715
   sp = STACKTOP; //@line 1716
   STACKTOP = sp; //@line 1717
   return;
  }
  HEAP32[___async_retval >> 2] = $41; //@line 1720
  ___async_unwind = 0; //@line 1721
  HEAP32[$ReallocAsyncCtx2 >> 2] = 101; //@line 1722
  $42 = $ReallocAsyncCtx2 + 4 | 0; //@line 1723
  HEAP32[$42 >> 2] = $2; //@line 1724
  $43 = $ReallocAsyncCtx2 + 8 | 0; //@line 1725
  HEAP32[$43 >> 2] = $4; //@line 1726
  $44 = $ReallocAsyncCtx2 + 12 | 0; //@line 1727
  HEAP32[$44 >> 2] = $6; //@line 1728
  $45 = $ReallocAsyncCtx2 + 16 | 0; //@line 1729
  HEAP32[$45 >> 2] = $8; //@line 1730
  $46 = $ReallocAsyncCtx2 + 20 | 0; //@line 1731
  HEAP32[$46 >> 2] = $10; //@line 1732
  $47 = $ReallocAsyncCtx2 + 24 | 0; //@line 1733
  HEAP32[$47 >> 2] = $12; //@line 1734
  $48 = $ReallocAsyncCtx2 + 28 | 0; //@line 1735
  HEAP32[$48 >> 2] = $14; //@line 1736
  $49 = $ReallocAsyncCtx2 + 32 | 0; //@line 1737
  HEAP32[$49 >> 2] = $16; //@line 1738
  $50 = $ReallocAsyncCtx2 + 36 | 0; //@line 1739
  HEAP32[$50 >> 2] = $18; //@line 1740
  $51 = $ReallocAsyncCtx2 + 40 | 0; //@line 1741
  HEAP32[$51 >> 2] = $20; //@line 1742
  $52 = $ReallocAsyncCtx2 + 44 | 0; //@line 1743
  HEAP32[$52 >> 2] = $22; //@line 1744
  $53 = $ReallocAsyncCtx2 + 48 | 0; //@line 1745
  HEAP32[$53 >> 2] = $24; //@line 1746
  $54 = $ReallocAsyncCtx2 + 52 | 0; //@line 1747
  HEAP32[$54 >> 2] = $26; //@line 1748
  $55 = $ReallocAsyncCtx2 + 56 | 0; //@line 1749
  HEAP32[$55 >> 2] = $28; //@line 1750
  $56 = $ReallocAsyncCtx2 + 60 | 0; //@line 1751
  HEAP32[$56 >> 2] = $30; //@line 1752
  $57 = $ReallocAsyncCtx2 + 64 | 0; //@line 1753
  HEAP8[$57 >> 0] = $32; //@line 1754
  $58 = $ReallocAsyncCtx2 + 68 | 0; //@line 1755
  HEAP32[$58 >> 2] = $34; //@line 1756
  $59 = $ReallocAsyncCtx2 + 72 | 0; //@line 1757
  HEAP32[$59 >> 2] = $36; //@line 1758
  $60 = $ReallocAsyncCtx2 + 76 | 0; //@line 1759
  HEAP32[$60 >> 2] = $38; //@line 1760
  sp = STACKTOP; //@line 1761
  STACKTOP = sp; //@line 1762
  return;
 }
 HEAP8[$10 >> 0] = 0; //@line 1764
 HEAP8[$12 >> 0] = 1; //@line 1765
 HEAP8[$14 >> 0] = 1; //@line 1766
 HEAP8[$16 >> 0] = 0; //@line 1767
 HEAP8[$18 >> 0] = 0; //@line 1768
 HEAP8[$20 >> 0] = 1; //@line 1769
 HEAP8[$22 >> 0] = 0; //@line 1770
 HEAP8[$22 + 1 >> 0] = 0; //@line 1770
 HEAP8[$22 + 2 >> 0] = 0; //@line 1770
 HEAP8[$22 + 3 >> 0] = 0; //@line 1770
 HEAP8[$22 + 4 >> 0] = 0; //@line 1770
 HEAP8[$22 + 5 >> 0] = 0; //@line 1770
 if (!(HEAP8[$38 >> 0] | 0)) {
  $79 = $2; //@line 1774
 } else {
  $$019$i$4 = $38; //@line 1776
  $67 = $2; //@line 1776
  while (1) {
   $64 = _strcspn($$019$i$4, 4557) | 0; //@line 1778
   $66 = $67 + 1 | 0; //@line 1780
   HEAP8[$67 >> 0] = $64; //@line 1781
   $68 = $64 & 255; //@line 1782
   _memcpy($66 | 0, $$019$i$4 | 0, $68 | 0) | 0; //@line 1783
   $69 = $66 + $68 | 0; //@line 1784
   $$019$i$4 = $$019$i$4 + ($64 + ((HEAP8[$$019$i$4 + $64 >> 0] | 0) == 46 & 1)) | 0; //@line 1790
   if (!(HEAP8[$$019$i$4 >> 0] | 0)) {
    $79 = $69; //@line 1794
    break;
   } else {
    $67 = $69; //@line 1797
   }
  }
 }
 HEAP8[$79 >> 0] = 0; //@line 1802
 HEAP8[$79 + 1 >> 0] = 0; //@line 1804
 HEAP8[$79 + 2 >> 0] = $32; //@line 1806
 HEAP8[$79 + 3 >> 0] = 0; //@line 1808
 HEAP8[$79 + 4 >> 0] = 1; //@line 1809
 HEAP32[$$byval_copy >> 2] = HEAP32[144]; //@line 1810
 HEAP32[$$byval_copy + 4 >> 2] = HEAP32[145]; //@line 1810
 HEAP32[$$byval_copy + 8 >> 2] = HEAP32[146]; //@line 1810
 HEAP32[$$byval_copy + 12 >> 2] = HEAP32[147]; //@line 1810
 HEAP32[$$byval_copy + 16 >> 2] = HEAP32[148]; //@line 1810
 __ZN13SocketAddressC2E10nsapi_addrt($34, $$byval_copy, 53); //@line 1811
 $ReallocAsyncCtx6 = _emscripten_realloc_async_context(64) | 0; //@line 1815
 $86 = __ZN9UDPSocket6sendtoERK13SocketAddressPKvj($28, $34, $10, $79 + 5 - $36 | 0) | 0; //@line 1816
 if (___async) {
  HEAP32[$ReallocAsyncCtx6 >> 2] = 102; //@line 1819
  $87 = $ReallocAsyncCtx6 + 4 | 0; //@line 1820
  HEAP32[$87 >> 2] = $6; //@line 1821
  $88 = $ReallocAsyncCtx6 + 8 | 0; //@line 1822
  HEAP32[$88 >> 2] = $2; //@line 1823
  $89 = $ReallocAsyncCtx6 + 12 | 0; //@line 1824
  HEAP32[$89 >> 2] = $4; //@line 1825
  $90 = $ReallocAsyncCtx6 + 16 | 0; //@line 1826
  HEAP32[$90 >> 2] = $8; //@line 1827
  $91 = $ReallocAsyncCtx6 + 20 | 0; //@line 1828
  HEAP32[$91 >> 2] = $10; //@line 1829
  $92 = $ReallocAsyncCtx6 + 24 | 0; //@line 1830
  HEAP32[$92 >> 2] = $12; //@line 1831
  $93 = $ReallocAsyncCtx6 + 28 | 0; //@line 1832
  HEAP32[$93 >> 2] = $14; //@line 1833
  $94 = $ReallocAsyncCtx6 + 32 | 0; //@line 1834
  HEAP32[$94 >> 2] = $16; //@line 1835
  $95 = $ReallocAsyncCtx6 + 36 | 0; //@line 1836
  HEAP32[$95 >> 2] = $18; //@line 1837
  $96 = $ReallocAsyncCtx6 + 40 | 0; //@line 1838
  HEAP32[$96 >> 2] = $20; //@line 1839
  $97 = $ReallocAsyncCtx6 + 44 | 0; //@line 1840
  HEAP32[$97 >> 2] = $22; //@line 1841
  $98 = $ReallocAsyncCtx6 + 48 | 0; //@line 1842
  HEAP32[$98 >> 2] = $24; //@line 1843
  $99 = $ReallocAsyncCtx6 + 52 | 0; //@line 1844
  HEAP32[$99 >> 2] = $26; //@line 1845
  $100 = $ReallocAsyncCtx6 + 56 | 0; //@line 1846
  HEAP32[$100 >> 2] = $28; //@line 1847
  $101 = $ReallocAsyncCtx6 + 60 | 0; //@line 1848
  HEAP32[$101 >> 2] = $30; //@line 1849
  sp = STACKTOP; //@line 1850
  STACKTOP = sp; //@line 1851
  return;
 }
 HEAP32[___async_retval >> 2] = $86; //@line 1854
 ___async_unwind = 0; //@line 1855
 HEAP32[$ReallocAsyncCtx6 >> 2] = 102; //@line 1856
 $87 = $ReallocAsyncCtx6 + 4 | 0; //@line 1857
 HEAP32[$87 >> 2] = $6; //@line 1858
 $88 = $ReallocAsyncCtx6 + 8 | 0; //@line 1859
 HEAP32[$88 >> 2] = $2; //@line 1860
 $89 = $ReallocAsyncCtx6 + 12 | 0; //@line 1861
 HEAP32[$89 >> 2] = $4; //@line 1862
 $90 = $ReallocAsyncCtx6 + 16 | 0; //@line 1863
 HEAP32[$90 >> 2] = $8; //@line 1864
 $91 = $ReallocAsyncCtx6 + 20 | 0; //@line 1865
 HEAP32[$91 >> 2] = $10; //@line 1866
 $92 = $ReallocAsyncCtx6 + 24 | 0; //@line 1867
 HEAP32[$92 >> 2] = $12; //@line 1868
 $93 = $ReallocAsyncCtx6 + 28 | 0; //@line 1869
 HEAP32[$93 >> 2] = $14; //@line 1870
 $94 = $ReallocAsyncCtx6 + 32 | 0; //@line 1871
 HEAP32[$94 >> 2] = $16; //@line 1872
 $95 = $ReallocAsyncCtx6 + 36 | 0; //@line 1873
 HEAP32[$95 >> 2] = $18; //@line 1874
 $96 = $ReallocAsyncCtx6 + 40 | 0; //@line 1875
 HEAP32[$96 >> 2] = $20; //@line 1876
 $97 = $ReallocAsyncCtx6 + 44 | 0; //@line 1877
 HEAP32[$97 >> 2] = $22; //@line 1878
 $98 = $ReallocAsyncCtx6 + 48 | 0; //@line 1879
 HEAP32[$98 >> 2] = $24; //@line 1880
 $99 = $ReallocAsyncCtx6 + 52 | 0; //@line 1881
 HEAP32[$99 >> 2] = $26; //@line 1882
 $100 = $ReallocAsyncCtx6 + 56 | 0; //@line 1883
 HEAP32[$100 >> 2] = $28; //@line 1884
 $101 = $ReallocAsyncCtx6 + 60 | 0; //@line 1885
 HEAP32[$101 >> 2] = $30; //@line 1886
 sp = STACKTOP; //@line 1887
 STACKTOP = sp; //@line 1888
 return;
}
function ___udivmoddi4($a$0, $a$1, $b$0, $b$1, $rem) {
 $a$0 = $a$0 | 0;
 $a$1 = $a$1 | 0;
 $b$0 = $b$0 | 0;
 $b$1 = $b$1 | 0;
 $rem = $rem | 0;
 var $n_sroa_0_0_extract_trunc = 0, $n_sroa_1_4_extract_shift$0 = 0, $n_sroa_1_4_extract_trunc = 0, $d_sroa_0_0_extract_trunc = 0, $d_sroa_1_4_extract_shift$0 = 0, $d_sroa_1_4_extract_trunc = 0, $4 = 0, $17 = 0, $37 = 0, $51 = 0, $57 = 0, $58 = 0, $66 = 0, $78 = 0, $88 = 0, $89 = 0, $91 = 0, $92 = 0, $95 = 0, $105 = 0, $119 = 0, $125 = 0, $126 = 0, $130 = 0, $q_sroa_1_1_ph = 0, $q_sroa_0_1_ph = 0, $r_sroa_1_1_ph = 0, $r_sroa_0_1_ph = 0, $sr_1_ph = 0, $d_sroa_0_0_insert_insert99$0 = 0, $d_sroa_0_0_insert_insert99$1 = 0, $137$0 = 0, $137$1 = 0, $carry_0203 = 0, $sr_1202 = 0, $r_sroa_0_1201 = 0, $r_sroa_1_1200 = 0, $q_sroa_0_1199 = 0, $q_sroa_1_1198 = 0, $r_sroa_0_0_insert_insert42$0 = 0, $r_sroa_0_0_insert_insert42$1 = 0, $150$1 = 0, $151$0 = 0, $carry_0_lcssa$0 = 0, $carry_0_lcssa$1 = 0, $r_sroa_0_1_lcssa = 0, $r_sroa_1_1_lcssa = 0, $q_sroa_0_1_lcssa = 0, $q_sroa_1_1_lcssa = 0, $q_sroa_0_0_insert_ext75$0 = 0, $q_sroa_0_0_insert_ext75$1 = 0, $_0$0 = 0, $_0$1 = 0, $q_sroa_1_1198$looptemp = 0;
 $n_sroa_0_0_extract_trunc = $a$0; //@line 3169
 $n_sroa_1_4_extract_shift$0 = $a$1; //@line 3170
 $n_sroa_1_4_extract_trunc = $n_sroa_1_4_extract_shift$0; //@line 3171
 $d_sroa_0_0_extract_trunc = $b$0; //@line 3172
 $d_sroa_1_4_extract_shift$0 = $b$1; //@line 3173
 $d_sroa_1_4_extract_trunc = $d_sroa_1_4_extract_shift$0; //@line 3174
 if (!$n_sroa_1_4_extract_trunc) {
  $4 = ($rem | 0) != 0; //@line 3176
  if (!$d_sroa_1_4_extract_trunc) {
   if ($4) {
    HEAP32[$rem >> 2] = ($n_sroa_0_0_extract_trunc >>> 0) % ($d_sroa_0_0_extract_trunc >>> 0); //@line 3179
    HEAP32[$rem + 4 >> 2] = 0; //@line 3180
   }
   $_0$1 = 0; //@line 3182
   $_0$0 = ($n_sroa_0_0_extract_trunc >>> 0) / ($d_sroa_0_0_extract_trunc >>> 0) >>> 0; //@line 3183
   return (tempRet0 = $_0$1, $_0$0) | 0; //@line 3184
  } else {
   if (!$4) {
    $_0$1 = 0; //@line 3187
    $_0$0 = 0; //@line 3188
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 3189
   }
   HEAP32[$rem >> 2] = $a$0 | 0; //@line 3191
   HEAP32[$rem + 4 >> 2] = $a$1 & 0; //@line 3192
   $_0$1 = 0; //@line 3193
   $_0$0 = 0; //@line 3194
   return (tempRet0 = $_0$1, $_0$0) | 0; //@line 3195
  }
 }
 $17 = ($d_sroa_1_4_extract_trunc | 0) == 0; //@line 3198
 do {
  if (!$d_sroa_0_0_extract_trunc) {
   if ($17) {
    if ($rem | 0) {
     HEAP32[$rem >> 2] = ($n_sroa_1_4_extract_trunc >>> 0) % ($d_sroa_0_0_extract_trunc >>> 0); //@line 3203
     HEAP32[$rem + 4 >> 2] = 0; //@line 3204
    }
    $_0$1 = 0; //@line 3206
    $_0$0 = ($n_sroa_1_4_extract_trunc >>> 0) / ($d_sroa_0_0_extract_trunc >>> 0) >>> 0; //@line 3207
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 3208
   }
   if (!$n_sroa_0_0_extract_trunc) {
    if ($rem | 0) {
     HEAP32[$rem >> 2] = 0; //@line 3212
     HEAP32[$rem + 4 >> 2] = ($n_sroa_1_4_extract_trunc >>> 0) % ($d_sroa_1_4_extract_trunc >>> 0); //@line 3213
    }
    $_0$1 = 0; //@line 3215
    $_0$0 = ($n_sroa_1_4_extract_trunc >>> 0) / ($d_sroa_1_4_extract_trunc >>> 0) >>> 0; //@line 3216
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 3217
   }
   $37 = $d_sroa_1_4_extract_trunc - 1 | 0; //@line 3219
   if (!($37 & $d_sroa_1_4_extract_trunc)) {
    if ($rem | 0) {
     HEAP32[$rem >> 2] = $a$0 | 0; //@line 3222
     HEAP32[$rem + 4 >> 2] = $37 & $n_sroa_1_4_extract_trunc | $a$1 & 0; //@line 3223
    }
    $_0$1 = 0; //@line 3225
    $_0$0 = $n_sroa_1_4_extract_trunc >>> ((_llvm_cttz_i32($d_sroa_1_4_extract_trunc | 0) | 0) >>> 0); //@line 3226
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 3227
   }
   $51 = (Math_clz32($d_sroa_1_4_extract_trunc | 0) | 0) - (Math_clz32($n_sroa_1_4_extract_trunc | 0) | 0) | 0; //@line 3230
   if ($51 >>> 0 <= 30) {
    $57 = $51 + 1 | 0; //@line 3232
    $58 = 31 - $51 | 0; //@line 3233
    $sr_1_ph = $57; //@line 3234
    $r_sroa_0_1_ph = $n_sroa_1_4_extract_trunc << $58 | $n_sroa_0_0_extract_trunc >>> ($57 >>> 0); //@line 3235
    $r_sroa_1_1_ph = $n_sroa_1_4_extract_trunc >>> ($57 >>> 0); //@line 3236
    $q_sroa_0_1_ph = 0; //@line 3237
    $q_sroa_1_1_ph = $n_sroa_0_0_extract_trunc << $58; //@line 3238
    break;
   }
   if (!$rem) {
    $_0$1 = 0; //@line 3242
    $_0$0 = 0; //@line 3243
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 3244
   }
   HEAP32[$rem >> 2] = $a$0 | 0; //@line 3246
   HEAP32[$rem + 4 >> 2] = $n_sroa_1_4_extract_shift$0 | $a$1 & 0; //@line 3247
   $_0$1 = 0; //@line 3248
   $_0$0 = 0; //@line 3249
   return (tempRet0 = $_0$1, $_0$0) | 0; //@line 3250
  } else {
   if (!$17) {
    $119 = (Math_clz32($d_sroa_1_4_extract_trunc | 0) | 0) - (Math_clz32($n_sroa_1_4_extract_trunc | 0) | 0) | 0; //@line 3254
    if ($119 >>> 0 <= 31) {
     $125 = $119 + 1 | 0; //@line 3256
     $126 = 31 - $119 | 0; //@line 3257
     $130 = $119 - 31 >> 31; //@line 3258
     $sr_1_ph = $125; //@line 3259
     $r_sroa_0_1_ph = $n_sroa_0_0_extract_trunc >>> ($125 >>> 0) & $130 | $n_sroa_1_4_extract_trunc << $126; //@line 3260
     $r_sroa_1_1_ph = $n_sroa_1_4_extract_trunc >>> ($125 >>> 0) & $130; //@line 3261
     $q_sroa_0_1_ph = 0; //@line 3262
     $q_sroa_1_1_ph = $n_sroa_0_0_extract_trunc << $126; //@line 3263
     break;
    }
    if (!$rem) {
     $_0$1 = 0; //@line 3267
     $_0$0 = 0; //@line 3268
     return (tempRet0 = $_0$1, $_0$0) | 0; //@line 3269
    }
    HEAP32[$rem >> 2] = $a$0 | 0; //@line 3271
    HEAP32[$rem + 4 >> 2] = $n_sroa_1_4_extract_shift$0 | $a$1 & 0; //@line 3272
    $_0$1 = 0; //@line 3273
    $_0$0 = 0; //@line 3274
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 3275
   }
   $66 = $d_sroa_0_0_extract_trunc - 1 | 0; //@line 3277
   if ($66 & $d_sroa_0_0_extract_trunc | 0) {
    $88 = (Math_clz32($d_sroa_0_0_extract_trunc | 0) | 0) + 33 - (Math_clz32($n_sroa_1_4_extract_trunc | 0) | 0) | 0; //@line 3280
    $89 = 64 - $88 | 0; //@line 3281
    $91 = 32 - $88 | 0; //@line 3282
    $92 = $91 >> 31; //@line 3283
    $95 = $88 - 32 | 0; //@line 3284
    $105 = $95 >> 31; //@line 3285
    $sr_1_ph = $88; //@line 3286
    $r_sroa_0_1_ph = $91 - 1 >> 31 & $n_sroa_1_4_extract_trunc >>> ($95 >>> 0) | ($n_sroa_1_4_extract_trunc << $91 | $n_sroa_0_0_extract_trunc >>> ($88 >>> 0)) & $105; //@line 3287
    $r_sroa_1_1_ph = $105 & $n_sroa_1_4_extract_trunc >>> ($88 >>> 0); //@line 3288
    $q_sroa_0_1_ph = $n_sroa_0_0_extract_trunc << $89 & $92; //@line 3289
    $q_sroa_1_1_ph = ($n_sroa_1_4_extract_trunc << $89 | $n_sroa_0_0_extract_trunc >>> ($95 >>> 0)) & $92 | $n_sroa_0_0_extract_trunc << $91 & $88 - 33 >> 31; //@line 3290
    break;
   }
   if ($rem | 0) {
    HEAP32[$rem >> 2] = $66 & $n_sroa_0_0_extract_trunc; //@line 3294
    HEAP32[$rem + 4 >> 2] = 0; //@line 3295
   }
   if (($d_sroa_0_0_extract_trunc | 0) == 1) {
    $_0$1 = $n_sroa_1_4_extract_shift$0 | $a$1 & 0; //@line 3298
    $_0$0 = $a$0 | 0 | 0; //@line 3299
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 3300
   } else {
    $78 = _llvm_cttz_i32($d_sroa_0_0_extract_trunc | 0) | 0; //@line 3302
    $_0$1 = $n_sroa_1_4_extract_trunc >>> ($78 >>> 0) | 0; //@line 3303
    $_0$0 = $n_sroa_1_4_extract_trunc << 32 - $78 | $n_sroa_0_0_extract_trunc >>> ($78 >>> 0) | 0; //@line 3304
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 3305
   }
  }
 } while (0);
 if (!$sr_1_ph) {
  $q_sroa_1_1_lcssa = $q_sroa_1_1_ph; //@line 3310
  $q_sroa_0_1_lcssa = $q_sroa_0_1_ph; //@line 3311
  $r_sroa_1_1_lcssa = $r_sroa_1_1_ph; //@line 3312
  $r_sroa_0_1_lcssa = $r_sroa_0_1_ph; //@line 3313
  $carry_0_lcssa$1 = 0; //@line 3314
  $carry_0_lcssa$0 = 0; //@line 3315
 } else {
  $d_sroa_0_0_insert_insert99$0 = $b$0 | 0 | 0; //@line 3317
  $d_sroa_0_0_insert_insert99$1 = $d_sroa_1_4_extract_shift$0 | $b$1 & 0; //@line 3318
  $137$0 = _i64Add($d_sroa_0_0_insert_insert99$0 | 0, $d_sroa_0_0_insert_insert99$1 | 0, -1, -1) | 0; //@line 3319
  $137$1 = tempRet0; //@line 3320
  $q_sroa_1_1198 = $q_sroa_1_1_ph; //@line 3321
  $q_sroa_0_1199 = $q_sroa_0_1_ph; //@line 3322
  $r_sroa_1_1200 = $r_sroa_1_1_ph; //@line 3323
  $r_sroa_0_1201 = $r_sroa_0_1_ph; //@line 3324
  $sr_1202 = $sr_1_ph; //@line 3325
  $carry_0203 = 0; //@line 3326
  do {
   $q_sroa_1_1198$looptemp = $q_sroa_1_1198;
   $q_sroa_1_1198 = $q_sroa_0_1199 >>> 31 | $q_sroa_1_1198 << 1; //@line 3328
   $q_sroa_0_1199 = $carry_0203 | $q_sroa_0_1199 << 1; //@line 3329
   $r_sroa_0_0_insert_insert42$0 = $r_sroa_0_1201 << 1 | $q_sroa_1_1198$looptemp >>> 31 | 0; //@line 3330
   $r_sroa_0_0_insert_insert42$1 = $r_sroa_0_1201 >>> 31 | $r_sroa_1_1200 << 1 | 0; //@line 3331
   _i64Subtract($137$0 | 0, $137$1 | 0, $r_sroa_0_0_insert_insert42$0 | 0, $r_sroa_0_0_insert_insert42$1 | 0) | 0; //@line 3332
   $150$1 = tempRet0; //@line 3333
   $151$0 = $150$1 >> 31 | (($150$1 | 0) < 0 ? -1 : 0) << 1; //@line 3334
   $carry_0203 = $151$0 & 1; //@line 3335
   $r_sroa_0_1201 = _i64Subtract($r_sroa_0_0_insert_insert42$0 | 0, $r_sroa_0_0_insert_insert42$1 | 0, $151$0 & $d_sroa_0_0_insert_insert99$0 | 0, ((($150$1 | 0) < 0 ? -1 : 0) >> 31 | (($150$1 | 0) < 0 ? -1 : 0) << 1) & $d_sroa_0_0_insert_insert99$1 | 0) | 0; //@line 3337
   $r_sroa_1_1200 = tempRet0; //@line 3338
   $sr_1202 = $sr_1202 - 1 | 0; //@line 3339
  } while (($sr_1202 | 0) != 0);
  $q_sroa_1_1_lcssa = $q_sroa_1_1198; //@line 3351
  $q_sroa_0_1_lcssa = $q_sroa_0_1199; //@line 3352
  $r_sroa_1_1_lcssa = $r_sroa_1_1200; //@line 3353
  $r_sroa_0_1_lcssa = $r_sroa_0_1201; //@line 3354
  $carry_0_lcssa$1 = 0; //@line 3355
  $carry_0_lcssa$0 = $carry_0203; //@line 3356
 }
 $q_sroa_0_0_insert_ext75$0 = $q_sroa_0_1_lcssa; //@line 3358
 $q_sroa_0_0_insert_ext75$1 = 0; //@line 3359
 if ($rem | 0) {
  HEAP32[$rem >> 2] = $r_sroa_0_1_lcssa; //@line 3362
  HEAP32[$rem + 4 >> 2] = $r_sroa_1_1_lcssa; //@line 3363
 }
 $_0$1 = ($q_sroa_0_0_insert_ext75$0 | 0) >>> 31 | ($q_sroa_1_1_lcssa | $q_sroa_0_0_insert_ext75$1) << 1 | ($q_sroa_0_0_insert_ext75$1 << 1 | $q_sroa_0_0_insert_ext75$0 >>> 31) & 0 | $carry_0_lcssa$1; //@line 3365
 $_0$0 = ($q_sroa_0_0_insert_ext75$0 << 1 | 0 >>> 31) & -2 | $carry_0_lcssa$0; //@line 3366
 return (tempRet0 = $_0$1, $_0$0) | 0; //@line 3367
}
function __ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($0, $1, $2, $3, $4) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 var $$0 = 0, $$081$off0 = 0, $$084 = 0, $$085$off0 = 0, $$1 = 0, $$182$off0 = 0, $$186$off0 = 0, $$2 = 0, $$283$off0 = 0, $100 = 0, $104 = 0, $105 = 0, $106 = 0, $122 = 0, $13 = 0, $136 = 0, $19 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $30 = 0, $61 = 0, $69 = 0, $72 = 0, $73 = 0, $81 = 0, $84 = 0, $87 = 0, $90 = 0, $AsyncCtx = 0, $AsyncCtx11 = 0, $AsyncCtx15 = 0, $AsyncCtx3 = 0, $AsyncCtx7 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 8201
 L1 : do {
  if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, $4) | 0) {
   __ZNK10__cxxabiv117__class_type_info29process_static_type_below_dstEPNS_19__dynamic_cast_infoEPKvi(0, $1, $2, $3); //@line 8207
  } else {
   if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 >> 2] | 0, $4) | 0) {
    if ((HEAP32[$1 + 16 >> 2] | 0) != ($2 | 0)) {
     $13 = $1 + 20 | 0; //@line 8216
     if ((HEAP32[$13 >> 2] | 0) != ($2 | 0)) {
      HEAP32[$1 + 32 >> 2] = $3; //@line 8221
      $19 = $1 + 44 | 0; //@line 8222
      if ((HEAP32[$19 >> 2] | 0) == 4) {
       break;
      }
      $25 = $0 + 16 + (HEAP32[$0 + 12 >> 2] << 3) | 0; //@line 8231
      $26 = $1 + 52 | 0; //@line 8232
      $27 = $1 + 53 | 0; //@line 8233
      $28 = $1 + 54 | 0; //@line 8234
      $29 = $0 + 8 | 0; //@line 8235
      $30 = $1 + 24 | 0; //@line 8236
      $$081$off0 = 0; //@line 8237
      $$084 = $0 + 16 | 0; //@line 8237
      $$085$off0 = 0; //@line 8237
      L10 : while (1) {
       if ($$084 >>> 0 >= $25 >>> 0) {
        $$283$off0 = $$081$off0; //@line 8241
        label = 20; //@line 8242
        break;
       }
       HEAP8[$26 >> 0] = 0; //@line 8245
       HEAP8[$27 >> 0] = 0; //@line 8246
       $AsyncCtx15 = _emscripten_alloc_async_context(56, sp) | 0; //@line 8247
       __ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($$084, $1, $2, $2, 1, $4); //@line 8248
       if (___async) {
        label = 12; //@line 8251
        break;
       }
       _emscripten_free_async_context($AsyncCtx15 | 0); //@line 8254
       if (HEAP8[$28 >> 0] | 0) {
        $$283$off0 = $$081$off0; //@line 8258
        label = 20; //@line 8259
        break;
       }
       do {
        if (!(HEAP8[$27 >> 0] | 0)) {
         $$182$off0 = $$081$off0; //@line 8266
         $$186$off0 = $$085$off0; //@line 8266
        } else {
         if (!(HEAP8[$26 >> 0] | 0)) {
          if (!(HEAP32[$29 >> 2] & 1)) {
           $$283$off0 = 1; //@line 8275
           label = 20; //@line 8276
           break L10;
          } else {
           $$182$off0 = 1; //@line 8279
           $$186$off0 = $$085$off0; //@line 8279
           break;
          }
         }
         if ((HEAP32[$30 >> 2] | 0) == 1) {
          label = 25; //@line 8286
          break L10;
         }
         if (!(HEAP32[$29 >> 2] & 2)) {
          label = 25; //@line 8293
          break L10;
         } else {
          $$182$off0 = 1; //@line 8296
          $$186$off0 = 1; //@line 8296
         }
        }
       } while (0);
       $$081$off0 = $$182$off0; //@line 8301
       $$084 = $$084 + 8 | 0; //@line 8301
       $$085$off0 = $$186$off0; //@line 8301
      }
      if ((label | 0) == 12) {
       HEAP32[$AsyncCtx15 >> 2] = 164; //@line 8304
       HEAP32[$AsyncCtx15 + 4 >> 2] = $30; //@line 8306
       HEAP32[$AsyncCtx15 + 8 >> 2] = $26; //@line 8308
       HEAP32[$AsyncCtx15 + 12 >> 2] = $29; //@line 8310
       HEAP32[$AsyncCtx15 + 16 >> 2] = $25; //@line 8312
       HEAP32[$AsyncCtx15 + 20 >> 2] = $27; //@line 8314
       HEAP32[$AsyncCtx15 + 24 >> 2] = $1; //@line 8316
       HEAP32[$AsyncCtx15 + 28 >> 2] = $2; //@line 8318
       HEAP8[$AsyncCtx15 + 32 >> 0] = $4 & 1; //@line 8321
       HEAP32[$AsyncCtx15 + 36 >> 2] = $28; //@line 8323
       HEAP32[$AsyncCtx15 + 40 >> 2] = $19; //@line 8325
       HEAP8[$AsyncCtx15 + 44 >> 0] = $$081$off0 & 1; //@line 8328
       HEAP8[$AsyncCtx15 + 45 >> 0] = $$085$off0 & 1; //@line 8331
       HEAP32[$AsyncCtx15 + 48 >> 2] = $$084; //@line 8333
       HEAP32[$AsyncCtx15 + 52 >> 2] = $13; //@line 8335
       sp = STACKTOP; //@line 8336
       return;
      }
      do {
       if ((label | 0) == 20) {
        if (!$$085$off0) {
         HEAP32[$13 >> 2] = $2; //@line 8342
         $61 = $1 + 40 | 0; //@line 8343
         HEAP32[$61 >> 2] = (HEAP32[$61 >> 2] | 0) + 1; //@line 8346
         if ((HEAP32[$1 + 36 >> 2] | 0) == 1) {
          if ((HEAP32[$30 >> 2] | 0) == 2) {
           HEAP8[$28 >> 0] = 1; //@line 8354
           if ($$283$off0) {
            label = 25; //@line 8356
            break;
           } else {
            $69 = 4; //@line 8359
            break;
           }
          }
         }
        }
        if ($$283$off0) {
         label = 25; //@line 8366
        } else {
         $69 = 4; //@line 8368
        }
       }
      } while (0);
      if ((label | 0) == 25) {
       $69 = 3; //@line 8373
      }
      HEAP32[$19 >> 2] = $69; //@line 8375
      break;
     }
    }
    if (($3 | 0) != 1) {
     break;
    }
    HEAP32[$1 + 32 >> 2] = 1; //@line 8384
    break;
   }
   $72 = HEAP32[$0 + 12 >> 2] | 0; //@line 8389
   $73 = $0 + 16 + ($72 << 3) | 0; //@line 8390
   $AsyncCtx11 = _emscripten_alloc_async_context(32, sp) | 0; //@line 8391
   __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($0 + 16 | 0, $1, $2, $3, $4); //@line 8392
   if (___async) {
    HEAP32[$AsyncCtx11 >> 2] = 165; //@line 8395
    HEAP32[$AsyncCtx11 + 4 >> 2] = $1; //@line 8397
    HEAP32[$AsyncCtx11 + 8 >> 2] = $2; //@line 8399
    HEAP32[$AsyncCtx11 + 12 >> 2] = $3; //@line 8401
    HEAP8[$AsyncCtx11 + 16 >> 0] = $4 & 1; //@line 8404
    HEAP32[$AsyncCtx11 + 20 >> 2] = $73; //@line 8406
    HEAP32[$AsyncCtx11 + 24 >> 2] = $0; //@line 8408
    HEAP32[$AsyncCtx11 + 28 >> 2] = $72; //@line 8410
    sp = STACKTOP; //@line 8411
    return;
   }
   _emscripten_free_async_context($AsyncCtx11 | 0); //@line 8414
   $81 = $0 + 24 | 0; //@line 8415
   if (($72 | 0) > 1) {
    $84 = HEAP32[$0 + 8 >> 2] | 0; //@line 8419
    if (!($84 & 2)) {
     $87 = $1 + 36 | 0; //@line 8423
     if ((HEAP32[$87 >> 2] | 0) != 1) {
      if (!($84 & 1)) {
       $106 = $1 + 54 | 0; //@line 8430
       $$2 = $81; //@line 8431
       while (1) {
        if (HEAP8[$106 >> 0] | 0) {
         break L1;
        }
        if ((HEAP32[$87 >> 2] | 0) == 1) {
         break L1;
        }
        $AsyncCtx = _emscripten_alloc_async_context(36, sp) | 0; //@line 8443
        __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($$2, $1, $2, $3, $4); //@line 8444
        if (___async) {
         break;
        }
        _emscripten_free_async_context($AsyncCtx | 0); //@line 8449
        $136 = $$2 + 8 | 0; //@line 8450
        if ($136 >>> 0 < $73 >>> 0) {
         $$2 = $136; //@line 8453
        } else {
         break L1;
        }
       }
       HEAP32[$AsyncCtx >> 2] = 168; //@line 8458
       HEAP32[$AsyncCtx + 4 >> 2] = $$2; //@line 8460
       HEAP32[$AsyncCtx + 8 >> 2] = $73; //@line 8462
       HEAP32[$AsyncCtx + 12 >> 2] = $106; //@line 8464
       HEAP32[$AsyncCtx + 16 >> 2] = $87; //@line 8466
       HEAP32[$AsyncCtx + 20 >> 2] = $1; //@line 8468
       HEAP32[$AsyncCtx + 24 >> 2] = $2; //@line 8470
       HEAP32[$AsyncCtx + 28 >> 2] = $3; //@line 8472
       HEAP8[$AsyncCtx + 32 >> 0] = $4 & 1; //@line 8475
       sp = STACKTOP; //@line 8476
       return;
      }
      $104 = $1 + 24 | 0; //@line 8479
      $105 = $1 + 54 | 0; //@line 8480
      $$1 = $81; //@line 8481
      while (1) {
       if (HEAP8[$105 >> 0] | 0) {
        break L1;
       }
       if ((HEAP32[$87 >> 2] | 0) == 1) {
        if ((HEAP32[$104 >> 2] | 0) == 1) {
         break L1;
        }
       }
       $AsyncCtx3 = _emscripten_alloc_async_context(40, sp) | 0; //@line 8497
       __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($$1, $1, $2, $3, $4); //@line 8498
       if (___async) {
        break;
       }
       _emscripten_free_async_context($AsyncCtx3 | 0); //@line 8503
       $122 = $$1 + 8 | 0; //@line 8504
       if ($122 >>> 0 < $73 >>> 0) {
        $$1 = $122; //@line 8507
       } else {
        break L1;
       }
      }
      HEAP32[$AsyncCtx3 >> 2] = 167; //@line 8512
      HEAP32[$AsyncCtx3 + 4 >> 2] = $$1; //@line 8514
      HEAP32[$AsyncCtx3 + 8 >> 2] = $73; //@line 8516
      HEAP32[$AsyncCtx3 + 12 >> 2] = $105; //@line 8518
      HEAP32[$AsyncCtx3 + 16 >> 2] = $87; //@line 8520
      HEAP32[$AsyncCtx3 + 20 >> 2] = $104; //@line 8522
      HEAP32[$AsyncCtx3 + 24 >> 2] = $1; //@line 8524
      HEAP32[$AsyncCtx3 + 28 >> 2] = $2; //@line 8526
      HEAP32[$AsyncCtx3 + 32 >> 2] = $3; //@line 8528
      HEAP8[$AsyncCtx3 + 36 >> 0] = $4 & 1; //@line 8531
      sp = STACKTOP; //@line 8532
      return;
     }
    }
    $90 = $1 + 54 | 0; //@line 8536
    $$0 = $81; //@line 8537
    while (1) {
     if (HEAP8[$90 >> 0] | 0) {
      break L1;
     }
     $AsyncCtx7 = _emscripten_alloc_async_context(32, sp) | 0; //@line 8544
     __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($$0, $1, $2, $3, $4); //@line 8545
     if (___async) {
      break;
     }
     _emscripten_free_async_context($AsyncCtx7 | 0); //@line 8550
     $100 = $$0 + 8 | 0; //@line 8551
     if ($100 >>> 0 < $73 >>> 0) {
      $$0 = $100; //@line 8554
     } else {
      break L1;
     }
    }
    HEAP32[$AsyncCtx7 >> 2] = 166; //@line 8559
    HEAP32[$AsyncCtx7 + 4 >> 2] = $$0; //@line 8561
    HEAP32[$AsyncCtx7 + 8 >> 2] = $73; //@line 8563
    HEAP32[$AsyncCtx7 + 12 >> 2] = $90; //@line 8565
    HEAP32[$AsyncCtx7 + 16 >> 2] = $1; //@line 8567
    HEAP32[$AsyncCtx7 + 20 >> 2] = $2; //@line 8569
    HEAP32[$AsyncCtx7 + 24 >> 2] = $3; //@line 8571
    HEAP8[$AsyncCtx7 + 28 >> 0] = $4 & 1; //@line 8574
    sp = STACKTOP; //@line 8575
    return;
   }
  }
 } while (0);
 return;
}
function _mbed_die() {
 var $0 = 0, $AsyncCtx = 0, $AsyncCtx11 = 0, $AsyncCtx15 = 0, $AsyncCtx19 = 0, $AsyncCtx23 = 0, $AsyncCtx27 = 0, $AsyncCtx3 = 0, $AsyncCtx31 = 0, $AsyncCtx35 = 0, $AsyncCtx39 = 0, $AsyncCtx43 = 0, $AsyncCtx47 = 0, $AsyncCtx51 = 0, $AsyncCtx55 = 0, $AsyncCtx59 = 0, $AsyncCtx7 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 4758
 STACKTOP = STACKTOP + 32 | 0; //@line 4759
 $0 = sp; //@line 4760
 _gpio_init_out($0, 50); //@line 4761
 while (1) {
  _emscripten_asm_const_iii(8, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 4764
  $AsyncCtx59 = _emscripten_alloc_async_context(8, sp) | 0; //@line 4765
  _wait_ms(150); //@line 4766
  if (___async) {
   label = 3; //@line 4769
   break;
  }
  _emscripten_free_async_context($AsyncCtx59 | 0); //@line 4772
  _emscripten_asm_const_iii(8, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 4774
  $AsyncCtx55 = _emscripten_alloc_async_context(8, sp) | 0; //@line 4775
  _wait_ms(150); //@line 4776
  if (___async) {
   label = 5; //@line 4779
   break;
  }
  _emscripten_free_async_context($AsyncCtx55 | 0); //@line 4782
  _emscripten_asm_const_iii(8, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 4784
  $AsyncCtx51 = _emscripten_alloc_async_context(8, sp) | 0; //@line 4785
  _wait_ms(150); //@line 4786
  if (___async) {
   label = 7; //@line 4789
   break;
  }
  _emscripten_free_async_context($AsyncCtx51 | 0); //@line 4792
  _emscripten_asm_const_iii(8, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 4794
  $AsyncCtx47 = _emscripten_alloc_async_context(8, sp) | 0; //@line 4795
  _wait_ms(150); //@line 4796
  if (___async) {
   label = 9; //@line 4799
   break;
  }
  _emscripten_free_async_context($AsyncCtx47 | 0); //@line 4802
  _emscripten_asm_const_iii(8, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 4804
  $AsyncCtx43 = _emscripten_alloc_async_context(8, sp) | 0; //@line 4805
  _wait_ms(150); //@line 4806
  if (___async) {
   label = 11; //@line 4809
   break;
  }
  _emscripten_free_async_context($AsyncCtx43 | 0); //@line 4812
  _emscripten_asm_const_iii(8, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 4814
  $AsyncCtx39 = _emscripten_alloc_async_context(8, sp) | 0; //@line 4815
  _wait_ms(150); //@line 4816
  if (___async) {
   label = 13; //@line 4819
   break;
  }
  _emscripten_free_async_context($AsyncCtx39 | 0); //@line 4822
  _emscripten_asm_const_iii(8, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 4824
  $AsyncCtx35 = _emscripten_alloc_async_context(8, sp) | 0; //@line 4825
  _wait_ms(150); //@line 4826
  if (___async) {
   label = 15; //@line 4829
   break;
  }
  _emscripten_free_async_context($AsyncCtx35 | 0); //@line 4832
  _emscripten_asm_const_iii(8, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 4834
  $AsyncCtx31 = _emscripten_alloc_async_context(8, sp) | 0; //@line 4835
  _wait_ms(150); //@line 4836
  if (___async) {
   label = 17; //@line 4839
   break;
  }
  _emscripten_free_async_context($AsyncCtx31 | 0); //@line 4842
  _emscripten_asm_const_iii(8, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 4844
  $AsyncCtx27 = _emscripten_alloc_async_context(8, sp) | 0; //@line 4845
  _wait_ms(400); //@line 4846
  if (___async) {
   label = 19; //@line 4849
   break;
  }
  _emscripten_free_async_context($AsyncCtx27 | 0); //@line 4852
  _emscripten_asm_const_iii(8, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 4854
  $AsyncCtx23 = _emscripten_alloc_async_context(8, sp) | 0; //@line 4855
  _wait_ms(400); //@line 4856
  if (___async) {
   label = 21; //@line 4859
   break;
  }
  _emscripten_free_async_context($AsyncCtx23 | 0); //@line 4862
  _emscripten_asm_const_iii(8, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 4864
  $AsyncCtx19 = _emscripten_alloc_async_context(8, sp) | 0; //@line 4865
  _wait_ms(400); //@line 4866
  if (___async) {
   label = 23; //@line 4869
   break;
  }
  _emscripten_free_async_context($AsyncCtx19 | 0); //@line 4872
  _emscripten_asm_const_iii(8, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 4874
  $AsyncCtx15 = _emscripten_alloc_async_context(8, sp) | 0; //@line 4875
  _wait_ms(400); //@line 4876
  if (___async) {
   label = 25; //@line 4879
   break;
  }
  _emscripten_free_async_context($AsyncCtx15 | 0); //@line 4882
  _emscripten_asm_const_iii(8, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 4884
  $AsyncCtx11 = _emscripten_alloc_async_context(8, sp) | 0; //@line 4885
  _wait_ms(400); //@line 4886
  if (___async) {
   label = 27; //@line 4889
   break;
  }
  _emscripten_free_async_context($AsyncCtx11 | 0); //@line 4892
  _emscripten_asm_const_iii(8, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 4894
  $AsyncCtx7 = _emscripten_alloc_async_context(8, sp) | 0; //@line 4895
  _wait_ms(400); //@line 4896
  if (___async) {
   label = 29; //@line 4899
   break;
  }
  _emscripten_free_async_context($AsyncCtx7 | 0); //@line 4902
  _emscripten_asm_const_iii(8, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 4904
  $AsyncCtx3 = _emscripten_alloc_async_context(8, sp) | 0; //@line 4905
  _wait_ms(400); //@line 4906
  if (___async) {
   label = 31; //@line 4909
   break;
  }
  _emscripten_free_async_context($AsyncCtx3 | 0); //@line 4912
  _emscripten_asm_const_iii(8, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 4914
  $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 4915
  _wait_ms(400); //@line 4916
  if (___async) {
   label = 33; //@line 4919
   break;
  }
  _emscripten_free_async_context($AsyncCtx | 0); //@line 4922
 }
 switch (label | 0) {
 case 3:
  {
   HEAP32[$AsyncCtx59 >> 2] = 106; //@line 4926
   HEAP32[$AsyncCtx59 + 4 >> 2] = $0; //@line 4928
   sp = STACKTOP; //@line 4929
   STACKTOP = sp; //@line 4930
   return;
  }
 case 5:
  {
   HEAP32[$AsyncCtx55 >> 2] = 107; //@line 4934
   HEAP32[$AsyncCtx55 + 4 >> 2] = $0; //@line 4936
   sp = STACKTOP; //@line 4937
   STACKTOP = sp; //@line 4938
   return;
  }
 case 7:
  {
   HEAP32[$AsyncCtx51 >> 2] = 108; //@line 4942
   HEAP32[$AsyncCtx51 + 4 >> 2] = $0; //@line 4944
   sp = STACKTOP; //@line 4945
   STACKTOP = sp; //@line 4946
   return;
  }
 case 9:
  {
   HEAP32[$AsyncCtx47 >> 2] = 109; //@line 4950
   HEAP32[$AsyncCtx47 + 4 >> 2] = $0; //@line 4952
   sp = STACKTOP; //@line 4953
   STACKTOP = sp; //@line 4954
   return;
  }
 case 11:
  {
   HEAP32[$AsyncCtx43 >> 2] = 110; //@line 4958
   HEAP32[$AsyncCtx43 + 4 >> 2] = $0; //@line 4960
   sp = STACKTOP; //@line 4961
   STACKTOP = sp; //@line 4962
   return;
  }
 case 13:
  {
   HEAP32[$AsyncCtx39 >> 2] = 111; //@line 4966
   HEAP32[$AsyncCtx39 + 4 >> 2] = $0; //@line 4968
   sp = STACKTOP; //@line 4969
   STACKTOP = sp; //@line 4970
   return;
  }
 case 15:
  {
   HEAP32[$AsyncCtx35 >> 2] = 112; //@line 4974
   HEAP32[$AsyncCtx35 + 4 >> 2] = $0; //@line 4976
   sp = STACKTOP; //@line 4977
   STACKTOP = sp; //@line 4978
   return;
  }
 case 17:
  {
   HEAP32[$AsyncCtx31 >> 2] = 113; //@line 4982
   HEAP32[$AsyncCtx31 + 4 >> 2] = $0; //@line 4984
   sp = STACKTOP; //@line 4985
   STACKTOP = sp; //@line 4986
   return;
  }
 case 19:
  {
   HEAP32[$AsyncCtx27 >> 2] = 114; //@line 4990
   HEAP32[$AsyncCtx27 + 4 >> 2] = $0; //@line 4992
   sp = STACKTOP; //@line 4993
   STACKTOP = sp; //@line 4994
   return;
  }
 case 21:
  {
   HEAP32[$AsyncCtx23 >> 2] = 115; //@line 4998
   HEAP32[$AsyncCtx23 + 4 >> 2] = $0; //@line 5000
   sp = STACKTOP; //@line 5001
   STACKTOP = sp; //@line 5002
   return;
  }
 case 23:
  {
   HEAP32[$AsyncCtx19 >> 2] = 116; //@line 5006
   HEAP32[$AsyncCtx19 + 4 >> 2] = $0; //@line 5008
   sp = STACKTOP; //@line 5009
   STACKTOP = sp; //@line 5010
   return;
  }
 case 25:
  {
   HEAP32[$AsyncCtx15 >> 2] = 117; //@line 5014
   HEAP32[$AsyncCtx15 + 4 >> 2] = $0; //@line 5016
   sp = STACKTOP; //@line 5017
   STACKTOP = sp; //@line 5018
   return;
  }
 case 27:
  {
   HEAP32[$AsyncCtx11 >> 2] = 118; //@line 5022
   HEAP32[$AsyncCtx11 + 4 >> 2] = $0; //@line 5024
   sp = STACKTOP; //@line 5025
   STACKTOP = sp; //@line 5026
   return;
  }
 case 29:
  {
   HEAP32[$AsyncCtx7 >> 2] = 119; //@line 5030
   HEAP32[$AsyncCtx7 + 4 >> 2] = $0; //@line 5032
   sp = STACKTOP; //@line 5033
   STACKTOP = sp; //@line 5034
   return;
  }
 case 31:
  {
   HEAP32[$AsyncCtx3 >> 2] = 120; //@line 5038
   HEAP32[$AsyncCtx3 + 4 >> 2] = $0; //@line 5040
   sp = STACKTOP; //@line 5041
   STACKTOP = sp; //@line 5042
   return;
  }
 case 33:
  {
   HEAP32[$AsyncCtx >> 2] = 121; //@line 5046
   HEAP32[$AsyncCtx + 4 >> 2] = $0; //@line 5048
   sp = STACKTOP; //@line 5049
   STACKTOP = sp; //@line 5050
   return;
  }
 }
}
function __ZL24nsapi_dns_query_multipleP12NetworkStackPKcP10nsapi_addrj13nsapi_version__async_cb_79($0) {
 $0 = $0 | 0;
 var $$019$i = 0, $$2 = 0, $$byval_copy = 0, $$sink$i = 0, $10 = 0, $12 = 0, $14 = 0, $16 = 0, $19 = 0, $2 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $33 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $4 = 0, $48 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0, $67 = 0, $68 = 0, $69 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $76 = 0, $77 = 0, $8 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx10 = 0, $ReallocAsyncCtx11 = 0, sp = 0;
 sp = STACKTOP; //@line 2795
 STACKTOP = STACKTOP + 32 | 0; //@line 2796
 $$byval_copy = sp; //@line 2797
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 2799
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 2801
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 2803
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 2805
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 2807
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 2809
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 2811
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 2813
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 2815
 if (!$AsyncRetVal) {
  __ZN6Socket11set_timeoutEi($10, 5e3); //@line 2818
  $19 = _malloc(512) | 0; //@line 2819
  if (!$19) {
   $$2 = -3007; //@line 2822
  } else {
   $21 = $19; //@line 2824
   $22 = $19 + 1 | 0; //@line 2825
   $23 = $19 + 2 | 0; //@line 2826
   $24 = $19 + 3 | 0; //@line 2827
   $25 = $19 + 4 | 0; //@line 2828
   $26 = $19 + 5 | 0; //@line 2829
   $27 = $19 + 6 | 0; //@line 2830
   $28 = $19 + 7 | 0; //@line 2831
   $29 = $19 + 12 | 0; //@line 2832
   $$sink$i = ($16 | 0) == 2 ? 28 : 1; //@line 2834
   HEAP8[$19 >> 0] = 0; //@line 2835
   HEAP8[$22 >> 0] = 1; //@line 2836
   HEAP8[$23 >> 0] = 1; //@line 2837
   HEAP8[$24 >> 0] = 0; //@line 2838
   HEAP8[$25 >> 0] = 0; //@line 2839
   HEAP8[$26 >> 0] = 1; //@line 2840
   HEAP8[$27 >> 0] = 0; //@line 2841
   HEAP8[$27 + 1 >> 0] = 0; //@line 2841
   HEAP8[$27 + 2 >> 0] = 0; //@line 2841
   HEAP8[$27 + 3 >> 0] = 0; //@line 2841
   HEAP8[$27 + 4 >> 0] = 0; //@line 2841
   HEAP8[$27 + 5 >> 0] = 0; //@line 2841
   if (!(HEAP8[$14 >> 0] | 0)) {
    $48 = $29; //@line 2845
   } else {
    $$019$i = $14; //@line 2847
    $36 = $29; //@line 2847
    while (1) {
     $33 = _strcspn($$019$i, 4557) | 0; //@line 2849
     $35 = $36 + 1 | 0; //@line 2851
     HEAP8[$36 >> 0] = $33; //@line 2852
     $37 = $33 & 255; //@line 2853
     _memcpy($35 | 0, $$019$i | 0, $37 | 0) | 0; //@line 2854
     $38 = $35 + $37 | 0; //@line 2855
     $$019$i = $$019$i + ($33 + ((HEAP8[$$019$i + $33 >> 0] | 0) == 46 & 1)) | 0; //@line 2861
     if (!(HEAP8[$$019$i >> 0] | 0)) {
      $48 = $38; //@line 2865
      break;
     } else {
      $36 = $38; //@line 2868
     }
    }
   }
   HEAP8[$48 >> 0] = 0; //@line 2873
   HEAP8[$48 + 1 >> 0] = 0; //@line 2875
   HEAP8[$48 + 2 >> 0] = $$sink$i; //@line 2877
   HEAP8[$48 + 3 >> 0] = 0; //@line 2879
   HEAP8[$48 + 4 >> 0] = 1; //@line 2880
   HEAP32[$$byval_copy >> 2] = HEAP32[124]; //@line 2881
   HEAP32[$$byval_copy + 4 >> 2] = HEAP32[125]; //@line 2881
   HEAP32[$$byval_copy + 8 >> 2] = HEAP32[126]; //@line 2881
   HEAP32[$$byval_copy + 12 >> 2] = HEAP32[127]; //@line 2881
   HEAP32[$$byval_copy + 16 >> 2] = HEAP32[128]; //@line 2881
   __ZN13SocketAddressC2E10nsapi_addrt($12, $$byval_copy, 53); //@line 2882
   $ReallocAsyncCtx10 = _emscripten_realloc_async_context(80) | 0; //@line 2886
   $55 = __ZN9UDPSocket6sendtoERK13SocketAddressPKvj($8, $12, $19, $48 + 5 - $21 | 0) | 0; //@line 2887
   if (___async) {
    HEAP32[$ReallocAsyncCtx10 >> 2] = 92; //@line 2890
    $56 = $ReallocAsyncCtx10 + 4 | 0; //@line 2891
    HEAP32[$56 >> 2] = $29; //@line 2892
    $57 = $ReallocAsyncCtx10 + 8 | 0; //@line 2893
    HEAP32[$57 >> 2] = $2; //@line 2894
    $58 = $ReallocAsyncCtx10 + 12 | 0; //@line 2895
    HEAP32[$58 >> 2] = $12; //@line 2896
    $59 = $ReallocAsyncCtx10 + 16 | 0; //@line 2897
    HEAP32[$59 >> 2] = $4; //@line 2898
    $60 = $ReallocAsyncCtx10 + 20 | 0; //@line 2899
    HEAP32[$60 >> 2] = $19; //@line 2900
    $61 = $ReallocAsyncCtx10 + 24 | 0; //@line 2901
    HEAP32[$61 >> 2] = $22; //@line 2902
    $62 = $ReallocAsyncCtx10 + 28 | 0; //@line 2903
    HEAP32[$62 >> 2] = $23; //@line 2904
    $63 = $ReallocAsyncCtx10 + 32 | 0; //@line 2905
    HEAP32[$63 >> 2] = $24; //@line 2906
    $64 = $ReallocAsyncCtx10 + 36 | 0; //@line 2907
    HEAP32[$64 >> 2] = $25; //@line 2908
    $65 = $ReallocAsyncCtx10 + 40 | 0; //@line 2909
    HEAP32[$65 >> 2] = $26; //@line 2910
    $66 = $ReallocAsyncCtx10 + 44 | 0; //@line 2911
    HEAP32[$66 >> 2] = $27; //@line 2912
    $67 = $ReallocAsyncCtx10 + 48 | 0; //@line 2913
    HEAP32[$67 >> 2] = $28; //@line 2914
    $68 = $ReallocAsyncCtx10 + 52 | 0; //@line 2915
    HEAP32[$68 >> 2] = $6; //@line 2916
    $69 = $ReallocAsyncCtx10 + 56 | 0; //@line 2917
    HEAP32[$69 >> 2] = $8; //@line 2918
    $70 = $ReallocAsyncCtx10 + 60 | 0; //@line 2919
    HEAP32[$70 >> 2] = $10; //@line 2920
    $71 = $ReallocAsyncCtx10 + 64 | 0; //@line 2921
    HEAP8[$71 >> 0] = $$sink$i; //@line 2922
    $72 = $ReallocAsyncCtx10 + 68 | 0; //@line 2923
    HEAP32[$72 >> 2] = $12; //@line 2924
    $73 = $ReallocAsyncCtx10 + 72 | 0; //@line 2925
    HEAP32[$73 >> 2] = $21; //@line 2926
    $74 = $ReallocAsyncCtx10 + 76 | 0; //@line 2927
    HEAP32[$74 >> 2] = $14; //@line 2928
    sp = STACKTOP; //@line 2929
    STACKTOP = sp; //@line 2930
    return;
   }
   HEAP32[___async_retval >> 2] = $55; //@line 2933
   ___async_unwind = 0; //@line 2934
   HEAP32[$ReallocAsyncCtx10 >> 2] = 92; //@line 2935
   $56 = $ReallocAsyncCtx10 + 4 | 0; //@line 2936
   HEAP32[$56 >> 2] = $29; //@line 2937
   $57 = $ReallocAsyncCtx10 + 8 | 0; //@line 2938
   HEAP32[$57 >> 2] = $2; //@line 2939
   $58 = $ReallocAsyncCtx10 + 12 | 0; //@line 2940
   HEAP32[$58 >> 2] = $12; //@line 2941
   $59 = $ReallocAsyncCtx10 + 16 | 0; //@line 2942
   HEAP32[$59 >> 2] = $4; //@line 2943
   $60 = $ReallocAsyncCtx10 + 20 | 0; //@line 2944
   HEAP32[$60 >> 2] = $19; //@line 2945
   $61 = $ReallocAsyncCtx10 + 24 | 0; //@line 2946
   HEAP32[$61 >> 2] = $22; //@line 2947
   $62 = $ReallocAsyncCtx10 + 28 | 0; //@line 2948
   HEAP32[$62 >> 2] = $23; //@line 2949
   $63 = $ReallocAsyncCtx10 + 32 | 0; //@line 2950
   HEAP32[$63 >> 2] = $24; //@line 2951
   $64 = $ReallocAsyncCtx10 + 36 | 0; //@line 2952
   HEAP32[$64 >> 2] = $25; //@line 2953
   $65 = $ReallocAsyncCtx10 + 40 | 0; //@line 2954
   HEAP32[$65 >> 2] = $26; //@line 2955
   $66 = $ReallocAsyncCtx10 + 44 | 0; //@line 2956
   HEAP32[$66 >> 2] = $27; //@line 2957
   $67 = $ReallocAsyncCtx10 + 48 | 0; //@line 2958
   HEAP32[$67 >> 2] = $28; //@line 2959
   $68 = $ReallocAsyncCtx10 + 52 | 0; //@line 2960
   HEAP32[$68 >> 2] = $6; //@line 2961
   $69 = $ReallocAsyncCtx10 + 56 | 0; //@line 2962
   HEAP32[$69 >> 2] = $8; //@line 2963
   $70 = $ReallocAsyncCtx10 + 60 | 0; //@line 2964
   HEAP32[$70 >> 2] = $10; //@line 2965
   $71 = $ReallocAsyncCtx10 + 64 | 0; //@line 2966
   HEAP8[$71 >> 0] = $$sink$i; //@line 2967
   $72 = $ReallocAsyncCtx10 + 68 | 0; //@line 2968
   HEAP32[$72 >> 2] = $12; //@line 2969
   $73 = $ReallocAsyncCtx10 + 72 | 0; //@line 2970
   HEAP32[$73 >> 2] = $21; //@line 2971
   $74 = $ReallocAsyncCtx10 + 76 | 0; //@line 2972
   HEAP32[$74 >> 2] = $14; //@line 2973
   sp = STACKTOP; //@line 2974
   STACKTOP = sp; //@line 2975
   return;
  }
 } else {
  $$2 = $AsyncRetVal; //@line 2978
 }
 $ReallocAsyncCtx11 = _emscripten_realloc_async_context(12) | 0; //@line 2980
 __ZN9UDPSocketD2Ev($8); //@line 2981
 if (___async) {
  HEAP32[$ReallocAsyncCtx11 >> 2] = 95; //@line 2984
  $76 = $ReallocAsyncCtx11 + 4 | 0; //@line 2985
  HEAP32[$76 >> 2] = $6; //@line 2986
  $77 = $ReallocAsyncCtx11 + 8 | 0; //@line 2987
  HEAP32[$77 >> 2] = $$2; //@line 2988
  sp = STACKTOP; //@line 2989
  STACKTOP = sp; //@line 2990
  return;
 }
 ___async_unwind = 0; //@line 2992
 HEAP32[$ReallocAsyncCtx11 >> 2] = 95; //@line 2993
 $76 = $ReallocAsyncCtx11 + 4 | 0; //@line 2994
 HEAP32[$76 >> 2] = $6; //@line 2995
 $77 = $ReallocAsyncCtx11 + 8 | 0; //@line 2996
 HEAP32[$77 >> 2] = $$2; //@line 2997
 sp = STACKTOP; //@line 2998
 STACKTOP = sp; //@line 2999
 return;
}
function _try_realloc_chunk($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$1272 = 0, $$1275 = 0, $$2 = 0, $$3 = 0, $$pre$phiZ2D = 0, $101 = 0, $103 = 0, $106 = 0, $108 = 0, $11 = 0, $111 = 0, $114 = 0, $115 = 0, $116 = 0, $118 = 0, $12 = 0, $120 = 0, $121 = 0, $123 = 0, $124 = 0, $129 = 0, $130 = 0, $144 = 0, $147 = 0, $148 = 0, $154 = 0, $165 = 0, $168 = 0, $175 = 0, $2 = 0, $24 = 0, $26 = 0, $3 = 0, $37 = 0, $39 = 0, $4 = 0, $40 = 0, $49 = 0, $5 = 0, $51 = 0, $53 = 0, $54 = 0, $6 = 0, $60 = 0, $67 = 0, $73 = 0, $75 = 0, $76 = 0, $79 = 0, $8 = 0, $81 = 0, $83 = 0, $96 = 0, $storemerge = 0, $storemerge4 = 0;
 $2 = $0 + 4 | 0; //@line 8742
 $3 = HEAP32[$2 >> 2] | 0; //@line 8743
 $4 = $3 & -8; //@line 8744
 $5 = $0 + $4 | 0; //@line 8745
 $6 = HEAP32[1762] | 0; //@line 8746
 $8 = $3 & 3; //@line 8748
 if (!(($8 | 0) != 1 & $6 >>> 0 <= $0 >>> 0 & $5 >>> 0 > $0 >>> 0)) {
  _abort(); //@line 8754
 }
 $11 = $5 + 4 | 0; //@line 8757
 $12 = HEAP32[$11 >> 2] | 0; //@line 8758
 if (!($12 & 1)) {
  _abort(); //@line 8762
 }
 if (!$8) {
  if ($1 >>> 0 < 256) {
   $$2 = 0; //@line 8769
   return $$2 | 0; //@line 8770
  }
  if ($4 >>> 0 >= ($1 + 4 | 0) >>> 0) {
   if (($4 - $1 | 0) >>> 0 <= HEAP32[1878] << 1 >>> 0) {
    $$2 = $0; //@line 8780
    return $$2 | 0; //@line 8781
   }
  }
  $$2 = 0; //@line 8784
  return $$2 | 0; //@line 8785
 }
 if ($4 >>> 0 >= $1 >>> 0) {
  $24 = $4 - $1 | 0; //@line 8789
  if ($24 >>> 0 <= 15) {
   $$2 = $0; //@line 8792
   return $$2 | 0; //@line 8793
  }
  $26 = $0 + $1 | 0; //@line 8795
  HEAP32[$2 >> 2] = $3 & 1 | $1 | 2; //@line 8799
  HEAP32[$26 + 4 >> 2] = $24 | 3; //@line 8802
  HEAP32[$11 >> 2] = HEAP32[$11 >> 2] | 1; //@line 8805
  _dispose_chunk($26, $24); //@line 8806
  $$2 = $0; //@line 8807
  return $$2 | 0; //@line 8808
 }
 if ((HEAP32[1764] | 0) == ($5 | 0)) {
  $37 = (HEAP32[1761] | 0) + $4 | 0; //@line 8814
  $39 = $37 - $1 | 0; //@line 8816
  $40 = $0 + $1 | 0; //@line 8817
  if ($37 >>> 0 <= $1 >>> 0) {
   $$2 = 0; //@line 8819
   return $$2 | 0; //@line 8820
  }
  HEAP32[$2 >> 2] = $3 & 1 | $1 | 2; //@line 8827
  HEAP32[$40 + 4 >> 2] = $39 | 1; //@line 8828
  HEAP32[1764] = $40; //@line 8829
  HEAP32[1761] = $39; //@line 8830
  $$2 = $0; //@line 8831
  return $$2 | 0; //@line 8832
 }
 if ((HEAP32[1763] | 0) == ($5 | 0)) {
  $49 = (HEAP32[1760] | 0) + $4 | 0; //@line 8838
  if ($49 >>> 0 < $1 >>> 0) {
   $$2 = 0; //@line 8841
   return $$2 | 0; //@line 8842
  }
  $51 = $49 - $1 | 0; //@line 8844
  if ($51 >>> 0 > 15) {
   $53 = $0 + $1 | 0; //@line 8847
   $54 = $0 + $49 | 0; //@line 8848
   HEAP32[$2 >> 2] = $3 & 1 | $1 | 2; //@line 8852
   HEAP32[$53 + 4 >> 2] = $51 | 1; //@line 8855
   HEAP32[$54 >> 2] = $51; //@line 8856
   $60 = $54 + 4 | 0; //@line 8857
   HEAP32[$60 >> 2] = HEAP32[$60 >> 2] & -2; //@line 8860
   $storemerge = $53; //@line 8861
   $storemerge4 = $51; //@line 8861
  } else {
   HEAP32[$2 >> 2] = $3 & 1 | $49 | 2; //@line 8866
   $67 = $0 + $49 + 4 | 0; //@line 8868
   HEAP32[$67 >> 2] = HEAP32[$67 >> 2] | 1; //@line 8871
   $storemerge = 0; //@line 8872
   $storemerge4 = 0; //@line 8872
  }
  HEAP32[1760] = $storemerge4; //@line 8874
  HEAP32[1763] = $storemerge; //@line 8875
  $$2 = $0; //@line 8876
  return $$2 | 0; //@line 8877
 }
 if ($12 & 2 | 0) {
  $$2 = 0; //@line 8882
  return $$2 | 0; //@line 8883
 }
 $73 = ($12 & -8) + $4 | 0; //@line 8886
 if ($73 >>> 0 < $1 >>> 0) {
  $$2 = 0; //@line 8889
  return $$2 | 0; //@line 8890
 }
 $75 = $73 - $1 | 0; //@line 8892
 $76 = $12 >>> 3; //@line 8893
 L49 : do {
  if ($12 >>> 0 < 256) {
   $79 = HEAP32[$5 + 8 >> 2] | 0; //@line 8898
   $81 = HEAP32[$5 + 12 >> 2] | 0; //@line 8900
   $83 = 7072 + ($76 << 1 << 2) | 0; //@line 8902
   if (($79 | 0) != ($83 | 0)) {
    if ($6 >>> 0 > $79 >>> 0) {
     _abort(); //@line 8907
    }
    if ((HEAP32[$79 + 12 >> 2] | 0) != ($5 | 0)) {
     _abort(); //@line 8914
    }
   }
   if (($81 | 0) == ($79 | 0)) {
    HEAP32[1758] = HEAP32[1758] & ~(1 << $76); //@line 8924
    break;
   }
   if (($81 | 0) == ($83 | 0)) {
    $$pre$phiZ2D = $81 + 8 | 0; //@line 8930
   } else {
    if ($6 >>> 0 > $81 >>> 0) {
     _abort(); //@line 8934
    }
    $96 = $81 + 8 | 0; //@line 8937
    if ((HEAP32[$96 >> 2] | 0) == ($5 | 0)) {
     $$pre$phiZ2D = $96; //@line 8941
    } else {
     _abort(); //@line 8943
    }
   }
   HEAP32[$79 + 12 >> 2] = $81; //@line 8948
   HEAP32[$$pre$phiZ2D >> 2] = $79; //@line 8949
  } else {
   $101 = HEAP32[$5 + 24 >> 2] | 0; //@line 8952
   $103 = HEAP32[$5 + 12 >> 2] | 0; //@line 8954
   do {
    if (($103 | 0) == ($5 | 0)) {
     $114 = $5 + 16 | 0; //@line 8958
     $115 = $114 + 4 | 0; //@line 8959
     $116 = HEAP32[$115 >> 2] | 0; //@line 8960
     if (!$116) {
      $118 = HEAP32[$114 >> 2] | 0; //@line 8963
      if (!$118) {
       $$3 = 0; //@line 8966
       break;
      } else {
       $$1272 = $118; //@line 8969
       $$1275 = $114; //@line 8969
      }
     } else {
      $$1272 = $116; //@line 8972
      $$1275 = $115; //@line 8972
     }
     while (1) {
      $120 = $$1272 + 20 | 0; //@line 8975
      $121 = HEAP32[$120 >> 2] | 0; //@line 8976
      if ($121 | 0) {
       $$1272 = $121; //@line 8979
       $$1275 = $120; //@line 8979
       continue;
      }
      $123 = $$1272 + 16 | 0; //@line 8982
      $124 = HEAP32[$123 >> 2] | 0; //@line 8983
      if (!$124) {
       break;
      } else {
       $$1272 = $124; //@line 8988
       $$1275 = $123; //@line 8988
      }
     }
     if ($6 >>> 0 > $$1275 >>> 0) {
      _abort(); //@line 8993
     } else {
      HEAP32[$$1275 >> 2] = 0; //@line 8996
      $$3 = $$1272; //@line 8997
      break;
     }
    } else {
     $106 = HEAP32[$5 + 8 >> 2] | 0; //@line 9002
     if ($6 >>> 0 > $106 >>> 0) {
      _abort(); //@line 9005
     }
     $108 = $106 + 12 | 0; //@line 9008
     if ((HEAP32[$108 >> 2] | 0) != ($5 | 0)) {
      _abort(); //@line 9012
     }
     $111 = $103 + 8 | 0; //@line 9015
     if ((HEAP32[$111 >> 2] | 0) == ($5 | 0)) {
      HEAP32[$108 >> 2] = $103; //@line 9019
      HEAP32[$111 >> 2] = $106; //@line 9020
      $$3 = $103; //@line 9021
      break;
     } else {
      _abort(); //@line 9024
     }
    }
   } while (0);
   if ($101 | 0) {
    $129 = HEAP32[$5 + 28 >> 2] | 0; //@line 9032
    $130 = 7336 + ($129 << 2) | 0; //@line 9033
    do {
     if ((HEAP32[$130 >> 2] | 0) == ($5 | 0)) {
      HEAP32[$130 >> 2] = $$3; //@line 9038
      if (!$$3) {
       HEAP32[1759] = HEAP32[1759] & ~(1 << $129); //@line 9045
       break L49;
      }
     } else {
      if ((HEAP32[1762] | 0) >>> 0 > $101 >>> 0) {
       _abort(); //@line 9052
      } else {
       HEAP32[$101 + 16 + (((HEAP32[$101 + 16 >> 2] | 0) != ($5 | 0) & 1) << 2) >> 2] = $$3; //@line 9060
       if (!$$3) {
        break L49;
       } else {
        break;
       }
      }
     }
    } while (0);
    $144 = HEAP32[1762] | 0; //@line 9070
    if ($144 >>> 0 > $$3 >>> 0) {
     _abort(); //@line 9073
    }
    HEAP32[$$3 + 24 >> 2] = $101; //@line 9077
    $147 = $5 + 16 | 0; //@line 9078
    $148 = HEAP32[$147 >> 2] | 0; //@line 9079
    do {
     if ($148 | 0) {
      if ($144 >>> 0 > $148 >>> 0) {
       _abort(); //@line 9085
      } else {
       HEAP32[$$3 + 16 >> 2] = $148; //@line 9089
       HEAP32[$148 + 24 >> 2] = $$3; //@line 9091
       break;
      }
     }
    } while (0);
    $154 = HEAP32[$147 + 4 >> 2] | 0; //@line 9097
    if ($154 | 0) {
     if ((HEAP32[1762] | 0) >>> 0 > $154 >>> 0) {
      _abort(); //@line 9103
     } else {
      HEAP32[$$3 + 20 >> 2] = $154; //@line 9107
      HEAP32[$154 + 24 >> 2] = $$3; //@line 9109
      break;
     }
    }
   }
  }
 } while (0);
 if ($75 >>> 0 < 16) {
  HEAP32[$2 >> 2] = $73 | $3 & 1 | 2; //@line 9121
  $165 = $0 + $73 + 4 | 0; //@line 9123
  HEAP32[$165 >> 2] = HEAP32[$165 >> 2] | 1; //@line 9126
  $$2 = $0; //@line 9127
  return $$2 | 0; //@line 9128
 } else {
  $168 = $0 + $1 | 0; //@line 9130
  HEAP32[$2 >> 2] = $3 & 1 | $1 | 2; //@line 9134
  HEAP32[$168 + 4 >> 2] = $75 | 3; //@line 9137
  $175 = $0 + $73 + 4 | 0; //@line 9139
  HEAP32[$175 >> 2] = HEAP32[$175 >> 2] | 1; //@line 9142
  _dispose_chunk($168, $75); //@line 9143
  $$2 = $0; //@line 9144
  return $$2 | 0; //@line 9145
 }
 return 0; //@line 9147
}
function ___floatscan($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$0 = 0, $$0105$ph = 0, $$0106$ph = 0, $$0107$lcssa = 0, $$0107127 = 0, $$0113 = 0, $$0114 = 0.0, $$1$lcssa = 0, $$1108 = 0, $$1128 = 0, $$2 = 0, $$2109125 = 0, $$3110 = 0, $$3126 = 0, $$4 = 0, $$4111 = 0, $$5 = 0, $$6 = 0, $$in = 0, $102 = 0, $118 = 0, $12 = 0, $126 = 0, $18 = 0, $19 = 0, $3 = 0, $32 = 0, $39 = 0, $4 = 0, $42 = 0, $45 = 0, $5 = 0, $63 = 0, $70 = 0, $72 = 0, $80 = 0, $85 = 0, $93 = 0, label = 0;
 switch ($1 | 0) {
 case 0:
  {
   $$0105$ph = -149; //@line 752
   $$0106$ph = 24; //@line 752
   label = 4; //@line 753
   break;
  }
 case 1:
  {
   $$0105$ph = -1074; //@line 757
   $$0106$ph = 53; //@line 757
   label = 4; //@line 758
   break;
  }
 case 2:
  {
   $$0105$ph = -1074; //@line 762
   $$0106$ph = 53; //@line 762
   label = 4; //@line 763
   break;
  }
 default:
  {
   $$0114 = 0.0; //@line 767
  }
 }
 L4 : do {
  if ((label | 0) == 4) {
   $3 = $0 + 4 | 0; //@line 772
   $4 = $0 + 100 | 0; //@line 773
   do {
    $5 = HEAP32[$3 >> 2] | 0; //@line 775
    if ($5 >>> 0 < (HEAP32[$4 >> 2] | 0) >>> 0) {
     HEAP32[$3 >> 2] = $5 + 1; //@line 780
     $12 = HEAPU8[$5 >> 0] | 0; //@line 783
    } else {
     $12 = ___shgetc($0) | 0; //@line 786
    }
   } while ((_isspace($12) | 0) != 0);
   L13 : do {
    switch ($12 | 0) {
    case 43:
    case 45:
     {
      $18 = 1 - ((($12 | 0) == 45 & 1) << 1) | 0; //@line 800
      $19 = HEAP32[$3 >> 2] | 0; //@line 801
      if ($19 >>> 0 < (HEAP32[$4 >> 2] | 0) >>> 0) {
       HEAP32[$3 >> 2] = $19 + 1; //@line 806
       $$0 = HEAPU8[$19 >> 0] | 0; //@line 809
       $$0113 = $18; //@line 809
       break L13;
      } else {
       $$0 = ___shgetc($0) | 0; //@line 813
       $$0113 = $18; //@line 813
       break L13;
      }
      break;
     }
    default:
     {
      $$0 = $12; //@line 819
      $$0113 = 1; //@line 819
     }
    }
   } while (0);
   $$0107127 = 0; //@line 823
   $$1128 = $$0; //@line 823
   while (1) {
    if (($$1128 | 32 | 0) != (HEAP8[3750 + $$0107127 >> 0] | 0)) {
     $$0107$lcssa = $$0107127; //@line 831
     $$1$lcssa = $$1128; //@line 831
     break;
    }
    do {
     if ($$0107127 >>> 0 < 7) {
      $32 = HEAP32[$3 >> 2] | 0; //@line 837
      if ($32 >>> 0 < (HEAP32[$4 >> 2] | 0) >>> 0) {
       HEAP32[$3 >> 2] = $32 + 1; //@line 842
       $$2 = HEAPU8[$32 >> 0] | 0; //@line 845
       break;
      } else {
       $$2 = ___shgetc($0) | 0; //@line 849
       break;
      }
     } else {
      $$2 = $$1128; //@line 853
     }
    } while (0);
    $39 = $$0107127 + 1 | 0; //@line 856
    if ($39 >>> 0 < 8) {
     $$0107127 = $39; //@line 859
     $$1128 = $$2; //@line 859
    } else {
     $$0107$lcssa = $39; //@line 861
     $$1$lcssa = $$2; //@line 861
     break;
    }
   }
   L29 : do {
    switch ($$0107$lcssa | 0) {
    case 8:
     {
      break;
     }
    case 3:
     {
      label = 23; //@line 871
      break;
     }
    default:
     {
      $42 = ($2 | 0) != 0; //@line 876
      if ($42 & $$0107$lcssa >>> 0 > 3) {
       if (($$0107$lcssa | 0) == 8) {
        break L29;
       } else {
        label = 23; //@line 883
        break L29;
       }
      }
      L34 : do {
       if (!$$0107$lcssa) {
        $$2109125 = 0; //@line 890
        $$3126 = $$1$lcssa; //@line 890
        while (1) {
         if (($$3126 | 32 | 0) != (HEAP8[4533 + $$2109125 >> 0] | 0)) {
          $$3110 = $$2109125; //@line 898
          $$5 = $$3126; //@line 898
          break L34;
         }
         do {
          if ($$2109125 >>> 0 < 2) {
           $63 = HEAP32[$3 >> 2] | 0; //@line 904
           if ($63 >>> 0 < (HEAP32[$4 >> 2] | 0) >>> 0) {
            HEAP32[$3 >> 2] = $63 + 1; //@line 909
            $$4 = HEAPU8[$63 >> 0] | 0; //@line 912
            break;
           } else {
            $$4 = ___shgetc($0) | 0; //@line 916
            break;
           }
          } else {
           $$4 = $$3126; //@line 920
          }
         } while (0);
         $70 = $$2109125 + 1 | 0; //@line 923
         if ($70 >>> 0 < 3) {
          $$2109125 = $70; //@line 926
          $$3126 = $$4; //@line 926
         } else {
          $$3110 = $70; //@line 928
          $$5 = $$4; //@line 928
          break;
         }
        }
       } else {
        $$3110 = $$0107$lcssa; //@line 933
        $$5 = $$1$lcssa; //@line 933
       }
      } while (0);
      switch ($$3110 | 0) {
      case 3:
       {
        $72 = HEAP32[$3 >> 2] | 0; //@line 938
        if ($72 >>> 0 < (HEAP32[$4 >> 2] | 0) >>> 0) {
         HEAP32[$3 >> 2] = $72 + 1; //@line 943
         $80 = HEAPU8[$72 >> 0] | 0; //@line 946
        } else {
         $80 = ___shgetc($0) | 0; //@line 949
        }
        if (($80 | 0) == 40) {
         $$4111 = 1; //@line 953
        } else {
         if (!(HEAP32[$4 >> 2] | 0)) {
          $$0114 = nan; //@line 958
          break L4;
         }
         HEAP32[$3 >> 2] = (HEAP32[$3 >> 2] | 0) + -1; //@line 963
         $$0114 = nan; //@line 964
         break L4;
        }
        while (1) {
         $85 = HEAP32[$3 >> 2] | 0; //@line 968
         if ($85 >>> 0 < (HEAP32[$4 >> 2] | 0) >>> 0) {
          HEAP32[$3 >> 2] = $85 + 1; //@line 973
          $93 = HEAPU8[$85 >> 0] | 0; //@line 976
         } else {
          $93 = ___shgetc($0) | 0; //@line 979
         }
         if (!(($93 + -48 | 0) >>> 0 < 10 | ($93 + -65 | 0) >>> 0 < 26)) {
          if (!(($93 | 0) == 95 | ($93 + -97 | 0) >>> 0 < 26)) {
           break;
          }
         }
         $$4111 = $$4111 + 1 | 0; //@line 996
        }
        if (($93 | 0) == 41) {
         $$0114 = nan; //@line 1000
         break L4;
        }
        $102 = (HEAP32[$4 >> 2] | 0) == 0; //@line 1004
        if (!$102) {
         HEAP32[$3 >> 2] = (HEAP32[$3 >> 2] | 0) + -1; //@line 1008
        }
        if (!$42) {
         HEAP32[(___errno_location() | 0) >> 2] = 22; //@line 1012
         ___shlim($0, 0); //@line 1013
         $$0114 = 0.0; //@line 1014
         break L4;
        }
        if (!$$4111) {
         $$0114 = nan; //@line 1019
         break L4;
        } else {
         $$in = $$4111; //@line 1022
        }
        while (1) {
         $$in = $$in + -1 | 0; //@line 1025
         if (!$102) {
          HEAP32[$3 >> 2] = (HEAP32[$3 >> 2] | 0) + -1; //@line 1029
         }
         if (!$$in) {
          $$0114 = nan; //@line 1033
          break L4;
         }
        }
        break;
       }
      case 0:
       {
        if (($$5 | 0) == 48) {
         $118 = HEAP32[$3 >> 2] | 0; //@line 1044
         if ($118 >>> 0 < (HEAP32[$4 >> 2] | 0) >>> 0) {
          HEAP32[$3 >> 2] = $118 + 1; //@line 1049
          $126 = HEAPU8[$118 >> 0] | 0; //@line 1052
         } else {
          $126 = ___shgetc($0) | 0; //@line 1055
         }
         if (($126 | 32 | 0) == 120) {
          $$0114 = +_hexfloat($0, $$0106$ph, $$0105$ph, $$0113, $2); //@line 1061
          break L4;
         }
         if (!(HEAP32[$4 >> 2] | 0)) {
          $$6 = 48; //@line 1067
         } else {
          HEAP32[$3 >> 2] = (HEAP32[$3 >> 2] | 0) + -1; //@line 1071
          $$6 = 48; //@line 1072
         }
        } else {
         $$6 = $$5; //@line 1075
        }
        $$0114 = +_decfloat($0, $$6, $$0106$ph, $$0105$ph, $$0113, $2); //@line 1078
        break L4;
        break;
       }
      default:
       {
        if (HEAP32[$4 >> 2] | 0) {
         HEAP32[$3 >> 2] = (HEAP32[$3 >> 2] | 0) + -1; //@line 1088
        }
        HEAP32[(___errno_location() | 0) >> 2] = 22; //@line 1091
        ___shlim($0, 0); //@line 1092
        $$0114 = 0.0; //@line 1093
        break L4;
       }
      }
     }
    }
   } while (0);
   if ((label | 0) == 23) {
    $45 = (HEAP32[$4 >> 2] | 0) == 0; //@line 1102
    if (!$45) {
     HEAP32[$3 >> 2] = (HEAP32[$3 >> 2] | 0) + -1; //@line 1106
    }
    if (($2 | 0) != 0 & $$0107$lcssa >>> 0 > 3) {
     $$1108 = $$0107$lcssa; //@line 1112
     do {
      if (!$45) {
       HEAP32[$3 >> 2] = (HEAP32[$3 >> 2] | 0) + -1; //@line 1117
      }
      $$1108 = $$1108 + -1 | 0; //@line 1119
     } while ($$1108 >>> 0 > 3);
    }
   }
   $$0114 = +($$0113 | 0) * inf; //@line 1132
  }
 } while (0);
 return +$$0114;
}
function __ZL24nsapi_dns_query_multipleP12NetworkStackPKcP10nsapi_addrj13nsapi_version__async_cb($0) {
 $0 = $0 | 0;
 var $$0 = 0, $$089$i = 0, $$090117$i = 0, $$093119$i = 0, $$094116$i = 0, $$095115$i = 0, $$1$i = 0, $$196$i = 0, $$355 = 0, $$lcssa$i = 0, $10 = 0, $109 = 0, $114 = 0, $115 = 0, $117 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $190 = 0, $191 = 0, $192 = 0, $193 = 0, $196 = 0, $2 = 0, $20 = 0, $22 = 0, $24 = 0, $26 = 0, $28 = 0, $4 = 0, $45 = 0, $51 = 0, $58 = 0, $59 = 0, $6 = 0, $64 = 0, $66 = 0, $67 = 0, $70 = 0, $74 = 0, $75 = 0, $79 = 0, $8 = 0, $82 = 0, $84 = 0, $85 = 0, $90 = 0, $98 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx12 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 13666
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 13668
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 13670
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 13672
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 13674
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 13676
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 13678
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 13680
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 13682
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 13684
 $20 = HEAP32[$0 + 40 >> 2] | 0; //@line 13686
 $22 = HEAP32[$0 + 44 >> 2] | 0; //@line 13688
 $24 = HEAP32[$0 + 48 >> 2] | 0; //@line 13690
 $26 = HEAP32[$0 + 52 >> 2] | 0; //@line 13692
 $28 = HEAP32[$0 + 56 >> 2] | 0; //@line 13694
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 13696
 if (($AsyncRetVal | 0) == -3001) {
  $$355 = -3009; //@line 13699
 } else {
  if (($AsyncRetVal | 0) < 0) {
   $$355 = $AsyncRetVal; //@line 13703
  } else {
   $45 = (HEAPU8[$16 >> 0] | 0) << 8 | (HEAPU8[$18 >> 0] | 0); //@line 13719
   $51 = (HEAPU8[$20 >> 0] | 0) << 8 | (HEAPU8[$22 >> 0] | 0); //@line 13725
   if (((HEAP8[$12 >> 0] & -8) << 24 >> 24 == -128 ? ((HEAPU8[$8 >> 0] | 0) << 8 | (HEAPU8[$10 >> 0] | 0) | 0) == 1 : 0) & (HEAP8[$14 >> 0] & 15) == 0) {
    if (!$45) {
     $196 = $2; //@line 13735
    } else {
     $$093119$i = 0; //@line 13737
     $59 = $2; //@line 13737
     while (1) {
      $58 = HEAP8[$59 >> 0] | 0; //@line 13739
      if (!($58 << 24 >> 24)) {
       $$lcssa$i = $59; //@line 13742
      } else {
       $64 = $59; //@line 13744
       $66 = $58; //@line 13744
       while (1) {
        $67 = $64 + 1 + ($66 & 255) | 0; //@line 13748
        $66 = HEAP8[$67 >> 0] | 0; //@line 13749
        if (!($66 << 24 >> 24)) {
         $$lcssa$i = $67; //@line 13752
         break;
        } else {
         $64 = $67; //@line 13755
        }
       }
      }
      $70 = $$lcssa$i + 5 | 0; //@line 13759
      $$093119$i = $$093119$i + 1 | 0; //@line 13760
      if (($$093119$i | 0) >= ($45 | 0)) {
       $196 = $70; //@line 13765
       break;
      } else {
       $59 = $70; //@line 13763
      }
     }
    }
    if (($4 | 0) != 0 & ($51 | 0) != 0) {
     $$090117$i = $6; //@line 13774
     $$094116$i = 0; //@line 13774
     $$095115$i = 0; //@line 13774
     $74 = $196; //@line 13774
     while (1) {
      $75 = HEAP8[$74 >> 0] | 0; //@line 13777
      do {
       if (!($75 << 24 >> 24)) {
        $90 = $74 + 1 | 0; //@line 13781
       } else {
        $79 = $75 & 255; //@line 13784
        $82 = $74; //@line 13784
        while (1) {
         if ($79 & 192 | 0) {
          label = 12; //@line 13789
          break;
         }
         $84 = $82 + 1 + $79 | 0; //@line 13793
         $85 = HEAP8[$84 >> 0] | 0; //@line 13794
         if (!($85 << 24 >> 24)) {
          label = 14; //@line 13798
          break;
         } else {
          $79 = $85 & 255; //@line 13801
          $82 = $84; //@line 13801
         }
        }
        if ((label | 0) == 12) {
         label = 0; //@line 13805
         $90 = $82 + 2 | 0; //@line 13807
         break;
        } else if ((label | 0) == 14) {
         label = 0; //@line 13811
         $90 = $84 + 1 | 0; //@line 13813
         break;
        }
       }
      } while (0);
      $98 = ((HEAPU8[$90 >> 0] | 0) << 8 | (HEAPU8[$90 + 1 >> 0] | 0)) & 65535; //@line 13826
      $109 = $90 + 10 | 0; //@line 13837
      $114 = (HEAPU8[$90 + 8 >> 0] | 0) << 8 | (HEAPU8[$90 + 9 >> 0] | 0); //@line 13842
      $115 = $114 & 65535; //@line 13843
      $117 = ((HEAPU8[$90 + 2 >> 0] | 0) << 8 | (HEAPU8[$90 + 3 >> 0] | 0) | 0) == 1; //@line 13845
      do {
       if ($98 << 16 >> 16 == 1 & $117 & $115 << 16 >> 16 == 4) {
        HEAP32[$$090117$i >> 2] = 1; //@line 13851
        HEAP8[$$090117$i + 4 >> 0] = HEAP8[$109 >> 0] | 0; //@line 13855
        HEAP8[$$090117$i + 5 >> 0] = HEAP8[$90 + 11 >> 0] | 0; //@line 13859
        HEAP8[$$090117$i + 6 >> 0] = HEAP8[$90 + 12 >> 0] | 0; //@line 13863
        HEAP8[$$090117$i + 7 >> 0] = HEAP8[$90 + 13 >> 0] | 0; //@line 13867
        $$0 = $90 + 14 | 0; //@line 13870
        $$1$i = $$090117$i + 20 | 0; //@line 13870
        $$196$i = $$095115$i + 1 | 0; //@line 13870
       } else {
        if ($98 << 16 >> 16 == 28 & $117 & $115 << 16 >> 16 == 16) {
         HEAP32[$$090117$i >> 2] = 2; //@line 13877
         HEAP8[$$090117$i + 4 >> 0] = HEAP8[$109 >> 0] | 0; //@line 13881
         HEAP8[$$090117$i + 5 >> 0] = HEAP8[$90 + 11 >> 0] | 0; //@line 13885
         HEAP8[$$090117$i + 6 >> 0] = HEAP8[$90 + 12 >> 0] | 0; //@line 13889
         HEAP8[$$090117$i + 7 >> 0] = HEAP8[$90 + 13 >> 0] | 0; //@line 13893
         HEAP8[$$090117$i + 8 >> 0] = HEAP8[$90 + 14 >> 0] | 0; //@line 13897
         HEAP8[$$090117$i + 9 >> 0] = HEAP8[$90 + 15 >> 0] | 0; //@line 13901
         HEAP8[$$090117$i + 10 >> 0] = HEAP8[$90 + 16 >> 0] | 0; //@line 13905
         HEAP8[$$090117$i + 11 >> 0] = HEAP8[$90 + 17 >> 0] | 0; //@line 13909
         HEAP8[$$090117$i + 12 >> 0] = HEAP8[$90 + 18 >> 0] | 0; //@line 13913
         HEAP8[$$090117$i + 13 >> 0] = HEAP8[$90 + 19 >> 0] | 0; //@line 13917
         HEAP8[$$090117$i + 14 >> 0] = HEAP8[$90 + 20 >> 0] | 0; //@line 13921
         HEAP8[$$090117$i + 15 >> 0] = HEAP8[$90 + 21 >> 0] | 0; //@line 13925
         HEAP8[$$090117$i + 16 >> 0] = HEAP8[$90 + 22 >> 0] | 0; //@line 13929
         HEAP8[$$090117$i + 17 >> 0] = HEAP8[$90 + 23 >> 0] | 0; //@line 13933
         HEAP8[$$090117$i + 18 >> 0] = HEAP8[$90 + 24 >> 0] | 0; //@line 13937
         HEAP8[$$090117$i + 19 >> 0] = HEAP8[$90 + 25 >> 0] | 0; //@line 13941
         $$0 = $90 + 26 | 0; //@line 13944
         $$1$i = $$090117$i + 20 | 0; //@line 13944
         $$196$i = $$095115$i + 1 | 0; //@line 13944
         break;
        } else {
         $$0 = $109 + $114 | 0; //@line 13948
         $$1$i = $$090117$i; //@line 13948
         $$196$i = $$095115$i; //@line 13948
         break;
        }
       }
      } while (0);
      $$094116$i = $$094116$i + 1 | 0; //@line 13953
      if (!(($$094116$i | 0) < ($51 | 0) & $$196$i >>> 0 < $4 >>> 0)) {
       $$089$i = $$196$i; //@line 13960
       break;
      } else {
       $$090117$i = $$1$i; //@line 13958
       $$095115$i = $$196$i; //@line 13958
       $74 = $$0; //@line 13958
      }
     }
    } else {
     $$089$i = 0; //@line 13965
    }
   } else {
    $$089$i = 0; //@line 13968
   }
   $$355 = ($$089$i | 0) > 0 ? $$089$i : -3009; //@line 13972
  }
 }
 _free($8); //@line 13975
 $ReallocAsyncCtx12 = _emscripten_realloc_async_context(16) | 0; //@line 13976
 $190 = __ZN6Socket5closeEv($28) | 0; //@line 13977
 if (___async) {
  HEAP32[$ReallocAsyncCtx12 >> 2] = 94; //@line 13980
  $191 = $ReallocAsyncCtx12 + 4 | 0; //@line 13981
  HEAP32[$191 >> 2] = $$355; //@line 13982
  $192 = $ReallocAsyncCtx12 + 8 | 0; //@line 13983
  HEAP32[$192 >> 2] = $26; //@line 13984
  $193 = $ReallocAsyncCtx12 + 12 | 0; //@line 13985
  HEAP32[$193 >> 2] = $24; //@line 13986
  sp = STACKTOP; //@line 13987
  return;
 }
 HEAP32[___async_retval >> 2] = $190; //@line 13991
 ___async_unwind = 0; //@line 13992
 HEAP32[$ReallocAsyncCtx12 >> 2] = 94; //@line 13993
 $191 = $ReallocAsyncCtx12 + 4 | 0; //@line 13994
 HEAP32[$191 >> 2] = $$355; //@line 13995
 $192 = $ReallocAsyncCtx12 + 8 | 0; //@line 13996
 HEAP32[$192 >> 2] = $26; //@line 13997
 $193 = $ReallocAsyncCtx12 + 12 | 0; //@line 13998
 HEAP32[$193 >> 2] = $24; //@line 13999
 sp = STACKTOP; //@line 14000
 return;
}
function _fmod($0, $1) {
 $0 = +$0;
 $1 = +$1;
 var $$070 = 0.0, $$071$lcssa = 0, $$07194 = 0, $$073$lcssa = 0, $$073100 = 0, $$172$ph = 0, $$174 = 0, $$275$lcssa = 0, $$27586 = 0, $$376$lcssa = 0, $$37683 = 0, $$lcssa = 0, $101 = 0, $104 = 0, $105 = 0, $106 = 0, $107 = 0, $108 = 0, $11 = 0, $110 = 0, $111 = 0, $116 = 0, $118 = 0, $12 = 0, $120 = 0, $123 = 0, $125 = 0, $13 = 0, $130 = 0, $131 = 0, $132 = 0, $133 = 0, $134 = 0, $14 = 0, $141 = 0, $142 = 0, $143 = 0, $144 = 0, $145 = 0, $150 = 0, $153 = 0, $154 = 0, $156 = 0, $157 = 0, $158 = 0, $159 = 0, $160 = 0, $18 = 0, $2 = 0, $20 = 0, $27 = 0.0, $29 = 0, $3 = 0, $30 = 0, $4 = 0, $41 = 0, $42 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $59 = 0, $6 = 0, $64 = 0, $65 = 0, $71 = 0, $72 = 0, $73 = 0, $8 = 0, $82 = 0, $87 = 0, $88 = 0, $89 = 0, $9 = 0, $90 = 0, $91 = 0, $92 = 0, $97 = 0, $99 = 0, label = 0;
 HEAPF64[tempDoublePtr >> 3] = $0; //@line 2690
 $2 = HEAP32[tempDoublePtr >> 2] | 0; //@line 2690
 $3 = HEAP32[tempDoublePtr + 4 >> 2] | 0; //@line 2691
 HEAPF64[tempDoublePtr >> 3] = $1; //@line 2692
 $4 = HEAP32[tempDoublePtr >> 2] | 0; //@line 2692
 $5 = HEAP32[tempDoublePtr + 4 >> 2] | 0; //@line 2693
 $6 = _bitshift64Lshr($2 | 0, $3 | 0, 52) | 0; //@line 2694
 $8 = $6 & 2047; //@line 2696
 $9 = _bitshift64Lshr($4 | 0, $5 | 0, 52) | 0; //@line 2697
 $11 = $9 & 2047; //@line 2699
 $12 = $3 & -2147483648; //@line 2700
 $13 = _bitshift64Shl($4 | 0, $5 | 0, 1) | 0; //@line 2701
 $14 = tempRet0; //@line 2702
 L1 : do {
  if (($13 | 0) == 0 & ($14 | 0) == 0) {
   label = 3; //@line 2708
  } else {
   $18 = ___DOUBLE_BITS_563($1) | 0; //@line 2710
   $20 = tempRet0 & 2147483647; //@line 2712
   if (($8 | 0) == 2047 | ($20 >>> 0 > 2146435072 | ($20 | 0) == 2146435072 & $18 >>> 0 > 0)) {
    label = 3; //@line 2721
   } else {
    $29 = _bitshift64Shl($2 | 0, $3 | 0, 1) | 0; //@line 2723
    $30 = tempRet0; //@line 2724
    if (!($30 >>> 0 > $14 >>> 0 | ($30 | 0) == ($14 | 0) & $29 >>> 0 > $13 >>> 0)) {
     return +(($29 | 0) == ($13 | 0) & ($30 | 0) == ($14 | 0) ? $0 * 0.0 : $0);
    }
    if (!$8) {
     $41 = _bitshift64Shl($2 | 0, $3 | 0, 12) | 0; //@line 2740
     $42 = tempRet0; //@line 2741
     if (($42 | 0) > -1 | ($42 | 0) == -1 & $41 >>> 0 > 4294967295) {
      $$073100 = 0; //@line 2748
      $49 = $41; //@line 2748
      $50 = $42; //@line 2748
      while (1) {
       $48 = $$073100 + -1 | 0; //@line 2750
       $49 = _bitshift64Shl($49 | 0, $50 | 0, 1) | 0; //@line 2751
       $50 = tempRet0; //@line 2752
       if (!(($50 | 0) > -1 | ($50 | 0) == -1 & $49 >>> 0 > 4294967295)) {
        $$073$lcssa = $48; //@line 2761
        break;
       } else {
        $$073100 = $48; //@line 2759
       }
      }
     } else {
      $$073$lcssa = 0; //@line 2766
     }
     $59 = _bitshift64Shl($2 | 0, $3 | 0, 1 - $$073$lcssa | 0) | 0; //@line 2769
     $$174 = $$073$lcssa; //@line 2771
     $87 = $59; //@line 2771
     $88 = tempRet0; //@line 2771
    } else {
     $$174 = $8; //@line 2775
     $87 = $2; //@line 2775
     $88 = $3 & 1048575 | 1048576; //@line 2775
    }
    if (!$11) {
     $64 = _bitshift64Shl($4 | 0, $5 | 0, 12) | 0; //@line 2779
     $65 = tempRet0; //@line 2780
     if (($65 | 0) > -1 | ($65 | 0) == -1 & $64 >>> 0 > 4294967295) {
      $$07194 = 0; //@line 2787
      $72 = $64; //@line 2787
      $73 = $65; //@line 2787
      while (1) {
       $71 = $$07194 + -1 | 0; //@line 2789
       $72 = _bitshift64Shl($72 | 0, $73 | 0, 1) | 0; //@line 2790
       $73 = tempRet0; //@line 2791
       if (!(($73 | 0) > -1 | ($73 | 0) == -1 & $72 >>> 0 > 4294967295)) {
        $$071$lcssa = $71; //@line 2800
        break;
       } else {
        $$07194 = $71; //@line 2798
       }
      }
     } else {
      $$071$lcssa = 0; //@line 2805
     }
     $82 = _bitshift64Shl($4 | 0, $5 | 0, 1 - $$071$lcssa | 0) | 0; //@line 2808
     $$172$ph = $$071$lcssa; //@line 2810
     $89 = $82; //@line 2810
     $90 = tempRet0; //@line 2810
    } else {
     $$172$ph = $11; //@line 2814
     $89 = $4; //@line 2814
     $90 = $5 & 1048575 | 1048576; //@line 2814
    }
    $91 = _i64Subtract($87 | 0, $88 | 0, $89 | 0, $90 | 0) | 0; //@line 2817
    $92 = tempRet0; //@line 2818
    $97 = ($92 | 0) > -1 | ($92 | 0) == -1 & $91 >>> 0 > 4294967295; //@line 2823
    L23 : do {
     if (($$174 | 0) > ($$172$ph | 0)) {
      $$27586 = $$174; //@line 2826
      $101 = $92; //@line 2826
      $156 = $97; //@line 2826
      $157 = $87; //@line 2826
      $158 = $88; //@line 2826
      $99 = $91; //@line 2826
      while (1) {
       if ($156) {
        if (($99 | 0) == 0 & ($101 | 0) == 0) {
         break;
        } else {
         $104 = $99; //@line 2835
         $105 = $101; //@line 2835
        }
       } else {
        $104 = $157; //@line 2838
        $105 = $158; //@line 2838
       }
       $106 = _bitshift64Shl($104 | 0, $105 | 0, 1) | 0; //@line 2840
       $107 = tempRet0; //@line 2841
       $108 = $$27586 + -1 | 0; //@line 2842
       $110 = _i64Subtract($106 | 0, $107 | 0, $89 | 0, $90 | 0) | 0; //@line 2844
       $111 = tempRet0; //@line 2845
       $116 = ($111 | 0) > -1 | ($111 | 0) == -1 & $110 >>> 0 > 4294967295; //@line 2850
       if (($108 | 0) > ($$172$ph | 0)) {
        $$27586 = $108; //@line 2852
        $101 = $111; //@line 2852
        $156 = $116; //@line 2852
        $157 = $106; //@line 2852
        $158 = $107; //@line 2852
        $99 = $110; //@line 2852
       } else {
        $$275$lcssa = $108; //@line 2854
        $$lcssa = $116; //@line 2854
        $118 = $110; //@line 2854
        $120 = $111; //@line 2854
        $159 = $106; //@line 2854
        $160 = $107; //@line 2854
        break L23;
       }
      }
      $$070 = $0 * 0.0; //@line 2859
      break L1;
     } else {
      $$275$lcssa = $$174; //@line 2862
      $$lcssa = $97; //@line 2862
      $118 = $91; //@line 2862
      $120 = $92; //@line 2862
      $159 = $87; //@line 2862
      $160 = $88; //@line 2862
     }
    } while (0);
    if ($$lcssa) {
     if (($118 | 0) == 0 & ($120 | 0) == 0) {
      $$070 = $0 * 0.0; //@line 2871
      break;
     } else {
      $123 = $120; //@line 2874
      $125 = $118; //@line 2874
     }
    } else {
     $123 = $160; //@line 2877
     $125 = $159; //@line 2877
    }
    if ($123 >>> 0 < 1048576 | ($123 | 0) == 1048576 & $125 >>> 0 < 0) {
     $$37683 = $$275$lcssa; //@line 2885
     $130 = $125; //@line 2885
     $131 = $123; //@line 2885
     while (1) {
      $132 = _bitshift64Shl($130 | 0, $131 | 0, 1) | 0; //@line 2887
      $133 = tempRet0; //@line 2888
      $134 = $$37683 + -1 | 0; //@line 2889
      if ($133 >>> 0 < 1048576 | ($133 | 0) == 1048576 & $132 >>> 0 < 0) {
       $$37683 = $134; //@line 2896
       $130 = $132; //@line 2896
       $131 = $133; //@line 2896
      } else {
       $$376$lcssa = $134; //@line 2898
       $141 = $132; //@line 2898
       $142 = $133; //@line 2898
       break;
      }
     }
    } else {
     $$376$lcssa = $$275$lcssa; //@line 2903
     $141 = $125; //@line 2903
     $142 = $123; //@line 2903
    }
    if (($$376$lcssa | 0) > 0) {
     $143 = _i64Add($141 | 0, $142 | 0, 0, -1048576) | 0; //@line 2907
     $144 = tempRet0; //@line 2908
     $145 = _bitshift64Shl($$376$lcssa | 0, 0, 52) | 0; //@line 2909
     $153 = $144 | tempRet0; //@line 2913
     $154 = $143 | $145; //@line 2913
    } else {
     $150 = _bitshift64Lshr($141 | 0, $142 | 0, 1 - $$376$lcssa | 0) | 0; //@line 2916
     $153 = tempRet0; //@line 2918
     $154 = $150; //@line 2918
    }
    HEAP32[tempDoublePtr >> 2] = $154; //@line 2921
    HEAP32[tempDoublePtr + 4 >> 2] = $153 | $12; //@line 2921
    $$070 = +HEAPF64[tempDoublePtr >> 3]; //@line 2922
   }
  }
 } while (0);
 if ((label | 0) == 3) {
  $27 = $0 * $1; //@line 2927
  $$070 = $27 / $27; //@line 2929
 }
 return +$$070;
}
function __ZN13SocketAddress14set_ip_addressEPKc($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0 = 0, $$016$i = 0, $$025$i = 0, $$02537$i = 0, $$026$i = 0, $$02636$i = 0, $$1$1$i = 0, $$1$2$i = 0, $$1$3$i = 0, $$1$i = 0, $$pre$phi$iZ2D = 0, $103 = 0, $110 = 0, $117 = 0, $124 = 0, $130 = 0, $2 = 0, $25 = 0, $33 = 0, $4 = 0, $42 = 0, $52 = 0, $6 = 0, $62 = 0, $65 = 0, $72 = 0, $76 = 0, $82 = 0, $89 = 0, $9 = 0, $96 = 0, $vararg_buffer = 0, $vararg_buffer1 = 0, $vararg_buffer4 = 0, $vararg_buffer7 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 1706
 STACKTOP = STACKTOP + 48 | 0; //@line 1707
 $vararg_buffer7 = sp + 24 | 0; //@line 1708
 $vararg_buffer4 = sp + 16 | 0; //@line 1709
 $vararg_buffer1 = sp + 8 | 0; //@line 1710
 $vararg_buffer = sp; //@line 1711
 $2 = sp + 32 | 0; //@line 1712
 HEAP8[$0 >> 0] = 0; //@line 1713
 L1 : do {
  if ($1 | 0) {
   $4 = HEAP8[$1 >> 0] | 0; //@line 1717
   do {
    if ($4 << 24 >> 24) {
     $$016$i = 0; //@line 1721
     $6 = $4; //@line 1721
     while (1) {
      if (!($6 << 24 >> 24 == 46 | ($6 + -48 & 255) < 10)) {
       $$02537$i = 0; //@line 1728
       $$02636$i = 0; //@line 1728
       $52 = $4; //@line 1728
       break;
      }
      $9 = $$016$i + 1 | 0; //@line 1731
      $6 = HEAP8[$1 + $9 >> 0] | 0; //@line 1733
      if (!($6 << 24 >> 24)) {
       label = 5; //@line 1736
       break;
      } else {
       $$016$i = $9; //@line 1739
      }
     }
     if ((label | 0) == 5) {
      if (($$016$i | 0) <= -1) {
       break;
      }
      if ((HEAP8[$1 + $$016$i >> 0] | 0) == 46) {
       $$02537$i = 0; //@line 1751
       $$02636$i = 0; //@line 1751
       $52 = $4; //@line 1751
      } else {
       break;
      }
     }
     do {
      if (!(($52 + -48 & 255) < 10 | ($52 + -97 & 255) < 6)) {
       switch ($52 << 24 >> 24) {
       case 58:
       case 65:
       case 66:
       case 67:
       case 68:
       case 69:
       case 70:
        {
         break;
        }
       default:
        {
         break L1;
        }
       }
      }
      $$02636$i = $$02636$i + ($52 << 24 >> 24 == 58 & 1) | 0; //@line 1774
      $$02537$i = $$02537$i + 1 | 0; //@line 1775
      $52 = HEAP8[$1 + $$02537$i >> 0] | 0; //@line 1777
     } while ($52 << 24 >> 24 != 0);
     if (($$02636$i | 0) <= 1) {
      break L1;
     }
     HEAP32[$0 + 40 >> 2] = 2; //@line 1790
     $62 = $0 + 44 | 0; //@line 1791
     $$025$i = 0; //@line 1792
     L17 : while (1) {
      switch (HEAP8[$1 + $$025$i >> 0] | 0) {
      case 0:
       {
        label = 34; //@line 1798
        break L17;
        break;
       }
      case 58:
       {
        $65 = $$025$i + 1 | 0; //@line 1803
        if ((HEAP8[$1 + $65 >> 0] | 0) == 58) {
         label = 33; //@line 1808
         break L17;
        } else {
         $$025$i = $65; //@line 1811
         continue L17;
        }
        break;
       }
      default:
       {
        $$025$i = $$025$i + 1 | 0; //@line 1818
        continue L17;
       }
      }
     }
     if ((label | 0) == 33) {
      $$026$i = __ZL15ipv6_scan_chunkPtPKc($2, $1 + ($$025$i + 2) | 0) | 0; //@line 1827
      $$pre$phi$iZ2D = $2; //@line 1827
     } else if ((label | 0) == 34) {
      $$026$i = 0; //@line 1830
      $$pre$phi$iZ2D = $2; //@line 1830
     }
     $72 = 8 - $$026$i | 0; //@line 1832
     _memmove($2 + ($72 << 1) | 0, $2 | 0, $$026$i << 1 | 0) | 0; //@line 1835
     _memset($2 | 0, 0, $72 << 1 | 0) | 0; //@line 1837
     __ZL15ipv6_scan_chunkPtPKc($$pre$phi$iZ2D, $1) | 0; //@line 1838
     $76 = HEAP16[$$pre$phi$iZ2D >> 1] | 0; //@line 1839
     HEAP8[$62 >> 0] = ($76 & 65535) >>> 8; //@line 1842
     HEAP8[$0 + 45 >> 0] = $76; //@line 1845
     $82 = HEAP16[$2 + 2 >> 1] | 0; //@line 1847
     HEAP8[$0 + 46 >> 0] = ($82 & 65535) >>> 8; //@line 1851
     HEAP8[$0 + 47 >> 0] = $82; //@line 1854
     $89 = HEAP16[$2 + 4 >> 1] | 0; //@line 1856
     HEAP8[$0 + 48 >> 0] = ($89 & 65535) >>> 8; //@line 1860
     HEAP8[$0 + 49 >> 0] = $89; //@line 1863
     $96 = HEAP16[$2 + 6 >> 1] | 0; //@line 1865
     HEAP8[$0 + 50 >> 0] = ($96 & 65535) >>> 8; //@line 1869
     HEAP8[$0 + 51 >> 0] = $96; //@line 1872
     $103 = HEAP16[$2 + 8 >> 1] | 0; //@line 1874
     HEAP8[$0 + 52 >> 0] = ($103 & 65535) >>> 8; //@line 1878
     HEAP8[$0 + 53 >> 0] = $103; //@line 1881
     $110 = HEAP16[$2 + 10 >> 1] | 0; //@line 1883
     HEAP8[$0 + 54 >> 0] = ($110 & 65535) >>> 8; //@line 1887
     HEAP8[$0 + 55 >> 0] = $110; //@line 1890
     $117 = HEAP16[$2 + 12 >> 1] | 0; //@line 1892
     HEAP8[$0 + 56 >> 0] = ($117 & 65535) >>> 8; //@line 1896
     HEAP8[$0 + 57 >> 0] = $117; //@line 1899
     $124 = HEAP16[$2 + 14 >> 1] | 0; //@line 1901
     HEAP8[$0 + 58 >> 0] = ($124 & 65535) >>> 8; //@line 1905
     HEAP8[$0 + 59 >> 0] = $124; //@line 1908
     $$0 = 1; //@line 1909
     STACKTOP = sp; //@line 1910
     return $$0 | 0; //@line 1910
    }
   } while (0);
   HEAP32[$0 + 40 >> 2] = 1; //@line 1914
   HEAP32[$vararg_buffer >> 2] = $2; //@line 1915
   L28 : do {
    if ((_sscanf($1, 3149, $vararg_buffer) | 0) >= 1) {
     HEAP8[$0 + 44 >> 0] = HEAP8[$2 >> 0] | 0; //@line 1922
     $$1$i = 0; //@line 1923
     L30 : while (1) {
      switch (HEAP8[$1 + $$1$i >> 0] | 0) {
      case 0:
       {
        break L28;
        break;
       }
      case 46:
       {
        break L30;
        break;
       }
      default:
       {}
      }
      $$1$i = $$1$i + 1 | 0; //@line 1940
     }
     $25 = $$1$i + 1 | 0; //@line 1942
     HEAP32[$vararg_buffer1 >> 2] = $2; //@line 1944
     if ((_sscanf($1 + $25 | 0, 3149, $vararg_buffer1) | 0) >= 1) {
      HEAP8[$0 + 45 >> 0] = HEAP8[$2 >> 0] | 0; //@line 1950
      $$1$1$i = $25; //@line 1951
      L35 : while (1) {
       switch (HEAP8[$1 + $$1$1$i >> 0] | 0) {
       case 0:
        {
         break L28;
         break;
        }
       case 46:
        {
         break L35;
         break;
        }
       default:
        {}
       }
       $$1$1$i = $$1$1$i + 1 | 0; //@line 1968
      }
      $33 = $$1$1$i + 1 | 0; //@line 1970
      HEAP32[$vararg_buffer4 >> 2] = $2; //@line 1972
      if ((_sscanf($1 + $33 | 0, 3149, $vararg_buffer4) | 0) >= 1) {
       HEAP8[$0 + 46 >> 0] = HEAP8[$2 >> 0] | 0; //@line 1978
       $$1$2$i = $33; //@line 1979
       L40 : while (1) {
        switch (HEAP8[$1 + $$1$2$i >> 0] | 0) {
        case 0:
         {
          break L28;
          break;
         }
        case 46:
         {
          break L40;
          break;
         }
        default:
         {}
        }
        $$1$2$i = $$1$2$i + 1 | 0; //@line 1996
       }
       $42 = $$1$2$i + 1 | 0; //@line 1998
       HEAP32[$vararg_buffer7 >> 2] = $2; //@line 2000
       if ((_sscanf($1 + $42 | 0, 3149, $vararg_buffer7) | 0) >= 1) {
        HEAP8[$0 + 47 >> 0] = HEAP8[$2 >> 0] | 0; //@line 2006
        $$1$3$i = $42; //@line 2007
        L45 : while (1) {
         switch (HEAP8[$1 + $$1$3$i >> 0] | 0) {
         case 0:
          {
           break L28;
           break;
          }
         case 46:
          {
           break L45;
           break;
          }
         default:
          {}
         }
         $$1$3$i = $$1$3$i + 1 | 0; //@line 2024
        }
        $$0 = 1; //@line 2026
        STACKTOP = sp; //@line 2027
        return $$0 | 0; //@line 2027
       }
      }
     }
    }
   } while (0);
   $$0 = 1; //@line 2033
   STACKTOP = sp; //@line 2034
   return $$0 | 0; //@line 2034
  }
 } while (0);
 $130 = $0 + 40 | 0; //@line 2037
 HEAP32[$130 >> 2] = 0; //@line 2038
 HEAP32[$130 + 4 >> 2] = 0; //@line 2038
 HEAP32[$130 + 8 >> 2] = 0; //@line 2038
 HEAP32[$130 + 12 >> 2] = 0; //@line 2038
 HEAP32[$130 + 16 >> 2] = 0; //@line 2038
 $$0 = 0; //@line 2039
 STACKTOP = sp; //@line 2040
 return $$0 | 0; //@line 2040
}
function __ZN6Socket4openEP12NetworkStack($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0 = 0, $$1 = 0, $$pre = 0, $$pre$i$i = 0, $10 = 0, $13 = 0, $14 = 0, $2 = 0, $22 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $34 = 0, $35 = 0, $38 = 0, $4 = 0, $48 = 0, $49 = 0, $60 = 0, $61 = 0, $67 = 0, $70 = 0, $71 = 0, $AsyncCtx = 0, $AsyncCtx11 = 0, $AsyncCtx14 = 0, $AsyncCtx2 = 0, $AsyncCtx5 = 0, $AsyncCtx8 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 1272
 STACKTOP = STACKTOP + 32 | 0; //@line 1273
 $2 = sp + 16 | 0; //@line 1274
 $3 = sp; //@line 1275
 $4 = $0 + 4 | 0; //@line 1276
 if (($1 | 0) == 0 | (HEAP32[$4 >> 2] | 0) != 0) {
  $$1 = -3003; //@line 1282
  STACKTOP = sp; //@line 1283
  return $$1 | 0; //@line 1283
 }
 HEAP32[$4 >> 2] = $1; //@line 1285
 $10 = HEAP32[(HEAP32[$1 >> 2] | 0) + 28 >> 2] | 0; //@line 1288
 $13 = HEAP32[(HEAP32[$0 >> 2] | 0) + 8 >> 2] | 0; //@line 1291
 $AsyncCtx = _emscripten_alloc_async_context(32, sp) | 0; //@line 1292
 $14 = FUNCTION_TABLE_ii[$13 & 15]($0) | 0; //@line 1293
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 59; //@line 1296
  HEAP32[$AsyncCtx + 4 >> 2] = $4; //@line 1298
  HEAP32[$AsyncCtx + 8 >> 2] = $2; //@line 1300
  HEAP32[$AsyncCtx + 12 >> 2] = $1; //@line 1302
  HEAP32[$AsyncCtx + 16 >> 2] = $2; //@line 1304
  HEAP32[$AsyncCtx + 20 >> 2] = $10; //@line 1306
  HEAP32[$AsyncCtx + 24 >> 2] = $0; //@line 1308
  HEAP32[$AsyncCtx + 28 >> 2] = $3; //@line 1310
  sp = STACKTOP; //@line 1311
  STACKTOP = sp; //@line 1312
  return 0; //@line 1312
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 1314
 $AsyncCtx2 = _emscripten_alloc_async_context(24, sp) | 0; //@line 1315
 $22 = FUNCTION_TABLE_iiii[$10 & 15]($1, $2, $14) | 0; //@line 1316
 if (___async) {
  HEAP32[$AsyncCtx2 >> 2] = 60; //@line 1319
  HEAP32[$AsyncCtx2 + 4 >> 2] = $4; //@line 1321
  HEAP32[$AsyncCtx2 + 8 >> 2] = $2; //@line 1323
  HEAP32[$AsyncCtx2 + 12 >> 2] = $2; //@line 1325
  HEAP32[$AsyncCtx2 + 16 >> 2] = $0; //@line 1327
  HEAP32[$AsyncCtx2 + 20 >> 2] = $3; //@line 1329
  sp = STACKTOP; //@line 1330
  STACKTOP = sp; //@line 1331
  return 0; //@line 1331
 }
 _emscripten_free_async_context($AsyncCtx2 | 0); //@line 1333
 do {
  if (!$22) {
   $30 = $0 + 8 | 0; //@line 1338
   HEAP32[$30 >> 2] = HEAP32[$2 >> 2]; //@line 1339
   $31 = $3 + 12 | 0; //@line 1340
   HEAP32[$3 >> 2] = 12; //@line 1341
   HEAP32[$3 + 4 >> 2] = 1; //@line 1343
   HEAP32[$3 + 8 >> 2] = $0; //@line 1345
   HEAP32[$31 >> 2] = 436; //@line 1346
   $32 = $0 + 16 | 0; //@line 1347
   do {
    if (($32 | 0) == ($3 | 0)) {
     $60 = 436; //@line 1351
     label = 16; //@line 1352
    } else {
     $34 = $0 + 28 | 0; //@line 1354
     $35 = HEAP32[$34 >> 2] | 0; //@line 1355
     if (!$35) {
      $48 = 436; //@line 1358
     } else {
      $38 = HEAP32[$35 + 8 >> 2] | 0; //@line 1361
      $AsyncCtx5 = _emscripten_alloc_async_context(32, sp) | 0; //@line 1362
      FUNCTION_TABLE_vi[$38 & 255]($32); //@line 1363
      if (___async) {
       HEAP32[$AsyncCtx5 >> 2] = 61; //@line 1366
       HEAP32[$AsyncCtx5 + 4 >> 2] = $31; //@line 1368
       HEAP32[$AsyncCtx5 + 8 >> 2] = $34; //@line 1370
       HEAP32[$AsyncCtx5 + 12 >> 2] = $32; //@line 1372
       HEAP32[$AsyncCtx5 + 16 >> 2] = $3; //@line 1374
       HEAP32[$AsyncCtx5 + 20 >> 2] = $4; //@line 1376
       HEAP32[$AsyncCtx5 + 24 >> 2] = $30; //@line 1378
       HEAP32[$AsyncCtx5 + 28 >> 2] = $2; //@line 1380
       sp = STACKTOP; //@line 1381
       STACKTOP = sp; //@line 1382
       return 0; //@line 1382
      }
      _emscripten_free_async_context($AsyncCtx5 | 0); //@line 1384
      $$pre = HEAP32[$31 >> 2] | 0; //@line 1385
      if (!$$pre) {
       HEAP32[$34 >> 2] = 0; //@line 1388
       break;
      } else {
       $48 = $$pre; //@line 1391
      }
     }
     $49 = HEAP32[$48 + 4 >> 2] | 0; //@line 1395
     $AsyncCtx8 = _emscripten_alloc_async_context(32, sp) | 0; //@line 1396
     FUNCTION_TABLE_vii[$49 & 3]($32, $3); //@line 1397
     if (___async) {
      HEAP32[$AsyncCtx8 >> 2] = 62; //@line 1400
      HEAP32[$AsyncCtx8 + 4 >> 2] = $31; //@line 1402
      HEAP32[$AsyncCtx8 + 8 >> 2] = $34; //@line 1404
      HEAP32[$AsyncCtx8 + 12 >> 2] = $3; //@line 1406
      HEAP32[$AsyncCtx8 + 16 >> 2] = $4; //@line 1408
      HEAP32[$AsyncCtx8 + 20 >> 2] = $30; //@line 1410
      HEAP32[$AsyncCtx8 + 24 >> 2] = $32; //@line 1412
      HEAP32[$AsyncCtx8 + 28 >> 2] = $2; //@line 1414
      sp = STACKTOP; //@line 1415
      STACKTOP = sp; //@line 1416
      return 0; //@line 1416
     } else {
      _emscripten_free_async_context($AsyncCtx8 | 0); //@line 1418
      $$pre$i$i = HEAP32[$31 >> 2] | 0; //@line 1419
      HEAP32[$34 >> 2] = $$pre$i$i; //@line 1421
      if (!$$pre$i$i) {
       break;
      } else {
       $60 = $$pre$i$i; //@line 1426
       label = 16; //@line 1427
       break;
      }
     }
    }
   } while (0);
   do {
    if ((label | 0) == 16) {
     $61 = HEAP32[$60 + 8 >> 2] | 0; //@line 1436
     $AsyncCtx11 = _emscripten_alloc_async_context(24, sp) | 0; //@line 1437
     FUNCTION_TABLE_vi[$61 & 255]($3); //@line 1438
     if (___async) {
      HEAP32[$AsyncCtx11 >> 2] = 63; //@line 1441
      HEAP32[$AsyncCtx11 + 4 >> 2] = $3; //@line 1443
      HEAP32[$AsyncCtx11 + 8 >> 2] = $4; //@line 1445
      HEAP32[$AsyncCtx11 + 12 >> 2] = $30; //@line 1447
      HEAP32[$AsyncCtx11 + 16 >> 2] = $32; //@line 1449
      HEAP32[$AsyncCtx11 + 20 >> 2] = $2; //@line 1451
      sp = STACKTOP; //@line 1452
      STACKTOP = sp; //@line 1453
      return 0; //@line 1453
     } else {
      _emscripten_free_async_context($AsyncCtx11 | 0); //@line 1455
      break;
     }
    }
   } while (0);
   $67 = HEAP32[$4 >> 2] | 0; //@line 1460
   $70 = HEAP32[(HEAP32[$67 >> 2] | 0) + 68 >> 2] | 0; //@line 1463
   $71 = HEAP32[$30 >> 2] | 0; //@line 1464
   $AsyncCtx14 = _emscripten_alloc_async_context(8, sp) | 0; //@line 1465
   FUNCTION_TABLE_viiii[$70 & 7]($67, $71, 64, $32); //@line 1466
   if (___async) {
    HEAP32[$AsyncCtx14 >> 2] = 65; //@line 1469
    HEAP32[$AsyncCtx14 + 4 >> 2] = $2; //@line 1471
    sp = STACKTOP; //@line 1472
    STACKTOP = sp; //@line 1473
    return 0; //@line 1473
   } else {
    _emscripten_free_async_context($AsyncCtx14 | 0); //@line 1475
    $$0 = 0; //@line 1476
    break;
   }
  } else {
   $$0 = $22; //@line 1480
  }
 } while (0);
 $$1 = $$0; //@line 1483
 STACKTOP = sp; //@line 1484
 return $$1 | 0; //@line 1484
}
function __ZL15ipv6_scan_chunkPtPKc($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$1$ph = 0, $$124 = 0, $$124$1 = 0, $$124$2 = 0, $$124$3 = 0, $$124$4 = 0, $$124$5 = 0, $$124$6 = 0, $$124$7 = 0, $$2 = 0, $17 = 0, $2 = 0, $26 = 0, $35 = 0, $44 = 0, $53 = 0, $62 = 0, $9 = 0, $vararg_buffer = 0, $vararg_buffer1 = 0, $vararg_buffer10 = 0, $vararg_buffer13 = 0, $vararg_buffer16 = 0, $vararg_buffer19 = 0, $vararg_buffer4 = 0, $vararg_buffer7 = 0, sp = 0;
 sp = STACKTOP; //@line 2050
 STACKTOP = STACKTOP + 64 | 0; //@line 2051
 $vararg_buffer19 = sp + 56 | 0; //@line 2052
 $vararg_buffer16 = sp + 48 | 0; //@line 2053
 $vararg_buffer13 = sp + 40 | 0; //@line 2054
 $vararg_buffer10 = sp + 32 | 0; //@line 2055
 $vararg_buffer7 = sp + 24 | 0; //@line 2056
 $vararg_buffer4 = sp + 16 | 0; //@line 2057
 $vararg_buffer1 = sp + 8 | 0; //@line 2058
 $vararg_buffer = sp; //@line 2059
 $2 = sp + 60 | 0; //@line 2060
 HEAP32[$vararg_buffer >> 2] = $2; //@line 2061
 L1 : do {
  if ((_sscanf($1, 3154, $vararg_buffer) | 0) < 1) {
   $$1$ph = 0; //@line 2066
  } else {
   HEAP16[$0 >> 1] = HEAP16[$2 >> 1] | 0; //@line 2069
   $$124 = 0; //@line 2070
   L3 : while (1) {
    switch (HEAP8[$1 + $$124 >> 0] | 0) {
    case 0:
     {
      $$1$ph = 1; //@line 2076
      break L1;
      break;
     }
    case 58:
     {
      break L3;
      break;
     }
    default:
     {}
    }
    $$124 = $$124 + 1 | 0; //@line 2088
   }
   $9 = $$124 + 1 | 0; //@line 2090
   HEAP32[$vararg_buffer1 >> 2] = $2; //@line 2092
   if ((_sscanf($1 + $9 | 0, 3154, $vararg_buffer1) | 0) < 1) {
    $$1$ph = 1; //@line 2096
   } else {
    HEAP16[$0 + 2 >> 1] = HEAP16[$2 >> 1] | 0; //@line 2100
    $$124$1 = $9; //@line 2101
    L8 : while (1) {
     switch (HEAP8[$1 + $$124$1 >> 0] | 0) {
     case 0:
      {
       $$1$ph = 2; //@line 2107
       break L1;
       break;
      }
     case 58:
      {
       break L8;
       break;
      }
     default:
      {}
     }
     $$124$1 = $$124$1 + 1 | 0; //@line 2119
    }
    $17 = $$124$1 + 1 | 0; //@line 2121
    HEAP32[$vararg_buffer4 >> 2] = $2; //@line 2123
    if ((_sscanf($1 + $17 | 0, 3154, $vararg_buffer4) | 0) < 1) {
     $$1$ph = 2; //@line 2127
    } else {
     HEAP16[$0 + 4 >> 1] = HEAP16[$2 >> 1] | 0; //@line 2131
     $$124$2 = $17; //@line 2132
     L13 : while (1) {
      switch (HEAP8[$1 + $$124$2 >> 0] | 0) {
      case 0:
       {
        $$1$ph = 3; //@line 2138
        break L1;
        break;
       }
      case 58:
       {
        break L13;
        break;
       }
      default:
       {}
      }
      $$124$2 = $$124$2 + 1 | 0; //@line 2150
     }
     $26 = $$124$2 + 1 | 0; //@line 2152
     HEAP32[$vararg_buffer7 >> 2] = $2; //@line 2154
     if ((_sscanf($1 + $26 | 0, 3154, $vararg_buffer7) | 0) < 1) {
      $$1$ph = 3; //@line 2158
     } else {
      HEAP16[$0 + 6 >> 1] = HEAP16[$2 >> 1] | 0; //@line 2162
      $$124$3 = $26; //@line 2163
      L18 : while (1) {
       switch (HEAP8[$1 + $$124$3 >> 0] | 0) {
       case 0:
        {
         $$1$ph = 4; //@line 2169
         break L1;
         break;
        }
       case 58:
        {
         break L18;
         break;
        }
       default:
        {}
       }
       $$124$3 = $$124$3 + 1 | 0; //@line 2181
      }
      $35 = $$124$3 + 1 | 0; //@line 2183
      HEAP32[$vararg_buffer10 >> 2] = $2; //@line 2185
      if ((_sscanf($1 + $35 | 0, 3154, $vararg_buffer10) | 0) < 1) {
       $$1$ph = 4; //@line 2189
      } else {
       HEAP16[$0 + 8 >> 1] = HEAP16[$2 >> 1] | 0; //@line 2193
       $$124$4 = $35; //@line 2194
       L23 : while (1) {
        switch (HEAP8[$1 + $$124$4 >> 0] | 0) {
        case 0:
         {
          $$1$ph = 5; //@line 2200
          break L1;
          break;
         }
        case 58:
         {
          break L23;
          break;
         }
        default:
         {}
        }
        $$124$4 = $$124$4 + 1 | 0; //@line 2212
       }
       $44 = $$124$4 + 1 | 0; //@line 2214
       HEAP32[$vararg_buffer13 >> 2] = $2; //@line 2216
       if ((_sscanf($1 + $44 | 0, 3154, $vararg_buffer13) | 0) < 1) {
        $$1$ph = 5; //@line 2220
       } else {
        HEAP16[$0 + 10 >> 1] = HEAP16[$2 >> 1] | 0; //@line 2224
        $$124$5 = $44; //@line 2225
        L28 : while (1) {
         switch (HEAP8[$1 + $$124$5 >> 0] | 0) {
         case 0:
          {
           $$1$ph = 6; //@line 2231
           break L1;
           break;
          }
         case 58:
          {
           break L28;
           break;
          }
         default:
          {}
         }
         $$124$5 = $$124$5 + 1 | 0; //@line 2243
        }
        $53 = $$124$5 + 1 | 0; //@line 2245
        HEAP32[$vararg_buffer16 >> 2] = $2; //@line 2247
        if ((_sscanf($1 + $53 | 0, 3154, $vararg_buffer16) | 0) < 1) {
         $$1$ph = 6; //@line 2251
        } else {
         HEAP16[$0 + 12 >> 1] = HEAP16[$2 >> 1] | 0; //@line 2255
         $$124$6 = $53; //@line 2256
         L33 : while (1) {
          switch (HEAP8[$1 + $$124$6 >> 0] | 0) {
          case 0:
           {
            $$1$ph = 7; //@line 2262
            break L1;
            break;
           }
          case 58:
           {
            break L33;
            break;
           }
          default:
           {}
          }
          $$124$6 = $$124$6 + 1 | 0; //@line 2274
         }
         $62 = $$124$6 + 1 | 0; //@line 2276
         HEAP32[$vararg_buffer19 >> 2] = $2; //@line 2278
         if ((_sscanf($1 + $62 | 0, 3154, $vararg_buffer19) | 0) < 1) {
          $$1$ph = 7; //@line 2282
         } else {
          HEAP16[$0 + 14 >> 1] = HEAP16[$2 >> 1] | 0; //@line 2286
          $$124$7 = $62; //@line 2287
          L38 : while (1) {
           switch (HEAP8[$1 + $$124$7 >> 0] | 0) {
           case 0:
            {
             $$1$ph = 8; //@line 2293
             break L1;
             break;
            }
           case 58:
            {
             break L38;
             break;
            }
           default:
            {}
           }
           $$124$7 = $$124$7 + 1 | 0; //@line 2305
          }
          $$2 = 8; //@line 2307
          STACKTOP = sp; //@line 2308
          return $$2 | 0; //@line 2308
         }
        }
       }
      }
     }
    }
   }
  }
 } while (0);
 $$2 = $$1$ph; //@line 2318
 STACKTOP = sp; //@line 2319
 return $$2 | 0; //@line 2319
}
function __ZN6Socket4openEP12NetworkStack__async_cb_57($0) {
 $0 = $0 | 0;
 var $10 = 0, $14 = 0, $15 = 0, $16 = 0, $18 = 0, $19 = 0, $2 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $6 = 0, $8 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx3 = 0, $ReallocAsyncCtx4 = 0, $ReallocAsyncCtx5 = 0, sp = 0;
 sp = STACKTOP; //@line 12766
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 12768
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 12770
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 12772
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 12774
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 12776
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 12778
 if ($AsyncRetVal | 0) {
  HEAP32[___async_retval >> 2] = $AsyncRetVal; //@line 12782
  return;
 }
 $14 = $8 + 8 | 0; //@line 12786
 HEAP32[$14 >> 2] = HEAP32[$6 >> 2]; //@line 12787
 $15 = $10 + 12 | 0; //@line 12788
 HEAP32[$10 >> 2] = 12; //@line 12789
 HEAP32[$10 + 4 >> 2] = 1; //@line 12791
 HEAP32[$10 + 8 >> 2] = $8; //@line 12793
 HEAP32[$15 >> 2] = 436; //@line 12794
 $16 = $8 + 16 | 0; //@line 12795
 if (($16 | 0) == ($10 | 0)) {
  $40 = HEAP32[111] | 0; //@line 12799
  $ReallocAsyncCtx5 = _emscripten_realloc_async_context(24) | 0; //@line 12800
  FUNCTION_TABLE_vi[$40 & 255]($10); //@line 12801
  if (___async) {
   HEAP32[$ReallocAsyncCtx5 >> 2] = 63; //@line 12804
   $41 = $ReallocAsyncCtx5 + 4 | 0; //@line 12805
   HEAP32[$41 >> 2] = $10; //@line 12806
   $42 = $ReallocAsyncCtx5 + 8 | 0; //@line 12807
   HEAP32[$42 >> 2] = $2; //@line 12808
   $43 = $ReallocAsyncCtx5 + 12 | 0; //@line 12809
   HEAP32[$43 >> 2] = $14; //@line 12810
   $44 = $ReallocAsyncCtx5 + 16 | 0; //@line 12811
   HEAP32[$44 >> 2] = $16; //@line 12812
   $45 = $ReallocAsyncCtx5 + 20 | 0; //@line 12813
   HEAP32[$45 >> 2] = $4; //@line 12814
   sp = STACKTOP; //@line 12815
   return;
  }
  ___async_unwind = 0; //@line 12818
  HEAP32[$ReallocAsyncCtx5 >> 2] = 63; //@line 12819
  $41 = $ReallocAsyncCtx5 + 4 | 0; //@line 12820
  HEAP32[$41 >> 2] = $10; //@line 12821
  $42 = $ReallocAsyncCtx5 + 8 | 0; //@line 12822
  HEAP32[$42 >> 2] = $2; //@line 12823
  $43 = $ReallocAsyncCtx5 + 12 | 0; //@line 12824
  HEAP32[$43 >> 2] = $14; //@line 12825
  $44 = $ReallocAsyncCtx5 + 16 | 0; //@line 12826
  HEAP32[$44 >> 2] = $16; //@line 12827
  $45 = $ReallocAsyncCtx5 + 20 | 0; //@line 12828
  HEAP32[$45 >> 2] = $4; //@line 12829
  sp = STACKTOP; //@line 12830
  return;
 }
 $18 = $8 + 28 | 0; //@line 12833
 $19 = HEAP32[$18 >> 2] | 0; //@line 12834
 if (!$19) {
  $31 = HEAP32[110] | 0; //@line 12838
  $ReallocAsyncCtx4 = _emscripten_realloc_async_context(32) | 0; //@line 12839
  FUNCTION_TABLE_vii[$31 & 3]($16, $10); //@line 12840
  if (___async) {
   HEAP32[$ReallocAsyncCtx4 >> 2] = 62; //@line 12843
   $32 = $ReallocAsyncCtx4 + 4 | 0; //@line 12844
   HEAP32[$32 >> 2] = $15; //@line 12845
   $33 = $ReallocAsyncCtx4 + 8 | 0; //@line 12846
   HEAP32[$33 >> 2] = $18; //@line 12847
   $34 = $ReallocAsyncCtx4 + 12 | 0; //@line 12848
   HEAP32[$34 >> 2] = $10; //@line 12849
   $35 = $ReallocAsyncCtx4 + 16 | 0; //@line 12850
   HEAP32[$35 >> 2] = $2; //@line 12851
   $36 = $ReallocAsyncCtx4 + 20 | 0; //@line 12852
   HEAP32[$36 >> 2] = $14; //@line 12853
   $37 = $ReallocAsyncCtx4 + 24 | 0; //@line 12854
   HEAP32[$37 >> 2] = $16; //@line 12855
   $38 = $ReallocAsyncCtx4 + 28 | 0; //@line 12856
   HEAP32[$38 >> 2] = $4; //@line 12857
   sp = STACKTOP; //@line 12858
   return;
  }
  ___async_unwind = 0; //@line 12861
  HEAP32[$ReallocAsyncCtx4 >> 2] = 62; //@line 12862
  $32 = $ReallocAsyncCtx4 + 4 | 0; //@line 12863
  HEAP32[$32 >> 2] = $15; //@line 12864
  $33 = $ReallocAsyncCtx4 + 8 | 0; //@line 12865
  HEAP32[$33 >> 2] = $18; //@line 12866
  $34 = $ReallocAsyncCtx4 + 12 | 0; //@line 12867
  HEAP32[$34 >> 2] = $10; //@line 12868
  $35 = $ReallocAsyncCtx4 + 16 | 0; //@line 12869
  HEAP32[$35 >> 2] = $2; //@line 12870
  $36 = $ReallocAsyncCtx4 + 20 | 0; //@line 12871
  HEAP32[$36 >> 2] = $14; //@line 12872
  $37 = $ReallocAsyncCtx4 + 24 | 0; //@line 12873
  HEAP32[$37 >> 2] = $16; //@line 12874
  $38 = $ReallocAsyncCtx4 + 28 | 0; //@line 12875
  HEAP32[$38 >> 2] = $4; //@line 12876
  sp = STACKTOP; //@line 12877
  return;
 } else {
  $22 = HEAP32[$19 + 8 >> 2] | 0; //@line 12881
  $ReallocAsyncCtx3 = _emscripten_realloc_async_context(32) | 0; //@line 12882
  FUNCTION_TABLE_vi[$22 & 255]($16); //@line 12883
  if (___async) {
   HEAP32[$ReallocAsyncCtx3 >> 2] = 61; //@line 12886
   $23 = $ReallocAsyncCtx3 + 4 | 0; //@line 12887
   HEAP32[$23 >> 2] = $15; //@line 12888
   $24 = $ReallocAsyncCtx3 + 8 | 0; //@line 12889
   HEAP32[$24 >> 2] = $18; //@line 12890
   $25 = $ReallocAsyncCtx3 + 12 | 0; //@line 12891
   HEAP32[$25 >> 2] = $16; //@line 12892
   $26 = $ReallocAsyncCtx3 + 16 | 0; //@line 12893
   HEAP32[$26 >> 2] = $10; //@line 12894
   $27 = $ReallocAsyncCtx3 + 20 | 0; //@line 12895
   HEAP32[$27 >> 2] = $2; //@line 12896
   $28 = $ReallocAsyncCtx3 + 24 | 0; //@line 12897
   HEAP32[$28 >> 2] = $14; //@line 12898
   $29 = $ReallocAsyncCtx3 + 28 | 0; //@line 12899
   HEAP32[$29 >> 2] = $4; //@line 12900
   sp = STACKTOP; //@line 12901
   return;
  }
  ___async_unwind = 0; //@line 12904
  HEAP32[$ReallocAsyncCtx3 >> 2] = 61; //@line 12905
  $23 = $ReallocAsyncCtx3 + 4 | 0; //@line 12906
  HEAP32[$23 >> 2] = $15; //@line 12907
  $24 = $ReallocAsyncCtx3 + 8 | 0; //@line 12908
  HEAP32[$24 >> 2] = $18; //@line 12909
  $25 = $ReallocAsyncCtx3 + 12 | 0; //@line 12910
  HEAP32[$25 >> 2] = $16; //@line 12911
  $26 = $ReallocAsyncCtx3 + 16 | 0; //@line 12912
  HEAP32[$26 >> 2] = $10; //@line 12913
  $27 = $ReallocAsyncCtx3 + 20 | 0; //@line 12914
  HEAP32[$27 >> 2] = $2; //@line 12915
  $28 = $ReallocAsyncCtx3 + 24 | 0; //@line 12916
  HEAP32[$28 >> 2] = $14; //@line 12917
  $29 = $ReallocAsyncCtx3 + 28 | 0; //@line 12918
  HEAP32[$29 >> 2] = $4; //@line 12919
  sp = STACKTOP; //@line 12920
  return;
 }
}
function __ZN9TCPSocket7connectEPKct__async_cb($0) {
 $0 = $0 | 0;
 var $$0 = 0, $$expand_i1_val = 0, $10 = 0, $13 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $26 = 0, $29 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $4 = 0, $42 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx2 = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 9838
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 9840
 $4 = HEAP16[$0 + 8 >> 1] | 0; //@line 9842
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 9844
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 9846
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 9848
 if (HEAP32[___async_retval >> 2] | 0) {
  $$0 = -3009; //@line 9853
  $42 = ___async_retval; //@line 9854
  HEAP32[$42 >> 2] = $$0; //@line 9855
  return;
 }
 __ZN13SocketAddress8set_portEt($2, $4); //@line 9858
 $13 = $6 + 57 | 0; //@line 9859
 if (HEAP8[$13 >> 0] | 0) {
  $ReallocAsyncCtx3 = _emscripten_realloc_async_context(24) | 0; //@line 9863
  _mbed_assert_internal(3190, 3210, 52); //@line 9864
  if (___async) {
   HEAP32[$ReallocAsyncCtx3 >> 2] = 78; //@line 9867
   $16 = $ReallocAsyncCtx3 + 4 | 0; //@line 9868
   HEAP32[$16 >> 2] = $13; //@line 9869
   $17 = $ReallocAsyncCtx3 + 8 | 0; //@line 9870
   HEAP32[$17 >> 2] = $6; //@line 9871
   $18 = $ReallocAsyncCtx3 + 12 | 0; //@line 9872
   HEAP32[$18 >> 2] = $10; //@line 9873
   $19 = $ReallocAsyncCtx3 + 16 | 0; //@line 9874
   HEAP32[$19 >> 2] = $2; //@line 9875
   $20 = $ReallocAsyncCtx3 + 20 | 0; //@line 9876
   HEAP32[$20 >> 2] = $8; //@line 9877
   sp = STACKTOP; //@line 9878
   return;
  }
  ___async_unwind = 0; //@line 9881
  HEAP32[$ReallocAsyncCtx3 >> 2] = 78; //@line 9882
  $16 = $ReallocAsyncCtx3 + 4 | 0; //@line 9883
  HEAP32[$16 >> 2] = $13; //@line 9884
  $17 = $ReallocAsyncCtx3 + 8 | 0; //@line 9885
  HEAP32[$17 >> 2] = $6; //@line 9886
  $18 = $ReallocAsyncCtx3 + 12 | 0; //@line 9887
  HEAP32[$18 >> 2] = $10; //@line 9888
  $19 = $ReallocAsyncCtx3 + 16 | 0; //@line 9889
  HEAP32[$19 >> 2] = $2; //@line 9890
  $20 = $ReallocAsyncCtx3 + 20 | 0; //@line 9891
  HEAP32[$20 >> 2] = $8; //@line 9892
  sp = STACKTOP; //@line 9893
  return;
 }
 HEAP8[$13 >> 0] = 1; //@line 9896
 $21 = $6 + 8 | 0; //@line 9897
 $22 = $6 + 52 | 0; //@line 9898
 $23 = $6 + 12 | 0; //@line 9899
 $24 = HEAP32[$21 >> 2] | 0; //@line 9900
 if (!$24) {
  HEAP8[$13 >> 0] = 0; //@line 9903
  $$0 = 0 & -3005 == -3015 ? 0 : -3005; //@line 9907
  $42 = ___async_retval; //@line 9908
  HEAP32[$42 >> 2] = $$0; //@line 9909
  return;
 }
 HEAP32[$22 >> 2] = 0; //@line 9912
 $26 = HEAP32[$10 >> 2] | 0; //@line 9913
 $29 = HEAP32[(HEAP32[$26 >> 2] | 0) + 44 >> 2] | 0; //@line 9916
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(36) | 0; //@line 9917
 $30 = FUNCTION_TABLE_iiii[$29 & 15]($26, $24, $2) | 0; //@line 9918
 if (___async) {
  HEAP32[$ReallocAsyncCtx2 >> 2] = 79; //@line 9921
  $31 = $ReallocAsyncCtx2 + 4 | 0; //@line 9922
  HEAP32[$31 >> 2] = $23; //@line 9923
  $32 = $ReallocAsyncCtx2 + 8 | 0; //@line 9924
  HEAP32[$32 >> 2] = $21; //@line 9925
  $33 = $ReallocAsyncCtx2 + 12 | 0; //@line 9926
  HEAP32[$33 >> 2] = $13; //@line 9927
  $34 = $ReallocAsyncCtx2 + 16 | 0; //@line 9928
  $$expand_i1_val = 0; //@line 9929
  HEAP8[$34 >> 0] = $$expand_i1_val; //@line 9930
  $35 = $ReallocAsyncCtx2 + 20 | 0; //@line 9931
  HEAP32[$35 >> 2] = $8; //@line 9932
  $36 = $ReallocAsyncCtx2 + 24 | 0; //@line 9933
  HEAP32[$36 >> 2] = $22; //@line 9934
  $37 = $ReallocAsyncCtx2 + 28 | 0; //@line 9935
  HEAP32[$37 >> 2] = $10; //@line 9936
  $38 = $ReallocAsyncCtx2 + 32 | 0; //@line 9937
  HEAP32[$38 >> 2] = $2; //@line 9938
  sp = STACKTOP; //@line 9939
  return;
 }
 HEAP32[___async_retval >> 2] = $30; //@line 9943
 ___async_unwind = 0; //@line 9944
 HEAP32[$ReallocAsyncCtx2 >> 2] = 79; //@line 9945
 $31 = $ReallocAsyncCtx2 + 4 | 0; //@line 9946
 HEAP32[$31 >> 2] = $23; //@line 9947
 $32 = $ReallocAsyncCtx2 + 8 | 0; //@line 9948
 HEAP32[$32 >> 2] = $21; //@line 9949
 $33 = $ReallocAsyncCtx2 + 12 | 0; //@line 9950
 HEAP32[$33 >> 2] = $13; //@line 9951
 $34 = $ReallocAsyncCtx2 + 16 | 0; //@line 9952
 $$expand_i1_val = 0; //@line 9953
 HEAP8[$34 >> 0] = $$expand_i1_val; //@line 9954
 $35 = $ReallocAsyncCtx2 + 20 | 0; //@line 9955
 HEAP32[$35 >> 2] = $8; //@line 9956
 $36 = $ReallocAsyncCtx2 + 24 | 0; //@line 9957
 HEAP32[$36 >> 2] = $22; //@line 9958
 $37 = $ReallocAsyncCtx2 + 28 | 0; //@line 9959
 HEAP32[$37 >> 2] = $10; //@line 9960
 $38 = $ReallocAsyncCtx2 + 32 | 0; //@line 9961
 HEAP32[$38 >> 2] = $2; //@line 9962
 sp = STACKTOP; //@line 9963
 return;
}
function __ZN9TCPSocket7connectEPKct($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$0 = 0, $$0$off0$i = 0, $$08$i = 0, $$byval_copy = 0, $10 = 0, $17 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $3 = 0, $30 = 0, $33 = 0, $34 = 0, $4 = 0, $5 = 0, $6 = 0, $9 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, $AsyncCtx7 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 2866
 STACKTOP = STACKTOP + 112 | 0; //@line 2867
 $$byval_copy = sp + 88 | 0; //@line 2868
 $3 = sp + 24 | 0; //@line 2869
 $4 = sp; //@line 2870
 HEAP32[$4 >> 2] = 0; //@line 2871
 HEAP32[$4 + 4 >> 2] = 0; //@line 2871
 HEAP32[$4 + 8 >> 2] = 0; //@line 2871
 HEAP32[$4 + 12 >> 2] = 0; //@line 2871
 HEAP32[$4 + 16 >> 2] = 0; //@line 2871
 HEAP32[$$byval_copy >> 2] = HEAP32[$4 >> 2]; //@line 2872
 HEAP32[$$byval_copy + 4 >> 2] = HEAP32[$4 + 4 >> 2]; //@line 2872
 HEAP32[$$byval_copy + 8 >> 2] = HEAP32[$4 + 8 >> 2]; //@line 2872
 HEAP32[$$byval_copy + 12 >> 2] = HEAP32[$4 + 12 >> 2]; //@line 2872
 HEAP32[$$byval_copy + 16 >> 2] = HEAP32[$4 + 16 >> 2]; //@line 2872
 __ZN13SocketAddressC2E10nsapi_addrt($3, $$byval_copy, 0); //@line 2873
 $5 = $0 + 4 | 0; //@line 2874
 $6 = HEAP32[$5 >> 2] | 0; //@line 2875
 $9 = HEAP32[(HEAP32[$6 >> 2] | 0) + 12 >> 2] | 0; //@line 2878
 $AsyncCtx = _emscripten_alloc_async_context(24, sp) | 0; //@line 2879
 $10 = FUNCTION_TABLE_iiiii[$9 & 15]($6, $1, $3, 0) | 0; //@line 2880
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 77; //@line 2883
  HEAP32[$AsyncCtx + 4 >> 2] = $3; //@line 2885
  HEAP16[$AsyncCtx + 8 >> 1] = $2; //@line 2887
  HEAP32[$AsyncCtx + 12 >> 2] = $0; //@line 2889
  HEAP32[$AsyncCtx + 16 >> 2] = $3; //@line 2891
  HEAP32[$AsyncCtx + 20 >> 2] = $5; //@line 2893
  sp = STACKTOP; //@line 2894
  STACKTOP = sp; //@line 2895
  return 0; //@line 2895
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 2897
 if ($10 | 0) {
  $$0 = -3009; //@line 2900
  STACKTOP = sp; //@line 2901
  return $$0 | 0; //@line 2901
 }
 __ZN13SocketAddress8set_portEt($3, $2); //@line 2903
 $17 = $0 + 57 | 0; //@line 2904
 do {
  if (HEAP8[$17 >> 0] | 0) {
   $AsyncCtx7 = _emscripten_alloc_async_context(24, sp) | 0; //@line 2909
   _mbed_assert_internal(3190, 3210, 52); //@line 2910
   if (___async) {
    HEAP32[$AsyncCtx7 >> 2] = 78; //@line 2913
    HEAP32[$AsyncCtx7 + 4 >> 2] = $17; //@line 2915
    HEAP32[$AsyncCtx7 + 8 >> 2] = $0; //@line 2917
    HEAP32[$AsyncCtx7 + 12 >> 2] = $5; //@line 2919
    HEAP32[$AsyncCtx7 + 16 >> 2] = $3; //@line 2921
    HEAP32[$AsyncCtx7 + 20 >> 2] = $3; //@line 2923
    sp = STACKTOP; //@line 2924
    STACKTOP = sp; //@line 2925
    return 0; //@line 2925
   } else {
    _emscripten_free_async_context($AsyncCtx7 | 0); //@line 2927
    break;
   }
  }
 } while (0);
 HEAP8[$17 >> 0] = 1; //@line 2932
 $25 = $0 + 8 | 0; //@line 2933
 $26 = $0 + 52 | 0; //@line 2934
 $27 = $0 + 12 | 0; //@line 2935
 $$0$off0$i = 0; //@line 2936
 while (1) {
  $28 = HEAP32[$25 >> 2] | 0; //@line 2938
  if (!$28) {
   $$08$i = -3005; //@line 2941
   break;
  }
  HEAP32[$26 >> 2] = 0; //@line 2944
  $30 = HEAP32[$5 >> 2] | 0; //@line 2945
  $33 = HEAP32[(HEAP32[$30 >> 2] | 0) + 44 >> 2] | 0; //@line 2948
  $AsyncCtx3 = _emscripten_alloc_async_context(36, sp) | 0; //@line 2949
  $34 = FUNCTION_TABLE_iiii[$33 & 15]($30, $28, $3) | 0; //@line 2950
  if (___async) {
   label = 11; //@line 2953
   break;
  }
  _emscripten_free_async_context($AsyncCtx3 | 0); //@line 2956
  if ((HEAP32[$27 >> 2] | 0) != 0 & ($34 | 1 | 0) == -3013) {
   $$0$off0$i = 1; //@line 2963
  } else {
   $$08$i = $34; //@line 2965
   break;
  }
 }
 if ((label | 0) == 11) {
  HEAP32[$AsyncCtx3 >> 2] = 79; //@line 2970
  HEAP32[$AsyncCtx3 + 4 >> 2] = $27; //@line 2972
  HEAP32[$AsyncCtx3 + 8 >> 2] = $25; //@line 2974
  HEAP32[$AsyncCtx3 + 12 >> 2] = $17; //@line 2976
  HEAP8[$AsyncCtx3 + 16 >> 0] = $$0$off0$i & 1; //@line 2979
  HEAP32[$AsyncCtx3 + 20 >> 2] = $3; //@line 2981
  HEAP32[$AsyncCtx3 + 24 >> 2] = $26; //@line 2983
  HEAP32[$AsyncCtx3 + 28 >> 2] = $5; //@line 2985
  HEAP32[$AsyncCtx3 + 32 >> 2] = $3; //@line 2987
  sp = STACKTOP; //@line 2988
  STACKTOP = sp; //@line 2989
  return 0; //@line 2989
 }
 HEAP8[$17 >> 0] = 0; //@line 2991
 $$0 = $$0$off0$i & ($$08$i | 0) == -3015 ? 0 : $$08$i; //@line 2995
 STACKTOP = sp; //@line 2996
 return $$0 | 0; //@line 2996
}
function __ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_4($0) {
 $0 = $0 | 0;
 var $$085$off0$reg2mem$0 = 0, $$182$off0 = 0, $$186$off0 = 0, $$283$off0 = 0, $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $2 = 0, $20 = 0, $22 = 0, $24 = 0, $26 = 0, $28 = 0, $30 = 0, $4 = 0, $59 = 0, $6 = 0, $67 = 0, $8 = 0, $ReallocAsyncCtx5 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 9217
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 9219
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 9221
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 9223
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 9225
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 9227
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 9229
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 9231
 $16 = HEAP8[$0 + 32 >> 0] & 1; //@line 9234
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 9236
 $20 = HEAP32[$0 + 40 >> 2] | 0; //@line 9238
 $22 = HEAP8[$0 + 44 >> 0] & 1; //@line 9241
 $24 = HEAP8[$0 + 45 >> 0] & 1; //@line 9244
 $26 = HEAP32[$0 + 48 >> 2] | 0; //@line 9246
 $28 = HEAP32[$0 + 52 >> 2] | 0; //@line 9248
 L2 : do {
  if (!(HEAP8[$18 >> 0] | 0)) {
   do {
    if (!(HEAP8[$10 >> 0] | 0)) {
     $$182$off0 = $22; //@line 9257
     $$186$off0 = $24; //@line 9257
    } else {
     if (!(HEAP8[$4 >> 0] | 0)) {
      if (!(HEAP32[$6 >> 2] & 1)) {
       $$085$off0$reg2mem$0 = $24; //@line 9266
       $$283$off0 = 1; //@line 9266
       label = 13; //@line 9267
       break L2;
      } else {
       $$182$off0 = 1; //@line 9270
       $$186$off0 = $24; //@line 9270
       break;
      }
     }
     if ((HEAP32[$2 >> 2] | 0) == 1) {
      label = 18; //@line 9277
      break L2;
     }
     if (!(HEAP32[$6 >> 2] & 2)) {
      label = 18; //@line 9284
      break L2;
     } else {
      $$182$off0 = 1; //@line 9287
      $$186$off0 = 1; //@line 9287
     }
    }
   } while (0);
   $30 = $26 + 8 | 0; //@line 9291
   if ($30 >>> 0 < $8 >>> 0) {
    HEAP8[$4 >> 0] = 0; //@line 9294
    HEAP8[$10 >> 0] = 0; //@line 9295
    $ReallocAsyncCtx5 = _emscripten_realloc_async_context(56) | 0; //@line 9296
    __ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($30, $12, $14, $14, 1, $16); //@line 9297
    if (!___async) {
     ___async_unwind = 0; //@line 9300
    }
    HEAP32[$ReallocAsyncCtx5 >> 2] = 164; //@line 9302
    HEAP32[$ReallocAsyncCtx5 + 4 >> 2] = $2; //@line 9304
    HEAP32[$ReallocAsyncCtx5 + 8 >> 2] = $4; //@line 9306
    HEAP32[$ReallocAsyncCtx5 + 12 >> 2] = $6; //@line 9308
    HEAP32[$ReallocAsyncCtx5 + 16 >> 2] = $8; //@line 9310
    HEAP32[$ReallocAsyncCtx5 + 20 >> 2] = $10; //@line 9312
    HEAP32[$ReallocAsyncCtx5 + 24 >> 2] = $12; //@line 9314
    HEAP32[$ReallocAsyncCtx5 + 28 >> 2] = $14; //@line 9316
    HEAP8[$ReallocAsyncCtx5 + 32 >> 0] = $16 & 1; //@line 9319
    HEAP32[$ReallocAsyncCtx5 + 36 >> 2] = $18; //@line 9321
    HEAP32[$ReallocAsyncCtx5 + 40 >> 2] = $20; //@line 9323
    HEAP8[$ReallocAsyncCtx5 + 44 >> 0] = $$182$off0 & 1; //@line 9326
    HEAP8[$ReallocAsyncCtx5 + 45 >> 0] = $$186$off0 & 1; //@line 9329
    HEAP32[$ReallocAsyncCtx5 + 48 >> 2] = $30; //@line 9331
    HEAP32[$ReallocAsyncCtx5 + 52 >> 2] = $28; //@line 9333
    sp = STACKTOP; //@line 9334
    return;
   } else {
    $$085$off0$reg2mem$0 = $$186$off0; //@line 9337
    $$283$off0 = $$182$off0; //@line 9337
    label = 13; //@line 9338
   }
  } else {
   $$085$off0$reg2mem$0 = $24; //@line 9341
   $$283$off0 = $22; //@line 9341
   label = 13; //@line 9342
  }
 } while (0);
 do {
  if ((label | 0) == 13) {
   if (!$$085$off0$reg2mem$0) {
    HEAP32[$28 >> 2] = $14; //@line 9348
    $59 = $12 + 40 | 0; //@line 9349
    HEAP32[$59 >> 2] = (HEAP32[$59 >> 2] | 0) + 1; //@line 9352
    if ((HEAP32[$12 + 36 >> 2] | 0) == 1) {
     if ((HEAP32[$2 >> 2] | 0) == 2) {
      HEAP8[$18 >> 0] = 1; //@line 9360
      if ($$283$off0) {
       label = 18; //@line 9362
       break;
      } else {
       $67 = 4; //@line 9365
       break;
      }
     }
    }
   }
   if ($$283$off0) {
    label = 18; //@line 9372
   } else {
    $67 = 4; //@line 9374
   }
  }
 } while (0);
 if ((label | 0) == 18) {
  $67 = 3; //@line 9379
 }
 HEAP32[$20 >> 2] = $67; //@line 9381
 return;
}
function __ZNK13SocketAddress14get_ip_addressEv($0) {
 $0 = $0 | 0;
 var $$0 = 0, $11 = 0, $14 = 0, $17 = 0, $2 = 0, $23 = 0, $31 = 0, $39 = 0, $47 = 0, $55 = 0, $63 = 0, $71 = 0, $79 = 0, $vararg_buffer = 0, $vararg_buffer12 = 0, $vararg_buffer16 = 0, $vararg_buffer20 = 0, $vararg_buffer24 = 0, $vararg_buffer28 = 0, $vararg_buffer32 = 0, $vararg_buffer4 = 0, $vararg_buffer8 = 0, sp = 0;
 sp = STACKTOP; //@line 2346
 STACKTOP = STACKTOP + 80 | 0; //@line 2347
 $vararg_buffer32 = sp + 72 | 0; //@line 2348
 $vararg_buffer28 = sp + 64 | 0; //@line 2349
 $vararg_buffer24 = sp + 56 | 0; //@line 2350
 $vararg_buffer20 = sp + 48 | 0; //@line 2351
 $vararg_buffer16 = sp + 40 | 0; //@line 2352
 $vararg_buffer12 = sp + 32 | 0; //@line 2353
 $vararg_buffer8 = sp + 24 | 0; //@line 2354
 $vararg_buffer4 = sp + 16 | 0; //@line 2355
 $vararg_buffer = sp; //@line 2356
 $2 = HEAP32[$0 + 40 >> 2] | 0; //@line 2358
 if (!$2) {
  $$0 = 0; //@line 2361
  STACKTOP = sp; //@line 2362
  return $$0 | 0; //@line 2362
 }
 if (HEAP8[$0 >> 0] | 0) {
  $$0 = $0; //@line 2367
  STACKTOP = sp; //@line 2368
  return $$0 | 0; //@line 2368
 }
 switch ($2 | 0) {
 case 1:
  {
   $11 = HEAPU8[$0 + 45 >> 0] | 0; //@line 2377
   $14 = HEAPU8[$0 + 46 >> 0] | 0; //@line 2380
   $17 = HEAPU8[$0 + 47 >> 0] | 0; //@line 2383
   HEAP32[$vararg_buffer >> 2] = HEAPU8[$0 + 44 >> 0]; //@line 2384
   HEAP32[$vararg_buffer + 4 >> 2] = $11; //@line 2386
   HEAP32[$vararg_buffer + 8 >> 2] = $14; //@line 2388
   HEAP32[$vararg_buffer + 12 >> 2] = $17; //@line 2390
   _sprintf($0, 3158, $vararg_buffer) | 0; //@line 2391
   $$0 = $0; //@line 2392
   STACKTOP = sp; //@line 2393
   return $$0 | 0; //@line 2393
  }
 case 2:
  {
   $23 = HEAPU8[$0 + 45 >> 0] | 0; //@line 2402
   HEAP32[$vararg_buffer4 >> 2] = HEAPU8[$0 + 44 >> 0]; //@line 2403
   HEAP32[$vararg_buffer4 + 4 >> 2] = $23; //@line 2405
   _sprintf($0, 3170, $vararg_buffer4) | 0; //@line 2406
   HEAP8[$0 + 4 >> 0] = 58; //@line 2408
   $31 = HEAPU8[$0 + 47 >> 0] | 0; //@line 2415
   HEAP32[$vararg_buffer8 >> 2] = HEAPU8[$0 + 46 >> 0]; //@line 2416
   HEAP32[$vararg_buffer8 + 4 >> 2] = $31; //@line 2418
   _sprintf($0 + 5 | 0, 3170, $vararg_buffer8) | 0; //@line 2419
   HEAP8[$0 + 9 >> 0] = 58; //@line 2421
   $39 = HEAPU8[$0 + 49 >> 0] | 0; //@line 2428
   HEAP32[$vararg_buffer12 >> 2] = HEAPU8[$0 + 48 >> 0]; //@line 2429
   HEAP32[$vararg_buffer12 + 4 >> 2] = $39; //@line 2431
   _sprintf($0 + 10 | 0, 3170, $vararg_buffer12) | 0; //@line 2432
   HEAP8[$0 + 14 >> 0] = 58; //@line 2434
   $47 = HEAPU8[$0 + 51 >> 0] | 0; //@line 2441
   HEAP32[$vararg_buffer16 >> 2] = HEAPU8[$0 + 50 >> 0]; //@line 2442
   HEAP32[$vararg_buffer16 + 4 >> 2] = $47; //@line 2444
   _sprintf($0 + 15 | 0, 3170, $vararg_buffer16) | 0; //@line 2445
   HEAP8[$0 + 19 >> 0] = 58; //@line 2447
   $55 = HEAPU8[$0 + 53 >> 0] | 0; //@line 2454
   HEAP32[$vararg_buffer20 >> 2] = HEAPU8[$0 + 52 >> 0]; //@line 2455
   HEAP32[$vararg_buffer20 + 4 >> 2] = $55; //@line 2457
   _sprintf($0 + 20 | 0, 3170, $vararg_buffer20) | 0; //@line 2458
   HEAP8[$0 + 24 >> 0] = 58; //@line 2460
   $63 = HEAPU8[$0 + 55 >> 0] | 0; //@line 2467
   HEAP32[$vararg_buffer24 >> 2] = HEAPU8[$0 + 54 >> 0]; //@line 2468
   HEAP32[$vararg_buffer24 + 4 >> 2] = $63; //@line 2470
   _sprintf($0 + 25 | 0, 3170, $vararg_buffer24) | 0; //@line 2471
   HEAP8[$0 + 29 >> 0] = 58; //@line 2473
   $71 = HEAPU8[$0 + 57 >> 0] | 0; //@line 2480
   HEAP32[$vararg_buffer28 >> 2] = HEAPU8[$0 + 56 >> 0]; //@line 2481
   HEAP32[$vararg_buffer28 + 4 >> 2] = $71; //@line 2483
   _sprintf($0 + 30 | 0, 3170, $vararg_buffer28) | 0; //@line 2484
   HEAP8[$0 + 34 >> 0] = 58; //@line 2486
   $79 = HEAPU8[$0 + 59 >> 0] | 0; //@line 2493
   HEAP32[$vararg_buffer32 >> 2] = HEAPU8[$0 + 58 >> 0]; //@line 2494
   HEAP32[$vararg_buffer32 + 4 >> 2] = $79; //@line 2496
   _sprintf($0 + 35 | 0, 3170, $vararg_buffer32) | 0; //@line 2497
   HEAP8[$0 + 39 >> 0] = 0; //@line 2499
   $$0 = $0; //@line 2500
   STACKTOP = sp; //@line 2501
   return $$0 | 0; //@line 2501
  }
 default:
  {
   $$0 = $0; //@line 2505
   STACKTOP = sp; //@line 2506
   return $$0 | 0; //@line 2506
  }
 }
 return 0; //@line 2509
}
function _scanexp($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0 = 0, $$04860 = 0, $$049 = 0, $$1$be = 0, $$159 = 0, $$2$be = 0, $$2$lcssa = 0, $$254 = 0, $$3$be = 0, $100 = 0, $101 = 0, $11 = 0, $13 = 0, $14 = 0, $2 = 0, $22 = 0, $3 = 0, $38 = 0, $4 = 0, $50 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $61 = 0, $63 = 0, $64 = 0, $65 = 0, $80 = 0, $93 = 0, $94 = 0, $95 = 0, $96 = 0;
 $2 = $0 + 4 | 0; //@line 2426
 $3 = HEAP32[$2 >> 2] | 0; //@line 2427
 $4 = $0 + 100 | 0; //@line 2428
 if ($3 >>> 0 < (HEAP32[$4 >> 2] | 0) >>> 0) {
  HEAP32[$2 >> 2] = $3 + 1; //@line 2433
  $11 = HEAPU8[$3 >> 0] | 0; //@line 2436
 } else {
  $11 = ___shgetc($0) | 0; //@line 2439
 }
 switch ($11 | 0) {
 case 43:
 case 45:
  {
   $13 = ($11 | 0) == 45 & 1; //@line 2444
   $14 = HEAP32[$2 >> 2] | 0; //@line 2445
   if ($14 >>> 0 < (HEAP32[$4 >> 2] | 0) >>> 0) {
    HEAP32[$2 >> 2] = $14 + 1; //@line 2450
    $22 = HEAPU8[$14 >> 0] | 0; //@line 2453
   } else {
    $22 = ___shgetc($0) | 0; //@line 2456
   }
   if (($1 | 0) != 0 & ($22 + -48 | 0) >>> 0 > 9) {
    if (!(HEAP32[$4 >> 2] | 0)) {
     $$0 = $13; //@line 2466
     $$049 = $22; //@line 2466
    } else {
     HEAP32[$2 >> 2] = (HEAP32[$2 >> 2] | 0) + -1; //@line 2470
     $$0 = $13; //@line 2471
     $$049 = $22; //@line 2471
    }
   } else {
    $$0 = $13; //@line 2474
    $$049 = $22; //@line 2474
   }
   break;
  }
 default:
  {
   $$0 = 0; //@line 2479
   $$049 = $11; //@line 2479
  }
 }
 if (($$049 + -48 | 0) >>> 0 > 9) {
  if (!(HEAP32[$4 >> 2] | 0)) {
   $100 = -2147483648; //@line 2488
   $101 = 0; //@line 2488
  } else {
   HEAP32[$2 >> 2] = (HEAP32[$2 >> 2] | 0) + -1; //@line 2492
   $100 = -2147483648; //@line 2493
   $101 = 0; //@line 2493
  }
 } else {
  $$04860 = 0; //@line 2496
  $$159 = $$049; //@line 2496
  while (1) {
   $$04860 = $$159 + -48 + ($$04860 * 10 | 0) | 0; //@line 2500
   $38 = HEAP32[$2 >> 2] | 0; //@line 2501
   if ($38 >>> 0 < (HEAP32[$4 >> 2] | 0) >>> 0) {
    HEAP32[$2 >> 2] = $38 + 1; //@line 2506
    $$1$be = HEAPU8[$38 >> 0] | 0; //@line 2509
   } else {
    $$1$be = ___shgetc($0) | 0; //@line 2512
   }
   if (!(($$1$be + -48 | 0) >>> 0 < 10 & ($$04860 | 0) < 214748364)) {
    break;
   } else {
    $$159 = $$1$be; //@line 2519
   }
  }
  $50 = (($$04860 | 0) < 0) << 31 >> 31; //@line 2525
  if (($$1$be + -48 | 0) >>> 0 < 10) {
   $$254 = $$1$be; //@line 2529
   $55 = $$04860; //@line 2529
   $56 = $50; //@line 2529
   while (1) {
    $57 = ___muldi3($55 | 0, $56 | 0, 10, 0) | 0; //@line 2531
    $58 = tempRet0; //@line 2532
    $61 = _i64Add($$254 | 0, (($$254 | 0) < 0) << 31 >> 31 | 0, -48, -1) | 0; //@line 2535
    $63 = _i64Add($61 | 0, tempRet0 | 0, $57 | 0, $58 | 0) | 0; //@line 2537
    $64 = tempRet0; //@line 2538
    $65 = HEAP32[$2 >> 2] | 0; //@line 2539
    if ($65 >>> 0 < (HEAP32[$4 >> 2] | 0) >>> 0) {
     HEAP32[$2 >> 2] = $65 + 1; //@line 2544
     $$2$be = HEAPU8[$65 >> 0] | 0; //@line 2547
    } else {
     $$2$be = ___shgetc($0) | 0; //@line 2550
    }
    if (($$2$be + -48 | 0) >>> 0 < 10 & (($64 | 0) < 21474836 | ($64 | 0) == 21474836 & $63 >>> 0 < 2061584302)) {
     $$254 = $$2$be; //@line 2561
     $55 = $63; //@line 2561
     $56 = $64; //@line 2561
    } else {
     $$2$lcssa = $$2$be; //@line 2563
     $94 = $63; //@line 2563
     $95 = $64; //@line 2563
     break;
    }
   }
  } else {
   $$2$lcssa = $$1$be; //@line 2568
   $94 = $$04860; //@line 2568
   $95 = $50; //@line 2568
  }
  if (($$2$lcssa + -48 | 0) >>> 0 < 10) {
   do {
    $80 = HEAP32[$2 >> 2] | 0; //@line 2574
    if ($80 >>> 0 < (HEAP32[$4 >> 2] | 0) >>> 0) {
     HEAP32[$2 >> 2] = $80 + 1; //@line 2579
     $$3$be = HEAPU8[$80 >> 0] | 0; //@line 2582
    } else {
     $$3$be = ___shgetc($0) | 0; //@line 2585
    }
   } while (($$3$be + -48 | 0) >>> 0 < 10);
  }
  if (HEAP32[$4 >> 2] | 0) {
   HEAP32[$2 >> 2] = (HEAP32[$2 >> 2] | 0) + -1; //@line 2599
  }
  $93 = ($$0 | 0) != 0; //@line 2601
  $96 = _i64Subtract(0, 0, $94 | 0, $95 | 0) | 0; //@line 2602
  $100 = $93 ? tempRet0 : $95; //@line 2606
  $101 = $93 ? $96 : $94; //@line 2606
 }
 tempRet0 = $100; //@line 2608
 return $101 | 0; //@line 2609
}
function __ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_3($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $15 = 0, $18 = 0, $2 = 0, $21 = 0, $24 = 0, $36 = 0, $37 = 0, $38 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx = 0, $ReallocAsyncCtx2 = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 9061
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 9063
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 9065
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 9067
 $8 = HEAP8[$0 + 16 >> 0] & 1; //@line 9070
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 9072
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 9074
 $15 = $12 + 24 | 0; //@line 9077
 do {
  if ((HEAP32[$0 + 28 >> 2] | 0) > 1) {
   $18 = HEAP32[$12 + 8 >> 2] | 0; //@line 9082
   if (!($18 & 2)) {
    $21 = $2 + 36 | 0; //@line 9086
    if ((HEAP32[$21 >> 2] | 0) != 1) {
     if (!($18 & 1)) {
      $38 = $2 + 54 | 0; //@line 9093
      if (HEAP8[$38 >> 0] | 0) {
       break;
      }
      if ((HEAP32[$21 >> 2] | 0) == 1) {
       break;
      }
      $ReallocAsyncCtx = _emscripten_realloc_async_context(36) | 0; //@line 9104
      __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($15, $2, $4, $6, $8); //@line 9105
      if (!___async) {
       ___async_unwind = 0; //@line 9108
      }
      HEAP32[$ReallocAsyncCtx >> 2] = 168; //@line 9110
      HEAP32[$ReallocAsyncCtx + 4 >> 2] = $15; //@line 9112
      HEAP32[$ReallocAsyncCtx + 8 >> 2] = $10; //@line 9114
      HEAP32[$ReallocAsyncCtx + 12 >> 2] = $38; //@line 9116
      HEAP32[$ReallocAsyncCtx + 16 >> 2] = $21; //@line 9118
      HEAP32[$ReallocAsyncCtx + 20 >> 2] = $2; //@line 9120
      HEAP32[$ReallocAsyncCtx + 24 >> 2] = $4; //@line 9122
      HEAP32[$ReallocAsyncCtx + 28 >> 2] = $6; //@line 9124
      HEAP8[$ReallocAsyncCtx + 32 >> 0] = $8 & 1; //@line 9127
      sp = STACKTOP; //@line 9128
      return;
     }
     $36 = $2 + 24 | 0; //@line 9131
     $37 = $2 + 54 | 0; //@line 9132
     if (HEAP8[$37 >> 0] | 0) {
      break;
     }
     if ((HEAP32[$21 >> 2] | 0) == 1) {
      if ((HEAP32[$36 >> 2] | 0) == 1) {
       break;
      }
     }
     $ReallocAsyncCtx2 = _emscripten_realloc_async_context(40) | 0; //@line 9147
     __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($15, $2, $4, $6, $8); //@line 9148
     if (!___async) {
      ___async_unwind = 0; //@line 9151
     }
     HEAP32[$ReallocAsyncCtx2 >> 2] = 167; //@line 9153
     HEAP32[$ReallocAsyncCtx2 + 4 >> 2] = $15; //@line 9155
     HEAP32[$ReallocAsyncCtx2 + 8 >> 2] = $10; //@line 9157
     HEAP32[$ReallocAsyncCtx2 + 12 >> 2] = $37; //@line 9159
     HEAP32[$ReallocAsyncCtx2 + 16 >> 2] = $21; //@line 9161
     HEAP32[$ReallocAsyncCtx2 + 20 >> 2] = $36; //@line 9163
     HEAP32[$ReallocAsyncCtx2 + 24 >> 2] = $2; //@line 9165
     HEAP32[$ReallocAsyncCtx2 + 28 >> 2] = $4; //@line 9167
     HEAP32[$ReallocAsyncCtx2 + 32 >> 2] = $6; //@line 9169
     HEAP8[$ReallocAsyncCtx2 + 36 >> 0] = $8 & 1; //@line 9172
     sp = STACKTOP; //@line 9173
     return;
    }
   }
   $24 = $2 + 54 | 0; //@line 9177
   if (!(HEAP8[$24 >> 0] | 0)) {
    $ReallocAsyncCtx3 = _emscripten_realloc_async_context(32) | 0; //@line 9181
    __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($15, $2, $4, $6, $8); //@line 9182
    if (!___async) {
     ___async_unwind = 0; //@line 9185
    }
    HEAP32[$ReallocAsyncCtx3 >> 2] = 166; //@line 9187
    HEAP32[$ReallocAsyncCtx3 + 4 >> 2] = $15; //@line 9189
    HEAP32[$ReallocAsyncCtx3 + 8 >> 2] = $10; //@line 9191
    HEAP32[$ReallocAsyncCtx3 + 12 >> 2] = $24; //@line 9193
    HEAP32[$ReallocAsyncCtx3 + 16 >> 2] = $2; //@line 9195
    HEAP32[$ReallocAsyncCtx3 + 20 >> 2] = $4; //@line 9197
    HEAP32[$ReallocAsyncCtx3 + 24 >> 2] = $6; //@line 9199
    HEAP8[$ReallocAsyncCtx3 + 28 >> 0] = $8 & 1; //@line 9202
    sp = STACKTOP; //@line 9203
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
 sp = STACKTOP; //@line 8039
 if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, $5) | 0) {
  __ZNK10__cxxabiv117__class_type_info29process_static_type_above_dstEPNS_19__dynamic_cast_infoEPKvS4_i(0, $1, $2, $3, $4); //@line 8044
 } else {
  $9 = $1 + 52 | 0; //@line 8046
  $10 = HEAP8[$9 >> 0] | 0; //@line 8047
  $11 = $1 + 53 | 0; //@line 8048
  $12 = HEAP8[$11 >> 0] | 0; //@line 8049
  $15 = HEAP32[$0 + 12 >> 2] | 0; //@line 8052
  $16 = $0 + 16 + ($15 << 3) | 0; //@line 8053
  HEAP8[$9 >> 0] = 0; //@line 8054
  HEAP8[$11 >> 0] = 0; //@line 8055
  $AsyncCtx3 = _emscripten_alloc_async_context(52, sp) | 0; //@line 8056
  __ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($0 + 16 | 0, $1, $2, $3, $4, $5); //@line 8057
  if (___async) {
   HEAP32[$AsyncCtx3 >> 2] = 162; //@line 8060
   HEAP32[$AsyncCtx3 + 4 >> 2] = $15; //@line 8062
   HEAP32[$AsyncCtx3 + 8 >> 2] = $0; //@line 8064
   HEAP32[$AsyncCtx3 + 12 >> 2] = $1; //@line 8066
   HEAP8[$AsyncCtx3 + 16 >> 0] = $10; //@line 8068
   HEAP32[$AsyncCtx3 + 20 >> 2] = $9; //@line 8070
   HEAP8[$AsyncCtx3 + 24 >> 0] = $12; //@line 8072
   HEAP32[$AsyncCtx3 + 28 >> 2] = $11; //@line 8074
   HEAP32[$AsyncCtx3 + 32 >> 2] = $2; //@line 8076
   HEAP32[$AsyncCtx3 + 36 >> 2] = $3; //@line 8078
   HEAP32[$AsyncCtx3 + 40 >> 2] = $4; //@line 8080
   HEAP8[$AsyncCtx3 + 44 >> 0] = $5 & 1; //@line 8083
   HEAP32[$AsyncCtx3 + 48 >> 2] = $16; //@line 8085
   sp = STACKTOP; //@line 8086
   return;
  }
  _emscripten_free_async_context($AsyncCtx3 | 0); //@line 8089
  L7 : do {
   if (($15 | 0) > 1) {
    $31 = $1 + 24 | 0; //@line 8094
    $32 = $0 + 8 | 0; //@line 8095
    $33 = $1 + 54 | 0; //@line 8096
    $$0 = $0 + 24 | 0; //@line 8097
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
     HEAP8[$9 >> 0] = 0; //@line 8130
     HEAP8[$11 >> 0] = 0; //@line 8131
     $AsyncCtx = _emscripten_alloc_async_context(60, sp) | 0; //@line 8132
     __ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($$0, $1, $2, $3, $4, $5); //@line 8133
     if (___async) {
      break;
     }
     _emscripten_free_async_context($AsyncCtx | 0); //@line 8138
     $62 = $$0 + 8 | 0; //@line 8139
     if ($62 >>> 0 < $16 >>> 0) {
      $$0 = $62; //@line 8142
     } else {
      break L7;
     }
    }
    HEAP32[$AsyncCtx >> 2] = 163; //@line 8147
    HEAP32[$AsyncCtx + 4 >> 2] = $$0; //@line 8149
    HEAP32[$AsyncCtx + 8 >> 2] = $16; //@line 8151
    HEAP32[$AsyncCtx + 12 >> 2] = $33; //@line 8153
    HEAP8[$AsyncCtx + 16 >> 0] = $10; //@line 8155
    HEAP32[$AsyncCtx + 20 >> 2] = $9; //@line 8157
    HEAP8[$AsyncCtx + 24 >> 0] = $12; //@line 8159
    HEAP32[$AsyncCtx + 28 >> 2] = $11; //@line 8161
    HEAP32[$AsyncCtx + 32 >> 2] = $31; //@line 8163
    HEAP32[$AsyncCtx + 36 >> 2] = $32; //@line 8165
    HEAP32[$AsyncCtx + 40 >> 2] = $1; //@line 8167
    HEAP32[$AsyncCtx + 44 >> 2] = $2; //@line 8169
    HEAP32[$AsyncCtx + 48 >> 2] = $3; //@line 8171
    HEAP32[$AsyncCtx + 52 >> 2] = $4; //@line 8173
    HEAP8[$AsyncCtx + 56 >> 0] = $5 & 1; //@line 8176
    sp = STACKTOP; //@line 8177
    return;
   }
  } while (0);
  HEAP8[$9 >> 0] = $10; //@line 8181
  HEAP8[$11 >> 0] = $12; //@line 8182
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
      $9 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 4300
      $10 = HEAP32[$9 >> 2] | 0; //@line 4301
      HEAP32[$2 >> 2] = $9 + 4; //@line 4303
      HEAP32[$0 >> 2] = $10; //@line 4304
      break L1;
      break;
     }
    case 10:
     {
      $16 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 4320
      $17 = HEAP32[$16 >> 2] | 0; //@line 4321
      HEAP32[$2 >> 2] = $16 + 4; //@line 4323
      $20 = $0; //@line 4326
      HEAP32[$20 >> 2] = $17; //@line 4328
      HEAP32[$20 + 4 >> 2] = (($17 | 0) < 0) << 31 >> 31; //@line 4331
      break L1;
      break;
     }
    case 11:
     {
      $29 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 4347
      $30 = HEAP32[$29 >> 2] | 0; //@line 4348
      HEAP32[$2 >> 2] = $29 + 4; //@line 4350
      $31 = $0; //@line 4351
      HEAP32[$31 >> 2] = $30; //@line 4353
      HEAP32[$31 + 4 >> 2] = 0; //@line 4356
      break L1;
      break;
     }
    case 12:
     {
      $40 = (HEAP32[$2 >> 2] | 0) + (8 - 1) & ~(8 - 1); //@line 4372
      $41 = $40; //@line 4373
      $43 = HEAP32[$41 >> 2] | 0; //@line 4375
      $46 = HEAP32[$41 + 4 >> 2] | 0; //@line 4378
      HEAP32[$2 >> 2] = $40 + 8; //@line 4380
      $47 = $0; //@line 4381
      HEAP32[$47 >> 2] = $43; //@line 4383
      HEAP32[$47 + 4 >> 2] = $46; //@line 4386
      break L1;
      break;
     }
    case 13:
     {
      $56 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 4402
      $57 = HEAP32[$56 >> 2] | 0; //@line 4403
      HEAP32[$2 >> 2] = $56 + 4; //@line 4405
      $59 = ($57 & 65535) << 16 >> 16; //@line 4407
      $62 = $0; //@line 4410
      HEAP32[$62 >> 2] = $59; //@line 4412
      HEAP32[$62 + 4 >> 2] = (($59 | 0) < 0) << 31 >> 31; //@line 4415
      break L1;
      break;
     }
    case 14:
     {
      $71 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 4431
      $72 = HEAP32[$71 >> 2] | 0; //@line 4432
      HEAP32[$2 >> 2] = $71 + 4; //@line 4434
      $73 = $0; //@line 4436
      HEAP32[$73 >> 2] = $72 & 65535; //@line 4438
      HEAP32[$73 + 4 >> 2] = 0; //@line 4441
      break L1;
      break;
     }
    case 15:
     {
      $82 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 4457
      $83 = HEAP32[$82 >> 2] | 0; //@line 4458
      HEAP32[$2 >> 2] = $82 + 4; //@line 4460
      $85 = ($83 & 255) << 24 >> 24; //@line 4462
      $88 = $0; //@line 4465
      HEAP32[$88 >> 2] = $85; //@line 4467
      HEAP32[$88 + 4 >> 2] = (($85 | 0) < 0) << 31 >> 31; //@line 4470
      break L1;
      break;
     }
    case 16:
     {
      $97 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 4486
      $98 = HEAP32[$97 >> 2] | 0; //@line 4487
      HEAP32[$2 >> 2] = $97 + 4; //@line 4489
      $99 = $0; //@line 4491
      HEAP32[$99 >> 2] = $98 & 255; //@line 4493
      HEAP32[$99 + 4 >> 2] = 0; //@line 4496
      break L1;
      break;
     }
    case 17:
     {
      $108 = (HEAP32[$2 >> 2] | 0) + (8 - 1) & ~(8 - 1); //@line 4512
      $109 = +HEAPF64[$108 >> 3]; //@line 4513
      HEAP32[$2 >> 2] = $108 + 8; //@line 4515
      HEAPF64[$0 >> 3] = $109; //@line 4516
      break L1;
      break;
     }
    case 18:
     {
      $115 = (HEAP32[$2 >> 2] | 0) + (8 - 1) & ~(8 - 1); //@line 4532
      $116 = +HEAPF64[$115 >> 3]; //@line 4533
      HEAP32[$2 >> 2] = $115 + 8; //@line 4535
      HEAPF64[$0 >> 3] = $116; //@line 4536
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
function __ZN9TCPSocket4sendEPKvj__async_cb($0) {
 $0 = $0 | 0;
 var $$024 = 0, $$1 = 0, $$2 = 0, $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $2 = 0, $20 = 0, $23 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $37 = 0, $4 = 0, $6 = 0, $8 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 12394
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 12396
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 12398
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 12400
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 12402
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 12404
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 12406
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 12408
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 12410
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 12412
 if (($AsyncRetVal | 0) > -1) {
  $37 = $AsyncRetVal + $2 | 0; //@line 12415
  if ($37 >>> 0 < $4 >>> 0) {
   $$1 = $37; //@line 12418
   label = 8; //@line 12419
  } else {
   $$024 = $AsyncRetVal; //@line 12421
   $$2 = $37; //@line 12421
  }
 } else {
  $$1 = $2; //@line 12424
  label = 8; //@line 12425
 }
 if ((label | 0) == 8) {
  if (!(HEAP32[$6 >> 2] | 0)) {
   $$024 = $AsyncRetVal; //@line 12431
   $$2 = $$1; //@line 12431
  } else {
   if (($AsyncRetVal | 0) != -3001 & ($AsyncRetVal | 0) < 0) {
    $$024 = $AsyncRetVal; //@line 12437
    $$2 = $$1; //@line 12437
   } else {
    $18 = HEAP32[$10 >> 2] | 0; //@line 12439
    if (!$18) {
     $$024 = -3005; //@line 12442
     $$2 = $$1; //@line 12442
    } else {
     HEAP32[$12 >> 2] = 0; //@line 12444
     $20 = HEAP32[$14 >> 2] | 0; //@line 12445
     $23 = HEAP32[(HEAP32[$20 >> 2] | 0) + 52 >> 2] | 0; //@line 12448
     $ReallocAsyncCtx = _emscripten_realloc_async_context(36) | 0; //@line 12451
     $26 = FUNCTION_TABLE_iiiii[$23 & 15]($20, $18, $16 + $$1 | 0, $4 - $$1 | 0) | 0; //@line 12452
     if (___async) {
      HEAP32[$ReallocAsyncCtx >> 2] = 81; //@line 12455
      $27 = $ReallocAsyncCtx + 4 | 0; //@line 12456
      HEAP32[$27 >> 2] = $$1; //@line 12457
      $28 = $ReallocAsyncCtx + 8 | 0; //@line 12458
      HEAP32[$28 >> 2] = $4; //@line 12459
      $29 = $ReallocAsyncCtx + 12 | 0; //@line 12460
      HEAP32[$29 >> 2] = $6; //@line 12461
      $30 = $ReallocAsyncCtx + 16 | 0; //@line 12462
      HEAP32[$30 >> 2] = $8; //@line 12463
      $31 = $ReallocAsyncCtx + 20 | 0; //@line 12464
      HEAP32[$31 >> 2] = $10; //@line 12465
      $32 = $ReallocAsyncCtx + 24 | 0; //@line 12466
      HEAP32[$32 >> 2] = $12; //@line 12467
      $33 = $ReallocAsyncCtx + 28 | 0; //@line 12468
      HEAP32[$33 >> 2] = $14; //@line 12469
      $34 = $ReallocAsyncCtx + 32 | 0; //@line 12470
      HEAP32[$34 >> 2] = $16; //@line 12471
      sp = STACKTOP; //@line 12472
      return;
     }
     HEAP32[___async_retval >> 2] = $26; //@line 12476
     ___async_unwind = 0; //@line 12477
     HEAP32[$ReallocAsyncCtx >> 2] = 81; //@line 12478
     $27 = $ReallocAsyncCtx + 4 | 0; //@line 12479
     HEAP32[$27 >> 2] = $$1; //@line 12480
     $28 = $ReallocAsyncCtx + 8 | 0; //@line 12481
     HEAP32[$28 >> 2] = $4; //@line 12482
     $29 = $ReallocAsyncCtx + 12 | 0; //@line 12483
     HEAP32[$29 >> 2] = $6; //@line 12484
     $30 = $ReallocAsyncCtx + 16 | 0; //@line 12485
     HEAP32[$30 >> 2] = $8; //@line 12486
     $31 = $ReallocAsyncCtx + 20 | 0; //@line 12487
     HEAP32[$31 >> 2] = $10; //@line 12488
     $32 = $ReallocAsyncCtx + 24 | 0; //@line 12489
     HEAP32[$32 >> 2] = $12; //@line 12490
     $33 = $ReallocAsyncCtx + 28 | 0; //@line 12491
     HEAP32[$33 >> 2] = $14; //@line 12492
     $34 = $ReallocAsyncCtx + 32 | 0; //@line 12493
     HEAP32[$34 >> 2] = $16; //@line 12494
     sp = STACKTOP; //@line 12495
     return;
    }
   }
  }
 }
 HEAP8[$8 >> 0] = 0; //@line 12501
 HEAP32[___async_retval >> 2] = ($$024 | 0) < 1 & ($$024 | 0) != -3001 ? $$024 : ($$2 | 0) == 0 ? -3001 : $$2; //@line 12509
 return;
}
function _vfprintf($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$ = 0, $$0 = 0, $$1 = 0, $13 = 0, $14 = 0, $19 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $28 = 0, $29 = 0, $3 = 0, $32 = 0, $4 = 0, $43 = 0, $5 = 0, $51 = 0, $6 = 0, $AsyncCtx = 0, dest = 0, sp = 0, stop = 0;
 sp = STACKTOP; //@line 3200
 STACKTOP = STACKTOP + 224 | 0; //@line 3201
 $3 = sp + 120 | 0; //@line 3202
 $4 = sp + 80 | 0; //@line 3203
 $5 = sp; //@line 3204
 $6 = sp + 136 | 0; //@line 3205
 dest = $4; //@line 3206
 stop = dest + 40 | 0; //@line 3206
 do {
  HEAP32[dest >> 2] = 0; //@line 3206
  dest = dest + 4 | 0; //@line 3206
 } while ((dest | 0) < (stop | 0));
 HEAP32[$3 >> 2] = HEAP32[$2 >> 2]; //@line 3208
 if ((_printf_core(0, $1, $3, $5, $4) | 0) < 0) {
  $$0 = -1; //@line 3212
 } else {
  if ((HEAP32[$0 + 76 >> 2] | 0) > -1) {
   $43 = ___lockfile($0) | 0; //@line 3219
  } else {
   $43 = 0; //@line 3221
  }
  $13 = HEAP32[$0 >> 2] | 0; //@line 3223
  $14 = $13 & 32; //@line 3224
  if ((HEAP8[$0 + 74 >> 0] | 0) < 1) {
   HEAP32[$0 >> 2] = $13 & -33; //@line 3230
  }
  $19 = $0 + 48 | 0; //@line 3232
  do {
   if (!(HEAP32[$19 >> 2] | 0)) {
    $23 = $0 + 44 | 0; //@line 3237
    $24 = HEAP32[$23 >> 2] | 0; //@line 3238
    HEAP32[$23 >> 2] = $6; //@line 3239
    $25 = $0 + 28 | 0; //@line 3240
    HEAP32[$25 >> 2] = $6; //@line 3241
    $26 = $0 + 20 | 0; //@line 3242
    HEAP32[$26 >> 2] = $6; //@line 3243
    HEAP32[$19 >> 2] = 80; //@line 3244
    $28 = $0 + 16 | 0; //@line 3246
    HEAP32[$28 >> 2] = $6 + 80; //@line 3247
    $29 = _printf_core($0, $1, $3, $5, $4) | 0; //@line 3248
    if (!$24) {
     $$1 = $29; //@line 3251
    } else {
     $32 = HEAP32[$0 + 36 >> 2] | 0; //@line 3254
     $AsyncCtx = _emscripten_alloc_async_context(64, sp) | 0; //@line 3255
     FUNCTION_TABLE_iiii[$32 & 15]($0, 0, 0) | 0; //@line 3256
     if (___async) {
      HEAP32[$AsyncCtx >> 2] = 138; //@line 3259
      HEAP32[$AsyncCtx + 4 >> 2] = $26; //@line 3261
      HEAP32[$AsyncCtx + 8 >> 2] = $29; //@line 3263
      HEAP32[$AsyncCtx + 12 >> 2] = $24; //@line 3265
      HEAP32[$AsyncCtx + 16 >> 2] = $23; //@line 3267
      HEAP32[$AsyncCtx + 20 >> 2] = $19; //@line 3269
      HEAP32[$AsyncCtx + 24 >> 2] = $28; //@line 3271
      HEAP32[$AsyncCtx + 28 >> 2] = $25; //@line 3273
      HEAP32[$AsyncCtx + 32 >> 2] = $0; //@line 3275
      HEAP32[$AsyncCtx + 36 >> 2] = $14; //@line 3277
      HEAP32[$AsyncCtx + 40 >> 2] = $43; //@line 3279
      HEAP32[$AsyncCtx + 44 >> 2] = $0; //@line 3281
      HEAP32[$AsyncCtx + 48 >> 2] = $6; //@line 3283
      HEAP32[$AsyncCtx + 52 >> 2] = $5; //@line 3285
      HEAP32[$AsyncCtx + 56 >> 2] = $4; //@line 3287
      HEAP32[$AsyncCtx + 60 >> 2] = $3; //@line 3289
      sp = STACKTOP; //@line 3290
      STACKTOP = sp; //@line 3291
      return 0; //@line 3291
     } else {
      _emscripten_free_async_context($AsyncCtx | 0); //@line 3293
      $$ = (HEAP32[$26 >> 2] | 0) == 0 ? -1 : $29; //@line 3296
      HEAP32[$23 >> 2] = $24; //@line 3297
      HEAP32[$19 >> 2] = 0; //@line 3298
      HEAP32[$28 >> 2] = 0; //@line 3299
      HEAP32[$25 >> 2] = 0; //@line 3300
      HEAP32[$26 >> 2] = 0; //@line 3301
      $$1 = $$; //@line 3302
      break;
     }
    }
   } else {
    $$1 = _printf_core($0, $1, $3, $5, $4) | 0; //@line 3308
   }
  } while (0);
  $51 = HEAP32[$0 >> 2] | 0; //@line 3311
  HEAP32[$0 >> 2] = $51 | $14; //@line 3316
  if ($43 | 0) {
   ___unlockfile($0); //@line 3319
  }
  $$0 = ($51 & 32 | 0) == 0 ? $$1 : -1; //@line 3321
 }
 STACKTOP = sp; //@line 3323
 return $$0 | 0; //@line 3323
}
function ___dynamic_cast($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $$0 = 0, $10 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $24 = 0, $30 = 0, $33 = 0, $4 = 0, $5 = 0, $8 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, dest = 0, sp = 0, stop = 0;
 sp = STACKTOP; //@line 7574
 STACKTOP = STACKTOP + 64 | 0; //@line 7575
 $4 = sp; //@line 7576
 $5 = HEAP32[$0 >> 2] | 0; //@line 7577
 $8 = $0 + (HEAP32[$5 + -8 >> 2] | 0) | 0; //@line 7580
 $10 = HEAP32[$5 + -4 >> 2] | 0; //@line 7582
 HEAP32[$4 >> 2] = $2; //@line 7583
 HEAP32[$4 + 4 >> 2] = $0; //@line 7585
 HEAP32[$4 + 8 >> 2] = $1; //@line 7587
 HEAP32[$4 + 12 >> 2] = $3; //@line 7589
 $14 = $4 + 16 | 0; //@line 7590
 $15 = $4 + 20 | 0; //@line 7591
 $16 = $4 + 24 | 0; //@line 7592
 $17 = $4 + 28 | 0; //@line 7593
 $18 = $4 + 32 | 0; //@line 7594
 $19 = $4 + 40 | 0; //@line 7595
 dest = $14; //@line 7596
 stop = dest + 36 | 0; //@line 7596
 do {
  HEAP32[dest >> 2] = 0; //@line 7596
  dest = dest + 4 | 0; //@line 7596
 } while ((dest | 0) < (stop | 0));
 HEAP16[$14 + 36 >> 1] = 0; //@line 7596
 HEAP8[$14 + 38 >> 0] = 0; //@line 7596
 L1 : do {
  if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($10, $2, 0) | 0) {
   HEAP32[$4 + 48 >> 2] = 1; //@line 7601
   $24 = HEAP32[(HEAP32[$10 >> 2] | 0) + 20 >> 2] | 0; //@line 7604
   $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 7605
   FUNCTION_TABLE_viiiiii[$24 & 3]($10, $4, $8, $8, 1, 0); //@line 7606
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 154; //@line 7609
    HEAP32[$AsyncCtx + 4 >> 2] = $16; //@line 7611
    HEAP32[$AsyncCtx + 8 >> 2] = $8; //@line 7613
    HEAP32[$AsyncCtx + 12 >> 2] = $4; //@line 7615
    sp = STACKTOP; //@line 7616
    STACKTOP = sp; //@line 7617
    return 0; //@line 7617
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 7619
    $$0 = (HEAP32[$16 >> 2] | 0) == 1 ? $8 : 0; //@line 7623
    break;
   }
  } else {
   $30 = $4 + 36 | 0; //@line 7627
   $33 = HEAP32[(HEAP32[$10 >> 2] | 0) + 24 >> 2] | 0; //@line 7630
   $AsyncCtx3 = _emscripten_alloc_async_context(36, sp) | 0; //@line 7631
   FUNCTION_TABLE_viiiii[$33 & 3]($10, $4, $8, 1, 0); //@line 7632
   if (___async) {
    HEAP32[$AsyncCtx3 >> 2] = 155; //@line 7635
    HEAP32[$AsyncCtx3 + 4 >> 2] = $30; //@line 7637
    HEAP32[$AsyncCtx3 + 8 >> 2] = $4; //@line 7639
    HEAP32[$AsyncCtx3 + 12 >> 2] = $19; //@line 7641
    HEAP32[$AsyncCtx3 + 16 >> 2] = $17; //@line 7643
    HEAP32[$AsyncCtx3 + 20 >> 2] = $18; //@line 7645
    HEAP32[$AsyncCtx3 + 24 >> 2] = $15; //@line 7647
    HEAP32[$AsyncCtx3 + 28 >> 2] = $16; //@line 7649
    HEAP32[$AsyncCtx3 + 32 >> 2] = $14; //@line 7651
    sp = STACKTOP; //@line 7652
    STACKTOP = sp; //@line 7653
    return 0; //@line 7653
   }
   _emscripten_free_async_context($AsyncCtx3 | 0); //@line 7655
   switch (HEAP32[$30 >> 2] | 0) {
   case 0:
    {
     $$0 = (HEAP32[$19 >> 2] | 0) == 1 & (HEAP32[$17 >> 2] | 0) == 1 & (HEAP32[$18 >> 2] | 0) == 1 ? HEAP32[$15 >> 2] | 0 : 0; //@line 7669
     break L1;
     break;
    }
   case 1:
    {
     break;
    }
   default:
    {
     $$0 = 0; //@line 7677
     break L1;
    }
   }
   if ((HEAP32[$16 >> 2] | 0) != 1) {
    if (!((HEAP32[$19 >> 2] | 0) == 0 & (HEAP32[$17 >> 2] | 0) == 1 & (HEAP32[$18 >> 2] | 0) == 1)) {
     $$0 = 0; //@line 7693
     break;
    }
   }
   $$0 = HEAP32[$14 >> 2] | 0; //@line 7698
  }
 } while (0);
 STACKTOP = sp; //@line 7701
 return $$0 | 0; //@line 7701
}
function __ZN9TCPSocket7connectEPKct__async_cb_10($0) {
 $0 = $0 | 0;
 var $$0$off0$i$reg2mem$0 = 0, $$08$i = 0, $$expand_i1_val = 0, $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $2 = 0, $20 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $30 = 0, $31 = 0, $32 = 0, $4 = 0, $6 = 0, $8 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 9971
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 9973
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 9975
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 9977
 $8 = HEAP8[$0 + 16 >> 0] & 1; //@line 9980
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 9982
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 9984
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 9986
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 9988
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 9990
 if ((HEAP32[$2 >> 2] | 0) != 0 & ($AsyncRetVal | 1 | 0) == -3013) {
  $18 = HEAP32[$4 >> 2] | 0; //@line 9997
  if (!$18) {
   $$0$off0$i$reg2mem$0 = 1; //@line 10000
   $$08$i = -3005; //@line 10000
  } else {
   HEAP32[$12 >> 2] = 0; //@line 10002
   $20 = HEAP32[$14 >> 2] | 0; //@line 10003
   $23 = HEAP32[(HEAP32[$20 >> 2] | 0) + 44 >> 2] | 0; //@line 10006
   $ReallocAsyncCtx2 = _emscripten_realloc_async_context(36) | 0; //@line 10007
   $24 = FUNCTION_TABLE_iiii[$23 & 15]($20, $18, $16) | 0; //@line 10008
   if (___async) {
    HEAP32[$ReallocAsyncCtx2 >> 2] = 79; //@line 10011
    $25 = $ReallocAsyncCtx2 + 4 | 0; //@line 10012
    HEAP32[$25 >> 2] = $2; //@line 10013
    $26 = $ReallocAsyncCtx2 + 8 | 0; //@line 10014
    HEAP32[$26 >> 2] = $4; //@line 10015
    $27 = $ReallocAsyncCtx2 + 12 | 0; //@line 10016
    HEAP32[$27 >> 2] = $6; //@line 10017
    $28 = $ReallocAsyncCtx2 + 16 | 0; //@line 10018
    $$expand_i1_val = 1; //@line 10019
    HEAP8[$28 >> 0] = $$expand_i1_val; //@line 10020
    $29 = $ReallocAsyncCtx2 + 20 | 0; //@line 10021
    HEAP32[$29 >> 2] = $10; //@line 10022
    $30 = $ReallocAsyncCtx2 + 24 | 0; //@line 10023
    HEAP32[$30 >> 2] = $12; //@line 10024
    $31 = $ReallocAsyncCtx2 + 28 | 0; //@line 10025
    HEAP32[$31 >> 2] = $14; //@line 10026
    $32 = $ReallocAsyncCtx2 + 32 | 0; //@line 10027
    HEAP32[$32 >> 2] = $16; //@line 10028
    sp = STACKTOP; //@line 10029
    return;
   }
   HEAP32[___async_retval >> 2] = $24; //@line 10033
   ___async_unwind = 0; //@line 10034
   HEAP32[$ReallocAsyncCtx2 >> 2] = 79; //@line 10035
   $25 = $ReallocAsyncCtx2 + 4 | 0; //@line 10036
   HEAP32[$25 >> 2] = $2; //@line 10037
   $26 = $ReallocAsyncCtx2 + 8 | 0; //@line 10038
   HEAP32[$26 >> 2] = $4; //@line 10039
   $27 = $ReallocAsyncCtx2 + 12 | 0; //@line 10040
   HEAP32[$27 >> 2] = $6; //@line 10041
   $28 = $ReallocAsyncCtx2 + 16 | 0; //@line 10042
   $$expand_i1_val = 1; //@line 10043
   HEAP8[$28 >> 0] = $$expand_i1_val; //@line 10044
   $29 = $ReallocAsyncCtx2 + 20 | 0; //@line 10045
   HEAP32[$29 >> 2] = $10; //@line 10046
   $30 = $ReallocAsyncCtx2 + 24 | 0; //@line 10047
   HEAP32[$30 >> 2] = $12; //@line 10048
   $31 = $ReallocAsyncCtx2 + 28 | 0; //@line 10049
   HEAP32[$31 >> 2] = $14; //@line 10050
   $32 = $ReallocAsyncCtx2 + 32 | 0; //@line 10051
   HEAP32[$32 >> 2] = $16; //@line 10052
   sp = STACKTOP; //@line 10053
   return;
  }
 } else {
  $$0$off0$i$reg2mem$0 = $8; //@line 10057
  $$08$i = $AsyncRetVal; //@line 10057
 }
 HEAP8[$6 >> 0] = 0; //@line 10059
 HEAP32[___async_retval >> 2] = $$0$off0$i$reg2mem$0 & ($$08$i | 0) == -3015 ? 0 : $$08$i; //@line 10064
 return;
}
function _memchr($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$0$lcssa = 0, $$035$lcssa = 0, $$035$lcssa65 = 0, $$03555 = 0, $$036$lcssa = 0, $$036$lcssa64 = 0, $$03654 = 0, $$046 = 0, $$137$lcssa = 0, $$13745 = 0, $$140 = 0, $$2 = 0, $$23839 = 0, $$3 = 0, $$lcssa = 0, $11 = 0, $12 = 0, $16 = 0, $18 = 0, $20 = 0, $23 = 0, $29 = 0, $3 = 0, $30 = 0, $35 = 0, $7 = 0, $8 = 0, label = 0;
 $3 = $1 & 255; //@line 3072
 $7 = ($2 | 0) != 0; //@line 3076
 L1 : do {
  if ($7 & ($0 & 3 | 0) != 0) {
   $8 = $1 & 255; //@line 3080
   $$03555 = $0; //@line 3081
   $$03654 = $2; //@line 3081
   while (1) {
    if ((HEAP8[$$03555 >> 0] | 0) == $8 << 24 >> 24) {
     $$035$lcssa65 = $$03555; //@line 3086
     $$036$lcssa64 = $$03654; //@line 3086
     label = 6; //@line 3087
     break L1;
    }
    $11 = $$03555 + 1 | 0; //@line 3090
    $12 = $$03654 + -1 | 0; //@line 3091
    $16 = ($12 | 0) != 0; //@line 3095
    if ($16 & ($11 & 3 | 0) != 0) {
     $$03555 = $11; //@line 3098
     $$03654 = $12; //@line 3098
    } else {
     $$035$lcssa = $11; //@line 3100
     $$036$lcssa = $12; //@line 3100
     $$lcssa = $16; //@line 3100
     label = 5; //@line 3101
     break;
    }
   }
  } else {
   $$035$lcssa = $0; //@line 3106
   $$036$lcssa = $2; //@line 3106
   $$lcssa = $7; //@line 3106
   label = 5; //@line 3107
  }
 } while (0);
 if ((label | 0) == 5) {
  if ($$lcssa) {
   $$035$lcssa65 = $$035$lcssa; //@line 3112
   $$036$lcssa64 = $$036$lcssa; //@line 3112
   label = 6; //@line 3113
  } else {
   $$2 = $$035$lcssa; //@line 3115
   $$3 = 0; //@line 3115
  }
 }
 L8 : do {
  if ((label | 0) == 6) {
   $18 = $1 & 255; //@line 3121
   if ((HEAP8[$$035$lcssa65 >> 0] | 0) == $18 << 24 >> 24) {
    $$2 = $$035$lcssa65; //@line 3124
    $$3 = $$036$lcssa64; //@line 3124
   } else {
    $20 = Math_imul($3, 16843009) | 0; //@line 3126
    L11 : do {
     if ($$036$lcssa64 >>> 0 > 3) {
      $$046 = $$035$lcssa65; //@line 3130
      $$13745 = $$036$lcssa64; //@line 3130
      while (1) {
       $23 = HEAP32[$$046 >> 2] ^ $20; //@line 3133
       if (($23 & -2139062144 ^ -2139062144) & $23 + -16843009 | 0) {
        break;
       }
       $29 = $$046 + 4 | 0; //@line 3142
       $30 = $$13745 + -4 | 0; //@line 3143
       if ($30 >>> 0 > 3) {
        $$046 = $29; //@line 3146
        $$13745 = $30; //@line 3146
       } else {
        $$0$lcssa = $29; //@line 3148
        $$137$lcssa = $30; //@line 3148
        label = 11; //@line 3149
        break L11;
       }
      }
      $$140 = $$046; //@line 3153
      $$23839 = $$13745; //@line 3153
     } else {
      $$0$lcssa = $$035$lcssa65; //@line 3155
      $$137$lcssa = $$036$lcssa64; //@line 3155
      label = 11; //@line 3156
     }
    } while (0);
    if ((label | 0) == 11) {
     if (!$$137$lcssa) {
      $$2 = $$0$lcssa; //@line 3162
      $$3 = 0; //@line 3162
      break;
     } else {
      $$140 = $$0$lcssa; //@line 3165
      $$23839 = $$137$lcssa; //@line 3165
     }
    }
    while (1) {
     if ((HEAP8[$$140 >> 0] | 0) == $18 << 24 >> 24) {
      $$2 = $$140; //@line 3172
      $$3 = $$23839; //@line 3172
      break L8;
     }
     $35 = $$140 + 1 | 0; //@line 3175
     $$23839 = $$23839 + -1 | 0; //@line 3176
     if (!$$23839) {
      $$2 = $35; //@line 3179
      $$3 = 0; //@line 3179
      break;
     } else {
      $$140 = $35; //@line 3182
     }
    }
   }
  }
 } while (0);
 return ($$3 | 0 ? $$2 : 0) | 0; //@line 3190
}
function __ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($0, $1, $2, $3, $4) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 var $$037$off038 = 0, $$037$off039 = 0, $13 = 0, $19 = 0, $22 = 0, $23 = 0, $25 = 0, $28 = 0, $39 = 0, $50 = 0, $53 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 7756
 do {
  if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, $4) | 0) {
   __ZNK10__cxxabiv117__class_type_info29process_static_type_below_dstEPNS_19__dynamic_cast_infoEPKvi(0, $1, $2, $3); //@line 7762
  } else {
   if (!(__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 >> 2] | 0, $4) | 0)) {
    $50 = HEAP32[$0 + 8 >> 2] | 0; //@line 7768
    $53 = HEAP32[(HEAP32[$50 >> 2] | 0) + 24 >> 2] | 0; //@line 7771
    $AsyncCtx3 = _emscripten_alloc_async_context(4, sp) | 0; //@line 7772
    FUNCTION_TABLE_viiiii[$53 & 3]($50, $1, $2, $3, $4); //@line 7773
    if (___async) {
     HEAP32[$AsyncCtx3 >> 2] = 158; //@line 7776
     sp = STACKTOP; //@line 7777
     return;
    } else {
     _emscripten_free_async_context($AsyncCtx3 | 0); //@line 7780
     break;
    }
   }
   if ((HEAP32[$1 + 16 >> 2] | 0) != ($2 | 0)) {
    $13 = $1 + 20 | 0; //@line 7788
    if ((HEAP32[$13 >> 2] | 0) != ($2 | 0)) {
     HEAP32[$1 + 32 >> 2] = $3; //@line 7793
     $19 = $1 + 44 | 0; //@line 7794
     if ((HEAP32[$19 >> 2] | 0) == 4) {
      break;
     }
     $22 = $1 + 52 | 0; //@line 7800
     HEAP8[$22 >> 0] = 0; //@line 7801
     $23 = $1 + 53 | 0; //@line 7802
     HEAP8[$23 >> 0] = 0; //@line 7803
     $25 = HEAP32[$0 + 8 >> 2] | 0; //@line 7805
     $28 = HEAP32[(HEAP32[$25 >> 2] | 0) + 20 >> 2] | 0; //@line 7808
     $AsyncCtx = _emscripten_alloc_async_context(28, sp) | 0; //@line 7809
     FUNCTION_TABLE_viiiiii[$28 & 3]($25, $1, $2, $2, 1, $4); //@line 7810
     if (___async) {
      HEAP32[$AsyncCtx >> 2] = 157; //@line 7813
      HEAP32[$AsyncCtx + 4 >> 2] = $23; //@line 7815
      HEAP32[$AsyncCtx + 8 >> 2] = $2; //@line 7817
      HEAP32[$AsyncCtx + 12 >> 2] = $13; //@line 7819
      HEAP32[$AsyncCtx + 16 >> 2] = $1; //@line 7821
      HEAP32[$AsyncCtx + 20 >> 2] = $22; //@line 7823
      HEAP32[$AsyncCtx + 24 >> 2] = $19; //@line 7825
      sp = STACKTOP; //@line 7826
      return;
     }
     _emscripten_free_async_context($AsyncCtx | 0); //@line 7829
     if (!(HEAP8[$23 >> 0] | 0)) {
      $$037$off038 = 4; //@line 7833
      label = 13; //@line 7834
     } else {
      if (!(HEAP8[$22 >> 0] | 0)) {
       $$037$off038 = 3; //@line 7839
       label = 13; //@line 7840
      } else {
       $$037$off039 = 3; //@line 7842
      }
     }
     if ((label | 0) == 13) {
      HEAP32[$13 >> 2] = $2; //@line 7846
      $39 = $1 + 40 | 0; //@line 7847
      HEAP32[$39 >> 2] = (HEAP32[$39 >> 2] | 0) + 1; //@line 7850
      if ((HEAP32[$1 + 36 >> 2] | 0) == 1) {
       if ((HEAP32[$1 + 24 >> 2] | 0) == 2) {
        HEAP8[$1 + 54 >> 0] = 1; //@line 7860
        $$037$off039 = $$037$off038; //@line 7861
       } else {
        $$037$off039 = $$037$off038; //@line 7863
       }
      } else {
       $$037$off039 = $$037$off038; //@line 7866
      }
     }
     HEAP32[$19 >> 2] = $$037$off039; //@line 7869
     break;
    }
   }
   if (($3 | 0) == 1) {
    HEAP32[$1 + 32 >> 2] = 1; //@line 7876
   }
  }
 } while (0);
 return;
}
function __ZThn4_N17EthernetInterface13socket_sendtoEPvRK13SocketAddressPKvj($0, $1, $2, $3, $4) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 var $$1$i = 0, $14 = 0, $15 = 0, $23 = 0, $31 = 0, $32 = 0, $5 = 0, $6 = 0, $AsyncCtx = 0, $AsyncCtx10 = 0, $AsyncCtx2 = 0, $AsyncCtx6 = 0, dest = 0, label = 0, sp = 0, src = 0, stop = 0;
 sp = STACKTOP; //@line 792
 $5 = $0 + -4 | 0; //@line 793
 $6 = $1 + 8 | 0; //@line 794
 do {
  if (!(HEAP8[$6 >> 0] | 0)) {
   label = 7; //@line 799
  } else {
   if (!(__ZneRK13SocketAddressS1_($1 + 12 | 0, $2) | 0)) {
    if (!(HEAP8[$6 >> 0] | 0)) {
     label = 7; //@line 807
     break;
    } else {
     break;
    }
   }
   $AsyncCtx6 = _emscripten_alloc_async_context(4, sp) | 0; //@line 813
   _puts(2448) | 0; //@line 814
   if (___async) {
    HEAP32[$AsyncCtx6 >> 2] = 45; //@line 817
    sp = STACKTOP; //@line 818
    return 0; //@line 819
   }
   _emscripten_free_async_context($AsyncCtx6 | 0); //@line 821
   $$1$i = -3012; //@line 822
   return $$1$i | 0; //@line 823
  }
 } while (0);
 do {
  if ((label | 0) == 7) {
   $14 = HEAP32[(HEAP32[$5 >> 2] | 0) + 80 >> 2] | 0; //@line 830
   $AsyncCtx = _emscripten_alloc_async_context(28, sp) | 0; //@line 831
   $15 = FUNCTION_TABLE_iiii[$14 & 15]($5, $1, $2) | 0; //@line 832
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 46; //@line 835
    HEAP32[$AsyncCtx + 4 >> 2] = $1; //@line 837
    HEAP32[$AsyncCtx + 8 >> 2] = $2; //@line 839
    HEAP32[$AsyncCtx + 12 >> 2] = $5; //@line 841
    HEAP32[$AsyncCtx + 16 >> 2] = $5; //@line 843
    HEAP32[$AsyncCtx + 20 >> 2] = $3; //@line 845
    HEAP32[$AsyncCtx + 24 >> 2] = $4; //@line 847
    sp = STACKTOP; //@line 848
    return 0; //@line 849
   }
   _emscripten_free_async_context($AsyncCtx | 0); //@line 851
   if (($15 | 0) < 0) {
    $$1$i = $15; //@line 854
    return $$1$i | 0; //@line 855
   } else {
    $23 = $1 + 12 | 0; //@line 857
    dest = $23; //@line 858
    src = $2; //@line 858
    stop = dest + 60 | 0; //@line 858
    do {
     HEAP32[dest >> 2] = HEAP32[src >> 2]; //@line 858
     dest = dest + 4 | 0; //@line 858
     src = src + 4 | 0; //@line 858
    } while ((dest | 0) < (stop | 0));
    HEAP16[$23 + 60 >> 1] = HEAP16[$2 + 60 >> 1] | 0; //@line 858
    break;
   }
  }
 } while (0);
 $AsyncCtx10 = _emscripten_alloc_async_context(24, sp) | 0; //@line 863
 _wait_ms(1); //@line 864
 if (___async) {
  HEAP32[$AsyncCtx10 >> 2] = 47; //@line 867
  HEAP32[$AsyncCtx10 + 4 >> 2] = $5; //@line 869
  HEAP32[$AsyncCtx10 + 8 >> 2] = $5; //@line 871
  HEAP32[$AsyncCtx10 + 12 >> 2] = $1; //@line 873
  HEAP32[$AsyncCtx10 + 16 >> 2] = $3; //@line 875
  HEAP32[$AsyncCtx10 + 20 >> 2] = $4; //@line 877
  sp = STACKTOP; //@line 878
  return 0; //@line 879
 }
 _emscripten_free_async_context($AsyncCtx10 | 0); //@line 881
 $31 = HEAP32[(HEAP32[$5 >> 2] | 0) + 88 >> 2] | 0; //@line 884
 $AsyncCtx2 = _emscripten_alloc_async_context(4, sp) | 0; //@line 885
 $32 = FUNCTION_TABLE_iiiii[$31 & 15]($5, $1, $3, $4) | 0; //@line 886
 if (___async) {
  HEAP32[$AsyncCtx2 >> 2] = 48; //@line 889
  sp = STACKTOP; //@line 890
  return 0; //@line 891
 }
 _emscripten_free_async_context($AsyncCtx2 | 0); //@line 893
 $$1$i = $32; //@line 894
 return $$1$i | 0; //@line 895
}
function __ZL24nsapi_dns_query_multipleP12NetworkStackPKcP10nsapi_addrj13nsapi_version__async_cb_72($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $20 = 0, $22 = 0, $24 = 0, $26 = 0, $28 = 0, $30 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $38 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx = 0, $ReallocAsyncCtx12 = 0, sp = 0;
 sp = STACKTOP; //@line 1517
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 1521
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 1523
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 1525
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 1527
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 1529
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 1531
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 1533
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 1535
 $20 = HEAP32[$0 + 40 >> 2] | 0; //@line 1537
 $22 = HEAP32[$0 + 44 >> 2] | 0; //@line 1539
 $24 = HEAP32[$0 + 48 >> 2] | 0; //@line 1541
 $26 = HEAP32[$0 + 52 >> 2] | 0; //@line 1543
 $28 = HEAP32[$0 + 56 >> 2] | 0; //@line 1545
 $30 = HEAP32[$0 + 60 >> 2] | 0; //@line 1547
 if ((HEAP32[___async_retval >> 2] | 0) >= 0) {
  $ReallocAsyncCtx = _emscripten_realloc_async_context(60) | 0; //@line 1552
  $38 = __ZN9UDPSocket8recvfromEP13SocketAddressPvj($28, 0, $10, 512) | 0; //@line 1553
  if (!___async) {
   HEAP32[___async_retval >> 2] = $38; //@line 1557
   ___async_unwind = 0; //@line 1558
  }
  HEAP32[$ReallocAsyncCtx >> 2] = 103; //@line 1560
  HEAP32[$ReallocAsyncCtx + 4 >> 2] = $4; //@line 1562
  HEAP32[$ReallocAsyncCtx + 8 >> 2] = $6; //@line 1564
  HEAP32[$ReallocAsyncCtx + 12 >> 2] = $8; //@line 1566
  HEAP32[$ReallocAsyncCtx + 16 >> 2] = $10; //@line 1568
  HEAP32[$ReallocAsyncCtx + 20 >> 2] = $12; //@line 1570
  HEAP32[$ReallocAsyncCtx + 24 >> 2] = $14; //@line 1572
  HEAP32[$ReallocAsyncCtx + 28 >> 2] = $16; //@line 1574
  HEAP32[$ReallocAsyncCtx + 32 >> 2] = $18; //@line 1576
  HEAP32[$ReallocAsyncCtx + 36 >> 2] = $20; //@line 1578
  HEAP32[$ReallocAsyncCtx + 40 >> 2] = $22; //@line 1580
  HEAP32[$ReallocAsyncCtx + 44 >> 2] = $24; //@line 1582
  HEAP32[$ReallocAsyncCtx + 48 >> 2] = $26; //@line 1584
  HEAP32[$ReallocAsyncCtx + 52 >> 2] = $28; //@line 1586
  HEAP32[$ReallocAsyncCtx + 56 >> 2] = $30; //@line 1588
  sp = STACKTOP; //@line 1589
  return;
 }
 _free($10); //@line 1592
 $ReallocAsyncCtx12 = _emscripten_realloc_async_context(16) | 0; //@line 1593
 $32 = __ZN6Socket5closeEv($30) | 0; //@line 1594
 if (___async) {
  HEAP32[$ReallocAsyncCtx12 >> 2] = 94; //@line 1597
  $33 = $ReallocAsyncCtx12 + 4 | 0; //@line 1598
  HEAP32[$33 >> 2] = -3009; //@line 1599
  $34 = $ReallocAsyncCtx12 + 8 | 0; //@line 1600
  HEAP32[$34 >> 2] = $28; //@line 1601
  $35 = $ReallocAsyncCtx12 + 12 | 0; //@line 1602
  HEAP32[$35 >> 2] = $26; //@line 1603
  sp = STACKTOP; //@line 1604
  return;
 }
 HEAP32[___async_retval >> 2] = $32; //@line 1608
 ___async_unwind = 0; //@line 1609
 HEAP32[$ReallocAsyncCtx12 >> 2] = 94; //@line 1610
 $33 = $ReallocAsyncCtx12 + 4 | 0; //@line 1611
 HEAP32[$33 >> 2] = -3009; //@line 1612
 $34 = $ReallocAsyncCtx12 + 8 | 0; //@line 1613
 HEAP32[$34 >> 2] = $28; //@line 1614
 $35 = $ReallocAsyncCtx12 + 12 | 0; //@line 1615
 HEAP32[$35 >> 2] = $26; //@line 1616
 sp = STACKTOP; //@line 1617
 return;
}
function __ZL25default_terminate_handlerv() {
 var $0 = 0, $1 = 0, $12 = 0, $22 = 0, $23 = 0, $25 = 0, $28 = 0, $29 = 0, $3 = 0, $36 = 0, $39 = 0, $40 = 0, $7 = 0, $9 = 0, $AsyncCtx = 0, $AsyncCtx14 = 0, $vararg_buffer = 0, $vararg_buffer10 = 0, $vararg_buffer3 = 0, $vararg_buffer7 = 0, sp = 0;
 sp = STACKTOP; //@line 7068
 STACKTOP = STACKTOP + 48 | 0; //@line 7069
 $vararg_buffer10 = sp + 32 | 0; //@line 7070
 $vararg_buffer7 = sp + 24 | 0; //@line 7071
 $vararg_buffer3 = sp + 16 | 0; //@line 7072
 $vararg_buffer = sp; //@line 7073
 $0 = sp + 36 | 0; //@line 7074
 $1 = ___cxa_get_globals_fast() | 0; //@line 7075
 if ($1 | 0) {
  $3 = HEAP32[$1 >> 2] | 0; //@line 7078
  if ($3 | 0) {
   $7 = $3 + 48 | 0; //@line 7083
   $9 = HEAP32[$7 >> 2] | 0; //@line 7085
   $12 = HEAP32[$7 + 4 >> 2] | 0; //@line 7088
   if (!(($9 & -256 | 0) == 1126902528 & ($12 | 0) == 1129074247)) {
    HEAP32[$vararg_buffer7 >> 2] = 6587; //@line 7094
    _abort_message(6537, $vararg_buffer7); //@line 7095
   }
   if (($9 | 0) == 1126902529 & ($12 | 0) == 1129074247) {
    $22 = HEAP32[$3 + 44 >> 2] | 0; //@line 7104
   } else {
    $22 = $3 + 80 | 0; //@line 7106
   }
   HEAP32[$0 >> 2] = $22; //@line 7108
   $23 = HEAP32[$3 >> 2] | 0; //@line 7109
   $25 = HEAP32[$23 + 4 >> 2] | 0; //@line 7111
   $28 = HEAP32[(HEAP32[24] | 0) + 16 >> 2] | 0; //@line 7114
   $AsyncCtx = _emscripten_alloc_async_context(28, sp) | 0; //@line 7115
   $29 = FUNCTION_TABLE_iiii[$28 & 15](96, $23, $0) | 0; //@line 7116
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 148; //@line 7119
    HEAP32[$AsyncCtx + 4 >> 2] = $0; //@line 7121
    HEAP32[$AsyncCtx + 8 >> 2] = $vararg_buffer3; //@line 7123
    HEAP32[$AsyncCtx + 12 >> 2] = $25; //@line 7125
    HEAP32[$AsyncCtx + 16 >> 2] = $vararg_buffer3; //@line 7127
    HEAP32[$AsyncCtx + 20 >> 2] = $vararg_buffer; //@line 7129
    HEAP32[$AsyncCtx + 24 >> 2] = $vararg_buffer; //@line 7131
    sp = STACKTOP; //@line 7132
    STACKTOP = sp; //@line 7133
    return;
   }
   _emscripten_free_async_context($AsyncCtx | 0); //@line 7135
   if (!$29) {
    HEAP32[$vararg_buffer3 >> 2] = 6587; //@line 7137
    HEAP32[$vararg_buffer3 + 4 >> 2] = $25; //@line 7139
    _abort_message(6496, $vararg_buffer3); //@line 7140
   }
   $36 = HEAP32[$0 >> 2] | 0; //@line 7143
   $39 = HEAP32[(HEAP32[$36 >> 2] | 0) + 8 >> 2] | 0; //@line 7146
   $AsyncCtx14 = _emscripten_alloc_async_context(16, sp) | 0; //@line 7147
   $40 = FUNCTION_TABLE_ii[$39 & 15]($36) | 0; //@line 7148
   if (___async) {
    HEAP32[$AsyncCtx14 >> 2] = 149; //@line 7151
    HEAP32[$AsyncCtx14 + 4 >> 2] = $vararg_buffer; //@line 7153
    HEAP32[$AsyncCtx14 + 8 >> 2] = $25; //@line 7155
    HEAP32[$AsyncCtx14 + 12 >> 2] = $vararg_buffer; //@line 7157
    sp = STACKTOP; //@line 7158
    STACKTOP = sp; //@line 7159
    return;
   } else {
    _emscripten_free_async_context($AsyncCtx14 | 0); //@line 7161
    HEAP32[$vararg_buffer >> 2] = 6587; //@line 7162
    HEAP32[$vararg_buffer + 4 >> 2] = $25; //@line 7164
    HEAP32[$vararg_buffer + 8 >> 2] = $40; //@line 7166
    _abort_message(6451, $vararg_buffer); //@line 7167
   }
  }
 }
 _abort_message(6575, $vararg_buffer10); //@line 7172
}
function __ZN6Socket4openEP12NetworkStack__async_cb_58($0) {
 $0 = $0 | 0;
 var $$pre = 0, $10 = 0, $12 = 0, $14 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $28 = 0, $29 = 0, $30 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx4 = 0, $ReallocAsyncCtx6 = 0, sp = 0;
 sp = STACKTOP; //@line 12928
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 12930
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 12932
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 12934
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 12936
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 12938
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 12940
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 12942
 $$pre = HEAP32[$2 >> 2] | 0; //@line 12943
 if ($$pre | 0) {
  $17 = HEAP32[$$pre + 4 >> 2] | 0; //@line 12947
  $ReallocAsyncCtx4 = _emscripten_realloc_async_context(32) | 0; //@line 12948
  FUNCTION_TABLE_vii[$17 & 3]($6, $8); //@line 12949
  if (___async) {
   HEAP32[$ReallocAsyncCtx4 >> 2] = 62; //@line 12952
   $18 = $ReallocAsyncCtx4 + 4 | 0; //@line 12953
   HEAP32[$18 >> 2] = $2; //@line 12954
   $19 = $ReallocAsyncCtx4 + 8 | 0; //@line 12955
   HEAP32[$19 >> 2] = $4; //@line 12956
   $20 = $ReallocAsyncCtx4 + 12 | 0; //@line 12957
   HEAP32[$20 >> 2] = $8; //@line 12958
   $21 = $ReallocAsyncCtx4 + 16 | 0; //@line 12959
   HEAP32[$21 >> 2] = $10; //@line 12960
   $22 = $ReallocAsyncCtx4 + 20 | 0; //@line 12961
   HEAP32[$22 >> 2] = $12; //@line 12962
   $23 = $ReallocAsyncCtx4 + 24 | 0; //@line 12963
   HEAP32[$23 >> 2] = $6; //@line 12964
   $24 = $ReallocAsyncCtx4 + 28 | 0; //@line 12965
   HEAP32[$24 >> 2] = $14; //@line 12966
   sp = STACKTOP; //@line 12967
   return;
  }
  ___async_unwind = 0; //@line 12970
  HEAP32[$ReallocAsyncCtx4 >> 2] = 62; //@line 12971
  $18 = $ReallocAsyncCtx4 + 4 | 0; //@line 12972
  HEAP32[$18 >> 2] = $2; //@line 12973
  $19 = $ReallocAsyncCtx4 + 8 | 0; //@line 12974
  HEAP32[$19 >> 2] = $4; //@line 12975
  $20 = $ReallocAsyncCtx4 + 12 | 0; //@line 12976
  HEAP32[$20 >> 2] = $8; //@line 12977
  $21 = $ReallocAsyncCtx4 + 16 | 0; //@line 12978
  HEAP32[$21 >> 2] = $10; //@line 12979
  $22 = $ReallocAsyncCtx4 + 20 | 0; //@line 12980
  HEAP32[$22 >> 2] = $12; //@line 12981
  $23 = $ReallocAsyncCtx4 + 24 | 0; //@line 12982
  HEAP32[$23 >> 2] = $6; //@line 12983
  $24 = $ReallocAsyncCtx4 + 28 | 0; //@line 12984
  HEAP32[$24 >> 2] = $14; //@line 12985
  sp = STACKTOP; //@line 12986
  return;
 }
 HEAP32[$4 >> 2] = 0; //@line 12989
 $25 = HEAP32[$10 >> 2] | 0; //@line 12990
 $28 = HEAP32[(HEAP32[$25 >> 2] | 0) + 68 >> 2] | 0; //@line 12993
 $29 = HEAP32[$12 >> 2] | 0; //@line 12994
 $ReallocAsyncCtx6 = _emscripten_realloc_async_context(8) | 0; //@line 12995
 FUNCTION_TABLE_viiii[$28 & 7]($25, $29, 64, $6); //@line 12996
 if (___async) {
  HEAP32[$ReallocAsyncCtx6 >> 2] = 65; //@line 12999
  $30 = $ReallocAsyncCtx6 + 4 | 0; //@line 13000
  HEAP32[$30 >> 2] = $14; //@line 13001
  sp = STACKTOP; //@line 13002
  return;
 }
 ___async_unwind = 0; //@line 13005
 HEAP32[$ReallocAsyncCtx6 >> 2] = 65; //@line 13006
 $30 = $ReallocAsyncCtx6 + 4 | 0; //@line 13007
 HEAP32[$30 >> 2] = $14; //@line 13008
 sp = STACKTOP; //@line 13009
 return;
}
function __ZN17EthernetInterface13socket_sendtoEPvRK13SocketAddressPKvj($0, $1, $2, $3, $4) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 var $$1 = 0, $13 = 0, $14 = 0, $21 = 0, $28 = 0, $29 = 0, $5 = 0, $AsyncCtx = 0, $AsyncCtx10 = 0, $AsyncCtx2 = 0, $AsyncCtx6 = 0, dest = 0, label = 0, sp = 0, src = 0, stop = 0;
 sp = STACKTOP; //@line 394
 $5 = $1 + 8 | 0; //@line 395
 do {
  if (!(HEAP8[$5 >> 0] | 0)) {
   label = 7; //@line 400
  } else {
   if (!(__ZneRK13SocketAddressS1_($1 + 12 | 0, $2) | 0)) {
    if (!(HEAP8[$5 >> 0] | 0)) {
     label = 7; //@line 408
     break;
    } else {
     break;
    }
   }
   $AsyncCtx6 = _emscripten_alloc_async_context(4, sp) | 0; //@line 414
   _puts(2448) | 0; //@line 415
   if (___async) {
    HEAP32[$AsyncCtx6 >> 2] = 32; //@line 418
    sp = STACKTOP; //@line 419
    return 0; //@line 420
   }
   _emscripten_free_async_context($AsyncCtx6 | 0); //@line 422
   $$1 = -3012; //@line 423
   return $$1 | 0; //@line 424
  }
 } while (0);
 do {
  if ((label | 0) == 7) {
   $13 = HEAP32[(HEAP32[$0 >> 2] | 0) + 80 >> 2] | 0; //@line 431
   $AsyncCtx = _emscripten_alloc_async_context(24, sp) | 0; //@line 432
   $14 = FUNCTION_TABLE_iiii[$13 & 15]($0, $1, $2) | 0; //@line 433
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 33; //@line 436
    HEAP32[$AsyncCtx + 4 >> 2] = $1; //@line 438
    HEAP32[$AsyncCtx + 8 >> 2] = $2; //@line 440
    HEAP32[$AsyncCtx + 12 >> 2] = $0; //@line 442
    HEAP32[$AsyncCtx + 16 >> 2] = $3; //@line 444
    HEAP32[$AsyncCtx + 20 >> 2] = $4; //@line 446
    sp = STACKTOP; //@line 447
    return 0; //@line 448
   }
   _emscripten_free_async_context($AsyncCtx | 0); //@line 450
   if (($14 | 0) < 0) {
    $$1 = $14; //@line 453
    return $$1 | 0; //@line 454
   } else {
    $21 = $1 + 12 | 0; //@line 456
    dest = $21; //@line 457
    src = $2; //@line 457
    stop = dest + 60 | 0; //@line 457
    do {
     HEAP32[dest >> 2] = HEAP32[src >> 2]; //@line 457
     dest = dest + 4 | 0; //@line 457
     src = src + 4 | 0; //@line 457
    } while ((dest | 0) < (stop | 0));
    HEAP16[$21 + 60 >> 1] = HEAP16[$2 + 60 >> 1] | 0; //@line 457
    break;
   }
  }
 } while (0);
 $AsyncCtx10 = _emscripten_alloc_async_context(20, sp) | 0; //@line 462
 _wait_ms(1); //@line 463
 if (___async) {
  HEAP32[$AsyncCtx10 >> 2] = 34; //@line 466
  HEAP32[$AsyncCtx10 + 4 >> 2] = $0; //@line 468
  HEAP32[$AsyncCtx10 + 8 >> 2] = $1; //@line 470
  HEAP32[$AsyncCtx10 + 12 >> 2] = $3; //@line 472
  HEAP32[$AsyncCtx10 + 16 >> 2] = $4; //@line 474
  sp = STACKTOP; //@line 475
  return 0; //@line 476
 }
 _emscripten_free_async_context($AsyncCtx10 | 0); //@line 478
 $28 = HEAP32[(HEAP32[$0 >> 2] | 0) + 88 >> 2] | 0; //@line 481
 $AsyncCtx2 = _emscripten_alloc_async_context(4, sp) | 0; //@line 482
 $29 = FUNCTION_TABLE_iiiii[$28 & 15]($0, $1, $3, $4) | 0; //@line 483
 if (___async) {
  HEAP32[$AsyncCtx2 >> 2] = 35; //@line 486
  sp = STACKTOP; //@line 487
  return 0; //@line 488
 }
 _emscripten_free_async_context($AsyncCtx2 | 0); //@line 490
 $$1 = $29; //@line 491
 return $$1 | 0; //@line 492
}
function __ZN9TCPSocket4sendEPKvj($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$0 = 0, $$024 = 0, $$1 = 0, $$2 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $16 = 0, $19 = 0, $22 = 0, $3 = 0, $32 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 3005
 $3 = $0 + 57 | 0; //@line 3006
 do {
  if (HEAP8[$3 >> 0] | 0) {
   $AsyncCtx3 = _emscripten_alloc_async_context(20, sp) | 0; //@line 3011
   _mbed_assert_internal(3190, 3210, 125); //@line 3012
   if (___async) {
    HEAP32[$AsyncCtx3 >> 2] = 80; //@line 3015
    HEAP32[$AsyncCtx3 + 4 >> 2] = $3; //@line 3017
    HEAP32[$AsyncCtx3 + 8 >> 2] = $0; //@line 3019
    HEAP32[$AsyncCtx3 + 12 >> 2] = $1; //@line 3021
    HEAP32[$AsyncCtx3 + 16 >> 2] = $2; //@line 3023
    sp = STACKTOP; //@line 3024
    return 0; //@line 3025
   } else {
    _emscripten_free_async_context($AsyncCtx3 | 0); //@line 3027
    break;
   }
  }
 } while (0);
 HEAP8[$3 >> 0] = 1; //@line 3032
 $10 = $0 + 8 | 0; //@line 3033
 $11 = $0 + 52 | 0; //@line 3034
 $12 = $0 + 4 | 0; //@line 3035
 $13 = $0 + 12 | 0; //@line 3036
 $$0 = 0; //@line 3037
 while (1) {
  $14 = HEAP32[$10 >> 2] | 0; //@line 3039
  if (!$14) {
   $$024 = -3005; //@line 3042
   $$2 = $$0; //@line 3042
   label = 13; //@line 3043
   break;
  }
  HEAP32[$11 >> 2] = 0; //@line 3046
  $16 = HEAP32[$12 >> 2] | 0; //@line 3047
  $19 = HEAP32[(HEAP32[$16 >> 2] | 0) + 52 >> 2] | 0; //@line 3050
  $AsyncCtx = _emscripten_alloc_async_context(36, sp) | 0; //@line 3053
  $22 = FUNCTION_TABLE_iiiii[$19 & 15]($16, $14, $1 + $$0 | 0, $2 - $$0 | 0) | 0; //@line 3054
  if (___async) {
   label = 8; //@line 3057
   break;
  }
  _emscripten_free_async_context($AsyncCtx | 0); //@line 3060
  if (($22 | 0) > -1) {
   $32 = $22 + $$0 | 0; //@line 3063
   if ($32 >>> 0 < $2 >>> 0) {
    $$1 = $32; //@line 3066
   } else {
    $$024 = $22; //@line 3068
    $$2 = $32; //@line 3068
    label = 13; //@line 3069
    break;
   }
  } else {
   $$1 = $$0; //@line 3073
  }
  if (!(HEAP32[$13 >> 2] | 0)) {
   $$024 = $22; //@line 3078
   $$2 = $$1; //@line 3078
   label = 13; //@line 3079
   break;
  }
  if (($22 | 0) != -3001 & ($22 | 0) < 0) {
   $$024 = $22; //@line 3086
   $$2 = $$1; //@line 3086
   label = 13; //@line 3087
   break;
  } else {
   $$0 = $$1; //@line 3090
  }
 }
 if ((label | 0) == 8) {
  HEAP32[$AsyncCtx >> 2] = 81; //@line 3094
  HEAP32[$AsyncCtx + 4 >> 2] = $$0; //@line 3096
  HEAP32[$AsyncCtx + 8 >> 2] = $2; //@line 3098
  HEAP32[$AsyncCtx + 12 >> 2] = $13; //@line 3100
  HEAP32[$AsyncCtx + 16 >> 2] = $3; //@line 3102
  HEAP32[$AsyncCtx + 20 >> 2] = $10; //@line 3104
  HEAP32[$AsyncCtx + 24 >> 2] = $11; //@line 3106
  HEAP32[$AsyncCtx + 28 >> 2] = $12; //@line 3108
  HEAP32[$AsyncCtx + 32 >> 2] = $1; //@line 3110
  sp = STACKTOP; //@line 3111
  return 0; //@line 3112
 } else if ((label | 0) == 13) {
  HEAP8[$3 >> 0] = 0; //@line 3115
  return (($$024 | 0) < 1 & ($$024 | 0) != -3001 ? $$024 : ($$2 | 0) == 0 ? -3001 : $$2) | 0; //@line 3122
 }
 return 0; //@line 3124
}
function _mbrtowc($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $$ = 0, $$0 = 0, $$03952 = 0, $$04051 = 0, $$04350 = 0, $$1 = 0, $$141 = 0, $$144 = 0, $$2 = 0, $$47 = 0, $12 = 0, $21 = 0, $22 = 0, $26 = 0, $30 = 0, $31 = 0, $33 = 0, $35 = 0, $4 = 0, $44 = 0, $6 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 9
 STACKTOP = STACKTOP + 16 | 0; //@line 10
 $4 = sp; //@line 11
 $$ = ($3 | 0) == 0 ? 7596 : $3; //@line 13
 $6 = HEAP32[$$ >> 2] | 0; //@line 14
 L1 : do {
  if (!$1) {
   if (!$6) {
    $$0 = 0; //@line 20
   } else {
    label = 17; //@line 22
   }
  } else {
   $$47 = ($0 | 0) == 0 ? $4 : $0; //@line 26
   if (!$2) {
    $$0 = -2; //@line 29
   } else {
    if (!$6) {
     $12 = HEAP8[$1 >> 0] | 0; //@line 33
     if ($12 << 24 >> 24 > -1) {
      HEAP32[$$47 >> 2] = $12 & 255; //@line 37
      $$0 = $12 << 24 >> 24 != 0 & 1; //@line 40
      break;
     }
     $21 = (HEAP32[HEAP32[(___pthread_self_913() | 0) + 188 >> 2] >> 2] | 0) == 0; //@line 47
     $22 = HEAP8[$1 >> 0] | 0; //@line 48
     if ($21) {
      HEAP32[$$47 >> 2] = $22 << 24 >> 24 & 57343; //@line 52
      $$0 = 1; //@line 53
      break;
     }
     $26 = ($22 & 255) + -194 | 0; //@line 57
     if ($26 >>> 0 > 50) {
      label = 17; //@line 60
      break;
     }
     $30 = HEAP32[1712 + ($26 << 2) >> 2] | 0; //@line 65
     $31 = $2 + -1 | 0; //@line 66
     if (!$31) {
      $$2 = $30; //@line 69
     } else {
      $$03952 = $1 + 1 | 0; //@line 71
      $$04051 = $30; //@line 71
      $$04350 = $31; //@line 71
      label = 11; //@line 72
     }
    } else {
     $$03952 = $1; //@line 75
     $$04051 = $6; //@line 75
     $$04350 = $2; //@line 75
     label = 11; //@line 76
    }
    L14 : do {
     if ((label | 0) == 11) {
      $33 = HEAP8[$$03952 >> 0] | 0; //@line 80
      $35 = ($33 & 255) >>> 3; //@line 82
      if (($35 + -16 | $35 + ($$04051 >> 26)) >>> 0 > 7) {
       label = 17; //@line 89
       break L1;
      } else {
       $$1 = $$03952; //@line 92
       $$141 = $$04051; //@line 92
       $$144 = $$04350; //@line 92
       $44 = $33; //@line 92
      }
      while (1) {
       $$1 = $$1 + 1 | 0; //@line 96
       $$141 = ($44 & 255) + -128 | $$141 << 6; //@line 99
       $$144 = $$144 + -1 | 0; //@line 100
       if (($$141 | 0) >= 0) {
        break;
       }
       if (!$$144) {
        $$2 = $$141; //@line 107
        break L14;
       }
       $44 = HEAP8[$$1 >> 0] | 0; //@line 110
       if (($44 & -64) << 24 >> 24 != -128) {
        label = 17; //@line 116
        break L1;
       }
      }
      HEAP32[$$ >> 2] = 0; //@line 120
      HEAP32[$$47 >> 2] = $$141; //@line 121
      $$0 = $2 - $$144 | 0; //@line 123
      break L1;
     }
    } while (0);
    HEAP32[$$ >> 2] = $$2; //@line 127
    $$0 = -2; //@line 128
   }
  }
 } while (0);
 if ((label | 0) == 17) {
  HEAP32[$$ >> 2] = 0; //@line 133
  HEAP32[(___errno_location() | 0) >> 2] = 84; //@line 135
  $$0 = -1; //@line 136
 }
 STACKTOP = sp; //@line 138
 return $$0 | 0; //@line 138
}
function ___stdio_write($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$0 = 0, $$04756 = 0, $$04855 = 0, $$04954 = 0, $$051 = 0, $$1 = 0, $$150 = 0, $12 = 0, $13 = 0, $17 = 0, $20 = 0, $25 = 0, $27 = 0, $3 = 0, $37 = 0, $38 = 0, $4 = 0, $44 = 0, $5 = 0, $7 = 0, $9 = 0, $vararg_buffer = 0, $vararg_buffer3 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 9919
 STACKTOP = STACKTOP + 48 | 0; //@line 9920
 $vararg_buffer3 = sp + 16 | 0; //@line 9921
 $vararg_buffer = sp; //@line 9922
 $3 = sp + 32 | 0; //@line 9923
 $4 = $0 + 28 | 0; //@line 9924
 $5 = HEAP32[$4 >> 2] | 0; //@line 9925
 HEAP32[$3 >> 2] = $5; //@line 9926
 $7 = $0 + 20 | 0; //@line 9928
 $9 = (HEAP32[$7 >> 2] | 0) - $5 | 0; //@line 9930
 HEAP32[$3 + 4 >> 2] = $9; //@line 9931
 HEAP32[$3 + 8 >> 2] = $1; //@line 9933
 HEAP32[$3 + 12 >> 2] = $2; //@line 9935
 $12 = $9 + $2 | 0; //@line 9936
 $13 = $0 + 60 | 0; //@line 9937
 HEAP32[$vararg_buffer >> 2] = HEAP32[$13 >> 2]; //@line 9940
 HEAP32[$vararg_buffer + 4 >> 2] = $3; //@line 9942
 HEAP32[$vararg_buffer + 8 >> 2] = 2; //@line 9944
 $17 = ___syscall_ret(___syscall146(146, $vararg_buffer | 0) | 0) | 0; //@line 9946
 L1 : do {
  if (($12 | 0) == ($17 | 0)) {
   label = 3; //@line 9950
  } else {
   $$04756 = 2; //@line 9952
   $$04855 = $12; //@line 9952
   $$04954 = $3; //@line 9952
   $27 = $17; //@line 9952
   while (1) {
    if (($27 | 0) < 0) {
     break;
    }
    $$04855 = $$04855 - $27 | 0; //@line 9958
    $37 = HEAP32[$$04954 + 4 >> 2] | 0; //@line 9960
    $38 = $27 >>> 0 > $37 >>> 0; //@line 9961
    $$150 = $38 ? $$04954 + 8 | 0 : $$04954; //@line 9963
    $$1 = $$04756 + ($38 << 31 >> 31) | 0; //@line 9965
    $$0 = $27 - ($38 ? $37 : 0) | 0; //@line 9967
    HEAP32[$$150 >> 2] = (HEAP32[$$150 >> 2] | 0) + $$0; //@line 9970
    $44 = $$150 + 4 | 0; //@line 9971
    HEAP32[$44 >> 2] = (HEAP32[$44 >> 2] | 0) - $$0; //@line 9974
    HEAP32[$vararg_buffer3 >> 2] = HEAP32[$13 >> 2]; //@line 9977
    HEAP32[$vararg_buffer3 + 4 >> 2] = $$150; //@line 9979
    HEAP32[$vararg_buffer3 + 8 >> 2] = $$1; //@line 9981
    $27 = ___syscall_ret(___syscall146(146, $vararg_buffer3 | 0) | 0) | 0; //@line 9983
    if (($$04855 | 0) == ($27 | 0)) {
     label = 3; //@line 9986
     break L1;
    } else {
     $$04756 = $$1; //@line 9989
     $$04954 = $$150; //@line 9989
    }
   }
   HEAP32[$0 + 16 >> 2] = 0; //@line 9993
   HEAP32[$4 >> 2] = 0; //@line 9994
   HEAP32[$7 >> 2] = 0; //@line 9995
   HEAP32[$0 >> 2] = HEAP32[$0 >> 2] | 32; //@line 9998
   if (($$04756 | 0) == 2) {
    $$051 = 0; //@line 10001
   } else {
    $$051 = $2 - (HEAP32[$$04954 + 4 >> 2] | 0) | 0; //@line 10006
   }
  }
 } while (0);
 if ((label | 0) == 3) {
  $20 = HEAP32[$0 + 44 >> 2] | 0; //@line 10012
  HEAP32[$0 + 16 >> 2] = $20 + (HEAP32[$0 + 48 >> 2] | 0); //@line 10017
  $25 = $20; //@line 10018
  HEAP32[$4 >> 2] = $25; //@line 10019
  HEAP32[$7 >> 2] = $25; //@line 10020
  $$051 = $2; //@line 10021
 }
 STACKTOP = sp; //@line 10023
 return $$051 | 0; //@line 10023
}
function __ZN9TCPSocket7connectEPKct__async_cb_11($0) {
 $0 = $0 | 0;
 var $$expand_i1_val = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $16 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 10071
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 10073
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 10075
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 10077
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 10079
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 10081
 HEAP8[$2 >> 0] = 1; //@line 10082
 $11 = $4 + 8 | 0; //@line 10083
 $12 = $4 + 52 | 0; //@line 10084
 $13 = $4 + 12 | 0; //@line 10085
 $14 = HEAP32[$11 >> 2] | 0; //@line 10086
 if (!$14) {
  HEAP8[$2 >> 0] = 0; //@line 10089
  HEAP32[___async_retval >> 2] = 0 & -3005 == -3015 ? 0 : -3005; //@line 10094
  return;
 }
 HEAP32[$12 >> 2] = 0; //@line 10097
 $16 = HEAP32[$6 >> 2] | 0; //@line 10098
 $19 = HEAP32[(HEAP32[$16 >> 2] | 0) + 44 >> 2] | 0; //@line 10101
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(36) | 0; //@line 10102
 $20 = FUNCTION_TABLE_iiii[$19 & 15]($16, $14, $8) | 0; //@line 10103
 if (___async) {
  HEAP32[$ReallocAsyncCtx2 >> 2] = 79; //@line 10106
  $21 = $ReallocAsyncCtx2 + 4 | 0; //@line 10107
  HEAP32[$21 >> 2] = $13; //@line 10108
  $22 = $ReallocAsyncCtx2 + 8 | 0; //@line 10109
  HEAP32[$22 >> 2] = $11; //@line 10110
  $23 = $ReallocAsyncCtx2 + 12 | 0; //@line 10111
  HEAP32[$23 >> 2] = $2; //@line 10112
  $24 = $ReallocAsyncCtx2 + 16 | 0; //@line 10113
  $$expand_i1_val = 0; //@line 10114
  HEAP8[$24 >> 0] = $$expand_i1_val; //@line 10115
  $25 = $ReallocAsyncCtx2 + 20 | 0; //@line 10116
  HEAP32[$25 >> 2] = $10; //@line 10117
  $26 = $ReallocAsyncCtx2 + 24 | 0; //@line 10118
  HEAP32[$26 >> 2] = $12; //@line 10119
  $27 = $ReallocAsyncCtx2 + 28 | 0; //@line 10120
  HEAP32[$27 >> 2] = $6; //@line 10121
  $28 = $ReallocAsyncCtx2 + 32 | 0; //@line 10122
  HEAP32[$28 >> 2] = $8; //@line 10123
  sp = STACKTOP; //@line 10124
  return;
 }
 HEAP32[___async_retval >> 2] = $20; //@line 10128
 ___async_unwind = 0; //@line 10129
 HEAP32[$ReallocAsyncCtx2 >> 2] = 79; //@line 10130
 $21 = $ReallocAsyncCtx2 + 4 | 0; //@line 10131
 HEAP32[$21 >> 2] = $13; //@line 10132
 $22 = $ReallocAsyncCtx2 + 8 | 0; //@line 10133
 HEAP32[$22 >> 2] = $11; //@line 10134
 $23 = $ReallocAsyncCtx2 + 12 | 0; //@line 10135
 HEAP32[$23 >> 2] = $2; //@line 10136
 $24 = $ReallocAsyncCtx2 + 16 | 0; //@line 10137
 $$expand_i1_val = 0; //@line 10138
 HEAP8[$24 >> 0] = $$expand_i1_val; //@line 10139
 $25 = $ReallocAsyncCtx2 + 20 | 0; //@line 10140
 HEAP32[$25 >> 2] = $10; //@line 10141
 $26 = $ReallocAsyncCtx2 + 24 | 0; //@line 10142
 HEAP32[$26 >> 2] = $12; //@line 10143
 $27 = $ReallocAsyncCtx2 + 28 | 0; //@line 10144
 HEAP32[$27 >> 2] = $6; //@line 10145
 $28 = $ReallocAsyncCtx2 + 32 | 0; //@line 10146
 HEAP32[$28 >> 2] = $8; //@line 10147
 sp = STACKTOP; //@line 10148
 return;
}
function __ZN9TCPSocket4recvEPvj__async_cb($0) {
 $0 = $0 | 0;
 var $$0 = 0, $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $2 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $34 = 0, $4 = 0, $6 = 0, $8 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 13190
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 13192
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 13194
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 13196
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 13198
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 13200
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 13202
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 13204
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 13206
 if (($AsyncRetVal | 0) != -3001 | (HEAP32[$2 >> 2] | 0) == 0) {
  $$0 = $AsyncRetVal; //@line 13212
  HEAP8[$4 >> 0] = 0; //@line 13213
  $34 = ___async_retval; //@line 13214
  HEAP32[$34 >> 2] = $$0; //@line 13215
  return;
 }
 $16 = HEAP32[$6 >> 2] | 0; //@line 13218
 if (!$16) {
  $$0 = -3005; //@line 13221
  HEAP8[$4 >> 0] = 0; //@line 13222
  $34 = ___async_retval; //@line 13223
  HEAP32[$34 >> 2] = $$0; //@line 13224
  return;
 }
 HEAP32[$8 >> 2] = 0; //@line 13227
 $18 = HEAP32[$10 >> 2] | 0; //@line 13228
 $21 = HEAP32[(HEAP32[$18 >> 2] | 0) + 56 >> 2] | 0; //@line 13231
 $ReallocAsyncCtx = _emscripten_realloc_async_context(32) | 0; //@line 13232
 $22 = FUNCTION_TABLE_iiiii[$21 & 15]($18, $16, $12, $14) | 0; //@line 13233
 if (___async) {
  HEAP32[$ReallocAsyncCtx >> 2] = 83; //@line 13236
  $23 = $ReallocAsyncCtx + 4 | 0; //@line 13237
  HEAP32[$23 >> 2] = $2; //@line 13238
  $24 = $ReallocAsyncCtx + 8 | 0; //@line 13239
  HEAP32[$24 >> 2] = $4; //@line 13240
  $25 = $ReallocAsyncCtx + 12 | 0; //@line 13241
  HEAP32[$25 >> 2] = $6; //@line 13242
  $26 = $ReallocAsyncCtx + 16 | 0; //@line 13243
  HEAP32[$26 >> 2] = $8; //@line 13244
  $27 = $ReallocAsyncCtx + 20 | 0; //@line 13245
  HEAP32[$27 >> 2] = $10; //@line 13246
  $28 = $ReallocAsyncCtx + 24 | 0; //@line 13247
  HEAP32[$28 >> 2] = $12; //@line 13248
  $29 = $ReallocAsyncCtx + 28 | 0; //@line 13249
  HEAP32[$29 >> 2] = $14; //@line 13250
  sp = STACKTOP; //@line 13251
  return;
 }
 HEAP32[___async_retval >> 2] = $22; //@line 13255
 ___async_unwind = 0; //@line 13256
 HEAP32[$ReallocAsyncCtx >> 2] = 83; //@line 13257
 $23 = $ReallocAsyncCtx + 4 | 0; //@line 13258
 HEAP32[$23 >> 2] = $2; //@line 13259
 $24 = $ReallocAsyncCtx + 8 | 0; //@line 13260
 HEAP32[$24 >> 2] = $4; //@line 13261
 $25 = $ReallocAsyncCtx + 12 | 0; //@line 13262
 HEAP32[$25 >> 2] = $6; //@line 13263
 $26 = $ReallocAsyncCtx + 16 | 0; //@line 13264
 HEAP32[$26 >> 2] = $8; //@line 13265
 $27 = $ReallocAsyncCtx + 20 | 0; //@line 13266
 HEAP32[$27 >> 2] = $10; //@line 13267
 $28 = $ReallocAsyncCtx + 24 | 0; //@line 13268
 HEAP32[$28 >> 2] = $12; //@line 13269
 $29 = $ReallocAsyncCtx + 28 | 0; //@line 13270
 HEAP32[$29 >> 2] = $14; //@line 13271
 sp = STACKTOP; //@line 13272
 return;
}
function __ZN9UDPSocket8recvfromEP13SocketAddressPvj__async_cb($0) {
 $0 = $0 | 0;
 var $$2 = 0, $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $2 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $34 = 0, $4 = 0, $6 = 0, $8 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 10197
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 10199
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 10201
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 10203
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 10205
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 10207
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 10209
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 10211
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 10213
 if (($AsyncRetVal | 0) != -3001 | (HEAP32[$2 >> 2] | 0) == 0) {
  $$2 = $AsyncRetVal; //@line 10219
  $34 = ___async_retval; //@line 10220
  HEAP32[$34 >> 2] = $$2; //@line 10221
  return;
 }
 $16 = HEAP32[$4 >> 2] | 0; //@line 10224
 if (!$16) {
  $$2 = -3005; //@line 10227
  $34 = ___async_retval; //@line 10228
  HEAP32[$34 >> 2] = $$2; //@line 10229
  return;
 }
 HEAP32[$6 >> 2] = 0; //@line 10232
 $18 = HEAP32[$8 >> 2] | 0; //@line 10233
 $21 = HEAP32[(HEAP32[$18 >> 2] | 0) + 64 >> 2] | 0; //@line 10236
 $ReallocAsyncCtx = _emscripten_realloc_async_context(32) | 0; //@line 10237
 $22 = FUNCTION_TABLE_iiiiii[$21 & 7]($18, $16, $10, $12, $14) | 0; //@line 10238
 if (___async) {
  HEAP32[$ReallocAsyncCtx >> 2] = 90; //@line 10241
  $23 = $ReallocAsyncCtx + 4 | 0; //@line 10242
  HEAP32[$23 >> 2] = $2; //@line 10243
  $24 = $ReallocAsyncCtx + 8 | 0; //@line 10244
  HEAP32[$24 >> 2] = $4; //@line 10245
  $25 = $ReallocAsyncCtx + 12 | 0; //@line 10246
  HEAP32[$25 >> 2] = $6; //@line 10247
  $26 = $ReallocAsyncCtx + 16 | 0; //@line 10248
  HEAP32[$26 >> 2] = $8; //@line 10249
  $27 = $ReallocAsyncCtx + 20 | 0; //@line 10250
  HEAP32[$27 >> 2] = $10; //@line 10251
  $28 = $ReallocAsyncCtx + 24 | 0; //@line 10252
  HEAP32[$28 >> 2] = $12; //@line 10253
  $29 = $ReallocAsyncCtx + 28 | 0; //@line 10254
  HEAP32[$29 >> 2] = $14; //@line 10255
  sp = STACKTOP; //@line 10256
  return;
 }
 HEAP32[___async_retval >> 2] = $22; //@line 10260
 ___async_unwind = 0; //@line 10261
 HEAP32[$ReallocAsyncCtx >> 2] = 90; //@line 10262
 $23 = $ReallocAsyncCtx + 4 | 0; //@line 10263
 HEAP32[$23 >> 2] = $2; //@line 10264
 $24 = $ReallocAsyncCtx + 8 | 0; //@line 10265
 HEAP32[$24 >> 2] = $4; //@line 10266
 $25 = $ReallocAsyncCtx + 12 | 0; //@line 10267
 HEAP32[$25 >> 2] = $6; //@line 10268
 $26 = $ReallocAsyncCtx + 16 | 0; //@line 10269
 HEAP32[$26 >> 2] = $8; //@line 10270
 $27 = $ReallocAsyncCtx + 20 | 0; //@line 10271
 HEAP32[$27 >> 2] = $10; //@line 10272
 $28 = $ReallocAsyncCtx + 24 | 0; //@line 10273
 HEAP32[$28 >> 2] = $12; //@line 10274
 $29 = $ReallocAsyncCtx + 28 | 0; //@line 10275
 HEAP32[$29 >> 2] = $14; //@line 10276
 sp = STACKTOP; //@line 10277
 return;
}
function __ZN12NetworkStack13gethostbynameEPKcP13SocketAddress13nsapi_version($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $$0 = 0, $$09 = 0, $$1 = 0, $$byval_copy = 0, $12 = 0, $13 = 0, $22 = 0, $4 = 0, $5 = 0, $7 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 1063
 STACKTOP = STACKTOP + 112 | 0; //@line 1064
 $$byval_copy = sp + 88 | 0; //@line 1065
 $4 = sp + 24 | 0; //@line 1066
 $5 = sp; //@line 1067
 $7 = ($3 | 0) == 0; //@line 1069
 if (__ZN13SocketAddress14set_ip_addressEPKc($2, $1) | 0) {
  if (!$7) {
   if ((__ZNK13SocketAddress14get_ip_versionEv($2) | 0) != ($3 | 0)) {
    $$09 = -3009; //@line 1075
    STACKTOP = sp; //@line 1076
    return $$09 | 0; //@line 1076
   }
  }
  $$09 = 0; //@line 1079
  STACKTOP = sp; //@line 1080
  return $$09 | 0; //@line 1080
 }
 if ($7) {
  HEAP32[$5 >> 2] = 0; //@line 1083
  HEAP32[$5 + 4 >> 2] = 0; //@line 1083
  HEAP32[$5 + 8 >> 2] = 0; //@line 1083
  HEAP32[$5 + 12 >> 2] = 0; //@line 1083
  HEAP32[$5 + 16 >> 2] = 0; //@line 1083
  HEAP32[$$byval_copy >> 2] = HEAP32[$5 >> 2]; //@line 1084
  HEAP32[$$byval_copy + 4 >> 2] = HEAP32[$5 + 4 >> 2]; //@line 1084
  HEAP32[$$byval_copy + 8 >> 2] = HEAP32[$5 + 8 >> 2]; //@line 1084
  HEAP32[$$byval_copy + 12 >> 2] = HEAP32[$5 + 12 >> 2]; //@line 1084
  HEAP32[$$byval_copy + 16 >> 2] = HEAP32[$5 + 16 >> 2]; //@line 1084
  __ZN13SocketAddressC2E10nsapi_addrt($4, $$byval_copy, 0); //@line 1085
  $12 = HEAP32[(HEAP32[$0 >> 2] | 0) + 8 >> 2] | 0; //@line 1088
  $AsyncCtx = _emscripten_alloc_async_context(28, sp) | 0; //@line 1089
  $13 = FUNCTION_TABLE_ii[$12 & 15]($0) | 0; //@line 1090
  if (___async) {
   HEAP32[$AsyncCtx >> 2] = 55; //@line 1093
   HEAP32[$AsyncCtx + 4 >> 2] = $4; //@line 1095
   HEAP32[$AsyncCtx + 8 >> 2] = $4; //@line 1097
   HEAP32[$AsyncCtx + 12 >> 2] = $3; //@line 1099
   HEAP32[$AsyncCtx + 16 >> 2] = $0; //@line 1101
   HEAP32[$AsyncCtx + 20 >> 2] = $1; //@line 1103
   HEAP32[$AsyncCtx + 24 >> 2] = $2; //@line 1105
   sp = STACKTOP; //@line 1106
   STACKTOP = sp; //@line 1107
   return 0; //@line 1107
  }
  _emscripten_free_async_context($AsyncCtx | 0); //@line 1109
  if (__ZN13SocketAddress14set_ip_addressEPKc($4, $13) | 0) {
   $$0 = __ZNK13SocketAddress14get_ip_versionEv($4) | 0; //@line 1113
  } else {
   $$0 = 0; //@line 1115
  }
  $$1 = $$0; //@line 1117
 } else {
  $$1 = $3; //@line 1119
 }
 $AsyncCtx3 = _emscripten_alloc_async_context(4, sp) | 0; //@line 1121
 $22 = __Z15nsapi_dns_queryP12NetworkStackPKcP13SocketAddress13nsapi_version($0, $1, $2, $$1) | 0; //@line 1122
 if (___async) {
  HEAP32[$AsyncCtx3 >> 2] = 56; //@line 1125
  sp = STACKTOP; //@line 1126
  STACKTOP = sp; //@line 1127
  return 0; //@line 1127
 }
 _emscripten_free_async_context($AsyncCtx3 | 0); //@line 1129
 $$09 = $22; //@line 1130
 STACKTOP = sp; //@line 1131
 return $$09 | 0; //@line 1131
}
function __ZN9UDPSocket6sendtoERK13SocketAddressPKvj__async_cb($0) {
 $0 = $0 | 0;
 var $$2 = 0, $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $2 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $34 = 0, $4 = 0, $6 = 0, $8 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 9589
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 9591
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 9593
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 9595
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 9597
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 9599
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 9601
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 9603
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 9605
 if (($AsyncRetVal | 0) != -3001 | (HEAP32[$2 >> 2] | 0) == 0) {
  $$2 = $AsyncRetVal; //@line 9611
  $34 = ___async_retval; //@line 9612
  HEAP32[$34 >> 2] = $$2; //@line 9613
  return;
 }
 $16 = HEAP32[$4 >> 2] | 0; //@line 9616
 if (!$16) {
  $$2 = -3005; //@line 9619
  $34 = ___async_retval; //@line 9620
  HEAP32[$34 >> 2] = $$2; //@line 9621
  return;
 }
 HEAP32[$6 >> 2] = 0; //@line 9624
 $18 = HEAP32[$8 >> 2] | 0; //@line 9625
 $21 = HEAP32[(HEAP32[$18 >> 2] | 0) + 60 >> 2] | 0; //@line 9628
 $ReallocAsyncCtx = _emscripten_realloc_async_context(32) | 0; //@line 9629
 $22 = FUNCTION_TABLE_iiiiii[$21 & 7]($18, $16, $10, $12, $14) | 0; //@line 9630
 if (___async) {
  HEAP32[$ReallocAsyncCtx >> 2] = 89; //@line 9633
  $23 = $ReallocAsyncCtx + 4 | 0; //@line 9634
  HEAP32[$23 >> 2] = $2; //@line 9635
  $24 = $ReallocAsyncCtx + 8 | 0; //@line 9636
  HEAP32[$24 >> 2] = $4; //@line 9637
  $25 = $ReallocAsyncCtx + 12 | 0; //@line 9638
  HEAP32[$25 >> 2] = $6; //@line 9639
  $26 = $ReallocAsyncCtx + 16 | 0; //@line 9640
  HEAP32[$26 >> 2] = $8; //@line 9641
  $27 = $ReallocAsyncCtx + 20 | 0; //@line 9642
  HEAP32[$27 >> 2] = $10; //@line 9643
  $28 = $ReallocAsyncCtx + 24 | 0; //@line 9644
  HEAP32[$28 >> 2] = $12; //@line 9645
  $29 = $ReallocAsyncCtx + 28 | 0; //@line 9646
  HEAP32[$29 >> 2] = $14; //@line 9647
  sp = STACKTOP; //@line 9648
  return;
 }
 HEAP32[___async_retval >> 2] = $22; //@line 9652
 ___async_unwind = 0; //@line 9653
 HEAP32[$ReallocAsyncCtx >> 2] = 89; //@line 9654
 $23 = $ReallocAsyncCtx + 4 | 0; //@line 9655
 HEAP32[$23 >> 2] = $2; //@line 9656
 $24 = $ReallocAsyncCtx + 8 | 0; //@line 9657
 HEAP32[$24 >> 2] = $4; //@line 9658
 $25 = $ReallocAsyncCtx + 12 | 0; //@line 9659
 HEAP32[$25 >> 2] = $6; //@line 9660
 $26 = $ReallocAsyncCtx + 16 | 0; //@line 9661
 HEAP32[$26 >> 2] = $8; //@line 9662
 $27 = $ReallocAsyncCtx + 20 | 0; //@line 9663
 HEAP32[$27 >> 2] = $10; //@line 9664
 $28 = $ReallocAsyncCtx + 24 | 0; //@line 9665
 HEAP32[$28 >> 2] = $12; //@line 9666
 $29 = $ReallocAsyncCtx + 28 | 0; //@line 9667
 HEAP32[$29 >> 2] = $14; //@line 9668
 sp = STACKTOP; //@line 9669
 return;
}
function __ZN9TCPSocket4sendEPKvj__async_cb_53($0) {
 $0 = $0 | 0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $15 = 0, $18 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $4 = 0, $6 = 0, $8 = 0, $9 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 12516
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 12518
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 12520
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 12522
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 12524
 HEAP8[$2 >> 0] = 1; //@line 12525
 $9 = $4 + 8 | 0; //@line 12526
 $10 = $4 + 52 | 0; //@line 12527
 $11 = $4 + 4 | 0; //@line 12528
 $12 = $4 + 12 | 0; //@line 12529
 $13 = HEAP32[$9 >> 2] | 0; //@line 12530
 if (!$13) {
  HEAP8[$2 >> 0] = 0; //@line 12533
  HEAP32[___async_retval >> 2] = -3005 < 1 & -3005 != -3001 ? -3005 : 0 == 0 ? -3001 : 0; //@line 12541
  return;
 }
 HEAP32[$10 >> 2] = 0; //@line 12544
 $15 = HEAP32[$11 >> 2] | 0; //@line 12545
 $18 = HEAP32[(HEAP32[$15 >> 2] | 0) + 52 >> 2] | 0; //@line 12548
 $ReallocAsyncCtx = _emscripten_realloc_async_context(36) | 0; //@line 12550
 $20 = FUNCTION_TABLE_iiiii[$18 & 15]($15, $13, $6, $8 - 0 | 0) | 0; //@line 12551
 if (___async) {
  HEAP32[$ReallocAsyncCtx >> 2] = 81; //@line 12554
  $21 = $ReallocAsyncCtx + 4 | 0; //@line 12555
  HEAP32[$21 >> 2] = 0; //@line 12556
  $22 = $ReallocAsyncCtx + 8 | 0; //@line 12557
  HEAP32[$22 >> 2] = $8; //@line 12558
  $23 = $ReallocAsyncCtx + 12 | 0; //@line 12559
  HEAP32[$23 >> 2] = $12; //@line 12560
  $24 = $ReallocAsyncCtx + 16 | 0; //@line 12561
  HEAP32[$24 >> 2] = $2; //@line 12562
  $25 = $ReallocAsyncCtx + 20 | 0; //@line 12563
  HEAP32[$25 >> 2] = $9; //@line 12564
  $26 = $ReallocAsyncCtx + 24 | 0; //@line 12565
  HEAP32[$26 >> 2] = $10; //@line 12566
  $27 = $ReallocAsyncCtx + 28 | 0; //@line 12567
  HEAP32[$27 >> 2] = $11; //@line 12568
  $28 = $ReallocAsyncCtx + 32 | 0; //@line 12569
  HEAP32[$28 >> 2] = $6; //@line 12570
  sp = STACKTOP; //@line 12571
  return;
 }
 HEAP32[___async_retval >> 2] = $20; //@line 12575
 ___async_unwind = 0; //@line 12576
 HEAP32[$ReallocAsyncCtx >> 2] = 81; //@line 12577
 $21 = $ReallocAsyncCtx + 4 | 0; //@line 12578
 HEAP32[$21 >> 2] = 0; //@line 12579
 $22 = $ReallocAsyncCtx + 8 | 0; //@line 12580
 HEAP32[$22 >> 2] = $8; //@line 12581
 $23 = $ReallocAsyncCtx + 12 | 0; //@line 12582
 HEAP32[$23 >> 2] = $12; //@line 12583
 $24 = $ReallocAsyncCtx + 16 | 0; //@line 12584
 HEAP32[$24 >> 2] = $2; //@line 12585
 $25 = $ReallocAsyncCtx + 20 | 0; //@line 12586
 HEAP32[$25 >> 2] = $9; //@line 12587
 $26 = $ReallocAsyncCtx + 24 | 0; //@line 12588
 HEAP32[$26 >> 2] = $10; //@line 12589
 $27 = $ReallocAsyncCtx + 28 | 0; //@line 12590
 HEAP32[$27 >> 2] = $11; //@line 12591
 $28 = $ReallocAsyncCtx + 32 | 0; //@line 12592
 HEAP32[$28 >> 2] = $6; //@line 12593
 sp = STACKTOP; //@line 12594
 return;
}
function __ZN6Socket4openEP12NetworkStack__async_cb_59($0) {
 $0 = $0 | 0;
 var $$pre$i$i = 0, $10 = 0, $12 = 0, $14 = 0, $15 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $27 = 0, $28 = 0, $29 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx5 = 0, $ReallocAsyncCtx6 = 0, sp = 0;
 sp = STACKTOP; //@line 13016
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 13022
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 13024
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 13026
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 13028
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 13030
 $$pre$i$i = HEAP32[HEAP32[$0 + 4 >> 2] >> 2] | 0; //@line 13031
 $15 = $$pre$i$i; //@line 13032
 HEAP32[HEAP32[$0 + 8 >> 2] >> 2] = $$pre$i$i; //@line 13033
 if (!$$pre$i$i) {
  $24 = HEAP32[$8 >> 2] | 0; //@line 13036
  $27 = HEAP32[(HEAP32[$24 >> 2] | 0) + 68 >> 2] | 0; //@line 13039
  $28 = HEAP32[$10 >> 2] | 0; //@line 13040
  $ReallocAsyncCtx6 = _emscripten_realloc_async_context(8) | 0; //@line 13041
  FUNCTION_TABLE_viiii[$27 & 7]($24, $28, 64, $12); //@line 13042
  if (___async) {
   HEAP32[$ReallocAsyncCtx6 >> 2] = 65; //@line 13045
   $29 = $ReallocAsyncCtx6 + 4 | 0; //@line 13046
   HEAP32[$29 >> 2] = $14; //@line 13047
   sp = STACKTOP; //@line 13048
   return;
  }
  ___async_unwind = 0; //@line 13051
  HEAP32[$ReallocAsyncCtx6 >> 2] = 65; //@line 13052
  $29 = $ReallocAsyncCtx6 + 4 | 0; //@line 13053
  HEAP32[$29 >> 2] = $14; //@line 13054
  sp = STACKTOP; //@line 13055
  return;
 } else {
  $18 = HEAP32[$15 + 8 >> 2] | 0; //@line 13059
  $ReallocAsyncCtx5 = _emscripten_realloc_async_context(24) | 0; //@line 13060
  FUNCTION_TABLE_vi[$18 & 255]($6); //@line 13061
  if (___async) {
   HEAP32[$ReallocAsyncCtx5 >> 2] = 63; //@line 13064
   $19 = $ReallocAsyncCtx5 + 4 | 0; //@line 13065
   HEAP32[$19 >> 2] = $6; //@line 13066
   $20 = $ReallocAsyncCtx5 + 8 | 0; //@line 13067
   HEAP32[$20 >> 2] = $8; //@line 13068
   $21 = $ReallocAsyncCtx5 + 12 | 0; //@line 13069
   HEAP32[$21 >> 2] = $10; //@line 13070
   $22 = $ReallocAsyncCtx5 + 16 | 0; //@line 13071
   HEAP32[$22 >> 2] = $12; //@line 13072
   $23 = $ReallocAsyncCtx5 + 20 | 0; //@line 13073
   HEAP32[$23 >> 2] = $14; //@line 13074
   sp = STACKTOP; //@line 13075
   return;
  }
  ___async_unwind = 0; //@line 13078
  HEAP32[$ReallocAsyncCtx5 >> 2] = 63; //@line 13079
  $19 = $ReallocAsyncCtx5 + 4 | 0; //@line 13080
  HEAP32[$19 >> 2] = $6; //@line 13081
  $20 = $ReallocAsyncCtx5 + 8 | 0; //@line 13082
  HEAP32[$20 >> 2] = $8; //@line 13083
  $21 = $ReallocAsyncCtx5 + 12 | 0; //@line 13084
  HEAP32[$21 >> 2] = $10; //@line 13085
  $22 = $ReallocAsyncCtx5 + 16 | 0; //@line 13086
  HEAP32[$22 >> 2] = $12; //@line 13087
  $23 = $ReallocAsyncCtx5 + 20 | 0; //@line 13088
  HEAP32[$23 >> 2] = $14; //@line 13089
  sp = STACKTOP; //@line 13090
  return;
 }
}
function __ZNK10__cxxabiv121__vmi_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb_25($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $20 = 0, $22 = 0, $24 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 11185
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 11189
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 11191
 $8 = HEAP8[$0 + 16 >> 0] | 0; //@line 11193
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 11195
 $12 = HEAP8[$0 + 24 >> 0] | 0; //@line 11197
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 11199
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 11201
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 11203
 $20 = HEAP32[$0 + 40 >> 2] | 0; //@line 11205
 $22 = HEAP8[$0 + 44 >> 0] & 1; //@line 11208
 $24 = HEAP32[$0 + 48 >> 2] | 0; //@line 11210
 do {
  if ((HEAP32[$0 + 4 >> 2] | 0) > 1) {
   $26 = $4 + 24 | 0; //@line 11214
   $27 = $6 + 24 | 0; //@line 11215
   $28 = $4 + 8 | 0; //@line 11216
   $29 = $6 + 54 | 0; //@line 11217
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
    HEAP8[$10 >> 0] = 0; //@line 11247
    HEAP8[$14 >> 0] = 0; //@line 11248
    $ReallocAsyncCtx = _emscripten_realloc_async_context(60) | 0; //@line 11249
    __ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($26, $6, $16, $18, $20, $22); //@line 11250
    if (!___async) {
     ___async_unwind = 0; //@line 11253
    }
    HEAP32[$ReallocAsyncCtx >> 2] = 163; //@line 11255
    HEAP32[$ReallocAsyncCtx + 4 >> 2] = $26; //@line 11257
    HEAP32[$ReallocAsyncCtx + 8 >> 2] = $24; //@line 11259
    HEAP32[$ReallocAsyncCtx + 12 >> 2] = $29; //@line 11261
    HEAP8[$ReallocAsyncCtx + 16 >> 0] = $8; //@line 11263
    HEAP32[$ReallocAsyncCtx + 20 >> 2] = $10; //@line 11265
    HEAP8[$ReallocAsyncCtx + 24 >> 0] = $12; //@line 11267
    HEAP32[$ReallocAsyncCtx + 28 >> 2] = $14; //@line 11269
    HEAP32[$ReallocAsyncCtx + 32 >> 2] = $27; //@line 11271
    HEAP32[$ReallocAsyncCtx + 36 >> 2] = $28; //@line 11273
    HEAP32[$ReallocAsyncCtx + 40 >> 2] = $6; //@line 11275
    HEAP32[$ReallocAsyncCtx + 44 >> 2] = $16; //@line 11277
    HEAP32[$ReallocAsyncCtx + 48 >> 2] = $18; //@line 11279
    HEAP32[$ReallocAsyncCtx + 52 >> 2] = $20; //@line 11281
    HEAP8[$ReallocAsyncCtx + 56 >> 0] = $22 & 1; //@line 11284
    sp = STACKTOP; //@line 11285
    return;
   }
  }
 } while (0);
 HEAP8[$10 >> 0] = $8; //@line 11290
 HEAP8[$14 >> 0] = $12; //@line 11291
 return;
}
function __ZNK10__cxxabiv121__vmi_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $20 = 0, $22 = 0, $24 = 0, $26 = 0, $28 = 0, $4 = 0, $43 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 11069
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 11073
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 11075
 $8 = HEAP8[$0 + 16 >> 0] | 0; //@line 11077
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 11079
 $12 = HEAP8[$0 + 24 >> 0] | 0; //@line 11081
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 11083
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 11085
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 11087
 $20 = HEAP32[$0 + 40 >> 2] | 0; //@line 11089
 $22 = HEAP32[$0 + 44 >> 2] | 0; //@line 11091
 $24 = HEAP32[$0 + 48 >> 2] | 0; //@line 11093
 $26 = HEAP32[$0 + 52 >> 2] | 0; //@line 11095
 $28 = HEAP8[$0 + 56 >> 0] & 1; //@line 11098
 $43 = (HEAP32[$0 + 4 >> 2] | 0) + 8 | 0; //@line 11099
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
    HEAP8[$10 >> 0] = 0; //@line 11132
    HEAP8[$14 >> 0] = 0; //@line 11133
    $ReallocAsyncCtx = _emscripten_realloc_async_context(60) | 0; //@line 11134
    __ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($43, $20, $22, $24, $26, $28); //@line 11135
    if (!___async) {
     ___async_unwind = 0; //@line 11138
    }
    HEAP32[$ReallocAsyncCtx >> 2] = 163; //@line 11140
    HEAP32[$ReallocAsyncCtx + 4 >> 2] = $43; //@line 11142
    HEAP32[$ReallocAsyncCtx + 8 >> 2] = $4; //@line 11144
    HEAP32[$ReallocAsyncCtx + 12 >> 2] = $6; //@line 11146
    HEAP8[$ReallocAsyncCtx + 16 >> 0] = $8; //@line 11148
    HEAP32[$ReallocAsyncCtx + 20 >> 2] = $10; //@line 11150
    HEAP8[$ReallocAsyncCtx + 24 >> 0] = $12; //@line 11152
    HEAP32[$ReallocAsyncCtx + 28 >> 2] = $14; //@line 11154
    HEAP32[$ReallocAsyncCtx + 32 >> 2] = $16; //@line 11156
    HEAP32[$ReallocAsyncCtx + 36 >> 2] = $18; //@line 11158
    HEAP32[$ReallocAsyncCtx + 40 >> 2] = $20; //@line 11160
    HEAP32[$ReallocAsyncCtx + 44 >> 2] = $22; //@line 11162
    HEAP32[$ReallocAsyncCtx + 48 >> 2] = $24; //@line 11164
    HEAP32[$ReallocAsyncCtx + 52 >> 2] = $26; //@line 11166
    HEAP8[$ReallocAsyncCtx + 56 >> 0] = $28 & 1; //@line 11169
    sp = STACKTOP; //@line 11170
    return;
   }
  }
 } while (0);
 HEAP8[$10 >> 0] = $8; //@line 11175
 HEAP8[$14 >> 0] = $12; //@line 11176
 return;
}
function _memcpy(dest, src, num) {
 dest = dest | 0;
 src = src | 0;
 num = num | 0;
 var ret = 0, aligned_dest_end = 0, block_aligned_dest_end = 0, dest_end = 0;
 if ((num | 0) >= 8192) {
  return _emscripten_memcpy_big(dest | 0, src | 0, num | 0) | 0; //@line 3475
 }
 ret = dest | 0; //@line 3478
 dest_end = dest + num | 0; //@line 3479
 if ((dest & 3) == (src & 3)) {
  while (dest & 3) {
   if (!num) return ret | 0; //@line 3483
   HEAP8[dest >> 0] = HEAP8[src >> 0] | 0; //@line 3484
   dest = dest + 1 | 0; //@line 3485
   src = src + 1 | 0; //@line 3486
   num = num - 1 | 0; //@line 3487
  }
  aligned_dest_end = dest_end & -4 | 0; //@line 3489
  block_aligned_dest_end = aligned_dest_end - 64 | 0; //@line 3490
  while ((dest | 0) <= (block_aligned_dest_end | 0)) {
   HEAP32[dest >> 2] = HEAP32[src >> 2]; //@line 3492
   HEAP32[dest + 4 >> 2] = HEAP32[src + 4 >> 2]; //@line 3493
   HEAP32[dest + 8 >> 2] = HEAP32[src + 8 >> 2]; //@line 3494
   HEAP32[dest + 12 >> 2] = HEAP32[src + 12 >> 2]; //@line 3495
   HEAP32[dest + 16 >> 2] = HEAP32[src + 16 >> 2]; //@line 3496
   HEAP32[dest + 20 >> 2] = HEAP32[src + 20 >> 2]; //@line 3497
   HEAP32[dest + 24 >> 2] = HEAP32[src + 24 >> 2]; //@line 3498
   HEAP32[dest + 28 >> 2] = HEAP32[src + 28 >> 2]; //@line 3499
   HEAP32[dest + 32 >> 2] = HEAP32[src + 32 >> 2]; //@line 3500
   HEAP32[dest + 36 >> 2] = HEAP32[src + 36 >> 2]; //@line 3501
   HEAP32[dest + 40 >> 2] = HEAP32[src + 40 >> 2]; //@line 3502
   HEAP32[dest + 44 >> 2] = HEAP32[src + 44 >> 2]; //@line 3503
   HEAP32[dest + 48 >> 2] = HEAP32[src + 48 >> 2]; //@line 3504
   HEAP32[dest + 52 >> 2] = HEAP32[src + 52 >> 2]; //@line 3505
   HEAP32[dest + 56 >> 2] = HEAP32[src + 56 >> 2]; //@line 3506
   HEAP32[dest + 60 >> 2] = HEAP32[src + 60 >> 2]; //@line 3507
   dest = dest + 64 | 0; //@line 3508
   src = src + 64 | 0; //@line 3509
  }
  while ((dest | 0) < (aligned_dest_end | 0)) {
   HEAP32[dest >> 2] = HEAP32[src >> 2]; //@line 3512
   dest = dest + 4 | 0; //@line 3513
   src = src + 4 | 0; //@line 3514
  }
 } else {
  aligned_dest_end = dest_end - 4 | 0; //@line 3518
  while ((dest | 0) < (aligned_dest_end | 0)) {
   HEAP8[dest >> 0] = HEAP8[src >> 0] | 0; //@line 3520
   HEAP8[dest + 1 >> 0] = HEAP8[src + 1 >> 0] | 0; //@line 3521
   HEAP8[dest + 2 >> 0] = HEAP8[src + 2 >> 0] | 0; //@line 3522
   HEAP8[dest + 3 >> 0] = HEAP8[src + 3 >> 0] | 0; //@line 3523
   dest = dest + 4 | 0; //@line 3524
   src = src + 4 | 0; //@line 3525
  }
 }
 while ((dest | 0) < (dest_end | 0)) {
  HEAP8[dest >> 0] = HEAP8[src >> 0] | 0; //@line 3530
  dest = dest + 1 | 0; //@line 3531
  src = src + 1 | 0; //@line 3532
 }
 return ret | 0; //@line 3534
}
function __ZN9TCPSocket4recvEPvj__async_cb_62($0) {
 $0 = $0 | 0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $15 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $4 = 0, $6 = 0, $8 = 0, $9 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 13279
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 13281
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 13283
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 13285
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 13287
 HEAP8[$2 >> 0] = 1; //@line 13288
 $9 = $4 + 8 | 0; //@line 13289
 $10 = $4 + 52 | 0; //@line 13290
 $11 = $4 + 4 | 0; //@line 13291
 $12 = $4 + 12 | 0; //@line 13292
 $13 = HEAP32[$9 >> 2] | 0; //@line 13293
 if (!$13) {
  HEAP8[$2 >> 0] = 0; //@line 13296
  HEAP32[___async_retval >> 2] = -3005; //@line 13298
  return;
 }
 HEAP32[$10 >> 2] = 0; //@line 13301
 $15 = HEAP32[$11 >> 2] | 0; //@line 13302
 $18 = HEAP32[(HEAP32[$15 >> 2] | 0) + 56 >> 2] | 0; //@line 13305
 $ReallocAsyncCtx = _emscripten_realloc_async_context(32) | 0; //@line 13306
 $19 = FUNCTION_TABLE_iiiii[$18 & 15]($15, $13, $6, $8) | 0; //@line 13307
 if (___async) {
  HEAP32[$ReallocAsyncCtx >> 2] = 83; //@line 13310
  $20 = $ReallocAsyncCtx + 4 | 0; //@line 13311
  HEAP32[$20 >> 2] = $12; //@line 13312
  $21 = $ReallocAsyncCtx + 8 | 0; //@line 13313
  HEAP32[$21 >> 2] = $2; //@line 13314
  $22 = $ReallocAsyncCtx + 12 | 0; //@line 13315
  HEAP32[$22 >> 2] = $9; //@line 13316
  $23 = $ReallocAsyncCtx + 16 | 0; //@line 13317
  HEAP32[$23 >> 2] = $10; //@line 13318
  $24 = $ReallocAsyncCtx + 20 | 0; //@line 13319
  HEAP32[$24 >> 2] = $11; //@line 13320
  $25 = $ReallocAsyncCtx + 24 | 0; //@line 13321
  HEAP32[$25 >> 2] = $6; //@line 13322
  $26 = $ReallocAsyncCtx + 28 | 0; //@line 13323
  HEAP32[$26 >> 2] = $8; //@line 13324
  sp = STACKTOP; //@line 13325
  return;
 }
 HEAP32[___async_retval >> 2] = $19; //@line 13329
 ___async_unwind = 0; //@line 13330
 HEAP32[$ReallocAsyncCtx >> 2] = 83; //@line 13331
 $20 = $ReallocAsyncCtx + 4 | 0; //@line 13332
 HEAP32[$20 >> 2] = $12; //@line 13333
 $21 = $ReallocAsyncCtx + 8 | 0; //@line 13334
 HEAP32[$21 >> 2] = $2; //@line 13335
 $22 = $ReallocAsyncCtx + 12 | 0; //@line 13336
 HEAP32[$22 >> 2] = $9; //@line 13337
 $23 = $ReallocAsyncCtx + 16 | 0; //@line 13338
 HEAP32[$23 >> 2] = $10; //@line 13339
 $24 = $ReallocAsyncCtx + 20 | 0; //@line 13340
 HEAP32[$24 >> 2] = $11; //@line 13341
 $25 = $ReallocAsyncCtx + 24 | 0; //@line 13342
 HEAP32[$25 >> 2] = $6; //@line 13343
 $26 = $ReallocAsyncCtx + 28 | 0; //@line 13344
 HEAP32[$26 >> 2] = $8; //@line 13345
 sp = STACKTOP; //@line 13346
 return;
}
function __ZNK10__cxxabiv121__vmi_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $$0 = 0, $10 = 0, $19 = 0, $28 = 0, $9 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 8589
 L1 : do {
  if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, 0) | 0) {
   __ZNK10__cxxabiv117__class_type_info24process_found_base_classEPNS_19__dynamic_cast_infoEPvi(0, $1, $2, $3); //@line 8595
  } else {
   $9 = HEAP32[$0 + 12 >> 2] | 0; //@line 8599
   $10 = $0 + 16 + ($9 << 3) | 0; //@line 8600
   $AsyncCtx3 = _emscripten_alloc_async_context(28, sp) | 0; //@line 8601
   __ZNK10__cxxabiv122__base_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($0 + 16 | 0, $1, $2, $3); //@line 8602
   if (___async) {
    HEAP32[$AsyncCtx3 >> 2] = 169; //@line 8605
    HEAP32[$AsyncCtx3 + 4 >> 2] = $9; //@line 8607
    HEAP32[$AsyncCtx3 + 8 >> 2] = $0; //@line 8609
    HEAP32[$AsyncCtx3 + 12 >> 2] = $1; //@line 8611
    HEAP32[$AsyncCtx3 + 16 >> 2] = $2; //@line 8613
    HEAP32[$AsyncCtx3 + 20 >> 2] = $3; //@line 8615
    HEAP32[$AsyncCtx3 + 24 >> 2] = $10; //@line 8617
    sp = STACKTOP; //@line 8618
    return;
   }
   _emscripten_free_async_context($AsyncCtx3 | 0); //@line 8621
   if (($9 | 0) > 1) {
    $19 = $1 + 54 | 0; //@line 8625
    $$0 = $0 + 24 | 0; //@line 8626
    while (1) {
     $AsyncCtx = _emscripten_alloc_async_context(28, sp) | 0; //@line 8628
     __ZNK10__cxxabiv122__base_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($$0, $1, $2, $3); //@line 8629
     if (___async) {
      break;
     }
     _emscripten_free_async_context($AsyncCtx | 0); //@line 8634
     if (HEAP8[$19 >> 0] | 0) {
      break L1;
     }
     $28 = $$0 + 8 | 0; //@line 8640
     if ($28 >>> 0 < $10 >>> 0) {
      $$0 = $28; //@line 8643
     } else {
      break L1;
     }
    }
    HEAP32[$AsyncCtx >> 2] = 170; //@line 8648
    HEAP32[$AsyncCtx + 4 >> 2] = $19; //@line 8650
    HEAP32[$AsyncCtx + 8 >> 2] = $$0; //@line 8652
    HEAP32[$AsyncCtx + 12 >> 2] = $10; //@line 8654
    HEAP32[$AsyncCtx + 16 >> 2] = $1; //@line 8656
    HEAP32[$AsyncCtx + 20 >> 2] = $2; //@line 8658
    HEAP32[$AsyncCtx + 24 >> 2] = $3; //@line 8660
    sp = STACKTOP; //@line 8661
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
 sp = STACKTOP; //@line 7257
 STACKTOP = STACKTOP + 64 | 0; //@line 7258
 $3 = sp; //@line 7259
 if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, $1, 0) | 0) {
  $$2 = 1; //@line 7262
 } else {
  if (!$1) {
   $$2 = 0; //@line 7266
  } else {
   $AsyncCtx3 = _emscripten_alloc_async_context(16, sp) | 0; //@line 7268
   $6 = ___dynamic_cast($1, 120, 104, 0) | 0; //@line 7269
   if (___async) {
    HEAP32[$AsyncCtx3 >> 2] = 152; //@line 7272
    HEAP32[$AsyncCtx3 + 4 >> 2] = $3; //@line 7274
    HEAP32[$AsyncCtx3 + 8 >> 2] = $0; //@line 7276
    HEAP32[$AsyncCtx3 + 12 >> 2] = $2; //@line 7278
    sp = STACKTOP; //@line 7279
    STACKTOP = sp; //@line 7280
    return 0; //@line 7280
   }
   _emscripten_free_async_context($AsyncCtx3 | 0); //@line 7282
   if (!$6) {
    $$2 = 0; //@line 7285
   } else {
    dest = $3 + 4 | 0; //@line 7288
    stop = dest + 52 | 0; //@line 7288
    do {
     HEAP32[dest >> 2] = 0; //@line 7288
     dest = dest + 4 | 0; //@line 7288
    } while ((dest | 0) < (stop | 0));
    HEAP32[$3 >> 2] = $6; //@line 7289
    HEAP32[$3 + 8 >> 2] = $0; //@line 7291
    HEAP32[$3 + 12 >> 2] = -1; //@line 7293
    HEAP32[$3 + 48 >> 2] = 1; //@line 7295
    $17 = HEAP32[(HEAP32[$6 >> 2] | 0) + 28 >> 2] | 0; //@line 7298
    $18 = HEAP32[$2 >> 2] | 0; //@line 7299
    $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 7300
    FUNCTION_TABLE_viiii[$17 & 7]($6, $3, $18, 1); //@line 7301
    if (___async) {
     HEAP32[$AsyncCtx >> 2] = 153; //@line 7304
     HEAP32[$AsyncCtx + 4 >> 2] = $3; //@line 7306
     HEAP32[$AsyncCtx + 8 >> 2] = $2; //@line 7308
     HEAP32[$AsyncCtx + 12 >> 2] = $3; //@line 7310
     sp = STACKTOP; //@line 7311
     STACKTOP = sp; //@line 7312
     return 0; //@line 7312
    }
    _emscripten_free_async_context($AsyncCtx | 0); //@line 7314
    if ((HEAP32[$3 + 24 >> 2] | 0) == 1) {
     HEAP32[$2 >> 2] = HEAP32[$3 + 16 >> 2]; //@line 7321
     $$0 = 1; //@line 7322
    } else {
     $$0 = 0; //@line 7324
    }
    $$2 = $$0; //@line 7326
   }
  }
 }
 STACKTOP = sp; //@line 7330
 return $$2 | 0; //@line 7330
}
function __ZN9TCPSocket4recvEPvj($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$0 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $16 = 0, $19 = 0, $20 = 0, $3 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 3132
 $3 = $0 + 56 | 0; //@line 3133
 do {
  if (HEAP8[$3 >> 0] | 0) {
   $AsyncCtx3 = _emscripten_alloc_async_context(20, sp) | 0; //@line 3138
   _mbed_assert_internal(3307, 3210, 190); //@line 3139
   if (___async) {
    HEAP32[$AsyncCtx3 >> 2] = 82; //@line 3142
    HEAP32[$AsyncCtx3 + 4 >> 2] = $3; //@line 3144
    HEAP32[$AsyncCtx3 + 8 >> 2] = $0; //@line 3146
    HEAP32[$AsyncCtx3 + 12 >> 2] = $1; //@line 3148
    HEAP32[$AsyncCtx3 + 16 >> 2] = $2; //@line 3150
    sp = STACKTOP; //@line 3151
    return 0; //@line 3152
   } else {
    _emscripten_free_async_context($AsyncCtx3 | 0); //@line 3154
    break;
   }
  }
 } while (0);
 HEAP8[$3 >> 0] = 1; //@line 3159
 $10 = $0 + 8 | 0; //@line 3160
 $11 = $0 + 52 | 0; //@line 3161
 $12 = $0 + 4 | 0; //@line 3162
 $13 = $0 + 12 | 0; //@line 3163
 while (1) {
  $14 = HEAP32[$10 >> 2] | 0; //@line 3165
  if (!$14) {
   $$0 = -3005; //@line 3168
   label = 10; //@line 3169
   break;
  }
  HEAP32[$11 >> 2] = 0; //@line 3172
  $16 = HEAP32[$12 >> 2] | 0; //@line 3173
  $19 = HEAP32[(HEAP32[$16 >> 2] | 0) + 56 >> 2] | 0; //@line 3176
  $AsyncCtx = _emscripten_alloc_async_context(32, sp) | 0; //@line 3177
  $20 = FUNCTION_TABLE_iiiii[$19 & 15]($16, $14, $1, $2) | 0; //@line 3178
  if (___async) {
   label = 8; //@line 3181
   break;
  }
  _emscripten_free_async_context($AsyncCtx | 0); //@line 3184
  if (($20 | 0) != -3001 | (HEAP32[$13 >> 2] | 0) == 0) {
   $$0 = $20; //@line 3190
   label = 10; //@line 3191
   break;
  }
 }
 if ((label | 0) == 8) {
  HEAP32[$AsyncCtx >> 2] = 83; //@line 3196
  HEAP32[$AsyncCtx + 4 >> 2] = $13; //@line 3198
  HEAP32[$AsyncCtx + 8 >> 2] = $3; //@line 3200
  HEAP32[$AsyncCtx + 12 >> 2] = $10; //@line 3202
  HEAP32[$AsyncCtx + 16 >> 2] = $11; //@line 3204
  HEAP32[$AsyncCtx + 20 >> 2] = $12; //@line 3206
  HEAP32[$AsyncCtx + 24 >> 2] = $1; //@line 3208
  HEAP32[$AsyncCtx + 28 >> 2] = $2; //@line 3210
  sp = STACKTOP; //@line 3211
  return 0; //@line 3212
 } else if ((label | 0) == 10) {
  HEAP8[$3 >> 0] = 0; //@line 3215
  return $$0 | 0; //@line 3216
 }
 return 0; //@line 3218
}
function __ZThn4_N17EthernetInterface11socket_openEPPv14nsapi_protocol($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$0$i = 0, $$byval_copy = 0, $3 = 0, $4 = 0, $8 = 0, $9 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, dest = 0, sp = 0, stop = 0;
 sp = STACKTOP; //@line 594
 STACKTOP = STACKTOP + 48 | 0; //@line 595
 $$byval_copy = sp + 20 | 0; //@line 596
 $3 = sp; //@line 597
 $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 598
 $4 = __Znwj(76) | 0; //@line 599
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 39; //@line 602
  HEAP32[$AsyncCtx + 4 >> 2] = $3; //@line 604
  HEAP32[$AsyncCtx + 8 >> 2] = $2; //@line 606
  HEAP32[$AsyncCtx + 12 >> 2] = $1; //@line 608
  sp = STACKTOP; //@line 609
  STACKTOP = sp; //@line 610
  return 0; //@line 610
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 612
 dest = $4; //@line 613
 stop = dest + 76 | 0; //@line 613
 do {
  HEAP32[dest >> 2] = 0; //@line 613
  dest = dest + 4 | 0; //@line 613
 } while ((dest | 0) < (stop | 0));
 $8 = $4 + 12 | 0; //@line 614
 HEAP32[$3 >> 2] = 0; //@line 615
 HEAP32[$3 + 4 >> 2] = 0; //@line 615
 HEAP32[$3 + 8 >> 2] = 0; //@line 615
 HEAP32[$3 + 12 >> 2] = 0; //@line 615
 HEAP32[$3 + 16 >> 2] = 0; //@line 615
 HEAP32[$$byval_copy >> 2] = HEAP32[$3 >> 2]; //@line 616
 HEAP32[$$byval_copy + 4 >> 2] = HEAP32[$3 + 4 >> 2]; //@line 616
 HEAP32[$$byval_copy + 8 >> 2] = HEAP32[$3 + 8 >> 2]; //@line 616
 HEAP32[$$byval_copy + 12 >> 2] = HEAP32[$3 + 12 >> 2]; //@line 616
 HEAP32[$$byval_copy + 16 >> 2] = HEAP32[$3 + 16 >> 2]; //@line 616
 __ZN13SocketAddressC2E10nsapi_addrt($8, $$byval_copy, 0); //@line 617
 $9 = _emscripten_asm_const_ii(3, $2 | 0) | 0; //@line 618
 if (($9 | 0) == -1) {
  $$0$i = -3001; //@line 621
  STACKTOP = sp; //@line 622
  return $$0$i | 0; //@line 622
 }
 HEAP32[$4 >> 2] = $9; //@line 624
 HEAP8[$4 + 8 >> 0] = 0; //@line 626
 HEAP32[$4 + 4 >> 2] = $2; //@line 628
 HEAP32[$1 >> 2] = $4; //@line 629
 $AsyncCtx3 = _emscripten_alloc_async_context(4, sp) | 0; //@line 630
 _wait_ms(1); //@line 631
 if (___async) {
  HEAP32[$AsyncCtx3 >> 2] = 40; //@line 634
  sp = STACKTOP; //@line 635
  STACKTOP = sp; //@line 636
  return 0; //@line 636
 }
 _emscripten_free_async_context($AsyncCtx3 | 0); //@line 638
 $$0$i = 0; //@line 639
 STACKTOP = sp; //@line 640
 return $$0$i | 0; //@line 640
}
function __ZN17EthernetInterface11socket_openEPPv14nsapi_protocol($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$0 = 0, $$byval_copy = 0, $3 = 0, $4 = 0, $8 = 0, $9 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, dest = 0, sp = 0, stop = 0;
 sp = STACKTOP; //@line 197
 STACKTOP = STACKTOP + 48 | 0; //@line 198
 $$byval_copy = sp + 20 | 0; //@line 199
 $3 = sp; //@line 200
 $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 201
 $4 = __Znwj(76) | 0; //@line 202
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 26; //@line 205
  HEAP32[$AsyncCtx + 4 >> 2] = $3; //@line 207
  HEAP32[$AsyncCtx + 8 >> 2] = $2; //@line 209
  HEAP32[$AsyncCtx + 12 >> 2] = $1; //@line 211
  sp = STACKTOP; //@line 212
  STACKTOP = sp; //@line 213
  return 0; //@line 213
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 215
 dest = $4; //@line 216
 stop = dest + 76 | 0; //@line 216
 do {
  HEAP32[dest >> 2] = 0; //@line 216
  dest = dest + 4 | 0; //@line 216
 } while ((dest | 0) < (stop | 0));
 $8 = $4 + 12 | 0; //@line 217
 HEAP32[$3 >> 2] = 0; //@line 218
 HEAP32[$3 + 4 >> 2] = 0; //@line 218
 HEAP32[$3 + 8 >> 2] = 0; //@line 218
 HEAP32[$3 + 12 >> 2] = 0; //@line 218
 HEAP32[$3 + 16 >> 2] = 0; //@line 218
 HEAP32[$$byval_copy >> 2] = HEAP32[$3 >> 2]; //@line 219
 HEAP32[$$byval_copy + 4 >> 2] = HEAP32[$3 + 4 >> 2]; //@line 219
 HEAP32[$$byval_copy + 8 >> 2] = HEAP32[$3 + 8 >> 2]; //@line 219
 HEAP32[$$byval_copy + 12 >> 2] = HEAP32[$3 + 12 >> 2]; //@line 219
 HEAP32[$$byval_copy + 16 >> 2] = HEAP32[$3 + 16 >> 2]; //@line 219
 __ZN13SocketAddressC2E10nsapi_addrt($8, $$byval_copy, 0); //@line 220
 $9 = _emscripten_asm_const_ii(3, $2 | 0) | 0; //@line 221
 if (($9 | 0) == -1) {
  $$0 = -3001; //@line 224
  STACKTOP = sp; //@line 225
  return $$0 | 0; //@line 225
 }
 HEAP32[$4 >> 2] = $9; //@line 227
 HEAP8[$4 + 8 >> 0] = 0; //@line 229
 HEAP32[$4 + 4 >> 2] = $2; //@line 231
 HEAP32[$1 >> 2] = $4; //@line 232
 $AsyncCtx3 = _emscripten_alloc_async_context(4, sp) | 0; //@line 233
 _wait_ms(1); //@line 234
 if (___async) {
  HEAP32[$AsyncCtx3 >> 2] = 27; //@line 237
  sp = STACKTOP; //@line 238
  STACKTOP = sp; //@line 239
  return 0; //@line 239
 }
 _emscripten_free_async_context($AsyncCtx3 | 0); //@line 241
 $$0 = 0; //@line 242
 STACKTOP = sp; //@line 243
 return $$0 | 0; //@line 243
}
function ___mo_lookup($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$090 = 0, $$094 = 0, $$4 = 0, $10 = 0, $13 = 0, $17 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $31 = 0, $35 = 0, $4 = 0, $44 = 0, $46 = 0, $49 = 0, $53 = 0, $63 = 0, $7 = 0;
 $4 = (HEAP32[$0 >> 2] | 0) + 1794895138 | 0; //@line 10540
 $7 = _swapc(HEAP32[$0 + 8 >> 2] | 0, $4) | 0; //@line 10543
 $10 = _swapc(HEAP32[$0 + 12 >> 2] | 0, $4) | 0; //@line 10546
 $13 = _swapc(HEAP32[$0 + 16 >> 2] | 0, $4) | 0; //@line 10549
 L1 : do {
  if ($7 >>> 0 < $1 >>> 2 >>> 0) {
   $17 = $1 - ($7 << 2) | 0; //@line 10555
   if ($10 >>> 0 < $17 >>> 0 & $13 >>> 0 < $17 >>> 0) {
    if (!(($13 | $10) & 3)) {
     $23 = $10 >>> 2; //@line 10564
     $24 = $13 >>> 2; //@line 10565
     $$090 = 0; //@line 10566
     $$094 = $7; //@line 10566
     while (1) {
      $25 = $$094 >>> 1; //@line 10568
      $26 = $$090 + $25 | 0; //@line 10569
      $27 = $26 << 1; //@line 10570
      $28 = $27 + $23 | 0; //@line 10571
      $31 = _swapc(HEAP32[$0 + ($28 << 2) >> 2] | 0, $4) | 0; //@line 10574
      $35 = _swapc(HEAP32[$0 + ($28 + 1 << 2) >> 2] | 0, $4) | 0; //@line 10578
      if (!($35 >>> 0 < $1 >>> 0 & $31 >>> 0 < ($1 - $35 | 0) >>> 0)) {
       $$4 = 0; //@line 10584
       break L1;
      }
      if (HEAP8[$0 + ($35 + $31) >> 0] | 0) {
       $$4 = 0; //@line 10592
       break L1;
      }
      $44 = _strcmp($2, $0 + $35 | 0) | 0; //@line 10596
      if (!$44) {
       break;
      }
      $63 = ($44 | 0) < 0; //@line 10602
      if (($$094 | 0) == 1) {
       $$4 = 0; //@line 10607
       break L1;
      } else {
       $$090 = $63 ? $$090 : $26; //@line 10610
       $$094 = $63 ? $25 : $$094 - $25 | 0; //@line 10610
      }
     }
     $46 = $27 + $24 | 0; //@line 10613
     $49 = _swapc(HEAP32[$0 + ($46 << 2) >> 2] | 0, $4) | 0; //@line 10616
     $53 = _swapc(HEAP32[$0 + ($46 + 1 << 2) >> 2] | 0, $4) | 0; //@line 10620
     if ($53 >>> 0 < $1 >>> 0 & $49 >>> 0 < ($1 - $53 | 0) >>> 0) {
      $$4 = (HEAP8[$0 + ($53 + $49) >> 0] | 0) == 0 ? $0 + $53 | 0 : 0; //@line 10632
     } else {
      $$4 = 0; //@line 10634
     }
    } else {
     $$4 = 0; //@line 10637
    }
   } else {
    $$4 = 0; //@line 10640
   }
  } else {
   $$4 = 0; //@line 10643
  }
 } while (0);
 return $$4 | 0; //@line 10646
}
function _vsnprintf($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $$$015 = 0, $$0 = 0, $$014 = 0, $$015 = 0, $11 = 0, $14 = 0, $16 = 0, $17 = 0, $19 = 0, $26 = 0, $4 = 0, $5 = 0, $AsyncCtx = 0, dest = 0, label = 0, sp = 0, src = 0, stop = 0;
 sp = STACKTOP; //@line 6580
 STACKTOP = STACKTOP + 128 | 0; //@line 6581
 $4 = sp + 124 | 0; //@line 6582
 $5 = sp; //@line 6583
 dest = $5; //@line 6584
 src = 2200; //@line 6584
 stop = dest + 124 | 0; //@line 6584
 do {
  HEAP32[dest >> 2] = HEAP32[src >> 2]; //@line 6584
  dest = dest + 4 | 0; //@line 6584
  src = src + 4 | 0; //@line 6584
 } while ((dest | 0) < (stop | 0));
 if (($1 + -1 | 0) >>> 0 > 2147483646) {
  if (!$1) {
   $$014 = $4; //@line 6590
   $$015 = 1; //@line 6590
   label = 4; //@line 6591
  } else {
   HEAP32[(___errno_location() | 0) >> 2] = 75; //@line 6594
   $$0 = -1; //@line 6595
  }
 } else {
  $$014 = $0; //@line 6598
  $$015 = $1; //@line 6598
  label = 4; //@line 6599
 }
 if ((label | 0) == 4) {
  $11 = -2 - $$014 | 0; //@line 6603
  $$$015 = $$015 >>> 0 > $11 >>> 0 ? $11 : $$015; //@line 6605
  HEAP32[$5 + 48 >> 2] = $$$015; //@line 6607
  $14 = $5 + 20 | 0; //@line 6608
  HEAP32[$14 >> 2] = $$014; //@line 6609
  HEAP32[$5 + 44 >> 2] = $$014; //@line 6611
  $16 = $$014 + $$$015 | 0; //@line 6612
  $17 = $5 + 16 | 0; //@line 6613
  HEAP32[$17 >> 2] = $16; //@line 6614
  HEAP32[$5 + 28 >> 2] = $16; //@line 6616
  $AsyncCtx = _emscripten_alloc_async_context(24, sp) | 0; //@line 6617
  $19 = _vfprintf($5, $2, $3) | 0; //@line 6618
  if (___async) {
   HEAP32[$AsyncCtx >> 2] = 139; //@line 6621
   HEAP32[$AsyncCtx + 4 >> 2] = $$$015; //@line 6623
   HEAP32[$AsyncCtx + 8 >> 2] = $5; //@line 6625
   HEAP32[$AsyncCtx + 12 >> 2] = $4; //@line 6627
   HEAP32[$AsyncCtx + 16 >> 2] = $14; //@line 6629
   HEAP32[$AsyncCtx + 20 >> 2] = $17; //@line 6631
   sp = STACKTOP; //@line 6632
   STACKTOP = sp; //@line 6633
   return 0; //@line 6633
  }
  _emscripten_free_async_context($AsyncCtx | 0); //@line 6635
  if (!$$$015) {
   $$0 = $19; //@line 6638
  } else {
   $26 = HEAP32[$14 >> 2] | 0; //@line 6640
   HEAP8[$26 + ((($26 | 0) == (HEAP32[$17 >> 2] | 0)) << 31 >> 31) >> 0] = 0; //@line 6645
   $$0 = $19; //@line 6646
  }
 }
 STACKTOP = sp; //@line 6649
 return $$0 | 0; //@line 6649
}
function _fputc($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0 = 0, $13 = 0, $14 = 0, $19 = 0, $20 = 0, $21 = 0, $26 = 0, $27 = 0, $32 = 0, $34 = 0, $7 = 0, $8 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 6743
 if ((HEAP32[$1 + 76 >> 2] | 0) < 0) {
  label = 3; //@line 6748
 } else {
  if (!(___lockfile($1) | 0)) {
   label = 3; //@line 6753
  } else {
   $20 = $0 & 255; //@line 6755
   $21 = $0 & 255; //@line 6756
   if (($21 | 0) == (HEAP8[$1 + 75 >> 0] | 0)) {
    label = 12; //@line 6762
   } else {
    $26 = $1 + 20 | 0; //@line 6764
    $27 = HEAP32[$26 >> 2] | 0; //@line 6765
    if ($27 >>> 0 < (HEAP32[$1 + 16 >> 2] | 0) >>> 0) {
     HEAP32[$26 >> 2] = $27 + 1; //@line 6771
     HEAP8[$27 >> 0] = $20; //@line 6772
     $34 = $21; //@line 6773
    } else {
     label = 12; //@line 6775
    }
   }
   do {
    if ((label | 0) == 12) {
     $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 6780
     $32 = ___overflow($1, $0) | 0; //@line 6781
     if (___async) {
      HEAP32[$AsyncCtx >> 2] = 144; //@line 6784
      HEAP32[$AsyncCtx + 4 >> 2] = $1; //@line 6786
      sp = STACKTOP; //@line 6787
      return 0; //@line 6788
     } else {
      _emscripten_free_async_context($AsyncCtx | 0); //@line 6790
      $34 = $32; //@line 6791
      break;
     }
    }
   } while (0);
   ___unlockfile($1); //@line 6796
   $$0 = $34; //@line 6797
  }
 }
 do {
  if ((label | 0) == 3) {
   $7 = $0 & 255; //@line 6802
   $8 = $0 & 255; //@line 6803
   if (($8 | 0) != (HEAP8[$1 + 75 >> 0] | 0)) {
    $13 = $1 + 20 | 0; //@line 6809
    $14 = HEAP32[$13 >> 2] | 0; //@line 6810
    if ($14 >>> 0 < (HEAP32[$1 + 16 >> 2] | 0) >>> 0) {
     HEAP32[$13 >> 2] = $14 + 1; //@line 6816
     HEAP8[$14 >> 0] = $7; //@line 6817
     $$0 = $8; //@line 6818
     break;
    }
   }
   $AsyncCtx3 = _emscripten_alloc_async_context(4, sp) | 0; //@line 6822
   $19 = ___overflow($1, $0) | 0; //@line 6823
   if (___async) {
    HEAP32[$AsyncCtx3 >> 2] = 143; //@line 6826
    sp = STACKTOP; //@line 6827
    return 0; //@line 6828
   } else {
    _emscripten_free_async_context($AsyncCtx3 | 0); //@line 6830
    $$0 = $19; //@line 6831
    break;
   }
  }
 } while (0);
 return $$0 | 0; //@line 6836
}
function __ZN6Socket5closeEv($0) {
 $0 = $0 | 0;
 var $$0 = 0, $$pre = 0, $1 = 0, $11 = 0, $12 = 0, $15 = 0, $16 = 0, $2 = 0, $21 = 0, $4 = 0, $7 = 0, $AsyncCtx = 0, $AsyncCtx2 = 0, $AsyncCtx5 = 0, sp = 0;
 sp = STACKTOP; //@line 1581
 $1 = $0 + 8 | 0; //@line 1582
 $2 = HEAP32[$1 >> 2] | 0; //@line 1583
 $$pre = $0 + 4 | 0; //@line 1585
 do {
  if (!$2) {
   $$0 = 0; //@line 1588
  } else {
   $4 = HEAP32[$$pre >> 2] | 0; //@line 1590
   $7 = HEAP32[(HEAP32[$4 >> 2] | 0) + 68 >> 2] | 0; //@line 1593
   $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 1594
   FUNCTION_TABLE_viiii[$7 & 7]($4, $2, 0, 0); //@line 1595
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 69; //@line 1598
    HEAP32[$AsyncCtx + 4 >> 2] = $1; //@line 1600
    HEAP32[$AsyncCtx + 8 >> 2] = $$pre; //@line 1602
    HEAP32[$AsyncCtx + 12 >> 2] = $0; //@line 1604
    sp = STACKTOP; //@line 1605
    return 0; //@line 1606
   }
   _emscripten_free_async_context($AsyncCtx | 0); //@line 1608
   $11 = HEAP32[$1 >> 2] | 0; //@line 1609
   HEAP32[$1 >> 2] = 0; //@line 1610
   $12 = HEAP32[$$pre >> 2] | 0; //@line 1611
   $15 = HEAP32[(HEAP32[$12 >> 2] | 0) + 32 >> 2] | 0; //@line 1614
   $AsyncCtx2 = _emscripten_alloc_async_context(12, sp) | 0; //@line 1615
   $16 = FUNCTION_TABLE_iii[$15 & 7]($12, $11) | 0; //@line 1616
   if (___async) {
    HEAP32[$AsyncCtx2 >> 2] = 70; //@line 1619
    HEAP32[$AsyncCtx2 + 4 >> 2] = $$pre; //@line 1621
    HEAP32[$AsyncCtx2 + 8 >> 2] = $0; //@line 1623
    sp = STACKTOP; //@line 1624
    return 0; //@line 1625
   } else {
    _emscripten_free_async_context($AsyncCtx2 | 0); //@line 1627
    $$0 = $16; //@line 1628
    break;
   }
  }
 } while (0);
 HEAP32[$$pre >> 2] = 0; //@line 1633
 $21 = HEAP32[(HEAP32[$0 >> 2] | 0) + 12 >> 2] | 0; //@line 1636
 $AsyncCtx5 = _emscripten_alloc_async_context(8, sp) | 0; //@line 1637
 FUNCTION_TABLE_vi[$21 & 255]($0); //@line 1638
 if (___async) {
  HEAP32[$AsyncCtx5 >> 2] = 71; //@line 1641
  HEAP32[$AsyncCtx5 + 4 >> 2] = $$0; //@line 1643
  sp = STACKTOP; //@line 1644
  return 0; //@line 1645
 } else {
  _emscripten_free_async_context($AsyncCtx5 | 0); //@line 1647
  return $$0 | 0; //@line 1648
 }
 return 0; //@line 1650
}
function __ZNK13SocketAddresscvbEv($0) {
 $0 = $0 | 0;
 var $12 = 0;
 switch (HEAP32[$0 + 40 >> 2] | 0) {
 case 1:
  {
   if (HEAP8[$0 + 44 >> 0] | 0) {
    $12 = 1; //@line 2534
    return $12 | 0; //@line 2535
   }
   if (HEAP8[$0 + 45 >> 0] | 0) {
    $12 = 1; //@line 2541
    return $12 | 0; //@line 2542
   }
   if (!(HEAP8[$0 + 46 >> 0] | 0)) {
    return (HEAP8[$0 + 47 >> 0] | 0) != 0 | 0; //@line 2551
   } else {
    $12 = 1; //@line 2553
    return $12 | 0; //@line 2554
   }
   break;
  }
 case 2:
  {
   if (HEAP8[$0 + 44 >> 0] | 0) {
    $12 = 1; //@line 2563
    return $12 | 0; //@line 2564
   }
   if (HEAP8[$0 + 45 >> 0] | 0) {
    $12 = 1; //@line 2570
    return $12 | 0; //@line 2571
   }
   if (HEAP8[$0 + 46 >> 0] | 0) {
    $12 = 1; //@line 2577
    return $12 | 0; //@line 2578
   }
   if (HEAP8[$0 + 47 >> 0] | 0) {
    $12 = 1; //@line 2584
    return $12 | 0; //@line 2585
   }
   if (HEAP8[$0 + 48 >> 0] | 0) {
    $12 = 1; //@line 2591
    return $12 | 0; //@line 2592
   }
   if (HEAP8[$0 + 49 >> 0] | 0) {
    $12 = 1; //@line 2598
    return $12 | 0; //@line 2599
   }
   if (HEAP8[$0 + 50 >> 0] | 0) {
    $12 = 1; //@line 2605
    return $12 | 0; //@line 2606
   }
   if (HEAP8[$0 + 51 >> 0] | 0) {
    $12 = 1; //@line 2612
    return $12 | 0; //@line 2613
   }
   if (HEAP8[$0 + 52 >> 0] | 0) {
    $12 = 1; //@line 2619
    return $12 | 0; //@line 2620
   }
   if (HEAP8[$0 + 53 >> 0] | 0) {
    $12 = 1; //@line 2626
    return $12 | 0; //@line 2627
   }
   if (HEAP8[$0 + 54 >> 0] | 0) {
    $12 = 1; //@line 2633
    return $12 | 0; //@line 2634
   }
   if (HEAP8[$0 + 55 >> 0] | 0) {
    $12 = 1; //@line 2640
    return $12 | 0; //@line 2641
   }
   if (HEAP8[$0 + 56 >> 0] | 0) {
    $12 = 1; //@line 2647
    return $12 | 0; //@line 2648
   }
   if (HEAP8[$0 + 57 >> 0] | 0) {
    $12 = 1; //@line 2654
    return $12 | 0; //@line 2655
   }
   if (HEAP8[$0 + 58 >> 0] | 0) {
    $12 = 1; //@line 2661
    return $12 | 0; //@line 2662
   }
   $12 = (HEAP8[$0 + 59 >> 0] | 0) != 0; //@line 2667
   return $12 | 0; //@line 2668
  }
 default:
  {
   $12 = 0; //@line 2672
   return $12 | 0; //@line 2673
  }
 }
 return 0; //@line 2676
}
function __ZThn4_N17EthernetInterface11socket_openEPPv14nsapi_protocol__async_cb($0) {
 $0 = $0 | 0;
 var $$byval_copy = 0, $2 = 0, $4 = 0, $6 = 0, $8 = 0, $9 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx2 = 0, dest = 0, sp = 0, stop = 0;
 sp = STACKTOP; //@line 12276
 STACKTOP = STACKTOP + 32 | 0; //@line 12277
 $$byval_copy = sp; //@line 12278
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 12280
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 12282
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 12284
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 12286
 dest = $AsyncRetVal; //@line 12287
 stop = dest + 76 | 0; //@line 12287
 do {
  HEAP32[dest >> 2] = 0; //@line 12287
  dest = dest + 4 | 0; //@line 12287
 } while ((dest | 0) < (stop | 0));
 $8 = $AsyncRetVal + 12 | 0; //@line 12288
 HEAP32[$2 >> 2] = 0; //@line 12289
 HEAP32[$2 + 4 >> 2] = 0; //@line 12289
 HEAP32[$2 + 8 >> 2] = 0; //@line 12289
 HEAP32[$2 + 12 >> 2] = 0; //@line 12289
 HEAP32[$2 + 16 >> 2] = 0; //@line 12289
 HEAP32[$$byval_copy >> 2] = HEAP32[$2 >> 2]; //@line 12290
 HEAP32[$$byval_copy + 4 >> 2] = HEAP32[$2 + 4 >> 2]; //@line 12290
 HEAP32[$$byval_copy + 8 >> 2] = HEAP32[$2 + 8 >> 2]; //@line 12290
 HEAP32[$$byval_copy + 12 >> 2] = HEAP32[$2 + 12 >> 2]; //@line 12290
 HEAP32[$$byval_copy + 16 >> 2] = HEAP32[$2 + 16 >> 2]; //@line 12290
 __ZN13SocketAddressC2E10nsapi_addrt($8, $$byval_copy, 0); //@line 12291
 $9 = _emscripten_asm_const_ii(3, $4 | 0) | 0; //@line 12292
 if (($9 | 0) == -1) {
  HEAP32[___async_retval >> 2] = -3001; //@line 12296
  STACKTOP = sp; //@line 12297
  return;
 }
 HEAP32[$AsyncRetVal >> 2] = $9; //@line 12299
 HEAP8[$AsyncRetVal + 8 >> 0] = 0; //@line 12301
 HEAP32[$AsyncRetVal + 4 >> 2] = $4; //@line 12303
 HEAP32[$6 >> 2] = $AsyncRetVal; //@line 12304
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(4) | 0; //@line 12305
 _wait_ms(1); //@line 12306
 if (___async) {
  HEAP32[$ReallocAsyncCtx2 >> 2] = 40; //@line 12309
  sp = STACKTOP; //@line 12310
  STACKTOP = sp; //@line 12311
  return;
 }
 ___async_unwind = 0; //@line 12313
 HEAP32[$ReallocAsyncCtx2 >> 2] = 40; //@line 12314
 sp = STACKTOP; //@line 12315
 STACKTOP = sp; //@line 12316
 return;
}
function _main__async_cb_22($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $2 = 0, $22 = 0, $26 = 0, $30 = 0, $39 = 0, $4 = 0, $40 = 0, $6 = 0, $8 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 10785
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 10787
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 10789
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 10791
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 10793
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 10795
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 10797
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 10799
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 10801
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 10803
 $22 = HEAP32[$0 + 44 >> 2] | 0; //@line 10807
 $26 = HEAP32[$0 + 52 >> 2] | 0; //@line 10811
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 10815
 $30 = __ZN17EthernetInterface11get_gatewayEv(596) | 0; //@line 10816
 HEAP32[$18 >> 2] = $16 | 0 ? $16 : 3573; //@line 10819
 _printf(3578, $18) | 0; //@line 10820
 HEAP32[$22 >> 2] = $AsyncRetVal | 0 ? $AsyncRetVal : 3573; //@line 10823
 _printf(3594, $22) | 0; //@line 10824
 HEAP32[$26 >> 2] = $30 | 0 ? $30 : 3573; //@line 10827
 _printf(3611, $26) | 0; //@line 10828
 __ZN9TCPSocketC2Ev($6); //@line 10829
 $39 = HEAP32[(HEAP32[149] | 0) + 60 >> 2] | 0; //@line 10832
 $ReallocAsyncCtx = _emscripten_realloc_async_context(40) | 0; //@line 10833
 $40 = FUNCTION_TABLE_ii[$39 & 15](596) | 0; //@line 10834
 if (!___async) {
  HEAP32[___async_retval >> 2] = $40; //@line 10838
  ___async_unwind = 0; //@line 10839
 }
 HEAP32[$ReallocAsyncCtx >> 2] = 128; //@line 10841
 HEAP32[$ReallocAsyncCtx + 4 >> 2] = $6; //@line 10843
 HEAP32[$ReallocAsyncCtx + 8 >> 2] = $2; //@line 10845
 HEAP32[$ReallocAsyncCtx + 12 >> 2] = $4; //@line 10847
 HEAP32[$ReallocAsyncCtx + 16 >> 2] = $6; //@line 10849
 HEAP32[$ReallocAsyncCtx + 20 >> 2] = $6; //@line 10851
 HEAP32[$ReallocAsyncCtx + 24 >> 2] = $8; //@line 10853
 HEAP32[$ReallocAsyncCtx + 28 >> 2] = $10; //@line 10855
 HEAP32[$ReallocAsyncCtx + 32 >> 2] = $12; //@line 10857
 HEAP32[$ReallocAsyncCtx + 36 >> 2] = $14; //@line 10859
 sp = STACKTOP; //@line 10860
 return;
}
function __ZN17EthernetInterface11socket_openEPPv14nsapi_protocol__async_cb($0) {
 $0 = $0 | 0;
 var $$byval_copy = 0, $2 = 0, $4 = 0, $6 = 0, $8 = 0, $9 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx2 = 0, dest = 0, sp = 0, stop = 0;
 sp = STACKTOP; //@line 9454
 STACKTOP = STACKTOP + 32 | 0; //@line 9455
 $$byval_copy = sp; //@line 9456
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 9458
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 9460
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 9462
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 9464
 dest = $AsyncRetVal; //@line 9465
 stop = dest + 76 | 0; //@line 9465
 do {
  HEAP32[dest >> 2] = 0; //@line 9465
  dest = dest + 4 | 0; //@line 9465
 } while ((dest | 0) < (stop | 0));
 $8 = $AsyncRetVal + 12 | 0; //@line 9466
 HEAP32[$2 >> 2] = 0; //@line 9467
 HEAP32[$2 + 4 >> 2] = 0; //@line 9467
 HEAP32[$2 + 8 >> 2] = 0; //@line 9467
 HEAP32[$2 + 12 >> 2] = 0; //@line 9467
 HEAP32[$2 + 16 >> 2] = 0; //@line 9467
 HEAP32[$$byval_copy >> 2] = HEAP32[$2 >> 2]; //@line 9468
 HEAP32[$$byval_copy + 4 >> 2] = HEAP32[$2 + 4 >> 2]; //@line 9468
 HEAP32[$$byval_copy + 8 >> 2] = HEAP32[$2 + 8 >> 2]; //@line 9468
 HEAP32[$$byval_copy + 12 >> 2] = HEAP32[$2 + 12 >> 2]; //@line 9468
 HEAP32[$$byval_copy + 16 >> 2] = HEAP32[$2 + 16 >> 2]; //@line 9468
 __ZN13SocketAddressC2E10nsapi_addrt($8, $$byval_copy, 0); //@line 9469
 $9 = _emscripten_asm_const_ii(3, $4 | 0) | 0; //@line 9470
 if (($9 | 0) == -1) {
  HEAP32[___async_retval >> 2] = -3001; //@line 9474
  STACKTOP = sp; //@line 9475
  return;
 }
 HEAP32[$AsyncRetVal >> 2] = $9; //@line 9477
 HEAP8[$AsyncRetVal + 8 >> 0] = 0; //@line 9479
 HEAP32[$AsyncRetVal + 4 >> 2] = $4; //@line 9481
 HEAP32[$6 >> 2] = $AsyncRetVal; //@line 9482
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(4) | 0; //@line 9483
 _wait_ms(1); //@line 9484
 if (___async) {
  HEAP32[$ReallocAsyncCtx2 >> 2] = 27; //@line 9487
  sp = STACKTOP; //@line 9488
  STACKTOP = sp; //@line 9489
  return;
 }
 ___async_unwind = 0; //@line 9491
 HEAP32[$ReallocAsyncCtx2 >> 2] = 27; //@line 9492
 sp = STACKTOP; //@line 9493
 STACKTOP = sp; //@line 9494
 return;
}
function _main__async_cb_23($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $2 = 0, $20 = 0, $22 = 0, $24 = 0, $26 = 0, $28 = 0, $4 = 0, $6 = 0, $8 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx11 = 0, sp = 0;
 sp = STACKTOP; //@line 10868
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 10870
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 10872
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 10874
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 10876
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 10878
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 10880
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 10882
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 10884
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 10886
 $20 = HEAP32[$0 + 40 >> 2] | 0; //@line 10888
 $22 = HEAP32[$0 + 44 >> 2] | 0; //@line 10890
 $24 = HEAP32[$0 + 48 >> 2] | 0; //@line 10892
 $26 = HEAP32[$0 + 52 >> 2] | 0; //@line 10894
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 10896
 $ReallocAsyncCtx11 = _emscripten_realloc_async_context(60) | 0; //@line 10897
 $28 = __ZN17EthernetInterface15get_mac_addressEv(596) | 0; //@line 10898
 if (!___async) {
  HEAP32[___async_retval >> 2] = $28; //@line 10902
  ___async_unwind = 0; //@line 10903
 }
 HEAP32[$ReallocAsyncCtx11 >> 2] = 127; //@line 10905
 HEAP32[$ReallocAsyncCtx11 + 4 >> 2] = $2; //@line 10907
 HEAP32[$ReallocAsyncCtx11 + 8 >> 2] = $4; //@line 10909
 HEAP32[$ReallocAsyncCtx11 + 12 >> 2] = $6; //@line 10911
 HEAP32[$ReallocAsyncCtx11 + 16 >> 2] = $8; //@line 10913
 HEAP32[$ReallocAsyncCtx11 + 20 >> 2] = $10; //@line 10915
 HEAP32[$ReallocAsyncCtx11 + 24 >> 2] = $12; //@line 10917
 HEAP32[$ReallocAsyncCtx11 + 28 >> 2] = $14; //@line 10919
 HEAP32[$ReallocAsyncCtx11 + 32 >> 2] = $AsyncRetVal; //@line 10921
 HEAP32[$ReallocAsyncCtx11 + 36 >> 2] = $16; //@line 10923
 HEAP32[$ReallocAsyncCtx11 + 40 >> 2] = $18; //@line 10925
 HEAP32[$ReallocAsyncCtx11 + 44 >> 2] = $20; //@line 10927
 HEAP32[$ReallocAsyncCtx11 + 48 >> 2] = $22; //@line 10929
 HEAP32[$ReallocAsyncCtx11 + 52 >> 2] = $24; //@line 10931
 HEAP32[$ReallocAsyncCtx11 + 56 >> 2] = $26; //@line 10933
 sp = STACKTOP; //@line 10934
 return;
}
function __ZN17EthernetInterface13socket_sendtoEPvRK13SocketAddressPKvj__async_cb($0) {
 $0 = $0 | 0;
 var $10 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $2 = 0, $4 = 0, $6 = 0, $8 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx4 = 0, dest = 0, sp = 0, src = 0, stop = 0;
 sp = STACKTOP; //@line 3005
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 3007
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 3009
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 3011
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 3013
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 3015
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 3017
 if (($AsyncRetVal | 0) < 0) {
  HEAP32[___async_retval >> 2] = $AsyncRetVal; //@line 3021
  return;
 }
 $13 = $2 + 12 | 0; //@line 3024
 dest = $13; //@line 3025
 src = $4; //@line 3025
 stop = dest + 60 | 0; //@line 3025
 do {
  HEAP32[dest >> 2] = HEAP32[src >> 2]; //@line 3025
  dest = dest + 4 | 0; //@line 3025
  src = src + 4 | 0; //@line 3025
 } while ((dest | 0) < (stop | 0));
 HEAP16[$13 + 60 >> 1] = HEAP16[$4 + 60 >> 1] | 0; //@line 3025
 $ReallocAsyncCtx4 = _emscripten_realloc_async_context(20) | 0; //@line 3026
 _wait_ms(1); //@line 3027
 if (___async) {
  HEAP32[$ReallocAsyncCtx4 >> 2] = 34; //@line 3030
  $14 = $ReallocAsyncCtx4 + 4 | 0; //@line 3031
  HEAP32[$14 >> 2] = $6; //@line 3032
  $15 = $ReallocAsyncCtx4 + 8 | 0; //@line 3033
  HEAP32[$15 >> 2] = $2; //@line 3034
  $16 = $ReallocAsyncCtx4 + 12 | 0; //@line 3035
  HEAP32[$16 >> 2] = $8; //@line 3036
  $17 = $ReallocAsyncCtx4 + 16 | 0; //@line 3037
  HEAP32[$17 >> 2] = $10; //@line 3038
  sp = STACKTOP; //@line 3039
  return;
 }
 ___async_unwind = 0; //@line 3042
 HEAP32[$ReallocAsyncCtx4 >> 2] = 34; //@line 3043
 $14 = $ReallocAsyncCtx4 + 4 | 0; //@line 3044
 HEAP32[$14 >> 2] = $6; //@line 3045
 $15 = $ReallocAsyncCtx4 + 8 | 0; //@line 3046
 HEAP32[$15 >> 2] = $2; //@line 3047
 $16 = $ReallocAsyncCtx4 + 12 | 0; //@line 3048
 HEAP32[$16 >> 2] = $8; //@line 3049
 $17 = $ReallocAsyncCtx4 + 16 | 0; //@line 3050
 HEAP32[$17 >> 2] = $10; //@line 3051
 sp = STACKTOP; //@line 3052
 return;
}
function ___strchrnul($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0 = 0, $$029$lcssa = 0, $$02936 = 0, $$030$lcssa = 0, $$03039 = 0, $$1 = 0, $10 = 0, $13 = 0, $17 = 0, $18 = 0, $2 = 0, $24 = 0, $25 = 0, $31 = 0, $38 = 0, $39 = 0, $7 = 0;
 $2 = $1 & 255; //@line 10677
 L1 : do {
  if (!$2) {
   $$0 = $0 + (_strlen($0) | 0) | 0; //@line 10683
  } else {
   if (!($0 & 3)) {
    $$030$lcssa = $0; //@line 10689
   } else {
    $7 = $1 & 255; //@line 10691
    $$03039 = $0; //@line 10692
    while (1) {
     $10 = HEAP8[$$03039 >> 0] | 0; //@line 10694
     if ($10 << 24 >> 24 == 0 ? 1 : $10 << 24 >> 24 == $7 << 24 >> 24) {
      $$0 = $$03039; //@line 10699
      break L1;
     }
     $13 = $$03039 + 1 | 0; //@line 10702
     if (!($13 & 3)) {
      $$030$lcssa = $13; //@line 10707
      break;
     } else {
      $$03039 = $13; //@line 10710
     }
    }
   }
   $17 = Math_imul($2, 16843009) | 0; //@line 10714
   $18 = HEAP32[$$030$lcssa >> 2] | 0; //@line 10715
   L10 : do {
    if (!(($18 & -2139062144 ^ -2139062144) & $18 + -16843009)) {
     $$02936 = $$030$lcssa; //@line 10723
     $25 = $18; //@line 10723
     while (1) {
      $24 = $25 ^ $17; //@line 10725
      if (($24 & -2139062144 ^ -2139062144) & $24 + -16843009 | 0) {
       $$029$lcssa = $$02936; //@line 10732
       break L10;
      }
      $31 = $$02936 + 4 | 0; //@line 10735
      $25 = HEAP32[$31 >> 2] | 0; //@line 10736
      if (($25 & -2139062144 ^ -2139062144) & $25 + -16843009 | 0) {
       $$029$lcssa = $31; //@line 10745
       break;
      } else {
       $$02936 = $31; //@line 10743
      }
     }
    } else {
     $$029$lcssa = $$030$lcssa; //@line 10750
    }
   } while (0);
   $38 = $1 & 255; //@line 10753
   $$1 = $$029$lcssa; //@line 10754
   while (1) {
    $39 = HEAP8[$$1 >> 0] | 0; //@line 10756
    if ($39 << 24 >> 24 == 0 ? 1 : $39 << 24 >> 24 == $38 << 24 >> 24) {
     $$0 = $$1; //@line 10762
     break;
    } else {
     $$1 = $$1 + 1 | 0; //@line 10765
    }
   }
  }
 } while (0);
 return $$0 | 0; //@line 10770
}
function ___shgetc($0) {
 $0 = $0 | 0;
 var $$0 = 0, $$phi$trans$insert = 0, $$phi$trans$insert29 = 0, $$pre = 0, $$sink = 0, $1 = 0, $10 = 0, $12 = 0, $14 = 0, $19 = 0, $2 = 0, $21 = 0, $26 = 0, $27 = 0, $29 = 0, $35 = 0, $36 = 0, $7 = 0, label = 0;
 $1 = $0 + 104 | 0; //@line 11777
 $2 = HEAP32[$1 >> 2] | 0; //@line 11778
 if (!$2) {
  label = 3; //@line 11781
 } else {
  if ((HEAP32[$0 + 108 >> 2] | 0) < ($2 | 0)) {
   label = 3; //@line 11787
  } else {
   label = 4; //@line 11789
  }
 }
 if ((label | 0) == 3) {
  $7 = ___uflow($0) | 0; //@line 11793
  if (($7 | 0) < 0) {
   label = 4; //@line 11796
  } else {
   $10 = HEAP32[$1 >> 2] | 0; //@line 11798
   $$phi$trans$insert = $0 + 8 | 0; //@line 11800
   if (!$10) {
    $$pre = HEAP32[$$phi$trans$insert >> 2] | 0; //@line 11802
    $$sink = $$pre; //@line 11803
    $26 = $$pre; //@line 11803
   } else {
    $12 = HEAP32[$$phi$trans$insert >> 2] | 0; //@line 11805
    $14 = HEAP32[$0 + 4 >> 2] | 0; //@line 11807
    $19 = $10 - (HEAP32[$0 + 108 >> 2] | 0) | 0; //@line 11812
    $21 = $12; //@line 11814
    if (($12 - $14 | 0) < ($19 | 0)) {
     $$sink = $21; //@line 11816
     $26 = $21; //@line 11816
    } else {
     $$sink = $14 + ($19 + -1) | 0; //@line 11820
     $26 = $21; //@line 11820
    }
   }
   HEAP32[$0 + 100 >> 2] = $$sink; //@line 11824
   $$phi$trans$insert29 = $0 + 4 | 0; //@line 11826
   if (!$26) {
    $36 = HEAP32[$$phi$trans$insert29 >> 2] | 0; //@line 11829
   } else {
    $27 = HEAP32[$$phi$trans$insert29 >> 2] | 0; //@line 11831
    $29 = $0 + 108 | 0; //@line 11833
    HEAP32[$29 >> 2] = $26 + 1 - $27 + (HEAP32[$29 >> 2] | 0); //@line 11838
    $36 = $27; //@line 11840
   }
   $35 = $36 + -1 | 0; //@line 11842
   if (($7 | 0) == (HEAPU8[$35 >> 0] | 0 | 0)) {
    $$0 = $7; //@line 11847
   } else {
    HEAP8[$35 >> 0] = $7; //@line 11850
    $$0 = $7; //@line 11851
   }
  }
 }
 if ((label | 0) == 4) {
  HEAP32[$0 + 100 >> 2] = 0; //@line 11857
  $$0 = -1; //@line 11858
 }
 return $$0 | 0; //@line 11860
}
function _main__async_cb_13($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $2 = 0, $20 = 0, $21 = 0, $4 = 0, $6 = 0, $8 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx6 = 0, dest = 0, sp = 0, src = 0, stop = 0;
 sp = STACKTOP; //@line 10360
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 10362
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 10364
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 10366
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 10368
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 10370
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 10372
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 10374
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 10376
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 10378
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 10380
 dest = $AsyncRetVal; //@line 10381
 src = 3638; //@line 10381
 stop = dest + 40 | 0; //@line 10381
 do {
  HEAP8[dest >> 0] = HEAP8[src >> 0] | 0; //@line 10381
  dest = dest + 1 | 0; //@line 10381
  src = src + 1 | 0; //@line 10381
 } while ((dest | 0) < (stop | 0));
 $20 = _strlen($AsyncRetVal) | 0; //@line 10382
 $ReallocAsyncCtx6 = _emscripten_realloc_async_context(44) | 0; //@line 10383
 $21 = __ZN9TCPSocket4sendEPKvj($2, $AsyncRetVal, $20) | 0; //@line 10384
 if (!___async) {
  HEAP32[___async_retval >> 2] = $21; //@line 10388
  ___async_unwind = 0; //@line 10389
 }
 HEAP32[$ReallocAsyncCtx6 >> 2] = 132; //@line 10391
 HEAP32[$ReallocAsyncCtx6 + 4 >> 2] = $AsyncRetVal; //@line 10393
 HEAP32[$ReallocAsyncCtx6 + 8 >> 2] = $4; //@line 10395
 HEAP32[$ReallocAsyncCtx6 + 12 >> 2] = $6; //@line 10397
 HEAP32[$ReallocAsyncCtx6 + 16 >> 2] = $2; //@line 10399
 HEAP32[$ReallocAsyncCtx6 + 20 >> 2] = $8; //@line 10401
 HEAP32[$ReallocAsyncCtx6 + 24 >> 2] = $10; //@line 10403
 HEAP32[$ReallocAsyncCtx6 + 28 >> 2] = $12; //@line 10405
 HEAP32[$ReallocAsyncCtx6 + 32 >> 2] = $14; //@line 10407
 HEAP32[$ReallocAsyncCtx6 + 36 >> 2] = $16; //@line 10409
 HEAP32[$ReallocAsyncCtx6 + 40 >> 2] = $18; //@line 10411
 sp = STACKTOP; //@line 10412
 return;
}
function ___fwritex($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$038 = 0, $$1 = 0, $$139 = 0, $$141 = 0, $$143 = 0, $10 = 0, $12 = 0, $14 = 0, $22 = 0, $28 = 0, $3 = 0, $31 = 0, $4 = 0, $9 = 0, label = 0;
 $3 = $2 + 16 | 0; //@line 10431
 $4 = HEAP32[$3 >> 2] | 0; //@line 10432
 if (!$4) {
  if (!(___towrite($2) | 0)) {
   $12 = HEAP32[$3 >> 2] | 0; //@line 10439
   label = 5; //@line 10440
  } else {
   $$1 = 0; //@line 10442
  }
 } else {
  $12 = $4; //@line 10446
  label = 5; //@line 10447
 }
 L5 : do {
  if ((label | 0) == 5) {
   $9 = $2 + 20 | 0; //@line 10451
   $10 = HEAP32[$9 >> 2] | 0; //@line 10452
   $14 = $10; //@line 10455
   if (($12 - $10 | 0) >>> 0 < $1 >>> 0) {
    $$1 = FUNCTION_TABLE_iiii[HEAP32[$2 + 36 >> 2] & 15]($2, $0, $1) | 0; //@line 10460
    break;
   }
   L10 : do {
    if ((HEAP8[$2 + 75 >> 0] | 0) > -1) {
     $$038 = $1; //@line 10468
     while (1) {
      if (!$$038) {
       $$139 = 0; //@line 10472
       $$141 = $0; //@line 10472
       $$143 = $1; //@line 10472
       $31 = $14; //@line 10472
       break L10;
      }
      $22 = $$038 + -1 | 0; //@line 10475
      if ((HEAP8[$0 + $22 >> 0] | 0) == 10) {
       break;
      } else {
       $$038 = $22; //@line 10482
      }
     }
     $28 = FUNCTION_TABLE_iiii[HEAP32[$2 + 36 >> 2] & 15]($2, $0, $$038) | 0; //@line 10487
     if ($28 >>> 0 < $$038 >>> 0) {
      $$1 = $28; //@line 10490
      break L5;
     }
     $$139 = $$038; //@line 10496
     $$141 = $0 + $$038 | 0; //@line 10496
     $$143 = $1 - $$038 | 0; //@line 10496
     $31 = HEAP32[$9 >> 2] | 0; //@line 10496
    } else {
     $$139 = 0; //@line 10498
     $$141 = $0; //@line 10498
     $$143 = $1; //@line 10498
     $31 = $14; //@line 10498
    }
   } while (0);
   _memcpy($31 | 0, $$141 | 0, $$143 | 0) | 0; //@line 10501
   HEAP32[$9 >> 2] = (HEAP32[$9 >> 2] | 0) + $$143; //@line 10504
   $$1 = $$139 + $$143 | 0; //@line 10506
  }
 } while (0);
 return $$1 | 0; //@line 10509
}
function _main__async_cb_15($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $2 = 0, $20 = 0, $22 = 0, $24 = 0, $26 = 0, $27 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx12 = 0, sp = 0;
 sp = STACKTOP; //@line 10440
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 10442
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 10444
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 10446
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 10448
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 10450
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 10452
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 10454
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 10456
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 10458
 $20 = HEAP32[$0 + 40 >> 2] | 0; //@line 10460
 $22 = HEAP32[$0 + 44 >> 2] | 0; //@line 10462
 $24 = HEAP32[$0 + 48 >> 2] | 0; //@line 10464
 $26 = HEAP32[$0 + 52 >> 2] | 0; //@line 10466
 $ReallocAsyncCtx12 = _emscripten_realloc_async_context(56) | 0; //@line 10467
 $27 = __ZN17EthernetInterface14get_ip_addressEv(596) | 0; //@line 10468
 if (!___async) {
  HEAP32[___async_retval >> 2] = $27; //@line 10472
  ___async_unwind = 0; //@line 10473
 }
 HEAP32[$ReallocAsyncCtx12 >> 2] = 126; //@line 10475
 HEAP32[$ReallocAsyncCtx12 + 4 >> 2] = $16; //@line 10477
 HEAP32[$ReallocAsyncCtx12 + 8 >> 2] = $18; //@line 10479
 HEAP32[$ReallocAsyncCtx12 + 12 >> 2] = $14; //@line 10481
 HEAP32[$ReallocAsyncCtx12 + 16 >> 2] = $20; //@line 10483
 HEAP32[$ReallocAsyncCtx12 + 20 >> 2] = $22; //@line 10485
 HEAP32[$ReallocAsyncCtx12 + 24 >> 2] = $24; //@line 10487
 HEAP32[$ReallocAsyncCtx12 + 28 >> 2] = $26; //@line 10489
 HEAP32[$ReallocAsyncCtx12 + 32 >> 2] = $2; //@line 10491
 HEAP32[$ReallocAsyncCtx12 + 36 >> 2] = $4; //@line 10493
 HEAP32[$ReallocAsyncCtx12 + 40 >> 2] = $6; //@line 10495
 HEAP32[$ReallocAsyncCtx12 + 44 >> 2] = $8; //@line 10497
 HEAP32[$ReallocAsyncCtx12 + 48 >> 2] = $10; //@line 10499
 HEAP32[$ReallocAsyncCtx12 + 52 >> 2] = $12; //@line 10501
 sp = STACKTOP; //@line 10502
 return;
}
function _main__async_cb_16($0) {
 $0 = $0 | 0;
 var $10 = 0, $14 = 0, $16 = 0, $18 = 0, $2 = 0, $22 = 0, $24 = 0, $28 = 0, $29 = 0, $30 = 0, $4 = 0, $6 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx9 = 0, sp = 0;
 sp = STACKTOP; //@line 10509
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 10511
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 10513
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 10515
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 10519
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 10523
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 10525
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 10527
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 10529
 $22 = (_strstr($2, 3678) | 0) - $4 | 0; //@line 10532
 HEAP32[$6 >> 2] = $AsyncRetVal; //@line 10533
 HEAP32[$6 + 4 >> 2] = $22; //@line 10535
 HEAP32[$6 + 8 >> 2] = $2; //@line 10537
 _printf(3697, $6) | 0; //@line 10538
 $24 = (_strstr($2, 3713) | 0) + 4 | 0; //@line 10540
 HEAP32[$10 >> 2] = $AsyncRetVal + $4 - $24; //@line 10544
 HEAP32[$10 + 4 >> 2] = $24; //@line 10546
 _printf(3718, $10) | 0; //@line 10547
 $ReallocAsyncCtx9 = _emscripten_realloc_async_context(16) | 0; //@line 10548
 __ZN6Socket5closeEv($14) | 0; //@line 10549
 if (___async) {
  HEAP32[$ReallocAsyncCtx9 >> 2] = 134; //@line 10552
  $28 = $ReallocAsyncCtx9 + 4 | 0; //@line 10553
  HEAP32[$28 >> 2] = $2; //@line 10554
  $29 = $ReallocAsyncCtx9 + 8 | 0; //@line 10555
  HEAP32[$29 >> 2] = $16; //@line 10556
  $30 = $ReallocAsyncCtx9 + 12 | 0; //@line 10557
  HEAP32[$30 >> 2] = $18; //@line 10558
  sp = STACKTOP; //@line 10559
  return;
 }
 ___async_unwind = 0; //@line 10562
 HEAP32[$ReallocAsyncCtx9 >> 2] = 134; //@line 10563
 $28 = $ReallocAsyncCtx9 + 4 | 0; //@line 10564
 HEAP32[$28 >> 2] = $2; //@line 10565
 $29 = $ReallocAsyncCtx9 + 8 | 0; //@line 10566
 HEAP32[$29 >> 2] = $16; //@line 10567
 $30 = $ReallocAsyncCtx9 + 12 | 0; //@line 10568
 HEAP32[$30 >> 2] = $18; //@line 10569
 sp = STACKTOP; //@line 10570
 return;
}
function _main__async_cb_17($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $2 = 0, $20 = 0, $24 = 0, $25 = 0, $26 = 0, $4 = 0, $8 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx5 = 0, sp = 0;
 sp = STACKTOP; //@line 10578
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 10580
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 10582
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 10586
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 10588
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 10590
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 10592
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 10594
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 10596
 $20 = HEAP32[$0 + 40 >> 2] | 0; //@line 10598
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 10600
 $24 = $2; //@line 10603
 $25 = (_strstr($2, 3678) | 0) - $24 | 0; //@line 10604
 HEAP32[$4 >> 2] = $AsyncRetVal; //@line 10605
 HEAP32[$4 + 4 >> 2] = $25; //@line 10607
 HEAP32[$4 + 8 >> 2] = $2; //@line 10609
 _printf(3681, $4) | 0; //@line 10610
 $ReallocAsyncCtx5 = _emscripten_realloc_async_context(40) | 0; //@line 10611
 $26 = __ZN9TCPSocket4recvEPvj($8, $2, 256) | 0; //@line 10612
 if (!___async) {
  HEAP32[___async_retval >> 2] = $26; //@line 10616
  ___async_unwind = 0; //@line 10617
 }
 HEAP32[$ReallocAsyncCtx5 >> 2] = 133; //@line 10619
 HEAP32[$ReallocAsyncCtx5 + 4 >> 2] = $2; //@line 10621
 HEAP32[$ReallocAsyncCtx5 + 8 >> 2] = $24; //@line 10623
 HEAP32[$ReallocAsyncCtx5 + 12 >> 2] = $10; //@line 10625
 HEAP32[$ReallocAsyncCtx5 + 16 >> 2] = $12; //@line 10627
 HEAP32[$ReallocAsyncCtx5 + 20 >> 2] = $14; //@line 10629
 HEAP32[$ReallocAsyncCtx5 + 24 >> 2] = $16; //@line 10631
 HEAP32[$ReallocAsyncCtx5 + 28 >> 2] = $18; //@line 10633
 HEAP32[$ReallocAsyncCtx5 + 32 >> 2] = $8; //@line 10635
 HEAP32[$ReallocAsyncCtx5 + 36 >> 2] = $20; //@line 10637
 sp = STACKTOP; //@line 10638
 return;
}
function __ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_1($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $25 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 8932
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 8936
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 8938
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 8940
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 8942
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 8944
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 8946
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 8948
 $18 = HEAP8[$0 + 36 >> 0] & 1; //@line 8951
 $25 = (HEAP32[$0 + 4 >> 2] | 0) + 8 | 0; //@line 8952
 do {
  if ($25 >>> 0 < $4 >>> 0) {
   if (!(HEAP8[$6 >> 0] | 0)) {
    if ((HEAP32[$8 >> 2] | 0) == 1) {
     if ((HEAP32[$10 >> 2] | 0) == 1) {
      break;
     }
    }
    $ReallocAsyncCtx2 = _emscripten_realloc_async_context(40) | 0; //@line 8968
    __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($25, $12, $14, $16, $18); //@line 8969
    if (!___async) {
     ___async_unwind = 0; //@line 8972
    }
    HEAP32[$ReallocAsyncCtx2 >> 2] = 167; //@line 8974
    HEAP32[$ReallocAsyncCtx2 + 4 >> 2] = $25; //@line 8976
    HEAP32[$ReallocAsyncCtx2 + 8 >> 2] = $4; //@line 8978
    HEAP32[$ReallocAsyncCtx2 + 12 >> 2] = $6; //@line 8980
    HEAP32[$ReallocAsyncCtx2 + 16 >> 2] = $8; //@line 8982
    HEAP32[$ReallocAsyncCtx2 + 20 >> 2] = $10; //@line 8984
    HEAP32[$ReallocAsyncCtx2 + 24 >> 2] = $12; //@line 8986
    HEAP32[$ReallocAsyncCtx2 + 28 >> 2] = $14; //@line 8988
    HEAP32[$ReallocAsyncCtx2 + 32 >> 2] = $16; //@line 8990
    HEAP8[$ReallocAsyncCtx2 + 36 >> 0] = $18 & 1; //@line 8993
    sp = STACKTOP; //@line 8994
    return;
   }
  }
 } while (0);
 return;
}
function _strcspn($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$01824 = 0, $$019$sink = 0, $$01922 = 0, $10 = 0, $12 = 0, $15 = 0, $19 = 0, $2 = 0, $25 = 0, $3 = 0, $34 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 6907
 STACKTOP = STACKTOP + 32 | 0; //@line 6908
 $2 = sp; //@line 6909
 $3 = HEAP8[$1 >> 0] | 0; //@line 6910
 L1 : do {
  if (!($3 << 24 >> 24)) {
   label = 3; //@line 6914
  } else {
   if (!(HEAP8[$1 + 1 >> 0] | 0)) {
    label = 3; //@line 6920
   } else {
    _memset($2 | 0, 0, 32) | 0; //@line 6922
    $10 = HEAP8[$1 >> 0] | 0; //@line 6923
    if ($10 << 24 >> 24) {
     $$01824 = $1; //@line 6926
     $15 = $10; //@line 6926
     do {
      $19 = $2 + ((($15 & 255) >>> 5 & 255) << 2) | 0; //@line 6933
      HEAP32[$19 >> 2] = HEAP32[$19 >> 2] | 1 << ($15 & 31); //@line 6936
      $$01824 = $$01824 + 1 | 0; //@line 6937
      $15 = HEAP8[$$01824 >> 0] | 0; //@line 6938
     } while ($15 << 24 >> 24 != 0);
    }
    $12 = HEAP8[$0 >> 0] | 0; //@line 6947
    if (!($12 << 24 >> 24)) {
     $$019$sink = $0; //@line 6950
    } else {
     $$01922 = $0; //@line 6952
     $25 = $12; //@line 6952
     while (1) {
      if (HEAP32[$2 + ((($25 & 255) >>> 5 & 255) << 2) >> 2] & 1 << ($25 & 31) | 0) {
       $$019$sink = $$01922; //@line 6964
       break L1;
      }
      $34 = $$01922 + 1 | 0; //@line 6967
      $25 = HEAP8[$34 >> 0] | 0; //@line 6968
      if (!($25 << 24 >> 24)) {
       $$019$sink = $34; //@line 6971
       break;
      } else {
       $$01922 = $34; //@line 6974
      }
     }
    }
   }
  }
 } while (0);
 if ((label | 0) == 3) {
  $$019$sink = ___strchrnul($0, $3 << 24 >> 24) | 0; //@line 6984
 }
 STACKTOP = sp; //@line 6989
 return $$019$sink - $0 | 0; //@line 6989
}
function ___overflow($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0 = 0, $10 = 0, $12 = 0, $13 = 0, $2 = 0, $20 = 0, $21 = 0, $3 = 0, $4 = 0, $5 = 0, $9 = 0, $AsyncCtx = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 10317
 STACKTOP = STACKTOP + 16 | 0; //@line 10318
 $2 = sp; //@line 10319
 $3 = $1 & 255; //@line 10320
 HEAP8[$2 >> 0] = $3; //@line 10321
 $4 = $0 + 16 | 0; //@line 10322
 $5 = HEAP32[$4 >> 2] | 0; //@line 10323
 if (!$5) {
  if (!(___towrite($0) | 0)) {
   $12 = HEAP32[$4 >> 2] | 0; //@line 10330
   label = 4; //@line 10331
  } else {
   $$0 = -1; //@line 10333
  }
 } else {
  $12 = $5; //@line 10336
  label = 4; //@line 10337
 }
 do {
  if ((label | 0) == 4) {
   $9 = $0 + 20 | 0; //@line 10341
   $10 = HEAP32[$9 >> 2] | 0; //@line 10342
   if ($10 >>> 0 < $12 >>> 0) {
    $13 = $1 & 255; //@line 10345
    if (($13 | 0) != (HEAP8[$0 + 75 >> 0] | 0)) {
     HEAP32[$9 >> 2] = $10 + 1; //@line 10352
     HEAP8[$10 >> 0] = $3; //@line 10353
     $$0 = $13; //@line 10354
     break;
    }
   }
   $20 = HEAP32[$0 + 36 >> 2] | 0; //@line 10359
   $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 10360
   $21 = FUNCTION_TABLE_iiii[$20 & 15]($0, $2, 1) | 0; //@line 10361
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 137; //@line 10364
    HEAP32[$AsyncCtx + 4 >> 2] = $2; //@line 10366
    sp = STACKTOP; //@line 10367
    STACKTOP = sp; //@line 10368
    return 0; //@line 10368
   }
   _emscripten_free_async_context($AsyncCtx | 0); //@line 10370
   if (($21 | 0) == 1) {
    $$0 = HEAPU8[$2 >> 0] | 0; //@line 10375
   } else {
    $$0 = -1; //@line 10377
   }
  }
 } while (0);
 STACKTOP = sp; //@line 10381
 return $$0 | 0; //@line 10381
}
function _memset(ptr, value, num) {
 ptr = ptr | 0;
 value = value | 0;
 num = num | 0;
 var end = 0, aligned_end = 0, block_aligned_end = 0, value4 = 0;
 end = ptr + num | 0; //@line 3559
 value = value & 255; //@line 3561
 if ((num | 0) >= 67) {
  while (ptr & 3) {
   HEAP8[ptr >> 0] = value; //@line 3564
   ptr = ptr + 1 | 0; //@line 3565
  }
  aligned_end = end & -4 | 0; //@line 3568
  block_aligned_end = aligned_end - 64 | 0; //@line 3569
  value4 = value | value << 8 | value << 16 | value << 24; //@line 3570
  while ((ptr | 0) <= (block_aligned_end | 0)) {
   HEAP32[ptr >> 2] = value4; //@line 3573
   HEAP32[ptr + 4 >> 2] = value4; //@line 3574
   HEAP32[ptr + 8 >> 2] = value4; //@line 3575
   HEAP32[ptr + 12 >> 2] = value4; //@line 3576
   HEAP32[ptr + 16 >> 2] = value4; //@line 3577
   HEAP32[ptr + 20 >> 2] = value4; //@line 3578
   HEAP32[ptr + 24 >> 2] = value4; //@line 3579
   HEAP32[ptr + 28 >> 2] = value4; //@line 3580
   HEAP32[ptr + 32 >> 2] = value4; //@line 3581
   HEAP32[ptr + 36 >> 2] = value4; //@line 3582
   HEAP32[ptr + 40 >> 2] = value4; //@line 3583
   HEAP32[ptr + 44 >> 2] = value4; //@line 3584
   HEAP32[ptr + 48 >> 2] = value4; //@line 3585
   HEAP32[ptr + 52 >> 2] = value4; //@line 3586
   HEAP32[ptr + 56 >> 2] = value4; //@line 3587
   HEAP32[ptr + 60 >> 2] = value4; //@line 3588
   ptr = ptr + 64 | 0; //@line 3589
  }
  while ((ptr | 0) < (aligned_end | 0)) {
   HEAP32[ptr >> 2] = value4; //@line 3593
   ptr = ptr + 4 | 0; //@line 3594
  }
 }
 while ((ptr | 0) < (end | 0)) {
  HEAP8[ptr >> 0] = value; //@line 3599
  ptr = ptr + 1 | 0; //@line 3600
 }
 return end - num | 0; //@line 3602
}
function __ZN9UDPSocket8recvfromEP13SocketAddressPvj($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $$2 = 0, $10 = 0, $13 = 0, $14 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $AsyncCtx = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 3424
 $4 = $0 + 8 | 0; //@line 3425
 $5 = $0 + 52 | 0; //@line 3426
 $6 = $0 + 4 | 0; //@line 3427
 $7 = $0 + 12 | 0; //@line 3428
 while (1) {
  $8 = HEAP32[$4 >> 2] | 0; //@line 3430
  if (!$8) {
   $$2 = -3005; //@line 3433
   label = 6; //@line 3434
   break;
  }
  HEAP32[$5 >> 2] = 0; //@line 3437
  $10 = HEAP32[$6 >> 2] | 0; //@line 3438
  $13 = HEAP32[(HEAP32[$10 >> 2] | 0) + 64 >> 2] | 0; //@line 3441
  $AsyncCtx = _emscripten_alloc_async_context(32, sp) | 0; //@line 3442
  $14 = FUNCTION_TABLE_iiiiii[$13 & 7]($10, $8, $1, $2, $3) | 0; //@line 3443
  if (___async) {
   label = 4; //@line 3446
   break;
  }
  _emscripten_free_async_context($AsyncCtx | 0); //@line 3449
  if (($14 | 0) != -3001 | (HEAP32[$7 >> 2] | 0) == 0) {
   $$2 = $14; //@line 3455
   label = 6; //@line 3456
   break;
  }
 }
 if ((label | 0) == 4) {
  HEAP32[$AsyncCtx >> 2] = 90; //@line 3461
  HEAP32[$AsyncCtx + 4 >> 2] = $7; //@line 3463
  HEAP32[$AsyncCtx + 8 >> 2] = $4; //@line 3465
  HEAP32[$AsyncCtx + 12 >> 2] = $5; //@line 3467
  HEAP32[$AsyncCtx + 16 >> 2] = $6; //@line 3469
  HEAP32[$AsyncCtx + 20 >> 2] = $1; //@line 3471
  HEAP32[$AsyncCtx + 24 >> 2] = $2; //@line 3473
  HEAP32[$AsyncCtx + 28 >> 2] = $3; //@line 3475
  sp = STACKTOP; //@line 3476
  return 0; //@line 3477
 } else if ((label | 0) == 6) {
  return $$2 | 0; //@line 3480
 }
 return 0; //@line 3482
}
function __ZN9UDPSocket6sendtoERK13SocketAddressPKvj($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $$2 = 0, $10 = 0, $13 = 0, $14 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $AsyncCtx = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 3357
 $4 = $0 + 8 | 0; //@line 3358
 $5 = $0 + 52 | 0; //@line 3359
 $6 = $0 + 4 | 0; //@line 3360
 $7 = $0 + 12 | 0; //@line 3361
 while (1) {
  $8 = HEAP32[$4 >> 2] | 0; //@line 3363
  if (!$8) {
   $$2 = -3005; //@line 3366
   label = 6; //@line 3367
   break;
  }
  HEAP32[$5 >> 2] = 0; //@line 3370
  $10 = HEAP32[$6 >> 2] | 0; //@line 3371
  $13 = HEAP32[(HEAP32[$10 >> 2] | 0) + 60 >> 2] | 0; //@line 3374
  $AsyncCtx = _emscripten_alloc_async_context(32, sp) | 0; //@line 3375
  $14 = FUNCTION_TABLE_iiiiii[$13 & 7]($10, $8, $1, $2, $3) | 0; //@line 3376
  if (___async) {
   label = 4; //@line 3379
   break;
  }
  _emscripten_free_async_context($AsyncCtx | 0); //@line 3382
  if (($14 | 0) != -3001 | (HEAP32[$7 >> 2] | 0) == 0) {
   $$2 = $14; //@line 3388
   label = 6; //@line 3389
   break;
  }
 }
 if ((label | 0) == 4) {
  HEAP32[$AsyncCtx >> 2] = 89; //@line 3394
  HEAP32[$AsyncCtx + 4 >> 2] = $7; //@line 3396
  HEAP32[$AsyncCtx + 8 >> 2] = $4; //@line 3398
  HEAP32[$AsyncCtx + 12 >> 2] = $5; //@line 3400
  HEAP32[$AsyncCtx + 16 >> 2] = $6; //@line 3402
  HEAP32[$AsyncCtx + 20 >> 2] = $1; //@line 3404
  HEAP32[$AsyncCtx + 24 >> 2] = $2; //@line 3406
  HEAP32[$AsyncCtx + 28 >> 2] = $3; //@line 3408
  sp = STACKTOP; //@line 3409
  return 0; //@line 3410
 } else if ((label | 0) == 6) {
  return $$2 | 0; //@line 3413
 }
 return 0; //@line 3415
}
function __ZThn4_N17EthernetInterface13socket_sendtoEPvRK13SocketAddressPKvj__async_cb($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $15 = 0, $2 = 0, $4 = 0, $6 = 0, $8 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx4 = 0, dest = 0, sp = 0, src = 0, stop = 0;
 sp = STACKTOP; //@line 12607
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 12609
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 12611
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 12613
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 12615
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 12617
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 12619
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 12621
 if (($AsyncRetVal | 0) < 0) {
  HEAP32[___async_retval >> 2] = $AsyncRetVal; //@line 12625
  return;
 }
 $15 = $2 + 12 | 0; //@line 12628
 dest = $15; //@line 12629
 src = $4; //@line 12629
 stop = dest + 60 | 0; //@line 12629
 do {
  HEAP32[dest >> 2] = HEAP32[src >> 2]; //@line 12629
  dest = dest + 4 | 0; //@line 12629
  src = src + 4 | 0; //@line 12629
 } while ((dest | 0) < (stop | 0));
 HEAP16[$15 + 60 >> 1] = HEAP16[$4 + 60 >> 1] | 0; //@line 12629
 $ReallocAsyncCtx4 = _emscripten_realloc_async_context(24) | 0; //@line 12630
 _wait_ms(1); //@line 12631
 if (!___async) {
  ___async_unwind = 0; //@line 12634
 }
 HEAP32[$ReallocAsyncCtx4 >> 2] = 47; //@line 12636
 HEAP32[$ReallocAsyncCtx4 + 4 >> 2] = $6; //@line 12638
 HEAP32[$ReallocAsyncCtx4 + 8 >> 2] = $8; //@line 12640
 HEAP32[$ReallocAsyncCtx4 + 12 >> 2] = $2; //@line 12642
 HEAP32[$ReallocAsyncCtx4 + 16 >> 2] = $10; //@line 12644
 HEAP32[$ReallocAsyncCtx4 + 20 >> 2] = $12; //@line 12646
 sp = STACKTOP; //@line 12647
 return;
}
function __ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $16 = 0, $21 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 8869
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 8873
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 8875
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 8877
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 8879
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 8881
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 8883
 $16 = HEAP8[$0 + 32 >> 0] & 1; //@line 8886
 $21 = (HEAP32[$0 + 4 >> 2] | 0) + 8 | 0; //@line 8887
 if ($21 >>> 0 < $4 >>> 0) {
  if (!(HEAP8[$6 >> 0] | 0)) {
   if ((HEAP32[$8 >> 2] | 0) != 1) {
    $ReallocAsyncCtx = _emscripten_realloc_async_context(36) | 0; //@line 8896
    __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($21, $10, $12, $14, $16); //@line 8897
    if (!___async) {
     ___async_unwind = 0; //@line 8900
    }
    HEAP32[$ReallocAsyncCtx >> 2] = 168; //@line 8902
    HEAP32[$ReallocAsyncCtx + 4 >> 2] = $21; //@line 8904
    HEAP32[$ReallocAsyncCtx + 8 >> 2] = $4; //@line 8906
    HEAP32[$ReallocAsyncCtx + 12 >> 2] = $6; //@line 8908
    HEAP32[$ReallocAsyncCtx + 16 >> 2] = $8; //@line 8910
    HEAP32[$ReallocAsyncCtx + 20 >> 2] = $10; //@line 8912
    HEAP32[$ReallocAsyncCtx + 24 >> 2] = $12; //@line 8914
    HEAP32[$ReallocAsyncCtx + 28 >> 2] = $14; //@line 8916
    HEAP8[$ReallocAsyncCtx + 32 >> 0] = $16 & 1; //@line 8919
    sp = STACKTOP; //@line 8920
    return;
   }
  }
 }
 return;
}
function __ZThn4_N17EthernetInterface15socket_recvfromEPvP13SocketAddressS0_j($0, $1, $2, $3, $4) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 var $14 = 0, $5 = 0, $8 = 0, $9 = 0, $AsyncCtx = 0, $AsyncCtx2 = 0, dest = 0, sp = 0, src = 0, stop = 0;
 sp = STACKTOP; //@line 905
 $5 = $0 + -4 | 0; //@line 906
 $8 = HEAP32[(HEAP32[$5 >> 2] | 0) + 92 >> 2] | 0; //@line 909
 $AsyncCtx = _emscripten_alloc_async_context(12, sp) | 0; //@line 910
 $9 = FUNCTION_TABLE_iiiii[$8 & 15]($5, $1, $3, $4) | 0; //@line 911
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 49; //@line 914
  HEAP32[$AsyncCtx + 4 >> 2] = $2; //@line 916
  HEAP32[$AsyncCtx + 8 >> 2] = $1; //@line 918
  sp = STACKTOP; //@line 919
  return 0; //@line 920
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 922
 if (($2 | 0) != 0 & ($9 | 0) > -1) {
  $14 = $1 + 12 | 0; //@line 927
  dest = $2; //@line 928
  src = $14; //@line 928
  stop = dest + 60 | 0; //@line 928
  do {
   HEAP32[dest >> 2] = HEAP32[src >> 2]; //@line 928
   dest = dest + 4 | 0; //@line 928
   src = src + 4 | 0; //@line 928
  } while ((dest | 0) < (stop | 0));
  HEAP16[$2 + 60 >> 1] = HEAP16[$14 + 60 >> 1] | 0; //@line 928
 }
 $AsyncCtx2 = _emscripten_alloc_async_context(8, sp) | 0; //@line 930
 _wait_ms(1); //@line 931
 if (___async) {
  HEAP32[$AsyncCtx2 >> 2] = 50; //@line 934
  HEAP32[$AsyncCtx2 + 4 >> 2] = $9; //@line 936
  sp = STACKTOP; //@line 937
  return 0; //@line 938
 } else {
  _emscripten_free_async_context($AsyncCtx2 | 0); //@line 940
  return $9 | 0; //@line 941
 }
 return 0; //@line 943
}
function __ZN9UDPSocketD2Ev($0) {
 $0 = $0 | 0;
 var $11 = 0, $15 = 0, $4 = 0, $8 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, $AsyncCtx7 = 0, sp = 0;
 sp = STACKTOP; //@line 3224
 HEAP32[$0 >> 2] = 480; //@line 3225
 $AsyncCtx7 = _emscripten_alloc_async_context(12, sp) | 0; //@line 3226
 __ZN6Socket5closeEv($0) | 0; //@line 3227
 if (___async) {
  HEAP32[$AsyncCtx7 >> 2] = 84; //@line 3230
  HEAP32[$AsyncCtx7 + 4 >> 2] = $0; //@line 3232
  HEAP32[$AsyncCtx7 + 8 >> 2] = $0; //@line 3234
  sp = STACKTOP; //@line 3235
  return;
 }
 _emscripten_free_async_context($AsyncCtx7 | 0); //@line 3238
 HEAP32[$0 >> 2] = 420; //@line 3239
 $4 = HEAP32[$0 + 44 >> 2] | 0; //@line 3241
 do {
  if ($4 | 0) {
   $8 = HEAP32[$4 + 8 >> 2] | 0; //@line 3247
   $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 3248
   FUNCTION_TABLE_vi[$8 & 255]($0 + 32 | 0); //@line 3249
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 85; //@line 3252
    HEAP32[$AsyncCtx + 4 >> 2] = $0; //@line 3254
    sp = STACKTOP; //@line 3255
    return;
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 3258
    break;
   }
  }
 } while (0);
 $11 = HEAP32[$0 + 28 >> 2] | 0; //@line 3264
 if (!$11) {
  return;
 }
 $15 = HEAP32[$11 + 8 >> 2] | 0; //@line 3271
 $AsyncCtx3 = _emscripten_alloc_async_context(4, sp) | 0; //@line 3272
 FUNCTION_TABLE_vi[$15 & 255]($0 + 16 | 0); //@line 3273
 if (___async) {
  HEAP32[$AsyncCtx3 >> 2] = 86; //@line 3276
  sp = STACKTOP; //@line 3277
  return;
 }
 _emscripten_free_async_context($AsyncCtx3 | 0); //@line 3280
 return;
}
function __ZN9TCPSocketD2Ev($0) {
 $0 = $0 | 0;
 var $11 = 0, $15 = 0, $4 = 0, $8 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, $AsyncCtx7 = 0, sp = 0;
 sp = STACKTOP; //@line 2728
 HEAP32[$0 >> 2] = 456; //@line 2729
 $AsyncCtx7 = _emscripten_alloc_async_context(12, sp) | 0; //@line 2730
 __ZN6Socket5closeEv($0) | 0; //@line 2731
 if (___async) {
  HEAP32[$AsyncCtx7 >> 2] = 72; //@line 2734
  HEAP32[$AsyncCtx7 + 4 >> 2] = $0; //@line 2736
  HEAP32[$AsyncCtx7 + 8 >> 2] = $0; //@line 2738
  sp = STACKTOP; //@line 2739
  return;
 }
 _emscripten_free_async_context($AsyncCtx7 | 0); //@line 2742
 HEAP32[$0 >> 2] = 420; //@line 2743
 $4 = HEAP32[$0 + 44 >> 2] | 0; //@line 2745
 do {
  if ($4 | 0) {
   $8 = HEAP32[$4 + 8 >> 2] | 0; //@line 2751
   $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 2752
   FUNCTION_TABLE_vi[$8 & 255]($0 + 32 | 0); //@line 2753
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 73; //@line 2756
    HEAP32[$AsyncCtx + 4 >> 2] = $0; //@line 2758
    sp = STACKTOP; //@line 2759
    return;
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 2762
    break;
   }
  }
 } while (0);
 $11 = HEAP32[$0 + 28 >> 2] | 0; //@line 2768
 if (!$11) {
  return;
 }
 $15 = HEAP32[$11 + 8 >> 2] | 0; //@line 2775
 $AsyncCtx3 = _emscripten_alloc_async_context(4, sp) | 0; //@line 2776
 FUNCTION_TABLE_vi[$15 & 255]($0 + 16 | 0); //@line 2777
 if (___async) {
  HEAP32[$AsyncCtx3 >> 2] = 74; //@line 2780
  sp = STACKTOP; //@line 2781
  return;
 }
 _emscripten_free_async_context($AsyncCtx3 | 0); //@line 2784
 return;
}
function __ZN17EthernetInterface15socket_recvfromEPvP13SocketAddressS0_j($0, $1, $2, $3, $4) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 var $13 = 0, $7 = 0, $8 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, dest = 0, sp = 0, src = 0, stop = 0;
 sp = STACKTOP; //@line 501
 $7 = HEAP32[(HEAP32[$0 >> 2] | 0) + 92 >> 2] | 0; //@line 504
 $AsyncCtx = _emscripten_alloc_async_context(12, sp) | 0; //@line 505
 $8 = FUNCTION_TABLE_iiiii[$7 & 15]($0, $1, $3, $4) | 0; //@line 506
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 36; //@line 509
  HEAP32[$AsyncCtx + 4 >> 2] = $2; //@line 511
  HEAP32[$AsyncCtx + 8 >> 2] = $1; //@line 513
  sp = STACKTOP; //@line 514
  return 0; //@line 515
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 517
 if (($2 | 0) != 0 & ($8 | 0) > -1) {
  $13 = $1 + 12 | 0; //@line 522
  dest = $2; //@line 523
  src = $13; //@line 523
  stop = dest + 60 | 0; //@line 523
  do {
   HEAP32[dest >> 2] = HEAP32[src >> 2]; //@line 523
   dest = dest + 4 | 0; //@line 523
   src = src + 4 | 0; //@line 523
  } while ((dest | 0) < (stop | 0));
  HEAP16[$2 + 60 >> 1] = HEAP16[$13 + 60 >> 1] | 0; //@line 523
 }
 $AsyncCtx3 = _emscripten_alloc_async_context(8, sp) | 0; //@line 525
 _wait_ms(1); //@line 526
 if (___async) {
  HEAP32[$AsyncCtx3 >> 2] = 37; //@line 529
  HEAP32[$AsyncCtx3 + 4 >> 2] = $8; //@line 531
  sp = STACKTOP; //@line 532
  return 0; //@line 533
 } else {
  _emscripten_free_async_context($AsyncCtx3 | 0); //@line 535
  return $8 | 0; //@line 536
 }
 return 0; //@line 538
}
function _main__async_cb($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $2 = 0, $20 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx10 = 0, sp = 0;
 sp = STACKTOP; //@line 10306
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 10308
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 10310
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 10312
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 10314
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 10316
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 10318
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 10320
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 10322
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 10324
 $20 = __Z18nsapi_create_stackP12NetworkStack(HEAP32[___async_retval >> 2] | 0) | 0; //@line 10327
 $ReallocAsyncCtx10 = _emscripten_realloc_async_context(40) | 0; //@line 10328
 __ZN6Socket4openEP12NetworkStack($2, $20) | 0; //@line 10329
 if (!___async) {
  ___async_unwind = 0; //@line 10332
 }
 HEAP32[$ReallocAsyncCtx10 >> 2] = 129; //@line 10334
 HEAP32[$ReallocAsyncCtx10 + 4 >> 2] = $8; //@line 10336
 HEAP32[$ReallocAsyncCtx10 + 8 >> 2] = $4; //@line 10338
 HEAP32[$ReallocAsyncCtx10 + 12 >> 2] = $6; //@line 10340
 HEAP32[$ReallocAsyncCtx10 + 16 >> 2] = $12; //@line 10342
 HEAP32[$ReallocAsyncCtx10 + 20 >> 2] = $14; //@line 10344
 HEAP32[$ReallocAsyncCtx10 + 24 >> 2] = $16; //@line 10346
 HEAP32[$ReallocAsyncCtx10 + 28 >> 2] = $18; //@line 10348
 HEAP32[$ReallocAsyncCtx10 + 32 >> 2] = $2; //@line 10350
 HEAP32[$ReallocAsyncCtx10 + 36 >> 2] = $10; //@line 10352
 sp = STACKTOP; //@line 10353
 return;
}
function __ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv__async_cb_29($0) {
 $0 = $0 | 0;
 var $15 = 0, $16 = 0, $2 = 0, $4 = 0, $6 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx = 0, dest = 0, sp = 0, stop = 0;
 sp = STACKTOP; //@line 11440
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 11442
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 11444
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 11446
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 11448
 if (!$AsyncRetVal) {
  HEAP8[___async_retval >> 0] = 0; //@line 11453
  return;
 }
 dest = $2 + 4 | 0; //@line 11457
 stop = dest + 52 | 0; //@line 11457
 do {
  HEAP32[dest >> 2] = 0; //@line 11457
  dest = dest + 4 | 0; //@line 11457
 } while ((dest | 0) < (stop | 0));
 HEAP32[$2 >> 2] = $AsyncRetVal; //@line 11458
 HEAP32[$2 + 8 >> 2] = $4; //@line 11460
 HEAP32[$2 + 12 >> 2] = -1; //@line 11462
 HEAP32[$2 + 48 >> 2] = 1; //@line 11464
 $15 = HEAP32[(HEAP32[$AsyncRetVal >> 2] | 0) + 28 >> 2] | 0; //@line 11467
 $16 = HEAP32[$6 >> 2] | 0; //@line 11468
 $ReallocAsyncCtx = _emscripten_realloc_async_context(16) | 0; //@line 11469
 FUNCTION_TABLE_viiii[$15 & 7]($AsyncRetVal, $2, $16, 1); //@line 11470
 if (!___async) {
  ___async_unwind = 0; //@line 11473
 }
 HEAP32[$ReallocAsyncCtx >> 2] = 153; //@line 11475
 HEAP32[$ReallocAsyncCtx + 4 >> 2] = $2; //@line 11477
 HEAP32[$ReallocAsyncCtx + 8 >> 2] = $6; //@line 11479
 HEAP32[$ReallocAsyncCtx + 12 >> 2] = $2; //@line 11481
 sp = STACKTOP; //@line 11482
 return;
}
function __ZN9UDPSocketD2Ev__async_cb_34($0) {
 $0 = $0 | 0;
 var $10 = 0, $11 = 0, $13 = 0, $17 = 0, $4 = 0, $6 = 0, $ReallocAsyncCtx = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 11683
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 11687
 HEAP32[HEAP32[$0 + 4 >> 2] >> 2] = 420; //@line 11688
 $6 = HEAP32[$4 + 44 >> 2] | 0; //@line 11690
 if ($6 | 0) {
  $10 = HEAP32[$6 + 8 >> 2] | 0; //@line 11695
  $ReallocAsyncCtx = _emscripten_realloc_async_context(8) | 0; //@line 11696
  FUNCTION_TABLE_vi[$10 & 255]($4 + 32 | 0); //@line 11697
  if (___async) {
   HEAP32[$ReallocAsyncCtx >> 2] = 85; //@line 11700
   $11 = $ReallocAsyncCtx + 4 | 0; //@line 11701
   HEAP32[$11 >> 2] = $4; //@line 11702
   sp = STACKTOP; //@line 11703
   return;
  }
  ___async_unwind = 0; //@line 11706
  HEAP32[$ReallocAsyncCtx >> 2] = 85; //@line 11707
  $11 = $ReallocAsyncCtx + 4 | 0; //@line 11708
  HEAP32[$11 >> 2] = $4; //@line 11709
  sp = STACKTOP; //@line 11710
  return;
 }
 $13 = HEAP32[$4 + 28 >> 2] | 0; //@line 11714
 if (!$13) {
  return;
 }
 $17 = HEAP32[$13 + 8 >> 2] | 0; //@line 11721
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(4) | 0; //@line 11722
 FUNCTION_TABLE_vi[$17 & 255]($4 + 16 | 0); //@line 11723
 if (___async) {
  HEAP32[$ReallocAsyncCtx2 >> 2] = 86; //@line 11726
  sp = STACKTOP; //@line 11727
  return;
 }
 ___async_unwind = 0; //@line 11730
 HEAP32[$ReallocAsyncCtx2 >> 2] = 86; //@line 11731
 sp = STACKTOP; //@line 11732
 return;
}
function __ZN9TCPSocketD2Ev__async_cb_31($0) {
 $0 = $0 | 0;
 var $10 = 0, $11 = 0, $13 = 0, $17 = 0, $4 = 0, $6 = 0, $ReallocAsyncCtx = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 11539
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 11543
 HEAP32[HEAP32[$0 + 4 >> 2] >> 2] = 420; //@line 11544
 $6 = HEAP32[$4 + 44 >> 2] | 0; //@line 11546
 if ($6 | 0) {
  $10 = HEAP32[$6 + 8 >> 2] | 0; //@line 11551
  $ReallocAsyncCtx = _emscripten_realloc_async_context(8) | 0; //@line 11552
  FUNCTION_TABLE_vi[$10 & 255]($4 + 32 | 0); //@line 11553
  if (___async) {
   HEAP32[$ReallocAsyncCtx >> 2] = 73; //@line 11556
   $11 = $ReallocAsyncCtx + 4 | 0; //@line 11557
   HEAP32[$11 >> 2] = $4; //@line 11558
   sp = STACKTOP; //@line 11559
   return;
  }
  ___async_unwind = 0; //@line 11562
  HEAP32[$ReallocAsyncCtx >> 2] = 73; //@line 11563
  $11 = $ReallocAsyncCtx + 4 | 0; //@line 11564
  HEAP32[$11 >> 2] = $4; //@line 11565
  sp = STACKTOP; //@line 11566
  return;
 }
 $13 = HEAP32[$4 + 28 >> 2] | 0; //@line 11570
 if (!$13) {
  return;
 }
 $17 = HEAP32[$13 + 8 >> 2] | 0; //@line 11577
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(4) | 0; //@line 11578
 FUNCTION_TABLE_vi[$17 & 255]($4 + 16 | 0); //@line 11579
 if (___async) {
  HEAP32[$ReallocAsyncCtx2 >> 2] = 74; //@line 11582
  sp = STACKTOP; //@line 11583
  return;
 }
 ___async_unwind = 0; //@line 11586
 HEAP32[$ReallocAsyncCtx2 >> 2] = 74; //@line 11587
 sp = STACKTOP; //@line 11588
 return;
}
function _wcrtomb($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$0 = 0;
 do {
  if (!$0) {
   $$0 = 1; //@line 5751
  } else {
   if ($1 >>> 0 < 128) {
    HEAP8[$0 >> 0] = $1; //@line 5756
    $$0 = 1; //@line 5757
    break;
   }
   if (!(HEAP32[HEAP32[(___pthread_self_910() | 0) + 188 >> 2] >> 2] | 0)) {
    if (($1 & -128 | 0) == 57216) {
     HEAP8[$0 >> 0] = $1; //@line 5770
     $$0 = 1; //@line 5771
     break;
    } else {
     HEAP32[(___errno_location() | 0) >> 2] = 84; //@line 5775
     $$0 = -1; //@line 5776
     break;
    }
   }
   if ($1 >>> 0 < 2048) {
    HEAP8[$0 >> 0] = $1 >>> 6 | 192; //@line 5786
    HEAP8[$0 + 1 >> 0] = $1 & 63 | 128; //@line 5790
    $$0 = 2; //@line 5791
    break;
   }
   if ($1 >>> 0 < 55296 | ($1 & -8192 | 0) == 57344) {
    HEAP8[$0 >> 0] = $1 >>> 12 | 224; //@line 5803
    HEAP8[$0 + 1 >> 0] = $1 >>> 6 & 63 | 128; //@line 5809
    HEAP8[$0 + 2 >> 0] = $1 & 63 | 128; //@line 5813
    $$0 = 3; //@line 5814
    break;
   }
   if (($1 + -65536 | 0) >>> 0 < 1048576) {
    HEAP8[$0 >> 0] = $1 >>> 18 | 240; //@line 5824
    HEAP8[$0 + 1 >> 0] = $1 >>> 12 & 63 | 128; //@line 5830
    HEAP8[$0 + 2 >> 0] = $1 >>> 6 & 63 | 128; //@line 5836
    HEAP8[$0 + 3 >> 0] = $1 & 63 | 128; //@line 5840
    $$0 = 4; //@line 5841
    break;
   } else {
    HEAP32[(___errno_location() | 0) >> 2] = 84; //@line 5845
    $$0 = -1; //@line 5846
    break;
   }
  }
 } while (0);
 return $$0 | 0; //@line 5851
}
function _main__async_cb_18($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $19 = 0, $2 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 10645
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 10647
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 10649
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 10651
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 10653
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 10655
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 10657
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 10659
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 10661
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 10663
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(40) | 0; //@line 10664
 $19 = __Znaj(256) | 0; //@line 10665
 if (!___async) {
  HEAP32[___async_retval >> 2] = $19; //@line 10669
  ___async_unwind = 0; //@line 10670
 }
 HEAP32[$ReallocAsyncCtx2 >> 2] = 131; //@line 10672
 HEAP32[$ReallocAsyncCtx2 + 4 >> 2] = $2; //@line 10674
 HEAP32[$ReallocAsyncCtx2 + 8 >> 2] = $4; //@line 10676
 HEAP32[$ReallocAsyncCtx2 + 12 >> 2] = $6; //@line 10678
 HEAP32[$ReallocAsyncCtx2 + 16 >> 2] = $8; //@line 10680
 HEAP32[$ReallocAsyncCtx2 + 20 >> 2] = $10; //@line 10682
 HEAP32[$ReallocAsyncCtx2 + 24 >> 2] = $12; //@line 10684
 HEAP32[$ReallocAsyncCtx2 + 28 >> 2] = $14; //@line 10686
 HEAP32[$ReallocAsyncCtx2 + 32 >> 2] = $16; //@line 10688
 HEAP32[$ReallocAsyncCtx2 + 36 >> 2] = $18; //@line 10690
 sp = STACKTOP; //@line 10691
 return;
}
function __ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_2($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $17 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 9005
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 9009
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 9011
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 9013
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 9015
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 9017
 $14 = HEAP8[$0 + 28 >> 0] & 1; //@line 9020
 $17 = (HEAP32[$0 + 4 >> 2] | 0) + 8 | 0; //@line 9021
 if ($17 >>> 0 < $4 >>> 0) {
  if (!(HEAP8[$6 >> 0] | 0)) {
   $ReallocAsyncCtx3 = _emscripten_realloc_async_context(32) | 0; //@line 9027
   __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($17, $8, $10, $12, $14); //@line 9028
   if (!___async) {
    ___async_unwind = 0; //@line 9031
   }
   HEAP32[$ReallocAsyncCtx3 >> 2] = 166; //@line 9033
   HEAP32[$ReallocAsyncCtx3 + 4 >> 2] = $17; //@line 9035
   HEAP32[$ReallocAsyncCtx3 + 8 >> 2] = $4; //@line 9037
   HEAP32[$ReallocAsyncCtx3 + 12 >> 2] = $6; //@line 9039
   HEAP32[$ReallocAsyncCtx3 + 16 >> 2] = $8; //@line 9041
   HEAP32[$ReallocAsyncCtx3 + 20 >> 2] = $10; //@line 9043
   HEAP32[$ReallocAsyncCtx3 + 24 >> 2] = $12; //@line 9045
   HEAP8[$ReallocAsyncCtx3 + 28 >> 0] = $14 & 1; //@line 9048
   sp = STACKTOP; //@line 9049
   return;
  }
 }
 return;
}
function __Z15nsapi_dns_queryP12NetworkStackPKcP13SocketAddress13nsapi_version($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $$byval_copy = 0, $4 = 0, $5 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 4699
 STACKTOP = STACKTOP + 48 | 0; //@line 4700
 $$byval_copy = sp + 20 | 0; //@line 4701
 $4 = sp; //@line 4702
 $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 4703
 $5 = __ZL24nsapi_dns_query_multipleP12NetworkStackPKcP10nsapi_addrj13nsapi_version($0, $1, $4, 1, $3) | 0; //@line 4704
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 104; //@line 4707
  HEAP32[$AsyncCtx + 4 >> 2] = $2; //@line 4709
  HEAP32[$AsyncCtx + 8 >> 2] = $4; //@line 4711
  HEAP32[$AsyncCtx + 12 >> 2] = $4; //@line 4713
  sp = STACKTOP; //@line 4714
  STACKTOP = sp; //@line 4715
  return 0; //@line 4715
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 4717
  HEAP32[$$byval_copy >> 2] = HEAP32[$4 >> 2]; //@line 4718
  HEAP32[$$byval_copy + 4 >> 2] = HEAP32[$4 + 4 >> 2]; //@line 4718
  HEAP32[$$byval_copy + 8 >> 2] = HEAP32[$4 + 8 >> 2]; //@line 4718
  HEAP32[$$byval_copy + 12 >> 2] = HEAP32[$4 + 12 >> 2]; //@line 4718
  HEAP32[$$byval_copy + 16 >> 2] = HEAP32[$4 + 16 >> 2]; //@line 4718
  __ZN13SocketAddress8set_addrE10nsapi_addr($2, $$byval_copy); //@line 4719
  STACKTOP = sp; //@line 4722
  return (($5 | 0) < 0 ? $5 : 0) | 0; //@line 4722
 }
 return 0; //@line 4724
}
function _main__async_cb_21($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $2 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx7 = 0, sp = 0;
 sp = STACKTOP; //@line 10733
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 10735
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 10737
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 10739
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 10741
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 10743
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 10745
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 10747
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 10749
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 10751
 $ReallocAsyncCtx7 = _emscripten_realloc_async_context(40) | 0; //@line 10752
 __ZN9TCPSocket7connectEPKct($2, 3624, 80) | 0; //@line 10753
 if (!___async) {
  ___async_unwind = 0; //@line 10756
 }
 HEAP32[$ReallocAsyncCtx7 >> 2] = 130; //@line 10758
 HEAP32[$ReallocAsyncCtx7 + 4 >> 2] = $2; //@line 10760
 HEAP32[$ReallocAsyncCtx7 + 8 >> 2] = $4; //@line 10762
 HEAP32[$ReallocAsyncCtx7 + 12 >> 2] = $6; //@line 10764
 HEAP32[$ReallocAsyncCtx7 + 16 >> 2] = $8; //@line 10766
 HEAP32[$ReallocAsyncCtx7 + 20 >> 2] = $10; //@line 10768
 HEAP32[$ReallocAsyncCtx7 + 24 >> 2] = $12; //@line 10770
 HEAP32[$ReallocAsyncCtx7 + 28 >> 2] = $14; //@line 10772
 HEAP32[$ReallocAsyncCtx7 + 32 >> 2] = $16; //@line 10774
 HEAP32[$ReallocAsyncCtx7 + 36 >> 2] = $18; //@line 10776
 sp = STACKTOP; //@line 10777
 return;
}
function _fmt_u($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$010$lcssa$off0 = 0, $$012 = 0, $$09$lcssa = 0, $$0914 = 0, $$1$lcssa = 0, $$111 = 0, $10 = 0, $26 = 0, $8 = 0, $9 = 0, $8$looptemp = 0;
 if ($1 >>> 0 > 0 | ($1 | 0) == 0 & $0 >>> 0 > 4294967295) {
  $$0914 = $2; //@line 4635
  $8 = $0; //@line 4635
  $9 = $1; //@line 4635
  while (1) {
   $10 = ___uremdi3($8 | 0, $9 | 0, 10, 0) | 0; //@line 4637
   $$0914 = $$0914 + -1 | 0; //@line 4641
   HEAP8[$$0914 >> 0] = $10 & 255 | 48; //@line 4642
   $8$looptemp = $8;
   $8 = ___udivdi3($8 | 0, $9 | 0, 10, 0) | 0; //@line 4643
   if (!($9 >>> 0 > 9 | ($9 | 0) == 9 & $8$looptemp >>> 0 > 4294967295)) {
    break;
   } else {
    $9 = tempRet0; //@line 4651
   }
  }
  $$010$lcssa$off0 = $8; //@line 4656
  $$09$lcssa = $$0914; //@line 4656
 } else {
  $$010$lcssa$off0 = $0; //@line 4658
  $$09$lcssa = $2; //@line 4658
 }
 if (!$$010$lcssa$off0) {
  $$1$lcssa = $$09$lcssa; //@line 4662
 } else {
  $$012 = $$010$lcssa$off0; //@line 4664
  $$111 = $$09$lcssa; //@line 4664
  while (1) {
   $26 = $$111 + -1 | 0; //@line 4669
   HEAP8[$26 >> 0] = ($$012 >>> 0) % 10 | 0 | 48; //@line 4670
   if ($$012 >>> 0 < 10) {
    $$1$lcssa = $26; //@line 4674
    break;
   } else {
    $$012 = ($$012 >>> 0) / 10 | 0; //@line 4677
    $$111 = $26; //@line 4677
   }
  }
 }
 return $$1$lcssa | 0; //@line 4681
}
function __ZNK10__cxxabiv121__vmi_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $13 = 0, $2 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 13353
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 13355
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 13359
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 13361
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 13363
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 13365
 if (!(HEAP8[$2 >> 0] | 0)) {
  $13 = (HEAP32[$0 + 8 >> 2] | 0) + 8 | 0; //@line 13369
  if ($13 >>> 0 < $6 >>> 0) {
   $ReallocAsyncCtx = _emscripten_realloc_async_context(28) | 0; //@line 13372
   __ZNK10__cxxabiv122__base_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($13, $8, $10, $12); //@line 13373
   if (!___async) {
    ___async_unwind = 0; //@line 13376
   }
   HEAP32[$ReallocAsyncCtx >> 2] = 170; //@line 13378
   HEAP32[$ReallocAsyncCtx + 4 >> 2] = $2; //@line 13380
   HEAP32[$ReallocAsyncCtx + 8 >> 2] = $13; //@line 13382
   HEAP32[$ReallocAsyncCtx + 12 >> 2] = $6; //@line 13384
   HEAP32[$ReallocAsyncCtx + 16 >> 2] = $8; //@line 13386
   HEAP32[$ReallocAsyncCtx + 20 >> 2] = $10; //@line 13388
   HEAP32[$ReallocAsyncCtx + 24 >> 2] = $12; //@line 13390
   sp = STACKTOP; //@line 13391
   return;
  }
 }
 return;
}
function _strlen($0) {
 $0 = $0 | 0;
 var $$0 = 0, $$015$lcssa = 0, $$01519 = 0, $$1$lcssa = 0, $$pn = 0, $$sink = 0, $1 = 0, $10 = 0, $19 = 0, $23 = 0, $6 = 0, label = 0;
 $1 = $0; //@line 10183
 L1 : do {
  if (!($1 & 3)) {
   $$015$lcssa = $0; //@line 10188
   label = 4; //@line 10189
  } else {
   $$01519 = $0; //@line 10191
   $23 = $1; //@line 10191
   while (1) {
    if (!(HEAP8[$$01519 >> 0] | 0)) {
     $$sink = $23; //@line 10196
     break L1;
    }
    $6 = $$01519 + 1 | 0; //@line 10199
    $23 = $6; //@line 10200
    if (!($23 & 3)) {
     $$015$lcssa = $6; //@line 10204
     label = 4; //@line 10205
     break;
    } else {
     $$01519 = $6; //@line 10208
    }
   }
  }
 } while (0);
 if ((label | 0) == 4) {
  $$0 = $$015$lcssa; //@line 10214
  while (1) {
   $10 = HEAP32[$$0 >> 2] | 0; //@line 10216
   if (!(($10 & -2139062144 ^ -2139062144) & $10 + -16843009)) {
    $$0 = $$0 + 4 | 0; //@line 10224
   } else {
    break;
   }
  }
  if (!(($10 & 255) << 24 >> 24)) {
   $$1$lcssa = $$0; //@line 10232
  } else {
   $$pn = $$0; //@line 10234
   while (1) {
    $19 = $$pn + 1 | 0; //@line 10236
    if (!(HEAP8[$19 >> 0] | 0)) {
     $$1$lcssa = $19; //@line 10240
     break;
    } else {
     $$pn = $19; //@line 10243
    }
   }
  }
  $$sink = $$1$lcssa; //@line 10248
 }
 return $$sink - $1 | 0; //@line 10251
}
function __ZThn4_N17EthernetInterface15socket_recvfromEPvP13SocketAddressS0_j__async_cb($0) {
 $0 = $0 | 0;
 var $2 = 0, $8 = 0, $9 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx2 = 0, dest = 0, sp = 0, src = 0, stop = 0;
 sp = STACKTOP; //@line 13445
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 13447
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 13451
 if (($2 | 0) != 0 & ($AsyncRetVal | 0) > -1) {
  $8 = (HEAP32[$0 + 8 >> 2] | 0) + 12 | 0; //@line 13456
  dest = $2; //@line 13457
  src = $8; //@line 13457
  stop = dest + 60 | 0; //@line 13457
  do {
   HEAP32[dest >> 2] = HEAP32[src >> 2]; //@line 13457
   dest = dest + 4 | 0; //@line 13457
   src = src + 4 | 0; //@line 13457
  } while ((dest | 0) < (stop | 0));
  HEAP16[$2 + 60 >> 1] = HEAP16[$8 + 60 >> 1] | 0; //@line 13457
 }
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(8) | 0; //@line 13459
 _wait_ms(1); //@line 13460
 if (___async) {
  HEAP32[$ReallocAsyncCtx2 >> 2] = 50; //@line 13463
  $9 = $ReallocAsyncCtx2 + 4 | 0; //@line 13464
  HEAP32[$9 >> 2] = $AsyncRetVal; //@line 13465
  sp = STACKTOP; //@line 13466
  return;
 }
 ___async_unwind = 0; //@line 13469
 HEAP32[$ReallocAsyncCtx2 >> 2] = 50; //@line 13470
 $9 = $ReallocAsyncCtx2 + 4 | 0; //@line 13471
 HEAP32[$9 >> 2] = $AsyncRetVal; //@line 13472
 sp = STACKTOP; //@line 13473
 return;
}
function __ZNK10__cxxabiv117__class_type_info29process_static_type_above_dstEPNS_19__dynamic_cast_infoEPKvS4_i($0, $1, $2, $3, $4) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 var $10 = 0, $11 = 0, $21 = 0, $22 = 0, $28 = 0, $30 = 0;
 HEAP8[$1 + 53 >> 0] = 1; //@line 7504
 do {
  if ((HEAP32[$1 + 4 >> 2] | 0) == ($3 | 0)) {
   HEAP8[$1 + 52 >> 0] = 1; //@line 7511
   $10 = $1 + 16 | 0; //@line 7512
   $11 = HEAP32[$10 >> 2] | 0; //@line 7513
   if (!$11) {
    HEAP32[$10 >> 2] = $2; //@line 7516
    HEAP32[$1 + 24 >> 2] = $4; //@line 7518
    HEAP32[$1 + 36 >> 2] = 1; //@line 7520
    if (!(($4 | 0) == 1 ? (HEAP32[$1 + 48 >> 2] | 0) == 1 : 0)) {
     break;
    }
    HEAP8[$1 + 54 >> 0] = 1; //@line 7530
    break;
   }
   if (($11 | 0) != ($2 | 0)) {
    $30 = $1 + 36 | 0; //@line 7535
    HEAP32[$30 >> 2] = (HEAP32[$30 >> 2] | 0) + 1; //@line 7538
    HEAP8[$1 + 54 >> 0] = 1; //@line 7540
    break;
   }
   $21 = $1 + 24 | 0; //@line 7543
   $22 = HEAP32[$21 >> 2] | 0; //@line 7544
   if (($22 | 0) == 2) {
    HEAP32[$21 >> 2] = $4; //@line 7547
    $28 = $4; //@line 7548
   } else {
    $28 = $22; //@line 7550
   }
   if (($28 | 0) == 1 ? (HEAP32[$1 + 48 >> 2] | 0) == 1 : 0) {
    HEAP8[$1 + 54 >> 0] = 1; //@line 7559
   }
  }
 } while (0);
 return;
}
function __ZN6Socket5closeEv__async_cb($0) {
 $0 = $0 | 0;
 var $11 = 0, $12 = 0, $13 = 0, $14 = 0, $2 = 0, $4 = 0, $6 = 0, $7 = 0, $8 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 11333
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 11335
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 11337
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 11339
 $7 = HEAP32[$2 >> 2] | 0; //@line 11340
 HEAP32[$2 >> 2] = 0; //@line 11341
 $8 = HEAP32[$4 >> 2] | 0; //@line 11342
 $11 = HEAP32[(HEAP32[$8 >> 2] | 0) + 32 >> 2] | 0; //@line 11345
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(12) | 0; //@line 11346
 $12 = FUNCTION_TABLE_iii[$11 & 7]($8, $7) | 0; //@line 11347
 if (___async) {
  HEAP32[$ReallocAsyncCtx2 >> 2] = 70; //@line 11350
  $13 = $ReallocAsyncCtx2 + 4 | 0; //@line 11351
  HEAP32[$13 >> 2] = $4; //@line 11352
  $14 = $ReallocAsyncCtx2 + 8 | 0; //@line 11353
  HEAP32[$14 >> 2] = $6; //@line 11354
  sp = STACKTOP; //@line 11355
  return;
 }
 HEAP32[___async_retval >> 2] = $12; //@line 11359
 ___async_unwind = 0; //@line 11360
 HEAP32[$ReallocAsyncCtx2 >> 2] = 70; //@line 11361
 $13 = $ReallocAsyncCtx2 + 4 | 0; //@line 11362
 HEAP32[$13 >> 2] = $4; //@line 11363
 $14 = $ReallocAsyncCtx2 + 8 | 0; //@line 11364
 HEAP32[$14 >> 2] = $6; //@line 11365
 sp = STACKTOP; //@line 11366
 return;
}
function __ZN17EthernetInterface15socket_recvfromEPvP13SocketAddressS0_j__async_cb($0) {
 $0 = $0 | 0;
 var $2 = 0, $8 = 0, $9 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx2 = 0, dest = 0, sp = 0, src = 0, stop = 0;
 sp = STACKTOP; //@line 9543
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 9545
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 9549
 if (($2 | 0) != 0 & ($AsyncRetVal | 0) > -1) {
  $8 = (HEAP32[$0 + 8 >> 2] | 0) + 12 | 0; //@line 9554
  dest = $2; //@line 9555
  src = $8; //@line 9555
  stop = dest + 60 | 0; //@line 9555
  do {
   HEAP32[dest >> 2] = HEAP32[src >> 2]; //@line 9555
   dest = dest + 4 | 0; //@line 9555
   src = src + 4 | 0; //@line 9555
  } while ((dest | 0) < (stop | 0));
  HEAP16[$2 + 60 >> 1] = HEAP16[$8 + 60 >> 1] | 0; //@line 9555
 }
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(8) | 0; //@line 9557
 _wait_ms(1); //@line 9558
 if (___async) {
  HEAP32[$ReallocAsyncCtx2 >> 2] = 37; //@line 9561
  $9 = $ReallocAsyncCtx2 + 4 | 0; //@line 9562
  HEAP32[$9 >> 2] = $AsyncRetVal; //@line 9563
  sp = STACKTOP; //@line 9564
  return;
 }
 ___async_unwind = 0; //@line 9567
 HEAP32[$ReallocAsyncCtx2 >> 2] = 37; //@line 9568
 $9 = $ReallocAsyncCtx2 + 4 | 0; //@line 9569
 HEAP32[$9 >> 2] = $AsyncRetVal; //@line 9570
 sp = STACKTOP; //@line 9571
 return;
}
function _puts($0) {
 $0 = $0 | 0;
 var $1 = 0, $11 = 0, $12 = 0, $17 = 0, $19 = 0, $22 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 6842
 $1 = HEAP32[396] | 0; //@line 6843
 if ((HEAP32[$1 + 76 >> 2] | 0) > -1) {
  $19 = ___lockfile($1) | 0; //@line 6849
 } else {
  $19 = 0; //@line 6851
 }
 do {
  if ((_fputs($0, $1) | 0) < 0) {
   $22 = -1; //@line 6857
  } else {
   if ((HEAP8[$1 + 75 >> 0] | 0) != 10) {
    $11 = $1 + 20 | 0; //@line 6863
    $12 = HEAP32[$11 >> 2] | 0; //@line 6864
    if ($12 >>> 0 < (HEAP32[$1 + 16 >> 2] | 0) >>> 0) {
     HEAP32[$11 >> 2] = $12 + 1; //@line 6870
     HEAP8[$12 >> 0] = 10; //@line 6871
     $22 = 0; //@line 6872
     break;
    }
   }
   $AsyncCtx = _emscripten_alloc_async_context(12, sp) | 0; //@line 6876
   $17 = ___overflow($1, 10) | 0; //@line 6877
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 145; //@line 6880
    HEAP32[$AsyncCtx + 4 >> 2] = $19; //@line 6882
    HEAP32[$AsyncCtx + 8 >> 2] = $1; //@line 6884
    sp = STACKTOP; //@line 6885
    return 0; //@line 6886
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 6888
    $22 = $17 >> 31; //@line 6890
    break;
   }
  }
 } while (0);
 if ($19 | 0) {
  ___unlockfile($1); //@line 6897
 }
 return $22 | 0; //@line 6899
}
function __ZN6Socket4openEP12NetworkStack__async_cb($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $16 = 0, $2 = 0, $4 = 0, $6 = 0, $8 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 12722
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 12724
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 12726
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 12728
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 12730
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 12732
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 12734
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 12736
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 12738
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(24) | 0; //@line 12739
 $16 = FUNCTION_TABLE_iiii[$10 & 15]($6, $8, $AsyncRetVal) | 0; //@line 12740
 if (!___async) {
  HEAP32[___async_retval >> 2] = $16; //@line 12744
  ___async_unwind = 0; //@line 12745
 }
 HEAP32[$ReallocAsyncCtx2 >> 2] = 60; //@line 12747
 HEAP32[$ReallocAsyncCtx2 + 4 >> 2] = $2; //@line 12749
 HEAP32[$ReallocAsyncCtx2 + 8 >> 2] = $4; //@line 12751
 HEAP32[$ReallocAsyncCtx2 + 12 >> 2] = $8; //@line 12753
 HEAP32[$ReallocAsyncCtx2 + 16 >> 2] = $12; //@line 12755
 HEAP32[$ReallocAsyncCtx2 + 20 >> 2] = $14; //@line 12757
 sp = STACKTOP; //@line 12758
 return;
}
function __ZNK10__cxxabiv121__vmi_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb_63($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 13401
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 13407
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 13409
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 13411
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 13413
 if ((HEAP32[$0 + 4 >> 2] | 0) <= 1) {
  return;
 }
 $14 = (HEAP32[$0 + 8 >> 2] | 0) + 24 | 0; //@line 13418
 $ReallocAsyncCtx = _emscripten_realloc_async_context(28) | 0; //@line 13420
 __ZNK10__cxxabiv122__base_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($14, $6, $8, $10); //@line 13421
 if (!___async) {
  ___async_unwind = 0; //@line 13424
 }
 HEAP32[$ReallocAsyncCtx >> 2] = 170; //@line 13426
 HEAP32[$ReallocAsyncCtx + 4 >> 2] = $6 + 54; //@line 13428
 HEAP32[$ReallocAsyncCtx + 8 >> 2] = $14; //@line 13430
 HEAP32[$ReallocAsyncCtx + 12 >> 2] = $12; //@line 13432
 HEAP32[$ReallocAsyncCtx + 16 >> 2] = $6; //@line 13434
 HEAP32[$ReallocAsyncCtx + 20 >> 2] = $8; //@line 13436
 HEAP32[$ReallocAsyncCtx + 24 >> 2] = $10; //@line 13438
 sp = STACKTOP; //@line 13439
 return;
}
function __ZN16NetworkInterface13gethostbynameEPKcP13SocketAddress13nsapi_version($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $13 = 0, $14 = 0, $6 = 0, $7 = 0, $AsyncCtx = 0, $AsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 966
 $6 = HEAP32[(HEAP32[$0 >> 2] | 0) + 60 >> 2] | 0; //@line 969
 $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 970
 $7 = FUNCTION_TABLE_ii[$6 & 15]($0) | 0; //@line 971
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 51; //@line 974
  HEAP32[$AsyncCtx + 4 >> 2] = $1; //@line 976
  HEAP32[$AsyncCtx + 8 >> 2] = $2; //@line 978
  HEAP32[$AsyncCtx + 12 >> 2] = $3; //@line 980
  sp = STACKTOP; //@line 981
  return 0; //@line 982
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 984
 $13 = HEAP32[(HEAP32[$7 >> 2] | 0) + 12 >> 2] | 0; //@line 987
 $AsyncCtx2 = _emscripten_alloc_async_context(4, sp) | 0; //@line 988
 $14 = FUNCTION_TABLE_iiiii[$13 & 15]($7, $1, $2, $3) | 0; //@line 989
 if (___async) {
  HEAP32[$AsyncCtx2 >> 2] = 52; //@line 992
  sp = STACKTOP; //@line 993
  return 0; //@line 994
 } else {
  _emscripten_free_async_context($AsyncCtx2 | 0); //@line 996
  return $14 | 0; //@line 997
 }
 return 0; //@line 999
}
function __ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb($0) {
 $0 = $0 | 0;
 var $$037$off038 = 0, $$037$off039 = 0, $12 = 0, $17 = 0, $4 = 0, $6 = 0, $8 = 0, label = 0;
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 13555
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 13557
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 13559
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 13563
 if (!(HEAP8[HEAP32[$0 + 4 >> 2] >> 0] | 0)) {
  $$037$off038 = 4; //@line 13567
  label = 4; //@line 13568
 } else {
  if (!(HEAP8[HEAP32[$0 + 20 >> 2] >> 0] | 0)) {
   $$037$off038 = 3; //@line 13573
   label = 4; //@line 13574
  } else {
   $$037$off039 = 3; //@line 13576
  }
 }
 if ((label | 0) == 4) {
  HEAP32[$6 >> 2] = $4; //@line 13580
  $17 = $8 + 40 | 0; //@line 13581
  HEAP32[$17 >> 2] = (HEAP32[$17 >> 2] | 0) + 1; //@line 13584
  if ((HEAP32[$8 + 36 >> 2] | 0) == 1) {
   if ((HEAP32[$8 + 24 >> 2] | 0) == 2) {
    HEAP8[$8 + 54 >> 0] = 1; //@line 13594
    $$037$off039 = $$037$off038; //@line 13595
   } else {
    $$037$off039 = $$037$off038; //@line 13597
   }
  } else {
   $$037$off039 = $$037$off038; //@line 13600
  }
 }
 HEAP32[$12 >> 2] = $$037$off039; //@line 13603
 return;
}
function __ZL25default_terminate_handlerv__async_cb($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $15 = 0, $16 = 0, $2 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 9676
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 9678
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 9680
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 9682
 $8 = HEAP32[$0 + 20 >> 2] | 0; //@line 9684
 $10 = HEAP32[$0 + 24 >> 2] | 0; //@line 9686
 if (!(HEAP8[___async_retval >> 0] & 1)) {
  HEAP32[$4 >> 2] = 6587; //@line 9691
  HEAP32[$4 + 4 >> 2] = $6; //@line 9693
  _abort_message(6496, $4); //@line 9694
 }
 $12 = HEAP32[$2 >> 2] | 0; //@line 9697
 $15 = HEAP32[(HEAP32[$12 >> 2] | 0) + 8 >> 2] | 0; //@line 9700
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(16) | 0; //@line 9701
 $16 = FUNCTION_TABLE_ii[$15 & 15]($12) | 0; //@line 9702
 if (!___async) {
  HEAP32[___async_retval >> 2] = $16; //@line 9706
  ___async_unwind = 0; //@line 9707
 }
 HEAP32[$ReallocAsyncCtx2 >> 2] = 149; //@line 9709
 HEAP32[$ReallocAsyncCtx2 + 4 >> 2] = $8; //@line 9711
 HEAP32[$ReallocAsyncCtx2 + 8 >> 2] = $6; //@line 9713
 HEAP32[$ReallocAsyncCtx2 + 12 >> 2] = $10; //@line 9715
 sp = STACKTOP; //@line 9716
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
   __ZNK10__cxxabiv117__class_type_info29process_static_type_below_dstEPNS_19__dynamic_cast_infoEPKvi(0, $1, $2, $3); //@line 7363
  } else {
   if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 >> 2] | 0, $4) | 0) {
    if ((HEAP32[$1 + 16 >> 2] | 0) != ($2 | 0)) {
     $13 = $1 + 20 | 0; //@line 7372
     if ((HEAP32[$13 >> 2] | 0) != ($2 | 0)) {
      HEAP32[$1 + 32 >> 2] = $3; //@line 7377
      HEAP32[$13 >> 2] = $2; //@line 7378
      $19 = $1 + 40 | 0; //@line 7379
      HEAP32[$19 >> 2] = (HEAP32[$19 >> 2] | 0) + 1; //@line 7382
      if ((HEAP32[$1 + 36 >> 2] | 0) == 1) {
       if ((HEAP32[$1 + 24 >> 2] | 0) == 2) {
        HEAP8[$1 + 54 >> 0] = 1; //@line 7392
       }
      }
      HEAP32[$1 + 44 >> 2] = 4; //@line 7396
      break;
     }
    }
    if (($3 | 0) == 1) {
     HEAP32[$1 + 32 >> 2] = 1; //@line 7403
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
 $$016 = 0; //@line 5871
 while (1) {
  if ((HEAPU8[4559 + $$016 >> 0] | 0) == ($0 | 0)) {
   label = 2; //@line 5878
   break;
  }
  $7 = $$016 + 1 | 0; //@line 5881
  if (($7 | 0) == 87) {
   $$01214 = 4647; //@line 5884
   $$115 = 87; //@line 5884
   label = 5; //@line 5885
   break;
  } else {
   $$016 = $7; //@line 5888
  }
 }
 if ((label | 0) == 2) {
  if (!$$016) {
   $$012$lcssa = 4647; //@line 5894
  } else {
   $$01214 = 4647; //@line 5896
   $$115 = $$016; //@line 5896
   label = 5; //@line 5897
  }
 }
 if ((label | 0) == 5) {
  while (1) {
   label = 0; //@line 5902
   $$113 = $$01214; //@line 5903
   do {
    $$113$looptemp = $$113;
    $$113 = $$113 + 1 | 0; //@line 5907
   } while ((HEAP8[$$113$looptemp >> 0] | 0) != 0);
   $$115 = $$115 + -1 | 0; //@line 5914
   if (!$$115) {
    $$012$lcssa = $$113; //@line 5917
    break;
   } else {
    $$01214 = $$113; //@line 5920
    label = 5; //@line 5921
   }
  }
 }
 return ___lctrans($$012$lcssa, HEAP32[$1 + 20 >> 2] | 0) | 0; //@line 5928
}
function _strstr($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0 = 0, $2 = 0, $5 = 0;
 $2 = HEAP8[$1 >> 0] | 0; //@line 5944
 do {
  if (!($2 << 24 >> 24)) {
   $$0 = $0; //@line 5948
  } else {
   $5 = _strchr($0, $2 << 24 >> 24) | 0; //@line 5951
   if (!$5) {
    $$0 = 0; //@line 5954
   } else {
    if (!(HEAP8[$1 + 1 >> 0] | 0)) {
     $$0 = $5; //@line 5960
    } else {
     if (!(HEAP8[$5 + 1 >> 0] | 0)) {
      $$0 = 0; //@line 5966
     } else {
      if (!(HEAP8[$1 + 2 >> 0] | 0)) {
       $$0 = _twobyte_strstr($5, $1) | 0; //@line 5973
       break;
      }
      if (!(HEAP8[$5 + 2 >> 0] | 0)) {
       $$0 = 0; //@line 5980
      } else {
       if (!(HEAP8[$1 + 3 >> 0] | 0)) {
        $$0 = _threebyte_strstr($5, $1) | 0; //@line 5987
        break;
       }
       if (!(HEAP8[$5 + 3 >> 0] | 0)) {
        $$0 = 0; //@line 5994
       } else {
        if (!(HEAP8[$1 + 4 >> 0] | 0)) {
         $$0 = _fourbyte_strstr($5, $1) | 0; //@line 6001
         break;
        } else {
         $$0 = _twoway_strstr($5, $1) | 0; //@line 6005
         break;
        }
       }
      }
     }
    }
   }
  }
 } while (0);
 return $$0 | 0; //@line 6015
}
function _fourbyte_strstr($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$lcssa = 0, $$sink21$lcssa = 0, $$sink2123 = 0, $18 = 0, $32 = 0, $33 = 0, $35 = 0, $39 = 0, $40 = 0, $41 = 0;
 $18 = (HEAPU8[$1 + 1 >> 0] | 0) << 16 | (HEAPU8[$1 >> 0] | 0) << 24 | (HEAPU8[$1 + 2 >> 0] | 0) << 8 | (HEAPU8[$1 + 3 >> 0] | 0); //@line 6140
 $32 = $0 + 3 | 0; //@line 6154
 $33 = HEAP8[$32 >> 0] | 0; //@line 6155
 $35 = (HEAPU8[$0 + 1 >> 0] | 0) << 16 | (HEAPU8[$0 >> 0] | 0) << 24 | (HEAPU8[$0 + 2 >> 0] | 0) << 8 | $33 & 255; //@line 6157
 if ($33 << 24 >> 24 == 0 | ($35 | 0) == ($18 | 0)) {
  $$lcssa = $33; //@line 6162
  $$sink21$lcssa = $32; //@line 6162
 } else {
  $$sink2123 = $32; //@line 6164
  $39 = $35; //@line 6164
  while (1) {
   $40 = $$sink2123 + 1 | 0; //@line 6167
   $41 = HEAP8[$40 >> 0] | 0; //@line 6168
   $39 = $39 << 8 | $41 & 255; //@line 6170
   if ($41 << 24 >> 24 == 0 | ($39 | 0) == ($18 | 0)) {
    $$lcssa = $41; //@line 6175
    $$sink21$lcssa = $40; //@line 6175
    break;
   } else {
    $$sink2123 = $40; //@line 6178
   }
  }
 }
 return ($$lcssa << 24 >> 24 ? $$sink21$lcssa + -3 | 0 : 0) | 0; //@line 6185
}
function __ZN4mbed8CallbackIFvvEE5thunkEPv($0) {
 $0 = $0 | 0;
 var $1 = 0, $2 = 0, $6 = 0, $7 = 0, $AsyncCtx = 0, $AsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 1489
 $1 = $0 + 12 | 0; //@line 1490
 $2 = HEAP32[$1 >> 2] | 0; //@line 1491
 do {
  if (!$2) {
   $AsyncCtx2 = _emscripten_alloc_async_context(12, sp) | 0; //@line 1495
   _mbed_assert_internal(3460, 3465, 528); //@line 1496
   if (___async) {
    HEAP32[$AsyncCtx2 >> 2] = 66; //@line 1499
    HEAP32[$AsyncCtx2 + 4 >> 2] = $1; //@line 1501
    HEAP32[$AsyncCtx2 + 8 >> 2] = $0; //@line 1503
    sp = STACKTOP; //@line 1504
    return;
   } else {
    _emscripten_free_async_context($AsyncCtx2 | 0); //@line 1507
    $7 = HEAP32[$1 >> 2] | 0; //@line 1509
    break;
   }
  } else {
   $7 = $2; //@line 1513
  }
 } while (0);
 $6 = HEAP32[$7 >> 2] | 0; //@line 1516
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 1517
 FUNCTION_TABLE_vi[$6 & 255]($0); //@line 1518
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 67; //@line 1521
  sp = STACKTOP; //@line 1522
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 1525
  return;
 }
}
function __ZN6SocketD2Ev($0) {
 $0 = $0 | 0;
 var $13 = 0, $2 = 0, $6 = 0, $9 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 1212
 HEAP32[$0 >> 2] = 420; //@line 1213
 $2 = HEAP32[$0 + 44 >> 2] | 0; //@line 1215
 do {
  if ($2 | 0) {
   $6 = HEAP32[$2 + 8 >> 2] | 0; //@line 1221
   $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 1222
   FUNCTION_TABLE_vi[$6 & 255]($0 + 32 | 0); //@line 1223
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 57; //@line 1226
    HEAP32[$AsyncCtx + 4 >> 2] = $0; //@line 1228
    sp = STACKTOP; //@line 1229
    return;
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 1232
    break;
   }
  }
 } while (0);
 $9 = HEAP32[$0 + 28 >> 2] | 0; //@line 1238
 if (!$9) {
  return;
 }
 $13 = HEAP32[$9 + 8 >> 2] | 0; //@line 1245
 $AsyncCtx3 = _emscripten_alloc_async_context(4, sp) | 0; //@line 1246
 FUNCTION_TABLE_vi[$13 & 255]($0 + 16 | 0); //@line 1247
 if (___async) {
  HEAP32[$AsyncCtx3 >> 2] = 58; //@line 1250
  sp = STACKTOP; //@line 1251
  return;
 }
 _emscripten_free_async_context($AsyncCtx3 | 0); //@line 1254
 return;
}
function _invoke_ticker($0) {
 $0 = $0 | 0;
 var $2 = 0, $3 = 0, $7 = 0, $8 = 0, $AsyncCtx = 0, $AsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 5087
 $2 = $0 + 12 | 0; //@line 5089
 $3 = HEAP32[$2 >> 2] | 0; //@line 5090
 do {
  if (!$3) {
   $AsyncCtx2 = _emscripten_alloc_async_context(12, sp) | 0; //@line 5094
   _mbed_assert_internal(3460, 3465, 528); //@line 5095
   if (___async) {
    HEAP32[$AsyncCtx2 >> 2] = 122; //@line 5098
    HEAP32[$AsyncCtx2 + 4 >> 2] = $2; //@line 5100
    HEAP32[$AsyncCtx2 + 8 >> 2] = $0; //@line 5102
    sp = STACKTOP; //@line 5103
    return;
   } else {
    _emscripten_free_async_context($AsyncCtx2 | 0); //@line 5106
    $8 = HEAP32[$2 >> 2] | 0; //@line 5108
    break;
   }
  } else {
   $8 = $3; //@line 5112
  }
 } while (0);
 $7 = HEAP32[$8 >> 2] | 0; //@line 5115
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 5117
 FUNCTION_TABLE_vi[$7 & 255]($0); //@line 5118
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 123; //@line 5121
  sp = STACKTOP; //@line 5122
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 5125
  return;
 }
}
function __ZN12NetworkStack13gethostbynameEPKcP13SocketAddress13nsapi_version__async_cb($0) {
 $0 = $0 | 0;
 var $$0 = 0, $10 = 0, $14 = 0, $2 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 13490
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 13492
 $6 = HEAP32[$0 + 16 >> 2] | 0; //@line 13496
 $8 = HEAP32[$0 + 20 >> 2] | 0; //@line 13498
 $10 = HEAP32[$0 + 24 >> 2] | 0; //@line 13500
 if (__ZN13SocketAddress14set_ip_addressEPKc($2, HEAP32[___async_retval >> 2] | 0) | 0) {
  $$0 = __ZNK13SocketAddress14get_ip_versionEv($2) | 0; //@line 13506
 } else {
  $$0 = 0; //@line 13508
 }
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(4) | 0; //@line 13510
 $14 = __Z15nsapi_dns_queryP12NetworkStackPKcP13SocketAddress13nsapi_version($6, $8, $10, $$0) | 0; //@line 13511
 if (___async) {
  HEAP32[$ReallocAsyncCtx2 >> 2] = 56; //@line 13514
  sp = STACKTOP; //@line 13515
  return;
 }
 HEAP32[___async_retval >> 2] = $14; //@line 13519
 ___async_unwind = 0; //@line 13520
 HEAP32[$ReallocAsyncCtx2 >> 2] = 56; //@line 13521
 sp = STACKTOP; //@line 13522
 return;
}
function __ZN16NetworkInterface14add_dns_serverERK13SocketAddress($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $10 = 0, $4 = 0, $5 = 0, $9 = 0, $AsyncCtx = 0, $AsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 1005
 $4 = HEAP32[(HEAP32[$0 >> 2] | 0) + 60 >> 2] | 0; //@line 1008
 $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 1009
 $5 = FUNCTION_TABLE_ii[$4 & 15]($0) | 0; //@line 1010
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 53; //@line 1013
  HEAP32[$AsyncCtx + 4 >> 2] = $1; //@line 1015
  sp = STACKTOP; //@line 1016
  return 0; //@line 1017
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 1019
 $9 = HEAP32[(HEAP32[$5 >> 2] | 0) + 16 >> 2] | 0; //@line 1022
 $AsyncCtx2 = _emscripten_alloc_async_context(4, sp) | 0; //@line 1023
 $10 = FUNCTION_TABLE_iii[$9 & 7]($5, $1) | 0; //@line 1024
 if (___async) {
  HEAP32[$AsyncCtx2 >> 2] = 54; //@line 1027
  sp = STACKTOP; //@line 1028
  return 0; //@line 1029
 } else {
  _emscripten_free_async_context($AsyncCtx2 | 0); //@line 1031
  return $10 | 0; //@line 1032
 }
 return 0; //@line 1034
}
function _threebyte_strstr($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$016$lcssa = 0, $$01618 = 0, $$019 = 0, $$lcssa = 0, $14 = 0, $23 = 0, $24 = 0, $27 = 0, $30 = 0, $31 = 0;
 $14 = (HEAPU8[$1 + 1 >> 0] | 0) << 16 | (HEAPU8[$1 >> 0] | 0) << 24 | (HEAPU8[$1 + 2 >> 0] | 0) << 8; //@line 6074
 $23 = $0 + 2 | 0; //@line 6083
 $24 = HEAP8[$23 >> 0] | 0; //@line 6084
 $27 = (HEAPU8[$0 + 1 >> 0] | 0) << 16 | (HEAPU8[$0 >> 0] | 0) << 24 | ($24 & 255) << 8; //@line 6087
 if (($27 | 0) == ($14 | 0) | $24 << 24 >> 24 == 0) {
  $$016$lcssa = $23; //@line 6092
  $$lcssa = $24; //@line 6092
 } else {
  $$01618 = $23; //@line 6094
  $$019 = $27; //@line 6094
  while (1) {
   $30 = $$01618 + 1 | 0; //@line 6096
   $31 = HEAP8[$30 >> 0] | 0; //@line 6097
   $$019 = ($$019 | $31 & 255) << 8; //@line 6100
   if (($$019 | 0) == ($14 | 0) | $31 << 24 >> 24 == 0) {
    $$016$lcssa = $30; //@line 6105
    $$lcssa = $31; //@line 6105
    break;
   } else {
    $$01618 = $30; //@line 6108
   }
  }
 }
 return ($$lcssa << 24 >> 24 ? $$016$lcssa + -2 | 0 : 0) | 0; //@line 6115
}
function _frexp($0, $1) {
 $0 = +$0;
 $1 = $1 | 0;
 var $$0 = 0.0, $$016 = 0.0, $2 = 0, $3 = 0, $4 = 0, $9 = 0.0, $storemerge = 0;
 HEAPF64[tempDoublePtr >> 3] = $0; //@line 5702
 $2 = HEAP32[tempDoublePtr >> 2] | 0; //@line 5702
 $3 = HEAP32[tempDoublePtr + 4 >> 2] | 0; //@line 5703
 $4 = _bitshift64Lshr($2 | 0, $3 | 0, 52) | 0; //@line 5704
 switch ($4 & 2047) {
 case 0:
  {
   if ($0 != 0.0) {
    $9 = +_frexp($0 * 18446744073709552000.0, $1); //@line 5713
    $$016 = $9; //@line 5716
    $storemerge = (HEAP32[$1 >> 2] | 0) + -64 | 0; //@line 5716
   } else {
    $$016 = $0; //@line 5718
    $storemerge = 0; //@line 5718
   }
   HEAP32[$1 >> 2] = $storemerge; //@line 5720
   $$0 = $$016; //@line 5721
   break;
  }
 case 2047:
  {
   $$0 = $0; //@line 5725
   break;
  }
 default:
  {
   HEAP32[$1 >> 2] = ($4 & 2047) + -1022; //@line 5731
   HEAP32[tempDoublePtr >> 2] = $2; //@line 5734
   HEAP32[tempDoublePtr + 4 >> 2] = $3 & -2146435073 | 1071644672; //@line 5734
   $$0 = +HEAPF64[tempDoublePtr >> 3]; //@line 5735
  }
 }
 return +$$0;
}
function _scalbn($0, $1) {
 $0 = +$0;
 $1 = $1 | 0;
 var $$0 = 0.0, $$020 = 0, $10 = 0.0, $12 = 0, $14 = 0, $17 = 0, $18 = 0, $3 = 0.0, $5 = 0, $7 = 0;
 if (($1 | 0) > 1023) {
  $3 = $0 * 8.98846567431158e+307; //@line 2619
  $5 = ($1 | 0) > 2046; //@line 2621
  $7 = $1 + -2046 | 0; //@line 2623
  $$0 = $5 ? $3 * 8.98846567431158e+307 : $3; //@line 2628
  $$020 = $5 ? ($7 | 0) < 1023 ? $7 : 1023 : $1 + -1023 | 0; //@line 2628
 } else {
  if (($1 | 0) < -1022) {
   $10 = $0 * 2.2250738585072014e-308; //@line 2632
   $12 = ($1 | 0) < -2044; //@line 2634
   $14 = $1 + 2044 | 0; //@line 2636
   $$0 = $12 ? $10 * 2.2250738585072014e-308 : $10; //@line 2641
   $$020 = $12 ? ($14 | 0) > -1022 ? $14 : -1022 : $1 + 1022 | 0; //@line 2641
  } else {
   $$0 = $0; //@line 2643
   $$020 = $1; //@line 2643
  }
 }
 $17 = _bitshift64Shl($$020 + 1023 | 0, 0, 52) | 0; //@line 2647
 $18 = tempRet0; //@line 2648
 HEAP32[tempDoublePtr >> 2] = $17; //@line 2649
 HEAP32[tempDoublePtr + 4 >> 2] = $18; //@line 2649
 return +($$0 * +HEAPF64[tempDoublePtr >> 3]);
}
function _vfprintf__async_cb($0) {
 $0 = $0 | 0;
 var $$ = 0, $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $2 = 0, $20 = 0, $22 = 0, $33 = 0;
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 10990
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 10998
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 11000
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 11002
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 11004
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 11006
 $20 = HEAP32[$0 + 40 >> 2] | 0; //@line 11008
 $22 = HEAP32[$0 + 44 >> 2] | 0; //@line 11010
 $$ = (HEAP32[$2 >> 2] | 0) == 0 ? -1 : HEAP32[$0 + 8 >> 2] | 0; //@line 11021
 HEAP32[HEAP32[$0 + 16 >> 2] >> 2] = HEAP32[$0 + 12 >> 2]; //@line 11022
 HEAP32[$10 >> 2] = 0; //@line 11023
 HEAP32[$12 >> 2] = 0; //@line 11024
 HEAP32[$14 >> 2] = 0; //@line 11025
 HEAP32[$2 >> 2] = 0; //@line 11026
 $33 = HEAP32[$16 >> 2] | 0; //@line 11027
 HEAP32[$16 >> 2] = $33 | $18; //@line 11032
 if ($20 | 0) {
  ___unlockfile($22); //@line 11035
 }
 HEAP32[___async_retval >> 2] = ($33 & 32 | 0) == 0 ? $$ : -1; //@line 11038
 return;
}
function __ZN6Socket4openEP12NetworkStack__async_cb_60($0) {
 $0 = $0 | 0;
 var $10 = 0, $11 = 0, $14 = 0, $15 = 0, $16 = 0, $8 = 0, $ReallocAsyncCtx6 = 0, sp = 0;
 sp = STACKTOP; //@line 13097
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 13105
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 13107
 $11 = HEAP32[HEAP32[$0 + 8 >> 2] >> 2] | 0; //@line 13108
 $14 = HEAP32[(HEAP32[$11 >> 2] | 0) + 68 >> 2] | 0; //@line 13111
 $15 = HEAP32[HEAP32[$0 + 12 >> 2] >> 2] | 0; //@line 13112
 $ReallocAsyncCtx6 = _emscripten_realloc_async_context(8) | 0; //@line 13113
 FUNCTION_TABLE_viiii[$14 & 7]($11, $15, 64, $8); //@line 13114
 if (___async) {
  HEAP32[$ReallocAsyncCtx6 >> 2] = 65; //@line 13117
  $16 = $ReallocAsyncCtx6 + 4 | 0; //@line 13118
  HEAP32[$16 >> 2] = $10; //@line 13119
  sp = STACKTOP; //@line 13120
  return;
 }
 ___async_unwind = 0; //@line 13123
 HEAP32[$ReallocAsyncCtx6 >> 2] = 65; //@line 13124
 $16 = $ReallocAsyncCtx6 + 4 | 0; //@line 13125
 HEAP32[$16 >> 2] = $10; //@line 13126
 sp = STACKTOP; //@line 13127
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
 sp = STACKTOP; //@line 7719
 do {
  if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, $5) | 0) {
   __ZNK10__cxxabiv117__class_type_info29process_static_type_above_dstEPNS_19__dynamic_cast_infoEPKvS4_i(0, $1, $2, $3, $4); //@line 7725
  } else {
   $10 = HEAP32[$0 + 8 >> 2] | 0; //@line 7728
   $13 = HEAP32[(HEAP32[$10 >> 2] | 0) + 20 >> 2] | 0; //@line 7731
   $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 7732
   FUNCTION_TABLE_viiiiii[$13 & 3]($10, $1, $2, $3, $4, $5); //@line 7733
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 156; //@line 7736
    sp = STACKTOP; //@line 7737
    return;
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 7740
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
 sp = STACKTOP; //@line 7196
 STACKTOP = STACKTOP + 16 | 0; //@line 7197
 $1 = sp; //@line 7198
 HEAP32[$1 >> 2] = $varargs; //@line 7199
 $2 = HEAP32[364] | 0; //@line 7200
 $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 7201
 _vfprintf($2, $0, $1) | 0; //@line 7202
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 150; //@line 7205
  HEAP32[$AsyncCtx + 4 >> 2] = $2; //@line 7207
  sp = STACKTOP; //@line 7208
  STACKTOP = sp; //@line 7209
  return;
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 7211
 $AsyncCtx2 = _emscripten_alloc_async_context(4, sp) | 0; //@line 7212
 _fputc(10, $2) | 0; //@line 7213
 if (___async) {
  HEAP32[$AsyncCtx2 >> 2] = 151; //@line 7216
  sp = STACKTOP; //@line 7217
  STACKTOP = sp; //@line 7218
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx2 | 0); //@line 7220
  _abort(); //@line 7221
 }
}
function __Z15nsapi_dns_queryP12NetworkStackPKcP13SocketAddress13nsapi_version__async_cb($0) {
 $0 = $0 | 0;
 var $$byval_copy = 0, $2 = 0, $4 = 0, $AsyncRetVal = 0, sp = 0;
 sp = STACKTOP; //@line 12205
 STACKTOP = STACKTOP + 32 | 0; //@line 12206
 $$byval_copy = sp; //@line 12207
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 12209
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 12211
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 12215
 HEAP32[$$byval_copy >> 2] = HEAP32[$4 >> 2]; //@line 12216
 HEAP32[$$byval_copy + 4 >> 2] = HEAP32[$4 + 4 >> 2]; //@line 12216
 HEAP32[$$byval_copy + 8 >> 2] = HEAP32[$4 + 8 >> 2]; //@line 12216
 HEAP32[$$byval_copy + 12 >> 2] = HEAP32[$4 + 12 >> 2]; //@line 12216
 HEAP32[$$byval_copy + 16 >> 2] = HEAP32[$4 + 16 >> 2]; //@line 12216
 __ZN13SocketAddress8set_addrE10nsapi_addr($2, $$byval_copy); //@line 12217
 HEAP32[___async_retval >> 2] = ($AsyncRetVal | 0) < 0 ? $AsyncRetVal : 0; //@line 12221
 STACKTOP = sp; //@line 12222
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
 sp = STACKTOP; //@line 8718
 $7 = HEAP32[$0 + 4 >> 2] | 0; //@line 8720
 $8 = $7 >> 8; //@line 8721
 if (!($7 & 1)) {
  $$0 = $8; //@line 8725
 } else {
  $$0 = HEAP32[(HEAP32[$3 >> 2] | 0) + $8 >> 2] | 0; //@line 8730
 }
 $14 = HEAP32[$0 >> 2] | 0; //@line 8732
 $17 = HEAP32[(HEAP32[$14 >> 2] | 0) + 20 >> 2] | 0; //@line 8735
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 8740
 FUNCTION_TABLE_viiiiii[$17 & 3]($14, $1, $2, $3 + $$0 | 0, $7 & 2 | 0 ? $4 : 2, $5); //@line 8741
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 172; //@line 8744
  sp = STACKTOP; //@line 8745
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 8748
  return;
 }
}
function __ZNK10__cxxabiv120__si_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $11 = 0, $8 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 7888
 do {
  if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, 0) | 0) {
   __ZNK10__cxxabiv117__class_type_info24process_found_base_classEPNS_19__dynamic_cast_infoEPvi(0, $1, $2, $3); //@line 7894
  } else {
   $8 = HEAP32[$0 + 8 >> 2] | 0; //@line 7897
   $11 = HEAP32[(HEAP32[$8 >> 2] | 0) + 28 >> 2] | 0; //@line 7900
   $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 7901
   FUNCTION_TABLE_viiii[$11 & 7]($8, $1, $2, $3); //@line 7902
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 159; //@line 7905
    sp = STACKTOP; //@line 7906
    return;
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 7909
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
 sp = STACKTOP; //@line 8808
 STACKTOP = STACKTOP + 16 | 0; //@line 8809
 $3 = sp; //@line 8810
 HEAP32[$3 >> 2] = HEAP32[$2 >> 2]; //@line 8812
 $7 = HEAP32[(HEAP32[$0 >> 2] | 0) + 16 >> 2] | 0; //@line 8815
 $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 8816
 $8 = FUNCTION_TABLE_iiii[$7 & 15]($0, $1, $3) | 0; //@line 8817
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 174; //@line 8820
  HEAP32[$AsyncCtx + 4 >> 2] = $3; //@line 8822
  HEAP32[$AsyncCtx + 8 >> 2] = $2; //@line 8824
  HEAP32[$AsyncCtx + 12 >> 2] = $3; //@line 8826
  sp = STACKTOP; //@line 8827
  STACKTOP = sp; //@line 8828
  return 0; //@line 8828
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 8830
 if ($8) {
  HEAP32[$2 >> 2] = HEAP32[$3 >> 2]; //@line 8834
 }
 STACKTOP = sp; //@line 8836
 return $8 & 1 | 0; //@line 8836
}
function __Znwj($0) {
 $0 = $0 | 0;
 var $$ = 0, $$lcssa = 0, $2 = 0, $4 = 0, $AsyncCtx = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 6994
 $$ = ($0 | 0) == 0 ? 1 : $0; //@line 6996
 while (1) {
  $2 = _malloc($$) | 0; //@line 6998
  if ($2 | 0) {
   $$lcssa = $2; //@line 7001
   label = 7; //@line 7002
   break;
  }
  $4 = __ZSt15get_new_handlerv() | 0; //@line 7005
  if (!$4) {
   $$lcssa = 0; //@line 7008
   label = 7; //@line 7009
   break;
  }
  $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 7012
  FUNCTION_TABLE_v[$4 & 3](); //@line 7013
  if (___async) {
   label = 5; //@line 7016
   break;
  }
  _emscripten_free_async_context($AsyncCtx | 0); //@line 7019
 }
 if ((label | 0) == 5) {
  HEAP32[$AsyncCtx >> 2] = 146; //@line 7022
  HEAP32[$AsyncCtx + 4 >> 2] = $$; //@line 7024
  sp = STACKTOP; //@line 7025
  return 0; //@line 7026
 } else if ((label | 0) == 7) {
  return $$lcssa | 0; //@line 7029
 }
 return 0; //@line 7031
}
function __ZN6Socket5closeEv__async_cb_27($0) {
 $0 = $0 | 0;
 var $4 = 0, $8 = 0, $9 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 11372
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 11376
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 11378
 HEAP32[HEAP32[$0 + 4 >> 2] >> 2] = 0; //@line 11379
 $8 = HEAP32[(HEAP32[$4 >> 2] | 0) + 12 >> 2] | 0; //@line 11382
 $ReallocAsyncCtx3 = _emscripten_realloc_async_context(8) | 0; //@line 11383
 FUNCTION_TABLE_vi[$8 & 255]($4); //@line 11384
 if (___async) {
  HEAP32[$ReallocAsyncCtx3 >> 2] = 71; //@line 11387
  $9 = $ReallocAsyncCtx3 + 4 | 0; //@line 11388
  HEAP32[$9 >> 2] = $AsyncRetVal; //@line 11389
  sp = STACKTOP; //@line 11390
  return;
 }
 ___async_unwind = 0; //@line 11393
 HEAP32[$ReallocAsyncCtx3 >> 2] = 71; //@line 11394
 $9 = $ReallocAsyncCtx3 + 4 | 0; //@line 11395
 HEAP32[$9 >> 2] = $AsyncRetVal; //@line 11396
 sp = STACKTOP; //@line 11397
 return;
}
function __ZN16NetworkInterface13gethostbynameEPKcP13SocketAddress13nsapi_version__async_cb($0) {
 $0 = $0 | 0;
 var $10 = 0, $11 = 0, $2 = 0, $4 = 0, $6 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 9387
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 9389
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 9391
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 9393
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 9395
 $10 = HEAP32[(HEAP32[$AsyncRetVal >> 2] | 0) + 12 >> 2] | 0; //@line 9398
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(4) | 0; //@line 9399
 $11 = FUNCTION_TABLE_iiiii[$10 & 15]($AsyncRetVal, $2, $4, $6) | 0; //@line 9400
 if (___async) {
  HEAP32[$ReallocAsyncCtx2 >> 2] = 52; //@line 9403
  sp = STACKTOP; //@line 9404
  return;
 }
 HEAP32[___async_retval >> 2] = $11; //@line 9408
 ___async_unwind = 0; //@line 9409
 HEAP32[$ReallocAsyncCtx2 >> 2] = 52; //@line 9410
 sp = STACKTOP; //@line 9411
 return;
}
function ___dynamic_cast__async_cb_9($0) {
 $0 = $0 | 0;
 var $$0 = 0, $10 = 0, $16 = 0, $6 = 0, $8 = 0;
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 9775
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 9777
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 9779
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 9785
 L2 : do {
  switch (HEAP32[HEAP32[$0 + 4 >> 2] >> 2] | 0) {
  case 0:
   {
    $$0 = (HEAP32[$6 >> 2] | 0) == 1 & (HEAP32[$8 >> 2] | 0) == 1 & (HEAP32[$10 >> 2] | 0) == 1 ? HEAP32[HEAP32[$0 + 24 >> 2] >> 2] | 0 : 0; //@line 9800
    break;
   }
  case 1:
   {
    if ((HEAP32[HEAP32[$0 + 28 >> 2] >> 2] | 0) != 1) {
     if (!((HEAP32[$6 >> 2] | 0) == 0 & (HEAP32[$8 >> 2] | 0) == 1 & (HEAP32[$10 >> 2] | 0) == 1)) {
      $$0 = 0; //@line 9816
      break L2;
     }
    }
    $$0 = HEAP32[$16 >> 2] | 0; //@line 9821
    break;
   }
  default:
   {
    $$0 = 0; //@line 9825
   }
  }
 } while (0);
 HEAP32[___async_retval >> 2] = $$0; //@line 9830
 return;
}
function __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($0, $1, $2, $3, $4) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 var $$0 = 0, $13 = 0, $16 = 0, $6 = 0, $7 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 8760
 $6 = HEAP32[$0 + 4 >> 2] | 0; //@line 8762
 $7 = $6 >> 8; //@line 8763
 if (!($6 & 1)) {
  $$0 = $7; //@line 8767
 } else {
  $$0 = HEAP32[(HEAP32[$2 >> 2] | 0) + $7 >> 2] | 0; //@line 8772
 }
 $13 = HEAP32[$0 >> 2] | 0; //@line 8774
 $16 = HEAP32[(HEAP32[$13 >> 2] | 0) + 24 >> 2] | 0; //@line 8777
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 8782
 FUNCTION_TABLE_viiiii[$16 & 3]($13, $1, $2 + $$0 | 0, $6 & 2 | 0 ? $3 : 2, $4); //@line 8783
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 173; //@line 8786
  sp = STACKTOP; //@line 8787
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 8790
  return;
 }
}
function __ZThn4_N17EthernetInterface13socket_sendtoEPvRK13SocketAddressPKvj__async_cb_56($0) {
 $0 = $0 | 0;
 var $10 = 0, $13 = 0, $14 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 12671
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 12675
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 12677
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 12679
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 12681
 $13 = HEAP32[(HEAP32[HEAP32[$0 + 4 >> 2] >> 2] | 0) + 88 >> 2] | 0; //@line 12684
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(4) | 0; //@line 12685
 $14 = FUNCTION_TABLE_iiiii[$13 & 15]($4, $6, $8, $10) | 0; //@line 12686
 if (___async) {
  HEAP32[$ReallocAsyncCtx2 >> 2] = 48; //@line 12689
  sp = STACKTOP; //@line 12690
  return;
 }
 HEAP32[___async_retval >> 2] = $14; //@line 12694
 ___async_unwind = 0; //@line 12695
 HEAP32[$ReallocAsyncCtx2 >> 2] = 48; //@line 12696
 sp = STACKTOP; //@line 12697
 return;
}
function __ZNK10__cxxabiv122__base_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $$0 = 0, $12 = 0, $15 = 0, $5 = 0, $6 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 8675
 $5 = HEAP32[$0 + 4 >> 2] | 0; //@line 8677
 $6 = $5 >> 8; //@line 8678
 if (!($5 & 1)) {
  $$0 = $6; //@line 8682
 } else {
  $$0 = HEAP32[(HEAP32[$2 >> 2] | 0) + $6 >> 2] | 0; //@line 8687
 }
 $12 = HEAP32[$0 >> 2] | 0; //@line 8689
 $15 = HEAP32[(HEAP32[$12 >> 2] | 0) + 28 >> 2] | 0; //@line 8692
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 8697
 FUNCTION_TABLE_viiii[$15 & 7]($12, $1, $2 + $$0 | 0, $5 & 2 | 0 ? $3 : 2); //@line 8698
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 171; //@line 8701
  sp = STACKTOP; //@line 8702
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 8705
  return;
 }
}
function ___toread($0) {
 $0 = $0 | 0;
 var $$0 = 0, $1 = 0, $15 = 0, $23 = 0, $3 = 0, $7 = 0, $9 = 0;
 $1 = $0 + 74 | 0; //@line 2993
 $3 = HEAP8[$1 >> 0] | 0; //@line 2995
 HEAP8[$1 >> 0] = $3 + 255 | $3; //@line 2999
 $7 = $0 + 20 | 0; //@line 3000
 $9 = $0 + 28 | 0; //@line 3002
 if ((HEAP32[$7 >> 2] | 0) >>> 0 > (HEAP32[$9 >> 2] | 0) >>> 0) {
  FUNCTION_TABLE_iiii[HEAP32[$0 + 36 >> 2] & 15]($0, 0, 0) | 0; //@line 3008
 }
 HEAP32[$0 + 16 >> 2] = 0; //@line 3011
 HEAP32[$9 >> 2] = 0; //@line 3012
 HEAP32[$7 >> 2] = 0; //@line 3013
 $15 = HEAP32[$0 >> 2] | 0; //@line 3014
 if (!($15 & 4)) {
  $23 = (HEAP32[$0 + 44 >> 2] | 0) + (HEAP32[$0 + 48 >> 2] | 0) | 0; //@line 3022
  HEAP32[$0 + 8 >> 2] = $23; //@line 3024
  HEAP32[$0 + 4 >> 2] = $23; //@line 3026
  $$0 = $15 << 27 >> 31; //@line 3029
 } else {
  HEAP32[$0 >> 2] = $15 | 32; //@line 3032
  $$0 = -1; //@line 3033
 }
 return $$0 | 0; //@line 3035
}
function __ZThn4_N17EthernetInterface14socket_connectEPvRK13SocketAddress($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$0$i = 0, $3 = 0, $5 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 692
 $3 = HEAP32[$1 >> 2] | 0; //@line 693
 $5 = __ZNK13SocketAddress14get_ip_addressEv($2) | 0; //@line 695
 if (_emscripten_asm_const_iiii(5, $3 | 0, $5 | 0, (__ZNK13SocketAddress8get_portEv($2) | 0) & 65535 | 0) | 0) {
  $$0$i = -3012; //@line 701
  return $$0$i | 0; //@line 702
 }
 $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 704
 _wait_ms(1); //@line 705
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 42; //@line 708
  HEAP32[$AsyncCtx + 4 >> 2] = $1; //@line 710
  sp = STACKTOP; //@line 711
  return 0; //@line 712
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 714
 HEAP8[$1 + 8 >> 0] = 1; //@line 716
 $$0$i = 0; //@line 717
 return $$0$i | 0; //@line 718
}
function _realloc($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$1 = 0, $11 = 0, $14 = 0, $17 = 0, $22 = 0;
 if (!$0) {
  $$1 = _malloc($1) | 0; //@line 8686
  return $$1 | 0; //@line 8687
 }
 if ($1 >>> 0 > 4294967231) {
  HEAP32[(___errno_location() | 0) >> 2] = 12; //@line 8692
  $$1 = 0; //@line 8693
  return $$1 | 0; //@line 8694
 }
 $11 = _try_realloc_chunk($0 + -8 | 0, $1 >>> 0 < 11 ? 16 : $1 + 11 & -8) | 0; //@line 8701
 if ($11 | 0) {
  $$1 = $11 + 8 | 0; //@line 8705
  return $$1 | 0; //@line 8706
 }
 $14 = _malloc($1) | 0; //@line 8708
 if (!$14) {
  $$1 = 0; //@line 8711
  return $$1 | 0; //@line 8712
 }
 $17 = HEAP32[$0 + -4 >> 2] | 0; //@line 8715
 $22 = ($17 & -8) - (($17 & 3 | 0) == 0 ? 8 : 4) | 0; //@line 8720
 _memcpy($14 | 0, $0 | 0, ($22 >>> 0 < $1 >>> 0 ? $22 : $1) | 0) | 0; //@line 8723
 _free($0); //@line 8724
 $$1 = $14; //@line 8725
 return $$1 | 0; //@line 8726
}
function __ZN17EthernetInterface13socket_sendtoEPvRK13SocketAddressPKvj__async_cb_82($0) {
 $0 = $0 | 0;
 var $11 = 0, $12 = 0, $2 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 3076
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 3078
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 3080
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 3082
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 3084
 $11 = HEAP32[(HEAP32[$2 >> 2] | 0) + 88 >> 2] | 0; //@line 3087
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(4) | 0; //@line 3088
 $12 = FUNCTION_TABLE_iiiii[$11 & 15]($2, $4, $6, $8) | 0; //@line 3089
 if (___async) {
  HEAP32[$ReallocAsyncCtx2 >> 2] = 35; //@line 3092
  sp = STACKTOP; //@line 3093
  return;
 }
 HEAP32[___async_retval >> 2] = $12; //@line 3097
 ___async_unwind = 0; //@line 3098
 HEAP32[$ReallocAsyncCtx2 >> 2] = 35; //@line 3099
 sp = STACKTOP; //@line 3100
 return;
}
function __ZN17EthernetInterface14socket_connectEPvRK13SocketAddress($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$0 = 0, $3 = 0, $5 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 295
 $3 = HEAP32[$1 >> 2] | 0; //@line 296
 $5 = __ZNK13SocketAddress14get_ip_addressEv($2) | 0; //@line 298
 if (_emscripten_asm_const_iiii(5, $3 | 0, $5 | 0, (__ZNK13SocketAddress8get_portEv($2) | 0) & 65535 | 0) | 0) {
  $$0 = -3012; //@line 304
  return $$0 | 0; //@line 305
 }
 $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 307
 _wait_ms(1); //@line 308
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 29; //@line 311
  HEAP32[$AsyncCtx + 4 >> 2] = $1; //@line 313
  sp = STACKTOP; //@line 314
  return 0; //@line 315
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 317
 HEAP8[$1 + 8 >> 0] = 1; //@line 319
 $$0 = 0; //@line 320
 return $$0 | 0; //@line 321
}
function __ZL24nsapi_dns_query_multipleP12NetworkStackPKcP10nsapi_addrj13nsapi_version__async_cb_78($0) {
 $0 = $0 | 0;
 var $$355$ = 0, $4 = 0, $6 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx11 = 0, sp = 0;
 sp = STACKTOP; //@line 2763
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 2767
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 2769
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 2771
 $$355$ = ($AsyncRetVal | 0) == 0 ? HEAP32[$0 + 4 >> 2] | 0 : $AsyncRetVal; //@line 2773
 $ReallocAsyncCtx11 = _emscripten_realloc_async_context(12) | 0; //@line 2774
 __ZN9UDPSocketD2Ev($4); //@line 2775
 if (!___async) {
  ___async_unwind = 0; //@line 2778
 }
 HEAP32[$ReallocAsyncCtx11 >> 2] = 95; //@line 2780
 HEAP32[$ReallocAsyncCtx11 + 4 >> 2] = $6; //@line 2782
 HEAP32[$ReallocAsyncCtx11 + 8 >> 2] = $$355$; //@line 2784
 sp = STACKTOP; //@line 2785
 return;
}
function __ZN4mbed8CallbackIFvvEE13function_callINS2_14method_contextI6SocketMS5_FvvEEEEEvPKv($0) {
 $0 = $0 | 0;
 var $$unpack$i = 0, $$unpack2$i = 0, $11 = 0, $4 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 1532
 $$unpack$i = HEAP32[$0 >> 2] | 0; //@line 1535
 $$unpack2$i = HEAP32[$0 + 4 >> 2] | 0; //@line 1537
 $4 = (HEAP32[$0 + 8 >> 2] | 0) + ($$unpack2$i >> 1) | 0; //@line 1539
 if (!($$unpack2$i & 1)) {
  $11 = $$unpack$i; //@line 1544
 } else {
  $11 = HEAP32[(HEAP32[$4 >> 2] | 0) + $$unpack$i >> 2] | 0; //@line 1549
 }
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 1551
 FUNCTION_TABLE_vi[$11 & 255]($4); //@line 1552
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 68; //@line 1555
  sp = STACKTOP; //@line 1556
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 1559
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
 sp = STACKTOP; //@line 4700
 STACKTOP = STACKTOP + 256 | 0; //@line 4701
 $5 = sp; //@line 4702
 if (($2 | 0) > ($3 | 0) & ($4 & 73728 | 0) == 0) {
  $9 = $2 - $3 | 0; //@line 4708
  _memset($5 | 0, $1 << 24 >> 24 | 0, ($9 >>> 0 < 256 ? $9 : 256) | 0) | 0; //@line 4712
  if ($9 >>> 0 > 255) {
   $14 = $2 - $3 | 0; //@line 4715
   $$011 = $9; //@line 4716
   do {
    _out_670($0, $5, 256); //@line 4718
    $$011 = $$011 + -256 | 0; //@line 4719
   } while ($$011 >>> 0 > 255);
   $$0$lcssa = $14 & 255; //@line 4728
  } else {
   $$0$lcssa = $9; //@line 4730
  }
  _out_670($0, $5, $$0$lcssa); //@line 4732
 }
 STACKTOP = sp; //@line 4734
 return;
}
function __ZN16NetworkInterface14add_dns_serverERK13SocketAddress__async_cb($0) {
 $0 = $0 | 0;
 var $2 = 0, $6 = 0, $7 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 11297
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 11299
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 11301
 $6 = HEAP32[(HEAP32[$AsyncRetVal >> 2] | 0) + 16 >> 2] | 0; //@line 11304
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(4) | 0; //@line 11305
 $7 = FUNCTION_TABLE_iii[$6 & 7]($AsyncRetVal, $2) | 0; //@line 11306
 if (___async) {
  HEAP32[$ReallocAsyncCtx2 >> 2] = 54; //@line 11309
  sp = STACKTOP; //@line 11310
  return;
 }
 HEAP32[___async_retval >> 2] = $7; //@line 11314
 ___async_unwind = 0; //@line 11315
 HEAP32[$ReallocAsyncCtx2 >> 2] = 54; //@line 11316
 sp = STACKTOP; //@line 11317
 return;
}
function __ZNK10__cxxabiv117__class_type_info24process_found_base_classEPNS_19__dynamic_cast_infoEPvi($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $10 = 0, $13 = 0, $4 = 0, $5 = 0;
 $4 = $1 + 16 | 0; //@line 7441
 $5 = HEAP32[$4 >> 2] | 0; //@line 7442
 do {
  if (!$5) {
   HEAP32[$4 >> 2] = $2; //@line 7446
   HEAP32[$1 + 24 >> 2] = $3; //@line 7448
   HEAP32[$1 + 36 >> 2] = 1; //@line 7450
  } else {
   if (($5 | 0) != ($2 | 0)) {
    $13 = $1 + 36 | 0; //@line 7454
    HEAP32[$13 >> 2] = (HEAP32[$13 >> 2] | 0) + 1; //@line 7457
    HEAP32[$1 + 24 >> 2] = 2; //@line 7459
    HEAP8[$1 + 54 >> 0] = 1; //@line 7461
    break;
   }
   $10 = $1 + 24 | 0; //@line 7464
   if ((HEAP32[$10 >> 2] | 0) == 2) {
    HEAP32[$10 >> 2] = $3; //@line 7468
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
 sp = STACKTOP; //@line 10030
 STACKTOP = STACKTOP + 32 | 0; //@line 10031
 $vararg_buffer = sp; //@line 10032
 $3 = sp + 20 | 0; //@line 10033
 HEAP32[$vararg_buffer >> 2] = HEAP32[$0 + 60 >> 2]; //@line 10037
 HEAP32[$vararg_buffer + 4 >> 2] = 0; //@line 10039
 HEAP32[$vararg_buffer + 8 >> 2] = $1; //@line 10041
 HEAP32[$vararg_buffer + 12 >> 2] = $3; //@line 10043
 HEAP32[$vararg_buffer + 16 >> 2] = $2; //@line 10045
 if ((___syscall_ret(___syscall140(140, $vararg_buffer | 0) | 0) | 0) < 0) {
  HEAP32[$3 >> 2] = -1; //@line 10050
  $10 = -1; //@line 10051
 } else {
  $10 = HEAP32[$3 >> 2] | 0; //@line 10054
 }
 STACKTOP = sp; //@line 10056
 return $10 | 0; //@line 10056
}
function __ZneRK13SocketAddressS1_($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0$i = 0, $10 = 0, $11 = 0, $5 = 0, label = 0;
 if (__ZNK13SocketAddresscvbEv($0) | 0) {
  label = 3; //@line 2685
 } else {
  if (__ZNK13SocketAddresscvbEv($1) | 0) {
   label = 3; //@line 2689
  } else {
   $$0$i = 1; //@line 2691
  }
 }
 do {
  if ((label | 0) == 3) {
   $5 = HEAP32[$0 + 40 >> 2] | 0; //@line 2697
   if (($5 | 0) == (HEAP32[$1 + 40 >> 2] | 0)) {
    $10 = $0 + 44 | 0; //@line 2703
    $11 = $1 + 44 | 0; //@line 2704
    if (($5 | 0) == 1) {
     $$0$i = (_memcmp($10, $11, 4) | 0) == 0; //@line 2708
     break;
    } else {
     $$0$i = (_memcmp($10, $11, 16) | 0) == 0; //@line 2713
     break;
    }
   } else {
    $$0$i = 0; //@line 2717
   }
  }
 } while (0);
 return $$0$i ^ 1 | 0; //@line 2722
}
function __Znwj__async_cb($0) {
 $0 = $0 | 0;
 var $$lcssa = 0, $2 = 0, $3 = 0, $5 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 12359
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 12361
 $3 = _malloc($2) | 0; //@line 12362
 if (!$3) {
  $5 = __ZSt15get_new_handlerv() | 0; //@line 12365
  if (!$5) {
   $$lcssa = 0; //@line 12368
  } else {
   $ReallocAsyncCtx = _emscripten_realloc_async_context(8) | 0; //@line 12370
   FUNCTION_TABLE_v[$5 & 3](); //@line 12371
   if (!___async) {
    ___async_unwind = 0; //@line 12374
   }
   HEAP32[$ReallocAsyncCtx >> 2] = 146; //@line 12376
   HEAP32[$ReallocAsyncCtx + 4 >> 2] = $2; //@line 12378
   sp = STACKTOP; //@line 12379
   return;
  }
 } else {
  $$lcssa = $3; //@line 12383
 }
 HEAP32[___async_retval >> 2] = $$lcssa; //@line 12386
 return;
}
function _strcmp($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$011 = 0, $$0710 = 0, $$lcssa = 0, $$lcssa8 = 0, $2 = 0, $3 = 0, $8 = 0, $9 = 0;
 $2 = HEAP8[$0 >> 0] | 0; //@line 10137
 $3 = HEAP8[$1 >> 0] | 0; //@line 10138
 if ($2 << 24 >> 24 == 0 ? 1 : $2 << 24 >> 24 != $3 << 24 >> 24) {
  $$lcssa = $3; //@line 10143
  $$lcssa8 = $2; //@line 10143
 } else {
  $$011 = $1; //@line 10145
  $$0710 = $0; //@line 10145
  do {
   $$0710 = $$0710 + 1 | 0; //@line 10147
   $$011 = $$011 + 1 | 0; //@line 10148
   $8 = HEAP8[$$0710 >> 0] | 0; //@line 10149
   $9 = HEAP8[$$011 >> 0] | 0; //@line 10150
  } while (!($8 << 24 >> 24 == 0 ? 1 : $8 << 24 >> 24 != $9 << 24 >> 24));
  $$lcssa = $9; //@line 10155
  $$lcssa8 = $8; //@line 10155
 }
 return ($$lcssa8 & 255) - ($$lcssa & 255) | 0; //@line 10165
}
function _mbed_assert_internal($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $AsyncCtx = 0, $vararg_buffer = 0, sp = 0;
 sp = STACKTOP; //@line 4731
 STACKTOP = STACKTOP + 16 | 0; //@line 4732
 $vararg_buffer = sp; //@line 4733
 HEAP32[$vararg_buffer >> 2] = $0; //@line 4734
 HEAP32[$vararg_buffer + 4 >> 2] = $1; //@line 4736
 HEAP32[$vararg_buffer + 8 >> 2] = $2; //@line 4738
 _mbed_error_printf(3337, $vararg_buffer); //@line 4739
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 4740
 _mbed_die(); //@line 4741
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 105; //@line 4744
  sp = STACKTOP; //@line 4745
  STACKTOP = sp; //@line 4746
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 4748
  STACKTOP = sp; //@line 4749
  return;
 }
}
function __ZN12NetworkStack14add_dns_serverERK13SocketAddress($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$byval_copy = 0, $2 = 0, $3 = 0, sp = 0;
 sp = STACKTOP; //@line 1137
 STACKTOP = STACKTOP + 48 | 0; //@line 1138
 $$byval_copy = sp + 20 | 0; //@line 1139
 $2 = sp; //@line 1140
 __ZNK13SocketAddress8get_addrEv($2, $1); //@line 1141
 HEAP32[$$byval_copy >> 2] = HEAP32[$2 >> 2]; //@line 1142
 HEAP32[$$byval_copy + 4 >> 2] = HEAP32[$2 + 4 >> 2]; //@line 1142
 HEAP32[$$byval_copy + 8 >> 2] = HEAP32[$2 + 8 >> 2]; //@line 1142
 HEAP32[$$byval_copy + 12 >> 2] = HEAP32[$2 + 12 >> 2]; //@line 1142
 HEAP32[$$byval_copy + 16 >> 2] = HEAP32[$2 + 16 >> 2]; //@line 1142
 $3 = _nsapi_dns_add_server($$byval_copy) | 0; //@line 1143
 STACKTOP = sp; //@line 1144
 return $3 | 0; //@line 1144
}
function _mbed_die__async_cb_48($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx14 = 0, sp = 0;
 sp = STACKTOP; //@line 12098
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 12100
 _emscripten_asm_const_iii(8, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 12102
 $ReallocAsyncCtx14 = _emscripten_realloc_async_context(8) | 0; //@line 12103
 _wait_ms(150); //@line 12104
 if (___async) {
  HEAP32[$ReallocAsyncCtx14 >> 2] = 108; //@line 12107
  $4 = $ReallocAsyncCtx14 + 4 | 0; //@line 12108
  HEAP32[$4 >> 2] = $2; //@line 12109
  sp = STACKTOP; //@line 12110
  return;
 }
 ___async_unwind = 0; //@line 12113
 HEAP32[$ReallocAsyncCtx14 >> 2] = 108; //@line 12114
 $4 = $ReallocAsyncCtx14 + 4 | 0; //@line 12115
 HEAP32[$4 >> 2] = $2; //@line 12116
 sp = STACKTOP; //@line 12117
 return;
}
function _mbed_die__async_cb_47($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx13 = 0, sp = 0;
 sp = STACKTOP; //@line 12073
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 12075
 _emscripten_asm_const_iii(8, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 12077
 $ReallocAsyncCtx13 = _emscripten_realloc_async_context(8) | 0; //@line 12078
 _wait_ms(150); //@line 12079
 if (___async) {
  HEAP32[$ReallocAsyncCtx13 >> 2] = 109; //@line 12082
  $4 = $ReallocAsyncCtx13 + 4 | 0; //@line 12083
  HEAP32[$4 >> 2] = $2; //@line 12084
  sp = STACKTOP; //@line 12085
  return;
 }
 ___async_unwind = 0; //@line 12088
 HEAP32[$ReallocAsyncCtx13 >> 2] = 109; //@line 12089
 $4 = $ReallocAsyncCtx13 + 4 | 0; //@line 12090
 HEAP32[$4 >> 2] = $2; //@line 12091
 sp = STACKTOP; //@line 12092
 return;
}
function _mbed_die__async_cb_46($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx12 = 0, sp = 0;
 sp = STACKTOP; //@line 12048
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 12050
 _emscripten_asm_const_iii(8, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 12052
 $ReallocAsyncCtx12 = _emscripten_realloc_async_context(8) | 0; //@line 12053
 _wait_ms(150); //@line 12054
 if (___async) {
  HEAP32[$ReallocAsyncCtx12 >> 2] = 110; //@line 12057
  $4 = $ReallocAsyncCtx12 + 4 | 0; //@line 12058
  HEAP32[$4 >> 2] = $2; //@line 12059
  sp = STACKTOP; //@line 12060
  return;
 }
 ___async_unwind = 0; //@line 12063
 HEAP32[$ReallocAsyncCtx12 >> 2] = 110; //@line 12064
 $4 = $ReallocAsyncCtx12 + 4 | 0; //@line 12065
 HEAP32[$4 >> 2] = $2; //@line 12066
 sp = STACKTOP; //@line 12067
 return;
}
function _mbed_die__async_cb_45($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx11 = 0, sp = 0;
 sp = STACKTOP; //@line 12023
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 12025
 _emscripten_asm_const_iii(8, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 12027
 $ReallocAsyncCtx11 = _emscripten_realloc_async_context(8) | 0; //@line 12028
 _wait_ms(150); //@line 12029
 if (___async) {
  HEAP32[$ReallocAsyncCtx11 >> 2] = 111; //@line 12032
  $4 = $ReallocAsyncCtx11 + 4 | 0; //@line 12033
  HEAP32[$4 >> 2] = $2; //@line 12034
  sp = STACKTOP; //@line 12035
  return;
 }
 ___async_unwind = 0; //@line 12038
 HEAP32[$ReallocAsyncCtx11 >> 2] = 111; //@line 12039
 $4 = $ReallocAsyncCtx11 + 4 | 0; //@line 12040
 HEAP32[$4 >> 2] = $2; //@line 12041
 sp = STACKTOP; //@line 12042
 return;
}
function _mbed_die__async_cb_44($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx10 = 0, sp = 0;
 sp = STACKTOP; //@line 11998
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 12000
 _emscripten_asm_const_iii(8, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 12002
 $ReallocAsyncCtx10 = _emscripten_realloc_async_context(8) | 0; //@line 12003
 _wait_ms(150); //@line 12004
 if (___async) {
  HEAP32[$ReallocAsyncCtx10 >> 2] = 112; //@line 12007
  $4 = $ReallocAsyncCtx10 + 4 | 0; //@line 12008
  HEAP32[$4 >> 2] = $2; //@line 12009
  sp = STACKTOP; //@line 12010
  return;
 }
 ___async_unwind = 0; //@line 12013
 HEAP32[$ReallocAsyncCtx10 >> 2] = 112; //@line 12014
 $4 = $ReallocAsyncCtx10 + 4 | 0; //@line 12015
 HEAP32[$4 >> 2] = $2; //@line 12016
 sp = STACKTOP; //@line 12017
 return;
}
function _memcmp($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$01318 = 0, $$01417 = 0, $$019 = 0, $14 = 0, $4 = 0, $5 = 0;
 L1 : do {
  if (!$2) {
   $14 = 0; //@line 6544
  } else {
   $$01318 = $0; //@line 6546
   $$01417 = $2; //@line 6546
   $$019 = $1; //@line 6546
   while (1) {
    $4 = HEAP8[$$01318 >> 0] | 0; //@line 6548
    $5 = HEAP8[$$019 >> 0] | 0; //@line 6549
    if ($4 << 24 >> 24 != $5 << 24 >> 24) {
     break;
    }
    $$01417 = $$01417 + -1 | 0; //@line 6554
    if (!$$01417) {
     $14 = 0; //@line 6559
     break L1;
    } else {
     $$01318 = $$01318 + 1 | 0; //@line 6562
     $$019 = $$019 + 1 | 0; //@line 6562
    }
   }
   $14 = ($4 & 255) - ($5 & 255) | 0; //@line 6568
  }
 } while (0);
 return $14 | 0; //@line 6571
}
function _mbed_die__async_cb_43($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx9 = 0, sp = 0;
 sp = STACKTOP; //@line 11973
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 11975
 _emscripten_asm_const_iii(8, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 11977
 $ReallocAsyncCtx9 = _emscripten_realloc_async_context(8) | 0; //@line 11978
 _wait_ms(150); //@line 11979
 if (___async) {
  HEAP32[$ReallocAsyncCtx9 >> 2] = 113; //@line 11982
  $4 = $ReallocAsyncCtx9 + 4 | 0; //@line 11983
  HEAP32[$4 >> 2] = $2; //@line 11984
  sp = STACKTOP; //@line 11985
  return;
 }
 ___async_unwind = 0; //@line 11988
 HEAP32[$ReallocAsyncCtx9 >> 2] = 113; //@line 11989
 $4 = $ReallocAsyncCtx9 + 4 | 0; //@line 11990
 HEAP32[$4 >> 2] = $2; //@line 11991
 sp = STACKTOP; //@line 11992
 return;
}
function _mbed_die__async_cb_42($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx8 = 0, sp = 0;
 sp = STACKTOP; //@line 11948
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 11950
 _emscripten_asm_const_iii(8, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 11952
 $ReallocAsyncCtx8 = _emscripten_realloc_async_context(8) | 0; //@line 11953
 _wait_ms(400); //@line 11954
 if (___async) {
  HEAP32[$ReallocAsyncCtx8 >> 2] = 114; //@line 11957
  $4 = $ReallocAsyncCtx8 + 4 | 0; //@line 11958
  HEAP32[$4 >> 2] = $2; //@line 11959
  sp = STACKTOP; //@line 11960
  return;
 }
 ___async_unwind = 0; //@line 11963
 HEAP32[$ReallocAsyncCtx8 >> 2] = 114; //@line 11964
 $4 = $ReallocAsyncCtx8 + 4 | 0; //@line 11965
 HEAP32[$4 >> 2] = $2; //@line 11966
 sp = STACKTOP; //@line 11967
 return;
}
function _mbed_die__async_cb_41($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx7 = 0, sp = 0;
 sp = STACKTOP; //@line 11923
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 11925
 _emscripten_asm_const_iii(8, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 11927
 $ReallocAsyncCtx7 = _emscripten_realloc_async_context(8) | 0; //@line 11928
 _wait_ms(400); //@line 11929
 if (___async) {
  HEAP32[$ReallocAsyncCtx7 >> 2] = 115; //@line 11932
  $4 = $ReallocAsyncCtx7 + 4 | 0; //@line 11933
  HEAP32[$4 >> 2] = $2; //@line 11934
  sp = STACKTOP; //@line 11935
  return;
 }
 ___async_unwind = 0; //@line 11938
 HEAP32[$ReallocAsyncCtx7 >> 2] = 115; //@line 11939
 $4 = $ReallocAsyncCtx7 + 4 | 0; //@line 11940
 HEAP32[$4 >> 2] = $2; //@line 11941
 sp = STACKTOP; //@line 11942
 return;
}
function _mbed_die__async_cb_40($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx6 = 0, sp = 0;
 sp = STACKTOP; //@line 11898
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 11900
 _emscripten_asm_const_iii(8, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 11902
 $ReallocAsyncCtx6 = _emscripten_realloc_async_context(8) | 0; //@line 11903
 _wait_ms(400); //@line 11904
 if (___async) {
  HEAP32[$ReallocAsyncCtx6 >> 2] = 116; //@line 11907
  $4 = $ReallocAsyncCtx6 + 4 | 0; //@line 11908
  HEAP32[$4 >> 2] = $2; //@line 11909
  sp = STACKTOP; //@line 11910
  return;
 }
 ___async_unwind = 0; //@line 11913
 HEAP32[$ReallocAsyncCtx6 >> 2] = 116; //@line 11914
 $4 = $ReallocAsyncCtx6 + 4 | 0; //@line 11915
 HEAP32[$4 >> 2] = $2; //@line 11916
 sp = STACKTOP; //@line 11917
 return;
}
function _mbed_die__async_cb_39($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx5 = 0, sp = 0;
 sp = STACKTOP; //@line 11873
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 11875
 _emscripten_asm_const_iii(8, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 11877
 $ReallocAsyncCtx5 = _emscripten_realloc_async_context(8) | 0; //@line 11878
 _wait_ms(400); //@line 11879
 if (___async) {
  HEAP32[$ReallocAsyncCtx5 >> 2] = 117; //@line 11882
  $4 = $ReallocAsyncCtx5 + 4 | 0; //@line 11883
  HEAP32[$4 >> 2] = $2; //@line 11884
  sp = STACKTOP; //@line 11885
  return;
 }
 ___async_unwind = 0; //@line 11888
 HEAP32[$ReallocAsyncCtx5 >> 2] = 117; //@line 11889
 $4 = $ReallocAsyncCtx5 + 4 | 0; //@line 11890
 HEAP32[$4 >> 2] = $2; //@line 11891
 sp = STACKTOP; //@line 11892
 return;
}
function _mbed_die__async_cb_38($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx4 = 0, sp = 0;
 sp = STACKTOP; //@line 11848
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 11850
 _emscripten_asm_const_iii(8, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 11852
 $ReallocAsyncCtx4 = _emscripten_realloc_async_context(8) | 0; //@line 11853
 _wait_ms(400); //@line 11854
 if (___async) {
  HEAP32[$ReallocAsyncCtx4 >> 2] = 118; //@line 11857
  $4 = $ReallocAsyncCtx4 + 4 | 0; //@line 11858
  HEAP32[$4 >> 2] = $2; //@line 11859
  sp = STACKTOP; //@line 11860
  return;
 }
 ___async_unwind = 0; //@line 11863
 HEAP32[$ReallocAsyncCtx4 >> 2] = 118; //@line 11864
 $4 = $ReallocAsyncCtx4 + 4 | 0; //@line 11865
 HEAP32[$4 >> 2] = $2; //@line 11866
 sp = STACKTOP; //@line 11867
 return;
}
function _mbed_die__async_cb_37($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 11823
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 11825
 _emscripten_asm_const_iii(8, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 11827
 $ReallocAsyncCtx3 = _emscripten_realloc_async_context(8) | 0; //@line 11828
 _wait_ms(400); //@line 11829
 if (___async) {
  HEAP32[$ReallocAsyncCtx3 >> 2] = 119; //@line 11832
  $4 = $ReallocAsyncCtx3 + 4 | 0; //@line 11833
  HEAP32[$4 >> 2] = $2; //@line 11834
  sp = STACKTOP; //@line 11835
  return;
 }
 ___async_unwind = 0; //@line 11838
 HEAP32[$ReallocAsyncCtx3 >> 2] = 119; //@line 11839
 $4 = $ReallocAsyncCtx3 + 4 | 0; //@line 11840
 HEAP32[$4 >> 2] = $2; //@line 11841
 sp = STACKTOP; //@line 11842
 return;
}
function _mbed_die__async_cb_36($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 11798
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 11800
 _emscripten_asm_const_iii(8, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 11802
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(8) | 0; //@line 11803
 _wait_ms(400); //@line 11804
 if (___async) {
  HEAP32[$ReallocAsyncCtx2 >> 2] = 120; //@line 11807
  $4 = $ReallocAsyncCtx2 + 4 | 0; //@line 11808
  HEAP32[$4 >> 2] = $2; //@line 11809
  sp = STACKTOP; //@line 11810
  return;
 }
 ___async_unwind = 0; //@line 11813
 HEAP32[$ReallocAsyncCtx2 >> 2] = 120; //@line 11814
 $4 = $ReallocAsyncCtx2 + 4 | 0; //@line 11815
 HEAP32[$4 >> 2] = $2; //@line 11816
 sp = STACKTOP; //@line 11817
 return;
}
function _printf($0, $varargs) {
 $0 = $0 | 0;
 $varargs = $varargs | 0;
 var $1 = 0, $2 = 0, $3 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 6718
 STACKTOP = STACKTOP + 16 | 0; //@line 6719
 $1 = sp; //@line 6720
 HEAP32[$1 >> 2] = $varargs; //@line 6721
 $2 = HEAP32[396] | 0; //@line 6722
 $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 6723
 $3 = _vfprintf($2, $0, $1) | 0; //@line 6724
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 142; //@line 6727
  HEAP32[$AsyncCtx + 4 >> 2] = $1; //@line 6729
  sp = STACKTOP; //@line 6730
  STACKTOP = sp; //@line 6731
  return 0; //@line 6731
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 6733
  STACKTOP = sp; //@line 6734
  return $3 | 0; //@line 6734
 }
 return 0; //@line 6736
}
function _mbed_die__async_cb_35($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 11773
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 11775
 _emscripten_asm_const_iii(8, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 11777
 $ReallocAsyncCtx = _emscripten_realloc_async_context(8) | 0; //@line 11778
 _wait_ms(400); //@line 11779
 if (___async) {
  HEAP32[$ReallocAsyncCtx >> 2] = 121; //@line 11782
  $4 = $ReallocAsyncCtx + 4 | 0; //@line 11783
  HEAP32[$4 >> 2] = $2; //@line 11784
  sp = STACKTOP; //@line 11785
  return;
 }
 ___async_unwind = 0; //@line 11788
 HEAP32[$ReallocAsyncCtx >> 2] = 121; //@line 11789
 $4 = $ReallocAsyncCtx + 4 | 0; //@line 11790
 HEAP32[$4 >> 2] = $2; //@line 11791
 sp = STACKTOP; //@line 11792
 return;
}
function _store_int_728($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $7 = 0;
 L1 : do {
  if ($0 | 0) {
   switch ($1 | 0) {
   case -2:
    {
     HEAP8[$0 >> 0] = $2; //@line 11912
     break L1;
     break;
    }
   case -1:
    {
     HEAP16[$0 >> 1] = $2; //@line 11918
     break L1;
     break;
    }
   case 0:
    {
     HEAP32[$0 >> 2] = $2; //@line 11923
     break L1;
     break;
    }
   case 1:
    {
     HEAP32[$0 >> 2] = $2; //@line 11928
     break L1;
     break;
    }
   case 3:
    {
     $7 = $0; //@line 11933
     HEAP32[$7 >> 2] = $2; //@line 11935
     HEAP32[$7 + 4 >> 2] = $3; //@line 11938
     break L1;
     break;
    }
   default:
    {
     break L1;
    }
   }
  }
 } while (0);
 return;
}
function __ZThn4_N17EthernetInterface11socket_recvEPvS0_j($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $$0$i = 0, $6 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 760
 $6 = _emscripten_asm_const_iiii(7, HEAP32[$1 >> 2] | 0, $2 | 0, $3 | 0) | 0; //@line 763
 if (($6 | 0) < 0) {
  $$0$i = -3001; //@line 766
  return $$0$i | 0; //@line 767
 }
 $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 769
 _wait_ms(1); //@line 770
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 44; //@line 773
  HEAP32[$AsyncCtx + 4 >> 2] = $6; //@line 775
  sp = STACKTOP; //@line 776
  return 0; //@line 777
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 779
 $$0$i = $6; //@line 780
 return $$0$i | 0; //@line 781
}
function _sprintf($0, $1, $varargs) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $varargs = $varargs | 0;
 var $2 = 0, $3 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 6676
 STACKTOP = STACKTOP + 16 | 0; //@line 6677
 $2 = sp; //@line 6678
 HEAP32[$2 >> 2] = $varargs; //@line 6679
 $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 6680
 $3 = _vsprintf($0, $1, $2) | 0; //@line 6681
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 140; //@line 6684
  HEAP32[$AsyncCtx + 4 >> 2] = $2; //@line 6686
  sp = STACKTOP; //@line 6687
  STACKTOP = sp; //@line 6688
  return 0; //@line 6688
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 6690
  STACKTOP = sp; //@line 6691
  return $3 | 0; //@line 6691
 }
 return 0; //@line 6693
}
function __ZN17EthernetInterface11socket_recvEPvS0_j($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $$0 = 0, $6 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 363
 $6 = _emscripten_asm_const_iiii(7, HEAP32[$1 >> 2] | 0, $2 | 0, $3 | 0) | 0; //@line 366
 if (($6 | 0) < 0) {
  $$0 = -3001; //@line 369
  return $$0 | 0; //@line 370
 }
 $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 372
 _wait_ms(1); //@line 373
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 31; //@line 376
  HEAP32[$AsyncCtx + 4 >> 2] = $6; //@line 378
  sp = STACKTOP; //@line 379
  return 0; //@line 380
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 382
 $$0 = $6; //@line 383
 return $$0 | 0; //@line 384
}
function __ZThn4_N17EthernetInterface12socket_closeEPv($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $3 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 646
 $3 = _emscripten_asm_const_ii(4, HEAP32[$1 >> 2] | 0) | 0; //@line 648
 $AsyncCtx = _emscripten_alloc_async_context(12, sp) | 0; //@line 649
 _wait_ms(1); //@line 650
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 41; //@line 653
  HEAP32[$AsyncCtx + 4 >> 2] = $1; //@line 655
  HEAP32[$AsyncCtx + 8 >> 2] = $3; //@line 657
  sp = STACKTOP; //@line 658
  return 0; //@line 659
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 661
 HEAP8[$1 + 8 >> 0] = 0; //@line 663
 if (!$1) {
  return $3 | 0; //@line 666
 }
 __ZdlPv($1); //@line 668
 return $3 | 0; //@line 669
}
function __ZN17EthernetInterface12socket_closeEPv($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $3 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 249
 $3 = _emscripten_asm_const_ii(4, HEAP32[$1 >> 2] | 0) | 0; //@line 251
 $AsyncCtx = _emscripten_alloc_async_context(12, sp) | 0; //@line 252
 _wait_ms(1); //@line 253
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 28; //@line 256
  HEAP32[$AsyncCtx + 4 >> 2] = $1; //@line 258
  HEAP32[$AsyncCtx + 8 >> 2] = $3; //@line 260
  sp = STACKTOP; //@line 261
  return 0; //@line 262
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 264
 HEAP8[$1 + 8 >> 0] = 0; //@line 266
 if (!$1) {
  return $3 | 0; //@line 269
 }
 __ZdlPv($1); //@line 271
 return $3 | 0; //@line 272
}
function _fwrite($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $$ = 0, $11 = 0, $13 = 0, $15 = 0, $4 = 0, $phitmp = 0;
 $4 = Math_imul($2, $1) | 0; //@line 10271
 $$ = ($1 | 0) == 0 ? 0 : $2; //@line 10273
 if ((HEAP32[$3 + 76 >> 2] | 0) > -1) {
  $phitmp = (___lockfile($3) | 0) == 0; //@line 10279
  $11 = ___fwritex($0, $4, $3) | 0; //@line 10280
  if ($phitmp) {
   $13 = $11; //@line 10282
  } else {
   ___unlockfile($3); //@line 10284
   $13 = $11; //@line 10285
  }
 } else {
  $13 = ___fwritex($0, $4, $3) | 0; //@line 10289
 }
 if (($13 | 0) == ($4 | 0)) {
  $15 = $$; //@line 10293
 } else {
  $15 = ($13 >>> 0) / ($1 >>> 0) | 0; //@line 10296
 }
 return $15 | 0; //@line 10298
}
function _sbrk(increment) {
 increment = increment | 0;
 var oldDynamicTop = 0, newDynamicTop = 0;
 oldDynamicTop = HEAP32[DYNAMICTOP_PTR >> 2] | 0; //@line 3610
 newDynamicTop = oldDynamicTop + increment | 0; //@line 3611
 if ((increment | 0) > 0 & (newDynamicTop | 0) < (oldDynamicTop | 0) | (newDynamicTop | 0) < 0) {
  abortOnCannotGrowMemory() | 0; //@line 3615
  ___setErrNo(12); //@line 3616
  return -1;
 }
 HEAP32[DYNAMICTOP_PTR >> 2] = newDynamicTop; //@line 3620
 if ((newDynamicTop | 0) > (getTotalMemory() | 0)) {
  if (!(enlargeMemory() | 0)) {
   HEAP32[DYNAMICTOP_PTR >> 2] = oldDynamicTop; //@line 3624
   ___setErrNo(12); //@line 3625
   return -1;
  }
 }
 return oldDynamicTop | 0; //@line 3629
}
function ___stdout_write($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $14 = 0, $vararg_buffer = 0, sp = 0;
 sp = STACKTOP; //@line 10089
 STACKTOP = STACKTOP + 32 | 0; //@line 10090
 $vararg_buffer = sp; //@line 10091
 HEAP32[$0 + 36 >> 2] = 9; //@line 10094
 if (!(HEAP32[$0 >> 2] & 64)) {
  HEAP32[$vararg_buffer >> 2] = HEAP32[$0 + 60 >> 2]; //@line 10102
  HEAP32[$vararg_buffer + 4 >> 2] = 21523; //@line 10104
  HEAP32[$vararg_buffer + 8 >> 2] = sp + 16; //@line 10106
  if (___syscall54(54, $vararg_buffer | 0) | 0) {
   HEAP8[$0 + 75 >> 0] = -1; //@line 10111
  }
 }
 $14 = ___stdio_write($0, $1, $2) | 0; //@line 10114
 STACKTOP = sp; //@line 10115
 return $14 | 0; //@line 10115
}
function _fmt_x($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $$05$lcssa = 0, $$056 = 0, $14 = 0, $15 = 0, $8 = 0;
 if (($0 | 0) == 0 & ($1 | 0) == 0) {
  $$05$lcssa = $2; //@line 4561
 } else {
  $$056 = $2; //@line 4563
  $15 = $1; //@line 4563
  $8 = $0; //@line 4563
  while (1) {
   $14 = $$056 + -1 | 0; //@line 4571
   HEAP8[$14 >> 0] = HEAPU8[4541 + ($8 & 15) >> 0] | 0 | $3; //@line 4572
   $8 = _bitshift64Lshr($8 | 0, $15 | 0, 4) | 0; //@line 4573
   $15 = tempRet0; //@line 4574
   if (($8 | 0) == 0 & ($15 | 0) == 0) {
    $$05$lcssa = $14; //@line 4579
    break;
   } else {
    $$056 = $14; //@line 4582
   }
  }
 }
 return $$05$lcssa | 0; //@line 4586
}
function __ZSt11__terminatePFvvE($0) {
 $0 = $0 | 0;
 var $AsyncCtx = 0, $vararg_buffer = 0, sp = 0;
 sp = STACKTOP; //@line 7991
 STACKTOP = STACKTOP + 16 | 0; //@line 7992
 $vararg_buffer = sp; //@line 7993
 $AsyncCtx = _emscripten_alloc_async_context(12, sp) | 0; //@line 7994
 FUNCTION_TABLE_v[$0 & 3](); //@line 7995
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 161; //@line 7998
  HEAP32[$AsyncCtx + 4 >> 2] = $vararg_buffer; //@line 8000
  HEAP32[$AsyncCtx + 8 >> 2] = $vararg_buffer; //@line 8002
  sp = STACKTOP; //@line 8003
  STACKTOP = sp; //@line 8004
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 8006
  _abort_message(6878, $vararg_buffer); //@line 8007
 }
}
function ___towrite($0) {
 $0 = $0 | 0;
 var $$0 = 0, $1 = 0, $14 = 0, $3 = 0, $7 = 0;
 $1 = $0 + 74 | 0; //@line 10388
 $3 = HEAP8[$1 >> 0] | 0; //@line 10390
 HEAP8[$1 >> 0] = $3 + 255 | $3; //@line 10394
 $7 = HEAP32[$0 >> 2] | 0; //@line 10395
 if (!($7 & 8)) {
  HEAP32[$0 + 8 >> 2] = 0; //@line 10400
  HEAP32[$0 + 4 >> 2] = 0; //@line 10402
  $14 = HEAP32[$0 + 44 >> 2] | 0; //@line 10404
  HEAP32[$0 + 28 >> 2] = $14; //@line 10406
  HEAP32[$0 + 20 >> 2] = $14; //@line 10408
  HEAP32[$0 + 16 >> 2] = $14 + (HEAP32[$0 + 48 >> 2] | 0); //@line 10414
  $$0 = 0; //@line 10415
 } else {
  HEAP32[$0 >> 2] = $7 | 32; //@line 10418
  $$0 = -1; //@line 10419
 }
 return $$0 | 0; //@line 10421
}
function __ZN9UDPSocket5eventEv($0) {
 $0 = $0 | 0;
 var $$pre = 0, $1 = 0, $6 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 3311
 $1 = $0 + 52 | 0; //@line 3312
 HEAP32[$1 >> 2] = (HEAP32[$1 >> 2] | 0) + 1; //@line 3315
 $6 = HEAP32[$0 + 44 >> 2] | 0; //@line 3318
 if (!$6) {
  return;
 }
 if ((HEAP32[$1 >> 2] | 0) != 1) {
  return;
 }
 $$pre = HEAP32[$6 >> 2] | 0; //@line 3328
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 3329
 FUNCTION_TABLE_vi[$$pre & 255]($0 + 32 | 0); //@line 3330
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 88; //@line 3333
  sp = STACKTOP; //@line 3334
  return;
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 3337
 return;
}
function __ZN9TCPSocket5eventEv($0) {
 $0 = $0 | 0;
 var $$pre = 0, $1 = 0, $6 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 2815
 $1 = $0 + 52 | 0; //@line 2816
 HEAP32[$1 >> 2] = (HEAP32[$1 >> 2] | 0) + 1; //@line 2819
 $6 = HEAP32[$0 + 44 >> 2] | 0; //@line 2822
 if (!$6) {
  return;
 }
 if ((HEAP32[$1 >> 2] | 0) != 1) {
  return;
 }
 $$pre = HEAP32[$6 >> 2] | 0; //@line 2832
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 2833
 FUNCTION_TABLE_vi[$$pre & 255]($0 + 32 | 0); //@line 2834
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 76; //@line 2837
  sp = STACKTOP; //@line 2838
  return;
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 2841
 return;
}
function __ZSt9terminatev() {
 var $0 = 0, $16 = 0, $17 = 0, $2 = 0, $5 = 0, sp = 0;
 sp = STACKTOP; //@line 7956
 $0 = ___cxa_get_globals_fast() | 0; //@line 7957
 if ($0 | 0) {
  $2 = HEAP32[$0 >> 2] | 0; //@line 7960
  if ($2 | 0) {
   $5 = $2 + 48 | 0; //@line 7964
   if ((HEAP32[$5 >> 2] & -256 | 0) == 1126902528 ? (HEAP32[$5 + 4 >> 2] | 0) == 1129074247 : 0) {
    $16 = HEAP32[$2 + 12 >> 2] | 0; //@line 7976
    _emscripten_alloc_async_context(4, sp) | 0; //@line 7977
    __ZSt11__terminatePFvvE($16); //@line 7978
   }
  }
 }
 $17 = __ZSt13get_terminatev() | 0; //@line 7983
 _emscripten_alloc_async_context(4, sp) | 0; //@line 7984
 __ZSt11__terminatePFvvE($17); //@line 7985
}
function __ZN9UDPSocketD2Ev__async_cb($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $8 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 11648
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 11650
 $4 = HEAP32[$2 + 28 >> 2] | 0; //@line 11652
 if (!$4) {
  return;
 }
 $8 = HEAP32[$4 + 8 >> 2] | 0; //@line 11659
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(4) | 0; //@line 11660
 FUNCTION_TABLE_vi[$8 & 255]($2 + 16 | 0); //@line 11661
 if (___async) {
  HEAP32[$ReallocAsyncCtx2 >> 2] = 86; //@line 11664
  sp = STACKTOP; //@line 11665
  return;
 }
 ___async_unwind = 0; //@line 11668
 HEAP32[$ReallocAsyncCtx2 >> 2] = 86; //@line 11669
 sp = STACKTOP; //@line 11670
 return;
}
function __ZN9TCPSocketD2Ev__async_cb($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $8 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 11504
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 11506
 $4 = HEAP32[$2 + 28 >> 2] | 0; //@line 11508
 if (!$4) {
  return;
 }
 $8 = HEAP32[$4 + 8 >> 2] | 0; //@line 11515
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(4) | 0; //@line 11516
 FUNCTION_TABLE_vi[$8 & 255]($2 + 16 | 0); //@line 11517
 if (___async) {
  HEAP32[$ReallocAsyncCtx2 >> 2] = 74; //@line 11520
  sp = STACKTOP; //@line 11521
  return;
 }
 ___async_unwind = 0; //@line 11524
 HEAP32[$ReallocAsyncCtx2 >> 2] = 74; //@line 11525
 sp = STACKTOP; //@line 11526
 return;
}
function __ZN6SocketD2Ev__async_cb($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $8 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 11594
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 11596
 $4 = HEAP32[$2 + 28 >> 2] | 0; //@line 11598
 if (!$4) {
  return;
 }
 $8 = HEAP32[$4 + 8 >> 2] | 0; //@line 11605
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(4) | 0; //@line 11606
 FUNCTION_TABLE_vi[$8 & 255]($2 + 16 | 0); //@line 11607
 if (___async) {
  HEAP32[$ReallocAsyncCtx2 >> 2] = 58; //@line 11610
  sp = STACKTOP; //@line 11611
  return;
 }
 ___async_unwind = 0; //@line 11614
 HEAP32[$ReallocAsyncCtx2 >> 2] = 58; //@line 11615
 sp = STACKTOP; //@line 11616
 return;
}
function _vsscanf($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $3 = 0, $8 = 0, dest = 0, sp = 0, stop = 0;
 sp = STACKTOP; //@line 10789
 STACKTOP = STACKTOP + 128 | 0; //@line 10790
 $3 = sp; //@line 10791
 dest = $3; //@line 10792
 stop = dest + 124 | 0; //@line 10792
 do {
  HEAP32[dest >> 2] = 0; //@line 10792
  dest = dest + 4 | 0; //@line 10792
 } while ((dest | 0) < (stop | 0));
 HEAP32[$3 + 32 >> 2] = 14; //@line 10794
 HEAP32[$3 + 44 >> 2] = $0; //@line 10796
 HEAP32[$3 + 76 >> 2] = -1; //@line 10798
 HEAP32[$3 + 84 >> 2] = $0; //@line 10800
 $8 = _vfscanf($3, $1, $2) | 0; //@line 10801
 STACKTOP = sp; //@line 10802
 return $8 | 0; //@line 10802
}
function __ZThn4_N17EthernetInterface11socket_sendEPvPKvj($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $6 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 735
 $6 = _emscripten_asm_const_iiii(6, HEAP32[$1 >> 2] | 0, $2 | 0, $3 | 0) | 0; //@line 738
 $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 739
 _wait_ms(1); //@line 740
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 43; //@line 743
  HEAP32[$AsyncCtx + 4 >> 2] = $6; //@line 745
  sp = STACKTOP; //@line 746
  return 0; //@line 747
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 749
  return $6 | 0; //@line 750
 }
 return 0; //@line 752
}
function ___string_read($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$027 = 0, $$027$ = 0, $14 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0;
 $3 = $0 + 84 | 0; //@line 3043
 $4 = HEAP32[$3 >> 2] | 0; //@line 3044
 $5 = $2 + 256 | 0; //@line 3045
 $6 = _memchr($4, 0, $5) | 0; //@line 3046
 $$027 = ($6 | 0) == 0 ? $5 : $6 - $4 | 0; //@line 3051
 $$027$ = $$027 >>> 0 < $2 >>> 0 ? $$027 : $2; //@line 3053
 _memcpy($1 | 0, $4 | 0, $$027$ | 0) | 0; //@line 3054
 HEAP32[$0 + 4 >> 2] = $4 + $$027$; //@line 3057
 $14 = $4 + $$027 | 0; //@line 3058
 HEAP32[$0 + 8 >> 2] = $14; //@line 3060
 HEAP32[$3 >> 2] = $14; //@line 3061
 return $$027$ | 0; //@line 3062
}
function __ZN17EthernetInterface11socket_sendEPvPKvj($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $6 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 338
 $6 = _emscripten_asm_const_iiii(6, HEAP32[$1 >> 2] | 0, $2 | 0, $3 | 0) | 0; //@line 341
 $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 342
 _wait_ms(1); //@line 343
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 30; //@line 346
  HEAP32[$AsyncCtx + 4 >> 2] = $6; //@line 348
  sp = STACKTOP; //@line 349
  return 0; //@line 350
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 352
  return $6 | 0; //@line 353
 }
 return 0; //@line 355
}
function _twobyte_strstr($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$sink$in = 0, $$sink17$sink = 0, $11 = 0, $12 = 0, $8 = 0;
 $8 = (HEAPU8[$1 >> 0] | 0) << 8 | (HEAPU8[$1 + 1 >> 0] | 0); //@line 6029
 $$sink$in = HEAPU8[$0 >> 0] | 0; //@line 6032
 $$sink17$sink = $0; //@line 6032
 while (1) {
  $11 = $$sink17$sink + 1 | 0; //@line 6034
  $12 = HEAP8[$11 >> 0] | 0; //@line 6035
  if (!($12 << 24 >> 24)) {
   break;
  }
  $$sink$in = $$sink$in << 8 & 65280 | $12 & 255; //@line 6043
  if (($$sink$in | 0) == ($8 | 0)) {
   break;
  } else {
   $$sink17$sink = $11; //@line 6048
  }
 }
 return ($12 << 24 >> 24 ? $$sink17$sink : 0) | 0; //@line 6053
}
function _fmt_o($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$0$lcssa = 0, $$06 = 0, $10 = 0, $11 = 0, $7 = 0;
 if (($0 | 0) == 0 & ($1 | 0) == 0) {
  $$0$lcssa = $2; //@line 4598
 } else {
  $$06 = $2; //@line 4600
  $11 = $1; //@line 4600
  $7 = $0; //@line 4600
  while (1) {
   $10 = $$06 + -1 | 0; //@line 4605
   HEAP8[$10 >> 0] = $7 & 7 | 48; //@line 4606
   $7 = _bitshift64Lshr($7 | 0, $11 | 0, 3) | 0; //@line 4607
   $11 = tempRet0; //@line 4608
   if (($7 | 0) == 0 & ($11 | 0) == 0) {
    $$0$lcssa = $10; //@line 4613
    break;
   } else {
    $$06 = $10; //@line 4616
   }
  }
 }
 return $$0$lcssa | 0; //@line 4620
}
function _main__async_cb_20($0) {
 $0 = $0 | 0;
 var $4 = 0, $6 = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 10707
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 10711
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 10713
 __ZdaPv(HEAP32[$0 + 4 >> 2] | 0); //@line 10714
 $ReallocAsyncCtx3 = _emscripten_realloc_async_context(12) | 0; //@line 10715
 _puts(3745) | 0; //@line 10716
 if (!___async) {
  ___async_unwind = 0; //@line 10719
 }
 HEAP32[$ReallocAsyncCtx3 >> 2] = 135; //@line 10721
 HEAP32[$ReallocAsyncCtx3 + 4 >> 2] = $4; //@line 10723
 HEAP32[$ReallocAsyncCtx3 + 8 >> 2] = $6; //@line 10725
 sp = STACKTOP; //@line 10726
 return;
}
function __ZN4mbed8CallbackIFvvEE5thunkEPv__async_cb_12($0) {
 $0 = $0 | 0;
 var $4 = 0, $5 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 10160
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 10164
 $5 = HEAP32[HEAP32[HEAP32[$0 + 4 >> 2] >> 2] >> 2] | 0; //@line 10166
 $ReallocAsyncCtx = _emscripten_realloc_async_context(4) | 0; //@line 10167
 FUNCTION_TABLE_vi[$5 & 255]($4); //@line 10168
 if (___async) {
  HEAP32[$ReallocAsyncCtx >> 2] = 67; //@line 10171
  sp = STACKTOP; //@line 10172
  return;
 }
 ___async_unwind = 0; //@line 10175
 HEAP32[$ReallocAsyncCtx >> 2] = 67; //@line 10176
 sp = STACKTOP; //@line 10177
 return;
}
function _invoke_ticker__async_cb_24($0) {
 $0 = $0 | 0;
 var $5 = 0, $6 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 10946
 $5 = HEAP32[HEAP32[HEAP32[$0 + 4 >> 2] >> 2] >> 2] | 0; //@line 10952
 $6 = HEAP32[$0 + 8 >> 2] | 0; //@line 10953
 $ReallocAsyncCtx = _emscripten_realloc_async_context(4) | 0; //@line 10954
 FUNCTION_TABLE_vi[$5 & 255]($6); //@line 10955
 if (___async) {
  HEAP32[$ReallocAsyncCtx >> 2] = 123; //@line 10958
  sp = STACKTOP; //@line 10959
  return;
 }
 ___async_unwind = 0; //@line 10962
 HEAP32[$ReallocAsyncCtx >> 2] = 123; //@line 10963
 sp = STACKTOP; //@line 10964
 return;
}
function ___cxa_is_pointer_type($0) {
 $0 = $0 | 0;
 var $2 = 0, $3 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 8841
 do {
  if (!$0) {
   $3 = 0; //@line 8845
  } else {
   $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 8847
   $2 = ___dynamic_cast($0, 120, 176, 0) | 0; //@line 8848
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 175; //@line 8851
    sp = STACKTOP; //@line 8852
    return 0; //@line 8853
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 8855
    $3 = ($2 | 0) != 0 & 1; //@line 8858
    break;
   }
  }
 } while (0);
 return $3 | 0; //@line 8863
}
function _getint_671($0) {
 $0 = $0 | 0;
 var $$0$lcssa = 0, $$04 = 0, $11 = 0, $12 = 0, $7 = 0;
 if (!(_isdigit(HEAP8[HEAP32[$0 >> 2] >> 0] | 0) | 0)) {
  $$0$lcssa = 0; //@line 4242
 } else {
  $$04 = 0; //@line 4244
  while (1) {
   $7 = HEAP32[$0 >> 2] | 0; //@line 4247
   $11 = ($$04 * 10 | 0) + -48 + (HEAP8[$7 >> 0] | 0) | 0; //@line 4251
   $12 = $7 + 1 | 0; //@line 4252
   HEAP32[$0 >> 2] = $12; //@line 4253
   if (!(_isdigit(HEAP8[$12 >> 0] | 0) | 0)) {
    $$0$lcssa = $11; //@line 4259
    break;
   } else {
    $$04 = $11; //@line 4262
   }
  }
 }
 return $$0$lcssa | 0; //@line 4266
}
function ___muldi3($a$0, $a$1, $b$0, $b$1) {
 $a$0 = $a$0 | 0;
 $a$1 = $a$1 | 0;
 $b$0 = $b$0 | 0;
 $b$1 = $b$1 | 0;
 var $x_sroa_0_0_extract_trunc = 0, $y_sroa_0_0_extract_trunc = 0, $1$0 = 0, $1$1 = 0;
 $x_sroa_0_0_extract_trunc = $a$0; //@line 3124
 $y_sroa_0_0_extract_trunc = $b$0; //@line 3125
 $1$0 = ___muldsi3($x_sroa_0_0_extract_trunc, $y_sroa_0_0_extract_trunc) | 0; //@line 3126
 $1$1 = tempRet0; //@line 3127
 return (tempRet0 = (Math_imul($a$1, $y_sroa_0_0_extract_trunc) | 0) + (Math_imul($b$1, $x_sroa_0_0_extract_trunc) | 0) + $1$1 | $1$1 & 0, $1$0 | 0 | 0) | 0; //@line 3129
}
function _arg_n_727($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0 = 0, $10 = 0, $2 = 0, $9 = 0, sp = 0;
 sp = STACKTOP; //@line 11867
 STACKTOP = STACKTOP + 16 | 0; //@line 11868
 $2 = sp; //@line 11869
 HEAP32[$2 >> 2] = HEAP32[$0 >> 2]; //@line 11871
 $$0 = $1; //@line 11872
 while (1) {
  $9 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 11886
  $10 = HEAP32[$9 >> 2] | 0; //@line 11887
  HEAP32[$2 >> 2] = $9 + 4; //@line 11889
  if ($$0 >>> 0 > 1) {
   $$0 = $$0 + -1 | 0; //@line 11892
  } else {
   break;
  }
 }
 STACKTOP = sp; //@line 11897
 return $10 | 0; //@line 11897
}
function __ZThn4_N17EthernetInterface14get_ip_addressEv($0) {
 $0 = $0 | 0;
 var $2 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 571
 $2 = _emscripten_asm_const_ii(1, 0) | 0; //@line 573
 $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 574
 _wait_ms(1); //@line 575
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 38; //@line 578
  HEAP32[$AsyncCtx + 4 >> 2] = $2; //@line 580
  sp = STACKTOP; //@line 581
  return 0; //@line 582
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 584
  return $2 | 0; //@line 585
 }
 return 0; //@line 587
}
function _memmove(dest, src, num) {
 dest = dest | 0;
 src = src | 0;
 num = num | 0;
 var ret = 0;
 if ((src | 0) < (dest | 0) & (dest | 0) < (src + num | 0)) {
  ret = dest; //@line 3541
  src = src + num | 0; //@line 3542
  dest = dest + num | 0; //@line 3543
  while ((num | 0) > 0) {
   dest = dest - 1 | 0; //@line 3545
   src = src - 1 | 0; //@line 3546
   num = num - 1 | 0; //@line 3547
   HEAP8[dest >> 0] = HEAP8[src >> 0] | 0; //@line 3548
  }
  dest = ret; //@line 3550
 } else {
  _memcpy(dest, src, num) | 0; //@line 3552
 }
 return dest | 0; //@line 3554
}
function runPostSets() {}
function ___muldsi3($a, $b) {
 $a = $a | 0;
 $b = $b | 0;
 var $1 = 0, $2 = 0, $3 = 0, $6 = 0, $8 = 0, $11 = 0, $12 = 0;
 $1 = $a & 65535; //@line 3109
 $2 = $b & 65535; //@line 3110
 $3 = Math_imul($2, $1) | 0; //@line 3111
 $6 = $a >>> 16; //@line 3112
 $8 = ($3 >>> 16) + (Math_imul($2, $6) | 0) | 0; //@line 3113
 $11 = $b >>> 16; //@line 3114
 $12 = Math_imul($11, $1) | 0; //@line 3115
 return (tempRet0 = ($8 >>> 16) + (Math_imul($11, $6) | 0) + ((($8 & 65535) + $12 | 0) >>> 16) | 0, $8 + $12 << 16 | $3 & 65535 | 0) | 0; //@line 3116
}
function __ZN6SocketC2Ev($0) {
 $0 = $0 | 0;
 var $4 = 0;
 HEAP32[$0 >> 2] = 420; //@line 1198
 HEAP32[$0 + 4 >> 2] = 0; //@line 1200
 HEAP32[$0 + 8 >> 2] = 0; //@line 1202
 HEAP32[$0 + 12 >> 2] = -1; //@line 1204
 $4 = $0 + 16 | 0; //@line 1205
 HEAP32[$4 >> 2] = 0; //@line 1206
 HEAP32[$4 + 4 >> 2] = 0; //@line 1206
 HEAP32[$4 + 8 >> 2] = 0; //@line 1206
 HEAP32[$4 + 12 >> 2] = 0; //@line 1206
 HEAP32[$4 + 16 >> 2] = 0; //@line 1206
 HEAP32[$4 + 20 >> 2] = 0; //@line 1206
 HEAP32[$4 + 24 >> 2] = 0; //@line 1206
 HEAP32[$4 + 28 >> 2] = 0; //@line 1206
 return;
}
function __ZN17EthernetInterface11get_netmaskEv($0) {
 $0 = $0 | 0;
 var $2 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 111
 $2 = _emscripten_asm_const_ii(2, 0) | 0; //@line 113
 $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 114
 _wait_ms(1); //@line 115
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 23; //@line 118
  HEAP32[$AsyncCtx + 4 >> 2] = $2; //@line 120
  sp = STACKTOP; //@line 121
  return 0; //@line 122
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 124
  return $2 | 0; //@line 125
 }
 return 0; //@line 127
}
function __ZN17EthernetInterface14get_ip_addressEv($0) {
 $0 = $0 | 0;
 var $2 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 90
 $2 = _emscripten_asm_const_ii(1, 0) | 0; //@line 92
 $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 93
 _wait_ms(1); //@line 94
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 22; //@line 97
  HEAP32[$AsyncCtx + 4 >> 2] = $2; //@line 99
  sp = STACKTOP; //@line 100
  return 0; //@line 101
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 103
  return $2 | 0; //@line 104
 }
 return 0; //@line 106
}
function _mbed_die__async_cb_49($0) {
 $0 = $0 | 0;
 var $2 = 0, $ReallocAsyncCtx15 = 0, sp = 0;
 sp = STACKTOP; //@line 12123
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 12125
 _emscripten_asm_const_iii(8, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 12127
 $ReallocAsyncCtx15 = _emscripten_realloc_async_context(8) | 0; //@line 12128
 _wait_ms(150); //@line 12129
 if (!___async) {
  ___async_unwind = 0; //@line 12132
 }
 HEAP32[$ReallocAsyncCtx15 >> 2] = 107; //@line 12134
 HEAP32[$ReallocAsyncCtx15 + 4 >> 2] = $2; //@line 12136
 sp = STACKTOP; //@line 12137
 return;
}
function __ZN17EthernetInterface15get_mac_addressEv($0) {
 $0 = $0 | 0;
 var $2 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 69
 $2 = _emscripten_asm_const_ii(0, 0) | 0; //@line 71
 $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 72
 _wait_ms(1); //@line 73
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 21; //@line 76
  HEAP32[$AsyncCtx + 4 >> 2] = $2; //@line 78
  sp = STACKTOP; //@line 79
  return 0; //@line 80
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 82
  return $2 | 0; //@line 83
 }
 return 0; //@line 85
}
function _mbed_die__async_cb($0) {
 $0 = $0 | 0;
 var $2 = 0, $ReallocAsyncCtx16 = 0, sp = 0;
 sp = STACKTOP; //@line 11753
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 11755
 _emscripten_asm_const_iii(8, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 11757
 $ReallocAsyncCtx16 = _emscripten_realloc_async_context(8) | 0; //@line 11758
 _wait_ms(150); //@line 11759
 if (!___async) {
  ___async_unwind = 0; //@line 11762
 }
 HEAP32[$ReallocAsyncCtx16 >> 2] = 106; //@line 11764
 HEAP32[$ReallocAsyncCtx16 + 4 >> 2] = $2; //@line 11766
 sp = STACKTOP; //@line 11767
 return;
}
function _main__async_cb_14($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx8 = 0, sp = 0;
 sp = STACKTOP; //@line 10418
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 10420
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 10422
 $ReallocAsyncCtx8 = _emscripten_realloc_async_context(8) | 0; //@line 10423
 __ZN9TCPSocketD2Ev($2); //@line 10424
 if (!___async) {
  ___async_unwind = 0; //@line 10427
 }
 HEAP32[$ReallocAsyncCtx8 >> 2] = 136; //@line 10429
 HEAP32[$ReallocAsyncCtx8 + 4 >> 2] = $4; //@line 10431
 sp = STACKTOP; //@line 10432
 return;
}
function __ZN17EthernetInterface11set_networkEPKcS1_S1_($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 141
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 142
 _puts(2933) | 0; //@line 143
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 24; //@line 146
  sp = STACKTOP; //@line 147
  return 0; //@line 148
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 150
  return 0; //@line 151
 }
 return 0; //@line 153
}
function _vsprintf($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $3 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 6700
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 6701
 $3 = _vsnprintf($0, 2147483647, $1, $2) | 0; //@line 6702
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 141; //@line 6705
  sp = STACKTOP; //@line 6706
  return 0; //@line 6707
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 6709
  return $3 | 0; //@line 6710
 }
 return 0; //@line 6712
}
function __ZN13SocketAddressC2E10nsapi_addrt($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $3 = 0;
 HEAP8[$0 >> 0] = 0; //@line 1669
 $3 = $0 + 40 | 0; //@line 1670
 HEAP32[$3 >> 2] = HEAP32[$1 >> 2]; //@line 1671
 HEAP32[$3 + 4 >> 2] = HEAP32[$1 + 4 >> 2]; //@line 1671
 HEAP32[$3 + 8 >> 2] = HEAP32[$1 + 8 >> 2]; //@line 1671
 HEAP32[$3 + 12 >> 2] = HEAP32[$1 + 12 >> 2]; //@line 1671
 HEAP32[$3 + 16 >> 2] = HEAP32[$1 + 16 >> 2]; //@line 1671
 HEAP16[$0 + 60 >> 1] = $2; //@line 1673
 return;
}
function _copysign($0, $1) {
 $0 = +$0;
 $1 = +$1;
 var $2 = 0, $3 = 0, $8 = 0;
 HEAPF64[tempDoublePtr >> 3] = $0; //@line 2947
 $2 = HEAP32[tempDoublePtr >> 2] | 0; //@line 2947
 $3 = HEAP32[tempDoublePtr + 4 >> 2] | 0; //@line 2948
 HEAPF64[tempDoublePtr >> 3] = $1; //@line 2949
 $8 = HEAP32[tempDoublePtr + 4 >> 2] & -2147483648 | $3 & 2147483647; //@line 2953
 HEAP32[tempDoublePtr >> 2] = $2; //@line 2954
 HEAP32[tempDoublePtr + 4 >> 2] = $8; //@line 2954
 return +(+HEAPF64[tempDoublePtr >> 3]);
}
function _emscripten_async_resume() {
 ___async = 0; //@line 3441
 ___async_unwind = 1; //@line 3442
 while (1) {
  if (!___async_cur_frame) return;
  dynCall_vi(HEAP32[___async_cur_frame + 8 >> 2] | 0, ___async_cur_frame + 8 | 0); //@line 3448
  if (___async) return;
  if (!___async_unwind) {
   ___async_unwind = 1; //@line 3452
   continue;
  }
  stackRestore(HEAP32[___async_cur_frame + 4 >> 2] | 0); //@line 3456
  ___async_cur_frame = HEAP32[___async_cur_frame >> 2] | 0; //@line 3458
 }
}
function __ZN9UDPSocketD0Ev($0) {
 $0 = $0 | 0;
 var $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 3286
 $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 3287
 __ZN9UDPSocketD2Ev($0); //@line 3288
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 87; //@line 3291
  HEAP32[$AsyncCtx + 4 >> 2] = $0; //@line 3293
  sp = STACKTOP; //@line 3294
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 3297
  __ZdlPv($0); //@line 3298
  return;
 }
}
function __ZN9TCPSocketD0Ev($0) {
 $0 = $0 | 0;
 var $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 2790
 $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 2791
 __ZN9TCPSocketD2Ev($0); //@line 2792
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 75; //@line 2795
  HEAP32[$AsyncCtx + 4 >> 2] = $0; //@line 2797
  sp = STACKTOP; //@line 2798
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 2801
  __ZdlPv($0); //@line 2802
  return;
 }
}
function __ZN17EthernetInterface8set_dhcpEb($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 159
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 160
 _puts(2888) | 0; //@line 161
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 25; //@line 164
  sp = STACKTOP; //@line 165
  return 0; //@line 166
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 168
  return 0; //@line 169
 }
 return 0; //@line 171
}
function ___uremdi3($a$0, $a$1, $b$0, $b$1) {
 $a$0 = $a$0 | 0;
 $a$1 = $a$1 | 0;
 $b$0 = $b$0 | 0;
 $b$1 = $b$1 | 0;
 var $rem = 0, __stackBase__ = 0;
 __stackBase__ = STACKTOP; //@line 3384
 STACKTOP = STACKTOP + 16 | 0; //@line 3385
 $rem = __stackBase__ | 0; //@line 3386
 ___udivmoddi4($a$0, $a$1, $b$0, $b$1, $rem) | 0; //@line 3387
 STACKTOP = __stackBase__; //@line 3388
 return (tempRet0 = HEAP32[$rem + 4 >> 2] | 0, HEAP32[$rem >> 2] | 0) | 0; //@line 3389
}
function _llvm_cttz_i32(x) {
 x = x | 0;
 var ret = 0;
 ret = HEAP8[cttz_i8 + (x & 255) >> 0] | 0; //@line 3154
 if ((ret | 0) < 8) return ret | 0; //@line 3155
 ret = HEAP8[cttz_i8 + (x >> 8 & 255) >> 0] | 0; //@line 3156
 if ((ret | 0) < 8) return ret + 8 | 0; //@line 3157
 ret = HEAP8[cttz_i8 + (x >> 16 & 255) >> 0] | 0; //@line 3158
 if ((ret | 0) < 8) return ret + 16 | 0; //@line 3159
 return (HEAP8[cttz_i8 + (x >>> 24) >> 0] | 0) + 24 | 0; //@line 3160
}
function __ZN13SocketAddress8set_addrE10nsapi_addr($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $2 = 0;
 HEAP8[$0 >> 0] = 0; //@line 1681
 $2 = $0 + 40 | 0; //@line 1682
 HEAP32[$2 >> 2] = HEAP32[$1 >> 2]; //@line 1683
 HEAP32[$2 + 4 >> 2] = HEAP32[$1 + 4 >> 2]; //@line 1683
 HEAP32[$2 + 8 >> 2] = HEAP32[$1 + 8 >> 2]; //@line 1683
 HEAP32[$2 + 12 >> 2] = HEAP32[$1 + 12 >> 2]; //@line 1683
 HEAP32[$2 + 16 >> 2] = HEAP32[$1 + 16 >> 2]; //@line 1683
 return;
}
function __ZThn4_N17EthernetInterface12socket_closeEPv__async_cb($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $7 = 0;
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 13151
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 13153
 HEAP8[$2 + 8 >> 0] = 0; //@line 13155
 if (!$2) {
  $7 = ___async_retval; //@line 13158
  HEAP32[$7 >> 2] = $4; //@line 13159
  return;
 }
 __ZdlPv($2); //@line 13162
 $7 = ___async_retval; //@line 13163
 HEAP32[$7 >> 2] = $4; //@line 13164
 return;
}
function ___uflow($0) {
 $0 = $0 | 0;
 var $$0 = 0, $1 = 0, sp = 0;
 sp = STACKTOP; //@line 2966
 STACKTOP = STACKTOP + 16 | 0; //@line 2967
 $1 = sp; //@line 2968
 if (!(___toread($0) | 0)) {
  if ((FUNCTION_TABLE_iiii[HEAP32[$0 + 32 >> 2] & 15]($0, $1, 1) | 0) == 1) {
   $$0 = HEAPU8[$1 >> 0] | 0; //@line 2979
  } else {
   $$0 = -1; //@line 2981
  }
 } else {
  $$0 = -1; //@line 2984
 }
 STACKTOP = sp; //@line 2986
 return $$0 | 0; //@line 2986
}
function __Znaj($0) {
 $0 = $0 | 0;
 var $1 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 7036
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 7037
 $1 = __Znwj($0) | 0; //@line 7038
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 147; //@line 7041
  sp = STACKTOP; //@line 7042
  return 0; //@line 7043
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 7045
  return $1 | 0; //@line 7046
 }
 return 0; //@line 7048
}
function __ZNK10__cxxabiv117__class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($0, $1, $2, $3, $4, $5) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 $5 = $5 | 0;
 if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, $5) | 0) {
  __ZNK10__cxxabiv117__class_type_info29process_static_type_above_dstEPNS_19__dynamic_cast_infoEPKvS4_i(0, $1, $2, $3, $4); //@line 7345
 }
 return;
}
function _abort_message__async_cb($0) {
 $0 = $0 | 0;
 var $2 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 12236
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 12238
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(4) | 0; //@line 12239
 _fputc(10, $2) | 0; //@line 12240
 if (!___async) {
  ___async_unwind = 0; //@line 12243
 }
 HEAP32[$ReallocAsyncCtx2 >> 2] = 151; //@line 12245
 sp = STACKTOP; //@line 12246
 return;
}
function __ZL25default_terminate_handlerv__async_cb_8($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $AsyncRetVal = 0;
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 9724
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 9726
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 9728
 HEAP32[$2 >> 2] = 6587; //@line 9729
 HEAP32[$2 + 4 >> 2] = $4; //@line 9731
 HEAP32[$2 + 8 >> 2] = $AsyncRetVal; //@line 9733
 _abort_message(6451, $2); //@line 9734
}
function _sn_write($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$ = 0, $5 = 0, $6 = 0, $7 = 0;
 $5 = $0 + 20 | 0; //@line 6659
 $6 = HEAP32[$5 >> 2] | 0; //@line 6660
 $7 = (HEAP32[$0 + 16 >> 2] | 0) - $6 | 0; //@line 6661
 $$ = $7 >>> 0 > $2 >>> 0 ? $2 : $7; //@line 6663
 _memcpy($6 | 0, $1 | 0, $$ | 0) | 0; //@line 6665
 HEAP32[$5 >> 2] = (HEAP32[$5 >> 2] | 0) + $$; //@line 6668
 return $2 | 0; //@line 6669
}
function __ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv__async_cb($0) {
 $0 = $0 | 0;
 var $$0 = 0, $2 = 0;
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 11415
 if ((HEAP32[$2 + 24 >> 2] | 0) == 1) {
  HEAP32[HEAP32[$0 + 8 >> 2] >> 2] = HEAP32[$2 + 16 >> 2]; //@line 11426
  $$0 = 1; //@line 11427
 } else {
  $$0 = 0; //@line 11429
 }
 HEAP8[___async_retval >> 0] = $$0 & 1; //@line 11433
 return;
}
function _vsnprintf__async_cb($0) {
 $0 = $0 | 0;
 var $13 = 0, $AsyncRetVal = 0;
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 9520
 if (HEAP32[$0 + 4 >> 2] | 0) {
  $13 = HEAP32[HEAP32[$0 + 16 >> 2] >> 2] | 0; //@line 9523
  HEAP8[$13 + ((($13 | 0) == (HEAP32[HEAP32[$0 + 20 >> 2] >> 2] | 0)) << 31 >> 31) >> 0] = 0; //@line 9528
 }
 HEAP32[___async_retval >> 2] = $AsyncRetVal; //@line 9531
 return;
}
function __ZNK13SocketAddress8get_addrEv($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $2 = 0;
 $2 = $1 + 40 | 0; //@line 2326
 HEAP32[$0 >> 2] = HEAP32[$2 >> 2]; //@line 2327
 HEAP32[$0 + 4 >> 2] = HEAP32[$2 + 4 >> 2]; //@line 2327
 HEAP32[$0 + 8 >> 2] = HEAP32[$2 + 8 >> 2]; //@line 2327
 HEAP32[$0 + 12 >> 2] = HEAP32[$2 + 12 >> 2]; //@line 2327
 HEAP32[$0 + 16 >> 2] = HEAP32[$2 + 16 >> 2]; //@line 2327
 return;
}
function ___stdio_close($0) {
 $0 = $0 | 0;
 var $5 = 0, $vararg_buffer = 0, sp = 0;
 sp = STACKTOP; //@line 9900
 STACKTOP = STACKTOP + 16 | 0; //@line 9901
 $vararg_buffer = sp; //@line 9902
 HEAP32[$vararg_buffer >> 2] = _dummy(HEAP32[$0 + 60 >> 2] | 0) | 0; //@line 9906
 $5 = ___syscall_ret(___syscall6(6, $vararg_buffer | 0) | 0) | 0; //@line 9908
 STACKTOP = sp; //@line 9909
 return $5 | 0; //@line 9909
}
function __ZNK10__cxxabiv117__class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, 0) | 0) {
  __ZNK10__cxxabiv117__class_type_info24process_found_base_classEPNS_19__dynamic_cast_infoEPvi(0, $1, $2, $3); //@line 7421
 }
 return;
}
function ___shlim($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $4 = 0, $6 = 0, $7 = 0;
 HEAP32[$0 + 104 >> 2] = $1; //@line 11752
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 11754
 $6 = HEAP32[$0 + 4 >> 2] | 0; //@line 11756
 $7 = $4 - $6 | 0; //@line 11757
 HEAP32[$0 + 108 >> 2] = $7; //@line 11759
 HEAP32[$0 + 100 >> 2] = ($1 | 0) != 0 & ($7 | 0) > ($1 | 0) ? $6 + $1 | 0 : $4; //@line 11768
 return;
}
function _wait_ms($0) {
 $0 = $0 | 0;
 var $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 5137
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 5138
 _emscripten_sleep($0 | 0); //@line 5139
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 124; //@line 5142
  sp = STACKTOP; //@line 5143
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 5146
  return;
 }
}
function ___cxa_get_globals_fast() {
 var $3 = 0, sp = 0;
 sp = STACKTOP; //@line 7177
 STACKTOP = STACKTOP + 16 | 0; //@line 7178
 if (!(_pthread_once(7600, 3) | 0)) {
  $3 = _pthread_getspecific(HEAP32[1901] | 0) | 0; //@line 7184
  STACKTOP = sp; //@line 7185
  return $3 | 0; //@line 7185
 } else {
  _abort_message(6726, sp); //@line 7187
 }
 return 0; //@line 7190
}
function _sscanf($0, $1, $varargs) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $varargs = $varargs | 0;
 var $2 = 0, $3 = 0, sp = 0;
 sp = STACKTOP; //@line 10777
 STACKTOP = STACKTOP + 16 | 0; //@line 10778
 $2 = sp; //@line 10779
 HEAP32[$2 >> 2] = $varargs; //@line 10780
 $3 = _vsscanf($0, $1, $2) | 0; //@line 10781
 STACKTOP = sp; //@line 10782
 return $3 | 0; //@line 10782
}
function __ZNK10__cxxabiv117__class_type_info29process_static_type_below_dstEPNS_19__dynamic_cast_infoEPKvi($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $7 = 0;
 if ((HEAP32[$1 + 4 >> 2] | 0) == ($2 | 0)) {
  $7 = $1 + 28 | 0; //@line 7485
  if ((HEAP32[$7 >> 2] | 0) != 1) {
   HEAP32[$7 >> 2] = $3; //@line 7489
  }
 }
 return;
}
function _nsapi_dns_add_server($0) {
 $0 = $0 | 0;
 _memmove(516, 496, 80) | 0; //@line 3488
 HEAP32[124] = HEAP32[$0 >> 2]; //@line 3489
 HEAP32[125] = HEAP32[$0 + 4 >> 2]; //@line 3489
 HEAP32[126] = HEAP32[$0 + 8 >> 2]; //@line 3489
 HEAP32[127] = HEAP32[$0 + 12 >> 2]; //@line 3489
 HEAP32[128] = HEAP32[$0 + 16 >> 2]; //@line 3489
 return 0; //@line 3490
}
function _emscripten_alloc_async_context(len, sp) {
 len = len | 0;
 sp = sp | 0;
 var new_frame = 0;
 new_frame = stackAlloc(len + 8 | 0) | 0; //@line 3418
 HEAP32[new_frame + 4 >> 2] = sp; //@line 3420
 HEAP32[new_frame >> 2] = ___async_cur_frame; //@line 3422
 ___async_cur_frame = new_frame; //@line 3423
 return ___async_cur_frame + 8 | 0; //@line 3424
}
function __ZThn4_N17EthernetInterface13socket_attachEPvPFvS0_ES0_($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $4 = 0, $5 = 0;
 $4 = $0 + -4 | 0; //@line 952
 $5 = HEAP32[$1 >> 2] | 0; //@line 953
 HEAP32[$4 + 60 + ($5 << 3) >> 2] = $2; //@line 955
 HEAP32[$4 + 60 + ($5 << 3) + 4 >> 2] = $3; //@line 957
 return;
}
function __ZN17EthernetInterface12socket_closeEPv__async_cb($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0;
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 13172
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 13174
 HEAP8[$2 + 8 >> 0] = 0; //@line 13176
 if ($2 | 0) {
  __ZdlPv($2); //@line 13179
 }
 HEAP32[___async_retval >> 2] = $4; //@line 13182
 return;
}
function __ZN10__cxxabiv112_GLOBAL__N_19destruct_EPv($0) {
 $0 = $0 | 0;
 var sp = 0;
 sp = STACKTOP; //@line 7939
 STACKTOP = STACKTOP + 16 | 0; //@line 7940
 _free($0); //@line 7942
 if (!(_pthread_setspecific(HEAP32[1901] | 0, 0) | 0)) {
  STACKTOP = sp; //@line 7947
  return;
 } else {
  _abort_message(6825, sp); //@line 7949
 }
}
function ___cxa_can_catch__async_cb($0) {
 $0 = $0 | 0;
 var $AsyncRetVal = 0;
 $AsyncRetVal = HEAP8[___async_retval >> 0] & 1; //@line 11053
 if ($AsyncRetVal) {
  HEAP32[HEAP32[$0 + 8 >> 2] >> 2] = HEAP32[HEAP32[$0 + 4 >> 2] >> 2]; //@line 11057
 }
 HEAP32[___async_retval >> 2] = $AsyncRetVal & 1; //@line 11060
 return;
}
function _bitshift64Shl(low, high, bits) {
 low = low | 0;
 high = high | 0;
 bits = bits | 0;
 if ((bits | 0) < 32) {
  tempRet0 = high << bits | (low & (1 << bits) - 1 << 32 - bits) >>> 32 - bits; //@line 3407
  return low << bits; //@line 3408
 }
 tempRet0 = low << bits - 32; //@line 3410
 return 0; //@line 3411
}
function _bitshift64Lshr(low, high, bits) {
 low = low | 0;
 high = high | 0;
 bits = bits | 0;
 if ((bits | 0) < 32) {
  tempRet0 = high >>> bits; //@line 3396
  return low >>> bits | (high & (1 << bits) - 1) << 32 - bits; //@line 3397
 }
 tempRet0 = 0; //@line 3399
 return high >>> bits - 32 | 0; //@line 3400
}
function __ZN4mbed8CallbackIFvvEE13function_moveINS2_14method_contextI6SocketMS5_FvvEEEEEvPvPKv($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 HEAP32[$0 >> 2] = HEAP32[$1 >> 2]; //@line 1568
 HEAP32[$0 + 4 >> 2] = HEAP32[$1 + 4 >> 2]; //@line 1568
 HEAP32[$0 + 8 >> 2] = HEAP32[$1 + 8 >> 2]; //@line 1568
 return;
}
function __ZN17EthernetInterface13socket_attachEPvPFvS0_ES0_($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $4 = 0;
 $4 = HEAP32[$1 >> 2] | 0; //@line 547
 HEAP32[$0 + 60 + ($4 << 3) >> 2] = $2; //@line 549
 HEAP32[$0 + 60 + ($4 << 3) + 4 >> 2] = $3; //@line 551
 return;
}
function __ZN10__cxxabiv112_GLOBAL__N_110construct_Ev() {
 var sp = 0;
 sp = STACKTOP; //@line 7924
 STACKTOP = STACKTOP + 16 | 0; //@line 7925
 if (!(_pthread_key_create(7604, 160) | 0)) {
  STACKTOP = sp; //@line 7930
  return;
 } else {
  _abort_message(6775, sp); //@line 7932
 }
}
function _puts__async_cb($0) {
 $0 = $0 | 0;
 var $$lobit = 0;
 $$lobit = HEAP32[___async_retval >> 2] >> 31; //@line 13644
 if (HEAP32[$0 + 4 >> 2] | 0) {
  ___unlockfile(HEAP32[$0 + 8 >> 2] | 0); //@line 13647
 }
 HEAP32[___async_retval >> 2] = $$lobit; //@line 13650
 return;
}
function ___overflow__async_cb($0) {
 $0 = $0 | 0;
 var $$0 = 0;
 if ((HEAP32[___async_retval >> 2] | 0) == 1) {
  $$0 = HEAPU8[HEAP32[$0 + 4 >> 2] >> 0] | 0; //@line 12338
 } else {
  $$0 = -1; //@line 12340
 }
 HEAP32[___async_retval >> 2] = $$0; //@line 12343
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
 return FUNCTION_TABLE_iiiiiii[index & 3](a1 | 0, a2 | 0, a3 | 0, a4 | 0, a5 | 0, a6 | 0) | 0; //@line 3671
}
function ___lctrans_impl($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0 = 0;
 if (!$1) {
  $$0 = 0; //@line 10518
 } else {
  $$0 = ___mo_lookup(HEAP32[$1 >> 2] | 0, HEAP32[$1 + 4 >> 2] | 0, $0) | 0; //@line 10524
 }
 return ($$0 | 0 ? $$0 : $0) | 0; //@line 10528
}
function dynCall_viiiiii(index, a1, a2, a3, a4, a5, a6) {
 index = index | 0;
 a1 = a1 | 0;
 a2 = a2 | 0;
 a3 = a3 | 0;
 a4 = a4 | 0;
 a5 = a5 | 0;
 a6 = a6 | 0;
 FUNCTION_TABLE_viiiiii[index & 3](a1 | 0, a2 | 0, a3 | 0, a4 | 0, a5 | 0, a6 | 0); //@line 3713
}
function _fputc__async_cb($0) {
 $0 = $0 | 0;
 var $AsyncRetVal = 0;
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 12147
 ___unlockfile(HEAP32[$0 + 4 >> 2] | 0); //@line 12148
 HEAP32[___async_retval >> 2] = $AsyncRetVal; //@line 12150
 return;
}
function ___syscall_ret($0) {
 $0 = $0 | 0;
 var $$0 = 0;
 if ($0 >>> 0 > 4294963200) {
  HEAP32[(___errno_location() | 0) >> 2] = 0 - $0; //@line 10066
  $$0 = -1; //@line 10067
 } else {
  $$0 = $0; //@line 10069
 }
 return $$0 | 0; //@line 10071
}
function _gpio_init_out($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 HEAP32[$0 >> 2] = $1; //@line 5067
 if (($1 | 0) == -1) {
  return;
 }
 HEAP32[$0 + 4 >> 2] = $1; //@line 5073
 _emscripten_asm_const_iii(9, $0 | 0, $1 | 0) | 0; //@line 5074
 return;
}
function ___DOUBLE_BITS_677($0) {
 $0 = +$0;
 var $1 = 0;
 HEAPF64[tempDoublePtr >> 3] = $0; //@line 5683
 $1 = HEAP32[tempDoublePtr >> 2] | 0; //@line 5683
 tempRet0 = HEAP32[tempDoublePtr + 4 >> 2] | 0; //@line 5685
 return $1 | 0; //@line 5686
}
function ___DOUBLE_BITS_563($0) {
 $0 = +$0;
 var $1 = 0;
 HEAPF64[tempDoublePtr >> 3] = $0; //@line 2937
 $1 = HEAP32[tempDoublePtr >> 2] | 0; //@line 2937
 tempRet0 = HEAP32[tempDoublePtr + 4 >> 2] | 0; //@line 2939
 return $1 | 0; //@line 2940
}
function __ZN9TCPSocketC2Ev($0) {
 $0 = $0 | 0;
 __ZN6SocketC2Ev($0); //@line 2848
 HEAP32[$0 >> 2] = 456; //@line 2849
 HEAP32[$0 + 52 >> 2] = 0; //@line 2851
 HEAP8[$0 + 56 >> 0] = 0; //@line 2853
 HEAP8[$0 + 57 >> 0] = 0; //@line 2855
 return;
}
function dynCall_iiiiii(index, a1, a2, a3, a4, a5) {
 index = index | 0;
 a1 = a1 | 0;
 a2 = a2 | 0;
 a3 = a3 | 0;
 a4 = a4 | 0;
 a5 = a5 | 0;
 return FUNCTION_TABLE_iiiiii[index & 7](a1 | 0, a2 | 0, a3 | 0, a4 | 0, a5 | 0) | 0; //@line 3664
}
function _i64Subtract(a, b, c, d) {
 a = a | 0;
 b = b | 0;
 c = c | 0;
 d = d | 0;
 var h = 0;
 h = b - d >>> 0; //@line 3147
 h = b - d - (c >>> 0 > a >>> 0 | 0) >>> 0; //@line 3148
 return (tempRet0 = h, a - c >>> 0 | 0) | 0; //@line 3149
}
function dynCall_viiiii(index, a1, a2, a3, a4, a5) {
 index = index | 0;
 a1 = a1 | 0;
 a2 = a2 | 0;
 a3 = a3 | 0;
 a4 = a4 | 0;
 a5 = a5 | 0;
 FUNCTION_TABLE_viiiii[index & 3](a1 | 0, a2 | 0, a3 | 0, a4 | 0, a5 | 0); //@line 3706
}
function ___clang_call_terminate($0) {
 $0 = $0 | 0;
 var sp = 0;
 sp = STACKTOP; //@line 47
 ___cxa_begin_catch($0 | 0) | 0; //@line 48
 _emscripten_alloc_async_context(4, sp) | 0; //@line 49
 __ZSt9terminatev(); //@line 50
}
function __ZThn4_N17EthernetInterface14socket_connectEPvRK13SocketAddress__async_cb($0) {
 $0 = $0 | 0;
 HEAP8[(HEAP32[$0 + 4 >> 2] | 0) + 8 >> 0] = 1; //@line 10287
 HEAP32[___async_retval >> 2] = 0; //@line 10289
 return;
}
function __ZN17EthernetInterface14socket_connectEPvRK13SocketAddress__async_cb($0) {
 $0 = $0 | 0;
 HEAP8[(HEAP32[$0 + 4 >> 2] | 0) + 8 >> 0] = 1; //@line 11640
 HEAP32[___async_retval >> 2] = 0; //@line 11642
 return;
}
function dynCall_iiiii(index, a1, a2, a3, a4) {
 index = index | 0;
 a1 = a1 | 0;
 a2 = a2 | 0;
 a3 = a3 | 0;
 a4 = a4 | 0;
 return FUNCTION_TABLE_iiiii[index & 15](a1 | 0, a2 | 0, a3 | 0, a4 | 0) | 0; //@line 3657
}
function _i64Add(a, b, c, d) {
 a = a | 0;
 b = b | 0;
 c = c | 0;
 d = d | 0;
 var l = 0;
 l = a + c >>> 0; //@line 3139
 return (tempRet0 = b + d + (l >>> 0 < a >>> 0 | 0) >>> 0, l | 0) | 0; //@line 3141
}
function dynCall_viiii(index, a1, a2, a3, a4) {
 index = index | 0;
 a1 = a1 | 0;
 a2 = a2 | 0;
 a3 = a3 | 0;
 a4 = a4 | 0;
 FUNCTION_TABLE_viiii[index & 7](a1 | 0, a2 | 0, a3 | 0, a4 | 0); //@line 3699
}
function stackAlloc(size) {
 size = size | 0;
 var ret = 0;
 ret = STACKTOP; //@line 4
 STACKTOP = STACKTOP + size | 0; //@line 5
 STACKTOP = STACKTOP + 15 & -16; //@line 6
 return ret | 0; //@line 8
}
function _strchr($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $2 = 0;
 $2 = ___strchrnul($0, $1) | 0; //@line 10663
 return ((HEAP8[$2 >> 0] | 0) == ($1 & 255) << 24 >> 24 ? $2 : 0) | 0; //@line 10668
}
function __ZN16NetworkInterface13gethostbynameEPKcP13SocketAddress13nsapi_version__async_cb_5($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = HEAP32[___async_retval >> 2]; //@line 9421
 return;
}
function __ZN12NetworkStack13gethostbynameEPKcP13SocketAddress13nsapi_version__async_cb_65($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = HEAP32[___async_retval >> 2]; //@line 13532
 return;
}
function __ZThn4_N17EthernetInterface13socket_sendtoEPvRK13SocketAddressPKvj__async_cb_54($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = HEAP32[___async_retval >> 2]; //@line 12657
 return;
}
function __ZL24nsapi_dns_query_multipleP12NetworkStackPKcP10nsapi_addrj13nsapi_version__async_cb_77($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = HEAP32[$0 + 8 >> 2]; //@line 2757
 return;
}
function _wctomb($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0 = 0;
 if (!$0) {
  $$0 = 0; //@line 4743
 } else {
  $$0 = _wcrtomb($0, $1, 0) | 0; //@line 4746
 }
 return $$0 | 0; //@line 4748
}
function __ZN17EthernetInterface13socket_sendtoEPvRK13SocketAddressPKvj__async_cb_80($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = HEAP32[___async_retval >> 2]; //@line 3062
 return;
}
function dynCall_iiii(index, a1, a2, a3) {
 index = index | 0;
 a1 = a1 | 0;
 a2 = a2 | 0;
 a3 = a3 | 0;
 return FUNCTION_TABLE_iiii[index & 15](a1 | 0, a2 | 0, a3 | 0) | 0; //@line 3650
}
function _emscripten_free_async_context(ctx) {
 ctx = ctx | 0;
 stackRestore(___async_cur_frame | 0); //@line 3430
 ___async_cur_frame = HEAP32[___async_cur_frame >> 2] | 0; //@line 3431
}
function __ZThn4_N17EthernetInterface15socket_recvfromEPvP13SocketAddressS0_j__async_cb_64($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = HEAP32[$0 + 4 >> 2]; //@line 13483
 return;
}
function _fputs($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $2 = 0;
 $2 = _strlen($0) | 0; //@line 10258
 return ((_fwrite($0, 1, $2, $1) | 0) != ($2 | 0)) << 31 >> 31 | 0; //@line 10262
}
function ___udivdi3($a$0, $a$1, $b$0, $b$1) {
 $a$0 = $a$0 | 0;
 $a$1 = $a$1 | 0;
 $b$0 = $b$0 | 0;
 $b$1 = $b$1 | 0;
 return ___udivmoddi4($a$0, $a$1, $b$0, $b$1, 0) | 0; //@line 3376
}
function ___dynamic_cast__async_cb($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = (HEAP32[HEAP32[$0 + 4 >> 2] >> 2] | 0) == 1 ? HEAP32[$0 + 8 >> 2] | 0 : 0; //@line 9761
 return;
}
function __ZN16NetworkInterface14add_dns_serverERK13SocketAddress__async_cb_26($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = HEAP32[___async_retval >> 2]; //@line 11327
 return;
}
function __ZN17EthernetInterface15socket_recvfromEPvP13SocketAddressS0_j__async_cb_7($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = HEAP32[$0 + 4 >> 2]; //@line 9581
 return;
}
function _emscripten_realloc_async_context(len) {
 len = len | 0;
 stackRestore(___async_cur_frame | 0); //@line 3436
 return (stackAlloc(len + 8 | 0) | 0) + 8 | 0; //@line 3437
}
function _mbsinit($0) {
 $0 = $0 | 0;
 var $4 = 0;
 if (!$0) {
  $4 = 1; //@line 146
 } else {
  $4 = (HEAP32[$0 >> 2] | 0) == 0 & 1; //@line 151
 }
 return $4 | 0; //@line 153
}
function __ZN12NetworkStack10getsockoptEPviiS0_Pj($0, $1, $2, $3, $4, $5) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 $5 = $5 | 0;
 return -3002;
}
function establishStackSpace(stackBase, stackMax) {
 stackBase = stackBase | 0;
 stackMax = stackMax | 0;
 STACKTOP = stackBase; //@line 20
 STACK_MAX = stackMax; //@line 21
}
function __ZN12NetworkStack10setsockoptEPviiPKvj($0, $1, $2, $3, $4, $5) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 $5 = $5 | 0;
 return -3002;
}
function __ZThn4_N17EthernetInterface13socket_sendtoEPvRK13SocketAddressPKvj__async_cb_55($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = -3012; //@line 12665
 return;
}
function b5(p0, p1, p2, p3, p4, p5) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 p3 = p3 | 0;
 p4 = p4 | 0;
 p5 = p5 | 0;
 abort(5); //@line 3732
 return 0; //@line 3732
}
function _swapc($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $3 = 0;
 $3 = _llvm_bswap_i32($0 | 0) | 0; //@line 10654
 return (($1 | 0) == 0 ? $0 : $3) | 0; //@line 10656
}
function __ZN9UDPSocketC2Ev($0) {
 $0 = $0 | 0;
 __ZN6SocketC2Ev($0); //@line 3344
 HEAP32[$0 >> 2] = 480; //@line 3345
 HEAP32[$0 + 52 >> 2] = 0; //@line 3347
 return;
}
function __ZN10__cxxabiv121__vmi_class_type_infoD0Ev($0) {
 $0 = $0 | 0;
 __ZN10__cxxabiv116__shim_type_infoD2Ev($0); //@line 8024
 __ZdlPv($0); //@line 8025
 return;
}
function __ZN17EthernetInterface13socket_sendtoEPvRK13SocketAddressPKvj__async_cb_81($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = -3012; //@line 3070
 return;
}
function __ZN10__cxxabiv120__si_class_type_infoD0Ev($0) {
 $0 = $0 | 0;
 __ZN10__cxxabiv116__shim_type_infoD2Ev($0); //@line 7707
 __ZdlPv($0); //@line 7708
 return;
}
function __ZThn4_N17EthernetInterface13socket_acceptEPvPS0_P13SocketAddress($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 return -3002;
}
function __ZThn4_N17EthernetInterface11socket_sendEPvPKvj__async_cb($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = HEAP32[$0 + 4 >> 2]; //@line 11492
 return;
}
function __ZThn4_N17EthernetInterface11socket_recvEPvS0_j__async_cb($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = HEAP32[$0 + 4 >> 2]; //@line 12176
 return;
}
function __ZN10__cxxabiv117__class_type_infoD0Ev($0) {
 $0 = $0 | 0;
 __ZN10__cxxabiv116__shim_type_infoD2Ev($0); //@line 7235
 __ZdlPv($0); //@line 7236
 return;
}
function ___cxa_is_pointer_type__async_cb($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = (HEAP32[___async_retval >> 2] | 0) != 0 & 1; //@line 10189
 return;
}
function __ZThn4_N17EthernetInterface14get_ip_addressEv__async_cb($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = HEAP32[$0 + 4 >> 2]; //@line 12263
 return;
}
function __ZThn4_N17EthernetInterface11socket_openEPPv14nsapi_protocol__async_cb_52($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = 0; //@line 12323
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
  ___fwritex($1, $2, $0) | 0; //@line 4228
 }
 return;
}
function __ZN17EthernetInterface13socket_acceptEPvPS0_P13SocketAddress($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 return -3002;
}
function __ZN17EthernetInterface11socket_sendEPvPKvj__async_cb($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = HEAP32[$0 + 4 >> 2]; //@line 12353
 return;
}
function dynCall_iii(index, a1, a2) {
 index = index | 0;
 a1 = a1 | 0;
 a2 = a2 | 0;
 return FUNCTION_TABLE_iii[index & 7](a1 | 0, a2 | 0) | 0; //@line 3643
}
function __ZN17EthernetInterface11socket_recvEPvS0_j__async_cb($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = HEAP32[$0 + 4 >> 2]; //@line 9447
 return;
}
function __ZN17EthernetInterface15get_mac_addressEv__async_cb($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = HEAP32[$0 + 4 >> 2]; //@line 9744
 return;
}
function __ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 return ($0 | 0) == ($1 | 0) | 0; //@line 7432
}
function __ZN17EthernetInterface14get_ip_addressEv__async_cb($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = HEAP32[$0 + 4 >> 2]; //@line 9431
 return;
}
function __ZN17EthernetInterface11socket_openEPPv14nsapi_protocol__async_cb_6($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = 0; //@line 9501
 return;
}
function __ZN12NetworkStack11setstackoptEiiPKvj($0, $1, $2, $3, $4) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 return -3002;
}
function __ZN12NetworkStack11getstackoptEiiPvPj($0, $1, $2, $3, $4) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 return -3002;
}
function __ZN17EthernetInterface11get_netmaskEv__async_cb($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = HEAP32[$0 + 4 >> 2]; //@line 13619
 return;
}
function __ZSt15get_new_handlerv() {
 var $0 = 0;
 $0 = HEAP32[1902] | 0; //@line 8797
 HEAP32[1902] = $0 + 0; //@line 8799
 return $0 | 0; //@line 8801
}
function b4(p0, p1, p2, p3, p4) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 p3 = p3 | 0;
 p4 = p4 | 0;
 abort(4); //@line 3729
 return 0; //@line 3729
}
function __ZSt13get_terminatev() {
 var $0 = 0;
 $0 = HEAP32[581] | 0; //@line 8014
 HEAP32[581] = $0 + 0; //@line 8016
 return $0 | 0; //@line 8018
}
function __ZNK10__cxxabiv122__base_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function b11(p0, p1, p2, p3, p4, p5) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 p3 = p3 | 0;
 p4 = p4 | 0;
 p5 = p5 | 0;
 abort(11); //@line 3753
}
function dynCall_vii(index, a1, a2) {
 index = index | 0;
 a1 = a1 | 0;
 a2 = a2 | 0;
 FUNCTION_TABLE_vii[index & 3](a1 | 0, a2 | 0); //@line 3692
}
function __ZNK10__cxxabiv120__si_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function __ZN6Socket11set_timeoutEi($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 HEAP32[$0 + 12 >> 2] = ($1 | 0) > -1 ? $1 : -1; //@line 1660
 return;
}
function __ZN17EthernetInterface11set_networkEPKcS1_S1___async_cb($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = 0; //@line 12199
 return;
}
function __ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function __ZThn4_N17EthernetInterface11socket_bindEPvRK13SocketAddress($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 return -3002;
}
function _llvm_bswap_i32(x) {
 x = x | 0;
 return (x & 255) << 24 | (x >> 8 & 255) << 16 | (x >> 16 & 255) << 8 | x >>> 24 | 0; //@line 3463
}
function __ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_67($0) {
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
function __ZN6Socket5closeEv__async_cb_28($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = HEAP32[$0 + 4 >> 2]; //@line 11407
 return;
}
function __ZN17EthernetInterface11socket_bindEPvRK13SocketAddress($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 return -3002;
}
function b3(p0, p1, p2, p3) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 p3 = p3 | 0;
 abort(3); //@line 3726
 return 0; //@line 3726
}
function _vsprintf__async_cb($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = HEAP32[___async_retval >> 2]; //@line 10299
 return;
}
function _strerror($0) {
 $0 = $0 | 0;
 return ___strerror_l($0, HEAP32[(___pthread_self_85() | 0) + 188 >> 2] | 0) | 0; //@line 4691
}
function _fputc__async_cb_50($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = HEAP32[___async_retval >> 2]; //@line 12160
 return;
}
function _sprintf__async_cb($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = HEAP32[___async_retval >> 2]; //@line 13631
 return;
}
function __ZN6Socket4openEP12NetworkStack__async_cb_61($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = 0; //@line 13137
 return;
}
function __ZN4mbed8CallbackIFvvEE13function_callINS2_14method_contextI6SocketMS5_FvvEEEEEvPKv__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function _printf__async_cb($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = HEAP32[___async_retval >> 2]; //@line 12715
 return;
}
function __ZN17EthernetInterface8set_dhcpEb__async_cb($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = 0; //@line 11630
 return;
}
function dynCall_ii(index, a1) {
 index = index | 0;
 a1 = a1 | 0;
 return FUNCTION_TABLE_ii[index & 15](a1 | 0) | 0; //@line 3636
}
function __Znaj__async_cb($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = HEAP32[___async_retval >> 2]; //@line 10974
 return;
}
function b10(p0, p1, p2, p3, p4) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 p3 = p3 | 0;
 p4 = p4 | 0;
 abort(10); //@line 3750
}
function _do_read($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 return ___string_read($0, $1, $2) | 0; //@line 10811
}
function __ZThn4_N17EthernetInterface13socket_listenEPvi($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 return -3002;
}
function __ZN13SocketAddress8set_portEt($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 HEAP16[$0 + 60 >> 1] = $1; //@line 1692
 return;
}
function __ZSt11__terminatePFvvE__async_cb($0) {
 $0 = $0 | 0;
 _abort_message(6878, HEAP32[$0 + 4 >> 2] | 0); //@line 11741
}
function __ZN17EthernetInterface13socket_listenEPvi($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 return -3002;
}
function __ZN4mbed8CallbackIFvvEE13function_dtorINS2_14method_contextI6SocketMS5_FvvEEEEEvPv($0) {
 $0 = $0 | 0;
 return;
}
function __ZN16NetworkInterface6attachEN4mbed8CallbackIFv11nsapi_eventiEEE($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 return;
}
function dynCall_vi(index, a1) {
 index = index | 0;
 a1 = a1 | 0;
 FUNCTION_TABLE_vi[index & 255](a1 | 0); //@line 3685
}
function b2(p0, p1, p2) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 abort(2); //@line 3723
 return 0; //@line 3723
}
function __ZN9UDPSocketD0Ev__async_cb($0) {
 $0 = $0 | 0;
 __ZdlPv(HEAP32[$0 + 4 >> 2] | 0); //@line 12230
 return;
}
function __ZN9TCPSocketD0Ev__async_cb($0) {
 $0 = $0 | 0;
 __ZdlPv(HEAP32[$0 + 4 >> 2] | 0); //@line 12185
 return;
}
function __ZNK13SocketAddress14get_ip_versionEv($0) {
 $0 = $0 | 0;
 return HEAP32[$0 + 40 >> 2] | 0; //@line 2517
}
function _isspace($0) {
 $0 = $0 | 0;
 return (($0 | 0) == 32 | ($0 + -9 | 0) >>> 0 < 5) & 1 | 0; //@line 10176
}
function b9(p0, p1, p2, p3) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 p3 = p3 | 0;
 abort(9); //@line 3747
}
function ___lctrans($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 return ___lctrans_impl($0, $1) | 0; //@line 5936
}
function __ZNK13SocketAddress8get_portEv($0) {
 $0 = $0 | 0;
 return HEAP16[$0 + 60 >> 1] | 0; //@line 2336
}
function _main__async_cb_19($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = 0; //@line 10701
 return;
}
function __ZThn4_N17EthernetInterfaceD0Ev($0) {
 $0 = $0 | 0;
 __ZdlPv($0 + -4 | 0); //@line 565
 return;
}
function __ZN16NetworkInterface12set_blockingEb($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 return -3002;
}
function b1(p0, p1) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 abort(1); //@line 3720
 return 0; //@line 3720
}
function __ZN17EthernetInterface9get_stackEv($0) {
 $0 = $0 | 0;
 return $0 + 4 | 0; //@line 190
}
function __Z18nsapi_create_stackP12NetworkStack($0) {
 $0 = $0 | 0;
 return $0 | 0; //@line 1192
}
function dynCall_v(index) {
 index = index | 0;
 FUNCTION_TABLE_v[index & 3](); //@line 3678
}
function _mbed_error_printf($0, $varargs) {
 $0 = $0 | 0;
 $varargs = $varargs | 0;
 return;
}
function __ZNK16NetworkInterface21get_connection_statusEv($0) {
 $0 = $0 | 0;
 return -3002;
}
function _isdigit($0) {
 $0 = $0 | 0;
 return ($0 + -48 | 0) >>> 0 < 10 | 0; //@line 10124
}
function __ZN17EthernetInterfaceD0Ev($0) {
 $0 = $0 | 0;
 __ZdlPv($0); //@line 63
 return;
}
function __ZN17EthernetInterface11get_gatewayEv($0) {
 $0 = $0 | 0;
 return 0; //@line 133
}
function __ZN17EthernetInterface10disconnectEv($0) {
 $0 = $0 | 0;
 return 0; //@line 183
}
function __ZN17EthernetInterface7connectEv($0) {
 $0 = $0 | 0;
 return 0; //@line 177
}
function _copysignl($0, $1) {
 $0 = +$0;
 $1 = +$1;
 return +(+_copysign($0, $1));
}
function _scalbnl($0, $1) {
 $0 = +$0;
 $1 = $1 | 0;
 return +(+_scalbn($0, $1));
}
function _abort_message__async_cb_51($0) {
 $0 = $0 | 0;
 _abort(); //@line 12253
}
function __ZNK10__cxxabiv116__shim_type_info5noop2Ev($0) {
 $0 = $0 | 0;
 return;
}
function __ZNK10__cxxabiv116__shim_type_info5noop1Ev($0) {
 $0 = $0 | 0;
 return;
}
function __ZN4mbed8CallbackIFvvEE5thunkEPv__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function setTempRet0(value) {
 value = value | 0;
 tempRet0 = value; //@line 38
}
function b0(p0) {
 p0 = p0 | 0;
 abort(0); //@line 3717
 return 0; //@line 3717
}
function _frexpl($0, $1) {
 $0 = +$0;
 $1 = $1 | 0;
 return +(+_frexp($0, $1));
}
function __ZN9UDPSocket9get_protoEv($0) {
 $0 = $0 | 0;
 return 1; //@line 3306
}
function __ZN9TCPSocket9get_protoEv($0) {
 $0 = $0 | 0;
 return 0; //@line 2810
}
function ___cxa_pure_virtual__wrapper() {
 ___cxa_pure_virtual(); //@line 3738
}
function __ZN10__cxxabiv116__shim_type_infoD2Ev($0) {
 $0 = $0 | 0;
 return;
}
function _fmodl($0, $1) {
 $0 = +$0;
 $1 = +$1;
 return +(+_fmod($0, $1));
}
function ___pthread_self_913() {
 return _pthread_self() | 0; //@line 2961
}
function ___pthread_self_910() {
 return _pthread_self() | 0; //@line 5857
}
function b8(p0, p1) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 abort(8); //@line 3744
}
function ___pthread_self_85() {
 return _pthread_self() | 0; //@line 5863
}
function stackRestore(top) {
 top = top | 0;
 STACKTOP = top; //@line 15
}
function __ZdaPv($0) {
 $0 = $0 | 0;
 __ZdlPv($0); //@line 7061
 return;
}
function __ZN6SocketD0Ev($0) {
 $0 = $0 | 0;
 _llvm_trap(); //@line 1261
}
function __ZdlPv($0) {
 $0 = $0 | 0;
 _free($0); //@line 7054
 return;
}
function __ZThn4_N17EthernetInterfaceD1Ev($0) {
 $0 = $0 | 0;
 return;
}
function __ZN9UDPSocket5eventEv__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function __ZN9TCPSocket5eventEv__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function _mbed_assert_internal__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function __ZN9UDPSocketD2Ev__async_cb_33($0) {
 $0 = $0 | 0;
 return;
}
function __ZN9TCPSocketD2Ev__async_cb_30($0) {
 $0 = $0 | 0;
 return;
}
function _handle_interrupt_in($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
}
function __ZN6SocketD2Ev__async_cb_32($0) {
 $0 = $0 | 0;
 return;
}
function _dummy($0) {
 $0 = $0 | 0;
 return $0 | 0; //@line 10082
}
function ___lockfile($0) {
 $0 = $0 | 0;
 return 0; //@line 10310
}
function __ZN17EthernetInterfaceD2Ev($0) {
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
function ___errno_location() {
 return 7592; //@line 10076
}
function __ZSt9terminatev__async_cb_66($0) {
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
function b7(p0) {
 p0 = p0 | 0;
 abort(7); //@line 3741
}
function _core_util_critical_section_enter() {
 return;
}
function __ZSt9terminatev__async_cb($0) {
 $0 = $0 | 0;
}
function _pthread_self() {
 return 1916; //@line 10129
}
function ___unlockfile($0) {
 $0 = $0 | 0;
 return;
}
function setAsync() {
 ___async = 1; //@line 25
}
function b6() {
 abort(6); //@line 3735
}

// EMSCRIPTEN_END_FUNCS
var FUNCTION_TABLE_ii = [b0,__ZN17EthernetInterface15get_mac_addressEv,__ZN17EthernetInterface14get_ip_addressEv,__ZN17EthernetInterface11get_netmaskEv,__ZN17EthernetInterface11get_gatewayEv,__ZN17EthernetInterface7connectEv,__ZN17EthernetInterface10disconnectEv,__ZNK16NetworkInterface21get_connection_statusEv,__ZN17EthernetInterface9get_stackEv,__ZThn4_N17EthernetInterface14get_ip_addressEv,__ZN9TCPSocket9get_protoEv,__ZN9UDPSocket9get_protoEv,___stdio_close,b0,b0,b0];
var FUNCTION_TABLE_iii = [b1,__ZN17EthernetInterface8set_dhcpEb,__ZN16NetworkInterface14add_dns_serverERK13SocketAddress,__ZN16NetworkInterface12set_blockingEb,__ZN17EthernetInterface12socket_closeEPv,__ZN12NetworkStack14add_dns_serverERK13SocketAddress,__ZThn4_N17EthernetInterface12socket_closeEPv,b1];
var FUNCTION_TABLE_iiii = [b2,__ZN17EthernetInterface11socket_openEPPv14nsapi_protocol,__ZN17EthernetInterface11socket_bindEPvRK13SocketAddress,__ZN17EthernetInterface13socket_listenEPvi,__ZN17EthernetInterface14socket_connectEPvRK13SocketAddress,__ZThn4_N17EthernetInterface11socket_openEPPv14nsapi_protocol,__ZThn4_N17EthernetInterface11socket_bindEPvRK13SocketAddress,__ZThn4_N17EthernetInterface13socket_listenEPvi,__ZThn4_N17EthernetInterface14socket_connectEPvRK13SocketAddress,___stdio_write,___stdio_seek,___stdout_write,_sn_write,__ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv,_do_read,b2];
var FUNCTION_TABLE_iiiii = [b3,__ZN17EthernetInterface11set_networkEPKcS1_S1_,__ZN16NetworkInterface13gethostbynameEPKcP13SocketAddress13nsapi_version,__ZN17EthernetInterface13socket_acceptEPvPS0_P13SocketAddress,__ZN17EthernetInterface11socket_sendEPvPKvj,__ZN17EthernetInterface11socket_recvEPvS0_j,__ZN12NetworkStack13gethostbynameEPKcP13SocketAddress13nsapi_version,__ZThn4_N17EthernetInterface13socket_acceptEPvPS0_P13SocketAddress,__ZThn4_N17EthernetInterface11socket_sendEPvPKvj,__ZThn4_N17EthernetInterface11socket_recvEPvS0_j,b3,b3,b3,b3,b3,b3];
var FUNCTION_TABLE_iiiiii = [b4,__ZN17EthernetInterface13socket_sendtoEPvRK13SocketAddressPKvj,__ZN17EthernetInterface15socket_recvfromEPvP13SocketAddressS0_j,__ZN12NetworkStack11setstackoptEiiPKvj,__ZN12NetworkStack11getstackoptEiiPvPj,__ZThn4_N17EthernetInterface13socket_sendtoEPvRK13SocketAddressPKvj,__ZThn4_N17EthernetInterface15socket_recvfromEPvP13SocketAddressS0_j,b4];
var FUNCTION_TABLE_iiiiiii = [b5,__ZN12NetworkStack10setsockoptEPviiPKvj,__ZN12NetworkStack10getsockoptEPviiS0_Pj,b5];
var FUNCTION_TABLE_v = [b6,___cxa_pure_virtual__wrapper,__ZL25default_terminate_handlerv,__ZN10__cxxabiv112_GLOBAL__N_110construct_Ev];
var FUNCTION_TABLE_vi = [b7,__ZN17EthernetInterfaceD2Ev,__ZN17EthernetInterfaceD0Ev,__ZThn4_N17EthernetInterfaceD1Ev,__ZThn4_N17EthernetInterfaceD0Ev,__ZN6SocketD2Ev,__ZN6SocketD0Ev,__ZN4mbed8CallbackIFvvEE13function_callINS2_14method_contextI6SocketMS5_FvvEEEEEvPKv,__ZN4mbed8CallbackIFvvEE13function_dtorINS2_14method_contextI6SocketMS5_FvvEEEEEvPv,__ZN9TCPSocketD2Ev,__ZN9TCPSocketD0Ev,__ZN9TCPSocket5eventEv,__ZN9UDPSocketD2Ev,__ZN9UDPSocketD0Ev,__ZN9UDPSocket5eventEv,__ZN10__cxxabiv116__shim_type_infoD2Ev,__ZN10__cxxabiv117__class_type_infoD0Ev,__ZNK10__cxxabiv116__shim_type_info5noop1Ev,__ZNK10__cxxabiv116__shim_type_info5noop2Ev,__ZN10__cxxabiv120__si_class_type_infoD0Ev,__ZN10__cxxabiv121__vmi_class_type_infoD0Ev,__ZN17EthernetInterface15get_mac_addressEv__async_cb,__ZN17EthernetInterface14get_ip_addressEv__async_cb,__ZN17EthernetInterface11get_netmaskEv__async_cb,__ZN17EthernetInterface11set_networkEPKcS1_S1___async_cb,__ZN17EthernetInterface8set_dhcpEb__async_cb,__ZN17EthernetInterface11socket_openEPPv14nsapi_protocol__async_cb,__ZN17EthernetInterface11socket_openEPPv14nsapi_protocol__async_cb_6,__ZN17EthernetInterface12socket_closeEPv__async_cb
,__ZN17EthernetInterface14socket_connectEPvRK13SocketAddress__async_cb,__ZN17EthernetInterface11socket_sendEPvPKvj__async_cb,__ZN17EthernetInterface11socket_recvEPvS0_j__async_cb,__ZN17EthernetInterface13socket_sendtoEPvRK13SocketAddressPKvj__async_cb_81,__ZN17EthernetInterface13socket_sendtoEPvRK13SocketAddressPKvj__async_cb,__ZN17EthernetInterface13socket_sendtoEPvRK13SocketAddressPKvj__async_cb_82,__ZN17EthernetInterface13socket_sendtoEPvRK13SocketAddressPKvj__async_cb_80,__ZN17EthernetInterface15socket_recvfromEPvP13SocketAddressS0_j__async_cb,__ZN17EthernetInterface15socket_recvfromEPvP13SocketAddressS0_j__async_cb_7,__ZThn4_N17EthernetInterface14get_ip_addressEv__async_cb,__ZThn4_N17EthernetInterface11socket_openEPPv14nsapi_protocol__async_cb,__ZThn4_N17EthernetInterface11socket_openEPPv14nsapi_protocol__async_cb_52,__ZThn4_N17EthernetInterface12socket_closeEPv__async_cb,__ZThn4_N17EthernetInterface14socket_connectEPvRK13SocketAddress__async_cb,__ZThn4_N17EthernetInterface11socket_sendEPvPKvj__async_cb,__ZThn4_N17EthernetInterface11socket_recvEPvS0_j__async_cb,__ZThn4_N17EthernetInterface13socket_sendtoEPvRK13SocketAddressPKvj__async_cb_55,__ZThn4_N17EthernetInterface13socket_sendtoEPvRK13SocketAddressPKvj__async_cb,__ZThn4_N17EthernetInterface13socket_sendtoEPvRK13SocketAddressPKvj__async_cb_56,__ZThn4_N17EthernetInterface13socket_sendtoEPvRK13SocketAddressPKvj__async_cb_54,__ZThn4_N17EthernetInterface15socket_recvfromEPvP13SocketAddressS0_j__async_cb,__ZThn4_N17EthernetInterface15socket_recvfromEPvP13SocketAddressS0_j__async_cb_64,__ZN16NetworkInterface13gethostbynameEPKcP13SocketAddress13nsapi_version__async_cb,__ZN16NetworkInterface13gethostbynameEPKcP13SocketAddress13nsapi_version__async_cb_5,__ZN16NetworkInterface14add_dns_serverERK13SocketAddress__async_cb,__ZN16NetworkInterface14add_dns_serverERK13SocketAddress__async_cb_26,__ZN12NetworkStack13gethostbynameEPKcP13SocketAddress13nsapi_version__async_cb,__ZN12NetworkStack13gethostbynameEPKcP13SocketAddress13nsapi_version__async_cb_65,__ZN6SocketD2Ev__async_cb,__ZN6SocketD2Ev__async_cb_32
,__ZN6Socket4openEP12NetworkStack__async_cb,__ZN6Socket4openEP12NetworkStack__async_cb_57,__ZN6Socket4openEP12NetworkStack__async_cb_58,__ZN6Socket4openEP12NetworkStack__async_cb_59,__ZN6Socket4openEP12NetworkStack__async_cb_60,__ZN4mbed8CallbackIFvvEE5thunkEPv,__ZN6Socket4openEP12NetworkStack__async_cb_61,__ZN4mbed8CallbackIFvvEE5thunkEPv__async_cb_12,__ZN4mbed8CallbackIFvvEE5thunkEPv__async_cb,__ZN4mbed8CallbackIFvvEE13function_callINS2_14method_contextI6SocketMS5_FvvEEEEEvPKv__async_cb,__ZN6Socket5closeEv__async_cb,__ZN6Socket5closeEv__async_cb_27,__ZN6Socket5closeEv__async_cb_28,__ZN9TCPSocketD2Ev__async_cb_31,__ZN9TCPSocketD2Ev__async_cb,__ZN9TCPSocketD2Ev__async_cb_30,__ZN9TCPSocketD0Ev__async_cb,__ZN9TCPSocket5eventEv__async_cb,__ZN9TCPSocket7connectEPKct__async_cb,__ZN9TCPSocket7connectEPKct__async_cb_11,__ZN9TCPSocket7connectEPKct__async_cb_10,__ZN9TCPSocket4sendEPKvj__async_cb_53,__ZN9TCPSocket4sendEPKvj__async_cb,__ZN9TCPSocket4recvEPvj__async_cb_62,__ZN9TCPSocket4recvEPvj__async_cb,__ZN9UDPSocketD2Ev__async_cb_34,__ZN9UDPSocketD2Ev__async_cb,__ZN9UDPSocketD2Ev__async_cb_33,__ZN9UDPSocketD0Ev__async_cb,__ZN9UDPSocket5eventEv__async_cb
,__ZN9UDPSocket6sendtoERK13SocketAddressPKvj__async_cb,__ZN9UDPSocket8recvfromEP13SocketAddressPvj__async_cb,__ZL24nsapi_dns_query_multipleP12NetworkStackPKcP10nsapi_addrj13nsapi_version__async_cb_79,__ZL24nsapi_dns_query_multipleP12NetworkStackPKcP10nsapi_addrj13nsapi_version__async_cb_76,__ZL24nsapi_dns_query_multipleP12NetworkStackPKcP10nsapi_addrj13nsapi_version__async_cb_71,__ZL24nsapi_dns_query_multipleP12NetworkStackPKcP10nsapi_addrj13nsapi_version__async_cb_78,__ZL24nsapi_dns_query_multipleP12NetworkStackPKcP10nsapi_addrj13nsapi_version__async_cb_77,__ZL24nsapi_dns_query_multipleP12NetworkStackPKcP10nsapi_addrj13nsapi_version__async_cb_75,__ZL24nsapi_dns_query_multipleP12NetworkStackPKcP10nsapi_addrj13nsapi_version__async_cb_70,__ZL24nsapi_dns_query_multipleP12NetworkStackPKcP10nsapi_addrj13nsapi_version__async_cb_74,__ZL24nsapi_dns_query_multipleP12NetworkStackPKcP10nsapi_addrj13nsapi_version__async_cb_69,__ZL24nsapi_dns_query_multipleP12NetworkStackPKcP10nsapi_addrj13nsapi_version__async_cb_73,__ZL24nsapi_dns_query_multipleP12NetworkStackPKcP10nsapi_addrj13nsapi_version__async_cb_68,__ZL24nsapi_dns_query_multipleP12NetworkStackPKcP10nsapi_addrj13nsapi_version__async_cb_72,__ZL24nsapi_dns_query_multipleP12NetworkStackPKcP10nsapi_addrj13nsapi_version__async_cb,__Z15nsapi_dns_queryP12NetworkStackPKcP13SocketAddress13nsapi_version__async_cb,_mbed_assert_internal__async_cb,_mbed_die__async_cb_49,_mbed_die__async_cb_48,_mbed_die__async_cb_47,_mbed_die__async_cb_46,_mbed_die__async_cb_45,_mbed_die__async_cb_44,_mbed_die__async_cb_43,_mbed_die__async_cb_42,_mbed_die__async_cb_41,_mbed_die__async_cb_40,_mbed_die__async_cb_39,_mbed_die__async_cb_38,_mbed_die__async_cb_37
,_mbed_die__async_cb_36,_mbed_die__async_cb_35,_mbed_die__async_cb,_invoke_ticker__async_cb_24,_invoke_ticker__async_cb,_wait_ms__async_cb,_main__async_cb_15,_main__async_cb_23,_main__async_cb_22,_main__async_cb,_main__async_cb_21,_main__async_cb_18,_main__async_cb_13,_main__async_cb_17,_main__async_cb_16,_main__async_cb_20,_main__async_cb_14,_main__async_cb_19,___overflow__async_cb,_vfprintf__async_cb,_vsnprintf__async_cb,_sprintf__async_cb,_vsprintf__async_cb,_printf__async_cb,_fputc__async_cb_50,_fputc__async_cb,_puts__async_cb,__Znwj__async_cb,__Znaj__async_cb,__ZL25default_terminate_handlerv__async_cb
,__ZL25default_terminate_handlerv__async_cb_8,_abort_message__async_cb,_abort_message__async_cb_51,__ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv__async_cb_29,__ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv__async_cb,___dynamic_cast__async_cb,___dynamic_cast__async_cb_9,__ZNK10__cxxabiv120__si_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb,__ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb,__ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_67,__ZNK10__cxxabiv120__si_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb,__ZN10__cxxabiv112_GLOBAL__N_19destruct_EPv,__ZSt11__terminatePFvvE__async_cb,__ZNK10__cxxabiv121__vmi_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb_25,__ZNK10__cxxabiv121__vmi_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb,__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_4,__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_3,__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_2,__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_1,__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb,__ZNK10__cxxabiv121__vmi_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb_63,__ZNK10__cxxabiv121__vmi_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb,__ZNK10__cxxabiv122__base_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb,__ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb,__ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb,___cxa_can_catch__async_cb,___cxa_is_pointer_type__async_cb,b7,b7,b7
,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7
,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7
,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7];
var FUNCTION_TABLE_vii = [b8,__ZN16NetworkInterface6attachEN4mbed8CallbackIFv11nsapi_eventiEEE,__ZN4mbed8CallbackIFvvEE13function_moveINS2_14method_contextI6SocketMS5_FvvEEEEEvPvPKv,b8];
var FUNCTION_TABLE_viiii = [b9,__ZN17EthernetInterface13socket_attachEPvPFvS0_ES0_,__ZThn4_N17EthernetInterface13socket_attachEPvPFvS0_ES0_,__ZNK10__cxxabiv117__class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi,__ZNK10__cxxabiv120__si_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi,__ZNK10__cxxabiv121__vmi_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi,b9,b9];
var FUNCTION_TABLE_viiiii = [b10,__ZNK10__cxxabiv117__class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib,__ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib,__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib];
var FUNCTION_TABLE_viiiiii = [b11,__ZNK10__cxxabiv117__class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib,__ZNK10__cxxabiv120__si_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib,__ZNK10__cxxabiv121__vmi_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib];

  return { ___cxa_can_catch: ___cxa_can_catch, ___cxa_is_pointer_type: ___cxa_is_pointer_type, ___errno_location: ___errno_location, ___muldi3: ___muldi3, ___udivdi3: ___udivdi3, ___uremdi3: ___uremdi3, _bitshift64Lshr: _bitshift64Lshr, _bitshift64Shl: _bitshift64Shl, _emscripten_alloc_async_context: _emscripten_alloc_async_context, _emscripten_async_resume: _emscripten_async_resume, _emscripten_free_async_context: _emscripten_free_async_context, _emscripten_realloc_async_context: _emscripten_realloc_async_context, _free: _free, _handle_interrupt_in: _handle_interrupt_in, _i64Add: _i64Add, _i64Subtract: _i64Subtract, _invoke_ticker: _invoke_ticker, _llvm_bswap_i32: _llvm_bswap_i32, _main: _main, _malloc: _malloc, _memcpy: _memcpy, _memmove: _memmove, _memset: _memset, _sbrk: _sbrk, dynCall_ii: dynCall_ii, dynCall_iii: dynCall_iii, dynCall_iiii: dynCall_iiii, dynCall_iiiii: dynCall_iiiii, dynCall_iiiiii: dynCall_iiiiii, dynCall_iiiiiii: dynCall_iiiiiii, dynCall_v: dynCall_v, dynCall_vi: dynCall_vi, dynCall_vii: dynCall_vii, dynCall_viiii: dynCall_viiii, dynCall_viiiii: dynCall_viiiii, dynCall_viiiiii: dynCall_viiiiii, establishStackSpace: establishStackSpace, getTempRet0: getTempRet0, runPostSets: runPostSets, setAsync: setAsync, setTempRet0: setTempRet0, setThrew: setThrew, stackAlloc: stackAlloc, stackRestore: stackRestore, stackSave: stackSave };
})
// EMSCRIPTEN_END_ASM
(Module.asmGlobalArg, Module.asmLibraryArg, buffer);

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
var _memmove = Module["_memmove"] = asm["_memmove"];
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
var dynCall_iiiii = Module["dynCall_iiiii"] = asm["dynCall_iiiii"];
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






//# sourceMappingURL=network.js.map
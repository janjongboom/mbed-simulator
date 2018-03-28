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
 function($0, $1, $2, $3) { MbedJSHal.gpio.init_pwmout($0, $1, $2, $3); },
 function($0) { return MbedJSHal.gpio.read($0); }];

function _emscripten_asm_const_iii(code, a0, a1) {
  return ASM_CONSTS[code](a0, a1);
}

function _emscripten_asm_const_iiiii(code, a0, a1, a2, a3) {
  return ASM_CONSTS[code](a0, a1, a2, a3);
}

function _emscripten_asm_const_ii(code, a0) {
  return ASM_CONSTS[code](a0);
}




STATIC_BASE = GLOBAL_BASE;

STATICTOP = STATIC_BASE + 5088;
/* global initializers */  __ATINIT__.push({ func: function() { __GLOBAL__sub_I_main_cpp() } });


memoryInitializer = "pwmout.js.mem";





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

Module.asmLibraryArg = { "abort": abort, "assert": assert, "enlargeMemory": enlargeMemory, "getTotalMemory": getTotalMemory, "abortOnCannotGrowMemory": abortOnCannotGrowMemory, "invoke_ii": invoke_ii, "invoke_iiii": invoke_iiii, "invoke_vi": invoke_vi, "invoke_viiii": invoke_viiii, "invoke_viiiii": invoke_viiiii, "invoke_viiiiii": invoke_viiiiii, "___setErrNo": ___setErrNo, "___syscall140": ___syscall140, "___syscall146": ___syscall146, "___syscall54": ___syscall54, "___syscall6": ___syscall6, "_abort": _abort, "_emscripten_asm_const_ii": _emscripten_asm_const_ii, "_emscripten_asm_const_iii": _emscripten_asm_const_iii, "_emscripten_asm_const_iiiii": _emscripten_asm_const_iiiii, "_emscripten_get_now": _emscripten_get_now, "_emscripten_memcpy_big": _emscripten_memcpy_big, "_emscripten_set_main_loop": _emscripten_set_main_loop, "_emscripten_set_main_loop_timing": _emscripten_set_main_loop_timing, "_emscripten_sleep": _emscripten_sleep, "flush_NO_FILESYSTEM": flush_NO_FILESYSTEM, "DYNAMICTOP_PTR": DYNAMICTOP_PTR, "tempDoublePtr": tempDoublePtr, "ABORT": ABORT, "STACKTOP": STACKTOP, "STACK_MAX": STACK_MAX, "cttz_i8": cttz_i8, "___async": ___async, "___async_unwind": ___async_unwind, "___async_retval": ___async_retval, "___async_cur_frame": ___async_cur_frame };
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
  var _emscripten_asm_const_iiiii=env._emscripten_asm_const_iiiii;
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
 sp = STACKTOP; //@line 642
 STACKTOP = STACKTOP + 16 | 0; //@line 643
 $1 = sp; //@line 644
 do {
  if ($0 >>> 0 < 245) {
   $6 = $0 >>> 0 < 11 ? 16 : $0 + 11 & -8; //@line 651
   $7 = $6 >>> 3; //@line 652
   $8 = HEAP32[872] | 0; //@line 653
   $9 = $8 >>> $7; //@line 654
   if ($9 & 3 | 0) {
    $14 = ($9 & 1 ^ 1) + $7 | 0; //@line 660
    $16 = 3528 + ($14 << 1 << 2) | 0; //@line 662
    $17 = $16 + 8 | 0; //@line 663
    $18 = HEAP32[$17 >> 2] | 0; //@line 664
    $19 = $18 + 8 | 0; //@line 665
    $20 = HEAP32[$19 >> 2] | 0; //@line 666
    do {
     if (($20 | 0) == ($16 | 0)) {
      HEAP32[872] = $8 & ~(1 << $14); //@line 673
     } else {
      if ((HEAP32[876] | 0) >>> 0 > $20 >>> 0) {
       _abort(); //@line 678
      }
      $27 = $20 + 12 | 0; //@line 681
      if ((HEAP32[$27 >> 2] | 0) == ($18 | 0)) {
       HEAP32[$27 >> 2] = $16; //@line 685
       HEAP32[$17 >> 2] = $20; //@line 686
       break;
      } else {
       _abort(); //@line 689
      }
     }
    } while (0);
    $30 = $14 << 3; //@line 694
    HEAP32[$18 + 4 >> 2] = $30 | 3; //@line 697
    $34 = $18 + $30 + 4 | 0; //@line 699
    HEAP32[$34 >> 2] = HEAP32[$34 >> 2] | 1; //@line 702
    $$0 = $19; //@line 703
    STACKTOP = sp; //@line 704
    return $$0 | 0; //@line 704
   }
   $37 = HEAP32[874] | 0; //@line 706
   if ($6 >>> 0 > $37 >>> 0) {
    if ($9 | 0) {
     $41 = 2 << $7; //@line 712
     $44 = $9 << $7 & ($41 | 0 - $41); //@line 715
     $47 = ($44 & 0 - $44) + -1 | 0; //@line 718
     $49 = $47 >>> 12 & 16; //@line 720
     $50 = $47 >>> $49; //@line 721
     $52 = $50 >>> 5 & 8; //@line 723
     $54 = $50 >>> $52; //@line 725
     $56 = $54 >>> 2 & 4; //@line 727
     $58 = $54 >>> $56; //@line 729
     $60 = $58 >>> 1 & 2; //@line 731
     $62 = $58 >>> $60; //@line 733
     $64 = $62 >>> 1 & 1; //@line 735
     $67 = ($52 | $49 | $56 | $60 | $64) + ($62 >>> $64) | 0; //@line 738
     $69 = 3528 + ($67 << 1 << 2) | 0; //@line 740
     $70 = $69 + 8 | 0; //@line 741
     $71 = HEAP32[$70 >> 2] | 0; //@line 742
     $72 = $71 + 8 | 0; //@line 743
     $73 = HEAP32[$72 >> 2] | 0; //@line 744
     do {
      if (($73 | 0) == ($69 | 0)) {
       $77 = $8 & ~(1 << $67); //@line 750
       HEAP32[872] = $77; //@line 751
       $98 = $77; //@line 752
      } else {
       if ((HEAP32[876] | 0) >>> 0 > $73 >>> 0) {
        _abort(); //@line 757
       }
       $80 = $73 + 12 | 0; //@line 760
       if ((HEAP32[$80 >> 2] | 0) == ($71 | 0)) {
        HEAP32[$80 >> 2] = $69; //@line 764
        HEAP32[$70 >> 2] = $73; //@line 765
        $98 = $8; //@line 766
        break;
       } else {
        _abort(); //@line 769
       }
      }
     } while (0);
     $83 = $67 << 3; //@line 774
     $84 = $83 - $6 | 0; //@line 775
     HEAP32[$71 + 4 >> 2] = $6 | 3; //@line 778
     $87 = $71 + $6 | 0; //@line 779
     HEAP32[$87 + 4 >> 2] = $84 | 1; //@line 782
     HEAP32[$71 + $83 >> 2] = $84; //@line 784
     if ($37 | 0) {
      $92 = HEAP32[877] | 0; //@line 787
      $93 = $37 >>> 3; //@line 788
      $95 = 3528 + ($93 << 1 << 2) | 0; //@line 790
      $96 = 1 << $93; //@line 791
      if (!($98 & $96)) {
       HEAP32[872] = $98 | $96; //@line 796
       $$0199 = $95; //@line 798
       $$pre$phiZ2D = $95 + 8 | 0; //@line 798
      } else {
       $101 = $95 + 8 | 0; //@line 800
       $102 = HEAP32[$101 >> 2] | 0; //@line 801
       if ((HEAP32[876] | 0) >>> 0 > $102 >>> 0) {
        _abort(); //@line 805
       } else {
        $$0199 = $102; //@line 808
        $$pre$phiZ2D = $101; //@line 808
       }
      }
      HEAP32[$$pre$phiZ2D >> 2] = $92; //@line 811
      HEAP32[$$0199 + 12 >> 2] = $92; //@line 813
      HEAP32[$92 + 8 >> 2] = $$0199; //@line 815
      HEAP32[$92 + 12 >> 2] = $95; //@line 817
     }
     HEAP32[874] = $84; //@line 819
     HEAP32[877] = $87; //@line 820
     $$0 = $72; //@line 821
     STACKTOP = sp; //@line 822
     return $$0 | 0; //@line 822
    }
    $108 = HEAP32[873] | 0; //@line 824
    if (!$108) {
     $$0197 = $6; //@line 827
    } else {
     $112 = ($108 & 0 - $108) + -1 | 0; //@line 831
     $114 = $112 >>> 12 & 16; //@line 833
     $115 = $112 >>> $114; //@line 834
     $117 = $115 >>> 5 & 8; //@line 836
     $119 = $115 >>> $117; //@line 838
     $121 = $119 >>> 2 & 4; //@line 840
     $123 = $119 >>> $121; //@line 842
     $125 = $123 >>> 1 & 2; //@line 844
     $127 = $123 >>> $125; //@line 846
     $129 = $127 >>> 1 & 1; //@line 848
     $134 = HEAP32[3792 + (($117 | $114 | $121 | $125 | $129) + ($127 >>> $129) << 2) >> 2] | 0; //@line 853
     $138 = (HEAP32[$134 + 4 >> 2] & -8) - $6 | 0; //@line 857
     $143 = HEAP32[$134 + 16 + (((HEAP32[$134 + 16 >> 2] | 0) == 0 & 1) << 2) >> 2] | 0; //@line 863
     if (!$143) {
      $$0192$lcssa$i = $134; //@line 866
      $$0193$lcssa$i = $138; //@line 866
     } else {
      $$01926$i = $134; //@line 868
      $$01935$i = $138; //@line 868
      $146 = $143; //@line 868
      while (1) {
       $149 = (HEAP32[$146 + 4 >> 2] & -8) - $6 | 0; //@line 873
       $150 = $149 >>> 0 < $$01935$i >>> 0; //@line 874
       $$$0193$i = $150 ? $149 : $$01935$i; //@line 875
       $$$0192$i = $150 ? $146 : $$01926$i; //@line 876
       $146 = HEAP32[$146 + 16 + (((HEAP32[$146 + 16 >> 2] | 0) == 0 & 1) << 2) >> 2] | 0; //@line 882
       if (!$146) {
        $$0192$lcssa$i = $$$0192$i; //@line 885
        $$0193$lcssa$i = $$$0193$i; //@line 885
        break;
       } else {
        $$01926$i = $$$0192$i; //@line 888
        $$01935$i = $$$0193$i; //@line 888
       }
      }
     }
     $157 = HEAP32[876] | 0; //@line 892
     if ($157 >>> 0 > $$0192$lcssa$i >>> 0) {
      _abort(); //@line 895
     }
     $159 = $$0192$lcssa$i + $6 | 0; //@line 898
     if ($159 >>> 0 <= $$0192$lcssa$i >>> 0) {
      _abort(); //@line 901
     }
     $162 = HEAP32[$$0192$lcssa$i + 24 >> 2] | 0; //@line 905
     $164 = HEAP32[$$0192$lcssa$i + 12 >> 2] | 0; //@line 907
     do {
      if (($164 | 0) == ($$0192$lcssa$i | 0)) {
       $175 = $$0192$lcssa$i + 20 | 0; //@line 911
       $176 = HEAP32[$175 >> 2] | 0; //@line 912
       if (!$176) {
        $178 = $$0192$lcssa$i + 16 | 0; //@line 915
        $179 = HEAP32[$178 >> 2] | 0; //@line 916
        if (!$179) {
         $$3$i = 0; //@line 919
         break;
        } else {
         $$1196$i = $179; //@line 922
         $$1198$i = $178; //@line 922
        }
       } else {
        $$1196$i = $176; //@line 925
        $$1198$i = $175; //@line 925
       }
       while (1) {
        $181 = $$1196$i + 20 | 0; //@line 928
        $182 = HEAP32[$181 >> 2] | 0; //@line 929
        if ($182 | 0) {
         $$1196$i = $182; //@line 932
         $$1198$i = $181; //@line 932
         continue;
        }
        $184 = $$1196$i + 16 | 0; //@line 935
        $185 = HEAP32[$184 >> 2] | 0; //@line 936
        if (!$185) {
         break;
        } else {
         $$1196$i = $185; //@line 941
         $$1198$i = $184; //@line 941
        }
       }
       if ($157 >>> 0 > $$1198$i >>> 0) {
        _abort(); //@line 946
       } else {
        HEAP32[$$1198$i >> 2] = 0; //@line 949
        $$3$i = $$1196$i; //@line 950
        break;
       }
      } else {
       $167 = HEAP32[$$0192$lcssa$i + 8 >> 2] | 0; //@line 955
       if ($157 >>> 0 > $167 >>> 0) {
        _abort(); //@line 958
       }
       $169 = $167 + 12 | 0; //@line 961
       if ((HEAP32[$169 >> 2] | 0) != ($$0192$lcssa$i | 0)) {
        _abort(); //@line 965
       }
       $172 = $164 + 8 | 0; //@line 968
       if ((HEAP32[$172 >> 2] | 0) == ($$0192$lcssa$i | 0)) {
        HEAP32[$169 >> 2] = $164; //@line 972
        HEAP32[$172 >> 2] = $167; //@line 973
        $$3$i = $164; //@line 974
        break;
       } else {
        _abort(); //@line 977
       }
      }
     } while (0);
     L73 : do {
      if ($162 | 0) {
       $190 = HEAP32[$$0192$lcssa$i + 28 >> 2] | 0; //@line 986
       $191 = 3792 + ($190 << 2) | 0; //@line 987
       do {
        if (($$0192$lcssa$i | 0) == (HEAP32[$191 >> 2] | 0)) {
         HEAP32[$191 >> 2] = $$3$i; //@line 992
         if (!$$3$i) {
          HEAP32[873] = $108 & ~(1 << $190); //@line 998
          break L73;
         }
        } else {
         if ((HEAP32[876] | 0) >>> 0 > $162 >>> 0) {
          _abort(); //@line 1005
         } else {
          HEAP32[$162 + 16 + (((HEAP32[$162 + 16 >> 2] | 0) != ($$0192$lcssa$i | 0) & 1) << 2) >> 2] = $$3$i; //@line 1013
          if (!$$3$i) {
           break L73;
          } else {
           break;
          }
         }
        }
       } while (0);
       $204 = HEAP32[876] | 0; //@line 1023
       if ($204 >>> 0 > $$3$i >>> 0) {
        _abort(); //@line 1026
       }
       HEAP32[$$3$i + 24 >> 2] = $162; //@line 1030
       $208 = HEAP32[$$0192$lcssa$i + 16 >> 2] | 0; //@line 1032
       do {
        if ($208 | 0) {
         if ($204 >>> 0 > $208 >>> 0) {
          _abort(); //@line 1038
         } else {
          HEAP32[$$3$i + 16 >> 2] = $208; //@line 1042
          HEAP32[$208 + 24 >> 2] = $$3$i; //@line 1044
          break;
         }
        }
       } while (0);
       $214 = HEAP32[$$0192$lcssa$i + 20 >> 2] | 0; //@line 1050
       if ($214 | 0) {
        if ((HEAP32[876] | 0) >>> 0 > $214 >>> 0) {
         _abort(); //@line 1056
        } else {
         HEAP32[$$3$i + 20 >> 2] = $214; //@line 1060
         HEAP32[$214 + 24 >> 2] = $$3$i; //@line 1062
         break;
        }
       }
      }
     } while (0);
     if ($$0193$lcssa$i >>> 0 < 16) {
      $221 = $$0193$lcssa$i + $6 | 0; //@line 1070
      HEAP32[$$0192$lcssa$i + 4 >> 2] = $221 | 3; //@line 1073
      $225 = $$0192$lcssa$i + $221 + 4 | 0; //@line 1075
      HEAP32[$225 >> 2] = HEAP32[$225 >> 2] | 1; //@line 1078
     } else {
      HEAP32[$$0192$lcssa$i + 4 >> 2] = $6 | 3; //@line 1082
      HEAP32[$159 + 4 >> 2] = $$0193$lcssa$i | 1; //@line 1085
      HEAP32[$159 + $$0193$lcssa$i >> 2] = $$0193$lcssa$i; //@line 1087
      if ($37 | 0) {
       $234 = HEAP32[877] | 0; //@line 1090
       $235 = $37 >>> 3; //@line 1091
       $237 = 3528 + ($235 << 1 << 2) | 0; //@line 1093
       $238 = 1 << $235; //@line 1094
       if (!($8 & $238)) {
        HEAP32[872] = $8 | $238; //@line 1099
        $$0189$i = $237; //@line 1101
        $$pre$phi$iZ2D = $237 + 8 | 0; //@line 1101
       } else {
        $242 = $237 + 8 | 0; //@line 1103
        $243 = HEAP32[$242 >> 2] | 0; //@line 1104
        if ((HEAP32[876] | 0) >>> 0 > $243 >>> 0) {
         _abort(); //@line 1108
        } else {
         $$0189$i = $243; //@line 1111
         $$pre$phi$iZ2D = $242; //@line 1111
        }
       }
       HEAP32[$$pre$phi$iZ2D >> 2] = $234; //@line 1114
       HEAP32[$$0189$i + 12 >> 2] = $234; //@line 1116
       HEAP32[$234 + 8 >> 2] = $$0189$i; //@line 1118
       HEAP32[$234 + 12 >> 2] = $237; //@line 1120
      }
      HEAP32[874] = $$0193$lcssa$i; //@line 1122
      HEAP32[877] = $159; //@line 1123
     }
     $$0 = $$0192$lcssa$i + 8 | 0; //@line 1126
     STACKTOP = sp; //@line 1127
     return $$0 | 0; //@line 1127
    }
   } else {
    $$0197 = $6; //@line 1130
   }
  } else {
   if ($0 >>> 0 > 4294967231) {
    $$0197 = -1; //@line 1135
   } else {
    $251 = $0 + 11 | 0; //@line 1137
    $252 = $251 & -8; //@line 1138
    $253 = HEAP32[873] | 0; //@line 1139
    if (!$253) {
     $$0197 = $252; //@line 1142
    } else {
     $255 = 0 - $252 | 0; //@line 1144
     $256 = $251 >>> 8; //@line 1145
     if (!$256) {
      $$0358$i = 0; //@line 1148
     } else {
      if ($252 >>> 0 > 16777215) {
       $$0358$i = 31; //@line 1152
      } else {
       $261 = ($256 + 1048320 | 0) >>> 16 & 8; //@line 1156
       $262 = $256 << $261; //@line 1157
       $265 = ($262 + 520192 | 0) >>> 16 & 4; //@line 1160
       $267 = $262 << $265; //@line 1162
       $270 = ($267 + 245760 | 0) >>> 16 & 2; //@line 1165
       $275 = 14 - ($265 | $261 | $270) + ($267 << $270 >>> 15) | 0; //@line 1170
       $$0358$i = $252 >>> ($275 + 7 | 0) & 1 | $275 << 1; //@line 1176
      }
     }
     $282 = HEAP32[3792 + ($$0358$i << 2) >> 2] | 0; //@line 1180
     L117 : do {
      if (!$282) {
       $$2355$i = 0; //@line 1184
       $$3$i203 = 0; //@line 1184
       $$3350$i = $255; //@line 1184
       label = 81; //@line 1185
      } else {
       $$0342$i = 0; //@line 1192
       $$0347$i = $255; //@line 1192
       $$0353$i = $282; //@line 1192
       $$0359$i = $252 << (($$0358$i | 0) == 31 ? 0 : 25 - ($$0358$i >>> 1) | 0); //@line 1192
       $$0362$i = 0; //@line 1192
       while (1) {
        $292 = (HEAP32[$$0353$i + 4 >> 2] & -8) - $252 | 0; //@line 1197
        if ($292 >>> 0 < $$0347$i >>> 0) {
         if (!$292) {
          $$414$i = $$0353$i; //@line 1202
          $$435113$i = 0; //@line 1202
          $$435712$i = $$0353$i; //@line 1202
          label = 85; //@line 1203
          break L117;
         } else {
          $$1343$i = $$0353$i; //@line 1206
          $$1348$i = $292; //@line 1206
         }
        } else {
         $$1343$i = $$0342$i; //@line 1209
         $$1348$i = $$0347$i; //@line 1209
        }
        $296 = HEAP32[$$0353$i + 20 >> 2] | 0; //@line 1212
        $$0353$i = HEAP32[$$0353$i + 16 + ($$0359$i >>> 31 << 2) >> 2] | 0; //@line 1215
        $$1363$i = ($296 | 0) == 0 | ($296 | 0) == ($$0353$i | 0) ? $$0362$i : $296; //@line 1219
        $302 = ($$0353$i | 0) == 0; //@line 1220
        if ($302) {
         $$2355$i = $$1363$i; //@line 1225
         $$3$i203 = $$1343$i; //@line 1225
         $$3350$i = $$1348$i; //@line 1225
         label = 81; //@line 1226
         break;
        } else {
         $$0342$i = $$1343$i; //@line 1229
         $$0347$i = $$1348$i; //@line 1229
         $$0359$i = $$0359$i << (($302 ^ 1) & 1); //@line 1229
         $$0362$i = $$1363$i; //@line 1229
        }
       }
      }
     } while (0);
     if ((label | 0) == 81) {
      if (($$2355$i | 0) == 0 & ($$3$i203 | 0) == 0) {
       $306 = 2 << $$0358$i; //@line 1239
       $309 = $253 & ($306 | 0 - $306); //@line 1242
       if (!$309) {
        $$0197 = $252; //@line 1245
        break;
       }
       $313 = ($309 & 0 - $309) + -1 | 0; //@line 1250
       $315 = $313 >>> 12 & 16; //@line 1252
       $316 = $313 >>> $315; //@line 1253
       $318 = $316 >>> 5 & 8; //@line 1255
       $320 = $316 >>> $318; //@line 1257
       $322 = $320 >>> 2 & 4; //@line 1259
       $324 = $320 >>> $322; //@line 1261
       $326 = $324 >>> 1 & 2; //@line 1263
       $328 = $324 >>> $326; //@line 1265
       $330 = $328 >>> 1 & 1; //@line 1267
       $$4$ph$i = 0; //@line 1273
       $$4357$ph$i = HEAP32[3792 + (($318 | $315 | $322 | $326 | $330) + ($328 >>> $330) << 2) >> 2] | 0; //@line 1273
      } else {
       $$4$ph$i = $$3$i203; //@line 1275
       $$4357$ph$i = $$2355$i; //@line 1275
      }
      if (!$$4357$ph$i) {
       $$4$lcssa$i = $$4$ph$i; //@line 1279
       $$4351$lcssa$i = $$3350$i; //@line 1279
      } else {
       $$414$i = $$4$ph$i; //@line 1281
       $$435113$i = $$3350$i; //@line 1281
       $$435712$i = $$4357$ph$i; //@line 1281
       label = 85; //@line 1282
      }
     }
     if ((label | 0) == 85) {
      while (1) {
       label = 0; //@line 1287
       $340 = (HEAP32[$$435712$i + 4 >> 2] & -8) - $252 | 0; //@line 1291
       $341 = $340 >>> 0 < $$435113$i >>> 0; //@line 1292
       $$$4351$i = $341 ? $340 : $$435113$i; //@line 1293
       $$4357$$4$i = $341 ? $$435712$i : $$414$i; //@line 1294
       $$435712$i = HEAP32[$$435712$i + 16 + (((HEAP32[$$435712$i + 16 >> 2] | 0) == 0 & 1) << 2) >> 2] | 0; //@line 1300
       if (!$$435712$i) {
        $$4$lcssa$i = $$4357$$4$i; //@line 1303
        $$4351$lcssa$i = $$$4351$i; //@line 1303
        break;
       } else {
        $$414$i = $$4357$$4$i; //@line 1306
        $$435113$i = $$$4351$i; //@line 1306
        label = 85; //@line 1307
       }
      }
     }
     if (!$$4$lcssa$i) {
      $$0197 = $252; //@line 1313
     } else {
      if ($$4351$lcssa$i >>> 0 < ((HEAP32[874] | 0) - $252 | 0) >>> 0) {
       $352 = HEAP32[876] | 0; //@line 1319
       if ($352 >>> 0 > $$4$lcssa$i >>> 0) {
        _abort(); //@line 1322
       }
       $354 = $$4$lcssa$i + $252 | 0; //@line 1325
       if ($354 >>> 0 <= $$4$lcssa$i >>> 0) {
        _abort(); //@line 1328
       }
       $357 = HEAP32[$$4$lcssa$i + 24 >> 2] | 0; //@line 1332
       $359 = HEAP32[$$4$lcssa$i + 12 >> 2] | 0; //@line 1334
       do {
        if (($359 | 0) == ($$4$lcssa$i | 0)) {
         $370 = $$4$lcssa$i + 20 | 0; //@line 1338
         $371 = HEAP32[$370 >> 2] | 0; //@line 1339
         if (!$371) {
          $373 = $$4$lcssa$i + 16 | 0; //@line 1342
          $374 = HEAP32[$373 >> 2] | 0; //@line 1343
          if (!$374) {
           $$3372$i = 0; //@line 1346
           break;
          } else {
           $$1370$i = $374; //@line 1349
           $$1374$i = $373; //@line 1349
          }
         } else {
          $$1370$i = $371; //@line 1352
          $$1374$i = $370; //@line 1352
         }
         while (1) {
          $376 = $$1370$i + 20 | 0; //@line 1355
          $377 = HEAP32[$376 >> 2] | 0; //@line 1356
          if ($377 | 0) {
           $$1370$i = $377; //@line 1359
           $$1374$i = $376; //@line 1359
           continue;
          }
          $379 = $$1370$i + 16 | 0; //@line 1362
          $380 = HEAP32[$379 >> 2] | 0; //@line 1363
          if (!$380) {
           break;
          } else {
           $$1370$i = $380; //@line 1368
           $$1374$i = $379; //@line 1368
          }
         }
         if ($352 >>> 0 > $$1374$i >>> 0) {
          _abort(); //@line 1373
         } else {
          HEAP32[$$1374$i >> 2] = 0; //@line 1376
          $$3372$i = $$1370$i; //@line 1377
          break;
         }
        } else {
         $362 = HEAP32[$$4$lcssa$i + 8 >> 2] | 0; //@line 1382
         if ($352 >>> 0 > $362 >>> 0) {
          _abort(); //@line 1385
         }
         $364 = $362 + 12 | 0; //@line 1388
         if ((HEAP32[$364 >> 2] | 0) != ($$4$lcssa$i | 0)) {
          _abort(); //@line 1392
         }
         $367 = $359 + 8 | 0; //@line 1395
         if ((HEAP32[$367 >> 2] | 0) == ($$4$lcssa$i | 0)) {
          HEAP32[$364 >> 2] = $359; //@line 1399
          HEAP32[$367 >> 2] = $362; //@line 1400
          $$3372$i = $359; //@line 1401
          break;
         } else {
          _abort(); //@line 1404
         }
        }
       } while (0);
       L164 : do {
        if (!$357) {
         $475 = $253; //@line 1412
        } else {
         $385 = HEAP32[$$4$lcssa$i + 28 >> 2] | 0; //@line 1415
         $386 = 3792 + ($385 << 2) | 0; //@line 1416
         do {
          if (($$4$lcssa$i | 0) == (HEAP32[$386 >> 2] | 0)) {
           HEAP32[$386 >> 2] = $$3372$i; //@line 1421
           if (!$$3372$i) {
            $391 = $253 & ~(1 << $385); //@line 1426
            HEAP32[873] = $391; //@line 1427
            $475 = $391; //@line 1428
            break L164;
           }
          } else {
           if ((HEAP32[876] | 0) >>> 0 > $357 >>> 0) {
            _abort(); //@line 1435
           } else {
            HEAP32[$357 + 16 + (((HEAP32[$357 + 16 >> 2] | 0) != ($$4$lcssa$i | 0) & 1) << 2) >> 2] = $$3372$i; //@line 1443
            if (!$$3372$i) {
             $475 = $253; //@line 1446
             break L164;
            } else {
             break;
            }
           }
          }
         } while (0);
         $399 = HEAP32[876] | 0; //@line 1454
         if ($399 >>> 0 > $$3372$i >>> 0) {
          _abort(); //@line 1457
         }
         HEAP32[$$3372$i + 24 >> 2] = $357; //@line 1461
         $403 = HEAP32[$$4$lcssa$i + 16 >> 2] | 0; //@line 1463
         do {
          if ($403 | 0) {
           if ($399 >>> 0 > $403 >>> 0) {
            _abort(); //@line 1469
           } else {
            HEAP32[$$3372$i + 16 >> 2] = $403; //@line 1473
            HEAP32[$403 + 24 >> 2] = $$3372$i; //@line 1475
            break;
           }
          }
         } while (0);
         $409 = HEAP32[$$4$lcssa$i + 20 >> 2] | 0; //@line 1481
         if (!$409) {
          $475 = $253; //@line 1484
         } else {
          if ((HEAP32[876] | 0) >>> 0 > $409 >>> 0) {
           _abort(); //@line 1489
          } else {
           HEAP32[$$3372$i + 20 >> 2] = $409; //@line 1493
           HEAP32[$409 + 24 >> 2] = $$3372$i; //@line 1495
           $475 = $253; //@line 1496
           break;
          }
         }
        }
       } while (0);
       do {
        if ($$4351$lcssa$i >>> 0 < 16) {
         $416 = $$4351$lcssa$i + $252 | 0; //@line 1505
         HEAP32[$$4$lcssa$i + 4 >> 2] = $416 | 3; //@line 1508
         $420 = $$4$lcssa$i + $416 + 4 | 0; //@line 1510
         HEAP32[$420 >> 2] = HEAP32[$420 >> 2] | 1; //@line 1513
        } else {
         HEAP32[$$4$lcssa$i + 4 >> 2] = $252 | 3; //@line 1517
         HEAP32[$354 + 4 >> 2] = $$4351$lcssa$i | 1; //@line 1520
         HEAP32[$354 + $$4351$lcssa$i >> 2] = $$4351$lcssa$i; //@line 1522
         $428 = $$4351$lcssa$i >>> 3; //@line 1523
         if ($$4351$lcssa$i >>> 0 < 256) {
          $431 = 3528 + ($428 << 1 << 2) | 0; //@line 1527
          $432 = HEAP32[872] | 0; //@line 1528
          $433 = 1 << $428; //@line 1529
          if (!($432 & $433)) {
           HEAP32[872] = $432 | $433; //@line 1534
           $$0368$i = $431; //@line 1536
           $$pre$phi$i211Z2D = $431 + 8 | 0; //@line 1536
          } else {
           $437 = $431 + 8 | 0; //@line 1538
           $438 = HEAP32[$437 >> 2] | 0; //@line 1539
           if ((HEAP32[876] | 0) >>> 0 > $438 >>> 0) {
            _abort(); //@line 1543
           } else {
            $$0368$i = $438; //@line 1546
            $$pre$phi$i211Z2D = $437; //@line 1546
           }
          }
          HEAP32[$$pre$phi$i211Z2D >> 2] = $354; //@line 1549
          HEAP32[$$0368$i + 12 >> 2] = $354; //@line 1551
          HEAP32[$354 + 8 >> 2] = $$0368$i; //@line 1553
          HEAP32[$354 + 12 >> 2] = $431; //@line 1555
          break;
         }
         $444 = $$4351$lcssa$i >>> 8; //@line 1558
         if (!$444) {
          $$0361$i = 0; //@line 1561
         } else {
          if ($$4351$lcssa$i >>> 0 > 16777215) {
           $$0361$i = 31; //@line 1565
          } else {
           $449 = ($444 + 1048320 | 0) >>> 16 & 8; //@line 1569
           $450 = $444 << $449; //@line 1570
           $453 = ($450 + 520192 | 0) >>> 16 & 4; //@line 1573
           $455 = $450 << $453; //@line 1575
           $458 = ($455 + 245760 | 0) >>> 16 & 2; //@line 1578
           $463 = 14 - ($453 | $449 | $458) + ($455 << $458 >>> 15) | 0; //@line 1583
           $$0361$i = $$4351$lcssa$i >>> ($463 + 7 | 0) & 1 | $463 << 1; //@line 1589
          }
         }
         $469 = 3792 + ($$0361$i << 2) | 0; //@line 1592
         HEAP32[$354 + 28 >> 2] = $$0361$i; //@line 1594
         $471 = $354 + 16 | 0; //@line 1595
         HEAP32[$471 + 4 >> 2] = 0; //@line 1597
         HEAP32[$471 >> 2] = 0; //@line 1598
         $473 = 1 << $$0361$i; //@line 1599
         if (!($475 & $473)) {
          HEAP32[873] = $475 | $473; //@line 1604
          HEAP32[$469 >> 2] = $354; //@line 1605
          HEAP32[$354 + 24 >> 2] = $469; //@line 1607
          HEAP32[$354 + 12 >> 2] = $354; //@line 1609
          HEAP32[$354 + 8 >> 2] = $354; //@line 1611
          break;
         }
         $$0344$i = $$4351$lcssa$i << (($$0361$i | 0) == 31 ? 0 : 25 - ($$0361$i >>> 1) | 0); //@line 1620
         $$0345$i = HEAP32[$469 >> 2] | 0; //@line 1620
         while (1) {
          if ((HEAP32[$$0345$i + 4 >> 2] & -8 | 0) == ($$4351$lcssa$i | 0)) {
           label = 139; //@line 1627
           break;
          }
          $492 = $$0345$i + 16 + ($$0344$i >>> 31 << 2) | 0; //@line 1631
          $494 = HEAP32[$492 >> 2] | 0; //@line 1633
          if (!$494) {
           label = 136; //@line 1636
           break;
          } else {
           $$0344$i = $$0344$i << 1; //@line 1639
           $$0345$i = $494; //@line 1639
          }
         }
         if ((label | 0) == 136) {
          if ((HEAP32[876] | 0) >>> 0 > $492 >>> 0) {
           _abort(); //@line 1646
          } else {
           HEAP32[$492 >> 2] = $354; //@line 1649
           HEAP32[$354 + 24 >> 2] = $$0345$i; //@line 1651
           HEAP32[$354 + 12 >> 2] = $354; //@line 1653
           HEAP32[$354 + 8 >> 2] = $354; //@line 1655
           break;
          }
         } else if ((label | 0) == 139) {
          $501 = $$0345$i + 8 | 0; //@line 1660
          $502 = HEAP32[$501 >> 2] | 0; //@line 1661
          $503 = HEAP32[876] | 0; //@line 1662
          if ($503 >>> 0 <= $502 >>> 0 & $503 >>> 0 <= $$0345$i >>> 0) {
           HEAP32[$502 + 12 >> 2] = $354; //@line 1668
           HEAP32[$501 >> 2] = $354; //@line 1669
           HEAP32[$354 + 8 >> 2] = $502; //@line 1671
           HEAP32[$354 + 12 >> 2] = $$0345$i; //@line 1673
           HEAP32[$354 + 24 >> 2] = 0; //@line 1675
           break;
          } else {
           _abort(); //@line 1678
          }
         }
        }
       } while (0);
       $$0 = $$4$lcssa$i + 8 | 0; //@line 1685
       STACKTOP = sp; //@line 1686
       return $$0 | 0; //@line 1686
      } else {
       $$0197 = $252; //@line 1688
      }
     }
    }
   }
  }
 } while (0);
 $512 = HEAP32[874] | 0; //@line 1695
 if ($512 >>> 0 >= $$0197 >>> 0) {
  $514 = $512 - $$0197 | 0; //@line 1698
  $515 = HEAP32[877] | 0; //@line 1699
  if ($514 >>> 0 > 15) {
   $517 = $515 + $$0197 | 0; //@line 1702
   HEAP32[877] = $517; //@line 1703
   HEAP32[874] = $514; //@line 1704
   HEAP32[$517 + 4 >> 2] = $514 | 1; //@line 1707
   HEAP32[$515 + $512 >> 2] = $514; //@line 1709
   HEAP32[$515 + 4 >> 2] = $$0197 | 3; //@line 1712
  } else {
   HEAP32[874] = 0; //@line 1714
   HEAP32[877] = 0; //@line 1715
   HEAP32[$515 + 4 >> 2] = $512 | 3; //@line 1718
   $526 = $515 + $512 + 4 | 0; //@line 1720
   HEAP32[$526 >> 2] = HEAP32[$526 >> 2] | 1; //@line 1723
  }
  $$0 = $515 + 8 | 0; //@line 1726
  STACKTOP = sp; //@line 1727
  return $$0 | 0; //@line 1727
 }
 $530 = HEAP32[875] | 0; //@line 1729
 if ($530 >>> 0 > $$0197 >>> 0) {
  $532 = $530 - $$0197 | 0; //@line 1732
  HEAP32[875] = $532; //@line 1733
  $533 = HEAP32[878] | 0; //@line 1734
  $534 = $533 + $$0197 | 0; //@line 1735
  HEAP32[878] = $534; //@line 1736
  HEAP32[$534 + 4 >> 2] = $532 | 1; //@line 1739
  HEAP32[$533 + 4 >> 2] = $$0197 | 3; //@line 1742
  $$0 = $533 + 8 | 0; //@line 1744
  STACKTOP = sp; //@line 1745
  return $$0 | 0; //@line 1745
 }
 if (!(HEAP32[990] | 0)) {
  HEAP32[992] = 4096; //@line 1750
  HEAP32[991] = 4096; //@line 1751
  HEAP32[993] = -1; //@line 1752
  HEAP32[994] = -1; //@line 1753
  HEAP32[995] = 0; //@line 1754
  HEAP32[983] = 0; //@line 1755
  HEAP32[990] = $1 & -16 ^ 1431655768; //@line 1759
  $548 = 4096; //@line 1760
 } else {
  $548 = HEAP32[992] | 0; //@line 1763
 }
 $545 = $$0197 + 48 | 0; //@line 1765
 $546 = $$0197 + 47 | 0; //@line 1766
 $547 = $548 + $546 | 0; //@line 1767
 $549 = 0 - $548 | 0; //@line 1768
 $550 = $547 & $549; //@line 1769
 if ($550 >>> 0 <= $$0197 >>> 0) {
  $$0 = 0; //@line 1772
  STACKTOP = sp; //@line 1773
  return $$0 | 0; //@line 1773
 }
 $552 = HEAP32[982] | 0; //@line 1775
 if ($552 | 0) {
  $554 = HEAP32[980] | 0; //@line 1778
  $555 = $554 + $550 | 0; //@line 1779
  if ($555 >>> 0 <= $554 >>> 0 | $555 >>> 0 > $552 >>> 0) {
   $$0 = 0; //@line 1784
   STACKTOP = sp; //@line 1785
   return $$0 | 0; //@line 1785
  }
 }
 L244 : do {
  if (!(HEAP32[983] & 4)) {
   $561 = HEAP32[878] | 0; //@line 1793
   L246 : do {
    if (!$561) {
     label = 163; //@line 1797
    } else {
     $$0$i$i = 3936; //@line 1799
     while (1) {
      $563 = HEAP32[$$0$i$i >> 2] | 0; //@line 1801
      if ($563 >>> 0 <= $561 >>> 0) {
       $565 = $$0$i$i + 4 | 0; //@line 1804
       if (($563 + (HEAP32[$565 >> 2] | 0) | 0) >>> 0 > $561 >>> 0) {
        break;
       }
      }
      $570 = HEAP32[$$0$i$i + 8 >> 2] | 0; //@line 1813
      if (!$570) {
       label = 163; //@line 1816
       break L246;
      } else {
       $$0$i$i = $570; //@line 1819
      }
     }
     $595 = $547 - $530 & $549; //@line 1823
     if ($595 >>> 0 < 2147483647) {
      $597 = _sbrk($595 | 0) | 0; //@line 1826
      if (($597 | 0) == ((HEAP32[$$0$i$i >> 2] | 0) + (HEAP32[$565 >> 2] | 0) | 0)) {
       if (($597 | 0) == (-1 | 0)) {
        $$2234243136$i = $595; //@line 1834
       } else {
        $$723947$i = $595; //@line 1836
        $$748$i = $597; //@line 1836
        label = 180; //@line 1837
        break L244;
       }
      } else {
       $$2247$ph$i = $597; //@line 1841
       $$2253$ph$i = $595; //@line 1841
       label = 171; //@line 1842
      }
     } else {
      $$2234243136$i = 0; //@line 1845
     }
    }
   } while (0);
   do {
    if ((label | 0) == 163) {
     $572 = _sbrk(0) | 0; //@line 1851
     if (($572 | 0) == (-1 | 0)) {
      $$2234243136$i = 0; //@line 1854
     } else {
      $574 = $572; //@line 1856
      $575 = HEAP32[991] | 0; //@line 1857
      $576 = $575 + -1 | 0; //@line 1858
      $$$i = (($576 & $574 | 0) == 0 ? 0 : ($576 + $574 & 0 - $575) - $574 | 0) + $550 | 0; //@line 1866
      $584 = HEAP32[980] | 0; //@line 1867
      $585 = $$$i + $584 | 0; //@line 1868
      if ($$$i >>> 0 > $$0197 >>> 0 & $$$i >>> 0 < 2147483647) {
       $588 = HEAP32[982] | 0; //@line 1873
       if ($588 | 0) {
        if ($585 >>> 0 <= $584 >>> 0 | $585 >>> 0 > $588 >>> 0) {
         $$2234243136$i = 0; //@line 1880
         break;
        }
       }
       $592 = _sbrk($$$i | 0) | 0; //@line 1884
       if (($592 | 0) == ($572 | 0)) {
        $$723947$i = $$$i; //@line 1887
        $$748$i = $572; //@line 1887
        label = 180; //@line 1888
        break L244;
       } else {
        $$2247$ph$i = $592; //@line 1891
        $$2253$ph$i = $$$i; //@line 1891
        label = 171; //@line 1892
       }
      } else {
       $$2234243136$i = 0; //@line 1895
      }
     }
    }
   } while (0);
   do {
    if ((label | 0) == 171) {
     $603 = 0 - $$2253$ph$i | 0; //@line 1902
     if (!($545 >>> 0 > $$2253$ph$i >>> 0 & ($$2253$ph$i >>> 0 < 2147483647 & ($$2247$ph$i | 0) != (-1 | 0)))) {
      if (($$2247$ph$i | 0) == (-1 | 0)) {
       $$2234243136$i = 0; //@line 1911
       break;
      } else {
       $$723947$i = $$2253$ph$i; //@line 1914
       $$748$i = $$2247$ph$i; //@line 1914
       label = 180; //@line 1915
       break L244;
      }
     }
     $607 = HEAP32[992] | 0; //@line 1919
     $611 = $546 - $$2253$ph$i + $607 & 0 - $607; //@line 1923
     if ($611 >>> 0 >= 2147483647) {
      $$723947$i = $$2253$ph$i; //@line 1926
      $$748$i = $$2247$ph$i; //@line 1926
      label = 180; //@line 1927
      break L244;
     }
     if ((_sbrk($611 | 0) | 0) == (-1 | 0)) {
      _sbrk($603 | 0) | 0; //@line 1933
      $$2234243136$i = 0; //@line 1934
      break;
     } else {
      $$723947$i = $611 + $$2253$ph$i | 0; //@line 1938
      $$748$i = $$2247$ph$i; //@line 1938
      label = 180; //@line 1939
      break L244;
     }
    }
   } while (0);
   HEAP32[983] = HEAP32[983] | 4; //@line 1946
   $$4236$i = $$2234243136$i; //@line 1947
   label = 178; //@line 1948
  } else {
   $$4236$i = 0; //@line 1950
   label = 178; //@line 1951
  }
 } while (0);
 if ((label | 0) == 178) {
  if ($550 >>> 0 < 2147483647) {
   $620 = _sbrk($550 | 0) | 0; //@line 1957
   $621 = _sbrk(0) | 0; //@line 1958
   $627 = $621 - $620 | 0; //@line 1966
   $629 = $627 >>> 0 > ($$0197 + 40 | 0) >>> 0; //@line 1968
   if (!(($620 | 0) == (-1 | 0) | $629 ^ 1 | $620 >>> 0 < $621 >>> 0 & (($620 | 0) != (-1 | 0) & ($621 | 0) != (-1 | 0)) ^ 1)) {
    $$723947$i = $629 ? $627 : $$4236$i; //@line 1976
    $$748$i = $620; //@line 1976
    label = 180; //@line 1977
   }
  }
 }
 if ((label | 0) == 180) {
  $633 = (HEAP32[980] | 0) + $$723947$i | 0; //@line 1983
  HEAP32[980] = $633; //@line 1984
  if ($633 >>> 0 > (HEAP32[981] | 0) >>> 0) {
   HEAP32[981] = $633; //@line 1988
  }
  $636 = HEAP32[878] | 0; //@line 1990
  do {
   if (!$636) {
    $638 = HEAP32[876] | 0; //@line 1994
    if (($638 | 0) == 0 | $$748$i >>> 0 < $638 >>> 0) {
     HEAP32[876] = $$748$i; //@line 1999
    }
    HEAP32[984] = $$748$i; //@line 2001
    HEAP32[985] = $$723947$i; //@line 2002
    HEAP32[987] = 0; //@line 2003
    HEAP32[881] = HEAP32[990]; //@line 2005
    HEAP32[880] = -1; //@line 2006
    HEAP32[885] = 3528; //@line 2007
    HEAP32[884] = 3528; //@line 2008
    HEAP32[887] = 3536; //@line 2009
    HEAP32[886] = 3536; //@line 2010
    HEAP32[889] = 3544; //@line 2011
    HEAP32[888] = 3544; //@line 2012
    HEAP32[891] = 3552; //@line 2013
    HEAP32[890] = 3552; //@line 2014
    HEAP32[893] = 3560; //@line 2015
    HEAP32[892] = 3560; //@line 2016
    HEAP32[895] = 3568; //@line 2017
    HEAP32[894] = 3568; //@line 2018
    HEAP32[897] = 3576; //@line 2019
    HEAP32[896] = 3576; //@line 2020
    HEAP32[899] = 3584; //@line 2021
    HEAP32[898] = 3584; //@line 2022
    HEAP32[901] = 3592; //@line 2023
    HEAP32[900] = 3592; //@line 2024
    HEAP32[903] = 3600; //@line 2025
    HEAP32[902] = 3600; //@line 2026
    HEAP32[905] = 3608; //@line 2027
    HEAP32[904] = 3608; //@line 2028
    HEAP32[907] = 3616; //@line 2029
    HEAP32[906] = 3616; //@line 2030
    HEAP32[909] = 3624; //@line 2031
    HEAP32[908] = 3624; //@line 2032
    HEAP32[911] = 3632; //@line 2033
    HEAP32[910] = 3632; //@line 2034
    HEAP32[913] = 3640; //@line 2035
    HEAP32[912] = 3640; //@line 2036
    HEAP32[915] = 3648; //@line 2037
    HEAP32[914] = 3648; //@line 2038
    HEAP32[917] = 3656; //@line 2039
    HEAP32[916] = 3656; //@line 2040
    HEAP32[919] = 3664; //@line 2041
    HEAP32[918] = 3664; //@line 2042
    HEAP32[921] = 3672; //@line 2043
    HEAP32[920] = 3672; //@line 2044
    HEAP32[923] = 3680; //@line 2045
    HEAP32[922] = 3680; //@line 2046
    HEAP32[925] = 3688; //@line 2047
    HEAP32[924] = 3688; //@line 2048
    HEAP32[927] = 3696; //@line 2049
    HEAP32[926] = 3696; //@line 2050
    HEAP32[929] = 3704; //@line 2051
    HEAP32[928] = 3704; //@line 2052
    HEAP32[931] = 3712; //@line 2053
    HEAP32[930] = 3712; //@line 2054
    HEAP32[933] = 3720; //@line 2055
    HEAP32[932] = 3720; //@line 2056
    HEAP32[935] = 3728; //@line 2057
    HEAP32[934] = 3728; //@line 2058
    HEAP32[937] = 3736; //@line 2059
    HEAP32[936] = 3736; //@line 2060
    HEAP32[939] = 3744; //@line 2061
    HEAP32[938] = 3744; //@line 2062
    HEAP32[941] = 3752; //@line 2063
    HEAP32[940] = 3752; //@line 2064
    HEAP32[943] = 3760; //@line 2065
    HEAP32[942] = 3760; //@line 2066
    HEAP32[945] = 3768; //@line 2067
    HEAP32[944] = 3768; //@line 2068
    HEAP32[947] = 3776; //@line 2069
    HEAP32[946] = 3776; //@line 2070
    $642 = $$723947$i + -40 | 0; //@line 2071
    $644 = $$748$i + 8 | 0; //@line 2073
    $649 = ($644 & 7 | 0) == 0 ? 0 : 0 - $644 & 7; //@line 2078
    $650 = $$748$i + $649 | 0; //@line 2079
    $651 = $642 - $649 | 0; //@line 2080
    HEAP32[878] = $650; //@line 2081
    HEAP32[875] = $651; //@line 2082
    HEAP32[$650 + 4 >> 2] = $651 | 1; //@line 2085
    HEAP32[$$748$i + $642 + 4 >> 2] = 40; //@line 2088
    HEAP32[879] = HEAP32[994]; //@line 2090
   } else {
    $$024367$i = 3936; //@line 2092
    while (1) {
     $657 = HEAP32[$$024367$i >> 2] | 0; //@line 2094
     $658 = $$024367$i + 4 | 0; //@line 2095
     $659 = HEAP32[$658 >> 2] | 0; //@line 2096
     if (($$748$i | 0) == ($657 + $659 | 0)) {
      label = 188; //@line 2100
      break;
     }
     $663 = HEAP32[$$024367$i + 8 >> 2] | 0; //@line 2104
     if (!$663) {
      break;
     } else {
      $$024367$i = $663; //@line 2109
     }
    }
    if ((label | 0) == 188) {
     if (!(HEAP32[$$024367$i + 12 >> 2] & 8)) {
      if ($$748$i >>> 0 > $636 >>> 0 & $657 >>> 0 <= $636 >>> 0) {
       HEAP32[$658 >> 2] = $659 + $$723947$i; //@line 2123
       $673 = (HEAP32[875] | 0) + $$723947$i | 0; //@line 2125
       $675 = $636 + 8 | 0; //@line 2127
       $680 = ($675 & 7 | 0) == 0 ? 0 : 0 - $675 & 7; //@line 2132
       $681 = $636 + $680 | 0; //@line 2133
       $682 = $673 - $680 | 0; //@line 2134
       HEAP32[878] = $681; //@line 2135
       HEAP32[875] = $682; //@line 2136
       HEAP32[$681 + 4 >> 2] = $682 | 1; //@line 2139
       HEAP32[$636 + $673 + 4 >> 2] = 40; //@line 2142
       HEAP32[879] = HEAP32[994]; //@line 2144
       break;
      }
     }
    }
    $688 = HEAP32[876] | 0; //@line 2149
    if ($$748$i >>> 0 < $688 >>> 0) {
     HEAP32[876] = $$748$i; //@line 2152
     $753 = $$748$i; //@line 2153
    } else {
     $753 = $688; //@line 2155
    }
    $690 = $$748$i + $$723947$i | 0; //@line 2157
    $$124466$i = 3936; //@line 2158
    while (1) {
     if ((HEAP32[$$124466$i >> 2] | 0) == ($690 | 0)) {
      label = 196; //@line 2163
      break;
     }
     $694 = HEAP32[$$124466$i + 8 >> 2] | 0; //@line 2167
     if (!$694) {
      $$0$i$i$i = 3936; //@line 2170
      break;
     } else {
      $$124466$i = $694; //@line 2173
     }
    }
    if ((label | 0) == 196) {
     if (!(HEAP32[$$124466$i + 12 >> 2] & 8)) {
      HEAP32[$$124466$i >> 2] = $$748$i; //@line 2182
      $700 = $$124466$i + 4 | 0; //@line 2183
      HEAP32[$700 >> 2] = (HEAP32[$700 >> 2] | 0) + $$723947$i; //@line 2186
      $704 = $$748$i + 8 | 0; //@line 2188
      $710 = $$748$i + (($704 & 7 | 0) == 0 ? 0 : 0 - $704 & 7) | 0; //@line 2194
      $712 = $690 + 8 | 0; //@line 2196
      $718 = $690 + (($712 & 7 | 0) == 0 ? 0 : 0 - $712 & 7) | 0; //@line 2202
      $722 = $710 + $$0197 | 0; //@line 2206
      $723 = $718 - $710 - $$0197 | 0; //@line 2207
      HEAP32[$710 + 4 >> 2] = $$0197 | 3; //@line 2210
      do {
       if (($636 | 0) == ($718 | 0)) {
        $728 = (HEAP32[875] | 0) + $723 | 0; //@line 2215
        HEAP32[875] = $728; //@line 2216
        HEAP32[878] = $722; //@line 2217
        HEAP32[$722 + 4 >> 2] = $728 | 1; //@line 2220
       } else {
        if ((HEAP32[877] | 0) == ($718 | 0)) {
         $734 = (HEAP32[874] | 0) + $723 | 0; //@line 2226
         HEAP32[874] = $734; //@line 2227
         HEAP32[877] = $722; //@line 2228
         HEAP32[$722 + 4 >> 2] = $734 | 1; //@line 2231
         HEAP32[$722 + $734 >> 2] = $734; //@line 2233
         break;
        }
        $739 = HEAP32[$718 + 4 >> 2] | 0; //@line 2237
        if (($739 & 3 | 0) == 1) {
         $742 = $739 & -8; //@line 2241
         $743 = $739 >>> 3; //@line 2242
         L311 : do {
          if ($739 >>> 0 < 256) {
           $746 = HEAP32[$718 + 8 >> 2] | 0; //@line 2247
           $748 = HEAP32[$718 + 12 >> 2] | 0; //@line 2249
           $750 = 3528 + ($743 << 1 << 2) | 0; //@line 2251
           do {
            if (($746 | 0) != ($750 | 0)) {
             if ($753 >>> 0 > $746 >>> 0) {
              _abort(); //@line 2257
             }
             if ((HEAP32[$746 + 12 >> 2] | 0) == ($718 | 0)) {
              break;
             }
             _abort(); //@line 2266
            }
           } while (0);
           if (($748 | 0) == ($746 | 0)) {
            HEAP32[872] = HEAP32[872] & ~(1 << $743); //@line 2276
            break;
           }
           do {
            if (($748 | 0) == ($750 | 0)) {
             $$pre$phi11$i$iZ2D = $748 + 8 | 0; //@line 2283
            } else {
             if ($753 >>> 0 > $748 >>> 0) {
              _abort(); //@line 2287
             }
             $764 = $748 + 8 | 0; //@line 2290
             if ((HEAP32[$764 >> 2] | 0) == ($718 | 0)) {
              $$pre$phi11$i$iZ2D = $764; //@line 2294
              break;
             }
             _abort(); //@line 2297
            }
           } while (0);
           HEAP32[$746 + 12 >> 2] = $748; //@line 2302
           HEAP32[$$pre$phi11$i$iZ2D >> 2] = $746; //@line 2303
          } else {
           $769 = HEAP32[$718 + 24 >> 2] | 0; //@line 2306
           $771 = HEAP32[$718 + 12 >> 2] | 0; //@line 2308
           do {
            if (($771 | 0) == ($718 | 0)) {
             $782 = $718 + 16 | 0; //@line 2312
             $783 = $782 + 4 | 0; //@line 2313
             $784 = HEAP32[$783 >> 2] | 0; //@line 2314
             if (!$784) {
              $786 = HEAP32[$782 >> 2] | 0; //@line 2317
              if (!$786) {
               $$3$i$i = 0; //@line 2320
               break;
              } else {
               $$1291$i$i = $786; //@line 2323
               $$1293$i$i = $782; //@line 2323
              }
             } else {
              $$1291$i$i = $784; //@line 2326
              $$1293$i$i = $783; //@line 2326
             }
             while (1) {
              $788 = $$1291$i$i + 20 | 0; //@line 2329
              $789 = HEAP32[$788 >> 2] | 0; //@line 2330
              if ($789 | 0) {
               $$1291$i$i = $789; //@line 2333
               $$1293$i$i = $788; //@line 2333
               continue;
              }
              $791 = $$1291$i$i + 16 | 0; //@line 2336
              $792 = HEAP32[$791 >> 2] | 0; //@line 2337
              if (!$792) {
               break;
              } else {
               $$1291$i$i = $792; //@line 2342
               $$1293$i$i = $791; //@line 2342
              }
             }
             if ($753 >>> 0 > $$1293$i$i >>> 0) {
              _abort(); //@line 2347
             } else {
              HEAP32[$$1293$i$i >> 2] = 0; //@line 2350
              $$3$i$i = $$1291$i$i; //@line 2351
              break;
             }
            } else {
             $774 = HEAP32[$718 + 8 >> 2] | 0; //@line 2356
             if ($753 >>> 0 > $774 >>> 0) {
              _abort(); //@line 2359
             }
             $776 = $774 + 12 | 0; //@line 2362
             if ((HEAP32[$776 >> 2] | 0) != ($718 | 0)) {
              _abort(); //@line 2366
             }
             $779 = $771 + 8 | 0; //@line 2369
             if ((HEAP32[$779 >> 2] | 0) == ($718 | 0)) {
              HEAP32[$776 >> 2] = $771; //@line 2373
              HEAP32[$779 >> 2] = $774; //@line 2374
              $$3$i$i = $771; //@line 2375
              break;
             } else {
              _abort(); //@line 2378
             }
            }
           } while (0);
           if (!$769) {
            break;
           }
           $797 = HEAP32[$718 + 28 >> 2] | 0; //@line 2388
           $798 = 3792 + ($797 << 2) | 0; //@line 2389
           do {
            if ((HEAP32[$798 >> 2] | 0) == ($718 | 0)) {
             HEAP32[$798 >> 2] = $$3$i$i; //@line 2394
             if ($$3$i$i | 0) {
              break;
             }
             HEAP32[873] = HEAP32[873] & ~(1 << $797); //@line 2403
             break L311;
            } else {
             if ((HEAP32[876] | 0) >>> 0 > $769 >>> 0) {
              _abort(); //@line 2409
             } else {
              HEAP32[$769 + 16 + (((HEAP32[$769 + 16 >> 2] | 0) != ($718 | 0) & 1) << 2) >> 2] = $$3$i$i; //@line 2417
              if (!$$3$i$i) {
               break L311;
              } else {
               break;
              }
             }
            }
           } while (0);
           $812 = HEAP32[876] | 0; //@line 2427
           if ($812 >>> 0 > $$3$i$i >>> 0) {
            _abort(); //@line 2430
           }
           HEAP32[$$3$i$i + 24 >> 2] = $769; //@line 2434
           $815 = $718 + 16 | 0; //@line 2435
           $816 = HEAP32[$815 >> 2] | 0; //@line 2436
           do {
            if ($816 | 0) {
             if ($812 >>> 0 > $816 >>> 0) {
              _abort(); //@line 2442
             } else {
              HEAP32[$$3$i$i + 16 >> 2] = $816; //@line 2446
              HEAP32[$816 + 24 >> 2] = $$3$i$i; //@line 2448
              break;
             }
            }
           } while (0);
           $822 = HEAP32[$815 + 4 >> 2] | 0; //@line 2454
           if (!$822) {
            break;
           }
           if ((HEAP32[876] | 0) >>> 0 > $822 >>> 0) {
            _abort(); //@line 2462
           } else {
            HEAP32[$$3$i$i + 20 >> 2] = $822; //@line 2466
            HEAP32[$822 + 24 >> 2] = $$3$i$i; //@line 2468
            break;
           }
          }
         } while (0);
         $$0$i17$i = $718 + $742 | 0; //@line 2475
         $$0287$i$i = $742 + $723 | 0; //@line 2475
        } else {
         $$0$i17$i = $718; //@line 2477
         $$0287$i$i = $723; //@line 2477
        }
        $830 = $$0$i17$i + 4 | 0; //@line 2479
        HEAP32[$830 >> 2] = HEAP32[$830 >> 2] & -2; //@line 2482
        HEAP32[$722 + 4 >> 2] = $$0287$i$i | 1; //@line 2485
        HEAP32[$722 + $$0287$i$i >> 2] = $$0287$i$i; //@line 2487
        $836 = $$0287$i$i >>> 3; //@line 2488
        if ($$0287$i$i >>> 0 < 256) {
         $839 = 3528 + ($836 << 1 << 2) | 0; //@line 2492
         $840 = HEAP32[872] | 0; //@line 2493
         $841 = 1 << $836; //@line 2494
         do {
          if (!($840 & $841)) {
           HEAP32[872] = $840 | $841; //@line 2500
           $$0295$i$i = $839; //@line 2502
           $$pre$phi$i19$iZ2D = $839 + 8 | 0; //@line 2502
          } else {
           $845 = $839 + 8 | 0; //@line 2504
           $846 = HEAP32[$845 >> 2] | 0; //@line 2505
           if ((HEAP32[876] | 0) >>> 0 <= $846 >>> 0) {
            $$0295$i$i = $846; //@line 2509
            $$pre$phi$i19$iZ2D = $845; //@line 2509
            break;
           }
           _abort(); //@line 2512
          }
         } while (0);
         HEAP32[$$pre$phi$i19$iZ2D >> 2] = $722; //@line 2516
         HEAP32[$$0295$i$i + 12 >> 2] = $722; //@line 2518
         HEAP32[$722 + 8 >> 2] = $$0295$i$i; //@line 2520
         HEAP32[$722 + 12 >> 2] = $839; //@line 2522
         break;
        }
        $852 = $$0287$i$i >>> 8; //@line 2525
        do {
         if (!$852) {
          $$0296$i$i = 0; //@line 2529
         } else {
          if ($$0287$i$i >>> 0 > 16777215) {
           $$0296$i$i = 31; //@line 2533
           break;
          }
          $857 = ($852 + 1048320 | 0) >>> 16 & 8; //@line 2538
          $858 = $852 << $857; //@line 2539
          $861 = ($858 + 520192 | 0) >>> 16 & 4; //@line 2542
          $863 = $858 << $861; //@line 2544
          $866 = ($863 + 245760 | 0) >>> 16 & 2; //@line 2547
          $871 = 14 - ($861 | $857 | $866) + ($863 << $866 >>> 15) | 0; //@line 2552
          $$0296$i$i = $$0287$i$i >>> ($871 + 7 | 0) & 1 | $871 << 1; //@line 2558
         }
        } while (0);
        $877 = 3792 + ($$0296$i$i << 2) | 0; //@line 2561
        HEAP32[$722 + 28 >> 2] = $$0296$i$i; //@line 2563
        $879 = $722 + 16 | 0; //@line 2564
        HEAP32[$879 + 4 >> 2] = 0; //@line 2566
        HEAP32[$879 >> 2] = 0; //@line 2567
        $881 = HEAP32[873] | 0; //@line 2568
        $882 = 1 << $$0296$i$i; //@line 2569
        if (!($881 & $882)) {
         HEAP32[873] = $881 | $882; //@line 2574
         HEAP32[$877 >> 2] = $722; //@line 2575
         HEAP32[$722 + 24 >> 2] = $877; //@line 2577
         HEAP32[$722 + 12 >> 2] = $722; //@line 2579
         HEAP32[$722 + 8 >> 2] = $722; //@line 2581
         break;
        }
        $$0288$i$i = $$0287$i$i << (($$0296$i$i | 0) == 31 ? 0 : 25 - ($$0296$i$i >>> 1) | 0); //@line 2590
        $$0289$i$i = HEAP32[$877 >> 2] | 0; //@line 2590
        while (1) {
         if ((HEAP32[$$0289$i$i + 4 >> 2] & -8 | 0) == ($$0287$i$i | 0)) {
          label = 263; //@line 2597
          break;
         }
         $900 = $$0289$i$i + 16 + ($$0288$i$i >>> 31 << 2) | 0; //@line 2601
         $902 = HEAP32[$900 >> 2] | 0; //@line 2603
         if (!$902) {
          label = 260; //@line 2606
          break;
         } else {
          $$0288$i$i = $$0288$i$i << 1; //@line 2609
          $$0289$i$i = $902; //@line 2609
         }
        }
        if ((label | 0) == 260) {
         if ((HEAP32[876] | 0) >>> 0 > $900 >>> 0) {
          _abort(); //@line 2616
         } else {
          HEAP32[$900 >> 2] = $722; //@line 2619
          HEAP32[$722 + 24 >> 2] = $$0289$i$i; //@line 2621
          HEAP32[$722 + 12 >> 2] = $722; //@line 2623
          HEAP32[$722 + 8 >> 2] = $722; //@line 2625
          break;
         }
        } else if ((label | 0) == 263) {
         $909 = $$0289$i$i + 8 | 0; //@line 2630
         $910 = HEAP32[$909 >> 2] | 0; //@line 2631
         $911 = HEAP32[876] | 0; //@line 2632
         if ($911 >>> 0 <= $910 >>> 0 & $911 >>> 0 <= $$0289$i$i >>> 0) {
          HEAP32[$910 + 12 >> 2] = $722; //@line 2638
          HEAP32[$909 >> 2] = $722; //@line 2639
          HEAP32[$722 + 8 >> 2] = $910; //@line 2641
          HEAP32[$722 + 12 >> 2] = $$0289$i$i; //@line 2643
          HEAP32[$722 + 24 >> 2] = 0; //@line 2645
          break;
         } else {
          _abort(); //@line 2648
         }
        }
       }
      } while (0);
      $$0 = $710 + 8 | 0; //@line 2655
      STACKTOP = sp; //@line 2656
      return $$0 | 0; //@line 2656
     } else {
      $$0$i$i$i = 3936; //@line 2658
     }
    }
    while (1) {
     $919 = HEAP32[$$0$i$i$i >> 2] | 0; //@line 2662
     if ($919 >>> 0 <= $636 >>> 0) {
      $923 = $919 + (HEAP32[$$0$i$i$i + 4 >> 2] | 0) | 0; //@line 2667
      if ($923 >>> 0 > $636 >>> 0) {
       break;
      }
     }
     $$0$i$i$i = HEAP32[$$0$i$i$i + 8 >> 2] | 0; //@line 2675
    }
    $927 = $923 + -47 | 0; //@line 2677
    $929 = $927 + 8 | 0; //@line 2679
    $935 = $927 + (($929 & 7 | 0) == 0 ? 0 : 0 - $929 & 7) | 0; //@line 2685
    $936 = $636 + 16 | 0; //@line 2686
    $938 = $935 >>> 0 < $936 >>> 0 ? $636 : $935; //@line 2688
    $939 = $938 + 8 | 0; //@line 2689
    $940 = $938 + 24 | 0; //@line 2690
    $941 = $$723947$i + -40 | 0; //@line 2691
    $943 = $$748$i + 8 | 0; //@line 2693
    $948 = ($943 & 7 | 0) == 0 ? 0 : 0 - $943 & 7; //@line 2698
    $949 = $$748$i + $948 | 0; //@line 2699
    $950 = $941 - $948 | 0; //@line 2700
    HEAP32[878] = $949; //@line 2701
    HEAP32[875] = $950; //@line 2702
    HEAP32[$949 + 4 >> 2] = $950 | 1; //@line 2705
    HEAP32[$$748$i + $941 + 4 >> 2] = 40; //@line 2708
    HEAP32[879] = HEAP32[994]; //@line 2710
    $956 = $938 + 4 | 0; //@line 2711
    HEAP32[$956 >> 2] = 27; //@line 2712
    HEAP32[$939 >> 2] = HEAP32[984]; //@line 2713
    HEAP32[$939 + 4 >> 2] = HEAP32[985]; //@line 2713
    HEAP32[$939 + 8 >> 2] = HEAP32[986]; //@line 2713
    HEAP32[$939 + 12 >> 2] = HEAP32[987]; //@line 2713
    HEAP32[984] = $$748$i; //@line 2714
    HEAP32[985] = $$723947$i; //@line 2715
    HEAP32[987] = 0; //@line 2716
    HEAP32[986] = $939; //@line 2717
    $958 = $940; //@line 2718
    do {
     $958$looptemp = $958;
     $958 = $958 + 4 | 0; //@line 2720
     HEAP32[$958 >> 2] = 7; //@line 2721
    } while (($958$looptemp + 8 | 0) >>> 0 < $923 >>> 0);
    if (($938 | 0) != ($636 | 0)) {
     $964 = $938 - $636 | 0; //@line 2734
     HEAP32[$956 >> 2] = HEAP32[$956 >> 2] & -2; //@line 2737
     HEAP32[$636 + 4 >> 2] = $964 | 1; //@line 2740
     HEAP32[$938 >> 2] = $964; //@line 2741
     $969 = $964 >>> 3; //@line 2742
     if ($964 >>> 0 < 256) {
      $972 = 3528 + ($969 << 1 << 2) | 0; //@line 2746
      $973 = HEAP32[872] | 0; //@line 2747
      $974 = 1 << $969; //@line 2748
      if (!($973 & $974)) {
       HEAP32[872] = $973 | $974; //@line 2753
       $$0211$i$i = $972; //@line 2755
       $$pre$phi$i$iZ2D = $972 + 8 | 0; //@line 2755
      } else {
       $978 = $972 + 8 | 0; //@line 2757
       $979 = HEAP32[$978 >> 2] | 0; //@line 2758
       if ((HEAP32[876] | 0) >>> 0 > $979 >>> 0) {
        _abort(); //@line 2762
       } else {
        $$0211$i$i = $979; //@line 2765
        $$pre$phi$i$iZ2D = $978; //@line 2765
       }
      }
      HEAP32[$$pre$phi$i$iZ2D >> 2] = $636; //@line 2768
      HEAP32[$$0211$i$i + 12 >> 2] = $636; //@line 2770
      HEAP32[$636 + 8 >> 2] = $$0211$i$i; //@line 2772
      HEAP32[$636 + 12 >> 2] = $972; //@line 2774
      break;
     }
     $985 = $964 >>> 8; //@line 2777
     if (!$985) {
      $$0212$i$i = 0; //@line 2780
     } else {
      if ($964 >>> 0 > 16777215) {
       $$0212$i$i = 31; //@line 2784
      } else {
       $990 = ($985 + 1048320 | 0) >>> 16 & 8; //@line 2788
       $991 = $985 << $990; //@line 2789
       $994 = ($991 + 520192 | 0) >>> 16 & 4; //@line 2792
       $996 = $991 << $994; //@line 2794
       $999 = ($996 + 245760 | 0) >>> 16 & 2; //@line 2797
       $1004 = 14 - ($994 | $990 | $999) + ($996 << $999 >>> 15) | 0; //@line 2802
       $$0212$i$i = $964 >>> ($1004 + 7 | 0) & 1 | $1004 << 1; //@line 2808
      }
     }
     $1010 = 3792 + ($$0212$i$i << 2) | 0; //@line 2811
     HEAP32[$636 + 28 >> 2] = $$0212$i$i; //@line 2813
     HEAP32[$636 + 20 >> 2] = 0; //@line 2815
     HEAP32[$936 >> 2] = 0; //@line 2816
     $1013 = HEAP32[873] | 0; //@line 2817
     $1014 = 1 << $$0212$i$i; //@line 2818
     if (!($1013 & $1014)) {
      HEAP32[873] = $1013 | $1014; //@line 2823
      HEAP32[$1010 >> 2] = $636; //@line 2824
      HEAP32[$636 + 24 >> 2] = $1010; //@line 2826
      HEAP32[$636 + 12 >> 2] = $636; //@line 2828
      HEAP32[$636 + 8 >> 2] = $636; //@line 2830
      break;
     }
     $$0206$i$i = $964 << (($$0212$i$i | 0) == 31 ? 0 : 25 - ($$0212$i$i >>> 1) | 0); //@line 2839
     $$0207$i$i = HEAP32[$1010 >> 2] | 0; //@line 2839
     while (1) {
      if ((HEAP32[$$0207$i$i + 4 >> 2] & -8 | 0) == ($964 | 0)) {
       label = 289; //@line 2846
       break;
      }
      $1032 = $$0207$i$i + 16 + ($$0206$i$i >>> 31 << 2) | 0; //@line 2850
      $1034 = HEAP32[$1032 >> 2] | 0; //@line 2852
      if (!$1034) {
       label = 286; //@line 2855
       break;
      } else {
       $$0206$i$i = $$0206$i$i << 1; //@line 2858
       $$0207$i$i = $1034; //@line 2858
      }
     }
     if ((label | 0) == 286) {
      if ((HEAP32[876] | 0) >>> 0 > $1032 >>> 0) {
       _abort(); //@line 2865
      } else {
       HEAP32[$1032 >> 2] = $636; //@line 2868
       HEAP32[$636 + 24 >> 2] = $$0207$i$i; //@line 2870
       HEAP32[$636 + 12 >> 2] = $636; //@line 2872
       HEAP32[$636 + 8 >> 2] = $636; //@line 2874
       break;
      }
     } else if ((label | 0) == 289) {
      $1041 = $$0207$i$i + 8 | 0; //@line 2879
      $1042 = HEAP32[$1041 >> 2] | 0; //@line 2880
      $1043 = HEAP32[876] | 0; //@line 2881
      if ($1043 >>> 0 <= $1042 >>> 0 & $1043 >>> 0 <= $$0207$i$i >>> 0) {
       HEAP32[$1042 + 12 >> 2] = $636; //@line 2887
       HEAP32[$1041 >> 2] = $636; //@line 2888
       HEAP32[$636 + 8 >> 2] = $1042; //@line 2890
       HEAP32[$636 + 12 >> 2] = $$0207$i$i; //@line 2892
       HEAP32[$636 + 24 >> 2] = 0; //@line 2894
       break;
      } else {
       _abort(); //@line 2897
      }
     }
    }
   }
  } while (0);
  $1052 = HEAP32[875] | 0; //@line 2904
  if ($1052 >>> 0 > $$0197 >>> 0) {
   $1054 = $1052 - $$0197 | 0; //@line 2907
   HEAP32[875] = $1054; //@line 2908
   $1055 = HEAP32[878] | 0; //@line 2909
   $1056 = $1055 + $$0197 | 0; //@line 2910
   HEAP32[878] = $1056; //@line 2911
   HEAP32[$1056 + 4 >> 2] = $1054 | 1; //@line 2914
   HEAP32[$1055 + 4 >> 2] = $$0197 | 3; //@line 2917
   $$0 = $1055 + 8 | 0; //@line 2919
   STACKTOP = sp; //@line 2920
   return $$0 | 0; //@line 2920
  }
 }
 HEAP32[(___errno_location() | 0) >> 2] = 12; //@line 2924
 $$0 = 0; //@line 2925
 STACKTOP = sp; //@line 2926
 return $$0 | 0; //@line 2926
}
function _fmt_fp($0, $1, $2, $3, $4, $5) {
 $0 = $0 | 0;
 $1 = +$1;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 $5 = $5 | 0;
 var $$$3484 = 0, $$$3484700 = 0, $$$4502 = 0, $$$564 = 0.0, $$0 = 0, $$0463$lcssa = 0, $$0463587 = 0, $$0464597 = 0, $$0471 = 0.0, $$0479 = 0, $$0487644 = 0, $$0488655 = 0, $$0488657 = 0, $$0496$$9 = 0, $$0497656 = 0, $$0498 = 0, $$0509585 = 0.0, $$0511 = 0, $$0514639 = 0, $$0520 = 0, $$0521 = 0, $$0521$ = 0, $$0523 = 0, $$0527$in633 = 0, $$0530638 = 0, $$1465 = 0, $$1467 = 0.0, $$1469 = 0.0, $$1472 = 0.0, $$1480 = 0, $$1482$lcssa = 0, $$1482663 = 0, $$1489643 = 0, $$1499$lcssa = 0, $$1499662 = 0, $$1508586 = 0, $$1512$lcssa = 0, $$1512610 = 0, $$1515 = 0, $$1524 = 0, $$1528617 = 0, $$1531$lcssa = 0, $$1531632 = 0, $$1601 = 0, $$2 = 0, $$2473 = 0.0, $$2476 = 0, $$2483$ph = 0, $$2500 = 0, $$2513 = 0, $$2516621 = 0, $$2529 = 0, $$2532620 = 0, $$3 = 0.0, $$3477 = 0, $$3484$lcssa = 0, $$3484650 = 0, $$3501$lcssa = 0, $$3501649 = 0, $$3533616 = 0, $$4 = 0.0, $$4478$lcssa = 0, $$4478593 = 0, $$4492 = 0, $$4502 = 0, $$4518 = 0, $$5$lcssa = 0, $$540 = 0, $$540$ = 0, $$543 = 0.0, $$548 = 0, $$5486$lcssa = 0, $$5486626 = 0, $$5493600 = 0, $$550 = 0, $$5519$ph = 0, $$5605 = 0, $$561 = 0, $$6 = 0, $$6494592 = 0, $$7495604 = 0, $$7505 = 0, $$7505$ = 0, $$7505$ph = 0, $$8 = 0, $$9$ph = 0, $$lcssa675 = 0, $$pn = 0, $$pr = 0, $$pr566 = 0, $$pre$phi691Z2D = 0, $$pre$phi698Z2D = 0, $$pre693 = 0, $$sink = 0, $$sink547$lcssa = 0, $$sink547625 = 0, $$sink560 = 0, $10 = 0, $101 = 0, $104 = 0, $106 = 0, $11 = 0, $113 = 0, $116 = 0, $124 = 0, $125 = 0, $128 = 0, $130 = 0, $131 = 0, $132 = 0, $138 = 0, $140 = 0, $144 = 0, $149 = 0, $150 = 0, $151 = 0, $152 = 0, $154 = 0, $160 = 0, $161 = 0, $162 = 0, $174 = 0, $185 = 0, $189 = 0, $190 = 0, $193 = 0, $198 = 0, $199 = 0, $201 = 0, $209 = 0, $212 = 0, $213 = 0, $215 = 0, $217 = 0, $218 = 0, $221 = 0, $225 = 0, $230 = 0, $233 = 0, $236 = 0, $238 = 0, $240 = 0, $242 = 0, $247 = 0, $248 = 0, $251 = 0, $253 = 0, $256 = 0, $259 = 0, $267 = 0, $27 = 0, $270 = 0, $275 = 0, $284 = 0, $285 = 0, $289 = 0, $292 = 0, $294 = 0, $296 = 0, $300 = 0, $303 = 0, $304 = 0, $308 = 0, $31 = 0, $318 = 0, $323 = 0, $326 = 0, $327 = 0, $328 = 0, $330 = 0, $335 = 0, $347 = 0, $35 = 0.0, $351 = 0, $356 = 0, $36 = 0, $363 = 0, $364 = 0, $365 = 0, $366 = 0, $367 = 0, $369 = 0, $373 = 0, $375 = 0, $378 = 0, $381 = 0, $39 = 0, $41 = 0, $44 = 0, $46 = 0, $6 = 0, $60 = 0, $63 = 0, $66 = 0, $68 = 0, $7 = 0, $76 = 0, $77 = 0, $79 = 0, $8 = 0, $80 = 0, $86 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 6003
 STACKTOP = STACKTOP + 560 | 0; //@line 6004
 $6 = sp + 8 | 0; //@line 6005
 $7 = sp; //@line 6006
 $8 = sp + 524 | 0; //@line 6007
 $9 = $8; //@line 6008
 $10 = sp + 512 | 0; //@line 6009
 HEAP32[$7 >> 2] = 0; //@line 6010
 $11 = $10 + 12 | 0; //@line 6011
 ___DOUBLE_BITS_677($1) | 0; //@line 6012
 if ((tempRet0 | 0) < 0) {
  $$0471 = -$1; //@line 6017
  $$0520 = 1; //@line 6017
  $$0521 = 1342; //@line 6017
 } else {
  $$0471 = $1; //@line 6028
  $$0520 = ($4 & 2049 | 0) != 0 & 1; //@line 6028
  $$0521 = ($4 & 2048 | 0) == 0 ? ($4 & 1 | 0) == 0 ? 1343 : 1348 : 1345; //@line 6028
 }
 ___DOUBLE_BITS_677($$0471) | 0; //@line 6030
 do {
  if (0 == 0 & (tempRet0 & 2146435072 | 0) == 2146435072) {
   $27 = ($5 & 32 | 0) != 0; //@line 6039
   $31 = $$0520 + 3 | 0; //@line 6044
   _pad_676($0, 32, $2, $31, $4 & -65537); //@line 6046
   _out_670($0, $$0521, $$0520); //@line 6047
   _out_670($0, $$0471 != $$0471 | 0.0 != 0.0 ? $27 ? 1369 : 1373 : $27 ? 1361 : 1365, 3); //@line 6048
   _pad_676($0, 32, $2, $31, $4 ^ 8192); //@line 6050
   $$sink560 = $31; //@line 6051
  } else {
   $35 = +_frexpl($$0471, $7) * 2.0; //@line 6054
   $36 = $35 != 0.0; //@line 6055
   if ($36) {
    HEAP32[$7 >> 2] = (HEAP32[$7 >> 2] | 0) + -1; //@line 6059
   }
   $39 = $5 | 32; //@line 6061
   if (($39 | 0) == 97) {
    $41 = $5 & 32; //@line 6064
    $$0521$ = ($41 | 0) == 0 ? $$0521 : $$0521 + 9 | 0; //@line 6067
    $44 = $$0520 | 2; //@line 6068
    $46 = 12 - $3 | 0; //@line 6070
    do {
     if ($3 >>> 0 > 11 | ($46 | 0) == 0) {
      $$1472 = $35; //@line 6075
     } else {
      $$0509585 = 8.0; //@line 6077
      $$1508586 = $46; //@line 6077
      do {
       $$1508586 = $$1508586 + -1 | 0; //@line 6079
       $$0509585 = $$0509585 * 16.0; //@line 6080
      } while (($$1508586 | 0) != 0);
      if ((HEAP8[$$0521$ >> 0] | 0) == 45) {
       $$1472 = -($$0509585 + (-$35 - $$0509585)); //@line 6095
       break;
      } else {
       $$1472 = $35 + $$0509585 - $$0509585; //@line 6100
       break;
      }
     }
    } while (0);
    $60 = HEAP32[$7 >> 2] | 0; //@line 6105
    $63 = ($60 | 0) < 0 ? 0 - $60 | 0 : $60; //@line 6108
    $66 = _fmt_u($63, (($63 | 0) < 0) << 31 >> 31, $11) | 0; //@line 6111
    if (($66 | 0) == ($11 | 0)) {
     $68 = $10 + 11 | 0; //@line 6114
     HEAP8[$68 >> 0] = 48; //@line 6115
     $$0511 = $68; //@line 6116
    } else {
     $$0511 = $66; //@line 6118
    }
    HEAP8[$$0511 + -1 >> 0] = ($60 >> 31 & 2) + 43; //@line 6125
    $76 = $$0511 + -2 | 0; //@line 6128
    HEAP8[$76 >> 0] = $5 + 15; //@line 6129
    $77 = ($3 | 0) < 1; //@line 6130
    $79 = ($4 & 8 | 0) == 0; //@line 6132
    $$0523 = $8; //@line 6133
    $$2473 = $$1472; //@line 6133
    while (1) {
     $80 = ~~$$2473; //@line 6135
     $86 = $$0523 + 1 | 0; //@line 6141
     HEAP8[$$0523 >> 0] = $41 | HEAPU8[1377 + $80 >> 0]; //@line 6142
     $$2473 = ($$2473 - +($80 | 0)) * 16.0; //@line 6145
     if (($86 - $9 | 0) == 1) {
      if ($79 & ($77 & $$2473 == 0.0)) {
       $$1524 = $86; //@line 6154
      } else {
       HEAP8[$86 >> 0] = 46; //@line 6157
       $$1524 = $$0523 + 2 | 0; //@line 6158
      }
     } else {
      $$1524 = $86; //@line 6161
     }
     if (!($$2473 != 0.0)) {
      break;
     } else {
      $$0523 = $$1524; //@line 6165
     }
    }
    $$pre693 = $$1524; //@line 6171
    if (!$3) {
     label = 24; //@line 6173
    } else {
     if ((-2 - $9 + $$pre693 | 0) < ($3 | 0)) {
      $$pre$phi691Z2D = $$pre693 - $9 | 0; //@line 6181
      $$sink = $3 + 2 | 0; //@line 6181
     } else {
      label = 24; //@line 6183
     }
    }
    if ((label | 0) == 24) {
     $101 = $$pre693 - $9 | 0; //@line 6187
     $$pre$phi691Z2D = $101; //@line 6188
     $$sink = $101; //@line 6188
    }
    $104 = $11 - $76 | 0; //@line 6192
    $106 = $104 + $44 + $$sink | 0; //@line 6194
    _pad_676($0, 32, $2, $106, $4); //@line 6195
    _out_670($0, $$0521$, $44); //@line 6196
    _pad_676($0, 48, $2, $106, $4 ^ 65536); //@line 6198
    _out_670($0, $8, $$pre$phi691Z2D); //@line 6199
    _pad_676($0, 48, $$sink - $$pre$phi691Z2D | 0, 0, 0); //@line 6201
    _out_670($0, $76, $104); //@line 6202
    _pad_676($0, 32, $2, $106, $4 ^ 8192); //@line 6204
    $$sink560 = $106; //@line 6205
    break;
   }
   $$540 = ($3 | 0) < 0 ? 6 : $3; //@line 6209
   if ($36) {
    $113 = (HEAP32[$7 >> 2] | 0) + -28 | 0; //@line 6213
    HEAP32[$7 >> 2] = $113; //@line 6214
    $$3 = $35 * 268435456.0; //@line 6215
    $$pr = $113; //@line 6215
   } else {
    $$3 = $35; //@line 6218
    $$pr = HEAP32[$7 >> 2] | 0; //@line 6218
   }
   $$561 = ($$pr | 0) < 0 ? $6 : $6 + 288 | 0; //@line 6222
   $$0498 = $$561; //@line 6223
   $$4 = $$3; //@line 6223
   do {
    $116 = ~~$$4 >>> 0; //@line 6225
    HEAP32[$$0498 >> 2] = $116; //@line 6226
    $$0498 = $$0498 + 4 | 0; //@line 6227
    $$4 = ($$4 - +($116 >>> 0)) * 1.0e9; //@line 6230
   } while ($$4 != 0.0);
   if (($$pr | 0) > 0) {
    $$1482663 = $$561; //@line 6240
    $$1499662 = $$0498; //@line 6240
    $124 = $$pr; //@line 6240
    while (1) {
     $125 = ($124 | 0) < 29 ? $124 : 29; //@line 6243
     $$0488655 = $$1499662 + -4 | 0; //@line 6244
     if ($$0488655 >>> 0 < $$1482663 >>> 0) {
      $$2483$ph = $$1482663; //@line 6247
     } else {
      $$0488657 = $$0488655; //@line 6249
      $$0497656 = 0; //@line 6249
      do {
       $128 = _bitshift64Shl(HEAP32[$$0488657 >> 2] | 0, 0, $125 | 0) | 0; //@line 6252
       $130 = _i64Add($128 | 0, tempRet0 | 0, $$0497656 | 0, 0) | 0; //@line 6254
       $131 = tempRet0; //@line 6255
       $132 = ___uremdi3($130 | 0, $131 | 0, 1e9, 0) | 0; //@line 6256
       HEAP32[$$0488657 >> 2] = $132; //@line 6258
       $$0497656 = ___udivdi3($130 | 0, $131 | 0, 1e9, 0) | 0; //@line 6259
       $$0488657 = $$0488657 + -4 | 0; //@line 6261
      } while ($$0488657 >>> 0 >= $$1482663 >>> 0);
      if (!$$0497656) {
       $$2483$ph = $$1482663; //@line 6271
      } else {
       $138 = $$1482663 + -4 | 0; //@line 6273
       HEAP32[$138 >> 2] = $$0497656; //@line 6274
       $$2483$ph = $138; //@line 6275
      }
     }
     $$2500 = $$1499662; //@line 6278
     while (1) {
      if ($$2500 >>> 0 <= $$2483$ph >>> 0) {
       break;
      }
      $140 = $$2500 + -4 | 0; //@line 6284
      if (!(HEAP32[$140 >> 2] | 0)) {
       $$2500 = $140; //@line 6288
      } else {
       break;
      }
     }
     $144 = (HEAP32[$7 >> 2] | 0) - $125 | 0; //@line 6294
     HEAP32[$7 >> 2] = $144; //@line 6295
     if (($144 | 0) > 0) {
      $$1482663 = $$2483$ph; //@line 6298
      $$1499662 = $$2500; //@line 6298
      $124 = $144; //@line 6298
     } else {
      $$1482$lcssa = $$2483$ph; //@line 6300
      $$1499$lcssa = $$2500; //@line 6300
      $$pr566 = $144; //@line 6300
      break;
     }
    }
   } else {
    $$1482$lcssa = $$561; //@line 6305
    $$1499$lcssa = $$0498; //@line 6305
    $$pr566 = $$pr; //@line 6305
   }
   if (($$pr566 | 0) < 0) {
    $149 = (($$540 + 25 | 0) / 9 | 0) + 1 | 0; //@line 6311
    $150 = ($39 | 0) == 102; //@line 6312
    $$3484650 = $$1482$lcssa; //@line 6313
    $$3501649 = $$1499$lcssa; //@line 6313
    $152 = $$pr566; //@line 6313
    while (1) {
     $151 = 0 - $152 | 0; //@line 6315
     $154 = ($151 | 0) < 9 ? $151 : 9; //@line 6317
     if ($$3484650 >>> 0 < $$3501649 >>> 0) {
      $160 = (1 << $154) + -1 | 0; //@line 6321
      $161 = 1e9 >>> $154; //@line 6322
      $$0487644 = 0; //@line 6323
      $$1489643 = $$3484650; //@line 6323
      do {
       $162 = HEAP32[$$1489643 >> 2] | 0; //@line 6325
       HEAP32[$$1489643 >> 2] = ($162 >>> $154) + $$0487644; //@line 6329
       $$0487644 = Math_imul($162 & $160, $161) | 0; //@line 6330
       $$1489643 = $$1489643 + 4 | 0; //@line 6331
      } while ($$1489643 >>> 0 < $$3501649 >>> 0);
      $$$3484 = (HEAP32[$$3484650 >> 2] | 0) == 0 ? $$3484650 + 4 | 0 : $$3484650; //@line 6342
      if (!$$0487644) {
       $$$3484700 = $$$3484; //@line 6345
       $$4502 = $$3501649; //@line 6345
      } else {
       HEAP32[$$3501649 >> 2] = $$0487644; //@line 6348
       $$$3484700 = $$$3484; //@line 6349
       $$4502 = $$3501649 + 4 | 0; //@line 6349
      }
     } else {
      $$$3484700 = (HEAP32[$$3484650 >> 2] | 0) == 0 ? $$3484650 + 4 | 0 : $$3484650; //@line 6356
      $$4502 = $$3501649; //@line 6356
     }
     $174 = $150 ? $$561 : $$$3484700; //@line 6358
     $$$4502 = ($$4502 - $174 >> 2 | 0) > ($149 | 0) ? $174 + ($149 << 2) | 0 : $$4502; //@line 6365
     $152 = (HEAP32[$7 >> 2] | 0) + $154 | 0; //@line 6367
     HEAP32[$7 >> 2] = $152; //@line 6368
     if (($152 | 0) >= 0) {
      $$3484$lcssa = $$$3484700; //@line 6373
      $$3501$lcssa = $$$4502; //@line 6373
      break;
     } else {
      $$3484650 = $$$3484700; //@line 6371
      $$3501649 = $$$4502; //@line 6371
     }
    }
   } else {
    $$3484$lcssa = $$1482$lcssa; //@line 6378
    $$3501$lcssa = $$1499$lcssa; //@line 6378
   }
   $185 = $$561; //@line 6381
   if ($$3484$lcssa >>> 0 < $$3501$lcssa >>> 0) {
    $189 = ($185 - $$3484$lcssa >> 2) * 9 | 0; //@line 6386
    $190 = HEAP32[$$3484$lcssa >> 2] | 0; //@line 6387
    if ($190 >>> 0 < 10) {
     $$1515 = $189; //@line 6390
    } else {
     $$0514639 = $189; //@line 6392
     $$0530638 = 10; //@line 6392
     while (1) {
      $$0530638 = $$0530638 * 10 | 0; //@line 6394
      $193 = $$0514639 + 1 | 0; //@line 6395
      if ($190 >>> 0 < $$0530638 >>> 0) {
       $$1515 = $193; //@line 6398
       break;
      } else {
       $$0514639 = $193; //@line 6401
      }
     }
    }
   } else {
    $$1515 = 0; //@line 6406
   }
   $198 = ($39 | 0) == 103; //@line 6411
   $199 = ($$540 | 0) != 0; //@line 6412
   $201 = $$540 - (($39 | 0) != 102 ? $$1515 : 0) + (($199 & $198) << 31 >> 31) | 0; //@line 6415
   if (($201 | 0) < ((($$3501$lcssa - $185 >> 2) * 9 | 0) + -9 | 0)) {
    $209 = $201 + 9216 | 0; //@line 6424
    $212 = $$561 + 4 + ((($209 | 0) / 9 | 0) + -1024 << 2) | 0; //@line 6427
    $213 = ($209 | 0) % 9 | 0; //@line 6428
    if (($213 | 0) < 8) {
     $$0527$in633 = $213; //@line 6431
     $$1531632 = 10; //@line 6431
     while (1) {
      $215 = $$1531632 * 10 | 0; //@line 6434
      if (($$0527$in633 | 0) < 7) {
       $$0527$in633 = $$0527$in633 + 1 | 0; //@line 6437
       $$1531632 = $215; //@line 6437
      } else {
       $$1531$lcssa = $215; //@line 6439
       break;
      }
     }
    } else {
     $$1531$lcssa = 10; //@line 6444
    }
    $217 = HEAP32[$212 >> 2] | 0; //@line 6446
    $218 = ($217 >>> 0) % ($$1531$lcssa >>> 0) | 0; //@line 6447
    $221 = ($212 + 4 | 0) == ($$3501$lcssa | 0); //@line 6450
    if ($221 & ($218 | 0) == 0) {
     $$4492 = $212; //@line 6453
     $$4518 = $$1515; //@line 6453
     $$8 = $$3484$lcssa; //@line 6453
    } else {
     $$543 = ((($217 >>> 0) / ($$1531$lcssa >>> 0) | 0) & 1 | 0) == 0 ? 9007199254740992.0 : 9007199254740994.0; //@line 6458
     $225 = ($$1531$lcssa | 0) / 2 | 0; //@line 6459
     $$$564 = $218 >>> 0 < $225 >>> 0 ? .5 : $221 & ($218 | 0) == ($225 | 0) ? 1.0 : 1.5; //@line 6464
     if (!$$0520) {
      $$1467 = $$$564; //@line 6467
      $$1469 = $$543; //@line 6467
     } else {
      $230 = (HEAP8[$$0521 >> 0] | 0) == 45; //@line 6470
      $$1467 = $230 ? -$$$564 : $$$564; //@line 6475
      $$1469 = $230 ? -$$543 : $$543; //@line 6475
     }
     $233 = $217 - $218 | 0; //@line 6477
     HEAP32[$212 >> 2] = $233; //@line 6478
     if ($$1469 + $$1467 != $$1469) {
      $236 = $233 + $$1531$lcssa | 0; //@line 6482
      HEAP32[$212 >> 2] = $236; //@line 6483
      if ($236 >>> 0 > 999999999) {
       $$5486626 = $$3484$lcssa; //@line 6486
       $$sink547625 = $212; //@line 6486
       while (1) {
        $238 = $$sink547625 + -4 | 0; //@line 6488
        HEAP32[$$sink547625 >> 2] = 0; //@line 6489
        if ($238 >>> 0 < $$5486626 >>> 0) {
         $240 = $$5486626 + -4 | 0; //@line 6492
         HEAP32[$240 >> 2] = 0; //@line 6493
         $$6 = $240; //@line 6494
        } else {
         $$6 = $$5486626; //@line 6496
        }
        $242 = (HEAP32[$238 >> 2] | 0) + 1 | 0; //@line 6499
        HEAP32[$238 >> 2] = $242; //@line 6500
        if ($242 >>> 0 > 999999999) {
         $$5486626 = $$6; //@line 6503
         $$sink547625 = $238; //@line 6503
        } else {
         $$5486$lcssa = $$6; //@line 6505
         $$sink547$lcssa = $238; //@line 6505
         break;
        }
       }
      } else {
       $$5486$lcssa = $$3484$lcssa; //@line 6510
       $$sink547$lcssa = $212; //@line 6510
      }
      $247 = ($185 - $$5486$lcssa >> 2) * 9 | 0; //@line 6515
      $248 = HEAP32[$$5486$lcssa >> 2] | 0; //@line 6516
      if ($248 >>> 0 < 10) {
       $$4492 = $$sink547$lcssa; //@line 6519
       $$4518 = $247; //@line 6519
       $$8 = $$5486$lcssa; //@line 6519
      } else {
       $$2516621 = $247; //@line 6521
       $$2532620 = 10; //@line 6521
       while (1) {
        $$2532620 = $$2532620 * 10 | 0; //@line 6523
        $251 = $$2516621 + 1 | 0; //@line 6524
        if ($248 >>> 0 < $$2532620 >>> 0) {
         $$4492 = $$sink547$lcssa; //@line 6527
         $$4518 = $251; //@line 6527
         $$8 = $$5486$lcssa; //@line 6527
         break;
        } else {
         $$2516621 = $251; //@line 6530
        }
       }
      }
     } else {
      $$4492 = $212; //@line 6535
      $$4518 = $$1515; //@line 6535
      $$8 = $$3484$lcssa; //@line 6535
     }
    }
    $253 = $$4492 + 4 | 0; //@line 6538
    $$5519$ph = $$4518; //@line 6541
    $$7505$ph = $$3501$lcssa >>> 0 > $253 >>> 0 ? $253 : $$3501$lcssa; //@line 6541
    $$9$ph = $$8; //@line 6541
   } else {
    $$5519$ph = $$1515; //@line 6543
    $$7505$ph = $$3501$lcssa; //@line 6543
    $$9$ph = $$3484$lcssa; //@line 6543
   }
   $$7505 = $$7505$ph; //@line 6545
   while (1) {
    if ($$7505 >>> 0 <= $$9$ph >>> 0) {
     $$lcssa675 = 0; //@line 6549
     break;
    }
    $256 = $$7505 + -4 | 0; //@line 6552
    if (!(HEAP32[$256 >> 2] | 0)) {
     $$7505 = $256; //@line 6556
    } else {
     $$lcssa675 = 1; //@line 6558
     break;
    }
   }
   $259 = 0 - $$5519$ph | 0; //@line 6562
   do {
    if ($198) {
     $$540$ = $$540 + (($199 ^ 1) & 1) | 0; //@line 6567
     if (($$540$ | 0) > ($$5519$ph | 0) & ($$5519$ph | 0) > -5) {
      $$0479 = $5 + -1 | 0; //@line 6575
      $$2476 = $$540$ + -1 - $$5519$ph | 0; //@line 6575
     } else {
      $$0479 = $5 + -2 | 0; //@line 6579
      $$2476 = $$540$ + -1 | 0; //@line 6579
     }
     $267 = $4 & 8; //@line 6581
     if (!$267) {
      if ($$lcssa675) {
       $270 = HEAP32[$$7505 + -4 >> 2] | 0; //@line 6586
       if (!$270) {
        $$2529 = 9; //@line 6589
       } else {
        if (!(($270 >>> 0) % 10 | 0)) {
         $$1528617 = 0; //@line 6594
         $$3533616 = 10; //@line 6594
         while (1) {
          $$3533616 = $$3533616 * 10 | 0; //@line 6596
          $275 = $$1528617 + 1 | 0; //@line 6597
          if (($270 >>> 0) % ($$3533616 >>> 0) | 0 | 0) {
           $$2529 = $275; //@line 6603
           break;
          } else {
           $$1528617 = $275; //@line 6601
          }
         }
        } else {
         $$2529 = 0; //@line 6608
        }
       }
      } else {
       $$2529 = 9; //@line 6612
      }
      $284 = (($$7505 - $185 >> 2) * 9 | 0) + -9 | 0; //@line 6620
      if (($$0479 | 32 | 0) == 102) {
       $285 = $284 - $$2529 | 0; //@line 6622
       $$548 = ($285 | 0) > 0 ? $285 : 0; //@line 6624
       $$1480 = $$0479; //@line 6627
       $$3477 = ($$2476 | 0) < ($$548 | 0) ? $$2476 : $$548; //@line 6627
       $$pre$phi698Z2D = 0; //@line 6627
       break;
      } else {
       $289 = $284 + $$5519$ph - $$2529 | 0; //@line 6631
       $$550 = ($289 | 0) > 0 ? $289 : 0; //@line 6633
       $$1480 = $$0479; //@line 6636
       $$3477 = ($$2476 | 0) < ($$550 | 0) ? $$2476 : $$550; //@line 6636
       $$pre$phi698Z2D = 0; //@line 6636
       break;
      }
     } else {
      $$1480 = $$0479; //@line 6640
      $$3477 = $$2476; //@line 6640
      $$pre$phi698Z2D = $267; //@line 6640
     }
    } else {
     $$1480 = $5; //@line 6644
     $$3477 = $$540; //@line 6644
     $$pre$phi698Z2D = $4 & 8; //@line 6644
    }
   } while (0);
   $292 = $$3477 | $$pre$phi698Z2D; //@line 6647
   $294 = ($292 | 0) != 0 & 1; //@line 6649
   $296 = ($$1480 | 32 | 0) == 102; //@line 6651
   if ($296) {
    $$2513 = 0; //@line 6655
    $$pn = ($$5519$ph | 0) > 0 ? $$5519$ph : 0; //@line 6655
   } else {
    $300 = ($$5519$ph | 0) < 0 ? $259 : $$5519$ph; //@line 6658
    $303 = _fmt_u($300, (($300 | 0) < 0) << 31 >> 31, $11) | 0; //@line 6661
    $304 = $11; //@line 6662
    if (($304 - $303 | 0) < 2) {
     $$1512610 = $303; //@line 6667
     while (1) {
      $308 = $$1512610 + -1 | 0; //@line 6669
      HEAP8[$308 >> 0] = 48; //@line 6670
      if (($304 - $308 | 0) < 2) {
       $$1512610 = $308; //@line 6675
      } else {
       $$1512$lcssa = $308; //@line 6677
       break;
      }
     }
    } else {
     $$1512$lcssa = $303; //@line 6682
    }
    HEAP8[$$1512$lcssa + -1 >> 0] = ($$5519$ph >> 31 & 2) + 43; //@line 6689
    $318 = $$1512$lcssa + -2 | 0; //@line 6691
    HEAP8[$318 >> 0] = $$1480; //@line 6692
    $$2513 = $318; //@line 6695
    $$pn = $304 - $318 | 0; //@line 6695
   }
   $323 = $$0520 + 1 + $$3477 + $294 + $$pn | 0; //@line 6700
   _pad_676($0, 32, $2, $323, $4); //@line 6701
   _out_670($0, $$0521, $$0520); //@line 6702
   _pad_676($0, 48, $2, $323, $4 ^ 65536); //@line 6704
   if ($296) {
    $$0496$$9 = $$9$ph >>> 0 > $$561 >>> 0 ? $$561 : $$9$ph; //@line 6707
    $326 = $8 + 9 | 0; //@line 6708
    $327 = $326; //@line 6709
    $328 = $8 + 8 | 0; //@line 6710
    $$5493600 = $$0496$$9; //@line 6711
    do {
     $330 = _fmt_u(HEAP32[$$5493600 >> 2] | 0, 0, $326) | 0; //@line 6714
     if (($$5493600 | 0) == ($$0496$$9 | 0)) {
      if (($330 | 0) == ($326 | 0)) {
       HEAP8[$328 >> 0] = 48; //@line 6719
       $$1465 = $328; //@line 6720
      } else {
       $$1465 = $330; //@line 6722
      }
     } else {
      if ($330 >>> 0 > $8 >>> 0) {
       _memset($8 | 0, 48, $330 - $9 | 0) | 0; //@line 6729
       $$0464597 = $330; //@line 6730
       while (1) {
        $335 = $$0464597 + -1 | 0; //@line 6732
        if ($335 >>> 0 > $8 >>> 0) {
         $$0464597 = $335; //@line 6735
        } else {
         $$1465 = $335; //@line 6737
         break;
        }
       }
      } else {
       $$1465 = $330; //@line 6742
      }
     }
     _out_670($0, $$1465, $327 - $$1465 | 0); //@line 6747
     $$5493600 = $$5493600 + 4 | 0; //@line 6748
    } while ($$5493600 >>> 0 <= $$561 >>> 0);
    if ($292 | 0) {
     _out_670($0, 1393, 1); //@line 6758
    }
    if ($$5493600 >>> 0 < $$7505 >>> 0 & ($$3477 | 0) > 0) {
     $$4478593 = $$3477; //@line 6764
     $$6494592 = $$5493600; //@line 6764
     while (1) {
      $347 = _fmt_u(HEAP32[$$6494592 >> 2] | 0, 0, $326) | 0; //@line 6767
      if ($347 >>> 0 > $8 >>> 0) {
       _memset($8 | 0, 48, $347 - $9 | 0) | 0; //@line 6772
       $$0463587 = $347; //@line 6773
       while (1) {
        $351 = $$0463587 + -1 | 0; //@line 6775
        if ($351 >>> 0 > $8 >>> 0) {
         $$0463587 = $351; //@line 6778
        } else {
         $$0463$lcssa = $351; //@line 6780
         break;
        }
       }
      } else {
       $$0463$lcssa = $347; //@line 6785
      }
      _out_670($0, $$0463$lcssa, ($$4478593 | 0) < 9 ? $$4478593 : 9); //@line 6789
      $$6494592 = $$6494592 + 4 | 0; //@line 6790
      $356 = $$4478593 + -9 | 0; //@line 6791
      if (!($$6494592 >>> 0 < $$7505 >>> 0 & ($$4478593 | 0) > 9)) {
       $$4478$lcssa = $356; //@line 6798
       break;
      } else {
       $$4478593 = $356; //@line 6796
      }
     }
    } else {
     $$4478$lcssa = $$3477; //@line 6803
    }
    _pad_676($0, 48, $$4478$lcssa + 9 | 0, 9, 0); //@line 6806
   } else {
    $$7505$ = $$lcssa675 ? $$7505 : $$9$ph + 4 | 0; //@line 6809
    if (($$3477 | 0) > -1) {
     $363 = $8 + 9 | 0; //@line 6812
     $364 = ($$pre$phi698Z2D | 0) == 0; //@line 6813
     $365 = $363; //@line 6814
     $366 = 0 - $9 | 0; //@line 6815
     $367 = $8 + 8 | 0; //@line 6816
     $$5605 = $$3477; //@line 6817
     $$7495604 = $$9$ph; //@line 6817
     while (1) {
      $369 = _fmt_u(HEAP32[$$7495604 >> 2] | 0, 0, $363) | 0; //@line 6820
      if (($369 | 0) == ($363 | 0)) {
       HEAP8[$367 >> 0] = 48; //@line 6823
       $$0 = $367; //@line 6824
      } else {
       $$0 = $369; //@line 6826
      }
      do {
       if (($$7495604 | 0) == ($$9$ph | 0)) {
        $375 = $$0 + 1 | 0; //@line 6831
        _out_670($0, $$0, 1); //@line 6832
        if ($364 & ($$5605 | 0) < 1) {
         $$2 = $375; //@line 6836
         break;
        }
        _out_670($0, 1393, 1); //@line 6839
        $$2 = $375; //@line 6840
       } else {
        if ($$0 >>> 0 <= $8 >>> 0) {
         $$2 = $$0; //@line 6844
         break;
        }
        _memset($8 | 0, 48, $$0 + $366 | 0) | 0; //@line 6849
        $$1601 = $$0; //@line 6850
        while (1) {
         $373 = $$1601 + -1 | 0; //@line 6852
         if ($373 >>> 0 > $8 >>> 0) {
          $$1601 = $373; //@line 6855
         } else {
          $$2 = $373; //@line 6857
          break;
         }
        }
       }
      } while (0);
      $378 = $365 - $$2 | 0; //@line 6864
      _out_670($0, $$2, ($$5605 | 0) > ($378 | 0) ? $378 : $$5605); //@line 6867
      $381 = $$5605 - $378 | 0; //@line 6868
      $$7495604 = $$7495604 + 4 | 0; //@line 6869
      if (!($$7495604 >>> 0 < $$7505$ >>> 0 & ($381 | 0) > -1)) {
       $$5$lcssa = $381; //@line 6876
       break;
      } else {
       $$5605 = $381; //@line 6874
      }
     }
    } else {
     $$5$lcssa = $$3477; //@line 6881
    }
    _pad_676($0, 48, $$5$lcssa + 18 | 0, 18, 0); //@line 6884
    _out_670($0, $$2513, $11 - $$2513 | 0); //@line 6888
   }
   _pad_676($0, 32, $2, $323, $4 ^ 8192); //@line 6891
   $$sink560 = $323; //@line 6892
  }
 } while (0);
 STACKTOP = sp; //@line 6897
 return (($$sink560 | 0) < ($2 | 0) ? $2 : $$sink560) | 0; //@line 6897
}
function _printf_core($0, $1, $2, $3, $4) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 var $$$5 = 0, $$0 = 0, $$0228 = 0, $$0229316 = 0, $$0232 = 0, $$0235 = 0, $$0237 = 0, $$0240$lcssa = 0, $$0240$lcssa356 = 0, $$0240315 = 0, $$0243 = 0, $$0247 = 0, $$0249$lcssa = 0, $$0249303 = 0, $$0252 = 0, $$0253 = 0, $$0254 = 0, $$0259 = 0, $$0262$lcssa = 0, $$0262309 = 0, $$0269 = 0, $$1 = 0, $$1230327 = 0, $$1233 = 0, $$1236 = 0, $$1238 = 0, $$1241326 = 0, $$1244314 = 0, $$1248 = 0, $$1255 = 0, $$1260 = 0, $$1263 = 0, $$1263$ = 0, $$1270 = 0, $$2 = 0, $$2234 = 0, $$2239 = 0, $$2242$lcssa = 0, $$2242302 = 0, $$2245 = 0, $$2251 = 0, $$2256 = 0, $$2261 = 0, $$2271 = 0, $$3265 = 0, $$3272 = 0, $$3300 = 0, $$4258354 = 0, $$4266 = 0, $$5 = 0, $$6268 = 0, $$lcssa291 = 0, $$lcssa292 = 0, $$pre342 = 0, $$pre345 = 0, $$pre348 = 0, $$sink = 0, $10 = 0, $105 = 0, $106 = 0, $109 = 0, $11 = 0, $112 = 0, $115 = 0, $12 = 0, $125 = 0, $129 = 0, $13 = 0, $14 = 0, $140 = 0, $144 = 0, $151 = 0, $152 = 0, $154 = 0, $156 = 0, $158 = 0, $167 = 0, $168 = 0, $173 = 0, $176 = 0, $181 = 0, $182 = 0, $187 = 0, $189 = 0, $196 = 0, $197 = 0, $20 = 0, $208 = 0, $21 = 0, $220 = 0, $227 = 0, $229 = 0, $23 = 0, $232 = 0, $234 = 0, $24 = 0, $242 = 0, $244 = 0, $247 = 0, $248 = 0, $25 = 0, $252 = 0, $256 = 0, $258 = 0, $261 = 0, $263 = 0, $264 = 0, $265 = 0, $27 = 0, $275 = 0, $276 = 0, $281 = 0, $283 = 0, $284 = 0, $290 = 0, $30 = 0, $302 = 0, $305 = 0, $306 = 0, $318 = 0, $320 = 0, $325 = 0, $329 = 0, $331 = 0, $343 = 0, $345 = 0, $352 = 0, $356 = 0, $36 = 0, $363 = 0, $364 = 0, $365 = 0, $43 = 0, $5 = 0, $51 = 0, $52 = 0, $54 = 0, $6 = 0, $60 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0, $68 = 0, $7 = 0, $79 = 0, $8 = 0, $83 = 0, $9 = 0, $or$cond = 0, $or$cond278 = 0, $storemerge274 = 0, label = 0, sp = 0, $158$looptemp = 0;
 sp = STACKTOP; //@line 4575
 STACKTOP = STACKTOP + 64 | 0; //@line 4576
 $5 = sp + 16 | 0; //@line 4577
 $6 = sp; //@line 4578
 $7 = sp + 24 | 0; //@line 4579
 $8 = sp + 8 | 0; //@line 4580
 $9 = sp + 20 | 0; //@line 4581
 HEAP32[$5 >> 2] = $1; //@line 4582
 $10 = ($0 | 0) != 0; //@line 4583
 $11 = $7 + 40 | 0; //@line 4584
 $12 = $11; //@line 4585
 $13 = $7 + 39 | 0; //@line 4586
 $14 = $8 + 4 | 0; //@line 4587
 $$0243 = 0; //@line 4588
 $$0247 = 0; //@line 4588
 $$0269 = 0; //@line 4588
 L1 : while (1) {
  do {
   if (($$0247 | 0) > -1) {
    if (($$0243 | 0) > (2147483647 - $$0247 | 0)) {
     HEAP32[(___errno_location() | 0) >> 2] = 75; //@line 4597
     $$1248 = -1; //@line 4598
     break;
    } else {
     $$1248 = $$0243 + $$0247 | 0; //@line 4602
     break;
    }
   } else {
    $$1248 = $$0247; //@line 4606
   }
  } while (0);
  $20 = HEAP32[$5 >> 2] | 0; //@line 4609
  $21 = HEAP8[$20 >> 0] | 0; //@line 4610
  if (!($21 << 24 >> 24)) {
   label = 88; //@line 4613
   break;
  } else {
   $23 = $21; //@line 4616
   $25 = $20; //@line 4616
  }
  L9 : while (1) {
   switch ($23 << 24 >> 24) {
   case 37:
    {
     $$0249303 = $25; //@line 4621
     $27 = $25; //@line 4621
     label = 9; //@line 4622
     break L9;
     break;
    }
   case 0:
    {
     $$0249$lcssa = $25; //@line 4627
     break L9;
     break;
    }
   default:
    {}
   }
   $24 = $25 + 1 | 0; //@line 4634
   HEAP32[$5 >> 2] = $24; //@line 4635
   $23 = HEAP8[$24 >> 0] | 0; //@line 4637
   $25 = $24; //@line 4637
  }
  L12 : do {
   if ((label | 0) == 9) {
    while (1) {
     label = 0; //@line 4642
     if ((HEAP8[$27 + 1 >> 0] | 0) != 37) {
      $$0249$lcssa = $$0249303; //@line 4647
      break L12;
     }
     $30 = $$0249303 + 1 | 0; //@line 4650
     $27 = $27 + 2 | 0; //@line 4651
     HEAP32[$5 >> 2] = $27; //@line 4652
     if ((HEAP8[$27 >> 0] | 0) != 37) {
      $$0249$lcssa = $30; //@line 4659
      break;
     } else {
      $$0249303 = $30; //@line 4656
      label = 9; //@line 4657
     }
    }
   }
  } while (0);
  $36 = $$0249$lcssa - $20 | 0; //@line 4667
  if ($10) {
   _out_670($0, $20, $36); //@line 4669
  }
  if ($36 | 0) {
   $$0243 = $36; //@line 4673
   $$0247 = $$1248; //@line 4673
   continue;
  }
  $43 = (_isdigit(HEAP8[(HEAP32[$5 >> 2] | 0) + 1 >> 0] | 0) | 0) == 0; //@line 4681
  $$pre342 = HEAP32[$5 >> 2] | 0; //@line 4682
  if ($43) {
   $$0253 = -1; //@line 4684
   $$1270 = $$0269; //@line 4684
   $$sink = 1; //@line 4684
  } else {
   if ((HEAP8[$$pre342 + 2 >> 0] | 0) == 36) {
    $$0253 = (HEAP8[$$pre342 + 1 >> 0] | 0) + -48 | 0; //@line 4694
    $$1270 = 1; //@line 4694
    $$sink = 3; //@line 4694
   } else {
    $$0253 = -1; //@line 4696
    $$1270 = $$0269; //@line 4696
    $$sink = 1; //@line 4696
   }
  }
  $51 = $$pre342 + $$sink | 0; //@line 4699
  HEAP32[$5 >> 2] = $51; //@line 4700
  $52 = HEAP8[$51 >> 0] | 0; //@line 4701
  $54 = ($52 << 24 >> 24) + -32 | 0; //@line 4703
  if ($54 >>> 0 > 31 | (1 << $54 & 75913 | 0) == 0) {
   $$0262$lcssa = 0; //@line 4710
   $$lcssa291 = $52; //@line 4710
   $$lcssa292 = $51; //@line 4710
  } else {
   $$0262309 = 0; //@line 4712
   $60 = $52; //@line 4712
   $65 = $51; //@line 4712
   while (1) {
    $63 = 1 << ($60 << 24 >> 24) + -32 | $$0262309; //@line 4717
    $64 = $65 + 1 | 0; //@line 4718
    HEAP32[$5 >> 2] = $64; //@line 4719
    $66 = HEAP8[$64 >> 0] | 0; //@line 4720
    $68 = ($66 << 24 >> 24) + -32 | 0; //@line 4722
    if ($68 >>> 0 > 31 | (1 << $68 & 75913 | 0) == 0) {
     $$0262$lcssa = $63; //@line 4729
     $$lcssa291 = $66; //@line 4729
     $$lcssa292 = $64; //@line 4729
     break;
    } else {
     $$0262309 = $63; //@line 4732
     $60 = $66; //@line 4732
     $65 = $64; //@line 4732
    }
   }
  }
  if ($$lcssa291 << 24 >> 24 == 42) {
   if (!(_isdigit(HEAP8[$$lcssa292 + 1 >> 0] | 0) | 0)) {
    label = 23; //@line 4744
   } else {
    $79 = HEAP32[$5 >> 2] | 0; //@line 4746
    if ((HEAP8[$79 + 2 >> 0] | 0) == 36) {
     $83 = $79 + 1 | 0; //@line 4751
     HEAP32[$4 + ((HEAP8[$83 >> 0] | 0) + -48 << 2) >> 2] = 10; //@line 4756
     $$0259 = HEAP32[$3 + ((HEAP8[$83 >> 0] | 0) + -48 << 3) >> 2] | 0; //@line 4768
     $$2271 = 1; //@line 4768
     $storemerge274 = $79 + 3 | 0; //@line 4768
    } else {
     label = 23; //@line 4770
    }
   }
   if ((label | 0) == 23) {
    label = 0; //@line 4774
    if ($$1270 | 0) {
     $$0 = -1; //@line 4777
     break;
    }
    if ($10) {
     $105 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 4792
     $106 = HEAP32[$105 >> 2] | 0; //@line 4793
     HEAP32[$2 >> 2] = $105 + 4; //@line 4795
     $363 = $106; //@line 4796
    } else {
     $363 = 0; //@line 4798
    }
    $$0259 = $363; //@line 4802
    $$2271 = 0; //@line 4802
    $storemerge274 = (HEAP32[$5 >> 2] | 0) + 1 | 0; //@line 4802
   }
   HEAP32[$5 >> 2] = $storemerge274; //@line 4804
   $109 = ($$0259 | 0) < 0; //@line 4805
   $$1260 = $109 ? 0 - $$0259 | 0 : $$0259; //@line 4810
   $$1263 = $109 ? $$0262$lcssa | 8192 : $$0262$lcssa; //@line 4810
   $$3272 = $$2271; //@line 4810
   $115 = $storemerge274; //@line 4810
  } else {
   $112 = _getint_671($5) | 0; //@line 4812
   if (($112 | 0) < 0) {
    $$0 = -1; //@line 4815
    break;
   }
   $$1260 = $112; //@line 4819
   $$1263 = $$0262$lcssa; //@line 4819
   $$3272 = $$1270; //@line 4819
   $115 = HEAP32[$5 >> 2] | 0; //@line 4819
  }
  do {
   if ((HEAP8[$115 >> 0] | 0) == 46) {
    if ((HEAP8[$115 + 1 >> 0] | 0) != 42) {
     HEAP32[$5 >> 2] = $115 + 1; //@line 4830
     $156 = _getint_671($5) | 0; //@line 4831
     $$0254 = $156; //@line 4833
     $$pre345 = HEAP32[$5 >> 2] | 0; //@line 4833
     break;
    }
    if (_isdigit(HEAP8[$115 + 2 >> 0] | 0) | 0) {
     $125 = HEAP32[$5 >> 2] | 0; //@line 4842
     if ((HEAP8[$125 + 3 >> 0] | 0) == 36) {
      $129 = $125 + 2 | 0; //@line 4847
      HEAP32[$4 + ((HEAP8[$129 >> 0] | 0) + -48 << 2) >> 2] = 10; //@line 4852
      $140 = HEAP32[$3 + ((HEAP8[$129 >> 0] | 0) + -48 << 3) >> 2] | 0; //@line 4859
      $144 = $125 + 4 | 0; //@line 4863
      HEAP32[$5 >> 2] = $144; //@line 4864
      $$0254 = $140; //@line 4865
      $$pre345 = $144; //@line 4865
      break;
     }
    }
    if ($$3272 | 0) {
     $$0 = -1; //@line 4871
     break L1;
    }
    if ($10) {
     $151 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 4886
     $152 = HEAP32[$151 >> 2] | 0; //@line 4887
     HEAP32[$2 >> 2] = $151 + 4; //@line 4889
     $364 = $152; //@line 4890
    } else {
     $364 = 0; //@line 4892
    }
    $154 = (HEAP32[$5 >> 2] | 0) + 2 | 0; //@line 4895
    HEAP32[$5 >> 2] = $154; //@line 4896
    $$0254 = $364; //@line 4897
    $$pre345 = $154; //@line 4897
   } else {
    $$0254 = -1; //@line 4899
    $$pre345 = $115; //@line 4899
   }
  } while (0);
  $$0252 = 0; //@line 4902
  $158 = $$pre345; //@line 4902
  while (1) {
   if (((HEAP8[$158 >> 0] | 0) + -65 | 0) >>> 0 > 57) {
    $$0 = -1; //@line 4909
    break L1;
   }
   $158$looptemp = $158;
   $158 = $158 + 1 | 0; //@line 4912
   HEAP32[$5 >> 2] = $158; //@line 4913
   $167 = HEAP8[(HEAP8[$158$looptemp >> 0] | 0) + -65 + (861 + ($$0252 * 58 | 0)) >> 0] | 0; //@line 4918
   $168 = $167 & 255; //@line 4919
   if (($168 + -1 | 0) >>> 0 >= 8) {
    break;
   } else {
    $$0252 = $168; //@line 4923
   }
  }
  if (!($167 << 24 >> 24)) {
   $$0 = -1; //@line 4930
   break;
  }
  $173 = ($$0253 | 0) > -1; //@line 4934
  do {
   if ($167 << 24 >> 24 == 19) {
    if ($173) {
     $$0 = -1; //@line 4938
     break L1;
    } else {
     label = 50; //@line 4941
    }
   } else {
    if ($173) {
     HEAP32[$4 + ($$0253 << 2) >> 2] = $168; //@line 4946
     $176 = $3 + ($$0253 << 3) | 0; //@line 4948
     $181 = HEAP32[$176 + 4 >> 2] | 0; //@line 4953
     $182 = $6; //@line 4954
     HEAP32[$182 >> 2] = HEAP32[$176 >> 2]; //@line 4956
     HEAP32[$182 + 4 >> 2] = $181; //@line 4959
     label = 50; //@line 4960
     break;
    }
    if (!$10) {
     $$0 = 0; //@line 4964
     break L1;
    }
    _pop_arg_673($6, $168, $2); //@line 4967
    $187 = HEAP32[$5 >> 2] | 0; //@line 4969
   }
  } while (0);
  if ((label | 0) == 50) {
   label = 0; //@line 4973
   if ($10) {
    $187 = $158; //@line 4975
   } else {
    $$0243 = 0; //@line 4977
    $$0247 = $$1248; //@line 4977
    $$0269 = $$3272; //@line 4977
    continue;
   }
  }
  $189 = HEAP8[$187 + -1 >> 0] | 0; //@line 4983
  $$0235 = ($$0252 | 0) != 0 & ($189 & 15 | 0) == 3 ? $189 & -33 : $189; //@line 4989
  $196 = $$1263 & -65537; //@line 4992
  $$1263$ = ($$1263 & 8192 | 0) == 0 ? $$1263 : $196; //@line 4993
  L73 : do {
   switch ($$0235 | 0) {
   case 110:
    {
     switch (($$0252 & 255) << 24 >> 24) {
     case 0:
      {
       HEAP32[HEAP32[$6 >> 2] >> 2] = $$1248; //@line 5001
       $$0243 = 0; //@line 5002
       $$0247 = $$1248; //@line 5002
       $$0269 = $$3272; //@line 5002
       continue L1;
       break;
      }
     case 1:
      {
       HEAP32[HEAP32[$6 >> 2] >> 2] = $$1248; //@line 5008
       $$0243 = 0; //@line 5009
       $$0247 = $$1248; //@line 5009
       $$0269 = $$3272; //@line 5009
       continue L1;
       break;
      }
     case 2:
      {
       $208 = HEAP32[$6 >> 2] | 0; //@line 5017
       HEAP32[$208 >> 2] = $$1248; //@line 5019
       HEAP32[$208 + 4 >> 2] = (($$1248 | 0) < 0) << 31 >> 31; //@line 5022
       $$0243 = 0; //@line 5023
       $$0247 = $$1248; //@line 5023
       $$0269 = $$3272; //@line 5023
       continue L1;
       break;
      }
     case 3:
      {
       HEAP16[HEAP32[$6 >> 2] >> 1] = $$1248; //@line 5030
       $$0243 = 0; //@line 5031
       $$0247 = $$1248; //@line 5031
       $$0269 = $$3272; //@line 5031
       continue L1;
       break;
      }
     case 4:
      {
       HEAP8[HEAP32[$6 >> 2] >> 0] = $$1248; //@line 5038
       $$0243 = 0; //@line 5039
       $$0247 = $$1248; //@line 5039
       $$0269 = $$3272; //@line 5039
       continue L1;
       break;
      }
     case 6:
      {
       HEAP32[HEAP32[$6 >> 2] >> 2] = $$1248; //@line 5045
       $$0243 = 0; //@line 5046
       $$0247 = $$1248; //@line 5046
       $$0269 = $$3272; //@line 5046
       continue L1;
       break;
      }
     case 7:
      {
       $220 = HEAP32[$6 >> 2] | 0; //@line 5054
       HEAP32[$220 >> 2] = $$1248; //@line 5056
       HEAP32[$220 + 4 >> 2] = (($$1248 | 0) < 0) << 31 >> 31; //@line 5059
       $$0243 = 0; //@line 5060
       $$0247 = $$1248; //@line 5060
       $$0269 = $$3272; //@line 5060
       continue L1;
       break;
      }
     default:
      {
       $$0243 = 0; //@line 5065
       $$0247 = $$1248; //@line 5065
       $$0269 = $$3272; //@line 5065
       continue L1;
      }
     }
     break;
    }
   case 112:
    {
     $$1236 = 120; //@line 5075
     $$1255 = $$0254 >>> 0 > 8 ? $$0254 : 8; //@line 5075
     $$3265 = $$1263$ | 8; //@line 5075
     label = 62; //@line 5076
     break;
    }
   case 88:
   case 120:
    {
     $$1236 = $$0235; //@line 5080
     $$1255 = $$0254; //@line 5080
     $$3265 = $$1263$; //@line 5080
     label = 62; //@line 5081
     break;
    }
   case 111:
    {
     $242 = $6; //@line 5085
     $244 = HEAP32[$242 >> 2] | 0; //@line 5087
     $247 = HEAP32[$242 + 4 >> 2] | 0; //@line 5090
     $248 = _fmt_o($244, $247, $11) | 0; //@line 5091
     $252 = $12 - $248 | 0; //@line 5095
     $$0228 = $248; //@line 5100
     $$1233 = 0; //@line 5100
     $$1238 = 1325; //@line 5100
     $$2256 = ($$1263$ & 8 | 0) == 0 | ($$0254 | 0) > ($252 | 0) ? $$0254 : $252 + 1 | 0; //@line 5100
     $$4266 = $$1263$; //@line 5100
     $281 = $244; //@line 5100
     $283 = $247; //@line 5100
     label = 68; //@line 5101
     break;
    }
   case 105:
   case 100:
    {
     $256 = $6; //@line 5105
     $258 = HEAP32[$256 >> 2] | 0; //@line 5107
     $261 = HEAP32[$256 + 4 >> 2] | 0; //@line 5110
     if (($261 | 0) < 0) {
      $263 = _i64Subtract(0, 0, $258 | 0, $261 | 0) | 0; //@line 5113
      $264 = tempRet0; //@line 5114
      $265 = $6; //@line 5115
      HEAP32[$265 >> 2] = $263; //@line 5117
      HEAP32[$265 + 4 >> 2] = $264; //@line 5120
      $$0232 = 1; //@line 5121
      $$0237 = 1325; //@line 5121
      $275 = $263; //@line 5121
      $276 = $264; //@line 5121
      label = 67; //@line 5122
      break L73;
     } else {
      $$0232 = ($$1263$ & 2049 | 0) != 0 & 1; //@line 5134
      $$0237 = ($$1263$ & 2048 | 0) == 0 ? ($$1263$ & 1 | 0) == 0 ? 1325 : 1327 : 1326; //@line 5134
      $275 = $258; //@line 5134
      $276 = $261; //@line 5134
      label = 67; //@line 5135
      break L73;
     }
     break;
    }
   case 117:
    {
     $197 = $6; //@line 5141
     $$0232 = 0; //@line 5147
     $$0237 = 1325; //@line 5147
     $275 = HEAP32[$197 >> 2] | 0; //@line 5147
     $276 = HEAP32[$197 + 4 >> 2] | 0; //@line 5147
     label = 67; //@line 5148
     break;
    }
   case 99:
    {
     HEAP8[$13 >> 0] = HEAP32[$6 >> 2]; //@line 5159
     $$2 = $13; //@line 5160
     $$2234 = 0; //@line 5160
     $$2239 = 1325; //@line 5160
     $$2251 = $11; //@line 5160
     $$5 = 1; //@line 5160
     $$6268 = $196; //@line 5160
     break;
    }
   case 109:
    {
     $$1 = _strerror(HEAP32[(___errno_location() | 0) >> 2] | 0) | 0; //@line 5167
     label = 72; //@line 5168
     break;
    }
   case 115:
    {
     $302 = HEAP32[$6 >> 2] | 0; //@line 5172
     $$1 = $302 | 0 ? $302 : 1335; //@line 5175
     label = 72; //@line 5176
     break;
    }
   case 67:
    {
     HEAP32[$8 >> 2] = HEAP32[$6 >> 2]; //@line 5186
     HEAP32[$14 >> 2] = 0; //@line 5187
     HEAP32[$6 >> 2] = $8; //@line 5188
     $$4258354 = -1; //@line 5189
     $365 = $8; //@line 5189
     label = 76; //@line 5190
     break;
    }
   case 83:
    {
     $$pre348 = HEAP32[$6 >> 2] | 0; //@line 5194
     if (!$$0254) {
      _pad_676($0, 32, $$1260, 0, $$1263$); //@line 5197
      $$0240$lcssa356 = 0; //@line 5198
      label = 85; //@line 5199
     } else {
      $$4258354 = $$0254; //@line 5201
      $365 = $$pre348; //@line 5201
      label = 76; //@line 5202
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
     $$0243 = _fmt_fp($0, +HEAPF64[$6 >> 3], $$1260, $$0254, $$1263$, $$0235) | 0; //@line 5209
     $$0247 = $$1248; //@line 5209
     $$0269 = $$3272; //@line 5209
     continue L1;
     break;
    }
   default:
    {
     $$2 = $20; //@line 5214
     $$2234 = 0; //@line 5214
     $$2239 = 1325; //@line 5214
     $$2251 = $11; //@line 5214
     $$5 = $$0254; //@line 5214
     $$6268 = $$1263$; //@line 5214
    }
   }
  } while (0);
  L97 : do {
   if ((label | 0) == 62) {
    label = 0; //@line 5220
    $227 = $6; //@line 5221
    $229 = HEAP32[$227 >> 2] | 0; //@line 5223
    $232 = HEAP32[$227 + 4 >> 2] | 0; //@line 5226
    $234 = _fmt_x($229, $232, $11, $$1236 & 32) | 0; //@line 5228
    $or$cond278 = ($$3265 & 8 | 0) == 0 | ($229 | 0) == 0 & ($232 | 0) == 0; //@line 5234
    $$0228 = $234; //@line 5239
    $$1233 = $or$cond278 ? 0 : 2; //@line 5239
    $$1238 = $or$cond278 ? 1325 : 1325 + ($$1236 >> 4) | 0; //@line 5239
    $$2256 = $$1255; //@line 5239
    $$4266 = $$3265; //@line 5239
    $281 = $229; //@line 5239
    $283 = $232; //@line 5239
    label = 68; //@line 5240
   } else if ((label | 0) == 67) {
    label = 0; //@line 5243
    $$0228 = _fmt_u($275, $276, $11) | 0; //@line 5245
    $$1233 = $$0232; //@line 5245
    $$1238 = $$0237; //@line 5245
    $$2256 = $$0254; //@line 5245
    $$4266 = $$1263$; //@line 5245
    $281 = $275; //@line 5245
    $283 = $276; //@line 5245
    label = 68; //@line 5246
   } else if ((label | 0) == 72) {
    label = 0; //@line 5249
    $305 = _memchr($$1, 0, $$0254) | 0; //@line 5250
    $306 = ($305 | 0) == 0; //@line 5251
    $$2 = $$1; //@line 5258
    $$2234 = 0; //@line 5258
    $$2239 = 1325; //@line 5258
    $$2251 = $306 ? $$1 + $$0254 | 0 : $305; //@line 5258
    $$5 = $306 ? $$0254 : $305 - $$1 | 0; //@line 5258
    $$6268 = $196; //@line 5258
   } else if ((label | 0) == 76) {
    label = 0; //@line 5261
    $$0229316 = $365; //@line 5262
    $$0240315 = 0; //@line 5262
    $$1244314 = 0; //@line 5262
    while (1) {
     $318 = HEAP32[$$0229316 >> 2] | 0; //@line 5264
     if (!$318) {
      $$0240$lcssa = $$0240315; //@line 5267
      $$2245 = $$1244314; //@line 5267
      break;
     }
     $320 = _wctomb($9, $318) | 0; //@line 5270
     if (($320 | 0) < 0 | $320 >>> 0 > ($$4258354 - $$0240315 | 0) >>> 0) {
      $$0240$lcssa = $$0240315; //@line 5276
      $$2245 = $320; //@line 5276
      break;
     }
     $325 = $320 + $$0240315 | 0; //@line 5280
     if ($$4258354 >>> 0 > $325 >>> 0) {
      $$0229316 = $$0229316 + 4 | 0; //@line 5283
      $$0240315 = $325; //@line 5283
      $$1244314 = $320; //@line 5283
     } else {
      $$0240$lcssa = $325; //@line 5285
      $$2245 = $320; //@line 5285
      break;
     }
    }
    if (($$2245 | 0) < 0) {
     $$0 = -1; //@line 5291
     break L1;
    }
    _pad_676($0, 32, $$1260, $$0240$lcssa, $$1263$); //@line 5294
    if (!$$0240$lcssa) {
     $$0240$lcssa356 = 0; //@line 5297
     label = 85; //@line 5298
    } else {
     $$1230327 = $365; //@line 5300
     $$1241326 = 0; //@line 5300
     while (1) {
      $329 = HEAP32[$$1230327 >> 2] | 0; //@line 5302
      if (!$329) {
       $$0240$lcssa356 = $$0240$lcssa; //@line 5305
       label = 85; //@line 5306
       break L97;
      }
      $331 = _wctomb($9, $329) | 0; //@line 5309
      $$1241326 = $331 + $$1241326 | 0; //@line 5310
      if (($$1241326 | 0) > ($$0240$lcssa | 0)) {
       $$0240$lcssa356 = $$0240$lcssa; //@line 5313
       label = 85; //@line 5314
       break L97;
      }
      _out_670($0, $9, $331); //@line 5318
      if ($$1241326 >>> 0 >= $$0240$lcssa >>> 0) {
       $$0240$lcssa356 = $$0240$lcssa; //@line 5323
       label = 85; //@line 5324
       break;
      } else {
       $$1230327 = $$1230327 + 4 | 0; //@line 5321
      }
     }
    }
   }
  } while (0);
  if ((label | 0) == 68) {
   label = 0; //@line 5332
   $284 = ($281 | 0) != 0 | ($283 | 0) != 0; //@line 5338
   $or$cond = ($$2256 | 0) != 0 | $284; //@line 5340
   $290 = $12 - $$0228 + (($284 ^ 1) & 1) | 0; //@line 5345
   $$2 = $or$cond ? $$0228 : $11; //@line 5350
   $$2234 = $$1233; //@line 5350
   $$2239 = $$1238; //@line 5350
   $$2251 = $11; //@line 5350
   $$5 = $or$cond ? ($$2256 | 0) > ($290 | 0) ? $$2256 : $290 : $$2256; //@line 5350
   $$6268 = ($$2256 | 0) > -1 ? $$4266 & -65537 : $$4266; //@line 5350
  } else if ((label | 0) == 85) {
   label = 0; //@line 5353
   _pad_676($0, 32, $$1260, $$0240$lcssa356, $$1263$ ^ 8192); //@line 5355
   $$0243 = ($$1260 | 0) > ($$0240$lcssa356 | 0) ? $$1260 : $$0240$lcssa356; //@line 5358
   $$0247 = $$1248; //@line 5358
   $$0269 = $$3272; //@line 5358
   continue;
  }
  $343 = $$2251 - $$2 | 0; //@line 5363
  $$$5 = ($$5 | 0) < ($343 | 0) ? $343 : $$5; //@line 5365
  $345 = $$$5 + $$2234 | 0; //@line 5366
  $$2261 = ($$1260 | 0) < ($345 | 0) ? $345 : $$1260; //@line 5368
  _pad_676($0, 32, $$2261, $345, $$6268); //@line 5369
  _out_670($0, $$2239, $$2234); //@line 5370
  _pad_676($0, 48, $$2261, $345, $$6268 ^ 65536); //@line 5372
  _pad_676($0, 48, $$$5, $343, 0); //@line 5373
  _out_670($0, $$2, $343); //@line 5374
  _pad_676($0, 32, $$2261, $345, $$6268 ^ 8192); //@line 5376
  $$0243 = $$2261; //@line 5377
  $$0247 = $$1248; //@line 5377
  $$0269 = $$3272; //@line 5377
 }
 L116 : do {
  if ((label | 0) == 88) {
   if (!$0) {
    if (!$$0269) {
     $$0 = 0; //@line 5385
    } else {
     $$2242302 = 1; //@line 5387
     while (1) {
      $352 = HEAP32[$4 + ($$2242302 << 2) >> 2] | 0; //@line 5390
      if (!$352) {
       $$2242$lcssa = $$2242302; //@line 5393
       break;
      }
      _pop_arg_673($3 + ($$2242302 << 3) | 0, $352, $2); //@line 5397
      $356 = $$2242302 + 1 | 0; //@line 5398
      if (($$2242302 | 0) < 9) {
       $$2242302 = $356; //@line 5401
      } else {
       $$2242$lcssa = $356; //@line 5403
       break;
      }
     }
     if (($$2242$lcssa | 0) < 10) {
      $$3300 = $$2242$lcssa; //@line 5409
      while (1) {
       if (HEAP32[$4 + ($$3300 << 2) >> 2] | 0) {
        $$0 = -1; //@line 5415
        break L116;
       }
       if (($$3300 | 0) < 9) {
        $$3300 = $$3300 + 1 | 0; //@line 5421
       } else {
        $$0 = 1; //@line 5423
        break;
       }
      }
     } else {
      $$0 = 1; //@line 5428
     }
    }
   } else {
    $$0 = $$1248; //@line 5432
   }
  }
 } while (0);
 STACKTOP = sp; //@line 5436
 return $$0 | 0; //@line 5436
}
function _free($0) {
 $0 = $0 | 0;
 var $$0212$i = 0, $$0212$in$i = 0, $$0383 = 0, $$0384 = 0, $$0396 = 0, $$0403 = 0, $$1 = 0, $$1382 = 0, $$1387 = 0, $$1390 = 0, $$1398 = 0, $$1402 = 0, $$2 = 0, $$3 = 0, $$3400 = 0, $$pre$phi442Z2D = 0, $$pre$phi444Z2D = 0, $$pre$phiZ2D = 0, $10 = 0, $105 = 0, $106 = 0, $114 = 0, $115 = 0, $116 = 0, $124 = 0, $13 = 0, $132 = 0, $137 = 0, $138 = 0, $141 = 0, $143 = 0, $145 = 0, $16 = 0, $160 = 0, $165 = 0, $167 = 0, $17 = 0, $170 = 0, $173 = 0, $176 = 0, $179 = 0, $180 = 0, $181 = 0, $183 = 0, $185 = 0, $186 = 0, $188 = 0, $189 = 0, $195 = 0, $196 = 0, $2 = 0, $21 = 0, $210 = 0, $213 = 0, $214 = 0, $220 = 0, $235 = 0, $238 = 0, $239 = 0, $24 = 0, $240 = 0, $244 = 0, $245 = 0, $251 = 0, $256 = 0, $257 = 0, $26 = 0, $260 = 0, $262 = 0, $265 = 0, $270 = 0, $276 = 0, $28 = 0, $280 = 0, $281 = 0, $299 = 0, $3 = 0, $301 = 0, $308 = 0, $309 = 0, $310 = 0, $319 = 0, $41 = 0, $46 = 0, $48 = 0, $51 = 0, $53 = 0, $56 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $63 = 0, $65 = 0, $66 = 0, $68 = 0, $69 = 0, $7 = 0, $74 = 0, $75 = 0, $89 = 0, $9 = 0, $92 = 0, $93 = 0, $99 = 0, label = 0;
 if (!$0) {
  return;
 }
 $2 = $0 + -8 | 0; //@line 2953
 $3 = HEAP32[876] | 0; //@line 2954
 if ($2 >>> 0 < $3 >>> 0) {
  _abort(); //@line 2957
 }
 $6 = HEAP32[$0 + -4 >> 2] | 0; //@line 2961
 $7 = $6 & 3; //@line 2962
 if (($7 | 0) == 1) {
  _abort(); //@line 2965
 }
 $9 = $6 & -8; //@line 2968
 $10 = $2 + $9 | 0; //@line 2969
 L10 : do {
  if (!($6 & 1)) {
   $13 = HEAP32[$2 >> 2] | 0; //@line 2974
   if (!$7) {
    return;
   }
   $16 = $2 + (0 - $13) | 0; //@line 2980
   $17 = $13 + $9 | 0; //@line 2981
   if ($16 >>> 0 < $3 >>> 0) {
    _abort(); //@line 2984
   }
   if ((HEAP32[877] | 0) == ($16 | 0)) {
    $105 = $10 + 4 | 0; //@line 2990
    $106 = HEAP32[$105 >> 2] | 0; //@line 2991
    if (($106 & 3 | 0) != 3) {
     $$1 = $16; //@line 2995
     $$1382 = $17; //@line 2995
     $114 = $16; //@line 2995
     break;
    }
    HEAP32[874] = $17; //@line 2998
    HEAP32[$105 >> 2] = $106 & -2; //@line 3000
    HEAP32[$16 + 4 >> 2] = $17 | 1; //@line 3003
    HEAP32[$16 + $17 >> 2] = $17; //@line 3005
    return;
   }
   $21 = $13 >>> 3; //@line 3008
   if ($13 >>> 0 < 256) {
    $24 = HEAP32[$16 + 8 >> 2] | 0; //@line 3012
    $26 = HEAP32[$16 + 12 >> 2] | 0; //@line 3014
    $28 = 3528 + ($21 << 1 << 2) | 0; //@line 3016
    if (($24 | 0) != ($28 | 0)) {
     if ($3 >>> 0 > $24 >>> 0) {
      _abort(); //@line 3021
     }
     if ((HEAP32[$24 + 12 >> 2] | 0) != ($16 | 0)) {
      _abort(); //@line 3028
     }
    }
    if (($26 | 0) == ($24 | 0)) {
     HEAP32[872] = HEAP32[872] & ~(1 << $21); //@line 3038
     $$1 = $16; //@line 3039
     $$1382 = $17; //@line 3039
     $114 = $16; //@line 3039
     break;
    }
    if (($26 | 0) == ($28 | 0)) {
     $$pre$phi444Z2D = $26 + 8 | 0; //@line 3045
    } else {
     if ($3 >>> 0 > $26 >>> 0) {
      _abort(); //@line 3049
     }
     $41 = $26 + 8 | 0; //@line 3052
     if ((HEAP32[$41 >> 2] | 0) == ($16 | 0)) {
      $$pre$phi444Z2D = $41; //@line 3056
     } else {
      _abort(); //@line 3058
     }
    }
    HEAP32[$24 + 12 >> 2] = $26; //@line 3063
    HEAP32[$$pre$phi444Z2D >> 2] = $24; //@line 3064
    $$1 = $16; //@line 3065
    $$1382 = $17; //@line 3065
    $114 = $16; //@line 3065
    break;
   }
   $46 = HEAP32[$16 + 24 >> 2] | 0; //@line 3069
   $48 = HEAP32[$16 + 12 >> 2] | 0; //@line 3071
   do {
    if (($48 | 0) == ($16 | 0)) {
     $59 = $16 + 16 | 0; //@line 3075
     $60 = $59 + 4 | 0; //@line 3076
     $61 = HEAP32[$60 >> 2] | 0; //@line 3077
     if (!$61) {
      $63 = HEAP32[$59 >> 2] | 0; //@line 3080
      if (!$63) {
       $$3 = 0; //@line 3083
       break;
      } else {
       $$1387 = $63; //@line 3086
       $$1390 = $59; //@line 3086
      }
     } else {
      $$1387 = $61; //@line 3089
      $$1390 = $60; //@line 3089
     }
     while (1) {
      $65 = $$1387 + 20 | 0; //@line 3092
      $66 = HEAP32[$65 >> 2] | 0; //@line 3093
      if ($66 | 0) {
       $$1387 = $66; //@line 3096
       $$1390 = $65; //@line 3096
       continue;
      }
      $68 = $$1387 + 16 | 0; //@line 3099
      $69 = HEAP32[$68 >> 2] | 0; //@line 3100
      if (!$69) {
       break;
      } else {
       $$1387 = $69; //@line 3105
       $$1390 = $68; //@line 3105
      }
     }
     if ($3 >>> 0 > $$1390 >>> 0) {
      _abort(); //@line 3110
     } else {
      HEAP32[$$1390 >> 2] = 0; //@line 3113
      $$3 = $$1387; //@line 3114
      break;
     }
    } else {
     $51 = HEAP32[$16 + 8 >> 2] | 0; //@line 3119
     if ($3 >>> 0 > $51 >>> 0) {
      _abort(); //@line 3122
     }
     $53 = $51 + 12 | 0; //@line 3125
     if ((HEAP32[$53 >> 2] | 0) != ($16 | 0)) {
      _abort(); //@line 3129
     }
     $56 = $48 + 8 | 0; //@line 3132
     if ((HEAP32[$56 >> 2] | 0) == ($16 | 0)) {
      HEAP32[$53 >> 2] = $48; //@line 3136
      HEAP32[$56 >> 2] = $51; //@line 3137
      $$3 = $48; //@line 3138
      break;
     } else {
      _abort(); //@line 3141
     }
    }
   } while (0);
   if (!$46) {
    $$1 = $16; //@line 3148
    $$1382 = $17; //@line 3148
    $114 = $16; //@line 3148
   } else {
    $74 = HEAP32[$16 + 28 >> 2] | 0; //@line 3151
    $75 = 3792 + ($74 << 2) | 0; //@line 3152
    do {
     if ((HEAP32[$75 >> 2] | 0) == ($16 | 0)) {
      HEAP32[$75 >> 2] = $$3; //@line 3157
      if (!$$3) {
       HEAP32[873] = HEAP32[873] & ~(1 << $74); //@line 3164
       $$1 = $16; //@line 3165
       $$1382 = $17; //@line 3165
       $114 = $16; //@line 3165
       break L10;
      }
     } else {
      if ((HEAP32[876] | 0) >>> 0 > $46 >>> 0) {
       _abort(); //@line 3172
      } else {
       HEAP32[$46 + 16 + (((HEAP32[$46 + 16 >> 2] | 0) != ($16 | 0) & 1) << 2) >> 2] = $$3; //@line 3180
       if (!$$3) {
        $$1 = $16; //@line 3183
        $$1382 = $17; //@line 3183
        $114 = $16; //@line 3183
        break L10;
       } else {
        break;
       }
      }
     }
    } while (0);
    $89 = HEAP32[876] | 0; //@line 3191
    if ($89 >>> 0 > $$3 >>> 0) {
     _abort(); //@line 3194
    }
    HEAP32[$$3 + 24 >> 2] = $46; //@line 3198
    $92 = $16 + 16 | 0; //@line 3199
    $93 = HEAP32[$92 >> 2] | 0; //@line 3200
    do {
     if ($93 | 0) {
      if ($89 >>> 0 > $93 >>> 0) {
       _abort(); //@line 3206
      } else {
       HEAP32[$$3 + 16 >> 2] = $93; //@line 3210
       HEAP32[$93 + 24 >> 2] = $$3; //@line 3212
       break;
      }
     }
    } while (0);
    $99 = HEAP32[$92 + 4 >> 2] | 0; //@line 3218
    if (!$99) {
     $$1 = $16; //@line 3221
     $$1382 = $17; //@line 3221
     $114 = $16; //@line 3221
    } else {
     if ((HEAP32[876] | 0) >>> 0 > $99 >>> 0) {
      _abort(); //@line 3226
     } else {
      HEAP32[$$3 + 20 >> 2] = $99; //@line 3230
      HEAP32[$99 + 24 >> 2] = $$3; //@line 3232
      $$1 = $16; //@line 3233
      $$1382 = $17; //@line 3233
      $114 = $16; //@line 3233
      break;
     }
    }
   }
  } else {
   $$1 = $2; //@line 3239
   $$1382 = $9; //@line 3239
   $114 = $2; //@line 3239
  }
 } while (0);
 if ($114 >>> 0 >= $10 >>> 0) {
  _abort(); //@line 3244
 }
 $115 = $10 + 4 | 0; //@line 3247
 $116 = HEAP32[$115 >> 2] | 0; //@line 3248
 if (!($116 & 1)) {
  _abort(); //@line 3252
 }
 if (!($116 & 2)) {
  if ((HEAP32[878] | 0) == ($10 | 0)) {
   $124 = (HEAP32[875] | 0) + $$1382 | 0; //@line 3262
   HEAP32[875] = $124; //@line 3263
   HEAP32[878] = $$1; //@line 3264
   HEAP32[$$1 + 4 >> 2] = $124 | 1; //@line 3267
   if (($$1 | 0) != (HEAP32[877] | 0)) {
    return;
   }
   HEAP32[877] = 0; //@line 3273
   HEAP32[874] = 0; //@line 3274
   return;
  }
  if ((HEAP32[877] | 0) == ($10 | 0)) {
   $132 = (HEAP32[874] | 0) + $$1382 | 0; //@line 3281
   HEAP32[874] = $132; //@line 3282
   HEAP32[877] = $114; //@line 3283
   HEAP32[$$1 + 4 >> 2] = $132 | 1; //@line 3286
   HEAP32[$114 + $132 >> 2] = $132; //@line 3288
   return;
  }
  $137 = ($116 & -8) + $$1382 | 0; //@line 3292
  $138 = $116 >>> 3; //@line 3293
  L108 : do {
   if ($116 >>> 0 < 256) {
    $141 = HEAP32[$10 + 8 >> 2] | 0; //@line 3298
    $143 = HEAP32[$10 + 12 >> 2] | 0; //@line 3300
    $145 = 3528 + ($138 << 1 << 2) | 0; //@line 3302
    if (($141 | 0) != ($145 | 0)) {
     if ((HEAP32[876] | 0) >>> 0 > $141 >>> 0) {
      _abort(); //@line 3308
     }
     if ((HEAP32[$141 + 12 >> 2] | 0) != ($10 | 0)) {
      _abort(); //@line 3315
     }
    }
    if (($143 | 0) == ($141 | 0)) {
     HEAP32[872] = HEAP32[872] & ~(1 << $138); //@line 3325
     break;
    }
    if (($143 | 0) == ($145 | 0)) {
     $$pre$phi442Z2D = $143 + 8 | 0; //@line 3331
    } else {
     if ((HEAP32[876] | 0) >>> 0 > $143 >>> 0) {
      _abort(); //@line 3336
     }
     $160 = $143 + 8 | 0; //@line 3339
     if ((HEAP32[$160 >> 2] | 0) == ($10 | 0)) {
      $$pre$phi442Z2D = $160; //@line 3343
     } else {
      _abort(); //@line 3345
     }
    }
    HEAP32[$141 + 12 >> 2] = $143; //@line 3350
    HEAP32[$$pre$phi442Z2D >> 2] = $141; //@line 3351
   } else {
    $165 = HEAP32[$10 + 24 >> 2] | 0; //@line 3354
    $167 = HEAP32[$10 + 12 >> 2] | 0; //@line 3356
    do {
     if (($167 | 0) == ($10 | 0)) {
      $179 = $10 + 16 | 0; //@line 3360
      $180 = $179 + 4 | 0; //@line 3361
      $181 = HEAP32[$180 >> 2] | 0; //@line 3362
      if (!$181) {
       $183 = HEAP32[$179 >> 2] | 0; //@line 3365
       if (!$183) {
        $$3400 = 0; //@line 3368
        break;
       } else {
        $$1398 = $183; //@line 3371
        $$1402 = $179; //@line 3371
       }
      } else {
       $$1398 = $181; //@line 3374
       $$1402 = $180; //@line 3374
      }
      while (1) {
       $185 = $$1398 + 20 | 0; //@line 3377
       $186 = HEAP32[$185 >> 2] | 0; //@line 3378
       if ($186 | 0) {
        $$1398 = $186; //@line 3381
        $$1402 = $185; //@line 3381
        continue;
       }
       $188 = $$1398 + 16 | 0; //@line 3384
       $189 = HEAP32[$188 >> 2] | 0; //@line 3385
       if (!$189) {
        break;
       } else {
        $$1398 = $189; //@line 3390
        $$1402 = $188; //@line 3390
       }
      }
      if ((HEAP32[876] | 0) >>> 0 > $$1402 >>> 0) {
       _abort(); //@line 3396
      } else {
       HEAP32[$$1402 >> 2] = 0; //@line 3399
       $$3400 = $$1398; //@line 3400
       break;
      }
     } else {
      $170 = HEAP32[$10 + 8 >> 2] | 0; //@line 3405
      if ((HEAP32[876] | 0) >>> 0 > $170 >>> 0) {
       _abort(); //@line 3409
      }
      $173 = $170 + 12 | 0; //@line 3412
      if ((HEAP32[$173 >> 2] | 0) != ($10 | 0)) {
       _abort(); //@line 3416
      }
      $176 = $167 + 8 | 0; //@line 3419
      if ((HEAP32[$176 >> 2] | 0) == ($10 | 0)) {
       HEAP32[$173 >> 2] = $167; //@line 3423
       HEAP32[$176 >> 2] = $170; //@line 3424
       $$3400 = $167; //@line 3425
       break;
      } else {
       _abort(); //@line 3428
      }
     }
    } while (0);
    if ($165 | 0) {
     $195 = HEAP32[$10 + 28 >> 2] | 0; //@line 3436
     $196 = 3792 + ($195 << 2) | 0; //@line 3437
     do {
      if ((HEAP32[$196 >> 2] | 0) == ($10 | 0)) {
       HEAP32[$196 >> 2] = $$3400; //@line 3442
       if (!$$3400) {
        HEAP32[873] = HEAP32[873] & ~(1 << $195); //@line 3449
        break L108;
       }
      } else {
       if ((HEAP32[876] | 0) >>> 0 > $165 >>> 0) {
        _abort(); //@line 3456
       } else {
        HEAP32[$165 + 16 + (((HEAP32[$165 + 16 >> 2] | 0) != ($10 | 0) & 1) << 2) >> 2] = $$3400; //@line 3464
        if (!$$3400) {
         break L108;
        } else {
         break;
        }
       }
      }
     } while (0);
     $210 = HEAP32[876] | 0; //@line 3474
     if ($210 >>> 0 > $$3400 >>> 0) {
      _abort(); //@line 3477
     }
     HEAP32[$$3400 + 24 >> 2] = $165; //@line 3481
     $213 = $10 + 16 | 0; //@line 3482
     $214 = HEAP32[$213 >> 2] | 0; //@line 3483
     do {
      if ($214 | 0) {
       if ($210 >>> 0 > $214 >>> 0) {
        _abort(); //@line 3489
       } else {
        HEAP32[$$3400 + 16 >> 2] = $214; //@line 3493
        HEAP32[$214 + 24 >> 2] = $$3400; //@line 3495
        break;
       }
      }
     } while (0);
     $220 = HEAP32[$213 + 4 >> 2] | 0; //@line 3501
     if ($220 | 0) {
      if ((HEAP32[876] | 0) >>> 0 > $220 >>> 0) {
       _abort(); //@line 3507
      } else {
       HEAP32[$$3400 + 20 >> 2] = $220; //@line 3511
       HEAP32[$220 + 24 >> 2] = $$3400; //@line 3513
       break;
      }
     }
    }
   }
  } while (0);
  HEAP32[$$1 + 4 >> 2] = $137 | 1; //@line 3522
  HEAP32[$114 + $137 >> 2] = $137; //@line 3524
  if (($$1 | 0) == (HEAP32[877] | 0)) {
   HEAP32[874] = $137; //@line 3528
   return;
  } else {
   $$2 = $137; //@line 3531
  }
 } else {
  HEAP32[$115 >> 2] = $116 & -2; //@line 3535
  HEAP32[$$1 + 4 >> 2] = $$1382 | 1; //@line 3538
  HEAP32[$114 + $$1382 >> 2] = $$1382; //@line 3540
  $$2 = $$1382; //@line 3541
 }
 $235 = $$2 >>> 3; //@line 3543
 if ($$2 >>> 0 < 256) {
  $238 = 3528 + ($235 << 1 << 2) | 0; //@line 3547
  $239 = HEAP32[872] | 0; //@line 3548
  $240 = 1 << $235; //@line 3549
  if (!($239 & $240)) {
   HEAP32[872] = $239 | $240; //@line 3554
   $$0403 = $238; //@line 3556
   $$pre$phiZ2D = $238 + 8 | 0; //@line 3556
  } else {
   $244 = $238 + 8 | 0; //@line 3558
   $245 = HEAP32[$244 >> 2] | 0; //@line 3559
   if ((HEAP32[876] | 0) >>> 0 > $245 >>> 0) {
    _abort(); //@line 3563
   } else {
    $$0403 = $245; //@line 3566
    $$pre$phiZ2D = $244; //@line 3566
   }
  }
  HEAP32[$$pre$phiZ2D >> 2] = $$1; //@line 3569
  HEAP32[$$0403 + 12 >> 2] = $$1; //@line 3571
  HEAP32[$$1 + 8 >> 2] = $$0403; //@line 3573
  HEAP32[$$1 + 12 >> 2] = $238; //@line 3575
  return;
 }
 $251 = $$2 >>> 8; //@line 3578
 if (!$251) {
  $$0396 = 0; //@line 3581
 } else {
  if ($$2 >>> 0 > 16777215) {
   $$0396 = 31; //@line 3585
  } else {
   $256 = ($251 + 1048320 | 0) >>> 16 & 8; //@line 3589
   $257 = $251 << $256; //@line 3590
   $260 = ($257 + 520192 | 0) >>> 16 & 4; //@line 3593
   $262 = $257 << $260; //@line 3595
   $265 = ($262 + 245760 | 0) >>> 16 & 2; //@line 3598
   $270 = 14 - ($260 | $256 | $265) + ($262 << $265 >>> 15) | 0; //@line 3603
   $$0396 = $$2 >>> ($270 + 7 | 0) & 1 | $270 << 1; //@line 3609
  }
 }
 $276 = 3792 + ($$0396 << 2) | 0; //@line 3612
 HEAP32[$$1 + 28 >> 2] = $$0396; //@line 3614
 HEAP32[$$1 + 20 >> 2] = 0; //@line 3617
 HEAP32[$$1 + 16 >> 2] = 0; //@line 3618
 $280 = HEAP32[873] | 0; //@line 3619
 $281 = 1 << $$0396; //@line 3620
 do {
  if (!($280 & $281)) {
   HEAP32[873] = $280 | $281; //@line 3626
   HEAP32[$276 >> 2] = $$1; //@line 3627
   HEAP32[$$1 + 24 >> 2] = $276; //@line 3629
   HEAP32[$$1 + 12 >> 2] = $$1; //@line 3631
   HEAP32[$$1 + 8 >> 2] = $$1; //@line 3633
  } else {
   $$0383 = $$2 << (($$0396 | 0) == 31 ? 0 : 25 - ($$0396 >>> 1) | 0); //@line 3641
   $$0384 = HEAP32[$276 >> 2] | 0; //@line 3641
   while (1) {
    if ((HEAP32[$$0384 + 4 >> 2] & -8 | 0) == ($$2 | 0)) {
     label = 124; //@line 3648
     break;
    }
    $299 = $$0384 + 16 + ($$0383 >>> 31 << 2) | 0; //@line 3652
    $301 = HEAP32[$299 >> 2] | 0; //@line 3654
    if (!$301) {
     label = 121; //@line 3657
     break;
    } else {
     $$0383 = $$0383 << 1; //@line 3660
     $$0384 = $301; //@line 3660
    }
   }
   if ((label | 0) == 121) {
    if ((HEAP32[876] | 0) >>> 0 > $299 >>> 0) {
     _abort(); //@line 3667
    } else {
     HEAP32[$299 >> 2] = $$1; //@line 3670
     HEAP32[$$1 + 24 >> 2] = $$0384; //@line 3672
     HEAP32[$$1 + 12 >> 2] = $$1; //@line 3674
     HEAP32[$$1 + 8 >> 2] = $$1; //@line 3676
     break;
    }
   } else if ((label | 0) == 124) {
    $308 = $$0384 + 8 | 0; //@line 3681
    $309 = HEAP32[$308 >> 2] | 0; //@line 3682
    $310 = HEAP32[876] | 0; //@line 3683
    if ($310 >>> 0 <= $309 >>> 0 & $310 >>> 0 <= $$0384 >>> 0) {
     HEAP32[$309 + 12 >> 2] = $$1; //@line 3689
     HEAP32[$308 >> 2] = $$1; //@line 3690
     HEAP32[$$1 + 8 >> 2] = $309; //@line 3692
     HEAP32[$$1 + 12 >> 2] = $$0384; //@line 3694
     HEAP32[$$1 + 24 >> 2] = 0; //@line 3696
     break;
    } else {
     _abort(); //@line 3699
    }
   }
  }
 } while (0);
 $319 = (HEAP32[880] | 0) + -1 | 0; //@line 3706
 HEAP32[880] = $319; //@line 3707
 if (!$319) {
  $$0212$in$i = 3944; //@line 3710
 } else {
  return;
 }
 while (1) {
  $$0212$i = HEAP32[$$0212$in$i >> 2] | 0; //@line 3715
  if (!$$0212$i) {
   break;
  } else {
   $$0212$in$i = $$0212$i + 8 | 0; //@line 3721
  }
 }
 HEAP32[880] = -1; //@line 3724
 return;
}
function ___udivmoddi4($a$0, $a$1, $b$0, $b$1, $rem) {
 $a$0 = $a$0 | 0;
 $a$1 = $a$1 | 0;
 $b$0 = $b$0 | 0;
 $b$1 = $b$1 | 0;
 $rem = $rem | 0;
 var $n_sroa_0_0_extract_trunc = 0, $n_sroa_1_4_extract_shift$0 = 0, $n_sroa_1_4_extract_trunc = 0, $d_sroa_0_0_extract_trunc = 0, $d_sroa_1_4_extract_shift$0 = 0, $d_sroa_1_4_extract_trunc = 0, $4 = 0, $17 = 0, $37 = 0, $51 = 0, $57 = 0, $58 = 0, $66 = 0, $78 = 0, $88 = 0, $89 = 0, $91 = 0, $92 = 0, $95 = 0, $105 = 0, $119 = 0, $125 = 0, $126 = 0, $130 = 0, $q_sroa_1_1_ph = 0, $q_sroa_0_1_ph = 0, $r_sroa_1_1_ph = 0, $r_sroa_0_1_ph = 0, $sr_1_ph = 0, $d_sroa_0_0_insert_insert99$0 = 0, $d_sroa_0_0_insert_insert99$1 = 0, $137$0 = 0, $137$1 = 0, $carry_0203 = 0, $sr_1202 = 0, $r_sroa_0_1201 = 0, $r_sroa_1_1200 = 0, $q_sroa_0_1199 = 0, $q_sroa_1_1198 = 0, $r_sroa_0_0_insert_insert42$0 = 0, $r_sroa_0_0_insert_insert42$1 = 0, $150$1 = 0, $151$0 = 0, $carry_0_lcssa$0 = 0, $carry_0_lcssa$1 = 0, $r_sroa_0_1_lcssa = 0, $r_sroa_1_1_lcssa = 0, $q_sroa_0_1_lcssa = 0, $q_sroa_1_1_lcssa = 0, $q_sroa_0_0_insert_ext75$0 = 0, $q_sroa_0_0_insert_ext75$1 = 0, $_0$0 = 0, $_0$1 = 0, $q_sroa_1_1198$looptemp = 0;
 $n_sroa_0_0_extract_trunc = $a$0; //@line 8832
 $n_sroa_1_4_extract_shift$0 = $a$1; //@line 8833
 $n_sroa_1_4_extract_trunc = $n_sroa_1_4_extract_shift$0; //@line 8834
 $d_sroa_0_0_extract_trunc = $b$0; //@line 8835
 $d_sroa_1_4_extract_shift$0 = $b$1; //@line 8836
 $d_sroa_1_4_extract_trunc = $d_sroa_1_4_extract_shift$0; //@line 8837
 if (!$n_sroa_1_4_extract_trunc) {
  $4 = ($rem | 0) != 0; //@line 8839
  if (!$d_sroa_1_4_extract_trunc) {
   if ($4) {
    HEAP32[$rem >> 2] = ($n_sroa_0_0_extract_trunc >>> 0) % ($d_sroa_0_0_extract_trunc >>> 0); //@line 8842
    HEAP32[$rem + 4 >> 2] = 0; //@line 8843
   }
   $_0$1 = 0; //@line 8845
   $_0$0 = ($n_sroa_0_0_extract_trunc >>> 0) / ($d_sroa_0_0_extract_trunc >>> 0) >>> 0; //@line 8846
   return (tempRet0 = $_0$1, $_0$0) | 0; //@line 8847
  } else {
   if (!$4) {
    $_0$1 = 0; //@line 8850
    $_0$0 = 0; //@line 8851
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 8852
   }
   HEAP32[$rem >> 2] = $a$0 | 0; //@line 8854
   HEAP32[$rem + 4 >> 2] = $a$1 & 0; //@line 8855
   $_0$1 = 0; //@line 8856
   $_0$0 = 0; //@line 8857
   return (tempRet0 = $_0$1, $_0$0) | 0; //@line 8858
  }
 }
 $17 = ($d_sroa_1_4_extract_trunc | 0) == 0; //@line 8861
 do {
  if (!$d_sroa_0_0_extract_trunc) {
   if ($17) {
    if ($rem | 0) {
     HEAP32[$rem >> 2] = ($n_sroa_1_4_extract_trunc >>> 0) % ($d_sroa_0_0_extract_trunc >>> 0); //@line 8866
     HEAP32[$rem + 4 >> 2] = 0; //@line 8867
    }
    $_0$1 = 0; //@line 8869
    $_0$0 = ($n_sroa_1_4_extract_trunc >>> 0) / ($d_sroa_0_0_extract_trunc >>> 0) >>> 0; //@line 8870
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 8871
   }
   if (!$n_sroa_0_0_extract_trunc) {
    if ($rem | 0) {
     HEAP32[$rem >> 2] = 0; //@line 8875
     HEAP32[$rem + 4 >> 2] = ($n_sroa_1_4_extract_trunc >>> 0) % ($d_sroa_1_4_extract_trunc >>> 0); //@line 8876
    }
    $_0$1 = 0; //@line 8878
    $_0$0 = ($n_sroa_1_4_extract_trunc >>> 0) / ($d_sroa_1_4_extract_trunc >>> 0) >>> 0; //@line 8879
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 8880
   }
   $37 = $d_sroa_1_4_extract_trunc - 1 | 0; //@line 8882
   if (!($37 & $d_sroa_1_4_extract_trunc)) {
    if ($rem | 0) {
     HEAP32[$rem >> 2] = $a$0 | 0; //@line 8885
     HEAP32[$rem + 4 >> 2] = $37 & $n_sroa_1_4_extract_trunc | $a$1 & 0; //@line 8886
    }
    $_0$1 = 0; //@line 8888
    $_0$0 = $n_sroa_1_4_extract_trunc >>> ((_llvm_cttz_i32($d_sroa_1_4_extract_trunc | 0) | 0) >>> 0); //@line 8889
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 8890
   }
   $51 = (Math_clz32($d_sroa_1_4_extract_trunc | 0) | 0) - (Math_clz32($n_sroa_1_4_extract_trunc | 0) | 0) | 0; //@line 8893
   if ($51 >>> 0 <= 30) {
    $57 = $51 + 1 | 0; //@line 8895
    $58 = 31 - $51 | 0; //@line 8896
    $sr_1_ph = $57; //@line 8897
    $r_sroa_0_1_ph = $n_sroa_1_4_extract_trunc << $58 | $n_sroa_0_0_extract_trunc >>> ($57 >>> 0); //@line 8898
    $r_sroa_1_1_ph = $n_sroa_1_4_extract_trunc >>> ($57 >>> 0); //@line 8899
    $q_sroa_0_1_ph = 0; //@line 8900
    $q_sroa_1_1_ph = $n_sroa_0_0_extract_trunc << $58; //@line 8901
    break;
   }
   if (!$rem) {
    $_0$1 = 0; //@line 8905
    $_0$0 = 0; //@line 8906
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 8907
   }
   HEAP32[$rem >> 2] = $a$0 | 0; //@line 8909
   HEAP32[$rem + 4 >> 2] = $n_sroa_1_4_extract_shift$0 | $a$1 & 0; //@line 8910
   $_0$1 = 0; //@line 8911
   $_0$0 = 0; //@line 8912
   return (tempRet0 = $_0$1, $_0$0) | 0; //@line 8913
  } else {
   if (!$17) {
    $119 = (Math_clz32($d_sroa_1_4_extract_trunc | 0) | 0) - (Math_clz32($n_sroa_1_4_extract_trunc | 0) | 0) | 0; //@line 8917
    if ($119 >>> 0 <= 31) {
     $125 = $119 + 1 | 0; //@line 8919
     $126 = 31 - $119 | 0; //@line 8920
     $130 = $119 - 31 >> 31; //@line 8921
     $sr_1_ph = $125; //@line 8922
     $r_sroa_0_1_ph = $n_sroa_0_0_extract_trunc >>> ($125 >>> 0) & $130 | $n_sroa_1_4_extract_trunc << $126; //@line 8923
     $r_sroa_1_1_ph = $n_sroa_1_4_extract_trunc >>> ($125 >>> 0) & $130; //@line 8924
     $q_sroa_0_1_ph = 0; //@line 8925
     $q_sroa_1_1_ph = $n_sroa_0_0_extract_trunc << $126; //@line 8926
     break;
    }
    if (!$rem) {
     $_0$1 = 0; //@line 8930
     $_0$0 = 0; //@line 8931
     return (tempRet0 = $_0$1, $_0$0) | 0; //@line 8932
    }
    HEAP32[$rem >> 2] = $a$0 | 0; //@line 8934
    HEAP32[$rem + 4 >> 2] = $n_sroa_1_4_extract_shift$0 | $a$1 & 0; //@line 8935
    $_0$1 = 0; //@line 8936
    $_0$0 = 0; //@line 8937
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 8938
   }
   $66 = $d_sroa_0_0_extract_trunc - 1 | 0; //@line 8940
   if ($66 & $d_sroa_0_0_extract_trunc | 0) {
    $88 = (Math_clz32($d_sroa_0_0_extract_trunc | 0) | 0) + 33 - (Math_clz32($n_sroa_1_4_extract_trunc | 0) | 0) | 0; //@line 8943
    $89 = 64 - $88 | 0; //@line 8944
    $91 = 32 - $88 | 0; //@line 8945
    $92 = $91 >> 31; //@line 8946
    $95 = $88 - 32 | 0; //@line 8947
    $105 = $95 >> 31; //@line 8948
    $sr_1_ph = $88; //@line 8949
    $r_sroa_0_1_ph = $91 - 1 >> 31 & $n_sroa_1_4_extract_trunc >>> ($95 >>> 0) | ($n_sroa_1_4_extract_trunc << $91 | $n_sroa_0_0_extract_trunc >>> ($88 >>> 0)) & $105; //@line 8950
    $r_sroa_1_1_ph = $105 & $n_sroa_1_4_extract_trunc >>> ($88 >>> 0); //@line 8951
    $q_sroa_0_1_ph = $n_sroa_0_0_extract_trunc << $89 & $92; //@line 8952
    $q_sroa_1_1_ph = ($n_sroa_1_4_extract_trunc << $89 | $n_sroa_0_0_extract_trunc >>> ($95 >>> 0)) & $92 | $n_sroa_0_0_extract_trunc << $91 & $88 - 33 >> 31; //@line 8953
    break;
   }
   if ($rem | 0) {
    HEAP32[$rem >> 2] = $66 & $n_sroa_0_0_extract_trunc; //@line 8957
    HEAP32[$rem + 4 >> 2] = 0; //@line 8958
   }
   if (($d_sroa_0_0_extract_trunc | 0) == 1) {
    $_0$1 = $n_sroa_1_4_extract_shift$0 | $a$1 & 0; //@line 8961
    $_0$0 = $a$0 | 0 | 0; //@line 8962
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 8963
   } else {
    $78 = _llvm_cttz_i32($d_sroa_0_0_extract_trunc | 0) | 0; //@line 8965
    $_0$1 = $n_sroa_1_4_extract_trunc >>> ($78 >>> 0) | 0; //@line 8966
    $_0$0 = $n_sroa_1_4_extract_trunc << 32 - $78 | $n_sroa_0_0_extract_trunc >>> ($78 >>> 0) | 0; //@line 8967
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 8968
   }
  }
 } while (0);
 if (!$sr_1_ph) {
  $q_sroa_1_1_lcssa = $q_sroa_1_1_ph; //@line 8973
  $q_sroa_0_1_lcssa = $q_sroa_0_1_ph; //@line 8974
  $r_sroa_1_1_lcssa = $r_sroa_1_1_ph; //@line 8975
  $r_sroa_0_1_lcssa = $r_sroa_0_1_ph; //@line 8976
  $carry_0_lcssa$1 = 0; //@line 8977
  $carry_0_lcssa$0 = 0; //@line 8978
 } else {
  $d_sroa_0_0_insert_insert99$0 = $b$0 | 0 | 0; //@line 8980
  $d_sroa_0_0_insert_insert99$1 = $d_sroa_1_4_extract_shift$0 | $b$1 & 0; //@line 8981
  $137$0 = _i64Add($d_sroa_0_0_insert_insert99$0 | 0, $d_sroa_0_0_insert_insert99$1 | 0, -1, -1) | 0; //@line 8982
  $137$1 = tempRet0; //@line 8983
  $q_sroa_1_1198 = $q_sroa_1_1_ph; //@line 8984
  $q_sroa_0_1199 = $q_sroa_0_1_ph; //@line 8985
  $r_sroa_1_1200 = $r_sroa_1_1_ph; //@line 8986
  $r_sroa_0_1201 = $r_sroa_0_1_ph; //@line 8987
  $sr_1202 = $sr_1_ph; //@line 8988
  $carry_0203 = 0; //@line 8989
  do {
   $q_sroa_1_1198$looptemp = $q_sroa_1_1198;
   $q_sroa_1_1198 = $q_sroa_0_1199 >>> 31 | $q_sroa_1_1198 << 1; //@line 8991
   $q_sroa_0_1199 = $carry_0203 | $q_sroa_0_1199 << 1; //@line 8992
   $r_sroa_0_0_insert_insert42$0 = $r_sroa_0_1201 << 1 | $q_sroa_1_1198$looptemp >>> 31 | 0; //@line 8993
   $r_sroa_0_0_insert_insert42$1 = $r_sroa_0_1201 >>> 31 | $r_sroa_1_1200 << 1 | 0; //@line 8994
   _i64Subtract($137$0 | 0, $137$1 | 0, $r_sroa_0_0_insert_insert42$0 | 0, $r_sroa_0_0_insert_insert42$1 | 0) | 0; //@line 8995
   $150$1 = tempRet0; //@line 8996
   $151$0 = $150$1 >> 31 | (($150$1 | 0) < 0 ? -1 : 0) << 1; //@line 8997
   $carry_0203 = $151$0 & 1; //@line 8998
   $r_sroa_0_1201 = _i64Subtract($r_sroa_0_0_insert_insert42$0 | 0, $r_sroa_0_0_insert_insert42$1 | 0, $151$0 & $d_sroa_0_0_insert_insert99$0 | 0, ((($150$1 | 0) < 0 ? -1 : 0) >> 31 | (($150$1 | 0) < 0 ? -1 : 0) << 1) & $d_sroa_0_0_insert_insert99$1 | 0) | 0; //@line 9000
   $r_sroa_1_1200 = tempRet0; //@line 9001
   $sr_1202 = $sr_1202 - 1 | 0; //@line 9002
  } while (($sr_1202 | 0) != 0);
  $q_sroa_1_1_lcssa = $q_sroa_1_1198; //@line 9014
  $q_sroa_0_1_lcssa = $q_sroa_0_1199; //@line 9015
  $r_sroa_1_1_lcssa = $r_sroa_1_1200; //@line 9016
  $r_sroa_0_1_lcssa = $r_sroa_0_1201; //@line 9017
  $carry_0_lcssa$1 = 0; //@line 9018
  $carry_0_lcssa$0 = $carry_0203; //@line 9019
 }
 $q_sroa_0_0_insert_ext75$0 = $q_sroa_0_1_lcssa; //@line 9021
 $q_sroa_0_0_insert_ext75$1 = 0; //@line 9022
 if ($rem | 0) {
  HEAP32[$rem >> 2] = $r_sroa_0_1_lcssa; //@line 9025
  HEAP32[$rem + 4 >> 2] = $r_sroa_1_1_lcssa; //@line 9026
 }
 $_0$1 = ($q_sroa_0_0_insert_ext75$0 | 0) >>> 31 | ($q_sroa_1_1_lcssa | $q_sroa_0_0_insert_ext75$1) << 1 | ($q_sroa_0_0_insert_ext75$1 << 1 | $q_sroa_0_0_insert_ext75$0 >>> 31) & 0 | $carry_0_lcssa$1; //@line 9028
 $_0$0 = ($q_sroa_0_0_insert_ext75$0 << 1 | 0 >>> 31) & -2 | $carry_0_lcssa$0; //@line 9029
 return (tempRet0 = $_0$1, $_0$0) | 0; //@line 9030
}
function _mbed_die() {
 var $0 = 0, $AsyncCtx = 0, $AsyncCtx11 = 0, $AsyncCtx15 = 0, $AsyncCtx19 = 0, $AsyncCtx23 = 0, $AsyncCtx27 = 0, $AsyncCtx3 = 0, $AsyncCtx31 = 0, $AsyncCtx35 = 0, $AsyncCtx39 = 0, $AsyncCtx43 = 0, $AsyncCtx47 = 0, $AsyncCtx51 = 0, $AsyncCtx55 = 0, $AsyncCtx59 = 0, $AsyncCtx7 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 81
 STACKTOP = STACKTOP + 32 | 0; //@line 82
 $0 = sp; //@line 83
 _gpio_init_out($0, 50); //@line 84
 while (1) {
  _emscripten_asm_const_iii(0, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 87
  $AsyncCtx59 = _emscripten_alloc_async_context(8, sp) | 0; //@line 88
  _wait_ms(150); //@line 89
  if (___async) {
   label = 3; //@line 92
   break;
  }
  _emscripten_free_async_context($AsyncCtx59 | 0); //@line 95
  _emscripten_asm_const_iii(0, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 97
  $AsyncCtx55 = _emscripten_alloc_async_context(8, sp) | 0; //@line 98
  _wait_ms(150); //@line 99
  if (___async) {
   label = 5; //@line 102
   break;
  }
  _emscripten_free_async_context($AsyncCtx55 | 0); //@line 105
  _emscripten_asm_const_iii(0, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 107
  $AsyncCtx51 = _emscripten_alloc_async_context(8, sp) | 0; //@line 108
  _wait_ms(150); //@line 109
  if (___async) {
   label = 7; //@line 112
   break;
  }
  _emscripten_free_async_context($AsyncCtx51 | 0); //@line 115
  _emscripten_asm_const_iii(0, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 117
  $AsyncCtx47 = _emscripten_alloc_async_context(8, sp) | 0; //@line 118
  _wait_ms(150); //@line 119
  if (___async) {
   label = 9; //@line 122
   break;
  }
  _emscripten_free_async_context($AsyncCtx47 | 0); //@line 125
  _emscripten_asm_const_iii(0, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 127
  $AsyncCtx43 = _emscripten_alloc_async_context(8, sp) | 0; //@line 128
  _wait_ms(150); //@line 129
  if (___async) {
   label = 11; //@line 132
   break;
  }
  _emscripten_free_async_context($AsyncCtx43 | 0); //@line 135
  _emscripten_asm_const_iii(0, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 137
  $AsyncCtx39 = _emscripten_alloc_async_context(8, sp) | 0; //@line 138
  _wait_ms(150); //@line 139
  if (___async) {
   label = 13; //@line 142
   break;
  }
  _emscripten_free_async_context($AsyncCtx39 | 0); //@line 145
  _emscripten_asm_const_iii(0, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 147
  $AsyncCtx35 = _emscripten_alloc_async_context(8, sp) | 0; //@line 148
  _wait_ms(150); //@line 149
  if (___async) {
   label = 15; //@line 152
   break;
  }
  _emscripten_free_async_context($AsyncCtx35 | 0); //@line 155
  _emscripten_asm_const_iii(0, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 157
  $AsyncCtx31 = _emscripten_alloc_async_context(8, sp) | 0; //@line 158
  _wait_ms(150); //@line 159
  if (___async) {
   label = 17; //@line 162
   break;
  }
  _emscripten_free_async_context($AsyncCtx31 | 0); //@line 165
  _emscripten_asm_const_iii(0, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 167
  $AsyncCtx27 = _emscripten_alloc_async_context(8, sp) | 0; //@line 168
  _wait_ms(400); //@line 169
  if (___async) {
   label = 19; //@line 172
   break;
  }
  _emscripten_free_async_context($AsyncCtx27 | 0); //@line 175
  _emscripten_asm_const_iii(0, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 177
  $AsyncCtx23 = _emscripten_alloc_async_context(8, sp) | 0; //@line 178
  _wait_ms(400); //@line 179
  if (___async) {
   label = 21; //@line 182
   break;
  }
  _emscripten_free_async_context($AsyncCtx23 | 0); //@line 185
  _emscripten_asm_const_iii(0, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 187
  $AsyncCtx19 = _emscripten_alloc_async_context(8, sp) | 0; //@line 188
  _wait_ms(400); //@line 189
  if (___async) {
   label = 23; //@line 192
   break;
  }
  _emscripten_free_async_context($AsyncCtx19 | 0); //@line 195
  _emscripten_asm_const_iii(0, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 197
  $AsyncCtx15 = _emscripten_alloc_async_context(8, sp) | 0; //@line 198
  _wait_ms(400); //@line 199
  if (___async) {
   label = 25; //@line 202
   break;
  }
  _emscripten_free_async_context($AsyncCtx15 | 0); //@line 205
  _emscripten_asm_const_iii(0, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 207
  $AsyncCtx11 = _emscripten_alloc_async_context(8, sp) | 0; //@line 208
  _wait_ms(400); //@line 209
  if (___async) {
   label = 27; //@line 212
   break;
  }
  _emscripten_free_async_context($AsyncCtx11 | 0); //@line 215
  _emscripten_asm_const_iii(0, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 217
  $AsyncCtx7 = _emscripten_alloc_async_context(8, sp) | 0; //@line 218
  _wait_ms(400); //@line 219
  if (___async) {
   label = 29; //@line 222
   break;
  }
  _emscripten_free_async_context($AsyncCtx7 | 0); //@line 225
  _emscripten_asm_const_iii(0, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 227
  $AsyncCtx3 = _emscripten_alloc_async_context(8, sp) | 0; //@line 228
  _wait_ms(400); //@line 229
  if (___async) {
   label = 31; //@line 232
   break;
  }
  _emscripten_free_async_context($AsyncCtx3 | 0); //@line 235
  _emscripten_asm_const_iii(0, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 237
  $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 238
  _wait_ms(400); //@line 239
  if (___async) {
   label = 33; //@line 242
   break;
  }
  _emscripten_free_async_context($AsyncCtx | 0); //@line 245
 }
 switch (label | 0) {
 case 3:
  {
   HEAP32[$AsyncCtx59 >> 2] = 7; //@line 249
   HEAP32[$AsyncCtx59 + 4 >> 2] = $0; //@line 251
   sp = STACKTOP; //@line 252
   STACKTOP = sp; //@line 253
   return;
  }
 case 5:
  {
   HEAP32[$AsyncCtx55 >> 2] = 8; //@line 257
   HEAP32[$AsyncCtx55 + 4 >> 2] = $0; //@line 259
   sp = STACKTOP; //@line 260
   STACKTOP = sp; //@line 261
   return;
  }
 case 7:
  {
   HEAP32[$AsyncCtx51 >> 2] = 9; //@line 265
   HEAP32[$AsyncCtx51 + 4 >> 2] = $0; //@line 267
   sp = STACKTOP; //@line 268
   STACKTOP = sp; //@line 269
   return;
  }
 case 9:
  {
   HEAP32[$AsyncCtx47 >> 2] = 10; //@line 273
   HEAP32[$AsyncCtx47 + 4 >> 2] = $0; //@line 275
   sp = STACKTOP; //@line 276
   STACKTOP = sp; //@line 277
   return;
  }
 case 11:
  {
   HEAP32[$AsyncCtx43 >> 2] = 11; //@line 281
   HEAP32[$AsyncCtx43 + 4 >> 2] = $0; //@line 283
   sp = STACKTOP; //@line 284
   STACKTOP = sp; //@line 285
   return;
  }
 case 13:
  {
   HEAP32[$AsyncCtx39 >> 2] = 12; //@line 289
   HEAP32[$AsyncCtx39 + 4 >> 2] = $0; //@line 291
   sp = STACKTOP; //@line 292
   STACKTOP = sp; //@line 293
   return;
  }
 case 15:
  {
   HEAP32[$AsyncCtx35 >> 2] = 13; //@line 297
   HEAP32[$AsyncCtx35 + 4 >> 2] = $0; //@line 299
   sp = STACKTOP; //@line 300
   STACKTOP = sp; //@line 301
   return;
  }
 case 17:
  {
   HEAP32[$AsyncCtx31 >> 2] = 14; //@line 305
   HEAP32[$AsyncCtx31 + 4 >> 2] = $0; //@line 307
   sp = STACKTOP; //@line 308
   STACKTOP = sp; //@line 309
   return;
  }
 case 19:
  {
   HEAP32[$AsyncCtx27 >> 2] = 15; //@line 313
   HEAP32[$AsyncCtx27 + 4 >> 2] = $0; //@line 315
   sp = STACKTOP; //@line 316
   STACKTOP = sp; //@line 317
   return;
  }
 case 21:
  {
   HEAP32[$AsyncCtx23 >> 2] = 16; //@line 321
   HEAP32[$AsyncCtx23 + 4 >> 2] = $0; //@line 323
   sp = STACKTOP; //@line 324
   STACKTOP = sp; //@line 325
   return;
  }
 case 23:
  {
   HEAP32[$AsyncCtx19 >> 2] = 17; //@line 329
   HEAP32[$AsyncCtx19 + 4 >> 2] = $0; //@line 331
   sp = STACKTOP; //@line 332
   STACKTOP = sp; //@line 333
   return;
  }
 case 25:
  {
   HEAP32[$AsyncCtx15 >> 2] = 18; //@line 337
   HEAP32[$AsyncCtx15 + 4 >> 2] = $0; //@line 339
   sp = STACKTOP; //@line 340
   STACKTOP = sp; //@line 341
   return;
  }
 case 27:
  {
   HEAP32[$AsyncCtx11 >> 2] = 19; //@line 345
   HEAP32[$AsyncCtx11 + 4 >> 2] = $0; //@line 347
   sp = STACKTOP; //@line 348
   STACKTOP = sp; //@line 349
   return;
  }
 case 29:
  {
   HEAP32[$AsyncCtx7 >> 2] = 20; //@line 353
   HEAP32[$AsyncCtx7 + 4 >> 2] = $0; //@line 355
   sp = STACKTOP; //@line 356
   STACKTOP = sp; //@line 357
   return;
  }
 case 31:
  {
   HEAP32[$AsyncCtx3 >> 2] = 21; //@line 361
   HEAP32[$AsyncCtx3 + 4 >> 2] = $0; //@line 363
   sp = STACKTOP; //@line 364
   STACKTOP = sp; //@line 365
   return;
  }
 case 33:
  {
   HEAP32[$AsyncCtx >> 2] = 22; //@line 369
   HEAP32[$AsyncCtx + 4 >> 2] = $0; //@line 371
   sp = STACKTOP; //@line 372
   STACKTOP = sp; //@line 373
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
      $9 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 5520
      $10 = HEAP32[$9 >> 2] | 0; //@line 5521
      HEAP32[$2 >> 2] = $9 + 4; //@line 5523
      HEAP32[$0 >> 2] = $10; //@line 5524
      break L1;
      break;
     }
    case 10:
     {
      $16 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 5540
      $17 = HEAP32[$16 >> 2] | 0; //@line 5541
      HEAP32[$2 >> 2] = $16 + 4; //@line 5543
      $20 = $0; //@line 5546
      HEAP32[$20 >> 2] = $17; //@line 5548
      HEAP32[$20 + 4 >> 2] = (($17 | 0) < 0) << 31 >> 31; //@line 5551
      break L1;
      break;
     }
    case 11:
     {
      $29 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 5567
      $30 = HEAP32[$29 >> 2] | 0; //@line 5568
      HEAP32[$2 >> 2] = $29 + 4; //@line 5570
      $31 = $0; //@line 5571
      HEAP32[$31 >> 2] = $30; //@line 5573
      HEAP32[$31 + 4 >> 2] = 0; //@line 5576
      break L1;
      break;
     }
    case 12:
     {
      $40 = (HEAP32[$2 >> 2] | 0) + (8 - 1) & ~(8 - 1); //@line 5592
      $41 = $40; //@line 5593
      $43 = HEAP32[$41 >> 2] | 0; //@line 5595
      $46 = HEAP32[$41 + 4 >> 2] | 0; //@line 5598
      HEAP32[$2 >> 2] = $40 + 8; //@line 5600
      $47 = $0; //@line 5601
      HEAP32[$47 >> 2] = $43; //@line 5603
      HEAP32[$47 + 4 >> 2] = $46; //@line 5606
      break L1;
      break;
     }
    case 13:
     {
      $56 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 5622
      $57 = HEAP32[$56 >> 2] | 0; //@line 5623
      HEAP32[$2 >> 2] = $56 + 4; //@line 5625
      $59 = ($57 & 65535) << 16 >> 16; //@line 5627
      $62 = $0; //@line 5630
      HEAP32[$62 >> 2] = $59; //@line 5632
      HEAP32[$62 + 4 >> 2] = (($59 | 0) < 0) << 31 >> 31; //@line 5635
      break L1;
      break;
     }
    case 14:
     {
      $71 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 5651
      $72 = HEAP32[$71 >> 2] | 0; //@line 5652
      HEAP32[$2 >> 2] = $71 + 4; //@line 5654
      $73 = $0; //@line 5656
      HEAP32[$73 >> 2] = $72 & 65535; //@line 5658
      HEAP32[$73 + 4 >> 2] = 0; //@line 5661
      break L1;
      break;
     }
    case 15:
     {
      $82 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 5677
      $83 = HEAP32[$82 >> 2] | 0; //@line 5678
      HEAP32[$2 >> 2] = $82 + 4; //@line 5680
      $85 = ($83 & 255) << 24 >> 24; //@line 5682
      $88 = $0; //@line 5685
      HEAP32[$88 >> 2] = $85; //@line 5687
      HEAP32[$88 + 4 >> 2] = (($85 | 0) < 0) << 31 >> 31; //@line 5690
      break L1;
      break;
     }
    case 16:
     {
      $97 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 5706
      $98 = HEAP32[$97 >> 2] | 0; //@line 5707
      HEAP32[$2 >> 2] = $97 + 4; //@line 5709
      $99 = $0; //@line 5711
      HEAP32[$99 >> 2] = $98 & 255; //@line 5713
      HEAP32[$99 + 4 >> 2] = 0; //@line 5716
      break L1;
      break;
     }
    case 17:
     {
      $108 = (HEAP32[$2 >> 2] | 0) + (8 - 1) & ~(8 - 1); //@line 5732
      $109 = +HEAPF64[$108 >> 3]; //@line 5733
      HEAP32[$2 >> 2] = $108 + 8; //@line 5735
      HEAPF64[$0 >> 3] = $109; //@line 5736
      break L1;
      break;
     }
    case 18:
     {
      $115 = (HEAP32[$2 >> 2] | 0) + (8 - 1) & ~(8 - 1); //@line 5752
      $116 = +HEAPF64[$115 >> 3]; //@line 5753
      HEAP32[$2 >> 2] = $115 + 8; //@line 5755
      HEAPF64[$0 >> 3] = $116; //@line 5756
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
 sp = STACKTOP; //@line 4420
 STACKTOP = STACKTOP + 224 | 0; //@line 4421
 $3 = sp + 120 | 0; //@line 4422
 $4 = sp + 80 | 0; //@line 4423
 $5 = sp; //@line 4424
 $6 = sp + 136 | 0; //@line 4425
 dest = $4; //@line 4426
 stop = dest + 40 | 0; //@line 4426
 do {
  HEAP32[dest >> 2] = 0; //@line 4426
  dest = dest + 4 | 0; //@line 4426
 } while ((dest | 0) < (stop | 0));
 HEAP32[$3 >> 2] = HEAP32[$2 >> 2]; //@line 4428
 if ((_printf_core(0, $1, $3, $5, $4) | 0) < 0) {
  $$0 = -1; //@line 4432
 } else {
  if ((HEAP32[$0 + 76 >> 2] | 0) > -1) {
   $43 = ___lockfile($0) | 0; //@line 4439
  } else {
   $43 = 0; //@line 4441
  }
  $13 = HEAP32[$0 >> 2] | 0; //@line 4443
  $14 = $13 & 32; //@line 4444
  if ((HEAP8[$0 + 74 >> 0] | 0) < 1) {
   HEAP32[$0 >> 2] = $13 & -33; //@line 4450
  }
  $19 = $0 + 48 | 0; //@line 4452
  do {
   if (!(HEAP32[$19 >> 2] | 0)) {
    $23 = $0 + 44 | 0; //@line 4457
    $24 = HEAP32[$23 >> 2] | 0; //@line 4458
    HEAP32[$23 >> 2] = $6; //@line 4459
    $25 = $0 + 28 | 0; //@line 4460
    HEAP32[$25 >> 2] = $6; //@line 4461
    $26 = $0 + 20 | 0; //@line 4462
    HEAP32[$26 >> 2] = $6; //@line 4463
    HEAP32[$19 >> 2] = 80; //@line 4464
    $28 = $0 + 16 | 0; //@line 4466
    HEAP32[$28 >> 2] = $6 + 80; //@line 4467
    $29 = _printf_core($0, $1, $3, $5, $4) | 0; //@line 4468
    if (!$24) {
     $$1 = $29; //@line 4471
    } else {
     $32 = HEAP32[$0 + 36 >> 2] | 0; //@line 4474
     $AsyncCtx = _emscripten_alloc_async_context(64, sp) | 0; //@line 4475
     FUNCTION_TABLE_iiii[$32 & 7]($0, 0, 0) | 0; //@line 4476
     if (___async) {
      HEAP32[$AsyncCtx >> 2] = 28; //@line 4479
      HEAP32[$AsyncCtx + 4 >> 2] = $26; //@line 4481
      HEAP32[$AsyncCtx + 8 >> 2] = $29; //@line 4483
      HEAP32[$AsyncCtx + 12 >> 2] = $24; //@line 4485
      HEAP32[$AsyncCtx + 16 >> 2] = $23; //@line 4487
      HEAP32[$AsyncCtx + 20 >> 2] = $19; //@line 4489
      HEAP32[$AsyncCtx + 24 >> 2] = $28; //@line 4491
      HEAP32[$AsyncCtx + 28 >> 2] = $25; //@line 4493
      HEAP32[$AsyncCtx + 32 >> 2] = $0; //@line 4495
      HEAP32[$AsyncCtx + 36 >> 2] = $14; //@line 4497
      HEAP32[$AsyncCtx + 40 >> 2] = $43; //@line 4499
      HEAP32[$AsyncCtx + 44 >> 2] = $0; //@line 4501
      HEAP32[$AsyncCtx + 48 >> 2] = $6; //@line 4503
      HEAP32[$AsyncCtx + 52 >> 2] = $5; //@line 4505
      HEAP32[$AsyncCtx + 56 >> 2] = $4; //@line 4507
      HEAP32[$AsyncCtx + 60 >> 2] = $3; //@line 4509
      sp = STACKTOP; //@line 4510
      STACKTOP = sp; //@line 4511
      return 0; //@line 4511
     } else {
      _emscripten_free_async_context($AsyncCtx | 0); //@line 4513
      $$ = (HEAP32[$26 >> 2] | 0) == 0 ? -1 : $29; //@line 4516
      HEAP32[$23 >> 2] = $24; //@line 4517
      HEAP32[$19 >> 2] = 0; //@line 4518
      HEAP32[$28 >> 2] = 0; //@line 4519
      HEAP32[$25 >> 2] = 0; //@line 4520
      HEAP32[$26 >> 2] = 0; //@line 4521
      $$1 = $$; //@line 4522
      break;
     }
    }
   } else {
    $$1 = _printf_core($0, $1, $3, $5, $4) | 0; //@line 4528
   }
  } while (0);
  $51 = HEAP32[$0 >> 2] | 0; //@line 4531
  HEAP32[$0 >> 2] = $51 | $14; //@line 4536
  if ($43 | 0) {
   ___unlockfile($0); //@line 4539
  }
  $$0 = ($51 & 32 | 0) == 0 ? $$1 : -1; //@line 4541
 }
 STACKTOP = sp; //@line 4543
 return $$0 | 0; //@line 4543
}
function ___dynamic_cast($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $$0 = 0, $10 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $24 = 0, $30 = 0, $33 = 0, $4 = 0, $5 = 0, $8 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, dest = 0, sp = 0, stop = 0;
 sp = STACKTOP; //@line 7538
 STACKTOP = STACKTOP + 64 | 0; //@line 7539
 $4 = sp; //@line 7540
 $5 = HEAP32[$0 >> 2] | 0; //@line 7541
 $8 = $0 + (HEAP32[$5 + -8 >> 2] | 0) | 0; //@line 7544
 $10 = HEAP32[$5 + -4 >> 2] | 0; //@line 7546
 HEAP32[$4 >> 2] = $2; //@line 7547
 HEAP32[$4 + 4 >> 2] = $0; //@line 7549
 HEAP32[$4 + 8 >> 2] = $1; //@line 7551
 HEAP32[$4 + 12 >> 2] = $3; //@line 7553
 $14 = $4 + 16 | 0; //@line 7554
 $15 = $4 + 20 | 0; //@line 7555
 $16 = $4 + 24 | 0; //@line 7556
 $17 = $4 + 28 | 0; //@line 7557
 $18 = $4 + 32 | 0; //@line 7558
 $19 = $4 + 40 | 0; //@line 7559
 dest = $14; //@line 7560
 stop = dest + 36 | 0; //@line 7560
 do {
  HEAP32[dest >> 2] = 0; //@line 7560
  dest = dest + 4 | 0; //@line 7560
 } while ((dest | 0) < (stop | 0));
 HEAP16[$14 + 36 >> 1] = 0; //@line 7560
 HEAP8[$14 + 38 >> 0] = 0; //@line 7560
 L1 : do {
  if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($10, $2, 0) | 0) {
   HEAP32[$4 + 48 >> 2] = 1; //@line 7565
   $24 = HEAP32[(HEAP32[$10 >> 2] | 0) + 20 >> 2] | 0; //@line 7568
   $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 7569
   FUNCTION_TABLE_viiiiii[$24 & 3]($10, $4, $8, $8, 1, 0); //@line 7570
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 32; //@line 7573
    HEAP32[$AsyncCtx + 4 >> 2] = $16; //@line 7575
    HEAP32[$AsyncCtx + 8 >> 2] = $8; //@line 7577
    HEAP32[$AsyncCtx + 12 >> 2] = $4; //@line 7579
    sp = STACKTOP; //@line 7580
    STACKTOP = sp; //@line 7581
    return 0; //@line 7581
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 7583
    $$0 = (HEAP32[$16 >> 2] | 0) == 1 ? $8 : 0; //@line 7587
    break;
   }
  } else {
   $30 = $4 + 36 | 0; //@line 7591
   $33 = HEAP32[(HEAP32[$10 >> 2] | 0) + 24 >> 2] | 0; //@line 7594
   $AsyncCtx3 = _emscripten_alloc_async_context(36, sp) | 0; //@line 7595
   FUNCTION_TABLE_viiiii[$33 & 3]($10, $4, $8, 1, 0); //@line 7596
   if (___async) {
    HEAP32[$AsyncCtx3 >> 2] = 33; //@line 7599
    HEAP32[$AsyncCtx3 + 4 >> 2] = $30; //@line 7601
    HEAP32[$AsyncCtx3 + 8 >> 2] = $4; //@line 7603
    HEAP32[$AsyncCtx3 + 12 >> 2] = $19; //@line 7605
    HEAP32[$AsyncCtx3 + 16 >> 2] = $17; //@line 7607
    HEAP32[$AsyncCtx3 + 20 >> 2] = $18; //@line 7609
    HEAP32[$AsyncCtx3 + 24 >> 2] = $15; //@line 7611
    HEAP32[$AsyncCtx3 + 28 >> 2] = $16; //@line 7613
    HEAP32[$AsyncCtx3 + 32 >> 2] = $14; //@line 7615
    sp = STACKTOP; //@line 7616
    STACKTOP = sp; //@line 7617
    return 0; //@line 7617
   }
   _emscripten_free_async_context($AsyncCtx3 | 0); //@line 7619
   switch (HEAP32[$30 >> 2] | 0) {
   case 0:
    {
     $$0 = (HEAP32[$19 >> 2] | 0) == 1 & (HEAP32[$17 >> 2] | 0) == 1 & (HEAP32[$18 >> 2] | 0) == 1 ? HEAP32[$15 >> 2] | 0 : 0; //@line 7633
     break L1;
     break;
    }
   case 1:
    {
     break;
    }
   default:
    {
     $$0 = 0; //@line 7641
     break L1;
    }
   }
   if ((HEAP32[$16 >> 2] | 0) != 1) {
    if (!((HEAP32[$19 >> 2] | 0) == 0 & (HEAP32[$17 >> 2] | 0) == 1 & (HEAP32[$18 >> 2] | 0) == 1)) {
     $$0 = 0; //@line 7657
     break;
    }
   }
   $$0 = HEAP32[$14 >> 2] | 0; //@line 7662
  }
 } while (0);
 STACKTOP = sp; //@line 7665
 return $$0 | 0; //@line 7665
}
function _memchr($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$0$lcssa = 0, $$035$lcssa = 0, $$035$lcssa65 = 0, $$03555 = 0, $$036$lcssa = 0, $$036$lcssa64 = 0, $$03654 = 0, $$046 = 0, $$137$lcssa = 0, $$13745 = 0, $$140 = 0, $$2 = 0, $$23839 = 0, $$3 = 0, $$lcssa = 0, $11 = 0, $12 = 0, $16 = 0, $18 = 0, $20 = 0, $23 = 0, $29 = 0, $3 = 0, $30 = 0, $35 = 0, $7 = 0, $8 = 0, label = 0;
 $3 = $1 & 255; //@line 4292
 $7 = ($2 | 0) != 0; //@line 4296
 L1 : do {
  if ($7 & ($0 & 3 | 0) != 0) {
   $8 = $1 & 255; //@line 4300
   $$03555 = $0; //@line 4301
   $$03654 = $2; //@line 4301
   while (1) {
    if ((HEAP8[$$03555 >> 0] | 0) == $8 << 24 >> 24) {
     $$035$lcssa65 = $$03555; //@line 4306
     $$036$lcssa64 = $$03654; //@line 4306
     label = 6; //@line 4307
     break L1;
    }
    $11 = $$03555 + 1 | 0; //@line 4310
    $12 = $$03654 + -1 | 0; //@line 4311
    $16 = ($12 | 0) != 0; //@line 4315
    if ($16 & ($11 & 3 | 0) != 0) {
     $$03555 = $11; //@line 4318
     $$03654 = $12; //@line 4318
    } else {
     $$035$lcssa = $11; //@line 4320
     $$036$lcssa = $12; //@line 4320
     $$lcssa = $16; //@line 4320
     label = 5; //@line 4321
     break;
    }
   }
  } else {
   $$035$lcssa = $0; //@line 4326
   $$036$lcssa = $2; //@line 4326
   $$lcssa = $7; //@line 4326
   label = 5; //@line 4327
  }
 } while (0);
 if ((label | 0) == 5) {
  if ($$lcssa) {
   $$035$lcssa65 = $$035$lcssa; //@line 4332
   $$036$lcssa64 = $$036$lcssa; //@line 4332
   label = 6; //@line 4333
  } else {
   $$2 = $$035$lcssa; //@line 4335
   $$3 = 0; //@line 4335
  }
 }
 L8 : do {
  if ((label | 0) == 6) {
   $18 = $1 & 255; //@line 4341
   if ((HEAP8[$$035$lcssa65 >> 0] | 0) == $18 << 24 >> 24) {
    $$2 = $$035$lcssa65; //@line 4344
    $$3 = $$036$lcssa64; //@line 4344
   } else {
    $20 = Math_imul($3, 16843009) | 0; //@line 4346
    L11 : do {
     if ($$036$lcssa64 >>> 0 > 3) {
      $$046 = $$035$lcssa65; //@line 4350
      $$13745 = $$036$lcssa64; //@line 4350
      while (1) {
       $23 = HEAP32[$$046 >> 2] ^ $20; //@line 4353
       if (($23 & -2139062144 ^ -2139062144) & $23 + -16843009 | 0) {
        break;
       }
       $29 = $$046 + 4 | 0; //@line 4362
       $30 = $$13745 + -4 | 0; //@line 4363
       if ($30 >>> 0 > 3) {
        $$046 = $29; //@line 4366
        $$13745 = $30; //@line 4366
       } else {
        $$0$lcssa = $29; //@line 4368
        $$137$lcssa = $30; //@line 4368
        label = 11; //@line 4369
        break L11;
       }
      }
      $$140 = $$046; //@line 4373
      $$23839 = $$13745; //@line 4373
     } else {
      $$0$lcssa = $$035$lcssa65; //@line 4375
      $$137$lcssa = $$036$lcssa64; //@line 4375
      label = 11; //@line 4376
     }
    } while (0);
    if ((label | 0) == 11) {
     if (!$$137$lcssa) {
      $$2 = $$0$lcssa; //@line 4382
      $$3 = 0; //@line 4382
      break;
     } else {
      $$140 = $$0$lcssa; //@line 4385
      $$23839 = $$137$lcssa; //@line 4385
     }
    }
    while (1) {
     if ((HEAP8[$$140 >> 0] | 0) == $18 << 24 >> 24) {
      $$2 = $$140; //@line 4392
      $$3 = $$23839; //@line 4392
      break L8;
     }
     $35 = $$140 + 1 | 0; //@line 4395
     $$23839 = $$23839 + -1 | 0; //@line 4396
     if (!$$23839) {
      $$2 = $35; //@line 4399
      $$3 = 0; //@line 4399
      break;
     } else {
      $$140 = $35; //@line 4402
     }
    }
   }
  }
 } while (0);
 return ($$3 | 0 ? $$2 : 0) | 0; //@line 4410
}
function __ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($0, $1, $2, $3, $4) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 var $$037$off038 = 0, $$037$off039 = 0, $13 = 0, $19 = 0, $22 = 0, $23 = 0, $25 = 0, $28 = 0, $39 = 0, $50 = 0, $53 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 7720
 do {
  if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, $4) | 0) {
   __ZNK10__cxxabiv117__class_type_info29process_static_type_below_dstEPNS_19__dynamic_cast_infoEPKvi(0, $1, $2, $3); //@line 7726
  } else {
   if (!(__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 >> 2] | 0, $4) | 0)) {
    $50 = HEAP32[$0 + 8 >> 2] | 0; //@line 7732
    $53 = HEAP32[(HEAP32[$50 >> 2] | 0) + 24 >> 2] | 0; //@line 7735
    $AsyncCtx3 = _emscripten_alloc_async_context(4, sp) | 0; //@line 7736
    FUNCTION_TABLE_viiiii[$53 & 3]($50, $1, $2, $3, $4); //@line 7737
    if (___async) {
     HEAP32[$AsyncCtx3 >> 2] = 36; //@line 7740
     sp = STACKTOP; //@line 7741
     return;
    } else {
     _emscripten_free_async_context($AsyncCtx3 | 0); //@line 7744
     break;
    }
   }
   if ((HEAP32[$1 + 16 >> 2] | 0) != ($2 | 0)) {
    $13 = $1 + 20 | 0; //@line 7752
    if ((HEAP32[$13 >> 2] | 0) != ($2 | 0)) {
     HEAP32[$1 + 32 >> 2] = $3; //@line 7757
     $19 = $1 + 44 | 0; //@line 7758
     if ((HEAP32[$19 >> 2] | 0) == 4) {
      break;
     }
     $22 = $1 + 52 | 0; //@line 7764
     HEAP8[$22 >> 0] = 0; //@line 7765
     $23 = $1 + 53 | 0; //@line 7766
     HEAP8[$23 >> 0] = 0; //@line 7767
     $25 = HEAP32[$0 + 8 >> 2] | 0; //@line 7769
     $28 = HEAP32[(HEAP32[$25 >> 2] | 0) + 20 >> 2] | 0; //@line 7772
     $AsyncCtx = _emscripten_alloc_async_context(28, sp) | 0; //@line 7773
     FUNCTION_TABLE_viiiiii[$28 & 3]($25, $1, $2, $2, 1, $4); //@line 7774
     if (___async) {
      HEAP32[$AsyncCtx >> 2] = 35; //@line 7777
      HEAP32[$AsyncCtx + 4 >> 2] = $23; //@line 7779
      HEAP32[$AsyncCtx + 8 >> 2] = $2; //@line 7781
      HEAP32[$AsyncCtx + 12 >> 2] = $13; //@line 7783
      HEAP32[$AsyncCtx + 16 >> 2] = $1; //@line 7785
      HEAP32[$AsyncCtx + 20 >> 2] = $22; //@line 7787
      HEAP32[$AsyncCtx + 24 >> 2] = $19; //@line 7789
      sp = STACKTOP; //@line 7790
      return;
     }
     _emscripten_free_async_context($AsyncCtx | 0); //@line 7793
     if (!(HEAP8[$23 >> 0] | 0)) {
      $$037$off038 = 4; //@line 7797
      label = 13; //@line 7798
     } else {
      if (!(HEAP8[$22 >> 0] | 0)) {
       $$037$off038 = 3; //@line 7803
       label = 13; //@line 7804
      } else {
       $$037$off039 = 3; //@line 7806
      }
     }
     if ((label | 0) == 13) {
      HEAP32[$13 >> 2] = $2; //@line 7810
      $39 = $1 + 40 | 0; //@line 7811
      HEAP32[$39 >> 2] = (HEAP32[$39 >> 2] | 0) + 1; //@line 7814
      if ((HEAP32[$1 + 36 >> 2] | 0) == 1) {
       if ((HEAP32[$1 + 24 >> 2] | 0) == 2) {
        HEAP8[$1 + 54 >> 0] = 1; //@line 7824
        $$037$off039 = $$037$off038; //@line 7825
       } else {
        $$037$off039 = $$037$off038; //@line 7827
       }
      } else {
       $$037$off039 = $$037$off038; //@line 7830
      }
     }
     HEAP32[$19 >> 2] = $$037$off039; //@line 7833
     break;
    }
   }
   if (($3 | 0) == 1) {
    HEAP32[$1 + 32 >> 2] = 1; //@line 7840
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
 sp = STACKTOP; //@line 3749
 STACKTOP = STACKTOP + 48 | 0; //@line 3750
 $vararg_buffer3 = sp + 16 | 0; //@line 3751
 $vararg_buffer = sp; //@line 3752
 $3 = sp + 32 | 0; //@line 3753
 $4 = $0 + 28 | 0; //@line 3754
 $5 = HEAP32[$4 >> 2] | 0; //@line 3755
 HEAP32[$3 >> 2] = $5; //@line 3756
 $7 = $0 + 20 | 0; //@line 3758
 $9 = (HEAP32[$7 >> 2] | 0) - $5 | 0; //@line 3760
 HEAP32[$3 + 4 >> 2] = $9; //@line 3761
 HEAP32[$3 + 8 >> 2] = $1; //@line 3763
 HEAP32[$3 + 12 >> 2] = $2; //@line 3765
 $12 = $9 + $2 | 0; //@line 3766
 $13 = $0 + 60 | 0; //@line 3767
 HEAP32[$vararg_buffer >> 2] = HEAP32[$13 >> 2]; //@line 3770
 HEAP32[$vararg_buffer + 4 >> 2] = $3; //@line 3772
 HEAP32[$vararg_buffer + 8 >> 2] = 2; //@line 3774
 $17 = ___syscall_ret(___syscall146(146, $vararg_buffer | 0) | 0) | 0; //@line 3776
 L1 : do {
  if (($12 | 0) == ($17 | 0)) {
   label = 3; //@line 3780
  } else {
   $$04756 = 2; //@line 3782
   $$04855 = $12; //@line 3782
   $$04954 = $3; //@line 3782
   $27 = $17; //@line 3782
   while (1) {
    if (($27 | 0) < 0) {
     break;
    }
    $$04855 = $$04855 - $27 | 0; //@line 3788
    $37 = HEAP32[$$04954 + 4 >> 2] | 0; //@line 3790
    $38 = $27 >>> 0 > $37 >>> 0; //@line 3791
    $$150 = $38 ? $$04954 + 8 | 0 : $$04954; //@line 3793
    $$1 = $$04756 + ($38 << 31 >> 31) | 0; //@line 3795
    $$0 = $27 - ($38 ? $37 : 0) | 0; //@line 3797
    HEAP32[$$150 >> 2] = (HEAP32[$$150 >> 2] | 0) + $$0; //@line 3800
    $44 = $$150 + 4 | 0; //@line 3801
    HEAP32[$44 >> 2] = (HEAP32[$44 >> 2] | 0) - $$0; //@line 3804
    HEAP32[$vararg_buffer3 >> 2] = HEAP32[$13 >> 2]; //@line 3807
    HEAP32[$vararg_buffer3 + 4 >> 2] = $$150; //@line 3809
    HEAP32[$vararg_buffer3 + 8 >> 2] = $$1; //@line 3811
    $27 = ___syscall_ret(___syscall146(146, $vararg_buffer3 | 0) | 0) | 0; //@line 3813
    if (($$04855 | 0) == ($27 | 0)) {
     label = 3; //@line 3816
     break L1;
    } else {
     $$04756 = $$1; //@line 3819
     $$04954 = $$150; //@line 3819
    }
   }
   HEAP32[$0 + 16 >> 2] = 0; //@line 3823
   HEAP32[$4 >> 2] = 0; //@line 3824
   HEAP32[$7 >> 2] = 0; //@line 3825
   HEAP32[$0 >> 2] = HEAP32[$0 >> 2] | 32; //@line 3828
   if (($$04756 | 0) == 2) {
    $$051 = 0; //@line 3831
   } else {
    $$051 = $2 - (HEAP32[$$04954 + 4 >> 2] | 0) | 0; //@line 3836
   }
  }
 } while (0);
 if ((label | 0) == 3) {
  $20 = HEAP32[$0 + 44 >> 2] | 0; //@line 3842
  HEAP32[$0 + 16 >> 2] = $20 + (HEAP32[$0 + 48 >> 2] | 0); //@line 3847
  $25 = $20; //@line 3848
  HEAP32[$4 >> 2] = $25; //@line 3849
  HEAP32[$7 >> 2] = $25; //@line 3850
  $$051 = $2; //@line 3851
 }
 STACKTOP = sp; //@line 3853
 return $$051 | 0; //@line 3853
}
function _memcpy(dest, src, num) {
 dest = dest | 0;
 src = src | 0;
 num = num | 0;
 var ret = 0, aligned_dest_end = 0, block_aligned_dest_end = 0, dest_end = 0;
 if ((num | 0) >= 8192) {
  return _emscripten_memcpy_big(dest | 0, src | 0, num | 0) | 0; //@line 9138
 }
 ret = dest | 0; //@line 9141
 dest_end = dest + num | 0; //@line 9142
 if ((dest & 3) == (src & 3)) {
  while (dest & 3) {
   if (!num) return ret | 0; //@line 9146
   HEAP8[dest >> 0] = HEAP8[src >> 0] | 0; //@line 9147
   dest = dest + 1 | 0; //@line 9148
   src = src + 1 | 0; //@line 9149
   num = num - 1 | 0; //@line 9150
  }
  aligned_dest_end = dest_end & -4 | 0; //@line 9152
  block_aligned_dest_end = aligned_dest_end - 64 | 0; //@line 9153
  while ((dest | 0) <= (block_aligned_dest_end | 0)) {
   HEAP32[dest >> 2] = HEAP32[src >> 2]; //@line 9155
   HEAP32[dest + 4 >> 2] = HEAP32[src + 4 >> 2]; //@line 9156
   HEAP32[dest + 8 >> 2] = HEAP32[src + 8 >> 2]; //@line 9157
   HEAP32[dest + 12 >> 2] = HEAP32[src + 12 >> 2]; //@line 9158
   HEAP32[dest + 16 >> 2] = HEAP32[src + 16 >> 2]; //@line 9159
   HEAP32[dest + 20 >> 2] = HEAP32[src + 20 >> 2]; //@line 9160
   HEAP32[dest + 24 >> 2] = HEAP32[src + 24 >> 2]; //@line 9161
   HEAP32[dest + 28 >> 2] = HEAP32[src + 28 >> 2]; //@line 9162
   HEAP32[dest + 32 >> 2] = HEAP32[src + 32 >> 2]; //@line 9163
   HEAP32[dest + 36 >> 2] = HEAP32[src + 36 >> 2]; //@line 9164
   HEAP32[dest + 40 >> 2] = HEAP32[src + 40 >> 2]; //@line 9165
   HEAP32[dest + 44 >> 2] = HEAP32[src + 44 >> 2]; //@line 9166
   HEAP32[dest + 48 >> 2] = HEAP32[src + 48 >> 2]; //@line 9167
   HEAP32[dest + 52 >> 2] = HEAP32[src + 52 >> 2]; //@line 9168
   HEAP32[dest + 56 >> 2] = HEAP32[src + 56 >> 2]; //@line 9169
   HEAP32[dest + 60 >> 2] = HEAP32[src + 60 >> 2]; //@line 9170
   dest = dest + 64 | 0; //@line 9171
   src = src + 64 | 0; //@line 9172
  }
  while ((dest | 0) < (aligned_dest_end | 0)) {
   HEAP32[dest >> 2] = HEAP32[src >> 2]; //@line 9175
   dest = dest + 4 | 0; //@line 9176
   src = src + 4 | 0; //@line 9177
  }
 } else {
  aligned_dest_end = dest_end - 4 | 0; //@line 9181
  while ((dest | 0) < (aligned_dest_end | 0)) {
   HEAP8[dest >> 0] = HEAP8[src >> 0] | 0; //@line 9183
   HEAP8[dest + 1 >> 0] = HEAP8[src + 1 >> 0] | 0; //@line 9184
   HEAP8[dest + 2 >> 0] = HEAP8[src + 2 >> 0] | 0; //@line 9185
   HEAP8[dest + 3 >> 0] = HEAP8[src + 3 >> 0] | 0; //@line 9186
   dest = dest + 4 | 0; //@line 9187
   src = src + 4 | 0; //@line 9188
  }
 }
 while ((dest | 0) < (dest_end | 0)) {
  HEAP8[dest >> 0] = HEAP8[src >> 0] | 0; //@line 9193
  dest = dest + 1 | 0; //@line 9194
  src = src + 1 | 0; //@line 9195
 }
 return ret | 0; //@line 9197
}
function __ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$0 = 0, $$2 = 0, $17 = 0, $18 = 0, $3 = 0, $6 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, dest = 0, sp = 0, stop = 0;
 sp = STACKTOP; //@line 7221
 STACKTOP = STACKTOP + 64 | 0; //@line 7222
 $3 = sp; //@line 7223
 if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, $1, 0) | 0) {
  $$2 = 1; //@line 7226
 } else {
  if (!$1) {
   $$2 = 0; //@line 7230
  } else {
   $AsyncCtx3 = _emscripten_alloc_async_context(16, sp) | 0; //@line 7232
   $6 = ___dynamic_cast($1, 24, 8, 0) | 0; //@line 7233
   if (___async) {
    HEAP32[$AsyncCtx3 >> 2] = 30; //@line 7236
    HEAP32[$AsyncCtx3 + 4 >> 2] = $3; //@line 7238
    HEAP32[$AsyncCtx3 + 8 >> 2] = $0; //@line 7240
    HEAP32[$AsyncCtx3 + 12 >> 2] = $2; //@line 7242
    sp = STACKTOP; //@line 7243
    STACKTOP = sp; //@line 7244
    return 0; //@line 7244
   }
   _emscripten_free_async_context($AsyncCtx3 | 0); //@line 7246
   if (!$6) {
    $$2 = 0; //@line 7249
   } else {
    dest = $3 + 4 | 0; //@line 7252
    stop = dest + 52 | 0; //@line 7252
    do {
     HEAP32[dest >> 2] = 0; //@line 7252
     dest = dest + 4 | 0; //@line 7252
    } while ((dest | 0) < (stop | 0));
    HEAP32[$3 >> 2] = $6; //@line 7253
    HEAP32[$3 + 8 >> 2] = $0; //@line 7255
    HEAP32[$3 + 12 >> 2] = -1; //@line 7257
    HEAP32[$3 + 48 >> 2] = 1; //@line 7259
    $17 = HEAP32[(HEAP32[$6 >> 2] | 0) + 28 >> 2] | 0; //@line 7262
    $18 = HEAP32[$2 >> 2] | 0; //@line 7263
    $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 7264
    FUNCTION_TABLE_viiii[$17 & 3]($6, $3, $18, 1); //@line 7265
    if (___async) {
     HEAP32[$AsyncCtx >> 2] = 31; //@line 7268
     HEAP32[$AsyncCtx + 4 >> 2] = $3; //@line 7270
     HEAP32[$AsyncCtx + 8 >> 2] = $2; //@line 7272
     HEAP32[$AsyncCtx + 12 >> 2] = $3; //@line 7274
     sp = STACKTOP; //@line 7275
     STACKTOP = sp; //@line 7276
     return 0; //@line 7276
    }
    _emscripten_free_async_context($AsyncCtx | 0); //@line 7278
    if ((HEAP32[$3 + 24 >> 2] | 0) == 1) {
     HEAP32[$2 >> 2] = HEAP32[$3 + 16 >> 2]; //@line 7285
     $$0 = 1; //@line 7286
    } else {
     $$0 = 0; //@line 7288
    }
    $$2 = $$0; //@line 7290
   }
  }
 }
 STACKTOP = sp; //@line 7294
 return $$2 | 0; //@line 7294
}
function ___mo_lookup($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$090 = 0, $$094 = 0, $$4 = 0, $10 = 0, $13 = 0, $17 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $31 = 0, $35 = 0, $4 = 0, $44 = 0, $46 = 0, $49 = 0, $53 = 0, $63 = 0, $7 = 0;
 $4 = (HEAP32[$0 >> 2] | 0) + 1794895138 | 0; //@line 4166
 $7 = _swapc(HEAP32[$0 + 8 >> 2] | 0, $4) | 0; //@line 4169
 $10 = _swapc(HEAP32[$0 + 12 >> 2] | 0, $4) | 0; //@line 4172
 $13 = _swapc(HEAP32[$0 + 16 >> 2] | 0, $4) | 0; //@line 4175
 L1 : do {
  if ($7 >>> 0 < $1 >>> 2 >>> 0) {
   $17 = $1 - ($7 << 2) | 0; //@line 4181
   if ($10 >>> 0 < $17 >>> 0 & $13 >>> 0 < $17 >>> 0) {
    if (!(($13 | $10) & 3)) {
     $23 = $10 >>> 2; //@line 4190
     $24 = $13 >>> 2; //@line 4191
     $$090 = 0; //@line 4192
     $$094 = $7; //@line 4192
     while (1) {
      $25 = $$094 >>> 1; //@line 4194
      $26 = $$090 + $25 | 0; //@line 4195
      $27 = $26 << 1; //@line 4196
      $28 = $27 + $23 | 0; //@line 4197
      $31 = _swapc(HEAP32[$0 + ($28 << 2) >> 2] | 0, $4) | 0; //@line 4200
      $35 = _swapc(HEAP32[$0 + ($28 + 1 << 2) >> 2] | 0, $4) | 0; //@line 4204
      if (!($35 >>> 0 < $1 >>> 0 & $31 >>> 0 < ($1 - $35 | 0) >>> 0)) {
       $$4 = 0; //@line 4210
       break L1;
      }
      if (HEAP8[$0 + ($35 + $31) >> 0] | 0) {
       $$4 = 0; //@line 4218
       break L1;
      }
      $44 = _strcmp($2, $0 + $35 | 0) | 0; //@line 4222
      if (!$44) {
       break;
      }
      $63 = ($44 | 0) < 0; //@line 4228
      if (($$094 | 0) == 1) {
       $$4 = 0; //@line 4233
       break L1;
      } else {
       $$090 = $63 ? $$090 : $26; //@line 4236
       $$094 = $63 ? $25 : $$094 - $25 | 0; //@line 4236
      }
     }
     $46 = $27 + $24 | 0; //@line 4239
     $49 = _swapc(HEAP32[$0 + ($46 << 2) >> 2] | 0, $4) | 0; //@line 4242
     $53 = _swapc(HEAP32[$0 + ($46 + 1 << 2) >> 2] | 0, $4) | 0; //@line 4246
     if ($53 >>> 0 < $1 >>> 0 & $49 >>> 0 < ($1 - $53 | 0) >>> 0) {
      $$4 = (HEAP8[$0 + ($53 + $49) >> 0] | 0) == 0 ? $0 + $53 | 0 : 0; //@line 4258
     } else {
      $$4 = 0; //@line 4260
     }
    } else {
     $$4 = 0; //@line 4263
    }
   } else {
    $$4 = 0; //@line 4266
   }
  } else {
   $$4 = 0; //@line 4269
  }
 } while (0);
 return $$4 | 0; //@line 4272
}
function ___fwritex($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$038 = 0, $$1 = 0, $$139 = 0, $$141 = 0, $$143 = 0, $10 = 0, $12 = 0, $14 = 0, $22 = 0, $28 = 0, $3 = 0, $31 = 0, $4 = 0, $9 = 0, label = 0;
 $3 = $2 + 16 | 0; //@line 4057
 $4 = HEAP32[$3 >> 2] | 0; //@line 4058
 if (!$4) {
  if (!(___towrite($2) | 0)) {
   $12 = HEAP32[$3 >> 2] | 0; //@line 4065
   label = 5; //@line 4066
  } else {
   $$1 = 0; //@line 4068
  }
 } else {
  $12 = $4; //@line 4072
  label = 5; //@line 4073
 }
 L5 : do {
  if ((label | 0) == 5) {
   $9 = $2 + 20 | 0; //@line 4077
   $10 = HEAP32[$9 >> 2] | 0; //@line 4078
   $14 = $10; //@line 4081
   if (($12 - $10 | 0) >>> 0 < $1 >>> 0) {
    $$1 = FUNCTION_TABLE_iiii[HEAP32[$2 + 36 >> 2] & 7]($2, $0, $1) | 0; //@line 4086
    break;
   }
   L10 : do {
    if ((HEAP8[$2 + 75 >> 0] | 0) > -1) {
     $$038 = $1; //@line 4094
     while (1) {
      if (!$$038) {
       $$139 = 0; //@line 4098
       $$141 = $0; //@line 4098
       $$143 = $1; //@line 4098
       $31 = $14; //@line 4098
       break L10;
      }
      $22 = $$038 + -1 | 0; //@line 4101
      if ((HEAP8[$0 + $22 >> 0] | 0) == 10) {
       break;
      } else {
       $$038 = $22; //@line 4108
      }
     }
     $28 = FUNCTION_TABLE_iiii[HEAP32[$2 + 36 >> 2] & 7]($2, $0, $$038) | 0; //@line 4113
     if ($28 >>> 0 < $$038 >>> 0) {
      $$1 = $28; //@line 4116
      break L5;
     }
     $$139 = $$038; //@line 4122
     $$141 = $0 + $$038 | 0; //@line 4122
     $$143 = $1 - $$038 | 0; //@line 4122
     $31 = HEAP32[$9 >> 2] | 0; //@line 4122
    } else {
     $$139 = 0; //@line 4124
     $$141 = $0; //@line 4124
     $$143 = $1; //@line 4124
     $31 = $14; //@line 4124
    }
   } while (0);
   _memcpy($31 | 0, $$141 | 0, $$143 | 0) | 0; //@line 4127
   HEAP32[$9 >> 2] = (HEAP32[$9 >> 2] | 0) + $$143; //@line 4130
   $$1 = $$139 + $$143 | 0; //@line 4132
  }
 } while (0);
 return $$1 | 0; //@line 4135
}
function _memset(ptr, value, num) {
 ptr = ptr | 0;
 value = value | 0;
 num = num | 0;
 var end = 0, aligned_end = 0, block_aligned_end = 0, value4 = 0;
 end = ptr + num | 0; //@line 9202
 value = value & 255; //@line 9204
 if ((num | 0) >= 67) {
  while (ptr & 3) {
   HEAP8[ptr >> 0] = value; //@line 9207
   ptr = ptr + 1 | 0; //@line 9208
  }
  aligned_end = end & -4 | 0; //@line 9211
  block_aligned_end = aligned_end - 64 | 0; //@line 9212
  value4 = value | value << 8 | value << 16 | value << 24; //@line 9213
  while ((ptr | 0) <= (block_aligned_end | 0)) {
   HEAP32[ptr >> 2] = value4; //@line 9216
   HEAP32[ptr + 4 >> 2] = value4; //@line 9217
   HEAP32[ptr + 8 >> 2] = value4; //@line 9218
   HEAP32[ptr + 12 >> 2] = value4; //@line 9219
   HEAP32[ptr + 16 >> 2] = value4; //@line 9220
   HEAP32[ptr + 20 >> 2] = value4; //@line 9221
   HEAP32[ptr + 24 >> 2] = value4; //@line 9222
   HEAP32[ptr + 28 >> 2] = value4; //@line 9223
   HEAP32[ptr + 32 >> 2] = value4; //@line 9224
   HEAP32[ptr + 36 >> 2] = value4; //@line 9225
   HEAP32[ptr + 40 >> 2] = value4; //@line 9226
   HEAP32[ptr + 44 >> 2] = value4; //@line 9227
   HEAP32[ptr + 48 >> 2] = value4; //@line 9228
   HEAP32[ptr + 52 >> 2] = value4; //@line 9229
   HEAP32[ptr + 56 >> 2] = value4; //@line 9230
   HEAP32[ptr + 60 >> 2] = value4; //@line 9231
   ptr = ptr + 64 | 0; //@line 9232
  }
  while ((ptr | 0) < (aligned_end | 0)) {
   HEAP32[ptr >> 2] = value4; //@line 9236
   ptr = ptr + 4 | 0; //@line 9237
  }
 }
 while ((ptr | 0) < (end | 0)) {
  HEAP8[ptr >> 0] = value; //@line 9242
  ptr = ptr + 1 | 0; //@line 9243
 }
 return end - num | 0; //@line 9245
}
function _wcrtomb($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$0 = 0;
 do {
  if (!$0) {
   $$0 = 1; //@line 6971
  } else {
   if ($1 >>> 0 < 128) {
    HEAP8[$0 >> 0] = $1; //@line 6976
    $$0 = 1; //@line 6977
    break;
   }
   if (!(HEAP32[HEAP32[(___pthread_self_910() | 0) + 188 >> 2] >> 2] | 0)) {
    if (($1 & -128 | 0) == 57216) {
     HEAP8[$0 >> 0] = $1; //@line 6990
     $$0 = 1; //@line 6991
     break;
    } else {
     HEAP32[(___errno_location() | 0) >> 2] = 84; //@line 6995
     $$0 = -1; //@line 6996
     break;
    }
   }
   if ($1 >>> 0 < 2048) {
    HEAP8[$0 >> 0] = $1 >>> 6 | 192; //@line 7006
    HEAP8[$0 + 1 >> 0] = $1 & 63 | 128; //@line 7010
    $$0 = 2; //@line 7011
    break;
   }
   if ($1 >>> 0 < 55296 | ($1 & -8192 | 0) == 57344) {
    HEAP8[$0 >> 0] = $1 >>> 12 | 224; //@line 7023
    HEAP8[$0 + 1 >> 0] = $1 >>> 6 & 63 | 128; //@line 7029
    HEAP8[$0 + 2 >> 0] = $1 & 63 | 128; //@line 7033
    $$0 = 3; //@line 7034
    break;
   }
   if (($1 + -65536 | 0) >>> 0 < 1048576) {
    HEAP8[$0 >> 0] = $1 >>> 18 | 240; //@line 7044
    HEAP8[$0 + 1 >> 0] = $1 >>> 12 & 63 | 128; //@line 7050
    HEAP8[$0 + 2 >> 0] = $1 >>> 6 & 63 | 128; //@line 7056
    HEAP8[$0 + 3 >> 0] = $1 & 63 | 128; //@line 7060
    $$0 = 4; //@line 7061
    break;
   } else {
    HEAP32[(___errno_location() | 0) >> 2] = 84; //@line 7065
    $$0 = -1; //@line 7066
    break;
   }
  }
 } while (0);
 return $$0 | 0; //@line 7071
}
function __ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv__async_cb_1($0) {
 $0 = $0 | 0;
 var $15 = 0, $16 = 0, $2 = 0, $4 = 0, $6 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx = 0, dest = 0, sp = 0, stop = 0;
 sp = STACKTOP; //@line 8036
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 8038
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 8040
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 8042
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 8044
 if (!$AsyncRetVal) {
  HEAP8[___async_retval >> 0] = 0; //@line 8049
  return;
 }
 dest = $2 + 4 | 0; //@line 8053
 stop = dest + 52 | 0; //@line 8053
 do {
  HEAP32[dest >> 2] = 0; //@line 8053
  dest = dest + 4 | 0; //@line 8053
 } while ((dest | 0) < (stop | 0));
 HEAP32[$2 >> 2] = $AsyncRetVal; //@line 8054
 HEAP32[$2 + 8 >> 2] = $4; //@line 8056
 HEAP32[$2 + 12 >> 2] = -1; //@line 8058
 HEAP32[$2 + 48 >> 2] = 1; //@line 8060
 $15 = HEAP32[(HEAP32[$AsyncRetVal >> 2] | 0) + 28 >> 2] | 0; //@line 8063
 $16 = HEAP32[$6 >> 2] | 0; //@line 8064
 $ReallocAsyncCtx = _emscripten_realloc_async_context(16) | 0; //@line 8065
 FUNCTION_TABLE_viiii[$15 & 3]($AsyncRetVal, $2, $16, 1); //@line 8066
 if (!___async) {
  ___async_unwind = 0; //@line 8069
 }
 HEAP32[$ReallocAsyncCtx >> 2] = 31; //@line 8071
 HEAP32[$ReallocAsyncCtx + 4 >> 2] = $2; //@line 8073
 HEAP32[$ReallocAsyncCtx + 8 >> 2] = $6; //@line 8075
 HEAP32[$ReallocAsyncCtx + 12 >> 2] = $2; //@line 8077
 sp = STACKTOP; //@line 8078
 return;
}
function _fmt_u($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$010$lcssa$off0 = 0, $$012 = 0, $$09$lcssa = 0, $$0914 = 0, $$1$lcssa = 0, $$111 = 0, $10 = 0, $26 = 0, $8 = 0, $9 = 0, $8$looptemp = 0;
 if ($1 >>> 0 > 0 | ($1 | 0) == 0 & $0 >>> 0 > 4294967295) {
  $$0914 = $2; //@line 5855
  $8 = $0; //@line 5855
  $9 = $1; //@line 5855
  while (1) {
   $10 = ___uremdi3($8 | 0, $9 | 0, 10, 0) | 0; //@line 5857
   $$0914 = $$0914 + -1 | 0; //@line 5861
   HEAP8[$$0914 >> 0] = $10 & 255 | 48; //@line 5862
   $8$looptemp = $8;
   $8 = ___udivdi3($8 | 0, $9 | 0, 10, 0) | 0; //@line 5863
   if (!($9 >>> 0 > 9 | ($9 | 0) == 9 & $8$looptemp >>> 0 > 4294967295)) {
    break;
   } else {
    $9 = tempRet0; //@line 5871
   }
  }
  $$010$lcssa$off0 = $8; //@line 5876
  $$09$lcssa = $$0914; //@line 5876
 } else {
  $$010$lcssa$off0 = $0; //@line 5878
  $$09$lcssa = $2; //@line 5878
 }
 if (!$$010$lcssa$off0) {
  $$1$lcssa = $$09$lcssa; //@line 5882
 } else {
  $$012 = $$010$lcssa$off0; //@line 5884
  $$111 = $$09$lcssa; //@line 5884
  while (1) {
   $26 = $$111 + -1 | 0; //@line 5889
   HEAP8[$26 >> 0] = ($$012 >>> 0) % 10 | 0 | 48; //@line 5890
   if ($$012 >>> 0 < 10) {
    $$1$lcssa = $26; //@line 5894
    break;
   } else {
    $$012 = ($$012 >>> 0) / 10 | 0; //@line 5897
    $$111 = $26; //@line 5897
   }
  }
 }
 return $$1$lcssa | 0; //@line 5901
}
function _main__async_cb($0) {
 $0 = $0 | 0;
 var $13 = 0, $14 = 0, $2 = 0, $4 = 0, $8 = 0.0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 8266
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 8268
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 8270
 if (+_pwmout_read(3480) == 1.0) {
  if (!(HEAP8[3484] | 0)) {
   HEAP8[3484] = 1; //@line 8277
  }
  _pwmout_write(3480, 0.0); //@line 8279
 }
 $8 = +_pwmout_read(3480) + .1; //@line 8284
 if (!(HEAP8[3484] | 0)) {
  HEAP8[3484] = 1; //@line 8288
 }
 _pwmout_write(3480, $8); //@line 8290
 HEAPF64[$2 >> 3] = +_pwmout_read(3480); //@line 8293
 _printf(844, $2) | 0; //@line 8294
 $ReallocAsyncCtx = _emscripten_realloc_async_context(12) | 0; //@line 8295
 _wait(.20000000298023224); //@line 8296
 if (___async) {
  HEAP32[$ReallocAsyncCtx >> 2] = 27; //@line 8299
  $13 = $ReallocAsyncCtx + 4 | 0; //@line 8300
  HEAP32[$13 >> 2] = $2; //@line 8301
  $14 = $ReallocAsyncCtx + 8 | 0; //@line 8302
  HEAP32[$14 >> 2] = $4; //@line 8303
  sp = STACKTOP; //@line 8304
  return;
 }
 ___async_unwind = 0; //@line 8307
 HEAP32[$ReallocAsyncCtx >> 2] = 27; //@line 8308
 $13 = $ReallocAsyncCtx + 4 | 0; //@line 8309
 HEAP32[$13 >> 2] = $2; //@line 8310
 $14 = $ReallocAsyncCtx + 8 | 0; //@line 8311
 HEAP32[$14 >> 2] = $4; //@line 8312
 sp = STACKTOP; //@line 8313
 return;
}
function __ZNK10__cxxabiv117__class_type_info29process_static_type_above_dstEPNS_19__dynamic_cast_infoEPKvS4_i($0, $1, $2, $3, $4) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 var $10 = 0, $11 = 0, $21 = 0, $22 = 0, $28 = 0, $30 = 0;
 HEAP8[$1 + 53 >> 0] = 1; //@line 7468
 do {
  if ((HEAP32[$1 + 4 >> 2] | 0) == ($3 | 0)) {
   HEAP8[$1 + 52 >> 0] = 1; //@line 7475
   $10 = $1 + 16 | 0; //@line 7476
   $11 = HEAP32[$10 >> 2] | 0; //@line 7477
   if (!$11) {
    HEAP32[$10 >> 2] = $2; //@line 7480
    HEAP32[$1 + 24 >> 2] = $4; //@line 7482
    HEAP32[$1 + 36 >> 2] = 1; //@line 7484
    if (!(($4 | 0) == 1 ? (HEAP32[$1 + 48 >> 2] | 0) == 1 : 0)) {
     break;
    }
    HEAP8[$1 + 54 >> 0] = 1; //@line 7494
    break;
   }
   if (($11 | 0) != ($2 | 0)) {
    $30 = $1 + 36 | 0; //@line 7499
    HEAP32[$30 >> 2] = (HEAP32[$30 >> 2] | 0) + 1; //@line 7502
    HEAP8[$1 + 54 >> 0] = 1; //@line 7504
    break;
   }
   $21 = $1 + 24 | 0; //@line 7507
   $22 = HEAP32[$21 >> 2] | 0; //@line 7508
   if (($22 | 0) == 2) {
    HEAP32[$21 >> 2] = $4; //@line 7511
    $28 = $4; //@line 7512
   } else {
    $28 = $22; //@line 7514
   }
   if (($28 | 0) == 1 ? (HEAP32[$1 + 48 >> 2] | 0) == 1 : 0) {
    HEAP8[$1 + 54 >> 0] = 1; //@line 7523
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
   __ZNK10__cxxabiv117__class_type_info29process_static_type_below_dstEPNS_19__dynamic_cast_infoEPKvi(0, $1, $2, $3); //@line 7327
  } else {
   if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 >> 2] | 0, $4) | 0) {
    if ((HEAP32[$1 + 16 >> 2] | 0) != ($2 | 0)) {
     $13 = $1 + 20 | 0; //@line 7336
     if ((HEAP32[$13 >> 2] | 0) != ($2 | 0)) {
      HEAP32[$1 + 32 >> 2] = $3; //@line 7341
      HEAP32[$13 >> 2] = $2; //@line 7342
      $19 = $1 + 40 | 0; //@line 7343
      HEAP32[$19 >> 2] = (HEAP32[$19 >> 2] | 0) + 1; //@line 7346
      if ((HEAP32[$1 + 36 >> 2] | 0) == 1) {
       if ((HEAP32[$1 + 24 >> 2] | 0) == 2) {
        HEAP8[$1 + 54 >> 0] = 1; //@line 7356
       }
      }
      HEAP32[$1 + 44 >> 2] = 4; //@line 7360
      break;
     }
    }
    if (($3 | 0) == 1) {
     HEAP32[$1 + 32 >> 2] = 1; //@line 7367
    }
   }
  }
 } while (0);
 return;
}
function __ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb($0) {
 $0 = $0 | 0;
 var $$037$off038 = 0, $$037$off039 = 0, $12 = 0, $17 = 0, $4 = 0, $6 = 0, $8 = 0, label = 0;
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 8089
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 8091
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 8093
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 8097
 if (!(HEAP8[HEAP32[$0 + 4 >> 2] >> 0] | 0)) {
  $$037$off038 = 4; //@line 8101
  label = 4; //@line 8102
 } else {
  if (!(HEAP8[HEAP32[$0 + 20 >> 2] >> 0] | 0)) {
   $$037$off038 = 3; //@line 8107
   label = 4; //@line 8108
  } else {
   $$037$off039 = 3; //@line 8110
  }
 }
 if ((label | 0) == 4) {
  HEAP32[$6 >> 2] = $4; //@line 8114
  $17 = $8 + 40 | 0; //@line 8115
  HEAP32[$17 >> 2] = (HEAP32[$17 >> 2] | 0) + 1; //@line 8118
  if ((HEAP32[$8 + 36 >> 2] | 0) == 1) {
   if ((HEAP32[$8 + 24 >> 2] | 0) == 2) {
    HEAP8[$8 + 54 >> 0] = 1; //@line 8128
    $$037$off039 = $$037$off038; //@line 8129
   } else {
    $$037$off039 = $$037$off038; //@line 8131
   }
  } else {
   $$037$off039 = $$037$off038; //@line 8134
  }
 }
 HEAP32[$12 >> 2] = $$037$off039; //@line 8137
 return;
}
function ___strerror_l($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$012$lcssa = 0, $$01214 = 0, $$016 = 0, $$113 = 0, $$115 = 0, $7 = 0, label = 0, $$113$looptemp = 0;
 $$016 = 0; //@line 7091
 while (1) {
  if ((HEAPU8[1395 + $$016 >> 0] | 0) == ($0 | 0)) {
   label = 2; //@line 7098
   break;
  }
  $7 = $$016 + 1 | 0; //@line 7101
  if (($7 | 0) == 87) {
   $$01214 = 1483; //@line 7104
   $$115 = 87; //@line 7104
   label = 5; //@line 7105
   break;
  } else {
   $$016 = $7; //@line 7108
  }
 }
 if ((label | 0) == 2) {
  if (!$$016) {
   $$012$lcssa = 1483; //@line 7114
  } else {
   $$01214 = 1483; //@line 7116
   $$115 = $$016; //@line 7116
   label = 5; //@line 7117
  }
 }
 if ((label | 0) == 5) {
  while (1) {
   label = 0; //@line 7122
   $$113 = $$01214; //@line 7123
   do {
    $$113$looptemp = $$113;
    $$113 = $$113 + 1 | 0; //@line 7127
   } while ((HEAP8[$$113$looptemp >> 0] | 0) != 0);
   $$115 = $$115 + -1 | 0; //@line 7134
   if (!$$115) {
    $$012$lcssa = $$113; //@line 7137
    break;
   } else {
    $$01214 = $$113; //@line 7140
    label = 5; //@line 7141
   }
  }
 }
 return ___lctrans($$012$lcssa, HEAP32[$1 + 20 >> 2] | 0) | 0; //@line 7148
}
function _invoke_ticker($0) {
 $0 = $0 | 0;
 var $2 = 0, $3 = 0, $7 = 0, $8 = 0, $AsyncCtx = 0, $AsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 440
 $2 = $0 + 12 | 0; //@line 442
 $3 = HEAP32[$2 >> 2] | 0; //@line 443
 do {
  if (!$3) {
   $AsyncCtx2 = _emscripten_alloc_async_context(12, sp) | 0; //@line 447
   _mbed_assert_internal(755, 760, 528); //@line 448
   if (___async) {
    HEAP32[$AsyncCtx2 >> 2] = 23; //@line 451
    HEAP32[$AsyncCtx2 + 4 >> 2] = $2; //@line 453
    HEAP32[$AsyncCtx2 + 8 >> 2] = $0; //@line 455
    sp = STACKTOP; //@line 456
    return;
   } else {
    _emscripten_free_async_context($AsyncCtx2 | 0); //@line 459
    $8 = HEAP32[$2 >> 2] | 0; //@line 461
    break;
   }
  } else {
   $8 = $3; //@line 465
  }
 } while (0);
 $7 = HEAP32[$8 >> 2] | 0; //@line 468
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 470
 FUNCTION_TABLE_vi[$7 & 63]($0); //@line 471
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 24; //@line 474
  sp = STACKTOP; //@line 475
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 478
  return;
 }
}
function _main() {
 var $3 = 0.0, $AsyncCtx = 0, $vararg_buffer = 0, sp = 0;
 sp = STACKTOP; //@line 536
 STACKTOP = STACKTOP + 16 | 0; //@line 537
 $vararg_buffer = sp; //@line 538
 while (1) {
  $3 = +_pwmout_read(3480) + .1; //@line 543
  if (!(HEAP8[3484] | 0)) {
   HEAP8[3484] = 1; //@line 547
  }
  _pwmout_write(3480, $3); //@line 549
  HEAPF64[$vararg_buffer >> 3] = +_pwmout_read(3480); //@line 552
  _printf(844, $vararg_buffer) | 0; //@line 553
  $AsyncCtx = _emscripten_alloc_async_context(12, sp) | 0; //@line 554
  _wait(.20000000298023224); //@line 555
  if (___async) {
   break;
  }
  _emscripten_free_async_context($AsyncCtx | 0); //@line 560
  if (!(+_pwmout_read(3480) == 1.0)) {
   continue;
  }
  if (!(HEAP8[3484] | 0)) {
   HEAP8[3484] = 1; //@line 569
  }
  _pwmout_write(3480, 0.0); //@line 571
 }
 HEAP32[$AsyncCtx >> 2] = 27; //@line 573
 HEAP32[$AsyncCtx + 4 >> 2] = $vararg_buffer; //@line 575
 HEAP32[$AsyncCtx + 8 >> 2] = $vararg_buffer; //@line 577
 sp = STACKTOP; //@line 578
 STACKTOP = sp; //@line 579
 return 0; //@line 579
}
function _frexp($0, $1) {
 $0 = +$0;
 $1 = $1 | 0;
 var $$0 = 0.0, $$016 = 0.0, $2 = 0, $3 = 0, $4 = 0, $9 = 0.0, $storemerge = 0;
 HEAPF64[tempDoublePtr >> 3] = $0; //@line 6922
 $2 = HEAP32[tempDoublePtr >> 2] | 0; //@line 6922
 $3 = HEAP32[tempDoublePtr + 4 >> 2] | 0; //@line 6923
 $4 = _bitshift64Lshr($2 | 0, $3 | 0, 52) | 0; //@line 6924
 switch ($4 & 2047) {
 case 0:
  {
   if ($0 != 0.0) {
    $9 = +_frexp($0 * 18446744073709552000.0, $1); //@line 6933
    $$016 = $9; //@line 6936
    $storemerge = (HEAP32[$1 >> 2] | 0) + -64 | 0; //@line 6936
   } else {
    $$016 = $0; //@line 6938
    $storemerge = 0; //@line 6938
   }
   HEAP32[$1 >> 2] = $storemerge; //@line 6940
   $$0 = $$016; //@line 6941
   break;
  }
 case 2047:
  {
   $$0 = $0; //@line 6945
   break;
  }
 default:
  {
   HEAP32[$1 >> 2] = ($4 & 2047) + -1022; //@line 6951
   HEAP32[tempDoublePtr >> 2] = $2; //@line 6954
   HEAP32[tempDoublePtr + 4 >> 2] = $3 & -2146435073 | 1071644672; //@line 6954
   $$0 = +HEAPF64[tempDoublePtr >> 3]; //@line 6955
  }
 }
 return +$$0;
}
function _vfprintf__async_cb($0) {
 $0 = $0 | 0;
 var $$ = 0, $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $2 = 0, $20 = 0, $22 = 0, $33 = 0;
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 7955
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 7963
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 7965
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 7967
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 7969
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 7971
 $20 = HEAP32[$0 + 40 >> 2] | 0; //@line 7973
 $22 = HEAP32[$0 + 44 >> 2] | 0; //@line 7975
 $$ = (HEAP32[$2 >> 2] | 0) == 0 ? -1 : HEAP32[$0 + 8 >> 2] | 0; //@line 7986
 HEAP32[HEAP32[$0 + 16 >> 2] >> 2] = HEAP32[$0 + 12 >> 2]; //@line 7987
 HEAP32[$10 >> 2] = 0; //@line 7988
 HEAP32[$12 >> 2] = 0; //@line 7989
 HEAP32[$14 >> 2] = 0; //@line 7990
 HEAP32[$2 >> 2] = 0; //@line 7991
 $33 = HEAP32[$16 >> 2] | 0; //@line 7992
 HEAP32[$16 >> 2] = $33 | $18; //@line 7997
 if ($20 | 0) {
  ___unlockfile($22); //@line 8000
 }
 HEAP32[___async_retval >> 2] = ($33 & 32 | 0) == 0 ? $$ : -1; //@line 8003
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
 sp = STACKTOP; //@line 7683
 do {
  if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, $5) | 0) {
   __ZNK10__cxxabiv117__class_type_info29process_static_type_above_dstEPNS_19__dynamic_cast_infoEPKvS4_i(0, $1, $2, $3, $4); //@line 7689
  } else {
   $10 = HEAP32[$0 + 8 >> 2] | 0; //@line 7692
   $13 = HEAP32[(HEAP32[$10 >> 2] | 0) + 20 >> 2] | 0; //@line 7695
   $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 7696
   FUNCTION_TABLE_viiiiii[$13 & 3]($10, $1, $2, $3, $4, $5); //@line 7697
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 34; //@line 7700
    sp = STACKTOP; //@line 7701
    return;
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 7704
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
 sp = STACKTOP; //@line 7852
 do {
  if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, 0) | 0) {
   __ZNK10__cxxabiv117__class_type_info24process_found_base_classEPNS_19__dynamic_cast_infoEPvi(0, $1, $2, $3); //@line 7858
  } else {
   $8 = HEAP32[$0 + 8 >> 2] | 0; //@line 7861
   $11 = HEAP32[(HEAP32[$8 >> 2] | 0) + 28 >> 2] | 0; //@line 7864
   $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 7865
   FUNCTION_TABLE_viiii[$11 & 3]($8, $1, $2, $3); //@line 7866
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 37; //@line 7869
    sp = STACKTOP; //@line 7870
    return;
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 7873
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
 sp = STACKTOP; //@line 7891
 STACKTOP = STACKTOP + 16 | 0; //@line 7892
 $3 = sp; //@line 7893
 HEAP32[$3 >> 2] = HEAP32[$2 >> 2]; //@line 7895
 $7 = HEAP32[(HEAP32[$0 >> 2] | 0) + 16 >> 2] | 0; //@line 7898
 $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 7899
 $8 = FUNCTION_TABLE_iiii[$7 & 7]($0, $1, $3) | 0; //@line 7900
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 38; //@line 7903
  HEAP32[$AsyncCtx + 4 >> 2] = $3; //@line 7905
  HEAP32[$AsyncCtx + 8 >> 2] = $2; //@line 7907
  HEAP32[$AsyncCtx + 12 >> 2] = $3; //@line 7909
  sp = STACKTOP; //@line 7910
  STACKTOP = sp; //@line 7911
  return 0; //@line 7911
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 7913
 if ($8) {
  HEAP32[$2 >> 2] = HEAP32[$3 >> 2]; //@line 7917
 }
 STACKTOP = sp; //@line 7919
 return $8 & 1 | 0; //@line 7919
}
function ___dynamic_cast__async_cb_3($0) {
 $0 = $0 | 0;
 var $$0 = 0, $10 = 0, $16 = 0, $6 = 0, $8 = 0;
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 8192
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 8194
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 8196
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 8202
 L2 : do {
  switch (HEAP32[HEAP32[$0 + 4 >> 2] >> 2] | 0) {
  case 0:
   {
    $$0 = (HEAP32[$6 >> 2] | 0) == 1 & (HEAP32[$8 >> 2] | 0) == 1 & (HEAP32[$10 >> 2] | 0) == 1 ? HEAP32[HEAP32[$0 + 24 >> 2] >> 2] | 0 : 0; //@line 8217
    break;
   }
  case 1:
   {
    if ((HEAP32[HEAP32[$0 + 28 >> 2] >> 2] | 0) != 1) {
     if (!((HEAP32[$6 >> 2] | 0) == 0 & (HEAP32[$8 >> 2] | 0) == 1 & (HEAP32[$10 >> 2] | 0) == 1)) {
      $$0 = 0; //@line 8233
      break L2;
     }
    }
    $$0 = HEAP32[$16 >> 2] | 0; //@line 8238
    break;
   }
  default:
   {
    $$0 = 0; //@line 8242
   }
  }
 } while (0);
 HEAP32[___async_retval >> 2] = $$0; //@line 8247
 return;
}
function _pad_676($0, $1, $2, $3, $4) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 var $$0$lcssa = 0, $$011 = 0, $14 = 0, $5 = 0, $9 = 0, sp = 0;
 sp = STACKTOP; //@line 5920
 STACKTOP = STACKTOP + 256 | 0; //@line 5921
 $5 = sp; //@line 5922
 if (($2 | 0) > ($3 | 0) & ($4 & 73728 | 0) == 0) {
  $9 = $2 - $3 | 0; //@line 5928
  _memset($5 | 0, $1 << 24 >> 24 | 0, ($9 >>> 0 < 256 ? $9 : 256) | 0) | 0; //@line 5932
  if ($9 >>> 0 > 255) {
   $14 = $2 - $3 | 0; //@line 5935
   $$011 = $9; //@line 5936
   do {
    _out_670($0, $5, 256); //@line 5938
    $$011 = $$011 + -256 | 0; //@line 5939
   } while ($$011 >>> 0 > 255);
   $$0$lcssa = $14 & 255; //@line 5948
  } else {
   $$0$lcssa = $9; //@line 5950
  }
  _out_670($0, $5, $$0$lcssa); //@line 5952
 }
 STACKTOP = sp; //@line 5954
 return;
}
function __ZNK10__cxxabiv117__class_type_info24process_found_base_classEPNS_19__dynamic_cast_infoEPvi($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $10 = 0, $13 = 0, $4 = 0, $5 = 0;
 $4 = $1 + 16 | 0; //@line 7405
 $5 = HEAP32[$4 >> 2] | 0; //@line 7406
 do {
  if (!$5) {
   HEAP32[$4 >> 2] = $2; //@line 7410
   HEAP32[$1 + 24 >> 2] = $3; //@line 7412
   HEAP32[$1 + 36 >> 2] = 1; //@line 7414
  } else {
   if (($5 | 0) != ($2 | 0)) {
    $13 = $1 + 36 | 0; //@line 7418
    HEAP32[$13 >> 2] = (HEAP32[$13 >> 2] | 0) + 1; //@line 7421
    HEAP32[$1 + 24 >> 2] = 2; //@line 7423
    HEAP8[$1 + 54 >> 0] = 1; //@line 7425
    break;
   }
   $10 = $1 + 24 | 0; //@line 7428
   if ((HEAP32[$10 >> 2] | 0) == 2) {
    HEAP32[$10 >> 2] = $3; //@line 7432
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
 sp = STACKTOP; //@line 3860
 STACKTOP = STACKTOP + 32 | 0; //@line 3861
 $vararg_buffer = sp; //@line 3862
 $3 = sp + 20 | 0; //@line 3863
 HEAP32[$vararg_buffer >> 2] = HEAP32[$0 + 60 >> 2]; //@line 3867
 HEAP32[$vararg_buffer + 4 >> 2] = 0; //@line 3869
 HEAP32[$vararg_buffer + 8 >> 2] = $1; //@line 3871
 HEAP32[$vararg_buffer + 12 >> 2] = $3; //@line 3873
 HEAP32[$vararg_buffer + 16 >> 2] = $2; //@line 3875
 if ((___syscall_ret(___syscall140(140, $vararg_buffer | 0) | 0) | 0) < 0) {
  HEAP32[$3 >> 2] = -1; //@line 3880
  $10 = -1; //@line 3881
 } else {
  $10 = HEAP32[$3 >> 2] | 0; //@line 3884
 }
 STACKTOP = sp; //@line 3886
 return $10 | 0; //@line 3886
}
function _strcmp($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$011 = 0, $$0710 = 0, $$lcssa = 0, $$lcssa8 = 0, $2 = 0, $3 = 0, $8 = 0, $9 = 0;
 $2 = HEAP8[$0 >> 0] | 0; //@line 3967
 $3 = HEAP8[$1 >> 0] | 0; //@line 3968
 if ($2 << 24 >> 24 == 0 ? 1 : $2 << 24 >> 24 != $3 << 24 >> 24) {
  $$lcssa = $3; //@line 3973
  $$lcssa8 = $2; //@line 3973
 } else {
  $$011 = $1; //@line 3975
  $$0710 = $0; //@line 3975
  do {
   $$0710 = $$0710 + 1 | 0; //@line 3977
   $$011 = $$011 + 1 | 0; //@line 3978
   $8 = HEAP8[$$0710 >> 0] | 0; //@line 3979
   $9 = HEAP8[$$011 >> 0] | 0; //@line 3980
  } while (!($8 << 24 >> 24 == 0 ? 1 : $8 << 24 >> 24 != $9 << 24 >> 24));
  $$lcssa = $9; //@line 3985
  $$lcssa8 = $8; //@line 3985
 }
 return ($$lcssa8 & 255) - ($$lcssa & 255) | 0; //@line 3995
}
function _printf($0, $varargs) {
 $0 = $0 | 0;
 $varargs = $varargs | 0;
 var $1 = 0, $2 = 0, $3 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 7162
 STACKTOP = STACKTOP + 16 | 0; //@line 7163
 $1 = sp; //@line 7164
 HEAP32[$1 >> 2] = $varargs; //@line 7165
 $2 = HEAP32[24] | 0; //@line 7166
 $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 7167
 $3 = _vfprintf($2, $0, $1) | 0; //@line 7168
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 29; //@line 7171
  HEAP32[$AsyncCtx + 4 >> 2] = $1; //@line 7173
  sp = STACKTOP; //@line 7174
  STACKTOP = sp; //@line 7175
  return 0; //@line 7175
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 7177
  STACKTOP = sp; //@line 7178
  return $3 | 0; //@line 7178
 }
 return 0; //@line 7180
}
function _mbed_assert_internal($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $AsyncCtx = 0, $vararg_buffer = 0, sp = 0;
 sp = STACKTOP; //@line 54
 STACKTOP = STACKTOP + 16 | 0; //@line 55
 $vararg_buffer = sp; //@line 56
 HEAP32[$vararg_buffer >> 2] = $0; //@line 57
 HEAP32[$vararg_buffer + 4 >> 2] = $1; //@line 59
 HEAP32[$vararg_buffer + 8 >> 2] = $2; //@line 61
 _mbed_error_printf(548, $vararg_buffer); //@line 62
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 63
 _mbed_die(); //@line 64
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 6; //@line 67
  sp = STACKTOP; //@line 68
  STACKTOP = sp; //@line 69
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 71
  STACKTOP = sp; //@line 72
  return;
 }
}
function _mbed_die__async_cb_16($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx13 = 0, sp = 0;
 sp = STACKTOP; //@line 8650
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 8652
 _emscripten_asm_const_iii(0, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 8654
 $ReallocAsyncCtx13 = _emscripten_realloc_async_context(8) | 0; //@line 8655
 _wait_ms(150); //@line 8656
 if (___async) {
  HEAP32[$ReallocAsyncCtx13 >> 2] = 10; //@line 8659
  $4 = $ReallocAsyncCtx13 + 4 | 0; //@line 8660
  HEAP32[$4 >> 2] = $2; //@line 8661
  sp = STACKTOP; //@line 8662
  return;
 }
 ___async_unwind = 0; //@line 8665
 HEAP32[$ReallocAsyncCtx13 >> 2] = 10; //@line 8666
 $4 = $ReallocAsyncCtx13 + 4 | 0; //@line 8667
 HEAP32[$4 >> 2] = $2; //@line 8668
 sp = STACKTOP; //@line 8669
 return;
}
function _mbed_die__async_cb_15($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx12 = 0, sp = 0;
 sp = STACKTOP; //@line 8625
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 8627
 _emscripten_asm_const_iii(0, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 8629
 $ReallocAsyncCtx12 = _emscripten_realloc_async_context(8) | 0; //@line 8630
 _wait_ms(150); //@line 8631
 if (___async) {
  HEAP32[$ReallocAsyncCtx12 >> 2] = 11; //@line 8634
  $4 = $ReallocAsyncCtx12 + 4 | 0; //@line 8635
  HEAP32[$4 >> 2] = $2; //@line 8636
  sp = STACKTOP; //@line 8637
  return;
 }
 ___async_unwind = 0; //@line 8640
 HEAP32[$ReallocAsyncCtx12 >> 2] = 11; //@line 8641
 $4 = $ReallocAsyncCtx12 + 4 | 0; //@line 8642
 HEAP32[$4 >> 2] = $2; //@line 8643
 sp = STACKTOP; //@line 8644
 return;
}
function _mbed_die__async_cb_14($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx11 = 0, sp = 0;
 sp = STACKTOP; //@line 8600
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 8602
 _emscripten_asm_const_iii(0, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 8604
 $ReallocAsyncCtx11 = _emscripten_realloc_async_context(8) | 0; //@line 8605
 _wait_ms(150); //@line 8606
 if (___async) {
  HEAP32[$ReallocAsyncCtx11 >> 2] = 12; //@line 8609
  $4 = $ReallocAsyncCtx11 + 4 | 0; //@line 8610
  HEAP32[$4 >> 2] = $2; //@line 8611
  sp = STACKTOP; //@line 8612
  return;
 }
 ___async_unwind = 0; //@line 8615
 HEAP32[$ReallocAsyncCtx11 >> 2] = 12; //@line 8616
 $4 = $ReallocAsyncCtx11 + 4 | 0; //@line 8617
 HEAP32[$4 >> 2] = $2; //@line 8618
 sp = STACKTOP; //@line 8619
 return;
}
function _mbed_die__async_cb_13($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx10 = 0, sp = 0;
 sp = STACKTOP; //@line 8575
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 8577
 _emscripten_asm_const_iii(0, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 8579
 $ReallocAsyncCtx10 = _emscripten_realloc_async_context(8) | 0; //@line 8580
 _wait_ms(150); //@line 8581
 if (___async) {
  HEAP32[$ReallocAsyncCtx10 >> 2] = 13; //@line 8584
  $4 = $ReallocAsyncCtx10 + 4 | 0; //@line 8585
  HEAP32[$4 >> 2] = $2; //@line 8586
  sp = STACKTOP; //@line 8587
  return;
 }
 ___async_unwind = 0; //@line 8590
 HEAP32[$ReallocAsyncCtx10 >> 2] = 13; //@line 8591
 $4 = $ReallocAsyncCtx10 + 4 | 0; //@line 8592
 HEAP32[$4 >> 2] = $2; //@line 8593
 sp = STACKTOP; //@line 8594
 return;
}
function _mbed_die__async_cb_18($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx15 = 0, sp = 0;
 sp = STACKTOP; //@line 8700
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 8702
 _emscripten_asm_const_iii(0, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 8704
 $ReallocAsyncCtx15 = _emscripten_realloc_async_context(8) | 0; //@line 8705
 _wait_ms(150); //@line 8706
 if (___async) {
  HEAP32[$ReallocAsyncCtx15 >> 2] = 8; //@line 8709
  $4 = $ReallocAsyncCtx15 + 4 | 0; //@line 8710
  HEAP32[$4 >> 2] = $2; //@line 8711
  sp = STACKTOP; //@line 8712
  return;
 }
 ___async_unwind = 0; //@line 8715
 HEAP32[$ReallocAsyncCtx15 >> 2] = 8; //@line 8716
 $4 = $ReallocAsyncCtx15 + 4 | 0; //@line 8717
 HEAP32[$4 >> 2] = $2; //@line 8718
 sp = STACKTOP; //@line 8719
 return;
}
function _mbed_die__async_cb_17($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx14 = 0, sp = 0;
 sp = STACKTOP; //@line 8675
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 8677
 _emscripten_asm_const_iii(0, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 8679
 $ReallocAsyncCtx14 = _emscripten_realloc_async_context(8) | 0; //@line 8680
 _wait_ms(150); //@line 8681
 if (___async) {
  HEAP32[$ReallocAsyncCtx14 >> 2] = 9; //@line 8684
  $4 = $ReallocAsyncCtx14 + 4 | 0; //@line 8685
  HEAP32[$4 >> 2] = $2; //@line 8686
  sp = STACKTOP; //@line 8687
  return;
 }
 ___async_unwind = 0; //@line 8690
 HEAP32[$ReallocAsyncCtx14 >> 2] = 9; //@line 8691
 $4 = $ReallocAsyncCtx14 + 4 | 0; //@line 8692
 HEAP32[$4 >> 2] = $2; //@line 8693
 sp = STACKTOP; //@line 8694
 return;
}
function _mbed_die__async_cb($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx16 = 0, sp = 0;
 sp = STACKTOP; //@line 8325
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 8327
 _emscripten_asm_const_iii(0, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 8329
 $ReallocAsyncCtx16 = _emscripten_realloc_async_context(8) | 0; //@line 8330
 _wait_ms(150); //@line 8331
 if (___async) {
  HEAP32[$ReallocAsyncCtx16 >> 2] = 7; //@line 8334
  $4 = $ReallocAsyncCtx16 + 4 | 0; //@line 8335
  HEAP32[$4 >> 2] = $2; //@line 8336
  sp = STACKTOP; //@line 8337
  return;
 }
 ___async_unwind = 0; //@line 8340
 HEAP32[$ReallocAsyncCtx16 >> 2] = 7; //@line 8341
 $4 = $ReallocAsyncCtx16 + 4 | 0; //@line 8342
 HEAP32[$4 >> 2] = $2; //@line 8343
 sp = STACKTOP; //@line 8344
 return;
}
function _mbed_die__async_cb_12($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx9 = 0, sp = 0;
 sp = STACKTOP; //@line 8550
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 8552
 _emscripten_asm_const_iii(0, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 8554
 $ReallocAsyncCtx9 = _emscripten_realloc_async_context(8) | 0; //@line 8555
 _wait_ms(150); //@line 8556
 if (___async) {
  HEAP32[$ReallocAsyncCtx9 >> 2] = 14; //@line 8559
  $4 = $ReallocAsyncCtx9 + 4 | 0; //@line 8560
  HEAP32[$4 >> 2] = $2; //@line 8561
  sp = STACKTOP; //@line 8562
  return;
 }
 ___async_unwind = 0; //@line 8565
 HEAP32[$ReallocAsyncCtx9 >> 2] = 14; //@line 8566
 $4 = $ReallocAsyncCtx9 + 4 | 0; //@line 8567
 HEAP32[$4 >> 2] = $2; //@line 8568
 sp = STACKTOP; //@line 8569
 return;
}
function _mbed_die__async_cb_11($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx8 = 0, sp = 0;
 sp = STACKTOP; //@line 8525
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 8527
 _emscripten_asm_const_iii(0, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 8529
 $ReallocAsyncCtx8 = _emscripten_realloc_async_context(8) | 0; //@line 8530
 _wait_ms(400); //@line 8531
 if (___async) {
  HEAP32[$ReallocAsyncCtx8 >> 2] = 15; //@line 8534
  $4 = $ReallocAsyncCtx8 + 4 | 0; //@line 8535
  HEAP32[$4 >> 2] = $2; //@line 8536
  sp = STACKTOP; //@line 8537
  return;
 }
 ___async_unwind = 0; //@line 8540
 HEAP32[$ReallocAsyncCtx8 >> 2] = 15; //@line 8541
 $4 = $ReallocAsyncCtx8 + 4 | 0; //@line 8542
 HEAP32[$4 >> 2] = $2; //@line 8543
 sp = STACKTOP; //@line 8544
 return;
}
function _mbed_die__async_cb_10($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx7 = 0, sp = 0;
 sp = STACKTOP; //@line 8500
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 8502
 _emscripten_asm_const_iii(0, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 8504
 $ReallocAsyncCtx7 = _emscripten_realloc_async_context(8) | 0; //@line 8505
 _wait_ms(400); //@line 8506
 if (___async) {
  HEAP32[$ReallocAsyncCtx7 >> 2] = 16; //@line 8509
  $4 = $ReallocAsyncCtx7 + 4 | 0; //@line 8510
  HEAP32[$4 >> 2] = $2; //@line 8511
  sp = STACKTOP; //@line 8512
  return;
 }
 ___async_unwind = 0; //@line 8515
 HEAP32[$ReallocAsyncCtx7 >> 2] = 16; //@line 8516
 $4 = $ReallocAsyncCtx7 + 4 | 0; //@line 8517
 HEAP32[$4 >> 2] = $2; //@line 8518
 sp = STACKTOP; //@line 8519
 return;
}
function _mbed_die__async_cb_9($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx6 = 0, sp = 0;
 sp = STACKTOP; //@line 8475
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 8477
 _emscripten_asm_const_iii(0, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 8479
 $ReallocAsyncCtx6 = _emscripten_realloc_async_context(8) | 0; //@line 8480
 _wait_ms(400); //@line 8481
 if (___async) {
  HEAP32[$ReallocAsyncCtx6 >> 2] = 17; //@line 8484
  $4 = $ReallocAsyncCtx6 + 4 | 0; //@line 8485
  HEAP32[$4 >> 2] = $2; //@line 8486
  sp = STACKTOP; //@line 8487
  return;
 }
 ___async_unwind = 0; //@line 8490
 HEAP32[$ReallocAsyncCtx6 >> 2] = 17; //@line 8491
 $4 = $ReallocAsyncCtx6 + 4 | 0; //@line 8492
 HEAP32[$4 >> 2] = $2; //@line 8493
 sp = STACKTOP; //@line 8494
 return;
}
function _mbed_die__async_cb_8($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx5 = 0, sp = 0;
 sp = STACKTOP; //@line 8450
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 8452
 _emscripten_asm_const_iii(0, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 8454
 $ReallocAsyncCtx5 = _emscripten_realloc_async_context(8) | 0; //@line 8455
 _wait_ms(400); //@line 8456
 if (___async) {
  HEAP32[$ReallocAsyncCtx5 >> 2] = 18; //@line 8459
  $4 = $ReallocAsyncCtx5 + 4 | 0; //@line 8460
  HEAP32[$4 >> 2] = $2; //@line 8461
  sp = STACKTOP; //@line 8462
  return;
 }
 ___async_unwind = 0; //@line 8465
 HEAP32[$ReallocAsyncCtx5 >> 2] = 18; //@line 8466
 $4 = $ReallocAsyncCtx5 + 4 | 0; //@line 8467
 HEAP32[$4 >> 2] = $2; //@line 8468
 sp = STACKTOP; //@line 8469
 return;
}
function _mbed_die__async_cb_7($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx4 = 0, sp = 0;
 sp = STACKTOP; //@line 8425
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 8427
 _emscripten_asm_const_iii(0, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 8429
 $ReallocAsyncCtx4 = _emscripten_realloc_async_context(8) | 0; //@line 8430
 _wait_ms(400); //@line 8431
 if (___async) {
  HEAP32[$ReallocAsyncCtx4 >> 2] = 19; //@line 8434
  $4 = $ReallocAsyncCtx4 + 4 | 0; //@line 8435
  HEAP32[$4 >> 2] = $2; //@line 8436
  sp = STACKTOP; //@line 8437
  return;
 }
 ___async_unwind = 0; //@line 8440
 HEAP32[$ReallocAsyncCtx4 >> 2] = 19; //@line 8441
 $4 = $ReallocAsyncCtx4 + 4 | 0; //@line 8442
 HEAP32[$4 >> 2] = $2; //@line 8443
 sp = STACKTOP; //@line 8444
 return;
}
function _mbed_die__async_cb_6($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 8400
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 8402
 _emscripten_asm_const_iii(0, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 8404
 $ReallocAsyncCtx3 = _emscripten_realloc_async_context(8) | 0; //@line 8405
 _wait_ms(400); //@line 8406
 if (___async) {
  HEAP32[$ReallocAsyncCtx3 >> 2] = 20; //@line 8409
  $4 = $ReallocAsyncCtx3 + 4 | 0; //@line 8410
  HEAP32[$4 >> 2] = $2; //@line 8411
  sp = STACKTOP; //@line 8412
  return;
 }
 ___async_unwind = 0; //@line 8415
 HEAP32[$ReallocAsyncCtx3 >> 2] = 20; //@line 8416
 $4 = $ReallocAsyncCtx3 + 4 | 0; //@line 8417
 HEAP32[$4 >> 2] = $2; //@line 8418
 sp = STACKTOP; //@line 8419
 return;
}
function _mbed_die__async_cb_5($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 8375
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 8377
 _emscripten_asm_const_iii(0, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 8379
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(8) | 0; //@line 8380
 _wait_ms(400); //@line 8381
 if (___async) {
  HEAP32[$ReallocAsyncCtx2 >> 2] = 21; //@line 8384
  $4 = $ReallocAsyncCtx2 + 4 | 0; //@line 8385
  HEAP32[$4 >> 2] = $2; //@line 8386
  sp = STACKTOP; //@line 8387
  return;
 }
 ___async_unwind = 0; //@line 8390
 HEAP32[$ReallocAsyncCtx2 >> 2] = 21; //@line 8391
 $4 = $ReallocAsyncCtx2 + 4 | 0; //@line 8392
 HEAP32[$4 >> 2] = $2; //@line 8393
 sp = STACKTOP; //@line 8394
 return;
}
function _mbed_die__async_cb_4($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 8350
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 8352
 _emscripten_asm_const_iii(0, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 8354
 $ReallocAsyncCtx = _emscripten_realloc_async_context(8) | 0; //@line 8355
 _wait_ms(400); //@line 8356
 if (___async) {
  HEAP32[$ReallocAsyncCtx >> 2] = 22; //@line 8359
  $4 = $ReallocAsyncCtx + 4 | 0; //@line 8360
  HEAP32[$4 >> 2] = $2; //@line 8361
  sp = STACKTOP; //@line 8362
  return;
 }
 ___async_unwind = 0; //@line 8365
 HEAP32[$ReallocAsyncCtx >> 2] = 22; //@line 8366
 $4 = $ReallocAsyncCtx + 4 | 0; //@line 8367
 HEAP32[$4 >> 2] = $2; //@line 8368
 sp = STACKTOP; //@line 8369
 return;
}
function _sbrk(increment) {
 increment = increment | 0;
 var oldDynamicTop = 0, newDynamicTop = 0;
 oldDynamicTop = HEAP32[DYNAMICTOP_PTR >> 2] | 0; //@line 9253
 newDynamicTop = oldDynamicTop + increment | 0; //@line 9254
 if ((increment | 0) > 0 & (newDynamicTop | 0) < (oldDynamicTop | 0) | (newDynamicTop | 0) < 0) {
  abortOnCannotGrowMemory() | 0; //@line 9258
  ___setErrNo(12); //@line 9259
  return -1;
 }
 HEAP32[DYNAMICTOP_PTR >> 2] = newDynamicTop; //@line 9263
 if ((newDynamicTop | 0) > (getTotalMemory() | 0)) {
  if (!(enlargeMemory() | 0)) {
   HEAP32[DYNAMICTOP_PTR >> 2] = oldDynamicTop; //@line 9267
   ___setErrNo(12); //@line 9268
   return -1;
  }
 }
 return oldDynamicTop | 0; //@line 9272
}
function _fmt_x($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $$05$lcssa = 0, $$056 = 0, $14 = 0, $15 = 0, $8 = 0;
 if (($0 | 0) == 0 & ($1 | 0) == 0) {
  $$05$lcssa = $2; //@line 5781
 } else {
  $$056 = $2; //@line 5783
  $15 = $1; //@line 5783
  $8 = $0; //@line 5783
  while (1) {
   $14 = $$056 + -1 | 0; //@line 5791
   HEAP8[$14 >> 0] = HEAPU8[1377 + ($8 & 15) >> 0] | 0 | $3; //@line 5792
   $8 = _bitshift64Lshr($8 | 0, $15 | 0, 4) | 0; //@line 5793
   $15 = tempRet0; //@line 5794
   if (($8 | 0) == 0 & ($15 | 0) == 0) {
    $$05$lcssa = $14; //@line 5799
    break;
   } else {
    $$056 = $14; //@line 5802
   }
  }
 }
 return $$05$lcssa | 0; //@line 5806
}
function ___stdout_write($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $14 = 0, $vararg_buffer = 0, sp = 0;
 sp = STACKTOP; //@line 3919
 STACKTOP = STACKTOP + 32 | 0; //@line 3920
 $vararg_buffer = sp; //@line 3921
 HEAP32[$0 + 36 >> 2] = 4; //@line 3924
 if (!(HEAP32[$0 >> 2] & 64)) {
  HEAP32[$vararg_buffer >> 2] = HEAP32[$0 + 60 >> 2]; //@line 3932
  HEAP32[$vararg_buffer + 4 >> 2] = 21523; //@line 3934
  HEAP32[$vararg_buffer + 8 >> 2] = sp + 16; //@line 3936
  if (___syscall54(54, $vararg_buffer | 0) | 0) {
   HEAP8[$0 + 75 >> 0] = -1; //@line 3941
  }
 }
 $14 = ___stdio_write($0, $1, $2) | 0; //@line 3944
 STACKTOP = sp; //@line 3945
 return $14 | 0; //@line 3945
}
function ___towrite($0) {
 $0 = $0 | 0;
 var $$0 = 0, $1 = 0, $14 = 0, $3 = 0, $7 = 0;
 $1 = $0 + 74 | 0; //@line 4014
 $3 = HEAP8[$1 >> 0] | 0; //@line 4016
 HEAP8[$1 >> 0] = $3 + 255 | $3; //@line 4020
 $7 = HEAP32[$0 >> 2] | 0; //@line 4021
 if (!($7 & 8)) {
  HEAP32[$0 + 8 >> 2] = 0; //@line 4026
  HEAP32[$0 + 4 >> 2] = 0; //@line 4028
  $14 = HEAP32[$0 + 44 >> 2] | 0; //@line 4030
  HEAP32[$0 + 28 >> 2] = $14; //@line 4032
  HEAP32[$0 + 20 >> 2] = $14; //@line 4034
  HEAP32[$0 + 16 >> 2] = $14 + (HEAP32[$0 + 48 >> 2] | 0); //@line 4040
  $$0 = 0; //@line 4041
 } else {
  HEAP32[$0 >> 2] = $7 | 32; //@line 4044
  $$0 = -1; //@line 4045
 }
 return $$0 | 0; //@line 4047
}
function _fmt_o($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$0$lcssa = 0, $$06 = 0, $10 = 0, $11 = 0, $7 = 0;
 if (($0 | 0) == 0 & ($1 | 0) == 0) {
  $$0$lcssa = $2; //@line 5818
 } else {
  $$06 = $2; //@line 5820
  $11 = $1; //@line 5820
  $7 = $0; //@line 5820
  while (1) {
   $10 = $$06 + -1 | 0; //@line 5825
   HEAP8[$10 >> 0] = $7 & 7 | 48; //@line 5826
   $7 = _bitshift64Lshr($7 | 0, $11 | 0, 3) | 0; //@line 5827
   $11 = tempRet0; //@line 5828
   if (($7 | 0) == 0 & ($11 | 0) == 0) {
    $$0$lcssa = $10; //@line 5833
    break;
   } else {
    $$06 = $10; //@line 5836
   }
  }
 }
 return $$0$lcssa | 0; //@line 5840
}
function ___cxa_is_pointer_type($0) {
 $0 = $0 | 0;
 var $2 = 0, $3 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 7924
 do {
  if (!$0) {
   $3 = 0; //@line 7928
  } else {
   $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 7930
   $2 = ___dynamic_cast($0, 24, 80, 0) | 0; //@line 7931
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 39; //@line 7934
    sp = STACKTOP; //@line 7935
    return 0; //@line 7936
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 7938
    $3 = ($2 | 0) != 0 & 1; //@line 7941
    break;
   }
  }
 } while (0);
 return $3 | 0; //@line 7946
}
function _invoke_ticker__async_cb_19($0) {
 $0 = $0 | 0;
 var $5 = 0, $6 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 8765
 $5 = HEAP32[HEAP32[HEAP32[$0 + 4 >> 2] >> 2] >> 2] | 0; //@line 8771
 $6 = HEAP32[$0 + 8 >> 2] | 0; //@line 8772
 $ReallocAsyncCtx = _emscripten_realloc_async_context(4) | 0; //@line 8773
 FUNCTION_TABLE_vi[$5 & 63]($6); //@line 8774
 if (___async) {
  HEAP32[$ReallocAsyncCtx >> 2] = 24; //@line 8777
  sp = STACKTOP; //@line 8778
  return;
 }
 ___async_unwind = 0; //@line 8781
 HEAP32[$ReallocAsyncCtx >> 2] = 24; //@line 8782
 sp = STACKTOP; //@line 8783
 return;
}
function _getint_671($0) {
 $0 = $0 | 0;
 var $$0$lcssa = 0, $$04 = 0, $11 = 0, $12 = 0, $7 = 0;
 if (!(_isdigit(HEAP8[HEAP32[$0 >> 2] >> 0] | 0) | 0)) {
  $$0$lcssa = 0; //@line 5462
 } else {
  $$04 = 0; //@line 5464
  while (1) {
   $7 = HEAP32[$0 >> 2] | 0; //@line 5467
   $11 = ($$04 * 10 | 0) + -48 + (HEAP8[$7 >> 0] | 0) | 0; //@line 5471
   $12 = $7 + 1 | 0; //@line 5472
   HEAP32[$0 >> 2] = $12; //@line 5473
   if (!(_isdigit(HEAP8[$12 >> 0] | 0) | 0)) {
    $$0$lcssa = $11; //@line 5479
    break;
   } else {
    $$04 = $11; //@line 5482
   }
  }
 }
 return $$0$lcssa | 0; //@line 5486
}
function _emscripten_async_resume() {
 ___async = 0; //@line 9104
 ___async_unwind = 1; //@line 9105
 while (1) {
  if (!___async_cur_frame) return;
  dynCall_vi(HEAP32[___async_cur_frame + 8 >> 2] | 0, ___async_cur_frame + 8 | 0); //@line 9111
  if (___async) return;
  if (!___async_unwind) {
   ___async_unwind = 1; //@line 9115
   continue;
  }
  stackRestore(HEAP32[___async_cur_frame + 4 >> 2] | 0); //@line 9119
  ___async_cur_frame = HEAP32[___async_cur_frame >> 2] | 0; //@line 9121
 }
}
function ___uremdi3($a$0, $a$1, $b$0, $b$1) {
 $a$0 = $a$0 | 0;
 $a$1 = $a$1 | 0;
 $b$0 = $b$0 | 0;
 $b$1 = $b$1 | 0;
 var $rem = 0, __stackBase__ = 0;
 __stackBase__ = STACKTOP; //@line 9047
 STACKTOP = STACKTOP + 16 | 0; //@line 9048
 $rem = __stackBase__ | 0; //@line 9049
 ___udivmoddi4($a$0, $a$1, $b$0, $b$1, $rem) | 0; //@line 9050
 STACKTOP = __stackBase__; //@line 9051
 return (tempRet0 = HEAP32[$rem + 4 >> 2] | 0, HEAP32[$rem >> 2] | 0) | 0; //@line 9052
}
function _llvm_cttz_i32(x) {
 x = x | 0;
 var ret = 0;
 ret = HEAP8[cttz_i8 + (x & 255) >> 0] | 0; //@line 8817
 if ((ret | 0) < 8) return ret | 0; //@line 8818
 ret = HEAP8[cttz_i8 + (x >> 8 & 255) >> 0] | 0; //@line 8819
 if ((ret | 0) < 8) return ret + 8 | 0; //@line 8820
 ret = HEAP8[cttz_i8 + (x >> 16 & 255) >> 0] | 0; //@line 8821
 if ((ret | 0) < 8) return ret + 16 | 0; //@line 8822
 return (HEAP8[cttz_i8 + (x >>> 24) >> 0] | 0) + 24 | 0; //@line 8823
}
function __ZNK10__cxxabiv117__class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($0, $1, $2, $3, $4, $5) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 $5 = $5 | 0;
 if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, $5) | 0) {
  __ZNK10__cxxabiv117__class_type_info29process_static_type_above_dstEPNS_19__dynamic_cast_infoEPKvS4_i(0, $1, $2, $3, $4); //@line 7309
 }
 return;
}
function __ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv__async_cb($0) {
 $0 = $0 | 0;
 var $$0 = 0, $2 = 0;
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 8011
 if ((HEAP32[$2 + 24 >> 2] | 0) == 1) {
  HEAP32[HEAP32[$0 + 8 >> 2] >> 2] = HEAP32[$2 + 16 >> 2]; //@line 8022
  $$0 = 1; //@line 8023
 } else {
  $$0 = 0; //@line 8025
 }
 HEAP8[___async_retval >> 0] = $$0 & 1; //@line 8029
 return;
}
function ___stdio_close($0) {
 $0 = $0 | 0;
 var $5 = 0, $vararg_buffer = 0, sp = 0;
 sp = STACKTOP; //@line 3730
 STACKTOP = STACKTOP + 16 | 0; //@line 3731
 $vararg_buffer = sp; //@line 3732
 HEAP32[$vararg_buffer >> 2] = _dummy(HEAP32[$0 + 60 >> 2] | 0) | 0; //@line 3736
 $5 = ___syscall_ret(___syscall6(6, $vararg_buffer | 0) | 0) | 0; //@line 3738
 STACKTOP = sp; //@line 3739
 return $5 | 0; //@line 3739
}
function _wait($0) {
 $0 = +$0;
 var $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 495
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 499
 _emscripten_sleep((~~($0 * 1.0e6) | 0) / 1e3 | 0 | 0); //@line 500
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 25; //@line 503
  sp = STACKTOP; //@line 504
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 507
  return;
 }
}
function __ZNK10__cxxabiv117__class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, 0) | 0) {
  __ZNK10__cxxabiv117__class_type_info24process_found_base_classEPNS_19__dynamic_cast_infoEPvi(0, $1, $2, $3); //@line 7385
 }
 return;
}
function _wait_ms($0) {
 $0 = $0 | 0;
 var $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 514
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 515
 _emscripten_sleep($0 | 0); //@line 516
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 26; //@line 519
  sp = STACKTOP; //@line 520
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 523
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
  $7 = $1 + 28 | 0; //@line 7449
  if ((HEAP32[$7 >> 2] | 0) != 1) {
   HEAP32[$7 >> 2] = $3; //@line 7453
  }
 }
 return;
}
function _emscripten_alloc_async_context(len, sp) {
 len = len | 0;
 sp = sp | 0;
 var new_frame = 0;
 new_frame = stackAlloc(len + 8 | 0) | 0; //@line 9081
 HEAP32[new_frame + 4 >> 2] = sp; //@line 9083
 HEAP32[new_frame >> 2] = ___async_cur_frame; //@line 9085
 ___async_cur_frame = new_frame; //@line 9086
 return ___async_cur_frame + 8 | 0; //@line 9087
}
function ___cxa_can_catch__async_cb($0) {
 $0 = $0 | 0;
 var $AsyncRetVal = 0;
 $AsyncRetVal = HEAP8[___async_retval >> 0] & 1; //@line 8746
 if ($AsyncRetVal) {
  HEAP32[HEAP32[$0 + 8 >> 2] >> 2] = HEAP32[HEAP32[$0 + 4 >> 2] >> 2]; //@line 8750
 }
 HEAP32[___async_retval >> 2] = $AsyncRetVal & 1; //@line 8753
 return;
}
function _bitshift64Shl(low, high, bits) {
 low = low | 0;
 high = high | 0;
 bits = bits | 0;
 if ((bits | 0) < 32) {
  tempRet0 = high << bits | (low & (1 << bits) - 1 << 32 - bits) >>> 32 - bits; //@line 9070
  return low << bits; //@line 9071
 }
 tempRet0 = low << bits - 32; //@line 9073
 return 0; //@line 9074
}
function _bitshift64Lshr(low, high, bits) {
 low = low | 0;
 high = high | 0;
 bits = bits | 0;
 if ((bits | 0) < 32) {
  tempRet0 = high >>> bits; //@line 9059
  return low >>> bits | (high & (1 << bits) - 1) << 32 - bits; //@line 9060
 }
 tempRet0 = 0; //@line 9062
 return high >>> bits - 32 | 0; //@line 9063
}
function ___lctrans_impl($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0 = 0;
 if (!$1) {
  $$0 = 0; //@line 4144
 } else {
  $$0 = ___mo_lookup(HEAP32[$1 >> 2] | 0, HEAP32[$1 + 4 >> 2] | 0, $0) | 0; //@line 4150
 }
 return ($$0 | 0 ? $$0 : $0) | 0; //@line 4154
}
function dynCall_viiiiii(index, a1, a2, a3, a4, a5, a6) {
 index = index | 0;
 a1 = a1 | 0;
 a2 = a2 | 0;
 a3 = a3 | 0;
 a4 = a4 | 0;
 a5 = a5 | 0;
 a6 = a6 | 0;
 FUNCTION_TABLE_viiiiii[index & 3](a1 | 0, a2 | 0, a3 | 0, a4 | 0, a5 | 0, a6 | 0); //@line 9314
}
function ___DOUBLE_BITS_677($0) {
 $0 = +$0;
 var $1 = 0;
 HEAPF64[tempDoublePtr >> 3] = $0; //@line 6903
 $1 = HEAP32[tempDoublePtr >> 2] | 0; //@line 6903
 tempRet0 = HEAP32[tempDoublePtr + 4 >> 2] | 0; //@line 6905
 return $1 | 0; //@line 6906
}
function ___syscall_ret($0) {
 $0 = $0 | 0;
 var $$0 = 0;
 if ($0 >>> 0 > 4294963200) {
  HEAP32[(___errno_location() | 0) >> 2] = 0 - $0; //@line 3896
  $$0 = -1; //@line 3897
 } else {
  $$0 = $0; //@line 3899
 }
 return $$0 | 0; //@line 3901
}
function _gpio_init_out($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 HEAP32[$0 >> 2] = $1; //@line 390
 if (($1 | 0) == -1) {
  return;
 }
 HEAP32[$0 + 4 >> 2] = $1; //@line 396
 _emscripten_asm_const_iii(1, $0 | 0, $1 | 0) | 0; //@line 397
 return;
}
function _i64Subtract(a, b, c, d) {
 a = a | 0;
 b = b | 0;
 c = c | 0;
 d = d | 0;
 var h = 0;
 h = b - d >>> 0; //@line 8810
 h = b - d - (c >>> 0 > a >>> 0 | 0) >>> 0; //@line 8811
 return (tempRet0 = h, a - c >>> 0 | 0) | 0; //@line 8812
}
function runPostSets() {}
function _i64Add(a, b, c, d) {
 a = a | 0;
 b = b | 0;
 c = c | 0;
 d = d | 0;
 var l = 0;
 l = a + c >>> 0; //@line 8802
 return (tempRet0 = b + d + (l >>> 0 < a >>> 0 | 0) >>> 0, l | 0) | 0; //@line 8804
}
function dynCall_viiiii(index, a1, a2, a3, a4, a5) {
 index = index | 0;
 a1 = a1 | 0;
 a2 = a2 | 0;
 a3 = a3 | 0;
 a4 = a4 | 0;
 a5 = a5 | 0;
 FUNCTION_TABLE_viiiii[index & 3](a1 | 0, a2 | 0, a3 | 0, a4 | 0, a5 | 0); //@line 9307
}
function dynCall_viiii(index, a1, a2, a3, a4) {
 index = index | 0;
 a1 = a1 | 0;
 a2 = a2 | 0;
 a3 = a3 | 0;
 a4 = a4 | 0;
 FUNCTION_TABLE_viiii[index & 3](a1 | 0, a2 | 0, a3 | 0, a4 | 0); //@line 9300
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
  $$0 = 0; //@line 5963
 } else {
  $$0 = _wcrtomb($0, $1, 0) | 0; //@line 5966
 }
 return $$0 | 0; //@line 5968
}
function _emscripten_free_async_context(ctx) {
 ctx = ctx | 0;
 stackRestore(___async_cur_frame | 0); //@line 9093
 ___async_cur_frame = HEAP32[___async_cur_frame >> 2] | 0; //@line 9094
}
function dynCall_iiii(index, a1, a2, a3) {
 index = index | 0;
 a1 = a1 | 0;
 a2 = a2 | 0;
 a3 = a3 | 0;
 return FUNCTION_TABLE_iiii[index & 7](a1 | 0, a2 | 0, a3 | 0) | 0; //@line 9286
}
function ___udivdi3($a$0, $a$1, $b$0, $b$1) {
 $a$0 = $a$0 | 0;
 $a$1 = $a$1 | 0;
 $b$0 = $b$0 | 0;
 $b$1 = $b$1 | 0;
 return ___udivmoddi4($a$0, $a$1, $b$0, $b$1, 0) | 0; //@line 9039
}
function ___dynamic_cast__async_cb($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = (HEAP32[HEAP32[$0 + 4 >> 2] >> 2] | 0) == 1 ? HEAP32[$0 + 8 >> 2] | 0 : 0; //@line 8178
 return;
}
function _emscripten_realloc_async_context(len) {
 len = len | 0;
 stackRestore(___async_cur_frame | 0); //@line 9099
 return (stackAlloc(len + 8 | 0) | 0) + 8 | 0; //@line 9100
}
function _pwmout_init($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 HEAP32[$0 >> 2] = $1; //@line 412
 _emscripten_asm_const_iiiii(2, $0 | 0, $1 | 0, 20, 0) | 0; //@line 413
 return;
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
 $3 = _llvm_bswap_i32($0 | 0) | 0; //@line 4280
 return (($1 | 0) == 0 ? $0 : $3) | 0; //@line 4282
}
function __ZN10__cxxabiv120__si_class_type_infoD0Ev($0) {
 $0 = $0 | 0;
 __ZN10__cxxabiv116__shim_type_infoD2Ev($0); //@line 7671
 __ZdlPv($0); //@line 7672
 return;
}
function __ZN10__cxxabiv117__class_type_infoD0Ev($0) {
 $0 = $0 | 0;
 __ZN10__cxxabiv116__shim_type_infoD2Ev($0); //@line 7199
 __ZdlPv($0); //@line 7200
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
  ___fwritex($1, $2, $0) | 0; //@line 5448
 }
 return;
}
function ___cxa_is_pointer_type__async_cb($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = (HEAP32[___async_retval >> 2] | 0) != 0 & 1; //@line 8259
 return;
}
function __ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 return ($0 | 0) == ($1 | 0) | 0; //@line 7396
}
function _pwmout_write($0, $1) {
 $0 = $0 | 0;
 $1 = +$1;
 _emscripten_asm_const_iii(0, HEAP32[$0 >> 2] | 0, ~~($1 * 1024.0) | 0) | 0; //@line 424
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
 abort(5); //@line 9333
}
function _llvm_bswap_i32(x) {
 x = x | 0;
 return (x & 255) << 24 | (x >> 8 & 255) << 16 | (x >> 16 & 255) << 8 | x >>> 24 | 0; //@line 9126
}
function __ZNK10__cxxabiv120__si_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function __ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_2($0) {
 $0 = $0 | 0;
 return;
}
function _strerror($0) {
 $0 = $0 | 0;
 return ___strerror_l($0, HEAP32[(___pthread_self_85() | 0) + 188 >> 2] | 0) | 0; //@line 5911
}
function _printf__async_cb($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = HEAP32[___async_retval >> 2]; //@line 8155
 return;
}
function dynCall_ii(index, a1) {
 index = index | 0;
 a1 = a1 | 0;
 return FUNCTION_TABLE_ii[index & 1](a1 | 0) | 0; //@line 9279
}
function b4(p0, p1, p2, p3, p4) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 p3 = p3 | 0;
 p4 = p4 | 0;
 abort(4); //@line 9330
}
function _pwmout_read($0) {
 $0 = $0 | 0;
 return +(+(_emscripten_asm_const_ii(3, HEAP32[$0 >> 2] | 0) | 0) * .0009765625);
}
function dynCall_vi(index, a1) {
 index = index | 0;
 a1 = a1 | 0;
 FUNCTION_TABLE_vi[index & 63](a1 | 0); //@line 9293
}
function b1(p0, p1, p2) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 abort(1); //@line 9321
 return 0; //@line 9321
}
function __GLOBAL__sub_I_main_cpp() {
 HEAP8[3484] = 0; //@line 530
 _pwmout_init(3480, 9); //@line 531
 return;
}
function b3(p0, p1, p2, p3) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 p3 = p3 | 0;
 abort(3); //@line 9327
}
function ___lctrans($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 return ___lctrans_impl($0, $1) | 0; //@line 7156
}
function _mbed_error_printf($0, $varargs) {
 $0 = $0 | 0;
 $varargs = $varargs | 0;
 return;
}
function _isdigit($0) {
 $0 = $0 | 0;
 return ($0 + -48 | 0) >>> 0 < 10 | 0; //@line 3954
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
 abort(0); //@line 9318
 return 0; //@line 9318
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
 return _pthread_self() | 0; //@line 7077
}
function ___pthread_self_85() {
 return _pthread_self() | 0; //@line 7083
}
function stackRestore(top) {
 top = top | 0;
 STACKTOP = top; //@line 15
}
function __ZdlPv($0) {
 $0 = $0 | 0;
 _free($0); //@line 7186
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
 return $0 | 0; //@line 3912
}
function ___lockfile($0) {
 $0 = $0 | 0;
 return 0; //@line 4007
}
function _invoke_ticker__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function _sleep_manager_lock_deep_sleep_internal() {
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
 return 4048; //@line 3906
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
 abort(2); //@line 9324
}
function _core_util_critical_section_enter() {
 return;
}
function _core_util_critical_section_exit() {
 return;
}
function _wait__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function _pthread_self() {
 return 224; //@line 3959
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
var FUNCTION_TABLE_vi = [b2,__ZN10__cxxabiv116__shim_type_infoD2Ev,__ZN10__cxxabiv117__class_type_infoD0Ev,__ZNK10__cxxabiv116__shim_type_info5noop1Ev,__ZNK10__cxxabiv116__shim_type_info5noop2Ev,__ZN10__cxxabiv120__si_class_type_infoD0Ev,_mbed_assert_internal__async_cb,_mbed_die__async_cb_18,_mbed_die__async_cb_17,_mbed_die__async_cb_16,_mbed_die__async_cb_15,_mbed_die__async_cb_14,_mbed_die__async_cb_13,_mbed_die__async_cb_12,_mbed_die__async_cb_11,_mbed_die__async_cb_10,_mbed_die__async_cb_9,_mbed_die__async_cb_8,_mbed_die__async_cb_7,_mbed_die__async_cb_6,_mbed_die__async_cb_5,_mbed_die__async_cb_4,_mbed_die__async_cb,_invoke_ticker__async_cb_19,_invoke_ticker__async_cb,_wait__async_cb,_wait_ms__async_cb,_main__async_cb,_vfprintf__async_cb
,_printf__async_cb,__ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv__async_cb_1,__ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv__async_cb,___dynamic_cast__async_cb,___dynamic_cast__async_cb_3,__ZNK10__cxxabiv120__si_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb,__ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb,__ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_2,__ZNK10__cxxabiv120__si_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb,___cxa_can_catch__async_cb,___cxa_is_pointer_type__async_cb,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2
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






//# sourceMappingURL=pwmout.js.map